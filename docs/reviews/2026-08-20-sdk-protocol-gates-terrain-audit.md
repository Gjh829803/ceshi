# SDK 协议 / 门禁 / 地形 / Plan-first 补充审计

## 阅读顺序（给其他审查者）

1. 先读 `docs/reviews/2026-08-20-sdk-full-audit.md`（Authoring/Runtime/Capability/资产）。
2. 再读本文。本文不重复那份的 P0 spawn Y、双 G Bot、25 clip、`Beta_Joints`、catalog 谎报 `implemented`；只在门禁「假绿」里引用它们。
3. 长期规格 `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` 写的是目标协议。当前可调用契约以 `docs/17-canonical-json-quickstart.md` 和 `docs/18-refactor-progress-and-backlog.md` 为准。
4. 已划掉的旧 runtime 项（悬空 / 假 1/60 相机 / 水域 +2m / rAF=1 tick / Spine 平移泄漏）不要再当开放 bug。

## 审查元数据

- 审查者：Cursor Grok 4.6
- 日期：2026-08-20
- 审查 HEAD：工作树
- 方法：对照设计文档读 CLI / Browser / Hash / verify 脚本 / 地形双管线 / Plan-first；P0/P1 回源码核对。5 路只读子任务完成后，父会话对新增条目再次回源码，并按「静默正确性 / 能力缺口」校正了它们的严重度（例如发现面分裂保持 P1，不升 P0）。
- 对照规格：
  - `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` §16–19
  - `docs/17-canonical-json-quickstart.md`
  - `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`（状态：Proposed，未冻结）
  - `docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md`
  - `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md`
  - `docs/12-plan-first-world-authoring.md`、`docs/13-multi-agent-world-authoring.md`、`docs/15-creator-studio.md`、`docs/09-runtime-world-director.md`、`docs/04-render-contract.md`

## 结论先行

当前 Canonical 切片（validate / build 单文件 artifact / run playground / PNG capture / Browser V3 / layout solve）和 quickstart **对齐**，也和 backlog「第一条纵向切片」对齐。

用总规格当验收清单会误报一大批「缺命令」。那些是**设计有、代码无**的能力缺口，不是实现把协议写坏了。真正要打的是：

1. 发现面和门禁样例在帮产品双入口撒谎（CLI 列出 `@1`，Browser 只列 `.ground@1`）。
2. 现有 verify / `plan:scene` 能在已知 P0/P1 和失败构图上保持绿。
3. Capture 仍是单张 PNG + 启发式就绪，不是 ControlCaptureBundle。
4. 高度采样有两套插值（双线性 vs 三角面）：Layout/outdoor spawn 门禁与脚下网格不是同一函数。
5. Canonical 内部双份噪声目前是**对拍失败即抛**，还不是静默分叉。

---

## 设计有、代码无（能力缺口，不要当 bug 去修）

| 设计对象 | 代码现状 | 权威口径 |
|---|---|---|
| WorldPackage 目录（manifest / integrity / signatures） | `worldkit build` 写单个 `worldkit-build-artifact` JSON | backlog + quickstart |
| WorldChangeSet / ChangeReceipt / Full Reload | 仓库无类型、无命令 | backlog P1.6 未做 |
| `worldkit run --interactive` NDJSON Session | `run` 只起 Playground；SIGINT 停进程 | 总规格 §16.3 vs quickstart §6 |
| `schema` / `capabilities` / `kits` / `change` / `verify package` / `take` | CLI 无这些子命令 | 总规格 §16.1 |
| ValidationProfile / ValidationReport | `packages/` 零引用 | 专项 **Proposed / 未冻结**（backlog §3 勾选待评审） |
| SimulationTake / 五 Pass ControlCaptureBundle | `capture` 写 PNG + 可选 Snapshot V3 | 专项已成稿，切片 15% |
| Runtime World Director | `docs/09-runtime-world-director.md` 自标 Design；无 Observation/Gateway | 文档已声明不是现有 API |
| Elevation Band / Terrain Source 插件 / 分块 Compiler | Canonical 只有 procedural noise 单格 | 地形专项；outdoor 另有 raster |
| `window.__WORLDKIT_DRIVER__` + Session Scope | 暴露 `window.__WORLDKIT__`，无 nonce/scope | 总规格 §18 长期目标；quickstart §7 是 V3 子集 |
| stdin `-` | `parseWorldkitArgs` 只接受文件路径 | 总规格 §16.1 |

