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

本文件在提交时记录意图。exact SHA、RED/GREEN 命令输出由后续 focused 门禁回填。要求的命令仅是
BWB-5 focused tests、`pnpm test:census` 与 `git diff --check`，不跑全仓库套件。
