import importlib.util
import contextlib
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


class ClosedArchiveTests(unittest.TestCase):
    def invoke(self, members, expected_sha=None):
        with tempfile.TemporaryDirectory(prefix='three-unpack-test-') as temporary:
            root = Path(temporary)
            archive = root / 'delivery.tar.gz'
            with tarfile.open(archive, 'w:gz') as stream:
                for name, data, kind in members:
                    entry = tarfile.TarInfo(name)
                    if kind == 'link':
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = '/tmp/outside'
                        stream.addfile(entry)
                    else:
                        entry.size = len(data)
                        stream.addfile(entry, io.BytesIO(data))
            receipt = root / 'receipt.json'
            receipt.write_text(json.dumps({'archiveSha256': expected_sha or hashlib.sha256(archive.read_bytes()).hexdigest(), 'archiveByteLength': archive.stat().st_size}))
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('three-eval-unpack.py')), '--archive', str(archive), '--receipt', str(receipt), '--output', str(root / 'extracted')], capture_output=True)
            return result.returncode, result.stderr.decode()

    def test_hash_mismatch_precedes_extraction(self):
        code, error = self.invoke([('payload/file', b'body', 'file')], '0' * 64)
        self.assertNotEqual(code, 0)
        self.assertIn("receipt['archiveSha256']", error)

    def test_traversal_and_root_sidecars_are_rejected(self):
        for name in ['payload/../outside', '/payload/file', '._payload', 'payload\\file']:
            with self.subTest(name=name):
                code, error = self.invoke([(name, b'x', 'file')])
                self.assertNotEqual(code, 0)
                self.assertIn('AssertionError', error)

    def test_links_and_duplicate_paths_are_rejected(self):
        for members in [[('payload/link', b'', 'link')], [('payload/file', b'a', 'file'), ('payload/file', b'b', 'file')]]:
            code, error = self.invoke(members)
            self.assertNotEqual(code, 0)
            self.assertIn('AssertionError', error)

    def test_platform_scratch_is_quarantined_by_headers_before_extraction(self):
        for name in ['payload/source/scratch/file.ts', 'payload/source/codex_home_example/auth.json', 'payload/source/.creator-session/config.json']:
            code, error = self.invoke([(name, b'synthetic private marker', 'file')])
            self.assertNotEqual(code, 0)
            self.assertIn('PLATFORM_PRIVATE_PATH_IN_ARTIFACT', error)
            self.assertNotIn('synthetic private marker', error)


