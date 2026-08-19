# Simulation Take 与 Control Capture Bundle 设计

- 状态：**Proposed / Design Review Ready**。
- 适用范围：WorldPackage、Runtime Session、固定 Tick 控制、Camera、Replay、多 Pass Capture、视频模型 Adapter。
- 设计目标：把“世界是什么”“本次怎样操作和拍摄”“本次实际捕获了什么”分成独立、可哈希、可重放的制品。
- 非目标：把具体视频模型 Prompt、Provider 参数或生成结果写回 Gameplay 世界真相。
- 上位规格：[AI-first LEGO 游戏 SDK 设计](./2026-08-17-ai-first-lego-game-sdk-design.md)。
- 调研依据：[Agentic 白模世界到可控视频：开源方案调研与架构启示](./2026-08-19-agentic-whitebox-to-video-open-source-research.md)。

## 1. 决策摘要

1. `WorldPackage`、`SimulationTake`、`RuntimeSession`、`ControlCaptureBundle` 和 `GeneratedVideoArtifact` 是五个不同对象，不共享一个万能 JSON。
2. 同一个 WorldPackage 可以运行多个 Simulation Take；换动作、镜头或拍摄帧率不要求重新定义世界。
3. Simulation Take 是不可变的计划制品，使用固定 Tick 描述 Controller、Semantic Action、Camera 和 Capture Schedule；Runtime Session 是执行实例，不是 Authoring 输入。
4. Control Capture Bundle 是一次实际运行的不可变证据包，逐帧绑定 WorldPackage、Take、Session、Tick、Render Frame、Camera、Snapshot/Event/Receipt 和所有 Pass Hash。
5. 第一版必需控制 Pass 是 `neutral-color`、`linear-depth-meters`、`semantic-class-id`、`instance-id` 和 `world-normal`；具体二进制编码由锁定的 Capture Encoding Profile 定义。
6. Capture 必须等待命令 Receipt、目标 Tick 和 Render Ready；禁止用任意 `sleep` 推测世界已经稳定。
7. 模型专属转换只存在于 `VideoModelAdapter`。最终视频是派生 Artifact，不能反向覆盖位置、碰撞、动作、遮挡或身份真相。

## 2. 五个对象各自回答什么

| 对象 | 回答的问题 | 是否可变 | 权威内容 |
|---|---|---:|---|
| `WorldPackage` | 世界里有什么、能做什么 | 否 | IR、ExecutionPlan、资源、Capability、初始状态、Lock |
| `SimulationTake` | 这次怎样控制、怎样拍摄 | 否 | 固定 Tick Track、Controller、Action、Camera、Capture Schedule |
| `RuntimeSession` | 当前执行到了哪里 | 是 | Session ID、Tick、状态、请求、Receipt、Snapshot、Render Ready |
| `ControlCaptureBundle` | 这次实际捕获了什么 | 否 | 帧、Pass、相机、轨迹、事件、全部 Hash 与 Provenance |
| `GeneratedVideoArtifact` | 某个模型怎样解释控制包 | 否 | Adapter、模型配置 Hash、输入 Bundle Hash、输出和评估 |

禁止的混用：

- WorldPackage 不保存某个视频的镜头 Track。
- Simulation Take 不内联 WorldPackage、Normalized IR 或引擎对象。
- Runtime Session 不成为可分发的世界定义。
- Control Capture Bundle 不混入其他 Take、其他 Session 或其他 Package 的帧。
- Generated Video 不成为 Runtime Snapshot、Collision 或 Entity Transform 的来源。

## 3. 权威链路

```text
Canonical AuthoringSpec
  → NormalizedWorldIR
  → ExecutionPlan
  → WorldPackage
        ↓ reference
    SimulationTake
        ↓ execute
    RuntimeSession
        ↓ capture
    ControlCaptureBundle
        ↓ model-specific transform
    VideoModelAdapter
        ↓
    GeneratedVideoArtifact
```

WorldPackage、Simulation Take 和 Control Capture Bundle 使用各自独立的 Schema Version 与 Hash 域。任何一个对象的 Hash 变化都必须形成新的下游制品，不能覆盖旧证据。

