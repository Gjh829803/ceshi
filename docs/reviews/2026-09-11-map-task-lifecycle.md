# 地图替换的任务失效边界

旧实现只终结完整人形动作，普通 tween、排队命令、异步 runTask 和导航仍能向新地图
写入；同刻提交的人物命令也会在 microtask 中落到替换后的 Actor。已用红测复现。

成功替换后，World 统一更新 epoch/实体 generation，终结旧操作并释放 queued spawn，
中止任务 scope，清理导航和场景输入。尚未提交的人物命令也检查发起时的 epoch。
候选地图验证失败不触及旧任务；操作历史终态仍不改写。

onSimulationReplaced 明确 map/reset 原因：地图切换暂停场景巡逻，显式 resume-autonomy
才恢复；world.reset 保持 baseline 自主配置的恢复语义。输入清理保留范围：切图和
stop 清全部输入，键盘主体切换只清键盘、待提交边沿和指针增量，不清其他 Actor 的
显式 AI 输入。该独立输入回归也先复现再修正。

最终相关 SDK 95 项、Creator/Episode 消费者 46 项、typecheck、lint、census、diff
和 prebuild 通过。真实三个完整人物与普通受控角色的 Creator/独立 Episode 通过，
使用运行时 `99d688950a4b52cc757715c4a0d29396a15094b6c9d596f94944e2f90aa8bbd3`。
证据 `.codex-tmp/map-task-browser/report.json`。
真实 Playground 完成相机拖拽、工坊/室内/园区切换、前往巡逻艇、登艇和三个镜头
模式切换；跟随臂漂移约 0.00020 m。证据 `.codex-tmp/map-task-playground/report.json`。
Vite 仍有 ResizeObserver 通知与软件渲染扩展提示，本批没有调查其根因。
本地服务已停止；未运行性能计时、远端 CI 或外部生产任务。

最终独立只读复核没有新的确认问题。

这不等于 R3/R4 全部完成：动态槽位、预约身份、动作事件和最终 R6 仍在计划内。
