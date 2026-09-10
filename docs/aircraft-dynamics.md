# 本地轻型飞机动力学

在 2026-09-10 最新主线 a7281cba 上继续实现，分支 codex/aircraft-dynamics-20260910。
本地入口 http://127.0.0.1:5190，地图选择「飞机 · 起降训练场」。

## 操作

Shift 增加并保持油门，Ctrl/C 收油并在地面刹车，W/S 低头/拉起，A/D 协调转弯，Space 地面刹车，T 切换驾驶舱，F 停稳后上下机。
先滑跑到约 90 km/h，再轻按 S 拉起。松开转向会请求回平；抬头不保证维持爬升，应保留空速。

## 实现与边界

- `packages/three-world/src/humanoid-runtime/aircraft.ts` 提交气动力、推进力、增稳控制力矩和三个轮子的支撑/摩擦力；没有第二个物理世界或积分时钟。
- 使用项目已安装的 Rapier 0.20.0，既有 `EnvironmentQueries.stepPhysics` 在 120 Hz 子步调用力计算和状态读取。重力由 Rapier 施加；四元数、速度、角速度由其刚体求解。
- 速度保持独立于机头方向。升力随动压与迎角变化，超出标定迎角后衰减；阻力包含基础和诱导项。没有风场、逐翼流场、真实发动机转速/桨距、压缩性气动或结构损伤。
- 增稳控制用有界力矩追踪俯仰和侧倾，偏航协调也使用力矩，不直接修改姿态。属于游戏辅助飞控，不是完整 JSBSim，也未复制 FlightGear 源码或资产。
- 每个轮子独立查询支撑面，计算预载、弹簧、阻尼、摩擦限幅与刹车；前轮转向。球形行程限位碰撞体处理压缩到底的情况，机身与机翼另有碰撞体。碰撞体为近似形状，不是可视蒙皮的精确碰撞。
- 质量、惯量、翼面积、轮位和行程标定集中在 `packages/three-world/src/config/aircraft.ts`。当前 plane 模式使用同一轻型三轮高翼机布局，两种预设共用；其他尺寸/类别必须重新标定，尚无任意机型气动配置 API。
- 轮位、转向和旋转经 `presentation.ts` 的既有快照插值展示，和机身共用采样。地图切换、复位及释放使用既有刚体生命周期。
- Creator 与 Episode 共用物理；`scripts/three-episode/vehicle-route.ts` 根据实际航迹修正侧倾请求。

## 人物和模型

保留 Source101 原尺寸。骨盆锚点 (0,1.30,0.10)，坐垫顶 1.175 m；鞋底约 0.744 m，踏板顶 0.740 m。
双手采用固定握把，蒙皮接触距离小于 1.5 cm；没有新增手指抓握或脚踏动画。
机身为空腔座舱，高翼、前后机身和起落架分别建模。静态桨叶全周净空约 0.299 m。
`aircraft-fit.test.ts` 检查实际人物蒙皮、座椅和舱壁穿插、手脚位置、眼位及操纵后的挂接。

## 验证和产物

相关自动测试覆盖：三轮停车载荷、起飞、转弯回平、着陆制动、非瞬时姿态变化、独立速度、墙体碰撞、单侧凸起、重着陆、重复性与 60/120 Hz 对比，以及相机、挂接、轮式回归和 Episode 航线。
浏览器实际键盘覆盖起飞、转向回平、收油、驾驶舱切换；两种飞机另检查正侧后视角和上下机。
证据目录：`D:/CodexData/Artifacts/aircraft-dynamics-20260910`。
构建目录：`D:/CodexData/Builds/aircraft-turn-assist-20260910`。
Runtime SHA-256：`bd15de93a3156fa25a858c50ca5f255c8c23b6e4b6d1756709a370f8082e5a25`。

执行：`pnpm exec vitest run packages/three-world/src/humanoid-runtime/aircraft.test.ts packages/three-world/src/humanoid-runtime/runtime.test.ts packages/three-world/src/humanoid-runtime/vehicle-camera.test.ts packages/three-world/src/humanoid-runtime/wheel-physics.test.ts packages/three-world/src/humanoid-runtime/mounted-presentation.test.ts scripts/three-creator/aircraft-fit.test.ts scripts/three-episode/vehicle-route.test.ts`。
另执行 `pnpm typecheck`、`pnpm test:census`、`pnpm build:editor` 和 `pnpm three:creator:prebuild --profile three-sdk --output D:/CodexData/Builds/aircraft-dynamics-20260910`。

## 简化转弯辅助

A/D 请求最大 0.32 rad/s 的转弯角速度，根据空速计算侧倾，最高约 57°；低速侧倾限幅更小。空中输入响应 8/s，地面前轮保持原响应。
俯仰目标补偿实际侧倾造成的垂直升力损失，并反馈垂直速度；手动 W/S 时淡出该反馈。协调偏航角速度转换到机体各轴，避免侧倾中的偏航控制额外造成俯仰。
该辅助不锁高度、不改写位置或速度，低速仍可能失速，高速和升力不足时仍受转弯能力限制。

同一空中准备状态、自动维持测试速度、持续单向 A/D，按实际速度方向转过 90° 测量（非只看机头）：

|速度|原转弯时间|新转弯时间|原高度变化|新高度变化|
|---|---:|---:|---:|---:|
|126 km/h|9.82 s|5.65 s|-18.18 m|+4.23 m|
|162 km/h|12.00 s|5.55 s|-26.26 m|+1.26 m|
|209 km/h|14.80 s|6.62 s|-38.26 m|-5.66 m|

新增回归断言覆盖左右两向、三个速度、8 秒内完成、绝对高度变化小于 8 m、反向转弯和松手回平。相关 32 项通过，类型检查、census、prebuild、Playground 构建通过。
浏览器键盘验证证据：`D:/CodexData/Artifacts/aircraft-turn-assist-20260910`，无 pageerror。
