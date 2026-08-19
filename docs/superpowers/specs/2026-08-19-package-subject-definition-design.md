# Package 局部 Subject Definition（S1a）设计

- 状态：Proposed，等待书面规格确认
- 日期：2026-08-19
- 上位规格：[`2026-08-19-extensible-subject-authoring-design.md`](./2026-08-19-extensible-subject-authoring-design.md)
- 产品/资产契约：[`16-subject-assets-3c-integration.md`](../../16-subject-assets-3c-integration.md)
- 前置里程碑：[`2026-08-19-subject-foundation-visible-slice.md`](../plans/2026-08-19-subject-foundation-visible-slice.md)
- 实施计划：[`2026-08-19-package-subject-definition-visible-slice.md`](../plans/2026-08-19-package-subject-definition-visible-slice.md)

## 1. 决策摘要

S1a 把 S0 的“选择内置 Subject Kit”升级为“在 WorldPackage 内定义可复用白模主体，并创建多个独立实例”。本阶段采用以下正式边界：

1. 新增 `AuthoringSpecV2`；主体实例只使用 `subjectDefinitionRef`，不再使用 `kitRef`。
2. V1 输入通过显式迁移转换成 V2；V2 不接受 `kitRef`，也不提供永久别名。
3. Package 局部 Definition 位于 `resources.subjectDefinitions`，实例节点只保存资源引用。
4. Definition 只能组合受 Schema 限制的 Primitive、Socket、Capability Ref 和 Profile Ref，不能包含代码或引擎对象。
5. Collider 由注册、版本化、确定性的 Derivation Profile 生成；AI 不直接选择 Babylon/Havok 类型。
6. Definition Hash、Resource Lock 和编译解释结果均由 SDK 生成，不能由 Authoring 输入伪造。
7. Normalizer 输出完全解析、引擎无关的定义；Compiler 与 Runtime 不再访问 Authoring 输入或 Host Registry。
8. 当前可运行主体仍是“地面 Character Proxy”。完整刚体、Compound Collider、车辆、骑乘、装备、动画和飞行不属于 S1a。

S1a 是完整 S1 的第一个可见垂直切片。它让概念上的“定义白模主体 + 生成实例”可用，但不宣称全部资产与关系能力已经完成。

## 2. 目标与非目标

### 2.1 目标

- AI 可以在一个 Canonical JSON 中定义非人形白模主体。
- 同一个 Definition 可以创建多个位置、状态和控制权互相独立的 Subject Instance。
- Definition Part 的输入顺序不影响规范化结果和 Definition Hash。
- Primitive 几何、Collider 推导、资源预算和地面运动结果均可确定性复现。
- Runtime 可以在多个内置或 Package 主体间切换控制权。
- CLI 可以列出可用资源、校验 Definition，并解释某个已编译主体。
- 公开 Schema、TypeScript 类型、CLI JSON、示例和生成产物使用同一套名称。
- Babylon、Havok 和具体控制器类继续留在 Runtime Adapter 内部。

### 2.2 非目标

- 不加载 GLB、FBX、纹理、骨骼或动画资产。
- 不允许 Package Definition 嵌入脚本、Shader、WASM、Babylon Node 或 Havok Shape。
- 不实现 Relationship、坐骑、拖拽、装备、车辆、飞行或 NPC 行为。
- 不实现完整刚体、Compound Collider 或任意方向 Character Collider。
- 不把 Socket 解释为装备槽、座位或关系；S1a 只冻结并传递稳定空间接口。
- 不实现 Registry 发布、远程下载、签名或完整 WorldPackage 文件布局。
- 不保留 `kitRef`、`presetRef`、`definitionRef` 多种同义公开字段。

## 3. 协议版本与兼容性

### 3.1 版本升级

S1a 引入以下版本：

