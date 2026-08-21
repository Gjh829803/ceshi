# SDK 重构总进度与 Backlog

- 状态：Active，重构执行进度与剩余工作的唯一跟踪入口。
- 基准日期：2026-08-20。
- 长期目标总进度：约 **55%**，合理误差范围为 ±5%。
- 第一条 Canonical 纵向切片：约 **90%**。
- 当前代码入口：Canonical Authoring V3 → Placement Solver S1 → NormalizedWorldIR V3 → ExecutionPlan V4 → Babylon.js/Havok Runtime。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

> 首个产品资产 G Bot 已通过独立 Registry/CLI/Babylon/Havok/Browser Gate；这只代表
> 当前版本 G Bot 的 `idle/walk/run/jump`，不代表任意产品包或其余 21 个 Clip 已开放。

> Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask/Route Graph、更多 Constraint 与 P0.1 整体仍未完成。

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
- [`2026-08-19-extensible-subject-authoring-design.md`](superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)：主体组装、Relationship、坐骑、装备和飞行的专项规格；
- [`2026-08-19-asset-subject-s1b-visible-slice-design.md`](superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md)：首个 GLB/Rig/Animation/Collider Profile 资产主体纵向切片；
- [`2026-08-20-g-bot-product-asset-s1-design.md`](superpowers/specs/2026-08-20-g-bot-product-asset-s1-design.md)：首个真实产品人物 G Bot 的版本化映射与可视验收；
- [`2026-08-19-placement-constraint-layout-solver-design.md`](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)：AI 空间意图、最终 Transform 求解与冲突报告专项规格；
- [`2026-08-19-simulation-take-control-capture-design.md`](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)：WorldPackage、Take、Session、多 Pass Capture 与视频 Adapter 边界；
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
| 架构、边界与命名 | 8% | 92% | 7.4% | 总规格、ADR、主体/地形/3C 和 Placement/Take/Validation 专项已成稿；Placement S1 已冻结，Take/Validation 仍待评审 |
| Canonical Schema、IR、Registry 与 Compiler | 15% | 82% | 12.3% | V3/V3/V4、Hash、Lock、严格校验、Placement、Primitive 与首个 Asset Subject 资源表已交付；WorldChangeSet、完整 Capability 和 WorldPackage 尚未交付 |
| Babylon/Havok Runtime、物理与相机 | 15% | 72% | 10.8% | Heightfield、障碍、水域、多主体、第三人称、碰撞、重置、控制切换、Golden/G Bot Rigged Asset 与 Placement Assertion 复验已交付；多视角与完整生产预算尚未完成 |
| Subject LEGO 组装体系 | 15% | 45% | 6.75% | S0、S1a、Golden 与首个产品 G Bot 可视切片已完成；S1b 后续、S2、S3、S4 尚未完成 |
| Terrain、Region 与 Placement | 12% | 60% | 7.2% | Alpha 地形和 Placement Solver S1 海湾纵向切片已运行；通用 Terrain Mask/Route Graph、更多 Constraint 与完整 P0.1 未完成 |
| CLI、Browser Protocol 与自动化 | 10% | 70% | 7.0% | validate/build/run/capture/discovery/explain、layout validate/solve/explain、Browser V3 与 Golden/G Bot 等可视 Gate 已有；持久 Session、完整 Driver、Take 和 Package 工具未完成 |
| Semantic Action、动画与 Gameplay | 8% | 33% | 2.64% | Golden 与 G Bot `idle/walk/run/jump` 固定 Tick Animation Binding 已交付；通用 Action Request/Receipt、姿态、装备与规则未交付 |
| Simulation Take、控制通道与视频接入 | 10% | 15% | 1.5% | Take/Capture 专项已成稿，单截图能力已有；多 Pass、时间轨、Bundle 和模型 Adapter 未交付 |
| 生产 Gate、默认切换与旧实现退出 | 7% | 30% | 2.1% | Validation Profile/Report 专项已成稿，Canonical/Golden Rigged/G Bot/Placement Browser Gate 可运行；统一报告、默认切换和旧路径退出未交付 |
| **合计** | **100%** |  | **约 58%** | 首个产品资产加入可运行证据；对外按通用 Terrain/Route、生产 Gate 与剩余范围不确定性保守报告 **约 55%** |

