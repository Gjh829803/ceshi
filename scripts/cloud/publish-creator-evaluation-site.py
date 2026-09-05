#!/usr/bin/env python3
"""Publish the curated gallery through the trusted FSx host, manifest last.

Does not change Kubernetes resources or public routing. Every public file is
written to a sibling temporary file and renamed; interrupted transfers cannot
expose a partially written file or a manifest before its new assets exist.
"""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path
import subprocess
import tarfile
import tempfile

REMOTE = '/fsx/pipeline/worldkit-creator-experiments/gpt6-five-case-20260905/evaluation-static'
CASE_IDS = {'gpt6-eval-' + name for name in ('coast-lighthouse', 'forest-lookout', 'paper-moon-palace', 'rice-terraces', 'nine-tailed-fox')}


def validate_manifest(manifest, gallery):
    cases = manifest.get('cases')
    if not isinstance(cases, list) or not cases:
        raise ValueError('Missing gallery cases')
    ids = [case.get('id') for case in cases]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate gallery case')
    if gallery == 'legacy-v3':
        if manifest.get('id') != 'gpt6-five-case-eval-20260905' or set(ids) != CASE_IDS:
            raise ValueError('Unexpected legacy gallery manifest')
        return REMOTE
    if gallery != 'three' or manifest.get('kind') != 'three-creator-evaluation-gallery':
        raise ValueError('Unexpected gallery kind')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,99}', manifest.get('id', '')):
        raise ValueError('Invalid Three evaluation id')
    allowed = {case + '--' + profile for case in CASE_IDS for profile in ('three-raw', 'three-sdk')}
    if not set(ids).issubset(allowed):
        raise ValueError('Unexpected Three case id')
    for case in cases:
        if case.get('profile') not in ('three-raw', 'three-sdk') or not case['id'].endswith('--' + case['profile']):
            raise ValueError('Mismatched Three profile')
    return REMOTE + '/three'
INSTALL = r'''
import hashlib,json,os,pathlib,sys,tarfile,tempfile
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
count=0;size=0
with tarfile.open(fileobj=sys.stdin.buffer,mode='r|') as archive:
 for member in archive:
  relative=pathlib.PurePosixPath(member.name)
  if not member.isfile() or relative.is_absolute() or '..' in relative.parts or member.size>128*1024*1024: raise ValueError('Invalid public file')
  target=root.joinpath(*relative.parts)
  if any(p.is_symlink() for p in (target,*target.parents)): raise ValueError('Symlink target')
  target.parent.mkdir(parents=True,exist_ok=True)
  contents=archive.extractfile(member).read()
  if len(contents)!=member.size: raise ValueError('Truncated public file')
  temporary=target.with_name(target.name+'.upload-part')
  temporary.write_bytes(contents);temporary.chmod(0o644);os.replace(temporary,target)
  count+=1;size+=len(contents)
print(json.dumps({'files':count,'bytes':size,'resultsSha256':hashlib.sha256((root/'results.json').read_bytes()).hexdigest()}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--pod', required=True)
    parser.add_argument('--gallery', choices=('legacy-v3', 'three'), default='legacy-v3')
    args = parser.parse_args()
    root = args.source.resolve()
    manifest = json.loads((root / 'results.json').read_text())
    remote = validate_manifest(manifest, args.gallery)
    files = sorted(root.rglob('*'), key=lambda p: (p.name == 'results.json', str(p)))
    with tempfile.TemporaryFile() as bundle:
        with tarfile.open(fileobj=bundle, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for path in files:
                if path.is_symlink():
                    raise ValueError('Symlink public file')
                if not path.is_file():
                    continue
                relative = path.relative_to(root).as_posix()
                if path.suffix in ('.env', '.ts', '.gz') or relative.startswith(('source/', '.')):
                    raise ValueError('Unexpected nonpublic source file')
                contents = path.read_bytes()
                info = tarfile.TarInfo(relative)
                info.size = len(contents)
                info.mode = 0o644
                archive.addfile(info, io.BytesIO(contents))
        bundle.seek(0)
        subprocess.run(['kubectl', '-n', 'ray', 'exec', '-i', args.pod, '-c', 'ray-head', '--', 'python', '-c', INSTALL, remote], stdin=bundle, check=True)
    print(json.dumps({'manifestSha256': hashlib.sha256((root / 'results.json').read_bytes()).hexdigest(), 'publishedCases': sum(c['status'] in ('ready', 'issues') for c in manifest['cases'])}))


if __name__ == '__main__':
    main()
