#!/usr/bin/env python3
"""Stage an independent Three gallery locally; never upload or execute a delivery.

Inputs: --selection selected-cases.json --plan evaluation-plan.json
--inputs-root INPUTS --evaluation-root EVALUATION_RUN --verified-root HOST_VERIFIED
--publication PUBLICATION --output NEW_DIRECTORY. The output mounts at
/creator-evals/three/ and copies the shared gallery UI without modifying it.

Host publication: {schemaVersion:1, kind:'three-creator-host-publication', runId,
 title?, description?, reviewStorageKey?, cases:{TASK_ID:{status, note?,
 verifiedDirectory?, browserReview?, browserPlayable?, generationMinutes?,
 publicPlayableFiles?:['data/public.json']}}}. Paths are relative to verified-root
or evaluation-root respectively. Never use an author-supplied publication/review.

A browserReview binds schemaVersion, kind='three-creator-independent-browser-review',
runId, caseId, taskId, profile, sourceHash, worldBuildHash, archiveSha256,
referenceImageSha256, status, browserPlayable, referenceCompared,
externalGoalsReviewed, pageErrors and runtimeErrors. Ready requires passed,
playable, both review flags and no errors. Issues requires explicit Host permission
and issue notes; neither status changes the recorded semantic acceptance result.

Plans admit either legacy three-creator-paired-plan (suite omitted or paired),
or three-creator-sdk-plan (suite sdk-only, only three-sdk tasks). Both require
explicit selectedTaskIds. SDK-only and SDK 0.2+ deliveries require matching
180s+ active/input recordings and 180s+ video. Older paired artifacts remain
readable without inventing active time that their original evidence did not record.
"""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import stat
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROFILES = ('three-raw', 'three-sdk')
PLAN_SUITES = {'three-creator-paired-plan': 'paired', 'three-creator-sdk-plan': 'sdk-only'}
EVIDENCE_SCOPES = {'paired': 'paired-cloud-evaluation', 'sdk-only': 'sdk-only-cloud-evaluation'}
STATUSES = ('queued', 'running', 'verifying', 'issues', 'ready', 'failed')
HASH = re.compile(r'[a-f0-9]{64}\Z')
ID = re.compile(r'[a-z0-9][a-z0-9-]{1,159}\Z')
MAX_FILE = 256 * 1024 * 1024
MAX_PAYLOAD = 512 * 1024 * 1024
PUBLIC_MEDIA = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.glb', '.gltf', '.bin', '.wasm',
                '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.ogg', '.wav'}
PRIVATE_NAME = re.compile(r'(?:^|[-_.])(?:config|events?|trace|credentials?|secrets?|auth|prompt|project|case-input)(?:[-_.]|$)', re.I)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(filename):
    value = hashlib.sha256()
    with filename.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def checked_hash(value, label):
    require(isinstance(value, str) and HASH.fullmatch(value), f'Invalid SHA256: {label}')
    return value


def checked_id(value, label):
    require(isinstance(value, str) and ID.fullmatch(value), f'Invalid id: {label}')
    return value


def relative_name(value):
    require(isinstance(value, str) and value and '\\' not in value and not any(ord(c) < 32 for c in value), 'Invalid relative path')
    parts = value.split('/')
    require(not value.startswith('/') and all(p not in ('', '.', '..') for p in parts), f'Unsafe relative path: {value}')
    return PurePosixPath(value)


def checked_root(value):
    result = Path(value).absolute()
    require(result.is_dir() and not result.is_symlink(), f'Missing or linked input root: {result}')
    require(result.resolve() == result, f'Input root has symlink ancestors: {result}')
    return result


def within(root, value):
    relative = relative_name(value)
    result = root.joinpath(*relative.parts)
    current = root
    for part in relative.parts:
        current /= part
        require(not current.is_symlink(), f'Symlink input rejected: {value}')
    require(result.resolve().is_relative_to(root), f'Path outside declared root: {value}')
    return result


def regular(filename, maximum=MAX_FILE):
    require(not filename.is_symlink(), f'Linked file rejected: {filename.name}')
    info = filename.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, f'Nonregular or hardlinked file: {filename.name}')
    require(0 <= info.st_size <= maximum, f'File size limit: {filename.name}')
    return info


