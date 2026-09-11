# 太空类

`mode: 'spacecraft'` 只分发到本目录。复用主世界 Rapier、固定物理步、人物上下船、驾驶动画与相机，不运行 Babylon/Havok 或第二个物理时钟。模型为普通 Three 几何。

`VehicleSpec.spaceFlight` 选择 `SPACE_FLIGHT_PRESETS.shuttle` 或 `saucer`，再配置固定质量 `massKilograms`（kg）、局部 XYZ 推力 N、倒推 N 和力矩 N·m。每个实例深拷贝配置，独立保存角速度、驾驶模式和对接状态。重置恢复其配置初值。飞碟 X/Z 碰撞半径必须相同，使用圆柱碰撞形状和圆盘惯量。

推力在船体坐标计算后转到世界坐标，Rapier 积分线速度、角速度并处理碰撞。世界默认重力对太空载具关闭；可用 `gravity` 配置中心引力（m³/s²），中心球体内用连续的均匀球引力。它不会创建天体几何或天体碰撞。

辅助模式根据速度误差要求推力／力矩；`speed` 是每轴目标速度，`grip` 是辅助平移响应，`steer` 是目标角速度。惯性模式直接控制喷口，不设硬限速或空气阻尼。两种模式的 Shift 都使用反推制动，`brakeDamping` 调整其速度反馈。所有控制均受推力和力矩限制。

太空类不使用燃料系统：质量固定，推进、转向、制动和对接可持续使用，没有燃料计量、耗尽限制或补给动作。穿梭机质量 2160 kg、飞碟 8450 kg，保留之前初始状态的操控响应。

主项目操作：W/S 前后推进，A 左转、D 右转，←/→ 侧移，↑/↓ 俯仰，Space/Ctrl 升降，Q/E 横滚，Shift 制动，F 上下船，T 依次第三人称／人物第一人称／越肩。鼠标只控制观察。第一人称使用主项目驾驶员眼点，越肩和第三人称复用公共相机。

通过现有 `HumanoidRuntime.command`（及 SDK 命令通道）操作当前乘坐的船：

```ts
runtime.command({type:'space.set-drive-mode', mode:'inertial'});
runtime.command({type:'space.dock', portId:'home'});
runtime.command({type:'space.dock', portId:null}); // 取消或解除
```

泊位在 `spaceFlight.dockingPorts` 中声明世界坐标和单位四元数。自动对接只处理静止泊位，沿直接接近方向使用本船推力；没有自动避障规划。碰撞仍有效。到达位置 0.15 m、线速 0.08 m/s、姿态 0.04 rad、角速 0.05 rad/s 的范围并保持 0.5 s 后，在实际到达位置锁定刚体；不瞬移到目标。手动驾驶取消／解除对接，接近超时 120 s 或驾驶员离船则取消。泊位需由场景作者提供可通行空间；不能把障碍物内的坐标当成合法泊位。

`spaceTelemetry(vehicle)` 和 `runtime.snapshot().vehicles[].spaceFlight` 提供只读副本，包括质量、世界推力和角速度、驾驶模式、泊位及对接状态。只查询不会推进模拟。Creator 和 Episode 使用同一配置、动作、物理及相机契约；命令遵守原有录制期间的外部修改限制。

主项目模型入口为 `shared/preset-content/space-model.ts`，配置为 `shared/preset-content/config.ts` 的 `space`（轻型穿梭机）和 `survey-space`（星环飞碟）。保留实例 ID 以兼容原有场地与资产目录。当前模型按 Source101 骨架、UEFN 可见蒙皮的驾驶姿态校准；新人物体型需重新校准座椅和接触面。

场景菜单的“太空 · 飞行训练场”（`space-training`）是独立地图，含两船停靠平台、六自由度门框通道和实体碰撞练习区。太空背景无大气雾；人物在平台上下船。入口 `http://127.0.0.1:5296/?map=space-training`，沿用同一主项目会话与输入映射。
