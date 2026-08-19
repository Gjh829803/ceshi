# Agent Whitebox World SDK

一个面向 AI 的确定性白模世界编译与交互模拟 SDK。

外部 Agent 使用稳定的 Canonical Schema 描述世界、主体和约束；SDK 负责校验、
资源解析、确定性编译、Babylon.js/Havok 运行、物理控制、状态查询和结构捕获。
后续视频模型只消费 SDK 输出的白模与控制通道，不负责决定碰撞、位置、导航或
Gameplay 真相。

> 当前长期重构总进度约 **40%**；“JSON → IR → Babylon/Havok → 多主体控制与截图”
> 的第一条 Canonical 纵向切片约 **80%**。详细口径和全部待办见
> [SDK 重构总进度与 Backlog](docs/18-refactor-progress-and-backlog.md)。

第一次阅读建议依次查看：

1. [项目总览](docs/00-project-overview.md)：产品范围、当前能力和明确不支持的部分；
2. [Canonical JSON V2 快速接入](docs/17-canonical-json-quickstart.md)：当前唯一 JSON 协议和命令；
3. [重构总进度与 Backlog](docs/18-refactor-progress-and-backlog.md)：完成度、优先级、依赖和验收标准。

## 核心链路

```text
Prompt + Reference Image
            ↓
External Planning / Coding Agent              上游团队负责
            ↓
AI Schema Profile / Canonical AuthoringSpec   SDK 公共入口
            ↓
Schema Validation + Registry Resolution
            ↓
Normalizer + Terrain Compiler + Deterministic Layout Solver
            ↓
NormalizedWorldIR + Resource Lock
            ↓
ExecutionPlan / WorldPackage
            ↓
Simulation Take                               专项设计已成稿，实现规划中
            ↓
Babylon.js Runtime + Havok Physics            唯一白模世界真相
            ↓
Control Capture Bundle                        专项设计已成稿，实现规划中
  Neutral Color / Linear Depth / Semantic / Instance / World Normal
            ↓
Validation Report                             必需 Gate 一票否决
            ↓
Video Model Adapter                           外部视觉实现
            ↓
Final Generated Video
```

当前已经交付到 Babylon/Havok Runtime、单截图、Snapshot 和 Browser Protocol；
Placement Solver、Simulation Take/Control Capture Bundle、Validation Report 三份专项
设计已成稿并等待评审冻结，相关 Runtime/CLI/Schema 实现、完整 WorldPackage 和视频
模型 Adapter 仍在后续 Backlog 中。

## 职责边界

| 角色 | 负责 | 不负责 |
|---|---|---|
| 上游 Agent 团队 | 理解 Prompt/参考图，选择 Registry 内容，生成和修复 Canonical JSON | 不直接操作 Babylon、Havok、DOM、Mesh 或物理 Handle |
| 本 SDK | Schema、IR、Compiler、Registry、Runtime、物理、控制、相机、状态、Capture 和 CLI/Browser 协议 | 不实现通用 LLM Agent，不生成最终高质量视觉 |
| 3D 资产团队 | 提供带版本、单位、Pivot、Forward Axis、Rig、Animation、Socket 和许可证信息的资产 | 不定义世界 Gameplay 或运行时控制权 |
| 视频模型与 Adapter | 根据白模控制通道实现材质、光影、风格和视觉细节 | 不修改世界位置、碰撞、主体数量、动作结果或语义身份 |

白模 Runtime 是唯一世界真相。凡是影响位置、数量、碰撞、遮挡、导航、动作、
关键轮廓或玩法结果的变化，都必须先进入 Canonical 世界并通过 Runtime Gate。

## 核心设计原则

- **AI-friendly Schema**：一个概念只有一个公共名称；使用稳定 ID、精确 Ref、
  闭合枚举、判别 Union 和带单位的数值字段。
- **高层语义优先**：Agent 选择 Definition、Capability、Relationship 和约束，
  不拼装引擎对象或猜测底层生命周期。
- **确定性编译**：相同输入、Registry Lock、Compiler Version 和 Seed 产生相同
  Canonical Hash、IR 和执行结果。
- **协议与引擎分离**：Canonical Schema、IR 和 Runtime Contracts 不包含
  Babylon/Havok 类型；引擎细节只存在于 Adapter 内。
- **逻辑、渲染、物理三图分离**：RenderNode 父子层级不是 Gameplay 真相；
  Relationship、Collider 和 Visual Attachment 分别编译并保持一致。
- **Definition、Instance、Relationship 分离**：定义“是什么”、实例“世界里是谁”、
  关系“两个实例当前怎样连接”，三者不能互相替代。
- **开放但受控的扩展**：内容级扩展通过 Package/Registry Definition；算法级
  扩展经过 Plugin Conformance、签名和版本锁后才能进入生产世界。
- **生成结果不可信**：图片、模型和外部工具输出必须被固化、校验、哈希并重新
  通过物理、构图、资源和安全 Gate。
- **空间意图与运行时关系分离**：Placement Constraint 只负责编译时最终落位；
  骑乘、装备、拖拽和控制权继续使用类型化 Gameplay Relationship。
