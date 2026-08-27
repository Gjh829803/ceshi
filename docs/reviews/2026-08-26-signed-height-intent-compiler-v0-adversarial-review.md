# Signed Height Intent Compiler V0 对抗审查

> **后续状态（2026-08-27）：本报告是历史 NO-GO，不是当前树结论。** 三个 required-constraint
> P0 已在 `19c5636` 修复；颜色 residual P1 随
> `terrain-height-intent-compiler@2` 在 compiler API 与稳定 CLI 中失败关闭。处置与当前证据见
> [`2026-08-26-signed-height-intent-compiler-v0-remediation-review.md`](2026-08-26-signed-height-intent-compiler-v0-remediation-review.md)。
> 下文的 `NO-GO` 只适用于审查对象 `d1d7f8b`，不得作为最新 `main` 的发布结论。

独立通道审查。不复述作者自审结论。作者审查声称「无 P0/P1/P2」；本审查回
`d1d7f8b` 源码、实施计划与 Codex 复现后，**不接受该结论**。当前结论：**NO-GO**。

本文只记录审查。不修改编译器、不更新金标、不把工作区里后续未提交改动算进被审树。

## 1. 审查元数据

| 项 | 值 |
| --- | --- |
| 模式 | B（变更审查）。Host 工具不改 Runtime / 物理 / 输入 / 相机，不完整执行 runtime-deep-review-checklist |
| 对象 | `codex/terrain-generation` 相对 `main` 的 Signed Height Intent Compiler V0 |
| 审查 HEAD | `d1d7f8b1b1c96718415c274d7bfe37635b19ea6c`（`feat: compile generated terrain height intent`） |
| diff 基线 | `main...HEAD`；44 files，`+4877 / -147` |
| 上位规格 | `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md` |
| 实施计划 | `docs/superpowers/plans/2026-08-26-signed-height-intent-compiler-v0.md` |
| 被挑战的旧审查 | `docs/reviews/2026-08-26-signed-height-intent-compiler-v0-review.md` |
| 通道 | openai-codex 插件 `adversarial-review --wait --scope branch`；Cursor 通道对照 HEAD blob 做对抗复核 |
| Codex thread | `01a03dda-adad-7e61-a5bd-dbcf43d06710`；companion exit `0`；耗时 `886930ms` |
| 运行环境 | 本会话 Node `v22.21.0`。lockfile：`sharp@0.35.4`、`@babylonjs/core@9.21.2`、`@babylonjs/havok@1.3.14`。本审查不断言引擎语义 |
| 改动边界 | 开发期 Host 工具 `scripts/terrain-height-intent/`、Planner 参考资料、测试与实验制品。无 Canonical Schema / Browser Protocol / Runtime API / Babylon/Havok 适配层变更 |

审查时工作树干净。报告落盘时工作树已有后续未提交改动（large-heightfield / quantize 等）。那些文件**不在本次对象内**；行号一律锚定 `d1d7f8b`。

| 命令或检查 | Exit | 结论 |
| --- | ---: | --- |
| `git rev-parse HEAD` | 0 | SHA 与上表一致 |
| `git show HEAD:scripts/terrain-height-intent/apply-terrain-constraints.ts` 与 `compile-height-intent.ts` | 0 | 下文引用的行号已回 HEAD blob 核对 |
| Codex `adversarial-review --wait --scope branch` | 0 | verdict `needs-attention` / No-ship |
| Codex `TSX_DISABLE_CACHE=1 node --import tsx` 探针（交叉 route、亚格子 spawn、越界水深） | 0 | 三条 high 均复现；数字见 Findings |
| Codex `pnpm exec vitest run scripts/terrain-height-intent/apply-terrain-constraints.test.ts` 等 | 1 | 未定位根因，**不作为 finding**。本会话未在脏工作树上重跑 |
| `pnpm typecheck` / `pnpm test` / `pnpm worldkit validate` / capture | 未跑 | 对抗审查只读；脏工作树不能拿来证明 `d1d7f8b` |
| 独立 Cursor project-local review | 不可用 | 旧审查已记两次无 verdict。Codex 再调 `agent` 以 exit `139` 失败。本报告替代该缺失通道 |

## 2. 旧结论复验

引用旧审查前均回 `d1d7f8b` 复验。