| 协议 | 新版本 | 升级原因 |
|---|---:|---|
| AuthoringSpec | V2 | 新增 Package Definition，并将 `kitRef` 统一为 `subjectDefinitionRef` |
| NormalizedWorldIR | V2 | 保存 Definition Hash、解析结果与 Resource Lock |
| ExecutionPlan | V3 | 删除 `kitRef`，明确主体原点、Collider 中心和 Definition 身份 |
| Build Artifact | V3 | 同时封装 NormalizedWorldIRV2 与 ExecutionPlanV3 |
| Runtime Snapshot | V3 | 主体位置正式定义为 Subject Origin，并记录 Definition 身份 |
| Browser Protocol | V3 | 返回 Runtime Snapshot V3 |

没有结构变化的 Command 可以继续使用自己的现有版本；不能只因为外层协议升级就无意义地修改所有 Command。

### 3.2 V1 到 V2 的显式迁移

输入管线按以下顺序运行：

```text
duplicate-key / JSON syntax validation
  → read kind + schemaVersion
  → validate source-version Canonical Schema
  → migrate source version to AuthoringSpecV2
  → validate AuthoringSpecV2 Canonical Schema
  → semantic validation
  → normalization
```

迁移规则：

- `worldkit://kit/humanoid.third-person@1` → `worldkit://subject-definition/humanoid.third-person@1`
- `worldkit://kit/quadruped.ground-proxy@1` → `worldkit://subject-definition/quadruped.ground-proxy@1`
- `nodes[*].kitRef` → `nodes[*].subjectDefinitionRef`
- `resources.subjectDefinitions` 初始化为空数组。
- 其他 V1 字段按值复制，不通过宽松解析丢弃未知字段。

V2 Schema 明确拒绝 `kitRef`。兼容性只存在于版本迁移器中，不存在于 Canonical V2 类型、示例、Normalized IR、ExecutionPlan、CLI 输出或 Browser Protocol 中。

## 4. AuthoringSpecV2

### 4.1 Resources

```ts
interface AuthoringResourcesV2 {
  prototypes: readonly PrimitivePrototypeSpecV1[];
  subjectDefinitions: readonly PackageSubjectDefinitionV1[];
}
```

`subjectDefinitions` 是 ID 唯一、顺序无关的资源集合。Normalizer 按 `id`、`version` 排序。

### 4.2 Subject Instance

```ts
interface SubjectNodeSpecV2 {
  id: string;
  kind: "subject";
  subjectDefinitionRef: string;
  spawnAnchorEntityId?: string;
}
```

资源引用只有两种合法来源：

- `worldkit://subject-definition/<id>@<version>`：Host Registry 中的版本化定义；
- `package://subject-definition/<id>@<version>`：当前 AuthoringSpec `resources.subjectDefinitions` 中的局部定义。

Package Definition 的 Ref 由 `id + version` 确定，Authoring 不能另外填写一份可能冲突的 Ref。

### 4.3 Package Subject Definition

```ts
interface PackageSubjectDefinitionV1 {
  id: string;
  version: 1;
  kind: "subject-definition";
  category: "human" | "animal" | "custom";
  bodyTopology: "biped" | "quadruped" | "custom";
  semanticClassId: string;
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  visualParts: readonly SubjectVisualPartSpecV1[];
  sockets: readonly SubjectSocketSpecV1[];
  colliderPolicy: SubjectColliderPolicySpecV1;
  capabilityRefs: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
  };
  aiMetadata: {
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  };
}
```

`version` 是资源内容版本，不是 Schema 版本。Definition 本身的结构版本由所在 Authoring Schema 与 `kind` 共同限定。

S1a 要求每个 Subject Definition 恰好提供 `locomotion.ground` Capability。静态或没有 Locomotion 的 Subject 应使用 Object/Prototype；车辆和飞行主体由后续 Capability Runtime 支持。

### 4.4 Canonical JSON 示例

