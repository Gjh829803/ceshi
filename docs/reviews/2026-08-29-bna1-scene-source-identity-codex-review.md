# BNA-1 Scene Source Identity 独立复核

## 1. 复核元数据

- 审查模式：C 整仓审计，覆盖 D1–D6，并按
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 复核物理、移动、相机、固定 Tick、
  Browser readiness 和生命周期。
- 审计树：`main` 精确提交
  `7d1e4f41d6ae4b00a3b7461cc3ac284ed7039085`（`merge: complete BNA-1 scene source identity`）。
- 原审查来源：`origin/cursor/bna1-identity-review-954e` 中的
  `docs/reviews/2026-08-29-bna1-scene-source-identity-review.md`。它只作为线索；下文每条结论均已回到
  当前源码复验。
- PR #43：关键提交 `818482543bdc3106d36a7ce99f4de011569fd7ff`；复核时远端分支
  `origin/cursor/canonical-ready-reset-origin-954e` 的 HEAD 是
  `8ba65ca845faf1874a392deadbab9ac302244fcc`，包含后续 reset pause-state 修补。
- 权威来源读取顺序：`AGENTS.md`、`docs/18-refactor-progress-and-backlog.md`、
  `docs/reviews/full-dimension-review-protocol.md`、`docs/reviews/runtime-deep-review-checklist.md`、
  `docs/decisions/0007-canonical-and-babylon-native-authoring-lanes.md`、Native 长期规格和 BNA-1 实施计划，
  然后才读取原审查与当前源码。
- 锁定依赖：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`。引擎相关结论已对照安装树中的
  `characterController.js` 和 `physicsAggregate.js`，没有依据记忆推断。
- 本复核不修改产品代码、金标、冻结 plan/lock；只新增本报告。

### 1.1 执行过的命令

| 命令 | Exit | 用途 |
|---|---:|---|
| `git status --short --branch && git rev-parse HEAD && git log -1 --oneline` | 0 | 锁定审计 worktree 与精确 SHA |
| `git show origin/cursor/bna1-identity-review-954e:docs/reviews/2026-08-29-bna1-scene-source-identity-review.md` | 0 | 读取原审查 |
| `git rev-list --parents -n 1 7d1e4f41`、`git diff --name-status 7d1e4f41^1 7d1e4f41` | 0 | 确认 merge 基线与改动面 |
| `git rev-parse origin/cursor/canonical-ready-reset-origin-954e`、`git log`、`git diff 7d1e4f41 8ba65ca845 -- apps/playground/src` | 0 | 复核 PR #43 当前远端树及三方语义差异 |
| 多次 `rg -n`、`nl -ba ... \| sed -n ...` | 0 | 搜索 Scene Source、Plan/Bootstrap、Candidate、物理、support、step、readiness、生命周期、旧 V5 与判空路径；结果引用在下文 |
| 初次从审计 worktree 相对读取 `./node_modules/@babylonjs/.../package.json` | 1 | 该 worktree 未安装依赖；未据此作结论 |
| 从主 checkout 的安装树读取 Babylon/Havok package version 与源码 | 0 | 得到 `9.23.0` / `1.3.14` 并核对 `checkSupportToRef`、`PhysicsAggregate` shape ownership |
| `git diff --check` | 0 | 报告无 whitespace 错误 |
| `git status --short` | 0 | 只有本报告一个预期新增文件；产品代码与冻结制品未改 |

没有执行 `pnpm test`、`pnpm build` 或 capability verifier。原审查记录的 `7d1e4f41` 全量门禁输入未变，
本复核没有重跑，也没有否定那些记录；旧报告中的命令结果不是本报告新产生的自动化证据。PR #43 的代码尚有
下述新 P1，因此也没有重复其已记录的受影响门禁。

## 2. 对原 findings 逐条复核

### [P1] [D4/D6] 确认：Browser ready 之前 rAF 可以推进固定 Tick

- 证据（static-read）：`394:395:apps/playground/src/babylon-world-adapter.ts` 显示 adapter 默认
  `paused = false`；`489:495` 的 `mount()` 立即安排 rAF；`1411:1464` 的 `animate()` 在未暂停时调用固定输入；
  `1467:1500` 的 accumulator 消费经过的显示时间。与此同时，`22:30:apps/playground/src/playground-adapter-startup.ts`
  在 `7d1e4f41` 上直接 mount/render，未建立暂停屏障；`1239:1246:apps/playground/src/worldkit-browser-api.ts`
  要到额外的 `readyBarrier` 完成后才取得 ready 快照。因此 mount 与 Browser ready 之间存在真实模拟窗口。
- 期望：fixed-step time 只有一个起点；Browser `ready()` 的初始快照与随后 `reset()` 的出生原点必须一致。
  依据 runtime checklist §1、§3 和 Canonical `deterministic-reset` 合同。
- 影响：页面设置较慢时，Havok 可以在 ready 前 settle；调用方取得的“初始”快照已不是 tick-0 出生状态，
  reset 会跳回另一原点。原审查记录的 `verify:canonical` Origin 漂移与当前静态调用链一致，未发现矛盾。
- 建议：在 mount 前暂停；ready 屏障完成后同步解除暂停并取得与解除后状态一致的快照；reset 期间也保持同一
  pause owner。PR #43 的剩余问题见第 3、4 节。
- 复核：已被 Codex 复核确认

### [P2] [D2/D5] 撤回：BNA-1 未绑定 Native hash 不是当前实现缺陷

- 证据（static-read）：`923:936:packages/runtime-host/src/runtime-host.ts` 确实只解析 Native Bootstrap 和
  Module Bundle Ref，`974:992` 只对当前可入场的 Canonical source 绑定 Plan/Bootstrap identity。但
  `262:270:docs/superpowers/plans/2026-08-29-babylon-native-runtime-scene-source-identity-clean-break.md`
  明确把 Native Bootstrap/Bundle/Contribution hash 绑定留给 BNA-4，并要求 BNA-1 在解析后、Bundle 解析和
  Candidate 分配前返回 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`。当前 Host 在
  `1173:1175` 解析初始配置后立即调用 guard，replacement 在 `1240:1249` 同样先拒绝；
  `1252:1265` 是 fail-closed guard。`71:113:packages/runtime-host/src/runtime-host-lifecycle.test.ts`
  还断言正式 Native 不会触发新的 preflight/adapter/Candidate。
