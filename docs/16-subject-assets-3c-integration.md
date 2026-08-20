# 主体资产与 3C 配置接入 World SDK 技术契约

- 状态：设计评审稿；S1a、Golden Humanoid 与首个产品 G Bot S1b 可视切片已实现
- 版本：v0.2
- 日期：2026-08-19
- 产品输入：《世界模型底层引擎主体资产与 3C 配置体系》v0.1
- 技术基线：[AI-first LEGO Game SDK 设计](./superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)

> 实现状态（2026-08-20）：S1a 已交付 Canonical Authoring V2、Registry/Package
> Primitive Subject Definition、Socket、自动 Capsule、Definition Hash、Resource
> Lock、复数实例、单 Controller 原子切换和 Subject Explain。项目自有 Golden GLB
> 与首个产品 G Bot 已打通 Asset/Rig/Animation/Collider、`idle/walk/run/jump`、
> Bone Socket 与 CLI/Browser/Havok Gate。更多产品资产、Medium State Resolver、
> Relationship、坐骑、装备、多 Controller 与飞行仍是后续契约，不是当前运行能力。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

## 1. 结论

产品文档与 SDK 的 LEGO 架构方向一致。产品侧定义“一个主体需要哪些资产和体验配置”，SDK 把这些内容编译为可执行的 Capability、Profile、Relationship 和 Runtime System。

生产方案不是为人物、汽车、飞龙分别编写场景脚本，而是：

```text
产品与资产团队交付版本化资产和 Profile
  → SDK Registry 注册并验证
  → Registry Subject Definition 组合成可用主体
  → Scene Agent 只选择 Definition、位置和高层关系
  → Runtime 根据物理、介质、控制权和动作状态自动运行
```

人物进入水中自动游泳、骑上飞龙后控制权转给飞龙、拿剑后切换动作 Variant，均应由通用 Runtime System 和配置驱动，不应由 Scene Agent 为每个场景编写条件脚本。

CLI、Browser、键盘、AI 和 NPC 在目标架构中只是不同 ControlSource。它们通过
同一 Controller/Possession/Intent 协议控制主体；后续多 Controller 协议将允许
一个 CLI Session 在同一 Tick 控制多个主体。当前 S1a 只实现一个受信默认
Controller 在多个主体之间原子切换。

## 2. 文档边界

本文负责定义：

- 产品主体资产表如何映射为 SDK Schema。
- Subject Definition、Profile、Capability 和资产包的职责边界。
- Character、Control、Camera、Physics/Medium、Mount 与 Render Binding 的组合方式。
- 人物陆地、水中、空中、骑乘状态的通用判定链路。
- Controller、控制权绑定和多人 CLI 控制协议。
- 资产接入、版本、验证、失败处理和分阶段交付。

本文不重新定义地形、水面生成和参考图还原算法；这些继续由 World SDK 主规格和地形管线规格负责。本文也不规定某个 Babylon/Havok 算法的内部实现，只定义引擎无关契约和验收结果。

## 3. 四方职责

| 参与方 | 负责 | 不负责 |
|---|---|---|
| 产品/策划 | 主体分类、体验规则、状态优先级、手感参数范围、Camera/Control/Profile 选择 | Babylon 节点、物理句柄、逐场景代码 |
| 美术/资产 | GLB、骨架、动作、可驱动节点、Anchor/Socket、朝向尺度、Collider 参考 | 决定权威位移、入水状态和控制权 |
| World SDK | Schema、Registry、Compiler、Control Router、State Resolver、Physics、Camera、Action、Render Binding 和验收工具 | 为每个场景手写玩法逻辑、让 Agent 操作底层引擎对象 |
| Scene Agent | 选择 Subject Definition、创建实例、放置、声明关系和高层目标/动作 | 动画 Clip 名、介质阈值、Collider 细节、控制器算法、Camera 避障算法 |

世界模型或渲染模型可以根据稳定状态补足外观和连续动作细节，但不能改变接地、入水、权威位移、控制归属或碰撞结果。

## 4. 产品概念到 SDK 概念的映射

