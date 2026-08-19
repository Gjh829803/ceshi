# Asset Subject S1b 可视切片设计

- 状态：Accepted，待实现
- 日期：2026-08-19
- 上位规格：[`2026-08-19-extensible-subject-authoring-design.md`](./2026-08-19-extensible-subject-authoring-design.md)
- 产品/资产契约：[`16-subject-assets-3c-integration.md`](../../16-subject-assets-3c-integration.md)
- 实施计划：[`2026-08-19-asset-subject-s1b-visible-slice.md`](../plans/2026-08-19-asset-subject-s1b-visible-slice.md)

## 1. 决策摘要

S1b 第一个可视切片先用仓库自生成、可再分发的 Golden Humanoid GLB 打通
完整链路，不等待产品资产。产品资产到位后，只允许增加或调整 Asset、Rig、
AnimationSet、Collider Profile 和 Subject Definition Registry 内容，不允许为某个
人物在 Scene、Compiler 或 Babylon Runtime 中增加专用分支。

本切片交付：

```text
Registry Subject Definition
  ├── Asset Visual Part ── subjectAssetRef ──► Subject Asset Manifest
  ├── Rig Binding ──────── rigProfileRef ────► Rig Profile
  ├── Semantic Actions ─── animationSetRef ──► Animation Set
  └── Collider Policy ──── colliderProfileRef ► Deterministic Capsule
                 │
                 ▼
Canonical Authoring V2 → Normalized IR V2 → ExecutionPlan V3
                 │
                 ▼
Host Asset Resolver → Hash Gate → Babylon AssetContainer Cache
                 │
                 ▼
Independent Subject Instance + Havok Controller + Fixed-tick Action State
```

普通 World Agent 仍只写：

```json
{
  "id": "hero",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.rigged-golden@1",
  "spawnAnchorEntityId": "spawn-hero"
}
```

Agent 不填写 GLB URI、骨骼节点名、动画 Clip 名、Collider 尺寸、Babylon 类型或
Havok Handle。

## 2. 范围

### 2.1 本切片实现

- Runtime 只消费 GLB 2.0 二进制资产；FBX、Blender 等源格式离线转换。
- `visualParts` 增加 `kind: "asset"`，与现有 Primitive 构成严格判别 Union。
- Registry 增加 Subject Asset、Rig Profile、Animation Set 和 Collider Profile。
- 支持一个 Rigged Asset Part 与任意数量 Primitive Part 共同组成主体视觉。
- Rig Socket 可以绑定稳定语义 Bone ID；Scene Agent 不接触源骨骼名。
- GLB 按 `subjectAssetRef + artifactContentHash` 缓存一次，每个 Subject 实例拥有
  独立 Skeleton、AnimationGroup、Action State 和 Dispose 生命周期。
- 资产统一使用白模材质；原材质、纹理和 Shader 不成为本切片的视觉真相。
- Collider 不从运行时 Mesh Bounds 猜测；资产型人形使用版本化 Capsule Profile。
- `idle`、`walk`、`run`、`jump` 通过 Animation Set 映射到源 Clip。
- 位移由 Havok Character Controller 负责，动画采用 in-place 语义。
- `run` 作为语义输入修饰符，并分别配置 Walk/Run 速度。
- Snapshot 暴露每个主体的 `activeActionId`，用于 CLI、Browser 和 Replay 验收。
- CLI/Browser Fixture 覆盖加载、移动、碰撞、动作切换、Reset、截图与资源释放。

### 2.2 明确不实现

- 任意两套骨骼之间的自动 Retarget。
- Root Motion 驱动权威位移。
- Compound Collider、Convex Hull 或按 Mesh Bounds 的运行时 Collider 推导。
- 成人/儿童、空手/持剑、地面/游泳等 Context Variant。
- 坐骑、武器、装备槽、关系事务、飞行和 NPC 行为。
- LOD 运行时选择、流式加载、远程资产发布后台和签名分发。
- 产品级材质、纹理、表情、布料、头发和视觉特效。

这些能力沿用已接受的 Profile、Capability、Socket、Slot 与 Relationship 扩展边界，
不通过本切片提前模拟。

## 3. 设计原则

1. **Identity 不变**：Primitive 换成 GLB 后，Entity ID、Definition Ref、控制权、
   Collider 和 Gameplay 身份不变。
