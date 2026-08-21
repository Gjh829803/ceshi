# Subject Control Feel、Physics Medium 与 State Resolver

## 1. 文档状态

- 状态：Draft，P1.5 专项。公共字段以本文冻结为准；`docs/16` 概念稿与现网
  Capability Catalog 中的同义或无单位字段不得继续作为 AI-facing 合同。
- 所属系统：Subject Registry / Capability Compiler / 固定 Tick State Resolver /
  Babylon·Havok Adapter。
- 上位规格：
  - [`主体资产与 3C 对接`](../../16-subject-assets-3c-integration.md)
  - [`AI-first LEGO 游戏 SDK`](2026-08-17-ai-first-lego-game-sdk-design.md)
  - [`Character / Camera / Capability 集成`](2026-08-20-character-camera-capability-integration-design.md)
- 现网债务依据：
  [`Hybrid Terrain 设计审查 §2.5`](../../reviews/2026-08-21-hybrid-terrain-design-review.md)
- 跟踪位置：`docs/18` P1.5 / 里程碑 M7。本文不改 `docs/18` 勾选。
- 引擎语义以 lockfile 安装的 Babylon / Havok 为准，不以训练记忆为准。

本文冻结第一切片合同。实施前必须另写独立计划。未冻结切片不得把游泳、飞行、
坐骑或 Hybrid Surface 写成已交付能力。

## 2. 目标与非目标

### 2.1 目标

- 一个概念一个 Profile。速度、加减速、转向、响应曲线、空中控制比例只属于
  `control-feel-profile`。
- `locomotion-profile` 只声明运动模式与能力边界，不再携带速度数字。
- `motion-profile` 只绑定 Kernel、可选 Feel、Tags 与安全回退，不再用无类型
  `parameters` 袋同时装速度、坡度和台阶高。
- `control-profile` 只解释 Intent（输入空间、朝向、横向政策）。它就是
  `docs/16` 的 Control Method，不再另造 `control-method-profile`。
- `medium-profile` 是 Physics Medium。世界只保留一条全局重力向量；主体只声明
  相对倍率、阻力、浮力和迟滞阈值，字段名自带 `Ratio` / 单位。
- `physics-body-profile` 是坡度上限与台阶高的唯一所有者。
- 每个固定 Tick 只采样一次 Havok Character Support。该结果是 ground / air、
  跳跃准入、落地、重力积分的唯一依据。
- `StateResolver` 原子切换 Medium、Locomotion、Feel、Control Method、Action 约束
  和 Snapshot。任一步失败保持上一稳定状态并返回稳定 Diagnostic。
- 普通 Agent 只选已注册 Profile Ref。覆盖必须经过 `allowedOverridePaths`、
  Schema 范围、Host Policy 和预算。

### 2.2 非目标

- 不实现游泳、攀爬、翻越、飞行生产切换。
- 不实现坐骑、装备、多 Controller 新协议。
- 不实现 Hybrid Terrain Opening / 桥面 Surface 公共字段。
- 不接入 Video Model Adapter，不改 Capture 通道算法。
- 不把产品 `asset.manifest.json` 或 Babylon/Havok Handle 写入 Canonical Schema。
- 不保留 `docs/16` 里未带单位的概念字段名作为公共协议。

## 3. 决策摘要

```text
语义 Intent
  → Control Profile（如何读输入）
  → StateResolver（介质 / 模式 / 能力是否允许）
  → Control Feel Profile（速度与响应数字）
  → Motion Kernel（已编译参数，不含第二份数字）
  → 一次 Havok checkSupport
  → Snapshot / Render Binding
```

1. 现网 `locomotion-profile.locomotion.walkSpeedMetersPerSecond` 与
   `motion-profile.parameters.walkSpeedMetersPerSecond` 是双重真相。第一切片删除
   locomotion 上的速度，并把 motion `parameters` 袋拆掉。
2. 现网 spawn 用 `hasWalkablePhysicalGroundAt` → `physicsEngine.raycast`，步进用
   `checkSupport`。第一切片删除这条旁路。Character/Camera 集成文里「首 tick 可用
   有界 ray bootstrap」作废，以本文为准。
3. 现网 Object `supported-by` 用 AABB 顶。第一切片改为支撑体 Collider 的上表面
   查询；地形继续走三角面高度采样。这是支撑合同，不是 Layout 可选项。
