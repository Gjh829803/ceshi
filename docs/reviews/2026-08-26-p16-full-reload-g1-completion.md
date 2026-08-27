# P1.6 Full Reload G1 Completion Record

## Status

- Date: 2026-08-26.
- Branch: `cursor/p16-world-changeset-runtime-publication-1ccf`.
- Observation point: first-slice gates `63d530b`；页面级加房屋 rendered
  follow-up gates `8ca8503`。本记录与 Backlog 状态更新是门禁通过后的文档提交，
  不使合同证据失效。
- Diff 基线：`origin/main` merge-base `021feb5`.
- Disposition: **First-slice Final GO — not production GO**.
- Scope: Slice B Full Reload 首切片（H0–F1 + G1 全量合同门禁）。
- Authority:
  [`2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`](../superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)。
  规格文档状态行仍为 *Detailed design；implementation not started*；不以它代替
  Backlog 的 first-slice 完成口径，也不把它改成 Implemented。
- 当前安装依赖：Babylon.js `9.21.2`、Havok `1.3.14`（`package.json`）。
- Codex / Cursor Agent CLI：本环境不可用。本记录是主 Agent 在 exact HEAD 上的
  完成验收，不是双通道审查。

This is the first-slice GO for AI Schema / WorldChangeSet / in-memory journal /
RuntimeHost publication V2 / trusted Authoring Edit API. It is not a production
editor, Incremental Hot Apply, complete P1.4 WorldPackage, or disk WAL.

## Committed implementation evidence

| Work unit | Status at observation point | Remaining work |
| --- | --- | --- |
| P16-H0–F1 | Complete first-slice on this branch | See open gaps below |
| recover 终态保护 | `8ef455a` | None in this slice |
| revision 只在 Commit point 分配 | `7f0890f` | None in this slice |
| `rebaseRequired` 不进 A0 | `612376f` | Keep the closed Receipt union |
| `/testing` 出口替换 deep import | `347d29e` | Do not add new boundary debt |
| Builder template + Take hashes + self-check bundles | `63d530b` | Keep Skill/schema/bundle in lockstep |
| P16-G1 gates | This record | Production / Incremental |
| 页面级 add-house rendered | `8ca8503` | Not a production editor or manual playtest |

## Five evidence layers

| Layer | Status | Evidence |
| --- | --- | --- |
| automated-contract | Passed on `8ca8503` | `pnpm typecheck`; `pnpm test` = workspace boundary 52 debt + census 234 + contract 210/2233 + resource-heavy 24/418 |
| build | Passed on `8ca8503` | `pnpm build` Vite client production build, 25.76s. Existing >500kB chunk warning is non-blocking. |
| browser numeric | Passed inside `pnpm test` | 安装测试仍证明 Edit 面隔离与 V5 exact 39 keys。add-house verifier 另证 committed / `full-reload` / 新 WorldSession / tick 0 / `worldPackageRootHash` 变化 |
| rendered-visual | Closed first-slice on `8ca8503` | `worldkit-authoring-edit-add-house.browser.test.ts`：`worldkit run` 等价 `startWorldkitServer(basic-world.json)`，`?authoring=1` 上 stale Dry Run → 新 ChangeSet Dry Run → `publish-runtime`。V5 与 Playwright `canvas.world-canvas` 截图均为合法 PNG 且 before ≠ after；`inspectFeatures()` 含 `house-north`。不是黄金图回归，也不是人工操作验收。 |
| manual-interaction | Not run | 没有新的人工 Playground 操作验收项 |

未跑及原因：

| 命令 | 原因 |
| --- | --- |
| `pnpm test:studio` | Studio UI 不是本切片输入；文件模式 CLI 与 Authoring Edit API 已由 `pnpm test` 覆盖 |
| `pnpm verify:canonical` / `placement-layout` / `rigged-subject` / `g-bot-subject` / Route / Outdoor Gameplay | 这些能力 verifier 不是 P1.6 新宣称；H0 已刷新对应 artifact。本切片没有把它们当作 G1 通过条件 |
| 人工 Playground 加房屋 | Chromium verifier 已关 rendered；无人工操作验收 |

