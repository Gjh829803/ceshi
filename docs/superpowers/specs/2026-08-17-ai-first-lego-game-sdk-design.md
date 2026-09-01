# AI-first LEGO 游戏 SDK 设计

- 状态：待评审
- 日期：2026-08-17
- 目标仓库：`agent-whitebox-world-sdk`
- 目标读者：SDK 团队、上游 Agent 团队、运行时与测试工具维护者
- 评审支撑材料：[业界对照与可落地性核查报告](./2026-08-18-industry-alignment-and-feasibility-review.md)
- 外部方案专题：[Agentic 白模世界到可控视频：开源方案调研与架构启示](./2026-08-19-agentic-whitebox-to-video-open-source-research.md)
- 空间求解专项：[Placement Constraint 与确定性 Layout Solver](./2026-08-19-placement-constraint-layout-solver-design.md)
- 拍摄制品专项：[Simulation Take 与 Control Capture Bundle](./2026-08-19-simulation-take-control-capture-design.md)
- 质量协议专项：[World Validation Report 与质量门禁](./2026-08-19-world-validation-report-and-quality-gates-design.md)
- Native Lane 范围修订：[AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)

> 本文的“AI 不直接生成 Babylon/TypeScript 场景代码”继续完整约束 Canonical Lane。ADR-0007 新增的
> 隔离 Babylon Native Scene Lane 是显式范围修订：AI 可创建 Babylon 视觉对象，但仍不能创建
> Havok、人物、动作、主相机、Runtime 状态或独立 Tick；当前生产入口仍是 Canonical Lane。

## 1. 结论

本项目的 Canonical Lane 要建设一个面向 AI 的、Schema-first、可组合、可验证的 Web 游戏 SDK。
上游 Agent 根据图片和 Prompt 推断一个合理的可玩世界，输出声明式 JSON；SDK 不理解图片、不调用模型，
而是负责校验、规范化、编译并运行这个世界。隔离 Babylon Native Scene Lane 的职责以 ADR-0007 为准。

正式链路为：

```text
图片 + Prompt
    ↓
外部 Agent
    ↓ AuthoringSpec JSON
SDK Schema Validator
    ↓
Normalizer + Kit Expander + Capability Resolver
    ↓
Terrain Compiler + Deterministic Layout Solver
    ↓ NormalizedWorldIR
World Compiler
    ↓ ExecutionPlan / WorldPackage
Simulation Take
    ↓
Babylon Web Runtime + Physics Backend / Runtime Session
    ↓
Control Capture Bundle + Validation Report
    ↓
可移动、可碰撞、可重放、可自动验收的游戏世界与控制制品
```

核心设计原则：

1. AI 默认使用“大积木”：WorldNodeSpec、Kit、Capability、Relationship 和 Semantic Action。
2. SDK 内部使用“小积木”：Component、System、Port、Adapter 和确定性执行阶段。
3. Canonical Lane 的 AI 永远不直接生成 Babylon RenderNode、物理句柄、动画 Mixer 或底层
   TypeScript 场景代码；Babylon Native Scene Lane 的受控视觉例外以 ADR-0007 和专项规格为准。
4. 配置负责组合已有能力；第一次增加新的能力类别时，由 SDK 插件实现。
5. 逻辑图、渲染/Transform 图和物理图分离，各自拥有明确真相和同步规则。
6. 同一份 Spec、同一份 Registry Lock 和同一个 Seed 必须产生 bit-for-bit 相同的规范化结果；模拟与视觉结果按照本文定义的 Determinism Profile 验收。
7. SDK 正式交付物是库 API、无状态的一次性 CLI、有生命周期的 Runtime Session 协议、浏览器控制协议和可持久化 WorldPackage。
8. Babylon.js 是默认 Web Runtime，但对外 Schema 与引擎无关。
9. 当前仓库继续作为 SDK 仓库；生产 Agent 编排由另一个团队在独立仓库实现。
10. AI 表达 Region、相对空间关系和 Placement Constraint；确定性 Layout Solver 负责最终 Transform，运行时 Gameplay Relationship 不参与编译时布局。
11. WorldPackage、Simulation Take、Runtime Session、Control Capture Bundle 和最终生成视频是不同制品，使用明确引用和 Hash 连接。
12. 生产验收由版本化 Validation Profile 与量化 Validation Report 决定；任一必需 Gate 失败都不能被综合分数覆盖。
13. AI-facing 层负责表达世界语义与创作意图；Canonical Resource Contract 负责把 Prototype、Kit 和受控 Authoring Sugar 确定性展开为稳定资源引用、逻辑 Subshape、物理身份与 Hash，Runtime/Validation 负责证明实际世界事实。未来可以增加更高层语义 Sugar，但只能降级为既有 Canonical 合同，不能形成第二套 Runtime、Physics 或 Traversal 真相。

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
- Placement Constraint 求解、最终 Transform Provenance 与可解释冲突报告。
- Simulation Take、固定 Tick Track、多 Pass Control Capture Bundle 与完整性协议。
- 物理、可玩性、构图、Capture、Replay、资源预算和性能的量化 Validation Report。
- 能力发现、示例查询、结构化 Diagnostic 和安全修复建议。

### 3.2 Canonical Lane 上游 Agent 负责

- 图片理解、Prompt 解析、语义分割、深度线索和空间关系推断。
- 可见证据与隐藏区域的合理补全。
- 选择 SDK 已注册的 Kit、Capability、Action 和节点类型。
- 输出符合 Schema 的 AuthoringSpec JSON。
- 根据 SDK Diagnostic、运行时状态和截图迭代修复配置。
- 模型调用、Prompt 工程、重试、工作流、队列和生成服务。

### 3.3 Canonical Lane 的 SDK 不负责

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
| WorldNodeSpec | AuthoringSpec 中由 AI 声明的世界实例描述；可以使用受控嵌套简写。 |
| RuntimeEntity | 规范化后具有稳定 ID、生命周期、组件和关系的逻辑实例。 |
| RenderNode | Babylon Runtime 内部的视觉或 Transform 节点，不进入公共 Schema。 |
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
| PlacementConstraint | Authoring 期描述 Entity/Region/Route/Camera 空间要求的类型化约束；不表示运行时关系。 |
| LayoutSolveReport | Layout Solver 输出的最终 Transform、逐约束结果、Provenance、冲突和 Hash。 |
| SimulationTake | 引用 WorldPackage 的固定 Tick 控制、动作、相机与 Capture 计划。 |
| ControlCaptureBundle | 一次 Take 实际运行生成的多 Pass 帧、轨迹、相机、状态和完整性证据包。 |
| ValidationProfile | 版本化 Gate、Metric、阈值、Evaluator 与平台要求。 |
| ValidationReport | 对单一制品执行 Profile 后得到的量化 Gate/Metric/Evidence 结果。 |
| Runtime Adapter | Babylon、物理、音频等底层实现与引擎无关 Port 的适配层。 |

`Capability` 和 `Kit` 的命名并非所有引擎统一，但分别对应 Trait/Behavior/Module 与 Prefab/Archetype，符合通用工程概念。

本文后续单独出现 `Node` 时默认指 AI-facing 的 `WorldNodeSpec`；运行时逻辑对象统一称为 `RuntimeEntity`，Babylon 节点统一称为 `RenderNode`。三者不能作为同一个公共类型复用。

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
  ├── Resource / WorldNodeSpec / RuntimeEntity / Relationship / Rule
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
  ├── solve layout
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
@worldkit/take + @worldkit/capture-contracts + @worldkit/validation
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
  layout/
  runtime-contracts/
  capabilities-core/
  capabilities-subject/
  capabilities-gameplay/
  kits/
  actions/
  runtime-babylon/
  physics-havok/
  take/
  capture-contracts/
  validation/
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
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.third-person@1",
  "spawnAnchorEntityId": "spawn-player"
}
```

Kit 内部展开为碰撞体、输入映射、运动控制、镜头、动作状态、动画、语义和渲染绑定。Agent 不需要重复填写这些底层细节。

### 6.2 高级模式：Capability 组合

当已有 Kit 不满足场景时，Agent 可以组合注册过的 Capability：

```json
{
  "id": "dragon-1",
  "kind": "subject",
  "prototypeRef": "dragon@1",
  "capabilities": [
    {
      "id": "ground-locomotion",
      "capabilityRef": "locomotion.ground@1",
      "enabled": true,
      "config": {}
    },
    {
      "id": "flight-locomotion",
      "capabilityRef": "locomotion.flight@1",
      "enabled": true,
      "activationGroupId": "locomotion",
      "config": {
        "cruiseSpeedMetersPerSecond": 18,
        "turnRateRadiansPerSecond": 1.4
      }
    },
    {
      "id": "mountable",
      "capabilityRef": "interaction.mountable@1",
      "enabled": true,
      "config": {
        "seats": [
          {
            "id": "saddle",
            "socketId": "spine-saddle"
          }
        ]
      }
    }
  ]
}
```

Canonical 高级模式仍然只能使用注册表中的能力，不能嵌入代码或底层引擎配置。

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
  "schemaVersion": 1,
  "id": "sunlit-bay",
  "seed": 1024,
  "provenance": {},
  "world": {},
  "resources": {},
  "nodes": [],
  "relationships": [],
  "rules": [],
  "startup": {},
  "constraints": {}
}
```

字段职责：

- `provenance`：保留用户 Prompt、参考图 URI、证据、推断与生成来源。
- `world`：边界、单位、坐标约定、重力、环境和预算。
- `resources`：模型、Rig、AnimationSet、Kit 和 Prototype 引用。
- `nodes`：世界实例。
- `relationships`：实体之间的动态或初始关系。
- `rules`：Trigger、Action、Objective、Timer 和状态规则。
- `startup`：出生点、初始控制目标和开场相机。
- `constraints`：路线坡度、构图区域、语义锚点和其他验收要求。

### 7.2 固定坐标与单位

- 长度单位：米。
- 时间单位：秒。
- 朝向、旋转和角速度默认使用弧度并在字段名中保留 `Radians`；面向人类配置的 FOV 与坡度允许使用度，但字段名必须保留 `Degrees`。
- 世界坐标：右手坐标系，`+Y` 向上。
- 主体和 Prototype 正前方：`-Z`。
- 默认 Pivot：`ground-center`；特殊资源必须显式声明。
- 屏幕构图坐标：左上为 `[0, 0]`，右下为 `[1, 1]`。

所有 Runtime Adapter 必须遵守这些公共约定，在边界内部进行引擎坐标转换。

### 7.3 字段命名、ID、命名空间与资源引用

Canonical Schema 与 AI Schema Profile 使用同一组字段名；Provider Adapter 只能缩窄结构，不能把字段翻译成另一套供应商私有方言。公共字段遵守以下规则：

- 当前对象自身使用 `id`；引用世界实体、Controller、Session、Slot 等本地对象时使用 `...EntityId`、`...ControllerId`、`...SessionId`、`...SlotId`。
- 引用 Registry、WorldPackage 或内容寻址资源时使用 `...Ref`；原始地址才使用 `...Uri`。禁止用裸 `target`、`rig`、`prototype` 同时表示 ID、内联对象和资源引用。
- 可序列化协议对象的结构版本使用 `schemaVersion`；Registry 定义的资源版本使用 `version`；锁定后的精确实现版本使用 `resolvedVersion`。
- `kind` 用于持久化定义或节点的判别 Union，`type` 用于 Command、Event、Relationship 和 Change Operation，`mode` 表示当前互斥运行状态。
- `...Mode` 表示当前状态，`...Model` 表示算法族，`...ProfileRef` 表示可复用调参资源，`...Policy` 表示选择、权限、回退或转移规则。
- 标量物理量在字段名中写明 `Meters`、`Seconds`、`Radians`、`Degrees`、`Ticks`、`Ratio` 或 `Bytes`。二维数组必须在字段名中写明 `XY`、`XZ` 或 `Uv`；三维 Transform 数组使用固定 `XYZ` 顺序并由字段名或 Schema 描述明确单位。
- 集合字段使用复数；按 ID 索引的对象使用 `...ById`。布尔字段使用 `is/has/allow` 或明确的 `...Enabled`，不能使用语义不明的状态词。
- AI-facing Relationship 使用角色化端点名，例如 `riderEntityId`、`mountEntityId`、`itemEntityId`、`wearerEntityId`；只有 NormalizedWorldIR 内部通用边表示才允许 `sourceEntityId/targetEntityId`。

以下两类引用必须分开：

```ts
type ResourceRef = string; // 受 worldkit-resource-ref format 约束，可使用 Schema 允许的简写

interface ResolvedResourceRef {
  uri: string;
  resolvedVersion: string;
  contentHash: string;
}
```

`ResourceRef` 是 Authoring 输入；`ResolvedResourceRef` 是 Registry Lock 和 NormalizedWorldIR 中的确定引用。二者不能复用同一个结构，否则 AI 无法判断是否需要填写内容哈希或精确版本。

这些规则不是照搬某个单一协议，而是对成熟约定的领域适配：

