# M5 Route Graph / Traversability 深度审查（2026-08-25 修复终审）

> 当前处置以第 0A 节为准。第 0 节及其后内容保留 2026-08-24 至修复前的原始审查锚点、完整 finding 机制和历史门禁证据；其中的 NO-GO、仍存在和旧 main SHA 仅代表当时状态，不再是当前结论。

## 0A. 2026-08-25 修复终审（当前权威）

- 当前基线：`origin/main@1fabf53c54270e35cd61c58087a6e5c36224516a`（`feat(assets): activate modular subject runtime bundles`）。
- 修复分支：`codex/m5-traversability-remediation`；通过 merge commit `d929bea` 合入上述 main，没有文本冲突。
- 审查模式：实现前 Mode C 全仓审查；修复阶段按 finding 的失效证据执行 focused gate；最终按新门禁策略执行完整 contract lane、串行 resource-heavy lane、R0/R1/R1b verifier、typecheck、canonical verifier 与 production build。
- 当前 host 结论：**FINAL GO。原报告 4 个有效 P0、12 个 P1 与其 P2 均已修复或按一手引擎证据撤回；完整相关门禁无剩余失败。**
- 最新 main 的 modular 3D asset 拆分没有推翻 M5 finding 机制或结论；它改变了依赖、Subject 资产包和生成 self-check，因此已在 `1011de2` 中补入门禁 census、模块化 GLB pose evidence 兼容和生成产物同步。
- 独立终审：GLM 5.3/zcode 与 Cursor 均给出 **FINAL GO**，且没有 P0/P1 实现 finding。zcode 的唯一 P3（旧 V1 私有 helper 与同型重复 union）已删除；Cursor 的唯一 P2（活动文档同时写 closed/reopened）已统一为本节的最终关闭口径。

### 0A.1 Finding 最终处置

| 原 finding | 最终处置 | 修复证据 |
| --- | --- | --- |
| P0 长绕路近终点 0 Tick complete | **已修复** | `670a4aa`：arrival 同时要求最终 3D station arc 与真实终点容差；保留整条短 Path 的合法 0 Tick 例外。 |
| P0 retained foot / subject origin 权威分裂 | **已修复** | `1483499`：所有 support station 统一使用 retained foot XYZ。 |
| P0 step-up 单 Tick 超位移 | **撤回** | `a25dbac`：Babylon/Jolt 的三段 sweep 后 kinematic reposition 不受普通 `speed × dt` 位移 oracle 约束；合法/过高/窄踏面/cadence 门禁保留。 |
| P0 Capability Envelope 未重绑定 Lock | **已修复** | `dd54f48`：Build Receipt admission 从 Resolved Lock 重派生并核对 Capsule/slope/step Envelope。 |
| P0 Tick 0 ambiguous support 可伪造 complete | **已修复** | `5a5fc24`：initial support mismatch 进入 metrics 与 receipt/context validation。 |
| P1 单节点 / 零边 Path station 崩溃 | **已修复** | `fab119b`：单节点 station 返回唯一 Surface，arc/remaining/total 均为 0。 |
| P1 Runtime 额外拒绝 Canonical Path topology | **已修复** | `bf8d3b0`：删除 XZ-zero、非相邻重复和分层自交的额外 blanket rejection。 |
| P1 远端平台污染无关 Route scope | **已修复** | `9870e0f`：Surface 与 Collider 使用同一 route scope。 |
| P1 分层端点歧义被 nearest polygon 消解 | **已修复** | `0b7844c`：端点多层候选无法唯一消歧时 fail closed。 |
| P1 seam proof 非 edge-local | **已修复** | `1ba2e68`：gap/step 证明绑定当前 portal edge，不再复用 Surface-pair 全局最小值。 |
| P1 Required Route 子集可生成 passed Report | **已修复** | `cb25269`：Report Receipt 绑定完整 required route count、set hash 与规范化 rows，validator 拒绝 missing/extra。 |
| P1 V2 evidence 使用 v1 MIME | **已修复** | `41099fd`：Graph/Failure/Path/Probe 使用 V2 MIME，并闭合 Browser connectivity/Path 状态。 |
| P1 SubjectController 部分构造泄漏 | **已修复** | `6383431`：native controller 构造后所有可抛工作具备回滚，保留 primary error。 |
| P1 Hosted Studio 可绕过 Route Report | **已修复** | `b415de2`：固定 manifest 引用 nonce report；Required Route admission 校验 canonical bytes、world hashes、完整 route set 与 passed status。 |
| P1 Visual Capture 配置失败泄漏 Runtime | **已修复** | `1e306a7`：Adapter 在任何可抛配置前交给唯一 owner。 |
| P1 Surface failure 状态误标 | **已修复** | `814e315`：profile/correlation missing/ambiguous 统一为 `incomplete / unavailable`；R1b verifier 同步验证 diagnostic code。 |
| P1 overlap failure Y=0；P2 Diagnostic 丢候选 Surface | **已修复** | `814e315`：使用真实 elevated world Y，并在 Diagnostic 中保留完整排序 Surface identities。 |
| P2 resource-heavy timeout | **已修复** | `1b7de50` + `1011de2`：`pnpm test` 拆为 contract 与单 worker resource-heavy 两 lane；census 保证全部测试恰好归属一条 lane。 |
| P2 slope / clean-break / 文档漂移 | **已修复** | `db1fc09`：slope 统一为 `[0,90)`，删除重复 V2 类型/接口，并把 active M5 文档重新绑定真实门禁状态。 |

完整门禁还发现并关闭了一个原报告未列出的集成缺口：Recast Path 出现 successive turns 时，Driver 的 2.4m lookahead 会切过转角，而冻结的 3D support station 只能按单 Tick 物理步长推进，最终在真实 Havok runner 中误报 `runtime-stalled`。`79952d1` 增加动态方向跟随 RED，并把 lookahead/projection 限制在当前直线段；`acd4a69` 同步 R1b verifier 的基础设施状态 oracle。该修复不放宽 stalled、deviation、support 或 arrival 阈值。

直接合入 `main` 前的最终 `pnpm test` 首轮还发现 `scripts/verification/verify-route-r1b-static-platform.test.ts` 保留了 `acd4a69` 之前的三个镜像预期：生产 verifier 与冻结 R1b 规格都已要求 profile/correlation missing/ambiguous 为 `incomplete / unavailable`，该 contract test 却仍断言 `failed`。当前失败作为 RED 后，只把这三个测试预期同步为 `incomplete`；focused test 5/5 与随后完整 `pnpm test` 均通过，生产实现未改变。

### 0A.2 最终门禁证据

| 命令 / 证据 | 当前分支结果 |
| --- | --- |
| `pnpm test:census` | exit 0；200 test files，182 contract、18 resource-heavy，missing/duplicate 为 0 |
| `pnpm test:contract` | exit 0；182 files / 1967 tests，139.69s |
| `pnpm test:resource-heavy` | exit 0；18 files / 336 tests，312.10s；单 worker 串行 |
| `pnpm typecheck` | exit 0 |
| `pnpm verify:canonical` | exit 0；Canonical V4/V5、Browser V5、真实 capture 与 deterministic reset 闭包通过 |
| `pnpm verify:route-r0-contract` | exit 0；8 checks；仍明确不把 R0 当作 R1/R1b runtime 证明 |
| `pnpm verify:route-r1-heightfield` | exit 0；11 fixtures、8 adversarial checks；repeat/concurrent/30-60-120 cadence hashes 一致 |
| `pnpm verify:route-r1b-static-platform` | exit 0；11 fixtures；legacy census 0；repeat/concurrent/30-60-120 cadence hashes 一致；profile/correlation failures 为 `incomplete` |
| `pnpm build` | exit 0；Vite 2190 modules，53.39s；仅保留既有大 chunk warning |
| 真实 Recast + Babylon/Havok trusted runner | 12/12；successive-turn 路线 68.159s 完成，不再 stalled |
| `worldkit run` Route Host/Browser transport | 1/1；51.675s；same-world evidence 发布与 owned state 清理通过 |
| GLM 5.3 / zcode 静态终审 | FINAL GO；0 个 P0/P1/P2；1 个 P3 clean-break 残留已清理 |
| Cursor `cursor-grok-4.6-xhigh` 静态终审 | FINAL GO；0 个 P0/P1；1 个 P2 活动文档漂移已统一 |

证据边界：以上包含 automated contract、真实 Babylon/Havok Runtime、Browser/Studio transport 与 rendered canonical capture；没有新增 manual-interaction evidence。Canonical verifier 产生的 tracked screenshot/snapshot 差异已在核验后恢复，分支不提交动态取证噪声。

## 0. 2026-08-25 修复前最新 main 复验（历史证据）