“第一条 Canonical 纵向切片约 90%”只指以下较窄范围：AI 提交 JSON，SDK
完成严格校验、确定性编译、Babylon/Havok 运行、多主体控制、首个 Golden Asset
Subject、首个产品 G Bot、Placement S1、截图和查询。它不代表任意产品资产、完整 S1b/P0.1、关系、
完整动作、复杂地形、视频控制输出或生产切换已经完成。

## 3. 当前已完成并进入回归的能力

### 3.1 Canonical 编译底座

- [x] Canonical Authoring V3 是唯一接受的 JSON 输入；未发布的旧版本已删除。
- [x] 严格 JSON Schema、关闭未知字段、语义校验和结构化 Diagnostic。
- [x] NormalizedWorldIR V3 与 ExecutionPlan V4。
- [x] Canonical JSON Bytes、稳定 SHA-256、Definition Hash 和 Resource Lock。
- [x] 精确版本的 Registry Capability/Profile/Subject Definition 解析。
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
- [x] Heightfield、静态障碍物、角色碰撞和水域状态切换。
- [x] 第三人称跟随相机和受控主体切换。
- [x] `worldkit validate / build / run / capture`。
- [x] Browser Protocol V3 的加载、固定输入、绑定、Snapshot、Reset 和截图。
- [x] 真实 Chromium 下验证 Package Definition 的两个实例可以分别控制。

2026-08-20 的新鲜验证证据：

- `pnpm typecheck`：通过；
- `pnpm test`：49 个测试文件、441 项测试通过；
- `pnpm verify:canonical`：Authoring 3、Normalized IR 3、ExecutionPlan 4、
  Runtime Snapshot 3、Browser Protocol 3 全部通过；
- Canonical Browser Gate 覆盖 Babylon/Havok、墙体阻挡、水域切换、两个
  Package Subject 独立控制和确定性重置。
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
- [x] 评审并冻结专项设计中的字段、版本、首批 Constraint 与 Fixture（方案 2，
  Authoring V3 / NormalizedWorldIR V3 / ExecutionPlan V4，2026-08-20）。
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
- [ ] 引入完整 Route Graph、Locomotion Cost 与 `connected-by-route`。
- [ ] 增加 S1 之外的 Constraint、增量求解等价证明和通用 ValidationReport。

S1 纵向切片完成标准已满足：一个室外海湾场景不依赖 Agent 手写三个地标和 Spawn
最终坐标，Solver 输出通过 Schema、Physics、Route 和 Composition 阻断 Gate。
P0.1 整体仍以上述三项开放能力及生产范围扩展为完成标准。

#### P0.2 Simulation Take 与 Control Capture Bundle

目标：把“世界是什么”“本次怎样操作/拍摄”“输出给视频模型的控制信号”分成
三个独立、可哈希和可重放的制品。

- [x] 编写 [Simulation Take / Control Capture Bundle 专项设计](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)。
- [ ] 评审并冻结专项设计中的字段、编码 Profile、时间映射与 Fixture。
- [ ] 冻结 WorldPackage、Simulation Take、Runtime Session 与 Control Capture Bundle 的引用关系。
- [ ] 定义 Controller/Action/Input Track、Camera Track、Tick Range 和 Capture Schedule。
- [ ] 定义 Simulation Tick、Render Frame 与 Capture Frame 的显式映射。
- [ ] 定义版本化 Capture Profile 和必需/可选 Pass。
- [ ] 第一批必需 Pass：Neutral Color、Linear Depth Meters、Semantic Class ID、Stable Instance ID、World Normal。
- [ ] 评估并决定 Motion Vector、Albedo、Roughness、Metallic 和 Lighting Profile 的阶段。
- [ ] 每帧记录 Camera Intrinsics/Extrinsics、Snapshot/Event/Action/Relationship Receipt。
- [ ] Bundle 固定 WorldPackage、IR、ExecutionPlan、Registry Lock、Session 和 Take Hash。
- [ ] CLI/Browser 支持确定性运行 Take、等待 Render Ready、批量捕获和失败恢复。
- [ ] Playwright Fixture 验证通道尺寸、帧数、ID 集合、深度单位和跨帧 Hash 归属。

