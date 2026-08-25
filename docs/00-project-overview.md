# 项目总览：我们正在做什么

> 本文是项目范围和已交付能力的权威入口；详细重构百分比、剩余任务、依赖和
> 验收里程碑统一记录在[重构总进度与 Backlog](18-refactor-progress-and-backlog.md)。
> 架构细节分散在其他文档中；当表述冲突时，以本文、已接受的 ADR 和真实
> Canonical Schema 为准。

## 1. 一句话定义

这是一个面向创作 Agent 的语义白膜游戏 SDK：上游可以走 Plan-first
场景创作链路，也可以直接交付 Canonical Authoring V4 JSON；SDK 把世界与
主体定义确定性编译成可运行、可观察、带物理的白膜世界，未来实时世界模型
再把白膜条件渲染成最终画面。

系统同时规划另一条运行时链路：Director LLM 可以理解用户在游玩过程中的指令，但只能通过 SDK 的受控命令和任务接口修改世界。

## 2. 四个角色与唯一世界真相

```text
创作期
用户文本/图片 → Planner → 冻结 WorldSpec/规划图 → Builder → 创作 SDK → 白膜运行时
                                                                  ↓
                                        白膜三视图 → Visual Bible → 视觉条件

运行期
用户指令 → Director LLM → Director SDK → 白膜运行时
玩家输入 ─────────────────────────→ 白膜运行时

渲染期
白膜运行时 → Render Bridge → 实时世界模型 → 最终画面
Director LLM → Render Directive SDK ────────────┘
```

| 角色 | 负责什么 | 不负责什么 | 当前状态 |
|---|---|---|---|
| Planner / Builder / Visual Bible | 分别定义世界、实现可版本化白膜、生成视觉条件 | 不跨越冻结边界，不参与每帧控制，不绕过 SDK 修改引擎 Adapter | 多 Agent Alpha 可用 |
| 白膜 World SDK | 世界构建、主体、镜头、运动、物理、动作和确定性状态 | 不生成最终高质量视觉 | 第一期 Alpha 可运行 |
| Director LLM + Director SDK | 运行时理解意图，并通过观察、命令、任务和回执受控改世界 | 不逐帧驱动刚体，不直接拿底层对象 | 仅完成方案设计 |
| 实时世界模型 | 根据白膜条件生成材质、光影、天气、风格和视觉细节 | 不决定位置、碰撞、导航、数量和玩法结果 | 尚未接入 |

白膜运行时是唯一世界真相。凡是影响位置、数量、碰撞、导航、遮挡、动作、关键轮廓或玩法结果的变化，都必须先在白膜世界提交。

## 3. 当前真正可运行的范围

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

> Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask、更多
> Constraint 与 P0.1 整体仍未完成。

> Simulation Take / Control Capture V1 已完成固定 Tick 时间线、五 Pass Babylon 捕获、
> Render Ready Receipt、原子 Bundle 和真实 Chromium Gate；统一 Validation 的
> Capture/Integrity V1 也已交付。完整 Replay/Resume、Placement/Physics/Composition
> Validation 接入与 Video Adapter 仍未完成。

> Route R1 Heightfield 已完成 Golden/Adversarial Fixture、双 Blocking Gate 与
> `pnpm verify:route-r1-heightfield`。R1b 静态平台切片也已通过真实 Babylon/Havok
> Probe；完整 M5 仍开放。

第一期 Alpha 已证明以下链路可以运行：

- 所有 Canonical 世界统一使用 AuthoringSpec V4 → NormalizedWorldIR V4 →
  ExecutionPlan V5；这条唯一当前链路保持严格 JSON、精确版本 Registry、Package
  局部 Primitive Subject Definition、Socket、自动 Capsule、Definition Hash 和
  Resource Lock。未发布的旧版本已删除，不提供兼容解析或字段别名。
- Placement Solver S1 已交付 Fixed/Solved Placement、Polygon Region、Polyline Route、
  Screen Region、八种关闭 Constraint、Required/Preferred、确定性 Report、CLI 和
  Browser/Havok 复验；海湾 Fixture 的 19 条约束已进入回归。
- 一个内置人形与两个共享 Package Definition 的四足代理可以同时生成；三个
  Subject 拥有独立 Havok Controller/状态，Browser Protocol V5 提供 Gameplay Command、
  固定输入、复位、查询 Snapshot 和截图。
