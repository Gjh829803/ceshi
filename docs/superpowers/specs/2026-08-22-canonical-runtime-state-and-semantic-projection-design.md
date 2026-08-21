# Canonical Runtime State 与 Semantic Projection 设计

- 状态：**Draft for review**
- 日期：2026-08-22
- 适用范围：Canonical Runtime、Typed Relationship、Semantic Action、Simulation Take、Control Capture Bundle、Browser/CLI inspection、世界模型训练数据导出
- 当前实现基线：`WorldRuntimeSnapshotV3`、Browser Protocol V3、Simulation Take V1、Control Capture Bundle V1
- 上位规格：[AI-first LEGO 游戏 SDK 总体设计](./2026-08-17-ai-first-lego-game-sdk-design.md)
- 关联规格：[可扩展 Subject Authoring](./2026-08-19-extensible-subject-authoring-design.md)、[Simulation Take 与 Control Capture Bundle](./2026-08-19-simulation-take-control-capture-design.md)、[Control Feel、Physics Medium 与 State Resolver](./2026-08-21-control-feel-physics-medium-state-resolver-design.md)
- 实施入口：`docs/18-refactor-progress-and-backlog.md` 的 P2.1 / M8

## 1. 决策摘要

当前 `WorldRuntimeSnapshotV3` 是一个有意收窄的 Runtime inspection/capture 快照，足以支撑当前固定 Tick、人物运动、相机、Control Capture 和回归验证。它不是错误设计，也不应在当前 M5 Route/Traversal 工作中被仓促推翻。

但是，`WorldRuntimeSnapshotV3` 同时混合了四类不同信息：

1. Subject 的 Gameplay/Physics 状态；
2. Camera 的观察状态；
3. Runtime Backend、Ready 和资源计数等运维状态；
4. 当前 Controller 的便捷投影。

它没有正式表达动态 Relationship、Action Instance、Semantic Physics Fact、Command Receipt 和 Event，因此不能直接升级为长期 World Model Ground Truth。

本设计选择以下目标结构：

```text
WorldPackage / ExecutionPlan                    不随 Tick 重复的世界结构

WorldStateSnapshot(t)                           可复现的世界语义状态
ViewStateSnapshot(t)                            Camera / Capture 观察状态
RuntimeStatusSnapshot(t)                        Backend / Ready / Budget / Diagnostic
TransitionLog(t0, t1]                           Command / Receipt / Event

ControlCaptureFrame
  └── refs(WorldState, ViewState, TransitionLog) + rendered passes
```

核心决策：

- 不把所有内容继续塞进 `SubjectRuntimeStateV3`。
- 不把 Event 当作 State；Event 描述两个已提交状态之间发生的变化。
- 不把 Havok Handle、Contact Manifold、Solver Impulse 或 Babylon Node 暴露为 Canonical State。
- Entity Core State 与可扩展 Capability State 分开建模。
- 权威 Relationship 与物理派生 Semantic Fact 分开建模。
- World Model 的完整输入由 WorldPackage、Tick Snapshot、Transition Log 和 Capture Pass 组合得到，而不是由一个巨大 JSON 独自承担。
- P2.1 第一条纵向切片使用“人—滑板”：`mountedOn` 是权威关系，`supportedBy` 是派生事实，Mount/Dismount 是 Action，绑定/解绑产生 Receipt 与 Event。

## 2. 当前基线与明确缺口

### 2.1 当前 Snapshot 能稳定表达什么

`WorldRuntimeSnapshotV3` 当前包含：

- `tick`、`ready` 和当前受控 Entity；
- `controllersById`；
- 每个 Subject 的 Definition Ref/Hash、位置、速度、朝向、Movement Medium、Locomotion Mode、Active Action 和活动 Profile；
- Camera 目标、位置、Rig/Profile/Modifier 和视角偏移；
- Physics Backend、固定时间步与资源计数。

这满足当前已交付窄切片：

- Ground/Air 固定 Tick 运动；
- `idle/walk/run/jump` 动作状态；
- 多 Subject 控制切换；
- Runtime inspection；
- Control Capture Frame 中的状态证据；
- 当前锁定 Runtime 构建下的确定性回归。

### 2.2 当前缺口

当前实现缺少：

- 可以同时存在多条边的 `relationshipStatesById`；
- 不依赖人物字段的 `capabilityStatesById`，例如 Locomotion、Door、Health 或 Vehicle State；
- Action Request/Instance/Phase/Receipt 的公共合同；
- `supportedBy`、`touching`、`insideVolume` 等稳定语义事实；
- Relationship/Action/Fact 的 begin/change/end Event；
- World 实例唯一身份与旧世界迟到消息隔离；
- Snapshot 与 Transition Log 的明确关联；
- Event/Action/Relationship Receipt 到 Control Capture Bundle 的真实写入；
- 完整 Replay/Resume 所需的状态与构建指纹闭环。

当前 `SubjectRuntimeStateV3.relationshipRole` 是单值摘要，而且 Runtime 只发布 `none`。一个 Entity 可以同时被控制、骑乘、持有物品并处于容器或约束中，因此该字段不能扩展成更多枚举；目标协议落地时应删除，由正式 Relationship State 取代。

### 2.3 当前不能宣称的能力

- Snapshot V3 本身不是完整 Replay 制品。
- 固定 Tick 不等于跨任意浏览器、GPU、CPU 或 Physics 构建 bit-exact。
- 空的 Receipt Track 不等于已经支持 Event/Action/Relationship Receipt。
- `relationshipRole: "none"` 不等于通用 Relationship Framework 已存在。
- Physics Backend 状态不等于 World Model Ground Truth。

## 3. 业界方案对照与本项目取舍

本设计不照搬任一引擎或标准的字段，而是提取已经被成熟系统反复验证的边界。

### 3.1 ASAM OSI：Ground Truth 是带版本和模拟时间的完整状态投影

