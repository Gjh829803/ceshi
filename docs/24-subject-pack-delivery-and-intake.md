# 新主体套餐交付与接入说明

本文供资产制作同事和 SDK 接入同事共同使用。目标是让一个新主体完成一次规范交付后，能够被当前 Subject Registry、WorldPackage、Babylon Runtime、Studio 和 Block Builder Agent 共同发现和使用。

## 先说结论

一个“主体套餐”不是一个随便导出的模型文件。完整交付至少包括：

1. 一个不可变版本的自包含 GLB；
2. 明确的坐标、尺寸、正面、支点、碰撞体和许可证信息；
3. 如果需要动画：一个确定的骨架、Bind Pose、语义骨骼表，以及绑定到同一骨架的动作；
4. 结构检查、浏览器渲染和人工方向检查证据；
5. 一次 Registry、Resolver、Agent Catalog 和端到端测试接入。

资产方不需要实现移动算法、相机算法或输入代码。主体外观、骨骼和动作属于 Subject Pack；走路、飞行等行为由 Motion Pack 选择；第一人称、第三人称、过肩和巨物视角由 Camera Pack 选择。

当前仓库还没有“复制一个目录后自动注册任意新主体”的通用命令。只有当本文“SDK 接入清单”全部完成后，这个主体才算已经直接进入系统，而不是仅仅把 GLB 放进了仓库。

职责边界如下：

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 资产制作/导出 | 最终 GLB、Rig、动作、来源、许可证、结构和视觉 QA | Motion/Camera/Input/Runtime 代码 |
| SDK 接入 | Registry、Resolver、WorldPackage、Fixture、Verifier、Agent Catalog | 擅自修改资产字节或猜骨骼语义 |
| 产品评审 | 是否公开、推荐级别、视觉/交互接受结论 | 用“看起来可以”替代自动化证据 |

## 1. 先判断走哪条交付路径

| 需求 | 交付路径 | 当前结果 |
| --- | --- | --- |
| 只需要一个完整外形，不需要模型自带动画 | Static Subject Pack | 最简单；可以作为 Assembly 基础主体并选择系统已有 Motion/Camera Pack |
| 需要人形 idle、walk、run、jump 等动作 | Rigged Biped Subject Pack | 支持；必须是单骨架、同一 Rig、in-place 动作 |
| 只是给现有主体加飞剑、板、翼、武器平台等刚性大附件 | 不新增主体套餐 | 在 Block World 中复用已有 Subject Pack，再画刚性 Subject Mesh 附件 |
| 自绘几个 box/sphere/cylinder 就够了 | 不新增主体套餐 | 直接使用 custom Mesh base；无需资产接入 |
| 需要新的非人形动画骨架 | Capability Gap | 当前 Runtime 只有正式 biped 语义 Rig 合同，不能伪装成人形导入 |
| 一个主体里需要两个独立动画骨架 | Capability Gap | 当前一个 Rigged Subject 只允许一个 Skeleton；应拆为单 Rig 加刚性附件，或先实现 multi-Rig 能力 |
| 外观看起来像车、船或飞行器，希望自动获得对应行为 | 不成立 | 外观不产生能力；接入后由已实现的 Motion Pack 决定行为 |

不要为了“更像”而新建套餐。换衣服、颜色、头发、普通手持武器等外观变化优先交给后续视觉生成；只有需要复用的完整模型、独立体型、Rig、动作集或产品级身份才值得进入 Registry。

## 2. 所有 GLB 的共同硬性要求

最终 Runtime GLB 必须满足：