- 期望：BNA-1 只冻结 source-neutral identity 与 closed union，同时诚实拒绝尚未完成 BNA-3/BNA-4 admission；
  capability gap 不得冒充现行实现 bug。依据 full-dimension protocol D1 和上述冻结计划。
- 影响：原证据描述的是尚未开放能力的后续必要条件，不会让当前生产 Host 接受错误 Native identity。
- 建议：不在 BNA-1 中提前加入半套 Native admission。将该检查保留为 BNA-4 的 blocking gate；正式开放前必须
  绑定 Bootstrap、Module Bundle、Contribution 与 World Build Identity。
- 复核：复核后撤回（原审查把冻结计划明确延期到 BNA-4 的 capability gap 误判为 BNA-1 缺陷）

### [P2] [D2/D4] 撤回：Native Bootstrap 与 WorldRuntimeBootstrap 没有两个运行时写入者

- 证据（static-read）：`234:236:docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
  规定两条 Source 消费同一份 WorldRuntimeBootstrap。Runtime 在
  `816:818:packages/runtime-babylon/src/babylon-world-runtime.ts` 先从该共享 Bootstrap 取得唯一 gravity/camera；
  Native Bootstrap 字段仅在 `847:878` 做 exact match admission，未被赋值为第二套有效配置。
  `879:886` 只据已准入 Spawn Marker 解出 Subject 位姿，也没有重建 camera/gravity owner。
- 期望：Runtime 的 gravity、camera、Subject/Control closure 只有 WorldRuntimeBootstrap 一个权威；Native
  Bootstrap 若保留投影字段，必须 fail-closed 相等而不能成为 fallback 或覆盖源。
- 影响：当前实现是“共享权威 + admission 投影检查”，不是两个 runtime writer。修改一边忘记另一边会拒绝，
  不会静默分叉运行时状态。
- 建议：保持 Runtime 只消费 WorldRuntimeBootstrap。未来若删除 Native 的重复投影字段，应作为一次
  current-only schema clean break 完整迁移，而不是把当前代码列为双权威故障。
- 复核：复核后撤回（原审查把受控的 admission 一致性投影视为第二个运行时权威）

### [P2] [D4/D5] 撤回：非 Golden provider projection 不会绕过公开 Snapshot V4 规范化

- 证据（static-read）：`52:55:packages/runtime-babylon/src/runtime-projection.ts` 明示
  `BabylonRuntimeSubjectProjectionV1` 不是序列化的 WorldRuntimeSnapshot 协议。非 Golden raw provider
  projection 在 `2628:2648:packages/runtime-babylon/src/babylon-world-runtime.ts` 的确没有调用
  `canonicalizeVec3`；但正式 Gameplay World projection 对每个 Subject 都在
  `1389:1428` 用 `canonicalizeSignedZero` 发布位置、旋转和速度，并在 `1473:1478` 规范化 facing/speed。
  `228:272:packages/runtime-babylon/src/world-runtime-snapshot.ts` 的 V4 projector 从
  `publication.worldState` 生成 `subjectStatesByEntityId`，raw provider projection 只供 camera/resource
  等 adapter 内部字段。公开 parser 在 `282:310`、`372:405:packages/runtime-contracts/src/runtime-session-protocol.ts`
  还会拒绝 `-0`。
- 期望：所有公开 WorldRuntimeSnapshotV4 Subject 数值走一条 Canonical World State 投影并满足有限数、
  非 `-0` 合同；provider 私有 projection 不冒充公开协议。
- 影响：原审查指出的代码差异真实存在，但位于明确的 provider-private 路径，不会造成其声称的公开
  Snapshot 双规范化路径，也不解释 Havok settle 位移。
- 建议：不为这个已隔离的 provider projection 修改公开协议。若内部 consumers 以后需要 Canonical byte
  equality，应另列具体 consumer 与失败复现后再统一内部投影。
- 复核：复核后撤回（原审查混淆了 provider-private projection 与序列化 Snapshot V4）

### [P2] [D2/D5] 确认：Runtime World 配置 parser 吞掉具体 admission 诊断

- 证据（static-read）：`899:944:packages/runtime-host/src/runtime-host.ts` 把
  `parseWorldBuildIdentityV1`、Gameplay/Runtime Bootstrap parse、Scene Source parse 和 Plan hash mismatch
  全包在一个裸 `catch`，统一改成 `RangeError("Value must match the closed RuntimeWorldConfigurationV1 schema.")`。
  例如 `915:916` 已形成的 `Canonical Scene Plan hash mismatch` 会丢失。
- 期望：公共 Host admission 继续 fail-closed，同时向调用方返回稳定 code 和结构化 instance/resource 定位；
  依据 full-dimension protocol D2 诊断质量和 runtime checklist §3/§5。
- 影响：调用方无法区分 Build Identity、Bootstrap、Source kind、Bundle Ref 或 Plan hash 哪一项失败；自动修复
  agent 只能反复猜测整个闭合对象。正确性未放宽，因此维持 P2 而不是升级为 P1。
- 建议：在最接近坏值的 publication boundary 保留稳定 public diagnostic；只清洗 provider 原始 cause，
  不要把已知 WorldKit code/instancePath 一并抹掉。
- 复核：已被 Codex 复核确认

### [P2] [D2/D3] 确认：当前 verifier/test 仍发布旧 ExecutionPlan V5 名称

- 证据（static-read）：`895:905:scripts/verification/verify-canonical-world.ts` 仍输出
  `protocolVersions.executionPlan: 5` 和 `deterministic-v4-v5-build-artifact`；遗漏于原审查的
  `725:735:scripts/verification/verify-placement-layout.ts` 也输出 `executionPlan: 5`。
  `101:103:apps/playground/src/babylon-world-adapter.test.ts` 把当前 Canonical Scene Plan V1 命名为
  `LOCKED_EXECUTION_PLAN_V5`，而 `604:608` 随即断言它的 `kind` 是当前 Plan 且 `schemaVersion: 1`。
  对现行非文档源码搜索旧 `ExecutionPlanV5`、`compileWorldV5`、`parseExecutionPlanV5`、
  `hashExecutionPlanV5`、`WorldPackageSha256HashV1`、`WorldPackageBuildReceiptV2` 无命中。
- 期望：当前唯一合同只使用 `CanonicalSceneExecutionPlanV1` / `canonicalSceneExecutionPlan: 1`；
  Browser Protocol V5 保持其自己的 V5 名称，不借给 Scene Plan。依据 AGENTS.md current-only clean break。
- 影响：receipt、日志和测试把已删除的 V5 Plan 伪装成现行协议，agent 和维护者可能据此重建旧 parser 或
  误判双路径仍受支持；当前可执行 compiler/parser 本身没有双路径。
- 建议：一次 clean break 更新两处 verifier receipt/gate 名和测试常量，并同步相应断言/文档消费者；
  不添加 alias 或 V5 兼容字段。
- 复核：已被 Codex 复核确认

## 3. 新发现的 P0/P1/P2

无新增 P0。

### [P1] [D4/D6] PR #43 的 ready() 返回暂停态快照，但公开完成时 Runtime 已解除暂停

- 证据（static-read，PR #43 HEAD `8ba65ca845`）：`1239:1247:apps/playground/src/worldkit-browser-api.ts`
  在 ready barrier 后先执行 `const snapshot = adapter.runtimeSnapshot()`，再同步调用
  `adapter.setPaused(false)`，随后才 `resolveReady(snapshot)`。`498:503:apps/playground/src/babylon-world-adapter.ts`
  与 `907:910:apps/playground/src/gameplay-babylon-runtime-coordinator.ts` 表明 `setPaused(false)` 会同时修改
  adapter/coordinator 的 pause owner，而 Snapshot V4 在
  `257:265:packages/runtime-babylon/src/world-runtime-snapshot.ts` 公开 `runtime.isPaused`。因此 ready Promise
  返回 `runtime.isPaused: true` 的旧快照时，实际 Runtime 已经是 false。
  `1918:1962:apps/playground/src/worldkit-browser-api.test.ts` 的新增测试用一个不会改变 snapshot 的
  `setPaused` mock，并明确断言 `snapshot` 发生在 `unpause` 之前，因而没有覆盖边界两侧的即时状态，反而固化了竞态。
- 期望：`ready()` 返回值必须描述 Promise 完成瞬间的真实 Browser Runtime 状态；同一同步任务中可先
  `setPaused(false)`，再读取 snapshot，既不会给 rAF 插入固定 Tick 的机会，也能保持 Origin/tick 0 与
  `runtime.isPaused` 一致。依据 runtime checklist §3 “assert both sides and immediate state”。
- 影响：任何以 `await ready()` 的返回快照建立 UI、capture 或 automation 状态机的 consumer 都会认为
  Runtime 仍暂停，而紧接着的 `snapshot()` 已显示未暂停；同一个 ready 边界出现两份状态真相。
- 建议：把解除暂停放到 ready snapshot 之前，并把测试 adapter 的 snapshot 绑定到可变 pause state；同时断言
  ready 返回值、立即 `snapshot()` 与 adapter/coordinator pause owner 三者一致。只重跑 Browser ready/reset
  的 focused tests、`typecheck` 和 `verify:canonical`。
- 复核：已被 Codex 复核确认

### [P2] [D5] BNA-1 新增的 Native parser/host 没有遵守统一判空约定

- 证据（static-read）：`166:194:packages/native-babylon/src/host.ts` 使用 `input === null` 和
  `input === undefined`；`74:128:packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts` 多次使用
  `descriptor === undefined` / `input === null`。同类写法还存在于新增 Native contribution/diagnostics/module
  与 playground bootstrap。等值搜索未发现产品代码中的松散 `==` / `!=`；问题仅是判空未用
  `isNil`/`isEmpty`。`10:14:packages/native-babylon/package.json` 也尚未声明 `lodash-es` 直接依赖。
- 期望：full-dimension protocol D5 与本次复核要求均规定相等用 `===`/`!==`，判空用 lodash
  `isNil`/`isEmpty`；每个实际 import 的 workspace package 声明直接依赖。
- 影响：Native 新包在建立之初即形成与仓库审查规则不同的 parser 风格，后续 clean-break/census 会扩大
  机械修理面；当前这些严格比较本身没有产生运行时错误。
- 建议：在一个限定于 BNA 新增文件的机械清理中具名导入 `isNil`，给 `@whitebox-world/native-babylon`
  增加直接 `lodash-es` 依赖，并避免触碰不相关旧模块。保持所有相等比较为 `===`/`!==`。
- 复核：已被 Codex 复核确认

## 4. 对 PR #43 修复的裁决

**裁决：未关上，并引入一个新的 ready 状态双真相。**

- `8184825` 正确增加了 mount 前 pause，关掉 `7d1e4f41` 的 pre-ready Havok fixed-tick 窗口。
- `8184825` 初版 reset 在恢复 pause 前取得返回快照；PR 当前 HEAD `8ba65ca845` 已把 snapshot 移到
  `finally` 恢复之后。`796:821:apps/playground/src/babylon-world-adapter.ts` 与
  `821:852:apps/playground/src/babylon-world-adapter.test.ts` 证明 reset 的 initially-paused / initially-unpaused
  两侧状态现已闭合。
- reset 与已入队 fixed input 的关系由 RuntimeHost `mutationTail` 串行化：
  `1497:1504:packages/runtime-host/src/runtime-host.ts` 把 fixed input 入队，replacement 在 `1730:1797`
  先取得同一 mutation fence；adapter 又在 reset 期间阻止新 frame，因此未发现新的 reset publication 竞态。
- 但 ready 路径仍按“取暂停快照 → 解除暂停 → resolve”执行，形成第 3 节 P1。原 P1 的“ready Origin 不得
  被 pre-ready tick 推进”只关闭了一半；Browser ready 的完整状态合同尚未关闭。

## 5. D1–D6 覆盖表

| 维度 | 状态 | 复核结论 |
|---|---|---|
| D1 定位与需求边界 | 已查 | `8:18:docs/18-refactor-progress-and-backlog.md` 与 ADR-0007 一致：Canonical 仍是唯一正式生产入口，Native 是互斥实验 Lane。Native hash admission 是 BNA-4 gap，不是 BNA-1 bug |
| D2 Schema 与 AI-friendly | 已查 | Canonical Plan/WorldRuntimeBootstrap 字段及 identity link 单一；Native union 关闭。确认 parser 诊断被吞与旧 V5 receipt 命名；撤回尚未开放的 Native hash finding |
| D3 承诺与事实对拍 | 已查 | BNA-1 计划、`docs/18`、RuntimeHost guard 相符；未发现 Native 被文档宣称为正式生产能力。旧 V5 名残留与 current-only 声明不符 |
| D4 单一权威状态 | 已查 | Compiler 在 `2121:2188:packages/compiler/src/compile.ts` 把 spawn/geometry 留在 Canonical Plan，gravity/camera/runtime closure 留在 WorldRuntimeBootstrap；无 Native shadow Plan/compiler。PR #43 ready 返回值仍产生 pause 双真相 |
| D5 工程质量与可维护性 | 已查 | 确认 swallowed diagnostic 与 BNA 新文件判空违规；撤回 provider-private raw snapshot finding。未发现 legacy parser、alias 或第二套 Scene compiler |
| D6 门禁与证据分层 | 已查 | 只使用当前源码 static-read 和安装引擎源码；未重跑输入未变的全量门禁，不把旧审查记录冒充本次执行。PR #43 只建议后续重跑受影响 ready/reset 门禁 |

### 5.1 Runtime authority 与安装引擎语义补充

| 状态/资源 | 单一权威与当前证据 |
|---|---|
| Scene geometry / spawn | Canonical Lane 为 `CanonicalSceneExecutionPlanV1`；Native Lane 为冻结 Contribution，二者互斥。Native playground/package 搜索 compiler、ExecutionPlan、`executionPlanHash` 无命中 |
| Gravity / camera | `WorldRuntimeBootstrapV1`；Native Bootstrap 仅做 exact admission projection，不写回 Runtime |
| Ground support | `MotionKernelRuntimeV1` 使用归一化 `gravityDirection` 调 Babylon 9.23.0 `checkSupportToRef`。安装源码 `1118:1181` 确认 support 分类语义；未发现 height/ray 旁路成为 gameplay support owner |
| Step traversal | `595:608:packages/runtime-babylon/src/babylon-character-body-port.ts` 只在 `SUPPORTED` 开启 step-up，不把 `SLIDING` 墙面当台阶 |
| Static collision | `947:986:packages/runtime-babylon/src/babylon-world-runtime.ts` 对 Canonical/Native collider 均创建 `PhysicsShapeMesh` + `PhysicsAggregate`；Babylon 9.23.0 安装源码 `physicsAggregate.js:57:60` 说明外部 shape 不由 aggregate dispose，现有 owner stack 分别持有 shape/aggregate |
| 生命周期 | `617:631` 的 reverse disposer stack 保留首个失败并继续清理；`3020:3035` 停 render loop 后清理全部 owned resources。未发现 Native 自建 Engine/Scene/Havok/main camera/tick |
| Browser readiness | adapter fixed-step accumulator 是时间 owner；`7d1e4f41` 缺 startup pause，PR #43 已阻止 pre-ready tick，但其 ready snapshot pause publication 仍不一致 |
