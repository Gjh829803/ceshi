# AI-first 白模游戏 SDK 设计评审

> 建议阅读时间：10～15 分钟
>
> 文档目的：帮助团队判断总体设计方向是否成立，以及哪些关键边界需要在开发前冻结。
>
> 本文不是完整技术规格，不展开所有 Schema 字段、接口和测试细节。

## 1. 我们要做什么

我们要提供一个面向 AI Agent 的游戏场景 SDK。

上游 Agent 根据图片和 Prompt 理解场景，输出结构化场景描述；SDK 负责把描述编译成一个可以运行、移动、碰撞、截图和自动验收的 3D 白模游戏世界。

第一阶段聚焦室外场景：地形、水面、可控制主体和关键物件。最终画面是否精美不是 SDK 的核心目标，空间结构、玩法语义和物理结果是否正确才是。

```text
图片 + Prompt
    ↓
上游 AI Agent
    ↓
AuthoringSpec（结构化世界描述）
    ↓
SDK 校验、规范化和编译
    ↓
Babylon Runtime + Havok Physics
    ↓
可操作白模世界 + 截图/状态/诊断
```

一句话定义：**这是一个让 AI 用结构化配置“组装游戏世界”的 SDK，而不是让 AI 直接编写游戏引擎代码。**

## 2. 为什么不能只让 Agent 直接写场景代码

Agent 直接生成 Three.js、Babylon 或物理引擎代码，短期很快，但会逐渐出现以下问题：

- 同一种人物、相机和碰撞逻辑被反复实现，行为不一致。
- 场景能显示，但物理、动作、坐骑和装备无法稳定组合。
- 上游程序很难判断场景为什么失败，也难以自动修复。
- 引擎实现细节进入 AI 输出，未来替换 Runtime 或升级引擎代价很高。
- 相同输入难以稳定复现，无法作为生产制品缓存、审计和重放。

因此，我们把 AI 可以表达的内容收敛为版本化 Schema，把复杂的游戏实现留在 SDK 内部。

## 3. 总体设计：外部简单，内部像 LEGO

### 3.1 AI 只面向 AuthoringSpec

AuthoringSpec 是 SDK 的正式输入，它描述：

- 世界里有什么：人物、动物、地形、水面、塔、墙、道路等。
- 它们在哪里、大小如何、彼此是什么关系。
- 主体具备什么能力：行走、跳跃、飞行、骑乘、攻击等。
- 需要满足什么硬约束：可走路线、出生点、坡度、构图和资源预算。

Agent 不需要知道 Babylon Mesh、Havok Handle、渲染循环或角色控制器的内部实现。

Schema 分成两层：

- **Canonical Schema**：完整且稳定的 SDK 协议，是语义真相。
- **AI Schema Profile**：根据当前任务和模型能力裁剪出的简化版本。

任何模型输出都必须重新通过 Canonical Schema 和语义校验，模型的“结构化输出成功”不等于场景正确。

### 3.2 SDK 内部使用三个核心积木

1. **Entity**：世界中独立存在的对象，例如人物、飞龙、剑、灯塔。
2. **Capability**：对象能做什么，例如行走、飞行、骑乘、攻击。
3. **Relationship**：对象之间的逻辑关系，例如人物骑在飞龙上、剑装备在人物右手。

人物、坐骑和武器保持为独立 Entity，通过 Relationship 组合。渲染层再根据关系把模型挂到对应骨骼或 Socket 上。

这样设计后：

- 人物可以更换成人、儿童或其他模型。
- 同一个人物可以骑马、骑龙或不骑坐骑。
- 武器可以装备、收起、掉落或转交其他主体。
- 新增能力主要增加 Capability 和配置，不需要不断修改人物这个基础节点。

扩展性来自“稳定实体 + 能力 + 关系 + 明确生命周期”，而不是把所有东西永久嵌套在人物节点下面。


### 3.3 可评审的 Schema 顶层结构

下面是第一版 AuthoringSpec 的协议骨架。它不是伪代码式的概念图，而是计划冻结为 JSON Schema 的真实层级：

```ts
interface AuthoringSpecV1 {
  kind: "worldkit-authoring-spec";
  schemaVersion: 1;
  id: string;
  seed: number;

  provenance: ProvenanceSpec;
  world: WorldSpec;
  resources: ResourceCatalogSpec;
  nodes: readonly WorldNodeSpec[];
  relationships: readonly RelationshipSpec[];
  rules: readonly RuleSpec[];
  startup: StartupSpec;
  constraints: ConstraintSpec;
}
```

