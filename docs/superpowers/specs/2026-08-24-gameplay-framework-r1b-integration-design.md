# Gameplay Framework 与 Route R1b 融合设计

## 1. 文档状态

- 状态：**Approved for phased implementation**。G19-2B/G19-3 可继续；共享 G19-1/G19-4+ 等待
  R1b Task 9/10 atomic cutover 与 completion review。
- 日期：2026-08-24。
- 当前集成分支 fork 基线：`codex/r1b-integration@1bf9f5d`。
- 最新权威未来基线：`codex/r1b-integration@df9f674`；已含 R1b Task 6–8，多 Surface Graph、
  Static Surface Runtime correlation 与 Route Evidence V2/V5 staging；Task 9/10 cutover/review 仍未完成。
- 参考实现：PR #19 `codex/gameplay-framework-implementation` 的 `faab0fd`。
- 当前 main：`9c5a615`。
- 相机收口参考：`aurora/p15-camera-tuning-cleanup` 的 `854dbff`。
- 实施分支：`codex/pr19-gameplay-r1b-integration`。

基线状态说明：fork 点 `1bf9f5d` 已完成 R1b Task 1–4；最新 `df9f674` 又完成 Task 6–8 的
multi-Surface Graph、Runtime Support correlation、Validation/Route Evidence V2 与 Browser V5 staging。
Task 9 的原子 V1→V2/V4→V5 cutover 和 Task 10 completion review 仍由 `codex/r1b-integration` 后续提交完成。因此本文先实施
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

### 2.1 未发布项目的版本清理原则

本项目尚未发布，也没有必须回放的生产 WorldPackage 或外部稳定消费者。G19 的最终交付因此采用
**clean break**，不把开发历史升级成长期兼容合同：

- Outdoor、Authoring、Compiler、Runtime、Browser、CLI、Capture、示例与生成类型最终只消费同一套
  当前权威协议；被新版取代的 Authoring、Normalized IR、ExecutionPlan、Snapshot 或 Browser 版本不得
  以 union、alias、converter、fallback read、双写或双发布的形式留在生产路径；
- 版本后缀本身不是删除依据。尚未被新版取代的初始 V1 合同可以继续作为权威合同；只有存在新版替代且
  已无权威消费者的旧方言属于兼容债务；
- G19-7 必须先把六个 Outdoor 目录场景迁到当前 Authoring V4 → Normalized IR V4 →
  ExecutionPlan V5 → Snapshot V4 / Browser V5 链路，并保持 artifact-only 渲染器隔离；
- G19-8 必须执行生产消费者 census，并删除已无消费者的旧声明、导出、parser、fixture 和兼容分支；
- 本轮确因尚未迁移模块而不能删除的项，必须在 completion review 中逐项登记符号、文件、真实消费者、
  阻塞原因、删除门禁和后续任务。禁止只写“为了兼容”或留下无 owner 的 TODO；
- 历史设计/评审文档可以保留旧版本名称作为可追溯记录，但不能成为生产 census 的例外消费者。

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
| Command→Transition 对应关系 | GameplayState 私有 provenance + Dispatcher authority port | RuntimeHost transaction | Handler 返回另一个 command 的合法 Plan |
| Canonical World State artifact | WorldSession artifact store | Receipt、Browser、Take/Capture | 只缓存 latest 导致历史 Receipt 悬空 |
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
   Babylon、Route、Capture 或 Registry。所有可序列化的 Entity Descriptor、Feature Manifest/Lock、
   Action Definition、Gameplay Bootstrap 和容量合同都属于这一层。
2. `gameplay` 是纯 TypeScript 规则层，只依赖 `gameplay-contracts`；Factory、Handler、State Slice、
   Catalog index 和运行时 lifecycle 留在行为包，不能反向成为 WorldPackage/Compiler 的依赖。
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
在 invisible prepare 阶段 abort 并保留 A；publication 开始后只允许 no-throw pointer swap。若期望关系已经过期，稳定返回 `CONTROL_POSSESSION_STALE`，不得先 release 再由
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
      commandHash: `sha256:${string}`;
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
      commandHash: `sha256:${string}`;
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
      commandHash: `sha256:${string}`;
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
WorldSession 失败。abort failure 必须返回 failed，并使 WorldSession fail closed。

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
  不作为第二个 World State Hash 权威；它只能作为同一 `WorldSessionPublicationV1` 中已提交
  World State 的查询索引发布，不能被独立写入或回灌；
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
和 inspection 的 Participant/Controller 引用必须存在且角色兼容。静态 Fact endpoint 可以只存在于
锁定 WorldPackage；Standalone parser 拒绝 State Map 中已知但角色错误的 endpoint，G19-4 再以
WorldPackage Root 闭包完成全部引用 membership，不能把真正 dangling graph 冻结为 Canonical State。

每条 Fact 必须携带锁定 `semanticFactProjectorProfileRef/hash`。Fact ID 由 type、角色化 canonical
端点、`startedSimulationTick` 和该 Profile Ref/Hash 派生，连续期间会变化的 support point/normal
不进入身份。parser 必须重算并拒绝任意命名或不匹配的 Fact ID。`semantic-fact.started/ended`
Event 都携带 exact `semanticFact` 快照以支持 standalone audit/begin-end 配对；physics-derived Fact
Event 不伪造 `commandId`。started Event 的 `simulationTick` 必须等于 Fact
`startedSimulationTick`；ended Event 的 Tick 必须大于等于 Fact started Tick。

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
- `maximumSemanticFactCount`；
- `maximumSemanticFactTransitionCountPerTick`；
- `maximumIdempotencyRecordCount`；
- `maximumUsedActionExecutionIdCount`；
- `maximumRetainedReceiptCount`；
- `maximumRetainedEventCount`；
- `maximumRetainedWorldStateSnapshotCount`。

