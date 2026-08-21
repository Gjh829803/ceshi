# Route Graph 与主体可通行性设计

## 1. 文档状态

- 状态：**Reviewed / Field Freeze Pending（2026-08-21）**。架构边界与 M5 完成标准已
  通过静态规格审查；新增公共字段仍须在实施计划开始前完成字段级评审和版本冻结。审查
  记录见 [Route Graph 与主体可通行性设计审查](../../reviews/2026-08-21-route-graph-traversability-design-review.md)。
- 所属里程碑：P0.1 / M5。
- 当前问题：Canonical 世界可以通过 Schema、编译、渲染和局部碰撞检查，却仍可能出现
  出生点与目标之间没有人物可走通的连续路线。
- 第一生产切片：普通人形、室外 Heightfield、具有显式 Traversal Surface 的静态平台、
  静态阻挡物。
- 上位规格：
  - [AI-first LEGO 游戏 SDK 总体设计](./2026-08-17-ai-first-lego-game-sdk-design.md)
  - [Placement Constraint 与确定性 Layout Solver](./2026-08-19-placement-constraint-layout-solver-design.md)
  - [World Validation Report 与质量门禁](./2026-08-19-world-validation-report-and-quality-gates-design.md)
- 依赖规格：
  - [Hybrid Terrain 与非 Heightfield 特殊地形](./2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)
  - [Package Subject Definition](./2026-08-19-package-subject-definition-design.md)

本文解决的是“指定主体是否能从声明的起点实际到达声明的终点”。它不把 NPC 行为、
动态避障、任务系统或自动驾驶混入当前范围，也不建立与既有 `spatial.routes`、Surface、
Collider 或 Validation Report 竞争的第二套协议。

## 2. 问题与验收口径

当前 SDK 已经具备人物胶囊碰撞、最大坡度、最大跨阶、地面支撑和固定 Tick 控制。但这些
能力只保证单次物理运动遵守规则，不自动证明整个场景连通。以下世界仍可能成功编译：

- 台阶立面高于人物 `maxStepHeightMeters`；
- 平台视觉上相接，Collider 之间却有缝隙；
- 踏面或通道宽度小于人物胶囊所需净空；
- 平台顶部存在，但顶部空间不足以容纳主体；
- 起点和终点各自可站立，中间没有连续可行走连接；
- 同一 XZ 有地面和桥面，二维路线选择了错误高度层；
- Route 只满足 Heightfield 坡度检查，却被静态物体阻断；
- 抽象图判断可达，但真实 Babylon/Havok Character Controller 仍会卡住。

因此完成标准不是“生成了一张 NavMesh”或“路径查询返回非空”，而是：

> 对每条 Required Route，SDK 必须使用指定主体的锁定 Collider、Locomotion 与 Capability
> Profile，在权威 Collider/Surface 上生成确定性 Traversal Graph，并由真实固定 Tick
> Character Controller 完成路线。任一阶段失败都形成 Blocking Validation Gate 和可修复
> Diagnostic，不允许把不可通行场景作为合格世界交付。

## 3. 决策摘要

1. AI 继续表达 Route 意图、起点、终点和通行主体；AI 不手写 NavMesh Polygon、图节点或
   Babylon/Havok 参数。
2. `spatial.routes` 是 Authoring 的路线走廊真相；`TraversalGraph` 是 SDK 根据锁定世界、
   Surface 和主体 Profile 生成的派生制品，两者不是同义公共字段。
3. 候选通行表面只来自 Heightfield 或显式 `Traversal Surface`。Surface 不是全局
   `walkable: true`；它只把通行语义绑定到 Collider Subshape，最终能否通过由主体
   Profile 和 Query 共同决定。视觉 Mesh、材质、颜色和名称不能自动产生通行语义。
4. 图构建使用真实 Collider/Subshape 与共享 Terrain Triangle Surface Query，不复制一份
   简化作者几何作为第二真相。
5. Traversal Graph 必须是分层 3D 图。同一 XZ 上的地面、桥面和平台拥有不同节点，不能
   被一个二维高度值覆盖。
6. 每次 Query 都绑定一个锁定的主体通行 Profile。人、马、汽车和飞行主体不能共享一个
   含糊的 `walkable` 结果。
