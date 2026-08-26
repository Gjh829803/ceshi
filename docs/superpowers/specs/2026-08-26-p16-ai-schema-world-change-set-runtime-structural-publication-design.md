# P1.6 AI Schema、WorldChangeSet 与 Runtime Structural Publication 设计

## 1. 文档状态

- 状态：**Detailed design；implementation not started**。
- 日期：2026-08-26。
- 适用里程碑：P1.6 AI Schema Profile、受控覆盖与 WorldChangeSet。
- 当前实现基线：`main@1a3d9ea`；Authoring V4 → Normalized IR V4 → ExecutionPlan V5、
  最小 WorldPackage Manifest/Build Receipt、Gameplay RuntimeHost/WorldSession、Browser Protocol V5
  和 `mountedOn.stand-ground@1` 已在主干。
- 初次设计冻结：`main@0cc386c`；本轮 post-freeze hardening 只收紧公共合同，不改变
  implementation not started 的能力状态。
- 上位权威：
  - [AI-first LEGO 游戏 SDK 总体设计](./2026-08-17-ai-first-lego-game-sdk-design.md) §7.5、§16.4–16.5；
  - [Control Feel、Physics Medium 与 State Resolver](./2026-08-21-control-feel-physics-medium-state-resolver-design.md)；
  - [Canonical Runtime State 与 Semantic Projection](./2026-08-22-canonical-runtime-state-and-semantic-projection-design.md)；
  - [World Validation Report 与质量门禁](./2026-08-19-world-validation-report-and-quality-gates-design.md)；
  - [SDK 重构进度与 Backlog](../../18-refactor-progress-and-backlog.md) P1.4、P1.6、M9。

本文是 P1.6 的专项实施权威。它把总体设计中的架构级语义收敛为当前 Authoring V4、
WorldPackage 和 RuntimeHost 可以实施的公共合同。本文不表示 P1.6 已实现，也不把未通过
Conformance 的能力标记为生产可用。

## 2. Outcome 与决策摘要

P1.6 建立一个独立、受信的 **Authoring/Edit 控制面**。AI、CLI 或 Studio 可以在获得明确
Scope 后查询能力、得到小而稳定的 Schema、提交领域化结构修改、Dry Run、读取 Receipt，
并请求 Host 把通过完整 Gate 的新世界发布到正在运行的页面。

```text
Host-selected Authoring/Edit Session
  ├── AI Schema Projector
  │     Canonical Schema + Registry Lock + Capability Set + Budget
  │       → provider-neutral AI Schema Projection + Registry Search
  │
  └── WorldChangeSet Request
        → immutable ChangeSet identity
        → base hash / scope / precondition checks
        → isolated Authoring candidate
        → full validate / normalize / solve / compile / package / gates
        → Dry Run Receipt
        └── explicit Apply
              → prepared Replacement Runtime
              → World Ready
              → durable publication barrier + RuntimeHost CAS
              → atomic Full Reload publication
              → committed WorldChangeReceipt
```

冻结以下决定：

1. **只有一个 Canonical Authoring 方言。** AI Schema 是 Canonical Schema 的可追踪投影；
   Provider Adapter 不能改字段名、创造同义字段或绕过 Canonical Validation。
2. **Runtime State 与 World Structure 是两条写入面。** 移动、Action、骑乘、控制权和相机
   View State 继续走固定 Tick Gameplay/View 协议；增删主体、房屋、障碍、资源、地形、
   初始 Relationship 或 Constraint 只走 `WorldChangeSet`。
3. **P1.6 新建 `@whitebox-world/authoring-edit` 领域包。** 它拥有 AI Schema Projection、
   Override Policy、WorldChangeSet、Precondition、Candidate Diff 和 Receipt 的纯合同；不拥有
   文件系统、Browser、Runtime Adapter、Compiler 或 Host 权限。
4. **首条生产切片只实现 Full Reload。** Candidate 在隔离环境完成完整 Build 与 Gate，
   Replacement Runtime Ready 后才进入提交屏障；失败时旧 World 与旧 Runtime 继续运行。
5. **Incremental Hot Apply 是第二条高风险切片。** 本文冻结分类、Handler、回滚和全量等价性
   合同，但首条实现不注册任何 Hot Apply Handler；所有 Apply 稳定选择 Full Reload。
6. **调用方只表达目标，不选择安全级别。** 调用方可以请求 `authoring-only` 或
   `publish-runtime`，但不能自报某次修改可热更新。实际发布模式由 Host 根据 Operation、
   Handler、Policy、预算和 Gate 决定，并写入 Receipt。
7. **现有 Browser Protocol V5 保持精确 39-key Runtime 面。** Authoring/Edit Browser API
   是单独的受信控制面，不安装到普通 playable 的 `window.__WORLDKIT__`。
8. **结构写入有两个不可混用的身份。** `WorldChangeSet.id` 是不可变修改内容身份；
   `WorldChangeRequest.id` 是一次 Validate/Dry Run/Apply 的幂等请求身份。相同 ChangeSet 可以
   先 Dry Run、后 Apply，但必须使用不同 Request ID。
9. **Request 终态由 mode 决定。** Validate、Dry Run 与 Apply 各自产生不可继续升级的终态；
   transport disconnect、调用方超时或 AbortSignal 只停止等待，不取消已经进入 durable journal
   的工作。调用方必须按原 Request ID 查询结果，不能用第二个 Apply 猜测第一次是否成功。
10. **Prepared Candidate 是有期限、无权限含义的 Host lease。** 它绑定 World、ChangeSet/Base、
    secret-free Edit Policy、Registry/Compiler/Gate identities；持有 opaque ref 不授予 Apply
    Scope。Authoring/Edit 工作量和 Candidate 留存都受 Host-selected budget 约束。

## 3. 当前基线与明确缺口

### 3.1 已经存在的可复用底座

| 当前能力 | P1.6 复用方式 | 禁止重复实现 |
| --- | --- | --- |
| Authoring V4 严格解析、无重复键和关闭 Schema | ChangeSet Candidate 最终重新进入同一 Validator | ChangeSet 私有宽松 Schema |
| `canonical-json-jcs@1` 与 SHA-256 | Authoring、ChangeSet、Projection、Receipt 使用同一 Canonical Bytes 实现 | 每个包自写近似 Hash |
| Normalizer、Layout Solver、Compiler 与资源 Lock | Dry Run/Apply 调用完整可信管线 | ChangeSet 自行推断 IR 或 Plan |
| 最小 WorldPackage Manifest/Build Receipt | Candidate Build 绑定 Authoring/IR/Plan/Resource hashes | Runtime 直接加载裸 AuthoringSpec |
| Validation/Route/Capture Gates | Host 按声明的 Validation Profile 运行 Required Gates | `safe: true` 绕过 Gate |
| RuntimeHost 两阶段 World replacement | Full Reload 复用 concurrent-residency preflight、Candidate Ready、单一 Host owner | Authoring/Edit 直接改 Babylon Scene |
| RuntimeSession/WorldSession、Gameplay Receipt/Event/Snapshot | Runtime 发布绑定旧/新 Session 身份并列出状态处置 | ChangeReceipt 冒充 Gameplay Receipt |
| Browser Protocol V5 exact-key contract | Runtime State 保持原协议 | 把结构写入塞进 `executeGameplayCommand` |
| Registry Subject/Capability/Profile 及 AI Metadata | Projector 枚举 Host 允许且锁定的能力 | Provider 枚举或自由字符串成为真相 |

### 3.2 仍缺少的合同

- 没有版本化 AI Schema Projection artifact、规模预算、降级 Receipt 或 Provider round-trip
  Conformance；
- `allowedOverridePaths` 仍是 Subject Registry 内的首切片硬编码集合，不是 Definition、
  AI Profile 和 Host Policy 可共同收窄的公共合同；
- 仓库没有 `WorldChangeSet`、`WorldChangeRequest`、`WorldChangeReceipt`、领域 Operation、
  Precondition、纯 Candidate Applier 或持久幂等 Journal；
- 当前 `authoringSpecHash` 基于 Normalize 后的 Canonical Authoring Identity，而总体设计的
  `baseAuthoringSpecHash` 要求绑定已通过 Canonical Schema 的原始 AuthoringSpec 内容；两种
  语义尚未 clean break 对齐；
- WorldPackage 完整目录、Registry Lock 发布格式、签名、License 和 Host Compatibility 仍属
  P1.4 未完成项；P1.6 Runtime Publication 不能绕过这些缺口；
- 当前 `RuntimeHost.replaceWorld()` 没有 Request ID、期望 Runtime/WorldSession/Package CAS、
  显式 publication barrier 或可查询的结构发布 Receipt；
- 现有 RuntimeHost 在新世界已交换后若旧 WorldSession Dispose 失败，会把调用整体抛成失败；
  P1.6 必须区分不可逆 Commit 与 Commit 后 Cleanup Diagnostic，避免“已换世界但 Receipt 说失败”；
- Browser/CLI 没有独立 Authoring/Edit Session 与 Scope，普通页面脚本也没有结构写入权限模型。

## 4. 目标与非目标

### 4.1 目标

- 让普通 Agent 使用受限、能力感知、Provider-neutral 的 Canonical Schema 子集；
- 让高级 Agent 只能在 Definition 明确开放、AI Profile 允许、Host Policy 批准且 Registry
  Lock 已固定的路径上覆盖；
- 用稳定 ID 的领域 Operation 修改 AuthoringSpec，不使用数组下标驱动的生产 JSON Patch；
- 为冲突、Dry Run、Apply、幂等重试、失败恢复、Diff、Explain 和审计冻结机器可读协议；
- 让运行中的世界可以通过 Replacement Runtime 做原子 Full Reload；
- 让最终 AuthoringSpec、Normalized IR、ExecutionPlan 和 WorldPackage 与完整 Build 结果唯一；
- 为后续 Incremental Hot Apply 冻结不会产生第二套世界的等价性边界。

### 4.2 非目标

- 不实现任意 DOM、Babylon `Scene`、Havok World 或 Runtime 内部 Map 修改；
- 不把 Runtime Spawn、NPC 行为、网络复制、动态刚体、地形局部物理 Patch 或插件热加载
  伪装成已交付能力；
- 不在 P1.6 首切片保留人物 Transform、Velocity、Action、Relationship、Controller Binding、
  Camera Pose、Tick 或临时资源；
- 不让 Agent 直接填写 Collider、Socket、Provider Handle、控制器实现参数、Profile 数字袋或
  Registry Hash；
- 不为当前未发布私有协议保留 `WorldPatch`、`patch`、`execute`、`changeSetId` 根字段等永久
  Alias；
- 不在首切片实现 Incremental Compiler 或 Runtime Hot Apply Handler；
- 不在 V1 增加公共 Cancel Request；请求接受后的客户端断开只影响等待，不改变 durable
  request state。未来若需要取消，必须使用独立、版本化、带明确 commit-point 语义的协议；
- 不把 P1.4 WorldPackage/Registry Lock、P2.4 Camera View Preference、P2.5 Surface/Medium 或
  P2.6 Hybrid Topology 的未完成设计吸收到 P1.6。

## 5. 方案选择

### 5.1 采用：一份权威规格、独立 Authoring/Edit 领域包、分阶段 Host 接线

AI Schema、Override、ChangeSet 和 Runtime Publication 共用 Canonical 字段、Hash、权限和
Receipt 因果链，必须在一份规格中冻结；实现仍拆成纯领域包、Trusted Host pipeline、
RuntimeHost publication 和 Browser/CLI adapter。这样可以独立验证每一层，又不会形成三套
相似协议。

### 5.2 不采用：只先实现 `WorldChangeSet` 类型