默认 trusted local profile 使用确定值：`1/1/1/256/16/256/4096/1024/4096/4096/4096/8192/4096`。所有字段必须是
非负 safe integer。事务在 Adapter prepare 前一次性预留所需 relationship/action/receipt/
event/idempotency slots。

`maximumUsedActionExecutionIdCount` 独立约束永久保留的 Action execution ID；不得把它暗中
计入 `maximumIdempotencyRecordCount`，也不得淘汰后允许同一 execution ID 被另一命令复用。

预算耗尽时拒绝新的状态改变并返回稳定 Diagnostic；不得淘汰 command idempotency 或 Event
历史后继续运行，从而让相同命令在同一 WorldSession 获得不同结果。Reset 创建新
WorldSession 并获得新预算。

`RuntimeHost` 在自身生命周期内保留 used WorldSession ID 与 Runtime Activity request record，以拒绝
旧 ID 复活；这两个集合分别受 Host 级 `maximumWorldSessionCount` 与
`maximumRuntimeActivityRecordCount` 约束，不能无界增长或淘汰后复用。达到上限返回稳定
`RUNTIME_HOST_CAPACITY_EXCEEDED`。WorldSession ID factory 必须生成不可复用 ID，重复时初始化失败。

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
- Action 的 canonical owner 是 `actorEntityId`，不是启动它的 Controller。Action 执行内部不得再保存
  `controllerEntityId` 作为第二套所有权；`action.cancel` 由命令提交时当前拥有该 actor 的 Controller
  授权。因此 release/rebind 不隐式取消或阻塞 actor 的 Action，之后拥有该 actor 的 Controller 可以
  cancel；`isMovementInputBlocked` 只控制当前指向该 actor 的移动输入，不得扩张为 possession policy。
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
Feature manifest Ref 与输入 Resource Lock Ref 必须是精确一一对应的闭集，既不能缺锁，也不能留下
没有 Factory 的多余锁。Factory 一旦返回实例就先进入 lifecycle record，再验证 ref、Handler 数量、
唯一 type 和可执行 `plan` 形状；这些验证失败也必须对该实例执行 `dispose(context, undefined)`，并在
cleanup 失败时保留 primary error 后聚合错误。

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

Action Transition Plan 是纯 Gameplay 层的内部事务凭据，而不是可序列化或可由 Feature 构造的开放
Schema。每个 `GameplayState` 以实例私有 provenance 登记自己签发并深冻结的 Plan；staged projection
与 commit 在读取变化内容前先拒绝伪造、复制或其他 State 签发的 Plan，成功 commit 后消费该凭据。
Feature Handler 只能调用受限 planning port，不能直接提交结构化 Relationship/Action changes 或伪造
capacity/Event delta。仅证明“由同一 State 签发”仍不充分：command Plan 的 provenance 必须同时绑定
canonical `commandHash`、command ID/type 和 `simulationTick`；natural completion 绑定 system type/tick。
Handler 只得到不含授权方法的 planning port。Dispatcher 使用独立 trusted authority port，把返回的
Plan 与当前 exact canonical command/tick 对拍并授权；未经过该路径、为另一个 command 签发或 changed
payload 的 Plan 不能进入 staged projection/commit。授权阶段完成全部 canonical hash/解析，最终 commit
只检查已缓存的 opaque authorization/provenance/revision 并做不可失败的 pointer swap。

used `actionExecutionId` 使用独立永久集合和独立容量预算；不得因 command record eviction 重用。
同 Tick 到期的 Action 按 scheduled Tick、再按 execution ID 排序；natural completion 不携带
`commandId`。

Transition capacity delta 使用 exact `immediateEventCount` 与有符号
`terminalEventReservationCountDelta`。activate 立即写 started Event 并为该 execution 预留一个 terminal
Event；cancel/natural completion 以 `-1` 消耗该 reservation 并写 terminal Event。State 必须按 active
execution 持有 reservation，staged projection 验证总量，任何 rejected/abort 路径不得泄漏；同 Tick 多个
completion 仍按 execution ID 稳定结算。

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
- 活跃 Runtime Activity（Runtime Run、Simulation Take 或 Control Capture）阻止 reset/replace；
- 部分构造、abort 失败和 no-throw commit 合同违反都按稳定顺序释放并使 Session failed；
- Host dispose、replace、command 和 fixed-input 共享串行 barrier，不能观察半提交状态。

Host 不能从 ExecutionPlan 猜测 WorldPackage 身份，也不能硬编码 Participant/Controller。首批组合根
使用以下关闭输入；这些输入在创建 Session 前 snapshot、校验并冻结：