2. **资产事实与玩法配置分离**：GLB/骨架/Clip 是资产事实；Collider、速度、相机和
   动作语义是 SDK Profile。
3. **编译期解析，运行时执行**：Normalizer 解析 Registry，Compiler 和 Runtime
   不查询 Registry。
4. **物理优先**：Character Controller 是位移真相，动画只消费已提交状态。
5. **显式失败**：缺 Asset、Hash、Rig、Bone、Clip 或 Collider 时返回稳定 Diagnostic，
   不静默换成巨大 Box、默认骨骼或任意 Clip。
6. **实例隔离**：缓存共享只发生在不可变 AssetContainer 源；Skeleton、AnimationGroup、
   Action State 和 Transform 必须逐实例隔离。
7. **Host 管位置，Schema 管身份**：公共协议保存 Ref 与 Hash；URL、鉴权、CDN 和本地
   文件路径由 Host Asset Resolver 管理。
8. **白模一致性**：Runtime 强制中性白模材质，避免产品资产材质改变控制视频的语义。

## 4. Registry 资源模型

### 4.1 Subject Asset Manifest

```ts
interface SubjectAssetManifestInputV1 {
  kind: "subject-asset";
  id: string;
  version: number;
  resourceRef: string;
  format: "glb";
  artifact: {
    mediaType: "model/gltf-binary";
    byteLength: number;
    contentHash: string;
  };
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  bounds: {
    minimumMetersXYZ: Vec3;
    maximumMetersXYZ: Vec3;
  };
  inventory: {
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    skeletonCount: number;
    boneCount: number;
    animationClipNames: readonly string[];
  };
  provenance: {
    licenseSpdxId: string;
    redistributionPolicy: "allowed" | "internal-only" | "prohibited";
    sourceUri?: string;
    licenseUri?: string;
    author?: string;
  };
  aiMetadata: SubjectResourceAiMetadataV1;
}
```

`resource.contentHash` 继续表示 Manifest 自身的 Canonical Hash；
`artifact.contentHash` 表示 GLB 原始字节 Hash。两者不可混用。

Runtime 不使用 `sourceUri` 取文件；它仅用于 Provenance。Host Resolver 通过
`subjectAssetRef` 找到本地文件、Package Blob、CDN 或对象存储，并返回字节。

### 4.2 Rig Profile

```ts
type BipedBoneIdV1 =
  | "root"
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upper-arm.left"
  | "lower-arm.left"
  | "hand.left"
  | "upper-arm.right"
  | "lower-arm.right"
  | "hand.right"
  | "upper-leg.left"
  | "lower-leg.left"
  | "foot.left"
  | "upper-leg.right"
  | "lower-leg.right"
  | "foot.right";

interface RigProfileManifestInputV1 {
  kind: "rig-profile";
  id: string;
  version: number;
  resourceRef: string;
  bodyTopology: "biped";
  compatibleSubjectAssetRefs: readonly string[];
  skeletonRootNodeName: string;
  requiredBoneIds: readonly BipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
  aiMetadata: SubjectResourceAiMetadataV1;
}
```

源节点名只存在于受信 Registry Profile。Subject Socket、Relationship 和 Agent-facing
Schema 只引用稳定 `boneId`。

### 4.3 Animation Set

```ts
type GroundHumanoidActionIdV1 = "idle" | "walk" | "run" | "jump";

interface AnimationBindingV1 {
  actionId: GroundHumanoidActionIdV1;
  sourceClipName: string;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

interface AnimationSetManifestInputV1 {
  kind: "animation-set";
  id: string;
  version: number;
  resourceRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: "idle";
  requiredActionIds: readonly GroundHumanoidActionIdV1[];
  animationBindings: readonly AnimationBindingV1[];
  aiMetadata: SubjectResourceAiMetadataV1;
}
```

第一版要求四个 Action 都能解析，不做隐式 Clip 名匹配。产品资产把
`Standard Walk`、`Run_Fast` 等源名称映射到 `walk`、`run`；Runtime 只处理
稳定 Action ID。

### 4.4 Collider Profile

```ts
interface ColliderProfileManifestInputV1 {
  kind: "collider-profile";
  id: string;
  version: number;
  resourceRef: string;
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    centerOffsetFromSubjectOriginMetersXYZ: Vec3;
  };
  aiMetadata: SubjectResourceAiMetadataV1;
}
```

