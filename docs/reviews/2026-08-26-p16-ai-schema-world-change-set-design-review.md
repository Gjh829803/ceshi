# P1.6 AI Schema / WorldChangeSet 设计审查

## 1. 审查元数据

- 模式：A，单份设计规格审查；因规格冻结 Runtime replacement、Browser/CLI protocol 和资源
  cleanup 语义，额外执行 Runtime deep-review checklist 的 authority、transition、lifetime 和
  evidence 条目。
- 对象：
  `docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`。
- 对象状态：Detailed design；implementation not started。
- 初次设计冻结分支：`codex/p16-world-change-design`，基于 `origin/main` 创建的隔离 worktree。
- 初次审查基线 HEAD：`1a3d9ea5e5262732ef42032c75aa6ed7f4c0fb99`。
- 初次冻结提交：`main@0cc386cf5e0cdcfb7b4496dece4b6640804ee848`。
- 单一权威 consolidation 基线：`main@0c3cf181f5b109cd2c1c3249d283252bd00b33a9`。
- 当前安装依赖：Babylon.js `9.21.2`、Havok `1.3.14`、Playwright `1.62.1`。
- 引擎语义：本文不新增 Babylon/Havok 坐标、碰撞、Controller 或渲染算法断言；本次没有用
  引擎行为作为 finding 依据，因此不需要对安装源码做新的行为探针。

初次设计冻结执行的检查：

| 命令 | Exit code | 证据范围 |
| --- | ---: | --- |
| `git rev-parse HEAD && git branch --show-current` | 0 | 审查树与分支 |
| `rg -n "WorldChangeSet|ChangeReceipt" packages apps scripts --glob '!**/*.test.ts'` | 1（预期无匹配） | 当前生产源码没有 ChangeSet/Receipt 实现 |
| `nl -ba packages/authoring/src/normalize-v4.ts` 定位 `authoringSpecHash` | 0 | 当前 Hash 由 Normalize 后 identity 计算 |
| `nl -ba packages/runtime-host/src/runtime-host.ts` 定位 replace/preflight/ready/swap/dispose | 0 | 当前 Runtime replacement 与 cleanup 事实 |
| `nl -ba packages/subject-registry/src/subject-resource-registry.ts` | 0 | 当前 override path 是全局首切片常量 |
| `nl -ba apps/playground/src/worldkit-browser-api.test.ts` | 0 | Browser V5 exact 39-key contract |
| `rg` placeholder/alias/open-enum 扫描新规格 | 0 | D1/D2/D3 文本审查 |
| Markdown fence parity check | 0（60，偶数） | 文档结构 |
| `git diff --check` | 0 | whitespace/patch integrity |
| `pnpm test`（worktree 基线） | 1 | contract 191 files / 2,065 tests 全过；resource-heavy 20 files / 404 tests 通过，`agent-self-check` 1 项在全套资源竞争下超过 30 秒 |
| `pnpm exec vitest run --config vitest.resource-heavy.config.ts scripts/agents/agent-self-check.test.ts` | 0 | 超时文件定向复跑 2/2 通过；首项 20.6 秒，证实不是本次文档回归 |

未因初次文档变更运行 `pnpm typecheck`、`pnpm build`、Browser verifier 或视觉/人工交互。
worktree 创建时按隔离基线要求运行了 root `pnpm test`；其唯一超时已按同一配置定向复跑通过。
当前规格和本次 hardening 只修改设计/审查文本，没有改 TypeScript、Runtime、依赖、构建输入
或产品能力；这些基线测试不构成未来 P1.6 实现已通过的证据。

### Runtime authority map

