# BNA-1 Scene Source Identity 完整验证与深度审查

## 1. 审查元数据

- 审查模式：**C 整仓审计**（必查 D1–D6）。审查对象触及物理、移动、输入、相机、固定 Tick、Browser readiness 与生命周期，同时完整执行 [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)。
- 审计对象：`main` 精确提交 `7d1e4f41d6ae4b00a3b7461cc3ac284ed7039085`（`merge: complete BNA-1 scene source identity`）。
- 后续修复：同会话在 `cursor/canonical-ready-reset-origin-954e` 提交 `818482543bdc3106d36a7ce99f4de011569fd7ff`（`fix(playground): pause simulation until Browser ready`）。本报告写于该修复之后；P1 按「7d1e4f41 上成立 / 修复树上已关」标注。
- Diff 基线：`7d1e4f41` 相对其父 merge；修复 diff 仅限 Playground ready/reset pause。
- 已安装依赖（对照 lockfile / 安装树）：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`、Vite `7.3.6`、Vitest `3.2.7`、pnpm `10.14.0`。
- 引擎语义：Havok `checkSupportToRef` 已对照安装源码 `node_modules/@babylonjs/core/Physics/v2/characterController.js`（Babylon 9.23.0）。`direction` 与 simplex 输出做单位方向点积；传入完整重力向量会把约 6° 以上斜坡判成 `SLIDING`。当前 `MotionKernelRuntimeV1` 传入 `gravityDirection = gravity.normalizeToNew()`。
- 审查是只读协议；用户明确要求对发现的门禁失败先写复现再修复。修复范围只覆盖该 P1，不借审查扩大 scope。

### 1.1 命令与结果（审计树 `7d1e4f41`）

| 命令 | Exit | 结果 | 证据层 |
|---|---:|---|---|
| `pnpm install --frozen-lockfile` | 0 | lock 未变，Already up to date | install |
| `pnpm check:agent-self-check` | 0 | Planner/Builder bundles current | automated-contract |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 | type |
| `pnpm test:studio` | 0 | 75 pass / 0 fail | automated-contract |
| `pnpm test:independent` | 0 | census 6 Node + 1 Site；Node 23 pass；Site build + 1 pass | automated-contract |
| `pnpm test` | 0 | boundaries 49 debt；census 306 = 274 contract + 32 RH；contract 274 files / 2990 pass / 3 skip；RH 32 files / 511 pass；约 489s。含 `pnpm test:scenes`，未重复跑别名 | automated-contract |
| `pnpm build` | 0 | Playground Vite 26.38s；chunk-size advisory；Havok WASM 2094.56 kB | production-bundle |
| `pnpm build:native-scene` | 0 | Native Playground Vite 25.04s；同样 advisory | production-bundle |
| `pnpm verify:bna1-clean-break` | 0 | `ok: true`，扫 988 文件 | automated-contract |
| `pnpm verify:unreleased-clean-break` | 0 | 通过 | automated-contract |
| `pnpm verify:route-r0-contract` | 0 | 8 项 ok | automated-contract |
| `pnpm verify:route-r1-heightfield` | 0 | success + 预期 fail fixtures；30/60/120 cadence hash 一致 | capability |
| `pnpm verify:route-r1b-static-platform` | 0 | success-steps-platform-ramp + 预期 fail；legacy census 0 | capability |
| `pnpm verify:canonical` | **1** | 见 §1.2。唯一失败门禁 | capability / browser |
| `pnpm verify:native-scene-playground` | 0 | Cloud Ridge 主路径 / 跳 / 着陆 / 相机 reset / collider overlay 通过 | capability |
| `git diff --check` | 0 | 无 whitespace 错误；tracked 树无门禁写入 | clean-tree |

未跑（点名范围外，且输入未被本审计改写）：

| 命令 | 未跑原因 |
|---|---|
| `pnpm test:scenes` | 已含在 `pnpm test` contract lane，禁止把别名二次通过计成新证据 |
| `pnpm test:contract:coverage` | 不是默认 completion gate，本次无覆盖率 claim |
| `pnpm verify:3c-migration` | 本 merge 不改 3C Golden 迁移合同 |
| `pnpm verify:placement-layout` | 本 merge 不改 placement layout 权威 |
| `pnpm verify:rigged-subject` / `verify:g-bot-subject` | 本 merge 不改 Golden/G Bot subject 合同 |
| `pnpm verify:control-capture` / `verify:outdoor-gameplay` | 本 merge 不改 Capture / outdoor catalog 合同 |
| Tracked CI | `.github/workflows/ci.yml` **不包含** `verify:canonical` / Route / Native Scene / BNA-1 verifier。CI 绿不能覆盖 §1.2 |

### 1.2 `7d1e4f41` 上 `pnpm verify:canonical` 失败日志

输入：`examples/authoring/package-subject-world.json`。容差：`1e-9` m（`assertPositionUnchanged`）。

```
AssertionError [ERR_ASSERTION]: Reset did not restore Subject Origin for 'pack-animal-a'.
Maximum drift was 0.000009843685962351856m.
    at assertPositionUnchanged (scripts/verification/verify-canonical-world.ts:436)
    at verifyBrowserProtocolAndPhysics (...:795)
