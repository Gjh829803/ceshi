# AI 友好的 Babylon Native 世界创作长期设计审查

## 1. 审查元数据

- 审查模式：Mode A（设计规格审查）。
- 审查对象：
  [`2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`](../superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)。
- 对象状态：Accepted architecture direction；Native 生产能力尚未通过 BNA-1 至 BNA-8。
- Source control：Diversion branch `explore/scene-reconstruction-api` (`dv.branch.8`)；基线与本轮开始时
  Cloud/Local revision 均为 `dv.commit.18`。本报告审查的是该基线加本轮完整 docs-only diff；最终提交 ID
  在报告写入后由 Diversion 生成。
- 上位权威：`AGENTS.md`、
  [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)、
  [ADR-0003](../decisions/0003-agent-director-world-model-boundaries.md)、
  [ADR-0006](../decisions/0006-authoring-spec-compiler-architecture.md) 与
  [ADR-0007](../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)。
- 实施计划：尚未创建；本轮只完成 BNA-0 架构冻结。任何代码实现必须以规格第 17 节依赖图为输入，另建
  dependency-aware implementation plan，不能把本文当作已实施声明。
- 已安装依赖（重新读取当前 workspace）：`@babylonjs/core@9.23.0`、
  `@babylonjs/havok@1.3.14`。
- 审查者：主 Agent；三名独立只读复核分别覆盖 Engine/AI fit、JSON/Native 价值边界，以及既有
  Three/Babylon 迁移与文档治理一致性。所有复核意见均由主 Agent 回到当前文件和源码逐项验证。

### 验证命令

| 命令 | Exit code | 证据范围 |
|---|---:|---|
| `dv status` | 0 | 确认 branch/base/cloud/local revision 与 docs-only candidate workspace |
| `dv diff --name-status` | 0 | 确认本轮只有治理、ADR、规格、Backlog 与审查文档变化 |
| `pnpm list @babylonjs/core @babylonjs/havok --depth 0 -r` | 0 | 重新确认实际安装版本，未复用旧 review 版本声明 |
| `node -e '<read installed @babylonjs/core package.json version and sideEffects>'` | 0 | 已对照 9.23.0 安装包；root `index.js` 属于 package-declared side-effectful 范围 |
| `rg -n 'nativeScene|registerSpawnMarker|registerStaticCollider' packages/runtime-babylon apps/native-scene-playground` | 0 | 当前 Native 实验 API、登记面与消费路径 census |
| `rg -n 'executionPlanHash' packages apps` | 0 | 复验 source-neutral identity 迁移确有跨消费者范围，不能伪造 Plan Hash |
| `node --input-type=module <inline changed-Markdown relative-link checker>` | 0 | 13 个变更 Markdown 文件的本地相对链接目标全部存在 |
| `node --input-type=module <inline changed-Markdown code-fence checker>` | 0 | 13 个变更 Markdown 文件的 backtick/tilde fence 全部闭合 |
| `node --input-type=module <inline changed-file text-hygiene checker>` | 0 | 13 个变更文件无尾随空白或未决模板标记 |
| `rg -n '<Native status / BNA / WorldChangeSet / Three / identity claim set>' <authority docs>` | 0 | 人工对拍当前/目标、Canonical/Native、Route/goTo、Three 与 BNA 完成状态无矛盾 |

上述 Markdown 与 claim 检查均在本报告加入后对完整 candidate tree 重放。未运行 `pnpm test`、
`pnpm typecheck`、`pnpm build`、
Browser、视觉或人工交互 Gate：本轮不改源码、依赖、构建配置或运行时行为，按审查协议 D6.1，纯文档
修订只需要 diff/link/claim 检查。现有实验的旧测试或截图不被复用为 Native 生产支持证据。

## 2. 旧结论复验

### 2.1 Canonical Compiler 仍是当前唯一正式生产入口

