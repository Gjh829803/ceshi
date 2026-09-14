"""从已有 GLB 离线渲染飞龙资产库缩略图，不修改模型或运行时。"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--ids', default='')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output = Path(args.source).resolve(), Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
records = json.loads((source / 'variants.json').read_text(encoding='utf-8'))
for record in records:
    if args.ids and record['id'] not in args.ids.split(','):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source / record['file']))
    scene = bpy.context.scene
    # 使用各模型自己的基础飞行动作，不套用其他龙的骨骼姿势。
    for obj in list(scene.objects):
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = True
            action = next((a for a in bpy.data.actions if record['id'] + '_Flight_Base' in a.name and not any(tag in a.name for tag in ['Base_L', 'Base_R', 'Base_U', 'Base_D'])), None)
            if action and obj.type == 'ARMATURE':
                obj.animation_data.action = action
                if hasattr(action, 'slots') and len(action.slots):
                    obj.animation_data.action_slot = action.slots[0]
    scene.frame_set(8)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type == 'MESH':
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            points.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
            evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError('No mesh: ' + record['id'])
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center, span = (low + high) / 2, (high - low).length
    camera_data = bpy.data.cameras.new('thumbnail-camera')
    camera = bpy.data.objects.new('thumbnail-camera', camera_data)
    scene.collection.objects.link(camera)
    # GLTF +Z 朝前在 Blender 中是 -Y；侧前方能同时看到头、翅膀与尾巴。
    direction = Vector((1.25, -1.6, .95)).normalized()
    camera.location = center + direction * span * 2
    camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    right = camera.rotation_euler.to_matrix() @ Vector((1, 0, 0))
    up = camera.rotation_euler.to_matrix() @ Vector((0, 1, 0))
    xs, ys = [p.dot(right) for p in points], [p.dot(up) for p in points]
    camera.location += right * ((min(xs) + max(xs)) / 2 - center.dot(right)) + up * ((min(ys) + max(ys)) / 2 - center.dot(up))
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * 4 / 3) * 1.10
    camera_data.clip_end = max(1000, span * 10)
    scene.camera = camera
    scene.world = bpy.data.worlds.new('thumbnail-world')
    scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.55, .65, .72, 1)
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[1].default_value = .65
    for name, offset, energy in [('key', (1, -2, 3), 5), ('fill', (-2, -1, 1), 2), ('rim', (0, 2, 2), 3)]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = span * span * energy * 2
        light_data.shape = 'DISK'
        light_data.size = span
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = center + Vector(offset).normalized() * span
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 320, 240
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = .3
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(output / (record['id'] + '.png'))
    bpy.ops.render.render(write_still=True)
    print('THUMBNAIL_READY', record['id'], flush=True)