| 顶层字段 | 负责表达什么 | 不应该放什么 |
|---|---|---|
| `provenance` | 用户 Prompt、参考图、可见证据、推断和生成来源 | Runtime 对象、模型私有上下文 |
| `world` | 单位、坐标、世界边界、重力、环境和资源预算 | 具体 Babylon Scene 配置 |
| `resources` | Prototype、模型、Rig、AnimationSet 和内容寻址资产 | 世界实例状态 |
| `nodes` | 世界中有稳定 ID 的实体实例 | Rule、计时器和无空间状态 |
| `relationships` | 所有权、装备、骑乘、控制等类型化逻辑边 | 通用 `parentId` 或渲染父子关系 |
| `rules` | Trigger、Action Invocation、Objective、Timer 和状态规则 | 动画 Clip 内部实现 |
| `startup` | Spawn、初始控制主体和开场相机 | 运行过程中的临时状态 |
| `constraints` | 路线、坡度、构图、语义锚点、性能和资源 Gate | 仅供参考、不参与验收的描述 |

这些桶的边界很重要。它们决定 Agent 能否准确定位修改，也决定 Compiler 能否只重新编译受影响部分。

#### 3.3.1 Schema 命名约定

公共字段以“AI 不需要结合上下文猜类型”为标准：

| 后缀/字段 | 固定含义 | 示例 |
|---|---|---|
| `id` | 当前对象自身 ID | `id: "player"` |
| `...EntityId` / `...ControllerId` / `...SlotId` | World 内本地对象 ID | `riderEntityId`、`controllerId`、`slotId` |
| `...Ref` | Registry、Package 或内容寻址资源引用 | `kitRef`、`prototypeRef`、`rigRef` |
| `schemaVersion` | 当前 JSON 协议结构版本 | Relationship、AuthoringSpec、ChangeSet |
| `version` | Registry 定义资源的版本 | Kit、Capability、ActionDefinition |
| `...Mode` | 当前互斥状态 | `locomotionMode`、`cameraMode` |
| `...Model` | 实现算法族 | `locomotionModel` |
| `...Policy` | 选择、权限、回退或转移规则 | `controlTransferPolicy` |
| 单位后缀 | 数值的物理单位或坐标域 | `rangeMeters`、`targetTick`、`centerXZ`、`cropUv` |

`kind` 用于节点和持久化定义的判别 Union；`type` 用于 Command、Event、Relationship 和 Change Operation。Canonical Schema 与 AI Schema Profile 保持同名，Provider Adapter 不得再次发明别名。

