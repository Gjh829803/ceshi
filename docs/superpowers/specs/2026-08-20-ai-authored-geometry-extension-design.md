# AI 自定义场景几何扩展设计

- 状态：Exploratory options memo；非 Roadmap、非已批准设计、非实施计划
- 日期：2026-08-20
- 当前适用范围：仅保留为 Canonical 编译式 Geometry Asset/Recipe 候选，不裁决 ADR-0007 Native Lane
- 目标仓库：`agent-whitebox-world-sdk`
- 目标读者：SDK 团队、上游 Agent 团队、Runtime 团队、资产工具团队、评审 Agent
- 上位规格：[`2026-08-17-ai-first-lego-game-sdk-design.md`](./2026-08-17-ai-first-lego-game-sdk-design.md)
- 相关架构：[`../../02-sdk-architecture.md`](../../02-sdk-architecture.md)
- Agent 接口边界：[`../../03-agent-facing-api.md`](../../03-agent-facing-api.md)
- Subject 资源范式：[`2026-08-19-package-subject-definition-design.md`](./2026-08-19-package-subject-definition-design.md)
- 跟踪位置：[`重构 Backlog 的“未来探索议题”说明`](../../18-refactor-progress-and-backlog.md)
- 后续裁决：[AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)

> 本文仍是 2026-08-20 的候选方案备忘，不是当前实施权威。其中“任何方案都不应直接把 Babylon
> Runtime 场景代码注入游戏”的全局研究假设，已被 ADR-0007 **仅在隔离 Native Scene Lane 内**
> 修订；Schema/version/security/diagnostic 原则继续有效，Canonical Lane 也仍禁止直接场景代码。

> 本文只保存截至 2026-08-20 的问题背景、可选方案和评审维度；当时项目尚未决定是否实现这项能力，
> 也没有确定 Recipe、MeshDraft、GLB、Sandbox、Three Bridge 或文中任何具体技术路线。文中的
> `MUST`、接口、阶段和验收条件只描述“如果未来选择该候选方案，它至少需要满足什么”，
> 它们不产生 Backlog、排期、版本升级、依赖引入或实现授权，也不覆盖后续 ADR-0007。

## 1. 决策摘要

本设计解决一个新的核心问题：当图像理解与代码生成模型已经能够根据参考图生成较好的 Three.js 几何时，SDK 是否仍应把 AI 限制在少量预设模型中。

本文在 2026-08-20 采用的研究假设是：**如果未来确认 Preset 限制了产品效果，可以探索更开放的几何生成能力；但任何方案都不应直接把任意 Three.js、Babylon.js 或运行时代码注入游戏。**
该假设仍约束本文候选 GeometryDraft/Canonical 路线和不受控任意代码；后续 ADR-0007 已为隔离、显式
登记、SDK-owned Gameplay 的 Babylon Native Scene Lane 做出范围例外。

本文供未来评审的候选方案采用三层几何能力，并把自由度逐层受控地编译为确定性数据：

1. **Preset / Kit**：经过验证的大积木，覆盖高频对象和稳定默认值。
2. **Procedural Geometry Recipe**：引擎无关、可组合、可校验的几何配方，覆盖 Primitive、Compound、Extrude、Lathe、Sweep、Deform 和确定性实例化。
3. **Controlled Custom Mesh**：当配方无法表达目标轮廓时，允许 AI 在构建期输出顶点、三角面、法线等自定义 Mesh 数据；SDK 对其执行预算、安全、拓扑、Collider 和 Hash 校验后，编译为内容寻址的 GLB 资源。

额外提供一个受限的 **Geometry Authoring Sandbox**。AI 可以在该沙箱中编写 TypeScript 几何构建模块，也可以通过非 Canonical 的 Three.js Authoring Bridge 利用已有模型代码生成能力；但模块只在构建期运行，只能输出 SDK 定义的 `GeometryDraft`，不能访问网络、文件系统、DOM、Babylon Runtime、物理句柄或正在运行的世界。

Canonical 运行链路保持不变：

```text
图片 + Prompt
    ↓
外部 Agent
    ↓
Preset / Geometry Recipe JSON / Sandboxed Geometry Module
    ↓
Geometry Validator + Geometry Compiler
    ↓
Geometry Definition + content-addressed Geometry Asset
    ↓
AuthoringSpec → NormalizedWorldIR → ExecutionPlan
    ↓
Babylon Geometry Adapter + Havok Collider Adapter
    ↓
可渲染、可碰撞、可重放、可验收的白模场景
```

### 1.1 规范性语言与外部标准基线

