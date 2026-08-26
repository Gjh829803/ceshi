# P1.6 AI Schema / WorldChangeSet 设计审查

## 1. 审查元数据

- 模式：A，单份设计规格审查；因规格冻结 Runtime replacement、Browser/CLI protocol 和资源
  cleanup 语义，额外执行 Runtime deep-review checklist 的 authority、transition、lifetime 和
  evidence 条目。
- 对象：
  `docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`。
- 对象状态：Detailed design；implementation not started。
- 分支：`codex/p16-world-change-design`，基于 `origin/main` 创建的隔离 worktree。
- 当前基线 HEAD：`1a3d9ea5e5262732ef42032c75aa6ed7f4c0fb99`。
- 规格基线：`origin/main@1a3d9ea`。
- 当前安装依赖：Babylon.js `9.21.2`、Havok `1.3.14`、Playwright `1.62.1`。
- 引擎语义：本文不新增 Babylon/Havok 坐标、碰撞、Controller 或渲染算法断言；本次没有用
  引擎行为作为 finding 依据，因此不需要对安装源码做新的行为探针。

执行的检查：

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
| `pnpm exec vitest run --config vitest.resource-heavy.config.ts scripts/agent-self-check.test.ts` | 0 | 超时文件定向复跑 2/2 通过；首项 20.6 秒，证实不是本次文档回归 |

未因本次文档变更运行 `pnpm typecheck`、`pnpm build`、Browser verifier 或视觉/人工交互。
worktree 创建时按隔离基线要求运行了 root `pnpm test`；其唯一超时已按同一配置定向复跑通过。
当前变更只新增/修改设计、审查和 Backlog 文档，没有改 TypeScript、Runtime、依赖、构建输入
或产品能力；这些基线测试不构成未来 P1.6 实现已通过的证据。

### Runtime authority map

| 状态/对象 | 规格冻结的唯一 Owner | 下游消费者 | 审查结论 |
| --- | --- | --- | --- |
| Authoring document bytes/hash | `@whitebox-world/authoring` + `@whitebox-world/protocol` | ChangeSet CAS、WorldPackage、Reports | 单一；Registry/IR/Package hashes 分名 |
| ChangeSet/Request identity | `@whitebox-world/authoring-edit` pure contracts | trusted Host journal/CLI/Studio | ChangeSet ID 与 Request ID 分离 |
| Edit scope/revision head/journal | trusted Host adapter | Candidate pipeline、Receipt query | DTO 不能自授 Scope |
| Candidate compile/package/gates | 现有 Authoring/Layout/Compiler/WorldPackage/Validation owners | Host publication | 没有 ChangeSet 私有 compiler |
| active Runtime/WorldSession | `RuntimeHost` | Browser V5、Gameplay、Capture | Authoring/Edit 不直接持有 handle |
| durable publication commit | trusted Host exclusive publication fence | RuntimeHost handle swap、Receipt | Commit transaction 前失败保留旧世界；transaction 后按新 head 恢复 |
| Runtime resource lifetime | RuntimeHost/adapter ownership root | Babylon/Havok/assets | immutable Receipt 只引用 cleanup operation；独立 Cleanup Report + queue 更新状态 |
| simulation time/state | 新 WorldSession fixed Tick | Gameplay/View/Snapshot | Full Reload Tick 0，不隐式迁移旧状态 |

## 2. 旧结论复验

1. `docs/reviews/2026-08-20-sdk-protocol-gates-terrain-audit.md` 的“WorldChangeSet / ChangeReceipt /
   Full Reload 尚无类型和命令”结论仍成立。已复验：当前 `packages/`、`apps/`、`scripts/` 的生产
   TypeScript 没有 `WorldChangeSet` 或 `ChangeReceipt` 匹配；新规格也明确标注 implementation not
   started（5:20:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md）。
2. Browser V5 是 exact 39-key Runtime surface 的结论仍成立。已复验：
   `653:699:apps/playground/src/worldkit-browser-api.test.ts` 枚举精确 keys；新规格选择独立受信
   Authoring/Edit 控制面，不增加第 40 个 key
   （65:66、1245:1251:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md）。
3. RuntimeHost 已有 replacement prepare/ready/swap 底座的结论仍成立。已复验：
   `1277:1339:packages/runtime-host/src/runtime-host.ts` 完成双驻留 preflight、Candidate 创建和 Ready；
   `1341:1362` 做 CAS-like handle swap。它尚未绑定 P1.6 Request/Revision/Package envelope。
