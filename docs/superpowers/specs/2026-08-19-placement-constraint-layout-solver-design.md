# Placement Constraint 与确定性 Layout Solver 设计

- 状态：**Accepted / S1 Implemented and in Regression（2026-08-20）**。
- 方案决策：采用“完整但受控的纵向切片”，交付 Schema → Solver → CLI →
  海湾 Fixture → Report/Browser Gate；不交付只有字段没有效果的空 Schema，也不在
  S1 一次实现通用优化器。
- 适用范围：Canonical Authoring、Normalizer、Compiler、CLI/Browser、Conformance。
- 设计目标：让 AI 描述空间意图和验收要求，由 SDK 生成可解释、可复现、可验证的最终 Transform。
- 非目标：运行时骑乘、装备、拖拽、控制权等 Gameplay Relationship。
- 上位规格：[AI-first LEGO 游戏 SDK 设计](./2026-08-17-ai-first-lego-game-sdk-design.md)。
- 调研依据：[Agentic 白模世界到可控视频：开源方案调研与架构启示](./2026-08-19-agentic-whitebox-to-video-open-source-research.md)。
- 后续专项：[Route Graph 与主体可通行性设计](./2026-08-21-route-graph-and-traversability-design.md)。

## 1. 决策摘要

1. AI-facing Authoring Schema 同时支持精确放置和约束求解放置，但两者使用关闭的判别 Union，不依赖可选字段猜模式。
2. Placement Constraint 只回答“编译时应摆在哪里”；Gameplay Relationship 只回答“运行时实体之间是什么关系”。二者拥有不同 Schema、生命周期、诊断和回放语义。
3. Layout Solver 是 Authoring 引用解析与 NormalizedWorldIR 投影之间的一等确定性阶段。
   Solver 不调用 LLM/VLM，不直接创建 Babylon/Havok 对象。
4. 必需约束不能被综合评分抵消；无法满足时不产生可运行 WorldPackage。偏好约束可以违反，但必须在报告中逐项解释。
5. Solver 输出不只是 Transform，还包括 `LayoutSolveReport`、约束证据、Provenance、精确 Solver Profile 和结果 Hash。
6. 同一 Canonical Authoring、Registry Lock、内容资源、Solver Profile、Seed 和预算必须得到相同规范输出与 Report Hash。
7. 第一阶段只覆盖室外 Heightfield、Region、Route、静态 Object、Subject Spawn、Anchor 和 Camera Composition；室内装箱、动态导航、车辆交通、布料和任意 Mesh 装配不在首期范围。
8. S1 对 Canonical Authoring 做一次干净的 Major 升级：Authoring Spec V3、
   NormalizedWorldIR V3、ExecutionPlan V4。仓库内 Fixture 一次性迁移，不保留 V2/V3
   双重字段或永久兼容别名。
9. S1 使用仓库内窄域、离散、确定性的 CSP/Search 实现，不引入第三方通用优化器；
   以后替换算法必须保持相同输入、输出、排序、诊断和 Report Hash 契约。
10. S1 Camera Probe 使用引擎无关的 Bounds Projection、Heightfield Line-of-Sight 和
    已锁定静态 Bounds 遮挡近似；Browser Gate 再用真实 Babylon/Havok Runtime 复验。
11. S1 只公开已经端到端实现的八种 Constraint Kind，不预埋未实现的枚举值。

## 2. 为什么必须单独存在这一层

旧 Authoring 输入让 Object/Anchor 直接携带最终 Transform。该模式适合验证编译链，
但会把三个不应由 Agent 独自承担的问题混在一起：

- 从图片和 Prompt 推断语义区域及相对关系；
- 将相对关系转换成精确坐标；
- 检查支撑、穿插、坡度、路线和镜头构图。

AI 更稳定地表达“灯塔位于海湾右侧高地、玩家出生点在步道上、二者可见且可达”，而不是为每个对象猜测米制坐标。工程系统则更适合求解边界、距离、碰撞、支撑和确定性排序。因此链路固定为：

