# Signed Height Intent Compiler V0 change review

> Promotion note (2026-08-26): after the Development Gate passed, the implementation
> moved to `packages/terrain-compiler/`. Historical `scripts/terrain-height-intent/`
> paths below identify the reviewed pre-promotion tree.

> **后续状态：** commit `a81134d` 的对抗审查推翻了本报告最初的“无 P0”结论。三个已确认
> hard-constraint 缺口及其修复证据见
> `docs/reviews/2026-08-26-signed-height-intent-compiler-v0-remediation-review.md`。本报告保留为
> `d1d7f8b` 提交时的历史审查，不能单独作为当前树的通过证据。

## 审查元数据

- 模式：B（变更审查）。
- 对象：`codex/terrain-generation` 工作树中 Signed Height Intent Compiler V0 的未提交变更。
- diff 基线 / HEAD：`1a3d9ea5e5262732ef42032c75aa6ed7f4c0fb99`。
- 上位规格：
  - `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md`
  - `docs/superpowers/plans/2026-08-26-signed-height-intent-compiler-v0.md`
- 运行环境：Node `v23.11.0`；`sharp@0.35.4`；`@babylonjs/core@9.21.2`；
  `@babylonjs/havok@1.3.14`。
- 改动边界：开发期 trusted Host 工具、Planner Prompt/参考资料、测试与实验制品；没有新增
  Canonical Authoring Schema、Browser Protocol、Runtime API 或 Babylon/Havok 适配层。

最终产品树上的验证证据：

| 证据层级 | 命令或制品 | 结果 |
| --- | --- | --- |
| automated-contract | `pnpm exec vitest run scripts/terrain-height-intent/*.test.ts scripts/lib/test-gate-census.test.ts scripts/planner-skill.test.ts` | exit `0`；12 files / 56 tests passed |
| automated-contract | `pnpm check:agent-self-check` | exit `0` |
| automated-contract | `pnpm typecheck` | exit `0` |
| automated-contract | `pnpm worldkit validate artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.compiled.json --json` | exit `0`；ExecutionPlan 与 Normalized IR 均生成稳定 hash |
| automated-contract | `pnpm worldkit layout validate artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.compiled.json --json` | exit `0`；5 constraints / 6 entities |
| rendered-visual | `artifacts/terrain-experiments/013-grand-canyon-courier/runtime-opening-v1-smoothed.png` 与对应 snapshot | capture passed；人工检查可见负向出生盆地、峡谷两侧与中央上坡路线 |
| static-read | `git diff --check` | exit `0` |

Runtime capture 使用 SwiftShader software renderer。该证据只支持静态 whitebox 可见结果，
不支持渲染性能结论。没有运行 manual interaction，因此本审查不声明操控手感或完整游玩验收。
没有修改 shipped Runtime 或生产 bundle 输入，未重复运行 root `pnpm test`、`pnpm build`、
Studio 或 independent lane；本次新增的 10 个 Vitest 文件均已登记进 test-gate census，相关
source contract 由上表的 focused lane、census 与 typecheck 覆盖。

独立 Cursor review 共启动两次。第一次在后续 scalar-prefilter 改动后失效；第二次针对最终树
持续运行超过 12 分钟仍没有输出 report 或 verdict，随后终止。该步骤结论为“无独立 verdict”，
不能作为通过证据。

## 旧结论复验

- `docs/18-refactor-progress-and-backlog.md` 中“通用 Terrain Mask / P1.1 尚未完成”的边界仍成立。
  本变更只编译 development-only signed height-intent PNG，并没有把通用图像地形协议发布为
  Canonical Source 或生产能力。
- 既有地形设计把生成图视为不可信 macro-shape prior、把 metric heightfield 和约束执行权留给
  trusted Host。已复验：当前链路在 scalar projection 后确定性预滤波/重采样，并从现有
  AuthoringSpec 派生 Water、Spawn、Landmark support 与 Route 约束；Runtime 只消费最终既有的
  `heightSamplesMeters`。
- 既有 Runtime 单一权威结论仍成立。已复验：本变更没有新增 grounded、movement medium、
  facing、camera、fixed-step time 或 resource lifetime 推导路径，也没有修改 Babylon/Havok 代码。

## Findings

本次主审查没有发现 P0、P1 或 P2 finding。

以下为已知范围限制，不作为已交付能力：

- 自动低通目前固定为 scalar-space separable box，降采样半径由端点对齐比例确定；V0 尚未基于
  多样本冻结更复杂重建滤波器或质量阈值。
- V5 负样本可被 protected constraints 修到编译通过，但其未受约束区域仍存在语义符号漂移。
  V0 不推断 Planner 未声明的地貌语义，因此 V4 才是当前接受的实验输入。
- 色带 residual 只有报告统计，尚未冻结 admission 阈值；文档没有把它误述为已具备的拒绝门禁。
- 该工具仍位于 `scripts/terrain-height-intent/`，在形成第二种正式消费者前不提升为独立 package。

## 维度覆盖表

| 维度 | 状态 | 当前树证据 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查（模式 B 补充项） | development-only Host 边界明确；不改冻结 plan/lock，不宣称 interiors、caves、streaming 等能力 |
| D2 Schema 与 AI-friendly | 已查 | 无公共 Schema 变化；内部数值字段带 `Meters`、`Pixels`、`XY`、`XZ`；输出复用唯一 `heightSamplesMeters` 方言 |
| D3 承诺与事实对拍 | 已查 | Prompt、设计、计划、README 与实际编译/Runtime evidence 对拍；V4/V5 结论和未支持阈值均显式记录 |
| D4 单一权威状态 | 已查 | 图片只提供 scalar prior；Authoring constraints 决定 protected regions；既有 height samples 是下游唯一地形高度输入 |
| D5 工程质量与可维护性 | 已查 | pinned direct dependency、确定性 replay/hash、非方形/弯路线/边缘三角/rollback 等对抗回归均覆盖 |
| D6 门禁与证据分层 | 已查 | automated、rendered、manual 三层分开；SwiftShader、未跑 manual interaction 与 Cursor 无 verdict 均如实披露 |
