# 平稳镜头与原佳作账号对照

用户要求合入之前继承首帧、平稳跟随的镜头版本，并用原佳作实际账号重跑两例。
分支 `codex/creator-opening-good-accounts`；实现提交 `8371a2c7`。

## 合入内容

从 `2a7a2f9b` 原样迁移五个文件：camera.ts、camera.test.ts、公开 contracts.ts、
SDK README 和 Creator examples.ts。普通 `setCameraFollow()` 继承 Agent 已定义的
首帧位置、朝向、投影和构图，平滑跟随人物平移；修正旧目标过渡的四元数别名错误。
显式距离/俯仰参数仍表示 Agent 有意切换到目标跟随构图。

历史同场景实测已支持这版首帧继承行为；本轮重新运行了 183 项 SDK/Creator 测试，
包含 29 项镜头测试，全部通过；类型检查通过。本轮没有据此宣称遮挡恢复所有情形
都已解决，也没有把镜头连续性等同于新生成世界质量。

## 固定条件和实际运行包

| 项目 | 本轮 |
| --- | --- |
| 模型 / 推理设置 | gpt-6-astra / xhigh |
| 并发与作者任务上限 | 两例并发 / 每例 2700 秒 |
| 峡谷指定账号 | A，5bb04e93264f，原任务 gen_fe1079992dc9b5e3 |
| 环岩指定账号 | B，f7abcf1b8d89，原任务 gen_ffb6845e2a241543 |
| 通用 prompt SHA256 | 77f48b6053f8bfcc45328c5f4d42ffe5386c98ee4b5012a27d51bcf59ab1c323 |
| Creator 运行锁 | c45b168a562065942ece88e0462ea65d5cc60fa9341a212e0ba98bf6ab30f630 |
| SDK runtimeHash | d9c8496e04866bb4ef228dc34481c349d32a20c5369112b3d86731469773753f |

复用已部署的不可变镜头运行包，打包来源提交为 `2a7a2f9b`。
逐文件核实云端 32 个 SDK/Creator 非测试源文件与本地合入结果一致；
4 个历史启动文件与原提交和上一轮运行包一致，完整安装闭包检查通过。
本地后续增加的 Host effort 参数支持与云端历史启动器分开记录。
本次没有重建或覆盖上一轮运行包。

与运行 `known-good-xhigh-good-accounts-two-20260906` 比较：完整 instruction、
默认参数、输出清单、参考图片和账号选择均一致；case-input 仅变更 runtimeHash，
options 仅变更云端启动器路径。SDK 镜头及其接口/简短示例是本轮实验变量。
不向模型补充个案修复提示，不编辑生成世界，不设助手评审门槛。

## 执行和记录

新运行 ID：`opening-follow-good-accounts-two-20260906`。
完成冻结请求与参数比对后，等待当前同账号对照运行结束，再自动并发投递。
实际任务 ID、服务端账号选择、最终执行账号和结果写入
`../account-performance/ledger.json`；缺失的实际账号保持未验证。

[本轮独立评测入口](http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/runs/opening-follow-good-accounts-two-20260906/)
展示生产状态，交付后直接可玩。
[上一轮同账号对照](http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/)
保持原入口；两个发布器分别写入自己的页面。

本地证据：`.codex-tmp/opening-good-accounts-two-20260906/` 中的
local-verification.json、installed-source-verification.json、
installed-closure-verification.json、dispatch-record.json 及后续执行记录。
