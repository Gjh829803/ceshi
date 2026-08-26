# P1.6 Full Reload 变更审查（Mode B）

## 1. 审查元数据

- 模式：B，分支 diff 变更审查；因 H1/B1 触及 RuntimeHost publication、Browser/CLI
  入口和资源 cleanup，额外执行 Runtime deep-review checklist 的 authority、
  transition、lifetime 与 evidence 条目。
- 对象：`cursor/p16-world-changeset-runtime-publication-1ccf` 相对 `origin/main`。
- 权威规格：
  [`2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`](../superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)。
  规格文档状态行仍为 *Detailed design；implementation not started*；那是文档元数据，
  不以它代替 Backlog 的 first-slice 完成口径，也不把它改成 Implemented。
- 审查基线：修复前 HEAD `2f2bacc`；本记录覆盖随后的 recover 终态保护、F1 断言修正、
  `rebaseRequired` 不进 A0 的裁定，以及 revision 序号只在 Commit point 分配。
- Diff 基线：`origin/main` merge-base `021feb5`。
- 当前安装依赖：Babylon.js `9.21.2`、Havok `1.3.14`（`package.json`）。
- 引擎语义：本次不以 Babylon/Havok 坐标、Controller 或 dispose 源码行为作为
  P0/P1 依据。Full Reload 复用已有 RuntimeHost replacement；Havok/Babylon 只在
  Playground adapter 的 Candidate Ready 门后出现。
- Codex / Cursor Agent CLI：本环境不可用。审查由主 Agent 按协议独立复验，
  不是双通道。

### Runtime authority map（已复验）

| 状态/对象 | 唯一 Owner | 下游 | 结论 |
| --- | --- | --- | --- |
| Authoring document hash | `hashAuthoringDocumentV4` | ChangeSet CAS、Receipt | 单一；不再用 Normalize 后 identity |
| ChangeSet / Request 身份 | `@whitebox-world/authoring-edit` | journal / CLI / Edit API | ID 分离；禁止 alias |
| Edit Session / revision head / journal | `authoring-host` | Candidate、Receipt query | 进程内 Map，不是磁盘 WAL |
| Candidate compile / 最小 Package | 现有 Normalizer/Compiler/WorldPackage | Host publication | 无 ChangeSet 私有 compiler |
| active Runtime / WorldSession | `RuntimeHost` | Browser V5、Capture | Edit API 不持有 Babylon handle |
| durable publication commit | journal `persistDurableCommit` + RuntimeHost swap | Receipt、cleanup | Commit 前失败保留旧世界 |
| simulation time | 新 WorldSession fixed tick | Snapshot | Full Reload tick 0 |
| Browser Runtime 面 | `window.__WORLDKIT__` V5 exact 39 keys | Gameplay/Camera/Route | 不加第 40 个 key |
| Browser 结构写入面 | `window.__WORLDKIT_AUTHORING_EDIT__` | Schema/Change | 仅 authoring 页 |

## 2. 旧结论复验

1. 设计审查
   [`2026-08-26-p16-ai-schema-world-change-set-design-review.md`](2026-08-26-p16-ai-schema-world-change-set-design-review.md)
   写「生产源码没有 WorldChangeSet」——**已失效**。当前分支已有
   `@whitebox-world/authoring-edit` 与 `@whitebox-world/authoring-host`。
2. Browser V5 exact 39 keys——**仍成立**。已复验
   `apps/playground/src/worldkit-authoring-edit-api.browser.test.ts` 与
   `worldkit-browser-api.test.ts`。
3. RuntimeHost 已有 replacement 底座、P1.6 需绑定 Request/CAS envelope——**已落地为**
   `publishWorldReplacementV1`；`replaceWorld` 仍保留。
4. 「旧 Session dispose 失败不可把已交换世界报成失败」——**publication 路径已成立**
   （quarantine + committed Receipt）。`replaceWorld` 仍 throw，且不 rollback swap。
5. `rebaseRequired` 在 §13.3 出现、§10.3 Receipt 关闭 union 没有该字段——**仍成立**。
   本切片不把未 parse 字段写进 Receipt。

## 3. Findings

### [P1] [D4] recover 会把终态 Receipt 改写成 rejected — 已修复

- 证据（`static-read`，修复前）：`recoverWorldChangeRequestV1` → `advance()` 先
  `authorize()`。Session 过期或 `isActive: false` 时调用 `rejectRecord()`，把
  `committed` / `validated` / `dry-run-succeeded` 覆盖为 `rejected`。
  `submit()` 对已有 `receipt` 会直接返回，所以普通重试安全；**recovery API 不安全**。
  规格 §13.2 / §16.5.5：Commit 后撤权必须返回 byte-identical Committed Receipt。
- 期望：终态记录只返回原 Receipt，不再做 admission/authorization。
- 影响：Commit 后 Host 崩溃恢复、或过期 Session 上调用 recover，会毁掉审计事实，
  并与仍推进的 revision head 分叉。
- 修复：`advance()` 在 `isTerminalStateV1(record.state) && record.receipt` 时直接返回。
  回归：`journal.test.ts` 「does not rewrite a committed Receipt…」；
  `publication-adversarial.test.ts` 在 Commit 后 expire + recover。
