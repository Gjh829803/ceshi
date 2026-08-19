# 可扩展主体组装 Authoring 专项设计

- 状态：Proposed，供 Subject Phase 0/1 实施评审
- 日期：2026-08-19
- 上位规格：[`2026-08-17-ai-first-lego-game-sdk-design.md`](./2026-08-17-ai-first-lego-game-sdk-design.md)
- 产品/资产契约：[`16-subject-assets-3c-integration.md`](../../16-subject-assets-3c-integration.md)
- 实施计划：[`2026-08-19-subject-foundation-visible-slice.md`](../plans/2026-08-19-subject-foundation-visible-slice.md)
- S1a 子规格：[`2026-08-19-package-subject-definition-design.md`](./2026-08-19-package-subject-definition-design.md)

## 1. 文档目的

本文专门定义以下三类能力的长期语义：

1. 定义一个可复用或世界局部的主体，包括非人形白膜几何、Socket、Collider、运动方式和其他 Capability。
2. 从目录 Preset、Package Definition 或允许的自定义 Definition 创建具有稳定 Entity ID 的主体实例。
3. 使用类型化 Relationship 组合任意两个兼容主体，例如马与马车、人与滑板、汽车与拖车、人与飞龙、人与武器。

讨论中使用过的 `world.subject.define(...)`、`world.subject.spawn(...)`、`world.subject.bind(...)` 只是概念性操作名，不是已冻结的 TypeScript API。最终公开名称必须经过单独的 AI Friendly 与业界术语评审，并保持 Canonical Schema、TypeScript、CLI、Browser Protocol、示例和生成类型完全一致。

本文冻结的是语义、数据归属、扩展机制和编译边界，而不是这三个临时方法名。

## 2. 目标与非目标

### 2.1 目标

- 普通 Agent 优先选择经过验证的 Subject Preset/Kit，不需要理解 Babylon 或 Havok。
- 高级 Agent 可以用注册过的几何、Profile 和 Capability 组合非人形主体。
- 自定义主体与目录主体经过同一套 Schema、Normalizer、Compiler、Runtime 和验收门禁。
- Collider 可以由受控策略自动生成，也可以引用经过验证的 Collider Profile。
- 主体实例与主体定义分离；同一定义可以生成多个具有独立状态的实例。
- 主体之间通过类型化 Relationship 组合，不通过永久父子节点或场景私有脚本表达 Gameplay 事实。
- 新增主体、运动方式或关系时，尽量增加 Registry 内容和插件实现，而不是修改 Compiler Core 的分支代码。
- 所有定义、实例、关系、编译结果和运行状态都可验证、可解释、可哈希、可重放、可迁移。

### 2.2 非目标

- 不允许 Agent 在场景 JSON 中嵌入 JavaScript、Shader、Babylon Node、Havok Handle 或任意 WASM。
- 不把所有主体都压成一个万能继承类。
- 不把 RenderNode 父子关系当作骑乘、装备、拖拽或控制权真相。
- 不承诺自动 Collider 能从任意高模资产得到生产质量结果；无法稳定推导时必须要求 Profile 或人工接入。
- 不在本专项文档冻结最终 API 方法名、包名或所有 JSON 字段名。
- 不在 Subject Foundation 第一个可视切片中假装已经支持骑乘、拖车、武器或飞行。

## 3. 核心模型：Definition、Instance、Relationship

三类概念必须严格分离：

```text
Subject Definition
  描述“这类主体是什么、由什么组成、能做什么”
        │
        │ instantiate
        ▼
Subject Instance / RuntimeEntity
  描述“世界里这个具体主体是谁、在哪里、当前是什么状态”
        │
        │ typed relationship
        ▼
Relationship Instance
  描述“两个具体实体当前以什么业务关系组合”
```

对应讨论中的概念操作：

| 概念操作 | 权威语义 | 是否立即产生运行时副作用 |
|---|---|---|
| `define` | 创建版本化或 Package 局部的 Subject Definition | 否，只产生可校验资源定义 |
| `spawn` | 创建引用 Definition 的 Subject Instance | 编译期创建初始实例；运行时命令则通过事务创建 |
| `bind` | 创建或提交一个类型化 Relationship | 初始关系在编译时展开；动态关系在 Phase Barrier 事务提交 |

