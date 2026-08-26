# UE 风格 G Bot 摄像机控制台设计

**状态：** 已实施
**日期：** 2026-08-25
**适用分支：** `feat/gameplay-camera-optimization`

## 1. 目标与范围

将 G Bot 的摄像机 Authoring 控制台重构为可观察、可调试的 UE 风格 Inspector，并使 Runtime 内部职责清晰地分为 Camera View 与第三人称 Follow Arm 两部分。

用户可在控制台选择两种镜头类型：

- **第一人称**：固定映射至 `first-person.standard`；Camera View 直接取 `FirstPersonView` Socket，不创建或执行 Follow Arm。
- **第三人称：自由环绕**：固定映射至 `orbit.medium`；Camera View 使用第三人称目标 Socket，Follow Arm 负责期望臂长、Lag、碰撞缩臂与恢复。

冲刺、瞄准等当前已支持的 Gameplay Context 可以叠加已声明的 Camera Modifier，但不得在用户手动选择上述类型后替换基础 Profile 或改变 `kind`。它们只能修改最终参数、FOV 或过渡。Registry 中的水面规则保留为 P2.5 游泳/攀爬切片的声明能力；当前 P1.5 Runtime 只发布 `ground | air`，控制台必须显示水面规则不可用，不能通过 Adapter 或别名伪造 `water` 状态。

本设计保持既有规则：镜头平移跟随角色；W/A/S/D、Shift、角色转身和移动方向均不接管镜头朝向。方向键的 `0.20 Seconds` 加速与 `0.15 Seconds` 惯性减速属于输入层调试项，不属于 Camera Rig 配置。

## 2. 非目标

以下 UE 能力不进入本次实现，也不能在控制台伪装成可调项：

- PlayerController、ViewTarget 网络同步、RPC、客户端相机更新或 DebugCamera Controller 替换；
- UE `ECC_Camera`、WorldPartition Camera Streaming CVar、HMD、第一人称 Primitive Scale、后处理、Overscan、正交投影和 Filmback；
- 游戏内热键切换镜头类型；类型仅由 Authoring 控制台 Preview/Draft 操作切换；
- 直接写回 Registry。控制台继续只支持 Preview Override、本机 Draft/Version 和 Candidate Export。

## 3. 运行时架构与权威

`CameraDirector` 继续是唯一的相机状态、最终 POV 和运行时选择权威。它不再以一个大方法隐式承担所有职责，而是在其内部组合两个无 Babylon Handle 的 Solver：

```text
CameraDirector
├── CameraViewSolver
│   ├── 选择后的 Profile / Modifier / Preview Override
│   ├── 目标 Socket、输入 yaw/pitch/zoom、Pitch/FOV、切换 Blend
│   └── Final ViewControlFrame 和 Final Camera Pose
└── FollowArmSolver                    # third-person only
    ├── Arm origin、Target/Socket Offset、Desired Arm Length
    ├── Position/Rotation Lag、Substep、Maximum Lag
    └── Collision Probe、Safe Arm Length、Retraction/Recovery
```

`CameraViewSolver` 与 `FollowArmSolver` 是 `CameraDirector` 的运行时内部对象，不是新的 Gameplay State、Babylon Component 或公开 Authoring Schema。`FreeCamera` 仍仅是 Babylon 适配对象。`MotionKernel` 保持角色速度与面朝方向权威；它只消费 View Control Frame 中已定义的输入，不读取或写入摄像机内部状态。

第一人称的 Follow Arm 状态明确为 `disabled`；第三人称明确为 `collision-follow`。不得通过一个可空的共享参数包让第一人称偷偷获得碰撞缩臂路径。

## 4. 类型选择、规则选择和配置来源

第一期不新增与 `baseMode` 或 `algorithmRef` 同义的公共 `cameraType` 字段，也不升级公开 Schema。控制台将现有组合显示为“镜头类型”，并执行下面的固定映射：

| 控制台选择 | 锁定 Base Profile | Runtime 结构 |
| --- | --- | --- |
| 第一人称 | `first-person.standard` | `CameraViewSolver`，Follow Arm disabled |
| 第三人称：自由环绕 | `orbit.medium` | `CameraViewSolver` + collision-follow `FollowArmSolver` |

