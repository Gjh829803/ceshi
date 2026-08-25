# SDK 重构总进度与 Backlog

- 状态：Active，重构执行进度与剩余工作的唯一跟踪入口。
- 基准日期：2026-08-25。
- 长期目标总进度：约 **68%**，合理误差范围为 ±5%。
- 第一条 Canonical 纵向切片：约 **94%**。
- 当前唯一世界构建入口：Canonical Authoring V4 → NormalizedWorldIR V4 → ExecutionPlan V5 →
  RuntimeWorldConfiguration V1 → RuntimeHost → Babylon.js/Havok；Route 在同一 V5 Plan 上生成
  WorldPackage Build Receipt → Validation Subject → Recast → Canonical Route Evidence/Report。
  Browser 只公开 Protocol V5 与 Snapshot V4；Babylon provider projection 保持 Adapter 内部合同。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

> 首个产品资产 G Bot 已通过独立 Registry/CLI/Babylon/Havok/Browser Gate；这只代表
> 当前版本 G Bot 的 `idle/walk/run/jump`，不代表任意产品包或其余 21 个 Clip 已开放。

> Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask、更多 Constraint 与 P0.1 整体仍未完成。

> Route R1 Heightfield 与 R1b Static Platform 已完成，M5 已关闭。候选 `506e088`
> 相对 base `9c5a615` 的修后完整矩阵通过（148 files / 1577 tests、R1b 11/11）；
> 主 Agent 全维度/Runtime 深审与 Cursor 首轮、条件复核均为 Final GO / No findings，
> 无 open confirmed P0/P1。H1/H2/H3、动态平台、NPC/public `goTo` 与车辆仍开放。

> Gameplay Framework G19-2 至 G19-6 已合入 `main@5ffd031`；关闭 Command/Receipt/Event/World
> State、Gameplay State/Feature、事务式 WorldSession/RuntimeHost、Babylon transactional port、
> exact Browser V5、Snapshot V4、RuntimeHost Activity 与 Authoring/CLI/Capture/Take consumer
> cutover 已进入回归。G19-7 Outdoor/catalog lifecycle 与 G19-8 未发布协议 clean break 已完成；
> 候选 `99fb822` 通过 178 files / 2,172 tests、全部结构/资产/Capture/Route/Outdoor Gate 和
> 632/0/489 clean-break census，主 Agent disposition 为 Final GO。G19 整体完成；首次 SDK Alpha
> 前仍必须执行新的 HNC-F1 全面整洁度复查。

> Simulation Take / Control Capture V1 已完成 60 Hz → 24 fps 精确时间映射、五 Pass
> Babylon 捕获、Render Ready Receipt、原子 Bundle、CLI/Browser/Playwright 和真实 Chromium
> Gate；统一 Validation 的 Capture/Integrity V1 也已进入回归。完整 P1.4 WorldPackage、
> Placement/Physics/Composition 等统一 Gate、恢复续拍与 Video Adapter 仍未完成。

## 当前执行 Epic：Babylon-only Runtime 收口（TR0–TR7）

当前主线执行计划是
[`2026-08-25-babylon-only-threejs-retirement.md`](superpowers/plans/2026-08-25-babylon-only-threejs-retirement.md)。
它保留 Plan-first、Opening Composition、Studio preview、planning capture 和 SDK-derived
tri-view 产品合同，同时把 gameplay、catalog 和 artifact-only 路由收口到同一个
Babylon/Havok Runtime。TR0–TR7 已随 `main@01ee4b9` 完成首次合入；合入后 Cursor 深审为
Final GO / 无 blocker，并识别一项 composition-mask 共享材质缺陷及若干测试、合同和文档
收口项。复核修补、相关门禁、第二轮 Cursor 深审及定向 follow-up 均已 Final GO；Camera Runtime 自动选择仍以 P2.4 为准，不在本 Epic
中冒充已交付能力。

| ID | 当前状态 | 当前交付物 | depends_on / blocks | 完成证据 |
|---|---|---|---|---|
| TR0 | 已完成 | 冻结 Babylon-only 边界、迁移范围、资产不变式和依赖图 | 无 / TR1–TR7 | 本 Epic 与实施计划可从权威 Backlog 发现 |
| TR1 | 已完成 | Outdoor importer 与 World geometry 只使用 Babylon/引擎无关数据 | TR0 / TR2、TR5 | 非对称与嵌套非均匀 TRS、负行列式、不可表示 shear、terrain geometry data、六场景回归进入集成矩阵 |
| TR2 | 已完成 | Babylon artifact renderer 承接 opening frame、mask/report、planning views 和 prototype tri-view | TR0、TR1 / TR3、TR5、TR6 | 生命周期测试和 6/6 artifact route 已通过；composition mask 按 mesh 隔离临时材质，共享 beauty material 与临时贴图释放均有回归 |
| TR3 | 已完成 | 旧 Runtime cluster 退出；`@whitebox-world/camera` clean-break 为 provider-neutral Domain | TR2 / TR5、TR6 | 包边界和纯 Selection 测试已加入；Profile admission 复用 Camera Domain 参数不变量；不宣称 Browser/Runtime selector 已接线 |
| TR4 | 已完成 | Static Subject intake 改为 GLB-first；保留 19/19 Registry/hash/load/dispose 验证 | TR0 / TR6 | `verify:xier120-subjects` 与 malformed/hash mismatch 负向门禁 |
| TR5 | 已完成 | Scene/artifact verification 迁移到 Babylon/Havok | TR1、TR2、TR3 / TR7 | 181 files / 2,201 tests、6/6 gameplay/artifact、Studio 5/5、生产与架构 build 已通过；14 项 geometry conformance 覆盖 Primitive、水体边界、凹多边形双绕序、退化拒绝和 dispose |
| TR6 | 已完成 | Active docs、Agent 规则、架构站和 Camera 包说明统一为 Babylon-only | TR2、TR3、TR4 / TR7 | Active provider scan 零命中；18 个 Markdown 入口相对链接和 architecture build 已通过 |
| TR7 | 已完成，main-agent-only | 全量门禁、视觉证据、深审、独立复核、提交并推送 `main` | TR3–TR6 / 无 | 首次合入及复核修补门禁通过；两轮 Cursor 深审及最新纹理生命周期定向 follow-up 均为 Final GO；本提交为最终 `main` 收口 |

`@whitebox-world/camera` 当前已实现命名 Rig/Modifier/Context Profile、View Preference、
Context admission、纯 Selection/Explain 和诊断；committed Gameplay Context Projection、
Registry Lock、Browser preference 命令，以及 Babylon CameraDirector 消费 Selection Decision
仍属于 P2.4 后续工作。历史 review/spec 只用于解释决策来源，不能覆盖本表和真实代码状态。

## 1. 文档职责

本文负责回答三个问题：

1. 整个生产级 SDK 重构完成了多少；
2. 哪些能力已经通过代码和运行时门禁；
3. 下一步按什么顺序实施，完成标准是什么。

其他文档的职责保持不变：

- [`00-project-overview.md`](00-project-overview.md)：产品范围、角色边界和当前可交付能力的真相；
- [`17-canonical-json-quickstart.md`](17-canonical-json-quickstart.md)：当前唯一可用协议和命令；
- [`2026-08-17-ai-first-lego-game-sdk-design.md`](superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)：长期架构规格；
- [`2026-08-17-terrain-authoring-pipeline-design.md`](superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md)：地形专项规格；
- [`2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md`](superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)：桥梁、悬挑、洞口、洞穴和多层可行走表面的长期专项规格；
- [`2026-08-21-hybrid-terrain-design-review.md`](reviews/2026-08-21-hybrid-terrain-design-review.md)：对该专项的业界对照审查；方向成立，H0 合同未冻前不开始 H1；
- [`2026-08-19-extensible-subject-authoring-design.md`](superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)：主体组装、Relationship、坐骑、装备和飞行的专项规格；
- [`2026-08-19-asset-subject-s1b-visible-slice-design.md`](superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md)：首个 GLB/Rig/Animation/Collider Profile 资产主体纵向切片；
- [`2026-08-20-g-bot-product-asset-s1-design.md`](superpowers/specs/2026-08-20-g-bot-product-asset-s1-design.md)：首个真实产品人物 G Bot 的版本化映射与可视验收；
- [`2026-08-21-product-asset-intake-template-design.md`](superpowers/specs/2026-08-21-product-asset-intake-template-design.md)：把 G Bot Gate 固化为后续产品资产接入模板；执行步骤见 [`product-asset-intake`](superpowers/skills/product-asset-intake.md)；
- [`2026-08-19-placement-constraint-layout-solver-design.md`](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)：AI 空间意图、最终 Transform 求解与冲突报告专项规格；
- [`2026-08-19-simulation-take-control-capture-design.md`](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)：WorldPackage、Take、Session、多 Pass Capture 与视频 Adapter 边界；
- [`2026-08-22-canonical-runtime-state-and-semantic-projection-design.md`](superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)：Canonical World/View/Runtime Status、Typed Relationship、Semantic Fact、Action/Event Receipt 与世界模型轨迹边界；
- [`2026-08-24-gameplay-framework-r1b-integration-design.md`](superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md)：Gameplay Framework、RuntimeHost、R1b、Camera 与 Browser V5 的唯一所有权和事务融合合同；执行见同名实施计划；
- [`2026-08-24-gameplay-browser-g19-6-review.md`](reviews/2026-08-24-gameplay-browser-g19-6-review.md)：G19-6 Browser V5/Snapshot V4、RuntimeHost Activity 与 consumer cutover 的 Final GO disposition；completion review 已由 `5ffd031` 合入 `main`；
- [`2026-08-24-g19-7-outdoor-gameplay-completion.md`](reviews/2026-08-24-g19-7-outdoor-gameplay-completion.md)：G19-7 六场景 Gameplay 与 artifact-only 生命周期的完成证据；
- [`2026-08-24-unreleased-compatibility-clean-break-design.md`](superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md)：G19-8 未发布协议 clean break 的权威边界、UCCB 依赖图与零消费者门禁；
- [`2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md`](superpowers/plans/2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md)：UCCB-65 历史命名、公共导出、隐式兼容行为、生成资产与延期清理账本的专项执行计划；
- [`2026-08-25-gameplay-g19-8-completion.md`](reviews/2026-08-25-gameplay-g19-8-completion.md)：G19-8 current-only clean break、全量门禁与 Final GO disposition；
- [`2026-08-24-context-driven-gameplay-camera-composition-design.md`](superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)：Kit、Relationship、Action、Equipment、Flight 与 Camera Context/Director 的设计输入；Camera Domain 已实现的部分和剩余集成以本页 P2.4 为准；
- [`2026-08-25-context-driven-camera-package-boundary-review.md`](reviews/2026-08-25-context-driven-camera-package-boundary-review.md)：Camera 分包决策的历史审查证据，不是 active 实现状态或可用入口；
- [`2026-08-19-world-validation-report-and-quality-gates-design.md`](superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)：量化 Gate、Metric、Evidence 和生产阻断协议；
- [`2026-08-20-ai-authored-geometry-extension-design.md`](superpowers/specs/2026-08-20-ai-authored-geometry-extension-design.md)：未来可能需要的 AI 自定义几何能力及候选技术，仅供调研评审，不属于当前 Roadmap；
- `docs/superpowers/plans/`：已经进入实施阶段的单个纵向切片计划与证据。