| 产品概念 | SDK 权威对象 | 说明 |
|---|---|---|
| Subject Preset | `RegistrySubjectDefinition` | 产品目录中的大积木；公开 Schema 统一称 Subject Definition |
| Body Art | `VisualProfile` + Asset Resource | 模型、朝向、尺度和 Pivot |
| Human Action Pack | `AnimationSet` + `ActionVariantSet` | 语义 Action 到动画资源的映射 |
| Non-human Pose Set | `PoseSetProfile` | 少量稳定状态姿势 |
| Collider Profile | `BodyProfile` + `PhysicsProfile` | 权威空间、质量和查询代理 |
| Anchor / Socket Profile | `RigProfile` + `SocketProfile` | 相机、手、座位、退出点等空间接口 |
| Character State Profile | `SubjectStateProfile` + `StateResolver` | 分层状态和优先级 |
| Control Method Chain | `ControlMethodProfile` + Capability Pipeline | Intent 如何转换为运动请求 |
| Feel Profile | `ControlFeelProfile` | 速度、加减速、转向、响应曲线 |
| Camera Method Chain | `CameraRigProfile` + Camera Capability | 目标、构图、跟随、避障和 FOV |
| Physics / Medium Profile | `PhysicsMediumProfile` + Medium Sensor | 接地、浸没、浮力、阻力和状态阈值 |
| Mount Binding Profile | `MountBindingProfile` + Relationship Transaction | 座位、控制权、Collider、相机和退出 |
| Render Binding | `RenderBindingProfile` | 向世界模型暴露稳定语义状态 |

产品文档中的 `Control Ownership` 对应 Runtime 的 `possessedBy`；`Control Method Chain` 仍属于受控主体。两者不能合并：前者回答“谁控制谁”，后者回答“这个主体如何解释输入”。

## 5. 资源模型与 Schema

### 5.1 稳定资源引用

所有可复用定义都通过受约束的 Registry/Package URI 引用；Authoring 输入与解析后的锁定引用使用不同类型：

```ts
type ResourceRef = string;

interface ResourceLockEntry {
  resourceRef: string;
  resolvedVersion: string;
  contentHash: string;
}
```

- `ResourceRef` 受 `worldkit-resource-ref` Format 约束，必须携带精确版本。
- Normalizer 将每个实际使用的资源固化为 `ResourceLockEntry`；`resolvedVersion + contentHash` 锁定当前构建实际使用的实现。
- Registry Lock 记录 Schema Hash、Manifest Hash、实现 Hash 和资产 Hash。
- 生产构建禁止使用“latest”或按注册顺序选择资源。

### 5.2 RegistrySubjectDefinition

产品侧的 Subject Preset 在 SDK 公开协议中统一落为 Subject Definition，不包含
Babylon Mesh、Havok Handle 或场景脚本：

```ts
interface RegistrySubjectDefinition {
  id: string;
  version: number;
  category: "human" | "animal" | "vehicle" | "furniture" | "composite";
  bodyTopology: string;
  sizeClass: "small" | "medium" | "large";
  supportedMediums: readonly ("ground" | "water" | "air")[];
  capabilityRefs: readonly ResourceRef[];
  profiles: {
    visualProfileRef: ResourceRef;
    bodyProfileRef: ResourceRef;
    rigProfileRef?: ResourceRef;
    socketSetRef: ResourceRef;
    stateModelRef: ResourceRef;
    controlMethodProfileRef: ResourceRef;
    controlFeelProfileRef: ResourceRef;
    cameraRigRef: ResourceRef;
    mediumPhysicsProfileRef: ResourceRef;
    renderBindingProfileRef: ResourceRef;
    animationSetRef?: ResourceRef;
    poseSetRef?: ResourceRef;
    mountBindingProfileRef?: ResourceRef;
  };
  aiMetadata: {
    displayName: string;
    description: string;
    allowedOverridePaths: readonly string[];
    usageExamples: readonly string[];
  };
}
```

`bodyTopology` 描述标准人形、四足、蛇形、四轮等运动/身体拓扑；翼、鳍、可骑乘、可驾驶是 Capability，不创建深层继承 Class。尺寸默认通过 Body、Collider、质量、速度和 Camera Profile 组合，身体比例显著变化时才新增美术资源。

