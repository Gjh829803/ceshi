# M5 Route Graph / Traversability 深度审查（2026-08-25 最新 main 复验）

> 当前处置以第 0 节为准。第 1 节以后保留 2026-08-24 原始审查锚点、完整 finding 机制和历史门禁证据；其中已经修复或撤回的旧结论会在第 0 节和原 finding 标题中明确标记。

## 0. 2026-08-25 最新 main 复验（当前权威）

- 最新 `origin/main`：`01ee4b9dd403dcc3f05b59ec29d7dbd8e5b17f10`（`refactor: retire legacy three runtime`）。
- 报告分支：`codex/m5-traversability-deep-review`，已先 fetch，再把报告提交 rebase 到上述 main；复验开始时报告分支 HEAD 为 `d8ab34a4a554c09da4dec7495071b227c59a1b3c`。
- 原始审查锚点：`4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5`；从该锚点到最新 main 共 135 个提交。
- 审查模式：Mode B 最新变更复验，并按 full-dimension protocol 补齐 D1–D6；Runtime 部分完整应用 runtime-deep-review checklist。
- 依赖重新按 frozen lockfile 安装：Babylon.js 9.21.2、Havok 1.3.14、recast-navigation 0.43.1、lodash-es 4.18.1。
- 本次只修改审查报告，没有修改 M5、Runtime、Schema、验证器或 SDK 实现。

### 0.1 最新结论

**仍为 NO-GO。最新 main 没有关闭 5 个原 P0，也没有关闭 8 个原 P1。**

main 的大量更新修复了两条旧的次要结论：独立 `route-validation-runner.test.ts` 的 timeout 已关闭；旧报告对 Medium `contentHash` 的判断不准确，现撤回。它们不改变 M5 的阻断结论，因为下面 5 个 P0 已在 `01ee4b9` 上重新执行并复现：

| ID | 当前状态 | 最新 main 自动化复验 |
| --- | --- | --- |
| M5-P0-01 长绕路 0 Tick 假通过 | **仍存在** | 16.795m lower→ramp→upper Path，起终点 XZ 仅 0.4m；结果 `complete`、`completionDurationTicks=0`、`processedTickCount=0`、`fixedTickCallCount=0`。当前 owner 仍在 `packages/validation/src/route-runtime-probe.ts:667-675,747-753`。 |
| M5-P0-02 station 使用 subject origin 而非 retained foot | **仍存在** | 当前 R1b 成功 fixture 中有 6 Tick 的 foot/subject-origin expected Surface set 分裂；最小例中 foot 仍在 segment 0，subject origin 已选择 segment 1。runner 仍在 `route-runtime-probe.ts:632-639,726-733` 传 subject origin，context validator 仍在 `runtime-probe-contract.ts:1698-1727` 重复同一权威错误。 |
| M5-P0-03 step-up 单 Tick 超位移 | **仍存在** | 真实 `success-steps-platform-ramp` 仍 `complete`（385 ticks）；Tick 47 水平位移 0.34m，而冻结上界为 0.041m，即 8.29268 倍。当前实现仍在 `packages/runtime-babylon/src/motion-kernel-runtime.ts:245-280` 扩大 `remainingTime`。 |
| M5-P0-04 Envelope 未与 Lock 重绑定 | **仍存在** | 从真实 receipt 把 `capsuleRadiusMeters` 由 0.32 改为 0.01，保留相同 `resolvedTraversalLockHash`，`createRouteBuildInputReceiptV2` 仍接受并生成新 `routeBuildInputHash`。当前 admission 仍只做字段/Graph Profile 自校验：`packages/traversal/src/build-input.ts:425-527,1002-1033,1273-1299`。 |
| M5-P0-05 forged Tick 0 support | **仍存在** | 从真实 385-Tick complete receipt 把 initial `surfaceResolution` 改为 `ambiguous`；canonicalizer 与 context validator 均接受，`wrongSupportSurfaceCount=0`。当前分支仍在 `runtime-probe-contract.ts:813-827,1527-1571,1698-1719` 漏计有后续 ticks 时的 initial mismatch。 |