完成标准：同一个 WorldPackage 可以运行至少两个不同 Take，并生成互不混淆、可
重放的多通道 Bundle。

#### P0.3 Validation Report 与量化质量门禁

目标：用统一、可解释、可哈希的 Profile/Report 决定世界和控制制品能否进入下一
阶段，避免不同脚本各用一套阈值或以总体分数掩盖关键失败。

- [x] 编写 [World Validation Report 与质量门禁专项设计](superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)。
- [ ] 评审并冻结 ValidationProfile、ValidationReport、Gate、Metric 与 Evidence Schema。
- [ ] 冻结 Blocking/Advisory、Required Missing、Incomplete 和 Policy Decision 语义。
- [ ] 定义 Schema/Layout/Physics/Route/Composition/Capture/Replay/Performance/Integrity 首批 Gate。
- [ ] 把单位、阈值、容差、Evaluator、Platform Profile 与 Evidence 归属写入版本化 Profile。
- [ ] CLI 支持 verify/explain/compare，CI 持久化 Report 和 Evidence Manifest。
- [ ] Golden Fixture 覆盖浮空、穿插、不可达、Anchor 缺失、Depth 单位错误、帧归属错误和 Hash 损坏。
- [ ] 证明 Blocking Failure 或 Required Metric 缺失不能被 Advisory/总体分数抵消。

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

- [ ] 评审并冻结 `LocomotionProfile` 与 `ControlFeelProfile` 的唯一字段归属：前者负责
  运动模式及能力边界，后者负责加速度、减速度、转向速率、响应曲线和空中控制比例；
  奔跑等速度不得在两种 Profile 中形成同义字段或双重真相。
- [ ] 冻结 `ControlMethodProfile` 与语义 Intent Pipeline：Direct Move、Steering、Swim、
  Flight 等方法复用同一控制协议，由 Capability/Context 选择，World Agent 不直接调用
  人物 Motor、车辆控制器或飞行实现。
- [ ] 定义版本化 `PhysicsMediumProfile`：世界保留唯一全局重力向量，主体/介质只声明
  相对重力倍率、线性/角阻力、浮力、表面保持和单位明确的安全边界；最终数值字段必须
  按命名规则携带 `Ratio`/单位后缀，不能直接沿用未冻结概念稿中的含糊名称。
- [ ] 定义 `MediumSensor`、`SubjectStateProfile` 与纯固定 Tick `StateResolver`；Ground、
  Water、Air 的进入/退出使用迟滞阈值和明确优先级，不依赖动画状态或渲染帧率判断。
- [ ] 普通 Agent 只选择已注册 Profile；高级覆盖必须经过 Definition 的
  `allowedOverridePaths`、Schema 范围、Host Policy 和 Resource Budget，禁止直接填写
  Babylon/Havok Handle 或控制器实现参数。
- [ ] 为所有数值字段声明单位、有限值、最小/最大值和跨字段约束；非法 Profile 在
  Registry Admission 阶段失败，不能等到 Runtime 再钳制或猜测。
- [ ] Profile 的精确版本、Canonical Hash 和依赖进入 Registry Lock；Normalizer 和
  Compiler 将最小、引擎无关描述投影进 IR/ExecutionPlan，Runtime 不反向读取 Registry。
- [ ] Babylon/Havok 去除主体加速度、水中重力倍率和相关介质响应硬编码；Adapter 只
  执行已编译参数，并保持固定 Tick、失败回滚、幂等 Dispose 与资源所有权边界。
- [ ] Snapshot/Render Binding 暴露实际 `movementMedium`、`locomotionMode`、状态与生效
  Profile 引用，使 Agent、Capture 和视频 Adapter 不需要从动画 Clip 猜 Gameplay 状态。