- **世界、操作和捕获分离**：WorldPackage、Simulation Take、Runtime Session、
  Control Capture Bundle 与生成视频分别版本化和哈希。
- **量化门禁优先**：Validation Profile 固定 Metric、阈值、单位和证据；Blocking
  Gate 或 Required Metric 缺失不能被综合分数抵消。

详细命名规则见仓库根目录的 [`AGENTS.md`](AGENTS.md) 与
[AI-first LEGO 游戏 SDK 总体设计](docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)。

## LEGO 世界模型

| 概念 | 含义 | 当前状态 |
|---|---|---|
| Subject Definition | 可复用主体定义，组合 Geometry/Asset、Socket、Collider Policy、Profile 和 Capability | Primitive Package/Registry Definition 已交付 |
| Subject Instance | 世界中的具体主体，具有独立 Entity ID、Transform、状态和控制权 | 已交付 |
| Visual Part | Definition 内部的可渲染组成部分，不自动成为独立 Entity | Primitive Part 已交付，GLB/Asset Part 未交付 |
| Subject Socket | 主体局部空间中的稳定连接点，例如手、座位或拖车钩 | 声明与编译已交付，关系绑定未交付 |
| Capability/Profile | 运动、控制、物理、动作等可组合能力及其锁定配置 | 首个 Ground Locomotion/Collider Profile 已交付 |
| Relationship | `mountedOn`、装备、拖拽等实例之间的类型化 Gameplay 关系 | S2 规划中，当前 Authoring V2 不支持 |
| Semantic Action | 与具体动画 Clip 解耦的移动、攻击、交互等动作 | 规划中 |

主体类别不决定能力。人、马、滑板、汽车、拖车或飞龙都使用同一套
Definition/Instance/Capability/Relationship 原则；差异由已注册能力、Profile、
Socket 和类型化关系表达。

## 当前能力与后续边界

| 领域 | 当前已交付 | 尚未交付 |
|---|---|---|
| 世界输入 | Canonical Authoring V2、严格 Schema、Registry/Package Primitive Definition | Placement Constraint Solver、完整 WorldPackage（专项设计已成稿） |
| 地形 | 室外 Heightfield、基础 Relief、静态障碍、水域和物理查询 | Canonical Raster/Mask/Region Pipeline、洞穴、Overhang、完整室内 |
| 主体 | Primitive 人形/四足代理、多实例、自动 Capsule、独立控制 | GLB 资产主体、Compound Collider、Rig/Animation Binding |
| 关系 | Socket 数据可以声明和查询 | 动态 Bind、骑乘、装备、拖拽、Joint、事务与回滚 |
| 运动与相机 | 地面移动、跳跃、水域状态、第三人称跟随 | 第一人称、飞行、车辆、Camera Director 和多 Rig 切换 |
| 自动化 | validate/build/run/capture、Registry Discovery、Definition Validate、Subject Explain、Browser V3 | 持久 Runtime Session、完整 Playwright Driver、多人同时控制 |
| Capture | 单帧截图、Runtime Snapshot | Simulation Take、Neutral/Depth/Semantic/Instance/Normal 多 Pass 与视频序列（专项设计已成稿） |
| Validation | Canonical Browser Gate、现有物理/构图检查 | 统一 Validation Profile/Report、量化 Metric/Evidence 与生产 Policy（专项设计已成稿） |
| Gameplay | 基础固定输入和控制绑定 | Semantic Action、NPC、导航、任务、战斗、联网 |
| 最终视觉 | 本地白模渲染 | Render Bridge、实时世界模型和生产 Video Model Adapter |

当前阶段只承诺室外 Heightfield 白模世界。不要把 NPC、车辆、坐骑、飞行、室内、
洞穴、联网或视频模型接入当作已经存在的生产能力。

## 快速开始

安装依赖并验证 Canonical 示例：

```bash
pnpm install
pnpm worldkit validate examples/authoring/package-subject-world.json --json
pnpm worldkit build examples/authoring/package-subject-world.json \
  --output artifacts/examples/package-subject-world/world.build.json --json
```

查看 Package Subject Definition 的确定性解析结果：

```bash
pnpm worldkit subject explain \
  examples/authoring/package-subject-world.json \
  --entity-id pack-animal-a --json
```

启动 Canonical Babylon/Havok Runtime：

```bash
pnpm worldkit run examples/authoring/package-subject-world.json
```

截图并保存 Runtime Snapshot：

```bash
pnpm worldkit capture examples/authoring/package-subject-world.json \
  --output artifacts/examples/package-subject-world/world.png \
  --snapshot artifacts/examples/package-subject-world/snapshot.json --json
```

