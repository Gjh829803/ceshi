# Route R1b Static Platform 设计

## 1. 文档状态

- 状态：**Approved for phased implementation / R1b in progress（2026-08-23）**。
- 所属里程碑：P0.1 / M5。
- 前置能力：Route R0 与 R1 Heightfield 已通过 PR #20 合入 `main`；
  `pnpm verify:route-r0-contract`、`pnpm verify:route-r1-heightfield` 和真实
  Babylon/Havok fixed-tick Probe 已进入回归。
- 上位规格：
  - [Route Graph 与主体可通行性设计](./2026-08-21-route-graph-and-traversability-design.md)
  - [Hybrid Terrain 与非 Heightfield 特殊地形](./2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)
  - [Control Feel、Physics Medium 与 State Resolver](./2026-08-21-control-feel-physics-medium-state-resolver-design.md)
- 本文只冻结 R1b 普通静态平台切片。实现计划必须在本文通过人工评审后另写。

## 2. 目标与非目标

R1b 要证明一个锁定的 Ground Subject 可以沿 Required Route 在以下静态表面之间完整移动：

```text
Heightfield terrain
  → explicit step surfaces
  → explicit static platform surface
  → explicit static ramp surface
  → Heightfield terrain
```

成功不是“Recast 返回了一条路径”，而是同一世界、同一
`resolvedTraversalLockHash`、同一 Collider/Surface 身份同时通过：

1. 确定性 Graph/Query Blocking Gate；
2. 真实 Character Controller fixed-tick Runtime Blocking Gate。

R1b 不实现：

- 同一 XZ 的完整桥面/桥下双层 Runtime Fixture；
- Terrain Opening、洞穴、室内、Portal 或 Streaming；
- Dynamic Platform、门、电梯或会移动的 Collider；
- Jump、Drop、Climb、Vault 等离开支撑面的 Traversal Link；
- NPC Path Following、Crowd、动态避障或公开 `goTo`；
- 载具、坐骑、飞行、水中运动；
- 任意 Mesh 自动推断为 walkable Surface。

这些仍分别归 Hybrid Terrain H1/H2/H3、Typed Traversal Link、NPC Runtime 或其他里程碑。

## 3. 方案选择

### 3.1 采用：统一 Route Build Input V2

R1b 将 Heightfield 专用构建输入升级为 provider-neutral `RouteBuildInputV2`。它同时携带：

- 一个 Heightfield 几何来源；
- 零到多个权威 Static Collider 几何来源；
- 一个或多个显式 Traversal Surface Binding；
- Route、Anchor、Capability Envelope、Water/Area exclusions 与完整 provenance。

Heightfield R1 是该输入的单 Surface 特例。Graph、Query、Runtime Evidence、Validation Report
继续使用已有公共概念，不增加 `platformRoutes`、`walkableMeshes` 或第二套 Report；其中
Path/Overlay/Probe 按 §7.1 clean break 为多 Surface V2，不沿用 R1 的 path-global Surface 字段。

采用统一 V2 的原因：

- 地形、台阶、坡道和平台在一条 Route 内必须共同参与一次连通性求解；
- Static Collider 既可能阻挡，也可能通过显式 Binding 提供候选支撑面；
- 单一输入可以保证 Collider bytes、Surface identity、Graph provenance 与 Runtime evidence
  不出现平行真相；
- 项目尚未发布，不需要为开发历史永久保留两个等价内部方言。

### 3.2 不采用：并行 Static Platform Pipeline

另建 `StaticPlatformRouteBuildInput`、独立 Graph Builder 和独立 Probe 会复制 hard-ribbon、
主体 Lock、Validation 阈值、Provider lifecycle 和 Report 绑定，最终需要跨两个 Graph 才能表达
terrain → platform。它违反一个概念一个公共合同的原则。

### 3.3 不采用：自动把朝上的 Collider 面标记为可走

任意 collision-enabled Object 只能默认阻挡。只有 Prototype/Kit 显式声明的 Traversal Surface
才能成为候选通行面。材质、Mesh 名、法线方向或视觉外观不得自动产生 Gameplay 语义。

## 4. 权威与所有权

| 事实 | 唯一权威 | R1b 消费者 | 禁止旁路 |
| --- | --- | --- | --- |
| Object/Platform Placement | Placement Solver final transform | Compiler、Graph、Runtime | Navigation 重新摆放平台 |
| Static collision geometry | `ExecutionStaticColliderV1` + shared triangle emitter | Graph source、Babylon `PhysicsShapeMesh`、surface correlation | Visual bounds、第二份 walkable mesh |
| 候选通行语义 | Prototype/Kit 的显式 Traversal Surface Binding | Compiler、Graph、Runtime classifier | 自动平面检测、Mesh 名 |
| 主体半径/高度/坡度/步高 | `resolvedTraversalLockHash` | Capability Envelope、Graph filter、Runtime admission | Surface Profile 或 Adapter 覆写 |
| Graph 节点 Surface 身份 | Canonical source correlation | Graph、Path、Overlay、Validation | Provider polygon/tile ref |
| 实际 Ground/Support | 每 Subject 每 fixed tick 一次 `checkSupport()` | Resolver、retained sample、Runtime evidence | Graph、高度采样、ray/AABB 写 Ground |
| Runtime Surface 身份 | retained support sample + locked canonical collider correlation | Probe、Validation | 第二次 `checkSupport()`、post-integration pose |
| 通过/失败 | 两条 Blocking Gate | WorldPackage Validation | 总分、截图或 Graph 单独覆盖 Runtime |

Traversal Surface 只回答“这个 Collider Subshape 是否是候选 Ground Surface”；它不拥有
`isGrounded`、Movement Medium、进入/离开 Tick 或 Support Loss。

## 5. AI-facing 与资源表达

### 5.1 Agent 默认只选择 Prototype

场景节点继续使用现有 Object 形状：

```json
{
  "id": "platform-main",
  "kind": "object",
  "prototypeRef": "package://prototype/whitebox-platform@1",
  "transform": {
    "positionMetersXYZ": [4, 0.25, -2]
  }
}
```

Agent 不在 Object 实例上重复描述 top-face vertices、NavMesh 参数或 Collider bytes。候选
Surface 由 Package Prototype 或未来 Registry Kit 的资源定义携带：

```json
{
  "id": "whitebox-platform",
  "version": 1,
  "kind": "primitive",
  "primitive": "box",
  "sizeMetersXYZ": [4, 0.5, 4],
  "collisionEnabled": true,
  "traversalSurfaceBindings": [
    {
      "id": "deck",
      "kind": "collider-subshape",
      "logicalSubshapeId": "primary",
      "traversalSurfaceProfileRef": "worldkit://traversal-surface-profile/ground.static@1"
    }
  ]
}
```

`traversalSurfaceBindings` 是 Prototype 资源字段，不是自由的 Runtime toggle：

- `id` 是 Prototype 内稳定的逻辑 Surface ID；
- `kind` 固定为 `collider-subshape`；
- `logicalSubshapeId` 必须解析到同一 Prototype 展开的 Collider Subshape；
- `traversalSurfaceProfileRef` 必须精确解析到已锁版本；
- `collisionEnabled: false` 的 Prototype 禁止声明 Binding；
- 一个 `(prototypeRef, binding.id)` 不得重复；
- 一个 Collider Subshape 在 R1b 只能绑定一个 Ground Surface Profile。

当前 Primitive Prototype 只有逻辑 Subshape `primary`。未来 Kit 可以展开 `deck`、`ramp`、
`wall` 等多个 Subshape，但继续使用相同 Binding 合同。

Compiler 必须按 Object 实例展开 Binding。两个实例即使引用同一个 Prototype，也会得到两个
不同的 `surfaceEntityId` 与 `colliderSubshapeId`；Prototype 中的 `binding.id` 和
`logicalSubshapeId` 保持资源局部稳定，不携带实例 ID。

### 5.2 Traversal Surface Profile

R1b 冻结一个内置 Profile：

```ts
interface TraversalSurfaceProfileV1 {
  readonly kind: "traversal-surface-profile";
  readonly schemaVersion: 1;
  readonly traversalMode: "ground";
  readonly faceSelectionMode: "subject-slope-compatible";
}
```

Profile 不包含主体半径、高度、`maxSlopeDegrees`、`maxStepHeightMeters`、速度、摩擦、
Validation 阈值或 Provider 参数。`subject-slope-compatible` 表示候选 Collider 三角仍须使用
当前 Subject Lock 的坡度限制；它不是全局 `walkable: true`。

内置资源身份由 `resourceRef`、`resolvedVersion`、`contentHash` 锁定，并进入 Authoring/
Execution Resource Lock。普通 Agent 只引用 Ref，不手写 Profile 正文。

`EXECUTION_RESOURCE_KINDS_V1` 与对应 Authoring/Execution closed-field validator 必须增加
`traversal-surface-profile`。项目尚未发布，本次使用明确的 clean break 同步更新 Schema、
fixture、生成类型与 conformance，不保留未知 kind 旁路或 alias。

## 6. Canonical 编译形状

### 6.1 Execution Traversal Surface Union

`ExecutionPlanV5.traversal.surfaces` 保持一个集合，扩展已有关闭 union：

```ts
interface ExecutionStaticColliderTraversalSurfaceV1
  extends TraversalSurfaceIdentityV1 {
  readonly kind: "static-collider";
  readonly logicalSurfaceId: string;
  readonly logicalSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly traversalSurfaceProfileRef: string;
  readonly traversalSurfaceProfileResolvedVersion: string;
  readonly traversalSurfaceProfileHash: `sha256:${string}`;
}

type ExecutionTraversalSurfaceV1 =
  | ExecutionHeightfieldTraversalSurfaceV1
  | ExecutionStaticColliderTraversalSurfaceV1;
```

