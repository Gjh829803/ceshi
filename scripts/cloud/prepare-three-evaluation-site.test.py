"""Synthetic LOCAL FIXTURE coverage only: no model, browser execution or publication."""
import hashlib
import importlib.util
import json
import io
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zlib
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('three_site', Path(__file__).with_name('prepare-three-evaluation-site.py'))
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)
publisher_spec = importlib.util.spec_from_file_location('three_publisher', Path(__file__).with_name('publish-creator-evaluation-site.py'))
publisher = importlib.util.module_from_spec(publisher_spec)
publisher_spec.loader.exec_module(publisher)


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
    def test_declared_hashed_action_dependencies_are_public_but_source_is_not(self):
        resource = 'assets/resources/' + 'a' * 64 + '.json'
        notice = 'assets/resources/' + 'b' * 64 + '.txt'
        actual = {'playable/index.html': '', 'playable/' + resource: '', 'playable/' + notice: '', 'playable/private-source.ts': '', 'playable/profiles.json': ''}
        selected = site.curated_playable(actual, [], [resource, notice])
        self.assertIn('playable/' + resource, selected)
        self.assertIn('playable/' + notice, selected)
        self.assertNotIn('playable/private-source.ts', selected)
        self.assertNotIn('playable/profiles.json', selected)
        with self.assertRaises(Exception):
            site.curated_playable(actual, [], ['../private-source.ts'])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='three-site-local-fixture-')
        self.root = Path(self.temp.name).resolve()

    def tearDown(self):
        self.temp.cleanup()

    def test_preview_v2_stages_without_video_or_invented_play_metrics(self):
        fixture = Fixture(self.root)
        task = fixture.plan['selectedTaskIds'][0]
        directory = fixture.verified / task; payload = directory / 'payload'
        delivery = json.loads((payload / 'delivery.json').read_text())
        for file in (payload / 'playtest').iterdir(): file.unlink()
        (payload / 'playtest').rmdir(); (payload / 'episode.json').unlink()
        (payload / 'playable/planning').mkdir(); (payload / 'playable/planning/world-plan.png').write_bytes(png(4, 4))
        image = png(); (payload / 'preview').mkdir(); (payload / 'preview/opening.png').write_bytes(image)
        preview = {'schemaVersion': 1, 'kind': 'three-creator-browser-preview', 'view': 'opening',
                   **{key: delivery[key] for key in ('profile', 'sourceHash', 'worldBuildHash')},
                   'pageErrors': [], 'runtimeErrors': [], 'blockedNetworkRequests': [],
                   'image': {'path': '/LOCAL-FIXTURE/opening.png', 'sha256': sha(image), 'byteLength': len(image)}}
        write_json(payload / 'preview/preview.json', preview)
        for key in ('episodeHash', 'actualWallSeconds', 'activePlaySeconds', 'inputWallSeconds', 'targetResults'):
            delivery.pop(key, None)
        delivery.update(schemaVersion=2, status='ready', validationMode='interactive-preview', toolVersion='0.3.0-experimental', sdkVersion='0.3.0-experimental', previewEvidenceSha256=sha((payload / 'preview/preview.json').read_bytes()))
        write_json(payload / 'delivery.json', delivery)
        report = json.loads((directory / 'host-artifact-verification.json').read_text()); report['validationMode'] = 'interactive-preview'
        write_json(directory / 'host-artifact-verification.json', report); fixture.reclose(task)
        _, result = fixture.stage(); row = result['cases'][0]
        self.assertEqual(row['validationMode'], 'interactive-preview'); self.assertNotIn('video', row)
        self.assertTrue(row['worldPlan'].endswith('/playable/planning/world-plan.png'))
        self.assertEqual(row['metrics'], {'generationMinutes': None}); self.assertTrue(row['playable']); self.assertTrue(row['triviews'])
        preview['runtimeErrors'] = ['LOCAL FIXTURE error']; write_json(payload / 'preview/preview.json', preview)
        delivery = json.loads((payload / 'delivery.json').read_text()); delivery['previewEvidenceSha256'] = sha((payload / 'preview/preview.json').read_bytes()); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'Preview browser errors'):
            fixture.stage('reject-errors')

    def test_ten_sdk_only_cases_stage_with_truthful_labels_and_metrics(self):
        fixture = Fixture(self.root, count=10)
        report, result = fixture.stage()
        self.assertEqual(report['mountPath'], '/creator-evals/three/')
        self.assertEqual(report['caseCount'], 10); self.assertEqual(report['playableCount'], 10)
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

    def test_source_and_action_coverage_preserve_real_delivery_and_review_identity(self):
        fixture = Fixture(self.root)
        task = fixture.plan['selectedTaskIds'][0]
        fixture.publication['sourceIdentity'] = {'branch': 'codex/actions', 'commit': 'a' * 40, 'sourceSnapshotSha256': 'b' * 64, 'privatePath': '/not-public'}
        fixture.publication['cases'][task]['evaluation'] = {'actions': ['滑铲'], 'sceneRequirements': ['落地、空手，速度至少 2.5 m/s'], 'checks': ['低通道出口受阻时保持低姿态']}
        _, result = fixture.stage()
        row = result['cases'][0]
        self.assertEqual(result['sourceIdentity']['creatorRuntimeLockHash'], fixture.lock)
        self.assertNotIn('privatePath', result['sourceIdentity'])
        self.assertEqual(row['evaluation']['actions'], ['滑铲'])
        self.assertEqual(row['reviewIdentity'], {'runId': fixture.run_id, 'taskId': task, 'worldBuildHash': row['worldBuildHash']})
        self.assertEqual(row['creatorRuntimeLockHash'], fixture.lock)
        self.assertEqual(len(row['runtimeHash']), 64)

    def test_live_run_destination_is_isolated_and_rejects_incompatible_modes(self):
        manifest = {'kind': 'three-creator-evaluation-gallery', 'id': 'local-live-run', 'cases': [{'id': 'local-case--three-sdk', 'baseCaseId': 'local-case', 'profile': 'three-sdk'}]}
        remote, mode = publisher.publication_target(manifest, 'three', run_page=True)
        self.assertEqual(remote, publisher.REMOTE + '/three/runs/local-live-run')
        self.assertEqual(mode, 'run-page')
        self.assertEqual(publisher.publication_target(manifest, 'three', run_page=True, progress_only=True)[1], 'run-page-progress')
        with self.assertRaises(ValueError): publisher.publication_target(manifest, 'three', run_page=True, archive_run=True)

    def test_live_run_install_updates_own_run_and_refuses_archive_or_other_tasks(self):
        def install(root, task='local-case--three-sdk', status='queued'):
            manifest = encoded({'id': 'local-live-run', 'cases': [{'id': task, 'status': status}]})
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w') as archive:
                for name, data in [('index.html', b'LOCAL FIXTURE'), ('results.json', manifest)]:
                    entry = tarfile.TarInfo(name); entry.size = len(data); archive.addfile(entry, io.BytesIO(data))
            return subprocess.run([sys.executable, '-c', publisher.INSTALL, str(root), 'run-page', sha(manifest), 'local-live-run', json.dumps([task])], input=buffer.getvalue(), capture_output=True)
        root = self.root / 'live'
        self.assertEqual(install(root).returncode, 0)
        self.assertEqual(install(root, status='running').returncode, 0)
        original = (root / 'results.json').read_bytes()
        self.assertNotEqual(install(root, task='another-case--three-sdk').returncode, 0)
        self.assertEqual((root / 'results.json').read_bytes(), original)
        archive = self.root / 'archive'; archive.mkdir(); (archive / 'results.json').write_bytes(original)
        self.assertNotEqual(install(archive).returncode, 0)
        self.assertEqual((archive / 'results.json').read_bytes(), original)

    def test_host_titles_and_history_preserve_case_inputs_and_artifact_paths(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]
        original_input = (fixture.run / task / 'case-input.json').read_bytes()
        fixture.publication['cases'][task]['displayTitle'] = 'LOCAL FIXTURE · 公开展示标题'
        fixture.publication['historyRuns'] = [{'id': 'previous-local-run', 'label': '之前的本地轮次'}]
        _, result = fixture.stage()
        row = result['cases'][0]
        self.assertEqual(row['title'], 'LOCAL FIXTURE · 公开展示标题')
        self.assertEqual(row['id'], task)
        self.assertEqual(row['baseCaseId'], 'local-case-01')
        self.assertTrue((self.root / 'staged' / row['reference']).is_file())
        self.assertTrue((self.root / 'staged' / row['playable']).is_file())
        self.assertEqual((fixture.run / task / 'case-input.json').read_bytes(), original_input)
        self.assertEqual(result['historyRuns'], [{'id': 'previous-local-run', 'label': '之前的本地轮次', 'href': '/creator-evals/three/runs/previous-local-run/'}])
        fixture.publication['historyRuns'][0]['id'] = '../unsafe-run'
        with self.assertRaisesRegex(ValueError, 'history run'):
            fixture.stage('invalid-history')
        fixture.publication['historyRuns'] = []
        fixture.publication['cases'][task]['displayTitle'] = ''
        with self.assertRaisesRegex(ValueError, 'display title'):
            fixture.stage('invalid-title')

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

    def test_positive_active_duration_and_identity_are_both_enforced(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]; payload = fixture.verified / task / 'payload'
        played = json.loads((payload / 'playtest/playtest.json').read_text()); delivery = json.loads((payload / 'delivery.json').read_text())
        for value in (None, True, -1, 0, 3600):
            with self.subTest(value=value):
                played['activePlaySeconds'] = value; delivery['activePlaySeconds'] = value
                write_json(payload / 'playtest/playtest.json', played); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
                with self.assertRaisesRegex(ValueError, 'activePlaySeconds|active duration'):
                    fixture.stage()
        played['activePlaySeconds'] = 4; delivery['activePlaySeconds'] = 5
        write_json(payload / 'playtest/playtest.json', played); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'active duration'):
            fixture.stage()

    def test_missing_input_timing_or_empty_video_cannot_publish_v2(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]; payload = fixture.verified / task / 'payload'
        played = json.loads((payload / 'playtest/playtest.json').read_text())
        played.pop('inputWallSeconds'); write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'inputWallSeconds'):
            fixture.stage()
        played['inputWallSeconds'] = 185; played['videoMetadata']['durationSeconds'] = 0
        write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'video duration'):
            fixture.stage()

    def test_short_complete_recording_publishes_but_truncation_and_stale_episode_do_not(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]; payload = fixture.verified / task / 'payload'
        played = json.loads((payload / 'playtest/playtest.json').read_text()); delivery = json.loads((payload / 'delivery.json').read_text())
        for field, seconds in [('actualWallSeconds', 4.4), ('inputWallSeconds', 4.1), ('activePlaySeconds', 4)]:
            played[field] = seconds; delivery[field] = seconds
        played['videoMetadata'].update(durationSeconds=4.3, frameCount=13)
        write_json(payload / 'playtest/playtest.json', played); write_json(payload / 'delivery.json', delivery); fixture.reclose(task)
        _, result = fixture.stage('short-complete')
        self.assertEqual(result['cases'][0]['metrics']['activePlaySeconds'], 4)
        self.assertEqual(result['cases'][0]['metrics']['videoDurationSeconds'], 4.3)
        played['isCompleteEpisode'] = False
        write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'complete passing recorded episode'):
            fixture.stage('short-truncated')
        played['isCompleteEpisode'] = True; played['episodeHash'] = '0' * 64
        write_json(payload / 'playtest/playtest.json', played); fixture.reclose(task)
        with self.assertRaisesRegex(ValueError, 'Playtest identity mismatch: episodeHash'):
            fixture.stage('short-stale')

    def test_local_fixture_requires_opt_in_but_no_manual_review_file(self):
        fixture = Fixture(self.root)
        with self.assertRaisesRegex(ValueError, 'Local fixtures require'):
            fixture.stage(allow=False)
        task = fixture.plan['selectedTaskIds'][0]
        (fixture.run / fixture.publication['cases'][task].pop('browserReview')).unlink()
        _, result = fixture.stage()
        self.assertEqual(result['cases'][0]['status'], 'ready')
        self.assertNotIn('review', result['cases'][0])

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

    def test_old_host_review_cannot_block_play_or_leak_into_production_status(self):
        fixture = Fixture(self.root); task = fixture.plan['selectedTaskIds'][0]
        publication = fixture.publication['cases'][task]
        review_path = fixture.run / publication['browserReview']; review_path.write_text('not valid JSON; never read')
        publication.update(status='issues', note='Old manual judgment must not appear')
        _, result = fixture.stage(); row = result['cases'][0]
        self.assertEqual(row['status'], 'ready')
        self.assertNotIn('review', row); self.assertNotIn('semanticStatus', row)
        self.assertNotIn('manual judgment', row['note'])