如果本文与已接受的 ADR、Canonical Schema 或真实代码不一致，以已接受 ADR、
Schema 和测试通过的实现为准，并在同一次变更中修正本文。

## 2. 进度计算口径

进度不是文档章节数、代码行数或测试数量，而是按生产目标的能力权重估算。
设计完成但没有实现的能力最多只能计入该工作流的 20%；只有同时通过 Schema、
Normalizer/Compiler、Runtime、CLI/Browser 和对应 Conformance Gate 的纵向切片才
可以标记为完成。

| 工作流 | 权重 | 当前完成度 | 加权贡献 | 判断依据 |
|---|---:|---:|---:|---|
| 架构、边界与命名 | 8% | 96% | 7.7% | 总规格、ADR、主体/地形/3C 和 Placement/Take/Validation 专项已成稿；Validation Capture/Integrity V1 的字段与 Policy 已冻结并实现 |
| Canonical Schema、IR、Registry 与 Compiler | 15% | 88% | 13.2% | Authoring V4 → IR V4 → Plan V5 已自包含并直接编译；旧 V3/V4 顶层协议已从已提交路径删除，Subject capability assembly 成为必填锁；完整 P1.4 发布格式与 WorldChangeSet 尚未交付 |
| Babylon/Havok Runtime、物理与相机 | 15% | 75% | 11.25% | Heightfield、障碍、水域、多主体、第三人称、碰撞、资产主体、Placement Assertion 与五 Pass Capture 已交付；多视角与完整生产预算尚未完成 |
| Subject LEGO 组装体系 | 15% | 45% | 6.75% | S0、S1a、Golden 与首个产品 G Bot 可视切片已完成；S1b 后续、S2、S3、S4 尚未完成 |
| Terrain、Region 与 Placement | 12% | 74% | 8.88% | Alpha 地形和 Placement Solver S1 已运行；Route R0、R1 Heightfield 与 R1b Static Platform 已审查/门禁关闭；通用 Terrain Mask、更多 Constraint 与完整 P0.1 未完成 |
| CLI、Browser Protocol 与自动化 | 10% | 90% | 9.0% | 已交付 Take/Capture、`verify capture|explain`；Route `verify route`、R1 Golden Fixture、可信 Host Evidence Transport、Browser V5 clean break 已完成；compare、持久 Session 和完整 Package 工具未完成 |
| Semantic Action、动画与 Gameplay | 8% | 80% | 6.4% | Golden 与 G Bot `idle/walk/run/jump` 已交付；G19-2 至 G19-8 的 Command/Receipt/Event/State、RuntimeHost、Babylon/Browser、Outdoor 生命周期及 current-only clean break 已完成；姿态、装备、关系与规则仍未交付 |
| Simulation Take、控制通道与视频接入 | 10% | 70% | 7.0% | V1 Take、五 Pass、Bundle 和真实浏览器 Gate 已交付，Capture/Integrity 已进入统一 Report；完整 Replay/Resume 与模型 Adapter 未交付 |
| 生产 Gate、默认切换与旧实现退出 | 7% | 95% | 6.65% | Canonical/资产/Placement/Capture/Route/Outdoor Gate 全绿；未发布旧路径已清理，clean-break census 为 632/0/489；HNC-F1 作为首次 Alpha 前的新一轮全面审计保留 |
| **合计** | **100%** |  | **约 77%** | 对外按通用 Terrain、完整统一生产 Gate、WorldPackage 与视频闭环的不确定性保守报告 **约 68%** |

“第一条 Canonical 纵向切片约 90%”只指以下较窄范围：AI 提交 JSON，SDK
完成严格校验、确定性编译、Babylon/Havok 运行、多主体控制、首个 Golden Asset
Subject、首个产品 G Bot、Placement S1、截图和查询。它不代表任意产品资产、完整 S1b/P0.1、关系、
完整动作、复杂地形、生成式视频闭环或生产切换已经完成。Simulation Take / Control
Capture V1 是独立的新纵向切片，不改变该 90% 口径。

## 3. 当前已完成并进入回归的能力

### 3.1 Canonical 编译底座

- [x] Canonical Authoring V4 是唯一接受的 JSON 输入；已被替代的 V1–V3 顶层输入不再进入当前生产链路。
- [x] 严格 JSON Schema、关闭未知字段、语义校验和结构化 Diagnostic。
- [x] 自包含 NormalizedWorldIR V4 与 ExecutionPlan V5；Compiler 从 IR V4 直接生成 Plan V5，不再投影到旧顶层协议。
- [x] Canonical JSON Bytes、稳定 SHA-256、Definition Hash 和 Resource Lock。
- [x] 精确版本的 Registry Capability/Profile/Subject Definition 解析；进入 Runtime 的 Subject 必填完整锁定 capability assembly。
- [x] Compiler 和 Runtime 不读取 Authoring 原始输入，也不在协议中暴露 Babylon/Havok Handle。

### 3.2 Subject Foundation S0 与 Package Definition S1a

- [x] 多 Subject Instance、稳定 Entity ID、独立状态和独立 Havok Controller。
- [x] Registry 与 Package 局部 Primitive Subject Definition。
- [x] Primitive Visual Part、局部 Transform、Semantic Tag 和 Socket。
- [x] 版本化 Collider Derivation Profile 与确定性 Capsule 推导。
- [x] Definition/Instance 分离；同一 Definition 可以生成多个独立实例。
- [x] 默认 Controller 原子切换、稳定失败、重置和 Snapshot。
- [x] Registry Discovery、Definition Validate 与 Subject Explain。

完成证据：

- [`Subject Foundation Visible Slice`](superpowers/plans/2026-08-19-subject-foundation-visible-slice.md)：49 项完成、0 项打开；
- [`Package Subject Definition Visible Slice`](superpowers/plans/2026-08-19-package-subject-definition-visible-slice.md)：73 项完成、0 项打开。

### 3.3 Subject S1b Golden 与首个产品 G Bot 可视切片

- [x] 项目自有、自包含 Golden GLB、原始字节 SHA-256 与精确 Inventory。
- [x] Subject Asset、Rig Profile、Animation Set、Collider Profile 与 Definition Registry。
- [x] Host Asset Resolver、长度/Hash/GLB/Inventory Gate 与 Babylon AssetContainer 缓存。
- [x] 独立 Skeleton/Animation/Transform/Dispose、Bone Socket 与白模材质。
- [x] 固定 Tick `idle/walk/run/jump`、Snapshot `activeActionId` 与 Havok 权威位移。
- [x] CLI/Browser 两实例、墙体停止、五张动作/世界截图与 Hash 篡改失败 E2E。
- [x] G Bot 通过产品 Manifest → Registry Rig/Animation/Collider/Definition 映射；
  World JSON 只引用稳定 `subjectDefinitionRef`。
- [x] G Bot 真实 5.30MB GLB、65 Bone、25 源 Clip 与当前四动作通过独立
  `pnpm verify:g-bot-subject` Gate、双实例隔离、墙体停止与五张截图。

未完成：更多产品资产、Compound Collider、LOD、更多拓扑、独立动画资产、通用姿态、
游泳、装备、坐骑和飞行。

### 3.4 当前 Runtime 与工具纵向切片

- [x] Babylon.js 右手坐标 Runtime 与 Havok WASM。
- [x] Heightfield、静态障碍物、角色碰撞与固定 Tick Ground/Air 介质解析
  （水介质状态切换已随 P1.5 首切片收敛到 P2.5，不再由 Adapter 硬编码发布）。
- [x] 第三人称跟随相机和受控主体切换。
- [x] `worldkit validate / build / run / capture`。
- [x] Browser Protocol V5 exact 39-key surface 保留加载、固定输入、Capture、Snapshot、Reset、
  Camera Preview 与多 Surface Route Evidence V2，并增加 Gameplay Command/Event/World State/
  Runtime Activity；不公开 `bindControl`，不保留并行 V4 alias。
- [x] G19-6 已把 Authoring、CLI/WorldKit pipeline、Control Capture、
  Simulation Take 与 Canonical/Placement/Rigged/G Bot verifier 迁移到 Snapshot V4 和
  `executeGameplayCommand(control.bind)`；Execution Subject 现必填锁定的 locomotion Capability Ref/Hash，
  Runtime 发布 Canonical locomotion capability state。Placement 已使用 Authoring/IR V4 → Plan V5 →
  Snapshot V4/Browser V5，Rigged/G Bot 修复异步 `page.evaluate` 边界，fixed-input pause 在 `finally`
  恢复。WorldPackage Runtime 配置构建阶段的资产失败在公共 Authoring 边界稳定 fail closed。
  主 locomotion Capability 使用已选 locomotion Capability 子图的唯一 dependency leaf：排除被其他已选
  locomotion Capability require 的节点；Definition 锁 Ref/hash，Compiler/Runtime 不猜 `ground`。
  最终 full regression、两项 Capture gate 与 completion review 已收口；该切片 Final GO，已由
  `eef75c6` / `5ffd031` 合入 `main`。
- [x] G19-7 已把六个 Outdoor/catalog 场景接入同一 Gameplay Runtime，并保持 artifact-only
  renderer 不暴露 `__WORLDKIT__` 或 Gameplay 方法；真实 Browser Gate 通过 6/6 Gameplay、
  6/6 artifact-only 与 unknown-scene fail-closed。G19-8 已继续关闭 clean break 与最终全量验收。
- [x] 真实 Chromium 下验证 Package Definition 的两个实例可以分别控制。

2026-08-20 的新鲜验证证据：

- `pnpm typecheck`：通过；
- `pnpm test`：49 个测试文件、441 项测试通过；
- `pnpm verify:canonical`：Authoring 3、Normalized IR 3、ExecutionPlan 4、
  Runtime Snapshot 3、Browser Protocol 3 全部通过；
- Canonical Browser Gate 覆盖 Babylon/Havok、墙体阻挡、湖区进入时保持封闭
  Ground/Air 介质集合、两个 Package Subject 独立控制和确定性重置。
- `pnpm verify:rigged-subject`：项目自有 Golden GLB、Rig、Collider Profile、
  `idle/walk/run/jump`、双实例隔离、墙体停止、936×596 截图与
  `SUBJECT_ASSET_HASH_MISMATCH` 篡改 Gate 全部通过；`verification.json` V2 还用
  Foreground-origin Subject Silhouette 证明六组动作姿态差异率均高于 0.15，
  最低为 0.281609。
- `pnpm verify:g-bot-subject`：首个产品 G Bot 的 GLB/Manifest/Registry 映射、
  `idle/walk/run/jump`、双实例隔离和墙体停止通过；资产 Hash 为
  `sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b`，
  Walk 在 Tick 16、Jump 在 Tick 30 捕获，六组姿态差异率最低高于 0.79。