结论成立且已回当前树复验。Backlog 明确当前入口仍是 Authoring V4 -> IR V4 -> Plan V5 ->
RuntimeWorldConfiguration V1；Native 仅为受信本地实验（`8:16:docs/18-refactor-progress-and-backlog.md`）。
ADR-0006 已被 ADR-0007 做范围修订，但继续完整约束 Canonical Lane；新规格也明确 BNA-1 至 BNA-6
完成前不能切换生产入口。本文接受的是长期架构，不是 Native Production GO。

### 2.2 2026-08-27 Native 切片是真实实验，不是长期合同

结论成立且已回源码复验：当前 Runtime option 仍要求 `ExecutionPlanV5`，`nativeScene` 只是 optional
experimental provider field（`125:140:packages/runtime-babylon/src/babylon-world-runtime.ts`）；Module
直接接收 `Scene`，登记一个 Spawn 和静态碰撞 Mesh（`1:63:packages/runtime-babylon/src/native-scene-module.ts`）；
Playground Bootstrap 是 TypeScript 常量并克隆 G Bot Plan（`11:52:apps/native-scene-playground/src/native-bootstrap.ts`）。
因此正式 Native Schema、Package、Receipt、source-neutral identity、Hosted 隔离和 Route 均仍未实现。

### 2.3 Babylon 版本与 Import Profile 结论

旧的 Babylon 升级 review 只作为定位线索，版本已用当前 workspace 重新确认。安装的 9.23.0 package
把 `**/index.js` 纳入 `sideEffects`；因此新规格只把 root barrel 当候选，要求 BNA-2 以 AI 成功率、
Typecheck、bundle/module graph 与启动成本 bake-off 冻结唯一 Import Profile，没有凭印象提前裁决。

### 2.4 已失效的全局“任何 Agent 都不得触碰 Babylon”表述

作为全局结论已失效；作为 Canonical/Hosted Builder 规则仍成立。`AGENTS.md` 已加入严格限定的 Native
创作期视觉例外，同时保留 Host Candidate Scene、单一 Scene Source、SDK-owned Havok/Subject/Camera/
Tick/State/Lifecycle 和当前实验状态（`160:173:AGENTS.md`）。审查协议 D1 也采用同一范围，不允许该例外
外溢到 Catalog 或 Hosted Builder。

## 3. Findings

### 最终开放 Findings

截至完整 candidate tree 的最终复核：**无开放 P0、P1 或 P2**。以下条目是在审查过程中发现、由主
Agent 修正并在当前文本中复核后撤回的问题；保留记录是为了让后续实施 Agent 理解这些边界不是可选项。

### [P0] [D4] 影子 ExecutionPlan 会形成第二套 Runtime 权威和伪造世界身份

- 证据（static-read）：当前 `RuntimeWorldConfigurationV1` 必填 Plan/Plan Hash
  （`418:424:packages/runtime-host/src/runtime-host.ts`），WorldSession 与 Gameplay State 也把
  `executionPlanHash` 当通用身份（`72:88:packages/runtime-host/src/world-session.ts`、
  `130:140:packages/gameplay/src/gameplay-state.ts`）。最终规格现以互斥 `sceneSource`、
  `WorldRuntimeBootstrapV1` 和 `WorldBuildIdentityV1` 关闭该缺口
  （`164:247`、`312:361:docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`）。
- 期望：Native 不携带只为复用人物而存在的 Plan；Canonical 过渡投影必须 exact-equality，终态移除双字段；
  通用消费者迁移到 source-neutral identity。
- 影响：若不修正，Scene Source、Subject/Camera/Gravity 与 Snapshot/Capture 身份会有两份可漂移真相，
  Native 只能伪造 `executionPlanHash`。
- 建议：按 BNA-1 做完整 consumer census、协议版本迁移与 Canonical projection Gate，不加 optional alias。
- 复核：复核后撤回；最终规格和 ADR-0007 已把三份合同、迁移顺序与 no-ghost/no-fake Gate 冻结。

### [P1] [D1/D3] Native 治理例外与当前生产事实最初未同步

