# 开源设计借鉴与验证台账

- 状态：Active，持续维护
- 首次建立：2026-08-26
- 目的：记录 WorldKit 从成熟开源项目吸收了什么、为什么吸收、落在哪里、如何验证，以及哪些内容明确没有采用
- 能力完成度权威：[`18-refactor-progress-and-backlog.md`](18-refactor-progress-and-backlog.md)

本文不是依赖推荐清单，也不因为列出一个项目就代表 WorldKit 使用或支持它的全部能力。
真实状态必须归入以下六类之一：`已吸收代码`、`已吸收测试`、`现有实现一致`、
`候选验证`、`延后`、`不采用`。任何 `候选验证` 都不能被写成生产能力。

## 1. 维护规则

新增通用算法、引擎适配、几何内核、资产工具或核心 Runtime 行为前，先更新本台账并回答：

1. 上游项目、锁定 commit/tag、许可证和具体源码/测试链接是什么；
2. 借鉴的是通用机制、领域语义、测试夹具，还是仅用于反例；
3. 本地唯一 Owner 和集成点在哪里，是否会制造第二套状态权威；
4. 哪些上游语义不适合 WorldKit，必须保留哪些本地单位、坐标、确定性和预算合同；
5. 哪个复现或 Gate 证明这项引入有价值，失败时如何回退；
6. 是直接依赖、Provider Adapter、改写后的测试案例，还是仅保留为后续研究。

直接依赖必须由实际 import 它的 workspace package 声明并锁定精确版本。测试案例只吸收能
击穿本地合同的最小形状，期望值按 WorldKit 语义独立推导，并保留上游 permalink；不整包
复制测试目录。Babylon、Havok、Recast、GeoJSON 或其他 Provider 术语不得泄漏进 Canonical
Authoring Schema。

## 2. 当前总表