如果没有 AI Schema、Registry Search、Override Policy 和权限面，Agent 仍会被迫读取完整
Schema、猜 Registry Ref，并通过 Adapter 或自由 Patch 绕过 Canonical Validation。类型存在
不等于受控写入链闭合。

### 5.3 不采用：把结构修改做成 Gameplay Command

Gameplay Command 以现有 WorldSession、固定 Tick 状态和已加载 Entity 为边界；结构修改会
改变 AuthoringSpec、Registry Lock、IR、ExecutionPlan、Package 和 Runtime Instance。共用
`executeGameplayCommand` 会混淆权限、幂等、回滚、Hash 和生命周期。

### 5.4 不采用：先实现局部 Runtime Hot Patch

局部热改需要每种 Operation/Node Kind 的 Prepare、Commit、Rollback、State Migration 和
Ownership Handler。当前 Full Build、WorldPackage 和 Runtime replacement 已有可信底座，
先做 Full Reload 可以用较小的状态空间证明安全；直接热改会同时引入第二编译语义和第二
Runtime 物化语义。

## 6. 权威、包边界与依赖方向

| 概念 | 唯一权威 Owner | 输入 | 输出 | 明确禁止 |
| --- | --- | --- | --- | --- |
| Canonical Authoring Schema | `@whitebox-world/authoring` | JSON bytes | AuthoringSpec V4 / Diagnostic | Provider 方言 |
| Canonical bytes 与 SHA-256 | `@whitebox-world/protocol` | Canonical JSON value | bytes / explicit hash | 领域语义 |
| AI Schema/Override/ChangeSet 纯合同 | 新 `@whitebox-world/authoring-edit` | Canonical Schema、Registry view、Policy、AuthoringSpec | Projection、Candidate、Diff、Receipt DTO | I/O、权限授予、Compiler、Runtime |
| Registry 内容、版本与 Lock | `@whitebox-world/subject-registry` + P1.4 Registry Lock | admitted resources | exact Ref/Version/Hash closure | Agent 自建资源版本 |
| Normalize/Solve/Compile | 现有 Authoring/Layout/Compiler owners | validated Candidate | IR/Plan/Reports | ChangeSet 专用编译器 |
| WorldPackage | `@whitebox-world/world-package` | build closure + artifacts | immutable Package + Build Receipt | Runtime Handle |
| Required Gate | `@whitebox-world/validation` + trusted runners | Package/Plan/Profile | Validation Reports | 自动改 Authoring 真相 |
| Edit Session、Journal 与 revision head | Trusted Host adapter | authenticated context + requests | durable request state / current revision | 由 DTO 自我授予 Scope |
| Runtime replacement 与 WorldSession | `@whitebox-world/runtime-host` | verified RuntimeWorldConfiguration + CAS envelope | new WorldSession publication | 解析 ChangeSet、运行 Compiler |
| Babylon 物化 | `@whitebox-world/runtime-babylon` | ExecutionPlan/Package | provider resources / World Ready | Authoring 写入 |
| Runtime Browser API | Browser Protocol V5 | Gameplay/View requests | Runtime Receipt/Snapshot | 结构写入 |
| Authoring/Edit Browser API | Trusted Studio shell/Host bridge | scoped Authoring/Edit requests | Projection/Receipt/Explain | 安装到普通 playable window |

目标依赖方向：

```text
authoring-edit ──→ authoring ──→ subject-registry ──→ protocol
authoring-edit ──→ protocol

trusted host pipeline ──→ authoring-edit
trusted host pipeline ──→ authoring / layout-solver / compiler / world-package / validation
trusted host pipeline ──→ runtime-host

runtime-host ──→ runtime-contracts / gameplay / world-package
runtime-babylon ──→ runtime-contracts / world-package
```

`authoring-edit` 不得依赖 `runtime-host`、`runtime-babylon`、apps、scripts 或文件系统。
`runtime-host` 不得依赖 `authoring-edit`、`authoring`、`compiler` 或 Validation Runner。

## 7. Canonical 身份与 Hash clean break

### 7.1 `baseAuthoringSpecHash`

`baseAuthoringSpecHash` 只表示当前待修改 AuthoringSpec 文档内容：

```text
parse JSON without comments/trailing commas/duplicate keys
  → reject unsupported canonical JSON values
  → validate declared Canonical Authoring Schema version
  → canonical-json-jcs@1(authoringSpec)
  → SHA-256
```

它不包含 Version Migration、默认值注入、Registry Resolution、Normalizer、Layout Solver、
Compiler、Gate 或安全修复。数组顺序属于文档内容；即使两份文档最终语义相同，只要 Canonical
Authoring bytes 不同，它们的 `baseAuthoringSpecHash` 就不同。这是乐观并发基线，不是语义
等价性 Hash。

### 7.2 现有 `authoringSpecHash` 的收敛

当前实现使用 Normalize 后的 `canonicalAuthoringIdentityV4(...)` 计算公开
`authoringSpecHash`，其中包含已解析资源并对部分 ID 集合重排。P1.6 实施前必须执行一次
未发布协议 clean break：

- 所有公开 `authoringSpecHash` / `baseAuthoringSpecHash` 统一为 §7.1 的文档内容 Hash；
- Registry/Resource closure 继续由 `registryLockHash` / `resourceLockHash` 表示；
- Normalized 结果由 `normalizedWorldIrHash` 表示；
- Layout 专用输入如需忽略非 Layout 字段，使用明确的 `layoutInputHash`，不得继续借用
  `authoringSpecHash`；
- WorldPackage、ExecutionPlan、Validation、Take、Capture、fixtures 和 examples 必须在同一
  clean break 中同步更新，不保留旧 Hash Alias。

### 7.3 其他 Hash

| 字段 | 精确对象 |
| --- | --- |
| `changeSetHash` | 完整 `WorldChangeSetV1` Canonical bytes |
| `requestHash` | 完整 `WorldChangeRequestV1` Canonical bytes，不含 Host auth context |
| `authoringEditPolicyHash` | Host-selected、secret-free 的 immutable policy projection：World IDs、Registry Lock、Capability Set、Projection Profile、允许 Operation/Override、Required Gate Profiles、资源与工作量预算；不含 token、principal secret 或可变运行状态 |
| `canonicalAuthoringSchemaHash` | 发布的 Authoring JSON Schema artifact bytes |
| `projectionProfileHash` | `AiSchemaProjectionProfileV1` 去掉 `contentHash` 后的 Canonical bytes Hash；其值等于该 Registry resource 的 `contentHash` |
| `aiSchemaProjectionHash` | `AiSchemaProjectionV1` 去掉本字段后的 Canonical bytes |
| `capabilitySetHash` | 按 `resourceRef` 排序的 Host-allowed capability refs |
| `registryLockHash` | P1.4 冻结的完整 Registry Lock |
| `RegistrySearchResultV1.contentHash` | 结果行所指 Registry resource 由其 Owner 计算并被 Registry Lock 绑定的 Canonical content Hash |
| `normalizedWorldIrHash` | 完整 NormalizedWorldIR Canonical bytes |
| `executionPlanHash` | 完整 ExecutionPlan Canonical bytes |
| `worldPackageRootHash` | P1.4 WorldPackage Root |

禁止使用未定义对象的 `worldHash`、`contentHash` 或 `baseHash` 代替上述字段。

## 8. AI Schema Profile、Projection 与 Registry Search

Registry Search 和 Projection metadata 使用当前 Registry Schema 关闭的 Resource Kind，不接受
自由字符串：

```ts
type RegistryResourceKindV1 =
  | "subject-definition"
  | "subject-asset"
  | "capability"
  | "rig-profile"
  | "animation-set"
  | "collider-profile"
  | "collider-derivation-profile"
  | "physics-body-profile"
  | "locomotion-profile"
  | "control-feel-profile"
  | "control-profile"
  | "motion-profile"
  | "motion-kernel"
  | "medium-profile"
  | "camera-rig-algorithm"
  | "camera-rig-profile"
  | "camera-modifier-profile"
  | "camera-context-profile"
  | "relationship-profile"
  | "harness-profile"
  | "pose-set-profile"
  | "render-binding-profile"
  | "ai-schema-projection-profile"
  | "traversal-surface-profile";
```

`ai-schema-projection-profile` 是 P1.6 新增的唯一 Registry Resource Kind；P16-S1 必须把它与
Profile parser、Registry Lock、Search/Projection Schema 一起交付。后续新增 Kind 也必须升级
对应 Registry/Projection Schema；不能让 `string` 兜底把未知资源偷偷送给 Agent。

### 8.1 Provider-neutral Projection Profile

第一版冻结 Registry 资源
`worldkit://ai-schema-projection-profile/constrained-json@1`。Profile 描述投影能力和规模上限，
不包含 OpenAI、Anthropic、Gemini 或其他 Provider 名称：

```ts
interface AiSchemaProjectionProfileV1 {
  readonly kind: "ai-schema-projection-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly maximumPropertyCount: number;
  readonly maximumNestingDepth: number;
  readonly maximumEnumValueCount: number;
  readonly maximumSchemaBytes: number;
  readonly maximumRegistrySearchResultCount: number;
  readonly optionalFieldMode:
    | "native-optional"
    | "required-nullable-with-round-trip-map";
  readonly contentHash: `sha256:${string}`;
}
```

`aiSchemaProjectionHash` 使用 `Omit<AiSchemaProjectionV1,
"aiSchemaProjectionHash">` 的 Canonical bytes，避免自引用 Hash。

映射和 Registry Search row 也使用关闭对象：

```ts
interface AiSchemaCanonicalPathMappingV1 {
  readonly id: string;
  readonly mode: "identity" | "null-to-omitted" | "presence-wrapper";
  readonly projectionInstancePath: string;
  readonly canonicalInstancePath: string;
}

interface RegistrySearchResultV1 {
  readonly resourceRef: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly version: number;
  readonly contentHash: `sha256:${string}`;
  readonly authoringAvailability:
    | "recommended"
    | "advanced"
    | "experimental";
  readonly requiredCapabilityRefs: readonly string[];
  readonly aiMetadata: Readonly<{
    displayName: string;
    description: string;
    semanticTags: readonly string[];
    usageExamples?: readonly string[];
  }>;
}
```

Provider Adapter 可以选择一个更小的预算，但不能放宽 Host-selected Profile，不能改 Canonical
字段名，也不能把不支持的 Canonical 语义猜测成近似结构。

### 8.2 Projection Request 与 artifact

调用方只请求 Host 已批准的 Profile；Registry Lock、Capability Set 和预算由 Edit Session
Policy 提供，不从请求中的自由数组获取：

```ts
interface AiSchemaProjectionRequestV1 {
  readonly kind: "worldkit-ai-schema-projection-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly projectionProfileRef: string;
  readonly authoringSchemaVersion: 4;
}

interface AiSchemaProjectionV1 {
  readonly kind: "worldkit-ai-schema-projection";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly projectionProfileRef: string;
  readonly projectionProfileHash: `sha256:${string}`;
  readonly authoringSchemaVersion: 4;
  readonly canonicalAuthoringSchemaHash: `sha256:${string}`;
  readonly registryLockHash: `sha256:${string}`;
  readonly capabilitySetHash: `sha256:${string}`;
  readonly jsonSchemaDraft: "2020-12";
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly jsonSchemaHash: `sha256:${string}`;
  readonly allowedWorldChangeOperationTypes: readonly WorldChangeOperationTypeV1[];
  readonly canonicalPathMappings: readonly AiSchemaCanonicalPathMappingV1[];
  readonly degradations: readonly AiSchemaProjectionDegradationV1[];
  readonly aiSchemaProjectionHash: `sha256:${string}`;
}
```