```ts
interface GameplayBootstrapV1 {
  readonly kind: "gameplay-bootstrap";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly contentHash: `sha256:${string}`;
  readonly entityDescriptors: readonly GameplayEntityDescriptorV1[];
  readonly featureResourceLocks: readonly GameplayFeatureResourceLockV1[];
  readonly semanticActionDefinitions: readonly GameplayActionDefinitionV1[];
  readonly availableCapabilityRefs: readonly string[];
}

interface RuntimeWorldConfigurationV1 {
  readonly executionPlan: ExecutionPlanV5;
  readonly executionPlanHash: `sha256:${string}`;
  readonly worldPackageRef: string;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
}

interface RuntimeHostCapacityBudgetV1 {
  readonly maximumWorldSessionCount: number;
  readonly maximumRuntimeActivityRecordCount: number;
}

interface RuntimeHostCreateOptionsV1 {
  readonly runtimeSessionId: string;
  readonly initialWorld: RuntimeWorldConfigurationV1;
  readonly participantStates: readonly GameplayParticipantStateV1[];
  readonly controllerStates: readonly GameplayControllerStateV1[];
  readonly fixedInputControllerEntityId: string;
  readonly gameplayModeFactory: () => GameplayModeV1;
  readonly gameplayFeatureFactories: readonly GameplayFeatureFactoryV1[];
  readonly gameplayActionRequestResolver?: GameplayActionRequestResolverV1;
  readonly gameplayCapacityBudget: GameplayCapacityBudgetV1;
  readonly runtimeHostCapacityBudget: RuntimeHostCapacityBudgetV1;
  readonly adapterFactory: GameplayWorldAdapterFactoryV1;
  readonly worldSessionIdFactory: () => string;
}
```

`executionPlanHash` 必须与传入 Plan 的 canonical hash 一致；WorldPackage Ref 与通过 Build Receipt
验证的 `worldPackageRootHash` 是独立锁，不能从 Plan Hash 反推或让调用方再传一份竞争 Root Hash。
`GameplayBootstrapV1.contentHash` 覆盖除自身外的完整声明，Feature factories、
Action Catalog、Entity descriptors 与 available Capability 必须逐项对拍该 Bootstrap。Participant/
Controller 属于 Host bootstrap policy，Core 不提供默认 ID。ID factory 产生的 WorldSession ID 在同一
RuntimeHost 生命周期内不可复用，重复值使 candidate 初始化失败。

`fixedInputControllerEntityId` 是 trusted Host composition lane，不进入 Canonical Schema、Browser 或
`FixedInputV1`。它必须引用注入且 lifecycle 为 `active` 的 Controller Entity；WorldSession 以该 Controller 的 committed
`possessedBy` 关系解释 fixed input，并在其 actor 的 blocking Action 活跃时只中和移动 Action 与连续移动
axes，保留 Camera、Aim 和非移动语义 Action。这样首期单输入 lane 不依赖 View State 猜测控制权，后续
多人物 CLI 可在公开协议冻结时显式选择 Controller，而无需改写 GameplayState 或 Babylon Port。

Bootstrap 的四个语义集合必须使用唯一 canonical order：`entityDescriptors` 按 `id`，
`featureResourceLocks` 与 `semanticActionDefinitions` 按 `resourceRef`，`availableCapabilityRefs` 按
Unicode lexical order。builder 负责排序和拒绝重复 id/ref；serialized parser 拒绝重复项与非 canonical
顺序。数组输入顺序不能改变 Bootstrap content hash、Plan hash 或 WorldPackage root。

Task 4 可以先实现 Bootstrap 自身的 canonical hash/lock 校验，但 RuntimeHost 在 Task 6 把
`gameplay-bootstrap` 加入唯一 ExecutionPlan Resource Lock 并验证 WorldPackage membership 前不得暴露给
Browser/CLI 或宣称 production-ready。Task 6 只增加这一个聚合资源种类；Feature/Action 内部锁由
Bootstrap hash 覆盖，避免在 Plan 根部复制第二套目录。Bootstrap 以 canonical JSON 写入固定 artifact
`gameplay/bootstrap.json`，media type 为
`application/vnd.worldkit.gameplay-bootstrap+json`。Host 必须验证 Build Receipt/root、Manifest resource
row、file-integrity bytes hash、Bootstrap 自身 content hash 与 Plan 的 `gameplay-bootstrap` Resource Lock
完整闭环；只有 `worldPackageRef + WorldPackageBuildReceiptV1 + canonical GameplayBootstrapV1` 不能缺少
其中任一 membership proof。

World State artifact 身份采用内容域隔离派生，不使用只含 Tick 的路径：

```text
snapshot.id = "world-state:" + SHA-256(canonical({
  runtimeSessionId, worldSessionId, worldStateHash
}))
snapshotRef = "worldkit://world-state/" + snapshot.id
receipt.id = "gameplay-receipt:" + SHA-256(canonical(receipt-without-id))
```

Receipt Base 新增 `commandHash`，证明 exact canonical command bytes。changed-payload conflict 与
admission-closed synthesis 使用调用方这次 payload 的 Hash，因此不会与原 Receipt 或同 ID 的另一份
payload 发生身份碰撞。Task 2 parser 必须重算并拒绝不匹配的 Snapshot/Receipt ID；不能只在 Host
生成时遵守公式。因此同 Tick 的连续命令不会覆盖 Artifact，相同 Command replay 得到同一 Receipt
ID；committed Receipt parser 必须用自身 runtime/world session 和 `worldStateAfterHash` 重算
`worldStateAfterRef` 并拒绝不匹配，Host 还要证明它指向该次提交后缓存的 exact Snapshot。

