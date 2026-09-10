# 人形 prototype 资源生命周期

人形 prototype 现在只保存独立资源 factory 和复制的配置。注册不再克隆并常驻隐藏的
模型、骨架和 mixer；spawn 才创建完整角色。原 seed 可释放，最后活跃实例释放后
共享几何也能释放，后续 spawn 从同一资源 URL 闭包重新加载。

已注册的 prototype 不保存调用方配置引用；每次 spawn 再复制配置。失败、取消、
reset 期间创建但未发布的角色继续由既有 preparation 清理路径释放，没有第二套生命周期。
普通 Three/AssetInstance prototype 的现有资源所有权未在这次修改中重设。

红测使用真实 Source101 的独立源闭包：注册三个 prototype 后释放 seed，旧实现的
geometry.dispose 调用为零；新实现立即释放，并能再次 spawn 出可执行完整人物。
SDK 多角色、资源生命周期、World 57 tests 通过，Creator schema 16 tests 通过；
typecheck、lint、prebuild 通过。运行时为
`381bd3283c4b8ab33dcfef8dc5fe8dc25e7a9c37df28f959f6cfc064f7089267`。
独立只读审查确认没有新的可确认问题，审查者未运行测试。

本轮证明空闲人形 prototype 的资源释放与重新生成，不等同于最终多人持续导航、
全部动作或浏览器视觉验收。