这些缺口里，Agent 最容易踩的是：读完总规格就去调 `loadWorldPackage` / `captureFrame({ passes: [...] })` / `worldkit change apply`。当前宿主必须按 quickstart 拒绝，并报告能力缺口。

---

## P0

本层**没有新的发布级阻断**（没有「哈希对同一 JSON 两次结果不同且门禁当权威」这类确定性崩溃）。

发现面 CLI↔Browser 不相交是 P1-1，不是 P0：它误导 Agent 选 ref，但不会让同一份已锁定输入在两次 compile 里得到不同字节。全量审计的 P0（solved spawn Y 双重计数）在本层体现为门禁假绿，见下方分类 B。

---

## P1

### P1-1. 同一 Registry，CLI 与 Browser 的发现面不是同一集合

CLI：

```313:327:scripts/cli/worldkit.ts
export function listRegistryResources(
  resourceKind: "subject-definition",
) {
  const resources = builtInSubjectResourceRegistry
    .listSubjectDefinitions()
    .map((resource) => structuredClone(resource));
```

Browser：

```191:197:apps/playground/src/worldkit-browser-api.ts
    listSubjectDefinitions: (options = {}) =>
      builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions()
        .filter(
          (definition) =>
            options.includeExperimental === true ||
            definition.authoringAvailability !== "experimental",
        )
```

`listSubjectDefinitions()` 含 V2 内置 `humanoid.g-bot@1`；`listCapabilitySubjectDefinitions()` 只含 catalog 的 `.ground@1` 等 V3 包。

后果：按 CLI 发现写 JSON 会绑到 verify/examples 用的 `@1`；按 Browser 发现会绑到 playground 能力工作台的 `.ground@1`。这不是「两个 API 详略不同」，是**同一产品两个 canonical ref**。全量审计 P1-1 的新证据。

`listSubjectDefinitions` 还被设成 `enumerable: false`（`worldkit-browser-api.ts:380-400`）。`Object.keys(window.__WORLDKIT__)` 看不到它，但可以直接调用。

### P1-2. Canonical Compiler 也不拦 spawn ∩ 水 / 地标；`blocked` 水没有碰撞

`compile.ts` 的 Subject spawn 只采地形高度再加 Y（全量审计 P0 的那条路径）。`compileWatersV3` 只把水面编进 Plan，没有「spawn 点必须在水体/地标之外」的语义校验。Authoring normalize 同样没有这条。

默认 `traversalMode` 是 `"blocked"`（`normalize.ts:182`），运行时水域分类却只认 `"swimmable"`（`babylon-world-runtime.ts:383`）。`blocked` / `walkable` **既不挡 spawn，也不变成碰撞体**。可编译出站在水边界内、脚下仍是地面 mesh 的合法 Plan。

全量审计已写 outdoor `compileOutdoorScene` 缺门禁。Canonical 不是「已经修好的另一条路」，是**同一洞再加一层假 blocked**。

### P1-3. Capture 就绪条件是色数启发式，不是 ViewReceipt

Canonical `worldkit capture`：

1. `page.goto` + 等到 `__WORLDKIT__` 存在；
2. `api.ready()`（这步对）；
3. `requestAnimationFrame` 两次；
4. `setPaused(true)` + **`reset()`**（永远拍 spawn 姿态）；
5. `captureVisibleWorldWithRetries`：采样像素 RGB 种类 `< 4` 就重试，最多 8 次（`scripts/cli/worldkit.ts:510-524, 600-660`）。

总规格 §18：「Capture Gate 必须等待 ViewReceipt 和下一次 Render Ready，不能用任意延时猜测镜头已经稳定。」色数阈值是「画面不是纯色」探针，不是镜头/Tick/Package 绑定。黑帧或未编译 shader 可能假失败；几乎单色但合法的白膜也可能假失败。它比 `sleep` 好，仍不是协议。

outdoor 更直接：`apps/playground/src/main.ts:1232` 的 `captureArtifacts=1` 路径 **`setTimeout(..., 900)`** 再导出三视图。这是明确的 sleep 驱动捕获。

`captureScreenshot()` 返回 PNG data URL。不是五 Pass Bundle，quickstart 已承认；不要把现有 PNG 门禁升级成「已经实现 Capture Gate」。