Surface 必须引用 `ExecutionPlanV5.staticColliders` 中恰好一行，并满足：

```text
surface.surfaceEntityId === collider.entityId
surface.logicalSubshapeId === collider.logicalSubshapeId
deriveColliderSubshapeIdV1(collider.entityId, collider.logicalSubshapeId)
  === collider.colliderSubshapeId
  === surface.colliderSubshapeId
surface.colliderHash === collider.colliderHash
```

Collider 行继续只使用已冻结的 `entityId` 与 `logicalSubshapeId`，不得为了 Surface Join 新增
同义的 `surfaceEntityId` 或 `logicalColliderSubshapeId`。零匹配或多匹配都使 Compiler/Plan
admission 失败；禁止匹配失败后编译第二份 walkable geometry。

### 6.2 稳定身份

R1b 采用以下职责分离：

- `logicalSurfaceId`：资源局部稳定名称，例如 `deck`；
- `colliderSubshapeId`：`deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)`；
- Heightfield `traversalSurfaceId`：保持 R1 已发布字节，由
  `{ surfaceEntityId, logicalSubshapeId: "heightfield" }` 计算 SHA-256；
- Static Collider `traversalSurfaceId`：由
  `{ kind: "static-collider", surfaceEntityId, logicalSurfaceId }` 计算 SHA-256；
- 两类 ID 都加 `traversal-surface:` 前缀；按 `kind` 分式是显式版本化规则，不把不同的
  Canonical 字段名伪装成同一公式；
- Static Surface `resourceRef`：由 Compiler 生成实例级 Package Resource Ref
  `package://traversal-surface/<entity-id>.<logical-surface-id>@<prototype-version>`；
- Static Surface `resolvedVersion`：精确等于来源 Prototype 的 `version`；
- Static Surface `resourceHash`：覆盖 Prototype identity、Binding 闭集字段、解析后的 Surface
  Profile Ref/Version/Hash 与 `colliderHash`，不包含数组序号或 Provider 数据；
- Heightfield 的 `resourceRef/resolvedVersion/resourceHash` 保持 R1 已冻结语义；
- `colliderHash`：只负责实际碰撞几何/Transform 漂移。

逻辑 ID 不包含数组序号、Triangle Index、Provider Ref、Runtime Handle 或 Mesh 名。版本升级
保持同一逻辑 Surface ID，Ref/Version/Hash 负责证明其具体实现版本。R1 Heightfield 的现有
ID 字节必须由回归测试锁定，R1b 不得借 clean break 改写该身份。

## 7. Route Build Input V2

R1b 将 `HeightfieldRouteBuildInputV1` 干净升级为：

```ts
interface StaticColliderSourceV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly triangleSoup: CanonicalTriangleSoupV1;
}

type RouteTerrainSourceV2 =
  | Readonly<{
      kind: "empty";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "bounded";
      terrainEntityId: string;
      triangleSoup: CanonicalTriangleSoupV1;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>;

interface RouteBuildInputV2 {
  readonly kind: "route-build-input";
  readonly schemaVersion: 2;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly layoutSolveReportHash: `sha256:${string}`;
  readonly resourceLockHash: `sha256:${string}`;
  readonly connectivityRequirement: ConnectivityRequirementInputV1;
  readonly startAnchor: RouteBuildAnchorV1;
  readonly destinationAnchor: RouteBuildAnchorV1;
  readonly hardRibbon: RouteHardRibbonV1;
  readonly traversalSurfaces: readonly TraversalSurfaceIdentityV1[];
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly terrainSource: RouteTerrainSourceV2;
  readonly staticColliders: readonly StaticColliderSourceV1[];
  readonly terrainArtifactHash: `sha256:${string}`;
  readonly colliderArtifactHash: `sha256:${string}`;
  readonly geometryArtifactHash: `sha256:${string}`;
  readonly surfaceArtifactHash: `sha256:${string}`;
  readonly blockedTraversalAreaExclusions: readonly BlockedTraversalAreaExclusionV1[];
  readonly blockedWaterExclusions: readonly BlockedWaterExclusionV1[];
}
```

关键不变量：

1. `traversalSurfaces` 按 `traversalSurfaceId` 严格排序、非空、ID 唯一；
2. 恰好一个 Heightfield Surface 引用 `terrainSource`；
3. 每个 Static Surface 精确引用 `staticColliders` 中一行；
4. 未被 Surface 引用的 Static Collider 仍是纯 blocker；
5. 被 Surface 引用的 Collider 同时提供支撑几何和侧面/底面阻挡，不能复制两份 soup；
6. `terrainSource.kind === "bounded"` 时 `triangleSoup` 必须包含至少一个 Triangle，
   `minimumMetersXZ` / `maximumMetersXZ` 必须由该 canonical soup 全部 world-space vertex 的
   XZ extrema 重算并在 `-0` 归一化后逐项精确相等，且 X/Z extent 都必须为正；不得接受只与
   自己声明 Hash 一致的扩大、缩小或平移 bounds；
7. `terrainSource` 不内嵌自己的 Hash，`terrainArtifactHash` 精确等于
   `hashRouteTerrainArtifactV2(terrainSource)`；
8. `colliderArtifactHash` 覆盖按 `colliderSubshapeId` 排序的全部 `staticColliders`；
9. `geometryArtifactHash = sha256CanonicalJson({ terrainArtifactHash, colliderArtifactHash })`；
10. `surfaceArtifactHash` 覆盖排序后的 Surface identity/binding；
11. `capabilityEnvelope` 的关闭字段必须包含
    `maximumTraversalSurfaceCount`、`minimumEquivalentPlaneNormalDotRatio` 与
    `maximumTraversalSurfaceTrianglePairTestCount`；Build Input admission 必须重新解析锁定的
    Graph Builder Profile，并逐字段证明 Envelope 与 resolved Profile 精确相等，不能只信任
    Envelope 自己的 Hash；
12. Build Input Receipt 重新计算所有 child/root hash、Graph Builder budget 和 Capability Envelope；
13. `hard-ribbon` 继续是所有 Surface 的 XZ 硬边界；
14. Water/Area exclusion 只修改 Graph candidate source，不删除 Runtime Collider。

Task 2 必须从 `@whitebox-world/traversal` package root 导出以下四个 artifact Hash owner 与
一个 Build Input root Hash owner，Compiler/Graph/Validation 不得重新实现 preimage：

```ts
terrainArtifactHash = hashRouteTerrainArtifactV2(terrainSource);
colliderArtifactHash = hashRouteColliderArtifactV2(staticColliders);
geometryArtifactHash = hashRouteGeometryArtifactV2({
  terrainArtifactHash,
  colliderArtifactHash,
});
surfaceArtifactHash = hashRouteSurfaceArtifactV2(traversalSurfaces);
routeBuildInputHash = hashRouteBuildInputV2(input);
```

其中精确 preimage 为：

- `hashRouteTerrainArtifactV2`：`empty` 为 `{ kind, terrainEntityId }`；`bounded` 为
  `{ kind, terrainEntityId, triangleSoup, minimumMetersXZ, maximumMetersXZ }`；
- `hashRouteColliderArtifactV2`：已按 `colliderSubshapeId` 严格排序的完整
  `StaticColliderSourceV1[]`；
- `hashRouteGeometryArtifactV2`：
  `{ terrainArtifactHash, colliderArtifactHash }`；
- `hashRouteSurfaceArtifactV2`：已按 `traversalSurfaceId` 严格排序的完整
  `TraversalSurfaceIdentityV1[]`。

Root preimage 精确为 `sha256CanonicalJson(canonical RouteBuildInputV2)`。Canonical admission
必须先重算并核对上述四个已声明 child/root artifact hash，再返回闭集 Input；因此
`routeBuildInputHash` 同时绑定已验证四 Hash、完整 Surface/geometry inventory、Capability
Envelope、anchors/ribbon 与两组 exclusion declaration。`hashRouteBuildInputV2()` 是该 root
preimage 的唯一 owner；Compiler、Recast、Validation 和 Receipt factory 不得直接调用
`sha256CanonicalJson(input)` 复制实现。`assertRouteBuildInputReceiptV2()` 必须调用
`createRouteBuildInputReceiptV2(receipt.input)` 生成 expected receipt，并对 canonical full receipt
做 byte equality；不得只检查传入字符串或顶层字段形状。

上述 bounded extrema admission 只有一个实现 owner：Task 2 在
`@whitebox-world/traversal` 的 Build Input 模块内定义共享 canonical Terrain admission；
`hashRouteTerrainArtifactV2()` 必须先调用该 admission，再对返回的 canonical source 计算
preimage。`assertRouteBuildInputV2()` 与 `createRouteBuildInputReceiptV2()` 复用同一入口，不得各自
重新实现 extrema 或 `-0` 规则。

Forged-bounds RED 必须模拟攻击者绕过 SDK producer：从 valid canonical input 复制 soup，单独扩大、
缩小、平移或使用 asymmetric/`-0` bounds，再直接用 `sha256CanonicalJson` 构造其声称的
Terrain/Geometry preimage 与 `routeBuildInputHash`，并组装 attacker-supplied Receipt。该 raw
hashing 只允许出现在 adversarial fixture；
不得把 `hashRouteTerrainArtifactV2()` 或 `hashRouteBuildInputV2()` 降级为不做 admission 的 preimage
utility。对每个 forged case，以下所有 admission-aware public entrypoint 必须分别 fail closed：