这不是“旧源码没看完”的推断：上述 5 个 P0 都有最新 main 的独立运行结果。正式 R1/R1b fixture 全绿只能证明已列 fixture，不足以覆盖这些反例。

### 0.2 原 findings 逐条处置

| 原 finding | 最新 main 处置 | 当前证据 |
| --- | --- | --- |
| P0 长绕路近终点 0 Tick complete | **仍存在** | 最新脚本复现；`route-runtime-probe.ts:667-675,747-753`。 |
| P0 retained foot / subject origin 权威分裂 | **仍存在** | 最新脚本与真实 R1b evidence；6 Tick allowed-set 分裂。 |
| P0 step-up 超出 fixed-tick 位移预算 | **仍存在** | 最新真实 Havok success fixture；0.34m / 0.041m。 |
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
| P2 route-validation-runner timeout | **已关闭** | 专用 timeout 已从 120s 调整到 180s；最新隔离运行 12/12 通过，真实 case 66.522s、suite 71.39s；全量运行中该 case 79.607s，也在预算内。 |
| P2 Browser complete connectivity / unavailable Path | **仍存在** | 最新最小 DTO 仍被接受；`browser-route-evidence.ts:443-452` 只有 `hasPath ⇒ connectivity complete`，没有反向闭包。 |
| P2 slope domain 不一致 | **仍存在** | Lock 接受 `(0,90]`，Build Input 接受 `[0,90]`，Recast 要求 `[0,90)`：`lock.ts:152-167`、`build-input.ts:473-479`、`recast-config.ts:123-129`。 |
| P2 Medium `contentHash` 缺失 | **撤回旧 finding** | Execution Medium 合同有意不暴露 `contentHash`（`execution-plan.ts:337-357`）；compiler 已把 locked Medium hash 与 Definition projection 的 ref/air 比较（`compile-traversal-lock.ts:182-189`）。旧报告把不同职责形态误判成缺校验。 |
| P2 完成声明 / 文档不一致 | **仍存在** | `docs/18-refactor-progress-and-backlog.md:19-22,848-855` 宣称 M5 closed/no P0/P1；同文件 Validation Report epic `:322-325` 仍把 Route/Browser/CI evidence 接入列为开放（不是声称 Route Graph 本身未实现）；`docs/00-project-overview.md:55-57`、`docs/05-mvp-roadmap.md:17`、`docs/17-canonical-json-quickstart.md:25-27` 又写 M5 仍开放。 |
| P2 dead code / clean-break 噪声 | **部分修复** | `route-evaluator.ts` 的冗余分支已清理；但 `route-runtime-probe.ts:212-214` 仍有 `RoutePathReceiptV2 \| RoutePathReceiptV2`，`route-evidence-publication.ts:69-78,346-355` 仍重复导出同名 interfaces。 |

本轮没有确认新的 P0–P2。结论变化仅为：1 条旧 P2 已修复、1 条旧 P2 子结论撤回、1 条 dead-code 子结论部分修复；其余 finding 保持。

### 0.3 最新门禁矩阵

| 命令 / 证据 | `01ee4b9` 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0，26 workspace projects |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0，180/180 files、2194/2194 tests，298.20s |
| 隔离 `route-validation-runner.test.ts` | exit 0，12/12；真实 case 66.522s，suite 71.39s |
| `pnpm verify:route-r0-contract` | exit 0，8 checks；脚本自身明确不证明 R1/R1b |
| `pnpm verify:route-r1-heightfield` | exit 0，11 fixtures、8 adversarial checks；repeat/concurrent/cadence hashes 一致，provider leaks 为空 |
| `pnpm verify:route-r1b-static-platform` | exit 0，11 fixtures；legacy census 0；repeat/concurrent/cadence hashes 一致 |
| `pnpm verify:canonical` | exit 0 |
| `pnpm verify:placement-layout` | exit 0 |
| `pnpm verify:rigged-subject` | exit 0 |
| `pnpm verify:g-bot-subject` | exit 0 |
| `pnpm verify:unreleased-clean-break` | exit 0，641 files、0 forbidden、507 current-authority matches |
| `pnpm build` | exit 0，Vite 2184 modules，1m29s；仅大 chunk warning |