- `pnpm verify:placement-layout`：八种 Constraint、19 条海湾约束、Report → IR →
  Plan → Snapshot、Runtime Assertion、连续/并发确定性、冲突、篡改和预算门禁全部通过；
  936×596 Screenshot Hash 为
  `sha256:d5c8c2bd8bbba62c86903679792094d0e00d1f1d1d6ba5d55e743d409a414f04`。

## 4. Master Backlog

优先级表示产品验证和架构依赖顺序，不表示可以跳过低优先级能力的生产门禁。
每个新纵向切片在实施前必须有独立设计或实施计划；本文不替代具体 Schema 和
测试规格。

P1.5、P1.6、P2.5 与 P2.6 是把既有总体设计和产品对接契约显式落入可验收 Backlog，未扩大
既定产品范围，也不因“写入待办”提高当前完成度。

### P0：完成产品核心闭环

#### P0.1 Placement Constraint 与确定性 Layout Solver

目标：让 AI 表达空间意图和硬约束，由 SDK 生成可解释的最终 Transform，而不是
要求模型为所有实例猜绝对坐标。

- [x] 编写 [Placement Constraint / Layout Solver 专项设计](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)。
- [x] 评审并冻结专项设计中的字段、版本、首批 Constraint 与 Fixture（方案 2 的原始冻结发生于
  2026-08-20；当前实现已 clean break 迁移到 Authoring V4 / NormalizedWorldIR V4 / ExecutionPlan V5）。
- [x] 冻结 Placement Constraint 与 Gameplay Relationship 的协议边界。
- [x] 定义关闭枚举的 Required/Preferred Constraint 判别 Union。
- [x] S1 覆盖 Region 内外、距离、方向、支撑、净空、坡度和镜头可见性；Route 以坡度约束/证据进入，未伪装成延后的 `connected-by-route` Kind。
- [x] 定义 Normalized Constraint、Solver 输入、稳定排序、Seed 和预算。
- [x] Solver 输出 Transform、Provenance、违反项、评分和冲突核心。
- [x] 失败返回结构化 Diagnostic 与不自动提交的修复建议。
- [x] CLI 支持 validate/solve/explain，并输出可审计 Solve Report。
- [x] Browser Fixture 覆盖接地、无穿插、Spawn/Route 坡度和 Opening Shot Anchor。
- [x] Golden Fixture 证明相同输入和 Lock 在连续/并发执行中得到相同 Transform 与 Report Hash。
- [ ] 引入通用 Terrain Mask 与内容寻址 Region 数据，不复制 Heightfield/Water 真相。
- [x] 编写 [Route Graph 与主体可通行性专项设计](superpowers/specs/2026-08-21-route-graph-and-traversability-design.md)，
  并完成 [作者审查](reviews/2026-08-21-route-graph-traversability-design-review.md)与
  [独立审查/处置](reviews/2026-08-21-route-graph-traversability-independent-review.md)；明确
  AI Route 意图、`hard-ribbon`、分层 3D Graph、单一 Traversal Lock、真实控制器 Gate 与
  M5 完成标准。
- [x] 编写 [R0 实施计划](superpowers/plans/2026-08-21-route-graph-traversability-r0-implementation-plan.md)，
  将 Planner Route 归一化、Surface 身份、Lock/Driver、Metric/Diagnostic 和 Conformance
  拆成可追踪任务；计划完成不等于字段已冻结。
- [x] R0 实施并冻结 `connected-by-route`、Traversal Graph、`resolvedTraversalLockHash`、
  Driver 关闭白名单、Surface 身份、Evidence 与 Diagnostic 字段；通过下一 Canonical Major
  干净升级，不向已实现 V3 偷加空枚举。证据：`pnpm verify:route-r0-contract`。该命令只冻结
  合同，不表示 `route-connectivity` / `route-runtime-conformance` 已实现。已评 Runtime
  Metric 必须引用 `route-runtime-probe-receipt`；主体步高/坡度/净空/缝隙阈值来自 Lock，
  不写进 Validation Profile。
- [x] 编写 [R1 Heightfield 实施计划](superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md)，
  将 Authoring V4 → IR V4 → ExecutionPlan V5、Recast Provider Adapter、确定性 Graph/Query、
  单一 `checkSupport()` Runtime Evidence、真实 Babylon/Havok Probe、双 Blocking Gate、CLI/Browser
  与对抗 Fixture 拆成可追踪任务。计划成稿本身不等于 Runtime 已实现；Heightfield Runtime 由下一勾选项关闭。
- [x] R1 实现普通人形 Heightfield Route：坡度、静态阻挡、胶囊宽高净空、缝隙、确定性
  Path Query 与真实固定 Tick Character Controller Gate；P1.5 Ground/Air Runtime 已删除
  步高/坡度 Motion fallback、spawn ray 和 AABB Support 旁路，原前置阻塞已解除。
  Task 1–8 审查关闭记录见既有 Task 段落。Task 9 的 11 个 Authoring V4 Golden/Adversarial
  Fixture 与 `pnpm verify:route-r1-heightfield` 已进入回归；Task 10 全维度 Runtime Review
  见 [2026-08-22-route-r1-heightfield-runtime-review.md](reviews/2026-08-22-route-r1-heightfield-runtime-review.md)。
  R1 Heightfield 已关闭；R1b 与 M5 的完成证据见下项。
- [x] R1b Task 9 已实现最小 Traversal Surface → Collider Subshape 合同，覆盖地形、
  台阶、坡道和普通静态平台；阈值从同一 `resolvedTraversalLockHash` 推导，当前锁定
  `0.3m` 人形 Profile 的 Golden 要求 `0.25m` 通过、`0.35m` 失败。11 个 Fixture、
  V2/V5 clean break、R0/R1/R1b 聚焦门禁与 43 files / 525 tests 已通过。
- [x] R1b Task 10 已完成并关闭 R1b/M5：首轮 Cursor chat
  `1e938715-a5b2-4a25-ad83-45eec0c37c15` 对 `28752e0` 为 Final GO / No findings，
  同时给出 Runtime ambiguous 诊断分层建议；主审确认该分层问题并修复为 `506e088`，
  三模式回归证明 Runtime `unmatched / ambiguous / wrong resolved Surface` 均输出
  `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`。修后 `typecheck`、148 files / 1577 tests、
  `build`、R0、R1、R1b 11/11、Canonical、Placement、Rigged、G Bot 与 `diff-check`
  全部通过；条件复核 chat `d61f751c-a398-4063-bcbf-2ddc55ea20a9` 对 `506e088`
  再次为 Final GO / No findings，最终无 open confirmed P0/P1。
- [x] Required 路线接入统一 Validation Report；Graph 通过但真实 Controller 卡住仍为
  Blocking Failure，并输出台阶、坡度、宽高净空、缝隙、Surface 身份和卡住坐标。
- [ ] 增加 S1 之外的 Constraint、增量求解等价证明和通用 ValidationReport。

S1 纵向切片完成标准已满足：一个室外海湾场景不依赖 Agent 手写三个地标和 Spawn
最终坐标，Solver 输出通过 Schema、Physics、Route 和 Composition 阻断 Gate。
P0.1 整体仍以上述三项开放能力及生产范围扩展为完成标准。

#### P0.2 Simulation Take 与 Control Capture Bundle

目标：把“世界是什么”“本次怎样操作/拍摄”“输出给视频模型的控制信号”分成
三个独立、可哈希和可重放的制品。

- [x] 编写 [Simulation Take / Control Capture Bundle 专项设计](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)。
- [x] 评审并冻结 V1 字段、`web-v1` 编码 Profile、时间映射与两个 Fixture。
- [x] 冻结 V1 Simulation Take、Runtime Session、Control Capture Bundle 与过渡期 WorldPackage Root Hash 的引用关系。
- [x] 定义 V1 Scripted Controller、Control Intent/Camera Rig Track、Tick Range 和 Capture Schedule。
- [x] 定义 Simulation Tick、Render Frame 与 Capture Frame 的显式映射。
- [x] 定义版本化 Capture Profile 和第一批必需 Pass。
- [x] 实现 Neutral Color、Linear Depth Meters、Semantic Class ID、Stable Instance ID、World Normal。
- [ ] 评估并决定 Motion Vector、Albedo、Roughness、Metallic 和 Lighting Profile 的阶段。
- [x] 每帧记录 Camera Intrinsics/Extrinsics、Snapshot 和三种明确计数器。
- [ ] 接入 Event/Action/Relationship Receipt；V1 对应 Track 文件为空，不宣称已有事件证据。
- [x] Bundle 固定过渡期 WorldPackage、IR、ExecutionPlan、Session 和 Take Hash，并交叉验证引用。
- [ ] 完整 WorldPackage/Registry Lock 发布格式与 Bundle 签名。
- [x] CLI/Browser 支持确定性运行 Take、等待 Render Ready、批量捕获和原子失败清理。
- [ ] 可证明相同 Snapshot 的 Resume/续拍协议。
- [x] Playwright Fixture 验证真实 Chromium 五 Pass 尺寸、ID 集合、深度单位、法线和 Hash 归属。

V1 窄纵向切片完成标准已满足：同一个过渡期 WorldPackage Identity 可以运行两个不同
Take，生成互不混淆且自校验的多通道 Bundle。P0.2 整体仍以上述 Event/Receipt、完整
WorldPackage、Resume 与完整 Replay Gate 为完成标准。

#### P0.3 Validation Report 与量化质量门禁

目标：用统一、可解释、可哈希的 Profile/Report 决定世界和控制制品能否进入下一
阶段，避免不同脚本各用一套阈值或以总体分数掩盖关键失败。

- [x] 编写 [World Validation Report 与质量门禁专项设计](superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)。
- [x] 冻结 Capture/Integrity V1 的 ValidationProfile、ValidationReport、Gate、Metric、Evidence 与 Canonical Hash；其他 Subject Union 后续按版本扩展。
- [x] 冻结并测试 Blocking/Advisory、Required Missing、Incomplete 和 Policy Decision 语义。
- [x] 定义并实现 Capture Completeness、Capture Ownership 与 Bundle Integrity 三个首批 Gate；Schema/Layout/Physics/Route/Composition/Replay/Performance 仍待接入。
- [x] 把 Capture V1 的 Evaluator Ref、Evidence 归属与 Depth 单位语义写入版本化 Profile；Platform-measured 阈值仍待后续 Profile。
- [ ] CLI 的 `verify capture`、`verify explain` 已完成；`verify compare`、Browser/CI Evidence 发布仍未完成。
- [ ] Capture Fixture 已覆盖 Depth、帧归属和 Hash 损坏；浮空、穿插、不可达、Anchor 缺失仍待 Placement/Runtime/Composition 接入。
- [x] 纯 Policy 测试证明 Blocking Failure 优先于 Incomplete，Advisory 不能抵消，Required Metric 缺失为 Incomplete。

已完成切片证据：