- `worldkit` 支持校验、构建、运行、截图、Registry Discovery、独立 Definition
  校验、Subject Explain、Take validate/inspect/run、Capture validate/inspect，以及
  `verify capture|route|explain`；真实 Chromium 门禁覆盖碰撞、入水、两个自定义实例和五
  Pass 控制捕获。
- Route Task 8 可信 Node 链路把 Authoring V4 → NormalizedWorldIR V4 →
  ExecutionPlan V5 世界依次物化为最小正式
  WorldPackage Build Receipt、Validation Subject、Recast Graph/Path、真实
  Babylon/Havok `NullEngine` 固定 Tick Probe 和 Canonical Evidence/Report；Browser
  Protocol V5 通过 Route Summary、Path Receipt、Probe Receipt、Overlay 四个只读
  getter，页面不构图、不运行 Probe、不生产证据。
- Simulation Take V1 把 Control/Camera Keyframe 编译为 60 Hz 固定 Tick 与精确 Capture
  Schedule；Babylon 从同一 Render Ready 状态输出 Neutral、Depth、Semantic、Instance、
  Normal，Node 端以原子 Bundle 和多层 Hash 保存。
- Validation Capture/Integrity V1 用版本化 Profile 把 Bundle Integrity、Required Pass、
  Linear Depth 和 Package/Take/Session 归属转换成独立、严格、可哈希的 Report；
  Blocking Failure 一票否决，Required Metric 缺失为 `incomplete`。
- 项目自有、可再分发的 Golden Humanoid GLB 已通过内容 Hash、Rig Profile、
  Animation Set、Collider Profile 与 Host Asset Resolver 的完整 Canonical 链路；
  两个实例拥有独立 Skeleton、动作、Transform 和生命周期。
- Golden 人形的 `idle / walk / run / jump` 由固定 Tick 语义动作驱动，Snapshot
  直接暴露 `activeActionId`；真实 Chromium 门禁覆盖动作截图、墙体停止、实例隔离
  和 GLB 内存篡改后的 `SUBJECT_ASSET_HASH_MISMATCH`。
- 一个第三人称人形主体：WASD 镜头相对移动、跑步、物理跳跃、第三人称镜头和碰撞。
- 室外高度场场景：连续分块地形、四种 relief、局部塑形、湖泊/水体、复合几何标志物。
- 可追踪的 `WorldFeature`：稳定 ID、schema、seed、依赖、资源所有权、预算、诊断、重建和清理。
- `defineOutdoorScene` 场景 DSL、场景目录、Playground、检查器和固定输入 Smoke API。
- `OutdoorWorldSpec`、WorldPrompt、Entity Catalog、两张 Codex imagegen 规划图、冻结锁、SDK 派生的俯视/高度坡度工件，以及规划和白膜的一致性检查。
- SDK 从真实实体导出的唯一颜色白膜三视图，以及 Visual Bible 输入/最终包门禁。
- 三个创作 Agent 的 workspace 隔离入口，以及仅向 Planner 开放的受控图片输入入口。

当前的“自由创造”严格指室外高度场白膜世界，不等于任意 3D 游戏类型。
Primitive 四足代理已经可以自定义和控制，但动物资产、骨骼、动画与行为尚未
实现；通用 Terrain Mask 与完整 M5、更多 Constraint、洞穴、倒悬结构、完整
室内、车辆、骑乘、NPC、寻路、Gameplay、联网、Render Bridge、实时世界模型和
Runtime Director 也都尚未实现。

## 4. 当前交付不能被误解为完成的部分

- Golden Fixture 的 `jump` 已完成固定 Tick 绑定和白模验收；产品人物资产的
  接入验收、动作观感、脚滑、更多姿态/动作和独立动画资产仍未完成。
- WaterBody 是白膜水体与基础本地预览，不是最终生成式水面。
- 图片可以传给 Coding Agent，但单张透视图只能重建可见构图与合理的可玩延伸，不能恢复唯一真实三维几何。
- World Plan 和 Opening Shot 是创作意图，不是碰撞或高度真相；高度、坡度、可通行性必须从实际白膜计算。
- Catalog Playground、artifact-only 捕获和 Canonical Authoring 页面都由 Babylon/Havok
  链路承载；它们用途不同，但不形成第二套 Runtime 真相，也都没有实时世界模型参与。
