"""Host availability circuit breaker; it never assigns visual-quality verdicts."""
from pathlib import Path
from datetime import datetime, timedelta
import json

def availability_issue(row):
    facts = {fact.get('code') for fact in row.get('availabilityFacts', [])}
    if 'MODEL_USAGE_LIMIT' in facts:
        return 'usage-limit'
    if 'MODEL_CAPACITY' in facts:
        return 'model-capacity'
    if row.get('phase') != 'failed':
        return None
    events = Path(row['root']) / 'creator-events.jsonl'
    if events.is_file():
        with events.open('rb') as stream:
            stream.seek(max(0, events.stat().st_size - 65536))
            tail = stream.read().decode('utf-8', errors='replace')
        for line in tail.splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get('type') not in ['error', 'turn.failed']:
                continue
            message = str(event.get('message') or (event.get('error') or {}).get('message') or '').lower()
            if 'hit your usage limit' in message:
                return 'usage-limit'
            if 'at capacity' in message:
                return 'model-capacity'
    message = (row.get('failure') or {}).get('message', '')
    if not row.get('worldBuildHash') and message == 'Ray generation job generation failed with exit code 1':
        return 'startup-failure'
    return None

def update_availability(rows, previous, labels, observed_at):
    result = json.loads(json.dumps(previous or {'schemaVersion': 1, 'observations': {}, 'blockedAccounts': {}}))
    observations, blocked = result['observations'], result['blockedAccounts']
    cutoff = (datetime.fromisoformat(observed_at) - timedelta(minutes=15)).isoformat()
    rank = {'startup-failure': 1, 'model-capacity': 2, 'usage-limit': 3}
    for row in rows:
        identity, job = row.get('requestedAccountSha256'), row.get('jobId')
        if identity not in labels or not job:
            continue
        kind = availability_issue(row)
        if not kind or job + ':' + kind in observations:
            continue
        record = {'kind': kind, 'accountIdentitySha256': identity, 'label': labels[identity],
                  'jobId': job, 'taskId': row['taskId'], 'observedAt': observed_at}
        observations[job + ':' + kind] = record
        burst = sum(item['accountIdentitySha256'] == identity and item['kind'] == 'startup-failure' and item['observedAt'] >= cutoff for item in observations.values())
        if kind == 'startup-failure' and burst < 3:
            continue
        if rank[kind] >= rank.get(blocked.get(identity, {}).get('kind'), 0):
            blocked[identity] = record
    result['updatedAt'] = observed_at
    return result