- [Validation Capture/Integrity V1 实施计划](superpowers/plans/2026-08-21-validation-capture-integrity-v1.md)；
- `pnpm verify:validation-capture`：正常、缺 Pass、坏 Depth、混 Take、坏 Hash 五类确定性 Fixture；
- `packages/validation` 与 `worldkit verify capture|explain`。

完成标准：Placement 和 Capture 首条纵向切片都通过同一版本化 Validation 协议，
每个失败能落到唯一 Gate/Metric/Diagnostic，并产生可审阅修复建议。

#### P0.4 白模到生成式视频的第一条纵向切片

- [ ] 冻结一个不进入 Canonical Schema 的 Video Model Adapter 接口。
- [ ] 选择一个首批模型/工作流作为实验 Adapter，并单独记录许可证与运行环境。
- [ ] 固定一个包含地形、水体、主体移动、障碍和相机运动的 WorldPackage/Take。
- [ ] 导出 Neutral Color、Linear Depth、Semantic、Instance、World Normal 和 Camera 控制序列。
- [ ] 生成最终视频，并保留 Adapter 配置、输入 Bundle Hash 和输出 Provenance。
- [ ] 验收 Region、Anchor、主体身份、接触、遮挡、运动方向和长视频漂移。
- [ ] 失败可以定位到 Authoring、Solver、Runtime、Capture 或 Model Adapter，而不是只返回总体分数。

完成标准：Prompt/参考图 → 外部 Agent JSON → SDK 白模模拟 → 控制 Bundle →
最终视频的闭环可以重复运行，并生成结构一致性报告。

### P1：补齐生产世界的基础表达

#### P1.1 Canonical Terrain、Region 与 Mask Pipeline

- [ ] 依据 Terrain 子规格冻结首个 Canonical Terrain Source 和 NormalizedTerrainIR 纵向切片。
- [ ] 实现内容寻址的 Height Raster、Semantic Mask、Evidence Mask 和 Protected/Constraint Mask。
- [ ] 实现 Region Graph、Water/Spawn/Platform/Route Constraint 与冲突报告。
- [ ] Mesh、Havok Collider、Height/Slope Debug Pass 使用同一权威 Height Resource。
- [ ] 实现大地图 Tile、边界 Seam、资源预算、Dispose 和缓存失效。
- [ ] 用冻结 TerrainBenchmarkManifest 比较图片输入路线，不把模型名称写入公共 Schema。
- [ ] CLI/Browser 输出 Height、Slope、Semantic、Collision 和 Constraint Delta Artifact。
- [ ] 至少一个参考图海湾场景通过拓扑、路线、构图和物理 Gate。

#### P1.2 Subject S1b：资产型 Definition 与扩展 Collider

- [x] 接受首个 GLB/版本化 Asset Part、Rig Binding、Animation Set、Collider Profile、Host Resolver 和资产 Provenance 字段级设计。
- [x] 按 [`Asset Subject S1b 可视切片实施计划`](superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md) 打通 Golden Humanoid 的 Canonical → Babylon/Havok → CLI/Browser 纵向链路。
- [ ] 支持 Compound Collider 和更多确定性 Collider Derivation Profile。
- [x] 为 Golden 切片定义并验证 Pivot、Forward Axis、Scale、Socket/Bone Binding 与单位检查。
- [ ] 建立资产导入、License/Hash、预算、LOD、Skeleton 和动画 Clip 验收。
- [ ] 证明 Primitive 白模可以替换为人形、四足或非人形资产而不改变 Entity ID 和 Gameplay 身份。
- [x] Golden 切片中缺少 Rig、Clip、Collider 或 Socket 时返回稳定 Diagnostic，不静默猜测。
- [x] 把 G Bot 的 Manifest/Registry/Gate 固化为
  [`Product Asset Intake Template`](superpowers/specs/2026-08-21-product-asset-intake-template-design.md)
  与 Fixture `examples/product-asset-intakes/humanoid.g-bot@2.json`；未接入第二个产品 GLB。

#### P1.3 Semantic Action 与 Animation Binding

- [ ] 冻结 ActionDefinition、Action Request/Receipt、Context 和 Channel Lock。
- [x] 实现首个 Golden `idle/walk/run/jump` 固定 Tick Action 与动画映射。
- [ ] 冻结版本化 `ActionVariantSet` 与 `PoseSetProfile`；人形动作变体和非人形稳定姿势
  都必须由语义 Action/Context 解析，不能从 Clip 名、骨骼名或资产文件名反推。
- [ ] 冻结 `HumanoidPostureModeV1 = "standing" | "crouched" | "prone"`；Runtime Snapshot 必须同时暴露实际 `postureMode` 与 `activeActionId`，不能根据动画名称反推姿态。
- [ ] 增加通用 Humanoid Action Pack：`fall`、`land`、`crouch-enter`、`crouch-idle`、`crouch-walk`、`crouch-exit`、`prone-enter`、`prone-idle`、`crawl`、`prone-exit`；源 Clip 名只允许在版本化 Animation Set 中映射。
- [ ] 为站立、蹲伏、趴伏定义版本化 Capsule；切换时保持 Support Center/脚底位置，起身前使用 Havok Shape Proximity 做净空检测，空间不足返回稳定 `SUBJECT_POSTURE_BLOCKED`，不允许穿入低矮障碍。
- [ ] Ground Locomotion Profile 增加单位明确的蹲走与匍匐速度；`run` 和 `jump` 只在实际 `standing` 姿态生效，蹲伏移动解析为 `crouch-walk`，趴伏移动解析为 `crawl`。
- [ ] 实现纯固定 Tick 姿态/动作 Reducer：空中上升为 `jump`、下降为 `fall`、落地为 `land`；姿态过渡、打断优先级、Reset 和同输入重放结果必须确定。
- [ ] Animation Set 缺少专用过渡 Clip 时只允许走声明式 Fallback；不得猜测源 Clip 名，也不得让 World Agent/Babylon Adapter 临时补分支。
- [ ] CLI/Browser/E2E 覆盖站立→蹲伏→趴伏→受阻起身→净空起身、独立双实例、碰撞体尺寸切换、固定 Tick Replay 和各姿态截图。
- [ ] 实现 Cancel/Interrupt、固定 Tick 提交和 Replay 记录。
- [ ] 实现 AnimationSet 替换与缺少专用动画时的声明式降级。
- [ ] 验证成人/儿童、空手/持剑、地面/游泳等 Context Variant。
- [ ] Gameplay Action 与纯视觉动画状态保持分离。

#### P1.4 WorldPackage 与持久 Runtime Session

- [x] 为 Task 8 在 `@whitebox-world/world-package` 冻结并实现最小正式 `WorldPackageManifestV1` 与
  `WorldPackageBuildReceiptV1`，让其成为 Package Root Hash 的唯一权威；复用并交叉校验
  已有权威来源的 `authoringSpecHash`、`normalizedWorldIrHash`、`executionPlanHash`、
  `resourceLockHash`、`layoutSolveReportHash`。过渡期
  `deriveTransitionalWorldPackageIdentityV1()` 与 `WorldBuildArtifactV3` 不得冒充正式 Package
  Root。该窄合同已解除 Task 8 Validation-subject seam 的阻塞；包归属相对原计划从
  `@whitebox-world/protocol` 修正为独立装配边界，避免基础协议反向依赖 Authoring、Compiler、
  Layout 与 Runtime Contracts。该项完成不表示 P1.4 整体完成。
- [ ] 冻结可独立校验、加载和运行的 WorldPackage 目录与 Manifest。
- [ ] 实现 Package Root Hash、完整性、签名输入、License/NOTICE 和 Host Compatibility Gate。
- [ ] CLI 支持 package、inspect、load 和 run-session。
- [ ] Runtime Session 支持 NDJSON 或等价的有生命周期协议、Request ID、Receipt 和恢复语义。
- [ ] 加载新 Package 前完成旧世界 Dispose、Ownership Ledger 清空和 World Ready Gate。

#### P1.5 Subject Control Feel、Physics Medium 与 State Resolver

目标：把“主体怎样响应输入”“主体在地面、水中和空中受到什么物理影响”“当前应该
激活哪种运动和动作状态”变成版本化、可组合、可锁定的 Profile，而不是继续留在
Babylon/Havok Adapter 的硬编码分支中。字段职责以
[`主体资产与 3C 对接设计`](16-subject-assets-3c-integration.md)为基础，实施前必须完成
专项评审；本 Backlog 不提前冻结最终公共字段名。

首条 Ground/Air 纵向切片已按
[`P1.5 Control Feel / State Resolver 首切片实施计划`](superpowers/plans/2026-08-21-p15-control-feel-state-resolver.md)
实施并通过全部生产 Gate（typecheck、test、build、verify:canonical /
placement-layout / rigged-subject / g-bot-subject）；专项规格见
[`Control Feel、Physics Medium 与 State Resolver 设计`](superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md)。
水/游泳介质、Hybrid Surface、统一 Validation 与新 CLI/Browser 协议字段均未随该切片交付。

- [x] 评审并冻结 `LocomotionProfile` 与 `ControlFeelProfile` 的唯一字段归属：前者负责
  运动模式及能力边界，后者负责加速度、减速度、转向速率、响应曲线和空中控制比例；
  奔跑等速度不得在两种 Profile 中形成同义字段或双重真相。
- [ ] 冻结 `ControlMethodProfile` 与语义 Intent Pipeline：Direct Move、Steering、Swim、
  Flight 等方法复用同一控制协议，由 Capability/Context 选择，World Agent 不直接调用
  人物 Motor、车辆控制器或飞行实现。
- [x] 定义版本化 `PhysicsMediumProfile` 的 Ground/Air 首切片
  （`worldkit://medium-profile/ground-air.standard@1`）：世界保留唯一全局重力向量，
  介质只声明相对重力倍率与线性阻力，数值字段按命名规则携带 `Ratio`/单位后缀；
  发布 `water` 介质在 Resolver/Compiler 路径以 `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`
  稳定失败。
- [ ] 扩展水介质：浮力、表面保持与水中安全边界（随 P2.5 水切片交付，不提前发布
  `movementMedium: "water"`）。
- [x] 纯固定 Tick `StateResolver` 首切片：发布的 `movementMedium` 只有
  `ground`/`air`，支撑状态由 Havok `checkSupport` 唯一拥有，Sliding 不允许起跳、
  不重置 Coyote，不依赖动画状态或渲染帧率判断。
- [ ] 定义 `MediumSensor` 与 `SubjectStateProfile`；Water 的进入/退出使用迟滞阈值和
  明确优先级（随 P2.5 交付）。
- [ ] 普通 Agent 只选择已注册 Profile；高级覆盖必须经过 Definition 的
  `allowedOverridePaths`、Schema 范围、Host Policy 和 Resource Budget，禁止直接填写
  Babylon/Havok Handle 或控制器实现参数（首切片改用编译后的
  `availableControlFeels` + `requestControlFeelProfile`，未冻结公共
  `allowedOverridePaths` 结构）。
- [ ] 为所有数值字段声明单位、有限值、最小/最大值和跨字段约束；非法 Profile 在
  Registry Admission 阶段失败，不能等到 Runtime 再钳制或猜测。
