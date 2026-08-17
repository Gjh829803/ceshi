# AI-first LEGO 游戏 SDK 设计

- 状态：待评审
- 日期：2026-08-17
- 目标仓库：`agent-whitebox-world-sdk`
- 目标读者：SDK 团队、上游 Agent 团队、运行时与测试工具维护者

## 1. 结论

本项目要建设一个面向 AI 的、Schema-first、可组合、可验证的 Web 游戏 SDK。上游 Agent 根据图片和 Prompt 推断一个合理的可玩世界，输出声明式 JSON；SDK 不理解图片、不调用模型，而是负责校验、规范化、编译并运行这个世界。

正式链路为：

```text
图片 + Prompt
    ↓
外部 Agent
    ↓ AuthoringSpec JSON
SDK Schema Validator
    ↓
Normalizer + Kit Expander + Capability Resolver
    ↓ NormalizedWorldIR
World Compiler
    ↓ ExecutionPlan / WorldPackage
Babylon Web Runtime + Physics Backend
    ↓
可移动、可碰撞、可截图、可自动验收的游戏世界
```

核心设计原则：

1. AI 默认使用“大积木”：Node、Kit、Capability、Relationship 和 Semantic Action。
2. SDK 内部使用“小积木”：Component、System、Port、Adapter 和确定性执行阶段。
3. AI 永远不直接生成 Babylon Node、物理句柄、动画 Mixer 或底层 TypeScript 场景代码。
4. 配置负责组合已有能力；第一次增加新的能力类别时，由 SDK 插件实现。
5. 逻辑图、渲染/Transform 图和物理图分离，各自拥有明确真相和同步规则。
6. 同一份 Spec、同一组插件版本和同一个 Seed 必须产生相同的规范化结果与可复现模拟结果。
7. SDK 正式交付物是库 API、无状态 CLI、浏览器控制协议和可持久化 WorldPackage。
8. Babylon.js 是默认 Web Runtime，但对外 Schema 与引擎无关。
9. 当前仓库继续作为 SDK 仓库；生产 Agent 编排由另一个团队在独立仓库实现。

本项目不以短期开发成本最小为目标，优先保证 AI 可用性、长期扩展性和架构边界；但生产运行时的帧率、内存、包体、资源预算和安全性仍属于强制验收指标。

## 2. 背景与产品目标

用户希望通过一张参考图和一段 Prompt 生成一个可操作的白膜游戏场景。场景不要求最终材质和高保真视觉，但必须满足：

- 地形、水域边界、主体、核心物件和开场构图与参考图的可见证据一致。
- 玩家可以移动，地形和核心障碍物具有真实碰撞。
- 场景存在明确的出生点、朝向、相机和连续可通行空间。
- 单图不可见区域由 Agent 合理补全，形成完整、连贯的可玩世界。
- SDK 可以通过 CLI 和浏览器自动化移动主体、检查状态、截图并生成结构化报告。
- 后续能够通过注册新 Kit、Capability、Action、模型和动画扩展人物、坐骑、飞龙、车辆、交互和玩法。

这不是单图精确 3D 重建系统。单张透视图片不能唯一确定真实深度、背面结构、尺度和遮挡区域。产品承诺应定义为：

> 保持可见构图、关键语义和空间轮廓一致，并补全为物理连贯、可以游玩的合理世界。

SDK 应保证结构与模拟正确；上游 Agent 对图片理解和隐藏区域推断负责。

## 3. 范围与职责边界

### 3.1 SDK 负责

- AuthoringSpec、NormalizedWorldIR、Capability Manifest 和 WorldPackage 的版本化协议。
- JSON Schema、TypeScript 类型、默认值、迁移器和兼容性检查。
- 节点、资源、组件、能力、关系、动作和规则的注册与解析。
- Schema 校验、依赖解析、冲突检查、规范化和确定性编译。
- Babylon Web Runtime、物理适配、场景生命周期和资源所有权。
- 地形、水面、静态/动态物体、主体、镜头、动作和基础 Gameplay 运行时。
- 固定步长模拟、输入 Intent、状态快照、事件和回执。
- CLI、WorldPackage、浏览器控制协议和 Playwright Driver。
- 物理、可玩性、构图、资源预算和性能验收。
- 能力发现、示例查询、结构化 Diagnostic 和安全修复建议。

### 3.2 上游 Agent 负责

- 图片理解、Prompt 解析、语义分割、深度线索和空间关系推断。
- 可见证据与隐藏区域的合理补全。
- 选择 SDK 已注册的 Kit、Capability、Action 和节点类型。
- 输出符合 Schema 的 AuthoringSpec JSON。
- 根据 SDK Diagnostic、运行时状态和截图迭代修复配置。
- 模型调用、Prompt 工程、重试、工作流、队列和生成服务。

### 3.3 SDK 不负责

- 在 SDK 内部调用 LLM 或视觉模型。
- 让 Agent 直接修改 Babylon、Havok 或 Runtime 内部对象。
- 从单图恢复唯一真实三维世界。
- 在配置中实现任意脚本语言或允许不受控代码执行。
- 在第一版同时支持多个生产渲染后端。
- 将最终材质、云层、花朵、笔触等纯视觉细节编码成碰撞几何。

