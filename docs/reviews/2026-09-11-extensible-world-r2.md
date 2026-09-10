# R2 多角色实现与本地验证

分支：`codex/extensible-world-r0`。完整人物可由现有资源创建独立实例，再通过
`world.addCharacter({id,humanoid:character})` 接入。模型源不随角色数复制下载；
控制器、骨架、mixer、材质及输入状态按实例隔离。环境统一推进物理。

## 接口与所有权

- `world.humanoid.createCharacter()` 复用已解析的资源闭包；迟到的 reset/map replacement
  结果释放实例。成功绑定后实例归 World，跨世界复用同一实例会被拒绝。
- 输入命令和动作接受 `actorId`，省略时使用当前输入角色。Operation 保存接受角色的
  controller 和 generation，切换输入不会把任务转移给其他角色。
- 相机目标与输入目标独立；多角色共用现有 FollowCamera。通用相机更新、Humanoid
  固定步和展示分支互斥，Episode 复用同一执行者。
- NPC 通过既有 move-to/follow/patrol 路径返回控制器输入。导航读取实际固定/运动学
  collider 三角形；普通动态物与其他人物由实际碰撞处理，堵塞仍可使路径失败。
- 完整人形接受 ground walk/run/jump 速度配置，拒绝未实现的 custom movement 和
  任意身体尺寸覆盖。载具交互仍属于初始人物。
- 初始封存的角色为 reset 保留资源；封存后创建的角色 despawn 时立即释放。
  出生净空在分配 rig 前检查，单角色销毁不销毁其他角色或共享物体。

## 验证证据

最终本地 runtime：`8d301d4bf75fe2759cf4db578a359ac5f59b2f57ee6e9ec5056e8602d954444e`。

| 范围 | 证据 |
| --- | --- |
| SDK 回归 | `.codex-tmp/r0/r2-sdk-final.log`，54 文件、769 tests 通过 |
| 发现与真实示例消费者 | `.codex-tmp/r0/r2-discovery-check.log`，24 tests 通过；新增 createCharacter 的提取另见 `r2-actor-schema-final.log` |
| 类型与 lint | `.codex-tmp/r0/r2-final-typecheck.log`、`r2-final-lint.log` 通过 |
| 测试分类 | `.codex-tmp/r0/r2-census-final.log`，109 文件分类通过 |
| 最终三角色浏览器 | `.codex-tmp/r2-actors-browser-final/report.json`，Creator 实际录制、独立 Episode 导航/玩家输入/复位通过 |
| 50 次实例生命周期 | `humanoid-actors.test.ts`，每次销毁 Character、uncache mixer、恢复 collider 数，原人物资源继续有效 |
| 独立审查 | 已修复资源延迟释放、跨世界绑定、NPC Episode 起点与未消费 movement；只读复核未发现剩余确认 blocker |

首轮 3/10 人物性能及玩家骑乘证据分别在 `.codex-tmp/r2-bike-3`、`r2-bike-10`。
该轮 runtime 为 `85e8f34803f4c6fb808d8493170c10a0e8b1090112f5e7a2d4fa5b2adab2c5db`，
早于最后的出生检查和异步失效修复，不能冒充最终 runtime 的性能验收。
同一 SwiftShader、1280×720、预热 300 tick，每组 3 轮各 600 tick：

| 角色数 | 固定步 p95（ms） | 每轮 mixer 更新 | 每轮物理子步 |
| --- | --- | --- | --- |
| 3 | 1.6 / 1.6 / 1.5 | 1,800 | 1,200 |
| 10 | 4.0 / 3.8 / 3.9 | 6,000 | 1,200 |

两组上车、驾驶、制动和下车检查均通过。这是固定步 CPU 测量，包含静止人物和
车辆物理，不代表渲染 GPU 耗时或持续导航的性能。最终 R6 仍需按最终源码复测。

## 已确认的数值与测试边界

原生胶囊 contactShape 对完全重合的轴线可能返回零深度；出生/身体重叠检查对此
限定分支用最多 10 微米内缩的 native intersectsShape 区分穿透与接触。实际 collider、
KCC 和推进不变；不宣称检测小于内缩量的任意精度穿透。

单独运行 NPC Episode 测试曾因假 window 缺少 performance 导致 Rust web-time
初始化 panic。补齐测试环境后单独运行通过，没有据此修改物理算法。

## 整体收尾仍需覆盖

确定性绕让、完整人形 prototype 的动态生成消费、动态目标失效、持续任务安全取消、
动画扩展、最终相同 runtime 下的性能/媒体及全量深度审查仍属后续工作。
本记录不代表项目全部验收，不代表远端 CI 或人工动作观感验收通过。