```json
{
  "resources": {
    "prototypes": [],
    "subjectDefinitions": [
      {
        "id": "coastal-pack-animal",
        "version": 1,
        "kind": "subject-definition",
        "category": "animal",
        "bodyTopology": "quadruped",
        "semanticClassId": "subject.animal.pack",
        "coordinateConvention": {
          "forwardAxis": "-Z",
          "upAxis": "+Y",
          "metersPerUnit": 1,
          "pivot": "support-center"
        },
        "visualParts": [
          {
            "id": "body",
            "kind": "primitive",
            "shape": { "kind": "box", "sizeMetersXYZ": [0.8, 0.7, 1.4] },
            "localTransform": {
              "positionMetersXYZ": [0, 0.9, 0]
            },
            "colliderContribution": "include",
            "semanticTags": ["body"]
          },
          {
            "id": "leg-front-left",
            "kind": "primitive",
            "shape": { "kind": "cylinder", "radiusMeters": 0.1, "heightMeters": 0.7 },
            "localTransform": {
              "positionMetersXYZ": [-0.28, 0.35, -0.45]
            },
            "colliderContribution": "include",
            "semanticTags": ["leg"]
          }
        ],
        "sockets": [
          {
            "id": "seat.mount",
            "localTransform": {
              "positionMetersXYZ": [0, 1.3, 0]
            },
            "semanticTags": ["mount-seat"]
          }
        ],
        "colliderPolicy": {
          "kind": "derive",
          "colliderDerivationProfileRef": "worldkit://collider-derivation-profile/vertical-character-capsule@1"
        },
        "capabilityRefs": [
          "worldkit://capability/locomotion.ground@1"
        ],
        "profiles": {
          "physicsBodyProfileRef": "worldkit://physics-body-profile/character.medium@1",
          "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
        },
        "aiMetadata": {
          "displayName": "Coastal pack animal",
          "description": "A controllable quadruped whitebox proxy for outdoor traversal tests.",
          "semanticTags": ["animal", "ground", "quadruped"]
        }
      }
    ]
  },
  "nodes": [
    {
      "id": "pack-animal-a",
      "kind": "subject",
      "subjectDefinitionRef": "package://subject-definition/coastal-pack-animal@1",
      "spawnAnchorEntityId": "spawn-pack-animal-a"
    },
    {
      "id": "pack-animal-b",
      "kind": "subject",
      "subjectDefinitionRef": "package://subject-definition/coastal-pack-animal@1",
      "spawnAnchorEntityId": "spawn-pack-animal-b"
    }
  ]
}
```

示例只展示本次新增字段；完整世界仍需包含 V2 Schema 要求的 World、Terrain、Camera、Anchor、Startup、Relationships、Rules 和 Constraints。

## 5. Primitive Geometry Composition

### 5.1 Part Schema

```ts
interface SubjectVisualPartSpecV1 {
  id: string;
  kind: "primitive";
  shape:
    | { kind: "box"; sizeMetersXYZ: readonly [number, number, number] }
    | { kind: "sphere"; radiusMeters: number }
    | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
    | { kind: "capsule"; radiusMeters: number; heightMeters: number };
  localTransform: {
    positionMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ?: readonly [number, number, number];
  };
  colliderContribution: "include" | "exclude";
  semanticTags?: readonly string[];
}
```

约束：

- `id` 在单个 Definition 内唯一。
- 尺寸必须有限且严格大于零。
- Capsule 的 `heightMeters >= 2 * radiusMeters`。
- S1a 不提供任意 `scaleXYZ`；尺寸必须写在 Shape 自身，避免负尺度和双重缩放语义。
- `rotationEulerRadiansXYZ` 使用右手坐标系，按 X、Y、Z 顺序应用；Normalizer 注入 `[0, 0, 0]`。
- `visualParts` 至少包含一个 Part，且至少一个 Part 的 `colliderContribution` 为 `include`。
- Part、Tag 和所有作为集合使用的 Ref 在 Hash 前按稳定规则排序。

### 5.2 Subject Origin

Definition 的局部原点固定为 `support-center`：主体静止在水平地面时，原点位于支撑区域中心的地面高度。它不是视觉 Bounds 中心或 Havok Character Controller 中心。

Normalizer 对参与 Collider 推导的 Part 计算 Bounds，并要求最低点位于 `0 ± 0.01m`。超出容差时返回 `SUBJECT_SUPPORT_ORIGIN_INVALID`，不能静默平移几何，因为那会使 Socket 和资产 Pivot 一起漂移。