门禁运行生成的动态 session/hash 差异已在取证后恢复；最终分支只保留本文档改动。

### 0.4 变更面与证据边界

从原锚点到最新 main，以下 8 个 finding owner 的 Git blob 完全相同：

- `packages/validation/src/route-runtime-probe.ts`
- `packages/traversal/src/build-input.ts`
- `packages/traversal/src/runtime-probe-contract.ts`
- `packages/traversal/src/path-receipt.ts`
- `packages/runtime-contracts/src/browser-route-evidence.ts`
- `packages/traversal-recast/src/heightfield-source.ts`
- `packages/traversal-recast/src/evaluate-route.ts`
- `packages/traversal-recast/src/build-graph.ts`

`motion-kernel-runtime.ts` 有其他兼容性清理，但 P0 step-up block 与 P1 partial-construction 顺序仍在；`route-evaluator.ts` 有 clean-break 整理，但 Required Route set binding 与 MIME 闭包仍未补齐。

本轮使用 static-read、自动化 contract、真实 Babylon/Havok runtime probe 和完整仓库门禁。Canonical / Placement / Rigged / G Bot gates 生成了 rendered artifacts，但本文不把它们当作 Route 通过性证明；没有声明 manual-interaction evidence。

### 0.5 Cursor 只读独立终审

- 使用新的隔离 review：stage `m5-latest-main-recheck-2026-08-25`，review ID `m5-recheck-01ee4b9-20260825`，Cursor chat `abca8117-00f3-448a-bb7d-c666798fe831`；模式为 Ask/read-only，没有修改文件。
- Cursor 返回 **FINAL NO-GO**，精确未过门禁同样是 `M5 Complete / Final GO / no open P0/P1`。
- 它逐条确认 5 个 P0 和 8 个 P1；确认 runner timeout 已关闭、Medium `contentHash` finding 应撤回、Browser/slope/docs/dead-code 的 P2 处置正确；没有驳回主审 finding，也没有发现新的 P0–P2。
- 证据边界：Cursor 本轮重读当前源码与安装版 Babylon/Havok source，但没有自己重跑 Havok/CLI；对动态数值采用主审在同一 `01ee4b9` 上的执行证据。主审已独立保存复现输出并逐项核对其 source reasoning，没有用 Cursor 结论替代自动化证据。
- 唯一表述校正：`docs/18:322-325` 是 Validation Report epic 仍把 Route evidence / Browser/CI 接入列为开放，不是“Route Graph 尚未实现”；本文已按该职责边界收窄措辞。

### 0.6 当前处置建议

重新打开 M5，并撤回 `Complete / Final GO / no open P0/P1`。修复顺序仍应是：

1. 先为 5 个 P0 提交 fix-before-fix failing reproducer；
2. 修复 P0 后逐条关闭 8 个 P1 合同/生命周期缺口；
3. 把本报告的反例纳入正式 verifier，而不是只保留外部审查脚本；
4. 重跑 focused regressions、R0/R1/R1b、完整 test/typecheck/build、Report/Browser 同字节闭包，以及分层长绕路和窄踏面的真实 Runtime evidence。

`route-validation-runner` timeout 已关闭、Medium finding 已撤回，这两项不构成恢复 M5 Final GO 的依据。

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

冻结的 R0/R1/R1b happy-path 与 adversarial fixture 矩阵大体健康；但是矩阵之外已复现 5 个 P0：

1. 长绕路只因起终点 XZ 接近即可在 0 Tick 假通过；
2. support station 使用 post subject origin，而非 frozen contract 要求的 retained foot；
3. M5 自定义 step-up 在一个 fixed tick 内推进约 8.3 倍允许水平距离，正式成功 fixture 仍通过；
4. Build Input Receipt 接受与同一 Traversal Lock hash 不一致的伪造胶囊能力；
5. Canonical Probe Receipt 与 context validator 接受 Tick 0 ambiguous support 的 forged complete evidence。

这些问题不是“测试偶发不绿”，而是 Blocking Gate 可静默给出错误通过，或 Canonical Evidence 可被重哈希后伪造。

