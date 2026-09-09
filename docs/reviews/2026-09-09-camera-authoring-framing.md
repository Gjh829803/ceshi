# Agent 镜头配置与构图反馈

## 问题及证据

鲸落之谷 028 的交付源码显式配置了 `cameraDistanceMeters: 11` 和
`camera.targetHeightOffset: 1.1`。SDK 的偏移默认是 0；额外 1.1 米来自场景
作者代码。排查包没有生成对话或参数选择记录，无法确认 Agent 选择这个数值
的具体理由。不能把“为展示巨大鲸骨而抬高视角”的推测当作已证实的动机。

在同一位置、默认越肩俯仰角 0.12 rad、无镜头遮挡的浏览器对照中：

| 高度增量 | 镜头距角色脚部 | 头部锚点的画面纵向位置 |
| --- | --- | --- |
| 1.1 m | 2.8994 m | 从画面顶部算 96.21% |
| 0 m | 1.7994 m | 50% |

1194×1280 和 1280×800 两种窗口均复现。两组镜头臂长都是 2 m、
`collisionPhase` 都是 `clear`。这是额外构图偏移导致的画面问题。

可确认的生成与验收缺口：

- 原命令 schema 只描述“垂直偏移 (m)”，未解释是在已有人物姿态锚点上加值，
  也未说明它同时影响普通跟随和越肩。调长跟随距离并不要求同步抬高锚点。
- 原始 `historical-browser-ui.mjs` 在 T 切换时只保存三种模式编号；截图只有
  开场和上车状态。原交付 `verification.json` 的语义审查仍为 `unreviewed`。
- Creator 的 `world_preview({view:'opening'})` 会复位，不能用来检查刚切换的
  越肩构图。模式可切换、执行无报错均不等于画面已经验收。

## 平台修复范围

保留既有镜头可调能力：高度和水平偏移作用于模式 0、2，第一人称不移动眼位。
增补 Agent 实际读取的环境、schema 和示例指导，明确默认省略额外偏移，先使用
已调好的人物/驾驶镜头；按实测需要调参后检查所有启用视角及上下车、复位。
开场参考构图使用 authored camera 并显式交回 SDK 跟随所有者。

`world_preview({view:'current'})` 拍摄当前世界画面，不复位或推进模拟；
保留 `opening` 的原语义。画面与运行时身份、当前镜头模式和取样信息一起返回。

`world.describe().training.configuration.effective.camera.framing` 按需提供与
当前镜头展示采样对应的头部锚点投影。mode 2 使用非零额外偏移且锚点投影靠边或
出画时，返回 `SHOULDER_FRAMING_OFFSET_REVIEW`，提示检查当前截图并与零增量对照。
它是复核提示，不自动改相机，不拒绝合法配置，也不新增交付门禁。

反馈保存同一展示采样的 `sampledOffsets`；暂停改参时通过 `offsetsPending`
标明新配置尚未进入画面，避免用新数值解释旧截图。游泳眼位使用既有 1.35 m
姿态锚点；车辆使用驾驶员眼位或明确标识的座位回退值。

普通主体的首帧与复位采样也保持一致：尚未同步到原生查询结构的碰撞体统一由
已有 dirty sweep 处理。曾运行过的 Rapier world 可能提前在 KCC 中命中新发布的
碰撞体，多产生默认 0.1 mm 法线推开量；冷 world 尚未命中时没有这项位移。
排除未同步碰撞体的原生 KCC 查询后，两种情况下角色与相机的首帧坐标、PNG
严格一致。正常 KCC 推开量、支撑刷新和每个输入 tick 一次 world.step 均保留。

投影不是像素可见性或无遮挡证明；无提示也不是视觉通过。第一人称和 authored
镜头不做这项构图判断，缺失或无效采样标为不可用。现有 profile 保留显式覆盖，
schema 的默认值用于说明，不自动补齐未设置字段。

参见 [SDK 当前用法](../../packages/three-world/README.md#training-camera-perspectives)
与 [Creator 指南](../../scripts/three-creator/README.md)。

## 验证

- 最终相机、真实骑乘/游泳/暂停改参、Creator 当前视角 MCP/CLI 截图和 Episode
  消费者回归共 120 项通过；Agent 环境/schema/示例发现链路 11 项通过。
- 同步 `e39f8805` main 的训练内容迁移后，保留 React 面板的偏移提示并沿用
  主干删除旧 DOM 编辑器的结果。测试清点为 74 文件，workspace 边界检查
  （0 debt）及运行时预构建通过，SDK runtimeHash 保持一致。
- 合并后的本地 202 项回归中 198 项通过，包含相机、物理、Agent 发现、当前
  截图和 Episode 零帧/一帧启动复位。另 4 项受环境限制：3 项无法创建 Windows
  symlink，1 项找不到 ffmpeg。复位测试同时保留主干的单采样 renderer 设置
  和本次冷/热启动覆盖，继续严格比较相机坐标与 PNG。
- 冷/热启动、碰撞体发布、移动平台、物理连续性、普通 World/相机和 Episode
  的另外 167 项回归通过；零帧启动与已有一帧的浏览器路径都比较相机及 PNG。
- 横竖屏 A/B、F 上下车、T 三模式、R 复位、车辆遮挡回缩、Episode 同状态重复
  截图及复位重放验证通过。新旧默认越肩截图 SHA-256 完全相同：
  `8dfe4d93431c5220b85b4ce120f94696cee1f864bbe02898dc2cd9bbba8f04e1`。
- 本机扩大回归另有两个环境限制：Windows 不允许测试创建 `/etc/hosts` symlink；
  普通 World 视频颜色测试读到 RGB `[108,154,171]`，期望 `[108,154,172]`，
  在未修改的 `188db319` main 基线上同样复现。未修改或削弱这些检查。
- 新主线的 `lucide-react@1.43.0` 触发本机 pnpm 发布时长限制，未关闭该限制；
  React 依赖未安装完整，本地全量类型检查因此不能通过。React 面板、完整类型
  检查及合并树的全套验证使用项目既有 CI，结果链接保存在 PR。

实际 SDK runtimeHash：
`6accdd544c87fb915a4474d2d85a647f0594478e99a5c6ec499a835f3541c4c4`。
鲸落回归 worldBuildHash：
`b3c70a679077d9224b86d687d2cb39112eea70bc4b67274004b4d510bcbaaea4`。
截图、输入证据与可运行结果保存在本次工作树的忽略目录
`outputs/vehicle-camera/`；线上旧 case 没有被重新发布。
