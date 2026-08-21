# World Validation Report 与质量门禁设计

- 状态：**V1 Capture/Integrity contract accepted; broader profiles remain proposed**。
- Canonical 公共术语：`ValidationProfile`、`ValidationReport`、`GateResult`、`MetricResult`、`EvidenceArtifact`。
- 适用范围：Authoring、Layout、WorldPackage、Runtime、Simulation Take、Control Capture Bundle、Replay、性能与完整性。
- 设计目标：用可解释、可量化、可复现的报告决定世界或捕获制品能否进入下一阶段。
- 非目标：以一个综合美学分数替代 Schema、物理、可达性、构图、Capture 或完整性事实。
- 上位规格：[AI-first LEGO 游戏 SDK 设计](./2026-08-17-ai-first-lego-game-sdk-design.md)。
- 关联规格：[Placement Constraint 与确定性 Layout Solver](./2026-08-19-placement-constraint-layout-solver-design.md)、[Simulation Take 与 Control Capture Bundle](./2026-08-19-simulation-take-control-capture-design.md)。
- Route 专项：[Route Graph 与主体可通行性](./2026-08-21-route-graph-and-traversability-design.md)。

## 1. 决策摘要

1. 所有生产验收使用版本化 `ValidationProfile` 执行，并输出不可变、可哈希的 `ValidationReport`；测试日志和截图不是权威报告。
2. Gate 明确分成 `blocking` 与 `advisory`。任一 Blocking Gate 失败都阻止构建、加载、捕获、发布或交付，不能被总体分数抵消。
3. 每个 Gate 由关闭集合的 Metric 构成。Metric 必须带单位、阈值、实测值、状态、证据和 Evaluator Profile。
4. Required Metric 缺失、Evaluator 崩溃或证据归属不明不是“跳过”，而是 `incomplete` 或失败，并阻止生产通过。
5. LayoutSolveReport、Runtime Snapshot、Replay Report 和 ValidationReport 各自负责不同事实；ValidationReport 引用它们，不复制或替代其协议。
6. 确定性几何/物理/协议指标是结构真相；VLM/LLM 判断第一阶段只可作为 Advisory Evidence，不能覆盖碰撞、可达性、身份或 Hash 错配。
7. 阈值属于版本化 Profile，不散落在测试代码、Prompt 或 CI YAML 中。不同平台/世界类别可以使用不同 Profile，但报告必须记录精确 Ref、Resolved Version 与内容 Hash。

## 2. 为什么现有 Production Gates 还不够

总体设计已经要求 Schema、Browser、Physics、Capture、Performance 和 Package Gate，但如果缺少统一协议，容易出现：

- 每个测试用不同阈值，结果无法横向比较；
- 一张“看起来不错”的截图掩盖角色浮空或穿插；
- 总体评分通过，但某个必需 Landmark 根本不可见；
- Capture 有帧，却混入不同 Package/Take/Session；
- CI 只输出失败文本，Agent 不知道该改哪个字段；
- Replay 或性能测量没有绑定平台、Seed、Profile 和 Hash；
- 缺少 Metric 被当成未运行，而不是生产失败。

统一协议固定以下链路：

```text
Subject Artifact + ValidationProfile
  → Gate Planner
  → Deterministic / Runtime Evaluators
  → Evidence Artifacts
  → Metric Results
  → Gate Results
  → ValidationReport
  → Policy Decision
```

## 3. 协议对象

### 3.1 ValidationProfile

`ValidationProfile` 是 Registry 中的版本化资源，定义：

- 适用 Subject Kind 和 Runtime Target；
- Blocking/Advisory Gates；
- 每个 Gate 的 Metric、Evaluator、阈值、容差和采样计划；
- Platform Profile、Locomotion Profile、Camera/Composition Profile；
- 资源预算与最大测量成本；
- 允许的 `not-applicable` 条件；
- 需要保留的 Evidence Artifact。