### P1-4. Browser `validateSubjectPackage` 只查 kernel+commandKind，会给假 implemented 相机/关系放行

```283:316:apps/playground/src/worldkit-browser-api.ts
    validateSubjectPackage: (subjectDefinitionRef) => {
      ...
        if (kernel?.runtimeStatus !== "implemented") { ... }
        if (kernel !== undefined && control !== undefined && kernel.commandKind !== control.commandKind) { ... }
      return { valid: diagnostics.length === 0, ... };
```

它不读 camera algorithm 是否真有 Director 分支，不读 relationship 运行时是否存在。catalog 把 `velocity-chase` / seat / tether 标成 `implemented` 时，这个 API 仍 `valid: true`。Agent 会把它当「包已闭合」的权威。

### P1-5. 高度采样双线性 ≠ 三角网格（Layout / outdoor 门禁 vs 脚下物理面）

三处权威地面高度不是同一个函数：

| 路径 | 插值 | 用途 |
|---|---|---|
| outdoor `Heightfield.sampleHeight`（`packages/world/src/terrain.ts:512-524`） | 四角双线性 | spawn / 坡度门禁 |
| outdoor `toGeometryData`（同文件 `:562-569`） | `TL–BL–TR` / `TR–BL–BR` 三角 | 渲染与 Rapier |
| Layout `sampleHeightfieldV1`（`layout-solver/src/geometry.ts:185-213`） | 双线性 + `quantizeFinite(..., 1e-6)` | `supported-by` / `within-slope-limit` / 物体落点 |
| Compiler / Babylon `sampleTerrainHeight`（`compile.ts:82-119`、`runtime-babylon/src/terrain.ts:84-106`） | `tx+tz<=1` 对角线三角，无量化 | Subject spawn Y、Havok 面对齐的采样 |

鞍形格（对角高低对调）时，格心附近双线性与三角面可以差一米以上。后果：Layout 断言「贴地 / 坡度合格」，Subject 按三角面再采样（再叠加全量审计 P0 的 Y 双重计数）；outdoor spawn 判定走双线性，脚下落在三角面上。`scenes.test.ts` 只在 spawn 点 `toBeCloseTo(..., 2)`，盖不住鞍形格。

Babylon **Mesh 与 Havok 共用同一份 `heightSamplesMeters`**（方阵 remap，矩形 `PhysicsShapeMesh`）。那不是双真相。双真相在「门禁采样函数」和「网格面」之间。

### P1-6. Opening composition 能算 `pass: false`，但 `verified` / Studio ready / 写盘都不读它

判定函数本身是对的：`pass = score ≥ minimumScore ∧ 每个 region ∧ 每个 anchor`（`sdk-world-adapter.ts:904-906`）。断的是**后续阶段不消费这个结果**。

- `scripts/scenes/export-scene-plan.ts:105-123`：`plan:scene` 只校验 plan-lock + 编译产物，就把 `workflowStage: "verified"` 写进 `manifest.json`。
- `scripts/visual/validate-visual-package.ts`：只核 lock/hash 与样式图，不读 composition report。
- 手工「构图」按钮只在 `report?.pass` 时导出（`main.ts:1217-1220`）；Studio 用的 `captureArtifacts=1` **无论 pass 与否**都 `exportOpeningFrame`（`main.ts:1235-1236`）。
- Vite `/__whitebox/write-opening-frame`（`vite.config.mjs:160-178`）只检查 report 字段类型，**不拒绝 `pass: false`，也不在服务端重算门禁**。客户端可 POST `pass: true`。

仓库反例：`apps/playground/public/scene-plans/world-08170639-54db/opening-composition-report.json` 为 `pass: false`（score 0.17 < 0.62），同时 `artifacts/scenes/world-08170639-54db/manifest.json` 仍是 `"verified"`。参考图场景可以构图失败却当验收完成。

### P1-7. Resource Lock 钉不住 Layout Solver Profile

`ResolvedResourceKindV1`（`packages/authoring/src/types.ts:493-513`）没有 `layout-solver-profile`。`ResourceLockBuilderV1` 只收 Subject/Capability 资源。

Layout 把 `registryLockHash` 设成 subject 的 `resourceLockHash`，solver profile 的 `contentHash` 只写在旁边的 `solverProfile` 对象里（`layout-input.ts:397-402`）。Profile 本体是包内写死的 `outdoor.s1@1`（`layout-solver/src/profile-registry.ts`）。