```ts
hashRouteTerrainArtifactV2(forgedTerrainSource);
assertRouteBuildInputV2(forgedInput);
hashRouteBuildInputV2(forgedInput);
createRouteBuildInputReceiptV2(forgedInput);
assertRouteBuildInputReceiptV2(attackerSuppliedReceipt);
```

`hashRouteColliderArtifactV2()`、`hashRouteSurfaceArtifactV2()` 与
`hashRouteGeometryArtifactV2()` 只负责各自已 canonical 的输入域，不能独立发现未传入的 forged
Terrain。Compiler/Recast/Validation/Receipt production code 仍只调用公共 owner，不复制 raw
preimage。

`blockedTraversalAreaExclusions` 与 `blockedWaterExclusions` 不进入
`terrainArtifactHash`：它们的几何效果已体现在 post-exclusion `triangleSoup`，而完整
声明/provenance 由 `routeBuildInputHash` 绑定。因此“声明变化但最终几何未变”必须
改变 Input Hash，但不得伪造 Geometry Hash 漂移。

`RouteBuildInputReceiptV2` 保持 `{ input, routeBuildInputHash, budgetEvidence }` 三个
顶层职责，但不复用 Heightfield-only 的判空/边界语义：

```ts
type RouteBuildBudgetEvidenceV2 =
  | Readonly<{ kind: "not-required-empty-geometry" }>
  | Readonly<{
      kind: "route-geometry-tile-estimate";
      tilesX: number;
      tilesZ: number;
      estimatedTiles: number;
      maximumTiles: number;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>;
```

Tile bounds 必须从非空 Terrain soup 与全部 `staticColliders` soup 的 world-space XZ
union 重算；只有整个 Canonical geometry inventory 没有 Triangle 时才允许
`not-required-empty-geometry`。因此 `terrainSource.kind === "empty"` 不能单独跳过
Graph budget，因为 Static Surface/Collider 仍可能需要真实 Provider build。
Surface-count budget 继续单独从冻结 Envelope 重算，不复制 maximum 到 Receipt
bytes。`createRouteBuildInputReceiptV2(input: RouteBuildInputV2)` 是 Receipt、
`routeBuildInputHash` 与 combined-geometry budget evidence 的唯一生产者。它必须先
canonicalize 并校验 Input，使用上述四个 artifact helper 重新计算并核对 Input 已声明的
artifact hash，再调用唯一 `hashRouteBuildInputV2(canonicalInput)` 生成 root hash 并返回
deeply frozen 的
`{ input, routeBuildInputHash, budgetEvidence }`。Recast 使用相同四个 public helper
组装完整 V2 Input 后只调用该 factory，不得另算 Receipt Hash 或 budget evidence。

Triangle-pair preflight budget 也遵循同一职责分离：它只存在于 resolved Graph Builder
Profile、Capability Envelope 与因此变化的 Build Input/root Hash 中，不得复制进
`RouteBuildBudgetEvidenceV2`。`packages/traversal/src/build-input.ts` 的 Envelope closed-field
admission、`createRouteBuildInputReceiptV2()` 与 `assertRouteBuildInputReceiptV2()` 都必须重新解析
Profile，并要求这两个新增字段与 resolved Profile 精确相等。即使攻击者伪造 Envelope 数值并
重算 Envelope、Build Input、artifact 与 Receipt Hash，仍必须 fail closed。

旧 `blockingColliders` 改为 `staticColliders`，因为显式平台 Collider 同时可能是 Surface 与
blocker。`StaticColliderSourceV1` 沿用现有 `StaticBlockingColliderV1` 的完整闭集字段，不增加
第二份 Transform、Shape 或 Mesh；Triangle Soup 是从 Execution Collider 通过共享 emitter
生成的确定性 Build Artifact。

旧 V1 不保留永久 alias；R1 fixtures 同步迁移到 V2 并证明路径、诊断、Runtime outcome 与
物理指标语义不变。Schema/hash 因 clean break 预期变化，不得伪称 V1/V2 canonical bytes
相同。`RouteThresholdRejectionProofV1` 与 `RouteThresholdRejectionReasonV1` 属于旧 Failure V1
合同，Task 9 必须与 `RouteConnectivityFailureV1` 一并删除 declaration、export 与所有 consumer；
它们不同于 V2 显式复用的 `TraversalNodeV1`、`TraversalEdgeV1`、
`TraversalSurfaceIdentityV1` leaf，不得遗留为 orphan compatibility type。

### 7.1 Connectivity、Path、Overlay 与 Probe V2

R1 的 `RoutePathReceiptV1.traversalSurfaceIdentity`、
`RouteOverlayV1.traversalSurfaceIdentity` 与
`RouteRuntimeProbeRequestV1.traversalSurfaceIdentity` 都假设整条 Path 只有一个 Surface，
R1b 必须 clean break 删除这三个 path-global 单值。

`RoutePathReceiptV2` 保留 `orderedTraversalNodeIds`，并增加与其等长、同顺序的
`orderedTraversalSurfaceIdentities`。每一项必须与 `traversalGraphHash` 所绑定 Graph 中对应
Node 的三个稳定 ID 及其 Surface Resource identity 精确一致；它是 Graph 的可独立验证投影，
不是第二个作者权威。`RouteOverlayV2` 必须使用完全相同的字段名
`orderedTraversalSurfaceIdentities` 投影相同有序数组；该数组与 Overlay/Path 各自的
`orderedTraversalNodeIds` 等长，并按 index 与同一 Graph inventory row 对齐，不得改名、排序或
去重成集合。`assertRouteOverlayContextV2()` 不接受 caller 独立提供的 Path/Path Hash；它先从可信
Build Input Receipt 校验完整 `RouteConnectivityResultV2`，再从 canonical complete Result 内部派生
Graph、Path 与两个 Hash，证明 Overlay 数组与 Path byte-equal 且每一项都等于对应 Node 的
inventory identity。缺行、多行、顺序漂移、只改一侧或 Path/Overlay 同时伪造成另一合法 Surface
均 fail closed。Overlay 不再声称整条 Path 属于一个 Surface。Probe Request 绑定 V2 Path Receipt
Hash，不再复制 path-global Surface。

Graph V2 不把 Ref/Version/Hash 重复嵌入每个 Node。Node 保留 R0 已冻结的
`traversalSurfaceId` / `surfaceEntityId` / `colliderSubshapeId` 三个稳定 ID，
Graph 只增加一份内容寻址资源 inventory：

```ts
interface TraversalGraphV2 {
  readonly kind: "traversal-graph";
  readonly schemaVersion: 2;
  // existing world/lock/profile/route and artifact fields
  readonly traversalSurfaceIdentitiesById:
    Readonly<Record<string, TraversalSurfaceIdentityV1>>;
  readonly traversalNodesById:
    Readonly<Record<string, TraversalNodeV1>>;
  readonly traversalEdgesById:
    Readonly<Record<string, TraversalEdgeV1>>;
}
```

Node 的 serialized shape 在 V2 保持 `TraversalNodeV1`，不创建只为改名的 alias；
Graph V2 负责新增 Resource inventory。Inventory 的 key 必须等于
value.`traversalSurfaceId`，并精确投影全部
`input.traversalSurfaces`；每个 Node 的三个稳定 ID 必须精确匹配其引用的 inventory
行。Path/Overlay 的第 `i` 个完整 identity 必须等于对应 Node 引用的该行。
这样 Resource identity 在 Graph 中只有一个可哈希权威，同时避免大量 Node 重复
序列化相同 Ref/Version/Hash。

`RouteConnectivityResultV2` 使用 provider-neutral `kind: "route-connectivity-result"` 与
`schemaVersion: 2`，上下文校验改为：

1. `TraversalGraphV2` 同时携带 `terrainArtifactHash`、`colliderArtifactHash`、
   `geometryArtifactHash` 与 `surfaceArtifactHash`，逐一等于 Build Input；
2. Graph validator 重算 child/root 关系，不能只比较传入字符串；
3. Graph inventory 必须精确投影 `input.traversalSurfaces`，每个 Node 的三个
   Surface ID 必须精确匹配 inventory 中同 ID 行；
4. 每个 Path Node 的完整 Surface identity 必须精确等于 Graph inventory 中该
   Node 引用的行，且仍属于 Input；
5. 不再把所有 Graph/Path Node 与一个 Build Input Surface 做等值比较；
6. Failure 若发生在某个 Surface，使用明确的 Surface identity；若构建尚未确定唯一 Surface，
   不伪造 path-global Surface 字段。

`ROUTE_SURFACE_CORRELATION_MISSING` 与 `ROUTE_SURFACE_CORRELATION_AMBIGUOUS` 必须进入
V2 Connectivity Failure/Validation Diagnostic 的 closed enum、canonical validator、CLI 和
Browser 投影；未知诊断仍 fail closed。

V2 closed enum 同时必须加入 `ROUTE_SURFACE_PROFILE_MISSING`。该错误表示
Route 必需的 Collider 没有兼容 Binding，不表示已存在但解析失败的 Profile Ref；
后者必须更早在 Authoring/Compiler admission fail closed。

`RouteConnectivityFailureV2` 删除 V1 common 中的单数
`traversalSurfaceId/surfaceEntityId/colliderSubshapeId`，改为始终存在的闭集数组：

```ts
readonly relatedTraversalSurfaceIdentities:
  readonly TraversalSurfaceIdentityV1[];
```

该数组按 `traversalSurfaceId` 严格排序且 ID 唯一；上下文校验必须按六个
identity 字段精确匹配 Build Input。同一 `traversalSurfaceId` 的不同资源版本
不得同时出现；版本升级是替换该行并改变 Surface/Input Hash，不是多版本并存。