## 4. 业界术语与本项目定义

本设计采用游戏行业常见的 Scene Graph、Entity/Component/System、Prefab/Archetype、Controller/Possession、Socket、Semantic Action 和插件注册表思想。AI 游戏引擎尚无统一行业标准，因此本项目用明确、可测试的工程属性定义 AI-friendly。

| 术语 | 本项目定义 |
|---|---|
| Resource | 可复用但不直接存在于世界中的模型、Rig、动画集、Kit 或配置。 |
| Prototype | 一类实体的视觉与语义原型，可被多个实例引用。 |
| Entity / Node | 世界中具有稳定 ID、生命周期和组件集合的实例。 |
| Component | 实体上的纯数据；不持有底层引擎对象。 |
| Capability | 可组合、可验证、可版本化的行为模块。 |
| System | 在确定性阶段处理 Component、Intent 和 Event 的运行逻辑。 |
| Kit / Archetype / Prefab | 面向 AI 的、经过验证的 Capability 与 Profile 组合。 |
| Relationship | 实体间可变化的关系，如 MountedOn、AttachedTo、PossessedBy。 |
| Action | 具有稳定语义、前置条件、生命周期和结果的操作。 |
| AuthoringSpec | AI 输出的简洁、声明式 JSON。 |
| NormalizedWorldIR | SDK 展开默认值、Kit、依赖和关系后的完整执行图。 |
| ExecutionPlan | 编译器为 Runtime 生成的有序资源、系统和实例化计划。 |
| WorldPackage | 可保存、校验、加载和运行的编译产物。 |
| Runtime Adapter | Babylon、物理、音频等底层实现与引擎无关 Port 的适配层。 |

`Capability` 和 `Kit` 的命名并非所有引擎统一，但分别对应 Trait/Behavior/Module 与 Prefab/Archetype，符合通用工程概念。

## 5. 总体架构

```text
@worldkit/contracts
  ├── 基础 ID、坐标、Diagnostic、版本和协议类型
  ↓
@worldkit/schema
  ├── AuthoringSpec JSON Schema
  ├── Capability/Kit/Action Schema Registry
  └── 迁移与兼容性
  ↓
@worldkit/world-ir
  ├── AuthoringSpec AST
  ├── NormalizedWorldIR
  ├── Resource / Node / Relationship / Rule
  └── 规范化与稳定序列化
  ↓
@worldkit/capability
  ├── Capability Manifest
  ├── requires / provides / conflicts
  ├── Kit 展开
  └── 依赖图与执行阶段
  ↓
@worldkit/compiler
  ├── validate
  ├── normalize
  ├── resolve
  ├── compile
  └── package
  ↓
@worldkit/runtime-contracts
  ├── RenderPort
  ├── PhysicsPort
  ├── AssetPort
  ├── InputPort
  ├── AudioPort
  └── CapturePort
  ↓
@worldkit/runtime-babylon + @worldkit/physics-havok
  ↓
@worldkit/browser-protocol + @worldkit/playwright-driver + @worldkit/cli
```

建议的仓库包结构：

```text
packages/
  contracts/
  schema/
  world-ir/
  capability/
  compiler/
  runtime-contracts/
  capabilities-core/
  capabilities-subject/
  capabilities-gameplay/
  kits/
  actions/
  runtime-babylon/
  physics-havok/
  testkit/
  browser-protocol/
  playwright-driver/
  cli/

apps/
  playground/
  inspector/
```

第一版只交付 Babylon Web Runtime。`runtime-contracts` 的目的不是同时维护多个引擎，而是阻止引擎类型污染公共协议，并为测试替身与未来替换保留边界。

## 6. 双层 AI API

### 6.1 普通模式：Kit 优先

大多数 Agent 输出使用经过验证的 Kit：

```json
{
  "id": "player",
  "kind": "subject",
  "kit": "humanoid.third-person@1",
  "profiles": {
    "body": "humanoid.adult@1",
    "visual": "traveler-red-coat@3",
    "rig": "humanoid.biped@1",
    "animations": "humanoid-standard-actions@2"
  },
  "transform": {
    "position": [0, 22, 40],
    "facingRadians": 0
  }
}
```

Kit 内部展开为碰撞体、输入映射、运动控制、镜头、动作状态、动画、语义和渲染绑定。Agent 不需要重复填写这些底层细节。

### 6.2 高级模式：Capability 组合

当已有 Kit 不满足场景时，Agent 可以组合注册过的 Capability：

```json
{
  "id": "dragon-1",
  "kind": "subject",
  "prototype": "dragon",
  "capabilities": [
    {
      "type": "locomotion.ground",
      "version": 1
    },
    {
      "type": "locomotion.flight",
      "version": 1,
      "parameters": {
        "cruiseSpeed": 18,
        "turnRate": 1.4
      }
    },
    {
      "type": "interaction.mountable",
      "version": 1,
      "parameters": {
        "seats": [
          {
            "id": "saddle",
            "socket": "spine-saddle"
          }
        ]
      }
    }
  ]
}
```

高级模式仍然只能使用注册表中的能力，不能嵌入代码或底层引擎配置。

### 6.3 设计原因