```

比较对象：`ready()` 快照 vs 最终 `reset()` 快照里 `pack-animal-a` 的 `entityState.positionMetersXYZ`。软件渲染 warning `CLI_CAPTURE_SOFTWARE_RENDERER` / SwiftShader 出现在更早的 capture 阶段且 `exitCode: 0`，不是本失败原因。

根因（static-read + 复现）：`BabylonWorldAdapter` 默认 `paused = false`；`initializePlaygroundAdapterV1` 立刻 `mount()` → `scheduleAnimationFrame()`；Coordinator `autoStartRenderLoop: false`，物理只走 adapter `animate()` / `consumeFixedTicks`。`ready()` 还要等 `pageSetupReady`（Authoring 面板等）。未暂停的 rAF 在 ready 之前推进固定 Tick / Havok settle（约 10µm）。`reset()` 换新 WorldSession，快照回到出生点。ready（已 settle）≠ reset（出生点）。

### 1.3 失败复现（先红后修）

未改产品代码时：

| 复现 | 结果 |
|---|---|
| `pnpm exec vitest run apps/playground/src/babylon-world-adapter.test.ts -t "pauses simulation while replacing the World Session on reset"` | 红：`expected false to be true`（reset 期间未暂停） |
| `pnpm exec vitest run apps/playground/src/worldkit-browser-api.test.ts -t "pauses simulation before mount and resumes only after the ready snapshot"` | 红：`['mount','render']` ≠ `['pause','mount','render']` |
| `worldkit-ready-reset.browser.test.ts` 新增 `package-subject-world` Origin 比较 | 与 `verify:canonical` 同一合同（`1e-9` m） |

### 1.4 修复后只重跑受影响门禁（树 `8184825`）

| 命令 | Exit | 结果 |
|---|---:|---|
| `pnpm exec vitest run apps/playground/src/babylon-world-adapter.test.ts` | 0 | 29 pass |
| `pnpm exec vitest run apps/playground/src/worldkit-browser-api.test.ts apps/playground/src/worldkit-ready-reset.browser.test.ts` | 0 | 2 files / 42 pass；其中 Origin 回归 3074ms |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm verify:canonical` | 0 | `ok: true`；gates 含 `deterministic-reset`、`blocking-wall-collision`、`lake-entry-closed-ground-air-medium`、`atomic-control-switch-both-package-instances`。SwiftShader warning 仍在，exit 0 |
| `pnpm build` | 0 | Playground Vite 26.35s；chunk-size advisory |
| `git diff --check` | 0 | tracked 干净（`.tmp/`、`scripts/visual/__pycache__/` 为审查前已存在未跟踪文件，未纳入证据） |

修复未改 Runtime Host / Compiler / Route / Native Scene 合同，因此不重跑 `pnpm test`、Studio、independent、Route、BNA-1、Native Scene verifier。

修复要点：

