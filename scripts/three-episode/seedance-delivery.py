#!/usr/bin/env python3
"""Cloud CPU delivery queue: preserve native evidence, optionally normalize, verify private S3."""
import argparse
import concurrent.futures
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from fractions import Fraction

SUCCESS_STATES = {'generated', 'succeeded', 'media-contract-failed'}
EXACT_POLICY = 'exact-output-contract'
NORMALIZE_POLICY = 'allow-frame-normalization'


def require_cloud_media_host():
    cloud = any(os.environ.get(key) for key in ['KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI',
                                               'ECS_CONTAINER_METADATA_URI_V4', 'AWS_BATCH_JOB_ID'])
    if sys.platform != 'linux' or os.environ.get('WORLDKIT_CLOUD_MEDIA_HOST') != '1' or not cloud:
        raise ValueError('SEEDANCE_DELIVERY_REQUIRES_CLOUD_MEDIA_HOST')


def acceptance_policy(value):
    policy = value.get('nativeAcceptancePolicy', EXACT_POLICY)
    if policy not in [EXACT_POLICY, NORMALIZE_POLICY]:
        raise ValueError('NATIVE_ACCEPTANCE_POLICY_INVALID')
    return policy


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f'.{os.getpid()}.{threading.get_ident()}.tmp')
    with temp.open('w') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def safe_id(value):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,119}', str(value)):
        raise ValueError('INVALID_DELIVERY_ID')
    return str(value)


def regular(path):
    path = Path(path)
    if not path.is_file() or path.is_symlink() or path.resolve() != path.absolute():
        raise ValueError('DELIVERY_REQUIRES_REGULAR_REAL_PATH')
    return path


def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
                             'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration,size',
                             '-of', 'json', str(path)], capture_output=True, text=True, check=True, timeout=90)
    data = json.loads(result.stdout)
    video = next(s for s in data['streams'] if s['codec_type'] == 'video')
    return dict(width=int(video['width']), height=int(video['height']), fps=float(Fraction(video['avg_frame_rate'])),
                frameCount=int(video['nb_read_frames']), hasAudio=any(s['codec_type'] == 'audio' for s in data['streams']),
                durationSeconds=float(data['format']['duration']), sizeBytes=Path(path).stat().st_size,
                videoCodec=video.get('codec_name'))


def native_ok(media):
    return (media['width'] == 1280 and media['height'] == 720 and media['hasAudio'] and
            media['frameCount'] > 0 and 0 < media['fps'] <= 120 and
            math.isfinite(media['durationSeconds']) and 0 < media['durationSeconds'] <= 120)


def output_contract(desired=None):
    desired = DESIRED if desired is None else desired
    if desired not in [DESIRED, HALF_DESIRED]:
        raise ValueError('QUEUE_OUTPUT_CONTRACT_INVALID')
    return dict(HALF_DESIRED if desired == HALF_DESIRED else DESIRED)


def normalized_ok(media, desired=None):
    desired = output_contract(desired)
    return native_ok(media) and media['frameCount'] == desired['frameCount'] and abs(media['fps'] - desired['fps']) < .000001 and abs(media['durationSeconds'] - desired['durationSeconds']) < .1


def assert_native_duration(media, desired=None):
    desired = output_contract(desired)
    if not native_ok(media):
        raise ValueError('NATIVE_NOT_ACCEPTABLE_FOR_NORMALIZATION')
    minimum, maximum = desired['durationSeconds'] * .9, desired['durationSeconds'] * 1.1
    # Check both actual decoded video time and container time; an audio tail must
    # not disguise a short video. Full and half clips use the same 10% allowance.
    if not all(minimum <= seconds <= maximum for seconds in [media['frameCount'] / media['fps'], media['durationSeconds']]):
        raise ValueError('NATIVE_DURATION_OUTSIDE_REQUEST_CONTRACT')


def tempo_filter(factor):
    if not math.isfinite(factor) or factor <= 0:
        raise ValueError('INVALID_AUDIO_TEMPO')
    factors = []
    while factor < .5:
        factors.append(.5)
        factor /= .5
    while factor > 2:
        factors.append(2)
        factor /= 2
    factors.append(factor)
    return ','.join(f'atempo={f:.14f}' for f in factors)


