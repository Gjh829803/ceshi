"""Offline regressions; no real credentials, network or generation tasks."""
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('diagnose', Path(__file__).parents[1]/'scripts/diagnose.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
ORIGIN = 'https://example.test'


def detail(attempt=1):
    return {'world': {'id': 'world-1', 'sourceId': 'branch-1', 'attempt': attempt,
                     'branchSha': 'a'*40, 'prompt': 'a world', 'status': 'ready',
                     'startedAt': '2026-09-18T00:00:00Z', 'finishedAt': '2026-09-18T00:01:00Z'},
            'attempts': [{'attempt': 1, 'events': [
                {'stage': 'submit', 'at': '2026-09-18T00:00:10Z'},
                {'stage': 'verify', 'at': '2026-09-18T00:00:50Z'}]}]}


def operation(id='op1', start=10, end=20, status='succeeded'):
    return {'id': id, 'type': 'world.playtest', 'status': status,
            'createdAt': f'2026-09-18T00:00:{start:02d}Z', 'updatedAt': f'2026-09-18T00:00:{end:02d}Z'}


def event(obj, id='item1'):
    text = obj if isinstance(obj, str) else json.dumps(obj)
    return {'type': 'item.completed', 'item': {'type': 'mcp_tool_call', 'id': id, 'tool': 'operations_get',
            'result': {'content': [{'type': 'text', 'text': text}]}}}


class DiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()

    def tearDown(self):
        self.temp.cleanup()

    def parse(self, events):
        p = self.root/'events.jsonl'
        p.write_text('\n'.join(json.dumps(e) if not isinstance(e, str) else e for e in events))
        return d.parse_events(p)

    def test_task_link_origin_and_encoding(self):
        self.assertEqual(d.task_path(ORIGIN+'/tasks/br%20one/world-1?tab=logs', ORIGIN), '/api/worlds/br%20one/world-1')
        for value in ['https://evil.test/tasks/a/b', '/tasks/a/%2e%2e', '/tasks/a/b%2fc', '/tasks/a/b%5cc']:
            with self.assertRaises(d.api.ClientError):
                d.task_path(value, ORIGIN)

    def test_deduplicate_polls_and_union_overlaps(self):
        out = self.parse([event(operation(end=15, status='running')),
                          event(operation(), 'poll2'), event(operation(), 'poll2'),
                          event(operation('op2', 15, 25), 'poll3')])
        self.assertEqual(len(out['operations']), 2)
        self.assertEqual(out['operationSeconds']['world.playtest'], 20)
        self.assertEqual(out['observedOperationWallSeconds'], 15)
        self.assertEqual(out['tools']['operations_get'], 3)

    def test_nested_truncated_record_keeps_only_verified_header(self):
        truncated = json.dumps(operation())[:-1] + ', "result": {"large": "elided...'
        wrapper = {'content': [{'type': 'text', 'text': truncated}]}
        out = self.parse([event(wrapper), '{broken json'])
        self.assertEqual(out['operationSeconds']['world.playtest'], 10)
        self.assertTrue(out['operations'][0]['truncatedLogRecord'])
        self.assertIsNone(out['operations'][0]['resultStatus'])
        self.assertEqual(out['warnings']['invalidJsonlLines'], 1)

    def test_missing_timestamps_and_running_operations_stay_unknown(self):
        bad = operation('bad'); bad['createdAt'] = 'unknown'
        out = self.parse([event(operation(status='running')), event(bad, 'bad')])
        self.assertEqual(out['operationSeconds'], {})
        self.assertTrue(all(r['seconds'] is None for r in out['operations']))

    def test_complete_record_replaces_truncated_at_same_timestamp(self):
        truncated = json.dumps(operation())[:-1] + ',"result":'
        out = self.parse([event(truncated), event({**operation(), 'result': {'status': 'passed'}}, 'poll2')])
        self.assertFalse(out['operations'][0]['truncatedLogRecord'])
        self.assertEqual(out['operations'][0]['resultStatus'], 'passed')

    def test_history_does_not_inherit_current_identity_or_finish(self):
        meta = detail(2)
        self.assertIsNone(d.identity(meta, 1)['sdkSha'])
        self.assertIsNone(d.attempt_timing(meta, 1)['totalSeconds'])

    def test_private_output_no_overwrite_or_symlink(self):
        p = self.root/'result.json'
        d.write_json(p, {'ok': True})
        self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
        with self.assertRaises(FileExistsError):
            d.write_json(p, {})
        (self.root/'alias').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(d.api.ClientError):
            d.write_json(self.root/'alias/escape.json', {})

    def test_metadata_redaction(self):
        result = d.sanitize({'processToken': 'private', 'nested': {'url': 'https://cdn.test/a?Signature=secret'},
                             'message': 'wtp2_not-a-real-token', 'launchCommand': 'secret arg'})
        self.assertNotIn('private', json.dumps(result))
        self.assertNotIn('secret', json.dumps(result))
        self.assertEqual(result['nested']['url'], 'https://cdn.test/a')

    def collect(self, meta, entries, attempt=None, after=None, download=None):
        calls = []
        def get(origin, token, path):
            calls.append(path)
            if path.endswith('/artifacts'):
                return {'attempt': meta['world']['attempt'], 'artifacts': {'files': entries}}
            return after if len(calls) > 2 and after else meta
        def save(origin, token, url, path, cdn):
            path.write_text('evidence')
            return {'bytes': 8, 'localSha256': 'a'*64}
        with patch.object(d.api, 'json_request', side_effect=get), patch.object(d.api, 'download', side_effect=download or save) as dl:
            out = d.collect('/tasks/branch-1/world-1', ORIGIN, 'dummy', self.root/'collection', attempt)
        manifest = json.loads((self.root/'collection/download-manifest.json').read_text())
        return out, manifest, dl

    def test_historical_attempt_never_uses_current_full_log(self):
        out, manifest, dl = self.collect(detail(2), [], attempt=1)
        dl.assert_not_called()
        self.assertEqual(len(out['missing']), 4)
        self.assertIsNone(manifest['sdkSha'])

    def test_ambiguous_or_unknown_artifacts_are_not_guessed(self):
        entry = {'relativePath': 'attempt-1/creator-events.jsonl', 'platformAttempt': 1, 'url': '/download'}
        out, _, dl = self.collect(detail(), [entry, entry, {**entry, 'platformAttempt': None}])
        self.assertEqual(out['missing'][0]['reason'], 'ambiguous-attempt-artifacts')
        self.assertEqual(dl.call_count, 1)  # Only current full platform log.

    def test_attempt_race_removes_log_attribution(self):
        out, manifest, _ = self.collect(detail(), [], after=detail(2))
        self.assertTrue(out['warnings'])
        self.assertIsNone(manifest['files'][0]['platformAttempt'])

    def test_download_failure_preserves_manifest(self):
        def fail(*args):
            raise d.api.ClientError('download failed')
        out, manifest, _ = self.collect(detail(), [], download=fail)
        self.assertEqual(len(out['missing']), 4)
        self.assertEqual(manifest['files'], [])

    def test_analyze_residual_is_interval_union_not_poll_sum(self):
        d.write_json(self.root/'detail.json', detail())
        p = self.root/'sdk/creator-events.jsonl'
        p.parent.mkdir()
        p.write_text('\n'.join(json.dumps(event(o, str(i))) for i, o in enumerate([operation(), operation('op2', 15, 25)])))
        d.write_json(self.root/'download-manifest.json', {'platformAttempt': 1, 'files': [
            {'relativePath': 'sdk/creator-events.jsonl', 'platformAttempt': 1}]})
        out = d.analyze(self.root)
        self.assertEqual(out['timing']['unattributedAgentSeconds'], 25)
        self.assertEqual(out['timing']['totalSeconds'], 60)

    def test_tampered_event_log_is_rejected(self):
        d.write_json(self.root/'detail.json', detail())
        (self.root/'events.jsonl').write_text('changed')
        d.write_json(self.root/'download-manifest.json', {'platformAttempt': 1, 'files': [
            {'relativePath': 'events/../creator-events.jsonl', 'platformAttempt': 1}]})
        with self.assertRaises(d.api.ClientError):
            d.analyze(self.root)
        (self.root/'download-manifest.json').unlink()
        (self.root/'creator-events.jsonl').write_text('changed')
        d.write_json(self.root/'download-manifest.json', {'platformAttempt': 1, 'files': [
            {'relativePath': 'creator-events.jsonl', 'platformAttempt': 1, 'localSha256': 'a'*64}]})
        with self.assertRaises(d.api.ClientError):
            d.analyze(self.root)

    def test_collect_size_mismatch_is_reported(self):
        entry = {'relativePath': 'creator-events.jsonl', 'platformAttempt': 1,
                 'url': '/download', 'bytes': 100, 'sha256': 'b'*64}
        out, manifest, _ = self.collect(detail(), [entry])
        self.assertEqual(out['warnings'][0]['reason'], 'source-integrity-mismatch')
        self.assertFalse(manifest['files'][0]['sourceSizeMatches'])

    def test_compare_missing_identity_is_unknown(self):
        summary = {'identity': {}, 'timing': {'totalSeconds': 10}, 'operationSeconds': {}}
        p = self.root/'summary.json'; p.write_text(json.dumps(summary))
        out = d.compare(p, p)
        self.assertEqual(out['identityComparison']['promptSha256'], 'unknown')
        self.assertEqual(out['deltaSeconds']['totalSeconds'], 0)
        self.assertIsNone(out['deltaSeconds']['agentExecutionSeconds'])


if __name__ == '__main__':
    unittest.main()
