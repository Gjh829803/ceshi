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

- PR #202 已按用户明确授权以管理员方式合并，main 为 `f35a56b2`；合并时 CI 与必需批准
  未完成，不记作通过。用户明确 CI 后续自行处理，不能将这次绕过授权推广为后续默认策略。
- 最新真实 Case `paper-moon-054-cf19-feedback-0905` 普通生产 passed/published、cleanup
  completed；Evaluation/strict diagnostic failed 事实保留。真实证据属于生产实现 `e271a35c`，
  后续测试清单/文档提交不冒充新完整 Case。不得据合并或普通生产成功关闭全部 CF。
- 仍有实质实现工作：CF-01/03/04/05/06/07/11/12/13/14/15/16/17/20/21，另有 CF-29
  Builder 进度可见性补充缺口。CF-03 为条件复现；CF-11/20/21 有预算/提示词切片，未关闭父任务。
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
- 用户授权 worktree/Case 清理已执行：移除 6 个 merged、无 tracked diff、无活动 cwd 的历史
  worktree（production-closure、report-only-baseline、usability-baseline、nbr-actionable-diagnostics、
  nbr65i-real-case、paper-moon-palace-054-test）；保留其 Git 分支。71 个历史 Case/辅助产物路径
  移入 `/Users/xiateng/.Trash/worldkit-worktree-cleanup-20260905-NdyJko`，可恢复，未清空废纸篓。
  工作区只保留上述最新生成 Case；Git 跟踪的测试 Case/fixtures 不删。最新 opening、Capture
  receipt、Package integrity、Run receipt SHA256 清理前后相同；其余 worktree tracked diff 未变。
  未合入分支、主 checkout、当前 Case worktree、close-prior-design-findings、nbr90-docs 的
  四份未提交文档均保留。缺失的旧 provider-debug worktree 登记已 prune，原 `3dd926cb`
  另存 `codex/archive-nbr-provider-debug-20260902`，没有迁移该旧调试实现。

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
| `BWMI-CF-14` / P1 | 修正场景还原视觉量测等价性并使用真实多视角证据：expected/observed silhouette 均采用同一定义，区分可见像素、遮挡、空洞与重复实例，world-side/top-down 不能只是签名/Hash 附件 | depends_on: BWMI-CF-10, WRC-SR-1; blocks: BWMI-PROD-10 | Capture measurement + reconstruction evaluator；per-view target observation/metric definition | 实心/中空拱门、完全遮挡、部分遮挡、分离重复组、相同 AABB 不同内部结构、Opening 相同但 top/side 不同；诊断不得把正确空洞误修为 enlarge/shrink | sequential, main-agent-only for rendered evidence |
| `BWMI-CF-15` / P1 | 让 Builder Skill 的可见结构支撑承诺成为显式 Case policy/gate：非 root 的 structural/playable Block 必须有到 root stratum 的 face-contact 支撑，只有声明并获准的 floating/background intent 可保留 | depends_on: Native Block Profile; blocks: WRC-SR-1 | Native Check/Ground policy；typed support disposition，不从 Mesh/tag/name 反推 | 浮空门顶、山体、平台、悬浮装饰、合法悬空背景、repair 后 support chain；warning 不得在无 disposition 时静默成为 passed | sequential |
| `BWMI-CF-16` / P1 | 修复 current styled-image 假通过，同时保持旧成功标准：base Visual Reconstructor 在同一任务内完成 opening 自检，再由 Host 做历史等价的 file/hash/role closure，随后 tri-view 必须消费该 opening 的确切像素/Hash；新增独立 base semantic Reviewer 只能写 strict diagnostic，不能成为普通生产 veto。保留 Front/Right/Back 与 semantic-front 方向；纯签名/Hash 完整性只能标记 generated，不能单独伪造任务内 visual pass | depends_on: P0.2 Capture; blocks: BWMI-PROD-10/30, Recording Workbench | `scripts/visual` launcher/generator/finalizer；same-task self-check + Host closure + accepted-opening receipt；可选独立 diagnostic ledger | opening identity/geometry drift、tri-view 跨图身份/材质漂移、Front/Right/Back 调换/镜像、单图失败修复且其余 pass Hash 不变、independent diagnostic 不改判 ordinary outcome | sequential |
| `BWMI-CF-17` / P1 | 为 current 单段 Seedance runner 增加 raw-media admission，禁止用任意 letterbox 和 `tpad=clone` 把短片/冻结尾“修成”exact frames；技术 conformance 保留 raw/final 双 Hash，但不冒充语义通过 | depends_on: P0.4 Adapter; blocks: BWMI-PROD-40 | Video Adapter raw admission；duration/aspect/active-frame/freeze/black-bar/audio measurements | 几秒短片、长冻结尾、错误宽高比、全黑边、静音/无效音频、近似 fps 可有界 resample；严重残缺不得进入转码成功态 | sequential |
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
