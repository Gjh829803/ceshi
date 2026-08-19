# 当前实验与验证记录

> 状态日期：2026-08-20。本文只记录当前仓库中可以运行或已经验证的事实，不描述远期目标 API。

> Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

## 1. 实验目的

当前实验要回答十个问题：

1. 第三人称人形的移动、物理、动作和镜头能否由一个稳定 SubjectKit 统一提供。
2. Coding Agent 能否只写场景模块，不改 SDK 内部，就创建不同的室外白膜世界。
3. 大地形分块能否保持视觉高度、物理高度和边界采样一致。
4. 场景中的地形、水体和标志物能否追踪到 Feature、参数、seed 和资源所有者。
5. 图片参考能否被转译成可玩的白膜空间构图，而不是把纹理和视觉细节错误建成碰撞几何。
6. Coding Agent 能否先把输入扩展为可追踪的整个世界和进入视角，再用两张规划图与 SDK 实测工件闭环，而不是直接猜几何。
7. Planner 与 Builder 能否通过冻结锁真正隔离，避免下游为实现方便而篡改上游规划。
8. 每类实体能否从真实白膜导出唯一颜色的正/右/后三视图，为 Visual Bible 与世界模型建立稳定视觉绑定。
9. AI 能否只用 Canonical Schema 定义 Package 局部 Primitive 主体，并让
   SDK 自动完成 Collider、Hash/Lock、多实例、物理、控制与 Explain。
10. AI 能否只引用一个 Rigged Subject Definition，SDK 自动完成 GLB Hash Gate、
    Rig/Clip/Collider 绑定、固定 Tick 动作、双实例隔离、Havok 碰撞和截图证据。

## 2. 当前 Playground 场景

| URL 参数 | 实验内容 | 已证明的能力 | 必须避免的误读 |
|---|---|---|---|
| `?scene=grassland` | 640m × 640m base-plain 地形、西北低缓塔岭、大湖和高塔 | relief 预设、显式地貌区域、分块高度场、LakeFeature、复合标志物、第三人称主体；首个完整 WorldSpec/World Plan/Opening Shot/Height-Slope 样例 | 两张生成规划图是空间意图，不是物理真相；本地水面也不是世界模型效果 |
| `?scene=canyon` | 自定义峡谷、Polygon 河流和石拱 | Coding Agent 可用 BuildContext 定义 SDK 未预置的地貌名词 | 河流没有流体模拟，blocked/swimmable 仍主要是语义契约 |
| `?scene=azure-bay` | 南侧高地俯瞰海湾、两侧海岸、岛状轮廓、灯塔、村落和帆船 | 单图构图转译、自定义地形、Polygon 水体、初始镜头构图、连续可走下坡 | 岛状轮廓来自同一地形 Feature 的塑形，并非独立 Island Feature；不重建花海、云层和绘画风格 |
| `?scene=mistbound-rider` | 山谷、道路式区域、废墟、村落、城堡和远景天体 | 更复杂的自由 Feature/标志物组合和语义提示 | 马与骑手是静态几何标志物，不代表骑马主体已实现 |
| `?scene=sunlit-flower-bay` | 用用户参考图完成 Planner → Raster/Mask Builder → 浏览器构图 QA → Visual Bible 全流程 | 1200m × 1000m 海湾、全局高度 Raster、草地/岩壁/路径 Mask、无缝 tile、路线坡度、语义构图门禁、四类 Prototype 和完整视觉包 | 构图门禁验证空间区域与实例投影，不验证花朵、云、水花等最终画风 |

运行方式：

```bash
pnpm install
pnpm dev
```

然后打开 `http://127.0.0.1:5173/?scene=<上表参数>`。

### Canonical Authoring V2 / Package Subject 实验

[`package-subject-world.json`](../examples/authoring/package-subject-world.json)
是当前新程序接入的代表性 Fixture。它包含一个 Registry 人形和两个引用同一
Package 四足 Definition 的实例。Definition 由 body、head、四条 leg、tail 与
`seat.mount` Socket 组成；Socket 目前只作为结构数据验证，不执行骑乘。

真实 Chromium/Havok 门禁已经验证：

- Authoring 2 → Normalized IR 2 → ExecutionPlan 3 → Snapshot/Browser 3；
- 两个四足实例共享 Definition Hash
  `sha256:7220f0793b43e3d6f7cbbdd6bb2c184461850ed4975b36917e2c5716778561b1`；
- Resource Lock Hash 为
  `sha256:52c08a6e9c54cdb88308eced9d18abae27065792edc79fe0614f21e719eb789b`；
