# 既有设计问题收口审查

## 1. 审查元数据

- 模式：B 变更审查，并对 current-only、Native repair、固定 Tick 与包边界执行定向整仓复验。
- Diff 基线：`origin/main@d475c94411410105d81fdd5fd85d6aadab5e11f0`。
- 实现快照：`6df765f1f8570c3043da1c49ff1ed1e3c9c3986d`；其后的改动只修正本报告指出的权威规格文字并增加静态防漂移测试。
- Runtime 依赖：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`，以当前 lockfile 为准。本变更未改变引擎调用语义。
- 权威输入：`AGENTS.md`、`docs/18-refactor-progress-and-backlog.md`、Validation、Simulation Take、Native Lane 规格、本次实施计划、全维度审查协议和 Runtime 深审清单。

自动证据（均为 exit code 0，除明确说明外）：

- `pnpm typecheck`。
- `pnpm test:studio`：80/80。
- 独立 Node lane：42/42；补齐 Site 本地依赖后独立 Site lane：1/1。首次聚合运行只因 Site 目录未安装 `vinext` 而停止，不计为通过证据。
- Validation/Runtime/Capture 定向批次：265/265；Validation 修正后的定向批次：40/40。
- `pnpm verify:workspace-boundaries`：0 条登记债务，2,080 个公共符号。
- `pnpm verify:unreleased-clean-break`：0 个禁止命中。
- `pnpm verify:3c-migration`：11 条 ledger、39 个 live reference、10 条单一权威不变量。
- `pnpm check:native-block-builder-skill`：26/26。
- 最新主线 Native Package reproducer：12/12。
- `pnpm test:resource-heavy`：43 个文件、685/685。
- `pnpm build`、`git diff --check` 和 clean-worktree assertion。

Browser、rendered visual 与 manual interaction 未运行：本变更不改变可视行为、交互手感或引擎语义，不用较低层证据声明这些层已覆盖。最终完整 root aggregate 与独立审查由推送后 exact-SHA durable gate 负责。

## 2. 旧结论复验

- Validation V1/V2 并行公共合同：已复验并关闭。当前只有 schema-version-1 的公共 union、公共 parser/hash 入口；旧 V2 模块、导出和 consumer 已删除，结构门禁阻止恢复。
- Babylon Runtime 两套固定 Tick commit tail：已复验并关闭。Physics step、tick、visual、mounted projection、semantic facts 与 camera publication 只有一个 `commitFixedTick` owner；调用方只传闭合 camera mode。
- Runtime capture frame 与 Bundle frame 共用 identity：已复验并关闭。Runtime 仍独占 `worldkit-control-capture-frame`；Bundle writer 发布独立 `worldkit-control-capture-bundle-frame`。
- Native 同任务 self-repair 与外部 repair Attempt 描述冲突：已复验并关闭。同任务循环只修声明输出并重跑 checker；只有 Host 在冻结 Profile 允许时，以新 request/task identity 和前一可信证据创建外部 Attempt。
- 48 条登记 workspace private-source import 债务：已复验并关闭。消费方使用显式 package/testing subpath，相关包声明直接依赖，债务 ledger 为空。
- clean-break 未进入根测试：已复验并关闭。根 `pnpm test` 在 test census 前执行 current-only 结构门禁。

## 3. Findings

没有开放的 P0/P1 finding。

审查过程中确认并立即关闭了两项 P1 文档权威漂移：Native 主规格仍把同任务 checker cycle 写成新 Attempt，Validation/Route 主规格仍称 WorldPackage 为 V2。当前规格、AGENTS、Skill、实现与结构测试已统一；历史实施计划和旧 review 保留当时名称，只作历史证据，不作为当前入口。

非阻断提醒：Playground production bundle 仍有既有的大 chunk warning；它不是本变更引入的 correctness failure，也不被本审查误报为已解决。

## 4. 维度覆盖表

| 维度 | 状态 | 结论 |
| --- | --- | --- |
| D1 定位与边界 | 已查 | Canonical 与 Native Lane 仍互斥；本变更没有扩大 Native Runtime 权限或产品能力声明。 |
| D2 Schema 与 AI-friendly | 已查 | Validation 以 `subjectKind` / `subject.kind` 闭合判别；一个概念一个当前名称，版本/Ref/单位字段未引入新方言。 |
| D3 承诺与事实 | 已查 | 活跃 Validation/Route/Native 规格已与当前代码、CLI、Skill 和测试对拍；历史计划明确不作当前权威。 |
| D4 单一权威状态 | 已查 | fixed Tick commit、capture protocol identity、Validation public parser/hash 与 Native Attempt identity 均为单一 owner。 |
| D5 工程质量 | 已查 | private sibling imports 清零，直接依赖闭合；失败仍 fail-closed，排序/Hash/引擎算法未改变。 |
| D6 门禁与证据 | 已查 | focused reproducer、结构门禁、typecheck、resource-heavy 和 build 分层记录；Browser/visual/manual 未越权宣称。 |

结论：该实现满足当前 unreleased clean-break、单一权威和长期可维护性原则，可进入 exact-SHA 独立 gate/review；最终合入仍以该冻结 SHA 的 durable evidence 为条件。
