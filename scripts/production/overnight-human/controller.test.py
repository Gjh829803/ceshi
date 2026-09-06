import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('campaign_controller', Path(__file__).with_name('controller.py'))
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)


class EndCycle(BaseException):
    pass


class CapacityTests(unittest.TestCase):
    def test_usage_failure_blocks_before_terminal_and_other_accounts_stay_eligible(self):
        row = {'requestedAccountSha256': 'a', 'jobId': 'gen_one', 'taskId': 'one', 'phase': 'submitted',
               'availabilityFacts': [{'code': 'MODEL_USAGE_LIMIT'}]}
        result = controller.update_availability([row], None, {'a': 'A', 'b': 'B'}, '2026-09-07T00:00:00+00:00')
        self.assertEqual(result['blockedAccounts']['a']['kind'], 'usage-limit')
        self.assertNotIn('b', result['blockedAccounts'])
        again = controller.update_availability([row], result, {'a': 'A'}, '2026-09-07T00:01:00+00:00')
        self.assertEqual(len(again['observations']), 1)

    def test_three_startup_failures_block_without_changing_quality(self):
        with tempfile.TemporaryDirectory() as temporary:
            rows = [{'requestedAccountSha256': 'a', 'jobId': f'gen_{i}', 'taskId': str(i), 'root': temporary,
                     'phase': 'failed', 'failure': {'message': 'Ray generation job generation failed with exit code 1'}} for i in range(3)]
            first = controller.update_availability(rows[:2], None, {'a': 'A'}, '2026-09-07T00:00:00+00:00')
            self.assertFalse(first['blockedAccounts'])
            third = controller.update_availability(rows, first, {'a': 'A'}, '2026-09-07T00:01:00+00:00')
            self.assertEqual(third['blockedAccounts']['a']['kind'], 'startup-failure')
            self.assertNotIn('quality', third['blockedAccounts']['a'])

    def test_finished_unreviewed_trials_do_not_authorize_more_trials(self):
        self.assertEqual(controller.free_account_slots('promising', 0, 2), 0)
        self.assertEqual(controller.free_account_slots('promising', 1, 1), 1)
        self.assertEqual(controller.free_account_slots('production-good', 3, 5), 1)
        self.assertEqual(controller.free_account_slots('verified-good', 7, 5), 1)
        self.assertEqual(controller.free_account_slots('quarantine', 0, 0), 0)

    def test_confirmed_execution_frees_capacity_but_delivery_still_drains(self):
        for cleanup, expected_active in [(True, 0), (False, 1)]:
            with self.subTest(cleanup=cleanup), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                wave = root / 'wave'; case = wave / 'fixture--three-sdk'; case.mkdir(parents=True)
                def write(path, value):
                    path.write_text(json.dumps(value))
                write(root / 'master.json', {'cases': [{'id': 'fixture'}]})
                write(root / 'campaign.json', {'id': 'fixture', 'masterManifest': str(root / 'master.json'),
                      'createdAt': '2020-01-01T00:00:00+00:00', 'deadline': '2020-01-02T00:00:00Z',
                      'latestNewGenerationAt': '2020-01-01T23:00:00Z', 'waves': [{'runId': 'fixture', 'runRoot': str(wave)}]})
                write(wave / 'evaluation-plan.json', {'selectedTaskIds': ['fixture--three-sdk']})
                write(case / 'state.json', {'phase': 'delivery-pending', 'jobId': 'gen_fixture', 'providerStatus': 'succeeded', 'rayCleanupConfirmed': cleanup})
                write(case / 'payload.json', {'options': {'codex_account_ids': ['fixture-account']}})
                with patch.object(controller, 'OUT', root), patch.object(controller, 'refresh_health'), patch.object(controller, 'start_supervisor'), patch.object(controller.time, 'sleep', side_effect=EndCycle):
                    with self.assertRaises(EndCycle):
                        controller.main()
                status = json.loads((root / 'status.json').read_text())
                self.assertEqual(status['active'], expected_active)
                self.assertEqual(status['pendingDeliveries'], 1)
                self.assertFalse((root / 'deadline-summary.json').exists())


if __name__ == '__main__':
    unittest.main()