7. 静态图搜索是必要证据但不是充分证据；生产通过还需要真实 Character Controller 的
   固定 Tick 路线执行结果。
8. 当前切片只允许连续地面、坡面和自动跨阶连接。跳跃、攀爬、飞行、传送等离开支撑面
   的连接以后通过显式 Typed Traversal Link 扩展，不在 R1/R1b 中自动猜测。
9. Required 路线失败一票否决；总体构图分数、截图相似度或 Advisory 指标不能抵消。
10. Recast/Detour 或其他 Provider 可以作为内部 Graph Builder，但 AI-facing Schema、
    Canonical Artifact、Diagnostic 和 Hash 不携带 Provider 方言。

## 4. 权威职责

| 事实 | 唯一权威 | 禁止的旁路 |
| --- | --- | --- |
| 路线意图与走廊 | Canonical `spatial.routes` | 从道路颜色或 Mesh 名推断 Route |
| 最终 Entity Transform | Placement Solver | Navigation 在 Runtime 重新摆放实体 |
| 可支撑几何 | Heightfield / Collider Subshape | 独立复制的 NavMesh 顶点反向充当 Collider |
| 候选通行语义 | Traversal Surface Profile | 任意朝上的三角形默认可走 |
| 主体尺寸和运动限制 | resolved Subject/Physics/Locomotion/Capability Lock | Graph Builder 自带另一套半径、步高或坡度默认值 |
| 抽象连通性 | Traversal Graph + Query Result | Agent 根据截图主观声明“应该能走” |
| 实际支撑与移动结果 | Havok Character Controller / Ground Support Resolver | Terrain Height 或 Route Graph 独立写 `isGrounded` |
| 生产通过决策 | Validation Report | 单独脚本日志或总体分数覆盖 Blocking Failure |

Navigation 是派生查询层，不是 Gameplay 物理权威。Graph 可以预测一条路线是否可行，
但真实 Tick 中的接触、离地、落地和最终位置仍只由 Runtime 物理拥有。

## 5. AI-facing Authoring 形状

### 5.1 复用现有 Route

R1 不新增第二个 `paths`、`navigationRoutes` 或 `walkways` 集合。继续使用现有
`spatial.routes`：

```json
{
  "id": "spawn-to-watchtower",
  "kind": "polyline-xz",
  "pointsMetersXZ": [[-12, 18], [-4, 10], [3, 2], [8, -6]],
  "widthMeters": 2.4,
  "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
}
```

Polyline 是意图走廊和求解边界，不是可通行结论。`pointsMetersXZ` 不承担多层高度真相；
Graph Builder 从起点 Anchor、终点 Anchor、Surface 连通性和真实世界 Y 选择正确高度层。
Route 的 `locomotionProfileRef` 声明该走廊面向的运动类型；`connected-by-route` 仍必须从
`traversingEntityId` 解析完整 Subject/Physics/Collider/Capability Lock。Registry
Compatibility 需要证明二者兼容，不能按 Ref 字符串猜测；不兼容时以
`ROUTE_LOCOMOTION_PROFILE_MISMATCH` 拒绝。

### 5.2 `connected-by-route` 候选合同

字段级评审应在下一版 Authoring 中只增加一种角色化约束，不向已发布 V3 枚举偷偷加值：

```json
{
  "id": "player-can-reach-watchtower",
  "kind": "connected-by-route",
  "requirement": "required",
  "traversingEntityId": "player",
  "startAnchorEntityId": "spawn-main",
  "destinationAnchorEntityId": "watchtower-entry",
  "routeId": "spawn-to-watchtower"
}
```

语义固定为：使用 `traversingEntityId` 所绑定并锁定的 Physics Body、Collider、Locomotion
和 Capability Profile，证明两个 Anchor 在指定 Route 走廊中连通。字段不用通用
`subjectId/targetId/params`，也不接受自由文本能力说明。

R1/R1b 的起点和终点必须是显式 Anchor Entity，避免从对象 Bounds 中心猜入口。未来
Region/Portal 路线可以增加新的关闭 Endpoint Union，但不得把同一字段在 Entity、Region、
世界坐标和自由文本之间隐式切换。

### 5.3 Agent 默认操作

上游 Agent 的最小责任是：