运行时只允许一个 Camera Selection Decision。`packages/camera` 中的 Profile Admission/Selection 决定必须成为 `CameraDirector` 的输入；Director 不得保留第二套独立的 Context Rule 匹配实现。

每个最终参数都必须可追溯为以下之一：锁定 Profile、已生效 Modifier、Preview Override 或 Runtime Derivation。不存在无来源的隐式覆盖。

## 5. Camera Runtime Telemetry

新增只读 `CameraRuntimeTelemetryV1`，由 `CameraDirector` 单向发布到 Browser API 和控制台。它不能包含 Babylon/Havok Handle，也不能通过引用让 UI 回写 Runtime 状态。

```ts
interface CameraRuntimeTelemetryV1 {
  readonly selectedCameraProfileRef: string;
  readonly selectedCameraRigRef: string;
  readonly selectedCameraContextRuleId?: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly targetEntityId: string;
  readonly targetSocketId?: string;
  readonly targetSocketPositionXYZ?: readonly [number, number, number];
  readonly isTargetSocketFallback: boolean;
  readonly desiredTargetPositionXYZ: readonly [number, number, number];
  readonly desiredCameraPositionXYZ: readonly [number, number, number];
  readonly actualCameraPositionXYZ: readonly [number, number, number];
  readonly cameraYawRadians: number;
  readonly cameraPitchRadians: number;
  readonly finalFovDegrees: number;
  readonly requestedArmLengthMeters?: number;
  readonly safeArmLengthMeters?: number;
  readonly effectiveArmLengthMeters?: number;
  readonly isCollisionRetracted?: boolean;
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: readonly [number, number, number];
  readonly positionLagXYZ?: readonly [number, number, number];
  readonly rotationLagRadiansXYZ?: readonly [number, number, number];
  readonly resolvedParameters: CameraRigParametersV1;
  readonly previewParameterOverrides: Partial<CameraRigParametersV1>;
  readonly profileTransitionProgressRatio: number;
  readonly recenterRemainingSeconds?: number;
  readonly viewControlForwardXYZ: readonly [number, number, number];
  readonly subjectForwardXYZ: readonly [number, number, number];
  readonly subjectVelocityXYZ: readonly [number, number, number];
  readonly fixedStepDeltaSeconds: number;
}
```

第一人称字段 `requestedArmLengthMeters`、`safeArmLengthMeters`、`effectiveArmLengthMeters` 和碰撞字段全部为 `undefined`，而非零值。若缺失必需的第一人称 Socket，Runtime 必须发布 `CAMERA_REQUIRED_SOCKET_MISSING` 诊断并显式标记 `isTargetSocketFallback`；不得静默地让用户误以为 Socket 配置生效。

## 6. Authoring 控制台

控制台分为 **基础**、**专家**、**运行时诊断** 与 **发布** 四层。字段必须显示单位、Profile Authoring Range、安全范围、默认值、有效条件和最终来源；条件不满足时隐藏或只读说明，不能展示无效滑条。

### 6.1 基础

- 当前镜头类型、Base Profile、Active Modifier、Preview/Locked 标记；
- 所有类型：`baseFovDegrees`、`pitchRadians`、`lookSensitivityXRatio`、`lookSensitivityYRatio`、`transitionSeconds`；
- 第一人称：目标 Socket 状态与 `targetHeightMeters` fallback 说明；
- 第三人称：`distanceMeters`、`shoulderOffsetMeters`、水平/垂直位置阻尼、Yaw/Pitch 阻尼、`maximumPositionLagMeters`、`collisionRadiusMeters`、`collisionRetractionMetersPerSecond`、`collisionRecoveryMetersPerSecond`；
- 输入调试：方向键最大角速度、`keyboardAccelerationSeconds = 0.20`、`keyboardDecelerationSeconds = 0.15`，以及 blur/reset/rebind 后清零状态。该组仅调整视角输入，不影响 WASD 或 Sprint 运动控制。

### 6.2 专家

