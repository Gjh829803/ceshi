# Streaming UI 本地链路验证 — 2026-09-17

> 后续：已完成[海滨小镇正式 Creator 交付到公共播放器验收](2026-09-17-seaside-town-stream-demo.md)。下文保留当时的验证范围与身份。

## 结论与范围

本地真实链路通过：Creator Agent 文档发现 → 当前 Codex Agent 编写独立 UI 案例 → Creator CLI 编译 → Stream CLI/Chromium → 视频与 UI 分离传输 → 公共播放器呈现/操作回传。
另外验证了正式 Creator 工具包的源码打包、冻结锁隔离安装，以及隔离包自己的 Creator CLI 编译。
这不是线上部署或远程 Agent 作业验收，也不替代 Creator 的内容 self-check/world_submit。
原预览服务 53900 未重启或替换；独立案例使用 53901。

## 实际发现并修复

1. Creator 已依赖 `@worldkit/world-ui`，但云工具包源码清单漏了该包。新增依赖闭包回归曾失败并明确指出这个缺口，修复后通过。
2. 工具包源码筛选和示例文本读取未包含 `.tsx`。已补齐，并在共享示例登记表登记 streaming-ui，使 Agent 指南链接到的组件示例随工具包交付。
3. 工具包剔除开发依赖后，World UI 的 React/React DOM peer providers 缺失，实际 frozen-lockfile 安装失败。投影时保留精确版本为胶囊运行依赖，安装通过；原 workspace 包的 peer 契约不变。
4. Linux doctor 增加 UI 依赖解析和示例编译/hash 检查；本次只检查其语法，未运行 Linux doctor。

## 独立案例证据

案例使用自定义 `mission.completedSteps` 和 `panels.missionVisible`，组件为 MissionCard/MissionControls。
通过真实工具入口 `creator_get_authoring_schema({document:"ui.md"})` 获取指南，`world_validate` 编译成功。
浏览器观察：0/3 → 点击推进为 1/3 → 隐藏 → 隐藏期间推进 → 刷新仍隐藏且 session/epoch 不变 → 再显示为 2/3 → 仅 UI 模式继续推进 → 恢复双流后为 3/3。
最终 UI revision 为 5，观察到 UI 未映射帧为 0。这里验证功能，不把本机并行负载下的 FPS 当作生产性能指标。

本地原仓库编译 worldBuildHash：`ef1190cc36b5dda859841cb84991b2c18e0c219bec89e15d63524bc429758039`。
隔离胶囊编译 worldBuildHash：`5ca0fd83d30b0a2b895995200cfe386bc49acb19cd2debb2924affbda6490ee3`。
两者身份分别保留：胶囊有投影后的包清单，未将不同构建冒充同一产物。UI 模块实际 SHA 已单独记录。

## 验证结果

- 9 个 Vitest 文件，36 项通过：Creator UI 编译/示例读取、UI 核心与布局、协议、播放器、真实 Chromium 会话、SDK 捕获/远程输入、Episode source export。
- 6 项工具包打包/审计回归通过。
- 隔离工具包 `pnpm install --frozen-lockfile --ignore-scripts --offline` 通过；确认关键依赖解析路径位于隔离目录，未借用外部 node_modules。
- 隔离工具包 Creator CLI 实际编译新案例成功。
- 类型检查、相关 ESLint、测试清单、workspace 边界、SDK runtime prebuild、diff 空白检查通过。
- 最终工具包 sourceHash：`sha256:d93adeb8a5abd95e61b79011e55a551d1720518c64dfe53800541ca8387dbd53`；dependencyHash：`sha256:ac21fa5c69dd5771c0cdd1513d082eac0d03639d81b009076ccccbad7ff70135`；645 个源码/资源条目。最终 stage 与已安装验证的 source/dependency 身份一致。

## 本地产物

以下文件位于忽略目录，不包含会话访问令牌或云凭据：

- [Agent 指南工具响应](../../.codex-tmp/stream-chain-validation/evidence/agent-ui-guide.json)
- [Creator CLI 编译响应](../../.codex-tmp/stream-chain-validation/evidence/creator-validation.json)
- [隔离胶囊 CLI 编译响应](../../.codex-tmp/stream-chain-validation/evidence/capsule-creator-validation.json)
- [隔离依赖解析与 UI 模块身份](../../.codex-tmp/stream-chain-validation/evidence/isolated-dependencies.json)
- [工具包源码 stage](../../.codex-tmp/stream-chain-validation/evidence/capsule-stage.json)
- [浏览器操作记录](../../.codex-tmp/stream-chain-validation/evidence/browser-receipt.json)
- [独立案例源文件](../../.codex-tmp/stream-chain-validation/world/scene.ts)

## 尚未覆盖

未启动远程生产 Agent 作业、Linux x64 镜像构建或 doctor、GPU 服务、世界模型转换、Seedance 或 App 播放器。
未执行 world_submit，也不声称正式内容交付已验收。代码仍为本地未提交修改。
