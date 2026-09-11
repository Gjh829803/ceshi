# 全地形车 / Quad ATV

`vehicle.atv` 已接入默认训练场、资产库和载具调试面板。启动或重启 `pnpm dev`，
在资产库搜索“全地形车”或“ATV”，选择“前往资产”，按 F 跨坐驾驶。
默认园区位置为 `[-86, 0, 64]` 米，训练场实例名为 `atv`。

外形参考用户的红色 Quad 图片，以本地程序几何制作尖头车壳、长坐垫、四个宽胎、
外露车架和独立车把。采用项目要求的简化材质与几何。
速度参考 [PUBG 12.1 官方车型说明](https://www.pubg.com/en/news/1743)公布的
110 km/h（30.56 m/s）和加速时 125 km/h（34.72 m/s）；这是该发布版本的参考基准。
加速度、制动和转向是本项目的明确配置，并非 PUBG 内部物理参数。

| 输入 | 行为 |
| --- | --- |
| W / S | 前进；反向输入先制动，再倒车 |
| A / D | 前轮与车把转向，倒车时转向方向随行驶反转 |
| Shift | 增强加速，提高前进速度上限 |
| Space | 手刹，制动并降低横向抓地力 |
| F | 上下车，沿用 SDK 的安全入口和退出检查 |
| T | 第三人称、第一人称、肩后视角循环切换 |

松开油门时按 1.25 m/s² 减速，平地静止后保持停车；坡道会受重力影响。
倒车上限 6 m/s，加速度 7.5 m/s²，制动减速度 10 m/s²；
低速转角配置为 0.42 rad，高速逐渐减小转角，求解器转角上限为 0.48 rad。
静止时可以转动车把和前轮，车体需要实际行驶才能转向。
离地时保留惯性并受重力作用，不能靠轮胎产生推进或车体转向；落地后恢复驱动。

## 人物、锚点与运动

[规格](../packages/preset-content/src/vehicles/atv/spec.ts)和
[模型](../packages/preset-content/src/vehicles/atv/model.ts)定义驾驶座、后座预留点、
左右握把、左右脚踏、左右入口和驾驶观察点。当前 Training 控制一个驾驶者；
后座为预留 socket，尚未提供第二位乘客的控制与挂载。

保留 `humanoid.uefn-mannequin` 原人物和骨骼长度。驾驶座位于 `[0, 1, -0.15]` 米，
人物跨坐窄坐垫；脚踏上表面 0.2505 米，实测脚底最低点约 0.2544 米。
[手臂求解](../packages/three-world/src/humanoid-runtime/atv-rider.ts)通过上下臂旋转跟随转动车把，
不改变骨骼长度和模型缩放。零时间进入及左右满舵时，左右手与握把、前脚掌与脚踏
锚点的距离均小于 2 mm，原始蒙皮顶点通过车壳和挡泥板穿插检查。

[ATV 运行时](../packages/three-world/src/humanoid-runtime/motion-families/ground-vehicle/atv.ts)复用 `wheeled` 家族入口、
SDK 时钟和碰撞世界。短轴距为 1.6 米；前轮分别转向，每个车轮有独立滚动相位和
最多 ±0.12 米的接地补偿。运动状态由物理固定步推进，渲染仅插值取样。
碰墙或被其他载具阻挡时，轮胎不会累计未被接受的前进距离。
车体碰撞包络随坡度倾斜；驾驶姿态、车体、车把及相机使用现有表现事务。
该实现不包含逐轮刚体悬挂、燃料、损伤或多人乘坐。

## 构建与验证

修改模型后运行 `pnpm exec tsx packages/creator-host/scripts/assets/export-atv.ts`，更新
[atv.glb](../assets/three-creator/presets/vehicles/atv.glb)及资产目录。
运行 `pnpm build` 重建 SDK；重启训练预览加载最新运行时。

[ATV 测试](../packages/three-world/src/humanoid-runtime/atv.test.ts)覆盖驾驶、制动、加速、倒车、
车轮差速、静止转向限制、坡道、飞越边缘后落地、墙体/载具碰撞及原人物握持净空。
[路线测试](../packages/episode-pipeline/tests/planning/vehicle-route.test.ts)包含 ATV 的三十秒实际控制器路线。
[浏览器验收脚本](../packages/creator-host/scripts/smoke/atv-browser-smoke.ts)从训练场资产库入口验证
真实按键、三种视角、上下车与复位，保存视频、截图及运行时字节哈希到 `.codex-tmp/atv-browser/`。
该录像脚本针对旧训练预览；当前 React 编辑器验收运行 `pnpm test:editor:browser`。

[独立试车场](../examples/three-creator/atv-driving/main.ts)通过资产目录加载 GLB；
[真实输入计划](../examples/three-creator/atv-driving/episode.json)覆盖驾驶、坡道、制动、
转弯、视角及生命周期。完整验收记录在 `.codex-tmp/atv/verification.md`。

本次训练场预览与预构建 `.codex-tmp/three-runtime-atv-final/runtime/worldkit-three.js`
一致，SHA-256 为 `7cc256b54b730e4f647b78dd373ddd8fec86e67631e988f3c38c1d52d7a5d249`。
独立交付使用 Creator 官方源码固定机制，包内附带 SDK 源码，实际运行时 SHA-256 为
`501f3f1b05d17d9583e3cb2954a36800d432a9b5e2710aaa74b8520f29149879`；
Episode 消费该交付的原运行时字节。
