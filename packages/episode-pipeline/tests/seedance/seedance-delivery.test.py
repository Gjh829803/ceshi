import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('delivery', (Path(__file__).parent / "../../src/seedance/seedance-delivery.py"))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class FakeStore:
    def __init__(self):
        self.uploads = []

    def upload(self, path, relative, content_type):
        self.uploads.append(str(path))
        return dict(s3Uri='s3://leap-world-us-east-2/test/' + relative + '/' + Path(path).name,
                    sha256=d.digest(path), bytes=Path(path).stat().st_size, headVerifiedAt=d.now())


class DeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name).resolve()
        cls.raw = cls.root / 'native-713-fixture.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=24',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-frames:v', '713',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-t', '29.708333333',
                        str(cls.raw)], check=True, timeout=40)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_actual_half_delivery_353_to_360_is_half_equivalent_and_cannot_reuse_full_contract(self):
        import shutil
        source = self.root / 'half-source'
        request_id = 'style-00-segment-00-half-00'
        attempt = source / 'case-half' / request_id / 'attempt-01'
        attempt.mkdir(parents=True)
        raw = attempt / 'provider-original.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(self.raw), '-frames:v', '353',
                        '-c:v', 'copy', '-c:a', 'aac', '-t', '14.708333333', str(raw)], check=True, timeout=30)
        clip = dict(kind='three-episode-half-clip', parentRequestId='style-00-segment-00',
                    parentVideoSha256='e'*64, halfIndex=0, sourceFrameStart=0, sourceFrameEndExclusive=360,
                    sourceTimeStartSeconds=0, sourceTimeEndSeconds=15, frameCount=360, fps=24, durationSeconds=15)
        state = dict(id=request_id, status='generated', taskId='half-provider', inputHash='f'*64, nativeAcceptancePolicy=d.NORMALIZE_POLICY,
                     desiredOutput=d.HALF_DESIRED, equivalentCount=.5, clip=clip,
                     output=dict(path=str(raw), sha256=d.digest(raw)))
        state_path = attempt / 'seedance-state.json'
        d.write(state_path, state)
        worker = d.Worker(source, self.root / 'half-deliveries', FakeStore(), allow_frame_normalization=True)
        done = worker.deliver(state_path)
        self.assertEqual(done['normalized']['media']['frameCount'], 360)
        self.assertTrue(d.normalized_ok(done['normalized']['media'], d.HALF_DESIRED))
        self.assertFalse(d.normalized_ok(done['normalized']['media']))
        self.assertEqual(done['equivalentCount'], .5)
        self.assertEqual(done['clip']['parentVideoSha256'], 'e'*64)
        self.assertEqual(worker.deliver(state_path), done)
        self.assertTrue(raw.exists())
        state['desiredOutput'] = d.DESIRED
        d.write(state_path, state)
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_DELIVERY_INPUT_CHANGED'):
            worker.deliver(state_path)

    def test_half_queue_rejects_missing_parent_wrong_equivalent_or_overlapping_frames(self):
        clip = dict(kind='three-episode-half-clip', parentRequestId='style-00-segment-00', parentVideoSha256='e'*64,
                    halfIndex=1, sourceFrameStart=360, sourceFrameEndExclusive=720,
                    sourceTimeStartSeconds=15, sourceTimeEndSeconds=30, frameCount=360, fps=24, durationSeconds=15)
        value = dict(kind=d.QUEUE_KIND, schemaVersion=1, caseId='case-half', requestId='style-00-segment-00-half-01',
                     styleId='style-00', attempt='attempt-01', inputHash='f'*64, taskId='half-provider',
                     desiredOutput=d.HALF_DESIRED, equivalentCount=.5, clip=clip, providerVideoUrl='https://example.com/private.mp4')
        self.assertEqual(d.queue_payload(value), value)
        for invalid in [{**value, 'equivalentCount': 1}, {**value, 'clip': None},
                        {**value, 'clip': {**clip, 'sourceFrameStart': 359}},
                        {**value, 'clip': {**clip, 'parentVideoSha256': None}},
                        {**value, 'desiredOutput': d.DESIRED}]:
            with self.assertRaises(ValueError):
                d.queue_payload(invalid)

    def test_two_shards_are_disjoint_complete_stable_and_enforced(self):
        base = 's3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/shard-test'
        workers = [d.QueueWorker(None, base + '/queue', base + '/completed', self.root / f'shard-{i}', FakeStore(), i, 2) for i in range(2)]
        keys = [workers[0].queue_prefix + '/' + f'{i:064x}-attempt-01.json' for i in range(2000)]
        owners = [{key for key in keys if worker.owns(key)} for worker in workers]
        self.assertFalse(owners[0] & owners[1])
        self.assertEqual(owners[0] | owners[1], set(keys))
        self.assertTrue(all(800 < len(group) < 1200 for group in owners))
        for i, worker in enumerate(workers):
            foreign = next(iter(owners[1-i]))
            with self.assertRaisesRegex(ValueError, 'QUEUE_WRONG_SHARD'):
                worker.process(foreign)
            self.assertEqual(worker.owns(keys[0]), worker.owns(keys[0]))
        with self.assertRaisesRegex(ValueError, 'QUEUE_SHARD_INVALID'):
            d.QueueWorker(None, base + '/queue', base + '/completed', self.root / 'bad-shard', FakeStore(), 2, 2)

    def test_actual_two_pass_713_to_720_with_audio_and_preserved_raw(self):
        native_sha = d.digest(self.raw)
        media = d.probe(self.raw)
        self.assertEqual(media['frameCount'], 713)
        marker = d.normalize(self.raw, media, self.root / 'normalized', allow_frame_normalization=True)
        self.assertEqual(d.digest(self.raw), native_sha)
        self.assertTrue(d.normalized_ok(d.probe(marker['normalized']['path'])))
        self.assertNotIn('tpad', marker['ffmpegVideoFilter'])

    def test_completed_native_delivery_is_idempotent_and_detects_changed_input(self):
        import shutil
        source = self.root / 'source'
        attempt = source / 'case-blue/style-00-segment-00/attempt-02'
        attempt.mkdir(parents=True)
        raw = attempt / 'provider-original.mp4'
        shutil.copyfile(self.raw, raw)
        state = dict(id='style-00-segment-00', status='generated', taskId='provider-test', inputHash='b' * 64, nativeAcceptancePolicy=d.NORMALIZE_POLICY,
                     output=dict(path=str(raw), sha256=d.digest(raw)))
        state_path = attempt / 'seedance-state.json'
        d.write(state_path, state)
        store = FakeStore()
        worker = d.Worker(source, self.root / 'deliveries', store, allow_frame_normalization=True)
        first = worker.deliver(state_path)
        uploads = len(store.uploads)
        self.assertEqual(worker.deliver(state_path), first)
        self.assertEqual(len(store.uploads), uploads)
        self.assertTrue(raw.is_file())
        state['taskId'] = 'other-provider-task'
        d.write(state_path, state)
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_DELIVERY_INPUT_CHANGED'):
            worker.deliver(state_path)

    def test_normalization_requires_explicit_opt_in(self):
        with self.assertRaisesRegex(ValueError, 'FRAME_NORMALIZATION_NOT_ENABLED'):
            d.normalize(self.raw, d.probe(self.raw), self.root / 'not-normalized')
        self.assertFalse((self.root / 'not-normalized').exists())

    def test_short_native_cannot_become_a_full_delivery_and_failed_raw_is_preserved(self):
        base = 's3://private-test-bucket/duration-test'
        store = FakeStore()
        consumer = d.QueueWorker(None, base + '/queue', base + '/completed', self.root / 'duration', store,
                                 allow_frame_normalization=True)
        value = dict(kind=d.QUEUE_KIND, schemaVersion=1, caseId='case-duration', requestId='style-00-segment-00',
                     styleId='style-00', attempt='attempt-01', inputHash='e'*64, taskId='same-paid-task',
                     providerVideoUrl='https://example.com/short.mp4', desiredOutput=d.DESIRED,
                     nativeAcceptancePolicy=d.NORMALIZE_POLICY)
        consumer.object = lambda key: value
        folder = consumer.root / 'scratch' / value['caseId'] / value['requestId'] / value['attempt']
        folder.mkdir(parents=True)
        raw = folder / 'provider-original.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(self.raw), '-frames:v', '24',
                        '-c', 'copy', '-t', '1', str(raw)], check=True, timeout=30)
        raw_sha = d.digest(raw)
        state = dict(id=value['requestId'], status='generated', taskId=value['taskId'], inputHash=value['inputHash'],
                     desiredOutput=d.DESIRED, nativeAcceptancePolicy=d.NORMALIZE_POLICY,
                     output=dict(path=str(raw), sha256=raw_sha))
        state_path = folder / 'seedance-state.json'
        d.write(state_path, state)
        with self.assertRaisesRegex(ValueError, 'NATIVE_DURATION_OUTSIDE_REQUEST_CONTRACT'):
            consumer.worker.deliver(state_path)
        self.assertEqual(d.digest(raw), raw_sha)
        self.assertEqual(store.uploads, [])
        consumer.preserve_failed_native_and_free_scratch(consumer.queue_prefix + '/' + d.queue_name(value))
        preserved = d.read(folder / 'failed-native.json')
        self.assertEqual(preserved['sha256'], raw_sha)
        self.assertEqual(preserved['media']['frameCount'], 24)
        self.assertIn('probe', preserved)
        self.assertFalse(raw.exists())
        self.assertFalse(list((consumer.root / 'receipts').glob('**/delivery.json')))
        for desired in [d.DESIRED, d.HALF_DESIRED]:
            for scale in [.9, 1.1]:
                d.assert_native_duration(dict(width=1280, height=720, hasAudio=True, fps=24,
                    frameCount=round(desired['frameCount']*scale), durationSeconds=desired['durationSeconds']*scale), desired)
            for scale in [.89, 1.11]:
                with self.assertRaisesRegex(ValueError, 'NATIVE_DURATION_OUTSIDE_REQUEST_CONTRACT'):
                    d.assert_native_duration(dict(width=1280, height=720, hasAudio=True, fps=24,
                        frameCount=round(desired['frameCount']*scale), durationSeconds=desired['durationSeconds']*scale), desired)

    def test_native_acceptance_needs_both_queue_and_worker_normalization_opt_in(self):
        import shutil
        source = self.root / 'policy-source'
        attempt = source / 'case-policy/style-00-segment-00/attempt-01'
        attempt.mkdir(parents=True)
        raw = attempt / 'provider-original.mp4'
        shutil.copyfile(self.raw, raw)
        state = dict(id='style-00-segment-00', status='generated', taskId='policy-task', inputHash='d'*64,
                     desiredOutput=d.DESIRED, output=dict(path=str(raw), sha256=d.digest(raw)))
        state_path = attempt / 'seedance-state.json'
        for worker_allows, queue_policy in [(False, d.NORMALIZE_POLICY), (True, d.EXACT_POLICY)]:
            state['nativeAcceptancePolicy'] = queue_policy
            d.write(state_path, state)
            store = FakeStore()
            worker = d.Worker(source, self.root / ('policy-out-' + queue_policy), store,
                              allow_frame_normalization=worker_allows)
            with self.assertRaisesRegex(ValueError, 'NORMALIZATION_NOT_ENABLED'):
                worker.deliver(state_path)
            self.assertEqual(store.uploads, [])
            self.assertEqual(d.digest(raw), state['output']['sha256'])

    def test_cli_and_real_download_refuse_local_hosts_before_credentials_or_network(self):
        import os
        base = 's3://private-test-bucket/run'
        worker = d.QueueWorker(None, base + '/queue', base + '/completed', self.root / 'local-guard', FakeStore())
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(d.sys, 'platform', 'linux'):
            with self.assertRaisesRegex(ValueError, 'REQUIRES_CLOUD_MEDIA_HOST'):
                d.main(['--output-root', str(self.root / 'cli-guard'), '--s3-prefix', base + '/delivered',
                        '--queue-prefix', base + '/queue', '--completion-prefix', base + '/completed'])
            with self.assertRaisesRegex(ValueError, 'REQUIRES_CLOUD_MEDIA_HOST'):
                worker.download('https://example.com/provider.mp4', self.root / 'must-not-download.mp4')
        self.assertFalse((self.root / 'must-not-download.mp4').exists())
        for marker in ['KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_BATCH_JOB_ID']:
            with mock.patch.dict(os.environ, {'WORLDKIT_CLOUD_MEDIA_HOST': '1', marker: 'cloud'}, clear=True), mock.patch.object(d.sys, 'platform', 'linux'):
                d.require_cloud_media_host()
                with mock.patch.object(d.sys, 'platform', 'darwin'):
                    with self.assertRaisesRegex(ValueError, 'REQUIRES_CLOUD_MEDIA_HOST'):
                        d.require_cloud_media_host()

    def test_explicit_private_s3_prefixes_are_portable_and_disjoint(self):
        self.assertEqual(d.s3_location('s3://another-private-bucket/team/project/run'),
                         ('another-private-bucket', 'team/project/run'))
        for value in ['https://example.com/media', 's3://private-bucket/a/../b', 's3://private-bucket/a?x=1']:
            with self.assertRaisesRegex(ValueError, 'PRIVATE_S3_PREFIX_REQUIRED'):
                d.s3_location(value)
        with self.assertRaisesRegex(ValueError, 'PREFIX_OVERLAP'):
            d.QueueWorker(None, 's3://private-bucket/run/queue', 's3://private-bucket/run/queue/completed',
                          self.root / 'overlap', FakeStore())

    def test_storage_rejects_head_hash_mismatch(self):
        class Client:
            def head_object(self, **kwargs):
                return dict(ContentLength=self_size, Metadata={'sha256': 'a' * 64})
        self_size = self.raw.stat().st_size
        store = d.Storage(Client(), 's3://test-private-bucket/episode/deliveries')
        with self.assertRaisesRegex(ValueError, 'S3_HEAD_CONTENT_IDENTITY_MISMATCH'):
            store.upload(self.raw, 'case/request/attempt/raw', 'video/mp4')

    def test_cloud_queue_refreshes_expired_url_and_recovers_completion_without_new_task(self):
        import io
        import shutil
        class Missing(Exception):
            response = {'Error': {'Code': '404'}}
        class Client:
            def __init__(self):
                self.objects = {}
                self.uncertain_completion = True
            def get_object(self, Bucket, Key):
                if Key not in self.objects:
                    raise Missing()
                return {'Body': io.BytesIO(self.objects[Key][0])}
            def head_object(self, Bucket, Key):
                if Key not in self.objects:
                    raise Missing()
                data, metadata = self.objects[Key]
                return {'ContentLength': len(data), 'Metadata': metadata}
            def upload_file(self, Filename, Bucket, Key, ExtraArgs, Config):
                self.objects[Key] = (Path(Filename).read_bytes(), ExtraArgs['Metadata'])
            def put_object(self, Bucket, Key, Body, Metadata, **kwargs):
                if Key in self.objects:
                    raise AssertionError('Completion must not be written twice')
                self.objects[Key] = (Body.read() if hasattr(Body, 'read') else Body, Metadata)
                if '/completed/' in Key and self.uncertain_completion:
                    self.uncertain_completion = False
                    raise TimeoutError('Stored completion but lost the acknowledgement')
        client = Client()
        base = 's3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/test'
        consumer = d.QueueWorker(client, base + '/queue', base + '/completed', self.root / 'cloud', d.Storage(client, base + '/deliveries'), allow_frame_normalization=True)
        value = dict(kind=d.QUEUE_KIND, schemaVersion=1, caseId='case-blue', requestId='style-00-segment-00',
                     styleId='style-00', attempt='attempt-01', inputHash='c'*64, taskId='provider-test', nativeAcceptancePolicy=d.NORMALIZE_POLICY,
                     providerVideoUrl='https://example.com/private.mp4?secret=do-not-persist', desiredOutput=d.DESIRED)
        key = consumer.queue_prefix + '/' + d.queue_name(value)
        client.objects[key] = (json.dumps(value).encode(), {})
        calls = []
        def download(url, target):
            calls.append(url)
            if len(calls) == 1:
                raise ValueError('NATIVE_DOWNLOAD_HTTP_403')
            shutil.copyfile(self.raw, target)
        consumer.download = download
        with self.assertRaisesRegex(ValueError, 'NATIVE_DOWNLOAD_HTTP_403'):
            consumer.process(key)
        folder = consumer.root / 'scratch' / value['caseId'] / value['requestId'] / value['attempt']
        self.assertFalse((folder / 'seedance-state.json').exists())
        d.write(folder / 'job.json', {'video_url': value['providerVideoUrl']})
        value['providerVideoUrl'] = 'https://example.com/private.mp4?secret=refreshed-do-not-persist'
        value['refreshedAt'] = d.now()
        client.objects[key] = (json.dumps(value).encode(), {})
        with self.assertRaises(TimeoutError):
            consumer.process(key)
        # The queue recovers the exact durable completion after an uncertain PUT.
        done = consumer.process(key)
        self.assertEqual(done['status'], 'delivered')
        self.assertFalse(Path(done['delivery']['native']['localPath']).exists())
        self.assertFalse(Path(done['delivery']['normalized']['localPath']).exists())
        self.assertEqual(consumer.process(key), done)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1], value['providerVideoUrl'])
        self.assertEqual(done['identity']['taskId'], 'provider-test')
        self.assertEqual(done['identity']['inputHash'], value['inputHash'])
        self.assertNotIn('providerVideoUrl', d.read(folder / 'seedance-state.json'))
        completion = client.objects[consumer.completion_prefix + '/' + d.queue_name(value)][0]
        self.assertNotIn(b'do-not-persist', completion)
        self.assertTrue(self.raw.exists())
        value['taskId'] = 'another-provider-task'
        client.objects[key] = (json.dumps(value).encode(), {})
        with self.assertRaisesRegex(ValueError, 'QUEUE_REMOTE_COMPLETION_CONFLICT'):
            consumer.process(key)
        self.assertEqual(len(calls), 2)

    def test_queue_contract_rejects_wrong_size_or_insecure_url(self):
        value = dict(kind=d.QUEUE_KIND, schemaVersion=1, caseId='case-blue', requestId='style-00-segment-00',
                     styleId='style-00', attempt='attempt-01', inputHash='c'*64, taskId='provider-test',
                     providerVideoUrl='http://example.com/private.mp4', desiredOutput=d.DESIRED)
        with self.assertRaisesRegex(ValueError, 'REQUIRES_HTTPS'):
            d.queue_payload(value)
        value['providerVideoUrl'] = 'https://example.com/private.mp4'
        value['desiredOutput'] = dict(d.DESIRED, frameCount=719)
        with self.assertRaisesRegex(ValueError, 'OUTPUT_CONTRACT'):
            d.queue_payload(value)

    def test_range_identity_and_rolling_workers(self):
        import threading
        self.assertEqual(d.parse_content_range('bytes 0-9/100', 0, 9), 100)
        with self.assertRaisesRegex(ValueError, 'CONTENT_RANGE_MISMATCH'):
            d.parse_content_range('bytes 0-8/100', 0, 9)
        base = 's3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/rolling-test'
        q = d.QueueWorker(None, base + '/queue', base + '/completed', self.root / 'rolling', FakeStore())
        jobs = [q.queue_prefix + f'/{x}.json' for x in ['a', 'b', 'c', 'd', 'e']]
        completed = set()
        completed_lock = threading.Lock()
        fifth_started, first_finished = threading.Event(), threading.Event()
        def keys(prefix):
            with completed_lock:
                return jobs if prefix == q.queue_prefix else [q.completion_prefix + '/' + key.rsplit('/',1)[1] for key in completed]
        q.keys = keys
        q.sweep_completed = lambda *args: None
        def process(key):
            if key == jobs[0]:
                # Keep one worker occupied until a freed slot admits the fifth job.
                # The timeout bounds a broken scheduler, not the expected ordering.
                self.assertTrue(fifth_started.wait(10), 'A free worker must start the fifth job before the first finishes')
                first_finished.set()
            elif key == jobs[4]:
                self.assertFalse(first_finished.is_set())
                fifth_started.set()
            with completed_lock:
                completed.add(key)
            return {'identity': {'requestId': key.rsplit('/',1)[1]}}
        q.process = process
        self.assertEqual(q.run(once=True, interval=.005, limit=5), 0)
        self.assertTrue(fifth_started.is_set())
        self.assertTrue(first_finished.is_set())
        self.assertEqual(completed, set(jobs))

    def test_audio_tempo_splits_large_ratios(self):
        self.assertEqual(d.tempo_filter(.25).count('atempo='), 2)
        self.assertEqual(d.tempo_filter(4).count('atempo='), 2)


if __name__ == '__main__':
    unittest.main()