这三步不能合并成一个深层嵌套对象。否则无法独立替换 Definition、查询 Instance、变更 Relationship、重放关系事务或在不复制资产的情况下复用组合。

## 4. Definition 的来源与优先级

SDK 支持三种来源，但最终都归一化为同一种 Definition：

### 4.1 宿主 Registry Preset

用于普通 Agent 的默认入口。Preset 已通过资产、Collider、控制、Camera、动作和性能验收。

示例语义：

```text
worldkit://subject-preset/humanoid.basic@1
worldkit://subject-preset/quadruped.basic@1
worldkit://subject-preset/four-wheel-vehicle.basic@1
```

上述资源引用只是说明命名空间层级；正式 Resource Ref 名称在公开命名评审中冻结。

### 4.2 WorldPackage 局部 Definition

用于当前世界特有、但仍需确定性重建的自定义主体。它位于 AuthoringSpec 的 `resources` 区域，具有稳定 ID，并只能引用允许的 Geometry Recipe、Asset、Profile 和 Capability。

节点实例只引用它，不能复制整份定义：

```text
package://subject-definition/coastal-pack-animal
```

### 4.3 已发布的扩展包 Definition

局部 Definition 通过接入门禁后，可以发布到宿主 Registry，成为其他世界可复用的版本化资源。发布会冻结 Schema Hash、Definition Hash、Capability/Implementation Hash 和 Asset Hash。

### 4.4 明确不支持任意节点内联 Definition

主体节点中不允许同时写完整 Geometry、Collider、Socket、Locomotion 和 Camera 配置。这样会导致：

- 相同定义被复制多次并发生漂移；
- AI 每次都要重写底层参数；
- Registry Lock 无法锁定实现；
- Instance 与 Definition 边界消失；
- 运行时无法安全缓存和复用资源。

如果为了单次生成体验需要一层简写，Normalizer 可以把受控嵌套提升为 Package Definition，再让节点引用它；NormalizedWorldIR 中仍只有 Definition Ref 与独立 Instance。

## 5. Subject Definition 的组成

以下结构用于冻结职责，不代表最终字段名已经确认：

```ts
interface SubjectDefinitionConcept {
  id: string;
  version: number;
  category: "human" | "animal" | "vehicle" | "furniture" | "machine" | "custom";
  bodyTopology: string;
  sizeClass: "small" | "medium" | "large" | "custom";

  geometry: GeometryCompositionConcept;
  socketSetRef: ResourceRef;
  colliderPolicy: ColliderPolicyConcept;

  capabilityRefs: readonly ResourceRef[];
  profiles: {
    bodyProfileRef: ResourceRef;
    controlMethodProfileRef?: ResourceRef;
    controlFeelProfileRef?: ResourceRef;
    cameraRigProfileRef?: ResourceRef;
    mediumPhysicsProfileRef: ResourceRef;
    stateModelProfileRef: ResourceRef;
    animationSetRef?: ResourceRef;
    renderBindingProfileRef: ResourceRef;
  };

  allowedOverridePaths: readonly string[];
  aiMetadata: {
    displayName: string;
    description: string;
    semanticTags: readonly string[];
    usageExamples: readonly string[];
  };
}
```

### 5.1 Definition 是数据组合，不是代码容器

Definition 只能包含：

- 可序列化数据；
- Registry Resource Ref；
- Package 内容寻址资源；
- 受 Canonical Schema 限制的配置；
- 明确的默认值和允许覆盖路径。

新的运动算法、物理行为或关系事务处理器由受信 SDK 插件实现，通过 Capability/Relationship Manifest 注册。Agent 只能选择和配置它们，不能把实现代码塞进 Definition。

## 6. 非人形白膜几何

非人形主体不要求先有完整 GLB。第一阶段支持确定性的白膜 Geometry Composition：