## 4. SimulationTake Schema

### 4.1 顶层结构

```json
{
  "kind": "worldkit-simulation-take",
  "schemaVersion": 1,
  "id": "coastal-walk-opening",
  "worldPackageRef": "package://coastal-world@sha256:...",
  "worldPackageRootHash": "sha256:...",
  "seed": 731991,
  "simulationTickRate": {
    "numeratorTicks": 60,
    "denominatorSeconds": 1
  },
  "startTick": 0,
  "endTickExclusive": 600,
  "controllers": [],
  "tracks": [],
  "captureSchedule": {},
  "captureProfileRef": "worldkit://capture/profile/control-video@1",
  "captureEncodingProfileRef": "worldkit://capture/encoding/web-v1@1"
}
```

规则：

- `worldPackageRef` 定位 Package，`worldPackageRootHash` 防止位置相同但内容变化。
- `simulationTickRate` 使用整数有理数表达，必须与 WorldPackage/Runtime Target 支持值一致；加载时不允许静默重采样 Gameplay。
- Tick 区间采用左闭右开 `[startTick, endTickExclusive)`，避免结尾歧义。
- Seed 只控制声明允许的确定性随机过程，不能代替 Package/Take Hash。
- Take 不出现 Babylon、Havok、DOM、Canvas、Playwright 或视频 Provider 字段。

### 4.2 Controller Definition

Controller 是 Take 内持久定义：

```json
{
  "id": "hero-controller",
  "kind": "scripted",
  "controlledEntityId": "hero",
  "controlProfileRef": "worldkit://control/character-relative-camera@1",
  "initialSequence": 0
}
```

第一版 `kind` 关闭为：

- `scripted`：完全由 Track 驱动，适合确定性捕获；
- `recorded-replay`：引用已冻结输入日志；
- `external-session`：允许受权 Browser/CLI Session 在声明 Tick 窗口提交输入，生产 Bundle 必须固化实际输入日志。

`controlledEntityId` 不代表永久 Possession。若 Take 包含换乘、切换主体或释放控制，必须通过类型化 Control Binding Command/Receipt Track 记录。

### 4.3 Track 判别 Union

`tracks` 中每个对象是持久定义，使用 `kind`：

| `kind` | 关键端点 | 内容 |
|---|---|---|
| `control-intent` | `controllerId` | 移动、转向、跳跃等连续/离散 Intent Keyframe |
| `semantic-action` | `actorEntityId` | Action Ref、开始 Tick、参数、期望状态 |
| `control-binding` | `controllerId`, `controlledEntityId` | Possession/释放/切换计划 |
| `camera-rig` | `cameraEntityId` | Rig Ref、Target、Mode、参数 Keyframe |
| `camera-pose` | `cameraEntityId` | 受权离线拍摄用位置/朝向/FOV Keyframe |
| `world-command` | 类型化角色端点 | 只允许 Host Profile 白名单中的确定性命令 |

示例：

```json
{
  "id": "hero-movement",
  "kind": "control-intent",
  "controllerId": "hero-controller",
  "keyframes": [
    {
      "tick": 0,
      "moveAxesXZ": [0, 1],
      "lookDeltaRadiansXY": [0, 0],
      "runEnabled": false,
      "jumpPressed": false
    },
    {
      "tick": 180,
      "moveAxesXZ": [0.25, 1],
      "lookDeltaRadiansXY": [0.08, 0],
      "runEnabled": true,
      "jumpPressed": false
    }
  ]
}
```

规则：

- Keyframe 按 Tick 严格递增；同一 Channel 的重复 Tick 无效。
- 连续值的插值策略由 Track 显式声明并使用关闭枚举；离散动作只能在 Tick 边界提交。
- Semantic Action 使用 Registry `actionRef`，不写动画 Clip 名或键盘按键。
- Camera Pose 仅用于声明允许外部控制的 Camera；Gameplay Camera 默认由 Camera Rig/Context 管理。
- Track 间冲突在 Take 编译阶段报告，不以数组顺序隐式决定胜者。