- 三个 Subject 对应 3 份独立状态，场景共 7 个 Havok Body；
- 控制权可分别切换给 `pack-animal-a` 和 `pack-animal-b`，固定输入只移动目标，
  Reset 恢复默认人形、相机和全部 Subject Origin；
- 人形被墙体阻挡并可进入 swimmable 水域；
- 生成的 `world.png` 为 936×596，画面中人形与两只四足代理均可见、落地、
  分离，且未与走廊墙体或彼此明显穿插。

运行入口：

```bash
pnpm worldkit run examples/authoring/package-subject-world.json
pnpm verify:canonical
```

### Canonical Asset Subject S1b / Golden Humanoid 实验

[`rigged-subject-world.json`](../examples/authoring/rigged-subject-world.json) 只在普通
Subject Node 中引用 `worldkit://subject-definition/humanoid.rigged-golden@1`。GLB 路径、
骨骼名、源 Clip 名和 Capsule 尺寸均留在 Registry/Host 边界，不进入世界 JSON。

`pnpm verify:rigged-subject` 已验证：

- 自包含 GLB 为 43,656 bytes，原始字节 Hash 为
  `sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2`；
- Normalized IR Hash 为
  `sha256:e746bd738e13ec8603779afba4d62d2d4610d0b03d428a6a1f8cc4f468ce1984`，
  ExecutionPlan Hash 为
  `sha256:22e38f9dc474b33a2adbe8442dba411e70f62731ac1e9a54fe1ac90f9f73249f`；
- `world.png` 与 `idle/walk/run/jump.png` 均为 936×596；CLI `world.png` 在暂停并
  Reset 后以 Tick 0 同步记录 Snapshot 和截图，Hash 为
  `sha256:b9ff828333641e548ea7ef3d2f8dbc6c8ae96c120659db3a6f6c17df19a09d9b`；
- Browser 固定 Tick 动作截图 Hash 分别为 Idle
  `sha256:af60b01ae2bf9db87c5ea5a5e01a08539e1ca35186e7b88b60125cc049a641aa`、
  Walk `sha256:326c170bf8add1e8bd48e35fa7499a656776dfab2d8a3ed6f11d125b2ef2a92d`、
  Run `sha256:d8957ad8b2bc115a9a493dd5404ef38e10cd2373a40b2743b2af83851400e3c7`、
  Jump `sha256:992383d2cc70d49b827af24815dff7a41bbed8e5da7e0f8bf527294b00f61552`；
  四者两两不同，Jump 在 Tick 12 报告 `movementMedium: air`；
- 未受控的 `rigged-primary` 保持位置与 `idle`，受控的 `rigged-secondary` 从 x=3
  移到 x=5.361666666666668 并报告 `walk`；
- `rigged-secondary` 在墙前停于 x=5.561666666666668，低于 6.2m 门禁；
- 内存篡改 GLB 只命中一次请求并得到 `SUBJECT_ASSET_HASH_MISMATCH`，磁盘资产
  前后 Hash 不变。

这些事实证明项目自有 Golden Fixture 的完整管线，不证明任意产品资产、动作观感、
Compound Collider、LOD、更多拓扑或完整 Semantic Actions 已经通过验收。

## 3. 针对近期反馈做过的实验

| 反馈 | 当前处理 | 验证状态 |
|---|---|---|
| W 前进方向与人物朝向相反 | Canonical Golden 资产与运行时统一为 `-Z`；Legacy Mixamo `+Z` 资产仍在旧加载层校正 | Golden E2E 覆盖 `-Z` 朝向；每个产品资产仍需独立视觉 QA |
| 镜头离人物过远 | 第三人称默认距离下调，并允许场景在 `1.8..8m` 内设置初始距离 | 参数校验和镜头单测已覆盖 |
| 地图太小 | 默认草地扩展为 4 × 4 个 160m tile，即 640m × 640m | 场景编译测试已覆盖 |
| 水体奇怪 | 增加专用 WaterBody/Lake：湖盆、岸带、水位、浅深色、菲涅尔和轻微波纹 | 功能已运行；最终水质仍由世界模型负责 |
| ↑/↓ 视角方向反 | 输入语义统一为“↑ 向上看、↓ 向下看” | 固定输入 Smoke 同时验证两个方向 |
| 角色在不平地面上带动镜头颠簸 | 固定物理步长插值、接地高度平滑和镜头竖直抖动过滤 | 单测/Smoke 覆盖数值稳定性；主观手感仍需持续人工回归 |
| 所有地形都过度起伏 | 增加 `flat/plain/hills/mountains`，要求按用户场景选择 | API、场景规则和测试已覆盖 |
| 不可爬坡面没有定义 | 人形 42° 最大爬坡、48° 自动滑落，主路线建议 ≤35° | 出生点坡度检查；Azure Bay 路线测试覆盖 ≤35° |
| 分块地形出现缝或高差 | 分块使用世界坐标采样；渲染网格和 Rapier 高度场复用同一高度数据 | 自动测试验证高度/物理对齐；像素级接缝仍需浏览器截图回归 |
| 参考图白膜只有几个圆和浮动方块 | 增加全局高度 Raster、语义 Mask、地形内生远岛、地形吸附标志物和首帧构图门禁 | `sunlit-flower-bay` 浏览器实测区域 IoU、人物与灯塔锚点均过线 |
| 需要不带 UI 的游玩录屏 | 直接录制 WebGL canvas 的 60 FPS 视频流，停止后按浏览器编码能力下载 WebM/MP4 | 真实浏览器录制 6 秒并生成 1.2 MB WebM；录制按钮、HUD 和检查器不在 canvas 流中 |

