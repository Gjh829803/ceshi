# 上下文驱动 Gameplay 与 Camera 组合设计

## 1. 文档状态

- 状态：**Reviewed / Approved（2026-08-24）**；
  **Camera Domain boundary implemented，Runtime integration pending（2026-08-25）**。
- 适用里程碑：P2.2 骑乘与控制上下文、P2.3 装备/飞行/动作变体、P2.4 多相机模式。
- 当前实现基线：已合入 `main` 的 G19 Gameplay/Browser V5 底座、
  `RuntimeHost` / `WorldSession`、`CameraDirectorV1`、`camera-rig-profile`、
  `camera-modifier-profile`、`camera-context-profile`、Capability Runtime 和
  Subject Preset Workspace；Babylon-only 收口候选已将 `@whitebox-world/camera`
  clean-break 为 provider-neutral Camera Domain。
- 上位规格：
  - [AI-first LEGO 游戏 SDK 总体设计](./2026-08-17-ai-first-lego-game-sdk-design.md)
  - [可扩展主体组装 Authoring](./2026-08-19-extensible-subject-authoring-design.md)
  - [Canonical Runtime State 与 Semantic Projection](./2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)
  - [人物、资产与 3C 接入契约](../../16-subject-assets-3c-integration.md)
  - [Character / Camera Capability Integration](./2026-08-20-character-camera-capability-integration-design.md)
- 实施入口：[SDK 重构进度与 Backlog](../../18-refactor-progress-and-backlog.md) 的 P2.2–P2.4。

本文补齐“人物/坐骑/装备/运动/动作与镜头怎样组合成可复用体验”的端到端合同。
它不替换上位规格，也不声明飞行、骑乘、装备或第一人称已经生产可用。本文已经完成
人工设计评审。Canonical Camera 包边界、Profile/Context/Preference/Decision/Explain
领域合同和纯选择函数已经实现；committed Gameplay Context Projection、Registry Lock、
Browser Preference 协议和 Babylon `CameraDirectorV1` 接线仍按 §15 与权威 Backlog 推进。

## 2. 决策摘要

采用“AI 选择大积木，Runtime 根据已提交状态自动组合”的方案：

```text
AI / Product
  └── 选择 Subject Definition 或已验证 Kit
      ├── 创建主体、装备或坐骑 Entity
      ├── 声明初始 Relationship / 高层 Action
      └── 可选选择 Camera View Preference

Compiler
  └── 展开 Kit，锁定 Capability / Profile / Action / Socket / Relationship

Fixed-tick Runtime
  └── 提交 Possession / Relationship / Capability / Action / Medium 状态

Camera Context Projector
  └── 从已提交真相投影只读 Camera Context Sample

CameraDirector
  └── 解析 Camera Rig + Modifier + Target + Transition
      └── Babylon Adapter 只执行最终 View
```

核心决定：

1. “第三人称御剑飞行”和“第一人称滑翔”是经过验证的 **Kit + 已锁 Profile +
   Runtime 状态组合**，不是新的硬编码 Subject Class 或场景脚本。
2. Kit 只是 AI-facing Authoring Sugar。它在编译期展开，不拥有 Runtime 真相。
3. `mountedOn`、`equippedAt`、`possessedBy`、Movement Medium、Motion、Action Phase
   各自仍由既有 Owner 提交；Camera 只能消费这些状态。
4. `CameraDirectorV1` 是每个 View Session 的唯一镜头 Owner。Subject、Action、Animation、
   Babylon Camera 和场景代码都不能直接切换镜头。
5. 普通 Agent 选择 Kit、Subject Definition、Relationship、Semantic Action 和可选 View
   Preference，不填写相机数字袋，也不提交任意 Camera Context Tag。
6. Production 只执行 Registry Lock 中的 Camera Profile Ref。实时调参仍属于隔离的
   Authoring Preview，必须先 Promote 成新 Registry 版本才可影响 Gameplay。
7. Camera Context 的选择必须确定、可解释、可回放；相同 ExecutionPlan、World State、
   Camera View Preference 和 Tick 输入得到相同的 Active Profile/Modifier/Target。

## 3. 当前基线与缺口

### 3.1 已经存在的能力

当前代码已具备以下积木：

- `camera-rig-profile`：锁定算法、Mode、Heading、Recenter、Socket 和带单位参数；
- `camera-modifier-profile`：在基础 Rig 上叠加瞄准、骑乘、倒车、冲刺等有限修饰；
- `camera-context-profile`：按关系角色、Motion Kernel/Tag、Medium、速度、Socket 和
  Camera Context Tag 匹配规则；
- `CameraDirectorV1`：按固定优先级选择 Rig/Modifier，拥有 Orbit、碰撞缩距、过渡和
  Camera View Preference；
- `cameraPreference: "auto" | "first-person" | CameraRigProfileRef` 的 Runtime 入口；
- `first-person.standard`、`flight.glide`、`follow.mounted` 等 Registry 资源，其中
  Glide/Mounted 仍为实验能力；
- Subject Definition 到 `cameraContextProfileRef` 的锁定与编译。
- 独立 `@whitebox-world/camera` 包中的命名 Profile、Context Sample、View Preference、
  Admission、确定性 `selectCameraViewV1`、Decision、Explain 与 Diagnostic。

这些能力说明底层方向已经成立，但不能据此宣称完整组合已经交付。

### 3.2 仍缺少的合同

- Relationship Runtime 尚未把 `mountedOn`、`equippedAt`、`possessedBy` 的提交结果稳定
  投影到 Camera Context；当前 `relationshipRole` 仍固定为 `none`。
- 单值 `relationshipRole` 无法表达一个 Entity 同时被控制、骑乘/被骑乘、装备物品和受约束；
  后续必须从类型化 Relationship State 投影多关系上下文，不能继续扩充单值枚举。
- 通用 Semantic Action / Equipment State 尚未成为 Camera Context 的权威输入。
- `cameraContextTags` 仍主要由当前输入动作临时生成，缺少 Registry 声明、来源审计和
  Canonical Projection 合同。
- 尚未冻结多个匹配规则同时命中时的冲突拒绝、Modifier 字段覆盖顺序、Target 切换和
  Transition Receipt。
- 尚无“第三人称御剑飞行”“第一人称滑翔”端到端 Fixture。
- 当前 Snapshot 仍把 Gameplay 与 View inspection 临时放在一起；长期应按 Canonical
  Runtime State 规格拆成 World State、View State 和 Transition Log。

### 3.3 与当前 `main` Gameplay Framework 的关系

PR #19 只保留为历史设计来源。其正式 successor 的 G19-1～G19-6 已经合入当前 `main`，
本文不得继续把 G19-5/G19-6 写成未来上游、反向阻塞已完成任务，或重新引入旧 PR 的
Runtime/Camera 方言。当前主干是本文的直接实现底座：

