# Gameplay Framework 与 Route R1b 融合设计

## 1. 文档状态

- 状态：**Approved for implementation**。
- 日期：2026-08-24。
- 实施基线：`codex/r1b-integration` 的 `1bf9f5d`。
- 参考实现：PR #19 `codex/gameplay-framework-implementation` 的 `faab0fd`。
- 当前 main：`9c5a615`。
- 相机收口参考：`aurora/p15-camera-tuning-cleanup` 的 `854dbff`。
- 实施分支：`codex/pr19-gameplay-r1b-integration`。

基线状态说明：`1bf9f5d` 已完成 R1b Task 1–4 的 Surface Profile、Route V2
合同、共享 Surface Query 和相关审查修复；Task 5–10 的 Runtime Support、Validation、
Browser V5 与原子 V1→V2 cutover 仍由 `codex/r1b-integration` 后续提交完成。因此本文先实施
与这些共享文件无依赖的 Gameplay 包；Browser/Runtime 最终接线必须在再次 fetch 并吸收
R1b 完成提交后进行。

本文冻结如何把 PR #19 中有价值的 Gameplay Framework 重新实现到最新 Route R1b
架构上。它不是 PR #19 的合并说明；最新 R1b、Canonical State、AI-facing 命名、
Camera Profile 和 Runtime 深审合同拥有更高优先级。

## 2. 决策摘要

采用“**以 R1b 为底、按垂直切片移植 #19**”方案：

```text
Application / Playground / Browser Protocol V5
  └─ RuntimeHost
      ├─ RuntimeSession（调用、Take、Capture 作用域）
      ├─ Participant / ControllerEntity（跨 WorldSession 的身份）
      └─ WorldSession（一次世界实例的唯一生命周期）
          ├─ GameplayMode（规则与准入）
          ├─ GameplayState（关系、动作与可观察事实）
          ├─ GameplayFeatureManager（受信组合根注入）
          ├─ Route Evidence Query（只读派生查询，不是 Gameplay 权威）
          └─ GameplayWorldPort（provider-neutral 事务端口）
              └─ BabylonWorldAdapter
                  ├─ BabylonWorldRuntime
                  ├─ Havok Physics / checkSupport()
                  ├─ Subject Controller / Animation Projection
                  └─ CameraDirector / View State
```

保留 #19 的 RuntimeHost、WorldSession、Possession、Command/Receipt/Event、事务端口、
固定 Tick barrier、Semantic Action 和逆序清理思想；重写与 R1b、Schema、Camera 或
公共协议冲突的具体实现。

禁止：

- 直接 merge PR #19 并按文本冲突选边；
- 用 #19 的 `ExecutionPlanV5` 覆盖 R1b V5；
- 用 #19 的 Browser V4 覆盖 Route Evidence V4；
- 把 Recast、Babylon、Havok、provider 名或 Handle 暴露到公共合同；
- 恢复公开 Camera numeric overlay；
- 实现 NPC、车辆、洞穴、联网、公开 `goTo` 或动态平台；
- 让 Route Graph、动画 Clip、Mesh 名或材质成为 Gameplay 真相。

## 3. 方案比较

### 3.1 采用：以 R1b 为底重新实现

优势：

- R1b 的 Route Build Input V2、Traversal Surface、Collider 相关性和门禁天然保留；
- 每个公共合同只有一个准确版本；
- 可以先修正 #19 已确认的合同缺陷，再接入 Runtime；
- 每个切片都能以失败测试、局部门禁和提交独立验收。

### 3.2 拒绝：直接解决 #19 merge conflict

PR #19 与 R1b 从共同基线各自演进了 Compiler、ExecutionPlan、Browser、Runtime、Camera
和 Playground。文本冲突解决不了同名版本不同语义的问题，会产生“编译通过但 Route 或
Camera 合同已被静默删除”的错误。

### 3.3 拒绝：只合入三个新 package

仅复制 `gameplay-contracts`、`gameplay`、`runtime-host` 会产生没有真实 Composition Root、
Babylon Port 和 Browser Gate 的死代码。包可以先实施，但不能作为可合入 main 的完成状态。

## 4. 权威所有权

| 事实 | 唯一 Owner | 消费者 | 禁止的第二真相 |
| --- | --- | --- | --- |
| Runtime/World 替换和 fixed-step 准入 barrier | RuntimeHost | Browser、Take、Capture | Babylon 自行替换世界 |
| WorldSession 生命周期和事件序列 | WorldSession | Host、Browser、Replay | ExecutionPlan ID 充当实例 ID |
| Participant 到 Controller 归属 | ControllerEntity 的 `participantId` | Participant 查询索引 | Participant 再保存 controller ID 数组 |
| 控制关系 | `possessedBy` Relationship | Input、Camera、Snapshot | 根级 `controlledEntityId`、Adapter 私有 fallback |
| Gameplay 命令规则 | GameplayMode + typed Handler | WorldSession | Babylon 直接接受 Gameplay 命令 |
| Logical Action | GameplayState | Animation Projection、Snapshot | 动画 Clip 播放状态决定 Action 结果 |
| Physics/Support/Medium/Facing | Babylon Runtime 现有 fixed-tick owner | Canonical Locomotion 投影、Camera | Gameplay 重算 Medium/Facing/Speed、Graph、高度采样或第二次 support query |
| Route 可达性 | Route Graph/Query Evidence | Browser、Validation、未来 Planner | Gameplay State 把 Graph 当真实移动 |
| Camera Profile 和 View State | CameraDirector | Render、Browser View inspection | Possession 或 Subject 保存镜头数值 |
| Runtime Tick | Babylon fixed simulation tick | Host barrier、Gameplay、Animation | WorldSession 推进另一套时钟 |

