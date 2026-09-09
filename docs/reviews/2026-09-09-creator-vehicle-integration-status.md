# Creator 自绘载具接入现状

范围：[PR #215](https://github.com/seedleap/agent-whitebox-world-sdk/pull/215) 的车辆物理能力及
[PR #218](https://github.com/seedleap/agent-whitebox-world-sdk/pull/218) 的 Agent 接入。
功能源码基线为 `05ed0fcbf02a8921c8964129cfdfe9c36b3b78ff`。

**汽车／摩托的核心物理和动态桌椅已接入 Creator；实时车辆诊断与仪表展示仍有缺口。**
不能把“运行时可执行”或“测试通过”表述为“#215 的全部新增项都已方便地提供给 Agent”。

## 已接入

| 能力 | Agent 的使用方式与边界 |
| --- | --- |
| 自绘车辆选择操控配置 | `training.createRoadVehicleSpec('car' \| 'motorcycle')` 返回独立、可修改、不含模型的配置；先选配置，再依据尺寸与轮组绘制几何并绑定 SDK。 |
| 撞击、下坠、翻滚、落地 | 由同一 Rapier 世界及逐轮求解器执行；Agent 提供匹配的车身尺寸和真实地面／障碍碰撞体，无需重写物理算法。 |
| 悬架、轮胎力、抓地与坡道转向 | 道路配置启用 `wheelPhysics`，包含质量、轮组、悬架、重心与摩擦参数；自定义轮组复用已有求解器。 |
| 发动机、自动换挡、加速、倒车与制动 | 配置包含动力链和 SDK 控制默认值；逐轮模式使用动力链，不叠加旧 `brakeDrift` 路径。 |
| 轮胎显示 | 汽车与摩托示例把 `onVisualUpdate` 的车辆采样传给 `updateVehicleWheels`，同步悬架、转向和旋转，不另建动画时钟。 |
| 扶正与重置 | Agent 可调用 `training.recover`；摩托示例提供扶正按钮。世界重置复用 SDK 生命周期。 |
| 可移动桌椅 | `rigidGroup: {id, massKg}` 将零件组成一个动态刚体；人物交互示例包含真实桌腿／椅腿、`propBoxPose` 显示同步和重置。 |
| 动态物件与座位交互 | 拾取物失去支撑会下落；座位锚点跟随物体，移动或翻倒时由运行时拒绝／中断坐姿交互。 |
| Agent 配置发现 | Host 基线的 training schema 按需返回 `roadVehicleConfigurations` 与源码契约；工作区 SDK 展示对应源码定义，不把 Host 默认值当成编辑后的当前能力。 |
| 资产与生产指引 | 默认白名单移除 17 个车辆模型，指引要求自绘车辆；预设人物与允许的生物资产保留。已知禁止资源仍由现有资产策略检查。 |

入口：[道路配置源码](../../packages/three-world/src/training/road-vehicle.ts)、
[SDK 建模与绑定约定](../../packages/three-world/README.md#configuration-first-vehicle-authoring)、
[Creator 指引](../../scripts/three-creator/README.md#preset-humans-and-custom-vehicles)、
[自绘摩托](../../examples/three-creator/custom-vehicle/main.ts)、
[自绘汽车](../../examples/three-creator/vehicle-camera/main.ts)、
[动态桌椅](../../examples/three-creator/character-actions/main.ts)。

## 待接入与适用边界

1. **按需车辆诊断尚未直接接入 Agent 的标准观察工具。**
   转速、挡位、换挡状态、逐轮接地／轮载／打滑等数据可从 SDK 模拟状态读取，
   Playground 已有本地遥测。当前 `TrainingSnapshot` 只提供基础车辆状态，
   `world_inspect` 尚无直接返回这些详细数据的标准入口。
   后续宜按目标查询并附模拟时间和来源；观察不得推进模拟，也不增加默认输出体积或生产门禁。
2. **发动机仪表尚无对应的自绘车辆展示示例。**
   Playground 已有转速、挡位、车速等仪表，当前自绘汽车／摩托示例未演示这套展示。
   后续应提供可选的 Presentation DOM 用法；它不是物理能力的前置条件。
3. 当前完整的“选配置 → 自绘 → 绑定”入口覆盖汽车和摩托，
   其余操控类型仍使用各自控制器，未逐一整理为同等完整的配置接入套件。
4. 车身损伤、变形、碎裂、完整差速器等不属于已实现能力。
   已有字节检查与创作指引也不等于能识别任意 JavaScript 中模型来源的通用检测器。

诊断差异可对照 [TrainingSnapshot](../../packages/three-world/src/training/runtime.ts)
与 [Playground 本地状态读取](../../apps/three-playground/src/main.ts)；
仪表实现见 [Playground Shell](../../apps/three-playground/src/shell.tsx)。

## 生产原则

默认参数直接可用，Agent 无需先读完整底层源码或另跑调参流程。
生产自检只覆盖任务要求的结果，不要求每次固定重跑转向、坡道、撞击、上下车、重置等回归清单。
开发测试继续验证 SDK 的可复用行为；观测与仪表示例按需使用。
真实生产 Agent 的首次成功率、返工次数与耗时尚未专项评测，不能由开发示例通过推断生成稳定性。

## 验证与交付身份

以下工程结果对应功能提交 `05ed0fcb`；后续纯文档提交只补充链接、源码事实与 schema 消费检查。

- 本地 `pnpm test`：76 个文件、1,067 项通过（合同 283、资源密集 784）。
- 独立 Node/Python 通道：255 项通过；本机系统 Python 3.9 不支持现有 `zip(strict=True)`，
  测试改用已有 Python 3.13.2，未修改业务代码或系统默认 Python。
- 类型检查、示例类型检查、test census、workspace boundaries、文档链接与 diff 检查通过。
- 自绘汽车与摩托的独立 Episode 输入、位移、轮胎显示、重复取帧与重置检查通过。
- 自绘汽车完成约 12.7 秒真实输入录制、Creator 归档交付和 Episode 消费；
  动态桌椅完成真实按键推动、物理显示同步和重置验证。
- 独立审查发现的旧验收入口资产依赖已修复，复核无 P1/P2；这不消除上列观测／展示缺口。
- `05ed0fcb` 的 [GitHub CI validate](https://github.com/seedleap/agent-whitebox-world-sdk/actions/runs/34365001069)
  已通过；后续提交的 CI 状态以 PR 页面为准。
- Runtime hash：`6ac686c6424572150a3a3023431b7056f4ac77383cc11f69b4492d615c8d01f0`。

本地证据位于本 worktree 的 `.codex-tmp/road-vehicle-verification.json`、
`.codex-tmp/pr-full-test.log`、`.codex-tmp/pr-independent-python313.log` 和
`.codex-tmp/road-vehicle-final-delivery/report.json`；媒体与日志不进入 Git。
未运行真实云端 Agent 生成或外部视频生产，也未执行港口专用的 `test:training:flow` 场景验收。
PR 合并不等于云端 Creator 胶囊或现有项目的运行时已更新，实际使用版本须核对源码与 runtime hash。