- 总阻尼兼容覆盖：`positionDampingPerSecond` 和 `rotationDampingPerSecond`。UI 必须说明总覆盖会派生至哪些轴向字段，且与细分字段同时存在时展示解析优先级；
- 第三人称 Follow Arm：Target/Socket Offset、最小/最大距离、Pitch 下限/上限、碰撞开关、Probe 半径、位置/旋转 Lag 开关、Lag Substep、最大子步时间、最大 Lag 距离；
- 动态构图：`lookAheadSeconds`、`accelerationLookAheadSecondsSquared`、`minimumHeadingSpeedMetersPerSecond`、`velocityHeadingDampingPerSecond`、`speedFovDegreesPerMeterPerSecond`、`maximumSpeedFovDegrees`、`fovDampingPerSecond`、水平/垂直 Dead Zone、Recenter Delay/Duration/Minimum Speed、Teleport Snap；
- 不消费某参数的 Profile 必须标记原因，例如 `headingSource: view` 不消费速度朝向阻尼；第一人称不得暴露臂长、肩偏移、碰撞、预看和 Dead Zone Override。

### 6.3 运行时诊断与 Overlay

参照 UE `ShowDebug Camera`，只读显示 Camera Profile、Current/Pending Selection、Final POV、FOV、Transition Progress 与 Modifier。扩展显示第 5 节完整 Telemetry。

Authoring 开发态可打开 Overlay：第三人称绘制 Target → Desired Arm → Actual Camera、Probe Rays、Hit Point、Lag Vector；第一人称绘制 Head Socket 和 Frustum。Overlay 默认关闭，永远不改变 Gameplay State、Possession、MotionKernel 或输入绑定。

### 6.4 发布

Preview Override 写入本机 Working Draft；可保存本机版本、恢复、运行 Harness 并导出 Candidate。任何 Reset 必须清除 Preview Override 和相机瞬态状态，但不修改锁定 Registry Profile。

## 7. UE 对照

UE 将可编辑属性、最终视图编排和调试严格分开：

- `UCameraComponent` 负责 FOV、投影、Aspect、Control Rotation 和后处理；本期仅映射现有 Babylon 可验证的 View 参数。[CameraComponent.h](D:/UE_5.8/Engine/Source/Runtime/Engine/Classes/Camera/CameraComponent.h)
- `USpringArmComponent` 的 Camera、Collision、CameraSettings、Lag 分类直接映射第三人称控制台四个组；UE 的 Debug Lag Markers 对应本设计的 Overlay。[SpringArmComponent.h](D:/UE_5.8/Engine/Source/Runtime/Engine/Classes/GameFramework/SpringArmComponent.h)
- `APlayerCameraManager` 持有 Current/Pending ViewTarget、Blend 和 Modifier；其 `ShowDebug Camera` 输出是本设计 Telemetry 的最小模板。[PlayerCameraManager.cpp](D:/UE_5.8/Engine/Source/Runtime/Engine/Private/PlayerCameraManager.cpp)

UE 模板中第三人称常使用 Control Rotation 决定移动方向；本项目不得复制该策略，因为角色面朝与视角已被明确要求解耦。

## 8. 故障处理与不变量

- Preview 失败、Profile 切换、Reset、Window Blur 和 Possession Rebind 后，不得残留相机惯性、过渡、碰撞或 Telemetry 的旧目标数据；
- 第三人称碰撞只能缩短 Follow Arm，不能更改 Subject 坐标、面对方向或 MotionKernel 速度；
- 每一项 Preview Override 必须先经过现有 Camera Parameter Contract 校验；
- 视图切换异常、Socket 缺失或射线 Probe 无命中不应抛出 Babylon Handle 到 API；应发布稳定诊断与安全 Telemetry；
- Camera Debug/Overlay 不得改变固定 Tick 次数或时间来源；
- 所有公开数值字段必须包含单位后缀，位置与向量使用 `XYZ`，资源使用 `...Ref`，关联对象使用角色限定的 `...EntityId`。

## 9. 验收与回归

必须新增或更新以下覆盖：