| 当前 `main` 已提供 | 本文怎样复用 | 本文不能重复实现 |
| --- | --- | --- |
| RuntimeHost、RuntimeSession、WorldSession 和唯一 fixed-tick publication barrier | Camera Context 只消费同一已提交 epoch | 第二个 Session/时钟/发布 barrier |
| Gameplay Command、Receipt、Event、Snapshot 与 retained artifact | Mount/Equipment/Action 的 Camera 变化引用相同 Receipt/Event 因果链 | Camera 私有 Gameplay journal |
| `GameplayWorldPortV1` 与 staged `projectedViewStateAfter` | Possession 与 Camera Target 在同一事务准备并原子发布；后续关系复用同一端口 | Camera 提前读取 prepare 态或事后补写 |
| `possessedBy` 唯一控制权真相 | 决定 Camera 的受控 Entity 与 Rebind | Camera/Controller 保存竞争 target |
| Semantic Action State/Definition | 投影 Action Camera Tag 和 Modifier 条件 | 从 Animation Clip 重算 Action |
| Browser Protocol V5、Runtime Snapshot V4 与 Runtime Activity | 在唯一 V5 facade 上 clean break `cameraViewPreference` | 第二套 Browser API、旧命令 alias 或 Camera 私有 Activity |
| Camera/View 独立 Owner 与锁定 Profile 边界 | 继续由 CameraDirector 决定最终 View | Gameplay State 保存 Camera 数值 |

当前 `GameplayRelationshipStateV1` 仍是关闭 Union，首批只包含
`possessedBy`。因此 `mountedOn` 与 `equippedAt` 必须在后续 P2.2/P2.3 中通过显式版本演进、
Parser/Canonicalizer/Hash/Receipt/Event/Gate 一起增加；不得塞进自由 Relationship 袋，也不得
让 Camera Context 先用临时 Tag 模拟已提交关系。

G19-6 已经发布 Browser V5 的当前 Camera Preview/Profile 过渡面，因此 GCC-0A 不再修改
历史 G19 计划，而是对拍当前源码、Browser exact-key contract、Snapshot V4 和本文 §6.4，
列出一次 clean break 的删除/新增集合。现有 `requestCameraProfile`、`resetCameraProfile`
继续只被视为未发布的过渡协议；不得把它们与 `cameraViewPreference` 永久并存。

更新后的实施顺序为：

```text
当前 main：R1b + G19-1..6 + Browser V5 + Possession/Camera Target 已完成
  → GCC-0/GCC-0B/GCC-0C 已冻结并实现 Canonical Camera 包边界与依赖方向
  → GCC-0A 对拍当前 V5/View 合同，不回写历史 G19 任务
  → GCC-1/GCC-2/GCC-3 冻结 Context、Profile 与唯一 View Preference 公共合同
  → GCC-4 让 CameraDirector 消费纯确定性 Selection Decision
  → G19-7 只完成 Outdoor/catalog lifecycle，不发布第二套 Camera 方言
  → 本文扩展 mountedOn/equippedAt/flight 与两个组合 Fixture
```

`possessedBy → Camera Target` 的最小链路已经由 G19-5 交付；Rig/Modifier/Preference
选择仍属于本文 GCC-2/GCC-3/GCC-4。完整御剑/滑翔体验继续依赖 P2.2/P2.3 的正式
Relationship/Flight Runtime。Camera 工作与 G19-7 不能各自维护一份
`GameplayViewStateProjection`、Camera transaction、选择命令或 Browser 方言。

## 4. 方案选择

### 4.1 采用：Kit 展开 + 状态投影 + Camera Context Resolver

Kit 组合经过验证的资源与初始关系，Runtime 再根据实际已提交状态选择镜头。这允许相同
人物在步行、御剑、乘龙、滑翔、持剑攻击之间复用身份、资产和控制协议，也允许换掉 Babylon
实现而不改变 AI Schema。

### 4.2 不采用：为每种体验建立硬编码 Subject Class

`SwordFlyingHuman`、`GlidingFirstPersonCharacter` 或 `MountedDragonPlayer` 会把人物、装备、
运动、动作与 Camera 重新耦合。组合数量会随人物 × 坐骑 × 装备 × 动作 × 视角指数增长，
并迫使 Agent 猜测 Class 名称。

### 4.3 不采用：让场景 JSON 直接写相机参数

普通场景不能复制距离、FOV、Damping、碰撞半径或过渡秒数。这会绕过 Registry Gate，
导致同名体验在不同世界中表现不一致。数字只存在于版本化 Camera Profile 或隔离的
Authoring Draft；Draft 必须 Promote 后才能进入 Registry Lock。

### 4.4 不采用：把 Camera Context Tag 当作自由实例状态

Scene Agent 不能直接写 `cameraContextTags: ["flying"]`。Tag 必须来自锁定资源或已提交
Gameplay 状态的确定性投影，否则 Tag 会成为 Relationship、Action 和 Medium 之外的第二份
真相。

## 5. 权威与所有权

| 概念 | 唯一权威 Owner | Camera 可消费的投影 | 禁止旁路 |
| --- | --- | --- | --- |
| 主体身份与静态能力 | Subject Definition + Execution Resource Lock | 可用 Profile、Socket、Capability | 从 Mesh/名字猜能力 |
| 控制权 | `possessedBy` Relationship | 当前受控 Entity | Browser 参数直接指定任意目标 |
| 骑乘/站乘 | `mountedOn` Relationship Transaction | 类型化 Rider/Mount 端点、Target Policy | Scene Graph Parent 或 Socket 反推关系 |
| 装备 | `equippedAt` Relationship Transaction | 类型化 Item/Wearer 端点；Equipment 相关 Motion/Action 必须已提交 | Bone Attachment 或自由 Tag 反推已装备 |
| Movement Medium | Medium State Resolver | `ground/air`；未来版本才可增加已冻结 Medium | Water Mesh 高度或材质猜测 |
| Motion | Motion Runtime | Kernel Ref、Motion Tags、速度 | Animation Clip 猜运动模式 |
| Semantic Action | Action Runtime | Action Ref、Phase、锁定 Action Tags | 动画播放状态决定 Action |
| Camera View Preference | 当前 Runtime/World Session 的 Camera Entity | `CameraViewPreferenceV1` | 写回 Subject/World State |
| Camera Context Sample | Camera Context Projector | 只读、固定 Tick、带来源的 Sample | Adapter 再推导一份 Context |
| Camera Rig/Modifier/Target | `CameraDirectorV1` | View State、Capture | Subject/Action/场景脚本直接修改 Babylon Camera |
| Camera Pose | CameraDirector + Render-time interpolation | Renderer、Capture | Camera Pose 推动 Physics 或改 Gameplay Transform |

