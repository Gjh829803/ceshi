# 元数据维度

| 文件 / 字段 | 意义与例子 | 注意事项 |
|---|---|---|
| asset_id / asset_version | 稳定身份与 SemVer 内容版本 | 文件夹和显示名称变化不改 ID |
| browse_group | characters / animals / vehicles / robots / fantastical / objects | 唯一归属；不继续用深层文件夹表达全部分类 |
| semantic_type / subtypes | animal.mammal.equine.horse | 用于理解、搜索，不是兼容协议 |
| morphology.architecture | skinned_articulated / rigid_articulated / rigid_single / soft_body / composite / swarm | unknown 如实记录 |
| morphology.profiles | biped / quadruped / winged / tracked 等 | 四足不是通用骨架 |
| morphology.appendages | role + count，例如 wing:2 | 支持复合生物，不预设固定肢体数 |
| morphology.stance | upright / horizontal / suspended 等 | 默认姿态，非运行状态 |
| scale | 单位、上轴、正向、尺寸、源变换 | 没实测的尺寸保持 null；预览缩放不等于正式规范化 |
| movement_modes.environment | ground / water_surface / underwater / air 等 | 描述在哪里 |
| movement_modes.support | foot_contact / buoyancy / aerodynamic_lift 等 | 描述支撑机制 |
| movement_modes.propulsion | legged_step / wheel_drive / flapping 等 | 描述推进方式 |
| degrees_of_freedom | path_1d / surface_2d / planar_2d_yaw / full_3d | 决定控制接口范围 |
| gaits | walk / trot / run / gallop 等 | 步态不是独立运动环境 |
| movement_transitions | from / to / transition / stage | 会飞与会走不能证明能起飞和落地 |
| control | archetype + profile + stage | 速度、转向、加速度放 profile，算法由宿主实现 |
| interactions | action + contract + stage | 需明确角色、锚点、控制权和退出恢复 |
| capability stage | planned / assets_ready / integrated / verified / deprecated | verified 需要环境、版本和案例证据 |
| resources | path / hash / byte_length / format / role | 文件在库内；骨骼和蒙皮可留 GLB；逻辑拆分不强制拆文件 |
| bindings | 语义骨骼映射、动作映射、挂点 | 保留真实名称，未知不猜 |
| provenance | 来源、转换、许可及用途权利 | 未知授权保持 unknown |
| validation | structure / format / visual / runtime | 各层验证相互独立 |

精确词表见 taxonomy/*.json；结构规则见 schemas/*.json。实例速度、当前动作、血量和占用座位不属于资产元数据。