- 文件格式是自包含的 GLB 2.0，媒体类型为 `model/gltf-binary`；
- 1 unit = 1 meter；
- `+Y` 是上方，主体正面朝 `-Z`；
- 原点是 `support-center`：X/Z 位于主体支撑中心，最低可见支撑点接近 `Y=0`；
- 所有位置、法线、索引、矩阵和动画采样值有限；
- 使用 indexed triangle mesh，并提供准确的 mesh、vertex、triangle、material、texture、skeleton、bone 和 animation 数量；
- 不引用外部 buffer、图片或文件路径；需要的纹理必须内嵌；
- 不包含 Runtime 不消费的 Camera、Light、Audio、脚本或未知行为扩展；这些内容如需保留，只能放入 `extensions/source-archive/`，并标记 `runtimeConsumption: "forbidden"`；
- 交付后不再原地覆盖字节。模型、Rig、Bind Pose、动作或材质发生变化时发布新版本。

不能在 Subject Definition 里用旋转、缩放或位置补偿来掩盖错误的单位、朝向或 Pivot。应回到 DCC/Unity 导出源修正，再把新 GLB 作为新版本重新验收。

如果来源是 Unity：

- 以配置完成的 Prefab 为权威，不要直接导出裸 FBX；Prefab 才包含启用的 Mesh、材质、Animator/Avatar 和附件状态；
- 人形动作先在 Unity 中 Retarget/Bake 到目标 Prefab/Avatar，再从同一次目标 Rig 导出；
- 不要把 Unity 导出的角色 GLB 与另一个工具从原始 FBX 转出的动作直接拼接；Skeleton、Bind Pose 和节点路径可能不同。

## 3. 命名与版本规则

为每个来源分配稳定的 `creatorId`，为每个主体分配稳定的 `subjectId`。

推荐格式：

```text
creatorId: acme
subjectId: stone-golem
Registry id: acme.stone-golem
Subject Pack id: acme.stone-golem
```

规则：

- 全部使用小写英文、数字、点或连字符；不要使用空格和临时中文文件名作为公开 ID；
- `id` 表示当前资源自身；Registry 资源使用带种类和版本的 `resourceRef`；
- 第一个版本使用 `@1`，以后只增加版本，不覆盖旧版本；
- 同一个 Definition `id` 同时存在多个版本时，Agent Catalog 会使用 `acme.stone-golem.v1`、`acme.stone-golem.v2` 这样的明确 Pack ID；
- `authoringAvailability: "experimental"` 会让 Agent 只能显式选择；`recommended` 和 `advanced` 可作为普通候选，但是否进入公开默认列表仍是单独的产品决策。

## 4. 资产方交付目录

长期推荐结构如下：

```text
assets/subjects/packages/<creator-id>/<subject-id>/v<source-version>/
├── package.manifest.json
├── model/
│   ├── model.glb
│   └── model.manifest.json
├── materials/default/
│   ├── material-set.manifest.json
│   └── textures/
├── animations/
│   ├── idle/
│   │   ├── clip.glb
│   │   └── clip.manifest.json
│   ├── walk/
│   │   ├── clip.glb
│   │   └── clip.manifest.json
│   ├── run/
│   │   ├── clip.glb
│   │   └── clip.manifest.json
│   └── jump/
│       ├── clip.glb
│       └── clip.manifest.json
├── evidence/
│   ├── front.png
│   ├── right.png
│   ├── back.png
│   ├── browser.png
│   └── qa-report.json
└── extensions/source-archive/
    ├── original.glb
    └── original.manifest.json
```

Static Subject 可以没有 `animations/`。Rigged Subject 必须交付 `model/` 与独立动作；Runtime 使用的自包含 GLB 由接入流程确定性组装，不允许在运行时临时跨文件猜骨架和绑定动作。

现有结构示例是：

- `assets/subjects/packages/seedleap/g-bot/v1/`
- `assets/subjects/packages/seedleap/golden-humanoid/v1/`

可以参考它们的目录和字段，但不要复制其二进制、ID、Hash、许可证或 G Bot 专属骨名。

现有 `assets:subjects:modularize` 只负责 G Bot/Golden 的历史合并 GLB 恢复，并不会扫描和导入任意新目录。新 Rigged 来源必须增加显式 Catalog/admission 路径；在通用产品来源 provenance mode 正式实现前，不得把新资产谎报成 `derived-recovery` 或 `generated-fixture`。