Runtime 内部可以把 Character Controller 放在 Collider 中心，但必须通过显式 Offset 还原 Subject Origin：

```text
subjectOriginWorldPosition
  + collider.centerOffsetFromSubjectOriginMetersXYZ
  = controllerCenterWorldPosition
```

Visual Root、Socket 和 Snapshot 都以 Subject Origin 为权威空间。

## 6. Socket Set

```ts
interface SubjectSocketSpecV1 {
  id: string;
  localTransform: {
    positionMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ?: readonly [number, number, number];
  };
  semanticTags: readonly string[];
}
```

约束：

- Socket ID 在 Definition 内唯一并使用稳定小写 ID，例如 `hand.right`、`seat.mount`、`tow.rear`。
- Socket Transform 相对 Subject Origin，不相对某个 Babylon Mesh。
- S1a 将 Socket 规范化、哈希并传入 ExecutionPlan，但不消费它创建 Relationship。
- Bone、Node 或资产内部路径不属于公共 Socket Schema；未来 Asset Adapter 通过 Profile 把稳定 Socket ID 映射到底层 Rig。

## 7. Collider Derivation

### 7.1 Authoring Policy

```ts
interface SubjectColliderPolicySpecV1 {
  kind: "derive";
  colliderDerivationProfileRef:
    "worldkit://collider-derivation-profile/vertical-character-capsule@1";
}
```

S1a 只有一个受支持的 Derivation Profile。使用单成员闭合集是刻意限制：它验证扩展协议，但不假装已经支持 Compound、Mesh 或任意刚体 Shape。

### 7.2 确定性算法

`vertical-character-capsule@1`：

1. 选择全部 `colliderContribution: "include"` 的 Part。
2. 按冻结的 Primitive Bounds 算法计算旋转后保守 AABB；算法不调用 Babylon Mesh Bounds。
3. 合并 AABB，并校验数值、支撑原点、最大尺寸与世界预算。
4. Capsule Radius 取 X/Z 最大直径的一半。
5. 在 Bounds 最低点满足 support-center 契约后，Capsule Height 取 `max(boundsMaximumYMeters, 2 * radiusMeters)`。
6. Collider Center 的 X/Z 取合并 Bounds 的 X/Z 中心，Y 固定为 `heightMeters / 2`，保证 Collider 底部与 Subject Origin 的地面平面对齐。
7. 输出值按 Canonical Number 规则处理并进入 Definition 的解析结果。

此 Collider 是 S1a Ground Character Proxy 的控制/阻挡体，不是对任意非人形主体的完整物理拟合。长身体、车辆或需要多个碰撞体的定义必须在未来 Compound/Body Capability 中实现；S1a 不通过巨大容差掩盖不适用情况。

### 7.3 推导失败

以下情况必须拒绝 Definition：

- 没有参与推导的 Part；
- Shape 或 Transform 包含非有限数、非法尺寸或超出限制；
- 支撑原点不符合约定；
- 推导后 Capsule 超过 Profile 或 World Budget；
- `bodyTopology` 与当前 Character Proxy Policy 明确不兼容。

错误使用 `SUBJECT_COLLIDER_DERIVATION_FAILED`，并在 `details` 中返回 Definition Ref、相关 Part ID、算法 Ref、Bounds 与修复建议。不得回退为默认 Box 或复制内置 Humanoid Collider。

## 8. Capability 与 Profile Resolution

S1a 的 Definition 只选择资源，不包含实现参数：

```json
{
  "capabilityRefs": [
    "worldkit://capability/locomotion.ground@1"
  ],
  "profiles": {
    "physicsBodyProfileRef": "worldkit://physics-body-profile/character.medium@1",
    "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
  }
}
```

受信 Registry Manifest 保存 S0 中现有的质量、坡度、台阶、地面速度、涉水速度和跳跃速度。Normalizer 负责：

1. 解析 Ref 和精确版本；
2. 验证 Capability 的 `requires/provides/conflicts`；
3. 验证 Profile 与 Collider/Body Topology 的兼容性；
4. 把解析值和资源锁写入 Normalized IR；
5. 生成结构化 Diagnostic。