每个 committed Receipt 引用的 Snapshot 必须进入 WorldSession 的 append-only
`WorldStateArtifactStoreV1`，按 canonical Ref 查询，直到 Session dispose；不能只保留 latest pointer。
`GameplayCapacityBudgetV1` 增加 `maximumRetainedWorldStateSnapshotCount`，command 在 Adapter prepare 前
预留一个可能的新 artifact 槽，rejection 释放预留，容量耗尽时与 Receipt/idempotency 一起关闭新 command
admission。Fixed input 可以替换 latest Snapshot 而不永久保留每个 Tick；需要完整逐 Tick trajectory 时由
Simulation Take/Capture artifact sink 接收。Browser V5 必须提供 exact
`getWorldStateSnapshot({ worldStateRef })`，只返回当前或 retained canonical artifact；未知/其他 Session Ref
fail closed。这样历史 Receipt 不会在下一次提交后成为 dangling Ref。

### 9.2 GameplayWorldPort

端口只暴露领域能力和 Adapter 自己拥有的 canonical projection：

```ts
interface GameplayWorldStateProjectionV1 {
  readonly simulationTick: number;
  readonly spatialEntityStatesById: Readonly<Record<string, SpatialEntityStateV1>>;
  readonly capabilityStatesById: Readonly<Record<string, GameplayCapabilityStateV1>>;
  readonly semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>>;
}

interface GameplayFixedInputCapacityEstimateV1 {
  readonly maximumSemanticFactCountAfterInput: number;
  readonly maximumSemanticFactTransitionEventCount: number;
}

type FixedInputOneTickV1 = Omit<FixedInputV1, "ticks"> & { readonly ticks: 1 };

interface GameplayWorldTransactionV1 {
  readonly projectedWorldStateAfter: GameplayWorldStateProjectionV1;
  readonly projectedViewStateAfter: GameplayViewStateProjectionV1;
  commitPrepared(): void;
  abort(): Promise<void>;
}

interface GameplayWorldPortV1 {
  initialize(): Promise<GameplayWorldStateProjectionV1>;
  hasEntity(entityId: string): boolean;
  isEntityControllable(controlledEntityId: string): boolean;
  isActionAvailable(actorEntityId: string, semanticActionRef: string): boolean;
  prepareGameplayTransition(
    transition: GameplayWorldTransitionV1,
  ): Promise<GameplayWorldTransactionV1>;
  estimateFixedInputTickCapacity(
    input: FixedInputOneTickV1,
  ): GameplayFixedInputCapacityEstimateV1;
  runFixedInputTick(
    input: FixedInputOneTickV1,
  ): Promise<GameplayWorldStateProjectionV1>;
  snapshot(): GameplayWorldStateProjectionV1;
  dispose(): Promise<void>;
}
```

`GameplayViewStateProjectionV1` 是 RuntimeHost 内部的 provider-neutral staged View revision DTO，
首期只携带 `viewStateRevision`。它不保存 `controlledEntityId`、Profile 或 Camera 数字；Task 7 的
Camera target 必须从已提交 `possessedBy` 派生，并由现行 View contract/CameraDirector 持有，不能
提前复制或发明第二份 Browser Schema。

Capture/Render Ready 作为相同 provider-neutral port 的可选能力接口组合，不进入 State Projection。
Projection 只含 Adapter 权威的 Spatial Entity/Capability/Fact/Tick；Controller Entity 由
GameplayState 使用冻结 bootstrap 身份加入，Relationship/Action 同样由 GameplayState 投影。Session
phase、Receipt/Event journal、Camera 和 Runtime health 由各自 owner 投影。若 Adapter 返回或覆盖
Controller Entity，端口解析必须拒绝，不能依靠 map 合并顺序决定权威。

`GameplayWorldTransactionV1` 是 staged transaction：`projectedWorldStateAfter/projectedViewStateAfter`
在 prepare 返回前已完成解析、深冻结和资源准备，但对当前 Adapter、Camera、render/capture 均不可见；
`commitPrepared()` 只能做同步、no-throw 的预构造 pointer swap，`abort()` 释放临时资源且返回同一
Promise。端口、Projection 和错误不得出现 `babylon-havok`、Mesh、PhysicsBody、AnimationGroup、
Camera Handle 或 provider message。

`prepareGameplayTransition()` 必须对外部 Runtime State 严格无副作用。prepare 内部申请的临时资源
使用局部 cleanup stack，在 reject 前全部释放；只有 Publication Bundle 已完整冻结后的最终同步临界区
可以调用 `commitPrepared()`。因此 prepare rejection 不需要一个调用方无法取得的 compensating handle。
Render scheduler、Render Ready 和 Capture 在 mutation 进行期间只能读取上一 published epoch；最终同步
临界区依次 swap Adapter staged state、Gameplay staged state、View State 与 Publication Bundle，中间不
`await`、不分配、不解析、不调用扩展代码，浏览器事件循环无法观察半提交 Camera/possession。

### 9.3 命令事务、缓存与失败语义

一个 Gameplay Command 在唯一 Host barrier 内按以下顺序执行：

1. snapshot 并解析不可信输入，得到 canonical command bytes；
2. 查 idempotency：同 ID/同 bytes 返回 retained Receipt，同 ID/不同 bytes 返回
   `COMMAND_ID_CONFLICT`；
3. 预留 command record 与 Receipt；验证 RuntimeSession、WorldSession 和 phase；
4. Task 3 纯规划并计算 Relationship/Action/used execution ID/immediate Event/terminal reservation 的最坏容量增量；
5. 查询 Adapter availability，在任何 prepare 前完成全部容量检查；
6. Adapter prepare 返回完全不可见的 staged transaction；prepare 失败是
   `rejected/ADAPTER_PREPARE_FAILED` 且无 Event；