4. “旧 Session dispose 失败可在新 Session 已交换后把调用报成失败”是当前源码事实：
   `1355:1357:packages/runtime-host/src/runtime-host.ts` 已交换 current session，随后
   `1374:1380` 在 dispose 抛错时抛出 `WORLD_SESSION_FAILED`。新规格将其冻结为 Commit 后 Cleanup
   Report，不允许反转或修改 committed Receipt
   （100:103、1140:1153:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md）。

## 3. Findings

没有未解决的 P0、P1 或 P2 finding。

主审期间已在作者阶段收敛以下问题，因此不作为开放 finding：

- Registry/Spatial Resource Kind 从开放 `string` 改为关闭 Union；
- `WorldChangeApplyRequestV1` 改为 `requestedOutcome` 判别 Union，禁止
  `publish-runtime` 缺失 Runtime expectation；
- 补齐 Receipt success/rejected closed union、Build identity、affected IDs、Runtime state
  disposition、Explain/Diff/Query DTO；
- 修正 durable request state 图的 rejected 分支；
- 增加 node/terrain、node/override 的 overlap conflict；
- 把可并行任务的 `authoring-edit` 文件所有权拆到互斥子目录；
- 禁止 active Runtime 下 `authoring-only` 提交导致 Authoring head 与 Runtime head 静默分叉。
- 把 `ai-schema-projection-profile` 明确加入关闭 Registry kind，并定义 Profile/Search content
  Hash 的精确对象与 P16-S1 所有权；
- 在 durable commit transaction 与内存 handle swap 之间增加 per-World exclusive publication
  fence、fencing token 和 crash recovery 规则，禁止旁路观察半提交状态；
- 将 Commit 后 cleanup 从 immutable Receipt 中拆出为稳定 `cleanupOperationId` 引用的独立
  Cleanup Report，后续 retry/released 状态不再改变幂等 Receipt。

## 4. 维度覆盖

| 维度 | 状态 | 结论/证据 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | 状态明确为设计未实现；outdoor/Runtime/Incremental 非目标闭合；P1.4 是 Runtime publication 硬依赖（5:20、106:132、1530:1531:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md） |
| D2 Schema 与 AI-friendly | 已查 | 当前对象用 `id`、Change Operation 用 `type`、Request mode 判别、role-qualified IDs/Refs/Hashes、单位字段和关闭 Union 已核对（247:517、521:987:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md） |
| D3 承诺与事实对拍 | 已查 | Authoring hash、override 常量、RuntimeHost replacement/dispose、Browser 39 keys 均从当前源码复验；规格不宣称实现完成 |
| D4 单一权威状态 | 已查（Runtime checklist） | Authoring/Edit/Compiler/Runtime/Browser/cleanup owner map 单一；exclusive fence 遮蔽 durable commit→handle swap 临界段；没有从 DOM/Babylon/Gameplay Command 反推结构真相（162:194、1090:1153、1216:1355:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md） |
| D5 工程质量与可维护性 | 不适用代码审查；设计层已查 | 新包依赖 DAG、文件独占和 parallel/sequential/main-agent-only 工作图已冻结（162:194、1502:1531:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md） |
| D6 门禁与证据分层 | 已查 | Schema/override/ChangeSet/Runtime adversarial matrix及五层证据分开；没有用文档或 smoke 宣称生产能力（1435:1486:docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md） |

## 5. 独立复核状态

按项目本地 `reviewing-with-cursor` 流程启动了一个 design 会话和一个 fresh final review ID。
两个会话均已认证、保持 Ask/read-only、读取了限定文档与关键源码边界，且工作树指纹未漂移；
但两次都在完成 Read 批次后长期停住，未输出 finding 或 GO/NO-GO。主 Agent 已终止无输出进程，
丢弃这两次不完整结果；本文不把 Cursor 存活摘要、候选缺陷字样或认证状态当成独立审查证据。
P16-D0 的结论仅由本页可复现的当前源码对拍和全维度主审支撑。

## 6. 结论

结论：该规格可以作为 P1.6 后续实施计划的设计基线。P1.6 当前仍为未实现；只有工作图中的
Slice A/B 各自通过对应 Gate 后，才能更新能力声明。