4. 第一切片只闭合 Ground / Air。Water 传感器可以读深度，但不得把
   `movementMedium` 切到 `water`，也不得换 Swim Kernel。
5. 未发布私有 Schema：Catalog、Definition、测试和金标在同一实施计划里 Clean
   Break，不设永久别名字段。

## 4. 权威图

| 状态 | 唯一所有者 | 禁止的第二推导 |
|---|---|---|
| 物理支撑 | 本 tick 一次 `checkSupport()` | spawn raycast、地形双线性高度、AABB 顶、动画落地帧 |
| 水体成员 | Medium Sensor（体积/水位查询） | Mesh 名、材质、颜色、`traversalMode` 字符串猜测 |
| `movementMedium` | StateResolver | Sensor 或 Support 被其他层各写一份 |
| 主体朝向 | Motion Kernel | Camera orbit、Aim 输入直接改 yaw |
| 相机轨道 | Camera Director | Motion Kernel 写相机 |
| 固定步时间 | Runtime Tick Accumulator | `requestAnimationFrame`、任意 sleep |
| 坡度/台阶高 | `physics-body-profile` | `motion-profile.parameters`、Feel、Medium 再写一份 |
| 走/跑/跳速度与加减速 | `control-feel-profile` | Locomotion、Motion parameters、Adapter 硬编码 |
| Intent 解释 | `control-profile` | Feel 或 Kernel 重读摇杆死区 |

Adapter 只执行已编译参数。Runtime 不反向读 Registry。

## 5. 冻结的资源

资源 `kind` 使用已有 Canonical 词。禁止新增 `control-method-profile`、
`physics-medium-profile`、`feel-profile` 同义 kind。

### 5.1 `locomotion-profile`

能力边界，不含速度。

```ts
interface LocomotionProfileV1 {
  kind: "locomotion-profile";
  id: string;
  version: number;
  resourceRef: string;
  supportedMediums: readonly ("ground" | "water" | "air")[];
  allowedMotionKernelRefs: readonly string[];
  allowRun: boolean;
  allowJump: boolean;
  allowSwim: boolean;
  allowFlight: boolean;
}
```

第一切片：`supportedMediums` 必须含 `ground`；`allowSwim` / `allowFlight` 必须为
`false`。Admission 在 locomotion 对象上发现 `walkSpeedMetersPerSecond`、
`runSpeedMetersPerSecond`、`waterSpeedMetersPerSecond`、
`jumpSpeedMetersPerSecond` 时失败，错误码 `LOCOMOTION_PROFILE_SPEED_FORBIDDEN`。

现网 `worldkit://locomotion-profile/ground.standard@1` 必须在第一切片改写为无速度
形态，并换 contentHash。

### 5.2 `control-feel-profile`

数字手感的唯一所有者。

```ts
interface ControlFeelProfileV1 {
  kind: "control-feel-profile";
  id: string;
  version: number;
  resourceRef: string;
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
}
```

约束（Admission 失败，不得 Runtime 钳制）：

- 所有数值有限且满足各自 `minimum` / `maximum`（见 §5.7）。
- `walkSpeedMetersPerSecond <= runSpeedMetersPerSecond`。
- `airControlRatio`、`jumpHoldGravityRatio` 落在 `0..1`。
- `jumpReleaseGravityRatio >= 1`。
- 禁止 Babylon/Havok 字段、无单位 `gravityScale`、无单位 `drag`。

第一切片内置两条，且数字必须可区分：

| Ref | 用途 |
|---|---|
| `worldkit://control-feel-profile/humanoid.medium-ground@1` | 现网 humanoid-medium 手感 |
| `worldkit://control-feel-profile/humanoid.heavy-ground@1` | 更低加速、转向和空中控制 |

只替换 Feel Ref、保持同一 Entity ID / Kernel / Lock 的其余部分，同输入固定 Tick
必须得到不同速度或朝向轨迹，并反映在 Snapshot Hash。

### 5.3 `motion-profile`

Kernel 选择，不再装手感袋。

```ts
interface MotionProfileV1 {
  kind: "motion-profile";
  id: string;
  version: number;
  resourceRef: string;
  motionKernelRef: string;
  controlFeelProfileRef: string;
  motionTags: readonly string[];
}
```

