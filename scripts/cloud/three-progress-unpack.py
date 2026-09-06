#!/usr/bin/env python3
"""Verify/extract unverified author progress; never execute source or claim playability."""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path

HASH = re.compile(r'[a-f0-9]{64}\Z')
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_SOURCE = 128 * 1024 * 1024
MAX_PAYLOAD = MAX_SOURCE + 16 * 1024 * 1024
EXTENSIONS = {'.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.md', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.glb', '.gltf', '.bin', '.wasm', '.woff', '.woff2', '.mp3', '.ogg', '.wav'}
PRIVATE = {'node_modules', 'outputs', 'inputs', 'dist', 'scratch', 'runtime', 'compiled', 'codex_home', 'home', 'tmp', 'auth.json', 'credentials', 'aws-credentials', 'aws-config', 'google-service-account.json', 'secrets.json', 'secret.json', 'token.json', 'tokens.json'}
ROOT_EXCLUDED = {'episode.json', 'package-lock.json', 'creator-result.json'}
RECEIPT_FIELDS = {'kind', 'schemaVersion', 'status', 'profile', 'caseId', 'taskId', 'runtimeHash', 'creatorRuntimeLockHash', 'sourceHashAlgorithm', 'sourceHash', 'createdAt', 'files', 'archiveSha256', 'archiveByteLength', 'progressManifestSha256'}


def require(value, detail):
    if not value:
        raise ValueError('THREE_PROGRESS_' + detail)


def digest(file):
    file = Path(file).absolute()
    before = regular(file)
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        require((opened.st_dev, opened.st_ino, opened.st_nlink) == (before.st_dev, before.st_ino, 1), 'FILE_CHANGED')
        hashed, total = hashlib.sha256(), 0
        while chunk := stream.read(65536):
            total += len(chunk)
            require(total <= MAX_ARCHIVE, 'FILE_NOT_ADMITTED')
            hashed.update(chunk)
        after = os.fstat(stream.fileno())
        require(total == before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns and before.st_ctime_ns == after.st_ctime_ns, 'FILE_CHANGED')
    require(file.resolve() == file and file.stat().st_ino == before.st_ino, 'FILE_CHANGED')
    return hashed.hexdigest()


def regular(file, maximum=MAX_ARCHIVE):
    file = Path(file).absolute()
    require(file.resolve() == file and not file.is_symlink(), 'PATH_INVALID')
    info = file.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 <= info.st_size <= maximum, 'FILE_NOT_ADMITTED')
    return info


def relative(value):
    require(isinstance(value, str) and value and '\\' not in value and not any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in value), 'PATH_INVALID')
    parts = value.split('/')
    require(len(parts) <= 23 and all(p not in ('', '.', '..') for p in parts), 'PATH_INVALID')
    require(not any(p.startswith('.') or p.lower() in PRIVATE or p.lower().startswith('codex_home_') or re.match(r'^(?:auth|credentials?|secrets?|tokens?)(?:\.|$)', p, re.I) for p in parts), 'PRIVATE_PATH')
    return parts


def source_name(value):
    parts = relative(value)
    require(len(parts) >= 2 and parts[0] == 'source' and Path(parts[-1]).suffix.lower() in EXTENSIONS, 'SOURCE_PATH_INVALID')
    require(not (len(parts) == 2 and (parts[1] in ROOT_EXCLUDED or parts[1].lower().startswith('creator-'))), 'SOURCE_PATH_INVALID')
    return '/'.join(parts[1:])


