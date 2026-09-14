# 相机技术设计深度审查

日期：2026-09-13。初审提交：`7ed29aee6e4fce7509371281c82ea91cd7d43335`；
当前代码事实基线：`285246867`。审查对象为[相机技术设计](../superpowers/specs/2026-09-13-camera-configuration-design.md)。
本轮深审修订版本（提交 `ccc89bd3`）的文档 SHA256：
`71c2293a318913ed27f2cbfe298187be4eed396a5d1f166c831f4e56ae4dcef8`。后续变更以 Git 记录为准。

## 结论与证据范围

核心分层符合成熟游戏相机系统的常见做法，适合当前 Three.js／Rapier 和 Creator／Episode 的
执行约束。初稿尚有实现会遇到的协议和状态缺口；本轮已完成修订与复核，可作为实施设计依据。
未发现本轮审查范围内仍需阻止实施的未处理设计问题。

这不是对“唯一最佳设计”的证明。文档的目录、JSON 覆盖、编辑事务、版本准入是本项目的选择，
需要由实际调用与测试支持；不能因为列出知名引擎名字就认为正确。

本轮使用三项相互独立的只读审查：运行时／几何，配置／编辑器，生产消费者／协议；
主审重新核对本地源码、官方文档及修订之间的交叉关系。检查了文档链接、标题锚点、JSON 示例
语法与 diff。没有实现新接口、运行游戏、迁移配置、启动生产任务或测试视觉／性能。

## 已处理的问题

优先级描述设计缺口的影响，不表示已经在新运行时复现了缺陷。初审为 2 项 P1、7 项 P2；
复核中两条切换交叉规则归入对应问题一并处理。