7. 校验 staged World/View after-projection，不改变当前 Camera/render state；
8. 使用 Task 3 staged projection、planned next Gameplay maps 与预分配的 Event IDs/sequence，预构造并
   parse/freeze 完整 Publication Bundle：next journals、Events、Receipt、Canonical World State、
   retained artifact delta、inspection、View State 和 Runtime Snapshot；
9. 进入同步 publication critical section，阻止 render/capture 读取中间 epoch；
10. 不 `await` 地执行 Adapter `commitPrepared()`、GameplayState cached commit 和一个 Publication Bundle
    pointer swap，然后开放新 published epoch。

同步 `snapshot()` 永远只返回最后一次完整提交的缓存，禁止在 transaction 中途重新读取 Adapter。
Rebind 的 Event 顺序固定为 `relationship.removed` 后 `relationship.committed`。

Task 3 staged projection 必须验证 revision、before-images 和 capacity，但不改状态；在同一 barrier 中
且 revision 未改变时，最终 `commit()` 不得再执行新的 fallible 解析/构造。Publication Bundle 的 Array/
Map/object 都在 step 8 完成分配和深冻结，step 10 不能追加 Event 或临时构造 Receipt。这样 logical
commit 后只剩不可失败的内部 pointer swaps；不为 GameplayState 增加 publication 后补偿路径。

prepare/validation/publication bundle 构造失败时调用 staged transaction `abort()`，保留旧 Adapter、
Camera、Gameplay 与 published Snapshot，返回 rejected/failed 的稳定语义。若 `abort()` reject/throw，
保留 primary transaction failure 并聚合内部 cleanup evidence，公开稳定 `ADAPTER_ABORT_FAILED`，Session
fail closed 并进入 full Session dispose；最后 published Snapshot 仍可作为证据读取，但不得继续推进。
Provider cause/message 不得进入公开 Diagnostic。`commitPrepared()` 和最终
pointer swaps 按合同不可抛；若实现违反 no-throw 合同，Session 立即 fail closed 并记录预留的
`world.failed` Event，不能尝试把已部分 swap 的可见状态伪装回 ready。每个进入 prepare 的事务仍在最大
成功 Event 数之外预留一个 failure Event 槽。Staged projection 不满足 Canonical Schema 时必须 abort，
不能发布半状态。

Browser/CLI 仍可提交 `FixedInputV1 { ticks: N }`，但 RuntimeHost 在一个 mutation admission 内严格拆为
N 个 `FixedInputOneTickV1`。每个 Tick 推进前调用无副作用的 `estimateFixedInputTickCapacity()`，为该 Tick
Fact begin/end、natural Action completion 和 failure Event 预留容量；`runFixedInputTick()` 只允许
`ticks === 1` 并返回该 Tick 末 projection。Host 逐 Tick 对比 Fact ID、发布 ordered Events/Snapshot，
再进入下一 Tick。这样同一批输入中间 Tick 出现又消失的 `touching/supportedBy/insideVolume` 不会被首尾
状态抵消。实际 Fact delta 不得超过该 Tick estimate；`ticks === 0` 只返回上一 published Snapshot。
同 Tick 的跨类别 Event 顺序冻结为：按 Fact ID code-unit 排序的全部 `semantic-fact.ended`，再按 Fact ID
排序的全部 `semantic-fact.started`，最后是 GameplayState 已按 scheduled Tick、Action Execution ID 排序的
`action.completed`。这一顺序不能由 Adapter map 插入顺序、Promise 完成顺序或 provider callback 顺序决定。

Physics fixed step 不能通用 rollback；如果事前无法证明容量则在推进前拒绝本段。如果 Adapter
fixed input、projection、estimate breach 或理论上不应失败的预验证 logical commit 失败，Session
直接 fail closed、保留上一份公开 Snapshot 并进入清理路径，不能继续使用已经漂移的 Adapter。

### 9.4 容量关闭、Runtime Activity 与替换

普通 rejection 在 journal 容量尚可时写入 idempotency/Receipt，以保证 replay bytes 相同。当
idempotency 或 retained Receipt 容量将被第 N+1 个新 Command 超过时，WorldSession 在当时 Tick 记录
不可逆的 `commandAdmissionClosedSimulationTick`：

- 既有 command replay 继续返回原 Receipt；
- 所有新 command 返回按 command ID 可重算的 `GAMEPLAY_CAPACITY_EXCEEDED` rejected Receipt；
- 该合成 Receipt 使用 admission-closed Tick、空 Event，不进入已满 journal；
- fixed input 可以继续推进，但新 command admission 不再重新开放，直到 Reset 创建新 Session。

这样避免为了记录“容量已满”而突破容量，也避免重试随当前 Tick 变化。容量预算新增
`maximumSemanticFactCount` 与 `maximumSemanticFactTransitionCountPerTick`；Adapter 的单 Tick estimate
不得超过 per-Tick 上界。Action activate 还必须占用一个
`reservedTerminalEventCount`，直到 cancel/natural completion 消耗或释放；否则 Event log 接近上限时
Action 可能进入永远无法终止的状态。所有永久集合和 journal 均不淘汰。