def normalize(raw, media, destination, ffmpeg='ffmpeg', desired=None, allow_frame_normalization=False):
    """Use two passes: retime video first, then align audio and copy video packets."""
    if not allow_frame_normalization:
        raise ValueError('FRAME_NORMALIZATION_NOT_ENABLED')
    assert_native_duration(media, desired)
    destination.mkdir(parents=True, exist_ok=True)
    normalization_started = time.monotonic()
    desired = output_contract(desired)
    frame_count, seconds = desired['frameCount'], desired['durationSeconds']
    ratio = seconds / (media['frameCount'] / media['fps'])
    vf = f'setpts=(PTS-STARTPTS)*{ratio:.14f},fps=24'
    af = tempo_filter(1 / ratio) + f',apad=whole_dur={seconds},atrim=duration={seconds},asetpts=PTS-STARTPTS'
    video = destination / 'normalization-video.partial.mp4'
    temp = destination / f'normalized-{frame_count}f.partial.mp4'
    final = destination / f'normalized-{frame_count}f.mp4'
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '2', '-i', str(raw),
                    '-an', '-vf', vf, '-frames:v', str(frame_count), '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2',
                    '-crf', '18', '-fs', str(256 * 1024 * 1024), str(video)], check=True, timeout=180, capture_output=True)
    video_completed = time.monotonic()
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', str(video), '-i', str(raw),
                    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-t', str(seconds),
                    '-movflags', '+faststart', '-fs', str(256 * 1024 * 1024), str(temp)], check=True, timeout=180, capture_output=True)
    mux_completed = time.monotonic()
    actual = probe(temp)
    if not normalized_ok(actual, desired):
        raise ValueError('NORMALIZATION_MEDIA_CONTRACT_FAILED')
    os.replace(temp, final)
    video.unlink()
    return dict(kind='seedance-frame-normalization', status='completed', policy=NORMALIZE_POLICY,
                native=dict(path=str(raw), sha256=digest(raw), media=media),
                normalized=dict(path=str(final), sha256=digest(final), media=actual), nativeFrameCount=media['frameCount'],
                outputFrameCount=frame_count, desiredOutput=desired, equivalentCount=seconds / 30, durationScale=ratio, ffmpegVideoFilter=vf, ffmpegAudioFilter=af,
                method='Two-pass uniform timestamp retiming; nearest-frame 24fps sampling; aligned audio; no optical-flow generation',
                timing=dict(videoEncodeSeconds=round(video_completed-normalization_started,3), audioMuxSeconds=round(mux_completed-video_completed,3), totalWithProbeSeconds=round(time.monotonic()-normalization_started,3)),
                completedAt=now())


class Storage:
    def __init__(self, client, prefix, maximum=4):
        self.client = client
        self.bucket, self.prefix = s3_location(prefix)
        self.slots = threading.Semaphore(maximum)

    def upload(self, path, relative, content_type):
        path = regular(path)
        size, sha = path.stat().st_size, digest(path)
        key = self.prefix + '/' + relative + '/' + sha + '/' + path.name
        with self.slots:
            try:
                head = self.client.head_object(Bucket=self.bucket, Key=key)
            except Exception as error:
                code = str(getattr(error, 'response', {}).get('Error', {}).get('Code', ''))
                if code not in {'404', 'NoSuchKey', 'NotFound'}:
                    raise
                head = None
            if head is None:
                # A bounded single PUT avoids nested multipart worker pools.
                with path.open('rb') as body:
                    self.client.put_object(Bucket=self.bucket, Key=key, Body=body,
                                           ContentType=content_type, Metadata={'sha256': sha})
                head = self.client.head_object(Bucket=self.bucket, Key=key)
            if head.get('ContentLength') != size or head.get('Metadata', {}).get('sha256') != sha:
                raise ValueError('S3_HEAD_CONTENT_IDENTITY_MISMATCH')
        return dict(s3Uri=f's3://{self.bucket}/{key}', sha256=sha, bytes=size, headVerifiedAt=now(),
                    verification='S3 ContentLength and sha256 metadata after successful content-addressed upload')