```text
Reference Image + Prompt
  → Agent 提取 Region / Anchor / Placement Constraint
  → Canonical Schema 与语义校验
  → Registry / Terrain / Region 解析
  → Deterministic Layout Solver
  → Resolved Transform + LayoutSolveReport
  → NormalizedWorldIR
  → ExecutionPlan / WorldPackage
```

这不是让 Solver “理解图片”。图片理解仍属于上游 Agent 或隔离 Authoring Provider；Solver 只消费闭合、可验证的数据。

## 3. 权威边界

### 3.1 Placement Constraint

- 生命周期：Authoring/Compile Time。
- 输入：Entity、Region、Route、Surface、Camera Region 和数值约束。
- 输出：最终 Transform、约束结果和 Provenance。
- 例子：位于区域内、离海岸至少 4 米、由地形支撑、面向灯塔、在开场镜头右上区域可见。
- 编译完成后，NormalizedWorldIR 保存已解出的 Transform 和来源；Runtime 不再重新猜位置。

### 3.2 Gameplay Relationship

- 生命周期：Initial Runtime State 或运行时事务。
- 输入：类型化角色端点、Socket/Slot、Binding Profile、权限和期望状态。
- 输出：Receipt、Event、Snapshot、物理/控制/相机上下文的原子变化。
- 例子：`mounted-on`、`equipped-by`、`towing`、`standing-on`。
- 必须可绑定、解绑、失败回滚和重放，不能被 Solver 展平成静态坐标。

### 3.3 禁止的混用

- 不把 `mounted-on` 写成 `near + supported-by` 后长期维持。
- 不把“灯塔在东侧山脊”写成运行时 Relationship。
- 不让 RenderNode 父子关系成为任一逻辑真相。
- 不使用通用 `subjectId/targetId/params` 三元组；每种约束和关系都使用角色化端点。

### 3.4 Placement 与 Traversability

Placement 负责求出 Entity 的最终 Transform 和局部约束事实；Traversability 负责证明
指定主体能否从声明起点到达声明终点。两者顺序固定为：

```text
Placement Solve
  → Resolved Transform / Collider / Traversal Surface
  → Traversal Graph Build
  → Route Query
  → Fixed-tick Runtime Traversal Gate
```

`supported-by`、`minimum-clearance` 和 `within-slope-limit` 可以证明单个 Entity 或已声明
Route 的局部事实，但它们不能替代端到端连通性。反过来，Traversal Graph 不能重新移动
Entity 来制造可达结果；路径失败必须返回 Diagnostic/ChangeSet 建议并重新执行 Placement。

AI-facing Route 意图继续使用 `spatial.routes`。SDK 从 Heightfield、显式 Traversal Surface、
权威 Collider 和主体 Profile 派生分层 3D Graph，不要求 AI 手写 NavMesh 节点或 Provider
参数。字段、Gate 和第一期静态台阶/平台 Fixture 由后续专项统一定义。

## 4. Authoring Schema 形状

以下字段形状已作为 Canonical Authoring Spec V3 交付。旧版本未成为外部生产契约，
仓库内 Fixture 已一次性迁移；Validator、CLI、示例和生成类型不再接受旧版本，也不
保留 `transform`/`placement` 两套公共真相。

### 4.1 Node Placement 判别 Union

每个需要空间位置的 Node 使用统一 `placement` 字段：

```json
{
  "id": "lighthouse",
  "kind": "object",
  "prototypeRef": "package://prototype/coastal-lighthouse@1",
  "placement": {
    "kind": "solved",
    "initialTransform": {
      "positionMetersXYZ": [28, 8, -36],
      "rotationEulerRadiansXYZ": [0, 0, 0],
      "scaleXYZ": [1, 1, 1]
    },
    "placementConstraintIds": [
      "lighthouse-inside-east-bluff",
      "lighthouse-clear-water",
      "lighthouse-visible-opening-shot"
    ]
  }
}
```

Union 只有两种模式：

```text
FixedPlacement
  kind: "fixed"
  transform: TransformSpec

SolvedPlacement
  kind: "solved"
  initialTransform?: TransformSpec
  placementConstraintIds: string[]
```

规则：

