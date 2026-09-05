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
            root = Path(temporary).resolve()
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
        for name in ['payload/source/scratch/file.ts', 'payload/playable/scratch/file.ts', 'payload/source/codex_home_example/auth.json', 'payload/source/features/scratch/auth.json', 'payload/source/.creator-session/config.json']:
            code, error = self.invoke([(name, b'synthetic private marker', 'file')])
            self.assertNotEqual(code, 0)
            self.assertIn('PLATFORM_PRIVATE_PATH_IN_ARTIFACT', error)
            self.assertNotIn('synthetic private marker', error)

    def test_nested_author_scratch_reaches_normal_inventory_validation(self):
        for name in ['payload/source/features/scratch/file.ts', 'payload/playable/features/scratch/file.ts']:
            code, error = self.invoke([(name, b'ordinary author file', 'file')])
            self.assertNotEqual(code, 0)  # Deliberately no complete artifact inventory.
            self.assertNotIn('PLATFORM_PRIVATE_PATH_IN_ARTIFACT', error)
            self.assertIn('artifact-hashes.json', error)


if __name__ == '__main__':
    unittest.main()