V2 clean break 不保留任何旧单数 Surface alias。除 common 中删除的
`traversalSurfaceId/surfaceEntityId/colliderSubshapeId` 外，V1 reason-local 的
`traversalSurfaceId` 全部删除；Threshold reason 的 Heightfield-only `terrainEntityId` 也删除。
只有 `empty-heightfield-source` 保留用于标识 canonical Terrain source 的 `terrainEntityId`，它不是
Surface identity。Surface 证据只能来自 `relatedTraversalSurfaceIdentities`。
`graphStatus === "complete"` 时仍必须携带
`traversalGraphHash`，`unavailable` 时禁止该字段。以下是全部现存 V1 reason 到 V2 的精确迁移，
不是只约束新增 reason：

| V2 reason kind | code | `status / graphStatus` | identity cardinality | 精确 reason-local fields（除 `kind/code`） |
| --- | --- | --- | ---: | --- |
| `empty-heightfield-source` | `ROUTE_REQUIRED_PATH_UNREACHABLE` | `unreachable / unavailable` | 0 | `terrainEntityId` |
| `no-queryable-ground-surface` | `ROUTE_REQUIRED_PATH_UNREACHABLE` | `unreachable / unavailable` | 0 | 无 |
| `start-surface-not-found` | `ROUTE_START_SURFACE_NOT_FOUND` | `unreachable / complete` | 0 | `anchorEntityId`, `positionMetersXYZ` |
| `destination-surface-not-found` | `ROUTE_DESTINATION_SURFACE_NOT_FOUND` | `unreachable / complete` | 0 | `anchorEntityId`, `positionMetersXYZ` |
| `required-path-unreachable` | `ROUTE_REQUIRED_PATH_UNREACHABLE` | `unreachable / complete` | 0 | 排序唯一的 `relevantBlockingColliderEntityIds`, `blockedWaterEntityIds` |
| `node-budget-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / unavailable` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |
| `edge-budget-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / unavailable` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |
| `search-budget-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / complete` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |
| `straight-path-capacity-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / complete` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |
| `slope-threshold-exceeded` | `ROUTE_SLOPE_EXCEEDED` | `unreachable / unavailable` 或 `unreachable / complete` | 至少 1 | proof common + `maximumObservedSlopeDegrees`, `maximumAllowedSlopeDegrees` |
| `step-height-threshold-exceeded` | `ROUTE_STEP_HEIGHT_EXCEEDED` | `unreachable / unavailable` 或 `unreachable / complete` | 至少 1 | proof common + `maximumObservedStepHeightMeters`, `maximumAllowedStepHeightMeters` |
| `clearance-width-insufficient` | `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT` | `unreachable / unavailable` 或 `unreachable / complete` | 至少 1 | proof common + 排序唯一的 `relevantColliderSubshapeIds`, `minimumObservedClearanceWidthMeters`, `minimumRequiredClearanceWidthMeters` |
| `overhead-clearance-insufficient` | `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT` | `unreachable / unavailable` 或 `unreachable / complete` | 至少 1 | proof common + 排序唯一的 `relevantColliderSubshapeIds`, `minimumObservedClearanceHeightMeters`, `minimumRequiredClearanceHeightMeters` |
| `surface-gap-exceeded` | `ROUTE_SURFACE_GAP_EXCEEDED` | `unreachable / unavailable` 或 `unreachable / complete` | 至少 1 | proof common + `maximumObservedSurfaceGapMeters`, `maximumAllowedSurfaceGapMeters: 0` |
| `surface-profile-missing` | `ROUTE_SURFACE_PROFILE_MISSING` | `incomplete / unavailable` | 0 | 非空且排序唯一的 `relevantColliderSubshapeIds`, `failurePositionMetersXYZ` |
| `surface-correlation-missing` | `ROUTE_SURFACE_CORRELATION_MISSING` | `incomplete / unavailable` | 0..1 | `failurePositionMetersXYZ` |
| `surface-correlation-ambiguous` | `ROUTE_SURFACE_CORRELATION_AMBIGUOUS` | `incomplete / unavailable` | 至少 2 | `failurePositionMetersXYZ` |
| `traversal-surface-count-budget-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / unavailable` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |
| `traversal-surface-triangle-pair-test-budget-exceeded` | `ROUTE_GRAPH_BUDGET_EXCEEDED` | `incomplete / unavailable` | 0 | `maximumAllowedCount`, `minimumRequiredCount` |

表中的 proof common 精确为
`proofKind: "unique-single-reason-cut"`、非空且排序唯一的 `proofCandidateIds`、
`failurePositionMetersXYZ`。Threshold reason 的 identity 数组必须是该唯一拒绝证明中全部
candidate evidence 所引用 Canonical Surface identity 的排序去重 union；无法从 proof candidate
确定至少一个完整 identity 时不得发布专用 threshold reason，必须回退通用不可达。
`unavailable` 只用于 Graph 尚未产生时的 Build Rejection Graph proof；已有完整 Graph 上的
Query/Rejection proof 必须使用 `complete` 与同一 Graph Hash。

V2 `empty-heightfield-source` 只能在 combined canonical geometry inventory 真空时发布：
`terrainSource.kind === "empty"` 且 `staticColliders.length === 0`（每个存在的 canonical collider
soup 本身必须非空）；只要平台或任何 Static Collider 存在就禁止该 reason，并继续真实 Provider build。Combined geometry 非空但
slope/filter/provider 结果没有任何可查询 candidate 时才发布
`no-queryable-ground-surface`。`surface-correlation-missing` 在 Provider range 已唯一对应
Canonical Surface、但 Node barycentric/height correlation 失败时保留一个 identity；连唯一 range
都无法确定时为 0。`ambiguous` 必须保留所有内部重叠候选。Pre-Graph capacity（包括 Surface
count 与 triangle-pair test budget）、
start/destination miss、generic unreachable 和 query capacity reason 的 identity 数组固定为空，
不得从 Build Input inventory 猜测参与 Surface。

`RouteOverlayV2` 将 V1 `blockingColliderIdentities` clean break 为
`staticColliderIdentities`，它精确投影全部 `input.staticColliders`，包含
Surface-bound 与 blocker-only Collider。候选平台的顶面可通行，但侧面/底面仍是阻挡，
因此不得沿用“从 blockers 中排除 path-global Surface Collider”的 V1 规则。
`@whitebox-world/traversal` 是唯一 Overlay 上下文校验 owner：

```ts
assertRouteOverlayContextV2({
  overlay,
  routeConnectivityResult,
  buildInputReceipt,
});
```

精确 public input 是关闭的三字段形状：

```ts
interface AssertRouteOverlayContextInputV2 {
  readonly overlay: unknown;
  readonly routeConnectivityResult: unknown;
  readonly buildInputReceipt: unknown;
}
```

不得保留接受 `routePathReceipt` / `routePathReceiptHash` 的 overload、optional field 或 alias。
validator 算法固定为：

1. `assertRouteBuildInputReceiptV2(buildInputReceipt)`；
2. `assertRouteConnectivityResultForBuildInputV2(routeConnectivityResult, canonicalBuildInputReceipt)`；
3. 要求 canonical Result `status === "complete"`，只从其内部取得 Graph/Graph Hash/Path/Path Hash；
4. canonicalize Overlay，并逐项核对 route/world/lock/anchor/ribbon、Graph/Path Hash、ordered Node/
   Edge/position/Surface arrays；
5. 对每个 index 从 canonical Graph Node 的 `traversalSurfaceId` 回查
   `traversalSurfaceIdentitiesById`，再次要求 Overlay identity 等于完整 inventory row；即使 Result
   admission 已证明 Graph↔Path，该直接 Overlay postcondition 也不能删除；
6. `staticColliderIdentities` 必须精确等于 canonical Build Input 全部 `staticColliders` 的排序
   identity-only projection；
7. 返回 deeply frozen canonical Overlay。

该 validator 需要可信完整 Result 与 `RouteBuildInputReceiptV2`，因此调用点冻结在
`@whitebox-world/validation` 的 `createWorldkitBrowserRouteEvidencePublicationV2()`：每个
publication row 已携带 Validation admission 通过的同一 `routeConnectivityResult` 与
`routeBuildInputReceipt`；factory 必须把这两个 exact row field 传入，并用 validator 返回的
canonical Overlay 生成 evidence bytes、Overlay Hash 与 Browser DTO。Validation/Trusted Host 是
raw publication provenance admission owner；从磁盘、CLI 或网络接收的 raw row 只有在 Host 同时
持有并核验对应 Validation Receipt、Build Input Receipt 与 hash chain 后，才能进入该 factory。
禁止把任意 raw JSON 直接标记为 trusted publication。

Runtime Contracts 的 V2 canonicalizer 只负责无需 Build Input context 即可自证的 standalone
closed-shape、child hash、Path/Overlay 内部对齐、selector/publication consistency 与 deep-freeze；
它不接收虚构的 Build Input，也不重建 Graph/Collider inventory provenance。Browser V5 只安装
Trusted Host 提供的 canonical DTO，
保持 read-only selector/getter；它不是 raw publication trust owner，也不声称仅凭
`staticColliderIdentities` 和一个可重算 Overlay Hash 就能证明 Build Input provenance。

Browser 的 route evidence 返回形状同步版本化为
`WorldkitBrowserRouteEvidencePublicationV2` / `RouteEvidenceProjectionV2`，Path 与 Overlay 都只
发布 V2 ordered Surface identities。因为序列化返回合同已经变化，外层协议升级为
`WorldkitBrowserApiV5`；selector 和 read-only getter 语义保持不变。项目尚未发布，删除 V4/V1
route-evidence alias 并同步 fixtures，不让旧 path-global 字段永久混入公共协议。

