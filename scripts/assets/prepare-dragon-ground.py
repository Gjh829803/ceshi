"""导出各自原生骨架的地面姿态；保留来源，不跨龙套用旋转轨道。"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
from century_psa import retarget_psa, psa_timing

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
p.add_argument('--importer', required=True)
p.add_argument('--ids', default=','.join(f'D{i:02}' for i in range(1, 12)))
args = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output = Path(args.source), Path(args.output)
output.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, args.importer)
import io_scene_psk_psa
io_scene_psk_psa.register()

for dragon in args.ids.split(','):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    if dragon == 'D01':
        body = source / 'Sample_PSK/Game/Characters/Dragons/D01/Body/Body01/D01_Body01_Mesh.psk'
    else:
        body = next((source / 'MultiDragon/PSK/Game/Characters/Dragons' / dragon).rglob('*Naked.psk'))
    bpy.ops.psk.import_file(filepath=str(body), components='ALL')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.name = dragon
    arm.scale = (.01, .01, .01)
    bpy.context.view_layer.objects.active = arm
    skeleton_path = next((source / 'Analysis/Compact/Characters/Dragons' / dragon).glob('*Ocedar*Skeleton.json'))
    skeleton = next(e['data'] for e in json.loads(skeleton_path.read_text(encoding='utf-8-sig')) if e['class'] == 'Skeleton')
    psas = {f.stem: f for f in (source / 'Animations_PSA/Game/Characters/Dragons' / dragon).rglob('*.psa')}
    roles = {'Ground_Idle': 'Ground_Idle' if dragon == 'D02' else 'MM_IdleBase2' if dragon == 'D11' else 'MM_IdleBase1', 'Ground_ReferenceHover': 'Flight_Hovering'}
    if dragon == 'D02':
        roles.update(Ground_Landing='Ground_Landing', Ground_Takeoff='Ground_JumpStart')
    report = {'id': dragon, 'clips': {}}
    for role, suffix in roles.items():
        src = psas[dragon + '_' + suffix]
        temporary, retarget = retarget_psa(src, body, skeleton, dragon, source, output)
        bpy.ops.psa.import_all(filepath=str(temporary), should_use_config_file=True)
        action = bpy.data.actions[src.stem].copy()
        name = dragon + '_' + role
        action.name = name + '_export'
        timing = psa_timing(src)
        start, end = action.frame_range
        for curve in action.fcurves:
            for modifier in list(curve.modifiers):
                curve.modifiers.remove(modifier)
            for key in curve.keyframe_points:
                key.co.x = (key.co.x - start) * timing['durationSeconds'] * 30 / max(1, end-start)
                key.handle_left.x = key.handle_right.x = key.co.x
            if end == start:
                curve.keyframe_points.insert(timing['durationSeconds'] * 30, curve.keyframe_points[0].co.y)
            curve.update()
        arm.animation_data_create()
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        track.mute = True
        report['clips'][name] = {'source': str(src.relative_to(source)), 'sha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'retarget': retarget, **timing}
    arm.animation_data.action = None
    for bone in arm.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(output / (dragon+'.glb')), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_skins=True, export_yup=True, export_apply=False, export_leaf_bone=False,
        export_nla_strips=True, export_anim_single_armature=False)
    (output / (dragon+'.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('GROUND EXPORTED', dragon, flush=True)