## 5. Static Subject Pack 交付

Static 路径的最终 GLB必须同时满足：

- `skeletonCount: 0`；
- `boneCount: 0`；
- `animationClipCount: 0`；
- `animationClipNames: []`；
- 无 Camera、Light 和外部 URI；
- 有至少一个可渲染三角 Mesh；
- 提供精确 bounds 与经过人工确认的 `-Z` 正面。

Static 不等于“不能移动”。它只是没有模型动画。作为 Subject Assembly 的基础主体后，整个主体仍可选择系统已经实现的地面或动力飞行 Motion Pack；此时模型保持静态姿态。

接入时需要新增三个 Registry 资源：

1. `subject-asset`：锁定 GLB Hash、长度、bounds、inventory 和许可证；
2. `collider-profile`：明确 Character capsule，不从 Runtime mesh bounds 临时推断；
3. schema-v3 `subject-definition`：绑定 Asset、Collider、Socket 和已有能力/Profile。

Static Subject Definition 的关键结构：

```ts
{
  kind: "subject-definition",
  schemaVersion: 3,
  id: "acme.stone-golem",
  version: 1,
  resourceRef: "worldkit://subject-definition/acme.stone-golem@1",
  authoringAvailability: "advanced",
  category: "custom",
  bodyTopology: "custom",
  semanticClassId: "subject.acme.stone-golem",
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center",
  },
  visualParts: [{
    id: "body.asset",
    kind: "asset",
    subjectAssetRef: "worldkit://subject-asset/acme.stone-golem@1",
    localTransform: {
      positionMetersXYZ: [0, 0, 0],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    },
    appearance: { mode: "whitebox-neutral" },
    semanticTags: ["body", "static"],
  }],
  visualBinding: { mode: "static" },
  sockets: [{
    id: "ThirdPersonTarget",
    kind: "local",
    localTransform: {
      positionMetersXYZ: [0, 1.4, 0],
      rotationEulerRadiansXYZ: [0, 0, 0],
    },
    semanticTags: ["camera", "third-person"],
  }],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef: "worldkit://collider-profile/acme.stone-golem@1",
  },
  capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
  profiles: {
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef:
      "worldkit://locomotion-profile/ground.standard@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    allowedControlFeelProfileRefs: [
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    ],
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: [
        "worldkit://motion-profile/safe-ground@1",
      ],
      fallbackMotionProfileRef:
        "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef:
      "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef:
      "worldkit://medium-profile/ground-air.standard@1",
    harnessProfileRef:
      "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef:
    "worldkit://render-binding/subject.standard@1",
  allowedOverridePaths: [
    "profiles.controlFeelProfileRef",
    "profiles.controlProfileRef",
    "profiles.motion.defaultMotionProfileRef",
  ],
  aiMetadata: {
    displayName: "Stone golem",
    description:
      "Static reusable stone golem visual; behavior is selected by the Subject Assembly Motion Pack.",
    semanticTags: ["golem", "static", "stone"],
  },
}
```

上例中的 Profile 应优先复用现有版本。只有确实需要新的手感、碰撞或相机行为时，才单独发起 Profile/Capability 设计，不要为每个模型复制一套参数。

## 6. Rigged Biped Subject Pack 交付

`package.manifest.json` 负责把同一不可变版本的 Model、Material、Rig 和动作闭合起来：