- 最新 `origin/main`：`a8b9fd363a7116a8eb731e2c56f0f210c0ee00c8`（`docs: record final pr14 integration baseline`）。
- 报告分支：`codex/m5-traversability-deep-review`，已 fetch 并把两份报告提交 rebase 到上述 main；本轮改文档前 HEAD 为 `893ae2394fcb664da62eab9d129859f55bf60baf`。
- 原始审查锚点：`4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5`；从该锚点到最新 main 共 141 个提交。
- 审查模式：Mode B 最新变更复验，并按 full-dimension protocol 补齐 D1–D6；Runtime 部分完整应用 runtime-deep-review checklist。
- `126a8f4..a8b9fd3` 新增 4 个提交、改动 97 个文件，主体是 Hosted Scene Brief / Recording / Visual workflow；所有既有 M5 owner、fixture、Route runner 与 lockfile blob 均未变化。
- 安装依赖仍为 Babylon.js 9.21.2、Havok 1.3.14、recast-navigation 0.43.1、lodash-es 4.18.1；本轮未重复安装未变化的 frozen lockfile。
- 本次只修改审查报告，没有修改 M5、Runtime、Schema、验证器或 SDK 实现。

### 0.1 最新结论

**仍为 NO-GO。最新 main 没有关闭 4 个有效 P0 或 8 个原 P1，并由 Hosted workflow 新增 2 个 P1；本轮独立 Cursor main 审计再确认 2 个此前未记录的 P1；当前合计 4 个 P0、12 个 P1。step-up 单 Tick 位移 finding 经 Babylon/Jolt 源码复核后撤回，见 0.8。**

旧报告对 Medium `contentHash` 的判断不准确，继续撤回。此前标记为已关闭的 `route-validation-runner.test.ts` timeout 在最新全量门禁中重新出现：隔离运行通过，但与整仓资源型测试并行时超过 180 秒。这不改变下面 4 个有效 P0 的阻断地位。

原先五个 P0 候选的反例已在 `126a8f4` 上重放；`126a8f4..a8b9fd3` 的 owner、fixture、依赖和 lockfile 均逐 blob 相同，因此按当前证据作用域规则沿用到 `a8b9fd3`。后续引擎源码核对与反证实验推翻了其中 step-up 的预期 oracle，故当前只保留四个有效 P0。同时，本轮在 `a8b9fd3` 上重新执行 R0/R1/R1b 与全量测试，结果如下：

| ID | 当前状态 | 最新 main 自动化复验 |
| --- | --- | --- |
| M5-P0-01 长绕路 0 Tick 假通过 | **仍存在** | 16.795m lower→ramp→upper Path，起终点 XZ 仅 0.4m；结果 `complete`、`completionDurationTicks=0`、`processedTickCount=0`、`fixedTickCallCount=0`。当前 owner 仍在 `packages/validation/src/route-runtime-probe.ts:667-675,747-753`。 |
| M5-P0-02 station 使用 subject origin 而非 retained foot | **仍存在** | 当前 R1b 成功 fixture 中有 6 Tick 的 foot/subject-origin expected Surface set 分裂；最小例中 foot 仍在 segment 0，subject origin 已选择 segment 1。runner 仍在 `route-runtime-probe.ts:632-639,726-733` 传 subject origin，context validator 仍在 `runtime-probe-contract.ts:1698-1727` 重复同一权威错误。 |
| M5-P0-03 step-up 单 Tick 超位移 | **撤回（错误 oracle）** | 严格 `speed × dt` 是普通位移预算，不是 kinematic stair-step reposition 合同。Babylon 9.21.2 与 Jolt CharacterVirtual 都以 up/forward/down sweep 验证后 reposition；强制多 Tick 截断会停在台阶侧面并产生真实 `unmatched` support。见 0.8。 |
| M5-P0-04 Envelope 未与 Lock 重绑定 | **仍存在** | 从真实 receipt 把 `capsuleRadiusMeters` 由 0.32 改为 0.01，保留相同 `resolvedTraversalLockHash`，`createRouteBuildInputReceiptV2` 仍接受并生成新 `routeBuildInputHash`。Graph Builder Profile 已在 `packages/traversal/src/build-input.ts:1002-1033` 重绑定；缺口是 admission 没有从 Lock receipt 重新派生并逐字节核对 Capsule/slope/step Envelope，见 `:425-527,1273-1299`。 |
| M5-P0-05 forged Tick 0 support | **仍存在** | 从真实 385-Tick complete receipt 把 initial `surfaceResolution` 改为 `ambiguous`；canonicalizer 与 context validator 均接受，`wrongSupportSurfaceCount=0`。当前分支仍在 `runtime-probe-contract.ts:813-827,1527-1571,1698-1719` 漏计有后续 ticks 时的 initial mismatch。 |

其余 4 个 P0 仍有一手反例、当前 owner 逐 blob 复核和最新树正式门禁的三层证据。R1/R1b fixture 全绿只能证明已列 fixture，不足以覆盖这些反例。

### 0.2 Findings 逐条处置

| finding | 最新 main 处置 | 当前证据 |
| --- | --- | --- |
| P0 长绕路近终点 0 Tick complete | **仍存在** | 最新脚本复现；`route-runtime-probe.ts:667-675,747-753`。 |
| P0 retained foot / subject origin 权威分裂 | **仍存在** | 最新脚本与真实 R1b evidence；6 Tick allowed-set 分裂。 |
| P0 step-up 超出 fixed-tick 位移预算 | **撤回** | Babylon/Jolt 的 stair step 是经三段 sweep 验证后的 kinematic reposition；`speed × dt` 不能作为 stair-step pose delta oracle。 |
| P0 Capability Envelope 未重绑定 Lock | **仍存在** | 最新真实 receipt 篡改复现；同 Lock hash 下 0.01m capsule 被接受。 |
| P0 Tick 0 ambiguous support 可伪造 complete | **仍存在** | 最新真实 385-Tick receipt 篡改复现；canonical/context 均接受。 |
| P1 单节点 / 零边 Path station 崩溃 | **仍存在** | Canonical Path factory 仍接受；`runtime-probe-contract.ts:929-1042` 仍读取 `identities[index + 1]`，复现 `TypeError`。 |
| P1 Canonical Path 与 Runtime topology 合同分裂 | **仍存在** | `route-runtime-probe.ts:212-269` 仍额外拒绝 XZ-zero、非相邻重复与自交。 |
| P1 远端已绑定平台污染无关 Route scope | **仍存在** | 最新脚本仍得到 `HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID`；全 Surface inventory 与 route-scoped collider inventory 仍分别位于 `heightfield-source.ts:989-1018,1110-1127`。 |
| P1 分层端点歧义被 nearest polygon 静默消解 | **仍存在** | `evaluate-route.ts:631-680` 仍只取单个 provider nearest polygon；`connectivity-result.ts:696-730` 仍无 layer-ambiguous reason。 |
| P1 seam proof 非 edge-local | **仍存在** | 核心 blob 未变；`build-graph.ts:1298-1340` 仍按 Surface pair 缓存全局最小 gap，并在 node position 采 step；adapter manifest 仍承诺 portal endpoint。该条为 current-source 静态闭合，没有新增动态 seam fixture。 |
| P1 公开 Report 可接受 Required Route 子集 | **仍存在** | 公开输入仍只有 caller rows：`route-evaluator.ts:69-75,1826-1901`。Trusted orchestrator 在 `route-validation-orchestrator.ts:824-906` 当前会遍历完整 Plan，所以这里仍定为公共合同缺口，而非已证明 CLI 主路径假通过。 |
| P1 V2 Route evidence 使用 v1 MIME | **仍存在** | failure/graph/path/probe 仍分别使用 `v1+json`：`route-evaluator.ts:1161-1168,1197-1204,1302-1318,1458-1468`；`validate-v2.ts:1027-1056` 仍只要求非空字符串。 |
| P1 SubjectController 部分构造泄漏 | **仍存在，且仍是 pre-existing debt** | 最新失败注入 3/3 均 `created=2,released=0`；allocation 后仍有 throwing work：`motion-kernel-runtime.ts:442-463`，host 到成功后才登记 disposer：`babylon-world-runtime.ts:601-620`。 |
| P1 Hosted Studio 导入未绑定 Route report | **新增，存在** | 生产 runner 在 `scripts/agents/run-spatial-world-agent.sh:211-226` 对 `requiresTrustedRouteValidation` 执行 Route gate；但 `apps/studio/src/server.mjs:672-701,953-1030` 的 deliverable/admission 不要求或校验该 report，随后在 `:1061-1098` 直接标 `ready/passed`。 |
| P1 Visual Capture 配置失败泄漏 Runtime | **新增，存在** | `main.ts:1998-2016` 在 Adapter 创建成功后先 configure、后登记 owner；未知 entity 在 `babylon-world-adapter.ts:668-683` 抛错，Browser catch `worldkit-browser-api.ts:1209-1247` 只能释放已登记 owner。最小所有权复现为 `disposed=0,status=error`。 |
| P1 V2 pre-Graph Surface failure 状态误标 | **新增确认，存在** | 冻结规格要求 profile/correlation failure 为 `incomplete / unavailable`；`connectivity-result.ts:892-923` 却只接受其 `unreachable / unavailable`，`evaluate-route.ts:844-852,977-985` 也按 unreachable 生产。当前 focused tests 把错误状态固化为绿测。 |
| P1 overlap correlation failure 的 Y 坐标硬编码 0 | **新增确认，存在** | `evaluate-route.ts:977-985` 把 overlap witness 的 XZ 与常量 Y=0 拼成 XYZ。真实 elevated fixture 的两个候选 Surface 顶面均为 0.25m，最小复现仍输出 `[6,0,3.666…]`。 |
| P2 ambiguous Surface Diagnostic 只保留首个 identity | **新增确认，存在** | failure receipt 保留 2 个 overlap identity，但 `validation/src/route.ts:237-244` 只复制 `[0]` 到 Diagnostic；最小复现中第二个冲突 Surface 在用户/AI-facing Diagnostic 中消失。 |
| P2 route-validation-runner timeout | **重新打开** | `pnpm test` 中真实 case 191.074s，超过 180s；隔离运行仍 12/12 通过，真实 case 96.565s、suite 103.22s。问题是资源型门禁并发编排/预算不稳定，不应只继续上调 timeout。 |
| P2 Browser complete connectivity / unavailable Path | **仍存在** | 最新最小 DTO 仍被接受；`browser-route-evidence.ts:443-452` 只有 `hasPath ⇒ connectivity complete`，没有反向闭包。 |
| P2 slope domain 不一致 | **仍存在** | Lock 接受 `(0,90]`，Build Input 接受 `[0,90]`，Recast 要求 `[0,90)`：`lock.ts:152-167`、`build-input.ts:473-479`、`recast-config.ts:123-129`。 |
| P2 Medium `contentHash` 缺失 | **撤回旧 finding** | Execution Medium 合同有意不暴露 `contentHash`（`execution-plan.ts:337-357`）；compiler 已把 locked Medium hash 与 Definition projection 的 ref/air 比较（`compile-traversal-lock.ts:186-189`）。旧报告把不同职责形态误判成缺校验。 |
| P2 完成声明 / 文档不一致 | **仍存在，且扩大** | `docs/05-mvp-roadmap.md:17,106-125` 本轮改称 M5 closed；`docs/18-refactor-progress-and-backlog.md:19-22,840-843,855-861` 与 PR14 integration review `:28` 也称 closed。相反，`docs/00-project-overview.md:55-57,103,153-169`、`docs/17-canonical-json-quickstart.md:25-27` 仍称完整 M5/R1b 开放；`docs/18:326` 还保留 Browser/CI Evidence 开放项。 |
| P2 dead code / clean-break 噪声 | **部分修复** | `route-evaluator.ts` 的冗余分支已清理；但 `route-runtime-probe.ts:212-214` 仍有 `RoutePathReceiptV2 \| RoutePathReceiptV2`，`route-evidence-publication.ts:69-78,346-355` 仍重复导出同名 interfaces。 |