```text
Subject Visual Root
├── torso: box
├── head: box
├── front-left-leg: cylinder
├── front-right-leg: cylinder
├── back-left-leg: cylinder
├── back-right-leg: cylinder
└── tail: cylinder
```

每个 Part 至少具有：

- 稳定 `id`；
- 注册 Primitive 或 `geometryRef`；
- 相对 Visual Root 的局部 Transform；
- 可选语义标签；
- 是否参与自动 Collider 推导；
- 资源预算成本。

后续可以把 Geometry Composition 的视觉层替换为 GLB/LOD Asset，而不改变主体 Entity ID、Capability、Collider Profile、Socket ID 或 Relationship。

### 6.1 Visual Root 不等于逻辑主体树

Geometry Part 是 Render Graph 的内部节点，不自动成为 RuntimeEntity。只有需要独立状态、碰撞、权限、关系、保存或 Agent 查询的对象才提升为独立 Entity。

例如：

- 马的四条腿通常是 RenderNode，不是四个 Subject。
- 马车是独立 Subject，因为它有 Collider、状态并参与拖拽关系。
- 可拆卸的剑是独立 Object/Subject Entity，因为它能装备、丢弃和转移。

## 7. World Anchor、Subject Socket 与 Gameplay Slot

三者必须分开：

| 概念 | 作用 | 示例 |
|---|---|---|
| World Anchor | 世界空间中的稳定位置或方向 | 出生点、导航点、构图点 |
| Subject Socket | 主体局部空间的物理/视觉连接点 | `MountSeat`、`TowHitchRear`、`Hand.R` |
| Gameplay Slot | 逻辑容量、占用与规则 | 驾驶座、乘客座、右手装备槽 |

Socket Declaration 至少描述：

- 稳定 `id`；
- 所属 Definition；
- 局部 Transform 或 Rig Bone 绑定；
- 兼容标签；
- 允许的 Relationship 角色；
- 朝向与尺度约定。

Relationship 引用 Socket ID；Babylon Runtime 再把它解析为 TransformNode/Bone。Agent 不填写底层节点路径。

## 8. 自动 Collider 策略

“自动 Collider”不是一个没有规则的布尔值，而是一个可解释、可复现的编译策略。

### 8.1 策略类型

```ts
type ColliderPolicyConcept =
  | { kind: "profile"; colliderProfileRef: ResourceRef }
  | { kind: "derive"; derivationProfileRef: ResourceRef }
  | { kind: "compound"; colliderPartRefs: readonly ResourceRef[] }
  | { kind: "none"; reason: string };
```

- `profile`：优先用于已发布 Preset，直接引用经过验收的 Collider Profile。
- `derive`：从允许参与推导的白膜 Part 生成 Capsule、Box、Sphere、Convex Hull 或受控 Compound。
- `compound`：显式组合多个已注册 Collider Part，但仍不暴露 Havok Handle。
- `none`：只允许纯视觉或明确无碰撞主体，必须给出原因和 Capability 限制。

### 8.2 推导必须确定

Derivation Profile 固定：

- 支持的输入几何类型；
- 包围体算法和容差；
- 最大 Part 数；
- 最小厚度；
- Pivot 和支撑面规则；
- 质量与重心来源；
- 输出 Shape 类型；
- 失败条件和 Diagnostic。

相同 Definition、Profile、Compiler Version 和 Seed 必须得到字节一致的 Collider 描述。运行时不能根据 Babylon Mesh 当前 Bounds 临时猜测，因为 LOD、异步资产和渲染缩放会让物理结果漂移。

### 8.3 自动推导失败

出现以下情况时，Compiler 必须拒绝并要求显式 Profile：

- 几何为空或存在非法尺度；
- 推导结果超过 Collider/Compound 预算；
- 非闭合复杂资产无法满足选定 Shape；
- 主体运动模型要求特定 Shape，而结果不兼容；
- Socket 或支撑面落在 Collider 之外且超过容差。

不能静默退回一个巨大 Box 让场景“看起来能跑”。

## 9. 运动方式与 Capability

主体类别不决定运动算法。运动来自 Capability 与 Profile：