Profile 使用精确版本和内容 Hash 进入 Registry Lock。Host 可以在 Package 声明预算上增加更严格限制，但不能静默放宽 Package 自身的 Required Threshold。

### 3.2 ValidationReport

`ValidationReport` 是一次验证运行的不可变结果。它只验证一个 Subject：

- Canonical AuthoringSpec；
- Layout Solve Result；
- WorldPackage；
- Runtime Session Snapshot/Replay；
- Simulation Take；
- Control Capture Bundle；
- Generated Video Artifact 的结构一致性评估。

Subject 使用关闭的判别 Union，并保存对应 Hash。一个报告不能混合两个 Package 或两个 Take；跨制品链路通过明确 Parent/Dependency Report Refs 关联。

### 3.3 GateResult 与 MetricResult

- `MetricResult` 保存单个可测事实；
- `GateResult` 根据 Profile 的逻辑组合 Metric；
- Policy 只读取 Gate 的 Requirement/Status，不重新解释原始日志；
- Report 汇总状态，不产生能覆盖 Blocking Gate 的万能总分。

### 3.4 EvidenceArtifact

Evidence 是可审计制品，例如：

- Height/Slope/Collision Raster；
- Overlap Pair List；
- Support Ray/Contact Table；
- Route Graph 与 Path Result；
- Camera Projection/Visibility Mask；
- Runtime Snapshot/Event/Receipt；
- Capture Frame/Pass Manifest；
- 性能 Trace；
- Package Integrity/License Report；
- 可选 Preview PNG 或视频片段。

Preview 是方便人类阅读的派生物，不替代原始数值或 Hash。

## 4. ValidationReport Schema

### 4.0 已冻结的 Capture/Integrity V1 边界

本节是首条实施切片的字段级权威合同；本节与后文较宽的候选设计冲突时，V1 实现以
本节为准。V1 只验证 `control-capture-bundle`，不提前声明 Layout、Physics、Route、
Composition、Replay、Performance 或 Generated Video 已进入统一报告。

- 唯一内置 Profile Ref 是
  `worldkit://validation-profile/outdoor-control-video-dev@1`。V1 不提供 Profile
  组合、隐式继承、Override 或 Host 放宽；这些能力必须通过后续 Schema 版本进入。
- `ValidationProfileV1` 是 `kind: worldkit-validation-profile`、
  `schemaVersion: 1` 的不可变 Registry 资源。Profile 本体包含 `id`、`resourceRef`、
  `version`、`subjectKind`、`gateDefinitionsById`；解析结果单独保存 `resolvedVersion`
  与 `validationProfileHash`，避免自引用 Hash。
- `ValidationReportV1` 是 `kind: worldkit-validation-report`、
  `schemaVersion: 1` 的独立 Canonical JSON 文件。它不得写回被验证的 Capture Bundle，
  否则会造成 Bundle Root 自引用；`worldkit verify capture` 必须把报告写到显式
  `--output` 路径。Capture Bundle 中现有的 `validation-report.json` 只属于早期 Bundle
  自检占位文件，不是本协议的权威 `ValidationReportV1`。
- V1 `subject` 关闭为 `kind: control-capture-bundle`，并绑定
  `worldPackageRootHash`、`takeHash` 与按当前目录实际字节重算的 `bundleRootHash`。
  无法可靠读取这三个身份字段时，CLI 返回 infrastructure error，不伪造 Subject Hash。
- `GateResultV1.status` 关闭为 `passed | failed | incomplete | not-applicable`；
  `MetricResultV1.status` 关闭为
  `passed | failed | not-evaluated | not-applicable`。V1 内置 Profile 不使用
  `not-applicable`，它只为后续显式 Profile 条件保留。