- `initializePlaygroundAdapterV1` 在 mount 前 `setPaused(true)`。
- Browser `ready()` 先取 snapshot，再 `setPaused(false)`。
- `resetRuntime()` 替换 World Session 期间暂停，结束后恢复原 pause 状态。

## 2. 旧结论复验

引用旧 review 前均回当前可执行树复验。

| 旧结论 | 来源 | 现状 |
|---|---|---|
| 一次性 `ExecutionPlanV5` projector 可无损拆成 Canonical Scene Plan + WorldRuntimeBootstrap；投影完成后删除 projector | `docs/reviews/2026-08-29-bna1-v5-projection-review.md` | **已复验 / 已失效为现行代码**。`project-execution-plan-v5.ts` 已不在可执行树；receipt 仅历史产物 `artifacts/bna-1/execution-plan-v5-projection-receipt.json`。现行入口是 `compileCanonicalWorldV1` |
| 删除 `ExecutionPlanV5` / `compileWorldV5` / `parseExecutionPlanV5` / `hashExecutionPlanV5` / `WorldPackageSha256HashV1` / `WorldPackageBuildReceiptV2`；`Sha256HashV1` 只在 Protocol 声明 | `docs/reviews/2026-08-29-bna1-runtime-identity-consumer-census.md` | **已复验，成立**。对 `.ts/.js/.mjs/.json` 搜上述符号为 0。`Sha256HashV1` 唯一定义在 `packages/protocol/src/hash.ts`。`executionPlanHash` 仅保留在 Canonical Plan / Package / Route 的 Plan-specific 位置，BNA-1 allowlist 内 |
| Native 仍依赖影子 ExecutionPlanV5 | `docs/reviews/2026-08-28-babylon-native-authoring-foundation-review.md` 当时边界（明确排除 BNA-1） | **已失效**。`apps/native-scene-playground` 不依赖 `@whitebox-world/compiler`，不出现 `ExecutionPlan` / `executionPlanHash`。检入 `cloud-ridge-gameplay-bootstrap.json` + `cloud-ridge-world-runtime-bootstrap.json`。`native-scene-source-clean-break.test.ts` 禁止这些符号 |
| BNA-1 冻结 Native Schema / Source Union，正式 Host 在 adapter/Candidate 前拒绝 Native | `docs/18-refactor-progress-and-backlog.md` L14–L18 | **已复验，成立**。见重点 3 |
| Browser 公开 Protocol V5 + Snapshot V4，Babylon projection 留在 Adapter 内 | `docs/18` L12 | **已复验，成立**。V5 是现行 Browser 协议版本，不是 leftover `ExecutionPlanV5` |

## 3. Findings

无未修复 P0。

### [P1] [D4/D6] Browser ready 之前 rAF 推进 Havok，ready Origin ≠ reset Origin

- 证据（automated-contract / browser）：`7d1e4f41` 上 `pnpm verify:canonical` exit 1，失败日志见 §1.2。`ready()` 在 `pageSetupReady` 之后才取 snapshot（`apps/playground/src/worldkit-browser-api.ts`）；`mount()` 立刻 `scheduleAnimationFrame()`（`apps/playground/src/babylon-world-adapter.ts`）；`consumeFixedTicks` 在 `!paused` 时累加固定步。`pack-animal-a` 最大漂移 `9.84e-6` m，超过冻结容差 `1e-9` m。
- 期望：`ready()` 快照必须是未推进仿真的 Spawn Origin；`reset()` 必须回到同一 Origin。固定 Tick 的权威起点是 Browser ready 屏障，不是 mount。依据：`verify-canonical-world.ts` `assertPositionUnchanged`；AGENTS.md「Identify one authoritative owner for every piece of state」中的 fixed-step time；runtime checklist §1 Simulation time。
- 影响：Canonical 正式 verifier 在 main 上红。任何「ready 后立刻 reset」的 Host/Browser 合同（含 Origin / tick 0）都会被 pre-ready settle 打穿。CI workflow 不含 `verify:canonical`，此缺陷可以进 main。
- 建议 / 已实施：mount 前 pause；ready snapshot 之后再 unpause；reset 替换 World Session 期间 pause。复现测试留在 `worldkit-ready-reset.browser.test.ts` 与两条 unit 测试。
- 复核：未复核。修复后 `verify:canonical` exit 0，Browser Origin 回归通过。
- 状态：**7d1e4f41 成立；`8184825` 已关。**

