#!/usr/bin/env python3
"""Build the Source101 model with ground locomotion bindings.

Explicit --source and --output produce an intake candidate. --check verifies an existing export.
Register reviewed output through asset-library/tools/ingest.mjs using a new version.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct

CLIPS = {'idle': 'idle-loop', 'walk': 'walk-loop', 'run': 'run-loop',
         'jump': 'jump-stand', 'fall': 'fall-loop'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def glb(file):
    data = file.read_bytes()
    assert struct.unpack_from('<III', data) == (0x46546C67, 2, len(data))
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20 + size])
    length, kind = struct.unpack_from('<II', data, 20 + size)
    assert kind == 0x004E4942 and len(document['buffers']) == 1
    return document, data[28 + size:28 + size + length]


def floats(document, binary, index):
    accessor = document['accessors'][index]
    assert accessor['componentType'] == 5126 and 'sparse' not in accessor
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    view = document['bufferViews'][accessor['bufferView']]
    assert view.get('byteStride', width * 4) == width * 4
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return list(struct.unpack_from('<' + 'f' * accessor['count'] * width, binary, start))


def build(source):
    manifest = json.loads((source / 'manifest.json').read_bytes())
    source_files = [source / manifest['model']]
    document, original = glb(source_files[0])
    document = copy.deepcopy(document)
    # The offline UEFN skin and Source101 rig stay intact; attach existing locomotion clips.
    nodes = {node['name']: i for i, node in enumerate(document['nodes'])}
    assert len(nodes) == len(document['nodes'])
    document['nodes'][nodes['GASP_DirectFK_Research']]['translation'] = [0, 0, 0]
    document['nodes'][nodes['root']]['translation'] = [0, 0, 0]
    document['animations'] = []
    binary = bytearray(original)

    def append(values, width):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        view = len(document['bufferViews'])
        document['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(values) * 4})
        accessor = {'bufferView': view, 'componentType': 5126,
                    'count': len(values) // width, 'type': {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[width]}
        if width == 1:
            accessor.update(min=[min(values)], max=[max(values)])
        index = len(document['accessors'])
        document['accessors'].append(accessor)
        return index

    for action, name in CLIPS.items():
        file = source / f'gasp-research/{name}.experimental.glb'
        source_files.append(file)
        src, data = glb(file)
        # Do not silently accept incompatible skeletons or bind poses.
        assert [src['nodes'][i]['name'] for i in src['skins'][0]['joints']] == [
            document['nodes'][i]['name'] for i in document['skins'][0]['joints']]
        animation = {'name': action, 'samplers': [], 'channels': []}
        for channel in src['animations'][0]['channels']:
            target = channel['target']
            bone = src['nodes'][target['node']]['name']
            if bone == 'root' and target['path'] == 'translation':
                continue  # Rapier owns world translation, including jump height.
            sampler = src['animations'][0]['samplers'][channel['sampler']]
            assert sampler.get('interpolation', 'LINEAR') == 'LINEAR'
            times = floats(src, data, sampler['input'])
            values = floats(src, data, sampler['output'])
            width = 4 if target['path'] == 'rotation' else 3
            assert len(values) == len(times) * width
            # Same yaw removal as the preserved Player source loader.
            if bone == 'root' and target['path'] == 'rotation':
                for i in range(0, len(values), 4):
                    x, y, z, w = values[i:i + 4]
                    length = math.hypot(y, w)
                    if length > 1e-4:
                        sy, cw = y / length, w / length
                        x, y, z, w = cw*x-sy*z, cw*y-sy*w, cw*z+sy*x, cw*w+sy*y
                    norm = math.sqrt(x*x+y*y+z*z+w*w)
                    values[i:i+4] = [v / norm for v in (x, y, z, w)]
            # Enter the measured takeoff pose (frame 10) on the physical jump edge.
            # Other clips retain their full source pose sequence.
            start = 10 / 30 if action == 'jump' else times[0]
            first = next(i for i, t in enumerate(times) if t >= start - 1e-6)
            times = [max(0, t - times[first]) for t in times[first:]]
            values = values[first * width:]
            index = len(animation['samplers'])
            animation['samplers'].append({'input': append(times, 1), 'output': append(values, width), 'interpolation': 'LINEAR'})
            animation['channels'].append({'sampler': index, 'target': {'node': nodes[bone], 'path': target['path']}})
        document['animations'].append(animation)
    document['buffers'] = [{'byteLength': len(binary)}]
    document['asset']['generator'] = 'WorldKit Source101 ground.standard adapter v1'
    encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
              + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
              + struct.pack('<II', len(binary), 0x004E4942) + binary)
    provenance = {'schemaVersion': 1, 'sourceAssetId': 'humanoid.uefn-mannequin',
                  'sources': [{'path': p.relative_to(source).as_posix(), 'sha256': digest(p.read_bytes())} for p in source_files],
                  'actions': CLIPS, 'normalization': 'zero stage/root translation; remove root translation tracks and root yaw; jump starts at source frame 10; catalog rotates +Z to -Z',
                  'outputSha256': digest(result), 'outputByteLength': len(result)}
    return bytes(result), (json.dumps(provenance, indent=2) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path, help='Input source directory containing manifest.json and source clips')
    parser.add_argument('--output', required=True, type=Path, help='New intake output directory')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    model, provenance = build(args.source.resolve())
    dest = args.output.resolve()
    if args.check:
        assert (dest / 'model.glb').read_bytes() == model, 'Model byte mismatch'
        assert (dest / 'provenance.json').read_bytes() == provenance, 'Provenance mismatch'
    else:
        if dest.exists():
            raise ValueError('OUTPUT_EXISTS: choose a new intake directory')
        dest.mkdir(parents=True)
        (dest / 'model.glb').write_bytes(model)
        (dest / 'provenance.json').write_bytes(provenance)
    print(f'Source101 export verified: {len(model)} bytes, sha256 {digest(model)}')


if __name__ == '__main__':
    main()
