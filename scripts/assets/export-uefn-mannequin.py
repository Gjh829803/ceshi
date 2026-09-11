"""Blender: --background --python this.py -- input.fbx output.glb; retain embedded materials."""
import sys
from pathlib import Path
import bpy

source, output = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(Path(source).resolve()))
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        obj.animation_data_clear()
        obj.data.pose_position = 'REST'
bpy.ops.export_scene.gltf(filepath=str(Path(output).resolve()), export_format='GLB',
                          export_animations=False, export_yup=True)
