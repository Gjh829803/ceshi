"""将同骨架的额外动作接入既有 GLB；保留原网格、材质、骨架与飞行动作字节。"""
import copy
import json
import struct
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:3])
def load(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20+length]), bytearray(data[28+length:])

for i in range(1, 12):
    name = f'D{i:02}'
    path = target / ('dragon.glb' if i == 1 else name+'.glb')
    document, binary = load(path)
    extra, extra_binary = load(source / (name+'.glb'))
    if any('_Ground_' in c['name'] for c in document['animations']):
        raise RuntimeError('ALREADY_MERGED:'+name)
    nodes = {n['name']: i for i, n in enumerate(document['nodes']) if 'name' in n}
    accessors, views = {}, {}
    def accessor(index):
        if index in accessors:
            return accessors[index]
        a = copy.deepcopy(extra['accessors'][index])
        view_id = a['bufferView']
        if view_id not in views:
            view = copy.deepcopy(extra['bufferViews'][view_id])
            offset = view.get('byteOffset', 0)
            binary.extend(b'\0' * (-len(binary) % 4))
            view['byteOffset'] = len(binary)
            binary.extend(extra_binary[offset:offset+view['byteLength']])
            views[view_id] = len(document['bufferViews'])
            document['bufferViews'].append(view)
        a['bufferView'] = views[view_id]
        accessors[index] = len(document['accessors'])
        document['accessors'].append(a)
        return accessors[index]
    for clip in extra['animations']:
        if clip['name'].endswith('ReferenceHover'):
            continue
        clip = copy.deepcopy(clip)
        for channel in clip['channels']:
            bone = extra['nodes'][channel['target']['node']]['name']
            if bone not in nodes:
                raise RuntimeError('GROUND_BONE_MISSING:'+name+':'+bone)
            channel['target']['node'] = nodes[bone]
        for sampler in clip['samplers']:
            sampler['input'] = accessor(sampler['input'])
            sampler['output'] = accessor(sampler['output'])
        document['animations'].append(clip)
    binary.extend(b'\0' * (-len(binary) % 4))
    document['buffers'][0]['byteLength'] = len(binary)
    data = json.dumps(document, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    path.write_bytes(struct.pack('<5I', 0x46546c67, 2, 28+len(data)+len(binary), len(data), 0x4e4f534a)+data+struct.pack('<2I', len(binary), 0x004e4942)+binary)
    print(name, 'ground clips merged')