| 旧结论 | 出处 | 本审查 |
| --- | --- | --- |
| 无开放 P0/P1/P2 | 作者审查 §Findings | **已失效**。Host solver 可把 required 约束静默标成通过，并把越界高度送进 `heightSamplesMeters` |
| 独立 Cursor review 无 verdict，不能当通过证据 | 作者审查 §元数据 | **成立**。本通道补上独立 verdict：NO-GO |
| 通用 Terrain Mask / P1.1 未完成；本变更不是 Canonical Source | 作者审查 §旧结论复验；`docs/18` | **成立**。对象仍是 development-only Host 工具 |
| 生成图是不可信 macro-shape prior；metric heightfield 与约束执行权在 trusted Host | 作者审查 §旧结论复验；计划 Global Constraints | **方向成立，合同未闭合**。Host 有投影、预滤波和约束编辑，但 required 约束与世界高度范围缺少失败闭合 |
| Runtime 单一权威仍成立；未改 Babylon/Havok | 作者审查 §旧结论复验 | **成立**。本 diff 没有新增 grounded / medium / facing / camera / Tick / resource lifetime 推导路径 |
| 色带 residual 只有报告统计，尚未冻结 admission 阈值；文档未把它写成已有拒绝门禁 | 作者审查 §范围限制 | **部分成立**。文档诚实，但编译器仍对任意可解码不透明 PNG 返回 `status: "passed"`，并把结果写成权威 `heightSamplesMeters`。见 P1 |
| V0 不推断 Planner 未声明的地貌语义；V4 才是接受的实验输入 | 作者审查 §范围限制 | **成立**。不升格为 finding |
| 自动低通固定为 scalar-space separable box | 作者审查 §范围限制 | **成立**。不升格为 finding |

## 3. Findings

### [P0] [D4 D5] 后写 route 能静默推翻已通过的 route 硬门禁

- 证据（`static-read` + Codex `automated-contract`）：`611:644:scripts/terrain-height-intent/apply-terrain-constraints.ts`
  lock 判断是 `lockPriorities[index] < priority` 才跳过，同优先级 route 可互相覆写。每条 route 在自己的循环末尾调用 `validateRouteSlope`，全部编辑结束后没有再验。计划 Task 4 Step 4 只要求「Skip samples already locked by a **higher-priority** constraint」，没有联合求解或最终全量复验。Codex 交叉 route 探针：`diagnostics` 为空，第一条 `0` 度 route 最终测到 `84.29` 度。
- 期望：required `within-slope-limit` / `route-slope` 是硬门禁。重叠不相容必须失败，或联合求解后对**最终** raster 复验每一条 required route。
- 影响：交叉或后写 route 时，编译器可发布 `status: "passed"`，而先前已声明安全的走廊在 Runtime 里过陡。这是静默正确性错误，不是缺测试那么简单。
- 建议：重叠 route 联合求解，或不相容就 blocking；全部约束写完后再验每条 required route。补交叉 route 回归。
- 复核：已被 Cursor 通道对照 HEAD blob 确认机制；`84.29` 度数字来自 Codex TSX 探针，本会话未重跑。

### [P0] [D5 D6] 受保护约束可以改到 0 个顶点却仍通过

- 证据（`static-read` + Codex `automated-contract`）：`546:560:scripts/terrain-height-intent/apply-terrain-constraints.ts`
  `flatten-region`（spawn）只对多边形**包含的 grid 顶点**赋值，没有在声明的 spawn 点做三角面后置检查，也没有把 `changedSampleCount === 0` 升为 blocking。`water-basin` 同样只写边界内顶点。Codex 探针：1m 网格上偏网格 `0.2m` 的 spawn 多边形 → `changedSampleCount=0`、无 diagnostic、地形高度 `0`，声明目标 `5m`。
- 期望：计划把 Spawn / Water 当成 protected hard constraint，「never blurred away」。零效果的 required 约束必须 blocking。最终三角面必须在 spawn、water、support 查询点可证。
- 影响：亚格子或落在单元格内部的 spawn / water 区域可被编译器忽略，Host 仍发布不受支持的出生点或水体。
- 建议：按 triangle/cell 相交做保守栅格化；在查询点验最终表面；零效果 required 约束发 blocking diagnostic。
- 复核：已被 Cursor 通道对照 HEAD blob 确认机制；`0.2m` / `5m` 数字来自 Codex TSX 探针，本会话未重跑。

### [P0] [D4 D5] 约束编辑可以逃出声明的世界高度范围并进入 Runtime 输入

- 证据（`static-read` + Codex `automated-contract`）：`515:534:scripts/terrain-height-intent/apply-terrain-constraints.ts`
  `applyTerrainConstraintsV0` 不接收 `heightRangeMeters`。water 直接写 `waterLevelMeters - depthMeters`，只拒绝非有限值。映射阶段把 signed ratio 夹在 `[min, datum, max]` 内，约束阶段可以把采样打出该区间。计划 Task 4 Step 1 要求覆盖「impossible height-range edits」，solver 接口却没有权威范围参数。Codex 探针：概念范围 `[-10, 10]`、水位 `-9`、深度 `100` → `-109m`，无 diagnostic。Codex 对照 Authoring/Runtime admission：查有限性与采样数，不查该世界范围不变量。