```text
Subject Definition
  ├── locomotion.ground
  ├── locomotion.forward-steer
  ├── locomotion.wheeled-vehicle
  ├── locomotion.flight
  ├── interaction.mountable
  └── interaction.towable
```

Capability Manifest 声明：

- 配置 Schema；
- requires/provides；
- 冲突与基数；
- Activation Group；
- Runtime Phase；
- 资源预算；
- Conformance Fixture。

同一个主体可以安装地面和飞行运动，但同一 `locomotion` Activation Group 中只有一个权威模式激活。切换通过状态/动作事务完成，不靠 Agent 每帧选择算法。

新增“飞龙飞行”时，需要新增或复用 Flight Capability 与 Profile；不需要修改 `subject` 节点类型，也不需要复制一个 `FlyingDragonSubject` Class。

## 10. Instance：从 Definition 创建世界实体

主体实例只包含世界级身份与允许的实例差异：

```ts
interface SubjectInstanceConcept {
  id: EntityId;
  kind: "subject";
  definitionRef: ResourceRef;
  transformOrSpawnAnchor: unknown;
  variants?: Readonly<Record<string, string>>;
  overrides?: readonly ApprovedCompositionOperation[];
  role?: string;
}
```

实例必须具备：

- 世界内唯一、稳定、可读的 Entity ID；
- Definition/Preset Ref；
- 世界 Transform 或 Spawn Anchor 引用；
- 明确 Variant；
- 只落在 Definition `allowedOverridePaths` 内的覆盖；
- 可选的初始角色，例如 primary playable、ambient、vehicle。

实例不能覆盖：

- Babylon/Havok 类型；
- 未开放的 Collider 结构；
- Capability 插件实现；
- Registry Version/Hash；
- Socket 的底层 Bone 路径；
- 控制权限和 Session 身份。

### 10.1 Authoring Spawn 与 Runtime Spawn

- Authoring Spawn：Instance 已存在于 AuthoringSpec，Compiler 创建初始 RuntimeEntity。
- Runtime Spawn：通过版本化 Command 在固定 Tick/Phase Barrier 创建 Entity，返回 Receipt，并记录 Definition Ref、Instance ID、Transform、Request ID 和生效 Tick。

二者最终调用同一条 Definition Resolution 与 Entity Materialization 管线，不能维护两套生成逻辑。

## 11. Bind：类型化 Relationship，而不是万能连线

“绑定任意两个 Subject”表示底层 Relationship Framework 能扩展到任意兼容实体组合，不表示公开 Schema 只需要两个 Entity ID。

以下 API 形状不允许成为 AI-facing 协议：

```ts
bind(sourceId, targetId, params)
```

它无法说明两端角色、关系种类、Socket、基数、删除策略、物理约束或控制权。

AI-facing Relationship 必须是判别 Union，并使用角色化端点：

```ts
type RelationshipConcept =
  | {
      id: string;
      type: "mountedOn";
      riderEntityId: EntityId;
      mountEntityId: EntityId;
      seatId: string;
      bindingProfileRef: ResourceRef;
    }
  | {
      id: string;
      type: "towedBy";
      towedEntityId: EntityId;
      towingEntityId: EntityId;
      towedSocketId: string;
      towingSocketId: string;
      bindingProfileRef: ResourceRef;
    }
  | {
      id: string;
      type: "equippedAt";
      itemEntityId: EntityId;
      wearerEntityId: EntityId;
      slotId: string;
      bindingProfileRef: ResourceRef;
    };
```

最终关系类型名仍需公开命名评审，但角色化端点和判别 Union 是冻结原则。

### 11.1 Relationship Manifest

新增一种关系需要注册 Manifest：

```ts
interface RelationshipManifestConcept {
  id: string;
  version: number;
  schema: JsonSchema;
  endpointRoles: readonly {
    roleId: string;
    requiredCapabilityRefs: readonly ResourceRef[];
    allowedEntityKinds: readonly string[];
    cardinality: "one" | "optional" | "many";
  }[];
  conflictsWith: readonly ResourceRef[];
  deletionPolicy: "cascade" | "detach" | "reject";
  transactionHandlerRef: ResourceRef;
}
```