本文中的 `MUST`、`MUST NOT`、`SHOULD`、`SHOULD NOT` 和 `MAY` 按 [BCP 14](https://www.rfc-editor.org/info/bcp14/) 解释。中文“必须”“禁止”“应当”“可以”分别具有相同强度。未使用这些规范词的段落属于设计说明，不应覆盖规范条款。

本设计以以下公开标准和官方文档为基线：

| 领域 | 基线 | 本项目采用方式 |
|---|---|---|
| Canonical JSON Schema | [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) | Canonical Authoring 和 Manifest 使用明确 `$schema`/`$id`、闭合对象、判别联合和机器校验 |
| 公共 API 版本 | [Semantic Versioning 2.0.0](https://semver.org/) | NPM Package 遵循 SemVer；Schema、Resource 和 Resolved Implementation 使用各自独立版本语义 |
| JSON Hash 输入 | [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) | 作为 Canonical JSON 的互操作参考；实现必须通过兼容向量或声明自己的版本化 Canonical Profile，不能只声称“stable stringify” |
| 3D 交付格式 | [Khronos glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) | 自定义 Mesh 编译为自包含 GLB；glTF 是 Runtime Asset，不承担 Authoring 语义 |
| glTF 一致性 | [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) | 每个发布 GLB 必须在 CI 中零 Error，并对 Warning/Extension 使用显式 Allowlist |
| 构建来源 | [SLSA Provenance 1.2](https://slsa.dev/spec/v1.2/provenance) | 借鉴 Build Definition、Resolved Dependency 和 Output Subject 语义；未实现签名 Attestation 前不得宣称 SLSA 等级 |
| 不可信代码隔离 | [Node.js `vm` 官方安全说明](https://nodejs.org/api/vm.html) | `node:vm` 不作为安全边界；不可信 Geometry Module 使用独立受限进程或容器 |
| Babylon Physics Adapter | [Babylon.js Physics V2 官方文档](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/physics/v2/rigidBodies.md) | Shape 复用、Instance 限制和显式释放留在 Adapter/Cache 内，不能泄漏进 Canonical Schema |
| Three Authoring Bridge | [Three.js BufferGeometry 官方文档](https://threejs.org/docs/pages/BufferGeometry.html) | 只作为构建期输入适配器，最终投影为引擎无关 `MeshDraft` |

如果标准与本文冲突，优先级为：

```text
Canonical SDK Contract
  → 明确引用的规范性外部标准
  → Engine Adapter Compatibility Profile
  → 实现细节和示例
```

Canonical Contract 可以比 glTF 或引擎默认行为更严格，但不能把不符合标准的产物标记为兼容。任何有意偏离都必须记录在版本化 Compatibility Profile 中，并由机器 Gate 验证。

本设计冻结以下原则：

1. Preset 是快捷方式，不是开放世界的表达边界。
2. AI 的自由度发生在构建期；Runtime 永远不执行 AI 代码。
3. Canonical Schema、Normalized IR 和 ExecutionPlan 不包含 Three、Babylon、Havok 或 Provider 私有对象。
4. 自定义视觉几何与物理 Collider 分开定义、分开预算、分开验收。
5. 同一 Source、Compiler Profile、Seed 和依赖锁必须生成相同的 Canonical Geometry Asset Hash。
6. 所有自定义几何最终都必须成为可引用、可锁定、可缓存、可解释的资源，不能以不透明 `Scene.add(...)` 副作用存在。
7. 第一阶段只把自定义几何用于室外世界中的静态 Object、Landmark 和装饰实例，不借此宣称已支持洞穴、室内、车辆或任意动态刚体。

## 2. 背景

### 2.1 产品变化

项目最初假设 AI 通过 Schema 选择 SDK 已注册的地形、主体、障碍物和 Kit，由 SDK 提供稳定默认值。这种方式有三个明显优势：

- AI 输出短，容易校验和修复；
- 物理、性能和运行时生命周期由 SDK 统一保证；
- 高频对象可以复用资产、Collider、LOD 和测试证据。

但随着图像模型和 Coding Agent 的 3D 代码生成能力提高，单纯依赖预设也暴露了明显上限：

- 参考图中的独特岩石、断崖轮廓、小桥、木桩、雕塑和建筑剪影很难全部预注册；
- 用几个 Box、Sphere 和 Cylinder 拼接时，虽然语义正确，但轮廓容易机械、同质化；
- 为所有可能的视觉形状建设 Kit 目录既不现实，也会让 Agent 面临过大的检索空间；
- 图像驱动场景最重要的往往不是纹理，而是可见轮廓、比例、负空间和局部不规则性，这些恰好适合程序化几何表达。

因此，SDK 需要同时满足两个看似矛盾的目标：

1. 保留 Schema-first、确定性、物理正确、可测试的工程边界；
2. 允许 AI 在遇到目录之外的形状时自行构造几何，而不是等待 SDK 团队新增硬编码类型。

### 2.2 为什么不能直接执行 AI 生成的 Three.js 代码

让 AI 直接生成如下代码看起来最自由：

```ts
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

但这会让系统失去关键控制：

- `scene.add` 产生不可审计的副作用，Compiler 无法形成完整资源清单；
- AI 可能创建无限几何、非确定性随机数、网络请求、定时器或持续运行逻辑；
- Three.js 对象不能安全地跨进程序列化，也不能成为引擎无关的公共契约；
- Babylon Runtime 无法知道 Mesh 的语义、Pivot、Collider、预算、所有权和释放规则；
- 同一段代码在依赖版本、浏览器或 GPU 不同时可能产生不同结果；
- CLI、Browser、Playwright 和离线验证无法稳定复现运行时状态；
- 未来更换 Authoring Backend 或 Runtime Backend 时会被直接耦合阻断。

真正有价值的不是“让 AI 控制 Three Scene”，而是“利用 AI 擅长编写几何生成代码的能力，生成受控、冻结、可验证的几何资源”。

### 2.3 与现有架构的关系

仓库当前已经具备可复用的基础：

- `WorldFeature / BuildContext` 提供确定性 Seed、预算、资源追踪和自定义 Terrain 构建入口；
- `world.landmark.compound(...)` 可以组合 Box、Sphere、Cylinder、Cone 和 Plane；
- Canonical Authoring 已区分 Primitive Prototype、Object Instance、Subject Definition 和资源引用；
- Subject Asset 已验证“Registry Manifest → Resource Lock → IR Descriptor → ExecutionPlan Descriptor → Host Resolver → Runtime Cache”的完整资源链路；
- Babylon/Havok 已被限制在 Runtime Adapter 内。

但现有 `custom` World Resource 仍属于内部不透明扩展点，Canonical Object 仍主要使用固定 Primitive；它不能作为生产级的任意几何协议。新设计的任务不是删除这些能力，而是把“自定义几何”提升为正式、类型化、可哈希、可编译的资源。

## 3. 目标与非目标

### 3.1 目标

- AI 可以用少量 Canonical JSON 表达常见程序化形状。
- AI 可以用受限 TypeScript Builder 构造 Schema 难以简洁表达的形状。
- AI 可以创建目录中不存在的小石块、断木、路标、桥墩、围栏、拱门和独特 Landmark 白模。
- 自定义几何可以被多个 Object Prototype 和 Instance 复用。
- 几何、语义、外观、Collider 和世界实例 Transform 保持解耦。
- 自定义几何进入现有 Authoring → IR → ExecutionPlan → Runtime 链路。
- Runtime 只消费冻结的 Geometry Asset Descriptor 和受控字节，不重新执行配方或代码。
- 所有几何输出具备稳定 Hash、资源预算、来源记录、Compiler Profile 和诊断。
- 同一场景可以混合 Preset、程序化 Recipe、Custom Mesh 和产品 GLB 资产。
- CLI 和 Browser 工具可以检查资源、解释来源、渲染预览、截图和验证 Collider。
- 设计可以在后续扩展到 Subject Visual Part、装备和动态 Object，而无需推翻资源边界。

### 3.2 非目标

- 不把 SDK 变成 Blender、Maya 或通用 DCC 工具。
- 不允许 Runtime 执行 AI 生成的 JavaScript、TypeScript、Shader 或 WASM。
- 不允许场景模块直接持有或修改 Babylon Scene、Mesh、Material、Physics Body。
- 不在第一阶段支持任意 Shader、纹理生成、骨骼蒙皮、Morph Target 或材质节点图。
- 不通过自定义 Mesh 绕过当前“室外 Heightfield World”边界。
- 不把 Cave、Overhang 或室内空间伪装成已经受地形导航、相机和物理完整支持的功能。
- 不把任意动态 Triangle Mesh Collider 作为生产功能。
- 不承诺将几何等价但顶点顺序不同的输入归一为同一个 Hash；Hash 表示 Canonical Build Output，而不是数学形状等价类。
- 不要求上游 Agent 必须写代码；JSON Recipe 始终是默认路径。

## 4. 设计原则

### 4.1 Preset 是宏，不是特殊运行时类型

Preset 应被视为经过测试的 Recipe、Prototype、Collider Policy 和语义默认值的组合。Normalizer 展开 Preset 后，后续 Compiler 与 Runtime 不需要知道它来自目录还是 AI 自定义。

这保证：

- 高频对象继续享有最短的 AI 表达；
- 自定义对象不会进入第二套运行时；
- 新 Preset 可以由已经验证的自定义 Recipe 反向沉淀；
- Kit 目录不会成为开放世界能力的瓶颈。

### 4.2 自由代码只负责“生成数据”

沙箱模块可以执行循环、函数、数学运算和确定性随机，但只能调用纯几何 Builder 并返回 `GeometryDraft`。它不能：

- Spawn Entity；
- 修改 Terrain、Camera、Subject 或 Runtime State；
- 注册事件、定时器或输入监听；
- 访问 DOM、WebGL Context 或 GPU；
- 加载 URL、文件、环境变量或动态包；
- 输出 Babylon/Three 对象。

### 4.3 逻辑、视觉和物理不是同一棵树

一个 Object Instance 的逻辑身份、视觉 Geometry 和 Physics Collider 是三种不同数据：

```text
Object Instance
  ├── prototypeRef            # 逻辑与复用身份
  ├── worldTransform          # 世界放置
  └── Object Prototype
        ├── geometryDefinitionRef
        ├── colliderPolicy
        ├── semanticClassId
        └── affordanceRefs
```

Runtime 可以用 Babylon 父子节点承载 Transform，但父子节点不反向定义游戏关系。Collider 也不能从渲染 Mesh 隐式、无版本地猜测。

### 4.4 语义先于拓扑细节

AI 应先表达“这是岸边石块、可阻挡玩家、尺寸约 0.8m”，再决定使用 Preset、Recipe 或 Mesh。Geometry Definition 必须携带语义类、坐标约定、Pivot 和近似尺寸；不能只有无名顶点数组。

### 4.5 编译期开放，运行时封闭

开放世界需要 Authoring 能力开放；稳定游戏需要 Runtime 输入封闭。所有不确定性必须在 Compiler 前结束：

```text
开放输入                 冻结边界                     封闭运行
AI Source / Recipe ──→ Geometry Build Record ──→ Geometry Asset + ExecutionPlan
```

### 4.6 引擎无关不等于最低能力

公共协议不暴露 Three/Babylon 类型，但内部 Adapter 可以充分使用成熟引擎或几何库。引擎无关约束的是所有权和数据边界，不要求重新实现所有数学与 Mesh 算法。

## 5. 方案比较

| 方案 | AI 表达力 | 确定性与安全 | 物理与预算 | 引擎解耦 | 结论 |
|---|---:|---:|---:|---:|---|
| 仅 Preset/Kit | 低到中 | 高 | 高 | 高 | 不足以覆盖开放世界独特轮廓 |
| Runtime 直接执行 Three/Babylon 代码 | 极高 | 极低 | 极低 | 极低 | 拒绝 |
| 只允许原始顶点数组 | 高 | 中 | 中 | 高 | 对 AI 冗长，缺少可解释高层意图 |
| Preset + Recipe | 中到高 | 高 | 高 | 高 | 适合作为默认主路径 |
| Preset + Recipe + 受控 Mesh + 构建期沙箱 | 高 | 高 | 高 | 高 | 候选组合，待未来验证 |

## 6. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│ External Agent                                               │
│  Prompt/Image → semantic plan → choose authoring level       │
└───────────────┬──────────────────────────────────────────────┘
                │
       ┌────────┼───────────────┐
       │        │               │
       ▼        ▼               ▼
   Preset Ref   Recipe JSON   Sandbox Module
       │        │               │
       │        │         Geometry Builder API
       │        │               │
       └────────┴───────┬───────┘
                        ▼
            Geometry Validation Pipeline
      schema → budget → topology → bounds → collider → hash
                        │
            ┌───────────┴────────────┐
            ▼                        ▼
  Geometry Definition        Geometry Asset GLB
  + Geometry Build Record    + content hash/inventory
            │                        │
            └───────────┬────────────┘
                        ▼
     AuthoringSpec → NormalizedWorldIR → ExecutionPlan
                        │
                 Host Asset Resolver
                        │
                        ▼
           Babylon Adapter + Havok Adapter
```

核心新增包建议：

```text
packages/
  geometry-contracts/       # Canonical Geometry Definition、Mesh Draft、Diagnostic
  geometry-authoring/       # Builder API、Recipe helpers、deterministic random
  geometry-compiler/        # Validation、canonicalization、GLB emission、Build Record
  geometry-registry/        # Geometry Definition/Asset/Collider Profile manifests
  geometry-testkit/         # golden mesh、topology assertions、adapter conformance
  runtime-contracts/        # Execution Geometry descriptors
  runtime-babylon/          # Geometry/Collider adapter and cache integration

tools/
  geometry-sandbox/         # 隔离进程、资源限制、module allowlist
  geometry-authoring-three/ # 可选、非 Canonical 的 Three BufferGeometry bridge
```

如果未来立项，包名还需要结合届时的 workspace 和实验结果重新评审；下述职责拆分也只是
候选边界，不是已批准的代码结构。

## 7. 三层 AI Authoring 模型

### 7.1 Level 1：Preset / Kit

适用于已有稳定定义的对象：标准石块、树干、围墙段、灯塔、桥、木箱等。

概念示例：

```json
{
  "kind": "preset",
  "presetRef": "worldkit://geometry-preset/coastal-rock.small@1",
  "parameters": {
    "sizeMetersXYZ": [0.8, 0.5, 0.7],
    "irregularityRatio": 0.25
  }
}
```

Preset Manifest 必须声明参数 Schema、版本、预算上界、默认 Collider Policy 和展开器版本。展开结果进入同一个 Geometry Recipe Pipeline。

### 7.2 Level 2：Procedural Geometry Recipe

这是默认的自定义路径。Recipe 是闭合的判别联合，不包含任意表达式字符串：

```ts
type GeometryRecipeV1 =
  | GeometryPrimitiveRecipeV1
  | GeometryCompoundRecipeV1
  | GeometryExtrudeRecipeV1
  | GeometryLatheRecipeV1
  | GeometrySweepRecipeV1
  | GeometryDeformRecipeV1;
```

第一版建议支持：

| `kind` | 用途 | 关键输入 |
|---|---|---|
| `primitive` | 基础形状 | box、sphere、cylinder、cone、capsule、plane、icosphere |
| `compound` | 多部分组合 | children、局部 Transform |
| `extrude` | 墙、牌、桥面、建筑轮廓 | 2D polygon、depth、bevel profile |
| `lathe` | 柱、塔、瓶状轮廓 | radial profile、segments |
| `sweep` | 栏杆、绳索、弯管、道路边缘 | cross section、3D path、frame mode |
| `deform` | 石块、断木、不规则白模 | source recipe、noise field、axis scale |

第一版不把 Boolean CSG、Loft、Voxel Remesh 纳入生产承诺。它们需要独立 RFC、成熟 Kernel 评估和更多退化拓扑测试，不能自行实现一个脆弱 Boolean 算法。

### 7.3 Level 3：Controlled Custom Mesh

当 Recipe 无法表达独特轮廓时，AI 可以输出 `MeshDraftV1`：

```ts
interface MeshDraftV1 {
  kind: "mesh-draft";
  positionsMetersXYZ: readonly Vec3[];
  triangleVertexIndices: readonly (readonly [number, number, number])[];
  normalsXYZ?: readonly Vec3[];
  textureCoordinatesUv?: readonly Vec2[];
  semanticTags: readonly string[];
}
```

`MeshDraft` 只是 Compiler 输入，不直接进入 ExecutionPlan。Compiler 必须：

1. 拒绝 NaN、Infinity、越界索引和非法数组长度；
2. 删除或拒绝退化三角形；
3. 检查 Winding、法线、非流形边和重复面；
4. 根据 Compiler Profile 执行顶点焊接和数值量化；
5. 计算 Bounds、Inventory、Pivot Offset 和 Hash；
6. 根据 Collider Policy 构建独立 Collider；
7. 写出自包含、无外部 URI 的 GLB；
8. 生成 `GeometryBuildRecordV1` 和稳定 Diagnostic。

GLB 是构建产物格式，不是 AI-facing 几何语言。AI 不需要手写 glTF JSON、BufferView 或 Accessor。

### 7.4 Agent 选择策略

Agent 应按以下顺序选择能力，不以“自由度最高”为默认：

1. Registry 中存在语义、轮廓和尺寸都适合的 Preset 时，使用 Preset；
2. 形状可以由少量闭合操作表达时，使用 Recipe；
3. 只有在关键轮廓无法用 Recipe 清楚表达时，才生成 Custom Mesh；
4. 产品已经提供正式 GLB 时，直接使用受控 Asset Manifest，不重新程序化仿制；
5. 花纹、云、草叶、颜色噪声等纯视觉细节不应被误建成高密度碰撞几何。

上游 Agent 可以通过 Capability Query 获取支持项和预算，再根据 Compiler Diagnostic 降级。例如 Custom Mesh 超预算时，优先降低细分、保留轮廓和 Collider，而不是删除语义关键对象。

外部 Image-to-3D 或产品建模工具产生的 GLB 与 Sandbox Mesh 共用 `GeometryAsset` 资源边界，但 Provenance 不同。Runtime 不需要知道字节是由人工、模型、Recipe 还是 Three Bridge 生成的；它只信冻结的 Manifest、Hash、Inventory 和 Validation Evidence。

## 8. Canonical 资源模型

### 8.1 Geometry Definition

建议在下一次 Authoring Schema 版本中新增：

```ts
interface GeometryDefinitionV1 {
  id: string;
  version: 1;
  kind: "geometry-definition";
  semanticClassId: string;
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center" | "centroid";
  };
  source:
    | { kind: "preset"; presetRef: string; parameters: Readonly<Record<string, unknown>> }
    | { kind: "recipe"; recipe: GeometryRecipeV1 }
    | { kind: "mesh"; geometryAssetRef: string };
  aiMetadata: {
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  };
}
```

规则：

- 当前对象使用 `id`；资源引用使用 `...Ref`；原始地址只允许 Host Registry 使用 `...Uri`。
- `source.kind` 是闭合判别器；不能同时填写 Preset、Recipe 和 Mesh。
- Bounds、Triangle Count、Hash 和 Compiler Version 均由 SDK 生成，Authoring 不能伪造。
- Geometry Definition 只描述可复用形状，不描述世界坐标、运行状态或控制权。

### 8.2 Object Prototype

现有 Primitive Prototype 应演进为通用 Object Prototype，而不是让 Object Instance 直接引用 Mesh：

```ts
interface ObjectPrototypeSpecVNext {
  id: string;
  version: 1;
  kind: "object-prototype";
  geometryDefinitionRef: string;
  semanticClassId: string;
  colliderPolicy: ObjectColliderPolicyV1;
  appearance: { mode: "whitebox-neutral" };
  affordanceRefs: readonly string[];
}
```

同一个 Geometry Definition 可以被多个 Prototype 复用。例如同一块岩石 Geometry 可以形成：

- 有 Convex Collider 的阻挡岩石；
- 无 Collider 的远景装饰；
- 缩放后作为 Landmark 的岩石组部件。

Object Instance 继续只引用 `prototypeRef` 和世界 Transform。这保持“定义”和“实例”分离。

### 8.3 Geometry Asset Manifest

编译后的 Mesh 由 Registry/Package Manifest 描述：

```ts
interface GeometryAssetManifestV1 {
  id: string;
  version: 1;
  kind: "geometry-asset";
  geometryAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  gltfVersion: "2.0";
  extensionsUsed: readonly string[];
  extensionsRequired: readonly string[];
  inventory: {
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    submeshCount: number;
  };
  bounds: {
    minimumMetersXYZ: Vec3;
    maximumMetersXYZ: Vec3;
  };
  provenance: {
    sourceContentHash: string;
    compilerProfileRef: string;
    compilerResolvedVersion: string;
  };
  sourceUri?: string;
  licenseUri?: string;
}
```

`sourceUri` 和 `licenseUri` 只存在于 Host Registry Manifest。Normalizer 必须投影为不含 URI 的冻结 Descriptor；ExecutionPlan 同样不能包含 Host 路径。

### 8.4 Whitebox Geometry GLB Profile

Khronos 明确把 glTF 定义为 Runtime Asset Delivery Format，而不是 Authoring Format。因此 Recipe、Collider Policy、AI Metadata 和 Build Source 不能塞入未版本化的 `extras` 作为运行时真相。G0 生成的 `GeometryAsset` MUST 满足以下 Profile：

- GLB Container Version 为 2，Asset Version 为 glTF 2.0；
- 文件扩展名为 `.glb`，Media Type 为 `model/gltf-binary`；
- 单文件自包含，不得存在外部 Buffer、Image、Script 或网络 URI；
- G0 只发布 Triangle Primitive；生产产物 SHOULD 使用 Indexed Geometry；
- `POSITION`、Index、Normal Accessor 的类型、范围、Alignment 和 `min/max` 必须合法；
- Compiler MUST 输出 Normal，避免不同 Loader 各自补法线造成视觉或 Hash 证据漂移；
- 白模没有 Normal Texture 时不要求 Tangent；一旦后续 Profile 使用 Normal Texture，Tangent MUST 使用 MikkTSpace 兼容算法生成；
- 不得包含 Degenerate Triangle、越界 Index、NaN、Infinity 或不可分解 Transform；
- Geometry Asset 使用一个 Identity Root；尺寸、Pivot 和坐标基变换烘焙进顶点数据，不依赖隐藏 Root Transform 修正；
- G0 禁止负 Scale、零 Scale、Shear 和运行时 Mirroring；镜像必须在编译期烘焙并修复 Winding、Normal 和 Tangent；
- `extensionsUsed` 和 `extensionsRequired` 必须是排序、去重后的显式集合，且 `extensionsRequired` 必须是 `extensionsUsed` 的子集；
- Extension 必须同时出现在 SDK Allowlist、Runtime Capability 和目标 Validation Profile 中；未知 Required Extension 直接拒绝加载；
- Runtime 白模 Profile 禁止 Texture、外部 Material Shader 和 Provider 私有 Extension；允许的 Khronos Extension 由版本化 Profile 决定；
- 每个产物必须通过 Khronos glTF Validator；Error 数必须为 0，Warning/Info/Hint 必须由项目 Policy 决定是否升级为失败，不能全部静默忽略。

GLB 中的可读 `name` 只用于调试，不能作为稳定 ID。稳定身份来自 `geometryAssetRef`、`artifactContentHash`、Prototype Ref 和 Entity ID。

### 8.5 Geometry Build Record

每次构建生成可审计记录：

```ts
interface GeometryBuildRecordV1 {
  kind: "geometry-build-record";
  schemaVersion: 1;
  buildDefinition: GeometryBuildDefinitionV1;
  geometryDefinitionRef: string;
  sourceContentHash: string;
  compilerProfileRef: string;
  compilerResolvedVersion: string;
  compilerProfileHash: string;
  dependencyLockHash: string;
  seed: number;
  geometryAssetRef: string;
  artifactContentHash: string;
  inventory: GeometryInventoryV1;
  colliderBuild?: ColliderBuildRecordV1;
  diagnostics: readonly GeometryDiagnosticV1[];
}
```

Build Record 用于复现、缓存、解释和验收，不能被 AI 当作 Authoring 输入提交。

为了对齐行业构建来源实践，Build Record 还必须区分“确定性缓存身份”和“单次构建运行信息”：

- `GeometryBuildRecordV1` 是确定性的，保存 Build Type、External Parameters Hash、Resolved Dependency Hash、Compiler Profile 和 Output Subject Hash；它参与缓存与复现判断；
- `GeometryBuildAttestationV1` 保存 Builder Identity、Invocation ID、时间、隔离环境和签名等单次运行信息；它不参与 Geometry Asset Hash、IR Hash 或 Plan Hash；
- 在没有受信 Control Plane、签名 Provenance 和验证策略前，只能称为“SLSA-aligned provenance fields”，不得对外宣称达到 SLSA Build L1/L2/L3。

建议把 Build Record 的来源字段补成：

```ts
interface GeometryBuildDefinitionV1 {
  buildType: "worldkit.geometry.compile/v1";
  externalParametersHash: string;
  resolvedDependencies: readonly {
    resourceRef: string;
    contentHash: string;
  }[];
}
```

### 8.6 Sandbox Source 与 Canonical Authoring 的衔接

Sandbox Module 不是 `GeometryDefinition.source` 的第四种公开 `kind`，也不会随 WorldPackage 进入 Runtime。它属于几何资源的构建输入：

```text
authoring source module
  → sandbox execution
  → MeshDraft / Recipe
  → Geometry Compiler
  → Geometry Asset + Build Record
  → GeometryDefinition.source.kind = "mesh"
```

Host 可以保存 Source Module 以便后续重建和审计，但 Canonical Authoring 只引用已经生成的 `geometryAssetRef`。如果 Sandbox Module 返回的是合法 Recipe，工具也可以将 Recipe 固化为 `source.kind = "recipe"`，此后重建无需再次运行 Source Module。

这样可以明确回答两个边界问题：

- AI 可以用代码创造形状，但代码本身不是游戏世界协议；
- Agent 提交给世界 Compiler 的仍是稳定 JSON 和资源引用，Runtime 不会意外获得代码执行能力。

## 9. 岩石示例

### 9.1 Canonical Recipe

```json
{
  "id": "shore-rock-irregular-a",
  "version": 1,
  "kind": "geometry-definition",
  "semanticClassId": "prop.rock.shore",
  "coordinateConvention": {
    "forwardAxis": "-Z",
    "upAxis": "+Y",
    "metersPerUnit": 1,
    "pivot": "support-center"
  },
  "source": {
    "kind": "recipe",
    "recipe": {
      "kind": "deform",
      "source": {
        "kind": "primitive",
        "primitive": "icosphere",
        "radiusMeters": 0.5,
        "subdivisions": 2
      },
      "scaleXYZ": [1.35, 0.72, 1.05],
      "displacement": {
        "kind": "noise",
        "seedOffset": 41,
        "amplitudeMeters": 0.11,
        "frequencyPerMeter": 2.4,
        "octaves": 3,
        "persistenceRatio": 0.48
      }
    }
  },
  "aiMetadata": {
    "displayName": "Irregular shore rock A",
    "description": "A low asymmetrical rock used near the foreground shoreline.",
    "semanticTags": ["rock", "shore", "foreground"]
  }
}
```

### 9.2 Object Prototype

```json
{
  "id": "shore-rock-blocker",
  "version": 1,
  "kind": "object-prototype",
  "geometryDefinitionRef": "package://geometry-definition/shore-rock-irregular-a@1",
  "semanticClassId": "obstacle.rock.shore",
  "colliderPolicy": {
    "kind": "derive",
    "colliderProfileRef": "worldkit://collider/static-convex.standard@1"
  },
  "appearance": { "mode": "whitebox-neutral" },
  "affordanceRefs": []
}
```

### 9.3 AI 友好的 TypeScript Facade

下面只是 Authoring Facade；最终仍编译成前述 Canonical JSON：

```ts
const shoreRockGeometryRef = world.geometry.define({
  id: "shore-rock-irregular-a",
  semanticClassId: "prop.rock.shore",
  pivot: "support-center",
  geometry: geometry.deform({
    source: geometry.icosphere({ radiusMeters: 0.5, subdivisions: 2 }),
    scaleXYZ: [1.35, 0.72, 1.05],
    displacement: geometry.noise({
      seedOffset: 41,
      amplitudeMeters: 0.11,
      frequencyPerMeter: 2.4,
      octaves: 3,
      persistenceRatio: 0.48,
    }),
  }),
});

const shoreRockPrototypeRef = world.object.define({
  id: "shore-rock-blocker",
  geometryDefinitionRef: shoreRockGeometryRef,
  semanticClassId: "obstacle.rock.shore",
  colliderPolicy: {
    kind: "derive",
    colliderProfileRef: "worldkit://collider/static-convex.standard@1",
  },
});

world.object.spawn({
  id: "shore-rock-01",
  prototypeRef: shoreRockPrototypeRef,
  transform: {
    positionMetersXYZ: [8.2, 1.1, -5.4],
    rotationEulerRadiansXYZ: [0, 0.7, 0],
    scaleXYZ: [1, 1, 1],
  },
});
```

这些名称是本设计建议的 Canonical 方向，实施前仍需按 Schema 命名规则做一次完整字段审查；不能同时发布 `modelRef`、`meshRef`、`shapeRef` 等同义字段。

## 10. Geometry Authoring Sandbox

### 10.1 运行模型

Sandbox 是构建工具，不是游戏 Runtime。MUST 采用独立 OS 进程或容器；Node 官方明确说明 `node:vm` 不是安全机制，Worker Thread 和 Node Permission Model 也不能单独作为恶意代码隔离边界。

```text
Host Compiler
  ├── validates module manifest
  ├── starts isolated build worker
  ├── passes immutable input + seed + budget
  ├── receives structured GeometryDraft
  ├── kills worker on timeout/limit
  └── validates output independently
```

生产 Sandbox Profile 至少要求：

- 独立低权限 OS User、Process Group 和一次性工作目录；
- 默认无网络 Namespace、只读 Root Filesystem、空环境变量和无 Host Credential；
- CPU、Wall-clock、Memory、File Descriptor、Process Count 和 Output Bytes 硬限制；
- 禁止继承父进程可写目录、Socket、Inspector 和 Package Cache；
- 固定 Compiler Image/Dependency Digest，不在执行时安装包；
- Host 使用长度受限的结构化 IPC，先验证 Envelope 再分配 Mesh Buffer；
- Timeout/Crash 时终止整个 Process Tree，并清理临时目录；
- 原始 Source Error、Stack、绝对路径和 Provider Cause 不进入公共 Diagnostic；
- Sandbox Output 仍按不可信输入重新执行完整 Mesh/GLB Validator。

### 10.2 能力白名单

允许：

- SDK Geometry Builder；
- 纯数学函数、数组、循环、局部函数；
- SDK 提供的确定性 PRNG 和 Noise；
- 固定版本、无 I/O 的几何算法依赖；
- 返回结构化 Geometry Draft。

禁止：

- `fetch`、WebSocket、HTTP、DNS；
- 文件系统、环境变量、进程、Child Process；
- DOM、Canvas、WebGL、Audio、计时器；
- 动态 `import()`、任意 NPM 包、原生扩展；
- `eval`、`Function`、WASM，除非后续独立安全评审批准；
- 非确定性时间和系统随机；
- 直接输出 Three/Babylon Class Instance。

AST/Import Allowlist 只是减少攻击面，不替代进程隔离。任何允许的几何依赖都视为 Sandbox Trusted Computing Base，必须固定版本、进入 Dependency Lock，并接受供应链审计。

### 10.3 Three.js Authoring Bridge

为了利用模型已经学会的大量 Three.js 几何代码，可以提供一个可选 Tooling Adapter：

1. 在隔离的构建 Worker 中固定 Three.js 版本；
2. 只开放 CPU 侧 `BufferGeometry` 和少量 Geometry Helper；
3. 禁止 Scene、Renderer、Loader、Texture、网络和 DOM；
4. 将最终 `BufferGeometry` 投影为 `MeshDraftV1`；
5. 立即丢弃 Three 对象；
6. 后续仍走同一 Validator、Collider、Budget 和 GLB Compiler。

该 Bridge 不是 Canonical Schema，也不能在 IR、ExecutionPlan 或 Browser Protocol 中留下 `three` 字段。它只是“输入适配器”，类似把外部文件导入统一资源格式。

默认文档和示例仍优先 Geometry Builder，因为它比 Three API 更短、更稳定、更容易约束。Three Bridge 用于高级兼容，不成为 Agent 必须依赖的方言。

### 10.4 资源限制

`worldkit://geometry-compiler/whitebox.standard@1` 建议冻结以下初始上限：

| 指标 | 单 Geometry Definition | 单 WorldPackage |
|---|---:|---:|
| Recipe 深度 | 16 | 不适用 |
| Recipe 操作数 | 512 | 4096 |
| 顶点数 | 50,000 | 750,000 |
| 三角面数 | 100,000 | 1,500,000 |
| GLB 字节数 | 16 MiB | 128 MiB |
| Collider Convex Hull 顶点 | 256 | 16,384 |
| Collidable Instance 数 | 不适用 | 2,000 |
| Visual-only Instance 数 | 不适用 | 10,000 |
| 构建 CPU 时间 | 5 秒 | 30 秒 |
| Worker 内存 | 256 MiB | 1 GiB |

这些是 Standard Profile 的默认值，不是写死在 Schema 中的全局常量。高质量离线 Profile 可以提高上限，但产物仍必须满足目标 Runtime 的 Validation Profile。

## 11. Geometry 编译与确定性

### 11.1 编译阶段

建议固定顺序：

```text
parse
  → validate schema
  → resolve refs and compiler profile
  → expand preset
  → execute sandbox if required
  → validate mesh values/topology
  → canonicalize transforms and numeric precision
  → calculate normals/tangents if required
  → calculate bounds and support-center pivot
  → build collider
  → calculate inventory and resource usage
  → emit deterministic GLB
  → hash asset and build record
  → project normalized descriptor
```

### 11.2 数值规则

Standard Profile 建议：

- Position 以米为单位，量化到 `0.0001m`；
- Normal 分量量化到 `0.00001`；
- UV 分量量化到 `0.000001`；
- `-0` 规范化为 `0`；
- 拒绝 NaN 和 Infinity；
- Triangle Index 使用稳定的无符号整数编码；
- GLB Chunk、JSON Key、Accessor 和 BufferView 使用固定顺序；
- 不写入构建时间、绝对路径、随机 UUID 或 Provider 私有 Metadata。

Canonical JSON Hash 还必须满足：

- Hash 算法写入协议标识，当前格式为 `sha256:<lowercase-hex>`；
- 重复 JSON Property 必须在解析边界拒绝，不能让“最后一个值覆盖前值”进入 Hash；
- Canonical Serializer 递归排序 Object Key，但绝不自行重排 Array；
- 对语义无序的 Collection，由领域 Normalizer 先按稳定 Identity 排序，再交给 Serializer；
- Float Quantization 和 `-0 → 0` 必须发生在 Hash 前；
- UTF-8、Unicode、Number Serialization 和 Key Ordering 必须用 Golden Vector 锁定；
- 如果实现宣称 RFC 8785/JCS 兼容，必须通过 JCS 测试向量；否则必须使用项目拥有的版本化 `canonicalJsonProfileRef`，不能混用两种 Hash 方言。

同一输入只有在 Source Hash、Compiler Profile Ref、Resolved Version、Dependency Lock Hash 和 Seed 完全一致时才允许命中构建缓存。

### 11.3 坐标、Transform 与 glTF 边界

Canonical SDK 坐标系保持 `right-handed-y-up-minus-z-forward`：`+Y` 向上、`-Z` 为主体前方、线性单位为米、角度为弧度。glTF 2.0 同样是右手系，但规定 `+Y` 向上、`+Z` 为资产前方、`-X` 为右方。两者不能靠 Loader 默认行为“碰巧对齐”。

Geometry Compiler 和 Runtime Import Adapter MUST 使用唯一显式基变换：

```text
B_sdk_to_gltf(x, y, z) = (-x, y, -z)
B_gltf_to_sdk          = inverse(B_sdk_to_gltf)
```

该变换等价于绕 `+Y` 旋转 180°，行列式为正，因此不会单独翻转 Triangle Winding。转换规则必须：

- 在 Compiler/Adapter 的一个明确边界执行一次，禁止 Root Node、Loader Flag 和 Runtime Parent 再次补偿；
- 同时作用于 Position、Normal、Tangent、Bounds、Pivot、Collider Vertex 和 Socket/Anchor；
- 通过带标签的 `+X / +Y / -Z-front` Golden Fixture 做 Round-trip 测试；
- 验证 Front/Right/Back Capture、Triangle Winding、法线朝向和 Collider Overlay；
- 禁止 Authoring Agent 根据截图自行猜测 `rotationY += Math.PI` 作为修复。

Authoring 可继续使用 AI 更容易表达的 `rotationEulerRadiansXYZ`，但语义必须冻结为 Intrinsic XYZ；对 Column Vector，其 Rotation Matrix 为 `Rz * Ry * Rx`。Normalizer MUST 立即转为单位 Quaternion XYZW，并使用统一符号规则消除 `q` 与 `-q` 的双重表示。局部 Transform 按 `T * R * S` 合成，与 glTF TRS 规则一致。

G0 的 Scale 每个分量必须有限且大于 0。零 Scale、负 Scale、Shear 和不可分解 Matrix 必须在 Authoring/Compiler 阶段拒绝；镜像只允许作为显式 Geometry Build Operation 烘焙进顶点。

### 11.4 随机数

任何 Deform、Scatter 或 Builder 随机性必须来自：

```text
worldSeed + geometryDefinitionRef + explicit seedOffset
```

不得使用 `Math.random()`。Compiler 应向沙箱注入命名 PRNG Stream，避免新增一次随机调用导致所有后续结果漂移。

### 11.5 拓扑有效性不是单一布尔值

“可渲染”“可做静态碰撞”“可计算体积”对拓扑的要求不同，Compiler 不能用一个模糊的 `isValid` 代替用途检查：

| 用途 | 必须满足 | 可接受但需报告 |
|---|---|---|
| Visual-only Mesh | Index/Accessor 合法、无退化面、Winding/Normal 一致 | 开放边界、非流形边（若视觉正确） |
| Static Triangle Collider | 无退化/重复面、局部 Transform 已烘焙、碰撞面方向策略明确 | 开放表面，但必须显式 `collisionSidedness` |
| Convex Hull Source | 有限点集、非共线/非共面退化、Hull 预算内 | 原 Visual Mesh 可以非流形，因为 Hull 从点集派生 |
| Dynamic/Volume Collider | 使用 Primitive、Convex 或 Compound；需要质量属性时必须闭合且可计算体积 | 不接受任意 Concave Triangle Mesh |

Visual Topology Report 与 Collider Topology Report 必须分开保存。Warning 不能自动升级为“可安全碰撞”；Collider Profile 决定哪些拓扑条件是 Error。

## 12. Visual 与 Physics 分离

### 12.1 Collider Policy

```ts
type ObjectColliderPolicyV1 =
  | { kind: "none" }
  | { kind: "derive"; colliderProfileRef: string }
  | { kind: "explicit"; colliderDefinitionRef: string };
```

建议支持的引擎无关 Collider Definition：

- Box；
- Sphere；
- Capsule；
- Cylinder；
- Convex Hull；
- Compound；
- Static Triangle Mesh。

规则：

- 动态 Object 不允许使用任意 Triangle Mesh Collider；
- 小石块默认使用 Convex Hull 或低复杂度 Compound；
- 大型不可移动 Landmark 可以使用经过预算限制的 Static Triangle Mesh；
- Visual Mesh 的高频噪声不应直接进入 Collider；
- Collider 必须有独立 Inventory、Hash 和 Debug Preview；
- Collider Derivation Profile 属于 Registry 资源，并进入 Resource Lock。

### 12.2 Motion Type 与 Collider 兼容矩阵

Collider 能否使用不能只由几何类型决定，还必须结合 Motion Type：

| Motion Type | 允许的 Collider | 禁止/限制 |
|---|---|---|
| `static` | Primitive、Convex、Compound、预算内 Static Triangle Mesh | 不在运行时改变 Transform |
| `kinematic` | Primitive、Convex、Compound | 不允许任意 Concave Triangle Mesh |
| `dynamic` | Primitive、Convex、Compound | 禁止 Static Triangle Mesh；必须有质量/惯量策略 |
| `character-obstacle` | Primitive、简化 Convex、简化 Compound | 不直接使用高频 Visual Mesh |
| `visual-only` | `none` | 不创建 Physics Body/Shape |

Friction、Restitution、Collision Layer、Collision Mask、Sidedness、Mass 和 Center of Mass 必须来自版本化 Physics/Collider Profile，不能依赖 Babylon/Havok 默认值。Runtime Adapter 可以优化实现，但不得改变冻结语义。

Collider Derivation MUST 在 Compiler 侧生成稳定的 Primitive 参数、Hull Vertex/Face 或 Triangle Collision Mesh Descriptor 并计算 Hash。Runtime 不得从 Visual Mesh 临时重新推导另一套未锁定 Collider。底层 Havok Shape 的构建仍由 Adapter 完成，其兼容性由 `runtimeImportProfileHash` 和物理 Conformance Test 锁定。

Babylon Physics Shape 可以被多个 Body 共享，且释放 Body 不会自动释放共享 Shape。因此 Runtime 必须使用显式 Shape Lease/Reference Count：

- Body、Shape、Visual Instance 和 Asset Lease 分别拥有生命周期；
- 销毁一个 Object Instance 不得销毁仍被兄弟 Instance 使用的 Shape；
- 最后一个 Shape Lease 释放时才 Dispose Shared Shape；
- 任一 Dispose 抛错时仍要继续清理其余资源，并返回封闭 Diagnostic；
- exactly-once Dispose 与逆序 Unwind 必须有故障注入测试。

### 12.3 与 Heightfield Terrain 的边界

第一阶段 Custom Geometry 是静态 Object/Landmark，不取代 Heightfield Terrain：

- 地表连续行走、坡度、出生点和水域仍以 Heightfield 为真相；
- 岩石、墙、桥墩等作为独立 Collider 叠加；
- Custom Mesh 可以形成视觉悬挑，但不能据此宣称 Cave/Overhang Navigation 已支持；
- 如果一个对象承担主要通行表面，必须通过专门的 Traversal Surface Capability 将语义
  绑定到 Collider Subshape，并按主体 Profile 验证；不允许仅凭 Mesh 可见就默认可走。

这能防止“画面看起来像游戏场景”但碰撞、导航和相机仍不成立。
桥梁、桥洞、垂直崖壁、天然拱门、悬挑、Terrain Opening 和可进入洞穴的正式组合边界
由 [`Hybrid Terrain 与非 Heightfield 特殊地形设计`](2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)
负责；本文只定义 Geometry 的可选制作来源，不能单独作为特殊地形生产支持的完成证据。

## 13. Instance、Scatter 与复用

### 13.1 Runtime 不负责随机摆放

AI 可以声明 Scatter Constraint，但 Layout Solver/Compiler 必须在构建期展开为稳定 Instance Transform：

```ts
interface ObjectScatterSpecV1 {
  id: string;
  kind: "object-scatter";
  prototypeRef: string;
  regionId: string;
  count: number;
  minimumSpacingMeters: number;
  scaleRangeRatio: readonly [number, number];
  yawRangeRadians: readonly [number, number];
  seedOffset: number;
}
```

Normalized IR 保存求解后的实体或 Instance Set；ExecutionPlan 保存最终 Transform。Runtime 不再次随机。

### 13.2 GPU Instance 与逻辑 Entity

不是每块装饰石头都必须成为完整 Gameplay Entity：

- 有碰撞、交互、Capture 身份或关系的对象必须有稳定 `entityId`；
- 纯远景装饰可以编译为 `ExecutionInstanceSet`；
- Instance Set 仍需稳定 ID、Prototype Ref、Transform 数组、Bounds 和资源统计；
- 从 Visual-only 升级为可交互时，应显式转换为 Entity，不能让 Runtime 临时猜测身份。

`ExecutionInstanceSet` 表达的是“共享 Geometry/Prototype 的一组最终 Transform”，不是 Babylon Thin Instance 或 Three InstancedMesh。Runtime Adapter 自行选择实现，并遵守目标引擎限制：

- 按 Geometry Asset、Material Profile、Collider/Motion Type 和不兼容 Transform 特征分批；
- Babylon Thin Instance 无法安全支持的每实例 Scale/Physics 组合必须拆批或退化为独立 Instance；
- Instance Transform 变化后必须更新集合 Bounds，不能让 Frustum Culling 使用旧 Bounds；
- Optimization Path 与 Fallback Path 必须产生同样的 Entity/Snapshot/Capture 语义；
- Draw Call 优化不能牺牲独立 Collider、可选择身份或生命周期隔离。

## 14. Authoring、IR 与 ExecutionPlan 投影

| 层 | 保存什么 | 明确不保存什么 |
|---|---|---|
| AuthoringSpec | Geometry Definition、Prototype、Instance、Recipe 或 Asset Ref、AI 语义 | 计算后的 Hash、Bounds、Runtime Handle |
| Geometry Build Record | Source/Compiler/Dependency Hash、Inventory、Asset Hash、Diagnostic | 世界实例状态 |
| NormalizedWorldIR | 完全解析的 Geometry Descriptor、Resource Lock、最终 Prototype/Instance、Collider Descriptor | Host URI、Source Code、Three/Babylon 对象 |
| ExecutionPlan | Runtime 需要的最小 Geometry Asset/Collider Descriptor、最终 Transform、资源预算 | Recipe、AI Prompt、Registry URI、构建工具细节 |
| Host Registry | Manifest、URI、许可证、受控字节提供方式 | Runtime Entity 状态 |
| Runtime | Babylon/Havok Handle、Cache Lease、Instance Ownership | AI Source、Registry 查询、布局求解 |

建议的 Execution Descriptor：

```ts
interface ExecutionGeometryAssetV1 {
  geometryAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  gltfVersion: "2.0";
  extensionsUsed: readonly string[];
  extensionsRequired: readonly string[];
  runtimeImportProfileRef: string;
  runtimeImportProfileHash: string;
  inventory: GeometryInventoryV1;
  bounds: GeometryBoundsV1;
}

interface ExecutionObjectVNext {
  entityId: string;
  prototypeRef: string;
  geometryAssetRef: string;
  geometryDefinitionHash: string;
  transform: ExecutionTransformV3;
  collider: ExecutionObjectColliderV1;
  semanticClassId: string;
}
```

Runtime 通过 `geometryAssetRef + artifactContentHash` 请求 Host Resolver。Resolver 返回字节后必须复验长度、Media Type、Hash 和 Inventory，再交给 Babylon Loader/Geometry Adapter。

## 15. Runtime Adapter 与资源所有权

### 15.1 Adapter Port

领域层可以定义内部 Port：

```ts
interface GeometryRuntimePort {
  acquireGeometryAsset(descriptor: ExecutionGeometryAssetV1): Promise<GeometryAssetLease>;
  createObjectInstance(input: GeometryObjectInstanceInput): Promise<GeometryObjectInstance>;
  disposeObjectInstance(instance: GeometryObjectInstance): Promise<void>;
}
```

Port 的公共数据保持引擎无关。Babylon Adapter 内部负责：

- GLB Parse/Container Cache；
- 白模材质覆盖；
- Mesh Clone 或 Thin Instance；
- Collider 构建；
- Transform/Pivot 对齐；
- Scene、Mesh、Material、Body、Lease 的所有权和逆序释放。

### 15.2 资源缓存

缓存 Key 至少包含：

```text
geometryAssetRef + artifactContentHash + runtimeImportProfileHash
```

同一 Geometry Asset 的多个 Instance 共享不可变源数据，但拥有独立 Transform、Collider 和可变可见状态。销毁一个 Instance 不能影响其他 Instance；释放最后一个 Lease 后才能销毁共享 Container。

生产 Cache/Ownership 还必须满足：

- 同一 Key 的并发 Load 共享一个 Pending Promise，不重复 Fetch/Parse；
- Rejected Entry 必须从 Pending/Resolved Cache 原子移除，后续可以重试；
- Resolver Byte Length、SHA-256、GLB Preflight、Khronos Validation Policy 和实际 Imported Inventory 按固定顺序执行；
- 任一阶段失败都保留首个受控错误，清理错误不得覆盖主错误或泄漏 Provider 文本；
- Instance 构建采用 Transactional Ownership Stack，只有所有 Visual/Collider/Binding 成功后才 Commit；
- Partial Construction、Runtime Dispose 和 Cache Shutdown 都必须清理全部已拥有资源；
- Dispose 必须幂等；并发 Acquire/Release/Shutdown 具有定义明确的状态机；
- Asset Cache 只缓存不可变 Source/Container，不能共享会被 Animation、Material 或 Transform 修改的 Instance State。

### 15.3 白模外观

第一阶段 Runtime 覆盖外部材质，使用 SDK 控制的白模/语义色材质。Geometry Asset 不允许通过嵌入 Shader、Texture URI 或材质脚本绕过白模约束。后续 Visual Bible 可以依据 Geometry/Prototype 的稳定身份映射风格资产，但不能改变碰撞真相。

## 16. AI-friendly 设计要求

### 16.1 统一术语

公开面只使用以下核心词：

| 概念 | Canonical 名称 |
|---|---|
| 可复用几何定义 | `GeometryDefinition` |
| 编译后的 Mesh 字节资源 | `GeometryAsset` |
| 结合语义、几何和 Collider 的对象模板 | `ObjectPrototype` |
| 世界中的对象 | `ObjectNode` / Runtime `Entity` |
| 几何定义引用 | `geometryDefinitionRef` |
| 编译几何引用 | `geometryAssetRef` |
| 对象模板引用 | `prototypeRef` |
| Collider 引用 | `colliderDefinitionRef` 或 `colliderProfileRef` |

不能并存 `meshDefinitionRef`、`modelRef`、`shapeRef`、`geometryRef` 等同义字段。

### 16.2 Schema 规则

- JSON Wire Contract MUST 使用 JSON Schema Draft 2020-12，并声明稳定 `$schema` 与项目拥有的 `$id`；
- Canonical JSON 对象默认闭合，使用 `additionalProperties: false` 或经过组合验证的 `unevaluatedProperties: false`；
- Tuple 使用 `prefixItems`，同质集合使用 `items`，不能混用旧 Draft 语义；
- JSON Schema 是 Serialized Contract 的权威来源；TypeScript 类型、Builder Facade、CLI Help 和示例必须由同一契约生成或由结构等价测试锁定；
- Validator 的 `format` 默认可能只是 Annotation；所有 Resource Ref、Hash、URI 等自定义 Format 必须显式启用 Assertion 并有负向测试；
- 每个持久对象有 `id`、`kind` 和明确版本；
- 每个 Union 使用必填 `kind`；
- 数值字段包含单位和坐标域，如 `radiusMeters`、`positionsMetersXYZ`、`yawRangeRadians`；
- ID-indexed Map 使用 `...ById`；
- Collection 使用复数；
- Bool 使用 `is...`、`has...`、`allow...` 或 `...Enabled`；
- 不使用重叠 Optional Flag 表达互斥状态；
- SDK 派生字段不允许出现在 Authoring 输入；
- Diagnostic 必须返回稳定 Code、准确 `instancePath`、安全 Message 和结构化 Suggestion。

以下五个表面必须做自动一致性测试：

```text
JSON Schema
  ↔ TypeScript public types
  ↔ Builder output
  ↔ CLI/Browser payload
  ↔ committed examples and generated artifacts
```

任何公共字段重命名都必须在同一个变更中更新五个表面。未发布 Schema 可以经明确批准 Clean Break；发布后必须通过新 `schemaVersion` 和显式 Migration 处理，禁止长期保留同义 Alias。

### 16.3 版本与兼容性

- NPM Package 使用 SemVer `major.minor.patch`；
- Serialized Protocol 使用整数 `schemaVersion`；
- Registry Resource 使用不可变 `version`，同一 Ref/Version 的内容不得被覆盖；
- Resolver 锁定实现使用 `resolvedVersion` 与 `contentHash`；
- Compiler/Runtime 能力使用版本化 Profile Ref，不从 NPM 版本隐式推导；
- Artifact 必须保存生成它的 Schema、Compiler Profile、Dependency Lock 和 Runtime Import Profile；
- Runtime 必须在解析前检查 Compatibility Matrix，不支持的 Schema、Extension 或 Profile 返回稳定错误，不能尽力猜测。

Compatibility Matrix 至少记录：

```text
SDK package version
  → accepted Authoring schema versions
  → emitted IR / ExecutionPlan versions
  → supported Geometry Compiler Profiles
  → supported glTF core version and extension allowlist
  → tested Babylon/Havok adapter version range
```

### 16.4 能力发现

Agent 不应靠猜测 Recipe Kind 和限制。CLI/API 需要提供：

```text
worldkit geometry capabilities --json
worldkit geometry schema --kind deform --json
worldkit geometry preset list --json
worldkit geometry preset inspect <ref> --json
worldkit geometry compiler-profile inspect <ref> --json
```

输出必须包含支持的 Kind、参数 Schema、单位、预算、示例和兼容的 Collider Profile。

## 17. CLI、Browser 与调试体验

建议新增无状态 CLI：

```text
worldkit geometry validate <definition.json>
worldkit geometry compile <definition.json> --output <directory>
worldkit geometry inspect <geometry-asset-ref>
worldkit geometry explain <geometry-definition-ref>
worldkit geometry preview <geometry-definition-ref> --views front,right,back
worldkit geometry collider-preview <prototype-ref>
worldkit geometry compare <asset-a> <asset-b>
```

其中：

- `validate` 不执行未授权 Source；
- `compile` 在沙箱中运行并原子写出 Artifact；
- `inspect` 返回 Bounds、Inventory、Hash、Compiler Provenance；
- `preview` 必须来自实际 Runtime Adapter，不由图像模型伪造；
- `compare` 区分 Source、Topology、Bounds、Collider 和 Render Evidence 差异。

Browser Protocol 不接受代码，只允许：

- 加载已经编译的 WorldPackage；
- 查询 Geometry/Prototype/Entity 状态；
- 显示 Collider、Bounds、Pivot 和 Normal Debug Overlay；
- 控制相机、移动 Subject、截图和读取 Diagnostic。

## 18. Diagnostic 设计

建议冻结以下第一批稳定错误码：

| Code | 含义 |
|---|---|
| `GEOMETRY_DEFINITION_INVALID` | Definition Schema 或语义非法 |
| `GEOMETRY_RECIPE_KIND_UNSUPPORTED` | 当前 Compiler Profile 不支持 Recipe Kind |
| `GEOMETRY_RECIPE_DEPTH_EXCEEDED` | Recipe 嵌套过深 |
| `GEOMETRY_BUDGET_EXCEEDED` | 顶点、三角面、字节、时间或内存超限 |
| `GEOMETRY_MESH_VALUE_INVALID` | NaN、Infinity、越界 Index 等基础数据错误 |
| `GEOMETRY_TOPOLOGY_INVALID` | 退化面、非法 Winding 或禁止的拓扑问题 |
| `GEOMETRY_COLLIDER_DERIVATION_FAILED` | Collider Profile 无法安全构建 Collider |
| `GEOMETRY_ASSET_HASH_MISMATCH` | Resolver 字节与冻结 Hash 不一致 |
| `GEOMETRY_INVENTORY_MISMATCH` | 实际 GLB Inventory 与 Descriptor 不一致 |
| `GEOMETRY_COMPILER_PROFILE_UNAVAILABLE` | 指定 Compiler Profile 无法解析 |
| `GEOMETRY_SANDBOX_EXECUTION_DENIED` | Source 使用了禁止能力 |
| `GEOMETRY_SANDBOX_LIMIT_EXCEEDED` | 沙箱超时、内存或输出超限 |
| `GEOMETRY_BUILD_NONDETERMINISTIC` | 相同锁定输入重复构建得到不同 Hash |

Diagnostic 不得包含 Host 绝对路径、私有 URI、环境变量、Provider 异常文本或原始 Cause。

## 19. 安全与供应链

### 19.1 信任边界

| 输入 | 信任等级 | 处理 |
|---|---|---|
| AI Recipe JSON | 不可信 | Schema、预算、语义、拓扑校验 |
| AI TypeScript Module | 高风险不可信 | 隔离进程、能力白名单、资源限制、输出二次校验 |
| Registry Manifest | Host 受控但仍需校验 | Schema、签名/Hash、精确版本锁 |
| Geometry GLB Bytes | 不可信字节 | 长度、Hash、GLB 结构、Inventory、禁用内容校验 |
| ExecutionPlan | Compiler 产物但仍需防伪 | Runtime Contract 校验、Hash 校验 |

### 19.2 依赖规则

- 不自行实现通用 Mesh Boolean、Polygon Triangulation 或 GLB Serializer，优先选择成熟、维护中的实现；
- 几何依赖固定精确版本并进入 Dependency Lock；
- 每个 workspace package 声明直接依赖；
- Three Bridge 的版本独立于 Babylon Runtime 版本；
- 任何原生/WASM 几何 Kernel 都需要单独供应链、安全和确定性评审。

## 20. 性能与资源策略

### 20.1 编译期

- 在执行沙箱前先根据 Recipe 做静态成本估算；
- 实际输出再次核算，不能只信估算；
- 编译缓存按完整锁定输入寻址；
- 多个独立 Geometry Definition 可以并行编译；
- Artifact 发布采用临时目录构建、完整校验、原子 Promote，失败不覆盖旧产物。

### 20.2 Runtime

- 相同 Geometry Asset 共享 Parse/Container Cache；
- 大量无交互对象使用 Instance/Thin Instance；
- Collider 与 Visual LOD 分开；
- 视距、Frustum 和实例批次属于 Runtime Profile，不写入 AI Geometry Recipe；
- Resource Usage 同时统计设计预算和实际 Runtime 导入结果；
- Budget Gate 失败不能仅靠降低画质警告后继续生产运行。

## 21. 与 Subject、装备和关系能力的后续兼容

本设计首先服务静态 Object，但资源边界可以延伸到 Subject：

```ts
type SubjectVisualPartVNext =
  | SubjectPrimitivePart
  | SubjectAssetPart
  | {
      id: string;
      kind: "geometry";
      geometryDefinitionRef: string;
      localTransform: LocalTransform;
      semanticTags: readonly string[];
    };
```

未来人物手持自定义剑、坐骑挂载自定义鞍具时：

- Geometry Definition 只负责形状；
- Equipment Prototype 负责语义、Collider、Action Capability；
- Socket/Relationship 负责绑定；
- Animation Set 负责动作；
- Runtime Render Binding 才把最终 Mesh 节点挂到 Bone Socket。

因此，自定义几何不会替代现有 Subject Definition、Socket、Capability 或 Relationship，反而成为它们可复用的视觉资源。

## 22. 兼容与迁移策略

如果未来立项时 SDK 仍处于未发布私有开发期，可以再评审是否采用一次 Clean Break；
当前没有批准任何版本迁移。候选迁移步骤是：

1. 将 `PrimitivePrototypeSpec` 扩展或替换为 `ObjectPrototypeSpec`；
2. 把现有 Primitive 自动表示为内置 Geometry Definition；
3. 把 `landmark.compound` 实现为 Geometry Recipe 宏；
4. 把内部不透明 `custom` Resource 改为类型化资源，或明确标记为 Legacy Authoring-only；
5. 更新 Authoring Schema、TypeScript、Normalizer、Compiler、ExecutionPlan、Runtime、CLI、Examples 和 Conformance；
6. 重生成所有本地 Artifact，不为未发布字段永久保留 Alias。

不建议一次删除现有 WorldFeature。WorldFeature 仍适合封装跨 Terrain、Water、Landmark 和 Semantic 的领域操作；它的输出应改为正式 Geometry/Prototype/Instance 资源，而不是直接创建引擎对象。

## 23. 候选分阶段验证（仅在未来立项后）

### Phase G0：协议冻结与垂直切片

- 冻结 Geometry Definition、Object Prototype、Geometry Asset Manifest 和 Build Record；
- Primitive/Compound 走新链路；
- 一个程序化岩石 Recipe；
- 一个显式 Custom Mesh；
- Static Convex Collider；
- Authoring → IR → Plan → Babylon Runtime → Screenshot 全链路；
- 保证现有 Primitive 场景视觉与物理不回退。

### Phase G1：核心 Recipe

- Extrude、Lathe、Sweep、Deform；
- Standard Compiler Profile；
- 确定性 GLB；
- Bounds/Pivot/Normal/Topology 工具；
- Geometry/Collider Preview CLI；
- Registry 与 Package-local Geometry Definition。

### Phase G2：Sandboxed Geometry Module

- 独立 Worker/Container；
- TypeScript Builder；
- 静态 Import Allowlist；
- CPU/内存/输出限制；
- 三次重复构建确定性 Gate；
- Source/Compiler/Dependency 完整 Provenance。

G2 完成标准：Sandbox 使用独立隔离边界，越权、Crash、Timeout、Oversized IPC、依赖篡改和 Process-tree Cleanup 测试全部通过；同一锁定 Source 连续三次生成相同 Geometry Asset Hash，并且 Runtime/WorldPackage 中不存在 Source Code。

### Phase G3：Three Authoring Bridge 与实例化

- 受限 `BufferGeometry` Import；
- Scatter 编译；
- Runtime Instancing；
- Visual/Collider 独立 LOD；
- 更完整的浏览器 Inspector。

### Phase G4：高级几何 RFC

- Boolean CSG；
- Loft/Voxel/Remesh；
- Walkable Mesh Surface；
- Subject Geometry Part；
- 装备和动态 Object。

G4 每项都需要独立 Design/Threat/Performance Review，不能作为 G0 的顺手扩展。

## 24. 测试策略

### 24.1 Contract 与 Schema

- JSON Schema Draft 2020-12 Meta-schema validation；
- JSON Schema ↔ TypeScript ↔ Builder ↔ CLI/Browser ↔ Example 结构等价；
- 每个 Union 的合法/非法组合；
- 所有数值单位和 Closed Enum；
- 重复 JSON Key、Unknown Field、伪造 SDK-derived Field 和错误 Custom Format；
- Package/SemVer/Schema/Resource/Resolved Version 语义不混用；
- 不允许 Provider 私有字段进入 Canonical JSON；
- Package Ref、Registry Ref 和 Resource Lock；
- URI 只存在于 Host Manifest。

### 24.2 Compiler

- RFC 8785/JCS 兼容向量或版本化 Canonical Profile Golden Vector；
- 同一输入重复构建 Hash 一致；
- 输入顺序在声明为无序的集合中不影响结果；
- NaN、Infinity、Index 越界、退化面、重复面；
- Budget 临界值和超限；
- Pivot、Bounds、Normals 和 Winding；
- `+X / +Y / -Z-front` 坐标 Fixture 的 SDK → glTF → SDK Round-trip；
- Intrinsic XYZ → Quaternion → glTF TRS 的固定顺序；
- Negative/Zero Scale、Shear、Double Basis Conversion 被拒绝；
- GLB 字节、Inventory 与 Descriptor 对齐；
- Khronos glTF Validator Error=0、Extension Allowlist 和 Warning Policy；
- 构建失败不留下半成品 Artifact。

### 24.3 Sandbox

- 网络、文件、环境变量、动态 Import 均被拒绝；
- 超时、内存、输出大小可终止且不泄露私有错误；
- `Math.random`、时间和系统随机不可用；
- Worker Crash 后 Host 能清理并重试；
- Three Bridge 不能创建 Renderer、Loader 或外部资源。

### 24.4 Runtime

- 真实 GLB 字节加载；
- 多实例 Mesh/Transform/Collider 隔离；
- Instance Optimization 与独立 Instance Fallback 的语义一致；
- Thin Instance 的 Scale/Root Transform 限制会正确拆批或降级；
- Cache Lease 和 exactly-once dispose；
- 并发 Load 去重、Rejected Entry Eviction、Partial Construction Rollback；
- Body 与 Shared Physics Shape 的独立 Lease/Dispose；
- Hash/Inventory Tamper 被拒绝；
- Convex、Compound、Static Mesh Collider 行为；
- Subject 与自定义障碍物碰撞；
- Primitive Regression；
- 60Hz/120Hz 显示刷新下固定 Tick 结果一致。

### 24.5 视觉与物理验收

- Front/Right/Back 白模预览；
- Runtime Screenshot，而不是图像模型生成预览；
- Bounds/Pivot/Collider Overlay；
- Front/Right/Back 方向与 glTF Basis Conversion 一致；
- 参考图关键轮廓的 Screen Region/Anchor Gate；
- 同一资源多个 Instance 的视觉一致性；
- 岩石不穿地、玩家不穿石、不会因高频 Visual Noise 卡住控制器。

### 24.6 Fuzz 与 Property Tests

- 随机合法 Recipe 永不产生 NaN/Crash；
- 非法 Mesh 不绕过 Budget；
- Collider 体积和 Bounds 满足 Profile 不变量；
- Canonical Serializer 对 Map/Collection 顺序稳定；
- Dispose 在任意单资源抛错时仍清理所有兄弟资源，并返回封闭错误码。

### 24.7 Compatibility 与发布门禁

- 逐个受支持 Babylon/Havok 版本运行 Adapter Conformance；
- 逐个受支持 Browser/Graphics Backend 运行真实 Render Capture，不以 NullEngine 代替视觉验收；
- Compiler Profile、glTF Extension Allowlist 和 Runtime Capability Matrix 双向一致；
- Package Version、Schema Version 和 Artifact Provenance 与 Release Note 对齐；
- 发布包只包含声明的 Public Export，TypeScript Internal Type 不意外成为兼容承诺；
- Golden Hash 更新必须附带语义原因和人工可视检查，禁止无解释地批量接受新 Snapshot。

## 25. 假设性 G0 验收标准（仅在未来立项后）

G0 只有同时满足以下条件才算完成：

1. AI 可以仅通过 Canonical JSON 定义一块非对称岩石并生成三个实例。
2. AI 可以通过受控 `MeshDraftV1` 构建输入输出一个目录中不存在的自定义静态物体；G0 不执行不可信 Source Module。
3. 两种输入都生成 Geometry Definition、Geometry Asset、Build Record 和稳定 Hash。
4. Authoring、IR、ExecutionPlan 和 Browser Protocol 不包含 Three/Babylon/Havok 类型或 Host URI。
5. Babylon Runtime 通过 Host Resolver 加载冻结字节，复验 Hash 与 Inventory。
6. 三个实例共享不可变 Asset，但拥有独立 Transform、Collider 和生命周期。
7. 玩家可以与岩石碰撞；Collider Debug View 与实际阻挡一致。
8. 同一锁定输入连续三次构建得到相同 GLB Hash、IR Hash 和 Plan Hash。
9. 超预算、非法拓扑、Hash Tamper、沙箱越权都返回稳定 Diagnostic。
10. CLI 可以 Validate、Compile、Inspect、Explain、Preview 和 Collider Preview。
11. Browser/Playwright 可以移动玩家、截图并查询对象/Collider 状态。
12. 现有 Terrain、Water、Primitive Object 和 Rigged Subject Conformance 不回退。
13. Geometry JSON Schema 通过 Draft 2020-12 Meta-schema，五个 Public Surface 的结构一致性 Gate 通过。
14. 每个 GLB 通过 Khronos Validator，且 Extension/Warning Policy 无未审批例外。
15. SDK `-Z forward` 与 glTF `+Z forward` 的 Round-trip、Front/Right/Back、Winding、Normal 和 Collider Fixture 全部通过。
16. Package/Schema/Resource/Resolved Version 与 Compatibility Matrix 可由 CLI 查询，并在不兼容输入上 Fail Closed。
17. G0 对 Sandbox Source Module 返回稳定 Unsupported Diagnostic，不存在任何 Runtime 或进程内代码执行旁路；完整 Sandbox 隔离验收属于 G2。
18. Build Record 与 Attestation 分离；Artifact Hash 不受时间、Invocation ID、绝对路径或 Builder Host 影响。

## 26. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| AI 生成过密 Mesh | Build/Runtime 性能失控 | 静态估算 + 实际预算 + Profile Gate |
| 视觉 Mesh 与 Collider 不一致 | 穿模或看不见的阻挡 | 独立 Collider Preview + Playability Gate |
| 沙箱逃逸 | Host 安全风险 | 独立进程/容器、无 I/O、Allowlist、资源限制、二次校验 |
| Three Bridge 污染 Canonical 协议 | Runtime 被 Authoring Backend 绑定 | Bridge 仅输出 MeshDraft，结构审计禁止 Provider 字段 |
| 几何编译不确定 | Cache/Replay/证据失效 | 精确依赖锁、量化、确定性 PRNG、重复构建 Gate |
| Recipe Schema 无限膨胀 | AI 难以理解和维护 | 只加入高价值闭合操作，高级能力用独立 RFC |
| Custom Mesh 被滥用于地形 | 导航、相机、物理承诺失真 | G0 仅静态 Object/Landmark，Heightfield 继续为地表真相 |
| GLB 含外部资源或私有材质 | 安全、白模一致性和可复现性失效 | 自包含 GLB、禁止外部 URI、Runtime 白模材质覆盖 |
| 大量独立实体造成开销 | CPU/内存和 Snapshot 膨胀 | Visual-only Instance Set，交互对象才升级 Entity |

## 27. 被否决的设计

### 27.1 “AI 直接写场景 TypeScript”

否决原因：把几何、逻辑、物理、资源和运行时生命周期重新耦合；无法形成可信 WorldPackage。

### 27.2 “所有形状都由 SDK 预设”

否决原因：无法覆盖开放世界长尾；目录规模和 Agent 检索成本会持续增长。

### 27.3 “所有自定义形状都用顶点 JSON”

否决原因：表达冗长、Token 成本高、难以解释意图、难以参数化复用。Mesh Draft 应是逃生舱，不是默认入口。

### 27.4 “Runtime 根据 Visual Mesh 自动猜 Collider”

否决原因：结果依赖引擎版本和导入细节，无法锁定物理行为；动态 Triangle Mesh 还会带来稳定性和性能问题。

### 27.5 “直接把 Three BufferGeometry 放入 Schema”

否决原因：Class Instance 不是持久协议；字段语义、版本和序列化都受 Provider 绑定。Three 只能作为非 Canonical Authoring Adapter。

## 28. 待评审决策

以下问题需要评审者明确给出 `Accept / Change / Reject`，不能只给笼统意见：

1. 三层模型是否同时覆盖“高频稳定”和“长尾自由”需求？
2. `GeometryDefinition → ObjectPrototype → Object Instance` 三层是否过度，还是恰好保持复用、语义和物理解耦？
3. Geometry Recipe V1 的 Primitive/Compound/Extrude/Lathe/Sweep/Deform 是否足够；是否有必须进入 G1 的缺失操作？
4. Custom Mesh 编译为自包含 GLB 是否合适；是否需要另一种 Canonical Binary？
5. Three.js Authoring Bridge 仅作为隔离 Tooling Adapter 的边界是否足够严格？
6. Standard Compiler Profile 的预算是否适合浏览器白模世界？
7. Position `0.0001m` 的量化是否足够稳定且不会损伤预期轮廓？
8. Collider Policy 是否清楚地区分 Visual 与 Physics？
9. G0 仅支持静态 Object/Landmark 是否与当前 Outdoor Heightfield Phase Boundary 一致？
10. Geometry Build Record、Resource Lock、Host Resolver 和 Runtime Cache 是否复用了现有 Subject Asset 的正确范式？
11. 是否存在 Provider 术语、URI、代码或可变 Handle 泄漏进 Canonical IR/Plan 的风险？
12. Phase G0–G4 是否能形成可验收的独立垂直切片？
13. JSON Schema 是否足以成为 Wire Contract 权威来源，五表面一致性测试是否可落地？
14. Canonical JSON 应直接承诺 RFC 8785，还是冻结项目自有 Profile 并提供互操作向量？
15. `B_sdk_to_gltf(x,y,z)=(-x,y,-z)`、Intrinsic XYZ 和 `T*R*S` 是否与现有 Runtime/资产导入约定完全一致？
16. Whitebox Geometry GLB Profile 是否遗漏必须允许或必须禁止的 glTF Core/Extension 能力？
17. Motion Type/Collider 兼容矩阵与 Shape Lease 是否覆盖 Babylon/Havok 的生产约束？
18. Sandbox Threat Model 和 SLSA-aligned Build Provenance 是否达到生产接入标准，是否需要独立安全 RFC？

评审输出建议格式：

```text
Ruling: ACCEPT | ACCEPT WITH CHANGES | REJECT

P0:
- ...

P1:
- [section] finding / evidence / required change

P2:
- [section] finding / evidence / suggested change

Confirmed strengths:
- ...

Open decisions:
- question → recommendation → tradeoff
```

## 29. SDK 与 3D 业界最佳实践合规矩阵

本节是评审和实施的最终检查表。只有“设计机制”和“机器 Gate”同时存在，才能标记为符合；仅引用标准不算完成。

| 最佳实践 | 设计机制 | 必需机器 Gate |
|---|---|---|
| 单一公共方言 | Canonical Geometry/Prototype/Asset 名称，不暴露 Provider 同义词 | Schema/TS/Builder/CLI/Example 结构审计 |
| 明确版本语义 | SemVer、`schemaVersion`、Resource `version`、`resolvedVersion` 分离 | Compatibility Matrix 与不兼容拒绝测试 |
| 闭合且可发现的 Schema | JSON Schema 2020-12、Closed Union、Capability Query | Meta-schema、负向 Schema、Custom Format Assertion |
| 可复现 Hash | Canonical Profile、领域排序、Float Quantization、SHA-256 | Golden Vector、顺序变异、三次重复构建 |
| 标准 3D 交付 | 自包含 glTF 2.0 GLB、明确 Media Type | Khronos Validator Error=0、Extension Allowlist |
| 坐标和单位唯一 | SDK `-Z` ↔ glTF `+Z` 显式 Basis、米、弧度 | Axis Round-trip、Tri-view、Winding/Normal/Collider |
| Transform 无歧义 | Intrinsic XYZ → Canonical Quaternion、`T*R*S`、禁止 Shear/负 Scale | Transform Golden Fixture 与非法矩阵测试 |
| Visual/Physics 解耦 | Geometry Definition 与 Collider Profile 分离 | Collider Overlay、用途拓扑矩阵、运动类型兼容测试 |
| 静态/动态 Collider 正确 | Dynamic 仅 Primitive/Convex/Compound；Mesh 仅受控 Static | Physics Conformance、坡面/落地/阻挡实测 |
| 高效复用 | Asset/Shape Cache、Instance Set、Adapter 选择实例化方式 | 多实例隔离、拆批/Fallback、Draw/Memory Budget |
| 资源所有权明确 | Lease、Reference Count、Transactional Construction、逆序释放 | 并发、故障注入、exactly-once Dispose |
| 不可信代码安全 | 构建期独立进程/容器、无 I/O、硬资源限制 | Escape/Timeout/Crash/Oversized Output 测试 |
| 构建来源可追溯 | 确定性 Build Record + 非确定性 Attestation 分离 | Dependency/Output Hash 对齐、无 Host 信息入 Hash |
| Runtime Fail Closed | Hash/Length/Inventory/Extension/Profile 全量复验 | Tamper、Unknown Extension、Resolver Retry 测试 |
| 引擎隔离 | Three 仅 Authoring Bridge，Babylon/Havok 仅 Runtime Adapter | Source/Artifact Provider-key 审计 |
| 真实验收 | 固定 Tick、真实浏览器截图、真实碰撞、Tri-view | CLI/Browser/Playwright Conformance 与人工视觉复核 |

在实施 PR 中，每一行都必须链接到具体 Contract、测试文件和验证命令。无法提供证据的行保持未完成，不得用“架构上支持”代替交付状态。

## 30. 最终结论

这个 SDK 的长期方向不应是“只能从目录选择白模”，而应是：

> AI 优先使用经过验证的大积木；目录不足时，用引擎无关的几何配方；配方仍不足时，在构建期沙箱中生成受控 Mesh。所有自由表达最终都被编译为可哈希、可预算、可碰撞、可缓存、可解释的冻结资源，再由统一 Runtime 执行。

这既保留了 Coding Agent 根据图片创造独特 3D 轮廓的能力，也保留了生产游戏 SDK 必须具备的确定性、物理正确性、资源所有权、安全边界和自动验收能力。
