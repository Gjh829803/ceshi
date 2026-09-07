# SDK 重构总进度与 Backlog

- 状态：Active，重构执行进度与剩余工作的唯一跟踪入口。
- 能力进度基准日期：2026-08-26（本次未重算百分比）。
- 架构状态更新至：2026-08-29。
- 长期目标总进度：约 **68%**，合理误差范围为 ±5%。
- 第一条 Canonical 纵向切片：约 **94%**。
- 当前唯一正式生产世界构建入口：Canonical Authoring V4 → NormalizedWorldIR V4 → Canonical Scene Plan V1
  + Gameplay Bootstrap V1 + World Runtime Bootstrap V1 → RuntimeWorldConfiguration V1 → RuntimeHost →
  Babylon.js/Havok；Route 在同一 Canonical Scene Plan 上生成
  WorldPackage Build Receipt → Validation Subject → Recast → Canonical Route Evidence/Report。
  Browser 只公开 Protocol V5 与 Snapshot V4；Babylon provider projection 保持 Adapter 内部合同。

> ADR-0007 已接受长期的 Babylon Native Scene Lane 架构方向：Native JSON 管启动/资源/Gameplay，
> Babylon TypeScript 管视觉，显式登记连接 SDK-owned Havok，且每个世界只选一个 Scene Source。
> BNA-1～5 已冻结 Native Schema/Source identity，完成 Check、Package/Receipt、Surface Admission、
> 同一 RuntimeHost/SDK-owned Havok 与 Hosted Isolation 的受限生产链；但 BNA-6/7/8 生成评测、正式
> Capture/Route 与最终 disposition 仍未完成。默认产品 Viewer/Catalog 继续只接 Canonical
> AuthoringSpec，因此不改变上一段的当前默认入口和进度口径。

> Source-neutral Asset Production/Admission 已形成 Proposed 设计：只在两条 Scene Source 之前生产原始
> Candidate，经资产类别 Build Record 与只读 Admission 后发布资源；不增加第三条 Scene Source。APA 尚未
> 实施，不提高完成度；整房间/整关卡 `scene-shell` 在 V1 仅为 artifact-only 研究证据。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

> 2026-08-27：3C vNext Task 6 已在 Diversion 分支完成 Golden 单人带骨骼角色纵向集成：
> `CharacterMovementRuntime + BodyPort + Locomotion V2 + LayeredMove + committed Action/Animation/Camera`
> 共用一个固定 Tick 事务。全仓 Task 7 clean break、多主体/坐骑迁移和两轮人工
> `FeelReviewReceipt` 仍未完成，Profile 保持 `experimental`。当前证据与环境失败清单见
> [`3C vNext Golden Humanoid 集成进度审查`](reviews/2026-08-27-whitebox-3c-vnext-golden-progress.md)。

> 首个产品资产 G Bot 已通过独立 Registry/CLI/Babylon/Havok/Browser Gate；这只代表
> 当前版本 G Bot 的 `idle/walk/run/jump`，不代表任意产品包或其余 21 个 Clip 已开放。

> Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask、更多 Constraint 与 P0.1 整体仍未完成。

> Route R1 Heightfield 与 R1b Static Platform 的原始纵向切片已完成；2026-08-24
> 深审重新打开 M5，并发现 Route set、Surface/Portal、Runtime ownership、V2 evidence
> 与 Hosted admission 等存量问题。remediation 已完成，最新 `main` 集成门禁与
> GLM 5.3/zcode、Cursor 独立终审均为 FINAL GO；M5 已在 R1 Heightfield / R1b Static
> Platform 当前生产边界内关闭。H1/H2/H3、动态平台、NPC/public `goTo` 与车辆
> 仍由后续里程碑拥有。

> Gameplay Framework G19-2 至 G19-6 已合入 `main@5ffd031`；关闭 Command/Receipt/Event/World
> State、Gameplay State/Feature、事务式 WorldSession/RuntimeHost、Babylon transactional port、
> exact Browser V5、Snapshot V4、RuntimeHost Activity 与 Authoring/CLI/Capture/Take consumer
> cutover 已进入回归。G19-7 Outdoor/catalog lifecycle 与 G19-8 未发布协议 clean break 已完成；
> 候选 `99fb822` 通过 178 files / 2,172 tests、全部结构/资产/Capture/Route/Outdoor Gate 和
> 632/0/489 clean-break census，主 Agent disposition 为 Final GO。G19 整体完成；首次 SDK Alpha
> 前仍必须执行新的 HNC-F1 全面整洁度复查。

> Simulation Take / Control Capture V1 已完成 60 Hz → 24 fps 精确时间映射、五 Pass
> Babylon 捕获、Render Ready Receipt、原子 Bundle、CLI/Browser/Playwright 和真实 Chromium
> Gate；统一 Validation 的 Capture/Integrity V1 也已进入回归。P1.4 当前唯一 WorldPackage V1、
> Package CLI 与持久 headless Runtime Session 已完成；Placement/Physics/Composition 等
> 统一 Gate、Capture 恢复续拍与 Video Adapter 仍未完成。

## 当前执行 Epic：Babylon-only Runtime 收口（TR0–TR7）

当前主线执行计划是
[`2026-08-25-babylon-only-threejs-retirement.md`](../docs/superpowers/plans/2026-08-25-babylon-only-threejs-retirement.md)。
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
- [`2026-08-17-ai-first-lego-game-sdk-design.md`](../docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)：长期架构规格；
- [`2026-08-17-terrain-authoring-pipeline-design.md`](../docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md)：地形专项规格；
- [`2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md`](../docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)：桥梁、悬挑、洞口、洞穴和多层可行走表面的长期专项规格；
- [`2026-08-21-hybrid-terrain-design-review.md`](reviews/2026-08-21-hybrid-terrain-design-review.md)：对该专项的业界对照审查；方向成立，H0 合同未冻前不开始 H1；
- [`2026-08-19-extensible-subject-authoring-design.md`](../docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)：主体组装、Relationship、坐骑、装备和飞行的专项规格；
- [`2026-08-19-asset-subject-s1b-visible-slice-design.md`](../docs/superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md)：首个 GLB/Rig/Animation/Collider Profile 资产主体纵向切片；
- [`2026-08-20-g-bot-product-asset-s1-design.md`](../docs/superpowers/specs/2026-08-20-g-bot-product-asset-s1-design.md)：首个真实产品人物 G Bot 的版本化映射与可视验收；
- [`2026-08-21-product-asset-intake-template-design.md`](../docs/superpowers/specs/2026-08-21-product-asset-intake-template-design.md)：把 G Bot Gate 固化为后续产品资产接入模板；执行步骤见 [`product-asset-intake`](../docs/superpowers/skills/product-asset-intake.md)；
- [`2026-08-19-placement-constraint-layout-solver-design.md`](../docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)：AI 空间意图、最终 Transform 求解与冲突报告专项规格；
- [`2026-08-19-simulation-take-control-capture-design.md`](../docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)：WorldPackage、Take、Session、多 Pass Capture 与视频 Adapter 边界；
- [`2026-08-22-canonical-runtime-state-and-semantic-projection-design.md`](../docs/superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)：Canonical World/View/Runtime Status、Typed Relationship、Semantic Fact、Action/Event Receipt 与世界模型轨迹边界；
- [`2026-08-24-gameplay-framework-r1b-integration-design.md`](../docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md)：Gameplay Framework、RuntimeHost、R1b、Camera 与 Browser V5 的唯一所有权和事务融合合同；执行见同名实施计划；
- [`2026-08-24-gameplay-browser-g19-6-review.md`](reviews/2026-08-24-gameplay-browser-g19-6-review.md)：G19-6 Browser V5/Snapshot V4、RuntimeHost Activity 与 consumer cutover 的 Final GO disposition；completion review 已由 `5ffd031` 合入 `main`；
- [`2026-08-24-g19-7-outdoor-gameplay-completion.md`](reviews/2026-08-24-g19-7-outdoor-gameplay-completion.md)：G19-7 六场景 Gameplay 与 artifact-only 生命周期的完成证据；
- [`2026-08-24-unreleased-compatibility-clean-break-design.md`](../docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md)：G19-8 未发布协议 clean break 的权威边界、UCCB 依赖图与零消费者门禁；
- [`2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md`](../docs/superpowers/plans/2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md)：UCCB-65 历史命名、公共导出、隐式兼容行为、生成资产与延期清理账本的专项执行计划；
- [`2026-08-25-gameplay-g19-8-completion.md`](reviews/2026-08-25-gameplay-g19-8-completion.md)：G19-8 current-only clean break、全量门禁与 Final GO disposition；
- [`2026-08-26-m8-s1-mounted-on-skateboard-progress.md`](reviews/2026-08-26-m8-s1-mounted-on-skateboard-progress.md)：M8-S1 已实现核心链路、当前证据、明确剩余门禁与 `CAM-MOUNT-1` 的快速接续入口；
- [`2026-08-24-workspace-structure-authority-review.md`](reviews/2026-08-24-workspace-structure-authority-review.md)：Workspace authority 根因闭包、门禁 invalidation 策略，以及 `WS-07B → WS-05B/C → WS-08` 结构治理任务的唯一详细裁决；
- [`2026-08-24-context-driven-gameplay-camera-composition-design.md`](../docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)：Kit、Relationship、Action、Equipment、Flight 与 Camera Context/Director 的设计输入；Camera Domain 已实现的部分和剩余集成以本页 P2.4 为准；
- [`2026-08-30-third-person-camera-collision-and-spring-arm-design.md`](../docs/superpowers/specs/2026-08-30-third-person-camera-collision-and-spring-arm-design.md)：当前第三人称 Camera Hard Decollider、Subject Physics Group 排除、Final Frustum/Near Plane Validator、原子提交和 collision-safe Render path 的最新专项权威；现有 Spring Arm 仅是未完成切片，首期 Oriented Box 最终验证与对应证据闭合前不得声明“第一切片通过”；执行见[稳定性实施计划](../docs/superpowers/plans/2026-08-31-third-person-camera-collision-stability.md)；
- [`2026-08-25-context-driven-camera-package-boundary-review.md`](reviews/2026-08-25-context-driven-camera-package-boundary-review.md)：Camera 分包决策的历史审查证据，不是 active 实现状态或可用入口；
- [`2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`](../docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)：P1.6 AI Schema Projection、受控覆盖、WorldChangeSet、幂等 Journal、Full Reload Runtime 发布与后续 Incremental Hot Apply 的专项实施权威；
- [`2026-08-26-p16-ai-schema-world-change-set-design-review.md`](reviews/2026-08-26-p16-ai-schema-world-change-set-design-review.md)：P1.6 专项规格的全维度设计审查、Runtime authority map 与当前源码复验证据；
- [`2026-08-26-p16-full-reload-b-review.md`](reviews/2026-08-26-p16-full-reload-b-review.md)：P1.6 Full Reload 首切片 Mode B 变更审查；recover 终态保护与 F1 断言已按规格复验；
- [`2026-08-19-world-validation-report-and-quality-gates-design.md`](../docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)：量化 Gate、Metric、Evidence 和生产阻断协议；
- [`2026-08-20-ai-authored-geometry-extension-design.md`](../docs/superpowers/specs/2026-08-20-ai-authored-geometry-extension-design.md)：未来可能需要的 AI 自定义几何能力及候选技术，仅供调研评审，不属于当前 Roadmap；
- [`2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`](../docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)：Canonical JSON 与 Babylon Native Scene 的长期分工、薄登记合同、统一 Gameplay Kernel、生产化依赖图和能力声明边界；
- [`2026-08-28-babylon-native-block-whitebox-profile-design.md`](../docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)：Native Lane 首个参考图白膜 Profile；继承方块分支的构造、检查和优化思想，但不迁移 Three Adapter、持久 Manifest 或 Block Compiler；
- [`2026-08-28-source-neutral-asset-production-and-admission-design.md`](../docs/superpowers/specs/2026-08-28-source-neutral-asset-production-and-admission-design.md)：两条 Scene Source 之前的 Provider-neutral Candidate、资产类别 Build Record、只读 Admission、Registry 发布和回退边界；当前为 Proposed，尚未实施；
- [`2026-08-30-project-health-observatory-design.md`](../docs/superpowers/specs/2026-08-30-project-health-observatory-design.md)：整仓工程健康观测层；统一感知架构权威、契约/生成物、测试拓扑、生命周期、确定性、性能、视觉、文档和独立审查问题，但不复制现有事实 Owner；执行见[同名实施计划](../docs/superpowers/plans/2026-08-30-project-health-observatory-implementation.md)；
- [`ADR-0007`](decisions/0007-canonical-and-babylon-native-authoring-lanes.md)：接受“一世界、两条互斥场景创作 Lane、一个 Babylon/Havok Kernel”的架构决策；不代表 Native 已生产可用；
- [`21-open-source-design-reference-ledger.md`](21-open-source-design-reference-ledger.md)：开源实现/测试的持续借鉴台账；记录锁定来源、本地落点、拒绝原因和候选验证，但不单独改变能力完成度；
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
| Canonical Schema、IR、Registry 与 Compiler | 15% | 88% | 13.2% | Authoring V4 → IR V4 → Canonical Scene Plan V1 + Gameplay/World Runtime Bootstrap 已自包含并直接编译；旧顶层协议已从已提交路径删除，Subject capability assembly 成为必填锁；完整 P1.4 发布格式与 WorldChangeSet Full Reload 正式 Host 闭环已交付，Incremental 仍开放 |
| Babylon/Havok Runtime、物理与相机 | 15% | 75% | 11.25% | Heightfield、障碍、水域、多主体、第三人称、碰撞、资产主体、Placement Assertion 与五 Pass Capture 已交付；多视角与完整生产预算尚未完成 |
| Subject LEGO 组装体系 | 15% | 45% | 6.75% | S0、S1a、Golden 与首个产品 G Bot 可视切片已完成；S1b 后续、S2、S3、S4 尚未完成 |
| Terrain、Region 与 Placement | 12% | 74% | 8.88% | Alpha 地形和 Placement Solver S1 已运行；Route R0、R1 Heightfield 与 R1b Static Platform 已审查/门禁关闭；通用 Terrain Mask、更多 Constraint 与完整 P0.1 未完成 |
| CLI、Browser Protocol 与自动化 | 10% | 90% | 9.0% | 已交付 Take/Capture、`verify capture|explain`、完整 Package `build/inspect/load` 与持久 headless Runtime Session；Route `verify route`、R1 Golden Fixture、可信 Host Evidence Transport、Browser V5 clean break 已完成；compare、Capture Resume 和多人 Session 未完成 |
| Semantic Action、动画与 Gameplay | 8% | 80% | 6.4% | Golden 与 G Bot `idle/walk/run/jump`、G19-2 至 G19-8 底座已交付；M8 `mountedOn` stand-ground 内部验收切片已实现、最终 GO pending，Hosted Builder production admission 仍关闭；姿态、装备、seat/tether/dragging 与通用关系规则仍未交付 |
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
- [x] 自包含 NormalizedWorldIR V4 与 Canonical Scene Plan V1；Compiler 从 IR V4 同时生成 Scene Plan、Gameplay Bootstrap 与独立 World Runtime Bootstrap，不再投影或重组旧顶层协议。
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

- [`Subject Foundation Visible Slice`](../docs/superpowers/plans/2026-08-19-subject-foundation-visible-slice.md)：49 项完成、0 项打开；
- [`Package Subject Definition Visible Slice`](../docs/superpowers/plans/2026-08-19-package-subject-definition-visible-slice.md)：73 项完成、0 项打开。

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
- [x] Browser Protocol V5 exact 38-key surface 保留加载、固定输入、Capture、Snapshot、Reset、
  Camera Preview 与多 Surface Route Evidence V2，并增加 Gameplay Command/Event/World State/
  Runtime Activity；不公开 `bindControl`，不保留并行 V4 alias。
- [x] G19-6 已把 Authoring、CLI/WorldKit pipeline、Control Capture、
  Simulation Take 与 Canonical/Placement/Rigged/G Bot verifier 迁移到 Snapshot V4 和
  `executeGameplayCommand(control.bind)`；Execution Subject 现必填锁定的 locomotion Capability Ref/Hash，
  Runtime 发布 Canonical locomotion capability state。Placement 已使用 Authoring/IR V4 → Canonical Scene Plan V1 →
  Snapshot V4/Browser V5，Rigged/G Bot 修复异步 `page.evaluate` 边界，fixed-input pause 在 `finally`
  恢复。WorldPackage Runtime 配置构建阶段的资产失败在公共 Authoring 边界稳定 fail closed。
  主 locomotion Capability 使用已选 locomotion Capability 子图的唯一 dependency leaf：排除被其他已选
  locomotion Capability require 的节点；Definition 锁 Ref/hash，Compiler/Runtime 不猜 `ground`。
  最终 full regression、两项 Capture gate 与 completion review 已收口；该切片 Final GO，已由
  `eef75c6` / `5ffd031` 合入 `main`。
- [x] G19-7 的历史切片曾把六个 Outdoor/catalog 场景接入同一 Gameplay Runtime，并保持
  artifact-only renderer 不暴露 `__WORLDKIT__` 或 Gameplay 方法；当时的 Browser Gate 通过
  6/6 Gameplay、6/6 artifact-only 与 unknown-scene fail-closed。后续 Unified Scene Viewer
  clean break 已删除 catalog-gameplay；当前门禁只覆盖三个 Canonical 调试预设与六个内部
  artifact-only 场景，不能把这条历史证据当作现行入口。
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

- [x] 编写 [Placement Constraint / Layout Solver 专项设计](../docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)。
- [x] 评审并冻结专项设计中的字段、版本、首批 Constraint 与 Fixture（方案 2 的原始冻结发生于
  2026-08-20；当前实现已 clean break 迁移到 Authoring V4 / NormalizedWorldIR V4 / Canonical Scene Plan V1）。
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
- [x] 编写 [Route Graph 与主体可通行性专项设计](../docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md)，
  并完成 [作者审查](reviews/2026-08-21-route-graph-traversability-design-review.md)与
  [独立审查/处置](reviews/2026-08-21-route-graph-traversability-independent-review.md)；明确
  AI Route 意图、`hard-ribbon`、分层 3D Graph、单一 Traversal Lock、真实控制器 Gate 与
  M5 完成标准。
- [x] 编写 [R0 实施计划](../docs/superpowers/plans/2026-08-21-route-graph-traversability-r0-implementation-plan.md)，
  将 Planner Route 归一化、Surface 身份、Lock/Driver、Metric/Diagnostic 和 Conformance
  拆成可追踪任务；计划完成不等于字段已冻结。
- [x] R0 实施并冻结 `connected-by-route`、Traversal Graph、`resolvedTraversalLockHash`、
  Driver 关闭白名单、Surface 身份、Evidence 与 Diagnostic 字段；通过下一 Canonical Major
  干净升级，不向已实现 V3 偷加空枚举。证据：`pnpm verify:route-r0-contract`。该命令只冻结
  合同，不表示 `route-connectivity` / `route-runtime-conformance` 已实现。已评 Runtime
  Metric 必须引用 `route-runtime-probe-receipt`；主体步高/坡度/净空/缝隙阈值来自 Lock，
  不写进 Validation Profile。
- [x] 编写 [R1 Heightfield 实施计划](../docs/superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md)，
  将 Authoring V4 → IR V4 → Canonical Scene Plan V1、Recast Provider Adapter、确定性 Graph/Query、
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
- [x] R1b Task 10 曾由 2026-08-24 深审重新打开，并已在当前 R1/R1b 生产边界内关闭：首轮 Cursor chat
  `1e938715-a5b2-4a25-ad83-45eec0c37c15` 对 `28752e0` 为 Final GO / No findings，
  同时给出 Runtime ambiguous 诊断分层建议；主审确认该分层问题并修复为 `506e088`，
  三模式回归证明 Runtime `unmatched / ambiguous / wrong resolved Surface` 均输出
  `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`。修后 `typecheck`、148 files / 1577 tests、
  `build`、R0、R1、R1b 11/11、Canonical、Placement、Rigged、G Bot 与 `diff-check`
  全部通过；条件复核 chat `d61f751c-a398-4063-bcbf-2ddc55ea20a9` 对 `506e088`
  再次为 Final GO / No findings。随后 Route set、Surface/Portal、Runtime ownership、V2 evidence
  与 Hosted admission remediation 及最新 `main` 集成门禁、双重独立复核均已完成；H1/H2/H3、
  动态平台、NPC/public `goTo` 与车辆仍是后续范围，不属于该项未完成。
- [x] Required 路线接入统一 Validation Report；Graph 通过但真实 Controller 卡住仍为
  Blocking Failure，并输出台阶、坡度、宽高净空、缝隙、Surface 身份和卡住坐标。
- [ ] 增加 S1 之外的 Constraint、增量求解等价证明和通用 ValidationReport。

S1 纵向切片完成标准已满足：一个室外海湾场景不依赖 Agent 手写三个地标和 Spawn
最终坐标，Solver 输出通过 Schema、Physics、Route 和 Composition 阻断 Gate。
P0.1 整体仍以上述三项开放能力及生产范围扩展为完成标准。

#### P0.2 Simulation Take 与 Control Capture Bundle

目标：把“世界是什么”“本次怎样操作/拍摄”“输出给视频模型的控制信号”分成
三个独立、可哈希和可重放的制品。

- [x] 编写 [Simulation Take / Control Capture Bundle 专项设计](../docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)。
- [x] 评审并冻结 V1 字段、`web-v1` 编码 Profile、时间映射与两个 Fixture。
- [x] 冻结 V1 Simulation Take、Runtime Session、Control Capture Bundle 与过渡期 WorldPackage Root Hash 的引用关系。
- [x] 定义 V1 Scripted Controller、Control Intent/Camera Rig Track、Tick Range 和 Capture Schedule。
- [x] 定义 Simulation Tick、Render Frame 与 Capture Frame 的显式映射。
- [x] 定义版本化 Capture Profile 和第一批必需 Pass。
- [x] 实现 Neutral Color、Linear Depth Meters、Semantic Class ID、Stable Instance ID、World Normal。
- [ ] 评估并决定 Motion Vector、Albedo、Roughness、Metallic 和 Lighting Profile 的阶段。
- [x] 每帧记录 Camera Intrinsics/Extrinsics、Snapshot 和三种明确计数器。
- [x] 接入 Event/Action/Relationship Receipt Track；保持 Bundle V1，并交叉校验
  Command → Receipt → Event → World State → Snapshot/Frame 以及 Relationship Event 投影。
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

- [x] 编写 [World Validation Report 与质量门禁专项设计](../docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)。
- [x] 冻结 Capture/Integrity V1 的 ValidationProfile、ValidationReport、Gate、Metric、Evidence 与 Canonical Hash；其他 Subject Union 后续按版本扩展。
- [x] 冻结并测试 Blocking/Advisory、Required Missing、Incomplete 和 Policy Decision 语义。
- [x] 定义并实现 Capture Completeness、Capture Ownership 与 Bundle Integrity 三个首批 Gate；Schema/Layout/Physics/Route/Composition/Replay/Performance 仍待接入。
- [x] 把 Capture V1 的 Evaluator Ref、Evidence 归属与 Depth 单位语义写入版本化 Profile；Platform-measured 阈值仍待后续 Profile。
- [ ] CLI 的 `verify capture`、`verify explain` 已完成；`verify compare`、Browser/CI Evidence 发布仍未完成。
- [ ] Capture Fixture 已覆盖 Depth、帧归属和 Hash 损坏；浮空、穿插、不可达、Anchor 缺失仍待 Placement/Runtime/Composition 接入。
- [x] 纯 Policy 测试证明 Blocking Failure 优先于 Incomplete，Advisory 不能抵消，Required Metric 缺失为 Incomplete。

已完成切片证据：

- [Validation Capture/Integrity V1 实施计划](../docs/superpowers/plans/2026-08-21-validation-capture-integrity-v1.md)；
- `pnpm verify:validation-capture`：正常、缺 Pass、坏 Depth、混 Take、坏 Hash 五类确定性 Fixture；
- `packages/validation` 与 `worldkit verify capture|explain`。

完成标准：Placement 和 Capture 首条纵向切片都通过同一版本化 Validation 协议，
每个失败能落到唯一 Gate/Metric/Diagnostic，并产生可审阅修复建议。

#### P0.4 白模到生成式视频的第一条纵向切片

- [x] 冻结一个不进入 Canonical Schema 的 Video Model Adapter 接口：
  [专项设计](../docs/superpowers/specs/2026-08-26-m6-video-model-adapter-design.md)与
  [实施计划](../docs/superpowers/plans/2026-08-26-m6-video-model-adapter-implementation-plan.md)已定义
  gate-passed Control Capture 输入、provider-neutral Request/Run、exactly-once submission、
  输出 conformance 与结构一致性报告；接口冻结不等于 Provider 纵向切片已实现。
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
- [x] 按 [`Asset Subject S1b 可视切片实施计划`](../docs/superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md) 打通 Golden Humanoid 的 Canonical → Babylon/Havok → CLI/Browser 纵向链路。
- [ ] 支持 Compound Collider 和更多确定性 Collider Derivation Profile。
- [x] 为 Golden 切片定义并验证 Pivot、Forward Axis、Scale、Socket/Bone Binding 与单位检查。
- [ ] 建立资产导入、License/Hash、预算、LOD、Skeleton 和动画 Clip 验收。
- [ ] 证明 Primitive 白模可以替换为人形、四足或非人形资产而不改变 Entity ID 和 Gameplay 身份。
- [x] Golden 切片中缺少 Rig、Clip、Collider 或 Socket 时返回稳定 Diagnostic，不静默猜测。
- [x] 把 G Bot 的 Manifest/Registry/Gate 固化为
  [`Product Asset Intake Template`](../docs/superpowers/specs/2026-08-21-product-asset-intake-template-design.md)
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
- [x] 冻结并实现可独立校验、加载和运行的当前唯一 WorldPackage V1 目录与 Manifest；完整目录绑定
  Authoring/IR/Registry Lock/Layout/Canonical Scene Plan/Gameplay 与 World Runtime Bootstrap、World Build Identity 和资源字节，可信 Host
  通过内容寻址 `WorldPackageStoreV1` 读回验证后的 Runtime 配置。V1 仅保留为具名迁移、
  测试和历史合同，不再被 active trusted consumer 接受。
- [x] 实现 V2 Package Root Hash、逐文件完整性、Ed25519 签名输入与可信策略、
  License/NOTICE legal closure 和 Host Compatibility Gate；文件 Adapter 支持绝对目录、
  symlink-safe 读取与跨进程原子发布。完成证据见
  [`P1.4 Complete WorldPackage V2 completion record`](reviews/2026-08-27-p14-complete-world-package-v2-completion.md)。
- [x] CLI 支持完整 WorldPackage V1 `build`、`inspect`、`load` 和持久
  `run-session`；旧单文件 Build Artifact 只保留为具名 trusted-host 内部入口，不形成
  第二套公共 CLI 方言。
- [x] Runtime Session 支持 closed canonical NDJSON 生命周期协议、Request ID、Receipt、
  fsynced hash-chain WAL 与 fresh-process 恢复；相同 Request 精确重放、不同内容冲突、
  complete-row 损坏和 torn-tail 策略均有真实子进程证据。
- [x] 加载或恢复 Package 时先完成独立 V2 admission，Runtime Ready 绑定精确
  Package Ref/Root；close、signal、失败和下一 Runtime 启动前均完成 Dispose、
  Ownership Ledger 清空和 World Ready Gate。完成证据见
  [`P1.4 Package CLI and Persistent Runtime Session completion record`](reviews/2026-08-27-p14-runtime-session-completion.md)。

#### P1.5 Subject Control Feel、Physics Medium 与 State Resolver

目标：把“主体怎样响应输入”“主体在地面、水中和空中受到什么物理影响”“当前应该
激活哪种运动和动作状态”变成版本化、可组合、可锁定的 Profile，而不是继续留在
Babylon/Havok Adapter 的硬编码分支中。字段职责以
[`主体资产与 3C 对接设计`](16-subject-assets-3c-integration.md)为基础，实施前必须完成
专项评审；本 Backlog 不提前冻结最终公共字段名。

首条 Ground/Air 纵向切片已按
[`P1.5 Control Feel / State Resolver 首切片实施计划`](../docs/superpowers/plans/2026-08-21-p15-control-feel-state-resolver.md)
实施并通过全部生产 Gate（typecheck、test、build、verify:canonical /
placement-layout / rigged-subject / g-bot-subject）；专项规格见
[`Control Feel、Physics Medium 与 State Resolver 设计`](../docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md)。
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
     （`getCameraPreviewState` / `applyCameraPreview`）。P1.5 尚未发布的 `requestCameraProfile` /
     `resetCameraProfile` 过渡协议已由 GCC-3 clean break 删除；当前唯一合同是
     `cameraViewPreference` 与 `view.camera-preference.set/reset`，不保留 alias。Preview 不属于
     Take 输入或 Gameplay Subject truth，但会改变 rendered Camera、Capture Matrix/Pixels 和
     Control Capture `frameHash`。最终 10 files / 190 tests 相机矩阵、Browser V5 / Route V2、
     Runtime、Canonical、Placement、Rigged、G Bot 与 Validation Capture 门禁已通过；两条
     full-suite Route 超时已串行通过并完成 `main` 对拍，确认是资源竞争而非 Camera
     regression。实施边界和例外见
     [`P1.5 相机收尾`](../docs/superpowers/plans/2026-08-23-p15-camera-tuning-cleanup.md)。
  2. [ ] P1.5 + Subject Preset 合并后的整支分支对抗审查另开，不把它当成合入门禁。

完成标准：仅替换版本化 Profile 就能改变主体的加减速、转向、介质重力/阻力和浮力，
同一输入与 Registry Lock 在固定 Tick 下得到相同 Snapshot/Hash；普通场景 JSON 不需要
复制底层参数，Canonical Runtime 中不存在对应 Provider 硬编码。

#### P1.6 AI Schema Profile、受控覆盖与 WorldChangeSet

目标：让上游 Agent 获得“小而稳定、能力感知”的 Schema，并能用领域操作增量修复
世界；不能要求 Agent 每次重写大型 Authoring JSON，也不能让 Provider Adapter 形成
第二套公共方言。

专项详细设计已经冻结为
[`P1.6 AI Schema、WorldChangeSet 与 Runtime Structural Publication 设计`](../docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)，
审查证据见
[`P1.6 AI Schema / WorldChangeSet 设计审查`](reviews/2026-08-26-p16-ai-schema-world-change-set-design-review.md)。
Publication hardening 已全部折回上述核心规格；
[`历史 amendment`](../docs/superpowers/specs/2026-08-26-p16-world-change-publication-hardening-amendment.md)
和
[`follow-up review`](reviews/2026-08-26-p16-world-change-post-freeze-hardening-follow-up.md)
只保留发现轨迹，不拥有规范优先级。
P16-D0 已冻结，H0–G1 的 Full Reload 首切片与其非 Incremental production closure
均已落地；完成证据见
[`P1.6 Full Reload production closure`](reviews/2026-08-27-p16-full-reload-production-closure.md)。
这不表示完整 P1.6 已完成，也不表示 Incremental 已交付。完整 P1.4 已由独立
[`P1.4 completion record`](reviews/2026-08-27-p14-runtime-session-completion.md) 后续关闭，
不是 G1 首切片的交付物。完整文件所有权、输入输出、集成点和验收证据以专项规格 §21
为准。深度审查见
[`P1.6 Full Reload 变更审查`](reviews/2026-08-26-p16-full-reload-b-review.md)；
G1 完成记录见
[`P1.6 Full Reload G1 Completion`](reviews/2026-08-26-p16-full-reload-g1-completion.md)。

| Task | 状态 | 可独立验收交付物 | `depends_on` / `blocks` |
| --- | --- | --- | --- |
| P16-D0 | [x] 设计冻结 | 唯一专项规格、公共 DTO/Hash/权限/切片边界、全维度审查 | 当前 main、总体设计、P1.6 Backlog / 全部 P16 |
| P16-H0 | [x] 已完成 | Authoring document hash clean break 与独立 `layoutInputHash` | P16-D0 / P16-A0、P16-C1、P16-S1、P16-P1 |
| P16-A0 | [x] 已完成 | provider-neutral `@whitebox-world/authoring-edit` 包、required publication Candidate、mode-specific Receipt 及 strict parser/hash 边界 | P16-D0、P16-H0 / P16-S1、P16-O1、P16-C1 |
| P16-S1 | [x] 已完成 | AI Schema Projector、Profile Registry kind、预算降级、Projection Receipt | P16-A0、P16-H0、P1.4 Registry Lock shape / P16-B1、P16-F1 |
| P16-O1 | [x] 已完成 | 通用 `allowedOverridePaths` 与 Resource Ref Override validator | P16-A0、P16-S1 contract / P16-C1、P16-F1 |
| P16-C1 | [x] 已完成 | WorldChangeSet、Precondition、Operation、Candidate Diff 纯实现 | P16-A0、P16-H0 / P16-P1、P16-R1 |
| P16-P1 | [x] Full Reload closure | 完整 Normalize/Solve/Compile/Package/Gates Candidate pipeline；不可变 Package Store 可重建原 pin/expiry，不延长 lease | P16-C1、P1.4 Package V2 / P16-R1、P16-H1、P16-CLI1 |
| P16-R1 | [x] Full Reload closure | 可注入 file WAL 的幂等 journal、revision head、持久 publication recovery 与单调 cleanup retry；页内 demo 仍明确为 in-memory | P16-C1、P16-P1 / P16-H1、P16-B1、P16-CLI1 |
| P16-H1 | [x] Full Reload closure | RuntimeHost publication V2 + durable Runtime owner：Commit-time authorization/CAS、startup exact-identity recovery、bounded cleanup quarantine | P16-P1、P16-R1 / P16-B1、P16-F1 |
| P16-CLI1 | [x] 已完成 first-slice | Schema/Registry/Change CLI；文件模式 Apply 为 authoring-only | P16-S1、P16-C1、P16-P1、P16-R1 / P16-F1 |
| P16-B1 | [x] 已完成 first-slice | Trusted Authoring/Edit API 装在 `__WORLDKIT_AUTHORING_EDIT__`，V5 仍 exact 38 keys | P16-S1、P16-O1、P16-R1、P16-H1 / P16-F1 |
| P16-F1 | [x] Full Reload closure evidence | Add House / Terrain、双 Provider、file WAL crash/restart、pin rehydration、fence、cleanup、Browser rendered 与人工交互 | P16-O1、P16-P1、P16-R1、P16-H1、P16-CLI1、P16-B1 / P16-G1 |
| P16-I1 | [ ] 后续切片 | Handler Registry、fixed-tick Hot Apply、Differential Runtime Conformance | P16-F1、独立批准的 Incremental plan / P16-G2 |
| P16-G1 | [x] Full Reload production-closure GO | 正式 file-backed Host + fresh-process + Browser/manual 门禁；规格头仍保持 implementation not started；不含 Incremental | P16-F1 / 无 |
| P16-G2 | [ ] 后续集成 | Incremental 第二切片 Final GO | P16-I1 / 无 |

P16-H0 证据：公开 `authoringSpecHash` / `baseAuthoringSpecHash` 使用 `hashAuthoringDocumentV4`
（validated Authoring V4 Canonical JSON，不含 Normalize/Solver/Compiler）；Layout 专用身份
使用独立 `layoutInputHash`。已删除公开 `canonicalAuthoringIdentityV4`。验证：`pnpm typecheck`、
focused hash/normalize/compile/layout-solver 测试、`pnpm test:census`、`pnpm verify:placement-layout`、
`pnpm verify:canonical`、`pnpm verify:rigged-subject`、`pnpm verify:g-bot-subject` 均通过；
WorldPackage / Plan / Report / Take / example artifacts 已同步。这不是 P1.6 生产可用声明。

P16-A0 证据：新增 `@whitebox-world/authoring-edit`，仅依赖 `authoring`、`protocol`、`lodash-es`；
`runtime-host` 不依赖该包。ChangeSet/Request/Receipt/Diagnostic/RuntimeStateEffect 使用 closed
parser + Canonical SHA-256；`publish-runtime` 必须同时带 `preparedCandidateRef` 与
`runtimeExpectation`；validate/dry-run Rejected Receipt 禁止 `requestedOutcome`，Apply rejection
必须保留 Request 的 `requestedOutcome`；Full Reload 的 `runtimeStateEffects` 必须覆盖全部 12 个
`runtimeStateKind` 且 `exceptions` 为空。Authoring 片段校验复用 Canonical `$defs`，不复制 Schema。
验证：`pnpm typecheck`、focused fragment/parser/package-boundary 测试、`pnpm test:census`、
`pnpm verify:workspace-boundaries` 均通过。这不是 P1.6 生产可用声明。

P16-S1 证据：Registry 新增 `ai-schema-projection-profile` 与
`worldkit://ai-schema-projection-profile/constrained-json@1`；`@whitebox-world/authoring-edit`
提供纯函数 Projector / Registry Search。`projectionProfileHash` 绑定公开 Profile body（不含
catalog `aiMetadata`）；`registryLockHash` / `capabilitySetHash` 对集合排序不敏感。超出 enum/bytes
预算时降级为 Canonical `format`/`pattern`，不改字段名。optional/null 双态无法无损表达时返回
`AI_SCHEMA_PROFILE_UNREPRESENTABLE`。authoring-edit 仍不依赖 `subject-registry`。验证：
`pnpm typecheck`、focused projector/search/registry/contracts/package-boundary 测试、
`pnpm test:census`、`pnpm verify:workspace-boundaries` 均通过。这不是 P1.6 生产可用声明。

P16-O1 证据：Definition / AI Profile / Host Policy 的 `allowedOverridePaths` 取交集后校验
Resource Ref Override；第一批路径仍是天花板。验证：focused override-policy 测试、
`pnpm typecheck`、`pnpm test:census`。这不是 P1.6 生产可用声明。

P16-C1 证据：`applyWorldChangeSetV1` 在隔离 Candidate 上执行领域 Operation，产出 Diff /
affectedIds，不进入 Normalize/Compile/Package。验证：focused world-change 测试、
`pnpm typecheck`、`pnpm test:census`。这不是 P1.6 生产可用声明。

P16-P1 证据：`@whitebox-world/authoring-host` 调用现有 Normalize / `createCoreGameplayBootstrapV1`
/ Compile / 当前唯一 WorldPackage V1 做 Trusted Candidate Build，并提供 lease pin/expiry/GC 与 Policy
Hash binding。正式 composition 将 Package 写入经过验证的不可变 file Store；fresh-process
恢复只按 durable build identity 重建原 lease/pin，不延长到期时间或接受 caller path。声明的 Required Gate 必须经 Host 注入的
现有 runner 执行，缺 runner 或失败都 fail-closed 且不写 lease。验证：focused authoring-host
测试、`pnpm typecheck`、`pnpm test:census`、`pnpm verify:workspace-boundaries`。这不是 P1.6
生产可用声明，也不表示 P1.4 整体完成。

P16-R1 证据：`@whitebox-world/authoring-host` 提供 provider-neutral journal/WAL port 与 revision head。
`(sessionId, requestId)` 锁定 Request/Policy Hash，`(worldId, changeSetId)` 锁定 ChangeSet Hash；
相同三元组重试返回 byte-identical Receipt。validate 只跑 C1；dry-run 跑 C1+P1 写 lease 不 pin；
authoring-only Apply 在同一 transaction 写 commit record + new revision head + immutable Receipt。
无 `publishRuntimeReplacement` 时 `publish-runtime` 仍 fail-closed 为
`WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED`。H1 接线后，Host 在 commit barrier 调用
RuntimeHost `publishWorldReplacementV1`；Commit 前撤权保留旧世界，Commit 后撤权/过期
不得改写 immutable Receipt。`scripts/lib/file-world-change-journal.ts` 提供 owner-private、
拒 symlink/unsafe mode 的正式文件 WAL；publication recovery 与 cleanup 进度进入同一 hash
chain，fresh-process 门禁覆盖 commit 前退出、commit 后退出与重放。Playground 页内 Host
仍明确使用 in-memory WAL，不冒充正式 composition。

P16-H1 证据：`RuntimeHost.publishWorldReplacementV1` 在 persistDurableCommit 成功后才
swap handle；旧 Session dispose 失败记 quarantine，不回滚已发布世界。`replaceWorld` 仍保留。
`fencingToken` 由 journal 持有，RuntimeHost 只做 Session/Package CAS。durable Runtime owner
从已验证 Package 重建 committed RuntimeSession/WorldSession/Root/Tick 0；身份分歧或 Package
损坏保持 fenced。Prepare 期间旧世界仍可 tick；durable commit-to-swap fence 拒 Snapshot、
Event 与 input。cleanup 重试达到上限后持久化 quarantine。

P16-CLI1 证据：`worldkit schema project` / `registry search` / `change *` 复用同一 parser。
文件模式 Apply 固定 `authoring-only`，禁止 in-place 覆盖，Dry Run 与 Apply 使用不同
Request ID；connection profile 拒凭证，JSON 输出会 redact token。live submit 端口已定义，
本切片没有随 CLI 启动的默认 live Host。验证：`authoring-edit-cli` 测试。

P16-B1 证据：统一 Viewer 仅在 Host/Loader 提供有效 `authoringSpec` 发布上下文且 adapter
有 `publishWorldReplacementV1` 时安装 `window.__WORLDKIT_AUTHORING_EDIT__`。Browser V5
保持 exact 38 keys；已删除的 `?authoring=1` 与 Browser `?world=` 都不能选择或替换来源。
包 DAG：`authoring-host` ↛ `runtime-host`。验证：Host/bridge 单测与 Chromium 安装测试。

P16-F1 证据：`examples/authoring/p16-add-house` 与 `p16-terrain-replace`；journal 对抗覆盖
Commit 后过期、quarantine、pin vs 并发 Apply、未 pin GC、prepare 失败、terrain Dry Run。
Host↔RuntimeHost 集成覆盖 stale expectation 后成功 Full Reload（新 WorldSession、tick 0）。
Chromium 安装测试证明 Edit 面隔离。页面级
`worldkit-authoring-edit-add-house.browser.test.ts` 已通过受信 Host 固定的 Viewer URL
`publish-runtime` add-house：合法 PNG before ≠ after，`inspectFeatures()` 含
`house-north`。该 G1 证据本身不证明 P1.4、Incremental 或人工操作验收；P1.4 由其独立
completion record 与 fresh-process Gate 关闭。

P16-F1 production-closure 追加证据：`scripts/lib/ai-schema-provider-conformance.test.ts`
证明严格 JSON Schema envelope 与 function/tool envelope 经过同一 parser 后产生 byte-identical
Canonical WorldChangeSet 与 Hash，并拒绝 alias/unknown/Provider 私有字段。正式 Host 的 child
process 测试证明 Candidate pin rehydrate、commit exactly once、启动 publication recovery 与
cleanup 单调推进。Browser add-house 证明 Prepare 期间旧 Session 继续移动、发布后首个可观察
Snapshot 与 Receipt 同为新 Package/WorldSession/Tick 0、Reset 恢复初始 inspection 且单 canvas。

P16-G1 证据：候选 `8ca8503` 上 `pnpm typecheck`、`pnpm test`（234 files / 2651 tests，
含 census 与 workspace boundary 52）、`pnpm build` 通过。G1 过程中关闭了 F1 deep import、
Builder `allowedOverridePaths` 模板、Take 身份哈希、self-check bundle 过期，以及页面级
add-house rendered verifier。完成记录：
[`2026-08-26-p16-full-reload-g1-completion.md`](reviews/2026-08-26-p16-full-reload-g1-completion.md)。
这不是生产可用声明。规格头保持 *implementation not started*。

- [x] 为 Canonical Schema + Registry Lock + 允许 Capability 集冻结版本化 AI Schema
  Profile/Projector；记录 Profile Hash、Registry Lock Hash、Capability Set Hash、规模
  预算和降级原因。
- [x] Registry 枚举超过 Provider 结构化输出预算时，只能按 Profile 降级为带
  `format`/`pattern` 的 Canonical Ref；字段名称、语义和验证规则不得改变。
- [x] 实现跨 Definition 通用的 `allowedOverridePaths` 校验器与拒绝诊断（O1）。
  `definition-override-set` 已由 Host 将 Definition/Profile/Policy 交集校验上下文注入 journal
  Apply；越权路径在 Candidate Build 前 fail-closed。
  Override 仍不能修改版本/Hash、权限、Provider 类型或未开放 Collider/Socket 内部结构。
- [x] 冻结 `WorldChangeSet`/`WorldChangeReceipt`：稳定 ID、`baseAuthoringSpecHash`、
  Precondition、Dry Run、原子提交、幂等重试。增量/全量编译等价性留给 Incremental 切片。
  不使用数组位置驱动的通用 Patch 作为生产协议。`WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`
  是 rebase 信号；Receipt 关闭 union 没有 `rebaseRequired`。
- [x] 明确两条写入平面：已有实体状态走固定 Tick Gameplay Command；结构修改只走
  `WorldChangeSet`。Browser V5 与 Authoring/Edit 分成两个 window 对象。
- [x] 第一条生产切片采用 Full Reload：隔离 Candidate 完成 Apply、完整
  Normalize/Compile/Package Receipt 与声明的 Gate，再准备 Replacement Runtime；Ready 后才
  swap handle。任一步失败保留旧世界。正式 composition 使用 file WAL；页内 demo 才是 Map。
- [x] Full Reload 默认新 WorldSession、Tick 0；Receipt 列出 world-wide `runtimeStateEffects`，
  Full Reload 的 `exceptions` 必须为空。
- [ ] 第二条切片才支持受限 Incremental Hot Apply：每种 Operation/Node Kind 必须声明
  Transaction Handler、状态迁移策略和回滚；未受影响实体保持身份及运行状态，地形、
  全局物理、Schema/Profile Major、插件或不支持的资源变化必须稳定降级为 Full Reload。
- [ ] Incremental Commit 只能发生在固定 Tick Phase Barrier；Visual、Physics、Control、
  Camera、Relationship 和 Ownership Ledger 必须同时发布或同时回滚，并用 Differential
  Test 证明最终 Authoring/IR/ExecutionPlan 与 Full Build 完全等价。
- [x] Runtime 发布请求除 `baseAuthoringSpecHash` 外，还必须绑定 Request/Session、期望的
  RuntimeSession/WorldSession/WorldPackage 和 `next-world-replacement-barrier`；过期或并发
  冲突稳定失败，不能把已验证的 ChangeSet 静默应用到另一个正在运行的世界实例。
- [ ] 已发布协议的破坏性升级使用显式 Version Migration，并输出迁移前后 Hash 和报告；
  未发布私有 Schema 仍按评审批准的 Clean Break 规则处理，不保留永久别名字段。
- [x] CLI/Browser 提供 Schema Profile、Registry Search、Dry Run、Explain、Diff、Apply 和
  Receipt；结构写入只对受信 Authoring/Edit Session Scope 开放。文件模式 Apply 不发布
  Runtime。`load` 只允许加载 Host 已批准的不可变 Package。
- [ ] Conformance 的 Full Reload 部分已覆盖 Schema 规模预算、双 Provider round-trip、
  Provider 降级、非法 Override、过期 Base Hash、重复 Request、Prepare 失败保留旧世界、
  状态重置与 fresh-process replay。仍待 Incremental 的未影响实体状态保留、部分失败回滚、
  增量/全量等价与后续 Migration Golden。页面级加房屋与人工操作已关闭 Full Reload
  rendered/interaction 证据，但不是生产编辑器。

完成标准：至少两个结构化输出 Provider 使用同一 Canonical 字段生成有效世界；一次 AI
修复通过 WorldChangeSet 原子应用并可重放，Adapter、CLI 和 Browser 不产生同义字段或
绕过 Canonical Validation 的旁路；Receipt 能无歧义说明本次修改采用 Full Reload 还是
Incremental Hot Apply，以及哪些 Runtime 状态被保留、重置或替换。

### P2：完成 LEGO 关系与复杂主体

#### P2.1 Subject S2：类型化 Relationship Framework

以下勾选表示内部 Canonical/Runtime 切片已实现，不表示 Hosted Builder 可以生成关系型
AuthoringSpec；M8-S1 的全门禁与双审仍 pending，Hosted self-check 继续拒绝 Relationship 和
package-local Relationship Capability Ref。

- [x] 按 [Canonical Runtime State 与 Semantic Projection 设计](../docs/superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md) 冻结 World State、View State、Runtime Status 与 Transition Log 四个公共投影；不扩充现有 `SubjectRuntimeStateV3` 大对象。
- [x] 增加由 ExecutionPlan Resource Lock 约束的 `capabilityStatesById`，使用关闭 Capability State Schema，禁止自由 `state: Record<string, unknown>` 袋。
- [x] 首个 Relationship Manifest Registry 与角色化 `riderEntityId` / `mountEntityId` / `mountSlotId` 端点；seat/tether 仍保留。
- [x] `mountedOn` 初始 Relationship 编译与动态 Mount/Dismount 事务边界。
- [x] 首个 stand slot 的 Socket closure、Rider/Slot 基数、冲突、删除和权限校验。
- [x] 固定 Tick 原子提交；失败时 Gameplay、World State、Event/Receipt 与 Babylon 投影回滚。完整 Camera Context 原子切换仍归 P2.4。
- [x] 单一 Semantic Fact Projector 已从 retained Physics `checkSupport()` 输出 `supportedBy`，
  不导出 Babylon/Havok Handle、不从 `mountedOn` 推断支撑，也不另建 Ground Support 路径。
- [ ] `touching` / `insideVolume` 仍归 P2.5 Surface Semantics；必须复用同一 projector ownership，
  不能把它们伪装成已由 `supportedBy` 一并交付。
- [x] Request ID 幂等、Receipt、关闭 Event Union、Snapshot/Transition Hash，以及
  Control Capture Track 写入/篡改校验。
- [x] 第一个人—滑板 Fixture 已完成绑定、移动、解绑、Reset、Browser 状态与四阶段真实
  RuntimeHost journal 的正式多帧 Capture verifier；最终 completion 仍由 M8-S1 双审决定。

#### P2.2 Subject S3：骑乘、拖拽与控制上下文

当前实施暂停，优先级待重新排序。已冻结的下一窄切片是
[P22-S1 Seated `mountedOn` Control Context Design](superpowers/specs/2026-09-01-p22-seated-mounted-control-context-design.md)：
先交付 package-local 人—四足坐骑的 `seat` Mount Slot、控制权、真实 Physics Safe Exit 与最新
Camera 合同闭环；`towedBy`、Joint 和马车/拖车留给独立 P22-S2 设计。任务恢复时必须从该设计的
依赖图和删除台账创建实施计划，不得从旧 `seat`/`tether` reserved 方言继续。

- [ ] P22-S1：按上述冻结设计完成 package-local 人—四足坐骑 seated `mountedOn`；设计已完成，
  实施暂停。
- [ ] P22-S2：在独立设计冻结后实现 `towedBy`、Joint、Detach 与马车/拖车 Fixture。
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

- [x] 完成并评审 [上下文驱动 Gameplay 与 Camera 组合设计](../docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)；接受 Kit → committed state → Camera Context → CameraDirector 单向链路、唯一 View Preference 和代表性 Fixture。
- [x] `@whitebox-world/camera` 当前候选已 clean-break 为 provider-neutral Domain，实现关闭的命名
  Rig/Modifier/Context Profile、`CameraContextSampleV2`、`CameraViewPreferenceV1`、Context/
  Preference admission、纯 `selectCameraViewV2`、fallback diagnostic 与 explain。
- [x] GCC-0B/GCC-0C：package API/dependency DAG 与 provider-negative 边界测试已建立；Camera
  Domain 不拥有 renderer、physics、Browser、Runtime Session 或 Gameplay State。
- [ ] GCC-0/GCC-0A/GCC-1：Browser V5/View clean break 已完成；M8 当前候选已实现 committed
  `possessedBy`/`mountedOn` → `CameraContextSampleV2` 窄 Projection。广义 Equipment/Flight
  Projection 仍待完成；不得保留旧命令 alias 或从 Render Pose 反推 Context。
- [x] GCC-3：唯一 `cameraViewPreference` Command/Receipt/View State 已接入 RuntimeHost；
  Camera 命令幂等重放、冲突拒绝、统一 Event Sequence、Context/Modifier/Target/fallback 自动变化
  事件以及 Browser V5 consumer clean break 已闭环。GCC-2 的 Registry Lock 完整覆盖仍单独推进。
- [x] GCC-4A：CameraDirector 已在提交 View 状态前解析选中 Rig、全部匹配 Modifier 与 Preview
  的最终参数并再次执行 Camera Domain 不变量校验；非法组合稳定拒绝且不修改上一 Camera 状态，
  Preview 也会针对当前 Context 全部可达 Modifier 做写入前组合准入。该子门槛完成不代表
  GCC-4 的 Selection Event、Golden Fixture 或最终生产验收已经闭环。
- [x] GCC-3A：`runtime-contracts` 已冻结唯一 `view.camera-preference.set/reset` Command 与
  `camera.selection.changed` / `camera.target.unbound` Event 关闭协议，包含 Canonical
  Command Hash/Bytes、Event ID、严格字段准入和顺序列表校验。RuntimeHost Receipt、统一
  GCC-3B 已在 RuntimeHost 建立 Receipt、Event capacity 预留、View revision 提交和统一
  WorldSession Event 查询；Browser V5 只保留 `executeCameraViewCommand` 与
  `getWorldSessionEvents`，旧同步 set/reset 与 Gameplay-only Event 查询已删除。
- [ ] GCC-4/GCC-5：M8 stand-ground 窄 seam 已让 CameraDirector 消费 committed Selection
  Decision/typed Relationship Context；广义 Equipment/Flight 仍只提交 Camera 输入。Gameplay
  失败自行回滚，成功后 Camera 在下一 fixed tick 原子替换完整 publication，不能回滚 Gameplay。
- [ ] GCC-6/GCC-7：交付两个 Kit、Registry Lock、Browser/CLI/Take 与两个 Golden Fixture，
  分离 automated contract、runtime numeric、rendered visual 和 manual interaction 证据。
- [ ] GCC-8：全门禁、包边界审计、最终复核和 production/experimental 声明。
- [ ] 同一 Runtime Session 创建多个 Controller 并在同一 Tick 提交 Intent Batch。
- [ ] Possession 权限、Sequence、Expected State 和冲突策略。
- [ ] 第一人称、第三人称和声明式 Camera Rig 切换。
- [ ] Browser/CLI 支持观察、控制、截图权限分离。
- [ ] 为上游 Agent 提供 Registry Search、Dry Run、Explain、Diff 和结构化修复工具，不提供底层引擎对象。

已知问题 `CAM-MOUNT-1`（2026-08-26，M8-S1 窄 seam 已修复）：历史根因是 Possession 切到
skateboard 后，Babylon ViewTarget Sample 丢弃 committed `mountedOn` 上下文，导致
`mounted-framing` 从未命中，镜头继续使用 5m 基础臂长。当前 M8 clean break 已删除旧
`relationshipRole(s)` 方言；Camera Context 同时保留 committed controlled Entity、selected
Target 与类型化 `relationshipContexts`。唯一 Rider 命中 7m mounted modifier，共享 Mount
歧义 fail closed，Dismount 后下一 Camera 固定更新撤销 modifier。该窄修复属于 M8-S1，
不代表上面的广义 GCC-4/5/6/7/8 已完成。
真实 Havok 集成回归确认 Mount/移动/Dismount 全链路、请求臂长 7m 且有效臂长大于 6m；
Playground M8 acceptance fixture `mounted-skateboard-s1` 已增加场景专用 Mount/Dismount 验收控件；控件只提交
Browser V5 `action.activate` 并从 Snapshot/Inspection/Camera Telemetry 显示结果，不成为第二状态权威。
真实浏览器验收确认 Mount 后 `skateboard / skateboard / mounted-framing / 7m`，Dismount 后恢复
`player / player / none / 5m`，Reset 后可重复单周期验收；正式四阶段 Capture Bundle verifier
已由 M8-S1 接入，最终 completion 仍等待 exact-SHA 双审。

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
[`Hybrid Terrain 与非 Heightfield 特殊地形设计`](../docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)
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
  [Babylon-only Runtime 收口实施计划](../docs/superpowers/plans/2026-08-25-babylon-only-threejs-retirement.md)。
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

#### P3.4 AI-friendly Babylon Native Scene Lane

架构方向已由 [ADR-0007](decisions/0007-canonical-and-babylon-native-authoring-lanes.md) 接受，唯一详细权威为
[AI 友好的 Babylon Native 世界创作长期设计](../docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)。
它不是把 Native 视觉并入 Canonical Compiler，而是让每个世界在 Canonical Source 与 Native Source
之间二选一，并在同一个 RuntimeHost/Babylon/Havok Gameplay Kernel 汇合。

- [x] BNA-0：长期架构、术语、单一权威、ADR 和生产化依赖图冻结；
- [x] BNS 实验切片：受信本地 Native Module、一个 Spawn、显式静态 Collider、SDK-owned Havok/
  Subject/Input/Camera 和云海山门视觉/通过性证据；这不是生产完成度；
- [x] BNA-1：Runtime Scene Source Union、正式 Native Bootstrap、Plan-independent
  `WorldRuntimeBootstrapV1`、source-neutral `WorldBuildIdentityV1`、`SceneAuthoringRouteDecisionV1` 与
  `SceneAuthoringAttemptV1`/`SceneAuthoringAttemptResultV1`；完成受影响消费者的版本迁移，移除影子
  ExecutionPlan 和伪造 Plan Hash。Canonical consumer 已 current-only 迁移；实验 Cloud Ridge 不再创建
  shadow Plan；其历史 formal rejection 已由 BNA-4 current-only 删除；
- [x] BNA-2：独立 `@whitebox-world/native-babylon` 与 `defineBabylonNativeScene`；Block Profile 保持为
  BWB-1 的可选独立包，不塞入 core API 形成默认 DSL；
  - [x] BNA-2 Foundation 内部 checkpoint：AI-facing root / Host-only subpath、唯一 Deep ESM Import
    Profile、Host uint32 随机源、锁定资产 Resolver 接口、闭合诊断、冻结无 Handle 的 Collider
    Contribution/Hash、预算/登记 Admission 与 `cloud-ridge` current-only 迁移已通过本轮合同、Runtime、
    Build、浏览器和人工保真门禁；这不是兼容承诺或生产支持；
  - [x] BNA-2 Trusted Local 工程闭合：Source Admission、Authority Audit、双 Candidate Runtime Replay、
    正式 checker/explain CLI 与 `0/1/2` exit、Cloud Ridge/current consumer clean break 已通过 exact-SHA
    Cloud gate 和独立 Mode B + runtime-deep 审查；专项设计与证据见
    [BNA-2 生产闭环设计](superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md)与
    [最终审查](reviews/2026-08-29-babylon-native-authoring-production-closure-review.md)。
    BNA-6 AI 生成/修复评测在 BNA-5 后独立执行，不反向成为 BNA-2 依赖；
- [x] BNA-3：Bundle、依赖/资产锁、Package、Contribution Hash 与 Build Receipt；只消费已发布的
  class-specific Resource Ref，并绑定 Route Decision Hash/completed Attempt Result，不执行资产生产或发布；
  - [x] 最终实现已完成 deterministic Bundle、安装树/资产锁、双 Candidate replay、统一
    Package/Receipt/verifier/Store/File/signing/inspect，以及 Runtime pre-allocation rejection；聚焦证据见
    [BNA-3 实现审查](reviews/2026-08-30-bna3-native-package-receipt-review.md)。
  - [x] 精确 SHA `9fe9e6e3` 的 Cursor Cloud 全量门禁与独立 Mode B + runtime-deep 均 GO；PR #56
    已合入 `origin/main@2fd8c1c` 并完成祖先证明；
- [x] BNA-4：统一 Gameplay Kernel、Profile-based Surface Admission、稳定 Surface/Subshape identity、
  原子生命周期和对抗测试；最终产品 SHA `dfa6fbc` 的 Cursor Cloud full gates 与独立
  Mode B/runtime-deep 均 GO，正式 Native Package 已接入同一 RuntimeHost/Gameplay/Havok/Camera Kernel；
  证据见 [BNA-4 实现审查](reviews/2026-08-30-bna4-runtime-surface-admission-review.md)；
- [x] BNA-5：Trusted Local/Hosted Isolated Trust Profile、effective-minimum budget、Host-minted admission、
  provider-neutral Supervisor、Linux disposable isolation、Dedicated Origin/CSP/asset allowlist 与安全 Gate；
  产品 SHA `2f46b3c9` 的 capable-runner 11-case hostile/matching-deadline evidence、exact-SHA Cloud full gates
  与独立 security/runtime-deep 均 GO，开放 P0/P1/P2 = 0；
- [ ] BNA-6：当前只实施 NBR-1 所需的单模型/Profile、单代表 Case、真实 AI 首次生成与诊断切片；完整
  Golden Corpus、批量成功率和最终人工统计延期，不能因最小切片通过而勾选本项；
- [ ] BNA-7：当前只实施 NBR-1 所需的同一冻结 Package 身份绑定 Opening/top/side Capture；关键通过性
  使用明确标注的固定输入 Havok 脚本证据，正式 Route/Nav/`goTo` 仍延期且不能伪称完成；
- [ ] BNA-8：按 Trusted Local、Hosted、Route 三种范围分别做最终 Go/No-Go 与文档切换。

在 BNA-6 完成并建立独立实施计划前，不提高总进度，不把 Native API 写入 Quickstart，也不修改
Catalog/Hosted Builder 生产工作流。P2.6 仍可先使用审核过的 Structure Resource 和产品 GLB；Native
Lane 不自动扩大 Cave、Overhang、双层 Route 或 NPC Navigation 的当前能力边界。

#### P3.5 Source-neutral Asset Production / Admission

详细权威为
[Source-neutral 资产生产与准入长期设计](../docs/superpowers/specs/2026-08-28-source-neutral-asset-production-and-admission-design.md)。
该工作流是 BNA/Canonical 之前的资源供应链，不是新的 Scene Source；当前全部为 Proposed/未实施，
不追溯扩大已经完成的 BNA-0，也不提高总进度。

- [ ] APA-0：完成书面规格、ADR/Native 指针、GameFactory 固定源码证据与 Mode A/B 审查；
- [ ] APA-G0：在唯一 `packages/geometry-assets/**` Owner 冻结新的
  `StaticGeometryAssetManifestV1`/`StaticGeometryBuildRecordV1`，不复用旧 Compiler/Collider 字段，不启用
  Exploratory Canonical Geometry Compiler；
- [ ] APA-1：冻结 Candidate Manifest、Production Request/Result/Receipt、Admission Result/Receipt/Profile、
  Publication Result/Receipt 和关闭 Diagnostic；source-neutral 合同不复制 Static Geometry Manifest；
- [ ] APA-2：实现不可变 Candidate Store、资产类别 Build 调度与只读 Admission；
- [ ] APA-3：实现 exactly-once/可对账 Provider Router，再接一个真实 Provider；
- [ ] APA-4：由 Static Geometry Owner 原子发布 Registry Ref/Publication Receipt；不修改 Canonical-only WorldPackage V1，也不先发明
  Native Package 变体；
- [ ] APA-5：完成单体 Landmark 纵向实验；`scene-shell` 只作 artifact-only 研究并验证 publish/package/load
  Fail Closed；
- [ ] APA-6：冻结 Golden、阈值与 scoped GO/NO-GO；真实 Native Package 集成仍由 BNA-3 独占。

#### P3.6 Babylon Native Block Whitebox Profile

详细权威为
[Babylon Native Block Whitebox 创作 Profile 长期设计](../docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)。
BWB-3/4 的集成施工与真实台阶前置由
[Block Settlement 与真实台阶闭环设计](../docs/superpowers/specs/2026-08-31-babylon-block-settlement-and-step-closure-design.md)
及其[实施计划](../docs/superpowers/plans/2026-08-31-babylon-block-settlement-and-step-closure-implementation.md)独占。
该 Profile 采用 `JSON Control Plane + Babylon Native Block Whitebox + Frozen Contributions + SDK/Havok`
组合；它不是第三条 Scene Source，也不恢复旧分支的 Three/Manifest/Compiler。BWB-1/BWB-2 的可选
Package、Build-Epoch Session、结构 Checker、直接 Babylon 视觉、多视角 authoring screenshots、同一
Layout/Finalize/Host settlement 的 Collider/Havok 链和真实 0.25m 台阶前置已经闭合。PR #68 已通过
focused 验证并合入 `main@d1ba942`，BWB-5 参考场景 Corpus 已完成；formal Capture/Route、AI 评测与
生产 disposition 仍未完成，且不由该 Corpus 代替。

- [x] BWB-0：冻结 Profile、旧分支 `618d96b` 处置、外部证据、能力边界、依赖工作图和
  [Mode A 审查](reviews/2026-08-28-babylon-native-block-whitebox-profile-design-review.md)；
- [x] BWB-1：在 BNA-2 后创建可选 `@whitebox-world/native-babylon-block-profile`，冻结 shape/grid/
  palette、Build-epoch-local Layout 与 diagnostics；
- [x] BWB-2：重写 Occupancy、重叠、坡面输入、边界、Visual Group 和预算 Checker，不复制旧 DTO/
  Preset/Compiler；
- [x] BWB-3：同一 Profile Session 已接入直接 Babylon Mesh、稳定视觉组和 Opening/top-down/侧视的
  Build-Epoch-local authoring screenshots；它们已与 BWB-4 经过同一 Layout/Finalize/Host settlement，
  但仍不是 BNA-7 formal WorldPackage/Browser Capture；
- [x] BWB-4：同一内存 Layout 已产生 core Static Collider Contribution 及关闭 `traversalBinding`，由 SDK
  冻结、verified Package replay 后创建 Havok；没有独立 Traversal/Visual Group Contribution，Runtime
  不查询 Layout 或第二 Height Sampler；真实 0.25m step、0.5m blocker、support、ledge、reset 和 cleanup
  已在同一 Package 链通过；
- [x] BWB-5：PR #68 已实现并合入山地、T 字空间、台阶、建筑、有限室内视觉及负向 Corpus，闭合结构、
  profile-local screenshots、BNA-4 Collider overlay、Spawn Support、真实人物通过性、30/60/120
  render cadence 与跨 Session/Layout cleanup/rebind 证据。后续证据补强从有效走廊证明 T 字北墙
  Havok 阻挡，绑定冻结 Contribution 近面、capsule radius 与 ground medium；未扩 Corpus。单
  Subject、无 Browser FeelReview 是已登记的非阻塞债务，不伪称跨实体
  rebind、formal Capture/Route 或生产 disposition；
- [x] BWB-6：PR #149 已合入 `main@18ad6979`，交付 current-only Profile-side Chunk、Thin Instance
  与 Collider coalescing eligibility/grouping、等价 fixture、五类正向 Corpus 的确定性资源计数 benchmark
  和 BNA-owned 执行提案。基线 48 个视觉 draw/geometry drivers 与 48 个 Collider proxies 的提案值为
  25 与 40；这不是 CPU/GPU/Havok 实测。实现未修改 Runtime/Havok、AI-facing Schema 或 Contribution
  语义，完整证据见 [BWB-6 Profile Optimization Review](reviews/2026-09-01-bwb6-profile-optimization-review.md)。

##### Agent-friendly Block Drawing API（BWB Profile 增强）

后续 AI 友好绘制能力由
[设计](superpowers/specs/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md)和
[实施计划](superpowers/plans/2026-09-02-agent-friendly-babylon-native-block-drawing-api-implementation.md)
约束。它在已完成 BWB-6 之后扩展同一个 `@whitebox-world/native-babylon-block-profile`，不重开
BWB-6、不增加 WRC-1 第 34 个工作包，也不新增 Package、Scene Source、Compiler、Runtime、Physics、
Gameplay 或 Camera owner。目标是用一个 current-only clean break 将 Profile Block 初始位置/四分之一转
纳入原子 `createBlock()`，并增加只负责机械密集重复的 `createBlockGrid()`；Collider 仍只由显式
Finalize Contribution 登记。

- [x] WRC-API-00：冻结设计、唯一 v2 迁移 SHA、clean-break ledger 和
  [独立 exact-SHA Mode B 审查](reviews/2026-09-02-agent-friendly-babylon-native-block-drawing-api-change-review.md)；
- [x] WRC-API-10/20/30：冻结 RED 类型合同，实现原子 positioned Block 与确定性 dense Grid；
  `createBlock()` 必填 `centerMetersXYZ` 与 closed `rotationQuarterTurnsY`，`createBlockGrid()` 整批
  预检后再分配、失败逆序回滚，Finalize 复验 declared placement 并把事后 transform 判为篡改；
- [x] WRC-API-40：一次迁移全部活跃消费者、Fixture 与 Native Builder Skill，删除旧 placement dialect
  与仅负责 create-then-position 的本地 helper，并加入 package 普查断言防止旧方言复活；
- [x] WRC-API-50：此前唯一仍教旧 placement 方言的活跃生成输入——代表性 Case 的冻结 Builder Skill 副本
  `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/builder-skill/`——已刷新为与 live Skill 逐字节
  一致，并加入防漂移断言；`packageNativeBlockAttemptV1` 现有证据显示 create-then-mutate 生成模块被
  Host typecheck 以 `native-check-rejected` 拒绝且不产生 Package 输出，而重新生成的当前 API 源码得到
  新的 `authoredSourceHash`、`worldPackageRootHash` 与 Build Receipt 身份；已发布历史 Package 的
  `authoredSourceHash` 未被改写，也未伪称 TypeScript API 变更会改变已发布 Profile descriptor hash；
- [ ] WRC-API-90：focused gates 与 Codex exact-SHA follow-up review 已在变更树通过；Cloud full gates
  尚未形成最终收据，真实生产 Package/Receipt 证据仍由 NBR 生产链路拥有，因此本项保持开放。

以上勾选项记录包含 PR #162 实现提交的目标树上已有的代码和 focused 证据；只有实际包含这些提交的
目标树才可表述为已交付。
本增强本身不完成 NBR-20/70/80/90、BNA-6/7、WRC-SR 或 WRC-1；生产链路只有在该 current-only
cutover 合入后才能使用新 Profile 合同，不得保留旧 placement dialect、兼容 overload 或 fallback。

#### P3.7 Project Health Observatory

详细权威为
[Project Health Observatory 设计](../docs/superpowers/specs/2026-08-30-project-health-observatory-design.md)，
执行任务见
[Project Health Observatory Implementation Plan](../docs/superpowers/plans/2026-08-30-project-health-observatory-implementation.md)。
它是仓库工程健康层，不是新的 World Validation、Scene Source、Runtime authority 或通用“健康总分”。
现有测试、Build、Browser verifier、视觉 Capture 和人工审查继续产生事实；Observatory 只做精确树绑定、
受影响门禁规划、跨证据关联、趋势和稳定诊断。PHO-0A/0B 已合入 `e40a2c16`；PHO-1 先合入 Evidence
`publicSymbols` 与 Authority Policy 选择器/符号合同，再合入唯一 scan 与两个 Sensor。不提高总进度。
PHO-6 已通过 PR #71 合入单一 Host 同进程链：`Registry Gate -> validated execution evidence/content-addressed
audit output -> actual Registry Sensor -> internal Observation -> Report`。外部 Receipt/Observation 不作为
admission；workspace graph 与 test census 只取同次 Gate stdout 的语义 evidence。Sensor 身份绑定真实递归源码
闭包 Hash，所有可信入口要求 own-checkout exact HEAD/exact-clean；PR 还要求显式 ancestor base，并由 trusted
event head 与 checkout equality 排除合成 merge checkout，再由关闭 execution-evidence parser 校验状态、仓库指纹与
清理结果。Nightly/Release 的稳定入口保留，但在 Required Sensor 尚缺生产输入 adapter 时，Host 必须在任何
重型 Gate 前从 Profile Required 集合派生 readiness，以空 Gate map 调用真实 Sensor、发布 canonical
`incomplete` Report 并退出 `3`；不得降低 Profile、伪造证据或增加外部 admission。PR 仅缺 Advisory adapter，
因此继续执行固定 Gate 闭包并显式保留 not-evaluated Metric。Release 的 independent review 同样保持
Advisory，由 PHO-8 作为与 Release Report 并列的 exact-SHA adoption gate，不回灌同一 SHA。首个 baseline
只接受 Required evidence 完整的 passed PR Report，并原样保留 Advisory gaps。PR #73 又把 Gate 输入 selector
收紧为 Git tracked source/config，Host 自产 `dist`/`__pycache__` 不再造成伪 stale Receipt；tracked source
变化仍会使证据失效。PHO-6 至此完成，PHO-7 继续负责生产 Adapter、总 Deadline 与 CI 接线。

- [x] PHO-0A：冻结 current-only Profile、Metric、Observation/Finding、Gate Plan/Receipt、Review Receipt、
  Report、中立 Workspace Evidence、补充 Authority/Supply Chain Policy、Accepted Debt 和 canonical fingerprint；
- [x] PHO-0B：实现唯一 bounded/redacted execution envelope，关闭 `in-place-checkout` / `isolated-temp-worktree`
  scope，统一 timeout、cooperative owned-process cleanup、临时目录和证据 Hash；
- [x] PHO-1：扩展现有 `workspace-boundary.ts` 唯一 scan Owner，使一次 walk 投影 graph、`publicSymbols`
  权威事实和 violations；Host 注入 `commitSha`；两个同名 Sensor 只消费该 Evidence 与精确 path/symbol
  Authority Policy，检测重复 Owner、compat alias、Canonical/Native 边界；禁止第二次 `rg`/glob/AST；
- [x] PHO-2：复用现有 Owner 命令实现 Contract/Generated parity，并增加独立 Supply Chain Sensor 观察
  `contract-parity` lock/install/patch Receipt、唯一 `dependency-inventory`、provenance/license 与绑定 provider snapshot
  的漏洞/弃用信号；不重复 workspace undeclared-import 或 lock parser；
- [x] PHO-3：以现有 test census 和 PHO-1 graph evidence 为唯一归属/依赖输入，通过 PHO-0B 执行 Git diff，
  实现 Change Impact → mode-specific Required/Advisory Gate Plan 与证据失效判断；PR 不因非 PR Gate 缺 Receipt 而阻断；
- [x] PHO-4：实现隔离的 Runtime 生命周期、资源 Owner、30/60/120 cadence 和多实例确定性 Sensor；首个 Required
  Profile 只登记已生产 RuntimeHost/Browser/fixed-cadence Owner，BNA 双 Candidate 在生产 GO 前仅为 Advisory；
- [x] PHO-5：实现 bundle/性能、视觉、文档真相和独立 Review Receipt Sensor；未冻结的趋势/AI 判断保持 Advisory；
- [x] PHO-6：实现唯一 Gate/Sensor Registry 与同进程 Host 链、仅作审计输出的 `health:record`、稳定聚合
  Policy、真实源码闭包 identity、exact-clean/evidence parser、
  `health:pr/nightly/release/explain/update-baseline` 和 0/1/2/3 exit contract；禁止外部 Receipt/Observation admission；
- [ ] PHO-7：接入 PR/main-push/Nightly/Release CI；每个 mode 由单一 Host check 在同进程执行 Registry Gate 与
  Sensor，不消费外部 Receipt/Observation，也不在前序步骤重复重型 Owner Gate；普通 check 不更新 tracked baseline；
- [ ] PHO-8：完成对抗 Corpus、全维度审查、Cursor Cloud 独立复核、文档切换和最终 GO/NO-GO。

#### P3.8 WRC-1 世界还原与可玩控制闭环

当前 BNA、BWB、PR #41 后续动作/相机、空间事件、场景还原评测和 PHO 工作统一由
[WRC-1 World Reconstruction & Control Milestone](superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)
编排。`WRC-1` 是便于检索和分批集成的总项目，不是新 Runtime、Scene Source、Package、Compiler、
状态权威或长期大分支；BNA/BWB/PHO 与 3C/Camera 规格继续拥有各自详细技术合同，本页仍是唯一实时
完成状态入口。

WRC-1 共包含 33 个工作包：已有 JUMP-0..3、BNA-3..8、BWB-3..6、PHO-0A/0B/1..8，另增：

- [x] WRC-GOV-1：把 PR #41 单一权威、Snapshot/Hash/Reset/Replay/Rollback 和禁止 Provider 私有
  Gameplay 状态的规则写入 AGENTS、Runtime checklist 与机械化边界回归；
- [ ] WRC-ACT-1：冻结 Action Context、Channel Lock、`ActionVariantSet` 与 `PoseSetProfile`；
- [ ] WRC-ACT-2：完成固定 Tick Action/Posture Reducer、Cancel/Interrupt、fall/land、声明式 fallback、
  安全 Capsule 切换和重放；
- [ ] WRC-CAM-1：完成 Action、跳跃/落地、狭窄/室内和事件焦点的 committed Context → CameraDirector；
  同时对 `codex/block-world-main-integration@1678960f` 的 Camera committed render-pose 历史做
  current-owner 复验：若采用，只允许在展示时按 alpha `0/0.5/1` 采样前后两个 committed Camera pose，
  不得改变 Snapshot、Hash、Tick、碰撞或 CameraDirector 权威；
- [ ] WRC-CAM-2：完成第一/第三人称、碰撞、暂停/Reset/cadence/隔离 Golden Fixture 与两轮真实
  `FeelReviewReceipt`；增加同一 Bootstrap 在交互 Preview、Formal opening Capture 和 artifact preview
  的 position/target/FOV 构图对拍，并证明 Reset、rebind、视角切换、暂停和 rollback 会折叠 Camera
  render history，不插值穿越离散跳变；
- [ ] WRC-SR-1：冻结拓扑、语义轮廓、路线、Opening Composition、碰撞和通过性分维度场景还原评分；
  expected/observed 必须使用同一种可解释量测，不能把入口身份色真实像素面积与世界 AABB 投影矩形面积
  直接相减；`present` 必须来自真实可见/遮挡观测而不是只要投影 AABB 在视口内就写 `true`。Opening、
  world-side、world-top-down 和必要的内部结构/完整世界覆盖必须各有明确评分或明确非评分处置，不能只保存
  两张全景图却让 Opening bbox/center/coverage 代表全部视觉还原；
- [ ] WRC-SR-2：实现稳定诊断驱动、轮数受限、只修改 Authoring/Resource 的场景修复循环；
- [ ] WRC-EVT-1：实现位置进入/退出 → committed Event/Receipt → 世界/人物变化 → Camera Context 的
  可重放纵向切片；
- [ ] WRC-ACC-1：用山地/T 字、台阶/建筑/有限室内、动作/相机/空间事件三个旗舰 Case 完成 WRC-1
  exact-SHA 总验收与文档切换。

每个工作包独立成可审核的小 PR，依赖满足且门禁闭合后立即合入 `main`，不等待 WRC-1 全部完成。
开发期只跑聚焦 RED→GREEN 和一次受影响门禁；整仓重型门禁与独立深审只在合入候选/阶段收口时由
Cursor Cloud 针对精确 SHA 执行，禁止无输入变化时反复重跑。

#### NBR-1 当前唯一最高优先级纵向切片

后续 current-only 入口与构图门禁切换由
[Native-default World Generation and Opening Gate Design](superpowers/specs/2026-09-02-native-default-world-generation-and-opening-gate-design.md)
约束：所有新任务省略 Source 时默认 `babylon-native`，Canonical 仅显式选择；Studio/CLI 共用一个
Source parser；选中 Lane 后仅由该 Lane 的可信 Host owner 生成 Route；正式 Capture Receipt 发布前必须通过
source-neutral Opening Composition Host Gate。
该切换不新增 WRC 工作包、Scene Source、Runtime、Viewer、Physics 或 Camera owner。

- [x] NBR-00：合入详细设计、实施计划、WRC 优先级和 current-only 删除清单；
- [x] NBR-10：冻结 Route、真实 Generation Request/Receipt、Case/Profile 和修正后的 Attempt 身份；
- [ ] NBR-20：通过统一 Codex task router 从真实参考输入生成闭合 Native Block workspace；
- [x] NBR-30：通过通用 Native Check/Explain 和 Package/Receipt 链，删除 Cloud Ridge 手写生产装配；
- [x] NBR-40：由保留的 BNA 验证 Harness 调用正式 RuntimeHost 和 SDK-owned
  Havok/Subject/Input/Action/Camera 启动验证后的 Native Package；不修改 Canonical-only Unified Viewer；
- [x] NBR-45：从同一 Package/Runtime 发布身份绑定 Opening/top/side Capture 与 Collider overlay；
- [x] NBR-50：输出拓扑、语义轮廓、Opening、Spawn/Support、Collider、固定输入关键通过性和确定性诊断；
  每条失败以闭合 `metricId` 独立记录目标、期望、实测、阈值、超出量和修正方向，不用笼统诊断吞掉
  同一目标的多个子指标；
- [x] NBR-60：一个初始 Attempt 加最多三次诊断驱动修复，并产生新的 Attempt/Package/Receipt/Capture；修复任务逐条执行
  metric-bound Native source action，禁止修改 Case、Profile、阈值、冻结 Owner 或既有产物；
- [x] NBR-65：按
  [Native Block V2 Capability Migration and Walkable Surface Closure](superpowers/specs/2026-09-02-native-block-walkable-surface-closure-design.md)
  迁移 v2 已验证且适用于当前生产链的完整能力集：显式 Collider/Surface Group、唯一 logical ground
  model、足迹/净空/Spawn/目标/连通/Traversal Band 与探索指标、共享可视/Havok 地表、精确聚合
  Collider、真实 Thin Instance/Chunk/physics residency、远景常驻、白膜光照和 ground-only 悬崖边界；
  最终以逐能力 parity report 防止“只迁视觉、不迁可玩性”。保持 Babylon Native + Frozen
  Contributions + SDK-owned Havok，不恢复 Three、Manifest、Compiler、hidden foundation 或第二 support
  owner。它是 NBR-70 前置，不增加 WRC-1 第 34 个工作包；
- [x] NBR-65J：恢复 `codex/block-world-main-integration` 已验证的生产反馈语义，但不恢复 Three、
  Manifest、Compiler 或 hidden foundation：把 Planner 的 `world-plan.png` 与
  `entry-whitebox-target.png` 作为具名哈希输入交给 Native Builder；区分硬准入与还原质量；所有
  Profile 继续执行相同检测；质量未达标时保留明确 strict diagnostic，但普通生产是否成功完全按
  老分支 requested scope 的成功/失败标准判断，达到该标准的 Package/Capture 必须原子发布并返回
  `productionOutcome: passed`。`required-for-publication` 只决定是否在预算内继续做外部质量修复，不是
  另一套普通生产终态；NBR-70/90 正式验收继续由显式严格命令拥有。该项属于
  NBR-65 内部纠偏，不增加 WRC-1 工作包数量。交互式生产命令在正式 Capture 与 Evaluation 产物完整、
  身份有效且老分支所需阶段闭合后发布；Evaluation verdict 本身不必通过。它不自动重复耗时的 fresh
  Browser playability；完整可玩性复验继续由显式
  `verify:native-block-reconstruction-e2e` 与未完成的 NBR-70 验收拥有。默认交互入口的模型阶段必须
  精确为 Unified Planner → Babylon Native Block Builder；Planner 交付后由 Host 从冻结 Brief、身份色板
  和入口图确定性派生宽松基础 Case，禁止恢复独立 `native-case-mapping` 模型任务、第三次模型调用或
  Mapping retry。显式 curated strict Case 继续直接进入同一 reconstruction runner；
- [x] NBR-65K：把上述模式边界落实为同一正式入口的 current-only 行为，而不是增加一条宽松链路：
  `report-only` 仍强制 Native Check、Ground Analysis、显式 Collider/Spawn/Package/Receipt、Runtime
  与 Capture 运行成功；Builder 仍可在同一任务内使用冻结的 source-only 自修复预算。候选当前会让
  `report-only` 的 Host Check/Ground 拒绝带诊断结束 Run、不创建外部 Attempt；这只是当前实现事实，
  不能宣称已和老分支一致，`BWMI-CF-26` 仍须逐条件恢复旧 retry/terminal 矩阵。Opening Composition 与
  Evaluation 继续计算并发布诊断；current-only quality drift 不拒绝 Capture、也不触发新的外部 Attempt；首个完成的
  Package/Capture/Evaluation 若只剩老分支不否决的还原质量/严格验收问题，即按同一产品合同返回
  `passed/published`，同时保留独立 strict diagnostic。无法形成老标准所需可运行 Stage，或路径、Hash、
  Receipt、Package/Capture 身份与原子发布完整性失败时仍拒绝；NBR blocker join 等 strict verdict 不在此列。
  显式 `required-for-publication` 可让 Check/Ground/Opening/Evaluation 的可修复失败
  消耗最多三次外部 Attempt，但预算耗尽后仍由同一老分支产品标准决定普通发布，不产生第二终态。
  严格检测实现继续由原 Owner 保留，不能形成第二 parser、第二 CLI、fallback 或旧新双入口；生产层
  直接删除 `preview-ready/not-accepted`、旧式 `rejected-capture` 预览重解释、publisher bypass 和重复
  verifier 发布门，不以 mode、alias 或 fallback 保留。CASE-054 是首个规范回归样例；原子发布、路径
  安全、Hash、fsync 和不可变身份闭包继续保留；
- [ ] NBR-70：真实 `cloud-temple-t-gate-native-block` Case 可本地启动、接地、移动、挡墙和通过；
- [ ] NBR-80：删除已替代/重复的生产路径、production-root Corpus exports、固定 Native Case loader、
  临时命令和旧 Capture Intent 调用形状，并通过 clean-break census；
- [ ] NBR-90：focused gates、最终 exact-SHA Cursor Cloud gates 和独立深审无开放 P0/P1。

详细权威为 [NBR-1 纵向闭环设计](superpowers/specs/2026-08-31-native-block-reconstruction-e2e-design.md)。
以上复选框只按真实代码与证据逐项更新；NBR-1 完成不等于完整 BNA-6/7、WRC-SR 或 WRC-1 完成。
NBR-30 已由 PR #89/#90 合入通用 Check/Package 与相对路径修复；NBR-40 已由 PR #92 合入
verified-Package BNA Harness，并在精确候选 SHA 上通过 99 项 focused test、Native build 及两项
Browser verifier。NBR-45、NBR-50 与 NBR-60 的生产集成检查点由
[PR #138](https://github.com/seedleap/agent-whitebox-world-sdk/pull/138) 合入
`origin/main@04dda773deaea94c1ba9521cb3c13898fbdf8327`；该精确 HEAD 的 Cloud 证据为
165/165 affected tests、typecheck、425-entry test census 与 BNA clean-break gate 全部 GO。该证据只关闭
上述三个 NBR 实施切片，不提前完成 NBR-20 的真实 formal generation、NBR-70/80/90、整体 NBR-1、完整
BNA-6/7、WRC-SR 或产品 Native Viewer。
NBR-65 与其内部纠偏 NBR-65J 由
[PR #187](https://github.com/seedleap/agent-whitebox-world-sdk/pull/187) 合入
`origin/main@8fb866e7eea807b1e624da65555ce38e47686065`；精确候选
`6ae7aba2385626dfc99bade0b5f5482fe72a2da3` 的 Cursor Cloud affected gates 为 120/120、
typecheck、42 行 v2 capability parity 与 diff check 全部 GO，独立 Opus 5 复核为开放 P0=0/P1=0。
本地真实 `mars-first-rain-native-0904/run-20260903173619-46331` 生成了 identity-bound Final
Package/Capture/launch，七个 Evaluation 维度全过，并验证接地、移动、跳跃/Reset、一条通过路线和
三面阻挡墙。该证据只关闭 NBR-65/NBR-65J；它不把临时 Case 当作已发布 Corpus，也不提前完成
NBR-20、NBR-70/80/90、整体 NBR-1、BNA-6/7、WRC-SR 或 WRC-1。
BWB-6 本身仍只按已经合入的优化评估标记完成；实际 Thin Instance/Chunk/Havok residency 已由
NBR-65 在当前生产 Owner 下落地，不能回写为 BWB-6 自己拥有 Runtime。PHO-7/8、通用
Action/Camera、空间事件、产品 Route/Nav、BNA-8
与 WRC-ACC-1 在本切片期间保持延期，不删除也不展开。

#### CAST 组件观察研究关联（非 WRC / NBR 关键路径）

- [ ] `CAST-R0`：在 NBR-1 收口后完成组件级 Reconstruction Observation 技术探针。`depends_on`：
  `NBR-70`、`NBR-80`、`NBR-90`；不 `blocks` NBR-1、BNA-6/7 或 WRC-1。独占 Owner 为参考图分析到
  Generation Request 之前的 authoring research boundary；不得修改 Runtime、Scene Source、Canonical
  Schema、WorldPackage、Gameplay Relationship、Havok 或 `checkSupport()`。稳定输入为冻结参考图、
  Scene Brief、Case/Profile 和现有 Capture；交付物为不可信组件观察候选合同、5--10 个真实 Case 的
  mask/相对深度/遮挡/关系证据、组件级修复对照结果和 GO/NO-GO 研究收据。验收必须证明首次生成或
  一次修复有跨 Case 收益，ambiguous relation fail closed，且每次修复仍产生新的 Candidate、Package、
  Receipt 与 Capture。执行模式：`sequential`；详细外部依据与拒绝项见
  [开源设计借鉴与验证台账的 CAST 条目](21-open-source-design-reference-ledger.md#41-cast--hyper3d-worldgen组件观察与关系约束)。

`CAST-R0` 是后续可检索的研究任务，不计入 WRC-1 的 33 个工作包，也不提高任何当前完成度。未完成
该探针前，不新增正式 Observation Graph Schema、第二 Planner/Builder Job、SDF Optimizer 或生产依赖。

#### WRC-QP 场景质量与性能后续队列（`QP-2..6` 在 WRC-1 后；`QP-1` 已前移）

对 `codex/block-world-main-integration` 的代码级复核确认，当前主线已经真实迁入受控方块 API、暴露
顶面/共享边可行走拓扑、`0.3m` 有界平滑、防坠 Collider Contribution、Thin Instance/Chunk、SDK-owned
Havok residency 和多接触修正。`paper-moon-palace-054` 真实 Case 随后证明原列于此处的
`WRC-QP-1` 会直接决定首次白膜效果和昂贵后置 repair 数量，不能继续按 WRC-1 后非阻断优化处理；
它已唯一重分类为下文 `BWMI-CF-19`。其余 `WRC-QP-2..6` 仍是 WRC-1 验收后的质量与规模增强。
详细 Owner、输入输出、门禁和禁止项由
[WRC-1 总设计 §14.2](superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md#142-scene-quality-and-performance-follow-up-disposition)
约束。

- `WRC-QP-1`（已重分类，不表示实现完成）：advisory 俯视/入口几何投影预检的唯一活动 Owner 为
  `BWMI-CF-19`，此处不再保留第二个排队工作项；
- [ ] `WRC-QP-2`：冻结 Runtime-owned neutral clear-day 白模显示合同，覆盖数值光照、材质分离、远近景
  可读性和 Capture/Preview 一致性；不得让 Native Module 自建灯光，参考光照仍只属于 styled 输出；
- [ ] `WRC-QP-3`：对 4/8/16/32m Chunk 和准确 batch bounds 视锥裁剪做真实 Browser frame-time、draw call、
  memory、Capture 与 Havok 峰值量测，再选择策略；不得直接恢复旧分支固定 32m 常量；
- [ ] `WRC-QP-4`：由 BNA-7 Capture Owner 增加 source-neutral semantic-front tri-view、逐面板空白/像素健康、
  有界重试和身份收据；不得从 Mesh 名称、tag 或 metadata 推断 Target；
- [ ] `WRC-QP-5`：在不改变 Runtime Owner、显式 Collider 身份、多 Subject union、滞回、先激活后释放和
  rollback 的前提下，以空间索引替换每 Tick 全量扫描，并提交规模基准；
- [ ] `WRC-QP-6`：在 WRC-CAM-2 后由现有 Camera Domain/Director 设计有限室内遮挡淡出；只能影响展示，
  不得削弱 SpringArm hard Decollider 或建立 Block 专用 Camera Owner。

`WRC-QP-2..6` 均 `depends_on: WRC-ACC-1`（另按总设计声明各自的细化依赖），不 `blocks` NBR-1、
BNA-6/7/8、WRC-ACC-1 或 WRC-1；`BWMI-CF-19` 则在 NBR-20/正式 Native 生产证据前完成。
这些任务都不计入 33 个工作包，也不提高任何当前完成度。WRC-1 当前关于
`NBR-65`“白模光照”的已完成声明只覆盖统一 Runtime 灯光基线和材质复用，不代表已经复刻旧分支的
具体冷暖色温、Fog、Exposure 或 Contrast 数值；这些调优必须由 `WRC-QP-2` 重新冻结和验证。

#### `codex/block-world-main-integration` 全生产链对齐与承接台账（非 WRC 计数）

2026-09-04 对以下两个精确引用完成了静态语义审计：

- current authority：`origin/main@20fe0fef60d8c73fd8c8ce2cecb541117cddd1f8`；
- historical branch：
  `origin/codex/block-world-main-integration@9e35ab53c634acaef8c53a33082fff77653f7bbb`；
- merge base：`7fa3197220ef6b8b1ad86f57fc85f8b3e248e0c3`；
- 完整逐阶段、逐参数、逐 Skill 和逐提交处置见
  [生产链对齐审查](reviews/2026-09-04-block-world-main-integration-production-chain-alignment-review.md)。

结论不能写成“除还原生成外全部合入”。当前 `main` 已用更严格的 Babylon Native current-only
合同语义替代白膜还原主链，但不是旧分支的字节或参数等价移植；旧分支白膜之后的独立 Visual
Reconstructor、六段 Playthrough、Episode 视觉重建、十风格与独立 Review、Gemini 事件、六段
Seedance、完整 Cloud Scene/Episode、S3/Studio 投影和 GPU Batch/tail/recovery 没有等价可执行 Owner。
现有 NBR parity ledger 中“preserve under downstream owner”只表示“不归 NBR-65”，不能作为这些
实现已经存在的证据。

以下能力已等价保留或由更强 current owner 取代，不再创建重复任务：

- Unified Planner → Babylon Native Block Builder 两个正式模型任务，`gpt-5.6-sol/xhigh`，具名
  `world-plan.png`/`entry-whitebox-target.png`，同任务最多三次自修复和 Host 单次 replay；
- current-only `scene.ts`、`native-block-authoring.json`、`native-resources.json` 三输出，原子
  `createBlock()`、确定性 `createBlockGrid()`、五种固定形状、显式 visual/Collider/Surface Group；
- Native Check、Capsule-aware Ground Analysis、WorldPackage/Receipt、Opening/side/top/Collider
  Capture、七维 Evaluation、严格模式最多三次外部诊断修复与原子发布；
- exposed-top/shared-edge topology、`0.25m` 可见踏步、当前 `0.3m` step/`42°` slope 验证、
  ground-only edge protection、Thin Instance/Chunk、SDK-owned Havok residency 和有界多接触修正；
- 当前 Native Builder Skill、output contract、checker 与代表性 `cloud-temple-t-gate-native-block`
  冻结副本逐字节一致；生成 Request 实际冻结并哈希这些输入。

以下旧方言已明确拒绝，后续不得以“补齐 parity”为名恢复：

- Three.js Block Source、Block Manifest/Compiler、hidden runtime foundation、create-then-position
  方言、第二 Scene Source parser、compat alias 或旧新双入口；
- 由 preset、颜色、Mesh/tag/name/metadata 推导 Physics、Support、Collider 或 Gameplay；
- Native Module 自建 Subject、Camera、Engine、Scene、render loop、Physics、Input、Timer、Tick 或
  Gameplay Entity；
- 固定 `1m` 自动 smoothing、独立 step-up/step-down、全局 `2m`
  adjacent-height veto、raw smoothed-edge count；
- 旧部署镜像 digest、服务绑定、租户补丁、Provider 私有字段和旧 Kubernetes 常量直接进入公共合同。

旧链完整世界与四倍 reference-visible coverage 的用户语义不属于上述架构豁免，仍由
CF-11/21 在当前 Owner 承接；不得用无探索内容的空 padding 冒充覆盖。

##### 可独立推进的工程承接项

**2026-09-05 合并后当前检查点（取代下文历史“未合并 / 21 项”总数，不改写历史证据）：**

- **2026-09-06 单线程续接补充**：下方 CF-03 条件复现/生产修复未完成、CF-06/07 未集成及
  CF-16 旧入口未实现的历史描述，由本节末尾新增集成检查点取代。三位原 worker 已交付，
  用户最新要求不使用子智能体，本轮未启动或补位任何 worker；仍未合入 main。
- PR #202 已按用户明确授权以管理员方式合并，main 为 `f35a56b2`；合并时 CI 与必需批准
  未完成，不记作通过。用户明确 CI 后续自行处理，不能将这次绕过授权推广为后续默认策略。
- 最近已通过的真实 Case `paper-moon-054-cf19-feedback-0905` 普通生产 passed/published、cleanup
  completed；Evaluation/strict diagnostic failed 事实保留。真实证据属于生产实现 `e271a35c`，
  后续测试清单/文档提交不冒充新完整 Case。不得据合并或普通生产成功关闭全部 CF。
- 任务分支 `c52f12b8` 的 CF-14 实现与专项真实像素/消费验收已完成，详见下方收尾证据，
  尚未合入 main。仍有实质实现或条件复现工作：CF-03/04/05/06/07/11/12/13/15/16/17/20/21，
  共 13 个父任务；不包含下述已有实现但待专项/实云/模型效果验收的项目。
  CF-01 栈安全搜索与 CF-29 Builder 进度可见性补充已实现并进入隔离集成候选，尚不能冒充
  已合入 main 或完整验收。CF-03 为条件复现；CF-11/20/21 已有多个代码切片，未关闭父任务。
  CF-15 的旧 gate 表述须服从后续普通成功标准，不得把新增质量诊断直接升级为普通阻断。
- CF-02/08/09/10/18/19/22/23/24/25/26/27/28/30/31/32 已有实现或明确切片；其中真实媒体、
  WebP、严格 Corpus、CF-19/24 效果对照、CF-26B 实云与 CF-31C 故障矩阵仍按各任务分别验收。
  CF-02/26B/31C/24/27 不再按早期表述当作完全未实现。不得累加重复 focused 数字或用单 Case
  证明旧等价失败率。下方任务合同和逐次证据继续保留，旧候选状态必须结合此检查点阅读。
- 后续优先级按用户确认：CF-12 开场主体/Camera → CF-11/21 完整地理与要素 → CF-20 完整
  预算合同 → CF-14 量测一致性 → CF-16 最终视觉；其余 CF 仍属完整目标，不以有界切片代替完成。
  main-agent-only；复用原 `block-world-effect-alignment` 目录，在最新 main 建立
  `codex/cf-production-effect-closure`，不增加重复 worktree。
- CF-04/12 当前实现切片（2026-09-05）：已复现并修复 Runtime Director 忽略 Bootstrap
  四项开场调参的问题。非默认输入 `5.5m / 1.1m / 0.12rad / 56°` 原先被 Profile 的
  `5m / 1.25m / 0.22rad / 58°` 覆盖；现在按冻结旧链 `9e35ab53` 的
  Profile → authored opening → Context Modifiers → explicit Preview 顺序消费。
  首次选中的第三人称 Profile 绑定纳入 transaction/公开 view Snapshot，Reset 清除、失败回滚，
  不新增质量门禁。Camera/Session protocol focused 44/44、typecheck、3C migration 通过；
  后补首帧 query 失败及构造 Profile hint 不同的两项针对性回归通过，Snapshot 发布边界
  5/5 通过，最终 typecheck/diff check 通过（重复用例不累计）。尚未完成 Host 目标驱动
  参数选择、socket/真实像素对齐、多模式 Subject 与完整 CF-04/12，不冒充新的真实 Case 证据。
- CF-12/R1 下一批接线已在既有生产效果实施计划的 `CF-12/R1-A–E` 锁定：恢复旧链
  Builder 同任务看图调四参的能力，而不是用一次 Host 图片估算替代。拟由现有 sidecar
  承载纯数据意图、现有 Host 编译元数据/Package 绑定最终取值，原 Request/Bootstrap/WRT
  输入与哈希不变；不得覆盖冻结文件、补造 Generation Receipt 或增加模型任务。
  初始 `77b6ba17` 仅复用/导出现有 exact Camera parser（12/12 focused 通过，Schema/取值范围
  不变）；下述接线更新替代当时“尚未激活”的状态。此记录不是 CF-12 完成或效果验收。
- CF-12/R1 接线更新（2026-09-05）：required `native-block-authoring.json.openingCamera`
  已贯穿 exact parser、authoring/layout binding、Host/Profile 准入、materializer metadata、
  Package root、Runtime、Formal opening expected Camera 和 Ground FOV。Bootstrap/WRT 原始
  输入及 Hash 不变，不能以生成意图覆盖冻结输入。Builder 的同一个 portable checker、软件
  renderer、真实任务指令及 live/frozen Skill 均消费该字段；仍为同任务、五个输出、共用原修复
  预算。沿用旧 `9e35ab53` 全部可选第三人称 Profile 的安全取值准入，不新增质量 veto。
  非法 Camera 意图经 Package/Run 保留 `native-block-opening-camera-invalid` 原因。
  验证：authoring manifest + Native Package 63/63（约 603 秒）；完整 Builder Skill 57/57；
  Bootstrap/manifest/Package identity 58/58；真实 Babylon/Havok 非默认 Camera 消费 1/1；
  后补仅改 Camera 的 PNG 回归 1/1（entry 改变、top 与冻结 Bootstrap 不变）；Capture 发布、
  普通成功政策和 Native 反馈原因针对性回归 31/31。各轮有重复用例，不累计成总数。
  本批未跑新的 054 模型 Case，旧 Case 仍只证明旧实现；CF-12/04 父任务保持 open。
  尚须处理软件预览的数值 target height 与 Runtime 优先 Camera Socket 的实际目标点差异，
  并补实际构图证据；当前 resolved parameters 正确不等于 target/pixels 已一致。多 movement
  mode/Subject 选择和完整 CF-04 render/interpolation 验收仍按原合同推进。
  旧代码复核：`9e35ab53` 的 Block Builder `render-visual-review.mjs:14222` 同样用
  `spawn + targetHeightMeters`，旧 `camera-director.ts:1056` 同样优先 preferred Socket；
  这是共享的旧差异，不是本次迁移漏掉的新行为。保留 CF-04 完整像素一致性工作，不把修复
  该旧差异升级为下一次普通 Case 的额外前置，也不擅自改变 Runtime Socket 权威。
- CF-04/12 首次绑定坐标修复（同批）：实际 Babylon/Havok pose 断言发现 Golden Character
  initial/rebind Camera 路径直接使用 body-center Snapshot，正常 fixed transaction 已转换为
  Subject origin。无 Socket 的非默认测试中 target 相对角色原点为 `2.06m`，不是意图 `1.1m`；
  旧 `9e35ab53` Runtime 使用 `controller.subjectOrigin`。现 initial/rebind 复用现有
  `cameraContextWithLockedLocalSocketsV1`，删除该路径重复的 Socket 投影，保证恰好转换一次。
  最终实际 Runtime 回归 1/1：首个 committed Tick 高度正确，Reset/rebind 后同 Tick Camera
  完全一致；Director 的有/无 Socket 参数、modifier/Preview、失败回滚与 Reset 针对性 2/2，
  其余本批匹配的 Camera Reset 回归通过。未提交 possession 不提供 pose telemetry，不能以
  该时点的物理 Camera 残留值冒充 committed opening 证据。最终 Skill 57/57、3C migration
  和 typecheck 通过；没有跑全仓 gate 或独立审查，不关闭完整 CF-04/12。
- CF-11/R2 局部到达证据更新（2026-09-05）：RED 已复现跨区大 ground group 的 AABB
  让 Spawn 被记作远端 reached。现在以 current-only `reach-position` 替换 `reach-bounds`，
  必须声明冻结 `standPositionMetersXYZ`；既有 Capsule 半径与 tolerance 决定局部容差，
  不再从整组 AABB 生成到达区域。Host 保留局部端点及原 visual-group 身份 join；Formal
  Capture 与显式 NBR verifier 继续调用同一个量测函数。Plane 检查不变，没有 alias、
  缺字段 fallback、新付费任务或普通生产质量 veto。baseline Ground/Capture 从同一站立点
  定义绑定 endpoint；固定 `128m` 世界与 `12m` 路线尚未删除，不据此关闭完整 CF-11/21。
  committed strict Case 的可复用输入已更新 spawn/upper-platform 端点及 Intent Hash；
  `runs/g-20260904` 的历史输入、收据和截图均不修改，也不冒充新合同通过证据。
  已通过：Capture 合同/量测/身份/Request/发布/Evaluation/isolated runtime 7 文件 152/152；
  Case preparation + metadata binding 21/21；严格 verifier 的合成完整 Run/repair/Final/混合
  blocker 回归 4/4（非真实 Browser E2E）；typecheck。端点变化改变 Hash、错误高度/远离端点
  拒绝、扩大组不改变端点、容差边界不过严均有回归。生成的三套 portable checker 与 Native
  冻结副本已同源刷新，renderer 重建字节未变；Native Builder Skill 最终 gate 57/57。
- CF-11/R3 探索意图接线（2026-09-05，承接 R2，当前候选）：对照旧 `9e35ab53` Builder
  Skill 的 middle/remote anchors 与 spawn-to-middle band，普通生成 Case 的 Ground policy
  改为显式 `source-authored`，不再预置阻断性的 12m 直线 Ground waypoints。既有严格 Case
  使用 `case-defined`，保留原固定路线及其一对一验收绑定；缺少 mode 没有旧路径 fallback。
  required `native-block-authoring.json.groundExploration` 通过共享 parser/准入、authoring/layout
  binding、materializer metadata 和 Package root，最终进入原 Ground analyzer。源意图只能声明
  真实 middle/remote 站立锚点及有真实宽度的路点带；至少一条从精确 Spawn 到 middle。
  Host 不反写 Case、Request、Bootstrap，不推断 Mesh Collider，不新建 Route/Nav 或模型任务。
  多个锚点/路线可以诊断同一个 Case 地面义务，以局部 ID 区分，不制造新的 visual target；
  重复锚点位置/ID 仍拒绝，固定 Case 的 band/ref 约束不删除。不增加距离、面积、chunk
  数值门槛，不改变 `productionOutcome` / strict diagnostic 分离或共享修复预算。
  真实调用的任务指令、live/frozen Skill、便携自检及当前严格 fixture 同步；自检提前暴露
  缺失远端/错误模式/缺失 Spawn→middle 等声明问题，实际支持和连通性仍由 Host Ground 检查。
  Package→Ground 合成集成已证明：弯折地面、两个同义务路带可通过；无支撑远端与有支撑但
  断开的远端孤岛均失败，并保留 `remote-garden` 诊断位置。原 Case/Generation Request bytes
  不变；已有固定 Case Package 仍通过。新增元数据/manifest 身份、源策略 parser、Case preparation、
  Ground、Capture/Generation/visual identity/Evaluation 的 focused 回归已运行；Native Skill
  最终 58/58、普通生产/Native 反馈原因 35/35 和 typecheck 通过（分轮有重复，不累计总数）。
  收尾验证：最终弯路/无支撑/孤岛/Package 身份集成 1/1（约 93 秒）；固定 Case Package
  回归另通过。manifest 源意图绑定/过期 Hash、严格 synthetic Run 的 immutable Attempt/Final、
  skipped playability 与普通成功但严格诊断失败的发布共 6/6，均 exit 0；不是实际 Browser 回放。
  未运行新的 054 模型 Case、Browser 全链、全仓 gates 或独立最终审查。本批不是 CF-11/21 完成：
  固定 128m bounds、两个 generic ground groups 和 generic strict Capture topology/300-tick/12m
  模板仍待删除/替换，后者不得继续约束 source-authored Builder 的实际地理。显式 NBR verifier
  仍要求固定 Capture/Ground endpoint 对拍，尚不能把 source-authored 的新探索意图算作已完成
  严格路线验收；该消费者迁移继续由 CF-11/13 承接。真实要素/分区量测、跨模式与效果证据仍 open。
- CF-11/R4 实际世界范围（2026-09-05，当前工作树）：普通 Case preparation 已删除固定
  `128m` bounds，冻结 `world-bounds-policy.json` 的 `checked-block-layout` 策略；显式固定
  输入使用 `fixed + worldBounds`，与 Ground mode 独立。唯一 Host parser/hash/resolver 位于
  `scripts/native-scene/world-bounds-policy.ts`，在原两次 Native replay 一致后，从所有 checked
  Blocks 的真实 min/max 计算 Package 范围，包含无 visual group、无 Collider 的侧后远景。
  旧 `9e35ab53` 数值逐项保留：XZ 中心为实际中点，水平为 `max(16m, span + 9m)`，Y 为
  `[minY - 65m, maxY + 16m]`；只保留容器余量，不生成旧 hidden foundation、空地或额外 Collider。
  原始 Request/Host closure/repair/journal/resume 改为绑定 `worldBoundsPolicyHash`，不是最终
  Package bounds hash；原策略字节不回写，最终 manifest/root 绑定实际范围。Ground/Capture/Runtime
  仍消费 verified Package，不新增成功门禁、模型任务或修复预算。当前 reusable fixture、发布
  input allowlist、live/frozen Builder Skill、设计与实施合同已同步；历史 Run/最新真实 Case 未改。
  已验证 x=200m 的无分组无碰撞背景 Block 进入真实 Native Package 范围、Ground 通过，原策略
  和 Generation Request 字节保持不变；公式/平移/小场景/非法输入回归通过。最终直接消费者
  六文件 150/150 通过（含 Run、Generation、journal、repair、Capture、policy）；Native Skill
  58/58，generic Native 固定/越界/无 Block evidence 三项通过，真实 Native Package 固定/动态
  两项通过。Capture side/top 同时拒绝旧固定范围的专项回归 1/1，最终 typecheck exit 0；
  分轮重复测试不累加为 aggregate。当前严格样例 Intent 多余末尾换行已按 canonical bytes
  规范化，语义与已记录 Hash 不变，未修改任何历史运行。CF-11/21 父任务仍 open：generic Capture topology/300-tick/12m
  模板、两个 generic ground groups、完整要素量测和严格路线消费者尚未闭合；没有新 054 效果证据。
- CF-11/R5 删除虚构 Capture 路线（2026-09-05，`ff649597` 后候选）：对照冻结旧
  `9e35ab53` Builder Skill 86–108 行，实际 middle/remote anchors 与 honest-width bands
  来自生成世界，不要求任意场景变成 12m 直线。普通 baseline producer 已删除
  `entry-to-remote-ground-pass`、300 Tick forward、`[0,0,-12]` checkpoint 和 synthetic
  connects-to；R3 的真实 Spawn/支撑/单一连通分量/探索锚点与通行带检查仍保留。
  必需数组表示精确请求集合，允许显式 `[]`，不允许缺字段、补造一 Tick 或兼容 fallback：
  Case → Intent → verified Package semantic binding → Request → traversal observation
  全部对齐；非空集合仍要求完整 input/criterion、独立 reset、Tick 与身份闭包。
  Provider 对空集合不执行路线 reset/input，观察值绑定原 Capture ready Snapshot；Opening、
  top、side、Collider overlay、Spawn、所有 immutable observations/Receipt 仍按原流程产生。
  Evaluation 将未声明的 critical traversal 记为 `incomplete`，不是空集合自动通过；普通
  production 仍可完成发布，显式 strict verifier 用 `NBR70_SCRIPTED_TRAVERSAL_REQUIRED`
  拒绝无脚本路线验收，不增加普通生产门禁、模型任务、repair cycle 或终局 Browser replay。
  `automated-contract`：9 个受影响测试文件 238/238，覆盖生产准备、共享合同、Package
  binding、provider 路线生命周期、Evidence/Evaluation、严格 verifier 与 Final 发布；
  追加验证发布后的 strict diagnostic 保留 incomplete，1/1；普通 Run 不完整严格评分仍
  production passed、单次 verify/publish、单 Attempt 回归 1/1；typecheck exit 0。
  Native Skill 全套 58/58（快照重建前）；live/frozen Skill、输出合同已同步，Native 自检
  内嵌 SDK 图已从当前源码重建，Planner/Canonical 生成副本 byte-identical 未改。
  重建后按失效输入补跑 source-authored、live/frozen drift、三输出、自修复类型错误和
  relocated standalone 五项 5/5；`pnpm --filter @whitebox-world/playground build` exit 0，
  仅有 chunk-size warning。分轮重复项不累加为 aggregate；未跑全仓 gates 或独立最终审查。
  上述首轮只运行 provider 的空路线 observation 路径并接 synthetic Receipt/Evaluation/Final；
  完整 Browser 验证已于下述收尾补齐，仍不是新的 054 模型效果证据。
  R5 Browser 收尾（`d383cbdd`，2026-09-05）：新增显式命令
  `pnpm verify:native-no-script-capture`，exit 0。复用原 Package-owner 夹具，生成/Planner
  回执为测试桩，无模型调用；Native Check/Ground/Package、Babylon 9.23.0 + Havok/ThinEngine、
  HeadlessChrome 151.0.7922.34 正式 Capture/Receipt/Evaluation 均为实际执行。
  Package root 为 `sha256:5d5e9a67548bad4a92efbe7138b1d11bc579f6d152ff051c644fac971649e0f0`；
  Case/Generation Request 原字节不变，四张 PNG 均 1280×720，traversal checks 为 0，观察值
  精确绑定 Capture ready Snapshot；Browser/Vite cleanup 均 completed。Spawn support 和
  deterministic-build passed；critical traversal 与整体 Evaluation 为 incomplete，其余质量
  诊断未反转 production Capture publication。这个夹具不用于证明云殿或 054 的相似度。
  证据暂存 `/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-cM6Xsq/`，
  包含四图、正式 Capture 收据/observations、Evaluation 与 evidence.json；生成夹具工作目录已清理，
  保留的最新 054 Case 未改。实际打开四图复核：Opening 有 SDK Subject 与地面，top 有完整
  测试地面和两块远端方块，overlay 有碰撞覆盖；side 地面仅占很小画幅。后者由当前 side Camera
  使用含容器 Y 余量的 Package bounds（Y -66..16、targetY=-25）可定位，属于 CF-14/24 的
  多视角取景/有效量测缺口，不把它升级为普通生产失败，也不删 R4 的旧等价容器余量。
  共享夹具抽取后，原实际范围 Package 回归 1/1、新无脚本冻结输入回归 1/1、typecheck exit 0。
  本次已补齐 R5 空脚本的实际 Capture 生命周期证据；CF-11/21 父任务仍 open：两个 generic
  ground groups、完整要素/分区量测、严格 authored route 编译及真实参考效果尚未闭合。
- CF-11/R6 删除模板地面视觉身份（2026-09-05，`824917c9` 后候选）：普通 Case preparation
  已删除 `entry-ground-group`、`remote-ground-group` 和必需的第二个远端地面 Collider，
  不再为这些虚构目标生成阈值。保留唯一 ground 验收义务、真实 Spawn 支撑 Collider、
  source-authored middle/remote anchors、真实宽度通行带和单连通组件检查；不跳过 Ground。
  只有实际非 Subject 身份地标进入语义目标。无地标输入以显式空集合贯穿 Case/Profile/
  Intent/metadata/live registry；Host 身份检查和 Capture 保留非空目标的精确一一绑定、
  缺组/额外组拒绝。空语义/拓扑期望记 incomplete，不假报严格成功，不反转普通发布。
  Builder Skill、输出合同、示例与冻结副本同步移除地面视觉分组暗示；普通方块仍保持
  显式 Collider 选择，不反扫 Mesh。没有新增模型任务、修复轮次或生产质量门禁。
  已有 12 个直接相关文件 316/316 通过；随后新增 Host 空集合正负向回归 3/3 通过、
  typecheck exit 0（测试集合重叠，不相加）。无脚本夹具有/无语义目标冻结输入回归 2/2
  通过；Native Skill 全文件检查中 58/59 通过（包含新 portable Builder 空组实源码
  回归与生成副本 drift），唯一旧文案断言更新为当前显式身份合同后定向 1/1 通过。
  live/frozen Skill、输出合同、checker 三组逐字节比较通过，diff check 通过。
  实际无组 Browser 收尾（`b315ae241c95606d6c903d1e357c86cb3ea3b102`）：
  `pnpm verify:native-no-script-capture --without-semantic-targets` exit 0。
  Planner/generation 为测试桩，无模型调用；真实 Native Check/Ground/Package 和 Babylon/Havok
  Capture 完成，metadata/Intent/live observation 语义目标为空但真实 Blocks 保留，SDK Subject
  opening coverage 为 684 basis points。四图均 1280×720，Browser/Vite cleanup completed，
  Case/Generation Request 原字节未改。Package root
  `sha256:c3db1a89b988b7754c0bdf25c5224926fedc041009c6efc14471a94f0b449e0d`。
  spawn-support、deterministic-build、opening-composition passed；semantic-silhouette/topology/
  critical-traversal incomplete，夹具 collider 诊断 failed，整体 Evaluation incomplete；
  这些诊断不反转普通 Capture publication。已实际打开 opening/top/side/overlay：真实地面、
  SDK Subject、未分组方块和显式碰撞均有画面；side 的容器余量取景问题仍由 CF-14/24 承接，
  不是本批效果通过声明。证据目录
  `/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-aTeROn/`
  保留四图/正式收据/Evaluation/evidence.json，临时生成 workspace 已清理，最新 054 未改。
  R6 模板删除与空集合实际 Capture 闭环已完成；未启动新 054 模型 Case、全仓 gates
  或独立最终审查。完整要素/分区覆盖、严格 authored route
  验收及真实参考效果继续由 CF-11/13/21 承接，父任务不关闭。
- CF-14/24/R1 全世界检查取景（2026-09-05，`ab25cc23` 后候选）：R5/R6 的实际 side 图
  已复现大量 Package 空白 Y 余量导致场景缩小且偏上。新增 RED 在 Request 中得到
  targetY=7.5，而实际 Block union 中心为 0.5。生成与 admission 两个重复的容器范围推导
  已删除，统一消费 Host `formal-capture-bounds.ts` 的全部 checked metadata Block 范围，
  包含无 visual/collider group 的远端景物，使用已旋转的有效尺寸，不反扫 Mesh。
  现有最小取景 span [8,4,8]m 仍由 Runtime contract 唯一声明，围绕实际内容中心扩展；
  Package/Runtime world bounds、opening Camera、四图数量、repair 和成功标准均未改变。
  冻结旧 `9e35ab53` artifact-capture.ts:315-340 同样从实际可渲染目标范围构图；
  此处适配为 Native verified metadata，不能声称已复刻旧 per-object 三视图或像素评分。
  Request/contract 两文件 78/78 通过，Capture fixture 迁移后 15/15 通过；
  非对称无组方块测试按 exactOptionalPropertyTypes 修正后定向 1/1、typecheck exit 0。
  Native checker 临时重建后仅 Native 副本改变，Planner/Canonical 字节不变；
  受影响 Skill 定向 6/6 通过（其余 53 项未重复），live/frozen checker 字节比较通过。
  冻结 `51f10039160d1767b4fd8fab67b8582c2a67ad85` 后
  `pnpm verify:native-no-script-capture --without-semantic-targets` exit 0；
  真实 Check/Ground/Package、Babylon/Havok Capture 与 Browser/Vite cleanup 全部完成，
  四图均 1280×720，无模型调用。Package root
  `sha256:58b5badc090b42199e8c2507ed42a1dd27761ba72a3b034d3c0cf94358dcde2f`。
  实际 side/top Request 范围为 [-4.5,-2.5,0.5]..[4.5,1.5,18.5]，
  target=[0,-0.5,9.5]，不再取容器 Y=-66..16 的中点 -25。
  已打开实际 side/top 图确认地面与人物恢复可读、远端无组方块进入俯视。
  与 R6 `b315ae24` 同一夹具对比，opening PNG 和 collider-overlay PNG 的 SHA256
  完全一致；仅 side/top 取景变化。Evaluation 状态也一致：opening/spawn/deterministic
  passed，语义/拓扑/遍历 incomplete，夹具 collider failed；没有增加普通生产否决。
  证据目录
  `/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-J9m8xU/`。
  本批 scoped D2-D6 复核覆盖 Request→Package join→actual render，删除重复范围推导，
  Runtime 动作/输入/物理状态未改；不是独立最终审查。CF-14/24/R1 取景修复已闭环，
  未跑新模型 Case或全仓 gates；CF-14 visible pixels、CF-21 全要素覆盖仍 open。
- CF-11/21 下一次真实效果检查准备（2026-09-05）：核对 preparation→generation，完整 Brief
  仍以原始 bytes/Hash 交付，不能把“目前仅少量语义目标有量测”误报为 Brief 输入被截断。
  Host task-instruction 残留的 generic entry/remote checks 模板措辞已同步 R3/R6：
  从实际地理写探索 anchors/bands，不发明地面视觉组、第二地面 Collider 或直线路线。
  Case preparation 全文件 10/10、diff check 通过；这只改文字指令，未重跑全仓 gates。
  新本地 Case ID `paper-moon-054-cf11-geography-0905` 已确认未使用，沿用上一真实 Case
  的用户 prompt 和原始 054 图片，SHA256
  `080d951445bae3a8584363f0be5ef9194b5eff88e7b64da40d2a81f6a923972e`。
  使用当前已量测的 8,000 Block 上限、同任务四参 Camera 调整、实际世界/探索意图和
  完整世界 inspection Capture；本地 Codex 登录及 LWDP 文件存在/0600 已检查，
  不记录凭据内容。准备冻结后从 Planner 开始普通生产，不重启末尾严格 replay。
  本次结果见下文；CF-21 的全要素/分区合同及实际还原效果仍未验收，旧 054 保留作对照。
- 上述新 054 已在冻结代码 `65d3c2bb` 启动本地普通生产：Planner task
  `planner-20260905-132647-24590` 已交付 Brief、entry、world-plan 和自检报告，
  Host 进入 `plan-ready`；Run `run-20260905133525-24571` 已创建 Attempt 0
  `generation-dispatch.json`。现已终止：Builder child exit 0，但 generation receipt
  `outcome: rejected` / `output-missing`；三份 Native Source 存在，两张必需 advisory
  comparison PNG 缺失，未进入 Native Check、正式 Capture 或 Evaluation。
  `attempts/0/generation-failure/report.json` 保留了源文件与最终反馈；Builder 自述
  self-check 通过、renderer 仍报 `palace-wing-roof-4349` 与 `palace-lower-hall-2989`
  occupancy overlap，三轮修复已用完。冻结副本在独占临时目录重放已核实：self-check
  exit 0、无类型/结构诊断，renderer exit 2，冲突 cell `-21,32,-133`。保留 source
  的 lower-hall `full` 中心 `[-10,8.5,-66]` 与 wing-roof `half` 中心 `[-10,8.25,-66]`
  真实重叠；不是门禁误判。旧 `9e35ab53` self-check compile 会集中收集 overlap，
  current renderer 首错退出，因此反馈不完整属于已有 CF-19；三轮具体修改过程未留全证据。
  不把 child exit 0 或 Planner 成功当作生产成功，不直接增加修复预算或重跑付费 Case。
  旧 Case 继续保留作对照；本次执行输入不含隔离候选的 CF-14 身份图改动。
- 用户授权并发实现（2026-09-05）：隔离 worktree `cf01-stack-safe` 与
  `cf29-progress-visibility` 均从 `65d3c2bb` 开始；main 保留 Case、跨域合同和集成所有权。
  CF-01 子任务提交 `957755bd`，以迭代候选游标栈替换递归 DFS；forks 模式
  10k/30k entities RED→GREEN，solver 6 文件 83/83，11 个旧实现 report Hash 保持一致。
  CF-29 进度子任务提交 `891d3232`，增加绑定 requestId 的 Host 启动/15 秒心跳/终止诊断，
  仅含耗时、输出字节和活动间隔，不透传 child 文本、不改变 outcome/reconcile/重试；
  port 与 generation-runner 32/32。两项定向严格 typecheck、diff check 均通过。
  main 已复核两项代码及测试 diff；当前只接受为待集成提交，未进入主任务分支，
  不提前关闭 CF。待本次 Case 释放冻结执行输入后集成并进行受影响的验证；
  不为了进度诊断重启本次 Case，也没有运行全仓 gates。
- CF-01/29 合并候选验证（2026-09-05）：main 为避免等待 Case，使用独立
  `cf-integration-candidate` worktree，基于 `0811ccf7` 接纳上述两项为
  `6a2eb0fc`、`c3f66bfd`。合并后 `pnpm typecheck` exit 0、diff check exit 0，
  tracked tree 干净；只含两项的四个代码/测试文件，不含 Case 产物或依赖变化。
  既有 83/83 与 32/32 focused 证据输入未变，直接复用，不重复整套测试。
  这是隔离集成候选，不是正在执行的 `65d3c2bb` Case 或 `main` 的新证据；
  待候选集成验证后再同步回主任务分支。该次检查时 Builder PID 27107 存活，
  约 5 分钟；现已终止，结果见上文。已打开 Planner entry/world-plan，看到侧支路、回折桥阶、
  远端宫殿与围合山体，但这些是规划输入，尚未证明 Builder 的完整世界实现。
- CF-14/R2-A 在上述隔离集成候选落代码：提取唯一 identity-mask pixel projection，
  Case reference 消费者删除原 inline 算法；保持原像素边界、四舍五入、缺失/弱 mask
  策略与 Case 数值不变。新增同 bounds 实心/拱门、分离实例的负空间、缺失 mask、
  非方形边界与 tiny-mask 回归，projection + Case preparation 20/20、typecheck exit 0。
  首次测试因尚无实现模块 RED；不是已经复现并修好了 Formal 像素问题的证据。
  当前 Formal whitebox 材质仍带光照，不能直接按精确身份色解析其显示 PNG。
  实际 per-view identity mask 与 Capture Hash 绑定、Evaluation 删除 AABB 面积消费
  仍是 CF-14 后续工作；本步不新增生产门禁、不关闭 CF-14/21、不改运行中的 Case。
- CF-14/R2-B 内部 Capture 原语已在 `cf-integration-candidate` 实现：现有 display
  capture 之后、同一 Camera transaction 内可请求独立身份 PNG/RGBA；显式 Mesh handles
  赋身份色，未标记几何为黑色且保留遮挡，共享材质不串色。临时 unlit/opaque 材质
  禁用 fog/image processing/postprocess，结束或异常时恢复原材质、相机、canvas 状态。
  对照安装 Babylon 9.23 `Scene.render(false,true)`，身份 pass 不额外推进相机输入/动画。
  opening/side/top、共享材质、thin-instance transforms、非法/foreign/disposed handle、
  throwing-render cleanup 共 8 项新回归，连同原 artifact capture 为 14/14；
  typecheck exit 0、`verify:3c-migration` exit 0（11 ledger entries / 10 authority invariants）。
  原实现 opening 无身份结果与异常注入不生效形成 RED；初次 side/top 夹具 bounds 字段
  写错已纠正，不把夹具错误计作产品缺陷。证据为 NullEngine/契约，不是真实 GPU 像素。
  正式 provider 的 live-registry 接入、三视图身份图/Receipt Hash 闭包和 Evaluation
  像素消费尚待，原语未启用到上述 054，CF-14 继续 open。
- CF-14/R2-C 正式消费接入已提交到隔离候选 `21711f39`：三视图身份 PNG 与 Receipt/semantic
  observation 绑定，Host 按真实像素量测，发布、Studio、Evaluation 和严格 verifier 消费者同步。
  直接 Capture/发布/Studio/量测/契约回归及 typecheck 已通过；各轮重复覆盖不累计为 aggregate。
  `pnpm verify:native-no-script-capture` 已完成一次实际 Babylon/Havok Browser Capture，
  Package root 为 `sha256:1a82304d908587029701d09acdc40a86147f38775f0e65e54c12e77be38d7326`，
  Browser/Vite cleanup 均 completed。该命令使用合成生成输入，不是新的模型 Case。
  人工检查发现其初版断言过弱：仅要求每个目标在任一视图出现，未发现地面顶面身份图为黑色。
  根因是实际可见的 walkable overlay 未绑定身份色，原 Block 的侧面像素掩盖了遗漏。
  因此此次 Browser exit 0 不作为 CF-14 完成证据，父任务继续 open。
- CF-14/R2-D 修复已提交到集成候选 `d9038d17`：既有 topology owner 按显式
  Block/group 身份分区 overlay 三角形，保持碰撞数组和完整面 normals；worker 提交
  `23be0f13` 的 17 项 focused 回归通过。主进程已接入 settlement 与 Capture 消费者，
  支持同一 Collider 的多个语义组和未分组黑色部分，不从 Mesh/name/tag 推断身份。
  settlement/Ground/provider 三文件 32/32（含 mixed/ungrouped/buried）、真实 Package 发布
  1/1、语义修复 operation/契约 66 项、typecheck、3C migration 和 Skill 66/66 已通过。
  初次合并运行四文件的 threads 模式约 5 分钟无结果，已停止（exit 143），不记通过；
  拆分为单 forks 后直接三文件 3.92 秒、Package 39.73 秒完成，未更改仓库默认测试配置。
  补强顶面断言后的实际 Browser Capture passed，Package root 为
  `sha256:232fd28f3efabfa3502f3328e078cdb2e384b87b9aefcd10b6f9300aff1b1652`，
  Browser/Vite cleanup 均 completed；opening/side/top/Collider 四张显示 PNG Hash 与修复前
  完全一致，五个顶面身份均 visible，已人工看图。像素偏差要求比较参考/display/identity 后
  调整几何，不从 aggregate 面积或中心偏差武断推导移动/放大。
- CF-14/R2-E 看图后继续发现并复现默认 framebuffer MSAA 串色：相邻地面身份色
  `#AA0001` 与 `#AA0005` 的边缘平均为门体合法色 `#AA0003`，opening 中有 83 个门体
  像素落在实际门体之外。因此 R2-D 的顶面通过不证明全部像素量测正确。
  主进程用 Babylon 9.23 既有 single-sample RenderTarget 接入同 Camera 身份 attachment，
  不改显示抗锯齿、不新增 npm 依赖或身份色准入门槛。三个 view 的 RED 已复现；
  加入上下行读回、前置 output target 恢复、读回缺失/截断和异常资源清理后 17/17 passed，
  已提交 `161a0ec5`，最终 typecheck、3C migration 和新 Browser 防串色断言通过。
  实际 opening 门体外的错误身份像素由 83 降为 0；四张显示 PNG Hash 与 R2-D 一致，
  WorldPackage root 未变，Browser/Vite cleanup 均 completed。修复前后证据目录分别是系统
  临时目录中的 `worldkit-no-script-capture-evidence-m0KP3r` 与
  `worldkit-no-script-capture-evidence-ocUzi0`，含 identity/display PNG、正式收据和 Evaluation。
  CF-14 的实心/空洞、遮挡、分离实例、side/top 差异对抗集仍待，父任务继续 open。
  用户再次授权并发：`CF-14/R2-E-FIXTURES` worker 在隔离目录补纯几何对抗夹具，
  `CF-21/NEXT-COVERAGE-AUDIT` worker 只读核查真实旧行为差异和下一批消费者合同；
  主进程独占 Runtime、Browser、跨域合同、最终集成。完整任务图见既有生产效果实施计划。
- 2026-09-05 本批集成检查点：主会话分支 `codex/cf-production-effect-closure` 已在
  `9c44fd70` 集成候选至 `161a0ec5`（含 CF-01、CF-29、CF-19 补强、CF-14 R2-A–D
  与 single-sample 修复）。合并仅需按语义合并实施计划的 A/B 与 C/D/E 段，生产代码
  与已测候选逐文件一致；没有合入 main、push 或声称完整 Cloud/独立审查通过。
  CF-14 对抗夹具 worker 的首版 `fbf9ffe7` 复核发现小数 Block ID 无法通过真正 Session
  parser，纯 layout checker 不足以证明准入；已由 `f47ceb3e` 改为整数索引 ID 并逐块
  调用公共 createBlock 验证。修复前 6 个准入 RED，修复后 12/12 及定向 tsc 通过；
  主集成候选复验 12/12 和 typecheck 通过，实际六变体 Package/Browser 对拍尚待。
  CF-21 只读审查确认两处真实旧生成指令缺失：至少四倍 reference-visible 地理覆盖；
  超四个非 Subject 候选时的签名人/动物/物件→主地标→次要/重复群组优先级。
  worker 恢复提交 `ffb6129e` 已逐项对照 `9e35ab53`，以 `914f8620` 纳入主会话分支：
  实际 Planner/Builder 指令、Planner 图片合同/Brief 模板及 frozen Builder Skill 同步；
  不新增面积门禁、目标数量、模型任务或修复预算。新增指令交付 RED 后 Planner/真实
  Case preparation 17/17、既有 Brief parser 4/4、Skill drift/check 66/66 通过；
  Skill Creator 的 Python metadata quick_validate 因本机缺 PyYAML 未完成，未安装依赖，
  frontmatter 与基线未改且 frozen/live Skill SHA256 一致。不是新模型效果验收。
  完整普通 feature inventory 是另一个 CF-21 诊断建设，不冒充旧字段漏搬或效果已提升。
  CF-14 对抗集已完成实体墙与中空墙的实际 Package/Browser：候选 `6a9b1d1a`，
  系统临时 evidence 目录后缀 `TrzYAA` / `ZfONyc`，两者 Browser/Vite cleanup completed。
  中空墙开场 bounds 与实墙相同，像素 coverage 为 294 / 315 basis points；严格
  逐像素七关系断言及其余四变体仍在执行，不把单个 Capture passed 当整组通过。
  随后六变体全部实际 Package/Capture passed；其余四组 evidence 后缀为 `4Aen3a`、
  `x5qpD0`、`NbrGzb`、`NtNtV6`，Browser/Vite cleanup 均 completed。七项真实 PNG
  关系在 `/tmp/worldkit-semantic-claims-sa6MB5/report.json` passed：同相机/尺寸，
  洞面积排除、完全/部分遮挡、两个四连通分量、opening 逐 bit 相同但 side/top 增大。
  测试 oracle `0ab9cdb4`（worker `5286f130`）主集成复验 37/37，CLI typecheck
  首次误用 Hash export 后改为已有 sha256CanonicalJson，最终 exit 0。CLI 复用既有 sharp
  与正式身份图 decoder，不新增依赖或生产 gate。报告绑定 PNG/Receipt/Package Hash；
  连通分量不冒充逻辑实例数，同 bounds/count 也不证明任意形状等价。
  只读闭包复核确认另一实际缺口：opening regions/anchors 的 reference 是像素，Host
  gate/Evaluation 仍消费 structural AABB 并给出 add/resize/move；其 rejected repair
  allowlist 还未交付三张 identity PNG/semantic observation。已列入同一 CF-14 的
  `R2-F-OPENING` 主进程闭包；没有另立任务状态权威。默认 side/top presence-required
  仅证明 live identity，是现行正确边界；不将其改成必须可见门禁。显式 reference-projection
  的三视图已有代码，仍需 bound Evidence/Evaluation 的实际 metric 断言。CF-14 继续 open。
- CF-14/R2-F Opening 消费闭包已在主会话工作树实现：Host 从 Hash 绑定的身份 PNG
  派生唯一 pixel regions/anchors，Opening Host gate 和 Evaluation 都消费它；原结构
  observation 仅保留 depth/order/distance 与 Subject/Camera 用途。像素缺失/偏差改为
  adjust-geometry，不武断要求 add/resize/move；同步 operation 合同、两个消费者、
  rejected repair 的三张 identity PNG/semantic observation allowlist、任务指令和
  Builder Skill/live-frozen 副本，未改普通成功策略、阈值、stage 或 repair budget。
  两个 Host gate RED 复现后四文件 83/83；消费链首次暴露 evidenceRefs 排序遗漏，
  已用既有 uniqueSorted 修正，EvidenceSet 24/24 通过。新增相同像素/结构偏移的
  Evidence→Evaluation 回归、缺失身份图拒绝及恢复后四文件逐字/Hash 冻结均通过；
  generation-request 38/38、相关 Run 4/4、像素 join 9/9、operation 拒绝旧值回归通过。
  tsc 首次暴露只读投影类型，改为冻结只读输出后最终 exit 0。Skill drift gate 66/66
  通过，live/frozen 副本一致。最终三视图真实 Evaluation 验收尚待；不是 CF-14
  已正式完成或新 054 模型 Case 成功。
- CF-14/R2-E 三视图消费工具已从 worker `b116b244` 集成为 `010c0420`，主树纯测试
  16/16 和 typecheck 通过；首次真实调用完成 Package 后，在 Browser 启动前由现有
  semantic binding 拒绝：测试夹具只换了 semantic reference，没同步同一目标的
  opening region/anchor。该失败不是生产门禁过严，不删 identity 检查。新增 RED 已复现，
  fixture 改为使用 baseline Receipt 的显式 composition binding 同步两处参考，冻结
  前完成，其他目标、depth/order、Profile 与阈值不变；修复后 16/16 通过。
  最终实际三视图消费验收仍待。`010c0420` 的独立静态审查未发现生产 R2-F 问题，
  但未覆盖上述真实 fixture 失败；工具修复需补充复核，不作整项通过声明。
- **CF-14 专项实现与验收已完成（任务分支 `c52f12b8`，尚未合入 main）**：
  R2-F Opening 像素消费与修复输入为 `85fa2c9b`；三视图工具修复 `c52f12b8`
  RED→GREEN 16/16、`pnpm typecheck` exit 0，独立补充静态审查无 P0/P1。
  `pnpm verify:native-no-script-capture --semantic-geometry-reference rear-depth-wall
  /var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-TrzYAA`
  实际 exit 0，产物位于同一临时父目录的 `worldkit-no-script-capture-evidence-DcqMS1`。
  Package root `sha256:b25cbd379b212af1d64c83c2bc4ce346286a81e002235c5faa15b6566e991bfb`；
  Receipt、三张 identity PNG、EvidenceSet、Evaluation、Case、reference/metric 报告留存。
  同相机 opening gate-mass 无 semantic drift，side 产生
  `world-side-semantic-bounds-max-x-basis-points`，top 产生
  `world-top-down-semantic-bounds-min-y-basis-points`，均 `adjust-geometry`；逐视图
  Evidence 与 Receipt-bound PNG 解码一致。Browser/Vite cleanup completed，侧视 display
  与侧/顶 identity 已人工看图；四张 display 和三张 identity Hash 与先前同几何 `NtNtV6`
  全部一致。复用此前六个实际几何变体及七项 pixel claims，覆盖同 bounds 的空洞、
  完全/部分遮挡、分离同身份结构和 opening 相同但 side/top 不同，未新增生产阈值、
  stage、source repair、模型任务或普通发布 veto。独立审查范围是 R2-F 与新增工具，
  不冒充整个候选分支的最终全维度审查；全仓/Cloud exact-SHA gates 未跑。
  此完成结论仅为 CF-14 既定量测/消费任务，不证明任意形状 IoU、逻辑实例计数或总体
  生成效果等价，不关闭 CF-19/21、NBR-20/70/90 或 WRC-1，未启动新 054 模型 Case。
- CF-12 后续只读复核已确认：四参 Camera intent→Host admission→Package→Director
  已有代码与非默认值回归，不重复实现。最新失败 054 虽有 openingCamera，但无正式
  Capture；旧已发布 054 无此字段，两者均不能证明 R1 实际构图效果。剩余高影响实现为
  旧 `9e35ab53` 的有序 1–8 movementModes、Host Subject/能力选择和 primary visual target
  到 Runtime Subject 的显式身份绑定；当前单行 parser 与固定 Cloud Ridge G Bot 仍待替换。
  软件 renderer 的 spawn+targetHeight 与 Runtime Socket 优先差异旧分支也存在，归 CF-04/12，
  不能作为本次新增普通失败门禁。继续按既定优先级推进 CF-16 最终视觉闭包；这些 CF-12
  缺口仍保留，不因先做 CF-16 被视为已完成。
- CF-16 下一批代码对拍已确认不是“仅差真实效果验收”：current
  `run-styled-opening-frame-agent.sh` 先 prompt-only，再 `generate-only --only all`；
  Python 将 opening 与 tri-view 全部并发，tri-view references 不含 styled opening，
  但 `finalize-styled-triviews.ts` 事后把当前 opening Hash 写为 appearanceSource。
  Opening finalizer 也缺旧 prompt bundle 的角色/目标覆盖校验与 manifest prompt Hash。
  对照 `9e35ab53` 的 Visual Reconstructor Skill 和 launcher，旧逻辑是**一个 Codex task**
  内先生成/看图接受 opening，再使用该 opening 生成/检查 tri-views；opening 与每张失败
  tri-view 各最多重生成一次，Host 两个 finalizer 在全部任务输出交付之后才执行。
  已修正计划中可能误读为“中途 Host 握手”的文字；恢复时不拆成两任务、不加独立
  reviewer 发布 veto。该条仍未实现；Native 下游 styling scope/目标证据接入另须闭合，
  不能反转已完成白模的 productionOutcome。
- 用户要求空闲 worker 及时补位，已在 `aaae92f6` 隔离分配三条 ready 工作：
  `CF06/INSPECTOR-WINDOW`（cf29-progress-visibility，列表窗口化及选择/ARIA），
  `CF07/DIRECT-CANVAS`（cf01-stack-safe，同尺寸直接录制及生命周期），
  `CF03/SUPPORT-REPRODUCER`（cf-integration-candidate，只做当前 zero-normal 条件复现，
  不改生产 Runtime）。三条状态均为进行中，不计完成；旧分支保留。主进程保留
  CF-16 跨域合同和最终集成，Browser/编码验证串行调度，CF-03 独占 worker Havok lane。
- 并行交付新增：CF-06 `180e09e4` 四个 UI 文件，定向 12/12；CF-07 `e35f6e81`
  Recorder 两文件，定向 16/16/严格类型通过；二者尚待主集成及真实 Browser/media 验收。
  CF-03 `2b9ab6a5` 为**故意 RED 测试提交**：非穿透 86° 静态斜面实际 Havok 首 tick
  SLIDING+零法线导致 current BodyPort 抛错；0°/5°/50° 起跳落地通过，另有 9 个 fake
  adversarial RED。主进程已冻结唯一 begin-transaction 修正合同，生产修复尚未完成。
  空闲 worker 已补位 CF16/FINALIZER-RED、CF13/BLOCKER-CLOSURE-AUDIT 和
  CF06-CF07/INDEPENDENT-REVIEW；不将测试交付/静态审查当集成通过。
- CF-19/MULTI-OVERLAP worker 提交 `bbb1ef9b` 已以 `cba4054b` 进入集成候选：renderer
  一次输出至多 32 个去重 Block-ID pair，仍拒绝重叠且不生成假 PNG，Skill/frozen 副本同步，
  focused Skill 66 项通过。在不修改失败 054 Source 的隔离复放中输出 23 对实际冲突，
  代替原先只报第一对；这证明反馈改进，不证明模型修复成功。没有新增付费任务、修复预算
  或普通生产 veto，新的完整 Case/效果证据仍待。主进程继续独占跨域合同、Browser 和最终集成。
- 用户授权 worktree/Case 清理已执行：移除 6 个 merged、无 tracked diff、无活动 cwd 的历史
  worktree（production-closure、report-only-baseline、usability-baseline、nbr-actionable-diagnostics、
  nbr65i-real-case、paper-moon-palace-054-test）；保留其 Git 分支。71 个历史 Case/辅助产物路径
  移入 `/Users/xiateng/.Trash/worldkit-worktree-cleanup-20260905-NdyJko`，可恢复，未清空废纸篓。
  工作区只保留上述最新生成 Case；Git 跟踪的测试 Case/fixtures 不删。最新 opening、Capture
  receipt、Package integrity、Run receipt SHA256 清理前后相同；其余 worktree tracked diff 未变。
  未合入分支、主 checkout、当前 Case worktree、close-prior-design-findings、nbr90-docs 的
  四份未提交文档均保留。缺失的旧 provider-debug worktree 登记已 prune，原 `3dd926cb`
  另存 `codex/archive-nbr-provider-debug-20260902`，没有迁移该旧调试实现。
- 单线程集成检查点（2026-09-06，`codex/cf-production-effect-closure`）：
  - CF-03 将 RED `2b9ab6a5` 以 `31b25df7` 纳入候选，真实 86° 非穿透斜面与 9 项 fake
    zero-normal 断言在修复前失败。`9d9208be` 仅在既有 BodyPort begin transaction 内按
    upward departure → native unsupported → native/admitted-contact normal → unsupported
    解析，同一 resolved 结果进入 sample、integrate 与 committed evidence，不伪造向上法线。
    完整 BodyPort + real-Havok conformance 两文件 120/120、typecheck、`verify:3c-migration`
    通过；未据此宣布 NBR-70、整个候选的 full gate 或独立 exact-SHA review 完成。
  - CF-06 以 `4cc1357c` / `b61e74d0`，CF-07 以 `ad8e1b32` / `5b240005` 集成，包含
    inspector 键盘事件隔离及 MediaRecorder.stop 同步异常清理。两个直接测试文件合计
    29/29 通过；真实 Browser 大列表交互与媒体 CPU/frame-drop/resize 编码对照仍待，
    不把 DOM fake 与 captureStream stub 计作真实效果证据。
  - CF-16 Host role/target/hash closure 已由 `e4ed6938` / `f12b495b` 集成；`1cc83d98` 恢复 Visual
    Reconstructor Skill 与单一 TypeScript 入口，删除 direct-parallel Gemini Python 路径及
    旧专用日志消费者。正式入口只派发一次：同任务先看图接受 opening，再用其确切 PNG
    生成/检查三视图；Host 两个 finalizer 在全部输出返回后执行，不增加独立 semantic veto。
    只重做三视图时冻结已接受 opening/prompt，并校验 opening、user reference 及全部
    whitebox target 的既有 Hash。输入在执行期间变化、任务失败、缺图均不发布新视觉结果；
    原白模不变。成功/失败都保留冻结请求与路由台账，本地失败另保留 router failure evidence。
  - CF-16 验证为入口 10/10（含 local/cloud 正式 router 无模型 smoke）、finalizer 26/26、
    既有 visual-reconstruction 2/2、Studio 入口 2/2；typecheck 通过。Skill 标准 Python checker
    因环境无 PyYAML 未运行成功，改用既有 Node YAML parser 完成 frontmatter/占位符检查。
    测试清单新增本轮文件并补齐候选先前遗漏的 8 个 contract 文件；census 通过
    466 files = 423 contract + 43 resource-heavy，这是清单检查而非运行 466 个测试文件。
  - 上述 CF-16 仅闭合现有 Canonical 视觉入口的实现与定向证据。Native 仍未接入 declared
    complete-target 白模三视图和 base styling requested scope；真实任务内图像检查、opening
    到 tri-view 实际像素引用、纸雕效果及 repair 后其他通过图 Hash 不变仍待真实验收。
    本轮没有新增模型/付费生成、Browser/media、全仓 CI 或独立审查，不关闭 CF-16/PROD-10
    父任务。下一步先按 current Native owner 补齐目标证据与下游 scope，不新增 Runtime 真相。

- 单线程迁移纠偏检查点（2026-09-06，仍在 `codex/cf-production-effect-closure`）：
  - 用户再次明确：不新增 `origin/codex/block-world-main-integration@9e35ab53` 不存在的 gate；
    参数、时序、设计细节尽量一致。仅为验证一致性新增回归，不把它们变成生产阻断。
  - CF16/26B 实际视觉派发阶段从误用的 `visual-imagegen` 恢复 `visual-reconstruction`，
    复用唯一 router 的旧 Cloud 策略：默认最多 3 次、task-timeout 最多 2 次、30s/120s
    backoff、既有 prior-attempt 和环境覆盖、unknown 不重试。入口仍只调用 router 一次。
    原错误实际使 visual stage 落到最多 1 次，RED 已复现；本轮未新建 retry owner。
  - Studio 只投影该阶段到 UI，修复视觉 Token 错报 0 和 formal Cloud marker 带 metadata
    后漏记任务事件；真实子进程固定日志复现 RED 后转绿，不把 provider metadata 复制进事件。
  - CF16 捕获恢复三面共享比例尺、旧 `#DDE8EE` 底色、`1e-6` 非目标可见性、目标 active
    selection、最多 8 次逐面 render/flush/read 与实际前景提前停止。像素 inspector 与旧
    常量/算法原样一致，不新增阈值；捕获本身未新增 publication veto。安装的 Babylon
    9.23.0 `scene.pure.js` active-mesh 条件与 `thinEngine.pure.js` framebuffer flush 已核对。
  - 定向证据：Visual 入口 11/11；Studio 四项 4/4；capture-targets 9/9、artifact-capture
    11/11、artifact-identity-mask 11/11，另 grouped Adapter 1/1。包含非对称共享比例、
    立即/延迟/持续空白、逐面 copy 抛错后的可见性/相机清理。typecheck 与 diff check 通过。
    未重复全仓 CI；合成像素/NullEngine 不计真实 GPU、模型自检或最终效果证据。
  - 新发现仍未完成：mapping → capture request 的显式 semantic front、旧 review-only
    render style、Native complete-target sheets 与 styling scope。下轮先闭合这些生产者/
    消费者，不用固定世界轴或提示词补丁冒充目标方向，不关闭 CF16/PROD10 或整个 CF。

- semantic-front / Host 三视图纠偏检查点（2026-09-06，同一 CF 分支，未跑真实 Case）：
  - 当前目标已按用户最新要求固定：**所有 CF 实现和老分支对齐完成之后，最后再跑本地 Case，
    证明生产链路贯通**。不以局部测试、单一白模或部分 CF 完成代替整个目标。
  - 恢复旧 `frontDirectionWorldXZ` 必填 cardinal 声明、mapping/group 同方向合同与完整
    Builder → Host group → Adapter → Runtime → manifest 传递。Canonical Skill/模板与
    portable checker 同步；不存在缺字段时默认为世界前方的兼容路径。Catalog prototype
    捕获仍保留旧的显式 `[0,-1]`，不拿它代替有声明的 complete-target。
  - Runtime 原样恢复旧 Front/Right/Back 投影算法，四个 cardinal 方向各覆盖两种样式：
    semantic mask 水平正交；`runtime-lit-review` 保留原材质、仰视 10°，共享比例尺。
    Adapter 返回真实像素 inspection，并复制冻结方向数组，避免调用方事后改写。
  - Host 恢复旧最多 4 次、间隔 50ms 的异步编译让步；删除 tri-view 稀疏颜色抽样替代物，
    使用旧 Runtime 逐面前景 inspection。空面保留 `.failed/<target>/whitebox-triview.png`
    和 `capture-failure.json`；全部目标通过后才替换接受图。阈值、失败 code 与来源均来自
    `9e35ab53`，没有新增 gate。Browser callback 与既有 Host writer 在 CLI owner 内提取，
    实际调用只保留一个，序列化 callback 回归验证无模块闭包依赖。
  - Studio Preview 的重复 implementation-map 校验器已删除，复用 runtime-contracts
    单一校验器，避免方向合同再次分叉。历史生成 Case 的 map/receipt 未改写；地形测试只
    适配临时副本。代表性 Native Case 的冻结 checker 按仓库既有要求与 live bundle 同步。
  - 定向证据：capture-targets + artifact-capture + spatial finalizer 三文件 41/41；Adapter、
    authoring loader/API、visual 入口/closure 五文件 95/95；CLI + terrain finalizer 56/56；
    Browser API 两项 2/2。Studio 定向 16/16，另 Preview bootstrap 10/10、更新后的
    Preview/三视图交付集成 2/2。这里的 Browser API 测试是 stub，不是实际浏览器验收。
  - Builder/portable/Native Skill 三文件初次 70/71，唯一失败是 frozen checker 旧副本；
    同步后该条 1/1 通过，其他 70 条输入不变，未重跑整套。self-check bundle drift gate
    通过；typecheck、diff check 通过。Skill quick_validate 因无 PyYAML 未成功，已有 YAML
    parser 的 frontmatter/6 个引用/占位符检查通过；没有安装依赖或创建新验证 gate。
  - 仍待：Native complete-target sheets 与 styling requested scope、真实方向/材质像素及
    任务内图像检查/修复。无新付费任务、真实本地 Case、全仓 CI 或独立复核；CF16/PROD10、
    CF02 及整个 CF 保持未完成；CF02 后续 caller 对齐见下一项。
- CF-02 后续旧时序对齐（main-agent-only）：以 `9e35ab53` 实际代码为依据，Canonical CLI
  删除固定 30s API wait，复用 Native 同一 startup watchdog；180s hard / 45s stall /
  250ms poll、导航视为进展、stage 变化或 revision 增长均续停滞预算，以及捕获的单次
  transient navigation 外层重试已恢复。删除 revision <=12 限制与 reporter 的重复阶段
  抑制；保留当前 Host 断连取消、挂起 probe 截止和脱敏错误，不增质量 gate。
  Canonical page 在现有 reporter 发布 module/source/runtime/adapter 进展，page setup
  成功才发布 ready，失败发布 error；不恢复第二个全局诊断 owner。goto 仍为旧链原有
  domcontentloaded/30s，开场可见性重试和三视图重试规则不变。
  定向 startup/hosted transport/CLI/page lifecycle 四文件 108/108、Browser API Adapter
  ownership 1/1、typecheck 与 Planner/Canonical self-check drift 检查通过；均非真实 Browser。
  随后补充 error-phase 优先与恢复启动失败不得再 capture 两项回归，startup + Native route
  + Browser API pause 顺序定向 28/28 通过（含前述 startup 重跑，不累加为独立覆盖数）。
  CF02 的真实启动/Capture 验收仍开放，最后本地 Case 仍须等待全部 CF 实施完成。
- CF16-NATIVE-FRONT（同一 CF 分支，main-agent-only）：旧 `9e35ab53` 的必填 cardinal
  `frontDirectionWorldXZ` 已接入现有 Native visualGroups 声明、checked layout binding 与
  materializer metadata，不从 Camera、最长轴、Mesh 名称或固定世界方向猜测。Canonical、
  Native Host 与便携 checker 共用原有四方向判定；没有增加相似度、面积或质量 gate。
  方向数组复制冻结，修改声明会改变既有 manifest/metadata Hash；此数据不旋转世界、
  Subject 或 Camera，不创建第二个 Runtime 状态。
  Native Skill/输出合同、生成 checker 和代表性 Case 的冻结 Skill 副本同步；当前测试
  样例显式补字段，历史 runs 下的生成 Source/Receipt 不改写。两个方向传递 RED 复现后，
  声明/metadata/capture identity/request/measurement/Package 等八文件 148/148；捕获
  provider/publisher/corpus 三文件 39/39；Native Skill 67/67；补充 binding 冻结/非默认
  方向断言 1/1；typecheck、Planner/Canonical bundle drift 与 diff check 通过。
  上述数量有重跑交集，不累加为全仓覆盖；仍无真实 Browser、付费任务、最终本地 Case、
  全仓 CI 或独立复核。**该检查点只完成声明到元数据**；下项继续接入捕获 Adapter，
  Native styling 和 Studio requested scope 尚未接通，CF16/PROD10 与整个 CF 保持开放。
- CF16-NATIVE-CAPTURE-ADAPTER（同一 CF 分支，main-agent-only）：现有 entity tri-view
  已通过 Native live registry 解析正式 runtime Entity ID，复用既有独立 Mesh/Thin Instance
  隔离 owner；目标范围来自实际局部顶点及该 owner 的世界矩阵，不把同批远处非目标实例
  算入完整对象范围，也不从 Mesh 名称或自造 Entity ID 建立身份。保留旧 Front/Right/Back、
  共享尺度、review 原材质/10° 仰角、semantic tint、背景色及每面最多八次实际渲染。
  临时 Camera、材质、可见性与实例恢复并入既有外层清理栈；早期 canvas、第二面 render、
  copy 或 Camera disposal 抛错都继续恢复，其余清理失败不吞掉原捕获错误。
  初始 Native runtime IDs RED 为 `BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE`；实现后
  artifact/isolation/formal-provider 三文件 50/50。随后扩展独立 Mesh、非原点目标和
  render 故障，artifact 文件最终 42/42（含前次重跑，不累计成全仓数量）；最终 typecheck
  与 diff check 通过。
  本项只是现有捕获 Adapter 的实现和合成像素回归，**Formal payload/receipt/publication
  尚未交付这些对象三视图，Native styling 与 Studio requested scope 仍待接线**。
  没有增加普通生产 gate、另一个 Runtime 状态或付费任务；无新真实 Browser/模型 Case，
  最后本地 Case 仍须等待全部 CF 实现及旧分支对齐完成。
- CF16-NATIVE-CAPTURE-IDENTITY（main-agent-only）：正式交付接线检查复现共享
  `VisualCaptureGroupV1` / `WhiteboxTriviewManifestV1` 拒绝合法 `native-block:<id>`
  的 `HOSTED_VISUAL_RUNTIME_ENTITY_IDS_INVALID`。现清单与 capture groups 携带 Native
  materializer 的精确 Runtime ID，不改名为 Canonical Entity，也不接受其他未声明 namespace。
  保留稳定 Block ID 格式、跨组唯一性、原 role/front/color 与目标文件路径约束；Canonical
  authoring mapping 仍只接自己的 ID 合同，不能拿虚构 authoringSpecId 包装 Native。
  合同/metadata/视觉 finalizer 首轮三文件 64/64；补充直接 Native 下游场景后，两个
  existing finalizer 所在文件 28/28，证明清单不再因 Native ID 格式被拒绝，并保持原
  opening/tri-view role、顺序与 Hash closure。数字包含重跑，不累计为全仓覆盖。
  生成 checker 与代表性 Case 冻结副本已机械同步；Native Skill 67/67、Planner/Canonical
  checker drift、最终 typecheck/diff check 通过。历史 runs 的 Source/Receipt 未改写。
  **这仍不是 Formal Request/payload/receipt/publication 已接通**；也未生成新图片、
  启动付费任务或最后本地 Case。Native Subject/目标绑定及完整 styled scope 继续开放。

- CF16-NATIVE-FORMAL-DELIVERY（同一 CF 分支，main-agent-only）：显式对象捕获请求现已贯穿
  Runtime provider、hosted payload、Receipt、Capture 原子发布与最终 publisher/verifier。
  请求使用既有 source-neutral groups；非主体必须精确连接完整 Native metadata group，
  主体使用真实 controlled Subject ID。按请求顺序绑定 PNG Hash，由 Receipt 派生既有三视图
  manifest，不再建立目标清单权威。旧 CLI writer 提取为共享 Host owner，保留四次捕获、
  50ms 间隔、每面八次渲染、原空面阈值与 `.failed` 原图/报告；先检查全部目标，再交付
  accepted images，Receipt 最后写入。Opening 严格诊断拒绝时保留实际三视图但不发布 receipt。
  无对象请求仍保留原文件清单；未新增质量阈值、付费任务或另一个 Runtime 状态。
  定向证据：正式合同最终 65/65，provider 最终 22/22，Native Skill 67/67；Bridge/frame/route
  与严格 verifier 四文件 72/72；最终 publisher 的空/非空 scope 两项与 PNG/manifest/额外文件
  篡改三项通过，旧 CLI 三视图失败保留四项通过。此前五文件 91/91 与 publisher/provider
  43/43 包含重跑，不累加成全仓数字。生成 checker 与代表性冻结副本已同步，typecheck、
  checker drift 通过；无新的真实 Browser/模型 Case、全仓 CI 或独立 exact-SHA review。
  **普通 Request producer 仍显式使用 `visualCaptureGroups: []`**。Host 的 Native 完整目标/
  Subject 选择、styling 输入准备和 Studio requested scope 尚未接通；当前代码证明显式请求
  的交付能力，不证明默认生产已生成对象三视图，不关闭 CF-16/PROD-10 或整个 CF。

- CF16-NATIVE-HOST-TARGETS（main-agent-only，接 `fa5e9761`）：正式 Request materializer
  已支持显式 `world-only | complete-targets`。完整目标模式从 Case 哈希绑定的
  `inputs/scene-brief.md` 和 Palette 读取一次字节，沿用 Brief 正式 parser 区分原始字节 Hash
  与 Palette 的语义 Hash；按 Palette 顺序连接 checked Native 完整组和 Bootstrap 的真实
  controlled Subject。不生成 Canonical implementation map、虚构实体或遗漏目标 fallback。
  Native Subject 的既有 Spawn yaw 允许任意角度；因此 source-neutral capture group 中的
  Subject front 可携带真实单位方向，仍由原 renderer 派生 Front/Right/Back。Canonical
  draft/final mapping 与 Native Builder 对象声明仍使用旧 cardinal 四方向，未放宽它们；
  不把新架构的合法 Spawn 限制为四方向、不取整 yaw、不旋转世界或主体。使用 Babylon
  Quaternion 直接旋转并归一化，避免矩阵 Float32 中间值误触原 renderer 的单位向量检查。
  先复现合法 Subject front 被拒绝，再以真实 Package 夹具验证 0/90/45 度、全部目标、
  scope/hash/replay、冻结 Brief/Palette 字节变更。三个文件 72/72；取景/production ports
  两文件另 72/72；后补 inventory 顺序、多成员、缺组、错色/语义、真实 Subject、显式 scope
  与相机方向共 12/12（含前项重跑，不累加）。Native Skill 67/67、checker drift 与 typecheck
  通过；live/frozen checker 同步，历史 runs 未改。以上是合成/Package/NullEngine 证据，
  没有真实 Browser 看图、模型 Case、全仓门禁或独立复核。
  **生产 ports 目前仍显式传 `world-only`**。上层 requested scope 的传递、完整 Native
  styling 输入准备与 Studio 接线仍须实施；本条完成 Host 请求生成能力，不关闭 CF-16、
  CF-12 的主体/能力选择或整体 CF。最后真实本地 Case 继续等待所有 CF 开发及旧链对齐完成。

- CF16-NATIVE-REQUESTED-SCOPE（main-agent-only，接 `13c84ec7`）：Native full/build 场景
  入口现在通过 `--visual-capture-scope complete-targets` 将完整目标请求传入唯一
  reconstruct CLI、production transaction、ports 与正式 Request materializer，已删除
  ports 硬编码 `world-only`。独立 reconstruct 新运行省略该选项仍为 world-only，不改变
  原有定向世界捕获用途；Native 的 plan-only 仍不启动 Builder 或 Capture。
  resolved scope 随原有 Run inputs 的 staging/fsync/rename 一起冻结到
  `inputs/visual-capture-scope.json`，不是另一份运行状态机。Host-only resume 省略覆盖值时
  读取原记录；显式换 scope 在恢复执行前被拒绝。运行中改变记录也会在发布前的原有输入
  重查中失败；未知或缺失记录不伪造默认值。历史 runs 不补写该新字段或冒充当前恢复证据。
  CLI 新参数先 RED 后 GREEN；CLI/ports/Native launcher/staged-flow 四文件 98/98，
  production transaction 全文件 47/47，随后追加发布前 scope 变更一项回归通过。
  其中 scoped freeze/恢复/清理四项及 CLI 五项是前述测试子集，不累加为独立覆盖。
  类型与 diff 检查通过；没有模型/Browser Case、整仓 CI 或独立 exact-SHA 复核。
  本项激活完整目标捕获请求，不代表已经运行新 Case 或交付 Native styled opening。
  接下来仍须用正式 Native Capture/Receipt 准备视觉任务输入并接 styling/Studio，不能
  通过虚构 Canonical map 或提前跑 Case 绕过。CF-16、其余 CF 和最终生产验收仍开放。

- CF16-NATIVE-VISUAL-INPUT（main-agent-only，接 `f11c0548`）：既有单任务视觉入口与两个
  Host finalizer 支持显式 `--scene-source babylon-native`；省略仍保留原 Canonical 输入路径。
  Native 读取 Case 绑定的 `inputs/scene-brief.md`、Palette 与正式 `final/capture` Receipt、
  opening、完整目标三视图，复用正式 Case/Receipt parser、派生 manifest 与既有 Hash closure。
  不虚构 Canonical implementation map/Runtime Snapshot，不复制根目录白膜别名；输出视觉
  manifest 直接引用 `final/capture` 原图路径。Receipt 自带真实 ready Snapshot，作为冻结
  context 提供；原 Capture 不写回。Native 的 tri-views-only 复用已接纳 opening 的确切字节。
  仍为一个 visual-reconstruction task、旧 opening-first/self-check 顺序、原 retry/timeout
  及 Host finalizer；未新增语义 Reviewer、质量阈值或改变白膜 productionOutcome。
  先复现缺少 Canonical map 的错误；视觉入口/closure 两文件 47/47，覆盖真实合同合成
  Receipt、原图/manifest 哈希、冻结 Brief/Palette、live/staged Receipt 变更、实际输出路径、
  opening anchor 复用与已有结果保留。最终入口 19/19 重跑、typecheck 与 diff 检查通过；
  重跑不累加为独立覆盖。不是真实模型图片或完整发布→Studio 验收。
  Native 场景 launcher/Studio 尚未调用这个显式 source 的 styling 路径，仍须继续接线；
  CF-16 与其余 CF 保持开放，最后本地 Case 仍等待全部开发及旧链对齐完成。

- CF16-NATIVE-SCENE-STUDIO（main-agent-only，接 `b558ba6b`）：已按固定旧基线
  `9e35ab53:run-spatial-world-agent.sh` 的启动条件接通 Native 场景风格化：白膜生产 exit 0
  后，只有 Case 存在首张用户参考才调用已有单任务 opening/tri-views 入口，显式传 Native
  Source/backend；build-only 使用 `inputs/reference-0` 冻结字节，不重新打开原上传路径。
  plan-only、无用户图、白膜失败均不启动视觉任务；视觉失败不重跑 Planner/Builder。
  Studio 新建、运行与重试继续使用既有 styled Required/Status 字段；Native 参考图任务不再
  被硬编码成 not-required。正式 Capture 的对象目录清单由原 Receipt 精确派生，继续检查
  PNG/manifest Hash、目录和链接；不把合法三视图当作额外文件。媒体清单、白膜 PNG API
  与 deliverables 使用真实 `final/capture` 路径，没有根目录白膜 aliases。
  视觉完成只复核既有 Host finalizer 的 file/hash closure，没有第二个语义 Reviewer 或新
  质量阈值。已进入视觉阶段后失败/缺文件/改图会令整体任务 failed，但保留 passed 白膜、
  published 产物与已绑定 Native launch；该入口仍复核原 Package/Capture 身份。没有进入
  视觉阶段的异常 nonzero 仍按原失败规则处理。严格诊断 failed 不否决普通生产或 styling。
  同时迁移 Studio 的旧固定 traversal 消费者：正式 parser 允许空请求/空观测时，使用
  Capture ready Snapshot 的原身份核对，不再强求不存在的 firstCheck 或恢复虚构路线。
  先复现 Native 阶段缺少视觉调用/吞掉视觉失败，以及 Studio 拒绝合法对象目录；入口与
  阶段控制三文件 22/22、Studio Native/媒体/队列定向 46/46 通过。覆盖正向 finalizer、
  无脚本 Capture、严格诊断失败、视觉失败隔离、PNG/manifest/额外目录 mutation，以及
  既有 Package/Capture 篡改拒绝与启动资格撤销。先前 4/4、9/9 与 6/6 是重跑子集，不累加。
  最终 typecheck 与 diff 检查通过。本项是本地合成合同和实际 HTTP 入口证据，
  不是真实模型图、Browser 看图或全仓验收。
  视觉阶段中断恢复、下游 Recording 消费者、其余 CF 与最终真实 Case 继续开放；保持所有
  CF 开发及旧链对齐完成后，才运行最后本地生产 Case。

- CF16-NATIVE-VISUAL-RECOVERY（main-agent-only，接 `69a4fbdd`）：进入 Native 视觉阶段时，
  Studio 已将原生产结果及发布证据验证后保存到既有 record 的 whitebox closure 和
  `evaluation-run.json`，不再等长时间图片任务退出才记录已通过白膜。写入沿用单记录
  串行 owner，核对当前 attempt/startedAt；多结果或 command failure 不成为 checkpoint。
  没有创建另一套 Run/Attempt 状态或模型任务。子进程结束时等待该写入，最终普通结果
  仍走原验证路径；Capture/Package/历史 Run 不修改。
  重启只在同一 Studio 运行身份、Native launch 证据和完整 styled file/hash closure
  同时成立时恢复 ready。缺图、stale run、改过白膜、明确 failed 均不恢复成功，也不启动
  Planner/Builder/视觉任务。修复实际停机回归：记录原 visual failedStage，并保留已发布
  白膜的 captureStatus=passed，不再改成 not-run。严格诊断失败仍单列。
  真实进程 stand-in 保持存活，验证 checkpoint 已先持久化，再 shutdown/restart；
  五种重启条件 5/5、既有 Native styled/Canonical recovery 回归 7/7 通过。Canonical
  正向夹具改为显式 Canonical Source，不能让 Native 记录靠 Canonical 文件恢复成功。
  单记录并发、停止、队列生命周期定向 4/4 通过；最后重启/失败两项复跑通过，
  是前述子集，不累加。Node 语法与 diff 检查通过。
  本项只恢复已完成交付的视觉结果；不完整交付的显式 visual-only retry、Recording
  下游与其余 CF 仍待推进。没有新模型 Case、Browser 看图、全仓门禁或独立复核；最后
  本地生产 Case 继续等待全部 CF 开发及旧链对齐完成。

- CF16-VISUAL-TASK-REPLAY（main-agent-only，接 `66b4da8e`）：视觉入口现支持显式
  `--resume`，首次派发前原子写入 scene 的 `visual-task.json`，绑定原 task root/request id、
  Source/scope/backend、冻结输入、instruction/arguments Hash 与 Cloud output prefix。
  该引用不进入模型上下文。Cloud 恢复向既有 router 重放完全相同的参数与 request id，
  unknown 核对、terminal retry 次数及退避继续只归原 router，不重置预算或新建请求。
  router 交付后另存精确输出字节收据；Host finalizer/发布中断或已经发布后，恢复只重放
  原有 finalizer，不再调用模型。已移出 staging 的文件只能从收据 Hash 一致的 live 输出
  恢复；引用、输入、instruction、收据或输出变更均不静默转成重新生成/残留图通过。
  Native 全量/仅三视图恢复保留原 Capture Receipt 和已接纳 opening；未改变图像自检、
  模型、prompt、成功标准或生产 gate。定向入口测试 36/36、typecheck、diff 检查通过；
  先前 26/26 是其子集，不累加。测试使用合成图片/派发替身及既有 router 无模型 smoke，
  不是真实 Cloud unknown 请求或生成效果证明。
  本地缺少完整交付收据仍不能安全推出任务成功/可重提，显式 local terminal 恢复、Studio
  visual-only retry 接线及 Recording 下游继续开放。未运行真实模型 Case、Browser 看图、
  全仓 CI 或独立复核；全部 CF 实施及旧链对齐完成后再运行最后本地生产 Case。

- CF16-STUDIO-VISUAL-RETRY（main-agent-only，接 `076a2f22`）：Studio 重试按钮现按已有
  Native 发布闭包选择视觉续接，调用 `agent:world:first-frame --resume`，不再清空白膜后
  重跑 Planner/Builder。使用原 backend 和 Case Hash 绑定的 reference-0；原上传文件删除
  不影响恢复。排队、运行、失败均保留原 production/publication/strict diagnostic/launch，
  Studio attempt/evaluation-run 更新不改写 Native Run/Attempt 或视觉 router 请求身份。
  开始前、实际派发前及终态复核既有产物完整性；缺失/被改动的输入不回落成完整生成。
  视觉子进程不再被要求重新输出 Native production result，也不能替换原结果。显式恢复
  仍使用原视觉入口的请求/交付 Hash 和两个 finalizer，不要求复用像素拥有本轮 Studio
  attempt 的新 mtime；完整生成及自动重启的原 freshness 行为未改。
  补齐执行期间失败隔离：仅 appearance reference 失效时视觉失败、白膜仍 passed/published；
  若白膜自身实际 Capture 证据失效，才撤销启动资格并清除残留的 whitebox passed 显示。
  12 个重试场景均取得通过证据，覆盖 local/cloud、连续重试、旧像素、原上传删除、
  异常 production 输出、派发前/执行中 mutation、启动失败及第二次执行 shutdown/restart。
  最后仅修正启动接口既有 404 预期，单项复跑 1/1；不是新增一条验收。既有 Native styled/
  restart/Canonical recovery/atomic-root 13/13，以及 mutation/nonzero/atomic-root/队列/
  停止 9/9 通过，两组有重复、不累加。Node 语法与 diff 检查通过。只改 MJS 和文档，
  未重跑此前已覆盖的 root typecheck；没有真实模型、Browser 看图、全仓 CI 或独立复核。
  local 缺交付收据的终态核对、旧时间戳交付在中断重放后的自动恢复、Recording 下游及
  其余 CF 仍开放；不据该入口接线关闭 CF-16，也不提前运行最后本地生产 Case。

- CF16-LOCAL-DELIVERY（main-agent-only，接 `0cc4dad2`）：本地 adapter 增加可选 Host
  交付证据。只在原子任务 exit=0 且所有声明输出满足原有文件检查后、Host 搬运前，保存
  request/task id、原 router 实际转发 arguments Hash、逐输出字节/Hash 和最后原子提交的
  report。快照不进入模型工作区，不包含原始参数/凭据；复用既有安全文件读取器，整体
  有界 128 MiB。快照失败/超限只输出 evidence unavailable，不改变原成功/失败判定、
  模型、prompt、超时或本地单次任务策略，也不覆盖旧失败记录。
  视觉入口显式启用该证据；若上层尚未来得及记录 `dispatch-delivery.json`，`--resume`
  可从原请求的完整 adapter 快照原子恢复输出，再走原 finalizer，无额外 router/model 调用。
  覆盖完整/部分搬运、原 staging 清理后恢复及再次恢复；外来 request/arguments、变更
  快照、符号链接或缺少 commit report 均不能变成通过。缺图、未知/拒绝的子任务没有
  成功交付证据，继续拒绝盲目重提，不把“不知道是否成功”当可重试终态。
  本地 adapter + failure evidence 两文件 16/16，视觉入口 42/42 通过；最后原子恢复写入
  及实转发 arguments Hash 的直接六项复跑 6/6，是前述子集。Planner execution/Skill 直接
  消费者两文件 21/21、typecheck、Node 语法与 diff 检查通过。测试使用
  实际本地 adapter/router + fake Codex 子进程、合成 Native/图片及恢复派发替身；没有
  真实模型/Cloud、Browser 看图、全仓 CI 或独立复核，不声称断电持久性或无证据恢复成功。
  旧时间戳交付在重放中断后的自动恢复、Recording 下游及其余 CF 继续推进；所有 CF
  实施及旧链对齐完成后才运行最后本地生产 Case。

- CF16-RECORDING-ASSETS（main-agent-only，接 `e5daf66f`）：Studio 通过现有 Native
  publication/launch 身份验证向 Recording 提供唯一 Source 上下文，不再要求 Native
  伪造 Canonical authoring.json。视觉失败或 strict diagnostic failed 不撤销仍有效的
  白膜录制资格；Capture 被改动则沿用现有 launch 证据检查撤销资格。
  Recording 消费 styled manifest 中同 Source、同 target 的真实白膜引用，复用
  visualCapturePaths；Native 使用 final/capture/triviews 和冻结 inputs/world-plan.png，
  不读取 Canonical 根目录占位图或另一目标的图。保留旧 role/ID 排序、primary→opening→
  其余 tri-view 的 prompt 引用顺序、backend 冻结、生成/ZIP 所需媒体条件、视频参数和转码。
  两种 Source 的真实 HTTP upload/list/generation dispatch/ZIP 及负向资产引用测试
  17/17，通过实际 ZIP 解包核对 Native plan/白膜字节；模型与视频生成为 stand-in。
  Studio Native styled 四种终态/失效撤销 4/4、既有 Playground Recording 消费者 4/4、
  Node 语法与 diff 检查通过。仅 MJS 与文档变更，不重跑无关 typecheck/全仓重型门禁。
  Native Viewer 尚未安装录制面板：实际 hosted Canvas 位于 credentialless 跨源 frame，
  当前 Runtime bridge 没有视频交付合同，shell 也没有 Studio Recording 服务绑定。
  不能通过放宽 Runtime CSP、向 frame 暴露 Studio API 或复制 CanvasRecorder 代替该接线。
  浏览器端录制/上传、旧时间戳中断自动恢复及剩余 CF 继续开放；本次不是 Browser/媒体
  效果、真实模型 Case 或全分支验收。全部 CF 实施与旧链对齐完成后再跑最后本地生产 Case。

- CF16-RECORDING-SHARED（main-agent-only，接 `d01e50ab`）：为跨源 Native Viewer
  复用建立唯一 `@whitebox-world/browser-recording` owner，将 CanvasRecorder、Recording
  面板和专属 CSS 从 Playground 迁出。Canonical consumer 改用明确 package exports，
  自己的 Host route→Studio world 选择留在 Playground；旧实现路径删除，无 alias/re-export
  shim，也未把 Recording 混入 deterministic control-capture 或 Runtime authority。
  Recorder 和原测试逐字未变；面板只移除应用专属 route helper，余下逻辑及专属 CSS 与
  `d01e50ab` 字节对比通过。回读固定旧 `9e35ab53` 的 1280×720、24fps、12Mbps 和 MIME
  候选顺序确认保持不变。本轮不修改录制/上传/生成条件、计时、编码或生产门禁。
  Recorder/现有消费者 22/22、typecheck、Playground production build 通过；build 保留
  已有 large-chunk warning，不是 Browser 交互/像素证明。依赖仅新增本地 workspace link，
  offline install 未下载/升级外部依赖。测试登记先修本轮移位排序，再补齐此前漏登记的
  hosted-formal-capture-protocol.test.ts（纯传输合同，不运行 Browser），其 2/2 通过；
  census 最终通过：467 files = 424 contract + 43 resource-heavy。
  workspace-boundaries 未通过：仍有 8 个跨包私有导入，位于既有
  packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts、
  scripts/native-scene/world-bounds-policy.test.ts、
  scripts/reconstruction/evaluate-evidence-set.test.ts、
  scripts/reconstruction/native-semantic-geometry.test-support.ts 和
  scripts/reconstruction/native-semantic-geometry.test.ts。这些文件、相关被导入包的 exports
  与 debt 清单相对 `d01e50ab` 均未改；未增加 debt/放宽 checker，保留候选集成清理待办。
  后续 CF16-RECORDING-TRANSPORT/STUDIO-BINDING 仍须完成实际 frame Canvas→shell→Studio
  交付、录制控件、失败备份和完整生命周期；本次未改变 Native bridge/CSP/Runtime，
  不宣称 Native Viewer 录制已可用。不运行真实模型 Case；仍等待全部 CF 开发和旧链对齐。

- CF16-RECORDING-TRANSPORT（main-agent-only，接 `8f91939d`）：Native interactive shell/frame
  在原 origin/source/session/nonce 握手中交付独立媒体 port；原 Runtime port、Envelope、
  Request/Receipt 与预算不变。正式 Capture/probe 不安装媒体 port 或控件，不开放 Runtime
  CSP/网络访问。仅实际 hosted Canvas 延迟创建共享 CanvasRecorder，保留原尺寸、fps、
  bitrate、MIME、编码与 stop duration；不新增录制时长或整段大小 gate。外层在 stop 后按
  精确 offset 拉取最多 64 KiB 的单个原始字节块，不把视频塞入 Runtime JSON。整段 Blob
  仍沿用旧链内存保存方式；本项不声称整体内存有界、视频质量已验收或生产结果已通过。
  Native shell 现有录制按钮/计时和停止后的本地下载实现，下载复用从 Canonical 迁出的
  原函数（相同文件名规则、Blob 与 10 秒 URL 释放），不是以本地下载代替后续 Studio 上传。
  重复请求、坏 metadata/offset/字节块、导航与两端关闭均有处理；媒体关闭会拒绝 pending
  操作、清理计时器，Runtime close 先释放录制器。录制中 reset conflict 已回读确认与
  `9e35ab53:apps/playground/src/main.ts:2815` 一致。媒体失败不修改已发布白膜/生产判定。
  Browser runner digest 增加新媒体/控件/共享源码，Native 声明直接 workspace 依赖；没有
  外部依赖升级或生成任务。最终八文件 68/68（涵盖实际 MessageChannel + recorder/UI 替身、
  原 CanvasRecorder 和 Canonical 消费者）通过；早期六文件 54/54 是其子集，不累加。
  frame 握手五项曾因夹具仅声明 session.close 而失败，修为原完整 Runtime 请求清单后 5/5，
  已纳入最终 68 项；未放宽生产 parser。Native Vite/Package 与正式 Capture route/bridge/frame
  五文件 50/50、最终 typecheck、3C migration ledger、census（471 files，428 contract +
  43 resource-heavy）及 diff 检查通过。Native 和 Playground 最终生产构建均通过，保留
  large-chunk warning；Native build 只编译现有 Cloud Ridge Package fixture，不是运行 Case。
  workspace-boundaries 再跑仍报上段相同 8 个既有私有导入，无新增项，不记该门禁通过。
  当前证据未包含实际浏览器编码、跨源页面交互/截图、模型生成、全仓 CI 或独立复核。
  CF16-RECORDING-STUDIO-BINDING 的 Package/Studio 身份、上传/列表/生成面板、上传失败备份
  尚未接入；旧时间戳中断自动恢复、其余 CF 与最终真实生产 Case 同样保持开放。

- CF16-RECORDING-STUDIO-BINDING（main-agent-only，接 `e50a20eb`）：Studio 新增显式
  “准备录制页”入口，复用已验证 Package 的 owned copy 和既有 Native 双源服务；同场景
  并发打开合并为一次启动，Package 替换/进程退出/Studio 关闭撤销权限并清理自有资源。
  不修改生成的 Native launch 命令或 BNA 收据，也不伪造 Canonical Preview Source。
  仅 shell Node 收到限定当前场景的 capability 和本地 Studio origin；浏览器只收到
  sceneId/Package root，Runtime frame 不收到 Studio 权限。代理仅开放既有录制及素材
  端点，剥离 Cookie/全局 Authorization；每次请求复用已有 Native 发布/launch proof，
  不以 strict/style 成败增加白模录制 veto。shell 允许同源图片/媒体，Runtime CSP 不变。
  shell 以 Runtime ready 的 Package root 绑定共享 workbench：停止后单次上传，失败时
  下载原始 Blob 备份；独立 Native 启动继续本地下载。关闭页面/媒体连接会清理面板定时器，
  不在关闭后触发延迟下载。Native 录制持久保存 Package root，上传结束、生成排队实际执行
  和打包前避免与同场景的新 Package 混用；不改变旧归一化、Prompt 引用顺序、Seedance
  参数/预算或普通生产标准，也不自动发起视频生成。
  三个 Package 缺口 RED 已复现后修复，Recording workbench/preview manager 24/24；
  新增排队期间 Package 替换回归 1/1；Studio 按四种视觉结果的真实发布夹具回归 4/4；
  入口 fake-DOM 测试 5/5。浏览器录制适配/控件、Vite、binding/proxy 五文件当前合计
  25 项通过（首轮 24 项后补 CSP 隔离断言；两文件复跑 15 项，不重复累加）。
  响应头 TS 类型与测试清单排序首轮错误已修正，最终 typecheck、census
  （474 files = 431 contract + 43 resource-heavy）、3C migration（11 entries/39 refs/10
  invariants）和最终 Native 构建通过；保留 large-chunk warning，构建只编译已有 Package
  fixture，不是运行新 Case。实际 Browser 编码/页面交互、
  模型视觉/视频生成、最终本地 Case、全仓 CI 和独立复核未运行；未关闭 CF-16 或整个 CF。

- CF16-STUDIO-INTERRUPTED-VISUAL-DELIVERY（main-agent-only，接 `0028c87b`）：新增
  RED 复现“显式视觉恢复再次中断后，有效旧像素被本轮 mtime 拒绝”。现有 evaluation-run
  记录 visual-resume；普通任务仍保留旧 freshness 行为，仅该中断恢复模式可调用既有
  visual owner 重放已交付结果。重放复用原请求、冻结输入/Skill、交付 Hash 和两个 Host
  finalizer，派发回调固定拒绝；不会向本地/Cloud 再投任务或对未知 Cloud 请求发起对账。
  支持已搬运/部分搬运、旧像素和重复重放；未交付、输入变更仍 interrupted，原 Native
  Package/Capture/production/publication/strict diagnostic 不变。不是删除所有时间检查。
  视觉入口 46/46（含真实冻结请求/交付文件与 Host finalizer，模型为 stand-in），Studio
  重试/重启恢复 12/12，加普通 Native 完整但旧像素不误恢复 1/1；typecheck、Node 语法、
  diff 检查通过。初次新增测试漏导入 rename 已修，随后重现四项缺少重放入口 RED，并
  取得上述 GREEN。Studio 恢复端口测试使用注入回调，视觉入口另以真实恢复 owner 验证；
  不据此冒充完整真实生产链、Browser 或效果验收。
  对拍还确认后续差异：旧 `9e35ab53` Studio 对特定任务终态失败后的迟到视觉交付、
  Host 收尾错误具有恢复分类，且不只在启动时恢复；current 主要在启动时恢复并统一
  排除 failed。该范围继续归 CF-16，需逐条件对齐，不把本批局部恢复当作整个 CF-16 完成。

- CF16-LATE-DELIVERY-PARITY 的本地交付恢复（main-agent-only，接 `f6b5e318`）：
  对照旧 `9e35ab53` 的恢复分类和调用点，Studio 恢复默认 60s、最短配置 1s 的单一
  轮询与初次对账；未启用自动执行时默认不启用轮询。当前使用 source-neutral 配置
  `autoRecoverVisualDeliveries`/`WORLDKIT_STUDIO_VISUAL_RECOVERY_INTERVAL_MS`，
  不恢复旧 provider-specific 状态别名。每次 sweep 排除 active/queued/cancelled，
  复用现有按 record 串行 owner，与用户 retry 同序；关闭时清理 timer、等待当前
  本地重放结束且不再发布 ready。同一失败原因不按分钟重复写日志。
  Native 的现有 exit -1/1 或 `STUDIO_NATIVE_VISUAL_OUTPUTS_INCOMPLETE` 映射到
  可检查迟到交付/Host 收尾的类别；显式视觉/alignment 失败仍拒绝。已有完整 Hash
  闭包可恢复；缺少收尾时只调用同一 delivered-only visual owner，不创建任务。
  RED 复现两种迟到恢复失败及取消被误恢复，现已 GREEN。新增迟到/取消/竞争测试
  首组 5/5，轮询与既有 Native 重试/重启 25/25，队列/停止/原子写/Canonical 恢复
  7/7；补充 shutdown 在途恢复后两项 2/2（其中 retry race 是重复项，共 38 个不同
  用例）。最终只调整缩进，Node 语法/diff 检查；本批仅 MJS 和文档，不重跑未失效的
  root typecheck、Browser、模型/视频 Case、全仓 CI 或独立审查。
  **尚未完成远端交付下载**：当前只重放已经在本地的不可变交付。已定位现有
  `run-codex-task → run-lwdp-codex-task --reconcile-only`，它保留原 request/attempt
  owner 且不创建替代 POST；下一步须核对精确参数/台账以及 pending/shutdown 取消后
  接入，而不是把本地产物恢复冒充完整 Cloud parity。CF-16 与整个 CF 保持开放。

- CF16-CLOUD-RECONCILE-ONLY（2026-09-06，main-agent-only，承接上述本地恢复）：
  已接入同一 visual owner → 正式 `run-codex-task` router → 原 request/attempt
  `--reconcile-only` 远端下载。先验证冻结输入、Skill、原始参数与身份，再执行同一
  Host finalizer/promotion；不从日志猜 job、不复制 provider 认证、不创建替代模型 POST。
  同时对拍发现默认 same-id recovery 会等待远端任务结束，不能直接作为旧 Studio
  的每轮迟到交付检查。因此增加仅与 reconcile-only 配对的 `--reconcile-no-wait`：
  pending 只查一次并保留 pending，下轮再查；不记录终态失败、不改变模型 timeout、
  任务预算、普通成功标准或冻结 dispatch Hash。普通显式恢复默认等待行为不变。
  自动恢复关闭时，重启仍能完成本地产物收尾，但不启动远端对账。
  Studio 关闭先 abort 对账，再等待退出；visual 调用复用从 Studio 原样移至
  `scripts/lib/owned-process.mjs` 的唯一进程树 owner，原 public-server 消费者一起
  更新。TERM grace/KILL 参数不变，父进程先退、子孙忽略 TERM 仍可清理；关闭后
  不发布 ready，原白模与历史运行记录不改。没有新增质量 gate。
  定向证据：视觉入口首轮 49/49；no-wait 后两项关键回归与新增实际 router→模拟
  adapter→真实 finalizer 桥接回归通过（新增夹具最初误读 report.outcome，改用
  现有 report.status 后通过）。Cloud retry/same-id 两文件 44/44，包含 pending
  只查一次、零新增 POST、完成后同请求下载、缺失 journal、原等待模式及失败矩阵。
  Studio 轮询/重试/重启 31/31；原进程 owner/public-server 首轮含子测试 12 项
  通过，追加“父已退、子孙存活”后 owner 3/3。各轮有重复，不累计成 aggregate。
  最终 typecheck、Node 语法及 diff 检查通过；移动前后 owner SHA256 完全一致。
  远端服务和下载 adapter 仍为测试夹具，没有真实模型/实云、Browser/media、最终
  本地 Case、全仓 CI 或独立审查。未新增测试文件，无需变更测试清单。
  代码接线不等于实云或模型验收；CF-16、其余 CF 和最终本地生产 Case 仍开放。

- CF-12/M-A/B 有序运动意图接线（2026-09-06，main-agent-only；接 `aedf9403`）：
  旧 `9e35ab53` Scene Brief 支持 1–8 条有序 `- 模式：说明`，首行为初始模式；
  当前单行 parser 会拒绝合法“飞行后步行”。已先以该输入复现 RED，再恢复
  `movementModes`，包含旧括号装备标签分类、自定义标签、重复 label 与数量限制。
  Host Palette writer/parser、CLI 改为同序 `movementModes`/`movementModeLabels`，
  删除单数公开字段和单行输入格式，不保留 alias/fallback。Planner 支撑色检查与
  旧链一致：任意位置有地面 mode 即执行原检查；纯飞行不被新增地面要求拦截。
  其余图像阈值、目标数量/身份、规划顺序、修复预算和模型参数均未改变。
  Planner Skill/template 同步，并区分 Canonical Builder 的主体组装与 Native Host
  的主体/Physics/Camera 权威。四个 portable 工具由现有 producer 重建，Native
  冻结副本同源更新；当前 strict Corpus Brief 及 Case 的 raw-byte Hash 一起更新。
  历史三套 Canonical 生成产物和所有 `runs/` 收据保持原字节，不将旧 Hash 改造成
  新验证结果；Canonical authoring-attempt 测试改用当前 Planner 模板作为输入。
  证据：8 个直接消费者文件初轮 99/100，唯一失败为 builder drift-negative 测试
  超过原 30s 时限；其他工作结束后单独重跑 1/1（26.66s）通过，未增大时限。
  Native Builder Skill 67/67，CLI/真实 Package-owner 恢复 smoke 2/2，Planner/Builder
  bundle drift gate 通过。后续 record/Palette 两文件 6/6、最终 typecheck 与 diff
  检查通过；各轮存在重叠，不累加为完整 gate。测试文件未新增，清单不变。
  Skill 标准 quick validator 因环境无 PyYAML 未成功运行；使用既有 Node YAML parser
  检查 frontmatter 与占位符，模板和行为由实际 parser/source/bundle 测试覆盖。
  这只关闭 M-A/B 的数据链实现，不是完整 CF-12：M-C 的完整 Host Subject/能力选择、
  primary visual target 到 Runtime Subject 的身份绑定、真实多模式与构图验收仍须
  实施。没有真实模型/Browser/最终本地 Case、全仓 CI 或独立审查；全部 CF 写完并
  完成旧链对齐后才运行最终本地生产 Case。

- CF-12/M-B 实际派发指令补漏（2026-09-06，接 `043f21e3`，main-agent-only）：
  复查发现统一 Planner shell launcher 仍含 `exactly one standard or custom movement mode`，
  因此上一批 Skill/template 与 parser 的多模式实现尚不足以证明实际派发一致。
  已将该指令改为 1–8 条有序运动模式、首行为初始模式、后续为同一主体真实可用的
  替代模式，保留用户请求顺序；不改变 Subject 选择权威、图像阈值、模型参数或修复预算。
  回归先复现旧指令 RED，再取得 7/7 GREEN；随后测试执行两种 Source Profile 的完整
  prompt 赋值块，而非仅搜索第一段赋值，证明实际展开的 Canonical/Native 指令都保留
  用户意图、模式顺序、原三轮自修复与 Host 单次 replay，最终该文件 9/9。
  shell 语法及 diff 检查通过；无 Skill/bundle/Runtime 修改，不重跑未失效的重型 gates。
  没有模型、Browser 或最终本地 Case，不关闭完整 CF-12。
  M-C 当前能力核查：使用现有 `normalizeAuthoringSpecV4`、Gameplay Bootstrap producer
  与 `compileCanonicalWorldV1`，逐个替换现有有效测试世界的 Subject ref，探查当前
  Registry 的全部 30 个 discoverable Subject。24 个编译成功，实际默认 Motion Profile
  均为 `free-ground.humanoid-medium@1`、Kernel 为 `free-ground`、能力为 ground；
  两版 forward-steer animal、paraglider、ice-skimmer、four-wheel arcade 和 kayak 共
  6 个在现有 normalization 处报 `SUBJECT_CAPABILITY_UNSATISFIED`，其中部分还引用
  未开放的关系能力。此证据是当前编译准入，不是 Browser 运动验收或旧树运行证据。
  旧 `9e35ab53` 的 `scripts/lib/agent-authoring-catalog.ts` 同样先做真实编译探查，
  再派生可执行模式；不能只照 current Registry 的名称/标签宣称飞行、驾驶或水面能力。
  后续仍需完成 M-C 的 Host 主体构造/选择、完整视觉形状和能力/身份/Hash 传播，不能
  用静默 G Bot 替换、删掉请求模式或新增前置生产 veto 代替实现。

- CF-12/M-C1 唯一 Subject 编译入口（2026-09-06，接 `66d8ebc5`，main-agent-only）：
  从 Canonical compiler 提取现有 Subject/Asset/Rig/Animation/Collider/Capability 编译
  到 `packages/compiler/src/compile-subjects.ts`，公开
  `compileNormalizedSubjectResourcesV1`；Canonical 已消费同一入口，原内嵌副本删除。
  输入仅需已准入的 normalized Subject 资源与节点，不要求世界、地形、Camera 或
  Canonical Scene Plan；原输入准入、完整 resource-lock identity 和 entity ID 唯一性
  仍由调用 Host 负责，不能把这个可信编译函数当成未可信 JSON admission 的替代品。
  没有改动任何运动、相机、碰撞或拒绝规则，也没有接入按名称猜能力的 selector。
  实施前在 `66d8ebc5` 固定注册主体、package primitive、package rigged 三组完整
  WRT/Scene Hash；新入口先复现 3 个缺失函数 RED。提取后编译器首轮 48/48，
  三组 Hash 完全不变；加强输入/输出对象完全分离、逆序稳定与直接非法资源拒绝后，
  编译器/Builder Skill 两文件最终 50/50。Runtime P1.5 的直接 medium 入口回归
  1/1，通过原 public export 验证保留拒绝行为，不冒充完整 P1.5 运行验收。
  迁出函数体与原实现按必要 API/type 重命名后逐字节对拍一致。Canonical portable
  checker 由原 producer 重建，Planner/Builder drift、Node 语法、typecheck、
  3C migration（11 entries、39 live references、10 authority invariants）及 diff
  检查通过。Native checker/冻结副本没有发生字节变化，不重复其未失效专项测试。
  本批无新增测试文件；无新模型、Browser、最终本地 Case、全仓 CI 或独立审查。
  **这只完成 C1 编译依赖，不是 Native Host Subject 选择已接通**：当前默认生产
  仍使用原固定闭包。C2 必须继续闭合完整主体形状/真实能力及 Request、Proxy、Package、
  Capture、resume 的精确身份，不能以本次提取或三组 Hash 一致关闭 M-C/CF-12。

- CF-12/M-C2A Host Subject closure 与 Native Request 接口（2026-09-06，接
  `beae162b`，main-agent-only）：新增 `native-subject-host-closure.ts`，输入为显式
  Registry ref 或 package Subject definition，以及 Host 的 ID、Camera、gravity。
  使用现有 Subject schema/normalizer、ResourceLockBuilder、C1 compiler 和 core
  Gameplay/WRT constructors，生成精确 Runtime、Gameplay 与 Registry Lock，并返回
  单主体资源成本。该函数不解释 Planner 文本、不猜模式、不选择近似、不写文件或启动任务；
  整包预算与完整模式/视觉身份选择仍归 C2B，不能把 constructor 成功当成生产验收。
  真实 `prepareNativeBlockGenerationTaskV1` 接口测试复现 package 主体在视觉代理
  被误要求存在于全局 Registry 的拒绝。现代理按来源核对：registered 使用同一
  Subject projection owner 的已归一化视觉部件与 Registry lock；package 使用 Host
  编译后的 normalized Definition hash 和 WRT lock。已有资产 inventory/内容/边界
  校验继续保留，正式调用仍先解析 WRT、冻结确切 bytes 并绑定 Request/Attempt。
  不新增一次 WRT 预检来改变原诊断顺序，也不把 Registry 主体新增归一化 Hash 等式
  升为普通生产门槛。原 G Bot、registered primitive、package primitive、package rigged
  四类都已通过实际 Request/Proxy 准备；这不是模型生成或完整 Package/Capture 验收。
  接入还纠正 C1 输入类型过宽：仅要求实际使用的 Subject/Anchor 字段，不再要求
  Native 提供无关的 Canonical `placementProvenance`。Canonical 传入同一筛选后的
  数据；既有三组 WRT/Scene Hash 回归继续通过，未伪造布局或另一 Scene Source。
  证据：首次新接口模块缺失；实现后 package 两类在旧 Proxy 拒绝，修复后首组三类
  3/3；回归发现重复 WRT 解析提前覆盖既有资产诊断，已恢复原顺序。编译器/Request
  两文件随后 89/89。新增/加强的四类准备、未知/不可用主体、schema/accessor、
  形状变更与错误 package lock 共 10/10；测试中带 contentHash 调用 body constructor
  的夹具错误已修正，未修改 Runtime parser。原 Package-owner 定向回归 1/1。
  各轮有重叠，不累计为整仓覆盖。最终 typecheck、Canonical portable checker drift、
  Node 语法、3C migration 与 diff 检查通过；Native checker/冻结副本未变。
  workspace-boundaries 仍失败于此前相同 8 处私有跨包引用，本批无新增；不能报告全仓通过。
  **共享 Subject projection 已服务现有 Proxy，但 `run-production.ts` 仍读取固定
  Cloud Ridge Host closure。** C2B 的显式主体意图来源、实际生产替换、全成本与最终
  Package/Capture/resume 接线尚未完成。无付费任务、新真实 Browser/模型 Case、最终
  本地 Case、全仓 CI 或独立审查；全部 CF 完成并对齐旧链后才运行最终本地生产 Case。

- CF-12/M-C2B-D 主体设计到 Host 定义转换（2026-09-06，输入 `12fb6227`，
  main-agent-only）：新增 `native-composed-subject-definition.ts`，接受完整 primitive/asset
  部件与 static/rigged 绑定的 typed design，生成 C2A 可消费的 PackageSubjectDefinition。
  复用当前 Authoring visual-part 类型与 validator；不恢复旧 Block World Scene DSL，
  不复制 normalizer/Runtime compiler，不依靠名字选择模型，也不让设计者指定任意
  Physics/Capability/Camera profiles。保留旧 `1e-9` 量化、support-center、白膜外观、
  Collider include/exclude、静态派生/骨骼 Collider、Rig/Animation、全部固定 profiles
  和 `block-world-composed` 语义标签。此函数不是原始 JSON ingress parser，尚未启用
  新生产输出文件或更改 Native Skill/Request/Attempt/checker；没有新增普通生产 gate。
  对照方式：从固定 `9e35ab53c634acaef8c53a33082fff77653f7bbb` 的
  `packages/block-world-compiler/src/compile.ts` 提取并执行原始量化和
  `compilePackageSubjectDefinitions`，给旧函数同一组等价输入，比较完整 canonical
  Definition。primitive 和 rigged 均完全一致；Hash 分别为
  `sha256:a84f80b27bd08ff0fb6c5e5225f155b9fa02ae2fe5e8e3c7f9f9d26b4a918ba0`、
  `sha256:934d6eb2626feb4dec4d0fa122f56fa36eec8cd519baf1c3fa59fd27466d697b`，
  已固定到回归断言。首次对照脚本因 VM 跨 realm 原型被 canonical JSON 拒绝；改为
  仅对旧函数 JSON 输出做 JSON 序列化后比较，未改生产 canonical JSON owner。
  验证：初次 RED 为模块缺失；新增测试误传 Proxy bytes 而非 bytes hash，修正夹具后
  定向 4/4。补齐四种 primitive、asset 位移/旋转/缩放、refs、accessor/非法数值、
  输入/输出隔离及两种设计到实际 Native Request 准备，最终
  `pnpm exec vitest run scripts/reconstruction/generation-request.test.ts --maxWorkers 1`
  **55/55**、`pnpm typecheck` 通过（exit 0）。没有修改已有 Host port、Runtime、
  Skill 或 portable checker，因此不重跑这些未失效证据；没有全仓 CI、独立审查、
  Browser/模型或最终本地 Case。**C2B 实际生产激活仍未完成**：必须在同一 Builder
  任务内生成主体提案，由同一 Host 编译/重放，并一起迁移前置固定 Bootstrap 身份与
  后置编译闭包的 Request/Attempt/Package/Capture/resume 消费者；不得后改冻结请求。

- CF-12/M-C2B-S 共享设计合同与 Host 入口（2026-09-06，输入 `b007a2e4`，
  main-agent-only）：Authoring 新增闭合的 `SubjectDesignV1` registered/composed schema、
  validator 与 `ComposedSubjectDesignV1`；形状、变换、资产/骨骼字段直接引用现有 Subject
  schema。删除先前 script-only design type，不留 alias。组合转换和
  `compileNativeSubjectHostClosureFromDesignV1` 共同消费此合同，后者经同一 C2A 构造器
  产生 WRT/Gameplay/资源锁，并已用于两种组合设计的实际 Native Request 准备测试。
  未知/不可用 registered 主体、额外 profiles/Runtime 字段、字符串数值不被替换或默默忽略；
  所覆盖的 throwing accessor 不执行。共享 schema 不解释名称或 movement 文本。
  源码核对补回了旧 `9e35ab53:packages/block-world/src/check.ts:88-152,591-608`
  的组合主体 policy：1–48 部件、唯一稳定 ID、非空文本/tags、普通 human/biped 纯 primitive
  高度 1.6–2.1m、asset 单轴最大 1.25 与旧 `1e-8` 容差/旋转量测。共享 Authoring 128
  部件上限不是 Native 旧 policy；Host design 入口在同一编译路径、量化前应用旧 policy。
  这没有新增 pre-Planner/pre-Builder gate，生产入口仍未切换。此前两个 Definition golden
  的 dotted part IDs 只证明转换函数，不证明旧 checker 准入；新实际设计准备夹具改用旧规则
  允许的 hyphenated IDs，未改旧 golden 来掩盖范围差异。
  验证：共享接口初次 RED 为 missing function；AJV 引用旧条件片段丢失 object 类型上下文
  后，改为带显式类型的 wrapper 引用相同字段约束，未放松 strict mode。Authoring/Request
  首轮 82/82；新增 Host 路由后 Request 56/56。旧 policy 两个 RED 复现“应拒绝却被接受”，
  修复后设计/实际准备定向 4/4。直接执行固定旧源码 helper 和原 composed-scale branch，
  28 个边界样本的诊断分类完全一致（18 accepted / 10 rejected）。最终 Request 全文件
  **59/59**、typecheck、portable checker drift 与 3C migration（11 entries / 39 live
  references / 10 authority invariants）通过（exit 0）；各轮覆盖有重叠，不能累加。
  Authoring 原 27 项证据输入未再改，Native/Canonical portable checker 与冻结副本未变。
  **Native authoring 实际生产字段、派发/输出冻结、Package/Capture/resume、movement 选择
  与整包成本接入仍未完成**；不提前更新 Skill 宣称新主体已经可用，也不使已接纳新提案被旧
  G Bot 静默覆盖。没有真实 Browser/模型任务、最终本地 Case、全仓 CI 或独立审查。

- CF-12/M-C2B-H/R/G 生产主体接入检查点（2026-09-06，输入 `44897be3`，
  `codex/cf-production-effect-closure` 未提交工作树，main-agent-only）：Native authoring
  现要求 `controlledSubject`，同一 Builder 任务提出 registered/composed 设计。派发前只冻结
  `subject-host-context.json` 与已知 Bootstrap/预算；删除生产入口的固定 Cloud Ridge
  Gameplay/WRT/proxy 输入。self-check、辅助投影及 Host Package 用同一输出设计、同一冻结
  Registry 和已有 Normalizer/Compiler 生成真实主体，不保留 G Bot 缺省替代。
  世界 ID/seed/Spawn 输入不变；相机起始值核对 `9e35ab53` 为 pitch `0.12`、distance `5`、
  targetHeight `1.25`、FOV `56`。三份 Source、两张 advisory PNG、原任务内修复预算和
  Check/Ground/Package 时序不变；Native Module 不创建 Subject/Physics/Camera。
  Run/journal/repair/恢复将输入侧身份改为冻结资源上下文 Hash，输出侧仍绑定实际编译 WRT、
  Gameplay、Subject、proxy 和 Package。已有输出不能通过修改冻结上下文继续恢复。
  冻结资源通过 Registry 原 parser 重建并逐行验证 contentHash；编译/proxy 必须显式接收
  Registry，不在便携工具中携带另一个默认资源目录。

  C2B-G 的实际 composed 旅人 Package 回归先 RED：Ground 按 Capsule 尺寸反查命名
  Collider Profile，拒绝合法 `derive` 主体。现 Canonical 与 Native 共用 Compiler
  `compileSubjectTraversalLockV1`，Lock/Envelope 以唯一 `colliderSource` 闭合 union
  记录真实 profile/derive 来源，删除 Native 尺寸反查及重复资源锁构造。保留实际 Capsule、
  物理坡度/步高、Ground 策略与资源完整性；不伪造 Profile、不跳过 Ground、不新增数值门禁。
  规范化主体资源只在本次 Host 编译中传递，不作为第二个 Runtime/Scene 产物发布。

  已有定向证据：真实 Host Check/Ground/Package 的 composed 与 registered 两项通过；
  Compiler 与 Recast/Generation Request 四文件 91/91，Ground/锁/验证消费者六文件
  126/126，派生主体真实 Havok tick/Reset 和伪造资源来源两项通过。Runtime 全文件首轮
  46/52；派生测试初始 Camera 提交夹具修正后定向通过，另五项 ceiling/oriented-support
  测试在初次 Camera query 即失败，尚未排清，归 CF-04 联动未关闭项，不能称 Runtime
  整文件通过。Native Skill 首轮 68/68；随后去除默认 Registry 的 bundle 变化，定向
  重建/像素/冻结副本/Runtime 字段注入等 7 项通过，余下文案测试变量名修正后 1/1 通过。
  生产入口全文件 48/48：夹具已删除固定 Cloud Ridge 副本，明确证明损坏的退休 Registry
  文件不再参与新生产输入。最终 typecheck、Planner/Canonical bundle drift、diff check
  通过。3C 曾因两份便携 bundle 带入内置目录中的状态字段而计数增加；删除隐式默认
  Registry 并裁剪仅转导出的 barrel 后恢复 11 entries / 39 live references / 10 authority
  invariants，通过的是原 gate，未修改 ledger 阈值或结构断言。
  收尾还保留了原 Native Ground 对实际 locomotion Capability ref/Hash 的检查，公共
  Compiler 同时覆盖 profile/derive 主体的 stale capability 负例；该文件最终 11/11。
  各轮回归有交集，不累加成全仓数量。多运动模式选择、整个世界加主体资源成本、完整
  Camera/效果与恢复故障矩阵仍未关闭；没有真实模型/Browser Case、全仓 CI 或独立审查。
  所有 CF 实现及旧链对齐完成后，才运行最后的本地真实 Case；本检查点不关闭 CF-12。

- CF-12/M-C2B-M 与 CF-04 夹具跟进（2026-09-06，同一 `44897be3` 未提交工作树，
  main-agent-only）：前一检查点的五个 Camera query 失败已定位为测试夹具自身断链。
  ceiling/oriented-support 两个 helper 抬高了 layout Spawn anchor，却保留旧 Subject
  初始出生高度。新增一致性断言先 RED，随后只同步这两处 fixture 的同一出生位置，
  六项定向 GREEN，Runtime 全文件最终 53/53。支撑几何、相机参数、生产 Runtime 和
  原有断言未修改；这不是整个 CF-04 相机效果/插值完成。

  对拍 `9e35ab53` 发现旧 Builder 的同任务自检已检查全部 Brief movement modes。
  当前 registered/composed 只会步行却接纳“飞行＋步行＋自定义墙面行走”的两个 RED
  已修复：冻结 Registry 下实际编译成功后，按旧 capability ref 映射生成 executable
  modes；composed 保留仅 ground-walk。self-check 与 Host Package 使用同一比较函数，
  报告有序 requested/executable/missing 模式；不取第一项、不按形状/名字猜能力、不
  添加模型任务、提前派发门禁或修复预算。既有 Brief/Source/资源 Hash 继续绑定输入输出。

  定向三文件 21/21；Host Package 两项通过，分别证明生成端遗漏时仍按冻结 Brief
  拒绝缺失运动能力，以及合法 composed 主体仍通过真实 Check/Ground/Package。
  typecheck、原 3C（11 entries / 39 live references / 10 invariants）与 diff check
  通过。完整 Native Skill 回归最终 70/70，包含重建、原像素 golden 和冻结副本；四份
  live/frozen 文件另行逐字节一致。标准 underwater 模式及生成阶段诊断传递补测两文件
  7/7（与前述定向回归有交集，不累加）。Skill Python quick validator 因缺少 PyYAML
  无法执行；Node YAML frontmatter/placeholder 校验通过，不冒充 Python validator 通过。
  旧 catalog 对 registered ordinary-human primitive proxy 的 Hosted-only 排除与
  Builder 可用目录呈现仍须继续对齐；本批不关闭 C2B-I、CF-12 或整体 CF。
  未运行真实模型/付费 Case、Browser、全仓 CI 或独立审查。

- CF-12/M-C2B-C Hosted 目录与选择策略（2026-09-06，`44897be3` 后同一未提交工作树，
  main-agent-only）：对照 `9e35ab53:scripts/lib/agent-authoring-catalog.ts:198-209`，
  registered ordinary human/biped 必须同时有 asset visual 和 rigged binding；原始
  primitive humanoid 是 SDK fixture，不是 Hosted 人物替代。旧误放行已 RED→GREEN。
  该条件仅在共享 `checkNativeSubjectHostedSelectionV1` 的任务自检/Host Package
  选择层实施，先报告目录不可用再比较模式；SDK Registry/Normalizer/Compiler 没有
  加入此限制，composed human 与 non-human primitive 仍可使用原编译能力。

  原 `subject-host-context.json` 增加 compiler-derived `authoringCatalog`，在派发前
  提供 admitted/rejected rows、实际 executable modes、Collider、Camera context 与
  visual-review cuboids。资源仍保留全部 SDK 定义；当前 30 refs 得到 23 admitted、
  7 rejected，不把“资源存在”冒充“Hosted 可用”。解析器从同一冻结 Registry 校验
  目录，实际输出选择仍走同一编译器，不消费目录作为 Runtime 真值。没有增加输入
  文件、Source 输出、模型阶段、自动 Subject 选择或修复次数。自检报告当前唯一字段
  为 `subjectSelectionDiagnostics`；旧临时 `subjectMovementDiagnostics` 及函数名
  已从 live/frozen 消费者删除，历史 Run 不重写。Skill 说明与冻结副本同步。

  首次逐次重编译目录导致 Generation Request 的 5 项测试超过原 5s 限时，未放宽
  测试或生产时间参数。现用所有资源 ref/contentHash 派生的唯一 key，缓存一份
  canonical JSON；每个调用者获得独立解码数据，Registry 字节验证仍先执行，依赖
  Hash 变化重新编译。局部计时冷读约 370ms、后续读取约 38ms；原 5 个超时用例
  定向 5/5 通过。缓存隔离/Camera 依赖变化的新增回归最初选到无消费者 Profile，
  改为实际 admitted row 的 Profile 后 1/1 通过；该修正仅测试夹具。

  已有证据：全目录 ref 覆盖、每行实际编译 Hash/Collider/Camera 与篡改负例通过；
  Generation Request 缓存后全文件首轮 61/62，其余一项为上述修正后 1/1；Run 全文件
  76/76，包含生成/Package 诊断原因保留。真实 Host Package 定向 3/3：拒绝普通人形
  fixture、拒绝缺失运动能力、接纳完整 composed Subject。Native Skill 首轮 71/71；
  缓存变更后的便携重建/原像素 golden/冻结副本及选择回归最终 7/7。最终原 3C
  （11 entries / 39 live references / 10 invariants）、typecheck 和 diff check 通过。
  Python Skill quick validator 仍缺少 PyYAML，
  Node YAML/frontmatter/placeholder 校验通过，不冒充 Python 校验。
  本批只闭合 Hosted 目录子项；完整 CF-12、CF-04 相机效果、整世界加主体预算及其他
  CF 继续开放。没有真实模型/付费 Case、Browser、全仓 CI 或独立最终审查。

- CF-04/R2 相机恢复参数（2026-09-06，`44897be3` 后同一未提交工作树，
  main-agent-only）：对照旧 SpringArm 的逐 Tick 递推，移除 current adapter 额外的
  0.12s clear hold、0.24s half-life 和 3m/s 上限。现在遇障立即收回、首个 clear tick
  按 Profile 原配置速度线性恢复；复用唯一 Hard Decollider 的现有线性分支，
  V2 query、紧急姿态验证、Snapshot/Reset/Rollback 不变，不新增生产 gate。
  修改前六项 RED；修改后 SpringArm/Preview/Hard Decollider 三文件 54/54，覆盖
  0/2/6/20m/s、零时长及 30/60/120Hz 类步长、斜向/平移相机臂、障碍移动/消失、
  目标臂长缩短和回滚重放。typecheck、diff check 通过。原设计首轮建议已注明
  此次默认恢复策略修订，不把建议参数当作验收值。
  仍有明确 Director 顺序差异：旧链先碰撞再位置缓动、收缩时绕过该缓动；current
  先缓动/transition 再做最终碰撞查询。须继续做 Director 级复现与当前安全提交边界
  的对齐，不能用本批 adapter 轨迹测试宣称完整相机恢复或 CF-04 完成。
  无 Browser、真实模型/付费 Case、全仓 gates 或最终视觉/手感验收；最后本地 Case
  仍等待所有 CF 开发及旧链对齐完成。

- CF-04/R3 Director 恢复顺序（2026-09-06，同一工作树，main-agent-only）：三组
  Director RED 复现 30/60/120Hz 步长的二次缓动；60Hz 首个 clear tick 实际仅从
  0.75m 到 0.793568m，旧配置应到 0.85m。现先解理想臂碰撞/恢复，仍收缩时不再
  叠加位置缓动；clear 后才采用并验证平滑位置。最终位置有障碍仍由同一 Hard
  Decollider 零额外时间 clamp，任一次 query 失败回滚整次更新。实际 last-safe
  pose 与名义恢复距离保留在原唯一状态内，CameraComponent 原事务一起捕获/恢复。
  无第二 owner、旧/新模式或新增质量 gate；查询常态上限 2，含紧急验证上限 3。
  首轮受影响四文件 69/71：一个旧断言要求已被替换的缓动后 query endpoint，另一个
  新测试为 0.6 浮点精确相等问题；分别改为理想臂+同一最终 Target 断言与数值容差。
  最终 Camera/Preview/Havok 四文件 73/73，Traversal Runtime 真 Havok 53/53；
  typecheck 与原 3C（11 entries/39 refs/10 invariants）通过。
  当前统一平滑 Target 未退回旧双 Target；移动目标/切换构图的数值与像素对拍、
  render interpolation 和完整 CF-04 仍开放。无真实 Case、Browser/media、全仓
  gates 或最终手感验收；最后本地 Case 顺序不变。

- CF-04/R4 移动目标位置对拍（2026-09-06，同一工作树，main-agent-only）：确认
  View Solver 与 `9e35ab53` 无差异；三个 Director RED 复现位置被额外叠加 Target
  平滑偏移。现恢复旧位置/LookAt 独立平滑，删除旧链不存在的最终名义臂长裁剪，
  原 Profile maximum position lag 不变。名义臂恢复和实际 LookAt 明确分开输入，
  但最终几何路径始终校验，包括收缩状态；最终 clamp 后由唯一 Hard Decollider
  重基到名义参考锚点，事务失败整体回滚。没有新增质量 gate、持久状态或第二 owner。
  三组 30/60/120Hz 类轨迹 GREEN；首轮四文件 77/78 的唯一失败是夹具保留 dead zone
  却假定 raw target x=10（实际 9.123082），现显式关闭该夹具 dead zone 来隔离目标
  平滑。最终 Camera/Preview/Havok/Traversal 五文件 132/132；typecheck 和原 3C
  通过。无 Browser、模型/付费 Case、全仓 CI 或最终视觉/手感验收。
  下一处已确认漏迁移：旧 CameraComponent 有 committed render-pose history 与
  render(alpha)/finally 恢复，旧 Runtime.renderFrame 调用该入口；current 均缺失，
  由 CF-04/R5 继续恢复。Profile 切换对拍、完整 CF-04 和整个 CF 仍开放。

- CF-04/R5 相机显示插值（2026-09-06，同一未提交工作树，main-agent-only）：恢复
  `9e35ab53` CameraComponent 的 committed previous/current 位置、LookAt、FOV
  buffer、reset marker、事务 capture/restore 与 render(alpha)/finally 恢复；
  Runtime.renderFrame 接回该入口。真实 Runtime RED 的 alpha=0 偏差 0.261309m
  已转绿。三个生命周期 RED 也转绿：重复 Tick 不消耗 pending reset，重绑/传送
  由 Director 已有分支通知历史塌缩，不在显示层复制运动规则。未恢复 render-time
  零时长 Director 更新，Gameplay/Camera/SpringArm 提交时序不变。
  alpha<1 最多两个只读 sphere query 验证位置插值段和实际 LookAt；失败或阻挡
  只显示 committed pose，无业务失败/repair/gate。alpha=1 不增加查询。真实 Havok
  用例验证两个端点各自安全但中间被挡时正确 Snap；并覆盖异常 finally、FOV、
  Reset、重绑/传送及事务恢复。最终六文件 145/145，typecheck、原 3C
  （11 entries/39 refs/10 invariants）、diff check 通过。无 Browser/模型/付费 Case、
  全仓 CI、独立最终复核或手感验收；Profile 切换精确对拍与完整 CF-04 仍开放。

- CF-04/R6 Profile 切换对拍（2026-09-06，同一未提交工作树，main-agent-only）：
  源码确认 Profile 切换重置 SpringArm 本就是旧行为，未删除；Orbit↔Follow 双向、
  clear/blocked、30/60/120Hz 类步长共 12 组逐 Tick 位置/LookAt/FOV 轨迹通过，
  不需要修改 Profile 参数。复核本分支 R3/R4 最终安全适配又定位一个换算缺陷：
  改变 LookAt 后把安全 5m 错限到旧 2m，较长显示臂把安全 12m 错限到名义 10m。
  两个 RED 现已转绿；同一 Hard Decollider 在最终 clamp 前准备正确空间参考，
  不推进时钟、不把未验证候选写入 last-safe，随后仍在原事务内提交/回滚。
  无新字段、查询次数或质量 gate。最终六文件 151/151，typecheck、3C migration
  （11 entries/39 refs/10 invariants）、diff check
  通过。Viewer 动画循环传递 alpha 到 Runtime 的调用链已源码确认，不冒充 Browser
  收据。完整 CF-04 继续保留多入口像素/手感验收；全部 CF 开发完成后才跑真实 Case。

- CF-15/R1 结构支撑指令纠偏（2026-09-06，同一未提交工作树，main-agent-only）：
  pinned old `9e35ab53` 的 Block checker 验证实际站立面/脚底支撑/净空，Native Profile
  的全局 root face-contact 计数本就为 warning。删除当前 live/frozen Builder Skill 和输出
  合同中“每个结构/地面填到全世界最低层”的额外要求；保留参考中的桥墩、厚度、拱洞与
  有意悬浮。不新增 floating approval/disposition、Case flag、Host gate 或修复轮次，
  不改既有 Check/Ground 算法、warning 文本/级别、阈值、参数或源输出集合。
  指令合同先 RED 后 GREEN，完整 `check:native-block-builder-skill` 71/71
  （含冻结副本一致）；六种 palette role 的 support warning 回归通过。合成低处装饰
  使其余所有 Blocks 都出现全局支撑 warning，仍由真实 Host Check/Ground/Package
  完成并保留低处装饰；原缺 Spawn Capsule footprint 负例仍拒绝，未跳过 Ground。
  新 Package 测试首轮取错通用 Check 与 Profile 证据层级，修正为观察同一次真实准备
  阶段的 checked epoch 后 1/1 通过，生产实现没有因此改变。typecheck 通过。
  CF-15 的旧 gate 提案撤销，按用户原则的指令实现及定向证据闭合；最终模型效果另计。

- CF-17/R1 视频合同纠偏（2026-09-06，main-agent-only）：
  当前单段 Seedance runner 与 pinned old 文件完整字节一致，Git blob 均为
  `f45783d1304de37a3908e76a8deffbcaf1ce5d1a`。原 CF-17 禁止 letterbox/`tpad=clone`
  并新增短片/冻结/静音 veto 的表述是增强提案，不是新旧迁移缺陷，现撤销；沿用旧
  scale/pad/fps/tpad/trim、音频流存在和最终规格检查、raw metrics/final Hash 与临时
  raw 清理时序。此原则同样覆盖 PROD-40 的 raw-admission 措辞，不以此新增普通失败。
  本地 ffmpeg/ffprobe 合成媒体 Node suite 3/3 通过，无跳过：正常规格、0.5 秒静态
  竖版/12fps/静音音轨保持旧成功规范化为 1280x720/24fps/48 帧，缺音轨仍拒绝且无输出；
  实际首/末帧的黑边与蓝色主体像素及 raw 输入字节不变均已断言。runner 未修改。
  CF-17 当前单段实现 parity 与定向证据闭合，不代表完整 Episode/实云/模型视频效果。

  上述两项之后，含开发或收尾工作的父项为 CF-04/05/11/12/13/16/20/21；
  CF-26B/31C 仍有实云/完整故障矩阵等验收义务，其他已实现项的最终验收分别保留。
  本轮未启动模型、付费生成或真实 Case；仍在所有 CF 开发与旧链对齐完成后再运行
  最后本地生产 Case。没有全仓 CI、最终独立审查或整目标完成声明。

- CF-11/12-GP1 地面策略纠偏（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：对拍 pinned old `scene-brief-v1.ts:187-200` 与
  `agent-block-builder-self-check.ts:242-300`，只有全部 movement mode 属于
  ground-walk/slide/ride/drive 时，才要求单一地面连通、middle/remote 和 Spawn→middle
  band。当前 Case 派生写死 true、Case parser 拒绝 false、sidecar parser 无条件要求
  roles/band 是额外约束，现已修正。唯一 Case 派生 helper 改为消费实际 Brief 字节，
  在首次 await 前解析；同一结果决定连通策略并绑定 Palette semantic Hash，Palette
  标签不能成为第二个运动语义来源。公开 Native caller 使用同一次读取，不保留旧 hash
  参数别名。四个消费者（portable checker、authoring binding、Package、Ground）显式
  传递冻结布尔值，无缺字段 fallback。false 可为空证据，但任何已声明行仍检查，ground
  Spawn 的实际 footprint/支撑/净空不豁免；未实现运动仍按既有 Subject 能力诊断拒绝。
  live/frozen Skill、输出合同及实际生成指令同步，不增加模型阶段或修复预算。
  Case policy 矩阵覆盖 8 种单 mode 及有序 ground/mixed 组合；四文件初轮 108/109，
  仅旧颜色夹具使用伪 Brief Hash，改为真实语义 Hash 后 preparation 11/11。
  Native 入口旧源码断言同步字节输入接口后 9/9。真实 Host Check/Ground/Package 的
  合成正反例 1/1：空证据完成并保留 Case 字节；相同 false 策略的窄 Spawn 仍拒绝。

- CF-11-GP2 探索锚点数量纠偏（2026-09-06，同一工作树，main-agent-only）：
  pinned old Block checker 的 256 限制只约束每条 band 的 waypoint，不限制总锚点数。
  新 parser 与 Ground 各自的 256-target veto 经两个 RED 复现后删除；portable checker
  也先复现相同拒绝。最终 metadata/Ground 两文件 41/41，257 个有效锚点全部检查通过，
  第 257 个无支撑仍失败，单 band 257 waypoint 仍拒绝。既有唯一性、真实 Ground
  算法、几何/输出字节/地面 cell 预算、普通生产成功标准不变。
  两项最终 bundle 已重建并同步；四工具临时目录重建字节一致 1/1。完整 Native Skill
  初轮暴露公共 fixture 缺布尔值，修正后末轮 72/73；唯一剩余颜色修复用例另建的 Case
  也漏同一字段，只补该夹具后定向 1/1。其余 72 项不受该局部夹具修改影响，不重复跑，
  也不把跨轮结果称为一次 73/73 aggregate。新增 optional/257-anchor 用例、renderer
  重建与 live/frozen drift 均在这 72 个通过项内。最终 typecheck、diff check 通过；
  GP1 Host port 变更的 3C ledger 为 11 entries/39 refs/10 invariants 通过，GP2 未改该输入。
  本轮未提交/合并、未跑模型/付费生成/真实 Case、全仓 CI 或最终独立复核。
  CF-11/12 父任务及 CF-04/05/13/16/20/21 仍开放；继续保留完整主体/世界预算与其他
  旧链一致性工作，全部开发完成后再运行最终本地生产 Case。

- CF-12/20-B1 旧源预算计算与唯一判定 owner（2026-09-06，`44897be3` 上同一
  未提交工作树，main-agent-only）：源码确认 Native 当前 `resourceBudget` 在准备、
  Package 和验证路径约束的是静态 Collider Contribution；不能直接把
  256/65536/131072 解释为世界加主体的总预算，也不能用旧世界预算放大这些准入值。
  pinned old Block Compiler 的上限是 `max(200000, BlockCount*24+150000)` vertices、
  `max(300000, BlockCount*12+200000)` triangles、`solidClusterCount+32` Colliders；
  实际源成本按合并后 runtime cluster 的 24/12、真实编译 Subject cost，以及旧基础
  4/2/1 计费。直接把每个 Block 算为一个簇会更严，不能这样恢复普通 gate。
  当前 Compiler 的原预算判定抽为唯一 `evaluateCompiledWorldResourceBudgetV1`，
  Canonical 继续消费同一阈值、顺序、错误码、文案和 inclusive 边界；Native production
  budget 模块新增精确旧公式，显式接收已证明的 Block/cluster 数与编译主体成本。
  没有生成基础几何/Collider，没有新增输出或激活 Native 总预算 gate。
  新公式 9 RED→GREEN，连同 Compiler 全文件最终 57/57；实际注册、重资源注册和组合
  Subject 接入该计算的定向 3/3。Registry 只读编译核实 23 个可选注册主体中最高为
  xier120.tracked 的 172536 vertices / 57764 triangles / 1 Collider：8000 Blocks
  的两个合并簇可通过旧上限，误算为 8000 簇会变为 364540 > 342000 的失败，已锁回归。
  四工具 bundle 已重建、Native 冻结副本同步；Native Skill 的 live/frozen、renderer
  重建与便携正例 3/3，Planner/Canonical 无仓库依赖图运行 1/1，Native 入口 9/9。
  最终 typecheck/diff check 通过；新增测试已入 contract 清单，census 为
  475 files / 432 contract / 43 resource-heavy；3C ledger 11 entries/39 refs/10 invariants。
  各层单独记证据，不冒充 full CI。B2 的 Native→旧簇分组对应与 Builder/Host 接入
  仍未完成：Native palette role 无法唯一恢复所有旧 preset/interaction 分组，不能猜。
  计划已记录该 helper 在最终候选前必须接入已证明的生产者或删除，不保留无期限迁移路径。
  CF-12/20 及其余父项仍开放；未提交/合并、未跑模型/付费 Case 或最终生产验收。

- CF-05/S1 Capture 启动失败 flight evidence（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：开始开发 CF-05。旧 flight recorder 默认保留 200 条事件；
  当前先接入已有唯一 Capture startup watchdog，不复制旧 Runtime 私有字段或原始
  provider/error 文本。既有启动失败附加闭合、不可变的 trace，记录允许的阶段/phase/
  revision、单调耗时和 transient-navigation 事件；最多 200 条并显式记录截断数量。
  parser 校验枚举、顺序、预算、数量与字段，未知 Browser metadata 只从诊断投影中
  省略，不成为新 gate。180s/45s/250ms 默认时序、原错误码、导航重试及成功条件不变；
  非 navigation probe exception 保持原对象，不发明可重试语义。Native Hosted cleanup
  通过既有 error cause 链保留证据；Canonical CLI 已消费同一 watchdog。
  三个新用例先 RED，随后补齐 hung/late probe abort 与具体 Hosted 清理回归，最终
  watchdog/Hosted 两文件 57/57；覆盖超量截断、闭合解析负例、脱敏、并发会话隔离、
  输入及失败后快照不变、零新增 Capture/retry。初轮 typecheck 仅发现新测试的模拟
  Browser 类型缺适配，沿用现有 harness 适配后最终 typecheck 通过，diff check 通过。
  没有改 Runtime 状态、Snapshot/Reset/Replay、模型任务、正式 receipt 或生产准入。
  S1 仅覆盖启动失败错误链，尚未形成 session-bound 持久导出，也不覆盖运行阶段采样；
  CF-05 的完整 Runtime/Capture 诊断及 Reset/Replay 隔离验收仍开放。其他 CF 父项
  状态不变；未跑真实/付费 Case、全仓 CI 或最终独立审查，未提交/合并。

- CF-05/S2 请求绑定的启动诊断持久化（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：现有 Production Run 的 Capture port 在正式 Request
  已 materialize 后，从有界、去环的 typed error cause 链取 S1 trace，再经同一 parser
  准入诊断数据；复用原 immutable publisher，将 Case ref、Attempt/Host recovery
  index、Formal Request Hash、Package root Hash 与 trace 写入当前 Host output root
  的 `capture-startup-diagnostic.json`。诊断在 Capture/Package 目录之外，不作为准入
  receipt、passed checkpoint 或重试授权。模式 0600、realpath 目录检查和原子 no-overwrite
  发布沿用现有 owner；旧文件、符号链接、目录冲突或存储失败不掩盖主错误、不修改清理
  结果。原始 Error/provider 属性不被序列化。
  新增正例先 RED（ENOENT），接入后新建/既存/符号链接/目录四种情况通过；恢复用例用
  实际 Host checkpoint owner 与模拟 Package/Capture ports，复用已完成 Generation，
  仅写 `host-recoveries/1`，原诊断与 Source 保持不变，零重新 prepare/生成提交。
  最终 production-run-ports 全文件 34/34、typecheck、diff check 通过。S1 输入未改，
  沿用上一轮 watchdog/Hosted 57/57，不重复运行。这里不是实际 Browser/几何验收。
  CF-05 仍缺运行阶段采样和完整 Reset/Replay 隔离；其他 CF 状态不变。未跑真实/付费
  Case、全仓 CI 或最终独立复核，未提交/合并；整体目标保持开放。

- CF-05/S3 Viewer 运行阶段观察（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：确认当前 RuntimeHost Reset 发布新的 world session；以既有
  BabylonWorldAdapter 的只读 Snapshot、worldSessionId 和闭合 frame/reset 失败码为输入，
  接入 app-owned flight observer。沿用 pinned-old 的 1000ms 采样、300 样本、750ms
  heartbeat、2000ms frame/Tick stall 和低于 15 FPS 的诊断阈值；不控制暂停、渲染、
  Tick、Reset 或重试。仅导出闭合数值指标、健康枚举、诊断 UUID 与 observation epoch，
  不导出原始异常/provider、实体名称/位置或内部 world-session 字符串。新 session 或
  计数回退开启新观察段，不成为第二套 Runtime Reset/Replay 状态。
  `window.__WORLDKIT_RUNTIME_DIAGNOSTICS__` 提供只读 report/JSON；安装失败不阻断
  页面，rollback/disposal 清理自身 timer/API。单元 5/5 覆盖阈值/截断、parser 负例、
  脱敏、并发隔离、快照不变和异常/清理。实际 RuntimeHost + 模拟 provider 的观察/未观察
  对照 1/1，通过固定输入、Reset 和重复输入比较 worldStateHash，采样前后完整 Snapshot
  Hash 不变；这不是实际 Browser/物理验收。初轮 typecheck 发现测试为可选 API 显式赋
  undefined，改为正确的可选字段形状后最终通过。新增测试已纳入 gate manifest，census
  476 files / 433 contract / 43 resource-heavy；diff check 通过。
  本轮只接 Playground Viewer，独立 Native Capture iframe 的运行观察与有界持久导出
  尚未完成，后续必须适当共享 owner，禁止跨 app 私有导入或复制第二份 recorder。
  CF-05 及其他开放父项仍不结项；未跑真实/付费 Case、Browser、全仓 CI 或最终独立
  复核，未提交/合并。最终生产 Case 仍在所有 CF 开发与旧链对齐之后运行。

- CF-05/S4 共享观察器与 Native Capture 接入（2026-09-06，`44897be3` 上同一
  未提交工作树，main-agent-only）：将 S3 实现及测试移动到 `runtime-babylon`，删除
  app 私有副本并更新单一包出口、Viewer 消费者及测试清单；不保留 alias 或跨 app
  引用。读取输入不再依赖 Playground 类型。Native 的 `initialSnapshot()` 源码确认
  是当前 Host/Runtime 投影；只读取实际 Tick、session 和 phase，未公开的 frame/FPS/
  triangles/draw calls 显式为 null，不能用 0 或 mesh count 冒充。样本必带 continuous/
  on-demand 模式，Viewer 阈值不变，按请求执行的 Capture 等待不误判为持续循环停滞。
  原 capture-only entry 包装层只采样 operation 边界并委托 Capture/dispose；原 payload、
  error 与 cleanup error 身份不变，诊断不可用不阻断 Capture，也无新 render loop、
  Tick、POST/retry、wire 字段或 gate。bridge 初始化失败时清理新建 entry/observer，
  保留原 bridge 错误；安装失败后即使迟到 timer callback 到达也不再读取 source。
  共享 observer、Native route/frame 首轮 31/31；补齐迟到 callback 防护后定向 9/9
  （observer 5、Native Capture 3、实际 RuntimeHost 对照 1），未重跑无关重型 Havok
  用例。最终 typecheck/diff check 通过；census 476 files / 433 contract / 43
  resource-heavy，3C ledger 11 entries/39 refs/10 invariants 通过。证据分层，不称全仓 CI。
  workspace-boundaries 检查未通过：发现现存 8 个测试跨包私有引用，涉及
  babylon-native-scene-bootstrap.test 的 app JSON fixture、world-bounds-policy.test、
  evaluate-evidence-set.test、native-semantic-geometry.test/support；本轮观察器没有
  私有跨 app 引用。最终候选前必须修复这些测试所有权引用，不放宽检查。
  CF-05 仍缺 Capture 清理前运行历史回收/持久化、Viewer 有界持久历史/导出及 Browser
  验收；其他 CF 父项仍开放。未跑真实/付费 Case、Browser、全仓 CI 或最终独立复核，
  未提交/合并；最终生产 Case 仍在所有 CF 开发与旧链对齐之后运行。

- CF-INTEGRATION/TB1 测试所有权边界修复（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：S4 发现的 8 处 private-sibling 引用现已全部修复。
  Native Profile 的公共类型/形状改用 root/shapes 出口，checker/layout/session-record
  测试访问复用现有 testing subpath；既有 Formal Capture harness 同样由 runtime-babylon
  testing 出口提供，不复制实现。Runtime Contracts 的 Native Bootstrap 测试不再读取
  Playground 发布产物；将本包 world-runtime-bootstrap 测试已有数据 factory 抽到
  `world-runtime-bootstrap.test-support.ts`，两份测试共用。只读比对确认 fixture 数据
  与 helper bodies 除入口函数重命名外和 HEAD 逐字节一致，原断言保留。
  原边界 checker 未修改；最终 workspace-boundaries 为 0 registered debt entries /
  2193 public symbols 通过，census 476 files / 433 contract / 43 resource-heavy 通过。
  Bootstrap/Native Bootstrap/World Bounds/Native semantic geometry 四文件 57/57，
  Capture harness 直接消费者定向 1/1（其余 24 项未重跑），最终 typecheck/diff check
  通过。新 test-support 不是新测试 lane，也没有 production 算法、准入阈值或 Skill
  变更。本项关闭 S4 记录的八处边界问题，不代表全仓 CI 或整体 CF 验收。
  CF-05 的运行历史持久化及其他 CF 父项继续开放；未启动真实/付费 Case、Browser、
  全仓 CI 或最终独立复核，未提交/合并；最终 Case 仍在全部开发与旧链对齐之后运行。

- CF-05/S5 Capture 运行历史回收与落盘（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：Concrete transport 在清理前读取共享观察器导出；复用现有
  loopback/frame marker/session/nonce/Request Hash 帧匹配，不新增 ready 或准入条件。
  浏览器与 Node 均限制 256000 UTF-8 bytes，容纳完整 300 条长数值样本，随后使用唯一
  closed report parser。读取加保存共享既有 watchdog 一个 250ms poll interval 的诊断
  等待上限；Capture 120s 执行期限、启动预算、清理顺序、原错误和 typed retry 不变。
  这至多增加有界诊断清理等待，不是新生产 gate；无 sink 时仍直接走原清理路径。
  缺帧、错帧、坏数据、超限、读取/保存异常或挂起均不改业务结果；超时后到达的 read
  不再调用 sink，已开始的不可覆盖写入可能在期限后完成，不阻塞后续生产判定。
  Run owner 通过 Formal Capture 默认 starter 接入 callback，校验 Request/Package
  身份和有界安全 session ID 后，复用既有 immutable JSON publisher 以 0600 写入当前
  Attempt 或 Host recovery 根目录的 `capture-runtime-diagnostic.<runtimeSessionId>.json`。
  文件绑定 case/attempt/recovery/Request/Package/session/report，位于 admitted Capture
  之外；不同 transport session 分文件保留，旧文件/符号链接/目录均不覆盖。
  新落盘回归先证实缺少 callback 的 RED，再接入；旧 transport 夹具的假时钟和 payload
  层级问题另行修正，不把夹具错误称为业务缺陷。三文件完整回归 110/110；随后针对
  长数值容量、字节边界和固定 Package 身份读取修正，最终相关 CF-05 定向 26/26
  （其他 62 项未重跑），typecheck 通过。覆盖原 Capture 失败身份、迟到/hung read、
  hung/failed sink、一次清理、默认 starter 转发、真实文件权限/不覆盖、错身份和 recovery
  隔离；恢复夹具保持 Source 字节且 generation 不重提。此处 Package/Browser owner
  为测试替身，不是 Browser 或真实几何/生产 Case 验收。
  CF-05 仍剩 Viewer 持久历史/导出及 Browser 验收，其他 CF 父项不变；未启动真实/付费
  Case、全仓 CI 或最终独立复核，未提交/合并。所有开发与旧链对齐完成后才跑最终 Case。

- CF-05/S6 Viewer 历史保存与 bundle 导出（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：核对 pinned old recorder，沿用 1000ms 采样、每 5 样本
  保存、观测到错误时立即保存、visibilitychange 采样及 dispose 保存。Viewer 提供同旧
  链的 recording world ID / adapter name 与可选 localStorage accessor，唯一共享观察器
  按世界保存最新 report，新页面恢复为独立的 immutable previousSession；不递归保存
  bundle 或累积历史会话。当前/前次各受 300 样本约束，仍不保存 provider、按键、位置
  或原始 Browser error/rejection 明细。旧 provider-specific schema 不恢复为 fallback。
  使用 current-only `worldkit.runtime-flight.v1.<encodedWorldId>` 存储名；与 Capture 共用
  256000 UTF-8 bytes 读取上限和 closed parser。storage getter/read/write/quota 异常、
  坏/超限历史不影响内存观察与世界启动；旧观察器不覆盖新实例的 global reader/历史，
  dispose 删除自己的 timer/listeners。Browser error/rejection 只触发保存，不变成重试。
  原 `report()/exportJson()` 继续只返回当前报告，Capture 消费合同不变；新增只读
  `bundle()/exportBundleJson()` 明确导出 worldId/currentSession/previousSession。
  新回归先 RED 后 GREEN。共享观察器、Native route、Capture transport 三文件 69/69；
  持久化与 error/export 开启后的真实 RuntimeHost 对照 1/1（同文件其余 13 项未跑），
  证明 committed Snapshot Hash、固定输入、Reset、重复输入 Hash 与无观察器一致。
  此 RuntimeHost 测试使用 fake provider，不冒充 Havok/Browser；最终 typecheck 与
  workspace-boundaries（0 debt / 2195 public symbols）通过。Viewer `pnpm build` 通过
  （2323 modules，1m03s；存在大 chunk advisory warning），不等于 Browser 验收。
  CF-05 仍需用户可操作的导出 UI 与 Browser 验收；其余 CF 父项保持开放。未启动真实/
  付费 Case、全仓 CI 或最终独立复核，未提交/合并；最终 Case 仍在全部开发对齐之后。

- CF-05/S7 Viewer 操作入口与 Browser 证据（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：增加只读“运行诊断”菜单，接共享 observer 的手动采样并立即
  保存、摘要复制及原人工 prompt 回退、完整 current/previous bundle 下载。复用 Viewer
  JSON 下载器，诊断保留旧 10000ms URL release delay，其余调用仍默认 0；不增加
  Gameplay event、Runtime 控制、生成/重试任务或生产 gate。控件在 ready setup 后显示，
  rollback/exit 先撤销 UI，再销毁观察器；迟到的 clipboard 回调不触碰已销毁页面。
  控件和观察器测试 17/17、typecheck 通过；census 477 / 434 contract / 43 heavy，
  workspace-boundaries 0 debt / 2195 symbols；最终 Viewer build 2324 modules / 2m02s
  通过（大 chunk advisory warning），diff check 通过；没有全仓 CI 或最终独立复核。
  使用当前工作树 5197 dev server 与隔离浏览器验证真实 Babylon/Havok curated Viewer：
  ready、非空画面、无框架 error overlay；初次 favicon.ico 404 非 Runtime 错误，刷新
  后 console error 为 0。实际点击手动记录/下载，下载的 65 样本 JSON 通过共享 parser
  和字段检查。隔离 clipboard sink 接收到真实按钮生成的摘要，不覆盖系统剪贴板；
  暂停后复制前后的 Tick/player/camera 投影相同。截图发现展开菜单被调参台覆盖，
  仅对菜单打开时提升 header 层级，修复后截图和 elementFromPoint 均证实反馈可见。
  实际 reload 恢复前次 session `948cab85-2a34-4f22-ba2a-d6d07f9cbf6c` 的 175 样本，
  当前 session 为 `2d729c5c-70bb-49bc-bea7-b215d53caf2c`；第二份真实下载含当前 122 /前次
  175 样本，两份均由同一 report parser 验证，未递归嵌套历史。证据位于本地忽略目录
  `output/playwright/cf05-s7/`，包括 `diagnostics.json`、`diagnostics-with-previous.json`
  和修复后的 `diagnostics-visible.png`；不是模型生成或最终 production Case。
  经场景选择器切换到 `feel-flat` 后真实页面 ready、worldId 为 `babylon-havok/feel-flat`、
  previousSession 为 null，证实不混入测试场历史。本轮创建的隔离浏览器和 5197 服务已关闭。
  CF-05 的 Native Capture 实际 Browser 故障/恢复证据仍需收口，其他 CF 父项不变；
  不以本次 Viewer 单入口检查宣布整个 CF 完成。未提交/合并，最终真实 Case 仍在全部
  CF 开发与旧链对齐之后运行。

- CF-20/C32 分区候选与预算测量报告（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：新增 32m Host 候选，默认仍为 4m，其 Hash 仍为
  `sha256:ace3fbc55fa0f6e13440a9a02207463aa056e7f867167e039a7cdc568f92dfee`。
  pinned old 32m 是零原点、Block 中心归属并继续按 preset/shape/交互等身份贪心合并；
  Native 是 `[-0.5,-0.5]` 原点、完整 extent 归属。边界回归保留 straddling，不把
  同边长分区数或 thin-instance 数冒充旧簇数，也未激活新的普通生产总预算 gate。
  原五个小 Corpus 仍按原规则选择 4m；新增 128m 视觉布局的确定性比较选择 32m，
  说明小 Corpus 不能证明大世界最优，但这不是改生产默认的 Browser/Physics 证据。
  现有预算 verifier 的真实 finalized admission epoch 已接单一 chunk benchmark owner，
  报告并列记录 2/4/8/16/32m 的预计成本和实际 Runtime 使用的 4m 身份；比较开销不计入
  原 admission/Package 耗时。Runtime 使用无观察回调的同一合成布局重建，准入/Package
  内容和时序不因报告而改变。真实 Case pending slots 保留，不把合成场景标为真实验收。
  新 2k Package-to-report 测试先 RED 后 GREEN，连同 workload 两文件 10/10；分区/Corpus
  两文件 11/11，optimization/materializer/collider 三文件 18/18，typecheck 通过。
  renderer 临时目录重建字节一致 1/1（其余 72 项未重跑），未改 live/frozen 工具字节；
  census 478 / 435 contract / 43 heavy，workspace-boundaries 0 debt / 2195 symbols。
  8k Node/NullEngine 合成准入与 Package 完成（约 25s，不是 Browser 性能）：按
  2/4/8/16/32m，预计绘制单元为 1200/332/108/56/20，分区峰值 Blocks 为
  16/64/256/768/1680；均为 3 个源 Collider、28480 triangles。该预计成本选择 32m，
  仍不能证明相同分区的实际 Havok/Capture 成本或旧合并效果。随后同进程 16k 在约
  4GB Node 堆上限 OOM，exit 134，没有完成比较报告；未提高堆/生产预算重试，也不把
  此次 OOM 直接归因于新比较逻辑。此前 R1 的 16k Browser 页崩溃证据仍未被替代。
  CF-20 的 B2 对应、世界总预算及完整 Browser/Havok/Capture sweep 继续开放；其余 CF
  父项不变。未启动模型/付费生成/真实 Case、全仓 CI 或最终独立复核，未提交/合并。

- CF-20/MEM1 Block 分配闭包内存修复（2026-09-06，同一未提交工作树，main-agent-only）：
  C32 之后定位到 Session `allocate()` 的长期 disposer 与错误清理 filter 共用 lexical
  environment，保留每次分配前的 Scene Mesh Set，形成平方数量的历史引用。隔离 Node
  GC/WeakRef 复现 64 个 Blocks 全部存活时仍保留 64/64 个历史 Set，先 RED；把成功分配
  的 disposer 注册移到调用者循环的局部 Mesh scope 后变为 0/64，随后 64 个 Mesh 仍可
  完整清理。仍动态调用 `mesh.dispose()`，保留逆序清理、预占 cell 回滚、部分分配错误
  和首个错误身份；不删除 rollback 快照、不绑定旧 disposer、不改几何/预算/生产 gate。
  Session 全文件 36/36（含分配/清理失败矩阵），typecheck 通过。
  同一 8k 布局修复后重测，其 profile Hash
  `sha256:f364e0a471ae554da0af4a42aee5e3c65b1fe28bf52a2e2cf2534aac5d41ca1a`、Package root
  `sha256:91039f31f631ef207ca07108cfa80bc2bd526d82c2410a455a0643a5fb0ea060` 及全部五档
  分区成本均与修复前严格相等。新独立 Node 16k 重测完成，准入/Package 约 89.3s，
  报告结束时 heapUsed 2144937496 bytes（不是峰值 RSS）；未提升堆上限。其 2/4/8/16/32m
  预计绘制单元为 2400/664/172/68/40，峰值 Blocks 为 16/64/256/960/2608，3 个源
  Collider、55040 triangles，Package root
  `sha256:856dc86bc990f728d32e944f92157d55ab93340471494a1dbbb1429e0b6e9744`。
  这证明修复与合成 Node 路径的实际进展，不覆盖原失败 Browser 页或真实 Capture/Havok；
  当前生产上限仍为 8k、分区仍为 4m。CF-20/其他父项不因此结项，最终真实 Case 仍延后。
  Native Skill 整文件本轮 72/73：renderer 临时重建在并行测量时超过原 60s；没有修改
  超时值。其后独占重跑 renderer、live/frozen、便携正例、无仓库类型检查 4/4，通过
  原边界。Native checker 的 frozen typecheck graph 包含 SDK 源码，故 C32/MEM1 后
  必须重建并同步代表 Case 副本；已用现有生成器完成，未手改生成代码。四工具 drift
  测试原先展开多 MB Buffer 差异导致长时间占用 CPU，精确停止该次自建测试进程后，
  将断言换成 Buffer.equals 的逐字节等价比较，只报告差异路径、不打印完整二进制。
  同一测试随后明确 RED 于 Native checker 的旧字节，未放宽比较或改为部分匹配；
  同步生成后四工具临时重建字节对拍 1/1 GREEN。上述是分层、跨轮定向证据，不冒充
  一次完整 73/73 或全仓 CI。最终 diff check 通过；所有本轮测量/验证进程已结束。

- CF-13/J1 严格 blocker 验收目标关联（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：原 NBR verifier 在历史/终态两个入口把 Case blocker 投影成
  colliderId 数组，丢失 contributionId/acceptanceTargetRef。现在保留同一 Case 行的
  三字段，沿用 Native contributionId=colliderId 合同，并把每个 block-plane 所属
  formal traversal check 的验收目标与该 Case Collider 义务精确关联；原 Collider 集合
  完整性、唯一 join 和 source visual group 几何关联仍保留，旧私有 ID-only 参数已删除。
  首个 J1 草稿误把 Collider 验收目标与视觉组身份目标等同，已按现有 Case parser 的
  traversal-to-Collider-role 合同纠正；不要求 Collider-only 义务创建额外视觉目标。
  正式 Case parser 接受的新正例具有独立 blocker-only target、原视觉组不变；负例覆盖
  ID/group 不变但 check target 错配，以及两个 Collider ID 全部正确却交换目标归属。
  另覆盖无 blocker 且有视觉目标、同目标多 Collider、不同目标多 Collider、未量测
  Collider、重复/缺失 join、贡献 ID 错配。多 Collider helper 数据只证明身份闭包，
  不冒充该几何的 Native 准入或实际 Runtime 通行证据。
  strict-acceptance 仍报告原 `NBR70_BLOCKER_IDENTITY_MISMATCH`；production-integrity
  的历史/终态诊断适配不变，不新增发布 veto、Case/Builder 输出、模型阶段或修复预算。
  首轮完整文件 38/39 中发布用例超过原 5s，独占重跑以原超时 1/1；合同纠偏后最终同一
  完整 verifier 文件 39/39（约 86.6s），含严格失败仍发布的真实本地文件/发布器集成。
  typecheck、diff check 通过；无全仓 CI、Browser/模型/付费 Case、提交或合并。
  CF-13 通用 Case 的 blocker 意图/接近路径/检查派生仍需与 CF-11 闭合，父项不结项；
  pinned old landmark presets 确实是 static solid，未为了过关删除其 Collider 预期。
  CF-04/05/11/12/13/16/20/21 仍开放，最终真实生产 Case 仍在全部开发和旧链对齐之后。

- CF-16/FULL-INTERRUPTION-RECOVERY（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：对照 pinned old `9e35ab53` 的 `recoverLateLwdpCodexDelivery`，
  发现当前 Native 只让显式 visual-resume 或特定失败进入原交付重放，错误挡住普通 full
  云端流程中断后的迟到交付。新增复现先 RED：产物可收尾但记录仍为 interrupted。
  现恢复旧链入口：自动恢复开启时，interrupted/startup-running Cloud 记录可交给既有
  visual owner 对账原请求并重放 Host finalizers；不创建新任务或 source Attempt，
  不更改原参数、轮询周期、重试预算、视觉通过标准或白膜 Capture。
  新矩阵覆盖完整交付、只有 PNG 旧时间戳、暂未交付后成功、启动遗留 running、取消、
  stale Run/Capture；原 alignment 失败、自动恢复禁用、重试并发和 shutdown 仍保留。
  Studio recovery/retry 34/34，轮询/现有产物负向 7/7；旧时间戳用例进一步改成所有
  报告完整、仅 PNG mtime 旧后单项 1/1。实际 visual owner 全文件 50/50，覆盖原请求/
  交付身份、同参数 reconcile-only、Host 收尾和部分发布；使用本地/假远端适配，不能
  冒充真实 Cloud 验收。syntax/diff check 通过；未跑全仓 CI、Browser 或模型/付费 Case。
  本项关闭恢复入口偏移，不关闭 CF-16 父项；真实云端恢复、完整视觉/媒体验收和最终
  本地生产 Case 仍待全部 CF 开发及旧链对齐完成后执行。

- CF-12/SUBJECT-PRIORITY 生成决策对齐（2026-09-06，`44897be3` 上同一未提交工作树，
  main-agent-only）：用户指出近期工作偏向外围工程后，暂停继续扩展严格通行验收，先回到
  直接影响生成的指令。逐段对照 pinned old Block Builder Skill 与 subject-camera
  reference：老链明确要求运动集合/身体拓扑优先、合适的完整注册主体优先，服装/武器等
  外观留给后续视觉阶段；当前 Native 却要求重建完整参考外形，缺失这一选择优先级。
  已修正 live/frozen Skill、输出合同说明及实际 task-instruction：复用合适主体并调相机，
  只有必要的运动整体/身体拓扑没有注册表达时才组合主要体块；不新增外观/组合自动 gate，
  不恢复缺失或无效选择的固定 G Bot 兜底，不改 Registry、Runtime、parser 或能力合同。
  同时将 Camera 指令中的资源引用禁令明确限定为 Camera refs，避免与注册主体选择冲突。
  Native Builder 专项完整 73/73；输入准备完整 11/11，Camera 文案最后澄清后 PNG/WebP
  实际下发两项复验 2/2；冻结副本一致、既有主体准入/拒绝和运动要求均保留。skill-creator
  Python 快检缺 PyYAML，已用现有 Node YAML parser 检查 frontmatter/命名/字段及模板
  占位符；diff check 通过。未安装依赖、未新增文字匹配测试、未启动模型/Browser/真实
  Case 或全仓 CI；这是指令迁移证据，不是模型已按指令生成或还原效果已改善的证据。
  后续区分核心效果迁移、老链配套流程及 Native 诊断适配，不将后两者自动记作还原质量
  提升。完整 CF 范围和最后真实生产 Case 仍保留，CF-12 父项不因此结项。

- CF-19/TOP-OUTLINE Builder 俯视反馈像素对齐（2026-09-06，`44897be3` 上同一未提交
  工作树，main-agent-only）：对照 pinned old `scripts/lib/block-world-visual-review.ts`，
  老链仅为投影宽和高均至少 4px 的体块描边，edge 为原色的 0.72；Native 原实现无条件
  描边且使用 0.70，会让大世界中的细小体块被暗边覆盖。已恢复旧绘制参数，不新增图像
  质量 gate。实际便携渲染器 PNG 的四个探针先 RED 后 GREEN，覆盖大/小 full Block
  及 quarter Block 两种朝向中仅一个投影轴小于 4px 的情况；不是文字匹配断言。
  入口 RGBA Hash 仍为 `sha256:ec9a8b77f1ece977738a1e360fe99df4f6145f94016415f4bd6eace728300e6b`，
  修正后的俯视 golden 为 `sha256:ab02b1e2dd3b942a8613fbab5e808ab601275b454974333b67b9c4708fb9caf6`。
  当前生成器重建 renderer 并同步代表 Case 冻结副本；受影响 Native Builder 专项 9/9
  （同文件 68 项未受影响检查未重复运行），含源重建/冻结一致、重复像素、仅 Camera
  调参时 entry 变化及 captured-layout 身份。真实 Host Package/视觉重放三项 3/3：
  正常交付可发布，RGBA 篡改及 renderer Hash 漂移仍拒绝。typecheck、diff check 通过。
  世界几何、display gap、调色板、Camera、模型预算和产物合同未改；旧 greedy clusters
  与 Native 逐 Block 几何的差异仍开放，不将本修复冒充完整渲染/模型效果等价。未跑
  Browser、模型/付费 Case 或全仓 CI，最终真实 Case 仍按全部开发和对齐完成后执行。

- CF-20/MEM1-BROWSER 补充实测（2026-09-06）：同一 `44897be3` 加未提交输入上的
  `pnpm benchmark:native-block-budget 8000` 和 `16000` 均完成真实 Babylon/Havok、90 Tick
  与截图；两份报告位于 `output/playwright/native-block-budget-1788682157860/8000.json`
  和 `output/playwright/native-block-budget-1788681929192/16000.json`，绑定相同 tracked diff
  `sha256:23dda6540531b5f2a98dfe6ed8c21be662e7eaceb080ef37d09f5747ce50733d`。
  8k/16k Runtime ready 为 12.67s/37.95s，采样后 JS heap 为 1.10/2.97 GB（非峰值 RSS），
  最终主体均 supported、无 safe fallback；Profile/Package Hash 与此前 Node 实测相同。
  旧 16k 页面崩溃未复现。测量入口改为流式哈希完整 tracked diff，修复生成 bundle 使
  `execFileSync` 缓冲溢出、尚未开始 workload 就失败的问题，未截断证据或放宽超时。
  Chromium 使用 SwiftShader，不能把其 GPU finish 时间当成真实硬件 FPS 或还原效果。
  8k 生产上限、4m Runtime chunk policy 保持不变；按用户最新要求性能优化后置，继续
  场景还原主链路。未启动模型/付费生产 Case，不据此关闭 CF-20 或完整 CF 项目。

- CF-12/19 REGISTERED-PROXY 反馈对齐（2026-09-06，`44897be3` 上同一未提交工作树）：
  pinned old `scripts/lib/agent-authoring-catalog.ts` 的注册主体 proxy 仅缩放/平移资产
  bounds 中心，尺寸按 XYZ 顺序旋转；Native 原实现把中心也按 Runtime YXZ 旋转，
  使 G Bot 的 Z 中心反号。已恢复旧 advisory 算法，用现有 Babylon quaternion/vector
  运算实现，不改 Runtime 主体、Collider、Camera 或准入；package-composed proxy 保持
  原状，不冒充全部组装/真实 Runtime 像素等价。旧 G Bot 字面包围盒先 RED 后 GREEN；
  非对称位置/缩放/三轴旋转的期望值来自实际执行旧函数，编译后 Runtime 变换不变。
  全量对照旧 catalog：22 个可用主体的选择字段/运动能力全部保留，28 个 proxy 体块
  坐标最大差为 0，7 个拒绝 ref 一致；当前额外的 `humanoid.alpha-local-actions@1`
  是 SDK Registry 资源，不替换旧条目。旧可用列表本身只有 ground-walk，不把缺少
  飞行/驾驶闭包当成必须另造能力的迁移任务，也不以名字或外形冒充已支持。
  generation-request 完整 67/67、便携 Native 工具定向 6/6、typecheck 通过；实际
  注册 G Bot PNG 与独立旧 cuboid 的 RGBA 逐像素一致，既有 composed entry/top
  golden 不变。四份便携工具重建逐字节一致 1/1；实际 Host Package 发布、RGBA 篡改
  拒绝及 frozen renderer 漂移拒绝 3/3，diff check 通过。checker/renderer 由当前
  生成器重建并同步代表 Case 冻结副本；完整
  CF-12/19 效果验收仍须最终真实生产 Case，不因这一反馈修正结项。未启动新模型、
  Browser 或付费 Case；本批前的 8k/16k Browser 数据另记于上一条。

- CF-11/BAND-DIRECTION 源意图对齐（2026-09-06，`44897be3` 上同一未提交工作树）：
  恢复旧 Ground band 的显式 `isBidirectional` 布尔值：始终检查正向，仅 true 另查
  反向。source-authored parser、immutable metadata、Host Ground、live/frozen Skill
  和当前 fixtures 同步；case-defined 原有双向含义不变，由 Host 显式投影 true。
  false 不跳过支撑、净空、Spawn、路径宽度或连通性，也不激活单向物理/运动能力。
  两个旧合法布尔值均先 RED；最终契约/Ground/manifest/Capture/semantic 126/126、
  no-script evaluation 1/1、typecheck、Native 便携专项 7/7 通过。实际 Host 曲线
  探索（含 false band 与 unsupported/disconnected 反例）及 Layout 原子发布 2/2；
  四份便携工具逐字节重建 1/1。live/frozen Skill 原版 quick validator 均通过，
  缺失 PyYAML 经用户授权仅安装至用户环境，未改仓库依赖。没有新增 gate、任务阶段、
  模型/付费 Case 或 Browser 运行；完整 CF-11 和最终生产链路仍未据此结项。

- CF-11/GP3 可选目标连通性对齐（2026-09-06，`44897be3` 上同一未提交工作树）：
  对照旧 `9e35ab53:packages/block-world/src/check.ts`，目标不可达错误应受既有
  `requireSingleReachableComponent` 控制；Native 此前仅对整图错误应用该策略，仍
  无条件拒绝每个不连通目标并要求补台阶。已在唯一 Ground owner 恢复旧条件，保留
  真实不可达计数/节点、目标支撑/净空/精确拓扑和显式 band 的独立路径要求；true
  仍拒绝目标与整图断连，不改能力、物理、图构造、Case 形状或 Host 策略派生。
  三个偏移反例先 RED；修复后 Ground 全文件 32/32、typecheck、实际 Host Package
  1/1、便携输入消费者 2/2、四份 checker 逐字节重建 1/1 通过。Host 夹具如实保留
  两目标/一可达及离岛，Case/Request 原字节不变；live/frozen 工具同源，diff check
  通过。没有新增 gate、Skill 指令、模型/付费 Case 或 Browser；不是 CF-11 父任务
  或最终生产效果验收完成。

- CF-11/GP4 探索列表顺序对齐（2026-09-06，`44897be3` 上同一未提交工作树）：
  旧 `9e35ab53:packages/block-world/src/check.ts:767-824` 只拒绝目标/路径重复 ID，
  不要求 ID 字典序；Native shared parser 原来额外拒绝两种未排序列表。两个独立
  RED 后移除这两处排序门槛，保留 stable/unique ID、坐标/Spawn/路径/策略校验，
  作者列表与 waypoint 顺序不被重排，完整绑定不可变 metadata 与 Hash。其他派生
  materializer inventory、visualGroups 和 resourceRefs 的排序约束未改。
  三个直接消费者文件 100/100、typecheck、便携 checker 2/2、实际 Host Package
  2/2 通过；后者覆盖非字典序目标与曲线路径、元数据原顺序、Case/Request 原字节
  和原有 unsupported/disconnected 负例。四份 checker 重建 1/1，Native 工具冻结
  副本逐字节一致，live/frozen Skill quick validator 与 diff check 通过。按
  skill-creator 只删除对应的多余排序指令，无新增输出/模型任务/生产 gate；未跑
  真实模型 Case、Browser 或全仓检查，完整 CF-11/最终还原效果仍未验收。

- CF-21/SPATIAL-FORM Planner 体积规划恢复（2026-09-06，`44897be3` 上同一未提交工作树）：
  旧 `9e35ab53` Planner 的三维空间推理正文已原文恢复至 Native profile：占地、纵向
  高程、截面、厚度、深度证据，以及 Brief 中上下层/跨越关系与真实楼梯端点、曲折、
  平台和支撑。此前图像约定只有体积简写，不能代替先写入 Brief 的空间决策；现有
  模板与两张图的约定同步衔接，不把示例楼梯/宫殿强加给其他输入。恢复旧 human-review
  归属，不从语义色块声称全场景覆盖，不新增 JSON inventory、输出、模型阶段或生产
  gate。原 Brief parser/hash、图片先后顺序与三轮预算未改；既有冻结执行和用户 Case
  不重写。Planner 模板/分源/launcher 及实际冻结交付测试 24/24（exit 0），新增测试
  验证完整 live Skill/两份 reference 的逐字节交付、Hash 和源文件修改后的快照隔离；
  Skill quick validator、旧空间正文逐字节对照和 diff check 通过。此项只证明规划
  要求与交付闭合，不证明生成效果或机器要素覆盖；完整 CF-21 仍开放，真实模型 Case、
  Browser 与最终全链验收尚未执行。

- CF-09/HANDOFF-EXCLUSIVE + CF-29 交接错误分类（2026-09-06，`44897be3` 上未提交工作树）：
  同事反馈的 Node 25.8.1 生产交接 EEXIST 已用官方同版本二进制复现：原有 publication
  测试在 `planner-execution.ts` 的 mkdir 后整目录 cp 处失败。保留独占目标目录创建，
  改为逐条复制源目录内容，递归/no-overwrite 选项与最终 Request/Skill/receipt 验证不变。
  Native caller 增加 `NATIVE_WORLD_PLANNER_HANDOFF_FAILED:<bounded-code>`，保留原 cause；
  不把交接失败改称模型规划失败，不重新付费提交。新故障注入先 RED 后 GREEN，证明
  Planner/self-check 已通过的五份产物原字节保留、receipt 仍有效、私有暂存目录清理且
  Builder 未启动。Node 25.8.1 两文件 26/26、常用 Node 23.11.0 三文件 35/35、typecheck
  与 diff check 全部 exit 0；已有空目录/占用目录/符号链接冲突均保持拒绝且不覆盖。
  Node 25 仅临时用于验证，未改全局 Node 或仓库依赖。当前 CI 固定 24.3.0，未运行完整
  CI、真实模型/生产 Case 或修改同事产物。修复尚在 CF 工作树，不能声称 main 已发布；
  测试平台对错误码的提取/归因尚未验证，自动 partial-Case resume 未由本补丁激活。

- CF-21/REVIEW-EVIDENCE 收尾（2026-09-06，`44897be3` 上未提交工作树）：新增显式
  `review:scene-features` 只读诊断入口和使用说明，将人工声明的全场景要素及逐视图
  presence/completeness/placement 绑定到现有 Case/Brief/Capture/PNG；不新增生产 gate、
  Planner 输出、语义检测器或模型阶段。18/18 定向测试、typecheck、test:census
  （479 项已分类）及 diff check 通过；清单初始排序错误已修正。真实子进程验证有效
  缺口报告 exit 0、篡改 PNG exit 2 及输入不变。六类合成要素不是正式视觉验收，完整
  CF-21 仍开放。用户最新要求为手头切片收尾后先跑一个本地 Case，失败再归属对应 CF
  并补完重验，不再以全部 CF 父项结项作为此次试跑前提；无子智能体/新增 gate 的原则不变。

- CF-20/DISPLAY-PARITY（2026-09-06，`44897be3` 上未提交工作树）：追踪固定旧分支
  `9e35ab53` 的 Compiler、Runtime 和软件 reviewer，确认 Runtime 将逻辑 cluster 展开
  为 `0.985` 比例的独立方块实例；软件预览则画完整尺寸的合并体块。新链原有统一减
  `0.04m` 留缝会将 step 高度缩到 0.84，已用五种形状 RED 复现并改为 Host 固定
  `0.985`；删除 `displayGapMeters` 可调参数和重复默认值，不保留 alias/fallback。
  原始几何、占据和 Collider 尺寸不缩小，Profile Hash/Package 与 captured identity
  同步绑定固定比例。软件预览恢复 X/Z/Y 贪心体块和 center-owned 32m 分区；实际运行
  旧 cluster/shape/chunk 源码，64 组普通非交互 preset 对照全部一致。此映射只用于
  advisory 颜色/体块，不是 Runtime Collider、旧交互 preset 或总预算的映射证明。
  私有 054 副本仅删除旧参数，Source Hash
  `6a9fdb2555b741ea885b2e47a88060c387e94afb75dbe854af022f7971b39698`；7,868 Blocks
  完整归并为 734 个预览体块。两张新 PNG 已实际打开，仍有明显山体/谷地/上升路线
  缺失；不能把该修复称为真实 Case 通过。原始 Case/失败收据未改写。受影响回归与
  Browser 回归已收口：六组合成场景通过实际 Check/Ground/Package/Capture/Evaluation
  和清理，七条严格像素关系通过，报告为
  `output/playwright/cf-display-parity-20260906/pixel-claims-fixed-fixture.json`。
  其中旧后部夹具在恢复缝隙后漏出一个像素；只删除其第二排后部测试方块，再跑受影响
  一组，保留原失败报告和零像素差异断言。未改 Runtime/CSP/像素阈值，夹具回归 12/12。
  CF-20/B2、容量、第一张完整复跑和第二张 Case 均未结项。

- CF-12/14-SUBJECT-CSP（2026-09-06）：本轮真实 Hosted 捕获复现浏览器启动失败，
  原始异常为 Ajv2020 的 `new Function` 违反既有 CSP。原因是 Native Authoring manifest
  经 Authoring root barrel 引入了 Host 动态校验编译，不是场景几何或模型失败。
  已用同一 Subject schemas 生成静态校验器，Node/Browser 共用并通过 Subject 专用
  子入口消费；不增加 unsafe-eval、不更改 schema、准入规则或生产 gate。
  禁止字符串代码生成的实际 Profile import 先 RED 后 GREEN，直接回归 80/80、
  生成一致性及 typecheck 通过；与修复前校验器的 396 次完整结果/诊断比较全部一致。
  冻结工具/实际源码接收 3/3、原预览 PNG/identity golden 2/2、Subject 直接消费者 8/8
  通过。独立干净验证快照 `80e5118a`（执行文件与 CF 工作树逐字节一致）上的合成
  solid-wall 已完整通过 Check/Ground/Package/Hosted Capture/Evaluation 和清理，
  opening PNG 已打开检查；CSP 启动缺陷已关闭。六组捕获/七条像素对照已通过，第一张完整
  Case、容量对齐与 main 合入仍未完成。快照提交只存在于临时验证仓库，不是 CF 提交。

- CF-19/ID1 真实试跑与反馈修复（2026-09-06 20:20 CST）：固定 `fda2ced3` 的
  `paper-moon-054-cf-trial-fda2ced-0906` / `run-20260906120237-85763` 已结束。
  Planner 自检、Host 复检和目录交接通过，Builder 退出 0；Native Check 因
  `WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID` 拒绝，顶层退出 1、未发布、清理完成，
  Ground/Capture/Evaluation 未运行。新旧 Profile 的 ID 规则相同；生成源码将小数坐标
  拼为 `middle-gate-pillar-n7-p2.5`，任务内比较图漏检该 ID。现将既有 Host ID 谓词共享给
  比较图渲染器，不放宽规则、不加普通生产 gate/重试；最小 RED 3 项已复现，修复后
  ID/边界/有界反馈 18/18、typecheck 通过，该版完整受影响回归随后 153/153 通过。原始源码不变的
  私有回放已精确拒绝上述 ID，不升级原 Run 收据。实际对比图仍有明显山体/谷地缺失，
  保留 CF-20/21/11 还原缺口。最新用户安排允许本次真实链路跑通并完成合入检查后先合
  main，再从 main 新分支继续 CF；第二张图不再作为这次合入前置。目前失败，尚未合入。

- CF-19/INPUT2（2026-09-06，主会话独占、顺序执行）：ID1 后继续核对发现比较图仍在
  复制简化版 Session 输入校验，额外字段、显式 null/undefined、短网格前缀、Collider 行、
  重复 finalize 等 12 项回归均 RED。现抽取既有 Host 的纯输入解析器，由 Host 和任务内
  反馈共同使用；VM 仅显式承认自身普通 Object/Array 原型，不放宽 Host，拒绝访问器和
  任意对象字符串化。创建/网格/提交采用同一字段与规范化规则，网格 ID 冲突整批预检，
  相同规范化 finalize 幂等。无新增 gate/任务/重试，无 Runtime 或物理所有权迁移。
  已通过：渲染输入/ID 16/16、网格原子性/提交后行为 4/4、跨环境与 Host Session 79/79、
  typecheck。冻结工具已同步，完整受影响五文件回归 199/199 通过（263.36s，包含 Builder
  Skill 漂移门禁和 Collider 结算）；修复后再次回放原源码副本仍在 PNG 前精确拒绝该 ID。
  这些不替代新真实 Case，不标 CF-19
  全完成，Collider 几何准入/地面/容量和实际山谷还原仍是独立未完成证据。

- CF-20/CLUSTER（2026-09-06，已提交/推送 `e8f7de07`）：比较图已有旧式合并体块，
  修复前 Runtime 却按 Block 分别生成实例；相同 0.985 比例不代表几何等价。真实 Babylon
  初始 RED：两个相邻 1m Block 的旧合并显示左边界应为 -0.485m，修复前为
  -0.492500007m，后续还要求一个显示体块并保留全部逻辑 ID。CLUSTER1 将已有纯合并
  算法迁入 Profile，比较图改用该唯一所有者，删除脚本层实现；非对称/边界/身份/台阶
  4/4、固定比较图像素回归通过。CLUSTER2 已接入 Runtime 共享合并体、完整逻辑 ID 和
  Capture 临时局部选择/恢复，上述 RED 已转 GREEN；实现 Hash 绑定合并成员与矩阵。
  直接受影响回归先通过 138/138，新增异常恢复/旋转场景后 Capture 6/6、显示及包边界
  20/20 通过，typecheck 通过。真实 Browser/Havok 2,000 Block 合成工作负载完成 90 tick，
  Runtime ready 3.22s，已查看 opening 图（`output/playwright/native-block-budget-1788700639877/`）。
  这些不证明新旧完整像素等价或真实 Case 成功。冻结工具逐字节同步，最终直接受影响
  11 文件 254/254 通过（278.02s，包含完整 Builder Skill 漂移检查）；diff 检查通过。
  物理分块仍为 4m、显示分块 32m；CLUSTER3 的 8k 容量与旧源预算闭包仍未完成。
  此批仅达到分支提交条件；未做 root full CI/独立 exact-SHA 审查，不跑新 Case、不合 main。

- CF-20/CLUSTER3/COUNT（`e8f7de07` 上的当前未提交代码）：删除老分支不存在的固定
  8,000 源码 Block gate、Session 调用方预算参数和比较图额外 100,000 上限，未改成
  另一大数。Generation Request/Planner context 删除旧字段并同步严格解析，Ground
  工作量边界由已检查布局数量派生（空清单保留最小正工作预算，不新增非空世界 gate）。
  当前 API 为 `createBabylonNativeBlockProfileSessionV1(context)`；生产/测试调用方和
  活跃及冻结 Skill/工具已同步。退役专门断言源码数量拒绝的 corpus，其他占用、参数、
  Collider 和资源失败断言保留。两项 RED 后，8,100 Block 真实分配及相关四文件 92/92、
  六文件 Request/生成/结算等 148/148、typecheck、Skill quick_validate 通过。Host
  Ground/Package 定向 5/5 通过（32 项未选），其余完整六文件 172/172 通过（486.41s），
  包含 Builder Skill、Planner 冻结、源码/Package 准入及 Collider 注册；新增比较图实测
  8,104 个捕获 Block，强化计数断言后再通过。COUNT1–3 实现达到分支提交条件。
  此条取代前文“当前生产仍限 8k”的旧状态，
  不撤销那些历史测量。尚不证明任意容量可运行、旧总资源计数完全对齐或真实 Case 通过；
  CF 父项仍开放，最终图片 Case/合 main 条件未满足。

- CF-20/MEM3 真实容量失败（2026-09-06）：冻结 `f72a4931` 的新 054
  `paper-moon-054-cf-f72a493-0906` / `run-20260906140808-99613` 已结束，退出码
  `134`。Planner/Host 交接、Builder 交付和 Host 重放自检通过；Native Check 耗尽
  约 4 GiB Node 堆，没有生成检查结果，Ground/Capture/发布未启动。已实际查看的比较图
  仍有宫殿高差和山谷纵深偏差，不能称为效果对齐。实现修复与完整复跑仍待完成，不合 main。
  原始源码/失败证据保留，后续按
  [MEM3 容量修复计划](superpowers/plans/2026-09-06-cf20-native-check-capacity-repair.md)
  定位并修复现有 owner，不重新引入源码 Block 数量 gate。
  后续 MEM3-B1/B2 已修审计收尾主动实例化未使用 Observable、恢复后仍保留已销毁对象
  两项问题；两项 RED 后，owner/准入/重放三文件 290/290 与 typecheck 通过。
  相同 8,000 Block 诊断现可在固定 1 GiB 堆下完成审计/销毁，但活跃分配仍约 625 MB。
  本次真实源码共 158,100 Block，完整容量问题仍开放，不能据此称生产已修复。

- CF-20/MEM4 实施检查点（2026-09-07，`df1d8350` 后的当前候选）：
  已按用户批准切换为 immutable intent → 分配前旧式 32m/X-Z-Y clustering；
  创建 API 不再返回逐 Block Mesh，完整逻辑身份、显式 Collider、实际 Host settlement、
  Package metadata/目录校验、Runtime 回放及 Capture 局部选择同步切换。大布局 extrema
  删除调用栈展开；不可行走实体仅合并同 Collider/平面/法向的共面微格，保留孔洞和
  外表面，不动行走平滑、预算或新建 gate。原失败 158,100 Block 源码保持原 SHA，
  在当前 Host 诊断准入通过、零诊断，6,556 targets / 6,560 Meshes，66.85s，峰值
  RSS 2,718,992 KiB；它不是原 Run 成功或完整 Case 验收。最终相关 44 文件
  685/685、typecheck、build 通过；最终冻结 Skill 检查 106/106 通过。与旧 `9e35ab53`
  的本轮边界对照及 RED/GREEN 见 MEM4 计划。按最新要求先完成对照，再启动新 Case；
  完整场景高差/纵深/构图、CF 父项、最终全仓 CI、独立审查与 main 集成仍未完成。

- CF-04/12 参数复核（2026-09-07，MEM4 提交前）：已静态确认生成 Camera 起点
  `5m / 1.25m / 0.12rad / 56°`、Profile → authored opening → Context Modifiers →
  Preview 覆盖顺序、1280×720/DPR 1，以及 1800s 正式任务超时与旧分支一致。
  发现实际行为差异：旧 Block Runtime 在 `usesBlockWorldGeometry` 时启用 Subject
  occlusion fade 并跳过第三人称 Spring Arm；当前 Native 使用 Hard Decollider，
  没有旧 fade 路径。四个数值一致不能证明实际机位/像素一致。详见
  [参数对照与未决合同](reviews/2026-09-07-cf-scene-parameter-parity-audit.md)。
  当前防穿模冻结设计与旧策略冲突，不能默默归为允许偏差，也不能仅取消碰撞而遗漏
  fade/Reset/Capture 消费者。新 Case 尚未启动；完整参数对齐、CF-04/12 保持开放。

- CF-04/12-OCC-B1（2026-09-07，`7601ad77` 后未提交工作树）：按旧行为推进的目标
  已在 Camera 设计明确为 Native Block 构图优先/遮挡淡出，其他 Source 保留硬碰撞。
  展示模块已落代码，使用显式 Host 批次而非 Mesh 名称/全局注册表；旧选择、update、
  Shader 和参数共 21 个定义去注释/类型重命名后 AST 对照一致。新增 6 项真实 Babylon
  Mesh/Material 用例通过，含九射线覆盖、15Hz/Float32 淡出、完整状态恢复、截图异常、
  构造/销毁失败和双实例隔离；连同 census 共 18/18，typecheck、480 文件 census 通过。
  此模块尚未接入生产 Host/Camera 或公开 Snapshot；没有取消当前生产收臂。事务/Hash、
  真批次与 Capture/Browser/Feel Review 仍待集成，不能据此勾完 CF-04/12 或跑最终 Case。

- CF-04/12-OCC-B2/C1（2026-09-07，`7601ad77` 后未提交工作树）：上条 B1 的
  未接线状态已更新。实际 Native Block 显示批次、CameraComponent 事务、Director 和
  公开 Snapshot/单一 parser 已接通；保留旧受控 Subject 回退，Native Block 使用淡出
  而非收臂，其他场景源不变。146 项 focused 回归及新增身份 Shader 准备用例通过，
  typecheck 通过。实际 WebGL2 首张身份 mask 复现异步编译漏批次，已在既有 render-ready
  预编译修复，不新增 render/Tick/gate；首张及后续身份 mask 正确，开场淡出显示主体，
  暂停后状态和像素完整恢复。详细命令范围、指标和本地截图见当日参数审计 OCC-B2/C1。
  完整多入口 Camera/主体效果、Feel Review、全部旧参数与最后真实 Case 仍未关闭，
  CF-04/12 保持 open；本批尚未提交/推送，不复用 MEM4 的旧全量证据声称通过。

- CF-04/12-OCC-C2 冷启动排查（2026-09-07）：上批已作本地验证提交 `9b8f36a9`，
  尚未推送。真实 Native Check/Ground/Package 通过；Hosted 冷启动失败已定位为
  MEM4 新导入的 `boxBuilder.js` 在虚拟 Native 模块加载后才触发 Vite 预打包/reload，
  导致既有 iframe 导航保护终止。修复仅补 Runtime 提前预打包清单，12 项 seam 回归
  RED→GREEN；不弱化导航保护、不改超时/相机参数/修复轮次。修复后的冷 Browser
  验证尚待运行，完整 CF-04/12 与最终模型 Case 仍开放。

- CF-04/12-OCC-C2 复验（2026-09-07，`09d0ce69`）：保留夹具的冷 Hosted Capture
  已通过，无晚加载预打包/reload；随后 `pnpm verify:native-no-script-capture` 通过真实
  Check/Ground/Package、Browser Capture、观察解析和 Evaluation，5 个目标具备身份像素，
  输入未变，Browser/Vite 清理 completed。人工看过开场及身份 mask；证据目录见当日参数
  审计 OCC-C2 verified。该确定性夹具不含脚本遍历，不是新模型 Case，也不关闭整体任务。
  后续旧源追踪确认 CF-04/T1：旧 CLI 暂停/Reset 后只等待渲染，当前 Formal 在开场前
  多提交一个中性 Tick（真实收据为 Tick 1）。该 Tick 同时供当前 committed support
  观察使用，需要一起对齐捕获状态与真实支撑证据，不能简单删除、伪造或放宽检查。
  CF-04/12 与最终两张图生产验收保持开放。

- CF-04/T1 实现检查点（2026-09-07，`186cbc48` 后）：图片与身份 mask/三视图现在先在
  Reset/render-ready 状态捕获，之后才执行原有支撑采样 Tick；支撑观察新增 required
  sampledSnapshot/Hash，原 reset identity 仍绑定 Capture receipt，不伪造采样时刻。
  两项 focused RED→GREEN；合同/provider/evaluation 测试通过，捕获/Hosted 协议/最终发布
  三文件 58 项通过。另补齐捕获夹具遗漏的 settledVisualTargetCount，生产检查不变。
  真实 Browser 的 Tick 0 开场和 Tick 1 支撑采样仍待复验，不据此结项或跑最终模型 Case。

- CF-04/T1 真实 Hosted 复验（2026-09-07，`a1802205`）：已通过现有确定性 Browser
  验证命令，收据确认 opening Tick 0、fade elapsed 0、support sampled Tick 1，两个
  Hash 分别绑定真实状态，原 reset identity 仍相等；Check/Ground/Package/Capture/
  Evaluation 和清理完成。无遮挡夹具七张 PNG 与前版内容 Hash 完全一致，开场图已查看。
  focused 合同/provider/evaluation 三文件 114 项及捕获/协议/发布三文件 58 项通过，
  typecheck 通过。具体证据目录与不足见当日参数审计 T1 real Hosted validation；
  真实遮挡世界、多入口完整像素/手感、CF-04/12 和最后生成 Case 仍开放，未合 main。

- CF-04/T1 单方块遮挡跟进（2026-09-07）：真实遮挡夹具已复现图片挡住人物但
  opacity instances 为空；根因是新批次分组排除了单方块，旧 renderer 无此门槛。
  已删除该门槛，单方块回归 RED→GREEN，批次/遮挡 22 项、session 40 项、隔离/容量
  12 项及 typecheck 通过；`4788a039` 实际遮挡 Hosted 重验已通过，开场 Tick 0
  opacity 1、支撑采样 Tick 1 opacity 0.888889，完整证据见当日参数审计。没有改变生产 gate 或淡化参数，
  完整 CF-04/12、交互时序对齐和最终新 Case 仍未完成。

- CF-04/R7 Native Hosted 交互时序（2026-09-07，`77d02f73` 后）：已修复真实入口
  排队但不等待 input、固定 alpha=1 和保留长帧积压的问题。沿用老代码五 Tick 总积累
  上限、1e-12 边界与首帧零推进；输入完成后渲染剩余时间 alpha，销毁/失败不再渲染。
  实际 Native Camera alpha=0 的约 4cm 偏差已 RED→GREEN；入口/帧两文件 24/24，
  后补 30/60/120Hz 后帧文件 12/12；typecheck、原 3C 和现有 Hosted Browser 的真实
  页面启动/键盘移动/协议/清理验证通过。未跑新模型 Case、全仓 CI 或独立审查；
  多入口像素/手感、主体完整能力及整个 CF-04/12 仍不能据此结项。

- CF-05/P1 Native Hosted 鼠标控制（2026-09-07，`049d4431` 后）：真实 Browser 已
  RED 复现缺失拖拽/滚轮；现接回旧 -dx×0.006、dy×0.005、wheel×0.008，复用原
  isolated queue 和 Runtime Camera owner，无新协议请求、状态 owner 或生产门禁。
  实际入口证明提交值冻结、fixed-input 串行、零额外 Tick、原阻尼、Reset 与销毁边界。
  最终原 Browser 验证通过：40/20px 拖拽和 wheel=100 得到约 -0.24rad/+0.08rad/+0.8m，
  松开/右键/失焦无额外转动；typecheck 和原 3C 通过。键盘多运动模式/箭头相机接入
  仍须继续，不能把 P1 当整个 CF-05/12 完成；最后真实生成 Case 未启动。

- CF-05/K1 键盘对齐检查点（2026-09-07，`0626082a` 后）：Native 接回旧模式相关的
  Shift/Space、动作键及方向键/IJKL 相机输入；与 Viewer 共享纯键位映射和旧加减速公式。
  删除当前 Viewer 独有的 Space/Shift 短按缓存，恢复老分支采样时只读取按住键的行为。
  对应 RED→GREEN 后三文件 72/72、实际 Native 入口 16/16、typecheck 和现有 3C
  检查通过；原 Browser 证实鼠标/箭头/IJKL 和按住 W/ArrowLeft 时 Reset 清空。
  输入边界使用当前 motionKernelRef，旧字段引用计数从 21 收窄到 16，不宣称专用运动
  Runtime 迁移完成。实际驾驶/滑翔 Native 端到端模式证据仍待补；不关闭 CF-04/05/12，
  没有新增生产 gate、全仓 CI、独立审查或新生成 Case。

- CF-04/G1 坡面检查点（2026-09-07，`d6995a05` 后）：恢复老分支完整源方块顶面、
  1m 共享角平滑及源顶面 Ground 连通逻辑；删除新增的原始高差 step/slope 重复否决
  和平滑后精确 Y 等值要求。真实 Havok 复现并修正持续坡面降速、上坡切线误判离地，
  以及部分支撑修正速度造成的位移校验误报。沿用现有 Character/BodyPort 权威，
  不新增 grounding cache、不调步高或求解器容差。9 个直接相关文件 249/249、
  typecheck 和 3C 检查通过，含 1m 坡面上/下坡、反向、走/跑跳跃、落地、Reset。
  G2 四形状/统一网格、Builder 指引及消费者尚未完成；全 CF 验收、最终新生成 Case、
  第二张图和合入 main 均未完成，不能用此定向证据替代。

- CF-04/G2 四形状/网格收尾（2026-09-07，`4c2e0537` 后未提交树）：已将
  `full/half/quarter/small`、0.5m XYZ occupancy 和 0.25m XYZ center lattice 连到
  Session、metadata、Case/Evidence、当前标准 Case、Corpus 与 live/frozen Builder。
  删除额外的 quarter-height `step` 方言及强制四分之一米台阶/额外平坦落点指引；
  保留 G1 的旧 1m source-top smoothing、现有 Capsule 参数和生产/修复预算。
  BWB-4 真实 Havok 4/4、BWB-5 6/6 通过；受影响 Ground/Materializer/benchmark
  夹具已修复其旧网格坐标并通过定向回归。Builder 完整检查先有 101/106 通过，
  五个旧文案/occupancy 断言修正后定向通过；额外的双工具回归验证 `step` 在
  frozen TypeScript checker 与 renderer 都被拒绝，而合法 `half` 两者均通过。
  G2 类型检查已通过。Package/Native Check 整组结果为 42/56；多数失败发现 Host
  遗留的“平滑跨度不得超过人物步高”及全场景坡度否决。已移除这两个旧分支不存在
  的限制，保留拓扑完整性与实际 Spawn/净空/必需路线检查；真实 composed Subject
  Package 和两个定向用例 3/3 通过，随后两组 Package 4/4、4/4 通过；最后一组
  2/3，阻挡夹具改为平地上的真实头部障碍后 1/1 通过。原 14 个失败都有定向绿色
  证据，但没有重新声称一次整组 56/56。JSON 收据在 output/playwright/cf-g2-package-group1.json、
  cf-g2-package-group2.json、cf-g2-package-group3.json 和 cf-g2-package-spawn-obstruction.json。
  G2 达到定向实现检查点，不关闭 CF-04/05/12，不启动最终生成 Case。

- CF-04/G3 实现检查点（2026-09-07，`ef7ab8c3` 后）：已实际运行旧 Git 对象中的
  checker/Compiler/Runtime，确认邻阶平滑布局保留原始 Spawn、Tick 0，不预跑 Tick。
  当前 Native 原先在启动前拒绝同一布局；现由 Package/Runtime 共享 Profile 既有
  源顶面 footprint/clearance 检查，实际接地仍完全归现有 Havok/Character。删除 Native
  继承的额外 0.05m 占地余量，Heightfield 不变。真实 Runtime 首 Tick/30 Tick 数值
  与旧分支到小数点后六位一致，Reset 回原位；洞口、真实头部阻挡、合法网格悬空点
  仍拒绝。四文件 71/71、真实 Package 正例/两项反例 3/3、typecheck、原 3C 通过。
  live/frozen 自检脚本及嵌入类型图精确一致；便携工具/tuple/shape/drift 四项通过，
  精确发布 Spawn 另行 1/1 通过，Host-only export/epoch 与零债务 boundaries 通过。
  收据为 output/playwright/cf-g3-*.json。未运行最终新图 Case，不把本项定向证据
  称为完整 CF 闭环。

- CF-04/G4 逐块显示纠偏（2026-09-07，`45c27839` 后）：直接执行旧
  `scene-geometry.ts:blockClusterTransformsV2`，证实逻辑 cluster 在 Runtime 会展开为
  每个源 Block、各自中心不变且各自缩放 0.985。此前 CLUSTER2 把整个 cuboid 缩放
  的解释错误，已按真实旧执行纠正；保留 MEM4 预分配与物理不变。删除 Runtime
  Thin Instance 的多 Block 成员/portion matrix 与 Capture 分割逻辑，改为一块一个
  实例和实际矩阵；地面条纹也按逐块中心采样。真实顶点反例 RED→GREEN，12 项
  materializer、Formal/Artifact/occlusion 通过；Capture 旧体量断言修正后 8/8、真实
  Runtime 10/10、typecheck 通过。补充逐块条纹/真实 batch 世界矩阵用例通过，原 3C
  与零债务 boundaries 通过；live/frozen 类型工具已重新生成，做最后便携性复验。
  摩擦审计确认旧 preset 的 0.8 未被真实 Block Physics 使用，旧/新实际均为 0.75，
  因此没有错误地改动该值。用户最新安排是本批修复后先跑一个新 Case，通过及必要
  合入检查完成后合 main，再从最新 main 新建 worktree 继续 CF；不等待全部 CF。

- `1e1f572f` 新 Case `paper-moon-054-cf-scan-0907` / `run-20260906221617-80057`
  已通过 Planner/Host 规划复验、Builder 交付、Host 自检、Native Check、Ground 和
  Package 构建。Ground 为一个连通区域、28,320 可站点，2 个目标与 3 条通行带全部
  可达。随后 Capture 服务启动 30s 超时，未进入评估/发布；原 Package 已保留。
  对应最小修复 `CF-02/STARTUP-SNAPSHOT`：23MB Package 在 Vite 配置阶段重复完整
  校验三遍约 48s，超过旧分支同样的 30s 预算。改为读取同一已验证的启动快照，
  HTTP 请求仍保留原目录漂移检查，不修改超时。transport/Vite 19/19 与 typecheck
  通过；`23c995cf` 上两个服务已在 17.7s 就绪，未放宽 30s 启动预算。原 Run 的
  Host-only 恢复 1 已进入浏览器，但停在 package/revision 0 后触发 45s stall。
  实测原 Package 收据在 15.2s、17 个文件在 31.1s 下载完成，存在未上报的真实进度。
  继续补 `CF-02/PACKAGE-PROGRESS`：仅把完成的传输接入既有 reporter，不用计时心跳
  伪造进度，不改 45s/180s 预算，不减完整校验。37 项 focused、最终 typecheck 和
  loader 补充 3 项通过，下一步恢复 Host；两次失败记录及原 Package 都保留，不重跑模型。

- `17b12f97` 的原 Run Host-only 恢复 2 已结束，未发布：真实加载进度已推进到
  module/Havok，93.8s 在 `runtime-subjects` 终局失败，不再是 package stall。
  对应最小补齐 `CF-12/SUBJECT-ASSET-HANDOFF`（main-agent-only）：Package 锁定
  `humanoid.golden@2`，Native Browser resolver/HTTP 服务却只注册 G Bot。旧
  `9e35ab53` 的 Playground resolver 支持 Golden，且旧 GLB SHA-256 与当前完全相同
  （`6cf29a2c…32cd25a8`）。页面诊断为 `WORLD_SESSION_FAILED`；直接消费者回归分别
  RED 于资源 404 和 resolver unavailable。补齐旧 Golden 路径/字节交接，保留现有
  exact-hash 请求和 Runtime 校验，不替换 Host 选定人物、不增加 gate/重试/预算。
  Vite/资源交接与真实 GLB 加载回归 16/16、typecheck 通过。冻结提交 `a19039ea`
  的恢复 3 已完成：正式 opening/side/top/Collider 与四个目标三视图全部交付，
  普通生产 `passed`、发布 `published`、退出 0、cleanup completed；原 Package root
  仍为 `sha256:e1d3d41846c5ecc9fd08f972210b4f1f7992c50f3054318b2285720b12f344ac`。
  不把普通发布说成完整效果验收：evaluation incomplete，构图/轮廓仍有偏差，
  critical-traversal 未执行；strict diagnostic failed（`NBR70_BLOCKER_IDENTITY_MISMATCH`、
  `NBR70_EVALUATION_NOT_PASSED`）。未把这些严格诊断新增为普通生产 gate。
  原生成/Package 字节和失败恢复记录保留。已按原链路启动单任务的开场风格化及四目标
  三视图（`visual-1788736127520-dedbbd`），其交付/Host finalization 尚待完成；未合 main。

- 合入前清理收尾（main-agent-only，不是新增生产 gate）：现有 clean-break 检查的
  五处 Scene Mesh 反扫曾全部失败；异常清理反例也复现了误删分配过程外的无关 Mesh。
  改为仅在同步 `CreateBox` 调用期间记录原 `Scene.addMesh` 注册，`finally` 恢复原
  属性描述符/继承方法，再按原逆序清理。已确认 Babylon 9.23 的新增 Mesh Observable
  异步通知，不能用于同步异常回滚，因此未采用该错误方案。成功/构造失败、清理抛错、
  无关 Mesh 保留及注册方法恢复回归 53/53、typecheck 通过；现有 clean-break 为 0 命中。
  renderer 重建字节未变，无需改写冻结工具或历史 Case。Studio 过期的单 mode 断言
  改为旧分支已有的有序 1–8 modes，定向测试通过。最终全量检查/合入仍待收口；用户
  禁用子智能体，本轮没有独立子智能体审查证据。

- CF-16/VISUAL-DELIVERY-PARITY（2026-09-07，main-agent-only）：真实视觉任务
  `visual-1788736127520-dedbbd` 已终局失败（CLI exit 2，task-rejected）。开场/人物图
  留在隔离 workspace，目标 2/3/4 在各自单次重生成后因比例/基线差异被任务扣留，
  Host 因必需输出缺失拒绝，未运行视觉 finalization。白盒已发布结果未被覆盖。
  重新沿 pinned old 实际入口核对：`run-styled-opening-frame-agent.sh` 调用
  `run-gemini-visual-pipeline.py`，`_generate_one` 得到有效 PNG 即保存返回，
  `_generate_images` 汇总文件，没有语义相似度/基线不通过就扣留文件的 gate。
  因此此前仅从旧 Visual Skill 推断实际生产自检/失败规则并不充分；当前 dispatcher
  明写的“失败则不交付”确为新增生产否决。按用户优先规则删除该否决，保留既定的
  Codex 单任务、开场先行/确切锚点、检查与现有最多单次重生成；预算后交付真实 PNG，
  残余差异在任务最终回复如实报告，不伪称语义通过。Host 文件/身份/Hash 校验不变。
  实际失败任务为 Skill RED；现有入口/closure 77 项通过，过期文案断言修正后该项
  1/1 与 Studio 直接调用契约 1/1 通过。修订后模型行为仍待新的真实视觉尝试验证；
  不复制旧任务未交付图片冒充成功，也不恢复旧 Provider。

  修订后的 `d22cbbfd` 真实任务 `visual-1788737225126-ztzdhl` 已完成（exit 0），
  一个提示词文件、开场及四目标三视图全部经 Host promotion/finalization 交付；
  两份 report 均 passed，所有已发布 PNG 与 manifest Hash 逐项匹配。三视图 manifest
  hash 为 `sha256:d232bbe278321f023799566940e17ab2e84a305d735b5de895bae823a80c560f`。
  任务记录了开场人物偏低、建筑规整化和各目标轮廓/比例偏差，未扣留 PNG、未增加轮数。
  这证明修订后实际交付行为 GREEN，不证明完整 CF 效果对齐；原失败任务与 reference
  备份仍在 `.codex-tmp/visual-reconstructor-dEdbbd`。当前是原 Case 的 Host 恢复加
  新视觉尝试走完，不是另一次 fresh `agent:world` 从头到尾的退出 0 证据。

- 候选 `844554ab` 已整合 `origin/main@0d766279`，仅测试数据格式冲突，相关回归
  53/53。本批完整检查已通过 generated self-check、typecheck、Studio、独立 Node
  69/69；Site 因本地缺 vinext 首次未启动，按 lock 安装后使用现有 Node 22.21 完成
  build 与页面测试 1/1（SDK 检查环境 Node 23.11）。root 的 workspace boundaries、
  clean-break、3C 已通过；census 发现新 loader 回归未登记，补入 contract lane 后
  census 通过（482 files = 439 contract + 43 resource-heavy）。Vitest 两 lane 和
  Playground build 尚未执行完成，须从这里继续，不重复已通过的独立/Studio 整套。

  后续 `d22cbbfd` contract 全组终局：439 files 中 431 passed / 8 failed，
  6,028 tests 中 5,992 passed / 33 failed / 3 skipped，耗时 1,261.73s。
  失败已按实际原因收口：Capture 夹具追加目标但漏改 settlement count、骑乘测试仍期待
  5m 而旧/新 authored opening 均为 4.8m（mounted modifier 7m 不变）、Planner 断言仍
  用已移除 step、地形测试临时 Brief 缺 movement 行前缀、视觉测试缺 frontDirection。
  五文件修复后 60/60；预算测试按真实 12 个 authoring clusters 计绘制基线而非
  2,000 个逻辑 Blocks；当前 R0 示例迁移 colliderSource 并同步 Lock/Graph Hash。
  Hosted Runner 的 pure Host barrel 把未使用的 Ground→Authoring validator 初始化
  带入包（实际仅 141 字符）；打包明确该 re-export barrel 无副作用后，原 import-graph
  禁入检查与完整 staged runner 分发测试均通过，未删规则、未引入 Runtime fallback。
  三文件余下 4 项已分别 GREEN，合计八个失败文件定向回归覆盖 64 项，typecheck 通过。
  其余 431 个文件的通过证据保留，不能描述为在新 SHA 上重新跑过一次完整绿色 aggregate。
  重型组和 Playground build 仍待继续；尚未合 main。

  `126e548e` 重型终局为 39/43 files、770/775 tests passed，耗时 1,870.95s。
  五个失败不是统一规划失败：Native checker 内嵌源码漂移一项，重建工具的两个
  mutation 测试超过自身 30s 预算，authoring Browser 遇到 ResizeObserver 清除
  render receipt，以及 P1.5 台阶离地前错误进入 sliding。前两项同步生成工具并使
  重建测试使用同类工具已有的 180s 测试预算，生产超时不变；Browser 仅等待同一
  暂停 Tick 的真实新帧，原截图、Hash、Full Reload 和 Runtime 校验不变。
  三个重建测试与 Browser 已定向通过，Native Skill 完整复验 110/110 通过。

  台阶问题定位到 **CF-04/G1 下坡逻辑偏移**：pinned old
  `preservePlanarTranslationOnWalkableSupport` 只补上坡切线，向下位移交给 Body
  snap-down；此前迁移却同时注入了负 Y，导致 Capsule 沿边缘滑落并清空 coyote。
  已恢复只补正向 Y，原 P1.5 supported→air→coyote jump 断言原封不动通过。
  坡面反向复验又用真实 Havok 复现部分支撑修正误报：负 X 修正已兑现，但 Y
  下降与冻结的正 Y recovery 相反，整向量点积错误地取消了 X 的额度。现逐轴
  只扣除同向、实际发生且不超过冻结支撑分量的修正；超量反例仍拒绝，没有新增
  支撑查询、缓存、生产 gate 或扩大步高/求解器容差。Movement/Body/Golden 三文件
  183/183、P1.5/真实 Body conformance/Native ramp 三文件 50/50 已通过。
  Runtime 修复后再次生成工具包，并通过重建精确字节 1/1、live/frozen 与 portable
  工具 3/3、迁出仓库独立 typecheck 1/1；内嵌 Movement/资源分配源码已逐字核实。
  typecheck、3C（11/34/10）和 Playground build 通过，build 仅保留 chunk-size warning。
  本轮原失败项均已有定向绿色证据，但没有再跑一次新的全仓 aggregate；精确候选 CI、
  新图 Case 和人类审核仍待完成。全部 CF 未关闭，main 仍未合入。

- CF-31/FRESH-BUILDER-TOOLS（2026-09-07，主会话顺序执行，当前未提交）：修复新建
  build-only/生产 Run 继续读取旧 Case Builder Skill 的偏移。生产入口改为指定当前
  SDK Skill；Generation owner 在独立 canonical 工具根目录读取四个声明文件，
  仍按原路径复制到 Attempt 的 `inputs/builder-skill/` 并绑定 Hash，不暴露工作树。
  同时将 Case 准备中的现有入口指令抽成唯一 SDK 常量，新 Generation 直接冻结它；
  删除 `taskInstructionPath` 参数及全部当前调用，旧 Case 指令不再是执行 fallback。
  抽取前后全部指令字符串字节一致，无新增 gate、轮次或参数变化。已接受的 Brief、
  图片、Case/Profile/API 约束和旧 Attempt 保持原始文件/身份；Host-only 恢复继续
  使用既有 Attempt，不创建新的 Builder。
  三项 RED 分别覆盖生产路由仍选旧 Skill、当前工具根被错误拒绝和仍执行旧指令。
  Generation/Production/Case-preparation 三文件 131/131 通过，覆盖新工具 Hash、
  冻结后的 live mutation、旧 Case/Attempt 保留、三类符号链接拒绝与现有恢复入口。
  typecheck、零债务 workspace boundaries 通过；工具一致性/源码重放定向检查 2/2
  通过（不是再跑完整 110 项）。
  本切片不代表全部 CF-31 或新的真实 Case 已通过。

- 最新 fresh Case（候选 `2767cfe7`，2026-09-07）：
  `cloud-temple-cf-closure-0907` / `run-20260907004906-9998` 的 Planner 和 Host
  规划复验通过；本地 Builder 单物理任务在 1,800,306ms 终局 `task-timeout`。
  三份源码已保留，两张 advisory PNG 缺失；production failed、not-published，
  后续 Native Check/Package/Capture 未启动。不能称为完整链路成功或已合 main。
  原始 retained 源码 SHA-256 为
  `c568d57011c39f30576db55a0ff451c2462a6acb29fe78c82ab882f735635c80`。
  其精确副本离线自检通过，但 Ground 仍有 365 个断开站立点。原失败日志仅保留
  有界尾段且内容以源码 diff 为主，不足以重建完整模型耗时或证明单一超时成因。

  CF-19/GROUND-COMPONENT-FEEDBACK（主会话顺序执行，当前未提交）：按 pinned old
  `check.ts:1142` 恢复前 16 个断开区域的站立点数、坐标范围和样本位置；复用已有
  Host graph，未改采样、连通性 gate、生产超时或修复次数。修正错误文本把总区域数
  当断开区域数的问题，保留总数 metric。两个 RED 分别证明缺摘要和误报计数；
  Ground 37/37、初始断开→真实连接桥回归 1/1 通过。新增 18 区域截断/顺序稳定性
  已随完整 Native Builder Skill 110/110 通过（305.38s），typecheck 通过。
  精确失败源码离线复放仍 exit 2：41,628 standable、41,263 reachable、365
  disconnected，全部指标不变；新摘要给出 11 个断开区域（总数 12），最大区域
  176 点，范围 `[-2,7,-92]` 至 `[2,7,-83]`。原 Case/冻结工具未被覆盖；本次不是
  新模型尝试，不证明老新版会算出相同的 365 点，也不关闭整个 CF-19。
  GitHub CI `34070524337` 在 `2767cfe7` 已终局 failed；此前定位的 5 项失败均为
  Native Builder Skill 测试超时，不能表述为全绿或已获合并批准。该文件已从并行
  contract 移入现有串行 resource-heavy lane，测试数量/断言/超时均不变；census
  482 files = 438 contract + 44 resource-heavy 通过，新 CI 结果仍待。

  追加旧算法对照：临时 harness 直接从 `9e35ab53` 读取 `check.ts` 及其相对模块，
  对同一源码采集的 65,710 个 Blocks 按明确的一个 static-surface 组及两个 solid
  组映射为旧 walkable/obstacle，其余为 visual-only；使用同一编译后主体净空
  1.92m 和有效脚印半径 0.32m。旧算法得出 9,222 standable、9,087 reachable、
  135 disconnected，断开 11 个区域；逐区域坐标范围与当前 365 点的 11 区域一致。
  两个 target 和两条 band 在旧算法也都可达。由此本例的断开失败不只是新增微格
  采样导致；但这是显式分组映射后的 Ground 专项比较，不是完整旧版 Native Case，
  不证明所有 preset/采样/Runtime 行为等价。旧算法另报 buried support 等邻接高度
  诊断，不能不核对两种表示就直接恢复为当前额外 gate。临时报告在
  `.codex-tmp/cf-ground-legacy-diagnostic-report.json`，原失败输出没有改写或发布。

- 更新的真实 Case（`67c0b729`，`paper-moon-054-cf-ground-0907` /
  `run-20260906214232-75736`）也已结束，未发布。Planner 及 Host 复验通过；Builder
  用完原三轮任务内修复，最终仍有瀑布/山体方块重叠，两张必需的 advisory PNG 缺失。
  三份源码完整保留在 `generation-failure/outputs`，不是“完全没有源码”；顶层
  `WORLD_RECONSTRUCTION_NO_OUTPUT` 来自交付缺失，尚未进入 Native Check/Ground。
  旧分支同样拒绝这些重叠，不得放宽。继续补 `CF-19/OVERLAP-SCAN`：原 renderer
  到第 33 对重叠就提前终止源码执行，旧检查会完整遍历；改为完整首占用者扫描、
  前 32 对明细加有界类别汇总，不新增生产 gate/超时/修复轮数。新回归已 RED→GREEN
  覆盖后置冲突与 20k 重合输入；原失败源码只读扫描完整 85,450 Blocks，发现 48 个
  真正冲突 Blocks。renderer/冻结工具 focused 45/45、typecheck 与直接 Package 回放
  1/1 通过；场景本身未被手动修成通过，下一次生产验证仍待实际结果。

- 上一真实 Case（2026-09-07，`13b52d17`，`paper-moon-054-cf-g4-0907` /
  `run-20260906204436-65522`）已结束，ordinary production failed，未发布/未合 main。
  Planner 自检及 Host 复验通过；Builder 退出 0，Host 自检与 Native Check 通过。
  Ground 仅有一处失败：`middle-to-remote-source` 第 009 段从 `[14,8,-60]` 到
  `[17,8,-62]` 无法在声明的 2m 半宽内连通。全图 34,686 个可站点为一个可达分量，
  两个目标全局可达，不是整个世界失联；局部前庭/绕行平台只在角点接触。实际旧
  Compiler 最小复现也拒绝此段，增加真实连接方块才通过，因此不删/放宽 Host 检查。
  最小必需开发为 CF-19/GROUND-FEEDBACK：把现有源几何 Ground 检查接入同一个
  Builder 既有 renderer 的任务内反馈与三轮修复预算；静态交接自检仍不执行源码，
  Host 在 Native Check 后重放像素，原正式 Ground 阶段不变。角点失败/真实连接通过
  的工具对照已通过；Profile 93 项回归通过（含源反馈与正式报告的支撑、空洞、净空、
  可选 Ground 等价性）。对原失败源码只读诊断，精确复现同一 segment、两个方块与
  34,686 可站点等全部统计。typecheck、零债务 boundaries、Case 准备 11 项及
  Host Package/Ground 直接集成 3 项通过。Builder 整组 107 项通过，仅重新打包测试
  60s 超时；同步 main 已有的 120s 测试设置后，该项、冻结字节及角点对照 3/3 通过。
  修复已具备启动新 Case 的验证基础，尚不能标为生产流程跑通。
  原失败产物保留。另有 Studio 单模式旧断言和五处资源回收 Scene 扫描的合入检查
  待处理；具体依赖、所有权及所需证据已写入主实施计划。

- CF-05/R1 浏览器异常恢复（2026-09-07，未提交树）：恢复旧分支精确 prepare 失败
  条件与一次 neutral Tick，不扩大到脚本或正式 Capture。Runtime 只提供原事务回滚
  后的一次性错误码/阶段证据，Native 对可恢复请求返回独立拒绝诊断并保留幂等收据；
  浏览器清空实体按键和箭头速度后只补一次，失败停止。外部 integration/rollback
  失败仍关闭 Session。Viewer 33/33、实际 Native 与条件边界 27/27 通过；补充验证
  5 Tick 历史回滚、重复拒绝幂等且补救只到 Tick 6，最新定向入口 5/5。协议拒绝码
  绑定 fixed-input.run，parser 13/13。真实 Browser 注入一次 checkSupport 失败，
  收到恢复警告、按键/箭头速度清空后仍从 Tick 141 推进到 161；旧阻尼收敛后 yaw
  差为 1.4047231433611529e-8。原鼠标/滚轮、Reset 和跨源隔离断言仍通过。
  类型检查、零债务 workspace boundaries、481 文件 census、原 3C（11/34/10）通过；
  冻结工具类型图与当前源码精确一致，便携工具单独复验通过，没有放宽超时。
  这关闭本切片的定向实现/Browser 证据，不代表完整 CF 或最终 Case 已完成。

- CF 试跑交付（2026-09-06）：按用户要求将本轮实现和生成工具集中交付到
  `codex/cf-production-effect-closure`，附
  `docs/superpowers/skills/cf-trial-run.md` 的本地命令、环境和回传说明。新生成的历史
  Case/规划图片目录不包含在代码提交中，原产物保留。本次交付结构检查通过：
  test census 479 项和 3C migration ledger；不把此前的 focused/合成捕获证据称为
  最终 exact-SHA 全仓 CI 或独立审查。该版本仅供同事试跑，完整 054、第二张图及
  CF 容量/地理还原仍未验收；不合入 main。运行时请记录实际提交 SHA 并冻结实现文件。

- CF-20/MEM2 实验已撤回（同日）：同形状 Geometry 共享的单测曾通过，但实际 Browser
  PNG 有 88,589 个像素变化。已核对 Babylon 9.23.0：实例矩阵/颜色 vertex buffers
  也写入 Geometry，跨批次缓存导致混用；总 JS heap 仅由约 1.10GB 变为 1.08GB，
  没有显著容量收益。已删除本实验的 cache、共享 snapshot 与配套 copy-on-write 改动，
  保留之前已验证的 MEM1 闭包引用释放修复。实验报告保留供追溯，不算等价性/性能通过。
  本轮同时补齐已落地 Subject parser、Host/testing/shapes 导出的旧测试清单；Authoring
  依赖只精确允许 `authoring-manifest.ts` 的既有 Subject parser，不开放其它 Runtime 依赖。

- 用户更新最终目标（2026-09-06，以下开跑时机已由上方最新要求调整）：明确以 `codex/block-world-main-integration` 为行为基线；
  当前本地 `origin/codex/block-world-main-integration` 引用核实为
  `9e35ab53c634acaef8c53a33082fff77653f7bbb`。所有 CF 开发及对齐完成后才跑最终本地生产
  Case；若该链路发现仍有偏移，按老分支实际逻辑修正新实现，并重验受影响链路，不能
  因新链已能跑通而保留偏移。无新增普通 gate、参数/时序/细节尽量一致及不用子智能体
  的要求继续有效。此处只记录目标更新，不变更任何任务的完成状态或替代正式验收。

- 按最新授权启动真实本地 Case（2026-09-06 17:48 CST）：
  `paper-moon-054-cf-closure-local-0906`，原始 054 PNG 与既有用户 prompt 不变；原图
  SHA-256 `080d951445bae3a8584363f0be5ef9194b5eff88e7b64da40d2a81f6a923972e`。
  候选为 `44897be3fe205316d01f16637e0878e936410178` 加当前未提交输入；1,606 个实现
  文件指纹 `f06cda5806a78b61496c6b376c1277187594441d67ec5e5963b218269faedfd3`
  （git tracked/非忽略 untracked，排除 docs、artifacts、历史 scene-plans）。运行期间
  固定实现不变，仅更新进度文档。`WORLDKIT_CODEX_BACKEND=local pnpm agent:world`
  普通完整 Scene 入口，Node 23.11.0、本地登录已确认；不是 dry-run、strict-acceptance
  或另开子智能体。父进程 PID `72273`；私有日志
  `/tmp/worldkit-054-cf-closure-local-Co3zIO/production.log`；Planner task
  `planner-20260906-094803-72318` 已创建，当前仍在规划，尚无成功或视觉验收结论。
  该单 Case 不替代全仓 CI、独立审查或未实现 CF 父项的完整验收。
  17:58 CST 更新：Planner task outcome `completed`、portable self-check 与 Host replay
  通过，普通入口打印 `plan-ready`，真实规划交接未触发 EEXIST。新 Run
  `run-20260906095814-72302` 已进入 Attempt 0 Builder；这是 Node 23.11.0 的真实
  交接证据，Node 25.8.1 仍以 CF-09 的同版本 26/26 回归为证，不混称整条 Node 25
  生产验收。生成、Ground/Package/Capture/发布与实际场景还原结果仍待。
  用户追加条件：当前 Case 跑通且实际场景无问题后，换一张参考图再跑完整链路；第二
  Case 同样无问题后才将 CF 分支合入 main。此为条件式合并授权，不是立即提交/合并，
  不允许只凭进程 exit 0 代替图像检查或省略合并必要验证；失败先归属 CF 并补完重验。
  18:14 CST 终态：父进程 exit 1；Builder 物理任务 exit 0，但 Host self-check 拒绝，
  productionOutcome failed、publicationOutcome not-published、Evaluation not-run；
  没有 Native Check/Ground/Package/Capture 或成功 Run Receipt。具体两个诊断为
  `NATIVE_BLOCK_BUILDER_AUTHORING_INVALID`、`NATIVE_BLOCK_BUILDER_VISUAL_IDENTITY_INPUT_INVALID`。
  已定位为 CF-12/19/HOST-INPUT-REPLAY：交付 Source 只有三个文件，而检查器仍从它的
  inputs 子目录读 Subject/Bootstrap；现改用显式 palette 路径所在冻结输入包，不再
  回退到候选自带输入。三个回归先 RED，最终两文件 123/123、typecheck、diff check
  通过；已包含实际 production subprocess 分离目录回归和冻结输入损坏/候选诱饵。
  同一真实 Source 原字节用新检查器复验 ok=true、全部诊断为空，没有重新调用模型。
  这不改写原 rejected receipt 或将失败 Run 升级成成功。
  同源 advisory renderer 复验得到 7,868/8,000 Blocks（ground 2,580、route 480、
  structure 2,168、background 2,166、water-like 474），报告和两张图在
  `/tmp/cf054-source-budget-HVa7Cf/`。已实际查看：连续山体/谷地体积大面积缺失，
  入口高差与场景覆盖仍有明显偏差；这是真实生成 Source 的 advisory 证据，不是
  Runtime Capture。下一项优先 CF-20 的容量/表示与 CF-11/21 的地理还原，不以增加
  普通 gate、调低验收或继续盲目堆提示词替代缺口。第二张候选为已查看的测试集
  `021_dog_four_season_garden.png`（开放花园/溪流/弯路、四足主体），仅在本轮真正
  验收后启动；第二图、整仓 CI、独立审查、提交、推送和 main 合并均未执行。

下表记录旧分支中仍有价值、但不能证明已在 current `main` 闭合的工程行为。每项先从 current tree
写 RED 或量测；历史实现只是线索，不是 cherry-pick 授权。

| ID / 优先级 | Goal and independently verifiable deliverable | depends_on / blocks | Exclusive owner / stable output | Required evidence | Mode |
|---|---|---|---|---|---|
| `BWMI-CF-01` / P1 | 把 Layout Solver 的递归 DFS 改为不消耗 JS 调用栈的等价确定性搜索；保持候选顺序、budget、preference/local cost 和 signature tie-break | depends_on: —; blocks: 大规模 Authoring 可靠性 | `packages/layout-solver`；相同输入产生相同 report/hash | 先以当前 10,000 fixed entities 复现，再跑 focused solver fixtures、确定性 Hash 与 typecheck | sequential |
| `BWMI-CF-02` / P1 | 为正式 Browser Capture 建立唯一 progress/stall-aware startup watchdog，区分进展、停滞、终局错误和 transient navigation | depends_on: NBR-45; blocks: — | 现有 Host Capture launcher；typed/bounded/redacted startup diagnostic | 当前 slow/stall RED、hard/stall timeout、revision progress、navigation churn、throwing cleanup 与真实 Browser | sequential, main-agent-only for Browser evidence |
| `BWMI-CF-03` / conditional P1 | 复现 Babylon/Havok `supported/sliding + zero normal`；仅当 current RED 成立时，在现有 BodyPort transaction 内按 upward departure → admitted contacts → unsupported 解析 | depends_on: current `@babylonjs/core@9.23.0` reproducer; blocks: NBR-70 only if reproduced | 唯一 Character Body/checkSupport owner；无第二 support state | fake driver、真实 Havok jump/landing、每 Tick 一次 checkSupport、Snapshot/Reset/Replay/Rollback；严禁伪造 `[0,1,0]` | sequential, main-agent-only for Runtime closure |
| `BWMI-CF-04` / P1 | 闭合同一 Bootstrap 在 interactive Preview、Formal opening 与 artifact preview 的 Camera position/target/FOV parity，并决定 Camera committed render interpolation | depends_on: WRC-CAM-1/2; blocks: WRC-CAM-2 | 当前 Camera Domain/Director；pixels-only render pose history | 非对称 Case、alpha `0/0.5/1`、Reset/rebind/view switch/pause/rollback、Snapshot 不变和两轮 FeelReview | main-agent-only |
| `BWMI-CF-05` / P2 | 冻结 provider-neutral Runtime/Capture flight diagnostic，而不是复制旧 provider telemetry 或 neutral-input retry | depends_on: PHO-5, WRC-CAM-2; blocks: — | 现有 Runtime/Browser diagnostic projection；bounded/redacted immutable trace | schema/parser、预算/截断、secret/provider redaction、two-session isolation、Reset/Replay 和 typed recoverability tests | sequential |
| `BWMI-CF-06` / P2 | 对大量 Feature inspector 行做有界 window/overscan 渲染 | depends_on: Unified Scene Viewer; blocks: — | Playground inspector UI；view-only window state | 5,738/10,000 rows、滚动边界、选择/ARIA、dispose、DOM count 与交互 smoke | parallel-safe |
| `BWMI-CF-07` / P2 | 当 Runtime canvas 与请求 raster 精确同尺寸时直接 `captureStream()`，否则保留缩放 copy fallback | depends_on: P0.2 Capture; blocks: — | `CanvasRecorder`；媒体字节与 conformance 不变 | exact/mismatch raster、24fps、cleanup、真实 Browser CPU/frame-drop 对照；不得合成或复制帧冒充 Runtime render | sequential |
| `BWMI-CF-08` / P1 | 修复 Recording Workbench current-only `visualTargetId`/`id` 半迁移 | depends_on: —; blocks: P0.4 Provider slice | `apps/studio/src/recording-workbench.mjs`；一个 `visualTargetId` contract | 从 `resolveSceneAssets()` 到 prompt、补充 tri-view 次序、API URL、portable bundle 的集成 RED/GREEN；禁止 alias/fallback | sequential；工作树 code + focused 已实现，Studio 9/9 与 Playground 4/4；最终集成/真实媒体 pending |
| `BWMI-CF-09` / P1 | 让 Planner 长任务从首次读取到 Case freeze 使用同一冻结参考字节，并让 Host replay 使用 Request/Receipt 绑定的 checker/Skill identity | depends_on: —; blocks: NBR-20 formal evidence | Planner Host wrapper与 Native Case preparation；immutable input/checker hashes | source file 中途替换、live checker 中途替换、stale receipt、same-bytes resume、cleanup tests；正式 task 仍为一个 Planner | sequential；工作树 source bytes + frozen execution Request/Receipt 已实现，focused passed；真实 Planner/Cloud pending；CF-31 的完整阶段恢复仍 open |
| `BWMI-CF-10` / P1 | 按旧分支闭合 Planner 两张图的生成顺序、语义准入与相互依赖：先生成/实际检查 entry，再以该确切已接纳像素生成 World Plan；两图使用离散 Block 身份色。World Plan 对 Brief 声明的 1--5 个目标全部硬检查，单目标至少 `max(32px, 0.005%)`；entry 只对 Subject-1 硬检查，至少 `max(64px, 0.10%)`、水平中心误差不超过 `1.5%`、16:9 误差不超过 `2%`。非主体在 entry 的尺度、相干性与歧义只作 advisory，不得成为旧分支没有的普通生产 veto。任一已接纳 entry 像素变化使 World Plan/Receipt stale | depends_on: Unified Planner; blocks: NBR-20, WRC-SR-1 | Planner Skill/checker + Host replay；target-selection ledger、旧阈值 mask measurements、pair-dependency hashes | 漏掉身份关键完整对象、把部件/普通装饰误升 target、World Plan 缺色/单像素/散点/串色、Subject entry 错误宽高比/中心/面积、空白 plan、镜像/旋转、独立或先 plan 后 entry 生成、entry-after-plan mutation；非主体 opening 缺失不得触发全局硬失败 | sequential；候选 `58e7ebd5` implemented，真实 Case/exact-SHA pending |
| `BWMI-CF-11` / P1 | 让 Host-derived Case 对完整世界与真实通行结构足够：从冻结 Brief/World Plan 形成可审计的 bounds、entry/middle/remote/off-camera coverage、受约束桥/阶梯/门洞/分支和到达检查，不再让固定 `128m` 世界、`12m` 直线与两个 ground group 代表任意场景；reach 必须绑定冻结的局部 endpoint/stand region，禁止用跨越多区的整组 AABB 让靠近起点也算到达 | depends_on: BWMI-CF-10, WRC-SR-1; blocks: NBR-20/70 formal evidence | source-neutral Case preparation owner；Host-checkable complete-world/route coverage receipt | 开放地面、曲线路线、分支、阶梯、有限室内、远端/侧后区、空 padding、只造入口和巨大跨区 group AABB 负向 Case；不增加第三个模型任务，不让 Planner 写 Runtime 坐标 | main-agent-only |
| `BWMI-CF-12` / P1 | 闭合 Planner 主体/运动语义到 Host Bootstrap：保留旧链有序多个 movement mode 的用户语义，由唯一 Host owner 选择并哈希兼容 Subject/Capability/WRT，或以 typed unsupported/approximation 明示；把 primary visual target 绑定到 Runtime Subject 的 Capture/后续视觉身份，并由同一 Host 选择产生 target-driven opening Camera tuning；禁止所有输入静默复用固定 Cloud Ridge G Bot 地面闭包。统一 Planner Skill 必须按 Source Profile 明写：Canonical Builder 可组装受控 Subject，Native Builder 绝不拥有 Subject/Physics/Camera；当前单 mode parser/Skill 的 clean break 在此项同步实施，不把计划当作已支持 | depends_on: Subject Registry/P1.2/P1.5, WRC-CAM-1/2; blocks: NBR-20, BWMI-PROD-10/20 | Host Subject/Bootstrap/Camera selection receipt；Native Module 仍不拥有 Subject/Physics/Camera | 步行旅人、骑乘、驾驶、水面/水下、飞行与无兼容资源；主体 silhouette/identity、movement capability、主体占屏/目标 framing、Camera target、Spawn/ground/free-volume gates | main-agent-only |
| `BWMI-CF-13` / P1 | 对齐通用 Case 的 blocker 身份闭包与严格 verifier：Case blocker、Contribution blocker、formal `block-plane` criteria 必须可由同一冻结意图精确连接；不能给每个 landmark 自动声明 blocker 却只派生 pass/reach 检查，也不能删除或削弱 NBR-70 严格检查 | depends_on: BWMI-CF-11; blocks: NBR-70/90 strict acceptance，不 blocks 旧标准 `productionOutcome` | Case/Intent derivation + strict verifier；一份 blocker evidence closure | 无 landmark、单/多 blocker、不可接近背景、门洞、远端实体、重复组；production passed 与 strict diagnostic failed 可并存，explicit NBR verifier 仍须 RED/GREEN | sequential |
| `BWMI-CF-14` / P1 | 修正场景还原视觉量测等价性并使用真实多视角证据：expected/observed silhouette 均采用同一定义，区分可见像素、遮挡、空洞与重复实例，world-side/top-down 不能只是签名/Hash 附件 | depends_on: BWMI-CF-10, WRC-SR-1; blocks: BWMI-PROD-10 | Capture measurement + reconstruction evaluator；per-view target observation/metric definition | 实心/中空拱门、完全遮挡、部分遮挡、分离重复组、相同 AABB 不同内部结构、Opening 相同但 top/side 不同；诊断不得把正确空洞误修为 enlarge/shrink | sequential；任务分支 `c52f12b8` 实现/专项验收完成，main 集成与整分支最终 gates 未完成；不代表总体模型效果等价 |
| `BWMI-CF-15` / P1 | 对齐旧链结构支撑生成语义：按参考保留桥墩、体积、拱洞和有意悬浮；删除“所有结构填到全世界最低层”的额外要求。全局 face-contact 支撑计数继续 advisory，不新增 Case policy/gate 或 floating approval/disposition；实际站立支撑、净空、必需通行仍由既有 Ground 验证 | depends_on: pinned old `9e35ab53`, Native Block Profile; blocks: WRC-SR-1 效果证据，不新增普通生产阻断 | live/frozen Builder 指令；既有 Native Check/Ground owner 不变 | 六种 palette role 的 support warning、低处装饰不改变有效地面准入、实际缺脚底支撑仍拒绝；Skill RED/GREEN、冻结副本一致与最终真实效果另计 | main-agent-only/sequential；R1 指令实现及定向验证闭合，最终真实效果待验收；原新增 gate 提案撤销 |
| `BWMI-CF-16` / P1 | 修复 current styled-image 假通过，同时保持旧成功标准：base Visual Reconstructor 在同一任务内完成 opening 自检，再由 Host 做历史等价的 file/hash/role closure，随后 tri-view 必须消费该 opening 的确切像素/Hash；新增独立 base semantic Reviewer 只能写 strict diagnostic，不能成为普通生产 veto。保留 Front/Right/Back 与 semantic-front 方向；纯签名/Hash 完整性只能标记 generated，不能单独伪造任务内 visual pass | depends_on: P0.2 Capture; blocks: BWMI-PROD-10/30, Recording Workbench | `scripts/visual` launcher/generator/finalizer；same-task self-check + Host closure + accepted-opening receipt；可选独立 diagnostic ledger | opening identity/geometry drift、tri-view 跨图身份/材质漂移、Front/Right/Back 调换/镜像、单图失败修复且其余 pass Hash 不变、independent diagnostic 不改判 ordinary outcome | sequential |
| `BWMI-CF-17` / P1 | 保持旧单段 Seedance technical conformance 的精确参数和成功语义；保留 scale/pad/fps/tpad/trim、音频流存在及最终 raster/fps/frames/audio 检查。短片、静态尾、留边和静音不新增 raw-quality veto；技术通过仍不冒充语义通过。撤销原新增 raw-admission gate 与强制 raw-retention 提案 | depends_on: P0.4 Adapter, pinned old `9e35ab53`; blocks: BWMI-PROD-40 parity evidence | 既有 Video runner；raw media measurements + final Hash，生命周期不变 | runner 字节一致、合成短竖版/静态/静音允许并真实补帧留边、缺音轨仍拒绝、首尾像素/帧数、raw 输入不变；最终真实媒体效果另计 | main-agent-only/sequential；R1 单段实现 parity/本地合成媒体验证闭合，最终媒体效果待验收 |
| `BWMI-CF-18` / P1 | 把 committed strict NBR Case 补齐到 current named Planner-input 合同并按语义角色准入：`world-plan.png`、`entry-whitebox-target.png`、Brief、用户参考和各自 Hash 必须同时存在，Builder 不得被要求读取一个 Request 未提供的文件 | depends_on: BWMI-CF-09/10; blocks: NBR-70/90 | strict Corpus Case/Generation Request；typed reference roles | missing/duplicate/wrong-role/stale plan image、Skill/Request disagreement、exact-SHA Case replay；旧 Case 证据不继承 | sequential |
| `BWMI-CF-19` / P1 | 把旧 Builder 最有效的反馈行为按 current Owner 重建：在同一个 Native Builder Task 内，从尚未准入的三份 source 输出生成一次性 entry/top-down advisory 投影，与冻结 Planner intent 做左右对照，要求 Builder 实际视觉检查并只修 source，最多使用同一 `builderSelfRepairAttemptCount`；Host 仅复算投影像素/身份，绝不自动判相似度或产生第二个 Capture/Compiler | depends_on: BWMI-CF-09/10; blocks: NBR-20、默认 Native 正式生产 | Native Builder Skill/authoring workspace only；disposable comparison images + self-check ledger，无 Package/Receipt/Capture truth | 非对称 geography、镜像/旋转、目标位置/朝向/尺度、route bend、前中后景/遮挡/厚度；stale input、修复后重投影、Host decoded-RGBA replay、首次通过率与后置 repair/cost 的真实 Case 对照 | sequential；候选 `58e7ebd5` implemented，真实效果对照 pending |
| `BWMI-CF-20` / P1 | 在 Planner→Case→Builder 之间冻结 Block 表示/复杂度/预算可实现性合同：Planner 目标必须能在形状、lattice、显式支撑、Collider 和量测过的 Native Browser/Havok 预算内表达；输出按世界/地面支撑/语义目标/细节分区的 budget-pressure receipt，超预算时由 Planner/Case 有界降复杂度或 typed reject，不能让 Builder 静默删掉世界 | depends_on: BWMI-CF-10/11, WRC-QP-3; blocks: NBR-20、默认 Native 正式生产 | Native Profile budget admission + Planner/Case feasibility receipt；不让 Planner 写 Block 坐标 | CASE-054 `1974/2000` 饱和基线、4/8/16/32m Chunk 与 2k/更高候选的 Browser frame/draw/memory/Capture/Havok sweep、宏观世界优先级、细节饥饿/支撑开销、typed over-budget；旧 `102400` 只作历史压力基准，不直接移植 | main-agent-only for measured budget selection |
| `BWMI-CF-21` / P1 | 冻结 source-neutral 全场景显著要素与宏观构图覆盖，不把非 visual-target 的桥、瀑布、侧塔、庭院、山岭、树林、路径围护和负空间静默塞进 generic ground/background 后失去 presence/completeness/placement 证据；保持 visual target 仍只表示少量身份关键完整对象 | depends_on: BWMI-CF-10/11/14; blocks: NBR-20, WRC-SR-1 | Planner/Case scene-feature inventory + Capture/Evaluation scene-level coverage receipt；不增加 Gameplay/Collider 身份 | CASE-054 全要素清单、entry/middle/side/rear/remote 分布、宏观 silhouette/密度/负空间/遮挡、重复普通装饰的有界统计、只保留 palace/直线地面负向 Case；不得把每棵树/每盏灯升级成 visual target | sequential, main-agent-only for rendered evidence |
| `BWMI-CF-22` / P1 | 闭合 Planner identity palette 到 Case、Generation Request、Builder authoring 与 Capture semantic map 的精确映射：冻结 palette/hash 与每个 `visualTargetId -> visualGroupId -> color` join，Builder 使用不同 RGB 必须在 Native Check 前失败，禁止仅比较由同一错误 metadata 派生的两份结果形成循环自洽 | depends_on: BWMI-CF-09/10; blocks: NBR-20, WRC-SR-1 | Host-owned palette input/receipt + Native Check identity join | CASE-054 `#F28E2B` vs `#F28A2E` RED、missing/stale/wrong-target/duplicate color、大小写/编码规范化、repair 后 Hash 更新、Capture segmentation 与 expected palette 同源 | sequential；候选 `58e7ebd5` 关闭已有 Case visual-group rows，目标纳入与 per-view 证据由 CF-24 承接 |
| `BWMI-CF-23` / P0 | 按旧分支精确成功/失败语义建立唯一 current `productionOutcome`：requested scope 的 Planner、Builder visual self-review/Host replay、可信 Native build/ground/package、Babylon Capture、entry validation 及该 scope 必需的 visual/Episode/media 产物全部闭合即 `passed`；当前七维/NBR-70 等超出旧链的严格检查只写独立 `strictDiagnosticOutcome`，不得把已通过生产改成失败。CASE-054 必须投影为 `productionOutcome: passed`、原子 `published`、`strictDiagnosticOutcome: failed` + `NBR70_BLOCKER_IDENTITY_MISMATCH` | depends_on: current production runner/publisher; blocks: 所有 BWMI production outcome/publication | current-only production outcome contract + strict diagnostic receipt；一个业务终态、一个独立严格诊断；直接删除 `preview-ready/not-accepted` 类型、Studio 投影、publisher bypass、重复 verifier 发布门及仅服务旧权威的测试/帮助函数，不加 mode/alias/fallback | 旧 Scene/Episode 状态机逐条件 fixtures；strict pass/fail/incomplete/not-run；下游失败不撤销已接纳 whitebox；cancel/resume/stale/partial；Publisher 保留 Hash、路径安全、fsync、atomic rename，strict verifier 仍可显式运行；clean-break census 归零 | main-agent-only；候选 `58e7ebd5` implemented，真实 CASE-054/exact-SHA pending |
| `BWMI-CF-24` / P1 | 为每个非主体目标冻结 source-neutral per-view 证据处置，同时保持唯一 Case 身份行：`not-required | presence-required | reference-projection-required`。opening 无可靠 mask 时不得删除目标或凭空造 bbox，也不得因旧分支未要求它出现在 opening 而全局失败；可要求 top-down/side 的真实 Host Runtime observation | depends_on: BWMI-CF-10/14/22; blocks: NBR-20, WRC-SR-1 | Case target identity + Formal Capture semantic observation；每视角一个 closed disposition | opening 缺失/弱 mask、top-only/side-only 目标、遮挡目标、required view 缺失、真实 PNG 与结构观测同源；禁止伪造 target bbox | main-agent-only |
| `BWMI-CF-25` / P1 | 让不可变参考输入正式支持 WebP，保持一次读取、媒体签名/解码/Hash 与 Planner/Case 同字节闭包；不得靠扩展名或转成另一张未绑定图片绕过 | depends_on: BWMI-CF-09; blocks: NBR-20 input coverage | reference media admission/decoder | lossless/lossy WebP、动画/畸形/扩展名错配、TOCTOU、Planner/Case hash 一致 | sequential；工作树已贯穿 snapshot/Case/Request/Publisher，focused passed；真实完整 Case pending |
| `BWMI-CF-26` / P1 | 对照旧分支逐条件冻结 source repair 与 provider terminal retry：Host 诊断失败不隐式重建；旧 Cloud 已明确失败的任务按分类/原预算重试，pending/unknown 只 reconcile；保留一个 `productionOutcome`，Profile 不得选择更严的普通成功标准 | depends_on: BWMI-CF-19/23; blocks: 默认 Native production parity | production runner/journal + 唯一 task router/recovery owner；分别记录 source Attempt 和 provider Task Attempt | 旧 failure matrix、repairable/non-repairable、0/1/3 source repairs；Cloud terminal task 最多 3、task-timeout 最多 2；unknown 不重 POST，passing artifact Hash 不变 | main-agent-only/sequential；26A code/focused passed，26B provider terminal retry open，不结项 |
| `BWMI-CF-27` / P1 | 消除 Planner 对固定身份色的概率性命中：保留旧 World Plan 全目标与 entry Subject-1 门禁，但让 Planner 以可验证的结构/遮罩或等价确定性机制产生 palette-critical 标记，禁止 Host 在目标缺失时盲目补色伪造 presence | depends_on: BWMI-CF-10/22; blocks: 默认 Native production 的稳定成本与首次通过率 | Planner output contract/self-check；身份标记的语义来源与像素生成必须同一闭包 | CASE-054 主体 `#E85D5D` 从 0/79 经多轮仅到 1-4/79、最终同周期补偿通过；不同光照/抗锯齿/压缩、真正缺失目标、标记位置漂移、修复预算耗尽；门禁不得放宽 | sequential |
| `BWMI-CF-28` / P1 | 消除便携 Native Builder checker 的第二套 Brief/Palette 合同；Case/Request 校验原始 Brief bytes，Palette 校验同一正式 parser 的语义 Hash，不能直接比较两种 Hash | depends_on: CF-09/22; blocks: Builder 到 Native Check 的真实输入闭包 | `scripts/agents/agent-native-block-builder-self-check.mjs` + shared bundle builder；Skill、Host CLI 与冻结副本同源 | 真实 Brief 正向、raw/semantic 错绑、Brief 改字节/符号链接、生成 bundle drift、真实 Case；删除手写 Palette schema 副本 | main-agent-only；`66dff3a2` 后工作树已修，focused passed，真实 Case pending |
| `BWMI-CF-29` / P1 | 保留跨 Generation→Run→Production 的真实失败原因及拒绝产物，不能被 uppercase-only result parser、漏项 allowlist、清理或阻塞的 stderr 管道覆盖 | depends_on: CF-23/28; blocks: 可诊断性、低成本修复 | Production result parser、run allowlist、generation runner/ports；不可变 `builder-self-check.host.json` + 隔离 `rejected-source/`，均不得作为已准入 Source | `self-check-failed/task-timeout/output-missing`、13 种 Native 反馈码、provider 文本脱敏、stderr 大输出、已存在证据不覆盖、cleanup failure 保留原因；不改变成功阈值 | main-agent-only；`66dff3a2` 后工作树已修，focused 40/40 passed，真实 Case pending |
| `BWMI-CF-30` / P1 | 删除闭合 traversal union 早检中的语法误拒绝：合法 `not-traversable` 对象尾逗号/注释不能被当作另一分支字段 | depends_on: CF-28; blocks: 合法 Builder 输出稳定性 | 同一个便携 checker；Native Check 仍是正式 union admission | 合法无逗号/尾逗号/两类注释与非法 `surfaceEntityId` 分支污染 RED→GREEN | main-agent-only；`66dff3a2` 后工作树已修，focused passed |
| `BWMI-CF-31` / P1 | 恢复 Native 的分阶段入口与 Host-only resume：旧链支持 plan/build/host replay；工作树已恢复 plan-only/build-only，但 build-only 仍启动新 Builder Run，尚不能复用已完成的付费 Builder | depends_on: CF-09/23/26/29; blocks: 普通生产失败恢复与成本对齐 | `run-world-agent`、Native launcher 与唯一持久 Run/Attempt owner；输入/Skill/Source/receipt 精确身份绑定 | plan-only、build-only、Host replay、已完成阶段不重投、unknown POST 只 reconcile、stale source/checker、passing artifact Hash 不变；拒绝产物不能未经准入直接发布 | main-agent-only；A/B code + focused，C/真实恢复 open；子项见下 |
| `BWMI-CF-32` / P1 | 关闭输入清单在最终 Publisher 的断链：前面必需的 `visual-identity-palette.json` 不能在发布端被误判为额外输入 | depends_on: CF-22/23/25; blocks: 普通生产最终发布 | Case/Generation 与 Publisher 共用唯一 `NATIVE_WORLD_PLANNER_REFERENCE_INPUTS_V1`，所有输入仍严格 Hash/路径/媒体准入 | 完整 PNG/WebP Case 输入、Palette 缺失/stale、额外文件、直接 `prepareNativeWorldCaseV1` 到 Publisher input snapshot，不能只测无本地输入的 Package fixture | main-agent-only；工作树已修，新增 2 个 RED 后 Publisher/contracts 128/128；最终真实发布 pending |

当前工作树补充证据（2026-09-05，仍未提交/合并）：CF-08 的 3 个 RED 已转绿，Studio recording
全文件 9/9、Playground 4/4；CF-25/32 的媒体冻结/Case 首轮 17/17，Publisher + Generation Request +
两类 shared contracts 128/128；随后补充 PNG/WebP Case preparation→Publisher 输入快照、local/cloud
Generation Request 同字节附件后，Case/Generation 两文件 46/46。CF-28/30 最终 Skill 42/42、
Run 52/52；CF-29 Generation/Ports 最终 40/40。不同轮次存在重复用例，不累加成总测试数。
这些只是当前输入上的 focused/contract 证据；没有新的真实生成/Capture/视觉对照、整仓 CI 或
exact-SHA Cloud。CF-25 统一真实媒体解码后同时删除 Publisher 独立 PNG/JPEG 签名检查副本，
不转码替换原始参考图、不改变 image Hash，也不增加视觉质量 veto。

CF-09 工作树补充（2026-09-05）：`scripts/agents/planner-execution.ts` 是唯一 Planner 上下文
冻结/重放 owner。生成前冻结实际 instruction、完整 Planner Skill/checker/refs，以及仅 Canonical
需要的 terrain exemplars；Host Request 绑定 scene/source/task/router request 和逐文件 Hash。
同一个 `run-codex-task` 接收冻结目录，Host 从该目录重放一次，精确比较 Agent/Host report 后
才写 accepted execution receipt。删除 launcher 对 live checker 和另一 live Brief validator 的重放。
Native Case staging/promotion 保留该记录，已有 Case 校验其同一 planner-self-check Hash；Canonical
build-only 也重放原冻结 checker。原语义阈值、自修复预算和 formal model 均未修改。
Native launcher 失败时保留 Planner 交付与 execution 记录，不再整目录清除；partial 产物仍不是
已准入 Case，现有 partial guard 拒绝静默覆盖，显式阶段恢复继续由 CF-31 实施。

证据：launcher live-checker 断言先 RED；增加真实 local router + fake Codex child 的隔离交付测试后，
Planner execution/Skill + Native input + public entry 四文件最终 28/28（execution 13/13）；最新
typecheck、shell syntax、diff check 通过，生成 bundle 对照 1/1（覆盖 Native/Planner/Canonical）。
测试覆盖两种 Source、live Skill/checker/instruction 变化、冻结文件增改/符号链接、stale
Request/Receipt、Host report mismatch 留存、同任务不覆盖、Case 目录替换后身份仍可验证。
这里没有真实模型/图片生成或 Cloud receipt，不关闭 NBR-20、CF-31 或整体生产效果验收。
旧 `9e35ab53:run-spatial-world-agent.sh:178-185,207-214` 同样读取 live checker，故该项是当前
迁移的输入身份安全修正，不是声称旧链已有冻结机制，更不是新增视觉门禁。

CF-26 工作树分步记录（2026-09-05，仍未提交/合并）：

- `BWMI-CF-26A`：Run/Capture 的业务层调度已经不再仅由 Profile 决定。唯一公开 production
  transaction 固定传 `executionPurpose: production`；journal 每行持久化该闭合用途，拒绝用途
  改绑和普通 Run 的外部 source-repair Attempt。严格 Profile 不能让普通 Run 重买 Builder，
  也不能把新增 Opening 质量量测升级为普通 Capture 发布 veto；原 Native/Ground/Package、
  Runtime、入口及输入/产物完整性检查保留。显式 strict-acceptance 保留原 bounded source repair。
  owner：run/journal + production ports/formal capture；依赖 CF-19/23；main-agent-only。
- `BWMI-CF-26B`：旧 Cloud router 与本地不同：`9e35ab53:run-lwdp-codex-task.mjs:29-105,
  237-242,290-396` 对 formal Scene 的已明确失败任务默认最多 3 次，`task-timeout` 最多 2 次，
  默认退避 30s/120s；auth、account/model compatibility、capacity、output omission、
  infrastructure/transport 有旧分类，deterministic capability stop 与 pending 不重建。
  每个 request id 仍只 POST 一次，不能把 unknown 当 failed。current router 已有 same-id recovery，
  但缺 terminal task-attempt loop 及完整 typed 分类/预算账本；这部分仍 open。owner：唯一 generic
  task router/same-id recovery；依赖 26A 和现有 request journal；main-agent-only。后续必须同步
  single-task 原则，明确 provider Task Attempt 与 source repair、自修复的不同计数，不能靠改名掩盖重试。

26A 证据：严格 Profile 触发额外 Builder 和 journal 缺用途记录的 3 个 RED 转绿；Run/journal/
Production/ports/Formal Capture 五文件 150/150、Native Builder Skill 42/42、typecheck 通过。
矩阵覆盖 unknown/missing/empty/timeout/self-check、Native/Package/Capture/Camera rollback、
无效 Evaluation 终态、两种 Profile 的普通诊断处置、显式严格修复 0/1/3 与耗尽。Skill 和冻结
副本同步区分 provider retry 与 in-task/source repair；旧 `before any Candidate` 错误描述同时改为
Native Check 自己拥有隔离 Candidate，Host advisory replay 在 Package publication 前完成。
这不是新的真实 Case/Cloud 或效果验收；26B 没有实现，不能因 26A 测试通过而把 CF-26 勾完。

截至本批，32 个 CF 主任务中 11 个有实现/局部证据，26/31 两个部分实现，19 个仍待实现或
条件复现；因此仍有 21 个主任务含开发工作。已实现项的真实效果和最终验收另计。26B 是 CF-26
原有 retry matrix 范围的子项，不新增主任务，也不把 provider 失败错误归为“不应重试的 Host 诊断”。

CF-31 工作树分步记录（2026-09-05，仍未提交/合并）：

| 子项 | 依赖 / 独占 owner / 模式 | 实现与边界 | 当前证据 / 状态 |
|---|---|---|---|
| `BWMI-CF-31A`：Native 阶段入口 | CF-09；`run-world-agent` + Native launcher；main-agent-only/sequential | `agent:world --plan-only` 完成 Planner、既有 Case freeze 后返回 `plan-ready`，不运行 Builder；`--build-only` 读取已准入 Case/Planner receipt，不重跑 Planner，也不读取原上传路径。缺少计划直接报告 `NATIVE_WORLD_PLAN_REQUIRED`，不偷偷启动付费规划 | public/Native entry + real Planner checker/Case 合同的 synthetic staged-flow 回归通过；code/focused，不是模型或完整生产证据 |
| `BWMI-CF-31B`：Builder 清理后保留完整输入 | CF-31A、CF-29；`generation-request.ts`；main-agent-only/sequential | durable `attempt/inputs` 与 `.task/inputs` 从同一份完整字节快照写出，包含 Brief、instruction、Skill/checker、全部参考及 prior-attempt repair evidence；持久化相同 `context/` 与 `generation-dispatch.json`（backend、原 Request/Attempt Hash、router id/payload Hash/arguments、frozen owner identities）。不保存 token，不改 Source/Generation Receipt 或成功标准 | `.task` 清理后的普通与 repair Attempt 逐文件 Hash、dispatch 身份回归；code/focused，不代表恢复调度器已经接入 |
| `BWMI-CF-31C`：显式 Host-only 恢复 | CF-31B、CF-23/26/29；唯一 Production/Run/Attempt/journal + ports owner；main-agent-only/sequential | 当前工作树已接入原 Run/Attempt 的显式恢复、no-submit generation restore、immutable checkpoint、独立 Host output epoch、verifier/publisher 引用解析及追加式恢复记录；仍禁止伪造生成 receipt、提升 rejected-source 或覆盖历史失败产物 | code/focused + `dc643d55` 上 054 同 Package 真实恢复 published；最新证据见下方执行更新。丢失 checkpoint 与多次中断/已发布响应丢失的完整故障矩阵仍须闭合，完整效果验收未完成；`--build-only` 仍不是此恢复入口 |

本批改变的是 CLI 阶段控制与 durable input inventory，未改变模型、prompt、质量门禁、修复预算、
Runtime 或发布成功标准。首轮 public/Native entry + Generation Request + staged-flow 四文件 56/56；
typecheck 通过。staged-flow 使用合成图片、真实 Planner checker 子进程/Case freeze，只有 Planner
交付和生产 handoff 是测试替身；它不是新的 CASE-054、真实 Builder 或视觉效果验收。后续补充
repair cleanup focused 1/1（含完整 prior source/diagnostic Hash）与真实 Native Package 直接消费者
focused 1/1（执行 Native Check/Ground/Package，不含 Browser）均通过，不与上述重复用例累加。

2026-09-05 当前执行更新（下方 R1 优先级讨论保留为历史，不再表示当前暂停项）：

- 用户最新明确顺序为 `CF-27 → CF-02 → CF-31C → CF-24 → CF-26B`，五项均要求实施后再跑新 Case。
  CF-31C/26B 不再暂停；仍由主智能体顺序集成，不新增外部任务或放宽普通成功门禁。
- CF-27：工作树已接入 Planner 显式选区 palette authoring、`pngjs@7.0.0`、共享 PNG codec，
  删除 checker 手写 PNG 解码器；Skill 指导先确认已有目标再配色，Host 不自动补目标。原阈值不变。
  Planner/checker/Skill/bundle 四文件 41/41；随后补齐隔离 CLI 与冻结分发，四文件 33/33（有重复，
  不累加）；typecheck 通过。尚无修复后真实 Planner/效果证据，不将真实首次通过率视作已验收。
- CF-02：工作树已用唯一 watchdog 取代固定 30s ready wait；旧 180s hard / 45s stall 参数、
  Host 初始化阶段 revision、context navigation 不延长 deadline、挂起 probe 取消与资源清理。
  startup/transport/route 三文件 46/46；真实 Chromium 合成服务器回归：持续进展 35,418ms ready，
  stall 1,833ms、terminal error 336ms 按预期失败，context 全清理。入口 `pnpm verify:capture-startup`。
  该证据不是真实 Native 场景、完整 Case 或最终效果验收；page-error/crash 监听已补针对性回归。
- 用户已授权子智能体：CF-26B 独占 router/retry owner 并行实现，CF-24 在主会话冻结逐视图
  合同后独占 Case/Capture/Evaluation 链实现；主会话完成 CF-31C 与所有共享消费者集成。
  CF-24/26B 尚未获得集成完成证据，不能由 worker 单测通过推导五项完成。
- CF-31C 当前工作树新增显式 `--resume-host-only`、no-submit `restoreGenerated`、四阶段 immutable
  checkpoint 与 Hash inventory、原 Run journal 追加恢复边界。未通过阶段的新产物写入原 Attempt
  的 `host-recoveries/<index>`，旧失败文件及已通过产物不覆盖；verifier/publisher 已改为解析收据中的
  本 Run/Attempt 具名产物路径。已完成生成的 Request/Receipt/dispatch/context/source 验证后复用；
  原任务未知时只协调原 id，不准备或提交新的付费任务。完整 Run Receipt 已存在时复验并继续发布。
  四组 checkpoint/ports/journal/Run 回归 104/104；真实 WorldPackage 的恢复路径 verifier+publisher
  focused 1/1 通过（保留历史失败文件）。后续补的丢失 checkpoint 读取、publication 续接及路径对抗
  仍在验证；真实 Native Check/Ground/Package 新回归 1/1 通过，38.36s，原 Generation Receipt、
  Source 和历史失败 Check 字节不变。首轮误用 30s 测试预算超时，已对齐同文件既有 60s 测试预算，
  未改生产 timeout。最新 typecheck 通过；这不是新的模型 Case/完整 E2E 证据。
  最新 checkpoint/ports/journal 三文件 40/40（覆盖前述 104 中部分用例，不累加）；Host recovery
  factory failure 保留原 Run/锁冲突及 CLI 显式模式 focused 2/2；丢失 checkpoint 的原 Receipt 重建与
  已发布同身份 final 的只读验证分支已接入，完整多次中断矩阵尚未验收。无新模型任务、Case、提交或合并。

  本次并行推进补充：Run/checkpoint 74/74，覆盖 Native Check、Package、Capture、Evaluation 执行失败
  及每条路径的再次 Host 中断，仍为同 Run/Attempt/request，不调用 paid generation；新增 owner-receipt
  丢失 Host checkpoint 重建 1/1（真实 prepare/generation receipt，模拟任务输出，无模型），同时拒绝
  changed source/context/request/owner Hash。publication 两个 RED 暴露已存在 strict diagnostic 被误拒；
  现只在显式 resume 时按 exact bytes 复用，不覆盖 drifted receipt，发布前中断/发布成功响应丢失两项
  回归 2/2 通过。四项真实 publisher/verifier 直接回归 4/4 通过（foreign Case、预存在空 final、发布锁、
  缺失/Hash drift Capture）；具名恢复路径额外后缀对抗和四类 checkpoint 合计 6/6。上述测试部分重叠，
  不累加为 aggregate；CF-24 合同正在变更，最终集成 typecheck 和消费者回归尚待其完成。
  CF-26B 集成同时把 Native router 阶段改为旧 `coding-agent`，Request/Receipt 身份不改；Planner 仍为
  `planner`。Generation Request/runner 两文件 53/53，确保旧 Cloud retry 策略确实被 Native 调用端选中。

  2026-09-05 13:14 集成续报（仍为 `66dff3a2` 加当前未提交候选）：
  CF-31C Run/journal/checkpoint 三文件 85/85，补齐 publication 六类中断、半行 journal 尾部恢复，
  已存在 strict diagnostic 只允许 exact-byte resume；同一 Run/Attempt 不提交新生成任务。
  CF-26B router/retry 三个 Node 文件 47/47，覆盖真实子进程 SIGKILL 后同 request 恢复且无新 POST；
  这是模拟 provider 的进程级证据，不是实云 retry 验收。
  CF-24 已接入三视图 observation、Receipt Hash、publisher、strict verifier、Studio；主侧
  ports/run-production 73/73（包含 opening not-required 仍保留 side/top 目标身份），
  publisher/verifier selected 3/3（包含 Evaluation failed 仍可 ordinary publish），
  Studio Native production/launch focused 30/30（含新 observation 篡改拒绝）。
  静态 cloud-temple Case 已 current-only 迁移，历史 Run 未修改；原 generation owner receipt 恢复
  在新 Case 合同下 focused 1/1。三视图 owner 回归与最终集成 typecheck 尚在收口，尚未启动新 054 Case；
  不把这些重叠 focused 数字累加为 aggregate，也不声明 CF-24 最终效果已验收。

  随后集成 typecheck 已通过；`verify:3c-migration` 初次发现两个新增便携工具从 Authoring barrel
  带入无用 legacy 初始化。仅在这两个工具的构建中对已核对的纯 re-export barrel 启用无副作用
  tree-shaking，未新增别名/parser，未改迁移 ceiling 或结构断言；旧 Planner/Canonical bundle 不变。
  重建并同步冻结 Native checker 后，该 gate 通过（11 entries / 39 live references / 10 invariants）。
  Native Skill 与 palette 回归 61/61，包含隔离 CLI、拒绝 stale PNG、冻结副本和删去无用 legacy 字段；
  单任务原则的文本断言同步为已批准的 logical task / provider Task Attempts 分离。发布器与 verifier
  两个直接受影响测试文件全量 64/64 通过（102.74s，模拟 playability port，未启动真实 Browser）；
  CF-24 专门对抗回归、只读集成复核、新 Case 尚待。

  CF-24 集成只读复核在 Case 前定位两项具体缺口，仍归该任务、不新增状态体系：
  （1）全部 target opening not-required 时，Case/observed opening 列表仍隐式拒绝空集合；
  主侧 ports `one/all` 回归已复现 all 分支 RED。修复应只允许 opening 空集合并保持 exact-empty
  closure，不能虚构 bbox 或强留一个目标。（2）semantic set 的 camera domainOwnerIdentity 尚未
  与 Receipt SDK camera owner 精确相等，替换 ref/hash 并重算 set hash 可绕过；修复集中于共享
  Receipt binding assertion，保持普通质量 report-only，不把质量差异升级为 owner 身份错误。
  两项修复已落盘：只对三个 opening 列表允许空集合，共享 assertion 绑定 semantic/opening Camera
  owner 和 opening 内容 Hash。主侧 `one/all` 与 publisher/verifier selected 5/5 GREEN（15.47s），
  其中 all 分支由上述 RED 转绿；owner 专门对抗回归及独立复核尚待，两项不以代码落盘代替验收。
  新 Case 尚未启动。

  CF-24 owner 现已冻结：10 个直接受影响文件 236/236 通过；最后仅修测试 union narrowing 后，
  Runtime contracts 58/58 再次通过；主侧最终 `pnpm typecheck` exit 0。全部 opening not-required 的
  Case→Evidence→Evaluator、side/top presence-required + outside-viewport、不一致 Camera owner
  ref/hash（攻击者重算 set Hash）和 opening/set 共源篡改均有专门回归。
  当前运行候选为 `66dff3a2313d5ee35b2801cdf610d5afb2f6c233` 加未提交实现输入，1,237 个实现文件
  内容指纹 `sha256:ae3dd9180aaeacdfa60cb82383d862df58463a21724573cc2504ca5ce1dcf801`
  （packages/scripts/skills/app-src/固定 world-packages/config/根构建配置/当前静态 Case；不含 live docs
  和历史 Case Run）。新 Case ID 预检 `paper-moon-054-cf5plus2-local-0905` 尚未使用；本地 Codex 登录
  有效。独立 CF-24 Mode B scoped 只读复核已确认两项 P1 关闭，指定十个生产文件内无剩余 P0/P1，
  scoped diff Hash `121b9924402133c5d417877d8fdb27bbc2a4902902718ac256e12764d2da3fa4`。
  这不是全旧分支 parity/完整 WRC-1 验收。随后已发起上述新 Case：`WORLDKIT_CODEX_BACKEND=local`
  + `pnpm agent:world --scene-source babylon-native`，原始 054 PNG Hash
  `080d951445bae3a8584363f0be5ef9194b5eff88e7b64da40d2a81f6a923972e`，完整普通生产入口从 Planner
  开始，不复用历史失败 Run、不启用末尾重复 playability replay；真实结果尚待，未跑最终 full gate。
  13:34 CST 已确认本地 Planner 实际启动：`planner-20260905-053444-53398`，PID `53439`，
  formal / `gpt-5.6-sol` / `xhigh`，不是云端任务，也不是 dry-run。
  13:37 检查发现该轮执行句柄丢失，Planner/父进程均已退出，只有冻结 Request/Instruction，
  没有 Planner 输出或终态收据，退出原因未确认；不得归因为 CF-24/Native Check 失败。
  保留该轮全部文件，不把重跑伪装为同 task 恢复。随后以独立 Case
  `paper-moon-054-cf5plus2-local-r2-0905` 再跑相同本地完整入口；实现输入指纹不变。
  本地独立进程 PID `54554`，完整日志 `/private/tmp/worldkit-054-cf5plus2-local-wbWhAt/production.log`
  （文件 0600、临时目录私有），不依赖会话执行句柄保留输出。尚无成功或效果结论。
  13:49 跟进：Planner task outcome `completed`，portable self-check 与 Host replay 均
  `status: passed` / `diagnostics: []`，已进入 `plan-ready`；新生产 Run
  `run-20260905054743-54589` 已创建，journal 为 Attempt 0 `initial-generating/before`，
  `executionPurpose: production`。这证明 Planner 交付已通过，不是 Native Check/Package/Capture
  或最终效果通过；本地生产入口仍在运行，继续跟进后续终态，不重复提交。
  14:04 CST 终态复核：本地父进程与 Builder 均已退出，普通生产结果为
  `productionOutcome: failed` / `publicationOutcome: not-published` / `cleanupOutcome: completed`，
  `evaluationOutcome: not-run`；日志诊断为 `WORLD_RECONSTRUCTION_CHECK_FAILED`、
  `native-check-rejected`。Attempt 0 generation receipt 为 `completed`，Host Builder self-check
  为 `ok: true` / `diagnosticCodes: []`，已交付 `source/scene.ts` 与入口、俯视 advisory 对比图；
  随后 Native Check 因 4 个 `WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED` 拒绝，位置为
  `scene.ts` 324:32、324:48、325:27、327:27（偏移数组解构后的运算）。尚未进入正式
  Ground/Package/Capture/Evaluation，不能评价最终还原效果或宣称 CF-24 真实验收通过。
  此次证据重新暴露 CF-19 的 Builder 自检通过但 Host Native admission 拒绝缺口；具体为何
  未在任务内修复仍待代码核对，不归因为已修复的 CF-22 visualGroup 错误，也不先定性为门禁过严。
  原始收据保留在上述 Run 的 `attempts/0/`，终态日志保留在上述私有路径；停止本轮 heartbeat，
  不自动重启、重交生成任务或改写失败产物。

CF-19/29 本地测试前补漏（2026-09-05，主会话；随后提交为 `5a1508ea`，不代表完整 CF-19 效果结项）：

- 新增唯一共享 Native TypeScript policy/诊断格式器；Builder 便携 checker 内嵌构建时冻结的当前
  SDK/type-library 输入图与 TypeScript，不手写 API 类型、不依赖任务目录的 node_modules，也不执行
  SDK/Candidate。Host 仍独立准入。旧 `noUncheckedIndexedAccess/strict` 参数没有放宽。
- 原 r2 Attempt 0 `source/scene.ts` 原始 SHA256
  `d904f3ebbe01556ebcff9b0fec70e823ff068224410ab74f26b4618816a50f9c` 在新 checker 中约 2.7s
  精确报出四个 TS18048，位置与原 Host 报告一致；固定元组的 focused RED→GREEN 通过。
  任务内具体类型错误、结构反馈和视觉修复共用既有预算，每次改源码都须重新检查/出图。
- CF-29 保留有界、脱敏的 TS code、原因和相对位置；Host Native Check 不再只发笼统类型失败文案。
  失败时明细进入不可变 `builder-self-check.host.json`，Run 保留 allowlisted 类型失败码；
  Generation Receipt 仍保留其原有阶段结果合同，不另建成功权威。
- 仅在 `/private/tmp/worldkit-cf19-native-check-fKBPPd` 临时副本添加元组声明后，真实 Native Check
  已越过类型阶段，但发现 `WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP`：
  `central-lower-left-0-base` 与 `lower-branch-west-x9-z2`，cell `-7,-4,-27`。
  原始 Run/Source 未修改，此临时副本不是成功生产产物。
- 因此 CF-19 同时补齐现有一次性 renderer 的 lattice/occupancy 反馈：复用 Profile 的 shape-size、
  lattice、occupied-microcell 函数，删除 renderer 手写 shape-size/rotation 副本，不增加 Scene、
  Physics 或持久 Layout。新 renderer 在该临时副本约 0.3s 给出与 Host 相同的块对和 cell。
  不提升 support warning，不改变普通质量成功标准，不承诺已覆盖全部 Native/Ground admission。
- 证据：原 Skill 文件 54 项中 52 通过、两项为文案断言及临时路径 canonicalization；修正后相关
  3 项通过。随后 renderer overlap/off-grid 两项先 RED 再 GREEN，包含正常像素、renderer 重建和
  frozen-copy 的受影响 6 项通过；类型/API/strict-options/移出仓库单文件运行已有 focused 证据。
  checker 全量便携重建/字节漂移 1/1，Host 诊断/脱敏 3/3；Run/ports/checkpoint 受影响 20/20，
  最后具体类型反馈保存/传播 1/1；最终 typecheck 通过，3C migration 通过。测试存在重叠，不累加
  成 aggregate/full gate。实际语义编译增加测试耗时，只有对应测试预算调整，生产 timeout 未改。
- CF-26A 验证类型预检失败仍只调用一次付费生成，无 Host 隐式 source repair；CF-31C 已有
  no-submit/unchanged-source/append-only recovery 受影响回归通过。恢复不能直接放行原始错误源码。
  下一轮真实模型是否按新反馈完成同任务修复、全链发布及效果仍待新 Case；不关闭整个 CF-19、
  WRC-SR/NBR-70/90 或 WRC-1，也没有运行新的完整 Browser playability replay。
- 14:41 CST 已启动新本地 Case `paper-moon-054-cf19-local-0905`，原始 054 PNG 和用户 prompt
  不变，从 Planner 开始，不复用旧失败 Source/Receipt。父进程 PID `66955`，私有日志
  `/private/tmp/worldkit-054-cf19-local-xHR4Nu/production.log`；启动复核时进程存活、Planner 运行中，
  尚无 Planner/Builder 通过或最终结果。运行候选仍为 `66dff3a2313d5ee35b2801cdf610d5afb2f6c233`
  加未提交改动，1,254 个实现/测试/Skill/静态输入文件的指纹为
  `sha256:54fa68454737c5e33936362e139041245b77b0c8169c3c85e4459ddd81b0c575`
  （不含 docs、新 Case 和历史 runs）。运行期间冻结生产实现。
  原 heartbeat `054-case` 更新返回已不存在、可能已被用户删除；未擅自重建，不声称自动监控仍生效。

CASE-054 `paper-moon-054-cf19-local-0905/run-20260905064934-66984` 终态及后续补漏：

- 本次在提交前以对应生产代码启动，随后累计改动提交/推送为
  `5a1508ea896befee3345207c884bd87feb40f932`；不能称为提交后重新运行。
  Planner Host replay 完成；Native Attempt 0 的 `generation-receipt.json` 为
  `rejected / output-missing`、`outputs: []`、`cleanupOutcome: completed`。
  最终 `productionOutcome: failed`、`publicationOutcome: not-published`，诊断
  `WORLD_RECONSTRUCTION_NO_OUTPUT`；未进入 Native Check、Capture 或 Evaluation。
- 代码核对确认 **CF-29 本地交付前失败证据缺口**：local adapter 在检查五个必需输出时
  只要任意一个缺失就拒绝整批 promotion，随后删除隔离 workspace；上层仅保留
  `output-missing`，未保存具体文件名、未交付源码或模型最后反馈。因此不能从现存收据
  断言缺的是源码还是 advisory PNG，更不能断言是类型、overlap 或 CF-19 修复耗尽。
  已被清理的原始输出不能靠本轮修复补造回来，原 Run 保持失败。
- 用户授权继续修复后，local Native dispatch 显式声明 Host-owned
  `attempts/<index>/generation-failure`，该参数进入既有 router payload Hash；失败时在
  cleanup 前保存 `report.json`（request/task identity、逐个声明输出的状态/尺寸、
  bounded/redacted 的 untrusted 最终反馈）及 `outputs/` 隔离快照。只读声明输出，
  不复制 inputs/context，不跟随软链/多硬链，不覆盖已有 evidence；快照总上限 32 MiB，
  超限只报告尺寸和省略原因。文件权限 0600、目录 0700。成功交付不创建失败报告；
  缺失、空文件、unsafe 输出、超时或任务失败仍失败，没有第四 Source 或成功 fallback。
- focused 证据：部分源码已生成但两张 advisory PNG 缺失的复现、正常 delivery、
  rejected/timeout、输出安全/限额、反馈脱敏和旧证据不可覆盖共 10/10；
  Native local/cloud dispatch 路由及 Hash 2/2；Generation 16/16；独立测试清单 9/9；
  typecheck 通过。这证明诊断保留修复，不证明真实模型交付或最终还原效果已解决。
- PR #202 在 `5a1508ea` 的 CI 停于 Studio：108/110，通过前置 typecheck；两个失败分别
  仍期望旧 `worldkit brief validate` 文本和旧缺失输出路径，实际已改为 Planner
  receipt/replay。已更新两条断言，focused 2/2 通过；不是全 CI 通过证据。
- 按用户后续授权曾创建 heartbeat `054-case-main` 继续等待并条件合并；本次 Case 失败后
  已暂停。未合入 main，未启动另一付费 Case；CI/批准审查和真实 Case 成功条件仍未闭合。

CASE-054 再运行（用户随后明确授权“继续跑”，2026-09-05 15:20 CST）：

- 新 Case `paper-moon-054-cf29-local-0905`，启动候选为干净且已推送的
  `01e91783165e88d0297fb2080356147ebf653bf6`；原始 054 PNG Hash 与用户 prompt 不变，
  从 Planner 开始走本地 `agent:world`，不覆盖旧 Case。父 PID `72004`，日志
  `/private/tmp/worldkit-054-cf29-local-yKIs27/production.log`。
- 此处仅为启动记录，尚无本次 Generation/Native/Capture/最终生产通过证据。
  使用本轮 CF-29 failure-evidence 实现，不扩大同任务修复预算或更改普通成功标准。

该 Run 后续终态（2026-09-05）：

- Builder 在既定 timeout 前完成，Generation Receipt `completed`、三份 Source 与两张
  advisory 对比 PNG 已交付，Host self-check `ok: true`，均无生成诊断；本次不是
  `output-missing` 或 `task-timeout`。Native Check `passed`、diagnostics 空；Ground
  `analysisOutcome/admissionOutcome: passed`、failureFacts 空；WorldPackage 已生成，
  `host-checkpoints/generate.json` 与 `host-checkpoints/package.json` 已保存。
- 随后正式 Capture 阶段失败，Run journal sequence 6 保留
  `WORLD_RECONSTRUCTION_CAPTURE_FAILED`；最终 `productionOutcome: failed`、
  `publicationOutcome: not-published`、`evaluationOutcome: not-run`、cleanup completed。
  当前没有正式 capture/rejected-capture 产物。现存结果仅有总括 Capture 失败码，尚不足以
  判断是启动、Host session、截图或发布子步骤；不要归咎于 timeout、几何或质量门禁。
- advisory entry 左右图仍能看到规划目标与源码投影在构图、山体和宫殿比例上的差异；
  红色方块是 SDK Subject 的 advisory 代理，并非最终人物。该图不是正式 Capture，
  不构成完整效果对齐证据，也不新增普通生产质量否决标准。
- 未合入 main、未重新付费生成。后续 Capture 定位应优先利用已保存 Package/checkpoints，
  保留原 Run 失败事实；能否完成 Host-only 恢复仍需单独验证，不能提前称恢复成功。

Capture 根因复现（2026-09-05）：同一 Package 单独调用 production Capture，在
`hosted-session` 启动浏览器前稳定报 `WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY`。
当时唯一 tracked diff 是主会话在 Case 启动后追加的本进展文档，生产实现未变；
`sdk-owner-identities.ts` 检查整个 tracked tree，因此文档改动也触发 trusted-commit 拒绝。
这不是生成超时、场景几何或浏览器卡死。不得删掉可信源码校验来放行；先提交授权文档，
在干净候选上复用 Package。CF-29 还需保留该明确错误码，不能再次只报 Capture 总括失败。
当时临时规避方式是运行期间不写 tracked 进展文档；下述用户授权的 CF-29 收窄修复替代
这项临时限制，普通文档变化不应被当成 SDK 实现变化。
按本次落盘时间估算：Planner 约 7m18s，Builder/交付约 29m04s，Native/Ground/Package
约 2m29s，Capture request 到失败约 4.5s；Builder 正常交付而非 timeout，但未保留的
细分模型活动不能事后编造为确定的思考、工具或自检耗时。

清除 dirty-tree 后，同一未修改 Package 的独立 production Capture 已成功，全部清理 completed，
证据 `/private/tmp/worldkit-cf29-capture-F2wWjE/capture`，Package root
`sha256:802a6e2be3915164e5d67aa1456276f7c2a63c14afe698f313205793aeddf028`。
这证明 Capture 本身可执行，不等同原 Run 已发布。
第一次 Host-only 恢复又暴露 CF-31C 缺口：materializer 对原 Attempt 已存在的 Capture Request
再次新建，报 `FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID`。现已在唯一 materializer 接入
required `outputMode`：fresh 用 `create`，Host recovery 用 `verify-or-create`；重算全部冻结
identity 后只复用字节完全相同的 canonical regular Request，不覆盖、不接受漂移。
CF-29 Run allowlist 同步保留 SDK owner dirty/unavailable 原因，未放松 source-commit 校验。
受影响 request/Run/production ports 112/112、typecheck、3C migration 通过；其中修复了该
request fixture 尚未同步 CF-24 viewRequirements 的旧输入。下一步从干净提交恢复原 Run，
不重新调用 Planner/Builder；恢复结果待真实执行，不预先勾选。

Host-only 恢复终态（2026-09-05，干净 `dc643d556fa55c0a9f0a1032abbc7a9a83050743`）：

- 同一 `paper-moon-054-cf29-local-0905/run-20260905072747-72050`，恢复输出在
  `attempts/0/host-recoveries/2`；正式 Capture、Evaluation、发布和清理均已执行结束。
  `productionOutcome: passed`、`publicationOutcome: published`、`cleanupOutcome: completed`，
  第三人称入口验证 passed。Run receipt 落盘 `2026-09-05T08:18:30.683Z`；本次恢复约 2 分钟，
  没有新的 Planner/Builder 调用，Attempt count 仍为 1，恢复锁已释放。
- 原三份 Source、Generation Request/Dispatch/Receipt、Package integrity 和 Capture Request
  的 SHA256 全部与恢复前一致；Package root 仍为上述 `802a6e2b…`，Capture Request
  `5e8643c0…`。原失败 journal 保留，恢复与发布追加到 sequence 19–36；未覆盖失败事实。
- 正式 Capture Receipt hash
  `sha256:e42b990cc5efbb396d8be5d3b4d2125e715b5b1a87449cc8625de6834ff9c464`；
  Run Receipt hash `sha256:b05f11eac3cb3ca2cc106e898e98e9ce33b274cde1670f99870acdd7aea36bd4`。
  正式产物位于 Case 的 `final/`，Opening 为 `final/capture/opening.png`。
- **普通生产通过不等于效果/严格验收通过**：Evaluation failed，5 个 opening-composition
  和 7 个 semantic-silhouette drift；其余五维在该 Evaluation 中 passed，并非完整 NBR-70 证明。
  strict diagnostic failed，代码 `NBR70_BLOCKER_IDENTITY_MISMATCH`、`NBR70_EVALUATION_NOT_PASSED`，
  strict cleanup not-started。这些不反转普通生产成功，也不触发隐式新生成。
  构图/语义组比例偏差继续归现有 CF-24 效果证据；strict identity 原因待 CF-13/NBR-70
  独立核查，不在本次恢复中伪装消除，不新增普通生产门禁。
- 本次解决的是脏工作树 Capture 阻断、CF-31C 已有 Request 恢复缺口和 CF-29 错误码丢失；
  不是“全部旧分支效果已对齐”。112/112 focused、typecheck、3C migration 已通过；
  尚未合 main，既有 workspace-boundaries CI 失败和独立 review 要求仍需解决。

CF-29 documentary dirty-tree 误阻断修正（2026-09-05，用户授权，main-agent-only）：

- 源码对照确认：旧 `9e35ab53` 场景 Capture 只解析 source commit，不做全仓干净检查；
  类似检查属于 Subject Preset 晋升而非 Capture。当前普通生产不应因无关进度文档失败。
- SDK owner 原 Git 检查收窄排除唯一进度文档和 specs/plans/reviews 目录下的 Markdown；
  不全局忽略 Markdown，不排除可执行文件、SDK、配置、资源、活源 Skill 或冻结 Skill。
  trusted commit 和实现 Hash 算法不变；无新增相似度门禁、重生成或隐式重试。
- 新增真实 Git fixture：文档 unstaged/staged 修改身份不变；源码与文档混合修改、删除、
  source→docs rename、Skill/冻结副本/lockfile 修改仍拒绝。原 RED 精确复现文档误拒绝；
  修复后 owner/Host transport 44/44 通过。联动补齐已有 transport fixture 遗漏的
  `semanticViewObservationSet`，没有放宽实际 payload parser。
- 待在已提交实现上保留授权进度文档 diff，再执行同一 054 Package 的正式生产 Capture；
  该复验不重新购买 Planner/Builder，不覆盖旧 Run/最终发布结果。CI/review/合并分别举证。
  实测通过：在 `70755665` 上特意保留本进度文档修改，2026-09-05T08:25:30Z–08:27:18Z
  正式 production Capture completed/published，Browser/Vite cleanup 均 completed。
  证据 `/private/tmp/worldkit-054-doc-diff-qYa4jr/capture`；Capture Receipt
  `sha256:927838c85edf67fe13b256df2814aaa7a6c21c82e68dbcc89823e2051685b7f0`，
  原 Package root `802a6e2b…` 和 Request `5e8643c0…` 未变。
  这是原场景受影响 Capture 边界的真实重跑，不冒充新 Planner/Builder 全链 Case。
  本次 44/44、typecheck、3C migration 均通过；PR #202 CI 的 8 项 workspace boundary
  错误仍阻止合并，不能因这个 Capture 成功而绕过。
- 七维 Evaluation、构图/语义轮廓阈值和 NBR strict diagnostic 是新链路诊断，并非旧分支原有。
  旧 Builder 对比图查看与最多三轮同任务结构/视觉修复仍属于必须对齐的反馈链；
  新评分不反转普通成功不等于允许忽略视觉偏差，更不等于此次效果已与旧分支等价。

CF-19 看图反馈与完成语义再对齐（2026-09-05，用户要求保持旧流程/门禁）：

- 对照 `9e35ab53` 实际 launcher/Skill：当前已冻结 054 instruction 只简述自检和看图，
  没有明确完整 Skill 路径及可执行循环；Native Skill 还额外要求 `judged aligned`。
  两者是确认的文本差异，不据此断言它们解释全部已观察视觉差异。
- 当前 case preparation 已把真实 `inputs/builder-skill/SKILL.md`、必读 reference、自检/渲染
  命令、左右图检查重点、最大错位优先、修复后重新检查最新两图放进实际任务指令。
  活源与冻结 Skill 删除额外“必须判定完全对齐才能交付”的条件，恢复结构检查通过 +
  最新两图已实际审阅；视觉差异在原共享预算内修复，预算耗尽则用原最终回复披露，
  不因剩余相似度差异扣住其他有效输出。仍恰好五个输出、最多三轮共享预算、单个任务，
  不增加 Reviewer、外部修复、报告文件或评分门禁。真实新生成效果待后续 Case。
- CI 8 项模块边界错误已按原责任修复，workspace-boundaries 0 debt 通过；未关闭断言。
  Startup reporter 从 app 私有文件迁入 runtime-babylon 唯一导出；原文件删除。
  Profile shape helpers 通过 pure public subpath 使用，重建 renderer 后 bundle 字节未变。
  合成 Browser fixture 明确为 test-support；原 cloud-ridge JSON 经 verifier 资产入口读取，
  不再跨 app 导入私有源码。启动 transport/watchdog 41/41、typecheck 通过；真实 Browser
  startup progress/stall/error 三场景通过；2000 Block 合成 Browser benchmark 完成，
  仅证这些工程接缝，不冒充正式 Case、完整预算性能或效果验收。

CF-19 新 Case / 文档一致性检查点（2026-09-05，`e271a35c`）：

- CF-29 文档误阻断修复、工程边界修复、CF-19 指令/完成语义修复已分别提交并推送为
  `70755665`、`ee09d376`、`e271a35c`。preparation + Builder Skill 两文件 66/66 通过，
  包含 Skill drift 检查，活源/冻结 Skill 字节一致；这是 focused 证据，不是新 Case 终态。
- 新本地 Case `paper-moon-054-cf19-feedback-0905` 从干净 `e271a35c` 启动，使用同一
  `054_paper_moon_palace.png` 原图，完整重新执行 Planner → Builder → 生产交付链，
  不复用上一轮生成 Source。Planner task `planner-20260905-083424-82873`；截至本检查点
  仍在 Planner 阶段，尚无正式 Run 终态，不能提前记 passed、效果对齐或合并。
- exact-head CI run `33955618615` 已失败：workspace boundary 已通过（0 debt），
  后续 test census 报 `UNCLASSIFIED: scripts/agents/agent-planner-palette-authoring.test.ts`。
  这是测试清单登记缺口，不是当前 Case 的生成失败；尚待修复、CI 通过及独立审查，
  PR #202 未合并。运行期间不修改生产实现以免污染 Capture 输入。
- 针对本次实际变更复核设计与计划，发现 2026-09-02 Native-default 规格及计划仍保留
  已被取代的额外 Mapper task / 无条件构图拒绝。现同步为 Host baseline 派生、普通生产
  保留质量诊断、显式 strict-acceptance + required-for-publication 才以新质量 gate 阻断；
  同步已删除 Python entry validator 的当前 TypeScript 路径。2026-09-04 对齐规格明确
  `234c1711` 只是历史检查点，避免把旧状态误认成实时状态。
- 文档校正不增加门禁、任务、重试或修复循环；历史失败证据保留，不改写成通过。
  本次文档修改只做 diff/link/代码条款核对，不重跑整仓或完整 E2E。

该新 Case 跟进（2026-09-05 16:53 CST）：Planner 已交付，Host 自检 passed、无诊断；
Run `run-20260905084340-82854` 已进入 Attempt 0 `initial-generating`，本地 Builder
约运行 9 分钟，尚无源码/比较图及终态。不能由进程存活推断内部正常推进或已通过。
CF-29 补充待办：`scripts/reconstruction/codex-task-process-port.ts` 的 `runProcess`
持续消费 stdout/stderr，但只在 child close 后返回内存字符串，不向总日志发布实时阶段。
因此总日志静默不是 stderr 管道未消费造成的已证实卡死，也不是无模型活动的证据。
后续需提供有界、脱敏、绑定 requestId 的可信进度可见性，避免透传原始 provider/模型日志；
保留现有 timeout、单次提交和成功标准，不增加重试。运行期间仅记录，不修改执行输入。

16:58 CST 跟进纠正：直接检查该 Run 隔离 Builder workspace，`scene.ts`（31,896 bytes）
及两份声明已于 16:55 落盘，entry/top-down 两张 advisory comparison PNG 也已存在。
此前 `rg --files --hidden` 仍遵循 ignore，漏掉隔离目录，不能把“搜索无结果”写成“无源码”；
监控改用精确 workspace 的直接检查或 `--no-ignore`，避免误报停滞。
这些仍是任务内中间产物，不是 Host 自检、Native admission 或正式 Capture 通过证据。

该新 Case 最终交付（2026-09-05，生产实现 `e271a35c`，运行期间只有上述文档 diff）：

- `paper-moon-054-cf19-feedback-0905/run-20260905084340-82854` 已退出 0；完整新 Planner、
  Builder、Host 自检、Native Check、Ground Analysis、WorldPackage、正式四视图 Capture、
  Evaluation 与发布结束。`productionOutcome: passed`、`publicationOutcome: published`、
  `cleanupOutcome: completed`，Attempt count 1，第三人称入口验证 passed、无诊断。
- Package root `sha256:3d12e87a6cbde8244480385d386a0915b2ccd880e0b3f881d516c87fd5b4c8d1`；
  Capture Receipt `sha256:16f4338d361d665797e99f71546a792aefc32db6165cc9529d477bb22ad0e33a`；
  Run Receipt `sha256:d3aacfb3585e3983ba266421adfb682bc71a54f8556e0407cafbeda758c3c480`。
  正式发布目录 `artifacts/scenes/paper-moon-054-cf19-feedback-0905/final/`，
  开场图 `final/capture/opening.png`。Builder 约 19 分钟，无 timeout；没有 Host 重生成。
- Evaluation 仍 failed，包含 opening-composition / semantic-silhouette drift；strict diagnostic
  仍为 `NBR70_BLOCKER_IDENTITY_MISMATCH`、`NBR70_EVALUATION_NOT_PASSED`，cleanup not-started。
  Run Receipt 的 evaluation outcome 仍 failed，不改写历史字节；普通生产结果按已冻结政策
  独立为 passed。不能宣称效果等价、NBR-70/90 或全部 CF 已完成。
- 用户随后授权合并 #202。合并前修复 CI census：一次性发现并登记 9 个漏列测试到 contract
  lane，不删除测试或修改 gate；census 通过（456 文件：413 contract / 43 resource-heavy）。
  10 文件 focused 首轮 71/72，失败定位为 Planner execution fixture 的 macOS `/var` 别名与
  canonical root 不一致；fixture 改用 `realpath(mkdtemp(...))`，生产路径检查不变。
  修正后仅重跑受影响 Planner execution 文件，14/14 通过；其余九文件首轮已通过，
  不重复跑整仓。推送后 CI 和必需独立批准仍待取得；此处不提前声称合并完成。

CASE-054 `paper-moon-054-r1-probe-0905/run-20260905032218-28080` 终态更新：

- Planner 经三轮修复通过；Generation receipt `completed`、Host Builder self-check `ok: true`，
  随后 Native Check rejected，production failed / not-published，cleanup completed；无 Capture/Evaluation。
  这不是上述 CF-27/02 修复后的新 Case。
- **真正阻断是 4,856 个 `WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_REQUIRED`**：生成的 `createPlainBlock`
  未传 `visualGroupId`，而 Profile 对 `structure/hazard/water-like-visual/background-mass` 要求组。
  `ROUTE_DISCONNECTED`（1）和 `STRUCTURAL_SUPPORT_MISSING`（305）在 Profile 中都是 warning，
  不能因为 rejection 的聚合消息包含它们就声称这两项单独导致此次失败或把它们改为硬门禁。
- 归入 **CF-22 的 Block 实例 → visualGroup 绑定缺口**，联动 **CF-19 的同任务自检覆盖**：
  已实现的 Case/manifest/palette 行级 bijection 并未覆盖每个实际创建的 Block；此次 portable self-check
  通过不能证明 Native admission。它是新确认的具体漏检证据，不伪称此前逐条件回归已经覆盖。
  非 target 背景/支撑如何保持独立语义与可分组空间还涉及 CF-21，必须核对旧分支行为后确定修法；
  不允许把全部背景偷偷塞入宫殿等身份组来消除错误。以下进一步根因核对与修复取代本段初步归因。
  证据位于该 Attempt 的 `source/scene.ts`、
  `builder-self-check.host.json`、`native-check-result.json`、`generation-receipt.json`。

CF-22/19 此次阻断的修复闭包（2026-09-05，未提交工作树）：

- 旧 `9e35ab53:packages/block-world/src/check.ts:706-718` 仅要求 landmark identity preset 分组，
  普通 functional preset 可以不分组。Native 却将普通结构/背景/水/危险角色全部强制分组，
  与 Case 禁止新增身份组及任务 renderer 接受普通非 target Block 的规则冲突。此次主要根因是
  **Host 额外加严**，不是应让 Builder 将所有背景绑进身份目标，也不能据此新增一个更严的自检。
- 删除 Profile 的 role-wide 分组 veto 及废弃诊断码；保留 exact Case/manifest/实际组 bijection、
  未声明/空目标组拒绝、Palette、geometry、显式 Collider 和 Native authority 检查。Skill 与冻结
  reference 同步解释普通非 target 无组语义，冻结规格追加旧基线依据。
- 新正向 RED 原先 rejected，修后 passed；Profile/authoring binding 两文件 50/50；Builder Skill
  48/48，含四种普通无组角色与缺失/未声明实际组负例；typecheck 通过。CF-19 的现有 renderer
  本来已允许普通无组块，本次通过对拍回归闭合这个具体分歧，没有引入 Host 执行未准入 source 的旁路。
- 对真实 054 **同字节** `scene.ts` / authoring / resources / bootstrap，在独立临时目录
  `/private/tmp/worldkit-cf22-check-UWQi7r` 运行 `pnpm worldkit native check <directory> --json`，
  exit 0，`outcome: passed`、`diagnostics: []`。旧 source SHA-256
  `f5b68ee9e963db7ca973c78cded8ab881052c9ad48750ac756b357ba313d414a` 未变；未修改原 Run 任何产物。
  这是当前检查器对旧生成结果的 Native Check 复验，不是恢复 Run，不是新模型 Case，不含 Ground/
  Package/Capture/Evaluation。原 Run 仍为 failed；完整效果与其余 CF 未完成项不被该复验关闭。

用户已授权侧会话修改 `docs/reviews/full-dimension-review-protocol.md`；主会话只复核其 diff 与直接
冻结合同，未发现冲突，`git diff --check -- <file>` 与 4 个链接检查 exit 0，保留并纳入后续正常提交。
未因该文档审查运行整仓测试或 E2E，未覆盖侧会话内容。

2026-09-05 用户将当前执行范围明确扩大为完成全部未完成的 `BWMI-CF`，同时保证流程和效果，
不是只完成审计或记录。执行以该表为唯一状态 authority，旧比较文档只是证据。
用户随后明确优先“与旧分支不一致且补齐后能直接、较快提升生成效果”，不再按恢复/重试优先施工。
下一批按 [CASE-054 / R1 最小重跑计划](superpowers/plans/2026-09-04-block-world-production-effect-parity-implementation.md#first-effect-rerun-case-054--r1)
推进：`CF-20/R1 表示与可用预算 → CF-11/21/R1 完整地理与显著要素 → CF-12/19/R1 构图与有效反馈`
三个有界切片，focused 闭合后冻结候选并跑一次本地 054 普通 Scene；不等待剩余 21 个主任务全部完成。
这些切片当前是计划、尚未实现；不新增 CF 主任务、不勾选 parent CF 完成，也不预先承诺新 Case 的效果。
原已修输入/Palette/反馈/业务成功标准及 CF-28/29/30/32 保留，不重复计作本批新完成量。
R1 后以 `CF-16 + BWMI-PROD-10` 的一套 base styled opening/tri-views 检查纸雕等最终视觉，
不能把原始 Block 图与旧 styled 成品跨阶段比较。CF-26B/31C 先暂停，严格 NBR、完整多运动模式、
通用 per-view/scene-feature 评分和 Episode/media 后续继续，仍在本表保留。

本轮重新核实：`66dff3a2` 本地 054 的 Case 包含全部非主体 `visual-target-2..5`，所以 CF-24
opening 缺 mask 删除身份虽是通用缺口，却不是该次稀疏输出的已知原因；不无条件阻塞 R1。
旧 Builder 明确接受普通步行人物使用 registered G Bot，把服装外观交给视觉层；不将“没有披风方块”
本身列为 R1 的迁移缺陷。2k Budget 压力、完整世界意图与输出落差、固定 Camera 是优先核对/修复领域，
仍须按计划给出各自证据；大红色 advisory cuboid 不是 Native 生成的受控人物。
上述优先级讨论阶段仅更新计划；随后 2026-09-05 开始下列预算/反馈实现，不能继续把当前批次
描述成 docs-only。CF 主任务数量不变，CF-20/11/21/12 的完整合同仍未完成。

2026-09-05 快速效果 probe（`66dff3a2` 基础上的未提交工作树，尚未合并）：

- `CF-20/R1` 子集：新增可复现 `pnpm benchmark:native-block-budget`，2k/8k 合成 Native
  Package 在真实 Babylon Runtime、Host chunk batching、Havok、1280×720 软件 Chromium 上运行。
  8k 为 6,400 floor + 1,600 landmark Blocks、3 Colliders、14,721 collision vertices /
  28,480 triangles，0 unsupported Blocks；Runtime 初始化约 12.7s，90 tick 后人物仍接地；
  后 60 tick 的 physics p50/p95 约 2.0/2.3ms，render + GPU finish 22.8/24.0ms。
  2k 对照为 2.2/2.5ms 与 7.5/8.5ms。观察到的 JS heap 约 323MB/1.107GB，包含同页
  Package fixture 准备，不是生产峰值 RSS 或硬件 GPU 帧率承诺。16k 页崩溃，未启用。
  记录在 `output/playwright/native-block-budget-1788576224777/2000.json` 与
  `output/playwright/native-block-budget-1788576365020/{8000.json,16000-failed.json}`；
  8k opening 已人工查看，确有场景与真实 G Bot。该合成 fixture 不是正式 Source/Generation
  Receipt/Case，也不证明 ground connectivity、全部视图或任意 8k Collider 布局均可承载。
- 当前生产预算从未校准 2k 改为测量后的 8k 候选；同一 owner 提供 Native Planner 冻结
  `context/native-block-production-budget.json` 与 Generation Request。Canonical 不注入该文件。
  Native 已接受计划重用必须核对当前预算内容；不同预算的旧计划不能悄悄继续。
  8k 合成场景有 8,492 nodes，故 interactive/formal Host 的独立 4,096 node / 1GB caps
  同步改为 16,384 / 2GB；Collider 256、vertices 65,536、triangles 131,072、输出 4MB、
  1,800s Builder timeout 及 physics/protocol 其余限制不变。未复制旧 102,400 cap。
- `CF-11/21` 的意图/反馈子集：Planner 按实际可表示预算规划；Builder Skill、冻结副本和
  Case instruction 增加完整 geography/formation 与预算清单，先保留主要体量、路线走向和起伏、
  支撑厚度、侧后方区域，再做装饰；两张同任务对照按位置/朝向/尺度/遮挡检查，不以 target
  存在替代对齐。未增加额外模型任务或普通发布 veto，也没有实现新的 per-view/endpoint 合同。
- 按用户后续要求尽快本地跑 Case，这次先跑 **budget/feedback interim probe**，不是三组已齐的
  R1 验收。`CF-12` Host Camera 构图选择尚未实现，仍使用现有相机；它作为已知效果干扰项
  保留，不能把本轮说成与旧分支全部参数一致。完整 R1 与 styled 第二检查点仍按计划推进。
- 已得本批 focused 证据：Planner receipt/budget、Host execution budget、Generation Request、
  Case preparation 4 文件 63/63；Native Builder/Planner Skill、Native 入口、staged-flow 与
  workload accounting 5 文件 67/67（其中 Native Skill 42/42），typecheck 通过，diff check 干净。
  不是 exact-SHA Cloud/full-gate、整个 CF 或 WRC/NBR 正式验收。
- 11:03 CST 已启动新的 `paper-moon-054-r1-probe-0905`，本地 formal `gpt-5.6-sol/xhigh`，
  Planner Task `planner-20260905-030317-28093`，没有使用 Cloud 或子智能体。输入原图 Hash
  `080d951445bae3a8584363f0be5ef9194b5eff88e7b64da40d2a81f6a923972e`。
  `artifacts/scenes/paper-moon-054-r1-probe-0905.candidate.json` 记录 HEAD 与 55 个已改/新增
  代码及冻结 Skill 文件的逐文件 Hash；跑 Case 后冻结这些输入，不将 docs-only 进度更新伪装成
  代码变更。当前仅确认 Planner 已启动，不能提前记为生成、Capture 或发布成功。

架构、跨域合同和最终集成均由主智能体处理；未获新的并行授权，
不把 case 子智能体的旧许可扩张为本批并行开发。每项区分 code/focused、真实视觉与最终验收，
CF-03 先复现再决定是否有 Runtime bug，不能为勾选任务而制造修复。

非架构差异不得再标为“有意 clean break”后消失：多 movement mode 的用户语义与完整世界面积/
四倍 reference-visible coverage 由 CF-11/12 保留并在当前 Owner 实现；Native 模块不接管 Subject、
Camera、Physics。CF-16 与 WRC-QP-4 还必须闭合 non-Subject semantic-front 到 Front/Right/Back
实际 Capture/后续视觉的方向传递，单靠 Skill prose 不算实现。

新增本地失败证据：`paper-moon-palace-054-local-alignment-0905/runs/run-20260904194606-56806`
确实运行于 `66dff3a2`，Planner 通过，Builder 返回后 Host self-check 失败，尚未进入 Native Check、
Package/Capture/Evaluation/Final。冻结 checker 把 Case raw Brief Hash
`4906d4e79c17a1ded1445ce349ea1bb4ef58c437bf0aceeedaf5dbed66820078`
直接与 Palette semantic Hash `34b97df765e0f5cedebe97f8998ff65d2726f0cf137bd69c3b80ca45cd1b9be4`
比较，因此即使输出正确也会被拒绝；CF-28 修这个确定性缺陷。该次 Source 已被旧清理逻辑删除，
不能反推 Builder 实际用了几轮修复。留下的两张稀疏 advisory 对照图不是 Runtime Capture；
其中红色长方体是 Host Subject bounds proxy，不能据此归罪于 Builder 的人物生成。2k budget
与稀疏效果有关联风险，但该次没有 source/block-count 证据，不能写成已证明的唯一根因。
旧分支也会在 Host replay 失败时终止；“旧分支自动追加三轮外部修复”不是事实。以上修复不会
把该失败 Run 改写成 passed，也不会冒充在当前工作树上重跑了真实 Case。

2026-09-05 候选检查点为
`codex/block-world-effect-alignment@58e7ebd5`，尚未合入 `main`。该候选已实现：`BWMI-CF-23`
Scene-scope outcome/atomic publication；`BWMI-CF-10` 的旧阈值与 entry-first 因果链；`BWMI-CF-19`
同任务 entry/top 对照与 Host decoded-RGBA 重放；`BWMI-CF-22` 对已有 Case visual group 的精确
palette join；以及 `BWMI-CF-09` 的一次读取、私有快照和 Planner/Case 同字节部分。Native Check 中
全局 route-colored component 断连只写确定性 warning；具体 Case 要求的路线连通仍由 Ground/Traversal
阻断，因此没有把非路线 Case 提升为旧分支没有的失败。

该候选没有关闭 `BWMI-CF-11/12/14/15/20/21/24/25/26/27`，也没有在修复后的精确 SHA 上跑完
真实 CASE-054、完整 Browser、整仓或 exact-SHA Cloud。聚焦证据为 Publisher `27/27`、Studio `108/108`、CLI `49/49`、
Planner/Case/Generation/Native runner `70/70`、input freeze `11/11`、route/profile `53/53`、
palette/admission `46/46`、production ports `22/22`、Native Builder Skill `35/35`，以及最终
`pnpm typecheck`、agent self-check、diff check 通过。哈希修复的新增证据为 Case preparation/runner/
identity admission `14/14`、Package 主路径 `1/1`，以及 Package 全文件一次 `24/25` 后将唯一旧夹具
修正为在 visual identity 边界验证额外未声明组并单独 `1/1`；没有把这组合并写成一次全文件绿色运行。
这些证据不替代 NBR-20/70/90 或 WRC-SR-1/2。

同日真实本地 Case `paper-moon-palace-054-alignment-0905` 在候选前一 SHA `88c7844c` 上运行。Planner
以 `gpt-5.6-sol/xhigh` 完成 Scene Brief、entry 和 World Plan；entry 通过，但 World Plan 主体固定色
`#E85D5D` 连续出现 `0/79 -> 3/79 -> 4/79 -> 1/79`，最终在最后一个修复周期的同目标颜色补偿后
通过。Host 随后在 `plan-ready` 以 `WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID` 终止，尚未进入 Native
Builder。根因是 Palette 沿用旧链的 Scene Brief 规范化语义 Hash，而新增 Native Case/Receipt 闭包
使用原始 Markdown 字节 Hash，却误把两者当成同一值。`58e7ebd5` 已按各自 Owner 分离用途，并在
最终 Package identity admission 从冻结 Brief 重新派生语义 Hash；未删除 Palette、Receipt 或路径
闭包，也未放宽任何效果阈值。失败运行清理了未发布 staged Case，因此没有 Package/Capture/Final
产物可继承；必须在 `58e7ebd5` 或其后续精确 SHA 重新运行。

`BWMI-CF-08` 已由 current source 直接证实：`resolveSceneAssets()` 产出 `{visualTargetId}`，而 prompt、
API URL 和 supplementary tri-view 消费者仍读取 `.id`，会生成 `undefined` 主体身份并丢失附加三视图。
它是 current 回归，不依赖是否恢复旧 Episode。`BWMI-CF-03` 则只是高价值历史故障模型，在 current
Babylon/Havok 上复现前不得写成已确认 bug，也不得先移植修复。

`BWMI-CF-10..22` 来自最终效果反向审计及同一 current `main@20fe0fef` 的本地真实
`paper-moon-palace-054-report-only-0904/run-20260904134439-41905`。该 Run 的 Attempt 0 从本地
Planner/Builder 到 Native Check、Ground、Package、Capture 和七维 Evaluation 全部通过，但 Opening 只剩
固定 G Bot、直线白地、少量山墙和简化宫殿；world top/side 也显示大部分 Planner 完整世界未实现。
随后通用 production final verifier 因 Case 有 `collider-visual-target-2-solid` blocker、Formal Intent 却没有
任何 `block-plane` criterion 而以 `NBR70_BLOCKER_IDENTITY_MISMATCH` 关闭，未发布 Final。这个结果同时证明：
七维 `passed` 不能替代完整世界/主体/多视角视觉还原，且通用 landmark Case 当前无法闭合最终 blocker
identity。它不是 fresh Browser playability 失败；该 replay 明确为 skipped。

静态量测进一步确认：Host 对缺失 landmark 色块会写入通用 bbox/coverage；Planner checker 只校验 PNG 可
解码与红色主体居中；expected coverage 来自身份色真实像素，而 observed coverage 来自完整 visual-group
world AABB 八角投影矩形，且只要投影在视口内就把 target 写成 present，不读真实遮挡像素。当前 committed
strict Cloud Temple Case 的 `referenceInputs`/`inputs/` 又只有 `reference-0.png`，没有 current Skill 强制读取的
两张具名 Planner 图。CASE-054 的 source 实际使用 `1974/2000` Blocks；Planner palace 色为 `#F28E2B`，
Builder authoring 却写成 `#F28A2E` 而仍全链通过。非 target 的桥、瀑布、侧塔、庭院和山体也没有逐项
presence/placement closure。上述事实分别由 `BWMI-CF-10/14/18/19/20/21/22` 承接，不能靠放宽阈值、
伪造 mask、盲增 Block 上限或复用旧证据解决。

候选 `58e7ebd5` 已关闭上述旧色 `#F28A2E` 的循环自洽路径，并把 Planner/Builder 反馈拓扑恢复到旧
硬门禁语义；它没有重跑该真实 Case，因此不得把历史 Opening、Package 或 outer result 重新标成候选
证据。特别是 opening 中缺失/不可靠的非主体目标目前仍可能没有 Case visual row，随后又受精确
Case/manifest 双射约束；这不是靠把所有 entry target 设为硬门禁解决的问题，而是 `BWMI-CF-24`
必须提供的 per-view evidence disposition。

##### 白膜之后的生产链工作图

这些任务是 current architecture 的后续设计/实现台账，不计入 WRC-1 的 33 个工作包，不提高 WRC、
NBR、BNA、P0.2 或 P0.4 完成度。它们只能消费 verified Package/Formal Capture，不得写回 Authoring、
Runtime、Physics、Action、Camera、Event 或 Gameplay truth。

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive owner / stable output | Required evidence | Mode |
|---|---|---|---|---|---|---|
| `BWMI-PROD-00` | 冻结 source-neutral post-Capture production Profile：condition bundle、identity/provenance、redaction、retry/resume、cost/deadline、no-writeback、唯一有序 reference-role table 和 Skill/Reviewer 边界；Profile 必须显式选择 `reference-faithful reconstruction` 或 `creative reinterpretation`，冻结原始用户图在各模式中的角色及是否必须保留一个 faithful baseline；只有 `productionOutcome: passed` 才进入后续视觉/视频生产，strict diagnostic failure 只告警且不撤销该资格；人工点击只是成本/UX 授权而非质量通过证据 | BWMI-CF-23, BNA-7, P0.2 remaining identity/Resume | `BWMI-PROD-10..60` | 新 presentation contracts only；production-passed Package/Capture → immutable condition bundle | closed parser、role/order/hash parity、模式/faithful-baseline、tamper/stale/redaction、production-vs-strict 状态混淆、owner threat model、current providers/cost/licence decision | main-agent-only |
| `BWMI-PROD-10` | 恢复 current-owner base styled opening/tri-view Visual Reconstructor：沿用旧链同一任务内的 visual self-check 与 Host file/hash/role closure，opening 先通过再作为 tri-view appearance anchor；若增加独立语义 Reviewer，其 diagnosis 只进入 strict diagnostic，不能覆盖普通生产成功或成为唯一 repair authority | `BWMI-PROD-00`, WRC-SR-1, BWMI-CF-16 | `BWMI-PROD-30` | post-Capture visual pipeline/Skills；same-task self-check、accepted-opening receipt、semantic-front/panel direction、历史等价 Host closure；不产生 Package/Runtime truth | complete-target/semantic-front、near/mid/far movement space、identity-bound anchors、Front/Right/Back、最多轮数、stale input、单图 repair immutability、可选 independent diagnostic 和 real visual set | sequential |
| `BWMI-PROD-20` | 设计并实现 current Playthrough Planner、六个安全起点、六段确定性 whitebox capture、机械健康、执行后画面覆盖准入和失败恢复 | `BWMI-PROD-00`, NBR-70, P0.2 Capture/Replay | `BWMI-PROD-30`, `BWMI-PROD-60` | Simulation Take/Control Capture owner；six immutable segment bundles + per-frame Camera telemetry/coverage receipt | 60Hz→24fps、route/waypoint、immobility/support/drop/stall、distinct zone/landmark/start/destination coverage、主体占屏/结束构图/Camera motion、reset isolation、six complete receipts | sequential, main-agent-only for Browser evidence |
| `BWMI-PROD-30` | 生成 exactly-N style variants（N 与 retry/concurrency 由当前 Profile 冻结），逐 variant 独立 Visual Reconstructor/Reviewer，并做集合级 diversity/confusability review；每个 variant 先冻结 immutable Segment-00 appearance anchor，再分别以 Segment-01..05 白膜首帧为空间权威闭合其余五张 styled frame 与共享 tri-view | `BWMI-PROD-10`, `BWMI-PROD-20` | `BWMI-PROD-40` | Style Director + per-variant visual/review Skills；共享白膜身份、独立 appearance identity；`N × 6` segment-frame set + shared target tri-view；pass ledger 细到单张 frame/target | failed image-only retry、同 variant 其余 pass Hash 与其他 variants 均 immutable、显式 cross-image conflict 才可撤销 pass、六段 frame/tri-view closure、direction/scale/baseline、diversity review 与 resume | sequential orchestration, parallel-safe fan-out |
| `BWMI-PROD-40` | 实现 provider-neutral timed visual events、Video Adapter、Seedance-like segment rendering、raw admission/conformance 和 durable provider journal；Event 必须绑定 executed marker、真实可见 segment 与已通过视觉 review，并在全 Episode 做事件去重/强度/范围 Profile；冻结版本化视频 prompt 语义：reference precedence、拍摄侧、裁切/遮挡、visible-target whitelist、conditional tri-view、运动介质接触、Event continuity、no music/speech/new entities | `BWMI-PROD-20`, `BWMI-PROD-30`, P0.4 Adapter design, BWMI-CF-17 | `BWMI-PROD-45`, `BWMI-PROD-60` | Video Adapter/provider journal；统一 ordered reference roles + prompt template version/hash + input identity + idempotency → immutable raw/final media receipt | pre-POST journal、ambiguous/lost response reconcile、集合级事件重复/冲突、目标可见性/动作独立/no-event baseline、stale raw/final invalidation、terminal attempt cap、raw duration/aspect/progress/audio、exact final frames/audio/size/hash and no duplicate paid Job | sequential per segment, bounded parallel fan-out |
| `BWMI-PROD-45` | 为每个 `segment × variant` 增加独立 Video **诊断** Reviewer：对白膜视频、逐帧 Camera telemetry、accepted styled refs、Event Plan、Prompt 与成片做语义 verdict，并输出 repair brief；因旧链没有该阻断门，结果不覆盖 `productionOutcome`，只供显式严格验收或后续人工重做选择 | `BWMI-PROD-40` | —（advisory/strict diagnostic only） | independent review Skill/receipt；不拥有 Runtime/Event truth 或旧标准最终成功 | 拍摄侧/裁切/遮挡/透视、身份/材质、自然接触/滑步/穿模、事件时序、幻生目标、音乐/人声；默认只记录失败，不自动重跑或改判；显式 strict workflow 可只重跑失败 media，passing media Hash immutable | sequential per media, bounded parallel review |
| `BWMI-PROD-50` | 将同一 current Scene/NBR pipeline effect-preservingly封装为 digest-pinned Cloud Execution，S3 为 durable artifact authority，Studio 只投影状态；所有对象先写 content-addressed prefix，完整校验后只原子切换一个 release pointer | `BWMI-PROD-00`, NBR-90, PHO-7 | `BWMI-PROD-60` | cloud orchestration/transport + immutable release manifest only；不改 Agent prompt/Skill/Host gates | request idempotency、hash-verified hydration、逐对象 size/hash/content-type/decode、partial upload、pointer race/rollback、worker loss/cancel/retry/cleanup、one exact-SHA real Case 与 no-local-durable-media census | sequential |
| `BWMI-PROD-60` | 建立 durable `prepare -> GPU capture -> render` Episode DAG、queue/Batch manifest、closed-producer tail、lease/heartbeat/cancel/retry、per-task receipt、provider journal 和 CPU-GPU-CPU resume；`BWMI-PROD-45` Reviewer 可旁路消费已完成媒体，但不是生产 DAG 的阻断 Stage | `BWMI-PROD-20`, `BWMI-PROD-40`, `BWMI-PROD-50` | `BWMI-PROD-90` | cloud production control plane and S3 Run Index；Worker fs disposable | open 99/no launch、threshold launch、stable closed tail、Pod loss、partial failure isolation、stage/media-only retry、lost provider response、Studio restart/reconcile | sequential, main-agent-only for cloud canary |
| `BWMI-PROD-90` | 在冻结旧标准 Profile 上完成 local contract/fault gates、exact-SHA cloud canary、六段/多风格 media closure、独立深审和 release/canary disposition；strict diagnostics 与人工视觉意见单列，不能把旧标准已成功的 Case 改判失败 | `BWMI-CF-23`, `BWMI-PROD-10/20/30/40/50/60`, PHO-8 | — | release evidence only | exact old-stage success matrix、exact SHA/image digest、全对象 immutable release manifest/hash closure、单 pointer identity、cost/deadline、manual visual review advisory、rollback/unpublish plan | main-agent-only |

历史参数候选必须保持可检索，但在 `BWMI-PROD-00` 重新冻结前都不是 current 承诺：

- Playthrough：`6 × 30s = 180s`、Simulation `60Hz`、Capture `24fps`、每段 `720` 帧、总计
  `4320` 帧；历史 capture-health 包含连续静止不超过 `5s`、unsupported 不超过 `1.5s`、垂直 drop
  不超过 `3m`、tick stall 不超过 `1s`；
- Style：exactly `10` variants，visual/review concurrency `10`、Gemini concurrency `5`、Seedance
  concurrency `10`、opening attempts `1..4`、visual attempts 最多 `2`；
- Event：仅 segments `0/2/4`，事件分配 `2/2/1`，Gemini 3.5 Flash、temperature `0.8`、
  max tokens `8192`、sampling `0.25fps`；这些 provider/model 值尤其必须重新选择；
- Video：六段各 `30s`、`1280×720`、`24fps`、exactly `720` frames、audio required，历史 prompt
  上限 `15000`、reference images `2..30`、poll `8s`、timeout `7200s`、terminal attempts `2`；历史 raw
  duration admission 为至少 `29.5s`，只作 current Profile 候选，绝不授权 clone-tail 补全严重短片；
- Cloud Episode：历史三阶段 timeout 为 `21600/43200/43200s`、每阶段最多 `3` attempts；
- GPU：历史 normal Batch `100..128`、closed-producer stable tail `120s`、lease `3600s`、dispatcher
  `60s`、GPU `1`。这些是旧基础设施 Profile 候选，绝不进入 Scene/Runtime 公共 Schema。

旧 Skill 处置同样必须显式：`worldkit-block-builder` 已由 Native Builder 取代且禁止恢复；历史
`worldkit-visual-reconstructor` 仅部分被当前 styled scripts 覆盖；
`worldkit-playthrough-planner`、`worldkit-episode-visual-reconstructor`、
`worldkit-style-variant-director`、`worldkit-style-variant-visual-reconstructor`、
`worldkit-style-variant-visual-reviewer`、`worldkit-style-variant-diversity-reviewer` 均没有 current
等价 Skill/checker/runner，分别由 `BWMI-PROD-10/20/30` 重新设计，而不是复制旧 prompt 或冻结副本。

上述台账覆盖历史唯一提交组 `cdae61aa`、`6bcc51bb`、`8c250b5f`、`ae53ff9a`、`6def857d`、
`90126d43`、`1678960f`、`c6f8318a`、`69885f3f`、`596ddd5e`、`b6391c29`、`d69d7f82`、
`b09c5efd`、`7607089e`、`266ddf32` 及其 deployment-pin/fix commits。`d69d7f82` 的多接触修正
已在 current Runtime 语义保留；deployment-only digest/service/tenant/health commits 只作旧环境证据，
不单设迁移工作包。只有 `BWMI-PROD-90` 的 current exact-SHA 证据可以关闭生产链，不得复用旧分支
Cloud/Browser/视觉证据或本次静态审计替代。

#### Unified Scene Viewer 下游开发工具关联（非 WRC 关键路径）

Unified Scene Viewer 的当前设计与实施计划已进入当前树：

- [Unified Scene Viewer clean-break design](superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md)
- [Unified Scene Viewer implementation plan](superpowers/plans/2026-08-31-unified-scene-viewer-clean-break-implementation.md)

该 Viewer 是 WRC-1 下游开发工具，不是新的 WRC 工作包、Runtime、Scene Source、WorldPackage、
Compiler、WorldKit Browser Protocol、Gameplay 或生产准入权威；WRC-1 的工作包数量保持 33。已接受的
目标合同要求 Catalog/bootstrap 只支持 Canonical AuthoringSpec，Catalog 不保存 Subject Definition Ref；
Host 必须解析完整 AuthoringSpec，并证明 `startup.controlledEntityId` 最终绑定
`worldkit://subject-definition/humanoid.g-bot@2`。当前原子切换已完成，`apps/playground` 是唯一产品开发
Viewer shell，`pnpm dev` 只提供 `feel-flat`、`traversal-course`、`action-lab` 三个 curated presets；
这些预设只消费现有 WRC Runtime/Action/Camera 能力，不替代山地/T 字、台阶/建筑/有限室内、动作/相机/
空间事件验收 Case。

当前树已实施 USV-0/USV-1：旧 `authoring=1`、`catalog-gameplay` source-selection route 已删除，
三份 curated preset source 已发布，Playground、CLI 与 Studio 已同步切换。该开发工具完成状态仍不计入
WRC 完成度，也不授权 WRC/NBR 删除独立证据、Corpus 或 Harness。

Playground、CLI 与 Studio 的公开 source-selection route 必须在同一 current-only 检查点原子切换；前置
Owner/gate 是 Canonical AuthoringSpec/Subject 解析、RuntimeHost/Browser V5 生命周期、CLI/Studio source
选择合同、三预设 Browser verifier 与零旧入口 census。`worldkit run` 和 Studio 可通过 Host-selected
temporary source 打开同一 Viewer，但不得把临时 Case 写入 curated Catalog。Viewer 只消费这些 Owner 的
已提交状态，不持有 Runtime、Action、Camera、Physics、Capture 或 admission 状态。

Native Viewer 不进入当前合同。NBR-1/BNA Native Package 继续通过 BNA-owned 验证 Harness 启动；未来
只有在适用 BNA production/admission disposition 后，才能用单独 current-only 原子变更把 Native Source
加入 Viewer。trusted artifact renderer/正式 Capture 仍是独立证据工具，不是第二个产品 Viewer，其迁移
由 WRC Capture/BNA-7 Owner 决定。

以下内容明确排除在 Viewer 清理范围之外：`artifacts/scenes` 中的 WRC Capture、Receipt、重建评分和
验收语料；BWB/BNA Corpus；Runtime/Hosted/Browser Harness；正式 Capture/Route 证据；以及绑定 Package、
Receipt、Candidate 或 exact-SHA 的 fixtures。Native Web UI、旧 showcase 或历史 Case 只有同时满足
生产/测试引用为零、identity-bound fixtures 已迁移、相关 focused/Browser/Capture 门禁通过，并获得对应
WRC Capture/Corpus Owner 与 BNA Runtime/Admission/Capture Owner 明确签字后才能删除。目录整洁不是削弱
Corpus、Harness、Capture 或 Receipt 的理由。该关联记录不计入 WRC 完成度，也不提前标记任何 WRC/BNA
能力完成。

Wave A 的详细权威设计与施工计划已经固定在：

- [PR #41-Compliant Split Jump Correction Design](superpowers/specs/2026-08-30-wrc1-pr41-split-jump-correction-design.md)
- [WRC-1 Wave A Jump Authority Implementation Plan](superpowers/plans/2026-08-30-wrc1-wave-a-jump-authority-implementation.md)

Wave A 已由 PR #53 合入 `main@d537f4e9a0a05a448afc9d68681eb42ce31dc04a`：

- [x] JUMP-0：冻结符合 PR #41 的小跳/大跳设计并处置旧 PR #51；
- [x] JUMP-1：提交 Jump Variant/Episode 合同、Snapshot、Hash、Reset、Replay 与 Rollback；
- [x] JUMP-2：由 CharacterMovement 固定 Tick 权威实现小跳/大跳，动画只消费 committed presentation；
- [x] JUMP-3：完成 Alpha 资产准入、双 Subject 隔离、脚底视觉锚定和 Browser 跳跃全周期证据；
- [x] WRC-GOV-1：机械化禁止 Provider 私有 Jump owner 和输入反向改写。

该完成记录只关闭上述五个工作包；通用 Action/Posture、Camera Feel、BNA-3+、BWB-3+、PHO 与
WRC-1 总验收仍按各自任务保持开放。

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

Native Scene 独立候选链：

BNA-0 -> BNA-1 + BNA-2
BNA-1 + BNA-2 -> BNA-3 -> BNA-4 -> BNA-5
BNA-2 -> BWB-1 -> BWB-2
BWB-1 + BWB-2 + BNA-3 -> BWB-3
BNA-4 + BWB-2 -> BWB-4
BNA-5 + BWB-3 + BWB-4 -> BWB-5 -> BWB-6
BNA-3 + BWB-3 -> WRC-SR-1
BNA-5 + WRC-SR-1 -> BNA-6
BNA-4 -> BNA-7
BNA-6 + BNA-7 + WRC-SR-1 -> WRC-SR-2 -> BNA-8

APA-0..APA-6 只提供 source-neutral 已发布资产；BNA-3 才把已发布 Resource Ref 纳入 Native Package。

横切工程健康链：

PHO-0A -> PHO-0B + PHO-1
PHO-0B -> PHO-2 + PHO-4 + PHO-5
PHO-0B + PHO-1 -> PHO-3
PHO-1..PHO-5 -> PHO-6 -> PHO-7 -> PHO-8

PHO 不阻塞已冻结的 BNA/BWB 功能依赖图；在后续大改动中按成熟度逐步启用其 PR/Nightly Sensor，
最终 BNA-8/生产验收消费 PHO exact-tree Report 作为工程健康证据之一，但不能用它替代 BNA 自身门禁。
```

Placement S1、Simulation Take / Control Capture V1 与 Validation Capture/Integrity V1
已形成回归纵向切片；后续 Validation 扩展仍应保持窄纵向切片；
不要同时启动坐骑、装备、飞行、NPC 和室内，避免再次形成无法验收的大重构。
这里的“室内”指正式多层 Surface/Camera/Navigation/Gameplay 能力；BWB-5 仅保留有限室内视觉 Case，
用于证明白膜表达和局部碰撞，不改变该产品边界。

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
| G19-6 | **已完成并在 `main`** | Browser Protocol V5 Gameplay 唯一入口、Snapshot V4、Reset/Rebind、Runtime Activity、Authoring/CLI/Capture/Take consumer cutover；当前 surface 为 exact 38 keys；Execution Subject locomotion Capability lock 与 Canonical capability state | G19-5 | `eef75c6` 实现、`5ffd031` completion review；typecheck、build、168 files / 2,134 tests、Canonical/Placement/Rigged/G Bot/R0/R1/R1b 与两项 Capture verifier 全通过；无 open confirmed P0/P1/P2 |
| G19-7 | **历史完成；现行入口已由 USV clean break 替换** | 当时的 Outdoor/catalog route、page/artifact lifecycle 与六场景接线；当前只保留六场景 artifact-only 证据面，不再提供 catalog Gameplay | G19-6 | 历史证据为 `da90f16` + completion record `1594823`；当前证据是三个 Canonical preset、六个 artifact-only 场景与 unknown-scene fail-closed |
| G19-8 | **已完成并合入 `main`，Final GO** | 未发布协议 clean break、历史命名/兼容路径专项清理、零消费者 census、G19 整体全量验证、主 Agent深审与最终 disposition | G19-7 | 候选 `99fb822`；178 files / 2,172 tests、全部专项 Gate、632/0/489 census；与 `main@134592e` Camera 边界文档语义融合；无 open confirmed P0/P1/适用 P2 |
| HNC-F1 | Alpha 前强制执行 | 对当时全部公共命名、exports、parser、Browser/CLI、生成资产和隐式 fallback 再做一次全面兼容性清理；同时关闭 `SCENE-ORIGIN-1` | Scene spawn-origin 与 collider-derived placement 合同 | 最新 clean-break machine gate + 人工语义分类；Scene 固定 0.9m bridge 删除；`test:scenes`、`verify:scene-viewer`、artifact-only 与 Plan gates 全绿 |
| WS-07B | **待开始；结构治理后续 1** | 按 public contract family 扩展唯一 source/generated parity；每次只迁一个领域 | `ARC-INT` 已完成 / 阻塞相关 Schema release | 正负 parity、unknown-key、round-trip、tracked bytes；禁止用私有 deep import 换取小 bundle |
| WS-05B/C | **待开始；结构治理后续 2** | 按 owner 批次消减 workspace boundary debt；`7f9abd8` 历史 checkpoint 为 49 条，当前候选待 Cloud 重测；补必要 `/testing` exports、direct deps 与 per-package tsconfig | `ARC-INT` 已完成 / 阻塞 `WS-08` 的相关 package extraction | debt count 单调下降、zero stale/new、zero cycles、无 wildcard |
| WS-08 | **待开始；结构治理后续 3** | 稳定 Host primitives 后拆分 Host/Studio/CLI composition package，不改变 Runtime/Camera/Capture authority | public contracts 稳定且相关 `WS-05B/C` debt 已清 / 无 | CLI snapshots、readiness/shutdown lifecycle、build graph、Studio E2E |
| M8-S1 | 新产品候选尚未冻结；内部 Canonical capability completion 与双审 pending，Hosted Builder production admission 关闭 | `mountedOn` 合同、编译、Action effect、Gameplay/Host 原子事务、Babylon Rider 投影、retained-Physics `supportedBy`、最新 Camera V2 clean break、Playground 与严格 Journal/Snapshot Capture；[专项设计](../docs/superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md) / [实施计划](../docs/superpowers/plans/2026-08-26-m8-s1-mounted-on-skateboard-implementation-plan.md) / [completion draft](reviews/2026-08-26-m8-s1-mounted-on-skateboard-completion.md) | G19 已完成 | `08f8f199`、`4c7551e`、`7f9abd8b` 的 Cloud 结果均保留为 pre-Camera-V2-clean-break 历史证据。当前树新增 Camera/Runtime/Registry strict admission、生成物更新和 Hosted relationship self-check hard gate，因此必须冻结新 exact SHA 后重新跑一次 Cloud 全矩阵，再做 Claude/Grok exact-tree 终审。不得把内部 Fixture 解释为自动场景生产支持；历史 catalog `verify:outdoor-gameplay` 不得恢复。 |

结构治理固定按 `WS-07B → WS-05B/C → WS-08` 推荐；`M8-S1` 仍是产品能力主线，两条 lane 不得
因表格相邻而被解释为可以共享 owner 或跳过各自依赖。上述 WS 项的范围、延期理由、ownership、
execution mode 与验收合同以
[`Workspace 结构与权威边界审查`](reviews/2026-08-24-workspace-structure-authority-review.md)为准，
本表只提供不会丢失的中央发现入口与当前状态。

G19-8 的 clean-break 子任务以
[`未发布协议兼容层 Clean Break 设计`](../docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md)
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
[`历史命名与兼容路径清理专项计划`](../docs/superpowers/plans/2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md)。
该任务不以“删除所有低版本后缀”为目标：尚无替代版本且仍是唯一权威的嵌套合同必须保留并登记
为 `current-authority`；只有已有当前替代实现的旧名称、alias、converter、双读写和 fallback 才进入
`superseded-delete`。

即使 G19-8 达到零历史兼容路径，也必须在首次 SDK Alpha 前执行 `HNC-F1` 全面复查，不能把本次
census 当成永久证明。当前仍有语义职责、但未来应由显式合同替代的
`SCENE_HUMANOID_SPAWN_CENTER_OFFSET_METERS` 已登记为 `SCENE-ORIGIN-1`：它不是兼容 alias，
删除门禁是 Scene 明确 spawn origin 或从锁定 Collider 推导 placement，迁移全部 catalog scene，
并通过 `test:scenes`、三个 Canonical 调试预设的 `verify:scene-viewer`、Plan/Scene Plan gates；
旧 Outdoor catalog 只保留 artifact-only 证据，不再拥有 Gameplay 门禁。

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
   （专项 [`product-asset-intake-template`](../docs/superpowers/specs/2026-08-21-product-asset-intake-template-design.md)，
   执行 [`product-asset-intake`](../docs/superpowers/skills/product-asset-intake.md)；G Bot Fixture
   `examples/product-asset-intakes/humanoid.g-bot@2.json`）；
2. **M2（已完成）：冻结 Take/Capture V1 首条实施范围**；
3. **M3（已完成）：实现五 Pass Capture 窄纵向切片并复用 Placement World Identity/Hash**；
4. **M4（已完成）：实现 P0.3 统一 Validation Profile/Report 的 Capture/Integrity 窄切片，把现有 Bundle Gate 纳入同一报告协议**；
5. **M5（已关闭，回归中）：Route Graph 与主体可通行性 R0/R1/R1b**：R0 字段冻结已由
   `pnpm verify:route-r0-contract` 证明；R1 Heightfield 已由
   `pnpm verify:route-r1-heightfield` 与
   [Runtime Review](reviews/2026-08-22-route-r1-heightfield-runtime-review.md) 关闭。
   R1b Task 9/10 已完成静态平台 / Surface→Collider Subshape 实现、11 个 Fixture、V2/V5
   clean break、完整矩阵和主 Agent 深审；首轮 Cursor 建议触发的 Runtime ambiguous
   诊断分层修复已由三模式回归与条件复核关闭；2026-08-24 深审发现的存量问题已经
   remediation，并由最新 `main` 集成门禁以及 GLM 5.3/zcode、Cursor FINAL GO 重新关闭。
   H1/H2/H3、动态平台、
   NPC/public `goTo`、车辆等能力继续由后续里程碑拥有；
6. **M6：在 Placement + Take + Validation 闭环上接入实验 Video Model Adapter**：
   [专项设计](../docs/superpowers/specs/2026-08-26-m6-video-model-adapter-design.md)与
   [实施计划](../docs/superpowers/plans/2026-08-26-m6-video-model-adapter-implementation-plan.md)已冻结
   provider-neutral 边界、passed Capture/Validation admission、Seedance 首适配器、
   exactly-once submission、输出 conformance 与一致性报告；当前是设计完成，未标记实现完成；
7. **M7（Ground/Air 首切片已完成）：继续扩展 P1.5 Control Feel/Physics Medium/State
   Resolver**：首条 Ground/Air 切片的
   [实施计划](../docs/superpowers/plans/2026-08-21-p15-control-feel-state-resolver.md) 已实施、
   通过全部生产 Gate，并由 PR #10 合入 `main`；水介质、`ControlMethodProfile`、
   CLI/Browser E2E 覆盖，以及整支对抗审查仍未交付。相机 overlay 已在 Browser V5
   基线上完成门禁与最终审查；Camera Domain 的 `cameraViewPreference`、纯 Selection、Browser
   V5 Command/View State 与 Babylon CameraDirector Admission 已在 `codex/camera-development`
   完成 clean break 接线，旧 Profile 请求表面已删除；作者面板
   Feel 范围与 session 数字袋类型已在 Preset 语义合同修复中收口，
   M7 不标记完成；
8. **M8（新产品候选尚未冻结，内部能力全门禁与双审 pending）：Canonical World State + Typed Relationship
   人—滑板窄可视切片**：G19-2/G19-4 已交付 Canonical Gameplay 合同、provider-neutral
   RuntimeHost staging 和 WorldPackage membership；G19-6 至 G19-8 已完成并通过 Final GO。
   当前已按
   [M8-S1 专项设计](../docs/superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md)与
   [实施计划](../docs/superpowers/plans/2026-08-26-m8-s1-mounted-on-skateboard-implementation-plan.md)
   实现 `mountedOn` 权威关系、Mount/Dismount Action、Receipt/Event、Babylon 投影、
   Safe Dismount、Browser Fixture 与严格 Capture Track validator；候选 `08f8f199` 完成 retained
   Physics `supportedBy`、Golden/non-Golden 共用投影、最新 Camera 合同的窄 mounted seam、完整
   Journal segment 与四阶段 retained Capture。该能力只用于 Host-fixed Canonical acceptance；Hosted
   Builder self-check 继续拒绝 Relationship 与 package-local Relationship Capability Ref，不宣称自动
   场景生产支持。历史本地影响面和 Capture 子审已通过；
   Cloud 首轮 exact-SHA gate 已完成 NO-GO：`typecheck` 有 28 errors / 4 files，root test 在
   workspace-boundary preflight 阻断；其余 build、Studio、independent、clean-break 与四项现行
   Canonical capability gates 通过；这些通过项仍只属于该历史 SHA。后续历史 checkpoint
   `7f9abd8bc78010cd0e04df8542d40f18c24bfae4` 已由 Cloud 完成 install/typecheck/root aggregate：
   workspace 49 debt / 1,760 symbols，census 386 = 347 + 39，contract 347 files / 4,150 pass /
   3 platform skip / 0 fail，resource-heavy 39 files / 613 pass / 0 fail。当前树又修改了生产
   Camera/Runtime/Registry 和生成物输入，因此该结果不能升级为当前 GO；必须冻结新 exact SHA、
   完成 Cloud 全矩阵与 Claude/Grok exact-tree 双审后，M8 才能标记内部能力完成。
   历史 catalog `verify:outdoor-gameplay` 已随 Gameplay route 删除，不能作为待恢复 Gate；正式
   mounted verifier 与现行 Canonical capability gates 才是当前证据。`CAM-MOUNT-1` 的窄修复归
   M8，广义 P2.4/GCC 仍开放；不向 `SubjectRuntimeStateV3` 追加字段，也不先铺开 seat/tether、
   轮子动力学、特技、车辆或 Hosted Builder admission；
9. **M9（P1.6 Full Reload 正式 Host 闭环已落地，Incremental 仍开放）**：P1.6 以
   [`WorldChangeSet 专项设计`](../docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)
   为唯一实施权威；规格文档状态行仍写 *implementation not started*，那是文档元数据，
   不以它代替 Backlog。H0–G1 已交付 AI Schema、WorldChangeSet、可注入 WAL journal、
   RuntimeHost publication V2、CLI 文件模式、Authoring 页 Edit API；正式 composition
   已补齐 file WAL、Candidate rehydrate、startup reconciliation、bounded cleanup、双
   Provider 与 Browser/manual 证据，见
   [`Full Reload production closure`](reviews/2026-08-27-p16-full-reload-production-closure.md)。
   完整 P1.4 Package、Package CLI 与持久 Runtime Session WAL 已由独立 P1.4 工作流
   后续交付；Incremental Hot Apply、差分等价与 P16-G2 仍未交付，不得把 Full Reload
   closure 宣称为完整 P1.6、生产编辑器或 Incremental GO。
   P2.5 Surface/Traversal 仍按其独立状态追踪。在实现游泳、攀爬或增量 Agent 修复前，
   禁止临时增加公共字段或场景脚本旁路**。
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
