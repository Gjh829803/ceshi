# Gameplay 对接协议冻结版（G19-6 发布候选）

> 状态：**Canonical Gameplay Domain Schema 已冻结；G19-6 已 Final GO、merge-ready，尚未合入 main**
> 面向：调用 SDK 的程序、CLI/Browser Driver，以及负责写对接代码的 AI Agent
> 对接版用途：允许下游按冻结 DTO 开发；真实 Browser 调用必须使用包含 G19-6 的 SDK commit 且 `ready()` 成功
> 清理条件：G19-6/G19-7/G19-8 及后续独立能力 Gate 分别通过后，按 §8 删除对应临时说明；
> 保留已冻结的 Command、Receipt、Event 与 World State Domain Schema 说明。

## 0. 先读：Final GO 不等于已经合入 main

本对接版冻结了 **Canonical Gameplay 合同**。G19-6 候选分支已经实现 Browser V5 exact facade、
Snapshot V4、RuntimeHost Activity，以及 Authoring/CLI/Capture/Take consumer cutover；最终全量门禁和
完成审查已经通过，仅 main 合入尚未执行。下游可以立即提交以下代码，并且正式版不会要求改写其 JSON：

- `GameplayCommandV1` 的构造、exact-key 校验和幂等 Command ID 管理；
- `GameplayCommandReceiptV1`、`GameplayEventV1`、`WorldStateSnapshotV1` 的解析与业务分支；
- `control.bind` / `control.release` 的状态机与 stale Session/possession 处理；
- 使用 fake transport 或 fixture 的调用方单元测试。

下游现在**不要**仅凭本文宣称线上可用。真实调用的判断条件是：checkout 已包含 G19-6 的最终合入
commit、SDK 导出的 `WorldkitBrowserApiV5` exact 类型包含该方法，并且 Runtime `ready()` 成功；不要
根据示例接口、对象上偶然存在的内部方法或 feature detection 结果猜测生产能力。

| 名称 | 状态 | 权威来源 | 可用门槛 | 下游动作 / 清理条件 |
|---|---|---|---|---|
| Command / Receipt / Event / World State Domain Schema | `implemented` | `@whitebox-world/gameplay-contracts` | 当前对接版 commit | 现在即可对接并长期保留 |
| RuntimeHost command、journal、World State artifact | `implemented-internal` | `@whitebox-world/runtime-host` | SDK 内部测试 | 下游不直接 import Host |
| Babylon Gameplay World Port | `implemented-internal` | `@whitebox-world/runtime-babylon` | G19-5 门禁 | 下游不直接 import，不依赖 internal Symbol |
| Browser V5 Gameplay facade | `merge-ready` | `@whitebox-world/runtime-contracts` + G19-6 Browser bridge | G19-6 Final GO | 可在候选分支联调；正式依赖等待 main 合入 |
| `WorldRuntimeSnapshotV4` | `merge-ready` | `@whitebox-world/runtime-contracts` | G19-6 Final GO | 直接导入类型，不手写或持久化本地猜测形状 |
| Action Presentation / 多 Controller 输入调度 | `future-not-frozen` | 后续独立设计 | 独立 Gate | 不猜字段，不创建本地协议 |

对接 AI 开始工作前必须在自己的 checkout 执行以下基线门禁；任一命令失败就停止生成代码并先同步
`origin/main`：

```bash
git fetch origin main
git merge-base --is-ancestor 630d0bf2c49d35523e436212bc9ed5e2a7a20c92 HEAD
test -f docs/20-gameplay-integration-preview-contract.md
pnpm typecheck
```

其中 `630d0bf2c49d35523e436212bc9ed5e2a7a20c92` 只保证 Canonical Domain Schema，不包含 G19-6 的
真实 Browser cutover。要发起 Browser 调用，必须继续同步到 G19-6 最终合入 commit；不得从旧 checkout
推断、补写或迁移 Gameplay 协议。

## 1. 对接方现在可以依赖什么

下面这些 Canonical 名称、字段和语义已经冻结。正式版只补实现、性能、诊断和覆盖率，不再让对接方
改写请求 JSON。

