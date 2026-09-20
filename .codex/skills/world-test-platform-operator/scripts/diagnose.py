#!/usr/bin/env python3
"""Read-only task inspection, diagnostic collection and offline timing comparison."""
import argparse
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import sys
from urllib.parse import quote, unquote, urlsplit, urlunsplit

_spec = importlib.util.spec_from_file_location('wtp_client', Path(__file__).with_name('platform.py'))
api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(api)
TERMINAL = {'succeeded', 'failed', 'cancelled', 'canceled'}
NAMES = ('creator-events.jsonl', 'creator-stderr.log', 'creator-result.json')


def task_path(value, origin):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        if urlunsplit((parsed.scheme, parsed.netloc, '', '', '')) != origin:
            raise api.ClientError('任务链接与配置的平台 origin 不一致')
    elif not value.startswith('/'):
        raise api.ClientError('请输入平台任务 URL 或 /tasks/sourceId/worldId')
    parts = parsed.path.strip('/').split('/')
    if len(parts) != 3 or parts[0] != 'tasks':
        raise api.ClientError('任务路径必须为 /tasks/sourceId/worldId')
    ids = [unquote(p) for p in parts[1:]]
    if any(not p or p in ('.', '..') or any(c in p for c in '/\\') or any(ord(c) < 32 for c in p) for p in ids):
        raise api.ClientError('无效的任务标识')
    return '/api/worlds/' + '/'.join(quote(p, safe='') for p in ids)