| 项目与锁定来源 | 许可证 | 当前裁决 | 借鉴内容 | WorldKit 落点或边界 |
|---|---|---|---|---|
| [Flatbush `4.6.2`](https://github.com/mourner/flatbush/tree/bb12071743bfeaf1b11d232b0a07b7857cabfdf8) | ISC | 已吸收代码 | 静态 packed R-tree、紧凑 typed-array 存储、inclusive AABB search | `packages/terrain-surface/src/triangle-xz-broadphase.ts`；Provider 返回顺序不可信，本地按 triangle ordinal 排序 |
| [Turf `98b9a4e`](https://github.com/Turfjs/turf/tree/98b9a4ed270148fda73dda48b7fd1f7c8b6f88e0) | MIT | 已吸收测试；不引入生产依赖 | 凹多边形、顶点/边界、历史长边 point-in-polygon 回归；GeoJSON 闭环差异 | `packages/layout-solver/src/geometry.test.ts`、`packages/terrain-surface/src/simple-polygon-xz.test.ts`；仍是米制 XZ 简单开环 |
| [robust-predicates `3.0.3` / `db6dca0`](https://github.com/mourner/robust-predicates/tree/db6dca0dd05fbccf04c66e479361e84a5416f1ca) | Unlicense | 已吸收代码；已吸收测试 | adaptive exact `orient2d` 与近共线压力族 | `packages/terrain-surface/src/orientation-xz.ts` 是唯一薄 Adapter；显式反转上游 screen-Y 符号以维持 X-right/Z-up，未替换距离 epsilon 语义 |
| [Manifold `87f5fec`](https://github.com/elalish/manifold/tree/87f5fec565e8c277917238b5e2d1c0b76f8ab942) | Apache-2.0 | 延后 | 保证 manifold 输出的 build-time Boolean、extrude、revolve、simplify | 仅可作为未来 Geometry Recipe Provider；WASM 对象显式释放，禁止 Runtime CSG |
| [Clipper2](https://github.com/AngusJohnson/Clipper2) / [polyclip-ts `bef480b`](https://github.com/luizbarboza/polyclip-ts/tree/bef480bf8b035777d64a4ea857df109b5931aa61) | BSL-1.0 / MIT | 候选验证 | polygon boolean、offset、整数缩放或高精度 overlay | 等 Terrain Mask / Opening 出现真实合同后 bake-off；Earcut 继续只负责 triangulation |
| [glTF-Transform `4.4.2`](https://github.com/donmccurdy/glTF-Transform/tree/0677324a34cea46c3ef01866ef004b69d0347453) + [Khronos glTF Validator `2.0.0-dev.3.10`](https://github.com/KhronosGroup/glTF-Validator) | Apache-2.0 | 已吸收代码；已吸收测试 | NodeIO、prune、unpartition、确定性 GLB 处理；官方 glTF 2.0 结构/Accessor 校验边界 | `scripts/lib/glb-admission.ts` 是 Node-only Gate；原始/生成资产 promotion 前接线，xier120 19/19 语料通过；Babylon Runtime admission 不变 |
| [Recast Navigation](https://github.com/recastnavigation/recastnavigation/tree/9f4ce64458dfae86e1239c525ddc219c4e9e06f1) / `recast-navigation@0.43.1` | Zlib | 现有实现一致 | NavMesh 构建/查询、Tile/Polygon/Portal/Detail Mesh 语义 | `packages/traversal-recast` Provider；WorldKit `hard-ribbon`、Surface 身份、预算与 Evidence 仍是上层权威 |
| [Babylon.js `9.21.2`](https://github.com/BabylonJS/Babylon.js/tree/72a4c7a28caa4f18ae1f93513d1743e3f9060159) + Havok `1.3.14` | Apache-2.0 / vendor package | 现有实现一致 | 3D 数学、渲染、物理 Character、资源生命周期 | `packages/runtime-babylon`；`checkSupport()` 是唯一 Ground support Owner，不复制 Provider 状态 |
| [Godot `b56a918`](https://github.com/godotengine/godot/tree/b56a91878e7c94977e4af978968e41d0670c0a8b) | MIT | 已吸收测试 | Character step/snap 条件、SpringArm 多方向覆盖、reparent/global transform 生命周期 | 转化为真实 Babylon/Havok Traversal、Mounted、Camera adversarial fixtures；未引入 Godot 依赖 |
| [Rapier.js `9f638c5`](https://github.com/dimforge/rapier.js/tree/9f638c5384c282a8abd22515973ac7c82ccfbc43) | Apache-2.0 | 已吸收测试；已吸收代码 | autostep 前置接地压力条件 | 不替换 Havok；`checkSupport()` 的既有结果现在显式约束 provider-local step-up；snap/slope/moving platform 仍为候选或延后 |
| [Bevy `0de2663`](https://github.com/bevyengine/bevy/tree/0de26631b0603acdc945aeae5e05b07ce58bc4dc) | MIT OR Apache-2.0 | 现有实现一致；已吸收测试 | Relationship 单一 source-of-truth、派生投影、层级生命周期 | 旋转非对称 Mount 回归证明 `GameplayRelationshipStateV1` 仍是 Canonical 真相；Renderer parent 未替代 `mountedOn` |
| [camera-controls `c516011`](https://github.com/yomotsu/camera-controls/tree/c51601107e266097edf6a9caa57bfa9eaa77427c) | MIT | 已吸收测试；已吸收代码 | 近裁剪面角向碰撞覆盖思路 | 不引入 Three.js；Babylon Follow Arm 从五条中心/轴向 ray 补成九条含对角 ray，原有过滤、telemetry 与恢复语义不变 |

## 3. 本轮已经吸收的实现与测试

### 3.1 Flatbush：替换通用静态 Broadphase 机制

WorldKit 保留 `TriangleXzBroadphaseIndexV1` 这个 package-private 领域接口，但删除了
`traversal-surface-query.ts` 内自研的递归二叉树、节点包围盒和 ordinal heap。新适配器只把
triangle AABB 交给 Flatbush；查询结果再映射回 triangle ordinal 并升序排序。因此：

- Flatbush 只拥有通用 packed spatial index；
- inclusive overlap 仍与原有 WorldKit 查询合同一致；
- canonical 顺序不依赖 Hilbert packing、插入顺序或上游返回顺序；
- 空索引由 Adapter 自己处理，因为 Flatbush 构造器拒绝零条目；
- 公共 Schema、ExecutionPlan、Route Evidence 和错误码均未变化。

回归覆盖空集合、相切边界、相等 AABB、反向插入、远邻排除、全覆盖和 130,000 条目构建。
同一端到端 benchmark 的新旧实现都保持 `representative=clear`、`near-budget=budget-exceeded`
和 `disjoint-heavy=clear`。2026-08-26 的单次本机方向性数据中，Flatbush 的 disjoint-heavy
为约 106 ms，旧实现约 170 ms；两次进程的 Node minor 不同，因此这里只记录方向，不宣称
稳定倍率。进入性能承诺前必须在同一 Node、同一热身、多个样本和真实 WorldPackage Fixture
上重跑。

### 3.2 Turf：吸收边界测试，不照搬 GIS 栈

Turf 的 `booleanPointInPolygon` 把 GeoJSON Polygon/MultiPolygon、hole、bbox quick rejection 和
`ignoreBoundary` 交给 `point-in-polygon-hao`。对当前 WorldKit 有价值的是它长期积累的边界形状，
本轮已经改写为米制 XZ 测试：

- 凹口内外不能被凸包或 bbox 误判；
- 顶点、斜边和水平边按照 WorldKit inclusive 语义命中；
- Turf 历史 issue #15 的不规则长边四边形仍能正确分类；
- GeoJSON 首尾重复的闭环在 WorldKit 简单开环信任边界稳定拒绝为 `zero-length-edge`。

没有引入 Turf 生产依赖，原因不是项目质量不足，而是领域不匹配：

- 当前 Canonical polygon 是一个有限、简单、无 hole 的米制 XZ 开环；MultiPolygon/hole 是新
  Schema 能力，不能从 helper 偷渡；
- Turf `buffer` 先做地理投影再调用 JSTS，适合经纬度 GeoJSON，不适合本地白模米制内核；
- Turf `shortestPath` 是二维规则网格 A*，不能替代 Recast、3D Surface、Portal、坡度和
  `hard-ribbon` Evidence；
- union/intersection/difference 等 overlay 等到 Terrain Mask/Opening 有真实需求后，再直接比较
  Clipper2/polyclip 等底层内核；
- bbox 快速拒绝只有在 bbox 被预计算并复用时才避免 O(n) 扫描，当前最多 128 点的单次简单环
  不值得增加第二份派生状态。

### 3.3 核心 Runtime：把外部条件改写成真实引擎回归

本轮没有移植 Godot、Rapier、Bevy 或 Three.js 对象模型，而是把三个能击穿本地合同的条件放进
现有 Babylon/Havok Runtime：

- `CAM-COLL-01` 在真实 Babylon `Scene` 中放置位于 collision-radius 圆截面内、但会漏过中心与
  四条轴向 ray 的薄对角 blocker。五 ray 实现先 RED；Follow Arm 增加四条半径归一化的对角 ray
  后 GREEN。公共请求/结果、受控主体过滤、最近命中、立即收缩、限速恢复和 telemetry 均未变化。
- `MNT-XFORM-01` 使用旋转 `Math.PI / 2` 的 Mount、非对称 Socket 与 Rider offset，核对 prepare、
  commit、render root、下一固定 Tick 和 Reset。现有 `mountedPose()` 已正确把 local offset 变换到
  world，故只吸收测试，没有为“看起来统一”而改动正确生产代码；临时未旋转期望可稳定击穿测试。
- `TRAV-STEP-01` 用真实 Havok 对照地面低台阶和悬空低台阶。原实现会把初始
  `movementMedium: "air"` 的 Character 从 `2m` 抬到约 `2.2498m`；修复只把同一 Tick 已有的
  `CharacterSurfaceInfo` 传入 step-up 准入，`UNSUPPORTED` 时拒绝 `_tryStepUp()`。没有新增 support
  query、terrain height、raycast 或 AABB grounding，`checkSupport()` 仍是唯一 Ground Owner。

这些是自动化 Runtime 合同证据，不等价于 rendered screenshot 或人工手感验收，也不扩大动态
平台、车辆、双层 Surface 或 Camera shape cast 的当前生产边界。

### 3.4 robust-predicates：只接管拓扑方向，不接管米制容差

本地压力族确认了两个不同层次的问题：直接用绝对坐标做 shoelace 求和，会把平移到
`100,000,000m` 的普通 1m 正方形误判为零面积；普通 orientation 乘减也会把约 `100m`、
仍按 `1e-6m` 量化的非共线三点算成 0。前者通过相对首点的 triangle fan 消除大数抵消，
后者由 `terrain-surface` 唯一的 `orientXZV1()` Adapter 调用 adaptive-exact `orient2d`。

上游使用 screen-style downward-positive Y，Adapter 显式取反以保持 WorldKit 既有
X-right/Z-up cross-product 符号。`pointOnSegment` 的米制 epsilon、边界 inclusive 语义、
多边形错误码和 Canonical Schema 均未交给第三方。正向/逆序、精确共线、近共线、
大坐标平移与既有凹多边形矩阵均有回归。

### 3.5 GLB：先冻结官方 Validator 的可信接入边界

现有 glTF-Transform 管线与 Babylon Runtime admission 各自正确，但都不是官方 glTF 2.0
conformance Validator。先在
[`2026-08-26-glb-admission-profile-design.md`](superpowers/specs/2026-08-26-glb-admission-profile-design.md)
冻结边界，再把 Khronos Validator 接入 Node 可信资产 intake/build，原始输入与生成输出均校验；
WorldKit 继续拥有自包含、extension allowlist、产品 inventory、预算、Hash/长度和 Registry Lock，
Babylon 继续拥有实际加载 inventory、cache/instance/dispose。malformed matrix 必须同时证明
“glTF-Transform 可读但 Khronos 拒绝”和“Khronos 合法但 WorldKit Profile 拒绝”，避免新增一个
没有独立价值的形式化 Gate。当前测试已用非单位 Quaternion 证明前者，用合法 Rigged Model
套入 Static Profile 证明后者；同时覆盖 GLB envelope、Buffer/Image URI、data URI、extension allowlist
和伪造 inventory。
allowlist 只表达 WorldKit 愿意接纳的 Khronos 扩展，并不能把未知扩展变成受支持扩展；测试额外证明
一个被调用方显式 allow、但官方 Validator 不认识的可选扩展仍会 fail closed。

`scripts/lib/modular-subject-source.ts` 现在对 Source Archive、生成 Model 与独立 Clip 执行 admission，
`scripts/lib/modular-subject-runtime-bundle.ts` 对锁定输入和最终 Runtime Bundle 再执行 admission；
`verify:xier120-subjects` 把 19 个 Static GLB 的官方结构校验、精确 inventory 与原有 Babylon 双实例/
释放证据串起来。Golden/G Bot 模块化 check 保持字节确定，两个公开 Runtime Bundle 均无 Error。
G Bot 6.7 MB 夹具所在独立 Vitest 进程一次方向性观测的 maximum resident set size 约 220 MB，
因此首版串行化 Validator Promise，不开放无界 batch 并发。

## 4. 核心能力的跨项目对照

### 4.1 通过性、Character 与 Route

Recast/Detour 已经是 Route Provider，不需要再引入 Turf A* 或第二套 NavMesh。外部项目仍提供
了值得保留的 adversarial 条件：

| 来源细节 | 对 WorldKit 的判断 | 后续验证 ID |
|---|---|---|
| Rapier autostep 只有在越障前已接触地面时生效 | 已复现空中被悬空低台阶抬升，并用既有 support 结果约束 step-up | `TRAV-STEP-01` 已完成；见 `runtime.test.ts` 与 `motion-kernel-runtime.ts` |
| Rapier/Godot snap-to-ground 只在先前接地且运动含向下分量时触发 | 现有实现一致；新增真实 Havok 回归证明 0.25m 下台阶保持 Ground、0.4m 离台进入 Air、上升 Jump 不被吸回 | `TRAV-SNAP-01` 已完成；生产代码无需修改 |
| Godot 区分 requested velocity 与碰撞后的 real velocity | Camera/Animation 应消费提交后的实际状态，不从输入重算 | `TRAV-VELOCITY-01`：斜坡与贴墙后的速度/朝向一致性 |
| Godot/Rapier 均暴露贴墙近共线和 moving-platform 历史缺陷 | 适合做高风险边界夹具，但动态平台不属于当前 R1b | `TRAV-WALL-01` 当前候选；`TRAV-PLATFORM-01` 延后到动态 Surface |
| Recast off-mesh connection 受 Tile 邻接/端点解析约束 | 不能把任意远端 Portal 伪装成已支持连接 | 维持 H1/H2/H3 与 Portal admission 的现有 fail-closed 边界 |

这些测试必须继续服从 `checkSupport()` 单一 Ground Owner、固定 Tick、真实 Havok Probe 和
Route Evidence 的现有权威，不能用高度采样、ray/AABB grounding 或第二 Character Provider
制造“绿灯”。

### 4.2 `mountedOn` 与变换/生命周期

Bevy 的 Relationship 设计把 source component 作为真相，reverse target collection 只用于加速；
这与 WorldKit 以 typed `mountedOn` World State 为真相、Runtime/Renderer 投影为派生状态的方向一致。
Babylon Node parenting 或 Godot reparent 都不应替代 Gameplay Relationship。

Godot 的 reparent/global-transform 语义提醒了三个常见坑：local/global 选择必须显式、变换脏状态
可能跨阶段传播、物理插值可能把一次大 reparent 显示成跨 Tick 移动。WorldKit 当前 staged
prepare/project/commit 比直接改场景树更稳，但还应补齐：

| 验证 ID | 交付物 | depends_on | Owner / 执行模式 | 所需证据 |
|---|---|---|---|---|
| `MNT-XFORM-01` | 已完成：旋转且非对称 Mount slot；prepare/commit/next Tick 的 Rider 世界位置/朝向正确 | 当前 M8-S1 | `runtime-babylon`，main-agent-only | World projection、render root 与 controller 一致；Reset 无残留；现有生产实现无需修改 |
| `MNT-PAIR-01` | 已完成：两组 Rider/Mount 并存且互不串 slot、suspension、possession | 当前 M8-S1 | Gameplay + Runtime，sequential | prepare/abort/commit/Tick/Reset 的真实 Runtime 回归通过；现有生产实现无需修改 |
| `MNT-LIFE-01` | partial construction、throwing cleanup、Reset/foreign WorldSession 无泄漏 | `MNT-PAIR-01` | RuntimeHost + Runtime，sequential | 资源计数、Journal、World State、Capture 一致 |
| `MNT-DYNAMIC-01` | moving platform/vehicle 的继承速度与离开行为 | 动态 Surface 与车辆设计 | 未排期 | 当前明确不实现，不得用于 S1 完成声明 |

### 4.3 第三人称视角与碰撞

WorldKit 当前 `FollowArmSolverV1` 采用中心、左右、上下和四个对角方向共九条 Babylon picking ray
近似一个 collision radius，并已覆盖受控主体排除、立即缩臂、限速恢复、异常 delta 与 telemetry。
Godot SpringArm 使用 camera near-plane shape 或用户指定 shape sweep；camera-controls 使用近裁剪面
四角射线。两者共同说明“单中心 ray 不足”；此前五射线方案对薄对角障碍的缺口已经复现并关闭，
near-plane corner、墙角和起点穿入仍需分别验证。

| 验证 ID | 交付物 | depends_on | Owner / 执行模式 | 所需证据 |
|---|---|---|---|---|
| `CAM-COLL-01` | 已完成：真实 Babylon 薄对角 blocker 击穿五 ray，并由九 ray 覆盖 | 无 | Follow Arm Provider Adapter，main-agent-only | RED/GREEN、blocker entity telemetry |
| `CAM-COLL-02` | 已完成：L 型墙角、窄门、Follow Arm target 起点穿入三个真实 Babylon Fixture | `CAM-COLL-01` | Follow Arm Provider Adapter，main-agent-only | 九 ray 全部通过；临时退化为中心 ray 时墙角/窄门稳定 RED；无需 shape cast 或生产改动 |
| `CAM-SWEEP-01` | 若 `CAM-COLL-01` 证实缺陷，比较 Babylon/Havok shape cast、near-plane corners 与现状 | `CAM-COLL-01` | Architecture main-agent-only | Provider 版本源码、性能预算、过滤层、确定性与 dispose 证据 |
| `CAM-MOUNT-01` | Mount 转移 possession 后 Rider 不被裁切，Context/Modifier 选择可解释 | M8-S1 状态与 P2.4 Camera Context | CameraDirector，sequential | 修复现有 `CAM-MOUNT-1`，不得写场景特判 |

`CAM-COLL-01/02` 已证明并关闭当前已知 ray 覆盖缺口，所以当前没有足够证据引入 shape cast。
未来若连续 sweep、非点状 near-plane 或高速穿越出现新复现，shape cast 也只应替换 Follow Arm 的
碰撞查询 Provider，不得接管 Orbit、Target、Profile、Context 或固定 Tick View publication。

## 5. 几何与资产候选的推进顺序

| ID | 目标与独立交付物 | depends_on / blocks | 独占 Owner | 集成点 | 证据 | 模式 |
|---|---|---|---|---|---|---|
| `GEO-RP-01` | 已完成：普通 1m polygon 大坐标平移误判与近共线 orientation 归零均已复现 | 无 / `GEO-RP-02` | `terrain-surface` + `layout-solver` 几何测试 | simple polygon / layout predicates | RED 样本、平移/逆序、现有错误码不变 | sequential |
| `GEO-RP-02` | 已完成：引入 `robust-predicates` 薄 Adapter，保留 canonical XZ 符号与本地 epsilon | `GEO-RP-01` / 后续消费者 | `terrain-surface` | `orientXZV1` canonical predicate primitive | RED/GREEN、正反序/共线/近共线、相关 focused Gates | main-agent-only |
| `GEO-BOOL-01` | Clipper2/polyclip 在真实 Terrain Mask/Opening fixtures 上 bake-off | 对应 Schema/Compiler 设计 / Provider 选择 | Geometry build-time Provider | Compiler admission 前 | holes、self-touch、thin sliver、determinism、license、budget | sequential |
| `GEO-CSG-01` | Manifold build-time Recipe 技术探针 | Geometry Recipe 设计批准 / Recipe Provider | 独立 build-time Adapter | Registry Lock 前 | exact WASM bytes、显式 delete、manifold/triangle budgets、GLB validation | sequential |
| `ASSET-GLB-01-DESIGN` | 已完成：冻结 GLB Admission Profile 与 implementation graph | 当前资产管线 / `ASSET-GLB-01` | Asset intake design | Registry Lock 前 | malformed、extension allowlist、deterministic receipt、依赖/生命周期裁决 | main-agent-only |
| `ASSET-GLB-01` | 已完成：Node-only Khronos Validator Adapter、fixture matrix、管线接线与 corpus receipt | `ASSET-GLB-01-DESIGN` | Asset intake | 原始/生成 GLB promotion 前 | authority-split fixtures、G Bot/Golden、xier120 19/19、串行 memory observation、focused/typecheck | main-agent-only |

后续只有在真实产品需求出现后再做 `GEO-BOOL-01` / `GEO-CSG-01`。这避免为了“可能有用”
提前把重型几何内核带进 Runtime。

## 6. 给 AI 开发流程的约束

本台账对 Coding Agent 的直接价值是把“先搜成熟实现”变成可审计步骤：

- 新 helper 先查本仓库、语言/平台、Babylon API 和已锁依赖，再查本台账；
- 通用机制优先成熟库，WorldKit 的单位、状态权威、预算、错误码和确定性留在薄 Adapter；
- 外部项目的 bug/issue 可以成为测试灵感，但只有在本仓库复现后才是本项目缺陷；
- 同领域多个开源项目用于交叉验证，不把某个引擎的对象模型整体搬入 Canonical Schema；
- 每次真正采用后，把状态从 `候选验证` 更新为 `已吸收代码/测试`，补本地文件和新鲜 Gate；
- 每次拒绝也记录原因，避免后续 Agent 重复调研或误把旧候选当批准方案。

下一次更新优先补 `MNT-LIFE-01` 的 partial construction 与 throwing cleanup。Geometry Boolean/CSG、
动态平台、车辆和 Camera shape cast 继续保持真实需求或新复现
门控，不会重复当前 Recast/Havok/CameraDirector 的状态权威。

## 7. 本轮新鲜验证收据

- 根 `pnpm test` 的 Contract lane：192 个文件、2,073 个测试全部通过；Resource-heavy lane 的
  22 个文件中 21 个、416 个测试中 415 个通过，唯一失败准确暴露了 robust orientation 变更后
  过期的 Builder standalone self-check bundle。
- 用正式 `pnpm generate:agent-self-check` 重新生成后，`scripts/agent-self-check.test.ts` 2/2 与
  `pnpm check:agent-self-check` 通过。该修复只改变生成 bundle，故没有重跑不受影响的 Runtime lane。
- GLB adapter、模块化 Source/Runtime Bundle 共 3 个文件 25/25 测试通过；Golden/G Bot 的
  modularize/runtime-bundle freshness check 通过；xier120 19/19 均通过官方 admission、Babylon
  双实例隔离与完整 lease/cache disposal。
- `pnpm typecheck`、`pnpm build` 与 `git diff --check` 通过。构建保留既有大 chunk warning，
  本轮没有扩大浏览器 Runtime 依赖面。
