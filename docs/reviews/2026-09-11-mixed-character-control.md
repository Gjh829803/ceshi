# 混合角色的输入、镜头与 Episode

普通角色和完整人形现在可以在同一世界切换主角。Engine 是受控实体选择入口，
HumanoidRuntime 不再公开另一个 setControlledActor。选择普通角色后，人形输入
Actor 明确为空；完整 NPC 仍可通过显式 actorId 接收命令和 snapshot(actorId)。
没有回退到上一个人物或第一个注册人物。World snapshot/describe 和 Episode 的
humanoid 聚合能力只描述实际受控的完整人形，不能据运行时对象存在推断输入能力。

相机目标独立于输入目标。Engine 根据当前跟随能力推进一个相机 writer；普通
角色的 rig 与完整人物的 follow camera 在同一固定循环中交接，场景 authored
相机释放两者。失效目标或无效配置先拒绝，不能破坏原 owner。删除跟随 NPC 后
观察仍然正常；未激活的人形相机没有有效配置，settings 明确返回 null。修改其
默认视角只保存参数，不能抢占另一个镜头。Playground 读取可编辑配置的函数已
直接更名 readEditableProfile，保留用户原配置而不假称它是有效运行值。

Episode 按实际主角选择地面输入、自定义 movement adapter 或完整人形动作。
普通起点检查使用自己的胶囊，包含借用世界的地图和其他完整人物；不能站在另一个
人物上，也不能把人形登乘配置默默忽略。录制期间外部选择主角或跟随目标会在写入前
拒绝。重置与替换地图不需要藏一个默认人形维持世界。

## 验证

- SDK 全量 54 files / 815 tests 通过；其后起点错误配置和 inactive profile 抢镜头
  两个补充修复分别通过针对性红/绿以及最终 196 项相关回归。未累计重复测试数。
- Creator schema/capture、Playground profile 与 Episode action controller 共 62
  项回归通过。typecheck、相关 lint、test census、prebuild 和 diff 检查通过。
- 独立只读审查发现缺失目标中毒、删除目标后的观察、无效 follow 交接三处边界，
  修复后复查通过。默认视角抢镜头另有真实红测，后续 guard 与文档复核通过。
- 最终运行时 `6a8305e443a6eb429fbb80843367259d5b6a80f7a779dbd10be46cfbc7d13ad4`
  的普通主角 + 三个完整人形，在真实 Creator playtest 和独立 Episode 中通过。
  证据 `.codex-tmp/mixed-control-camera-owner-final/report.json`，包括主角输入、NPC
  移动、第一人称、重置和错误列表。另有真实自定义 XYZ 主角 Episode 合同测试。
- 首次浏览器断言错误地假定前进必然是世界 +Z；场景继承开场朝向，实际输入基准为
  -Z。改为记录控制朝向与位移的点积，实测约 1.9 m，原人物未受普通输入驱动。
- 前一运行时 `7883d96540d4bb628faa9f577e1338e07c0092ab2e9605cf04a9cd547082a460`
  的完整人形 Creator/Episode 通过（`.codex-tmp/mixed-control-full-browser`）。
  Playground 实际镜头检查通过：拖动 yaw -0.4 / pitch 0.16 rad，跟随臂漂移约
  0.00010 m，地图切换、巡逻艇接近/登乘及三视角正常，错误为空。证据
  `.codex-tmp/mixed-playground-camera/report.json`；服务已关闭。
  后续两处修改仅是普通起点拒绝和 inactive profile 的 owner guard；以上旧字节
  的完整人物/Playground 证据未冒充最终字节重跑，统一最终验收仍在 R6。

R2 混合角色能力已实现。动态目标、动作事件、内容 binding 收敛及整体 R6 深审仍需
继续，当前没有整体完成、远端 CI 或人工最终验收声明。