Runtime Probe 将“用于生成行走 Intent 的 XZ lookahead progress”和“用于验证支撑的 3D
support station”拆成两个权威，禁止前者决定期望 Surface：

- Intent/lookahead 保持现有 XZ 算法和 Driver Profile，只回答下一步往哪里走；
- Probe 私有保存单调的 `supportStationDistanceMeters`，只回答主体当前位于 3D Path 的哪一段；
- 每 Tick 用 retained foot XYZ 到有向 3D Path segment 的距离选择 station；搜索窗口从上一
  station 开始，允许的最大前进距离由 resolved lock 所引用的
  `control-feel-profile.walkSpeedMetersPerSecond` × fixed timestep 加 Graph quantization 推导，
  不增加可调数字；允许一个 quantization band 的物理回退；
- 多个相邻 segment 与最小 3D 距离之差在
  `positionQuantizationMeters / 2` 内时全部保留，处理 A→B→C 的精确 seam；Task 4 的 XZ、
  area、height query constants 不复用于 3D station distance；不相邻的自交 segment 不能通过
  tie 扩大集合；
- 每个 Tick 的允许 Surface 集合是保留 segment 两端 Graph Node 的 Surface identity 去重结果；
  单 Node 起终点只允许该 Node Surface。

`expectedTraversalSurfaceIds` 只写入 `RouteRuntimeProbeTickV2`，并与 Port 产出的
`TraversalRuntimeTickEvidenceV1.surfaceResolution` 并列。Runtime Port 不接收 Path，也不得把
expected Surface 写进自己的 Evidence，否则会成为第二条 Route 权威：

- 同 Surface Edge 只允许一个 ID；
- 换面 Edge 在物理跨 seam/step 的短暂阶段允许两个端点 Surface；
- 3D station 离开换面 Edge 后，上一 Surface 不再允许；
- `unmatched`、`ambiguous` 或不在当前允许集合中的 `resolved` 一律计为 mismatch。

因此合法地形→平台换面可通过，而未声明 Collider 或错误的第三 Surface 仍被阻断。允许集合
只来自 Graph/Path 与 retained foot pose，不写 Ground/Air，也不触发第二次 Support Query。
主体从平台跌到同 XZ 的下层 Heightfield 时，3D station 仍绑定当前平台段，实际 Heightfield
Surface 不在允许集合中，必须 mismatch；不得回跳到路径早期的下层 segment 自行“解释成功”。

## 8. 几何到分层 Graph

### 8.1 单一几何来源

`@whitebox-world/terrain-surface` 的共享 emitter 继续输出：

- Heightfield canonical triangle soup；
- Static Collider canonical transformed triangle soup。

Graph Builder 与 Babylon Runtime 都消费这些 exact world-space vertices。R1b 同时消除
`packages/traversal-recast/src/heightfield-source.ts` 中重复的 Euler TRS 实现，统一委托 shared
static-collider emitter，关闭 R1 Review 留下的非阻断 P2。

在进入 Provider 前，Adapter 只建立一份按 `colliderSubshapeId` 排序的 canonical source
inventory，并把它映射成两个连续区段：

```text
candidate prefix
  = Heightfield soup
  + 所有被 Execution Traversal Surface 精确引用的 Static Collider soup

blocker suffix
  = 其余 Static Collider soup
```

候选 Static Collider 的整份 soup 仍只有一个几何权威；Provider 用坡度/法线将顶部或坡面标为
可走，侧面、底面和超坡面仍是 solid/non-walkable。未绑定 Collider 的水平顶面也必须属于
blocker suffix，不能因朝上自动可走。

R1 已安装的 provider-private
`sourceAreaMode.kind = "terrain-with-static-blockers-r1"` 只有 terrain/blocker 二分，字段集也已
关闭，不能直接表达上述 candidate prefix。R1b 必须给已锁定 patch 增加新的私有模式。该模式
不只区分 candidate/blocker，还要保留每个候选 Surface 的 source range，使 Recast 不把两个
相邻共面 Surface 合成一个跨界 polygon。示意形状如下（精确字段由实施探针按安装版的 area
上限冻结）：

```ts
{
  kind: "layered-traversal-sources-r1b";
  candidateSourceRanges: readonly {
    traversalSurfaceOrdinal: number;
    startVertexIndex: number;
    vertexCount: number;
  }[];
  blockerStartVertexIndex: number;
}
```

Ordinal 只用于一次 Provider operation 内分配临时 area/tag，范围顺序来自 Canonical
`traversalSurfaceId`；最终 Graph identity 仍必须回查 canonical triangle provenance，不能信任
Ordinal。安装版 Recast 的可用 area 数是有限资源。安装态 0.43.1 源码与真实 round-trip 探针
冻结：`RC_NULL_AREA = 0`、保留 blocker area 为 `1`、`RC_WALKABLE_AREA = 63`，Detour area
是 6-bit 的 `0..63`；因此 candidate ordinal `0..60` 只能映射到临时 area `2..62`，每次
Build 最多容纳 **61 个候选 Traversal Surface（包含 Heightfield）**。有一个 Heightfield 时
最多再容纳 60 个 Static candidate Surface，第 62 个候选必须在 Provider 调用前 fail closed，
不得静默复用相邻 Surface 的 area。该
provider-neutral 限额以 `maximumTraversalSurfaceCount` 进入 Graph Builder Profile。R1b 同时
冻结 `minimumEquivalentPlaneNormalDotRatio = 0.99999` 与
`maximumTraversalSurfaceTrianglePairTestCount = 4_000_000`；三者按 R1 既有做法逐项复制进
`TraversalCapabilityEnvelopeV1`，Recast Adapter 只消费 Envelope，不回头读取 Profile。
`minimumEquivalentPlaneNormalDotRatio` 的合法范围是 `(0, 1]`，内置值约等于允许 0.256° 的
法线夹角，仅供 pair-plane metadata 分类，不参与 point-hit owner 或 slope admission。
`maximumTraversalSurfaceTrianglePairTestCount` 必须为正 safe integer，且不大于
`Number.MAX_SAFE_INTEGER - 1`，从而 budget failure 可精确返回 `maximum + 1`。

`4_000_000` 复用仓库 generic geometry predicate ceiling
`TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1.maximumTrianglePointTestCount` 作为保守 policy cap；它不
声明 point test 与 triangle-pair test 的性能等价。Task 4 GREEN 后必须在支持环境记录 near-budget
对抗输入的耗时与峰值内存；若不满足发布预算，应在未发布合同内调整 Profile 数值、内容 Hash，
然后重新跑完整设计/实现 Review。未来更换 Provider/分片策略只修改 Adapter 和 Budget Profile，
不改变公共 Surface/Graph 合同。

安装版 patch 的执行顺序必须冻结为：

```text
markWalkableTriangles(subject slope)
  → 对仍为 walkable 的 candidate range 按 ordinal `0..60` 写入互异临时 area `2..62`
  → 将 blocker suffix 的 triangle area 写为保留 blocker area `1`
  → rasterize / buildCompactHeightfield
  → 将 blocker area 的 compact spans 写为 null area
  → contour / simplify / polygonize
```

若在 slope mark 之前写 area，它会被安装版生成器覆盖，属于门禁失败。临时 area 数量超过依赖
探针冻结的安全上限时，统一返回 provider-neutral `ROUTE_GRAPH_BUDGET_EXCEEDED`；公共 Graph
Builder Profile 只表达上述 provider-neutral count、pair-test budget 与 plane-metadata threshold，
不得出现 Recast area 名或原生上限字段。

不得复用旧 `terrainVertexCount` 名称承载扩大后的语义。新模式及 patch fingerprint 只存在于
Recast Adapter/Dependency Lock，禁止进入 Canonical Schema、CLI、Browser、Report 或 Snapshot。
真实 `generateTiledNavMesh` acceptance test 必须证明绑定盒顶可走、未绑定同尺寸盒顶不可走，
并证明两个相邻共面 Surface 不产生跨越 source boundary 的 polygon。

### 8.2 Provider 输入与 Surface 投影

内部 Graph Adapter 把 Terrain 与所有 Static Collider soup 合并进一次构建操作：

- Terrain 和显式 Surface Collider 是候选 source；
- 未声明 Surface 的 Collider 仅作为 blocker；
- Surface Collider 的垂直侧面、底面和超过 Subject slope 的面仍不可走；
- 胶囊侵蚀、顶部净空、坡度和跨阶只来自 Capability Envelope；
- Provider polygon/tile/area ID 始终留在 adapter operation 内。

Canonical Graph Node 的 Surface 身份不能直接复制 Provider area/poly Ref。Graph projection
将 Node 世界位置与 source triangle provenance 做确定性 3D correlation：

1. Provider 前先对 Canonical candidate ranges 执行 §9.1 overlap/boundary preflight；同一 band
   的 interior overlap fail closed，boundary-only seam 与不同 Y layer 保留；
2. Provider polygon 的临时 area 必须精确解析到一个 Canonical candidate range；
3. 只在该 range 的 triangles 上对 Node XZ 做 interior/boundary 命中；横向只使用
   `TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1`，面积退化只使用
   `TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1`，不得把 Graph quantization 当成
   XZ 搜索半径；
4. 命中高度必须与量化后的 Node Y 落在锁定 Graph height band 内，法线必须满足 Subject
   slope；只共享 XZ、但 Y 位于另一层的 Surface 不是候选；