## 5. Package 与依赖方向

```text
@whitebox-world/gameplay-contracts
        ↑
@whitebox-world/gameplay
        ↑
@whitebox-world/runtime-host ← @whitebox-world/runtime-contracts
        ↑                         ↑
@whitebox-world/runtime-babylon   └─ ExecutionPlan / Runtime protocol
        ↑
apps/playground（唯一 Composition Root）
```

规则：

1. `gameplay-contracts` 只包含关闭 Schema、类型、canonicalizer 和诊断，不依赖 Browser、
   Babylon、Route、Capture 或 Registry。
2. `gameplay` 是纯 TypeScript 规则层，只依赖 `gameplay-contracts`。
3. `runtime-host` 协调生命周期和事务，不构造具体 GameplayMode、Feature 或 Action Definition。
4. `runtime-babylon` 实现 `GameplayWorldPort`，不导入具体 Mode/Feature，也不发布 provider 名。
5. Playground 注入 Mode、Feature factories、Action Catalog 和 AdapterFactory。
6. 每个 workspace package 声明直接依赖；公共入口不依赖 workspace 根的隐式 hoist。

## 6. Gameplay 公共合同

PR #19 的 Gameplay wire contract 从未进入 main。本次不保留开发历史中的 V2/V3 名称，
以一套干净的 V1 作为首个合入合同。

### 6.1 Command

所有命令包含：

```ts
interface GameplayCommandBaseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly type:
    | "control.bind"
    | "control.release"
    | "action.activate"
    | "action.cancel";
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly controllerEntityId: string;
}
```

命令是关闭判别联合：

- `control.bind` 带 `controlledEntityId` 和 `expectedPossession`；
- `control.release` 带 possessed 形状的 `expectedPossession`；
- `action.activate` 带 `actionExecutionId`、`semanticActionRef`、`actorEntityId` 和
  `expectedPossession`；
- `action.cancel` 带 `actionExecutionId`、`actorEntityId` 和 `expectedPossession`。

`expectedPossession` 只是乐观并发前置条件，不能作为路由或权威关系来源。Action request
需要参数时引用由 Action Definition Schema 校验并内容寻址的 `actionRequestRef/hash`；不得增加
公共 `params` 袋。

`expectedPossession` 的关闭形状为：

```ts
type ExpectedPossessionV1 =
  | Readonly<{ mode: "unbound" }>
  | Readonly<{ mode: "possessed"; controlledEntityId: string }>;
```

四个变体的 payload 也固定，不由 Handler 自行补字段：

```ts
type GameplayCommandV1 =
  | Readonly<GameplayCommandBaseV1 & {
      type: "control.bind";
      controlledEntityId: string;
      expectedPossession: ExpectedPossessionV1;
    }>
  | Readonly<GameplayCommandBaseV1 & {
      type: "control.release";
      expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
    }>
  | Readonly<GameplayCommandBaseV1 & {
      type: "action.activate";
      actionExecutionId: string;
      semanticActionRef: string;
      actorEntityId: string;
      expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
      // 需要参数时二者同时存在；无参数时二者都不存在。
      actionRequestRef?: string;
      actionRequestHash?: `sha256:${string}`;
    }>
  | Readonly<GameplayCommandBaseV1 & {
      type: "action.cancel";
      actionExecutionId: string;
      actorEntityId: string;
      expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
    }>;
```

`actionRequestRef/actionRequestHash` 在实际类型中必须以“成对存在或成对不存在”的子联合表达；
上面的注释形式只为缩短设计示例，parser 不接受只出现其中一个字段。

已控制 A 时提交 `control.bind(B)` 的语义固定为原子 rebind：命令必须携带
`expectedPossession: { mode: "possessed", controlledEntityId: A }`；同一事务移除 A 的
`possessedBy`、向 A 提交 neutral input、建立 B 的 `possessedBy` 并切换 Camera。任一步失败都
rollback 到 A。若期望关系已经过期，稳定返回 `CONTROL_POSSESSION_STALE`，不得先 release 再由
第二条命令 bind，从而暴露半提交状态。

Parser 必须：

- snapshot 普通数据对象，拒绝 accessor、Symbol、原型对象和未知字段；
- 严格校验 `schemaVersion === 1`；
- 拒绝空 ID、非有限 Tick/数值和非法联合形状；
- 返回深冻结的 canonical value；
- 不接受 `subject/target/params` 通用袋或兼容 alias。