Camera 是 View State，不是 World State。不同 Session 可以观察同一世界的不同主体和镜头，
但不能因此产生不同的 Gameplay 结果。

### 5.1 Canonical package boundary

Camera Profile、Context、Preference、Admission、Selection 和 Explain 已经形成独立、
provider-neutral 的领域语义，首个实施切片必须将它们收敛到唯一 Canonical 包
`@whitebox-world/camera`。它已经通过未发布阶段 clean break 成为唯一 Camera Domain，
不保留旧 Provider API 或同义字段。

| 包 / 路径 | 唯一职责 | 稳定输入 | 稳定输出 | 明确禁止 |
| --- | --- | --- | --- | --- |
| `packages/camera` | Camera 参数、Rig/Modifier/Context Profile、View Preference、Context Sample、Admission、纯 Selection 与 Explain | provider-neutral Profile 集合、Context Sample、Preference | `CameraSelectionDecisionV1`、结构化 Explain/Diagnostic | 依赖任何 renderer/physics provider、Registry、Runtime Session、Gameplay 或 Browser DOM |
| `packages/subject-registry` | Camera 资源 Envelope、版本、Hash、Catalog、AI Metadata、Discovery 与解析 | `@whitebox-world/camera` 的资源内容合同 | 精确 Ref/Version/Hash 的已解析资源 | 重新定义 Camera 参数、选择规则或会话状态 |
| `packages/authoring` / `packages/compiler` | Schema、Resource Lock、Context 闭包与 ExecutionPlan 投影 | 已解析 Registry 资源和 Authoring 意图 | 锁定的 IR / ExecutionPlan Camera 描述 | 在编译期执行 Runtime Selection 或读取 Session 状态 |
| `packages/gameplay-contracts` / `packages/gameplay` | `possessedBy`、`mountedOn`、`equippedAt`、Action、Motion、Medium 等世界真相 | Gameplay Command 与 fixed-tick state | committed Gameplay State/Event/Receipt | 保存 Camera 数值、最终 Rig 或 Babylon Target |
| `packages/runtime-contracts` | ExecutionPlan、Camera Command/Event/View State、Browser/CLI DTO | Camera Domain 值对象与 Runtime publication | provider-neutral 公共协议 | 实现 Camera Selection 或复制 Profile 定义 |
| `packages/runtime-host` | 从同一 committed epoch 投影 Camera Context，拥有 View publication 与生命周期协调 | committed Gameplay State、locked resources、View Preference | `CameraContextSampleV1`、staged/published View revision | 再推导 Gameplay 真相或计算 Babylon Pose |
| `packages/runtime-babylon` | `CameraDirectorV1`、Babylon Camera、Pose、碰撞、平滑、Blend 与资源释放 | `CameraSelectionDecisionV1`、target/socket sample、render delta | 最终 View、Capture Matrix、Runtime inspection | 定义公共 Schema、查询 Registry 或修改 Gameplay State |
| `apps/playground` / `scripts` / `packages/control-capture` | Authoring Preview、Browser/CLI/Take 转接与证据 | 公共协议和 Registry AI Metadata | UI、命令、Capture/Validation Evidence | 保存第二份 Profile 语义字典或直接操作 Camera Owner |

下图箭头表示“左侧包依赖右侧包”；目标依赖方向为：

```text
compiler ──→ authoring ──→ subject-registry ──→ camera ──→ protocol
runtime-host ──→ runtime-contracts ──→ camera ──→ protocol
runtime-babylon ──→ runtime-contracts
runtime-babylon ──→ camera
apps / scripts / control-capture ──→ runtime-contracts
```

`camera` 不得反向依赖表中的任何消费者，尤其禁止形成
`camera ↔ subject-registry`、`camera ↔ runtime-contracts` 或
`camera ↔ gameplay-contracts` 循环。Browser Command/Event Envelope 留在
`runtime-contracts`；Camera Domain 只拥有可以脱离 Session 独立校验和测试的值对象与纯函数。

### 5.2 Retired-provider clean-break status

GCC-0C 已按 P3.2 收口候选原子完成：`packages/camera` 只暴露 provider-neutral Domain；
旧 Camera Rig、旧 Runtime cluster 和旧 Playground Adapter 已删除，Plan-first scene、Opening
Composition、SDK-derived tri-view 与 scene gates 由 Babylon artifact renderer 承接。
`packages/world`、`packages/contracts`、`packages/testkit` 继续承担 Planner/Compiler/Scene
合同，不属于 Runtime Provider，也不得因引擎收口被删除。

该 clean break 只完成包边界和领域纯函数，不表示 GCC-1～GCC-8 已交付。后续实现必须从
`@whitebox-world/camera` 的稳定 Decision 输入接到 `CameraDirectorV1`，不得恢复旧 API、
建立 Provider alias，或让 Adapter 自行发明第二套 Profile/Context/Preference 语义。

## 6. AI-facing 组合模型

### 6.1 普通模式

普通 Agent 只负责表达用户意图：

- 选择主体或体验 Kit；
- 创建必要的主体、装备、坐骑或载具 Entity；
- 声明初始 Relationship，或在 Runtime 发起 Semantic Action；
- 为 Opening Shot / Take 选择 `auto`、第一人称或已允许 Camera Profile；
- 查询 Kit 展开结果和能力缺口。

普通 Agent 不负责：

- 选择 Babylon Camera Class；
- 计算 Camera Pose；
- 编写 FOV/Damping/Collision 数值；
- 直接提交 Context Tag；
- 根据帧率或动画 Clip 切换视角；
- 为每个场景写“进入飞行后换相机”的脚本。

### 6.2 Kit 的职责

沿用 ADR-0001 的 `SubjectKit / PlayablePreset` 方向。Kit 可以引用：

- Subject Definition 和可选资产 Variant；
- Control、Control Feel、Locomotion、Motion、Physics Body Profile；
- Camera Context Profile；
- Action/Animation Variant Set；
- 允许的 Equipment Slot、Rig Socket、Mount Slot；
- 可以由该 Kit 初始化的类型化 Relationship Recipe；
- Harness/Validation Profile。

Kit 不保存运行中的 `activeAction`、`mountedOn`、`movementMedium`、Camera Pose 或输入状态。
Normalizer 必须把 Kit 展开为现有 Canonical 资源和关系；Compiler/Runtime 不读取 Kit 名称
来决定行为。

### 6.3 高级模式

高级 Agent 可以组合 Registry 已注册的 Capability/Profile/Relationship，但仍使用同一套
公共字段。不存在第二套 `customCamera`, `customFlight` 或 provider payload。任何新算法先以
Registry Resource + Harness 进入 SDK，再被 Kit 引用。

