# 既有设计问题收口审查

## 1. 审查元数据

- 模式：B 变更审查，并对 current-only、Native repair、固定 Tick 与包边界执行定向整仓复验。
- Diff 基线：`origin/main@d475c94411410105d81fdd5fd85d6aadab5e11f0`。
- 实现与测试快照：`00ffebeeabecc3517fd9262389fd56e0d83d6a99`；其后的改动只更新本报告，不改变源码、依赖或测试输入。
- Runtime 依赖：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`，以当前 lockfile 为准。根据已安装 Babylon 源码复核 `checkSupportToRef` 行为后，本变更修正 Adapter 的支撑状态发布语义，没有修改引擎、Controller 参数或 Physics 算法。
- 权威输入：`AGENTS.md`、`docs/18-refactor-progress-and-backlog.md`、Validation、Simulation Take、Native Lane 规格、本次实施计划、全维度审查协议和 Runtime 深审清单。

冻结源码后的本地自动证据（均为 exit code 0）：

- Babylon Character Body transaction：76/76。
- Traversal Runtime Port 的 Tick phase 聚焦回归：51/51。
- P1.5 conformance、Traversal Runtime support conformance 与 Route Runtime probe integration：3 个文件、29/29。
- Cursor 首轮指出的四类契约断言连同 BodyPort 回归：5 个文件、113/113；其中后续只扩大 Surface identity 保留带，该受影响 BodyPort 文件又以 76/76 复验。
- 完整 `pnpm verify:route-r1b-static-platform`：11 个 fixture oracle 全通过；重复、并发和 30/60/120 Hz-like cadence Hash 一致。
- `pnpm verify:workspace-boundaries`：0 条登记债务，2,080 个公共符号。
- `pnpm verify:unreleased-clean-break`：0 个禁止命中、642 个当前合同符号。
- `pnpm verify:3c-migration`：11 条 ledger、39 个 live reference、10 条单一权威不变量。
- `pnpm test:census`：447 个测试文件、404 个 active、43 个 resource-heavy。
- `pnpm check:native-block-builder-skill`：26/26。
- 最新主线 Native Package reproducer：12/12。
- `git diff --check`。

Cursor 对前一冻结候选 `befe16161e498e3bee9a5504275855a1fb163b82` 的完整门禁中，self-check、typecheck、Studio 80/80、独立 Node 42/42、独立 Site 1/1、Route、build 和 4,978 个 contract 测试均通过；resource-heavy 仅有一个旧断言仍把 begin-tick 支撑采样位置等同于 post-move 主体位置，形成历史 NO-GO。当前测试已按明确的 Tick phase 合同修正并以 51/51 聚焦复验，因此只使 typecheck 与 root aggregate 失效；其余 exact-SHA 证据的输入与行为声明未改变。Browser、rendered visual 与 manual interaction 未运行，也不据此声明已覆盖；当前行为由真实 Havok 的 Route verifier 和定向 Runtime 回归约束。最终 typecheck、root aggregate 与只读设计复核由推送后的新 exact-SHA durable gate 负责。

## 2. 旧结论复验

- Validation V1/V2 并行公共合同：已复验并关闭。当前只有 schema-version-1 的公共 union、公共 parser/hash 入口；旧 V2 模块、导出和 consumer 已删除，结构门禁阻止恢复。
- Babylon Runtime 两套固定 Tick commit tail：已复验并关闭。Physics step、tick、visual、mounted projection、semantic facts 与 camera publication 只有一个 `commitFixedTick` owner；调用方只传闭合 camera mode。
- Runtime capture frame 与 Bundle frame 共用 identity：已复验并关闭。Runtime 仍独占 `worldkit-control-capture-frame`；Bundle writer 发布独立 `worldkit-control-capture-bundle-frame`。
- Native 同任务 self-repair 与外部 repair Attempt 描述冲突：已复验并关闭。同任务循环只修声明输出并重跑 checker；只有 Host 在冻结 Profile 允许时，以新 request/task identity 和前一可信证据创建外部 Attempt。
- 48 条登记 workspace private-source import 债务：已复验并关闭。消费方使用显式 package/testing subpath，相关包声明直接依赖，债务 ledger 为空。
- clean-break 未进入根测试：已复验并关闭。根 `pnpm test` 在 test census 前执行 current-only 结构门禁。
- 最新主线 Route 静态平台成功用例失败：已复现并关闭。回归起于旧 Motion Kernel 被当前 Character Movement owner 替代后，BodyPort 又从 post-integrate 瞬时 contact manifold 推导一次支撑状态；现在每 Tick 只发布 begin-tick `checkSupport()` 结果，post contacts 仅提供 ceiling 等碰撞事实，Surface identity 使用 `keepDistance + keepContactTolerance` 关联带。

## 3. Findings

没有开放的 P0/P1 finding。

审查过程中确认并立即关闭了三项 P1：Native 主规格仍把同任务 checker cycle 写成新 Attempt；Validation/Route 主规格仍称 WorldPackage 为 V2；最新主线 BodyPort 在 sole `checkSupport()` 之后又用 post-contact manifold 改写支撑状态，导致稳定平台 Route 用例失败。当前规格、AGENTS、Skill、实现与结构测试已统一；Runtime 回归已有失败基线、定向回归和完整 Route gate。历史实施计划和旧 review 保留当时名称，只作历史证据，不作为当前入口。

非阻断提醒：Playground production bundle 仍有既有的大 chunk warning；它不是本变更引入的 correctness failure，也不被本审查误报为已解决。

## 4. 维度覆盖表

| 维度 | 状态 | 结论 |
| --- | --- | --- |
| D1 定位与边界 | 已查 | Canonical 与 Native Lane 仍互斥；本变更没有扩大 Native Runtime 权限或产品能力声明。 |
| D2 Schema 与 AI-friendly | 已查 | Validation 以 `subjectKind` / `subject.kind` 闭合判别；一个概念一个当前名称，版本/Ref/单位字段未引入新方言。 |
| D3 承诺与事实 | 已查 | 活跃 Validation/Route/Native 规格已与当前代码、CLI、Skill 和测试对拍；历史计划明确不作当前权威。 |
| D4 单一权威状态 | 已查 | fixed Tick commit、ground support publication、capture protocol identity、Validation public parser/hash 与 Native Attempt identity 均为单一 owner。 |
| D5 工程质量 | 已查 | private sibling imports 清零，直接依赖闭合；provider 审计能力使用显式 `./audit` 子路径，根 API 保持最小；失败仍 fail-closed。 |
| D6 门禁与证据 | 已查 | latest-main 失败基线、focused reproducer、真实 Havok Route gate 与结构门禁已分层记录；最终 full gate/review 留给冻结 SHA，Browser/visual/manual 未越权宣称。 |

结论：该实现满足当前 unreleased clean-break、单一权威和长期可维护性原则，可进入 exact-SHA 独立 gate/review；最终合入仍以该冻结 SHA 的 durable evidence 为条件。
