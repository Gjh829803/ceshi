import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).resolve().parents[2] / 'src/seedance' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


dispatch = module('seedance-dispatch')
provider = module('seedance-provider')


class Helper:
    now = staticmethod(provider.now)
    sha256 = staticmethod(provider.sha256)
    headers = staticmethod(provider.headers)
    sanitize_text = staticmethod(provider.sanitize_text)
    safe_response = staticmethod(provider.safe_response)
    write_json_atomic = staticmethod(provider.write_json_atomic)
    validate_config = staticmethod(provider.validate_config)
    probe_video = staticmethod(lambda path: dict(width=1280, height=720, fps=24, frameCount=720, durationSeconds=30, hasAudio=False))


class Response:
    def __init__(self, value, status=200):
        self.value, self.status_code, self.ok = value, status, 200 <= status < 300

    def json(self): return self.value
    def raise_for_status(self):
        if not self.ok: raise RuntimeError('HTTP_FAILED')


class HTTP:
    def __init__(self, uncertain=False, post_status=200, status='succeeded'):
        self.uncertain, self.post_status, self.status = uncertain, post_status, status
        self.posts, self.gets = [], []
        self.output_url = 'https://provider.test/native.mp4?private=secret'
        self.fail_get = False

    def post(self, url, **kwargs):
        self.posts.append(copy.deepcopy(kwargs['json']))
        if self.uncertain: raise TimeoutError('lost POST response')
        return Response({'id': 'provider-1'}, self.post_status)

    def get(self, url, **kwargs):
        self.gets.append(url)
        if self.fail_get: raise TimeoutError('provider unavailable')
        return Response({'id': url.rsplit('/', 1)[-1], 'status': self.status,
            'content': {'video_url': self.output_url} if self.status == 'succeeded' else {},
            'error': {'code': 'InternalServiceError', 'message': 'provider failed'}})


