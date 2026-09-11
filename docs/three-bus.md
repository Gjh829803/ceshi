# 复古小巴

在综合园区的资产库搜索“巴士”，选择“复古小巴”并点击“前往资产”。
靠近后按 F 上下车，T 循环切换第三人称、第一人称和越肩视角。
W 加油，S 先制动再倒车，A / D 转向，Space 刹车。Shift 不增加动力。
雪橇和双板继续使用相同的 F / T；它们的 S 是制动，不是发动机倒车。

小巴采用 3.3 m 轴距、缓慢油门响应和随速度收小的前轮转角。
起步加速度为 2.1 m/s²，前进限速 22 m/s，倒车限速 2.5 m/s，
制动减速度 3.8 m/s²，松油减速度 0.55 m/s²。
这是游戏用的单轨转向近似，未模拟变速箱、完整悬架或翻车。
默认驾驶位使用现有 Source101 人物；地板顶面 0.52 m，测得人物最低点约 0.574 m。

资产 ID 为 `vehicle.bus`。外形和参数分别位于
[bus-model.ts](../packages/preset-content/src/vehicles/bus/model.ts) 与
[bus.ts](../packages/preset-content/src/vehicles/bus/spec.ts)，运动实现位于
[SDK bus.ts](../packages/three-world/src/humanoid-runtime/motion-families/ground-vehicle/bus.ts)。
模型仅包含载具，人物、相机、输入及碰撞均沿用 SDK 的现有所有者。

修改模型后运行 `pnpm exec tsx packages/creator-host/scripts/assets/export-bus.ts` 更新
`assets/three-creator/presets/vehicles/bus.glb` 和资产目录中的哈希。
脚本只更新该资产，不重新导入其他载具。
运行 `pnpm build` 构建 `.codex-tmp/three-runtime/runtime/worldkit-three.js`，
并重新启动 `pnpm dev` 使训练预览加载最新源文件。

真实键盘验证脚本为
[bus-browser-smoke.ts](../packages/creator-host/scripts/smoke/bus-browser-smoke.ts)。
它验证资产库入口、F / T、前进、制动后倒车、转向、复位以及雪橇和双板操作，
将纯画面录像、各视角截图、运行时字节 SHA-256 和状态写入
`outputs/bus/browser/`。物理及人物净空测试在
[bus.test.ts](../packages/three-world/src/humanoid-runtime/bus.test.ts)，
Episode 路线和独立世界验证分别在
[vehicle-route.test.ts](../packages/episode-pipeline/tests/planning/vehicle-route.test.ts) 与
[training-families.test.ts](../packages/creator-host/tests/integration/vehicle-families.test.ts)。
