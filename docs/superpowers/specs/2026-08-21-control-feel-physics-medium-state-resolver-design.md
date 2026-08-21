# Subject Control Feel、Physics Medium 与 State Resolver

## 1. 文档状态

- 状态：**Frozen for implementation planning**。这是 P1.5 的实施权威；实施前必须另写
  独立计划，实施 Agent 只读 `main` 上的本文终稿。
- 所属系统：Subject Registry / Capability Compiler / 固定 Tick State Resolver /
  Babylon·Havok Adapter。
- 上位规格：
  - [`主体资产与 3C 对接`](../../16-subject-assets-3c-integration.md)
  - [`AI-first LEGO 游戏 SDK`](2026-08-17-ai-first-lego-game-sdk-design.md)
  - [`Character / Camera / Capability 集成`](2026-08-20-character-camera-capability-integration-design.md)
- 现网债务依据：
  [`Hybrid Terrain 设计审查 §2.5 / §3`](../../reviews/2026-08-21-hybrid-terrain-design-review.md)
- 跟踪位置：`docs/18` P1.5 / M7。冻结本文不修改 `docs/18` 的勾选或进度数字。
- 引擎语义基线：lockfile 安装的 `@babylonjs/core@9.21.2` 与
  `@babylonjs/havok@1.3.14`，不以训练记忆或其他版本文档为准。

本文只冻结 Ground / Air 人形 Character 的第一切片。游泳、飞行、攀爬、车辆、
Hybrid Surface、桥洞和 Validation 新协议均不属于本切片。

## 2. 目标与非目标

### 2.1 目标

- 一个概念只有一个资源 `kind`：`control-profile`、`control-feel-profile`、
  `locomotion-profile`、`medium-profile`。不保留 Control Method、Physics Medium、
  Feel 的第三套公共方言。
- 速度、加减速、转向、输入响应曲线、跳跃手感和空中控制数字只属于
  `control-feel-profile`。
- `locomotion-profile` 的领域载荷只包含布尔能力，不包含速度、Kernel 列表、Medium
  列表或任意参数袋。
- `motion-profile` 只选择 Motion Kernel 并声明语义 Tags；它不绑定 Feel，也没有
  `parameters`、`safetyLimits` 或 `authoringRanges`。
- `control-profile` 只解释 Intent；`physics-body-profile` 独占坡度与台阶限制；
  `medium-profile` 只描述 Ground / Air 介质响应。
- 每个活动 Character 的每个固定 Tick 只取一次 Character Controller
  `checkSupport()`。它是物理支撑的唯一权威；State Resolver 是
  `movementMedium` 的唯一写入者。
- Spawn / Reset 使用唯一、无射线的支撑初始化顺序；Object `supported-by` 不再使用
  AABB 顶面。
- 缺失、非法或越权配置在 Admission / Resolve 边界返回稳定 Diagnostic，不由 Runtime
  静默钳制、猜测或回退到硬编码数字。
- 普通 Agent 只选择已注册 Profile Ref。高级覆盖仍受 `allowedOverridePaths`、Schema、
  Host Policy 与预算共同约束。

### 2.2 非目标

- 不实现或暗示游泳、入水切换、浮力、水面保持、攀爬、翻越或飞行。
- 不实现坐骑、装备、多 Controller、NPC 行为或新相机算法。
- 不定义 Hybrid Surface、Opening、Portal、桥洞或 Navigation 公共字段。
- 不新增 Validation Report、CLI 或 Browser 协议。
- 不接入 Video Model Adapter，不改变 Capture 通道算法。
- 不把 Babylon/Havok Handle、Provider 枚举或产品资产 Manifest 写进 AI-facing Schema。
- 不为未发布私有 Schema 保留永久别名或迁移代码；实施采用 Clean Break。

## 3. 决策摘要

```text
Semantic Intent
  → control-profile（如何解释输入）
  → StateResolver（支撑、介质与能力准入）
  → control-feel-profile（速度与响应数字）
  → motion-profile → Motion Kernel（算法选择，不携带第二份数字）
  → Babylon/Havok Adapter（只执行编译结果）
  → Snapshot / Render Binding
```

