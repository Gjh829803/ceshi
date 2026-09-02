# Agent-friendly Babylon Native Block Drawing API 变更审查

## 1. 审查元数据

- 审查模式：**B 变更审查**（PR / 分支 diff）。必查维度 D2、D3、D4、D5、D6。
- 本 diff 修改 Native Block Profile Session / Finalize / Builder Skill / reconstruction fixture，
  **不修改** Runtime、Havok、Character、Camera、Input、固定 Tick 或 Browser Protocol V5。
  因此完整执行 `runtime-deep-review-checklist.md` 的 authority map、引擎语义、部分构造 /
  throwing cleanup、双实例隔离与证据分层；运动 / 支撑查询 / 相机 / 回放条目标为不适用。
- 审查对象：PR [#162](https://github.com/seedleap/agent-whitebox-world-sdk/pull/162)，
  产品树 `50a6644aba1357cd477ac846e08f01c320c37e3a`
  （`cursor/native-block-drawing-api-120f`）。
- Diff 基线：`origin/main@2f5ca6d59f3464f3c0fdb507d8dc0e2b46774501`；
  merge-base `db3fa64c264f216a1418397b22c5c0445419838f`（已含 #163）。
  `origin/main...HEAD` 为 26 files, +1320 / -207。本审查冻结该产品 SHA；若随后只追加本报告，
  新 SHA 是文档-only，不使本表 focused 证据失效。
- 规格：
  [`2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md`](../superpowers/specs/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md)。
- 计划：
  [`2026-09-02-agent-friendly-babylon-native-block-drawing-api-implementation.md`](../superpowers/plans/2026-09-02-agent-friendly-babylon-native-block-drawing-api-implementation.md)。
- 上位权威：`AGENTS.md`、
  [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)、
  [ADR-0007](../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)、
  [Native 长期设计](../superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)、
  [Block Profile 设计](../superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)。
- 安装引擎：`@babylonjs/core@9.23.0`（`node_modules/@babylonjs/core/package.json`，本审查重新读取）。
  已对照安装源码：
  `Vector3.Forward(rightHandedSystem = false)` 返回 `(0,0,1)`
  （`node_modules/@babylonjs/core/Maths/math.vector.pure.js`）；
  `CreateBox` 先 `new Mesh(name, scene)` 再 `vertexData.applyToMesh`
  （`node_modules/@babylonjs/core/Meshes/Builders/boxBuilder.pure.js`）。
  Y 四分之一转与 world-matrix 轴匹配由同版本 NullEngine 回归覆盖，不以训练记忆断言 Euler 顺序。
- 证据层级：`static-read` + `automated-contract`。无 `rendered-visual`、无 `manual-interaction`。
  本切片不声明人物通过性、Route、Capture 生产或 BNA-6/7 完成。

### 1.1 命令与结果

本审查在产品树 `50a6644a`、clean worktree 上亲自执行。PR 正文另称同树 `pnpm test` /
`pnpm build` 通过，但本审查未找到绑定该 SHA 的聚合日志，**不复用**为审查证据。

| 树 | 命令 | Exit | 证明范围 / 不覆盖范围 |
|---|---|---:|---|
| `50a6644a` | `git rev-parse HEAD` | 0 | 冻结产品 SHA |
| `50a6644a` | `git diff --check origin/main...HEAD` | 0 | whitespace；不证明行为 |
| `50a6644a` | `git status --short` | 0 | 审查开始时 tracked 树干净 |
| `50a6644a` | `node -e "require('@babylonjs/core/package.json').version"` | 0 | 打印 `9.23.0` |
| `50a6644a` | `pnpm exec vitest run packages/native-babylon-block-profile` | 0 | 16 files / 139 passed。含类型、Session/Grid 原子性、rollback seam、Finalize 篡改、Collider 非推断、package census |
| `50a6644a` | `pnpm check:native-block-builder-skill` | 0 | 22 passed。含 frozen Case Skill 与 live Skill 逐字节一致、禁止 create-then-mutate 教学 |
| `50a6644a` | `pnpm exec vitest run scripts/reconstruction/native-package.test.ts scripts/agents/native-block-builder-skill.test.ts` | 0 | 2 files / 28 passed。旧方言 Host typecheck 拒绝且无 Package 输出；当前 API 得到新 authored-source / Package / Receipt；已发布 `cloud-ridge` 字节未被测试改写 |

未跑及原因：

| Lane | 原因 |
|---|---|
| `pnpm typecheck` / `pnpm test` / `pnpm build` | 本审查未在 `50a6644a` 上重跑聚合门禁；PR 声称通过但无 SHA 绑定日志可复核。focused owner tests 已覆盖本 diff 的合同面。 |
| `pnpm test:studio` | Studio Node tests；本 diff 不改 `apps/studio`。 |
| `pnpm test:independent` | 独立 Node/Cursor Python/Site census；本 diff 不改那些入口。 |
| exact-SHA Cloud tracked CI | WRC-API-90 仍开放；本审查不是 Cloud full-gate receipt。 |
| Browser verifier / rendered visual / manual interaction | 本切片不声明生产 Capture、手感或像素还原。 |

审查命令只读。未运行会改写 tracked 文件的 producer。审查结束后再次 `git status --short` 仍为空。

### 1.2 资源与状态权威

| 状态 / 资源 | 唯一权威 | 本切片后的消费者 |
|---|---|---|
| Block 初始位置与 Y 四分之一转 | `createBlock()` / `createBlockGrid()` 写入的 Session record.input | Finalize Layout 复验 live Mesh world pose 必须 `Object.is` 等于该声明；不相等则 `WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID` |
| Occupancy / ID / budget | Session 内 `recordsById` + `blockIdByMicroCellKey` + caller `maximumBlockCount` | `reserve()` 在 Mesh 分配前拒绝；`createBatch` 失败则 `release()` 逆序清掉已提交记录与格子 |
| Candidate Scene 与成功 Mesh 生命周期 | Host 提供的 Candidate Scene | Profile 只在该 Scene `CreateBox`；Session `dispose` / rollback 释放本 Session 的 acquisition |
| 结构 Layout / 暴露顶面 / 结构支撑警告 | Finalize 一次性派生值 | Check / visual group inventory；**不是** Havok `checkSupport()`，也不是 Route |
| Static Collider | `finalize({ staticColliders })` 显式选择 + 独立 volume proxy | Host registration → SDK-owned Havok。Grid 与 palette / Mesh 名不产生 Collider |
| Display gap 视觉缩放 | `createBabylonNativeBlockVisualsV1` 在 Layout/Collider 之后缩放源 Mesh | 不进入 occupancy、Collider proxy 尺寸或 traversal evidence |
| Subject / Camera / Tick / Input / Package identity | 既有 SDK / Host / WorldPackage owners | 本 diff 为 0 |

## 2. 旧结论复验

`docs/reviews/` 下**没有** `2026-09-02-agent-friendly-babylon-native-block-drawing-api-design-review.md`。
该 Mode A 报告只存在于非祖先提交 `aba5515c`（`git merge-base --is-ancestor aba5515c HEAD` 失败）。
本审查把它当作线索读完，并在当前源码上复验；不把它当作 HEAD 可引用的现行审查。

| 既有结论 | 当前裁决 |
|---|---|
| Mode A（`aba5515c`，非祖先）：无开放 P0/P1；可进 WRC-API-10。两项 P2：最终 gate mapping；Nth Mesh 失败要用 Session-isolated seam | **部分成立。** 设计方向仍成立。gate mapping 仍由开放的 WRC-API-90 拥有。Nth 失败 seam **已复验关闭**：`session.test.ts` 用 `scene.addMesh` 局部替换，不 spy 全局 `MeshBuilder`，不跨 Session。 |
| Mode A 纪律：Block 与 Grid 共用 parser / occupancy / acquisition | **已复验，成立。** `createBlock()` 是单元素 `createBatch()`；Grid 先 `parseGridCreateInput` 再同一 `reserve` / `allocate` / `release`。 |
| Foundation 审查 `3138aa16`：Finalize 从最终 Babylon world transform **发现** placement，Mesh 是创作期 transform 权威 | **已失效（有意替换）。** 本切片把声明 placement 收进 create input；Finalize 从「发现」改为「复验 live pose == declared」。Mesh 仍是篡改检测的观测面，不再是第二套合法放置方言。 |
| Foundation / BWB-6：Profile 不是第三条 Scene Source；不从颜色 / 材质 / 名推断 physics；BWB-6 只做 eligibility，不在本切片执行 Thin Instance / coalescing | **已复验，成立。** Grid 测试断言 `staticColliders: []` 时 `registeredColliders === []`。Collider proxy 用 Layout `sizeMetersXYZ` 与 `centerMetersXYZ`，在 visual display-gap 缩放之前构建。 |
| `618d96b4` 只是历史设计证据；当前唯一 v2 迁移源是 `3c2e9826` | **已复验，成立。** Profile 设计与 Drawing API 设计一致；Native 长期设计的 BNA 状态行改为指向 `docs/18`。 |
| `docs/18`：BNA-6/7、NBR-20/70、WRC-API-90、WRC-1 保持开放 | **已复验，成立。** 本切片没有把那些复选框勾上。 |

## 3. Findings

### [P1] [D3] `docs/18` 的 Drawing API 进度句与当前树事实不一致

- 证据（static-read + automated-contract）：
  live status 权威把 WRC-API-00 写成已完成「独立 exact-SHA 文档审查」，但
  `docs/reviews/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design-review.md`
  不在当前 HEAD。`git log --all -- docs/reviews/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design-review.md`
  只指向非祖先 `aba5515c`。
  同一段把 WRC-API-50 写成「唯一**仍教**旧 placement 方言的活跃生成输入是代表性 Case 的冻结 Builder Skill 副本」，
  紧接着又称该副本「已刷新为与 live Skill 逐字节一致」。
  `scripts/agents/native-block-builder-skill.test.ts` 在 `50a6644a` 上证明 frozen
  `SKILL.md` / `native-block-output-contract.md` / `self-check.mjs` 与 live Skill 字节相等，
  且 live contract 禁止 `createBlock(...); mesh.position`、`placeBlock`、`addBlock`、`createBlocks(`。
  两句不能同时为真：若逐字节等于只教新方言的 live Skill，冻结副本就不再教旧方言。
  段末仍写「当前 NBR 生产链路仍可在**旧 Profile 合同**上继续收口，不得被**未实施的新 API**伪装为已迁移」，
  与同段已勾选的 WRC-API-10/20/30/40/50 以及 `native-package.test.ts` 的
  `native-check-rejected` / `WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED` 证据直接冲突。
  见 `1082:1098:docs/18-refactor-progress-and-backlog.md`。
- 期望：`docs/18` 是唯一 live status 权威，每一句必须能被当前树复核。WRC-API-00 要么合入可复核的
  Mode A 文件，要么改成「设计已冻结；Mode A 报告未进入本分支」。WRC-API-50 应写成冻结副本**已经**切到
  当前方言并由 drift gate 锁住。NBR 收口句应区分「未完成 NBR-20/70」与「TypeScript 放置方言仍可用旧合同」；
  后者在当前树上已不成立。
- 影响：后续 NBR / Builder 执行者可能以为 create-then-mutate 仍是合法生产输入，或以为 Mode A 审查
  已在本 PR 可复核。这不会让 Session 静默接受旧方言（Host typecheck 仍拒绝），但会把 live status
  变成不可执行的谎言。
- 建议：只改正 `docs/18` 这三处措辞（可选：把 `aba5515c` 的 Mode A 报告作为历史附件合入 `docs/reviews/`）。
  不要为此回退 API。不要勾 WRC-API-90。
- 复核：未复核

### [P2] [D2] Grid 把 `repeatCountXYZ` 交给位置解析器，失败文案说 “positions”

- 证据（static-read）：`parseGridCreateInput()` 对 `repeatCountXYZ` 调用 `parsePositionMetersXYZ()`。
  非法元组因此抛出 `WORLDKIT_NATIVE_BLOCK_GRID_CREATE_INPUT_INVALID: positions must be one ordinary dense XYZ tuple`
  / `positions must hold three finite plain numbers`，即使字段是计数不是米制位置。
  见 `321:325:packages/native-babylon-block-profile/src/session.ts` 与
  `222:242:packages/native-babylon-block-profile/src/session.ts`。
  公开字段名 `repeatCountXYZ` 本身带坐标域、不带 `Meters`，符合 Schema 规则；缺陷在诊断文案把计数
  说成 positions。
- 期望：AGENTS Schema 规则要求失败返回稳定错误码与可定位信息，不把一种单位方言的解析器文案套到
  另一种字段上。计数解析应拒绝非正安全整数，文案使用 `repeatCountXYZ`。
- 影响：Agent 看到 “positions” 会去改 `minimumCenterMetersXYZ`，而真正的坏字段是 `repeatCountXYZ`。
  预检仍在分配前失败，不会静默造 Mesh。
- 建议：为 XYZ 计数抽一个 `parsePositiveSafeCountXYZ`（或给位置解析器传入字段名）。不要给计数加
  `Meters` 后缀，也不要新增第二套 Grid 输入别名。
- 复核：未复核

### [P2] [D5] `CreateBox` 在 acquisition `try` 之外；`applyToMesh` 抛错会留下未跟踪 Mesh

- 证据（static-read + 已对照安装版本）：`allocate()` 在 `try` 之前调用
  `MeshBuilder.CreateBox(...)`（`568:569:packages/native-babylon-block-profile/src/session.ts`）。
  安装版 `CreateBox` 为 `const box = new Mesh(name, scene); ... vertexData.applyToMesh(box, ...)`
  （`boxBuilder.pure.js` 192–198 行）。`new Mesh(name, scene)` 把节点加入 Candidate Scene。
  若 `applyToMesh` 随后抛错，`CreateBox` 不会返回，`allocate` 的 `try/catch` 不会 `mesh.dispose()`，
  `createBatch` 只 `release()` 已经成功返回的元素。规格 §6.1 要求「Mesh 创建失败则新 Mesh 被 dispose，
  不留下 ID / occupancy / record」。
  当前 rollback 测试在 `scene.addMesh` 之后注入 `getVerticesData = null`，覆盖的是 **CreateBox 已成功返回**
  的几何快照失败，不是 builder 内部抛错。
- 期望：规格 §6.1 / §6.2 的部分构造合同：任何已进入 Scene 的新 Mesh 都必须进入 Session acquisition，
  失败路径逆序 dispose。形状尺寸来自闭合表，`applyToMesh` 在正常输入下几乎不抛，所以这不是静默错放。
- 影响：极端 builder 抛错时 Candidate Scene 留下不在 `recordsById` 的 Mesh。后续 Finalize 不把它算进
  Layout；Host authority audit 若扫描 Scene 则可能 fail-closed，否则留下视觉垃圾。
- 建议：把 `CreateBox` 放进与 snapshot 同一个 `try`，或立即捕获 builder 抛错并对已构造 Mesh 走
  `AllocationFailure` 清理。不必新增公共 seam。
- 复核：未复核

### [P2] [D2/D5] 合法 `idPrefix` 可以派生出超出稳定 ID 长度的 Grid 子 ID

- 证据（static-read）：稳定 ID 为 `^[a-z0-9][a-z0-9-]{2,79}$`（总长 3–80）
  （`122:122:packages/native-babylon-block-profile/src/session.ts`）。
  `idPrefix` 通过同一 `canonicalId` 后，子 ID 为 `` `${idPrefix}-x${xIndex}-y${yIndex}-z${zIndex}` ``。
  长度为 72–80 的合法 prefix、或大索引，会在 `parseCreateInput()` 以
  `WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID` 失败，而不是 Grid 自己的定位码。
  预检测试用 80 字符 prefix 配 `repeatCountXYZ: [5,1,1]` 且 budget=4，命中的是
  `WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED`，没有覆盖「prefix 合法但子 ID 超长」
  （`793:800:packages/native-babylon-block-profile/src/session.test.ts`）。
- 期望：规格 §5 / §6.2 要求在分配前校验每个子 ID，并给出派生 child ID。失败应发生在 Grid 预检，
  并带上将超长的那个 ID。
- 影响：Agent 用接近上限的 prefix 时，得到单块 CREATE_INPUT 诊断，而不是 Grid ID 规则。零 Mesh
  仍被遵守。
- 建议：在展开循环里先构造 ID 并按 Grid 错误码拒绝；补一条 80 字符 prefix + budget 足够的 RED。
- 复核：未复核

### [P2] [D3] 设计规格页眉仍写 “implementation has not started”

- 证据（static-read）：
  `docs/superpowers/specs/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md`
  第 3 行仍是 `Status: Accepted design checkpoint; implementation has not started`，
  尽管同文件把 live status 指向 `docs/18`，且 `docs/18` 已勾选 WRC-API-10..50。
  实施计划 Task 6 Step 4/5 仍未勾，这与开放的 WRC-API-90 一致。
- 期望：规格页眉要么只指向 live status，要么改成「Accepted；实施进度以 `docs/18` 为准」。
  不得让页眉把已合入的 API 说成尚未开始。
- 影响：只读规格的执行者会低估当前能力。`docs/18` 仍是权威，所以不升为 P1。
- 建议：改一行状态，不要在规格里复制 WRC-API 复选框。
- 复核：未复核

## 4. 维度覆盖表

| 维度 | 状态 | 结论 |
|---|---|---|
| D1 定位与需求边界 | 不要求；辅助核对 | 仍是 ADR-0007 Native Lane 内可选 Profile helper。无第三条 Scene Source、无 Compiler、无 Runtime owner。未把室内 / 载具 / 洞穴写成受支持能力。未勾 BNA-6/7、NBR-20/70、WRC-1。 |
| D2 Schema 与 AI-friendly | 已查 | 一个放置方言：必填 `centerMetersXYZ`、可选闭合 `rotationQuarterTurnsY`、Grid 的 `minimumCenterMetersXYZ` / `repeatCountXYZ`。单位与坐标域在公开字段名上。无 `placeBlock` / `addBlock` / 旧 overload。P2：Grid 计数复用位置解析文案；超长子 ID 诊断码偏单块。 |
| D3 承诺与事实对拍 | 已查 | 产品行为与规格 §4–§7 对齐：原子 create、dense Grid、Finalize 篡改、Grid 不造 Collider、旧方言 Host 拒绝。P1：`docs/18` live-status 句子与树不一致。规格页眉 “not started” 为 P2。本审查不把本切片写成 NBR/BNA/WRC-1 完成。 |
| D4 单一权威状态 | 已查（runtime-deep 子集） | 声明 placement 归 Session record；Finalize 复验 Mesh，不把事后 `position.set` 收成第二方言。Occupancy 在 `reserve()` 预检、成功 `allocate()` 后提交，失败 `release()`。Collider 仅显式 Finalize + 独立 proxy（Layout 尺寸，非 visual scale、非 Mesh 名）。结构 `unsupportedBlockIds` 仍是 occupancy 警告，不是 Havok support。Visual adapter 拒绝 parent / disabled / instance。Host-only checked-epoch 未进根出口。 |
| D5 工程质量 | 已查 | `lodash-es` 具名 `isEqual` / `isNil`；Babylon `Vector3` 用于轴匹配；包 `package.json` 声明 `@babylonjs/core` 与 `lodash-es`。稳定排序、闭合输入、双 Session 隔离、逆序 rollback、throwing cleanup、Scene-isolated `addMesh` seam 均有回归。P2：`CreateBox` 在 `try` 外；Grid 子 ID 长度。census 用多行对象正则，单行漏检由 TypeScript 必填字段兜住。 |
| D6 门禁与证据分层 | 已查 | §1.1 给出本审查亲自跑过的命令与未跑项。focused contract 不能冒充 Cloud CI、Studio、Browser 或视觉。WRC-API-90 保持开放。 |

## 5. 裁决

**产品实现：有条件 GO。** 原子 `createBlock()`、dense `createBlockGrid()`、共享
`parse → reserve → allocate → release`、Finalize 声明复验、显式 Collider、current-only 消费者 /
Skill 切换，与冻结规格一致。当前树无开放 P0，也无「静默接受旧放置方言」或「Grid 暗造 Collider」的
实现缺陷。

**文档 / 完成口径：NO-GO，直到 P1 关闭。** 不要勾 WRC-API-90，不要把本 PR 说成独立深审与 Cloud
full gates 都已完成。先改 `docs/18` 的 00/50/NBR 收口句，使其可被当前树逐句复核。

本结论只接受「扩展现有 Native Block Profile 的机械绘制 API」。它不授予 Native 生产、formal
Capture、Route、NBR-20/70 或 WRC-1 完成声明。

## 6. Codex exact-SHA follow-up

- 复核对象：`2cee1822da55883c8490c50b3df6203f0705952e`
- 复核范围：本报告的 P1/P2、近格点坐标的声明/实测一致性、Babylon `CreateBox` 在 Scene 注册后
  抛错的清理、单行旧 placement 方言普查，以及 current-only public surface。
- 复核证据：受影响的 4 个测试文件共 48 tests 通过；完整
  `@whitebox-world/native-babylon-block-profile` 共 16 files / 141 tests 通过；`pnpm typecheck` 与
  `git diff --check` 通过。未把这些 focused 证据冒充 Cloud full gates。
- 裁决：本报告原 P1 已关闭；四条 P2 已关闭。补充复核发现并关闭的近格点 Finalize 双标准与
  Babylon Scene 注册后抛错残留 Mesh 两条 P1，均已有 RED -> GREEN 回归。当前复核范围内无开放
  P0/P1，产品实现可合入；WRC-API-90 因 Cloud full-gate receipt 与 NBR 生产证据仍保持开放。