### 6.4 唯一 Camera View Preference 协议

长期公共协议只保留一个概念名 `cameraViewPreference`，并使用关闭判别 Union：

```ts
type CameraViewPreferenceV1 =
  | { mode: "auto" }
  | { mode: "first-person" }
  | {
      mode: "camera-rig-profile";
      cameraRigProfileRef: string;
    };

interface SetCameraViewPreferenceCommandV1 {
  type: "view.camera-preference.set";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
  cameraViewPreference: CameraViewPreferenceV1;
}

interface ResetCameraViewPreferenceCommandV1 {
  type: "view.camera-preference.reset";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
}
```

语义：

- `auto` 每个 committed tick 根据当前 Context 重解析最合适的 Rig；
- `first-person` 是跨 Context 保持的 View Mode 意图，每个 Context 解析自己的
  `firstPersonCameraRigProfileRef`；
- `camera-rig-profile` 是显式的锁定 Profile 意图，但只在当前 Context 允许时生效；
- Preference 是 View State，不进入 World State，不改变 Possession、Motion 或 Action。

当前 `cameraPreference: "auto" | "first-person" | string`、历史 G19 草案中的
`requestCameraProfile/resetCameraProfile`，以及长期总规格中的 `view.set-mode/view.set-rig`
不得同时成为公开协议。项目尚未发布，实施时执行一次 clean break：Schema、CLI、Browser、
generated types、examples、Snapshot/Event 和测试同步切换到上述命名，不保留 alias。内部
Authoring Workbench 可以迁移自己的草稿格式，但不能把旧方言继续暴露给 Runtime。

`runtimeSessionId` 与 `worldSessionId` 沿用当前 RuntimeHost/Canonical Runtime State；不新增
`viewSessionId`。多 View 使用 `cameraEntityId` 区分，而不是创建第三种 Session 身份。

## 7. Camera Context 投影

### 7.1 投影输入

Camera Context Projector 每个已提交 fixed tick 读取：

- 从当前 committed `possessedBy` 投影解析的 `controlledEntityId`，以及当前 Camera Entity 的
  `cameraViewPreference`；Runtime/World Session 本身不保存竞争的受控目标；
- `possessedBy`、`mountedOn`、`equippedAt` 等已提交 Relationship；
- Motion Kernel Ref、Motion Tags、速度和 Movement Medium；
- 当前 Action Ref/Phase 及其 Registry 声明的 Camera Tags；
- 当前主体、坐骑和装备的已锁 Socket；
- Relationship Profile 的 Camera Target Policy。

它不读取 Babylon Node、Animation Clip 名、Render Parent、Mesh Metadata、Havok Handle 或
未提交的事务准备态。

长期 Context 输入使用 provider-neutral、关闭结构；不扩充当前单值
`ViewTargetSampleV1.relationshipRole`：

```ts
type CameraRelationshipContextV1 =
  | {
      id: string;
      type: "possessedBy";
      controlledEntityId: string;
      controllerEntityId: string;
    }
  | {
      id: string;
      type: "mountedOn";
      riderEntityId: string;
      mountEntityId: string;
      mountSlotId: string;
    }
  | {
      id: string;
      type: "equippedAt";
      itemEntityId: string;
      wearerEntityId: string;
      equipmentSlotId: string;
    };

interface CameraContextSampleV1 {
  simulationTick: number;
  controlledEntityId: string;
  targetEntityId: string;
  movementMedium: "ground" | "air";
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  motionTags: readonly string[];
  activeActionRefs: readonly string[];
  relationshipContexts: readonly CameraRelationshipContextV1[];
  velocityMetersPerSecondXYZ: readonly [number, number, number];
  socketPositionsMetersXYZById: Readonly<
    Record<string, readonly [number, number, number]>
  >;
  cameraContextTags: readonly string[];
}

type CameraRelationshipConditionV1 =
  | { type: "possessedBy"; entityRole: "controlled" | "controller" }
  // `rider` names the resolved subject role. The controlled/target Entity may be
  // either endpoint of the one relevant mountedOn Relationship.
  | { type: "mountedOn"; entityRole: "rider" }
  | { type: "equippedAt"; entityRole: "item" | "wearer" };

interface CameraContextRuleV2 {
  id: string;
  priority: number;
  when: {
    allRelationshipConditions?: readonly CameraRelationshipConditionV1[];
    motionProfileRefs?: readonly string[];
    motionKernelRefs?: readonly string[];
    movementMediums?: readonly ("ground" | "air")[];
    requiredActiveActionRefs?: readonly string[];
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
    requiredCameraContextTags?: readonly string[];
  };
  cameraRigProfileRef?: string;
  cameraModifierRefs?: readonly string[];
}
```

`relationshipContexts` 必须由当前 WorldSession 同一 committed epoch 的正式 Relationship State
投影，并按 `type`、Relationship ID 的 Canonical code-unit 顺序稳定生成。每条上下文携带
已提交 Relationship 的 `id`，供 Explain/Event 关联。Camera Rule 的
`allRelationshipConditions` 逐条匹配 committed `controlledEntityId` 与 `targetEntityId`。对
`possessedBy` 和 `equippedAt`，匹配它们在角色化端点中的位置；对 `mountedOn` Rider 条件，必须
恰好存在一条以 controlled/target 为 Rider 或 Mount 端点的相关 Relationship，从而解析出唯一
Rider。共享 Mount 上存在多条相关 Relationship 时必须 fail closed，且不得为此改写
`controlledEntityId` 或 `targetEntityId`。任何条件都不能使用通用
`sourceEntityId/targetEntityId/params`。

首个版本仍只发布 `ground/air`；Water 等 Medium 必须在 P2.5 自己的 Canonical Medium 合同
完成后按版本演进，不能为了 Camera 示例提前加入。

`CameraContextRuleV2` 是对当前未发布 `CameraContextRuleV1.relationshipRoles` 的 clean break，
不是并存方言。实施时同步删除单值 Sample 和旧 Rule 字段，更新 Registry Catalog、Normalizer、
ExecutionPlan、CameraDirector、Discovery 和 Fixture；不保留 V1 alias。

`motionProfileRefs`、`motionKernelRefs` 和 `movementMediums` 分别是对单个活动值的允许集合；
三者之间为 AND。`allRelationshipConditions`、`requiredActiveActionRefs`、
`requiredSocketIds` 和 `requiredCameraContextTags` 要求集合内全部命中。空数组在 Admission
拒绝，避免“空 all 条件恒真”的隐含规则。

### 7.2 Camera Context Tag 来源

`cameraContextTags` 是投影结果，不是自由输入。允许来源仅包括：