Compiler 只读取解析值，不访问 Registry。Runtime 只读取 ExecutionPlan，不解析 Ref。

## 9. Definition Resolution、Hash 与 Resource Lock

### 9.1 Resolution 顺序

```text
Subject Instance subjectDefinitionRef
  → package://...：从当前 resources.subjectDefinitions 精确解析
  → worldkit://...：从注入的 Subject Definition Registry 精确解析
  → resolve Capability/Profile/Collider Derivation manifests
  → normalize composition
  → derive collider and resource cost
  → write NormalizedWorldIRV2
```

不使用“最近版本”、模糊名称、注册顺序或网络回退。Package 与 Host Registry 使用不同 URI Authority，不存在静默覆盖优先级。

### 9.2 Definition Hash

`subjectDefinitionHash` 计算输入是规范化后的 Definition 数据，不包含 Hash 字段本身、实例 Transform 或 Runtime 状态：

```text
sha256(canonical-json-jcs@1(normalizedSubjectDefinitionWithoutComputedFields))
```

Definition Hash 包含 Profile/Capability Ref，但不把外部 Manifest 内容复制进 Definition Hash。外部内容由 Resource Lock 单独锁定。这使 Definition 身份与依赖实现身份能够分别解释。

### 9.3 Resource Lock

`NormalizedWorldIRV2.resources.resourceLock` 是按 `resourceRef` 排序的条目集合：

```ts
interface ResolvedResourceLockEntryV1 {
  resourceRef: string;
  resourceKind:
    | "subject-definition"
    | "capability"
    | "physics-body-profile"
    | "locomotion-profile"
    | "collider-derivation-profile";
  resolvedVersion: string;
  contentHash: string;
}
```

`resourceLockHash` 对完整有序 Lock 计算 Canonical Hash。Package Definition 自身也产生 `subject-definition` Lock Entry，其 `contentHash` 等于 `subjectDefinitionHash`。

若同一个不可变 `worldkit://...@version` Ref 在不同构建中解析为不同 `contentHash`，构建必须失败并报告 Registry Integrity 问题，不能把版本号当作完整性证明。

## 10. Normalized IR 与 ExecutionPlan

### 10.1 Normalized Subject Definition

`NormalizedWorldIRV2.resources.subjectDefinitions` 保存：

- `subjectDefinitionRef`；
- `subjectDefinitionHash`；
- 排序并补齐默认值的 Visual Parts 与 Sockets；
- 解析后的 Capability/Profile 数据；
- 推导后的 Collider；
- SDK 计算的资源成本；
- 原始资源来源 `package` 或 `registry`。

AI 不能在 Authoring 输入中提供 `subjectDefinitionHash`、解析后的 Profile 参数、Collider 结果或资源成本。

### 10.2 Execution Subject V3

```ts
interface ExecutionSubjectV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  bodyTopology: string;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnSubjectOriginPositionMetersXYZ: readonly [number, number, number];
  forwardDirection: "-z";
  visualParts: readonly SubjectVisualPartV3[];
  sockets: readonly SubjectSocketV3[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    centerOffsetFromSubjectOriginMetersXYZ: readonly [number, number, number];
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    mode: "ground";
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
}
```

ExecutionPlan 不包含 Babylon/Havok 类名、Handle 或 Profile Registry 对象。

### 10.3 Runtime 空间语义

- Spawn Anchor 表示 Subject Origin 的初始世界位置；Y 值仍是相对采样地形的高度偏移。
- Character Controller Position 是内部 Collider Center。
- Visual Root Position 和 Snapshot `positionMetersXYZ` 是 Subject Origin。
- Camera Target 以 Subject Origin 加 `targetHeightMeters` 计算。
- Reset 必须同时恢复 Collider Center、Subject Origin、Visual Root、速度和 Camera。

这次版本升级消除 S0 中 `spawnPositionMeters` 实际表示 Collider Center 的歧义。

## 11. Discovery、Validate 与 Explain

S1a 在现有无状态 CLI 上增加以下命令；参数名和 JSON 输出字段均属于本规格的公开契约：