def read_json(filename):
    regular(filename, 32 * 1024 * 1024)
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f'Duplicate JSON field in {filename.name}: {key}')
            result[key] = value
        return result
    def constant(value):
        raise ValueError(f'Nonfinite JSON number: {value}')
    return json.loads(filename.read_text(encoding='utf-8'), object_pairs_hook=pairs, parse_constant=constant)


def png_size(filename):
    with filename.open('rb') as source:
        header = source.read(33)
    require(len(header) == 33 and header[:8] == b'\x89PNG\r\n\x1a\n' and header[8:16] == b'\0\0\0\rIHDR', f'Not a PNG: {filename.name}')
    width, height = struct.unpack('>II', header[16:24])
    require(0 < width <= 16384 and 0 < height <= 16384, 'Invalid PNG dimensions')
    return width, height


def same(value, expected, fields, label):
    require(isinstance(value, dict), f'Invalid object: {label}')
    for field in fields:
        require(field in value and value[field] == expected[field], f'{label} identity mismatch: {field}')


def finite_number(value, label, minimum=0):
    require(type(value) in (int, float) and math.isfinite(value) and value >= minimum, f'Invalid numeric value: {label}')
    return value


def requires_active_play(delivery, sdk_only=False):
    if sdk_only:
        return True
    if delivery.get('profile') != 'three-sdk':
        return False
    if delivery.get('browserObservationContract') == 'WorldObservation-v2':
        return True
    for field in ('sdkVersion', 'toolVersion'):
        value = delivery.get(field)
        if value is None:
            continue
        match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9.+-]+)?', value) if isinstance(value, str) else None
        require(match is not None, f'Invalid SDK delivery version: {field}')
        if tuple(map(int, match.groups())) >= (0, 2, 0):
            return True
    return False


def validate_recorded_timing(played, delivery, active_required):
    for field, label in (('activePlaySeconds', 'active duration'), ('inputWallSeconds', 'input duration')):
        if active_required or field in played:
            seconds = finite_number(played.get(field), field, 180 if active_required else 0)
            require(seconds < 3600, f'Invalid recorded {label}: {field}')
            if active_required or field in delivery:
                require(seconds == delivery.get(field), f'Recorded {label} mismatch')
        else:
            require(field not in delivery, f'Delivery {field} has no recorded evidence')