| 状态/对象 | 规格冻结的唯一 Owner | 下游消费者 | 审查结论 |
| --- | --- | --- | --- |
| Authoring document bytes/hash | `@whitebox-world/authoring` + `@whitebox-world/protocol` | ChangeSet CAS、WorldPackage、Reports | 单一；Registry/IR/Package hashes 分名 |
| ChangeSet/Request identity | `@whitebox-world/authoring-edit` pure contracts | trusted Host journal/CLI/Studio | ChangeSet ID 与 Request ID 分离 |
| Edit scope/revision head/journal | trusted Host adapter | Candidate pipeline、Receipt query | DTO 不能自授 Scope；Policy 使用 secret-free Hash 进入审计与 Candidate binding |
| Candidate compile/package/gates | 现有 Authoring/Layout/Compiler/WorldPackage/Validation owners | Host publication | 没有 ChangeSet 私有 compiler；Prepared Candidate 是有期限、无权限含义的 Host lease，Apply admission 原子 pin |
| active Runtime/WorldSession | `RuntimeHost` | Browser V5、Gameplay、Capture | Authoring/Edit 不直接持有 handle |
| durable publication commit | trusted Host exclusive publication fence | RuntimeHost handle swap、Receipt | Candidate pin 不替代 fence；Commit 前复验 authorization/CAS，transaction 后按新 head 恢复 |
| Runtime resource lifetime | RuntimeHost/adapter ownership root | Babylon/Havok/assets | immutable Receipt 只引用 cleanup operation；独立 Cleanup Report + queue 更新状态，可进入 quarantine |
| simulation time/state | 新 WorldSession fixed Tick | Gameplay/View/Snapshot | Full Reload Tick 0，不隐式迁移旧状态；Incremental 使用默认 disposition + scoped exceptions |

## 2. 旧结论复验

1. `docs/reviews/2026-08-20-sdk-protocol-gates-terrain-audit.md` 的“WorldChangeSet / ChangeReceipt /
   Full Reload 尚无类型和命令”结论仍成立。已复验：当前 `packages/`、`apps/`、`scripts/` 的生产
   TypeScript 没有 `WorldChangeSet` 或 `ChangeReceipt` 匹配；新规格也明确标注 implementation not
   started。
2. Browser V5 是 exact 39-key Runtime surface 的结论仍成立。已复验：
   `apps/playground/src/worldkit-browser-api.test.ts` 枚举精确 keys；新规格选择独立受信
   Authoring/Edit 控制面，不增加第 40 个 key。
3. RuntimeHost 已有 replacement prepare/ready/swap 底座的结论仍成立。已复验：当前
   `runtime-host.ts` 已有双驻留 preflight、Candidate 创建、Ready 和 CAS-like handle swap；
   它尚未绑定 P1.6 Request/Revision/Package envelope。
4. “旧 Session dispose 失败可在新 Session 已交换后把调用报成失败”是当前源码事实。新规格
   将其冻结为 Commit 后 Cleanup Report，不允许反转或修改 committed Receipt。

## 3. Findings

没有未解决的 P0、P1 或 P2 finding。

初次主审期间已在作者阶段收敛以下问题，因此不作为开放 finding：

- Registry/Spatial Resource Kind 从开放 `string` 改为关闭 Union；
- `WorldChangeApplyRequestV1` 改为 `requestedOutcome` 判别 Union，禁止
  `publish-runtime` 缺失 Runtime expectation；
- 补齐 Receipt success/rejected closed union、Build identity、affected IDs、Runtime state
  disposition、Explain/Diff/Query DTO；
- 增加 node/terrain、node/override 的 overlap conflict；
- 把可并行任务的 `authoring-edit` 文件所有权拆到互斥子目录；
- 禁止 active Runtime 下 `authoring-only` 提交导致 Authoring head 与 Runtime head 静默分叉；
- 把 `ai-schema-projection-profile` 明确加入关闭 Registry kind，并定义 Profile/Search content
  Hash 的精确对象与 P16-S1 所有权；
- 在 durable commit transaction 与内存 handle swap 之间增加 per-World exclusive publication
  fence、fencing token 和 crash recovery 规则，禁止旁路观察半提交状态；
- 将 Commit 后 cleanup 从 immutable Receipt 中拆出为稳定 `cleanupOperationId` 引用的独立
  Cleanup Report，后续状态不再改变幂等 Receipt。

### 3.1 设计冻结后的 hardening disposition