## 5. 时间与帧映射

本协议只使用三个精确术语：

- `simulationTick`：Gameplay/Physics 固定步进编号；
- `renderFrameIndex`：Runtime 实际渲染提交编号；
- `captureFrameIndex`：输出 Control Capture Bundle 的连续帧编号。

不使用无前缀的 `frame` 表示三者之一。

### 5.1 Capture Schedule

```json
{
  "kind": "constant-frame-rate",
  "captureFrameRate": {
    "numeratorFrames": 24,
    "denominatorSeconds": 1
  },
  "firstCaptureTick": 0,
  "lastCaptureTickInclusive": 599,
  "renderInterpolation": {
    "kind": "none"
  }
}
```

支持：

- `constant-frame-rate`：编译为明确 Frame-to-Tick Table；
- `explicit-ticks`：直接声明 `captureTicks`，适合验证和关键帧。

Take Compiler 输出规范 `CaptureSchedulePlan`：每个 `captureFrameIndex` 对应 `simulationTick`，若启用渲染插值还记录 `nextSimulationTick` 与 `renderInterpolationRatio`。第一条生产切片使用 `renderInterpolation.kind: none`，确保每个捕获帧只对应一个已提交 Simulation Tick。

24/30/60 等不能整除 Tick Rate 的情况必须通过整数/有理数算法产生稳定映射，禁止累计浮点时间误差。重复 Tick 或跳过 Tick 都是合法结果，但必须显式出现在计划和 Bundle 中。

## 6. CaptureProfile 与 Pass

### 6.1 必需 Pass

| Pass ID | 逻辑内容 | 必须保证 |
|---|---|---|
| `neutral-color` | 中性白模颜色、稳定灯光和背景 | 不含生成式纹理；曝光/色彩 Profile 锁定 |
| `linear-depth-meters` | Camera 空间线性深度 | 正值米制；无命中值与裁剪面语义明确 |
| `semantic-class-id` | 每像素语义类别 ID | 与 Bundle Semantic Table 一致 |
| `instance-id` | 每像素稳定 Runtime Entity ID 映射 | 跨帧不因 Draw Order 改变 |
| `world-normal` | 世界坐标法线 | 坐标方向和编码 Profile 锁定 |

第一版 Control Capture Bundle 必须包含以上五种 Pass；Adapter 可以不消费全部 Pass，但不能让缺失的必需 Pass 冒充合格 Bundle。

### 6.2 可选 Pass

- `motion-vector-pixels`；
- `albedo`；
- `material-properties`；
- `lighting`；
- `collision-debug`；
- `height-slope-debug`；
- `occlusion-boundary`。

可选 Pass 必须通过 Capture Capability Discovery 声明。首期不把未验证的 Motion Vector 或 PBR 通道写成生产承诺。

### 6.3 Encoding Profile

Canonical Schema 冻结 Pass 的物理含义，不把某个浏览器读回格式固化成世界语义。`captureEncodingProfileRef` 锁定每个 Pass 的：

- media type、通道、位宽、端序和压缩；
- Color Space、Alpha、Tone Mapping 和 Exposure；
- Depth 单位、Near/Far、无命中值；
- Normal 坐标域、轴方向和量化方式；
- ID 位宽、背景值和 Preview 映射；
- 分辨率、Pixel Origin 和行方向。

第一版候选实现可使用 PNG 保存 `neutral-color`，使用无损整数/浮点二进制保存 Depth、Semantic、Instance 和 Normal，并额外生成非权威 Preview PNG。最终编码在 Babylon/WebGL/WebGPU Capture Probe 后写入 `web-v1` Profile；改变编码只增加 Profile 版本，不修改 WorldPackage。

## 7. Camera 与每帧元数据

每个捕获帧至少记录：

- `cameraEntityId` 与 Camera Rig/Profile Ref；
- `simulationTick`、`renderFrameIndex`、`captureFrameIndex`；
- View/Projection/World Matrix 与 Matrix Convention Profile；
- Position `positionMetersXYZ`、Orientation 和 Forward/Up；
- FOV、Aspect、Near/Far 或正交范围；
- 输出宽高 Pixels；
- 当前 Camera Target/Context；
- Render Ready Receipt ID。

