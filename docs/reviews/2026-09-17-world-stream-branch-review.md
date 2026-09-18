# World Stream 分支检查与 dev 合入记录

日期：2026-09-17。功能分支：`codex/world-stream-ui`。

## 范围与合并方向

检查并提交独立 UI 协议/React 适配、流 Host/播放器、调试控制台、Creator/Episode 集成、
本地直出 UI、Agent 指南、公共海滨小镇 demo 和依赖锁文件，共 111 个变更文件。
功能提交 `a41bf3d26f08fa49c3aecd1d29e5176915d4b501` 已先推送到同名新远端分支。
随后将 `origin/dev` 的 `f6000cdcb9cab19091511f174c4130f913dfe0dc` 合入本功能分支。
无文本冲突；远端 dev 不在本次推送目标中。没有创建合并到 dev 的 PR，平台 case 验证由用户执行。

## 检查与修复

- 世界内部 reset 会撤销远程输入 lease，原 Producer 继续使用失效对象，导致后续移动失效。
  新增真实浏览器回归，先复现重置后位移接近 0，再在 onReset 中重新获取输入权限，原有固定时钟不变。
  复测确认 UI 回传触发世界 reset 后仍能移动，Host 会话和 epoch 未被错误重建。
- 仓库布局测试仍只列旧 packages。保留精确目录断言，补入 world-ui、stream-protocol、stream-player、stream-host 和 stream-web。
- 对照双方 World 实现，保留本分支的远程输入/Episode 互斥、原子帧 metadata，
  同时保留 dev 的 vehicleCondition/环境参数传递和载具恢复变化。测试清单包含双方新增条目。
- 海滨小镇 14 个源码/资源文件已纳入 Git；生产工作区、视频、交付包、私有配置与运行缓存仍被忽略。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| 提交前相关回归 | 10 文件、37 项通过；新增 Producer reset 回归从失败到通过 |
| 最终契约测试 | 72 文件、820 项：首轮 819 项通过；修正目录清单后 repository-layout 4 项定向复测全部通过 |
| 最终重型回归 | 112 文件、2047 项全部通过，串行隔离执行 |
| 独立 Node 测试 | 32 文件、284 项：首轮 283 项通过；唯一 Python 环境失败项在 Python 3.12.14 下通过 |
| 类型、静态检查 | pnpm typecheck、pnpm lint 通过 |
| workspace 与测试清单 | 184 文件（72 contract / 112 resource-heavy）；边界检查通过 |
| 构建 | Stream Web、SDK Playground 构建通过；保留既有大 bundle 提示 |
| Runtime | 最终 three-sdk prebuild 通过 |
| 依赖 | 仓库 frozen/offline 安装通过；独立 Creator 源码包 frozen/offline 安装及真实 UI 示例编译通过 |
| Git | diff 空白检查通过，无未解决冲突 |

首轮独立测试使用系统 Python 3.9.6，不支持 `zip(..., strict=True)`；复测切换到已安装的 Python 3.12.14，
未修改业务代码、断言或超时。复测只覆盖失败项，不把原始失败日志改写为一次全绿。

## 可复核身份与证据

- 合并后 SDK runtimeHash：`9dde0dbe9b8339bf03e0408c5d217ae6808c73b299747bbc4e3ffd17b0041dec`。
- 本地独立 Creator stage sourceHash：`sha256:e41687afc7bf4358dce2f1709c415c09962b8314164082f909a4e9b4dc80e7cd`。
- dependencyHash：`sha256:f6554edf25b9518946000e8044887ed44ed0ebfe87a12bc4957ce208df15d46f`，共 648 个源码/资源条目。
- stage 状态为 `staged-unfrozen`；本次没有构建 Linux 镜像、上传工具包或启动平台任务。
- 早先海滨小镇正式交付的身份是历史验收快照；合入新 SDK 后重新编译会形成新身份，不复用旧快照的验收结论。

本地原始证据位于 `.codex-tmp/`（不提交生成日志）：
`stream-reset-red.log`、`stream-reset-green.log`、`stream-merged-test.log`、
`stream-merged-layout-recheck.log`、`stream-merged-resource.log`、
`stream-merged-independent.log`、`stream-merged-python-recheck.log`、
`stream-merged-typecheck.log`、`stream-merged-lint.log`、
`stream-merged-web-build.log`、`stream-merged-editor-build.log`、
`stream-merged-prebuild.log`、`stream-merged-capsule.log`。

公共 demo：[seaside-town](../../examples/worlds/seaside-town/README.md)。
本地启动、UI query 以及流式启动规则保存在其 README 和 [Agent UI 指南](../../packages/creator-host/docs/agent/ui.md)。