### 5.3 Agent-facing 主体实例

普通 Scene Agent 只写小而稳定的实例 Schema。当前 Canonical Authoring V2 的
主体实例不复制 Definition 配置：

```json
{
  "id": "hero",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.third-person@1",
  "spawnAnchorEntityId": "spawn-hero"
}
```

Agent 不填写：动画 Clip 名、骨骼名、Collider 尺寸、入水阈值、加速度、Camera Raycast 参数和底层控制器类型。高级覆盖只有在 Definition 的 `allowedOverridePaths` 中显式开放后才有效。

当前默认控制目标由 `startup.controlledEntityId` 声明。Runtime Host 在 Session
Bootstrap 时创建受信默认 Controller；Controller ID、权限和绑定不写入普通场景
Schema。多 Controller Session 属于后续控制协议。

### 5.4 主体资产包

产品/美术交付以版本化 Bundle 进入资产管线：

```ts
interface SubjectAssetBundle {
  id: string;
  version: number;
  category: string;
  bodyTopology: string;
  coordinateConvention: {
    metersPerUnit: 1;
    forwardAxis: "-Z";
    upAxis: "+Y";
    pivot: "support-center" | "custom";
  };
  artifacts: readonly {
    id: string;
    kind: "model" | "animation" | "pose" | "metadata";
    uri: string;
    contentHash: string;
  }[];
  rigRef?: ResourceRef;
  sockets: readonly SocketDeclaration[];
  colliderHints: readonly ColliderHint[];
  semanticTags: readonly string[];
}
```

Bundle 只提供资产事实和参考；最终 Collider、控制、物理和 Camera Profile 由 SDK Registry 中经过验收的配置决定。

### 5.5 S1b 产品人物资产交付清单

产品/资产团队接入 Canonical Babylon 运行时，不需要交付场景脚本；需要交付一组
可生成下列 Registry 资源的确定性事实。字段缺失时 SDK 应阻断接入，不能在 Scene
或 Loader 中猜测。

| 必需输入 | 当前 S1b 契约 | Golden / G Bot 已验收参考值 |
|---|---|---|
| GLB bytes | 单文件、自包含 GLB 2.0；不允许外部 Buffer/Image URI | Golden 43,656 bytes；G Bot 3,362,888 bytes |
| Coordinate convention | `-Z` Forward、`+Y` Up、1 meter/unit | 同契约 |
| Pivot | `support-center`，主体 Origin 与 Collider/Camera/Snapshot 共用 | 同契约 |
| Asset Hash | 对原始 GLB bytes 计算 `sha256:`，并记录精确 `byteLength` | Golden `sha256:1095fd…8c2c2`；G Bot `sha256:74bbf9…3c286` |
| License/Provenance | SPDX 或内部 License ID、再分发策略、作者；可选来源/许可证 URI 只留在 Registry Manifest | `LicenseRef-Project-Owned`、`allowed`、`Agent Whitebox World SDK` |
| Bone mapping | 版本化 Rig Profile：唯一 Skeleton Root 独立声明，17 个解剖语义 Bone ID → 源节点名 | Golden `biped.golden@1`；G Bot `biped.mixamo-g-bot@1` |
| Clip mappings (4) | 版本化 Animation Set：每个语义 Action 显式映射源 Clip、Loop、速度、Blend、Root Motion | Golden 与 G Bot 均显式映射 `idle/walk/run/jump`，全部 in-place |
| Collider ref | 引用经过验收的 Collider Profile；不在运行时从 Mesh Bounds 猜测 | `worldkit://collider-profile/humanoid.medium-capsule@1`，0.32m radius / 1.92m height |
| Bone Sockets (optional) | 可选；使用稳定 Socket ID、语义 `boneId` 与局部 Offset，不暴露 Babylon Node Path | Golden 提供 `hand.right` → `boneId: "hand.right"` |

产品接入时通常新增或更新 Subject Asset、Rig Profile、Animation Set、Collider Profile
和 Subject Definition Registry 内容。普通 World Agent 仍只写
`subjectDefinitionRef`；GLB URI、鉴权、骨骼名、源 Clip 名与 Capsule 参数不进入世界 JSON。