def verified_payload(directory, profile, lock_hash, sdk_only=False):
    """Recheck the actual regular-file closure instead of trusting a stale report."""
    report = read_json(within(directory, 'host-artifact-verification.json'))
    require(report.get('kind') == 'three-creator-host-artifact-verification' and report.get('schemaVersion') == 1 and report.get('status') == 'passed', 'Missing passing Three Host artifact verification')
    require(report.get('profile') == profile and report.get('engine') == 'three@0.185.1', 'Wrong delivery profile or engine')
    require(report.get('creatorRuntimeLockHash') == lock_hash, 'Delivery is bound to another Creator runtime lock')
    for field in ('sourceHash', 'worldBuildHash', 'archiveSha256'):
        checked_hash(report.get(field), field)
    payload = checked_root(within(directory, 'payload'))
    actual = {}
    total = 0
    for current, directories, filenames in os.walk(payload, followlinks=False):
        for name in directories:
            require(not Path(current, name).is_symlink(), 'Linked payload directory rejected')
        for name in filenames:
            filename = Path(current, name)
            relative = filename.relative_to(payload).as_posix()
            relative_name(relative)
            total += regular(filename).st_size
            require(total <= MAX_PAYLOAD and len(actual) < 10000, 'Payload budget exceeded')
            actual[relative] = file_digest(filename)
    inventory = read_json(payload / 'artifact-hashes.json')
    require(inventory.get('schemaVersion') == 1 and isinstance(inventory.get('files'), dict), 'Invalid artifact inventory')
    for name, value in inventory['files'].items():
        relative_name(name)
        checked_hash(value, name)
    require({k: v for k, v in actual.items() if k != 'artifact-hashes.json'} == inventory['files'], 'Artifact file closure or SHA256 changed after Host verification')
    require(report.get('fileCount') == len(actual) and report.get('uncompressedBytes') == total, 'Host verification file census changed')
    delivery = read_json(payload / 'delivery.json')
    require(delivery.get('kind') == 'three-creator-delivery' and delivery.get('schemaVersion') in (1, 2) and delivery.get('status') == 'ready-for-independent-review' and delivery.get('technicalStatus') == 'passed', 'Invalid Three delivery')
    same(delivery, report, ('profile', 'engine', 'sourceHash', 'worldBuildHash', 'creatorRuntimeLockHash'), 'Delivery')
    require(delivery.get('files') == {k: v for k, v in actual.items() if k not in ('artifact-hashes.json', 'delivery.json')}, 'Delivery manifest file closure changed')
    for field in (('runtimeHash', 'episodeHash') if delivery['schemaVersion'] == 1 else ('runtimeHash', 'previewEvidenceSha256')):
        checked_hash(delivery.get(field), field)
    build_identity = {key: delivery[key] for key in ('sourceHash', 'runtimeHash', 'profile')}
    require(digest(json.dumps(build_identity, separators=(',', ':')).encode()) == delivery['worldBuildHash'], 'worldBuildHash is inconsistent')
    if delivery['schemaVersion'] == 2:
        require(delivery.get('validationMode') == 'interactive-preview' and report.get('validationMode') == 'interactive-preview', 'Wrong preview delivery mode')
        require(all(key not in delivery for key in ('episodeHash', 'actualWallSeconds', 'activePlaySeconds', 'inputWallSeconds', 'videoMetadata', 'captureTiming')), 'Preview delivery cannot claim recorded play')
        require(actual.get('preview/preview.json') == delivery['previewEvidenceSha256'], 'Preview identity changed')
        preview = read_json(payload / 'preview/preview.json'); captures = read_json(payload / 'captures/captures.json')
        same(preview, delivery, ('profile', 'sourceHash', 'worldBuildHash'), 'Opening preview')
        same(captures, delivery, ('profile', 'sourceHash', 'worldBuildHash'), 'Capture manifest')
        require(preview.get('kind') == 'three-creator-browser-preview' and preview.get('view') == 'opening', 'Actual opening preview required')
        require(preview.get('pageErrors') == preview.get('runtimeErrors') == preview.get('blockedNetworkRequests') == captures.get('pageErrors') == [], 'Preview browser errors')
        require(actual.get('preview/' + PurePosixPath(preview['image']['path']).name) == preview['image']['sha256'], 'Preview image changed')
        return payload, actual, report, delivery, None, captures
    require(actual.get('episode.json') == delivery['episodeHash'], 'Episode identity changed')
    played = read_json(payload / 'playtest/playtest.json')
    captures = read_json(payload / 'captures/captures.json')
    same(played, delivery, ('profile', 'sourceHash', 'worldBuildHash', 'runtimeHash', 'episodeHash'), 'Playtest')
    same(captures, delivery, ('profile', 'sourceHash', 'worldBuildHash'), 'Capture manifest')
    require(played.get('status') == 'passed' and played.get('isCompleteEpisode') is True and played.get('capturedInput') is True, 'No complete passing recorded episode')
    seconds = finite_number(played.get('actualWallSeconds'), 'actualWallSeconds', 180)
    require(seconds < 3600 and seconds == delivery.get('actualWallSeconds'), 'Recorded wall duration mismatch')
    validate_recorded_timing(played, delivery, requires_active_play(delivery, sdk_only))
    require(played.get('pageErrors') == [] and played.get('runtimeErrors') == [] and played.get('blockedNetworkRequests') == [] and captures.get('pageErrors') == [], 'Recorded browser errors')
    require(isinstance(played.get('targetResults'), list) and played['targetResults'] == delivery.get('targetResults'), 'Target measurement mismatch')
    return payload, actual, report, delivery, played, captures


def curated_playable(actual, extra):
    require(isinstance(extra, list) and len(extra) <= 100, 'Invalid explicit public playable files')
    extras = {relative_name(name).as_posix() for name in extra}
    selected = []
    for name in actual:
        if not name.startswith('playable/'):
            continue
        relative = PurePosixPath(name).relative_to('playable')
        suffix = relative.suffix.lower()
        # Compiled executable code is required by the game. Original author source,
        # source maps, event logs and build/task configuration are never published.
        private = any(part.startswith('.') or PRIVATE_NAME.search(part) for part in relative.parts)
        if name == 'playable/asset-definitions.json':
            private = False
        default = (relative.as_posix() in ('index.html', 'asset-definitions.json') or
                   suffix in PUBLIC_MEDIA or suffix == '.css' or
                   (relative.parts[0] in ('compiled', 'runtime') and suffix == '.js'))
        explicit = relative.as_posix() in extras
        if explicit:
            require(not private and suffix == '.json', 'Explicit extra may only select public data JSON, never source/config/logs')
        if (default or explicit) and not private:
            selected.append(name)
    require('playable/index.html' in selected, 'Missing playable entry')
    require(all('playable/' + name in selected for name in extras), 'Explicit public file missing or ineligible')
    return selected