Canonical Authoring V2 是唯一输入；V1 从未发布，已经删除，也不存在兼容字段。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm test:scenes
pnpm build
pnpm verify:canonical
```

`verify:canonical` 会在真实 Chromium 中验证 Canonical Build Artifact、
Babylon/Havok、墙体碰撞、水域切换、两个 Package Subject 独立控制、截图、
Snapshot 和确定性 Reset。

## 代码边界

| 路径 | 职责 |
|---|---|
| `packages/protocol/` | Canonical JSON Bytes 与 Hash |
| `packages/subject-composition/` | 引擎无关的 Primitive Bounds、Collider 推导和资源成本 |
| `packages/subject-registry/` | 精确版本的 Definition、Capability 和 Profile Registry |
| `packages/authoring/` | Authoring V2 Schema、解析、语义校验、资源解析和 Normalized IR |
| `packages/compiler/` | NormalizedWorldIR → ExecutionPlan 的确定性编译 |
| `packages/runtime-contracts/` | ExecutionPlan、Snapshot 与 Browser Protocol 数据协议 |
| `packages/runtime-babylon/` | Babylon/Havok Runtime Adapter |
| `apps/playground/` | Canonical Runtime 页面、旧 Alpha 场景和浏览器验证入口 |
| `scripts/worldkit.ts` | SDK CLI |

Compiler 和 Runtime 不能反向读取 Agent Prompt；Runtime Adapter 不能把 Babylon
对象泄漏到公共协议；场景模块不能为了创建内容而修改 Runtime、Physics 或 Camera
内部实现。

## 文档导航

### 使用与当前状态

- [项目总览：范围、状态与阅读顺序](docs/00-project-overview.md)
- [Canonical JSON V2：AI/CLI 接入与运行指南](docs/17-canonical-json-quickstart.md)
- [SDK 重构总进度与 Backlog](docs/18-refactor-progress-and-backlog.md)
- [当前实验与验证记录](docs/10-current-experiments.md)
- [第一期 Alpha 实现与运行指南](docs/07-alpha-implementation.md)

### 架构评审

- [AI-first 白模游戏 SDK 设计评审简版](docs/reviews/2026-08-18-ai-first-sdk-design-review-brief.md)
- [AI-first LEGO 游戏 SDK 总体设计](docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)
- [AI-first Terrain Authoring Pipeline 设计](docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md)
- [可扩展主体组装 Authoring 专项设计](docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)
- [Placement Constraint 与确定性 Layout Solver 设计](docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)
- [Simulation Take 与 Control Capture Bundle 设计](docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)
- [World Validation Report 与质量门禁设计](docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)
- [Package 局部 Subject Definition（S1a）设计](docs/superpowers/specs/2026-08-19-package-subject-definition-design.md)
- [主体资产与 3C 配置接入契约](docs/16-subject-assets-3c-integration.md)
- [世界模型团队接入说明](docs/11-world-model-team-handoff.md)
- [运行时世界导演与受控世界操作协议](docs/09-runtime-world-director.md)

### 外部依据与可行性

- [业界对照与可落地性核查报告](docs/superpowers/specs/2026-08-18-industry-alignment-and-feasibility-review.md)
- [Agentic 白模世界到可控视频：开源方案调研与架构启示](docs/superpowers/specs/2026-08-19-agentic-whitebox-to-video-open-source-research.md)
- [阶段 0 技术探针计划与外部资料核查](docs/superpowers/specs/2026-08-18-phase0-probe-plan-and-external-research.md)

### 已完成实施切片

- [Subject Foundation 可视切片](docs/superpowers/plans/2026-08-19-subject-foundation-visible-slice.md)
- [Package Subject Definition 可视切片](docs/superpowers/plans/2026-08-19-package-subject-definition-visible-slice.md)
- [Canonical JSON Babylon 历史实施计划](docs/superpowers/plans/2026-08-18-canonical-json-babylon-v1.md)：已被 Authoring V2 取代，仅保留历史上下文。

### 架构决策

- [ADR-0001：向 Agent 暴露主体套餐](decisions/0001-subject-kits.md)
- [ADR-0002：第一、二期范围](decisions/0002-phased-scope.md)
- [ADR-0003：Agent、Director 与 World Model 边界](decisions/0003-agent-director-world-model-boundaries.md)
- [ADR-0004：新场景采用 Plan-first 创作](decisions/0004-plan-first-world-authoring.md)
- [ADR-0005：分离 Planner、Builder 与 Visual Bible](decisions/0005-separated-planner-builder-visual-bible.md)
- [ADR-0006：AuthoringSpec 编译架构与 Babylon Runtime](decisions/0006-authoring-spec-compiler-architecture.md)

## Legacy 与实验路径

仓库仍保留 Three.js/Rapier Alpha Playground、Plan-first 多 Agent 场景流程、
Creator Studio 和若干已验证场景，作为创作实验、视觉回归和迁移 Fixture。

```bash
pnpm dev
pnpm studio
```

这些入口不是新程序的 Canonical 协议真相，不再承接新的底层能力。新外部程序应
使用 `worldkit`、Authoring V2 和 Browser Protocol V3。最终切换计划见
[重构总进度与 Backlog](docs/18-refactor-progress-and-backlog.md#p32-默认实现切换)。

仓库不分发来源尚未确认的 Xbot。需要本地验证 Mixamo 兼容 GLB 时，请按照
[Alpha 运行指南](docs/07-alpha-implementation.md)链接自己的合规资产；没有资产时
Runtime 会明确显示白模占位体，不会伪装成已绑定角色。
