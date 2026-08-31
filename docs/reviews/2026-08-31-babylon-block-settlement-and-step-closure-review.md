# Babylon Block Settlement 与真实台阶实现审查

- 日期：2026-08-31
- 模式：实现候选自审 + 真实 Havok narrow fixture + scoped 对抗复核 + exact-SHA Cursor Cloud
  全量门禁与独立 Mode B/runtime-deep 审查
- 实现基线：`origin/main@3b2f66177338c30242b80a7c52a929125f8883cb`
- 核心实现 SHA：`ab77aabf138e643c509f36dd58b4a2232241c757`
- 产品候选 SHA：`c02afa452c030398244ba726f9c509affcd1bb95`
- 首轮 Cloud 审查 SHA：`415eef04c37c0a2919a7f07bcbc953be4b4306af`
- 范围：BWS-10 至 BWS-60；关闭 BWB-3、BWB-4，并只关闭 BWB-5 的真实台阶前置
- 当前裁决：**GO；修复 SHA exact-SHA full gates 与独立复核均通过；开放 P0/P1/P2 = 0**

## 1. 候选结论与明确非声明

本候选把 Babylon Block Profile 的视觉、Collider intent、Package replay 和 SDK/Havok 通过性接成同一条
可核验链：一个 `whitebox.blocks@1` Session、一个 Checked Layout、一个 `finalize()`、一个 Host settlement、
一个冻结 Contribution、一个 verified WorldPackage 和一个既有 RuntimeHost。它不新增 Native 专用 Package
格式、第二 Scene Source、第二 Runtime、Compiler、逐块 JSON Manifest、Three.js adapter 或兼容层。

本次只裁决 Block Profile 的直接 Babylon Mesh、多视角 authoring screenshots、静态 Collider 同源登记和
真实台阶 narrow fixture。它不宣称 BWB-5 山地/T 字空间/建筑/有限室内/负向 Corpus、BWB-6 优化、BNA-6
AI 评测、BNA-7 formal Capture/Route Evidence 或 BNA-8 生产 disposition 已完成；verifier-only vertical ray
也不成为新的 Ground Support 权威。

## 2. 权威与合同闭合

### D1 定位与边界

- `worldkit://native-scene-profile/whitebox.blocks@1` 仍是 Native Lane 内的可选创作 Profile，不是第三条
  Scene Source。
- Profile 只创建视觉 Mesh、Profile-local Material 与 no-gap Collider proxy，并把静态 Collider intent 提交到
  BNA core；SDK 继续独占 Babylon Scene lease、Havok、Character、Input、Camera、fixed Tick 和 Gameplay。
- Session `dispose()` 只清理 Profile-local 未提交资源；Host settlement 消费无 Babylon handle 的冻结快照，
  Candidate Scene/Host lease 是聚合兜底 owner。

### D2 Schema 与 AI 友好性

- sole current shape union 为 `full | half | quarter | small | step`；`step` 是 `[1, 0.25, 1]m`。
- Occupancy Grid 为 `[0.5, 0.25, 0.5]m XYZ`，center lattice 为 `[0.25, 0.125, 0.25]m XYZ`；旧 scalar
  grid、旧四-shape 语义和兼容 alias 已删除。
- AI-facing repair hint 只描述稳定动作，不引用已经完成或可能漂移的内部工作包时态。

### D3 承诺与事实

- Build Epoch 内 recorder 只接受一个 exact settlement batch；profile ref、target/proxy identity、Scene membership、
  transform、indexed geometry、visibility/enabled 与 disposal 状态都在 commit/finalize 两次校验。
- Profile inventory census 覆盖 Candidate Scene 的全部 live `AbstractMesh`，包括 empty/released geometry 和
  `InstancedMesh`；不会以 vertex count 或具体 `Mesh` subclass 漏掉未登记对象。
- Contribution/profile identities 与 hashes 在两次独立 admission 相等；verified Package root、
  `worldBuildIdentity` 和 hash 在两次 build 相等，并在 Havok allocation 前 replay exact-match。

### D4 单一权威

- Native authority audit 对实际 `Mesh` 保留 Mesh-only guards，对 `AbstractMesh`/`InstancedMesh` 保留其真实 API
  surface；`actionManager`、`physicsBody` 的 set-reset 也会留下不可擦除的 violation。
- Block Layout 只在 Build Epoch 内存在；Runtime 不查询 Layout、不建立第二 Height Sampler，也不从颜色或
  Scene Mesh 反推碰撞。
- `CharacterMovementRuntimeV1`、`CharacterBodyPortV1`、committed movement state 与唯一 `checkSupport()`
  继续决定真实移动和接地。

### D5 工程质量

- Profile checker 在首个 visual material/Collider allocation 前 fail closed；finalize 只冻结已完成的 Host
  settlement，throwing cleanup 继续逆序释放并保留首错。
- exact Box 检查要求 8 个 Cartesian corners、8 vertices、12 个唯一非退化三角形、每个边界面恰好两三角形、
  合法索引与 outward winding；Contribution 与 Runtime collision Mesh 均复验。