1. 已由 Input/Action Owner 在当前 fixed tick 提交的锁定语义，例如 `aim`、`sprint`；原始
   设备输入、render-frame latch 或未提交 command 不得直接成为 Context 输入；
2. Action Definition 声明的 Camera Tag；
3. Equipment/Relationship/Capability Profile 声明的 Camera Tag；
4. CameraDirector 自己拥有的纯 View 状态，例如显式 Look Back。

所有可发布 Tag 必须进入 Registry 字典和 Resource Lock。Projector 同时保留内部 provenance，
至少能解释每个 Tag 来自哪个 Entity、Relationship、Action 或 Profile。Canonical Snapshot
只发布稳定语义，不暴露 Provider 来源。

不得用 Tag 重复已经有强类型字段的事实。例如 `movementMedium = "air"` 不能再依赖
`cameraContextTags = ["air"]` 才生效；规则应优先使用强类型 Medium 条件。

Relationship 条件同样优先使用类型化投影。Context Sample 必须能同时携带当前 Entity 参与的
多条 Relationship 及其角色化端点；Camera Context Rule 以 `mountedOn` 的唯一 Rider 关联、
`equippedAt` 的 Item/Wearer、`possessedBy` 的 Controlled/Controller 等关闭条件匹配。现有
单值 `ViewTargetSampleV1.relationshipRole` 是待删除的过渡 seam，不能进入当前合同；实施时
同步演进 Registry Rule、ExecutionPlan、Runtime DTO 和测试并删除它，不保留同义 alias。

“优先”不表示可以旁路：只要某个选择条件已有强类型字段或 Ref，Tag 就不得作为该事实的
充分条件。Ground/Air 使用 `movementMedium`，Motion 使用已提交 Motion Profile/Kernel Ref，
Mount/Equipment/Possession 使用 `allRelationshipConditions`，Action 使用已提交 Action Ref。
Tag 只补充 `aim`、`sprint`、`reverse` 等没有独立强类型状态的有限 Presentation 语义。

Camera 不重复执行 Gameplay 准入。例如 Glide Action/Capability 如果要求已装备滑翔翼，
Equipment/Action Runtime 必须在进入 Glide Motion 前验证 `equippedAt`；Camera 只消费已经提交的
Glide Motion Ref。测试必须先证明“没有 Equipment Relationship 就不能提交该 Glide Motion”，
再证明 Camera 不会从伪造 Tag 进入 Glide Rig，而不是让 Camera 再实现一遍装备规则。

### 7.3 Target 解析

Target 按以下顺序解析：

1. `possessedBy` 决定受控 Entity；
2. 已提交 Relationship Profile 可以把 Camera Target 映射为受控 Entity，或映射为该
   Relationship 类型声明的角色化端点，例如 `mountedOn` 的 Rider 或 Mount；
3. Camera Rig 从目标主体的已锁 Socket 列表选择首个兼容 Socket；
4. Admission 时缺少必需 Socket 则稳定失败；已提交 Rebind 后目标缺少 Socket 时进入当前
   Context 的 Safe View 或显式 unbound View，不能继续跟随旧 Entity；
5. Render Attachment 或临时 Scene Parent 不参与 Target 选择。

Mount/Unmount、Possession Rebind 和 Entity Dispose 必须在同一个 fixed-tick phase barrier
后向 CameraDirector 发布新 Target。CameraDirector 不能提前观察事务准备态。

## 8. 确定性选择算法

### 8.1 Admission

Registry Admission / Compiler 必须验证：

- Context、Rig、Modifier、Algorithm 和 Socket Ref 全部存在于 Resource Lock；
- 每条 Rule 的 `id` 在 Context Profile 内唯一；
- `priority` 是有限整数并位于 Profile Schema 允许范围，且在同一 Context Profile 内唯一；
- Rule 至少产生一个 Rig 或 Modifier；
- 同一 Rule 引用的多个 Modifier 不能对同一字段给出不同值；
- 第一人称 Profile 必须使用实现状态为 `implemented` 的兼容 Algorithm；
- Glide/Mount/Equipment 条件引用的 Relationship Condition、Motion/Action Ref、有限
  Presentation Tag 和 Socket 全部已锁定。

唯一 Priority 使所有重叠条件都有明确优先级，不需要实现不可审计的静态条件重叠求解器；
不能把歧义留给 Registry 插入顺序或“最近激活”解决。

### 8.2 每 Tick 选择

1. 从同一 committed tick 构造不可变 Camera Context Sample；
2. 按 `priority` 降序、`id` code-unit 升序计算匹配规则；
3. `cameraViewPreference.mode = "auto"` 时，选择第一条提供 `cameraRigProfileRef` 的匹配规则；没有
   命中则使用 `defaultCameraRigProfileRef`；
4. `cameraViewPreference.mode = "first-person"` 时：当前 Context 存在
   `firstPersonCameraRigProfileRef` 则选择它并令 `fallbackActive = false`；若该 Preference 是
   先前 Context 已接受、但新 committed Context 不再提供第一人称 Rig，则选择当前 Context 的
   默认 Rig 并令 `fallbackActive = true`；
5. `cameraViewPreference.mode = "camera-rig-profile"` 时，选择其中的
   `cameraRigProfileRef`；Ref 仍属于当前 Context 允许集合时令 `fallbackActive = false`，否则
   选择当前 Context 默认 Rig 并令 `fallbackActive = true`；
6. 收集全部命中 Rule 的 Modifier，按低优先级到高优先级应用，使高优先级最终胜出；
7. 同一 Modifier Ref 只应用一次；Snapshot 按实际应用顺序发布 Ref；
8. Profile、Modifier 或 Target 变化时启动声明式 Transition；Gameplay 状态已经提交，
   Camera Blend 不能延迟或回滚 Gameplay。

`id` 只用于确定非冲突 Rule 的稳定顺序，不能掩盖语义冲突。

Preference 失败分为两类，不能混为一次“拒绝”：

- **命令期失败**：收到 `view.camera-preference.set` 时，如果第一人称 Rig 缺失，或显式
  Profile 不属于当前 Context，命令稳定拒绝，Preference 与 Active Rig 都保持不变。
- **Context 变化后的不兼容**：只有步骤 4/5 无法满足已存 Preference 时才进入此分支。
  Mount/Equipment/Action/Medium 已经提交，Camera 无权拒绝或
  回滚 Gameplay。Director 保留原 Preference 意图，但立即选择新 Context 的
  `defaultCameraRigProfileRef` 作为显式 Safe View，设置 `fallbackActive: true`，发布结构化
  Diagnostic 与 Selection Event；原 Preference 再次兼容时自动恢复。禁止继续使用已经不兼容的
  旧 Rig，也禁止无 Diagnostic 地把第一人称变成第三人称。