- 复核：已独立复现源码路径后修复；focused journal 测试待本记录随后的命令栏闭合。

### [P1] [D3] F1 对抗测试有两条与规格相反的断言 — 已修正

- 证据（`automated-contract`，修复前）：
  1. pin-race 期望 `WORLD_CHANGE_PREPARED_CANDIDATE_STALE`。实现先做
     `hasNonTerminalApplyOnWorldV1`，返回 `WORLD_CHANGE_PUBLICATION_CONFLICT`。
     规格 §13.1：原 Apply 未终态时，第二个 Apply 可按 active-request admission 拒绝。
     `PREPARED_CANDIDATE_STALE` 留给 Candidate binding 漂移（§18）。
  2. terrain Dry Run 期望 `publicationMode: "full-reload"`。§10.3 Dry Run 成功 Receipt
     必须是 `publicationMode: "none"`；Full Reload 只出现在 publish-runtime committed。
- 期望：测试跟随规格，不把实现扭成错误合同。
- 影响：F1 证据红，且会误导后续 Agent 改 Receipt 形状。
- 修复：断言改为 `PUBLICATION_CONFLICT` 与 `publicationMode: "none"`。
- 复核：已对照 §10.3 / §13.1 / §18。

### [P1] [D3] `definition-override-set` 未调用 O1 校验器 — 确认，本切片不接线

- 证据（`static-read`）：`apply.ts` `setOverride()` 只 upsert；
  `validateDefinitionResourceRefOverrideV1` 存在但 journal `applyWorldChangeSetV1`
  调用处未使用。Host 测试与 F1 golden 都不提交 override Operation。
- 期望：O1 在 Apply 前 fail-closed。
- 影响：若 Agent 现在提交 `definition-override-set`，Candidate 可能写入未授权 path。
- 建议：下一刀在 journal 于 C1 之后注入 O1（需要 Definition + Registry Lock + Policy
  交集）。本切片不半接一个没有 Lock 的 path-only 检查，避免假安全感。
- 复核：已确认 Host 无调用。文档/Backlog 已标明。

### [P2] [D3] `rebaseRequired` 不进 A0 — 已按设计原则裁定

- 证据：旧 §13.3 散文写了 `rebaseRequired: true`，但 §10.3 Receipt 关闭 union
  **没有**该字段。实现返回 `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH` +
  `currentAuthoringSpecHash`，`conflictingIds` 放入 ChangeSet Operation Target。
- 裁定：不把 `rebaseRequired` 加进 A0 DTO / parser / Receipt。它与上述 Diagnostic
  code 1:1 同义，违反「一个概念一个词」和「用关闭判别器，不用重叠可选布尔」。
  完整 Base→Current 文档 diff 需要 Base 文档字节；首切片没有这份字节时不得伪造
  更精确的 diff。
- Agent 合同：看到该 code 就读 `currentAuthoringSpecHash`，新建 ChangeSet ID /
  Request ID。Parser 拒绝 Receipt 上的 `rebaseRequired`。
- 文档：§13.3 已改成与 §10.3 同一套字段；README / Quickstart 写明处理步骤。

### [P2] [D2] Host query missing/pending 抛 host-local 错误码

- 证据：`AuthoringEditHostErrorV1` 使用 `WORLD_CHANGE_RECEIPT_MISSING` /
  `PENDING` 等，不在 `WORLD_CHANGE_DIAGNOSTIC_CODES_V1`。Journal query 返回
  `{ status: "missing" | "pending" }`。
- 期望：封闭 diagnostic 表不被 transport 语义污染。
- 影响：Agent 若把 throw code 当成 Receipt diagnostic 会误判。
- 建议：文档写清：Edit API `getWorldChangeReceipt` 在 missing/pending 时抛 Host
  错误；终态才返回 Receipt。
- 复核：不把这些 code 加进封闭表。

### [P2] [D3] `commit-failed` 映射为 `WORLD_CHANGE_CANDIDATE_INVALID`

- 证据：`submit.ts` `publicationFailure("commit-failed")` →
  `failurePhase: "publication-commit"` + `WORLD_CHANGE_CANDIDATE_INVALID`。
  封闭码表没有 commit-failed 专用 code。Authz 拒绝走 `commitDenial`，不受此影响。
- 期望：Agent 以 `failurePhase` 区分 publication-commit 与 candidate 编译失败。
- 建议：不发明新公共 diagnostic。入门写：看 `failurePhase`，不要只看 code。
- 复核：确认为 first-slice 映射，不是静默成功。

### [P1] [D4] Prepare 失败会空耗 revision 序号 — 已修复

- 证据（`automated-contract`，修复前）：`nextAuthoringRevisionRefV1` 在进入
  `preparing-runtime` / `committing` 时调用。stale expectation 的 Apply 预支
  `/2` 后被拒，随后成功 Commit 变成 `/3`。F1 集成测试因此失败。
- 期望：Authoring revision ref 只在唯一 Commit point 分配。失败的 Prepare /
  preflight 不得占用下一个 head。
