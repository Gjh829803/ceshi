# 飞行家族执行路径清理

飞行家族只保留当前真实消费者使用的两个模型：目录 Quaternius WYVERN 使用
`grounded-flight` 行走、起飞、悬停和降落；Playground D01 使用带 `flyingCreature`
配置的动力飞行。模型尺寸、碰撞 envelope、seat、clip、policy 和操控参数均未替换。
两者是当前能力差异，不是旧接口兼容。此前“旧坐骑保持兼容”的描述已删除。

删除合法配置不可达的 `dynamics.ts`、`motion-forces.ts`、`intent.ts`，同时移除
飞行家族 body state、恒空 defaultBody 和互相矛盾的配置检查。`creature` 状态
在构造时初始化，family 直接分派两种实际能力，不再按缺失状态逐层回退。
地面起降代码中的 carriage 常量、lead horse 分支和相关注释也已移除。

验证：家族归属、飞龙模型、相机、Creator 全部车辆家族 76 tests 通过；
Humanoid runtime 与新增的目录飞龙行走→起飞→悬停→降落→重建状态 90 tests 通过。
两组有 6 项重叠。typecheck、变更文件 lint、runtime prebuild 通过。
运行时 `6fcb15b3aabfcf5dc906871783c995472b640bef2b62863e313d0413092af848`。
独立只读审查确认没有剩余删除模块调用、能力丢失或初始化遗漏；审查者未运行测试。

真实 Playground/Creator/Episode 浏览器矩阵在最终 R6 runtime 上再验收，本轮不借用
前一 runtime 的浏览器画面作为变更后证据。整个项目的兼容清理和重构仍按计划推进。