1. 控制权只由 canonical `possessedBy` Relationship 表达。
2. 绑定和释放只走 `executeGameplayCommand()`；不要调用旧 `bindControl()`。
3. `control.bind` 同时用于首次绑定和 A → B rebind。
4. 所有命令都携带 `runtimeSessionId`、`worldSessionId` 和乐观并发前置条件
   `expectedPossession`。
5. 固定输入继续使用 `{ actions, axes?, ticks }`；Simulation Tick 是唯一 Gameplay 时间。
6. Command 返回 `GameplayCommandReceiptV1`；状态变化通过 `GameplayEventV1` 和
   `WorldStateSnapshotV1` 查询，不从 Babylon/Havok 对象反推。
7. Reset 会创建新的 `worldSessionId`。旧 Session 的命令必须 fail closed；Reset 后需要重新显式
   `control.bind`。

AI Agent 不得生成同义字段、额外字段、provider 名称或兼容 alias。公开对象按 exact-key 解析。

## 2. G19-6 已实现候选的 Browser / CLI 调用面

G19-6 候选实现发布 `WorldkitBrowserApiV5` 的 **39 个 mandatory own enumerable keys**，且明确不含
`bindControl`。下面只展示 Gameplay 核心子集，不是另一个精简协议；完整 exact 签名必须直接从
`@whitebox-world/runtime-contracts` 导入。Canonical payload 类型继续复用
`@whitebox-world/gameplay-contracts`，不会另造 Browser 方言。

```ts
// DOCUMENTATION SUBSET ONLY. Do not copy this interface into a downstream codebase.
// Import WorldkitBrowserApiV5 from @whitebox-world/runtime-contracts.
interface G19_6_WorldkitBrowserApiV5_GameplaySubset {
  readonly version: 5;

  ready(): Promise<WorldRuntimeSnapshotV4>;
  getSnapshot(): WorldRuntimeSnapshotV4;

  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;

  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4>;

  getGameplayEvents(query: {
    afterEventSequence: number;
    maximumEventCount: number;
  }): {
    events: readonly GameplayEventV1[];
    nextAfterEventSequence: number;
    hasMore: boolean;
  };

  getGameplayInspectionSnapshot(): GameplayInspectionSnapshotV1;
  getWorldStateSnapshot(input: {
    worldStateRef: string;
  }): WorldStateSnapshotV1;

  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;

  reset(): Promise<WorldRuntimeSnapshotV4>;
}
```

`WorldRuntimeSnapshotV4` 已按 exact provider-neutral envelope 定义当前 `runtimeSessionId`、
`worldSessionId`、World publication/Tick/State、Subject 状态、Gameplay Inspection、View、Runtime
与 Resource 状态。它不提供根级
`controlledEntityId`。实时 UI 从 `snapshot.world.gameplayInspection.possessedByRelationshipsById` 读取控制
关系；canonical 回放从 `getWorldStateSnapshot(...).relationshipStatesById` 读取。调用方必须导入 exact
类型，不要根据这段责任说明手写一个 V4 DTO。

现有 Route、Camera Profile、Capture 和 Subject inspection 方法继续保留自己的已发布合同；本文不
复制它们，也不允许调用方建立另一套控制语法。

## 3. 绑定、切换和释放

### 3.1 首次绑定

```json
{
  "schemaVersion": 1,
  "id": "command.bind.player.0001",
  "type": "control.bind",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "controlledEntityId": "hero",
  "expectedPossession": {
    "mode": "unbound"
  }
}
```

### 3.2 从人物切换到坐骑或其他主体

```json
{
  "schemaVersion": 1,
  "id": "command.rebind.mount.0001",
  "type": "control.bind",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "controlledEntityId": "mount-dragon",
  "expectedPossession": {
    "mode": "possessed",
    "controlledEntityId": "hero"
  }
}
```

### 3.3 释放控制