设计合同是 Lock 钉死 Profile。现状：同 Spec + 同（残缺）Lock + 同 Seed，只要 built-in profile 字节变了，IR / `layoutSolveReportHash` 会变，Lock 无法报 `SUBJECT_RESOURCE_LOCK_CONFLICT`。同类：`spatial.routes[].locomotionProfileRef` 进 IR 字符串，normalize **从不 resolve/lock**。

---

## 门禁对照 ValidationReport：A / B / C

设计要求版本化 Profile、Blocking/Advisory 分列、截图不能当权威、缺指标 = `incomplete`。现状全部是 ad-hoc 脚本 + `examples/evidence/**/verification.json`。这本身是 **C（协议缺口）**，backlog 已写明未冻结。

在 C 成立的前提下，现有脚本仍分好坏：

### A. 诚实的切片门禁（保留）

| 门禁 | 为什么算诚实 |
|---|---|
| `verify:canonical` 的严格 parse、重复键拒绝、IR/Plan 哈希、Browser `ready()` + `runFixedInput` | 测的是当前切片真正承诺的东西 |
| `verify:rigged-subject` Golden 单 mesh / 4 clip | 覆盖 Golden 产品，不假装覆盖 Mixamo |
| outdoor 构图 **判定函数** | `score >= minimumScore` **并且** 每个 region/anchor 都过（`sdk-world-adapter.ts:904-906`）。总分不能盖掉必需区域。函数本身符合 AGENTS.md；**发布路径不读结果**，见 P1-6 |
| Layout `solve` 退出码 3/4/5 | Required 不可满足 / 预算耗尽 / 制品发布失败，与 quickstart 表一致 |
| Compiler `COMPILER_LAYOUT_HEIGHTFIELD_MISMATCH` | Layout 高度场 hash 必须等于 Compiler 自采样 hash，双份噪声若分叉会**硬失败** |
| Compiler `COMPILER_NORMALIZED_HASH_MISMATCH` | 调用方声称的 IR hash 必须等于 `sha256CanonicalJson(ir)` |
| Resource Lock 对 V3 包会锁 motion/camera/medium/kernel 等（`subject-definition-normalizer.ts:261-274`） | 能力资源进 lock，不是只锁 GLB |

### B. 假绿（掩盖已确认 P0/P1）

| 门禁 | 掩盖什么 |
|---|---|
| `verify-placement-layout.ts:301-305` 断言 player origin ≡ spawn transform | 样例 `relief: "flat"` + `baseHeightMeters: 0`，`0+0` 把 spawn Y 双重计数测成绿 |
| `verify:g-bot-subject` 绑 `humanoid.g-bot@1` | 不打 playground 推荐的 `.ground@1`；`.ground` 缺 `hand.right` 不会红 |
| `g-bot-evidence` 只核 `meshCount` / 三角数 | `verification.json` 里 `meshCount: 2` 是绿的。`Beta_Joints` 当正式网格不会红 |
| G Bot `poseGate.minimumDifferenceRatio: 0.12` | 测的是剪影像素差，joints cage 一直在画面里也能过 |
| `verify:canonical` 的 PNG | 证明「能截到非纯色图」，不证明 spawn 贴地、朝向、或网格身份 |
| Playground overlay 无测试 | 同一 JSON，UI 改 spawn/预算，CLI 不改；`verify:*` 走 CLI |
| G Bot / Golden isolation 断言非受控主体位置**不变** | 测的是双主体隔离，不是贴地。全仓 verify **不断言** `positionMetersXYZ[1]` vs 地形 / support gap。悬空已修，但这条回归仍没进门禁；spawn Y 双重计数也测不到 |
| `verify-placement-layout.ts:323-326` 把 `lighthouse-visible` 的 `visibleRatio >= 0.45`、`projectedAreaRatio >= 0.02` 写成硬断言 | Authoring 里这条是 **preferred**（`minimumVisibleRatio: 0.4`、`minimumProjectedAreaRatio: 0.001`）。脚本把 preferred 升格成阻断，阈值还不在 Profile |
| `plan:scene` → `workflowStage: "verified"` | 构图 `pass: false` 的参考图场景仍 verified，见 P1-6 |
| Pose 剪影差 `>= 0.12/0.15` 当 blocking | 设计：视觉第一阶段只能 advisory。剪影够大就绿，不证明支撑/身份 |