```text
worldkit registry list --kind subject-definition --json
worldkit registry describe --resource-ref <ref> --json
worldkit subject-definition validate <file> --json
worldkit subject explain <world-file> --entity-id <id> --json
```

JSON 输出使用版本化判别对象，不输出格式化日志。`explain` 至少返回：

- Entity ID、Definition Ref 和 Definition Hash；
- Definition 来源；
- Visual Part 与 Socket 摘要；
- Collider 推导 Profile、输入 Part 和解析结果；
- Capability/Profile Ref；
- Resource Lock Entry；
- 单实例资源成本；
- 与输入相关的 Diagnostic 或警告。

`validate <world>` 继续走完整 Parse → Migrate → Normalize → Compile 管线；Definition 专项校验不得维护另一套不一致规则。

## 12. Diagnostics

新增或正式冻结以下错误码：

| Code | 含义 |
|---|---|
| `AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED` | 输入 Schema Version 没有验证器或迁移器 |
| `AUTHORING_MIGRATION_FAILED` | 已验证旧输入无法确定性迁移 |
| `SUBJECT_DEFINITION_DUPLICATE` | Package Definition ID/Version 重复 |
| `SUBJECT_DEFINITION_NOT_FOUND` | Subject Definition Ref 无法解析 |
| `SUBJECT_DEFINITION_REF_INVALID` | Package Ref 与 Definition ID/Version 不匹配 |
| `SUBJECT_DEFINITION_INVALID` | Definition 语义不合法 |
| `SUBJECT_VISUAL_PART_DUPLICATE` | Part ID 重复 |
| `SUBJECT_SOCKET_DUPLICATE` | Socket ID 重复 |
| `SUBJECT_SUPPORT_ORIGIN_INVALID` | Part Bounds 与 support-center 契约冲突 |
| `SUBJECT_COLLIDER_DERIVATION_FAILED` | Collider 无法确定性推导 |
| `SUBJECT_CAPABILITY_UNSATISFIED` | Capability/Profile 依赖或兼容性失败 |
| `SUBJECT_RESOURCE_LOCK_CONFLICT` | 相同版本 Ref 解析出不同内容 |

Diagnostic 必须包含准确 JSON Pointer；Ref 相关错误附带允许值或 Discovery 命令建议。Runtime Adapter 的 Babylon/Havok 异常不能直接充当 Authoring Diagnostic。

## 13. 模块边界

```text
packages/authoring
  owns: V1/V2 schema, migration, semantic validation, normalized package definitions

packages/subject-registry
  owns: immutable built-in definitions, capability/profile manifests, exact ref resolution

packages/subject-composition (new)
  owns: engine-neutral primitive bounds, collider derivation, resource-cost calculation

packages/compiler
  owns: NormalizedWorldIRV2 → ExecutionPlanV3 materialization

packages/runtime-contracts
  owns: ExecutionPlanV3, SnapshotV3 and Browser-facing protocol data

packages/runtime-babylon
  owns: visual meshes, Havok controller center mapping, origin synchronization

scripts/worldkit.ts
  owns: CLI routing and serialization; does not reimplement validation or composition
```

`subject-composition` 不依赖 Babylon、Havok、DOM 或 Node 文件系统，因此可以用纯单元测试验证几何和 Hash。

## 14. 数据流

```text
AuthoringSpec V1 or V2
  → strict source-version validation
  → V1 migration when needed
  → canonical AuthoringSpecV2
  → resolve Package/Registry Subject Definitions
  → resolve Capability/Profile manifests
  → normalize Primitive + Socket composition
  → derive Collider + resource cost
  → compute Definition Hash + Resource Lock Hash
  → NormalizedWorldIRV2
  → compile all Subject Instances in stable Entity ID order
  → ExecutionPlanV3
  → Babylon visual root at Subject Origin
  → Havok controller at derived Collider Center
  → SnapshotV3 / CLI capture / Browser ProtocolV3
```

## 15. 验收与测试

### 15.1 Schema 与迁移