- V1 `MetricResultV1` 冻结四个判别分支：`boolean-assertion`、
  `count-threshold`、`set-equality`、`hash-equality`。所有分支都必须记录
  `evaluatorProfileRef`、`evidenceArtifactRefs` 和 `diagnosticIds`；Capture/Integrity
  首条切片只实例化 `boolean-assertion`，不以未使用的通用性扩大实现范围。
- `EvidenceArtifactV1` 必须记录稳定 `id`、关闭的 `kind`、`artifactRef`、
  `mediaType`、`sizeBytes` 与 `contentHash`。本机绝对路径、时间戳、机器名和日志位置
  不进入 Canonical Report。
- `ValidationDiagnosticV1` 必须绑定唯一 `gateId` 与 `metricId`，并提供稳定 `code`、
  Bundle 内相对 `artifactPath`、`expectedValue`、`actualValue`、`message` 和
  `suggestedFix`。同一底层错误不得同时归属多个 Gate。

V1 内置 Profile 只有三个 Blocking Gate：

| Gate ID | Required Metric | 权威事实 |
| --- | --- | --- |
| `capture-bundle-integrity` | `capture-bundle-integrity-valid` | Bundle 文件清单、字节 Hash、Manifest/Frame/Root Hash 与结构完整性 |
| `capture-completeness` | `capture-required-passes-valid`、`capture-linear-depth-valid` | 五个 Required Pass 完整，Linear Depth 长度、有限性、正值/零无命中语义合法 |
| `capture-ownership` | `capture-ownership-valid` | Package、Take、Runtime Session 与 Frame 归属一致 |

现有 `validateControlCaptureBundleV1` 继续是 Bundle 结构、Hash、Pass 和归属的唯一算法
权威。Validation Adapter 只把其稳定 Diagnostic 映射到上述 Gate/Metric，并补充旧校验器
尚未覆盖的 Linear Depth 数值语义；不得复制现有 Bundle 校验流程或产生第二套 Hash
判定。

Policy 的确定优先级冻结为：

1. 任一 Blocking Gate 明确 `failed`，Report 为 `failed`；
2. 否则，任一 Required Metric 缺失、`not-evaluated`，或 Gate 为 `incomplete`，Report 为
   `incomplete`；
3. 否则全部 Blocking Gate 为 `passed` 时 Report 为 `passed`；
4. Advisory Failure 必须保留，但不能改变 Blocking 结果，也不存在可抵消失败的总分。

V1 CLI 冻结为：

```text
worldkit verify capture <bundle-directory> --output <validation-report.json> [--json]
worldkit verify explain <validation-report.json> --gate-id <id> [--json]
```

Exit Code 固定为 `0 = passed`、`2 = failed`、`3 = incomplete`、
`1 = usage/infrastructure error`。`verify compare`、Browser Evidence 查询、Profile 组合、
CI 发布和其他 Subject Kind 均不属于本切片。

```json
{
  "kind": "worldkit-validation-report",
  "schemaVersion": 1,
  "id": "coastal-world-production-validation",
  "subject": {
    "kind": "world-package",
    "worldPackageRootHash": "sha256:...",
    "normalizedWorldIrHash": "sha256:...",
    "executionPlanHash": "sha256:...",
    "registryLockHash": "sha256:..."
  },
  "validationProfileRef": "worldkit://validation-profile/outdoor-production@1",
  "resolvedVersion": "1.0.0",
  "validationProfileHash": "sha256:...",
  "status": "passed",
  "gateResultsById": {},
  "diagnostics": []
}
```

Report `status` 关闭为：

- `passed`：全部 Blocking Gate 通过且 Required Metric 完整；
- `failed`：至少一个 Blocking Gate 明确失败；
- `incomplete`：验证没有完整执行、Evidence 缺失或 Evaluator 失败，生产策略按失败处理。

