# 历史基线上的精选迁移与两例对照

2026-09-06。实现 `f9fcf804`；用户已判定效果不佳，要求停止本批并恢复历史基线。峡谷已交付且质量退化；环岩停止状态以运行目录 stop-report.json 为准，本批不宣称两例质量通过。

用户授权本批一起迁移：四元数插值、遮挡回弹、输入焦点/释放、WIP 保存/可玩检查点/失败续跑、云端可靠性、有序单对象三视图、资产搜索和预览图片传输。没有迁入默认构图继承、presentation、静态合批、预算催促或新规划提示。

## 冻结与实际投递

| 项目 | Before | After |
| --- | --- | --- |
| runId | `known-good-baseline-two-20260906` | `selected-migration-two-20260906` |
| Creator runtime lock | `968433bf78ac958c0d7960a12ac2c397311283876c974b594adf58b1ff268c04` | `ccc43eaeccf1417c995d43d9a41d2b06b33821babcb2b259f84395b8567b634f` |
| 峡谷 Job | `gen_3fc4085613628887` | `gen_fdb6069cb8ea3fee` |
| 环岩 Job | `gen_46237a5932d27537` | `gen_287233e49a1ecd3a` |

实际 payload 的完整 instruction 与 model defaults 对应逐字节/结构相同，两张原图 SHA256 相同。`scripts/cloud/three-eval-instructions.md`、`scripts/three-creator/examples.ts`、Creator v1 contracts 和 delivery statistics 源码与 `03b8cb65` 相同。工具返回、capture 公共类型及按需文档会因选定能力而变化，不能宣称所有模型上下文完全相同。

两例 after 均在 08:17:38 UTC 实际启动 CLI。最多两例同时执行，account_concurrency=5、GPT-6/xhigh 与单次预算保持原值；失败后的最多一次源码续跑为本次新增流程。没有个别案例修复提示或修改 Agent 生成源码。

## 实现和验证

- 首次朝向跳变修复先得到失败复现：中点旋转为零，末段约 10.066° 单帧跳变；随后连续性回归通过。保留原跟随距离、俯仰角、视觉目标高度和首帧，回弹默认最高 3m/s。未加入主体构图补偿。
- 输入焦点/Shadow DOM/可见性/捕获释放使用实际 Chromium 测试。另修复了 pending pointer capture 提前释放时不一定触发 lostpointercapture 的边界。
- 三视图完整主体优先、作者排序默认前五、对象或实例代表。对象登记不自动产生三视图；显式请求可包含额外有序对象。原始 PNG 保留，工具显示图片单张最大 128KiB。
- WIP 与可玩 checkpoint 分离；恢复绑定相同图片、请求、runtime 与源码归档。仅确认终止失败后最多一次模型续跑，用户取消/运行中/未知结果不再开任务，产物重取不再调用模型。

相关完整验证：`pnpm exec vitest run packages/three-world packages/camera scripts/three-creator scripts/lib/independent-test-gate.test.ts --maxWorkers 1` 24 文件、368 测试通过；`node --test scripts/cloud/*.test.mjs deploy/three-creator-runtime/capsule.test.mjs` 151 测试通过；类型检查、workspace boundaries 与 census 通过。没有声称重跑全仓每一个不相关测试。

Linux x64 capsule 构建通过，安装到独立 FSx 路径。无模型 cloud doctor 已验证固定 Node 启动、15 个 MCP 工具、真实编译、WebGL PNG、键盘/视频、缓存及 clean Preview checkpoint 解包；安装前后文件闭包相同。原锁、原运行包与 before 产物未覆盖。

独立云端恢复验证已通过：Linux progress worker 首次保存后新增文件，再退出刷新，实际源码哈希改变；按闭包恢复后，真实 MCP 编译与开场 Preview 成功并创建新 runnable checkpoint。源码字节保留，旧 receipt 不复用，前后安装闭包通过，零模型调用/零任务提交。首次测试因受限 PATH 缺少 Python 失败，保留日志后只修正测试环境 PATH 重跑通过，没有修改生产运行包。

同源码补充检查：将 before 两份源码原样复制到独立本地测试目录，由新 SDK 编译/预览并输入 W。两份 author sourceHash 与 before 正式交付一致，无 page/runtime error。此检查不修改云端案例，也不等于最终人工镜头手感验收。首次输入采样受本地帧率影响，不能把每帧峰值与其他环境直接比较。

## 生成观察（待最终更新）

环岩首版保留分层断环与连续峡壁；峡谷首版的构图及结构偏差明显，后续已继续修正。两者已进入真实键盘自测。不能仅凭首版图片、运行时长或调用次数提前判断整体迁移成功。

真实任务已产生 WIP 与 runnable checkpoint，Host 已拉取并校验；生产页面按实际阶段显示，历史入口保留 before，两者无需人工审批即可试玩已有可玩版本。

## 证据

- `.codex-tmp/selected-migration-20260906/`：测试/构建/部署日志、完整请求对照、图片原字节、同源码探测、发布日志。
- `.codex-tmp/three-creator-eval/runs/selected-migration-two-20260906/`：冻结输入和 payload、真实 Job 状态、保存及交付归档。
- [新运行锁](selected-migration/runtime-lock.json)、[实施职责图](../../superpowers/plans/2026-09-06-selected-migration.md)。

## 用户决策

用户在观察效果后明确拒绝本批，要求先恢复 `324befb3` / 历史源码 `03b8cb65` 再讨论选择哪些改动。当前实现、部署证据和产物保留到 `codex/creator-selected-migration-20260906`，恢复动作不删除历史。