`canonicalPathMappings` 只描述 Projection 与 Canonical JSON Pointer 的可逆映射。它不能引入
别名。若 Profile 要求 `required + nullable`，Projector 必须记录 `null → omitted` 的精确恢复
规则；当 Canonical Schema 同时允许 omitted 与显式 `null` 而 Profile 无法无损表达时，返回
`AI_SCHEMA_PROFILE_UNREPRESENTABLE`，不能折叠两个状态。

### 8.3 Capability-aware 裁剪

Projector 的有效输入集合是：

```text
Canonical Authoring Schema
  ∩ Registry Lock 中存在的资源
  ∩ Edit Session 允许的 Capability Set
  ∩ 当前 Runtime/Compiler production admission
  ∩ Projection Profile 预算
```

- 未安装、未锁定、`reserved`、无当前 Compiler/Runtime closure 或被 Session Policy 禁止的分支
  不得出现在可选 Schema 中；
- 裁剪只减少分支，不能改变保留字段的名称、单位、判别值或验证语义；
- `experimental` 是否显示由 Host Policy 决定，并必须在 Projection metadata 中可解释；
- Provider 输出必须重新通过完整 Canonical Schema、Registry、Solver、Compiler 和 Gate。

### 8.4 预算降级

Registry enum 超出预算时，Projector 把该位置降级为同一 Canonical Resource Ref 字段的
`format`/`pattern` 约束，并记录：

```ts
interface AiSchemaProjectionDegradationV1 {
  readonly id: string;
  readonly type: "registry-enum-to-resource-ref";
  readonly canonicalInstancePath: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly reason:
    | "property-count-budget"
    | "nesting-depth-budget"
    | "enum-value-count-budget"
    | "schema-bytes-budget";
}
```

降级后 Agent 使用 Registry Search；Adapter 不允许改成 Provider tool 名或自由自然语言值。

### 8.5 Registry Search

Registry Search 始终绑定一个精确 `registryLockHash`，结果按 `resourceRef` 排序，并只返回该
Lock 和 Edit Session Capability Set 内的资源：

```ts
interface RegistrySearchRequestV1 {
  readonly kind: "worldkit-registry-search-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly registryLockHash: `sha256:${string}`;
  readonly resourceKind: RegistryResourceKindV1;
  readonly semanticTagsAll?: readonly string[];
  readonly afterResourceRef?: string;
  readonly maximumResultCount: number;
}

interface RegistrySearchReceiptV1 {
  readonly kind: "worldkit-registry-search-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly registryLockHash: `sha256:${string}`;
  readonly results: readonly RegistrySearchResultV1[];
  readonly nextAfterResourceRef?: string;
  readonly registrySearchResultHash: `sha256:${string}`;
}
```

结果只包含 Canonical `resourceRef`、`kind`、`version`、`contentHash`、AI Metadata 和明确的
availability/capability summary；不返回 Provider payload、实现 Handle、任意代码或未锁资源。

## 9. `allowedOverridePaths` 与高级覆盖

### 9.1 单一最大权限与逐层收窄

Definition 是某个实例可覆盖路径的唯一最大权限 Owner：

```text
effective override paths
  = Definition.allowedOverridePaths
  ∩ AI Schema Projection allowed paths
  ∩ Host Session Policy allowed paths
```

Projection 与 Host 只能收窄，不能放宽 Definition。Registry Lock 必须覆盖
`allowedOverridePaths` 的内容 Hash，避免同一 Definition Ref 在不同运行中开放不同权限。

### 9.2 Path grammar

V1 `allowedOverridePaths` 是按字典序排序、无重复的 Canonical field path；只允许由
`.` 分隔的对象属性名：

```text
^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$
```

V1 禁止数组下标、`*`、`**`、JSON Pointer、相对路径、Provider 路径和动态 Map key。
集合修改必须使用稳定 ID 的领域 Operation。

### 9.3 第一批覆盖

第一批 Definition 最大只允许：

- `profiles.controlFeelProfileRef`；
- `profiles.controlProfileRef`；
- `profiles.motion.defaultMotionProfileRef`。

覆盖值必须是 Registry Lock 中的精确 Resource Ref，并通过 Capability、Body、Medium、
Runtime Status 和 Definition-specific compatibility。`allowedOverridePaths` 只授权“可以尝试”，
不替代值 Schema、Registry Admission 或 Host Policy。

禁止覆盖：`id`、`kind`、`schemaVersion`、`version`、`resourceRef`、任何 Hash、权限、Provider、
Capability 实现、Collider/Socket 内部、Bone path、控制 Session、Runtime Handle、
`parameters.*` 数字袋和 Medium support truth。

### 9.4 Canonical Override value

V1 只冻结 Resource Ref 覆盖，避免开放任意 JSON value：

```ts
interface DefinitionResourceRefOverrideV1 {
  readonly id: string;
  readonly kind: "resource-ref";
  readonly path: string;
  readonly resourceRef: string;
}
```

Authoring V4 在具有 Definition Ref 的实例上使用 `overrides` 稳定 ID 集。当前首个消费者是
Subject node；后续 Definition kind 复用同一 Override validator，而不是复制 Subject-only
校验器。新增数字、枚举或结构覆盖必须扩展关闭的 `kind` union 并升级相应 Schema，不能把
`resourceRef` 退化为 `value: unknown`。

## 10. WorldChangeSet、Request 与 Receipt

### 10.1 WorldChangeSet 身份

公共根对象遵守“当前对象使用 `id`”规则；总体设计中的概念字段 `changeSetId` 在本专项中
冻结为 `id`，只有引用 ChangeSet 的对象使用 `changeSetId`：

```ts
interface WorldChangeSetV1 {
  readonly kind: "worldkit-world-change-set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly baseAuthoringSpecHash: `sha256:${string}`;
  readonly preconditions: readonly WorldPreconditionV1[];
  readonly operations: readonly WorldChangeOperationV1[];
  readonly provenance?: WorldChangeProvenanceV1;
}

interface WorldChangeProvenanceV1 {
  readonly sourceType: "user" | "agent" | "validator";
  readonly sourceId?: string;
  readonly sourceArtifactRefs?: readonly string[];
}
```

规则：

- ChangeSet `id` 在同一 World revision history 中标识不可变内容；相同 ID 携带不同
  `changeSetHash` 返回 `WORLD_CHANGE_SET_ID_CONFLICT`；
- Precondition ID 和 Operation ID 在 ChangeSet 内唯一；
- Preconditions、Operations 保留声明顺序用于 Explain，但 V1 禁止对同一 Target 进行两次
  非交换写入，因此最终结果不能依赖“最后一条赢”；
- Provenance 可记录 Agent/User/Validator 来源，但不授予权限，也不能改变应用语义。

### 10.2 Request 身份与模式

```ts
type WorldChangeRequestV1 =
  | WorldChangeValidateRequestV1
  | WorldChangeDryRunRequestV1
  | WorldChangeApplyRequestV1;

interface WorldChangeRequestBaseV1 {
  readonly kind: "worldkit-world-change-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly worldId: string;
  readonly changeSet: WorldChangeSetV1;
}

interface WorldChangeValidateRequestV1 extends WorldChangeRequestBaseV1 {
  readonly mode: "validate";
}

interface WorldChangeDryRunRequestV1 extends WorldChangeRequestBaseV1 {
  readonly mode: "dry-run";
}

type WorldChangeApplyRequestV1 =
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "authoring-only";
      preparedCandidateRef?: string;
      runtimeExpectation?: never;
    }>)
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "publish-runtime";
      preparedCandidateRef?: string;
      runtimeExpectation: RuntimePublicationExpectationV1;
    }>);
```

- `validate` 只校验 ChangeSet Schema、Base Hash 形状、Operation 合法性和静态冲突，不运行
  Normalize/Compile；
- `dry-run` 运行完整 Candidate Build/Gates，但不更新 revision head、不创建 Runtime；
- `apply` 必须显式提交；文件 CLI 还必须带 `--write`，且从不原地覆盖输入；
- `publish-runtime` 必须提供 `runtimeExpectation`，并要求额外 Scope；
- `authoring-only` 只允许文件模式或没有 active Runtime binding 的 Hosted workspace。绑定正在
  运行 WorldSession 的 Edit Session 必须先保持 Dry Run Candidate，批准后使用新的 Apply
  Request ID 请求 `publish-runtime`；Host 不允许 Authoring revision head 与 active Runtime head
  静默分叉；
- `preparedCandidateRef` 只能引用 Host 自己保存的 immutable Dry Run Candidate。该 ref 必须
  opaque、不可枚举，绑定 `worldId`、`authoringEditSessionId`、`authoringEditPolicyHash`、
  ChangeSet/Base/Registry/Compiler/Validation hashes 和到期时间；持有 ref 不授予任何 Scope；
- Host 必须在 Apply admission 和 Commit 前复验全部 Candidate binding。不存在或过期返回
  `WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED`；绑定 Hash/Policy 漂移返回
  `WORLD_CHANGE_PREPARED_CANDIDATE_STALE`，不能静默重建或复用过期产物；
- 不提供 `cancel` mode。调用方断开、AbortSignal 或等待超时不改变 durable Request；只能按
  原 Request ID 查询 terminal Receipt。

### 10.3 Receipt closed union