对冻结规格再次做协议一致性和未来 Incremental 可表达性检查后，确认并修正以下设计缺口：

1. **Request 状态机终态不完整。** 原图只把 `rejected/committed` 作为终态，无法表达
   `validate → validated` 与 `dry-run → dry-run-succeeded`。现已冻结 mode-specific terminal
   states，并明确 Validate/Dry Run Request 不能沿用同一 Request ID 升级为 Apply。
2. **传输断开与业务取消语义未冻结。** V1 现在明确没有公共 Cancel Request；调用方断开、
   AbortSignal 或超时只停止等待，不取消 durable work，后续必须按原 Request ID 查询 Receipt。
3. **Prepared Candidate 缺少可操作的租约边界。** Dry Run Receipt 现在携带到期时间；opaque
   ref 绑定 World、ChangeSet/Base、secret-free Edit Policy、Registry/Compiler/Gate identities，
   持有 ref 不授予 Apply 权限，过期与 Hash/Policy 漂移使用不同 Diagnostic。
4. **Runtime state disposition 对 Incremental 过于粗粒度。** 单个 kind 的单一 disposition 无法
   同时表达“默认 preserved、少数 Entity replaced/reset”。现改为每个 kind 的 default disposition
   加非重叠 scoped exceptions；Full Reload exceptions 必须为空。
5. **Diagnostic 仍有开放 `code: string` / `Record<string, unknown>` 袋。** 现冻结关闭的 Code 和
   code-specific details union，避免实现阶段在 `details` 内长出第二套私有协议。
6. **Authoring/Edit 工作量和 Candidate 留存没有独立预算。** Session Policy 现绑定 ChangeSet
   bytes、Precondition/Operation 数、并发非终态请求、Prepared Candidate 数/字节和最长留存预算；
   超限在分配 Candidate/Runtime 前 fail closed。
7. **Cleanup 只有无限 retry，没有不可自动恢复状态。** Cleanup Report 新增 `quarantined` 和
   attempt count；达到策略上限或发现 ownership corruption 时进入可审计隔离状态，但不改变
   committed Receipt。
8. **Runtime publication 可以绕过已批准 Candidate。** `publish-runtime` 现强制携带仍有效的
   `preparedCandidateRef`；只有 `authoring-only` 可以省略 ref 后完整重建。
9. **Candidate expiry/GC 与 Apply 存在并发空窗。** Apply admission 现于读取 Candidate bytes 前
   对 durable Request ID 原子 pin Candidate；同 Request 恢复复用 pin，不同 Request 不能共享。
10. **授权撤销存在 Commit-time TOCTOU。** Host 在 admission 和 durable commit 前两次验证
    Session、World、Scope、authorization epoch 与 Policy Hash；Commit 前漂移保留旧世界，Commit
    后撤权不反转已提交事实。
11. **Rejected Apply Receipt 丢失请求意图。** Rejected Receipt 现为 mode-specific closed union；
    Apply 分支保留 `requestedOutcome`，所有拒绝分支明确 `publicationMode: "none"`。

上述修正保持 P1.6 scope 不变：没有新增生产实现、Runtime Spawn、Terrain Hot Patch 或普通
Browser API；只让已经承诺的 V1/未来 Incremental 合同可无歧义实现和运维。

### 3.2 单一权威与使用入口收口

后续复核发现，初次 publication hardening 以规范性 amendment 覆盖核心规格，但 Backlog 仍只把
核心规格标记为唯一实施权威。这会让实现者从任务入口读到 optional publication Candidate、旧
Rejected Receipt 和不完整授权流程。现已把 amendment 全部折回核心规格，将 amendment/follow-up
降为 historical review evidence，并在核心规格 §16.5 增加 Add Subject、Add House、Terrain、
Dry Run→Apply、失败/幂等重试的端到端示例。Backlog 继续只把核心规格作为实施输入，同时显式
链接历史发现，避免审查轨迹丢失。

## 4. 维度覆盖