1. 删除 `locomotion-profile.locomotion.*SpeedMetersPerSecond`。Locomotion 只保留布尔
   能力。
2. 删除 `motion-profile.parameters`、`safetyLimits`、`authoringRanges` 及其数字。
3. `RegistrySubjectDefinition.profiles.controlFeelProfileRef` 是第一切片 Feel 选择的唯一
   真相；Motion Profile 不再绑定 Feel。
4. 删除 spawn/reset 的 `hasWalkablePhysicalGroundAt` ray bootstrap 与
   `initialGroundSupportPending`。
5. 第一切片 Resolver 的输出类型关闭为 `"ground" | "air"`；不得发布 `"water"`。
6. Object `supported-by` 必须查询同一份锁定 Collider；无法查询时阻断，禁止退回 AABB。
7. 未发布 Catalog、Definition、Fixture 和金标在后续同一个实施计划中 Clean Break；
   本文不修改这些实现资产。

## 4. 权威图

| 状态或参数 | 唯一所有者 | 禁止的第二真相 |
|---|---|---|
| Character 物理支撑 | 本 Tick 唯一一次 `checkSupport()` | spawn ray、Heightfield 高度、Object AABB 顶、动画落地帧 |
| `movementMedium` | State Resolver | Sensor、Kernel 或 Render Binding 另写一份 |
| 跳跃准入 | Locomotion 布尔能力 + Support 状态 + Feel 明示宽限 | Mesh/动画名、AABB、Medium 容差 |
| 主体朝向 | Motion Kernel | Camera orbit 或 Aim 输入直接改主体 yaw |
| 相机轨道 | Camera Director | Motion Kernel 写相机 |
| 固定步时间 | Runtime Tick Accumulator | `requestAnimationFrame` 或任意 sleep |
| 坡度/台阶 | `physics-body-profile` | Motion、Feel、Medium 或 Adapter 默认值 |
| 速度/加减速/转向/跳跃手感 | `control-feel-profile` | Locomotion、Motion 或 Adapter 默认值 |
| Intent 解释与死区 | `control-profile` | Feel 或 Kernel 重读原始设备输入 |
| Motion 算法选择 | `motion-profile.motionKernelRef` | Locomotion 的 Kernel 白名单或 Feel 反向选算法 |
| Object Layout 支撑面 | 锁定 Collider-backed support query | Visual Mesh、AABB maximum、手填相对 Y |

Registry 是配置事实，Compiler 生成锁定执行输入，Adapter 只执行编译结果。Runtime 不
反向读取 Registry，也不在 Provider 层补公共默认值。

## 5. Canonical 资源合同

公共资源 `kind` 使用以下唯一词汇：

| Canonical kind | 职责 | 作废的公开方言 |
|---|---|---|
| `control-profile` | Intent 解释 | `control-method-profile`、`ControlMethodProfile` |
| `control-feel-profile` | 速度与响应数字 | `feel-profile`、Motion 内嵌 Feel |
| `locomotion-profile` | 布尔运动能力 | 带速度的 Locomotion 参数块 |
| `medium-profile` | Ground / Air 介质响应 | `physics-medium-profile`、`PhysicsMediumProfile` |

`ControlMethodProfile`、`ControlFeelProfile`、`PhysicsMediumProfile` 仅可在历史说明中
作为产品概念名出现，不是 Schema 类型、Manifest `kind` 或 Ref path。

以下接口省略共享的 Registry 元数据字段；`kind`、`id`、`version`、`resourceRef` 是
资源标识，不属于领域载荷。

### 5.1 `locomotion-profile`

```ts
interface LocomotionProfileV1 {
  kind: "locomotion-profile";
  id: string;
  version: number;
  resourceRef: string;
  allowWalk: boolean;
  allowRun: boolean;
  allowJump: boolean;
}
```

第一切片要求 `allowWalk === true`。Locomotion 领域载荷除上述 `allow...`
布尔字段外不接受其他字段；`allowSwim` / `allowFlight` 必须等待对应能力的新 Schema
版本，不能在 V1 里用 `false` 暗示能力已冻结。特别禁止：