### 6.2 Receipt

Receipt 是判别联合，不能用可选 diagnostic 表达两种状态：

```ts
type GameplayCommandReceiptV1 =
  | Readonly<{
      kind: "worldkit-gameplay-command-receipt";
      schemaVersion: 1;
      id: string;
      runtimeSessionId: string;
      worldSessionId: string;
      commandId: string;
      commandType: GameplayCommandV1["type"];
      status: "committed";
      simulationTick: number;
      eventIds: readonly string[];
      worldStateAfterRef: string;
      worldStateAfterHash: `sha256:${string}`;
    }>
  | Readonly<{
      kind: "worldkit-gameplay-command-receipt";
      schemaVersion: 1;
      id: string;
      runtimeSessionId: string;
      worldSessionId: string;
      commandId: string;
      commandType: GameplayCommandV1["type"];
      status: "rejected";
      simulationTick: number;
      eventIds: readonly [];
      diagnostic: GameplayDiagnosticV1;
    }>
  | Readonly<{
      kind: "worldkit-gameplay-command-receipt";
      schemaVersion: 1;
      id: string;
      runtimeSessionId: string;
      worldSessionId: string;
      commandId: string;
      commandType: GameplayCommandV1["type"];
      status: "failed";
      simulationTick: number;
      eventIds: readonly string[];
      diagnostic: GameplayDiagnosticV1;
    }>;
```

相同 command ID + 相同 canonical bytes 重试返回同一 Receipt；同 ID 不同内容返回
`COMMAND_ID_CONFLICT`。旧 `worldSessionId` 返回稳定 stale-world rejection。

`rejected` 表示准入、并发或容量拒绝且 World State 未改变；`failed` 表示 prepare 后事务或
WorldSession 失败。rollback failure 必须返回 failed，并使 WorldSession fail closed。

### 6.3 Event、World State 与 inspection projection

- Event 使用 `schemaVersion: 1`、`simulationTick`、关闭 `type` 联合和 WorldSession 内严格
  递增 `sequence`；
- Event ID 由 `worldSessionId + sequence` 派生，时间戳不参与权威排序；
- 控制事件使用 `relationship.committed/relationship.removed`，Action 使用
  `action.started/action.completed/action.cancelled/action.failed`，Semantic Fact Projector 使用
  `semantic-fact.started/semantic-fact.ended`；拒绝只由 Receipt 表达，不产生
  `gameplay.command-rejected` Event；
- `WorldStateSnapshotV1` 是 Receipt 引用的 canonical artifact，首期包含 Subject/Controller
  Entity State、`possessedBy` Relationship、Locomotion Capability State、Semantic Fact 和
  active Action State；
- `GameplayInspectionSnapshotV1` 只作为 Browser inspection projection，包含 Participant、Controller、
  `possessedBy`、active Action、activated Feature、`lastEventSequence` 和稳定 phase/diagnostic，
  不作为第二个 World State Hash 权威；
- Participant 不保存 `controllerEntityIds`，Controller 不保存 binding/controlled target；
  Browser 如需 binding 只能从 `possessedBy` 即时派生；
- Subject 位置、速度、Support、Medium、Facing 和实际速度只由 Babylon fixed-tick owner 提交；
  `WorldStateSnapshotV1` 中的 Spatial/Locomotion/`supportedBy` 只是同一已提交结果的 canonical
  projection，不允许 Gameplay 再计算、修正或以 Route/Height Query 推断；
- Camera、Route Evidence 和 Runtime 健康状态不塞进 `GameplayInspectionSnapshotV1`。

`WorldStateSnapshotV1` 严格沿用上位 Canonical State V1 envelope，不允许再定义同名方言：

```ts
interface WorldStateSnapshotV1 {
  readonly kind: "worldkit-world-state-snapshot";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly executionPlanHash: `sha256:${string}`;
  readonly entityStatesById: Readonly<Record<string, GameplayEntityStateV1>>;
  readonly capabilityStatesById: Readonly<Record<string, GameplayCapabilityStateV1>>;
  readonly relationshipStatesById: Readonly<Record<string, GameplayRelationshipStateV1>>;
  readonly semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>>;
  readonly activeActionStatesById: Readonly<Record<string, GameplayActionStateV1>>;
  readonly lastEventSequence: number;
  readonly worldStateHash: `sha256:${string}`;
}
```

首批 `GameplaySemanticFactV1` 采用上位关闭联合 `supportedBy | touching | insideVolume`；当前
Runtime 尚未投影的类型使用空 Map，不得删掉根字段。关系端点、Capability owner、Action actor
和 inspection 的 Participant/Controller 引用必须存在且角色兼容，不能把 dangling graph 冻结为
Canonical State。