- 全部新增根 Vitest 文件登记在唯一 `TEST_GATE_MANIFEST_V1`，没有 focused-only 测试逃逸。

### D6 证据分层

- rendered evidence：Opening、top-down、side authoring screenshots 和稳定 visual group identity；它们不是
  BNA-7 formal Capture Receipt。
- structural/collider evidence：同一 Layout 的 source/proxy join、Contribution/hash、Package replay、exact
  topology、cleanup。
- Runtime evidence：安装的 Babylon `9.23.0`、Havok `1.3.14`、SDK fixed Tick、0.25m riser、0.5m blocker、
  elevated support、ledge departure 与 reset/rebind deterministic projection/hash。
- 未把截图、普通 Babylon Box conformance 或 vertical ray 单独冒充人物可通过性。

## 3. 真实台阶与生命周期证据

fixture 沿 `-Z` 使用六个显式 Box Collider：三块 ground、两个 `step` block 和一个 `half` blocker。首个
step 相对 ground 的真实 rise 是 `0.25m`，两个同标高 step block 形成不少于 `2m` elevated tread；末端
blocker 从 `0.25m` 到 `0.75m`，相对 rise 为 `0.5m`。本 fixture 不把同标高 tread 误记为第二次上升。

- verified Bootstrap 的 `maxStepHeightMeters === 0.3`；
- Subject 越过 `0.25m` riser 后保持 `movementMedium === "ground"`；
- 长时间前进仍停在 `0.5m` blocker 前；
- elevated tread 下唯一 support hit 与 verified Contribution 的 collider/subshape/surface/profile metadata
  exact-match；
- Reset/rebind 后同一 input 得到相同 committed projection/hash；
- 侧向离台后进入 `air`；
- Candidate Collider Mesh、Candidate Scene/Engine 和正式 Runtime 资源最终释放。

## 4. 候选期 findings 与裁决

### [已关闭 P1] empty/released geometry 可绕过 Profile inventory census

- 证据：旧实现只 census `getTotalVertices() > 0` 的 Scene Mesh；额外 empty Mesh 和执行
  `geometry.releaseForMesh(mesh, false)` 后仍存活的 Mesh 均可错误 admission。
- 期望：对 blocks Profile 枚举 Candidate Scene 全部 live `AbstractMesh` object identity，并与 settlement
  target/proxy union exact-match。
- 影响：未登记视觉对象可进入已发布 Candidate，破坏 fail-closed Profile inventory。
- 建议：删除 vertex-count filter，覆盖 empty/released geometry 与 Standard Profile 非回归。
- 复核：当前 census 已覆盖全部 live `AbstractMesh`；行为 RED→GREEN。已被 Codex 复核确认关闭。

### [已关闭 P1] `InstancedMesh` 可绕过 inventory 或 transient authority mutation

- 证据：中间候选以 `instanceof Mesh` census，并把早期 `createInstance()` 对象误分为 generic node；继而
  `actionManager`/`physicsBody` set-reset 未留下 retained violation。
- 期望：installed `InstancedMesh` 作为 `AbstractMesh` 进入 census 和真实 API audit surface，瞬时写入也必须
  fail closed。
- 影响：Module 可留下未登记实例或短暂接管 Gameplay/Physics authority 后恢复字段。
- 建议：按 `AbstractMesh` identity census/runtime-kind 分类，并对继承字段安装 retained guards。
- 复核：真实 installed `InstancedMesh` 对抗回归已覆盖 inventory、视觉-only pass 与两种 set-reset；scoped
  Round 4 审查开放 P0/P1/P2 为 0。已被 Codex 复核确认关闭。

### [撤回旧 P2] Session `dispose()` 被误判为第二 Runtime owner

- 证据：成功 finalize 后调用 Session `dispose()` 会释放 Profile-local Mesh；旧 finding 据此推断 Host 已接管
  handle ownership。
- 期望：settlement/Contribution 只持有冻结数据；Session cleanup 与 Scene aggregate fallback 的角色分开。
- 影响：当前无生产缺陷；删除 Session cleanup 反而会泄漏 authoring/build 资源。
- 建议：不改实现，在规格中明确 ownership。
- 复核：settlement result、Contribution、Package 均无 Babylon handle；Profile Session 与 Host lease 没有
  双 Runtime disposer。复核后撤回（原 finding 错把快照登记当成 handle transfer）。

### [已关闭 P2] 上位规格和公开 diagnostic 仍描述旧合同

- 证据：上位 Profile 一度仍写四 shape/scalar grid，route diagnostic 一度把 BWB-4 写成未来阶段。
- 期望：一个 current-only Profile 术语和永久语义 repair hint。
- 影响：AI/维护者会按旧网格生成内容或误判 Runtime 能力阶段。
- 建议：同步 parent spec、WRC/backlog truth，删除 milestone-relative 文案。
- 复核：`415eef04` 已同步 step/XYZ grid/lattice 与真实 fixture wording；diagnostic 使用稳定分层建议。已被
  Codex 复核确认关闭。

