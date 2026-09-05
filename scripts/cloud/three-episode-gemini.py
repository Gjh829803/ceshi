#!/usr/bin/env python3
"""Three adapter for the existing Vertex event producer; no video generation."""
import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/episodes'))
spec = importlib.util.spec_from_file_location('episode_event_director', ROOT / 'scripts/episodes/run-gemini-visual-event-director.py')
director = importlib.util.module_from_spec(spec)
spec.loader.exec_module(director)

def run(request):
    if request['model'] != 'gemini-3.5-flash' or len(request['videos']) != 3 or len(request['images']) != 3:
        raise ValueError('EPISODE_GEMINI_CONTRACT_INVALID')
    if any(v['samplingFps'] != .25 for v in request['videos']):
        raise ValueError('EPISODE_GEMINI_SAMPLING_INVALID')
    config = json.loads((ROOT / 'config/episode-visual-event-director.json').read_text())
    project, location, model = director._prepare_vertex_environment(config)
    videos = [Path(v['path']) for v in request['videos']]
    images = [Path(p) for p in request['images']]
    for video in videos: director._assert_video(video)
    for image in images: director._assert_png(image)
    slots = [{'segmentId': f'segment-{segment:02}', 'globalSeconds': segment * 30 + second, 'segmentRelativeSeconds': second} for segment, second in [(0, 8), (0, 20), (2, 8), (2, 20), (4, 14)]]
    events = director._generate_events(videos=videos, frames=images, slots=slots, prompt_template=request['instruction'], project_id=project, location=location, model=model, config=config, video_sampling_fps=.25)
    output = Path(request['outputPath'])
    temporary = output.with_suffix('.part')
    temporary.write_text(json.dumps({'events': events}, ensure_ascii=False, indent=2))
    os.replace(temporary, output)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--request', required=True)
    run(json.loads(Path(parser.parse_args().request).read_text()))