这些脚本作为回归网仍然有价值。问题是它们被说成「产品门禁已过」时，会把已知语义错误冻成契约。

### C. 协议缺口（不是脚本写错）

- 没有 `ValidationProfile` Ref、没有 Blocking/Advisory 分列、没有 `incomplete` 状态。
- `verification.json` 的 `kind` 是 `worldkit-g-bot-subject-verification` 等专用形状，阈值写死在脚本里。
- 截图 sha256 进了 verification，但没有 WorldPackage Root Hash（Package 还不存在）；有 IR/Plan hash 绑定，这一步比「裸 PNG」好。
- Playwright Driver 等 `__WORLDKIT__` + `ready()`，Canonical 捕获路径不用 `waitForTimeout`。outdoor `captureArtifacts` 除外。

---

## 确定性 / Hash / Lock

### 做对的部分

- `parseCanonicalJson` 禁注释、禁尾逗号、查重复键、8MB 上限（`packages/authoring/src/parse.ts`）。
- Authoring Spec V3 schema 顶层和绝大多数 object 都是 `additionalProperties: false`。
- Canonicalize：按 key 排序、丢 `undefined`、拒绝非有限数、`-0` → `0`（`packages/protocol/src/canonical-json.ts`）。
- IR hash 与调用方声明比对；ExecutionPlan 写入 `normalizedWorldIrHash`。
- V3 Subject 的 capability 资源进入 Resource Lock，并校验 registry `contentHash`。
- Layout 与 Compiler 的 fractal noise **当前算法同构**（同一 `lattice` 常量、同一 octave 循环）。有 layout 时用 hash 对拍，分叉会抛 `COMPILER_LAYOUT_HEIGHTFIELD_MISMATCH`。

### P2 确定性/Schema 洞

1. **`canonicalize` 把 `Map` / `Date` / 非 Array 的 TypedArray 收成普通 object。** `Map` 的 `Object.keys` 为空，哈希等于 `{}`，不抛。JSON.parse 路径进不来这些类型；若有人把运行时 Map 送进 `sha256CanonicalJson`，会静默得到空对象哈希。应拒绝非 plain object（`Object.getPrototypeOf !== Object.prototype`）。
2. **没有浮点量化。** 同进程 JS number → `JSON.stringify` 是稳定的；跨语言/跨 IEEE 舍入没有 profile。当前切片可接受。
3. **双份 noise 实现**（`layout-input.ts` vs `compiler/src/noise.ts`）仍是漂移面。门禁能抓分叉，修的时候必须两处一起改，或抽成单模块。
4. **Plan lock 的 `specSha256` 用 `JSON.stringify(spec)`，文件条目用 node `crypto` hex，Canonical 资源用 `sha256:` + noble。** 三种哈希方言。`specSha256` 不排序 key，依赖 WorldSpec 对象插入序（`scripts/lib/plan-lock.ts:111`）。
5. **`requirementWeight` `$def` 自身没有 `additionalProperties: false`**，靠父约束 object 关掉。AJV `allOf` 下这通常仍拒绝未知键，但是嵌套洞，值得补显式 false。
6. **CLI `--json` 成功体没有 `protocolVersion` / `sdkVersion` / `specVersion` / `command`。** 总规格 §16.2 要求；quickstart 没要求。`worldkit-registry-list` 是 `schemaVersion: 1`，`worldkit-build-artifact` 是 `schemaVersion: 3`。
7. **几乎所有非 layout 失败都是 exit 2。** 总规格 2–8 的细分没有落地。Layout 是例外。
8. **`package://subject-definition/...` vs `worldkit://subject-definition/...`。** `verify-canonical-world.ts` 用 `package://`；Registry 用 `worldkit://`。全量审计已记方言；Agent 复制 example 会混 scheme。

Seed：Layout 高度场和 Compiler 地形都用 `world.seed` / `normalized.seed`，不是「声明了 seed 却不用」。**Solver 搜索本身不用 seed 做 RNG**（candidate 生成无打乱）。平坦地形改 seed：placement 可不变，但 report/IR hash 仍变（seed 字段进了 hash）。这是身份绑定，不是「用了两次还不一样」。