```ts
type WorldChangeReceiptV1 =
  | WorldChangeValidatedReceiptV1
  | WorldChangeDryRunSucceededReceiptV1
  | WorldChangeCommittedReceiptV1
  | WorldChangeRejectedReceiptV1;

type WorldChangeDiagnosticCodeV1 =
  | "AI_SCHEMA_PROFILE_NOT_ALLOWED"
  | "AI_SCHEMA_PROFILE_UNREPRESENTABLE"
  | "AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED"
  | "REGISTRY_SEARCH_LOCK_MISMATCH"
  | "DEFINITION_OVERRIDE_PATH_FORBIDDEN"
  | "DEFINITION_OVERRIDE_VALUE_INVALID"
  | "WORLD_CHANGE_SET_SCHEMA_INVALID"
  | "WORLD_CHANGE_SET_ID_CONFLICT"
  | "WORLD_CHANGE_REQUEST_ID_CONFLICT"
  | "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED"
  | "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH"
  | "WORLD_CHANGE_PRECONDITION_FAILED"
  | "WORLD_CHANGE_TARGET_CONFLICT"
  | "WORLD_CHANGE_REFERENCE_DANGLING"
  | "WORLD_CHANGE_CANDIDATE_INVALID"
  | "WORLD_CHANGE_REQUIRED_GATE_FAILED"
  | "WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED"
  | "WORLD_CHANGE_PREPARED_CANDIDATE_STALE"
  | "WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED"
  | "WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED"
  | "WORLD_CHANGE_RUNTIME_EXPECTATION_STALE"
  | "WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED"
  | "WORLD_CHANGE_RUNTIME_CAPACITY_EXCEEDED"
  | "WORLD_CHANGE_RUNTIME_PREPARE_FAILED"
  | "WORLD_CHANGE_PUBLICATION_CONFLICT"
  | "WORLD_CHANGE_CLEANUP_INCOMPLETE"
  | "WORLD_CHANGE_CLEANUP_QUARANTINED";

type AuthoringEditBudgetIdV1 =
  | "change-set-bytes"
  | "precondition-count"
  | "operation-count"
  | "concurrent-non-terminal-request-count"
  | "prepared-candidate-count"
  | "prepared-candidate-bytes"
  | "prepared-candidate-retention-milliseconds";

type WorldChangeDiagnosticDetailsV1 =
  | Readonly<{
      kind: "related-ids";
      ids: readonly string[];
    }>
  | Readonly<{
      kind: "hash-mismatch";
      expectedHash: `sha256:${string}`;
      actualHash: `sha256:${string}`;
    }>
  | Readonly<{
      kind: "target-conflict";
      targets: readonly WorldChangeTargetV1[];
    }>
  | Readonly<{
      kind: "admission-budget";
      budgetId: AuthoringEditBudgetIdV1;
      limit: number;
      actual: number;
    }>;

interface WorldChangeReceiptBaseV1 {
  readonly kind: "worldkit-world-change-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly requestHash: `sha256:${string}`;
  readonly authoringEditSessionId: string;
  readonly authoringEditPolicyHash: `sha256:${string}`;
  readonly worldId: string;
  readonly changeSetId: string;
  readonly changeSetHash: `sha256:${string}`;
  readonly baseAuthoringSpecHash: `sha256:${string}`;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
}

interface WorldChangeDiagnosticV1 {
  readonly severity: "info" | "warning" | "error";
  readonly code: WorldChangeDiagnosticCodeV1;
  readonly instancePath: string;
  readonly message: string;
  readonly details?: WorldChangeDiagnosticDetailsV1;
}

interface WorldChangeBuildIdentityV1 {
  readonly resultAuthoringSpecHash: `sha256:${string}`;
  readonly registryLockHash: `sha256:${string}`;
  readonly normalizedWorldIrHash: `sha256:${string}`;
  readonly executionPlanHash: `sha256:${string}`;
  readonly worldPackageRootHash: `sha256:${string}`;
}

interface WorldChangeAffectedIdsV1 {
  readonly resourceIds: readonly string[];
  readonly nodeEntityIds: readonly string[];
  readonly relationshipIds: readonly string[];
  readonly spatialFeatureIds: readonly string[];
  readonly constraintIds: readonly string[];
  readonly overrideIds: readonly string[];
}

interface WorldChangeOperationResultV1 {
  readonly operationId: string;
  readonly operationType: WorldChangeOperationTypeV1;
  readonly target: WorldChangeTargetV1;
  readonly status: "applied";
  readonly previousTargetHash?: `sha256:${string}`;
  readonly currentTargetHash?: `sha256:${string}`;
}

interface WorldChangeValidationReportBindingV1 {
  readonly validationReportRef: string;
  readonly validationReportHash: `sha256:${string}`;
  readonly status: "passed";
}

interface WorldChangeAppliedTransformationV1 {
  readonly id: string;
  readonly type: "schema-migration" | "safety-fix";
  readonly transformationRef: string;
  readonly previousAuthoringSpecHash: `sha256:${string}`;
  readonly currentAuthoringSpecHash: `sha256:${string}`;
}

interface RuntimePublicationIdentityV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly simulationTick: number;
}

type RuntimeStateKindV1 =
  | "world-package"
  | "world-session"
  | "simulation-tick"
  | "entity-transform"
  | "entity-velocity"
  | "active-action"
  | "controller-binding"
  | "relationship-state"
  | "camera-view"
  | "runtime-activity"
  | "temporary-resource"
  | "host-view-preference";

type RuntimeStateEffectReasonCodeV1 =
  | "new-world-package"
  | "new-world-session"
  | "full-reload-tick-zero"
  | "runtime-state-not-transferred"
  | "new-package-bootstrap"
  | "explicit-host-input"
  | "incremental-state-unaffected"
  | "incremental-target-replaced"
  | "incremental-target-removed";

type RuntimeStateEffectScopeV1 =
  | Readonly<{ kind: "entity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "relationship-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "controller-entity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "runtime-activity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "temporary-resource-ids"; ids: readonly string[] }>;

interface RuntimeStateEffectExceptionV1 {
  readonly id: string;
  readonly scope: RuntimeStateEffectScopeV1;
  readonly disposition: "preserved" | "reset" | "replaced";
  readonly reasonCode: RuntimeStateEffectReasonCodeV1;
}

interface RuntimeStateEffectV1 {
  readonly runtimeStateKind: RuntimeStateKindV1;
  readonly defaultDisposition: "preserved" | "reset" | "replaced";
  readonly defaultReasonCode: RuntimeStateEffectReasonCodeV1;
  readonly exceptions: readonly RuntimeStateEffectExceptionV1[];
}

interface RuntimeCleanupDispositionV1 {
  readonly cleanupOperationId: string;
  readonly type: "replaced-runtime";
  readonly previousWorldSessionId: string;
  readonly statusAtCommit: "scheduled";
}

interface WorldChangeValidatedReceiptV1 extends WorldChangeReceiptBaseV1 {
  readonly status: "validated";
  readonly mode: "validate";
  readonly publicationMode: "none";
}

interface WorldChangeCandidateReceiptBaseV1 extends WorldChangeReceiptBaseV1 {
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
  readonly appliedMigrations: readonly WorldChangeAppliedTransformationV1[];
  readonly appliedSafetyFixes: readonly WorldChangeAppliedTransformationV1[];
}

interface WorldChangeDryRunSucceededReceiptV1
  extends WorldChangeCandidateReceiptBaseV1 {
  readonly status: "succeeded";
  readonly mode: "dry-run";
  readonly publicationMode: "none";
  readonly preparedCandidateRef: string;
  readonly preparedCandidateExpiresAtUnixMilliseconds: number;
}

type WorldChangeCommittedReceiptV1 =
  | (WorldChangeCandidateReceiptBaseV1 & Readonly<{
      status: "committed";
      mode: "apply";
      requestedOutcome: "authoring-only";
      publicationMode: "none";
      committedRevisionRef: string;
    }>)
  | (WorldChangeCandidateReceiptBaseV1 & Readonly<{
      status: "committed";
      mode: "apply";
      requestedOutcome: "publish-runtime";
      publicationMode: "full-reload" | "incremental-hot-apply";
      committedRevisionRef: string;
      previousRuntimeIdentity: RuntimePublicationIdentityV1;
      currentRuntimeIdentity: RuntimePublicationIdentityV1;
      runtimeStateEffects: readonly RuntimeStateEffectV1[];
      runtimeCleanup: RuntimeCleanupDispositionV1;
    }>);

type WorldChangeFailurePhaseV1 =
  | "admission"
  | "authorization"
  | "idempotency"
  | "base-check"
  | "precondition"
  | "candidate-apply"
  | "canonical-validation"
  | "normalize"
  | "solve"
  | "compile"
  | "package"
  | "required-gates"
  | "runtime-preflight"
  | "runtime-prepare"
  | "publication-conflict"
  | "publication-commit";

interface WorldChangeRejectedReceiptV1 extends WorldChangeReceiptBaseV1 {
  readonly status: "rejected";
  readonly mode: "validate" | "dry-run" | "apply";
  readonly failurePhase: WorldChangeFailurePhaseV1;
  readonly currentAuthoringSpecHash?: `sha256:${string}`;
  readonly conflictingIds?: WorldChangeAffectedIdsV1;
}
```

成功 Dry Run/Commit 通过上述 `WorldChangeCandidateReceiptBaseV1` 绑定：

- `resultAuthoringSpecHash`、`registryLockHash`、`normalizedWorldIrHash`、
  `executionPlanHash`、`worldPackageRootHash`；
- `authoringEditPolicyHash`，用于审计并防止 Candidate 在不同 Host Policy 下被静默复用；
- `affectedIds`，按 resource/node/relationship/spatial-feature/constraint/override 分组；
- `operationResults`，每个 Operation 恰好一行并按输入顺序引用；
- `validationReportRefs` 与对应 Hash；
- `appliedMigrations`、`appliedSafetyFixes`。V1 默认都为空；任何非空项必须可重放、可解释，
  禁止隐式修复；
- `publicationMode: "none" | "full-reload" | "incremental-hot-apply"`；
- Runtime 发布成功时的 previous/current Runtime identity 和完整 `runtimeStateEffects`；
- Runtime 发布成功时的 immutable `runtimeCleanup` 只记录 Commit 时已经排入 Ownership queue 的
  cleanup operation；后续状态由独立 Cleanup Report 查询，不能回写 Receipt。

Diagnostic 的 `code` 和 `details.kind` 都是关闭 Union。不得把 Provider error、任意
`Record<string, unknown>` 或自由诊断字段塞入 `details`；无法映射到公开 Diagnostic 的内部错误
必须清洗为最接近的稳定 code，并只在受保护的 Host telemetry 中保留原始信息。

Rejected Receipt 使用关闭的 `failurePhase`：

```text
admission | authorization | idempotency | base-check | precondition |
candidate-apply | canonical-validation | normalize | solve | compile |
package | required-gates | runtime-preflight | runtime-prepare |
publication-conflict | publication-commit
```

Commit 后 Cleanup 失败不是 `publication-commit` 失败。Committed Receipt 在 Commit point
一次性冻结且永不变化；Cleanup 结果和 Diagnostic 写入以 `cleanupOperationId` 为身份的独立
Cleanup Report，并由 Ownership cleanup queue 幂等重试。

Runtime State Effect 规则：

- 每个 `runtimeStateKind` 恰好一行；
- Full Reload 的 `exceptions` 必须为空，使用 world-wide `defaultDisposition`；
- Incremental 的默认值通常是 `preserved`，只为被修改/删除的稳定 ID 写非重叠、排序后的
  scoped exception；同一 state kind 的 exception scope 不得交叉或重复；
- Scope kind 必须与 state kind 相容，例如 `relationship-state` 只能使用
  `relationship-ids`，`controller-binding` 只能使用 `controller-entity-ids`；
- 这样既能完整表达未受影响状态，也不会要求 Receipt 枚举世界中每个未受影响 Entity。

## 11. V1 领域 Operation 与 Target

### 11.1 关闭的 Operation 集合

每个 Operation 使用 `id` 和 `type`。V1 支持当前 Authoring V4 可以完整验证的结构：

```ts
type WorldChangeOperationTypeV1 =
  | "resource-upsert"
  | "resource-remove"
  | "node-upsert"
  | "node-remove"
  | "spatial-feature-upsert"
  | "spatial-feature-remove"
  | "relationship-add"
  | "relationship-remove"
  | "constraint-set"
  | "constraint-remove"
  | "terrain-source-replace"
  | "startup-set"
  | "definition-override-set"
  | "definition-override-remove";

type WorldChangeOperationV1 =
  | Readonly<{
      id: string;
      type: "resource-upsert";
      resourceKind: "prototype";
      prototype: PrimitivePrototypeSpecV4;
    }>
  | Readonly<{
      id: string;
      type: "resource-upsert";
      resourceKind: "subject-definition";
      subjectDefinition: PackageSubjectDefinitionV1;
    }>
  | Readonly<{
      id: string;
      type: "resource-remove";
      resourceKind: PackageLocalResourceKindV1;
      resourceId: string;
    }>
  | Readonly<{
      id: string;
      type: "node-upsert";
      node: WorldNodeSpecV4;
    }>
  | Readonly<{
      id: string;
      type: "node-remove";
      nodeEntityId: string;
    }>
  | (Readonly<{ id: string; type: "spatial-feature-upsert" }> &
      (
        | Readonly<{ spatialFeatureKind: "region"; spatialRegion: SpatialRegionSpecV1 }>
        | Readonly<{ spatialFeatureKind: "route"; route: RouteSpecV1 }>
        | Readonly<{ spatialFeatureKind: "screen-region"; screenRegion: ScreenRegionSpecV1 }>
        | Readonly<{ spatialFeatureKind: "traversal-area"; traversalArea: TraversalAreaSpecV1 }>
      ))
  | Readonly<{
      id: string;
      type: "spatial-feature-remove";
      spatialFeatureKind: SpatialFeatureKindV1;
      spatialFeatureId: string;
    }>
  | Readonly<{
      id: string;
      type: "relationship-add";
      relationship: RelationshipSpecV1;
    }>
  | Readonly<{
      id: string;
      type: "relationship-remove";
      relationshipId: string;
    }>
  | (Readonly<{ id: string; type: "constraint-set" }> &
      (
        | Readonly<{ constraintKind: "placement"; placementConstraint: PlacementConstraintSpecV1 }>
        | Readonly<{ constraintKind: "connectivity"; connectivityConstraint: ConnectivityConstraintSpecV1 }>
      ))
  | Readonly<{
      id: string;
      type: "constraint-remove";
      constraintKind: "placement" | "connectivity";
      constraintId: string;
    }>
  | Readonly<{
      id: string;
      type: "terrain-source-replace";
      terrainEntityId: string;
      terrainSource: ProceduralTerrainSourceSpecV2;
    }>
  | Readonly<{
      id: string;
      type: "startup-set";
      startup: AuthoringSpecV4["startup"];
    }>
  | Readonly<{
      id: string;
      type: "definition-override-set";
      nodeEntityId: string;
      override: DefinitionResourceRefOverrideV1;
    }>
  | Readonly<{
      id: string;
      type: "definition-override-remove";
      nodeEntityId: string;
      overrideId: string;
    }>;
```

