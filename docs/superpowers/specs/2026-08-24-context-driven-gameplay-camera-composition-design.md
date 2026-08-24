# 上下文驱动 Gameplay 与 Camera 组合设计

## 1. 文档状态

- 状态：**Reviewed / Approved for Implementation Planning（2026-08-24）**。
- 适用里程碑：P2.2 骑乘与控制上下文、P2.3 装备/飞行/动作变体、P2.4 多相机模式。
- 当前实现基线：`CameraDirectorV1`、`camera-rig-profile`、
  `camera-modifier-profile`、`camera-context-profile`、Capability Runtime 和
  Subject Preset Workspace。
- 上位规格：
  - [AI-first LEGO 游戏 SDK 总体设计](./2026-08-17-ai-first-lego-game-sdk-design.md)
  - [可扩展主体组装 Authoring](./2026-08-19-extensible-subject-authoring-design.md)
  - [Canonical Runtime State 与 Semantic Projection](./2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)
  - [人物、资产与 3C 接入契约](../../16-subject-assets-3c-integration.md)
  - [Character / Camera Capability Integration](./2026-08-20-character-camera-capability-integration-design.md)
- 实施入口：[SDK 重构进度与 Backlog](../../18-refactor-progress-and-backlog.md) 的 P2.2–P2.4。

本文补齐“人物/坐骑/装备/运动/动作与镜头怎样组合成可复用体验”的端到端合同。
它不替换上位规格，也不声明飞行、骑乘、装备或第一人称已经生产可用。本文已经完成
人工设计评审，可以为首个纵向切片编写实施计划；公共合同仍须在 GCC-0/GCC-0A 完成后
才能冻结并进入实现。

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

### 3.3 与 PR #19 / Gameplay Framework 的关系

