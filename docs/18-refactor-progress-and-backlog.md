# SDK 重构总进度与 Backlog

- 状态：Active，重构执行进度与剩余工作的唯一跟踪入口。
- 基准日期：2026-08-20。
- 长期目标总进度：约 **45%**，合理误差范围为 ±5%。
- 第一条 Canonical 纵向切片：约 **85%**。
- 当前代码入口：Canonical Authoring V2 → NormalizedWorldIR V2 → ExecutionPlan V3 → Babylon.js/Havok Runtime。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

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
- [`2026-08-19-extensible-subject-authoring-design.md`](superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)：主体组装、Relationship、坐骑、装备和飞行的专项规格；
- [`2026-08-19-asset-subject-s1b-visible-slice-design.md`](superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md)：首个 GLB/Rig/Animation/Collider Profile 资产主体纵向切片；
- [`2026-08-19-placement-constraint-layout-solver-design.md`](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)：AI 空间意图、最终 Transform 求解与冲突报告专项规格；
- [`2026-08-19-simulation-take-control-capture-design.md`](superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)：WorldPackage、Take、Session、多 Pass Capture 与视频 Adapter 边界；
- [`2026-08-19-world-validation-report-and-quality-gates-design.md`](superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)：量化 Gate、Metric、Evidence 和生产阻断协议；
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
| 架构、边界与命名 | 8% | 90% | 7.2% | 总规格、ADR、主体/地形/3C 和 Placement/Take/Validation 专项已成稿；三份新协议仍待评审冻结 |
| Canonical Schema、IR、Registry 与 Compiler | 15% | 75% | 11.25% | V2/V2/V3、Hash、Lock、严格校验、Primitive 与首个 Asset Subject 资源表已交付；WorldChangeSet、完整 Capability 和 WorldPackage 尚未交付 |
| Babylon/Havok Runtime、物理与相机 | 15% | 65% | 9.75% | Heightfield、障碍、水域、多主体、第三人称、碰撞、重置、控制切换与首个 Rigged Asset Runtime 已交付；多视角与完整生产预算尚未完成 |
| Subject LEGO 组装体系 | 15% | 40% | 6.0% | S0、S1a 与 S1b 首个 Golden 可视切片已完成；S1b 后续、S2、S3、S4 尚未完成 |
| Terrain、Region 与 Placement | 12% | 30% | 3.6% | Alpha 地形能力可运行，Placement/Solver 专项已成稿；长期 Terrain IR/Mask/Region 与 Solver 尚未形成 Canonical 纵向切片 |
| CLI、Browser Protocol 与自动化 | 10% | 55% | 5.5% | validate/build/run/capture/discovery/explain、Browser V3 与 Rigged Subject Gate 已有；持久 Session、完整 Driver、Take 和 Package 工具未完成 |
| Semantic Action、动画与 Gameplay | 8% | 30% | 2.4% | Golden `idle/walk/run/jump` 固定 Tick Animation Binding 已交付；通用 Action Request/Receipt、姿态、装备与规则未交付 |
| Simulation Take、控制通道与视频接入 | 10% | 15% | 1.5% | Take/Capture 专项已成稿，单截图能力已有；多 Pass、时间轨、Bundle 和模型 Adapter 未交付 |
| 生产 Gate、默认切换与旧实现退出 | 7% | 20% | 1.4% | Validation Profile/Report 专项已成稿且 Canonical Browser Gate 可运行；统一报告、默认切换和旧路径退出未交付 |
| **合计** | **100%** |  | **约 49%** | 首个 S1b Asset Subject 切片提高了实现证据；对外按剩余生产 Gate 与范围不确定性报告 **约 45%** |

“第一条 Canonical 纵向切片约 85%”只指以下较窄范围：AI 提交 JSON，SDK
完成严格校验、确定性编译、Babylon/Havok 运行、多主体控制、首个 Golden Asset
Subject、截图和查询。它不代表任意产品资产、完整 S1b、关系、完整动作、复杂地形、
视频控制输出或生产切换已经完成。

## 3. 当前已完成并进入回归的能力

### 3.1 Canonical 编译底座

- [x] Canonical Authoring V2 是唯一接受的 JSON 输入；未发布的 V1 已删除。
- [x] 严格 JSON Schema、关闭未知字段、语义校验和结构化 Diagnostic。
- [x] NormalizedWorldIR V2 与 ExecutionPlan V3。
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

### 3.3 Subject S1b 首个 Golden Asset 可视切片

- [x] 项目自有、自包含 Golden GLB、原始字节 SHA-256 与精确 Inventory。
- [x] Subject Asset、Rig Profile、Animation Set、Collider Profile 与 Definition Registry。
- [x] Host Asset Resolver、长度/Hash/GLB/Inventory Gate 与 Babylon AssetContainer 缓存。
- [x] 独立 Skeleton/Animation/Transform/Dispose、Bone Socket 与白模材质。
- [x] 固定 Tick `idle/walk/run/jump`、Snapshot `activeActionId` 与 Havok 权威位移。
- [x] CLI/Browser 两实例、墙体停止、五张动作/世界截图与 Hash 篡改失败 E2E。