关键字段：

| Operation | 稳定目标与 payload | 语义 |
| --- | --- | --- |
| `resource-upsert` | `resourceKind` + 完整 package-local resource | 按 Resource ID 新增或整体替换 Prototype/Subject Definition |
| `resource-remove` | `resourceKind` + `resourceId` | 删除 package-local resource；不级联 |
| `node-upsert` | 完整关闭 Union node | 按 Entity ID 新增或整体替换 node |
| `node-remove` | `nodeEntityId` | 删除 node；不级联 Relationship/Constraint/Startup |
| `spatial-feature-upsert/remove` | `spatialFeatureKind` + stable ID | Region/Route/Screen Region/Traversal Area |
| `relationship-add/remove` | 完整 typed Relationship 或 `relationshipId` | 只修改 Authoring 初始关系，不是 Runtime Relationship Transaction |
| `constraint-set/remove` | `constraintKind` + stable ID | Placement/Connectivity Constraint |
| `terrain-source-replace` | `terrainEntityId` + 完整 Terrain Source | 只替换指定 Terrain node 的 source，不改 Provider geometry |
| `startup-set` | 完整 `startup` | 原子更新 spawn/controlled/camera refs |
| `definition-override-set/remove` | `nodeEntityId` + Override/Override ID | 经过 §9 通用策略更新实例覆盖 |

V1 不发布 `component-set/component-remove`：当前 Authoring V4 没有跨 Node Kind 的统一
Component identity，发布泛化 Component Patch 会形成第二套方言。V1 也不发布
`variant-select`：当前 Canonical Authoring V4 尚未冻结 VariantSet/Instance Variant 合同。
这些概念可以在未来 Authoring Schema 版本中作为新的关闭分支加入，不能由 Adapter 提前实现。

### 11.2 Target 与 Precondition

```ts
type PackageLocalResourceKindV1 = "prototype" | "subject-definition";

type SpatialFeatureKindV1 =
  | "region"
  | "route"
  | "screen-region"
  | "traversal-area";

type WorldChangeTargetV1 =
  | { readonly kind: "resource"; readonly resourceKind: PackageLocalResourceKindV1; readonly resourceId: string }
  | { readonly kind: "node"; readonly nodeEntityId: string }
  | { readonly kind: "spatial-feature"; readonly spatialFeatureKind: SpatialFeatureKindV1; readonly spatialFeatureId: string }
  | { readonly kind: "relationship"; readonly relationshipId: string }
  | { readonly kind: "constraint"; readonly constraintKind: "placement" | "connectivity"; readonly constraintId: string }
  | { readonly kind: "definition-override"; readonly nodeEntityId: string; readonly overrideId: string }
  | { readonly kind: "startup"; readonly worldId: string };

type WorldPreconditionV1 =
  | { readonly id: string; readonly type: "target-exists"; readonly target: WorldChangeTargetV1 }
  | { readonly id: string; readonly type: "target-absent"; readonly target: WorldChangeTargetV1 }
  | {
      readonly id: string;
      readonly type: "target-hash-equals";
      readonly target: WorldChangeTargetV1;
      readonly expectedTargetHash: `sha256:${string}`;
    };
```

- 所有 Precondition 都对同一 immutable Base AuthoringSpec 求值，不读取 staged 操作结果；
- `target-hash-equals` 使用目标 Canonical value bytes，足以表达稳定 CAS；V1 不提供任意字段
  JSON Pointer 条件；
- Preconditions 全部通过后才创建 Candidate；任一失败不应用任何 Operation；
- 删除不级联。调用方必须在同一 ChangeSet 中显式删除或替换所有引用，最终 Canonical
  Validation 负责拒绝悬空引用；
- V1 禁止两个 Operation 写同一 Target，也禁止“remove 后 upsert”依赖顺序；需要替换时使用
  `upsert/set/replace` 的单个领域 Operation；
- Target 冲突使用 Canonical overlap 规则，不只比较 Target JSON 是否相等：同一 Terrain node 的
  `node-upsert` 与 `terrain-source-replace` 冲突，同一 Subject node 的 `node-upsert` 与
  `definition-override-set/remove` 冲突，`startup-set` 内多个字段仍是一个原子 Target。

## 12. Candidate Apply、完整 Build 与 Differential 等价

### 12.1 固定流水线

```text
admit authenticated Edit Session context
  → parse exact Request and ChangeSet
  → compute requestHash and changeSetHash
  → resolve idempotency journal record
  → enforce Authoring/Edit workload budget
  → load immutable Base Authoring revision
  → recompute baseAuthoringSpecHash
  → verify Registry Lock / Capability / Host Policy
  → evaluate all Preconditions against Base
  → reject duplicate/conflicting targets
  → clone Base into isolated Candidate
  → apply domain Operations
  → canonical sort only collections whose Canonical Schema defines ID-set semantics
  → full Authoring V4 validation
  → full normalize / layout solve / compile
  → complete WorldPackage build
  → required Validation / Route / Budget / Integrity gates
  → produce Candidate hashes, Diff and Receipt
```

首条切片即使只改一个 Node，也执行完整 Normalize/Solve/Compile。`affectedIds` 用于 Explain、
Gate 选择和未来优化，不允许跳过当前完整 Build。

### 12.2 Candidate 隔离

- Candidate 使用独立 immutable revision directory/prefix，不修改 Base bytes；
- 输入与 Registry artifacts 禁止 symlink；输出只允许 Host 声明的路径；
- 文件发布使用 sibling temp + atomic rename，绝不原地覆盖 Base；
- Dry Run Candidate 是 Host-owned lease，metadata 绑定 World/Session Policy、ChangeSet/Base、
  Registry/Compiler/Gate identities、字节大小和明确到期时间；
- Dry Run Receipt 永久可查并记录 `preparedCandidateExpiresAtUnixMilliseconds`，但 Candidate bytes
  到期后可以 GC。到期后 Apply 可以不带 ref 重新完整 Build，不能让 Host 以同一 ref 静默重建；
- Candidate ref 不可枚举、不可作为 bearer capability；Apply 仍重新执行 Scope、World、Base、
  Policy 和 Runtime expectation admission；
- Candidate Build 失败只写 Rejected Receipt/diagnostics，不写 result revision head；
- Candidate count/bytes/retention 与同 World 的并发 Build 受 §16.1 Host workload budget 限制。

### 12.3 Differential Test

未来任何 Incremental Compiler 或 Hot Apply 都必须以同一最终 AuthoringSpec 做完整 Build，并
证明：

```text
incremental.resultAuthoringSpecHash == full.resultAuthoringSpecHash
incremental.normalizedWorldIrHash  == full.normalizedWorldIrHash
incremental.executionPlanHash     == full.executionPlanHash
incremental.worldPackageRootHash  == full.worldPackageRootHash
```

Canonical bytes 必须逐字节相同。不能使用“功能看起来一致”、集合近似相等或 Provider output
近似相同作为通过条件。

## 13. 幂等 Journal、并发与 Rebase

### 13.1 两级身份

- `(worldId, changeSetId)` 索引 immutable `changeSetHash`；同 ID 不同 Hash 永久冲突；
- `(authoringEditSessionId, requestId)` 索引 immutable `requestHash`、`authoringEditPolicyHash` 和
  mode-specific durable state；
- 相同 Request ID + Request Hash + Policy Hash 重试返回同一 Receipt，不重复 Build、创建
  Runtime、切换 WorldSession 或分配 Asset Lease；
- 相同 Request ID 携带不同 Request Hash 或在不同 Policy Hash 下重放，返回
  `WORLD_CHANGE_REQUEST_ID_CONFLICT`；
- 同一 ChangeSet 先 Dry Run 后 Apply 使用不同 Request ID，因此不会把 Dry Run Receipt 误当
  Apply Receipt。

### 13.2 Durable request states 与 transport 语义

```text
received
  ├──→ rejected
  └──→ validating
        ├──→ rejected
        ├──→ validated                 # validate terminal
        └──→ building-candidate
              ├──→ rejected
              ├──→ dry-run-succeeded   # dry-run terminal
              └──→ candidate-ready     # apply internal state only
                    ├──→ rejected
                    ├──→ committing    # authoring-only
                    │     └──→ committed
                    └──→ preparing-runtime
                          ├──→ rejected
                          └──→ committing
                                └──→ committed
```

状态只单向前进；`validated`、`dry-run-succeeded`、`rejected` 与 `committed` 是终态。
`candidate-ready` 只允许出现在 `mode: "apply"` 的内部 journal，不是 Dry Run 终态；Validate 或
Dry Run 不能使用同一 Request ID 升级为 Apply。

Host 在产生外部副作用前持久化状态。V1 没有公共 Cancel Request：调用方断开连接、取消
Promise/AbortSignal 或等待超时，只停止当前 transport wait，不改变 durable state，也不能触发
Candidate/Runtime rollback。调用方必须使用 Receipt Query 按原 Request ID 对账；在原 Request
到达终态前创建第二个语义相同 Apply Request，Host 可以按 World/ChangeSet active-request
admission 稳定拒绝，避免双重 publication。

Crash recovery 使用是否存在 durable commit record，而不是只看进程退出前的内存 state：

- `building-candidate`、`candidate-ready` 或 `preparing-runtime` 没有 commit record：Authoring
  revision head 仍是 Base；Host 按原 Request ID 恢复或清理 immutable Candidate/Runtime lease；
- `committing` 且没有 commit record：Authoring revision head 仍是 Base；Host 重新校验 immutable
  Candidate 后可以用原 Request ID 恢复 Prepare/Commit，无法恢复时写同一 Request 的 terminal
  Rejected Receipt，绝不创建第二个 Request；
- commit record、new revision head 与 immutable Committed Receipt 必须在同一 durable transaction
  写入；看到该 transaction 就按 `committed` 恢复；
- durable commit 后但 handle swap 前崩溃：Host 在重新开放 Edit/Runtime/Receipt API 前，从新
  Package 重建 Runtime 并完成 publication recovery；调用方查询原 Request ID 得到同一 Receipt；
- 未被 commit record 引用的 Candidate revision、Runtime lease 或 temp artifact 由带 fencing token
  的 recovery sweep 清理，不能靠调用方重试触发回收。

### 13.3 Base mismatch 与 Rebase

`baseAuthoringSpecHash` 不匹配返回：

- `currentAuthoringSpecHash`；
- ChangeSet Target 与 Base→Current Diff 的 `conflictingIds`；
- 非冲突 `affectedIds`；
- `rebaseRequired: true`。