当前 `CameraDirectorV1` 在第一人称 Profile 缺失时回落默认 Rig、在显式 Ref 不属于当前
Context 时落入 Auto 的行为，是实施时必须删除的旧语义；不能被当前 Gameplay Adapter 复制到新 View
合同中。

### 8.3 更新时间

- Gameplay Context 只在 fixed tick commit 后更新。
- Camera Pose 的视觉平滑可以使用真实 render delta，但暂停时 delta 必须为零，镜头冻结。
- 禁止在 `renderFrame()` 中伪造 `1/60s` 推进 CameraDirector。
- 30/60/120 Hz-like 渲染节奏在相同 fixed-tick 输入下必须得到相同 Profile、Modifier、Target
  和最终稳定 Pose；过渡中的中间像素允许按真实显示时间不同，但 Capture Take 使用锁定时钟。

## 9. 两个代表性组合

### 9.1 第三人称御剑飞行

Authoring 意图：

```text
Kit: worldkit://kit/sword-flight.playable@1
Entities: rider + flying-sword
Relationship: mountedOn(rider, flying-sword, stand-slot)
Possession policy: transfer-to-target
Camera view preference: { mode: "auto" }
```

编译展开：

- Rider 与 Flying Sword 保持独立 Entity ID；
- Flying Sword 拥有 Flight Locomotion/Motion、Physics、Mount Slot 和 Camera Target Socket；
- Rider 使用 `ride/stand-flight` Action Variant；
- `mountedOn`、Collider Mode、Possession 和 Camera Target Policy 通过事务原子提交；
- Camera Context 从 `mountedOn(rider, flying-sword)`、转移后的 `possessedBy`、Medium `air`
  和 Flight Motion Tag 命中第三人称 Flight Rig，并叠加 Mounted Modifier；
- 解除关系后，Possession 原子返回 Rider，Runtime 恢复 Rider 的 Ground Motion、Action 与
  Camera Context。

AI 不需要写“如果飞行则切换 flight camera”。

### 9.2 第一人称滑翔

Authoring/Take 意图：

```text
Kit: worldkit://kit/humanoid.glide-playable@1
Entities: pilot + glider
Relationship: equippedAt(glider, pilot, back.glider)
Action: worldkit://action/glide.enter@1
Camera view preference: { mode: "first-person" }
```

编译展开：

- Pilot/Glider Definition 与 Equipment Profile 共同锁定可激活的 Glide Motion 和兼容
  Camera Context Profile；只有 `equippedAt` 已提交且 `glide.enter` 通过准入后才进入 Glide；
- Context 的 `firstPersonCameraRigProfileRef` 指向经过 Glide Harness 验收的第一人称 Rig；
- `cameraViewPreference.mode = "first-person"` 只选择该已锁 Profile，不创建数字 overlay；
- Aim/Sprint/Glide Modifier 仍从已提交 Action/Motion 状态确定性叠加；
- 第一人称视点使用声明的 Eye/Camera Socket，缺失时只允许 Profile 中声明的 fallback；
- 主体头部隐藏、第一人称手臂或装备 View Model 只是当前 View 的 Render Binding，不复制
  Equipment Entity、伤害、碰撞或库存真相；
- 退出 Glide 后，如果 Camera View Preference 仍是第一人称，则切换到 Ground Context 的兼容
  第一人称 Rig；没有兼容 Rig 时进入 Ground Context 的显式 fallback，保留第一人称 Preference
  以便未来恢复，并发布 Diagnostic/Event，不修改 Gameplay。

## 10. 状态、Receipt 与可解释性

长期公共投影沿用 Canonical Runtime State 规格：

- World State：Entity、Capability、Relationship、Action 和 Semantic Fact；
- View State：Camera Entity、Runtime/World Session Ref、Target、Active Rig/Modifier、
  `cameraViewPreference`、Transition；
- Transition Log：Relationship/Action/Control Command Receipt 与 Camera Selection Event；
- Runtime Status：Adapter 健康和 Diagnostic，不进入 World Model Ground Truth。

Camera 选择事件至少记录：

```ts
interface CameraSelectionChangedEventV1 {
  type: "camera.selection.changed";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
  sequence: number;
  simulationTick: number;
  previousCameraRigProfileRef: string;
  activeCameraRigProfileRef: string;
  activeCameraModifierRefs: readonly string[];
  targetEntityId: string;
  matchedCameraContextRuleIds: readonly string[];
  fallbackActive: boolean;
  reason:
    | "context-changed"
    | "preference-changed"
    | "target-rebound"
    | "context-fallback-entered"
    | "context-fallback-recovered"
    | "preference-reset";
}

interface CameraTargetUnboundEventV1 {
  type: "camera.target.unbound";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
  sequence: number;
  simulationTick: number;
  previousTargetEntityId: string;
  reason: "control-released" | "target-disposed" | "world-replaced";
}
```

该 Event 是 View Transition 证据，不是 Gameplay Command Receipt。它不能反向声明
`mountedOn`、`equippedAt` 或 Action 已成功；这些事实必须引用各自的 Receipt/Event。

Event 使用当前 WorldSession 的统一 Event Sequence；`id` 由 `worldSessionId + sequence` 按
Canonical Runtime State 的身份公式派生，不建立 Camera 私有 journal。初始 World bootstrap
直接发布首份 View State，不伪造一个没有 `previousCameraRigProfileRef` 的 changed Event。

`explain camera` 或等价 Browser/CLI 查询应返回：当前 `cameraViewPreference`、候选 Rule、匹配/未匹配
原因、选中的 Rig、Modifier 应用顺序、Target 解析链和 fallback 状态。不得暴露 Babylon Node、
Ray、Mesh 或 Provider Handle。

## 11. 失败、回退、Reset 与 Rebind

| 场景 | 预期行为 | 稳定 Diagnostic |
| --- | --- | --- |
| Profile/Modifier 未进入 Lock | Admission 失败 | `CAMERA_RESOURCE_NOT_LOCKED` |
| 同优先级 Rule 产生冲突 | Admission 失败 | `CAMERA_CONTEXT_RULE_AMBIGUOUS` |
| 显式 Preference 不在允许集合 | 命令拒绝，保留上一 View | `CAMERA_PREFERENCE_NOT_ALLOWED` |
| 第一人称 Rig 缺失 | 命令拒绝，不静默改第三人称 | `CAMERA_FIRST_PERSON_UNAVAILABLE` |
| 必需 Socket 缺失 | Admission 失败；已提交 Rebind 后进入 Safe/Unbound View | `CAMERA_REQUIRED_SOCKET_MISSING` |
| Relationship 事务失败 | World/Camera 均保持上一稳定状态 | 使用 Relationship 原 Diagnostic |
| 已提交 Context 使 Preference 不兼容 | 使用当前 Context 的锁定默认 Rig，显式进入 fallback；Gameplay 不回滚 | `CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE` |
| Target Entity 被销毁或 control release | 进入显式 unbound View，冻结最后安全 Pose；不偷偷改跟随对象 | `CAMERA_TARGET_UNAVAILABLE` |
| Adapter 更新异常 | Simulation 按 Runtime Policy 暂停或继续，保留最后安全 View | `CAMERA_RUNTIME_UPDATE_FAILED` |