当前最小接入/验证流程是：

```bash
pnpm worldkit validate examples/authoring/rigged-subject-world.json --json
pnpm worldkit capture examples/authoring/rigged-subject-world.json \
  --output artifacts/examples/rigged-subject-world/world.png \
  --snapshot artifacts/examples/rigged-subject-world/snapshot.json \
  --json
pnpm verify:rigged-subject
```

三条命令共同构成最小上手流程；只有最后的 `pnpm verify:rigged-subject` 是单命令
Gate。产品资产通过前还需要把同一 Gate 扩展为该资产的 Hash/Inventory、Rig、Clip、
Collider、动作截图、实例隔离、碰撞和许可证证据，不能把 Golden 的通过结果直接继承
给产品资产。

首个产品资产 G Bot 已按上述流程完成独立 Gate：

```bash
pnpm worldkit validate examples/authoring/g-bot-subject-world.json --json
pnpm worldkit subject explain examples/authoring/g-bot-subject-world.json \
  --entity-id g-bot-primary --json
pnpm verify:g-bot-subject
```

这里存在两层映射文件，职责不可混合：产品交付的 `asset.manifest.json` 和
`action-manifest.json` 记录源文件、源 Bone、源 Clip 与制作事实；SDK 注册的
`RigProfile` 和 `AnimationSet` 把这些源 Key 转成 `hand.right`、`walk` 等稳定语义
Key。AI-facing World JSON 只引用 `worldkit://subject-definition/humanoid.g-bot@1`。

## 6. Character：分层状态而不是复制主体

### 6.1 权威状态层

Runtime 按固定层级解析主体状态：

```text
1. Possession：由 possessedBy / controlBindings 表达，不复制到主体状态字段
2. Mount Role：driver / rider / passenger / none
3. Movement Medium：ground / water / air
4. Locomotion Mode：walk / swim / flight / vehicle / mounted / none
5. Active Action / Pose：idle / move / turn / jump / fall / attack / ...
```

上层状态约束下层选择。动作只表现已提交状态，不能反向写入权威位移或伪造接地/入水事实。

```ts
interface SubjectStateSnapshot {
  entityId: EntityId;
  mountRole?: "driver" | "rider" | "passenger";
  movementMedium: "ground" | "water" | "air";
  locomotionMode: string;
  activeActionRef: ResourceRef;
  stateTags: readonly string[];
  effectiveTick: number;
}
```

### 6.2 人物进入水中的标准链路

Scene Agent 只负责创建人物和水体；SDK 自动执行：

```text
Physics/Water Query
  → MediumSensor 产生 waterDepthMeters、immersionRatio、hasGroundContact
  → StateResolver 使用进入/退出阈值和优先级
  → Capability Transaction 暂停 ground locomotion、激活 swim locomotion
  → 选择 Water Action Pack、Water Control Feel 和 Camera Context
  → Physics 执行浮力、阻力和权威位移
  → Render Binding 发布 movementMedium=water、locomotionMode=swim 等稳定状态
```

```ts
interface PhysicsMediumProfile {
  id: string;
  version: number;
  ground: {
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
    groundingToleranceMeters: number;
  };
  water?: {
    enterDepthMeters: number;
    exitDepthMeters: number;
    enterImmersionRatio: number;
    exitImmersionRatio: number;
    buoyancyScale: number;
    linearDragCoefficient: number;
    angularDragCoefficient: number;
    surfaceHoldStrength: number;
  };
  air?: {
    gravityScale: number;
    dragCoefficient: number;
  };
}
```

进入与退出必须使用不同阈值形成迟滞，防止水面边界抖动。水中优先级高于未骑乘翼装；骑乘时继承被骑对象的运动方法。切换失败时保留上一稳定状态并产生 Diagnostic，不能出现一半游泳、一半地面碰撞的中间态。

## 7. Control：来源、归属和运动方法分离

### 7.1 三层模型

```text
ControlSource：输入从哪里来
ControllerEntity：哪个稳定身份拥有控制权限
ControlMethod：受控主体怎样解释语义 Intent
```