## 5. 本地 focused 与 scoped review 证据

| 命令/证据 | Exit | 结果 |
| --- | ---: | --- |
| BWS settlement focused set | 0 | 相关 134/134 pass |
| `scripts/verification/bwb4-block-collider-runtime.test.ts` | 0 | 3/3 pass；real Havok/fixed Tick/reset/cleanup |
| `pnpm test:census` | 0 | 355 files = 317 contract + 38 resource-heavy |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `pnpm verify:bna2-clean-break` | 0 | Native current-only clean break 通过 |
| `pnpm verify:workspace-boundaries` | 0 | 既有边界债务不增加 |
| Task 8 fix round 2 scoped review | GO | exact topology/ray metadata/census 3/3 addressed；无新 Critical/Important |
| Product fix round 4 scoped review | GO | `InstancedMesh` authority finding addressed；开放 P0/P1/P2 = 0 |
| `git diff --check` | 0 | 通过 |

## 6. Exact-SHA Cursor Cloud 证据

| Agent | Run | 精确 SHA | 结果 |
| --- | --- | --- | --- |
| Full gates `bc-87fdbb9e-38cf-443a-8b21-0004a51de6a7` | `run-5102f711-221c-4ca1-9a71-db39c93fc32f` | `415eef04…` | **NO-GO；3 个收口遗漏** |
| Mode B/runtime-deep `bc-e8ee6217-6d91-4e0a-bac7-5cf42428f83e` | `run-c26e3eb4-612b-4012-9c61-05e5de05cffe` | `415eef04…` | **GO；开放 P0/P1/P2 = 0** |
| Full gates rerun `bc-52be5c36-bb3e-42e9-962f-1068e34ca02b` | `run-ae171d83-d0e0-4d20-acae-c745bb3a9d34` | `c02afa45…` | **GO；18/18 commands exit 0** |
| Scoped re-review attempt `bc-30a7ac8b-8b93-4367-a0de-6d36ad5feacc` | `run-5ae26849-6949-417d-8b9d-fc7a9a6235d8` | `c02afa45…` | **Cloud ERROR；无裁决** |
| Bounded scoped re-review `bc-65db3715-48af-4e17-8178-8a4cfdbb8534` | `run-dbd7ae1d-08f7-4b4e-901b-26e37ff400a3` | `c02afa45…` | **GO；开放 P0/P1/P2 = 0** |

Cloud full-gate agent 不运行会更新 tracked PNG 的 `pnpm verify:bwb3-block-capture`，而是执行只读
`bwb3-block-capture-evidence.test.ts`；未改变输入的 BNA-5 Docker hostile evidence 也不重复执行。

首轮 full gates 的三个失败均已在 `c02afa45` 按 RED→GREEN 关闭：

- package boundary 拒绝 Candidate 为类型便利新增的 `AbstractMesh` Deep ESM import。修复没有扩大公开
  import profile，而是复用既有 `Scene["meshes"][number]`；boundary/Candidate focused 51/51 通过。
- Cloud Ridge verified WorldPackage 的 `native-babylon` source integrity 过期。通过唯一
  `pnpm native:cloud-ridge:package` 生成入口重建，Package root 更新为 `sha256:dd8c3da7…d8903`，随后
  `native:cloud-ridge:package:check` 通过。
- Browser verifier 仍冻结旧 Contribution hash。它已更新为 verified Package 中的
  `sha256:cae0d302…e9b3d`；真实 Browser/Havok 行走、跳跃/落地、Camera reset、Collider identity、4 次
  Runtime create 与零 browser error 通过。常量仍是独立冻结期望，没有改成从 Runtime 自证。

独立审查留下 3 个非阻塞 P3：

1. Session 成功 finalize 后仍保留 Profile-local cleanup capability。裁决：这不是第二 Gameplay/Runtime
   owner；规格已澄清提前 dispose 会由 Host recheck fail closed，生产最终 owner 仍是 Scene/lease。
2. narrow fixture 没有独立 sweep 30/60/120 Hz，rebind 只覆盖 reset + 同实体 repossess。裁决：不扩大本次
   已证明的真实 0.25m/0.5m through/block 能力；cadence 与跨实体 rebind 加入仍开放的 BWB-5 corpus 深度。
3. `profileInventoryHash` 由 Profile 提交而 Host 只重算 `settledVisualHash`。裁决：保持 opaque inventory
   evidence；Host 不得反向解析 Layout 或建立第二几何 owner，Havok truth 仍是已验证 static colliders。

## 7. 最终裁决

**GO。** 产品候选 `c02afa452c030398244ba726f9c509affcd1bb95` 的 exact-SHA Cloud full gates 与
bounded scoped re-review 均通过，开放 P0/P1/P2 = 0。BWB-3 与 BWB-4 完成；BWB-5 只完成真实台阶
prerequisite，剩余 corpus 和所有明确非声明继续开放。