### [P2] [D2/D5] Native `parseRuntimeWorldConfiguration` 不绑定 `nativeSceneBootstrapHash`

- 证据（static-read）：Canonical 分支校验 `sceneSourceIdentity.executionPlanHash === sceneSource.executionPlanHash` 且 `plan.worldRuntimeBootstrapHash === bootstrap.contentHash`（`packages/runtime-host/src/runtime-host.ts` 974–987）。Native 分支只检查 `sceneSourceIdentity.kind === "babylon-native-scene"`（988–992），不比较 `worldBuildIdentity.nativeSceneBootstrapHash` 与 Native Bootstrap / bundle ref。
- 期望：source-neutral identity 对两条 Scene Source 都要闭合 hash。BNA-1 正式路径 kind-reject Native，所以还不是生产漏洞。
- 影响：BNA-3/BNA-4 一旦打开正式 Native admission，错误 bootstrap 可以过 Host parse。
- 建议：在打开正式 admission 之前，把 Native hash / bundle ref 做成与 Canonical 对称的 fail-closed 校验。不要在 BNA-1 上提前实现生产 Native。
- 复核：未复核。

### [P2] [D2] Native Bootstrap 与 WorldRuntimeBootstrap 双写 gravity / camera

- 证据（static-read）：`apps/native-scene-playground/src/native-bootstrap.ts` 把同一组 gravity / camera 写入 `BabylonNativeSceneBootstrapV1`；Kernel 实际使用 `WorldRuntimeBootstrapV1`。`packages/runtime-babylon/src/babylon-world-runtime.ts` 用 `WORLDKIT_NATIVE_SCENE_RUNTIME_BOOTSTRAP_MISMATCH` 做相等检查，不是第二套运动权威。
- 期望：一个概念一个词。冻结的 Native wire schema 目前允许这组重复字段，用相等检查代替单一写入点。
- 影响：实验 Native 路径维护成本；改一边忘了另一边会 fail-closed，不会静默分叉运动。
- 建议：BNA-4 正式化时让 Native Bootstrap 不再拥有 gravity/camera，或把它们标成 Runtime Bootstrap 的投影副本并在 schema 注释里写死。
- 复核：未复核。

### [P2] [D5] 非 Golden snapshot 不走 `canonicalizeVec3`

- 证据（static-read）：`packages/runtime-babylon/src/babylon-world-runtime.ts` Golden 分支对 position/velocity/forward 调用 `canonicalizeVec3`（约 2594–2608）；非 Golden（pack-animal）写 raw float（2634–2635）。`canonicalizeVec3` 只把 `-0` 收成 `0`，**不是** §1.2 的 10µm 根因。
- 期望：同一 snapshot 合同对所有 Subject 使用同一数值规范化。
- 影响：`-0` vs `0` 的 JSON/deepEqual 脆弱性；不解释 Havok settle。
- 建议：非 Golden 分支同样调用 `canonicalizeVec3`。不要用它放宽 `1e-9` Origin 容差。
- 复核：未复核。

### [P2] [D5] `parseRuntimeWorldConfiguration` 的 `catch` 吞掉具体诊断

- 证据（static-read）：`packages/runtime-host/src/runtime-host.ts` 899–943 将 Plan hash mismatch、Scene Source invalid 等收成统一 `RangeError("Value must match the closed RuntimeWorldConfigurationV1 schema.")`。
- 期望：失败返回稳定错误码与结构化定位（AGENTS.md / D2 诊断质量）。
- 影响：Host admission 失败时调用方看不到是 hash 错还是 kind 错。
- 建议：保留 closed schema 拒绝，但把已稳定的内部 code 映射到公开 diagnostic，而不是裸 `catch`。
- 复核：未复核。