- 只暴露 Kit 会导致组合数量爆炸。
- 只暴露细粒度 Component 会使 AI 输出冗长、脆弱且难以校验。
- 两级 API 让常见场景稳定，让特殊场景仍可扩展。
- `normalize` 必须将两种输入展开成相同的 NormalizedWorldIR。

## 7. AuthoringSpec 与 NormalizedWorldIR

### 7.1 AuthoringSpec 顶层结构

```json
{
  "kind": "worldkit-authoring-spec",
  "version": 1,
  "id": "sunlit-bay",
  "seed": 1024,
  "source": {},
  "world": {},
  "resources": {},
  "nodes": [],
  "relationships": [],
  "rules": [],
  "entry": {},
  "constraints": {}
}
```

字段职责：

- `source`：保留用户 Prompt、参考图 URI、证据与推断来源。
- `world`：边界、单位、坐标约定、重力、环境和预算。
- `resources`：模型、Rig、AnimationSet、Kit 和 Prototype 引用。
- `nodes`：世界实例。
- `relationships`：实体之间的动态或初始关系。
- `rules`：Trigger、Action、Objective、Timer 和状态规则。
- `entry`：出生点、控制目标和开场相机。
- `constraints`：路线坡度、构图区域、语义锚点和其他验收要求。

### 7.2 固定坐标与单位

- 长度单位：米。
- 时间单位：秒。
- 角度：对外 Schema 使用弧度并在字段名中保留 `Radians`。
- 世界坐标：右手坐标系，`+Y` 向上。
- 主体和 Prototype 正前方：`-Z`。
- 默认 Pivot：`ground-center`；特殊资源必须显式声明。
- 屏幕构图坐标：左上为 `[0, 0]`，右下为 `[1, 1]`。

所有 Runtime Adapter 必须遵守这些公共约定，在边界内部进行引擎坐标转换。

### 7.3 NormalizedWorldIR

NormalizedWorldIR 必须：

- 包含所有默认值，不依赖隐式行为。
- 将 Kit 展开成完整 Capability、Profile 与 Component。
- 将所有 ID 解析为稳定引用并检测悬空、重复与循环依赖。
- 将 Capability 依赖解析为无歧义的 provides/requires 绑定。
- 固定注册表版本、插件版本和资源哈希。
- 输出稳定排序和稳定 JSON 序列化结果。
- 不包含 Babylon、Havok、DOM 或进程内对象。
- 能独立用于 Diff、缓存、重放、迁移和审计。

## 8. 通用节点分类

AI-facing 节点种类保持有限，后续主要通过 Component、Capability 和 Profile 扩展，而不是不断增加新的基础节点类型。

| `kind` | 责任 | 示例 |
|---|---|---|
| `subject` | 能行动、被控制或被行为系统驱动的主体 | 人、动物、飞龙、车辆、NPC |
| `terrain` | 大范围地面、高度场和地形语义 | 平原、山地、岛屿 |
| `water` | 水面、边界、水体 Volume 和水语义 | 海、湖、河 |
| `object` | 通用可见物件 | 塔、墙、门、箱子、桥、船 |
| `volume` | 不一定可见的空间区域 | Trigger、伤害区、水下区、检查点 |
| `path` | 路线、巡逻线、导航或构图引导 | 道路、飞行航线、NPC 巡逻线 |
| `anchor` | 空间锚点与 Socket | 出生点、座位、手持点、交互点 |
| `camera` | 相机实体或相机 Rig 配置 | 第三人称、骑乘、飞行、开场镜头 |
| `spawner` | 运行时创建实体 | NPC、敌人、道具刷新点 |
| `environment` | 世界级环境条件 | 天空、雾、光照、重力、音频环境 |

`rule`、`objective`、`timer` 和 `state` 属于 Gameplay 定义，不要求具有空间 Transform，因此放在 `rules` 而不是 `nodes`。

### 8.1 Object 不按语义继续分裂

塔、墙、箱子和门都使用 `object`，差异来自组件：

```json
{
  "id": "watchtower",
  "kind": "object",
  "prototype": "watchtower-stone@1",
  "components": {
    "physics": {
      "mobility": "static",
      "collider": "compound"
    },
    "semantic": {
      "type": "watchtower",
      "importance": "primary"
    }
  }
}
```

同一节点类型通过能力扩展：

- 静态墙：`mobility: static`。
- 可推动箱子：`mobility: dynamic`。
- 自动门：`mobility: kinematic` + `interaction.openable`。
- 可破坏塔：增加 `gameplay.destructible`。

### 8.2 Water 是 Surface 与 Volume 的组合

Water 的公共结构同时保留：

- `surface`：水面渲染和水位。
- `boundary`：二维或三维水域边界。
- `volume`：进入水体、游泳、阻力与浮力的空间范围。
- `physics`：可选的浮力和流速参数。
- `semantic`：海、湖、河、浅滩等语义。

第一阶段可以只实现 Surface、Boundary 和基础碰撞/阻挡策略，但 Schema 不应阻止后续增加游泳和浮力。

## 9. 三图分离：逻辑、渲染与物理

运行时维护三种图：

