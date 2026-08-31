# Project Health Observatory 设计

- 状态：**Proposed；PHO-0A/0B 合同与 execution envelope 已入 main，Observatory 整体仍未生产 GO**。
- 目标：在现有单元测试、整仓门禁和重型 Browser/Runtime 链路之外，持续发现架构漂移、契约双轨、生成物失配、依赖风险、测试盲区、生命周期泄漏、确定性回退、性能退化和视觉退化。
- 实施计划：[Project Health Observatory Implementation Plan](../plans/2026-08-30-project-health-observatory-implementation.md)。
- 关联协议：[全维度审查协议](../../reviews/full-dimension-review-protocol.md)、[Runtime 深审清单](../../reviews/runtime-deep-review-checklist.md)、[World Validation Report 与质量门禁](./2026-08-19-world-validation-report-and-quality-gates-design.md)。
- 任务登记：[重构进度与 Backlog / P3.7](../../18-refactor-progress-and-backlog.md#p37-project-health-observatory)。

## 1. 决策摘要

项目需要新增一个**仓库工程健康观测层**，但它不替代现有测试，也不创造第二套产品验证协议。

1. `ValidationReportV1` 继续判断一个 World/Package/Capture 是否可交付；`ProjectHealthReportV1` 只判断一个 Git Tree 的工程健康，两者不能互相转换或覆盖。
2. 现有测试、Build、Verifier、Browser、视觉和人工证据仍由原 Owner 产生。Observatory 只规划、调用、索引和归一化结果，不复制其算法。
3. 所有 Sensor 先输出关闭的 `ProjectHealthObservationV1`，聚合器再产生稳定的 `ProjectHealthFindingV1` 和 `ProjectHealthReportV1`。日志文本不是协议。
4. 运行模式固定为 `pr`、`nightly`、`release`。PR 运行确定且受影响的快速 Sensor；Nightly 运行全仓重型、重复和趋势 Sensor；Release 需要全部 Blocking Sensor 与明确的视觉/人工 Receipt。
5. 只有确定、可复现、当前树可归因的 `blocking-p0` / `blocking-p1` Finding 或 Required Sensor Incomplete 才能阻断。性能、视觉、在线漏洞库和 AI Review 在阈值与环境未冻结前保持 `advisory-p2` / `advisory-p3`，不得把不稳定信号伪装成生产事实。
6. 债务只能匹配精确 Fingerprint、Advisory Policy 和明确 Metric Cap。Blocking Finding 永不抑制；原 P1 只有先由已接受 ADR 降级为当前 `advisory-p2`，才可登记 `AcceptedProjectDebtV1`。不得使用目录/错误码通配符、无限 cap 或永久忽略。
7. Observatory 不自动改代码、不更新 Golden、不发布资产、不修改冻结 Plan/Lock。它输出证据和下一条可执行命令，由原 Owner 修复。

## 2. 为什么现有门禁仍有盲区

当前项目已有高密度单测、聚合测试、Build、Browser verifier、视觉检查和深审协议，但这些机制主要回答“已知合同是否仍通过”。大型改动还可能遗漏：

- 一个状态被两个包分别推导，测试各自通过但架构已形成双权威；
- 新文件没有进入测试 census 或受影响门禁映射；
- Schema、示例、生成类型、CLI 与 Browser 使用了不同字段；
- tracked bundle、patch、lockfile、安装字节或生成资产与源码漂移；
- create/reset/dispose 单次通过，但重复运行积累 Observer、Timer、Scene Node 或 WASM owner；
- 30/60/120 Hz、重复 Candidate Build、不同文件顺序得到不同 Hash；
- Build 仍通过，但 Bundle、WASM、内存、Tick 或截图持续退化；
- 文档把 Proposed 能力写成 Implemented，或 Backlog 状态与可执行入口冲突；
- 独立 AI Review 给出高风险线索，但没有 Host reproducer、Disposition 和复核闭环。

Observatory 的价值不是“再跑一次全部测试”，而是把这些跨门禁关系变成可查询、可归因、可趋势化的工程事实。

## 3. 权威边界

| 事实 | 唯一 Owner | Observatory 权限 |
|---|---|---|
| 产品 Schema、Runtime、Physics、Camera、Gameplay 行为 | 现有 package/Runtime Owner | 只读；调用现有 Gate，不复制实现 |
| World/Package/Capture 可交付结论 | `ValidationProfileV1` / `ValidationReportV1` | 只引用 Report Hash/状态 |
| 测试文件归属和 lane | `scripts/lib/test-gate-manifest.ts` 与现有 census | 检查覆盖和漂移，不维护平行清单 |
| Package 依赖、导出、循环和已接受边债务 | `scripts/lib/workspace-boundary.ts`、`config/workspace-boundary-debt.json` 与现有 verifier | 只消费原 Observation/Graph；不重扫、不复制 49 条存量债务 |
| Workspace graph/evidence DTO | `scripts/lib/workspace-boundary-contract.ts` | scanner、verifier、Receipt adapter 和 Observatory 共用；不得在 `scripts/project-health/` 复制 |
| Workspace scan 未覆盖的补充架构规则 | `config/project-health/authority-policy.json` | 只声明 Scene Source 互斥、双协议 Owner、公开 compat alias 等补充规则；禁止重复 workspace edge |
| Supply Chain 许可证/来源/Provider 约束 | `config/project-health/supply-chain-policy.json` | 只读匹配 exact package/version/source/license/provider snapshot；不修改 manifest、lock 或 waiver |
| Sensor 选择与阈值 | `config/project-health/profile.json` | 唯一当前 Profile；无隐式默认或 override |
| 工程健康结论 | `ProjectHealthReportV1` | Observatory 唯一聚合权威 |
| Observatory Advisory 债务 | 当前源码/ADR + `config/project-health/accepted-debt.json` | 只接受精确 fingerprint + metric cap；不复制 workspace-boundary debt，不修改 Finding 原始证据 |
| 工程健康趋势基线 | `config/project-health/baseline.json` | 只由 `health:update-baseline` 从 exact-tree accepted Report 生成；普通 check 只读 |

`ProjectHealthReportV1` 不是新的 SDK 公共协议，不进入 Registry、WorldPackage、Runtime 或 Browser。它是仓库开发工具合同，位于 `scripts/project-health/`，避免把 CI/审查概念塞入产品 package。

## 4. 稳定合同

### 4.1 ProjectHealthProfileV1

当前唯一 Profile 文件为 `config/project-health/profile.json`。它声明：

- `schemaVersion: 1`、`id` 和内容 Hash；
- `modesById.pr/nightly/release`；
- 关闭的 Sensor ID 集合、每种模式的 Required/Advisory Sensor 与 per-Sensor Required Gate 集；
- canonical 输入路径选择、capability→Gate 映射、预算和 runner 环境；
- 每个 Metric 的单位/阈值/允许的 `not-applicable` 条件，以及 Finding code→policy；
- Accepted Debt 的 per-kind cap ceiling；
- CI Artifact 保留策略。

Profile 不包含 shell 命令字符串。每个 Sensor ID 在源码 Registry 中绑定一个实现，避免配置注入和“同名不同命令”。未注册 Sensor、缺失 Required Sensor 或执行异常一律产生 `incomplete`，不能被当作通过。
每个 mode 的 Required/Advisory Sensor 集必须有序、无重复且互斥；Required Gate map 的 key 只能来自
Required Sensor，并与 §6 冻结集合一致。

初始 Sensor ID 关闭为：`workspace-boundary`、`supplemental-authority`、`contract-parity`、
`supply-chain`、`test-topology`、`runtime-health`、`performance-size`、`visual-evidence`、
`documentation-truth`、`independent-review`。新增或重命名必须 current-only 同时更新 Profile、Registry、
tests 和文档。

`pr` Required 只包含 `workspace-boundary`、`supplemental-authority`、`contract-parity` 和
`test-topology` 四个确定性静态 Sensor；`documentation-truth` 与 `supply-chain` 在首阶段为 Advisory。
Runtime、performance、visual、online dependency lookup 和 independent review 不得成为 PR Required。
`nightly` 与 `release` 的 Required 集合见 §6；退出码只由最终 Report `status` 决定，Profile 不保存
severity-to-exit 映射。

```ts
type ProjectHealthSensorIdV1 =
  | "workspace-boundary"
  | "supplemental-authority"
  | "contract-parity"
  | "supply-chain"
  | "test-topology"
  | "runtime-health"
  | "performance-size"
  | "visual-evidence"
  | "documentation-truth"
  | "independent-review";

type ProjectHealthEvidenceClassIdV1 =
  | "workspace-edge"
  | "supplemental-authority-rule"
  | "generated-byte-parity"
  | "dependency-lock-parity"
  | "dependency-provenance"
  | "license-policy"
  | "vulnerability-advisory"
  | "test-census"
  | "gate-receipt"
  | "runtime-owner-count"
  | "runtime-determinism"
  | "performance-budget"
  | "visual-golden"
  | "documentation-claim"
  | "independent-review";

type ProjectHealthMetricThresholdV1 =
  | Readonly<{ kind: "boolean"; expectedValue: boolean }>
  | Readonly<{ kind: "count"; maximumCount: number }>
  | Readonly<{ kind: "bytes"; maximumBytes: number }>
  | Readonly<{ kind: "duration"; maximumMilliseconds: number }>
  | Readonly<{ kind: "ratio"; maximumRatio: number }>;

interface ProjectHealthInputSelectorV1 {
  readonly exactPaths: readonly string[];
  readonly pathPrefixes: readonly string[];
  readonly configPaths: readonly string[];
}

interface ProjectHealthCapabilitySelectorV1 {
  readonly exactPaths: readonly string[];
  readonly pathPrefixes: readonly string[];
  readonly pathSuffixes: readonly string[];
  readonly packageIds: readonly string[];
}

interface ProjectHealthRunnerProfileV1 {
  readonly id: string;
  readonly operatingSystem: "linux" | "macos";
  readonly architecture: "x64" | "arm64";
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly browserProfileId: string | null;
  readonly hardwareProfileId: string | null;
}

interface ProjectHealthProfileV1 {
  readonly kind: "project-health-profile";
  readonly schemaVersion: 1;
  readonly id: "worldkit-project-health";
  readonly sensorIds: readonly ProjectHealthSensorIdV1[];
  readonly modesById: Readonly<Record<"pr" | "nightly" | "release", Readonly<{
    requiredSensorIds: readonly ProjectHealthSensorIdV1[];
    advisorySensorIds: readonly ProjectHealthSensorIdV1[];
    requiredGateIdsBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, readonly string[]>>>;
    runnerProfileId: string;
    maximumDurationMilliseconds: number;
  }>>>;
  readonly metricPoliciesById: Readonly<Record<string, Readonly<{
    sensorId: ProjectHealthSensorIdV1;
    kind: ProjectHealthMetricV1["kind"];
    threshold: ProjectHealthMetricThresholdV1;
    notApplicableReasonCodes: readonly string[];
  }>>;
  readonly findingPoliciesByCode: Readonly<Record<string, Readonly<{
    sensorId: ProjectHealthSensorIdV1;
    policy: "blocking-p0" | "blocking-p1" | "advisory-p2" | "advisory-p3";
  }>>;
  readonly inputSelectorsBySensorId: Readonly<Record<ProjectHealthSensorIdV1, ProjectHealthInputSelectorV1>>;
  readonly capabilitySelectorsById: Readonly<Record<string, ProjectHealthCapabilitySelectorV1>>;
  readonly capabilityGateIdsById: Readonly<Record<string, readonly string[]>>;
  readonly runnerProfilesById: Readonly<Record<string, ProjectHealthRunnerProfileV1>>;
  readonly maximumAcceptedDebtCapsByKind: Readonly<{
    count: number;
    bytes: number;
    durationMilliseconds: number;
    ratio: number;
  }>;
  readonly artifactRetentionDays: number;
}
```

所有 `commitSha` 都是被检查 checkout 的 40 位 lowercase Git commit SHA，禁止传入 `HEAD^{tree}` 的
tree-object SHA；所有 `...Hash`、`inputFingerprint`、
`fingerprint` 与 `evidenceRef` 都使用 `sha256:<64 lowercase hex>`。`subjectRefs` 只允许
`package:`、`path:`、`gate:`、`capability:` 前缀；Sensor/Metric/Gate/Owner/Reviewer ID 使用
`^[a-z0-9]+(?:-[a-z0-9]+)*$`，Code/Reason 使用 `^[A-Z0-9_]+$`，日期只接受严格
`YYYY-MM-DD`。这些都由关闭 parser 校验，不把普通 `string` 当成已验证 ID/Ref/Date/Hash。
`inputFingerprint` 由每个 Registry entry
声明的 canonical input selector 取得排序后的内容/配置 Hash，再用 `sha256CanonicalJson` 计算；
`commandHash` 对 Registry 中关闭 argv、允许环境键和实现版本的 canonical 对象计算，不能 Hash shell 文本。

### 4.2 ProjectHealthMetricV1

Metric 是关闭判别 Union，所有数值字段在名字中携带单位；它只保存观测值，阈值和 passed/failed 判定由
Profile `metricPoliciesById` 唯一拥有：

```ts
type ProjectHealthMetricV1 =
  | Readonly<{ id: string; kind: "boolean"; value: boolean }>
  | Readonly<{ id: string; kind: "count"; valueCount: number }>
  | Readonly<{ id: string; kind: "bytes"; valueBytes: number }>
  | Readonly<{ id: string; kind: "duration"; valueMilliseconds: number }>
  | Readonly<{ id: string; kind: "ratio"; valueRatio: number }>
  | Readonly<{ id: string; kind: "boolean" | "count" | "bytes" | "duration" | "ratio"; status: "not-evaluated" | "not-applicable"; reasonCode: string }>;
```

Required Metric 的 `not-evaluated` 使 Sensor `incomplete`。`not-applicable` 只有在 Profile 为该 Sensor/Metric
声明了关闭条件且输入满足时合法；否则也是 `incomplete`。对已有值的 pass/fail、Finding policy 和
Observation status 都是 Profile 派生结果，parser/aggregator 必须重算并拒绝 Sensor 自行发明的阈值。

### 4.3 ProjectHealthObservationV1

每个 Sensor 输出一个关闭对象：

```ts
interface ProjectHealthObservationV1 {
  readonly kind: "project-health-observation";
  readonly schemaVersion: 1;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly sensorImplementationHash: string;
  readonly inputFingerprint: string;
  readonly status: "passed" | "failed" | "incomplete" | "not-applicable";
  readonly metricsById: Readonly<Record<string, ProjectHealthMetricV1>>;
  readonly findings: readonly ProjectHealthFindingV1[];
  readonly evidenceRefs: readonly string[];
}
```

Sensor 不得把绝对路径、机器名、随机临时目录、访问凭证或未经归一化的 provider 文本放入稳定对象。进程 stdout/stderr 保存在非 Canonical execution envelope 中；Observation 只保存稳定摘要和内容 Hash。`evidenceRefs` 只接受 `sha256:<64 lowercase hex>` 内容地址。

### 4.4 ProjectHealthFindingV1

```ts
interface ProjectHealthFindingV1 {
  readonly kind: "project-health-finding";
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly policy: "blocking-p0" | "blocking-p1" | "advisory-p2" | "advisory-p3";
  readonly dimension: "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
  readonly code: string;
  readonly ownerId: string;
  readonly subjectRefs: readonly string[];
  readonly evidenceClassIds: readonly ProjectHealthEvidenceClassIdV1[];
  readonly metricIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
  readonly suggestedGateId: string | null;
}
```

`policy` 是 Profile `findingPoliciesByCode` 对该 Finding `sensorId + code` 推导出的稳定结果，而不是 Sensor 的第二份
裁决权威。Sensor 构造 Observation 时必须注入 exact Profile；parser/aggregator 重算并拒绝不一致的
`policy`；缺失或 Sensor 不匹配的 code policy 使 Observation `incomplete`。`suggestedGateId` 只引用 Registry
已登记 Gate；`health:explain` 再从 Registry 显示人类可执行命令，Finding/AI Receipt 永不携带自由 shell 文本。

Fingerprint 使用现有 `@whitebox-world/protocol` 的 `sha256CanonicalJson`，输入对象精确为
`{ sensorId, code, subjectRefs: sorted unique subject refs, evidenceClassIds: sorted unique stable class ids }`。
`evidenceClassIds` 使用 §4.1 的关闭类别，
不包含 evidence 字节 Hash、Metric 值、模式、文案、时间或绝对路径。同一根因因此可跨 `pr/nightly/release`
稳定；当前 `policy` 或 Metric 恶化不改变 Fingerprint，但会使旧债务不匹配。聚合器按 Fingerprint 去重，
同时保留所有内容寻址 Evidence Ref。

### 4.5 Gate receipt、review receipt 与 accepted debt

```ts
interface WorkspaceDependencyPackageV1 {
  readonly id: string;
  readonly rootPath: string;
  readonly manifestPath: string;
  readonly exportedSubpaths: readonly Readonly<{ subpath: string; targetPath: string }>[];
  readonly productionDependencyIds: readonly string[];
  readonly developmentDependencyIds: readonly string[];
}

interface WorkspaceDependencyEdgeV1 {
  readonly importerPath: string;
  readonly importerPackageId: string;
  readonly specifier: string;
  readonly targetPackageId: string;
  readonly usage: "production" | "test";
}

interface WorkspaceDependencyGraphV1 {
  readonly kind: "workspace-dependency-graph";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly packages: readonly WorkspaceDependencyPackageV1[];
  readonly edges: readonly WorkspaceDependencyEdgeV1[];
}

interface WorkspacePublicSymbolOwnershipV1 {
  readonly packageId: string;
  readonly sourcePath: string;
  readonly exportSubpath: string;
  readonly symbolName: string;
  readonly isTypeOnly: boolean;
  readonly isReexport: boolean;
}

interface WorkspaceBoundaryEvidenceV1 {
  readonly kind: "workspace-boundary-evidence";
  readonly schemaVersion: 1;
  readonly graph: WorkspaceDependencyGraphV1;
  readonly publicSymbols: readonly WorkspacePublicSymbolOwnershipV1[];
  readonly violations: readonly WorkspaceBoundaryViolationV1[];
  readonly reconciledDebtFingerprints: readonly string[];
}

interface WorkspaceBoundaryScanRequestV1 {
  readonly repositoryRoot: string;
  readonly commitSha: string;
}

interface ProjectHealthGateReceiptV1 {
  readonly kind: "project-health-gate-receipt";
  readonly schemaVersion: 1;
  readonly gateId: string;
  readonly commitSha: string;
  readonly inputFingerprint: string;
  readonly commandHash: string;
  readonly status: "passed" | "failed" | "incomplete";
  readonly evidenceRef: string;
}

interface ProjectHealthDependencyInventoryEntryV1 {
  readonly id: string;
  readonly packageName: string;
  readonly version: string;
  readonly licenseSpdxExpression: string;
}

interface ProjectHealthDependencyInventoryV1 {
  readonly kind: "project-health-dependency-inventory";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly packageManagerId: "pnpm@10.14.0";
  readonly commandHash: string;
  readonly inputFingerprint: string;
  readonly entries: readonly ProjectHealthDependencyInventoryEntryV1[];
}

interface ProjectHealthGatePlanV1 {
  readonly kind: "project-health-gate-plan";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly requiredGateIds: readonly string[];
  readonly advisoryGateIds: readonly string[];
  readonly reasonsByGateId: Readonly<Record<string, readonly string[]>>;
  readonly inputFingerprintsByGateId: Readonly<Record<string, string>>;
}

interface IndependentReviewReceiptV1 {
  readonly kind: "independent-review-receipt";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly reviewerId: string;
  readonly status: "completed" | "incomplete";
  readonly candidateFindings: readonly ProjectHealthFindingV1[];
  readonly dispositionsByFingerprint: Readonly<Record<string, "pending-host-review" | "host-confirmed" | "host-rejected">>;
  readonly evidenceRef: string;
}

type ProjectHealthMetricCapV1 =
  | Readonly<{ kind: "boolean"; acceptedValue: boolean }>
  | Readonly<{ kind: "count"; maximumCount: number }>
  | Readonly<{ kind: "bytes"; maximumBytes: number }>
  | Readonly<{ kind: "duration"; maximumMilliseconds: number }>
  | Readonly<{ kind: "ratio"; maximumRatio: number }>;

interface AcceptedProjectDebtV1 {
  readonly kind: "accepted-project-debt";
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly acceptedPolicy: "advisory-p2" | "advisory-p3";
  readonly metricCapsById: Readonly<Record<string, ProjectHealthMetricCapV1>>;
  readonly ownerId: string;
  readonly decisionRef: string;
  readonly reason: string;
  readonly expiresOn: string;
}
```

上述 `WorkspaceDependency*` / `WorkspaceBoundaryEvidenceV1` 与已有
`WorkspaceBoundaryViolationV1` 的代码 Owner 是中立的 `scripts/lib/workspace-boundary-contract.ts`；本节只冻结
其形状。`scripts/project-health/contracts.ts` 不复制这些类型或 parser。

Gate Receipt 的 `commitSha` 永远是被检查 HEAD commit；diff 的 `baseSha` 只属于 `ProjectHealthGatePlanV1`。
AI Receipt 的 GO 不是 Report 通过条件；`dispositionsByFingerprint` 必须与 candidate fingerprint 集合精确
一致，且只有逐条 `host-confirmed` 的 candidate finding 能进入 Blocking 聚合。

### 4.6 ProjectHealthReportV1

```ts
interface ProjectHealthReportV1 {
  readonly kind: "project-health-report";
  readonly schemaVersion: 1;
  readonly mode: "pr" | "nightly" | "release";
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly evaluatedOn: string;
  readonly profileHash: string;
  readonly sensorImplementationHashesBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, string>>>;
  readonly observationHashesBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, string>>>;
  readonly metricsBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, Readonly<Record<string, ProjectHealthMetricV1>>>>>;
  readonly findings: readonly ProjectHealthFindingV1[];
  readonly debtStatesByFingerprint: Readonly<Record<string, "not-applicable" | "open-advisory" | "accepted-debt">>;
  readonly status: "passed" | "failed" | "incomplete";
  readonly baselineComparisonStatus: "not-requested" | "compared" | "profile-mismatch";
  readonly changeByFingerprint: Readonly<Record<string, "new" | "resolved" | "unchanged" | "improved" | "regressed">> | null;
}
```

`rootPath`、`manifestPath`、`targetPath`、`importerPath` 与 public-symbol `sourcePath` 全部是从仓库根开始的
repo-relative POSIX path。根 Workspace Package 的 `rootPath` 唯一编码为 `"."`；其他字段和非根 `rootPath` 不允许
`.`。Parser 必须拒绝绝对路径、反斜杠、空段、`..` 段和任何逃逸仓库根的结果；Owner
不得把 `path.resolve()` 得到的机器路径发布进 Evidence。Graph 要求 package `id` / `rootPath` /
`manifestPath` 唯一、每个 package 的 export `subpath` 唯一、edge 按
`importerPath+specifier+targetPackageId+usage` 唯一，且 importer/target package 与最长匹配
`rootPath` 所有权可解析。`publicSymbols` 按 `packageId+exportSubpath+symbolName+isTypeOnly` 唯一，
必须引用已有 package、该 package 已声明的 export subpath，以及该 package 拥有的 `sourcePath`。
空 `publicSymbols` 合法。`graph.commitSha` 只能是 Host/`health:record` 注入的 40 位 lowercase commit SHA，
禁止 `HEAD` 或 tree object name；scanner 不得自行 spawn Git。Workspace 旧债务的稳定 fingerprint 精确为
`sha256CanonicalJson({ importer, specifier, owner })`，字段值先按现有 verifier 的 repo-relative/Package ID
规范化；`reason`、`removalGate`、文案、机器路径和扫描顺序都不参与 identity。PHO-0A 的对抗 fixture
必须证明这套算法与当前 49 条债务逐项一致，并拒绝把说明字段混入 fingerprint。

`dependency-inventory` Owner 将 `pnpm licenses list --json` 的 license-grouped 输出展平为每个 exact
`packageName + version + licenseSpdxExpression` 一项，`id` 规范为 `${packageName}@${version}`，再按
`packageName`、`version`、`licenseSpdxExpression` 排序并去重。原始 `paths`、`author`、`description`、
`homepage` 和输出顺序一律丢弃；它们不得进入 DTO、Hash 或 Evidence。缺失 name/version/license、同一
package/version 出现冲突 license、原始命令非零或不符合 pnpm 10.14.0 输出合同都使 Gate
`incomplete`。Workspace/private/patch 的来源与 provenance 由 manifests 和 `contract-parity` Receipt
补充，不能塞回 inventory 形成第二个 lock/source parser。

Report 绑定：

- exact Git commit SHA，而不是 tree object 或可移动 branch 名；
- Profile 内容 Hash、Sensor 实现 Hash 集合和模式；
- 每个 Required Sensor 的 Observation Hash/状态；
- 去重后的 Findings；
- 每个已选 Sensor 的完整 canonical Metric snapshot；
- `status: passed | failed | incomplete`；
- 可独立重放的 Profile/Sensor 实现身份，以及与基线对比的
  `new/resolved/unchanged/improved/regressed` Fingerprint 集合。

`metricsBySensorId` 从每个 Observation 拷贝完整的验证后 Metric map，使未超阈值的性能/规模趋势也能独立
比较；每个 Finding `metricIds` 必须在其 `sensorId` map 中精确存在。债务 cap 与 fingerprint baseline 比较
只读这份快照，不能依赖另一个未绑定的 artifact。`changeByFingerprint` 判定固定为：baseline 无而 current 有是
`new`；baseline 有而 current 无是 `resolved`；两边 policy 与全部 Metric canonical bytes 相同是
`unchanged`；同 fingerprint 下 policy 降级或所有变化 Metric 均朝通过阈值改善是 `improved`；policy 升级
或任一 Metric 朝失败阈值恶化是 `regressed`。同一次比较若同时包含改善和恶化，以 `regressed` 为准。
未提供 baseline 时 `baselineComparisonStatus: "not-requested"` 且 change map 为 `null`；Profile Hash 或
Sensor implementation Hash 集合不一致时为 `profile-mismatch`、change map 为 `null`，且请求了 baseline 的
Report 必须 `incomplete`。只有身份相同才可 `compared`。`debtStatesByFingerprint` 同样只含当前 Finding；
已消失的债务项不进入 Report。

三个 `...BySensorId` map 的 key 集合必须精确等于当前模式 Required 与 Advisory Sensor 的并集；`Partial`
只表达模式子集，不允许漏项或额外 Sensor。

Policy 顺序固定：

1. Required Sensor 缺失、崩溃、超时、输出非法或输入漂移，Report 为 `incomplete`；
2. 任一 Required Observation 为 `failed`，或存在 `blocking-p0` / `blocking-p1` Finding，Report 为 `failed`；Blocking Finding 永不债务化；
3. 全部 Required Sensor 为 `passed`/合法 `not-applicable` 且无 Blocking Finding，Report 为 `passed`；
4. Advisory Finding 只有在 exact Fingerprint、相同 Advisory Policy、全部 Metric 不超过 cap 且债务未到期时才标记 `accepted-debt`；否则仍为开放 Advisory；
5. Advisory Finding 始终保留，不能改变 Blocking 事实，也不能被综合分数抵消。

## 5. Sensor 体系

### 5.1 Architecture Authority Sensor

PHO-1 先扩展现有 `scripts/lib/workspace-boundary.ts` 唯一 Owner，使同一次 TypeScript walk 返回关闭的
`WorkspaceBoundaryEvidenceV1`（完整 `WorkspaceDependencyGraphV1`、hashable `publicSymbols` 权威事实、
原 violations、已协调 debt fingerprints）。公开符号投影来自各 package export target 的导出声明，不是第二次
`rg`/glob/AST。现有 verifier 改为消费该结果。Owner 不写 Receipt：`health:record` 只执行该 Owner 一次，把
canonical evidence 写入 content-addressed store，并让 Gate Receipt 的 `evidenceRef` 指向它。扫描入口是
`scanWorkspaceBoundaries({ repositoryRoot, commitSha })`；`commitSha` 由 Host/`health:record` 注入，scanner
不得 spawn Git。`sensors/workspace-boundary.ts`、`sensors/supplemental-authority.ts` 和 `change-impact.ts`
都只能读这份 evidence，不得再次扫描。二者分别输出 `sensorId: "workspace-boundary"` 与
`sensorId: "supplemental-authority"`，不得产生第三个 `architecture-authority` ID，也不得重新扫描或重新判定
undeclared dependency、export、cycle 和现有边债务。

`authority-policy.json` 只补充原 Owner 未表达的规则，选择器复用 capability selector 形状
`{ exactPaths, pathPrefixes, pathSuffixes, packageIds }`，禁止 glob/regex，至少一组选择器非空，且**不**要求
当前树命中（与 Profile capability selector 不同）。关闭规则 kind 只有：

- `forbidden-public-symbol`：selector + `symbolNames`；
- `unique-public-symbol-owner`：selector + `symbolNames` + `ownerPackageId`；若 `packageIds` 非空，owner 必须属于该列表；
- `forbidden-public-symbol-pair`：`left`/`right` 各自 `{ selector, symbolNames }`，替换旧 `forbidden-owner-pair`。

Exception 是精确 `{ ruleId, packageId, sourcePath, symbolName, decisionRef }`，不是 capability `subjectRefs`。
首个 Policy 用这些 kind 表达 Canonical/Native Scene Source 互斥、`parseCanonicalSceneExecutionPlanV1` 的唯一
parser Owner、以及 `parseAuthoringSpecV2`/`V3`、`hashValidationReportCompat`、`legacyParseWorld` 这类公开
compat alias。不得把仍在使用的 `hashValidationReportV1`/`V2` 写成 forbidden 名。

现有 `config/workspace-boundary-debt.json` 仍是 workspace edge 的唯一债务账本；49 条存量边不得复制到
`accepted-debt.json`。Authority Sensors 不靠关键字直接判 P0；`compat`/`legacy`/`V2` 关键字只能由 Sensor 从
同一份 `publicSymbols` 派生 `advisory-p3` 候选，不得再开第二次 collection。只有精确 supplemental forbidden
rule 才可发出 `blocking-p1`；Policy 的 exception set 只声明精确合法符号，不反向充当 forbidden list。

### 5.2 Contract and Generated-Parity Sensor

复用现有 Schema parser、clean-break verifier、Builder bundle self-check、patch/lock/installed-byte identity和 artifact owner 命令，检查：

- Schema、类型、示例、CLI、Browser 和生成物字段一致；
- 生成文件与源码输入 byte/hash parity；
- lockfile、patch、安装版本和声明版本一致；
- fixture/receipt 的 Owner 命令可以只读重放且 repository state 保持干净。

不得实现第二个 Schema parser 或第二套 Hash 算法。

### 5.3 Supply Chain Sensor

`supply-chain` 只读 workspace manifests、`contract-parity` 的 exact lock/install/patch Receipt、PHO-0B
执行冻结 `pnpm licenses list --json` argv 所产生的 `dependency-inventory` Receipt、许可证 Policy 和受控漏洞数据库快照：

- lock/安装字节/patch 的确定性 parity 继续由 `contract-parity` 原 Owner 裁决，Supply Chain 只引用其 Receipt，
  不重复安装或重新实现 lock parser；
- `dependency-inventory` 是 npm/pnpm declared closure 的唯一清单 Owner；Supply Chain 只解析这份关闭 DTO，
  不直接解析 lockfile，也不实现另一套依赖闭包。undeclared workspace import 仍由 workspace-boundary
  唯一 Owner 裁决。来源不明或许可证违反冻结 Policy 可形成确定性 Finding；
- 在线 CVE/维护状态/弃用信息必须绑定 provider、数据库快照时间与 package version，默认
  `advisory-p2/p3`。在 PR/Nightly 中 Provider 不可用使 Advisory Observation `incomplete`；Release 的
  Required Supply Chain 只要求本地 inventory/source/license 完整，在线 Provider 不可用使用 Profile
  明列的 `SUPPLY_CHAIN_ONLINE_PROVIDER_UNAVAILABLE` 合法 `not-applicable` reason，同时保留 Advisory
  Finding，不能伪装成“无漏洞”；
- 不自动升级依赖、改 lockfile、批准 install scripts 或写 waiver。任何接受都走 exact Fingerprint 的
  `AcceptedProjectDebtV1` 或独立 ADR。

### 5.4 Test Topology and Change Impact Sensor

以现有 test census 为唯一测试归属输入，再结合 Git diff、dependency graph 和显式 capability mapping 计算 Required Gates：

- 新测试是否进入恰当 lane；
- 被修改的公共合同是否存在行为级 RED→GREEN regression；
- 改动是否触及 Browser、Build、Runtime、视觉或人工证据但计划漏跑；
- PR Gate 记录是否来自 exact tree，是否被后续输入改动失效；
- Nightly 对 flaky candidate 做多次隔离重放，记录稳定 fingerprint，不自动重试成绿色。

Observatory 只给出 Gate Plan 和证据完整性；原命令仍是行为事实 Owner。
对 mode `M`，`requiredGateIds` 必须精确等于受影响候选 Gate 与
`modesById[M].requiredGateIdsBySensorId` 全部值的交集；其余已注册且受影响的 Gate 进入
`advisoryGateIds`，表示应在 Nightly/Release 补跑，不能让 PR 因没有非 PR Receipt 而
`incomplete`。两个集合必须有序、互斥且覆盖所有已登记受影响 Gate；未知 capability 或 Gate 仍 fail-closed。
首个 Profile 的 `capabilityGateIdsById` 关闭为 §6 表中的 capability key 与 Gate ID，不允许 PHO-3
根据路径文案自行发明分类。

### 5.5 Runtime Lifecycle and Determinism Sensor

在 Nightly/Release 的隔离进程中执行固定 fixture：

- create → ready → reset/rebind → dispose，重复至少三轮；
- partial construction、provider throw、cleanup throw 和 retry；
- 30/60/120 Hz-like render cadence 与固定 Tick；
- 同输入的双 Candidate Build、文件顺序扰动和多实例隔离；
- Babylon Scene Node/Observable、DOM listener、Timer、Worker、Havok/Recast owner 和临时文件的前后计数。

泄漏判定必须使用 Owner 提供的可观测计数或已验证 provider probe；GC 后 heap 波动只能作为趋势，不能单独形成 Blocking Finding。
以上是 Sensor 可接入的能力菜单，不等于首个 Profile 的 Required 执行集。尤其双 Candidate Build 属于
BNA 实验 probe：在对应 BNA 生产设计 GO 前只能产生 Advisory Observation/Metric，缺失或失败不得使
Nightly/Release Required `runtime-health` 变为 `incomplete`/`failed`；首个 Required 集只采用 §6.1
已生产 RuntimeHost、Browser 和 fixed-cadence Owner。

### 5.6 Performance and Size Sensor

记录 bundle/WASM/asset bytes、构建时长、固定场景 CPU Tick、峰值 owner 数和内存趋势。阈值绑定 runner profile；跨机器结果不直接比较。PR 只阻断确定的静态预算，动态性能在 Nightly 收集至少一个稳定基线窗口后才可提升为 Blocking。

### 5.7 Visual and Interaction Evidence Sensor

复用现有 capture/verifier 输出：

- exact scene/camera/profile/viewport/renderer identity；
- pixel diff、结构 mask、collider overlay、opening anchors 和 tri-view completeness；
- 人工交互 Receipt 的 exact tree、case、输入设备、结论和未覆盖项。

视觉启发式和 VLM 评语默认 Advisory。只有冻结 Golden、renderer profile、容差和负向 fixture 后，某个具体 Metric 才能升级为 Blocking。Observatory 不更新 Golden。

### 5.8 Documentation Truth Sensor

检查链接、命令入口、package 名、Backlog task ID、状态锚点和“Implemented/Proposed/Experimental”声明。机器可确认的矛盾可 Blocking；自然语言语义候选进入 Advisory Review Queue，由人或独立 Agent 复验。

### 5.9 Independent Review Sensor

Cursor Cloud/Codex 独立审查只产生 `IndependentReviewReceiptV1` 和候选 Finding。AI 的 `GO` 不能让 Report 通过；AI 的 P0/P1 也必须由 Host 在 exact tree 上复现或通过当前源码证据裁决后，才能成为 Blocking Finding。超时、无输出、错误 SHA，或任一 candidate 仍为 `pending-host-review`，都使 Review Observation 为 `incomplete`；`status: "completed"` 要求每个 candidate 均已逐条 `host-confirmed` 或 `host-rejected`。

## 6. 三种运行模式

| 模式 | 触发 | 必需内容 | 默认阻断策略 |
|---|---|---|---|
| `pr` | Pull Request exact head SHA；或现有 CI 的 `main` push exact after SHA | Required：workspace-boundary 原 Receipt、supplemental authority、contract/generated parity、test topology/change-impact；Advisory：documentation truth、supply chain；受影响 Gate 只消费同一 CI 前序 step 的 exact-head Receipt | deterministic Blocking、Required incomplete 阻断；不重复运行 owner command |
| `nightly` | `main` 定时/手动 exact SHA | §6.1 Nightly Required Gate；重型 Runtime、重复确定性和生命周期；未冻结 performance/visual/supply-chain/review 保持 Advisory | 合同/已冻结泄漏/确定性阻断；未冻结趋势 Advisory |
| `release` | 明确 Release Candidate SHA | §6.1 Release Required Gate；冻结视觉/人工 Receipt、本地 Supply Chain 清单和独立深审 disposition | 任一 Required 缺失或 Blocking Finding 阻断；在线信号只按冻结 Policy 裁决 |

首个 Profile 的 PR `requiredGateIdsBySensorId` 精确为：

| Sensor | Required Gate IDs | 当前 Owner command |
|---|---|---|
| `workspace-boundary` | `workspace-boundaries` | `pnpm verify:workspace-boundaries` |
| `supplemental-authority` | 空 | Sensor 只读同一 graph evidence 与 frozen Policy |
| `contract-parity` | `agent-self-check`、`typecheck`、`playground-build`、`tracked-tree-clean` | 当前 CI 对应的 self-check/typecheck/build/最终 diff |
| `test-topology` | `test-census`、`test-studio`、`test-independent`、`test-contract`、`test-resource-heavy` | 当前 CI 的两个独立 lane，加上 `pnpm test` 现有四组成项中除 workspace-boundaries 外三项 |

PR 不要求当前 CI 未执行的 BNA/Route/Canonical/Artifact 专项 clean-break；这些只能进入 Nightly/Release
对应的明确 Gate ID 集。任一 Required Gate ID 不在 Registry、Receipt 缺失，或 Profile 集合不是当前 CI
一次执行集合的子集，Report 必须 `incomplete`，不得悄悄缩小检查面。
Receipt 完整性的唯一权威是当前 mode 的 Profile `requiredGateIdsBySensorId` 全量闭包：即使 docs-only
GatePlan 的 `requiredGateIds` 为空，CI 仍须一次执行并校验该 mode 的全部固定 Required Receipt。
GatePlan 只说明哪些已登记 Gate 被本次 diff 直接影响、哪些额外 Gate 应在后续模式补跑；它不能缩小
Profile 的固定 CI 闭包，也不能把 Advisory Gate 升格为当前 mode Required。

### 6.1 首个 Profile 的模式闭表

Sensor 集合精确为：

| Mode | Required Sensor IDs | Advisory Sensor IDs |
|---|---|---|
| `pr` | `workspace-boundary`、`supplemental-authority`、`contract-parity`、`test-topology` | `supply-chain`、`documentation-truth` |
| `nightly` | `workspace-boundary`、`supplemental-authority`、`contract-parity`、`test-topology`、`runtime-health` | `supply-chain`、`performance-size`、`visual-evidence`、`documentation-truth`、`independent-review` |
| `release` | `workspace-boundary`、`supplemental-authority`、`contract-parity`、`supply-chain`、`test-topology`、`runtime-health`、`visual-evidence`、`documentation-truth`、`independent-review` | `performance-size` |

Nightly/Release 的 `requiredGateIdsBySensorId` 精确为：

| Sensor | Nightly Required Gate IDs | Release Required Gate IDs | Owner command / evidence |
|---|---|---|---|
| `workspace-boundary` | `workspace-boundaries` | 同 Nightly | `pnpm verify:workspace-boundaries` |
| `supplemental-authority` | 空 | 空 | 同一 workspace evidence + frozen supplemental Policy |
| `contract-parity` | `agent-self-check`、`typecheck`、`playground-build`、`unreleased-clean-break`、`tracked-tree-clean` | 同 Nightly | `pnpm check:agent-self-check`、`pnpm typecheck`、`pnpm build`、`pnpm verify:unreleased-clean-break`、最终 tracked diff |
| `supply-chain` | 不适用（Advisory） | `dependency-inventory` | PHO-0B 冻结 argv：`pnpm licenses list --json`；同时引用 exact lock/install/patch Receipt |
| `test-topology` | `test-census`、`test-studio`、`test-independent`、`test-contract`、`test-resource-heavy` | 同 Nightly | 现有五个测试 lane；每个只执行一次 |
| `runtime-health` | `canonical`、`placement-layout`、`rigged-subject`、`g-bot-subject`、`control-capture`、`validation-capture`、`route-r0-contract`、`route-r1-heightfield`、`route-r1b-static-platform`、`outdoor-gameplay` | 同 Nightly | 对应现有 `pnpm verify:*` command |
| `visual-evidence` | 不适用（Advisory） | 空 | Sensor 校验冻结 Release evidence manifest 中的 Golden/人工 Receipt，不调用 update command |
| `documentation-truth` | 不适用（Advisory） | 空 | Sensor 自身的 repo-relative link/status/command observation |
| `independent-review` | 不适用（Advisory） | 空 | exact-tree `IndependentReviewReceiptV1` + 全部 Host disposition |

`performance-size` 保持 Advisory，直到 runner profile、稳定窗口、阈值和负向 fixture 另行冻结；它不因出现在
Release 就获得阻断权。`supply-chain` 在 Release 是 Required，但只对 deterministic local
inventory/source/license 完整性 fail-closed；在线 advisory 按 §5.3 的显式 `not-applicable` 规则处理。

实验 Gate `native-scene-playground`、`bna1-clean-break`、`3c-migration` 不在上述 Required 集合。
它们可由 Change Impact 放进 `advisoryGateIds`，并只在对应 BNA/3C 生产设计正式 GO 后通过一次
current-only Profile 修改升级；不得把实验失败伪装成全仓 Nightly/Release 阻断，也不得同时保留旧新集合。

### 6.2 首个 capability → Gate 闭表

| Capability key | Gate IDs |
|---|---|
| `workspace-graph` | `workspace-boundaries` |
| `agent-self-check-bundles` | `agent-self-check` |
| `typescript-public-contract` | `typecheck`、`test-contract`、`unreleased-clean-break` |
| `studio-surface` | `test-studio` |
| `independent-test-surface` | `test-independent` |
| `resource-heavy-runtime` | `test-resource-heavy` |
| `test-registration` | `test-census` |
| `playground-build-surface` | `playground-build` |
| `canonical-browser-runtime` | `canonical`、`control-capture`、`validation-capture`、`outdoor-gameplay` |
| `placement-and-subject-runtime` | `placement-layout`、`rigged-subject`、`g-bot-subject` |
| `trusted-route-runtime` | `route-r0-contract`、`route-r1-heightfield`、`route-r1b-static-platform` |
| `native-scene-experimental` | `native-scene-playground`、`bna1-clean-break` |
| `three-c-migration-experimental` | `3c-migration` |
| `documentation-only` | 空 |

Profile parser 要求 key 集和有序 Gate 值与本表精确一致。PHO-3 的路径/Package/capability edge 只能指向这些
key；发现未登记能力时产生 `PROJECT_HEALTH_CAPABILITY_UNREGISTERED` 并 fail-closed，不能靠猜测扩大或缩小门禁。

`capabilitySelectorsById` 的 key 集必须与上表精确相等。值只使用 repo-relative POSIX exact path、目录
prefix、文件 suffix 和 Workspace Package ID，不接受 glob、regex 或 shell；数组有序、去重。首个 Profile
按以下关闭范围填充，重叠是显式的：一次改动可同时命中多个 capability，Gate 最终去重。

| Capability key | Initial selector closure |
|---|---|
| `workspace-graph` | root `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`、全部 Workspace `package.json`、`config/workspace-boundary-debt.json`、workspace scanner/verifier |
| `agent-self-check-bundles` | `.codex/skills/`、`.agents/skills/`、`scripts/agents/` |
| `typescript-public-contract` | `apps/`、`packages/`、`scripts/` 下 TypeScript/JavaScript/JSON source 与 root TS/Vitest config |
| `studio-surface` | `apps/studio/`、Package ID `@whitebox-world/studio` |
| `independent-test-surface` | `scripts/testing/run-independent-test-gate.ts` 及其 Node/Site census inputs |
| `resource-heavy-runtime` | `packages/runtime-babylon/`、`packages/runtime-host/`、`packages/traversal-recast/`、Browser/integration test inputs |
| `test-registration` | `scripts/lib/test-gate-manifest.ts` 与 suffix `.test.ts` / `.browser.test.ts` |
| `playground-build-surface` | `apps/playground/`、其 Vite config、root build dependency/config inputs |
| `canonical-browser-runtime` | `apps/playground/`、`packages/runtime-contracts/`、`packages/runtime-host/`、Canonical/Capture/Outdoor verifier inputs |
| `placement-and-subject-runtime` | `packages/layout-solver/`、`packages/authoring/`、`packages/subject-*` 与对应 verifier inputs |
| `trusted-route-runtime` | `packages/traversal/`、`packages/traversal-recast/`、`packages/validation/` 与 Route verifier inputs |
| `native-scene-experimental` | `packages/native-babylon/`、`packages/native-babylon-block-profile/`、`apps/native-scene-playground/`、当前真实 Owner `scripts/native-scene/` |
| `three-c-migration-experimental` | `packages/camera/`、`packages/character-movement/`、`packages/subject-actions/` 与 Runtime Babylon 的 3C adapter inputs |
| `documentation-only` | `docs/`、`AGENTS.md`；只有 change set 全部命中该 selector 且未命中非文档 capability 时才是 docs-only |

PHO-0A 将这些集合逐项展开成 `profile.json` 的精确字符串数组；表中“全部 Workspace manifest”或
“对应 verifier inputs”不是运行时启发式，而是实施时从当前 exact tree 枚举并冻结的初始值。新增顶层目录、
Workspace Package 或 verifier input 若没有同步登记，PHO-3 必须 fail-closed。
每个 capability selector entry 在 PHO-0A 冻结时必须至少命中当前 exact tree 的一个路径或 Workspace Package，
且每个 capability 至少有一个 entry；任一 entry 为空或 capability 无 entry 时，Profile parser/fixture 以
`PROJECT_HEALTH_CAPABILITY_SELECTOR_EMPTY` fail-closed。不能预登记尚不存在的目录，
也不能用 Profile 固定全量 Receipt 掩盖无效的 change-impact 归因。

Pull Request checkout 必须显式使用 `pull_request.head.sha` 并取得 base 的 merge-base 所需历史；`main` push
使用 event `after` 作为 `commitSha`、`before` 作为 change-impact base，并验证两者 ancestry。merge/base SHA 只用于 change-impact，不能进入
`report.commitSha`。网络漏洞库、Cloud AI 和硬件性能不稳定时，运行本身必须标注 `incomplete` 或 Advisory；
它们不属于 PR Required，不能拖垮 deterministic PR Gate。PR `health:pr` 禁止重跑现有 typecheck/test/build，
只校验前序 step 写出的 `ProjectHealthGateReceiptV1` 的 tree/input/command identity。PHO-6 提供唯一
`health:record`：它通过 PHO-0B 执行 Registry-owned gate 一次并原子写 Receipt；PHO-7 用它替换当前 CI 中
对应的直接命令，而不是在原命令后追加第二次执行。聚合 `pnpm test` 在 CI 中按其现有四个组成命令各执行
一次并分别收据化，保留相同测试语义和 per-gate identity。

## 7. Explain 与开发者体验

稳定入口：

```text
pnpm health:pr -- --commit <head-sha> --base <git-ref> --receipts <directory> --output .project-health/report.json
pnpm health:nightly -- --output .project-health/report.json
pnpm health:release -- --commit <sha> --output .project-health/report.json
pnpm health:explain -- <report.json> [--fingerprint <sha256:...>] [--json]
pnpm health:update-baseline -- --commit <sha> --report <report.json> --output config/project-health/baseline.json
```

Exit Code：`0 = passed`、`2 = failed`、`3 = incomplete`、`1 = usage/infrastructure error`。`explain` 输出 Finding 的 Owner、证据、失效输入、建议的原始 Gate 命令和债务状态，不自动修复。

本地产物写入被忽略的 `.project-health/`；CI 上传 Report、Observation 和稳定 Evidence Bundle。任何 tracked
baseline 更新必须使用独立 `health:update-baseline` 命令，验证 exact tree/report/profile 后产生 diff 并经过
Review；`health:pr/nightly/release` 不接受 `--update-baseline` flag，普通 check 永不写 tracked 文件。

## 8. 债务、趋势与告警

`config/project-health/accepted-debt.json` 每项必须匹配 §4.5 的关闭合同。解析器只验证 `expiresOn` 是
`YYYY-MM-DD` 和 cap Union/非空 map 合法；是否到期由 Report 的 `evaluatedOn` 在聚合时判定。正式
PR/Nightly/Release 的 `evaluatedOn` 只能由 trusted Host UTC clock 产生并冻结到 Report，CLI 不接受任意日期
override；测试 fixture 可通过内部依赖注入固定 Clock。`evaluatedOn === expiresOn` 的当日仍有效，只有
`evaluatedOn > expiresOn` 才算到期。数值 cap 必须是 finite、非负；count/bytes/duration 必须是 safe integer，
ratio 不得超过 `1`，且所有 cap 还不得超过 Profile `maximumAcceptedDebtCapsByKind` 的冻结上限。
当前 Finding 为 Blocking、Policy
升级、任一 Metric 超过 cap、债务到期或 Fingerprint 变化时，旧债务自动失效。它不得包含或镜像
`config/workspace-boundary-debt.json` 的边。Resolved Finding 保留在 CI 趋势数据中，不写回源码仓库。

告警按根因去重：同一 Fingerprint 在 PR、Nightly 和 Release 只开一个问题；状态变化使用
`new/unchanged/improved/resolved/regressed`。Observatory 首阶段只生成 Report 和 CI Summary，不自动创建
GitHub Issue 或发送外部消息；自动通知需后续独立授权。

## 9. 安全、性能与失败语义

- Sensor 只使用 Registry 冻结的 execution scope：PR 的既有 Gate 在 exact checkout 中以
  `in-place-checkout` 执行并比较执行前后 tracked、untracked 与 Registry-owned `.project-health/runs`、
  `.project-health/worktrees` 基础设施根之外的 repository state；Nightly/Release 的动态 Probe 可使用
  `isolated-temp-worktree`。两者的声明输出都只能写 scene-owned/`.project-health/` 临时根。需要启动 Server/Browser
  的 Sensor 必须登记并在 `finally` 清理。
- `in-place-checkout` 只接纳仓库内已登记、已有 Owner 的 trusted Gate，不是任意代码的文件系统沙箱。Runner
  通过关闭 argv/环境、repo-relative cwd、tracked + untracked repository-state 前后 Hash（仅排除上述
  Registry-owned 基础设施根）和临时根清理来证明
  仓库内无残留；需要对恶意代码或任意仓库外写入建立 OS 级边界的 Probe 必须进入现有 Hosted/容器隔离入口，
  不能把跨平台本地进程包装器误称为安全沙箱。
- ignored-root 额外状态指纹有独立的 5 秒、8 MiB 和 4096 entry 上限；超限、初始化失败或读取竞态都发布
  `infrastructure-failed` Evidence，而不是抛出未归属异常或继续运行 Owner。
- Repository、`.project-health`、`runs`、`worktrees` 和每个临时 Owner 根在创建、使用与清理前都必须通过
  `lstat + realpath + device/inode` 的 canonical non-symlink identity 校验；身份漂移只允许 fail-closed，
  禁止跟随替换后的路径执行递归清理。
- 所有外部命令和动态 Probe 只能经过 PHO-0B 冻结的单一 execution envelope/process runner；各 Sensor 不得自行 spawn、实现 timeout、重定向日志或清理进程。
- 每个可信本地 Registry descriptor 必须声明 `descendantOwnershipMode: "inherit-owner-token"`；Owner
  启动的全部后代必须继承 Host 注入的 owner token，且不得创建 tokenless session。PHO-6 Registry
  admission 拒绝其他值，生产 runner 只能由该 Registry 调用。无法满足该协作式归属合同，或需要抵御
  恶意代码、任意路径写入的 Probe，必须进入 Hosted/容器 OS 隔离；正式本地 runner 只支持 Profile
  已冻结的 Linux/macOS 环境。
- 不把仓库凭证、Cursor/Gemini/LWDP token、用户 home、绝对路径或环境快照写入证据。
- 子进程有明确 timeout、输出上限和 cooperative owned-process cleanup；超时是稳定 `incomplete`，不是自动重跑。
- PR 的总 `maximumDurationMilliseconds` 初值不得超过现有 CI `timeout-minutes: 20`；PHO-7
  只能依据 exact-head dry-run 收据量得新增开销并在这个上限内分配，不能凭估计抬高 timeout。
  重型重复测试留在 Nightly。
- Sensor 失败不能阻止其他独立 Sensor 产出证据；聚合器最终统一裁决。
- 所有集合先排序再 Hash；相等使用 `===` / `!==`，判空使用 `lodash-es` 的 `isNil` / `isEmpty`。

## 10. 依赖工作图

| ID | Goal / 独立交付物 | depends_on | blocks | 独占 Owner | 输入 → 输出 | 验证证据 | 模式 |
|---|---|---|---|---|---|---|---|
| PHO-0A | 冻结全部 current-only DTO、Profile、Workspace evidence contract、补充 Authority/Supply Chain Policy 与 debt fixtures | 无 | PHO-0B、PHO-1..8 | `contracts.ts`、`workspace-boundary-contract.ts`、`profile.json`、`authority-policy.json`、`supply-chain-policy.json`、`accepted-debt.json` | 设计 → parsable contracts/config | parser adversarial tests、canonical hash | sequential, main-agent-only |
| PHO-0B | 冻结唯一 execution envelope/process runner | PHO-0A | PHO-2、PHO-3、PHO-4、PHO-5 | `process-runner.ts` | closed trusted Host argv/probe descriptor → bounded redacted execution evidence | timeout/owner-token/repository-state/cleanup fixtures | sequential, main-agent-only |
| PHO-1 | 扩展现有 workspace graph Owner；实现两个 Authority Sensor | PHO-0A | PHO-3、PHO-6 | `workspace-boundary.ts`、两个同名 sensor + adapter | one scan + supplemental policy → two Observations/full graph | graph/receipt/original-debt identity、dual-owner/compat fixtures | sequential, main-agent-only |
| PHO-2 | Contract/Generated 与 Supply Chain Sensors | PHO-0B | PHO-6 | `contract-parity.ts`、`supply-chain.ts` | owner receipts/locks/license policy/advisory snapshot → two Observations | drift/provenance/license/stale-provider + clean-tree fixtures | sequential |
| PHO-3 | Test Topology 与 Change Impact Planner | PHO-0B、PHO-1 | PHO-6、PHO-7 | `change-impact.ts` | Registry-owned Git diff + existing dependency graph/test census → Gate Plan | exact-head/public-contract/browser/build fixtures | sequential |
| PHO-4 | Runtime Lifecycle/Determinism Sensor | PHO-0B | PHO-6、PHO-7 | runtime sensor + probe registry | registered probes → Observation | repeat/reset/throw/30-60-120 evidence | sequential |
| PHO-5 | Performance/Visual/Docs/Review Sensors | PHO-0B | PHO-6、PHO-7 | `performance-size.ts`、`visual-evidence.ts`、`documentation-truth.ts`、`independent-review.ts` | owner artifacts/profile → Observations | budget/renderer/link/status/review fixtures | sequential |
| PHO-6 | 创建 Registry；聚合 Report、Policy、Evidence Store 与 CLI | PHO-1..5 | PHO-7、PHO-8 | Registry、report、CLI、root `package.json` | Observations/debt → Report/explain | ordering/fingerprint/cap/incomplete/exit tests | sequential, main-agent-only |
| PHO-7 | PR/Nightly/Release CI 接线和 Artifact 保留 | PHO-3、PHO-4、PHO-5、PHO-6 | PHO-8 | workflows、`workflow-layout.test.ts`、manifest integration seam | exact-head receipts/mode → CI Report | fresh CI runs、timeout/cleanup | sequential, main-agent-only |
| PHO-8 | 独立 Review Receipt、全维度审查和最终 adoption | PHO-7 | 无 | review/doc/backlog、`baseline.json` | exact SHA reports → disposition/accepted baseline | Codex + Cursor review、D1-D6、clean tree | sequential, main-agent-only |

架构、跨 Sensor 合同、Profile、Policy、Registry、root scripts、test census 和 CI 集成始终由主 Agent
串行持有。实现期间每个新增测试在同一任务的最终集成步骤立即登记到现有
`scripts/lib/test-gate-manifest.ts`；该共享文件不交给并行 Worker。Sensor 内部可先在隔离分支开发，但在
共享 seam 完成前不得并行落入同一工作树。成功的 Sensor 报告不是集成通过证据。

## 11. 完成标准

Observatory 只有在以下条件同时成立时才可标记 Implemented：

1. 一个故意引入的跨包权威泄漏、一个生成物漂移、一个漏登记测试、一个生命周期泄漏、一个非确定性 fixture、一个 bundle 预算退化和一个视觉 Golden 退化都能得到稳定、可解释 Finding；
2. 合法 Babylon fresh-object、正常 provider adapter、已登记 accepted debt 和未冻结视觉趋势不会被误阻断；
3. PR、Nightly、Release 三种模式对同一 Finding 产生相同 Fingerprint，并正确区分 failed/incomplete/advisory；
4. `health:explain` 能定位 Owner、证据和原始修复 Gate；
5. 普通运行不修改 tracked tree、不会泄漏凭证、不会遗留 Server/Browser/Worker/临时文件；
6. 独立 Codex 与 Cursor Cloud 按 D1–D6 复核，无开放 P0/P1/P2；
7. Backlog、CI、开发文档与真实命令同步，不把 Observatory 的存在误写成所有产品能力已通过。

## 12. 明确非目标

- 不替代 Vitest、Playwright、Browser verifier、World Validation、人工交互或代码审查；
- 不引入通用 APM/SaaS、生产用户遥测或自动外部通知；
- 不自动修改代码、更新 Golden、接受债务、合并 PR 或发布 Package；
- 不用一个“健康总分”掩盖 Blocking Finding；
- 不在 PHO-0A/0B 中顺带重构现有 Runtime、Schema、测试目录或 CI。