class ProductionSyncTests(unittest.TestCase):
    def test_delivered_files_publish_without_a_review_and_repeat_is_a_noop(self):
        import shutil
        spec = importlib.util.spec_from_file_location('three_sync', Path(__file__).with_name('sync-three-evaluation-site.py'))
        syncer = importlib.util.module_from_spec(spec); spec.loader.exec_module(syncer)
        with tempfile.TemporaryDirectory(prefix='three-production-fixture-') as temporary:
            root = Path(temporary).resolve(); fixture = Fixture(root)
            fixture.plan['manifestPath'] = str(root / 'selection.json'); fixture.write_inputs()
            write_json(fixture.run / 'evaluation-plan.json', fixture.plan)
            task = fixture.plan['selectedTaskIds'][0]
            (fixture.run / fixture.publication['cases'][task]['browserReview']).unlink()
            shutil.copytree(fixture.verified / task, fixture.run / task / 'host-verified')
            write_json(fixture.run / task / 'state.json', {'phase': 'delivered', 'caseHash': fixture.plan['cases'][0]['caseHash'], 'submittedAt': '2026-09-05T00:00:00Z'})
            output_temp = tempfile.TemporaryDirectory(prefix='three-production-output-'); self.addCleanup(output_temp.cleanup)
            gallery = Path(output_temp.name).resolve() / 'gallery'
            result = syncer.sync(fixture.run, [], fixture.inputs, gallery, stage_only=True)
            self.assertTrue(result['changed']); self.assertEqual(result['playableCases'], 1)
            manifest = read_json_for_test(gallery / 'results.json')
            self.assertEqual(manifest['cases'][0]['status'], 'ready'); self.assertNotIn('review', manifest['cases'][0])
            # One presentation normalization may happen on first load; stable runs do no I/O publication.
            syncer.sync(fixture.run, [], fixture.inputs, gallery, stage_only=True)
            self.assertFalse(syncer.sync(fixture.run, [], fixture.inputs, gallery, stage_only=True)['changed'])