| 图 | 唯一责任 | 骑龙示例 |
|---|---|---|
| 逻辑图 | Entity、Capability、Relationship、状态与控制权 | `player mountedOn dragon` |
| 渲染/Transform 图 | 可见层级、骨骼、Socket 和局部 Transform | 玩家模型挂到龙的 `saddle` |
| 物理图 | Body、Collider、Joint、碰撞组与接触 | 龙负责移动，玩家 Collider 切换 |

三张图通过 System 同步，但不能互相替代。父子节点只表达空间或生命周期关系，不能作为骑乘、控制权或 Gameplay 的唯一真相。

## 10. Component、Capability、System 与 Kit

### 10.1 Component

Component 是可序列化数据，不包含引擎对象或复杂行为。首批通用 Component：

- `Transform`
- `Semantic`
- `VisualBinding`
- `PhysicsBody`
- `ColliderSet`
- `ControlState`
- `LocomotionState`
- `ActionState`
- `AnimationState`
- `CameraTarget`
- `LifecycleState`
- `RelationshipState`

### 10.2 Capability Manifest

```ts
interface CapabilityManifest {
  id: string;
  version: number;
  configSchema: JsonSchema;
  requires: readonly CapabilityRequirement[];
  provides: readonly CapabilityProvision[];
  conflicts: readonly CapabilityConflict[];
  phases: readonly RuntimePhase[];
  resources?: ResourceBudget;
  normalize(context: NormalizeContext, config: unknown): NormalizedCapability;
  install(context: CapabilityInstallContext): InstalledCapability;
}
```

Manifest 必须声明：

- 能力 ID 与独立版本。
- 配置 Schema 与默认值。
- 依赖的 Port、Component 或其他能力。
- 提供的 Port、Intent、Action 或 Component。
- 明确冲突和基数限制。
- 执行阶段和生命周期。
- 资源预算、诊断和 Conformance Test。

### 10.3 依赖解析

解析器按以下顺序工作：

1. 展开 Kit。
2. 合并显式 Capability override。
3. 解析 `requires` 与 `provides`。
4. 检查 `conflicts`、基数和循环依赖。
5. 应用默认值并生成 Normalized Capability。
6. 根据固定 Runtime Phase 拓扑排序。
7. 生成 ExecutionPlan。

插件注册顺序不能改变执行结果。

### 10.4 Kit

Kit 是经过验证的组合清单，不包含不可观察的魔法逻辑：

```json
{
  "id": "humanoid.third-person",
  "version": 1,
  "capabilities": [
    "render.humanoid@1",
    "physics.character@1",
    "locomotion.ground@1",
    "control.possessable@1",
    "camera.third-person@1",
    "action.humanoid-locomotion@1"
  ],
  "profiles": {
    "body": "humanoid.adult@1",
    "rig": "humanoid.biped@1"
  }
}
```

Kit 必须可以通过 CLI 查询、展开和解释。

## 11. Relationship、Attachment 与 Possession

实体间关系使用显式、可版本化的 Relationship，不通过数组下标或永久父子节点隐式表达。

首批关系：

- `attachedTo`
- `mountedOn`
- `possessedBy`
- `follows`
- `targets`
- `owns`

骑乘示例：

```json
{
  "type": "mountedOn",
  "version": 1,
  "subject": "player",
  "target": "dragon-1",
  "socket": "saddle",
  "controlTarget": "dragon-1"
}
```

运行时 Mount 状态机：

```text
unmounted
  → mounting
  → mounted
  → dismounting
  → unmounted
```

进入 `mounted` 时：

1. 验证 Rider 与 Mountable Capability。
2. 验证距离、座位可用性与动作前置条件。
3. 将骑手视觉挂到目标 Socket。
4. 暂停骑手自身 Locomotion。
5. 切换骑手碰撞组或关闭独立 Collider。
6. 将 Control/Possession 交给坐骑。
7. 激活骑乘 Camera Rig 和 `ride` Action。
8. 记录 Relationship、Event 和 Receipt。

下坐骑时必须寻找安全落点，恢复骑手物理和控制权，并解除渲染挂载。

## 12. Subject、模型、身体、Rig 与动画分离

小孩、成人、不同服装和不同模型不应成为不同 Subject 类型。它们共享 SubjectKit，差异由 Profile 和 Resource 表达。

### 12.1 BodyProfile

定义影响物理和手感的身体属性：

- 身高、半径、质量。
- Collider 形状。
- 眼睛与相机目标高度。
- 步幅、移动速度缩放。
- 自动跨阶、最大坡度和贴地距离。
- 交互距离与座位偏移。

只缩放成人模型不能正确表示儿童；BodyProfile 必须同步影响物理、镜头和运动参数。

### 12.2 VisualProfile

定义：

- 模型 URI 与哈希。
- 可见缩放与 Pivot 校正。
- Forward Axis。
- 材质/白膜策略。
- 语义与外观描述。
- Prototype 和实例颜色。

### 12.3 RigProfile

定义：

- 骨架类型与版本。
- 标准骨骼到资源骨骼的映射。
- 根骨骼和 Root Motion 来源。
- Socket：手、背、头、座位等。
- Retargeting 兼容性。
- 骨骼层与动画 Mask。

### 12.4 AnimationSet

AnimationSet 只负责将稳定 Action ID 映射到具体动画资源，不拥有 Gameplay 规则。

## 13. Semantic Action 系统

动作统一定义为会改变或表达主体状态的语义操作，而不只是播放动画。它覆盖：

