# 上下文驱动 Gameplay 与 Camera 组合设计审查

## 1. 审查元数据

- 模式：A（设计规格审查），并按 Camera 主题补充 Runtime authority/lifecycle 检查。
- 对象：`docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md`。
- 基线：`origin/main@dfe0d35d40af64a03ce2f1882b8cbe8279a0ee5e`。
- 规格状态：Reviewed / Approved for Implementation Planning；GCC-0/GCC-0A 尚未冻结，能力尚未实施。
- 依赖版本：Babylon.js `9.21.2`、Havok `1.3.14`（来自锁定依赖）；本次没有用未核对的引擎实现细节作为结论。
- 审查者：主 Agent 自审。用户明确取消 Cursor 独立复核，因此没有把未返回的 Cursor 会话当作证据。
- 验证：
  - `pnpm typecheck`：exit 0。
  - `pnpm build`：exit 0；保留既有大 Chunk warning，本次文档变更未改变 bundle。
  - `pnpm test`：首次在全并行机器负载下 exit 1，1577 项中 1575 通过，两个真实 Route/Havok 集成项超时。
  - `pnpm exec vitest run scripts/worldkit-route-run.integration.test.ts scripts/lib/route-validation-runner.test.ts --no-file-parallelism`：exit 0，2 files / 13 tests；证明前述失败为并发时限而非行为失败。
  - `git diff --check`：exit 0。

## 2. 旧结论复验

- 已复验：CameraDirector 仍是当前最终 View Owner；规格继续禁止 Subject、Action、Animation、Adapter 和场景代码建立第二 Camera Owner。
- 已复验：当前 Camera Profile/Modifier/Context 资源存在，但 `mountedOn/equippedAt/possessedBy` 的通用 Relationship Runtime 与两个代表性组合尚未交付；规格和 README/Backlog 均按“未来能力”表述。
- 已复验：Route R1b Static Platform 已在 `main:dfe0d35` 完成；规格不再把它写成未来前置。
- 已复验：PR #19 仍未合入；规格将其融合设计固定到审查时 commit，并要求获批上游先独立合入，不把分支草案冒充 main 合同。

## 3. Findings

无开放 P0/P1/P2 finding。审查过程中确认并在合入前修正三项文档问题：

1. R1b 基线状态已从“未来完成”更新为 `main:dfe0d35` 已完成。
2. #19 被明确标为未合入上游候选，并补上独立合入与合同修订门禁。
3. Camera Context 的输入来源收紧为 fixed-tick 已提交语义；原始设备输入、render-frame latch 和未提交 command 不能成为旁路权威。

设计结论：GO。Kit 只做编译期 Authoring Sugar，Relationship/Action/Medium 保持各自权威，Camera Context 只做只读投影，CameraDirector 独占 View；公共命名采用单一 `cameraViewPreference` clean break，符合 AI-friendly 与确定性要求。

## 4. 维度覆盖表

| 维度 | 状态 | 证据摘要 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | 御剑、滑翔、骑乘、装备均明确为未来能力和 Capability Gap，没有改写当前 outdoor heightfield 生产边界。 |
| D2 Schema 与 AI-friendly | 已查 | 角色化 Relationship 端点、`...Ref`/`...EntityId`、带单位字段、关闭 Union 和单一 Preference 方言已闭合。 |
| D3 承诺与事实对拍 | 已查 | 当前 Camera 基线、R1b 完成状态、#19 未合入状态、README/Backlog 声明均已对拍。 |
| D4 单一权威状态 | 已查（Camera 专项） | Relationship/Action/Medium/Camera/View Owner 分离；Projector 只读 committed epoch；禁止 Render/Adapter 旁路。 |
| D5 工程质量与可维护性 | 不适用 | 本次无源码实现；实施工作图已定义独占所有权、依赖、集成点和验证证据。 |
| D6 门禁与证据分层 | 已查 | Contract、Runtime、Golden Fixture 分层；automated、numeric、rendered、manual 证据不能互相替代。 |
