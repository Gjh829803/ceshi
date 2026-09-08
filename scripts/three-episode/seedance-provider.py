"""Seedance transport utilities. Credentials and signed URLs are never journaled."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
from datetime import datetime, timezone
from urllib.parse import urlparse


def now():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def regular(path):
    path = Path(path).absolute()
    if not path.is_file() or path.is_symlink() or path.resolve() != path:
        raise ValueError('SEEDANCE_REGULAR_FILE_REQUIRED')
    return path


def write_json_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f'.{os.getpid()}.{threading.get_ident()}.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)


def sanitize_text(value):
    text = str(value)
    text = re.sub(r'https?://[^\s\"\'<>]+', '[redacted-url]', text)
    text = re.sub(r'(?i)(bearer\s+)[^\s\"\']+', r'\1[redacted]', text)
    return text[:1600]


def headers(key):
    return {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}


def safe_response(response):
    # Provider messages can echo signed inputs. Status is sufficient for fencing.
    return f'HTTP {response.status_code}'


def load_api_key(_config=None):
    direct, file = os.environ.get('SEEDANCE_API_KEY'), os.environ.get('SEEDANCE_API_KEY_FILE')
    if bool(direct) == bool(file):
        raise ValueError('SET_EXACTLY_ONE_SEEDANCE_API_KEY_SOURCE')
    # Kubernetes Secret mounts may use symlinked files; this path is operator supplied.
    key = direct if direct else Path(file).read_text(encoding='utf-8')
    if not key.strip() or '\n' in key.strip() or '\r' in key.strip():
        raise ValueError('INVALID_SEEDANCE_API_KEY')
    return key.strip()


def validate_config(config):
    if config.get('kind') != 'three-episode-seedance-provider' or config.get('schemaVersion') != 1:
        raise ValueError('SEEDANCE_PROVIDER_CONFIG_INVALID')
    if set(config) - {'kind', 'schemaVersion', 'apiBaseUrl', 'modelEndpoint', 'referenceUpload', 'allowFrameNormalization'}:
        raise ValueError('SEEDANCE_PROVIDER_CONFIG_FIELDS_INVALID')
    if type(config.get('allowFrameNormalization', False)) is not bool:
        raise ValueError('SEEDANCE_NORMALIZATION_PERMISSION_INVALID')
    uri = urlparse(config['apiBaseUrl'])
    if uri.scheme != 'https' or not uri.hostname or uri.username or uri.password or uri.query or uri.fragment:
        raise ValueError('SEEDANCE_HTTPS_ENDPOINT_REQUIRED')
    if not isinstance(config['modelEndpoint'], str) or not config['modelEndpoint'].strip():
        raise ValueError('SEEDANCE_MODEL_REQUIRED')
    upload = config['referenceUpload']
    if set(upload) != {'bucket', 'prefix', 'region', 'presignSeconds'}:
        raise ValueError('SEEDANCE_REFERENCE_UPLOAD_CONFIG_INVALID')
    s3_location(f"s3://{upload['bucket']}/{upload['prefix']}")
    if not re.fullmatch(r'[a-z0-9-]+', upload['region']) or type(upload['presignSeconds']) is not int or not 60 <= upload['presignSeconds'] <= 604800:
        raise ValueError('SEEDANCE_REFERENCE_UPLOAD_CONFIG_INVALID')
    return config


def probe_video(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
        'stream=codec_type,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', str(path)],
        check=True, capture_output=True, text=True, timeout=120)
    value = json.loads(result.stdout)
    video = next(row for row in value['streams'] if row.get('codec_type') == 'video')
    numerator, denominator = map(int, video['avg_frame_rate'].split('/'))
    return dict(width=video['width'], height=video['height'], fps=numerator / denominator,
        frameCount=int(video['nb_read_frames']), durationSeconds=float(value['format']['duration']),
        hasAudio=any(row.get('codec_type') == 'audio' for row in value['streams']))


def s3_location(uri):
    match = re.fullmatch(r's3://([a-z0-9][a-z0-9.-]+)/([^?#]+)', uri)
    if not match or any(part in {'', '.', '..'} for part in match[2].strip('/').split('/')):
        raise ValueError('SEEDANCE_S3_URI_INVALID')
    return match[1], match[2].rstrip('/')


def missing(error):
    return getattr(error, 'response', {}).get('Error', {}).get('Code') in {'404', 'NoSuchKey', 'NotFound'}


class CloudStorage:
    def __init__(self, config, journal_prefix, queue_prefix, client=None):
        self.config = config
        self.journal_bucket, self.journal_prefix = s3_location(journal_prefix)
        self.queue_bucket, self.queue_prefix = s3_location(queue_prefix)
        if client is None:
            import boto3
            client = boto3.client('s3', region_name=config['referenceUpload']['region'])
        self.client = client
        self.etags = {}

    def journal_key(self, state):
        return f"{self.journal_prefix}/{state['inputHash']}/{state['attempt']}.json"

    def restore(self, input_hash, attempt):
        key = self.journal_key(dict(inputHash=input_hash, attempt=attempt))
        try:
            response = self.client.get_object(Bucket=self.journal_bucket, Key=key)
        except Exception as error:
            if missing(error): return None
            raise RuntimeError('SEEDANCE_JOURNAL_READ_FAILED') from None
        value = json.loads(response['Body'].read())
        if value.get('inputHash') != input_hash or value.get('attempt') != attempt:
            raise ValueError('SEEDANCE_JOURNAL_IDENTITY_CHANGED')
        self.etags[key] = response['ETag']
        return value

    def checkpoint(self, state):
        key = self.journal_key(state)
        condition = {'IfMatch': self.etags[key]} if key in self.etags else {'IfNoneMatch': '*'}
        try:
            response = self.client.put_object(Bucket=self.journal_bucket, Key=key,
                Body=json.dumps(state, sort_keys=True).encode(), ContentType='application/json', **condition)
        except Exception:
            # CAS ownership loss or an uncertain write must fence the caller before POST.
            raise RuntimeError('SEEDANCE_JOURNAL_CHECKPOINT_FAILED') from None
        self.etags[key] = response['ETag']

    def queue(self, uri, value):
        bucket, key = s3_location(uri)
        if bucket != self.queue_bucket or not key.startswith(self.queue_prefix + '/'):
            raise ValueError('SEEDANCE_QUEUE_OUTSIDE_PREFIX')
        body = json.dumps(value, sort_keys=True).encode()
        try:
            self.client.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json', IfNoneMatch='*')
        except Exception as error:
            if getattr(error, 'response', {}).get('Error', {}).get('Code') not in {'PreconditionFailed', '412', 'ConditionalRequestConflict'}:
                raise RuntimeError('SEEDANCE_QUEUE_WRITE_FAILED') from None
            current = self.client.get_object(Bucket=bucket, Key=key)
            previous = json.loads(current['Body'].read())
            # Only transport expiry may change. The provider task, paid payload,
            # output policy and all request metadata remain the original values.
            immutable = lambda item: {k: v for k, v in item.items() if k not in {'providerVideoUrl', 'refreshedAt'}}
            if immutable(previous) != immutable(value):
                raise ValueError('SEEDANCE_QUEUE_IDENTITY_CONFLICT')
            if previous.get('providerVideoUrl') == value.get('providerVideoUrl'):
                return
            refreshed = {**previous, 'providerVideoUrl': value['providerVideoUrl'], 'refreshedAt': now()}
            try:
                self.client.put_object(Bucket=bucket, Key=key,
                    Body=json.dumps(refreshed, sort_keys=True).encode(), ContentType='application/json', IfMatch=current['ETag'])
            except Exception:
                # A competing writer may have installed a newer transport URL.
                # Do not overwrite it; resume the same paid task on the next run.
                raise RuntimeError('SEEDANCE_QUEUE_REFRESH_CONFLICT') from None

    def signed(self, ref):
        # Always use the verified local bytes; a supplied S3 URI is not content proof.
        source = regular(ref['path'])
        digest = sha256(source)
        if digest != str(ref['sha256']).removeprefix('sha256:'):
            raise ValueError('SEEDANCE_REFERENCE_CHANGED')
        upload = self.config['referenceUpload']
        key = upload['prefix'].strip('/') + '/' + digest + source.suffix.lower()
        self.client.upload_file(str(source), upload['bucket'], key,
            ExtraArgs={'Metadata': {'sha256': digest}})
        head = self.client.head_object(Bucket=upload['bucket'], Key=key)
        if head.get('ContentLength') != source.stat().st_size or head.get('Metadata', {}).get('sha256') != digest:
            raise ValueError('SEEDANCE_REFERENCE_UPLOAD_UNVERIFIED')
        return self.client.generate_presigned_url('get_object', Params={'Bucket': upload['bucket'], 'Key': key},
            ExpiresIn=upload['presignSeconds'])