- `fixed` 表示 Authoring Transform 是硬事实；Solver 可以验证，但不能移动。
- `solved` 表示 Solver 拥有最终 Transform 权威；`initialTransform` 只是确定性候选 Seed，不是兜底答案。
- 没有 `placement` 的可放置 Node 无效；不根据是否出现 `transform` 隐式推断模式。
- Terrain/Water 等拥有专用空间定义的 Node 可以使用其专用协议，但参与约束时必须投影为明确 Region/Surface。
- S1 只有 Object 与 Anchor 直接携带 `placement`。Subject 继续通过
  `spawnAnchorEntityId` 引用 Fixed/Solved Anchor；Camera Transform 由锁定 Camera Rig、
  Target 和开场参数派生。Subject/Camera 不复制第三套位置字段。

### 4.2 Placement Constraint 集合

顶层统一入口：

```json
{
  "constraints": {
    "placements": [
      {
        "id": "lighthouse-inside-east-bluff",
        "kind": "inside-region",
        "requirement": "required",
        "entityId": "lighthouse",
        "regionId": "east-bluff",
        "boundaryClearanceMeters": 2
      },
      {
        "id": "lighthouse-visible-opening-shot",
        "kind": "visible-in-camera-region",
        "requirement": "preferred",
        "preferenceWeightRatio": 0.8,
        "visibleEntityId": "lighthouse",
        "cameraEntityId": "opening-camera",
        "screenRegionId": "upper-right",
        "minimumVisibleRatio": 0.65,
        "minimumProjectedAreaRatio": 0.001
      }
    ]
  }
}
```

每条约束必须具有 `id`、`kind`、`requirement` 和该种约束的角色化端点。`requirement` 只有：

- `required`：任何违反都使求解失败；
- `preferred`：允许违反，但必须带 `preferenceWeightRatio` 并报告代价。

`preferenceWeightRatio` 只允许出现在 `preferred` 上，范围为 `(0, 1]`。它只用于同一 Solver Profile 内的稳定排序，不是跨场景质量分数。

### 4.3 S1 关闭的 Constraint Kind

| `kind` | 角色化字段 | 关键数值 | 语义 |
|---|---|---|---|
| `inside-region` | `entityId`, `regionId` | `boundaryClearanceMeters` | Entity Bounds 完整位于 Region 内 |
| `outside-region` | `entityId`, `regionId` | `boundaryClearanceMeters` | Entity Bounds 与禁止 Region 保持净空 |
| `distance-range` | `entityId`, `referenceEntityId` | `minimumDistanceMeters`, `maximumDistanceMeters` | 约束 Pivot 或声明 Anchor 间距离 |
| `faces-entity` | `facingEntityId`, `targetEntityId` | `maximumAngularDeviationDegrees` | `-Z` Forward 朝向目标 |
| `supported-by` | `supportedEntityId`, `supportingEntityId` | `maximumSupportGapMeters`, `minimumSupportRatio` | 有足够接触面且不悬空 |
| `minimum-clearance` | `entityId`, `otherEntityIds` 或 `semanticClassIds` | `clearanceMeters` | Collider/Bounds 间净空 |
| `within-slope-limit` | `entityId` 或 `routeId`, `terrainEntityId` | `maximumSlopeDegrees` | 支撑区或路线不超坡度上限 |
| `visible-in-camera-region` | `visibleEntityId`, `cameraEntityId`, `screenRegionId` | `minimumVisibleRatio`, `minimumProjectedAreaRatio` | 投影、遮挡和画面区域满足要求 |

补充规则：

- `screenRegionId` 引用 Authoring 中定义的规范化屏幕区域，不接受自由文本如“偏右一点”。
- `otherEntityIds` 与 `semanticClassIds` 是互斥 Union，不通过两个可选数组猜模式。
- `supported-by` 第一阶段只支持静态 Terrain/Object Surface；动态平台属于 Runtime Gameplay。
- `avoid-overlap` 不单独公开；它是 `minimum-clearance` 的 `clearanceMeters: 0` 特例，避免同义字段。