5. 禁止全局 highest-Y、lowest-Y 或 nearest-surface 规则；
6. 使用 §9.1 的半开 edge-owner 规则消解合法 boundary-only seam；
7. 零命中返回 `ROUTE_SURFACE_CORRELATION_MISSING`，多个 admitted interior 或 same-band
   interior overlap 返回
   `ROUTE_SURFACE_CORRELATION_AMBIGUOUS`；两者都使整次 Graph build fail closed，不静默丢 Node；
8. 恰好一个命中时写入该 Surface 的三个稳定 ID；
9. Provider 拆 Tile、改 polygon 顺序或换内部 Ref 不得改变结果。

Graph correlation band 冻结为 Graph Builder 的 `positionQuantizationMeters / 2` 加
`@whitebox-world/terrain-surface` 唯一导出的
`TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1`，并进入 Profile/hash。它不是 Runtime
contact band；XZ epsilon 与面积 epsilon 不得参与 Y band 算术。

Provider polygon 的临时 area 必须精确映射回一个 candidate source range，且对应 range、
`surfaceArtifactHash` 与 `geometryArtifactHash` 必须重新校验。Contour 的
`maximumSimplificationErrorMeters` 允许 polygon 边界在锁定误差内偏离原三角边，因此不得对
简化后的整个 polygon footprint 做“碰到两个 Surface 即 ambiguous”的硬判定。Adapter 验证的是：

1. polygon 没有合并来自两个临时 area/source range 的 spans；
2. Node XZ 对该 tagged range 调用 §9.1 shared query，Node Y 在锁定 height band 内；不得保留
   Task 6 私有 barycentric epsilon 或第二套 triangle leaf；
3. exact seam 只产生各自带唯一 range provenance 的相邻 polygon；
4. tag/range 缺失、越界或 hash 不一致时整图 fail closed。

最终 Node identity 从通过校验的 Canonical Surface 生成，不复制 Provider area value。禁止只看
polygon centroid 后在所有 Surface 中猜身份。

Graph 继续是分层 3D：Node ID 包含 `traversalSurfaceId` 与量化后的 XYZ；同一 XZ 不按最高、
最低或最近 Surface 自动合并。R1b Golden 不声称已经完成完整桥面/桥下双层 Runtime，但
Canonical Graph 仍不得破坏 R0 已冻结的多层表达能力。

### 8.3 Edge 与 seam

边类型继续只有 `walk | slope | step`：

- 同一或相邻共面 Surface 形成 `walk`；
- 连续斜面形成 `slope`；
- Portal 高度差大于共面容差且不超过锁定 `maxStepHeightMeters` 时形成 `step`；
- 超过步高、存在水平 gap、净空不足或踏面过窄时不发布可通行 Edge。

成功 seam 必须由 canonical triangle 边界和 Collider content 证明。视觉相接但 Collider 不接
返回 `ROUTE_SURFACE_GAP_EXCEEDED`；不得用 visual bounds 或 Provider 邻接填平。

## 9. Runtime Surface Correlation

R1b 不增加第二次 Ground Query。每个 fixed tick 仍按以下顺序：

```text
PhysicsCharacterController.checkSupport()
  → freeze support state + normal + controller/foot pose
  → Ground/Air resolver publishes movement state
  → Traversal classifier correlates the same retained sample
  → Route Runtime Evidence
```

### 9.1 共享命中等价与边界所有权

Graph 与 Runtime 必须复用 `@whitebox-world/terrain-surface` 的同一套 triangle query 与
Surface owner 解析，不得各自实现 barycentric、edge owner 或法线翻转。以下三个常量是唯一
公共数值容差，名称和值一起冻结：

```ts
export const TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1 = 0.00001;
export const TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1 = 1e-10;
export const TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1 = 0.00001;
```

三者用途严格分离：

- XZ epsilon 只用于 world-space 点到投影边的垂直距离与 point/segment boundary contact；
  `interior` 要求每条 inward edge distance 都大于该值，`boundary-only` 要求所有距离至少为
  其负值且至少一条落在闭 epsilon band；不得把 raw cross product（m²）或 barycentric weight
  （无量纲）直接与它比较；
- area epsilon 精确等于 XZ epsilon 的平方，只区分正面积投影交集与 point/segment 接触；
- height epsilon 只给调用方 Y band 增加确定性 padding；Graph 使用
  `positionQuantizationMeters / 2 + TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1`，Runtime
  仍使用 Live Lock 核验的 `keepDistanceMeters + keepContactToleranceMeters`，不得用公共 height epsilon
  替换 Runtime contact band；
- 法线没有第四个全局 epsilon。`minimumUpwardNormalYRatio` 与 retained-support normal dot 由
  调用方锁定 Profile/Adapter 提供；`minimumEquivalentPlaneNormalDotRatio` 只属于 budgeted pair
  preflight 的 Profile/Envelope metadata。公共 query 不把 downward normal 翻成 upward；底面、
  垂直面和超坡度面必须保持不可走。

公共 source/query contract 只携带 query 所需的稳定 Surface ID 与 canonical triangle bytes，不复制
Task 2 的六字段 `TraversalSurfaceIdentityV1`：

```ts
export interface CanonicalTraversalSurfaceTriangleSourceV1 {
  readonly traversalSurfaceId: string;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export type TraversalSurfaceNormalAdmissionV1 =
  | Readonly<{
      mode: "upward-slope";
      minimumUpwardNormalYRatio: number;
    }>
  | Readonly<{
      mode: "retained-support";
      minimumUpwardNormalYRatio: number;
      referenceNormalXYZ: readonly [number, number, number];
      minimumReferenceNormalDotRatio: number;
    }>;

export interface QueryCanonicalTraversalSurfaceHitsInputV1 {
  readonly sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[];
  readonly pointMetersXZ: readonly [number, number];
  readonly referenceHeightMeters: number;
  readonly maximumReferenceHeightDifferenceMeters: number;
  readonly normalAdmission: TraversalSurfaceNormalAdmissionV1;
}

export interface CanonicalTraversalSurfaceHitV1 {
  readonly traversalSurfaceId: string;
  readonly location: "interior" | "boundary-only";
  readonly heightMeters: number;
  readonly normalXYZ: readonly [number, number, number];
}

export type CanonicalTraversalSurfaceHitResolutionV1 =
  | Readonly<{ mode: "missing"; hits: readonly [] }>
  | Readonly<{
      mode: "resolved";
      hit: CanonicalTraversalSurfaceHitV1;
      hits: readonly CanonicalTraversalSurfaceHitV1[];
    }>
  | Readonly<{
      mode: "ambiguous";
      hits: readonly CanonicalTraversalSurfaceHitV1[];
    }>;

export function queryCanonicalTraversalSurfaceHitsV1(
  input: QueryCanonicalTraversalSurfaceHitsInputV1,
): CanonicalTraversalSurfaceHitResolutionV1;
```

该函数校验有限 closed-field triangle soup 输入，按 `traversalSurfaceId` 聚合同一 Surface 的
triangle hits，每个
Surface 最多保留一行，按 ID code-point order 排序并 deep-freeze。Surface 内 tie-break 固定为：
`interior` 优先；再选与 reference Y 绝对差最小者；若有 retained normal，再选 normal dot
最大者；最后按 canonical triangle ordinal。Ordinal 精确等于该 source 原始
`triangleIndices` 中三元组起始 offset 除以 3，在任何 normal/filter/admission 之前确定；过滤后
不得压缩或重编号。Ordinal 只用于内部 tie-break，不返回、不哈希，也不是 Surface identity。

共享 owner resolution 也由该函数完成：零命中为 `missing`；唯一 interior 胜出，即使另有
boundary-only；两个以上不同 Surface 的 admitted interior 为 `ambiguous`；没有 interior 时，
所有 admitted boundary-only 命中都按 `traversalSurfaceId` code-point 最低 ID 形成半开 owner，
不要求法线或平面等价。这样 flat↔ramp、合法 0.25m step 与 ridge 的 exact seam 都只有一个
Runtime/Graph owner；expected Path 或 retained normal 只能参与 admission/tie-break，不能覆盖该
owner。Task 6/7 只能用返回的 ID 回接各自完整 Surface inventory，不得再做第二次 owner 推断。
Graph 遇到多个 interior 时 build fail closed；Runtime 发布
`surfaceResolution.mode = "ambiguous"` 并由 Probe 阻断。

调用方参数所有权与闭边界固定如下；最大值比较一律 `<=`，最小值比较一律 `>=`：

| caller | `referenceHeightMeters` | `maximumReferenceHeightDifferenceMeters` | normal admission | pair-only fields |
| --- | --- | --- | --- | --- |
| Graph Node correlation | quantized Node Y | `positionQuantizationMeters / 2 + TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1` | `upward-slope`, `minimumUpwardNormalYRatio = cos(maxSlopeDegrees)` | 无 |
| Runtime retained support | retained pre-integration foot Y | `keepDistanceMeters + keepContactToleranceMeters` | `retained-support`, upward 与 reference dot 都来自 locked Live Lock `maxSlopeCosine` | 无 |
| Graph preflight | 不适用 | same-band 与 equivalent-height 都使用 `positionQuantizationMeters / 2 + TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1` | `minimumUpwardNormalYRatio = cos(maxSlopeDegrees)` | `minimumEquivalentPlaneNormalDotRatio` 与 pair-test budget 来自 hashed Capability Envelope |