class Worker:
    def __init__(self, source_root, output_root, storage, normalize_limit=2, allow_frame_normalization=False):
        self.source_root, self.output_root = Path(source_root).resolve(), Path(output_root).resolve()
        self.storage = storage
        self.normalizers = threading.Semaphore(normalize_limit)
        self.allow_frame_normalization = allow_frame_normalization

    def identity(self, state_path, state):
        parts = state_path.relative_to(self.source_root).parts
        if len(parts) != 4 or not re.fullmatch(r'attempt-[0-9]{2,3}', parts[2]):
            raise ValueError('INVALID_ATTEMPT_PATH')
        case_id, request_id, attempt = [safe_id(x) for x in parts[:3]]
        if state.get('id') != request_id or state.get('status') not in SUCCESS_STATES or not state.get('output'):
            return None
        # The delivered model references must use the declared material order.
        if state.get('referenceOrder') and state['referenceOrder'] != 'styled-opening-then-target-triviews':
            return None
        if state.get('superseded') or state.get('withholdOutput'):
            return None
        if not state.get('taskId') or not re.fullmatch('[a-f0-9]{64}', state.get('inputHash', '')) or not re.fullmatch('[a-f0-9]{64}', state['output'].get('sha256', '')):
            raise ValueError('NATIVE_IDENTITY_MISSING')
        desired = output_contract(state.get('desiredOutput'))
        if desired == HALF_DESIRED:
            validate_half_clip(state.get('clip'), request_id)
        return dict(caseId=case_id, requestId=request_id, attempt=attempt, taskId=state['taskId'],
                    inputHash=state['inputHash'], nativeSha256=state['output']['sha256'],
                    desiredOutput=desired, equivalentCount=desired['durationSeconds']/30, clip=state.get('clip'),
                    nativeAcceptancePolicy=acceptance_policy(state))

    def deliver(self, state_path):
        state_path = Path(state_path)
        state = read(state_path)
        identity = self.identity(state_path, state)
        desired = output_contract(state.get('desiredOutput'))
        if not identity:
            return None
        relative = '/'.join(identity[k] for k in ['caseId', 'requestId', 'attempt'])
        destination = self.output_root / relative
        destination.mkdir(parents=True, exist_ok=True)
        with (destination / 'delivery.lock').open('a+') as held:
            try:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return None
            final = destination / 'delivery.json'
            if final.exists():
                done = read(final)
                if done['identity'] != identity:
                    raise ValueError('IMMUTABLE_DELIVERY_INPUT_CHANGED')
                assert_native_duration(done['native']['media'], desired)
                return done
            raw = regular(state['output']['path'])
            if raw.parent != state_path.parent.resolve() or digest(raw) != identity['nativeSha256']:
                raise ValueError('NATIVE_MEDIA_IDENTITY_CHANGED')
            write(destination / 'delivery-progress.json', dict(status='verifying-native', identity=identity, updatedAt=now()))
            with self.normalizers:
                media = probe(raw)
                write(destination / 'native-probe.json', dict(kind='seedance-native-media-probe', schemaVersion=1,
                      identity=identity, media=media, observedAt=now()))
                assert_native_duration(media, desired)
                can_normalize = self.allow_frame_normalization and acceptance_policy(state) == NORMALIZE_POLICY
                if not normalized_ok(media, desired) and not can_normalize:
                    raise ValueError('NATIVE_OUTPUT_CONTRACT_FAILED_NORMALIZATION_NOT_ENABLED')
                existing = state_path.parent / 'normalization.json'
                own = destination / 'normalization.json'
                if existing.exists() or own.exists():
                    marker = existing if existing.exists() else own
                    normalization = read(marker)
                    if normalization.get('status') != 'completed' or normalization['native']['sha256'] != identity['nativeSha256']:
                        raise ValueError('NORMALIZATION_INPUT_CHANGED')
                    normalized = regular(normalization['normalized']['path'])
                    if normalized.parent not in [destination.resolve(), state_path.parent.resolve()]:
                        raise ValueError('NORMALIZATION_OUTPUT_OUTSIDE_ATTEMPT')
                    if digest(normalized) != normalization['normalized']['sha256'] or not normalized_ok(probe(normalized), desired):
                        raise ValueError('EXISTING_NORMALIZATION_CHANGED')
                elif normalized_ok(media, desired):
                    # Already conforming native media needs no second encoding.
                    normalization = dict(kind='seedance-frame-normalization', status='completed', policy=EXACT_POLICY,
                                         native=state['output'], normalized=dict(path=str(raw), sha256=digest(raw), media=media),
                                         method='Native media already satisfies delivery contract; no transformation', completedAt=now())
                    write(own, normalization)
                    marker, normalized = own, raw
                else:
                    normalization = normalize(raw, media, destination, desired=desired, allow_frame_normalization=can_normalize)
                    write(own, normalization)
                    marker, normalized = own, Path(normalization['normalized']['path'])
            write(destination / 'delivery-progress.json', dict(status='uploading', identity=identity, updatedAt=now()))
            native_remote = self.storage.upload(raw, relative + '/raw', 'video/mp4')
            normalized_remote = self.storage.upload(normalized, relative + '/normalized', 'video/mp4')
            normalization_remote = self.storage.upload(marker, relative + '/normalization', 'application/json')
            # Persist source identity snapshot separately, avoiding expiring provider response URLs.
            provenance = destination / 'provenance.json'
            if not provenance.exists():
                write(provenance, dict(identity=identity, sourceStatePath=str(state_path), sourceStateSha256=digest(state_path),
                                       nativeParameters=state.get('nativeParameters'), referenceOrder=state.get('referenceOrder'),
                                       newVideoSha256=state.get('newVideoSha256'), modelEndpoint=state.get('modelEndpoint'), createdAt=now()))
            provenance_remote = self.storage.upload(provenance, relative + '/provenance', 'application/json')
            done = dict(kind='seedance-verified-delivery', schemaVersion=1, status='delivered', identity=identity,
                        nativeAcceptancePolicy=acceptance_policy(state), desiredOutput=desired, equivalentCount=desired['durationSeconds']/30, clip=state.get('clip'), native=dict(localPath=str(raw), media=media, **native_remote),
                        normalized=dict(localPath=str(normalized), media=normalization['normalized']['media'], **normalized_remote),
                        normalization=normalization_remote, provenance=provenance_remote, completedAt=now(),
                        localRetention='Cloud scratch is removed only after verified remote media, manifest and completion')
            manifest = destination / 'delivery-manifest.json'
            if manifest.exists():
                existing = read(manifest)
                # Retries after uncertain manifest upload reuse exact immutable bytes.
                if existing['identity'] != identity:
                    raise ValueError('MANIFEST_IDENTITY_CHANGED')
                done = existing
            else:
                write(manifest, done)
            remote_manifest = self.storage.upload(manifest, relative + '/manifest', 'application/json')
            done = dict(done, manifest=remote_manifest)
            write(final, done)
            write(destination / 'delivery-progress.json', dict(status='delivered', identity=identity, updatedAt=now()))
            return done