def validate_public_assets(payload, selected, actual):
    if 'playable/asset-definitions.json' not in selected:
        return
    definitions = read_json(payload / 'playable/asset-definitions.json')
    require(definitions.get('schemaVersion') == 1 and isinstance(definitions.get('assets'), list), 'Invalid public asset definitions')
    for asset in definitions['assets']:
        require(isinstance(asset, dict) and 'sourcePath' not in asset, 'Host source path in public asset definition')
        uri = asset.get('uri')
        require(isinstance(uri, str) and uri.startswith('./') and ':' not in uri and '?' not in uri and '#' not in uri, 'Asset URI must stay in this playable')
        name = 'playable/' + relative_name(uri[2:]).as_posix()
        require(name in selected and actual[name] == checked_hash(asset.get('sha256'), 'asset hash'), 'Public asset hash or path mismatch')
        require(regular(payload / name).st_size == asset.get('byteLength'), 'Public asset length mismatch')


def add_delivery(row, entry, expected, verified_root, evaluation_root, lock_hash, add_file, sdk_only=False):
    directory = checked_root(within(verified_root, entry.get('verifiedDirectory', row['id'])))
    payload, actual, report, delivery, played, captures = verified_payload(directory, row['profile'], lock_hash, sdk_only)
    review = read_json(within(evaluation_root, entry.get('browserReview')))
    require(review.get('kind') == 'three-creator-independent-browser-review' and review.get('schemaVersion') == 1, 'Missing independent browser review')
    same(review, expected, ('runId', 'caseId', 'taskId', 'profile', 'referenceImageSha256'), 'Browser review')
    same(review, report, ('sourceHash', 'worldBuildHash', 'archiveSha256'), 'Browser review')
    require(review.get('status') in ('passed', 'issues', 'failed') and type(review.get('browserPlayable')) is bool and type(review.get('referenceCompared')) is bool and type(review.get('externalGoalsReviewed')) is bool, 'Incomplete independent review')
    require(isinstance(review.get('pageErrors'), list) and isinstance(review.get('runtimeErrors'), list), 'Missing independent error observations')
    if row['status'] == 'ready':
        require(review['status'] == 'passed' and review['browserPlayable'] and review['referenceCompared'] and review['externalGoalsReviewed'] and review['pageErrors'] == [] and review['runtimeErrors'] == [], 'Ready requires passing independent browser, reference and external-goal review')
    else:
        require(entry.get('browserPlayable') is True and review['browserPlayable'] is True and bool(entry.get('note', '').strip()), 'Issues requires explicit Host playability confirmation and issue notes')
    prefix = f"cases/{row['id']}/{delivery['worldBuildHash']}"
    selected = curated_playable(actual, entry.get('publicPlayableFiles', []))
    validate_public_assets(payload, selected, actual)
    images = captures.get('images')
    require(isinstance(images, list) and 1 <= len(images) <= 101, 'Invalid capture list')
    opening = None
    triviews = []
    for capture in images:
        same(capture, delivery, ('profile', 'sourceHash', 'worldBuildHash'), 'Capture')
        require(capture.get('view') in ('opening', 'entity-triview', 'top-down'), 'Invalid capture view')
        info = capture.get('image', {})
        original_path = info.get('path')
        require(isinstance(original_path, str) and '\\' not in original_path, 'Invalid capture image metadata')
        name = PurePosixPath(original_path).name
        require(re.fullmatch(r'(?:opening|entity-triview|top-down)-[a-f0-9]{10}\.png', name), 'Unexpected capture filename')
        relative = 'captures/' + name
        require(relative in actual and actual[relative] == checked_hash(info.get('sha256'), 'capture image'), 'Capture hash mismatch')
        require(regular(payload / relative).st_size == info.get('byteLength'), 'Capture image length mismatch')
        width, height = png_size(payload / relative)
        if capture['view'] == 'opening':
            require(opening is None, 'Multiple opening captures')
            opening = prefix + '/' + relative
        elif capture['view'] == 'entity-triview':
            require(width == 1536 and height == 640 and capture.get('panelOrder') == ['front', 'right', 'back'], 'Invalid three-view image shape or panel order')
            ids = capture.get('entityIds')
            require(isinstance(ids, list) and ids and all(isinstance(value, str) and 0 < len(value) <= 256 for value in ids), 'Invalid three-view target identities')
            triviews.append({'name': ' / '.join(ids), 'entityIds': ids, 'image': prefix + '/' + relative})
        selected.append(relative)
    require(opening is not None and any('player' in view['entityIds'] for view in triviews), 'Opening and whole-player three-view required')
    video = None
    if played is not None:
        video_path = played.get('videoPath')
        require(isinstance(video_path, str) and '\\' not in video_path, 'Missing recorded video path')
        video = 'playtest/' + PurePosixPath(video_path).name
        require(video in ('playtest/playtest.mp4', 'playtest/playtest.webm') and video in actual, 'Recorded video missing from closure')
        selected.append(video)
        metadata = played.get('videoMetadata', {})
        video_seconds = finite_number(metadata.get('durationSeconds'), 'video duration', 180 if requires_active_play(delivery, sdk_only) else .001)
        frame_count = finite_number(metadata.get('frameCount'), 'video frames', 1)
        targets = played['targetResults']
        require(all(isinstance(target, dict) and type(target.get('reached')) is bool for target in targets), 'Invalid target result')
    for name in sorted(set(selected)):
        add_file(prefix + '/' + name, payload / name, actual[name])
    generation_minutes = entry.get('generationMinutes')
    if generation_minutes is not None:
        finite_number(generation_minutes, 'generationMinutes')
    metrics = {'generationMinutes': generation_minutes}
    if played is not None:
        metrics.update({'simulationSeconds': round(played['actualWallSeconds'], 2), 'actualWallSeconds': played['actualWallSeconds'], 'timeDomain': 'wall-clock',
                        **{field: played[field] for field in ('activePlaySeconds', 'inputWallSeconds') if field in played},
                        'videoDurationSeconds': video_seconds, 'visitedTargets': sum(target['reached'] for target in targets), 'targetCount': len(targets),
                        'travelledMeters': finite_number(played.get('travelledMeters'), 'travelledMeters'),
                        'captureFps': round(frame_count / video_seconds, 3), 'captureFpsSource': 'measured-video-frames-per-duration'})
    row.update({'sourceHash': delivery['sourceHash'], 'worldBuildHash': delivery['worldBuildHash'], 'archiveSha256': report['archiveSha256'],
                'opening': opening, 'playable': prefix + '/playable/index.html', 'triviews': triviews, 'metrics': metrics,
                'validationMode': delivery.get('validationMode', 'recorded-episode'),
                'review': {key: review[key] for key in ('status', 'browserPlayable', 'referenceCompared', 'externalGoalsReviewed')},
                'semanticStatus': 'independently-reviewed' if row['status'] == 'ready' else 'known-issues'})
    if video is not None:
        row['video'] = prefix + '/' + video



