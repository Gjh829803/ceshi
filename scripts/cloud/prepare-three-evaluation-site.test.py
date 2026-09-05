"""Synthetic LOCAL FIXTURE coverage only: no model, browser execution or publication."""
import hashlib
import importlib.util
import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('three_site', Path(__file__).with_name('prepare-three-evaluation-site.py'))
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))


def png(width=2, height=2):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress((b'\0' + b'\x80\x80\x80' * width) * height)) + chunk(b'IEND', b'')


class Fixture:
    def __init__(self, root, suite='sdk-only', count=1, version='0.2.0-experimental'):
        self.root = root
        self.run_id = 'local-three-site-fixture'
        self.lock = sha(b'LOCAL FIXTURE lock')
        self.inputs, self.run, self.verified = (root / name for name in ('inputs', 'run', 'verified'))
        for directory in (self.inputs, self.run, self.verified):
            directory.mkdir()
        self.selection = {'schemaVersion': 1, 'cases': []}
        self.plan = {'schemaVersion': 1, 'kind': 'three-creator-sdk-plan' if suite == 'sdk-only' else 'three-creator-paired-plan',
                     'suite': suite, 'engine': 'three@0.185.1', 'runId': self.run_id, 'runtimeHash': self.lock,
                     'evidenceScope': 'local-fixture', 'cases': [], 'selectedTaskIds': []}
        self.publication = {'schemaVersion': 1, 'kind': 'three-creator-host-publication', 'runId': self.run_id, 'cases': {}}
        for index in range(count):
            case_id = f'local-case-{index + 1:02}'
            reference = self.inputs / case_id / 'reference.png'
            reference.parent.mkdir(); reference.write_bytes(png())
            prompt = 'LOCAL FIXTURE. This is not model output or evidence of actual gameplay.'
            reference_hash = sha(reference.read_bytes())
            self.selection['cases'].append({'id': case_id, 'title': f'LOCAL FIXTURE {index + 1}', 'selectionTags': ['local-fixture'],
                                           'referenceImage': {'contentSha256': reference_hash, 'widthPixels': 2, 'heightPixels': 2},
                                           'effectiveUserPromptFile': {'contentSha256': sha(prompt.encode())}})
            for profile in (('three-sdk',) if suite == 'sdk-only' else ('three-raw', 'three-sdk')):
                task_id = case_id + '--' + profile
                case_input = {'schemaVersion': 1, 'kind': 'three-creator-case-input', 'caseId': case_id, 'taskId': task_id,
                              'profile': profile, 'engine': 'three@0.185.1', 'runtimeHash': self.lock, 'referenceImageSha256': reference_hash,
                              'effectiveUserPrompt': prompt, 'effectivePromptSha256': sha(prompt.encode()), 'sourceEffectivePromptSha256': sha(prompt.encode())}
                write_json(self.run / task_id / 'case-input.json', case_input)
                self.plan['cases'].append({'caseId': case_id, 'taskId': task_id, 'profile': profile, 'caseHash': sha(encoded(case_input))})
                self.plan['selectedTaskIds'].append(task_id)
                self.make_delivery(case_id, task_id, profile, reference_hash, version)
        self.write_inputs()

    def write_inputs(self):
        for name in ('selection', 'plan', 'publication'):
            write_json(self.root / f'{name}.json', getattr(self, name))

    def make_delivery(self, case_id, task_id, profile, reference_hash, version):
        directory = self.verified / task_id
        payload = directory / 'payload'; payload.mkdir(parents=True)
        for name, data in {'episode.json': encoded({'localFixture': True}),
                           'source/main.ts': b'// LOCAL FIXTURE source, never publish this',
                           'playable/index.html': b'<!doctype html><title>LOCAL FIXTURE</title><p>No actual model output.</p>',
                           'playable/project.json': b'{"privateFixture":true}',
                           'playtest/playtest.mp4': b'LOCAL FIXTURE video placeholder; never a playable-video claim',
                           'captures/opening-aaaaaaaaaa.png': png(),
                           'captures/entity-triview-bbbbbbbbbb.png': png(1536, 640)}.items():
            file = payload / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(data)
        identity = {'profile': profile, 'engine': 'three@0.185.1', 'sourceHash': sha(('LOCAL FIXTURE ' + task_id).encode()),
                    'runtimeHash': sha(b'LOCAL FIXTURE runtime'), 'creatorRuntimeLockHash': self.lock,
                    'episodeHash': sha((payload / 'episode.json').read_bytes())}
        identity['worldBuildHash'] = sha(encoded({key: identity[key] for key in ('sourceHash', 'runtimeHash', 'profile')}))
        self_play = {'kind': 'three-creator-browser-playtest', 'schemaVersion': 1, **identity, 'status': 'passed',
                     'isCompleteEpisode': True, 'capturedInput': True, 'actualWallSeconds': 200,
                     'pageErrors': [], 'runtimeErrors': [], 'blockedNetworkRequests': [],
                     'targetResults': [{'id': 'local-target', 'reached': True}], 'travelledMeters': 12,
                     'videoPath': '/LOCAL-FIXTURE/playtest.mp4', 'videoMetadata': {'durationSeconds': 180, 'frameCount': 540}}
        delivery = {'kind': 'three-creator-delivery', 'schemaVersion': 1, **identity, 'status': 'ready-for-independent-review',
                    'technicalStatus': 'passed', 'actualWallSeconds': 200, 'targetResults': self_play['targetResults']}
        if version is not None:
            delivery.update(toolVersion=version, sdkVersion=version if profile == 'three-sdk' else None,
                            browserObservationContract='WorldObservation-v2' if profile == 'three-sdk' else 'WorldObservation-v1')
            self_play.update(activePlaySeconds=180, inputWallSeconds=185)
            delivery.update(activePlaySeconds=180, inputWallSeconds=185)
        write_json(payload / 'playtest/playtest.json', self_play)
        images = []
        for view, name in [('opening', 'opening-aaaaaaaaaa.png'), ('entity-triview', 'entity-triview-bbbbbbbbbb.png')]:
            data = (payload / 'captures' / name).read_bytes()
            capture = {**{key: identity[key] for key in ('profile', 'sourceHash', 'worldBuildHash')}, 'view': view,
                       'image': {'path': '/LOCAL-FIXTURE/' + name, 'sha256': sha(data), 'byteLength': len(data)}}
            if view == 'entity-triview':
                capture.update(panelOrder=['front', 'right', 'back'], entityIds=['player'])
            images.append(capture)
        write_json(payload / 'captures/captures.json', {**identity, 'images': images, 'pageErrors': []})
        write_json(payload / 'delivery.json', delivery)
        archive_hash = sha(('LOCAL FIXTURE archive ' + task_id).encode())
        report = {'schemaVersion': 1, 'kind': 'three-creator-host-artifact-verification', 'status': 'passed', **identity, 'archiveSha256': archive_hash}
        write_json(directory / 'host-artifact-verification.json', report)
        review = {'schemaVersion': 1, 'kind': 'three-creator-independent-browser-review', 'runId': self.run_id,
                  'caseId': case_id, 'taskId': task_id, 'profile': profile, 'referenceImageSha256': reference_hash,
                  'sourceHash': identity['sourceHash'], 'worldBuildHash': identity['worldBuildHash'], 'archiveSha256': archive_hash,
                  'status': 'passed', 'browserPlayable': True, 'referenceCompared': True, 'externalGoalsReviewed': True,
                  'pageErrors': [], 'runtimeErrors': [], 'note': 'LOCAL FIXTURE, no browser or model was run.'}
        review_path = f'host-review/{task_id}.json'; write_json(self.run / review_path, review)
        self.publication['cases'][task_id] = {'status': 'ready', 'browserReview': review_path}
        self.reclose(task_id)

    def reclose(self, task_id):
        directory = self.verified / task_id; payload = directory / 'payload'
        files = lambda: {p.relative_to(payload).as_posix(): sha(p.read_bytes()) for p in payload.rglob('*') if p.is_file()}
        delivery = json.loads((payload / 'delivery.json').read_text())
        delivery['files'] = {name: value for name, value in files().items() if name not in ('delivery.json', 'artifact-hashes.json')}
        write_json(payload / 'delivery.json', delivery)
        write_json(payload / 'artifact-hashes.json', {'schemaVersion': 1, 'files': {name: value for name, value in files().items() if name != 'artifact-hashes.json'}})
        report = json.loads((directory / 'host-artifact-verification.json').read_text())
        report.update(fileCount=len(files()), uncompressedBytes=sum(p.stat().st_size for p in payload.rglob('*') if p.is_file()))
        write_json(directory / 'host-artifact-verification.json', report)

    def stage(self, name='staged', allow=True):
        self.write_inputs()
        output = self.root / name
        report = site.prepare_site(self.root / 'selection.json', self.root / 'plan.json', self.inputs, self.run,
                                   self.verified, self.root / 'publication.json', output, allow)
        return report, json.loads((output / 'results.json').read_text())


class EvaluationSiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='three-site-local-fixture-')
        self.root = Path(self.temp.name).resolve()

    def tearDown(self):
        self.temp.cleanup()

    def test_five_sdk_only_cases_stage_with_truthful_labels_and_metrics(self):
        fixture = Fixture(self.root, count=5)
        report, result = fixture.stage()
        self.assertEqual(report['mountPath'], '/creator-evals/three/')
        self.assertEqual(report['caseCount'], 5); self.assertEqual(report['playableCount'], 5)
        self.assertEqual(result['suite'], 'sdk-only'); self.assertEqual(result['evidenceScope'], 'local-fixture')
        self.assertEqual(site.EVIDENCE_SCOPES['sdk-only'], 'sdk-only-cloud-evaluation')
        self.assertEqual(site.EVIDENCE_SCOPES['paired'], 'paired-cloud-evaluation')
        self.assertIn('LOCAL FIXTURE', result['title']); self.assertNotIn('对照', result['title'])
        for row in result['cases']:
            self.assertEqual(row['profile'], 'three-sdk')
            self.assertEqual(row['metrics']['activePlaySeconds'], 180)
            self.assertEqual(row['metrics']['inputWallSeconds'], 185)
            self.assertEqual(row['metrics']['actualWallSeconds'], 200)
            self.assertTrue((self.root / 'staged' / row['playable']).is_file())
        self.assertFalse(any(p.name == 'project.json' or p.suffix == '.ts' for p in (self.root / 'staged').rglob('*')))

    def test_sdk_only_rejects_raw_even_when_raw_is_unselected(self):
        fixture = Fixture(self.root)
        raw = {**fixture.plan['cases'][0], 'taskId': 'local-case-01--three-raw', 'profile': 'three-raw'}
        fixture.plan['cases'].append(raw)
        with self.assertRaisesRegex(ValueError, 'task/profile'):
            fixture.stage()

    def test_plan_suite_and_explicit_selection_are_closed(self):
        fixture = Fixture(self.root)
        for selected in (None, [], ['unknown'], [fixture.plan['selectedTaskIds'][0]] * 2, [{}]):
            with self.subTest(selected=selected):
                fixture.plan['selectedTaskIds'] = selected
                with self.assertRaisesRegex(ValueError, 'selection'):
                    fixture.stage()
        fixture.plan['selectedTaskIds'] = [fixture.plan['cases'][0]['taskId']]
        for suite in (None, 'paired'):
            fixture.plan['suite'] = suite
            with self.assertRaisesRegex(ValueError, 'suite'):
                fixture.stage()

    def test_legacy_paired_plan_and_missing_active_data_remain_legacy(self):
        fixture = Fixture(self.root, suite='paired', version=None); fixture.plan.pop('suite')
        report, result = fixture.stage()
        self.assertEqual(report['caseCount'], 2); self.assertEqual(result['suite'], 'paired')
        self.assertIn('对照', result['title'])
        for row in result['cases']:
            self.assertNotIn('activePlaySeconds', row['metrics']); self.assertNotIn('inputWallSeconds', row['metrics'])
            self.assertEqual(row['metrics']['actualWallSeconds'], 200)

    def test_sdk_v2_in_old_paired_plan_still_requires_active_evidence(self):
        fixture = Fixture(self.root, suite='paired')
        task = 'local-case-01--three-sdk'; payload = fixture.verified / task / 'payload'
        for name in ('delivery.json', 'playtest/playtest.json'):
            record = json.loads((payload / name).read_text()); record.pop('activePlaySeconds'); write_json(payload / name, record)
        fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'activePlaySeconds'):
            fixture.stage()

    def test_active_duration_threshold_and_identity_are_both_enforced(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]; payload = fixture.verified / task / 'payload'
        played = json.loads((payload / 'playtest/playtest.json').read_text()); delivery = json.loads((payload / 'delivery.json').read_text())
        for value in (None, True, -1, 179.99, 3600):
            with self.subTest(value=value):
                played['activePlaySeconds'] = value; delivery['activePlaySeconds'] = value
                write_json(payload / 'playtest/playtest.json', played); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
                with self.assertRaisesRegex(ValueError, 'activePlaySeconds|active duration'):
                    fixture.stage()
        played['activePlaySeconds'] = 180; delivery['activePlaySeconds'] = 181
        write_json(payload / 'playtest/playtest.json', played); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'active duration'):
            fixture.stage()

    def test_missing_input_timing_or_short_video_cannot_publish_v2(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]; payload = fixture.verified / task / 'payload'
        played = json.loads((payload / 'playtest/playtest.json').read_text())
        played.pop('inputWallSeconds'); write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'inputWallSeconds'):
            fixture.stage()
        played['inputWallSeconds'] = 185; played['videoMetadata']['durationSeconds'] = 179
        write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'video duration'):
            fixture.stage()

    def test_local_fixture_opt_in_and_existing_review_identity_gates_stay_required(self):
        fixture = Fixture(self.root)
        with self.assertRaisesRegex(ValueError, 'Local fixtures require'):
            fixture.stage(allow=False)
        task = fixture.plan['selectedTaskIds'][0]; review_path = fixture.run / fixture.publication['cases'][task]['browserReview']
        review = json.loads(review_path.read_text()); review['worldBuildHash'] = '0' * 64; write_json(review_path, review)
        with self.assertRaisesRegex(ValueError, 'Browser review identity mismatch'):
            fixture.stage()
        self.assertFalse((self.root / 'staged').exists())

    def test_sdk_only_cannot_downgrade_timing_gate_by_omitting_version_metadata(self):
        fixture = Fixture(self.root, version=None)
        with self.assertRaisesRegex(ValueError, 'activePlaySeconds'):
            fixture.stage()

    def test_plan_case_hash_and_runtime_identity_are_still_checked(self):
        fixture = Fixture(self.root); task = fixture.plan['cases'][0]
        original_hash = task['caseHash']; task['caseHash'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Planned case input hash mismatch'):
            fixture.stage()
        task['caseHash'] = original_hash
        case_path = fixture.run / task['taskId'] / 'case-input.json'
        case_input = json.loads(case_path.read_text()); case_input['runtimeHash'] = '0' * 64
        write_json(case_path, case_input); task['caseHash'] = sha(encoded(case_input))
        with self.assertRaisesRegex(ValueError, 'Case input engine/runtime mismatch'):
            fixture.stage()

    def test_ready_still_needs_independent_pass_and_issues_need_explicit_host_notes(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]
        publication = fixture.publication['cases'][task]
        review_path = fixture.run / publication['browserReview']; review = json.loads(review_path.read_text())
        review['status'] = 'issues'; write_json(review_path, review)
        with self.assertRaisesRegex(ValueError, 'Ready requires passing independent'):
            fixture.stage()
        publication.update(status='issues', browserPlayable=True)
        with self.assertRaisesRegex(ValueError, 'Issues requires explicit Host'):
            fixture.stage()
        publication['note'] = 'LOCAL FIXTURE issue: no actual model or gameplay evidence.'
        _, result = fixture.stage()
        self.assertEqual(result['cases'][0]['semanticStatus'], 'known-issues')
        self.assertEqual(result['cases'][0]['status'], 'issues')


if __name__ == '__main__':
    unittest.main()