ControlSource 首批包括 Keyboard、Gamepad、Browser、CLI、AI、Script；NPC 后续也复用同一接口。它们都输出语义 Intent，例如 `move`、`look`、`jump`、`interact`、`perform-action`，不直接调用人物 Motor。

### 7.2 Controller 与 Possession Schema

```ts
interface ControllerEntitySpec {
  id: ControllerId;
  kind: "controller";
  ownerSessionId: SessionId;
  controlSource: {
    kind: "keyboard" | "gamepad" | "browser" | "cli" | "ai" | "script" | "npc";
    sourceId: string;
  };
  scopes: readonly ("control.intent" | "control.bind")[];
  allowedTargetEntityIds?: readonly EntityId[];
}

interface PossessedByRelationship {
  type: "possessedBy";
  schemaVersion: 1;
  controlledEntityId: EntityId;
  controllerId: ControllerId;
  channels: readonly ("locomotion" | "action")[];
}
```

默认规则：

- 一个 Controller 在同一 Channel 同时只控制一个主体。
- 一个主体的同一 Channel 同时只接受一个权威 Controller。
- 一个 Session 可以拥有多个 Controller。
- 乘客座不转移 Locomotion 控制；驾驶座和骑乘座按 MountBinding 转移。
- Group Command 必须展开成多个 Controller Intent，不能把一个 Controller 隐式绑定多个主体。
- 标准玩家 Controller 默认同时绑定 `locomotion` 与 `action`；拆分 Channel 是受权限控制的高级策略。

### 7.3 Control Method Chain

```text
Input Mapping
  → Input Reference Frame
  → Medium and State Resolution
  → Locomotion Method
  → Facing Rule
  → Feel Profile
  → Physics Drive
```

```ts
interface ControlMethodProfile {
  id: string;
  version: number;
  inputSpace: "camera-relative" | "subject-local" | "flight-frame";
  locomotionModel:
    | "direct-move-facing"
    | "forward-steer"
    | "wheeled-vehicle"
    | "watercraft-steer"
    | "flight-steer"
    | "none";
  facingPolicy: "align-to-move" | "steering-derived" | "flight-derived" | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden" | "profile";
  feelProfileRef: ResourceRef;
}
```

同一个 `move` Intent 可以在控制权转移后自然改变解释方式：人物是相机相对移动，汽车是油门和车轮转向，飞龙是飞行趋势。外部 Agent 不需要改写命令词汇。

### 7.4 CLI 同时控制多个人

外部程序保持一个 `worldkit run --interactive --protocol ndjson` Session，先创建多个 Controller，再分别绑定人物：

```jsonl
{"type":"controller.create","requestId":"r1","controllers":[{"id":"controller-red","controlSource":{"kind":"cli","sourceId":"director"}},{"id":"controller-blue","controlSource":{"kind":"cli","sourceId":"director"}}]}
{"type":"control.bind","requestId":"r2","controllerId":"controller-red","controlledEntityId":"person-a","channels":["locomotion","action"]}
{"type":"control.bind","requestId":"r3","controllerId":"controller-blue","controlledEntityId":"person-b","channels":["locomotion","action"]}
```

同一 Tick 的多人输入使用 Batch：

```json
{
  "type": "control.intent-batch",
  "requestId": "r4",
  "targetTick": 120,
  "commands": [
    {
      "controllerId": "controller-red",
      "sequenceNumber": 1,
      "expectedControlledEntityId": "person-a",
      "intent": { "type": "move", "forward": 1 }
    },
    {
      "controllerId": "controller-blue",
      "sequenceNumber": 1,
      "expectedControlledEntityId": "person-b",
      "intent": { "type": "move", "right": 1 }
    }
  ]
}
```

命令的权威目标来自 `possessedBy`。`expectedControlledEntityId` 只用于发现控制权已经切换，不能绕过 Binding。Batch 在进入 Tick 队列前整体校验；任一 Controller、权限、Sequence、Binding 或 Intent 非法时整批拒绝。

`controller.create` 不能由调用方自行指定或扩大 Scope 和目标白名单；这些权限来自 Host Session Policy。Session 关闭、超时或宿主断开时，Runtime 释放相关 Binding，并按场景策略让主体安全停止、进入默认 AI 或保持无控制状态。

