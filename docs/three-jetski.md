# 水上摩托 / Jet Ski

`vehicle.jetski` 已加入默认训练场、资产库与载具调试面板。启动 `pnpm dev`，
在资产库搜索“水上摩托”，选择“前往资产”，按 F 驾驶。
训练场实例为 `jetski`，默认位置 `[220, -1.98, -145]` 米，位于水域实验场。

外形参考用户提供的图片，以项目要求的简化几何制作灰黑 V 形船体、绿色识别面、
窄跨坐座垫、左右脚踏和独立车把。驾驶者沿用 `humanoid.uefn-mannequin`，保持原模型、
骨骼长度与缩放。座位、双手、双脚、两侧入口、驾驶观察点、进水口和喷口均有命名锚点。

| 输入 | 行为 |
| --- | --- |
| W | 喷射推进 |
| S | 先制动，再低速倒船 |
| A / D | 车把与尾喷口转向；有推进时转向强，松油后减弱 |
| Shift | 加速，提高前进速度上限 |
| Space | 水阻制动 |
| F | 上下车，沿用 SDK 的安全退出和速度限制 |
| T | 第三人称、第一人称、肩后视角循环切换 |

[规格](../packages/preset-content/src/vehicles/jetski/spec.ts)采用 23 m/s 常规限速、
29 m/s 加速限速、5 m/s 倒船限速、6.5 m/s² 推进和 8 m/s² 制动。
松油后保留惯性并受水阻减速，空载继续浮动；静止无推进时不会原地旋转。
离水、悬空或搁浅时没有喷射推进力，船体使用现有 Rapier 碰撞世界检查岸边和障碍。

[运行时](../packages/three-world/src/humanoid-runtime/motion-families/surface-vessel/jetski.ts)使用 `boat` 家族入口和
`jetski` 专用运动分支。四处水域采样、浸没率、330 kg 质量和最大 0.70 m³ 排水量
控制浮力；高速时加入有限滑行升力、抬头和转弯侧倾。参数为项目调校值。

水花只由实际接受的水上位移产生。速度和转向提高喷溅强度，船身两侧和尾部喷出水滴，
水面留下展开的泡沫尾流。喷溅出生点保存在世界坐标中，停止后约两秒消散；碰撞阻挡、
暂停和重复渲染不会凭空累积水花。[渲染采样](../packages/three-world/src/humanoid-runtime/jetski-visual.ts)
使用有上限的实例池，由 SDK 的同一个时钟取样并在释放时清理。
这是简化的水面浮力和喷溅反馈，不包含波浪流体、燃油、损伤或多人乘坐。

[人物与物理测试](../packages/three-world/src/humanoid-runtime/jetski.test.ts)覆盖水面浮动、
加速、倒船、制动、左右转向、墙体和载具阻挡、陆地与空中无推进、空载、复位、
粒子坐标与生命周期。零时间进入及左右满舵时，原人物手脚与控制锚点偏差小于 2 mm，
检查了蒙皮顶点与车身的净空。脚踏顶面为 0.2505 m，实测脚底最低点约 0.2544 m。

修改[模型](../packages/preset-content/src/vehicles/jetski/model.ts)后运行
`node node_modules/tsx/dist/cli.mjs packages/creator-host/scripts/assets/export-jetski.ts`，
重新生成 [GLB](../assets/three-creator/presets/vehicles/jetski.glb) 和资产目录。
运行 `pnpm build` 重建 SDK，重启预览加载新字节。

[浏览器验收](../packages/creator-host/scripts/smoke/jetski-browser-smoke.ts)从训练场资产库入口操作，
保存真实按键视频、视角截图、诊断和运行时字节哈希。
[独立水域](../examples/three-creator/jetski-driving/main.ts)通过资产目录加载同一 GLB，
[输入计划](../examples/three-creator/jetski-driving/episode.json)用于 Creator 实录；
[Episode 路线测试](../packages/episode-pipeline/tests/planning/vehicle-route.test.ts)验证同一控制合约。
本次实际构建字节、Creator 交付与 Episode 消费记录见 `.codex-tmp/jetski/verification.md`。