- `mistbound-rider` 中的马和骑手是静态标志物，用于测试构图；它不是可骑乘主体。
- 现有自动测试覆盖编译、资源归属、物理高度场和固定步长等工程契约；固定输入 Smoke 目前通过 Playground 按钮/API 手动触发，尚未纳入浏览器 E2E。两者都不能代替运动手感和图像构图的人工验收。

## 5. 工作分期

### Phase I：第三人称人形与室外自由搭建

当前处于 Alpha 收敛阶段。剩余重点是人形资产合规与动作 QA、移动/镜头手感回归、更多图片参考场景、地形与水体视觉/物理边界验证、性能预算和稳定的 Agent 验收闭环。

### Subject Authoring S1a：Package Primitive 主体

已完成：AI 可以在 `resources.subjectDefinitions` 中用 Primitive Part、Socket、
Capability 和 Profile 定义主体，再通过多个 `subject` 节点生成独立实例。SDK
确定性推导 Collider、Hash、Lock 和资源成本，并提供 Registry/Explain 工具。

未完成：更多产品 GLB 资产、Compound Collider、完整 Semantic Actions、Relationship、
坐骑、装备、车辆与飞行。它们分别属于 S1b 后续、S2 及之后阶段。

### Subject Authoring S1b：Golden 与首个产品 G Bot 可视切片

已完成：项目自有 Golden 与首个产品 G Bot GLB 的 Asset/Rig/Animation/Collider
Registry 资源、内容 Hash Gate、Babylon AssetContainer 缓存、逐实例 Rig/动画状态、
`idle/walk/run/jump`、Bone Socket、CLI/Browser Explain 与端到端验证。G Bot World
JSON 只引用稳定 Subject Definition，源 Bone/Clip 映射由 Registry Profile 承担。

未完成：更多产品资产接入、Compound Collider、LOD、更多身体拓扑、独立动画资产、
通用姿态、游泳、装备、坐骑与飞行。首个 Fixture 证明了管线，不等于 S1b 或
Semantic Actions 整体生产完成。

### Placement Solver S1：首个海湾可视切片

已完成：Agent 可以为 Object/Anchor 选择 `fixed` 或 `solved` Placement；Solved
Entity 通过八种关闭 Constraint、Required/Preferred 优先级和锁定 Solver Profile
确定最终 Transform。CLI 可独立 validate/solve/explain；Browser/Havok 只复验
Required Runtime Assertion，不重新布局。海湾 Fixture 覆盖接地、净空、路线坡度、
镜头可见性、冲突、篡改、预算和连续/并发确定性。

未完成：通用 Terrain Mask、Route R1b、更多 Constraint、增量求解、通用
Validation Report 以及完整 P0.1。S1 证明的是一个受控纵向切片，不是任意开放世界
布局已经生产完成。

### Route R1 Heightfield：可信验证与 Golden Gate

已实施：`worldkit verify route` 从 Canonical Authoring V4/ExecutionPlan V5 出发，
通过 `@whitebox-world/world-package` 建立最小正式 Package Root/Build Receipt，由
Validation Subject 绑定五个权威 Hash，再用 Recast Graph/Path 与真实 Babylon/Havok
`NullEngine` Character Controller Probe 生成 Canonical Route Evidence 和统一 Report。
`worldkit run` 复用同一可信链路，通过 Host 私有、只读传输把证据注入 Browser
Protocol V5；页面只读取 Route Summary、Path Receipt、Probe Receipt 和 Overlay。
Task 9 的 11 个 Authoring V4 Golden/Adversarial Fixture 与
`pnpm verify:route-r1-heightfield` 已进入回归。终审记录见
[R1 Heightfield Runtime Review](reviews/2026-08-22-route-r1-heightfield-runtime-review.md)。

未完成：R1b 静态平台/Surface→Collider Subshape，以及完整 M5 验收。非当前
AuthoringSpec V4 输入会在统一入口严格拒绝；页面也不会成为备用 Evidence Producer。

### Simulation Take / Control Capture V1：首个五 Pass 切片

