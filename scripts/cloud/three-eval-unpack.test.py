import importlib.util
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
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


if __name__ == '__main__':
    unittest.main()