def prepare_site(selection_path, plan_path, inputs_root, evaluation_root, verified_root, publication_path, output, allow_local_fixture=False):
    inputs_root, evaluation_root, verified_root = map(checked_root, (inputs_root, evaluation_root, verified_root))
    selection, plan, publication = map(read_json, (Path(selection_path), Path(plan_path), Path(publication_path)))
    require(selection.get('schemaVersion') == 1 and isinstance(selection.get('cases'), list), 'Invalid selected cases')
    require(plan.get('schemaVersion') == 1 and plan.get('kind') in PLAN_SUITES and plan.get('engine') == 'three@0.185.1', 'Not a supported Three evaluation plan')
    suite = PLAN_SUITES[plan['kind']]
    require(plan.get('suite', 'paired') == suite, 'Three plan kind/suite mismatch')
    sdk_only = suite == 'sdk-only'
    run_id = checked_id(plan.get('runId'), 'runId')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{2,99}', run_id), 'Three evaluation id must contain 3–100 lowercase letters, digits or hyphens')
    local_fixture = plan.get('evidenceScope') == 'local-fixture'
    require(not local_fixture or allow_local_fixture, 'Local fixtures require --allow-local-fixture and must never be represented as cloud results')
    lock_hash = plan.get('runtimeHash')
    if not (local_fixture and lock_hash is None):
        checked_hash(lock_hash, 'Creator runtime lock hash')
    require(publication.get('kind') == 'three-creator-host-publication' and publication.get('schemaVersion') == 1 and publication.get('runId') == run_id and isinstance(publication.get('cases'), dict), 'Invalid Host publication')
    base_cases = {}
    for item in selection['cases']:
        case_id = checked_id(item.get('id'), 'selected case')
        require(case_id not in base_cases, 'Duplicate selected case')
        base_cases[case_id] = item
    tasks = {}
    require(isinstance(plan.get('cases'), list) and plan['cases'], 'Invalid planned task selection')
    for item in plan['cases']:
        require(isinstance(item, dict), 'Invalid planned task selection')
        task_id = checked_id(item.get('taskId'), 'taskId')
        require(item.get('caseId') in base_cases and item.get('profile') in (('three-sdk',) if sdk_only else PROFILES) and task_id == item['caseId'] + '--' + item['profile'] and task_id not in tasks, 'Plan task/profile selection mismatch')
        checked_hash(item.get('caseHash'), 'caseHash')
        tasks[task_id] = item
    selected_ids = plan.get('selectedTaskIds')
    require(isinstance(selected_ids, list) and 1 <= len(selected_ids) <= (5 if sdk_only else 10) and all(isinstance(task_id, str) for task_id in selected_ids) and len(set(selected_ids)) == len(selected_ids) and all(task_id in tasks for task_id in selected_ids), 'Invalid explicit planned task selection')
    require(all(task_id in selected_ids for task_id in publication['cases']), 'Publication contains an unselected task')
    title = publication.get('title', 'Three Creator · SDK 独立评测' if sdk_only else 'Three Creator · 原生 Three 与薄 SDK 对照评测')
    description = publication.get('description', '独立 Three 实验；参考还原、外部任务目标和可玩性由 Host 分别审查。')
    storage_key = publication.get('reviewStorageKey', 'worldkit-three-review-' + run_id)
    require(all(isinstance(value, str) and 0 < len(value) <= 1000 for value in (title, description, storage_key)), 'Invalid public gallery text')
    result = {'schemaVersion': 1, 'kind': 'three-creator-evaluation-gallery', 'id': run_id, 'engine': 'three@0.185.1', 'suite': suite,
              'title': ('LOCAL FIXTURE · ' if local_fixture else '') + title, 'description': description, 'reviewStorageKey': storage_key,
              'evidenceScope': 'local-fixture' if local_fixture else EVIDENCE_SCOPES[suite],
              'updatedAt': datetime.now(timezone.utc).isoformat(), 'cases': []}
    history = publication.get('historyRuns', [])
    require(isinstance(history, list) and len(history) <= 20, 'Invalid run history')
    result['historyRuns'] = []
    for previous in history:
        require(isinstance(previous, dict), 'Invalid history run')
        previous_id = checked_id(previous.get('id'), 'history run')
        label = previous.get('label', previous_id)
        require(isinstance(label, str) and 0 < len(label) <= 200, 'Invalid history label')
        result['historyRuns'].append({'id': previous_id, 'label': label, 'href': '/creator-evals/three/runs/' + previous_id + '/'})
    files = {}
    def add_file(relative, source, expected_hash):
        relative_name(relative)
        regular(source)
        require(file_digest(source) == expected_hash, f'Staged input changed: {relative}')
        if relative in files:
            require(files[relative][1] == expected_hash, 'Conflicting public artifact destination')
        else:
            files[relative] = (source, expected_hash)
    for task_id in selected_ids:
        task, entry = tasks[task_id], publication['cases'].get(task_id, {})
        require(isinstance(entry, dict), 'Invalid Host case publication')
        case = base_cases[task['caseId']]
        status = entry.get('status', 'queued')
        require(status in STATUSES, 'Unknown publication status')
        reference_hash = checked_hash(case.get('referenceImage', {}).get('contentSha256'), 'reference image')
        reference = within(inputs_root, task['caseId'] + '/reference.png')
        regular(reference)
        require(file_digest(reference) == reference_hash, 'Original reference hash changed')
        dimensions = png_size(reference)
        expected_dimensions = (case['referenceImage'].get('widthPixels'), case['referenceImage'].get('heightPixels'))
        require(dimensions == expected_dimensions, 'Original reference dimensions changed')
        case_input = read_json(within(evaluation_root, task_id + '/case-input.json'))
        expected = {'runId': run_id, 'caseId': task['caseId'], 'taskId': task_id, 'profile': task['profile'], 'referenceImageSha256': reference_hash}
        same(case_input, expected, ('caseId', 'taskId', 'profile', 'referenceImageSha256'), 'Case input')
        require(case_input.get('schemaVersion') == 1 and case_input.get('kind') == 'three-creator-case-input' and case_input.get('engine') == 'three@0.185.1' and case_input.get('runtimeHash') == lock_hash, 'Case input engine/runtime mismatch')
        # Runner hashes JSON.stringify(caseInput), before pretty-printing its file.
        require(digest(json.dumps(case_input, ensure_ascii=False, separators=(',', ':')).encode()) == task['caseHash'], 'Planned case input hash mismatch')
        prompt = case_input.get('effectiveUserPrompt')
        require(isinstance(prompt, str) and digest(prompt.encode()) == case_input.get('effectivePromptSha256'), 'Prompt hash mismatch')
        require(case_input.get('sourceEffectivePromptSha256') == case.get('effectiveUserPromptFile', {}).get('contentSha256'), 'Original prompt identity mismatch')
        reference_relative = 'references/' + task['caseId'] + '.png'
        add_file(reference_relative, reference, reference_hash)
        note = entry.get('note', '已列入本轮 SDK 独立评测；生成和独立验证完成后开放试玩。' if sdk_only else '已列入本轮对照评测；生成和独立验证完成后开放试玩。')
        require(isinstance(note, str) and len(note) <= 10000 and isinstance(case.get('title'), str) and isinstance(case.get('selectionTags'), list), 'Invalid case presentation text')
        display_title = entry.get('displayTitle', case['title'] + (' · 原生 Three' if task['profile'] == 'three-raw' else ' · Three＋SDK'))
        require(isinstance(display_title, str) and 0 < len(display_title) <= 240, 'Invalid public display title')
        row = {'id': task_id, 'baseCaseId': task['caseId'], 'profile': task['profile'], 'title': display_title,
               'status': status, 'tags': case['selectionTags'] + [task['profile']], 'reference': reference_relative, 'referenceImageSha256': reference_hash, 'prompt': prompt, 'note': note}
        if status in ('ready', 'issues'):
            add_delivery(row, entry, expected, verified_root, evaluation_root, lock_hash, add_file, sdk_only)
        result['cases'].append(row)
    output = Path(output).absolute()
    require(not output.exists() and not output.is_symlink(), 'Use a new independent output directory; existing Native/Three sites are never overwritten')
    require(output.parent.is_dir() and output.parent.resolve() == output.parent, 'Output parent must exist without symlink ancestors')
    require(all(output != root and not output.is_relative_to(root) for root in (inputs_root, evaluation_root, verified_root)), 'Output must be separate from source inputs, run and verified artifacts')
    stage = Path(tempfile.mkdtemp(prefix='.three-evaluation-stage-', dir=output.parent))
    try:
        for relative, (source, expected_hash) in files.items():
            destination = stage.joinpath(*relative_name(relative).parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            require(file_digest(destination) == expected_hash, f'Artifact changed during copy: {relative}')
        ui = Path(__file__).resolve().parents[2] / 'apps/creator-evaluation-site'
        for name in ('index.html', 'app.mjs', 'styles.css'):
            regular(ui / name)
            shutil.copyfile(ui / name, stage / name)
        (stage / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        require(not output.exists(), 'Output appeared during staging')
        stage.rename(output)
    except BaseException:
        shutil.rmtree(stage)
        raise
    return {'output': str(output), 'mountPath': '/creator-evals/three/', 'caseCount': len(result['cases']),
            'playableCount': sum(case['status'] in ('ready', 'issues') for case in result['cases']), 'evidenceScope': result['evidenceScope'],
            'qualification': 'Curated local staging only; no upload, execution, or new acceptance claim.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ('selection', 'plan', 'inputs-root', 'evaluation-root', 'verified-root', 'publication', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--allow-local-fixture', action='store_true', help='Only for explicitly marked local-fixture plans; never a cloud result')
    args = parser.parse_args()
    print(json.dumps(prepare_site(args.selection, args.plan, args.inputs_root, args.evaluation_root, args.verified_root, args.publication, args.output, args.allow_local_fixture), ensure_ascii=False))


if __name__ == '__main__':
    main()