Admission 发现 `parameters`、`safetyLimits`、`authoringRanges`，或发现
`walkSpeedMetersPerSecond` / `accelerationMetersPerSecondSquared` /
`maximumSlopeDegrees` / `stepHeightMeters` 等旧袋字段时失败，错误码
`MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN`。

`fallbackMotionProfileRef` 必须指向同类结构。`safe-ground` 通过绑定一条全零或
接近零的 Feel 实现，而不是在 motion 里再写一套数字。

### 5.4 `control-profile`

保持现网 kind 与职责：Intent → 运动命令。

```ts
interface ControlProfileV1 {
  kind: "control-profile";
  id: string;
  version: number;
  resourceRef: string;
  commandKind: "planar-vector" | "throttle-steer" | "none";
  inputSpace: "camera-relative" | "subject-local" | "flight-frame" | "none";
  facingPolicy:
    | "align-to-move"
    | "align-to-view"
    | "steering-derived"
    | "flight-derived"
    | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
  responseExponent: number;
}
```

`inputTuning` 嵌套取消，两个数字升到顶层，避免 AI 再发明一套 Tuning 对象方言。
第一切片只允许 `planar-vector` + `camera-relative` 或 `align-to-move` /
`align-to-view`。Swim / Flight commandKind 可以保留在 Catalog 供后续切片，但
Authoring 生产 Definition 不得引用。

### 5.5 `medium-profile`

```ts
interface MediumProfileV1 {
  kind: "medium-profile";
  id: string;
  version: number;
  resourceRef: string;
  supportedMediums: readonly ("ground" | "water" | "air")[];
  ground: {
    groundingToleranceMeters: number;
    enterSupportHoldTicks: number;
    exitSupportHoldTicks: number;
  };
  water?: {
    enterDepthMeters: number;
    exitDepthMeters: number;
    enterImmersionRatio: number;
    exitImmersionRatio: number;
    buoyancyRatio: number;
    linearDragPerSecond: number;
    angularDragPerSecond: number;
    surfaceHoldRatio: number;
  };
  air: {
    gravityRatio: number;
    linearDragPerSecond: number;
  };
}
```

规则：

- 进入阈值必须严格大于退出阈值（深度与浸没比），否则
  `MEDIUM_PROFILE_HYSTERESIS_INVALID`。
- `groundingToleranceMeters` 只用于 Debug / 可视化容差，不覆盖 `checkSupport`。
- 现网 `gravityScale`、`surfaceHoldStrength`、无退出阈值的 water 块视为非法，
  第一切片改写 `worldkit://medium-profile/ground-water-air.standard@1`。
- 第一切片 Runtime **不消费** `water` 切换；字段可存在，Resolver 不得输出
  `movementMedium: "water"`。

世界重力仍在 Authoring / ExecutionPlan 的
`gravityMetersPerSecondSquaredXYZ`。主体只乘 `air.gravityRatio`。禁止第二条世界
重力向量。

### 5.6 `physics-body-profile`

现网已有 `maxSlopeDegrees`、`maxStepHeightMeters`、`massKilograms`。第一切片确认
它们不再出现在 motion / feel / medium。Character Controller 的坡度与台阶只从这份
Profile 的已编译值设置。

### 5.7 数值域

| 字段 | 最小 | 最大 |
|---|---|---|
| `walkSpeedMetersPerSecond` | 0 | 8 |
| `runSpeedMetersPerSecond` | 0 | 12 |
| `jumpSpeedMetersPerSecond` | 0 | 12 |
| `accelerationMetersPerSecondSquared` | 0 | 60 |
| `decelerationMetersPerSecondSquared` | 0 | 80 |
| `turnRateRadiansPerSecond` | 0 | 20 |
| `airControlRatio` | 0 | 1 |
| `coyoteTimeSeconds` | 0 | 0.4 |
| `jumpBufferSeconds` | 0 | 0.4 |
| `variableJumpHoldSeconds` | 0 | 0.5 |
| `jumpHoldGravityRatio` | 0.1 | 1 |
| `jumpReleaseGravityRatio` | 1 | 5 |
| `groundingToleranceMeters` | 0 | 0.3 |
| `enterSupportHoldTicks` / `exitSupportHoldTicks` | 0 | 10 |
| `gravityRatio` | 0 | 4 |
| `moveDeadzoneRatio` | 0 | 0.4 |
| `responseExponent` | 1 | 3 |