`validationReportHash` 对完整 Canonical Report Bytes 计算，由 CLI/Artifact Index
返回并供下游引用；Report 本身不保存该 Hash。时间戳、墙钟耗时、临时机器名和日志
位置写入独立 `validation-audit.json`，不进入 Report Hash。若需要对整个目录计算完整性，
另称 `validationArtifactRootHash`，禁止把 Report Hash 与 Artifact Root 混为一谈。

### 4.1 Subject 判别 Union

第一版候选 `subject.kind`：

- `authoring-spec`：`authoringSpecHash`；
- `layout-solve-result`：`authoringSpecHash`, `layoutSolveReportHash`；
- `world-package`：Package/IR/Plan/Lock Hash；
- `runtime-replay`：Package/Take/Session/Replay Hash；
- `simulation-take`：Package Root 与 Take Hash；
- `control-capture-bundle`：Package/Take/Bundle Root Hash；
- `generated-video-artifact`：Bundle Root、Adapter Profile 和 Output Hash。

不同 Subject 的 Required Fields 由 Schema Union 关闭校验，不使用一组大量可选 Hash 字段。

### 4.2 GateResult

```json
{
  "id": "physics-stability",
  "requirement": "blocking",
  "status": "passed",
  "metricResultsById": {
    "maximum-interpenetration-depth": {
      "id": "maximum-interpenetration-depth",
      "kind": "scalar-threshold",
      "status": "passed",
      "valueMeters": 0.003,
      "maximumAllowedMeters": 0.01,
      "evidenceArtifactRefs": ["artifact://validation/overlap-pairs.json"]
    }
  },
  "diagnosticIds": []
}
```

Gate `requirement` 关闭为 `blocking | advisory`。V1 Gate `status` 关闭为：

- `passed`；
- `failed`；
- `incomplete`；
- `not-applicable`。

`not-applicable` 只有 Profile 明确列出条件且条件证据可验证时合法；没有运行不能标为 `not-applicable`。

### 4.3 MetricResult

Metric 是判别 Union，第一版至少包括：

- `scalar-threshold`：有单位的单值上下限；
- `range-threshold`：最小/最大值区间；
- `count-threshold`：数量上限/下限；
- `ratio-threshold`：`0..1` 比率；
- `set-equality`：ID/Pass/Resource 集合一致；
- `hash-equality`：规范 Hash 一致；
- `boolean-assertion`：有直接证据的真值；
- `distribution-threshold`：P50/P95/P99 等固定统计量；
- `model-evaluated`：带 Provider/Model/Evaluator Profile 的 Advisory 结果。

所有数值字段把单位写入名称，例如 `valueMeters`、`valueSeconds`、`valueDegrees`、`valueBytes`、`valueRatio`、`valueTicks`。不允许只在描述文字中说明单位。

Metric `status` 关闭为 `passed | failed | not-applicable | not-evaluated`。Required Metric 的 `not-evaluated` 会使 Report `incomplete`，不能继续生产。

## 5. Gate 类别与第一批指标

### 5.1 Schema 与引用 Gate

- Canonical Schema/语义校验通过；
- 未知字段、重复 ID、悬空引用为 0；
- Registry Ref 全部解析到锁定版本和内容 Hash；
- Provider Adapter 输出重新通过 Canonical Schema；
- Canonical Bytes 和 Hash 可复算；
- Authoring/IR/Plan/Package 版本兼容。

### 5.2 Layout Gate

- Required Placement Constraint 违反数为 0；
- Solver `status` 为 `solved`；
- 同输入重跑 Transform/Report Hash 一致；
- Fixed Placement 未被移动；
- World Bounds 外 Entity 数为 0；
- Preferred Constraint 代价和违反项只做分项报告，不伪装成 Required 成功。

### 5.3 Physics 与 Stability Gate

首批量化 Metric：