- 任意名称含 `Speed`、`Acceleration`、`Deceleration`、`TurnRate`、`Gravity`、
  `Slope`、`StepHeight`、`Seconds`、`Meters`、`Radians` 或 `Ratio` 的数值字段；
- `supportedMediums`、`allowedMotionKernelRefs`；
- `locomotion`、`parameters`、`tuning` 等开放对象袋。

违反速度归属返回 `LOCOMOTION_PROFILE_SPEED_FORBIDDEN`；其他非布尔领域字段返回
`LOCOMOTION_PROFILE_FIELD_FORBIDDEN`。现网
`worldkit://locomotion-profile/ground.standard@1` 必须在实施切片中改写并更新
content hash。

### 5.2 `control-feel-profile`

数字手感的唯一所有者：

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
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
}
```

`moveResponseExponent` 是明确命名的无量纲数学指数；其余数值名称必须携带单位、
`Ratio` 或明确的数学域。Admission 规则：

- 所有数值有限且位于 §5.7 范围；不得 Runtime 钳制。
- `walkSpeedMetersPerSecond <= runSpeedMetersPerSecond`。
- `airControlRatio` 与 `jumpHoldGravityRatio` 位于 `0..1`。
- `jumpReleaseGravityRatio >= 1`。
- 禁止 Babylon/Havok 字段、`gravityScale`、`drag` 等无单位名称。

第一切片至少注册两条数值可区分的 Feel：

| Ref | 用途 |
|---|---|
| `worldkit://control-feel-profile/humanoid.medium-ground@1` | 当前 medium humanoid 手感 |
| `worldkit://control-feel-profile/humanoid.heavy-ground@1` | 更低加速、转向和空中控制 |

只替换 Definition 的 Feel Ref、保持 Entity ID / Motion / Registry Lock 的其余输入不变，
同输入固定 Tick 必须得到不同的速度或朝向轨迹，并进入 Snapshot Hash。

### 5.3 `motion-profile`

```ts
interface MotionProfileV1 {
  kind: "motion-profile";
  id: string;
  version: number;
  resourceRef: string;
  motionKernelRef: string;
  motionTags: readonly string[];
}
```

Motion Profile **没有** `controlFeelProfileRef`。Feel 只由 Subject Definition 的
`profiles.controlFeelProfileRef` 选择；未来若按介质切 Feel，只能由集中式
Subject State Profile 映射，Motion 仍不得成为第二选择入口。

发现 `parameters`、`safetyLimits`、`authoringRanges`，或发现速度、加减速、坡度、
台阶等数字字段，Admission 返回 `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN`。

`fallbackMotionProfileRef` 仍由 Subject Definition 的 motion binding 指定。Fallback
Motion 使用同一 Definition Feel；它通过零 Intent 保持碰撞、重力和安全停止，不能绑定
一条“零 Feel”制造第二真相。冷启动缺 Feel 时 Admission 失败；运行中切换失败时保持
上一稳定组合。

### 5.4 `control-profile`

第一切片关闭为 Ground Character 的 Intent 解释合同：

```ts
interface ControlProfileV1 {
  kind: "control-profile";
  id: string;
  version: number;
  resourceRef: string;
  commandKind: "planar-vector" | "none";
  inputSpace: "camera-relative" | "subject-local" | "none";
  facingPolicy: "align-to-move" | "align-to-view" | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
}
```

`moveDeadzoneRatio` 属于 Intent 解释；速度和 `moveResponseExponent` 属于 Feel。
`throttle-steer`、`flight-frame`、`steering-derived`、`flight-derived` 等现网实验方言不在
第一切片生产合同中。它们必须等待对应能力的后续 Schema 版本，不能由当前 Catalog
条目暗示为已支持。

### 5.5 `medium-profile`

第一切片只冻结 Ground / Air 响应：

```ts
interface MediumProfileV1 {
  kind: "medium-profile";
  id: string;
  version: number;
  resourceRef: string;
  air: {
    gravityRatio: number;
    linearDragPerSecond: number;
  };
}
```

- `groundingToleranceMeters`、`enterSupportHoldTicks`、`exitSupportHoldTicks` 不属于
  Medium Profile；它们会成为 `checkSupport()` 的第二套接地规则，因此作废。
