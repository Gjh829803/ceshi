# xhigh 自检说明对照 — 2026-09-06

本轮已完成两例云端生成和生产评测发布。使用的是此前产出较差结果的
D/F 账号，不是原始佳作的 A/B 账号。用户询问后已明确说明：
此轮是固定同账号比较 prompt 的实验，不是原始佳作账号上的效果复现。
账号标签表示历史任务分组，不能据此认定账号本身导致模型能力差异。

## 变更和固定条件

- 分支 codex/creator-xhigh-selfcheck；prompt 源码提交 84800f5561ed87b4d7392c4626a83ae6ff88eab9。
- 只修改通用指令的自检段落，从 441 词到 510 词，净增 69 词。
- 增加首帧主体位置/比例、镜头透视、地标轮廓/纵深的实际图像对照；
  检查移动、持续跑步、跳跃、首次镜头切换、遮挡恢复和重置；
  要求有意义的连通探索，修复后复测，不把技术 passed 当成任务完成。
- 不以出生点目标、过大容差或重复绕圈作为探索成功证据。
- 不新增录像时长、不增加强制 Agent 工作分钟数、不增加人工评审门槛。
- 图像和创作请求不变，仍为 gpt-6-astra / xhigh。
- 通用指令 SHA256：77f48b6053f8bfcc45328c5f4d42ffe5386c98ee4b5012a27d51bcf59ab1c323。
- 实际云端 Creator lock 保持原版：
  968433bf78ac958c0d7960a12ac2c397311283876c974b594adf58b1ff268c04。
- SDK runtimeHash 保持：
  0a52dc8c4c877fc48ea20f730b07c869ee5af411fbafb50d341bcf7bd8d50290。
- 工作区继承现有 Host 账号/effort 校验，但此次调用的是原始不可变
  xhigh launcher。SDK、工具、示例、素材及录制/提交契约都未修改。
- 本轮没有部署 ultra worker 补丁。

prepare/run 使用同一显式运行锁与参数。投递前逐项比较：
完整 instruction 仅替换原通用指令前缀，case-input 只变更
creatorInstructionsSha256，默认模型参数、图像哈希和声明产物均保持不变。
实际安装闭包和实际启动器身份已验证。

## 账号控制

| 案例 | 上一轮 xhigh 对照 | 本次成功任务 | 账号 |
| --- | --- | --- | --- |
| 峡谷 | gen_ae7b0e6bb2ebb118 | gen_f0ace71487c78049 | D，身份哈希 1da59801262c |
| 环岩 | gen_3fad93aae48e58b7 | gen_e682b8abea057f96 | F，身份哈希 8c723340d43d |

provider items 元数据确认：本轮的两次尝试都实际使用了各自固定的账号。
账号选择仅在 Host 请求参数中，不进入创作指令或 case-input。
初次投递前仅说“上一轮账号”不够明确，未突出这是此前较差结果的账号；
此限制必须保留在实验解释中。

## 云端执行

主运行 known-good-xhigh-selfcheck-two-20260906 的两单：
gen_d266668fa189b50b、gen_088cd064cb508d0b，在创作中途因
Selected model is at capacity 结束。峡谷已开始校验，环岩已出预览，
都没有最终交付。原源码、事件和失败预览保留，不用它们判断 prompt 效果。

确认两单终止、running=0 后，仅同条件重试一次：
known-good-xhigh-selfcheck-two-20260906-r2。两例并发运行，不更换账号、
图像或指令，不添加个别案例修复提示。它们是新的同条件尝试，没有
给 Agent 携带人工修正的世界，也没有手工编辑其产物。

| 案例 | 成功尝试耗时 | 最终有效实测 | 最终目标事实 |
| --- | ---: | ---: | --- |
| 峡谷 | 21m07s | 190.46s | 两个地标均未在实测中抵达；唯一 reached 是出生点角色目标 |
| 环岩 | 26m14s | 281.82s | 抵达拱环和后方石柱两个目标；角色出生点目标另列，不计探索 |

这些时间不含初次容量失败和排队。
两份最终实测没有报告浏览器/SDK 错误，但不等于零缺陷或五分钟探索内容已验证。
目标未抵达不等于已证明不可达；它表示这一段真实键盘测试没有验证抵达。
前后任务自行选择了不同目标，不能把 reached 比率直接当成同一套评分。

## 观察与结论

Agent 确实进行了修复和重测：
环岩修正了石环平躺问题；两例因地面边界坠落多次扩大地形；
峡谷还识别了没有掉落却持续顶住台地、探索效率不足的测试并调整输入。
这些属于可观察的自检行为，未由本地助手修改案例实现。

但是，最终峡谷几何仍很简单，环岩的岩壁和环体层次仍弱、人物仍被下边缘
裁切。两例均未恢复用户指定原始佳作的首帧质量。
本轮说明“更多自检和重测”与“参考图还原质量恢复”是不同结论；
这不是质量通过或原始佳作复现成功的证明。

## 已发布产物

- [峡谷](http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/cases/gpt6-holdout-013-grand-canyon-courier--three-sdk/4575628136b7ac180df154ed4682d659affca62252cecd3c03af440d1c045c99/playable/index.html?play=1)
- [环岩](http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/cases/gpt6-holdout-screenshot-20260823-193953--three-sdk/273c4db33d080d7687166062254b6184f805e487a7f571ee982b15c7bb5986bc/playable/index.html?play=1)

两例均经 Host 产物完整性校验后直接发布，未设助手评审门槛。
最终公开进度和两个入口均核对 HTTP 200，所有本轮协调器、观察器和发布器均已结束。

## 本地证据

.codex-tmp/xhigh-selfcheck-two-20260906/ 保留原/新指令、冻结账号选择、
运行锁及实际启动器验证、首轮容量失败记录、两轮独立首帧图片、
results-comparison.json、生产发布检查和日志。
.codex-tmp/xhigh-selfcheck-r2-20260906/ 保留重试的独立投递记录。
两次原始请求、事件流、API 元数据和交付包保留在
.codex-tmp/three-creator-eval/runs/ 对应运行目录中。
