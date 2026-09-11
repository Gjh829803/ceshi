# 独轮车

资产库中的 `vehicle.unicycle` 是陆地独轮车：单轮、黄色轮圈、车叉、鞍座和一对相反相位的踏板。
载具的 `mode`、`archetype` 与 `characterPose` 均为 `unicycle`；地图区域需允许 `unicycle`。
人物复用 `humanoid.uefn-mannequin`，同一实例完成步行、F 上车、骑行、F 下车和重置。

- W 前进；S 先制动，再倒骑；A / D 重心转向；Space 制动；Shift 提高限速。
- 行进时双臂随时间和转向调整平衡，双脚踩踏相位与碰撞后实际轮距同步。
- 松键减速，速度低于 0.12 m/s 且脚旁有可达地面时，约 0.38 秒放下左脚。
  身体向支撑侧下沉，保持骑乘状态；F 才离开载具。
- 再次推进先用约 0.52 秒将脚沿抬起轨迹收回踏板，完成后建立推进。
- 撞墙或其他载具后不再虚转轮子；持续受阻超过 0.25 秒后撑地。
  松开推进键再按可重新起步。悬空或入水时不提供地面推进及撑地。

默认前进 4.2 m/s、加速限速 5.5 m/s、倒骑 1.8 m/s、推进加速度 2.2 m/s²、
松键减速度 2.8 m/s²、制动 4.5 m/s²。参数通过现有 profile 导出。
这是有辅助平衡的载具控制器；不模拟失衡摔倒和空中特技。

实现入口：[运动与状态](../packages/three-world/src/humanoid-runtime/motion-families/ground-vehicle/unicycle.ts)、
[原骨架腿部求解](../packages/three-world/src/humanoid-runtime/unicycle-rider.ts)、
[角色动画](../packages/three-world/src/humanoid-runtime/character.ts)、
[模型](../packages/preset-content/src/vehicles/unicycle/model.ts)、
[规格](../packages/preset-content/src/vehicles/unicycle/spec.ts)。
SDK 固定步进拥有运动、支撑与动作状态；显示插值只采样，Creator 和 Episode 共用同一执行路径。
`humanoid.vehicleDynamics[].unicycle` 返回阶段、落脚比例、轮相位和实际支撑点的副本。

重建资产使用 `packages/creator-host/scripts/assets/export-unicycle.ts`。
回归入口为 [SDK 测试](../packages/three-world/src/humanoid-runtime/unicycle.test.ts)、
[Episode 路线测试](../packages/episode-pipeline/tests/planning/vehicle-route.test.ts) 和
[浏览器真实输入录制](../packages/creator-host/scripts/smoke/unicycle-browser-smoke.ts)。
先运行 `pnpm dev`，再运行 `pnpm exec tsx packages/creator-host/scripts/smoke/unicycle-browser-smoke.ts http://127.0.0.1:5178`。
本地录制、关键帧和状态写入 `.codex-tmp/unicycle-browser/`。此预览使用 Vite 源码；
`pnpm build` 的运行时字节与哈希另存于 `.codex-tmp/three-runtime/`，这些产物不进入 Git。