- `maximumInterpenetrationDepthMeters`；
- `interpenetratingPairCount`；
- `unsupportedRequiredEntityCount`；
- `maximumSupportGapMeters`；
- `minimumSupportContactRatio`；
- `maximumPostSettleTranslationMeters`；
- `maximumPostSettleRotationDegrees`；
- `invalidPhysicsValueCount`，覆盖 NaN/Infinity/爆炸速度；
- `outOfWorldEntityCount`；
- `colliderVisualBoundsMismatchRatio`；
- `unexpectedHighVelocityEntityCount`。

测量使用 Profile 固定的 Settling Ticks、Gravity、初始状态、采样频率和容差。静态 Landmark 与可移动 Subject 可以使用不同阈值，但 Entity Class/Tag 必须显式匹配 Profile。

### 5.4 Playability 与 Route Gate

- Spawn 位于 Terrain 内且不在禁止 Water/Collider；
- `requiredSpawnReachableRatio`；
- `unreachableRequiredRouteCount`；
- `maximumRouteSlopeDegrees`；
- `minimumRouteClearanceMeters`；
- `maximumStepHeightMeters`；
- `minimumRouteWidthMeters`；
- 固定 Locomotion Script 的完成状态、耗时 Ticks 和异常位移。

可达性必须声明 Locomotion Profile；人形、轮式车辆和飞行主体不能共享一个含糊的“可达”。当前阶段只承诺室外人形 Heightfield Route。

M5 将该类别拆成两个 Blocking Gate：

1. `route-connectivity`：根据锁定 Collider、Heightfield、Traversal Surface 和主体 Profile
   构建分层 3D Traversal Graph，证明 Required Route 存在满足坡度、步高、宽高净空和
   缝隙阈值的确定性路径；
2. `route-runtime-conformance`：使用相同 Profile 和真实 Babylon/Havok Character Controller
   在固定 Tick 下完成该路径，验证没有卡住、穿插、异常离地、错误 Surface、超时或状态残留。

Graph Query 通过但真实 Controller 失败时，报告仍为 `failed`；静态图不能覆盖实际物理
证据。缺少 Required Traversal Surface/Profile/Evidence 或构建预算耗尽时报告
`incomplete`，不能等同于 `not-applicable`。R1b 完成后，当前承诺扩展为“室外人形
Heightfield + 具有显式 Traversal Surface 的静态平台”，仍不包含跳跃、攀爬、载具、
动态平台、NPC Navigation 或完整室内。

### 5.5 Composition 与 Semantic Gate

- Required Region 的屏幕覆盖比；
- Required Anchor 的可见比和投影面积比；
- Anchor 落入声明 Screen Region；
- Required Entity/Region 遮挡比；
- 前景/中景/背景语义层是否存在；
- Camera Spawn、Facing、FOV、Pitch、Distance、Target Height 与计划差值；
- Reference Guide 中 Required Region/Anchor 的逐项结果。

规则：

- 每个 Required Region/Anchor 单独形成 Blocking Metric；
- 总体 Image Similarity 或 VLM Score 不能覆盖其中任何失败；
- VLM 可以解释“为什么风格或轮廓看起来偏离”，但不作为碰撞、位置或身份真相；
- 单图未定义的隐藏区域只验证一致可玩延伸，不伪装为参考事实。

### 5.6 Capture Gate

- `captureFrameCount` 与 Schedule 一致；
- 缺失 Required Pass 帧数为 0；
- Resolution/Encoding/Color/Coordinate Profile 一致；
- Depth 正值、单位、Near/Far 和无命中语义合法；
- Semantic/Instance Pixel ID 全部存在于 Table；
- 必需 Entity 在指定帧出现；
- Camera Matrix 可逆且与 Snapshot 一致；
- Frame/Tick/Render Frame 映射完整；
- Package/IR/Plan/Lock/Take/Session Hash 归属一致；
- Bundle Root/文件 Integrity 通过。

### 5.7 Replay 与 Determinism Gate