```json
{
  "kind": "subject-source-package",
  "schemaVersion": 1,
  "id": "stone-hero",
  "version": 1,
  "creatorId": "acme",
  "displayName": "Stone Hero",
  "resourceRef": "worldkit://subject-source-package/acme.stone-hero@1",
  "sourceGlbRelativePath": "assets/subjects/packages/acme/stone-hero/v1/extensions/source-archive/original.glb",
  "sourceContentHash": "sha256:<64 lowercase hex>",
  "modelRef": "worldkit://subject-model-asset/acme.stone-hero@1",
  "materialSetRef": "worldkit://material-set/acme.stone-hero.default@1",
  "rigProfileRef": "worldkit://rig-profile/biped.acme-stone-hero@1",
  "sourceArchiveRef": "worldkit://subject-source-archive/acme.stone-hero@1",
  "animationClips": [
    {
      "actionId": "idle",
      "animationClipRef": "worldkit://animation-clip/acme.stone-hero.idle@1"
    },
    {
      "actionId": "walk",
      "animationClipRef": "worldkit://animation-clip/acme.stone-hero.walk@1"
    },
    {
      "actionId": "run",
      "animationClipRef": "worldkit://animation-clip/acme.stone-hero.run@1"
    },
    {
      "actionId": "jump",
      "animationClipRef": "worldkit://animation-clip/acme.stone-hero.jump@1"
    }
  ]
}
```

每个 Ref 必须指向同一 creator/subject/version 闭包；禁止把另一个角色的 Rig 或 Clip 通过改名混入。

### 6.1 Model

`model/model.glb` 只包含：

- Mesh；
- Skin；
- 恰好一个 Skeleton；
- 完整 Bind Pose / inverse bind matrices；
- 稳定的 Material Slots；
- 零 Animation Clip。

所有 Skinned Mesh 必须共享同一个批准 Skeleton，并且包含 `JOINTS_0` 与 `WEIGHTS_0`。禁止多个重复 Skeleton、缺失权重、隐藏的第二套骨架或依赖节点显示名猜 Rig。

### 6.2 当前 biped 语义骨骼表

资产方需要提交以下 17 个语义骨骼到源骨名的精确映射：

```json
{
  "hips": "<source bone>",
  "spine": "<source bone>",
  "chest": "<source bone>",
  "neck": "<source bone>",
  "head": "<source bone>",
  "upper-arm.left": "<source bone>",
  "lower-arm.left": "<source bone>",
  "hand.left": "<source bone>",
  "upper-arm.right": "<source bone>",
  "lower-arm.right": "<source bone>",
  "hand.right": "<source bone>",
  "upper-leg.left": "<source bone>",
  "lower-leg.left": "<source bone>",
  "foot.left": "<source bone>",
  "upper-leg.right": "<source bone>",
  "lower-leg.right": "<source bone>",
  "foot.right": "<source bone>"
}
```

另外单独提供 `skeletonRootBoneName`。如果 Rig Signature 或 Bind Pose 变化，所有动作必须重新验证，不能只更新模型 Hash。

### 6.3 Animation Clip

每个动作单独放在 `animations/<action-id>/clip.glb`，并满足：

- 动作已经绑定和烘焙到这个主体的精确 Rig；
- 动作 GLB 不携带 Mesh、材质和纹理；
- Clip 名与稳定 `actionId` 显式映射，不依赖文件名或 UI 文案猜测；
- Root Motion 必须是 `in-place`；不能通过 Root/Hips 位移偷偷移动主体；
- 同一 Clip 内使用一致、有限的 FPS，推荐 60 FPS；
- Loop 动作首尾不明显跳变；
- One-shot 动作定义明确的 Blend 和结束行为；
- 手腕、肘、脚和持物姿态经过固定帧截图检查。

当前一个可自动地面表现的 Rigged Biped 至少需要：

| actionId | loopMode | 自动表现键 |
| --- | --- | --- |
| `idle` | `repeat` | `locomotion.suspended`, `locomotion.idle` |
| `walk` | `repeat` | `locomotion.walk` |
| `run` | `repeat` | `locomotion.run` |
| `jump` | `once` | `locomotion.takeoff`, `locomotion.rising`, `locomotion.apex`, `locomotion.falling`, `locomotion.landing` |

额外动作只有进入 Animation Set 并获得已实现的语义 Action/状态绑定后，Runtime 才会自动或显式使用。GLB 里“有一个 fly Clip”不代表飞行时会自动播放它。

