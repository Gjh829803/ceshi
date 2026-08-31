# Unified Scene Viewer Completion Review

## 1. 审查元数据

- 模式：B 变更审查，覆盖 D2–D6；因涉及 Browser/CLI 启动与 RuntimeHost 生命周期，同时按 Runtime 深审清单核对 authority、Reset 和 session 隔离。
- 对象：`codex/default-gbot-dev` 最终源码候选 `70ed3983c80b761575acafb140e83156adb0b90d`；初次合入后的 `main@b6e0bc8` 为复核基线，本轮 authority follow-up 的直接父树为 `4f21283f2b923e8061097ee7e9dee5d743ef4088`。
- 依赖版本：Babylon.js `9.23.0`、Havok `1.3.14`、Playwright `1.62.1`；未新增引擎语义假设。
- 结论：没有仍成立的 P0/P1/P2 finding；源码候选 **GO**。完整根聚合测试不在本地重复运行，按用户决定由推送后的 Cursor Cloud Agent 对 exact `main` SHA 运行。

执行证据：

| 命令 | Exit | 证据层级 | 结果 |
|---|---:|---|---|
| `pnpm install --frozen-lockfile` | 0 | automated-contract | 37 workspace projects，lockfile current |
| `pnpm test:census` | 0 | automated-contract | 最新 main 合并后 384 tests：345 contract / 39 resource-heavy |
| focused Viewer/Host/Project Health tests | 0 | automated-contract | 5 files / 52 tests；另有固定 Host/Studio 浏览器替换测试 2/2 |
| `pnpm typecheck` | 0 | automated-contract | 通过 |
| `pnpm test:studio` | 0 | automated-contract | 75/75 |
| `pnpm test:independent` | 0 | automated-contract | Node 23/23，Site 1/1；本机按 CI 合同安装 `requests` 与 Site dependencies 后运行 |
| `pnpm build` | 0 | automated-contract | Playground production bundle 通过 |
| `pnpm verify:g-bot-subject` | 0 | rendered-visual | G Bot world/build/capture/action pose/wall-stop 全部通过 |
| `pnpm verify:scene-viewer` | 0 | rendered-visual | 3/3 G Bot presets、fresh session switch、unknown fail-closed、6/6 artifact-only routes 通过 |
| fixed Host / Studio source follow-up | 0 | automated-contract | route 16/16、Host Browser 2/2、Studio Host binding 2/2、public proxy 1/1、typecheck 通过 |
| `git diff --check` | 0 | static-read | 通过 |

人工查看了三个 preset 的实际浏览器截图：G Bot、场景选择器与对应调试站点可见。真人手感和逐站操作属于该 Viewer 后续日常产品调试，不把截图或自动输入冒充人工手感结论。

## 2. 旧结论复验

复验 `2026-08-31-wrc-aligned-unified-scene-viewer-review.md` 的六项历史 finding：

- Catalog 的 Subject 双事实源：已失效。Catalog 不含 Subject 字段；Host 从权威 V4 `startup.controlledEntityId` 验证 `humanoid.g-bot@2`。
- 提前公开 Native Viewer：已失效。当前 Catalog/bootstrap 是 Canonical-only；BNA Harness 保留且未被改造成产品入口。
- 新旧公开路由并存：已失效。Playground、CLI 与 Studio 已原子迁移到一个 Host bootstrap；`authoring=1` / `catalog-gameplay` 不再是公开来源权威。
- frozen install / census 不闭合：已失效。最新树 install 与 384-test census 均通过。
- traversal/action preset 不完整：已失效。当前 preset 含 slope、step boundary、corridor、ledge、blocker，以及仅限当前 admitted presentation 的 Action Lab。
- 工作图字段不闭合：已失效。当前设计工作图包含 `depends_on`、`blocks`、owner、稳定 I/O / integration、evidence 与 mode。

独立复核曾在 `171f2f2` 发现两个阻断问题：Host-fixed 来源可被 `artifact=1` 替换，以及旧 verifier 未真实启动三个新 preset。两项分别通过 Host authority、route fail-closed 和 `verify:scene-viewer` 的三场景实浏览器门禁修复。

对 `7be5438` 的后续复核又发现 Browser `?world=` 仍可绕过 fixed Host，并让 Studio 客户端拼接另一个世界的 Preview endpoint。最终源码候选 `70ed398` 删除 Browser world selector；Studio 改用 `/play/<world-id>`，由 Studio Host 在返回 HTML 中注入唯一 world binding。Main 只读取该 Host binding，任何 `?world=`（包括与已绑定世界不同的值）都会在 Runtime/Bootstrap 创建前 fail closed。固定 `worldkit run` 与 Studio 跨世界替换均有聚焦回归。

## 3. Findings

当前候选没有仍成立的 P0/P1/P2 finding。历史 finding 只保留作审计轨迹，不代表当前状态。

## 4. 维度覆盖表

| 维度 | 状态 | 说明 |
|---|---|---|
| D1 定位与需求边界 | 已查 | Viewer 明确是 WRC-1 下游工具；正式 WRC evidence、Native Corpus/Harness 未删除 |
| D2 Schema 与 AI-friendly | 已查 | Catalog/bootstrap current-only、Canonical-only；G Bot 身份只有 AuthoringSpec 权威 |
| D3 承诺与事实对拍 | 已查 | README、AGENTS、设计、实现与实际 Browser selector/Host source 一致 |
| D4 单一权威状态 | 已查 | Viewer 不新增 Gameplay/Camera/Input/Tick owner；场景切换创建 fresh RuntimeHost session |
| D5 工程质量 | 已查 | fail-closed route、未知场景、reset、静态 Subject 漂移、census 与 clean-break 均有覆盖 |
| D6 门禁与证据 | 已查 | contract、build、Browser、rendered visual 分层记录；人工手感未冒充自动证据 |