`relative-direction` 与 `connected-by-route` 不属于已实现 S1：前者需要先冻结参考坐标帧；
后者由 [Route Graph 与主体可通行性专项设计](./2026-08-21-route-graph-and-traversability-design.md)
进入 M5 R0/R1/R1b，依赖完整 Graph/Profile/Runtime Gate。S1 仍会验证已声明 Route 的
坡度、净空与窄 Fixture Browser 证据，但不允许 AI 用一个尚未实现的 Constraint Kind
表达连通性。

### 4.4 S1 Region、Route 与 Camera Region 输入

S1 Solver 不能依赖旧的 Three.js Scene DSL。Authoring V3 因此交付一个 `spatial`
对象中的三个关闭集合：

- `spatial.regions`：S1 只支持 `polygon-xz`，字段为稳定 `id`、
  `pointsMetersXZ`、可选 `minimumHeightMeters`/`maximumHeightMeters` 和
  `semanticClassId`。Water Boundary 可被投影为只读 Region，但不复制 Water 真相。
- `spatial.routes`：S1 只支持 `polyline-xz`，字段为稳定 `id`、`pointsMetersXZ`、
  `widthMeters` 和 `locomotionProfileRef`。Route 是约束/验证输入，不是 Runtime
  Relationship。
- `spatial.screenRegions`：S1 使用归一化 `minimumUv`/`maximumUv` 矩形；`[0, 0]` 是图像
  左上角，`+U` 向右，`+V` 向下，边界范围均为 `[0, 1]`。不接受“左上”“偏右”等
  自然语言别名。

这些是 S1 的解析几何输入。后续 Canonical Terrain Pipeline 可以让同一 Region ID
引用内容寻址 R8 Mask，让 Route 引用锁定 Graph，但不能新增第二套 Region/Route 语义。

## 5. Normalized IR 与求解输出

Authoring Constraint 不直接进入 Runtime。Solver 成功后，Normalizer 输出
NormalizedWorldIR V3：

- 每个 Entity 的最终 `transform`；
- `placementProvenance`：`fixed | solved`、来源 Constraint ID、Solver Profile Ref 和 Report Hash；
- 规范化 Region/Surface/Bounds 引用；
- 对后续 Gate 有用的 Required Constraint Assertion；
- 不包含搜索队列、随机生成器内部状态或 Provider Handle。

ExecutionPlan V4 只消费最终 Transform、Runtime 所需 Assertion 和资源引用。Runtime
加载时可重新验证接地/穿插等物理断言，但不能静默重新布局。Authoring V3、IR V3、
ExecutionPlan V4 必须原子迁移示例、CLI、Browser Protocol Fixture 与 Conformance，
不得通过可选字段兼容旧版本。

## 6. Layout Solver Pipeline

```text
1. Schema Validation
2. Semantic Reference Validation
3. Registry / Asset Bounds / Terrain / Region Resolution
4. Fixed Placement Validation
5. Candidate Generation
6. Required Constraint Propagation
7. Required Constraint Search
8. Preferred Constraint Optimization
9. Physics / Route / Camera Probe
10. Canonical Result Selection
11. LayoutSolveReport + NormalizedWorldIR Projection
```

### 6.1 Candidate Generation

- Region 使用稳定采样网格、关键边界点、Route Node 和显式 Anchor 生成候选。
- Terrain 候选携带高度、法线、坡度、Semantic Region 和支撑信息。
- Asset Bounds、Pivot、Forward Axis、Collider Derivation Profile 在候选生成前已锁定。
- `initialTransform` 作为第一个候选；它不会绕过约束。

### 6.2 求解顺序

- Required Constraint 先传播和剪枝；任何已知冲突立即形成 Conflict Core。
- 可行解集合内再优化 Preferred Constraint。
- Entity、Constraint、Region、候选和 tie-break 都按稳定 ID 与量化值排序。
- 不以 Worker 完成顺序、Map 插入顺序、当前时间或浮点噪声决定结果。

### 6.3 物理与构图探针

Solver 可以调用引擎无关的 Geometry/Physics Query Port：Bounds、Raycast、Overlap、Support、Slope、Route Cost 和 Camera Projection。Babylon/Havok 只是某个实现；公共 Schema 与 Report 不出现其 Handle 或专有类型。

