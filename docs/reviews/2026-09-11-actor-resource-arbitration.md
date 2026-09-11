# 角色资源仲裁与实际交接

角色动作、导航、动画播放和持续交互关系通过同一同步资源表获取执行权。
资源表不移动角色、不播放动画、不推进时钟。目标及槽位仍由 WorldInteractions
管理，预约在同一同步调用内检查目标并取得全部角色资源，再发布 claim。

| 执行状态 | 占用 |
| --- | --- |
| 导航 | locomotion、animation |
| 全身动作、匍匐、攀爬、翻越 | locomotion、animation、pose、双手 |
| 拾取完成后持有 | 双手，可继续导航 |
| 坐姿关系 | locomotion、animation、pose，安全起身后释放 |
| 显式资产动画 | animation，完成或停止后释放 |

请求冲突返回 `ACTOR_RESOURCE_BUSY`，观察通过 `getEntityState(id).controlOwners`
返回副本。显式 humanoid 输入与导航互斥，先清除输入或停止导航再交接。
背景自主导航在资源忙时等待。角色删除、取消、reset 和 dispose 按原 owner
释放；攀爬进入翻越时原子转移，旧 owner 不能释放新 owner 的占用。
清理恢复胶囊与控制器后才发布动作终态和释放资源。

批量场景命令在独立候选表中按顺序模拟释放和获取，并在提交前重新验证。
回归同时覆盖拒绝“播放循环动画后开始导航”的冲突组合，以及允许
“停止导航后播放动画”和“停止动画后开始导航”的合法交接。

## 证据

- 针对性 104 项测试与类型检查通过，日志为
  `.codex-tmp/r0/actor-resource-policy-final.log`、`actor-resource-policy-types-final.log`。
  包含真实完整人物和资产动画、原子多角色获取、持续手部/座位占用、低顶清理、
  匍匐输入结束后仍保留姿态资源，以及不会修改真实状态的候选资源表。
- 真实 Creator 录制通过；独立 Episode 完成争物、搬运放下、双座位、单席释放、
  reset 和指定右席 sit/standUp。报告和近景在
  `.codex-tmp/r0/actor-resources-browser/`，观察不推进 tick。
- 浏览器与预构建 runtime 均为
  `ca1f01f1b1ebd9c1aa5825858a117b4a29af7d305bfbf976dda1a86116d6a760`。
  预构建输出 `.codex-tmp/r0/actor-resources-runtime/`。
- 独立只读复核未发现新的确认 P1/P2；审查未另行跑整套测试。
  SDK README 与接入 Skill 已说明当前资源和交接规则。
- 最终 SDK 54 文件、852 测试通过，日志为 `.codex-tmp/r0/actor-resources-sdk.log`。
  类型检查、lint、test census 和 runtime prebuild 通过；日志分别为
  `actor-resources-types-final.log`、`actor-resources-lint.log`、
  `actor-resources-census.log`、`actor-resources-prebuild.log`。

## 未完成范围

本记录不证明 R4 的源动作事件、操作身份/去重及 R5 姿态分层已经完成。
骑乘仍通过已验证的状态前提与导航交接处理，资源表不替代这些物理前提。
人工视觉验收、远端 CI 和发布未执行。

匍匐回归另外暴露地图粗大 cuboid 的原生 Rapier 接触精度问题：同地板等体积
4 米分块后正常。此处资源用例使用精细分块，不能据此宣称粗大地板已修复；
原地板失败日志与修复任务保留在主计划。该问题仍需真实地图、载具和性能验证。