1. V2 接受 Package Definition，并拒绝未知字段和 `kitRef`。
2. 合法 V1 输入迁移后与等价 V2 输入生成相同 Normalized IR Hash 和 ExecutionPlan Hash。
3. 不支持的版本返回单一、机器可修复的版本 Diagnostic。

### 15.2 Definition 与确定性

1. 同一定义的 Part、Socket、Tag 和 Ref 顺序变化不改变 Definition Hash。
2. 几何尺寸、Transform、Collider Policy、Capability Ref 或 Profile Ref 改变会改变 Definition Hash 或 Resource Lock Hash。
3. 两个实例共享 Definition Ref/Hash，但 Snapshot 状态、位置和控制权独立。
4. 手写 Definition Hash、资源成本或解析参数会被 Schema 拒绝。

### 15.3 Collider 与空间

1. 固定 Primitive Composition 推导出精确预期 Capsule 和中心 Offset。
2. support-center 不合法时失败，不静默移动主体。
3. Runtime Snapshot `positionMetersXYZ` 等于 Subject Origin，而不是 Havok Collider Center。
4. Reset、移动、切换控制和 Camera 跟随均保持 Origin/Collider Offset 一致。

### 15.4 Discovery 与解释

1. Registry List 顺序和 JSON 字节稳定。
2. Describe 返回 Canonical Ref、Schema/内容 Hash 和 AI Metadata。
3. Explain 能说明 Package Definition 的 Part、Socket、Collider、Profile、Hash、Lock 和预算。
4. 不存在的 Ref 或 Entity 返回稳定 Diagnostic，不抛原始引擎堆栈。

### 15.5 可见 E2E

新增一个 Canonical V2 示例：

- 一个内置 Humanoid；
- 一个 Package 局部定义的非人形 Ground Character Proxy；
- Package Definition 生成两个实例；
- 三者处于不同 Spawn Anchor；
- 浏览器可依次绑定控制并移动；
- Havok 碰撞、地形支撑、水面介质判断和截图通过；
- Build、Capture、Snapshot 与 Explain Artifact 可重复生成。

必须运行：

```text
pnpm typecheck
pnpm test
pnpm build
pnpm verify:v1
```

`verify:v1` 的脚本名仍表示原始命令兼容 Gate；输出必须明确报告本次实际验证的 Authoring、IR、ExecutionPlan、Snapshot 和 Browser Protocol 版本。

## 16. 后续阶段

### S1b：Asset 与高级 Body Composition

- `geometryRef`、GLB/LOD 与 Asset Lock；
- Rig/Socket Adapter；
- Collider Profile、Compound Collider 与完整 Body Physics；
- Registry 发布、Package 文件布局和签名；
- 更多 Capability/Profile 类型。

### S2：Relationship Framework

- 类型化 Relationship Manifest；
- 角色化端点；
- 初始与动态关系事务；
- Socket/Slot 兼容性；
- Receipt、Event、回滚和幂等；
- 人物—滑板浏览器 E2E。

### S3/S4

- 骑乘、拖车、控制上下文切换；
- 武器、动作变体和动画绑定；
- 飞行与飞龙坐骑。

## 17. 已冻结决策

1. S1a 使用 Authoring V2，不向 V1 追加长期字段。
2. 正式公开名是 `subjectDefinitionRef`；`kitRef` 只存在于 V1 Schema 和迁移器。
3. Package Definition 不在 Subject Node 内联。
4. Package Ref 由 Definition `id + version` 确定。
5. Definition 只组合声明式数据与 Registry Ref，不承载实现代码。
6. Subject Origin 固定为 support-center；Collider Center 是可推导的内部 Offset。
7. Collider 推导不依赖 Babylon Mesh Bounds。
8. AI 不填写计算得到的 Hash、Lock、Collider 结果或资源成本。
9. Compiler 不查询 Registry，Runtime 不解析 Definition。
10. S1a 的非人形主体是 Ground Character Proxy，不冒充完整车辆或动物物理。
11. Socket 在 S1a 是稳定空间接口，不自动产生 Gameplay Relationship。
12. S2 在 S1a 完成并验证之后开始，避免用临时父子节点替代正式关系模型。
