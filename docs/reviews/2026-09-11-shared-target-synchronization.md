# 共享目标同步归属

WorldInteractions 统一读取松散物件的实际物理位置，并解析座椅的世界锚点。Simulation
在角色执行前同步一次，Environment 在全部物理子步结束后同步一次；Actor 只检查
自身正在使用的座椅。删除 ActionSystem/Actor 中重复扫描所有目标的 syncDropped、
syncSeats，物件数量与角色数量不会再相乘放大这部分读取。

静态座椅绑定真实启用的地图 collider；可移动座椅在同一解析入口读取刚体位置、
旋转和稳定性。目标缺失或关闭不冒充稳定座椅。carried 位置仍由原有持有关系更新，
不会被松散物理同步覆盖。没有新增时钟或物理推进。

验证：原实现无 Actor 时物件快照不更新，三个 Actor 每步读取同一目标身体六次、
单 Actor 两次；真实红测修复后，无 Actor 也更新，单 Actor 和三 Actor 读取次数相同。
静态 collider 座椅的可用性回归已单独复现并修正。相关 138 tests、typecheck、lint、
diff 检查及 runtime prebuild 通过；独立只读复核没有新的确认问题。

同一运行时 `cd632b0756babf89d2e61afd2c1f0315c990822eec2b79147c3d15e0fa7c9f75`
的实际 Creator/独立 Episode 通过移动、跳跃落地、切视角、拾取后持续持有/放下、
坐下后持续占座/起身。证据 `.codex-tmp/shared-target-sync-browser/report.json`，未跑
性能计时。该变更仅收敛同步 owner；动态目标注册、slot/generation、跨时间事件及
最终 R6 审查仍未完成。