```json
{
  "schemaVersion": 1,
  "id": "command.release.0001",
  "type": "control.release",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "expectedPossession": {
    "mode": "possessed",
    "controlledEntityId": "mount-dragon"
  }
}
```

`expectedPossession` 不是新的控制权真相，只是防止并发覆盖的 compare-and-swap 前置条件。发生 stale
时调用方应刷新 Snapshot，再根据最新 Relationship 决定是否重试；不要盲目重试旧命令。

## 4. Receipt、Event 与状态查询

Committed Receipt 的稳定字段为：

```ts
{
  kind: "worldkit-gameplay-command-receipt";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  commandId: string;
  commandHash: `sha256:${string}`;
  commandType: "control.bind" | "control.release" | "action.activate" | "action.cancel";
  status: "committed";
  simulationTick: number;
  eventIds: readonly string[];
  worldStateAfterRef: string;
  worldStateAfterHash: `sha256:${string}`;
}
```

Rejected Receipt 使用 `status: "rejected"`、`eventIds: []` 和 exact
`diagnostic: { code, message }`；failed Receipt 使用 `status: "failed"`、已产生的 `eventIds` 和
Diagnostic。调用方只按 `code` 分支，不能匹配自由文本 `message`。

控制关系事件使用：

- `relationship.committed`：绑定或 rebind 的新 `possessedBy` 已提交；
- `relationship.removed`：旧 `possessedBy` 已移除；
- 同一 Session 内 `sequence` 严格递增；分页 cursor 是 exclusive。

`getGameplayEvents()` 空页固定返回输入 cursor，不自行递增：

```json
{
  "events": [],
  "nextAfterEventSequence": 12,
  "hasMore": false
}
```

`getWorldStateSnapshot({ worldStateRef })` 只接受**属于当前 `worldSessionId` 且仍被 Host 保留**的
canonical Ref。旧 Session 的 Ref 即使仍在缓存也必须 fail closed。不得使用 Tick、裸 Entity ID、
Babylon/Havok handle 或本地对象引用查询。

## 5. 命令幂等与调用顺序

推荐的最小流程：

```text
ready
  → 从 Snapshot 读取 runtimeSessionId / worldSessionId
  → control.bind(expectedPossession = unbound)
  → 检查 committed Receipt
  → runFixedInput([step])
  → 按 Receipt 的 worldStateAfterRef 查询 canonical World State
  → 用 getGameplayEvents 增量读取事件
```

- 同一个 Command `id` + 同一个 canonical payload 重放，返回原 Receipt。
- 同一个 Command `id` + 不同 payload，稳定拒绝 `COMMAND_ID_CONFLICT`。
- `CONTROL_POSSESSION_STALE` 表示前置状态已变化。
- `WORLD_SESSION_STALE` 表示 Reset/Replace 后仍在使用旧 Session。
- 任何 unknown field、unknown version、NaN/Infinity、unsafe integer 或 accessor/symbol 数据均
  fail closed。

## 6. 临时限制：对接 AI 必须知道

以下能力仍会更新，但正式版不会通过改写上述冻结字段来实现：

| 能力 | 当前预览行为 | 正式版补齐方式 | 对接方现在怎么做 |
|---|---|---|---|
| Semantic Action 展示 | Runtime 没有锁定的 `semanticActionRef → Subject Action` 映射时返回 unavailable | 新增内容寻址的 Action Presentation 合同，与 AnimationSet 一起校验 | 不从 Ref 尾段或 Clip 名猜动作；收到 unavailable 就降级或跳过 |
| Camera | Gameplay 只原子发布 Camera target；CameraDirector 继续拥有 Profile/Modifier/Preference 与 pose history | 独立 Camera Context/Action Presentation Gate 继续扩展 | 不在 Gameplay 命令里塞 Camera 数值 |
| Capture / Activity | 候选实现提供 `acquire/releaseRuntimeActivity`；单帧 Capture 自动持有短 `control-capture`，Take 持有外层 `simulation-take` | G19-6 最终 Runtime/Browser gate 证明 reset/replace/capture 并发边界 | 正式依赖前等待 main 合入；不绕开 Activity 直接调用内部 Host |
| Event 分页 | Browser facade 已接到 RuntimeHost journal，cursor 为 exclusive | G19-6 最终 exact-key、分页与 reset gate 收口 | 直接使用 exact query/result，不保留 feature detection 兼容层 |
| WorldRuntimeSnapshotV4 | provider-neutral exact shape 已实现候选 | G19-6 最终 Snapshot/runtime gate 后正式发布 | 不读取旧根级 `controlledEntityId`，不把 V3 存成长期数据 |
| Action 命令 | canonical schema 已存在，Babylon 展示仍 fail closed | Action Presentation 锁定后开放 availability | 首批只对接 control.bind/release 和 fixed input |
| Legacy V3 共存 | Browser V5 候选 exact surface 已删除公开 `bindControl` 和 V3 根级控制真相；Babylon 内部 V3 capture projection 仅作为私有 Adapter ABI | G19-6 最终 consumer census 与 gate 证明无公开旁路 | 对接代码完全不引用 V3 控制字段或内部 projection |

