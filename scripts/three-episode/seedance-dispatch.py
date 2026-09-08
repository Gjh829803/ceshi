#!/usr/bin/env python3
"""Immutable cloud Seedance edit dispatch; queue native outputs for CPU delivery."""
import argparse
import concurrent.futures
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PREFIX = '对@视频1执行视频画面编辑：将这段现有白膜视频逐帧重绘为下述风格，保留原视频全长、运动与镜头时序。输出就是原有这一段，不生成其前后续集。\n\n'
PREFIX += '硬性可见性约束：三视图只提供外观，不是必须展示的对象清单。三视图中的实体若在原视频对应时刻不存在或不可见，本帧绝不能凭空新增；原视频全程不存在的实体，整片都不得出现。只允许在原实体真实进入画面时，按原有位置、尺度、遮挡和时序呈现，禁止提前出现、复制、召唤或为展示三视图移入镜头。地形和远景同样以@视频1为准：原画面看不到海，不得新增海面、海岸线或把天空/沙地改成水面。即使风格首帧、三视图、世界描述或事件提示包含这些内容，也不能补入原视频没有的可见区域；该空间可见性规则优先于所有外观参考和事件描述。\n\n'
PARAMETERS = dict(generate_audio=True, ratio='adaptive', duration=-1, resolution='720p', omni_reference_task_type='edit', watermark=False)
REMOTE_TERMINAL = {'succeeded', 'failed', 'cancelled', 'canceled', 'expired'}
LOCAL_TERMINAL = {'generated', 'succeeded', 'media-contract-failed', 'failed-provider', 'rejected', 'human-rejected', 'preparation-failed', 'submission-unknown', 'blocked-scene-presence', 'style-opening-rejected'}