Host Policy 可以更严，不能静默放宽。

## 6. Subject Definition 绑定

第一切片 Definition.profiles 必须同时有：

```ts
profiles: {
  physicsBodyProfileRef: string;
  locomotionProfileRef: string;
  controlFeelProfileRef: string;
  controlProfileRef: string;
  mediumProfileRef: string;
  motion: {
    defaultMotionProfileRef: string;
    optionalMotionProfileRefs: readonly string[];
    fallbackMotionProfileRef: string;
  };
  cameraContextProfileRef: string;
  harnessProfileRef: string;
}
```

`locomotionProfileRef` 不再是「V2 兼容投影」。它与 `controlFeelProfileRef`、
`motion.defaultMotionProfileRef` 同时存在，职责按 §5 切开。

`defaultMotionProfileRef` 的 `controlFeelProfileRef` 必须等于
`profiles.controlFeelProfileRef`。不一致则
`SUBJECT_DEFINITION_FEEL_MISMATCH`。

`allowedOverridePaths` 第一切片只允许：

- `profiles.controlFeelProfileRef`
- `profiles.controlProfileRef`（仅已注册 Ref）
- `profiles.motion.defaultMotionProfileRef`（仅已注册 Ref，且 Kernel 与
  Locomotion.allowedMotionKernelRefs 相交）

禁止覆盖：Hash、version、Kernel 实现、Collider 内部、Medium 切换阈值、Babylon /
Havok Handle、任意 `parameters.*` 旧路径。

## 7. StateResolver

纯固定 Tick 函数。输入不得含渲染帧率、动画时间或 Clip 名。

```ts
interface MediumSensorSampleV1 {
  hasHavokSupport: boolean;
  supportNormalWorldXYZ: readonly [number, number, number];
  waterDepthMeters: number | undefined;
  immersionRatio: number | undefined;
}

interface SubjectResolvedStateV1 {
  movementMedium: "ground" | "air";
  locomotionMode: "walk";
  activeMotionProfileRef: string;
  activeControlFeelProfileRef: string;
  activeControlProfileRef: string;
  activeMediumProfileRef: string;
  allowJump: boolean;
}
```

每 tick 顺序：

1. 读上一稳定状态。
2. 采样一次 `checkSupport()`，写入 `hasHavokSupport`。
3. 可选采样水体体积，只填 Sensor，不改 Medium。
4. 用 `enterSupportHoldTicks` / `exitSupportHoldTicks` 迟滞更新 ground/air。
5. `allowJump = locomotion.allowJump && movementMedium === "ground"`。
6. 选择已编译 Feel / Control / Kernel。缺资源或 Capability 不满足则保持上一状态，
   错误码 `SUBJECT_STATE_RESOLVE_UNCHANGED`。
7. 发布 Snapshot：`movementMedium`、`locomotionMode`、`activeActionId`、三个
   Profile Ref、`activeMotionKernelRef`。Capture 与 Agent 不得从 Clip 名反推。

第一切片 `movementMedium` 关闭为 `"ground" | "air"`。Snapshot 类型若仍声明
`"water"`，Resolver 不得写出该值。

跳跃边沿继续：本 tick 动作上升沿 + 当前受支撑 + Feel/Locomotion 允许。松键才能
再武装。动画落地不得清 `jumpInProgress`。

## 8. 支撑合同（第一切片必须收口）

### 8.1 主体接地

- 每个运动 tick 对每个活动 Character Controller 只调用一次 support 查询。
- 删除 `hasWalkablePhysicalGroundAt` 及一切 `physicsEngine.raycast` 接地判定。
- Spawn / Reset：先把 Controller 放到已编译绝对坐标并 `step` 一次，再
  `checkSupport`。首 tick 不受支撑则 `movementMedium === "air"` 并积分重力，
  不得用射线伪造 `ground`。
- `initialGroundSupportPending` 删除。不得用 pending 旗标跳过 support。
- 地形高度采样只用于水位、Debug Overlay 和 Layout；不得生成 `isGrounded`。

### 8.2 Object `supported-by`

`revalidateSupportAssertion`：

- 支撑体是 Terrain：继续三角面高度采样。
- 支撑体是 Object：查询该 Object 已锁定 Collider 的上表面，禁止
  `maximumMetersXYZ[1]`。
