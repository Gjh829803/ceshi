"""把本地 Century 完整身体、鞍具和同族 PSA 导出为米制 Three 资产。

Blender 后台执行；--source 指向已有解包目录，--importer 指向 PSK/PSA 插件。
源游戏和原解包文件只读。材质使用简化 PBR，不还原 UE 的布料、毛发或材质图。
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--importer', required=True)
parser.add_argument('--ids', default=','.join(f'D{i:02}' for i in range(2, 12)))
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output = Path(args.source), Path(args.output)
output.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, args.importer)
import io_scene_psk_psa
io_scene_psk_psa.register()
models = source / 'Models_glTF/Game/Characters/Dragons'
compact = source / 'Analysis/Compact/Characters/Dragons'
material_files = {p.stem: p for p in compact.rglob('MI_*.json')}
images = {p.stem: p for p in models.rglob('*.png')}


def psa_timing(path):
    data = path.read_bytes()
    offset, chunks = 0, {}
    while offset < len(data):
        key, flags, size, count = struct.unpack_from('<20s3i', data, offset)
        offset += 32
        if size < 0 or count < 0 or offset + size * count > len(data):
            raise RuntimeError('PSA_CHUNK_INVALID: ' + str(path))
        chunks[key.rstrip(b'\0').decode()] = (offset, size, count)
        offset += size * count
    metadata = struct.unpack_from('<64s64s4i3f3i', data, chunks['ANIMINFO'][0])
    if 'SCALEKEYS' in chunks:
        start, size, count = chunks['SCALEKEYS']
        if any(abs(v - 1) > 1e-5 for n in range(count) for v in struct.unpack_from('<3f', data, start + n * size)):
            raise RuntimeError('PSA_NON_UNIT_SCALE: ' + str(path))
    return {'sourceFramesPerSecond': metadata[8], 'sourceFrames': metadata[11],
            'durationSeconds': metadata[11] / metadata[8], 'nonUnitScaleKeys': 0}


def parameters(name, seen=None):
    seen = set() if seen is None else seen
    if name in seen or name not in material_files:
        return {}
    seen.add(name)
    data = json.loads(material_files[name].read_text(encoding='utf-8-sig'))[0]['data']
    result = parameters(data.get('Parent'), seen)
    values = data.get('TextureParameterValues', [])
    if isinstance(values, dict):
        values = list(values.values())
    for value in values:
        if isinstance(value, dict) and 'ParameterInfo' in value:
            result[value['ParameterInfo']['Name']] = value.get('ParameterValue')
    return result


def texture_material(name, fallback, record):
    params = parameters(name)
    diffuse = next((images[params[k]] for k in ['Base_Color', 'Diffuse', 'BaseColor'] if params.get(k) in images), fallback)
    if not diffuse or not diffuse.is_file():
        raise RuntimeError('DIFFUSE_MISSING: ' + name)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = .7
    bsdf.inputs['Metallic'].default_value = 0
    out = nodes.new('ShaderNodeOutputMaterial')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(diffuse), check_existing=True)
    if max(tex.image.size) > 1024:
        factor = 1024 / max(tex.image.size)
        tex.image.scale(*(round(n * factor) for n in tex.image.size))
    material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    material.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    material.surface_render_method = 'DITHERED'
    material.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    record.append({'material': name, 'diffuse': str(diffuse.relative_to(source))})
    return material


for dragon_id in args.ids.split(','):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.fps = 30
    body_name = dragon_id + ('_Body01_Naked' if int(dragon_id[1:]) < 10 else '_Naked')
    body = next((models / dragon_id / 'Body/Body01').glob(body_name + '.gltf'))
    harness = next((models / dragon_id / 'Harness/Harness01').glob('*.gltf'))
    report = {'id': dragon_id, 'units': 'meters', 'parts': [], 'materials': [], 'clips': {}, 'sockets': [],
              'limitations': ['simplified diffuse PBR; dummy material slots mapped by atlas order',
                              'no cloth or wing morph simulation', 'airborne riding; no boarding transition']}
    master = None
    for part in [body, harness]:
        psk = source / 'MultiDragon/PSK/Game/Characters/Dragons' / part.relative_to(models).with_suffix('.psk')
        before = set(bpy.data.objects)
        bpy.ops.psk.import_file(filepath=str(psk), components='ALL')
        objects = set(bpy.data.objects) - before
        arm = next(o for o in objects if o.type == 'ARMATURE')
        if master is None:
            master = arm
            master.name = dragon_id
        common = set(master.data.bones.keys()) & set(arm.data.bones.keys())
        error = max(((master.data.bones[n].head_local - arm.data.bones[n].head_local).length for n in common), default=0)
        if error > 1:
            raise RuntimeError(f'HARNESS_REST_MISMATCH: {dragon_id} {error}')
        gltf = json.loads(part.read_text())
        report['parts'].append({'source': str(psk.relative_to(source)), 'sha256': hashlib.sha256(psk.read_bytes()).hexdigest(), 'restErrorCm': error})
        for obj in objects:
            if obj.type != 'MESH':
                continue
            missing = [g.name for g in obj.vertex_groups if g.name not in master.data.bones]
            if missing:
                raise RuntimeError('HARNESS_BONES_MISSING: ' + str(missing))
            obj.parent = master
            obj.matrix_parent_inverse = Matrix.Identity(4)
            obj.matrix_basis = Matrix.Identity(4)
            for modifier in obj.modifiers:
                if modifier.type == 'ARMATURE':
                    modifier.object = master
            for i, material in enumerate(gltf['materials']):
                name = material['name']
                fallback = None
                info = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
                if info:
                    image_index = gltf['textures'][info['index']]['source']
                    fallback = (part.parent / gltf['images'][image_index]['uri']).resolve()
                if name.startswith('dummy_'):
                    if part == body:
                        color = {'D08': 'Red', 'D09': 'Blue'}.get(dragon_id, 'Default')
                        name = f'MI_{dragon_id}_Body01' + (f'_{1001+i}' if len(gltf['materials']) > 1 else '') + '_' + color
                    elif dragon_id == 'D04':
                        name = 'MI_D04_Harness01_Default'
                    elif dragon_id == 'D03':
                        name = 'MI_D03_Harness01'
                    else:
                        raise RuntimeError('HARNESS_MATERIAL_UNMAPPED: ' + dragon_id)
                obj.data.materials[i] = texture_material(name, fallback, report['materials'])
        if arm != master:
            bpy.data.objects.remove(arm, do_unlink=True)
    master.scale = (.01, .01, .01)
    bpy.context.view_layer.update()
    socket_file = next((compact / dragon_id).glob('*Ocedar*Skeleton.json'))
    socket_defs = [entry['data'] for entry in json.loads(socket_file.read_text()) if entry.get('class') == 'SkeletalMeshSocket']
    for source_name, target_name in [('Fire', 'CenturyFireSocket'), ('LeashLeft', 'CenturyLeashLeft'), ('LeashRight', 'CenturyLeashRight'), ('Seat', 'Seat')]:
        if target_name == 'Seat' and master.pose.bones.get('Seat'):
            continue
        definition = next((s for s in socket_defs if s.get('SocketName') == source_name), None)
        if definition is None:
            raise RuntimeError('SOCKET_MISSING: ' + dragon_id + ' ' + source_name)
        bone = definition['BoneName']
        relative = definition.get('RelativeLocation', {}).get('RelativeLocation', {})
        position = Vector(tuple(float(relative.get(k, 0)) for k in ['X', 'Y', 'Z']))
        socket = bpy.data.objects.new(target_name, None)
        scene.collection.objects.link(socket)
        socket.parent = master
        socket.parent_type = 'BONE'
        socket.parent_bone = bone
        socket.matrix_world = master.matrix_world @ master.pose.bones[bone].matrix @ Matrix.Translation(position)
        report['sockets'].append({'node': target_name, 'bone': bone, 'sourceTranslationCm': list(position)})
    bpy.ops.object.select_all(action='DESELECT')
    master.select_set(True)
    bpy.context.view_layer.objects.active = master
    psas = {p.stem: p for p in (source / 'Animations_PSA/Game/Characters/Dragons' / dragon_id).rglob('*.psa')}
    suffixes = ['Flight_Base', 'Flight_Base_L', 'Flight_Base_R', 'Flight_Base_U', 'Flight_Base_D', 'Flight_Fast',
                'Flight_BoostLoop', 'Flight_Dive', 'Flight_Hovering', 'Dodge_L', 'Dodge_R',
                'Shoot_FlameThrower', 'Shoot_FlameThrowerLoop', 'Shoot_FlameThrowerEnd', 'TPOSE_Closed']
    for suffix in suffixes:
        target = dragon_id + '_' + suffix
        actual = target
        if dragon_id == 'D09':
            actual = {'Flight_Base_L': 'D09_Flight_Base_L3', 'Flight_BoostLoop': 'D09_Flight_Fast'}.get(suffix, actual)
        if dragon_id in ['D02', 'D09']:
            actual = actual.replace('FlameThrower', 'Flame')
        if suffix == 'TPOSE_Closed' and actual not in psas:
            actual = next(n for n in psas if 'tpose' in n.lower() and 'leash' not in n.lower())
        if actual not in psas:
            raise RuntimeError('ANIMATION_MISSING: ' + actual)
        if actual not in bpy.data.actions:
            bpy.ops.psa.import_all(filepath=str(psas[actual]))
        action = bpy.data.actions[actual].copy()
        action.name = target + '_export'
        action.use_fake_user = True
        timing = psa_timing(psas[actual])
        start, end = action.frame_range
        # PSA 导入器对 D09 的非整数源帧率未保持秒数，按源时长统一到 30 fps。
        for curve in action.fcurves:
            for modifier in list(curve.modifiers):
                curve.modifiers.remove(modifier)
            if end > start:
                scale = timing['durationSeconds'] * 30 / (end - start)
                for key in curve.keyframe_points:
                    key.co.x = (key.co.x - start) * scale
                    key.handle_left.x = (key.handle_left.x - start) * scale
                    key.handle_right.x = (key.handle_right.x - start) * scale
            elif curve.keyframe_points:
                curve.keyframe_points.insert(timing['durationSeconds'] * 30, curve.keyframe_points[0].co.y)
            curve.update()
        master.animation_data_create()
        master.animation_data.action = None
        track = master.animation_data.nla_tracks.new()
        track.name = target
        strip = track.strips.new(target, 0, action)
        strip.action_frame_start, strip.action_frame_end = action.frame_range
        track.mute = True
        report['clips'][target] = {'source': str(psas[actual].relative_to(source)), 'sha256': hashlib.sha256(psas[actual].read_bytes()).hexdigest(), **timing}
    master.animation_data.action = None
    scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='SELECT')
    target = output / (dragon_id + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_skins=True, export_yup=True, export_apply=False, export_leaf_bone=False,
        export_nla_strips=True, export_anim_single_armature=False)
    # UE 的身体/羽毛材质使用 alpha test；保留毛发镂空而不是不透明卡片。
    data = target.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    for material in document.get('materials', []):
        material.update(alphaMode='MASK', alphaCutoff=.3333, doubleSided=True)
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20 + json_length:]
    target.write_bytes(struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(tail)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
    report['bytes'] = target.stat().st_size
    report['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    (output / (dragon_id + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('EXPORTED', dragon_id, report['bytes'], flush=True)