QUEUE_KIND = 'seedance-native-delivery-queue'
DESIRED = dict(width=1280, height=720, fps=24, frameCount=720, durationSeconds=30, hasAudio=True)
HALF_DESIRED = dict(width=1280, height=720, fps=24, frameCount=360, durationSeconds=15, hasAudio=True)
MAX_NATIVE_BYTES = 256 * 1024 * 1024
NATIVE_RANGE_CONCURRENCY = 8
CLOUD_DELIVERY_WORKERS = 4


def s3_location(uri):
    match = re.fullmatch(r's3://([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])/([^?#\s]+)', str(uri).rstrip('/'))
    if not match or any(part in ['', '.', '..'] for part in match[2].split('/')):
        raise ValueError('PRIVATE_S3_PREFIX_REQUIRED')
    return match[1], match[2]


def validate_half_clip(clip, request_id):
    if not isinstance(clip, dict) or clip.get('kind') != 'three-episode-half-clip':
        raise ValueError('QUEUE_HALF_CLIP_PROVENANCE_REQUIRED')
    parent = safe_id(clip.get('parentRequestId'))
    half = clip.get('halfIndex')
    if type(half) is not int or half not in [0, 1] or request_id != parent + f'-half-{half:02d}':
        raise ValueError('QUEUE_HALF_CLIP_IDENTITY_INVALID')
    if not re.fullmatch('[a-f0-9]{64}', str(clip.get('parentVideoSha256'))):
        raise ValueError('QUEUE_HALF_PARENT_HASH_REQUIRED')
    expected = dict(sourceFrameStart=half*360, sourceFrameEndExclusive=(half+1)*360,
                    sourceTimeStartSeconds=half*15, sourceTimeEndSeconds=(half+1)*15,
                    frameCount=360, fps=24, durationSeconds=15)
    if any(clip.get(k) != v for k, v in expected.items()):
        raise ValueError('QUEUE_HALF_CLIP_FRAME_RANGE_INVALID')
    return clip


def queue_payload(value):
    from urllib.parse import urlsplit
    if not isinstance(value, dict) or value.get('kind') != QUEUE_KIND or value.get('schemaVersion') != 1:
        raise ValueError('QUEUE_SCHEMA_INVALID')
    for key in ['caseId', 'requestId', 'styleId']:
        safe_id(value.get(key))
    if not re.fullmatch(r'attempt-[0-9]{2,3}', str(value.get('attempt'))):
        raise ValueError('QUEUE_ATTEMPT_INVALID')
    if not re.fullmatch('[a-f0-9]{64}', str(value.get('inputHash'))) or not value.get('taskId'):
        raise ValueError('QUEUE_INPUT_IDENTITY_INVALID')
    desired = output_contract(value.get('desiredOutput'))
    acceptance_policy(value)
    if value.get('desiredOutput') is None:
        raise ValueError('QUEUE_OUTPUT_CONTRACT_INVALID')
    if desired == HALF_DESIRED:
        validate_half_clip(value.get('clip'), value['requestId'])
        if value.get('equivalentCount') != .5:
            raise ValueError('QUEUE_HALF_EQUIVALENT_COUNT_INVALID')
    elif value.get('equivalentCount', 1) != 1 or value.get('clip'):
        raise ValueError('QUEUE_FULL_EQUIVALENT_COUNT_INVALID')
    parsed = urlsplit(value.get('providerVideoUrl', ''))
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in [None, 443]:
        raise ValueError('QUEUE_NATIVE_URL_REQUIRES_HTTPS')
    return value


def queue_name(value):
    return value['inputHash'] + '-' + value['attempt'] + '.json'


def parse_content_range(header, start, end):
    match = re.fullmatch(r'bytes ([0-9]+)-([0-9]+)/([0-9]+)', header or '')
    if not match or int(match[1]) != start or int(match[2]) != end or int(match[3]) <= end:
        raise ValueError('NATIVE_CONTENT_RANGE_MISMATCH')
    return int(match[3])