class WorkspaceRuntimeTests(unittest.TestCase):
    def test_source_and_byte_identity_are_both_required(self):
        spec = importlib.util.spec_from_file_location('unpack', Path(__file__).with_name('three-eval-unpack.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        hash_json = lambda value: hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()
        source = {'runtime.json': 'a' * 64, 'three-world/src/index.ts': 'b' * 64}
        actual = {prefix + name: value for prefix in ['source/sdk/', 'playable/sdk/'] for name, value in source.items()}
        runtime = {name: 'c' * 64 for name in ['bridge.js', 'three.js', 'worldkit-three.js']}
        actual.update({'playable/runtime/' + name: value for name, value in runtime.items()})
        manifest = {'profile': 'three-sdk', 'runtimeSourceHash': hash_json(sorted(source.items())), 'runtimeHash': hash_json(runtime)}
        module.verify_workspace_runtime(manifest, actual)
        for changed in [{**actual, 'source/sdk/three-world/src/index.ts': 'd' * 64}, {**actual, 'playable/runtime/worldkit-three.js': 'd' * 64}]:
            with self.assertRaises(AssertionError):
                module.verify_workspace_runtime(manifest, changed)
        with self.assertRaises(AssertionError):
            module.verify_workspace_runtime({**manifest, 'runtimeSourceHash': None}, actual)


class RecordedDeliveryTests(unittest.TestCase):
    def invoke(self, seconds=0.05, mutate=None, probe_change=None):
        spec = importlib.util.spec_from_file_location('unpack_recording', Path(__file__).with_name('three-eval-unpack.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        encode = lambda value: json.dumps(value, separators=(',', ':')).encode()
        digest = lambda value: hashlib.sha256(value).hexdigest()
        episode = encode({'schemaVersion': 1, 'steps': [{'keysDown': ['w'], 'durationSeconds': seconds}]})
        identity = {'profile': 'three-sdk', 'sourceHash': 'a' * 64, 'worldBuildHash': 'b' * 64,
                    'runtimeHash': 'c' * 64, 'episodeHash': digest(episode)}
        capture = {'clock': 'browser-performance', 'initialFrameRequestedAtMilliseconds': 0,
                   'finalFrameRequestedAtMilliseconds': seconds * 1000, 'recorderStoppedAtMilliseconds': seconds * 1000,
                   'framePeriodSeconds': 1, 'postrollSeconds': 0, 'requestedFrames': 2}
        video = {'durationSeconds': seconds, 'frameCount': 2, 'widthPixels': 16, 'heightPixels': 16}
        played = {**identity, 'status': 'passed', 'isCompleteEpisode': True, 'capturedInput': True,
                  'actualWallSeconds': seconds, 'activePlaySeconds': seconds, 'inputWallSeconds': seconds,
                  'captureTiming': capture, 'videoMetadata': video, 'pageErrors': [], 'runtimeErrors': [],
                  'blockedNetworkRequests': [], 'targetResults': []}
        timing = {'clock': 'browser-performance', 'startedAtMilliseconds': 0,
                  'endedAtMilliseconds': seconds * 1000, 'durationSeconds': seconds}
        if mutate:
            mutate(played, timing)
        files = {'source/index.html': b'<canvas></canvas>', 'playable/index.html': b'<canvas></canvas>',
                 'episode.json': episode, 'playtest/playtest.json': encode(played),
                 'playtest/trace.json': encode({'timing': timing}), 'playtest/playtest.mp4': b'mocked video bytes',
                 'captures/captures.json': encode({**identity, 'pageErrors': [], 'images': [
                     {'view': 'opening'}, {'view': 'entity-triview', 'entityIds': ['player']} ]})}
        manifest = {**identity, 'engine': 'three@0.185.1', 'creatorRuntimeLockHash': 'd' * 64,
                    **{key: played[key] for key in ['actualWallSeconds', 'activePlaySeconds', 'inputWallSeconds',
                                                   'captureTiming', 'videoMetadata', 'targetResults']},
                    'files': {name: digest(data) for name, data in files.items()}}
        files['delivery.json'] = encode(manifest)
        files['artifact-hashes.json'] = encode({'schemaVersion': 1, 'files': {name: digest(data) for name, data in files.items()}})
        probe_video = {**video, **(probe_change or {})}
        probe = {'format': {'duration': str(probe_video['durationSeconds'])}, 'streams': [{
            'nb_read_frames': str(probe_video['frameCount']), 'width': probe_video['widthPixels'], 'height': probe_video['heightPixels']}]}
        with tempfile.TemporaryDirectory(prefix='three-recorded-delivery-') as temporary:
            root = Path(temporary).resolve()
            archive, receipt, output = root / 'delivery.tar.gz', root / 'receipt.json', root / 'verified'
            with tarfile.open(archive, 'w:gz') as stream:
                for name, data in files.items():
                    member = tarfile.TarInfo('payload/' + name)
                    member.size = len(data)
                    stream.addfile(member, io.BytesIO(data))
            receipt.write_bytes(encode({**manifest, 'archivePath': str(archive), 'archiveSha256': digest(archive.read_bytes()),
                                        'archiveByteLength': archive.stat().st_size, 'deliveryManifestSha256': digest(files['delivery.json'])}))
            with patch.object(sys, 'argv', ['unpack', '--archive', str(archive), '--receipt', str(receipt), '--output', str(output)]), \
                    patch.object(module.subprocess, 'check_output', return_value=encode(probe)), contextlib.redirect_stdout(io.StringIO()):
                module.main()
            return json.loads((output / 'host-artifact-verification.json').read_text())

    def test_positive_short_complete_recordings_have_no_minimum(self):
        for seconds in [0.000001, 0.05, 1, 179, 180]:
            with self.subTest(seconds=seconds):
                result = self.invoke(seconds)
                self.assertEqual(result['status'], 'passed')
                self.assertEqual(result['actualVideoMetadata']['durationSeconds'], seconds)

    def test_invalid_times_and_existing_safety_ceiling_are_rejected(self):
        for key in ['actualWallSeconds', 'activePlaySeconds', 'inputWallSeconds']:
            for value in [0, -1, True, '1', None, float('nan'), float('inf'), 3600]:
                with self.subTest(key=key, value=value), self.assertRaises(AssertionError):
                    self.invoke(mutate=lambda played, timing: played.update({key: value}))
        for value in [0, -1, True, '1', None, float('nan'), float('inf')]:
            with self.subTest(video=value), self.assertRaises(AssertionError):
                self.invoke(mutate=lambda played, timing: played['videoMetadata'].update(durationSeconds=value))

    def test_short_duration_does_not_relax_input_identity_or_video_evidence(self):
        changes = [lambda p, t: p.update(isCompleteEpisode=False), lambda p, t: p.update(capturedInput=False),
                   lambda p, t: p.update(capturedInput=1), lambda p, t: p.update(status='failed'),
                   lambda p, t: p.update(sourceHash='e' * 64), lambda p, t: p.update(episodeHash='e' * 64),
                   lambda p, t: p.update(runtimeErrors=['runtime failure']), lambda p, t: t.update(clock='host'),
                   lambda p, t: t.update(endedAtMilliseconds=5000), lambda p, t: t.update(durationSeconds=2),
                   lambda p, t: p['captureTiming'].update(finalFrameRequestedAtMilliseconds=0)]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(AssertionError):
                self.invoke(mutate=change)
        for change in [{'durationSeconds': 2}, {'durationSeconds': float('nan')}, {'frameCount': 3}, {'widthPixels': 32}]:
            with self.subTest(probe=change), self.assertRaises(AssertionError):
                self.invoke(probe_change=change)


if __name__ == '__main__':
    unittest.main()