- `water`、`enterDepthMeters`、`buoyancyRatio`、`surfaceHoldRatio` 等字段不进入本版
  生产资源。P2.5 必须用新 Schema 版本冻结完整水体迟滞后才能引入。
- 世界重力仍只有 Authoring / ExecutionPlan 的
  `gravityMetersPerSecondSquaredXYZ`。主体在 air 时只乘 `air.gravityRatio`；禁止第二条
  世界重力向量。
- 第一切片采用 `worldkit://medium-profile/ground-air.standard@1`。误导性的现网
  `ground-water-air.standard@1` 在 Clean Break 中被替换，不保留别名。

`gravityRatio` 范围 `0..4`；`linearDragPerSecond` 范围 `0..20`。任何 Ground 容差或
Water 字段进入 V1 返回 `MEDIUM_PROFILE_FIELD_FORBIDDEN`。

重力组合顺序固定，不能由 Adapter 自由解释：

```text
effectiveGravityMetersPerSecondSquaredXYZ
  = worldGravityMetersPerSecondSquaredXYZ
  × medium.air.gravityRatio
  × activeJumpPhaseGravityRatio
```

`activeJumpPhaseGravityRatio` 只在可变跳跃 hold/release 阶段取 Feel 的
`jumpHoldGravityRatio` / `jumpReleaseGravityRatio`，其他时刻为 `1`。Medium 定义空气基础
响应，Feel 只定义动作阶段修饰；两者不是互相覆盖的同义字段。

### 5.6 `physics-body-profile`

`physics-body-profile` 的 Character 载荷至少包含：

```ts
physicsBody: {
  mode: "character";
  massKilograms: number;
  maxSlopeDegrees: number;
  maxStepHeightMeters: number;
}
```

坡度与台阶只从这两个字段编译。锁定版 Babylon Character Controller 的映射是：

```text
maxSlopeCosine = cos(maxSlopeDegrees × π / 180)
maxStepHeight = maxStepHeightMeters
```

Medium、Feel、Motion、Kernel 参数和 Adapter 默认值都不得覆盖该映射。非法范围返回
`PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID`。

### 5.7 数值域

| 字段 | 最小 | 最大 |
|---|---:|---:|
| `walkSpeedMetersPerSecond` | 0 | 8 |
| `runSpeedMetersPerSecond` | 0 | 12 |
| `jumpSpeedMetersPerSecond` | 0 | 12 |
| `accelerationMetersPerSecondSquared` | 0 | 60 |
| `decelerationMetersPerSecondSquared` | 0 | 80 |
| `turnRateRadiansPerSecond` | 0 | 20 |
| `moveResponseExponent` | 1 | 3 |
| `airControlRatio` | 0 | 1 |
| `coyoteTimeSeconds` | 0 | 0.4 |
| `jumpBufferSeconds` | 0 | 0.4 |
| `variableJumpHoldSeconds` | 0 | 0.5 |
| `jumpHoldGravityRatio` | 0.1 | 1 |
| `jumpReleaseGravityRatio` | 1 | 5 |
| `moveDeadzoneRatio` | 0 | 0.4 |
| `gravityRatio` | 0 | 4 |
| `linearDragPerSecond` | 0 | 20 |

Host Policy 可以更严，不能静默放宽。

## 6. Subject Definition 绑定

第一切片 `RegistrySubjectDefinition.profiles` 必须同时绑定：

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

`profiles.controlFeelProfileRef` 是 Feel 选择的唯一真相。Motion Profile 不含 Feel Ref，
因此不存在需要 Agent 同时修改或保持相等的第二字段。

第一切片 `allowedOverridePaths` 最多允许：

- `profiles.controlFeelProfileRef`；
- `profiles.controlProfileRef`，且必须是已注册、已锁定的 Ref；
- `profiles.motion.defaultMotionProfileRef`，且目标 Motion Kernel 必须是已注册、已锁定、
  `runtimeStatus === "implemented"`、支持 Character Body 与 Ground 的实现。

Locomotion 不再提供 `allowedMotionKernelRefs`。Kernel 兼容性由 Motion Kernel 自身的
Body / Medium / Capability 合同与 Definition 的 Locomotion 布尔能力共同检查，不复制
第二份白名单。