如果希望实现“人物站在飞剑上飞”，可以让 Assembly 使用 `flight.powered-standard`，同时固定 `locomotion.idle`。资产方不需要再做一套飞行动画，也不需要把剑绑到骨骼。

单个 `clip.manifest.json` 的核心字段示意如下。接入实现还必须按
`scripts/lib/modular-subject-source.ts` 中的 `AnimationClipManifestV1` 补齐经过批准的
`provenance`；下面的占位符不是可直接提交的最终 JSON：

```json
{
  "schemaVersion": 1,
  "kind": "animation-clip",
  "id": "stone-hero.walk",
  "version": 1,
  "resourceRef": "worldkit://animation-clip/acme.stone-hero.walk@1",
  "actionId": "walk",
  "sourceClipName": "walk",
  "rigProfileRef": "worldkit://rig-profile/biped.acme-stone-hero@1",
  "rigSignatureHash": "sha256:<64 lowercase hex>",
  "durationSeconds": 1.0,
  "loopMode": "repeat",
  "playbackSpeedRatio": 1,
  "blendDurationSeconds": 0.15,
  "rootMotionMode": "in-place",
  "artifact": {
    "relativePath": "animations/walk/clip.glb",
    "mediaType": "model/gltf-binary",
    "byteLengthBytes": 123456,
    "contentHash": "sha256:<64 lowercase hex>"
  }
}
```

机器合同以以下类型为准：

- Source Package、Model、Material、Clip、Archive：`scripts/lib/modular-subject-source.ts`；
- Subject Asset、Rig、Animation Set、Collider：`packages/subject-registry/src/types-v2.ts`；
- Subject Definition 与 Motion/Camera/Profile 引用：`packages/subject-registry/src/types-v3.ts`。

### 6.4 Socket

Socket 属于 Subject Definition，不要把原始骨名暴露给 Agent。

推荐至少提供：

- `ThirdPersonTarget`：local Socket，位于主体视觉中部偏上；
- `FirstPersonView`：需要第一人称时，Rigged Biped 可绑定语义 `head` Bone 并增加局部 offset；
- `CameraTarget3D`：可选 local Camera 目标；
- `hand.right`：确有持物语义时才绑定语义手骨；
- `SeatAlignment`：确有坐姿/关系需求时再提供。

Agent 只看到 Socket ID 和语义标签。原始 Bone 名只保存在 Rig Profile 内。

## 7. 许可证与来源信息

每个 Subject Asset 必须明确：

- `licenseSpdxId`；
- `redistributionPolicy`: `allowed`, `internal-only` 或 `prohibited`；
- 作者/创建者；
- 原始来源 ID、原始文件 Hash；
- 使用的导出工具与精确版本；
- 单位、轴向、旋转、缩放、Pivot 和材质处理参数；
- 如果是 Unity，记录 package、Prefab 和 Avatar 路径。

没有明确的再分发授权时，默认使用 `internal-only`。不要复制 G Bot、Golden 或 xier120 的许可证结论。

## 8. 资产方必须提供的 QA 证据

### 8.1 结构证据

- 最终 GLB 的 SHA-256 和 byte length；
- 完整 inventory；
- Static 的零骨架/零动画结论，或 Rigged 的单骨架/Rig Signature/Bind Pose 结论；
- 无外部 URI、Camera、Light 和未知 Runtime 内容；
- 每个 Action Manifest 条目都能映射到真实 Clip；
- Loop、Root Motion、FPS 和 Blend 策略。

### 8.2 视觉证据

- 正、右、背三视图；
- 实际 Babylon 或浏览器加载截图；
- 朝向、单位、脚底/Pivot、材质、蒙皮和 Collider 对位结论；
- Rigged 动作至少包含 idle、一个 locomotion 和一个 one-shot 的固定帧或短视频；
- 动作 QA 的失败/警告帧和处理结果。

### 8.3 人工检查