- [ ] CLI/Browser/E2E 至少覆盖两种 Control Feel、不同主体重力倍率、Ground→Water→Air
  稳定切换、边界抖动、Reset、双实例隔离和同输入 Replay；缺少 Profile 或切换失败时
  保留上一稳定状态并返回稳定 Diagnostic。

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

- [ ] Relationship Manifest Registry 和角色化端点。
- [ ] 初始 Relationship 编译与动态事务边界。
- [ ] Socket/Slot 兼容、基数、冲突、删除策略和权限校验。
- [ ] 固定 Tick 原子提交，失败时逻辑、渲染、物理、控制和相机全部回滚。
- [ ] Request ID 幂等、Receipt、Event、Snapshot 和 Replay。
- [ ] 第一个人—滑板 attach/stand Fixture 完成绑定、移动、解绑和 Reset E2E。

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
冻结的 Heightfield + Opening + Static Structure + Walkable Surface + Region/Portal 组合，
不建立全 Mesh/全 Voxel 第二世界，也不让 AI 接触 Babylon/Havok。

- [x] 编写 Hybrid Terrain 与非 Heightfield 特殊地形专项设计，明确业界依据、职责、
  分阶段顺序和生产 Gate。
- [ ] 评审并冻结 H1 Bridge Fixture；公共字段冻结前先核实当前 Babylon/Havok 版本的
  Static Triangle Collider、Contact、Shape Lease 和 Character Controller 语义。
- [ ] 冻结 Static Structure 的 Geometry/Collider/Inventory/Provenance 资源边界；产品 GLB、
  Registry Prototype 和可选 Geometry Recipe 必须汇聚到相同锁定制品。
- [ ] 冻结 Terrain Opening 的内容寻址 Mask/Shape、Tile 编译和 Visual/Physics/Query 一致
  语义；后端 Heightfield 不支持洞时使用经过预算验证的静态 Tile Collider 路径。
- [ ] 定义 Walkable Surface 与 Collider Subshape 的稳定绑定；视觉 Mesh 不自动可走，
  `walkable`、`climbable` 等语义不能从材质、颜色或 Mesh 名推断。
- [ ] 定义引擎无关 Support Surface Query：请求携带 3D Origin、方向、距离和过滤条件，
  命中返回稳定 Surface/Entity ID、米制位置、法线、距离和语义，并支持同一 XZ 多层排序。
- [ ] 保持 Runtime Ground Support 单一所有者：实际支撑来自 Havok Contact/Controller，
  唯一 Resolver 映射到 Surface ID；Terrain Query、Medium、Action、Animation 和 Camera
  不得独立产生第二份 `isGrounded`。
- [ ] H1 Bridge/Cliff Fixture 验证桥面与桥下地面同 XZ 双层命中、上下路线、桥边离开、
  落地、净空、Camera、Reset、Rebind 和 30/60/120 Hz-like Replay。
- [ ] H2 Terrain Opening/Cave Entrance Fixture 验证洞口 Render、Collider、Query、Debug
  Overlay 同时移除，Structure 接缝没有不可见墙、跌落缝或角色卡点。
- [ ] H3 冻结 Interior Region、Portal 与既有 Region Graph/Route Graph 的唯一归属；实现
  室外→洞穴→室外的固定 Tick 纵向切片，但不把它冒充完整室内/NPC Navigation。
- [ ] H4 实现 Terrain Tile、Opening、Structure、Surface、Region、Portal 的原子 Cell 加载、
  LOD、共享资源 Lease、部分构造失败回滚、Dispose 和性能预算。
- [ ] CLI/Browser/Validation 输出 Opening Mask、Visual/Collider/Surface Overlay、Support
  Hit、Region/Portal、Seam/Clearance/Slope/Route Diagnostic 和全部 Resource/Profile Hash。
- [ ] 只有出现明确产品需求后，才为多层 Navigation、完整室内、运行时雕刻/破坏或
  Voxel/SDF 建立独立设计与实施计划；不得提前泄漏实验字段到 Canonical Schema。