每条 Fact 必须携带锁定 `semanticFactProjectorProfileRef/hash`。Fact ID 由 type、角色化 canonical
端点、`startedSimulationTick` 和该 Profile Ref/Hash 派生，连续期间会变化的 support point/normal
不进入身份。parser 必须重算并拒绝任意命名或不匹配的 Fact ID。`semantic-fact.started/ended`
Event 都携带 exact `semanticFact` 快照以支持 standalone audit/begin-end 配对；physics-derived Fact
Event 不伪造 `commandId`。

Canonical Snapshot 还必须拒绝以下矛盾：`air` 必须且只能对应 `airborne`；`ground` 只能对应
`idle | walk | run`；实际速度非负；Relationship established Tick、Fact started Tick、Action
started/transition Tick 都不得越过 Snapshot Tick，且 Action transition Tick 不得早于 started Tick。

`worldStateHash` 的输入固定为 `simulationTick`、`worldPackageRootHash`、`executionPlanHash`、按 ID
排序后的五类 State Map 和 `lastEventSequence`。`id`、`runtimeSessionId`、`worldSessionId`、
`worldPackageRef` 与 `worldStateHash` 自身不进入 hash 域。不同 Session 到达相同锁定世界与 Tick
状态必须得到相同 hash；任何 hash 域字段被篡改，parser 必须拒绝。Artifact 的完整 canonical
bytes 仍包含 envelope 身份字段，两种 hash 不得混用。

### 6.4 容量预算

WorldSession 创建时锁定 `GameplayCapacityBudgetV1`，至少包含：

- `maximumParticipantCount`；
- `maximumControllerEntityCount`；
- `maximumPossessedByRelationshipCount`；
- `maximumActiveActionStateCount`；
- `maximumGameplayFeatureCount`；
- `maximumSemanticActionDefinitionCount`；
- `maximumIdempotencyRecordCount`；
- `maximumRetiredActionExecutionIdCount`；
- `maximumRetainedReceiptCount`；
- `maximumRetainedEventCount`。

默认 trusted local profile 使用确定值：`1/1/1/256/16/256/4096/4096/4096/8192`。所有字段必须是
非负 safe integer。事务在 Adapter prepare 前一次性预留所需 relationship/action/receipt/
event/idempotency slots。

`maximumRetiredActionExecutionIdCount` 独立约束永久保留的 Action execution ID；不得把它暗中
计入 `maximumIdempotencyRecordCount`，也不得淘汰后允许同一 execution ID 被另一命令复用。

预算耗尽时拒绝新的状态改变并返回稳定 Diagnostic；不得淘汰 command idempotency 或 Event
历史后继续运行，从而让相同命令在同一 WorldSession 获得不同结果。Reset 创建新
WorldSession 并获得新预算。

`RuntimeHost` 不保存所有历史 WorldSession ID：只比较当前 WorldSession ID 即可拒绝迟到
命令；WorldSession ID factory 必须生成不可复用 ID，重复时初始化失败。

## 7. Participant、Controller 与 Possession

- Participant 是调用者/玩家身份；首期仍只有 trusted local participant，但它属于 Playground
  bootstrap policy，不属于 Core 常量。
- ControllerEntity 保存唯一 `participantId`；Participant Snapshot 不再复制
  `controllerEntityIds`，查询索引由 canonical Controller map 派生。
- Subject 是 WorldSession 内实体，不跨 Reset 保留。
- `possessedBy` 是 Controller→Subject 的唯一权威边，使用 `controlledEntityId` 和
  `controllerEntityId` 角色端点；Controller Snapshot 不保存 binding 或 target。
- 一个 Controller 同时最多 Possess 一个 Subject；一个 Subject 同时最多被一个 Controller
  Possess。
- `control.bind` 在同一 Controller 已拥有同一目标时稳定拒绝 `CONTROL_ALREADY_OWNED`，不删除/
  重建 Relationship，也不产生 Event；切换到不同目标才走原子 rebind。
- 每次新建 `possessedBy` 的 ID 由已接受 `control.bind` 的 command ID 通过 canonical hash 派生，
  不含 WorldSession ID。相同 replay command 可复现，同一 Session 的不同 command 不会误用同一
  Relationship ID；解除后重新建立使用新 command，因此产生新 ID。
- Group control 在上层展开为多条独立命令，首期不实现。

ExecutionPlan 中的 `initialControlledEntityId` 只是可信 Host 的初始绑定候选，不是 Runtime
控制状态。WorldSession ready 后，Playground bootstrap 显式提交 `control.bind`。

## 8. Gameplay Feature 与 Action

### 8.1 Feature 注入

RuntimeHost 接收：

```ts
readonly gameplayModeFactory: () => GameplayModeV1;
readonly gameplayFeatureFactories: readonly GameplayFeatureFactoryV1[];
readonly gameplayActionDefinitions: readonly GameplayActionDefinitionV1[];
readonly gameplayCapacityBudget: GameplayCapacityBudgetV1;
```

Host 不导入 `createCoreControlFeature` 或 `createCoreSemanticActionFeature`。FeatureManager 使用
稳定 Ref、显式依赖、拓扑激活、逆序释放；循环、缺失依赖和重复注册在世界创建前失败。