### 6.1 最终候选新增的收口语义

- `ExecutionSubjectV3` 现在必填 `locomotionCapabilityRef` 与
  `locomotionCapabilityHash`。Subject Definition normalizer 先取已选择的 `locomotion.*` Capability 子图，
  再排除任何被其他已选 locomotion Capability 的 `requiredCapabilityRefs` 引用的节点；必须只剩一个
  dependency leaf，Definition 固化该节点的 Ref/Hash。Compiler 只核对匹配的 Resource Lock，Runtime
  只投影锁定身份；任何一层都不得猜 `ground`，调用方也不得从 `locomotionProfileRef` 补默认值。
- Snapshot V4 的 `world.subjectStatesByEntityId[*].capabilityStatesById` 发布 Canonical
  `locomotion-capability-state`，包含 owner、锁定 Capability Ref/Hash、mode、movement medium、facing 与
  speed。动作/介质 UI 应读取该状态，不回退到 V3 `activeActionId` 或根级字段。
- Placement Gate 已迁移到 Authoring/IR V4、ExecutionPlan V5、Snapshot V4 与 Browser V5。Rigged 与
  G Bot Gate 会在浏览器 realm 内 await reset/command，在 Node realm 校验返回的 canonical Snapshot；
  对接测试不要把 Node helper 闭包直接传入 `page.evaluate`。
- WorldPackage 的 Subject Asset bytes 在 locked Runtime World Configuration 构建阶段解析并校验。该阶段
  失败在公共 Authoring startup 边界 fail closed 为 `AUTHORING_RUNTIME_CONFIGURATION_INVALID`；下游按
  公共 code 处理，不依赖内部 `SUBJECT_ASSET_*` 异常透传。
- `runFixedInput` 为确定性执行临时暂停 Runtime，并在 `finally` 恢复调用前 pause 状态；失败后不得假定
  Runtime 仍处于临时暂停状态。

这些语义已进入候选代码和 verifier。最终 typecheck、build、168 files / 2,134 tests，以及 Canonical、
Placement、Rigged、G Bot、Route R0、R1 Heightfield、R1b Static Platform、Control Capture 和 Validation
Capture 门禁已全部通过；completion review 为 Final GO。G19-6 已 merge-ready，但在 merge commit 推送前
仍不能宣称已正式进入 main。

此外，对接版的物理输入只有 Host 配置的 `fixedInputControllerEntityId` 一个权威消费者。其他 Controller
可以存在于 Canonical Relationship/Inspection 中，但不会偷偷接管本地键盘、Camera target 或
`runFixedInput`。需要同时驱动多个主体时，等待正式的多 Controller 输入调度合同；不要在下游复制
`FixedInputV1`、轮换根级 `controlledEntityId` 或直接操作 Babylon Controller。

如 SDK 团队需要在 G19-6 合入前预联调，只能固定到候选分支 commit；缺失方法探测仅允许存在于
SDK-owned harness，并在正式合入时删除。对接仓库不得保留 feature detection，也不能创造另一份字段名
或永久兼容层。

