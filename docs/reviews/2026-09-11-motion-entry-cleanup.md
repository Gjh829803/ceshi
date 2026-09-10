# 运动模块与场景旧入口清理

删除 12 个已被运动家族模块取代的路径转发文件（含 kayak 和仅导出 MotionIntent 的
vehicle-motion-forces）；实际调用方直接引用所属家族。SDK 对外集中在 public.ts，
删除无人使用的 surfaceVessel 命名空间副本，保留当前统一导出形式。
Creator 的源码发现和合同文件表同步指向真实 wheel-physics 实现。

Playground 删除无调用方的 Scenario/SCENARIOS/applyScenario 别名和无环境回退，
人物场地准备直接通过统一 Actor，不再保留无 controller 的状态写入路径。
现有地图、资产参数、运动求解及碰撞条件继续使用原来的实际定义。

验证：SDK 54 files / 796 tests 通过；Creator tools/schema 76 tests 通过。
场地/划桨/座位/飞机拟合 39 tests 通过。另组 Creator preset/schema 与 Episode
controller 53 项通过，巴士一项并行时超过 5 秒；单独复测原超时限制下 3.27 秒通过。
没有修改测试超时阈值或功能断言。上述测试存在重叠，不累加成唯一总数。
typecheck、lint、census（109 files）和 prebuild 通过。运行时
`bbed82b51c067ed8f4c42c31c570621cc875ad1a88b3dff8d70d26a7d65b4d02`。

此次扫描未发现本范围剩余显式旧接口兼容入口；这不等于全项目最终深度审查已完成。
资源格式适配、不同当前载具能力、有效默认值和保守碰撞包络不属于旧版本兼容。