### [P2] [D2/D3] Verifier / 测试残留 `executionPlan: 5` 与 `LOCKED_EXECUTION_PLAN_V5` 命名

- 证据（static-read）：`scripts/verification/verify-canonical-world.ts` receipt 仍写 `protocolVersions.executionPlan: 5` 和 gate 名 `deterministic-v4-v5-build-artifact`。`apps/playground/src/babylon-world-adapter.test.ts` 本地常量 `LOCKED_EXECUTION_PLAN_V5` 实际指向 `kind: "worldkit-canonical-scene-execution-plan"` / `schemaVersion: 1`。可执行类型 `ExecutionPlanV5` 已为 0。
- 期望：一个概念一个词。现行权威是 Canonical Scene Plan V1；Browser Protocol 才是 V5。
- 影响：审查/agent 容易把 receipt 里的 `5` 误读成旧 Plan 仍在生产解析。不是双解析路径。
- 建议：receipt 改为 `canonicalSceneExecutionPlan: 1`；测试常量改名为 `LOCKED_CANONICAL_SCENE_PLAN`。
- 复核：未复核。

## 4. 五个重点结论

### 4.1 Canonical Scene Plan 与 WorldRuntimeBootstrap 是否单一权威 — 成立

Compiler `compileCanonicalWorldV1`（`packages/compiler/src/compile.ts` 2121–2210）把 Subject 拆成：

- Plan：`subjectInstances`（spawn 位姿）+ terrain/waters/objects/layout/traversal/staticColliders + `worldRuntimeBootstrapRef` / `worldRuntimeBootstrapHash`。
- Bootstrap：gravity、camera、`subjectRuntimeDescriptors`（去掉 spawn 字段）、assets/rigs/anims/colliders。

Plan body 闭合字段见 `CanonicalSceneExecutionPlanBodyV1`（`kind: "worldkit-canonical-scene-execution-plan"`, `schemaVersion: 1`）。Host `parseRuntimeWorldConfiguration` 校验 identity hashes、bootstrap↔gameplay、Canonical 时 `plan.worldRuntimeBootstrapHash === bootstrap.contentHash`。

未发现第二套 Plan compiler 或 Bootstrap 旁路写入 grav/camera/support。

### 4.2 Native Scene 是否完全没有 shadow Plan/compiler — 成立

- `apps/native-scene-playground` 对 `@whitebox-world/compiler`、`ExecutionPlan`、`executionPlanHash` 的源码匹配为 0。
- 启动闭合来自检入 JSON + `parseGameplayBootstrapV1` / `parseWorldRuntimeBootstrapV1` / `parseBabylonNativeSceneBootstrapV1`。
- `native-scene-source-clean-break.test.ts` 用拆词正则禁止这些符号被重新引入。
- `packages/native-babylon` 无 compiler 依赖；`runtime-babylon` 的 compiler 只在 **devDependency / 测试**。

### 4.3 正式 Native admission 是否在 Candidate 分配前 fail-closed — 成立

