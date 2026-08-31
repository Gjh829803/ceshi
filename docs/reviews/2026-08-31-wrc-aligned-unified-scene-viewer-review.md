# WRC-Aligned Unified Scene Viewer Review

## 1. 审查元数据

- 模式：A 设计规格审查 + B 分支变更审查。
- 对象：`codex/default-gbot-dev`，HEAD `22be27addd135b2090a535a4ed4c12cd5b1151f3`。
- Diff 基线：`origin/main@e44a41d906b38e35bd5774f0fb129564540c93c0`。
- 规格状态：supporting developer-tool proposal；不是 WRC-1 权威。
- 依赖版本：Babylon.js `9.23.0`；本次没有作 Babylon/Havok 引擎语义断言。
- 工作树附加输入：未跟踪的 `scenes/catalog.json` 与三个 `scenes/presets/*/world.json` 草稿。

执行证据：

| 命令 | Exit | 证据层级 | 结果 |
|---|---:|---|---|
| `pnpm install --frozen-lockfile` | 1 | automated-contract | 新 package 未进入 `pnpm-lock.yaml` |
| `pnpm exec vitest run packages/scene-catalog/src/scene-catalog.test.ts` | 0 | automated-contract | 1 file / 14 tests 通过 |
| `pnpm test:census` | 1 | automated-contract | `STALE: scripts/cli/default-dev-entry.test.ts` |
| `pnpm typecheck` | 0 | automated-contract | 通过 |
| `pnpm worldkit validate scenes/presets/feel-flat/world.json` | 0 | automated-contract | AuthoringSpec V4 校验通过 |
| `pnpm worldkit validate scenes/presets/traversal-course/world.json` | 0 | automated-contract | AuthoringSpec V4 校验通过 |
| `pnpm worldkit validate scenes/presets/action-lab/world.json` | 0 | automated-contract | AuthoringSpec V4 校验通过 |
| `git diff --check` | 0 | static-read | 通过 |

未运行 build、Browser、rendered visual 与 manual interaction：当前审查在设计/合同阶段已发现
阻断项，且 Viewer Runtime 尚未实现；低层证据不能替代这些后续证据。

## 2. 旧结论复验

没有复用旧 review 结论。本次所有 finding 均由当前 HEAD、当前未跟踪预设和当前命令直接复验。

## 3. Findings

### [P1] [D3/D4] Catalog 的 G Bot 字段与实际 AuthoringSpec Subject 构成双重事实源

- 证据（static-read + automated-contract）：`17:31:packages/scene-catalog/src/scene-catalog.ts` 和
  `41:63:packages/scene-catalog/src/scene-catalog.ts` 把 `defaultSubjectDefinitionRef` 放进 Catalog 与
  Bootstrap metadata；`311:339` 只浅验 AuthoringSpec 的 `schemaVersion/kind/id`，`355:386` 只核对
  Scene ID。当前复现构造 metadata 为 `humanoid.g-bot@2`、AuthoringSpec Subject 为
  `humanoid.third-person@1`，`parseViewerBootstrapV1` 仍返回 accepted。
- 期望：实际受控 Subject 的 AuthoringSpec/Registry closure 是唯一事实源；Host 使用权威
  `parseAuthoringSpecV4` 后验证 curated preset 的 `startup.controlledEntityId` 最终绑定 G Bot，UI 只消费
  该已验证事实。
- 影响：Viewer 可显示“默认 G Bot”却实际启动红色胶囊，直接复发本任务要消除的错误。
- 建议：从 Catalog/Bootstrap metadata 删除 `defaultSubjectDefinitionRef`；在 preset publication 与 Host
  load 边界解析完整 V4，并从受控 Subject 派生只读显示信息。
- 复核：未复核。

### [P1] [D1/D3] Checkpoint A 提前公开未闭合的 Native Catalog/Bootstrap 成员

- 证据（static-read）：`21:29`、`54:62`、`167:177`、`341:350` 的当前合同已经接受
  `babylon-native-package`；`43:53:docs/superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md`
  同时承认 BNA disposition 尚是准入条件。当前分支没有 Native Viewer consumer 或对应 admission gate。
- 期望：WRC-1 当前阶段不以未完成的 BNA-8/相关 disposition 作为已声明 Viewer 能力；Catalog 中列出的
  每个成员都必须逆向落到真实 Runtime consumer 与门禁。
- 影响：内部开发合同先于能力冻结，后续容易为维持已导出的 union 增加兼容债务，或误报 Native Viewer
  已可用。
- 建议：Checkpoint A 只保留 `canonical-authoring`。Native Viewer 成员在 Checkpoint B 的适用 BNA gate
  明确后，以 current-only change 加入并同步消费者/测试。
- 复核：未复核。

### [P1] [D1/D3] A/B 拆分会让新旧 Viewer 路由在已合入检查点并存