矩阵约定、右手坐标、`-Z` Forward、NDC 深度范围和矩阵布局必须由版本化 Coordinate/Matrix Profile 冻结，不能依赖 Babylon 默认值或消费者猜测。

## 8. ControlCaptureBundle 目录与 Manifest

```text
control-capture-bundle/
  bundle.json
  take.json
  world-package-ref.json
  capture-profile-lock.json
  encoding-profile-lock.json
  tables/
    semantic-classes.json
    instances.json
  tracks/
    inputs.ndjson
    actions.ndjson
    events.ndjson
    relationships.ndjson
    snapshots.ndjson
    cameras.ndjson
  frames/
    000000/
      frame.json
      neutral-color.png
      linear-depth-meters.bin
      semantic-class-id.bin
      instance-id.bin
      world-normal.bin
    000001/
      ...
  diagnostics.json
  validation-report.json
  integrity.json
  signatures/                 # 可选
```

`bundle.json` 候选形状：

```json
{
  "kind": "worldkit-control-capture-bundle",
  "schemaVersion": 1,
  "id": "coastal-walk-opening-capture",
  "worldPackageRootHash": "sha256:...",
  "normalizedWorldIrHash": "sha256:...",
  "executionPlanHash": "sha256:...",
  "registryLockHash": "sha256:...",
  "simulationTakeHash": "sha256:...",
  "runtimeSessionId": "session-...",
  "runtimeBuildFingerprintHash": "sha256:...",
  "captureProfileRef": "worldkit://capture/profile/control-video@1",
  "captureEncodingProfileRef": "worldkit://capture/encoding/web-v1@1",
  "captureFrameCount": 240,
  "captureStartedAt": "2026-08-19T10:00:00Z"
}
```

时间戳只用于审计，不参与模拟结果选择。`controlCaptureBundleRootHash` 复用
WorldPackage 的 Canonical Bytes/Integrity 原则，由外层 `integrity.json` 计算并通过
CLI/下游引用返回；`bundle.json` 不保存自己的 Root Hash，`integrity.json` 自身和
`signatures/` 不进入 Root 输入，避免自引用。

### 8.1 Frame Manifest

每个 `frame.json` 至少包含：

- 三种明确计数器；
- `renderInterpolationRatio`；
- Camera Snapshot Ref；
- World Snapshot Ref；
- 本 Tick 生效的 Input/Action/Event/Relationship Receipt Refs；
- `passArtifactsById`，每项记录路径、media type、尺寸 Bytes 和 SHA-256；
- 可选 Validation Evidence Refs。

帧目录编号与 `captureFrameIndex` 一致。捕获失败不能留下被当成成功的半帧；要么原子完成该帧 Manifest，要么记录缺失并使 Bundle Finalization 失败。

## 9. Runtime Session 与 Capture 状态机

```text
created
  → package-loading
  → world-ready
  → take-validated
  → take-running
  → tick-committed
  → render-ready
  → frame-captured
  → take-completed
  → bundle-finalized
```

任一步失败进入明确失败状态并保留 Diagnostic。规则：

- Command 先获得 Request ID，固定 Tick 提交后获得 Receipt。
- Capture Schedule 到达目标 Tick 后，等待该 Tick 对应状态提交和目标 Camera View Receipt。
- Runtime 发出 `render-ready`，携带 Tick、Render Frame、World/Camera Snapshot Hash。
- 所有必需 Pass 在同一逻辑 Render State 上完成后，才能提交 Frame Manifest。
- Bundle Finalizer 检查帧数、通道、Hash、ID Table、时间映射和 Session 归属。

Playwright Driver 等待协议事件或 Receipt，不允许 `waitForTimeout(1000)` 作为正确性条件。

## 10. Replay 与确定性等级

Control Capture Bundle 必须区分：