- Locomotion：`idle`、`walk`、`run`、`jump`、`fly`、`land`。
- Interaction：`wave`、`sit`、`mount`、`dismount`、`pickup`、`open-door`。
- Gameplay：`attack.light`、`use`、`hit`、`die`。

### 13.1 ActionDefinition

```json
{
  "id": "mount",
  "version": 1,
  "category": "interaction",
  "parametersSchema": {
    "target": "entity-id",
    "seat": "string"
  },
  "requires": [
    "capability:rider",
    "target-capability:mountable"
  ],
  "interruptPolicy": "locked",
  "authority": "simulation",
  "completion": {
    "type": "animation-event",
    "event": "seated"
  }
}
```

ActionDefinition 声明：

- 参数 Schema。
- 前置条件与目标类型。
- 权限和控制来源。
- 循环/一次性语义。
- 打断、排队和优先级策略。
- Root Motion 策略。
- 完成、失败和取消条件。
- Gameplay Effect 与 Event。

### 13.2 AnimationBinding

```json
{
  "rig": "humanoid.biped@1",
  "bindings": {
    "idle": {
      "clip": "Adult_Idle",
      "loop": true,
      "blendIn": 0.2
    },
    "wave": {
      "clip": "Adult_Wave",
      "layer": "upper-body",
      "blendIn": 0.1
    },
    "ride": {
      "clip": "Adult_Ride_Pose",
      "loop": true
    }
  }
}
```

### 13.3 扩展规则

- 更换模型对已有动作的动画：只增加或替换 AnimationSet。
- 成人和儿童使用不同动作表现：不同 BodyProfile、RigProfile 与 AnimationSet。
- 增加已有语义动作的新 Clip：纯资源配置。
- 第一次增加新的语义动作：注册 ActionDefinition，并为相关 Rig 提供 Binding。
- 第一次增加新的物理行为，如飞行或抓钩：注册新的 Capability/System，而不是只增加动画。

### 13.4 动画层

Action Runtime 支持：

- Base Locomotion Layer。
- Full Body One-shot Layer。
- Upper Body Layer。
- Additive Layer。
- 骨骼 Mask。
- Blend、Crossfade 和 Transition Rule。
- Animation Marker，如脚步、离地、落地、握住、坐稳。
- Root Motion 策略。

默认由物理系统拥有世界 Transform，动画使用 `inPlace`。Root Motion 只有在 ActionDefinition 与 Physics Capability 明确支持时才能启用。

## 14. 地形、参考图与空间一致性

SDK 不负责从图片生成地形，但必须提供足够强的结构表达和验证能力，让 Agent 可以把图片理解结果落地。

### 14.1 地形输入

生产地形优先使用世界空间 Height Raster 与 Semantic Mask，而不是依赖少量圆形操作近似整张参考图。

AuthoringSpec 支持：

- 世界边界与高度范围。
- 分块高度场。
- 世界空间 Raster。
- 语义地形层。
- 局部 Raise/Lower/Flatten/Smooth。
- 路线走廊和坡度限制。
- 岸线、水位和湖底/海底语义。

### 14.2 参考图证据

保留四种证据来源：

- `user-explicit`
- `reference-visible`
- `planner-inferred`
- `planner-optional`

SDK 根据证据和约束进行验证，但不会将 Agent 推断伪装成图片事实。

### 14.3 构图验证

Opening Shot 必须定义：

- Spawn、Facing、Pitch、Distance、FOV 和 Target Height。
- Foreground/Middleground/Background。
- 标准化屏幕 Region。
- 实体 Anchor、中心、尺寸和容差。
- 最低 IoU 与最低总体分数。

普通截图用于视觉比较；Semantic Mask、Instance ID、Depth、Height/Slope 和 Collider Debug 用于结构验证。必需 Region 或 Anchor 失败时，总分不能覆盖失败。

## 15. Runtime 与 Babylon/Havok

### 15.1 选择 Babylon 的原因

项目目标是实际可玩的 Web 游戏 SDK，而不仅是白膜渲染库。Babylon 提供较完整的场景、资源、骨骼动画、相机、输入、调试和 Web 渲染基础，可以减少继续在 Three.js 上自建完整游戏引擎的范围。

选择 Babylon 不是因为它必然比 Three.js 更快，也不是因为 Node 自动解决扩展性。扩展性来自 World IR、Capability、Relationship 和 Port 边界。

### 15.2 Physics

第一版默认使用 Babylon 支持的 Havok 物理后端，并通过 `PhysicsPort` 隔离：

- Static、Kinematic、Dynamic Body。
- Box、Sphere、Capsule、Cylinder、Heightfield/地形替代方案和 Mesh Collider。
- Collision Group。
- Raycast、Shape Cast 和 Overlap。
- Character Controller 所需查询。
- Trigger、Contact Event 与物理快照。

如果具体地形或 Character Controller 能力在实现验证中不满足契约，可以替换 PhysicsPort 后端，但不能修改 AuthoringSpec 或 Agent API。

### 15.3 Runtime 执行阶段

固定执行顺序：

```text
receive commands
  → resolve possession/input
  → produce semantic intents
  → capability pre-physics
  → physics fixed step
  → transform/state commit
  → action/gameplay state
  → animation
  → camera
  → render sync
  → events/receipts/snapshot
```