V1 不自动把 ChangeSet 改投当前 Head，也不做 last-write-wins。Agent 读取 Current AuthoringSpec、
重新规划 Preconditions 并创建新的 ChangeSet ID。

## 14. Full Reload Runtime Structural Publication

### 14.1 Runtime expectation

```ts
interface RuntimePublicationExpectationV1 {
  readonly runtimeSessionId: string;
  readonly expectedWorldSessionId: string;
  readonly expectedWorldPackageRootHash: `sha256:${string}`;
  readonly targetPhaseBarrier:
    | { readonly mode: "next-world-replacement-barrier" }
    | {
        readonly mode: "fixed-tick";
        readonly expectedSimulationTick: number;
      };
}
```

Full Reload V1 只接受 `next-world-replacement-barrier`。`fixed-tick` 为未来 Incremental
协议预留；首条切片收到它返回 `WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED`。Base Authoring Hash
不能替代 Runtime Session/Package CAS；所有期望值在 Prepare 前和 Commit barrier 内各复验一次。

### 14.2 固定流程

```text
Candidate Authoring/Package + Required Gates succeeded
  → verify Apply request still owns authoring revision head
  → verify Runtime expectation and zero active Runtime Activity
  → preflight temporary dual residency budget
  → create Replacement Runtime/WorldSession in isolation
  → apply only new Package Bootstrap
  → await Candidate World Ready
  → acquire exclusive per-World publication fence
  → recheck revision head + RuntimeSession + WorldSession + Package + activity epoch
  → persist commit record + new revision head + immutable Receipt in one transaction
  → synchronously swap RuntimeHost current WorldSession/configuration handle
  → release fence and publish new Snapshot + the stored committed Receipt
  → dispose old Runtime from its ownership root
  → retry cleanup failures without changing committed result
```

RuntimeHost 只接收已经验证的 `RuntimeWorldConfiguration` 和 publication CAS envelope；它不读取
WorldChangeSet，也不运行 Schema/Compiler/Gate。

publication fence 由同一个 trusted Host owner 和 fencing token 持有。在 commit transaction 到
handle swap 的临界段，它阻止该 World 的 revision/Receipt 查询、结构或 Runtime mutation、
Snapshot/Event publication 和第二个 publisher；底层 durable store 不向旁路消费者直接暴露。
旧 Runtime 可以保留最后一帧，但不能在该临界段继续接受输入或发布新 Tick。swap 完成后，
第一个对外可观察状态必须同时引用新 revision、Package、WorldSession、Snapshot 和 Receipt。

### 14.3 唯一 Commit point 与 crash consistency

Candidate revision、Package、Gate Reports 和 Replacement Runtime 都是 Prepare 产物。
exclusive publication fence 内、同时写入 commit record/new revision head/immutable Receipt 的
durable transaction 是唯一 Commit point：

- Commit record 之前的任何失败：销毁 Candidate Runtime，旧 revision head/Runtime 继续；
- Commit record 之后：请求必须返回已存储的 byte-identical committed Receipt，不能回报 Rejected；
- 进程在 durable commit 后、内存 handle swap 前崩溃：重启先按新 revision head 重建 Runtime，
  完成 recovery 后才重新开放该 World 的 Host API；
- 旧 Runtime Dispose/Asset cleanup 失败：新 Runtime 保持 committed；独立 Cleanup Report 记录
  Diagnostic，Ownership queue 按 Receipt 中的 `cleanupOperationId` 幂等重试，Receipt 不变；
- Host handle swap 必须是无 await、无 Provider 调用、不会抛出的内存提交段；Provider Ready 和
  所有可能失败的工作都在 Prepare 完成。

### 14.4 Full Reload 状态处置

新 Runtime 创建新的 `worldSessionId` 并从 simulation Tick 0 启动。默认不转移：

- Entity Transform/Velocity；
- active Action/pose/medium transient state；
- `possessedBy`、`mountedOn` 或其他 Runtime Relationship；
- Controller Binding 和输入 latch；
- Camera Pose、Orbit、transition、preview；
- Runtime Activity、listener、timer、temporary asset lease。

WorldPackage Gameplay Bootstrap 可以创建新世界的初始 Relationship/Control；这不是“保留旧
状态”。Host-level View Preference 或其他跨 World preference 只有引用一个显式、版本化、
可校验 input artifact 时才能重新应用；首条切片没有该 artifact 就一律 reset。P2.4 负责该
Preference 的具体 Schema，P1.6 不复制一份相机协议。

Committed Receipt 必须为以下每个 `runtimeStateKind` 给出一行 `RuntimeStateEffectV1`：

```text
world-package, world-session, simulation-tick, entity-transform, entity-velocity,
active-action, controller-binding, relationship-state, camera-view,
runtime-activity, temporary-resource, host-view-preference
```

Full Reload 的 `exceptions` 必须为空；调用方从 world-wide `defaultDisposition` 得到完整状态
处置，不能靠省略字段猜测。未来 Incremental 仍使用同一结构，但默认 `preserved`，只为受影响
稳定 ID 写 scoped exceptions。

## 15. 后续 Incremental Hot Apply 合同

Incremental 不是“少跑几个 Compiler step”或“直接 scene.add”。每个允许热更新的
`Operation type + target kind` 必须注册一个受信 Handler：

```ts
interface IncrementalWorldChangeHandlerV1 {
  readonly operationType: WorldChangeOperationTypeV1;
  readonly targetKind: WorldChangeTargetV1["kind"];
  prepare(...): PreparedIncrementalWorldChangeV1;
  validate(...): IncrementalWorldChangeValidationV1;
  commit(...): void;
  rollback(...): void;
  describeStateMigration(...): readonly RuntimeStateEffectV1[];
  describeOwnership(...): IncrementalOwnershipPlanV1;
}
```

规则：

- Handler 集合进入版本化 Host capability/implementation lock；Agent 不能注册 Handler；
- Commit 只发生在 `fixed-tick` Phase Barrier；逻辑、Visual、Physics、Control、Camera、
  Relationship、Snapshot index 和 Ownership Ledger 同时发布或同时回滚；
- 未受影响 Entity 保持 ID、Transform、Velocity、Action、Controller Binding、Relationship 和
  Camera state；被修改/删除 Entity 使用显式 migration policy；
- `describeStateMigration()` 对每个 state kind 给出 world-wide default 和非重叠 scoped
  exceptions。未受影响状态使用 default `preserved`，受影响/删除目标不能靠自由文本说明；
- 任一步失败回到同一 Tick 的旧逻辑/渲染/物理图并释放所有 Candidate 资源；
- Terrain、全局物理、坐标系、Schema/Profile Major、插件实现、Runtime backend、未注册 Handler
  和不支持的资源变化必须返回结构化 `full-reload-required` 分类；
- Incremental 仍产出同一个 `WorldChangeReceiptV1`，`publicationMode` 是
  `incremental-hot-apply`；不能另建 HotPatch Receipt；
- 必须通过 §12.3 全量 Differential Build 和 Runtime unaffected-state/replay Conformance。

首条 P1.6 实现不注册 Handler，因此 Host classification 对所有 `publish-runtime` 请求返回
`full-reload`；这不是能力缺失回退，而是明确的第一阶段策略。

## 16. Authoring/Edit Session、Scope 与安全边界

### 16.1 Scope 与 workload budget

第一版关闭 Scope：

```text
authoring.schema.read
authoring.registry.read
authoring.change.validate
authoring.change.dry-run
authoring.change.apply
authoring.runtime.publish
authoring.receipt.read
```

```ts
interface AuthoringEditWorkloadBudgetV1 {
  readonly maximumChangeSetBytes: number;
  readonly maximumPreconditionCount: number;
  readonly maximumOperationCount: number;
  readonly maximumConcurrentNonTerminalRequestCount: number;
  readonly maximumPreparedCandidateCount: number;
  readonly maximumPreparedCandidateBytes: number;
  readonly maximumPreparedCandidateRetentionMilliseconds: number;
}
```

- Scope 和 workload budget 由 Host authentication/session policy 注入，Request body 不能自我
  声明、放宽或提升；
- 所有预算值必须是有限安全正整数；Host 可按 World、租户和平台进一步收窄；
- ChangeSet bytes/Precondition/Operation/并发请求预算在 Candidate 分配前检查；Candidate
  count/bytes/retention 在 Build admission 与持久化前检查；
- 超限使用 `WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED` 和关闭的 `admission-budget` details，
  不开始 Build、Runtime Prepare 或部分 revision 写入；
- `apply` 不隐含 `runtime.publish`；
- `control.intent`、`action.activate`、`capture`、普通 `load`、Playwright 页面执行权限和
  Runtime Activity 不派生任何 Authoring Scope；
- Session 绑定允许的 World IDs、Registry Lock、Capability Set、Projection Profile、资源预算、
  workload budget、Gate Profile 和过期时间；这些 secret-free 字段进入
  `authoringEditPolicyHash`；
- Session 过期后已有 committed Receipt 仍可按审计策略读取，但不能继续 Apply。

### 16.2 普通 Runtime load

Runtime `load/run` 只接受 Host 已批准、完整性验证的 immutable WorldPackage。它不能从
WorldChangeSet 现场编译 Package，也不能因为 caller 能加载 Package 就授予结构写权限。

### 16.3 Browser 控制面

现有 `window.__WORLDKIT__` 继续是 exact Browser Protocol V5 Runtime API。P1.6 不增加第 40 个
key，也不复用 `executeGameplayCommand`。

`WorldkitAuthoringEditApiV1` 只安装在受信 Studio shell/Host bridge，使用 capability-bound object
reference 或认证 channel；不安装进普通 playable iframe/global。它提供：

```ts
interface WorldkitAuthoringEditApiV1 {
  readonly version: 1;
  projectAiSchema(request: AiSchemaProjectionRequestV1): Promise<AiSchemaProjectionV1>;
  searchRegistry(request: RegistrySearchRequestV1): Promise<RegistrySearchReceiptV1>;
  validateWorldChange(request: WorldChangeValidateRequestV1): Promise<WorldChangeReceiptV1>;
  dryRunWorldChange(request: WorldChangeDryRunRequestV1): Promise<WorldChangeReceiptV1>;
  applyWorldChange(request: WorldChangeApplyRequestV1): Promise<WorldChangeReceiptV1>;
  getWorldChangeReceipt(request: WorldChangeReceiptQueryV1): Promise<WorldChangeReceiptV1>;
  getWorldChangeCleanupReport(request: WorldChangeCleanupReportQueryV1): Promise<WorldChangeCleanupReportV1>;
  explainWorldChange(request: WorldChangeExplainRequestV1): Promise<WorldChangeExplainV1>;
  diffWorldChange(request: WorldChangeDiffRequestV1): Promise<WorldChangeDiffV1>;
}
```

查询、Explain 与 Diff 使用精确 selector，不使用多个重叠 optional flags：