`GameplayFeatureManifestV1` 是可序列化 manifest，至少包含
`kind/id/version/resourceRef/contentHash/dependencyFeatureRefs/requiredCapabilityRefs/commandTypes`
与 exact resource budget；manifest canonical hash 与实现代码/build fingerprint 分离。
`GameplayFeatureFactoryV1` 是 trusted composition-root extension，携带该 manifest 并且每个
WorldSession 只调用一次 `create()`。Function、State Slice 和 Handler 不进入 Browser/CLI/
Canonical Schema；Factory 返回的 ref 必须与 manifest/Resource Lock 一致。全部 manifest 的锁、
数量、依赖、循环、Capability 和 command-handler 唯一性必须在创建任何 State Slice 前验证。

### 8.2 Action Catalog

Core 只提供通用 Action Handler 和状态机，不内置 `dance.rumba`、`emote.salute` 或魔法 Tick
数字。Action Definitions 由已编译 Subject/Registry 能力和应用组合根提供，关闭形状至少包含：

```ts
interface GameplayActionDefinitionV1 {
  readonly kind: "semantic-action";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly contentHash: `sha256:${string}`;
  readonly executionMode: "exclusive-per-subject";
  readonly completion:
    | Readonly<{ mode: "explicit-cancel" }>
    | Readonly<{ mode: "fixed-duration"; durationTicks: number }>;
  readonly isMovementInputBlocked: boolean;
  readonly allowedActorEntityDefinitionRefs: readonly string[];
  readonly requiredActorCapabilityRefs: readonly string[];
  readonly request:
    | Readonly<{ mode: "none" }>
    | Readonly<{
        mode: "required";
        actionRequestSchemaRef: string;
        actionRequestSchemaHash: `sha256:${string}`;
      }>;
}
```

Runtime 中统一引用 `semanticActionRef`，不使用裸 `actionId`。Action Definition 使用
Registry `kind/id/version` 和锁定 hash；重复 Ref、未知 Ref、Hash/Request Schema 不匹配在
Adapter prepare 前拒绝。

Action Catalog 在 WorldSession 构造时 snapshot、canonicalize、按 `resourceRef` 排序并冻结；
definition `contentHash` 必须覆盖除自身以外的完整声明字段。首期 Action activation 直接提交为
`mode: "active"`，cancel/completion 直接移除；`starting/completing` 只保留为 Canonical State 的
后续扩展值，当前状态机不制造无观察阶段。`actorEntityId` 必须等于 expected possession 的目标。
相同 actor 已有 exclusive Action 时稳定拒绝。

retired `actionExecutionId` 使用独立永久集合和独立容量预算；不得因 command record eviction 重用。
同 Tick 到期的 Action 按 scheduled Tick、再按 execution ID 排序；natural completion 不携带
`commandId`。

Gameplay logical Action 在提交 Tick 生效；Babylon rendered Action 在下一 fixed tick 根据
Projection 选择动画。缺失专用 Clip 只能按锁定 fallback 或稳定拒绝，不能反向取消逻辑 Action。

## 9. RuntimeHost、WorldSession 与事务

### 9.1 生命周期

```text
constructing → ready → replacing → disposed
                  └──── failure → failed → disposed
```

- RuntimeHost 是进程级组合根和固定步准入 barrier；
- WorldSession 是一次 ExecutionPlan 实例，拥有唯一 ID、GameplayState、Feature、Adapter、
  command/receipt/event journal；
- Reset/Replace 先构造新 Session，通过 Ready Gate 后原子切换，再逆序释放旧 Session；
- 活跃 Runtime Run、Take 或 Capture 阻止世界替换；
- 部分构造、commit 失败和 rollback 失败都按稳定顺序释放，rollback 失败使 Session failed；
- Host dispose、replace、command 和 fixed-input 共享串行 barrier，不能观察半提交状态。

### 9.2 GameplayWorldPort

端口只暴露领域能力：

- Subject 是否存在、是否可控制；
- Subject 是否支持 Action；
- `prepareGameplayTransition(transition)`；
- 固定输入与 fixed tick；
- provider-neutral Runtime Snapshot/Render Ready/Capture 能力；
- dispose。

Transaction 的 `commit()` 和 `rollback()` 必须幂等并捕获恢复控制输入、Action Projection 和
Camera 所需的完整稳定状态。端口和错误不得出现 `babylon-havok`、Mesh、PhysicsBody、
AnimationGroup、Camera Handle 或 provider message。

## 10. ExecutionPlanV5 与 R1b

R1b 的 `ExecutionPlanV5` 是当前权威。仓库为 private `0.0.0` 且没有 release tag，本次采用一次
明确 clean break，不新建 V6：

