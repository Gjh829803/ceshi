# 平台本地执行启动失败：锁文件被 pnpm 重排

2026-09-18，任务 `world-e56ba4035518a27d96a710b0d0e24610`，SDK 提交 `8c9955c3c064de214de6265634b83ca63f8a3f06`。

## 已观察到的失败

[平台任务](https://world-test-platform.loopit.com.cn/tasks/br-codex-subject-library-demo-8c9955c3c064/world-e56ba4035518a27d96a710b0d0e24610) 原始日志：

```text
WORLDKIT_CODEX_BACKEND local
sha 8c9955c3c064de214de6265634b83ca63f8a3f06
THREE_LOCAL_FAILED THREE_LOCAL_SOURCE_DIRTY: tracked SDK files changed; use the selected clean isolated checkout.
```

平台的 local 是服务器/容器内的本地 Codex CLI，不是操作者电脑。日志在 SDK probe、prebuild 和 Codex 生成开始之前就失败；没有证据表明这次失败来自模型、资产下载或游戏运行。

## 根因与复现

平台 `server/runtimes.mjs` 准备固定 SHA 的 detached worktree 后运行 `pnpm install --prefer-offline`。`server/three-local-verify.mjs` 随后用 `git status --porcelain --untracked-files=no` 拒绝所有已跟踪文件的变化。平台 Dockerfile 固定 pnpm 10.14.0。

在干净的 8c9955c3 worktree，用相同版本执行最小解析复现：

```sh
pnpm install --lockfile-only --offline --ignore-scripts
git status --porcelain --untracked-files=no
```

安装成功，但 status 返回 ` M pnpm-lock.yaml`。diff 只有两处排序：

- `packages/creator-host.dependencies`：`@modelcontextprotocol/sdk` 被放到两个 `@worldkit/asset-*` 条目之前。
- `packages/episode-pipeline.devDependencies`：`@worldkit/preset-content` 被放到两个 `@types/*` 条目之后。

共 6 行移动（6 insertions / 6 deletions），没有依赖版本、integrity、模型或业务代码变化。新增工作区依赖后，提交的锁文件顺序不是 pnpm 的规范输出。平台安装会重写它；后续源码一致性检查因此拦截。平台原始错误未列出文件名，文件归因由相同 SHA、相同 pnpm 版本的独立复现确认。

此前直接使用已安装依赖的模型测试/编译检查，以及 frozen install，未覆盖非 frozen 安装重新序列化锁文件的行为。

## 修复与验证

保留 pnpm 10.14.0 生成的锁文件顺序。CI 增加一次无生命周期脚本、离线、非 frozen 的 lockfile-only 解析，并要求 `git diff --exit-code -- pnpm-lock.yaml`，防止同类回归。不禁用源码一致性检查，不重新定义资产目录。

修复后相同非 frozen 解析再次执行，锁文件 SHA256 不变；frozen 解析也成功。相关 capsule、客户端和协议 19 项测试通过。最小复现不会启动模型，也不等同于整次场景生成验收。

## 平台复测方式

选择 `codex/subject-library-demo` 的新提交创建/复制测试任务。旧任务固定 8c9955c3；点击旧任务“重试”仍可能沿用旧 SHA 和已变脏的 worktree，不能得到此修复。保留旧尝试及原始日志。

平台侧可另行改进：依赖安装使用 frozen lockfile，并在安装后立即检查 tracked diff、报告变更路径，使失败归入环境准备阶段。这里未改平台部署，也未清理服务器 worktree 或自动提交新的生成任务。

## 第二次失败：Linux bin 执行权限

任务 `world-e731c577ca5b43a251b42006a2104df2` 使用已修正锁文件的 `212dc1b84bfe0cc92919112775a0650014cb6951`，仍在第一个源码检查失败。第一轮 Windows lockfile-only 复现没有覆盖完整 Linux 安装的文件模式变化，不能作为平台端到端通过的证据。

新增的 `packages/asset-client/package.json` 声明 `worldkit-assets` 的 bin 入口为 `src/cli.mjs`，但该文件在 Git 中的模式是 `100644`。pnpm 10.14.0 的 `linkBin` 在非 Windows 系统调用 `fixBin(cmd.path, 0755)`，因此完整安装会修改这个被跟踪文件的执行权限。Windows checkout 使用 `core.filemode=false`，本地的无差异结果不能排除该问题。

修复把这个入口的 Git 模式改为 `100755`，内容字节不变；常规 CI 的安装后检查改为全部文件的 diff，不再只看锁文件。

历史验证工作流在 Ubuntu / Node 22 / pnpm 10.14.0 中分别执行（[9501bdc8 验证记录](https://github.com/seedleap/agent-whitebox-world-sdk/actions/runs/35321012121)）：

1. Checkout 212dc1b8，完整安装，必须复现仅 cli.mjs 的模式变化，且文件内容 diff 为零。
2. Checkout 修复提交，完整安装，全部已跟踪文件及模式必须不变。
3. 生成目录核对、类型检查、真实 runtime prebuild、原生 MCP 初始化、18 个工具的发现及 4 个入口文档请求、人形资产查询/描述、capsule 与协议回归。

PR #274 review 后，持续回归已移入 `.github/workflows/ci.yml` 的 `checks` lane：所有 PR 及 `main` / `dev` push 都执行完整非 frozen 安装、全部 tracked 内容与模式的 clean 检查，并在 runtime build 后运行真实 MCP 启动 smoke。现有 `validate` 汇总门禁依赖 `checks`，启动失败会使门禁失败。删除原来的分支专用工作流；不在每次 CI 重装历史故障提交。主 CI 使用共享 setup-validation 的 Node 24.3.0 / pnpm 10.14.0。

维护脚本 `scripts/integration/creator-startup-smoke.mjs` 使用固定 prebuilt manifest 与真实 MCP；它不启动模型、浏览器或付费生成任务。完整场景的技术交付和视觉验收仍以平台新任务的实际结果为准。