- 证据（static-read）：最终 `AGENTS.md` 仅允许 Host Candidate Scene 内的 Native visual authoring
  exception（`160:173:AGENTS.md`）；Backlog 仍声明 Canonical 是当前唯一正式入口并把 BNA-1 至 BNA-8
  保持未完成（`8:16`、`919:945:docs/18-refactor-progress-and-backlog.md`）。
- 期望：架构方向可被接受，但不能让旧的全局禁令否定 ADR，也不能把一个实验 option 写成生产能力。
- 影响：若不修正，后续 Agent 要么违反治理规则实现 Native，要么误把例外扩展到 Catalog/Hosted。
- 建议：保留严格 scoped exception，并在 Quickstart/生产入口切换前执行 BNA-8。
- 复核：复核后撤回；ADR-0003/0006、AI-first 规格、Geometry memo、审查协议、Backlog 和 AGENTS 已对齐。

### [P1] [D2/D4] Gameplay Bootstrap、Surface 与诊断合同不足以单独闭合 Native 世界

- 证据（static-read）：最终规格明确 `GameplayBootstrapV1` 不含完整 Subject/Physics/Control/Camera
  closure，并新增 body-hashed `WorldRuntimeBootstrapV1`（`312:361`）；Static Collider 使用闭合
  traversal binding，稳定派生 Subshape/Surface identity（`436:468`）；Check Result 使用 unresolved/module
  输入 Union、unit-qualified measurement 和 outcome/diagnostic 一致性 Gate（规格 §12.2）。
- 期望：JSON、Native visual 和 SDK Gameplay 各有单一 Owner；公共诊断必须闭合、可定位且在 Bootstrap
  未解析时不伪造 Module Ref。
- 影响：若不修正，人物闭包仍暗中来自 Plan，Route 会重新扫描 Mesh，CLI 可能输出互相矛盾或不可构造
  的结果。
- 建议：BNA-1/BNA-2/BNA-4 同步冻结 Schema、Parser、negative tests 和 stable surface identities。
- 复核：复核后撤回；最终合同已加入 role-qualified IDs、单位字段、closed unions 与负向不变量。

### [P1] [D4/D6] 完整 Babylon Scene 暴露最初只有 prose 禁令，没有 Build 后能力闭包

- 证据（static-read + installed-source）：Target BuildContext 暴露完整 `Scene`，而 Babylon 9.23.0 Scene
  可访问 Engine、Camera、Physics、Render callbacks 和 Observables。最终规格新增一次性 Build Epoch、
  retained-reference/forbidden API 静态 Gate、observer/listener census、Authority Audit，并要求先 Admission
  后附着 SDK Kernel（`418:509:docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`）。
- 期望：Trusted Local 至少能强制“Module 只在 build 期执行”；Hosted 必须依靠可终止隔离或更窄
  Capability Facade，不能把 TypeScript `readonly` 当沙箱。
- 影响：若不修正，Module 可保留 Scene、注册回调，并在 SDK Subject/Camera 创建后反向修改权威状态。
- 建议：BNA-4/BNA-5 实现并对抗验证 Build Epoch、baseline instrumentation、post-build mutation 和
  Hosted termination；任一异常销毁 Candidate。
- 复核：复核后撤回；最终设计已冻结机制与验收证据，同时继续把 Hosted 标为 No-Go。

### [P1] [D2/D6] Package Hash、评测与能力声明存在不可执行或自引用风险

- 证据（static-read）：最终规格把 `WorldBuildIdentityV1` 定义为 Package Root 后派生、排除 root
  inventory 的 receipt transport metadata，并要求重算重建（规格 §10）；当前 WorldPackage V2 同样把
  Receipt/Integrity 排除 root inventory（`399:427:packages/world-package/src/v2-directory.ts`）。Runtime
  load 还必须把重新执行 Module 得到的实际 Contribution Hash 与 Package/Identity 锁定值 exact match，
  匹配前不得 publish。BNA-6 现在冻结 lane-specific prompt/context、预算和阈值，并增加非产品离线
  Three visual baseline；BNA-7 明确不交付 `goTo`。