命名参考 [JSON Schema 的 `$id`/`$ref`](https://json-schema.org/understanding-json-schema/structuring)、[OpenAPI 的显式 discriminator](https://spec.openapis.org/oas/v3.0.4.html#discriminator-object)、[Kubernetes 的 `apiVersion`/`kind`](https://kubernetes.io/docs/reference/kubernetes-api/definitions/api-resource-v1-meta/) 和 [Unreal Engine 的 Controller/Possession](https://dev.epicgames.com/documentation/en-us/unreal-engine/controllers-in-unreal-engine)，但不照搬任何单一协议。项目自己的适配原则是：保留行业熟悉词汇，增加一致后缀表达类型与单位，并禁止同义字段并存。

### 3.4 节点、能力和关系的结构

`WorldNodeSpec` 只保留少量稳定节点种类，具体差异交给 Prototype、Component 和 Capability：

```ts
type WorldNodeKind =
  | "subject"
  | "terrain"
  | "water"
  | "object"
  | "volume"
  | "path"
  | "anchor"
  | "camera"
  | "spawner"
  | "environment";

interface WorldNodeSpec {
  id: string;
  kind: WorldNodeKind;
  prototypeRef?: ResourceRef;
  transform?: {
    positionMeters: [number, number, number];
    rotationEulerRadiansXYZ?: [number, number, number];
    scale?: [number, number, number];
  };

  kitRef?: ResourceRef;
  components?: Record<string, JsonValue>;
  capabilities?: readonly CapabilityInstanceSpec[];
  tags?: readonly string[];

  // 只在节点 Schema 明确允许时出现的 AI 简写
  loadout?: Record<string, NestedEntitySpec>;
  initialInventory?: readonly NestedEntitySpec[];
  initialMount?: NestedEntitySpec;
}

interface CapabilityInstanceSpec {
  id: CapabilityInstanceId;
  capabilityRef: ResourceRef;
  enabled: boolean;
  config: JsonValue;
  activationGroupId?: string;
  providerBindings?: Record<CapabilityRequirementId, CapabilityInstanceId>;
}

interface RelationshipSpecBase {
  id: RelationshipId;
  type: RelationshipType;
  schemaVersion: number;
}

interface MountedOnRelationshipSpec extends RelationshipSpecBase {
  type: "mountedOn";
  riderEntityId: EntityId;
  mountEntityId: EntityId;
  seatId: SeatId;
}

interface EquippedAtRelationshipSpec extends RelationshipSpecBase {
  type: "equippedAt";
  itemEntityId: EntityId;
  wearerEntityId: EntityId;
  slotId: EquipmentSlotId;
}

interface RelationshipManifest {
  type: string;
  version: number;
  endpoints: readonly {
    role: string;
    allowedNodeKinds: readonly WorldNodeKind[];
    cardinality: "one" | "optional" | "many";
  }[];
  fieldsSchema: JsonSchema;
  conflicts?: readonly string[];
  deletePolicy: "reject" | "cascade" | "detach";
}

interface ActionDefinition {
  id: string;
  version: number;
  category: "locomotion" | "interaction" | "gameplay";
  parametersSchema: JsonSchema;
  requires: readonly string[];
  authority: "simulation";
  interruptPolicy: string;
  completion: JsonValue;
  effects?: readonly JsonValue[];
}

```

`RelationshipSpec` 是按 `type` 判别的 Union，每种关系使用业务角色端点，例如 `riderEntityId/mountEntityId` 或 `itemEntityId/wearerEntityId`；`RelationshipManifest` 和 `ActionDefinition` 属于版本化 Registry。前者规定端点角色、允许连接的实体、基数、字段和删除策略，后者规定动作参数、前置条件、权威来源和完成条件。AuthoringSpec 只能引用 Registry Lock 中允许的版本，不能内嵌任意执行代码。


首批节点分类的含义如下：

| kind | 例子 | 主要扩展方式 |
|---|---|---|
| `subject` | 人、动物、飞龙、NPC | Body/Rig/Visual Profile、控制权和 Capability |
| `terrain` | 平原、丘陵、岛屿 | Terrain Source、约束和 Compiler Profile |
| `water` | 海、湖、河 | Surface、Boundary、Volume 和水体能力 |
| `object` | 塔、墙、门、箱子、剑 | Prototype、物理模式、交互/破坏能力 |
| `volume` | Trigger、伤害区、检查点 | 形状、过滤条件和进入/离开规则 |
| `path` | 道路、巡逻线、飞行路线 | 路线点、宽度、坡度和用途 |
| `anchor` | Spawn、交互点、构图点 | 稳定空间位置和语义 |
| `camera` | 第一人称、第三人称、俯视、开场镜头 | Camera Rig、目标、控制与上下文切换 Profile |
| `spawner` | NPC、道具生成点 | Prototype、数量和生成规则 |
| `environment` | 天空、雾、重力、光照 | 世界级环境 Component |

我们有意不为“塔、墙、门、剑”分别增加基础节点类型。它们都是 `object`，差异由 Prototype、Component、Capability 和 Semantic Tag 表达。否则基础类型会随着业务不断膨胀，AI 也更难选择。

### 3.5 一个可运行世界的代表性 JSON

下面的例子展示 Canonical AuthoringSpec 期望表达的关系。为便于评审，资源细节和地形控制数据做了缩写，但节点、能力和关系的边界与正式方案一致：

```json
{
  "kind": "worldkit-authoring-spec",
  "schemaVersion": 1,
  "id": "sunlit-dragon-bay",
  "seed": 1024,
  "provenance": {
    "userPrompt": "A playable coastal bay with a lighthouse, a humanoid and a rideable dragon.",
    "referenceImages": [
      {
        "assetRef": "asset://sha256/reference-image",
        "evidenceClass": "reference-visible"
      }
    ]
  },
  "world": {
    "units": "meters",
    "coordinateSystem": "right-handed-y-up-minus-z-forward",
    "bounds": {
      "minimumXYZ": [-300, -20, -250],
      "maximumXYZ": [300, 180, 250]
    },
    "gravityMetersPerSecondSquaredXYZ": [0, -9.81, 0],
    "resourceBudget": {
      "maxNodes": 5000,
      "maxColliders": 2000,
      "maxPackageBytes": 268435456
    }
  },
  "resources": {
    "prototypes": [
      {
        "id": "adventurer-adult",
        "version": 1,
        "bodyProfileRef": "humanoid.adult@1",
        "rigProfileRef": "humanoid.biped@1",
        "animationSetRef": "adventurer.base@1"
      },
      {
        "id": "rideable-dragon",
        "version": 1,
        "bodyProfileRef": "dragon.medium@1",
        "rigProfileRef": "dragon.standard@1",
        "animationSetRef": "dragon.flight@1"
      },
      {
        "id": "iron-sword",
        "version": 1,
        "visualRef": "asset://sha256/iron-sword-model"
      }
    ]
  },
  "nodes": [
    {
      "id": "player",
      "kind": "subject",
      "prototypeRef": "package://prototype/adventurer-adult",
      "kitRef": "humanoid.switchable-view@1",
      "transform": {
        "positionMeters": [0, 2, 42],
        "rotationEulerRadiansXYZ": [0, 3.141592653589793, 0]
      }
    },
    {
      "id": "dragon-1",
      "kind": "subject",
      "prototypeRef": "package://prototype/rideable-dragon",
      "kitRef": "dragon.mountable-flight@1",
      "transform": {
        "positionMeters": [12, 3, 35],
        "rotationEulerRadiansXYZ": [0, 3.141592653589793, 0]
      }
    },
    {
      "id": "sword-1",
      "kind": "object",
      "prototypeRef": "package://prototype/iron-sword",
      "components": {
        "physics": {
          "mobility": "dynamic"
        },
        "semantic": {
          "classId": "weapon.sword"
        }
      }
    },
    {
      "id": "player-view",
      "kind": "camera",
      "components": {
        "cameraRig": {
          "defaultRigRef": "camera.third-person.standard@1",
          "allowedRigRefs": [
            "camera.first-person.standard@1",
            "camera.third-person.standard@1",
            "camera.third-person.flight@1"
          ],
          "target": {
            "entityId": "player",
            "socketId": "camera-root"
          },
          "manualSwitchAllowed": true,
          "contextBindings": [
            {
              "id": "mounted-flight",
              "when": { "allTags": ["locomotion.mounted", "locomotion.flight"] },
              "rigRef": "camera.third-person.flight@1",
              "targetPolicy": "controlled-entity",
              "priority": 100
            }
          ]
        }
      }
    },
    {
      "id": "terrain-main",
      "kind": "terrain",
      "components": {
        "terrain": {
          "sourceRef": "asset://sha256/elevation-band-source",
          "compilerProfileRef": "coastal-hills@1"
        }
      }
    },
    {
      "id": "bay-water",
      "kind": "water",
      "components": {
        "water": {
          "levelMeters": 0,
          "boundaryRef": "asset://sha256/bay-boundary"
        }
      }
    },
    {
      "id": "lighthouse",
      "kind": "object",
      "prototypeRef": "coastal-lighthouse@1",
      "transform": {
        "positionMeters": [118, 22, -74]
      },
      "components": {
        "physics": {
          "mobility": "static",
          "collider": "compound"
        },
        "semantic": {
          "classId": "landmark.lighthouse",
          "importance": "primary"
        }
      }
    },
    {
      "id": "spawn-main",
      "kind": "anchor",
      "transform": {
        "positionMeters": [0, 2, 42],
        "rotationEulerRadiansXYZ": [0, 3.141592653589793, 0]
      },
      "components": {
        "semantic": {
          "classId": "spawn"
        }
      }
    }
  ],
  "relationships": [
    {
      "id": "sword-owned-by-player",
      "type": "ownedBy",
      "schemaVersion": 1,
      "itemEntityId": "sword-1",
      "ownerEntityId": "player"
    },
    {
      "id": "sword-equipped-right-hand",
      "type": "equippedAt",
      "schemaVersion": 1,
      "itemEntityId": "sword-1",
      "wearerEntityId": "player",
      "slotId": "right-hand"
    }
  ],
  "rules": [
    {
      "id": "mount-dragon-interaction",
      "kind": "interaction",
      "actionRef": "mount@1",
      "actorEntityId": "player",
      "targetEntityId": "dragon-1",
      "conditions": {
        "maxDistanceMeters": 3
      }
    }
  ],
  "startup": {
    "spawnAnchorId": "spawn-main",
    "controlledEntityId": "player",
    "cameraEntityId": "player-view"
  },
  "constraints": {
    "primaryRoutes": [
      {
        "id": "spawn-to-lighthouse",
        "fromEntityId": "spawn-main",
        "toEntityId": "lighthouse",
        "maxSlopeDegrees": 35
      }
    ],
    "composition": {
      "requiredEntityIds": ["player", "bay-water", "lighthouse"]
    }
  }
}
```

这个例子有几个需要评审的关键点：

- 人物、飞龙和剑都是同级 Entity，不依赖永久父子嵌套。
- `equippedAt` 是装备逻辑真相，Runtime 根据它派生剑在 `hand-r` Socket 上的渲染挂载。
- 飞龙的可骑乘和飞行能力来自 Kit/Capability；真正上坐骑时通过 `mountedOn + possessedBy` 事务改变状态。
- Camera 是独立 View Entity；第一/第三人称共享同一个人物、武器、动作和物理状态，骑乘后只按已提交的 Gameplay Context 更换 Rig 与目标。
- 地形 Source 是 Authoring Input；Compiler 生成的权威 Heightfield 才供 Mesh 和 Collider 使用。
- Rule 引用稳定 Semantic Action，而不是直接指定动画 Clip。
- 路线和构图属于阻断式 Constraint，不只是 Prompt 描述。

### 3.6 AI 简写与 Canonical 结构的关系

为了降低 Agent 输出长度，AI Schema Profile 可以允许一层受控嵌套：

```json
{
  "id": "player",
  "kind": "subject",
  "kitRef": "humanoid.third-person@1",
  "loadout": {
    "right-hand": {
      "id": "sword-1",
      "kind": "object",
      "prototypeRef": "iron-sword@1"
    }
  }
}
```

Normalizer 必须把它展开为稳定的同级结构：

```text
Node: player
Node: sword-1
Relationship: sword-1 --ownedBy--> player
Relationship: sword-1 --equippedAt(slot=right-hand)--> player
```

只有 Schema 注册过的 `loadout`、`initialInventory`、`initialMount` 等字段可以使用这种简写；默认最多嵌套一层。更复杂的结构直接使用 `nodes + relationships`。任意 JSON 父子关系不会自动产生所有权、Transform 或生命周期语义。

Canonical Schema 保留完整语义；AI Schema Profile 只暴露当前任务需要的节点、Kit、Capability、Action 和 Relationship。例如“海湾步行场景”不需要向模型暴露飞行、车辆、联网和室内相关分支。Provider Adapter 可以继续适配各模型的结构化输出限制，但输出最终必须回到同一 Canonical Schema。

### 3.7 Kit、Capability、Action 分别解决什么问题

| 概念 | 解决的问题 | 示例 |
|---|---|---|
| Kit | 给 AI 的大积木，快速获得一组经过验证的能力 | `humanoid.third-person@1` |
| Capability | 可独立配置、安装和测试的能力 | `locomotion.ground@1`、`locomotion.flight@1` |
| ActionDefinition | 稳定的语义动作及其参数、前置和完成条件 | `mount@1`、`attack.light@1` |
| AnimationBinding | Action 在某个 Rig/状态下使用什么动画表现 | 持剑 `run` → `Run_With_Sword` |
| Relationship | 多个实体当前如何组合 | `mountedOn`、`equippedAt` |

Kit 和 Capability 是两级 API：常见场景优先使用 Kit，特殊场景再追加或覆盖 Capability。只使用 Kit 会导致组合爆炸；只暴露细粒度 Capability 又会让 AI 输出过长、依赖容易配错。

ActionDefinition 由版本化 Registry 提供，AuthoringSpec 中的 Rule 或外部命令只引用 Action ID 和参数。动画资源不能决定攻击是否命中、骑乘是否完成等权威结果。

### 3.8 Schema 评审需要回答的问题

1. `provenance / world / resources / nodes / relationships / rules / startup / constraints` 的顶层分区是否足够清楚，是否存在职责重叠？
2. 十种基础 `WorldNodeKind` 是否过多或过少？新增塔、门、车辆时能否主要依靠 Component/Capability，而不是继续增加 kind？
3. “常用 Kit + 高级 Capability”两级接口是否适合上游 Agent？
4. 人物、坐骑、武器使用同级 Entity + Relationship，是否能覆盖预期的装备、转移、骑乘和控制权变化？
5. 一层受控嵌套作为 AI Authoring Sugar、进入 Compiler 前完全展开，是否是可接受的复杂度折中？
6. ActionDefinition 放在 Registry，世界只引用稳定 Action ID，是否满足动作持续扩展和资源替换？
7. 地形图像只作为 Source、权威 Heightfield 由 Compiler 生成，是否满足参考图还原和物理可靠性？
8. Constraint 是否覆盖首批必须阻断的问题：Spawn、路线坡度、水域、地标平台、构图和资源预算？
9. Camera 使用独立节点、判别式 Rig Profile 与 Context Binding，是否能覆盖第一/第三人称、骑乘/飞行和自动截图？


## 4. 动作如何组合

`run`、`attack`、`mount` 这类动作首先是 Gameplay 语义，不是某个动画文件名。

例如人物执行 `run`：

- 空手时选择空手跑动表现。
- 持剑时选择持剑跑动表现。
- 骑龙时由当前控制模式解析为坐骑移动或飞行动作。

动作结果由固定 Tick 的游戏状态决定，动画只负责表现。即使缺少“持剑攻击”专用动画，SDK 也必须按声明的降级规则运行或给出明确错误，不能让 Gameplay 永久卡住。

这使动作资源可以持续增加，同时保持上层动作 ID 稳定。

## 5. 地形为什么需要单独的编译链路

图片非常适合表达海湾、山脊、岛屿和高低关系，但图片不能直接成为权威物理地形。

推荐链路是：

```text
参考图
  ↓
AI 生成宏观地形规划图或结构控制数据
  ↓
SDK 解析语义区域、色带、路线和约束
  ↓
确定性 Terrain Compiler
  ↓
权威 Heightfield + Semantic Mask
  ↓
同一份高度数据生成 Mesh、碰撞和调试图
```

关键原则：

- AI 图片负责表达宏观意图，不直接决定最终碰撞高度。
- 路线、出生点、水域和地标平台属于结构化硬约束。
- Mesh 和物理 Collider 必须来自同一份权威 Heightfield。
- 图片模型、专业地形工具和具体 Runtime 都是可替换实现，不进入公共 Schema。

## 6. 不同人称相机如何设计

核心结论：**Camera 是独立 View Entity，人物只是 Camera 的跟随目标。** 第一人称、第三人称、俯视、环绕和过场镜头由不同 `CameraRigProfile` 表达；它们可以观察同一个人物，但不会成为人物 Gameplay 状态的一部分。

这样设计后，切换人称只是切换当前 View Session 的 Active Rig：不复制人物，不重新装备武器，不改变 Collider、Position、Possession 或动作状态。人物骑上飞龙后，Camera Director 再根据已经提交的 `locomotion.mounted + locomotion.flight` Context 切到飞行镜头；下坐骑时恢复玩家在步行 Context 中偏好的视角。

### 6.1 Schema 结构

```ts
interface CameraNodeConfig {
  defaultRigRef: ResourceRef;
  allowedRigRefs: readonly ResourceRef[];
  target: {
    entityId: EntityId;
    socketId?: RigSocketId;
  };
  contextBindings?: readonly CameraContextBinding[];
  manualSwitchAllowed: boolean;
}

type CameraRigProfile = CameraRigProfileBase &
  (
    | { mode: "first-person"; firstPerson: FirstPersonCameraSpec }
    | { mode: "third-person"; thirdPerson: ThirdPersonCameraSpec }
    | { mode: "top-down"; topDown: TopDownCameraSpec }
    | { mode: "orbit"; orbit: OrbitCameraSpec }
    | { mode: "cinematic"; cinematic: CinematicCameraSpec }
  );
```

这里使用判别式 Union：`mode = first-person` 时只能出现第一人称配置，`mode = third-person` 时只能出现第三人称配置。这样 AI 不需要理解一大组互相冲突的开关，也不会同时生成“眼睛位置”和“第三人称跟随臂距离”。

普通 Agent 可以直接使用 `humanoid.first-person@1`、`humanoid.third-person@1` 或 `humanoid.switchable-view@1` Kit；Normalizer 会把简写展开为上文完整 JSON 中的 `player-view` Camera 节点、Registry Profile 和目标绑定。高级 Agent 才需要直接配置 Rig。

### 6.2 第一人称与第三人称的边界

| 关注点 | 第一人称 | 第三人称 |
|---|---|---|
| 视点 | Rig 的 `eye/camera` Socket；缺失时使用 BodyProfile 声明的眼高 | Subject 后方的 Target + Camera Boom |
| 人物显示 | 可仅对当前 View 隐藏头部或上身；人物实体仍存在 | 完整显示人物 |
| 武器 | 默认复用同一权威武器；可添加只负责显示的 View Model | 显示同一武器的 World Model |
| 防穿模 | 约束头部到近裁剪面的空间，防止穿墙观察 | 对 Camera Boom 做 Ray/Shape Cast，遇障碍缩短距离 |
| Gameplay | Camera Direction 可在固定 Tick 转成移动/瞄准 Intent | 同样产生显式 Intent；视觉插值不进入 Gameplay Hash |

Head Bob、镜头平滑、遮挡物淡化和第一人称 View Model 都只属于 Presentation。它们不能复制伤害状态、库存或碰撞体，也不能让不同 Camera 看见不同的 Gameplay 世界。

### 6.3 切换、骑乘和自动化

手动切换通过幂等 `view.set-mode` Command 完成，普通调用方传入 `mode`，Camera Director 在当前 Context 中解析对应的 `allowedRigRefs`；高级创作/测试调用才使用 `view.set-rig + rigRef` 指定精确 Rig。Runtime 准备资源后在 Camera/Render 同步点原子切换，并返回 `ViewReceipt + CameraSnapshot`。失败时继续使用原镜头。

Context Binding 负责自动切换：步行时可以保留第一/第三人称偏好；骑乘或飞行时切到更远的 `camera.third-person.flight@1`；下坐骑后恢复偏好。Camera 只读取已提交的骑乘与控制权状态，不参与 Mount Transaction，避免两边互相看到半完成状态。

Browser Protocol 对 Playwright 或其他程序公开：

- `listCameraRigs()`：查询可用 Rig。
- `getCameraSnapshot()`：读取当前模式、目标、Yaw、Pitch、距离和 FOV。
- `setCameraMode()`：在允许范围内切换人称。
- `setCameraPose()`：仅在声明为可外部控制的测试/创作构建中设置镜头。
- `captureFrame()`：等待 View Receipt 和下一帧 Render Ready 后再截图，不依赖固定延时。

评审时需要确认三点：Camera 是否应保持独立 Entity；第一版是否正式交付第一/第三人称切换；骑乘/飞行是否允许由 Context Binding 自动覆盖玩家步行视角。

## 7. 为什么选择 Babylon + Havok

第一版 Runtime 推荐 Babylon，物理默认 Havok，但两者都放在 Adapter/Port 后面，不进入 AuthoringSpec。

选择原因：

- Babylon 更接近完整 Web 游戏引擎，具备场景、资源、动画、骨骼、渲染和调试体系。
- Havok 提供角色控制、Heightfield、Raycast 和通用碰撞能力。
- 浏览器 Runtime 天然适合 CLI、Playwright、截图和其他程序自动控制。

这不是承诺未来永远只支持 Babylon。真正需要冻结的是引擎无关的 AuthoringSpec、NormalizedWorldIR、PhysicsPort 和 Browser Protocol。

## 8. SDK 如何被其他程序调用

SDK 提供三种正式交付面：

- **TypeScript API**：给 Node.js/TypeScript 程序直接调用。
- **无状态 CLI**：给 Python、Go、Java 和 Agent 服务通过 JSON/NDJSON 调用。
- **Browser Protocol**：给 Playwright 或宿主程序移动主体、执行动作、查询状态和获取截图。

浏览器控制协议默认不在普通生产页面中开放。测试或受信宿主需要通过 Session、Scope 和短期凭证获得 `observe`、`control`、`capture` 或 `load` 权限。

## 9. 生产级设计中最重要的保障

### 确定性

- 相同 AuthoringSpec、Registry Lock 和 Seed 应产生相同的规范化结果和 Package Hash。
- 物理重放在锁定 Runtime、WASM 和平台类别内按容差验收。
- 视觉结果不笼统承诺跨设备像素完全一致；同一冻结 Capture Profile 可以像素级比较，跨 Profile 比较语义区域、Instance ID、Anchor 和容差指标。

### 可诊断和可修复

错误必须包含稳定错误码、JSON Pointer、相关实体 ID、实际值、期望值和机器可读修复建议。

Agent 使用带 `baseAuthoringSpecHash` 的 WorldChangeSet 修复场景；修改在隔离候选中重新编译并通过 Gate 后才原子发布，失败不产生半成品。

### 可审计和可发布

WorldPackage 保存规范化世界、资源、Runtime Target、版本锁和完整性清单。所有 Hash 都明确自己对应的对象，发布签名使用版本化 Canonical Envelope，避免字符串拼接歧义。

### 生命周期和资源所有权

Capability、System、Collider、Asset 和 Browser Session 都有明确 Owner 和幂等 Dispose。动态安装坐骑、武器或能力时采用 prepare/commit/rollback 事务，避免出现只挂了一半的状态。

## 10. 第一阶段明确不做什么

第一阶段目标是可玩的室外 Heightfield 世界，不把以下能力假装成已经支持：

- 室内空间、洞穴、悬崖下方和复杂 Overhang。
- 完整 NPC 行为、战斗 AI 和任务系统。
- 车辆驾驶和联网同步。
- 最终材质、影视级光照和生成式实时渲染。

这些能力未来可以沿 Entity、Capability、Relationship 和 Port 扩展，但不应阻塞第一条生产链路。

## 11. 本次评审需要确认的七个决定

| 决策 | 推荐结论 | 评审重点 |
|---|---|---|
| AI 正式输出 | 接受 AuthoringSpec，不让 Agent 直接写 Runtime 代码 | Schema 是否足以表达目标世界 |
| 组合模型 | 接受 Entity + Capability + Relationship | 坐骑、武器和动作是否能自然扩展 |
| 编译边界 | 接受 AuthoringSpec → NormalizedWorldIR → Runtime | 引擎细节是否被正确隔离 |
| 第一版 Runtime | 接受 Babylon + Havok，并保留 Port | 是否满足 Web、物理和自动化需求 |
| 地形路线 | 接受“生成式规划输入 + 确定性编译” | 是否兼顾图片理解能力和物理可靠性 |
| 多视角 Camera | 接受独立 Camera Entity + 判别式 Rig + Context Binding | 第一/第三人称和骑乘/飞行切换是否保持同一 Gameplay 世界 |
| 实施顺序 | 先做 Phase 0 技术探针，再冻结协议 | 高风险能力是否都有明确通过标准 |

## 12. 主要风险与处理方式

| 风险 | 影响 | 当前处理方式 |
|---|---|---|
| Schema 过于复杂，AI 难以稳定输出 | Agent 成功率下降 | AI Schema Profile、Kit、枚举裁剪、结构化 Diagnostic |
| LEGO 组合导致运行时状态复杂 | 动态装备/骑乘出现半状态 | Capability/Relationship 事务与 Ownership Ledger |
| 单张图片无法恢复唯一 3D 世界 | 隐藏区域和尺度存在歧义 | 区分可见证据、用户事实和推断延伸 |
| 地形生成漂亮但不可玩 | 路线、出生点和坡度失败 | 权威 Heightfield、Gameplay Constraint 和阻断 Gate |
| Web 物理和截图存在平台差异 | 重放或视觉测试不稳定 | 锁定 Profile、分层确定性承诺、Phase 0 探针 |
| 不同人称各自复制人物或武器状态 | 库存、命中和截图语义不一致 | 单一 Gameplay Entity；Camera 仅切换 View Rig 和 Render Binding |
| 第一版范围持续膨胀 | 无法形成生产闭环 | 先完成室外地形 + 主体 + 关键物件的 Vertical Slice |

## 13. 建议的评审结论模板

评审结束时，请明确记录：

1. 总体架构：接受 / 修改后接受 / 拒绝。
2. AuthoringSpec 与 Runtime 边界：是否接受。
3. Entity、Capability、Relationship 组合模型：是否接受。
4. Babylon + Havok 第一版选型：是否接受。
5. 地形编译路线：是否接受。
6. 独立 Camera Entity、第一/第三人称切换与骑乘 Context 策略：是否接受。
7. Phase 0 探针清单和通过标准：是否足以支持协议冻结。
8. 阻塞开发的问题、负责人和截止时间。

完整接口、Schema、确定性协议、地形算法和实施阶段以仓库中的总体设计、地形子规格、ADR-0006 与 Phase 0 探针计划为准。