- [ ] Profile 的精确版本、Canonical Hash 和依赖进入 Registry Lock；Normalizer 和
  Compiler 将最小、引擎无关描述投影进 IR/ExecutionPlan，Runtime 不反向读取 Registry。
- [x] Babylon/Havok 去除主体加速度、水中重力倍率和相关介质响应硬编码；Adapter 只
  执行已编译参数，并保持固定 Tick、失败回滚、幂等 Dispose 与资源所有权边界。
- [x] Snapshot/Render Binding 暴露实际 `movementMedium`、`locomotionMode`、状态与生效
  Profile 引用，使 Agent、Capture 和视频 Adapter 不需要从动画 Clip 猜 Gameplay 状态。
- [x] Runtime Conformance 覆盖两种可区分 Control Feel
  （`humanoid.medium-ground@1` / `humanoid.heavy-ground@1`）、30/60/120 Hz-like 渲染
  节奏下的同输入固定 Tick Replay、Reset Bootstrap + `checkSupport`、双实例 Feel 隔离、
  0.4 m Ledge/Coyote/Jump Buffer 与 Hold/Release 重力比；缺少 Profile 时返回稳定
  Diagnostic。
- [x] Runtime/Browser 只允许在 Execution Plan 已锁定的 Control Feel Ref 间切换；移除
  Feel/Control 会话数字 overlay、Snapshot 数字袋与通用 Browser 数字调参入口。本地草稿和
  Candidate 仍可保存数字差异，但必须经 `promote` 物化为新 Registry 版本后才影响玩法。
- [ ] CLI/Browser/E2E 覆盖不同主体重力倍率、Ground→Water→Air 稳定切换与边界抖动
  （不新增 CLI/Browser 协议字段，随后续切片交付）。
- [x] Playground `listSubjectPresetAuthoringProfilesV1` 只列出该主体 Definition 声明的
  `allowedControlFeelProfileRefs`（经 `selectableControlFeelProfileRefsV1`），不再枚举
  Registry 全部 `control-feel-profile`。
- [x] `ControlFeelTuningV1` / `ControlTuningV1` 已迁到 `control-feel-parameter-contract.ts`；
  Runtime 会话类型不再暴露 Feel/Control 数字袋方言。草稿数字只在 authoring workspace，
  发布时物化新 Registry 版本。
- [ ] **P1.5 合入后仍待收尾**（不阻塞 Ground/Air 首切片）：
  1. [x] 相机数字 overlay 已在 Browser V5 基线上完成并达到 Final GO：删除 `setCameraTuning`、
     `applySubjectPresetTuning.cameraOverridesByProfileRef` 与 Snapshot `camera.tuning` / 旧
     `camera.preference`；数字 tuning 只走显式非 Gameplay 的 preview 通道
     （`getCameraPreviewState` / `applyCameraPreview`）。`requestCameraProfile` /
     `resetCameraProfile` 只是 P1.5 尚未发布的过渡协议；GCC-3 必须 clean break 为唯一
     `cameraViewPreference` 与 `view.camera-preference.set/reset`，不保留 alias。Preview 不属于
     Take 输入或 Gameplay Subject truth，但会改变 rendered Camera、Capture Matrix/Pixels 和
     Control Capture `frameHash`。最终 10 files / 190 tests 相机矩阵、Browser V5 / Route V2、
     Runtime、Canonical、Placement、Rigged、G Bot 与 Validation Capture 门禁已通过；两条
     full-suite Route 超时已串行通过并完成 `main` 对拍，确认是资源竞争而非 Camera
     regression。实施边界和例外见
     [`P1.5 相机收尾`](superpowers/plans/2026-08-23-p15-camera-tuning-cleanup.md)。
  2. [ ] P1.5 + Subject Preset 合并后的整支分支对抗审查另开，不把它当成合入门禁。

完成标准：仅替换版本化 Profile 就能改变主体的加减速、转向、介质重力/阻力和浮力，
同一输入与 Registry Lock 在固定 Tick 下得到相同 Snapshot/Hash；普通场景 JSON 不需要
复制底层参数，Canonical Runtime 中不存在对应 Provider 硬编码。

#### P1.6 AI Schema Profile、受控覆盖与 WorldChangeSet

目标：让上游 Agent 获得“小而稳定、能力感知”的 Schema，并能用领域操作增量修复
世界；不能要求 Agent 每次重写大型 Authoring JSON，也不能让 Provider Adapter 形成
第二套公共方言。

- [ ] 为 Canonical Schema + Registry Lock + 允许 Capability 集冻结版本化 AI Schema
  Profile/Projector；记录 Profile Hash、Registry Lock Hash、Capability Set Hash、规模
  预算和降级原因。
- [ ] Registry 枚举超过 Provider 结构化输出预算时，只能按 Profile 降级为带
  `format`/`pattern` 的 Canonical Ref；字段名称、语义和验证规则不得改变。
- [ ] 实现跨 Definition 通用的 `allowedOverridePaths` 校验、Explain 和拒绝诊断；
  Override 不能修改版本/Hash、权限、Provider 类型或未开放 Collider/Socket 内部结构。
- [ ] 冻结 `WorldChangeSet`/`ChangeReceipt`：稳定 ID、`baseAuthoringSpecHash`、Precondition、
  Dry Run、原子提交、幂等重试和增量/全量编译等价性，不使用数组位置驱动的通用 Patch
  作为生产协议。
- [ ] 明确两条写入平面：移动、攻击、骑乘等已有实体状态只走有权限的固定 Tick Runtime
  Command；增加/删除人物、房屋、障碍、资源或地形属于 Authoring 结构修改，只走
  `WorldChangeSet`，两者不能共用通用 `patch`/`execute` 接口。
- [ ] 第一条生产切片采用 Full Reload：在隔离候选中完成 ChangeSet Apply、完整
  Normalize/Compile/Package、预算与必需 Gate，再准备 Replacement Runtime；只有新 Runtime
  Ready 后才在 Phase Barrier 原子切换 Host/Browser 句柄并释放旧 Runtime，任一步失败都
  保留旧世界。
- [ ] Full Reload 默认创建新的 Runtime Instance、从 Tick 0 启动，不隐式搬运人物位置、
  速度、Action、Controller Binding 或 Camera 状态；允许保留的 Bootstrap/View Preference
  必须有显式输入，Receipt 必须列出替换、保留、重置和受影响的 ID/Hash。
- [ ] 第二条切片才支持受限 Incremental Hot Apply：每种 Operation/Node Kind 必须声明
  Transaction Handler、状态迁移策略和回滚；未受影响实体保持身份及运行状态，地形、
  全局物理、Schema/Profile Major、插件或不支持的资源变化必须稳定降级为 Full Reload。
- [ ] Incremental Commit 只能发生在固定 Tick Phase Barrier；Visual、Physics、Control、
  Camera、Relationship 和 Ownership Ledger 必须同时发布或同时回滚，并用 Differential
  Test 证明最终 Authoring/IR/ExecutionPlan 与 Full Build 完全等价。
- [ ] Runtime 发布请求除 `baseAuthoringSpecHash` 外，还必须绑定 Request/Session、期望的
  Runtime Instance/WorldPackage 和目标 Phase Barrier；过期或并发冲突稳定失败，不能把
  已验证的 ChangeSet 静默应用到另一个正在运行的世界实例。
- [ ] 已发布协议的破坏性升级使用显式 Version Migration，并输出迁移前后 Hash 和报告；
  未发布私有 Schema 仍按评审批准的 Clean Break 规则处理，不保留永久别名字段。
- [ ] CLI/Browser 提供 Schema Profile、Registry Search、Dry Run、Explain、Diff、Apply 和
  Receipt；结构写入只对受信 Authoring/Edit Session Scope 开放，不能因拥有页面脚本、
  `control.intent`、`capture` 或普通 `load` 权限而派生新世界；`load` 只允许加载 Host
  已批准的不可变 Package，任何调用方都不能直接修改 DOM、Babylon Scene 或 Havok World；
  Provider Adapter 输出必须重新通过 Canonical Schema 与语义验证。
- [ ] Conformance 覆盖 Schema 规模预算、Provider 降级、非法 Override、过期 Base Hash、
  重复 Request、Replacement Runtime 准备失败时旧世界仍可运行、Full Reload 状态重置、
  Incremental 未影响实体状态保留、部分失败回滚、增量/全量结果等价和 Migration Golden
  Fixture。

完成标准：至少两个结构化输出 Provider 使用同一 Canonical 字段生成有效世界；一次 AI
修复通过 WorldChangeSet 原子应用并可重放，Adapter、CLI 和 Browser 不产生同义字段或
绕过 Canonical Validation 的旁路；Receipt 能无歧义说明本次修改采用 Full Reload 还是
Incremental Hot Apply，以及哪些 Runtime 状态被保留、重置或替换。

### P2：完成 LEGO 关系与复杂主体

#### P2.1 Subject S2：类型化 Relationship Framework

- [ ] 按 [Canonical Runtime State 与 Semantic Projection 设计](superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md) 冻结 World State、View State、Runtime Status 与 Transition Log 四个公共投影；不扩充现有 `SubjectRuntimeStateV3` 大对象。
- [ ] 增加由 ExecutionPlan Resource Lock 约束的 `capabilityStatesById`，用闭合 Capability State Schema 扩展门、载具、飞行等状态，禁止自由 `state: Record<string, unknown>` 袋。
- [ ] Relationship Manifest Registry 和角色化端点。
- [ ] 初始 Relationship 编译与动态事务边界。
- [ ] Socket/Slot 兼容、基数、冲突、删除策略和权限校验。
- [ ] 固定 Tick 原子提交，失败时逻辑、渲染、物理、控制和相机全部回滚。
- [ ] 单一 Semantic Fact Projector 输出 `supportedBy/touching/insideVolume`，不导出 Babylon/Havok Handle 或另建 Ground Support 推断路径。
- [ ] Request ID 幂等、Receipt、关闭 Event Union、Snapshot/Transition Hash 和 Capture 关联。
- [ ] 第一个人—滑板 Fixture 完成绑定、移动、解绑、Reset 和 State/Event/Capture 对齐 E2E。

#### P2.2 Subject S3：骑乘、拖拽与控制上下文

- [ ] Mount/Seat/Stand/Tow Binding Profile。
- [ ] Socket Alignment、Physics Joint 与 Collider Group。
- [ ] Possession、Locomotion、Action 和 Camera Context 原子切换。
- [ ] Safe Exit/Detach 和无安全落点时的稳定失败。
- [ ] 人—坐骑、马—马车、汽车—拖车代表性 Fixture。

#### P2.3 Subject S4：装备、飞行与动作变体

- [ ] Equipment Slot、Rig Socket 和装备事务。
- [ ] 空手跑动、持剑跑动、持剑攻击与 Animation Variant。
- [ ] Flight Locomotion、起飞、飞行、降落和地面模式切换。
- [ ] 飞龙骑乘、控制权和 Camera Context 恢复。
- [ ] 组合关系解除后无残留 Collider、Joint、Listener、Action Lock 或控制绑定。