def read_json_for_test(file):
    return json.loads(file.read_text())


class PublisherManifestTests(unittest.TestCase):
    def manifest(self, cases):
        return {'kind': 'three-creator-evaluation-gallery', 'id': 'local-publisher-fixture', 'cases': cases}

    def test_accepts_new_three_selection_and_both_matching_profiles_at_same_remote_mount(self):
        cases = [{'baseCaseId': f'fresh-reference-{index}', 'id': f'fresh-reference-{index}--three-sdk', 'profile': 'three-sdk'} for index in range(1, 6)]
        self.assertEqual(publisher.validate_manifest(self.manifest(cases), 'three'), publisher.REMOTE + '/three')
        paired = [{'baseCaseId': 'fresh-reference-1', 'id': 'fresh-reference-1--' + profile, 'profile': profile} for profile in ('three-raw', 'three-sdk')]
        self.assertEqual(publisher.validate_manifest(self.manifest(paired), 'three'), publisher.REMOTE + '/three')

    def test_rejects_bad_slugs_mismatched_base_or_profile_and_duplicate_task_ids(self):
        base = sorted(publisher.CASE_IDS)[0]
        valid = {'baseCaseId': base, 'id': base + '--three-sdk', 'profile': 'three-sdk'}
        invalid = [
            {**valid, 'baseCaseId': '../' + base}, {**valid, 'baseCaseId': 'Uppercase'},
            {**valid, 'baseCaseId': ''}, {**valid, 'baseCaseId': None}, {**valid, 'baseCaseId': []},
            {**valid, 'baseCaseId': 'another-safe-reference'}, {**valid, 'id': '../' + valid['id']},
            {**valid, 'id': []}, {**valid, 'profile': 'three-raw'}, {**valid, 'profile': 'native'},
        ]
        for case in invalid:
            with self.subTest(case=case), self.assertRaises(ValueError):
                publisher.validate_manifest(self.manifest([case]), 'three')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            publisher.validate_manifest(self.manifest([valid, valid]), 'three')

    def test_legacy_gallery_remains_pinned_to_its_original_five_ids_and_remote(self):
        legacy = {'id': 'gpt6-five-case-eval-20260905', 'cases': [{'id': value} for value in sorted(publisher.CASE_IDS)]}
        self.assertEqual(publisher.validate_manifest(legacy, 'legacy-v3'), publisher.REMOTE)
        changed = {**legacy, 'cases': [*legacy['cases'][:-1], {'id': 'fresh-reference-5'}]}
        with self.assertRaisesRegex(ValueError, 'Unexpected legacy'):
            publisher.validate_manifest(changed, 'legacy-v3')

    def test_progress_is_bound_to_all_current_run_tasks(self):
        manifest = self.manifest([{'id': 'fresh-reference--three-sdk'}])
        progress = {'schemaVersion': 1, 'kind': 'three-creator-run-progress', 'runId': manifest['id'], 'cases': [{'taskId': 'fresh-reference--three-sdk'}]}
        publisher.validate_progress(progress, manifest)
        for change in ({'runId': 'another-run'}, {'cases': []}, {'cases': [{'taskId': 'another-task'}]}):
            with self.assertRaises(ValueError):
                publisher.validate_progress({**progress, **change}, manifest)

    def test_atomic_progress_install_rejects_stale_or_other_run_without_replacing_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            write_json(root / 'results.json', {'id': 'local-progress-run'})
            def install(value):
                data = encoded(value); buffer = io.BytesIO()
                with tarfile.open(fileobj=buffer, mode='w') as archive:
                    entry = tarfile.TarInfo('progress.json'); entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))
                return subprocess.run([sys.executable, '-c', publisher.INSTALL, str(root), 'progress-only'], input=buffer.getvalue(), capture_output=True)
            valid = {'kind': 'three-creator-run-progress', 'runId': 'local-progress-run', 'updatedAt': '2026-09-05T10:00:00Z'}
            result = install(valid)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            original = (root / 'progress.json').read_bytes()
            for change in ({'runId': 'another-run'}, {'updatedAt': '2026-09-05T09:00:00Z'}):
                self.assertNotEqual(install({**valid, **change}).returncode, 0)
                self.assertEqual((root / 'progress.json').read_bytes(), original)

    def test_completed_archive_is_idempotent_but_never_overwrites_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve() / 'run'
            manifest = encoded({'id': 'local-archive-run'})
            original = {'index.html': b'original LOCAL FIXTURE page', 'assets/frame.png': png(), 'results.json': manifest}
            def install(files):
                buffer = io.BytesIO()
                with tarfile.open(fileobj=buffer, mode='w') as archive:
                    for name, data in files.items():
                        entry = tarfile.TarInfo(name); entry.size = len(data)
                        archive.addfile(entry, io.BytesIO(data))
                return subprocess.run([sys.executable, '-c', publisher.INSTALL, str(root), 'archive-run', sha(files['results.json'])], input=buffer.getvalue(), capture_output=True)
            self.assertEqual(install(original).returncode, 0)
            mtimes = {name: (root / name).stat().st_mtime_ns for name in original}
            self.assertEqual(install(original).returncode, 0)
            self.assertEqual({name: (root / name).stat().st_mtime_ns for name in original}, mtimes)
            for changed in ({**original, 'index.html': b'changed page with identical manifest'},
                            {**original, 'new/nested.html': b'new page with identical manifest'},
                            {'index.html': original['index.html'], 'results.json': manifest},
                            {**original, 'results.json': encoded({'id': 'different-run'})}):
                with self.subTest(files=list(changed)):
                    self.assertNotEqual(install(changed).returncode, 0)
                    self.assertEqual({p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}, original)


if __name__ == '__main__':
    unittest.main()