完成标准：Bridge 与可进入 Cave 两个 Golden Fixture 分别证明同一 XZ 多层支撑、Terrain
Opening 当前 Render/Physics/Query 一致、物理接触唯一 Ground Support、可玩路线、固定 Tick Replay、
Streaming/Dispose 和自动 Diagnostic；普通 Agent 只引用稳定 Prototype/Profile/关系即可
组装场景。

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

#### P3.2 默认实现切换

- [ ] Playground 默认入口切换到 Canonical Babylon/Havok Runtime。
- [ ] 生产 Agent 编排迁出 SDK 仓库，只保留 SDK Fixture、Skill/CLI 接入文档和 Conformance。
- [ ] 旧 Plan-first 工件格式冻结为回归 Fixture，相关 ADR 标记为 Superseded。
- [ ] Three.js/Rapier Alpha 归档或移除，不继续承接新能力。
- [ ] README、AGENTS、快速接入、示例和发布流程只指向 Canonical 协议。
- [ ] 完整清理验证证明没有旧字段、双重运行时真相或隐式兼容分支。

#### P3.3 后续独立能力

以下能力保留架构扩展点，但没有进入当前生产承诺：

- [ ] Runtime World Director；
- [ ] NPC、导航、任务和 Gameplay Framework；
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
  └── P2.6 Hybrid Terrain / Multi-level Walkable Surface
        ├── H1 Bridge / Cliff
        ├── H2 Terrain Opening / Cave Entrance
        ├── H3 Interior Region / Portal / Playable Cave
        └── H4 Streaming / LOD / Lifecycle

P1.4 WorldPackage + P1.6 AI Schema / WorldChangeSet + P2.4 Controller/Camera/Driver
  └── P3.1 Production Gates（复用 P0.3 协议并扩展生产 Profile）
        └── P3.2 默认切换
```

Placement S1 已形成首个回归纵向切片；Capture 与 Validation 两条 P0 已形成可评审
专项设计，可以并行评审，但后续实现仍应保持窄纵向切片；
不要同时启动坐骑、装备、飞行、NPC 和室内，避免再次形成无法验收的大重构。

## 6. 下一里程碑

当前没有代码阻塞项。S1b Golden、首个产品 G Bot 与 Placement Solver S1 都已进入回归，下一步：

1. **M1：把 G Bot 的交付 Manifest/Registry 映射/Gate 固化为后续产品资产接入模板**；
2. **M2：评审冻结 Take/Capture 与 Validation 两份协议的首条实施范围**；
3. **M3：为 P0.2 编写五 Pass Capture 的窄纵向切片计划，并复用 Placement WorldPackage/Hash**；
4. **M4：扩展 P0.1 的 Terrain Mask/Route Graph，而不是新增第二套 Region/Route 语义**；
5. **M5：在 Placement + Take + Validation 闭环上接入实验 Video Model Adapter**；
6. **M6：评审冻结 P1.5 的 Control Feel/Physics Medium/State Resolver 首条纵向范围，清除
   Canonical Babylon 路径中的对应硬编码**；
7. **M7：按产品优先级选择 Semantic Action 后续或 Typed Relationship 窄可视切片**；
8. **M8：在实现游泳、攀爬或增量 Agent 修复前，分别冻结 P2.5 Surface/Traversal 与
   P1.6 AI Schema/WorldChangeSet 的专项设计，禁止临时增加公共字段或场景脚本旁路**。
9. **M9：P1.1 与 P2.5 边界稳定后评审 P2.6 H1 Bridge Fixture；先验证同 XZ 双层支撑、
   Static Collider 和唯一 Ground Support，不直接并行启动完整洞穴/室内**。

Take/Capture 与 Validation 字段冻结前不得实现公共协议字段；技术探针可以验证 Capture
Encoding 或 Runtime Query 可行性，但其实现不得泄漏到 Canonical Schema。

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
| 旧 Three/Rapier 与新 Babylon/Havok 长期双轨 | P3.2 设定明确默认切换和退出 Gate |
