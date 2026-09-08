# Agent 链路与 Playground 能力对照

**当前状态：本文六项发现已在 2026-09-09 处理，见[实现与验证记录](2026-09-09-agent-capability-closure.md)。下文保留审查时的事实。**

审查基线：`7f1f89de`（控制契约 8 项修复），开发主分支 `6b1c94ef`。

结论：Creator 的创作、运行、自检、交付以及 Episode 的导入、规划、录制已有明确闭环；核心人物、骑乘、相机和物理手感复用 SDK。不能宣称所有 Playground 演示都已经成为 Agent 可表达、可生成、可录制的完整能力。缺口主要在工具契约、发现信息、录制意图和少量可选视觉接线，不需要再造场景 SDK 或拆新 package。

## 链路与边界

| 环节 | 当前实现 | 本轮证据/边界 |
| --- | --- | --- |
| 选择主体、资产、接口 | environment → schema/examples → assets search/describe | 支持普通人、人骑载具、独立非人主体；工作区 SDK 声明优先，缺失能力不推断为支持 |
| 自由构建与运行 | 普通 Three 代码 → Creator compiler → 原 SDK 或 materialized SDK | 一套时钟/物理/动画/相机；场景几何由作者实现 |
| 行为与画面反馈 | inspect、命令回执/operation、截图、三视图、真实输入与视频 | 已有结构化错误、人物连续性、水体诊断；不把仅接收命令视为执行成功 |
| Creator 交付 | 同一会话 playtest → submit → 哈希绑定的源代码/运行时/证据 | 本轮真实自制摩托与预设人物交付通过 |
| Episode 生产 | delivered source adapter → observe/probe/submit plan → 固定步进录制 → 样式与请求准备 | 本轮完整 Training 起点探测和独立 2 秒录制通过；六段 30 秒调度有本地回归，未重跑正式生产 |
| 跨阶段自动化 | Creator delivery 导入、Episode 批处理/恢复；视频服务为独立显式入口 | Creator 交付自动订阅尚未实现，不能称为无需触发的全自动流水线；本轮未调用云端/视频提供商 |

## Playground 能力对照

| 能力 | SDK / Agent / Episode 状态 | 是否需要搬 Playground 代码 |
| --- | --- | --- |
| 人物走跑跳、翻越、攀爬、游泳、姿态、拾取/坐下 | SDK 实现；能力卡、锚点、输入和语义操作可查询。Episode actionGoals 覆盖现有 skill、posture、climb、swim-style | 不需要搬控制器；场景提供真实条件 |
| 同一预设人物步行→骑乘→步行，自制坐骑 | SDK 与 Creator 示例/真实自检已接通。Episode 能从已骑乘起点录制，片段内进入/离开尚无计划意图 | 不需要重画人物或另建骑乘控制器 |
| 人与非人主体第一/第三人称、快捷键许可 | SDK、作者参数、示例和起点覆盖已接通。非人第一人称需要作者给眼位；Training 额外保留越肩模式 | 不需要；开关和默认值写入场景 profile/follow 配置 |
| 骑乘转弯倾斜、速度反馈、镜头回正、避障恢复 | 来自 Training simulation/camera 和 camera-collision；第一人称继承载具 rotation/up，非 Playground 私有算法 | 不需要复制倾斜代码；效果取决于控制族、实际速度和配置 |
| 每个主体的手感调参 | SDK 支持 profile，Playground 通过相同 applyProfile/exportProfile 接入；界面为作者提供编辑/导出 | 编辑器本身无需进 Agent；人物未配置距离时有兼容默认分支；显式参数不一定独立生效，见发现 6 |
| 车轮转动、转向、旋翼及部分生物装饰动画 | 车轮辅助已导出 SDK，但需要作者给 wheel rig 并接视觉回调；Playground 仍有本地同源实现和旋翼接线。自制摩托最小示例只画车轮 | 属于可选视觉接线，可补小示例；不能声称任意 Mesh 自动识别车轮 |
| 碰撞体/FPS 面板、资产库、实验场、调参界面、装备预览 | Playground 辅助 UI；SDK 已提供相关状态和部分底层绑定 | 不应把整套 UI 搬到生产场景。装备预览存在不代表当前白盒生产策略允许添加服饰 |
| 独立非人的飞行/游泳等自定义移动 | SDK 可注册自定义 movement，Creator 可编译运行；Episode 通用自动路线当前不接受任意 custom movement | 这是录制适配边界，不能把 createWorld 可创作等同于任意主体可生产录制 |

主要源码：
[Playground 入口](../../examples/three-creator/sdk-capabilities/main.ts)、
[SDK Training 相机](../../packages/three-world/src/training/camera.ts)、
[控制器](../../packages/three-world/src/training/simulation.ts)、
[人物工厂](../../packages/three-world/src/humanoid.ts)、
[Creator 工具](../../scripts/three-creator/tools.ts)、
[Episode 录制](../../scripts/three-episode/capture.ts)。

## 值得继续处理的发现

### 1. P2：Host 参数范围仍与 SDK 不一致

`training.profile.cameraDistanceMeters=60` 在 SDK execute 中成功并生效，Creator 命令 schema 却拒绝：SDK 范围为 `(0,100]`，Host 写成 `[1,40]`。

证据：[SDK prepareProfile](../../packages/three-world/src/training/runtime.ts)、[Host command schema](../../scripts/three-creator/command-schema.ts)。本轮本地重现记录在 `.codex-tmp/agent-parity/probe-result.jsonl`。

最小处理：让同一参数约束来自 SDK 的公共配置声明；保持 Host 的权限/交付职责独立。收益是合法配置不再被错误拦截，不增加任何调用或校验阶段。

### 2. P2：输入已被覆盖时，Agent 缺少直接状态解释