- Spawn 后不悬空、不穿地；
- 正面确实朝 `-Z`；
- WASD/转向/跳跃或选定 Motion Pack 的实际体验正常；
- 第三人称 Spring Arm、第一人称目标和 Reset 正常；
- 多实例不会共享 Skeleton、动画状态或材质可变状态。

自动结构检查不能替代朝向、Pivot、动作观感和 Collider 对位的人工确认。

## 9. SDK 接入清单

下面由提交接入 PR 的工程师完成。

### 9.1 放置 Runtime 字节

```text
apps/playground/public/subject-assets/<creator-id>/<subject-id>/v<runtime-version>/<subject-id>.glb
```

Rigged Source Package 的 Model 和独立 Clip 先确定性组装成这一份自包含 Runtime GLB。Runtime 不在启动时临时合并动作。

### 9.2 新增独立 Registry 文件

建议每个 creator/batch 使用自己的文件：

```text
packages/subject-registry/src/<creator-id>-resource-manifests.ts
packages/subject-registry/src/<creator-id>-subject-definitions.ts
```

不要把新来源混入 `XIER120_*` 常量，也不要直接堆进 G Bot 专属常量。然后在 `built-in-subject-resource-registry.ts` 中导入并注册：

- Subject Asset；
- Collider Profile；
- Rig Profile（仅 Rigged）；
- Animation Set（仅 Rigged）；
- Subject Definition。

所有引用必须是精确版本 Ref，Registry 会计算资源内容 Hash 并验证完整依赖闭包。

### 9.3 补齐四个 Resolver 入口

当前实现仍有四个必须一致的映射面：

1. `PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1`；
2. `PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1`；
3. `PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1`；
4. `DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1`。

Host URL 必须以 `/subject-assets/` 开头。四个入口最终读取的必须是同一份字节，并与 Registry 中的 Hash 和长度完全一致。只让 Playground 能显示但漏掉 WorldPackage preflight，不算接入完成。

### 9.4 添加 Fixture、Verifier 和证据目录

Rigged 产品主体参考：

```text
examples/product-asset-intakes/<subject-definition-id>@<version>.json
examples/authoring/<subject-id>-world.json
examples/evidence/<subject-id>-world/
scripts/verification/verify-<subject-id>-world.ts
```

Static batch 也必须有自己的命名 verifier；现有 `verify:xier120-subjects` 和 `verify:g-bot-subject` 只证明它们自己的资产，不能作为新资产的通过证书。

### 9.5 生成 Agent Catalog

Registry Definition 和真实 Compiler probe 通过后，运行：

```bash
pnpm tsx scripts/agents/write-agent-authoring-catalog.ts
pnpm generate:agent-self-check
pnpm check:agent-self-check
```

新主体随后会进入 `agent-authoring-catalog.json.subjectPacks`。Catalog 会自动给出：

- Agent 使用的 `subjectPackId`；
- 与真实编译器兼容的 Motion Pack；
- 可固定的 locomotion presentation key；
- 可绑定的 Socket；
- Host 从 Runtime collider 推导的 traversal envelope；
- Agent 选择策略和可搜索语义标签。

若它进入 `unavailableSubjectPacks`，必须修 Registry/Compiler 诊断，不能手改生成的 JSON 把它伪装成可用。

## 10. Agent 最终如何使用新套餐

接入完成后，Agent 不再碰 GLB 路径、骨名和 Registry Ref，只使用 Catalog 中的 Pack ID：

```js
controlledSubject: {
  kind: "assembly",
  entityId: "player",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
  assembly: {
    id: "stone-golem-player",
    baseSubject: {
      kind: "subject-pack",
      subjectPackId: "acme.stone-golem",
    },
    attachments: [],
    motion: {
      motionPackId: "ground.character-standard",
    },
    presentation: {
      kind: "automatic",
    },
  },
},
camera: {
  kind: "pack",
  entityId: "camera-main",
  cameraPackId: "third-person.standard",
  target: {
    kind: "base-subject-socket",
    socketId: "ThirdPersonTarget",
  },
  aspectRatio: 16 / 9,
},
```

