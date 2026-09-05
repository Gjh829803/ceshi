#!/usr/bin/env python3
"""Publish production artifacts directly; never run or read an assistant review."""
import argparse
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('three_site', HERE / 'prepare-three-evaluation-site.py')
SITE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SITE)


def read(file):
    return json.loads(file.read_text()) if file.exists() else None


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def sync(run_root, attempt_roots, inputs_root, gallery_root, pod=None, stage_only=False):
    run_root, inputs_root, gallery_root = [Path(x).resolve() for x in (run_root, inputs_root, gallery_root)]
    plan = read(run_root / 'evaluation-plan.json')
    if not plan:
        raise ValueError('Missing primary production plan')
    roots = [run_root, *[Path(x).resolve() for x in attempt_roots]]
    common = run_root.parent
    if any(root.parent != common for root in roots):
        raise ValueError('Attempt roots must share the declared run directory')
    old = read(gallery_root / 'results.json') or {}
    titles = {row['id']: row.get('title') for row in old.get('cases', [])}
    primary = {row['taskId']: row for row in plan['cases']}
    selected = plan['selectedTaskIds']
    entries, states = {}, []
    for task_id in selected:
        candidates = []
        for root in roots:
            attempt_plan = read(root / 'evaluation-plan.json')
            state = read(root / task_id / 'state.json')
            if not attempt_plan or task_id not in attempt_plan.get('selectedTaskIds', []) or not state:
                continue
            planned = next((x for x in attempt_plan['cases'] if x['taskId'] == task_id), None)
            if not planned or planned['caseHash'] != primary[task_id]['caseHash'] or attempt_plan['runtimeHash'] != plan['runtimeHash'] or state.get('caseHash') != primary[task_id]['caseHash']:
                raise ValueError('Attempt production identity mismatch')
            candidates.append((state.get('submittedAt') or '', root, state))
        candidates.sort(key=lambda x: x[0])
        if not candidates:
            entries[task_id] = {'status': 'queued'}
            states.append('queued')
            continue
        _, latest_root, latest = candidates[-1]
        states.append(latest.get('phase'))
        delivered = [item for item in candidates if item[2].get('phase') == 'delivered']
        if not delivered:
            entries[task_id] = {'status': 'failed' if latest.get('phase') == 'failed' else 'running'}
            continue
        _, root, state = delivered[-1]
        case_root = root / task_id
        verified = case_root / 'host-verified'
        if not (verified / 'host-artifact-verification.json').exists():
            subprocess.run([sys.executable, str(HERE / 'three-eval-unpack.py'), '--archive', str(case_root / 'creator-delivery.tar.gz'), '--receipt', str(case_root / 'creator-result.json'), '--output', str(verified)], check=True, stdout=subprocess.DEVNULL)
        entry = {'status': 'ready', 'verifiedDirectory': verified.relative_to(common).as_posix()}
        launcher = read(case_root / 'creator-launcher-report.json') or {}
        if launcher.get('startedAt') and launcher.get('finishedAt'):
            date = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))
            entry['generationMinutes'] = round((date(launcher['finishedAt']) - date(launcher['startedAt'])).total_seconds() / 60, 2)
        entry['sourceHash'] = read(verified / 'host-artifact-verification.json')['sourceHash']
        entries[task_id] = entry
    for task_id, entry in entries.items():
        if titles.get(task_id):
            entry['displayTitle'] = titles[task_id]
    title = old.get('title', 'GPT-6 · 世界生成')
    if plan.get('evidenceScope') == 'local-fixture':
        title = title.removeprefix('LOCAL FIXTURE · ')
    publication = {'schemaVersion': 1, 'kind': 'three-creator-host-publication', 'runId': plan['runId'],
                   'title': title, 'description': '真实生产流程与生成产物；交付完成后直接开放试玩。',
                   'reviewStorageKey': old.get('reviewStorageKey', 'worldkit-feedback-' + plan['runId']),
                   'historyRuns': [{'id': x['id'], 'label': x['label']} for x in old.get('historyRuns', [])], 'cases': entries}
    ui_hashes = {name: hashlib.sha256((HERE.parents[1] / 'apps/creator-evaluation-site' / name).read_bytes()).hexdigest() for name in ['app.mjs', 'index.html', 'styles.css']}
    fingerprint = digest({'publication': publication, 'ui': ui_hashes})
    previous = read(run_root / 'production-site-sync.json') or {}
    terminal = all(phase in ['failed', 'delivered'] for phase in states)
    if previous.get('fingerprint') == fingerprint and (gallery_root / 'results.json').exists():
        return {'changed': False, 'terminal': terminal}
    publication_path = run_root / 'production-publication.json'
    publication_path.write_text(json.dumps(publication, ensure_ascii=False, indent=2) + '\n')
    gallery_root.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='production-stage-', dir=gallery_root.parent) as temporary:
        output = Path(temporary) / 'site'
        SITE.prepare_site(Path(plan['manifestPath']), run_root / 'evaluation-plan.json', inputs_root, run_root, common, publication_path, output, allow_local_fixture=stage_only)
        shutil.copytree(output, gallery_root, dirs_exist_ok=True)
    if not stage_only:
        if not pod:
            raise ValueError('Publication requires an explicit pod')
        subprocess.run([sys.executable, str(HERE / 'publish-creator-evaluation-site.py'), '--source', str(gallery_root), '--pod', pod, '--gallery', 'three'], check=True)
    (run_root / 'production-site-sync.json').write_text(json.dumps({'fingerprint': fingerprint, 'productionOnly': True, 'manualReviewRequired': False}, indent=2) + '\n')
    return {'changed': True, 'terminal': terminal, 'playableCases': sum(x['status'] == 'ready' for x in entries.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-root', required=True)
    parser.add_argument('--attempt-run-root', action='append', default=[])
    parser.add_argument('--inputs-root', required=True)
    parser.add_argument('--gallery-root', required=True)
    parser.add_argument('--pod')
    parser.add_argument('--stage-only', action='store_true')
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    while True:
        result = sync(args.run_root, args.attempt_run_root, args.inputs_root, args.gallery_root, args.pod, args.stage_only)
        print(json.dumps(result), flush=True)
        if not args.watch or result['terminal']:
            return
        time.sleep(15)


if __name__ == '__main__':
    main()