```ts
interface ExecutionPlanV5 extends Omit<
  ExecutionPlanV4,
  "schemaVersion" | "controlledEntityId"
> {
  readonly schemaVersion: 5;
  readonly initialControlledEntityId: string;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly resourceLockEntries: readonly ExecutionResourceLockEntryV1[];
  readonly traversal: {
    readonly surfaces: readonly ExecutionTraversalSurfaceV1[];
    readonly traversalAreas: readonly ExecutionTraversalAreaV1[];
    readonly connectivityRequirements: readonly ExecutionConnectivityRequirementV1[];
    readonly anchorEntityIds: readonly string[];
  };
  readonly staticColliders: readonly ExecutionStaticColliderV1[];
}
```

必须保留：

- AuthoringSpec V4 / Normalized IR V4；
- `authoringSpecHash` 和 canonical Resource Lock；
- Heightfield 与 Static Collider Traversal Surface identity；
- Route Build Input V2 的 terrain/static collider/surface 四类 artifact hash；
- Traversal Capability Envelope、Route V2 Graph/Path/Overlay/Probe；
- R1b Collider bytes、Surface Binding、Graph/Runtime support correlation；
- Plan hash 覆盖上述所有字段。

Compiler 在构造 Plan 前 snapshot 不可信输入，防止 getter/TOCTOU；Plan 深冻结。所有本地 fixture、
golden artifact 和 generated example 正式重建，不手改 hash，不保留 `controlledEntityId` alias。

Route Graph 继续只读；Gameplay Framework 不新增 `goTo`、Path Following 或 NPC。

Route V2 的 Hash 链必须原样保留：

- World/Package：`authoringSpecHash`、`normalizedWorldIrHash`、`executionPlanHash`、
  `resourceLockHash`、`layoutSolveReportHash`、`worldPackageRootHash`、
  `validationReportHash`、`routeValidationSetReceiptHash`；
- Route Build：`terrainArtifactHash`、`colliderArtifactHash`、`geometryArtifactHash`、
  `surfaceArtifactHash`、`routeBuildInputHash`、`traversalCapabilityEnvelopeHash`、
  `resolvedTraversalLockHash` 和 Graph Builder Profile Ref/Version/Hash。

RuntimeHost 不重算、补写或根据当前 Possession 改变任何 Route Hash；Reset/Rebind 也不能改变
已经发布的 Route Evidence bytes。

## 11. Camera 与 View

### 11.1 Profile 语义

采用 Aurora 收口：

- Runtime 只接受锁定 `requestCameraProfile(profileRef)` / `resetCameraProfile()`；
- numeric tuning 仅进入隔离的 Authoring Preview Channel；
- Preview 不进入 Gameplay Command、Canonical Snapshot、Preset 或 Plan；
- 保留当前 Profile 的 heading source、recenter、velocity chase、look-ahead、flight horizon 和
  speed FOV；
- 不移植 #19 将所有 Profile 简化为手工 orbit 的实现。

### 11.2 Possession 联动

- `control.bind` transaction 提交后，CameraDirector 根据当前 View Session 的
  `targetPolicy: "controlled-entity"` 重定向；
- `control.release` 清除该 target 并冻结最后稳定 Camera pose，发布显式 neutral/unbound View
  State；不得使用 `initialControlledEntityId` 作为隐藏 fallback；
- Reset 新世界 ready 后，由 Playground bootstrap 在第一次交互 Snapshot 发布前显式绑定；
- Camera transaction 捕获并恢复 target、profile、yaw/pitch/distance、
  `lastStableVelocityForward`、`secondsSinceManualViewInput`、`previousVelocity`、
  `lastBaseTarget` 和 Preview 状态；
- 正向 public yaw 修复可以移植，但不能改变主体 facing 或 Profile 语义。

Camera 是 View Entity，不属于 GameplayState；切镜头不改变 Possession、Physics、Route 或
Subject Transform。

## 12. Browser Protocol V5

当前 main 与 #19 分别占用了两份不兼容 Browser V4；R1b completion 将首先原子发布 Route
Evidence V2 的 `WorldkitBrowserApiV5`。Gameplay 不从任一 V4 再升一份 V5，而是在 fetch 并验证
R1b completion HEAD 后，扩展那一份尚未发布的 V5，并在同一个 exact-key cutover 中完成。

Gameplay 扩展保留 R1b V5 的完整公共 surface：

- `ready/getSnapshot/getDiagnostics`；
- fixed input、intent、pause、reset；
- Control Capture / Runtime Run / Render Ready；
- Subject/Capability/Package inspection；
- Camera Profile 与隔离 Preview；
- `getRouteSummary/getRoutePathReceipt/getRouteRuntimeProbeReceipt/getRouteOverlay`。

在该 exact base 上只新增：

- `executeGameplayCommand(command)`；
- `getGameplayEvents(query)`；
- `getGameplayInspectionSnapshot()` 投影。

