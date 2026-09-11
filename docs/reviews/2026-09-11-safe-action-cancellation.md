# 动作取消与角色移除边界

取消请求与清理完成已分开，继续使用既有 OperationLedger 和动作执行 owner。
不增加第二套 operation 结果协议。

- 底层取消返回仍在清理时，operation 保持 `running` / `cancelling`，wait 不提前完成。
- 滑铲保持低顶下的低姿态，方向输入移出后执行退出。退出每个固定 tick 复核净空；
  后来进入的顶碰撞会使动作退回低姿态，不能以先前净空判定提前结束。
- 坐下播放开始后取消，完成进入、保留占座、执行安全起身，最后才释放座位并 cancelled。
  进入播放前的预约可直接取消。Sit 的资产要求包含 exit clip。
- 起身过程取消仍完成退出；握取后的 pickup 取消保持 held，需显式放下、脱手或移除角色。
- despawn 先释放实际 Actor，再在同一提交边界结束它的 operation，不等待下一 tick。
- pause、查询和 wait 不推进清理。reset/dispose/map replacement 结束旧 generation。
  Episode 释放捕获控制时使用相同取消请求；尚未安全完成的动作保持真实运行状态。

验证：角色生命周期、World、runtime、共享交互、Creator schema、Episode action
controller 共 176 tests 通过。独立审查发现滑铲退出后顶移动的 P2；真实 Rapier
碰撞复现修复前错误 cancelled，修复后 runtime/共享交互 96 tests 通过。
审查者只读复核确认该项修复闭合，未重跑测试。
这两组包含重叠，不将其相加报告为独立测试总数。typecheck、lint、prebuild 通过。
运行时 `2d02a75a04e50bc5e48b32f5bf59cf05602ecb811b71ed6cf78c5dcd5430abad`。

本轮完成安全取消与同边界移除，并非完整 R4：动态目标身份、事件去重与最终浏览器
消费矩阵继续按实施计划推进。自动测试不替代动作观感的人工验收。