class Tests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        refs = []
        for index in range(7):
            source = self.root / f'{index}.bin'
            source.write_bytes(f'material-{index}'.encode())
            refs.append(dict(path=str(source), sha256=provider.sha256(source)))
        self.request = dict(id='style-00-segment-00', inputHash='a' * 64,
            styleVariantId='style-00', segmentId='segment-00', prompt='Restyle the source movement.',
            styledOpening=refs[0], styledTriviews=refs[1:6], video=refs[6],
            inputIdentity=dict(worldBuildHash='b' * 64, runtimeHash='c' * 64, video={'sha256': refs[6]['sha256']}))
        self.data = dict(kind='three-episode-ready-seedance', schemaVersion=1, caseId='case-01',
            authorization=dict(seedanceSubmission=True, maximumConcurrency=2), requests=[self.request])
        self.manifest = self.root / 'manifest.json'
        self.config = dict(kind='three-episode-seedance-provider', schemaVersion=1,
            apiBaseUrl='https://provider.test/tasks', modelEndpoint='example-model',
            referenceUpload=dict(bucket='test-bucket', prefix='references', region='us-east-2', presignSeconds=3600))
        self.http, self.queues, self.slots = HTTP(), [], []

    def make(self, **overrides):
        self.manifest.write_text(json.dumps(self.data))
        defaults = dict(config=self.config, helper=Helper(), http=self.http, api_key='fake-only',
            signer=lambda ref: 'https://materials.test/' + ref['sha256'],
            slot=lambda op, state: self.slots.append((op, state.get('taskId'))),
            delivery_queue_prefix='s3://test-bucket/queue', queue_writer=lambda uri, value: self.queues.append((uri, value)),
            sdk_preflight=lambda request: {'passed': True}, poll_interval=0, poll_timeout=.01)
        defaults.update(overrides)
        attempt = defaults.pop('attempt', '01')
        return dispatch.Dispatcher(self.manifest, attempt, **defaults)

    def test_real_payload_and_queue_then_resume_do_not_repost(self):
        driver = self.make()
        result = driver.dispatch()[0]
        self.assertEqual(result['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts), 1)
        payload = self.http.posts[0]
        self.assertEqual(payload['duration'], -1)
        self.assertEqual(payload['omni_reference_task_type'], 'edit')
        self.assertEqual(payload['content'][0]['text'], dispatch.PREFIX + self.request['prompt'])
        self.assertEqual([r['image_url']['url'] for r in payload['content'][1:7]],
            ['https://materials.test/' + ref['sha256'] for ref in [self.request['styledOpening'], *self.request['styledTriviews']]])
        queued = self.queues[0][1]
        self.assertEqual(queued['desiredOutput']['frameCount'], 720)
        self.assertEqual(queued['nativeAcceptancePolicy'], 'exact-output-contract')
        self.assertNotIn('providerVideoUrl', result)
        self.assertEqual(self.make().dispatch()[0]['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts), 1)
        self.assertEqual([op for op, _ in self.slots], ['enter', 'leave', 'enter', 'leave'])

    def test_paid_success_requeues_fresh_transport_url_without_new_post(self):
        first = self.make().dispatch()[0]
        self.http.output_url = 'https://provider.test/native.mp4?fresh=renewed'
        second = self.make().dispatch()[0]
        self.assertEqual(second['status'], 'delivery-queued')
        self.assertEqual(second['taskId'], first['taskId'])
        self.assertEqual(len(self.http.posts), 1)
        self.assertEqual(self.queues[-1][1]['providerVideoUrl'], self.http.output_url)
        self.assertEqual(self.queues[-1][1]['payloadIdentitySha256'], self.queues[0][1]['payloadIdentitySha256'])

    def test_paid_success_refresh_network_failure_keeps_original_task(self):
        first = self.make().dispatch()[0]
        self.http.fail_get = True
        second = self.make().dispatch()[0]
        self.assertEqual(second['status'], 'remote-pending')
        self.assertEqual(second['taskId'], first['taskId'])
        self.assertTrue(second['providerGenerated'])
        self.assertEqual(len(self.http.posts), 1)
        self.assertEqual([op for op, _ in self.slots], ['enter', 'leave', 'enter', 'leave'])
        self.http.fail_get = False
        self.assertEqual(self.make().dispatch()[0]['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts), 1)

    def test_uncertain_post_never_reposted_and_keeps_slot(self):
        self.http.uncertain = True
        self.assertEqual(self.make().dispatch()[0]['status'], 'submission-unknown')
        self.assertEqual(self.make().dispatch()[0]['status'], 'submission-unknown')
        self.assertEqual(len(self.http.posts), 1)
        self.assertEqual([op for op, _ in self.slots], ['enter'])

    def test_http_500_fences_but_definite_400_releases(self):
        self.http.post_status = 500
        self.assertEqual(self.make().dispatch()[0]['status'], 'submission-unknown')
        self.assertEqual(self.slots, [('enter', None)])

    def test_definite_provider_rejection_is_terminal(self):
        self.http.post_status = 400
        self.assertEqual(self.make().dispatch()[0]['status'], 'rejected')
        self.assertEqual([op for op, _ in self.slots], ['enter', 'leave'])

    def test_existing_task_only_polled_after_queue_transport_failure(self):
        def fail(uri, value): raise IOError('queue unavailable')
        self.assertEqual(self.make(queue_writer=fail).dispatch()[0]['status'], 'remote-pending')
        self.assertEqual(self.make().dispatch()[0]['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts), 1)
        self.assertTrue(all(url.endswith('/provider-1') for url in self.http.gets))

    def test_provider_failure_does_not_count_as_delivery(self):
        self.http.status = 'failed'
        result = self.make().dispatch()[0]
        self.assertEqual(result['status'], 'failed-provider')
        self.assertEqual(self.queues, [])
        self.assertEqual(self.make().dispatch()[0]['status'], 'failed-provider')
        self.assertEqual(len(self.http.posts), 1)

    def test_preflight_blocks_without_creating_paid_intent(self):
        def fail(request): raise ValueError('REVIEW_NOT_PASSED')
        self.assertEqual(self.make(sdk_preflight=fail).dispatch()[0]['status'], 'preflight-blocked')
        self.assertFalse(list(self.root.rglob('submission-intent.json')))
        self.assertEqual(self.http.posts, [])

    def test_preflight_rechecked_after_wait(self):
        blocked = False
        def slot(op, state):
            nonlocal blocked
            if op == 'enter': blocked = True
        def guard(request):
            if blocked: raise ValueError('REVIEW_CHANGED')
            return {'passed': True}
        self.assertEqual(self.make(slot=slot, sdk_preflight=guard).dispatch()[0]['status'], 'preflight-blocked')
        self.assertEqual(self.http.posts, [])

    def test_reference_urls_are_signed_after_admission_and_final_preflight(self):
        events = []
        def slot(operation, state): events.append(operation)
        def preflight(request): events.append('preflight'); return {'passed': True}
        def signer(ref): events.append('sign'); return 'https://materials.test/' + ref['sha256']
        def checkpoint(state):
            if state['status'] == 'submitting': events.append('intent-checkpoint')
        result = self.make(slot=slot, sdk_preflight=preflight, signer=signer, durable_checkpoint=checkpoint).dispatch()[0]
        self.assertEqual(result['status'], 'delivery-queued')
        self.assertLess(events.index('enter'), events.index('sign'))
        self.assertLess(max(i for i, event in enumerate(events) if event == 'preflight'), events.index('sign'))
        self.assertLess(max(i for i, event in enumerate(events) if event == 'sign'), events.index('intent-checkpoint'))

    def test_exact_material_bytes_rechecked_before_post(self):
        def slot(op, state):
            if op == 'enter': Path(self.request['video']['path']).write_bytes(b'changed')
        self.assertEqual(self.make(slot=slot).dispatch()[0]['status'], 'preparation-failed')
        self.assertEqual(self.http.posts, [])

    def test_changed_prompt_or_normalization_policy_cannot_reuse_attempt(self):
        self.make().dispatch()
        self.config['allowFrameNormalization'] = True
        with self.assertRaisesRegex(RuntimeError, 'SUBMISSION_INPUT_CHANGED'):
            self.make().dispatch()
        self.assertEqual(len(self.http.posts), 1)

    def test_endpoint_change_does_not_reuse_an_existing_provider_task(self):
        self.make().dispatch()
        self.config['apiBaseUrl'] = 'https://another-provider.test/tasks'
        with self.assertRaisesRegex(RuntimeError, 'SUBMISSION_INPUT_CHANGED'):
            self.make().dispatch()
        self.assertEqual(len(self.http.posts), 1)

    def test_source_can_have_a_different_number_of_targets(self):
        self.request['styledTriviews'] = self.request['styledTriviews'][:2]
        self.assertEqual(self.make().dispatch()[0]['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts[0]['content']), 5)

    def test_explicit_normalization_permission_is_bound_and_queued(self):
        self.config['allowFrameNormalization'] = True
        self.make().dispatch()
        self.assertEqual(self.queues[0][1]['nativeAcceptancePolicy'], 'allow-frame-normalization')
        self.assertNotEqual(dispatch.stable_identity(self.request, 'model')[1], dispatch.stable_identity(self.request, 'model', True)[1])

    def test_transport_location_does_not_change_provider_identity(self):
        changed = copy.deepcopy(self.request)
        changed['video']['path'] = '/different/material'
        changed['video']['s3Uri'] = 's3://different-bucket/material'
        self.assertEqual(dispatch.stable_identity(self.request, 'model'), dispatch.stable_identity(changed, 'model'))

    def test_new_attempt_needs_explicit_failed_predecessor(self):
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_RETRY_AUTHORIZATION_REQUIRED'):
            self.make(attempt='02')

    def test_retry_authorization_cannot_skip_attempt_numbers(self):
        self.data['authorization']['retry'] = {'attempt': 'attempt-03', 'priorAttempt': 'attempt-01', 'priorTaskId': 'provider-1'}
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_RETRY_AUTHORIZATION_REQUIRED'):
            self.make(attempt='03', prior_attempt='01')

    def test_explicit_retry_checks_real_failed_task_and_same_material_identity(self):
        self.http.status = 'failed'
        first = self.make().dispatch()[0]
        self.data['authorization']['retry'] = {'attempt': 'attempt-02', 'priorAttempt': 'attempt-01', 'priorTaskId': first['taskId']}
        self.assertEqual(self.make(attempt='02', prior_attempt='01').dispatch()[0]['status'], 'failed-provider')
        self.assertEqual(len(self.http.posts), 2)

    def test_live_predecessor_cannot_be_retried(self):
        self.http.status = 'running'
        first = self.make().dispatch()[0]
        self.data['authorization']['retry'] = {'attempt': 'attempt-02', 'priorAttempt': 'attempt-01', 'priorTaskId': first['taskId']}
        result = self.make(attempt='02', prior_attempt='01').dispatch()[0]
        self.assertEqual(result['status'], 'preparation-failed')
        self.assertIn('PREVIOUS_PROVIDER_TASK_STILL_ACTIVE', result['error'])
        self.assertEqual(len(self.http.posts), 1)

    def test_symlink_attempt_directory_is_rejected(self):
        target = self.root / 'other'
        target.mkdir()
        (self.root / self.request['id']).symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'ATTEMPT_PATH_SYMLINK'): self.make().dispatch()
        self.assertEqual(self.http.posts, [])

    def test_cloud_journal_restores_paid_task_without_material_or_post(self):
        self.http.status = 'running'
        prior = self.make().dispatch()[0]
        self.assertEqual(prior['status'], 'remote-pending')
        for path in list(self.root.rglob('submission-intent.json')) + list(self.root.rglob('seedance-state.json')):
            path.unlink()
        Path(self.request['video']['path']).unlink()
        self.http.status = 'succeeded'
        self.assertEqual(self.make(restore_checkpoint=lambda key, attempt: prior).dispatch()[0]['status'], 'delivery-queued')
        self.assertEqual(len(self.http.posts), 1)

    def test_cloud_unknown_intent_restoration_never_posts(self):
        self.http.uncertain = True
        prior = self.make().dispatch()[0]
        for path in list(self.root.rglob('submission-intent.json')) + list(self.root.rglob('seedance-state.json')):
            path.unlink()
        self.http.uncertain = False
        self.assertEqual(self.make(restore_checkpoint=lambda key, attempt: prior).dispatch()[0]['status'], 'submission-unknown')
        self.assertEqual(len(self.http.posts), 1)

    def test_failed_durable_prepost_checkpoint_never_posts(self):
        def checkpoint(state):
            if state['status'] == 'submitting': raise IOError('durable unavailable')
        self.assertEqual(self.make(durable_checkpoint=checkpoint).dispatch()[0]['status'], 'preparation-failed')
        self.assertEqual(self.http.posts, [])

    def test_half_identity_requires_exact_parent_frames(self):
        half = copy.deepcopy(self.request)
        half.update(durationSeconds=15, equivalentCount=.5, parentRequestId=self.request['id'],
            id=self.request['id'] + '-half-01', visualReviewProof={'passed': True},
            clip=dict(kind='three-episode-half-clip', halfIndex=1, parentRequestId=self.request['id'], parentVideoSha256='d' * 64,
                sourceTimeStartSeconds=15, sourceTimeEndSeconds=30, sourceFrameStart=360, sourceFrameEndExclusive=720,
                frameCount=360, fps=24, durationSeconds=15, equivalentCount=.5))
        self.assertEqual(dispatch.output_contract(half)['frameCount'], 360)
        half['clip']['sourceFrameStart'] = 359
        with self.assertRaisesRegex(ValueError, 'HALF_CLIP_CONTRACT_REQUIRED'): dispatch.output_contract(half)

    def test_config_rejects_inline_credentials_and_nonhttps(self):
        self.config['apiKey'] = 'not-accepted'
        with self.assertRaises(ValueError): provider.validate_config(self.config)
        del self.config['apiKey']
        self.config['apiBaseUrl'] = 'http://provider.test/tasks'
        with self.assertRaises(ValueError): provider.validate_config(self.config)

    def test_cli_rejects_local_media_execution_before_loading_credentials(self):
        argv = ['seedance-dispatch.py', '--manifest', 'unused', '--attempt', '01', '--config', 'unused',
            '--delivery-queue-prefix', 's3://test-bucket/queue', '--submission-journal-prefix', 's3://test-bucket/journal', '--post-slot-root', 'unused']
        with patch('sys.argv', argv), patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'SEEDANCE_CLOUD_HOST_REQUIRED'): dispatch.main()
        with patch('sys.argv', argv), patch('sys.platform', 'linux'), patch.dict(os.environ, {'WORLDKIT_CLOUD_MEDIA_HOST': '1'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'SEEDANCE_CLOUD_HOST_REQUIRED'): dispatch.main()
        for environment in ('KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_BATCH_JOB_ID'):
            with self.subTest(environment=environment), patch('sys.argv', argv), patch('sys.platform', 'linux'), patch.dict(os.environ, {'WORLDKIT_CLOUD_MEDIA_HOST': '1', environment: 'test-host'}, clear=True), patch.object(dispatch, 'load_helper', side_effect=RuntimeError('GUARD_PASSED_NO_IO')):
                with self.assertRaisesRegex(RuntimeError, 'GUARD_PASSED_NO_IO'): dispatch.main()


class S3Error(Exception):
    def __init__(self, code): self.response = {'Error': {'Code': code}}


class S3:
    def __init__(self): self.objects, self.serial = {}, 0
    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects: raise S3Error('NoSuchKey')
        body, etag = self.objects[Bucket, Key]
        return {'Body': io.BytesIO(body), 'ETag': etag}
    def put_object(self, Bucket, Key, Body, **kwargs):
        old = self.objects.get((Bucket, Key))
        if kwargs.get('IfNoneMatch') == '*' and old: raise S3Error('PreconditionFailed')
        if 'IfMatch' in kwargs and (not old or old[1] != kwargs['IfMatch']): raise S3Error('PreconditionFailed')
        self.serial += 1
        etag = f'"{self.serial}"'
        self.objects[Bucket, Key] = Body, etag
        return {'ETag': etag}


class CloudJournalTests(unittest.TestCase):
    def storage(self, client):
        return provider.CloudStorage({'referenceUpload': {'region': 'us-east-2'}}, 's3://test-bucket/journal', 's3://test-bucket/queue', client)

    def test_concurrent_journal_writer_is_fenced_by_etag(self):
        client = S3(); first = self.storage(client); second = self.storage(client)
        state = dict(inputHash='a' * 64, attempt='attempt-01', status='preparing')
        first.checkpoint(state)
        self.assertEqual(second.restore('a' * 64, 'attempt-01')['status'], 'preparing')
        first.checkpoint({**state, 'status': 'submitting'})
        with self.assertRaisesRegex(RuntimeError, 'CHECKPOINT_FAILED'):
            second.checkpoint({**state, 'status': 'submitting'})

    def test_queue_replay_checks_task_and_normalization_policy(self):
        store = self.storage(S3())
        value = dict(caseId='case-01', requestId='request-01', attempt='attempt-01', inputHash='a' * 64,
            taskId='paid-task', desiredOutput={'frameCount': 720}, nativeAcceptancePolicy='exact-output-contract')
        store.queue('s3://test-bucket/queue/item.json', value)
        store.queue('s3://test-bucket/queue/item.json', value)
        with self.assertRaisesRegex(ValueError, 'QUEUE_IDENTITY_CONFLICT'):
            store.queue('s3://test-bucket/queue/item.json', {**value, 'nativeAcceptancePolicy': 'allow-frame-normalization'})

    def test_queue_refresh_only_changes_transport_fields(self):
        client = S3(); store = self.storage(client)
        value = dict(caseId='case-01', requestId='request-01', attempt='attempt-01', inputHash='a' * 64,
            taskId='paid-task', desiredOutput={'frameCount': 720}, nativeAcceptancePolicy='exact-output-contract',
            modelEndpoint='model-1', providerVideoUrl='https://provider.test/expired', createdAt='original-time')
        uri = 's3://test-bucket/queue/item.json'
        store.queue(uri, value)
        store.queue(uri, {**value, 'providerVideoUrl': 'https://provider.test/refreshed'})
        renewed = json.loads(client.get_object(Bucket='test-bucket', Key='queue/item.json')['Body'].read())
        self.assertEqual(renewed['providerVideoUrl'], 'https://provider.test/refreshed')
        self.assertTrue(renewed['refreshedAt'])
        self.assertEqual({k: v for k, v in renewed.items() if k not in {'providerVideoUrl', 'refreshedAt'}},
            {k: v for k, v in value.items() if k != 'providerVideoUrl'})
        with self.assertRaisesRegex(ValueError, 'QUEUE_IDENTITY_CONFLICT'):
            store.queue(uri, {**value, 'modelEndpoint': 'model-2'})

    def test_queue_refresh_conflict_preserves_other_writers_url(self):
        class ConcurrentS3(S3):
            def put_object(self, Bucket, Key, Body, **kwargs):
                if 'IfMatch' in kwargs:
                    concurrent = json.loads(Body)
                    concurrent['providerVideoUrl'] = 'https://provider.test/concurrent-newest'
                    super().put_object(Bucket=Bucket, Key=Key, Body=json.dumps(concurrent).encode())
                return super().put_object(Bucket=Bucket, Key=Key, Body=Body, **kwargs)
        client = ConcurrentS3(); store = self.storage(client)
        value = dict(taskId='paid-task', inputHash='a' * 64, providerVideoUrl='https://provider.test/expired')
        uri = 's3://test-bucket/queue/item.json'
        store.queue(uri, value)
        with self.assertRaisesRegex(RuntimeError, 'QUEUE_REFRESH_CONFLICT'):
            store.queue(uri, {**value, 'providerVideoUrl': 'https://provider.test/stale-refresh'})
        current = json.loads(client.get_object(Bucket='test-bucket', Key='queue/item.json')['Body'].read())
        self.assertEqual(current['providerVideoUrl'], 'https://provider.test/concurrent-newest')


if __name__ == '__main__': unittest.main()