`RuntimeActivityLeaseV1` 首批定义在 `runtime-host` 包，属于 trusted in-process orchestration API，不是
Canonical Schema、CLI 或 Browser wire contract，也不修改仍由 R1b 演进的 `runtime-contracts`。
kind 关闭为 `runtime-run | simulation-take | control-capture`，request 使用 exact
`{ kind, requestId, payloadHash }`；retained record 锁定 `kind/requestId/payloadHash/boundWorldSessionId/
runtimeActivityEpoch/status: active|released|terminated-by-host`。lease 持有不可变 record identity、
`AbortSignal`、单次 `registerCleanup(PromiseLike<void>)` 与 release 能力；这些只属于 trusted in-process
orchestration，不序列化到 Browser/CLI。Host dispose 先 abort，再等待已注册 cleanup；未注册 cleanup 的 active
lease 必须由迟到 release 收口，不能让 Host 提前完成销毁。acquire 同 ID/同 payload 幂等、changed payload
冲突；release 幂等；已终态 request 不可复活；
任一 active lease 阻止 reset/replace，但不能阻止 Host dispose。Runtime Run 显式 acquire；Take/Capture
trusted orchestration 在接触 World/View artifact 前自动 acquire，并在 finally release。后续 Browser V5 需要公开控制时，在 Task 8
单独定义并生成对应 wire protocol，不直接序列化进程内 lease 对象。

Host 的 command/fixed-input/reset/replace/dispose 使用同一 mutation queue 做短临界区，但 candidate 的
异步构造不能整段占住 queue。Replace 固定为 single-flight 两阶段 barrier：

1. phase A 在 queue 内检查 `disposeRequested`、全部 active Runtime Activity 和 Host/双驻留容量，设置唯一
   `replacementBuildPending` token，捕获 current WorldSession、`runtimeActivityEpoch` 与 replacement generation；
2. queue 外执行无副作用 preflight 和 candidate build；旧世界的 command/fixed-input/render 继续工作；
3. phase B 重新入 queue，验证 token/current/generation/epoch、无 active lease、未 dispose，再设置
   `replacementCommitPending`，原子 swap current pointer；
4. queue 外逆序释放 old，最终在短 barrier 清理 token。所有 candidate 失败/取消都逆序释放 candidate
   并清 token，不能改 current。

同一 Host 任意时刻只允许 old + 一个 candidate；第二个 replace 在 phase A 稳定拒绝或排队到 token
清理后重新校验，不能并行 build 形成 old+A+B 三重驻留。`disposeRequested` 在入队前同步关闭新 mutation，
会标记 pending replacement cancelled；candidate build 返回后只能 cleanup，不能 swap。Activity
acquire/release 是同步 coordinator 操作，candidate 构造期间的新 acquire 合法绑定 old world 并增加
`runtimeActivityEpoch`，从而令 phase B 取消 swap。`replacementCommitPending` 期间新 acquire fail closed。

`RuntimeWorldReplacementRequestV1` 只包含 exact `RuntimeWorldConfigurationV1`；`reset()` 重用 Host
创建时冻结的 initial configuration，但生成新 WorldSession。Adapter factory 在 candidate 构造前执行
无副作用的 `preflightConcurrentResidency(current, candidate)`，返回 accepted 或稳定
`WORLD_REPLACEMENT_CAPACITY_EXCEEDED` Diagnostic；不得以 provider error/message 作为公开合同。
candidate 必须构造至 ready Snapshot，再令 old 进入 replacing、原子切 current pointer、逆序释放
old。candidate 失败保持 old 可用；swap 后 old dispose 失败也不能把路由切回已经释放中的旧 Session。
Reset 创建 unbound 新 Session，初始 bind 继续由 Playground 显式命令完成。

Host `dispose()` 必须 join queue 外仍在 build/abort 的 candidate，以及 swap 后仍在 dispose 的 retiring
old Session；dispose Promise 只有所有 Host-owned cleanup settle 后才完成，double dispose 返回同一
Promise。candidate build pending 时 dispose 会标记取消，candidate 最终 resolve 后 exactly-once dispose；
cleanup throw 聚合为内部 evidence，不得复活 current route 或导致双重清理。
dispose admission 关闭时原子把全部 active Activity record 标记为 `terminated-by-host`、发出内部取消信号，
并等待 Take/Capture/Run cleanup 与 candidate/retiring cleanup settle；迟到 `release()` 返回同一终态且不抛。

Browser V5 以生成的 provider-neutral `acquireRuntimeActivity(request)` / `releaseRuntimeActivity(request)`
承载跨多次 Browser 调用的 lease；request 必须带 `schemaVersion: 1`、稳定 `id`、关闭 `activityKind` 与
`expectedWorldSessionId`，Host 自行 canonicalize/hash，不能让调用方提交 `payloadHash`。Receipt 返回稳定
`requestId/activityKind/worldSessionId/runtimeActivityEpoch/status`，status 关闭为
`active | released | terminated-by-host | rejected`。同 ID/different payload 冲突，release 是幂等操作。
Simulation Take runner 在第一次 bind/input/capture 前 acquire `simulation-take`，在 `finally` release；单次
`captureControlFrame` 自动持有短 `control-capture` lease。Take 内嵌 capture 允许两个同 Session lease
短暂重叠，不互斥且不递归等待，因此不会双重死锁；外层 Take lease 始终覆盖整个序列。

## 10. ExecutionPlanV5 与 R1b

R1b 的 `ExecutionPlanV5` 是当前权威。仓库为 private `0.0.0` 且没有 release tag，本次采用一次
明确 clean break，不新建 V6：

