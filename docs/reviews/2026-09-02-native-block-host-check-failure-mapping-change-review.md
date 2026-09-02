# Native Block Host check 失败码映射变更审查

## 1. 审查元数据

- 审查模式：**B 变更审查**（PR / 分支 diff）。必查维度 D2、D3、D4、D5、D6。
- 本 diff 修改 Native Scene Candidate admission 的 **build() 诊断映射**，以及 Host check /
  Package / Skill 的失败路径测试。**不修改** Runtime、Havok、Character、Camera、Input、固定
  Tick 或 Browser Protocol V5。因此完整执行 `runtime-deep-review-checklist.md` 的 authority map、
  诊断穿透与证据分层；运动 / 支撑查询 / 相机 / 回放条目标为不适用。
- 审查对象：PR [#166](https://github.com/seedleap/agent-whitebox-world-sdk/pull/166)，
  产品树 `13bc2b1338d3fb4c640422e5a48239511378a8a4`
  （`cursor/native-block-host-check-tests-120f`）。
- Diff 基线：`origin/main@368272a9f4d6d8c1fdddef618dea24f6b799cd21`。
  `origin/main...HEAD` 为 5 files, +366 / -14。本审查冻结该产品 SHA；若随后只追加本报告，
  新 SHA 是文档-only，不使本表 focused 证据失效。产品修复会使本表 P1 需要在新 SHA 上复验。
- 上位权威：`AGENTS.md`、
  [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)、
  [ADR-0007](../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)、
  [Native 长期设计](../superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)、
  [Block Profile 设计](../superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)、
  [Drawing API 设计](../superpowers/specs/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md)。
- 安装引擎：`@babylonjs/core@9.23.0`（本审查 `node -e` 读取 `node_modules/@babylonjs/core/package.json`）。
  映射器本身是字符串级 Host adapter，不依赖 Babylon mesh / Euler 语义。Host check 回归通过既有
  Candidate / NullEngine 工厂走到真实 Session；不以训练记忆断言引擎行为。
- 证据层级：`static-read` + `automated-contract`。无 `rendered-visual`、无 `manual-interaction`。
  本切片不声明人物通过性、Route、Capture 生产、NBR-20/70 或 BNA-6/7 完成。

### 1.1 命令与结果

本审查在产品树 `13bc2b13`、clean worktree 上亲自执行下列命令。同 SHA 上较早的 focused Vitest /
`pnpm typecheck` 由同一代理会话留下，且此后产品树未改，按协议复用。

| 树 | 命令 | Exit | 证明范围 / 不覆盖范围 |
|---|---|---:|---|
| `13bc2b13` | `git rev-parse HEAD` | 0 | 冻结产品 SHA |
| `13bc2b13` | `git diff --check origin/main...HEAD` | 0 | whitespace；不证明行为 |
| `13bc2b13` | `git status --short` | 0 | 审查开始时 tracked 树干净 |
| `13bc2b13` | `node -e "require('@babylonjs/core/package.json').version"` | 0 | 打印 `9.23.0` |
| `13bc2b13` | `pnpm verify:workspace-boundaries` | **2** | 根 `pnpm test` 的第一道门。打印 `WORKSPACE_PRIVATE_SIBLING_SOURCE: scripts/agents/native-block-builder-skill.test.ts -> ../../packages/native-babylon-block-profile/src/shapes.js` |
| `13bc2b13` | Cloud tracked CI `33630781140` | **failure** | Typecheck / Studio / independent 成功；`pnpm test` 在 workspace-boundaries 失败；Playground build 被跳过。URL：https://github.com/seedleap/agent-whitebox-world-sdk/actions/runs/33630781140 |
| `13bc2b13` | `pnpm typecheck`（同树复用） | 0 | TypeScript；不证明 Runtime 或根 Vitest |
| `13bc2b13` | `pnpm exec vitest run packages/native-babylon/src/candidate-admission.test.ts`（同树复用） | 0 | 53 passed。合同层：发布 `OCCUPANCY_OVERLAP`、standard Profile 保持不透明、path/stack/`Error:` 包装保持 `MODULE_BUILD_FAILED` |
| `13bc2b13` | `pnpm exec vitest run scripts/native-scene/native-scene-check.test.ts`（同树复用，单文件） | 0 | 18 passed。真实 Session 经 Host check：Grid 通过、缺子 ID / overlap / off-grid `step` |
| `13bc2b13` | `pnpm exec vitest run scripts/reconstruction/native-package.test.ts`（同树复用，单文件） | 0 | 7 passed。`blockId: "foreground"` → `native-check-rejected` + `COLLIDER_BLOCK_MISSING`，无 Package |
| `13bc2b13` | `pnpm exec vitest run scripts/agents/native-block-builder-skill.test.ts`（同树复用） | 0 | 23 passed。Vitest 单独跑可以通过；**不能**证明根 `pnpm test` |
| `13bc2b13` | `pnpm exec vitest run packages/native-babylon/src/authority-audit.test.ts packages/native-babylon/src/runtime-replay.test.ts`（同树复用） | 0 | 228 passed。admission 邻域未把 audit/replay 打成第二套失败码 |

未跑及原因：

| Lane | 原因 |
|---|---|
| 根 `pnpm test` | 第一道 `verify:workspace-boundaries` 已在本审查失败（exit 2）。继续跑 contract / resource-heavy 不能改变该 P1。 |
| `pnpm build` | tracked CI 因 `pnpm test` 失败而跳过；本审查不把 skipped build 记成通过。 |
| `pnpm test:studio` / `pnpm test:independent` | Cloud CI 同 SHA 已通过；本 diff 不改那些入口。本审查不重跑。 |
| Browser verifier / rendered visual / manual interaction | 本切片不声明生产 Capture、手感或像素还原。 |
| WRC-API-90 / NBR-20/70 | 仍开放；本审查不是 Cloud full-gate receipt，也不是真实 Codex 生成或可玩性证据。 |

审查命令只读。未运行会改写 tracked 文件的 producer。审查开始时 `git status --short` 为空。

注意：`native-scene-check.test.ts` 与 `native-package.test.ts` 同属 resource-heavy lane
（`fileParallelism: false`，`maxWorkers: 1`）。在默认 Vitest worker 下并行跑这两个文件会出现
`.codex-tmp/native-scene-check/run-*` 残留 flake。这是 focused 命令陷阱，不是根 `pnpm test`
的预期路径；本审查不把它升为对本 diff 的缺陷。

### 1.2 资源与状态权威

| 状态 / 资源 | 唯一权威 | 本切片后的消费者 |
|---|---|---|
| 公共 Native check 诊断码 | Candidate admission：`publishedNativeBlockBuildFailure()` 或 opaque `MODULE_BUILD_FAILED` | Host check JSON、Package `native-check-rejected` |
| Block occupancy / ID / lattice / Collider 选择失败 | Profile Session / collider / visual 的 `fail()` → `TypeError(\`${code}: ${message}\`)` | 仅当 bootstrap 是 `whitebox.blocks@1`、单行、无 stack/path/`Error:` 时由 Host 发布 |
| standard Profile `build()` 异常 | 仍全部不透明为 `WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED` | 公共诊断不得出现 `WORLDKIT_NATIVE_BLOCK_*` |
| `build()` 期间 authority-audit 失败 | audit 诊断 + 强制 opaque module-build 诊断 | 不走 Block 码映射 |
| Profile 包边界 | `native-babylon` **不得** import `@whitebox-world/native-babylon-block-profile` | 字符串正则是 adapter，不是第二份 parser 方言 |
| Havok support / Camera / Tick / Subject | 既有 SDK owners | 本 diff 为 0 |

## 2. 旧结论复验

线索：[`2026-09-02-agent-friendly-babylon-native-block-drawing-api-change-review.md`](2026-09-02-agent-friendly-babylon-native-block-drawing-api-change-review.md)
（产品树 `50a6644a`，已合入 `main`）。该审查**没有**覆盖 Candidate admission 对 Profile `build()`
异常的映射。引用前已在 `13bc2b13` 复验。

| 既有结论 | 当前裁决 |
|---|---|
| Drawing API 审查：无开放产品 P0；不勾 WRC-API-90；不完成 NBR-20/70、BNA-6/7、WRC-1 | **已复验，成立。** 本 PR 正文也明确不完成那些项。`docs/18` 的 WRC-API-90 / NBR-20 / NBR-70 仍是未勾选。 |
| Drawing API 审查：Host 拥有 Check / Package / Receipt；Profile 只抛 Session 合同 | **已复验，成立。** 本切片没有让 Profile 写 Native check JSON。Host 仍是唯一公共诊断发布者。 |
| Drawing API 前：Profile `build()` 抛错一律变成 `MODULE_BUILD_FAILED`（「raw provider errors are not public diagnostics」） | **部分失效（有意收窄）。** `whitebox.blocks@1` 上单行 `WORLDKIT_NATIVE_BLOCK_*` TypeError 现在发布为公共码；stack、路径、`Error:` 包装、standard Profile、audit 伴随失败仍不透明。这是本 PR 的产品行为，不是回归。 |
| Drawing API 审查 P2：诊断质量 / Grid 文案 | **仍成立、本 diff 未修。** 本切片把 Profile 码送进 `NativeSceneDiagnosticV1`，但 `location` 仍是 `{ kind: "none" }`，repairHint 是一句通用 Host 文案。见本报告 P2。 |
| Foundation：Profile 不是第三条 Scene Source；不从颜色 / 材质 / 名推断 physics | **已复验，成立。** 映射只看 bootstrap profileRef + 异常 message，不读 Mesh 名或 palette。 |

`docs/18` 的 Drawing API P1 措辞问题属于 #162 合入后的 live-status 债，**不是本 diff 引入**，本审查不重复开单。

## 3. Findings

无 P0。

### [P1] [D3/D5/D6] Skill 测试深导入包私有源，根 `pnpm test` 与 tracked CI 无法起步

- 证据（static-read + automated-contract）：
  `scripts/agents/native-block-builder-skill.test.ts` 相对导入
  `../../packages/native-babylon-block-profile/src/shapes.js`，调用未出现在包根
  `Object.keys` 锁里的 `babylonNativeBlockCenterAlignsToGridV1` /
  `babylonNativeBlockOccupiedMicroCellKeysV1`
  （`9:12:scripts/agents/native-block-builder-skill.test.ts`，
  `175:195:packages/native-babylon-block-profile/src/package-boundary.test.ts`）。
  根 `pnpm test` 的第一句是 `pnpm verify:workspace-boundaries`。本审查在 `13bc2b13` 上亲自执行，
  exit **2**，stderr：
  `WORKSPACE_PRIVATE_SIBLING_SOURCE: scripts/agents/native-block-builder-skill.test.ts -> ../../packages/native-babylon-block-profile/src/shapes.js`。
  扫描器把相对路径跨包源码视为冻结边界
  （`350:363:scripts/lib/workspace-boundary.ts`）；removalGate 写明应改成
  「explicitly exported public or testing subpath」。
  同 SHA Cloud CI `33630781140`：Typecheck 已绿（`.ts` → `.js` 修复有效），随后
  「Run full Vitest suite」在同一条 boundary 上失败，Playground build 被跳过。
  单独 `vitest run scripts/agents/native-block-builder-skill.test.ts` 在 `13bc2b13` 上 23 passed，
  所以 focused 绿不能冒充根门禁。
  同包已有合法先例：`scripts/verification/bwb5-block-reconstruction-corpus.test.ts` 从
  `@whitebox-world/native-babylon-block-profile/testing` 导入。
- 期望：新增测试必须能被根 `pnpm test` / tracked CI 执行。脚本不得相对导入另一 workspace 包的
  `src/`。格子数学要么走 `./testing` 子路径，要么留在 `packages/native-babylon-block-profile`
  自己的测试里。不得把 helper 塞进根公共 `Object.keys` 锁，除非有意扩展 AI-facing API。
- 影响：PR #166 在 `13bc2b13` 上 **不能合入**。Host check / Package / admission 合同测试从未在
  根聚合门禁里跑过。执行者若只看 focused Vitest 会误以为「测试没问题」。
- 建议：删除相对 `src/shapes.js` 导入。把两个格子 helper re-export 到
  `packages/native-babylon-block-profile/src/testing.ts`，Skill 测试改为
  `@whitebox-world/native-babylon-block-profile/testing`，并更新 testing 子路径的
  `Object.keys` 锁。不要为了过门禁把这两个函数放到包根出口。不要登记 workspace-boundary debt。
- 复核：已被后续提交 `43889d2c` 复核确认（见 §6）

### [P2] [D2] Candidate admission 重复硬编码 Block Profile Ref

- 证据（static-read）：
  `candidate-admission.ts` 定义
  `WHITEBOX_BLOCKS_NATIVE_SCENE_PROFILE_REF_V1 = "worldkit://native-scene-profile/whitebox.blocks@1"`
  （`366:367:packages/native-babylon/src/candidate-admission.ts`）。
  同一包的 `profile-settlement.ts` 已经从 `@whitebox-world/runtime-contracts` 导入
  `BABYLON_NATIVE_BLOCK_PROFILE_REF_V1`
  （`5:8:packages/native-babylon/src/profile-settlement.ts`，
  `12:13:packages/runtime-contracts/src/native-scene-contribution.ts`）。
  `candidate-admission.ts` 已经依赖 `runtime-contracts`，只需在现有 import 列表加上该常量。
- 期望：一个概念一个词。Profile Ref 的权威名字是 `BABYLON_NATIVE_BLOCK_PROFILE_REF_V1`。
- 影响：两处字符串日后漂移时，映射会在错误的 Profile 上发布或漏发 Block 码。当前两处字面值相同，
  不是静默行为错误。
- 建议：删除本地常量，改用 `BABYLON_NATIVE_BLOCK_PROFILE_REF_V1`。不要在 `native-babylon`
  再复制一份 Block Profile 包内的同名 re-export。
- 复核：已被后续提交 `c8ebccd2` 复核确认（见 §7）

### [P2] [D5] Host 用正则解析 Profile `TypeError` 方言，格式一变就静默退回 opaque

- 证据（static-read）：
  Profile `fail()` 是 `throw new TypeError(\`${code}: ${message}\`)`
  （`135:136:packages/native-babylon-block-profile/src/session.ts`，
  collider / visual / profile-settlement 同构）。
  Host 用 `^(WORLDKIT_NATIVE_BLOCK_[A-Z0-9_]+): ([^\n]+)$` 匹配，并拒绝换行、
  `at fn (` stack、`Error:`、以及 detail 中的 `/` `\`
  （`368:413:packages/native-babylon/src/candidate-admission.ts`）。
  `native-babylon` 不 import 该 Profile 包（本审查 grep 无命中），所以不能改成 typed
  `instanceof` 而不破坏包边界。这是可接受的 adapter，但仍是未版本化的字符串合同。
- 期望：包边界要求 Host 不得依赖 Profile 运行时类型。字符串方言应在一处写明，或在 Profile
  测试里锁 `fail()` 格式，使格式变化变成 RED。
- 影响：以后有人把 `fail()` 改成 `code + " — " + message`、多行、或带 `worldkit://.../` URI，
  Host check 会回到 `MODULE_BUILD_FAILED`，本 PR 新增的合同测试会红，但生产模块若未覆盖该码
  会静默变 opaque。
- 建议：保持字符串 adapter。可在 Profile `session.test.ts` 锁 `error.message` 单行且无 `/`。
  不要让 `native-babylon` 依赖 Profile 包。
- 复核：已被后续提交 `6951ebcb` 复核确认（见 §7）

### [P2] [D2/D5] `/[/\\]/` 启发式会误伤未来含 URI 的失败文案

- 证据（static-read）：
  `detail` 含 `/` 或 `\` 则映射返回 `undefined`，变成 `MODULE_BUILD_FAILED`
  （`399:406:packages/native-babylon/src/candidate-admission.ts`）。
  当前 Session / collider / visual `fail()` 文案不含斜杠。occupancy key 是 `x,y,z`
  （`140:162:packages/native-babylon-block-profile/src/shapes.ts`）。
  off-grid 文案是 `center ${JSON.stringify(...)} is off the '${shape}' occupancy grid`
  （`288:289:packages/native-babylon-block-profile/src/session.ts`）。
  Host check 源码里的 `worldkit://traversal-surface-profile/ground.static@1` 只出现在模块源，
  不进入 `COLLIDER_BLOCK_MISSING` 的 message
  （`228:231:packages/native-babylon-block-profile/src/collider-contribution.ts`）。
  旧的 `includes(" at ")` 假阳性（occupancy 文案含 `at cell`）已被
  `/\bat\s+\S+\s+\(/` + 拒换行替换；admission 测试覆盖了 `at cell 0,-2,0`
  （`180:205:packages/native-babylon/src/candidate-admission.test.ts`）。
- 期望：路径泄漏防护不应把合法 `worldkit://.../...` 诊断打成 opaque。当前生产文案安全，故为 P2。
- 影响：若未来 message 带 traversal profile Ref 或文件路径以外的 `/`，Builder 只能看到
  `MODULE_BUILD_FAILED`。
- 建议：拒绝 `:` 后的绝对路径与 `at fn (` stack，而不是任意 `/`。不要放宽到接受多行 provider stack。
- 复核：已被后续提交 `c8ebccd2` 复核确认（见 §7）

### [P2] [D2] 发布后的诊断 `location` 为 none，repairHint 是一句通用 Host 文案

- 证据（static-read）：
  `publishedNativeBlockBuildFailure()` 调用 `failure(code, detail, genericHint, { stage: "build" })`，
  默认 `location: { kind: "none" }`
  （`108:125:packages/native-babylon/src/candidate-admission.ts`，
  `407:412:packages/native-babylon/src/candidate-admission.ts`）。
  `NativeSceneDiagnosticV1` 已有 `kind: "world"` / `kind: "registration"`
  （`44:64:packages/runtime-contracts/src/native-scene-diagnostics.ts`）。
  overlap 的 block id 与 cell 只在 `message` 里。`code` 字段是开放 `string`，不是闭合枚举
  （`72:72:packages/runtime-contracts/src/native-scene-diagnostics.ts`），因此 Profile 码在
  schema 上合法。
- 期望：AGENTS / D2：失败应有稳定错误码与结构化定位。本切片把码做对了，定位仍靠 prose。
- 影响：Agent 修 overlap 必须解析英文 message。比 `MODULE_BUILD_FAILED` 有用，但不是完整
  AI-facing 诊断。
- 建议：保持当前映射。若要结构化，应在 Profile `fail()` 合同里带可选 location，而不是让 Host
  猜 cell 字符串。不要为此扩展 Browser V5。
- 复核：未复核

### [P2] [D5] Host check 未覆盖 `WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED`

- 证据（static-read + automated-contract）：
  Finalize 在 Layout check `outcome !== "passed"` 时抛
  `WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED`，detail 是 inner code 用 `", "` 拼接
  （`730:733:packages/native-babylon-block-profile/src/session.ts`）。
  该字符串无换行、无 `/`，映射器按当前规则会发布。
  `native-scene-check.test.ts` 覆盖了 `COLLIDER_BLOCK_MISSING`、`OCCUPANCY_OVERLAP`、
  `CREATE_INPUT_INVALID`，没有 Finalize check 拒绝（例如 disconnected route）。
  Profile 包自己的 `session.test.ts` 有该码的抛错断言，但不经 Host check JSON。
- 期望：高价值 Host 失败路径应包括「Session 创建成功、Finalize check 失败」。不是 P1：
  create 期失败已经锁住映射器。
- 影响：该码若被 slash/stack 启发式误伤，要到真实 Case 才会发现。
- 建议：在 `native-scene-check.test.ts` 加一条 Finalize check 拒绝。不要把它写成 NBR-70。
- 复核：已被后续提交 `6951ebcb` 复核确认（见 §7）

预存在、非本 diff、不开单：`build()` 成功之后
`finalizeBabylonNativeProfileSettlementV1` 的 catch 把已经是 `` `${code}: ${message}` `` 的
`BabylonNativeProfileSettlementFailureV1.message` 再交给 `failure(error.code, error.message, ...)`
（`33:40:packages/native-babylon/src/profile-settlement.ts`，
`897:905:packages/native-babylon/src/candidate-admission.ts`）。可能双重前缀。本切片的 mapper
只处理 `build()` catch，不处理这条路径。

## 4. 维度覆盖表

| 维度 | 状态 | 结论 |
|---|---|---|
| D1 定位与需求边界 | 不要求；辅助核对 | 仍是 ADR-0007 Native Lane 内 Host adapter。无第三条 Scene Source。`native-babylon` 不依赖 Block Profile 包。未把室内 / 载具 / 洞穴写成受支持能力。未勾 BNA-6/7、NBR-20/70、WRC-1。 |
| D2 Schema 与 AI-friendly | 已查 | 公共诊断仍是 `NativeSceneDiagnosticV1`；`code` 为开放 string，Profile 码 schema-合法。单位字段未新增。P2：本地重复 Profile Ref；诊断 `location: none`；`/` 启发式。无新的 Browser V5 键。 |
| D3 承诺与事实对拍 | 已查 | 产品意图与实现一致：blocks Profile 发布闭合码，standard / stack / path 保持不透明。PR 正文正确写了 focused 命令且声明不完成 NBR-20/70、WRC-API-90。P1：focused 绿不能启动根 `pnpm test` / tracked CI。不得把本 PR 说成 WRC-API-90 或生产 NBR 完成。 |
| D4 单一权威状态 | 已查（runtime-deep 诊断子集） | 公共 Native check 诊断只由 Candidate admission 发布。Profile 只拥有 throw 码。authority-audit 失败仍强制 opaque。不读 Mesh 名 / palette 推断 physics。Havok support / camera / tick 无第二推导。 |
| D5 工程质量 | 已查 | `isNil` / `isEmpty` 具名导入；`native-babylon` 声明了 `lodash-es` 与 `runtime-contracts`。映射拒绝多行与 V8-like stack。admission 测试覆盖 `at cell` 假阳性。P1：跨包私有源导入。P2：字符串方言耦合；Host check 未覆盖 `PROFILE_CHECK_REJECTED`；testing 子路径才是格子 helper 的合法出口。 |
| D6 门禁与证据分层 | 已查 | §1.1 列出亲自执行与同树复用的命令。Cloud CI `33630781140` 在 exact SHA 上红。focused Vitest 不能冒充根 `pnpm test`。WRC-API-90 保持开放。 |

## 5. 裁决

**产品映射：有条件 GO。** 在 `whitebox.blocks@1` 上把单行 `WORLDKIT_NATIVE_BLOCK_*` TypeError
收成公共 Native check 诊断，同时对 standard Profile、stack、路径、`Error:` 包装、authority-audit
伴随失败保持 opaque，符合「raw provider errors are not public diagnostics」和包边界
（Host 不 import Profile 包）。`NativeSceneDiagnosticV1.code` 是开放 string，不需要新的闭合枚举。

**测试意图：对。** admission 合同、真实 Session 经 Host check、Package fail-closed、Skill 配方与
occupancy grid 对齐，锁的是正确的层。它们 **不是** NBR-20（真实 Codex）或 NBR-70（真实可玩性）。

**合入口径（冻结树 `13bc2b13`）：NO-GO，直到 P1 关闭。** 该 SHA 上根 `pnpm test` 与 tracked CI 在
`verify:workspace-boundaries` 失败。Typecheck 修复（`.ts` → `.js`）有效，但不能让相对
`src/shapes.js` 变成合法导入。不要勾 WRC-API-90。

P1 的后续修复见 §6。

## 6. P1 修复后复验

- 复核对象：`43889d2c918b4b2b76f359cd3d9f53d32705b84a`
- 复核范围：仅本报告 P1（Skill 测试跨包私有源导入）。不重开 D2–D6 全表，不把本 SHA 冒充
  WRC-API-90。
- 产品改动：`testing.ts` 从 `./shapes.js` re-export
  `babylonNativeBlockCenterAlignsToGridV1` 与 `babylonNativeBlockOccupiedMicroCellKeysV1`；
  Skill 测试改为 `@whitebox-world/native-babylon-block-profile/testing`；testing 子路径
  `Object.keys` 锁同步更新。包根公共出口不变。
- 复核证据（`43889d2c`）：
  - `pnpm verify:workspace-boundaries` exit 0
  - `pnpm exec vitest run scripts/agents/native-block-builder-skill.test.ts packages/native-babylon-block-profile/src/package-boundary.test.ts` — 2 files / 30 passed
  - `pnpm typecheck` exit 0
- 未跑：根 `pnpm test` / `pnpm build`（按协议只重跑 P1 触及的门禁；tracked CI 在 push 后覆盖聚合）。
- 裁决：本报告原 P1 在 `43889d2c` 关闭。当时仍开放的 P2 见 §7。WRC-API-90、NBR-20/70 仍开放。

## 7. P2 跟进

用户要求处理本报告 P2。产品树 `6951ebcb`。

| Finding | 裁决 |
|---|---|
| 重复硬编码 Profile Ref | **关闭。** `candidate-admission.ts` 改用 `BABYLON_NATIVE_BLOCK_PROFILE_REF_V1`（`c8ebccd2`）。 |
| 字符串 `fail()` 方言 | **关闭（锁格式，不改 adapter）。** 仍不让 `native-babylon` 依赖 Profile 包。`package-boundary.test.ts` 锁 build-path `fail()` 源码；`session.test.ts` 对 create invalid / overlap / Finalize check 断言 Host-publishable TypeError（`6951ebcb`）。 |
| `/[/\\]/` 误伤 URI | **关闭。** 改为拒绝 token 起始的 `/`、`../` 与任意 `\`；`worldkit://…/…` 可发布。unix/windows 路径与 stack 仍 opaque（`c8ebccd2`）。 |
| Host check 未覆盖 `PROFILE_CHECK_REJECTED` | **关闭。** disconnected route Finalize 经 dual replay 映射为该码（`6951ebcb`）。 |
| 诊断 `location: none` | **保持开放。** occupancy cell 是格子索引，不是 `positionMetersXYZ`。结构化定位需要 Profile `fail()` 合同带 location，不是本切片的小修复。 |

复核证据（`6951ebcb`）：

- `pnpm exec vitest run packages/native-babylon/src/candidate-admission.test.ts packages/native-babylon-block-profile/src/session.test.ts packages/native-babylon-block-profile/src/package-boundary.test.ts` — 3 files / 92 passed
- `pnpm exec vitest run scripts/native-scene/native-scene-check.test.ts` — 19 passed（含 disconnected route Finalize）
- `pnpm typecheck` exit 0

未重跑根 `pnpm test`（窄 follow-up；聚合门禁由 tracked CI 覆盖）。不勾 WRC-API-90。

## 8. Host-issued failure provenance follow-up

合入前代码复核在 `ab7326b1` 发现一项新的 P1：旧 adapter 只检查 Bootstrap Profile Ref 与
`Error.message` 正则，任意 Native Module 都能自行抛出外观相同的
`WORLDKIT_NATIVE_BLOCK_*` 异常，伪造公共诊断码和 detail，绕过
`WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED` 的 opaque 边界。

修复提交 `206d9d39` 删除该字符串信任路径：

- `@whitebox-world/native-babylon/host` 提供 Host-only Block Profile failure factory；源码准入既有
  负向合同继续禁止 Native Module 导入 `/host`；
- Host 用 module-local `WeakSet` 校验实际签发对象身份，并同时核对冻结的 Block Profile Ref；仅复制
  已验证的 `code`、`detail` 和 `repairHint`，不读取公开异常字符串；
- Block Profile 的 Session、Collider、visual 和 settlement build 失败统一通过 package-private
  `build-failure.ts` 调用该 factory；错误对象在返回前冻结；
- 任意 Module 自建的 `Error` / `TypeError` 即使消息外观完全匹配，也仍发布 opaque
  `WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED`。

聚焦证据：

- RED（`ab7326b1` + 新 reproducer）：
  `pnpm exec vitest run packages/native-babylon/src/candidate-admission.test.ts` — exit 1，实际错误码为
  `WORLDKIT_NATIVE_BLOCK_FAKE`；
- GREEN（`206d9d39`）：Candidate / module / Profile Session / package-boundary 共 4 files、119 passed；
- `pnpm verify:workspace-boundaries` — exit 0；
- `pnpm typecheck` — exit 0；
- `pnpm exec vitest run scripts/native-scene/native-scene-check.test.ts` — 19 passed；
- Package 的 missing Grid child 聚焦用例 — 1 passed。

该修复不改变 Runtime、Havok、Camera、Input、Tick、Package DTO 或 Browser 协议；本地不重复根
aggregate，最终 exact-SHA aggregate 由 push 后 tracked CI 覆盖。结构化 `location` P2 仍保持开放，
WRC-API-90、NBR-20/70 与整体 WRC-1 状态不变。
