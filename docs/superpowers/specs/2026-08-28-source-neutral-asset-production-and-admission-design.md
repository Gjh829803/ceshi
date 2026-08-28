# Source-neutral 资产生产与准入长期设计

- 状态：Proposed；架构草案待书面审阅，尚未实施
- 日期：2026-08-28
- 目标仓库：`agent-whitebox-world-sdk`
- 目标读者：SDK、Runtime、资产工具、上游 Agent、Studio、验证与安全团队
- 上位场景决策：[ADR-0007：Canonical 与 Babylon Native 场景创作双 Lane](../../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)
- Native 集成边界：[AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- Canonical 几何候选备忘：[AI 自定义场景几何扩展设计](./2026-08-20-ai-authored-geometry-extension-design.md)
- 既有来源资产范式：[Modular Subject Source Assets Design](./2026-08-25-modular-subject-source-assets-design.md)

> 本文定义的是两条 Scene Source 之前、与 Runtime 正交的离线资产生产与准入边界。它不增加第三条
> Scene Source，不授权运行时调用生成模型，也不把外部项目、模型输出或 Skill 变成 WorldKit
> 正确性权威。本文中的目标合同与工作图不表示仓库已经实现对应能力。

## 1. 决策摘要

项目采用一条 source-neutral、离线、候选先行的资产供应链：

```text
reference / brief / source asset
  -> AssetProductionRequestV1
  -> provider adapter or licensed-source resolver
  -> immutable raw candidate bytes + Candidate Manifest + Production Result/Receipt
  -> asset-class-owned deterministic build / normalization
  -> immutable admission input + class-specific Build Record
  -> read-only structural/visual inspection
  -> AssetAdmissionProfileV1
  -> AssetAdmissionReceiptV1
  -> AssetPublicationReceiptV1 + Registry resourceRef/content/license lock
  -> exactly one selected Scene Source references and places the asset
  -> existing WorldPackage / Runtime / Gameplay admission
```

这条供应链只产生**候选资产、证据和被接受后的资源引用**。它不产生世界级 Placement、Scene Graph、
Spawn、Collider、Route、NavMesh、Camera、Gameplay Entity 或 Runtime State。

项目继续只有两条 Scene Source：

- Canonical Lane 在 AuthoringSpec 中显式引用和放置已接受资源，再由现有 Compiler 投影；
- Babylon Native Lane 在 Module 中通过 `LockedAssetResolver` 加载已接受资源并显式创建 Transform；
- Asset Production 不是 Lane，也不能在任一 Scene Source 发布后追加一个 Dressing Overlay。

生成模型、素材库、DCC 与 WorldPlay/WorldMirror 类重建工具都是可替换的**离线来源**；Three.js 等
Engine Adapter 只消费和导入已生产资产，不是 Provider。Provider 的输出默认是不可信 Candidate；只有
通过项目 Admission、发布为精确 `...Ref` 并进入 Asset Lock 后，才可以被某条 Scene Source 消费。

## 2. 为什么需要独立的上游边界

当前设计已经定义了 Canonical 与 Babylon Native 如何创作和运行场景，但“GLB、纹理、角色外观和
重建场景壳从哪里来、如何验收、如何锁定”仍只有零散约束。若把这部分直接塞进 Native Module，会产生：

- `build()` 内下载、生成或修复资产，导致网络、凭据、费用和生命周期进入 Runtime 边界；
- 另一个 Scene Manifest 或 Provider DSL 拥有世界 Placement，形成第三条 Scene Source；
- 视觉 Mesh、碰撞、Route 和 Gameplay 语义被同一个生成结果隐式绑定；
- 缺少输入/输出 Hash、模型版本、许可证、尺度和朝向时仍可凭裸路径加载；
- Provider 失败后运行时按“本机有什么”选择回退资产，破坏确定性与 Receipt。

反过来，删除生成能力也不合理。参考图中的独特岩石、建筑部件、雕像、树木、人物外观和远景壳适合
由专用模型或成熟素材库提供。稳定点不是选择一个永久 Provider，而是冻结 Candidate、Admission、
Registry 与 Scene Source 的责任边界。

## 3. 目标与非目标

### 3.1 目标

- 让 Agent 以一个 Provider-neutral 请求描述单个资产的用途、参考、尺寸、朝向、预算和验收条件。
- 允许云模型、本地模型、授权素材库、DCC 或构建脚本在同一 Candidate/Receipt 边界后互换。
- 让所有候选在进入 Registry 前经过格式、供应链、坐标、预算和可视证据准入。
- 让 Canonical 与 Native 复用同一份内容寻址资产，而不共享世界 Placement 或 Scene Graph 协议。
- 对单图或视频重建结果建立明确的“视觉提案”边界，不把未知尺度和不可见面推断写成世界事实。
- 将视觉资产、Scene Source 显式构造的碰撞代理和 SDK-owned Havok 表示分离。
- 保留生成、授权素材和 Primitive 白膜之间的可审计回退顺序。
- 为正式开发提供可独立验证、依赖明确的工作图。

### 3.2 非目标

- 不增加 `sceneSource.kind: "generated"`、`"reconstruction"`、`"gamefactory"` 或类似成员。
- 不建立 `Scene Brief -> provider scene manifest -> Babylon adapter` 的隐藏视觉 Compiler。
- 不在 Native `build()`、Canonical Compiler 或 Runtime load 期间调用生成模型或下载任意 URL。
- 不让 Asset Manifest 描述世界坐标、道路、区域、Spawn、Collider、Route、Nav、Camera 或 Entity。
- 不扫描 Mesh 名称、节点、材质、颜色、Bounds 或 glTF `extras` 推断 Gameplay 语义。
- 不把整场景重建 Mesh 直接声明为可行走地表、碰撞真相或 Route Evidence。
- 不用本设计替代 Subject Definition、Rig、Animation Set、Action、Camera 或 Gameplay Bootstrap。
- 不在第一阶段承诺通用室内、动态刚体、车辆、可破坏物、移动平台或多人世界资产生产。
- 不要求 BNA V1 等待云端资产 Provider；BNA 可先使用已提交并锁定的 Golden GLB 完成 Kernel 闭环。

## 4. 权威与数据所有权

| 事实 | 唯一 Owner | 可以消费 | 禁止承担 |
|---|---|---|---|
| 生产请求、Provider 选择、费用预算 | Asset Production Host | Provider Adapter | 世界 Placement、Runtime State |
| 原始输出字节与 Provider 调用证据 | Candidate Store | 资产类别 Build Pipeline | Registry 真相、Collider |
| 派生字节、转换参数与 Build Record | Geometry/Subject 等资产类别 Owner | Asset Admission | Provider Receipt、世界 Placement |
| 格式、坐标、预算、许可证与视觉验收 | Asset Admission（只读） | Registry Publisher | 字节修复、Gameplay、Route |
| 不可变资产身份与内容 Hash | Registry / Asset Lock | Canonical 或 Native Source | Scene Transform |
| 世界 Placement 与 Scene 层级 | 当前被选择的 Scene Source | Babylon Scene Builder | Provider Pipeline |
| Collider 意图 | Canonical 合同或 Native 显式登记 | SDK Admission | Asset Manifest |
| Havok Shape、Body、Ground Support | SDK Runtime | Gameplay / Route 派生 | Provider、Native Visual |
| Subject、动作、输入、相机和状态 | Gameplay/Runtime 合同 | 两条 Scene Source | Asset Pipeline |

以下不变量用于防止第三条 Scene Source：

1. Asset Production 不出现在 `RuntimeSceneSource` Union 中。
2. Candidate 或 Asset Manifest 不包含世界 Transform；本地坐标、Pivot 和 Bounds 不等于 Placement。
3. Canonical 必须在编译前声明资源引用与实例 Placement；编译后不得追加生成资产 Overlay。
4. Native Module 必须通过锁定 Resolver 加载资源并自己创建 Placement；不得只转交另一个世界包的
   Scene Graph 并让后者拥有场景语义。
5. Asset Production 结束后只能发布不可变资源，不能持有 Scene、Engine、Camera、Render Loop、Input、
   Timer、Physics 或 Dispose 生命周期。

## 5. 资产类别与场景生成路由

### 5.1 V1 可发布类别

- 静态单体 GLB：岩石、树木、建筑部件、雕像、道具和独立 Landmark。

V1 **不接收 Subject Model**。当前真正的 modular Subject source-model 合同仍由
`scripts/lib/modular-subject-source.ts` 中的 `SubjectModelAssetManifestV1` 实验实现持有，而
`packages/subject-registry/**` 的 `SubjectAssetManifestV1` 是面向 Runtime/Registry 的另一层资源合同，
两者不能混用。后续 Subject 资产切片必须先把 source-model 合同迁入唯一 package Owner，并用闭合
`static | rigged` Union 冻结 `rigProfileRef` 与预期 Rig Signature；在此之前不得把生成的角色模型接入
本 V1 Pipeline。

纹理、环境贴图、音频和其他媒体以后可以复用相同的 Candidate/Receipt/Admission 原则，但它们具有不同
的尺寸、格式、版权和 Runtime Import Profile，不能硬塞进 V1 空间 GLB 合同；扩展时使用新的闭合
`output.kind` 成员、Profile 和版本化 Schema。

`scene-shell` 不属于 V1 可发布类别；它只允许按第 5.3 节产生 research artifact。第一阶段不接受以一个
资源包同时表达完整世界、Gameplay 和 Physics 的“可玩场景资产”。融合 Mesh 也
不能冒充可活动结构：车轮、门、箱盖、人物肢体等必须拆成独立资产或进入 Subject/Gameplay 合同。

### 5.2 场景类型路由

| 场景类型 | 默认生产路线 | 重建模型的允许用途 | Gameplay 地表来源 |
|---|---|---|---|
| 开放户外、山地、道路、城市街区 | ground/terrain-first，再布置单体资产 | 深度提示、多视角提案、远景参考；不发布整景地表 | 当前 Scene Source 显式创作并登记 |
| 封闭、静态、以视觉为主的空间 | 可做 artifact-only 的多视角 `scene-shell` 研究 | 只产生比较证据；V1 不发布 `assetRef`、不进入运行包 | 当前 Capability Gap；不得从壳自动推断 |
| 动态或可交互结构 | 拆成独立资源和 Gameplay 定义 | 只辅助外观，不输出交互语义 | SDK/Canonical/Native 正式合同 |
| 无强视觉身份的背景或道具 | 优先已登记、许可证明确的资产 | 仅在缺少合适资产时生成 | 与视觉资源独立 |

对单张参考图，不可见区域只能记录为推断。World model 生成的相机外延、多视角或隐藏表面不能覆盖
Scene Brief 中“可见证据 / 推断延续”的 provenance 区分。

### 5.3 `scene-shell` 的最窄边界

`scene-shell` 在 V1 是 research artifact，不是普通可发布资产，更不是第三条 Lane。它必须满足：

- 只写入 `artifacts/asset-production/**`，不得发布 Registry `assetRef`、进入 WorldPackage 或被 Native/
  Canonical Runtime 加载；
- 只用于评估封闭空间重建质量；不得把一个房间、关卡或多个独立地标的相对布局封装成可复用资源；
- 声明米制校准依据、Up/Forward、Pivot、Bounds 和 `referenceCaptureEvidenceRef`；该字段只指向离线视觉
  证据，不是 Camera、Placement 或 Runtime 元数据；
- 不携带或触发 Spawn、Collider、Route、NavMesh、Camera、Entity 或 Gameplay 字段；
- 不允许天空幕布、深度拉伸、孔洞、悬空碎片或未闭合可见面静默通过；
- 视觉与结构检查通过只表示研究样本可比较，不产生 Admission Receipt 或生产能力声明；
- 若未来要让 aggregate/shell 进入 Runtime，必须另立 ADR、机器可判定的 asset-local aggregate 边界和
  独立 Gate；不得通过扩展 V1 Profile 偷渡。

### 5.4 场景采用资产前冻结路由与创作尝试

单资产生产可以作为独立、可复用的离线工作发生，不依赖 Scene Lane，也不要求先创建场景路由。Host 在
创建 Scene Module、组装完整 Scene Authoring Attempt 或将某个生产结果/已发布资源选入场景前，必须产生
一份版本化、可哈希的 `SceneAuthoringRouteDecisionV1`。它至少冻结：Scene Brief/参考输入 Hash、所需 Gameplay/Route/ChangeSet
能力、Trust Profile、被选择的 `sceneSource.kind`、组合策略、允许的资产生产方式、Blocking Gap 和验收
目标，以及按场景需求选择的闭合 `fallbackPolicy`。判断顺序固定为：

1. Trust 与当前已发布能力；
2. Route、ChangeSet、确定性 Solver 等不可降级要求；
3. 开放/封闭空间与可交互拓扑；
4. 视觉身份、参考构图、许可证、资源和费用预算；
5. 允许的生成、授权资产或 Primitive 回退。

后项不得覆盖前项的 Blocking Gate。BNA-8 之前的正式生产请求、尚未通过 Hosted Gate 的 Native 请求、
当前不支持的室内/洞穴/多层动态表面，必须选择已发布能力或报告 Capability Gap，不能因外部重建工具
“可以显示”而升级为产品支持。

`fallbackPolicy` V1 使用关闭成员：`existing-resource-then-primitive`、
`generated-then-equivalent-resource-then-primitive` 或 `no-fallback`。Primitive 仅在不改变冻结验收语义时
可用；否则该成员的最终结果仍是明确 Capability Gap。

每次完整的场景创作运行对应一个版本化 `SceneAuthoringAttemptV1`，绑定
`SceneAuthoringRouteDecisionV1` Hash、Bootstrap/Authoring 输入、Module 输入、被选择的 Asset
Resource Ref/Publication Receipt Ref、Seed/Profile、验收标准和证据要求。它是场景创作工作流状态，不是
单个 Provider invocation，不是 `RuntimeSceneSource`，也没有已发布的 `WorldBuildIdentity`。单资产生产
使用自己的 Request/Result ID；未完成或失败的 Production/Admission 不伪造场景 Attempt。

以下变化必须创建新 Attempt，并使旧 Attempt 从最早受影响的**场景级** Gate 起失效：

- Canonical/Native Lane 或组合策略变化；
- Source、被选择的已发布 Asset Resource、Seed、Profile、预算或许可证变化；
- 从重建提案切换为 ground-first、授权资产或 Primitive；
- 验收目标或必需 Gameplay 能力变化。

`SceneAuthoringAttemptV1` 不得简称为 Runtime Candidate。Native 长期设计中的 **Runtime Candidate Scene**
专指 Host 创建、尚未附着 SDK Kernel 的临时 Babylon Scene；两者身份、生命周期和失败处置完全不同。
路线切换不能复用旧的 Source/Package/Contribution/Collider/Route 证据，也不能用旧 Collider/Route 证据
为新视觉背书。Asset Admission 不受 Attempt 拥有：只要被检查字节、Asset Admission Profile、许可证和
Provenance 完全相同，同一内容寻址资产及其 Admission/Publication Receipt 可以跨 Attempt、Canonical/
Native Lane 复用；其中任一项变化才重跑对应的 Asset Gate。

`SceneAuthoringRouteDecisionV1` 与 `SceneAuthoringAttemptV1` 的 Schema、Parser、Canonical Hash 和生命周期
由 Native 长期设计 BNA-1 的 source-neutral routing boundary 独占；APA Request/Result 不引用、不复制也
不修改场景路线合同。BNA-1 的完整 Attempt 在采用资产时只记录最终 Registry Resource Ref 与 Publication
Receipt Ref，BNA-3 再验证这些引用与 Package Asset Lock 一致。这样 Asset Production 可跨场景
复用，Route/Attempt 也不会反向成为 APA 的先行依赖。

## 6. 目标合同

本节冻结语义，不表示类型已经存在。APA-1 必须将 JSON Schema、TypeScript 类型、Parser、示例和负向
测试一次性冻结；不得让 Provider Adapter 各自发明同义字段。

### 6.1 `AssetProductionRequestV1`

```ts
interface AssetProductionRequestCommonV1 {
  readonly kind: "asset-production-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly source:
    | Readonly<{
        kind: "generative-provider";
        providerProfileRef: string;
        inputRefs: readonly string[];
        generationPrompt: string;
        seed: number;
      }>
    | Readonly<{
        kind: "local-build";
        buildProfileRef: string;
        inputRefs: readonly string[];
        seed: number;
      }>
    | Readonly<{
        kind: "licensed-source";
        sourceArtifactRef: string;
        licenseDocumentRef: string;
      }>;
  readonly budgets: Readonly<{
    triangleCountMax: number;
    nodeCountMax: number;
    textureDimensionPixelsMax: number;
    textureBytesMax: number;
    artifactBytesMax: number;
  }>;
}

type AssetProductionRequestV1 = AssetProductionRequestCommonV1 &
  Readonly<{
    output: Readonly<{
      kind: "static-mesh";
      intendedRole: "scenery" | "landmark" | "prop";
      targetApproximateSizeMetersXYZ: readonly [number, number, number];
      localForwardAxis: "-Z" | "+Z" | "-X" | "+X";
      localUpAxis: "+Y";
      pivot: "support-center" | "centroid";
    }>;
  }>;
```

规则：

- 当前对象使用 `id`；Registry/内容资源使用 `...Ref`；Provider Handle、URL 和文件路径不进入请求。
- `source.kind` 是闭合判别器；生成、本地构建和许可证来源不能同时存在或用 optional 字段混合。
  `output.kind` V1 只有 `static-mesh`；新增资产类别必须扩版本，不能用 optional 字段偷渡。
- `inputRefs`/`sourceArtifactRef` 只引用 Host 已解析的输入；Host 在提交前锁定实际字节 Hash。
- `providerProfileRef`/`buildProfileRef` 选择 Host/tenant allowlist 中的执行配置，不让 Agent 提交凭据、
  Endpoint 或任意模型名。
- 尺寸、Forward、Up、Pivot 和预算是生产输入，不允许只在导入失败后临时猜测。
- 请求不包含世界 Position/Rotation/Scale、`collidable`、`walkable`、Spawn 或 Route 字段。

### 6.2 `AssetCandidateManifestV1` 与 `AssetProductionResultV1`

Candidate Store 中的每个原始输出都有一个不可变 `AssetCandidateManifestV1`。它只记录 Candidate `id`、
Production Request ID/Hash、输出序号、Media Type、`sizeBytes`、内容 Hash、Candidate 根内的 canonical
relative path 和未声明副文件清单；它不包含 Registry Ref、世界 Transform 或 Gameplay 字段。

```ts
interface AssetCandidateManifestV1 {
  readonly kind: "asset-candidate-manifest";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly productionRequestId: string;
  readonly productionRequestHash: string;
  readonly outputIndex: number;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly relativePath: string;
  readonly undeclaredRelativePaths: readonly string[];
}
```

Provider/Resolver 的调用结果使用关闭 Union：

```ts
type AssetProductionResultV1 =
  | Readonly<{
      kind: "asset-production-result";
      schemaVersion: 1;
      id: string;
      requestId: string;
      requestHash: string;
      outcome: "completed";
      productionReceiptRef: string;
      candidateManifestRefs: readonly string[];
    }>
  | Readonly<{
      kind: "asset-production-result";
      schemaVersion: 1;
      id: string;
      requestId: string;
      requestHash: string;
      outcome: "unknown";
      reconciliationRef: string;
      diagnosticRefs: readonly string[];
    }>
  | Readonly<{
      kind: "asset-production-result";
      schemaVersion: 1;
      id: string;
      requestId: string;
      requestHash: string;
      outcome: "rejected" | "tool-error";
      diagnosticRefs: readonly string[];
    }>;
```

`unknown` 只表示一次非幂等提交的结果尚未对账，不能进入 Build/Admission，也不能自动重提。只有
`completed` 可以引用 Candidate；`rejected`/`tool-error` 不得伪造 Receipt 或 Candidate Ref。

### 6.3 `AssetProductionReceiptV1`

Production Receipt 只证明**原始来源调用与原始输出**，至少锁定：

- Request canonical bytes 与 Hash；
- 排除 Request `id` 和 Invocation 字段、可用于等价缓存的 `productionDefinitionHash`；
- 每个输入 Ref 的实际字节 Hash；
- 对 generative source：Provider Profile Ref、Provider 与模型的 `resolvedVersion`、Seed、精确 Prompt Hash
  和 Provider Task ID；
- 对 local-build/licensed source：Build Profile/Source Artifact/License Ref 与实际解析版本、Hash；
- 每个原始输出的 Candidate Manifest Ref/Hash、Media Type、`sizeBytes` 和内容 Hash；
- 适用时记录 Provider 报告的资源用量、费用单位和警告；
- 确定性请求身份与单次 Invocation Attestation 的分离。

时间、机器、调用延迟和费用属于单次 Attestation，不参与资产内容 Hash。Provider Task ID 用于未知提交
结果的对账，不是 Registry Asset ID。Production Receipt 不得声称执行格式转换、坐标烘焙或网格清理；
原始输出字节永久只读。

### 6.4 资产类别 Build Record

Provider 原始输出不能被“原地 normalization”。若字节需要去背景、去地板、格式转换、坐标烘焙、网格
清理或压缩，必须进入资产类别 Owner 的确定性 Build Pipeline，产出新的不可变字节和 Build Record。
APA-G0 冻结新的 `StaticGeometryBuildRecordV1`，而不是沿用探索备忘中的
`GeometryBuildRecordV1` 名称：

```ts
interface StaticGeometryBuildRecordV1 {
  readonly kind: "static-geometry-build-record";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly buildType: "worldkit.static-geometry.normalize/v1";
  readonly input: Readonly<{
    candidateManifestRef: string;
    candidateContentHash: string;
    mediaType: "model/gltf-binary";
  }>;
  readonly buildProfileRef: string;
  readonly buildProfileHash: string;
  readonly externalParametersRef: string;
  readonly externalParametersHash: string;
  readonly resolvedTools: readonly Readonly<{
    id: string;
    resolvedVersion: string;
    contentHash: string;
  }>[];
  readonly outputArtifact: Readonly<{
    relativePath: string;
    mediaType: "model/gltf-binary";
    sizeBytes: number;
    contentHash: string;
  }>;
  readonly coordinateConvention: Readonly<{
    localForwardAxis: "-Z" | "+Z" | "-X" | "+X";
    localUpAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center" | "centroid";
  }>;
  readonly bounds: Readonly<{
    minimumMetersXYZ: readonly [number, number, number];
    maximumMetersXYZ: readonly [number, number, number];
  }>;
  readonly inventory: Readonly<{
    meshCount: number;
    nodeCount: number;
    vertexCount: number;
    triangleCount: number;
    materialCount: number;
    textureCount: number;
    animationClipCount: 0;
  }>;
  readonly diagnosticRefs: readonly string[];
}
```

最终发布由同一 Owner 产生：

```ts
interface StaticGeometryAssetManifestV1 {
  readonly kind: "static-geometry-asset";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly artifact: Readonly<{
    relativePath: string;
    mediaType: "model/gltf-binary";
    sizeBytes: number;
    contentHash: string;
    format: "glb";
    gltfVersion: "2.0";
  }>;
  readonly coordinateConvention: StaticGeometryBuildRecordV1["coordinateConvention"];
  readonly bounds: StaticGeometryBuildRecordV1["bounds"];
  readonly inventory: StaticGeometryBuildRecordV1["inventory"];
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly provenance: Readonly<{
    productionReceiptRef: string;
    productionReceiptHash: string;
    buildRecordRef: string;
    buildRecordHash: string;
    admissionReceiptRef: string;
    admissionReceiptHash: string;
    classAdmissionDescriptorRef: string;
    classAdmissionDescriptorHash: string;
    licenseDocumentRef: string;
    licenseSpdxExpression: string;
    sourcePolicy: "redistributable" | "internal-only";
  }>;
}
```

其字段不得含世界 Transform、Gameplay 或 Collider 语义。`AssetPublicationReceiptV1` 反向锁定最终
Manifest Hash，Manifest 不自引用 Publication Receipt，避免哈希环。探索备忘中的 `geometryDefinitionRef`、
`compilerProfileRef`、`geometryAssetRef` 和 `colliderBuild` **不属于**这个 V1 Build Record；
`worldkit.geometry.compile/v1` 也不是本 Pipeline 的 Build Type。这样采纳的是 GLB Profile 和可复现构建
原则，不是隐藏的 Canonical Compiler 或 Physics Owner。

`externalParametersRef` 指向内容寻址的 canonical 参数 bytes，Hash 单独复验；不能只保存一个无法重放的
摘要。Build Record 锁定全部转换参数、输出内容 Hash、Inventory 和 Diagnostics；单次机器/时间信息留在独立
Attestation。即使原始字节已符合目标 Profile，也要产生 identity build record，使 Admission 没有未记录
的旁路。Source-neutral APA 合同只持有 `classBuildRecordRef`/Hash，不复制几何字段。Asset Admission 只读
检查 Build 输出；它不得改字节、修 Bounds、烘焙 Transform 或生成另一份派生产物。

### 6.5 `AssetAdmissionReceiptV1` 与 `AssetAdmissionResultV1`

Admission Receipt 是关闭 Union。共同字段通过 `classAdmissionDescriptorRef`/Hash 锁定资产类别 Owner 解析
出的格式、坐标、Bounds、Inventory 与 Extension，不把几何字段复制进 source-neutral envelope：

```ts
interface AssetAdmissionReceiptCommonV1 {
  readonly kind: "asset-admission-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly productionReceiptRef: string;
  readonly productionReceiptHash: string;
  readonly classBuildRecordRef: string;
  readonly classBuildRecordHash: string;
  readonly admissionInputContentHash: string;
  readonly admissionProfileRef: string;
  readonly admissionProfileHash: string;
  readonly classAdmissionDescriptorRef: string;
  readonly classAdmissionDescriptorHash: string;
  readonly licenseDocumentRef: string;
  readonly licenseDocumentHash: string;
  readonly licenseSpdxExpression: string;
  readonly sourcePolicy: "redistributable" | "internal-only" | "prohibited";
  readonly structuralEvidenceRefs: readonly string[];
  readonly visualEvidenceRefs: readonly string[];
  readonly diagnosticRefs: readonly string[];
}

type AssetAdmissionReceiptV1 =
  | (AssetAdmissionReceiptCommonV1 & Readonly<{ outcome: "accepted" }>)
  | (AssetAdmissionReceiptCommonV1 & Readonly<{ outcome: "rejected" }>);

type AssetAdmissionResultV1 =
  | Readonly<{
      kind: "asset-admission-result";
      schemaVersion: 1;
      id: string;
      outcome: "accepted" | "rejected";
      admissionReceiptRef: string;
      admissionReceiptHash: string;
    }>
  | Readonly<{
      kind: "asset-admission-result";
      schemaVersion: 1;
      id: string;
      outcome: "tool-error";
      diagnosticRefs: readonly string[];
    }>;
```

`accepted` 只表示该精确资产输入**有资格进入发布步骤**，不声称资源已存在。`rejected` 明确禁止任何
Registry Resource/Manifest/Publication Ref；`tool-error` 不得伪造 Admission Receipt。

Registry 发布拥有独立关闭合同：

```ts
interface AssetPublicationReceiptV1 {
  readonly kind: "asset-publication-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly admissionReceiptRef: string;
  readonly admissionReceiptHash: string;
  readonly classBuildRecordRef: string;
  readonly classBuildRecordHash: string;
  readonly assetResourceRef: string;
  readonly resourceVersion: number;
  readonly artifactContentHash: string;
  readonly resourceManifestHash: string;
}

type AssetPublicationResultV1 =
  | Readonly<{
      kind: "asset-publication-result";
      schemaVersion: 1;
      id: string;
      outcome: "completed";
      publicationReceiptRef: string;
      publicationReceiptHash: string;
      assetResourceRef: string;
      resourceVersion: number;
      artifactContentHash: string;
      resourceManifestHash: string;
    }>
  | Readonly<{
      kind: "asset-publication-result";
      schemaVersion: 1;
      id: string;
      outcome: "rejected" | "tool-error";
      admissionReceiptRef: string;
      admissionReceiptHash: string;
      diagnosticRefs: readonly string[];
    }>;
```

`AssetPublicationReceiptV1` 只能在资源字节、Manifest、License/Provenance 与索引已经原子提交后创建；发布
失败不得留下声称资源存在的 Receipt。`rejected` 表示政策或 identity 不满足，`tool-error` 表示发布工具/
环境失败；两者至少有一个稳定 Diagnostic Ref。Admission `accepted` 不允许
`sourcePolicy: "prohibited"`；Publication Result 与 Receipt 的重复 identity 字段必须 exact-equal。

缺少字段不是“未知但可接受”。身份、Hash、尺度、坐标、许可证或预算证据缺失必须 Fail Closed。

## 7. 离线生产生命周期

1. Agent 或 Host 先形成逐资产 Request；不能用 Asset Plan 描述整个世界每个实例的 Placement。
2. Host 解析 Profile、输入 Ref、预算和凭据边界；Request 的 `id` 是唯一提交身份，Host 不再生成第二个
   同义 `requestId`。
3. 对非幂等 Provider 创建请求只提交一次；超时后状态为 Unknown，必须通过 `(id, requestHash)` 与
   Provider Task ID
   对账，不能直接再次创建任务。
4. Provider 输出先进入隔离 Candidate 目录；拒绝 symlink、路径逃逸、任意外部 URI 和未声明副文件。
5. 资产类别 Build Pipeline 只读原始字节，原子写入新的派生字节和 class-specific Build Record；原始
   Production Receipt 不变。
6. Asset Admission 只读检查 Build 输出；结构检查通过后生成固定正交视图和适用的参考捕获视图，再做
   视觉检查。
7. Admission 通过后由资产类别 Owner 原子发布 Registry Resource、Manifest、许可证和
   `AssetPublicationReceiptV1`，再返回 `AssetPublicationResultV1.outcome: "completed"`；失败 Candidate
   不得部分发布，也不得获得 Resource Ref。
8. Scene Source 只能消费最终锁定 Ref；运行时不读取 Candidate Store、Build Workspace 或 Provider Cache。

Host 还要计算排除 Request `id` 与单次 Invocation 字段的 `productionDefinitionHash`。它覆盖闭合
`source`/`output`/`budgets`、全部锁定输入 Hash、Resolved Provider/Model/Build Profile 与 Seed。Provider
Cache 以该 Definition Hash 为主键；Request 的完整 canonical Hash 继续服务单次提交身份和
`(id, requestHash)` 对账。命中时必须复验输出字节 Hash，不得使用“文件存在即命中”、把新的 Invocation
ID 当 Cache miss，或缺少身份字段仍视为匹配的弱缓存。

## 8. Asset Admission

### 8.1 结构 Gate

适用于 GLB 的最低 Gate：

- 自包含 glTF 2.0 GLB，Media Type 与扩展名一致；
- Khronos Validator 零 Error，Warning/Extension 受 Profile allowlist 约束；
- 无外部 Buffer/Image URI、脚本、未知 Required Extension 或路径逃逸；
- Position/Index/Normal、Transform、Accessor 范围与 Alignment 有效；
- 无 NaN、Infinity、越界 Index、零/负尺度、未烘焙 Shear 或异常 Root Transform；
- 明确米制尺度、`+Y` Up、已声明 Forward、Pivot、Bounds 和接地点；
- Mesh、Node、Triangle、Texture、Animation、Artifact Bytes 全部在有效预算内；
- 静态 Mesh 匹配 V1 唯一闭合 Profile，且 `animationClipCount` 必须为 `0`；`subject-model` 与
  `scene-shell` 都不存在 V1 可发布 Admission Profile。

具体 GLB Profile 采纳现有 Geometry 探索备忘中与 Runtime Delivery 相关的约束，但使用第 6.4 节的新
Owner/合同；本设计不另造 Provider-specific glTF 方言。

### 8.2 视觉 Gate

静态 Mesh 至少生成 `front/right/back/left/top` 正交视图，并检查：

- 对象身份、轮廓和背面是否成立；
- 是否被参考图裁切后错误补全，或附带意外地板、背景和其他对象；
- 朝向、真实尺寸、Pivot、接地点和局部原点是否可复现；
- 材质槽、透明区域、纹理分辨率和接缝是否在 Profile 内；
- 重复资产是否适合实例化，活动部件是否需要拆分。

artifact-only `scene-shell` 研究还要检查 reference capture 对齐、多视角漂移、天空幕布、遮挡边缘拉伸、
孔洞、不连续表面和悬空碎片。该研究 QA 可以有人类或模型参与，但其输入、输出和版本必须记录；结果不
是生产 Admission，也不能替代结构 Gate。

### 8.3 证据分层

- **生产证据**：Provider、输入、模型版本、Seed、费用和输出 Hash；
- **结构证据**：格式、坐标、Inventory、预算、许可证和 Validator；
- **视觉证据**：正交视图、reference capture 视图和审查结果；
- **Gameplay 证据**：只有资产被 Scene Source 放置、Collider 被显式登记并由 SDK 运行后才能产生。

前三层通过不能宣称 Spawn Support、Passability、Route、Nav 或 Gameplay 正确。

## 9. Scene Source 与物理集成

### 9.1 Canonical Lane

- 只有当前 Canonical Schema/Compiler 明确支持的资源类别才能进入 AuthoringSpec；缺失能力必须报告，
  不能用后处理 Overlay 绕过 Compiler。
- AuthoringSpec 声明精确 Resource Ref、Prototype/Subject 绑定和世界 Placement；Compiler 继续拥有 IR、
  ExecutionPlan、Collider/Surface 和 Package 投影。
- 本文只采纳 2026-08-20 Exploratory Geometry Memo 的静态资源 Manifest/Build Record 窄语义；不启用
  其 Canonical Geometry Source/Recipe/Compiler Roadmap。Canonical 何时能引用该资源仍由独立 Canonical
  版本与 Compiler Gate 决定。

### 9.2 Babylon Native Lane

- Bootstrap/Package 在构建前锁定最终 Asset Ref；Module 只通过 `context.assets`/
  `LockedAssetResolver` 解析，不接收裸路径、URL、Provider Handle 或 Candidate 目录。
- Native Module 创建资产实例、局部到世界 Transform 和视觉层级；Asset Pipeline 不提供 Placement。
- 不允许 `assets.has([a, b, c])` 在运行时按本机可用文件选择回退；选择结果必须在打包前冻结。
- V1 不加载 `scene-shell`；research artifact 不是 `assetRef`，也不能被 `LockedAssetResolver` 解析。

### 9.3 Collider 与 Traversal

V1 Asset Production **不生成、不发布 Collider Proxy 资产**。碰撞代理由被选择的 Scene Source 在自己的
正式合同内显式构造：Native 使用局部 Primitive/简化 Mesh 并调用 `registerStaticCollider`，Canonical 使用
其 Collider/Surface 合同；随后 SDK 冻结世界坐标贡献并创建 Havok。若未来需要可复用的离线 Proxy 资产，
必须新增带独立 `purpose`、Profile 和 Admission 的版本化资产类别，但通过该 Admission 仍不自动授予
`collidable` 或 `walkable` 语义。

```text
selected Scene Source explicitly constructs a local proxy
  -> Native registerStaticCollider or Canonical Collider/Surface contract
  -> SDK freezes world-space contribution
  -> SDK creates Havok
```

Asset Manifest 不提供 `collidable`、`walkable`、`playable` 或 `spawnable` 开关。Native 必须显式登记；
Canonical 必须使用正式 Collider/Surface 合同。SDK 不扫描视觉 Mesh 或代理元数据猜测物理。Route/Nav
只能从同一份冻结 Surface 派生，不能从 Candidate 或 `scene-shell` 另建真相。

## 10. Package、来源与许可证

被世界引用的每个资产至少进入以下锁：

- Registry Resource Ref、Manifest Hash、实际字节 Hash、Media Type 与 `sizeBytes`；
- Source/License 文档 Ref、SPDX Expression 或明确的内部 LicenseRef；
- Production Request/Result/Receipt Hash、class-specific Build Record Hash、Admission Receipt/Profile Hash 与
  Asset Publication Receipt Hash；
- generative source 的 Provider/模型 `resolvedVersion`、Seed、Prompt Hash 和输入 Ref/Hash，或
  local-build/licensed source 的 Source Profile/Source Artifact/License Ref 与 Hash；
- 坐标、尺度、Forward、Pivot、Bounds、Inventory 和 Runtime Import Profile；
- 所有派生转换的工具版本、参数和输出 Hash；
- 正交/多视图证据 Ref 与审查 Outcome。

不得发布 `latest`、可变 URL、绝对路径、未锁定 CDN 对象或“当前目录中的 model.glb”。变更原始输入、
Provider/模型版本或原始输出会产生新 Production Receipt；变更 Build 输入、Profile、工具或转换参数会
产生新 class-specific Build Record。若发布字节变化，则必须产生新资源版本/Ref；引用它的世界在下一次
Package build 时产生新的 Package Root 和 World Build Identity。Scene Lane、Placement 或 Authoring
Attempt 变化本身不使未变化资产的 Admission 失效。

凭据只从 Host 私有配置或环境加载，不进入 Request、Receipt、Prompt、Artifact、日志或 Package。

## 11. 回退、失败与诊断

回退不是全局排序，而是 `SceneAuthoringRouteDecisionV1.fallbackPolicy` 的关闭成员：

- 无强视觉约束：优先已发布的 licensed/owned Registry asset，其次 deterministic primitive/procedural
  whitebox，最后显式 Capability Gap；不为“使用生成”而先生成。
- 外观受参考约束且 Route 明确允许生成：generated attempt 被拒绝或不可用后，可选择满足同一验收语义的
  licensed/owned published asset；只有不改变验收目标时才可使用 Primitive，否则报告 Capability Gap。
- Route/Gameplay/License/Budget 的 Blocking 条件没有回退；后项不能降低前项 Gate。

回退必须在打包前完成并写入 Lock。它不能降低 Collider、Route、License、Budget 或 Receipt Gate，也不能
在运行时根据文件存在性静默切换。Rejected Candidate 可以保存在
`artifacts/asset-production/<request-id>/<run-id>/` 作为实验和修复证据，但不得进入正式 Registry。换用
资产或组合策略会创建新的 `SceneAuthoringAttemptV1` 并重放受影响场景 Gate；若已有资产的字节、Admission
Profile、License 与 Provenance 未变，其 Asset Admission/Publication Receipt 仍可复用。

`AssetDiagnosticV1.stage` 使用关闭枚举：

`request | tooling | provider-submission | candidate-staging | class-build | structural-admission |
visual-admission | registry-publish`

每条 Diagnostic 使用稳定 `code`、`severity`、关闭 `location`（Request JSON Pointer、Candidate Ref、
Build Record Ref、Resource Ref 或 none）、关闭单位 Measurement 和 Diagnostic `id`。Result/Receipt 只通过
`diagnosticRefs` 关联；不得复制 Provider 任意对象。Outcome 不变量与 Native 一致：成功不得含 Error，
rejected 至少含一条 Error，tool-error 至少含一条 `stage: "tooling"` Error。Diagnostic Family 至少区分：

- Request Schema/Profile 拒绝；
- Provider 创建失败与提交结果 Unknown；
- Candidate 路径、Media Type、Hash 或 Cache 不一致；
- GLB/坐标/尺度/Pivot/预算拒绝；
- License/Source Policy 拒绝；
- Build Record 缺失、输入/输出 Hash 不闭合或 Admission 试图修改字节；
- research-only `scene-shell` 试图发布 Registry Ref、进入 Package/Runtime 或携带 Gameplay/Physics 元数据；
- Admission/Publication Receipt 过期、篡改或与发布字节不匹配；
- Registry 原子发布失败；Package Lock 失败由对应 Scene Source/WorldPackage Diagnostic 拥有。

APA-1/APA-2 冻结稳定错误码、JSON Pointer/Path、Expected/Actual 和 CLI Exit 语义；实现不得只返回 Provider
字符串 Error。

## 12. 外部实现证据：GameFactory-3A

本节固定到 OpenDCAI/GameFactory-3A 提交
[`d56fd171ce18cac554478b769e05b7b1605ce9bd`](https://github.com/OpenDCAI/GameFactory-3A/commit/d56fd171ce18cac554478b769e05b7b1605ce9bd)。
外部实现是设计证据，不是依赖或规范权威。

可借鉴事实：

1. 源码将资产生成拆为 Model（本地权重或云 API backend 调用）、Operator（任务语义与产物）、Pipeline（批处理、CLI 与
   汇总），并另设 Engine Adapter 负责引擎导入；产物按 `(game_id, run_id, task_kind, task_id)` 寻址。
   该分层与寻址方式是本文设计 Provider-neutral Candidate 和任务身份边界的参考，但 GameFactory-3A
   本身未定义这一合同。参考：
   [Harness 三层](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/agent_skills/develop_harness/README.md#L33-L51)、
   [Engine Adapter](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/README.md#L39-L53)、
   [路径权威](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/pipeline/common/paths.py#L4-L35)。
2. Three.js 专用 `run_art_plan` helper 可以从预置 Art Plan 传递角色预算、`forward_axis` 与
   `scale_hint_metres`，并可在 Three 项目存在且启用 preview 的导入路径中生成方向检查图；QA Skill
   要求据此接受、重生成或拒绝资产。
   Three Runtime 的 `instantiateOrBuild` 还允许调用方在资产不可用时使用其提供的 Primitive factory。
   这些是专用 helper 与策略，不是所有 3D Object Candidate 的统一 Admission 保证。参考：
   [Art Plan](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/operators/gen_3d_object/funcs/art_plan.py#L78-L93)、
   [Operator helper](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/operators/gen_3d_object/operator.py#L268-L343)、
   [方向预览](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/operators/gen_3d_object/funcs/asset_import.py#L89-L178)、
   [QA 接受/重生成/拒绝](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/agent_skills/asset_qa/3d_object/SKILL.md#L95-L107)、
   [Primitive fallback](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/three_js/plugin/A3GamePlayable/src/engine/asset-library.js#L259-L285)。
3. Ground-first + objects 在 Scene Skill 中以推荐策略出现；当前已实现的 `gen_3d_scene/run.py` 仅暴露
   WorldMirror 的 frames-to-mesh 与 WorldPlay 的 image-to-frames-to-mesh 两种重建 backend。上述已引用
   实现中没有 ground-first 语义地形或布局编译入口。参考：
   [Scene Skill](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/agent_skills/asset_qa/3d_scene/SKILL.md#L86-L116)、
   [Scene Runner](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/pipeline/assets_gen/gen_3d_scene/run.py#L13-L19)。
4. WorldMirror 明确说明重建尺度任意、只保证帧间一致；单图且无 WorldPlay 时只生成相机可见表面。
   因此其输出不能直接成为米制世界、Collider 或 Route 权威。参考：
   [WorldMirror 尺度](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/models/gen_3d_scene/world_mirror_model.py#L146-L161)、
   [单图限制](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/operators/gen_3d_scene/operator.py#L166-L184)。
5. Three Source Resolver 要求任务 descriptor 与 `meta.json`，限制产物留在任务目录，并拒绝已出现但
   不一致的身份字段；它不要求这些身份字段全部存在，也不校验内容摘要或 Freshness。Three Runtime
   Manifest 发布 ID、类型、URL、能力、动画、Bounds 与 Orientation，但没有把输入/输出 Hash、License、
   Provider/模型版本或 Freshness 作为 Admission 必填谓词；本文采用更强 Receipt。参考：
   [Source Resolver](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/three_js/assets/_internal/source_resolver.py#L50-L226)、
   [Manifest 字段](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/three_js/assets/_internal/service.py#L533-L591)。
6. Three.js Runtime 的碰撞实现明确是 Raycaster ground/wall/hitscan primitive，而不是物理引擎；视觉
   对象可直接进入碰撞目标。本文据此只把它视为原型级机制，不把它作为 WorldKit Havok/Route 真相。参考：
   [Collision Probe](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/three_js/plugin/A3GamePlayable/src/engine/collision-probe.js#L1-L268)、
   [Scene Loader](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/engine_adapters/three_js/plugin/A3GamePlayable/src/engine/scene-loader.js#L411-L430)。

固定源码实现了多个可替换 backend，并用 Skill 文档指导外部 Coding Agent 规划和调用各资产 Pipeline；
所引用入口没有定义仓库内通用 Agent Orchestrator 或 source-neutral Admission 合同。因此，该项目为
“外部 Agent 编排离线资产组件”提供了工程先例；其场景尺度、可见面重建、导入时较弱的 metadata/path
checks 和 Raycaster 碰撞限制，则支持本文继续保持 Scene Source、Package、Havok 与 Route 的严格边界。参考：
[外部 Agent 入口](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/README.md#L138-L154)、
[Agent workflow](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/agent_skills/setting_overview.md#L37-L68)、
[3D 多 backend](https://github.com/OpenDCAI/GameFactory-3A/blob/d56fd171ce18cac554478b769e05b7b1605ce9bd/pipeline/assets_gen/gen_3d_object/run.py#L12-L16)。

## 13. 与既有设计的关系

- ADR-0007 继续是 Scene Source 与 Runtime Kernel 的最高决策；本文不修改两成员 Source Union。
- Babylon Native 长期设计的 `LockedAssetResolver`、Asset Lock、显式 Collider 登记和 Runtime Candidate
  Scene Admission 是本文的消费边界。
- 本文只采纳 2026-08-20 Geometry Extension §8.4 的 Whitebox GLB Profile 和 §8.5 的可复现记录原则；
  APA-G0 在独立 `packages/geometry-assets/**` 冻结第 6.4 节新的
  `StaticGeometryBuildRecordV1`/`StaticGeometryAssetManifestV1`，随后该包成为唯一代码 Owner。该采纳不
  复用旧 `GeometryBuildRecordV1`，不批准 Memo 的 Canonical Geometry Source、Recipe、Sandbox、Compiler
  Roadmap 或 Collider Build，也不创建 generic `AssetManifest`。
- V1 不接收 Subject Model。未来切片必须先把 `SubjectModelAssetManifestV1` 从脚本实验迁入唯一 Package
  Owner，并明确它与 `packages/subject-registry/**` 中 Runtime-facing `SubjectAssetManifestV1` 的投影关系；
  APA 不以名称相近为由把两份合同合并。
- WorldPackage V2 的资源、许可证和文件完整性原则可复用，但当前 V2 是 Canonical-specific 格式；APA
  不修改它，也不创建平行 Package。Native Package manifest/receipt 变体由 BNA-3 独占。

## 14. 生产化依赖工作图

| ID | 目标与独立交付物 | `depends_on` | `blocks` | 独占所有权 | 输入/输出合同与集成点 | 验证证据 | 执行模式 |
|---|---|---|---|---|---|---|---|
| APA-0 | 冻结本文、ADR/Native 指针和外部证据边界 | ADR-0007、Native 长期设计 | APA-G0、APA-1..APA-6 | 本文及跨 Lane 术语；不改 Runtime | GameFactory 复核 + 既有资产合同 -> source-neutral 设计权威 | 链接、claim、矛盾、占位符和 Mode A 审查 | `main-agent-only` |
| APA-G0 | 冻结新的 Static Geometry Manifest/Build Record 唯一代码 Owner | APA-0 | APA-1、APA-2、APA-4 | 新 `packages/geometry-assets/**`；只拥有 static-mesh Resource/Build，不改 Canonical Source/Compiler 或 Native Package | raw GLB + locked build inputs -> `StaticGeometryBuildRecordV1` + immutable Static Geometry artifact | exact parser/hash、identity build、转换重放、GLB/坐标/预算、禁止旧 Compiler/Collider 字段和代码 Owner census | `main-agent-only` |
| APA-1 | 冻结 Candidate Manifest、Request/Result、Production/Admission/Publication Receipt、Profile 和 Diagnostic Schema | APA-0、APA-G0 | APA-2..APA-6 | 新 `packages/asset-contracts/**`；只拥有 source-neutral envelope，不拥有 Static Geometry Manifest、Route/Attempt 或 Scene Source | JSON bytes -> parsed immutable DTO 或稳定 Diagnostic | exact-key、判别 union、unit、Ref/hash、accessor/duplicate/unknown-key 与 outcome invariant 负向测试 | `main-agent-only`；Parser 测试可在合同冻结后 `parallel-safe` |
| APA-2 | 建立 Provider-neutral Candidate Store、class-specific Build 调度与只读 Asset Admission | APA-1 | APA-3..APA-6 | 新 `packages/asset-admission/**`、对应 `scripts/assets/asset-admission*` 稳定入口；Build 实现留在资产类别 Owner；不改 Provider/Runtime | raw candidate + Production Receipt -> class build output/record -> accepted or rejected Admission Receipt | 路径逃逸、symlink、raw immutability、build input/output closure、GLB、Hash、坐标、预算、license 测试 | `sequential` |
| APA-3 | 建立一次提交、可对账的 Provider Router，并接一个云端与一个本地/授权资产来源 | APA-1、APA-2 | APA-5、APA-6 | 新 `packages/asset-production/**` 与 Provider adapter；不得改 Admission 语义 | request + locked inputs -> production result + raw candidates + receipt/attestation | Unknown outcome、`(id, requestHash)` 对账、`productionDefinitionHash` 等价命中、cache tamper、重复计费防护、凭据泄漏 census | Router `sequential`；独立 Adapter 在合同冻结后 `parallel-safe` |
| APA-4 | 由 Static Geometry Owner 发布 Registry Ref 与通用 legal/integrity closure | APA-1、APA-2、APA-G0 | APA-5、APA-6；为 BNA-3 提供 published refs | `packages/geometry-assets/**` 的窄 Publisher；不得新增 generic Asset Manifest，不修改 `packages/world-package/**` | accepted Admission Receipt + class Build Record -> immutable resourceRef/manifest + `AssetPublicationReceiptV1` | byte-exact replay、license/hash/version mismatch、atomic publish、失败无虚假 Ref、同一资产跨 Attempt/Lane 复用 | `sequential`，最终集成 `main-agent-only` |
| APA-5 | 做单体 Landmark 资产纵向实验；`scene-shell` 只保留 artifact-only 研究臂 | APA-2、APA-3、APA-4 | APA-6；BNA-6 的 generated-asset 评估臂 | `artifacts/asset-production/**` 与新的静态资产 intake example；不改 Native/Canonical Scene、Kernel 或 WorldPackage | reference -> published static geometryRef + layered asset evidence；shell -> research evidence only | 五视图、尺度/Forward/Pivot、shell publish/package/load 拒绝、无世界 Placement/Collider 字段 | Case 可 `parallel-safe`；归并 `main-agent-only` |
| APA-6 | 冻结 Golden、阈值与 source-neutral GO/NO-GO | APA-1..APA-5 | 对外 Generated Asset 支持声明；BNA-3/BNA-6 集成评估 | Golden、CLI/Studio 入口、能力状态和发布裁决；不改 Native Package/Runtime | exact-tree evidence -> scoped asset-pipeline disposition | 全部合同/Build/Admission/Registry Gates、独立深审和 asset visual review；Babylon load/manual gameplay 由 BNA Gate 证明 | `main-agent-only` |

```text
APA-0 -> APA-G0 -> APA-1 -> APA-2
APA-1 + APA-2 -> APA-3
APA-1 + APA-2 -> APA-4
APA-2 + APA-3 + APA-4 -> APA-5
APA-1..APA-5 -> APA-6
```

BNA-1、BNA-2 和 BNA-4 不依赖云端 Provider。BNA-3 独占 Native Package manifest/receipt 集成，并可以
先使用手工提交、通过同等 Admission/Publication 的 Golden GLB 验证 Asset Lock；APA-4 只交付 Registry Resource 与
可复用 legal/integrity primitive，不先发明 Native Package entry。只有“由 Provider 生成并正式发布资产”
的能力依赖 APA-G0 至 APA-4。这样资产工厂
不会阻塞 Native Kernel 正式开发，也不会被 Native 实现反向吞并。

## 15. 第一正式切片

正式开发不先接 WorldPlay/WorldMirror，也不先引入多个 Provider。第一条集成切片跨 APA 与 BNA，但保持
文件/合同 Owner 不重叠：APA 先发布资源，BNA-3/BNA-4 再消费资源。最小可信闭环为：

1. 先完成 APA-G0，建立唯一 `StaticGeometryAssetManifestV1`/`StaticGeometryBuildRecordV1` 代码 Owner；
2. 冻结 `static-mesh` `AssetProductionRequestV1`、Result/Receipt/Profile 和稳定 Diagnostic 合同；
3. 一个仓库内固定原始 GLB Candidate，模拟 Provider 输出；
4. identity Geometry Build Record + 只读 GLB、坐标、尺度、预算、许可证、五视图和 Hash Admission；
5. 由 Geometry Owner 原子发布精确 Geometry Asset Ref；Native Package Lock 由 BNA-3 集成；
6. 由 BNA-3/BNA-4 的 Native Golden 通过 `LockedAssetResolver` 加载 Landmark，并另建低模代理显式登记
   Collider；APA 不修改 Native Package 或 Runtime；
7. 篡改原始/派生字节、缺少 Build Record、缺少尺度、错误 Forward/Pivot、视觉 Mesh 自动碰撞，以及
   `scene-shell` 发布/打包/加载尝试全部 Fail Closed；
8. 证明完成后再接一个真实 Provider；`subject-model` 只有在 source-model 合同迁出脚本并冻结后才进入
   后续窄切片，`scene-shell` 仍只做 artifact-only 研究，除非新 ADR 改变边界。

这条顺序先证明工程边界，再验证模型质量和费用。Provider 成功截图不能替代 Asset Admission，Asset
Admission 也不能替代 BNA Gate 的真实 Babylon/Havok Gameplay 证据。

## 16. 最终原则

> 生成系统只提出不可变原始候选，资产类别 Build Pipeline 产生可复现的目标字节，Admission 只读决定
> 哪些字节可以成为资源，当前 Scene Source 决定资源如何进入世界，SDK 决定哪些冻结贡献可以成为
> Gameplay 与物理真相。

只要这些层不交换所有权，项目就能持续更换模型、素材库和 DCC，而不需要重构 Scene Source 或
Babylon/Havok Runtime。