def read_json(file):
    regular(file, 8 * 1024 * 1024)
    def pairs(values):
        result = {}
        for key, value in values:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(Path(file).read_text(encoding='utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('THREE_PROGRESS_NONFINITE_JSON')))


def inventory_hash(files):
    # Matches JSON.stringify on lexically sorted UTF-16 JS keys. This is an
    # author-inventory identity, not Compiler's source+resolved-assets identity.
    sources = {source_name(name): value for name, value in files.items()}
    sorted_sources = {name: sources[name] for name in sorted(sources, key=lambda name: name.encode('utf-16-be'))}
    return hashlib.sha256(json.dumps(sorted_sources, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def validate_receipt(receipt, expected=None):
    require(isinstance(receipt, dict) and set(receipt) == RECEIPT_FIELDS, 'RECEIPT_INVALID')
    require(receipt['kind'] == 'three-creator-progress' and type(receipt['schemaVersion']) is int and receipt['schemaVersion'] == 1 and receipt['status'] == 'unverified', 'RECEIPT_INVALID')
    require(receipt['profile'] in ('three-sdk', 'three-raw'), 'PROFILE_INVALID')
    require(isinstance(receipt['caseId'], str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{2,99}', receipt['caseId']) and receipt['taskId'] == receipt['caseId'] + '--' + receipt['profile'], 'TASK_IDENTITY_INVALID')
    require(receipt['sourceHashAlgorithm'] == 'author-inventory-sha256-v1', 'HASH_ALGORITHM_INVALID')
    for key in ('sourceHash', 'runtimeHash', 'creatorRuntimeLockHash', 'archiveSha256', 'progressManifestSha256'):
        require(isinstance(receipt[key], str) and HASH.fullmatch(receipt[key]), 'HASH_INVALID')
    require(type(receipt['archiveByteLength']) is int and 0 < receipt['archiveByteLength'] <= MAX_ARCHIVE, 'ARCHIVE_SIZE')
    require(isinstance(receipt['createdAt'], str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z', receipt['createdAt']), 'TIMESTAMP_INVALID')
    require(isinstance(expected or {}, dict), 'EXPECTED_IDENTITY_INVALID')
    for key, value in (expected or {}).items():
        require(receipt.get(key) == value, 'IDENTITY_MISMATCH_' + key)
    require(isinstance(receipt['files'], dict) and 1 <= len(receipt['files']) <= 2000, 'INVENTORY_INVALID')
    for name, value in receipt['files'].items():
        source_name(name)
        require(isinstance(value, str) and HASH.fullmatch(value), 'INVENTORY_INVALID')
    require(inventory_hash(receipt['files']) == receipt['sourceHash'], 'SOURCE_HASH_MISMATCH')
    return receipt


def admitted_payload(name, is_file):
    if name in ('progress.json', 'artifact-hashes.json'):
        require(is_file, 'ARCHIVE_MEMBER')
        return
    parts = relative(name)
    require(parts[0] == 'source', 'ARCHIVE_MEMBER')
    if is_file:
        source_name(name)


def verify_progress(directory, expected=None):
    directory = Path(directory).absolute()
    require(directory.resolve() == directory and not directory.is_symlink(), 'PATH_INVALID')
    receipt = validate_receipt(read_json(directory / 'progress-receipt.json'), expected)
    payload = directory / 'payload'
    require(payload.is_dir() and payload.resolve() == payload, 'PATH_INVALID')
    paths = list(payload.rglob('*'))
    require(len(paths) <= 10000, 'MEMBER_LIMIT')
    total, source_total = 0, 0
    for file in paths:
        require(not file.is_symlink(), 'LINK_REJECTED')
        info = file.lstat()
        require(stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode), 'FILE_NOT_ADMITTED')
        admitted_payload(file.relative_to(payload).as_posix(), file.is_file())
        if file.is_file():
            size = regular(file, MAX_SOURCE).st_size
            total += size
            if file.relative_to(payload).parts[0] == 'source':
                source_total += size
    require(total <= MAX_PAYLOAD and source_total <= MAX_SOURCE, 'PAYLOAD_SIZE')
    actual = {file.relative_to(payload).as_posix(): digest(file) for file in paths if file.is_file()}
    manifest = read_json(payload / 'progress.json')
    archive_fields = {'archiveSha256', 'archiveByteLength', 'progressManifestSha256'}
    require({key: value for key, value in receipt.items() if key not in archive_fields} == manifest, 'MANIFEST_MISMATCH')
    require(actual.get('progress.json') == receipt['progressManifestSha256'], 'MANIFEST_HASH')
    inventory = read_json(payload / 'artifact-hashes.json')
    require(isinstance(inventory, dict) and set(inventory) == {'schemaVersion', 'files'} and type(inventory['schemaVersion']) is int and inventory['schemaVersion'] == 1 and inventory['files'] == {k: v for k, v in actual.items() if k != 'artifact-hashes.json'}, 'CLOSURE_MISMATCH')
    require(manifest['files'] == {k: v for k, v in actual.items() if k not in ('artifact-hashes.json', 'progress.json')}, 'FILE_HASH_MISMATCH')
    return receipt, actual


def unpack_progress(archive, receipt_path, output, expected=None):
    archive, output = Path(archive).absolute(), Path(output).absolute()
    receipt = validate_receipt(read_json(receipt_path), expected)
    require(regular(archive).st_size == receipt['archiveByteLength'] and digest(archive) == receipt['archiveSha256'], 'PAIR_MISMATCH')
    names, total = set(), 0
    # Validate all names and types before writing anything. tar.extract is never used.
    with tarfile.open(archive, 'r|gz') as stream:
        for member in stream:
            name = member.name.rstrip('/')
            require(name == 'payload' or name.startswith('payload/'), 'ARCHIVE_ROOT')
            require(name not in names and (member.isfile() or member.isdir()) and not member.issparse(), 'ARCHIVE_MEMBER')
            if name == 'payload':
                require(member.isdir(), 'ARCHIVE_ROOT')
            else:
                admitted_payload(name[len('payload/'):], member.isfile())
            names.add(name)
            total += member.size
            require(len(names) <= 10000 and 0 <= member.size <= MAX_SOURCE and total <= MAX_PAYLOAD, 'ARCHIVE_LIMIT')
    if output.exists():
        existing, _ = verify_progress(output, expected)
        require(existing == receipt, 'EXISTING_RECEIPT_MISMATCH')
        return receipt
    require(not output.is_symlink(), 'OUTPUT_EXISTS')
    output.parent.mkdir(parents=True, exist_ok=True)
    require(output.parent.resolve() == output.parent, 'PATH_INVALID')
    temporary = Path(tempfile.mkdtemp(prefix='.progress-verify-', dir=output.parent))
    try:
        with tarfile.open(archive, 'r|gz') as stream:
            remaining, written_bytes = set(names), 0
            for member in stream:
                name = member.name.rstrip('/')
                require(name in remaining and (member.isfile() or member.isdir()) and not member.issparse(), 'ARCHIVE_CHANGED')
                remaining.remove(name)
                written_bytes += member.size
                require(0 <= member.size <= MAX_SOURCE and written_bytes <= MAX_PAYLOAD, 'ARCHIVE_LIMIT')
                target = temporary.joinpath(*name.split('/'))
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with stream.extractfile(member) as source, target.open('xb') as destination:
                        shutil.copyfileobj(source, destination)
            require(not remaining, 'ARCHIVE_CHANGED')
        require(regular(archive).st_size == receipt['archiveByteLength'] and digest(archive) == receipt['archiveSha256'], 'ARCHIVE_CHANGED')
        (temporary / 'progress-receipt.json').write_text(json.dumps(receipt), encoding='utf-8')
        verify_progress(temporary, expected)
        report = {'kind': 'three-creator-progress-verification', 'schemaVersion': 1, 'status': 'verified', 'sourceStatus': 'unverified', 'sourceHash': receipt['sourceHash'], 'archiveSha256': receipt['archiveSha256'], 'browserReplay': 'not-run'}
        (temporary / 'progress-verification.json').write_text(json.dumps(report), encoding='utf-8')
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
    print(json.dumps(unpack_progress(args.archive, args.receipt, args.output, json.loads(args.expected_json))))