```ts
interface WorldChangeReceiptQueryV1 {
  readonly kind: "worldkit-world-change-receipt-query";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
}

interface WorldChangeCleanupReportQueryV1 {
  readonly kind: "worldkit-world-change-cleanup-report-query";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly cleanupOperationId: string;
}

interface WorldChangeCleanupReportV1 {
  readonly kind: "worldkit-world-change-cleanup-report";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly cleanupOperationId: string;
  readonly previousWorldSessionId: string;
  readonly status: "scheduled" | "retrying" | "released" | "quarantined";
  readonly attemptCount: number;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
}

interface WorldChangeExplainRequestV1 {
  readonly kind: "worldkit-world-change-explain-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly selector:
    | { readonly mode: "summary" }
    | { readonly mode: "operation"; readonly operationId: string }
    | { readonly mode: "diagnostic"; readonly diagnosticCode: WorldChangeDiagnosticCodeV1 };
}

interface WorldChangeExplainV1 {
  readonly kind: "worldkit-world-change-explain";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly explanations: readonly Readonly<{
    id: string;
    type:
      | "schema-projection"
      | "override-policy"
      | "operation-effect"
      | "publication-selection"
      | "runtime-state-effect"
      | "conflict";
    message: string;
    relatedIds: readonly string[];
  }>[];
}

interface WorldChangeDiffRequestV1 {
  readonly kind: "worldkit-world-change-diff-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
}

interface WorldChangeDiffV1 {
  readonly kind: "worldkit-world-change-diff";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly baseAuthoringSpecHash: `sha256:${string}`;
  readonly resultAuthoringSpecHash: `sha256:${string}`;
  readonly changes: readonly Readonly<{
    id: string;
    type: "added" | "removed" | "replaced";
    target: WorldChangeTargetV1;
    previousTargetHash?: `sha256:${string}`;
    currentTargetHash?: `sha256:${string}`;
  }>[];
}
```

Browser transport 只转发 Canonical DTO；不接收本地路径、Provider object、DOM node、Babylon
handle 或 executable callback。

Cleanup Report 规则：

- `scheduled → retrying → released` 是正常单向路径；`released` 是成功终态；
- 达到 Host retry policy 上限、发现 ownership ledger corruption 或无法证明安全释放时进入
  `quarantined` 终态，并写 `WORLD_CHANGE_CLEANUP_QUARANTINED`；
- quarantine 不改变已提交 World、revision head 或 immutable Receipt；后续人工/受信运维修复
  使用独立管理协议，不复用 WorldChangeRequest；
- `attemptCount` 单调递增，重复查询不能触发新的 cleanup attempt。

## 17. CLI 合同

在现有 `worldkit` CLI 增加：

```text
worldkit schema project <world.json> --profile <resource-ref> --output <projection.json> [--json]
worldkit registry search --lock <registry-lock.json> --kind <resource-kind>
  [--tag <semantic-tag>] [--after-resource-ref <ref>] [--limit <count>] [--json]

worldkit change validate <change-set.json> [--json]
worldkit change dry-run <world.json> --change-set <change-set.json>
  --output <candidate-directory> [--json]
worldkit change diff <world-change-receipt.json> [--json]
worldkit change explain <world-change-receipt.json>
  [--operation-id <id>] [--diagnostic-code <code>] [--json]
worldkit change apply <world.json> --change-set <change-set.json>
  --output <new-world.json> --receipt <world-change-receipt.json> --write [--json]
worldkit change receipt --request-id <id> [--json]
worldkit change cleanup --cleanup-operation-id <id> [--json]
```

文件模式 `apply`：

- CLI 为本次进程创建只绑定输入/输出路径和本地 Registry Lock 的 ephemeral Authoring/Edit
  Session，仍生成 `authoringEditSessionId` 并走同一 Request/Receipt parser；
- 必须显式 `--write`；
- `--output` 不得等于输入路径；
- 写 sibling temp 后 atomic rename；
- 不发布 Runtime，Receipt 的 `publicationMode` 为 `none`。

连接受信 Host 的 live Apply 使用 Host connection profile 和 Edit Session context，不把 token 放进
命令参数、JSON、日志或 Receipt。它复用同一 `WorldChangeApplyRequestV1`，要求
`requestedOutcome: "publish-runtime"` 和 Runtime expectation；CLI 不定义第二套 LiveChange 方言。

CLI/Studio 关闭窗口、断开连接或终止本地等待不会向 Host 发送隐式业务取消。对已经接受的
live Request，客户端必须保留 Request ID 并使用 `change receipt`/Receipt Query 对账。

## 18. Diagnostic 与 Explain

首批稳定 Diagnostic：

| Code | 触发条件 |
| --- | --- |
| `AI_SCHEMA_PROFILE_NOT_ALLOWED` | Session 不允许请求的 Projection Profile |
| `AI_SCHEMA_PROFILE_UNREPRESENTABLE` | Optional/null 或 Union 不能无损投影 |
| `AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED` | 无合法降级仍超预算 |
| `REGISTRY_SEARCH_LOCK_MISMATCH` | 查询的 Registry Lock 与 Session 不符 |
| `DEFINITION_OVERRIDE_PATH_FORBIDDEN` | 路径不在有效交集 |
| `DEFINITION_OVERRIDE_VALUE_INVALID` | Ref 未锁、类型/能力/兼容性不满足 |
| `WORLD_CHANGE_SET_SCHEMA_INVALID` | ChangeSet 或 Operation 不是关闭 Schema |
| `WORLD_CHANGE_SET_ID_CONFLICT` | 同一 ChangeSet ID 携带不同 Hash |
| `WORLD_CHANGE_REQUEST_ID_CONFLICT` | 同一 Request ID 携带不同 Request/Policy Hash |
| `WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED` | ChangeSet、并发 Request 或 Candidate 留存超过 Host workload budget |
| `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH` | Base Hash 不是当前 revision head |
| `WORLD_CHANGE_PRECONDITION_FAILED` | 任一 Precondition 失败 |
| `WORLD_CHANGE_TARGET_CONFLICT` | 同一 ChangeSet 多次非交换写同一 Target |
| `WORLD_CHANGE_REFERENCE_DANGLING` | Candidate 最终存在悬空引用 |
| `WORLD_CHANGE_CANDIDATE_INVALID` | Canonical Validation/Normalize/Solve/Compile 失败 |
| `WORLD_CHANGE_REQUIRED_GATE_FAILED` | Package 或 Required Gate 未通过 |
| `WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED` | Prepared Candidate 不存在或 lease 已到期 |
| `WORLD_CHANGE_PREPARED_CANDIDATE_STALE` | Candidate 的 Base/Policy/Registry/Compiler/Validation binding 漂移 |
| `WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED` | 缺少 Runtime publish Scope |
| `WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED` | active Runtime 绑定下试图只提交 Authoring head |
| `WORLD_CHANGE_RUNTIME_EXPECTATION_STALE` | Runtime/WorldSession/Package CAS 过期 |
| `WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED` | 首切片请求 fixed-tick/Incremental |
| `WORLD_CHANGE_RUNTIME_CAPACITY_EXCEEDED` | 无法满足双驻留预算 |
| `WORLD_CHANGE_RUNTIME_PREPARE_FAILED` | Replacement Runtime 未 Ready；旧世界继续 |
| `WORLD_CHANGE_PUBLICATION_CONFLICT` | Commit barrier 内 revision/runtime/activity 发生变化 |
| `WORLD_CHANGE_CLEANUP_INCOMPLETE` | Commit 后旧资源清理待重试；Receipt 仍 committed |
| `WORLD_CHANGE_CLEANUP_QUARANTINED` | Cleanup 无法安全自动完成，已进入隔离终态 |

Diagnostic 可以带关闭的 ID、Ref、Hash、Canonical instance path、冲突 Target 或预算详情；不能
泄漏凭证、本地路径、Provider handle、原始堆栈或内部对象，也不能用自由 details bag 扩展协议。

Explain 必须能回答：

- 为什么某字段/Capability 出现在或被裁剪出 AI Schema；
- 为什么 Registry enum 被降级为 Ref Search；
- Override 被 Definition、Profile、Host Policy 或 Registry 哪一层拒绝；
- 每个 Operation 改了什么稳定 Target、触发了哪些受影响闭包；
- Apply 为什么采用 Full Reload 或未来 Incremental；
- 哪些 Runtime 状态由 default disposition 处理、哪些 stable IDs 使用 exception；
- Prepared Candidate 为什么 expired 或 stale；
- Base mismatch 的冲突 ID 和重新生成 ChangeSet 所需当前 Hash。

## 19. Conformance、测试与证据

### 19.1 Schema/Projection

- Canonical Schema `$id`、Draft、closed objects、required discriminator、units 和 stable `$defs`；
- 两个结构化输出 Provider Adapter 对同一 Projection 完成无损 round trip，再通过 Canonical
  Validation；Provider 私有关键字不进入公共 artifact；
- optional/null、Union、enum overflow、property/depth/bytes budgets 的正负 fixture；
- `ai-schema-projection-profile` kind/parser/catalog/Lock closure 与 Profile content Hash；
- Registry Lock/Capability Set 变化必然改变相应 Hash，排序变化不改变集合 Hash。

### 19.2 Override

- Definition maximum、AI Profile 和 Host Policy 三层交集；
- 非法 path grammar、数组下标、wildcard、Hash/version/provider/collider/socket/parameters 禁止；
- 目标 Ref 未锁、reserved、不兼容 Body/Medium/Capability 时稳定失败；
- 两个 Definition 实际复用同一 validator，证明不是 Subject 特判。

### 19.3 ChangeSet/Receipt

- stale Base、target exists/absent/hash Preconditions、duplicate operation IDs、same-target conflict；
- add Subject、add Prototype+House、remove referenced node、replace Terrain、update Startup；
- Request/ChangeSet ID 冲突、Request/Policy Hash 冲突、重试返回相同 Receipt、超时后 Receipt Query；
- Validate/Dry Run/Apply 的 mode-specific terminal states；Validate/Dry Run 不得用同一 Request ID
  升级为 Apply；
- transport disconnect/AbortSignal/客户端超时不取消 durable work，不产生第二次 publication；
- ChangeSet bytes、Precondition/Operation、并发非终态 Request、Candidate count/bytes/retention
  workload budget 的边界与超限 fail-closed；
- Prepared Candidate ref 不授予权限，expiry 与 stale 分离，Policy/Registry/Compiler/Gate 漂移均
  稳定拒绝；
- Diagnostic code/details parser 关闭 unknown code、unknown details kind 和任意自由字段；
- 任一 Operation/Gate 失败不产生 result revision 或部分世界；
- Candidate bytes、Diff、affected IDs、operation results 和 Receipt hashes 可重放。

### 19.4 Full Reload Runtime

- Replacement Prepare/Gate/World Ready 失败时旧 Runtime 仍可移动并返回旧 Snapshot；
- 双驻留预算拒绝、active Runtime Activity 拒绝、Commit 前 Runtime/Package/Revision CAS 过期；
- exclusive publication fence 阻止 revision/Receipt/Snapshot/第二 publisher 旁路观察临界段；
- crash 覆盖 commit transaction 前、transaction 后但 handle swap 前、swap 后 cleanup 前；
- Commit 创建新 WorldSession、Tick 0、旧 Command/WorldState refs fail closed；
- 默认状态 reset，显式 Bootstrap 只使用新 Package；
- Full Reload 每个 Runtime state kind 恰好一个 world-default effect 且 exceptions 为空；
- Commit 后旧 Dispose 抛错时仍返回 byte-identical committed Receipt；独立 Cleanup Report
  进入 retrying/released，达到 retry policy 或 ownership corruption 时进入 quarantined，且始终
  按同一 `cleanupOperationId` 对账；
- 两个 RuntimeHost 实例、重复 Request、Reset 与 Apply 竞争、partial construction、throwing
  cleanup、30/60/120 Hz-like render timing 隔离；
- real Chromium + Babylon 验证页面运行中新增一个 package-local Subject/House 后原子换世界；
- Terrain ChangeSet 必须走 Full Reload，并重新运行 Traversal/Physics/Validation。

### 19.5 Incremental 预留合同

- 每个 state kind 的 default disposition 与 scoped exception 排序、去重和 scope-kind compatibility；
- 默认 preserved + 少量 replaced/reset 能完整表达，不枚举所有未受影响 Entity；
- exception scope 重叠、重复 ID、错误 scope kind、缺失 state kind 稳定拒绝；
- Handler 输出必须同时通过 Differential Build、rollback、unaffected-state 与 replay Conformance。