S1 Solver Query Port 固定使用量化 AABB/Collider Bounds、Heightfield Support/Slope、
Route Polyline 采样、Camera Frustum Projection、Heightfield Line-of-Sight 和已锁定静态
Bounds 遮挡。它不加载渲染 Mesh，也不调用 Babylon Scene Occlusion Query。Browser Gate
随后使用真实 Runtime 复验；若近似与 Runtime 结果冲突，以 Runtime 阻断报告为准，
不能运行时悄悄移动 Entity。

### 6.4 S1 包边界与调用顺序

- `packages/authoring`：拥有 Authoring V3 Schema、字段级诊断、引用解析和
  `ResolvedLayoutInputV1` 投影，不拥有搜索算法。
- `packages/layout-solver`：新建引擎无关包，拥有候选生成、Constraint Evaluator、
  Required Search、Preferred 排序、Conflict Core 和 Report Canonicalization。
- `packages/compiler`：消费求解后的 NormalizedWorldIR V3，生成 ExecutionPlan V4；
  不重新运行 Solver。
- `packages/runtime-babylon`：只复验 Execution Assertion，不读取 Authoring Constraint，
  不修正求解结果。
- CLI/Browser Host：编排 validate → resolve → solve → normalize → compile → runtime gate，
  并保存 Report/Hash；Provider/LLM 不进入该链路。

`packages/layout-solver` 的公开入口接收闭合 `ResolvedLayoutInputV1` 和锁定
`LayoutSolverProfileV1`，返回 `LayoutSolveResultV1`。它不能读取文件、网络、时间、环境
变量或 Babylon/Havok Handle。

## 7. 确定性协议

求解身份由以下输入共同决定：

```text
canonicalAuthoringSpecHash
registryLockHash
terrainResourceHashes
assetBoundsHashes
solverProfileRef + resolvedVersion + contentHash
seed
iterationBudget
quantizationProfile
```

规则：

- 预算使用最大候选数、最大迭代数和最大搜索节点数；wall-clock timeout 只负责中止，不能改变成功结果。
- 位置、角度、距离、投影面积和评分使用 Solver Profile 定义的量化精度与容差。
- 并行实现必须在结果选择前恢复稳定顺序。
- 任何 LLM/VLM 调用都在 Solver 外部，结果先固化为 Authoring 数据和 Hash。
- Solver Profile 未锁定、资源 Bounds 未锁定或浮点结果不可规范化时拒绝生成 Production Package。

## 8. LayoutSolveReport

报告是一等可哈希 Artifact，而不是日志文本：

```json
{
  "kind": "worldkit-layout-solve-report",
  "schemaVersion": 1,
  "id": "coastal-world-layout",
  "authoringSpecHash": "sha256:...",
  "registryLockHash": "sha256:...",
  "solverProfileRef": "worldkit://layout-solver-profile/outdoor.s1@1",
  "resolvedVersion": "1",
  "solverProfileHash": "sha256:...",
  "seed": 20310417,
  "status": "solved",
  "placementsByEntityId": {},
  "constraintResultsById": {},
  "diagnostics": [],
  "searchNodeCount": 72041,
  "conflictCheckCount": 0,
  "conflictConstraintIds": [],
  "totalPreferenceCostRatio": 0
}
```

`status` 关闭为：

- `solved`；
- `unsatisfied`；
- `budget-exceeded`；
- `invalid-input`。

每个 Placement 结果至少记录最终 Transform、候选来源、满足的 Constraint IDs 和局部代价。每个 Constraint 结果至少记录 `satisfied`、测量值、容差、证据引用和违反原因。`unsatisfied` 必须返回稳定的最小或近似 Conflict Core；不允许返回一个“尽力而为”的 Production Transform。

`layoutSolveReportHash` 是对不含自哈希字段的 Canonical Report Bytes 计算的外部内容
Hash，由 CLI 返回并被 NormalizedWorldIR/ValidationReport 引用；若落盘需要携带 Hash，
使用独立 Integrity/Envelope，禁止把 Hash 写回自身哈希输入。