### 7.5 Browser 与 Playwright

Playwright Driver 只包装同一套 Runtime 控制协议，不通过合成键盘事件建立第二套输入真相：

```text
createControllers
  → bindControl
  → setIntent / setIntents
  → stepTicks
  → getSnapshot
  → captureFrame
```

移动和动作按固定 Tick 推进，禁止依赖任意 `waitForTimeout` 猜测模拟进度。截图明确指定 Camera/View 和 Render Pass；控制多个主体不隐式创建多个 Camera，截图权限也不授予主体控制权。

## 8. Camera：独立对象，默认跟随控制上下文

Camera Entity、ControllerEntity 和 Subject Entity 是三个独立对象：

- 控制某个主体不代表拥有任意 Camera。
- 观察某个 Camera 不代表拥有主体控制权。
- 产品文档中的 Camera Ownership 表示默认跟随策略，不表示 Camera 与控制器合并为一个对象。

```ts
interface CameraContextBinding {
  id: string;
  when: {
    mountRoles?: readonly ("driver" | "rider" | "passenger")[];
    locomotionModes?: readonly string[];
    movementMediums?: readonly ("ground" | "water" | "air")[];
    allTags?: readonly string[];
    anyTags?: readonly string[];
    excludedTags?: readonly string[];
  };
  rigRef: ResourceRef;
  targetPolicy: "controlled-entity" | "rider" | "explicit-entity";
  explicitTargetEntityId?: EntityId;
  priority: number;
}
```

人物自由移动时可使用 Human First Person 或 Human Third Person；骑乘后，Mount Transaction 先提交新的控制权和运动状态，Camera Director 再选择被控制对象的 Mounted/Vehicle/Flight Profile。乘坐家具时可以继续跟随人物。一个 Session 同时控制多个人时，可以只观察一个目标，也可以显式创建多个 View。

## 9. Mount、Seat、Anchor 与控制权转移

人物、坐骑、载具和家具始终是独立 RuntimeEntity；组合关系不通过永久父子节点表达。

```ts
interface MountBindingProfile {
  id: string;
  version: number;
  seatPose: "sit" | "straddle" | "stand" | "cabin";
  riderAlignmentSocketId: "SeatAlignment";
  mountSeatSocketId: string;
  controlTransferPolicy: "transfer-to-mount" | "keep-rider" | "none";
  riderColliderPolicy: "disabled-dynamic-query-only" | "enabled";
  cameraTargetPolicy: "controlled-entity" | "rider";
  riderActionPackRef: ResourceRef;
  safeExitSocketIds: readonly string[];
}
```

标准 Mount Transaction：

```text
validate seat, distance, controller and capabilities
  → reserve seat and safe rollback state
  → align rider visual to seat socket
  → suspend rider locomotion and switch collider mode
  → transfer possessedBy when seat grants control
  → commit mountedOn and possessedBy at phase barrier
  → Camera Director consumes committed state
  → emit MountReceipt
```

解除时先查找并验证 SafeExit。没有安全落点则保持绑定并返回失败，不能把人放进 Collider 或地面下方。

## 10. Action、装备与资产 Variant

动作使用稳定语义 ID，而不是资产 Clip 名：

```text
idle
walk
run
jump
swim.surface
swim.underwater
ride
drive
attack.light
interact
```

AnimationSet 根据上下文选择 Variant：

```ts
interface ActionVariantRule {
  actionRef: ResourceRef;
  when: {
    locomotionMode?: string;
    equippedTags?: readonly string[];
    mountRole?: "driver" | "rider" | "passenger";
    movementMedium?: "ground" | "water" | "air";
  };
  animationRef: ResourceRef;
  fallbackAnimationRef?: ResourceRef;
}
```

因此空手跑、持剑跑、持剑攻击、骑乘姿势和水中动作都可以通过 Action Pack/Profile 扩展。武器是独立 Entity，通过 `equippedAt` 关联人物；RigSocket 只负责视觉挂载，EquipmentSlot 是 Gameplay 真相。

## 11. Render Binding

Render Binding 向白膜渲染器和后续世界模型发布稳定、可查询的条件：

