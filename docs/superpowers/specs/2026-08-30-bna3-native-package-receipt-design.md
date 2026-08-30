# BNA-3 Babylon Native Bundle、WorldPackage 与 Receipt 设计

- 日期：2026-08-30
- 状态：待实现
- 上位权威：
  - [ADR-0007](../../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)
  - [AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
  - [BNA-2 生产闭环设计](./2026-08-29-babylon-native-authoring-production-closure-design.md)
- 前置：BNA-1、BNA-2 已完成
- 后续：BNA-4、BNA-5、BNA-6、BNA-7、BNA-8

> 本文是 BNA-3 的专项实现权威。它细化长期设计第 10 节与 BNA-3 任务，不改变
> Canonical JSON + Babylon Native Scene + shared SDK Runtime 的长期分工。

## 1. 目标与裁决

BNA-3 把 BNA-2 已通过 Source Admission、Authority Audit 和双 Candidate Replay 的 Native
场景构造结果，冻结为内容寻址、可重放、可校验的正式 WorldPackage。它必须证明：

1. 一个 Native Package 精确绑定 Bootstrap、Module Bundle、依赖、资产、Gameplay、Runtime
   Bootstrap、Registry、Authoring Attempt、Profile/Budget 与冻结 Contribution；
2. 同一闭合输入得到 byte-exact 相同的 Root、WorldPackage Ref、WorldBuildIdentity 和 Receipt；
3. 任一文件、Hash、版本、资源凭据或 Contribution 漂移都会 fail-closed；
4. `WorldBuildIdentityV1` 与 Build Receipt 继续是 Root 计算后的 transport metadata，不形成自引用；
5. Canonical 与 Native 共用一个 WorldPackage、Receipt、Store、Host Policy 和签名体系，但各自拥有
   互斥的 Scene Source 成员；
6. BNA-3 不创建 Havok、Subject、主相机、输入或 Runtime Candidate。正式 Native Runtime admission
   仍由 BNA-4 独占。

核心裁决是：**只有一个 `WorldPackageManifestV1`，其 `sceneSource` 是闭合判别联合。** 不新建
平行的 `@whitebox-world/native-world-package` 实现包，不把 Native 伪装成 Canonical ExecutionPlan，
也不让 Package consumer 自己猜来源。这不删除现有 `@whitebox-world/native-babylon`：后者继续独占
Native Author API、构造、Authority Audit 与 Candidate Replay；Babylon-free 的持久 Bundle、Lock、Check
和 Contribution 合同由现有 `@whitebox-world/runtime-contracts` 独占。`@whitebox-world/world-package`
只独占两种 Scene Source 共用的 Root、Receipt、Store、签名和目录验证。Native 输出仍是正式
WorldPackage，且不新增 Native 专用 Package 包或第二套 parser。

## 2. Current-only clean break

项目尚未发布，本任务执行一次彻底的 current-only 切换：

- 删除公开 `createWorldPackageV1`；只保留语义明确的
  `createCanonicalWorldPackageV1` 和 `createBabylonNativeWorldPackageV1`；
- `CreateWorldPackageV1Input` current-only 更名为 `CreateCanonicalWorldPackageV1Input`；公共构建上下文
  收为不含 Lane 字段的 `WorldPackageSharedBuildContextV1`，Canonical 独有的可选审计开关留在
  `CanonicalWorldPackageBuildContextV1`，不让 Native 输入继承 `includeAuthoringSpec`；
- 把 Canonical-only `WorldPackageManifestV1` 改为一个公共壳 + `sceneSource` 判别联合；旧的顶层
  `authoringSpecHash`、`executionPlanHash` 等 Canonical 专属字段迁入 Canonical member；
- 把公共 Package/Runtime 闭包使用的 `CanonicalResourceLockEntryV1` /
  `canonicalResourceLockEntriesV1` current-only 更名为 `WorldResourceLockEntryV1` /
  `worldResourceLockEntriesV1` 并扩充闭合 resource-kind enum；Compiler 仍可生成同一 source-neutral lock，
  但公共 Package 不再暴露带 Lane 含义的旧名称；
- `CANONICAL_RESOURCE_KINDS_V1` 同步改为 `WORLD_RESOURCE_KINDS_V1`；JCS helper
  `canonicalWorldPackageManifestV1` 改为不会与 Canonical Scene Source 混淆的
  `canonicalizeWorldPackageManifestV1`，`canonicalWorldPackageFileIntegrityEntriesV1` 同步改为
  `canonicalizeWorldPackageFileIntegrityEntriesV1`；
- `VerifiedWorldPackageDirectoryV1` 同样变为判别联合，调用方必须按
  `manifest.sceneSource.kind` 缩窄；
- 一个 `verifyWorldPackageDirectoryV1`、一个 Build Receipt parser、一个 Store、一个签名与 Host
  Compatibility 入口继续是唯一权威；
- 更新全部 consumer、fixture、golden、CLI 和生成物后，删除旧类型、旧 parser、旧 builder、旧
  re-export、旧字段读取和兜底推断；
- 不保留 deprecated alias、重载兼容、`V2` 并行格式、legacy/new feature flag 或“缺字段时按
  Canonical 解释”的 fallback。

`schemaVersion: 1` 和 `packageFormatVersion: 1` 表示当前唯一合同，不表示允许 V1/V2 并存。

## 3. 权威边界

| 状态/制品 | 唯一 Owner | BNA-3 行为 |
| --- | --- | --- |
| Native Source Graph、Typecheck、Bundle 方言 | BNA-2 Source Admission | 复用同一 admitted graph 与 bundler 配置，不另建入口或 import 规则 |
| Native 持久 Bundle/Lock/Check/Contribution 合同 | `@whitebox-world/runtime-contracts` | 独占 exact parser、canonical bytes 与 Hash；保持 Babylon-free |
| Native Module API、Authority、构造与 Replay | `@whitebox-world/native-babylon` | 生产上述持久合同；不再定义或 re-export 第二份 parser/type，不复制 Babylon Handle |
| Scene Authoring Route/Attempt | `@whitebox-world/scene-authoring-contracts` | 只接受匹配 Route 的 completed Result，拒绝 rejected/tool-error |
| Asset Production/Admission/Publication | APA packages | 只消费已发布不可变资源及其 receipts，不调用 Provider、不 promotion Candidate |
| Package manifest/root/receipt/store | `@whitebox-world/world-package` | Canonical 与 Native 共用唯一实现 |
| World Build Identity | `@whitebox-world/world-identity` | Root 后派生，按 Scene Source 绑定相应 Hash |
| Gameplay/Runtime Bootstrap | 现有 Gameplay/Runtime contracts | 原样复用并 byte-exact 绑定，不由 Native Module重建 |
| Runtime Scene、Havok、Subject、Camera、Tick | BNA-4 Runtime/SDK | BNA-3 不分配、不 attach、不 publish |

Native Module Bundle 是不可变代码制品，不是新的 Runtime 权威；运行时只能消费 Package 已锁定的
Bundle 和输入，并重新得到 Receipt 绑定的 Contribution。

## 4. WorldPackage V1 形态

### 4.1 公共 Manifest

`WorldPackageManifestV1` 保留以下公共字段：

```ts
interface WorldPackageManifestV1 {
  readonly kind: "worldkit-world-package-manifest";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly packageFormatVersion: 1;
  readonly sdkVersion: string;
  readonly worldId: string;
  readonly seed: number;
  readonly runtimeTarget: "babylon-web";
  readonly canonicalizationProfile: "canonical-json-jcs@1";
  readonly hashAlgorithm: "sha256";
  readonly sceneSource: WorldPackageSceneSourceV1;
  readonly worldRuntimeBootstrapSchemaVersion: 1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly registryLockHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly resourceBudget: WorldPackageResourceBudgetV1;
  readonly lockedResources: readonly WorldResourceLockEntryV1[];
  readonly entryPoint: {
    readonly gameplayBootstrapPath: "gameplay/bootstrap.json";
    readonly worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json";
  };
  readonly legal: WorldPackageLegalV1;
  readonly hostCompatibility: WorldPackageHostCompatibilityV1;
  readonly resources: readonly WorldPackageResourceArtifactV1[];
}
```

公共 `resources` 只记录从 Registry/Asset 供应链带入 Root 的不可变外部资源字节及法律身份；Manifest、
Bootstrap、Plan、Bundle、Lock、Contribution 等 Package 自有文件只进入 Root integrity inventory，不能
再次作为 `resources` 形成自引用。`lockedResources` 是 Gameplay、Runtime、Scene
Source 和 traversal profile 的传递闭包；不得只记录 Module 直接调用 `context.assets.resolve()` 的子集。
`WorldResourceLockEntryV1` 的 `resourceKind` 是闭合 enum：现有
`SUBJECT_RESOURCE_KINDS_V1` 全集，加上 `traversal-surface-profile`、`gameplay-bootstrap`、
`world-runtime-bootstrap`、`native-scene`、`native-scene-api`、`native-scene-profile` 和
`static-geometry-asset`。不得为未知字符串放宽 parser。Bundle/Dependency/Asset Lock 自身是 Package Root
文件，不伪装成 Registry resource。

现有 build input 中带 `subjectAssetManifestHash` 的 `ResolvedWorldPackageResourceArtifactV1` 同步拆成
显式 `ResolvedCanonicalWorldPackageResourceArtifactV1` 与
`ResolvedBabylonNativeWorldPackageAssetV1`。前者继续证明 Canonical Normalized IR 的 Subject Asset
闭包；后者携带完整 Asset Lock entry 和不可变字节。不得把 `subjectAssetManifestHash` 改成 optional，
也不得让一个输入类型靠字段存在性猜 Lane。Manifest 中的公共 `WorldPackageResourceArtifactV1` 继续只
表达 Package 路径、字节、法律和来源身份。

### 4.2 Scene Source 联合

```ts
type WorldPackageSceneSourceV1 =
  | Readonly<{
      kind: "canonical-execution-plan";
      authoringSchema: {
        schemaVersion: 4;
        contentHash: Sha256HashV1;
      };
      aiSchemaProjectionProfile: {
        resourceRef: string;
        contentHash: Sha256HashV1;
      };
      normalizedWorldIrSchemaVersion: 4;
      canonicalSceneExecutionPlanSchemaVersion: 1;
      authoringSpecHash: Sha256HashV1;
      normalizedWorldIrHash: Sha256HashV1;
      executionPlanHash: Sha256HashV1;
      layoutSolveReportHash: Sha256HashV1;
      canonicalSceneExecutionPlanPath:
        "targets/babylon-web/canonical-scene-execution-plan.json";
    }>
  | Readonly<{
      kind: "babylon-native-scene";
      nativeSceneBootstrapHash: Sha256HashV1;
      sceneModuleBundleHash: Sha256HashV1;
      nativeSceneContributionHash: Sha256HashV1;
      dependencyLockHash: Sha256HashV1;
      assetLockHash: Sha256HashV1;
      nativeSceneCheckResultHash: Sha256HashV1;
      sceneAuthoringRouteDecisionHash: Sha256HashV1;
      sceneAuthoringAttemptHash: Sha256HashV1;
      sceneAuthoringAttemptResultRef: string;
      sceneAuthoringAttemptResultHash: Sha256HashV1;
      nativeSceneBootstrapPath: "native/bootstrap.json";
      sceneModuleBundleManifestPath: "native/module-bundle.json";
      sceneModuleBundlePath: "native/scene.mjs";
      dependencyLockPath: "native/dependency-lock.json";
      assetLockPath: "native/asset-lock.json";
      nativeSceneContributionPath: "native/contribution.json";
      nativeSceneCheckResultPath: "native/check-result.json";
      sceneAuthoringRouteDecisionPath:
        "authoring/scene-authoring-route-decision.json";
      sceneAuthoringAttemptPath: "authoring/scene-authoring-attempt.json";
      sceneAuthoringAttemptResultPath:
        "authoring/scene-authoring-attempt-result.json";
    }>;
```

不得把 Canonical 专属字段复制到 Native member，也不得在公共壳上增加双方都只能填一半的 optional
字段。`sceneSource.kind` 是唯一分派依据。

`sceneModuleBundleHash` 的 Runtime 身份只有一种推导：

```ts
nativeSceneModuleBundleRefFromHashV1(sceneModuleBundleHash) =
  `package://native-scene-module/sha256/${sceneModuleBundleHash.slice("sha256:".length)}`;
```

该纯函数与 `NativeSceneModuleBundleRefV1` 归 `@whitebox-world/runtime-contracts` 所有。Native verified
member 必须直接暴露已解析的 `bootstrap`、`sceneModuleBundleHash` 与由该函数得到的
`sceneModuleBundleRef`；Runtime adapter 不得从 WorldPackage Root Ref、文件路径或其他 scheme 猜测 Bundle
身份。函数必须像 `worldPackageRefFromRootHashV1` 一样先拒绝零 Hash、非法前缀、非小写或非 64 位
SHA-256，再移除 `sha256:` 前缀；不得把任意 string 直接 `slice()` 成 Ref。

### 4.3 Babylon-free 持久合同归属

`BabylonNativeSceneModuleBundleManifestV1`、`BabylonNativeDependencyLockV1`、
`BabylonNativeAssetLockV1`、`NativeSceneCheckResultV1`、`BabylonNativeSceneContributionV1` 及其 exact
parser、canonical bytes、Hash 全部迁入现有 `@whitebox-world/runtime-contracts`。Route/Attempt/Result
继续归 `@whitebox-world/scene-authoring-contracts`。`@whitebox-world/world-package` 可以直接依赖这两个
纯数据合同包，但禁止依赖 `@whitebox-world/native-babylon`、Babylon、Node、TypeScript、Vite 或
Rollup。

`@whitebox-world/native-babylon` 直接消费这些合同，并只拥有 Author API、asset resolver API、审计、
构造与 replay；不得保留旧合同的兼容 re-export。该迁移不会创建新的 Native 专用 package，而是把
可持久化协议放回已经存在的 source-neutral Runtime 合同层。

## 5. Native Bundle 与锁

### 5.1 `BabylonNativeSceneModuleBundleManifestV1`

Bundle Manifest 至少冻结：

- `kind: "babylon-native-scene-module-bundle"`、`schemaVersion: 1`；
- `sceneModuleRef`、Module `id` 与 canonical entry `native/scene.mjs`；
- admitted source graph 的按 canonical relative path 排序的 source Hash；
- Bundle byte length、media type、content Hash；
- `nativeSceneApiRef`、`nativeSceneProfileRef` 及各自 resolved version/hash；
- BNA-2 Import Profile hash、TypeScript compiler options hash、bundler profile/hash；
- deterministic seed；
- `dependencyLockHash` 与 `assetLockHash`。

Bundle 只能从 BNA-2 已 admitted 的 source snapshot 产生。生产 bundler 必须复用 BNA-2 的 strict
TypeScript、external allowlist、单一 default export 与无 sourcemap/无绝对路径规则；不得 shell out 到
`worldkit native check` 或解析 CLI 文本。

Bundle 源文件可以作为审计资源进入 Root，但 Runtime entry 只加载固定 `native/scene.mjs`。任何 chunk
和静态资源必须由 Bundle Manifest 完整列举，禁止 Runtime 相对目录漫游。

### 5.2 `BabylonNativeDependencyLockV1`

Dependency Lock 使用闭合、排序的 entries，每项包含：

- `packageName`；
- `resolvedVersion`；
- `packageManifestHash`；
- `packageIntegrityHash`；
- `usage: "runtime-external" | "bundle-toolchain"`。

至少锁定安装树中的 `@babylonjs/core`、`@whitebox-world/native-babylon`、Module 实际 import 的已安装
Block/Profile package、TypeScript 和 Vite/Rollup。`nativeSceneProfileRef` 是 Registry resource，不因名字
含 Profile 就虚构同名 npm package。`@babylonjs/core`、`@whitebox-world/native-babylon` 与实际安装的 Profile package 的
`usage` 是 `runtime-external`；TypeScript 和 Vite/Rollup 是 `bundle-toolchain`。`@babylonjs/havok`
不属于 Native Module 的 import/bundle 闭包，不进入本 Lock；它由 BNA-4 的 SDK Runtime 独占并锁定。版本与 Hash 必须
从项目 lockfile 和实际安装 manifest 得出；不接受 Module 自报版本。Runtime external 与 build-only
依赖显式区分，Runtime 不加载 build-only 依赖。

### 5.3 `BabylonNativeAssetLockV1`

Asset Lock 的每个 entry 以 `assetResourceRef` 排序。BNA-3 只冻结当前已由 BNA-2 asset resolver 实际
消费且已经存在的证据，不提前发明尚未实施的 APA-1 envelope：

- `assetResourceRef`、Resource Manifest Hash；
- Package 内实际字节路径、大小、content Hash 与 media type；
- class-specific Build Record Ref/Hash；
- Asset Admission Receipt Ref/Hash 与 Publication Receipt Ref/Hash；
- `BabylonNativeStaticGeometryImportMetadataV1` 的米制尺度、Forward、Up 与 Pivot；
- Package resource 中的 license、author/source provenance 与 redistribution policy。

仓库手工 Golden 也必须由 Host 登记并提供同一组 Admission/Publication/Build Record 证据；禁止
artifact-only `scene-shell`。完整 Production Request/Result/Receipt、Provider/模型版本、Admission
Profile 和更丰富的 Bounds/Inventory 由 APA-1 冻结后 current-only 扩充，不在 BNA-3 伪造一套临时合同。

Attempt `selectedAssetResources`、两次 Candidate replay 期间由 Host 包装 asset resolver 分别记录的
resolved asset refs、Asset Lock entries
和 Package `resources` 中对应的 `static-geometry-asset` refs 必须 exact set equality。Bootstrap 当前不
声明 selected assets，因此不参与该等式。该 Host 记账不修改或复制 BNA-2 已冻结的 replay result；两次
记录还必须彼此 byte-exact 相同。

## 6. Authoring Attempt 与 Check 闭包

Native Package build 输入必须包含：

1. `SceneAuthoringRouteDecisionV1`，且 `decision.kind === "babylon-native"`；
2. 对应 `SceneAuthoringAttemptV1`，其 route ref/hash、Brief、Native bootstrap/module input、seed、profile
   和 selected assets 与当前 Package 输入一致；
3. 对应 `SceneAuthoringAttemptResultV1`，且 `outcome === "completed"`；
4. BNA-2 `NativeSceneCheckResultV1`，且 `outcome === "passed"`；
5. 双 Candidate replay 得到的 Contribution 与 Hash。

任一 Result 为 `rejected`/`tool-error`、Attempt 链断裂、Route 选择 Canonical、source/hash 不一致或 Check
不通过时，build 必须在创建 Root/Receipt/Ref 之前失败。不得为失败 Attempt 发布“诊断 Package”。

### 6.1 冻结 Builder 输入

`FrozenBabylonNativeWorldPackageBuildInputV1` 是 BNA3-00 冻结的 exact plain-data graph：

```ts
interface FrozenBabylonNativeWorldPackageBuildInputV1 {
  readonly shared: WorldPackageSharedBuildContextV1;
  readonly packageId: string;
  readonly worldId: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly resourceBudget: WorldPackageResourceBudgetV1;
  readonly nativeSceneBootstrap: BabylonNativeSceneBootstrapV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1;
  readonly nativeSceneCheckResult: NativeSceneCheckResultV1;
  readonly nativeSceneContribution: BabylonNativeSceneContributionV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly resourceArtifacts:
    readonly ResolvedBabylonNativeWorldPackageAssetV1[];
}
```

`shared` 只含双方真正共用的 title、SDK version、distribution/host compatibility、legal documents、
notice 与通用 generated-resource provenance；不得含 AuthoringSpec、ExecutionPlan、Native handles 或
`includeAuthoringSpec`。Native Host 入口先完成 filesystem/typecheck/bundle/replay，再原子冻结上述输入；
纯 builder 不接收 source paths、callbacks、Provider 或 resolver。

`worldId`、`worldBounds` 与 `resourceBudget` 是 Trusted Host 在 Authoring Attempt 前冻结并在本输入中原样
携带的世界级事实；不得从 `bootstrap.id`、Gameplay Bootstrap id、Contribution AABB 或 BNA-2
`BabylonNativeSceneAdmissionBudgetV1` 改名/反推。Manifest `seed` 唯一取
`nativeSceneBootstrap.seed`，并要求它与 `sceneAuthoringAttempt.seed` 全等。Host 必须在 Package build 前
验证 Spawn/Collider/资源清单满足这些世界事实；字段缺失或不一致时 fail-closed。

## 7. Root 文件布局与 Hash 顺序

Canonical Root 继续包含当前 Canonical 文件，但 Manifest 的专属身份移入 `sceneSource`。Native Root
至少包含：

```text
manifest.json
registry-lock.json
gameplay/bootstrap.json
runtime/world-runtime-bootstrap.json
native/bootstrap.json
native/module-bundle.json
native/scene.mjs
native/dependency-lock.json
native/asset-lock.json
native/contribution.json
native/check-result.json
authoring/scene-authoring-route-decision.json
authoring/scene-authoring-attempt.json
authoring/scene-authoring-attempt-result.json
resources/**
NOTICE
LICENSES/**
```

以下 transport metadata 永远不参加 Root Inventory：

```text
integrity.json
world-package-build-receipt.json
world-build-identity.json
signatures/**
```

唯一构建顺序：

1. 严格解析全部输入并验证 Route/Attempt/Asset/Gameplay/Runtime/Registry 闭包；
2. 通过 BNA-2 Source Admission、Bundle 与双 Candidate replay 得到 immutable Bundle/Contribution；
3. 冻结所有 Root 文件并排序生成 `fileIntegrityEntries`；
4. 对 Root inventory 计算 `worldPackageRootHash`；
5. 从 Root 派生 `worldPackageRef`；
6. 构造 source-neutral `WorldBuildIdentityV1`；Native member 精确使用 Bootstrap、Bundle、Contribution
   三个 Hash；
7. 计算 `worldBuildIdentityHash` 并构造 Build Receipt；
8. 写入 transport metadata；
9. verifier 从字节反向重放全部步骤后，才允许原子 promotion 到 Store。

不存在“临时 Root”“近似 Root”或包含 Receipt 的第二 Root。

## 8. Builder、Verifier 与 Public API

### 8.1 Builder

`@whitebox-world/world-package` 的公开纯数据 API：

```ts
createCanonicalWorldPackageV1(input): WorldPackageDirectoryV1;
createBabylonNativeWorldPackageV1(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
): WorldPackageDirectoryV1;
```

两者都是同步、纯数据、确定性的 Root/Identity/Receipt 构造器。Native 的 trusted filesystem、严格
Typecheck、Bundle、安装依赖核对和双 Candidate replay 由 `scripts/native-scene/` 中唯一异步 Host 入口
`buildTrustedBabylonNativeWorldPackageV1(...)` 完成；它把闭合结果交给
`createBabylonNativeWorldPackageV1(...)`，不得复制 WorldPackage Hash 算法或绕开 BNA-2 admission。
这样 `@whitebox-world/world-package` 不依赖 Node、Vite、TypeScript 或 Babylon。

Host 入口的输入由 world directory、上述 Trusted Host 冻结的 world/package/shared 字段、Route/Attempt/
Result、Gameplay/Runtime Bootstrap、Registry Lock、已发布 asset resources 与 Host policy 组成；输出只有
`Promise<WorldPackageDirectoryV1>` 或稳定 tool error。它内部唯一地执行 workspace read -> source
admission -> persistent bundle/dependency/asset lock -> 双 replay -> frozen input -> pure builder -> verifier；
不得接受已加载 Module callback、预制 Contribution 或调用方提供的 Package Root。

现有 Canonical-only `WorldPackageGameplayBootstrapMembershipInputV1` 和 assertion 同步 clean break 为
显式的 Canonical/Native membership 函数；公共 verifier 只负责分派，不能用 optional Plan 参数构成双
语义。

### 8.2 Verifier

`verifyWorldPackageDirectoryV1` 先验证公共 Root/Receipt/Signature 结构，再按
`manifest.sceneSource.kind` 分派：

- Canonical：解析 Spec/IR/Layout/Plan 并重放 Normalizer/Compiler；
- Native：解析 Bootstrap/Bundle/Dependency Lock/Asset Lock/Attempt/Check/Contribution，验证所有 Hash、
  exact set closure、版本和法律来源；它不执行 Provider，也不分配 Runtime Candidate。

返回类型：

```ts
type VerifiedWorldPackageDirectoryV1 =
  | VerifiedCanonicalWorldPackageDirectoryV1
  | VerifiedBabylonNativeWorldPackageDirectoryV1;
```

Native verified member 暴露解析后的纯数据和 immutable asset bytes map，不暴露 Babylon Engine、Scene、
Module build callback 或 Provider handle。

```ts
interface VerifiedBabylonNativeWorldPackageDirectoryV1 {
  readonly kind: "babylon-native-scene";
  readonly directory: WorldPackageDirectoryV1;
  readonly manifest: WorldPackageManifestV1 & {
    readonly sceneSource: Extract<
      WorldPackageSceneSourceV1,
      { readonly kind: "babylon-native-scene" }
    >;
  };
  readonly receipt: WorldPackageBuildReceiptV1;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly sceneModuleBundleHash: Sha256HashV1;
  readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1 & {
    readonly outcome: "completed";
  };
  readonly nativeSceneCheckResult: NativeSceneCheckResultV1 & {
    readonly outcome: "passed";
  };
  readonly nativeSceneContribution: BabylonNativeSceneContributionV1;
  readonly immutableAssetBytesByResourceRef:
    Readonly<Record<string, Uint8Array>>;
}
```

### 8.3 Store、File Adapter、签名与 CLI

现有 Store/File Adapter/签名只依赖公共 Root/Receipt 合同，应同时支持两种 member，不复制 source
分支。`worldkit build` 仍是 Canonical 的当前公开 build command；BNA-3 不偷改其输入语义。Native build
获得独立且明确的 Host 函数/未来 CLI 命令，不复用 `worldkit native check` 名称。正式 Runtime load 在
BNA-4 前继续对 Native fail-closed。

## 9. RuntimeHost preflight 边界

BNA-3 只让 RuntimeHost/loader 能验证并识别一个 receipt-bound Native WorldPackage：

- Package/Host policy/signature/identity 必须在 Runtime adapter factory、Candidate、Scene 或 Engine 分配前
  通过；
- Native Package 的 `RuntimeSceneSourceV1` 只能由 verified member 的 `bootstrap` 与
  `sceneModuleBundleRef` 直接构造，但 BNA-1 的 formal
  `babylon-native-scene` capability rejection 继续存在；
- rejection 发生在 adapter preflight、Candidate allocation 和 Module evaluation 之前；
- BNA-4 才删除该 rejection，并从同一 verified Bundle/Contribution 进入正式 Runtime replay、Havok 与
  Gameplay publication。

因此 BNA-3 的成功标准不是“能玩”，而是“可被可信地打包、读取、校验和拒绝在正确边界”。

## 10. 失败语义与原子性

所有 public parser 接受 exact plain-data graph，拒绝 accessor、symbol key、重复 JSON key、非 canonical
UTF-8/JSON、`-0`、NaN/Infinity、绝对路径、反斜杠、`..`、symlink 和越界文件。

稳定失败域至少覆盖：

- Manifest/Receipt/Identity/Root mismatch；
- Bundle/source graph/import profile/compiler option drift；
- dependency missing/version/integrity mismatch；
- asset missing/extra/receipt/hash/license/version mismatch；
- Route/Attempt/Result/Check/Contribution mismatch；
- Gameplay/Runtime Bootstrap/Registry Lock closure mismatch；
- failed or nondeterministic Candidate replay；
- partial write、rename race、read-after-write mismatch 与 cleanup failure。

任何失败都不得发布 WorldPackage Ref、残留临时目录、覆盖已有同 Ref 不同字节的 Package，或回退到旧
Canonical parser。cleanup failure 是明确 tool error，不能吞掉。

## 11. 验证策略

### 11.1 合同与确定性

- Canonical 与 Native parser 的 hostile-object corpus；
- 同输入重复 build、两个隔离 build root、不同文件枚举顺序得到相同 bytes/hash；
- 逐文件 tamper、missing/extra file、transport metadata 进入 Root 的负向测试；
- Canonical Root 出现 `native/`、Native Root 出现 Canonical Plan/IR 文件的负向测试；
- `sceneModuleBundleHash` 与 `package://native-scene-module/sha256/...` 不一致的负向测试；
- WorldBuildIdentity Root 后派生与 byte-exact Receipt replay；
- Canonical 现有 fixture 迁移后行为、Root 与 compiler replay 仍正确。

### 11.2 Bundle、依赖与资产

- Source snapshot、Bundle 与 Manifest exact closure；
- lockfile/installed package version 和 integrity mismatch；
- 未锁定 import、动态 URL、absolute/source-map path rejection；
- `world-package` import `native-babylon`、Native Module import Havok 的包边界负向测试；
- Asset selected/resolved/locked/packaged exact equality；
- APA published asset 与 admitted manual Golden 正向；`scene-shell`、rejected/tool-error receipt 负向。

### 11.3 生命周期与 Host

- Bundle/build/replay throw 的临时目录和 Candidate cleanup；
- Store 原子 publication、并发同 bytes 幂等、同 Ref 异 bytes fail-closed；
- Native Package 在 RuntimeHost Candidate/adapter 分配前被正式拒绝；
- Canonical load 路径没有回归。

### 11.4 门禁

每个实现切片运行 focused RED→GREEN、test census、typecheck 与 `git diff --check`。最终候选只运行一次
精确 SHA Cloud 全量门禁和一个独立 Cloud 深审；任何 P0/P1/P2 或必需门禁失败均为 NO-GO。GitHub
重复重型 CI 不作为本地等待前提。

Clean-break census 还必须证明以下旧 public symbol/field 全仓为零：`createWorldPackageV1`、
`CreateWorldPackageV1Input`、`WorldPackageBuildContextV1`、`CanonicalResourceLockEntryV1`、
`CanonicalResourceKindV1`、`canonicalResourceLockEntriesV1`、`CANONICAL_RESOURCE_KINDS_V1`、
`ResolvedWorldPackageResourceArtifactV1`、`WorldPackageGameplayBootstrapMembershipInputV1`、
`assertWorldPackageGameplayBootstrapMembershipV1`、`canonicalWorldPackageManifestV1`、
`canonicalWorldPackageFileIntegrityEntriesV1`，
以及公共 Manifest 顶层的 `authoringSpecHash` / `executionPlanHash`。Canonical 的
`includeAuthoringSpec` 作为 Lane 专属审计选择保留，但不得出现在 shared 或 Native input。

## 12. 任务依赖图

| ID | 目标与独立交付物 | depends_on | blocks | 独占所有权 | 输入 -> 输出 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BNA3-00 | 冻结 source-neutral Manifest/Receipt/verified union、全部 Babylon-free Native persistent types、Frozen input、World Resource Lock 与 clean break census | BNA-1、BNA-2 | BNA3-10..90 | `packages/world-package/src/package-contract.ts`、`package-types.ts`、`package-build.ts`、`package-directory.ts`、`index.ts`，`packages/runtime-contracts/src/*native*`/`*resource-lock*`，`packages/native-babylon` 旧合同删除，compiler/authoring/validation/Host consumer 与 contract tests | 旧 Canonical contract -> 唯一 discriminated contract 与 frozen task I/O | exact parser、hostile data、包依赖、旧 symbol/field census | main-agent-only |
| BNA3-10 | 实现 deterministic persistent bundler | BNA3-00 | BNA3-30、40 | `scripts/native-scene` bundle owner；不再定义合同 | admitted graph + frozen Bundle contract -> immutable Bundle artifacts | two-root replay、path/import/tamper、cleanup | sequential |
| BNA3-20 | 实现 installed-tree Dependency Lock resolver | BNA3-00 | BNA3-30、40 | Host dependency resolver；不再定义合同 | lockfile + installed manifests + frozen lock contract -> closed lock | version/integrity/missing/ordering/Havok exclusion | parallel-safe with BNA3-10 after BNA3-00 merged |
| BNA3-30 | 实现 Asset Lock 与 Publication/Attempt/Check closure resolver | BNA3-10、20 | BNA3-40 | asset lock/Host resolver，不改 APA producer 或 frozen contract | published assets + attempts -> closed locks | exact-set、receipt/license/hash negative matrix | sequential |
| BNA3-40 | 实现 Native WorldPackage builder、Root 后 Identity 与 Receipt | BNA3-10、20、30 | BNA3-50、60 | package build/root/receipt Native member | frozen artifacts -> directory/identity/receipt | reproducible bytes、self-reference negative | main-agent-only |
| BNA3-50 | 实现统一 verifier、Store/File/signing/CLI consumer clean break | BNA3-40 | BNA3-60、90 | package-directory/store consumers | directory -> verified union | tamper、atomic publication、Canonical parity | sequential |
| BNA3-60 | 接入 Runtime preflight 识别并保持 formal Native rejection | BNA3-50 | BNA3-90、BNA-4 | loader/preflight tests；不改 Physics/adapter Candidate | verified Native package -> pre-allocation rejection；错误文案只声明尚需 BNA-4 | no factory/Candidate/Module call | main-agent-only |
| BNA3-90 | 最终门禁、独立深审、文档/backlog 真相 | BNA3-00..60 | BNA-4..8 | review/docs/evidence only | exact SHA -> GO/NO-GO | Cloud full gates、D1-D6、clean tree | main-agent-only |

## 13. 验收标准

BNA-3 只有在以下条件同时成立时完成：

1. Canonical 与 Native 共用一个当前 WorldPackage/Receipt/Store/Host Policy 合同；
2. 旧 `createWorldPackageV1`、Canonical-only public manifest/verified type 与所有兼容路径已删除；
3. Native Bundle、Dependency Lock、Asset Lock、Route/Attempt/Check/Contribution 都进入 Root 并被重放；
4. Root inventory 排除 Identity、Receipt、integrity transport 和 signature，无自引用 Hash；
5. 同输入可重现相同 bytes/root/ref/identity/receipt；所有 tamper/missing/version mismatch fail-closed；
6. 只消费已发布 Asset 或等价 admitted Golden，不执行 Provider/promotion；
7. RuntimeHost 在任何 Native Runtime allocation 前继续 formal rejection，未提前声称 BNA-4；
8. 全部 consumer、fixture、generated artifact 和 docs 已 current-only 迁移；
9. 精确 SHA 全量门禁 GO，独立深审无未解决 P0/P1/P2；
10. PR 合入并推送 `main`，工作树干净，Backlog 精确标记 BNA-3 完成而 BNA-4+ 仍开放。
