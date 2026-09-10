# 履带坦克

`vehicle.tank` 已登记到资产目录、默认训练场、资产库和载具调试面板。
运行 `pnpm dev`，在资产库搜索“坦克”，选择“履带坦克 → 前往资产”，按 F 进入驾驶位。
默认园区位置为 `[-102, 0, 64]` 米；人物在封闭车体的前部驾驶舱内。

| 输入 | 行为 |
| --- | --- |
| W / S | 前进；S 先制动，再倒车 |
| A / D | 左右差速转向，静止时可原地转向 |
| Shift | 提高前进加速度及速度上限 |
| Space | 制动并保持停车 |
| Q / E | 炮塔独立左右旋转 |
| ↑ / ↓ | 炮管抬高、降低，有俯仰限位 |
| F | 进入、离开驾驶位；出口受阻时沿用 SDK 安全退出检查 |
| T | 第三人称、第一人称舱内、肩后视角循环切换 |

松开行驶输入后发动机制动减速；静止时保持停车，炮塔与炮管保持当前位置。
前进上限 12 m/s，加速上限 18 m/s，倒车上限 4 m/s；加速度 3 m/s²，
滑行减速度 1.4 m/s²，制动减速度 7 m/s²，静止转向上限 0.75 rad/s。
离地时不能产生履带推进或原地转向；水中不具备推进能力。

## 结构与所有权

[规格和锚点](../shared/preset-content/tank.ts)定义座位、左右手控制点、
左右脚踏板、左右入口、驾驶观察点；模型另含炮塔旋转中心和炮口锚点。
[模型](../shared/preset-content/tank-model.ts)包含独立炮塔、炮管、
左右履带和负重轮。履带相位来自物理步实际接受的位移与转向，渲染采样不推进状态。
车体使用放大的中空基础几何，保留低矮炮塔、长炮管和两侧履带的参考构图。

驾驶者沿用 `humanoid.source-101`，不替换人物、不缩放骨架、不隐藏整个人物。
座位为 `[0, 1.45, 2.1]` 米，冻结坐姿并校准手脚控制点；坦克进入的零时间采样同样应用该姿态。
实测人物局部包围盒约为 `[-0.279, 0.894, 1.990]` 至 `[0.294, 2.229, 2.638]` 米；
舱底上表面 0.88 米、舱顶下表面 2.555 米。原始蒙皮顶点通过舱壁净空检查，
手掌和前脚掌骨骼距离锚点小于 2 mm。第一人称眼点位于舱内观察窗后方。

[SDK 动力学](../packages/three-world/src/humanoid-runtime/tank.ts)拥有坦克状态和运动。
车体采用箱体包络，伸出的炮管另有随炮塔和俯仰运动的碰撞包络；
固定步检查车体、炮管的平移及旋转路径，受阻时拒绝该步。
模型采样接入现有表现插值与恢复流程，人物、相机、时钟及物理继续由 SDK 统一管理。
当前实现驾驶与炮塔操纵，不包含射击、弹道、损伤、逐轮悬挂或舱内自由行走。

## 构建与验证

修改模型后运行 `pnpm exec tsx scripts/three-creator/export-tank.ts`，更新
[tank.glb](../assets/three-creator/presets/vehicles/tank.glb)及资产目录哈希。
运行 `pnpm build` 生成运行时，再重启训练预览加载新构建。

[坦克测试](../packages/three-world/src/humanoid-runtime/tank.test.ts)覆盖驱动、制动、差速、
炮塔限位、炮管碰撞、净空、原人物身份和手脚锚点。
[家族测试](../scripts/three-creator/vehicle-families.test.ts)覆盖独立世界与复位；
[Episode 路线测试](../scripts/three-episode/vehicle-route.test.ts)实际运行三十秒驾驶输入。
[训练场浏览器验收](../scripts/three-creator/tank-browser-smoke.ts)从资产库进入，
通过真实按键验证驾驶、三种相机、炮塔、下车及复位，并保存纯画面录像和运行时字节哈希到 `.codex-tmp/tank-browser/`。
该录像脚本针对旧训练预览；当前 React 编辑器验收运行 `pnpm test:editor:browser`。

[独立试车场](../examples/three-creator/tank-driving/main.ts)通过目录 GLB 加载坦克，
[输入计划](../examples/three-creator/tank-driving/episode.json)覆盖 32.4 秒真实操作、三种相机和生命周期。
本次 Creator 交付及独立 Episode 消费证据保存在 `.codex-tmp/tank/` 和 `.codex-tmp/tank-episode/`。
验收运行时为 `.codex-tmp/three-runtime-tank/runtime/worldkit-three.js`：
SHA-256 `e40084b2e317eb7749630884306c57dcc1a4c50201e7326cb4c6094f1b27708b`；
运行时集合哈希为 `bed53d41a71833e2c0eff43247ac63fcd52a7d80f70cd023b44a7fe9d7e5ef59`。
训练场浏览器加载的字节与 Creator / Episode 交付及预构建一致。
