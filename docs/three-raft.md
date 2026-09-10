# 橡皮艇 / Inflatable Boat

`vehicle.raft` 已加入默认训练场、资产库和载具面板。资产库搜索“橡皮艇”，
选择“前往资产”，按 F 上艇，T 循环切换第三人称、第一人称与肩后视角。
默认水域位置 `[201, -1.88, -176]` 米；实例名 `raft`。

采用参考图的深灰气囊、开放艇舱、横向坐板和独立船桨。按照
[PUBG 32.2 官方说明](https://pubg.com/en/news/7875?category=patch_notes)，
这是靠桨推进的无发动机艇，可部署于陆地与水面。
水上限速采用 [35.2 公告](https://pubg.com/en/news/8616?category=patch_notes)
的单人 25 km/h 参考值。下坡、回弹及阻尼是用户要求的项目实现，未将其宣称为 PUBG 内部物理参数。

| 输入或环境 | 行为 |
| --- | --- |
| W / S（水上） | 划桨前进 / 倒划，桨叶入水才提供推进 |
| A / D | 水上换侧扫桨；地面滑行时有限调整方向 |
| Shift（水上） | 加快划桨节奏，保持单人限速 |
| Space | 水上压桨减速，地面增加摩擦制动 |
| 松键 | 水上保留惯性并减速；陆地根据实际坡度下滑 |
| 平地或悬空 | 没有发动机或划桨推进力 |
| 落地、碰墙 | 损失法向动能后有限回弹，气囊压缩并恢复 |

[规格与锚点](../shared/preset-content/raft.ts)定义驾驶座、两处乘客预留点、
左右入口、驾驶观察点、脚部支撑；[模型](../shared/preset-content/raft-model.ts)
包含左右手握持锚点。当前框架控制一位驾驶者，预留座位不代表已实现多人共同划桨。
保留原 `humanoid.source-101` 人物、骨骼及缩放。船桨与手部目标同步更新，
气囊压缩只改变 `raft.tubes`，人物、坐板和脚撑不随气囊缩放。

[运行时](../packages/three-world/src/humanoid-runtime/raft.ts)使用 `mode: 'paddled_boat'` 与 `archetype: 'raft'`，复用共享的划桨和浮力，
通过同一 SDK 固定时钟及 Rapier 碰撞世界完成陆地接触。四点水域采样、160 kg
等效质量、最大 0.55 m³ 排水量控制浮起。陆地坡面法线决定纵坡与横坡上的重力分量，
基础滑动摩擦为 0.32 m/s²；下坡安全限速为 18 m/s。

回弹恢复系数 0.36，触发法向碰撞速度至少 1.2 m/s，回弹速度上限 3.2 m/s。
气囊压缩上限 0.12 m，弹簧系数 95 s⁻²，阻尼 15 s⁻¹；低速静置不会连续跳动。
这是有限回弹和形变近似，不是完整软体、气压泄漏、破损或海浪模拟。

[物理测试](../packages/three-world/src/humanoid-runtime/raft.test.ts)覆盖划桨、倒划、制动、快划、
平地无推进、无输入顺坡入水、落地回弹、撞墙及气囊恢复。
[人物测试](../packages/three-world/src/humanoid-runtime/kayak.test.ts)检查原人物双侧划桨、
旋转载具中的握桨目标及脚撑净空；[Episode 路线](../scripts/three-episode/vehicle-route.test.ts)
使用真实控制器输入驱动橡皮艇。

[岸坡试验场](../examples/three-creator/raft-driving/main.ts)与
[输入计划](../examples/three-creator/raft-driving/episode.json)用于 Creator 真实录制。
[浏览器验收](../scripts/three-creator/raft-browser-smoke.ts)从训练场资产库进入，
保存录像、视角截图、诊断和实际运行时哈希。

模型重建：`node node_modules/tsx/dist/cli.mjs scripts/three-creator/export-raft.ts`。
运行 `pnpm build` 并重启预览加载新 SDK 字节。
本次交付字节与验收证据见 `.codex-tmp/raft/verification.md`。