## 4. Planner / Builder / Visual Bible 创作实验

`grassland` 已迁移为首个完整样例：

- Planner 产物包含 WorldPrompt、Entity Catalog、World Plan 和 Opening Shot。
- `plan-lock.json` 冻结规划源码与两张图片；Builder 前后都可检测漂移。
- Builder 导出的场景清单标记 `workflowStage: "verified"`，并记录冻结锁与规划图片哈希。
- Playground 已真实导出 `humanoid-player` 与 `watchtower` 两个 Prototype 的 Front / Right / Back 白膜三视图；分别使用红色与蓝色唯一实例色。
- `visual:inputs` 已校验冻结锁、verified 场景和两张白膜三视图。样式三视图与渲染首帧尚未生成，因此当前样例不声称已经完成 `visualized` 阶段。
- 隔离启动器的所有 post-agent 类型检查、测试、构建和工件导出也通过 workspace-only sandbox 执行，不直接在无隔离宿主中运行 Agent 生成代码。

本次浏览器人工 QA 发现并修复了高 DPR 屏幕下三视图被裁切的问题：WebGL viewport/scissor 现在使用 renderer 的逻辑尺寸，而不是包含 DPR 的 drawing-buffer 尺寸。修复后人物与高塔在三格中均完整、等比例、背景一致。

`sunlit-flower-bay` 已用用户提供的花海海湾图片完成一次真实端到端运行：

- 参考图先复制为项目内 `reference-0.png`，并和 World Plan、Opening Shot、WorldSpec 一起进入 `plan-lock.json`；Builder 只消费项目内 URI，未读取其他工作区目录。
- Planner 扩展出 1200m × 1000m 完整世界、进入视角、六条路线、一个主体 Prototype 与灯塔/房屋/帆船三个物体 Prototype。四类实例分别使用红、黄、蓝、紫唯一白膜色。
- 旧 Builder 虽通过数值测试，但首帧本质上仍是几个圆形抬升、一个水面和两个浮动方块岛；规划 Region 只是元数据，没有真正写入几何。这一结果被保留为失败样例并触发 SDK 改造。
- 新 Builder 用一张 241 × 201 的 Agent 数据场表达完整海湾、海岸、远岛、出生坡面和路径高程，用独立 Raster Mask 标出草地、岩壁和道路。地形、渲染网格和 Rapier 仍共享同一高度数据，远岛不再是方块，房屋与灯塔在构建时吸附地面。
- Opening Shot 新增 320 × 180 语义 Mask 门禁：天空/海湾用区域 IoU，人物/灯塔用投影中心与尺寸误差；总分达标也不能覆盖单项失败。浏览器最终验收已通过。
- Codex Image 工具以白膜三视图作为结构约束、参考图和 Opening Shot 作为风格约束，生成四张样式三视图和 `opening-frame-rendered.png`。`visual-bible-manifest.json` 已记录最终首帧与全部八张三视图的哈希，`visual:check` 通过。
- Builder 隔离流程曾两次把并发文档提交或自身临时编译缓存误判为越权；实现本身的测试、类型检查、构建和规划导出均通过。后续应把权限审计的基线限定为 Agent 阶段开始后的授权文件集合，并显式忽略阶段私有临时目录。
- 页面三视图写入端点在一次带多余 `--` 的 Vite 启动命令下返回 404；使用标准 `pnpm dev`/Vite 启动方式已验证插件端点会加载。本次结果仍由同一页面运行时捕获，宿主只负责把 PNG 写入声明路径。