1. **Input Determinism**：Take/输入日志一致；
2. **Simulation Determinism**：关键 Snapshot 在容差内一致；
3. **Capture Determinism**：相同平台 Profile 的 Pass Hash 或量化 Metric 一致；
4. **Model Output Reproducibility**：仅在下游 Provider 支持时声明，不属于 SDK Gameplay 确定性。

Bundle 记录 SDK、Runtime Adapter、Physics/WASM、浏览器、平台类别、GPU/渲染后端、Feature Flags、固定时间步和容差。若像素级 Hash 因平台差异无法保证，必须使用锁定 Platform Profile 的 Metric Gate，并明确不能宣称 bit-for-bit。

## 11. CLI、Browser 与 Driver

候选命令面：

```text
worldkit take validate <take.json>
worldkit take inspect <take.json>
worldkit take run <take.json> --session-output <path>
worldkit capture run <take.json> --output <bundle-directory>
worldkit capture validate <bundle-directory>
worldkit capture inspect <bundle-directory> --frame-index <n>
```

Browser Protocol 增加：

- `loadSimulationTake`；
- `startSimulationTake`；
- `getSimulationTakeStatus`；
- `waitForSimulationTick`；
- `waitForRenderReady`；
- `captureControlFrame`；
- `finalizeControlCaptureBundle`；
- `cancelSimulationTake`。

所有写操作带 Session Scope、Request ID、Expected State/Tick 和幂等语义。`capture` 权限不能隐式获得 `control.intent`、`control.bind` 或 `camera.control`。

## 12. VideoModelAdapter 边界

Adapter 输入是已验证 Control Capture Bundle 和模型侧配置：

```text
Verified ControlCaptureBundle
  + AdapterProfileRef
  + visual prompt / reference assets
  + model-specific generation settings
  → GeneratedVideoArtifact
```

Adapter 可以：

- 选择、重排或转换 Pass；
- 生成模型所需边缘图、颜色映射、深度归一化或 Conditioning Tensor；
- 提交 Provider Job 并保存 Provenance；
- 对输出做结构一致性评估。

Adapter 不可以：

- 修改 WorldPackage 或 Take 后继续沿用旧 Hash；
- 把模型生成画面中的新几何写回 Runtime Snapshot；
- 以 Provider 字段污染 Canonical Authoring、IR 或 Capture Profile；
- 在缺少必需 Pass 时伪造通过状态。

## 13. Validation Gate

Control Capture Bundle 至少验证：

- WorldPackage/IR/ExecutionPlan/Registry Lock/Take/Session 归属唯一；
- Frame-to-Tick Table 完整且与 Take 一致；
- 帧目录连续，必需 Pass 尺寸和数量一致；
- Camera Matrix、Coordinate Profile、Depth 单位和 Near/Far 合法；
- Semantic/Instance 像素值均存在于对应 ID Table；
- 声明应可见的 Required Entity 在计划帧中出现；
- Snapshot/Event/Action/Relationship Receipt Tick 不越界；
- 所有 Artifact Hash、Bundle Root 和可选签名通过；
- Replay Gate 达到 Take 声明的确定性等级。

统一报告结构见 [World Validation Report 与质量门禁设计](./2026-08-19-world-validation-report-and-quality-gates-design.md)。综合视频美学分数不能覆盖通道缺失、Hash 错配或错误深度单位。

## 14. 失败、恢复与原子性

- Capture 失败后可以从最后一个已完整提交的 `captureFrameIndex` 继续，但必须重新加载同一 Package/Take、恢复到可证明相同的 Snapshot，并创建新的 Runtime Session ID。
- 恢复后的 Bundle 逐帧记录实际 Session ID；若产品要求单 Session Bundle，则恢复必须生成新 Bundle，不得拼接。
- Bundle Finalization 前目录属于 staging；Finalization 原子写入 Root Manifest 和 Integrity。
- 取消 Take 不删除已生成证据，状态标记为 `cancelled`，不能冒充完整 Bundle。
- 任何 Pass Provider 崩溃、GPU Context 丢失或浏览器导航都使当前帧失败并要求 Render Ready 重新建立。

## 15. 安全、隐私与资源预算