Compiler Core 只处理统一的 Manifest/Dependency/Transaction 协议，不为每个具体动物或载具增加分支。关系特有行为由受信 Transaction Handler 实现并经过 Conformance Test。

### 11.2 三种示例

#### 马与马车

```text
horse: locomotion.ground + interaction.towing
carriage: interaction.towable
towedBy:
  towingEntityId = horse
  towedEntityId = carriage
  sockets = horse.TowHitchRear ↔ carriage.TowBarFront
  physics = articulated tow joint profile
```

马车不是马的子节点。逻辑图记录 `towedBy`，物理图创建 Joint，渲染图保持各自独立 Transform。

#### 人与滑板

```text
person: biped + controllable
skateboard: board locomotion + standable
mountedOn/standing binding:
  riderEntityId = person
  mountEntityId = skateboard
  seat/stance = stand
  control transfer = transfer-to-mount or composite policy
```

是否使用 `mountedOn` 的 `stand` Variant，还是注册独立 `standingOn`，由关系命名与基数评审决定；不能为了示例硬编码到人物 Controller。

#### 汽车与拖车

```text
car: wheeled vehicle + towing
trailer: towable + wheel physics
towedBy:
  towingEntityId = car
  towedEntityId = trailer
  sockets = car.TowHitchRear ↔ trailer.TowBarFront
```

马—马车和汽车—拖车复用同一种 Relationship 语义，但双方 Capability/Profile 和物理 Joint Profile 不同。

## 12. Relationship Transaction

关系创建、变更和解除必须使用事务：

```text
validate Schema and entity existence
  → validate endpoint capabilities and cardinality
  → validate Socket compatibility and distance
  → reserve relationship ID and affected resources
  → prepare logical state
  → prepare render attachment/alignment
  → prepare collider, body, joint and collision-group changes
  → prepare possession/locomotion/camera changes when declared
  → commit at fixed phase barrier
  → emit Event and idempotent Receipt
```

任一步失败都回滚到上一稳定状态。失败不能留下：

- 半条 Relationship；
- 悬挂 Joint；
- 已禁用但没有关系的 Collider；
- 已转移但没有坐骑状态的控制权；
- 指向错误主体的 Camera；
- 未释放的 RenderNode、Listener 或 Asset Lease。

动态 `bind` 必须携带 Request ID、期望基线/关系状态和明确的冲突策略。重复请求返回相同 Receipt，不重复创建资源。

## 13. Normalizer 与 Compiler 管线

```text
AuthoringSpec
  ├── Registry Preset Ref
  ├── Package Subject Definition
  ├── Subject Instances
  └── Typed Relationships
        ↓
Canonical Schema Validation
        ↓
Registry / Package Resolution
        ↓
Definition Composition
  ├── Geometry
  ├── Socket Set
  ├── Collider Policy
  ├── Capability Graph
  └── Profiles
        ↓
Instance Materialization
        ↓
Relationship Endpoint / Capability Validation
        ↓
NormalizedWorldIR
  ├── RuntimeEntities
  ├── Normalized Capabilities
  ├── Generic internal relationship edges
  └── resolved refs + hashes + provenance
        ↓
ExecutionPlan
  ├── Render resources
  ├── Physics bodies/colliders/joints
  ├── Controllers and Systems
  └── initial relationship transactions
```

AI-facing 关系保留业务角色名；只有 NormalizedWorldIR 内部可以映射为统一 `sourceEntityId/targetEntityId`，同时保留原始 Relationship Type、角色映射和输入 JSON Pointer。

## 14. AI Discovery 与错误修复

AI 不应该靠记忆猜测有哪些主体和关系。SDK 提供机器可读 Discovery：

```text
list subject presets
describe subject preset
list geometry recipes
list capabilities
describe capability
list relationship types
describe relationship type
validate subject definition
explain compiled subject
examples by capability/relationship
```

正式 CLI 命名以后统一评审；Discovery 结果至少包含：

