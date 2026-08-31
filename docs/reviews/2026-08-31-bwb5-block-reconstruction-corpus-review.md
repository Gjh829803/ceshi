# BWB-5 Block Reconstruction Corpus 实现审查

- 日期：2026-08-31
- 模式：Mode B 变更审查 + runtime-deep-review-checklist
- 基线：`origin/main@bcd2beea736ab68199df04c2ed937d63ea389f4a`
- P1/P2 traversal-evidence 修复候选：`cdcca43702cce025f5782a231d019e96e24312b4`
- 范围：BWB5-10 至 BWB5-70；关闭山地 / T 字 / 台阶 / 建筑 / 有限室内 / 负向 Corpus
- 当前裁决：**GO（开放 P0/P1 = 0）**。候选 `cdcca43702cce025f5782a231d019e96e24312b4`
  已通过 exact-SHA 门禁与独立 Mode B + runtime-deep Review。旧候选
  `7b77069f114bb3ae72ae184fb7c60798fe49b301` 的条件 GO 已失效；BNA-6 / BNA-7 /
  WRC-SR-1 / BWB-6 保持开放。

## 1. 候选结论与明确非声明

本候选冻结一份关闭的 Block Reconstruction Corpus。每个 Case 使用稳定 ID、确定性 seed，以及同一个
Build-Epoch Session / Checked Layout / `finalize()`。该 Layout 同时产生 Babylon Native block visual、
`BabylonNativeBlockAuthoringCaptureV1`（`scope = build-epoch-local`）、Static Collider Contribution、
关闭 `traversalBinding`、BNA-4 `worldkit.native-collider.*` overlay、Spawn Support 和真实 Havok
人物通过性。负向 Case fail-closed，不进入可玩 Runtime。

本审查不宣称：

- BNA-6 AI 生成/修复成功率或 Golden evaluation harness
- BNA-7 formal Capture / Route Report / Surface Identity
- 完整 Room/Visibility、多层 Navigation、洞穴、桥下双层、NPC Nav、`goTo`
- BWB-6 Thin Instance / Chunk / Collider coalescing
- 第三条 Scene Source，或 Native 专用 Runtime / Havok / Camera / Input / Tick

有限室内只证明白模视觉、单层静态支撑和人物通过性。

## 2. 权威与合同闭合

### D1 定位与边界

- Corpus 只存在于 `@whitebox-world/native-babylon-block-profile`。它调用现有 Session，不创建新的
  Scene Source、Compiler、Manifest 或 Preset DSL。
- 生产源禁止 `createMountain` / `createBuilding` / `createLevel`；公开入口是
  `inspect` / `materialize` / evidence index。
- Layout 只在 Build Epoch 内存在。Runtime Module factory 只在 finalize 后登记 Spawn；Runtime 读取的是
  冻结 Contribution，不是 Layout。
- `unsupported-spawn` 在 Layout 层可以 finalize，但 BNA-4/Runtime 以
  `WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING` fail-closed。这是正确的权威分层，不是旁路。

### D2 Schema 与 AI 友好性

- Case ID 是关闭数组 `BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1`，无别名。
- Evidence index 复用现有 check / authoring-capture / collider inventory 类型；布尔声明使用 `is...`。
- 未新增 Capture、Route Report、Surface Identity 或 Validation DTO。
- 单位进入字段名：`positionMetersXYZ`、`facingRadians`、`fovDegrees`、`centerMetersXYZ`。

### D3 承诺与事实

- 五类正向 Case 均经同一 admit → finalize → capture → collider inventory 合同测试。
- `ordinary-and-blocked-steps` 复用 BWB-4 六块几何，Havok 再次证明 0.25m 可通过、0.5m 不可通过、
  riser/tread 位置带、blocker 近面 + capsule radius、ledge `air` 与下落高度、reset hash 一致、
  dispose 释放 Scene/Engine/Collider Mesh。
- mountain / T / building / limited-interior 有预期通路与阻挡的真实 Havok ticks。阻挡证据绑定
  明确的 `not-traversable` Collider Contribution 近面、controlled Subject capsule radius 和
  `movementMedium === "ground"`；断言先证明人物离开 spawn/approach，再证明中心停在近面误差带。
  mountain 还证明人物在 `m-overlook` 支撑面落脚后越过由 Contribution 导出的边缘、下落并进入
  `movementMedium === "air"`。
- 负向 Corpus 覆盖 overlap、budget、invalid binding、unsupported spawn、disconnected route、
  overlap finalize rejection 后的未 finalized Mesh cleanup。通用 Session 的 partial-construction /
  throwing-cleanup 对抗由 Session 测试持有，不由本 Corpus 重复声明。
- 文档与代码都写明 formal Capture/Route = false。未把 AuthoringCapture 写成 BNA-7 Receipt。

### D4 单一权威

- Collider / Traversal 仍只来自显式 selection + BNA-4 admission。Corpus 不从 Mesh/tag/name 反扫。
- paletteRole 不暗示可走性；`notTraversableBlockIds` 是显式名单。
- Ground support 仍是 Runtime/Havok `checkSupport()` 路径。unsupported-spawn 由 Runtime 拒绝，
  没有新增 ray/AABB owner。
- 跨 Session rebind 证据：先 dispose `mountain-cliff` Runtime，再创建 `building-exterior`；
  旧 Scene/Engine/Collider Mesh 已释放，第二 Session 不复用第一 Session 的 collider 名。
  当前 WorldPackage fixture 仍只有 `player` Subject，因此这是跨 Session / 跨 Layout 的 owner 清理，
  不是第二产品 Subject Definition。

