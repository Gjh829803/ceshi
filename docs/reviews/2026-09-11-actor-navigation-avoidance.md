# 完整角色局部绕让与活动负载

地面 NPC 复用已安装的 Recast/Detour Crowd，从当前实际位置、速度和身体尺寸生成
避让速度。每个 SDK tick 重新输入物理结果，Crowd 的预测位置不写回角色。
既有角色控制器、共享 Rapier、动画和相机继续各自执行；未增加模拟循环或物理世界。

Actor ID 稳定排序用于 Crowd 加入顺序；navmesh 改变或容量增加时重建，移除角色不
保留模型引用。受控角色只作为已知运动的邻居，输入不被改写；自定义 movement 先
计算且不被地面避让覆盖；VehicleInstance 不冒充人物圆盘。导航离网或避让失败只
结束相应 NPC 导航，不能使无关角色或整个世界停止。拥堵没有可用路线时仍会按
既有受阻条件失败，本轮不是完整交通调度系统。

## 已安装依赖的资源修复

在原有 core 0.43.1 patch 中补足 Crowd 的资源所有权，版本未升级：

- addAgent/setParameters 的临时 native params 在成功、更新、失败时 finally 释放。
- Crowd 内的 NavMeshQuery 包装借用原生 query；只删除包装和独立 filter，然后释放
  Crowd，最后由 SDK 释放 navmesh。绝不对该借用 query 调用 destroy。
- 原生初始化/后续构造失败均清理已分配资源；容量不足先拒绝，destroy 幂等。

对应 npm gitHead 为 `8769e8b9995f127033af9f6e6eeac3fad7d66201`，已检查该源码的
C++ 指针借用及 Detour 参数复制行为。patch hash
`3a53408878a25c418799a5f4439e13ea6e5121a2e87e7812ca05483bfaf46fb1`
已由 pnpm 写入 lock。未改动 WASM 或引入替代导航库。

## 验证与范围

- 真实完整人形对向通行：两者成功，最小间距 > 0.62 m，存在主动侧移；reset 后毫米
  采样轨迹相同。每 720 tick 仍只有 720 次原场景物理步。
- 50 次创建人物、启动导航、删除：人物 dispose/mixer uncache、collider 基线正常；
  Crowd 分配和释放各 50 次，原玩家资源保持可用至世界释放。
- 两项资源红测证实原库未释放 params/query 包装；修补后的增加、60 次参数更新、
  容量失败、重复 destroy、初始化失败及 navmesh 继续可用均通过。
- 玩家离开 navmesh 原先导致全世界抛错；真实复现修复后通过。离网 NPC 的局部返回
  不修改调用方身体状态。独立审查确认上述隔离修复，未发现新的确认问题。
- 最终 SDK 全量 54 files / 802 tests 通过；Creator schema 与 Episode action controller
  31 tests 通过。独立 50 次导航生命周期及此前相关 68/91 项回归也通过，不累计重复
  测试数量。typecheck、lint、runtime prebuild 和 frozen-lockfile 安装验证通过。
- 同一运行时 `c23761c79123c490ba7dc0af68f0661da4b55ac1e426d1bc4ded8c08a7aa4489`
  的 Creator 和独立 Episode 三人物浏览器通过，证据
  `.codex-tmp/avoidance-actors-browser/report.json`。
- 源码 diff 检查通过；patch 文件的 unified diff 空白上下文行保留合法格式，由 pnpm
  实际安装验证，未把格式上下文当作生产源码尾空格。

同一 Chromium/1280×720/软件渲染，每轮 600 tick（三轮），固定步 CPU p95：

| 角色 | NPC 行为 | p95 ms | 每轮 mixer / 物理子步 | 每名 NPC 每轮位移 |
| --- | --- | --- | --- | --- |
| 玩家 + 2 NPC | 独立短距离巡逻 | 2.0 / 2.0 / 2.0 | 1800 / 1200 | 18.3–18.7 m |
| 玩家 + 9 NPC | 独立短距离巡逻 | 5.7 / 5.6 / 5.6 | 6000 / 1200 | 至少 17.7 m |

记录在 `.codex-tmp/avoidance-patrol-{3,10}/report.json`；均额外通过真实登乘、驾驶、
刹车和下车。巡逻统计验证实际移动，不能仅凭 mixer 执行声称 NPC 活动。
这不是 GPU 耗时、密集交通或任意复杂动态障碍的验收。最终单角色性能归因、混合
普通角色与完整人形能力、动态目标、事件和最终 R6 综合审查仍未完成。