#### P2.4 多 Controller、相机模式与受控操作

- [x] 完成并评审 [上下文驱动 Gameplay 与 Camera 组合设计](superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)；接受 Kit → committed state → Camera Context → CameraDirector 单向链路、唯一 View Preference 和代表性 Fixture。
- [x] `@whitebox-world/camera` 已 clean-break 为 provider-neutral Domain，交付关闭的命名
  Rig/Modifier/Context Profile、`CameraContextSampleV1`、`CameraViewPreferenceV1`、Context/
  Preference admission、纯 `selectCameraViewV1`、fallback diagnostic 与 explain。
- [x] GCC-0B/GCC-0C：package API/dependency DAG 与 provider-negative 边界测试已建立；Camera
  Domain 不拥有 renderer、physics、Browser、Runtime Session 或 Gameplay State。
- [ ] GCC-0/GCC-0A/GCC-1：冻结 Browser V5/View clean break 与 committed Gameplay →
  `CameraContextSampleV1` Projection；不得保留旧命令 alias 或从 Render Pose 反推 Context。
- [ ] GCC-2/GCC-3：把已实现的 Profile admission/Selection/Explain 接入 Registry Lock、
  唯一 `cameraViewPreference` Command/View State 和原子拒绝语义。
- [ ] GCC-4 接线前必须解析选中 Rig 与全部匹配 Modifier 的最终参数，并对合并结果再次执行
  Camera Domain 不变量校验；当前 admission 只保证单个完整 Rig 与单个 partial Modifier 各自
  合法，不宣称跨 Rule/Profile 组合已经闭环。
- [ ] GCC-4/GCC-5：CameraDirector 消费纯 Selection Decision；Mount/Equipment/Flight 事务
  只提交 Camera 输入并与 Gameplay 一起原子回滚。
- [ ] GCC-6/GCC-7：交付两个 Kit、Registry Lock、Browser/CLI/Take 与两个 Golden Fixture，
  分离 automated contract、runtime numeric、rendered visual 和 manual interaction 证据。
- [ ] GCC-8：全门禁、包边界审计、最终复核和 production/experimental 声明。
- [ ] 同一 Runtime Session 创建多个 Controller 并在同一 Tick 提交 Intent Batch。
- [ ] Possession 权限、Sequence、Expected State 和冲突策略。
- [ ] 第一人称、第三人称和声明式 Camera Rig 切换。
- [ ] Browser/CLI 支持观察、控制、截图权限分离。
- [ ] 为上游 Agent 提供 Registry Search、Dry Run、Explain、Diff 和结构化修复工具，不提供底层引擎对象。

#### P2.5 Surface Semantics 与 Traversal Capability

目标：让“到水边游泳、到可攀爬墙面攀爬、到矮障碍翻越”由稳定 Surface/Volume 语义、
Sensor 和 Capability 组合触发，而不是按 Mesh 名称、颜色、材质或场景脚本猜测。该能力
已有产品方向，但尚未冻结专项 Schema；实施前必须先写独立设计和首个窄纵向计划。

- [ ] 冻结 Surface/Volume 语义与 Terrain/Obstacle 权威数据的引用边界；可行走、可游泳、
  可攀爬、可翻越等能力不得复制 Heightfield、Collider 或 Region 真相。
- [ ] 定义 Surface/Volume Query、Contact/Sensor Event、进入/退出迟滞、稳定 ID 与固定
  Tick 顺序；视觉材质和动画不能成为 Gameplay 判定来源。
- [ ] 定义 Traversal Capability/Profile 的适用主体、坡度/高度/净空/朝向约束、冲突、
  优先级和失败回退；普通 Agent 只选择已注册能力和 Profile。
- [ ] State Resolver 原子切换 Locomotion、Action、Collider、Control Feel、Physics Medium、
  Camera Context 和 Render Binding；任一准备步骤失败时全部保持上一稳定状态。
- [ ] 攀爬/翻越至少覆盖进入、循环、顶部退出、中止、无安全落点和控制权切换；不能用
  RenderNode 父子关系、瞬移或禁用碰撞掩盖逻辑缺口。
- [ ] CLI/Browser/E2E 使用同一人物完成地面→水中→地面以及地面→攀爬→顶部落地，验证
  无边界抖动、穿插、悬空、状态残留和 Replay 偏差。

完成标准：场景只声明权威 Surface/Volume 语义和主体 Profile，Runtime 就能在固定 Tick
下自动选择正确运动/动作模式；删除或修改视觉材质不会改变 Gameplay 结果。

#### P2.6 Hybrid Terrain、特殊拓扑与多层可行走表面

目标：长期支持桥梁、桥洞、垂直崖壁、天然拱门、悬挑、洞口和可进入洞穴，同时保留
Heightfield 在大面积户外地表上的性能、确定性和工具链优势。采用
[`Hybrid Terrain 与非 Heightfield 特殊地形设计`](superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)
冻结的 Heightfield + Opening + Static Structure + Traversal Surface + Region/Portal 组合，
不建立全 Mesh/全 Voxel 第二世界，也不让 AI 接触 Babylon/Havok。

- [x] 编写 Hybrid Terrain 与非 Heightfield 特殊地形专项设计，明确业界依据、职责、
  分阶段顺序和生产 Gate。
- [x] 2026-08-21 设计审查已按“修改后采纳”处置：混合拓扑方向成立；H0 须先按
  [`hybrid-terrain-design-review`](reviews/2026-08-21-hybrid-terrain-design-review.md)
  收紧 Opening Kit Contract、Collider 同源 Surface、cells/vertices、Portal 归属和 H1
  最小闭合集；审查正文保留为证据，权威合同已回写专项设计。
- [ ] 评审并冻结 H1 Bridge Fixture；公共字段冻结前先核实当前 Babylon/Havok 版本的
  Static Triangle Collider、Contact、Shape Lease 和 Character Controller 语义。
- [x] 锁文件与已安装 `@babylonjs/core@9.21.2` / `@babylonjs/havok@1.3.14` 源码确认公开
  Heightfield API 没有 Hole/Mask 参数；这只关闭源码证据，不替代下一条可执行探针。
- [ ] 运行锁版本 Static Triangle Collider 探针，覆盖 Winding/Sidedness、方形/矩形 Tile、
  接缝、Character Controller 支撑、Shape Lease、Dispose 和资源成本；通过后才把受影响
  Tile 的 Static Triangle Collider 冻结为当前 Runtime Profile 默认路径。
- [ ] 冻结 Static Structure 的 Geometry/Collider/Inventory/Provenance 资源边界；产品 GLB、
  Registry Prototype 和可选 Geometry Recipe 必须汇聚到相同锁定制品。
- [ ] 冻结 Terrain Opening 的内容寻址 Mask/Shape、Tile 编译和 Visual/Physics/Query 一致
  语义；Height 使用 Vertex Grid，Opening 使用 Cell Mask（每轴 vertex - 1），并一次性迁移
  现有 `resolutionCellsXZ` 被当作顶点数使用的历史方言。
- [ ] 冻结 Kit Opening Contract：闭合判别“无需 Opening/必须 Opening”，后者引用内容寻址
  Opening Recipe；不提前冻结单个 `requiresTerrainOpening` 布尔字段。
- [ ] 定义 Traversal Surface 与 Collider Subshape 的稳定绑定；Surface 不表示全局
  `walkable: true`，视觉 Mesh 不自动可走，
  `walkable`、`climbable` 等语义不能从材质、颜色或 Mesh 名推断；Surface ID 使用 Entity
  ID + 稳定逻辑 Subshape ID + resolved Resource Version，不使用数组序号或 Runtime Handle。
- [ ] 定义引擎无关 Support Surface Query：请求携带 3D Origin、方向、距离和过滤条件，
  命中返回稳定 Surface/Entity ID、米制位置、法线、距离和语义，并支持同一 XZ 多层排序。
- [ ] 保持 Runtime Ground Support 单一所有者：实际支撑来自 Havok Contact/Controller，
  唯一 Resolver 映射到 Surface ID；Terrain Query、Medium、Action、Animation 和 Camera
  不得独立产生第二份 `isGrounded`。
- [ ] H1 内收口现有两条支撑旁路：Spawn 的 `hasWalkablePhysicalGroundAt` 与 Controller
  Support 映射同一 Surface；Object `supported-by` 从 AABB 顶面切换为声明的 Collider
  Subshape Query。先补 Bridge 失败 Fixture，不把它们当作当前 Heightfield 场景的紧急 Bug。
- [ ] H1 Bridge/Cliff Fixture 验证桥面与桥下地面同 XZ 双层命中、上下路线、桥边离开、
  落地、净空、桥下有水、脚底接触过滤、Camera、Reset、Rebind 和 30/60/120 Hz-like Replay。
- [ ] H2 Terrain Opening/Cave Entrance Fixture 验证洞口 Render、Collider、Query、Debug
  Overlay 同时移除，Structure 接缝没有不可见墙、跌落缝或角色卡点。
- [ ] H3 冻结 Interior Region、AI-facing Portal 意图与既有 Region Graph/Route Graph 的唯一
  归属；允许 Compiler 从同一身份派生 Visibility/Acoustics/Streaming/Navigation Portal
  Metadata，实现室外→洞穴→室外固定 Tick 切片，但不冒充完整室内/NPC Navigation。
- [ ] H4 实现 Terrain Tile、Opening、Structure、Surface、Region、Portal 的原子 Cell 加载、
  LOD、共享资源 Lease、部分构造失败回滚、Dispose 和性能预算。
- [ ] CLI/Browser/Validation 输出 Opening Mask、Visual/Collider/Surface Overlay、Support
  Hit、Region/Portal、Seam/Clearance/Slope/Route Diagnostic 和全部 Resource/Profile Hash。
- [ ] 增加 AI Authoring Conformance：普通 AI 只提交 `prototypeRef`、Placement 和必要
  Placement/Route Constraint，Registry/Compiler 自动展开 Collider、Opening、Surface、
  Region 和 Route Connection；CLI Canonical JSON 与 Browser Protocol 两种宿主编码使用
  相同 Canonical 字段完成 Bridge/Cave Fixture 及 Diagnostic 修复，不产生 Provider 方言、
  第二套 Geometry Adapter 或引擎字段。
- [ ] 只有出现明确产品需求后，才为多层 Navigation、完整室内、运行时雕刻/破坏或
  Voxel/SDF 建立独立设计与实施计划；不得提前泄漏实验字段到 Canonical Schema。

完成标准：Bridge 与可进入 Cave 两个 Golden Fixture 分别证明同一 XZ 多层支撑、Terrain
Opening 当前 Render/Physics/Query 一致、物理接触唯一 Ground Support、可玩路线、固定 Tick
Replay、Streaming/Dispose 和自动 Diagnostic；普通 Agent 只引用稳定 Prototype/Profile/关系
即可组装场景，并通过 AI Authoring Conformance。

### P3：生产收敛与默认切换