G19-3 的 `RuntimeHost` 只是 trusted in-process staging：在 R1b completion 前只校验 Plan 的
`kind/schemaVersion`、canonical hash 与 Build Receipt 中的 `executionPlanHash` 一致性，不得由 Loader、CLI
或 Browser 构造。G19-4 必须在 `runtime-contracts` 建立唯一 authoritative V5 closed parser，并让 Host 在
任何 Adapter factory 运行前调用它；随后再加入 `gameplay-bootstrap` 的 Plan Resource Lock、Manifest resource、
file-integrity row、Package root 与 Host input 六方 membership 证明。完成这两项之前，不能把当前 staging
描述为可接收外部 WorldPackage 的生产入口，也不能在 `runtime-host` 复制一份临时 Plan validator。

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

Task 6 同步 clean-break `@whitebox-world/world-package`：Manifest 的 `controlledEntityId` 改为
`initialControlledEntityId`，其值与 ExecutionPlan 一致；BuildReceipt producer 把 canonical
`GameplayBootstrapV1` 作为资源写入 `gameplay/bootstrap.json`，Manifest resource row 与 file integrity
都覆盖该 artifact。`ExecutionResourceKindV1` 增加且只增加 `gameplay-bootstrap`，Compiler 输出唯一对应
Resource Lock。RuntimeHost 以 BuildReceipt/Manifest/resource row/integrity/Bootstrap/Plan lock 六方对拍，
而不是只相信调用方传入的 Root Hash 或 parsed object。

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
- Camera staged transaction 捕获 target、profile、yaw/pitch/distance、
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
- Control Capture / Runtime Activity / Render Ready；
- Subject/Capability/Package inspection；
- Camera Profile 与隔离 Preview；
- `getRouteSummary/getRoutePathReceipt/getRouteRuntimeProbeReceipt/getRouteOverlay`。

在该 exact base 上只新增：

- `executeGameplayCommand(command)`；
- `getGameplayEvents(query)`；
- `getGameplayInspectionSnapshot()` 投影；
- `getWorldStateSnapshot({ worldStateRef })`；
- `acquireRuntimeActivity(request)` / `releaseRuntimeActivity(request)`。

`getGameplayEvents` 隐式限定当前 `worldSessionId`，query exact shape 为
`{ afterEventSequence, maximumEventCount }`：`afterEventSequence` 是 exclusive 的非负 safe integer，
`maximumEventCount` 是受 Host 上限约束的正 safe integer。结果 exact shape 为
`{ events, nextAfterEventSequence, hasMore }`，Events 按 sequence 严格递增；unknown key、unsafe value、
均 fail closed。空页固定返回 `events: []`、`nextAfterEventSequence` 等于输入 cursor、`hasMore: false`。
`getWorldStateSnapshot` 只接受当前 Session 的 canonical Ref，不能
以裸 ID、Tick 或 provider handle 查询。

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
- prepare 失败无可观察 mutation；pre-publication failure 必须 abort；abort 失败或 `commitPrepared()`
  违反 no-throw 合同使 WorldSession fail closed；
- throwing cleanup 保留首个 load-bearing failure，同时记录清理失败为内部 evidence；
- unknown command/field/version、stale session、capacity exhaustion 和 resource mismatch 均 fail closed。

`GameplayDiagnosticV1` 是 exact-key 的 `{ code, message }`，`code` 使用关闭枚举。首批必须至少
覆盖 `INPUT_INVALID`、`COMMAND_ID_CONFLICT`、`CONTROL_POSSESSION_STALE`、
`GAMEPLAY_CAPACITY_EXCEEDED`、`RUNTIME_HOST_CAPACITY_EXCEEDED`、
`WORLD_REPLACEMENT_CAPACITY_EXCEEDED`、`FEATURE_NOT_LOCKED`、`ACTION_CATALOG_INVALID` 与事务
prepare/abort/commit-contract 失败；新增稳定 code 必须与 parser、fixtures、Browser generated types 一起
原子演进。Provider message、stack、cause、handle 和自由 details 袋都不进入该合同。

## 15. 依赖感知实施图

| ID | 目标与可验收交付 | depends_on | blocks | 独占所有权 | 集成点 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G19-0 | 冻结本文与实施计划 | 无 | 全部 | 本文、计划、SDD ledger | R1b `1bf9f5d` | 文档自审、Cursor design CR | main-agent-only |
| G19-1 | 将 Aurora Camera cleanup 语义移植到 R1b | G19-0、R1b completion HEAD | G19-5 | fetch 后由 main-agent 锁定的 Camera/R1b exact ledger | Babylon/Playground Camera boundary | focused camera tests、R1b gates | main-agent-only |
| G19-2 | 干净 Gameplay contracts/core | G19-0 | G19-2A | 新 `gameplay-contracts`、`gameplay` packages | typed interfaces | parser/state/feature/action tests | parallel-safe |
| G19-2A | Snapshot/Receipt identity 与 Semantic Fact capacity 收口 | G19-2 | G19-2B | `gameplay-contracts` exact V1 | RuntimeHost identity/admission | collision、mismatch、Fact N/N+1 | sequential |
| G19-2B | Data-only Gameplay artifact、terminal reservation 与 retention capacity 收口 | G19-2A | G19-3/G19-4 | `gameplay-contracts` schema、`gameplay` lifecycle boundary | Bootstrap/Action/Feature artifacts | dependency direction、canonical order、reservation N/N+1 | sequential |
| G19-3 | RuntimeHost/WorldSession/Port | G19-2B | G19-4/G19-5 | 新 `runtime-host` package | Runtime contracts + Adapter factory | lifecycle/transaction/idempotency tests | sequential |
| G19-4 | 组合 ExecutionPlanV5/Compiler/R1b/WorldPackage | G19-0、G19-2B、G19-3、R1b completion HEAD | G19-5/G19-6 | fetch 后由 main-agent 锁定的 runtime-contracts/compiler/world-package exact ledger | Plan V5 + Package membership | compiler + WorldPackage + Route R1b gates | main-agent-only |
| G19-5 | Babylon Gameplay Port + Camera/Possession | G19-1/G19-3/G19-4 | G19-6 | runtime-babylon、Babylon adapter | GameplayWorldPort | Havok fixed-tick/adversarial runtime tests | sequential |
| G19-6 | Browser V5/Loader/Playground reset | G19-3/G19-4/G19-5 | G19-7 | browser protocol/api、authoring loader、main | RuntimeHost public surface | exact-key、reset/rebind、Route evidence | sequential |
| G19-7 | Outdoor runtime unification与门禁 | G19-6 | G19-8 | outdoor importer、verify script、scene fixtures | current compiler/runtime | six scenes、unknown fail-closed、artifact isolation | sequential |
| G19-8 | 全量审查、修复、发布准备 | 全部 | 无 | review docs、generated evidence | whole branch | full gates + Browser + host completion review | main-agent-only |