```ts
interface SubjectRenderBindingSnapshot {
  entityId: EntityId;
  semanticClass: string;
  bodyTopology: string;
  sizeClass: string;
  forward: readonly [number, number, number];
  speedMetersPerSecond: number;
  movementMedium: "ground" | "water" | "air";
  locomotionMode: string;
  activeActionRef: ResourceRef;
  poseId: string;
  mountEntityId?: EntityId;
  equippedEntityIds: readonly EntityId[];
  effectiveTick: number;
}
```

世界模型可以读取这些值生成最终表现，但不能改写它们。白膜 Runtime 在世界模型关闭时仍必须正确完成移动、碰撞、状态切换、控制权转移、Camera 和基础姿势。

## 12. Snapshot、Receipt 与错误协议

Runtime Snapshot 使用复数集合和稳定 ID，不能只返回一个 `player`：

```ts
interface RuntimeSnapshot {
  sessionId: SessionId;
  currentTick: number;
  controllersById: Record<ControllerId, ControllerSnapshot>;
  controlBindings: readonly ControlBindingSnapshot[];
  subjectStatesByEntityId: Record<EntityId, SubjectStateSnapshot>;
  camerasById: Record<EntityId, CameraSnapshot>;
}
```

所有 Bind、Mount、Capability 切换和 Action 返回幂等 Receipt。失败必须保留上一稳定状态，并返回机器可读错误：

| 错误码 | 含义 |
|---|---|
| `CONTROL_SCOPE_DENIED` | Session 没有相应控制权限 |
| `CONTROL_TARGET_NOT_ALLOWED` | 目标不在 Controller 白名单 |
| `CONTROL_TARGET_NOT_POSSESSABLE` | 主体没有可控制能力 |
| `CONTROL_CHANNEL_OCCUPIED` | Channel 已被另一个权威 Controller 占用 |
| `CONTROL_BINDING_STALE` | `expectedControlledEntityId` 与当前绑定不一致 |
| `CONTROL_SEQUENCE_STALE` | Sequence 重复或倒退 |
| `CONTROL_INTENT_CONFLICT` | 同一 Controller/Channel/Tick 存在互斥命令 |
| `MEDIUM_TRANSITION_FAILED` | 介质能力切换无法完整提交 |
| `MOUNT_SAFE_EXIT_UNAVAILABLE` | 无安全解除位置，继续保持绑定 |
| `ASSET_PROFILE_INCOMPATIBLE` | 资产的 Rig/Socket/Action 与 Definition 不兼容 |

## 13. 资产接入流水线

每个产品资产包按固定流程接入：

```text
1. Ingest：读取 Bundle Manifest 和资产 Hash
2. Static Validate：尺度、朝向、Pivot、Rig、Socket、Clip、重复 ID
3. Profile Bind：绑定 Body、Action、Collider、Control、Camera、Medium、Mount、Render Profile
4. Registry Lock：锁定 Schema、Manifest、实现和资产 Hash
5. Fixture Build：生成独立主体测试场景
6. Runtime Conformance：移动、碰撞、Camera、动作、介质和控制权测试
7. Visual Inspection：正/右/背视图、Socket Debug、Collider Debug 和动作采样
8. Publish：发布版本化 Registry Subject Definition；旧版本继续可重建
```

资产不满足契约时返回结构化接入报告，不在 Scene Script 中做临时修复。常见阻断项包括：前向错误、单位不一致、缺失必需 Socket、骨架不兼容、Action 映射缺失、Collider 与视觉严重不符。

## 14. Agent-facing 边界

普通 Agent 需要知道：

- 有哪些 Subject Definition。
- 每个 Definition 支持哪些介质、能力、动作和关系。
- 如何创建实例、放置、装备、骑乘和发出语义动作。
- Diagnostic 说明了什么问题以及允许怎样修复。

普通 Agent 不需要知道：

- Babylon TransformNode/Mesh/AnimationGroup。
- Havok Body、Shape、Query 和 WASM Handle。
- 模型骨骼、Clip 文件名和 Socket 的底层节点路径。
- 人物何时从走路切游泳、各阈值是多少。
- WASD 怎样变成车辆转向或飞龙俯仰。
- Camera 避障、浮力、接地和 Character Controller 算法。

