"""Synthetic progress bytes and adversarial archives; no model/browser execution."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('progress', HERE / 'three-progress-unpack.py')
progress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(progress)
sha = lambda value: hashlib.sha256(value).hexdigest()
encoded = lambda value: json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()


def progress_fixture(root, identity=None):
    root = Path(root)
    payload = root / 'build/payload'
    payload.mkdir(parents=True)
    identity = identity or {'taskId': 'local-case--three-sdk', 'caseId': 'local-case', 'profile': 'three-sdk', 'creatorRuntimeLockHash': 'a' * 64, 'runtimeHash': 'b' * 64}
    source = {'source/world.ts': b'const incomplete =', 'source/plan/map.png': bytes([137, 80, 78, 71, 0, 255]), 'source/plan/notes.md': b'# Continue this existing plan', 'source/project.json': b'{ unfinished:'}
    files = {name: sha(data) for name, data in source.items()}
    manifest = {'kind': 'three-creator-progress', 'schemaVersion': 1, 'status': 'unverified', **identity, 'sourceHashAlgorithm': 'author-inventory-sha256-v1', 'sourceHash': progress.inventory_hash(files), 'createdAt': '2026-09-06T00:00:00.000Z', 'files': files}
    source['progress.json'] = encoded(manifest)
    source['artifact-hashes.json'] = encoded({'schemaVersion': 1, 'files': {name: sha(data) for name, data in source.items()}})
    for name, data in source.items():
        file = payload / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    archive = root / 'creator-progress.tar.gz'
    with tarfile.open(archive, 'w:gz') as stream:
        stream.add(payload, arcname='payload')
    receipt = {**manifest, 'archiveSha256': sha(archive.read_bytes()), 'archiveByteLength': archive.stat().st_size, 'progressManifestSha256': sha(source['progress.json'])}
    receipt_path = root / 'creator-progress.json'
    receipt_path.write_bytes(encoded(receipt))
    return {'archive': str(archive), 'receipt': str(receipt_path), 'expected': identity, 'metadata': receipt}


def update_archive_receipt(fixture):
    archive = Path(fixture['archive'])
    fixture['metadata'].update(archiveSha256=sha(archive.read_bytes()), archiveByteLength=archive.stat().st_size)
    Path(fixture['receipt']).write_bytes(encoded(fixture['metadata']))


class ProgressTests(unittest.TestCase):
    def test_roundtrip_no_index_and_exact_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            f = progress_fixture(root)
            result = progress.unpack_progress(f['archive'], f['receipt'], root / 'verified', f['expected'])
            self.assertEqual(result['status'], 'unverified')
            self.assertFalse((root / 'verified/payload/source/index.html').exists())
            self.assertEqual((root / 'verified/payload/source/plan/map.png').read_bytes(), bytes([137, 80, 78, 71, 0, 255]))
            self.assertEqual(progress.unpack_progress(f['archive'], f['receipt'], root / 'verified', f['expected']), result)
            with self.assertRaisesRegex(ValueError, 'IDENTITY_MISMATCH'):
                progress.unpack_progress(f['archive'], f['receipt'], root / 'other', {**f['expected'], 'runtimeHash': 'c' * 64})
            self.assertFalse((root / 'other').exists())

    def test_changed_bytes_or_receipt_never_replace_verified_progress(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            f = progress_fixture(root)
            progress.unpack_progress(f['archive'], f['receipt'], root / 'verified')
            original = (root / 'verified/payload/source/world.ts').read_bytes()
            Path(f['archive']).write_bytes(b'partial next archive')
            with self.assertRaisesRegex(ValueError, 'PAIR_MISMATCH'):
                progress.unpack_progress(f['archive'], f['receipt'], root / 'new')
            self.assertEqual((root / 'verified/payload/source/world.ts').read_bytes(), original)
            self.assertFalse((root / 'new').exists())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            f = progress_fixture(root)
            f['metadata']['sourceHash'] = '0' * 64
            Path(f['receipt']).write_bytes(encoded(f['metadata']))
            with self.assertRaisesRegex(ValueError, 'SOURCE_HASH_MISMATCH'):
                progress.unpack_progress(f['archive'], f['receipt'], root / 'new')

    def test_private_paths_links_traversal_and_unlisted_content(self):
        cases = [('payload/source/auth.json', 'file'), ('payload/source/inputs/reference.png', 'file'), ('payload/source/.creator-session/home/a.json', 'file'), ('payload/source/codex_home_worker/config.json', 'file'), ('payload/source/scratch/map.png', 'file'), ('payload/source/../../escape.ts', 'file'), ('payload/source/linked.ts', 'symlink'), ('payload/source/linked.ts', 'hardlink'), ('payload/source/fifo.ts', 'fifo'), ('payload/playable/index.html', 'file'), ('payload/source/unknown.exe', 'file')]
        for name, kind in cases:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                f = progress_fixture(root)
                with tarfile.open(f['archive'], 'w:gz') as stream:
                    member = tarfile.TarInfo(name)
                    if kind != 'file':
                        member.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE, 'fifo': tarfile.FIFOTYPE}[kind]
                        member.linkname = '/outside'
                        stream.addfile(member)
                    else:
                        member.size = 4
                        stream.addfile(member, io.BytesIO(b'fake'))
                update_archive_receipt(f)
                with self.assertRaises(ValueError):
                    progress.unpack_progress(f['archive'], f['receipt'], root / 'verified')
                self.assertFalse((root / 'verified').exists())

    def test_tampered_complete_payload_and_duplicate_members(self):
        for duplicate in (False, True):
            with self.subTest(duplicate=duplicate), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                f = progress_fixture(root)
                (root / 'build/payload/source/world.ts').write_bytes(b'tampered after manifest')
                with tarfile.open(f['archive'], 'w:gz') as stream:
                    stream.add(root / 'build/payload', arcname='payload')
                    if duplicate:
                        stream.add(root / 'build/payload/source/world.ts', arcname='payload/source/world.ts')
                update_archive_receipt(f)
                with self.assertRaisesRegex(ValueError, 'ARCHIVE_MEMBER|CLOSURE_MISMATCH'):
                    progress.unpack_progress(f['archive'], f['receipt'], root / 'verified')
                self.assertFalse((root / 'verified').exists())

    def test_forged_delivery_claim_and_linked_receipt_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            f = progress_fixture(root)
            f['metadata']['technicalStatus'] = 'passed'
            Path(f['receipt']).write_bytes(encoded(f['metadata']))
            with self.assertRaisesRegex(ValueError, 'RECEIPT_INVALID'):
                progress.unpack_progress(f['archive'], f['receipt'], root / 'verified')
            linked = root / 'linked.json'
            linked.symlink_to(f['receipt'])
            with self.assertRaisesRegex(ValueError, 'PATH_INVALID'):
                progress.unpack_progress(f['archive'], linked, root / 'verified')

    def test_duplicate_json_and_linked_extracted_source_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            f = progress_fixture(root)
            progress.unpack_progress(f['archive'], f['receipt'], root / 'verified')
            source = root / 'verified/payload/source/world.ts'
            source.unlink()
            os.link(root / 'verified/payload/source/plan/notes.md', source)
            with self.assertRaisesRegex(ValueError, 'FILE_NOT_ADMITTED'):
                progress.verify_progress(root / 'verified')
            Path(f['receipt']).write_text('{"kind":"three-creator-progress","kind":"forged"}')
            with self.assertRaisesRegex(ValueError, 'DUPLICATE_JSON_KEY'):
                progress.unpack_progress(f['archive'], f['receipt'], root / 'other')


if __name__ == '__main__':
    unittest.main()