最新 main 的 Hosted workflow 变更新增 2 个 P1；本轮 Cursor clean-main 补充审计又确认 2 个此前遗漏的现存 P1 与 1 个 P2，没有新增 P0。经后续 Babylon/Jolt 源码复核，原 step-up P0 因 oracle 不成立而撤回；当前合计 4 个有效 P0、12 个 P1。runner timeout P2 重新打开；Medium 子结论继续撤回；dead-code 子结论仍为部分修复。

### 0.3 最新门禁矩阵

| 命令 / 证据 | `a8b9fd3` 结果 |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | **exit 1**，193/194 files、2235/2236 tests；唯一失败为真实 Route case 191.074s > 180s；suite 533.27s |
| 隔离 `route-validation-runner.test.ts` | exit 0，12/12；真实 case 96.565s，suite 103.22s |
| `pnpm verify:route-r0-contract` | exit 0，8 checks；脚本自身明确不证明 R1/R1b |
| `pnpm verify:route-r1-heightfield` | exit 0，11 fixtures、8 adversarial checks；repeat/concurrent/cadence hashes 一致，provider leaks 为空 |
| `pnpm verify:route-r1b-static-platform` | exit 0，11 fixtures；legacy census 0；repeat/concurrent/cadence hashes 一致 |
| `pnpm verify:canonical` | exit 0 |
| `pnpm verify:placement-layout` | exit 0 |
| `pnpm verify:rigged-subject` | exit 0 |
| `pnpm verify:g-bot-subject` | exit 0 |
| `pnpm verify:unreleased-clean-break` | exit 0，694 files、0 forbidden、519 current-authority matches |
| 改动后的 `worldkit-route-run.integration.test.ts` | exit 0，1/1，120.430s |
| `pnpm test:studio` / `pnpm test:lwdp-client` | exit 0，36/36 与 13/13 |
| Surface failure focused contract tests | exit 0，3 files、26 tests；但现有断言把 profile missing 固化为 `unreachable`，且没有 elevated Y / 全 identities 断言，因此属于 false-green evidence |
| Surface failure 最小动态 probe | profile missing=`unreachable / unavailable`；overlap failure=`[6,0,3.666…]` 且保留 2 identities；转成 Diagnostic 后只剩首个 identity |
| `pnpm build` | exit 0，Vite 2189 modules，1m15s；仅大 chunk warning |

门禁运行生成的动态 session/hash 差异已在取证后恢复；最终分支只保留本文档改动。

### 0.4 变更面与证据边界

`126a8f4..a8b9fd3` 中以下既有 finding owner、相关测试、Route fixture、依赖与 lockfile 的 Git blob 完全相同：

- `packages/validation/src/route-runtime-probe.ts`
- `packages/traversal/src/build-input.ts`
- `packages/traversal/src/runtime-probe-contract.ts`
- `packages/traversal/src/path-receipt.ts`
- `packages/runtime-contracts/src/browser-route-evidence.ts`
- `packages/traversal-recast/src/heightfield-source.ts`
- `packages/traversal-recast/src/evaluate-route.ts`
- `packages/traversal-recast/src/build-graph.ts`

`motion-kernel-runtime.ts` 的 step-up block 与 P1 partial-construction 顺序未变；前者经 0.8 的源码核对不再视为缺陷，后者仍有效。`route-evaluator.ts` 的 Required Route set binding 与 MIME 闭包也未补齐。四个新提交改变的是 Hosted/Studio/Playground integration，并由此新增上述两个 Hosted P1。Surface failure 状态与坐标两条 P1 是本轮对当前 main 补审时发现的既有遗漏，不能归因于这四个提交。

本轮使用 static-read、自动化 contract、真实 Babylon/Havok runtime probe、Browser/Studio 定向测试和完整仓库门禁。Canonical / Placement / Rigged / G Bot gates 生成了 rendered artifacts，但本文不把它们当作 Route 通过性证明；没有声明 manual-interaction evidence。动态 artifact 差异在取证后已恢复。

### 0.5 Cursor 只读独立终审

- 当前树复核 chat：`67613810-edac-4772-a7bb-02389b85ba29`；Cursor CLI exit 0，审查前后 tree fingerprint 均为 `1d611de4dd2702f3d74c9e90cf3181ba235db62b3e1756fe28a9f921a8f47629`，没有写入或树漂移。
- 独立结论（历史）：M5 release **NO-GO**；finding set **READY to begin remediation design**。Cursor 当时确认 5 个 P0、8 个原 P1、2 个新增 P1、重新打开的 runner timeout P2，以及 Browser/slope/docs/dead-code 处置；同意撤回 Medium finding；没有新增 P0–P2。该静态复核未验证 stair-step 的行业实现合同，step-up 子结论已由 0.8 的 installed-source 与真实 Havok 反证实验覆盖。
- 主审接受的措辞修正：Graph Builder Profile 已重绑定，P0-04 缺的是 Lock-derived Capability Envelope 重算；短 Path 总长处于容差内的 0 Tick complete 是合法例外；现有 Studio import 绿测只是无 Required Route 的浅工件，不是本 finding 的 RED；Controller leak、MIME、Medium 的现行行号已在本文校正。
- 证据边界：Cursor 使用 Ask/read-only static review，对已安装 Babylon 源码作了核对；Ask 模式拒绝其 Git/GitHub diff listing。主审已独立 fetch、逐 blob 比较、执行动态反例和当前树门禁，因此该限制不构成 finding 处置阻塞。

2026-08-25 又在 detached clean `origin/main@a8b9fd3` 上执行补充审计，主模型为 `cursor-grok-4.6-xhigh`。首轮单体 deep audit 在 Cursor 内部尝试调用 `claude-fable-5-thinking-high` 子审模型时遇到额度失败，随后长时间无最终输出；该会话已按恢复流程终止，其未完成结论没有用于处置。之后改为三个明确禁止继续分派的窄范围只读会话：

- Contract / Graph：`27d5eaaf-ac76-4c64-b2de-a303d2b20aee`；提出 6 个候选，主审合并并接受 2 个 P1、1 个 P2，另 3 个为既有 finding 重复。
- Runtime：`f5afdbf7-98a2-47af-ae27-c42080178560`；候选均为现有 P0 的重复机制。其 snap-down 候选经 Babylon 9.21.2 源码与冻结 P1.5 规格核对，不构成独立新 finding。
- Integration / Evidence：`f567dc84-313b-41b0-9fd3-22c4a4d5dde4`；root timeout 与 docs 候选均已在报告中；`worldkit run` 返回 0 是只读 Host transport 生命周期语义，真正阻断退出码属于 `worldkit verify route` / production admission，因此不接受为绕过门禁。

