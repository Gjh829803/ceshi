# G Bot 镜头相对移动与摄像机控制台精简设计

## 用户事实与范围

- 用户要求删除截图所示“肩部偏移”控制台调节项。
- 用户要求移动先读取镜头 Rotation 的 `Yaw`：`W/S` 分别沿其平面前向/反向，`D/A` 分别沿其平面右向/反向；`Shift` 只改变速度，不改变该坐标语义。
- 本切片只改变 G Bot 的标准控制配置与摄像机控制台，不改变第一/第三人称类型、Arrow 镜头惯性、弹簧臂碰撞、物理、动作或其他 Subject 的既有控制配置。

## 决策与权威

1. “肩部偏移”从 Authoring 控制台的可调/Preview 参数集合移除；`shoulderOffsetMeters` 仍是 Camera Profile 的底层作者数据和 View Solver 输入，不删除 Schema、Registry 数据或解算逻辑。这样预设、未来内容和运行时兼容性不被静默破坏。
2. G Bot 保持绑定既有 canonical `worldkit://control-profile/planar.camera-relative@1`；不得为同一行为新增并行 Profile 或将坐标系改为 `subject-local`。
3. `CameraDirector` 的 `ViewControlFrameV1` 是 WASD 输入基的唯一权威：它只公开 yaw 平面前/右向量。Camera orbit 仅更新该输入基，不直接写入 Subject facing。
4. `MotionKernelRuntimeV1` 是 Subject facing 的唯一权威，并独立地平滑追随实际移动方向；平面速度必须插值至编译器给出的目标向量，不能在角色转身期间重写为“当前 Subject forward × 速度”。

## 运行时数据流

```
W/A/S/D + Shift
  -> Adapter（物理按键和 fixed tick）
  -> SubjectController
  -> CameraDirector ViewControlFrame（仅 Yaw 的前/右基）
  -> compileMotionCommandV1（W/S 前/后，D/A 右/左）
  -> MotionKernel / Havok / 动画 / Snapshot

Arrow 输入
  -> Adapter
  -> CameraDirector（独立的镜头 orbit）
```

`W` 和 `Shift+W` 的方向均为当前镜头 yaw 前方；`S` 是其反向，`D/A` 使用当前镜头 yaw 右/左轴。角色朝向可独立平滑追随移动方向，但不得作为输入方向来源。

## 控制台行为

- Basic 与 Expert 面板均不渲染“肩部偏移”。
- 读取已保存的旧 Draft 时，旧值仍可存在于 Profile/Preview 数据中，但控制台不会编辑或覆写它；切换 Profile 与重置行为保持当前 fail-closed 规则。
- 运行时 Diagnostics 仍如实显示最终相机位置，因它可能来自已有 Profile 的肩部偏移；Diagnostics 不是调参入口。

## 失败处理与兼容性

- 任何未知 `inputSpace` 或不合法的 Control Profile 继续在 Registry Admission 阶段以稳定错误码拒绝。
- Camera control frame 退化为零长度时，编译器使用 canonical `-Z` 前方和正交右方作为确定性回退。
- 不能从 Browser/Preview 写入 Control Profile 或 Subject facing；Preview 只影响已允许的 Camera 参数。

## 验证

1. 先写失败测试：控制台不出现肩部偏移，Profile Preview 不再接受其 UI 写入。
2. 先写失败测试：相机绕到与 Subject 不同方向后，`W` 与 `Shift+W` 的水平速度同镜头 yaw 前向，`D` 同镜头 yaw 右向；角色转身期间也保持该关系。
3. 覆盖 reset、blur、possession rebind 与 30/60/120 Hz-like fixed tick，确认 Arrow inertia 和摄像机 authority 未回归。
4. 运行受影响 Vitest、TypeScript no-emit、生产 build、G Bot verifier，并进行浏览器人工交互核验。