| 维度 | 状态 | 结论/证据 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | 状态明确为设计未实现；Runtime Spawn/Incremental 首切片非目标闭合；P1.4 是 Runtime publication 硬依赖 |
| D2 Schema 与 AI-friendly | 已查 | 当前对象用 `id`、Operation 用 `type`、Request mode 判别、role-qualified IDs/Refs/Hashes、关闭 Diagnostic/Details、required publication Candidate 与五组端到端示例已核对 |
| D3 承诺与事实对拍 | 已查 | Authoring hash、override 常量、RuntimeHost replacement/dispose、Browser 39 keys 均从当前源码复验；规格不宣称实现完成 |
| D4 单一权威状态 | 已查（Runtime checklist） | Authoring/Edit/Compiler/Runtime/Browser/cleanup owner map 单一；Candidate pin、authorization revalidation、exclusive fence 各有唯一边界；transport disconnect 不创造第二取消真相 |
| D5 工程质量与可维护性 | 不适用代码审查；设计层已查 | 新包依赖 DAG、文件独占、workload budget、mode-specific journal state 与 parallel/sequential/main-agent-only 工作图已冻结 |
| D6 门禁与证据分层 | 已查 | Schema/override/ChangeSet/Candidate lease/Runtime/Cleanup adversarial matrix及五层证据分开；没有用文档或 smoke 宣称生产能力 |

## 5. 复核状态

初次冻结时曾按当时的项目外部复核流程启动一个 design 会话和一个 fresh final
review ID。两个会话均已认证、保持 Ask/read-only、读取了限定文档与关键源码边界，且工作树
指纹未漂移；但两次都在完成 Read 批次后长期停住，未输出 finding 或 GO/NO-GO。主 Agent 已
终止无输出进程，丢弃这两次不完整结果；本文不把 Cursor 存活摘要、候选缺陷字样或认证状态
当成独立审查证据。P16-D0 的结论由本页可复现的当前源码对拍和全维度主审支撑。

本次单一权威 consolidation 又启动了一个新的 Cursor design review，chat ID 为
`c73ec210-1dfc-4c26-8942-16b933960091`。会话已认证、保持 Ask/read-only、工作树指纹未漂移，
但主请求超过 180 秒无任何审查输出，live progress 查询也超时；主 Agent 随后终止进程，未生成
report、finding 或 GO/NO-GO。该不完整结果已丢弃，不能作为独立通过证据。本轮结论仍由可复现的
主审、JSON/Authoring Candidate 定向校验、链接/字段一致性检查支撑；文档修订不据此宣称实现或
Runtime Gate 已通过。

项目现已移除该外部复核 helper 与默认调用规则；后续 P1.6 设计和实现以 Host 全维度复核及
可复现门禁为准，不再把 Cursor 结论列为完成条件。

## 6. 当前树验证

| 检查 | 结果 |
| --- | --- |
| P1.6 文档合同检查 | PASS；5 个权威/历史/Backlog 文件，5 个 JSON block，15 个 P16 任务 ID 顺序一致 |
| Authoring V4 Candidate 定向校验 | PASS；Add Subject、Add House、Replace Terrain 三个示例应用到当前 `basic-world.json` 后均通过真实 `parseAuthoringSpecV4` |
| Cursor workflow focused regression | PASS；`scripts/lib/independent-test-gate.test.ts` 9/9，已拒绝被移除的 Python lane |
| `pnpm test:independent` | PASS；按 CI Python 前置运行，Node 23/23、Site 1/1 |
| `pnpm typecheck` | PASS |
| `git diff --check` 与 stale-reference scan | PASS；项目 Cursor skill、独立测试 Python lane script 与对应 Report 字段均无活跃引用 |

本轮没有修改 Runtime、Compiler、Physics、Camera 或 Browser 行为，因此不重跑与这些输入无关的
root Runtime、rendered visual 或 manual interaction 门禁；Independent Site build 已由上述 gate 覆盖。

## 7. 结论

结论：hardening 已收口进唯一核心规格，可以作为 P1.6 后续实施计划的设计基线。P1.6 当前仍为
未实现；只有工作图中的 Slice A/B 各自通过对应 Gate 后，才能更新能力声明。