## 7. 禁止依赖的临时或内部内容

对接代码和 AI 生成代码不得依赖：

- `bindControl()`、`BindControlRequestV2`、`ControlBindingReceiptV2`；
- `WorldRuntimeSnapshotV3.controlledEntityId` 或 `controllersById[*].controlledEntityId`；
- `BabylonWorldRuntime`、Havok body、AnimationGroup、Recast/provider 名；
- `initialControlledEntityId` 作为运行期 fallback；它只供宿主决定第一次显式 bind 的候选；
- Runtime package 的 `BABYLON_*_INTERNAL` Symbol；
- 根据 `semanticActionRef`、Definition ID、文件名或 Clip 名推断动画；
- 自造 `targetEntityId`、`ownerId`、`driverId` 等 Possession 同义字段。

## 8. 正式版合入后的清理

清理按 Gate 分阶段执行，不能只因为某个 Gameplay commit 合入就提前删除全部限制：

1. G19-6 候选已经删除 Browser/CLI 的旧 `bindControl` 旁路和 V3 根级控制字段；Browser gate 通过后，
   删除剩余 SDK-owned 预联调说明，并确认所有发布方法保持 mandatory exact key；
2. G19-7 production gate 通过后，删除 Outdoor/catalog route 与 page/artifact lifecycle 的旧调用路径；
3. G19-8 full gate 通过后，删除本文中已完成的 Runtime/Browser 临时说明并更新 availability matrix；
4. Action Presentation、Camera Context 或多 Controller 调度只有在各自独立 Gate 通过后，才删除对应
   `future-not-frozen` 说明；
5. 每个阶段重新生成 CLI/Browser/generated types 和示例，并跑 exact-key、command replay、
   reset/rebind、event pagination、World State lookup 和多实例门禁；
6. 保留已经进入源码的 Canonical Domain Schema 说明，不改变字段语义。

清理仅删除迁移说明、feature detection 和旧协议旁路；不得删除或重命名已经冻结的 Canonical 字段，
也不得让 Babylon/Havok/provider 类型穿过 Browser、CLI、Snapshot、Report 或 Capture 边界。

## 9. 对接 AI 的短指令

可以把下面这段直接放进对接方 Agent 的任务中：

> 只在 checkout 已包含 G19-6 最终合入 commit、SDK 导出的 `WorldkitBrowserApiV5` exact surface 包含
> `executeGameplayCommand` 且 `ready()` 成功后启用真实 transport。只使用
> `GameplayCommandV1`、`GameplayCommandReceiptV1`、`GameplayEventV1` 和
> `WorldStateSnapshotV1` 的 canonical exact schema。控制权只由 `possessedBy` 表达；绑定、rebind、
> release 只调用 `executeGameplayCommand`。不要使用旧 `bindControl`、根级
> `controlledEntityId`、provider handle、未知字段或字段 alias。每次命令使用当前
> `runtimeSessionId/worldSessionId` 和准确 `expectedPossession`；收到 stale 时刷新 Snapshot，不盲重试。
> 若当前依赖还没有 G19-6，则只生成 Canonical DTO、业务状态机和 fixture 测试，不把示意方法当成
> 可执行 API，也不自造临时 transport 字段。只允许 Host 配置的 `fixedInputControllerEntityId` 消费本地固定输入。开始前
> 必须确认当前 checkout 包含对接版最小基线 commit `630d0bf2c49d35523e436212bc9ed5e2a7a20c92`；
> 不满足就停止并同步 `origin/main`，禁止基于旧代码自行补协议。

权威类型定义位于：

- `packages/gameplay-contracts/src/gameplay-contracts.ts`
- `packages/runtime-host/src/runtime-host.ts`
- `packages/runtime-host/src/world-session.ts`
- `packages/runtime-contracts/src/runtime-session.ts`（G19-6 V5/Snapshot V4 exact contract）

更完整的架构理由和责任边界见
[`2026-08-24-gameplay-framework-r1b-integration-design.md`](superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md)。