- 修复：状态转入 `preparing-runtime`/`committing` 不再 `next()`；
  `persistDurableCommit` 与 authoring-only commit 在授权通过后才 reserve。
  Rejected record 丢掉 `pendingRevisionRef`。
- 回归：journal「expectation-stale 后再发布仍是 `/2`」；集成测试仍断言 `/2`。

### [P2] [D4] publication fence 弱于 §14.2 全文

- 证据：`fencingToken` 被 RuntimeHost parse 但不消费。`snapshot()` 不经
  `enqueueMutation`。Prepare 期间旧世界可 `runFixedInput` 推进 tick。
  journal 持有 fencing token 并用于 recovery sweep。
- 期望：§14.2 把 fence 与 Candidate pin 分成两个原子边界；RuntimeHost 只接收
  已验证 configuration + CAS envelope。
- 影响：直接调用 `publishWorldReplacementV1` 且 CAS 仍有效时，可绕过 journal
  token。Playground 只从 Edit Host 调用。
- 建议：保持 Host 拥有 fence、RuntimeHost 拥有 CAS 的 first-slice 分工；不要在
  未扩合同前让 RuntimeHost 存第二份 token 权威。
- 复核：不作为 P0。文档已写明。

### [P2] [D3] Dry Run `validationReports` 恒为空；Cleanup 无 retry 队列

- 证据：`assembleCandidateReceiptFieldsV1` 写 `validationReports: []`。
  Cleanup Report 在 commit 时一次性写入 `released` / `quarantined`。
- 期望：§10.3 可绑定 gate report；§16.4 有 `retrying` / `CLEANUP_INCOMPLETE`。
- 影响：Gate 通过与否只体现在 Dry Run 成败，不体现在 report refs。
- 建议：后续把 `evaluateRequiredGates` 的 report 写入 Receipt；Cleanup 队列留给
  磁盘 WAL 切片。
- 复核：不假装已有完整 cleanup worker。

### [P2] [D6] 页面级加房屋 Full Reload 的 rendered 证据未关闭

- 证据：Chromium 测试覆盖 Edit 安装/缺席与 V5 39 keys。Host↔RuntimeHost 集成用
  fake Gameplay port 证明新 WorldSession / tick 0。没有独立 Browser verifier
  在 `?authoring=1` 上 apply add-house 并截图。
- 期望：F1 五层证据分层，不互相冒充。
- 影响：不能用 unit 宣称「页面上已经看见新房子」。
- 建议：G1 全量门禁后，若要声称 rendered，再补 authoring-only/publish-runtime
  的 Chromium 用例。
- 复核：文档已分层。

## 4. 已查无问题

- Browser V5 未增加 key；catalog 不安装 Edit API。
- `authoring-host` ↛ `runtime-host`；`runtime-host` ↛ `authoring-edit`。
- `publish-runtime` 必须带 `preparedCandidateRef` + `runtimeExpectation`。
- `hasActiveRuntimeBinding` 时 authoring-only commit 被拒。
- Prepare / expectation stale 不推进 revision head。
- Quarantine 不改写 committed Receipt；cleanup 诊断在 bridge 收成
  `WORLD_CHANGE_CLEANUP_QUARANTINED`，不泄漏 `GameplayDiagnostic`。
- CLI 文件模式禁止 in-place、Dry Run/Apply 不同 Request ID、redact token。
- 生产代码使用 `===` / `!==` 与 `lodash-es` 具名导入。
- 未实现 Incremental Handler；`fixed-tick` 返回
  `WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED`。

## 5. 维度覆盖表

| 维度 | 状态 |
| --- | --- |
| D1 | 不适用（Mode B）；未把 Incremental/室内/载具写成已支持 |
| D2 | 已查；Receipt 命名与关闭 union 成立；host-local query 码已记录 |
| D3 | 已查；Backlog/README/Quickstart 已与 first-slice 事实对齐 |
| D4 | 已查；recover 终态覆盖已修；fence/snapshot 弱保证已记录 |
| D5 | 已查；F1 断言已改到与规格一致 |
| D6 | 见下节命令；rendered/manual 未跑 |

## 6. 验证命令

审查当轮先跑 focused 回归，不把未跑的全量门禁写成已通过。

| 命令 | 预期 | 证明范围 |
| --- | --- | --- |
| `pnpm exec vitest run packages/authoring-host/src/journal/journal.test.ts packages/authoring-host/src/journal/publication-adversarial.test.ts scripts/lib/authoring-edit-full-reload.integration.test.ts` | 见本轮实际输出 | recover 终态、F1 对抗、Host↔RuntimeHost |
| `pnpm typecheck` | 见本轮实际输出 | TS 合同 |
| `pnpm test` / `pnpm build` | G1 再跑 | 全量 Vitest + bundle；本记录不提前宣称 |
| `pnpm test:studio` / Browser verifier / 人工操作 | 未跑 | 输入未改 Studio；无新 rendered claim |

G1 Final GO 必须在修复后的树上另跑 `pnpm typecheck`、`pnpm test`、`pnpm build`，
并保持「未跑及原因」。规格头 *implementation not started* 不要改。
