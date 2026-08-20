# Asset Subject S1b 可视切片设计

- 状态：Accepted；Golden Humanoid 首个可视切片已实现并进入回归
- 日期：2026-08-19
- 上位规格：[`2026-08-19-extensible-subject-authoring-design.md`](./2026-08-19-extensible-subject-authoring-design.md)
- 产品/资产契约：[`16-subject-assets-3c-integration.md`](../../16-subject-assets-3c-integration.md)
- 实施计划：[`2026-08-19-asset-subject-s1b-visible-slice.md`](../plans/2026-08-19-asset-subject-s1b-visible-slice.md)

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

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
Canonical Authoring V3 → Normalized IR V3 → ExecutionPlan V4
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
  skeletonRootBoneName: string;
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

这些接口由 Runtime Babylon 包公开导出。Resolve Request 只有 Ref、预期内容 Hash、
字节长度和媒体类型，ExecutionPlan 不携带 URI、鉴权信息或字节。`sourceLabel` 仅供 Host
内部定位来源，S1b 的异常和日志不输出它；Resolver 返回空值、非对象或非
`Uint8Array` 字节统一映射为 `SUBJECT_ASSET_RESOLVE_FAILED`。

Runtime 在 Babylon Loader 前验证：

1. Resolver 返回值存在且非空；
2. 字节长度等于 Manifest；
3. SHA-256 等于 `artifactContentHash`；
4. GLB Header、Chunk Table 与 JSON Chunk 合法；
5. JSON 不包含 `buffers[*].uri` 或 `images[*].uri`，Loader 不允许发起网络/文件读取；
6. GLB 实际 Inventory 等于 Manifest 且不超过 Runtime Gate。

Hash 或长度不一致时不得缓存或实例化。

失败优先级固定为：Cache 已关闭、Descriptor 媒体/格式不支持、Descriptor 超限、
缺少 Resolver、Resolver 失败、长度不符、Hash 不符、GLB/禁用内容不支持、实际
Inventory 超限、实际 Inventory 不符。这样同一份多重错误输入不会因实现重排产生
不同诊断。Host 只能把 Runtime Limit 收紧为有限正整数，不能放宽 SDK 默认上限。

Runtime Babylon 包公开封闭的 `SubjectAssetRuntimeErrorCodeV1`、
`SubjectAssetRuntimeErrorV1` 与 `isSubjectAssetRuntimeErrorV1`。Task 6/7 的 Asset、Rig、
Animation、Socket 错误都使用该类型；Message 不包含 Provider/Babylon 文本与 Cause，
可选安全上下文只有 Asset Ref 和预期 Hash。Browser 不解析 Error Message，只通过类型
判别器转发白名单 Code；其他异常统一转换为
`WORLDKIT_RUNTIME_INITIALIZATION_FAILED` 且不暴露 Cause。

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

Cache Key 是 `subjectAssetRef + artifactContentHash`。同一资产只解析一次，但每次
Acquire（包括命中 Cache 或加入 Pending Promise）仍需校验媒体类型、格式、字节长度
和完整 Inventory 与冻结条目一致，冲突不能增加 Ref Count。实例化使用
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

Lease 跟踪它创建的全部 Instance。Lease Release 先 Dispose 遗漏 Instance，再幂等
递减 Ref Count；Cache Dispose 原子关闭 Cache，使现有 Lease/Instance 失效，等待
Pending Load all-settled，然后按完整 Cache Key 的逆字典序 Dispose Container。
Dispose 中完成的 Load 必须立即且只 Dispose 一次。重复 Cache Dispose 返回同一个
Promise；关闭后的 Acquire 使用 `SUBJECT_ASSET_CACHE_DISPOSED`，失效 Lease 的
Instantiate 使用 `SUBJECT_ASSET_LEASE_RELEASED`。

`SubjectVisual.dispose()` 独占其嵌套资源：停止 Animation Player、解绑并销毁 Socket、
销毁 Primitive Node 或 Asset Instance，最后释放 Lease。Runtime 只按逆序销毁
Controller、SubjectVisual、Asset Cache、Physics、Scene 与 Engine，避免重复释放。

`BabylonWorldRuntimeOptions` 公开可选的 `subjectAssetResolver` 与
`subjectAssetCacheOptions`。Runtime 创建并独占一个 Cache，所有 Asset Visual 共享它；
Primitive-only 世界可不提供 Resolver，含 Asset 的世界缺少 Resolver 时使用
`SUBJECT_ASSET_RESOLVER_REQUIRED`。Host/Playground 只注入 Resolver 和更严格的 Cache
Limits，不直接管理 Runtime Cache。

### 8.2 白模材质

实例化后遍历所有可渲染 Mesh：