def sanitize(value):
    """Metadata only. Raw logs remain restricted local evidence, not share-safe."""
    if isinstance(value, dict):
        return {k: ('[redacted]' if re.search(r'token|cookie|secret|password|authorization|credential|launchArgs|launchCommand|spawnCommand', k, re.I)
                    else sanitize(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r'wtp2?_[A-Za-z0-9_-]+', '[redacted]', value)
        return re.sub(r'https?://[^\s<>"\']+', lambda m: m[0].split('?')[0].split('#')[0], value)
    return value


def private_dir(path, fresh=False):
    path = Path(path).expanduser().absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise api.ClientError('诊断目录不能经过符号链接')
    path.mkdir(mode=0o700, parents=True, exist_ok=not fresh)
    os.chmod(path, 0o700)
    return path


def write_json(path, data):
    path = Path(path)
    private_dir(path.parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def stamp(value):
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt.timestamp() if dt.tzinfo else None
    except (AttributeError, TypeError, ValueError):
        return None


def seconds(a, b):
    a, b = stamp(a), stamp(b)
    return round(b-a, 3) if a is not None and b is not None and b >= a else None


def identity(detail, attempt=None):
    w = detail['world']
    prompt = w.get('prompt')
    result = {
        'sourceId': w.get('sourceId'), 'worldId': w.get('id'), 'sdkSha': w.get('branchSha'),
        'referenceSha256': (w.get('referenceImage') or {}).get('contentSha256'),
        'promptSha256': hashlib.sha256(prompt.encode()).hexdigest() if isinstance(prompt, str) else None,
        'codexBackend': w.get('codexBackend'), 'accountLabel': w.get('accountLabel'),
    }
    if attempt is not None and attempt != w.get('attempt'):
        for key in ('sdkSha', 'referenceSha256', 'promptSha256', 'codexBackend', 'accountLabel'):
            result[key] = None
    return result


def inspect_task(value, origin, token):
    detail = api.json_request(origin, token, task_path(value, origin) + '?includeArtifacts=0')
    if not isinstance(detail.get('world'), dict):
        raise api.ClientError('详情缺少 world；准备阶段请按返回的 runId 继续查询')
    return detail


def brief(detail, origin):
    w = detail['world']
    result = {**identity(detail), **{k: w.get(k) for k in ('status', 'stage', 'attempt', 'startedAt', 'finishedAt', 'failedStage', 'diagnosticCodes')}}
    result['deliveryVerification'] = (w.get('deliveryVerification') or {}).get('status')
    if w.get('sourceId') and w.get('id'):
        result['url'] = origin + '/tasks/' + '/'.join(quote(w[k], safe='') for k in ('sourceId', 'id'))
    return sanitize(result)


def collect(value, origin, token, output=None, attempt=None):
    detail = inspect_task(value, origin, token)
    w = detail['world']
    current = w.get('attempt')
    attempt = current if attempt is None else attempt
    if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1:
        raise api.ClientError('缺少有效 attempt，请显式指定 --attempt')
    base = task_path('/tasks/' + '/'.join(quote(w[k], safe='') for k in ('sourceId', 'id')), origin)
    artifacts = api.json_request(origin, token, base + '/artifacts')
    if output is None:
        suffix = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
        output = Path('.codex-tmp/world-test-platform') / quote(w['id'], safe='') / f'attempt-{attempt}' / suffix
    root = private_dir(output, fresh=True)
    write_json(root/'detail.json', sanitize(detail))
    write_json(root/'artifacts.json', sanitize(artifacts))
    manifest = {'schemaVersion': 1, 'origin': origin, **identity(detail, attempt), 'platformAttempt': attempt,
                'downloadedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'missing': [], 'warnings': []}
    entries = (artifacts.get('artifacts') or artifacts).get('files', [])
    for name in (*NAMES, 'agent.log'):
        matches = [f for f in entries if f.get('platformAttempt') == attempt and f.get('exists', True)
                   and PurePosixPath(f.get('relativePath', '')).name == name]
        if len(matches) > 1:
            manifest['missing'].append({'file': name, 'reason': 'ambiguous-attempt-artifacts', 'count': len(matches)})
            continue
        if matches:
            entry = matches[0]
            url = entry.get('url')
            relative = ('platform/' if name == 'agent.log' else 'sdk/') + name
        elif name == 'agent.log' and attempt == current and artifacts.get('attempt', current) == current:
            entry = {'source': 'platform-current-full-log', 'platformAttempt': current}
            url = base + '/log?full=1'
            relative = 'platform/agent.log'
        else:
            manifest['missing'].append({'file': name, 'reason': 'no-unambiguous-artifact-for-attempt'})
            continue
        try:
            # Accept same-origin absolute URLs from manifests; never supply a token to a CDN URL.
            parsed = urlsplit(url or '')
            if parsed.scheme or parsed.netloc:
                if urlunsplit((parsed.scheme, parsed.netloc, '', '', '')) != origin:
                    raise api.ClientError('文件入口必须来自平台；CDN 仅通过下载跳转访问')
                url = urlunsplit(('', '', parsed.path, parsed.query, ''))
            if not url:
                raise api.ClientError('文件条目缺少下载入口')
            private_dir((root/relative).parent)
            saved = api.download(origin, token, url, root/relative, {'world-test-cdn.loopit.com.cn'})
            expected = entry.get('sha256')
            verified = 'not-provided'
            if expected is not None:
                verified = 'matched' if expected == saved['localSha256'] else 'mismatch'
            size_ok = entry.get('bytes') is None or entry['bytes'] == saved['bytes']
            record = {'relativePath': relative, 'originalRelativePath': entry.get('relativePath'),
                      'source': entry.get('source'), 'platformAttempt': attempt,
                      'bytes': saved['bytes'], 'localSha256': saved['localSha256'],
                      'sourceHashVerification': verified, 'sourceSizeMatches': size_ok}
            manifest['files'].append(record)
            if verified == 'mismatch' or not size_ok:
                manifest['warnings'].append({'file': name, 'reason': 'source-integrity-mismatch'})
        except (api.ClientError, OSError, ValueError) as error:
            manifest['missing'].append({'file': name, 'reason': str(error) if isinstance(error, api.ClientError) else 'download-or-local-file-error'})
    # Current /log is not an immutable attempt archive. Detect retry races before attribution.
    try:
        after = inspect_task(value, origin, token)
        changed = identity(after)['worldId'] != w['id'] or after['world'].get('attempt') != current
    except (api.ClientError, OSError, ValueError):
        changed = True
        manifest['warnings'].append({'reason': 'could-not-recheck-current-attempt'})
    if changed:
        manifest['warnings'].append({'reason': 'current-attempt-changed-during-collection'})
        for f in manifest['files']:
            if f['source'] == 'platform-current-full-log':
                f['platformAttempt'] = None
    write_json(root/'download-manifest.json', sanitize(manifest))
    return {'directory': str(root), 'platformAttempt': attempt, 'files': len(manifest['files']),
            'missing': manifest['missing'], 'warnings': manifest['warnings']}


def recover_header(text):
    """Decode complete top-level fields only; never repair/invent truncated payloads."""
    decoder = json.JSONDecoder()
    if not text.lstrip().startswith('{'):
        return None
    pos = text.index('{') + 1
    header = {}
    try:
        while True:
            pos = len(text) - len(text[pos:].lstrip())
            key, pos = decoder.raw_decode(text, pos)
            if not isinstance(key, str) or key in ('progress', 'result'):
                break
            pos = len(text) - len(text[pos:].lstrip())
            if text[pos] != ':':
                break
            pos += 1
            pos = len(text) - len(text[pos:].lstrip())
            value, pos = decoder.raw_decode(text, pos)
            header[key] = value
            pos = len(text) - len(text[pos:].lstrip())
            if text[pos] != ',':
                break
            pos += 1
    except (ValueError, IndexError, TypeError):
        pass
    if all(k in header for k in ('id', 'type', 'status', 'createdAt', 'updatedAt')):
        header['_truncated'] = True
        return header
    return None


def union_seconds(intervals):
    end = None
    total = 0.0
    for a, b in sorted(intervals):
        total += max(0, b-max(a, end if end is not None else a))
        end = max(b, end if end is not None else b)
    return round(total, 3)


def parse_events(path):
    ops, items = {}, {}
    warnings = Counter()
    with Path(path).open() as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except ValueError:
                warnings['invalidJsonlLines'] += 1
                continue
            if not isinstance(event, dict) or event.get('type') != 'item.completed':
                continue
            item = event.get('item') or {}
            if not isinstance(item, dict):
                warnings['unsupportedEventItems'] += 1
                continue
            if item.get('type') != 'mcp_tool_call':
                continue
            items[item.get('id', f'line-{line_no}')] = item.get('tool')
            result = item.get('result')
            content = result.get('content') if isinstance(result, dict) else None
            queue = deque(content if isinstance(content, list) else [])
            while queue:
                block = queue.popleft()
                if not isinstance(block, dict) or block.get('type') != 'text' or not isinstance(block.get('text'), str):
                    continue
                try:
                    obj = json.loads(block.get('text', ''))
                except ValueError:
                    obj = recover_header(block.get('text', ''))
                    if obj is None:
                        warnings['unparsedToolTextBlocks'] += 1
                        continue
                    warnings['recoveredTruncatedOperationHeaders'] += 1
                if not isinstance(obj, dict):
                    continue
                if isinstance(obj.get('content'), list):
                    queue.extend(obj['content'])
                if not all(k in obj for k in ('id', 'type', 'status', 'createdAt', 'updatedAt')):
                    continue
                if not isinstance(obj['id'], str) or not isinstance(obj['type'], str) or not isinstance(obj['status'], str) or stamp(obj['updatedAt']) is None:
                    warnings['invalidOperationHeaders'] += 1
                    continue
                previous = ops.get(obj['id'])
                if previous is None or stamp(obj['updatedAt']) > stamp(previous['updatedAt']) or (obj['updatedAt'] == previous['updatedAt'] and previous.get('_truncated') and not obj.get('_truncated')):
                    ops[obj['id']] = {**obj, 'eventLine': line_no}
    rows, totals, intervals = [], defaultdict(float), []
    for op in ops.values():
        duration = seconds(op['createdAt'], op['updatedAt']) if op['status'] in TERMINAL else None
        row = {'id': op['id'], 'type': op['type'], 'status': op['status'],
               'start': op['createdAt'], 'end': op['updatedAt'], 'seconds': duration,
               'eventLine': op['eventLine'], 'truncatedLogRecord': bool(op.get('_truncated'))}
        result = op.get('result') if isinstance(op.get('result'), dict) else {}
        row['resultStatus'] = result.get('status')
        row['failure'] = sanitize(result.get('failure') or op.get('error'))
        if duration is not None:
            totals[op['type']] += duration
            intervals.append((stamp(op['createdAt']), stamp(op['updatedAt'])))
        else:
            warnings['operationsWithoutTerminalDuration'] += 1
        rows.append(row)
    return {'operationSeconds': {k: round(v, 3) for k, v in totals.items()},
            'observedOperationWallSeconds': union_seconds(intervals),
            'tools': dict(Counter(items.values())), 'operations': sorted(rows, key=lambda r: r['start']),
            'warnings': dict(warnings)}


def attempt_timing(detail, attempt):
    w = detail['world']
    candidates = [a for a in detail.get('attempts', []) if a.get('attempt') == attempt]
    events = candidates[0].get('events', []) if len(candidates) == 1 else []
    def first(stage):
        return next((e.get('at') for e in events if e.get('stage') == stage and stamp(e.get('at')) is not None), None)
    current = w.get('attempt') == attempt
    start = w.get('startedAt') if current else first('preparing')
    end = w.get('finishedAt') if current else None
    submit, verify = first('submit'), first('verify')
    return {'totalSeconds': seconds(start, end), 'preparationSeconds': seconds(start, submit),
            'agentExecutionSeconds': seconds(submit, verify), 'agentStart': submit, 'agentEnd': verify,
            'boundarySource': 'platform-attempt-stage-events',
            'note': '平台阶段估算；Agent 区间包含工具、编写、推理及等待，不是纯模型时间。历史尝试缺结束边界时总时长未知。'}


def analyze(root):
    root = Path(root)
    detail = json.loads((root/'detail.json').read_text())
    manifest_path = root/'download-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    attempt = manifest.get('platformAttempt', detail['world'].get('attempt'))
    candidates = []
    for f in manifest.get('files', []):
        if PurePosixPath(f.get('relativePath', '')).name != 'creator-events.jsonl' or f.get('platformAttempt') != attempt:
            continue
        if f.get('sourceHashVerification') == 'mismatch' or f.get('sourceSizeMatches') is False:
            raise api.ClientError('事件日志与来源校验不一致，不能用于耗时分析')
        relative = PurePosixPath(f['relativePath'])
        if relative.is_absolute() or '..' in relative.parts:
            raise api.ClientError('清单包含越界路径')
        p = root/str(relative)
        if not p.exists():
            p = root/f'attempt-{attempt}'/str(relative)
        if not p.resolve().is_relative_to(root.resolve()):
            raise api.ClientError('清单包含符号链接逃逸')
        if f.get('localSha256'):
            digest = hashlib.sha256()
            with p.open('rb') as stream:
                for block in iter(lambda: stream.read(1024*1024), b''):
                    digest.update(block)
            if digest.hexdigest() != f['localSha256']:
                raise api.ClientError('事件日志已改变，与下载清单哈希不一致')
        candidates.append(p)
    # Compatibility with previously collected local diagnostics, never mix attempts.
    if not candidates:
        p = root/f'attempt-{attempt}'/'sdk/creator-events.jsonl'
        if p.is_file():
            candidates = [p]
    if len(candidates) != 1:
        raise api.ClientError('该 attempt 的事件日志缺失或不唯一；先检查下载清单')
    parsed = parse_events(candidates[0])
    timing = attempt_timing(detail, attempt)
    a, b = stamp(timing['agentStart']), stamp(timing['agentEnd'])
    inside = []
    if a is not None and b is not None and b >= a:
        for row in parsed['operations']:
            if row['seconds'] is not None:
                x, y = max(a, stamp(row['start'])), min(b, stamp(row['end']))
                if y >= x:
                    inside.append((x, y))
        timing['observedOperationsWithinAgentSeconds'] = union_seconds(inside)
        timing['unattributedAgentSeconds'] = round(b-a-union_seconds(inside), 3)
    else:
        timing['observedOperationsWithinAgentSeconds'] = None
        timing['unattributedAgentSeconds'] = None
    task_identity = identity(detail, attempt)
    return {'schemaVersion': 1, 'identity': task_identity, 'platformAttempt': attempt,
            'timing': timing, **parsed,
            'evidence': {'events': str(candidates[0].resolve()), 'detail': str((root/'detail.json').resolve())},
            'collectionWarnings': manifest.get('warnings', []), 'collectionMissing': manifest.get('missing', [])}


def compare(current, baseline):
    def load(p):
        p = Path(p)
        return analyze(p) if p.is_dir() else json.loads(p.read_text())
    current, baseline = load(current), load(baseline)
    fields = ('referenceSha256', 'promptSha256', 'codexBackend', 'accountLabel', 'sdkSha')
    match = {k: ('unknown' if current['identity'].get(k) is None or baseline['identity'].get(k) is None
                 else 'same' if current['identity'][k] == baseline['identity'][k] else 'different') for k in fields}
    delta = {}
    for k in ('totalSeconds', 'preparationSeconds', 'agentExecutionSeconds', 'unattributedAgentSeconds'):
        c, b = current['timing'].get(k), baseline['timing'].get(k)
        delta[k] = round(c-b, 3) if c is not None and b is not None else None
    operation_delta = {}
    for k in current['operationSeconds'].keys() | baseline['operationSeconds'].keys():
        c, b = current['operationSeconds'].get(k), baseline['operationSeconds'].get(k)
        operation_delta[k] = round(c-b, 3) if c is not None and b is not None else None
    return {'current': current, 'baseline': baseline, 'identityComparison': match,
            'deltaSeconds': delta, 'operationDeltaSeconds': operation_delta,
            'evidenceWarnings': {name: {k: summary.get(k, {}) for k in ('warnings', 'collectionWarnings', 'collectionMissing')}
                                 for name, summary in (('current', current), ('baseline', baseline))},
            'note': '历史观测对比，不是受控 A/B；缺失指标保持未知，耗时变化不能单独归因于 SDK 修改。'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin')
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('inspect', 'collect'):
        p = sub.add_parser(command)
        p.add_argument('task', help='完整平台任务 URL 或 /tasks/sourceId/worldId')
        p.add_argument('--output', help='inspect: 新 JSON 文件；collect: 新诊断目录')
        if command == 'collect':
            p.add_argument('--attempt', type=int)
    p = sub.add_parser('analyze')
    p.add_argument('directory')
    p.add_argument('--output', help='新的摘要 JSON 文件')
    p = sub.add_parser('compare')
    p.add_argument('current'); p.add_argument('baseline'); p.add_argument('--output')
    args = parser.parse_args(argv)
    try:
        if args.command in ('inspect', 'collect'):
            origin = api.origin_value(args.origin or os.environ.get('WORLD_TEST_PLATFORM_ORIGIN', api.DEFAULT_ORIGIN))
            credential = api.load_credential(origin)
            api.probe(origin, credential)
            if args.command == 'collect':
                result = collect(args.task, origin, credential['token'], args.output, args.attempt)
            else:
                detail = inspect_task(args.task, origin, credential['token'])
                result = brief(detail, origin)
                if args.output:
                    write_json(args.output, sanitize(detail))
                    result['detailFile'] = str(Path(args.output).resolve())
        else:
            result = analyze(args.directory) if args.command == 'analyze' else compare(args.current, args.baseline)
            if args.output:
                write_json(args.output, result)
                result = {'output': str(Path(args.output).resolve()), **{k: result[k] for k in ('timing', 'operationSeconds', 'warnings', 'identityComparison', 'deltaSeconds', 'operationDeltaSeconds', 'evidenceWarnings') if k in result}}
            elif args.command == 'analyze':
                result = {k: v for k, v in result.items() if k not in ('operations', 'tools')}
            else:
                result = {k: v for k, v in result.items() if k not in ('current', 'baseline')}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.command == 'collect' and (result['missing'] or result['warnings']) else 0
    except (api.ClientError, OSError, ValueError, KeyError, TypeError) as error:
        print(str(error) if isinstance(error, api.ClientError) else '诊断失败：检查文件、响应结构和目录权限；未输出凭据。', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
