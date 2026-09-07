import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
# These tests need neither Pillow nor Google credentials/client installations.
PIL = types.ModuleType('PIL')
PIL.Image = Mock()
sys.modules['PIL'] = PIL

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

director = load('vertex_event_director', ROOT / 'scripts/lib/vertex-event-director.py')
adapter = load('three_episode_gemini', ROOT / 'scripts/cloud/three-episode-gemini.py')

class VertexTests(unittest.TestCase):
    def test_adapter_materials_slots_and_atomic_output_without_old_episode_imports(self):
        self.assertEqual(Path(adapter.director.__file__).resolve(), ROOT / 'scripts/lib/vertex-event-director.py')
        self.assertNotIn('cloud_production_slots', sys.modules)
        self.assertNotIn('cloud_seedance_slots', sys.modules)
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            (root / 'config').mkdir()
            config = {'model': 'gemini-3.5-flash', 'temperature': 0.6}
            (root / 'config/episode-visual-event-director.json').write_text(json.dumps(config))
            request = {'model': 'gemini-3.5-flash', 'videos': [{'path': f'/media/{i}.mp4', 'samplingFps': .25} for i in range(3)], 'images': [f'/media/{i}.png' for i in range(3)], 'instruction': '保留 HOST_EVENT_SLOTS_JSON', 'outputPath': str(root / 'events.json')}
            events = [{'name': f'event-{i}'} for i in range(5)]
            with patch.object(adapter, 'ROOT', root), patch.object(adapter.director, '_prepare_vertex_environment', return_value=('project', 'global', 'gemini-3.5-flash')), patch.object(adapter.director, '_assert_video') as video, patch.object(adapter.director, '_assert_png') as image, patch.object(adapter.director, '_generate_events', return_value=events) as generate:
                adapter.run(request)
                self.assertEqual([call.args[0] for call in video.call_args_list], [Path(v['path']) for v in request['videos']])
                self.assertEqual([call.args[0] for call in image.call_args_list], list(map(Path, request['images'])))
                self.assertEqual(generate.call_args.kwargs, dict(videos=[Path(v['path']) for v in request['videos']], frames=list(map(Path, request['images'])), slots=[{'segmentId': f'segment-{segment:02}', 'globalSeconds': segment * 30 + second, 'segmentRelativeSeconds': second} for segment, second in [(0, 8), (0, 20), (2, 8), (2, 20), (4, 14)]], prompt_template=request['instruction'], project_id='project', location='global', model='gemini-3.5-flash', config=config, video_sampling_fps=.25))
            self.assertEqual(json.loads((root / 'events.json').read_text()), {'events': events})
            self.assertFalse((root / 'events.part').exists())
            for invalid in [{**request, 'model': 'other'}, {**request, 'videos': request['videos'][:2]}, {**request, 'images': request['images'][:2]}, {**request, 'videos': [{**v, 'samplingFps': 1} for v in request['videos']]}]:
                with self.assertRaises(ValueError): adapter.run(invalid)

    def test_environment_uses_local_config_and_credential_project(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            env = root / 'gemini.env'
            credentials = root / 'account.json'
            credentials.write_text(json.dumps({'project_id': 'credential-project'}))
            env.write_text('# ignored\nWORLDKIT_GEMINI_EVENT_MODEL="stale-model"\n')
            with patch.dict(os.environ, {'GCLOUD_PROJECT_ID': 'external-project', 'GOOGLE_APPLICATION_CREDENTIALS': '/wrong'}, clear=True), patch.object(director, 'PROJECT_ROOT', root), patch.object(director, 'DEFAULT_ENV_FILE', env), patch.object(director, 'DEFAULT_CREDENTIAL_FILE', credentials):
                self.assertEqual(director._prepare_vertex_environment({'model': 'gemini-3.5-flash'}), ('credential-project', 'global', 'gemini-3.5-flash'))
                self.assertEqual(os.environ['GOOGLE_APPLICATION_CREDENTIALS'], str(credentials))
                env.write_text('GCLOUD_PROJECT_ID="local-project"\n')
                self.assertEqual(director._prepare_vertex_environment({'model': 'model', 'location': 'us-central1'}), ('local-project', 'us-central1', 'model'))
                credentials.unlink()
                with self.assertRaisesRegex(RuntimeError, 'project-local credentials'): director._prepare_vertex_environment({})

    def test_media_admission_preserves_size_symlink_and_duration_checks(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            media = root / 'capture.mp4'
            media.write_bytes(b'x' * 2049)
            with patch.object(director.subprocess, 'run', return_value=types.SimpleNamespace(stdout='{"format":{"duration":"30"}}')) as probe:
                director._assert_video(media)
                self.assertEqual(probe.call_args.args[0], ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(media)])
                self.assertEqual(probe.call_args.kwargs, dict(check=True, capture_output=True, text=True, timeout=60))
                probe.return_value.stdout = '{"format":{"duration":"28"}}'
                with self.assertRaisesRegex(RuntimeError, '30-second'): director._assert_video(media)
            with patch.object(director.Image, 'open') as opened:
                director._assert_png(media)
                opened.return_value.__enter__.return_value.verify.assert_called_once()
            link = root / 'link.png'
            link.symlink_to(media)
            for path in [link, root / 'missing']:
                with self.assertRaises(RuntimeError): director._assert_png(path)
                with self.assertRaises(RuntimeError): director._assert_video(path)
            media.write_bytes(b'x' * 2048)
            with self.assertRaises(RuntimeError): director._assert_png(media)

    def test_generation_preserves_pair_order_prompt_config_and_closes_frames(self):
        google = types.ModuleType('google')
        genai = types.ModuleType('google.genai')
        google.genai = genai
        genai.types = types.SimpleNamespace(**{name: lambda **kwargs: types.SimpleNamespace(**kwargs) for name in ['Part', 'Blob', 'VideoMetadata', 'GenerateContentConfig']})
        events = [{'event': i} for i in range(5)]
        generate = Mock(return_value=types.SimpleNamespace(text=json.dumps({'events': events})))
        genai.Client = Mock(return_value=types.SimpleNamespace(models=types.SimpleNamespace(generate_content=generate)))
        frames = [Mock(), Mock(), Mock()]
        sources = [Mock(), Mock(), Mock()]
        # Explicit context-manager fakes avoid a Pillow dependency.
        class Opened:
            def __init__(self, source): self.source = source
            def __enter__(self): return self.source
            def __exit__(self, *args): pass
        for source, frame in zip(sources, frames): source.convert.return_value = frame
        with tempfile.TemporaryDirectory() as name, patch.dict(sys.modules, {'google': google, 'google.genai': genai}), patch.object(director.Image, 'open', side_effect=[Opened(source) for source in sources]):
            root = Path(name).resolve()
            videos = [root / f'{i}.mp4' for i in range(3)]
            for i, video in enumerate(videos): video.write_bytes(f'video-{i}'.encode())
            slots = [{'segmentId': 'segment-00', 'globalSeconds': 8}]
            kwargs = dict(videos=videos, frames=[root / f'{i}.png' for i in range(3)], slots=slots, prompt_template='before HOST_EVENT_SLOTS_JSON after', project_id='project', location='global', model='gemini-3.5-flash', config={'temperature': .6, 'maxOutputTokens': 1234}, video_sampling_fps=.25)
            self.assertEqual(director._generate_events(**kwargs), events)
            genai.Client.assert_called_once_with(vertexai=True, project='project', location='global')
            call = generate.call_args.kwargs
            self.assertEqual(call['model'], 'gemini-3.5-flash')
            self.assertEqual(call['contents'][0], 'before ' + json.dumps(slots, ensure_ascii=False, indent=2) + ' after')
            for i in range(3):
                part = call['contents'][1 + 2 * i]
                self.assertEqual((part.inline_data.data, part.inline_data.mime_type, part.video_metadata.fps), (f'video-{i}'.encode(), 'video/mp4', .25))
                self.assertIs(call['contents'][2 + 2 * i], frames[i])
                sources[i].convert.assert_called_once_with('RGB')
                frames[i].close.assert_called_once()
            self.assertEqual(call['config'].temperature, .6)
            self.assertEqual(call['config'].max_output_tokens, 1234)
            self.assertEqual(call['config'].response_json_schema['properties']['events']['minItems'], 5)
            self.assertEqual(call['config'].response_json_schema['properties']['events']['maxItems'], 5)
            self.assertIn('严格按 Host 槽位顺序输出 JSON', call['config'].system_instruction)
            self.assertEqual(call['config'].response_mime_type, 'application/json')
            for response in [None, '{}', '{"events":[1]}']:
                generate.return_value = types.SimpleNamespace(text=response)
                with patch.object(director.Image, 'open', side_effect=[Opened(source) for source in sources]):
                    with self.assertRaises(RuntimeError): director._generate_events(**kwargs)
            generate.side_effect = RuntimeError('provider failure')
            for frame in frames: frame.reset_mock()
            with patch.object(director.Image, 'open', side_effect=[Opened(source) for source in sources]):
                with self.assertRaisesRegex(RuntimeError, 'provider failure'): director._generate_events(**kwargs)
            for frame in frames: frame.close.assert_called_once()

if __name__ == '__main__': unittest.main()