- 统一绑定现有 Subject 白模材质；
- 保留 Skin、Morph 和 Vertex 数据；
- 禁止导入资产 Light、Camera、Audio 和任意脚本行为；
- Metadata 只写 SDK 的 Entity/Part/Semantic ID。

Source Container 若包含 Camera、Light、Sound、Container/Mesh ActionManager 或任意
Node Behavior，统一作为 `SUBJECT_ASSET_FORMAT_UNSUPPORTED` 拒绝。Mesh Inventory
按所有可渲染且带 Geometry 的 Mesh 计数；顶点和索引按共享 Geometry 去重。S1b 只接受
带 Index 且 Index 数为 3 的倍数的 Triangle List。Instance Mesh 从每个 Root（包括
Root 本身为 AbstractMesh）及 `getChildMeshes(false)` 稳定收集并按 `uniqueId` 去重；
不能重命名源 Bone。

### 8.3 Rig 与 Socket

Runtime 用 Rig Profile 的 `sourceNodeNameByBoneId` 验证实例节点。缺失必需节点或
重复节点直接失败。S1b 要求 Instance 恰有一个 Skeleton、所有 Bone Name 唯一、
`skeletonRootBoneName` 命中唯一的 Parentless Bone，且 17 个解剖语义 Bone 一对一
解析。Skeleton Root 是独立骨架事实，不占用语义 Bone ID；它可以与 `hips` 映射
指向同一个物理 Bone，例如 G Bot 的 `mixamorig:Hips`。
Bone Socket 创建受 Visual Root 管理的跟随节点，并应用
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

Controller 在 Havok `_step()` 前写入运动意图；物理步完成后 Runtime 同步 Visual Root，
再从同一个实际位置/速度采样 `movementMedium` 与水平速度。只有受控主体的输入提供
`runRequested`，未受控主体直接设为 `idle`，不经过动作推断。

AnimationGroup 启动后 Pause，由固定 Tick 推进：
`elapsedFrames = (tick - actionStartTick) / 60 * playbackSpeedRatio * fps`。Repeat 使用
`from + elapsedFrames % (to - from)`，Once 使用 `min(to, from + elapsedFrames)`；Reset
回到 Idle 的 `from`。过渡权重为
`durationTicks === 0 ? 1 : clamp((tick - transitionStartTick) / durationTicks, 0, 1)`。
Scene Render 不作为动作时间真相。每个绑定 Clip 必须唯一、含 Targeted Animation、
具有单一有限正 FPS 和有限 `from < to`，Playback Ratio 必须为有限正数，Blend
Duration 必须有限且非负，否则使用 `SUBJECT_ASSET_ANIMATION_INCOMPATIBLE`。

### 9.3 Root Motion

第一版只接受 `rootMotionMode: "in-place"`。接入检查必须证明 Root/Hips 平移不会
产生可见世界位移：禁止目标为映射 Root/Hips Bone 本体或其非空
`getTransformNode()` 的任何 `position...` 动画通道，不按显示 Name 猜测，也不因关键帧
恰好常量而放行。不满足时资产先离线清理，不能让动画覆盖 Havok Transform。

### 9.4 Host 与 Browser 状态边界

Playground Fetch Resolver 在创建时复制 Ref→URI 映射，并用创建时页面 Origin 解析相对
URI；只接受无 UserInfo 的同源 HTTP(S)，Fetch 固定为 same-origin mode/credentials 与
redirect error。非 OK Response 不读 Body，成功 Body 只读一次并复制字节，Source Label
只有 Pathname。Resolver 内部的 Unmapped Ref 不冒充 Normalize 的
`SUBJECT_ASSET_NOT_FOUND`；通过 Runtime 后统一成为 `SUBJECT_ASSET_RESOLVE_FAILED`。

`authoring=1` 被识别后，Playground 在任何动态 Import 或加载前安装 Browser API，状态
只允许 `loading → ready | error`。`ready()` 始终返回同一个启动 Promise；Loading 时
Diagnostics 为空，同步方法抛 `WORLDKIT_RUNTIME_NOT_READY`，异步方法等待启动。只有
Adapter 创建、Mount 和首帧成功后才进入 Ready。后续失败先 Dispose 已创建资源，再
发布 Error，不能形成未处理的顶层 Reject。