def load_helper():
    spec = importlib.util.spec_from_file_location('seedance_reference_helper', Path(__file__).with_name('seedance-provider.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(value):
    result = str(value).removeprefix('sha256:')
    if not re.fullmatch(r'[a-f0-9]{64}', result):
        raise ValueError('INVALID_SHA256')
    return result


def safe_id(value):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,119}', str(value)):
        raise ValueError('INVALID_ID')
    return str(value)


def attempt_name(value):
    match = re.fullmatch(r'(?:attempt-)?([0-9]{1,3})', str(value))
    if not match or not 1 <= int(match[1]) <= 999:
        raise ValueError('INVALID_ATTEMPT')
    return f'attempt-{int(match[1]):02d}'


def output_contract(request, *, delivery=False):
    duration = request.get('durationSeconds', 30)
    if duration not in (15, 30):
        raise ValueError('UNSUPPORTED_DURATION')
    contract = dict(width=1280, height=720, fps=24, frameCount=360 if duration == 15 else 720, hasAudio=True)
    if delivery or duration == 15:
        contract['durationSeconds'] = duration
    if duration == 15:
        clip = request.get('clip', {})
        half = clip.get('halfIndex')
        expected = dict(kind='three-episode-half-clip', sourceTimeStartSeconds=half * 15 if half in (0, 1) else -1,
                        sourceTimeEndSeconds=(half + 1) * 15 if half in (0, 1) else -1, sourceFrameStart=half * 360 if half in (0, 1) else -1,
                        sourceFrameEndExclusive=(half + 1) * 360 if half in (0, 1) else -1,
                        frameCount=360, fps=24, durationSeconds=15, equivalentCount=0.5)
        if type(half) is not int or half not in (0, 1) or any(clip.get(k) != v for k, v in expected.items()) or request.get('equivalentCount') != 0.5:
            raise ValueError('HALF_CLIP_CONTRACT_REQUIRED')
        if request.get('parentRequestId') != clip.get('parentRequestId') or request['id'] != clip.get('parentRequestId', '') + '-half-0' + str(half):
            raise ValueError('HALF_PARENT_IDENTITY_CHANGED')
        sha(clip.get('parentVideoSha256'))
    return contract


def stable_identity(request, model, allow_frame_normalization=False, endpoint=None):
    images = [request['styledOpening'], *request['styledTriviews']]
    identity = dict(inputHash=sha(request['inputHash']), model=model, prompt=PREFIX + request['prompt'], parameters=PARAMETERS,
                    worldBuildHash=sha(request['inputIdentity']['worldBuildHash']), runtimeHash=sha(request['inputIdentity']['runtimeHash']),
                    imageSha256=[sha(ref['sha256']) for ref in images], videoSha256=sha(request['video']['sha256']),
                    outputContract=output_contract(request),
                    nativeAcceptancePolicy='allow-frame-normalization' if allow_frame_normalization else 'exact-output-contract')
    if endpoint is not None:
        identity['providerEndpoint'] = endpoint.rstrip('/')
    if request.get('durationSeconds') == 15:
        identity.update(clip=request['clip'], equivalentCount=0.5, styleQaProof=request['visualReviewProof'])
    encoded = json.dumps(identity, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
    return identity, hashlib.sha256(encoded).hexdigest()


@contextlib.contextmanager
def post_slot(directory, limit=16):
    """Advisory locks represent actual concurrent POST calls across dispatcher processes."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    acquired = None
    while acquired is None:
        for index in range(limit):
            stream = (directory / f'{index:02d}.lock').open('a+')
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = stream
                break
            except BlockingIOError:
                stream.close()
        if acquired is None:
            time.sleep(0.05)
    try:
        yield
    finally:
        fcntl.flock(acquired, fcntl.LOCK_UN)
        acquired.close()


class Dispatcher:
    def __init__(self, manifest, attempt, *, config, slot_script=None, prior_attempt=None, rejections=None,
                 post_slot_root=None, http=None, helper=None, api_key=None, signer=None, slot=None,
                 poll_interval=15, poll_timeout=5400, delivery_queue_prefix=None, queue_writer=None,
                 durable_checkpoint=None, restore_checkpoint=None, sdk_preflight=None):
        self.durable_checkpoint = durable_checkpoint
        self.restore_checkpoint = restore_checkpoint
        self._durable_saved = {}
        self.sdk_preflight = sdk_preflight or self.verify_prepared_request
        self.delivery_queue_prefix = delivery_queue_prefix
        self.queue_writer = queue_writer
        if not delivery_queue_prefix or not re.fullmatch(r's3://[a-z0-9.-]+/.+', delivery_queue_prefix) or queue_writer is None:
            raise ValueError('CLOUD_DELIVERY_QUEUE_REQUIRED')
        self.manifest_path = Path(manifest).absolute()
        if self.manifest_path.resolve() != self.manifest_path or not self.manifest_path.is_file():
            raise ValueError('MANIFEST_REGULAR_PATH_REQUIRED')
        self.root = self.manifest_path.parent
        self.data = read_json(self.manifest_path)
        if self.data.get('authorization', {}).get('seedanceSubmission') is not True or type(self.data['authorization'].get('maximumConcurrency')) is not int or not 1 <= self.data['authorization']['maximumConcurrency'] <= 160:
            raise ValueError('MANIFEST_SUBMISSION_AUTHORIZATION_REQUIRED')
        self.maximum_concurrency = self.data['authorization']['maximumConcurrency']
        self.attempt = attempt_name(attempt)
        self.prior_attempt = attempt_name(prior_attempt) if prior_attempt else None
        if self.attempt != 'attempt-01':
            retry = self.data['authorization'].get('retry', {})
            if not self.prior_attempt or int(self.attempt[8:]) != int(self.prior_attempt[8:]) + 1 or retry.get('attempt') != self.attempt or retry.get('priorAttempt') != self.prior_attempt or not retry.get('priorTaskId'):
                raise ValueError('EXPLICIT_RETRY_AUTHORIZATION_REQUIRED')
        elif self.prior_attempt:
            raise ValueError('FIRST_ATTEMPT_HAS_NO_PREDECESSOR')
        self.config = config
        self.helper = helper or load_helper()
        if http is None:
            import requests
            http = requests
        self.http = http
        self.key = api_key if api_key is not None else self.helper.load_api_key(config)
        self.helper.validate_config(config)
        self.endpoint = config['apiBaseUrl'].rstrip('/')
        self.slot_script = Path(slot_script).resolve() if slot_script else None
        if slot is None and self.slot_script is None:
            raise ValueError('GLOBAL_ACTIVE_SLOT_SCRIPT_REQUIRED')
        self.slot = slot or self._slot
        self.signer = signer or self._signed
        self.rejections = Path(rejections).resolve() if rejections else None
        self.post_slot_root = Path(post_slot_root or self.root / '.seedance-post-slots')
        self.poll_interval, self.poll_timeout = poll_interval, poll_timeout
        self.save_lock, self.upload_lock = threading.Lock(), threading.Lock()
        self.urls, self.states = {}, {}
        self.posts = threading.BoundedSemaphore(16)
        self.requests = self.data['requests']
        safe_id(self.data['caseId'])
        if not self.requests:
            raise ValueError('NONEMPTY_REQUESTS_REQUIRED')
        if self.prior_attempt and len(self.requests) != 1:
            raise ValueError('RETRY_REQUIRES_ONE_EXPLICIT_REQUEST')
        if poll_interval < 0 or poll_timeout <= 0:
            raise ValueError('INVALID_POLL_LIMITS')
        ids = [safe_id(request['id']) for request in self.requests]
        if len(set(ids)) != len(ids):
            raise ValueError('DUPLICATE_REQUEST_ID')
        self.anchors = {request['styleVariantId']: sha(request['styledOpening']['sha256']) for request in self.requests if request['segmentId'] == 'segment-00' and request.get('durationSeconds', 30) == 30}
        self.partial_anchor_refs = {}
        for style_id, ref in self.data.get('styleAnchors', {}).items():
            digest = sha(ref['sha256'])
            if style_id in self.anchors and self.anchors[style_id] != digest:
                raise ValueError('STYLE_ANCHOR_IDENTITY_CHANGED')
            self.partial_anchor_refs[style_id] = ref
            self.anchors[style_id] = digest
        for request in self.requests:
            if request.get('styleAnchorSha256') and sha(request['styleAnchorSha256']) != self.anchors.get(request['styleVariantId']):
                raise ValueError('STYLE_ANCHOR_IDENTITY_CHANGED')
            if request['styleVariantId'] not in self.anchors:
                raise ValueError('STYLE_ANCHOR_REQUIRED')

    def _slot(self, operation, state):
        subprocess.run(['node', str(self.slot_script), operation, state['inputHash'], state['inputHash'],
                        json.dumps({'attempt': state.get('attempt', self.attempt), 'taskId': state.get('taskId')})], cwd=REPO,
                       check=True, stdout=subprocess.DEVNULL, timeout=1800)

    def verify_prepared_request(self, request):
        checked = subprocess.run(['node', str(Path(__file__).with_name('seedance-preflight.mjs')),
            str(self.manifest_path), request['id']], cwd=REPO, capture_output=True, text=True, timeout=120)
        if checked.returncode:
            raise ValueError('PREPARED_REQUEST_NOT_VERIFIED: ' + self.helper.sanitize_text(checked.stderr[-500:]))
        proof = json.loads(checked.stdout)
        if proof.get('passed') is not True:
            raise ValueError('PREPARED_REQUEST_NOT_VERIFIED')
        return proof

    def save(self, state):
        with self.save_lock:
            self.states[state['id']] = dict(state)
            self.helper.write_json_atomic(self.root / state['id'] / self.attempt / 'seedance-state.json', state)
            self.helper.write_json_atomic(self.root / f'seedance-submissions-{self.attempt}.json', dict(
                kind='three-episode-seedance-submissions', caseId=self.data['caseId'], attempt=self.attempt,
                maximumConcurrency=self.maximum_concurrency, maximumConcurrentPosts=16, updatedAt=self.helper.now(),
                submittedCount=sum(bool(item.get('taskId')) for item in self.states.values()),
                completedCount=sum(item.get('status') in {'generated', 'succeeded'} for item in self.states.values()),
                nativeOutputCount=sum(bool(item.get('output')) for item in self.states.values()), requests=list(self.states.values())))
        self.checkpoint_submission(state)

    def checkpoint_submission(self, state):
        signature = (state.get('status'), state.get('taskId'))
        if self.durable_checkpoint is not None and self._durable_saved.get(state['id']) != signature:
            self.durable_checkpoint(dict(state))
            self._durable_saved[state['id']] = signature

    def queue_native(self, state, url):
        payload = dict(kind='seedance-native-delivery-queue', schemaVersion=1, caseId=self.data['caseId'],
            requestId=state['id'], styleId=state['styleVariantId'], attempt=self.attempt,
            inputHash=state['inputHash'], taskId=state['taskId'], providerVideoUrl=url,
            desiredOutput=state['desiredOutput'], nativeAcceptancePolicy=state['nativeAcceptancePolicy'],
            modelEndpoint=self.config['modelEndpoint'], payloadIdentitySha256=state['payloadIdentitySha256'],
            createdAt=state.get('submittedAt') or state['startedAt'])
        if state.get('durationSeconds') == 15:
            payload.update(clip=state['clip'], equivalentCount=0.5, parentRequestId=state['parentRequestId'], parentSegmentId=state['parentSegmentId'])
        uri = self.delivery_queue_prefix.rstrip('/') + '/' + state['inputHash'] + '-' + self.attempt + '.json'
        self.queue_writer(uri, payload)
        return uri

    def _signed(self, ref):
        raise ValueError('VERIFIED_CLOUD_REFERENCE_SIGNER_REQUIRED')

    def rejected(self, request):
        if not self.rejections:
            return False
        policy = read_json(self.rejections)  # Re-read immediately before POST, including after admission waits.
        return any(item.get('caseId') == self.data['caseId'] and item.get('styleId') == request['styleVariantId']
                   and sha(item['imageSha256']) == self.anchors[request['styleVariantId']] for item in policy.get('rejections', []))

    def verify(self, request):
        world = sha(request['inputIdentity']['worldBuildHash'])
        proof = request.get('captureProof') or self.data.get('visualReuseProofByWorldBuild', {}).get(world) or self.data.get('visualReuseProof', {})
        for key in ('worldBuildHash', 'runtimeHash'):
            expected = proof.get(key) or proof.get('new' + key[0].upper() + key[1:])
            if expected and sha(request['inputIdentity'][key]) != sha(expected):
                raise ValueError('SOURCE_IDENTITY_CHANGED')
        if proof.get('videoSha256') and sha(proof['videoSha256']) != sha(request['video']['sha256']):
            raise ValueError('CAPTURE_PROOF_VIDEO_CHANGED')
        if proof.get('firstFrameSha256'):
            first = request.get('whiteboxFirstFrame', {})
            if sha(first.get('sha256')) != sha(proof['firstFrameSha256']) or self.helper.sha256(Path(first['path'])) != sha(first['sha256']):
                raise ValueError('CAPTURE_PROOF_FIRST_FRAME_CHANGED')
        if sha(request['video']['sha256']) != sha(request['inputIdentity']['video']['sha256']):
            raise ValueError('REFERENCE_VIDEO_IDENTITY_CHANGED')
        if not request['styledTriviews']:
            raise ValueError('TARGET_REFERENCES_REQUIRED')
        # The preflight verifies the complete source target IDs and order.
        refs = [request['styledOpening'], *request['styledTriviews'], request['video']]
        if request['styleVariantId'] in self.partial_anchor_refs:
            refs.append(self.partial_anchor_refs[request['styleVariantId']])
        for ref in refs:
            source = Path(ref['path'])
            if source.resolve() != source.absolute() or source.is_symlink() or not source.is_file() or source.stat().st_size == 0 or self.helper.sha256(source) != sha(ref['sha256']):
                raise ValueError('INPUT_BYTES_CHANGED')
        contract = output_contract(request)
        media = self.helper.probe_video(Path(request['video']['path']))
        expected_media = {key: contract[key] for key in ('width', 'height', 'fps', 'frameCount')}
        if abs(media.get('durationSeconds', 0) - request.get('durationSeconds', 30)) > .05:
            raise ValueError('REFERENCE_DURATION_CHANGED')
        if request.get('durationSeconds') == 15:
            expected_media.update(durationSeconds=15, hasAudio=False)
            first = request.get('whiteboxFirstFrame', {})
            if first.get('frameIndex') != request['clip']['sourceFrameStart'] or first.get('videoSha256') != request['clip']['parentVideoSha256']:
                raise ValueError('HALF_ACTUAL_SOURCE_FRAME_REQUIRED')
        if any(media.get(key) != value for key, value in expected_media.items()):
            raise ValueError('REFERENCE_MEDIA_CONTRACT_CHANGED')

    def previous_terminal(self, request):
        if not self.prior_attempt:
            return None
        root = self.root / request['id']
        root /= self.prior_attempt
        prior_path = root / 'seedance-state.json'
        prior = read_json(prior_path) if prior_path.exists() else None
        if self.restore_checkpoint:
            remote = self.restore_checkpoint(request['inputHash'], self.prior_attempt)
            if remote:
                if prior and prior.get('taskId') and remote.get('taskId') != prior['taskId']:
                    raise ValueError('PREVIOUS_LOCAL_REMOTE_TASK_CONFLICT')
                prior = remote
        if not prior:
            raise ValueError('PREVIOUS_PROVIDER_TASK_ID_REQUIRED')
        expected = stable_identity(request, self.config['modelEndpoint'], self.config.get('allowFrameNormalization', False), self.endpoint)[1]
        if prior.get('inputHash') != request['inputHash'] or prior.get('id') != request['id'] or prior.get('payloadIdentitySha256') != expected:
            raise ValueError('PREVIOUS_REQUEST_IDENTITY_CHANGED')
        if not prior.get('taskId'):
            raise ValueError('PREVIOUS_PROVIDER_TASK_ID_REQUIRED')
        response = self.http.get(self.endpoint + '/' + prior['taskId'], headers=self.helper.headers(self.key), timeout=30, allow_redirects=False)
        response.raise_for_status()
        body = response.json()
        if body.get('status') not in REMOTE_TERMINAL:
            raise ValueError('PREVIOUS_PROVIDER_TASK_STILL_ACTIVE')
        if body.get('status') != 'failed':
            raise ValueError('PREVIOUS_PROVIDER_TASK_NOT_FAILED')
        code = (body.get('error') or {}).get('code', '')
        if re.search(r'Sensitive|Safety|ContentFilter', code, re.I) or body.get('video_url') or (body.get('content') or {}).get('video_url'):
            raise ValueError('PREVIOUS_PROVIDER_TASK_NOT_RETRYABLE')
        retry = self.data['authorization']['retry']
        if prior['taskId'] != retry['priorTaskId'] or body.get('id', prior['taskId']) != prior['taskId']:
            raise ValueError('PRIOR_PROVIDER_TASK_IDENTITY_CHANGED')
        return prior['taskId']

    def run(self, request):
        out = self.root / request['id'] / self.attempt
        if out.resolve() != out.absolute():
            raise ValueError('ATTEMPT_PATH_SYMLINK')
        out.mkdir(parents=True, exist_ok=True)
        if (out / 'dispatcher.lock').is_symlink() or any((out / name).is_symlink() for name in ('submission-intent.json', 'seedance-state.json')):
            raise ValueError('ATTEMPT_PATH_SYMLINK')
        with (out / 'dispatcher.lock').open('a+') as claim:
            try:
                fcntl.flock(claim, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('ATTEMPT_ALREADY_RUNNING')
            return self._run(request, out)

    def _run(self, request, out):
        identity, payload_hash = stable_identity(request, self.config['modelEndpoint'], self.config.get('allowFrameNormalization', False), self.endpoint)
        intent_path, state_path = out / 'submission-intent.json', out / 'seedance-state.json'
        old = read_json(state_path) if state_path.exists() else None
        if self.restore_checkpoint:
            remote = self.restore_checkpoint(request['inputHash'], self.attempt)
            if remote:
                if remote.get('payloadIdentitySha256') != payload_hash or remote.get('id') != request['id']:
                    raise RuntimeError('SUBMISSION_INPUT_CHANGED')
                if old and old.get('taskId') and old.get('taskId') != remote.get('taskId'):
                    if remote.get('taskId'):
                        raise RuntimeError('LOCAL_REMOTE_PROVIDER_TASK_CONFLICT')
                    # The POST response was persisted locally before a cloud checkpoint failed.
                    self.checkpoint_submission(old)
                else:
                    old = remote
                    self.helper.write_json_atomic(state_path, old)
                if not intent_path.exists():
                    self.helper.write_json_atomic(intent_path, dict(payloadIdentitySha256=payload_hash, identity=identity, restoredAt=self.helper.now()))
            elif old and old.get('taskId'):
                raise RuntimeError('PROVIDER_TASK_WITHOUT_CLOUD_JOURNAL')
        if intent_path.exists():
            if read_json(intent_path).get('payloadIdentitySha256') != payload_hash:
                raise RuntimeError('SUBMISSION_INPUT_CHANGED')
            if not old:
                raise RuntimeError('INTERRUPTED_ATTEMPT_REQUIRES_RECONCILIATION')
        elif old:
            raise RuntimeError('UNJOURNALED_ATTEMPT_REQUIRES_RECONCILIATION')
        else:
            try:
                self.sdk_preflight(request)
            except Exception as error:
                # Unverified captures stop before a paid-attempt intent is created.
                return dict(id=request['id'], inputHash=request['inputHash'], status='preflight-blocked',
                            taskId=None, error=self.helper.sanitize_text(str(error)))
            with intent_path.open('x', encoding='utf-8') as stream:
                json.dump(dict(payloadIdentitySha256=payload_hash, identity=identity, createdAt=self.helper.now()), stream, ensure_ascii=False, indent=2)
                stream.flush(); os.fsync(stream.fileno())
        if old and (old.get('payloadIdentitySha256') != payload_hash or old.get('inputHash') != request['inputHash']):
            raise RuntimeError('SUBMISSION_INPUT_CHANGED')
        state = old or dict(id=request['id'], inputHash=request['inputHash'], payloadIdentitySha256=payload_hash,
            styleVariantId=request['styleVariantId'], segmentId=request['segmentId'], anchorSha256=self.anchors[request['styleVariantId']],
            status='preparing', taskId=None, modelEndpoint=self.config['modelEndpoint'], startedAt=self.helper.now(),
            providerSubmitted=False, attempt=self.attempt, nativeParameters=PARAMETERS, referenceOrder='styled-opening-then-target-triviews',
            desiredOutput=output_contract(request, delivery=True), nativeAcceptancePolicy=identity['nativeAcceptancePolicy'])
        if not old and request.get('durationSeconds') == 15:
            state.update(durationSeconds=15, equivalentCount=0.5, clip=request['clip'], desiredOutput=output_contract(request, delivery=True),
                         parentRequestId=request['parentRequestId'], parentSegmentId=request['parentSegmentId'], clipStartSeconds=request['clipStartSeconds'])
        if old and not old.get('taskId') and old.get('status') in {'submitting', 'submission-unknown'}:
            state.update(status='submission-unknown', error='Submission may have reached provider; never repost this attempt')
        if state['status'] in LOCAL_TERMINAL:
            if state.get('output') and self.helper.sha256(Path(state['output']['path'])) != state['output']['sha256']:
                raise RuntimeError('NATIVE_OUTPUT_CHANGED')
            self.save(state)
            return state
        self.save(state)
        # Refreshing delivery transport cannot make an already completed model
        # task active again, even when the provider GET is temporarily offline.
        held, post_started = False, bool(state.get('taskId'))
        terminal = bool(state.get('taskId') and (state.get('providerGenerated') or state.get('providerStatus') in REMOTE_TERMINAL))
        try:
            if not state.get('taskId'):
                try:
                    state['targetSdkAdmission'] = self.sdk_preflight(request)
                except Exception as error:
                    state.update(status='preflight-blocked', error=self.helper.sanitize_text(str(error)))
                    terminal=True; self.save(state); return state
                self.verify(request)
                if self.rejected(request):
                    state.update(status='human-rejected'); self.save(state); return state
                state['supersedesTaskId'] = self.previous_terminal(request)
            self.slot('enter', state); held = True
            if not state.get('taskId'):
                with self.posts, post_slot(self.post_slot_root):
                    if self.rejected(request):
                        state.update(status='human-rejected'); self.save(state); return state
                    try:
                        state['targetSdkAdmission'] = self.sdk_preflight(request)
                    except Exception as error:
                        state.update(status='preflight-blocked', error=self.helper.sanitize_text(str(error)))
                        terminal=True; self.save(state); return state
                    self.verify(request)
                    if self.prior_attempt:
                        self.previous_terminal(request)
                    # Admission and POST-slot waits can exceed a signed URL's
                    # lifetime. Sign verified references only after both waits.
                    images = [request['styledOpening'], *request['styledTriviews']]
                    content = [dict(type='text', text=identity['prompt'])]
                    content += [dict(type='image_url', image_url={'url': self.signer(ref)}, role='reference_image') for ref in images]
                    content += [dict(type='video_url', video_url={'url': self.signer(request['video'])}, role='reference_video')]
                    payload = dict(model=self.config['modelEndpoint'], content=content, **PARAMETERS)
                    state.update(status='submitting', submissionStartedAt=self.helper.now()); self.save(state)
                    post_started = True
                    response = self.http.post(self.endpoint, headers=self.helper.headers(self.key), json=payload, timeout=180, allow_redirects=False)
                    if not response.ok:
                        # A 5xx/timeout response can conceal a created task. Never claim definite rejection.
                        definite = 400 <= response.status_code < 500 and response.status_code not in {408, 409, 425, 429}
                        terminal = definite
                        state.update(status='rejected' if definite else 'submission-unknown', error=self.helper.safe_response(response))
                        self.save(state); return state
                    body = response.json()
                    task_id = str(body.get('id') or '')
                    if not task_id:
                        raise RuntimeError('ARK_TASK_ID_MISSING')
                    state.update(status='submitted', taskId=task_id, providerSubmitted=True, submittedAt=self.helper.now()); self.save(state)
            deadline = time.monotonic() + self.poll_timeout
            while time.monotonic() < deadline:
                try:
                    response = self.http.get(self.endpoint + '/' + state['taskId'], headers=self.helper.headers(self.key), timeout=45, allow_redirects=False)
                    response.raise_for_status()
                    body = response.json()
                except Exception:
                    time.sleep(self.poll_interval); continue
                status = str(body.get('status') or 'unknown')
                state['providerStatus'] = status
                if status in REMOTE_TERMINAL:
                    terminal = True
                    if status != 'succeeded':
                        error = body.get('error') or {}
                        state.update(status='failed-provider', providerErrorCode=error.get('code'), error=self.helper.sanitize_text({'code': error.get('code'), 'message': error.get('message')}), finishedAt=self.helper.now())
                    else:
                        url = (body.get('content') or {}).get('video_url') or body.get('video_url')
                        if not url:
                            raise RuntimeError('OUTPUT_URL_MISSING')
                        uri = self.queue_native(state, url)
                        state.update(status='delivery-queued', providerGenerated=True, deliveryQueueS3Uri=uri, finishedAt=self.helper.now())
                        self.save(state); return state
                    self.save(state); return state
                state['status'] = status; self.save(state)
                time.sleep(self.poll_interval)
            state.update(status='remote-pending', error='Provider remains non-terminal after bounded polling'); self.save(state); return state
        except Exception as error:
            state.update(status='submission-unknown' if post_started and not state.get('taskId') else 'remote-pending' if state.get('taskId') else 'preparation-failed', error=self.helper.sanitize_text(str(error)))
            self.save(state); return state
        finally:
            if held and (terminal or not post_started and not state.get('taskId')):
                self.slot('leave', state)

    def dispatch(self, only_request=None):
        if only_request and set(only_request) - {request['id'] for request in self.requests}:
            raise ValueError('UNKNOWN_SELECTED_REQUEST')
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.maximum_concurrency) as executor:
            futures = [executor.submit(self.run, request) for request in self.requests if only_request is None or request['id'] in only_request]
            results = []
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())
            return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--only-request', action='append')
    parser.add_argument('--attempt', required=True)
    parser.add_argument('--slot-script', default=str(Path(__file__).with_name('seedance-slot.mjs')))
    parser.add_argument('--prior-attempt')
    parser.add_argument('--rejections')
    parser.add_argument('--post-slot-root', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--delivery-queue-prefix', required=True)
    parser.add_argument('--submission-journal-prefix', required=True)
    parser.add_argument('--poll-interval', type=float, default=15)
    parser.add_argument('--poll-timeout', type=float, default=5400)
    args = parser.parse_args()
    cloud = any(os.environ.get(key) for key in ('KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI',
        'ECS_CONTAINER_METADATA_URI_V4', 'AWS_BATCH_JOB_ID'))
    if os.environ.get('WORLDKIT_CLOUD_MEDIA_HOST') != '1' or sys.platform != 'linux' or not cloud:
        raise ValueError('SEEDANCE_CLOUD_HOST_REQUIRED')
    helper = load_helper()
    config = helper.validate_config(read_json(args.config))
    storage = helper.CloudStorage(config, args.submission_journal_prefix, args.delivery_queue_prefix)
    dispatcher = Dispatcher(args.manifest, args.attempt, config=config, helper=helper, slot_script=args.slot_script,
        prior_attempt=args.prior_attempt, rejections=args.rejections, post_slot_root=args.post_slot_root,
        poll_interval=args.poll_interval, poll_timeout=args.poll_timeout,
        delivery_queue_prefix=args.delivery_queue_prefix, queue_writer=storage.queue, signer=storage.signed,
        durable_checkpoint=storage.checkpoint, restore_checkpoint=storage.restore)
    results = dispatcher.dispatch(args.only_request)
    print(json.dumps(dict(attempt=dispatcher.attempt, statuses={status: sum(result['status'] == status for result in results) for status in sorted({result['status'] for result in results})})))
    return 0 if results and all(result['status'] == 'delivery-queued' for result in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