组合类型以 R1b completion 实际导出的 `WorldkitBrowserApiV5` 为唯一 base；实现前必须把它的
完整 enumerable key 列表冻结为 conformance fixture。Gameplay 计划不得复制当前 V4 interface、
不得先占用另一份 `WORLDKIT_BROWSER_PROTOCOL_VERSION = 5`，也不得以 optional method 隐藏缺失
接线。四个 Route getter 的 selector 和 query-result 类型名称、字段及可枚举性必须原样继承 R1b
completion 实际导出的 V5 声明；其 publication/projection/path/probe/overlay payload 必须是 V2，
不能在本文提前发明另一组 selector/query-result 名称或把 V1 payload 包在新外壳中。

R1b Task 8/9 产出的 Route Evidence 必须使用 V2 publication/projection/path/probe/overlay，
不存在 V1 fallback、V1↔V2 converter 或 mixed receipt。Browser 安装的是 Trusted Host 已完成
Hash 绑定的 canonical DTO，不接收任意 raw publication，也不在浏览器重建 Build Input。

V5 删除：

- `bindControl` 公共旁路；
- Gameplay/Runtime 公共的 Camera numeric tuning；
- provider/backend 字面量；
- Snapshot 根级 `controlledEntityId`。

`WorldRuntimeSnapshotV4` 包含 WorldSession ID、tick、Subject states、GameplayInspectionSnapshotV1、
Camera/View state、resource/runtime health 的 provider-neutral 投影。它不是完整 Canonical World
State；Relationship/Event/Physics Fact 的后续切片仍按上位设计演进。

Browser exact-key conformance、Authoring Loader、CLI/examples/generated types 必须原子更新；
不得通过 optional alias 同时暴露 V4/V5 两套控制语法。

## 13. Playground 与 Outdoor Scene

- `?authoring=1` 继续只由 `worldkit run` 注入 AuthoringSpec；
- Authoring Loader 保留 V4、compileWorldV5、Route publication 和五类 Hash fail-closed 绑定；
- 可玩 Outdoor Scene 可以统一通过 RuntimeHost/Babylon/Havok，但必须从当前 Authoring/Compiler
  产出包含 R1b 字段的 ExecutionPlanV5；
- Legacy/catalog Artifact 页面继续隔离，不创建 RuntimeHost，不安装 `window.__WORLDKIT__`；
- Reset UI 等待新 WorldSession ready + 显式 bind + first render 后才报告完成；
- Unknown scene fail closed；不得为了导入旧场景手改 `plan-lock.json` 或 SDK runtime。

## 14. 错误模型

- 公共边界统一返回关闭 Diagnostic 或抛出带 Diagnostic 的领域 Error；
- 不向 Browser 暴露 RangeError、原始 provider Error、stack、cause 或 adapter message；
- committed Receipt 不带 diagnostic，rejected Receipt 必带 diagnostic；
- prepare 失败无可观察 mutation；commit 失败必须 rollback；rollback 失败使 WorldSession failed；
- throwing cleanup 保留首个 load-bearing failure，同时记录清理失败为内部 evidence；
- unknown command/field/version、stale session、capacity exhaustion 和 resource mismatch 均 fail closed。

`GameplayDiagnosticV1` 是 exact-key 的 `{ code, message }`，`code` 使用关闭枚举。首批必须至少
覆盖 `INPUT_INVALID`、`COMMAND_ID_CONFLICT`、`CONTROL_POSSESSION_STALE`、
`GAMEPLAY_CAPACITY_EXCEEDED`、`FEATURE_NOT_LOCKED`、`ACTION_CATALOG_INVALID` 与事务
prepare/commit/rollback 失败；新增稳定 code 必须与 parser、fixtures、Browser generated types 一起
原子演进。Provider message、stack、cause、handle 和自由 details 袋都不进入该合同。

## 15. 依赖感知实施图

| ID | 目标与可验收交付 | depends_on | blocks | 独占所有权 | 集成点 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G19-0 | 冻结本文与实施计划 | 无 | 全部 | 本文、计划、SDD ledger | R1b `1bf9f5d` | 文档自审、Cursor design CR | main-agent-only |
| G19-1 | 将 Aurora Camera cleanup 语义移植到 R1b | G19-0、R1b completion HEAD | G19-5 | CameraDirector、camera preview、R1b V5 Camera API/tests | Babylon/Playground Camera boundary | focused camera tests、R1b gates | sequential |
| G19-2 | 干净 Gameplay contracts/core | G19-0 | G19-3 | 新 `gameplay-contracts`、`gameplay` packages | typed interfaces | parser/state/feature/action tests | parallel-safe |
| G19-3 | RuntimeHost/WorldSession/Port | G19-2 | G19-4/G19-5 | 新 `runtime-host` package | Runtime contracts + Adapter factory | lifecycle/transaction/idempotency tests | sequential |
| G19-4 | 组合 ExecutionPlanV5/Compiler/R1b | G19-0、G19-3、R1b completion HEAD | G19-5/G19-6 | runtime-contracts execution plan、compiler、fixtures | Plan V5 exact shape | compiler + Route R1b gates | sequential |
| G19-5 | Babylon Gameplay Port + Camera/Possession | G19-1/G19-3/G19-4 | G19-6 | runtime-babylon、Babylon adapter | GameplayWorldPort | Havok fixed-tick/adversarial runtime tests | sequential |
| G19-6 | Browser V5/Loader/Playground reset | G19-3/G19-4/G19-5 | G19-7 | browser protocol/api、authoring loader、main | RuntimeHost public surface | exact-key、reset/rebind、Route evidence | sequential |
| G19-7 | Outdoor runtime unification与门禁 | G19-6 | G19-8 | outdoor importer、verify script、scene fixtures | current compiler/runtime | six scenes、unknown fail-closed、artifact isolation | sequential |
| G19-8 | 全量审查、修复、发布准备 | 全部 | 无 | review docs、generated evidence | whole branch | full gates + Browser + Cursor final | main-agent-only |

