# GPT-6 Ultra 两例实验 — 2026-09-06

状态：项目启动器已支持 ultra；云端 worker 拒绝 ultra 参数，尚未进行模型生成。
这不是完成的两例效果测试。

- 分支：codex/creator-ultra-eval。
- 启动器源代码：e3a86c1a2389170142c43ad750626f8617ec2d03。
- 本次 runtime lock：44b4ae3e2a61e59b395b8d7aaa2ef7a714df7f58129e4e81de22a0e0e0d9e64c。
- 复用原始 SDK runtime：0a52dc8c4c877fc48ea20f730b07c869ee5af411fbafb50d341bcf7bd8d50290。
- Codex 二进制保持 f9d4eab2…；实际 bundled catalog 支持 ultra，配置解析成功。
- Ultra 是最高推理和自动委派的 CLI 模式，不是人为延长最短创作时间。
- 模型、图片、创作指令、SDK、示例、素材、自测契约和时间预算保持原样。
- 两例分别固定到最近一次 xhigh 对照的实际账号；账号选择没有进入创作指令或 case-input。

## 已做验证

项目侧 25 项测试通过，包括：
精确 ultra 入参、拒绝重复/冲突 effort、运行锁一致性、
交付回执 effort 一致性、服务端账号选择/effort 回显一致性。
原始 xhigh 行为保持兼容，未运行或迁移 SDK 镜头/物理修改。
已安装的独立四文件 launcher 与原 SDK/browser/prebuilt closure 校验通过。
normal instruction 逐字节保持不变；case-input 只改变运行包身份和 effort。

## 真实云端结果

运行 ID：known-good-ultra-two-20260906。两例按并发 2 投递。

| case | job | 结果 |
| --- | --- | --- |
| 峡谷 | gen_6fb3740875e43d72 | 创建成功，worker 参数校验失败 |
| 环岩 | gen_7dbdab2947220076 | 创建成功，worker 参数校验失败 |

两单都返回：
`ValueError: unsupported Codex reasoning_effort: ultra`。
provider=completed，failed=1，running=0，未产生 Creator launcher 或模型交付。
失败状态已发布到生产评测页面；不将其宣称为 Ultra 已成功运行。
所有本轮协调器、观察器和发布进程已结束。

## 已定位的服务端补丁

本地服务端副本的 ray_pipeline/generation/codex_runner.py 只允许
low/medium/high/xhigh。独立 worktree 分支 codex/codex-ultra-support-20260906，
提交 4a99e1b，增加 ultra 白名单，并增加 CLI 透传和旧行为保留测试。
两项标准库测试修复前失败、修复后通过；本机没有 pytest，
未运行完整 generic-generation pytest 集成套件。

该服务端副本原有的 reconciler 未提交改动保持不动。
补丁未部署到共享 worker；需要将该最小改动正常发布到实际执行代码包后再投递。
没有使用 xhigh 作为伪装参数，也没有把其他 effort 结果标为 ultra。

## 本地证据

.codex-tmp/ultra-two-20260906/ 中保留：
- runtime-lock.json、installed-runtime-verification.json、cli-ultra-support.json。
- account-pins.json、dispatch-record.json、tests.log。
- backend-ultra.patch 和 server-request.md（可转发给服务端）。
- backend-fix/ 独立服务端 worktree。
- gallery/ 与发布日志。
原始 API 请求和失败 items 在 .codex-tmp/three-creator-eval/runs/known-good-ultra-two-20260906/。