- Input Log、Action、Event、Relationship Receipt 序列一致；
- 关键 Tick Snapshot Hash 或量化状态差在阈值内；
- 固定平台 Profile 下 Capture Hash/Metric 达到声明等级；
- Reset 后 Ownership Ledger、Entity/Controller/Listener 数量回到基线；
- 不允许用“固定时间步已开启”代替实际 Replay 对比。

### 5.8 Performance 与 Resource Gate

- Load Time Seconds；
- Fixed Script 下 Frame Time P50/P95/P99 Milliseconds；
- Main Thread Long Task Count；
- Peak Heap/Graphics/Physics Memory Bytes；
- Node、Triangle、Draw Call、Collider、Raster、Pass 和 Bundle Bytes；
- Dispose 后残留资源数；
- WASM 初始化/复用/释放状态。

性能 Gate 必须记录平台类别、CPU/GPU、浏览器、Runtime Target、分辨率和 Feature Flags。不同机器的数值不能在没有 Platform Profile 时直接比较。

### 5.9 Package、Security 与 License Gate

- 文件路径规范且无穿越；
- 所有文件 Size/Hash 与 Integrity 一致；
- Package Root 可复算；
- 签名、Signer、Trust Domain 与 Host Policy 合法；
- 资源来源、许可证、NOTICE 和允许用途完整；
- URI Scheme、远程访问、插件和脚本符合 Allowlist；
- Package/Plugin 预算未超限；
- Diagnostic/Bundle 未泄露 Prompt、凭证、内部路径或未授权用户数据。

## 6. Profile 与阈值继承

Profile 采用显式组合，不采用隐式深层覆盖：

```text
core-protocol@1
  + outdoor-heightfield@1
  + humanoid-playability@1
  + control-video-capture@1
  + web-production-platform@1
  → resolved ValidationProfile Lock
```

组合器按稳定 ID 合并 Gate/Metric：

- 同一 Metric ID 的语义和单位必须一致；
- 更严格阈值可以通过显式 Override Record 收紧；
- 放宽 Blocking Threshold 需要新的 Host Policy 授权和 Audit Record；
- 冲突或循环依赖使 Profile Resolution 失败；
- 最终报告记录每个 Metric 的来源 Profile Ref。

## 7. Evaluator 边界

Evaluator 使用 Capability Registry Manifest 声明：

- 输入 Subject Kind 和 Evidence 类型；
- 输出 Metric Kind；
- Determinism Level；
- Runtime/Browser/Platform Requirements；
- 资源预算；
- Schema、版本、内容 Hash 和实现锁；
- 失败与超时语义。

Evaluator 分三类：

1. `deterministic`：Schema、Hash、几何、集合、固定算法；
2. `platform-measured`：真实 Runtime Physics、Capture、性能，需锁定 Platform Profile 和容差；
3. `model-evaluated`：VLM/LLM/感知模型，需锁定 Provider/Model/Profile/Prompt Hash，第一阶段只能输出 Advisory Metric。

任意 Agent 生成的脚本不能直接成为生产 Evaluator。算法级扩展必须通过 Schema、Determinism、Resource、Security、Replay 和 Conformance 后发布到受信 Registry。

## 8. 运行阶段与 Gate 时机

```text
Authoring validate
  → schema/reference/profile gates

Layout solve
  → required constraint/layout gates

WorldPackage build
  → IR/plan/resource/integrity gates

Runtime load + settle
  → physics/playability/lifecycle gates

Simulation Take replay
  → control/action/camera/replay gates

Control Capture Bundle finalize
  → capture/timing/id/integrity gates

Generated Video evaluate
  → structural consistency + advisory visual gates
```

每个阶段只消费上游已通过的 Report Ref。下游失败不会修改上游 Artifact，而是形成新 Diagnostic/WorldChangeSet 建议并重新生成下游制品。

## 9. Policy Decision

默认生产策略：

```text
if report.status != passed:
  block
if any blocking gate != passed:
  block
if any required metric is missing or not-evaluated:
  block
otherwise:
  allow next stage and preserve advisory findings
```