`view.camera-preference.reset` 在当前 WorldSession 内把 Preference 恢复为锁定默认，并清理
Orbit Offset、Transition、Modifier、Target Cache、Input Latch 和 Preview State；它不创建新
WorldSession。`world.reset` 沿用当前 G19-6 生命周期：销毁旧 CameraDirector/WorldSession，创建新的
`worldSessionId`，再由 bootstrap 显式绑定并发布首份 View State，不执行同一实例的 in-place
Camera Reset。Possession Rebind 只允许新受控 Entity 影响镜头；旧主体后续 Action、Motion 或
Camera Tag 不能再改变当前 View。

## 12. Registry、版本与兼容

- Rig、Modifier、Context、Kit、Action Variant 和 Relationship Profile 分别版本化并进入 Lock。
- 修改数值产生新 Profile Version；普通 Runtime 不接受会话数字袋。
- 修改 Rule 语义或选择优先级产生新的 Camera Context Profile Version。
- 新增 Context 条件字段必须升级对应 Schema/ExecutionPlan 版本，不能让 Adapter 私下解释。
- 项目尚未发布的私有协议可以按明确 clean break 同步修改 Schema、Compiler、Fixture 和类型；
  已发布协议通过显式 Migration 兼容，禁止永久 alias。
- Provider 名、Babylon/Havok Handle、Mesh/Node 路径不得进入 Canonical Schema、CLI、Browser、
  Snapshot、Event 或 Report。

## 13. 业界对照与本项目取舍

本设计吸收成熟引擎已验证的职责边界，但不复制其引擎对象模型：