没有 Camera Socket 的 Static Pack 可以使用：

```js
target: { kind: "base-subject-bounds", heightRatio: 0.65 }
```

## 11. 最小验收命令

每个新主体应补自己的聚焦测试，然后至少运行：

```bash
pnpm typecheck
pnpm vitest run packages/subject-registry/src/<creator-id>-subjects.test.ts
pnpm vitest run scripts/lib/world-package-resource-resolver.test.ts
pnpm tsx scripts/agents/write-agent-authoring-catalog.ts
pnpm check:agent-self-check
pnpm worldkit registry list --kind subject-definition --json
pnpm worldkit registry describe \
  --resource-ref worldkit://subject-definition/<creator-id>.<subject-id>@1 \
  --json
pnpm worldkit validate examples/authoring/<subject-id>-world.json --json
pnpm worldkit run examples/authoring/<subject-id>-world.json
pnpm test
pnpm build
```

Rigged 资产还要证明：

- idle/walk/run/jump 的 Clip 真实不同；
- 运动与动画解耦；
- 同一输入可确定性重放；
- 两个实例的 Skeleton、Clip、Socket、动作状态互相隔离；
- Reset 恢复 Tick 0、位置、朝向和默认动作；
- Collider、墙碰撞和 Camera target 正常。

## 12. 会被直接拒绝的交付

- 只有 FBX、Blender 工程或 Unity package，没有最终自包含 GLB；
- GLB 使用厘米、Z-up、正面不是 `-Z`，并要求 Runtime 帮忙补偿；
- GLB 引用外部贴图或 buffer；
- Static GLB 偷带 Skeleton 或 Animation；
- Rigged GLB 有多个 Skeleton、缺 `JOINTS_0` / `WEIGHTS_0` 或 Bind Pose 不完整；
- 动作来自另一个未验证 Rig，只因骨名相似就尝试运行；
- 动作用 Root/Hips translation 直接推动主体；
- 没有 Hash、byte length、bounds、inventory 或许可证；
- 直接覆盖已经发布的 `v1` 文件；
- 只添加 Registry，不添加 Resolver；
- 只在 Playground 手工看到模型，没有 WorldPackage、Runtime、渲染和多实例证据；
- 因为模型“看起来会飞/会开”就声明尚未实现的能力；
- 为了让 Agent 看见而手工修改生成的 Agent Catalog。

## 13. 可以直接发给同事的交付要求

```text
请按 docs/24-subject-pack-delivery-and-intake.md 交付新的 Subject Pack。

先明确选择 Static 或 Rigged Biped 路径。最终 GLB 必须自包含、米制、+Y up、-Z forward、support-center pivot，并提供 SHA-256、byte length、bounds、完整 inventory、许可证和正/右/背/浏览器证据。

Rigged Biped 还必须提供单 Skeleton Model、完整 Bind Pose、17 项语义 Bone 映射、Rig Signature，以及绑定到同一 Rig 的独立 in-place idle/walk/run/jump Clip 与动作 QA。不要实现移动、镜头、输入或 Runtime，也不要提交两个独立 Skeleton 的组合体。

请使用新的 creator/subject 命名空间和不可变版本；任何字节变化都发新版本。交付时同时说明希望是 recommended、advanced 还是 experimental，以及是否需要 FirstPersonView、ThirdPersonTarget 或其他语义 Socket。
```

## 相关资料

- [模块化 Subject 资产导入与现状](20-modular-subject-source-assets.md)
- [产品资产接入入口](superpowers/skills/product-asset-intake.md)
- [Static GLB 批量接入](superpowers/skills/product-asset-intake-static-assets.md)
- [主体资产与 3C 技术契约](16-subject-assets-3c-integration.md)
- [Subject Assembly Agent Packs 实现计划](superpowers/plans/2026-09-04-subject-assembly-agent-packs.md)