可以提供人类可读 `qualitySummary`，也可以计算 Advisory Score，但它们：

- 不参与 Blocking Policy；
- 必须列出权重与输入 Metric；
- 不能跨不同 Validation Profile 直接比较；
- 不能叫 `passScore` 或暗示覆盖 Required Failure。

## 10. Diagnostic 与 AI 修复

Diagnostic 至少包含 Code、Gate/Metric ID、JSON Pointer/Entity ID、Expected、Actual、Unit、Evidence Ref 和修复建议。候选 Code：

- `VALIDATION_REQUIRED_METRIC_MISSING`；
- `VALIDATION_EVALUATOR_FAILED`；
- `PHYSICS_INTERPENETRATION_EXCEEDED`；
- `PHYSICS_REQUIRED_ENTITY_UNSUPPORTED`；
- `ROUTE_REQUIRED_PATH_UNREACHABLE`；
- `ROUTE_STEP_HEIGHT_EXCEEDED`；
- `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT`；
- `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT`；
- `ROUTE_SURFACE_GAP_EXCEEDED`；
- `ROUTE_RUNTIME_STALLED`；
- `ROUTE_RUNTIME_SUPPORT_LOST`；
- `COMPOSITION_REQUIRED_ANCHOR_MISSING`；
- `CAPTURE_REQUIRED_PASS_MISSING`；
- `CAPTURE_FRAME_OWNERSHIP_MISMATCH`；
- `REPLAY_SNAPSHOT_DIVERGED`；
- `PERFORMANCE_BUDGET_EXCEEDED`；
- `PACKAGE_INTEGRITY_INVALID`。

修复建议以结构化 Operation 表达，例如调整 Constraint、降低 Terrain Slope、增加 Route Width、修正 Camera、重新 Capture 或重新 Build。建议不自动提交，只生成可审阅 `WorldChangeSet` 候选。

## 11. CLI、Browser 与 CI

候选命令面：

```text
worldkit verify authoring <authoring.json> --profile <ref>
worldkit verify layout <layout-report.json> --profile <ref>
worldkit verify package <world-package> --profile <ref>
worldkit verify take <take.json> --profile <ref>
worldkit verify capture <control-capture-bundle> --profile <ref>
worldkit verify explain <validation-report.json> --gate-id <id>
worldkit verify compare <report-a.json> <report-b.json>
```

规则：

- JSON 输出是权威机器接口；表格/HTML 是派生人类视图。
- Process Exit Code 区分 passed、failed、incomplete 和 infrastructure error。
- CI 上传 Report、Evidence Manifest 和必要 Preview，不只保留控制台日志。
- Browser Protocol 提供受权只读 Metric/Evidence 查询；Production 页面不暴露任意 Evaluator 执行接口。
- `compare` 先校验 Profile/Subject 可比较性，再报告 Metric Delta；不能比较两个语义不同的总体分数。

## 12. Canonical Hash 与证据归属

Report Hash 至少绑定：

- Subject Hash Union；
- Validation Profile Ref/Resolved Version/Hash；
- Evaluator Lock；
- Platform Profile；
- Seed、Tick/Frame Range 和 Sampling Plan；
- Gate/Metric Result 的 Canonical Bytes；
- Evidence Artifact 路径、media type、sizeBytes 和 SHA-256；
- SDK/Runtime Build Fingerprint。

Audit 时间、机器临时路径和日志顺序不进入确定性结果选择。若 Report 包含签名，复用 WorldPackage 的非自引用 Envelope 原则。

## 13. 测试与 Conformance

### 13.1 Schema Tests

- Valid/Invalid Profile、Report、Gate、Metric 和 Subject Union；
- 未知字段、错误单位、非法 `not-applicable`、缺失 Required Metric；
- Blocking/Advisory 与状态组合；
- Map Key 与内层 `id` 一致；
- Canonical Bytes 与 Hash Golden Fixture。