本文不是 PR #19 的替代实现。Route R1b Static Platform 已在 `main:dfe0d35` 完成并关闭
M5；PR #19 仍是未合入的上游候选，必须先按
[`Gameplay Framework 与 Route R1b 融合设计`](https://github.com/seedleap/agent-whitebox-world-sdk/blob/99482b1d57eebfc939f93367ae4b57afddd73ab1/docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md)
完成融合和审查，不能直接把原 PR 的旧 Runtime/Camera 合同带入 main。该融合设计当前仍
只存在于集成分支；实施本文前必须先把其获批版本作为独立变更合入 main。融合后的 #19
是本文的直接上游：

| #19 / G19 提供 | 本文怎样复用 | 本文不能重复实现 |
| --- | --- | --- |
| RuntimeHost、RuntimeSession、WorldSession 和唯一 fixed-tick publication barrier | Camera Context 只消费同一已提交 epoch | 第二个 Session/时钟/发布 barrier |
| Gameplay Command、Receipt、Event、Snapshot 与 retained artifact | Mount/Equipment/Action 的 Camera 变化引用相同 Receipt/Event 因果链 | Camera 私有 Gameplay journal |
| `GameplayWorldPortV1` 与 staged `projectedViewStateAfter` | Possession 与 Camera Target 在同一事务准备并原子发布；后续关系复用同一端口 | Camera 提前读取 prepare 态或事后补写 |
| `possessedBy` 唯一控制权真相 | 决定 Camera 的受控 Entity 与 Rebind | Camera/Controller 保存竞争 target |
| Semantic Action State/Definition | 投影 Action Camera Tag 和 Modifier 条件 | 从 Animation Clip 重算 Action |
| Camera/View 独立 Owner 与锁定 Profile 边界 | 继续由 CameraDirector 决定最终 View | GameplayState 保存 Camera 数值 |

当前 #19 融合分支的 `GameplayRelationshipStateV1` 是关闭 Union，首批只包含
`possessedBy`。因此 `mountedOn` 与 `equippedAt` 必须在后续 P2.2/P2.3 中通过显式版本演进、
Parser/Canonicalizer/Hash/Receipt/Event/Gate 一起增加；不得塞进自由 Relationship 袋，也不得
让 Camera Context 先用临时 Tag 模拟已提交关系。

本文不能单方面改写已经批准但尚未实现的 #19 G19-5/G19-6。冻结本文前必须先给 #19
集成规格和计划做一次显式合同修订，确认 G19-5 只负责 `possessedBy → targetEntityId` 的
原子重定向和 staged View publication，不冻结另一套 Profile/Preference 选择协议；G19-6
只发布本文 §6.4 的唯一 View Preference 协议。

修订后的实施顺序为：

```text
R1b Static Platform 已完成并冻结共享 Plan/Browser 合同（main:dfe0d35）
  → 合入获批的 #19 融合规格与计划
  → #19 G19-4 组合 ExecutionPlan/Compiler/WorldPackage
  → 修订 #19 G19-5/G19-6 的 Camera 边界
  → #19 G19-5 只完成 Babylon Gameplay Port + Possession/Camera Target 原子接线
  → 本文 GCC-2/GCC-3 冻结 Context 与唯一 View Preference 公共合同
  → 本文 GCC-4 完成 CameraDirector 选择
  → #19 G19-6/G19-7 以该唯一合同完成 Browser/Outdoor Runtime 门禁
  → 本文扩展 mountedOn/equippedAt/flight 与两个组合 Fixture
```

其中 `possessedBy → Camera Target` 的最小链路属于 #19 G19-5，但 Rig/Modifier/Preference
选择属于本文 GCC-2/GCC-3/GCC-4。完整御剑/滑翔体验在 #19 底座稳定后继续扩展。两边不能
各自维护一份 `GameplayViewStateProjection`、Camera transaction、选择命令或 Browser 方言。

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

当前 `cameraPreference: "auto" | "first-person" | string`、#19 草案中的
`requestCameraProfile/resetCameraProfile`，以及长期总规格中的 `view.set-mode/view.set-rig`
不得同时成为公开协议。项目尚未发布，实施时执行一次 clean break：Schema、CLI、Browser、
generated types、examples、Snapshot/Event 和测试同步切换到上述命名，不保留 alias。内部
Authoring Workbench 可以迁移自己的草稿格式，但不能把旧方言继续暴露给 Runtime。

`runtimeSessionId` 与 `worldSessionId` 沿用 #19/Canonical Runtime State；不新增
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
  | { type: "mountedOn"; entityRole: "rider" | "mount" }
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

`relationshipContexts` 必须由 #19 WorldSession 同一 committed epoch 的正式 Relationship State
投影，并按 `type`、Relationship ID 的 Canonical code-unit 顺序稳定生成。每条上下文携带
已提交 Relationship 的 `id`，供 Explain/Event 关联。Camera Rule 的
`allRelationshipConditions` 逐条匹配当前
`controlledEntityId` 或 `targetEntityId` 在角色化端点中的位置，不能使用通用
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
多条 Relationship 及其角色化端点；Camera Context Rule 以 `mountedOn` 的 Rider/Mount、
`equippedAt` 的 Item/Wearer、`possessedBy` 的 Controlled/Controller 等关闭条件匹配。现有
单值 `ViewTargetSampleV1.relationshipRole` 只能保留在当前窄切片，不能成为长期合同；升级时
同步演进 Registry Rule、ExecutionPlan、Runtime DTO 和测试，不保留同义 alias。

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
2. 已提交 Relationship Profile 可以把 Camera Target 映射为受控 Entity、Rider、Source
   或 Target Entity；
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
Context 时落入 Auto 的行为，是实施时必须删除的旧语义；不能被 #19 G19-5 复制到新 View
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

Event 使用 #19 WorldSession 的统一 Event Sequence；`id` 由 `worldSessionId + sequence` 按
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
WorldSession。`world.reset` 沿用 #19 生命周期：销毁旧 CameraDirector/WorldSession，创建新的
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

本文只定义已通过人工评审的设计，不直接实施。GCC-0/GCC-0A 冻结公共合同后，实施计划
必须使用以下工作图，并在每个任务中列出精确文件所有权。

| ID | 目标与独立交付物 | depends_on | blocks | 所有权与集成点 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- |
| GCC-0 | 冻结本文、术语、Schema 版本策略和首个 Fixture | 无 | GCC-0A/1..8 | 主 Agent；规格/ADR/Backlog | 模式 A 全维度审查 | main-agent-only |
| GCC-0A | 修订 #19 集成规格/计划：G19-5 只拥有 Possession→Target；G19-6 显式依赖 GCC-3/GCC-4，不得先发布 Camera 命令 | GCC-0 | GCC-1/2/3、#19 G19-5 | 主 Agent；#19 spec/plan only，不改 Runtime | 两份规格 Owner/命令/DTO/依赖图对拍 | main-agent-only |
| GCC-1 | Relationship/Action/Equipment 到 Context 的 provider-neutral Projection 合同 | GCC-0A、#19 G19-3/G19-4、P2.1 状态合同 | GCC-4/5 | gameplay-contracts + runtime-contracts + canonical state integration；沿用现有 Gameplay View DTO | contract tests + hash fixture | sequential |
| GCC-2 | Camera Context Profile Admission 与歧义门禁 | GCC-0A | GCC-4 | subject-registry + authoring/compiler | negative fixtures | parallel-safe |
| GCC-3 | Camera View Preference、View State、Selection Event/Explain 合同 | GCC-0A、#19 G19-3、Canonical Runtime State | GCC-4/7、#19 G19-6 | 扩展 #19 的 provider-neutral View DTO 与 protocol/browser/cli contracts，不另建 View Schema | schema + protocol tests | parallel-safe |
| GCC-4 | CameraDirector 消费 committed Context、确定性选择与回退 | GCC-1/2/3、#19 G19-5 | GCC-6/7、#19 G19-6 | runtime-babylon camera only；复用 G19 staged transaction | adversarial runtime tests | sequential |
| GCC-5 | Mount/Equipment/Flight 事务提供 Camera 输入，不直接控制镜头 | GCC-1、#19 G19-5/G19-7、P2.2/P2.3 | GCC-6 | relationship/action/capability runtime；复用 G19 WorldSession barrier | rollback/rebind tests | sequential |
| GCC-6 | 两个代表性 Kit 与 Registry Lock | GCC-4/5 | GCC-7 | registry/assets/examples；不得改 Runtime | expand/validate/explain | sequential |
| GCC-7 | Browser/CLI/Take 与两个 Golden Fixture | GCC-3/4/6 | GCC-8 | automation + fixtures | real Chromium + Havok | sequential |
| GCC-8 | 全门禁、渲染/人工验收、文档状态与生产声明 | GCC-7 | 无 | 主 Agent 集成 | full gates + final review | main-agent-only |

GCC-1、GCC-2、GCC-3 只有在 GCC-0A 完成且文件所有权不重叠时才可并行。GCC-4 以后进入
Runtime 权威集成，必须顺序推进。Worker 报告不是集成证据，主 Agent 必须审查真实 diff 并
运行端到端门禁。

#19 G19-6 必须在其实施计划中把 GCC-3 与 GCC-4 写入 `depends_on`；仅完成 GCC-0A 的文字
修订不能解锁 G19-6。Browser/CLI 文件在 G19-6 开始前仍由主 Agent 保留，禁止另一 Worker
发布临时 Camera 命令或 DTO。

## 16. 明确的阶段边界

当前生产阶段仍是 outdoor heightfield world。本文设计允许未来扩展到飞行、坐骑、装备和
复杂视角，但在对应 Golden Fixture 和 Blocking Gate 完成前：

- `flight.glide`、Mounted/Vehicle/Swimming Camera Profile 只能保持 experimental；
- README/CLI Discovery 不得把第三人称御剑飞行或第一人称滑翔标为 production；
- Scene Agent 必须把此类需求报告为 Capability Gap；
- 不得为演示效果修改 Physics、Camera 或 Babylon Adapter 绕过合同。

## 17. 评审决策

本次人工评审接受以下设计决定；它们在 GCC-0/GCC-0A 与 #19 上游合同对拍后冻结：

1. 采用 Kit → Canonical 展开 → committed state → Camera Context → CameraDirector 的单向链路。
2. Kit/“预设体验”不成为 Runtime 第二真相。
3. Camera Context Tag 只能由锁定语义投影产生，普通 Agent 不能直接提交。
4. CameraDirector 是最终 View 唯一 Owner；Camera 与 Subject/Controller/World State 分离。
5. Rule 冲突在 Admission 失败；运行时不使用注册顺序或最近激活作为语义 tie-break。
6. 命令期显式第一人称不可用时稳定拒绝；已提交 Context 变化造成不兼容时进入可观察的
   Safe View，不静默降级且不回滚 Gameplay。
7. 第一个实施切片同时验收第三人称御剑飞行和第一人称滑翔，但仍按依赖拆成 Relationship/
   Flight/Camera/Fixture 阶段，不一次性硬编码两个 Demo。
