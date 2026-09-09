# 单人皮划艇

资产库搜索“皮划艇”，选择“单人皮划艇”并点击“前往资产”。
艇停在综合园区水域的低码头旁，位置约为 `[205, -1.93, -124]` 米，
码头通过缓坡与西岸连通。F 上下艇，T 切换第三人称、第一人称和越肩视角。
W 交替划桨，S 倒划，A / D 单侧扫桨，Space 压桨制动。
松键保留惯性并受水阻减速；Shift 不提供额外动力。

模型采用红色狭长艇身、开放座舱与双头桨，保留现有 Source101 人物。
艇长 4.4 m、宽 0.8 m。双手通过人物动画内的两段骨骼求解握住桨杆，
腿向前伸入座舱。桨叶入水时才产生划桨动力和局部水纹，船尾随速度显示尾流。
水纹是轻量视觉反馈，不是流体求解。

浮力使用四个船体采样点、105 kg 总质量、0.23 m³ 最大排水量、
1000 kg/m³ 水密度和 5.5 /s 垂直阻尼。平衡吃水约 0.16 m。
这组参数可从 SDK 的 `training.KAYAK_WATER` 读取。
固定时钟积分重力、浮力、划桨脉冲和转向惯性；没有直接将船体锁到水面高度。
搁浅时不提供划桨动力，码头和岸边使用现有 Rapier 碰撞。
未实现波浪、水流、翻艇或动态流体。

源码：

- [模型](../examples/three-creator/sdk-capabilities/kayak-model.ts)
- [默认驾驶参数](../examples/three-creator/sdk-capabilities/kayak.ts)
- [SDK 物理](../packages/three-world/src/training/kayak.ts)
- [SDK 桨和水纹显示](../packages/three-world/src/training/kayak-visual.ts)
- [物理与真实骨架测试](../packages/three-world/src/training/kayak.test.ts)
- [浏览器键盘验证](../scripts/three-creator/kayak-browser-smoke.ts)

导出 `pnpm exec tsx scripts/three-creator/export-kayak.ts` 会更新
`assets/three-creator/training/vehicles/kayak.glb` 及 `training.kayak` 的目录哈希。
SDK 修改后执行 `pnpm build` 并重启预览服务。
默认 `pnpm dev` 使用 5175；本次皮划艇独立预览使用
`pnpm dev -- examples/three-creator/sdk-capabilities 5177`。

浏览器验证输出到 `outputs/kayak/browser/`，包含纯画面录像、各视角截图、
实际运行时字节 SHA-256 和键盘操作前后状态。
`world.training!.snapshot().vehicleDynamics` 中的 `kayak` 包含划桨相位、船体与桨叶浸入比例、
水面高度（m）、偏航速度（rad/s）和浮力加速度 `buoyancy`（m/s²）。
