# 单人观景潜艇

驾驶模式与类型均为 `submarine`，封闭舱内坐姿为 `characterPose: 'submarine'`。
`bodyPhysics.kind: 'submersible'` 选择现有压载浮力与推进模型。

资产库搜索“单人观景潜艇”，点击“前往资产”。潜艇默认浮在综合园区
`[205, -1.88, -105]` 米的深水泊位，低码头通过缓坡与西岸相连。
保留原探索潜艇，新资产 ID 为 `vehicle.observation-sub`。

- F：水面登艇、离艇；水下舱门保持关闭，提示先上浮。
- W / S：前进、倒航；反向输入先抵消已有惯性。
- A / D：左右转向，静止时也能利用推进器转向。
- Ctrl：注入压载水并向下推进。
- Space：向上推进，接近水面后自动排出压载水恢复漂浮。
- Q / E：有限横滚；松键自动扶正。
- Shift：减速；T：第三人称、第一人称、越肩视角。

下潜后松键，满压载状态保持近似中性浮力，水阻逐渐消除升降速度。
初始和停泊状态的正浮力由排水量与质量计算，不直接锁定水面高度。
四个水平采样点决定水域覆盖比例。浮力计算参数为干重 720 kg、
最大排水量 2.4 m³、水密度 1000 kg/m³，满压载总质量为 2400 kg。
压载响应 1.5 /s；默认升降阻尼 2.6 /s、升降推进加速度 4.5 m/s²；
前进上限 5 m/s，倒航上限 2.2 m/s。

透明球舱、黄色压载舱、双推进器和底部滑橇采用简化几何。
沿用 Source101 人物及同一个角色动画控制器，入座首帧即使用校准坐姿。
推进器工作时，靠近水面显示水花；水下显示上升气泡。
粒子由 SDK 固定时钟生成，记录世界坐标；渲染只采样，不额外推进模拟。
岸壁、码头、海底和水下顶棚沿用真实碰撞查询。
当前不包含流体求解、压力损伤或波浪。

实现与验证：

- [模型](../shared/preset-content/submersible-model.ts)
- [驾驶配置](../shared/preset-content/submersible.ts)
- [浮力、压载及推进](../packages/three-world/src/humanoid-runtime/submersible.ts)
- [推进器和水粒子](../packages/three-world/src/humanoid-runtime/submersible-visual.ts)
- [物理、重置、舱门及真实人物验证](../packages/three-world/src/humanoid-runtime/submersible.test.ts)
- [浏览器按键录像脚本](../scripts/three-creator/submersible-browser-smoke.ts)
- [Episode 路线验证](../scripts/three-episode/vehicle-route.test.ts)

运行 `pnpm exec tsx scripts/three-creator/export-submersible.ts` 更新 GLB 和目录哈希。
SDK 改动后执行 `pnpm build` 并重启预览。
在仓库根目录执行 `pnpm dev`，打开终端显示的 React 编辑器地址（默认 5178）。
验证结果位于 `outputs/submersible/`；浏览器报告包含实际加载的运行时字节哈希。
`world.training!.snapshot().vehicleDynamics[].submersible` 提供压载比例、质量、
浸入比例、浮力加速度、原点深度、水花和气泡数量等诊断数据。
