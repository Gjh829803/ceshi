"""Synthetic checkpoint contract fixtures; no model or scene execution."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
def module(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
checkpoint = module('checkpoint', 'three-checkpoint-unpack.py')
import base64
sha = lambda value: hashlib.sha256(value).hexdigest()
encoded = lambda value: json.dumps(value, separators=(',', ':')).encode()


def checkpoint_fixture(root, identity=None):
    root = Path(root); payload = root / 'build/payload'; payload.mkdir(parents=True)
    identity = identity or {'taskId': 'local-case--three-sdk', 'caseId': 'local-case', 'profile': 'three-sdk', 'creatorRuntimeLockHash': 'a' * 64, 'runtimeHash': 'b' * 64}
    scene = {'source/index.html': b'<html>LOCAL FIXTURE source</html>', 'playable/index.html': b'<html>LOCAL FIXTURE runnable</html>', 'playable/compiled/main.js': b'/* LOCAL FIXTURE */', 'preview/preview.png': base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlX8AAAAASUVORK5CYII=')}
    preview = {'kind': 'three-creator-browser-preview', 'schemaVersion': 1, 'profile': identity['profile'], 'sourceHash': 'c' * 64, 'worldBuildHash': 'd' * 64, 'view': 'opening', 'pageErrors': [], 'runtimeErrors': [], 'blockedNetworkRequests': [], 'image': {'path': 'preview.png', 'sha256': sha(scene['preview/preview.png']), 'byteLength': len(scene['preview/preview.png'])}}
    scene['preview/preview.json'] = encoded(preview)
    manifest = {'kind': 'three-creator-checkpoint', 'schemaVersion': 1, 'status': 'runnable', **identity, 'sourceHash': 'c' * 64, 'worldBuildHash': 'd' * 64, 'createdAt': '2026-09-06T00:00:00Z', 'toolVersion': 'local-fixture', 'previewView': 'opening', 'files': {name: sha(data) for name, data in scene.items()}}
    scene['checkpoint.json'] = encoded(manifest)
    scene['artifact-hashes.json'] = encoded({'schemaVersion': 1, 'files': {name: sha(data) for name, data in scene.items()}})
    for name, data in scene.items():
        file = payload / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(data)
    archive = root / 'creator-checkpoint.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(payload, arcname='payload')
    receipt = {**manifest, 'archiveSha256': sha(archive.read_bytes()), 'archiveByteLength': archive.stat().st_size, 'checkpointManifestSha256': sha(scene['checkpoint.json'])}
    receipt_path = root / 'creator-checkpoint.json'; receipt_path.write_bytes(encoded(receipt))
    return {'archive': str(archive), 'receipt': str(receipt_path), 'expected': identity, 'metadata': receipt}


class CheckpointTests(unittest.TestCase):
    def test_roundtrip_and_identity_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); f = checkpoint_fixture(root)
            result = checkpoint.unpack_checkpoint(f['archive'], f['receipt'], root / 'verified', f['expected'])
            self.assertEqual(result['status'], 'runnable')
            self.assertEqual(checkpoint.unpack_checkpoint(f['archive'], f['receipt'], root / 'verified', f['expected']), result)
            with self.assertRaisesRegex(ValueError, 'IDENTITY_MISMATCH'):
                checkpoint.unpack_checkpoint(f['archive'], f['receipt'], root / 'other', {**f['expected'], 'taskId': 'other--three-sdk'})
            self.assertFalse((root / 'other').exists())

    def test_changed_pair_does_not_replace_verified_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); f = checkpoint_fixture(root); output = root / 'verified'
            checkpoint.unpack_checkpoint(f['archive'], f['receipt'], output)
            before = (output / 'payload/playable/index.html').read_bytes()
            Path(f['archive']).write_bytes(b'partial next version')
            with self.assertRaisesRegex(ValueError, 'PAIR_MISMATCH'):
                checkpoint.unpack_checkpoint(f['archive'], f['receipt'], root / 'new')
            self.assertEqual((output / 'payload/playable/index.html').read_bytes(), before)

    def test_private_names_links_and_traversal_rejected_before_extraction(self):
        for name, linked in [('payload/source/scratch/auth.json', False), ('payload/playable/../../escape', False), ('payload/playable/linked', True)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve(); f = checkpoint_fixture(root)
                with tarfile.open(f['archive'], 'w:gz') as tar:
                    member = tarfile.TarInfo(name)
                    if linked:
                        member.type = tarfile.SYMTYPE; member.linkname = '/outside'
                        tar.addfile(member)
                    else:
                        member.size = 4; tar.addfile(member, io.BytesIO(b'fake'))
                receipt = f['metadata']; receipt.update(archiveSha256=sha(Path(f['archive']).read_bytes()), archiveByteLength=Path(f['archive']).stat().st_size)
                Path(f['receipt']).write_bytes(encoded(receipt))
                with self.assertRaises(ValueError):
                    checkpoint.unpack_checkpoint(f['archive'], f['receipt'], root / 'verified')
                self.assertFalse((root / 'verified').exists())


if __name__ == '__main__':
    unittest.main()