### 19.6 证据分层

分别记录：

1. automated contract/type/hash evidence；
2. full build/package/validation evidence；
3. real Browser/Runtime numeric evidence；
4. rendered visual evidence；
5. manual interaction evidence。

成功 worker 报告、单元测试或截图都不能独自证明 Runtime structural publication 完成。

## 20. Migration 与兼容策略

当前公共协议尚未发布，P1.6 首次实施使用一次明确 clean break：

- 根 ChangeSet 字段使用 `id`，不同时支持 `changeSetId`；
- 删除任何 `WorldPatch`、通用 `patch/execute` 或数组下标生产协议草案；
- 收敛 §7 的 `authoringSpecHash` 语义和所有 fixtures；
- Registry Definition 正式加入 `allowedOverridePaths`，删除全局硬编码作为公共真相；
- Runtime replacement request 升级为带 Request/Runtime expectation/barrier 的精确 envelope；
- Browser V5 不增加 Alias；Authoring/Edit 使用独立控制面。

一旦 P1.6 对外发布，后续破坏性升级必须使用新的 `schemaVersion` 和显式 Migration Report，
记录 migration 前后 Hash；禁止永久 Alias 字段。

## 21. 实施依赖工作图

Architecture、公共字段、Hash 语义、权限、跨包接口和最终集成由主 Agent 持有。只有合同冻结、
文件所有权不重叠且依赖 Ready 的任务可并行。

| ID | 目标与独立可验证交付物 | `depends_on` | `blocks` | 独占所有权与精确集成点 | 稳定输入 → 稳定输出 | 必需验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P16-D0 | 冻结本文、术语、包 DAG、公共 DTO、首条 Slice 和 Gate | 当前 main、总体设计、P1.6 Backlog | 全部 P16 任务 | 主 Agent；本 spec、Backlog、后续 plan | 当前源码/规格 → 唯一设计权威 | 全维度设计审查、无 placeholder/alias | main-agent-only |
| P16-H0 | Clean-break 统一 Authoring document hash，并拆出明确 `layoutInputHash` | P16-D0 | P16-A0、P16-C1、P16-S1、P16-P1 | `protocol` hash primitive、`authoring` hash API、WorldPackage/Plan/Report 公共字段；跨包集成由主 Agent | valid Authoring V4 bytes → 唯一 document hash | golden bytes、reorder semantics、全引用 census | main-agent-only |
| P16-A0 | 建立 provider-neutral `@whitebox-world/authoring-edit` 包和 strict DTO/parser/hash 边界 | P16-D0、P16-H0 | P16-S1、P16-O1、P16-C1 | 新 package manifest/exports/types/parsers；不接 I/O/Runtime | closed DTO → parsed/frozen/hash values | unknown-key、negative-zero、alias、closed Diagnostic/details、RuntimeStateEffect scope、dependency graph | sequential |
| P16-S1 | AI Schema Profile/Projector、预算降级、Projection Receipt | P16-A0、P16-H0、P1.4 Registry Lock shape | P16-B1、P16-F1 | `authoring-edit/src/schema-projection/*`、`authoring` schema export、Registry `ai-schema-projection-profile` kind/parser/catalog 与 read port；不改 change protocol | schema + lock + capabilities + budget → projection | optional/null round trip、budget/provider fixtures、Registry Lock kind closure | parallel-safe |
| P16-O1 | 通用 Definition `allowedOverridePaths` 与 Resource Ref Override validator | P16-A0、P16-S1 contract | P16-C1、P16-F1 | `subject-registry` definition field、`authoring-edit/src/override-policy/*`、Authoring instance override shape | definition/profile/host intersections → accepted override or diagnostic | two-definition reuse、forbidden paths/refs | sequential |
| P16-C1 | WorldChangeSet/Precondition/Operation/Candidate Diff 纯实现 | P16-A0、P16-H0 | P16-P1、P16-R1 | `authoring-edit/src/world-change/*`；不改 projector/override policy | base spec + ChangeSet → isolated candidate/diff or rejection | operation matrix、conflict/base/precondition、workload admission tests | parallel-safe |
| P16-P1 | Trusted Candidate Build pipeline：完整 Normalize/Solve/Compile/Package/Gates | P16-C1、P1.4 complete package/lock | P16-R1、P16-H1、P16-CLI1 | trusted host orchestration in scripts/lib or dedicated host adapter；调用现有 owners | candidate + profiles/artifacts → immutable prepared candidate lease | gate failures/no partial output/full build hashes、expiry/GC/Policy binding | sequential |
| P16-R1 | Durable idempotency journal、revision head、Receipt/Cleanup Report Query/Explain/Diff | P16-C1、P16-P1 | P16-H1、P16-B1、P16-CLI1 | Host persistence adapter；`authoring-edit` 只保留 port/DTO | request identity + pipeline outcome → durable terminal Receipt | mode-specific terminals、transport timeout/retry/conflict、transaction boundary、crash-state/recovery sweep | sequential |
| P16-H1 | RuntimeHost publication V2：CAS、exclusive fence、commit point、cleanup disposition | P16-P1、P16-R1、当前 RuntimeHost replacement | P16-B1、P16-F1 | `runtime-host` request/commit lifecycle；Babylon adapter 只做 candidate ready/ownership | verified configuration + runtime expectation → new session or stable rejection | runtime deep checklist、commit/swap crash windows、state effect defaults/exceptions、cleanup quarantine、partial construction、immutable Receipt | sequential |
| P16-CLI1 | Schema/Registry/Change CLI 和 offline/live adapters | P16-S1、P16-C1、P16-P1、P16-R1 | P16-F1 | `scripts/worldkit.ts` + focused lib；不复制 domain parsing | CLI args/files/session context → Canonical requests/artifacts | parser/exact output/no-in-place/credential redaction/transport-disconnect semantics | parallel-safe |
| P16-B1 | Trusted Studio Authoring/Edit API；保持 Browser V5 exact 39 keys | P16-S1、P16-O1、P16-R1、P16-H1 | P16-F1 | Studio shell/Host bridge + Browser DTO adapter；playable window 不安装 | scoped API calls → Canonical receipts | scope/workload matrix、iframe/global absence、V5 exact-key tests | parallel-safe |
| P16-F1 | Full Reload 两个 Golden fixtures 与五层证据 | P16-O1、P16-P1、P16-R1、P16-H1、P16-CLI1、P16-B1 | P16-G1 | fixtures/verifiers/evidence；主 Agent集成 | add Subject/House + Terrain replacement → atomic world publication | full gates、real Chromium/Babylon、old-world survival、candidate expiry、cleanup quarantine | sequential |
| P16-I1 | 第二切片 Handler Registry、fixed-tick Hot Apply 与 Differential Runtime Conformance | P16-F1、独立批准的 Incremental implementation plan | P16-G2 | 新 handler registry + affected runtime owners；不得改 V1 Receipt 方言 | eligible operation + prepared candidate → atomic hot apply or full-reload-required | full byte equivalence、scoped state effects、rollback/unaffected state/replay | sequential |
| P16-G1 | Full Reload 首切片 Final GO、文档状态和 production claims | P16-F1 | 无 | 主 Agent；Backlog/README/review/evidence | integrated exact HEAD → GO/NO-GO | relevant full gates + independent completion review | main-agent-only |
| P16-G2 | Incremental 第二切片 Final GO | P16-I1 | 无 | 主 Agent；Backlog/README/review/evidence | exact Incremental HEAD → GO/NO-GO | Differential + runtime full gates + independent review | main-agent-only |

允许的首轮并行仅有：

- P16-S1 与 P16-C1：P16-A0、P16-H0 完成后、文件所有权分离时；
- P16-CLI1 与 P16-B1：P16-R1、P16-H1 公共接口冻结后；

P16-H0、P16-A0、P16-P1、P16-R1、P16-H1、P16-F1 和最终集成必须顺序执行。P1.4 完整
WorldPackage/Registry Lock 是 P16-P1、P16-H1 的硬依赖，但不阻塞先实现纯 Projection/ChangeSet。

## 22. 实施切片与完成标准

### 22.1 Slice A：纯 Authoring/Edit

交付 P16-H0/A0/S1/O1/C1、offline CLI、Dry Run/Receipt：

- 两个 Provider Adapter 使用同一 AI Schema Projection 生成 Canonical Authoring/ChangeSet；
- Registry enum 超预算时可查询精确 Lock；
- ChangeSet 能离线原子生成新 AuthoringSpec 和完整 Candidate Package；
- mode-specific terminal Receipt、workload budget、Candidate lease/expiry 和关闭 Diagnostic 可复验；
- 不触碰 Runtime，不宣称页面运行中结构修改已交付。

### 22.2 Slice B：Full Reload Runtime publication

交付 P16-P1/R1/H1/B1/F1/G1：

- 页面运行中通过受信 Edit Session 增加一个 Subject/House；
- Candidate 失败时旧世界继续可运行；
- Candidate Ready 后以新 WorldSession/Tick 0 原子发布；
- Receipt 无歧义记录 hashes、publication mode 和所有 Runtime state default disposition；
- transport disconnect 后可用原 Request ID 对账，Committed Receipt 不被 cleanup 结果改写；
- Terrain 修改完整重跑 Physics/Traversal/Validation 并通过 Full Reload 发布；
- Browser V5 仍是 exact 39 keys，普通页面脚本没有 Authoring/Edit API。

### 22.3 Slice C：Incremental Hot Apply

只有 Slice B Final GO 且另行批准实施计划后开始。至少一个低风险 Operation Handler 必须证明
完整 Build 字节等价、固定 Tick 原子提交、失败回滚、默认 preserved + scoped exceptions、未影响
状态保留和重复 Request 幂等；Terrain 仍强制 Full Reload。

## 23. 本设计冻结的最终判断

1. 项目已有足够的 Canonical Build、WorldPackage identity、RuntimeHost replacement 和 Gameplay
   transaction 底座，可以开始 P1.6；不需要再发明 `WorldPatch`。
2. `WorldChangeSet` 是唯一 World Structure 修改协议；Runtime Command/Relationship Transaction
   是现有世界状态修改协议，两者永不合并。
3. P1.6 必须同时冻结 AI Schema、Override、ChangeSet、Receipt、Session Scope 和 Runtime
   publication；只实现其中一个对象不构成闭环。
4. 第一条生产实现是完整 Build + atomic Full Reload；Incremental 是后续独立高风险能力。
5. Full Reload 的默认语义是新 WorldSession、Tick 0、Runtime 状态不迁移；任何保留都必须是
   显式、版本化、可验证 input，并写入 Receipt。
6. Terrain 变化即使未来支持 Incremental，仍稳定分类为 Full Reload。
7. RuntimeHost 只拥有 Runtime lifecycle/CAS/barrier，不拥有 Authoring、Compiler、权限或
   ChangeSet；Trusted Host pipeline 负责跨层编排。
8. 普通 Browser V5、Playwright 页面脚本、Gameplay Command、Capture 或 load 权限都不能派生
   Authoring/Edit 权限。
9. 当前未发布 Hash/Override/Runtime replacement 字段在实施时一次 clean break，不保留 Alias。
10. Validate、Dry Run、Apply 使用各自不可升级的 durable terminal state；连接断开不是业务取消，
    Prepared Candidate ref 不是权限凭证。
11. Full Reload 使用 world-wide state defaults；Incremental 使用 default + scoped exceptions，
    不允许为了未来热更新再发明第二套 Receipt。
12. 只有 Slice B 的真实 Browser/Runtime evidence 和 Final GO 完成后，项目才可宣称“运行中
    增加人物或房屋”生产可用；只有 Slice C 完成后才可宣称受限 Incremental Hot Apply。
