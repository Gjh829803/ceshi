# Babylon Native Block Whitebox Profile 设计审查

## 1. 审查元数据

- 审查模式：Mode A（设计规格审查）；因规格涉及 Physics、Movement、Camera、Capture 与资源所有权，
  同时静态执行 `runtime-deep-review-checklist.md` 的 authority/lifecycle/evidence 条目。
- 审查对象：
  [`2026-08-28-babylon-native-block-whitebox-profile-design.md`](../superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)。
- 对象状态：Accepted authoring direction；BWB-1 至 BWB-6 与依赖的 BNA 工作均未实施。
- Git 工作区：`explore/scene-reconstruction-api`；审查起点 HEAD
  `114b4ecc9762fc10b437340e4d012628ad600f32`，远端分支/merge-base
  `b40b8aef6fd78d62d73ae6cc4ace31f82fc3ccd7`。本报告审查该 HEAD 加完整 docs-only candidate diff；
  最终提交 ID 由本报告写入后的 Git commit 记录。
- 固定实验输入：
  [`codex/block-world-sdk-v2@618d96b4e297d90d13ee6d1bf9be1e0b83423dbe`](https://github.com/seedleap/agent-whitebox-world-sdk/tree/618d96b4e297d90d13ee6d1bf9be1e0b83423dbe)。
- 上位权威：`AGENTS.md`、
  [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)、
  [ADR-0007](../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)、
  [Babylon Native 长期设计](../superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
  与 [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)。
- 实施计划：尚未创建；只有用户审阅并接受本文后，才可按 BNA/BWB 依赖图创建实施计划。
- 已安装依赖：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`，由当前 workspace
  `pnpm list` 重新确认。
- 证据层级：本审查只有 `static-read` 和 docs consistency evidence；没有自动化 Runtime、
  `rendered-visual` 或 `manual-interaction` 证据。

### 验证命令

| 命令 | Exit code | 证据范围 |
|---|---:|---|
| `git branch --show-current && git rev-parse HEAD && git rev-parse origin/codex/block-world-sdk-v2` | 0 | 当前分支、候选基线和固定实验 commit |
| `git rev-parse origin/explore/scene-reconstruction-api && git merge-base HEAD origin/explore/scene-reconstruction-api` | 0 | 远端 diff 基线 |
| `pnpm list @babylonjs/core @babylonjs/havok --depth 0 -r` | 0 | 当前安装版本，不复用旧 review 版本声明 |
| `git ls-tree -r --name-only origin/codex/block-world-sdk-v2` + scoped `git show` | 0 | 旧 Three/Manifest/Compiler Package、四形状、Checker 与 Runtime 改动静态 census |
| `rg -n 'registerStaticCollider\|traversalBinding\|checkSupport...' <Native/3C owners>` | 0 | 当前实验登记面与 main 3C Owner 复验 |
| `node -e '<changed Markdown relative-link checker>'` | 0 | 变更 Markdown 的本地相对链接均存在 |
| `rg -n 'TBD\|TODO\|FIXME\|placeholder...' <changed docs>` | 0 | 新规格无未决模板；命中仅为既有 Backlog 的正式 TODO 文案 |
| `git diff --check` | 0 | docs-only diff 无 whitespace error |

未运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、Browser verifier、正式 Capture、视觉或人工交互
Gate。本轮不修改源码、依赖、构建配置或 Runtime 行为；按 D6.1，纯文档变更只重放 diff、链接和 claim
对拍。任何旧分支截图或局部碰撞演示都没有被升级为当前生产证据。

## 2. 旧结论复验

### 2.1 Canonical 仍是当前唯一生产入口

结论成立且已在当前 Git tree 复验。Gameplay 对接合同明确 Canonical V4 -> IR V4 -> Plan V5 是当前唯一
生产协议（`9:24:docs/20-gameplay-integration-contract.md`）；Backlog 同时把 BNA-1 至 BNA-8 与 BWB-1 至
BWB-6 保持未完成（`940:1005:docs/18-refactor-progress-and-backlog.md`）。新 Profile 接受长期方向，不增加
第二个当前入口。

### 2.2 旧 Block World 分支的效果不证明旧工程链路正确

结论成立且已从固定 commit 复验。旧链路确实包含 `packages/block-world-three`、持久
`BlockWorldManifestV2`、`packages/block-world-compiler`，最终再次生成 AuthoringSpec/ExecutionPlan；它还
包含旧 Motion、隐藏 foundation、未闭合 Preset 和 direct reset transition。新规格只继承米制形状、真实
体积、剖面推理、Occupancy、调色板、分层审查与优化思想，明确拒绝 Three -> Manifest -> Compiler
（`56:78`、`311:326:docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`）。

### 2.3 Native 实验登记面不是目标生产合同

结论成立。当前源码仍只有 `BabylonNativeSceneBuildContextV1.registerSpawnMarker()` 与
`registerStaticCollisionMesh()`，Static Collision 还携带实验性的 `surfaceKind/frictionRatio/
restitutionRatio`（`6:47:packages/runtime-babylon/src/native-scene-module.ts`）。目标 BNA-4 才冻结
Profile-based Static Collider 与关闭 `traversalBinding`；BWB 不得先行扩张 core Registration。

### 2.4 旧 BNA 设计审查的 Source control 元数据已过时

[`2026-08-28-ai-friendly-babylon-native-world-authoring-design-review.md`](./2026-08-28-ai-friendly-babylon-native-world-authoring-design-review.md)
中的 Diversion revision 只作历史线索；本报告已用当前 Git branch/SHA、当前安装版本和当前 main 3C 源码
重新复验。旧 review 的“一世界两条互斥 Scene Source、一个 SDK Kernel”结论仍成立，但不能替代本次
Block Profile 审查。

## 3. Findings

### 最终开放 Findings

截至完整 candidate tree 的最终复核：**无开放 P0、P1 或 P2**。下面记录的是审查中发现、已由主 Agent
修正并在当前文本复核后撤回的问题。

### [P1] [D1/D4] 独立 Traversal/Visual Group Contribution 会旁路 BNA core Registration

- 证据（static-read）：早期稿把 `TraversalSurfaceContribution` 与 Visual Group 写成独立 Runtime
  Contribution；当前规格已改为 Static Collider 同一登记上的关闭 `traversalBinding`，Visual Group 仅为
  Profile-local authoring/Capture inventory（`31:40`、`242:265`），并要求 Collider proxy materialize
  为 core 当前接受的 Babylon `Mesh`（`225:235`）。
- 期望：BNA core 独占 Registration 类型与版本；BWB 不能因复用算法自行发明新的 Runtime DTO。
- 影响：若不修正，会出现第二套 Surface/Route 权威和未被 Package/Admission 冻结的 Capture 身份。
- 建议：未来新增 Semantic Volume、Visual Group Contribution 或 Primitive Collider 时，先升级 BNA core
  合同、Parser、Hash 与负向 Gate，再由 Profile 消费。
- 复核：复核后撤回；ADR、Native 总设计、BWB 与 Backlog 已统一到同一关闭 binding。

### [P1] [D4/D5] Profile 曾与 BNA-4 重叠拥有 Runtime Debug/Havok 优化

- 证据（static-read）：当前 BWB-4 只拥有 layout-to-core-Contribution candidate 与 overlay input
  metadata，并明确排除 Runtime Debug Overlay、Havok Adapter、Movement/Body/Support Owner
  （`410:424`）；BWB-6 只交付 eligibility/grouping、等价夹具、benchmark 与优化提案，不直接修改
  Runtime/Havok（`442:457`）。
- 期望：BNA-4/Runtime Adapter 始终独占 Havok shape creation、batching/coalescing、Debug Overlay、
  lifecycle 与 disposal。
- 影响：若不修正，Profile 会成为第二个 Physics Adapter，并让优化改变 Collider identity 或资源释放语义。
- 建议：任何实际 Runtime 优化另立稳定 BNA-owned 任务 ID，重新验证 Contribution Hash、真实 Havok、
  双实例和 throwing cleanup。
- 复核：复核后撤回；BWB-6 当前不阻塞或授权任何 Runtime 实施。

### [P1] [D1/D3/D6] Authoring 截图和局部室内碰撞会被误报为正式 Capture/室内能力

- 证据（static-read）：当前规格把 BWB-3/BWB-5 输出限定为 Build-Epoch-local authoring screenshots，
  明确不拥有 BNA-7 formal WorldPackage/Browser Capture（`394:407`、`426:440`）；Capability 表继续把
  正式 Capture、多层室内 Route、自动寻路和 Hosted 列为独立 Gate（`328:343`）。
- 期望：结构、渲染、Collider、人物通过性、Route、formal Capture 和人工交互证据分层，不互相替代。
- 影响：若不修正，一个好看的房间或可走探针会被产品/下游 Agent 当成多层室内、Route 或自动寻路支持。
- 建议：BNA-7 前只发布 profile-local screenshots 与 Probe/Manual evidence；产品 Capability 继续 fail
  closed。
- 复核：复核后撤回；Backlog 与 Gameplay 对接合同已同步当前/目标边界。

### [P2] [D2/D5] Block Helper 可能再次演变成公开场景 DSL 或持久 Manifest

- 证据（static-read）：当前设计只允许固定 shape/grid/palette、单块 Helper、Build-Epoch-local Layout 与
  diagnostics；禁止 `createMountain/createBuilding/createLevel`、持久 `BlockWorldManifest`、Compiler 和
  Scene 扫描（`137:178`）。普通 Babylon `MeshBuilder` 保持一等入口。
- 期望：Profile 只减少机械重复，不镜像 Babylon Scene Graph 或把高层世界语义变成第二语言。
- 影响：若不约束，AI 需要同时学习 Babylon 和自有 DSL，长期又回到 Schema/Compiler 追赶循环。
- 建议：BWB-1 对 public exports 做 census；每个新增 Helper 必须证明是单块/检查机械能力，而不是新场景
  协议。
- 复核：复核后撤回；风险、拒绝方案和 API 边界均已写入规范。

### [P2] [D6] 工作图最初存在 Owner 重叠、混合 execution mode 和无稳定后续任务

- 证据（static-read）：当前 BWB-0 至 BWB-6 每项均有 ID、deliverable、`depends_on`、`blocks`、独占
  Owner、I/O、集成点、证据和单一 execution mode（`356:465`）；上位 BNA-0 至 BNA-8 也已收敛每项单一
  execution mode（Native 总设计 §17）。BWB-6 对未来 Runtime 优化只输出 proposal，要求另立稳定 ID。
- 期望：设计图必须可直接转成 dependency-aware plan，不能把同一 Runtime Adapter 分给两个任务，也不能
  用“最终集成另算”隐藏第二 execution mode。
- 影响：若不修正，Agent 会并行修改同一 Registration/Havok/Capture Owner，成功的局部报告也无法形成
  集成证据。
- 建议：实施计划保持 BNA core 优先；BWB 只在依赖冻结后进入，架构与 Runtime 集成保持
  `main-agent-only`。
- 复核：复核后撤回；本报告完成 BWB-0 的最后 durable Mode A evidence。

## 4. 维度覆盖表

| 维度 | 状态 | 覆盖与结论 |
|---|---|---|
| D1 定位与需求边界 | 已查 | Profile 是 Native Lane 内的创作方法，不是第三 Scene Source；当前生产仍 Canonical；室内、Route、`goTo`、Hosted 与增量编辑未越界承诺。 |
| D2 Schema 与 AI-friendly | 已查 | `nativeSceneProfileRef` 使用资源 Ref 命名；单位/坐标在 shape/grid 字段中显式；无逐块 JSON、同义字段或第二公开 DSL；Profile 不扩张 BNA core DTO。 |
| D3 承诺与事实对拍 | 已查 | 对照当前实验 `registerStaticCollisionMesh`、main 3C、Backlog、ADR 与 Gameplay 合同；设计完成不等于 BWB/BNA 能力完成。 |
| D4 单一权威状态 | 已查（额外） | Babylon Module 是视觉源；Static Collider closed binding/SDK Havok 是物理源；`CharacterMovementRuntimeV1`、`CharacterBodyPortV1`、Locomotion V2、Action Presentation、Camera Context/Director 与 `checkSupport()` 不可被 Profile 替换。 |
| D5 工程质量与可维护性 | 已查（额外） | Package、Build Epoch、determinism、helper scope、优化 Owner、partial construction/throwing cleanup 等已进入 BWB 工作图；本轮无实现代码可审。 |
| D6 门禁与证据分层 | 已查 | structural/rendered/collider/passability/route/manual 分层；profile-local screenshot 不冒充 formal Capture；BWB-0 仅关闭设计/审查，不提高生产完成度。 |

## 审查结论

**接受 Babylon Native Block Whitebox Profile 作为长期 Native 创作方向；允许在用户审阅后进入独立实施
计划，不授予 Native Production、formal Capture、Route、自动寻路、正式室内、Hosted 或
WorldChangeSet 能力声明。**

最关键的工程约束是：继承旧方块分支的构造方法和验收标准，但替换 Three/Manifest/Compiler/旧 Runtime；
允许关闭的生成期内存 Layout，不建立第二持久场景协议；所有物理与 Gameplay 仍通过 BNA core
Registration、SDK/Havok 和当前 3C Owner 收敛。