所有 height maximum 必须为 finite `>= 0`，命中包含恰好等于 maximum 的边界；
`minimumUpwardNormalYRatio` 与 retained `minimumReferenceNormalDotRatio` 必须在 `[0, 1]`，命中包含
恰好等于 minimum 的法线。`referenceNormalXYZ` 必须是 finite non-zero tuple，由 shared query
确定性归一化一次；triangle normal 从 canonical winding 归一化且绝不翻面。Pair-only
equivalent-plane threshold 使用更窄的 `(0, 1]`；
预算使用前述正 safe-integer 范围。

不得再引入 second same-band Profile 字段；Graph 的 same-band authority 始终由既有 hashed
`positionQuantizationMeters` 加唯一公共 height epsilon 派生。

#### 9.1.1 Pairwise overlap preflight

`interior/boundary-only` 是单点命中；`equivalent-plane` 是两个 boundary hits 的内部 metadata；
`same-band/distinct-layer` 是两个 Surface footprint 的关系。不得把这些不同层级压成同一个
字符串 union。单个 triangle leaf 与 source-pair classifier 都是 package-private implementation；
不得从 `@whitebox-world/terrain-surface` package root 导出，也不得成为 Task 6/7 的依赖。唯一
公共 inventory API 是 budgeted preflight：

```ts
export interface PreflightCanonicalTraversalSurfaceOverlapsInputV1 {
  readonly sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[];
  readonly minimumUpwardNormalYRatio: number;
  readonly maximumSameBandHeightDifferenceMeters: number;
  readonly maximumEquivalentPlaneHeightDifferenceMeters: number;
  readonly minimumEquivalentPlaneNormalDotRatio: number;
  readonly maximumTraversalSurfaceTrianglePairTestCount: number;
}

export interface CanonicalTraversalSurfaceOverlapBlockerV1 {
  readonly firstTraversalSurfaceId: string;
  readonly secondTraversalSurfaceId: string;
  readonly witnessPointMetersXZ: readonly [number, number];
  readonly minimumHeightDifferenceMeters: number;
}

export function preflightCanonicalTraversalSurfaceOverlapsV1(
  input: PreflightCanonicalTraversalSurfaceOverlapsInputV1,
):
  | Readonly<{ mode: "clear" }>
  | Readonly<{
      mode: "blocked";
      blocker: CanonicalTraversalSurfaceOverlapBlockerV1;
    }>
  | Readonly<{
      mode: "budget-exceeded";
      reason: "traversal-surface-triangle-pair-test-budget-exceeded";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>;
```

Pair IDs 必须按 code point 放入 `first.../second...`。实现先按 Surface ID 排 source pair；对每个
pair 按 first canonical triangle ordinal 访问确定性 XZ broadphase，index 以 iterator 形式返回
严格递增的 second canonical triangle ordinals。Ordinal 始终是原始 `triangleIndices` 三元组
offset/3，任何 slope/filter 前确定且绝不重编号。每个 candidate 被迭代到时立即计数；若计数为
`maximum + 1`，立即返回 `budget-exceeded`，其中
`minimumRequiredCount = maximumAllowedCount + 1`，不得再分类该 candidate。因此 limit=1 且大量
重叠时必须在第二个 candidate 退出。实现不得物化全 inventory、全 source-pair 或单个 first
triangle 的无界 candidate-pair 数组。预算计数位于 XZ broadphase 之后、normal/plane relation
classification 之前，因此包括随后被 normal admission 排除的 candidate；不同实现不能靠改变
过滤顺序获得不同预算结果。

只分类不同 Surface ID 的 candidate；normal admission 仅保留满足 upward slope 的 triangles，
且不得翻转 downward normal。投影交集面积大于 area epsilon 为 `interior-overlap`；否则闭 XZ
distance epsilon 内的 point/segment contact 为 `boundary-only`；其余为 `disjoint`。对于
interior intersection polygon，两平面的 height difference 是 affine：在确定性排序后的 polygon
vertices 求 signed values；若最小值 `<= 0` 且最大值 `>= 0`，minimum absolute separation 为
0，否则取绝对 vertex value 的最小值。该值 `<= maximumSameBandHeightDifferenceMeters` 时为
same-band，否则为 distinct-layer，避免 crossing slopes 伪装成上下叠层。

一个 Surface pair 中任何 same-band interior 都形成 blocker。Boundary-only（无论内部 plane
metadata 是否 equivalent）与 distinct-layer 都保留；public preflight 不返回 pair metadata。
Witness 取 source-pair/first ordinal/second ordinal/坐标 code-point 稳定顺序中的第一项。Preflight
只返回第一个 Canonical-ID-sorted blocker、budget failure 或 `clear`，并 deep-freeze 全部输出。
source inventory 反转必须得到相同结果与顺序。任意 triangle-soup 顶点/索引字节反转不在该承诺
内；soup 已内容寻址，改变 canonical soup bytes 必须改变或拒绝对应 child hash。

`maximumTraversalSurfaceTrianglePairTestCount` 必须为正 safe integer 且
`<= Number.MAX_SAFE_INTEGER - 1`；`minimumEquivalentPlaneNormalDotRatio` 必须在 `(0, 1]`。所有
source 使用 open triangle soup：合法 Heightfield/static sheets 不要求 watertight/manifold closure；
trust boundary 只拒绝未知字段、非有限/非整数或越界数据、不成三元组的 indices、重复 Surface ID
和 3D 零面积 triangle。垂直面的 XZ 投影允许退化，并由 normal admission 排除；绝不能把 open
sheet 当作“non-closed input”拒绝。

#### 9.1.2 Canonical bytes 与 Babylon Float32 boundary

`emitTransformedStaticColliderTriangleMeshV1()` 的 JavaScript double world positions 是 Graph
`StaticColliderSourceV1`、共享 query 和 canonical geometry hash 的唯一字节。Traversal-Recast
必须把 `worldPositionsMetersXYZ` 原值映射到 `triangleSoup.positionsMetersXYZ` 并原样复制 indices；
不得用 Babylon/Havok round-trip 后的值替换。Babylon 9.21.2 默认 Matrix 使用 Float32，因此
任意非正交 TRS 与 canonical double 数学等价但不保证 byte-exact。该差异只由 Task 7 的私有
Runtime Adapter conformance tolerance 所有：

```ts
const FLOAT32_MATRIX_RELATIVE_EPSILON_V1 = 2 ** -23;
operationMagnitudeMeters =
  Math.abs(canonicalTranslationMeters[axis]) +
  Math.abs(canonicalLinearTransform[axis][0] * localPositionMetersXYZ[0]) +
  Math.abs(canonicalLinearTransform[axis][1] * localPositionMetersXYZ[1]) +
  Math.abs(canonicalLinearTransform[axis][2] * localPositionMetersXYZ[2]);
allowedDeltaMeters =
  0.000001 +
  2 * FLOAT32_MATRIX_RELATIVE_EPSILON_V1 * Math.max(1, operationMagnitudeMeters);
```

`operationMagnitudeMeters` 必须从 canonical double Transform 与 local vertex 计算；不得从已量化的
Babylon result、最终坐标绝对值或观测 delta 反推，否则大平移与相反 local offset 的 cancellation
会得到过小 tolerance。

该 tolerance 不得进入 Canonical Schema、query epsilon、CLI/Browser、Snapshot、Receipt、
Profile 或任何 hash。Task 7 必须通过非正交 multi-axis Euler + non-uniform scale fixture 验证
Babylon/Havok geometry 与 canonical emitter 在此 tolerance 内；fixture 必须覆盖普通尺度以及
100m、1km、10km 大平移 cancellation，错误 Euler composition/order 仍须失败。Task 7 删除当前
duplicate `verticalTriangleHit()` 与 downward-normal flip。

### 9.2 Runtime classifier

Heightfield 与 Static Surface 必须先从 Execution Plan 产生完整 canonical JavaScript-double source
inventory，再一次调用 `queryCanonicalTraversalSurfaceHitsV1()`。该 shared query 是 Graph 与 Runtime
唯一 semantic projection；Babylon Mesh/Float32 geometry 只用于上述私有 conformance test，不能
成为第二个 owner。分类规则：

1. raw `UNSUPPORTED` → `surfaceResolution.mode = "unsupported"`；
2. dynamic support → `unmatched`，因为 R1b 只承诺静态图；
3. Heightfield 与全部绑定 Static Surface 使用同一次 canonical source query；
4. `sampleTriangleHeightfieldSurface()` / static support compatibility facade 只能委托 shared
   package-private single-triangle leaf，不得保留独立 barycentric epsilon、vertical query 或 normal
   flip；
5. 支撑在未声明 Surface 的 Collider 上 → `unmatched`；
6. 一个有效 Surface candidate → `resolved`；
7. 多个 admitted interior 或内部重叠 candidate → `ambiguous`；多个 boundary-only 按半开 ID
   owner 解析；
8. classifier 不修改 Ground/Air、velocity、Controller pose 或 Physics body。

该 tie-break 基于稳定 Canonical ID，不依赖 Mesh/Collider 数组顺序；它只选择 Evidence 的
Surface owner，不创建支撑或改变物理。

Reset/Rebind 后必须清空 retained sample；Probe reset/rebind 同时把私有
`supportStationDistanceMeters` 恢复到起点。owner 由每次 retained sample 和 Canonical ID 纯函数
计算，不保存第二份 seam 状态。第一次合法 support query 重新建立证据。30/60/120 Hz-like
render cadence 不得改变 Surface sequence、Probe receipt 或最终状态。

## 10. Validation 与诊断

R1b 复用现有 `ValidationReportV2`、Route Graph Gate、Route Runtime Gate、Evidence Artifact
和 Browser V5 read-only projection。CLI/Browser 不增加 Graph build、arbitrary query、调参或
Provider API。