G19-2 与 G19-3 可以在 R1b 未完成时依次推进，因为只创建独立 package。G19-1 先于 Camera
Gameplay transaction，避免基于旧 overlay 编写第二套适配；G19-4 必须等 G19-3 与 R1b
completion，不能再作为 parallel-safe 任务提前修改共享 ExecutionPlan/Compiler。

由于 `codex/r1b-integration@1bf9f5d` 仍缺 Task 5–10，G19-1/G19-4/G19-5/G19-6/G19-7 还额外依赖
“R1b completion HEAD 已 fetch 并通过其 Completion Review”。若远端尚未完成，实施分支只推进
G19-2/G19-3；不得自行复制 R1b 剩余工作或在旧 Browser V4 上临时
建立 Gameplay 旁路。

## 16. 强制门禁

### 16.1 合同与单元测试

- Gameplay Command/Receipt/Event/Snapshot exact-key/version/canonicalization；
- committed/rejected 非法组合、accessor/Symbol/unknown-field 拒绝；
- Participant/Controller 单向权威和 Possession 唯一性；
- command idempotency、changed-payload conflict、stale WorldSession；
- capacity exhaustion 不淘汰历史；
- Feature dependency/cycle/activation/reverse cleanup；
- Action availability、fixed-duration、explicit cancel、retired execution ID。

### 16.2 Runtime 对抗测试

- bind/release/rebind、空中换绑、旧主体 neutral input；
- reset 创建新 ID、旧命令拒绝、新世界显式重绑；
- release 后 Camera target 为空且真实 pose 不隐藏跟随；
- transaction prepare/commit/rollback/throwing cleanup；
- 30/60/120 Hz-like render timing 不改变 fixed tick Action；
- R1b static platform support、ledge departure、jump、uncontrolled gravity；
- Camera orbit/chase/flight/recenter/speed-FOV 分别兑现 Profile；
- Preview 不进入 Snapshot/Gameplay/Plan。

### 16.3 Route、Browser 与真实场景

- `pnpm typecheck`；
- `pnpm test`；
- `pnpm build`；
- `pnpm verify:canonical`；
- `pnpm verify:placement-layout`；
- `pnpm verify:rigged-subject`；
- `pnpm verify:g-bot-subject`；
- `pnpm verify:route-r0-contract`；
- `pnpm verify:route-r1-heightfield`；
- 新 `pnpm verify:outdoor-gameplay`；
- Browser V5 同时证明 Route getters、Gameplay Command、reset/rebind、Camera neutral；
- 六个 Outdoor Scene ready、移动、reset、Route Evidence；
- unknown scene fail closed；
- artifact 页面不创建 RuntimeHost/Browser API。

自动合同证据、真实 Chromium/渲染证据和人工交互证据分别报告，不能互相替代。

## 17. Git 与集成策略

1. 实施分支直接基于 `codex/r1b-integration@1bf9f5d`，所以天然包含未来 main 的 R1b。
2. 每个 G19 Task 形成独立提交和 review disposition。
3. 不把仍为 Draft 的 PR #24 偷偷合入 main；分支完成后先推送，保持可审查。
4. PR #24 合入 main 后，将本分支 rebase/merge 最新 main，重新跑全部门禁。
5. 用户此前已授权 #19 融合完成后合入 main；但如果 PR #24 仍未合，最终 main 更新必须等待
   R1b 的独立合入决定，不能借 #19 绕过其评审。
6. 合入后确认 main、origin/main、集成分支 HEAD 和工作树状态，再清理 worktree。

## 18. 完成定义

只有同时满足以下条件，才能宣称 #19 已融合：

- #19 的核心分层在最新 R1b 上有真实 Runtime/Browser 接线，不是孤立包；
- ExecutionPlanV5、Route V2、R1b Surface/Collider/Hash 合同完整保留；
- Possession、Action、Camera、Support、Tick 各只有一个权威 Owner；
- Browser Protocol V5 没有旧 `bindControl` 或 numeric Camera overlay 旁路；
- reset/release/rebind/rollback/多实例/容量边界有对抗测试；
- Outdoor playable 与 artifact 路径正确分离；
- 全部门禁和独立 Cursor final review 完成，所有成立问题已 disposition；
- 代码、文档、fixtures、generated artifacts 与远端提交状态一致。
