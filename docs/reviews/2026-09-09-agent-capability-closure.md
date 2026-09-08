# Agent 能力与反馈闭环修复

本轮接续 `f2125eb5` 的[能力对照审查](2026-09-08-agent-playground-capability-audit.md)，六项发现均已处理；源码、指导、执行与本地验收同步更新。继续使用两个 package，无新生产阶段或通用场景框架。

| 发现 | 已实现 |
| --- | --- |
| SDK 与 Host 参数范围不一致 | 共享 cameraDistanceMeters schema，合法范围统一为 `(0,100]` |
| 人物相机显式参数未生效 | 相机 owner 分别初始化人物/载具默认值，再独立应用显式 override；FOV 80/55 都实际生效，距离不再决定其他参数是否生效 |
| 输入来源缺失 | 按需 controlState 提供 override、来源、lastApplied 和模拟时间，附 livePaused/clockOwner；release/reset 清旧样本 |
| Episode 无片段内上下车与人称切换 | 在已有 actionGoals 加 mount/view；真实接近、资格判断、停车下车与 transition 完成，普通主体也可切视角；两条路线同步游标 |
| 自定义移动无法录制 | MovementDefinition.episode 返回普通输入；能力明确报告支持/未支持，ground/free 起点仍按真实碰撞体检查，时钟与物理仍归 SDK |
| 镜头丰富度成为生产门禁 | 自动镜头/跳跃表现改为 advisoryDiagnostics；明确要求的动作与实际运行/媒体错误仍如实判定 |

另外让 Playground 复用 SDK 车轮辅助，custom-vehicle 示例补齐可选 wheel rig 接线，消除重复算法。未复制 UI、另建模型控制器或自动猜测任意模型的骨骼/车轮。

## 运行边界

- Boarding 是按目标的 `inspectBoarding(id)` 查询，World describe 和 Episode 使用同一判定；不把全车 safeSpawn 放入每帧快照。
- Episode 上车不会调用准备性 `approach` 传送；下车先制动到实际停止，再等控制切换结束。无法安全完成的飞行器仍会给出真实超时。
- 自定义 movement input adapter 为同步纯计算，可读实际主体、目标、gait、控制方向、模拟 tick 和 travel/stop 模式。view hold 也调用 stop 模式，支持作者自己的浮力/制动逻辑。
- `startSupport:'free'` 允许无地面支撑的起点，不允许真实体积/表面穿插。Rapier TriMesh 接缝可能返回零接触深度，因此 free 路径补了内缩胶囊相交判据，保留表面接触且不改变 ground 路径。
- `exportProfile().camera` 保留显式 partial overrides；未写的字段继续使用对应主体默认值。人物第三人称默认 58/7/.2、车辆默认 55/8/.25 保留。
- 录制版本更新为 player-capture-5、action-capture-2，旧策略产物不会被错误当成新结果复用。原历史 custom adapter 保留，作者显式 adapter 优先。

## 验证

- Contract 246 项、resource-heavy 588 项通过；随后新增 free 起点边界用例，最终 Episode/physics 57 项补测通过。相关文档/发现工具 15 项、行动控制器 15 项通过。
- 相关 Node 检查 140 项通过；typecheck、workspace boundaries、67 文件 test census、runtime prebuild、文档链接与 diff 检查通过。
- 独立复审复现并确认修复了垂直自定义移动丢失 run、动作后自定义路线计时不恢复的问题；最终核查 free 起点、输入纯度、默认参数与状态切换，没有剩余确定 P1/P2。
- 最终 runtimeHash：`42a68b41945df5fde2eb71d8a1f965cf2a3101c3b62bf022b2819814032cf985`。

### 快速本地 case

预设人物 + 自制摩托：Creator 约 9 秒真实输入自检 → submit 交付归档 → Episode source 适配 → MCP probe/计划提交 → 独立 10 秒、240 帧、24 fps 录制。

实际完成 enter、first-person、exit、third-person 四个目标，经过骑行与停车；输入 trace、命令与状态变化都保留。重复 PNG 和 reset 首帧一致，浏览器无错误。

证据：`.codex-tmp/parity-case/run-1788888590034/result.json`、`timeline.json`、`episode.mp4`。

另用同一 runtime 做 3 秒真实浏览器自定义飞行验证：无隐藏人形主体，从 Y=3 升至约 5.73，完成第一人称 view hold；输入通过新 adapter，重复帧与 reset 一致。

证据：`.codex-tmp/parity-flight/run-1788888585260/result.json`。

这些是本地功能验收，不是新一轮模型生成质量评测、六段正式生产或远端 CI。未调用云服务或视频供应商，测试进程结束后关闭浏览器与服务；生成媒体留在忽略目录。