- 证据（static-read）：计划 `48:69` 新增 `/__worldkit/viewer-bootstrap`，同时明确 Checkpoint A 不删除
  Studio/Capture/Native 路由并保留 legacy modes；当前源码仍由
  `apps/playground/src/playground-runtime-route.ts` 管理 `authoring`、`catalog-gameplay`、`artifact-only`，
  Studio 仍生成 `?authoring=1&world=...`。AGENTS 的 current-only 规则禁止一个概念在 accepted tree
  保留 legacy/new 双入口。
- 期望：增量检查点必须独立有用，但一次入口合同切换必须原子更新所有该合同消费者；内部 Capture
  capability 可以保留，但不能作为第二个公开 Viewer 路由 authority。
- 影响：Checkpoint A 合入后将存在两套启动分类/Bootstrap authority，直到未来 B 才清理，违反 WRC-1
  clean break，并放大 Studio/Capture 漂移风险。
- 建议：把工作重新切为“无新路由的准备提交”和“一次原子 Viewer consumer cutover”；或让唯一现有
  Host source endpoint 承担 catalog/fixed-source 选择并在同一 merge candidate 删除被替代 route owner。
- 复核：未复核。

### [P1] [D5/D6] 当前分支不是可安装、可枚举测试的完整 workspace tree

- 证据（automated-contract）：`pnpm install --frozen-lockfile` 失败，报告
  `packages/scene-catalog/package.json` 新增 `@whitebox-world/world-identity@workspace:*` 但 lockfile 未同步；
  `pnpm test:census` 失败，`282:scripts/lib/test-gate-manifest.ts` 登记了不存在的
  `scripts/cli/default-dev-entry.test.ts`。
- 期望：新增 workspace package 同提交更新 lockfile；test manifest 只登记实际 tracked test。
- 影响：干净 checkout/CI 无法 frozen install，根测试入口在执行任何合同测试前 fail closed。
- 建议：在下一次实现前先补 lockfile；删除 stale manifest entry，直到对应 RED test 在同一提交真实存在。
- 复核：未复核。

### [P2] [D3] 当前三个预设草稿没有闭合设计中承诺的调试站点

- 证据（static-read）：设计 `20:28` 承诺 traversal 包含 slopes、steps、narrow passages、ledges、blockers；
  当前 `traversal-course` 是 flat terrain，仅含三块台阶与两面走廊墙。`action-lab` 的 `rules` 为空，只有
  landing visual strip 和三个普通碰撞 box，没有声明它具体覆盖当前已 admitted 的哪些 Action 行为。
- 期望：每个长期 preset 有可测量、可重复的产品调试目的；不得把尚未完成的 WRC-ACT-1/2 能力写成
  当前 Action Lab 支持。
- 影响：场景名字和 UI 会让产品认为坡面、边缘、Action interaction 已可调，实际无法验收对应手感。
- 建议：补足明确的 slope/ledge/blocker stations；把 Action Lab 限定为当前已 admitted 的 idle/run/jump/
  land presentation，或在 WRC-ACT 能力合入后再扩展，并为每个 station 写 Browser/manual acceptance。
- 复核：未复核。

### [P2] [D1/D6] 工作图没有满足仓库要求的 blocks 与稳定 I/O 合同

- 证据（static-read）：`112:120:docs/superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md`
  只列 `depends_on`、owner、verification、mode，没有 `blocks`、稳定 input/output contract 和 exact
  integration point；AGENTS 的 design-stage decomposition 要求这些字段全部存在。
- 期望：USV-A1..C1 每项明确 `depends_on`、`blocks`、独占资源、输入输出、集成点和证据。
- 影响：WRC 会话无法可靠判断 B/C 何时 ready，也无法区分 Viewer metadata 与 Runtime/Browser contract。
- 建议：恢复完整责任表；尤其明确 A 的输出不能被称作 Browser Protocol，B 的 cutover 是原子消费者迁移，
  C 依赖具体 WRC/BNA owner sign-off。
- 复核：未复核。

## 4. 维度覆盖表

| 维度 | 状态 | 说明 |
|---|---|---|
| D1 定位与需求边界 | 已查 | 下游 Viewer 定位正确；Native 与路由分期存在越界 |
| D2 Schema 与 AI-friendly | 已查 | 命名基本闭合；Subject 重复字段和浅验 AuthoringSpec 不合格 |
| D3 承诺与事实对拍 | 已查 | WRC 状态、Native 声明、preset 内容与计划逐项对拍 |
| D4 单一权威状态 | 已查 | 当前 diff 不改 Runtime；发现 G Bot metadata/AuthoringSpec 双事实源 |
| D5 工程质量 | 已查 | package dependency、lockfile、test census、失败路径均检查 |
| D6 门禁与证据 | 已查 | focused/typecheck/validate/diff-check 已跑；高层 Browser/视觉/交互明确未跑 |

## 5. Disposition

方向性结论为 **CONDITIONAL GO**：将 Viewer 设为 WRC-1 下游开发消费端、保留 WRC artifacts/evidence、
分离 curated tuning presets 与 WRC acceptance corpus，符合长期架构。当前实现/计划为 **NO-GO**：上述
P1 修复前不应继续扩展 Vite/Main Runtime 接线，也不应合入 `main`。
