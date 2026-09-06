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
    def test_only_verified_same_attempt_checkpoints_are_counted_and_retry_is_held(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();world='1'*64;archive='2'*64
            state={'jobId':'gen_fixture','taskId':'fixture--three-sdk','caseId':'fixture','profile':'three-sdk','runtimeHash':'3'*64,'accountRouting':{'verified':True}}
            pointer={'kind':'three-creator-checkpoint','status':'runnable','jobId':state['jobId'],'taskId':state['taskId'],'caseId':state['caseId'],'profile':state['profile'],'creatorRuntimeLockHash':state['runtimeHash'],'worldBuildHash':world,'archiveSha256':archive,'sourceHash':'4'*64,'verifiedDirectory':f'checkpoint-verified/{world}-{archive[:16]}'}
            directory=root/pointer['verifiedDirectory'];directory.mkdir(parents=True)
            controller.write(directory/'checkpoint-receipt.json',pointer)
            controller.write(directory/'checkpoint-verification.json',{'kind':'three-creator-checkpoint-verification','status':'verified','worldBuildHash':world,'archiveSha256':archive})
            controller.write(root/'checkpoint-latest.json',pointer)
            self.assertEqual(controller.runnable_checkpoint(root,state)['worldBuildHash'],world)
            self.assertIsNone(controller.runnable_checkpoint(root,{**state,'jobId':'gen_other'}))
            self.assertIsNone(controller.runnable_checkpoint(root,{**state,'accountRouting':{'verified':False}}))
            self.assertFalse(controller.can_retry_attempts([{'root':str(root),'phase':'failed','providerStatus':'completed'}]))
            controller.write(directory/'checkpoint-verification.json',{'kind':'three-creator-checkpoint-verification','status':'verified','worldBuildHash':world,'archiveSha256':'5'*64})
            self.assertIsNone(controller.runnable_checkpoint(root,state))

    def test_checkpoint_and_final_delivery_are_not_double_counted(self):
        for final in [False,True]:
            with self.subTest(final=final),tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary)
                controller.write(root/'master.json',{'cases':[{'id':'fixture'}]})
                controller.write(root/'campaign.json',{'id':'fixture','masterManifest':str(root/'master.json'),'createdAt':'2020-01-01T00:00:00+00:00','deadline':'2020-01-02T00:00:00Z','latestNewGenerationAt':'2020-01-01T23:00:00Z','waves':[]})
                row={'root':str(root),'caseId':'fixture','taskId':'fixture--three-sdk','jobId':'gen_checkpoint','phase':'failed','executionComplete':True,'checkpointArtifact':True,'cliActivityObserved':False}
                rows=[row]+([{**row,'jobId':'gen_final','phase':'delivered','checkpointArtifact':False}] if final else [])
                with patch.object(controller,'OUT',root),patch.object(controller,'rows_of',return_value=rows),patch.object(controller,'refresh_health'),patch.object(controller,'start_supervisor'):
                    controller.main()
                status=json.loads((root/'status.json').read_text())
                self.assertEqual(status['availableArtifacts'],1)
                self.assertEqual(status['runnableCheckpoints'],0 if final else 1)
                self.assertEqual(status['delivered'],1 if final else 0)

    def test_refills_one_free_slot_without_exceeding_account_or_global_capacity(self):
        for active_count, expected_submissions in [(7, 1), (8, 0)]:
            with self.subTest(active_count=active_count), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                master = {'cases': [{'id': 'next', 'prompt': 'unchanged scene request'}]}
                controller.write(root / 'master.json', master)
                controller.write(root / 'policy.json', {'denied': []})
                controller.write(root / 'account-inventory-private.json', [{
                    'label': 'A', 'identitySha256': 'account-a', 'codexAccountId': 'fixture-account',
                    'eligible': True, 'healthStatus': 'active', 'quotaLeftPercent': 50}])
                controller.write(root / 'account-decisions.json', {'accounts': {
                    'A': {'identitySha256': 'account-a', 'status': 'verified-good'}}})
                controller.write(root / 'campaign.json', {
                    'id': 'fixture', 'masterManifest': str(root / 'master.json'),
                    'createdAt': '2020-01-01T00:00:00+00:00',
                    'deadline': '2099-01-02T00:00:00Z', 'latestNewGenerationAt': '2099-01-01T23:00:00Z',
                    'maxConcurrency': 8, 'accountPolicyPath': str(root / 'policy.json'),
                    'inventoryPath': str(root / 'account-inventory-private.json'),
                    'runtimeLockPath': str(root / 'frozen-lock.json'), 'waves': []})
                rows = [{'caseId': f'active-{i}', 'taskId': f'active-{i}--three-sdk',
                         'root': str(root / f'active-{i}'), 'phase': 'submitted',
                         'jobId': f'gen_{i}', 'requestedAccountSha256': 'account-a',
                         'cliActivityObserved': True} for i in range(active_count)]
                with patch.object(controller, 'OUT', root), patch.object(controller, 'REPO', root), \
                        patch.object(controller, 'rows_of', return_value=rows), \
                        patch.object(controller, 'refresh_health'), \
                        patch.object(controller, 'start_supervisor') as start, \
                        patch.object(controller.subprocess, 'run') as prepare, \
                        patch.object(controller.time, 'sleep', side_effect=EndCycle):
                    with self.assertRaises(EndCycle):
                        controller.main()
                self.assertEqual(prepare.call_count, expected_submissions)
                self.assertEqual(start.call_count, expected_submissions)
                if expected_submissions:
                    args = prepare.call_args.args[0]
                    self.assertEqual(args[args.index('--case-limit') + 1], '1')
                    self.assertEqual(args[args.index('--account-concurrency') + 1], '20')
                    manifest = json.loads(Path(args[args.index('--manifest') + 1]).read_text())
                    self.assertEqual(manifest['cases'], [{**master['cases'][0], 'codexAccountIds': ['fixture-account']}])
                    self.assertEqual(len(json.loads((root / 'campaign.json').read_text())['waves']), 1)

    def test_pre_model_rejections_do_not_spend_two_world_generation_attempts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'creator-events.jsonl').write_text(json.dumps({'type': 'error', 'message': 'Selected model is at capacity.'}) + '\n')
            row = {'root': str(root), 'phase': 'failed', 'providerStatus': 'completed'}
            self.assertFalse(controller.used_model_output(row))
            self.assertTrue(controller.can_retry_attempts([row, row]))
            self.assertFalse(controller.can_retry_attempts([row] * 4))
            (root / 'creator-events.jsonl').write_text(json.dumps({'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'world work'}}) + '\n')
            self.assertFalse(controller.can_retry_attempts([row, row]))
            (root / 'creator-result.json').write_text('{}')
            self.assertFalse(controller.can_retry_attempts([row]))

    def test_only_confirmed_host_queue_cancel_without_model_work_can_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            row = {'root': temporary, 'phase': 'failed', 'providerStatus': 'cancelled', 'executionComplete': True,
                   'failure': {'message': 'THREE_EXECUTION_GUARD: queue-deadline'}}
            self.assertTrue(controller.can_retry_attempts([row]))
            self.assertFalse(controller.can_retry_attempts([{**row, 'executionComplete': False}]))
            self.assertFalse(controller.can_retry_attempts([{**row, 'failure': {'message': 'User cancelled'}}]))

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
        self.assertEqual(controller.free_account_slots('production-good', 7, 5, 8), 1)
        self.assertEqual(controller.free_account_slots('production-good', 3, 5, 64), 1)
        self.assertEqual(controller.free_account_slots('promising', 0, 2, 8), 0)
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