- 期望：`world.bounds.heightRangeMeters` 是 Authoring 权威范围。约束目标或最终采样越界必须拒绝，不能静默写出 Runtime 可消费的 `heightSamplesMeters`。
- 影响：合法有限的 Authoring 输入即可生成极端 heightfield。下游若只查 finite / 长度，异常碰撞体可以进 Runtime。
- 建议：把权威高度范围传入 solver；越界即 blocking；补计划承诺的 impossible-height-range 测试。`status: "passed"` 前应对产物跑 Authoring normalize / layout。
- 复核：已被 Cursor 通道对照 HEAD blob 确认 API 缺口；`-109m` 数字来自 Codex TSX 探针，本会话未重跑。Admission「不查世界范围」是 Codex 对 Authoring/Runtime 的对照，标为 Codex 推断，未在本会话重读全部 admission 实现。

### [P1] [D3 D6] 不可信颜色没有 admission 门禁，却可以 `passed`

- 证据（`static-read`）：`78:88:scripts/terrain-height-intent/compile-height-intent.ts`
  每个 RGB 投影到最近色带；`summarizeTerrainIntentProjectionV0` 只写 residual 统计。`hasBlockingDiagnostic` 在投影之后只看 Authoring 派生诊断，不看 residual / 符号歧义 / 宏观拓扑。任意可解码、无 alpha、方形不透明 PNG 都能继续走进约束和 `status: "passed"`。
- 期望：计划 Global Constraints：生成 PNG 是 untrusted macro-shape prior，不得进入 Runtime。Host 编译必须能拒绝不安全图，而不是只记录统计。作者审查已承认阈值未冻，但把「无 P0/P1/P2」和「文档没说错」当成闭合，忽略了 `passed` 本身就是能力声明。
- 影响：实验或 Planner 误投的图会被写成权威 `heightSamplesMeters`。V0 可以继续 probe-only，但不能把无门禁的 `passed` 当成已校验。
- 建议：冻结带版本的 residual / sign / topology 阈值，发带空间位置的 blocking diagnostic，失败就不产出 compiled spec。门禁和 holdout 齐之前，CLI 明确保持 probe-only。
- 复核：已被 Cursor 通道对照 HEAD blob 确认「统计不阻断」。未重跑「无关方图也能 passed」的端到端探针。

## 4. 维度覆盖表

| 维度 | 状态 | 当前树证据 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查（模式 B 补充项） | 仍是 development-only Host 工具；不宣称 interiors / caves / streaming / 生产能力。未改冻结 Canonical Schema |
| D2 Schema 与 AI-friendly | 已查 | 无公共 Schema 变化；内部字段带 `Meters` / `Pixels` / `XZ`；输出仍是唯一 `heightSamplesMeters`。本审查无新的命名分裂 |
| D3 承诺与事实对拍 | 已查 | 作者审查「无 P0/P1/P2」与 focused tests 全绿不能覆盖交叉 route、亚格子保护和越界水深。`passed` 与「不可信图已校验」不对拍 |
| D4 单一权威状态 | 已查 | Runtime 权威未裂。Host 侧 `heightRangeMeters` 与 required route/spawn 约束不是最终权威：solver 可绕过它们仍标通过 |
| D5 工程质量与可维护性 | 已查 | 确定性 hash / 预滤波方向仍在。对抗面缺口：交叉 route、零效果 required 约束、越界高度。计划写了 impossible height-range，实现未闭合 |
| D6 门禁与证据分层 | 已查 | 旧审查的 focused vitest / typecheck / worldkit / SwiftShader capture 只证明 happy-path 实验切片，不能否决本报告的静默失败。独立 Cursor review 仍无 verdict。本审查未重跑全量 `pnpm test` |

## 5. 处置

当前分支在 `d1d7f8b` 上 **NO-GO**。不要把 Signed Height Intent Compiler V0 当成可发布 Host 能力，也不要用作者审查抵消本报告。

优先闭合三条 P0 回归：

1. 交叉 route 覆写后必须失败或联合求解，并复验最终 raster。
2. 亚格子 / 零顶点的 required spawn、water、support 必须 blocking，并在查询点验表面。
3. 约束目标与最终采样必须落在 `heightRangeMeters` 内。

P1 的色带 admission 可以仍留在 V0 范围讨论里，但在阈值冻结前不得把 `passed` 解释成「图已校验」。