`ColliderProfile` 只决定 Shape；质量、坡度和台阶参数继续来自
`PhysicsBodyProfile`。这样成人、儿童或大型角色可以替换 Collider，而不复制控制算法。

## 5. Subject Definition 扩展

### 5.1 Visual Part 判别 Union

```ts
type SubjectVisualPartDefinitionV2 =
  | {
      id: string;
      kind: "primitive";
      shape: CompositionPrimitiveV1;
      localTransform: LocalTransformV1;
      colliderContribution: "include" | "exclude";
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "asset";
      subjectAssetRef: string;
      localTransform: LocalTransformV1 & { scaleXYZ: Vec3 };
      appearance: { mode: "whitebox-neutral" };
      semanticTags: readonly string[];
    };
```

Asset Part 不提供 `colliderContribution`。资产 Collider 必须来自显式
`ColliderProfile`；Normalizer 不读取 GLB Bounds 临时推导。

### 5.2 Visual Binding

```ts
type SubjectVisualBindingV1 =
  | { mode: "static" }
  | {
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    };
```

- `static` Definition 只能包含 Primitive Part。
- `rigged` Definition 必须且只能包含一个 Asset Part，可同时包含不受骨骼驱动的
  Primitive 调试/装饰 Part。
- `rigged` 的 Rig Profile 与 Animation Set 必须声明兼容同一个
  `subjectAssetRef`。

### 5.3 Collider Policy

```ts
type SubjectColliderPolicyV2 =
  | {
      kind: "derive";
      colliderDerivationProfileRef: string;
    }
  | {
      kind: "profile";
      colliderProfileRef: string;
    };
```

Primitive 现有 Definition 继续使用 `derive`；Golden Humanoid 和产品人物使用
`profile`。Compound Collider 留到 S1b 后续切片。

### 5.4 Socket 判别 Union

```ts
type SubjectSocketDefinitionV2 =
  | {
      id: string;
      kind: "local";
      localTransform: LocalTransformV1;
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "bone";
      boneId: BipedBoneIdV1;
      offsetTransform: LocalTransformV1;
      semanticTags: readonly string[];
    };
```

Rigged 人物的 `hand.right` Socket 绑定 `boneId: "hand.right"`。Babylon Adapter
把它解析成实例内的 TransformNode；公开协议不保存 Babylon Node 路径。

## 6. Normalizer 与 Compiler 边界

Normalizer 负责：

- 精确版本解析 Subject Asset、Rig Profile、Animation Set、Collider Profile。
- 将所有 Registry 资源写入 Resource Lock。
- 验证 Asset/Rig/Animation/Definition 的交叉兼容性。
- 验证 Action ID 完整、唯一，Clip 名存在于 Manifest Inventory。
- 验证 Bone Socket 引用的 Bone ID 被 Rig Profile 声明。
- 计算 Asset Resource Cost，拒绝世界预算溢出。
- 输出稳定排序的 Normalized Resource Tables。

Compiler 只消费 Normalized IR，并输出引擎无关的 Runtime Descriptor：

```ts
interface ExecutionSubjectAssetV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  inventory: SubjectAssetManifestInputV1["inventory"];
}
```

ExecutionPlan 保存 `subjectAssets`、`rigProfiles`、`animationSets`、
`colliderProfiles` 的去重稳定表；Subject Visual Part 只保存 Ref。Runtime 不查询
Registry，也不接触 Authoring 输入。

## 7. Host Asset Resolver

```ts
interface SubjectAssetResolveRequestV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
}

interface ResolvedSubjectAssetBytesV1 {
  bytes: Uint8Array;
  sourceLabel: string;
}

interface SubjectAssetResolverV1 {
  resolveSubjectAsset(
    request: SubjectAssetResolveRequestV1,
  ): Promise<ResolvedSubjectAssetBytesV1>;
}
```

Resolver 是 Host Adapter，不是 Canonical JSON。它可以实现：

- Browser same-origin 静态资源映射；
- WorldPackage 内 Blob；
- 带鉴权的 CDN/对象存储；
- 测试内存字节。

Runtime 在 Babylon Loader 前验证：

1. Resolver 返回值存在且非空；
2. 字节长度等于 Manifest；
3. SHA-256 等于 `artifactContentHash`；
4. 格式为 GLB；
5. GLB 实际 Inventory 不超过 Manifest 和 Runtime Gate。

Hash 或长度不一致时不得缓存或实例化。