### D5 工程质量

- `===` / `!==`；`isNil` / `isEmpty`。
- 新测试已登记 `scripts/lib/test-gate-manifest.ts`：contract + resource-heavy
  `native-havok-or-recast`。
- 未修改 PHO-6 `report.ts` / `registry.ts` / `cli.ts` / `evidence-store.ts` 或 PHO 配置。
- package-boundary 精确导出集合已更新；testing 仍只导出两个 fixture factory。
- 未扩到 Thin Instance / Chunk / coalescing。

### D6 证据分层

| 层 | 命令 / 结果 |
|---|---|
| RED | corpus contract 因缺少 public API 失败（`undefined` / not a function） |
| GREEN contract | `packages/native-babylon-block-profile` 12 files / 67 tests passed |
| GREEN Havok | `scripts/verification/bwb5-block-reconstruction-corpus.test.ts` 5/5 passed |
| typecheck | `pnpm typecheck` exit 0 |
| census | `pnpm test:census` → 374 tests, 335 contract, 39 resource-heavy |
| playground build | `pnpm --filter @whitebox-world/playground build` exit 0 |
| 人工交互 | 未新增 catalog/native playground 场景；Corpus 证据是 fixture/Havok，不是浏览器 FeelReview |

30/60/120-like cadence：三个 Runtime 各推进 60 个固定 Tick，并分别以每两 Tick 一帧、每 Tick
一帧、每 Tick 两帧调用 `renderFrame()`；`snapshot.tick === 60` 且 subject hash 相同。

## 3. Runtime-deep checklist

- Ground support owner：Havok character support / Runtime spawn-surface admission。Corpus 不另建
  sampler。
- Camera / Input / Tick owner：未改 `runtime-babylon` 生产代码。测试只消费 `reset()` +
  `bindRuntimeTestPossession`。
- 对抗：overlap、budget、invalid binding、unsupported spawn、disconnected route、overlap rejection
  cleanup、30/60/120 render cadence、sequential dispose/rebind。通用 Session 另证
  partial-construction / throwing cleanup。
- 安装版本：Babylon `9.23.0`，Havok `1.3.14`，与 lockfile 一致。
- Snapshot / Reset / Replay：steps Case 在 reset+rebind 后重放相同 committed projection/hash。

## 4. Findings

| ID | 级别 | 状态 | 说明 |
|---|---|---|---|
| BWB5-R1 | P2 | accepted debt | WorldPackage fixture 只有一个 `player` Subject；跨实体 rebind 用跨 Session / 跨 Layout 证明 owner 清理，不扩第二 Subject Definition |
| BWB5-R2 | P2 | accepted debt | 未跑浏览器 FeelReview 或 Playwright 真像素 PNG；profile-local AuthoringCapture + Havok 是本切片证据。BNA-7 仍开放 |
| BWB5-R3 | note | closed | `unsupported-spawn` 不进入 air settle；Runtime 在 create 时 fail-closed。这比“先玩后掉下去”更符合权威 |
| BWB5-P1-1 | P1 | closed, independently verified | T-west、mountain cliff、building/interior back wall 不再使用 spawn 即满足的单边阈值；改为 approach + Contribution near face + capsule radius + grounded tolerance band |
| BWB5-P1-2 | P1 | closed, independently verified | 删除不存在的 `WORLDKIT_NATIVE_BLOCK_SPAWN_UNSUPPORTED`；inspect/evidence index 不再发布 Profile 失败码，Runtime 继续以 `WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING` fail-closed |
| BWB5-P1-3 | P1 | closed, independently verified | mountain `m-overlook` 新增落脚支撑带、Contribution 边缘 + capsule radius、`y < -0.25` 与 `air` 证据 |
| BWB5-P2-1 | P2 | closed, independently verified | steps 补齐 BWB-4 的 riser/tread z/y 带、blocker 近面 + capsule radius 与 ledge 下落高度 |
| BWB5-P2-2 | P2 | accepted debt | `cleanup-throw-partial` 的 Corpus 层证据仅覆盖 overlap finalize rejection 后清理；真正 partial/throwing cleanup 由通用 Session 对抗测试持有，后续应重命名 Case 或引入稳定注入点 |
| BWB5-P2-3 | P2 | closed, independently verified | sequential rebind 测试标题降为实际证明的 Scene/Engine/Collider Mesh dispose，不再声称 Listener/Camera/Input owner |
| BWB5-P2-4 | P2 | closed, independently verified | cadence 改为真实 `renderFrame()` 交错，不再把 fixed-input batching 误写成 render cadence |
| BWB5-P2-5 | P2 | closed, independently verified | 规格工作图删除错误的 `BNA-6 -> BWB-5` 前置，与 §BWB-5 `depends_on` 单一一致 |

独立复核后无开放 P0/P1。BWB5-P2-2、BWB5-R1、BWB5-R2 保持明确的非阻塞接受债务。

## 5. 合入条件

- focused contract + Havok + typecheck + census + playground build 已通过
- 不修改 Runtime/Havok/Camera/Input 生产代码
- 不勾 `docs/18` 的 BWB-5，直到本 PR 合入 main 后再单独勾选，且不抬总进度百分比
- Cursor Cloud focused 门禁与独立 Review 已绑定产品候选
  `cdcca43702cce025f5782a231d019e96e24312b4`；后续纯文档闭合不使 Runtime/Havok 证据失效
- 本文中的旧 GO 不得用作合入证据；合入使用 `cdcca43702cce025f5782a231d019e96e24312b4`
  的 exact-SHA 门禁和独立 Review 结论