G1 复跑前，本环境按 CI 安装了 `pillow`（`python3 -m pip install pillow requests`）。仓库没有新增 Python 依赖声明；CI 本来就会装。

## G1 门禁中确认并修复的问题

1. F1 集成测试相对导入 `runtime-host` 私有 harness，触发
   `WORKSPACE_PRIVATE_SIBLING_SOURCE`。改为 `@whitebox-world/runtime-host/testing`。
   Debt 仍是 52，没有新增。
2. `allowedOverridePaths` 成为 Subject Definition 必填后，Builder Skill 示例编不过。
   模板补 `[]`，并写明 AI 必须带这个字段。
3. `simulation-take-cli` 的 placement-coastal 身份哈希仍是 H0 之前的值。已与
   `artifacts/examples/placement-coastal-world/world.build.json` 对齐。
4. Planner/Builder `self-check.mjs` 相对当前 Schema 过期。已
   `pnpm generate:agent-self-check`，`pnpm check:agent-self-check` 通过。
5. Playground `publishWorldReplacementV1` 只委托 RuntimeHost，不换可见 canvas、
   不刷新 `inspectFeatures()`。Full Reload 后新世界在 DOM 外。已抽出
   `adoptActiveWorldSurface`，published 后换 canvas、刷新 inspections，并在
   `resize()` 清掉 Render Ready receipt 后再 `renderFrameWhenReady()`。
6. Playground candidate ready gate 要求 possession，但 RuntimeHost publication
   在 ready gate 保持 unbound（与 create-then-bind 一致）。已去掉该 possession
   检查，改在 published swap 之后 bind。不要把 Playground 控制器策略塞进
   RuntimeHost publication envelope。

## 仍开放、不得假装已关

- `definition-override-set` 尚未接入 journal 里的 O1 校验器；golden 不用这条 Operation。
- journal 是进程内 Map，不是磁盘 WAL。
- publication fence 对 `snapshot()` 是弱保证；Prepare 期间旧世界可 tick。
- Dry Run `validationReports` 恒为空。
- Incremental Hot Apply、完整 P1.4 未交付。页面级 add-house Chromium verifier
  已关 first-slice rendered，不是生产编辑器。
- Host query missing/pending 使用 host-local 错误码，不进封闭 Diagnostic 表。

## Required final verification

All commands below passed on the tracked tree of committed candidate `8ca8503`:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Observed results:

- `pnpm typecheck`: exit 0.
- `pnpm verify:workspace-boundaries`: passed, 52 registered debt entries.
- `pnpm test:census`: 234 tests, 210 contract, 24 resource-heavy.
- `pnpm test:contract`: 210 files / 2233 tests passed.
- `pnpm test:resource-heavy`: 24 files / 418 tests passed.
- Combined `pnpm test`: 234 files / 2651 tests passed.
- `pnpm build`: exit 0, 25.76s. Existing Vite large-chunk warning is not treated
  as a compatibility or publication defect.
- 先前 `63d530b` 门禁数字仍是合同基线；本 follow-up 多 1 个 resource-heavy
  文件（add-house Chromium）和 publication ready-gate 合同测试。

## Production claims

Do not claim:

- P1.6 is production-ready;
- Incremental Hot Apply exists;
- complete P1.4 WorldPackage exists;
- `pnpm dev` + `?authoring=1` is a legal path;
- `window.__WORLDKIT__` gained a 40th key;
- a production editor exists, or that a human playtest replaced the Chromium
  add-house verifier.

Agent contract remains: structure writes go through
`window.__WORLDKIT_AUTHORING_EDIT__` or `worldkit change *`;
`WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH` means read
`currentAuthoringSpecHash` and create a new ChangeSet ID. There is no
`rebaseRequired` field.