## 5. 2026-08-20 自动验证结果

```text
pnpm test         35 test files / 335 tests passed
pnpm test:scenes  2 test files / 18 tests passed
pnpm typecheck    passed
pnpm build        passed
pnpm verify:canonical passed; Authoring 2 / IR 2 / Plan 3 / Snapshot 3 / Browser 3
pnpm verify:rigged-subject passed; Golden GLB/Rig/Animation/Collider/Hash/Tamper E2E
pnpm test:isolation passed; workspace 外目录不可读
pnpm plan:check -- --scene grassland passed
pnpm plan:scene -- --scene grassland passed
pnpm plan:scene:check -- --scene grassland passed
pnpm visual:inputs -- --scene grassland passed
pnpm plan:check -- --scene sunlit-flower-bay passed
pnpm plan:scene:check -- --scene sunlit-flower-bay passed
pnpm visual:check -- --scene sunlit-flower-bay passed
```

已知非阻塞告警：

- Rapier compat 初始化仍会输出 deprecated parameter 警告，需要升级调用方式。
- Playground 生产构建通过；Vite 仍提示多个大于 500 kB 的 chunk，需要后续
  code splitting，但不阻塞当前协议与 E2E 门禁。

## 6. 自动验证覆盖与未覆盖

自动验证已经覆盖：

- 场景可编译、所有 Feature 构建成功。
- 资源唯一所有权、依赖、有限 Transform，以及出生点的地形高度/落差/坡度安全；尚未检查出生点与水体、标志物或世界边界相交。
- 各场景渲染高度采样与 Rapier 高度场一致。
- Azure Bay 从出生点到观景坡底的主路线坡度不超过 35°；Sunlit Flower Bay 六条冻结路线均满足各自 30°–34° 上限。
- Core、Physics、Camera、Subject、Animation、Terrain、Feature、Schema 和 Testkit 的核心单元测试。
- WorldSpec 的必需字段、项目内图片 URI、Feature/进入镜头一致性，以及结构化规划工件的确定性导出。
- WorldPrompt 完整性、Prototype/Instance 引用、唯一实例色、固定三视图路径和 Landmark 运行时绑定。
- Planner 冻结输入的哈希漂移、verified 场景清单和 Visual Bible 输入文件完整性。
- `grassland` 主要路线的真实地形坡度采样；高度/坡度图来自编译后的 Heightfield，而不是图片模型。

仍需人工或未来视觉回归覆盖：

- 长时间上下坡时的主观移动手感和剩余镜头微振。
- tile 边界的像素级阴影/法线接缝。
- 构图门禁已覆盖结构化语义区域和实例锚点；仍需人工判断未标注轮廓、审美质量与单图歧义。
- 生成 World Plan/Opening Shot 与真实白膜的通用视觉嵌入评分；当前门禁依赖 Planner 先给出可解释的区域/锚点 Guide。
- 白膜三视图与样式三视图的自动轮廓/姿态一致性评分；Sunlit Flower Bay 已有完整配对，但当前仍只自动检查文件、路径和哈希。
- 水岸在各种视角和地形高度下的观感。
- 产品资产的动作混合观感、脚滑、独立动画资产、姿态和更多 Semantic Action；
  Golden `idle/walk/run/jump` 只作为确定性管线 Fixture。
- 世界模型条件帧与最终生成画面的一致性；当前已产出条件包和目标首帧，但实时世界模型链路尚未接入。

其他实现层已知问题：

- `WorldSnapshot.player.grounded` 目前由最近动作推断，不是 Rapier motor 的真实 grounded 状态。
- `reset()` 重置主体、镜头和输入，但不会把 World tick 或 frame 归零。
- `humanoid-rig-status` 是 Adapter 为检查器追加的运行时状态项，不属于 FeatureRegistry 资源图。
- 早期未引用的 `demo-world-adapter.ts` 已删除；Playground 只保留真实 `SdkWorldAdapter` 链路。

## 7. 当前结论

当前代码已经证明“受约束的 Planner、Builder 与 Visual Bible 可以通过冻结契约，把单张参考图变成可追踪、可玩的室外高度场白膜世界，并交付目标渲染首帧和实体视觉绑定”。`sunlit-flower-bay` 是第一个完整 `visualized` 样例；但单个成功样例还不能等同于“任意场景”或“第一期生产完成”。下一步应扩大图片参考实验集，并把首帧构图、三视图轮廓、可玩性、性能和主观手感变成自动或半自动验收。