未完成：产品资产验收、Compound Collider、LOD、更多拓扑、独立动画资产、通用姿态、
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
- `pnpm test`：35 个测试文件、335 项测试通过；
- `pnpm verify:canonical`：Authoring 2、Normalized IR 2、ExecutionPlan 3、
  Runtime Snapshot 3、Browser Protocol 3 全部通过；
- Canonical Browser Gate 覆盖 Babylon/Havok、墙体阻挡、水域切换、两个
  Package Subject 独立控制和确定性重置。
- `pnpm verify:rigged-subject`：项目自有 Golden GLB、Rig、Collider Profile、
  `idle/walk/run/jump`、双实例隔离、墙体停止、936×596 截图与
  `SUBJECT_ASSET_HASH_MISMATCH` 篡改 Gate 全部通过。

## 4. Master Backlog

优先级表示产品验证和架构依赖顺序，不表示可以跳过低优先级能力的生产门禁。
每个新纵向切片在实施前必须有独立设计或实施计划；本文不替代具体 Schema 和
测试规格。

### P0：完成产品核心闭环

#### P0.1 Placement Constraint 与确定性 Layout Solver

目标：让 AI 表达空间意图和硬约束，由 SDK 生成可解释的最终 Transform，而不是
要求模型为所有实例猜绝对坐标。

- [x] 编写 [Placement Constraint / Layout Solver 专项设计](superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md)。
- [ ] 评审并冻结专项设计中的字段、版本、首批 Constraint 与 Fixture。
- [ ] 冻结 Placement Constraint 与 Gameplay Relationship 的协议边界。
- [ ] 定义关闭枚举的 Required/Preferred Constraint 判别 Union。
- [ ] 第一批覆盖 Region 内外、相对距离、方向、支撑、净空、坡度、路线和镜头可见性。
- [ ] 定义 Normalized Constraint、Solver 输入、稳定排序、Seed 和预算。
- [ ] Solver 输出 Transform、Provenance、违反项、评分和冲突核心。
- [ ] 失败返回结构化 Diagnostic 与可执行但不自动提交的修复建议。
- [ ] CLI 支持 validate/solve/explain，并输出可审计 Solve Report。
- [ ] Browser Fixture 覆盖接地、无穿插、Spawn 可达、Route 坡度和 Opening Shot Anchor。
- [ ] Golden Fixture 证明相同输入和 Lock 得到相同 Transform 与 Report Hash。

完成标准：至少一个室外参考场景不依赖 Agent 手写全部绝对坐标，Solver 输出通过
Schema、Physics、Route 和 Composition 阻断 Gate。

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
- [ ] 完整室内、洞穴、Overhang 和流式开放世界；
- [ ] 联网、多人、UI、音频、复杂布料、流体和破坏。

它们只有在目标、Owner、依赖和验收 Fixture 被明确后才拆成正式实施计划，不能
为了提高总进度数字提前计为已开始。

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

P1.2 Asset Subject + P1.3 Semantic Action
  └── P2.1 Typed Relationship
        └── P2.2 Mount / Tow
              └── P2.3 Equipment / Flight

P1.4 WorldPackage + P2.4 Controller/Camera/Driver
  └── P3.1 Production Gates（复用 P0.3 协议并扩展生产 Profile）
        └── P3.2 默认切换
```

Placement、Capture 与 Validation 三条 P0 已形成可评审专项设计，可以并行评审，
但首个实现里程碑应保持窄纵向切片；
不要同时启动坐骑、装备、飞行、NPC 和室内，避免再次形成无法验收的大重构。

## 6. 下一里程碑

当前没有代码阻塞项。S1b 首个 Golden 可视切片已经完成并进入回归；三份 P0 专项
设计已经成稿，下一步依次进行：

1. **M1：评审并冻结 Placement、Take/Capture、Validation 三份协议的公共边界**；
2. **M2：决定三份文档列出的字段级开放项，并为未发布 Schema 选择干净替换或 Major 升级**；
3. **M3：编写首条窄纵向切片实施计划，定位真实包、Schema、迁移、Fixture 与 Conformance**；
4. **M4：实现 Constraint + Take + 五 Pass Capture + Validation 的最小闭环**；
5. **M5：在同一闭环上接入一个实验 Video Model Adapter**；
6. **M6：在 Golden 回归稳定后，选择产品资产验收、Semantic Action 后续或 Typed Relationship 的下一条窄可视切片**。

M1/M2 完成前不得实现公共字段；技术探针可以验证 Capture Encoding 或 Runtime Query
可行性，但其实现不得泄漏到 Canonical Schema。

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
| 任意 Blender/Python 代码进入生产世界 | 只允许隔离制作 Provider；Runtime 只消费锁定制品 |
| 机器人研究仓库的格式污染 Web SDK | 只借鉴 Solver、Gate、Registry 和 Capture 思想，通过 Adapter 映射 |
| S0/S1a/Golden S1b 切片完成被误读为整个 Subject 系统完成 | 本文分别追踪 S1b 未完成项、S2、S3 和 S4 |
| 旧 Three/Rapier 与新 Babylon/Havok 长期双轨 | P3.2 设定明确默认切换和退出 Gate |