已完成：严格 Take Schema、60 Hz → 24 fps 整数有理数 Schedule、Control Intent 与
Camera Rig Track、Simulation/Render/Capture 三计数器、Render Ready Receipt、五个锁定
Pass、稳定 Semantic/Instance Table、Playwright Driver、原子 Bundle、Integrity
Validate/Inspect 和两个共享 World Identity 的 Take Fixture。

未完成：完整 P1.4 WorldPackage/Registry Lock、Action/Event/Relationship Receipt、Resume、
跨平台 Replay Metric、Motion Vector、Placement/Physics/Composition 等统一 Validation
扩展和 Video Model Adapter。
现有真实浏览器 Gate 是有界单帧 Probe，不冒充完整 240 帧视频级验收。

### Validation Capture/Integrity V1：首个统一报告切片

已完成：引擎无关的 `ValidationProfileV1`、`ValidationReportV1`、Gate、Metric、
Evidence 和 Diagnostic；内置 `outdoor-control-video-dev@1` Profile；严格解析与
Canonical Hash；`worldkit verify capture|explain`；正常、缺 Pass、坏 Depth、混
Take、坏 Hash 的确定性 Conformance Gate。报告写在 Bundle 外部，不造成 Bundle Root
自引用，也不复制现有 Bundle Validator。

未完成：Placement、Physics、Route、Composition、Replay、Performance 和 Generated
Video Subject；Profile 组合/Override；`verify compare`；Browser/CI Evidence 发布。
因此“统一报告协议已有首条切片”不等于全部生产 Gate 已统一。

### Phase II：更多主体、动作与室内

候选包括第一人称、人形动作扩展、车辆、骑乘、动物，以及独立的室内空间与紧凑镜头方案。具体顺序尚未确定。

### 后续独立工作流

- **World Model Integration**：实现 Render Bridge、条件缓冲、异步生成与显示合成。
- **Runtime World Director**：实现观察、实体解析、权限、dry-run/commit、任务、日志与回执；后续再接动作、NPC 和导航。
- **Gameplay/NPC**：触发器、规则、目标、导航和行为，不假装属于当前 Alpha。

这些是相互依赖但不应被强行命名为同一个“第三期”的工作流。World Model 团队可以现在就对齐契约和样例，不必等待 Phase II 完成。

## 6. 阅读顺序

1. 本文：范围、角色、状态和分期。
2. [当前实验与验证记录](10-current-experiments.md)：代码现在实际能做什么。
3. [第一期 Alpha 实现与运行指南](07-alpha-implementation.md)：如何运行。
4. [Coding Agent 场景创作指南](08-agent-scene-authoring.md)：如何创建新场景。
5. [Plan-first 世界创作协议](12-plan-first-world-authoring.md)：如何从输入得到可追踪世界和规划工件。
6. [多 Agent 世界创作流水线](13-multi-agent-world-authoring.md)：三个 Agent 的权限、工件和门禁。
7. [能力分层与体验路线](14-capability-levels-and-experience-roadmap.md)：SDK、World Model 和玩家体验如何逐级增长。
8. [Canonical Authoring V4 快速接入](17-canonical-json-quickstart.md)：AI/CLI
   的基础世界与 Route 协议、Placement Solver、Package Definition、Route Verification 和 Browser V5。
9. [AI-first LEGO Game SDK 生产设计](superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)：面向重构的长期 Schema、Compiler、Runtime、CLI 和门禁设计。
10. [Placement Constraint 与确定性 Layout Solver](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)：AI 如何表达空间意图，SDK 如何生成最终 Transform。
11. [Simulation Take 与 Control Capture Bundle](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)：世界、操作/镜头和多 Pass 控制制品如何分离。
12. [World Validation Report 与质量门禁](superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)：量化 Metric、Evidence、阻断策略和生产报告。
13. [主体资产与 3C 配置接入契约](16-subject-assets-3c-integration.md)：产品主体资产、Character、Control、Camera、骑乘和多人控制如何接入 SDK。
14. [SDK 总体架构](02-sdk-architecture.md)：当前模块、目标模块和实现状态。
15. [世界模型团队接入说明](11-world-model-team-handoff.md)：双方边界与近期接口工作。
16. [运行时世界导演方案](09-runtime-world-director.md)：后续受控世界操作协议。
