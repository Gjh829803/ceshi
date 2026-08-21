# 运动与相机配表审计（2026-08-20）

## 结论

本轮将运动规律、输入解释与相机行为拆成三个可独立替换的层。相机只消费 `ViewTargetSampleV1`，相机相对移动只消费 `ViewControlFrameV1`；两者之间不再传递 Babylon Camera、Subject Controller、Control Profile 或现实主体类别。输入协议新增设备无关的模拟量轴，并把奔跑、Boost、制动、手刹、主/次动作、瞄准和三种镜头动作分成独立语义。

`safetyLimits` 继续作为 Runtime 硬边界，新增的 `authoringRanges` 只负责调控台中的推荐区间和步长。调控台会依据 Motion Kernel 的 `runtimeParameterNames` 区分“即时生效”和“仅草稿、待接入”。

## 已进入 Runtime 的运动参数

| Kernel | 已消费参数 |
|---|---|
| K01 Free Ground | 行走/奔跑速度、跳跃、加减速、转身、空中控制、离地宽容、跳跃预输入、长短跳重力、坡度、自动跨台阶 |
| K02 Forward Steer | 前进/倒退、加减速、低/高速转向曲线、输入渐变、回正、最低转向权限、视觉倾斜、跳跃、Boost |
| K03 Wheeled Arcade | 前进/倒退、加速、制动、滑行阻力、低/高速转向曲线、输入死区/指数、回正、侧向抓地、手刹抓地/转向、刹车切倒挡延时、Boost |
| K04 Surface Slide | 最高速度、推进、摩擦、坡度影响、横向摩擦、最大漂移角、转向渐变/回正、Boost |
| K06 Water Surface | 前进/倒退、加速、阻力、转向加速度/阻尼、最低转向权限、倒划转向、水面垂直速度、贴水与水面重力、Boost |
| K08 Unpowered Glide | 最低/最高前速、滑翔加速、重力/升力、俯仰/偏航/横滚速率及上限、姿态回正、偏航横滚耦合、俯冲换速、升降响应、失速下沉及升降边界 |

K03 使用固定 Tick 的转向状态与侧向抓地；静止转向权限默认关闭，制动、倒挡和手刹互不混用，并校验 `highSpeedTurnRate <= lowSpeedTurnRate`。K08 使用有界的前进/升降目标和姿态自动回正，避免速度与姿态无限累积。

## 已进入 Runtime 的相机参数

面向策划只保留五类基础 Camera Profile，行为由 `headingSource` 决定：

| Profile | Heading Source | 结果 |
|---|---|---|
| 第一人称 | `target-forward` | 镜头跟随观察目标朝向 |
| 自由环绕 | `view` | 只跟位置，不被主体转身带动 |
| 稳定跟随 | `target-forward` | 保持相对主体的观察方向 |
| 高速追逐 | `target-velocity` | 跟随已提交速度方向；倒车时依据 `reverseHeadingPolicy` 保持主体正向，不做 180° 翻镜 |
| 滑翔视角 | `target-velocity` | 跟随飞行方向并保持世界水平线 |

水面稳定、乘坐构图、倒车稳定、冲刺强调和越肩瞄准改为 Camera Modifier，可跨五类基础镜头叠加。Camera Director 依据关系、运动事实、介质与上下文标签选择它们，不读取主体类别。

以下参数已进入 Camera Runtime：Socket、距离/高度/肩偏/俯仰、水平与垂直位置平滑、偏航与俯仰平滑、速度朝向平滑、最大位置滞后、Look Ahead、加速度预看、FOV 与其平滑、屏幕死区、自动回正、拖动灵敏度、瞬移同步、切换混合，以及碰撞快速缩近/缓慢恢复。碰撞由中心和四个偏移 Ray 形成近似体积探测；尚未升级为真实 Shape Cast。

旧 `positionDampingPerSecond` 与 `rotationDampingPerSecond` 仅作为 Browser API 兼容别名，分别同步到新的水平/垂直和偏航/俯仰轴参数；新调控台不再重复展示这两个粗粒度字段。

`C` 回头看只改变临时观察方向，不会反向污染 `ViewControlFrameV1`；`R` 主动回正，`V` 左右换肩。自由环绕可按前进速度条件回正，稳定跟随始终以主体朝向为基础，高速追逐按已提交速度选择方向。

## 已声明但尚未进入 Runtime

以下参数在调控台中必须显示为“仅草稿、待接入”，不得提示即时应用：

- Medium Profile：水、空气介质参数尚未形成统一的 Kernel 输入。
- Camera Shape Cast：当前为五射线近似体积探测。
- Mounted 自动关系相机：协议已保留，关系目标自动解析尚未实现。
- 正式 Parameter Schema Registry：目前由 Profile、Kernel 声明与 Registry 校验共同承担。

## 后续建议参数

建议按以下顺序继续扩展，避免先堆主体专用脚本：

1. Input：增加正式手柄设备映射与输入重绑定 UI；继续输出语义 Intent 和标准化轴。
2. Medium：把地面、水面、空气的共享事实正式提交给 Kernel。
3. Camera：用 Babylon/Havok Shape Cast 替换五射线近似碰撞。
4. Relationship：Mounted/Seat/Tether 提交统一 View Target，不创建 `KayakCamera`、`VehicleCamera` 等主体专用核心类。
5. Schema：把参数关系约束、单位、说明和版本迁入正式 Parameter Schema Registry。

## 配表规则

- Profile 默认值必须位于 `authoringRanges` 内。
- `authoringRanges` 必须位于 `safetyLimits` 内，且 `step > 0`。
- Browser/AI API 可以在安全边界内提交参数；调控台只展示策划推荐区间。
- 当前策划区间已放宽至对应安全边界；可合理关闭的跳跃、阻力、Look Ahead、FOV 增益、碰撞余量、切换时间和最大镜头滞后均允许为 `0`。
- Runtime 只接受当前 Kernel `runtimeParameterNames` 中的参数。
- 草稿键包含 Subject Definition、Profile 精确引用与内容 Hash，旧的高灵敏载具草稿不会覆盖新默认值。
- 导出 Schema V4 必须保留参数来源、策划范围、Runtime 支持状态、所选基础 Camera Profile 与当前自动 Modifier。