模拟使用固定时间步；渲染可以插值。截图和自动测试必须能暂停实时循环并按 Tick 精确推进。

### 15.4 生命周期

统一生命周期：

```text
create → load → start → suspend/resume → stop → dispose
```

Entity、Capability、System、Asset、Collider 和 Browser Session 都必须有明确所有者和幂等 Dispose。

## 16. CLI 与外部程序协议

SDK 同时提供 TypeScript API 和无状态 CLI。JS/TS 程序可以直接调用包；Python、Go、Java 或 Agent 服务通过子进程和 JSON 调用 CLI。

### 16.1 命令

```bash
worldkit schema --output worldkit.schema.json
worldkit capabilities list --json
worldkit capabilities describe locomotion.flight@1 --json
worldkit kits describe dragon.mountable-flight@1 --json
worldkit examples --capability mountedOn --json

worldkit validate world.json --json
worldkit normalize world.json --output normalized.json --json
worldkit build world.json --output ./dist/world --json
worldkit verify ./dist/world --json
worldkit preview ./dist/world --port 5173

worldkit run ./dist/world --script actions.json --artifacts ./artifacts --headless --json
worldkit capture ./dist/world --view opening --output opening.png --json
worldkit inspect ./dist/world --json
```

所有接受文件的命令同时接受 `-`，从 stdin 读取 JSON。

### 16.2 输出约定

- stdout：仅稳定 JSON。
- stderr：进度和人类可读日志。
- JSON 输出包含 `protocolVersion`、`sdkVersion`、`specVersion` 和 `command`。
- 不把堆栈信息作为稳定 API；Debug 模式可在单独字段返回。

退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 成功 |
| 2 | 输入或 Schema 不合法 |
| 3 | 规范化或依赖解析失败 |
| 4 | 编译失败 |
| 5 | 运行时或物理验证失败 |
| 6 | 不支持的版本、Kit 或 Capability |
| 7 | 资产解析失败 |
| 8 | 浏览器自动化失败 |

## 17. Diagnostic 与 AI 自修复

Diagnostic 必须是正式协议：

```json
{
  "severity": "error",
  "code": "CAPABILITY_REQUIREMENT_UNSATISFIED",
  "instancePath": "/nodes/2/capabilities/1",
  "entityId": "dragon-1",
  "capabilityId": "locomotion.flight@1",
  "message": "Flight requires a 3D directional control provider.",
  "details": {
    "required": "control.direction3d",
    "available": ["control.direction2d"]
  },
  "suggestions": [
    {
      "kind": "add-capability",
      "capability": "control.direction3d@1"
    }
  ]
}
```

要求：

- 错误码稳定且可文档化。
- 使用 JSON Pointer 定位输入。
- 包含相关 Entity、Resource、Capability 或 Relationship ID。
- 解释实际值、期望值和冲突来源。
- 提供机器可读修复建议。
- SDK 可以输出建议 Patch，但只自动应用被标记为 `safe` 的机械修复。
- 物理和构图错误包含空间位置、相关 Collider/Region 和可执行建议。

## 18. Browser Protocol 与 Playwright Driver

Playwright 不进入 Core Runtime。Runtime 暴露版本化浏览器协议，Playwright Driver 是客户端。

```ts
window.__WORLDKIT_DRIVER__
```

第一版协议：

- `ready()`
- `loadWorldPackage()`
- `getCapabilities()`
- `getSnapshot()`
- `queryEntities()`
- `inspectEntity()`
- `setPaused()`
- `reset()`
- `setIntent()`
- `stepTicks()`
- `runActions()`
- `performAction()`
- `raycast()`
- `captureFrame()`
- `getDiagnostics()`
- `dispose()`

Playwright 不使用任意 `waitForTimeout` 驱动模拟。测试动作按固定 Tick 执行：

```json
{
  "actions": [
    {
      "type": "move",
      "forward": 1,
      "run": true,
      "ticks": 120
    },
    {
      "type": "perform",
      "action": "jump"
    },
    {
      "type": "capture",
      "name": "after-jump",
      "passes": ["color", "semantic-mask", "depth"]
    }
  ]
}
```

截图 Pass：

- `color`
- `canvas`
- `semantic-mask`
- `instance-id`
- `depth`
- `collision-debug`
- `height-slope`

CLI `run` 提供批处理；Node Driver API 提供长生命周期 Session。跨语言长期控制可以通过 CLI NDJSON Session 包装，但正式状态协议仍来自 Browser Protocol。

## 19. WorldPackage

`build` 输出可持久化目录：

```text
world-package/
  manifest.json
  authoring-source.json
  world.normalized.json
  registry-lock.json
  resources/
  terrain/
  collision/
  targets/
    babylon-web/
  diagnostics.json
  integrity.json
```

`manifest.json` 至少包含：

- World ID 与标题。
- SDK、Schema 和 Package 版本。
- Seed。
- Runtime Target。
- Capability、Kit、Action 与插件版本。
- 入口点与初始控制目标。
- 资源 URI、哈希、大小和类型。
- 世界边界和资源预算。
- NormalizedWorldIR 哈希。
- 完整性文件哈希。