## 8. Babylon Runtime 设计

### 8.1 Cache 与实例化

```text
SubjectAssetResolver bytes
  → SHA-256 Gate
  → Babylon LoadAssetContainerAsync(bytes, .glb)
  → immutable cache entry
  → instantiateModelsToScene(doNotInstantiate=true)
  → per-instance root/skeleton/animation groups
```

Cache Key 是 `subjectAssetRef + artifactContentHash`。同一资产只解析一次，但使用
`doNotInstantiate: true` 克隆实例，避免两个 Subject 共享 Skeleton Pose 或
AnimationGroup 状态。

每个 `SubjectVisual` 持有：

- Subject Visual Root；
- 该实例的 Mesh；
- 该实例的 Skeleton；
- 该实例的 AnimationGroup；
- `socketNodesById`；
- `SubjectAnimationPlayer`；
- 幂等 Dispose。

Runtime Dispose 顺序：停止 Action → Dispose 实例 AnimationGroup/Skeleton/Nodes →
释放 Asset Cache 引用 → 最后 Dispose AssetContainer、Scene、Engine。

### 8.2 白模材质

实例化后遍历所有可渲染 Mesh：

- 统一绑定现有 Subject 白模材质；
- 保留 Skin、Morph 和 Vertex 数据；
- 禁止导入资产 Light、Camera、Audio 和任意脚本行为；
- Metadata 只写 SDK 的 Entity/Part/Semantic ID。

### 8.3 Rig 与 Socket

Runtime 用 Rig Profile 的 `sourceNodeNameByBoneId` 验证实例节点。缺失必需节点或
重复节点直接失败。Bone Socket 创建受 Visual Root 管理的跟随节点，并应用
`offsetTransform`；Socket 不成为独立 Entity。

## 9. 固定 Tick 动作状态

### 9.1 输入与速度

`SemanticInputActionV1` 增加 `run`。Ground Locomotion Profile 把原单一速度拆为：

```ts
{
  mode: "ground";
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  waterSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
}
```

没有 `run` 时按 Walk 速度；有 `run` 且存在水平输入时按 Run 速度。当前项目未上线，
不保留 `groundSpeedMetersPerSecond` 别名。

### 9.2 Action 选择

每个固定 Tick 在物理步之后解析：

```text
movementMedium == air              → jump
horizontalSpeed <= 0.08 m/s        → idle
run requested and moving           → run
otherwise                          → walk
```

未受控主体默认 `idle`。Reset 恢复 `idle`、动画起始帧、零速度和起始 Transform。

AnimationGroup 由固定 Tick 推进：启动后 Pause，按 `tick / 60` 计算目标 Frame，并用
`blendDurationSeconds` 对前后 AnimationGroup 权重做确定性过渡。Scene Render 不作为
动作时间真相。

### 9.3 Root Motion

第一版只接受 `rootMotionMode: "in-place"`。接入检查必须证明 Root/Hips 平移不会
产生可见世界位移；不满足时资产先离线清理，不能让动画覆盖 Havok Transform。

## 10. Diagnostic

| Code | 阶段 | 含义 |
|---|---|---|
| `SUBJECT_ASSET_NOT_FOUND` | Normalize | Definition 引用的 Asset 未注册 |
| `SUBJECT_RIG_PROFILE_NOT_FOUND` | Normalize | Rig Profile 未注册 |
| `SUBJECT_ANIMATION_SET_NOT_FOUND` | Normalize | Animation Set 未注册 |
| `SUBJECT_COLLIDER_PROFILE_NOT_FOUND` | Normalize | Collider Profile 未注册 |
| `SUBJECT_ASSET_PROFILE_INCOMPATIBLE` | Normalize | Asset、Rig、AnimationSet、Definition 不兼容 |
| `SUBJECT_ASSET_BUDGET_EXCEEDED` | Normalize/Compile | Manifest Inventory 超过世界预算 |
| `SUBJECT_ASSET_RESOLVER_REQUIRED` | Runtime | Asset 世界未提供 Host Resolver |
| `SUBJECT_ASSET_RESOLVE_FAILED` | Runtime | Resolver 无法返回字节 |
| `SUBJECT_ASSET_HASH_MISMATCH` | Runtime | GLB 字节 Hash 不一致 |
| `SUBJECT_ASSET_LENGTH_MISMATCH` | Runtime | GLB 字节长度不一致 |
| `SUBJECT_ASSET_FORMAT_UNSUPPORTED` | Runtime | 不是受支持的 GLB 2.0 |
| `SUBJECT_ASSET_RIG_INCOMPATIBLE` | Runtime | Skeleton 或必需 Bone 缺失/重复 |
| `SUBJECT_ASSET_ANIMATION_MISSING` | Runtime | 映射的源 Clip 不存在 |
| `SUBJECT_ASSET_SOCKET_BONE_MISSING` | Runtime | Bone Socket 无法绑定 |

