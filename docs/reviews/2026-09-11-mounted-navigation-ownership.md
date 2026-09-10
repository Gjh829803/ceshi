# 步行导航到驾驶的控制交接

完整 Actor 登乘后结束自己的步行导航并暂停 patrol。已骑乘角色的 move/follow/resume
地面导航请求明确拒绝；驾驶仍由显式人物输入进入既有车辆 owner。Runtime 不会把
地面速度意图转换为驾驶输入。下车后可再次请求步行或显式恢复 patrol。
失效输入 lease 的释放不再要求已销毁的 Runtime 可用，也不会覆盖后来获得的输入。

独立审查发现：同一 plan 内 A/B 导航，A 登乘曾连带取消 B。按 actor 取消现在只
结束该 actor 的导航 step，其他步骤继续。整组 operation 待全部步骤终结后汇总；
包含取消步骤就返回 cancelled，并保留各 step 结果。显式 operation.cancel 仍取消整组。
这一语义同样用于切换控制角色、停止单角色和替换它的导航，避免跨 Actor 误停。

审查再次发现已完成 A 的历史步骤会在新目标到来时被改写；现仅取消 queued/running
步骤，终态不可改写。两项审查发现均有真实多角色红测，审查者只读确认修复闭合。

最终回归：Humanoid runtime、World facade、Actor 共 140 tests 通过；typecheck、lint、
prebuild 通过。运行时 `5a420abb746387dc2d24091a412f9e00ba7df04763cd3fd1adb17e174a9324e8`。
组导航测试保留终点，提供六秒真实移动窗口，最终步骤为 [cancelled,succeeded]；
已完成步骤再接新目标的旧 plan 仍成功。此前普通 World/runtime/Actor 137 项也通过。
本轮中间构建 `b8f70c74cc08d42cfdf27d5708e4f4f413c3eac6d5946760d9ea2bee5330a1b8`
经实际 Creator 与独立 Episode 三人物浏览器验证通过，证据在
`.codex-tmp/actor-lifecycle-browser/report.json`。历史步骤修复后的最终字节仍需 R6
统一浏览器验收，不将中间构建画面标成最终构建证据。

本轮修正控制交接和操作归属，不代表确定性绕让已实现。