- Take 只引用 Package、Registry Resource 和闭合参数，不允许代码、动态 import 或任意页面脚本。
- 限制 Tick 数、Track/Keyframe 数、分辨率、Pass 数、总像素、Bundle Bytes 和执行时间。
- Capture 目录防路径穿越；Manifest 中路径必须是规范相对路径。
- Prompt、参考图 URI、用户标识和 Provider 凭证不默认进入 Bundle；必要 Provenance 可脱敏或单独加密。
- Production Driver 继续使用短生命周期 Session、Origin/World 绑定和最小 Scope。
- Adapter 运行环境与 SDK Runtime 隔离；外部 Provider 不能获得 Browser Driver 权限。

## 16. 第一条实施切片

固定一个室外海湾 WorldPackage 和两个 Take：

1. `coastal-walk-opening`：主体沿 Route 行走，第三人称相机跟随；
2. `coastal-orbit-observation`：主体静止，Camera 围绕 Landmark 进行受控拍摄。

每个 Take：

- 10 秒、60 Hz Simulation；
- 24 FPS Capture；
- 五个必需 Pass；
- 每帧 Camera、Snapshot/Event/Action Receipt 和三种计数器；
- 同一 Package Root Hash，不同 Take Hash 和 Bundle Root Hash。

验收标准：两个 Bundle 不混淆；帧数/时间映射稳定；Instance/Semantic ID 跨帧一致；Depth 单位正确；重放 Snapshot 达标；故意替换单帧或单 Pass 时 Integrity/Validation Gate 阻断。

## 17. 实施分解

1. 冻结 SimulationTake、Track、CaptureSchedule、Profile Manifest 和 Bundle Schema。
2. 完成 Runtime Capture Probe，决定首版 Encoding Profile 和 Platform Profile。
3. 实现 Take Validator/Compiler 与 Frame-to-Tick Plan。
4. 扩展 Runtime Session 状态、Receipt 和 Render Ready Protocol。
5. 实现五个必需 Pass 与稳定 Semantic/Instance Table。
6. 实现 Bundle Writer、Resume/Finalize、Canonical Integrity 和 Inspect。
7. 实现 CLI/Browser/Playwright Driver Conformance。
8. 接入统一 Validation Report、两个 Take Fixture 和 Replay Gate。
9. 最后再实现第一个实验 VideoModelAdapter；Adapter 不阻塞 SDK 核心协议验收。

编码前必须新增独立实施计划，列出实际包路径、技术探针、协议版本、测试矩阵和资源预算。多 Pass 与 Session 改动可以共用计划，但不能同时顺带实现模型 Provider、NPC、坐骑或完整 Gameplay。

## 18. 已冻结与待评审

已冻结的架构方向：

- WorldPackage、Take、Session、Bundle、Generated Video 五层分离；
- 固定 Tick 与三种明确帧计数；
- 五个必需 Pass；
- Render Ready/Receipt 驱动 Capture；
- Bundle 全链路 Hash 与模型 Adapter 隔离。

待评审的字段级细节：

- 首版 Capture Encoding Profile 的具体文件格式；
- Camera Matrix Profile 是否同时输出 OpenCV 和 Graphics Projection Adapter；
- Motion Vector 在 WebGL2 与 WebGPU 的交付阶段；
- 恢复流程是否允许多 Session Bundle；
- 第一条视频模型实验使用哪个 Adapter。以上选择不改变五层边界。

## 19. 参考依据

- [Habitat-Sim](https://github.com/facebookresearch/habitat-sim)：可重放模拟与传感器输出的协议分离。
- [NVIDIA Cosmos Transfer](https://github.com/nvidia-cosmos/cosmos-transfer2.5)：结构控制序列驱动视频生成。
- [DiffusionRenderer](https://github.com/DiffusionRenderer/DiffusionRenderer)：多通道几何/材质条件的生成式渲染路线。
- [GPT4Motion](https://github.com/jiawei-ren/insact)：动作脚本与可控视频生成的历史先例。
- [EgoSim](https://arxiv.org/abs/2506.07804)：长时模拟状态与视频观察的分层价值。