Runtime 初始化失败时 `ready` 必须 Reject，不能显示 Primitive 占位体伪装成功。

## 11. Golden Humanoid Fixture

仓库使用 TypeScript 脚本确定性生成一个小型 GLB，避免等待产品资产或引入来源不明的
Xbot。Fixture 具有：

- `-Z` Forward、`+Y` Up、米制和 Support Center Pivot；
- 一个简化人形 Skinned Mesh；
- 一套 Biped Skeleton；
- `idle`、`walk`、`run`、`jump` 四个 Animation Clip；
- 不含纹理、Light、Camera、Audio 和自定义扩展；
- 项目自有 Provenance，允许仓库和 CI 再分发；
- 固定生成字节和 SHA-256；重复生成必须完全一致。

Golden Fixture 只验证 SDK 管线，不作为产品人物视觉标准。

## 12. 产品资产到位后的接入动作

产品团队交付资产后，SDK 接入者只做：

1. 把源文件离线转换为 GLB 2.0；
2. 生成 Subject Asset Manifest 和 Hash/Inventory/Provenance；
3. 创建或复用 Rig Profile，填写 Bone 语义映射；
4. 创建 Animation Set，把源 Clip 映射到四个 Action；
5. 选择或创建 Collider Profile；
6. 创建 Registry Subject Definition；
7. 运行同一套 Asset、Runtime、Browser 和 Screenshot Gate。

若以上步骤要求修改 Compiler 分支、Babylon Loader 或 Scene JSON 字段，说明资产契约
或底座存在缺口，必须回到 Profile/Adapter 设计评审，不能在场景脚本中修补。

## 13. 验收标准

1. Primitive 世界的 Canonical Hash、行为和现有回归继续通过。
2. 一个 Canonical JSON 只引用 Rigged Subject Definition 即可运行 Golden Humanoid。
3. GLB 字节被篡改时，Runtime 以 `SUBJECT_ASSET_HASH_MISMATCH` 失败。
4. 缺 Rig、Bone、Clip、Collider Profile 时得到对应稳定 Diagnostic。
5. 同一个 Asset 创建两个 Subject；二者共享 Cache Source，但 Skeleton、Action、
   Transform 和 Dispose 状态独立。
6. 固定输入依次证明 `idle → walk → run → jump → idle`，Snapshot 中 Action 与
   位移状态一致。
7. Character Controller 与墙/地形碰撞继续有效；Mesh 不参与权威物理。
8. Reset 恢复起点、零速度、默认控制目标和 `idle` 起始帧。
9. CLI Capture 产出有效 PNG 与包含 `activeActionId` 的 Snapshot。
10. Runtime Dispose 两次安全，Scene 中不残留实例、AnimationGroup、Skeleton 或
    AssetContainer 资源。

## 14. 后续扩展点

- S1b 后续：Compound Collider、LOD、更多 Topology 和独立动画资产。
- P1.3 通用姿态包：显式 `standing/crouched/prone` 姿态、`fall/land`、蹲伏和趴伏
  动作族、姿态专用 Capsule、起身净空检测、蹲走/匍匐速度，以及 Snapshot
  `postureMode`。这组能力在当前四动作纵向切片通过后单独实施，不把姿态状态编码进
  Clip 名或 Babylon 对象。
- P1.3 动作协议：Action Request/Receipt、Cancel/Interrupt、Context Variant 和
  声明式 Fallback。缺少姿态过渡 Clip 时由版本化 Fallback 决策，不做源 Clip 名猜测。
- S2：Socket/Slot 驱动的类型化 Relationship。
- S3：Mount/Seat、控制权与 Camera Context 事务。
- S4：装备动作、飞行与复杂组合。

这些扩展复用本切片的 Asset Ref、Rig Bone ID、Animation Set、Collider Profile 和
实例隔离，不改变普通 Agent 的 Subject Node 形状。
