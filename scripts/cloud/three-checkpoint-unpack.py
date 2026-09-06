#!/usr/bin/env python3
"""Verify/extract a runnable checkpoint without executing it or claiming delivery."""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

HASH = re.compile(r'[a-f0-9]{64}\Z')
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_PAYLOAD = 512 * 1024 * 1024
PRIVATE = {'auth.json', 'credentials', 'aws-credentials', 'aws-config', '.aws', '.codex', '.creator-session', 'google-service-account.json', 'codex_home'}


def require(value, detail):
    if not value:
        raise ValueError('THREE_CHECKPOINT_' + detail)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def regular(path, maximum=MAX_ARCHIVE):
    path = Path(path).absolute()
    require(path.resolve() == path and not path.is_symlink(), 'PATH_INVALID')
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= maximum, 'FILE_NOT_ADMITTED')
    return info


def relative(value):
    require(isinstance(value, str) and value and '\\' not in value and not any(ord(c) < 32 for c in value), 'PATH_INVALID')
    parts = value.split('/')
    require(all(p not in ('', '.', '..') for p in parts), 'PATH_INVALID')
    require(not any(p.lower() in PRIVATE or p.lower().startswith('codex_home_') for p in parts), 'PRIVATE_PATH')
    require(parts[:2] not in (['source', 'scratch'], ['playable', 'scratch']), 'PRIVATE_PATH')
    return parts


def read_json(path):
    regular(path, 8 * 1024 * 1024)
    def pairs(values):
        result = {}
        for key, value in values:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(Path(path).read_text(), object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('THREE_CHECKPOINT_NONFINITE_JSON')))


def validate_receipt(receipt, expected=None):
    require(isinstance(receipt, dict) and receipt.get('kind') == 'three-creator-checkpoint' and receipt.get('schemaVersion') == 1 and receipt.get('status') == 'runnable', 'RECEIPT_INVALID')
    require(receipt.get('profile') in ('three-sdk', 'three-raw'), 'PROFILE_INVALID')
    for key in ('worldBuildHash', 'sourceHash', 'runtimeHash', 'archiveSha256', 'checkpointManifestSha256'):
        require(isinstance(receipt.get(key), str) and HASH.fullmatch(receipt[key]), 'HASH_INVALID')
    require(type(receipt.get('archiveByteLength')) is int and 0 < receipt['archiveByteLength'] <= MAX_ARCHIVE, 'ARCHIVE_SIZE')
    for key, value in (expected or {}).items():
        require(receipt.get(key) == value, 'IDENTITY_MISMATCH_' + key)
    require(isinstance(receipt.get('files'), dict) and 1 <= len(receipt['files']) <= 9998, 'INVENTORY_INVALID')
    for name, value in receipt['files'].items():
        parts = relative(name)
        require(parts[0] in ('source', 'playable', 'preview') and isinstance(value, str) and HASH.fullmatch(value), 'INVENTORY_INVALID')
    require(not any(key in receipt for key in ('technicalStatus', 'semanticStatus', 'deliveryStatus')), 'DELIVERY_CLAIM_FORBIDDEN')
    return receipt