## 9. Diagnostic 与 AI 修复

顶层求解结果使用精确、关闭的稳定 Code、JSON Pointer、Entity/Constraint ID、测量值
和建议操作：

- `PLACEMENT_INPUT_INVALID`；
- `PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED`；
- `PLACEMENT_REGION_HAS_NO_CANDIDATE`；
- `PLACEMENT_SOLVER_BUDGET_EXCEEDED`。

单条 Constraint 结果另用关闭的 Evaluator Violation Code，例如
`PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED`、`PLACEMENT_CLEARANCE_CONFLICT`、
`PLACEMENT_SLOPE_LIMIT_EXCEEDED` 和 `PLACEMENT_CAMERA_REGION_OCCLUDED`。确定性由重跑
Hash Gate 证明，不虚构一个尚未实现的 `PLACEMENT_NONDETERMINISTIC_RESULT` 公共 Code。

建议可以说明“扩大 Region”“降低 preferred 权重”“增加显式 Anchor”或“拆分互斥 Required Constraint”，但只能通过 `WorldChangeSet` 形成候选修复；SDK 不自动修改 Authoring 真相。

## 10. CLI、Browser 与 ChangeSet

已交付命令面：

```text
worldkit layout validate <authoring.json>
worldkit layout solve <authoring.json> --output <directory>
worldkit layout explain <report.json> --entity-id <id>
worldkit layout explain <report.json> --constraint-id <id>
```

所有命令支持 JSON 输出并区分 process error、invalid input、unsatisfied 和 budget exceeded。`solve` 默认不启动 Runtime。

Browser V3 通过 `getDiagnostics()` 只读暴露递归冻结的 Required Runtime Assertion
证据；不暴露 Candidate、搜索、修复或重新布局 Handle。更丰富的 Inspector 可视化仍
属后续，Production 页面不向无权限 Session 暴露 Solver 写接口。

后续 WorldChangeSet 对 Placement 的修改必须使用 ID 定位：添加/删除/替换 Constraint、
切换 Placement Union 或修改显式数值。增量求解必须证明与完整重新求解的规范结果相同；
在证明前，增量实现只可作为缓存优化，不形成第二套语义。

## 11. Validation Gate

Layout 成功至少通过：

1. 所有 Required Constraint 满足；
2. Entity Bounds 在世界边界内；
3. 必需支撑存在且间隙/接触比例达标；
4. 静态 Collider 不发生超阈值穿插；
5. Spawn 和主 Route 按声明 Locomotion Profile 可达；
6. Route 坡度和净空达标；
7. 必需 Camera Anchor 的可见比例、投影面积和屏幕区域达标；
8. 同输入重跑得到同一 Transform 与 Report Hash。

统一 Gate/Metric 结构由 [World Validation Report 与质量门禁设计](./2026-08-19-world-validation-report-and-quality-gates-design.md) 定义，LayoutSolveReport 只保存求解证据，不替代生产验收。

## 12. 安全与资源预算

- 限制 Constraint、候选、Region 顶点、搜索节点和 Diagnostic 数量。
- 禁止 Constraint 引用任意代码、动态模块、网络 URL 或引擎对象路径。
- Bounds、Raster、Route Graph 和 Solver Plugin 都来自内容寻址资源或受信 Registry。
- 不可信 Package Solver Plugin 不能在主进程执行；算法级扩展必须通过 Conformance、资源预算和签名门禁。
- 超出预算返回稳定状态，不回退成随机摆放或跳过碰撞。

## 13. 已交付的 S1 实施切片

选择一个参考图驱动的室外海湾 Fixture，限制范围如下：

- 一个 Heightfield 与 Water Region；
- 一个 Player Spawn、一个 Camera、三个 Landmark、一个 Route；
- `inside-region`、`outside-region`、`distance-range`、`faces-entity`、`supported-by`、`minimum-clearance`、`within-slope-limit`、`visible-in-camera-region`；
- 固定 Seed 与 Solver Profile；
- 输出 Authoring、LayoutSolveReport、NormalizedWorldIR 和 Browser Conformance Evidence。
  该 Evidence 只证明 S1 Runtime 复验结果并由 LayoutSolveReport 引用，不提前冻结 P0.3
  的通用 ValidationReport Schema。