- 期望：Hash 构造无自引用；“AI 更熟悉 Three”有真实 benchmark；Capture/Route/自动寻路不能互相冒充。
- 影响：若不修正，Package 无法构造稳定 Root，评测可事后调参，或把固定 Probe 误写成自动导航支持。
- 建议：BNA-3 做 root/identity replay 负向测试；BNA-6 在生成前登记三臂 Evaluation Profile；产品级
  自动寻路另立设计。
- 复核：复核后撤回；最终 Package 顺序、Evaluation Profile 和 capability gates 已闭合。

### [P2] [D6] 工作图与完成状态最初不一致

- 证据（static-read）：最终 BNA-0 至 BNA-8 均声明 deliverable、`depends_on`、`blocks`、独占所有权、
  I/O、集成点、证据与 execution mode；BNA-3 明确阻塞 BNA-4，BNA-6 依赖 BNA-5，BNA-7 只在 Route
  scope 阻塞 BNA-8（规格 §17）。本报告补齐 BNA-0 要求的 Mode A durable review。
- 期望：设计阶段的责任图必须能直接转成依赖感知实施计划，不能为并行而拆开共享权威。
- 影响：若不修正，BNA-0 会在缺 review 时被误关，或正式评测在安全/预算 Profile 冻结前开始。
- 建议：后续计划严格沿 BNA 依赖图拆分；架构与最终集成继续 main-agent-only。
- 复核：复核后撤回；最终工作图与 Backlog 已一致，本报告完成最后一项 BNA-0 证据。

## 4. 维度覆盖表

| 维度 | 状态 | 覆盖与结论 |
|---|---|---|
| D1 定位与需求边界 | 已查 | 一世界只选一条 Scene Source；Native 仅放开视觉创作，SDK 独占 Gameplay/Physics/Camera/State；当前生产仍 Canonical；动态刚体、NPC、车辆、Hosted、Route/goTo 均没有越界承诺。 |
| D2 Schema 与 AI-friendly | 已查 | 核对 `id`/role-qualified IDs、`...Ref`、`schemaVersion/version/resolvedVersion`、单位字段、`kind/mode`、closed unions、诊断定位与 CLI outcome。`initialCamera.mode` 表达互斥 Camera mode，符合规则，不是持久资源定义的 `kind`。 |
| D3 承诺与事实对拍 | 已查 | 对照 Runtime option、Native Module、Playground Bootstrap、Backlog 和 ADR；规格 §15 明确 current vs target。没有把 Package、Hosted、Route、WorldChangeSet 或自动寻路写成已实现。 |
| D4 单一权威状态 | 已查（Mode A 额外） | 静态画出 Scene Source、Runtime Bootstrap、Build Identity、Spawn、Surface、Camera、Physics 与 fixed Tick Owner；修正 ghost Plan、full Scene callback 与 identity 漂移风险。未做代码实现审查。 |
| D5 工程质量与可维护性 | 不适用 | 本轮没有实现代码或依赖变更；未来实现所需 deterministic build、failure cleanup、direct dependency、import profile 和 adversarial test 已进入 BNA-2 至 BNA-5。 |
| D6 门禁与证据分层 | 已查 | 明确 static/contract/rendered/manual 分层、Blocking Threshold、Three baseline 公平性、Route/Nav/goTo 分层和 per-profile GO/No-Go；本轮只主张 docs-level BNA-0 完成。 |

## 审查结论

**接受该长期架构方向，允许进入独立实施计划；不授予 Native Production、Hosted、Route、自动寻路或
WorldChangeSet 能力声明。** 长期稳定点不是维护两套完整世界语言，而是“一世界两条互斥 Scene Source、
一套 plan-independent Runtime Bootstrap/Build Identity、一个 Babylon/Havok Gameplay Kernel”。