1. 创建或选择通行主体；
2. 声明起点 Anchor、终点 Anchor 和 Route 走廊；
3. 对必须可达的路线添加 Required `connected-by-route`；
4. 读取结构化 Diagnostic，调整地形、台阶、坡道、平台或走廊后重新构建。

Agent 不需要计算胶囊侵蚀、坡面采样、台阶邻接或 A* 代价，也不直接选择 Navigation
Provider。

## 6. Traversal Graph 派生协议

### 6.1 制品边界

`TraversalGraphV1` 是内容寻址的派生制品，至少绑定：

- `authoringSpecHash`、`layoutSolveReportHash` 和 `resourceLockHash`；
- Terrain/Collider/Surface Artifact Hash；
- traversing Subject Definition、Physics Body、Collider、Locomotion 和 Capability Profile Ref/Hash；
- Graph Builder Profile Ref、Resolved Version、内容 Hash、量化和 Tile 参数；
- Route ID、起终点 Anchor ID 与构建预算；
- `traversalNodesById` 和 `traversalEdgesById`。

Graph 节点至少保存稳定 `id`、`surfaceId`、`positionMetersXYZ`、所在 Tile、可用净空和
来源 Collider/Subshape 证据。Graph Edge 使用角色化 `fromTraversalNodeId` 与
`toTraversalNodeId`，并以关闭 `type` 表达 `walk`、`slope` 或 `step`。边保存米制距离、
高度差、坡度、最小净空和确定性通行成本。

Runtime Handle、Mesh 数组序号、Recast Poly Ref、Havok Shape 指针和加载顺序不能进入
Canonical ID。内部 Provider ID 只能存在于可丢弃的 Adapter Audit 中。

`traversalGraphHash` 对完整 Canonical Graph Bytes 计算，由 Compiler/Artifact Index 返回并
供 Validation Evidence 引用；Graph 正文不保存该 Hash，避免自引用。若图制品包含额外
Overlay/Debug 文件，整个目录另算 `traversalArtifactRootHash`，不得与 Graph Hash 混用。

### 6.2 分层 3D 图

Heightfield 可使用 Tile/Raster 邻接作为构建输入，但 Graph 节点保存 3D 世界位置与稳定
Surface ID。静态平台来自显式 Traversal Surface，因此同一 XZ 可以同时存在：

```text
bridge-deck surface  y = 8m
terrain-ground       y = 0m
```

两层只有在存在满足 Profile 的坡道、台阶或未来 Typed Traversal Link 时才能连接。Graph
Builder 不使用“最近 Y”把两层静默合并，也不把垂直距离小于搜索半径等同于可走。

### 6.3 主体净空与 Profile Filter

每个图构建/查询必须从锁定主体资源解析：

- Capsule Radius/Height 与 Center Offset；
- `maxSlopeDegrees`；
- `maxStepHeightMeters`；
- Surface/Medium Capability；
- Authoring 安全余量和 Graph 量化参数。

Graph Builder 使用主体半径侵蚀可走区域，使用主体高度排除低顶区域，按最大坡度排除
坡面，按最大跨阶判断相邻表面。R1b 必须使用当前人形 Profile 的 `0.3m` 跨阶上限证明：
安全余量内的台阶可走，超过上限的立面不可走。不能为了让失败 Fixture 通过而在 Graph
Builder 中另写一个更大的台阶默认值。

### 6.4 代价与确定性

R1 的路径选择成本只由 Profile 中的关闭公式组成：平面距离、坡度代价和跨阶代价。
相同输入、Lock、Profile、Seed、Tile 和预算必须产生同一节点/边顺序、Path 与 Hash。

成本仅用于在多条合格路线中稳定选择，不允许把不可通行边变成“高成本可通行”。浮点
输入先按 Profile 量化；同成本路径按稳定 Node/Edge ID 排序。超出节点、边、Tile、搜索
步数或墙钟预算时返回 `incomplete`，不能随机选择或假装不连通。

## 7. 从几何到 Graph 的工程链路

```text
Canonical Route + Anchor + traversing Subject
  → resolve Layout / Resource / Subject Profile Lock
  → query Heightfield and explicit Traversal Surfaces
  → collect static blocking Colliders
  → tile and quantize source evidence
  → filter slope / step / radius / height / gap
  → build layered Traversal Graph
  → deterministic path query
  → fixed-tick Runtime traversal probe
  → Validation Metric / Evidence / Diagnostic
```