- Resource Ref 与版本；
- AI 可读描述；
- 配置 Schema；
- requires/provides/conflicts；
- 支持的主体种类和介质；
- 必需 Socket/Slot；
- 允许覆盖路径；
- 预算与平台限制；
- 最小合法示例；
- 相关 Diagnostic 与修复建议。

常见错误必须机器可读：

| Diagnostic | 含义 |
|---|---|
| `SUBJECT_DEFINITION_NOT_FOUND` | Definition/Preset Ref 无法解析 |
| `SUBJECT_DEFINITION_INVALID` | Definition 不符合 Canonical Schema |
| `SUBJECT_CAPABILITY_UNSATISFIED` | Capability 依赖缺失或歧义 |
| `SUBJECT_COLLIDER_DERIVATION_FAILED` | 自动 Collider 无法确定生成 |
| `SUBJECT_SOCKET_NOT_FOUND` | Relationship 引用的 Socket 不存在 |
| `RELATIONSHIP_TYPE_NOT_SUPPORTED` | 当前 Registry 没有对应 Manifest |
| `RELATIONSHIP_ENDPOINT_INCOMPATIBLE` | 端点缺少所需 Capability 或类型不兼容 |
| `RELATIONSHIP_CARDINALITY_CONFLICT` | Seat/Slot/关系基数冲突 |
| `RELATIONSHIP_TRANSACTION_FAILED` | Prepare/Commit 失败且已回滚 |

Diagnostic 必须指出 JSON Pointer、相关 Entity/Resource/Relationship ID、允许值和修复建议，不能只返回 Babylon/Havok 异常。

## 15. 扩展一种能力时改什么

### 15.1 新增主体 Preset

需要：

- Subject Definition/Preset Manifest；
- Geometry/Asset 与 Body/Socket/Collider/Profile 引用；
- Capability 组合；
- Registry Lock；
- 独立 Fixture；
- Schema/Compiler/Runtime Conformance；
- 白膜与 Collider/Socket 可视 QA。

不需要修改 `subject` 节点基础类型或 Compiler Core。

### 15.2 新增运动方式

需要：

- Capability Manifest；
- Control Method/Profile；
- Runtime System/Port 实现；
- Capability 生命周期与资源所有权；
- 固定输入、Snapshot、Replay 和性能测试。

不需要创建新的 Subject 基类。

### 15.3 新增 Relationship

需要：

- 业务角色明确的 AI-facing Schema；
- Relationship Manifest；
- endpoint capability/cardinality/conflict/deletion policy；
- Transaction Handler；
- Receipt/Event/Snapshot；
- 回滚、幂等和资源泄漏测试。

不需要把关系语义塞进 RenderNode 父子结构。

## 16. 分阶段落地

### S0：Registry-ready 多主体基础

- Registry 接口和首批内置 Kit。
- 多 Subject Instance、独立 Spawn Anchor。
- 每个 Kit 编译白膜几何、Collider 和 Locomotion Profile。
- 复数 ExecutionPlan/Snapshot。
- 默认 Controller 在主体间切换。

S0 是当前 [`Subject Foundation Visible Slice`](../plans/2026-08-19-subject-foundation-visible-slice.md) 的范围。首批 Registry 内容是闭合集，但 Registry API、数据结构和 Compiler 输入不得写死为“只能有两种主体”。

### S1：Package 局部自定义 Definition

- `resources` 中的 Subject Definition Schema。
- Primitive/Asset Geometry Composition。
- Socket Set。
- Collider derive/profile/compound 策略。
- 注册 Capability 与 Profile 组合。
- Definition Hash、Package Lock、Discovery 与 Explain。

完成 S1 后，概念上的 `define + spawn` 才算生产可用。

### S2：类型化 Relationship Framework

- Relationship Manifest Registry。
- role-specific endpoints。
- 初始 Relationship 编译。
- 动态关系事务、Receipt、Event、回滚与幂等。
- `attachedTo`、`mountedOn`/站立、`towedBy` 代表性关系。
- 人—滑板作为第一个浏览器 E2E。

完成 S2 后，概念上的 `bind` 才算生产可用。

### S3：骑乘、拖拽与控制上下文