class QueueWorker:
    """Single CPU-host consumer, four rolling items, two normalization lanes, verified remote delivery."""
    def __init__(self, client, queue_prefix, completion_prefix, root, storage, shard_index=0, shard_count=1, allow_frame_normalization=False):
        if shard_count < 1 or not 0 <= shard_index < shard_count:
            raise ValueError("QUEUE_SHARD_INVALID")
        self.shard_index, self.shard_count = shard_index, shard_count
        self.client, self.root, self.storage = client, Path(root).resolve(), storage
        self.bucket, self.queue_prefix = s3_location(queue_prefix)
        completion_bucket, self.completion_prefix = s3_location(completion_prefix)
        if self.bucket != completion_bucket:
            raise ValueError('QUEUE_COMPLETION_BUCKET_MISMATCH')
        if self.queue_prefix == self.completion_prefix or self.queue_prefix.startswith(self.completion_prefix + '/') or self.completion_prefix.startswith(self.queue_prefix + '/'):
            raise ValueError('QUEUE_COMPLETION_PREFIX_OVERLAP')
        self.worker = Worker(self.root / 'scratch', self.root / 'receipts', storage, normalize_limit=2,
                             allow_frame_normalization=allow_frame_normalization)
        self.root.mkdir(parents=True, exist_ok=True)
        self.cooldown = {}

    def owns(self, key):
        # The basename is immutable inputHash + attempt; every host must use the same fixed shard count.
        name = key.rsplit('/', 1)[1]
        return int(hashlib.sha256(name.encode()).hexdigest(), 16) % self.shard_count == self.shard_index

    def object(self, key, verify_sha256=False):
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            body = response['Body'].read(1024 * 1024 + 1)
            if len(body) > 1024 * 1024:
                raise ValueError('QUEUE_OBJECT_TOO_LARGE')
            if verify_sha256:
                head = self.client.head_object(Bucket=self.bucket, Key=key)
                if head.get('ContentLength') != len(body) or head.get('Metadata', {}).get('sha256') != hashlib.sha256(body).hexdigest():
                    raise ValueError('QUEUE_COMPLETION_HEAD_MISMATCH')
            return json.loads(body)
        except Exception as error:
            code = str(getattr(error, 'response', {}).get('Error', {}).get('Code', ''))
            if code in {'404', 'NoSuchKey', 'NotFound'}:
                return None
            raise

    def keys(self, prefix):
        results = []
        for page in self.client.get_paginator('list_objects_v2').paginate(Bucket=self.bucket, Prefix=prefix.rstrip('/') + '/'):
            results.extend(x['Key'] for x in page.get('Contents', []) if x['Key'].endswith('.json'))
        return sorted(results)

    def download(self, url, path):
        require_cloud_media_host()
        import urllib.request
        import urllib.error
        from urllib.parse import urlsplit
        import socket
        import ipaddress
        host = urlsplit(url).hostname
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
            raise ValueError('QUEUE_NATIVE_HOST_NOT_PUBLIC')
        class HttpsOnly(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, msg, headers, newurl):
                raise ValueError('QUEUE_NATIVE_REDIRECT_REQUIRES_RECONCILIATION')
        temporary = path.with_suffix('.download')
        started = time.monotonic()
        deadline = started + 180
        def read_range(start, end, etag=None):
            headers = {'Range': f'bytes={start}-{end}'}
            if etag:
                headers['If-Match'] = etag
            response = urllib.request.build_opener(HttpsOnly()).open(urllib.request.Request(url, headers=headers), timeout=20)
            return response
        try:
            # Native artifact URLs observed in production support byte ranges. Each
            # independently bounded range avoids indefinitely throttled long streams.
            with read_range(0, 0) as response:
                total = parse_content_range(response.headers.get('Content-Range'), 0, 0)
                if response.status != 206 or not 0 < total <= MAX_NATIVE_BYTES:
                    raise ValueError('NATIVE_RANGE_OR_SIZE_CONTRACT_INVALID')
                etag = response.headers.get('ETag')
                if len(response.read(2)) != 1:
                    raise ValueError('NATIVE_RANGE_RESPONSE_LENGTH_INVALID')
            if temporary.exists():
                write(path.parent / 'abandoned-partial.json', dict(bytes=temporary.stat().st_size, sha256=digest(temporary),
                      reason='Restart bounded range transfer after stalled sequential stream', observedAt=now()))
                temporary.unlink()
            chunk_size = 2 * 1024 * 1024
            with temporary.open('w+b') as output:
                output.truncate(total)
                fd = output.fileno()
                def chunk(start):
                    end = min(total - 1, start + chunk_size - 1)
                    for attempt in range(2):
                        try:
                            if time.monotonic() >= deadline:
                                raise ValueError('NATIVE_DOWNLOAD_TOTAL_DEADLINE')
                            with read_range(start, end, etag) as response:
                                if response.status != 206 or parse_content_range(response.headers.get('Content-Range'), start, end) != total:
                                    raise ValueError('NATIVE_RANGE_RESPONSE_IDENTITY_INVALID')
                                if etag and response.headers.get('ETag') != etag:
                                    raise ValueError('NATIVE_RANGE_ENTITY_CHANGED')
                                data = bytearray()
                                while len(data) < end - start + 1:
                                    if time.monotonic() >= deadline:
                                        raise ValueError('NATIVE_DOWNLOAD_TOTAL_DEADLINE')
                                    piece = response.read1(min(64 * 1024, end - start + 1 - len(data)))
                                    if not piece:
                                        raise ValueError('NATIVE_RANGE_TRUNCATED')
                                    data.extend(piece)
                                written = os.pwrite(fd, data, start)
                                if written != len(data):
                                    raise ValueError('NATIVE_RANGE_WRITE_INCOMPLETE')
                                return len(data)
                        except (urllib.error.URLError, TimeoutError, OSError):
                            if attempt:
                                raise ValueError('NATIVE_RANGE_TRANSPORT_FAILED') from None
                with concurrent.futures.ThreadPoolExecutor(max_workers=NATIVE_RANGE_CONCURRENCY) as pool:
                    futures = [pool.submit(chunk, start) for start in range(0, total, chunk_size)]
                    try:
                        count = sum(f.result() for f in futures)
                    except Exception:
                        for future in futures:
                            future.cancel()
                        raise
                if count != total:
                    raise ValueError('NATIVE_RANGE_TOTAL_LENGTH_INVALID')
                output.flush()
                os.fsync(fd)
            os.replace(temporary, path)
            write(path.parent / 'download-evidence.json', dict(kind='bounded-native-range-download', bytes=total,
                  sha256=digest(path), ranges=(total + chunk_size - 1) // chunk_size, concurrency=NATIVE_RANGE_CONCURRENCY,
                  elapsedSeconds=round(time.monotonic()-started, 3), deadlineSeconds=180, maximumBlockingReadSeconds=20, completedAt=now()))
        except urllib.error.HTTPError as error:
            raise ValueError(f'NATIVE_DOWNLOAD_HTTP_{error.code}') from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ValueError('NATIVE_DOWNLOAD_TRANSPORT_FAILED') from None
        finally:
            temporary.unlink(missing_ok=True)

    def complete(self, name, payload):
        path = self.root / 'completion-records' / name
        if path.exists():
            saved = read(path)
            if saved['identity'] != payload['identity']:
                raise ValueError('QUEUE_COMPLETION_IDENTITY_CHANGED')
            payload = saved
        else:
            write(path, payload)
        body = path.read_bytes()
        sha = hashlib.sha256(body).hexdigest()
        key = self.completion_prefix + '/' + name
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType='application/json',
                                   Metadata={'sha256': sha}, IfNoneMatch='*')
        except Exception as error:
            code = str(getattr(error, 'response', {}).get('Error', {}).get('Code', ''))
            if code not in {'PreconditionFailed', '412', 'ConditionalRequestConflict'}:
                raise
        head = self.client.head_object(Bucket=self.bucket, Key=key)
        if head.get('ContentLength') != len(body) or head.get('Metadata', {}).get('sha256') != sha:
            raise ValueError('QUEUE_COMPLETION_HEAD_MISMATCH')
        return payload

    def cleanup(self, done):
        # Only own CPU-cloud scratch media are removed, after both media and remote manifest proof.
        assert_native_duration(done['native']['media'], done.get('desiredOutput'))
        for key in ['native', 'normalized', 'manifest']:
            asset = done[key]
            bucket, object_key = s3_location(asset['s3Uri'])
            head = self.client.head_object(Bucket=bucket, Key=object_key)
            if head.get('ContentLength') != asset['bytes'] or head.get('Metadata', {}).get('sha256') != asset['sha256']:
                raise ValueError('CLOUD_CLEANUP_REMOTE_PROOF_FAILED')
        deleted = set()
        for key in ['native', 'normalized']:
            path = Path(done[key]['localPath'])
            if path in deleted or not path.exists():
                continue
            if not path.resolve().is_relative_to(self.root) or path.is_symlink() or path.stat().st_nlink != 1:
                raise ValueError('CLOUD_CLEANUP_NOT_OWN_MEDIA')
            if digest(path) != done[key]['sha256']:
                raise ValueError('CLOUD_CLEANUP_LOCAL_MEDIA_CHANGED')
            path.unlink()
            deleted.add(path)

    def process(self, key):
        if not self.owns(key):
            raise ValueError("QUEUE_WRONG_SHARD")
        value = queue_payload(self.object(key))
        name = queue_name(value)
        if key.rsplit('/', 1)[1] != name:
            raise ValueError('QUEUE_OBJECT_IDENTITY_MISMATCH')
        completion = self.object(self.completion_prefix + '/' + name, verify_sha256=True)
        if completion:
            identity = completion.get('identity', {})
            expected = {key: value[key] for key in ['caseId', 'requestId', 'attempt', 'inputHash', 'taskId', 'desiredOutput']}
            expected.update(clip=value.get('clip'), equivalentCount=value.get('equivalentCount', 1), nativeAcceptancePolicy=acceptance_policy(value))
            if completion.get('status') != 'delivered' or any(identity.get(key) != field for key, field in expected.items()) or completion.get('delivery', {}).get('identity') != identity:
                raise ValueError('QUEUE_REMOTE_COMPLETION_CONFLICT')
            assert_native_duration(completion['delivery']['native']['media'], value['desiredOutput'])
            self.cleanup(completion['delivery'])
            return completion
        relative = '/'.join(value[k] for k in ['caseId', 'requestId', 'attempt'])
        folder = self.root / 'scratch' / relative
        folder.mkdir(parents=True, exist_ok=True)
        raw = folder / 'provider-original.mp4'
        state_path = folder / 'seedance-state.json'
        final_receipt = self.root / 'receipts' / relative / 'delivery.json'
        if not raw.exists() and not final_receipt.exists():
            failed_native = folder / 'failed-native.json'
            if failed_native.exists():
                saved = read(failed_native)
                bucket, object_key = s3_location(saved['s3Uri'])
                self.client.download_file(bucket, object_key, str(raw))
                if digest(raw) != saved['sha256']:
                    raise ValueError('FAILED_NATIVE_RESTORE_HASH_MISMATCH')
            else:
                self.download(value['providerVideoUrl'], raw)
        if not state_path.exists():
            # The signed URL is intentionally absent from local state and all delivery evidence.
            write(state_path, dict(id=value['requestId'], caseId=value['caseId'], styleVariantId=value['styleId'],
                                   status='generated', taskId=value['taskId'], inputHash=value['inputHash'], desiredOutput=value['desiredOutput'], equivalentCount=value.get('equivalentCount',1), clip=value.get('clip'),
                                   nativeAcceptancePolicy=acceptance_policy(value),
                                   referenceOrder='styled-opening-then-target-triviews', newVideoSha256=value.get('newVideoSha256'),
                                   modelEndpoint=value.get('modelEndpoint'), output=dict(path=str(raw), sha256=digest(raw)),
                                   queueObjectKey=key, createdAt=now()))
        else:
            previous = read(state_path)
            if previous['taskId'] != value['taskId'] or previous['inputHash'] != value['inputHash'] or output_contract(previous.get('desiredOutput')) != value['desiredOutput'] or previous.get('clip') != value.get('clip') or acceptance_policy(previous) != acceptance_policy(value):
                raise ValueError('QUEUE_LOCAL_STATE_CONFLICT')
        normalization_root = self.root / 'receipts' / relative
        saved_normalized = normalization_root / 'failed-normalized.json'
        normalization_marker = normalization_root / 'normalization.json'
        if not final_receipt.exists() and saved_normalized.exists() and normalization_marker.exists():
            target = Path(read(normalization_marker)['normalized']['path'])
            if target.parent.resolve() != normalization_root.resolve():
                raise ValueError('NORMALIZATION_OUTPUT_OUTSIDE_ATTEMPT')
            if not target.exists():
                saved = read(saved_normalized)
                bucket, object_key = s3_location(saved['s3Uri'])
                self.client.download_file(bucket, object_key, str(target))
                if digest(target) != saved['sha256']:
                    raise ValueError('FAILED_NORMALIZED_RESTORE_HASH_MISMATCH')
        done = self.worker.deliver(state_path)
        if not done or done['status'] != 'delivered':
            raise ValueError('QUEUE_DELIVERY_NOT_COMPLETE')
        completion = self.complete(name, dict(kind='seedance-native-delivery-completion', schemaVersion=1, status='delivered',
                                              identity=done['identity'], desiredOutput=value['desiredOutput'], equivalentCount=value.get('equivalentCount',1), clip=value.get('clip'), queueObjectKey=key, delivery=done, completedAt=now()))
        self.cleanup(done)
        return completion

    def preserve_failed_native_and_free_scratch(self, key):
        original = self.object(key)
        try:
            value = queue_payload(original)
        except (ValueError, AttributeError, TypeError):
            return  # Invalid payloads never acquired media scratch.
        relative = '/'.join(value[k] for k in ['caseId', 'requestId', 'attempt'])
        folder = self.root / 'scratch' / relative
        raw = folder / 'provider-original.mp4'
        if raw.exists():
            remote = self.storage.upload(raw, relative + '/failed-native', 'video/mp4')
            probe_path = self.root / 'receipts' / relative / 'native-probe.json'
            if probe_path.exists():
                remote = dict(remote, media=read(probe_path)['media'],
                              probe=self.storage.upload(probe_path, relative + '/failed-native-probe', 'application/json'))
            write(folder / 'failed-native.json', remote)
            raw.unlink()
        normalization_root = self.root / 'receipts' / relative
        marker = normalization_root / 'normalization.json'
        if marker.exists():
            normalized = Path(read(marker)['normalized']['path'])
            if normalized.exists() and normalized != raw:
                remote = self.storage.upload(normalized, relative + '/failed-normalized', 'video/mp4')
                write(normalization_root / 'failed-normalized.json', remote)
        for parent in [folder, normalization_root]:
            for media in parent.glob('*.mp4'):
                if media.is_symlink() or media.stat().st_nlink != 1:
                    raise ValueError('FAILED_SCRATCH_NOT_OWN_MEDIA')
                media.unlink()

    def sweep_completed(self, exclude_names=None):
        # Recover a crash between durable completion and scratch cleanup.
        for receipt in (self.root / 'receipts').glob('*/*/attempt-*/delivery.json'):
            done = read(receipt)
            if not any(Path(done[k]['localPath']).exists() for k in ['native', 'normalized']):
                continue
            identity = done['identity']
            name = identity['inputHash'] + '-' + identity['attempt'] + '.json'
            if name in (exclude_names or set()):
                continue
            saved = self.object(self.completion_prefix + '/' + name, verify_sha256=True)
            if saved and saved.get('status') == 'delivered' and saved['identity'] == identity:
                self.cleanup(done)

    def run(self, once=False, interval=5, limit=None):
        import signal
        stop_requested = threading.Event()
        signal.signal(signal.SIGTERM, lambda *_: stop_requested.set())
        signal.signal(signal.SIGINT, lambda *_: stop_requested.set())
        with (self.root / 'queue-worker.lock').open('a+') as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            write(self.root / 'queue-worker-process.json', dict(pid=os.getpid(), startedAt=now(), cpuOnly=True,
                  normalizationConcurrency=2, s3Concurrency=4, nativeRangeConcurrency=NATIVE_RANGE_CONCURRENCY, rollingWorkers=CLOUD_DELIVERY_WORKERS,
                  queuePrefix=self.queue_prefix, completionPrefix=self.completion_prefix, shardIndex=self.shard_index, shardCount=self.shard_count,
                  maximumNativeBytes=MAX_NATIVE_BYTES, mediaScratchUpperBoundBytes=CLOUD_DELIVERY_WORKERS * 3 * MAX_NATIVE_BYTES))
            active, errors, submitted = {}, [], 0
            with concurrent.futures.ThreadPoolExecutor(max_workers=CLOUD_DELIVERY_WORKERS) as pool:
                while True:
                    for future in [f for f in active if f.done()]:
                        key = active.pop(future)
                        try:
                            done = future.result()
                            print(json.dumps(dict(status='cloud-delivered', identity=done['identity'])), flush=True)
                        except Exception as error:
                            code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z0-9_]+', str(error)) else type(error).__name__
                            errors.append(dict(queueObjectKey=key, code=code, observedAt=now()))
                            self.cooldown[key] = time.time() + 60
                            try:
                                self.preserve_failed_native_and_free_scratch(key)
                            except Exception:
                                stop_requested.set()
                                for queued in active:
                                    queued.cancel()
                                raise
                            print(json.dumps(dict(status='cloud-delivery-failed', queueObjectKey=key, code=code)), flush=True)
                    self.sweep_completed({key.rsplit('/', 1)[1] for key in active.values()})
                    completed = self.keys(self.completion_prefix)
                    completed_names = {key.rsplit('/', 1)[1] for key in completed}
                    keys = self.keys(self.queue_prefix)
                    pending = [key for key in keys if self.owns(key) and key.rsplit('/', 1)[1] not in completed_names and key not in active.values()
                               and time.time() >= self.cooldown.get(key, 0)]
                    if not stop_requested.is_set():
                        for key in pending:
                            if len(active) >= CLOUD_DELIVERY_WORKERS or (limit and submitted >= limit):
                                break
                            active[pool.submit(self.process, key)] = key
                            submitted += 1
                    write(self.root / 'queue-summary.json', dict(kind='seedance-cloud-delivery-summary', updatedAt=now(),
                          queuedObjectCount=len(keys), deliveredCount=len(completed), pendingCount=max(0,len(keys)-len(completed)),
                          shardIndex=self.shard_index, shardCount=self.shard_count,
                          shardQueuedCount=sum(self.owns(key) for key in keys),
                          shardPendingCount=sum(self.owns(key) and key.rsplit('/',1)[1] not in completed_names for key in keys),
                          activeCount=len(active), activeObjectKeys=list(active.values()), errors=errors[-100:]))
                    if not active and (once or stop_requested.is_set() or (limit and submitted >= limit)):
                        return 1 if errors else 0
                    if active:
                        concurrent.futures.wait(active, timeout=interval, return_when=concurrent.futures.FIRST_COMPLETED)
                    else:
                        stop_requested.wait(interval)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, required=True, help='Dedicated scratch and receipt directory on the cloud worker')
    parser.add_argument('--s3-prefix', required=True, help='Private S3 prefix for content-addressed native/normalized media and evidence')
    parser.add_argument('--queue-prefix', required=True, help='Private S3 native delivery queue prefix')
    parser.add_argument('--completion-prefix', required=True, help='Disjoint private S3 durable completion prefix in the queue bucket')
    parser.add_argument('--region', help='AWS region; otherwise use the cloud Host SDK configuration')
    parser.add_argument('--allow-frame-normalization', action='store_true', help='Permit retiming only when the immutable queue request also explicitly allows normalization')
    parser.add_argument('--shard-index', type=int, default=0)
    parser.add_argument('--shard-count', type=int, default=1)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--interval', type=float, default=15)
    args = parser.parse_args(argv)
    if not math.isfinite(args.interval) or args.interval < 1 or (args.limit is not None and args.limit < 1):
        parser.error('interval and limit must be positive')
    require_cloud_media_host()
    for uri in [args.s3_prefix, args.queue_prefix, args.completion_prefix]:
        s3_location(uri)
    import boto3
    from botocore.config import Config
    client = boto3.client('s3', region_name=args.region,
                          config=Config(max_pool_connections=8, retries={'max_attempts': 3, 'mode': 'standard'}))
    storage = Storage(client, args.s3_prefix, maximum=4)
    return QueueWorker(client, args.queue_prefix, args.completion_prefix, args.output_root, storage,
                       args.shard_index, args.shard_count, args.allow_frame_normalization).run(args.once, args.interval, args.limit)


if __name__ == '__main__':
    raise SystemExit(main())