输入规则：

- Heightfield 使用当前共享 Triangle Surface Sampler，保持渲染、碰撞、坡度和 Query 对角线一致；
- Static Platform 必须具有 H1 冻结的 Traversal Surface → Collider Subshape 绑定；
- 经过验证的 Registry Prototype/Kit 必须确定性展开 Visual、Collider 和 Traversal Surface；
  普通 Agent 不逐个平台重复手写 Surface；
- Static Blocking Object 使用权威 Collider，不用视觉 Bounds 替代精确净空；
- Water、blocked Surface 和未支持 Medium 按 Traversal Profile 排除；
- Dynamic Platform、门、载具和会移动的阻挡物不进入 R1/R1b 静态 Graph 承诺。

实现可以评估 Recast/Detour，但 Provider 只能消费上述标准输入并输出 Canonical Graph
Adapter 结果。是否引入依赖由技术探针依据确定性、WASM/Bundle 成本、分层 Tile、序列化、
浏览器兼容和许可证决定；设计不预先把 Provider 固定为公共合同。

## 8. 真实控制器通行 Gate

抽象路径通过后，Validation Runner 使用同一 Runtime Backend 和锁定主体：

1. 解析并锁定 `TraversalDriverProfile`；它声明 Path Corridor 跟随、转向、到达容差、
   卡住窗口和最大 Tick，Profile Ref/Version/Hash 进入 Evidence；
2. Reset 到 `startAnchorEntityId` 对应的合法 Spawn；
3. 绑定唯一 Controller；
4. 将确定性 Path Corridor 投影为固定 Tick 控制输入，不瞬移主体；
5. 每 Tick 记录 Subject Position、Support Surface ID、Movement Medium、Collision/Action 和 Progress；
6. 到达终点容差内后记录完成 Tick；
7. 出现卡住、离开 Route、穿插、悬空、跌落、错误 Surface 或超时即失败；
8. Reset 后验证 Controller、Listener、Physics Body 和资源数量回到基线。

Runner 不根据渲染帧推进模拟，不修改 `maxStepHeightMeters`，不临时关闭 Collider，也不在
失败位置把主体传送到下一节点。30/60/120 Hz-like 渲染节奏必须得到相同 Fixed-Tick 结果。

## 9. Validation Profile、Gate 与 Metric

统一 Validation Report 新增两个 Blocking Gate，不创建 Route 专用报告格式。

### 9.1 `route-connectivity`

确定性 Graph/Query 指标：

- `requiredRouteCount`；
- `unreachableRequiredRouteCount`；
- `maximumObservedStepHeightMeters`；
- `maximumObservedSlopeDegrees`；
- `minimumObservedClearanceWidthMeters`；
- `minimumObservedClearanceHeightMeters`；
- `maximumObservedSurfaceGapMeters`；
- `routePathDistanceMeters`；
- `routeTraversalCostSeconds`；
- `traversalGraphNodeCount`、`traversalGraphEdgeCount` 和 `traversalGraphHash`。

### 9.2 `route-runtime-conformance`

真实固定 Tick 指标：

- `completedRequiredRouteCount`；
- `failedRequiredRouteCount`；
- `maximumStalledDurationTicks`；
- `maximumRouteDeviationMeters`；
- `unexpectedAirborneDurationTicks`；
- `unexpectedSupportLossCount`；
- `wrongSupportSurfaceCount`；
- `invalidPhysicsValueCount`；
- `completionDurationTicks`。

Graph 通过而 Runtime 失败时，以 Runtime Gate 失败为最终结论，同时保留 Graph 证据用于
定位 Collider/Controller 差异。Graph 构建缺少 Required Surface/Profile/Evidence 时报告
`incomplete`；明确超阈值或不可达时报告 `failed`。

### 9.3 稳定 Diagnostic

第一批诊断至少包括：