- Mount/Seat/Stand/Tow Binding Profile。
- Socket Alignment。
- Physics Joint/Collider Group。
- Possession、Locomotion、Action 与 Camera Context 原子切换。
- Safe Exit/Detach。
- 马—马车、汽车—拖车、人物—坐骑 Fixture。

### S4：飞行、装备与更复杂组合

- 飞行动物/飞行器 Capability。
- Equipment Slot 与 Rig Socket。
- Action Variant 与 Animation Binding。
- 飞龙骑乘、武器与组合动作。

## 17. 验收标准

至少通过以下 Fixture：

1. 一个 JSON 创建人形和四足白膜；两者使用不同自动 Collider/Profile，Snapshot 中具有独立稳定 ID。
2. 同一个 Package Definition 生成两个实例；两者共享 Definition Hash，但 Transform、状态和控制权独立。
3. 修改 Definition Part 顺序不改变规范化输出 Hash；修改语义几何或 Collider Policy 会改变 Hash。
4. 自动 Collider 推导成功时输出确定 Shape；失败时返回结构化 Diagnostic，不静默猜测。
5. 默认 Controller 可以从人切到自定义主体；输入由目标 Locomotion Capability 解释。
6. 人—滑板 Binding 原子提交，人物对齐 Socket，Collider/Camera/控制状态一致；解除后完全恢复。
7. 马—马车与汽车—拖车复用 `towedBy` Framework，但使用不同 Profile 和 Joint 配置。
8. 关系端点不兼容、Socket 不存在或基数冲突时，逻辑/渲染/物理状态均保持不变。
9. 重复 Spawn/Bind Command 按 Request ID 返回同一 Receipt，不重复创建 Entity、Collider、Joint 或 Listener。
10. 世界模型关闭时，白膜 Runtime 仍能独立完成全部创建、物理、控制、绑定、解绑和 Snapshot 验收。

## 18. 已冻结决策

1. Definition、Instance、Relationship 是三个独立概念。
2. 普通 AI 使用 Preset/Kit；高级 AI 只能组合注册 Geometry、Profile 和 Capability。
3. 自定义 Definition 放在 Package Resources 或 Registry，不复制到每个 Subject Node。
4. 自动 Collider 是版本化确定性策略，不是运行时按 Mesh Bounds 猜测。
5. World Anchor、Subject Socket 和 Gameplay Slot 分离。
6. 主体类别不决定行为；Locomotion、Mountable、Towable、Flight 等由 Capability 表达。
7. AI-facing Relationship 使用判别 Union 和角色化端点，不暴露万能 `source/target/params`。
8. 关系变化是跨逻辑、渲染、物理、控制和相机的事务，必须支持回滚和幂等 Receipt。
9. RenderNode 层级只是关系的运行时派生结果，不能成为 Gameplay 真相。
10. Registry、Normalizer、Compiler 和 Runtime Adapter 分层；公共 Schema 不包含 Babylon/Havok 类型。
11. 当前概念方法名不冻结；正式命名通过独立版本化评审确定。
12. S0 先交付可见基础，但实现边界必须允许 S1/S2 增加 Package Definition 与 Relationship Manifest，不能把闭合集写死进 Compiler Core。

## 19. 后续命名评审项

以下名称故意不在本文冻结：

- `SubjectPreset`、`SubjectKit`、`SubjectDefinition` 的最终公开分工与 Resource URI 命名空间。
- 创建 Definition 的 TypeScript 方法名和 CLI 命令名。
- 创建 Instance 使用 `spawn`、`instantiate`、`create` 中的哪一个术语。
- 通用关系提交入口使用 `bind`、`relate` 还是基于 Relationship Type 的显式命令。
- 人—滑板采用 `mountedOn` 的 `stand` Binding Profile，还是独立 `standingOn` Relationship。
- `towedBy` 与 `tows` 的方向性公开命名。

命名评审必须以 AI 生成歧义测试、Schema 一致性、业界术语和迁移成本为依据。无论最终方法名如何变化，本文件第 3 至 18 节的语义和扩展边界保持成立。
