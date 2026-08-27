# ADR-0004：新场景采用 Plan-first 创作

- 状态：Accepted
- 日期：2026-08-15

## 决策

新的室外场景在编写白膜几何前，必须先提交一个 `OutdoorWorldSpec`，并由 Codex 内置图片生成能力制作两张参考资产：严格正交俯视的 World Plan 和玩家进入视角的 Opening Shot。

白膜实现完成后，SDK 从真实地形派生 Top-down 与 Height/Slope 工件，并复现 Opening Shot 进行对比。图片只表达规划意图；位置、碰撞、高度、坡度、可通行性和玩法结果仍以结构化 WorldSpec 与编译后的白膜运行时为准。

## 原因

- 用户的一句话或单张透视图没有定义完整世界，必须显式记录 Agent 的推断。
- 只看首帧无法区分镜头错误、拓扑错误和美术差异。
- 世界模型、Runtime Director 和 Coding Agent 都需要稳定 Feature/Entity ID，而不是依赖不可追踪的图片理解。
- 坡度与导航属于确定性模拟，不能由图片生成模型猜测。

## 结果

- 新场景使用 `defineOutdoorWorldSpec` 和 `definePlannedOutdoorScene`。
- 规划信息区分 `user-explicit`、`reference-visible`、`planner-inferred` 和 `planner-optional`。
- 两张 imagegen 图片进入项目版本管理，URI 与提示词由 WorldSpec 记录。
- `plan:scene` 导出结构化工件和图片哈希；`plan:scene:check` 检查漂移。
- 旧 `defineOutdoorScene` 暂时保留用于回归样例，但不再是新场景推荐入口。

## 不采用的方案

- 直接让 Agent 从提示词写几何：缺少完整世界和证据追踪。
- 只生成一张进入视角：无法表达背面拓扑、路线和区域关系。
- 让图片模型同时生成高度/坡度图：视觉上合理不等于物理上可行走。