- [Unreal Gameplay Framework](https://dev.epicgames.com/documentation/unreal-engine/gameplay-framework-in-unreal-engine?lang=en-US)
  将 Pawn、Controller 和 Camera 作为协作但独立的职责；本项目对应 Subject、Controller/
  Possession 与 CameraDirector 分离。
- [Unreal PlayerCameraManager](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/APlayerCameraManager)
  负责最终 View，并可在多个影响源之间仲裁/混合；本项目由 CameraDirector 独占最终 View，
  Rig/Modifier 只提供锁定输入。
- [Unreal Gameplay Tags](https://dev.epicgames.com/documentation/unreal-engine/using-gameplay-tags-in-unreal-engine?lang=en-US)
  使用注册过的层级标签表达状态/能力/事件条件；本项目只允许 Registry 声明并带 provenance
  的 Camera Tag，不接受 Agent 自由字符串。
- [Unity Cinemachine Camera Control and Transitions](https://docs.unity.cn/Packages/com.unity.cinemachine%403.1/manual/concept-camera-control-transitions.html)
  使用单一 Brain、优先级和 Blend 仲裁活动虚拟相机；本项目同样使用单一 Director、确定性
  优先级和声明式 Transition，但拒绝用“最近激活”作为同优先级 tie-break，因为 Replay 需要
  与调用时序无关。
- [Unity Cinemachine Brain](https://docs.unity.cn/Packages/com.unity.cinemachine%403.1/manual/CinemachineBrain.html)
  把选择、Blend 和最终 Camera 输出集中在 Brain；本项目对应 CameraDirector，并进一步将
  World State 与 View State 分离。

## 14. 验收与生产门禁

### 14.1 Contract / Compiler

- `@whitebox-world/camera` 不依赖任何 renderer/physics provider、Registry、Gameplay、Runtime Session
  或 Browser DOM；所有生产消费者只沿单向依赖读取它；
- 旧 Provider Camera Rig 与跨包穿透已删除，catalog/artifact 回归由 Babylon 路径通过；
- Kit 展开结果不包含 Kit 魔法分支，所有资源都有 Ref/Version/Hash；
- 未锁 Profile、未知 Tag、重复 Rule ID、冲突优先级、缺失 Socket 稳定失败；
- Canonical Schema、AI Profile、CLI、Browser、Snapshot/Event 使用同一字段名；
- ExecutionPlan 不含 Provider 名或 Handle；
- Rule 顺序和 Hash 不依赖 JSON 插入顺序。

### 14.2 Runtime

- Ground → Takeoff → Flight → Landing 只在 fixed-tick commit 后切 Context；
- Mount/Unmount 同时提交 Relationship、Possession、Collider、Action 与 Camera Target，失败
  全部回滚；
- 空手/持剑、普通移动/攻击只改变声明的 Action/Modifier，不复制 Subject；
- 显式第一人称、自动第三人称、Reset、Rebind 和 Entity Dispose 均无旧目标残留；
- 暂停时镜头冻结；30/60/120 Hz-like 显示节奏的选择结果一致；
- 两个 RuntimeSession/WorldSession 或两个 Camera Entity 的 Preference、Orbit、Target 和
  Modifier 完全隔离。

### 14.3 Golden Fixture

首批必须包含：

1. **third-person-sword-flight**：地面待机 → 登剑 → 起飞 → 巡航 → 转向 → 降落 →
   解除；验证 Rider/Sword 身份、Relationship、Possession、Action、Collider、Camera Target、
   Rig/Modifier 和 Event。
2. **first-person-glide**：地面第三人称 → 切第一人称 → 起跳/进入 Glide → 滑翔 → 落地 →
   Reset；验证 Socket、墙体防穿、Profile 切换、暂停冻结和无 Gameplay 漂移。

每个 Fixture 分离四类证据：automated contract、Runtime numeric、rendered visual、manual
interaction。截图不能代替 Relationship/State Gate，单元测试也不能代替真实 Babylon/Havok
和浏览器交互。

## 15. 实施依赖图

本文同时记录已冻结设计和实施状态。GCC-0/GCC-0B/GCC-0C 已在 Babylon-only 收口候选中
完成；其余任务仍必须使用以下工作图。表中的输入、输出和集成点是 worker handoff 的
最小合同，不得在实施时改名或另建方言；实时状态以 `docs/18-refactor-progress-and-backlog.md`
为唯一入口。

| ID | 目标与独立交付物 | depends_on | blocks | 独占所有权与精确集成点 | 稳定输入 → 稳定输出 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GCC-0 | 冻结本文、术语、Schema 版本策略和首个 Fixture | 无 | GCC-0A/0B/1..8 | 主 Agent；本规格、ADR、Backlog | 当前产品边界与上位规格 → Frozen design baseline | 模式 A 全维度审查 | main-agent-only |
| GCC-0A | 将旧 G19 依赖改为 current-main reconciliation，冻结唯一 Browser V5/View clean break | GCC-0、当前 `main` G19-6 | GCC-1/3 | 主 Agent；`gameplay-framework-r1b` spec/plan、Browser exact-key contract、本文；不改 Runtime | 当前 V5 keys/DTO/owner map → 删除/新增集合与无别名合同 | spec/plan/source 三方对拍 | main-agent-only |
| GCC-0B | 冻结 Canonical Camera package API 与单向 dependency DAG | GCC-0 | GCC-0C/1/2/3/4 | 主 Agent；`packages/camera` exports、workspace package map、实施计划 | §5.1 ownership → package manifest、public symbol list、dependency rules | package graph negative checks | main-agent-only |
| GCC-0C | **已实现**：删除旧 Provider Rig/Runtime，并 clean-break 建立 provider-neutral `@whitebox-world/camera` | GCC-0B | GCC-1/2/3/4 | `packages/camera` 独占；Runtime Provider 不得反向进入 Domain | GCC-0B symbol list → Canonical Domain、纯 Selection/Explain、无旧 alias | package boundary、scene/artifact/build、dependency census | sequential |
| GCC-1 | Relationship/Action/Equipment 到 Context 的 provider-neutral Projection 合同 | GCC-0A/0B/0C、当前 Gameplay State、P2.1 状态合同 | GCC-4/5 | `gameplay-contracts` + `runtime-contracts` DTO、`runtime-host` projector integration；不选择 Rig | committed epoch + relationship/action/motion/medium → ordered `CameraContextSampleV1` | contract/hash/multi-instance tests | sequential |
| GCC-2 | Camera Profile/Context Admission、确定性 Selection 与 Explain | GCC-0B/0C | GCC-4/6 | `packages/camera` 纯函数 + `subject-registry` Envelope/loader + `authoring/compiler` lock projection | locked profiles + sample + preference → decision/explain 或稳定拒绝 | ambiguity/unknown-ref/order negative fixtures | parallel-safe |
| GCC-3 | Camera View Preference、View State、Selection Event/Explain 公共协议 | GCC-0A/0B/0C、Canonical Runtime State | GCC-4/7 | `runtime-contracts` Command/Event/Snapshot + Browser/CLI generated surface；值对象从 `camera` 导入 | V5 session identity + preference command → receipt/view revision/event | schema/exact-key/protocol tests | parallel-safe |
| GCC-4 | CameraDirector 执行 committed Selection Decision、Target、Pose 与回退 | GCC-1/2/3、当前 G19-5 target projection | GCC-6/7 | `runtime-babylon` CameraDirector/adapter only；纯选择由 `camera` 拥有 | `CameraSelectionDecisionV1` + target/socket + render delta → Babylon View/Capture Matrix | 30/60/120、pause/reset/rebind/collision tests | sequential |
| GCC-5 | Mount/Equipment/Flight 事务提供 Camera 输入，不直接控制镜头 | GCC-1、G19-7、P2.2/P2.3 | GCC-6 | relationship/action/capability runtime；复用当前 WorldSession barrier | typed transaction → committed facts/receipt/event 或全量 rollback | rollback/rebind/dispose tests | sequential |
| GCC-6 | 两个代表性 Kit 与 Registry Lock | GCC-2/4/5 | GCC-7 | Registry assets/examples；不得改 Runtime | frozen Kit recipes + profiles → locked expansion/explain | expand/validate/explain | sequential |
| GCC-7 | Browser/CLI/Take 与两个 Golden Fixture | GCC-3/4/6、G19-7 lifecycle | GCC-8 | apps/scripts/control-capture/fixtures；不新增协议字段 | public commands + locked worlds → automated/numeric/rendered/manual 四类证据 | real Chromium + Havok | sequential |
| GCC-8 | 全门禁、Provider 边界审计、文档状态与生产声明 | GCC-7 | 无 | 主 Agent 集成；README/AGENTS/Backlog/Review | integrated HEAD + evidence → GO/NO-GO 与准确 production/experimental 声明 | full gates + final review | main-agent-only |

GCC-1、GCC-2、GCC-3 只有在 GCC-0A～0C 完成且文件所有权不重叠时才可并行。GCC-4 以后
进入 Runtime 权威集成，必须顺序推进。G19-6 已完成，不能被本文反向改成待办；G19-7 只
作为 Outdoor/catalog lifecycle 依赖。Worker 报告不是集成证据，主 Agent 必须审查真实 diff
并运行端到端门禁。

## 16. 明确的阶段边界

当前生产阶段仍是 outdoor heightfield world。本文设计允许未来扩展到飞行、坐骑、装备和
复杂视角，但在对应 Golden Fixture 和 Blocking Gate 完成前：

- `flight.glide`、Mounted/Vehicle/Swimming Camera Profile 只能保持 experimental；
- README/CLI Discovery 不得把第三人称御剑飞行或第一人称滑翔标为 production；
- Scene Agent 必须把此类需求报告为 Capability Gap；
- 不得为演示效果修改 Physics、Camera 或 Babylon Adapter 绕过合同。

## 17. 评审决策

本次人工评审接受以下设计决定。GCC-0/GCC-0B/GCC-0C 已冻结；GCC-0A 及后续 Runtime
接线继续与当前 `main` 合同对拍：

1. 采用 Kit → Canonical 展开 → committed state → Camera Context → CameraDirector 的单向链路。
2. Kit/“预设体验”不成为 Runtime 第二真相。
3. Camera Context Tag 只能由锁定语义投影产生，普通 Agent 不能直接提交。
4. CameraDirector 是最终 View 唯一 Owner；Camera 与 Subject/Controller/World State 分离。
5. Rule 冲突在 Admission 失败；运行时不使用注册顺序或最近激活作为语义 tie-break。
6. 命令期显式第一人称不可用时稳定拒绝；已提交 Context 变化造成不兼容时进入可观察的
   Safe View，不静默降级且不回滚 Gameplay。
7. 第一个实施切片同时验收第三人称御剑飞行和第一人称滑翔，但仍按依赖拆成 Relationship/
   Flight/Camera/Fixture 阶段，不一次性硬编码两个 Demo。
8. Canonical Camera Domain 使用 clean-break 后的独立 `@whitebox-world/camera` 包；
   `runtime-babylon` 只实现 Provider View，不能把引擎对象反向暴露到 Domain。
9. 旧 Runtime 仅在 Babylon 承接 catalog scene、Opening Composition、tri-view 与 scene
   gates 后成组删除；该条件已由 P3.2 候选满足，后续不得恢复双运行底座。
