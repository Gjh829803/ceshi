# Babylon Block Settlement 与真实台阶闭环设计

- 状态：Accepted implementation design
- 日期：2026-08-31
- 上位设计：[Babylon Native Block Whitebox 创作 Profile](./2026-08-28-babylon-native-block-whitebox-profile-design.md)
- Native 权威：[AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- 里程碑：[WRC-1 World Reconstruction and Control](./2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)
- 输入分支：`codex/bwb3-block-capture@74774e98`、`codex/bwb4-block-colliders@6b9350a`

本文关闭 BWB-3、BWB-4 之间尚未证明的核心链路，并给 BWB-5 的真实台阶 Corpus 建立唯一施工合同：

```text
one Block Session
  -> one Checked Layout
  -> one finalize
  -> visual Mesh + no-gap Collider proxy
  -> Host-only settlement and Scene membership census
  -> one frozen Contribution / WorldPackage
  -> SDK-owned Havok Character traversal
```

它不增加 Native 专用 Package、不公开 Module 自证 callback、不持久化 Block Manifest，也不创建第二套
Physics、Ground Support、Route、Camera、Input 或 Tick 权威。

## 1. 问题与已证事实

BWB-3 已证明 Block Profile 能从检查后的 Layout 生成稳定视觉分组、display gap 和 opening/top/side
authoring screenshots。BWB-4 已证明独立 no-gap Box proxy 经 Native Registration、WorldPackage 和 BNA-4
Runtime 可以进入真实 Havok，并能阻挡超过 Character `maxStepHeightMeters` 的障碍。

二者尚不能相加为集成结论：

- BWB-3 的 `finalize()` 冻结 DTO，却继续暴露 live `Mesh`；Module 可在 finalize 后、build settle 前修改或
  dispose visual Mesh。
- BWB-4 fixture 手工创建 records、Layout 和 Check，绕过 Block Session 与 BWB-3 visuals。
- BWB-4 adapter 并列接收 `layout`、`checkResult`、`records`，允许不同 Epoch 的对象被拼接。
- BNA Candidate 目前只重验登记后的 Collider proxy，不验证 source visual Mesh、完整 Block inventory 或
  Profile 外直接创建的额外 Mesh。
- 当前 `half` 高度是 `0.5m`。标准 Subject 的 `maxStepHeightMeters` 为 `0.3m`，因此它只能证明阻挡，不能
  证明正常台阶通过。

安装版本的 Babylon `9.23.0` Character Controller 把 `maxStepHeight` 作为严格上限；仓库既有真实 Havok
测试已经证明 `0.3m` 上限能越过 `0.25m` Box。BWB-5 必须在正式 Block Profile -> Package -> Runtime 链
重做这一证明，不能用普通 Babylon Box、ramp、隐藏平面或 DTO-only 测试代替。

## 2. 方案比较与裁决

### 方案 A：让 Module 返回 `validate()` 或 settlement callback

拒绝。Module 同时创建对象和证明对象正确，形成不可信代码自证；callback 还会把 Host 生命周期重新暴露
给场景代码，并形成 `build()` 之外的第二执行阶段。

### 方案 B：把完整 Block Layout/Manifest 持久化到 Package

拒绝。它会恢复逐几何 JSON、Block Compiler 或第二视觉协议。Runtime 可能开始同时读取 Manifest 与
Contribution，违背 Native Module 是唯一视觉源、Contribution/Havok 是唯一物理源的原则。

### 方案 C：Profile-private batch + Host snapshot + opaque receipt

采用。Block Profile 在唯一 `finalize()` 中从同一 Checked Layout 构造 visuals 和 Collider proxies，然后通过
`@whitebox-world/native-babylon/host` 的非 root 导出提交一个完整 target batch。Host 只保存 Babylon handle
到 build settle，随后重验 Mesh fingerprint 和 Scene membership，并把不可逆 hash receipt 放进既有
Contribution。Module 不能导入 Host subpath，也不能手写 batch、verdict 或 disposer。

该方案只增加一次 Build-time settlement，不增加 Runtime 状态：Layout 在 Build 后释放；Package 只保留
opaque receipt 和 Collider Contribution；Runtime 继续重放 Module、重算整个 Contribution 并 exact-match。

## 3. 三类 Profile 身份 current-only 消歧

以下身份正交，不得互相替代：

| 字段 | 唯一含义 | 当前值示例 |
| --- | --- | --- |
| `nativeSceneProfileRef` | Native authoring/import/budget/check Profile | `whitebox.standard@1`、`whitebox.blocks@1` |
| `trustProfileRef` | Scene Authoring 来源/准入 provenance | `trusted-local@1` |
| `nativeExecutionTrustProfileRef` | 本次执行环境信任 | `trusted-local@1`、`hosted-isolated@1` |

`worldkit://native-scene-profile/trusted-local@1` 是把创作 Profile 与 Trust 混为一谈的旧 fixture 值，必须
current-only 删除。所有普通 Native fixture 使用 `worldkit://native-scene-profile/whitebox.standard@1`；
Block Module 使用 `worldkit://native-scene-profile/whitebox.blocks@1`。不保留 alias、迁移 parser 或双字段。

## 4. 唯一 Owner 与数据流

### 4.1 Block Profile Owner

`@whitebox-world/native-babylon-block-profile` 独占：

- Block 输入、shape/palette/group、Collider selection；
- 一次 Layout 派生和一次 Check；
- visuals、display gap、Profile materials；
- 从同一 Layout 创建独立 no-gap Collider proxies；
- 完整 Profile inventory 和 deterministic inventory hash；
- 单一 `finalize()` 生命周期及 Profile-owned partial cleanup。

它不拥有 Host verdict、Contribution parser、Package identity、Havok、support、Character 或 Runtime cleanup。

### 4.2 Native Host Owner

`@whitebox-world/native-babylon` 独占：

- Candidate-specific settlement recorder；
- Profile batch exact-key snapshot 与首次失败保留；
- build settle 后 visual target fingerprint 重验；
- `whitebox.blocks@1` Scene Mesh membership census；
- opaque settlement receipt 创建；
- 与现有 Collider drift、authority audit、Contribution publication 的原子顺序。

Recorder 用 `WeakMap<BabylonNativeSceneBuildContextV1, Recorder>` 绑定 active Candidate。它不是公开 token；
build 关闭后立即 unbind，late commit fail closed。

### 4.3 Runtime/Package Owner

`@whitebox-world/runtime-contracts` 定义 Babylon-free settlement receipt；WorldPackage 把它包含在现有
Contribution Hash/bytes/root 中。正式 Runtime 仍只接受整个 replayed Contribution 与 packaged
Contribution exact equal；它不解析 Block Layout，也不新增 Profile-specific Runtime 分支。

## 5. current-only 接口

### 5.1 Host-only settlement input

仅从 `@whitebox-world/native-babylon/host` 导出：

```ts
interface BabylonNativeProfileSettlementTargetV1 {
  readonly elementId: string;
  readonly mesh: Mesh;
  readonly collisionBinding:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "static-collider";
        colliderId: string;
      }>;
}

interface BabylonNativeProfileSettlementBatchV1 {
  readonly kind: "babylon-native-profile-settlement-batch";
  readonly schemaVersion: 1;
  readonly profileRef: string;
  readonly profileInventoryHash: `sha256:${string}`;
  readonly targets: readonly BabylonNativeProfileSettlementTargetV1[];
}

function commitBabylonNativeProfileSettlementV1(
  context: BabylonNativeSceneBuildContextV1,
  batch: Readonly<BabylonNativeProfileSettlementBatchV1>,
): void;
```

不接受 caller-supplied Build Epoch ID：active Epoch 已由 Context WeakMap 唯一确定。函数返回 `void`，没有
validator、callback、receipt、Host verdict 或 disposer。

Module source admission 继续拒绝直接 import `/host`。只有 Block Profile Package 内一个精确文件可静态导入
该函数；Profile root 不 re-export Host DTO/函数。Bundle graph 与 package-boundary test 同时证明无旁路。

### 5.2 Profile finalize

```ts
interface BabylonNativeBlockProfileFinalizeInputV1 {
  readonly displayGapMeters?: number;
  readonly staticColliders:
    readonly BabylonNativeBlockStaticColliderSelectionV1[];
}

interface BabylonNativeBlockFinalizedEpochV1 {
  readonly kind: "babylon-native-block-finalized-epoch";
  readonly schemaVersion: 1;
  readonly checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  readonly visualGroups:
    readonly BabylonNativeBlockVisualGroupInventoryV1[];
  readonly colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  readonly profileInventoryHash: `sha256:${string}`;
}

interface BabylonNativeBlockProfileSessionV1 {
  createBlock(input: Readonly<BabylonNativeBlockCreateInputV1>): Mesh;
  finalize(
    input: Readonly<BabylonNativeBlockProfileFinalizeInputV1>,
  ): BabylonNativeBlockFinalizedEpochV1;
  dispose(): void;
}
```

删除 BWB-3 分离的 public `createBabylonNativeBlockVisualsV1()` 和 BWB-4 可被任意对象拼接的 public
`createBabylonNativeBlockColliderCandidatesV1()`。实现可保留 package-private 小函数，但 root 只有一个
finalize 入口。`authoring-capture` 消费 `BabylonNativeBlockFinalizedEpochV1`，不能重新 derive Layout。

### 5.3 持久 settlement receipt

```ts
type BabylonNativeProfileSettlementReceiptV1 =
  | Readonly<{
      kind: "none";
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1";
    }>
  | Readonly<{
      kind: "host-snapshot";
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1";
      targetCount: number;
      profileInventoryHash: `sha256:${string}`;
      settledVisualHash: `sha256:${string}`;
    }>;
```

`BabylonNativeSceneContributionV1.profileSettlement` 是 required current-only 字段：standard Profile 必须 exact
`none`；blocks Profile 必须 exact one `host-snapshot`。Contribution parser 重算 canonical shape，不接受
missing、extra、unknown Profile 或 alias。

`settledVisualHash` 覆盖按 `elementId` 排序后的 actual world-space positions、indices、visible/enabled flags 与
Collider join；不包含 Material、shader、texture 或 Babylon handle。真实几何继续只由
`staticColliders` 持久化；receipt 不可逆，不能成为第二几何源。

## 6. inventory 与 Scene membership

`profileInventoryHash` 覆盖：

```text
profileRef
displayGapMeters
sorted blocks:
  id, shape, paletteRole, visualGroupId,
  centerMetersXYZ, rotationQuarterTurnsY, sizeMetersXYZ
sorted collider joins:
  blockId, colliderId
```

targets 的 `elementId` 集合必须 exact equal 全部 Layout block IDs，包括未分组 ground/route。missing、extra、
duplicate、Profile mismatch、Collider join mismatch 均拒绝。

这仍不足以发现 Module 直接调用 Babylon API 创建的额外 Mesh。因此 `whitebox.blocks@1` 在 build settle 后
执行 identity-only Scene census：

```text
live geometry Mesh set
  === settlement source target Mesh set
      union registered independent collider proxy Mesh set
```

两集合必须 disjoint。source target 必须是 visible structural Mesh；Collider proxy 必须已登记、不可见且与
对应 target 不同。额外 Mesh、丢失/已 dispose target、把 visual Mesh 直接登记为 Collider 均以
`WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH` 失败。

该 census 只检查 Mesh object membership/ownership，不从 Scene 反推 Layout、palette、group、Collider 或
geometry truth，因此不是第二场景权威。Material、Light、TransformNode 不进入 V1 inventory；未来 Block
Profile 若允许 asset visual，必须先增加 closed target kind，不能用 scene-scan allowlist 例外。

## 7. 单一 finalize 与原子顺序

```text
module.build(context)
  -> session.createBlock(...)
  -> session.finalize({ displayGapMeters, staticColliders })
       1. open -> finalizing; snapshot inputs/selections
       2. derive Layout exactly once; Check exactly once
       3. validate complete inventory and every display gap before allocation
       4. create/register independent no-gap proxies from same CheckedLayout
       5. exact pre-style recheck every source Mesh
       6. apply visual gap/materials
       7. compute profileInventoryHash
       8. commit one Host-private complete target batch
       9. freeze finalized epoch; release mutable Maps
  -> register exact Spawn
  -> build resolves undefined

Host after build settle
  -> close registration and settlement recorders
  -> surface retained first registration/settlement failure
  -> require exact settlement kind for bootstrap.nativeSceneProfileRef
  -> recheck each source visual target
  -> recheck existing Collider proxies/bindings
  -> run blocks Scene membership census
  -> create settlement receipt
  -> freeze one Contribution and hash
```

Profile Checker failure发生在第一个 visual material 或 Collider proxy allocation 前。最后一个 fallible Profile
步骤是 Host settlement commit；之后 `finalize()` 只冻结返回值。

## 8. drift、错误与 cleanup

Host commit-time 与 build-settle-time 都验证：same Scene、ordinary direct `Mesh`、`parent === null`、无 instance/
thin instance/provider physics、finite indexed geometry/world matrix、alive、visible/enabled 状态。position、
rotation、scaling、parent、vertices、indices、scene、dispose、visibility、enabled 任一漂移都以稳定
`WORLDKIT_NATIVE_SCENE_PROFILE_TARGET_DRIFT` 拒绝，即使 Collider proxy 没变。

Profile `finalize()` 使用一个 acquisition stack。失败时逆序：detach source materials、dispose Profile
materials、dispose newly created proxy、dispose source Mesh；throwing disposer 不截断后续清理，最终保留第一
错误。已登记 proxy 仍由 Candidate Scene/Host lease owner兜底销毁，Profile 不创建第二 Runtime disposer。
Session `dispose()` 只是 Profile-local authoring/build cleanup 能力；成功 `finalize()` 不会把 Babylon handle
转移给 settlement/Contribution，也不会使 Session 成为 Runtime disposer。若 Module 在 Host recheck 前主动
dispose 已结算 Mesh，Candidate 必须以 target drift/inventory mismatch fail closed；正式生产路径最终仍由
Candidate Scene/Host lease 聚合释放。Host settlement 只消费冻结快照，成功 Contribution/Package 不持有
Babylon handle。

Host settlement commit 的错误即使被 Module catch 也必须保留。Candidate admission `finally` 关闭并解绑
recorder。成功 Contribution/Package 不持有 Babylon handle。

## 9. 真实台阶 clean break

`whitebox.blocks@1` 直接切换为唯一当前合同：

```ts
const BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1 =
  [0.5, 0.25, 0.5] as const;
const BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1 =
  [0.25, 0.125, 0.25] as const;

type BabylonNativeBlockShapeKindV1 =
  | "full" | "half" | "quarter" | "small" | "step";

step: [1, 0.25, 1]
```

删除 scalar `MICRO_GRID`、scalar `CENTER_LATTICE`、`structuralHalfMeterTransition*` 和所有固定 0.5m
diagnostic。新结构 transition 只把一个 `0.25m` Y layer 称为 `structuralStepTransition`，仍不宣称角色可走。

`displayGapMeters` 必须逐 shape 满足 `0 <= gap < min(sizeMetersXYZ)`；不能继续全局 `<0.5m`，否则
`step` 可能出现零或负缩放。X/Z 不改成 0.25m，避免 occupancy 最坏扩大八倍；不新增 ramp proxy 或任意
metric box DSL。

## 10. BWB-5 首个真实 Havok Fixture

同一 Layout 沿 `-Z` 建单通道：

1. spawn ground top `0m`；
2. 至少两个连续 `step` block：首个相对 ground rise `0.25m`，后续同标高块共同形成不少于 `2m`
   的 elevated tread；
3. elevated platform top `0.25m`；本 fixture 只证明一个真实 `0.25m` riser，不把同标高 tread 误记为
   第二次上升；
4. 末端 `half` blocker base `0.25m`、top `0.75m`，relative rise `0.5m`；
5. 侧面保留 ledge departure。

每个 proxy 必须是独立 Box、8 vertices/12 triangles、`proxyKind = layout-block-volume`，bounds 与 source
Layout 完全一致。Fixture 和 Contribution 禁止 wedge/ramp/倾斜 triangle、隐藏 foundation 或额外 collider。

真实证据必须经过：Block Session finalize -> Candidate admission -> verified WorldPackage -> BNA-4 Runtime ->
SDK-created `PhysicsShapeMesh` -> installed Havok -> Character fixed ticks。验收：

- verified Bootstrap 的 `maxStepHeightMeters === 0.3`；
- Subject 越过 `0.25m` riser，抵达 elevated platform 且 `movementMedium === "ground"`；
- 长时间推进仍停在 `0.5m` blocker 前；
- elevated tread 下无其他 support，结构绑定与 vertical Havok ray 证明唯一支撑面；不新增 Runtime ray/AABB
  ground owner；
- Reset/rebind 后相同 input 产生相同 committed projection/hash；
- 侧向离台后进入 `air`；
- Runtime/Candidate dispose 后 Collider Mesh、Scene、Engine 全部释放。

两次独立 admission 的 Contribution/hash 相等；两次 Package build 的 root/build identity 相等。仅普通
Babylon Box conformance、vertical ray 或截图通过都不能单独算 BWB-5 traversal pass。

## 11. 文件责任边界

### BNA Host / Runtime Contracts

- `packages/native-babylon/src/profile-settlement.ts`：Host recorder、snapshot/recheck、receipt projection。
- `packages/native-babylon/src/host.ts`：host-only export；root 不导出。
- `packages/native-babylon/src/candidate-admission.ts`：settlement lifecycle、Scene census、Contribution assembly。
- `packages/runtime-contracts/src/native-scene-contribution.ts`：required persistent receipt union。

### Block Profile

- `session.ts`：唯一 finalize orchestration。
- `babylon-visual-adapter.ts`：package-private pre-style recheck/material application。
- `collider-contribution.ts`：package-private same-CheckedLayout proxy materialization。
- `profile-settlement.ts`：inventory/hash/batch assembly；唯一允许 import Native Host subpath 的文件。
- `authoring-capture.ts`：只消费 finalized epoch。
- `shapes.ts`、`layout.ts`、`check.ts`：anisotropic grid 与 `step` clean break。

### Integration evidence

- `scripts/verification/bwb4-block-collider-runtime.test.ts`：升级为同一 Session/finalize 的正式 Havok chain。
- BWB-3 authoring capture evidence：继续证明 local visual grouping，不冒充 formal BNA-7 Capture。
- BWB-5 corpus：在 BNA-6 score profile 冻结后扩展山地/T 字/建筑/有限室内 cases。

## 12. 对抗矩阵

必须 RED -> GREEN 覆盖：

- missing/duplicate/late/malformed settlement batch；Module catch 仍拒；
- Profile ref/inventory/target/Collider join drift；
- direct extra Mesh、target/proxy identity overlap、disposed target、foreign Scene；
- commit 后 position/rotation/scaling/parent/vertices/indices/visibility/enabled/dispose drift；
- reversed Block/selection order产生 byte-identical inventory/Contribution；
- Nth proxy/material/commit failure 的逆序 cleanup 与 throwing disposer；
- standard Profile 不套 blocks census，但必须生成 exact `none` receipt；
- `trusted-local` native-scene-profile 零生产/fixture 命中；
- step grid/lattice/overlap/display-gap boundaries；
-真实 Havok `0.25m pass + 0.5m block + ledge air + reset/hash + cleanup`。

## 13. 任务图

| ID | Goal / deliverable | depends_on | blocks | Exclusive ownership / I-O | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| BWS-00 | 冻结本文、Profile identity clean break 与 settlement contracts | BNA-4, BWB-2 | BWS-10..60 | docs only; current branches -> accepted contracts | spec self-review、link/diff | main-agent-only |
| BWS-10 | Host-private recorder、required receipt、Scene census | BWS-00, BNA-5 main | BWS-20, BWS-30 | native-babylon/runtime-contracts; active context + batch -> receipt | exact-key/drift/census/cleanup RED | main-agent-only |
| BWS-20 | 融合 BWB-3/BWB-4 为单 Session/finalize | BWS-10 | BWS-30, BWS-40 | block-profile; calls/selections -> finalized epoch | same-object、one derive、visual/proxy cleanup | sequential |
| BWS-30 | Contribution/WorldPackage/Runtime replay exact settlement | BWS-10, BWS-20, BNA-3/4 | BWS-50 | existing Package/Runtime owners; finalized epoch -> verified replay | tamper、pre-Havok mismatch、two replay | main-agent-only |
| BWS-40 | anisotropic grid + `step` current-only clean break | BWS-20 | BWS-50 | block shapes/layout/check only | grid/lattice/overlap/gap/zero legacy census | sequential |
| BWS-50 | one real Havok pass/block/reset/ledge/cleanup fixture | BWS-30, BWS-40 | BWB-5 corpus | verifier only; verified Package -> runtime evidence | installed Havok, fixed ticks, exact geometry | sequential |
| BWS-60 | focused gates、Cloud review、docs truth、PR/main | BWS-50 | BWB-5, BNA-8 | review/status only | exact-SHA full relevant gates + independent review | main-agent-only |

Architecture、cross-package contracts、BWS-10/30/60 与最终集成由主 Agent 独占。BWS-20 与 BWS-40 只有在
上游 DTO 冻结后才可分派；任何 worker 成功报告都不是集成证明。

## 14. 非目标与完成边界

本闭环不实现：

- BNA-7 formal Capture/Route；
- BNA-6 AI 生成成功率与 repair score；
- Thin Instance/Chunk/Collider coalescing（BWB-6）；
- arbitrary metric block、ramp、dynamic body、moving platform、multi-level navigation；
- exact Material/shader receipt；
- Hosted production vendor deployment。

BWS-60 通过后，只能宣布 BWB-3 visual baseline、BWB-4 Collider/Havok contribution 和 BWB-5 stair
prerequisite 正式闭合。山地、T 字、建筑、有限室内完整 Corpus 仍由 BWB-5 后续 cases 与 BNA-6 score
一起裁决。

## 15. 最终原则

> 一个 Module 可以自由写 Babylon，但选择 `whitebox.blocks@1` 后必须由同一个 Profile Session 完整登记
> 它的结构 Mesh；一个 Host settlement 关闭视觉漂移和漏报；一个 Contribution/Package 绑定证据；一个
> SDK/Havok Kernel 决定角色是否真的能走。