#### P3.1 Production Gates

- [ ] 基于 P0.3 已冻结的 Validation Profile/Report 协议扩展生产 Profile，不新建第二套报告格式。
- [ ] Schema/Projector/Provider Adapter Conformance。
- [ ] Physics Gate：穿插比例、浮空、接触、稳定性、异常位移和可达性。
- [ ] Capture Gate：通道完整性、ID 集合、相机矩阵、帧归属和 Render Ready。
- [ ] Replay Gate：输入、事件、关系、Snapshot 和 Hash 一致性。
- [ ] Performance Gate：帧时间分位数、加载时间、内存、WASM、Collider、Raster 和包体预算。
- [ ] Package 完整性、真实性、许可证和不可信输入安全 Gate。
- [ ] 所有必需 Gate 失败都阻止发布，不能由综合分数抵消。

#### P3.2 Babylon-only Runtime 收口

- [x] TR0 已冻结依赖图与产品保留合同；执行权威为
  [Babylon-only Runtime 收口实施计划](superpowers/plans/2026-08-25-babylon-only-threejs-retirement.md)。
- [x] TR1/TR3/TR4 已随 `main@01ee4b9` 移除旧 geometry/Runtime/bake 路径，并建立
  provider-neutral Camera Domain 与 GLB-first intake；复核分支补齐非均匀 TRS、反射与 shear
  对抗测试，以及 Camera 参数不变量的单一所有权。
- [x] TR2 已让 Babylon 承接 `?scene=` artifact-only 的 Opening Composition、planning
  capture 和 SDK-derived tri-view；首次合入与复核修补均取得 6/6 artifact 像素证据，且共享
  beauty material 的语义色隔离与临时贴图释放已有回归。
- [x] TR5 已通过 `test:scenes`、6/6 gameplay/artifact、Studio 5/5、非对称 terrain parity
  和 14 项 Babylon geometry conformance；Gameplay 与 capture 没有第二套 truth。
- [x] TR6 已让 README、AGENTS、快速接入、架构站和发布流程只指向 Babylon-backed 当前
  入口；历史 review/spec 只保留决策证据，不作为可用说明。
- [x] TR7 的首次全量 Gates、provider census、Runtime 深审、rendered/manual evidence、两轮
  Cursor 深审与最新纹理生命周期定向 follow-up 均已完成并取得 Final GO；复核修补随本提交
  合入并推送 `main`，关闭 Babylon-only Runtime 收口 Epic。

#### P3.3 后续独立能力

以下能力保留架构扩展点，但没有进入当前生产承诺：

- [ ] Runtime World Director；
- [ ] NPC、导航、任务以及基于现有 Gameplay Framework 的产品规则与内容层；
- [ ] P2.6 基础洞穴切片之外的完整室内、Room/Visibility、多层 NPC Navigation 和超大
  流式开放世界；
- [ ] 联网、多人、UI、音频、复杂布料、流体和破坏。

它们只有在目标、Owner、依赖和验收 Fixture 被明确后才拆成正式实施计划，不能
为了提高总进度数字提前计为已开始。

> **仍属未来探索、但不阻塞 P2.6：** 是否需要让 AI 超越 Registry Prototype/产品资产，
> 自定义任意静态场景几何。目前只有一份
> [候选技术草案](superpowers/specs/2026-08-20-ai-authored-geometry-extension-design.md)，
> 没有选定 Recipe、MeshDraft、Sandbox 或其他开放制作 Provider。P2.6 只要求稳定的静态
> Structure Resource/Collider/Surface 消费边界，可以先使用审核过的 Prototype 和产品 GLB；
> AI 自定义几何只有在出现明确产品需求、Owner 和实验依据后才建立独立实施计划。

## 5. 推荐实施顺序与依赖

```text
P0.1 Placement Constraint / Layout Solver
  ├── P1.1 Canonical Terrain / Region / Mask
  ├── 通用物体与构图稳定落位
  └── P0.3 Validation 的 Layout / Physics / Composition Gate

P0.2 Simulation Take / Control Capture Bundle
  └── P0.3 Validation 的 Capture / Replay / Integrity Gate

P0.1 + P0.2 + P0.3
  └── P0.4 白模到生成式视频纵向切片

P1.2 Asset Subject + P1.3 Semantic Action + P1.5 Control Feel / Physics Medium
  └── P2.1 Typed Relationship
        └── P2.2 Mount / Tow
              └── P2.3 Equipment / Flight

P1.1 Terrain / Region / Mask + P1.5 State Resolver
  └── P2.5 Surface Semantics / Traversal

P1.1 Terrain / Region / Mask + P2.5 Surface Query + Static Structure Resource
  └── P2.6 Hybrid Terrain / Multi-level Traversal Surface
        ├── H1 Bridge / Cliff
        ├── H2 Terrain Opening / Cave Entrance
        ├── H3 Interior Region / Portal / Playable Cave
        └── H4 Streaming / LOD / Lifecycle

P1.4 WorldPackage + P1.6 AI Schema / WorldChangeSet + P2.4 Controller/Camera/Driver
  └── P3.1 Production Gates（复用 P0.3 协议并扩展生产 Profile）
        └── P3.2 默认切换
```

Placement S1、Simulation Take / Control Capture V1 与 Validation Capture/Integrity V1
已形成回归纵向切片；后续 Validation 扩展仍应保持窄纵向切片；
不要同时启动坐骑、装备、飞行、NPC 和室内，避免再次形成无法验收的大重构。

## 6. 下一里程碑

### 6.1 当前主线执行清单（真实状态）

下面是当前唯一有效的短期 TODO。历史计划中的逐步复选框用于保留实施证据；若与本节冲突，
以本节和真实代码门禁为准。

| ID | 状态 | 当前交付物 | 依赖 / 阻塞关系 | 完成证据 |
|---|---|---|---|---|
| G19-0 | 已完成 | Gameplay/R1b 融合设计、责任图和冻结合同 | 无 | Spec 与 Implementation Plan 已进入文档入口 |
| G19-1 | 已完成并在 `main` | R1b/M5、Browser V5、Camera P1.5 与隔离 Preview | 无 | R0/R1/R1b 与 Camera 门禁通过；集成分支已同步 `main@4ae1912` 的 README package map |
| G19-2 | 已完成并已融合 | 关闭的 Command/Receipt/Event/World State、Feature/Action/Bootstrap data-only 合同 | G19-0 | Gameplay Contracts 聚焦测试通过 |
| G19-3 | 已完成并已融合 | provider-neutral Gameplay State、WorldSession、RuntimeHost 与事务/容量/生命周期 | G19-2 | 14 files / 468 tests、typecheck、build 通过；仍仅是 in-process staging |
| G19-4A | 已完成 | `ExecutionPlanV5` 权威关闭/deep-freeze parser、`initialControlledEntityId` clean break、`gameplay-bootstrap` Resource Kind 与 Compiler 全量锁 | G19-1、G19-2、G19-3 | Runtime Contracts/Compiler 聚焦测试与全量门禁通过；Compiler 先拒绝 accessor/symbol key 并 snapshot 不可信输入，再读取语义 |
| G19-4B | 已完成 | Bootstrap canonical semantic lock、WorldPackage manifest/integrity/build closure 与六方 membership | G19-4A | WorldPackage 聚焦测试与全量门禁通过；语义 hash 与 artifact bytes hash 保持分离 |
| G19-4C | 已完成 | Validation closure replay 与 RuntimeHost adapter 创建前 admission | G19-4A、G19-4B | Validation 与 RuntimeHost 对抗测试通过；不合法 Plan/Bootstrap 在创建 Adapter 前 fail-close |
| G19-4D | 已完成 | 所有 Compiler/Babylon/Route/Playground 生产调用方原子迁移到 V5，并从 Normalized IR 生成真实 canonical Bootstrap/Capability set | G19-4A、G19-4B、G19-4C | 全仓 typecheck 通过；17 files / 374 tests 的集成矩阵通过；无生产固定假 hash |
| G19-4E | **已完成** | 全量门禁、真实回归 disposition、生成物治理 | G19-4D | `pnpm typecheck`、165 files / 2,079 tests、`pnpm build` 与 9 项 verify Gate 全通过；Take 根哈希由 `generate:example-takes` 生成；Route 重型套件在全量并发下通过 |
| G19-5 | **已完成，作为 G19-6 前置底座** | Babylon Gameplay Port；`possessedBy` 唯一控制权；输入目标与 Camera Target projection 事务 | G19-4 | optional Possession、fixed-input Controller 隔离、staged transaction、provider-neutral projection 与 fail-closed Action 已完成 |
| G19-6 | **已完成并在 `main`** | exact 39-key Browser Protocol V5 Gameplay 唯一入口、Snapshot V4、Reset/Rebind、Runtime Activity、Authoring/CLI/Capture/Take consumer cutover；Execution Subject locomotion Capability lock 与 Canonical capability state | G19-5 | `eef75c6` 实现、`5ffd031` completion review；typecheck、build、168 files / 2,134 tests、Canonical/Placement/Rigged/G Bot/R0/R1/R1b 与两项 Capture verifier 全通过；无 open confirmed P0/P1/P2 |
| G19-7 | **已完成** | Outdoor/catalog route、page/artifact lifecycle 与六场景接线，不增加第二套 Gameplay 真相 | G19-6 | `da90f16` + completion record `1594823`；6/6 Gameplay、6/6 artifact-only、unknown-scene fail-closed Browser Gate 通过 |
| G19-8 | **已完成并合入 `main`，Final GO** | 未发布协议 clean break、历史命名/兼容路径专项清理、零消费者 census、G19 整体全量验证、主 Agent深审与最终 disposition | G19-7 | 候选 `99fb822`；178 files / 2,172 tests、全部专项 Gate、632/0/489 census；与 `main@134592e` Camera 边界文档语义融合；无 open confirmed P0/P1/适用 P2 |
| HNC-F1 | Alpha 前强制执行 | 对当时全部公共命名、exports、parser、Browser/CLI、生成资产和隐式 fallback 再做一次全面兼容性清理；同时关闭 `SCENE-ORIGIN-1` | Scene spawn-origin 与 collider-derived placement 合同 | 最新 clean-break machine gate + 人工语义分类；Scene 固定 0.9m bridge 删除；场景/Outdoor/Plan gates 全绿 |
| M8-S1 | 下一主线 | 首个 `mountedOn` 人—滑板关系切片 | G19 已完成 | Relationship/Action/Event/Receipt/Capture 端到端一致 |

G19-8 的 clean-break 子任务以
[`未发布协议兼容层 Clean Break 设计`](superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md)
为权威。当前状态如下；“已完成”只表示相应提交与聚焦证据存在，不替代最终全量门禁：

