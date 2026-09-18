# 单桨木舟

资产库搜索“单桨木舟”，点击“前往资产”。木舟位于综合园区水域
`[205, -1.888, -140.5]` 米，旁边的低码头通过缓坡与西岸连接。
F 上下舟；T 切换第三人称、第一人称和越肩视角。

- W：连续单侧划桨，船头会逐渐偏转。
- S：倒划，先抵消前进惯性再后退。
- A / D：在回桨阶段换到对应侧，扫桨向左 / 右转向；静止时也可转向。
- Space：压桨入水减速；松键后保留惯性。Shift 不提供动力。

开放木质船体长 4.8 m、宽 1.2 m，配横座和一支单叶桨。
保留 Source101 人物，双手由原人物动画更新中的两段骨骼求解贴合桨柄。
座位和腿部姿态使用真实模型验证。

木舟使用 `mode: 'paddled_boat'` 划桨控制家族，`archetype: 'canoe'` 选择单桨模型与运动配置，
不增加独立时钟、相机或物理世界。总质量 165 kg，最大排水量 0.38 m³，
水密度 1000 kg/m³，垂直阻尼 6 /s，划桨周期 1.55 s。
四点采样浮力使船体平衡原点约高于水面 0.112 m。
前进上限 3.1 m/s、倒划上限 1.2 m/s、划桨峰值加速度 1.9 m/s²；
线性水阻 0.11 /s，速度二次阻力系数 0.11 /m。
这些参数通过 [驾驶配置](../packages/preset-content/src/vehicles/canoe/spec.ts) 和
SDK 的 `humanoid.CANOE_WATER` 导出。

桨叶浸水时才施加推进和偏航脉冲；出水回桨无推力。
水面显示轻量桨叶水纹和尾流。搁浅时不能划行，岸边和码头使用现有碰撞查询。
这是静水浮力与水阻近似，未模拟波浪、水流和翻艇。

相关实现：

- [木舟模型](../packages/preset-content/src/vehicles/canoe/model.ts)
- [浮力与单桨运动](../packages/three-world/src/humanoid-runtime/motion-families/surface-vessel/paddling.ts)
- [握桨与水面反馈](../packages/three-world/src/humanoid-runtime/kayak-visual.ts)
- [物理和真实骨架测试](../packages/three-world/src/humanoid-runtime/kayak.test.ts)
- [浏览器真实按键验证](../packages/creator-host/scripts/smoke/canoe-browser-smoke.ts)
- [Episode 路线输入测试](../packages/episode-pipeline/tests/planning/vehicle-route.test.ts)

修改模型后运行 `pnpm exec tsx packages/creator-host/scripts/assets/export-canoe.ts --output .codex-tmp/canoe.glb`，
只生成待入库的 GLB 和 `.intake.json` 转换记录；输出已存在时请改用新文件名。
按[入库流程](../asset-library/CONTRIBUTING.md)，使用 `asset-library/tools/ingest.mjs` 将候选模型
以稳定 ID `vehicle.canoe`、`--group vehicles` 和新的 `--version` 入库，审查并补齐原有
bindings、profiles、来源与验证记录，然后在仓库根运行 `pnpm content:sync` 和 `pnpm content:check`。

当前登记版本位于 `asset-library/subjects/vehicles/vehicle.canoe/0.1.0/`。
模型、挂点与参数的权威数据在主体中；包内 spec 读取生成快照。
导出器不会替换这个版本或自动更新目录，新版本完成绑定和验证后才用于交付。

SDK 修改后执行 `pnpm build` 并重启预览。
在仓库根目录执行 `pnpm dev`，打开终端显示的 React 编辑器地址（默认 5178）。
验证截图、纯画面操作录像及实际运行时 SHA-256 位于 `outputs/canoe/browser/`。