IR hash vs Plan hash：Compiler 先 `sha256CanonicalJson(world)` 校验，再把已校验的 `normalizedWorldIrHash` 嵌入 plan。未发现「校验用 A、入 plan 用 B」的窗口。

Layout Solver Profile 不进 Resource Lock：见 P1-7。

---

## 地形双管线

两条产品，不是同一 heightfield 的两个 bug：

| | Outdoor（`packages/world` + Three/Rapier） | Canonical（Compiler + `runtime-babylon/src/terrain.ts`） |
|---|---|---|
| 输入 | `landscape` / `rolling` / `custom` + `context.terrain.raster` + `semantic.terrainLayer` | Authoring procedural noise 单格 |
| 碰撞 | Rapier heightfield，有 z-major→column-major 测试 | 方形走 Havok heightfield remap；非方走 `PhysicsShapeMesh` |
| 水域 | 视觉 mesh，无泳介质 | 语义体积 + 弱重力；mediumProfile 仍不读（全量审计） |
| 分块 | 大地图可 tiled | 单 grid |
| Elevation Band 图 | 无 | 无（地形专项未建） |

**不是 P0 Mesh/Havok 错位：** Babylon 方形 remap 有注释和测试；Mesh 与 Havok 共用 `heightSamplesMeters`。Outdoor Mesh 与 Rapier 也共用同一份 `heights`。

**本层 P1：** spawn∩水见 P1-2；双线性 vs 三角面见 P1-5。

**P2：** Authoring/Execution 叫 `resolutionCellsXZ`，Layout 叫 `resolutionVerticesXZ`。Canonical 水域**不改写高度场**，`shoreWidthMeters` / `depthMeters` 只当元数据（outdoor `carveBasin` 才会挖湖床）。Semantic `terrainLayer` 在 outdoor 只做顶点色，不进碰撞；Canonical 无对应 IR。Outdoor 主路线实测坡度只在 planning artifacts 里 warn，不进 `compileOutdoorScene`。

**P3 / 能力缺口：** Elevation Band、`height-raster@1`、分块 Compiler、图像引导高度重建。不要在 Canonical 里假装 raster 已经接线。

---

## Plan-first / Studio / Capture / Director

### Plan lock

- 冻结的是 plan 源 TS、参考图、world-plan/opening-shot PNG（`scripts/lib/plan-lock.ts`）。
- `pnpm plan:check` 按当前源码重算 lock，和文件字节对比。源漂了会红。
- **不是签名。** 任何人可跑 `pnpm plan:freeze` 覆写 `plan-lock.json`。这是本机 trusted host 约定，不是出版本真实性。
- Builder 场景实现文件不进 lock（设计如此：Builder 允许写 `scenes/<id>.ts`，不许改计划源和两张规划图）。
- `scripts/agents/run-scene-agent.sh` 用路径 allowlist 限制 Builder / Visual Bible 可写文件。绕过脚本直接改文件，lock 管不到实现几何——实现几何本来就不在 lock 里。Visual Bible 改白膜几何，要靠流程/人工，没有编译期几何哈希。

### 构图门禁

判定函数：总分不能覆盖失败的 required region/anchor（见分类 A）。**发布函数不管判定**：见 P1-6。Canonical Babylon adapter 的 `analyzeOpeningComposition()` 返回 `null`——authoring 世界没有这道构图 Gate。

### Studio

`apps/studio` 是本机 Codex 编排入口（`docs/15-creator-studio.md`），不是 Canonical 运行时，也不是 architecture 真值。它代理 Playground。不要把 Studio UI 状态当成 ExecutionPlan。

Studio 在 `plan:scene` exit 0 后标 `ready`，构图失败只提示「构图待调整」，不降级 status。和 P1-6 是同一条产品谎言。

`apps/studio/src/server.mjs:96` 有 `image == null`（用户规则要求 `===` / `isNil`），属旧栈纪律，不是 Canonical 协议洞。

`agent:visual` 白名单能挡住 Agent 改场景几何；`visual:finalize` 不比对白膜场景源哈希。人绕过 launcher 改 `scenes/*.ts` 再 finalize，校验仍可能过（P3 宿主外路径）。

### Director

`docs/09-runtime-world-director.md` 明确「当前仓库没有接入代码」。不要把 `CameraDirectorV1`（镜头算法）和 Runtime World Director（LLM 世界操作）当成同一个东西。