主审随后直接核对冻结 status table、当前 canonicalizer/producer/Diagnostic，并执行最小动态 probe 与 3 files / 26 tests 的 focused suite。最终只新增下面两条 P1 与一条 P2；不是把 Cursor 候选未经复现直接写入报告。

### 0.6 当前处置建议

重新打开 M5，并撤回 `Complete / Final GO / no open P0/P1`。修复顺序仍应是：

1. 先为 4 个有效 P0 提交 fix-before-fix failing reproducer；step-up 维持现有合法/过高/窄踏面/cadence 门禁，不再加入错误的 `speed × dt` pose-delta 断言；
2. 修复 P0 后逐条关闭 12 个 P1 合同/生命周期缺口，包括两个 Hosted 新回归与两条本轮补审确认的 Surface failure 缺口；
3. 把本报告的反例纳入正式 verifier，而不是只保留外部审查脚本；
4. 把 root test 重构为“并行 contract lane + 串行 resource-heavy lane”，保留 `pnpm test` 的全覆盖语义；按变更影响只执行失效证据，合入前再执行相关完整闭包；
5. 重跑 focused regressions、R0/R1/R1b、完整 test/typecheck/build、Report/Browser/Studio 同字节闭包，以及分层长绕路和窄踏面的真实 Runtime evidence。

Medium finding 已撤回；runner timeout 则必须通过门禁编排修复并在 full-suite/isolated 两层都稳定通过，不能靠继续增加单测预算关闭。

### 0.7 下一阶段门禁策略（设计提案，批准后落地）

目标是提高修复迭代效率，同时不削弱 `pnpm test` 的完整覆盖语义：

1. `pnpm test` 保持唯一完整 wrapper，顺序调用并行的 contract lane 与串行的 resource-heavy lane；任一 lane 失败即整体失败。
2. resource-heavy manifest 必须显式列出文件，首批至少包括 `scripts/lib/route-validation-runner.test.ts`、`scripts/cli/worldkit-route-run.integration.test.ts`、`scripts/verification/verification-browser-launch.test.ts`，以及经计时确认会启动 Havok/Recast/Playwright/Vite 子进程的 Runtime suites。不能用继续增加 180 秒 timeout 替代串行隔离。
3. 增加自动 census：根据 `vitest.config.ts` 的 root include 收集全部测试文件，并断言每个文件恰好属于一个 lane（union 等于 root 集、intersection 为空）；这样 lane manifest 漏项会在门禁自身 fail closed。
4. 实现期先跑 finding 对应的 focused RED/GREEN；源码、Schema、fixture 或 generated artifact 的变化只作废其依赖证据。跨 authority 的 station、Envelope、Report 修复必须重跑相关完整 lane；stair-step 相关改动继续重跑真实 Havok/R1b lane。
5. 最终树上每个相关完整 lane 恰好运行一次；`typecheck`、`build`、R0/R1/R1b、Browser Route integration、Studio、LWDP 与 clean-break 仍是 root Vitest 之外的显式闭包，不能因 lane 拆分省略。
6. 四个有效 P0 的反例必须进入正式 verifier，并保留“整条 Path 总长在 tolerance 内才允许 0 Tick”的合法短路径测试。step-up 保留既有合法 0.25m、非法 0.35m、窄踏面和 cadence 覆盖。外部 `/tmp` 审查脚本只作取证，不作为长期覆盖。

修复工作按三个 batch 推进：A 先落地门禁 census 并锁住 4 个有效 P0 RED/GREEN，同时记录 step-up 撤回依据；B 在 P0 authority 稳定后处理 12 个 P1；C 处理 P2、文档与 clean-break，并执行最终完整闭包。具体文件所有权、依赖边和集成点需在实施前的修复设计中冻结。

### 0.8 Step-up finding 撤回依据

原 finding 观察到的 `0.34m` 单 Tick pose delta 是真实的，但据此要求 stair-step pose delta 必须小于 `walkSpeed × fixedDt + quantization` 是错误 oracle，不能证明 Runtime teleport/skip 了未经验证的路径：

