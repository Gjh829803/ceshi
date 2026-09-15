# 相机状态交接 TODO

> Historical checklist from before the camera migration. Current ownership and
> extension contracts are in [the architecture](../three-sdk-architecture.md#相机控制权与交接);
> completed restoration and selection work is recorded in
> [behavior restoration](2026-09-14-camera-behavior-restoration.md) and
> [view selection review](2026-09-14-camera-view-selection.md). Unchecked items below
> retain their original historical status and are not a current defect inventory.

更新日期：2026-09-12。面向 SDK、Creator 和 Episode 维护者。

目标：梳理相机状态交接，避免修复一个画面症状后，遗漏同一操作链中的取景、碰撞或恢复问题。
本文件只维护待办和完成标准；设计约束以[相机控制权与交接](../three-sdk-architecture.md#相机控制权与交接)
为准，工程验证遵循 [Runtime 检查表](runtime-deep-review-checklist.md)。不增加生产 Agent 的固定检查步骤。

## 当前状态

以下“已修复”仅表示本地代码和指定用例验证完成，不代表已合入 main 或更新线上冻结交付。

| 问题 | 状态 | 已有证据 |
| --- | --- | --- |
| 上／下车后的偏轴构图在俯仰操作中产生额外横滚 | 已本地修复，`f156bf2f` | 同一试车场前后对照；保留作者设定的开场倾角，车辆旋转数据不变 |
| 翻车下车后人物出画，继续行走仍不可见 | 已本地修复，`943a3f2a` | 人物未隐藏且正常落地；修复后在原坡道位置按实际 F 键下车，全身入画，继续行走可见 |
| Episode 换起点后人物已移动，共享镜头仍留在原开场位置 | 待修复 | 海湾 Case 对照：原起点激活后跟随距离约 12.5 m，换起点后约 107.5 m，录像主体出画 |

前两项说明状态交接存在缺陷，不足以推出整个相机架构需要重写。此前验证偏重横滚与技术状态，
没有同时验收下车后的主体可见性；后续必须按完整操作链验证。

## P0：明确状态边界并修复已知缺陷

- [ ] 盘点相机状态的来源、所有者及保存／恢复时机。
  明确作者声明的 opening、用户当前轨道与缩放、有效跟随主体、碰撞回缩结果、渲染插值状态、
  reset 基线及 Episode 起点分别何时变化。结论更新到现有架构文档，不另建一份相机规范。
  **完成标准：** 每次交接能明确回答哪些状态保留、哪些重算、哪些仅临时使用；临时机位不进入默认构图或重置基线。

- [ ] 修复 Humanoid 的 Episode 起点与共享镜头迁移。
  从 `world.ts` 的 `episodePort().prepareSegment`、Humanoid `prepareEpisodeStartOwned` 和
  `HumanoidCameraFollow` 的 pending／active 路径核对，比较普通角色的 `relocateEpisodeStart` 消费方式。
  **完成标准：** 起点准备完成时首帧已正确取景；第一次真实输入不放大跟随距离、不突然换构图；
  连续录制不同起点、释放录制控制权和 reset 均恢复正确状态。保留失败 Case 做回归。

- [ ] 联合复核两项本地修复。
  检查取景平移、横滚保持与碰撞恢复的组合，不仅分别运行各自的单项测试。
  **完成标准：** 修复人物出画后，原有倾斜问题不复发；作者明确设置的倾角、手动环视与缩放仍有效。

## P1：补齐操作链与实际画面验收

- [ ] 建立主体切换回归矩阵，优先覆盖以下组合。

| 操作链 | 重点检查 |
| --- | --- |
| 开场 pending → 首次移动／环视 → 上车 | 起始构图、首次接管、主体身份和距离 |
| 正常驾驶 → 翻车 → F 下车 → 行走 → 再上车 | 人物落地、模型可见、画面入框、视角水平、控制对象一致 |
| 靠墙／坡道下方回缩 → 下车 → 走到开阔处 | 不保存受阻机位；合理避障后恢复预期距离与取景 |
| 手动环视／缩放 → 上下车／更换主体 | 用户选择保留，临时偏移不累积 |
| 第三人称 ↔ 第一人称／肩后视角 → 下车 | 眼位、人物裁切、视角权限和控制权正确衔接 |
| 上述状态 → reset → 再次输入 | 恢复封存首帧，不残留旧主体、回缩或横滚状态 |
| 同一交付 → Episode 多起点录制 → 释放 | 首帧与后续帧一致，没有第二套相机或时钟 |

- [ ] 把主体可见性纳入可复现用例的验收。
  同时检查主体有效 ID、模型有效可见性、身体投影范围、实际遮挡及镜头是否进入实体；
  通过真实截图／短录像确认，不把 `visible=true`、镜头目标正确或工具 `passed` 当作画面通过。
  **完成标准：** 第三人称用例在具备合法取景空间时能看到人物；空间确实受限时保留可解释证据，
  不通过穿墙、隐藏遮挡物或改变车辆物理来制造“可见”。

- [ ] 在交接时刻和恢复阶段分别取样。
  **完成标准：** 覆盖交接前、交接发生帧、第一笔输入、碰撞回缩与恢复后的画面；
  固定步进、显示插值和捕获之间不互相污染状态，截图本身不推进模拟。

- [ ] 将有效复现整理到所属测试目录。
  SDK 测试维护状态与几何断言；Creator／Episode 测试维护各自的真实消费路径。
  **完成标准：** 使用相同场景、输入和版本能复现失败并验证修复，测试进入现有 test census；
  不依赖某个人电脑上的临时目录，不把维护回归塞进每次世界生成流程。

## P1：诊断与交付

- [ ] 核对现有诊断是否足以解释“人不见了／视角歪了”。
  优先复用 snapshot 和相机观测，定位实际主体、骑乘状态、镜头模式、预期／实际机位、
  距离、碰撞阶段及画面可见性。缺失证据按实际需要补充，注明未知或未测量。
  **完成标准：** 能区分模型隐藏、人物出画、真实遮挡、错误跟随对象和机位进入实体；
  观测附源码／运行时身份及采样时刻，不修改运行状态。

- [ ] 完成目标分支集成后的验证与交付身份核对。
  **完成标准：** 在最终提交上完成受影响测试、类型检查、test census 和 runtime prebuild；
  Creator 与 Episode 实际消费的字节匹配交付身份，CI 通过；清楚记录代码合入、
  本地试玩更新和线上产物更新各自的状态。旧交付包不能仅因 SDK 代码已修复就视为已更新。

## 现有定位入口

- [共享相机状态与交接](https://github.com/seedleap/agent-whitebox-world-sdk/blob/2852468670864e7b829c7f84c0f56f280494f88f/packages/three-world/src/camera.ts)
- [Humanoid 采样与呈现适配](https://github.com/seedleap/agent-whitebox-world-sdk/blob/2852468670864e7b829c7f84c0f56f280494f88f/packages/three-world/src/humanoid-runtime/camera.ts)
- [Humanoid 起点与上下车消费](../../packages/three-world/src/humanoid-runtime/runtime.ts)
- [World / Episode 运行时入口](../../packages/three-world/src/world.ts)
- [公共相机契约测试](../../packages/three-world/src/camera-public-conformance.test.ts)
- [Creator 编程与检查](../../packages/creator-host/docs/agent/programming.md)

本次工作树的本地调查产物位于 `.codex-tmp/rollover-camera/`（含 `result.md`、`exit-result.md`）
与 `.codex-tmp/bay-courier-049-local/`（含 `case-result.md`）。这些是未入库的辅助证据，
不能替代上述待办要求的可复现测试及正式交付记录。