- 斜面、带栏杆、拱桥用对抗 Fixture 证明 AABB 顶会失败、Collider 表面会通过。

Layout 写出的 Y 是世界绝对坐标。Kit / Solver 必须按 Collider 表面求 Y，Agent
不得把绝对 Y 理解成离地偏移。

## 9. 第一切片范围

闭合集：

1. 冻结合同与 Catalog Clean Break（§5–§6）。
2. 两条 Feel + 同一 Golden/G Bot Definition 可切换 Feel。
3. §8 两条支撑旁路的失败复现与修复。
4. StateResolver 只输出 ground/air。
5. Snapshot / Explain / 固定 Tick Replay 暴露实际 Profile Ref。
6. CLI/Browser：缺 Feel、Feel 与 Motion 不一致、locomotion 残留速度、motion
   残留数字袋，均稳定失败。
7. 对抗：双实例不同 Feel、Reset 后无射线假接地、从台沿走出、Jump 按住不连跳、
   30/60/120 Hz-like 显示帧、Object 斜面 `supported-by`。

验收命令（实施计划确定后写入，不得在规格里写会死的具体 Hash）：

```text
pnpm typecheck
pnpm test   # 含 Resolver、Admission、Feel 切换、支撑复现
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

## 10. Adapter 与硬编码

第一切片必须从 Babylon Adapter / Motion Kernel 去掉：

- 默认 `accelerationMetersPerSecondSquared: 24` 这类回退数字。缺 Feel 则 Admission
  或 Resolve 失败，不猜。
- `physicsController.acceleration = 1` 这类与 Profile 无关的魔法数；Controller
  积分参数必须来自已编译 Feel / Body。
- 水中重力倍率硬编码。V1 不切 water，因此不得偷偷改重力来「假装」入水。

Kernel 源码可以保留内部积分，但读取的唯一数字来源是已编译 Feel 与 Body。

## 11. 与后续切片的边界

| 后续 | 本切片留下的稳定点 | 禁止提前泄漏 |
|---|---|---|
| P2.5 游泳 / 攀爬 | Sensor + 迟滞字段已在 medium-profile | `movementMedium: "water"` 生产切换、Climb Kernel |
| P2.6 H1 桥 | 一次 support、Collider 表面、Surface ID 仍由 Hybrid 规格冻结 | Opening / Portal / 双层 Query 公共字段 |
| P1.3 姿态 | Resolver 不读 Clip 名 | crouch/prone 模式字段 |
| P1.6 Override | `allowedOverridePaths` 白名单 | 通用 patch |
| P0.3 Validation | Snapshot 暴露真实 Medium / Feel Ref | 在 Validation 规格里发明第二套运动字段 |

## 12. 诊断

| 码 | 何时 |
|---|---|
| `LOCOMOTION_PROFILE_SPEED_FORBIDDEN` | locomotion 含速度字段 |
| `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN` | motion 仍用 parameters 袋或坡度/台阶 |
| `CONTROL_FEEL_PROFILE_INVALID` | 越界、NaN、walk>run |
| `MEDIUM_PROFILE_HYSTERESIS_INVALID` | 进入/退出阈值不构成迟滞 |
| `SUBJECT_DEFINITION_FEEL_MISMATCH` | Definition Feel ≠ Motion 绑定 Feel |
| `SUBJECT_OVERRIDE_FORBIDDEN` | 覆盖未开放路径或写入引擎 Handle |
| `SUBJECT_STATE_RESOLVE_UNCHANGED` | 切换失败，保持上一状态 |
| `SUBJECT_SUPPORT_QUERY_MISSING` | 本 tick 未得到 Havok support 结果却写入 ground |

公共 Diagnostic 不得带 Babylon / Havok 原始消息。

## 13. 实施顺序（给后续计划，不是本文件任务）

1. 红灯：Admission 测试锁死旧 locomotion 速度与 motion parameters 袋。
2. 红灯：spawn raycast 与 Object AABB `supported-by` 的复现。
3. 改 Catalog / Definition / Kernel 读取路径。
4. Resolver 与 Snapshot。
5. 两条 Feel Replay。
6. `verify:rigged-subject` 与 `verify:g-bot-subject`。
7. 另开实施计划更新 `docs/18` 勾选。本规格合入不改 backlog 数字。