### 1.2 权威图

| 事实 | 冻结权威 | 下游 | 本次结论 |
| --- | --- | --- | --- |
| Required Route inventory | ExecutionPlanV5 traversal.connectivityRequirements | Orchestrator、Report | Trusted CLI 主路径完整；公开 Report 工厂未绑定 expected set |
| Traversal capability | ResolvedTraversalLockReceipt + Graph Builder Profile | Capability Envelope、Graph、Runtime | Envelope factory 正确；Build Input receipt admission 未重新绑定 Lock |
| Graph geometry | Canonical Heightfield / Static Collider triangle soup | Recast adapter、Graph evidence | 共享 emitter 正确；远端 Surface scope 与 seam-local proof 有缺口 |
| Ground support | 每 Subject 每 fixed tick 唯一 checkSupport() | Medium、Jump、Evidence | 通过，未发现 ray/AABB 第二接地路径 |
| Runtime Surface identity | retained support + canonical collider correlation | Runtime Evidence | 通过 |
| 3D support station | retained foot XYZ + monotonic path station | expected Surface、Probe receipt | 失败：runner/context 均使用 post subject origin |
| Fixed-tick displacement | locked Feel speed × fixed dt | Controller、station window | 失败：step-up 扩大 remainingTime 并先提交 pose |
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
- 分歧：Cursor 仅凭 static-read 把 retained-foot/post-origin 与 step-up 位移定为 P1，理由是它没有执行门禁假绿/窄踏面脚本。主审保留 P0：前者已在真实 fixture 观察到 6 Tick 的允许 Surface 集合分裂，且 runner/context validator 共同使用错误权威；后者已用真实 Havok success fixture 测得 0.34m 水平位移，对冻结上界 0.041m，仍被 Blocking Gate 接受。这里记录分歧，不把 Cursor 的保守定级覆盖自动化证据。
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

- 证据（automated-contract）：667:675:packages/validation/src/route-runtime-probe.ts 在 reset 后只比较 subject 与最终 Path point 的 XZ 距离；747:753 的逐 Tick arrival 同样不要求 support station 已进入末段。最小复现使用 16.795m 的 lower→ramp→upper 路径，起终点 XZ 距离 0.4m，结果为 complete、completionDurationTicks=0、fixedTickCallCount=0。此前独立复现的 20m U path、端点距离 0.283m 也得到同样结果。
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

### [P0] [D4/D5] M5 step-up 在一个 fixed tick 内推进约 8.3 倍允许水平距离

- 证据（automated-contract + installed-source）：250:284:packages/runtime-babylon/src/motion-kernel-runtime.ts 把 remainingTime 扩到足够走过 capsule radius + keepDistance + 0.02m，再仅裁剪返回的 consumed time。安装版 Babylon 9.21.2 characterController.js:1329-1343 用扩大的 remainingTime 计算 sweep 距离，1409:1444 在返回前直接提交 landing pose。真实 success-steps-platform-ramp 在 Tick 47 的水平位移为 0.34m，而 2.4m/s、1/60s、0.001m quantization 只允许 0.041m，比值 8.29268；fixture 仍以 385 ticks complete。
- 期望：369:373:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md 禁止 teleport/skip；626:629:R1b 规格把 station 最大前进锁为 walkSpeed × fixed dt + quantization。
- 影响：station 落后于真实 pose，无法证明每个中间 tread/path section 被实际经过；窄踏面或中间阻挡可能被 step-up 跨过，而 Gate 仍记录 complete。
- 建议：不要通过扩大 physics time budget 获得前向 clearance。修复必须先有真实失败 fixture，并逐 Tick 断言 planar pose delta 不超过冻结上界；增加不可跳过的窄 tread/blocker。
- 复核：主 Agent重跑真实 Havok probe，数值与子审查完全一致；已对照安装依赖源码。Cursor 确认时间扩张与 pose commit 机制但因未执行窄踏面脚本定为 P1，主审按真实 success fixture 的越界位移保留 P0。

### [P0] [D4/D6] Build Input Receipt 接受与 Traversal Lock 不一致的伪造 Capability Envelope

