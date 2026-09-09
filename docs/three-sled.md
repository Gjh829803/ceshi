# 木座雪橇

资产库搜索“雪橇”，选择“木座雪橇”后前往资产，按 F 搭乘。
测试场景中选择木座雪橇，再准备第 11 区的雪橇坡道。坡顶有平坦出发台，
下方是 80 米长、12° 的真实碰撞坡面和减速区。

| 输入 | 行为 |
| --- | --- |
| W | 低速反复蹬地；超过 3 m/s 收脚，不提供发动机推力 |
| A / D | 单侧拖脚转向；速度越低转向效果越弱，保留侧滑惯性 |
| S / Space | 双脚拖地，制动至停止；持续按住可在测试坡面停住 |
| 松键 | 保留惯性，坡面重力加速、平面摩擦减速，上坡失速后可以倒滑 |
| F | 沿用统一上下载具流程；速度超过 5 m/s 时需先减速 |

资产 ID 为 `training.sled`，运行家族为 `sled`，坐姿为 `sled`。
[模型与座位配置](../shared/training-content/sled.ts)使用米、秒，+Z 为前方；
[程序模型](../shared/training-content/sled-model.ts)和导出的 GLB 使用相同生成器。
角色保持原 Source101 模型，通过既有动画所有者叠加坐姿、蹬地与拖脚姿态。

[SDK 控制器](../packages/three-world/src/training/sled.ts)使用固定步长，坡面法线投影重力为
9.81 m/s²。默认最大滑速 24 m/s，蹬地峰值 4 m/s²、周期 0.85 秒，
滑动摩擦减速度 0.22 m/s²，双脚制动 6 m/s²，侧向阻尼 2.2 /s，
速度平方阻力系数 0.006 /m。属性面板可单独修改这些参数。
运行时使用现有 Rapier 世界的接触与扫掠；不新增物理循环或相机写入器。

这是压实雪面上的游戏运动近似，不模拟松雪变形、翻覆或双脚完整接触 IK。
图片用于轮廓与骑乘姿态参考；Bilibili 视频未成功读取，未声称逐帧复刻。

重新生成资产及启动：

```powershell
& .\node_modules\.bin\tsx.CMD scripts/three-creator/export-sled.ts
pnpm build
pnpm dev
```

导出仅更新雪橇 GLB 和对应资产目录条目，包含完整运动默认值、座位和碰撞包围盒。
预览启动时编译代码；修改后需重启预览进程。
[浏览器验收脚本](../scripts/three-creator/sled-browser-smoke.ts)使用真实键盘输入，
录制纯渲染画面至 `outputs/sled/browser/sled-input.webm`，同时记录状态与截图。