def verify_checkpoint(directory, expected=None):
    directory = Path(directory).absolute()
    require(directory.resolve() == directory, 'PATH_INVALID')
    receipt = validate_receipt(read_json(directory / 'checkpoint-receipt.json'), expected)
    payload = directory / 'payload'
    actual = {}
    # Inspect the complete admitted inventory before reading any member content.
    paths = list(payload.rglob('*'))
    require(len(paths) <= 10000, 'MEMBER_LIMIT')
    total = 0
    for file in paths:
        relative(file.relative_to(payload).as_posix())
        require(not file.is_symlink(), 'LINK_REJECTED')
        if file.is_file():
            total += regular(file).st_size
    require(total <= MAX_PAYLOAD, 'PAYLOAD_SIZE')
    for file in paths:
        if file.is_file():
            actual[file.relative_to(payload).as_posix()] = digest(file)
    manifest = read_json(payload / 'checkpoint.json')
    archive_fields = {'archiveSha256', 'archiveByteLength', 'checkpointManifestSha256'}
    require({k: v for k, v in receipt.items() if k not in archive_fields} == manifest, 'MANIFEST_MISMATCH')
    require(actual.get('checkpoint.json') == receipt['checkpointManifestSha256'], 'MANIFEST_HASH')
    inventory = read_json(payload / 'artifact-hashes.json')
    require(inventory.get('schemaVersion') == 1 and inventory.get('files') == {k: v for k, v in actual.items() if k != 'artifact-hashes.json'}, 'CLOSURE_MISMATCH')
    require(manifest['files'] == {k: v for k, v in actual.items() if k not in ('artifact-hashes.json', 'checkpoint.json')}, 'FILE_HASH_MISMATCH')
    preview = read_json(payload / 'preview/preview.json')
    for key in ('profile', 'sourceHash', 'worldBuildHash'):
        require(preview.get(key) == receipt[key], 'PREVIEW_IDENTITY')
    require(preview.get('kind') == 'three-creator-browser-preview' and preview.get('view') == receipt.get('previewView'), 'PREVIEW_INVALID')
    require(all(preview.get(k) == [] for k in ('pageErrors', 'runtimeErrors', 'blockedNetworkRequests')), 'PREVIEW_NOT_CLEAN')
    require(preview.get('image', {}).get('path') == 'preview.png' and actual.get('preview/preview.png') == preview['image'].get('sha256'), 'PREVIEW_IMAGE_INVALID')
    require({'playable/index.html', 'source/index.html', 'preview/preview.png'}.issubset(actual), 'ENTRY_MISSING')
    return receipt, actual


def unpack_checkpoint(archive, receipt_path, output, expected=None):
    archive, output = Path(archive).absolute(), Path(output).absolute()
    receipt = validate_receipt(read_json(receipt_path), expected)
    require(regular(archive).st_size == receipt['archiveByteLength'] and digest(archive) == receipt['archiveSha256'], 'PAIR_MISMATCH')
    names, total = set(), 0
    # Reject private names and links from headers before reading or extracting contents.
    with tarfile.open(archive, 'r|gz') as stream:
        for member in stream:
            name = member.name.rstrip('/')
            parts = name.split('/')
            require(parts[0] == 'payload', 'ARCHIVE_ROOT')
            if len(parts) > 1:
                relative('/'.join(parts[1:]))
            require(name not in names and (member.isfile() or member.isdir()), 'ARCHIVE_MEMBER')
            names.add(name)
            total += member.size
            require(len(names) <= 10000 and 0 <= member.size <= MAX_ARCHIVE and total <= MAX_PAYLOAD, 'ARCHIVE_LIMIT')
    if output.exists():
        existing, _ = verify_checkpoint(output, expected)
        require(existing == receipt, 'EXISTING_RECEIPT_MISMATCH')
        return receipt
    require(not output.is_symlink(), 'OUTPUT_EXISTS')
    output.parent.mkdir(parents=True, exist_ok=True)
    require(output.parent.resolve() == output.parent, 'PATH_INVALID')
    temporary = Path(tempfile.mkdtemp(prefix='.checkpoint-verify-', dir=output.parent))
    try:
        with tarfile.open(archive, 'r|gz') as stream:
            remaining, written_bytes = set(names), 0
            for member in stream:
                name = member.name.rstrip('/')
                require(name in remaining and (member.isfile() or member.isdir()), 'ARCHIVE_CHANGED')
                remaining.remove(name)
                written_bytes += member.size
                require(0 <= member.size <= MAX_ARCHIVE and written_bytes <= MAX_PAYLOAD, 'ARCHIVE_LIMIT')
                target = temporary.joinpath(*PurePosixPath(member.name).parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with stream.extractfile(member) as source, target.open('xb') as destination:
                        shutil.copyfileobj(source, destination)
            require(not remaining, 'ARCHIVE_CHANGED')
        require(digest(archive) == receipt['archiveSha256'], 'ARCHIVE_CHANGED')
        (temporary / 'checkpoint-receipt.json').write_text(json.dumps(receipt))
        verify_checkpoint(temporary, expected)
        report = {'kind': 'three-creator-checkpoint-verification', 'schemaVersion': 1, 'status': 'verified', 'worldBuildHash': receipt['worldBuildHash'], 'archiveSha256': receipt['archiveSha256'], 'browserReplay': 'not-run'}
        (temporary / 'checkpoint-verification.json').write_text(json.dumps(report))
        temporary.rename(output)
        return receipt
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected-json', default='{}')
    args = parser.parse_args()
    print(json.dumps(unpack_checkpoint(args.archive, args.receipt, args.output, json.loads(args.expected_json))))