- `ROUTE_START_SURFACE_NOT_FOUND`；
- `ROUTE_DESTINATION_SURFACE_NOT_FOUND`；
- `ROUTE_REQUIRED_PATH_UNREACHABLE`；
- `ROUTE_STEP_HEIGHT_EXCEEDED`；
- `ROUTE_SLOPE_EXCEEDED`；
- `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT`；
- `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT`；
- `ROUTE_SURFACE_GAP_EXCEEDED`；
- `ROUTE_SURFACE_PROFILE_MISSING`；
- `ROUTE_LOCOMOTION_PROFILE_MISMATCH`；
- `ROUTE_RUNTIME_STALLED`；
- `ROUTE_RUNTIME_DEVIATED`；
- `ROUTE_RUNTIME_SUPPORT_LOST`；
- `ROUTE_GRAPH_BUDGET_EXCEEDED`。

Diagnostic 必须包含 Route、Traversing Entity、起终点 Anchor、Surface/Collider、世界坐标、
阈值、实测值、单位、Evidence Ref 和结构化修复方向。例如台阶失败建议降低台阶高度、
增加中间踏步或改成满足坡度/净空的坡道，而不是笼统返回“走不过去”。

## 10. M5 分阶段交付

### R0：协议冻结

- 复用 Route/Surface/Validation 术语并冻结边界；
- 完成 `connected-by-route`、Traversal Graph、Profile Lock、Report Evidence 和 Diagnostic 字段评审；
- 确认 V3 到下一 Canonical 版本的干净升级策略，不添加未实现枚举值。

### R1：Heightfield Route

- 一个普通人形从 Spawn 沿 Heightfield Route 到达目标 Anchor；
- 覆盖坡度、阻挡物、胶囊宽度、顶部净空、缝隙、确定性和预算失败；
- Graph Query 与真实 Character Controller Gate 都通过。

### R1b：Static Platform Route

- 与 Hybrid Terrain H1 共享最小 Traversal Surface → Collider Subshape 合同；
- 覆盖地形→台阶→平台和平台→坡道→地形；
- `0.25m` 台阶通过、`0.35m` 台阶在当前 `0.3m` Profile 下失败；
- 覆盖平台接缝、窄踏面、低顶、错误 Collider、错误 Surface 身份和边缘跌落；
- 真实人物可以完整走通成功 Fixture，失败 Fixture 被 Blocking Gate 拒绝。

**M5 只有 R0、R1 和 R1b 全部完成才算完成。** 只交付二维 Route Graph、只跑 A*、只看
截图或只验证 Heightfield 坡度，均不能关闭本次“有台阶但人物走不过去”的问题类别。
Graph 协议从 R0 起必须允许同一 XZ 的多个 Surface Node；完整桥面/桥下地面双层 Runtime
Fixture 仍属于 P2.6 H1/M10，不由普通静态平台 Fixture 冒充完成。

### 后续独立切片

- Jump/Drop Link；
- Climb/Vault Link；
- Door/Elevator/Dynamic Platform；
- Mount、Vehicle、Flight Query Profile；
- NPC Path Following、Crowd Avoidance 和动态 Replan；
- Cave/Interior Portal 和 Streaming Graph。

这些能力使用显式 Typed Traversal Link 和独立 Capability/Profile，不通过增大默认步高、
瞬移或自动推断补进 R1。

## 11. 对抗性测试矩阵

| Fixture | 期望 |
| --- | --- |
| 连续平地与缓坡 | Graph 和 Runtime 都通过 |
| Route 被静态墙截断 | `ROUTE_REQUIRED_PATH_UNREACHABLE` |
| `0.25m` 连续台阶 | 当前人形 Profile 通过 |
| `0.35m` 垂直台阶 | `ROUTE_STEP_HEIGHT_EXCEEDED` |
| 视觉相接、Collider 留缝 | `ROUTE_SURFACE_GAP_EXCEEDED` |
| 踏面比胶囊安全宽度更窄 | `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT` |
| 平台上方有低顶 | `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT` |
| 同 XZ 的桥面和桥下地面 | Graph 合同可表达两层 Node；完整 Runtime Gate 由 P2.6 H1/M10 验收 |
| 未声明 Traversal Surface 的装饰 Mesh | 不进入 Graph |
| Graph 通过、Controller 在 Collider 接缝卡住 | Runtime Conformance 失败 |
| 两个不同 Collider/Locomotion Profile | 得到独立锁和可比较的不同结果 |
| 30/60/120 Hz-like Render 节奏 | Fixed-Tick 路线结果一致 |
| 连续与并发重复构建 | Graph、Path、Report Hash 一致 |
| 构建预算耗尽或 Evidence 缺失 | `incomplete`，禁止生产通过 |