### Capture 与引擎句柄

Browser/CLI 快照类型在 `runtime-contracts`：位置、速度、medium、actionId、hash。**没有**把 Mesh/Havok **句柄**编进 Snapshot。`resources.meshes` / `resources.bodies` 是 `scene.meshes.length` 和 Havok body 计数（`babylon-world-runtime.ts:804-807`）——引擎方言泄漏到 AI 面，但是计数不是 handle。标 P2，不要写成「句柄泄漏」。

`ControlBindingReceiptV2` 没有总规格 §16.3 要求的 `acceptedTick` / `effectiveTick` / `sessionId` / `requestId`。当前 V3 切片用 `expectedControlledEntityId` 做 CAS，quickstart 已描述。标 P2 协议不完整，不要补一堆未接线字段假装 Session 已存在。

---

## CLI / Browser 方言速查

| 主题 | 现状 |
|---|---|
| 全局名 | `__WORLDKIT__`（V3），不是 `__WORLDKIT_DRIVER__` |
| Browser 核心方法 | `ready` / `getSnapshot` / `getDiagnostics` / `bindControl` / `runFixedInput` / `captureScreenshot` / `reset` / `setPaused` |
| Browser 扩展方法 | 相机/运动调参、`runHarness`、发现 API；不可枚举；无 Session Scope |
| 固定输入 | `move-forward` 等 + `ticks`；不是 `durationTicks` Intent 联合 |
| `run` | 起 Vite Playground，第一个 JSON 是 `{ ok, url, port }`，没有 Session ID |
| `build` | 单文件 artifact，禁止覆盖输入；原子 tmp+rename |
| 服务器就绪 | HEAD 轮询 `/__worldkit/authoring-spec` + nonce，50ms delay，不是 `sleep` 固定拍世界 |

---

## 不是缺陷

- 用 quickstart 子集而不是一次实现总规格全部 CLI。
- ValidationReport 未落地：专项未冻结，backlog 已记账。
- Layout 高度场与 Compiler 噪声对拍失败即抛：这是保护，不是重复计算 bug。
- outdoor 构图要求 region+anchor 全过：符合「总分不得覆盖必需区域」。
- Canonical 捕获路径等 `ready()` 而不是 `waitForTimeout`（outdoor `captureArtifacts` 除外）。
- Resource Lock 校验 registry contentHash、V3 锁 capability 资源。
- Snapshot / Diagnostic 不含引擎 **句柄**（有 mesh/body 计数，见上）。
- `relationships` / `rules` 非空即报 unsupported。
- Studio 不是 Canonical 真值源。

---

## 建议落地顺序（本层）

不要在 ValidationReport / WorldPackage / Take 上铺开。先让现有切片不再撒谎：

1. 发现面合一：CLI list 与 Browser list 输出同一组对外 `subjectDefinitionRef`（先修双 G Bot，再谈 API）。
2. `plan:scene` / `visual:inputs` / `write-opening-frame`：带 `composition.guide` 的场景必须磁盘上 `pass === true`（服务端重算，不信客户端布尔）；失败不得写 `verified`。
3. Placement verify 加非 flat / 非零 `baseHeightMeters`；Layout 与 Compiler 统一三角采样（或门禁按三角面采样）。
4. G Bot evidence 锁网格名；verify 打实际游玩的 Definition。
5. Canonical spawn ∩ 水/地标：编译失败；`blocked` 水要么有碰撞要么不要这个 mode。
6. Layout Solver Profile 进 Resource Lock；`canonicalize` 拒绝非 plain JSON 值。
7. Capture：去掉 outdoor `sleep(900)`；至少把 PNG 绑定 tick + IR/Plan hash。
8. 再谈 WorldPackage 目录、ValidationProfile、五 Pass Bundle。

## 验证

本层是只读审计，没有改代码。复核时至少：

```bash
# 发现面
pnpm worldkit registry list --kind subject-definition --json
# 对比 Browser listSubjectDefinitions()（?authoring=1）是否含 humanoid.g-bot@1

# 门禁假绿
pnpm verify:placement-layout   # 当前绿；换成非零地形高应暴露 P0
pnpm verify:g-bot-subject      # 当前绿；meshCount=2

# 构图未阻断 verified
# apps/playground/public/scene-plans/world-08170639-54db/opening-composition-report.json
#   pass: false
# artifacts/scenes/world-08170639-54db/manifest.json
#   workflowStage: "verified"
```