现有诊断语义继续成立：

- `ROUTE_STEP_HEIGHT_EXCEEDED`：唯一保守证据是跨阶超过锁定步高；
- `ROUTE_SLOPE_EXCEEDED`：显式坡道超过锁定坡度；
- `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT`：踏面/走廊侵蚀后不足；
- `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT`：平台上方净空不足；
- `ROUTE_SURFACE_GAP_EXCEEDED`：Collider-backed Surface 之间存在不可跨 gap；
- `ROUTE_SURFACE_PROFILE_MISSING`：Route 必需的 Collider 没有兼容 Surface Binding；
- `ROUTE_SURFACE_CORRELATION_MISSING`：Graph candidate Node 无法回查到锁定的 Canonical Surface；
- `ROUTE_SURFACE_CORRELATION_AMBIGUOUS`：Graph candidate Node 同时命中多个 admitted interior
  Surface，或 preflight 发现 same-band interior overlap；
- `ROUTE_GRAPH_BUDGET_EXCEEDED` +
  `traversal-surface-triangle-pair-test-budget-exceeded`：preflight 尝试访问 Profile 上限后的第一个
  candidate pair；`maximumAllowedCount` 是锁定 Envelope 值，`minimumRequiredCount` 固定为其加一；
- `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`：真实支撑为 unmatched、ambiguous 或错误 Surface；
- `ROUTE_RUNTIME_SUPPORT_LOST`：连续 raw `UNSUPPORTED` 超过 Validation Profile 容差；
- `ROUTE_RUNTIME_STALLED` / `ROUTE_RUNTIME_DEVIATED`：真实 Controller 卡住或离开 hard-ribbon。

专用原因只有在 Rejection Proof Graph 证明放宽一个且仅一个关闭原因即可恢复连通时发布；
混合原因、预算耗尽或证明不唯一仍返回通用不可达/不完整结果。

## 11. Golden 与对抗 Fixture

R1b 新增 `examples/traversal/r1b-static-platform/`，至少包含：

| Fixture | Graph 预言 | Runtime 预言 |
| --- | --- | --- |
| `success-steps-platform-ramp` | complete | 到达；0.25m step 通过 |
| `fail-step-height` | `ROUTE_STEP_HEIGHT_EXCEEDED` | 不以 Runtime 成功抵消 Graph failure |
| `fail-surface-gap` | `ROUTE_SURFACE_GAP_EXCEEDED` | 不运行伪造通过路径 |
| `fail-narrow-tread` | `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT` | 不运行 |
| `fail-low-overhead` | `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT` | 不运行 |
| `fail-missing-surface-profile` | `ROUTE_SURFACE_PROFILE_MISSING` | 不运行 |
| `fail-wrong-collider-binding` | 编译/Graph fail closed | 不创建 Runtime Port |
| `fail-wrong-runtime-surface` | Graph complete | `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH` |
| `fail-platform-edge-fall` | Graph complete fixture injection | `ROUTE_RUNTIME_SUPPORT_LOST` |
| `fail-overlapping-surfaces` | `ROUTE_SURFACE_CORRELATION_AMBIGUOUS` | Graph fail 后不运行 |
| `fail-runtime-overlapping-surfaces` | complete fixture injection | Runtime `ambiguous` 不能通过 |

锁定人形 Profile 的 `maxStepHeightMeters = 0.3`：

- 0.25m 垂直 step 必须 Graph + Runtime 双通过；
- 0.35m 垂直 step 必须失败；
- Fixture 从 Lock 断言该阈值，不在 Driver/Validation/Surface Profile 复制 `0.3`；
- Profile 版本变化时 Fixture 显式保留旧 Ref/hash 或同步更新，不默默漂移。

独立 adversarial tests 还必须覆盖：

- Static Surface/Collider 数组反序、Provider tile/polygon 反序，Canonical hash 不变；
- R1 Heightfield `traversalSurfaceId` 与现有 Compiler 输出逐字节相同；
- 同一 Prototype 的两个 Object 实例分别精确绑定自己的 Collider 行，不增加同义字段；
- Path 从 Heightfield Node 进入 Platform Node 后允许 Surface 随当前 Edge 改变；错误的第三
  Surface、未绑定 Collider、`unmatched` 与 `ambiguous` 仍失败；
- Driver lookahead 为 2.4m 且主体仍在台阶前时，3D support station 仍允许 Heightfield；
  平台段同 XZ 下方的 Heightfield 支撑必须 mismatch；A→B→C 精确 seam 只保留相邻 tied
  segment 的 Surface；
- 平台 footprint 下方保留 Heightfield 时，Node Y 分别解析到上/下层，不采用 highest-Y；
- 真实 Recast 按 slope mark → unique candidate triangle area → blocker triangle area →
  rasterize/compact → blocker compact span null 的顺序执行；0.15m contour simplification 下相邻
  共面 Surface 仍不产生跨 source range polygon；
- 改 Collider geometry、Binding、Profile 或 Placement，相关 child/root hash 必变；
- bounded Terrain 的扩大/缩小/平移/asymmetric/`-0` forged bounds 由 adversarial fixture 直接用
  `sha256CanonicalJson` 构造攻击者 Terrain/Geometry preimage 与 Input root，并组装 forged Receipt；所有公共
  Terrain/Build Input/root/Receipt admission-aware 入口仍分别失败。只改 exclusion declaration 时
  `routeBuildInputHash` 必变而 geometry artifact Hash 不变，Receipt root 必须等于唯一
  `hashRouteBuildInputV2()`；
- empty Terrain + 非空平台/Static Collider 必须执行真实 budget/Provider build，不能发布
  `empty-heightfield-source` 或 `not-required-empty-geometry`；
- forged Surface → Collider identity、stale lock、mixed-world evidence fail closed；
- exact seam、微小 gap、coplanar overlap、stacked overlap 的不同结果，Graph/Runtime 各自 band
  必须记录并命中相同拓扑分类；
- `SLIDING` 仍算有 support，不误报 Support Loss；
- Reset、Rebind、两实例并发、创建中 throw、cleanup throw；
- 30/60/120 Hz-like cadence 得到相同 tick/evidence/final-state hash；
- V2 terrain/collider/geometry/surface child-root hash 全部重算；Browser V5 只发布 V2 ordered
  Surface identities，Overlay/Path 同名数组必须 byte-equal 且顺序对齐 Graph inventory，不保留
  path-global alias；Controller contact band 继续由 Runtime Adapter
  Live Lock 核验，不扩展 Physics Body Profile；
- Canonical Schema、CLI、Browser、Report、Snapshot 不得出现未审计的 Provider handle、内部
  name、raw error 或原生 path；R1 已冻结并审计的 Runtime Backend/Adapter Resource Ref 与
  Snapshot Backend identity 继续允许，不能用宽泛字符串扫描误伤这些锁定身份。

## 12. 工程边界与模块职责

预计修改边界如下；实施计划必须再给出精确文件和 TDD 顺序：

- `@whitebox-world/authoring`：Prototype Binding、Profile Ref admission、Canonical resource lock；
- `@whitebox-world/compiler`：Static Surface 编译、Surface/Collider exact binding；
- `@whitebox-world/runtime-contracts`：Execution Surface union；
- `@whitebox-world/terrain-surface`：共享 Static Collider emitter 与 boundary/interior query；
- `@whitebox-world/traversal`：Surface Profile、Route Build Input V2、strict canonical receipts；
- `@whitebox-world/traversal-recast`：多 source build、canonical Surface correlation、Graph projection；
- `@whitebox-world/runtime-babylon`：同一次 retained support 的 Static Surface correlation；
- `@whitebox-world/validation`：只复用/补齐已冻结 Diagnostic 映射，不新建 Report；
- trusted host/scripts：R1b fixtures、blocking verifier、CLI/Browser same-byte publication。

禁止为了 R1b 修改 `sdk-world-adapter.ts`、Camera、Animation、Control Feel 或渲染架构。
Recast/Babylon/Havok 类型和原生 Handle 只能留在 adapter/runtime 私有实现。

## 13. 门禁与完成定义

新增阻断命令：

```bash
pnpm verify:route-r1b-static-platform
```

该命令必须：

1. 先证明 R0 与 R1 Heightfield contract/gate 仍绿；
2. 精确运行全部 R1b Golden oracle；
3. 运行真实 Recast build 与真实 Babylon/Havok fixed-tick Probe；
4. 比较重复与并发执行的 Graph/Path/Probe/Report hashes；
5. 运行 30/60/120 Hz-like cadence；
6. 证明 wrong Surface/Collider、seam、support loss 和 cleanup adversarial checks 被执行；
7. 扫描 Canonical Artifact、CLI JSON、Browser projection、Report、Snapshot 中未审计的
   provider handle、内部 name、raw error 和原生 path，同时证明已锁定 Backend/Adapter
   Resource identity 没有被误报；
8. 输出机器可读的 fixture、gate、hash 和 adversarial check inventory。

完成前还必须通过：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

只有以下全部成立才能关闭 R1b 和 M5：

- R1 Heightfield 无语义回归；
- Static Surface/Collider/Graph/Runtime 共享同一 provenance；
- 0.25m success 与 0.35m failure 双层证据成立；
- seam、净空、错误身份和边缘跌落被 Blocking Gate 正确拒绝；
- 无 open P0/P1；
- 全维度 review 与 Runtime deep review 已记录；
- README、Route 总规格与 `docs/18` 同步标明 M5 完成、H1/H2/H3 仍开放。

R1b/M5 完成不等于 SDK 已支持桥梁双层、洞穴、动态平台、NPC 或公开导航命令。