[ASAM Open Simulation Interface GroundTruth](https://opensimulationinterface.github.io/osi-antora-generator/asamosi/latest/gen/structosi3_1_1GroundTruth.html) 将 Ground Truth 定义为仿真环境在某个时间点的数据，显式携带接口版本、Timestamp、Moving/Stationary Object、环境条件以及 Map/Model Reference。它要求 Ground Truth 字段完整设置，并禁止使用 unknown 枚举作为有效真相。

本项目采用：

- Snapshot 必须有 `schemaVersion`、`simulationTick` 和唯一 World 实例身份；
- 使用稳定 Entity ID 与 WorldPackage/ExecutionPlan Hash 关联结构和状态；
- 公共枚举关闭，不能用 `unknown` 掩盖未实现能力；
- Static World Structure 可以通过 Package/Model Ref 关联，不要求每 Tick 重复全部静态几何。

本项目不采用 OSI 的道路交通对象分类，因为我们的 Entity 能力组合不能被车辆领域类型树限制。

### 3.2 OpenUSD：结构、属性和 Relationship 各有职责

[OpenUSD UsdPrim](https://openusd.org/release/api/class_usd_prim.html) 把 Prim 作为持久 Scene Description 容器，属性可以保存默认值或 Time Sample；[UsdRelationship](https://openusd.org/release/api/class_usd_relationship.html) 使用稳定路径连接其他对象，并参与组合和依赖解析。USD Relationship 是 uniform 的，不是逐 Tick Gameplay 关系日志。

本项目采用：

- Entity 使用稳定 ID，Relationship 是显式边，不用父子 Transform 代替 Gameplay 关系；
- WorldPackage 保存持久结构，Runtime Snapshot 保存 Tick 状态；
- 初始 Relationship 可以编译进 WorldPackage，动态 Relationship 由 Runtime Transaction 管理；
- Relationship 端点引用稳定 Entity，而不是 Babylon Node 或数组下标。

本项目不直接采用 USD 的通用 target path 作为 AI Schema。AI-facing 合同继续使用 `riderEntityId`、`mountEntityId`、`itemEntityId`、`wearerEntityId` 等角色化端点；通用 source/target 只允许出现在内部 Normalized IR。

### 3.3 Unity Entities：公开状态是数据，System 只拥有行为

[Unity Entities](https://docs.unity.cn/Packages/com.unity.entities%401.3/manual/components-intro.html) 将 Component 定义为 Entity 数据，将读写行为放在 System 中；结构变化通过延迟命令在安全边界提交，而不是在遍历期间直接改变结构。[Unity System Data 指南](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/systems-data.html) 也建议把公开数据放在 Component，而不是暴露 System 实例。

本项目采用：

- Snapshot/Relationship/Fact/Action State 是纯可序列化数据；
- Resolver、Projector 和 Transaction Handler 是行为，不进入 Snapshot；
- Relationship 和 Capability 结构变化在 Fixed Tick Phase Barrier 原子提交；
- 公共协议不能持有 Runtime System、Physics Body 或 Camera Director 引用。

本项目不要求内部必须使用 Unity 风格 ECS 存储；该原则约束的是公共所有权与数据边界，不是内存布局。

### 3.4 Unreal Gameplay Framework：规则、可观察状态、Controller 与 Pawn 分离

[Unreal Gameplay Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-framework-in-unreal-engine) 将 Game Mode、Game State、Controller、Pawn 和 Camera 分成不同职责；Game State 用于可观察游戏状态，Controller 通过 Possession 控制 Pawn，Pawn 不要求是人形。

本项目采用：

- Rule/Mode 不等于 State；
- ControllerEntity 与可见/可碰撞 Entity 分离；
- `possessedBy` 是控制权真相，Camera 与 Input 消费其提交结果；
- Subject 类别不决定能力，人、马、汽车、滑板和飞龙使用同一 Entity/Capability/Relationship 原则。

本项目不采用 UObject、Actor 继承树、服务器复制语义或引擎特定生命周期。

### 3.5 RLDS：训练轨迹必须明确 Observation 与 Action 的时间对齐

[Google RLDS](https://github.com/google-research/rlds) 将数据组织为 Episode 和 Step；Step 区分 observation、action、首帧、末帧、terminal 与 truncated，并明确 action 与 observation 的时间对齐。

本项目采用：

- 一次 Simulation Take/Runtime Session 输出有边界的 Episode；
- Step 必须明确 `stateBefore`、本 Tick Command/Intent 和 `stateAfter` 的关联；
- completed、failed、cancelled、truncated 使用关闭状态，不把不完整运行伪装为成功；
- Dataset Adapter 可以把 Canonical Bundle 转成 RLDS/训练格式，但 RLDS 字段不进入 Runtime Schema。

### 3.6 结论

业界成熟方案共同支持以下原则：

1. 持久世界结构与逐 Tick 状态分离；
2. 状态数据与执行行为分离；
3. 关系使用稳定引用，不依赖 Scene Graph 父子关系；
4. 结构变化在明确边界提交；
5. 训练轨迹明确 Observation、Action 和 Transition 的时间对齐；
6. 引擎内部状态通过稳定语义投影对外暴露。

## 4. 目标与非目标

### 4.1 目标

- 提供引擎无关、确定性排序、可哈希的 Tick 状态投影。
- 表达 Entity、Controller、Capability、Relationship、Action 和 Semantic Fact。
- 为每次变化提供可关联的 Command、Receipt 与 Event。
- 为 Control Capture Bundle 和未来 World Model Dataset Adapter 提供稳定输入。
- 保持 AI-facing Schema 角色明确、关闭枚举、无通用参数袋。
- 保持 Babylon/Havok 为 Provider Adapter，不泄漏 Handle 或 Provider Error。
- 支持同一个 WorldPackage 创建多个相互隔离的 World Session。
- 支持 Full Snapshot；Delta/压缩是传输优化，不能形成第二套语义。

### 4.2 非目标

- 不在本设计中实现 Networking、服务器复制或 Rollback Netcode。
- 不承诺跨所有硬件/浏览器的 Physics bit-exact。
- 不定义通用因果推理图或让 Runtime 猜测自然语言原因。
- 不把所有底层 Contact、Impulse、Constraint Row 导出为训练标签。
- 不实现 NPC、任务、战斗、游泳、飞行或车辆规则。
- 不在当前 M5 中立即替换 Snapshot V3。
- 不要求内部 Runtime 改成某一种 ECS 框架。

## 5. 备选方案与决策

### 5.1 方案 A：继续扩充 `WorldRuntimeSnapshotV3`

做法：把 Relationship、Fact、Event、Action 和更多 Physics 字段都加进现有对象。

优点：短期改动少，Browser 调用方式不变。

缺点：Gameplay Truth、View、Backend 健康状态和 Transition Log 继续混杂；每个新能力都会增加可选字段，最终形成无法判断权威来源的“大对象”。

结论：不采用。

### 5.2 方案 B：纯 Event Sourcing

做法：只保存初始 WorldPackage 和所有 Event，通过回放 Event 重建任意 Tick 状态。

优点：历史和审计天然完整。

缺点：Physics 连续状态、浮点误差、版本升级和长 Episode 重建成本高；Event 并不等于完整状态，丢失任何派生值都会导致重建不一致。

结论：不采用为 Runtime 真相。Event Log 保留审计和 Transition 价值，但 Snapshot 仍是一等制品。

### 5.3 方案 C：结构 + Snapshot + Transition Log 混合模型

做法：WorldPackage 保存结构；World/View Snapshot 保存某 Tick 已提交状态；Transition Log 保存 Command、Receipt 和 Event；Capture Frame 使用 Hash/Ref 绑定它们。

优点：边界清楚、可随机访问 Tick、便于 Capture/训练、可审计变化原因，也能在未来增加 Checkpoint/Delta 编码。

缺点：需要同时维护状态与事件一致性 Gate。

结论：采用。所有成功 Receipt/Event 必须与同一 Tick Snapshot 通过序列号和 Hash 交叉验证。

## 6. 规范术语与生命周期

### 6.1 WorldPackage

不可变世界结构制品，包含 Entity Definition、初始 Transform、Capability、初始 Relationship、Terrain、Water、Structure、Resource Lock 和 Canonical Hash。它不保存某次运行的速度、接触或 Action Instance。

### 6.2 RuntimeSession

外部调用、Take、Capture 和权限的会话作用域。`runtimeSessionId` 不能与某个已加载世界实例混为一谈。

### 6.3 WorldSession

一次已加载世界的唯一实例生命周期。每次 Full Reload、World replacement 或 Reset 创建新的 `worldSessionId`；旧 ID 永不复用。它拥有 Tick、状态、Relationship、Fact、Event Sequence 和 Runtime Adapter 资源。

该术语在本协议内替代含义模糊的“Runtime Instance”。不提供 `runtimeInstanceId` 兼容别名。

### 6.4 State

某个已提交 Tick 的可观察事实。State 回答“现在是什么”，不回答“为什么变成这样”。

### 6.5 Relationship

通过事务建立或解除的权威逻辑边，例如 `mountedOn`、`equippedAt`、`storedIn` 和 `possessedBy`。Relationship 可以驱动 Render Attachment、Collider 模式和 Camera Context，但这些派生结果不能反向成为第二份关系真相。

### 6.6 Semantic Fact

由权威 Runtime 状态投影出的稳定事实，例如 `supportedBy`、`touching`、`insideVolume`。Fact 是 Tick State 的一部分，但不是用户/Agent 直接提交的 Relationship。

### 6.7 Action State

一个已接受且尚未终止的 Semantic Action 实例当前阶段，例如 `starting | active | completing`。Action State 不等于 Animation Clip；Animation 是其表现消费者之一。Action 完成、取消或失败后从下一份 Snapshot 的活动集合移除，终态由 Receipt/Event 永久记录。

### 6.8 Receipt

Command 的最终处理结果，证明 committed/rejected/failed，并列出直接产生的 Event ID。相同 Command ID 和相同 Payload 必须返回同一 Receipt。

### 6.9 Event

两个已提交状态之间的离散变化记录。Event 回答“发生了什么”；只有存在直接事务因果时才能携带 `commandId`，不能把时间相邻误写成因果。

### 6.10 权威所有权矩阵

| 概念 | 唯一权威 Owner | 允许的派生消费者 | 禁止的第二真相 |
|---|---|---|---|
| 静态世界结构 | WorldPackage Compiler | Runtime、Validation、Dataset Adapter | Snapshot 重复整份静态几何 |
| Entity Transform/Velocity | Fixed Tick State Resolver | Render、Camera、Capture、Fact Projector | Render Node 反写 Canonical State |
| Capability State | 对应 Capability Runtime | Gameplay Query、Render/Animation、Capture | 在 Entity/Subject 上追加同义可选字段或自由状态袋 |
| 动态 Relationship | Relationship Store + Transaction Barrier | Render Attachment、Physics Joint、Control、Camera | Scene Graph Parent、Joint 或 Controller 字段独立推断关系 |
| Possession | `possessedBy` Relationship | Input Router、Camera、inspection index | 根级 `controlledEntityId` 或 Controller 自带目标成为另一权威字段 |
| Ground Support | P1.5 唯一 `checkSupport()` 路径 | Medium Resolver、`supportedBy` Fact、Route Gate | Terrain Height、AABB、额外 Raycast |
| 其他 Semantic Fact | Semantic Fact Projector | Gameplay Query、Event、Capture、Dataset | Agent 直接提交 Fact 或 Adapter 自行发明标签 |
| Semantic Action Phase | Action Runtime | Animation、Audio、Relationship Command、Capture | Animation Clip 完成状态决定 Gameplay 结果 |
| Camera/View | Camera Director | View Snapshot、Render、Capture | World State 保存 Render 插值或相机 Overlay |
| Runtime Health/Resources | Runtime Host | Operations、Diagnostic、Budget Gate | 进入 World Model Ground Truth |
| 历史顺序 | WorldSession Event Sequence | Replay、Audit、Dataset Adapter | Timestamp、Promise 完成顺序或数组插入顺序 |

## 7. 四个公共投影

### 7.1 WorldStateSnapshot

```ts
interface WorldStateSnapshotV1 {
  kind: "worldkit-world-state-snapshot";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  simulationTick: number;
  worldPackageRef: string;
  worldPackageRootHash: `sha256:${string}`;
  executionPlanHash: `sha256:${string}`;
  entityStatesById: Readonly<Record<string, RuntimeEntityStateV1>>;
  capabilityStatesById: Readonly<Record<string, CapabilityStateV1>>;
  relationshipStatesById: Readonly<Record<string, RelationshipStateV1>>;
  semanticFactsById: Readonly<Record<string, SemanticFactV1>>;
  activeActionStatesById: Readonly<Record<string, ActionStateV1>>;
  lastEventSequence: number;
  worldStateHash: `sha256:${string}`;
}
```

规则：

- Map Key 必须与内部对象 `id` 一致。
- 所有 Map 按 ID Canonical Sort 后编码和 Hash。
- Snapshot 只在 Fixed Tick 完整提交后产生。
- Snapshot 不包含 Camera、Runtime Backend、资源计数或 Provider Diagnostic。
- Snapshot 不复制 WorldPackage 中从未变化的 Static Geometry；消费者通过 Package Ref/Hash 物化完整 World View。
- Snapshot 必须能在没有 Babylon/Havok 类型的环境中解析和验证。

### 7.2 ViewStateSnapshot

```ts
interface ViewStateSnapshotV1 {
  kind: "worldkit-view-state-snapshot";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  simulationTick: number;
  renderFrameIndex: number;
  cameraStatesById: Readonly<Record<string, CameraStateV1>>;
  viewStateHash: `sha256:${string}`;
}
```

Camera State 包含位置、朝向、Projection、Rig/Profile Ref、Target Entity 和必要的 View Intent 结果。纯 Render Interpolation 可以进入 View State，但不能进入 `WorldStateSnapshot.worldStateHash`。

### 7.3 RuntimeStatusSnapshot

```ts
interface RuntimeStatusSnapshotV1 {
  kind: "worldkit-runtime-status-snapshot";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  mode: "constructing" | "ready" | "paused" | "failed" | "disposed";
  runtimeAdapterRef: string;
  runtimeAdapterHash: `sha256:${string}`;
  physicsAdapterRef: string;
  physicsAdapterHash: `sha256:${string}`;
  fixedTimeStepSeconds: number;
  resourceCounts: {
    renderObjectCount: number;
    physicsBodyCount: number;
    terrainSampleCount: number;
  };
  diagnostics: readonly RuntimeDiagnosticV1[];
}
```

这是 inspection/operations 投影，不属于 World Model 语义真相。Adapter 使用锁定 Registry Ref/Hash 标识实现，不公开 `babylon`、`havok` 等 Provider 字符串枚举；`RuntimeDiagnosticV1` 也只允许稳定 Code 和结构化、无 Provider Handle 的 Detail。训练 Adapter 默认不导出该对象，只把 Runtime Build Fingerprint 和验证结果放在 Episode Metadata。

### 7.4 TransitionLog

```ts
interface WorldTransitionBatchV1 {
  kind: "worldkit-world-transition-batch";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  fromSimulationTick: number;
  toSimulationTick: number;
  commandIds: readonly string[];
  receiptIds: readonly string[];
  eventIds: readonly string[];
  worldStateBeforeRef: string;
  worldStateBeforeHash: `sha256:${string}`;
  worldStateAfterRef: string;
  worldStateAfterHash: `sha256:${string}`;
  transitionHash: `sha256:${string}`;
}
```

Command、Receipt、Event 使用各自闭合判别 Union 和独立 Schema。Transition Batch 只建立顺序与引用，不内联通用 Payload。

## 8. Entity State

### 8.1 Entity 不是“人物类型树”

人、马、滑板、汽车、箱子、门和飞龙都是 Runtime Entity；能力由 Definition/Capability/Profile 决定。Snapshot 不使用 `HumanoidState` 作为所有状态的根。

### 8.2 首期 Entity State Union

```ts
type RuntimeEntityStateV1 =
  | SpatialEntityStateV1
  | ControllerEntityStateV1;

interface SpatialEntityStateV1 {
  id: string;
  kind: "spatial-entity-state";
  entityDefinitionRef: string;
  entityDefinitionHash: `sha256:${string}`;
  semanticClassId: string;
  lifecycleMode: "active" | "disabled";
  positionMetersXYZ: readonly [number, number, number];
  rotationQuaternionXYZW: readonly [number, number, number, number];
  scaleRatioXYZ: readonly [number, number, number];
  linearVelocityMetersPerSecondXYZ?: readonly [number, number, number];
  angularVelocityRadiansPerSecondXYZ?: readonly [number, number, number];
}

interface ControllerEntityStateV1 {
  id: string;
  kind: "controller-entity-state";
  controllerDefinitionRef: string;
  controllerDefinitionHash: `sha256:${string}`;
  lifecycleMode: "active" | "suspended" | "disabled";
  inputMode: "human" | "agent" | "replay";
}
```

规则：

- Transform 使用完整 Quaternion，不以 `forwardXYZ` 替代完整朝向。
- 单位进入字段名。
- 静态且未变化的 Entity 可以只存在于 WorldPackage；若其门状态、破坏状态或 Transform 可变，则进入 Snapshot。
- Controller 与可见 Subject 都是 Entity State Union 的成员；不再维护第二份 `controllerStatesById` Map。
- Controller 不通过 `controlledEntityId` 字段独立保存控制真相；控制目标来自 `possessedBy` Relationship。
- Entity 不反向保存 `activeActionIds`；活动 Action 只在 `activeActionStatesById` 中以 `actorEntityId` 建立权威关联，需要的反向索引由消费者派生。

### 8.3 Capability State 负责 LEGO 式状态扩展

Entity Core State 只保存几乎所有可运行对象都共有的身份、生命周期和空间状态。人物移动、门开合、车辆档位、生命值或飞行模式等差异由独立 Capability State 表达：

```ts
interface LocomotionCapabilityStateV1 {
  id: string;
  kind: "locomotion-capability-state";
  ownerEntityId: string;
  locomotionCapabilityRef: string;
  locomotionCapabilityHash: `sha256:${string}`;
  mode: "idle" | "walk" | "run" | "airborne";
  movementMedium: "ground" | "air";
  facingYawRadians: number;
  speedMetersPerSecond: number;
}

interface DoorCapabilityStateV1 {
  id: string;
  kind: "door-capability-state";
  ownerEntityId: string;
  doorCapabilityRef: string;
  doorCapabilityHash: `sha256:${string}`;
  mode: "closed" | "opening" | "open" | "closing" | "blocked";
  openRatio: number;
}
```

规则：

- `CapabilityStateV1` 是由 Registry 中版本化 Capability State Schema 组成的关闭 Union；“关闭”是指相对于当前 ExecutionPlan Resource Lock 的允许集合关闭，而不是由 Core 永久硬编码。新增 Capability 通过注册 Schema、更新 Lock、生成类型和 Conformance Fixture 扩展，未知 Ref/Kind 稳定拒绝，不能提交任意 `state: Record<string, unknown>`。
- 每个 Capability State 使用 `ownerEntityId` 指向拥有者；Entity 不反向保存 Capability ID 数组，查询索引由消费者派生。
- Capability Definition/Profiles 保存参数和规则，Capability State 只保存当前结果；例如速度上限仍属于锁定 Control Feel Profile，Snapshot 只报告实际速度。
- `DoorCapabilityStateV1` 只是长期结构示例，不表示当前阶段已经支持门或室内。
- 同一语义只允许一个 Capability Owner；例如 Ground/Air 仍由 P1.5 State Resolver 提交，Animation 只能消费，不能另算。

## 9. Relationship State

### 9.1 权威 Relationship 与派生 Binding

首批权威关系沿用总体设计：

- `attachedTo`
- `mountedOn`
- `possessedBy`
- `ownedBy`
- `storedIn`
- `equippedAt`
- `follows`
- `targets`

每种关系使用角色化端点和闭合字段，不公开通用 `sourceEntityId/targetEntityId/params`。

```ts
interface MountedOnRelationshipStateV1 {
  id: string;
  type: "mountedOn";
  schemaVersion: 1;
  riderEntityId: string;
  mountEntityId: string;
  mountSlotId: string;
  establishedSimulationTick: number;
}

interface EquippedAtRelationshipStateV1 {
  id: string;
  type: "equippedAt";
  schemaVersion: 1;
  itemEntityId: string;
  wearerEntityId: string;
  equipmentSlotId: string;
  establishedSimulationTick: number;
}

interface PossessedByRelationshipStateV1 {
  id: string;
  type: "possessedBy";
  schemaVersion: 1;
  controlledEntityId: string;
  controllerEntityId: string;
  establishedSimulationTick: number;
}
```

### 9.2 单一真相

- `mountedOn` 是骑乘/站乘的逻辑真相。
- `possessedBy` 是控制权真相。
- `equippedAt` 是装备槽位真相。
- `storedIn` 是容器归属真相。
- `attachedTo` 只表达需要持久化的空间挂载。
- Render Node Parent、Bone Attachment、Physics Joint 和 Collider Mode 是 Relationship 的派生执行结果，不重复写成第二条 Gameplay 关系。

### 9.3 生命周期

```text
validate
  → admit
  → prepare logical/render/physics/control changes
  → commit at fixed-tick phase barrier
  → publish Relationship State
  → emit Receipt and Event

failure → rollback all prepared/committed projections
rollback failure → WorldSession failed
```

解绑不在 Snapshot 中留下 inactive Tombstone；历史由 Event/Receipt 保存。若消费者需要随机访问历史，使用周期 Checkpoint + Transition Log。

## 10. Semantic Physics Fact

### 10.1 为什么 Fact 不是 Relationship

`mountedOn` 需要命令、规则和事务；`supportedBy` 通常由碰撞、Character Support 或 Constraint 的已提交结果推导。把两者都叫 Relationship 会让 Agent 无法知道哪些边可以提交、哪些边只能观察。

### 10.2 首批 Fact Union

```ts
interface SupportedByFactV1 {
  id: string;
  type: "supportedBy";
  schemaVersion: 1;
  supportedEntityId: string;
  supportSurfaceEntityId: string;
  supportColliderSubshapeId: string;
  supportTraversalSurfaceId?: string;
  supportPointMetersXYZ: readonly [number, number, number];
  supportNormalXYZ: readonly [number, number, number];
  startedSimulationTick: number;
}

interface TouchingFactV1 {
  id: string;
  type: "touching";
  schemaVersion: 1;
  entityIds: readonly [string, string];
  startedSimulationTick: number;
}

interface InsideVolumeFactV1 {
  id: string;
  type: "insideVolume";
  schemaVersion: 1;
  containedEntityId: string;
  volumeEntityId: string;
  startedSimulationTick: number;
}
```

`TouchingFactV1.entityIds` 是对称端点，必须按 Entity ID 字典序排序；其余 Fact 使用角色化端点。`supportSurfaceEntityId`、`supportColliderSubshapeId` 与可选的 `supportTraversalSurfaceId` 复用 Route/Hybrid Terrain 已冻结的三层 Surface 身份：世界所有者、几何命中和可通行语义不能缩成同一个含糊 `surfaceId`。

### 10.3 Semantic Fact Projector

Runtime 内部建立唯一 `SemanticFactProjector` 概念所有者：

```text
Havok / Character Support / Trigger / Constraint raw result
  → provider adapter normalization
  → locked semantic thresholds + hysteresis
  → SemanticFactProjector
  → Canonical Fact State + begin/end Event
```

约束：

- Ground Support 继续只来自 P1.5 的单一 `checkSupport()` 权威路径。
- 不得用 Terrain Height、AABB 或额外 Raycast 独立推断第二份 `supportedBy`。
- Contact begin/end 必须有稳定 ID、阈值和去抖，不能把每个 Solver Contact Point 导出成 Fact。
- Fact Projector 使用锁定 Profile/Hash；阈值变化形成新构建/协议证据。
- `blockedBy` 只有在存在明确移动/交互 Intent 与阻挡判定合同时才加入，不从任意接触自动猜测。
- 不导出 Body Handle、Shape Handle、Manifold、Broadphase Pair、Solver Impulse。

### 10.4 常见世界状态如何落位

| 需要表达的事实 | Canonical 落位 | 原因 |
|---|---|---|
| 人正在骑马 | `mountedOn(riderEntityId, mountEntityId, mountSlotId)` | 是经规则提交、需要事务回滚的权威关系 |
| 人手上拿着剑 | `equippedAt(itemEntityId, wearerEntityId, equipmentSlotId)` | Gameplay 槽位是权威关系，Bone/Socket 只是渲染派生 |
| 门当前打开 | `DoorCapabilityState.mode = "open"` | 是门能力的当前状态，不是 Entity Type 或 Event |
| 门连接在墙上 | `attachedTo` | 是持久逻辑/空间关系，不依赖 Scene Graph Parent |
| 杯子被桌面支撑 | `supportedBy` Fact | 来自已提交 Physics Support，不允许 Agent 直接写入 |
| 箱子已装入卡车 | `storedIn` | 是容器规则提交的权威关系；仅位于车厢 Volume 内可另有 `insideVolume` Fact |
| 汽车碰到护栏 | `touching` Fact + begin/end Event | 当前接触是 State，接触开始/结束是 Transition |
| 人开始/完成开门 | Action State + Action Event/Receipt | Action 当前阶段与历史结果分开保存 |

## 11. Action State、Receipt 与 Event

### 11.1 Action State

```ts
interface ActionStateV1 {
  id: string;
  kind: "action-state";
  semanticActionRef: string;
  semanticActionHash: `sha256:${string}`;
  actionRequestRef: string;
  actionRequestHash: `sha256:${string}`;
  actorEntityId: string;
  mode: "starting" | "active" | "completing";
  startedSimulationTick: number;
  lastTransitionSimulationTick: number;
}
```

`actionRequestRef` 指向已经过对应 Action Definition Schema 验证的不可变 Canonical Request；Mount Request 使用 `riderEntityId/mountEntityId/mountSlotId`，Equipment Request 使用 `itemEntityId/wearerEntityId/equipmentSlotId`。新 Action 通过 Registry Schema 扩展，不在公共 State Envelope 中增加 `params` 或 `targetIdsByRole` 通用袋。`actorEntityId` 是用于查询的受校验投影，必须与 Request 中的 Actor 角色一致，否则整个 Snapshot 无效。

Animation Clip、Blend、Layer 和 Root Motion 是 Action 的 Runtime/Visual 执行细节。Snapshot 可以记录 `semanticActionRef` 和 Phase，但不把 Clip Name 当作语义动作真相。`activeActionStatesById` 只包含尚未终止的实例；`completed/cancelled/failed` 只进入 Receipt/Event，避免 Snapshot 形成无界历史日志。

### 11.2 Receipt

Receipt 必须包含：

- 当前 Receipt 的 `id`；
- `commandId`、`runtimeSessionId`、`worldSessionId`；
- `simulationTick`；
- `status: committed | rejected | failed`；
- 稳定 Diagnostic Code；
- 直接产生的 `eventIds`；
- committed 时的 `worldStateAfterRef` 与 `worldStateAfterHash`。

相同 Command ID + 相同 Canonical Payload 重试返回同一 Receipt；相同 ID + 不同 Payload 返回 `COMMAND_ID_CONFLICT`。

### 11.3 Event

Event 使用关闭的 Type Union；公共 Base 只复用身份字段，最终可反序列化类型必须是带角色化 Payload 的判别 Union：

```ts
type WorldEventTypeV1 =
  | "relationship.committed"
  | "relationship.removed"
  | "semantic-fact.started"
  | "semantic-fact.ended"
  | "action.started"
  | "action.completed"
  | "action.cancelled"
  | "action.failed"
  | "world.failed";

interface WorldEventBaseV1<EventType extends WorldEventTypeV1> {
  id: string;
  type: EventType;
  schemaVersion: 1;
  runtimeSessionId: string;
  worldSessionId: string;
  simulationTick: number;
  sequence: number;
  commandId?: string;
}

type WorldEventV1 =
  | RelationshipCommittedEventV1
  | RelationshipRemovedEventV1
  | SemanticFactStartedEventV1
  | SemanticFactEndedEventV1
  | ActionStartedEventV1
  | ActionCompletedEventV1
  | ActionCancelledEventV1
  | ActionFailedEventV1
  | WorldFailedEventV1;
```

首批 Event：

- `relationship.committed`
- `relationship.removed`
- `semantic-fact.started`
- `semantic-fact.ended`
- `action.started`
- `action.completed`
- `action.cancelled`
- `action.failed`
- `world.failed`

规则：

- `sequence` 在一个 WorldSession 内严格递增。
- Command 直接提交关系时，Relationship Event 才携带该 `commandId`。
- Physics Fact Event 可以引用相关 Action/Event，但不能仅因发生在下一 Tick 就声称由某 Command 直接造成。
- 不创建 `gravityActivated` 这类不真实的引擎事件。释放物体应记录关系解除、Support 结束、Action 状态和后续 Contact 开始。
- Event 不是 Snapshot 内数组；Snapshot 只保存 `lastEventSequence`，事件通过独立 Log/Ref 获取。

### 11.4 ID、顺序与保留策略

- Command ID 由调用方提供并承担幂等键；同 ID 不允许复用为不同 Payload。
- Relationship ID 在 Bind Request/初始 WorldPackage 中确定，并在连续存在期间保持不变；解除后重新建立产生新 ID。
- Action State ID 由已接受的 Action Request 确定；同一 Command 产生多个 Action 时使用稳定 Ordinal 派生，不能使用数组插入顺序。
- Semantic Fact ID 由 Fact Type、Canonical Endpoint、开始 Tick 和锁定 Projector Profile 派生；同一连续接触期间不变，结束后重新开始产生新 ID。
- Event ID 由 `worldSessionId + sequence` 派生；`sequence` 是 WorldSession 内唯一顺序真相，Timestamp 只作观测信息，不能用于排序。
- Snapshot 只保留当前 Entity、Relationship、Fact 和未终止 Action；终态、删除和历史只保留在 Receipt/Event Log 与 Checkpoint Artifact 中。

## 12. Fixed Tick 提交顺序

规范顺序：

```text
1. RuntimeHost 收集并按稳定规则排序 Command/Intent
2. 验证 runtimeSessionId / worldSessionId / commandId / expected state
3. Gameplay/Relationship/Action Handler 生成 Transition Plan
4. Adapter prepare 逻辑、Render、Physics、Control 和 Camera 变化
5. Phase Barrier 原子 commit 或 rollback
6. 根据已提交 possessedBy 采样 Control Intent
7. 运行运动、Physics 和 Constraint
8. State Resolver 提交 Transform、Support、Medium、Facing、Action Phase
9. SemanticFactProjector 生成 Fact State 与 Fact Event
10. CameraDirector 消费已提交 World State，生成 View State
11. 发布 Receipt、Event、WorldStateSnapshot、ViewStateSnapshot
12. Render Ready 后 Capture Frame 引用同一批已提交制品
```

相机、动画和 Capture 不得观察半提交 Relationship。Render Callback 不得直接改变 Gameplay State。

## 13. World Model Trajectory

### 13.1 Canonical Transition

```text
WorldState(t)
  + Commands/Intents(t)
  ↓
Deterministic Runtime Step
  ↓
Receipts/Events(t → t+1)
  + WorldState(t+1)
  + ViewState(t+1)
  + Render Passes(t+1)
```

### 13.2 Dataset Adapter

Canonical Bundle 不直接采用某个模型训练框架的字段。独立 Dataset Adapter 可以输出：

- RLDS Episode/Step；
- PyTorch/WebDataset；
- JSONL + binary pass artifacts；
- 模型专属 Tensor 与 Prompt。

Adapter 必须保持：

- Episode/WorldSession 唯一身份；
- Observation、Action、State Transition 的 Tick 对齐；
- completed/failed/cancelled/truncated 状态；
- WorldPackage、Runtime Build、Take、Snapshot 和 Pass Hash；
- Stable Entity/Relationship/Fact ID。

Adapter 不得把模型预测结果写回 Canonical Runtime State。

## 14. Capture 与 Hash

每个 Capture Frame 至少绑定：

```text
simulationTick
renderFrameIndex
captureFrameIndex
worldStateSnapshotRef + Hash
viewStateSnapshotRef + Hash
transitionBatchRefs + Hashes
renderReadyReceiptId
passArtifactsById + Hashes
```

Hash 域分离：

- `worldStateHash`：Entity/Controller/Capability/Relationship/Fact/Action State；
- `viewStateHash`：Camera 与 View Projection；
- `transitionHash`：Command/Receipt/Event 引用与顺序；
- `runtimeBuildFingerprintHash`：SDK/Babylon/Havok/Platform/Feature；
- `controlCaptureBundleRootHash`：对完整不可变 Bundle 求根 Hash。

Render-only 插值、GPU 资源计数和日志文本不能污染 `worldStateHash`。跨平台 Replay 使用数值容差和不变量 Gate，不把固定 Tick 误写成全平台 bit-exact。

Artifact 身份与语义内容 Hash 必须分离：

- `id`、`runtimeSessionId` 和 `worldSessionId` 用于寻址、权限和隔离，不进入 `worldStateHash`；
- `worldStateHash` 覆盖 `simulationTick`、WorldPackage/ExecutionPlan Hash、Canonical Sort 后的 State Map 与 `lastEventSequence`；
- 因此两个独立 WorldSession 在同一锁定构建下到达完全相同的 Tick 状态时可以得到相同 `worldStateHash`，但 Snapshot `id` 与 Session ID 仍不同；
- `worldStateBeforeRef/worldStateAfterRef` 负责指向具体 Artifact，配套 Hash 负责证明内容，二者不能互相替代；
- Hash 的 Canonical Bytes 规则必须版本化并有 Golden Fixture，禁止把对象遍历顺序、浮点文本格式或 Provider Handle 混入。

## 15. 性能、预算与传输

语义优先，编码优化不能改变合同：

- Canonical Artifact 默认使用完整 Snapshot，便于随机访问和独立校验。
- 流式 Browser/CLI 可以传 Delta，但每个 Delta 必须引用 `baseSnapshotId/baseStateHash`，并可重建成与 Full Snapshot 相同的 Canonical Bytes。
- 周期 Checkpoint 间隔由 Capture Profile 决定。
- Contact/Fact/Event 设置每 Tick 和每 Entity Budget；超限返回阻断 Diagnostic，不能静默截断必需事实。
- Static World Structure 不随每 Tick 重复；通过 Package Ref/Hash 连接。
- Binary/Tensor 编码属于 Adapter，Canonical JSON 字段仍是唯一命名真相。

## 16. AI-friendly Schema 规则

- 一个概念只使用一个公共名称。
- 当前对象使用 `id`；引用使用 `...EntityId`、`...SessionId`、`...Ref`。
- 数值字段包含单位和坐标域。
- Persistent State 使用 `kind`；Command/Event/Relationship 使用 `type`；互斥状态使用 `mode`。
- 每种 Relationship 和 Action 使用角色化端点。
- 不使用通用 `subject/target/params`、自由字符串 Relation 或 Provider Payload。
- Map 使用 `...ById`，并验证 Key 与对象 ID 一致。
- 枚举关闭；未实现能力通过 Capability Discovery/Diagnostic 表达，不使用 `unknown` 冒充有效状态。
- Snapshot/CLI/Browser/Capture/Dataset Mapping 使用相同 Canonical 字段，Adapter 不能创建同义方言。

## 17. 第一条纵向切片：人—滑板

### 17.1 目标

用最小场景同时证明 Relationship、Semantic Fact、Action、Receipt、Event、Snapshot、Capture 和 Reset，而不是先建立抽象 Framework 后没有可视证据。

### 17.2 Entity

- `rider`：已有可控 G Bot 或 Golden Humanoid。
- `board`：简单动态白模滑板，具有 Stand/Mount Anchor、Collider、Physics Body 和可被骑乘能力。
- `ground`：静态 Traversal Surface。
- `controller-primary`：逻辑 ControllerEntity。

### 17.3 关键状态

Mount 前：

- `rider supportedBy ground`
- `board supportedBy ground`
- 不存在 `mountedOn`

Mount Commit 后：

- `mountedOn(rider, board, seat/stand anchor)` 存在；
- `possessedBy` 继续指向规范受控 Entity，或按 Mount Policy 事务切换；
- Render Attachment、Collider 模式和 Camera Context 已全部提交；
- `supportedBy` 由真实 Support Projector 决定，不能由 `mountedOn` 直接伪造。

Dismount 后：

- `mountedOn` 被事务移除；
- Rider 恢复独立 Physics/Control/Camera Context；
- 新 Support Fact 由下一次已提交 Physics 结果产生。

### 17.4 Tick 场景

```text
T0   World ready，Rider/Board 各自 supportedBy Ground
T10  relationship.bind(mountedOn) command admitted
T11  atomic commit，Receipt + relationship.committed Event
T12  Rider/Board 一起移动，Relationship ID 保持稳定
T30  relationship.remove command admitted
T31  atomic commit，Receipt + relationship.removed Event
T32  Rider 落地，semantic-fact.started(supportedBy Ground)
T40  Capture Frame 验证 Snapshot/Event/Pass 对齐
Reset 新 WorldSession，旧 Command 稳定拒绝
```

### 17.5 阻断 Gate

- 重复 Bind Command 不重复创建关系或资源。
- 同一 Seat/Stand Anchor 的基数冲突稳定失败。
- Socket/Slot/Capability 不兼容在 prepare 前失败。
- Render/Physics/Camera 任一步故障后全部回滚。
- 空中 Bind/Unbind 不清空无关 Entity 已有速度。
- Contact 抖动不产生重复 Fact begin/end 风暴。
- Reset 产生新 `worldSessionId`，旧命令拒绝为 stale。
- 相同输入和锁定 Runtime Build 产生相同 Relationship/Event 顺序与容差内状态。
- Capture Frame 的 Instance ID、Snapshot Entity ID 和 Relationship Endpoint 一致。

## 18. 迁移策略

当前 SDK 未正式发布，采用明确 clean break，不建立永久 V3/V1 双方言。

### 18.1 当前阶段

- 保持 `WorldRuntimeSnapshotV3` 不变，继续服务 M5/M7 和现有 Capture V1。
- 不向 `SubjectRuntimeStateV3` 临时增加更多 Relationship/Fact 字段。
- 新能力先在本规格和 P2.1 实施计划中冻结。

### 18.2 P2.1 集成阶段

- 新增 World/View/Runtime Status/Transition 顶层协议和严格 Validator。
- 删除 `relationshipRole` 单值摘要。
- 删除根级 `controlledEntityId` 作为独立真相；`possessedBy` 成为控制关系权威，其他位置只允许只读投影。
- Browser、CLI、Capture、Fixture 和生成类型在一个 breaking change 中切换。
- 更新 Canonical Hash、Conformance Fixture 和 Capture Bundle 版本。
- 不保留旧字段 Alias；需要读取旧本地 Artifact 时使用一次性离线迁移脚本。

### 18.3 后续阶段

- 增加 Equipment、Mount/Tow、Container 和更多 Action/Fact Union。
- 增加 Checkpoint/Delta 编码，但保持 Full Snapshot 语义。
- 增加 Dataset Adapter，不修改 Runtime Canonical 字段。
- 完整 Replay/Resume 只有在 WorldPackage、Build Fingerprint、Input Log、Snapshot 和 Receipt Gate 全部通过后才能标记生产支持。

## 19. 验证矩阵

### 19.1 Schema/Canonical

- 未知字段、未知枚举、非有限数值、错误单位字段拒绝。
- Map Key/对象 ID 不一致拒绝。
- Relationship 端点不存在、基数冲突、角色类型不兼容拒绝。
- Fact 对称端点排序、Fact ID 稳定性和 begin/end 配对验证。
- Canonical Sort/Bytes/Hash 在 Node 与 Browser 一致。

### 19.2 Runtime

- Phase Barrier 前不可观察半提交关系。
- Relationship 失败注入证明逻辑/Render/Physics/Control/Camera 全回滚。
- Ground Support 只有一个权威路径。
- 30/60/120 Hz Render 下，相同 Fixed Tick State/Receipt/Event 一致。
- 多 WorldSession、相同 ExecutionPlan、Reset、Dispose 相互隔离。
- Partial Construction 和 throwing cleanup 无资源泄漏。

### 19.3 Capture/Trajectory

- Snapshot、Event、Action、Relationship Receipt Tick 不越界。
- State Before/After 与 Transition Batch Hash 对齐。
- completed/failed/cancelled/truncated 不混淆。
- Frame 的 Entity/Instance/Semantic ID 均能解析到稳定表。
- Dataset Adapter 的 observation/action 对齐通过 Golden Episode。

### 19.4 AI-facing

- Constrained JSON Schema 无同义字段和通用参数袋。
- AI 只需指定角色化 Relationship/Action，不指定 Babylon/Havok 细节。
- Invalid 示例能得到结构化、可修复 Diagnostic。
- 同一 Canonical JSON 通过 TypeScript、CLI、Browser 和生成类型一致解释。

## 20. 实施顺序

本设计不打断当前 M5。推荐顺序：

1. 完成 M5 Route Graph/Traversability 当前阶段；
2. 在 M8 前冻结本规格并编写 P2.1 独立实施计划；
3. 建立纯协议包：World State、Relationship、Fact、Action、Event、Receipt；
4. 建立 Runtime 内单一 Relationship Store 和 SemanticFactProjector；
5. 完成人—滑板 Fixture 与事务回滚；
6. 接入 Browser/CLI Inspection；
7. 接入 Simulation Take/Control Capture Receipt Track；
8. 完成真实 Babylon/Havok + Playwright + Capture Gate；
9. 再扩展 Mount/Tow、Equipment 和 Flight。

## 21. 完成标准

只有同时满足以下条件，才能宣称 Canonical World State 第一条生产切片完成：

- WorldPackage、WorldSession、World State、View State、Runtime Status 和 Transition Log 身份不混淆；
- Entity、Capability、Relationship、Fact、Action 各自只有一个权威 Owner；
- AI-facing Schema 使用角色化端点且不暴露 Provider 字段；
- 人—滑板 Bind/Move/Unbind/Reset 在真实 Runtime 中可见、可捕获、可重放；
- Relationship Transaction 通过失败注入证明原子提交与回滚；
- `supportedBy` 来自单一 Support/Fact Projection，不由关系或地形高度伪造；
- Receipt/Event/Snapshot/Capture Pass 在 Tick、ID 和 Hash 上闭环；
- 旧 WorldSession 命令不能污染新 WorldSession；
- 自动合约证据、真实渲染证据和手工交互证据分别报告；
- Runtime 未泄漏 Babylon/Havok Handle、原始 Contact 或 Provider Error。

## 22. 参考资料

- [ASAM Open Simulation Interface: GroundTruth](https://opensimulationinterface.github.io/osi-antora-generator/asamosi/latest/gen/structosi3_1_1GroundTruth.html)
- [OpenUSD: UsdPrim](https://openusd.org/release/api/class_usd_prim.html)
- [OpenUSD: UsdRelationship](https://openusd.org/release/api/class_usd_relationship.html)
- [Unity Entities: Components overview](https://docs.unity.cn/Packages/com.unity.entities%401.3/manual/components-intro.html)
- [Unity Entities: Define and manage system data](https://docs.unity.cn/Packages/com.unity.entities%401.0/manual/systems-data.html)
- [Unreal Engine: Gameplay Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-framework-in-unreal-engine)
- [Google Research: RLDS](https://github.com/google-research/rlds)