- [JSON Schema](https://json-schema.org/understanding-json-schema/structuring) 使用 `$id` 标识 Schema、使用 `$ref` 组合可复用定义；本 SDK 因此将对象身份与资源引用明确拆成 `id` 和 `...Ref`。
- [Kubernetes API conventions](https://kubernetes.io/docs/reference/kubernetes-api/definitions/api-resource-v1-meta/) 使用 `apiVersion` 和 `kind` 显式说明资源表示与种类；本 SDK 面向非 Kubernetes 的游戏协议，采用语义更直接的 `schemaVersion + kind`。
- [OpenAPI discriminator](https://spec.openapis.org/oas/v3.0.4.html#discriminator-object) 要求通过明确属性选择多态 Schema；本 SDK 固定用 `kind` 或 `type` 作为判别字段，不允许依赖字段猜测 Union 分支。
- [CloudEvents](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#context-attributes) 使用 `id`、`source`、`specversion` 和 `type` 等明确上下文属性；本 SDK 仅借鉴其“消息自描述”原则，不复用 `subject` 表示图关系端点，避免它与游戏主体概念冲突。
- [Unreal Engine Controller/Possession](https://dev.epicgames.com/documentation/en-us/unreal-engine/controllers-in-unreal-engine) 证明 `Controller` 与 `Possession` 是成熟的游戏领域术语；本 SDK 使用 `controllerId`、`controlledEntityId` 和 `possessedBy` 表达控制权，不发明 `driver`、`owner` 等近义别名。

因此，“业界标准命名”在本项目中的含义是：优先采用跨工具可识别的基础词汇，再通过一致后缀和领域角色名消除歧义；不是把某个外部协议的全部字段原样搬进游戏 Schema。

世界内实例 ID、包内资源和宿主注册表资源必须明确区分：

```text
player                                  # WorldPackage 内 RuntimeEntity ID
package://prototype/player              # 当前 WorldPackage 内资源
worldkit://kit/humanoid.third-person@1  # 宿主注册表中的 Kit Major Version
worldkit://capability/locomotion.ground@1
asset://sha256/<content-hash>            # 内容寻址资产
```

规则：

- WorldNodeSpec 的 `id` 在整个世界内唯一，不依赖数组位置或父节点路径。
- WorldNodeSpec 只引用宿主允许的 Kit、Capability 和资源，不能声明任意插件包。
- AuthoringSpec 可以接受由 Schema 声明的简短引用；Normalizer 必须将其改写为上述规范 URI 后再进入 NormalizedWorldIR。
- `normalize` 将 Major Version 解析成确定的实现版本与内容哈希，并写入 `registry-lock.json`。
- 多个注册表项匹配同一引用时返回歧义错误，禁止按注册顺序或“最新版本”静默选择。
- 外部 Asset URI 必须经过 AssetResolver；可持久化产物优先改写为内容寻址引用。

### 7.4 NormalizedWorldIR

NormalizedWorldIR 必须：

- 包含所有默认值，不依赖隐式行为。
- 将 Kit 展开成完整 Capability、Profile 与 Component。
- 将所有 ID 解析为稳定引用并检测悬空、重复与循环依赖。
- 将 Capability 依赖解析为无歧义的 provides/requires 绑定。
- 固定注册表版本、插件版本和资源哈希。
- 输出稳定排序和稳定 JSON 序列化结果。
- 不包含 Babylon、Havok、DOM 或进程内对象。
- 能独立用于 Diff、缓存、重放、迁移和审计。

### 7.5 Canonical Schema、AI Schema Profile 与 Provider Adapter

“面向 AI”不能只依赖字段命名和 Prompt 约定，必须成为可导出、可验证、可版本化的协议。SDK 维护三层边界：

| 层 | 责任 | 是否属于公共协议 |
|---|---|---|
| Canonical Schema | 完整表达 AuthoringSpec 语义，作为校验、文档和迁移的唯一真相 | 是 |
| AI Schema Profile | 从 Canonical Schema 投影出的受限、提供方无关子集 | 是 |
| Provider Adapter | 将 AI Schema Profile 转成某个模型 API 当时支持的结构化输出格式 | 否，属于接入层 |

Canonical Schema 使用 [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)，并遵守以下约束：

- 根 Schema 具有绝对 `$id`、明确 `$schema` 和稳定 `$defs` 名称；稳定 ID 不能由构建目录或包版本临时生成。
- Union 必须有 `kind`、`type` 或 `op` 等显式判别字段，禁止依赖模糊的字段组合猜测分支。
- 面向 AI 的对象默认关闭未知字段；需要扩展的位置使用注册过的 Extension Point，不能放任无约束 `Record<string, unknown>`。
- 数值字段在名称或描述中明确米、秒、弧度、Tick、归一化屏幕坐标等单位，并同时声明边界。
- 默认值由 Normalizer 应用并写入 IR；不能依赖模型记住或补齐隐式默认值。
- ID、Capability、Relationship、Action、Tag 和 Resource Ref 优先使用注册表枚举或带格式约束的引用，不接受任意自然语言字符串代替协议值。
- 示例和解释元数据可以进入独立 `schema-catalog.json`，但不能改变校验语义。

第一版定义提供方无关的 `constrained-json@1` Profile：只允许对象、数组、枚举、常量、有限 Union 和有界基础类型，不使用动态引用、递归 Authoring 结构或依赖复杂 Schema 求值顺序的表达。受控嵌套简写按 Profile 声明的深度预算投影，默认只展开一层。Provider Adapter 可以继续缩窄或展开 Schema，但必须保留字段语义，且必须将模型输出重新交给 Canonical Schema 和语义验证器；结构化输出只约束 JSON 形状，不证明坐标、关系或 Gameplay 语义正确。

Canonical Schema 中的 optional 表示字段可以缺失；它与显式 `null` 是两个不同状态。若某个 Provider Profile 要求全部字段存在，Adapter 可以把 optional 投影为 required + nullable，但必须同时记录 Projection Map：模型返回 `null` 时，只在该字段的 Canonical Schema 允许缺失且不允许 `null` 的情况下还原为“缺失”。如果 Canonical Schema 同时允许缺失和显式 `null`，required + nullable 无法无损表达两种状态，Projector 必须改用带 `present` 判别字段的包装对象，或以 `AI_SCHEMA_PROFILE_UNREPRESENTABLE` 拒绝该投影；Adapter 不得猜测或折叠二者。该往返规则必须进入 Adapter Conformance Fixture，避免不同 Provider 生成不同 AuthoringSpec 语义。

Schema Projector 的输入是 Canonical Schema、Registry Lock、已允许的 Kit/Capability 集合和资源预算，输出必须包含：

- `schemaProfile`、`schemaHash`、`registryLockHash` 和 Capability Set Hash。
- 当前任务真正允许的节点种类、关系、动作和配置分支；未安装能力不应继续出现在模型可选项里。
- 被裁剪分支及原因，供 Agent 在 Discovery 后重新规划。
- 与 Canonical Schema 的可追踪映射，保证 Diagnostic 仍能指向原 AuthoringSpec JSON Pointer。

Schema Projector 必须把提供方结构化输出的规模上限当作显式预算处理：属性总数、嵌套层数、枚举值总量和 Schema 总字符数都可能存在硬上限。注册表枚举超出预算时，按 Profile 声明的降级策略投影为带 `pattern`/`format` 约束的引用类型，由 Canonical Schema 与语义验证器兜底校验；降级不得改变字段语义，降级发生的位置与原因必须写入投影输出。

公共 Schema 中不得出现 OpenAI、Anthropic、Gemini 等提供方名称或私有关键字。Provider 兼容性由适配器 Conformance Fixture 验证；参考实现可借鉴 [OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) 等结构化输出能力，但不能把任一提供方当作协议真相。

### 7.6 Prototype、Instance、Variant 与 Composition Layer

为了让“成人/儿童、空手/持剑、步行/骑龙”可以像 Lego 一样组合，公共模型显式区分：

- `PrototypeSpec`：可复用的语义、视觉和能力基线，不直接存在于世界中。
- `InstanceSpec`：具有稳定 ID 和 Transform 的世界实例，通过 `prototypeRef` 引用原型。
- `VariantSetSpec`：在一个封闭选择维度中声明候选，例如 `body=adult|child`、`loadout=unarmed|sword`。
- `CompositionLayer`：有来源、优先级和基线哈希的一组显式覆盖操作，用于模板、用户输入或 Agent 修订。

```ts
interface PrototypeSpec {
  id: ResourceId;
  basePrototypeRef?: ResourceRef;
  components?: Readonly<Record<ComponentId, JsonValue>>;
  capabilities?: readonly CapabilityInstanceSpec[];
  variantSets?: readonly VariantSetSpec[];
}

interface InstanceSpec {
  id: EntityId;
  prototypeRef: ResourceRef;
  variants?: Readonly<Record<VariantSetId, VariantId>>;
  overrides?: readonly CompositionOperation[];
}
```

组合规则是协议的一部分：

- 标量使用显式 `set` 替换；对象只有 Schema 声明后才能 `merge`。
- 数组默认整体替换；需要组合的集合必须按稳定 ID 使用 `upsert/remove/reorder`，禁止按数组下标深合并。
- Relationship 使用 `relationship-add`、`relationship-remove` 和显式稳定边 ID；不能通过改父节点隐式覆盖。
- 删除使用带目标 ID 的 Tombstone，保证高层 Layer 不会因低层重新出现而“复活”对象。
- 冲突按照显式 Layer 优先级和稳定 Layer ID 处理；同优先级、同目标的非交换写入直接失败，不能 last-write-wins。
- NormalizedWorldIR 记录每个最终值的来源 Layer、Operation ID 和输入 JSON Pointer，支持解释、Diff 与回滚。

本 SDK 只采用 [OpenUSD Glossary](https://openusd.org/release/glossary.html) 等成熟 DCC/场景描述体系中的 Prototype、Instance、Variant、Layer 和 Relationship 思想，不实现完整 OpenUSD。Composition 的目标是给 AI 一个有限、可验证的游戏世界组合协议，而不是暴露任意场景图编辑能力。

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
| `anchor` | 世界空间中的稳定锚点 | 出生点、构图点、交互位置、导航目标 |
| `camera` | 相机实体、可用 Rig 与视角切换策略 | 第一人称、第三人称、俯视、骑乘、飞行、开场镜头 |
| `spawner` | 运行时创建实体 | NPC、敌人、道具刷新点 |
| `environment` | 世界级环境条件 | 天空、雾、光照、重力、音频环境 |

`rule`、`objective`、`timer` 和 `state` 属于 Gameplay 定义，不要求具有空间 Transform，因此放在 `rules` 而不是 `nodes`。

### 8.1 受控嵌套与规范化关系图

为降低 AI 生成复杂度，AuthoringSpec 允许在注册过的语义字段中使用嵌套简写，例如初始装备：

```json
{
  "id": "player",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.third-person@1",
  "loadout": {
    "right-hand": {
      "id": "sword-1",
      "kind": "object",
      "prototypeRef": "iron-sword@1"
    }
  }
}
```

嵌套只是一种 Authoring Sugar。Normalizer 必须将它提升为稳定的同级实体与类型化关系：

```text
RuntimeEntity: player
RuntimeEntity: sword-1

sword-1 --ownedBy--> player
sword-1 --equippedAt(slot=right-hand)--> player
```

限制：

- 只有 Kit 或节点 Schema 明确声明的字段，如 `loadout`、`initialInventory`、`initialMount`，才能包含嵌套实体。
- 受控嵌套有显式深度预算：AI Schema Profile 默认只投影一层嵌套实体，更深的结构必须用同级节点加 Relationship 表达。
- 任意 JSON 父子结构不自动产生 Transform、所有权、装备或生命周期语义。
- 嵌套实体必须具有显式稳定 ID；Normalizer 保留源 JSON Pointer，保证 Diagnostic 能定位原始输入。
- NormalizedWorldIR 不保留具有业务含义的隐式父子关系，所有跨实体语义都展开为 Relationship。
- RenderNode 层级由 Runtime 根据关系、Rig Socket 和 VisualBinding 派生，不能反向成为 Gameplay 真相。

是否拆成独立 RuntimeEntity 使用以下判断：对象只要满足任一条件，就应拥有独立 ID：

- 可以被拾取、丢弃、转移、销毁或独立保存。
- 拥有独立状态、Capability、Collider、事件或权限。
- 需要被 Agent、规则、自动化或 Inspector 单独查询。
- 同时参与所有权、装备、目标、跟随等多种关系。

骨骼、头发、不可拆卸装饰、纯 LOD 和纯特效节点通常留在 RenderNode，不进入逻辑实体图。

### 8.2 Object 不按语义继续分裂

塔、墙、箱子和门都使用 `object`，差异来自组件：

```json
{
  "id": "watchtower",
  "kind": "object",
  "prototypeRef": "watchtower-stone@1",
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

### 8.3 Water 是 Surface 与 Volume 的组合

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
| 逻辑图 | RuntimeEntity、Capability、Relationship、状态与控制权 | `player mountedOn dragon` |
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
  resourceBudget?: ResourceBudget;
  normalize(context: NormalizeContext, config: unknown): NormalizedCapability;
  prepareInstall(context: CapabilityInstallContext): PreparedCapabilityInstall;
}

interface CapabilityInstanceSpec {
  id: CapabilityInstanceId;
  capabilityRef: ResourceRef;
  config: JsonValue;
  enabled: boolean;
  activationGroupId?: string;
  providerBindings?: Record<CapabilityRequirementId, CapabilityInstanceId>;
}

interface CapabilityRequirement {
  id: CapabilityRequirementId;
  contractId: string;
  cardinality: "one" | "optional" | "many";
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

Capability Manifest 描述能力类型，`CapabilityInstanceSpec` 描述 AuthoringSpec 中声明的稳定安装实例；Normalizer 将其解析为带精确 Provider 和资源锁的 `NormalizedCapabilityInstance`。同一类型是否允许多个实例由 Manifest 的基数约束决定，不能依赖数组位置判断。

Manifest 混合了协议数据与实现代码，两者的哈希边界必须分开：声明字段（`id`、`version`、`configSchema`、`requires`、`provides`、`conflicts`、`phases`、`resourceBudget`）是可序列化协议数据，按 Canonical Bytes 计算 Manifest Hash；`normalize` 与 `prepareInstall` 属于插件实现，以插件内容 Hash 锁定。`registry-lock.json` 同时记录两个 Hash，任一变化都视为不同实现版本。

Kit override 只有三种规范操作：

- `merge`：按照 Capability 配置 Schema 声明的合并策略覆盖字段。
- `replace`：用显式实例替换 Kit 产生的指定实例。
- `disable`：禁用指定实例，但保留来源和 Diagnostic 可解释性。

未声明合并策略的对象不能自动深合并；数组默认整体替换，除非 Schema 明确声明按稳定 ID 合并。

### 10.3 依赖解析

解析器按以下顺序工作：

1. 展开 Kit。
2. 合并显式 Capability override。
3. 解析 `requires` 与 `provides`，应用显式 `bindings`。
4. 检查 `conflicts`、基数和循环依赖。
5. 应用默认值并生成 Normalized Capability。
6. 根据固定 Runtime Phase 拓扑排序。
7. 生成 ExecutionPlan。

插件注册顺序不能改变执行结果。

Provider 绑定规则：

- `one` 必须且只能绑定一个 Provider；存在多个候选且没有显式 Binding 时返回歧义错误。
- `optional` 最多绑定一个 Provider；多个候选同样不能自动猜测。
- `many` 按稳定 Capability Instance ID 排序并全部绑定。
- 不能使用插件注册顺序、对象插入顺序或“最新版本”作为选择依据。
- `activationGroupId` 允许地面移动、飞行、游泳等能力同时安装但只有一个模式处于权威激活状态；切换由 Action 或状态事务完成。
- 解析后的 Provider Instance ID、激活组、override 来源和最终配置必须写入 NormalizedWorldIR。

### 10.4 Kit

Kit 是经过验证的组合清单，不包含不可观察的魔法逻辑：

```json
{
  "id": "humanoid.third-person",
  "version": 1,
  "capabilityRefs": [
    "render.humanoid@1",
    "physics.character@1",
    "locomotion.ground@1",
    "control.possessable@1",
    "camera.third-person@1",
    "action.humanoid-locomotion@1"
  ],
  "profiles": {
    "bodyProfileRef": "humanoid.adult@1",
    "rigProfileRef": "humanoid.biped@1"
  }
}
```

Kit 必须可以通过 CLI 查询、展开和解释。

### 10.5 Capability 动态生命周期与资源所有权

Capability 的安装、切换和移除是事务，不是一次会立即产生副作用的函数调用。统一状态机为：

```text
declared
  → validated
  → admitted
  → prepared
  → committed@phase-barrier
  → active ↔ suspended
  → removing@phase-barrier
  → disposed

prepare/commit/remove 失败 → rollback → previous-stable-state
```

- `validate` 校验配置、依赖、冲突、基数和目标实体状态，不创建底层资源。
- `admit` 预留预算并确认当前 Phase Barrier 允许修改 ExecutionPlan。
- `prepare` 可以创建尚未发布的资源，但不能让其他 System、Entity 或 Browser Session 看见半安装状态。
- `commit` 在固定 Phase Barrier 原子发布 Component、System、Port、Relationship 派生状态和资源句柄。
- `remove` 先检查反向依赖；只有命令显式声明并通过验证时才允许级联删除或切换 Provider。
- 任一步失败都按相反顺序回滚；回滚失败是阻断级 Runtime Diagnostic。

安装成功返回稳定 `CapabilityHandle`，并登记到 Ownership Ledger：

```ts
interface CapabilityHandle {
  instanceId: CapabilityInstanceId;
  ownerEntityId: EntityId;
  state: CapabilityLifecycleState;
  ownedResources: readonly OwnedResourceRef[];
  suspend(commandId: CommandId): CapabilityReceipt;
  resume(commandId: CommandId): CapabilityReceipt;
  remove(commandId: CommandId): CapabilityReceipt;
  dispose(): void;
}
```

Ownership Ledger 至少跟踪 System Registration、Component、Port Provider、Listener、Timer、Render/Physics Handle、Asset Lease 和派生 Relationship。所有释放操作必须幂等；同一 `commandId` 重试返回相同 Receipt，不重复注册或释放资源。World Dispose 从所有权根按依赖逆序释放，测试必须证明安装/移除循环后不存在悬挂 System、监听器、Collider、WASM Handle 或 Asset Lease。

## 11. Relationship、Equipment、Attachment 与 Possession

实体间关系使用显式、可版本化的 Relationship，不通过数组下标或永久父子节点隐式表达。

首批关系：

- `attachedTo`
- `mountedOn`
- `possessedBy`
- `ownedBy`
- `storedIn`
- `equippedAt`
- `follows`
- `targets`

Relationship 是有方向、带版本和 Schema 的逻辑边。每种关系必须声明端点类型、基数、互斥关系、删除策略和权限来源。不能用通用 `parentId` 同时表达所有权、空间挂载、装备和骑乘。

AI-facing Relationship 不暴露通用 `subject/target/params` 三元组，而是使用每种关系的业务角色名：

```ts
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
```

不同 Relationship 可以拥有不同端点角色，但 Registry Manifest 必须把角色映射到 NormalizedWorldIR 的 `sourceEntityId/targetEntityId`，并声明端点类型、基数和删除策略。这样既保留通用图执行能力，也避免 AI 猜测 `subject` 在某条边中到底指人物、物品还是语法主语。

### 11.1 单一真相与关系事务

同一个业务事实只能有一个权威来源：

- `ownedBy` 是物品所有权真相。
- `storedIn` 是物品当前容器位置真相。
- `equippedAt` 是装备状态与逻辑槽位真相。
- `mountedOn` 是骑乘状态真相。
- `possessedBy` 是控制权真相。
- `attachedTo` 仅用于明确需要持久化的空间挂载；由装备或骑乘派生的 RenderNode 父子关系不重复写成 Gameplay 真相。

任何跨逻辑图、渲染图和物理图的关系变化都通过事务执行：

```text
validate
  → prepare logical/physics/render changes
  → commit at phase barrier
  → emit event and receipt
```

准备或提交失败时必须恢复上一份关系、控制权、Collider、Capability 激活状态和 Render Binding。重复提交相同命令必须幂等，Receipt 只在完整提交后产生。

### 11.2 ControllerEntity、ControlSource 与控制绑定

`possessedBy` 不能只停留在关系名称。Runtime 必须把“谁发出输入”“当前控制谁”“目标怎样解释输入”拆成三个独立概念：

```text
Keyboard / CLI / Browser / AI / Script / NPC
  → ControlSource Adapter
  → ControllerEntity
  → possessedBy
  → Subject Capability
  → Control Method / Locomotion / Action / Physics
```

- `ControlSource` 是输入来源适配器，只把设备或外部协议转换为稳定语义 Intent，不决定目标主体的移动算法。
- `ControllerEntity` 是没有 Render、Transform 和 Collider 的 Runtime 逻辑实体，提供稳定控制身份、Session 归属、权限和重放序列。
- `possessedBy` 是 Controller 与当前受控 RuntimeEntity 之间的权威绑定。
- `Control Method` 属于受控主体：同一个 `move` Intent 由人解释为相机相对移动，由汽车解释为油门/转向，由飞龙解释为飞行趋势。

```ts
type ControlSourceKind = "keyboard" | "gamepad" | "browser" | "cli" | "ai" | "script" | "npc";
type ControlChannel = "locomotion" | "action";

interface ControllerEntitySpec {
  id: ControllerId;
  kind: "controller";
  ownerSessionId: SessionId;
  controlSource: {
    kind: ControlSourceKind;
    sourceId: string;
  };
  scopes: readonly ControlScope[];
  allowedTargetEntityIds?: readonly EntityId[];
}

interface PossessedByRelationship {
  type: "possessedBy";
  schemaVersion: 1;
  controlledEntityId: EntityId;
  controllerId: ControllerId;
  channels: readonly ControlChannel[];
}
```

默认基数和冲突规则：

- 一个 Controller 在同一 World、同一 Tick、同一 Channel 最多控制一个主体。
- 一个主体的同一 Channel 最多存在一个权威 Controller；协作控制必须以后续版本显式定义 Channel 合并规则，第一版不能按到达顺序抢占。
- 一个 Session 可以拥有多个 Controller，因此一个 CLI/Agent 进程可以同时控制多个人物。
- “一条命令控制整队”属于上层编排：Group Command 必须展开成多个 Controller Intent，并在日志中保留每个主体的独立结果，不能把一个 `possessedBy` 绑定到多个目标。
- ControllerEntity 默认由 Runtime Session 创建，不要求普通场景 Agent 写进 AuthoringSpec。预设 Script/NPC Controller 也必须通过同一 Registry 和权限模型创建。
- AuthoringSpec 中的 `primary-playable` 等 Role 只是 Host 初始绑定的候选目标；Controller 身份、Session 权限和实际 `possessedBy` 仍在 Runtime Bootstrap 时创建和提交。默认玩家控制因此不要求场景 Agent 生成 Controller Schema。
- 标准玩家 Controller 默认同时占有 `locomotion` 与 `action`；分开 Channel 只作为显式高级策略启用，不能由 Runtime 自动猜测。

控制命令只指定 Controller；Runtime 根据提交 Tick 时已生效的 `possessedBy` 解析受控实体。调用方不能用任意实体 ID 绕过控制权：

```ts
interface ControlIntentCommand {
  type: "control.intent";
  requestId: string;
  controllerId: ControllerId;
  targetTick: number;
  sequenceNumber: number;
  expectedControlledEntityId?: EntityId;
  intent: SemanticIntent;
}

interface ControlIntentBatch {
  type: "control.intent-batch";
  requestId: string;
  targetTick: number;
  commands: readonly Omit<ControlIntentCommand, "type" | "requestId" | "targetTick">[];
}
```

`expectedControlledEntityId` 只是防止控制权已经切换时误操作的前置条件，不是路由来源。Batch 在进入 Tick 队列前整体校验 Controller、权限、绑定、Sequence 和 Intent Schema；任一命令无效时整批拒绝。相同 Controller、Channel 和 Tick 出现两个互斥 Intent 时返回 `CONTROL_INTENT_CONFLICT`，不能依赖 NDJSON 行顺序、网络到达顺序或插件注册顺序决定胜负。

控制绑定和切换使用事务：

```text
validate controller scope, target and possessable capability
  → reserve channels and check cardinality
  → prepare locomotion/action/camera context changes
  → commit possessedBy at fixed phase barrier
  → emit ControlReceipt(effectiveTick, previousControlledEntityId, currentControlledEntityId)
```

Runtime Snapshot 必须按稳定 ID 返回 `controllersById`、`controlBindings` 和 `subjectStatesByEntityId`，不能只暴露单数 `player`。Replay Input Log 记录 Session ID、Controller ID、Sequence Number、解析后的目标、Intent、接收 Tick、生效 Tick 和 Receipt；重放时仍通过相同 Control Router 验证绑定和顺序。

### 11.3 骑乘

骑乘示例：

```json
[
  {
    "id": "player-mounted-on-dragon",
    "type": "mountedOn",
    "schemaVersion": 1,
    "riderEntityId": "player",
    "mountEntityId": "dragon-1",
    "seatId": "saddle"
  },
  {
    "id": "dragon-possessed-by-player-controller",
    "type": "possessedBy",
    "schemaVersion": 1,
    "controlledEntityId": "dragon-1",
    "controllerId": "player-controller",
    "channels": ["locomotion", "action"]
  }
]
```

运行时 Mount 状态机：

```text
unmounted
  → mounting
  → mounted
  → dismounting
  → unmounted
```

进入 `mounted` 时，以下修改属于同一个 Mount Transaction：

1. 验证 Rider 与 Mountable Capability。
2. 验证距离、座位可用性与动作前置条件。
3. 将骑手视觉挂到目标 Socket。
4. 暂停骑手自身 Locomotion。
5. 切换骑手碰撞组或关闭独立 Collider。
6. 将 Control/Possession 交给坐骑。
7. 激活骑乘 Camera Rig 和 `ride` Action。
8. 原子提交 `mountedOn` 与 `possessedBy`，再产生 Event 和 Receipt。

下坐骑时必须寻找安全落点，恢复骑手物理和控制权，并解除渲染挂载。

### 11.4 装备、槽位与 Socket

武器、盾牌和可转移道具是独立 RuntimeEntity。人物与装备保持同级，通过关系组合：

```json
{
  "id": "sword-equipped-right-hand",
  "type": "equippedAt",
  "schemaVersion": 1,
  "itemEntityId": "sword-1",
  "wearerEntityId": "player",
  "slotId": "right-hand"
}
```

三个概念必须分开：

- `EquipmentSlot`：Gameplay 逻辑槽位，声明容量、允许的物品标签、单手/双手占用和互斥规则。
- `RigSocket`：RigProfile 中的局部 Transform，如 `hand-r`、`back`、`saddle`，只负责视觉挂载位置。
- `anchor`：世界空间中的出生点、构图点或交互位置，不属于 Rig。

`EquipmentSlot` 可以引用一个 `RigSocket` 作为默认视觉位置，但二者不是同一对象。装备时由 Equipment System 根据 `equippedAt` 派生 RenderNode 挂载和物理模式：

```text
sword-1 equippedAt player.right-hand
  → SwordVisual attach to player RigSocket hand-r
  → disable world rigid body
  → keep weapon hitbox disabled until an authoritative attack window
```

卸下、放入背包和丢弃分别更新 `equippedAt`、`storedIn`、`ownedBy`，不能通过移动 RenderNode 推断逻辑状态。双手武器通过一次事务原子占用多个 EquipmentSlot。

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
    "type": "object",
    "additionalProperties": false,
    "required": ["targetEntityId"],
    "properties": {
      "targetEntityId": { "$ref": "worldkit://schema/entity-id@1" },
      "seatId": { "type": "string", "maxLength": 64 }
    }
  },
  "requires": [
    "capability:rider",
    "target-capability:mountable"
  ],
  "interruptPolicy": "uninterruptible",
  "authority": "simulation",
  "completion": {
    "type": "relationship-committed",
    "relationshipType": "mountedOn"
  },
  "presentationMarkers": ["seated"]
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

Action 的完成、失败和伤害等权威结果必须来自模拟状态、关系事务或确定的 Tick 条件，不能依赖动画 Clip 是否存在。Animation Marker 只用于脚步声、姿态对齐、特效等表现同步；缺失 Marker 可以降级并产生 Diagnostic，但不能让 Gameplay Action 永久卡住。

### 13.2 AnimationBinding

```json
{
  "rigRef": "humanoid.biped@1",
  "bindings": {
    "idle": {
      "clipId": "Adult_Idle",
      "loop": true,
      "blendInSeconds": 0.2
    },
    "wave": {
      "clipId": "Adult_Wave",
      "layerId": "upper-body",
      "blendInSeconds": 0.1
    },
    "ride": {
      "clipId": "Adult_Ride_Pose",
      "loop": true
    }
  }
}
```

### 13.3 ActionContext 与动作变体

Semantic Action 表达“要做什么”，不把装备和表现组合编码进 Action ID：

```text
locomotion.run + equipment.unarmed          → 空手跑步表现
locomotion.run + weapon.sword.one-handed   → 持剑跑步表现
combat.attack.light + weapon.sword         → 轻型挥剑攻击
```

禁止为每个组合创造 `run-with-sword`、`run-with-shield` 等新的 Gameplay Action。Action Runtime 在执行时构造只读上下文：

```ts
interface ActionContext {
  actorEntityId: EntityId;
  actionRef: ResourceRef;
  targetEntityIds: readonly EntityId[];
  tags: readonly string[];
  relationships: readonly RelationshipRef[];
  activeCapabilities: readonly CapabilityInstanceRef[];
  equipment: Readonly<Record<EquipmentSlotId, EntityId | null>>;
  locomotionMode: string;
  grounded: boolean;
}
```

上下文标签来自注册表，不允许 Agent 发明未声明字符串。首批稳定标签包括：

- `equipment.unarmed`
- `weapon.sword.one-handed`
- `weapon.sword.two-handed`
- `stance.exploration`
- `stance.combat`
- `locomotion.ground`
- `locomotion.mounted`
- `locomotion.flight`

AnimationSet 和武器 AttackProfile 可以为同一个 Action 提供 Variant：

```json
{
  "actionRef": "locomotion.run@1",
  "variants": [
    {
      "id": "run-one-handed-sword",
      "when": { "allTags": ["weapon.sword.one-handed"] },
      "clipId": "Run_OneHandSword",
      "priority": 100
    },
    {
      "id": "run-unarmed",
      "when": { "allTags": ["equipment.unarmed"] },
      "clipId": "Run_Unarmed",
      "priority": 50
    }
  ],
  "fallbackClipId": "Run_Default"
}
```

匹配顺序固定为：显式 Binding、较高 priority、较高条件特异度。三者完全相同而存在多个候选时返回歧义 Diagnostic；Diagnostic 中的候选按稳定 Variant ID 排序，但不能用 ID、资源加载或注册顺序替 Agent 猜测语义。缺少专用动画时可以使用声明的 fallback；缺少权威 Gameplay Capability 时不能只靠动画假装支持动作。

### 13.4 武器攻击组合

人物发起稳定的 `combat.attack.light`，当前 `equippedAt` 武器提供 AttackProfile：

```json
{
  "capabilityRef": "weapon.melee@1",
  "attackProfiles": {
    "combat.attack.light": {
      "animationTagId": "attack.sword.light",
      "baseDamage": 20,
      "rangeMeters": 1.6,
      "hitboxId": "blade",
      "activeWindow": {
        "startTickOffset": 12,
        "endTickOffsetExclusive": 19
      },
      "cooldownTicks": 30
    }
  }
}
```

职责边界：

- 人物 Action Performer 接收攻击 Intent 并检查前置条件。
- `equippedAt` 决定当前使用哪件武器。
- 武器 Capability 提供攻击参数和 Hitbox 描述。
- 人物 Rig/AnimationSet 提供挥剑表现。
- 模拟层按固定 Tick 激活 Hitbox、计算命中和伤害；动画 Marker 不拥有伤害权威。

### 13.5 扩展规则

- 更换模型对已有动作的动画：只增加或替换 AnimationSet。
- 成人和儿童使用不同动作表现：不同 BodyProfile、RigProfile 与 AnimationSet。
- 增加已有语义动作的新 Clip：纯资源配置。
- 第一次增加新的语义动作：注册 ActionDefinition，并为相关 Rig 提供 Binding。
- 第一次增加新的物理行为，如飞行或抓钩：注册新的 Capability/System，而不是只增加动画。

### 13.6 动画层

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

持械移动优先使用分层组合以避免动画数量乘法增长：

```text
Base Locomotion Layer: Run
Upper Body Layer: One-Hand Sword Pose
Action Override Layer: Sword Slash
```

强烈改变全身重心的攻击、跳跃和骑乘过渡可以声明为 Full Body Override。所有 Layer、Bone Mask、互斥和优先级进入 AnimationSet/RigProfile 的版本化配置，而不是硬编码在人物 Runtime Core。

### 13.7 Action Execution Timeline

每次动作执行都是有稳定 `executionId` 的状态机，不能只记录“正在播放哪个 Clip”：

```text
queued → preparing → windup → active → recovery → completed
                    ↘ failed / cancelled / interrupted ↗
```

- `queued`：等待优先级、并发锁和所需资源。
- `preparing`：冻结本次 ActionContext，校验目标、装备、关系、体力和权限。
- `windup`：动作已经承诺但权威 Effect 尚未激活。
- `active`：按固定 Simulation Tick 启用移动、命中框、关系提交或其他 Effect。
- `recovery`：Effect 已结束，但尚未释放所有并发锁。
- 终止状态记录原因、最终 Tick、Effect Receipt 和派生事件。

ActionDefinition 必须通过时间线 Profile 声明：各阶段进入/退出条件、最长 Tick、Cancel Window、允许打断者、Channel Lock、目标丢失策略以及 Root Motion 所有权。常用 Channel 至少包括 `locomotion`、`full-body`、`upper-body`、`interaction` 和 `equipment`；多个动作只有在声明的 Channel 与写入集合兼容时才能并发。Channel 及其互斥、包含关系由版本化 Channel Registry 声明，例如 `full-body` 必须声明为独占 `locomotion` 与 `upper-body`。ActionDefinition 只能引用注册过的 Channel；兼容性判定只使用注册的互斥矩阵，不能由 Runtime 按名称推断。

Gameplay 时间一律以固定 Tick 表达。Animation Marker 可以对齐声音、特效和视觉 Blend，但不能推进权威阶段。若视觉 Clip 时长与权威 Timeline 不同，Presentation 层按 Binding 的 stretch/clamp/fallback 策略适配，不能反向改变伤害窗口或关系提交 Tick。

动作开始后装备、坐骑或能力发生变化时，必须采用 ActionDefinition 声明的策略之一：

- `snapshot`：本次执行继续使用 `preparing` 阶段冻结的上下文。
- `revalidate`：在指定 Phase Barrier 重新校验，不满足条件则进入确定的 `cancelled/failed`。
- `locked`：相关 Relationship/Capability 修改进入队列，待动作释放锁后执行。

默认攻击使用 `snapshot` 保存攻击参数，并锁定对应 EquipmentSlot 到 `active` 结束；骑乘和双手装备事务默认使用 `locked`。Root Motion 启用时，每个 Tick 只能有一个 Transform Authority，且 Physics System 必须对位移做碰撞约束并回写实际结果。所有阶段转换、Cancel、Interrupt 和锁释放都产生可重放 Receipt。

## 14. 地形、参考图与空间一致性

SDK 不负责从图片生成地形，但必须提供足够强的结构表达和验证能力，让 Agent 可以把图片理解结果落地。

本章只冻结总架构边界。Terrain Source 方案比较、生成式等高色带图、确定性重建、Gameplay 约束、NormalizedTerrainIR、离线 Terrain Refiner、包边界和实施 Gate 由子规格 [`2026-08-17-terrain-authoring-pipeline-design.md`](./2026-08-17-terrain-authoring-pipeline-design.md) 定义。子规格可以演进具体 Compiler Profile，但不能让具体图片模型、专业地形工具、Babylon 或 Havok 类型进入 AuthoringSpec 和引擎无关 IR。

### 14.1 地形输入

生产地形优先使用世界空间 Height Raster 与独立 Semantic/Constraint Mask，而不是依赖少量圆形操作近似整张参考图。生成式图片只属于不可信 Authoring Input；Runtime 权威数据是显式 Scale/Offset 的 `R16` 或米制 `F32` Heightfield，Semantic、Evidence 和 Protected Layer 使用独立 `R8` Mask。

AuthoringSpec 支持：

- 世界边界与高度范围。
- 分块高度场。
- 世界空间 Raster。
- 语义地形层。
- 局部 Raise/Lower/Flatten/Smooth。
- 路线走廊和坡度限制。
- 岸线、水位和湖底/海底语义。

SDK 可以通过 Host Registry 接入受信的离线 Terrain Refiner，用冻结 Recipe/HDA/Graph 完成侵蚀或自然化；Refiner 只能处理统一 Macro Heightfield 和受保护 Mask，其输出必须重新应用 Gameplay 硬约束并通过全部 Gate。通过 bit-for-bit Conformance 的实现可以成为确定性 Compiler Stage；其余实现属于 Authoring Aid，必须先把 Height/Mask 固化为内容寻址 Source 与 Output Lock，再进入确定性 Compiler。Recipe 与 Seed 不能代替输出 Hash。具体 Provider 不进入 AI-facing Schema，Refiner 未安装时也不能阻断 Core Pipeline 和 WorldPackage Runtime。

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

### 14.4 Placement Constraint 与 Layout Solver

Agent 不应为所有实例手写最终米制坐标。Authoring Schema 同时提供关闭的
`fixed` / `solved` Placement 判别 Union：精确事实使用固定 Transform，语义放置
使用类型化 Constraint 引用。第一批 Constraint 覆盖 Region 内外、距离范围、相对
方向、朝向、支撑、净空、坡度、路线连接和 Camera Region 可见性。

Layout Solver 位于 Registry/Terrain/Region 解析之后、NormalizedWorldIR 最终落位
之前。它不调用 LLM/VLM，不创建 Runtime 对象；相同 Authoring、资源、Registry
Lock、Solver Profile、Seed 与预算必须产生相同 Transform 和
`LayoutSolveReport` Hash。Required Constraint 无法满足时阻止 WorldPackage 构建；
Preferred Constraint 可以违反，但必须逐项返回测量、代价和证据。

Placement 只解决“编译时摆在哪里”。骑乘、装备、拖拽、控制权等仍由运行时
Gameplay Relationship 表达，不能用静态 Constraint 代替。完整 Schema、求解顺序、
确定性、Diagnostic、CLI 与首条 Fixture 见
[Placement Constraint 与确定性 Layout Solver 专项设计](./2026-08-19-placement-constraint-layout-solver-design.md)。

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

### 15.3 Camera Rig、多视角与切换

Camera 是独立的 View Runtime 子系统，不是 Subject RenderNode 的永久子节点。AuthoringSpec 中的 `camera` 节点声明可用 Rig、默认视角、目标解析和上下文切换策略；Normalizer 可以把 Subject Kit 中的相机简写展开成独立 Camera RuntimeEntity、Camera Capability 与目标绑定。Babylon Camera、碰撞查询句柄和输入设备对象只存在于 Runtime Adapter。

第一版公开支持以下 Camera Mode：

- `first-person`：视点位于主体眼睛或头部 Socket，适合沉浸、精确观察和第一人称交互。
- `third-person`：视点通过带碰撞的跟随臂位于主体后方，适合角色移动、战斗和骑乘。
- `top-down`：俯视或斜俯视跟随，适合策略、建造和大范围导航。
- `orbit`：围绕目标观察，主要用于 Inspector、角色预览或受控玩法。
- `cinematic`：由固定 Pose、路径或镜头脚本驱动，用于 Opening Shot 和过场，不默认接管 Gameplay 输入。

视角模式使用显式判别 Union，避免第一人称和第三人称的大量互斥字段同时出现：

```ts
interface CameraNodeConfig {
  defaultRigRef: ResourceRef;
  allowedRigRefs: readonly ResourceRef[];
  target: CameraTargetSpec;
  contextBindings?: readonly CameraContextBinding[];
  manualSwitchAllowed: boolean;
}

interface CameraTargetSpec {
  entityId: EntityId;
  socketId?: RigSocketId;
  targetHeightMeters?: number;
  localOffsetMeters?: [number, number, number];
}

interface CameraRigProfileBase {
  id: ResourceId;
  projection: CameraProjectionSpec;
  control: CameraControlSpec;
  transition: CameraTransitionSpec;
}

type CameraProjectionSpec =
  | {
      kind: "perspective";
      fovDegrees: number;
      nearMeters: number;
      farMeters: number;
    }
  | {
      kind: "orthographic";
      verticalSizeMeters: number;
      nearMeters: number;
      farMeters: number;
    };

type CameraRigProfile = CameraRigProfileBase &
  (
    | { mode: "first-person"; firstPerson: FirstPersonCameraSpec }
    | { mode: "third-person"; thirdPerson: ThirdPersonCameraSpec }
    | { mode: "top-down"; topDown: TopDownCameraSpec }
    | { mode: "orbit"; orbit: OrbitCameraSpec }
    | { mode: "cinematic"; cinematic: CinematicCameraSpec }
  );
```

公共控制与切换配置：

```ts
interface CameraControlSpec {
  scheme: "free-look" | "target-locked" | "scripted";
  lookIntent?: "view.look";
  zoomIntent?: "view.zoom";
  minPitchRadians?: number;
  maxPitchRadians?: number;
  yawPolicy: "unbounded" | "relative-to-target" | "locked";
  recenter?: {
    enabled: boolean;
    delaySeconds: number;
    halfLifeSeconds: number;
  };
}

interface CameraTransitionSpec {
  kind: "cut" | "blend";
  durationSeconds: number;
  easing: "linear" | "ease-in-out";
}

interface CameraContextRuleV2 {
  id: string;
  priority: number;
  when: {
    allRelationshipConditions?: readonly CameraRelationshipConditionV1[];
    locomotionStatuses?: readonly ("active" | "suspended")[];
    mobilityModes?: readonly ("grounded" | "airborne")[];
    gaits?: readonly ("none" | "idle" | "walk" | "run")[];
    verticalPhases?: readonly ("none" | "takeoff" | "rising" | "apex" | "falling" | "landing")[];
    movementMediums?: readonly ("ground" | "air")[];
    requiredActiveActionRefs?: readonly ResourceRef[];
    actionInterruptibility?: "interruptible" | "non-interruptible";
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
    requiredCameraContextTags?: readonly string[];
  };
  cameraRigProfileRef?: ResourceRef;
  cameraModifierRefs?: readonly ResourceRef[];
}
```

`CameraControlSpec` 只声明世界允许的控制语义、范围和默认行为；鼠标灵敏度、手柄曲线、反转 Y 轴等用户偏好属于 Host/User Settings，不写入 AuthoringSpec。Camera Rule 只消费同一 committed Tick 的强类型 Gameplay/Locomotion/Action/Relationship 事实；Tag 不能旁路已有的强类型字段或 Ref。规则按 priority 和稳定 Rule ID 解析；同 priority 歧义时 admission 失败，不能按注册顺序选择。完整当前合同以 `2026-08-24-context-driven-gameplay-camera-composition-design.md` 为准。

#### 15.3.1 第一人称

```ts
interface FirstPersonCameraSpec {
  eyeSocketId?: RigSocketId;
  fallbackEyeHeightMeters: number;
  localOffsetMeters: [number, number, number];
  bodyVisibility: "hide-head" | "hide-upper-body" | "show-full-body";
  weaponPresentation: "world-model" | "first-person-view-model";
  preventWallPeek: boolean;
  motionProfileRef?: ResourceRef;
}
```

第一人称规则：

- 优先使用 RigProfile 声明的 `eye`/`camera` Socket；没有 Socket 时使用 BodyProfile 的眼睛高度，不能从模型包围盒临时猜测。
- `hide-head` 只影响当前 Camera 的 Color Presentation；主体 RuntimeEntity、Collider、阴影、其他相机和语义身份仍然存在。
- 默认使用同一权威武器 Entity 的 World Model。可选 First-person View Model 只是额外 Render Binding，必须映射回同一 Entity/Instance ID，不能复制库存、伤害或装备状态。
- `preventWallPeek` 使用头部位置、近裁剪面和 Physics Query 限制视点穿墙；相机查询不能推动刚体或修改 Character Body。
- Head Bob、呼吸晃动和 Camera Roll 是可关闭的 Presentation Motion Profile，不进入 Gameplay Transform，也不能改变 Raycast/命中权威。

#### 15.3.2 第三人称

```ts
interface ThirdPersonCameraSpec {
  distanceMeters: number;
  minDistanceMeters: number;
  maxDistanceMeters: number;
  targetHeightMeters: number;
  shoulderOffsetMeters: number;
  defaultPitchRadians: number;
  boomCollision: {
    enabled: boolean;
    radiusMeters: number;
    paddingMeters: number;
    recoveryHalfLifeSeconds: number;
    occlusionPolicy: "pull-in" | "fade-occluder" | "pull-in-and-fade";
  };
}
```

第三人称 Camera 先根据目标和输入计算期望 Pose，再从 Target 到期望位置执行 Raycast/Shape Cast，过滤被跟随主体及声明为 Camera-transparent 的 Collider；结果只缩短 Camera Boom，不修改主体或障碍物物理。障碍消失后按声明的 Half-life 恢复距离，避免镜头瞬移。`fade-occluder` 只属于当前 View 的渲染策略，不能让 Collider、语义 Mask 或其他 Session 看见不同的 Gameplay 世界。

骑乘和飞行使用独立 Profile，例如：

```text
camera.third-person.standard@1
camera.third-person.mounted@1
camera.third-person.flight@1
```

它们共享第三人称协议，但可以使用不同距离、目标高度、Pitch、FOV 和碰撞参数。

#### 15.3.3 其他视角

- Top-down Rig 明确高度、俯角、正交/透视投影、世界边界 Clamp 和是否允许旋转/缩放。
- Orbit Rig 明确目标、半径范围、Pitch 范围和输入权限；默认不产生移动 Intent。
- Cinematic Rig 使用内容寻址的 Camera Path 或确定的关键帧，声明是否允许跳过；它不能隐式改变 Possession、Gameplay Target 或主体 Transform。

#### 15.3.4 Camera 节点与 AI-facing Kit

多人称可切换主体的 AuthoringSpec 示例：

```json
{
  "id": "player-view",
  "kind": "camera",
  "components": {
    "cameraRig": {
      "defaultRigRef": "worldkit://camera/third-person.standard@1",
      "allowedRigRefs": [
        "worldkit://camera/first-person.standard@1",
        "worldkit://camera/third-person.standard@1"
      ],
      "target": {
        "targetEntityId": "player"
      },
      "thirdPerson": {
        "pitchRadians": 0.18,
        "distanceMeters": 5,
        "targetHeightMeters": 1.2,
        "fovDegrees": 56,
        "aspectRatio": 1.7777777778
      },
      "manualSwitchAllowed": true
    }
  }
}
```

AuthoringSpec 只选择允许的初始 Rig；自动上下文规则来自锁定的 Registry Camera Context
Profile，并使用上面的 `CameraContextRuleV2`，不会在 Camera 节点内复制第二套规则方言。

AI 普通模式仍可以使用：

```text
humanoid.first-person@1
humanoid.third-person@1
humanoid.switchable-view@1
```

这些 Kit 是 Authoring Sugar：Normalizer 必须物化 Camera Entity、Camera Capability、Registry Profile 与目标绑定。`humanoid.switchable-view@1` 安装第一/第三人称 Rig，并把它们放入同一 `camera-mode` Activation Group；每个 View Session 同一时刻只能有一个 Active Rig。Kit 名称不能让 Camera 成为 Subject 的逻辑子节点。

#### 15.3.5 切换、骑乘与控制权

手动视角切换使用 `ViewCommand`，不是装备/攻击类 Gameplay Action：

```ts
type CameraMode = "first-person" | "third-person" | "top-down" | "orbit" | "cinematic";

interface SetCameraModeCommand {
  type: "view.set-mode";
  requestId: string;
  cameraEntityId: EntityId;
  mode: CameraMode;
  transitionKind?: "cut" | "blend";
}

interface SetCameraRigCommand {
  type: "view.set-rig";
  requestId: string;
  cameraEntityId: EntityId;
  rigRef: ResourceRef;
  transitionKind?: "cut" | "blend";
}

interface CameraSnapshot {
  cameraEntityId: EntityId;
  activeRigRef: ResolvedResourceRef;
  mode: CameraMode;
  targetEntityId: EntityId;
  yawRadians: number;
  pitchRadians: number;
  distanceMeters?: number;
  fovDegrees?: number;
}
```

切换流程固定为：

```text
resolve mode or explicit rig, then validate allowed rig and target
  → prepare camera resources and visibility bindings
  → commit active rig at camera/render-sync barrier
  → start deterministic cut/blend
  → emit ViewReceipt and CameraSnapshot
```

失败时保留上一 Active Rig。相同 `requestId + command hash` 重试必须返回同一 Receipt。切换 Camera 不得自行改变 `possessedBy`、`mountedOn`、Collider、Locomotion 或主体 Transform。

骑乘事务提交新的 Possession/Locomotion Tag 后，Camera Director 才根据 Context Binding 选择坐骑或飞行 Rig。下坐骑时恢复当前 Session 对 on-foot Context 的首选 Rig；若首选第一人称但目标缺少兼容 Eye Socket/Profile，则使用声明的 fallback 并产生 Diagnostic。Camera Context 只消费已提交状态，不能与 Mount Transaction 互相读取半完成结果。

Camera 与 Controller 具有独立身份和权限：控制某个主体不等于拥有任意 Camera，观察某个 Camera 也不等于获得主体控制权。`targetPolicy: "controlled-entity"` 只是默认联动策略——Camera Director 在 `possessedBy` 提交后，把当前 View Session 的 Camera 切到受控对象声明的 Camera Profile。一个 Session 同时拥有多个 Controller 时，可以只使用一个观察 Camera，也可以显式创建多个 View；两者都不能从 Controller 数量隐式推断。

Camera Orientation 如果被移动、瞄准或交互系统用于计算方向，Input Resolver 必须在固定 Tick 冻结 `view.direction`/`view.target` Intent，并将 ViewCommand 与结果写入 Replay Input Log。纯视觉插值、遮挡淡化和 Head Bob 不进入 Gameplay Hash。

#### 15.3.6 CameraPort 与资源所有权

```ts
interface CameraPort {
  createRig(profile: CameraRigProfile): CameraRigHandle;
  bindTarget(handle: CameraRigHandle, target: CameraTargetSpec): void;
  setActiveRig(cameraEntityId: EntityId, handle: CameraRigHandle): void;
  applyViewCommand(command: JsonValue): ViewReceipt;
  getSnapshot(cameraEntityId: EntityId): CameraSnapshot;
  disposeRig(handle: CameraRigHandle): void;
}
```

Camera Capability 声明对 Transform Query、Physics Query、Render Visibility 和 Input Intent 的 requires/provides。Camera Entity 拥有 Rig Handle、监听器、临时 Render Binding 和遮挡状态；切换、World Dispose 或 Session 结束时必须幂等释放。Babylon Camera、Post-process、LayerMask 和 Pointer 事件不能泄漏到 World IR 或其他 Session。

### 15.4 Runtime 执行阶段

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

固定阶段本身不足以保证确定性。每个 System 必须声明：

```ts
interface SystemManifest {
  id: string;
  phase: RuntimePhase;
  reads: readonly ComponentType[];
  writes: readonly ComponentType[];
  emits: readonly EventType[];
  consumes: readonly EventType[];
  before?: readonly SystemId[];
  after?: readonly SystemId[];
}
```

调度与提交规则：

- 编译期检测同阶段的非交换多 Writer；没有显式归并器时直接报错。
- System 不在遍历过程中直接改变其他 System 可见的结构，修改写入 Command Buffer。
- Command Buffer 在固定 Phase Barrier 原子提交，并以稳定 Command ID 排序。
- Event 声明明确的投递阶段；默认在当前提交完成后的下一合法阶段消费，不能依赖监听器注册顺序。
- `before/after` 形成局部拓扑约束；没有依赖关系的 System 按稳定 System ID 排序。
- Runtime 禁止以插件注册顺序、Map 插入顺序或资源加载完成顺序作为语义 tie-breaker。
- 对允许多个贡献者的数值或集合，必须注册确定的 Reducer，并定义排序、精度和冲突规则。

### 15.5 生命周期

统一生命周期：

```text
create → load → start → suspend/resume → stop → dispose
```

RuntimeEntity、Capability、System、Asset、Collider 和 Browser Session 都必须有明确所有者和幂等 Dispose。

这一通用生命周期描述 World/Runtime 的外层状态；Capability 的热安装、切换和移除必须进一步遵守 10.5 节的 `validate → admit → prepare → commit/rollback` 事务，并且只能在固定 Phase Barrier 改变 ExecutionPlan。禁止在 `normalize`、Schema 校验、资源异步回调或 System 遍历中发布运行时副作用。

### 15.6 确定性等级

确定性承诺分成三层，不能笼统承诺跨所有设备 bit-exact：

1. **编译确定性**：相同 AuthoringSpec、Registry Lock 和 Seed 生成 bit-for-bit 一致的 NormalizedWorldIR、ExecutionPlan 和 Package Hash。
2. **模拟可重放性**：在固定 SDK、Runtime、Physics/WASM 构建和平台类别中，输入日志产生满足声明数值容差与状态不变量的结果。
3. **视觉可复现性**：通过 Semantic Mask、Instance ID、Depth、Region、Anchor 和容差验证；跨 GPU/浏览器不要求 Color Pass 像素完全相同。

编译确定性必须处理 JavaScript 数学实现差异：ECMAScript 的 `Math.sin`、`Math.cos`、`Math.exp`、`Math.pow` 等超越函数是实现近似，不同 JS 引擎结果不同。参与协议哈希的计算必须使用 Compiler Profile 声明的确定性数学实现——自带软件数学库，或只使用 IEEE-754 完全确定的加减乘除与 `sqrt`。bit-for-bit 承诺的范围是锁定 SDK 构建加声明的 JS 引擎类别；Node CLI 与浏览器内校验重算得到相同哈希属于 Conformance 测试范围。

WorldPackage Manifest 和 Replay Report 必须记录 SDK、Babylon、Physics/WASM、浏览器、平台类别、Feature Flag、固定时间步和浮点容差。生产验收分别报告三层结果，不能用“固定时间步”替代完整的确定性证明。

第一版生产验收的平台类别是桌面浏览器（PC Web）。移动端属于后续决策；Havok WASM 的 WebAssembly SIMD 依赖等平台约束记录在平台类别 Profile 中，扩展平台时重新评估。

### 15.7 Simulation Take 与 Control Capture Bundle

WorldPackage 只定义世界内容和能力，不保存某次视频的动作/镜头脚本。一次确定性
操作与拍摄由独立 `SimulationTake` 引用 WorldPackage，使用固定 Tick 描述
Controller/Input、Semantic Action、Camera Track 和 Capture Schedule；实际执行状态
属于有生命周期的 `RuntimeSession`。

一次运行的输出固化为不可变 `ControlCaptureBundle`。Bundle 逐帧记录
`simulationTick`、`renderFrameIndex`、`captureFrameIndex`、Camera、Snapshot、
Event/Action/Relationship Receipt、Pass Artifact 与全链路 Hash。第一版必需 Pass
是 `neutral-color`、`linear-depth-meters`、`semantic-class-id`、`instance-id` 和
`world-normal`。Capture 必须等待命令 Receipt 与 Render Ready，不能用任意延时猜测
状态已稳定。

下游视频 Provider 只通过 `VideoModelAdapter` 消费已验证 Bundle；模型专属 Prompt、
Tensor 转换和参数不进入 WorldPackage/Take 的 Canonical Schema，生成视频也不能反向
成为 Gameplay 真相。完整制品边界、时间映射、编码 Profile、目录、CLI/Browser 和
重放门禁见
[Simulation Take 与 Control Capture Bundle 专项设计](./2026-08-19-simulation-take-control-capture-design.md)。

## 16. CLI 与外部程序协议

SDK 同时提供 TypeScript API 和 CLI。Schema、Validate、Build、Inspect 等一次性命令无状态；`run --interactive` 和 `preview` 是有明确生命周期的 Session 命令。JS/TS 程序可以直接调用包；Python、Go、Java 或 Agent 服务通过子进程和版本化 JSON/NDJSON 调用 CLI。

### 16.1 命令

```bash
worldkit schema --profile constrained-json@1 --registry-lock registry-lock.json --output worldkit.schema.json
worldkit capabilities list --json
worldkit capabilities describe locomotion.flight@1 --json
worldkit kits describe dragon.mountable-flight@1 --json
worldkit examples --capability mountedOn --json

worldkit validate world.json --json
worldkit normalize world.json --output normalized.json --json
worldkit change validate changeset.json --base world.json --json
worldkit change apply changeset.json --base world.json --output next-world.json --json
worldkit build world.json --output ./dist/world --json
worldkit verify ./dist/world --json
worldkit preview ./dist/world --port 5173

worldkit run ./dist/world --script actions.json --artifacts ./artifacts --headless --json
worldkit run ./dist/world --interactive --protocol ndjson --headless
worldkit capture ./dist/world --view opening --output opening.png --json
worldkit inspect ./dist/world --json

worldkit layout solve world.json --output ./artifacts/layout --json
worldkit layout explain ./artifacts/layout/layout-report.json --constraint-id <id> --json
worldkit take validate take.json --json
worldkit capture run take.json --output ./artifacts/control-capture --json
worldkit verify package ./dist/world --profile worldkit://validation/outdoor-production@1 --json
worldkit verify capture ./artifacts/control-capture --profile worldkit://validation/control-video@1 --json
```

所有接受文件的命令同时接受 `-`，从 stdin 读取 JSON。

### 16.2 输出约定

- stdout：仅稳定 JSON。
- stderr：进度和人类可读日志。
- JSON 输出包含 `protocolVersion`、`sdkVersion`、`specVersion` 和 `command`。
- 不把堆栈信息作为稳定 API；Debug 模式可在单独字段返回。

一次性命令成功时只输出一个 JSON Document。`preview` 和长期 Session 属于流式命令，使用版本化 NDJSON Event；第一个 Event 必须是 `ready` 并包含 URL、Session ID 和协议版本，后续 stdout 不能混入人类日志。流式命令必须定义 SIGINT/SIGTERM、超时、Session 关闭和最终 `completed/failed` Event。

退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 成功 |
| 1 | 未预期的内部错误或崩溃 |
| 2 | 输入或 Schema 不合法 |
| 3 | 规范化或依赖解析失败 |
| 4 | 编译失败 |
| 5 | 运行时或物理验证失败 |
| 6 | 不支持的版本、Kit 或 Capability |
| 7 | 资产解析失败 |
| 8 | 浏览器自动化失败 |

### 16.3 NDJSON Runtime Session 与多人控制

跨语言程序需要持续控制人物时，保持一个 `worldkit run --interactive` 子进程，并通过 stdin/stdout 交换 NDJSON。这个 Session 是传输层；控制语义复用 11.2 的 Controller、Possession 和 Intent Schema，Browser Driver 也复用同一组类型。

Session 首批命令：

- `controller.create`：在当前 Session 创建一个或多个 ControllerEntity。
- `control.bind`：事务性建立或切换 `possessedBy`，返回生效 Tick。
- `control.release`：释放指定 Channel；没有绑定的后续 Intent 必须失败。
- `control.intent`：提交单个 Controller 的语义 Intent。
- `control.intent-batch`：同一 Tick 原子接收多个 Controller Intent。
- `snapshot.get`：返回按稳定 ID 索引的 Controller、Binding、Entity、Camera 和世界状态。
- `session.close`：释放 Session 拥有的 Controller、View 和临时资源。

示例：同一个外部程序在 Tick 120 同时控制两个人物：

```jsonl
{"type":"controller.create","requestId":"r1","controllers":[{"id":"controller-red","controlSource":{"kind":"cli","sourceId":"agent-a"}},{"id":"controller-blue","controlSource":{"kind":"cli","sourceId":"agent-a"}}]}
{"type":"control.bind","requestId":"r2","controllerId":"controller-red","controlledEntityId":"person-a","channels":["locomotion","action"]}
{"type":"control.bind","requestId":"r3","controllerId":"controller-blue","controlledEntityId":"person-b","channels":["locomotion","action"]}
{"type":"control.intent-batch","requestId":"r4","targetTick":120,"commands":[{"controllerId":"controller-red","sequenceNumber":1,"expectedControlledEntityId":"person-a","intent":{"type":"move","forward":1}},{"controllerId":"controller-blue","sequenceNumber":1,"expectedControlledEntityId":"person-b","intent":{"type":"move","right":1}}]}
```

`controller.create` 的权限和目标白名单由 Host Session Policy 授予，调用方不能在命令中自我提权。`control.bind` 必须校验 Session 的 `control.bind` Scope、Controller 所有权、目标白名单、目标 `control.possessable` 能力与 Channel 基数。`control.intent` 需要 `control.intent` Scope。一个 Session 可以创建多个 Controller；同一个 Controller 不能通过重复 Bind 同时占有多个 Locomotion 目标。

Intent Receipt 至少包含 `requestId`、`sessionId`、`controllerId`、解析后的 `controlledEntityId`、`acceptedTick`、`effectiveTick` 和结果状态。Session 结束、超时或宿主断开时，Runtime 在 Phase Barrier 释放控制绑定，并按 Authoring Policy 将主体切回 `uncontrolled`、默认 AI 或安全停止状态。

### 16.4 WorldChangeSet 与增量修改协议

AI 修复和迭代不应每次重写整个大型 JSON，也不应直接使用数组下标驱动的通用 Patch。SDK 定义面向领域的 `WorldChangeSet`：

```ts
interface WorldChangeSet {
  kind: "worldkit-change-set";
  schemaVersion: 1;
  changeSetId: string;
  baseAuthoringSpecHash: Sha256;
  preconditions: readonly WorldPrecondition[];
  operations: readonly WorldChangeOperation[];
  provenance?: ChangeProvenance;
}
```

`baseAuthoringSpecHash` 只表示当前待修改 AuthoringSpec 的规范字节 Hash：输入已经通过无重复键解析和其声明版本的 Canonical Schema 校验，但尚未执行版本迁移、默认值注入、Normalizer、Compiler 或安全修复。第一版计算方式固定为 `SHA-256(canonical-json-jcs@1(authoringSpec))`；AuthoringSpec 自身的 Schema Version 因此也进入 Hash。NormalizedWorldIR Hash、WorldPackage Root Hash 和运行时 Snapshot 使用各自明确命名的字段，禁止统称或替代 `baseAuthoringSpecHash`。

首批 Operation 只包含可验证的稳定 ID 操作：

- `resource-upsert` / `resource-remove`
- `node-upsert` / `node-remove`
- `component-set` / `component-remove`
- `relationship-add` / `relationship-remove`
- `variant-select`
- `terrain-source-replace`
- `constraint-set` / `constraint-remove`

Operation 必须携带稳定 `operationId`、目标 ID 和必要的期望版本/值。[RFC 6902 JSON Patch](https://www.rfc-editor.org/rfc/rfc6902.html) 可以作为标量字段和 JSON Pointer 的互操作输入，但进入 Compiler 前必须转换为上述领域操作；生产协议禁止用 `/nodes/17` 一类数组位置表达实体身份。

应用流程固定为：

```text
check baseAuthoringSpecHash and changeSetId
  → validate schema and preconditions
  → apply to isolated authoring candidate
  → normalize and compile affected graph
  → run budgets and required gates
  → atomically publish candidate
  → emit ChangeReceipt(resultAuthoringSpecHash, normalizedWorldIrHash, affectedIds, diagnostics)
```

- 默认是 `dry-run`，只有显式 `apply` 才写出新 AuthoringSpec；CLI 不就地覆盖输入文件。
- 任一 Operation 或 Gate 失败都不产生部分提交。
- 相同 `changeSetId + baseAuthoringSpecHash + ChangeSet Hash` 重试返回同一 Receipt；相同 `changeSetId` 携带不同内容必须失败。
- `baseAuthoringSpecHash` 不匹配返回 `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`（公共码以 P1.6 专项为准），并给出 `currentAuthoringSpecHash` 与 `conflictingIds`；不要新增 `rebaseRequired` 同义字段，不能静默套用到新世界。
- ChangeReceipt 明确记录 `baseAuthoringSpecHash`、`resultAuthoringSpecHash`、`normalizedWorldIrHash`、受影响实体/资源、Diagnostic、实际应用的迁移和安全修复；不得使用未定义对象的通用 `worldHash` 字段。
- 增量编译结果必须通过 Differential Test，证明它与对最终 AuthoringSpec 做一次完整 normalize/build 的 Canonical Output 完全相同。

WorldChangeSet 只修改 Authoring 数据。运行中的移动、攻击和骑乘仍使用有权限、按 Tick 提交的 Runtime Command；二者不能共用一个模糊的 Patch API。

### 16.5 运行中结构修改与 Runtime 发布

“页面正在运行时增加一个人物或一栋房屋”仍然是 Authoring 结构修改，不是 DOM 操作、
Babylon `Scene` 操作或 Gameplay Command。系统必须始终区分两条写入平面：

| 写入平面 | 典型操作 | 权威协议 | 是否改变 AuthoringSpec |
|---|---|---|---|
| Runtime State | 移动、跳跃、攻击、骑乘、相机控制 | 固定 Tick Command/Intent/Relationship Transaction | 否 |
| World Structure | 增删人物、房屋、障碍、资源、Constraint 或地形 | `WorldChangeSet` | 是 |

LLM、Playwright 或页面脚本不得因为运行在浏览器中就绕过该边界直接调用
`scene.add(...)`、改 DOM、创建 Havok Body 或写 Runtime 内部 Map。受信 Host 接受
WorldChangeSet 后，仍必须走 16.4 的 Schema、Registry、Solver、Compiler、Budget 和
Required Gate。

#### 16.5.1 第一条生产切片：Full Reload

第一条实现优先保证安全和可解释性，不承诺保留可变运行状态：

```text
trusted edit request
  → validate/dry-run WorldChangeSet against baseAuthoringSpecHash
  → apply to isolated Authoring candidate
  → full normalize / solve / compile / package / required gates
  → prepare Replacement Runtime in isolation
  → wait for Replacement World Ready
  → commit at a Phase Barrier and atomically swap Host/Browser handle
  → dispose old Runtime from its Ownership root
  → return ChangeReceipt + new Snapshot
```

- Replacement Runtime 在进入 Commit 前必须已经通过 World Ready；准备、预算或 Gate 失败
  时旧 Runtime 继续运行，不能先 Dispose 旧世界再尝试构建新世界。
- Host 必须在准备前检查新旧 Runtime 暂时双驻留所需的峰值内存、WASM、Asset 和 GPU
  Budget；无法满足时稳定拒绝或使用明确声明的维护窗口，不能静默突破资源上限。
- Full Reload 默认产生新的 Runtime Instance，并从 Tick 0 启动。旧人物的位置、速度、
  Action、Controller Binding、Relationship、Camera Pose 和临时资源不自动复制。
- Host 级 View Preference 或 Bootstrap Policy 只有作为显式、可验证输入时才可重新应用；
  不能把旧 Runtime Handle 或未版本化闭包带进新世界。
- ChangeReceipt 必须记录应用模式、旧/新 AuthoringSpec Hash、IR/Package Hash、受影响 ID、
  新 Runtime Instance 身份，以及明确的 `preserved/reset/replaced` 状态集合。这里的英文词
  仅描述语义；最终公共字段名在 P1.6 专项设计中冻结。
- Browser/Host 的发布请求 Envelope 还必须绑定 Request ID、Session ID、期望的 Runtime
  Instance、期望的 WorldPackage Root Hash 和目标 Phase Barrier。`baseAuthoringSpecHash`
  只防止 Authoring 基线错配，不能代替运行实例并发控制；任何期望值过期都必须在创建
  Runtime 副作用前稳定失败。

#### 16.5.2 后续切片：受限 Incremental Hot Apply

增量热更新是独立的高风险能力，不能因为增量 Compiler 已存在就推断 Runtime 可以安全
热替换。每个允许热更新的 Operation/Node Kind 都必须注册确定性的 Transaction Handler，
声明 Prepare、Validate、Commit、Rollback、State Migration 和 Ownership 规则。

- Commit 只发生在固定 Tick Phase Barrier；逻辑、Visual、Physics、Control、Camera、
  Relationship、Snapshot 索引和 Ownership Ledger 必须原子可见。
- 未受影响实体必须保持 Entity ID、Transform、Velocity、Action、Controller Binding 和
  Camera/Relationship 状态；被修改或删除实体使用显式迁移/删除策略，禁止按对象引用猜测。
- Terrain、全局物理、坐标系、Schema/Profile Major、插件实现、Runtime Backend，以及未
  注册 Transaction Handler 的变化必须返回“需要 Full Reload”的结构化结果，不能半热更新。
- 任一步失败恢复到同一 Tick 的旧逻辑图、渲染图和物理图，并释放全部候选资源；重复
  Request 返回同一 Receipt，不重复创建 Mesh、Body、Listener、Controller 或 Asset Lease。
- Apply 请求在排队和 Commit 时都要复验 Runtime Instance、Package Hash 与目标 Tick/Phase；
  若期间发生 Full Reload、Reset 或另一笔结构提交，返回结构化并发冲突，不自动改投新世界。
- Incremental 结果必须与对最终 AuthoringSpec 执行 Full Normalize/Compile 的 Canonical
  IR/ExecutionPlan 等价；Runtime Conformance 还要验证未受影响状态保持和重放一致性。

Full Reload 与 Incremental Hot Apply 必须共享一个 WorldChangeSet/ChangeReceipt 协议；
应用方式是 Host 根据变更分类、能力、预算和 Policy 作出的受控决定，不允许 LLM 自报
“可热更新”来绕过 Gate。

## 17. Diagnostic 与 AI 自修复

Diagnostic 必须是正式协议：

```json
{
  "severity": "error",
  "code": "CAPABILITY_REQUIREMENT_UNSATISFIED",
  "instancePath": "/nodes/2/capabilities/1",
  "entityId": "dragon-1",
  "capabilityRef": "locomotion.flight@1",
  "message": "Flight requires a 3D directional control provider.",
  "details": {
    "required": "control.direction3d",
    "available": ["control.direction2d"]
  },
  "suggestions": [
    {
      "kind": "add-capability",
      "capabilityRef": "control.direction3d@1"
    }
  ]
}
```

要求：

- 错误码稳定且可文档化。
- 使用 JSON Pointer 定位输入。
- 包含相关 RuntimeEntity、Resource、Capability 或 Relationship ID。
- 解释实际值、期望值和冲突来源。
- 提供机器可读修复建议。
- SDK 可以输出建议 Patch，但只自动应用被标记为 `safe` 的机械修复。
- 所有可应用建议都必须编码成带 `baseAuthoringSpecHash` 和 Preconditions 的 WorldChangeSet；`safe` 只表示可以在显式授权后自动应用，不允许绕过事务和 Gate。
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
- `createControllers()`
- `getControlBindings()`
- `bindControl()`
- `releaseControl()`
- `setIntent(command: ControlIntentCommand)`
- `setIntents(batch: ControlIntentBatch)`
- `stepTicks()`
- `runActions()`
- `performAction(controllerId, action)`
- `listCameraRigs()`
- `getCameraSnapshot()`
- `setCameraMode()`
- `setCameraPose()`（仅 test/dev 或受信控制面）
- `raycast()`
- `captureFrame()`
- `getDiagnostics()`
- `dispose()`

上表是 Runtime 控制/观察协议的长期目标集合；当前 Browser Protocol V3 只实现其中的
Ready、Snapshot、Diagnostic、Control Binding、Fixed Input、Pause/Reset 和 Screenshot
子集，**不支持结构写入**。P1.6 必须另行冻结 WorldChangeSet 的 Validate、Dry Run、Apply、
Receipt 查询与 Full Reload/Incremental 发布能力；这些写操作使用独立的受信 Authoring/Edit
Session Scope，不能复用 `control.intent`、`control.bind` 或 `capture` 权限。`load` Scope
只允许加载 Host 已批准且通过完整性验证的不可变 WorldPackage；它不能从 WorldChangeSet
派生、批准或发布一个新 Package。

Playwright 不使用任意 `waitForTimeout` 驱动模拟。测试动作按固定 Tick 执行：

```json
{
  "controllerId": "controller-red",
  "actions": [
    {
      "type": "move",
      "forward": 1,
      "run": true,
      "durationTicks": 120
    },
    {
      "type": "perform",
      "actionRef": "jump@1"
    },
    {
      "type": "set-camera-mode",
      "cameraEntityId": "player-view",
      "mode": "first-person",
      "transitionKind": "cut"
    },
    {
      "type": "look",
      "yawRadians": 0.4,
      "pitchRadians": -0.1,
      "durationTicks": 1
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

CLI `run` 提供文件批处理和长生命周期 NDJSON Session；TypeScript/Node.js Driver API 与 Browser Driver 提供同一协议的类型安全包装。Controller、Possession、Intent、Receipt 和 Snapshot Schema 只有一份权威定义，任何传输 Adapter 都必须通过 Conformance Test 证明等价。

`listCameraRigs/getCameraSnapshot` 需要 `observe` Scope；`setCameraMode`、View Intent 和 `setCameraPose` 需要 `camera.control` Scope；精确指定 Profile 的 `setCameraRig` 还要求创作/测试 Session Scope，并且目标必须在 `allowedRigRefs` 中。`createControllers/setIntent/setIntents/performAction` 需要 `control.intent` Scope；`bindControl/releaseControl` 需要更高权限的 `control.bind` Scope。拥有 `capture` 不能隐式获得镜头或主体控制权，拥有 `control.intent` 也不能改变 Possession。`setCameraPose` 只允许操作 AuthoringSpec 声明为可外部控制的 Camera，且正式 Gameplay 构建默认关闭；每次修改返回 Request ID、Camera Snapshot 与生效 Tick/Render Frame。Capture Gate 必须等待 ViewReceipt 和下一次 Render Ready，不能用任意延时猜测镜头已经稳定。

### 18.1 Driver 访问控制

Browser Driver 是测试与受信宿主控制面，不是所有发布页面默认开放的 Gameplay API：

- 正式 Runtime 构建默认不暴露 `window.__WORLDKIT_DRIVER__`；只有显式 test/dev 或受信 embed 模式启用。
- Host 通过 bootstrap handshake 创建短生命周期 Session，并使用不可预测 nonce 绑定页面实例。
- Session Scope 至少拆成 `observe`、`control.intent`、`control.bind`、`camera.control`、`capture` 和 `load`；Driver 方法逐项校验权限。
- `loadWorldPackage` 只能加载宿主允许来源且通过完整性、兼容性和预算校验的 Package。
- Session 绑定允许的 Origin、World ID 和有效期；页面导航、World Dispose 或 Host 断开时自动失效。
- 每个自动化 Run 使用独立 Browser Context、Storage Namespace 和 Session；禁止跨 Case 复用可变世界状态、Local Storage、权限或 Driver Handle。
- `reset/loadWorldPackage` 必须等待 Runtime Dispose、Ownership Ledger 清空和下一份 World Ready Gate 后才返回；Snapshot/Receipt 均携带 `worldPackageRootHash`、`normalizedWorldIrHash`、Registry Lock Hash、Session ID、Request ID 和 Tick。
- Snapshot、Diagnostic 和日志遵守数据脱敏策略，不向无权限 Session 暴露本地路径、Prompt 或资产凭证。
- Playwright Driver 通过握手获得句柄，不假设任意页面脚本都能永久调用全局写接口。

## 19. WorldPackage

`build` 输出可持久化目录：

```text
world-package/
  manifest.json
  authoring-spec.json
  world.normalized.json
  registry-lock.json
  resources/
  terrain/
  collision/
  targets/
    babylon-web/
  diagnostics.json
  integrity.json
  signatures/             # 可选，不参与自身签名
```

`manifest.json` 至少包含：

- World ID 与标题。
- SDK、Schema 和 Package 版本。
- Canonical Schema Hash、使用过的 AI Schema Profile Hash 与 Registry Lock Hash。
- Seed。
- Runtime Target。
- Capability、Kit、Action 与插件版本。
- 入口点与初始控制目标。
- 资源 URI、哈希、大小和类型。
- 世界边界和资源预算。
- NormalizedWorldIR 哈希。
- Hash 算法与 Canonicalization Profile。

WorldPackage 不保存进程内对象或引擎 Handle。Runtime Target 可以包含经过缓存的 Babylon/Web 资源，但 `world.normalized.json` 保持引擎无关。

WorldPackage 也不保存某一次拍摄的 Controller/Input/Action/Camera Track、输出帧或模型
参数。它只提供 Simulation Take 可引用的世界、初始状态、Capability 和锁定资源。
`SimulationTake`、`RuntimeSession` 与 `ControlCaptureBundle` 使用各自独立 Schema 和
Hash；同一个 WorldPackage 可以运行多个 Take，任何 Bundle 必须逐帧绑定唯一
Package Root、Take Hash 和实际 Session。这样换镜头或动作不会重建世界，也不会把
视频生产状态污染可复用 Package。

`authoring-spec.json` 是可选审计产物，不是 Runtime 必需文件。构建命令必须支持省略或脱敏 `provenance` 中的 Prompt、参考图 URI、用户标识和内部证据；资源同时记录来源、许可证与允许用途。Runtime Target 缓存的第三方运行时二进制（如物理引擎 WASM）同样记录来源与许可证。

`integrity.json` 只证明文件内容与清单一致，不能证明发布者身份。如果部署场景要求真实性，WorldPackage 还必须包含签名、签名者 ID 和宿主信任根；文档和 Diagnostic 必须明确区分 corruption integrity 与 publisher authenticity。

### 19.1 Canonical Bytes、Hash 与签名输入

“稳定 JSON 序列化”必须固定为版本化字节协议。第一版使用 `canonical-json-jcs@1`，语义兼容 [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)，并增加本项目的输入限制：

- JSON 解析阶段拒绝重复属性名、无效 Unicode、`NaN`、`Infinity`、`-Infinity` 和 `-0`。
- 整数必须落在 JSON/IEEE-754 可无损互操作范围；需要高精度的量使用带单位的十进制字符串或量化整数 Schema。
- 字符串不做隐式 Unicode Normalization；不同码点序列就是不同输入，Normalizer 只能通过显式迁移修改。
- Object Property 顺序、数字输出和字符串转义完全由 Profile 决定；业务代码不能使用普通 `JSON.stringify`、Map 插入顺序或本地 Locale 自行计算协议 Hash。
- NormalizedWorldIR 中所有集合在 Canonicalization 前按照其 Schema 声明的稳定键排序；有语义顺序的数组保留原顺序，并将该顺序视为 Hash 输入。

二进制资源直接对原始字节计算 SHA-256，不经过图片解码、换行转换或平台格式转换。`integrity.json` 使用稳定路径排序，记录除自身和 `signatures/` 外每个文件的 `path`、`mediaType`、`sizeBytes` 与 `sha256`。Package Root 的计算输入固定为：

```text
SHA-256(canonical-json-jcs@1({
  packageFormatVersion,
  canonicalizationProfile,
  hashAlgorithm,
  files: sortedIntegrityEntries
}))
```

这样避免文件自哈希循环。签名 Envelope 不进入 Package Root。签名输入禁止使用字段字符串直接拼接，第一版固定为以下对象的 `canonical-json-jcs@1` 字节，以 `kind + schemaVersion` 提供协议域隔离：

```json
{
  "kind": "worldkit-package-signature-envelope",
  "schemaVersion": 1,
  "packageRootHash": "sha256:...",
  "packageId": "coastal-world",
  "packageFormatVersion": 1,
  "runtimeTarget": "babylon-web",
  "signatureAlgorithm": "ed25519",
  "keyId": "publisher-key-2026-01",
  "trustDomain": "worldkit.production",
  "signedAt": "2026-08-18T00:00:00Z"
}
```

`signatures/<key-id>.json` 保存完整 Envelope 与对其规范字节计算的签名；验证方先重新生成规范字节，再验证签名，不能信任文件中另存的拼接串或摘要。验证顺序是路径安全检查、逐文件 Hash、Package Root、Envelope 字段与宿主策略、签名信任、版本/预算兼容性，任何一步失败都不能加载 Runtime Target。

`registry-lock.json` 同时固定 Schema/Profile Hash、Kit/Capability/Action 精确版本、插件内容 Hash、Asset Hash、Compiler Profile 和 Determinism Profile。Compiler Cache、WorldChangeSet `baseAuthoringSpecHash`、Replay 和远程制品索引必须复用同一 Canonical Bytes 协议，并为各自的哈希对象使用明确字段名和域标签，禁止各自定义“近似相同”的哈希算法。

## 20. 版本、迁移与兼容性

独立版本：

- SDK Package SemVer。
- AuthoringSpec Version。
- NormalizedWorldIR Version。
- WorldPackage Version。
- Capability/Kit/Action/Rig 独立 Major Version。
- AI Schema Profile、Canonicalization Profile 和 Determinism Profile 独立版本。
- WorldChangeSet 与 ChangeReceipt Protocol Version。
- Browser Protocol Version。

规则：

- 以下兼容规则适用于已经发布或被外部调用方采用的协议；未发布私有 Schema 经明确评审后可以干净替换，并同步重写全部本地 Fixture/Artifact，而不为开发历史增加迁移代码。
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
- 受控嵌套 `loadout/initialInventory/initialMount` 展开为稳定 RuntimeEntity 与 Relationship。
- CameraRigProfile 的 `mode` 判别 Union、投影类型与 Mode 专属字段互斥；Camera 节点的 Default/Allowed Rig、Target、Context Binding 与 Registry Lock 解析。
- WorldNodeSpec ID、包内 URI、注册表 URI 与 Registry Lock 解析。
- Canonical Schema、`constrained-json@1` 投影和每个 Provider Adapter 的 Valid/Invalid Fixture；Adapter 输出必须重新通过 Canonical Schema。
- Prototype/Instance/Variant/Composition Layer 的稳定解析、Tombstone、按 ID 集合操作和冲突诊断。
- Canonical Bytes Golden Fixture：属性重排 Hash 不变，语义数组重排 Hash 改变，重复键、`-0` 和非法数值被拒绝。
- WorldChangeSet 的 `baseAuthoringSpecHash`、Precondition、幂等 Receipt、原子失败和增量/全量 Differential Build。
- Version Migration。
- Diagnostic Snapshot。

### 22.2 Capability Conformance

每个 Capability 必须通过：

- Manifest Schema。
- requires/provides/conflicts。
- Capability Instance 基数、Kit merge/replace/disable 和 Provider 歧义。
- 改变插件注册顺序不改变解析结果与 ExecutionPlan Hash。
- 安装、Suspend/Resume、依赖感知移除、Rollback 与幂等 Dispose。
- Ownership Ledger 泄漏测试；反复安装/移除后 System、Listener、Collider、WASM Handle 和 Asset Lease 回到基线。
- 固定阶段执行。
- 按 Determinism Profile 验收编译确定性、模拟重放和视觉容差。
- 资源预算。
- 缺失依赖的可执行诊断。
- Camera Rig Activation Group 在每个 View Session 只能激活一个模式；切换失败回滚旧 Rig，反复切换/销毁后 Camera、监听器、Render Binding 与 Physics Query Lease 无泄漏。

### 22.3 Runtime Conformance

- Transform 与坐标约定。
- RuntimeEntity 生命周期和资源清理。
- Fixed Timestep。
- Body/Collider 同步。
- Raycast 与碰撞组。
- Terrain 与水体边界。
- Camera Node、CameraRigProfile、Target/Socket fallback、第一/第三人称切换、输入 Intent 和 Possession。
- ControllerEntity、ControlSource Adapter、Channel 基数、Binding 权限、多人同 Tick Batch、Sequence 冲突、Session 断开释放和 Replay 一致性。
- 第一人称 Body Visibility、权威武器 Entity 与可选 View Model 的身份映射；防穿墙不能修改 Gameplay Physics。
- 第三人称 Boom Shape Cast、主体过滤、遮挡策略、最小距离和距离恢复；Camera Query 不能推动物体。
- 骑乘/飞行 Context Binding 在 Possession 提交后切换 Rig，下坐骑恢复 Session 首选视角，失败路径保持上一可用 Rig。
- Camera Orientation 参与瞄准/移动时，View Intent、切换 Receipt 与 Replay Input Log 一致；纯视觉插值不污染 Gameplay Hash。
- Action、动画事件与状态转换。
- Relationship Transaction 的原子提交、回滚和幂等 Receipt。
- EquipmentSlot、RigSocket、装备物理模式和双手占用。
- ActionContext、Variant fallback、动画分层与武器 Hitbox Tick。
- Action Timeline、Cancel Window、Channel Lock、装备/坐骑中途变化策略和 Root Motion Transform Authority。
- Capture Pass 与 Browser Protocol。

### 22.4 Vertical Slice

第一条生产验证场景使用参考海湾：

- 分块 Heightfield。
- 大面积海湾和岸线。
- 可在第一人称和第三人称之间切换的人物；两种视角共享同一主体、武器、物理和 Semantic ID。
- 灯塔、房屋、帆船和岛屿。
- 静态碰撞和连续可走路线。
- Opening Shot Region/Anchor 校验。
- 固定输入移动、转向和跳跃。
- Color、Semantic Mask、Depth、Height/Slope 截图。

第二条能力验证场景：

- Humanoid 与 Dragon 是独立 RuntimeEntity。
- 接近、上坐骑、控制权切换、起飞、飞行、降落和下坐骑。
- 一个 Runtime Session 创建两个 Controller，分别控制 Humanoid 与 Dragon，并在同一 Tick 提交可重放的 Intent Batch；未授权 Controller、过期 Sequence 和过期 `expectedControlledEntityId` 必须稳定失败。
- Body/Visual/Rig/AnimationSet 可替换。
- Replay 结果确定。
- 空手跑动、持剑跑动、持剑攻击和缺少专用动画时的声明式降级。
- 骑乘和飞行 Camera Context 切换；下坐骑后恢复 on-foot 首选视角。

### 22.5 Production Gates

```text
schema
  → normalize
  → capability resolve
  → layout solve
  → compile
  → unit/integration
  → browser smoke
  → physics/playability
  → capture/composition
  → replay/determinism
  → performance/resource budget
  → package/bundle integrity
  → validation report
```

任一必需 Gate 失败都阻止发布，不能用总体分数掩盖关键失败。所有生产验收使用
锁定的 `ValidationProfile`，输出不可变 `ValidationReport`、`GateResult`、
`MetricResult` 和 `EvidenceArtifact`。Blocking Gate 失败、Required Metric 缺失、
Evaluator 未完成或证据归属不明都阻断下一阶段；Advisory 结果保留但不改变结构真相。
阈值、单位、容差、平台类别和 Evaluator 版本必须进入 Profile/Report，不能散落在
测试代码或 Prompt 中。

性能与资源预算 Gate 的预算来自两处：AuthoringSpec `constraints` 中的世界级资源预算（节点数、三角形、Collider、Raster、包体与内存上限），以及 Host Profile 按平台类别声明的运行基线（固定输入脚本下的帧时间分位数、加载时间和内存峰值）。测量在声明的平台类别中按固定 Tick 脚本执行，结果与所用 Profile 一起写入验收报告；超出预算或基线属于阻断失败，不能用平均值或总体分数覆盖。

生产 Gate 还必须覆盖：Schema Projector/Adapter Conformance、WorldChangeSet 全量等价性、Capability 事务回滚、Canonical Package Root 和签名验证。Browser/Replay Gate 的 Snapshot 与 Capture Artifact 记录 `worldPackageRootHash`、`normalizedWorldIrHash`、Registry Lock Hash、Session ID、Request ID 和当前 Tick，避免把不同构建或不同运行实例的结果误作同一证据。

物理 Gate 至少量化穿插深度、支撑间隙、接触比例、Settling 位移/转角、非法物理值
和可达性；构图 Gate 对每个 Required Region/Anchor 单独阻断；Capture Gate 验证帧数、
Pass、ID Table、Depth 单位、Camera Matrix、Tick/Frame 映射和 Hash 归属。VLM/LLM
评估第一阶段只能作为 Advisory Evidence，不能覆盖碰撞、位置、身份或完整性失败。
完整协议见
[World Validation Report 与质量门禁专项设计](./2026-08-19-world-validation-report-and-quality-gates-design.md)。

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
- 提供一次性的 `OutdoorWorldSpec/CompiledOutdoorScene → AuthoringSpec Fixture` 迁移工具，用于生成回归基准；它不是永久 Public API，也不阻止旧格式最终下线。

## 24. 仓库策略与迁移顺序

继续在当前仓库开发，不新建第二个 SDK 仓库。使用隔离分支或 Worktree 建设新架构，旧 Runtime 作为回归基准暂时保留。

本文是覆盖整个 SDK 的总架构规格，不应被压缩成一个超大实现任务。阶段 0 至 F 分别形成独立实施计划；Schema/IR、Capability Compiler、Babylon Runtime、Subject/Action、CLI/Browser Driver 五个子系统在编码前各自补充接口级实施说明和验收清单，但不得偏离本文冻结的公共边界。

### 与现有 ADR 和创作工作流的关系

架构级决策记录在 [ADR-0006：AuthoringSpec 编译架构与 Babylon Runtime](../../decisions/0006-authoring-spec-compiler-architecture.md)（Accepted；各实施阶段仍按 Backlog 独立验收）：

- ADR-0001 的 Subject Kit 方向被继承为 AI-facing Kit 层，不被推翻。
- ADR-0004 与 ADR-0005 的原则（Plan-first、四类证据、角色分离、冻结门禁）由 AuthoringSpec、Evidence 分类、WorldChangeSet 和 Production Gates 继承；其具体载体（`plans/<catalog-id>.ts`、`plan-lock.json`、`agent:plan/build/visual` 脚本链）在阶段 F 由新协议取代，届时两份 ADR 标记为 Superseded by ADR-0006。
- 阶段 B–E 期间旧创作链路保持可用且只接收缺陷修复，不再接收新能力；新场景在阶段 F 切换点之前默认仍走旧链路。
- 阶段 F 必须同步完成创作侧迁移：更新根 `AGENTS.md` 与工作流文档，迁移或下线 `plan:freeze`、`plan:scene` 等脚本，将旧规划工件格式冻结为回归 Fixture。

地形子规格 T0–T6 与本文阶段的依赖关系：T0 与阶段 A 并行；T1、T2 依赖阶段 B 的 contracts、Canonical Bytes 与 Registry Lock 协议；T4 与阶段 C 是同一次 Babylon/Havok Vertical Slice 里程碑；T5 依赖阶段 E 的 CLI 与 Browser Protocol。

### 阶段 0：Runtime 风险探针

在冻结 PhysicsPort、CapturePort 和完整 ExecutionPlan 前，先做不进入公共 API 的 Babylon/Havok 技术探针（实施计划与判据见[阶段 0 技术探针计划与外部资料核查](./2026-08-18-phase0-probe-plan-and-external-research.md)）：

- 分块 Heightfield 或等价地形 Collider 的创建、更新、Raycast 和释放。
- Character Controller 的坡度、跨阶、贴地、边缘和连续碰撞行为。
- GLB Rig、动画、Socket/Bone Attachment 和分层动画。
- Headless Playwright 下的 Fixed Tick、暂停和 Browser Session。
- Color、Semantic Mask、Instance ID、Depth 与 Collision Debug Capture Pass。
- 大场景资源加载、Dispose、WASM 生命周期、内存和帧率基线。

探针只用于验证 Port 契约和选型，不允许场景代码直接依赖探针实现。若 Havok 的地形或角色控制不满足验收，先调整 PhysicsPort/后端决策，再冻结阶段 B 协议。

### 阶段 A：冻结基准

- 固定当前海湾、草地和物理测试 Fixture。
- 保存截图、Semantic Mask、Height/Slope 和固定输入结果。
- 记录当前性能、资源和行为基线。

### 阶段 B：协议底座

- 新增 contracts、schema、world-ir、capability 和 compiler 包。
- 定义 AuthoringSpec、NormalizedWorldIR、Prototype/Instance/Variant/Layer、Placement Constraint、WorldChangeSet、Diagnostic 和 Capability Manifest。
- 实现 Canonical Schema、`constrained-json@1` Projector、validate、normalize、registry lock 和 `canonical-json-jcs@1`。
- 冻结 LayoutSolveReport 与 Validation Profile/Report 的基础协议，先实现 Schema/引用/Layout 的确定性 Gate。
- 用 Golden Fixture 冻结 Canonical Bytes、Composition、Layout Solve、增量/全量等价和 Provider Adapter Conformance，再允许 Runtime 依赖这些协议。

### 阶段 C：Babylon Vertical Slice

- 实现 runtime-contracts、runtime-babylon 和 physics-havok。
- 编译并运行海湾场景。
- 实现 CameraPort、第三人称 Rig、Boom Collision 与可重放 View Snapshot。
- 达成与旧 Runtime 相同的地形、主体、物理、相机和捕获 Gate，并通过统一 Validation Report 输出量化证据。

### 阶段 D：Subject 与 Action

- 实现 Profile、Kit、Possession、Relationship 和 Semantic Action。
- 验证成人/儿童模型替换和不同 AnimationSet。
- 实现第一人称 Rig、Body Visibility、Wall-peek 防护和第一/第三人称切换；同一武器 Entity 在两种视角保持同一 Gameplay/Semantic 身份。
- 实现 Action Timeline、Channel Lock、Cancel/Interrupt、Equipment 事务和 Capability 动态生命周期。
- 实现地面坐骑，再实现飞龙飞行与下坐骑；Camera Director 根据已提交的 Possession/Locomotion Context 切换并恢复 Rig。

### 阶段 E：工具化

- 正式 CLI。
- WorldPackage。
- Simulation Take 与固定 Tick Track。
- Control Capture Bundle、五个必需 Pass 和 Capture Encoding Profile。
- Browser Protocol。
- Playwright Driver。
- Camera Mode/Snapshot/View Intent/受控 Pose 的 Browser Protocol 与 CLI 脚本动作。
- Inspector 与 Capability Discovery。

### 阶段 F：切换默认实现

- 新 Runtime 通过全部 Production Gates。
- Playground 默认切换 Babylon。
- 移除或归档 Three Runtime。
- 将生产 Agent 编排迁出 SDK 仓库，只保留 Fixtures 和接入文档。
- 更新 `AGENTS.md`、创作工作流文档与被取代 ADR 的状态；旧规划工件格式冻结为回归 Fixture。

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

## 26. Canonical Lane 生产验收标准

设计落地后必须满足：

1. 外部程序仅通过 JSON 和公开 SDK/CLI 即可生成、验证和运行世界。
2. Canonical Agent 不生成 TypeScript 场景代码，不接触 Babylon/Havok 对象；Native Lane 的视觉例外
   使用自己的专项验收，且始终不得接触 Havok。
3. `worldkit capabilities list` 能发现所有可用 WorldNodeSpec kind、Kit、Capability、Action 和 Relationship。
4. `validate` 与 `normalize` 输出稳定、可定位、可修复的 Diagnostic。
5. 同一输入和 Seed 的 NormalizedWorldIR 哈希稳定。
6. 新增 Capability 不修改 Compiler Core。
7. 新增人物模型或动画集不修改 Subject Runtime Core。
8. 成人与儿童能共享 Humanoid Kit，同时使用不同 Body/Visual/Rig/Animation Profile。
9. 主体能够通过 Relationship 与坐骑组合，并正确切换控制、物理、相机和动作。
10. 地形、水面、主体和核心物件可由 Spec 确定性编译并具有正确物理。
11. Browser Protocol 能按 Tick 移动、执行动作、切换/查询 Camera、控制 View Intent 和截图。
12. WorldPackage 可以独立校验、保存、加载和重放。
13. 必需构图 Region、Anchor、路线坡度和物理 Gate 可阻断不合格产物。
14. Runtime、CLI 和插件具有明确版本、生命周期和兼容性规则。
15. AI 可以使用受控嵌套声明初始装备和坐骑，NormalizedWorldIR 必须展开为稳定实体与类型化关系。
16. 空手、持械、骑乘等状态复用稳定 Semantic Action，并通过确定的 ActionContext/Variant 规则选择表现。
17. Browser Driver 默认不出现在普通生产构建中，受信 Session 按 Scope 授权。
18. SDK 可以按已安装能力导出提供方无关的 AI Schema Profile，任一 Provider Adapter 的输出都必须重新通过 Canonical Schema 与语义 Gate。
19. Prototype、Instance、Variant 与 Composition Layer 具有确定的覆盖、删除、冲突和 Provenance 规则，不依赖数组位置或通用 deep merge。
20. WorldChangeSet 以 `baseAuthoringSpecHash` 和稳定 ID 原子应用；重试幂等，失败不产生部分世界，增量编译与全量编译结果一致。
21. Capability 动态安装与移除可以回滚且无资源泄漏；Action Timeline 的阶段、锁、Effect Tick 和终止原因可重放。
22. NormalizedWorldIR、Registry Lock、资源和 WorldPackage 使用同一版本化 Canonical Bytes/Package Root 协议，签名与完整性验证无自引用歧义。
23. CameraRigProfile 能表达第一人称、第三人称及其他注册视角；切换不复制 Gameplay Entity、不改变 Possession/Physics，并在骑乘/飞行 Context 中确定回退与恢复。
24. 每个发布世界在声明的平台类别下通过帧时间、内存、加载时间和包体预算 Gate，预算来源与测量结果记录在验收报告中。
25. Agent 可以使用类型化 Placement Constraint 表达 Region、距离、朝向、支撑、净空、路线、坡度和构图，不必为全部实例猜最终坐标。
26. 相同 Authoring、Registry Lock、资源、Solver Profile、Seed 和预算得到相同最终 Transform 与 LayoutSolveReport Hash；Required Constraint 失败时不生成 WorldPackage。
27. 同一个 WorldPackage 可以运行多个独立 Simulation Take；Take、Runtime Session 与 Control Capture Bundle 的引用和 Hash 不混淆。
28. 每个生产 Control Capture Bundle 包含 `neutral-color`、`linear-depth-meters`、`semantic-class-id`、`instance-id`、`world-normal`，以及逐帧 Tick/Render Frame/Camera/Receipt 归属。
29. 所有发布制品通过锁定 ValidationProfile 生成量化 ValidationReport；Blocking Gate、Required Metric 缺失或验证未完成都阻断，任何综合分数不能覆盖。

## 27. 最终架构决策摘要

- 当前仓库继续作为 SDK 仓库。
- 外部团队实现图片/Prompt Agent。
- Agent 正式输出为纯 JSON AuthoringSpec。
- AI 默认使用 Kit，高级模式允许 Capability 组合。
- Canonical JSON Schema 是协议真相；AI Schema Profile 是基于能力集的受限投影，模型提供方差异留在 Adapter。
- AI-facing 类型是 WorldNodeSpec，规范化后的逻辑实例是 RuntimeEntity，Babylon 内部对象是 RenderNode。
- 通用节点为 subject、terrain、water、object、volume、path、anchor、camera、spawner、environment。
- AuthoringSpec 允许注册字段中的受控嵌套简写，但 NormalizedWorldIR 统一展开为同级 RuntimeEntity 与类型化 Relationship。
- Resources、Nodes、Relationships 和 Rules 分离。
- Prototype、Instance、Variant 和 Composition Layer 负责复用与确定性覆盖；WorldChangeSet 负责带基线哈希的增量修改。
- 逻辑图、渲染图和物理图分离。
- 人物的 Body、Visual、Rig、AnimationSet 和 Subject 能力分离。
- Action 是语义操作，不只是 Clip；AnimationBinding 只负责表现。
- 装备槽、Rig Socket 和世界 Anchor 分离；武器和坐骑等独立对象通过 Relationship 组合。
- 同一 Semantic Action 根据装备、姿态和移动模式解析确定的 Action Variant，避免为组合状态复制动作类型。
- Action Runtime 使用权威 Tick Timeline 和 Channel Lock；动画 Marker 只负责表现同步。
- Camera 是独立 View RuntimeEntity；CameraRigProfile 使用判别 Union 表达第一人称、第三人称、俯视、环绕和过场视角，Camera Director 根据 Session 首选与已提交 Gameplay Context 切换。
- 第一人称与第三人称共享同一主体、装备和语义身份；View Model、遮挡淡化、Head Bob 和镜头插值只属于 Presentation。
- Babylon 是第一版默认 Web Runtime；公共协议不包含 Babylon 类型。
- 物理通过 Port 隔离，第一版默认 Havok。
- Agent 使用 Placement Constraint 描述空间意图；确定性 Layout Solver 输出最终 Transform、Provenance 和 LayoutSolveReport，Gameplay Relationship 保持独立。
- WorldPackage、Simulation Take、Runtime Session、Control Capture Bundle 和生成视频分层，模型专属逻辑只在 Adapter。
- SDK 提供 TypeScript API、CLI、WorldPackage、Simulation Take、Control Capture Bundle、Browser Protocol 和 Playwright Driver。
- 生产验收使用版本化 ValidationProfile 和量化 ValidationReport；必需 Gate 一票否决。
- Capability 通过两阶段事务安装/移除并由 Ownership Ledger 管理；Package Hash 与签名使用版本化 Canonical Bytes。
- 先在同一 Monorepo 并行建设新 Runtime，再移除旧 Three Runtime。

这套设计兼容业界常见游戏引擎概念，同时针对 AI 做了明确的 Schema、发现、规范化、诊断、编译和自动验收增强。它避免纯节点树和纯底层 ECS 两个极端，让 AI 使用可理解的大积木，让 SDK 内部保持可组合的小积木。
