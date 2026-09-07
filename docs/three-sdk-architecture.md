# Three SDK 设计与职责

本文描述当前 Three 分支的设计原则与已存在的接口。公开 API 以
[`contracts.ts`](../packages/three-world/src/contracts.ts) 和
[SDK 使用说明](../packages/three-world/README.md) 为准；生产流程和未完成项见
[数据生产说明](three-sdk-data-production.md)。

## 创作方式

作者使用普通 HTML、JavaScript/TypeScript 和 Three.js，直接创建 Scene、Camera、
Mesh、Group、材质、灯光和视觉子对象。几何不需要再转成一套私有场景语言。
Creator 提供 `three-raw` 与 `three-sdk` 两种 profile；当前 Episode 消费的是
已验证的 `three-sdk` 世界。

SDK 的基本接入顺序是：创建 Three 场景与相机 → `createWorld(...)` → 注册实体和
角色 → 添加玩法 → `start()`。初始化时可自由组织 Three 对象；注册后的物理、
角色、动画与相机按下表分配写入权。

## 谁负责什么

| 内容 | 负责人 | 边界 |
| --- | --- | --- |
| 几何、材质、视觉子对象、玩法意图 | 场景作者 | 复用 Three；不以另一套物理或模拟循环替代 SDK |
| 碰撞、角色支撑、重力、刚体 | SDK 的 Rapier 物理模块 | 实际几何与角色控制器决定运动；动画宽限不改变物理落地状态 |
| 输入、固定步进、暂停、重置 | SDK | 一个模拟时钟；清理按键、旧任务与历史状态 |
| 已注册角色的移动和动画 | SDK | 自定义 movement 返回意图；实际碰撞和受管动画仍统一执行 |
| 相机 | 作者构图，SDK 按模式接管跟随 | 保留开场；相机模式明确交接，同一时刻只有一个写入者 |
| 受管实体属性、命令、操作状态 | SDK | 运行中通过公开接口修改；查询实际状态与执行结果 |
| 编译、浏览器工具、自检、交付 | Creator Host | 不在 Node 中执行作者代码；交付绑定源码、资产与实际运行时字节 |
| 路线规划、录制、样式、请求与恢复 | Episode Host 与阶段 Agent | 消费已交付世界；不把生产调度放入 SDK |
| UI 与模型画面展示 | SDK Presentation + 应用 | 展示读取世界状态；模型服务和帧映射由应用/服务接入 |
| 场景与图片人工反馈 | 现有共享审核服务 | 不随 SDK 版本另建身份；旧图片决定不能批准新图片 |

`packages/three-world` 使用 Three/Rapier，并复用 `packages/camera-collision`。
这两个包构成当前工作区；旧 Babylon/Havok、Native 和 Block 包已移除。Three 的
Recast 导航依赖及补丁继续保留。

## 保持 SDK 简单

- Three 已能表达的几何和视觉，不再建立重复的对象模型或通用场景 DSL。
- 新能力优先通过现有实体、角色和受支持意图表达；只有跨场景复用且需要统一执行
  的行为才进入 SDK。
- 每个受管状态有明确写入者。物理子树不因处于 Three 对象内部就变成可任意修改的
  视觉对象；纯视觉子对象可在 SDK 的同步更新回调中动画。
- 命令、参数、动作和任务接口按实际消费者使用。简单场景不需要先实现完整的自然
  语言控制框架，也不需要为每个 primitive 注册独立实体。
- SDK 提供观测与执行端口；模型选择、自然语言理解、云调度、素材生成和审核由外部
  管线承担。接口存在不等于外部服务已接通。

这些是后续实现的约束，不表示当前已有接口已被删除或底层复杂性已经消失。
角色台阶/斜坡运动、动画连续性、相机避障与完整重置仍由 SDK 集中解决。

## 现有能力接口

| 用途 | 入口 |
| --- | --- |
| 搭建世界 | `createWorld`、`addEntity`、`addCharacter`、`assets.load` |
| 控制与镜头 | `setControlledEntity`、`setCameraFollow`、`useAuthoredCamera` |
| 添加玩法 | `onUpdate`、`onInteract`、`state.define` |
| 扩展与可发现控制 | `registerMovement`、`registerAction`、`defineParameter`、原型与几何注册 |
| 执行与观察 | `execute`、`operations`、`describe`、`snapshot`、`getEntityState` |
| 生命周期 | `start`、`stop`、`reset`、`dispose`、`runTask` |
| 展示与纯画面输入 | `createPresentation` |

命令被接受不等于动作已经完成；耗时操作应查询最终状态。不能把注册名称、动画条目
或自定义速度回调当成攀爬、飞行寻路等能力已完成的证据。具体限制以实时能力描述
和实际实现为准。

Creator 的 schema 工具按主题从实际公共类型提取声明，并从 SDK README 提取对应
指导。维护 API 时更新这一份来源，不再维护脱离运行代码的公开类型草案。

## 世界画面、模型输出与 UI

`world.createPresentation()` 将展示分成三个端口：

- `modelInput`：采集原始 Three renderer 的纯世界画面，不含独立 DOM UI。
- `output`：显示应用传入的模型图片或视频；原世界继续模拟，输出不回灌输入。
- `ui`：挂载 HTML/CSS，读取 SDK 状态并调用公开命令或生命周期接口。

显式帧捕获携带 presentation、epoch、帧编号及模拟状态元数据。模型服务返回真实
源帧关联后，HUD 才能使用对应的历史样本；未知映射明确标为不可同步，不能猜固定
延迟。重置使旧帧身份失效。此能力不等于远端模型传输、像素级同步或生成图像目标
跟踪已经实现。

## Creator 与 Episode 的边界

Creator 保留当前 v0.2 交付契约，包括同会话、当前世界与当前输入计划的真实自检
录像，以及开场和对象三视图。技术交付状态与场景视觉/玩法审核分别判断。

Episode 从已验证交付派生生产副本，使用 SDK 的 Host-only
[`EpisodeRuntimePort`](../packages/three-world/src/episode-contracts.ts) 初始化片段、
推进输入并读取真实帧。它独占录制期间的时钟，复用同一套物理、动画和相机；片段
起点可初始化，沿途目标必须通过实际运动到达。Creator 自检与 Episode 六段录制
用途不同，各自保留证据。

当前生产规格是 6 段 × 30 秒、10 套风格、最多 60 条视频请求。视频提供商提交、
自动订阅 Creator 交付、最终视频验收尚未接通。SDK Presentation 端口也不构成
这些生产能力已经完成的证明。

## 维护与验证

变更先明确归属：场景内容、SDK、Creator Host 或 Episode。场景不能通过修改 SDK
物理、相机或 Host 校验器完成自己的验收。运行时变更按
[专项检查表](reviews/runtime-deep-review-checklist.md) 同时检查 Creator 与 Episode
受影响的行为。纯文档变更检查链接、源码声明和 diff，不启动云生产。