Agent 只有在明确创作新的 SDK Capability/Profile 时才进入高级模式；普通场景生成不能修改 SDK 内部实现。

## 15. 分阶段实现

Schema 和边界一次设计完整，运行能力分阶段交付。

### Phase 0：公共底座与基础人形

- Subject Definition/Resource/Profile Registry 与 Registry Lock。
- 标准人形 Body、Rig、Socket、Collider、陆地 Action Pack。
- Direct Move Facing、Human Feel、第一/第三人称 Camera。
- ControllerEntity、possessedBy、单/多 Controller Tick Intent 和复数 Snapshot。
- Asset Fixture、Schema/Compiler/Runtime Conformance。

当前已完成 Phase 0 中项目自有 Golden Humanoid 与首个产品 G Bot 的可视纵向切片；
更多产品资产、人形比例/拓扑、独立动画资产、完整姿态与 Action Request/Receipt
尚未完成。

### Phase 1：水中、骑乘、代表性动物与载具

- MediumSensor、迟滞阈值、游泳 Capability 和 Water Action Pack。
- Mount/Seat/SafeExit、控制权和 Camera Context 切换。
- 四足动物、四轮载具、可乘坐家具的首批 Registry Subject Definition。
- 多 Controller CLI/Browser 端到端测试和 Replay。

### Phase 2：飞行、装备动作与复杂遍历

- 翼装、飞行动物和飞行器。
- 装备 Action Variant、攻击窗口和组合动作。
- 攀爬、翻越等 Traversal Capability。
- 更复杂的 NPC/Script ControlSource，但继续复用 Controller/Intent 协议。

当前 Canonical Runtime 已使用复数 `subjectStatesByEntityId`、
`controllersById` 和 `controlledEntityId`；旧 Demo 的单人物
`setMovementIntent()` 与单数 `player` Snapshot 只作为历史实现，不是新协议的
兼容约束。S1b Golden Runtime 仍只有一个受信默认 Controller；多 Controller 同 Tick
输入尚未实现。

## 16. 验收场景

技术方案至少通过以下独立 Fixture：

1. **基础人形**：替换成人/儿童 Body Profile 后，Collider、Camera、速度和动作同步变化。
2. **人物入水**：跨越水边界时只发生一次稳定切换，游泳/陆地能力、动作、物理和 Render Binding 一致。
3. **骑乘飞龙**：人物与飞龙身份不变；骑乘、控制权、Collider、动作、Camera 和 SafeExit 原子切换。
4. **多人 CLI**：一个 Session 用两个 Controller 在同一 Tick 控制两个人物；Replay 得到相同状态结果。
5. **权限失败**：无 `control.bind` Scope 的 Session 不能抢占主体；失败不改变原绑定。
6. **控制权过期**：骑乘切换后，携带旧 `expectedControlledEntityId` 的 Intent 稳定失败。
7. **持剑动作**：空手跑、持剑跑、持剑攻击使用正确 Variant；缺失专用资源时按声明 fallback。
8. **世界模型关闭**：白膜 Runtime 仍可独立完成全部控制、物理、Camera 和状态验收。

## 17. 评审决策

本对接契约固定以下决策：

1. 产品侧交付资产和 Profile，SDK 维护通用 System；不建立逐场景脚本体系。
2. Subject Definition 是 AI-facing 大积木，内部由可替换 Profile 和 Capability 组合。
3. 控制来源、Controller 身份、控制权绑定和主体运动方法相互分离。
4. `possessedBy` 是控制权唯一真相，CLI 不能通过直接目标参数绕过它。
5. 一个 Session 可以拥有多个 Controller；多人同步控制使用按 Tick 的 Intent Batch。
6. Camera 与 Controller 分离，但默认根据已提交的控制上下文选择被控制对象的 Camera Profile。
7. 介质、骑乘、装备和动作切换由通用状态解析与事务完成，Scene Agent 不负责底层条件。
8. 逻辑关系、Render/Transform 挂载和 Physics 状态保持三图分离。
9. Schema 先覆盖长期组合需求，能力按 Phase 0/1/2 逐步实现。
