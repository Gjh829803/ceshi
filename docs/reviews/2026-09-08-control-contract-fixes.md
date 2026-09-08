# 控制契约 8 项修复

基线：`6b1c94ef`；开发分支：`codex/control-contract-fixes-20260908`。

本次修复让已有能力的描述、输入与执行结果一致。沿用两个 package、原生 Three 创作、单一运行时所有者；没有新增场景语言、控制框架或生产门禁。

| 问题 | 最终行为 | 主要归属 |
| --- | --- | --- |
| `jumpPressed` 跳跃但相机不激活 | 普通世界用同一个归一化跳跃边沿驱动移动和相机；显式 false 优先 | SDK engine |
| 禁用导航仍宣称 NPC 可导航 | describe 与 execute 共用能力限制；执行前明确拒绝，保留 stop | SDK world |
| Training 角度/距离经像素换算而失真 | 内核接收 radians/meters；旧像素入口保留灵敏度；零距离配置不产生 NaN | Training camera/runtime |
| probe 与提交的起点 schema 不同 | 共用完整 start schema，包含可选 Training 载具状态 | Episode contracts/MCP |
| walk 被自动提升为 run | walk 保持步行；run 可因观察、跳跃、落地而降速；不强制每段同时走和跑 | Episode player/capture |
| approach 名称暗示走近 | 兼容原名，明确准备性重新定位；成功回执包含主体、载具与实际位置 | Training command/Creator |
| coverageTargetIds 被误认为执行目标 | 旧字段仍可读取，仅作 annotation；不控制镜头或判定可见性 | Episode schema/guide |
| 不同载具的 boost/轴意义不透明 | 按控制族提供说明；当前世界按需返回有效输入指南，未使用轴保持中性；云入口也读取当前绑定与指南 | Training describe/Creator discovery |

## 兼容性与反馈

- `training.approach(id)` 直接调用仍返回 boolean。World 命令的 applied receipt 增加可选 relocation result；失败不返回成功效果，同一 commandId 不重复移动。
- `episode_probe` 是可选的局部放置查询，接受完整起点不意味着已经通过路线或画面验收。
- 旧 materialized SDK 没有新增 input guide 时，发现工具明确返回说明不可用，不替换成 Host 的能力说明，也不阻塞其余查询。
- 步态统计仍记录实际 walk/run 时间。录制策略版本从 3 升至 4，避免把旧自动冲刺结果当作新策略的缓存。
- 人物/载具、镜头与物理仍由既有 SDK 所有者推进；说明查询不推进模拟，也不向每帧快照重复塞入完整文案。

## 验证

回归覆盖普通世界跳跃激活、导航的 move/follow/resume 拒绝原因、三种相机模式的步行/骑乘角度、米制与旧像素缩放、零距离、approach 幂等回执、旧 workspace 指南降级、完整 probe schema、纯 walk 录制和旧 coverage annotation。

独立复审发现并复验了纯 walk 末尾仍被旧门禁拒绝、resume 错误优先级覆盖、旧 workspace 缺少新增指导文件三个关联问题；没有遗留 P1/P2。

实际验收使用自制摩托与预设人物，通过 Creator 自检、交付归档、Episode 源适配、完整 Training 起点探测和独立录制。测试资产和视频保留在忽略的 `.codex-tmp/control-contract/`，不进入 Git。此次没有云调用或视频供应商提交。全链路审查发现的额外缺口单独记录在[能力对照报告](2026-09-08-agent-playground-capability-audit.md)，不混作这 8 项已修复内容。

最终验证：

- Vitest：242 项 contract + 568 项 resource-heavy，67 个测试文件全部通过。
- 相关 Node 检查 140 项通过；typecheck、test census、workspace boundaries、runtime prebuild 和文档链接/diff 检查通过。
- 最终 runtimeHash：`8ec0ba3a84556e562aa757b8cf7b3cc945bf86276a52394cc54e3c3eecb03b01`。
- 本地实际验收：`.codex-tmp/control-contract/run-1788882341674/result.json`；Creator 约 10.63 秒输入、Episode 2 秒/48 帧/24 fps，重复截图和 reset 首帧一致，实际转弯 roll 最大约 0.055 rad。
- 这是局部真实交付与录制验收，不是六段正式生产、所有载具画面人工验收或远端 CI；没有云调用。