- 证据（automated-contract）：425:527:packages/traversal/src/build-input.ts 只校验 Envelope 字段形状/范围；1002:1033 只重新解析 Graph Builder Profile；1273:1299 从 caller 提供的 Envelope 自身重算 Receipt。主 Agent从真实 R1b success receipt 克隆输入，把 capsuleRadiusMeters 从 0.32 改为 0.01，保留相同 resolvedTraversalLockHash，createRouteBuildInputReceiptV2 仍 exit 0 并生成新的合法 routeBuildInputHash。
- 期望：79:172:packages/traversal/src/capability-envelope.ts 是 Envelope 唯一派生 owner；307:312:docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md 要求 Build Input admission/Receipt 重算并证明 Lock-derived Capability，而不是只信 Envelope 自己。
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

- 证据（static-read）：1190、1226、1331、1340、1505:packages/validation/src/route-evaluator.ts 分别把 V2 Connectivity Failure、Graph、Path、Probe 标为 application/vnd.worldkit.*.v1+json；validate-v2 只检查 mediaType 是字符串，不检查 kind/schemaVersion/mediaType 闭包；legacy census 未扫描这些 MIME 值。
- 期望：R1b clean break 要求 V1/V2 bytes 与公共协议原子迁移，不保留 V1 alias。
- 影响：按 MIME 分派的消费者会调用已删除 V1 decoder 或拒绝合法 V2 bytes；Report hash 还会把错误元数据固化。
- 建议：冻结 kind + schemaVersion + mediaType 映射表，V2 四类改为 v2+json，并更新 golden hashes；RouteValidationSetReceipt 本身仍是 V1，应保留 v1。
- 复核：Validation 子审查和主 Agent源码检索确认；Cursor 未把它提升为独立 finding。

### [P1] [D5/D6] SubjectController 部分构造失败泄漏两个 Havok QueryCollector（pre-existing）

- 证据（automated-contract + installed-source）：463:483:packages/runtime-babylon/src/motion-kernel-runtime.ts 在 new PhysicsCharacterController 后仍执行可能抛错的 bootstrap/checkSupport；审查锚点 777:786:babylon-world-runtime.ts 只有构造成功后才注册 disposer。Babylon 9.21.2 characterController.js:208-209 创建两个 collectors，214:223 仅由 controller.dispose 释放。失败注入连续 3 次均 created=2、released=0，虽然 engineDisposed=true。
- 期望：runtime-deep-review checklist 要求 partial construction 和 throwing cleanup 不泄漏 native resources。
- 影响：同一进程启动失败/重试会持续泄漏 Havok handle。
- 建议：把 controller native allocation 后的配置封装为可回滚 factory，catch 时先 dispose 再 rethrow；测试精确比较 created/released handle 集合。
- 复核：Runtime 子审查发现，主 Agent独立重跑 3/3 确认。该问题早于 M5 baseline，不应标成 M5 regression，但属于当前 Runtime debt；Cursor static-read 确认为 P1。

### [P2] [RESOLVED 2026-08-25] [D6] 正式 verifier 与同一真实 fixture 的测试预算

- 最新处置：**已关闭。** `scripts/lib/route-validation-runner.test.ts:363` 的专用 timeout 已由 120s 调整为 180s；最新 main 隔离运行 12/12 通过，真实 V4/V5 case 66.522s、suite 71.39s；全量 `pnpm test` 中该 case 79.607s，也在预算内。
- 历史证据：原锚点的真实 fixture 在全量测试约 197s、单独重跑约 140s，均超过当时 120s timeout；正式 verifier 因无同一 timeout 仍可通过。
- 关闭理由：当前隔离和全量两条证据都在显式预算内，且完整 `pnpm test` 为 180/180 files、2194/2194 tests。并发重负载下的单次超时不再作为产品缺陷计入。
- 后续建议：继续保留 wall-clock regression budget；若耗时重新接近 180s，再 profile 重复的 canonical build / Browser / Runtime 初始化工作。

### [P2] [D6] Browser V2 canonicalizer 允许 complete connectivity 却没有 Path

