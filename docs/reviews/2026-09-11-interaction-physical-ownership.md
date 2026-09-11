# 交互物理所有权

交互语义不再创建或销毁 Rapier body。EnvironmentInteractionProps 管理地图物件，
ThreePhysics 管理普通实体；WorldInteractions 和 ActionSystem 通过同一个内部物理
能力执行持有、移动和释放。动作层不接收原生 body/collider，普通实体的能力在
删除后失效，同 ID 新实体不能被旧能力改动。碰撞形状重建保留实体身份，但持有期间
拒绝重建、直接 teleport 和 impulse，避免绕过当前 owner。

持有复用原 body，临时设为 kinematic 并关闭原 collider 参与；普通物理子步不再
覆盖持有者提交的位置。释放恢复 dynamic、原 collider 启用状态和物理 owner 的
配置，立即更新原生查询。未覆盖普通物件的质量、摩擦或重力设置。地图原有入水
参数由地图物理 owner 保留。实际原生实验发现关闭整个 body 再开启会使 collider
直到下一次积分仍处于父级禁用，因此不使用该实现。

resetRigidGroups 只复位地图刚体组。完整 resetContents 在任何物理修改前拒绝仍有
预约、持有或占座关系的请求；Simulation.reset 先释放所有 Actor 关系，再重建
地图物件并重新解析能力。旧 resetProps 入口直接删除，全部消费者已迁移。
Playground collider 识别也直接使用物理 owner 的绑定表，删除重复推导 helper。

已通过物理能力跨 tick/子步、释放后查询、同 ID 重生、资源数量、完整及局部重置
回归；typecheck、lint、test census、50 项 Creator/Episode/Playground 消费者测试和
runtime prebuild 通过。SDK 总回归 824 项中，822 项首跑通过，校园越障两项在
与浏览器构建并发时超过 5 秒超时；同源码单独复测两项均通过（3.57/3.24 秒），
未修改测试超时或行为断言。独立只读复核没有新的确认问题。

实际 Creator 与独立 Episode 使用运行时
`84e568ac82772e4b8bf1388ce8f46c36ab951e2256e9aa9f7262b8d8aa58f955`，
移动/跳跃/视角、拾取后持有/放下、坐下后占座/起身通过。证据在
`.codex-tmp/interaction-foundation-browser/report.json`。未跑性能计时或远端 CI。

这只是 R3 的物理能力基础。普通实体 slot 注册、generation 与资源预约、动作事件
提交和最终 R6 验收仍在后续计划内，不代表整体重构已完成。
