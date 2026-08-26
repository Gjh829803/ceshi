# Signed Height Intent Compiler V0 remediation review

## 对象与结论

本报告处置 commit `a81134d` 对 terrain commit `d1d7f8b` 的对抗审查。原 NO-GO 对三个
required-constraint 缺口判断成立；修复前 focused reproducer 为 4 failed / 11 passed，修复后为
15 / 15 passed。当前工作树不再静默发布这三类失败。

该修复不改 Canonical Authoring Schema、Runtime、Babylon、Havok 或公开协议。PNG 仍只是
development-only macro-shape prior，最终 `heightSamplesMeters` 仍是唯一 Runtime 地形权威。

## Findings 处置

### P0：后写 Route 推翻先前已通过的 Route

- 处置：确认并修复。
- 修复：所有约束写入完成后，按稳定排序对每一条 required Route 重新采样完整宽度和三角面坡度。
  任意同优先级 Route 覆写导致的旧 Route 失效都会产生
  `TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED` blocking diagnostic。
- 回归：互相垂直的两条 `0°` Route 可稳定复现旧实现的静默覆盖；当前实现 fail closed。

### P0：亚网格 Spawn/Water 修改 0 个顶点却通过

- 处置：确认并修复。
- 修复：当 required Spawn polygon 或 Water boundary 不包含任何网格顶点时，Host 对所有与其相交
  的 Heightfield cell 做保守栅格化，并修改这些 cell 的四角顶点。若 protected region 与 Terrain
  grid 完全不相交，产生 `TERRAIN_INTENT_PROTECTED_REGION_OUTSIDE_TERRAIN` blocking diagnostic。
- 回归：`1m` cell 内的 `0.1m x 0.1m` Spawn 与半径 `0.05m` Water 均从零修改变为可在声明点
  采样到目标高度。

### P0：约束把最终高程写出世界范围

- 处置：确认并修复。
- 修复：constraint solver 现在必须接收 Authoring 的 `world.bounds.heightRangeMeters`；全部编辑后
  逐样本核对范围，越界产生 `TERRAIN_INTENT_HEIGHT_RANGE_EXCEEDED`。compiler 收到该 blocking
  diagnostic 后不返回 `compiledAuthoringSpec`，CLI 仍保持原子失败。
- 回归：`[-10m, 10m]` 世界中 `-9m` 水位与 `100m` 水深稳定失败；compiler integration 证明
  没有 output hash 或 compiled Authoring。

### P1：颜色 residual 没有冻结 admission 阈值

- 处置：保留为已声明的 V0 范围限制，不作为上述 hard-constraint 修复的 shipping blocker。
- 理由：`status: "passed"` 只表示 PNG transport、确定性 scalar projection 和声明的 required
  constraints 通过；它不表示 Image2 已正确理解宏观拓扑。Canyon README 已同时记录 residual、
  V5 语义 sign drift 和最终 SDK Runtime capture/人工选择，明确拒绝用 residual 统计冒充视觉语义
  判定。
- 后续：在 holdout 样本能支持稳定阈值前，不冻结任意颜色阈值。正式接受仍需要 Runtime opening
  capture 与 composition/visual inspection；只拿 compiler `passed` 不能宣布场景匹配成功。

## 真实 case 复验

修复后重新编译 `013-grand-canyon-courier`、`014-heroic-valley-overlook` 和
`015-alien-rift-plateau`。三者的 source/output hash 与既有接受结果一致、Diagnostics 为空；随后
各自的 `worldkit validate` 和 `worldkit layout validate` 均通过。说明 hardening 没有通过静默
clamp 或额外平滑改变已接受地形。

## 证据边界

- automated-contract：terrain focused suite 11 files / 52 tests passed（含 compiler integration）。
- rendered-visual：已有三张 Runtime capture；本次 compiled hash 未变，因此没有伪造新的视觉
  证据或重复截图来冒充新行为。
- manual-interaction：未运行。
- performance：未声明；图片仍由 SwiftShader capture，1km topology 仍是 NullEngine 证据。

最终 root test、typecheck、Builder bundle parity、build 和 diff closure 与 Large Heightfield V1
一起在第二个功能 commit 前执行并记录。