禁止覆盖 Hash、Version、Kernel 实现、Collider 内部、Babylon/Havok Handle、
`parameters.*` 旧路径以及 Medium 支撑规则。

## 7. 固定 Tick State Resolver

Resolver 是纯固定 Tick 状态机；输入不得含渲染帧率、动画时间、Clip 名或 Visual Mesh
事实。

```ts
type CharacterSupportStateV1 = "supported" | "sliding" | "unsupported";

interface CharacterSupportSampleV1 {
  supportState: CharacterSupportStateV1;
  supportNormalWorldXYZ: readonly [number, number, number];
}

interface SubjectResolvedStateV1 {
  movementMedium: "ground" | "air";
  locomotionMode: "idle" | "walk" | "run" | "airborne";
  activePhysicsBodyProfileRef: string;
  activeLocomotionProfileRef: string;
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  activeControlFeelProfileRef: string;
  activeControlProfileRef: string;
  activeMediumProfileRef: string;
  isJumpAllowed: boolean;
}
```

每个活动 Character 的每个固定 Tick 顺序固定为：

1. 读取上一稳定状态和已锁定 Profile 组合。
2. 对 Character Controller 调用一次 `checkSupport(fixedDeltaSeconds, gravity)`，把
   Provider 枚举投影成 `CharacterSupportStateV1`；其他层不得再查询“是否接地”。
3. `unsupported → air`；`supported` 或 `sliding → ground`。`sliding` 表示接触陡坡，
   不是稳定跳跃支撑。
4. air 对应 `airborne`；ground 上零移动请求对应 `idle`，获准的普通/奔跑请求分别对应
   `walk` / `run`。这些值描述已提交 Gameplay 状态，不从动画 Clip 反推。
5. 基础跳跃准入仅在 `supportState === "supported"` 且 `allowJump === true` 时成立。
   `coyoteTimeSeconds` 只允许保留最近一次稳定支撑后的跳跃资格；它不得把
   `movementMedium` 改回 ground，也不得由 `sliding` 重新武装。Jump Buffer 同样只缓存
   Intent，不制造支撑。
6. 解析 Definition 唯一 Feel、Control、Medium 与当前 Motion。资源缺失或 Capability
   不满足时保持上一稳定运行组合并返回 `SUBJECT_STATE_RESOLVE_UNCHANGED`；冷启动无
   完整组合则 Admission 失败。
7. 在固定 Tick 末发布 Snapshot 所需字段与 Profile Ref。Capture / Agent / Render
   Binding 不得从 Clip 名反推状态。

第一切片的 Resolver 输出和 Snapshot 投影必须使用关闭的
`"ground" | "air"` 联合类型。现有宽泛 `MovementMediumV1` 若在 Clean Break 期间仍含
`"water"`，只能作为尚未迁移的实验类型存在；第一切片 Resolver、Compiler 或
Snapshot 尝试发布 `"water"` 必须失败并返回
`SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`，不得静默降级。

## 8. 支撑合同

### 8.1 Spawn / Reset 的唯一初始化顺序

锁定版 Babylon 源码中，`setPosition()` 只复制位置；`checkSupport()` 只从当前 contact
manifold 创建约束；`integrate()` 才执行 shape cast / proximity 并更新 manifold。因此
首 tick ray bootstrap 既不是同一权威，也不能被“先 setPosition 再立即 checkSupport”
替代。

Spawn 与 Reset 必须使用唯一顺序：

1. 设置 Controller 的已编译绝对位置，清零线速度，并清空 jump/coyote/buffer 等
   Runtime latch。
2. 执行一次**不发布状态**的固定步 bootstrap integration：零 Intent、明确的
   unsupported surface input、同一世界重力。该步唯一目的，是让锁定版 Controller
   通过自己的 shape cast / proximity 填充 contact manifold。
3. bootstrap 后调用一次 `checkSupport()`，将结果交给 State Resolver；若结果是
   `unsupported`，首次发布必须是 `movementMedium: "air"`，后续正常积分重力。