1. 第一人称直接使用 Socket，Telemetry 不产生 Follow Arm 字段；Socket 缺失生成显式诊断与 fallback 标记；
2. 第三人称按请求臂长解算，进入遮挡时安全/有效臂长缩短，退出后按恢复速度回弹；
3. 位置/旋转 Lag、Substep、最大 Lag 在 30/60/120Hz 类渲染 cadence 下保持固定 Tick 语义；
4. 用户选择第三人称自由环绕后，Sprint/Aim Modifier 只改变声明参数，不替换 Base Profile；水面规则在当前 P1.5 Runtime 中保持不可用且不得误匹配，待 P2.5 冻结 Water Medium 后再覆盖；
5. Preview Override、Reset、Rebind、Window Blur 后 Telemetry 和瞬态状态不泄漏到下一主体或下一 Profile；
6. Arrow-key `0.20 Seconds` 加速与 `0.15 Seconds` 减速保持原有最大角速度；
7. WASD 和 Shift 持续运动时，Subject Forward 与 View Control Forward 仍保持解耦，且角色移动方向与其面朝方向一致；
8. 控制台条件显示：第一人称不显示 Spring Arm，第三人称显示完整 Arm/Collision/Lag 状态；
9. 执行相关 Vitest、TypeScript no-emit、Playground Build 和 G Bot 验证脚本。完整 Vitest 中既有的环境失败必须与本变更新增失败分开报告。

## 10. 依赖工作图

| ID | 目标与可验证交付物 | depends_on / blocks | 独占文件或资源 | 输入 / 输出契约 | 模式 |
| --- | --- | --- | --- | --- | --- |
| CAM-01 | 收敛单一 Profile Selection Decision，并为 Director 定义 Telemetry 契约；新增单元测试 | blocks CAM-02、CAM-03 | `packages/camera/**`、`packages/runtime-babylon/src/camera-director.ts`、对应测试 | 输入：Camera Context/Preview；输出：Selected Decision + `CameraRuntimeTelemetryV1` | main-agent-only |
| CAM-02 | 从 Director 内部抽取 View/Follow Arm Solver，保留 Final POV 行为 | depends_on CAM-01; blocks CAM-03、CAM-04 | `packages/runtime-babylon/src/camera-director.ts`、新增内部 solver 文件、运行时测试 | 输入：Selected Decision、View Target；输出：Pose/Arm State/Telemetry | sequential |
| CAM-03 | 控制台按基础/专家/诊断/发布分层，并消费 Telemetry | depends_on CAM-01、CAM-02; blocks CAM-04 | `apps/playground/src/main.ts`、Browser/Preview 适配与 UI 测试 | 输入：Telemetry、Profile Ranges；输出：Validated Preview Override 与只读诊断 | sequential |
| CAM-04 | Overlay、对抗性回归与端到端验证 | depends_on CAM-02、CAM-03 | 测试、Harness、Overlay 文件 | 输入：Telemetry；输出：稳定开发态诊断与验证证据 | sequential |

所有任务在当前已隔离的 `feat/gameplay-camera-optimization` worktree 内执行；不并行编辑 `CameraDirector` 或 `main.ts`，以避免接口和行为竞争。

## 11. 实施验证（2026-08-25）

CAM-01 至 CAM-04 已按顺序实施。CAM-04 在公开 `WorldRuntimeCameraStateV4` 边界补强了 release/rebind 回归：Provider 即使暂存旧的 target、Socket、Follow Arm 和 Preview 数据，canonical control release 仍只发布 `{ mode: "unbound" }`；rebind 后才发布新的 tracking telemetry。保持 raw Babylon Runtime 在 unbound 时冻结 pose 的既有事务纯度契约，不在 possession publication 中执行 Camera work。

本次实际通过的验证命令如下：

- `node_modules\\.bin\\vitest.cmd run apps/playground/src/babylon-world-adapter.test.ts apps/playground/src/worldkit-browser-api.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts packages/runtime-babylon/src/capability-runtime.test.ts packages/runtime-babylon/src/runtime.test.ts`：5 文件、187 tests 通过；
- `node_modules\\.bin\\vitest.cmd run apps/playground/src/gameplay-babylon-runtime-coordinator.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts apps/playground/src/babylon-world-adapter.test.ts`：3 文件、48 tests 通过；
- `node_modules\\.bin\\tsc.cmd --noEmit`：退出 0；
- `corepack pnpm@10.14.0 build`：Playground Vite production build 通过；
- `node_modules\\.bin\\tsx.cmd scripts/verify-g-bot-subject-world.ts`：退出 0，idle/walk/run/jump、主体隔离和墙体停步验证通过。