---

## Disposition（2026-08-21）

本节追加当前实现结论，保留上面的原始审查作为历史证据。最终实现范围 `15e2add..5fb8a43` 已通过独立全分支复审，结论为 **CLEAN，在本轮承诺范围内无未关闭的 P0–P2**；未纳入本轮范围的协议能力仍明确延期。

| 原 finding | 状态 | 当前结论 |
|---|---|---|
| P1-1 CLI / Browser G Bot 发现面分叉 | **已修复**（`74a90e3`） | 两端对产品 G Bot 暴露同一 canonical Ref 与 content hash；legacy V2 `listResources()` 仍保持可重建闭包，不把 V3 capability 依赖伪装成 V2 资源。更广泛的 discovery API 仍按版本分层。 |
| P1-2 spawn ∩ blocked water / landmark | **已修复**（`6825733`、`03782db`、`5fb8a43`） | Compiler 与 legacy World 复用 Testkit 的 3D capsule/footprint 相交 authority；覆盖中心在外但半径相交、非均匀 primitive 长轴，且不误拒水面上方或顶面接触。 |
| P1-3 Capture 缺少 ViewReceipt | **延期** | 当前 canonical capture 已绑定 fixed tick、IR/Plan hash 与确定性证据，但正式 ViewReceipt/Session/Take 协议尚未冻结，不在本轮补空字段。 |
| P1-4 package validation 假放行 | **当前 Catalog 已修复**（`6825733`、`03782db`） | Browser/Authoring/Compiler 共同检查实际依赖；reserved mount/seat/tether 不能进入 Plan；已实现 kernels 保留真实 Runtime 覆盖。 |
| P1-5 双线性高度 ≠ 三角物理面 | **已修复**（`374fdc1`、`466ccc9`） | 新的 `@whitebox-world/terrain-surface` 是 Layout/Compiler/Babylon/legacy World 的共享三角面 sampler；非平地 artifacts/verifier 已迁移。 |
| P1-6 构图失败仍 verified | **已修复**（`6825733`、`03782db`、`5fb8a43`） | `referenceImages` 或 `composition.guide` 均要求 Host 从 metrics 重算、绑定 scene/spec/plan-lock identity 的 passing report；promotion 事务写入。Guide-only 也不能绕过 Visual inputs/finalize。 |
| P1-7 Solver Profile 未进 Resource Lock | **延期** | 需要先冻结 Solver Profile 的 Registry 资源模型和版本迁移；本轮不把本地实现参数伪装成已锁资源。 |

### 确定性与协议边界

- Canonical JSON 现在拒绝所有非普通 JSON 运行形状，包括非 plain prototype、容器/类实例、symbol keys、Array subclass、稀疏 Array 和 Array 额外 own keys；合法 `__proto__` 数据键使用安全排序重建，避免 hash collision。
- Authoring 严格解析仍由 `jsonc-parser` 提供重复键/语法诊断，通过后 materialize 为 native plain JSON，保证 Parser 与 Canonical Hasher 的输入契约一致。
- `hostOverlay` 明确记录 Playground capability demo 的主体替换、资源预算与 spawn 调整；它不写回输入，也不进入 Canonical Authoring Schema。成功和失败结果都可观测。
- Composition lifecycle 使用单一 `requiresCompositionPromotion(spec)` authority。无 reference/guide 的 planning-only 场景可保持 `verified`；有视觉构图约束的场景必须经可信 Host 晋升。
- Studio 仍是编排入口，不是 Canonical 真值；正式 ValidationReport/WorldPackage/Take/ViewReceipt/Session Scope 仍是后续协议切片。
- Outdoor capture 中剩余的定时策略、完整五 Pass Bundle、Solver Profile Lock 属于延期能力，未被本轮门禁结果冒充为已完成。

### 复核证据

`pnpm typecheck`、`pnpm test`（571/571）、`pnpm test:scenes`（26/26）、`pnpm build`、四个 conformance verifier、三个 `plan:scene:check` 全部通过。最终全分支对抗性复审又独立运行 117 个 focused tests、类型检查、场景测试与三个 plan checks，结果 CLEAN，且无 Artifact 或进程残留。