WorldPackage 不保存进程内对象或引擎 Handle。Runtime Target 可以包含经过缓存的 Babylon/Web 资源，但 `world.normalized.json` 保持引擎无关。

## 20. 版本、迁移与兼容性

独立版本：

- SDK Package SemVer。
- AuthoringSpec Version。
- NormalizedWorldIR Version。
- WorldPackage Version。
- Capability/Kit/Action/Rig 独立 Major Version。
- Browser Protocol Version。

规则：

- Patch/Minor 不能改变相同 NormalizedWorldIR 的既有语义。
- 破坏性 Schema 变化增加 Major Version，并提供显式迁移器。
- `normalize` 固定所有插件版本，禁止运行时静默选择最新版本。
- 缺失或未知版本返回结构化错误，不进行猜测。
- Migration 输出迁移报告和前后哈希。
- WorldPackage 加载前验证兼容性与完整性。

## 21. 安全与不可信输入

Agent 输出视为不可信数据：

- 仅允许 JSON，不允许代码、函数、模块路径或动态 import。
- 限制节点、资源、三角形、Collider、Raster 和字符串大小。
- URI 通过 AssetResolver 和允许的 Scheme 解析。
- 禁止路径穿越、任意本地文件读取和隐式网络访问。
- 所有插件来自宿主注册表，Spec 不能指定任意 npm 包。
- 编译与浏览器运行设置超时、内存和资源预算。
- 诊断和日志避免输出凭证与未授权路径。
- WorldPackage 校验哈希后才加载。

## 22. 测试与验收

### 22.1 Schema Tests

- Valid/Invalid Fixture。
- 边界值、未知字段、重复 ID 和悬空引用。
- Kit 展开、默认值和稳定序列化。
- Version Migration。
- Diagnostic Snapshot。

### 22.2 Capability Conformance

每个 Capability 必须通过：

- Manifest Schema。
- requires/provides/conflicts。
- 安装与 Dispose。
- 固定阶段执行。
- 确定性重放。
- 资源预算。
- 缺失依赖的可执行诊断。

### 22.3 Runtime Conformance

- Transform 与坐标约定。
- Entity 生命周期和资源清理。
- Fixed Timestep。
- Body/Collider 同步。
- Raycast 与碰撞组。
- Terrain 与水体边界。
- Camera、输入 Intent 和 Possession。
- Action、动画事件与状态转换。
- Capture Pass 与 Browser Protocol。

### 22.4 Vertical Slice

第一条生产验证场景使用参考海湾：

- 分块 Heightfield。
- 大面积海湾和岸线。
- 第三人称人物。
- 灯塔、房屋、帆船和岛屿。
- 静态碰撞和连续可走路线。
- Opening Shot Region/Anchor 校验。
- 固定输入移动、转向和跳跃。
- Color、Semantic Mask、Depth、Height/Slope 截图。

第二条能力验证场景：

- Humanoid 与 Dragon 独立 Entity。
- 接近、上坐骑、控制权切换、起飞、飞行、降落和下坐骑。
- Body/Visual/Rig/AnimationSet 可替换。
- Replay 结果确定。

### 22.5 Production Gates

```text
schema
  → normalize
  → capability resolve
  → compile
  → unit/integration
  → browser smoke
  → physics/playability
  → capture/composition
  → package integrity
```

任一必需 Gate 失败都阻止发布，不能用总体分数掩盖关键失败。

## 23. 当前实现评估与复用

当前项目可以复用：

- `OutdoorWorldSpec` 中的证据、构图、路线和实体目录思想。
- `FeatureRegistry` 的类型、版本、Schema、Seed、依赖、预算、诊断和资源所有权。
- `SubjectKit` 作为 AI-facing 大积木的方向。
- Rapier 实现积累的 Character Controller、Heightfield 和 Raycast 验收案例。
- Action ID 到资源 Clip 的稳定映射思想。
- 固定步长、Snapshot、固定输入、截图、Semantic Mask 和构图评分。
- Playground 与真实场景 Fixture。

当前实现需要替换或演进：

- `WorldSpec → Builder TypeScript build()` 改为 `AuthoringSpec → Compiler`。
- Core Entity 不再直接拥有 Three.js `Object3D`。
- `FeatureRegistry` 扩展成通用 Capability Registry。
- 单体 Humanoid SubjectKit 拆成内部 Capability，同时保留高层 Kit。
- Action Manifest 升级为 ActionDefinition + AnimationSet + RigProfile。
- Playground Automation API 升级为稳定 Browser Protocol。
- 零散脚本升级为统一 CLI。
- Three Runtime 在 Babylon Vertical Slice 通过后移除。

## 24. 仓库策略与迁移顺序

继续在当前仓库开发，不新建第二个 SDK 仓库。使用隔离分支或 Worktree 建设新架构，旧 Runtime 作为回归基准暂时保留。

本文是覆盖整个 SDK 的总架构规格，不应被压缩成一个超大实现任务。阶段 A 至 F 分别形成独立实施计划；Schema/IR、Capability Compiler、Babylon Runtime、Subject/Action、CLI/Browser Driver 五个子系统在编码前各自补充接口级实施说明和验收清单，但不得偏离本文冻结的公共边界。

### 阶段 A：冻结基准