`requireCanonicalRuntimeConfiguration` 在 create options、replace、publish、`descriptor()` 上调用。kind 不是 `canonical-execution-plan` 时抛 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`。

测试 `rejects formal Native admission before adapter or Candidate allocation`：`adapter.factory.create` 未被调用，port.calls 为空。`verify:bna1-clean-break` AST 要求上述 guard 存在，且 `adapterFactory.create` 只吃 `descriptor(...)`。

`docs/18` 与实现一致：BNA-1 冻结 union，但不生产化 Native Host admission。

### 4.4 Havok 碰撞、ground support、step、Browser readiness、生命周期 — readiness 曾回归，其余未见回归

Authority map（本审计）：

| 状态 | 权威 | 复验 |
|---|---|---|
| Ground support | Havok `checkSupport` + 单位 `gravityDirection` | 已对照 Babylon 9.23.0 源码；`MotionKernelRuntimeV1` 注释与实现一致 |
| Step-up | `_tryStepUp` 仅 `SUPPORTED`，不在 `SLIDING` | `babylon-character-body-port.ts` 595–598 |
| 固定 Tick | adapter `consumeFixedTicks`；Coordinator `autoStartRenderLoop: false` | 7d1e4f41 上 ready 之前未暂停，见 P1 |
| Camera orbit | Camera Director / Browser V5 | Native verifier 相机 reset 通过 |
| Native 碰撞 | contribution 显式登记，`PhysicsShapeMesh` | Native Scene verifier 通过 |
| 生命周期 | Host session + adapter dispose | RH / Host lifecycle 测试在 `pnpm test` 内通过 |

`pnpm test` RH 含 body-port conformance、traversal support、p15、runtime Native 几何。`verify:canonical` 在 7d1e4f41 因 Origin 失败；修复后 wall / lake / rebind / reset 全过。未做 manual interaction；不把 RH + verifier 说成手感生产证明。

### 4.5 是否残留旧 V5、兼容 alias、双字段、旧/新解析路径 — 可执行解析路径已清

零命中：`ExecutionPlanV5`、`compileWorldV5`、`parseExecutionPlanV5`、`hashExecutionPlanV5`、`WorldPackageSha256HashV1`、`WorldPackageBuildReceiptV2`。

现行：`compileCanonicalWorldV1`、`WorldPackageBuildReceiptV1`、`Sha256HashV1`（Protocol）。Browser Protocol V5 是当前合同。Route/Package 的 `executionPlanHash` 是 Plan-specific。

残留仅命名/receipt（P2）：`executionPlan: 5`、`deterministic-v4-v5-build-artifact`、`LOCKED_EXECUTION_PLAN_V5`。不是双 parser。Native gravity/camera 双写有相等检查（P2）。

## 5. 维度覆盖表

| 维度 | 状态 | 说明 |
|---|---|---|
| D1 定位与需求边界 | 已查 | Canonical 仍是唯一生产入口；Native 是 ADR-0007 实验 Lane，Host fail-closed。室内/载具/洞穴等仍报 capability gap，未写成已支持 |
| D2 Schema 与 AI-friendly | 已查 | Plan/Bootstrap 字段带单位；发现 Native hash 未绑定、gravity/camera 双写、verifier `executionPlan: 5` 命名（P2） |
| D3 承诺与事实对拍 | 已查 | `docs/18` BNA-1 口径与代码一致。CI 未跑 `verify:canonical`，与「main 已 complete BNA-1」的能力证明不完全重合 |
| D4 单一权威状态 | 已查 | Plan vs Bootstrap 拆分成立。ready 前 rAF 曾成为第二套时间起点（P1，已修）。support 无第二推导。`supported-by` layout 复验用地形/collider mesh 而不是 gameplay `checkSupport()`——这是 layout 权威，不是运动权威 |
| D5 工程质量 | 已查 | 修复使用已有 `setPaused`；lodash `isNil` 既有用法未破坏。发现 snapshot 双路径与 swallow-catch（P2） |
| D6 门禁与证据分层 | 已查 | §1.1–1.4 列出每条命令与未跑项。P1 用 Browser verifier，不用单测冒充。修复后只重跑受影响门禁 |

## 6. Runtime checklist 闭合

1. Authority map：见 §4.4。
2. 安装引擎语义：Babylon 9.23.0 `checkSupportToRef` 已读；单位重力方向假设保留在 `MotionKernelRuntimeV1` 注释 + 实现。
3. 对抗性：`verify:canonical` 含墙、湖、双实例 rebind、reset；Route R1 含 30/60/120 cadence；Native verifier 含跳/着陆。本审计未新做 unsupported spawn 人工操作。
4. Semantic merge：BNA-1 merge 后可执行树不再保留 V5 projector。Playground pause 修复不改 Host/Compiler 权威。
5. 证据分层：合同测试 / Browser verifier / production build 已分开记录。无 manual-interaction 声称。
6. 完成门禁：7d1e4f41 全量矩阵见 §1.1；修复后受影响门禁见 §1.4。