第 2 步是不经 Resolver 发布的唯一初始化例外；它不能触发 Action、生成 Snapshot、
使用 raycast/Heightfield/AABB 推断支撑或直接写 ground。第 3 步仍是首次发布 Tick 的唯一
support query。禁止：

- `hasWalkablePhysicalGroundAt`、`physicsEngine.raycast` 接地旁路；
- `initialGroundSupportPending` 或任何 pending 旗标跳过固定 Tick；
- 为“出生稳定”设置第二条合法接地路径；
- 用地形高度、动画落地帧或水位填充 `isGrounded`。

### 8.2 Object `supported-by`

P1.5 第一切片负责消灭 Object AABB 顶面旁路，但不新增 Hybrid Surface 公共协议：

- Supporting Entity 是 Terrain：继续使用与 Runtime Heightfield 网格一致的三角面高度
  采样，不改为双线性高度。
- Supporting Entity 是 Object：Layout revalidation 必须对该 Object **已锁定的 Collider
  shape** 执行垂直 support query，并在被支撑对象的 XZ footprint 样本上计算高度与覆盖
  比例。Visual Mesh、`maximumMetersXYZ[1]` 和手填顶面均不合法。
- 第一切片只承诺现有可确定查询的 primitive / convex Collider。某 Collider 无法通过
  锁定 shape 查询时，返回 `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED` 并阻断；禁止
  回退 AABB。
- 查询结果只用于 Layout `supported-by` 断言和绝对 Y 求解，不得写 Character
  `isGrounded`；Runtime 支撑仍只来自 `checkSupport()`。

P2.6 H1 的明确入口是：在同一 collider-backed query 接口上增加 triangle subshape、
稳定 Surface ID 与桥面 Fixture，并与 P2.5 Surface 合同共同冻结。Opening、Portal、
多层 Surface 与拱桥/栏杆语义属于该后续切片；它们不得反向改写本节的“AABB 永不合法”
和“Runtime 只信 checkSupport”两条不变量。

Layout 输出的 Y 是世界绝对坐标，不是离地偏移。Kit / Solver 根据 Collider query 求解
绝对 Y；普通 Agent 不填写 Collider 顶面高度。

## 9. 第一切片闭合集

实施计划必须完整覆盖以下闭合集，不能只迁字段：

1. 四个 Canonical kind 与 Subject Definition 绑定 Clean Break（§5–§6）。
2. Locomotion boolean-only、Motion 无数字袋、Definition 唯一 Feel。
3. 两条可区分 Feel 及同一 Golden / G Bot Definition 的确定性切换。
4. Spawn / Reset 唯一 bootstrap、每 Tick 一次 support、台沿离开与 held/pressed jump。
5. State Resolver 与 Snapshot 只输出 Ground / Air，并暴露实际生效 Profile Ref。
6. Object primitive / convex Collider-backed `supported-by`；不支持的 shape 稳定阻断，
   不回退 AABB。
7. 30/60/120 Hz-like Render 节奏下固定 Tick Replay 一致；双实例 Feel 隔离。
8. 使用现有 Admission / Explain / Snapshot 通道返回 §11 Diagnostic；不新增 Validation、
   CLI 或 Browser 公共协议。

最低实施 Gate 由后续计划绑定到当时仓库命令，至少包含 TypeScript、单元/集成测试、
Golden 与 G Bot 既有验证。本文不写具体 Hash，也不把文档审查冒充 Runtime 证据。

## 10. Adapter 约束与引擎证据

第一切片实施必须去除：

- Adapter / Kernel 中 `accelerationMetersPerSecondSquared: 24`、转向率、速度等默认手感
  数字；缺 Feel 时失败，不猜。
- Motion `parameters` 对坡度、台阶或 Feel 的覆盖。
- `physicsController.acceleration = 1` 等未由冻结合同解释的运动魔法数。
- water membership 对 `movementMedium` 或重力的生产切换。

锁定版源码核对结论：

- `PhysicsCharacterController.setPosition()` 不建立 contact manifold。
- `checkSupportToRef()` 先验证当前 manifold，再从其创建约束并分类
  `UNSUPPORTED / SLIDING / SUPPORTED`。
