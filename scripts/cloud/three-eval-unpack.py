#!/usr/bin/env python3
"""Extract a hash-bound Three delivery into a new directory without executing it."""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath
import tarfile


def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def verify_workspace_runtime(manifest, actual):
    runtime_source = manifest.get('runtimeSourceHash')
    sdk_sources = {name[len('source/sdk/'):]: value for name, value in actual.items() if name.startswith('source/sdk/')}
    if runtime_source is not None:
        assert manifest['profile'] == 'three-sdk' and sdk_sources, 'Workspace SDK source required'
        assert 'runtime.json' in sdk_sources and 'three-world/src/index.ts' in sdk_sources
        ordered = [[name, sdk_sources[name]] for name in sorted(sdk_sources, key=lambda name: name.encode('utf-16-be'))]
        assert hashlib.sha256(json.dumps(ordered, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest() == runtime_source, 'Workspace runtime source hash mismatch'
        for name, value in sdk_sources.items():
            assert actual.get('playable/sdk/' + name) == value, 'Workspace runtime source closure mismatch'
        runtime_files = {name: actual['playable/runtime/' + name] for name in ['bridge.js', 'three.js', 'worldkit-three.js']}
        assert hashlib.sha256(json.dumps(runtime_files, separators=(',', ':')).encode()).hexdigest() == manifest['runtimeHash'], 'Workspace runtime bytes mismatch'
    else:
        assert not sdk_sources, 'Workspace SDK requires source identity'


def main():
    if sys.flags.optimize:
        raise RuntimeError('Verification must run without Python optimization')
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    receipt = json.loads(Path(args.receipt).read_text())
    archive = Path(args.archive)
    assert archive.is_file() and not archive.is_symlink()
    assert digest(archive) == receipt['archiveSha256']
    assert archive.stat().st_size == receipt['archiveByteLength']
    output = Path(args.output).absolute()
    # Inspect headers only before extraction or hashing any member contents.
    # Platform-owned task scratch must never become a public world artifact.
    listed_paths, platform_paths = [], []
    with tarfile.open(archive, 'r|gz') as stream:
        for member in stream:
            name = member.name.rstrip('/')
            listed_paths.append(name)
            assert len(listed_paths) <= 10000, 'Member limit'
            parts = PurePosixPath(name).parts
            if any(part.lower() in {'scratch', 'codex_home', 'auth.json', 'credentials', 'aws-credentials', 'aws-config', '.aws', '.codex', '.creator-session', 'google-service-account.json'} or part.lower().startswith('codex_home_') for part in parts):
                platform_paths.append(name)
    if platform_paths:
        output.parent.mkdir(parents=True, exist_ok=True)
        quarantine = {'kind': 'three-creator-artifact-quarantine', 'status': 'quarantined', 'reason': 'PLATFORM_PRIVATE_PATH_IN_ARTIFACT', 'archiveSha256': receipt['archiveSha256'], 'paths': platform_paths, 'memberContentsInspected': False, 'extracted': False}
        output.with_name(output.name + '-quarantine.json').write_text(json.dumps(quarantine, indent=2) + '\n')
        raise RuntimeError('PLATFORM_PRIVATE_PATH_IN_ARTIFACT: quarantined before extraction; member contents were not inspected')
    assert not output.exists(), 'Use a fresh verification output directory'
    output.mkdir(parents=True)
    assert output.resolve() == output, 'Output ancestors cannot be symlinks'
    members, paths, total = 0, set(), 0
    with tarfile.open(archive, 'r|gz') as stream:
        for member in stream:
            members += 1
            assert members <= 10000, 'Member limit'
            name = member.name.rstrip('/')
            parts = PurePosixPath(name).parts
            assert parts and parts[0] == 'payload' and not name.startswith('/')
            assert all(part not in ('.', '..', '') for part in name.split('/'))
            assert '\\' not in name and '\0' not in name and name not in paths
            paths.add(name)
            assert member.isdir() or member.isfile(), 'Links and special entries are rejected'
            target = output.joinpath(*parts)
            assert target.resolve().is_relative_to(output)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            total += member.size
            assert 0 <= member.size <= 256 * 1024 * 1024 and total <= 512 * 1024 * 1024
            target.parent.mkdir(parents=True, exist_ok=True)
            source = stream.extractfile(member)
            assert source is not None
            written = 0
            with source, open(target, 'xb') as destination:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    written += len(chunk)
                    assert written <= member.size
                    destination.write(chunk)
            assert written == member.size
    payload = output / 'payload'
    actual = {str(p.relative_to(payload)): digest(p) for p in payload.rglob('*') if p.is_file()}
    inventory = json.loads((payload / 'artifact-hashes.json').read_text())
    assert inventory['schemaVersion'] == 1
    assert {k: v for k, v in actual.items() if k != 'artifact-hashes.json'} == inventory['files']
    manifest = json.loads((payload / 'delivery.json').read_text())
    assert actual['delivery.json'] == receipt['deliveryManifestSha256']
    receipt_fields = {'archivePath', 'archiveSha256', 'archiveByteLength', 'deliveryManifestSha256'}
    assert {k: v for k, v in receipt.items() if k not in receipt_fields} == manifest
    assert {k: v for k, v in actual.items() if k not in ('artifact-hashes.json', 'delivery.json')} == manifest['files']
    assert actual['episode.json'] == manifest['episodeHash']
    verify_workspace_runtime(manifest, actual)
    runtime_source = manifest.get('runtimeSourceHash')
    played = json.loads((payload / 'playtest/playtest.json').read_text())
    captures = json.loads((payload / 'captures/captures.json').read_text())
    assert played.get('runtimeSourceHash') == runtime_source
    for key in ['profile', 'sourceHash', 'worldBuildHash', 'runtimeHash', 'episodeHash']:
        assert played[key] == manifest[key]
    assert played['status'] == 'passed' and played['isCompleteEpisode'] is True and played['capturedInput'] is True
    for key in ['actualWallSeconds', 'activePlaySeconds', 'inputWallSeconds']:
        assert finite_number(played[key]) and 0 < played[key] < 3600
        assert played[key] == manifest[key]
    capture = played['captureTiming']
    video = played['videoMetadata']
    assert capture == manifest['captureTiming'] and video == manifest['videoMetadata']
    assert capture['clock'] == 'browser-performance'
    assert all(finite_number(capture[k]) and capture[k] >= 0 for k in ['initialFrameRequestedAtMilliseconds', 'finalFrameRequestedAtMilliseconds', 'recorderStoppedAtMilliseconds', 'framePeriodSeconds', 'postrollSeconds'])
    assert 0 < capture['framePeriodSeconds'] <= 1
    assert capture['recorderStoppedAtMilliseconds'] >= capture['finalFrameRequestedAtMilliseconds']
    assert isinstance(capture['requestedFrames'], int) and capture['requestedFrames'] >= 2
    timing = json.loads((payload / 'playtest/trace.json').read_text())['timing']
    assert timing['clock'] == 'browser-performance'
    assert all(finite_number(timing[k]) for k in ['startedAtMilliseconds', 'endedAtMilliseconds', 'durationSeconds'])
    assert abs(timing['durationSeconds'] - (timing['endedAtMilliseconds'] - timing['startedAtMilliseconds']) / 1000) <= .001
    assert timing['durationSeconds'] == played['inputWallSeconds']
    assert capture['initialFrameRequestedAtMilliseconds'] <= timing['startedAtMilliseconds'] <= timing['endedAtMilliseconds'] <= capture['finalFrameRequestedAtMilliseconds']
    assert finite_number(video['durationSeconds']) and video['durationSeconds'] > 0
    assert video['durationSeconds'] >= played['inputWallSeconds'] - max(1, 2 * capture['framePeriodSeconds'])
    # Probe encoded bytes independently; VFR rate is not forced to the requested
    # canvas sampling rate, and recovery/postroll wall time is not input time.
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames:format=duration', '-of', 'json', str(payload / 'playtest/playtest.mp4')], timeout=60))
    stream = probe['streams'][0]
    actual_video = {'durationSeconds': float(probe['format']['duration']), 'frameCount': int(stream['nb_read_frames']), 'widthPixels': int(stream['width']), 'heightPixels': int(stream['height'])}
    assert actual_video == video and finite_number(actual_video['durationSeconds']) and actual_video['durationSeconds'] > 0
    assert played['pageErrors'] == [] and played['runtimeErrors'] == [] and played['blockedNetworkRequests'] == []
    assert played['targetResults'] == manifest['targetResults']
    assert captures['profile'] == manifest['profile'] and captures['worldBuildHash'] == manifest['worldBuildHash']
    assert captures['sourceHash'] == manifest['sourceHash'] and captures['pageErrors'] == []
    assert any(k.startswith('playtest/') and k.endswith(('.webm', '.mp4')) for k in actual)
    assert 'playable/index.html' in actual and 'source/index.html' in actual
    assert captures['images'] and any(i.get('view') == 'opening' for i in captures['images'])
    assert any(i.get('view') == 'top-down' for i in captures['images']), 'THREE_DELIVERY_TOP_DOWN_REQUIRED'
    assert any(i.get('view') == 'entity-triview' and 'player' in i.get('entityIds', []) for i in captures['images'])
    report = {'kind': 'three-creator-host-artifact-verification', 'schemaVersion': 1, 'status': 'passed',
              'profile': manifest['profile'], 'engine': manifest['engine'], 'sourceHash': manifest['sourceHash'],
              'toolVersion': manifest.get('toolVersion'), 'sdkVersion': manifest.get('sdkVersion'),
              'browserObservationContract': manifest.get('browserObservationContract'),
              'actualWallSeconds': played['actualWallSeconds'], 'inputWallSeconds': played['inputWallSeconds'], 'activePlaySeconds': played['activePlaySeconds'],
              'actualVideoMetadata': actual_video, 'captureTiming': capture,
              'worldBuildHash': manifest['worldBuildHash'], 'creatorRuntimeLockHash': manifest['creatorRuntimeLockHash'],
              'archiveSha256': receipt['archiveSha256'], 'fileCount': len(actual), 'uncompressedBytes': total, 'platformPathPreflight': 'passed',
              'payloadPath': str(payload), 'semanticStatus': 'unreviewed', 'browserReplay': 'not-run',
              'qualification': 'Hash closure and recorded technical evidence only; independent runtime and visual review required.'}
    (output / 'host-artifact-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