成功 Fixture 和每个失败 Fixture 都必须来自 Canonical Authoring，经 Normalizer、Compiler、
真实 Babylon/Havok Runtime 和统一 Validation Report 完成纵向验证。

## 12. CLI、Browser 与 Agent 修复闭环

候选 CLI 复用统一验证命令面：

```text
worldkit verify route <world-package> --profile <validation-profile-ref> --output <validation-report.json>
worldkit verify explain <validation-report.json> --gate-id route-connectivity
worldkit verify explain <validation-report.json> --gate-id route-runtime-conformance
```

Browser Protocol 只读暴露 Route Summary、Path Evidence、Surface/Collider Overlay 和 Runtime
Probe Receipt，不暴露任意 NavMesh Builder 执行、Babylon Scene、Havok Handle 或 Provider
内部 ID。CLI JSON、Browser Protocol、Canonical Schema 和生成类型使用同一公开字段名。

Agent 修复循环固定为：

```text
Authoring World
  → build / verify route
  → structured Diagnostic
  → proposed WorldChangeSet
  → human/host review
  → rebuild / reverify
```

Diagnostic 可以建议修改 Terrain、Route、Anchor、Static Platform 或选择兼容 Profile，但
不能自动修改冻结 Artifact，也不能让 Validation Runner 放宽阈值。

## 13. 非目标与安全边界

- R1/R1b 不承诺 NPC、动态避障、群体寻路或 Runtime `goTo` Gameplay API；
- 不承诺 Jump、Climb、Swim、Vehicle 或 Flight 路线；
- 不从外部 GLB 的视觉 Mesh 自动生成生产 Traversal Surface；
- 不允许 Agent 提供任意导航脚本、WASM、JS Evaluator 或 Babylon/Havok 参数；
- 不把 Recast/Detour Poly Ref 等 Provider ID 写入持久 Canonical Artifact；
- 不允许 Graph/Route Query 成为第二份 Ground Support 或移动状态；
- 不允许 Advisory Score 覆盖 Required Route Failure；
- 不因单个 Fixture 需要多层平台而提前宣称完整洞穴、室内或 Hybrid Terrain 已完成。

## 14. 业界依据

- [Recast Navigation](https://github.com/recastnavigation/recastnavigation)：业界常用的
  NavMesh 构建与 Detour 查询工具；其 Mesh Header 将 `walkableHeight`、`walkableRadius`
  和 `walkableClimb` 作为 Agent 构建参数，支持 Tile、Layer 与 Off-mesh Connection。
- [Detour NavMesh Query](https://github.com/recastnavigation/recastnavigation/blob/main/Detour/Include/DetourNavMeshQuery.h)：
  Query Filter 明确负责可访问 Polygon 与 Area Cost，支持受 Filter 约束的路径查询。
- [Godot NavigationMesh](https://docs.godotengine.org/en/stable/classes/class_navigationmesh.html)：
  使用 `agent_radius`、`agent_height`、`agent_max_climb` 和 `agent_max_slope` 烘焙可走区域，
  说明路径结果必须绑定具体 Agent 尺寸与运动约束。
- [Godot NavigationLink3D](https://docs.godotengine.org/en/4.4/classes/class_navigationlink3d.html)：
  用显式 Link 连接两个 Region 或表达跳跃、滑索等离开普通表面的运动，支持方向和成本。
- [Unity AI Navigation](https://docs.unity3d.com/ja/current/Manual/com.unity.ai.navigation.html)：
  NavMesh 与 Link 分责，Link 用于跳跃等特定动作；`agentClimb` 明确是允许楼梯/台阶通过
  的最大垂直步长。
- [Unreal Nav Link Proxy](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/AIModule/Navigation/ANavLinkProxy?application_version=5.5)：
  显式连接没有直接 NavMesh 路径的区域，支持把非连续通行能力与普通表面邻接分开。

这些依据共同支持本设计的核心边界：主体尺寸/能力驱动可走区域，普通 Surface 邻接与
特殊 Traversal Link 分离，静态路径查询与真实运动执行分层验证。