- `integrate()` 内部执行 cast/proximity、更新 manifold，并应用 `maxSlopeCosine` 与
  `maxStepHeight`。

因此 §8.1 的 bootstrap 是当前锁定 Provider 的生命周期适配，不是 AI-facing 字段；
Provider 更换时可以替换适配实现，但不能改变“一次 support 权威、无 ray 假接地”的
Canonical 语义。

## 11. 稳定 Diagnostic

| Code | 触发条件 |
|---|---|
| `LOCOMOTION_PROFILE_SPEED_FORBIDDEN` | Locomotion 出现任何速度或运动数值字段 |
| `LOCOMOTION_PROFILE_FIELD_FORBIDDEN` | Locomotion 出现非 `allow...` 布尔领域字段或开放袋 |
| `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN` | Motion 出现 parameters/safetyLimits/authoringRanges 或数字调参字段 |
| `CONTROL_FEEL_PROFILE_INVALID` | Feel 缺字段、非有限、越界或跨字段约束失败 |
| `MEDIUM_PROFILE_FIELD_FORBIDDEN` | Ground 容差、Water 或其他非 V1 Medium 字段出现 |
| `PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID` | 坡度或台阶字段缺失、非有限或越界 |
| `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED` | Definition 缺失、未锁定或不可用的唯一 Feel Ref |
| `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED` | 第一切片试图解析或发布 water/其他未支持 Medium |
| `SUBJECT_OVERRIDE_FORBIDDEN` | 覆盖未开放路径、Provider Handle 或旧 parameters 路径 |
| `SUBJECT_STATE_RESOLVE_UNCHANGED` | 运行中原子切换失败并保持上一稳定组合 |
| `SUBJECT_SUPPORT_QUERY_MISSING` | 发布 Tick 没有唯一 Character support sample |
| `SUBJECT_SUPPORT_BOOTSTRAP_INVALID` | Spawn/Reset 使用 ray、发布 bootstrap 中间态或违反唯一顺序 |
| `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED` | Object Collider 无可用的锁定 support query；禁止 AABB 回退 |

公共 Diagnostic 可以附带 Entity ID、Profile Ref 与字段路径，但不得暴露 Babylon/Havok
原始消息、Handle 或堆栈作为协议字段。

## 12. 后续边界

| 后续切片 | 从 P1.5 继承的稳定点 | 后续才可冻结的内容 |
|---|---|---|
| P2.5 游泳 / 攀爬 | Medium/Resolver 单一权威、全局重力唯一 | Water Sensor、进入/退出迟滞、浮力、Swim/Climb、`movementMedium: "water"` |
| P2.6 H1 Bridge | Collider-backed query、AABB 禁止、Runtime `checkSupport` 唯一 | Triangle subshape、Surface ID、桥面 Fixture；与 P2.5 Surface 同切片 |
| P1.3 姿态 / Action | Resolver 不读 Clip 名 | crouch/prone/action reducer 与 Capsule 切换 |
| P1.6 Override | 受控 Profile Ref 白名单 | 通用 WorldChangeSet / Patch |
| 车辆 / 飞行 | Intent 与 Feel 分离 | 新 Control/Feel Schema 版本、对应 Kernel 与能力合同 |

任何后续切片都不能把速度放回 Locomotion/Motion，不能让 Medium 覆盖 Character
support，也不能用 AABB、Visual Mesh 或动画重新推导物理支撑。

## 13. 后续实施计划顺序

1. 先写失败复现，锁死 Locomotion 速度、Motion 数字袋、双 Feel 绑定、water 输出、
   spawn ray 与 Object AABB。
2. Clean Break Registry 类型、Catalog、Definition、Compiler 与锁。
3. 实现唯一 Feel 读取、Body traversal 映射和 Ground/Air Resolver。
4. 实现 spawn/reset bootstrap 与 collider-backed Object support query。
5. 补 Feel 切换、Replay、Reset、台沿、jump edge、双实例与 30/60/120 Hz-like 对抗证据。
6. 运行完整相关 Gate；完成后再单独更新 `docs/18` 勾选与进度。

冻结本文只授权编写实施计划，不等于授权本次审查直接修改 Runtime、Catalog、CLI、
测试或 Backlog。