验收已通过：Agent 不为三个 Landmark 和 Spawn 手写最终坐标；同一输入连续运行和并发
扰动的 Report/IR/Plan Hash 一致；必需接地、净空、路线坡度和开场构图 Gate 全部通过；
故意制造冲突时返回可定位的 Constraint IDs，不生成 WorldPackage。Fixture 还证明删除
Solver Report、修改 Seed/Profile/Bounds、篡改 Report Hash、耗尽预算或令 Required
不可满足时，旧结果不会被缓存、复用或覆盖到目标目录。

## 14. 实施状态

1. [x] 冻结并实现 Placement Union、八种 Constraint Union、Report Schema 与 Profile Manifest。
2. [x] 一次性迁移所有受跟踪 Authoring Fixture，删除旧 Schema 与双重字段真相。
3. [x] 实现字段级 Schema/语义校验、Normalized Constraint 和结构化 Diagnostic。
4. [x] 实现确定性候选生成、八种 Constraint Evaluator、Required Search 与 Preferred 排序。
5. [x] 实现稳定 Conflict Core、Report Canonicalization 与内容 Hash。
6. [x] 接入 Heightfield/Bounds/Route/Camera Query Port 和 Runtime Assertion 复验。
7. [x] 输出 Report、Diagnostic 与 CLI Explain；WorldChangeSet 延后，不宣称已实现。
8. [x] 接入 Browser/Havok 海湾 Golden Fixture；通用 P0.3 ValidationReport 延后。

实施与证据详见
[Placement Solver S1 Implementation Plan](../plans/2026-08-20-placement-layout-solver-s1.md)。
当前 Report Hash 为
`sha256:b89559755fea6cf71beba7cf4a308cef35bcd99c19749b85d818a378124c1ebd`，
IR Hash 为 `sha256:869fbf4e48fc6200d8512a643914d091358e3f8e254e705dffd315233e7c7190`，
Plan Hash 为 `sha256:e55aa781caa92af917b5224a3846e0ddd5e672b1ab9f3613fcb62645b3b98b6d`。

Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask、Route Graph
与真实主体可通行性 Gate、更多 Constraint 与 P0.1 整体仍未完成。M5 范围与完成标准见
[Route Graph 与主体可通行性专项设计](./2026-08-21-route-graph-and-traversability-design.md)。

## 15. 已冻结的实施决策

- Placement 与 Gameplay Relationship 分离；
- AI 表达约束，SDK 求最终 Transform；
- Required 失败阻断，Preferred 可解释降级；
- Solver/Profile/Report 是确定性、版本化协议；
- Runtime 不重新布局。
- 协议版本为 Authoring V3、NormalizedWorldIR V3、ExecutionPlan V4；仓库内一次性迁移，
  不保留旧字段别名。
- S1 Constraint Kind 精确为第 4.3 节八种；`relative-direction`、
  `connected-by-route` 延后且不进入 S1 枚举。
- Camera Visibility 使用量化 Bounds/Heightfield/静态遮挡近似，Browser Runtime 负责
  阻断式复验。
- Solver 使用仓库内窄域离散 CSP/Search，稳定顺序和量化规则属于协议。
- Region/Route/Screen Region 使用第 4.4 节解析输入；未来 Mask/Graph 资源必须复用同一 ID。

## 16. 参考依据

- [Holodeck](https://arxiv.org/html/2312.09067)：LLM 生成空间关系、约束求解器负责布局。
- [Infinigen](https://github.com/princeton-vl/infinigen)：程序化内容工厂与约束化布局分离。
- [PAT3D](https://arxiv.org/abs/2505.19714)：物理可行性与布局优化应进入生成闭环。
- [SceneSmith](https://arxiv.org/abs/2504.05834)：生成、模拟和验证的循环。
- [OpenUSD Introduction](https://openusd.org/release/intro.html)：组合、引用和覆盖应是明确协议，而非隐式对象父子关系。