G19-2、G19-2A、G19-2B 与 G19-3 可以在 R1b 未完成时依次推进，因为只创建独立 package。G19-1 先于 Camera
Gameplay transaction，避免基于旧 overlay 编写第二套适配；G19-4 必须等 G19-3 与 R1b
completion，不能再作为 parallel-safe 任务提前修改共享 ExecutionPlan/Compiler。

截至 2026-08-24，R1b Task 9–10、PR #24 与 Camera P1.5 已独立合入 main；上述额外依赖已经
满足。G19-4 起必须以最新 main 的 ExecutionPlanV5、Route Evidence V2、Browser V5 和隔离 Camera
Preview 为唯一权威继续实施，不得恢复旧 Browser V4、Route V1 或 Gameplay Camera 数字旁路。

## 16. 强制门禁

### 16.1 合同与单元测试

- Gameplay Command/Receipt/Event/Snapshot exact-key/version/canonicalization；
- committed/rejected 非法组合、accessor/Symbol/unknown-field 拒绝；
- Participant/Controller 单向权威和 Possession 唯一性；
- command idempotency、changed-payload conflict、stale WorldSession；
- capacity exhaustion 不淘汰历史；
- Feature dependency/cycle/activation/reverse cleanup；
- Action availability、fixed-duration、explicit cancel、used execution ID、terminal Event reservation。

### 16.2 Runtime 对抗测试

- bind/release/rebind、空中换绑、旧主体 neutral input；
- reset 创建新 ID、旧命令拒绝、新世界显式重绑；
- release 后 Camera target 为空且真实 pose 不隐藏跟随；
- transaction invisible prepare/abort/no-throw commitPrepared/throwing cleanup；
- exact-command substitution（ID/type/target/payload/Tick）全部拒绝；
- 同一 fixed-input batch 的 transient Fact begin/end 都发布；
- committed Receipt 的历史 `worldStateAfterRef` 可解引用；
- 并发 replace 不形成 old+A+B，Host dispose join pending candidate/retiring old；
- render/capture 只观察完整 published epoch；
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
- `pnpm verify:control-capture`；
- `pnpm verify:validation-capture`；
- `pnpm verify:route-r0-contract`；
- `pnpm verify:route-r1-heightfield`；
- 新 `pnpm verify:outdoor-gameplay`；
- Browser V5 同时证明 Route getters、Gameplay Command、reset/rebind、Camera neutral；
- 六个 Outdoor Scene ready、移动、reset、Route Evidence；
- unknown scene fail closed；
- artifact 页面不创建 RuntimeHost/Browser API。

自动合同证据、真实 Chromium/渲染证据和人工交互证据分别报告，不能互相替代。

## 17. Git 与集成策略

1. 历史实施分支从 `codex/r1b-integration@1bf9f5d` fork；最终融合必须以包含 R1b、Browser V5
   和 Camera P1.5 的最新 main 为基线做三方语义合并，不能把旧 fork 当作当前 Runtime 权威。
2. 每个 G19 Task 形成独立提交和 review disposition。
3. PR #24 与 Camera P1.5 已独立合入 main；Gameplay 分支不得复制、回退或重新解释其权威合同。
4. 将 Gameplay 分支 merge 到最新 main 基线形成独立集成分支，重新跑全部门禁；不在旧分支上硬 rebase。
5. 用户已授权 #19 完整融合后合入 main；只有 G19-4 至 G19-8 的真实 Runtime/Browser 接线与门禁完成后才能执行。
6. 合入后确认 main、origin/main、集成分支 HEAD 和工作树状态，再清理 worktree。

## 18. 完成定义

只有同时满足以下条件，才能宣称 #19 已融合：

- #19 的核心分层在最新 R1b 上有真实 Runtime/Browser 接线，不是孤立包；
- ExecutionPlanV5、Route V2、R1b Surface/Collider/Hash 合同完整保留；
- Possession、Action、Camera、Support、Tick 各只有一个权威 Owner；
- Browser Protocol V5 没有旧 `bindControl` 或 numeric Camera overlay 旁路；
- reset/release/rebind/abort/多实例/容量边界有对抗测试；
- Outdoor playable 与 artifact 路径正确分离；
- 全部门禁和主 Agent completion review 完成，所有成立问题已 disposition；
- 代码、文档、fixtures、generated artifacts 与远端提交状态一致。