### 13.2 Evaluator Conformance

- 相同冻结输入输出相同 Metric/Diagnostic；
- 边界阈值、浮点容差和量化；
- 超时、崩溃、Evidence 缺失均形成 `incomplete`；
- Provider/Platform 差异不会被伪装成 Deterministic；
- 未注册 Evaluator 和未锁定版本拒绝运行。

### 13.3 Policy Tests

- 任一 Blocking Failure 都阻止；
- Advisory Failure 不改变 Blocking 结果但保留发现；
- Required Missing/Not Evaluated 阻止；
- 总体摘要分数不能覆盖 Failure；
- Profile 收紧/放宽有明确 Audit 和版本结果。

## 14. 第一条实施切片

对 Placement 与 Capture 两条 P0 共同使用一个 `outdoor-control-video-dev@1` Validation Profile，首批 Gate：

1. Schema/Reference；
2. Layout Required Constraint；
3. Physics Support/Interpenetration/Settle；
4. Spawn/Route Reachability；
5. Opening Shot Region/Anchor；
6. Five-pass Capture Completeness/ID/Depth/Camera；
7. Replay Snapshot；
8. Package/Bundle Integrity；
9. 基础资源预算。

Fixture 包含故意失败版本：浮空 Landmark、穿插墙体、不可达 Spawn、丢失 Anchor、错误 Depth 单位、混入其他 Take 的帧和损坏 Hash。每种失败必须落到唯一 Gate/Metric/Diagnostic，不只显示“质量不够”。

## 15. 实施分解

1. 冻结 ValidationProfile/Report/Gate/Metric/Evidence Schema 和 Canonical Hash。
2. 实现 Profile Registry Resolution、组合、Override Audit 和锁。
3. 把现有 Schema、Physics、Composition、Capture、Replay、Performance 检查适配为 Evaluator，不复制算法。
4. 实现 Policy Engine、CLI JSON 输出、Explain 和 Compare。
5. 接入 LayoutSolveReport 与 ControlCaptureBundle 的父报告引用。
6. 建立 Browser Evidence Capture 和 CI Artifact 发布。
7. 建立成功/失败 Golden Fixture 与 Conformance Suite。
8. 再讨论 Model-evaluated Advisory Metric；不让其阻塞前三步落地。

编码前必须新增独立实施计划并定位现有 Gate 实现，优先抽取共同协议和 Adapter，不对现有测试做一次性大重写。

## 16. 已冻结与待评审

已冻结的架构方向：

- Profile、Report、Gate、Metric、Evidence 五层；
- Blocking Failure/Required Missing 一票否决；
- 数值单位、阈值、实测值和证据必须结构化；
- Solver/Replay/Capture 报告分责并通过 Ref 关联；
- VLM/LLM 第一阶段只能提供 Advisory Evidence。

待评审的字段级细节：

- Profile 组合与 Override Record 的最终 Schema；
- 首批 Physics/Composition 阈值；
- Report 是否为每个阶段独立文件或由 Artifact Index 聚合；
- Cross-platform Capture 使用 Hash 还是 Perceptual/Geometry Metric；
- Generated Video 的结构一致性 Gate 何时从 Advisory 升级。任何升级都不能覆盖 SDK 结构真相。

## 17. 参考依据

- [PAT3D](https://arxiv.org/abs/2505.19714)：把物理可行性评价和修复带入生成循环。
- [SceneSmith](https://arxiv.org/abs/2504.05834)：生成、模拟、验证和迭代闭环。
- [Habitat-Sim](https://github.com/facebookresearch/habitat-sim)：可重复模拟、传感器和基准测试。
- [OpenUSD Asset Structure Principles](https://openusd.org/release/tut_usd_asset_structure.html)：制品组合、引用和验证边界。
- [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785.html)：规范 JSON 字节与可复算 Hash 基础。
