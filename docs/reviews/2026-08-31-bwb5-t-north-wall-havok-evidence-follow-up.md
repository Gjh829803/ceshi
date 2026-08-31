# BWB-5 T-shaped north-wall Havok evidence follow-up

- 日期：2026-08-31
- 模式：Mode B 窄变更审查 + runtime-deep-review-checklist
- 基线：`main@bbe4436f4eb4e64a88344bcb1689a1b69a207854`
- 范围：已接受的 BWB-5 证据补强。T 字 Case 已有西墙真实 Havok 阻挡，但未从有效走廊显式证明北墙。
- 明确非范围：不改 Runtime / Havok / Camera / Input 权威；不扩 Corpus ID、seed 或 Layout；不宣称
  formal Capture / Route、Room/Nav、跨实体 rebind 或 Browser FeelReview。

## 1. 缺口

`t-shaped-traversal` 的冻结 Layout 已包含 `t-north-wall` / `collider-t-north-wall`（`not-traversable`）。
既有 resource-heavy 测试只沿脊柱走到路口后证明东臂可通过、西墙不可通过。北墙若缺失或被穿越，该测试
仍可通过。

## 2. 补强

新增一条行为级 Havok 回归：

1. 从 spawn 沿有效脊柱走廊 `move-forward` 接近，先证明人物仍在走廊内、尚未到达北墙近面。
2. 继续沿同一走廊前进。
3. 把停止位置绑定到冻结 Contribution `collider-t-north-wall` 的近面 + controlled Subject
   `collider.radiusMeters`，并要求 `movementMedium === "ground"`。
4. Contribution 缺失、不是 `not-traversable`、人物未离开接近点、穿过近面误差带或离地，均失败。

未改生产 Runtime / Profile materializer。产品树在新 reproducer 下仍成立，因此本 follow-up 只改
tests / docs truth。

## 3. 权威

- Ground support / 阻挡仍只来自已安装 Havok character support 与冻结 Static Collider Contribution。
- 测试只消费 `runFixedInput`、`reset` 与 `bindRuntimeTestPossession`；不改 Camera / Input / Tick owner。
- Corpus 仍是关闭的 11 个 Case；本切片不新增 Case ID。

## 4. 门禁

实现提交：`b0c79bd80c1e008eccccfd9cbf7435e12b4a3437`。证据回填提交：
`9b314459e5c70aeacd30bfcfae57cfcf83b68005`。基线
`main@bbe4436f4eb4e64a88344bcb1689a1b69a207854`。未改生产 Runtime / Havok / Camera / Input。

RED（仅本地、未提交的 Layout 变异；证明新断言会失败）：

1. 删除 `t-north-wall` / `t-north-foundation` 后，
   `pnpm exec vitest run --config vitest.resource-heavy.config.ts scripts/verification/bwb5-block-reconstruction-corpus.test.ts -t "blocks the t-shaped north wall"`
   以 `BWB-5 verified Package is missing Collider 'collider-t-north-wall'` 失败。
2. 把同一 Collider 挪到走廊外（`[2, 0.5, -3]`）后，同一命令以
   `expected -5.239844357803556 to be greater than or equal to -2.2` 失败：人物穿过意图近面
   （`centerLimit = -2.2` = 近面 `-2.5` + capsule `0.3`）。

GREEN（恢复冻结 Layout 后）：

| 命令 | 结果 |
|---|---|
| 同上 isolated north-wall Havok | 1 passed / 5 skipped |
| `pnpm exec vitest run --config vitest.contract.config.ts packages/native-babylon-block-profile/src/reconstruction-corpus.test.ts` | 4 passed |
| `pnpm exec vitest run --config vitest.resource-heavy.config.ts scripts/verification/bwb5-block-reconstruction-corpus.test.ts` | 6 passed |
| `pnpm test:census` | 379 tests, 340 contract, 39 resource-heavy |
| `git diff --check` 对 `bbe4436f..HEAD` | clean |

未跑全仓库套件。Census 文件数未因本切片增加。

## 5. 接受债务

无新增债务。既有非阻塞债务保持：`BWB5-R1`（单 `player` Subject）、`BWB5-R2`（无 Browser
FeelReview）、`BWB5-P2-2`（`cleanup-throw-partial` 的真正 partial/throwing cleanup 由 Session
测试持有）。