- 证据（automated-contract）：443:452:packages/runtime-contracts/src/browser-route-evidence.ts 只校验 hasPath implies connectivity complete，没有反向约束。最小 DTO 被接受为 connectivityStatus=complete、routePathStatus=unavailable，且没有 Probe/Overlay。
- 期望：Browser summary 状态必须与 canonical child evidence 双向闭合。
- 影响：独立 DTO、夹具或非 Trusted Host consumer 可发布自相矛盾摘要；当前 Trusted Host factory 不生成该形状，因此定为 P2。
- 建议：connectivity complete 与 hasPath 双向等价；unreachable/incomplete 必须无 Path；建立状态组合表测试。
- 复核：Runtime 子审查发现，主 Agent独立重跑确认；Cursor 未把它提升为独立 finding。

### [P2] [D3/D5] 其他合同、文档与 clean-break 声明不一致

- 证据（static-read）：
  - packages/traversal/src/lock.ts 接受 maxSlopeDegrees=90，build-input 也接受 [0,90]，但 traversal-recast/src/recast-config.ts 要求 [0,90)；
  - docs/18-refactor-progress-and-backlog.md 宣称 Route R0/R1/R1b 已完成且无 open P0/P1，同时在 Validation Report epic 中仍把 Route evidence / Browser/CI 接入列为开放；另外三份 active docs 又写完整 M5 仍开放；
  - clean-break 有部分进展，但 `route-runtime-probe.ts` 仍有 `RoutePathReceiptV2 | RoutePathReceiptV2`，`route-evidence-publication.ts` 仍重复导出两组同名 interface。
- 撤回项：旧报告声称 Compiler 未比较 Medium `contentHash`，该判断不准确。Execution Medium projection 有意不暴露 `contentHash`；`compile-traversal-lock.ts:182-189` 已比较 locked Medium hash、resource ref 与 Definition `air` projection。不同于 Motion 的合同形态不等于缺少 fail-closed 校验。
- 期望：公共 Lock 与 provider admission 一致；唯一进度账本、active docs 和 clean-break census 与事实一致。
- 影响：90° profile 在 provider 边界才异常；相互矛盾的完成声明会让后续 Agent 错误跳过阻断修复；重复声明增加协议漂移风险。
- 建议：原子统一 slope domain；把 M5 状态回退为 reopened；清理重复 union/interface 并扩大 clean-break census。
- 复核：Contract/Validation 子审查发现，主 Agent在最新 main 核对源码；Medium 子结论已按当前职责边界撤回，其余未单独提升为 P0/P1。

## 4. 维度覆盖表

| 维度 | 状态 | 证据摘要 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | M5=Route/主体真实通过性；区分 R0、R1、R1b 与 H1/H2/H3、dynamic platform、NPC/goTo 等开放项 |
| D2 Schema 与 AI-friendly | 已查 | V2 naming/identity 主体一致；发现 MIME clean-break 与冗余声明 |
| D3 承诺与事实 | 已查 | 对拍 Route/R1b/Validation 规格、backlog、旧 review；发现 complete claim、Path topology、scope/seam/layer 差异 |
| D4 单一权威状态 | 已查 | 检查 Lock→Envelope、Graph、retained support、station、arrival、Medium；确认 5 个 P0 |
| D5 工程质量 | 已查 | 检查 installed Babylon semantics、partial construction、dispose、test timeout、dead code；step-up/native leak 仍在，旧 timeout 已在最新 main 关闭 |
| D6 门禁与证据分层 | 已查 | 跑 R0/R1/R1b、full tests、build/typecheck、artifact forgery probes；明确 automated 与 rendered/manual 边界 |

最终处置建议（2026-08-25 最新 main 复验后不变）：重新打开 M5。先修复并以 failing reproducer 锁住全部 P0，再处理 P1 合同缺口；之后必须重跑 focused regressions、R0/R1/R1b、完整 pnpm test/typecheck/build、同字节 Report/Browser publication，以及真实窄踏面/分层长绕路交互证据。不能仅凭当前 11+11 fixture matrix 和全量门禁变绿恢复 Final GO。
