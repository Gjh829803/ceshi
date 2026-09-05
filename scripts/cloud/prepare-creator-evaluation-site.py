#!/usr/bin/env python3
"""Stage a curated public gallery from separately verified cloud deliveries.

No network calls. Original archives/payloads remain unchanged. publication.json
is a Host-authored list of statuses and reviews, never a model-produced receipt.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or any(p.is_symlink() for p in path.parents):
        raise ValueError('Refusing a symlink output')
    if path.exists() and path.read_bytes() == data:
        return
    temp = path.with_name(path.name + '.part')
    temp.write_bytes(data)
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evaluation-root', type=Path, required=True)
    parser.add_argument('--publication', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.evaluation_root.resolve()
    output = args.output.resolve()
    selection = read(root / 'selected-cases.json')
    publication = read(args.publication)
    result = {'schemaVersion': 1, 'id': selection['id'], 'updatedAt': datetime.now(timezone.utc).isoformat(), 'cases': []}
    for case in selection['cases']:
        case_id = case['id']
        if not re.fullmatch(r'[a-z0-9-]+', case_id):
            raise ValueError('Invalid case id')
        entry = publication.get(case_id, {})
        status = entry.get('status', 'running')
        if status not in ('running', 'queued', 'verifying', 'ready', 'issues', 'failed'):
            raise ValueError('Unknown publication status')
        reference = (root / 'inputs' / case_id / 'reference.png').read_bytes()
        if digest(reference) != 'sha256:' + case['referenceImage']['contentSha256']:
            raise ValueError('Reference hash mismatch')
        reference_path = f'references/{case_id}.png'
        put(output / reference_path, reference)
        row = {'id': case_id, 'title': case['title'], 'status': status, 'tags': case['selectionTags'], 'reference': reference_path,
               'prompt': case['effectiveUserPrompt'], 'note': entry.get('note', '正在云端生成和验证，完成后开放试玩。')}
        if status in ('ready', 'issues'):
            verified = root / 'host-verified' / entry.get('verifiedDirectory', case_id)
            if (root / 'host-verified').resolve() not in verified.resolve().parents:
                raise ValueError('Verification directory outside Host scope')
            report = read(verified / 'host-artifact-verification.json')
            if report['status'] != 'static-artifacts-passed' or report['sceneId'] != case_id:
                raise ValueError('Missing passing Host artifact verification')
            smoke_path = root / entry['browserSmoke']
            smoke = read(smoke_path)
            if smoke.get('caseId') != case_id:
                raise ValueError('Independent browser report belongs to another case')
            if status == 'ready' and smoke.get('status') != 'passed':
                raise ValueError('Missing passing independent browser verification')
            if status == 'issues' and (not entry.get('browserPlayable') or not entry.get('note')):
                raise ValueError('Known-issue publication requires explicit Host playability confirmation and issue notes')
            payload = verified / 'payload'
            hashes = read(payload / 'artifact-hashes.json')
            source_hash = report['sourceHash']
            if hashes['sourceHash'] != source_hash or (smoke.get('sourceHash') and smoke['sourceHash'] != source_hash):
                raise ValueError('Mismatched source identity')
            playtest = read(payload / 'playtest-report.json')
            views = read(payload / 'triview-manifest.json')
            if playtest['sourceHash'] != source_hash or views['sourceHash'] != source_hash or playtest['status'] != 'passed':
                raise ValueError('Mismatched playtest or triview identity')
            relative = f'cases/{case_id}/{source_hash.removeprefix("sha256:")[:16]}'
            view_files = [Path(v['image']['path']).name for v in views['images']]
            selected = [name for name in hashes['files'] if name.startswith('playable/')]
            selected += ['opening-world.png', 'playtest.mp4'] + view_files
            for name in selected:
                path = payload / name
                if path.is_symlink() or not path.is_file() or payload.resolve() not in path.resolve().parents:
                    raise ValueError('Invalid artifact path')
                content = path.read_bytes()
                if digest(content) != hashes['files'].get(name):
                    raise ValueError(f'Artifact changed after verification: {name}')
                put(output / relative / name, content)
            row.update({'sourceHash': source_hash, 'opening': relative + '/opening-world.png', 'video': relative + '/playtest.mp4',
                        'playable': relative + '/playable/index.html',
                        'triviews': [{'name': v['name'], 'image': relative + '/' + file} for v, file in zip(views['images'], view_files)],
                        'metrics': {'simulationSeconds': playtest['actualSimulationSeconds'], 'visitedTargets': len(playtest['visitedTargets']),
                                    'targetCount': playtest['targetCount'], 'travelledMeters': playtest['travelledMeters'],
                                    'captureFps': playtest['framesPerSecond'], 'generationMinutes': entry.get('generationMinutes')}})
        result['cases'].append(row)
    app = Path(__file__).resolve().parents[2] / 'apps' / 'creator-evaluation-site'
    for name in ('index.html', 'app.mjs', 'styles.css'):
        put(output / name, (app / name).read_bytes())
    put(output / 'results.json', (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode())
    print(json.dumps({'output': str(output), 'caseCount': len(result['cases']), 'readyCount': sum(c['status'] in ('ready', 'issues') for c in result['cases'])}))


if __name__ == '__main__':
    main()