- 固定当前海湾、草地和物理测试 Fixture。
- 保存截图、Semantic Mask、Height/Slope 和固定输入结果。
- 记录当前性能、资源和行为基线。

### 阶段 B：协议底座

- 新增 contracts、schema、world-ir、capability 和 compiler 包。
- 定义 AuthoringSpec、NormalizedWorldIR、Diagnostic 和 Capability Manifest。
- 实现 validate、normalize、registry lock 和稳定序列化。

### 阶段 C：Babylon Vertical Slice

- 实现 runtime-contracts、runtime-babylon 和 physics-havok。
- 编译并运行海湾场景。
- 达成与旧 Runtime 相同的地形、主体、物理和捕获 Gate。

### 阶段 D：Subject 与 Action

- 实现 Profile、Kit、Possession、Relationship 和 Semantic Action。
- 验证成人/儿童模型替换和不同 AnimationSet。
- 实现地面坐骑，再实现飞龙飞行与下坐骑。

### 阶段 E：工具化

- 正式 CLI。
- WorldPackage。
- Browser Protocol。
- Playwright Driver。
- Inspector 与 Capability Discovery。

### 阶段 F：切换默认实现

- 新 Runtime 通过全部 Production Gates。
- Playground 默认切换 Babylon。
- 移除或归档 Three Runtime。
- 将生产 Agent 编排迁出 SDK 仓库，只保留 Fixtures 和接入文档。

## 25. 方案对比与选择

### 方案一：继续 Three.js + Rapier 并逐步补齐引擎

- 优点：复用最多、当前链路可运行、底层控制强。
- 缺点：需要继续自建资源、动画、场景和调试等游戏引擎基础设施；Core 已与 Three 类型耦合。
- 结论：作为回归基准保留，不作为长期默认 Runtime。

### 方案二：直接暴露 Godot 风格节点树

- 优点：层级直观，传统游戏开发者熟悉。
- 缺点：节点层级不足以表达 Capability、Possession、物理权威和动态 Relationship；容易把公共 Schema 绑定引擎。
- 结论：借鉴 Transform/Socket 层级，不采用纯节点树作为完整逻辑模型。

### 方案三：引擎无关 IR + Capability Graph + Babylon Runtime

- 优点：AI-facing 协议稳定；内部可组合；Web、TypeScript、CLI 和 Playwright 结合自然；不让引擎类型污染 Schema。
- 缺点：需要先建设 Schema、Compiler、Port 和注册表，短期改造量大。
- 结论：采用。本项目不以开发成本最小为目标，优先长期正确性、AI 可用性和扩展边界。

## 26. 生产验收标准

设计落地后必须满足：

1. 外部程序仅通过 JSON 和公开 SDK/CLI 即可生成、验证和运行世界。
2. Agent 不生成 TypeScript 场景代码，不接触 Babylon/Havok 对象。
3. `worldkit capabilities list` 能发现所有可用 Node、Kit、Capability、Action 和 Relationship。
4. `validate` 与 `normalize` 输出稳定、可定位、可修复的 Diagnostic。
5. 同一输入和 Seed 的 NormalizedWorldIR 哈希稳定。
6. 新增 Capability 不修改 Compiler Core。
7. 新增人物模型或动画集不修改 Subject Runtime Core。
8. 成人与儿童能共享 Humanoid Kit，同时使用不同 Body/Visual/Rig/Animation Profile。
9. 主体能够通过 Relationship 与坐骑组合，并正确切换控制、物理、相机和动作。
10. 地形、水面、主体和核心物件可由 Spec 确定性编译并具有正确物理。
11. Browser Protocol 能按 Tick 移动、执行动作、查询状态和截图。
12. WorldPackage 可以独立校验、保存、加载和重放。
13. 必需构图 Region、Anchor、路线坡度和物理 Gate 可阻断不合格产物。
14. Runtime、CLI 和插件具有明确版本、生命周期和兼容性规则。

## 27. 最终架构决策摘要

- 当前仓库继续作为 SDK 仓库。
- 外部团队实现图片/Prompt Agent。
- Agent 正式输出为纯 JSON AuthoringSpec。
- AI 默认使用 Kit，高级模式允许 Capability 组合。
- 通用节点为 subject、terrain、water、object、volume、path、anchor、camera、spawner、environment。
- Resources、Nodes、Relationships 和 Rules 分离。
- 逻辑图、渲染图和物理图分离。
- 人物的 Body、Visual、Rig、AnimationSet 和 Subject 能力分离。
- Action 是语义操作，不只是 Clip；AnimationBinding 只负责表现。
- Babylon 是第一版默认 Web Runtime；公共协议不包含 Babylon 类型。
- 物理通过 Port 隔离，第一版默认 Havok。
- SDK 提供 TypeScript API、CLI、WorldPackage、Browser Protocol 和 Playwright Driver。
- 先在同一 Monorepo 并行建设新 Runtime，再移除旧 Three Runtime。

这套设计兼容业界常见游戏引擎概念，同时针对 AI 做了明确的 Schema、发现、规范化、诊断、编译和自动验收增强。它避免纯节点树和纯底层 ECS 两个极端，让 AI 使用可理解的大积木，让 SDK 内部保持可组合的小积木。