Browser Protocol 使用结构化 `WorldkitBrowserDiagnosticV1`，不再返回任意 Record。
仅通过 `isSubjectAssetRuntimeErrorV1` 转发受控 Code；未知错误转换为不带 Cause 的
`WORLDKIT_RUNTIME_INITIALIZATION_FAILED`。DOM `data-worldkit-status` 同步使用
`loading/ready/error`。

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
| `SUBJECT_ASSET_INVENTORY_MISMATCH` | Runtime | 实际资产 Inventory 与内容寻址 Manifest 不一致 |
| `SUBJECT_ASSET_INVENTORY_EXCEEDED` | Runtime | 实际资产 Inventory 超过 Manifest 或 Runtime 限制 |
| `SUBJECT_ASSET_CACHE_DISPOSED` | Runtime | Asset Cache 已关闭，不能 Acquire |
| `SUBJECT_ASSET_LEASE_RELEASED` | Runtime | Lease 已释放或因 Cache Dispose 失效，不能 Instantiate |
| `SUBJECT_ASSET_DISPOSE_FAILED` | Runtime | Subject Asset/Animation/Socket 清理失败；异常已脱敏且其他资源继续清理 |
| `SUBJECT_ASSET_RIG_INCOMPATIBLE` | Runtime | Skeleton 或必需 Bone 缺失/重复 |
| `SUBJECT_ASSET_ANIMATION_MISSING` | Runtime | 映射的源 Clip 不存在 |
| `SUBJECT_ASSET_ANIMATION_INCOMPATIBLE` | Runtime | Clip 数量、Target、FPS、Frame Range 或播放/过渡参数无效 |
| `SUBJECT_ASSET_SOCKET_BONE_MISSING` | Runtime | Bone Socket 无法绑定 |
| `SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED` | Runtime | Root/Hips 平移违反 in-place 动作约束 |
| `WORLDKIT_RUNTIME_NOT_READY` | Browser Host | Browser API 仍在 Loading，不能调用同步方法 |
| `WORLDKIT_RUNTIME_INITIALIZATION_FAILED` | Browser Host | 未知 Runtime 启动错误的脱敏统一诊断 |
| `WORLDKIT_RUNTIME_DISPOSE_FAILED` | Runtime | Physics/Scene/Engine 清理失败；异常已脱敏且其他资源继续清理 |

`BabylonWorldRuntime.create()` 在初始化失败时直接 Reject，不能返回 Primitive 占位体
伪装成功；成功返回的 Runtime `ready` 已经 Resolved。Browser 侧在 Task 8 先安装延迟
API，再把 Factory Reject 原样转为稳定 Diagnostic，避免自动化等待不到协议对象。

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

首个产品 G Bot 已按此流程接入：产品 `asset.manifest.json` / `action-manifest.json`
保留源资产事实，Registry `RigProfile` / `AnimationSet` 显式映射 65 根源 Bone 和
12 个源 Clip 中当前开放的 `idle/walk/run/jump`；普通 World JSON 只引用
`worldkit://subject-definition/humanoid.g-bot@1`。独立验收命令为
`pnpm verify:g-bot-subject`。

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
11. Canonical 与 Rigged Verifier 只在全部 Gate 和清理成功后，以可回滚目录交换发布
    完整 Artifact 集；失败不会留下半新半旧证据。
12. `verification.json` 机器可读地绑定输入/Asset/IR/Plan Hash、每张截图的
    Tick/Action/Entity/尺寸/Hash、实例隔离、墙体停止和 Tamper Diagnostic；四个 Action
    PNG Hash 两两不同，同时保留人工姿态检查。
13. Server Readiness 用本次启动 Nonce 证明端口归属，清理只作用于本次直接拥有的
    Vite PID/Process Group；缺 Chromium 不自动安装。

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

## 15. 当前实现证据与剩余边界

当前项目自有 Golden Fixture 已通过 Canonical Authoring V3 → NormalizedWorldIR V3 →
ExecutionPlan V4 → Babylon/Havok → CLI/Browser 的首个纵向切片：

- GLB 为 43,656 bytes；原始字节 Hash 为
  `sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2`；
- Normalized IR Hash 为
  `sha256:3b148412c45ac66e75bc4c57482c92b29ead3cc07e72b8ad006f9987b9655296`；
- ExecutionPlan Hash 为
  `sha256:a71c2aec80c2b8c81e43a82009a02be9be6df1729c286c967aede6e9ea516b59`；
- CLI 世界图与四张固定 Tick Action 图均为 936×596，四张 Action PNG Hash 两两不同；
- 两个 Subject 的位置与 `activeActionId` 独立，Havok 墙体停止有效；篡改 GLB 后
  Browser 稳定返回 `SUBJECT_ASSET_HASH_MISMATCH` 且磁盘资产 Hash 不变。

实现证据位于 `artifacts/examples/rigged-subject-world/verification.json`，一键 Gate 为
`pnpm verify:rigged-subject`。G Bot 的独立证据位于
`artifacts/examples/g-bot-subject-world/verification.json`，一键 Gate 为
`pnpm verify:g-bot-subject`。这两个结果不把任意后续产品资产、Compound Collider、
LOD、更多身体拓扑、独立动画资产、通用姿态、游泳、装备、坐骑或飞行标记为完成。
