"""Century PSA timing and UE translation retargeting shared by asset preparation."""
import configparser
import hashlib
import struct
from mathutils import Vector

def chunks(data):
    offset, result = 0, {}
    while offset < len(data):
        key, flags, size, count = struct.unpack_from('<20s3i', data, offset)
        offset += 32
        if size < 0 or count < 0 or offset + size * count > len(data):
            raise RuntimeError('INVALID_SKELETAL_CHUNK')
        result[key.rstrip(b'\0').decode()] = (offset, size, count)
        offset += size * count
    return result


def read_bones(data, chunk):
    start, size, count = chunks(data)[chunk]
    return [struct.unpack_from('<64s3i4f3ff3f', data, start + i * size) for i in range(count)]


def retarget_psa(path, body_psk, skeleton, dragon_id, source, output):
    # PSA 插件只读取 RemoveTracks，忽略 UE 的 BoneTree 位移策略。
    # 在临时副本中按目标网格的绑定姿态修正位移，旋转和原始文件保持不变。
    data = bytearray(path.read_bytes())
    bones = read_bones(data, 'BONENAMES')
    modes = [b['TranslationRetargetingMode'].split('::')[-1] for b in skeleton['BoneTree']]
    if len(modes) != len(bones):
        raise RuntimeError('RETARGET_BONE_COUNT_MISMATCH: ' + str(path))
    names = [b[0].rstrip(b'\0').decode() for b in bones]
    reference = next((source / 'Animations_PSA/Game/Characters/Dragons' / dragon_id).rglob(dragon_id + '_Flight_Hovering.psa'))
    reference_names = [b[0].rstrip(b'\0').decode() for b in read_bones(reference.read_bytes(), 'BONENAMES')]
    if names != reference_names:
        raise RuntimeError('RETARGET_CLIP_BONE_ORDER_MISMATCH: ' + str(path))
    config_path = path.with_suffix('.config')
    reference_config = reference.with_suffix('.config')
    config = configparser.ConfigParser(allow_no_value=True)
    config.optionxform = str
    config.read(reference_config, encoding='utf-8-sig')
    # UModel 的具名列表与骨架索引逐项交叉验证，避免把网格索引当成 Skeleton 索引。
    animation_names = set(config['UseTranslationBoneNames']) if config.has_section('UseTranslationBoneNames') else None
    if animation_names is not None and animation_names != {n for n, mode in zip(names, modes) if mode != 'Skeleton'}:
        raise RuntimeError('RETARGET_BONE_ORDER_MISMATCH: ' + str(path))
    target_bones = {b[0].rstrip(b'\0').decode(): b for b in read_bones(body_psk.read_bytes(), 'REFSKELT')}
    start, size, count = chunks(data)['ANIMKEYS']
    if count % len(bones):
        raise RuntimeError('RETARGET_FRAME_COUNT_MISMATCH: ' + str(path))
    corrected = []
    for index, (name, mode, bone) in enumerate(zip(names, modes, bones)):
        if mode not in ['Animation', 'Skeleton', 'AnimationScaled']:
            raise RuntimeError('RETARGET_MODE_UNSUPPORTED: ' + mode)
        if name not in target_bones or mode == 'Animation':
            continue
        target_position = target_bones[name][8:11]
        source_length = Vector(bone[8:11]).length
        scale = Vector(target_position).length / source_length if source_length > 1e-6 else 1
        for frame in range(count // len(bones)):
            offset = start + (frame * len(bones) + index) * size
            translation = target_position if mode == 'Skeleton' else tuple(v * scale for v in struct.unpack_from('<3f', data, offset))
            struct.pack_into('<3f', data, offset, *translation)
        corrected.append({'bone': name, 'mode': mode, 'targetTranslationCm': list(target_position), 'translationScale': scale if mode == 'AnimationScaled' else None})
    temporary = output / '_retargeted' / dragon_id / path.name
    temporary.parent.mkdir(parents=True, exist_ok=True)
    temporary.write_bytes(data)
    if config_path.exists():
        temporary.with_suffix('.config').write_bytes(config_path.read_bytes())
    return temporary, {'configSha256': hashlib.sha256(config_path.read_bytes()).hexdigest() if config_path.exists() else None,
                       'boneOrderReference': str(reference.relative_to(source)), 'configBoneOrderVerified': animation_names is not None, 'bones': corrected}


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