| 编号 | 级别 | 反例与影响 | 修订结果 |
| --- | --- | --- | --- |
| C1 | P1 | Episode 起始视图支持新 ID，但片段内 actionGoals 仍只接受二元 perspective；explore→aim 无法正确提交／验收 | [第 10.1 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#101-起始视图与片段内视图动作)补齐 intent、schema、命令、分派、viewId 和过渡完成条件；起始视图强制 cut，片段内才混合 |
| C2 | P1 | 新 Host 只检查旧冻结端口方法存在，旧 runtime 可静默忽略未知视图字段 | [第 10.2 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#102-冻结运行时准入)明确 v2 端口／能力准入、响应核验和 v1 拒绝策略 |
| C3 | P2 | 草稿被定义为额外最高覆盖层；编辑被项目覆盖的预设时，预览 6 m、保存重建却变回 10 m | [第 5.3 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#53-唯一解析与覆盖顺序)删除草稿值优先级，修改原作用域并使用同一 resolver |
| C4 | P2 | 编辑 A→B 后项目安装 C，cancel 恢复 A，覆盖外部合法更新 | [第 11.2 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#112-编辑会话)校验配置 revision、基线身份和相机提交身份，明确取消、基线提交与 dispose 的界限 |
| C5 | P2 | alpha=1 截图后人物呈现被切到当前 tick，相机却使用更早的原始 RAF alpha，眼位脱离人物 | [第 7.3 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#73-显示与镜头对象)让人物、车辆、骨骼和相机消费同一 PresentationSampleContext |
| C6 | P2 | 第一人称期间上车后返回缓存第三人称，旧 10 m 距离超出新主体范围，旧角度参考也已变化 | [第 7.5 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#75-非活动视图意图)明确缓存身份、参考重基、范围适配、失效和重新初始化，不缓存持续运行的 solver |
| C7 | P2 | 过渡中再切视图／上车，没有固定源帧和中断规则；first-person cut 又可能被旧机位扫掠截停 | [第 7.4 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#74-视图过渡与中断)明确源／目标／进度、控制基和裁切时点；cut 清跨镜头扫掠但仍校验新眼位 |
| C8 | P2 | 任意父变换都用 quaternion 逆乘，无法兑现非均匀缩放／剪切下正确世界机位 | [第 7.3 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#73-显示与镜头对象)限定受管相机为单位尺度刚性父变换，并区分主体锚点缩放和米制 offset |
| C9 | P2 | 新 world.inspectCamera 只存在 SDK，Creator observer／bridge 仍读即将删除的 Humanoid 配置字段 | [第 12 节](../superpowers/specs/2026-09-13-camera-configuration-design.md#12-creatorepisode-配置消费与身份)接通 observer、按需 camera section、current-view 反馈与录制摘要 |

主要本地依据：

- C1／C2：[Episode 数据契约](../../packages/episode-pipeline/src/contracts.ts)、
  [视图动作控制器](../../packages/episode-pipeline/src/planning/action-controller.ts)、
  [浏览器端口适配](../../packages/episode-pipeline/src/capture/browser.ts)、
  [SDK Episode 契约](../../packages/three-world/src/episode-contracts.ts)。
- C3／C4：[Playground 配置应用](../../apps/sdk-playground/src/main.ts)、
  [资产 profile 应用](../../packages/preset-content/src/profiles/profile-runtime.ts)。
- C5／C6／C7：[Humanoid 呈现与生命周期](../../packages/three-world/src/humanoid-runtime/runtime.ts)、
  [相机交接](https://github.com/seedleap/agent-whitebox-world-sdk/blob/2852468670864e7b829c7f84c0f56f280494f88f/packages/three-world/src/camera.ts)、
  [碰撞求解](../../packages/camera-collision/src/camera-collision-solver.ts)。
- C8：[现有物理父变换约束](../../packages/three-world/src/physics.ts)和 Three 的矩阵适用范围。
- C9：[World observer](../../packages/three-world/src/world.ts)、
  [Creator bridge](../../packages/creator-host/src/browser/bridge.ts)、[MCP schema](../../packages/creator-host/src/cli/mcp.ts)。

## 主流设计对照

| 依据 | 支持的设计判断 | 不应由此推导的结论 |
| --- | --- | --- |
| [Cinemachine CameraState](https://github.com/Unity-Technologies/com.unity.cinemachine/blob/69b205115495a374fbba329547ba608cdcfe7847/com.unity.cinemachine/Runtime/Core/CameraState.cs)、[ComponentBase](https://github.com/Unity-Technologies/com.unity.cinemachine/blob/69b205115495a374fbba329547ba608cdcfe7847/com.unity.cinemachine/Runtime/Core/CinemachineComponentBase.cs) | 策略输出待提交状态，修正与基础姿态分离，明确生命周期入口 | 本项目 JSON、半衰期默认值和事务协议自动正确 |
| [Cinemachine Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html) | 集中决定相机输出，更新时序要匹配目标及游戏循环 | 所有游戏必须采用同一固定时钟或同一种插值策略 |
| [Godot SpringArm](https://docs.godotengine.org/en/stable/tutorials/3d/spring_arm.html) | 空间探测、实际臂长及对象过滤有明确职责 | 弹簧臂自动解决上下车、构图和录制一致性 |
| [PlayCanvas OrbitController](https://github.com/playcanvas/engine/blob/7b00ca4db4bda4c903f4cc727f39b38b43b76aa3/src/extras/input/controllers/orbit-controller.js) | 交互控制和姿态求值可以分开 | 必须复制其 DOM 输入或显示循环 |
| [UE Gameplay Camera System](https://dev.epicgames.com/documentation/unreal-engine/gameplay-camera-system-overview) | 配置资产、Rig、切换与选择分开；属性编辑由运行契约支撑 | 标为 Experimental 的框架可直接作为本项目生产成熟度证明 |
| [Three Matrix4](https://threejs.org/docs/pages/Matrix4.html) | 不能承诺任意父矩阵均可安全按 TRS 分解 | 仅检查 quaternion 就覆盖缩放、反射和剪切 |

维持相机在 SDK 内的决策成立：它与输入、目标、物理和录制生命周期紧密协作；
通过内部模块契约隔离策略和工具，已有 camera-collision 保持独立，不需再增加运行时包。
统一字段定义和配置解析也成立，但草稿、来源和保存必须遵守本次修订后的具体规则。

## 实施前后仍需验证的事项

深审后补充了[第三方依赖与复用](../superpowers/specs/2026-09-13-camera-configuration-design.md#21-第三方依赖与复用)：
对照现有依赖和官方接口，明确成熟库优先、camera-controls 的状态恢复限制及 Ajv 构建期校验产物。
该补充只涉及选型与接入约束，未安装新依赖或验证生产替换效果。

- v2 准入是显式迁移取舍：新版 pipeline 不无条件接受旧冻结 runtime。升级需重建并验证，
  旧录制必须有可核对的旧 pipeline；不得自动修改旧交付或发起替代任务。
- 第一人称跨视图暂用 cut；非刚性相机父节点明确拒绝。它们是可验证的支持边界，
  不应包装成所有引擎通用的最佳规则。扩展这些能力需要独立的几何和呈现验证。
- 已有标定能否保留、需要重调的范围、视觉连续性和性能仍未知，按技术设计的真实操作链验收。
  所列数值容差是初始目标，不是已取得的对照结果。
- 实施需让配置 parser、schema、实际渲染、Creator 工具和 Episode 动作测试一起通过；
  文档审查通过不能替代这些运行证据。