Training 实际输入优先级是持久 `setInput` override → `WorldInput.training` → 普通输入映射。当前快照有参数、人物、载具和动作状态，但没有有效输入及其来源。设置全零 override 后快照完全相同，键盘随后会被它覆盖；仅看按键记录难以解释“按了但不动”。

证据：[runtime input/snapshot/advance](../../packages/three-world/src/training/runtime.ts)，本轮重现 `snapshotChanged:false`。

最小处理：在按需 inspect 中补有效输入、来源、暂停/录制所有权及受限原因；不扩建控制权管理框架，不对每帧重复输出说明文本。

### 3. Episode 无法表达片段内骑乘与视角变化

底层 EpisodeCommand 已允许 enter/exit，普通 SDK 也已有人称切换，但 planner 的 actionGoals 只有 skill、posture、climb、swim-style；相机视角只能在 start 设置。Creator 可以演示上车/下车，Episode 计划暂时不能要求同一段执行这些动作。

证据：[EpisodeCommand](../../packages/three-world/src/episode-contracts.ts)、[计划意图](../../scripts/three-episode/contracts.ts)、[行动执行器](../../scripts/three-episode/action-controller.ts)。

最小处理：真实任务需要时，在既有 actionGoals 增加明确 enter/exit/view 意图并复用现有状态反馈。进入应走到真实接近位置后调用 enter；approach 仍只用于准备，不能代替录制中的移动。无需引入可执行脚本语言。

### 4. 任意 custom movement 的 Episode 录制尚未接通

`movementForCapture` 对非 Training 的任意 `custom` movement 抛出 `EPISODE_MOVEMENT_UNSUPPORTED`，只保留一个明确的既有适配例外。独立动物地面案例已通，独立飞行/游泳不能据此类推。

证据：[capture.ts](../../scripts/three-episode/capture.ts)。

最小处理：发现/观察时明确实际录制支持范围；针对真实出现的移动族接入轻量输入适配，继续由 SDK 推进模拟。不要通过增加一套非人世界工厂解决录制控制问题，也不要提前搭全能路线框架。

### 5. 录制仍把部分镜头表现偏好作为失败条件

对于没有 `actionGoals` 的片段，现有 `assertPlayerBehavior` 对普通跟随镜头要求至少 20° 范围和 40° 总转动，骑乘要求至少 10° 总转动；Host 自动安排的跳跃若未完成也会失败。这些条件并非全都来自用户意图，可能导致静态构图/窄空间片段重复修复。

证据：[player-controller.ts](../../scripts/three-episode/player-controller.ts)。

建议：将未明确要求的镜头丰富度与自动装饰动作结果放进 health 反馈；保持真实时钟、文件、运行异常和明确要求动作的结果证据。默认可以丰富动作，但不应因审美阈值让完整可用录制重跑。需用实际失败样本评估收益，当前没有统计失败率改善幅度。

### 6. P2：人物镜头参数被“是否配置距离”隐式控制

未配置 cameraDistanceMeters 时，人物相机实际使用兼容分支 response=7、collisionRadius=.2、FOV58，和 Playground 人物默认一致。不能仅由基础 tuning 常量 8/.25/55 推断默认手感不一致。

真正的问题是设置 `profile.camera.baseFovDegrees=80` 后，命令显示 applied，exportProfile 返回 80，但实际人物第三人称相机仍为 58；只有配置了 cameraDistanceMeters 才读取该 tuning。followResponsePerSecond 和 collisionRadiusMeters 也存在同样的分支依赖。

证据：[Training 相机](../../packages/three-world/src/training/camera.ts) 的 humanoidCollisionRequest / updateHumanoid；本轮本地重现 `configuredFov:80, actualFov:58`，记录见 `.codex-tmp/agent-parity/probe-result.jsonl`。

最小处理：在初始化时明确默认值，后续显式 camera 参数独立生效；用实际有效值反馈，保留默认画面表现。无需增加新参数或要求 Agent 同时设置一个无关的距离才能让视野生效。

### 可顺手整理的视觉示例

Playground 车轮 helper 与 SDK 已有重复实现，旋翼动画由示例自己连接。可以让示例复用 SDK helper，提供一段可选 wheel-rig/visual callback 示例。不要自动推断任意自制模型的车轮、旋翼或骨骼。

证据：[示例 helper](../../examples/three-creator/sdk-capabilities/vehicle-animation.ts)、[SDK helper](../../packages/three-world/src/training/vehicle-animation.ts)、[Playground 默认 profile](../../examples/three-creator/sdk-capabilities/platform/profiles.ts)。

## 本轮附带修正与取舍

全链路检查发现云入口仍写死 Shift 加速和滑铲 2.5 m/s、Episode 文案仍把 probe 仅描述为胶囊检查。本轮已将这些提示改为读取当前绑定、控制族和实际能力条件，补齐前述 8 项在入口提示词的覆盖；没有改写运行任务的冻结输入。

建议优先处理 1、6、2：先让合法参数能通过并实际生效，再补有效输入诊断。5 可减少无必要的重跑；3、4 按实际生成任务接入。以上新发现尚未修改运行时代码。

不建议新增 package、通用场景构造 API、全世界导航验证、强制六次预演或把全部 Playground UI 放入生成模板。遵循[设计背景](../three-sdk-architecture.md#设计背景与取舍)和[Harness 原则](../three-sdk-architecture.md#harness-反馈与生产校验)。

验证范围：源码调用链核对、第二轮独立报告事实核查、810 项 Vitest、140 项相关 Node 检查、20 项云入口本地契约检查、独立复审和真实短链路；本轮没有让模型新生成场景，没有云生产或供应商调用，也未逐个手动验收所有 Playground 场景。源码支持与模型稳定选用是两种证据，后者需要真实案例数据。