| UCCB | 状态 | 当前提交 / 证据 | 剩余边界 |
|---|---|---|---|
| UCCB-00 | 已完成 | G19-7 输入冻结于 `da90f16`，completion record `1594823` | 无 |
| UCCB-10 | 已完成 | `1b8c311`、`cfa16b7`、`b19e56a`：Authoring/IR V4 自包含，Authoring loader 与 WorldKit consumer 切到当前协议 | 无 |
| UCCB-20 | 已完成 | `3fb2397`、`23f5985`、`fbe7ff4`：Compiler 直接从 IR V4 生成 Plan V5，旧 V4 compiler 入口退出，当前 golden 更新 | 无 |
| UCCB-30 | 已完成 | `a44d160`、`2d312b1`：ExecutionPlan V5 自包含，旧 Plan V4 公共合同删除 | 无 |
| UCCB-40 | 已完成 | `9ae108a`、`592fbeb`：Subject capability assembly 成为 Authoring/Registry/Plan 必填当前合同 | 无 |
| UCCB-50 | 已完成 | `f453810`、`da2fe27`：Babylon Runtime current-only、显式 possession 与 camera publication | 无 |
| UCCB-60 | 已完成 | `f453810`、`cf94b90`、`3fea29b`、`0d9a2bd`：旧表面、消费者与 fixture 原子清理 | 无 |
| UCCB-65 | 已完成 | `0ad72e8`、`3e671a2`、`99fb822`：机器/人工 census、生成资产与空延期账本 | HNC-F1 是新审计，不是延期兼容债务 |
| UCCB-70 | 已完成 | 候选 `99fb822` 全量矩阵、Final GO completion review 与最终 main merge | 无 |

项目尚未上线，因此本轮能删除的被替代兼容路径全部删除，不为开发历史保留 alias、converter、
fallback read、双写或双发布。当前仍是唯一权威的版本化嵌套组件（例如当前 Gameplay V1、
Traversal V2 与 Browser V5）不是兼容债务，不能因版本号较小而误删。若最终确有被替代路径无法在
本轮删除，必须在 G19-8 completion record 中逐项登记 consumer、blocker、owner、removal gate
和 deadline；没有完整登记的延期不允许通过 G19-8。

UCCB-65 的任务账本见
[`历史命名与兼容路径清理专项计划`](superpowers/plans/2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md)。
该任务不以“删除所有低版本后缀”为目标：尚无替代版本且仍是唯一权威的嵌套合同必须保留并登记
为 `current-authority`；只有已有当前替代实现的旧名称、alias、converter、双读写和 fallback 才进入
`superseded-delete`。

即使 G19-8 达到零历史兼容路径，也必须在首次 SDK Alpha 前执行 `HNC-F1` 全面复查，不能把本次
census 当成永久证明。当前仍有语义职责、但未来应由显式合同替代的
`SCENE_HUMANOID_SPAWN_CENTER_OFFSET_METERS` 已登记为 `SCENE-ORIGIN-1`：它不是兼容 alias，
删除门禁是 Scene 明确 spawn origin 或从锁定 Collider 推导 placement，迁移全部 catalog scene，
并通过 `test:scenes`、Outdoor Gameplay、Plan/Scene Plan gates。

G19-4E 已关闭此前的两项验证债务：Simulation Take 不再手改 `worldPackageRootHash`，而由
`generate:example-takes` 从 canonical WorldPackage identity 原子生成；两个 Route 重型套件保留
原断言，仅把 full-suite 等待预算调整到真实浏览器/Havok 并发耗时。最终 `pnpm test` 在并发模式下
165 files / 2,079 tests 全通过，`verify:control-capture` 与 R0/R1/R1b 门禁也全部恢复绿色。

M5 R0 字段冻结已由 `pnpm verify:route-r0-contract` 完成；R1 Heightfield 已由
`pnpm verify:route-r1-heightfield` 与
[Runtime Review](reviews/2026-08-22-route-r1-heightfield-runtime-review.md) 关闭。
M7 P1.5 Ground/Air Runtime 前置依赖已随 PR #10 合入。R1b Task 9/10 与 M5 已关闭。
S1b Golden、
首个产品 G Bot、Placement Solver S1、Control Capture V1 与 Validation Capture/Integrity V1
都已进入回归，下一步：

1. **M1（已完成）：把 G Bot 的交付 Manifest/Registry 映射/Gate 固化为后续产品资产接入模板**
   （专项 [`product-asset-intake-template`](superpowers/specs/2026-08-21-product-asset-intake-template-design.md)，
   执行 [`product-asset-intake`](superpowers/skills/product-asset-intake.md)；G Bot Fixture
   `examples/product-asset-intakes/humanoid.g-bot@2.json`）；
2. **M2（已完成）：冻结 Take/Capture V1 首条实施范围**；
3. **M3（已完成）：实现五 Pass Capture 窄纵向切片并复用 Placement World Identity/Hash**；
4. **M4（已完成）：实现 P0.3 统一 Validation Profile/Report 的 Capture/Integrity 窄切片，把现有 Bundle Gate 纳入同一报告协议**；
5. **M5（已完成）：Route Graph 与主体可通行性 R0/R1/R1b**：R0 字段冻结已由
   `pnpm verify:route-r0-contract` 证明；R1 Heightfield 已由
   `pnpm verify:route-r1-heightfield` 与
   [Runtime Review](reviews/2026-08-22-route-r1-heightfield-runtime-review.md) 关闭。
   R1b Task 9/10 已完成静态平台 / Surface→Collider Subshape 实现、11 个 Fixture、V2/V5
   clean break、完整矩阵和主 Agent 深审；首轮 Cursor 建议触发的 Runtime ambiguous
   诊断分层修复已由三模式回归与条件复核关闭。M5 已完成，但 H1/H2/H3、动态平台、
   NPC/public `goTo`、车辆等能力继续由后续里程碑拥有；
6. **M6：在 Placement + Take + Validation 闭环上接入实验 Video Model Adapter**；
7. **M7（Ground/Air 首切片已完成）：继续扩展 P1.5 Control Feel/Physics Medium/State
   Resolver**：首条 Ground/Air 切片的
   [实施计划](superpowers/plans/2026-08-21-p15-control-feel-state-resolver.md) 已实施、
   通过全部生产 Gate，并由 PR #10 合入 `main`；水介质、`ControlMethodProfile`、
   CLI/Browser E2E 覆盖，以及整支对抗审查仍未交付。相机 overlay 已在 Browser V5
   基线上完成门禁与最终审查；Camera Domain 的 `cameraViewPreference` 和纯 Selection 已实现，
   但 Browser Command/View State 与 Babylon CameraDirector 接线仍未完成；作者面板
   Feel 范围与 session 数字袋类型已在 Preset 语义合同修复中收口，
   M7 不标记完成；
8. **M8：完成 Canonical World State + Typed Relationship 人—滑板窄可视切片**：G19-2/G19-4
   已交付 Canonical Gameplay 合同、provider-neutral RuntimeHost staging 和 WorldPackage membership；
   G19-6 至 G19-8 已完成并通过 Final GO，下一步按
   [专项设计](superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)
   沿用已冻结的 World/View/Runtime Status/Transition 四类投影，再实现 `mountedOn` 权威关系、
   `supportedBy` 派生事实、Mount/Dismount Action、Receipt/Event 与 Capture 对齐；在这条
   纵向切片稳定前，不继续向 `SubjectRuntimeStateV3` 追加字段，也不先铺开更多人物动作；
9. **M9：在实现游泳、攀爬或增量 Agent 修复前，分别冻结 P2.5 Surface/Traversal 与
   P1.6 AI Schema/WorldChangeSet 的专项设计，禁止临时增加公共字段或场景脚本旁路**。
10. **M10：P1.1 与 P2.5 边界稳定后评审 P2.6 H1 Bridge Fixture；先验证同 XZ 双层支撑、
   Static Collider 和唯一 Ground Support，不直接并行启动完整洞穴/室内**。
11. **M11：在公共 SDK 正式发布前完成协议类型命名与版本后缀治理**：审计
   `ExecutionSubjectV3`、`ExecutionControlProfileV1`、`ControlInputAxesV2` 等公共类型；
   仅对可独立序列化、校验和迁移的顶层协议保留 `Vn` 后缀与 `schemaVersion`，普通值对象
   和父协议内嵌投影改用无版本名称或由所属协议统一定版。该任务必须同步更新 Canonical
   Schema、AI Schema Profile、CLI/Browser Protocol、示例、生成类型和 Conformance，
   并利用当前未正式发布阶段执行一次明确的 clean break，不保留永久别名字段**。

Validation Capture/Integrity V1 字段已经冻结；后续 Subject、Gate 或 Profile 组合扩展
必须增加明确版本，不能静默改 V1，也不能把 Babylon、Playwright 或 Provider 字段泄漏
到 Canonical Schema。

## 7. 更新规则

- 每个进入实施的工作流必须新增独立计划，并从本文对应条目链接过去。
- 合入纵向切片时，在同一提交中更新复选框、完成度、验证命令和 Artifact。
- “设计完成”“代码完成”“生产完成”是三个不同状态，不允许互相替代。
- 历史或被取代计划应在顶部标记 Closed/Superseded；其中旧复选框不计入当前 Backlog。
- 进度百分比只在完成纵向切片或范围正式变更时重算，不按零散提交次数增长。
- 所有公开 Rename 必须同时更新 Schema、类型、示例、CLI/Browser、迁移和 Conformance。
- 外部模型、引擎或资产 Provider 只通过 Adapter/Registry 接入，不进入 Canonical Schema。

## 8. 当前风险

| 风险 | 当前处理方式 |
|---|---|
| Agent 为大量实例猜坐标导致漂浮、穿插和构图漂移 | P0.1 引入 AI-facing Constraint 与确定性 Solver |
| 世界定义、动作脚本和视频捕获混成一个 JSON | P0.2 分离 WorldPackage、Simulation Take 和 Control Capture Bundle |
| 测试阈值分散或总体分数掩盖关键失败 | P0.3 统一 Validation Profile/Report，Blocking Gate 一票否决 |
| 图片生成结果被误当作权威地形 | P1.1 固化为 Height/Mask，重新执行确定性 Compiler 和 Gate |
| 为支持洞穴而把 Heightfield 替换成全 Mesh/全 Voxel，失去现有确定性与性能边界 | P2.6 使用 Heightfield + Opening + Structure + Surface + Region/Portal 的混合拓扑 |
| 桥面、Terrain Query 和物理接触各自判断落地，导致多层空间状态漂移 | Runtime Ground Support 只由物理接触 Resolver 拥有，P2.6 Fixture 覆盖同 XZ 双层表面 |
| 任意 Blender/Python 代码进入生产世界 | 只允许隔离制作 Provider；Runtime 只消费锁定制品 |
| 机器人研究仓库的格式污染 Web SDK | 只借鉴 Solver、Gate、Registry 和 Capture 思想，通过 Adapter 映射 |
| S0/S1a/Golden/G Bot S1b 切片完成被误读为整个 Subject 系统完成 | 本文分别追踪 S1b 未完成项、S2、S3 和 S4 |
| Babylon-only 候选实现未经过完整 scene/artifact/Studio 与 rendered evidence 就被提前宣布完成 | P3.2/TR7 要求完整 Gates、provider census、深审与独立复核后才能发布 |