- 安装版 Babylon.js 9.21.2 的 `Physics/v2/characterController.js` 明确把 step-up 定义为 teleport/reposition，而非普通 contact-resolution motion；实现依次做 upward、forward、downward cast，拒绝动态落点、不可行走坡面和穿透，然后一次提交 landing pose 与 displacement。
- [Jolt CharacterVirtual 官方实现](https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Physics/Character/CharacterVirtual.cpp) 的 `WalkStairs` 同样执行 up/forward/down sweep 后移动到有效接触点；[官方配置](https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Physics/Character/CharacterVirtual.h) 还设置最小前向步进量，专门避免高帧率下 `velocity × dt` 太小而无法踏上台阶。
- [Jolt 官方 CharacterVirtual 测试](https://github.com/jrouwe/JoltPhysics/blob/master/UnitTests/Physics/CharacterVirtualTests.cpp) 在 60/120/240/360 Hz 验证走楼梯始终保持 floor/progression；Jolt 作者也在[官方讨论](https://github.com/jrouwe/JoltPhysics/discussions/1866)说明，kinematic stair stepping 不能只靠单一速度完成，成熟做法就是 up/forward/down casts 后 reposition。
- 本分支真实 Havok 反证实验中，直接移除 padded forward time 会使合法 0.25m step 以 `runtime-stalled` 失败；把 reposition 强制拆成多 Tick 则会让胶囊停在台阶侧面，产生 `support-surface-mismatch`，且 `surfaceResolutionMode="unmatched"`。两种结果都破坏合法 stair traversal，没有提升证据真实性。

因此本条撤回，不修改生产 step-up 实现。正确门禁是：只允许经过完整 sweep 验证的合法 landing；拒绝动态/穿透/过高/不可行走坡面和窄踏面；在多 cadence 下保持稳定。现有 R1b 的 0.25m 成功、0.35m 失败、窄踏面失败和 cadence fixture 继续承担该职责。如果以后要把每级台阶作为独立 Route station，应该修改 Path/Surface 建模合同，而不是把普通 locomotion 的 `speed × dt` 误套到 kinematic step-up reposition。

## 1. 原始审查元数据（2026-08-24 历史锚点）

- 审查模式：Mode B change review，并补齐 D1，实际覆盖 D1–D6。
- 里程碑定位：M5 确实是“指定主体是否能沿 Required Route 实际通过”的里程碑；它包含 R0 合同、R1 Heightfield、R1b Static Platform，以及真实 fixed-tick Babylon/Havok Controller Gate。
- 变更基线：5d97128d7f4f0e2a6db43a9dd0679eba9bd7f2d0。
- M5 完成 merge：dfe0d35d40af64a03ce2f1882b8cbe8279a0ee5。
- 审查开始 HEAD：4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5。
- 审查期间共享 checkout 被外部切换两次，本审查未切分支：先到 main@1df2facde449540388a8b0967c27710e948c00d5，后到 cursor/workspace-structure-audit-ad0d@1b8487b5607012c82d3c6b014e5ee9f1bd587fc3。4ae1912..1df2fac 在 M5 核心只调整 traversal-runtime-port 的 control-check 顺序；最终 1b8487b 以 4ae1912 为 merge-base，只新增一份 workspace review 文档。因此本文 findings 仍严格锚定 4ae1912。
- M5 变更规模：293 files changed，91,937 insertions，755 deletions。
- 安装依赖：Babylon.js 9.21.2、Havok 1.3.14、recast-navigation 0.43.1（含仓库 patch）、lodash-es 4.18.1。
- 权威规格：
  - docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
  - docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md
  - docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md
  - docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md
  - docs/reviews/runtime-deep-review-checklist.md
  - docs/reviews/full-dimension-review-protocol.md

### 1.1 原始结论（4ae1912）

**NO-GO：M5 当前不能继续保持 “Complete / Final GO / 无 open P0/P1” 的结论。**

冻结的 R0/R1/R1b happy-path 与 adversarial fixture 矩阵大体健康；原始审查在矩阵之外报告了 5 个 P0 候选：

1. 长绕路只因起终点 XZ 接近即可在 0 Tick 假通过；
2. support station 使用 post subject origin，而非 frozen contract 要求的 retained foot；
3. M5 自定义 step-up 在一个 fixed tick 内推进约 8.3 倍普通 locomotion 位移预算，正式成功 fixture 仍通过；该候选后经引擎源码与反证实验撤回，见 0.8；
4. Build Input Receipt 接受与同一 Traversal Lock hash 不一致的伪造胶囊能力；
5. Canonical Probe Receipt 与 context validator 接受 Tick 0 ambiguous support 的 forged complete evidence。

除已撤回的第 3 条外，其余问题不是“测试偶发不绿”，而是 Blocking Gate 可静默给出错误通过，或 Canonical Evidence 可被重哈希后伪造。

### 1.2 权威图

| 事实 | 冻结权威 | 下游 | 本次结论 |
| --- | --- | --- | --- |
| Required Route inventory | ExecutionPlanV5 traversal.connectivityRequirements | Orchestrator、Report | Trusted CLI 主路径完整；公开 Report 工厂未绑定 expected set |
| Traversal capability | ResolvedTraversalLockReceipt + Graph Builder Profile | Capability Envelope、Graph、Runtime | Envelope factory 正确；Build Input receipt admission 未重新绑定 Lock |
| Graph geometry | Canonical Heightfield / Static Collider triangle soup | Recast adapter、Graph evidence | 共享 emitter 正确；远端 Surface scope 与 seam-local proof 有缺口 |
| Ground support | 每 Subject 每 fixed tick 唯一 checkSupport() | Medium、Jump、Evidence | 通过，未发现 ray/AABB 第二接地路径 |
| Runtime Surface identity | retained support + canonical collider correlation | Runtime Evidence | 通过 |
| 3D support station | retained foot XYZ + monotonic path station | expected Surface、Probe receipt | 失败：runner/context 均使用 post subject origin |
| Stair-step landing | Controller up/forward/down sweep + 合法 landing 约束 | Controller、station evidence | 已复核：kinematic reposition 不受普通 `speed × dt` pose-delta oracle 约束；维持过高/窄踏面/cadence 门禁 |
| Canonical Report/Publication | Validation evaluator + context validators | CLI、Browser V5 | 部分失败：缺 route-set binding、MIME/status closure 与 forged receipt rejection |
| Resource lifetime | Runtime owned disposer stack | Controller、Havok native handles | 部分失败：pre-existing partial-construction leak |

### 1.3 自动化证据

审查锚点 4ae1912：

| 命令 | 结果 |
| --- | --- |
| pnpm typecheck | exit 0 |
| focused Route Probe/Receipt tests | exit 0，2 files / 47 tests |
| pnpm build | exit 0，Vite built in 1m58s；仅大 chunk warning |
| pnpm verify:route-r0-contract | exit 0，8 项 |
| pnpm verify:route-r1-heightfield | exit 0，11 fixtures；repeat/concurrent 与 30/60/120-like hashes 一致 |
| pnpm verify:route-r1b-static-platform | exit 0，11 fixtures；legacy census 0；cadence hashes 一致 |
| pnpm verify:canonical | exit 0 |
| pnpm verify:placement-layout | exit 0 |
| pnpm verify:rigged-subject | exit 0 |
| pnpm verify:g-bot-subject | exit 0 |
| pnpm test | exit 1；144/149 files、1584/1589 tests 通过 |
| 单独 route-validation-runner.test.ts | exit 1；真实 V4/V5 case 约 140s，超过 120s test timeout |

全量测试的另外四个失败为 worldkit ready timeout、Browser navigation context destroyed、grassland compile timeout、subject-preset timeout。正式 R1/R1b verifier 没有相同 timeout，因此能通过，但 R1b verifier 实际约耗时 154s。

审查期间外部刷新到 1df2fac 后：

- M5 核心 findings 文件相对 4ae1912 无语义变化；
- pnpm typecheck exit 2，主要因为新 Gameplay integration 的 workspace package symlink 尚未同步，无法解析 @whitebox-world/gameplay-contracts / gameplay / runtime-host；这不是 M5 回归，不能覆盖或改写 4ae1912 的门禁结果。

随后外部切到 1b8487b；它相对 4ae1912 只新增 workspace review 文档，未改变 M5 源码。为避免污染他人的共享 checkout，本审查没有再次切换、安装依赖或重跑重型门禁。

证据分层：本文结论使用 static-read 与 automated-contract。Canonical / Rigged / G Bot gates 生成了截图，但本次没有把截图当作 Route 通过性证据；没有声明 manual-interaction 通过。

### 1.4 原始 Cursor 只读独立复核

- Cursor Agent CLI（Ask/read-only，chat `0bc03737-4255-47d2-9b4c-89a7ad510cbc`）返回 **CODE NO-GO**。
- 它确认六个主审假设的机制均成立，并把 0-Tick 长绕路、Lock/Envelope 未重绑定、forged Tick 0 complete 判为 P0；单节点崩溃、Path topology 合同分裂、partial-construction native leak 判为 P1。
- 分歧（历史）：Cursor 仅凭 static-read 把 retained-foot/post-origin 与 step-up 位移定为 P1，理由是它没有执行门禁假绿/窄踏面脚本。主审当时把两者保留为 P0。后续 retained-foot finding 仍由真实 fixture 的 6 Tick authority 分裂支持；step-up finding 则因冻结上界并不适用于 kinematic stair reposition 而撤回，见 0.8。
- Cursor 未把其余 P1 提升进自己的可复现清单；主审只保留已有子审查执行证据或已独立闭合的当前源码证据，不因 Cursor 未执行这些脚本而删除。

## 2. 旧结论复验

### 2.1 已失效

- docs/reviews/2026-08-24-route-r1b-static-platform-runtime-review.md 的 Final GO、无 open P0/P1 已失效。该 review 的 frozen fixtures 仍通过，但没有覆盖本文的长绕路近终点、retained-foot/post-origin 分离、每 Tick 位移上界、Envelope→Lock 重绑定和 forged Tick 0 evidence。
- docs/18-refactor-progress-and-backlog.md 对 M5 Complete 的强结论已失效，至少应回退为 reopened / blocking fixes required。
- R1/R1b “真实 Controller happy path 能走通”仍成立；“因此所有 Required Route 的通过性证据完备”不成立。

### 2.2 仍成立

- 旧 review 修复后的 wrong-collider、platform-edge support loss、runtime unmatched/ambiguous surface、30/60/120 cadence、reset/rebind、多实例 isolation 均由当前正式 verifier 复验通过。
- checkSupport() 仍是唯一 Ground authority；未重开 ray/AABB grounding、Motion 参数袋或 water medium 旁路。
- Graph/Path/Overlay 的主身份链与 canonical sorting 在已覆盖 fixture 中保持确定性。
- R1b legacy public symbol census 当前 matchCount 为 0；但它没有扫描错误的 v1+json MIME 字符串，见 P1 finding。

## 3. Findings

### [P0] [D4/D6] 长绕路可因起终点 XZ 接近而在 Tick 0 假通过

- 证据（automated-contract）：667:675:packages/validation/src/route-runtime-probe.ts 在 reset 后只比较 subject 与最终 Path point 的 XZ 距离；747:753 的逐 Tick arrival 同样不要求 support station 已进入末段。最小复现使用 16.795m 的 lower→ramp→upper 路径，起终点 XZ 距离 0.4m，结果为 complete、completionDurationTicks=0、fixedTickCallCount=0。此前独立复现的 20m U path、端点距离 0.283m 也得到同样结果。`route-runtime-probe.test.ts:316-333` 另有合法 0.4m 短 Path 的 0 Tick 测试，修复必须保留“整条 Path 总长已在 tolerance 内”的例外。
- 期望：36:59、128:131、351:384:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md 要求主体实际完成同层/分层 Required Route，不得用终点容差跳过整条路径。
- 影响：桥下到桥面、下层到上层、围墙两侧或回环路线可以完全不移动就通过 Blocking Runtime Gate。
- 建议：arrival 必须同时要求 support station 进入最终 segment/node band、Path progress 已到终段，并且实际 support 属于最终允许 Surface。零 Tick 完成只允许 canonical Path 自身总长处于终点容差内。
- 复核：主 Agent 与 Runtime 子审查分别以独立脚本确认；Cursor static-read 确认为 P0。

### [P0] [D4] Support station 使用 post subject origin，而非 retained foot

- 证据（automated-contract）：632:639、726:733:packages/validation/src/route-runtime-probe.ts 和 1698:1735:packages/traversal/src/runtime-probe-contract.ts 都把 subjectPositionMetersXYZ 传给 station。Babylon Port 同时发布 sampledFootPositionMetersXYZ 与 post subject origin，两者并非同一 pose。最小复现中 retained foot 选择 lower surface/segment 0，subject origin 提前选择 transition + upper surface/segment 1。
- 期望：621:649:docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md 明确冻结“每 Tick 用 retained foot XYZ”，且 expected Surface 只能由 Graph/Path 与 retained foot pose 生成。
- 影响：尚未踏上下一层时可提前允许下一层 Surface，或者过早移除当前合法 Surface；分别产生 silent false pass 与 false reject。Receipt context validator 重复相同错误，因此 forged evidence 会自洽通过。
- 建议：runner 和 context validator 一律传 characterSupport.sampledFootPositionMetersXYZ；helper 参数改名为 sampledFootPositionMetersXYZ；增加 foot/post-origin 明确分离的回归。
- 复核：主 Agent、Runtime 子审查和真实 R1b fixture evidence 共同确认；Cursor 确认合同违规机制但因未执行 false-green 脚本定为 P1，主审按上述实测保留 P0。

### [撤回，原 P0] [D4/D5] M5 step-up 在一个 fixed tick 内推进约 8.3 倍普通位移预算

- 原始证据（automated-contract）：真实 `success-steps-platform-ramp` 在 Tick 47 的水平 pose delta 为 0.34m，而 2.4m/s、1/60s、0.001m quantization 的普通 locomotion 预算为 0.041m；该数值观察成立。
- 撤回原因（installed-source + counterexample）：安装版 Babylon 9.21.2 明确把 step-up 作为经过 up/forward/down casts 验证后的 teleport/reposition，而不是 contact-resolution motion。Jolt CharacterVirtual 采用同一成熟模式，并故意设置 minimum step forward 以避免高帧率 `velocity × dt` 过小。直接移除 padding 会让合法 0.25m step `runtime-stalled`；强制多 Tick 截断会停在台阶侧面并得到 `surfaceResolutionMode="unmatched"`。因此原 `speed × dt` pose-delta 期望是错误 oracle，不足以证明未经验证的 skip。
- 正确处置：不改生产 step-up。继续以完整 sweep/landing、动态与穿透拒绝、0.25m 成功、0.35m 与窄踏面失败、30/60/120-like cadence 稳定性为门禁。若产品要证明每一级 tread 都被逐级经过，应先把 tread 变成 Path/Surface 证据合同的一部分。
- 复核来源：见 0.8 的 Babylon installed source、Jolt 官方源码/测试/作者说明与真实 Havok 反证实验。

### [P0] [D4/D6] Build Input Receipt 接受与 Traversal Lock 不一致的伪造 Capability Envelope

- 证据（automated-contract）：425:527:packages/traversal/src/build-input.ts 只校验 Envelope 字段形状/范围；1002:1033 已重新解析并重绑定 Graph Builder Profile；1273:1299 则仍从 caller 提供的 Envelope 自身重算 Receipt，没有从 Lock 重建 Capability。主 Agent从真实 R1b success receipt 克隆输入，把 capsuleRadiusMeters 从 0.32 改为 0.01，保留相同 resolvedTraversalLockHash，createRouteBuildInputReceiptV2 仍 exit 0 并生成新的合法 routeBuildInputHash。
- 期望：79:172:packages/traversal/src/capability-envelope.ts 是 Envelope 唯一派生 owner；307:312:docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md 中 Graph Builder Profile 重绑定已实现，仍缺的是 Lock-derived 胶囊/坡度/步高重算与逐字节校验。
- 影响：Graph Gate 可按伪造的小胶囊、坡度或步高构图，Runtime Gate 仍按真实 Lock 运行；两道 Blocking Gate 虽携带同一 Lock hash，实际证明的是不同能力合同。
- 建议：Build Input context/admission 必须接收 canonical ResolvedTraversalLockReceipt 和 Graph Builder receipt，重新调用唯一 Envelope factory并逐字节比较；所有 Lock-derived 字段做篡改单元表。
- 复核：Contract 子审查发现，主 Agent用真实 receipt 独立重跑确认；Cursor static-read 确认为 P0。

### [P0] [D4/D6] Canonical Probe Receipt 接受错误 Tick 0 support 的 forged complete evidence

- 证据（automated-contract）：813:827:packages/traversal/src/runtime-probe-contract.ts 仅在 ticks.length===0 时把 initial mismatch 计入 metrics；1527:1553 只搜索后续 Tick mismatch；1563:1571 的 complete 检查只拒绝 initial unsupported；1698:1719 的 context validator 同样只在无 Tick 时检查 initial mismatch。主 Agent从真实 385-Tick complete receipt 仅把 initial surfaceResolution 改为 ambiguous；canonicalizer 与 context validator 都接受 complete，wrongSupportSurfaceCount 仍为 0。
- 期望：642:644 及 1080 后的 Runtime oracle:R1b 规格要求 unmatched、ambiguous、wrong resolved Surface 在 Tick 0 也阻断。
- 影响：错误层、重叠 Surface 或伪造的初始 Evidence 可作为 complete Canonical Artifact 被 Report/Browser 接受。
- 建议：initial expected Surface 必须独立派生并始终计入 mismatch；complete 一律拒绝 initial mismatch；context validator 不得只在 zero-tick 分支校验。
- 复核：Contract 子审查发现，主 Agent在真实 receipt 上独立确认；Cursor static-read 确认为 P0。

### [P1] [D3/D4] 合法单节点、零边 Path 在 station helper 中抛 TypeError

- 证据（automated-contract）：286:330:packages/traversal/src/path-receipt.ts 与 113:125:path-receipt.test.ts 明确允许 one-node/zero-edge complete Path；R1b 规格第 635 行也冻结单节点语义。929:1042:packages/traversal/src/runtime-probe-contract.ts 在无 segment 时仍默认 primaryIndex=0 并读取 identities[1]/points[1]，复现为 TypeError。
- 期望：同一 Graph Node 内的不同起终 Anchor 应得到可执行 Path；若不支持必须在 Connectivity 层产生 typed failure，不能由 Runtime 基础设施崩溃。
- 影响：短而合法的 Required Route Graph Gate complete 后无法产生 Canonical Probe Receipt。
- 建议：为单节点返回 arc=0、唯一 Surface；evaluate-route 需保留实际 destination endpoint，增加同 polygon 不同 Anchor 的端到端 fixture。
- 复核：主 Agent与两个子审查均确认；Cursor static-read 确认为 P1。

### [P1] [D3] Runtime runner 额外拒绝 Canonical Path 已允许的拓扑

- 证据（static-read + automated-contract）：212:269:packages/validation/src/route-runtime-probe.ts 拒绝纯竖直 XZ-zero segment、任意非相邻重复 XZ 点和任意非相邻 XZ 自交；297:313:route-runtime-probe.test.ts 把这些值固化为 invalid。Canonical RoutePathReceiptV2 只禁止相邻 3D 完全重复；626:635:R1b 规格明确要求不相邻自交 segment 不能扩大 tie set，而不是把整条 Path 判 invalid。
- 期望：Canonical Path 与 Probe admission 使用同一个关闭合同。当前 walk-only driver 若不支持纯竖直边，应由 Graph/Path contract 明确禁止或返回 typed failure；分层 Path 的 XZ 自交必须由 3D station window 正确处理。
- 影响：合法的分层交叉/回转 Path 会 fail closed 为基础设施输入错误，跨包合同不一致。
- 建议：删除未冻结的 topology blanket rejection，或在 Canonical Path/Graph 边界原子冻结相同限制；增加多层 XZ crossing 与 single-node regressions。
- 复核：主 Agent对拍当前源码、测试和冻结规格确认；Cursor static-read 确认为 P1。

### [P1] [D3] 远端已绑定平台会让无关 Required Route 的 Build Input admission 失败

- 证据（static-read）：992:1010:packages/traversal-recast/src/heightfield-source.ts 把 Execution Plan 的全部 Traversal Surfaces 放入每条 route 的 Build Input；790:808、1110:1120 却只保留与当前 hard ribbon 相交的 Static Colliders。980:997:packages/traversal/src/build-input.ts 又要求每个非 Heightfield Surface join 当前 staticColliders row。子审查在 z=0 地面路线加入 z=100 合法平台后稳定得到 ROUTE_BUILD_INPUT_INVALID。
- 期望：Surface 与 Collider inventory 必须采用同一完整世界或同一路线 scope；无关合法平台不得污染另一条 Required Route。
- 影响：多路线/多平台世界出现无关 false reject，规模越大越容易触发。
- 建议：统一 route-scoped Surface + Collider 筛选规则，或统一使用完整世界 inventory；增加 route 外绑定平台 fixture。
- 复核：Contract 子审查执行复现，主 Agent独立核对当前 join/scope 源码；Cursor 未执行该复现，因此未纳入其清单。

### [P1] [D3/D4] 分层端点歧义被 provider nearest polygon 静默消解

- 证据（static-read）：631:680:packages/traversal-recast/src/evaluate-route.ts 对起终点只调用 findNearestPolygon 并接受单个 provider polygon；query-provider 公共 seam 不返回全部候选；696:730:packages/traversal/src/connectivity-result.ts 也没有 ROUTE_CORRIDOR_LAYER_AMBIGUOUS reason。
- 期望：127:131:Route 规格要求同 XZ 多层端点命中无法唯一选择时返回 ROUTE_CORRIDOR_LAYER_AMBIGUOUS，禁止 nearest/highest/mesh order。
- 影响：桥面/桥下或 stacked platform 的路线可从错误层开始，结果还可能依赖 provider/tile 顺序。
- 建议：endpoint admission 先用 canonical Surface query 枚举/消歧层，再把唯一 Surface 约束交给 provider；反转 polygon/tile 顺序的结果必须稳定。
- 复核：Contract 子审查与主 Agent static-read 确认；Cursor 未执行 endpoint-order 复现，因此未纳入其清单。

### [P1] [D3/D4] 跨 Surface seam 证明不是 edge-local，step 也使用错误采样点

- 证据（static-read）：1298:1340:packages/traversal-recast/src/build-graph.ts 用仅含两个 Surface ID 的 seamCache，并对整对 triangle soups 求全局最小 XZ gap；同一 Surface pair 在远处相接会让当前位置的 gap edge 通过。stepHeight 又在两个 Node centroid XZ 采样，而不是当前 portal/boundary。149:166:adapter-identity.ts 却声明 portal endpoint discontinuity。
- 期望：799:807:R1b 规格要求每条 edge 的 canonical boundary evidence；存在水平 gap 不得发布 edge，step 使用当前 portal 高差。
- 影响：可能形成真实物理 gap 的 Graph false edge，或因斜坡 centroid 高差拒绝 portal 共面的合法 seam。
- 建议：cache key 必须绑定 edge-local canonical boundary/portal；gap 与 step 都在该 boundary 计算。增加“远端 exact seam + 当前 gap”和“portal 共面但 centroid 高差大”的 fixture。
- 复核：Contract 子审查与主 Agent current-source 对拍确认；Cursor 未执行 seam fixture，因此未纳入其清单。

### [P1] [D4/D6] 公开 Validation Report 可对 Required Route 严格子集静默 passed

- 证据（static-read）：75:81、1864:1901:packages/validation/src/route-evaluator.ts 的公开工厂只接收 caller rows，不接收 ExecutionPlan 或 expected route-set receipt；1926:1938 只在 rows 为空时诊断 missing，任意非空子集按 >=1 门槛聚合。Report 虽绑定 executionPlanHash，但没有 expected constraint IDs/count/hash。
- 期望：54:59:Route 规格要求每条 Required Route 都经 Graph +真实 Controller；Report 必须能独立审计 missing required rows。
- 影响：公开、可哈希的 Canonical Report/Browser publication 可以声称世界 passed，却省略 Plan 中未验证的 Route。
- 建议：引入并 hash-bind 从 ExecutionPlan 派生的 expected route-set receipt；Report、validator、Browser publication 全部拒绝 missing/extra/duplicate rows。
- 复核：Validation 子审查确认；主 Agent核对 Trusted orchestrator 当前确实遍历完整 requirements，因此这是公开合同缺口而非已证明 CLI 主路径误判；Cursor 未把它提升为独立 finding。

### [P1] [D2/D6] V2 Route JSON evidence 仍标记为 v1+json

- 证据（static-read）：1167、1203、1308、1317、1467:packages/validation/src/route-evaluator.ts 分别把 V2 Connectivity Failure、Graph、Path、Probe 标为 application/vnd.worldkit.*.v1+json；validate-v2 只检查 mediaType 是字符串，不检查 kind/schemaVersion/mediaType 闭包；legacy census 未扫描这些 MIME 值。RouteValidationSetReceipt 自身仍是 V1，`:1870` 的 v1 MIME 应保留。
- 期望：R1b clean break 要求 V1/V2 bytes 与公共协议原子迁移，不保留 V1 alias。
- 影响：按 MIME 分派的消费者会调用已删除 V1 decoder 或拒绝合法 V2 bytes；Report hash 还会把错误元数据固化。
- 建议：冻结 kind + schemaVersion + mediaType 映射表，V2 四类改为 v2+json，并更新 golden hashes；RouteValidationSetReceipt 本身仍是 V1，应保留 v1。
- 复核：Validation 子审查和主 Agent源码检索确认；Cursor 未把它提升为独立 finding。

### [P1] [D5/D6] SubjectController 部分构造失败泄漏两个 Havok QueryCollector（pre-existing）

- 证据（automated-contract + installed-source）：442:450:packages/runtime-babylon/src/motion-kernel-runtime.ts 分配 PhysicsCharacterController，随后 `:458-461` 执行可能抛错的 bootstrap/checkSupport；`babylon-world-runtime.ts:611-620` 只有构造成功后才注册 disposer。Babylon 9.21.2 characterController.js:208-209 创建两个 collectors，214:223 仅由 controller.dispose 释放。失败注入连续 3 次均 created=2、released=0，虽然 engineDisposed=true。
- 期望：runtime-deep-review checklist 要求 partial construction 和 throwing cleanup 不泄漏 native resources。
- 影响：同一进程启动失败/重试会持续泄漏 Havok handle。
- 建议：把 controller native allocation 后的配置封装为可回滚 factory，catch 时先 dispose 再 rethrow；测试精确比较 created/released handle 集合。
- 复核：Runtime 子审查发现，主 Agent独立重跑 3/3 确认。该问题早于 M5 baseline，不应标成 M5 regression，但属于当前 Runtime debt；Cursor static-read 确认为 P1。

### [P1] [D4/D6] Hosted Studio 导入可绕过 Required Route Validation Report

- 证据（static-read）：生产 runner 读取 trusted Builder receipt 的 `requiresTrustedRouteValidation`，并在为 true 时执行 `worldkit verify route`，见 `scripts/agents/run-spatial-world-agent.sh:211-226`。但是 Studio 的 deliverable inventory 与 `hasTrustedWhiteboxArtifacts()` required paths 不包含 Route report，见 `apps/studio/src/server.mjs:672-701,953-966`；admission 对 Authoring 只检查 `kind/schemaVersion/id`，也不检查 Builder receipt 的 Route-required flag，见 `:998-1030`；通过后直接写入 `ready/passed`，见 `:1061-1098`。现有 `server.test.mjs:842-858` 绿测只证明一个没有 Required Route flag 的浅工件可以导入，不能作为“Required Route 缺 report 仍 passed”的动态 RED。
- 期望：当 Canonical Authoring/Builder receipt 声明存在 Required Route 时，import/recovery 必须要求可发现、canonical 且绑定同一 Authoring/IR/ExecutionPlan/Resource Lock hashes 的 Route Validation Report；缺失、失败或跨世界 report 必须 fail closed。
- 影响：正常生成链路会执行 M5 Blocking Gate，但已有产物导入/恢复链路可跳过它并在 Studio 中显示通过，形成同一工件的双重准入权威。
- 建议：由固定 manifest 指向 nonce report；admission 从可信 Builder receipt 决定是否必需，复用 canonical validator 验证 report/hash closure。增加 Required Route 缺失、错误 hash、failed report 与 exact passing report 四组测试。
- 复核：Contract 子审查发现；主 Agent逐行核对生产 runner、Studio admission、状态提升与现有测试，确认是 `a8b9fd3` 新增 P1，不属于原 M5 实现 finding。修复前必须先补 Required Route + missing/mismatched/failed/exact report 四类 admission 测试。

### [P1] [D5/D6] Visual Capture target 配置失败泄漏完整 Babylon Runtime

- 证据（static-read + automated ownership probe）：`apps/playground/src/main.ts:1998-2009` 已成功创建 Adapter，随后在 `:2010-2013` 配置 target；未知 Runtime Entity 会在 `babylon-world-adapter.ts:668-683` 抛错，但 `createdAdapter` 与 `trackAdapter()` 直到 `main.ts:2014-2016` 才执行。Browser catch 只能释放已登记 owner，见 `worldkit-browser-api.ts:1209-1247`。最小所有权复现返回 `disposed=0,status=error`；正确 disposer 原本会在 `babylon-world-adapter.ts:1107-1122` 移除 listeners 并释放 coordinator。
- 期望：任何已成功创建的 Adapter 必须在后续可抛工作前交给唯一 owner；启动失败仍只 dispose 一次、保留主错误，且不得 mount/render/ready。
- 影响：一个 schema-valid 但引用不存在 Entity 的 capture target 会持续保有 window/canvas listeners 与整套 Babylon/Havok Runtime；重试会累积资源。
- 建议：把 `createdAdapter` 与 `trackAdapter(adapter)` 移到 configure 之前，并为 create→track→configure:throw→dispose 的严格事件顺序增加回归；错误仍应为 `WORLDKIT_CAPTURE_TARGET_NOT_FOUND`。
- 复核：Runtime 子审查发现并执行最小 owner probe；主 Agent对拍初始化、配置、Browser catch 与 disposer 控制流，确认是 `73f1830` 新回归。

### [P1] [D3/D6] Surface Profile / Correlation 基础设施失败被误标为 Route unreachable

- 证据（spec-to-code + automated contract）：冻结 R1b status table 在 `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md:519-539` 明确要求 `surface-profile-missing`、`surface-correlation-missing` 与 `surface-correlation-ambiguous` 使用 `incomplete / unavailable`；实施计划 `docs/superpowers/plans/2026-08-23-route-r1b-static-platform-implementation-plan.md:404-416` 也冻结相同状态。当前 `packages/traversal/src/connectivity-result.ts:892-923` 却把三者放进 `unavailableUnreachable`，producer 在 `packages/traversal-recast/src/evaluate-route.ts:844-852,977-985` 同样产生 `unreachable`。最小动态 probe 得到 profile missing=`unreachable / unavailable`。focused suite 虽 3 files / 26 tests 全绿，但 `evaluate-route.v2.test.ts:123-150` 与 `route-v2-contracts.test.ts:532-575` 正在固化错误状态。
- 期望：Provider/Surface Profile join 缺失或无法唯一相关属于证据基础设施不完整，不是已经证明世界在该能力下不可通过；Canonical Failure、Report 聚合、Browser/Studio 摘要必须统一保留 `incomplete / unavailable`。
- 影响：Report 会把缺 Profile、漏绑定或相关歧义统计成真实 Route failed/unreachable，错误地把基础设施责任归给世界几何/玩法，并误导后续 Agent 去“修地图”。两者目前都会阻断发布，但状态、指标和修复责任已经漂移。
- 建议：把三种 reason 原子移入 `unavailableIncomplete`，producer 改发 `incomplete`；同步更新 canonical contracts、Report/Browser assertions 与 golden hashes。修复前先为三个 reason 分别增加 RED，并断言 status、graphStatus 与下游 aggregation。
- 复核：Cursor Contract/Graph 窄审发现；主 Agent独立对拍冻结规格、实施计划、canonicalizer、producer 与现有测试，并用当前源码 probe 复现。

### [P1] [D2/D3] Coplanar Surface overlap failure 把世界坐标 Y 硬编码为 0

- 证据（static-read + dynamic probe）：`packages/traversal-recast/src/evaluate-route.ts:977-985` 用 overlap witness 的 XZ 构造 `failurePositionMetersXYZ`，中间分量固定写 `0`。当前 elevated overlap fixture 的 step/platform 顶面都在 Y=0.25m（`packages/traversal-recast/src/test-fixture.test-support.ts:267-288`），最小 probe 仍输出 `[6,0,3.666…]`，同时正确保留两个候选 Surface identity。
- 期望：字段名和冻结 reason contract 都要求世界空间 XYZ；歧义位置应落在实际重叠 Surface 上，并在输入排序变化时保持确定性。
- 影响：高架桥面、分层平台或任何非零海拔世界的 failure marker 会落到错误高度；Browser overlay、日志和 AI 修复提示可能指向下层或地面，破坏分层 Route 的可诊断性。
- 建议：从 canonical blocker 对应的确定性 triangle plane 在 witness XZ 求 Y，并按 Envelope 位置精度量化；若两个面高度不相同，则不得伪装为 coplanar overlap。增加非零、非对称高度 fixture，并断言反转输入顺序后的完整 XYZ 稳定。
- 复核：Cursor Contract/Graph 窄审发现；主 Agent以当前真实 fixture 独立复现并核对 Surface 顶面高度。

### [P2] [D2/D6] ambiguous Surface Diagnostic 丢失第二个及后续候选 identity

- 证据（automated contract）：冻结 R1b 规格 `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md:535-555` 要求 ambiguous failure 至少保留两个 identity 和全部内部重叠候选。Canonical failure receipt 在最小 probe 中确实保留 step/platform 两个 identity；但 `packages/validation/src/route.ts:237-244` 只把 `relatedTraversalSurfaceIdentities[0]` 复制到用户/AI-facing Diagnostic，输出中第二个冲突 Surface 消失。
- 期望：面向修复者的 Diagnostic 应表达“哪些 Surface 彼此歧义”，不能把多方冲突降成一个看似独立的 Surface。当前完整 evidence artifact 仍可追溯全部 identities，因此本条定为 P2 而非 P1。
- 影响：默认 Report/Studio 诊断只展示首个候选，AI 或人工必须额外解引用底层 failure artifact 才能还原冲突集合；如果只消费 Diagnostic，会对错误对象执行单边修复。
- 建议：在不引入同义公共字段的前提下，原子设计 plural、closed 的相关 Surface identity 结构，或在已经冻结的结构化 `details` 合同中完整保留排序数组；Schema、generated types、Browser/Studio 与测试必须一起迁移。至少增加 2 个及 3 个 candidate 的顺序稳定断言。
- 复核：Cursor Contract/Graph 窄审发现；主 Agent独立执行 failure→Diagnostic probe，确认完整 receipt 有 2 个 identity 而 Diagnostic 只有首个。

### [P2] [REOPENED 2026-08-25] [D6] 正式 verifier 与同一真实 fixture 的测试预算

- 最新处置：**重新打开。** `scripts/lib/route-validation-runner.test.ts:363` 的专用 timeout 虽已由 120s 调整到 180s，但 `a8b9fd3` 全量 `pnpm test` 中真实 V4/V5 case 为 191.074s，成为 193/194 files、2235/2236 tests 中唯一失败；隔离运行则为 12/12、真实 case 96.565s、suite 103.22s。
- 历史证据：原锚点的真实 fixture 在全量测试约 197s、单独重跑约 140s，均超过当时 120s timeout；正式 verifier 因无同一 timeout 仍可通过。
- 重新打开理由：isolated 与 full-suite 相差近 2 倍，表明资源型 Havok/Recast/Browser tests 在默认并行 lane 内竞争，门禁不能稳定完成；继续增加单 case timeout 会掩盖编排问题。
- 后续建议：保留 `pnpm test` 的完整语义，但拆成并行 contract lane 与串行 resource-heavy lane；focused review 只运行受影响 lane，最终 integration 各 lane 恰好运行一次。修复后要求 full root test 与 isolated runner 都通过。

### [P2] [D6] Browser V2 canonicalizer 允许 complete connectivity 却没有 Path

- 证据（automated-contract）：443:452:packages/runtime-contracts/src/browser-route-evidence.ts 只校验 hasPath implies connectivity complete，没有反向约束。最小 DTO 被接受为 connectivityStatus=complete、routePathStatus=unavailable，且没有 Probe/Overlay。
- 期望：Browser summary 状态必须与 canonical child evidence 双向闭合。
- 影响：独立 DTO、夹具或非 Trusted Host consumer 可发布自相矛盾摘要；当前 Trusted Host factory 不生成该形状，因此定为 P2。
- 建议：connectivity complete 与 hasPath 双向等价；unreachable/incomplete 必须无 Path；建立状态组合表测试。
- 复核：Runtime 子审查发现，主 Agent独立重跑确认；Cursor 未把它提升为独立 finding。

### [P2] [D3/D5] 其他合同、文档与 clean-break 声明不一致

- 证据（static-read）：
  - packages/traversal/src/lock.ts 接受 maxSlopeDegrees=90，build-input 也接受 [0,90]，但 traversal-recast/src/recast-config.ts 要求 [0,90)；
  - docs/18-refactor-progress-and-backlog.md 宣称 Route R0/R1/R1b 已完成且无 open P0/P1，同时在 Validation Report epic 中仍把 Route evidence / Browser/CI 接入列为开放；docs/00-project-overview.md 与 docs/17-canonical-json-quickstart.md 又写完整 M5 仍开放，且 docs/00:153-169 仍把已通过当前 verifier 的 R1b 写成未完成；
  - clean-break 有部分进展，但 `route-runtime-probe.ts` 仍有 `RoutePathReceiptV2 | RoutePathReceiptV2`，`route-evidence-publication.ts` 仍重复导出两组同名 interface。
- 撤回项：旧报告声称 Compiler 未比较 Medium `contentHash`，该判断不准确。Execution Medium projection 有意不暴露 `contentHash`；`compile-traversal-lock.ts:186-189` 已比较 locked Medium hash、resource ref 与 Definition `air` projection。不同于 Motion 的合同形态不等于缺少 fail-closed 校验。
- 期望：公共 Lock 与 provider admission 一致；唯一进度账本、active docs 和 clean-break census 与事实一致。
- 影响：90° profile 在 provider 边界才异常；相互矛盾的完成声明会让后续 Agent 错误跳过阻断修复；重复声明增加协议漂移风险。
- 建议：原子统一 slope domain；把 M5 状态回退为 reopened；清理重复 union/interface 并扩大 clean-break census。
- 复核：Contract/Validation 子审查发现，主 Agent在最新 main 核对源码；Medium 子结论已按当前职责边界撤回，其余未单独提升为 P0/P1。

## 4. 维度覆盖表

| 维度 | 状态 | 证据摘要 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | M5=Route/主体真实通过性；区分 R0、R1、R1b 与 H1/H2/H3、dynamic platform、NPC/goTo 等开放项 |
| D2 Schema 与 AI-friendly | 已查 | V2 naming/identity 主体一致；发现 MIME clean-break、冗余声明、overlap XYZ 错位与 Diagnostic identity 截断 |
| D3 承诺与事实 | 已查 | 对拍 Route/R1b/Validation 规格、backlog、旧 review；发现 complete claim、Path topology、scope/seam/layer 与 Surface failure status 差异 |
| D4 单一权威状态 | 已查 | 检查 Lock→Envelope、Graph、retained support、station、arrival、Medium；确认 4 个有效 P0，撤回 step-up 错误 oracle |
| D5 工程质量 | 已查 | 检查 installed Babylon semantics、partial construction、dispose、test timeout、dead code；native leaks 仍在，新增 Adapter startup leak，runner timeout 重新打开；step-up 经源码复核不构成缺陷 |
| D6 门禁与证据分层 | 已查 | 跑 R0/R1/R1b、full tests、build/typecheck、artifact forgery 与 Surface failure probes；确认现有 profile-missing 测试为 false green，并明确 automated 与 rendered/manual 边界 |

最终处置建议（2026-08-25 最新 main 复验）：重新打开 M5。先修复并以 failing reproducer 锁住全部 P0，再处理 12 个 P1 合同/生命周期缺口；同步把门禁拆成可按影响面选择、最终仍完整闭合的 lane。之后必须重跑 focused regressions、R0/R1/R1b、完整 pnpm test/typecheck/build、同字节 Report/Browser/Studio publication，以及真实窄踏面/分层长绕路交互证据。不能仅凭当前 11+11 fixture matrix 恢复 Final GO。
