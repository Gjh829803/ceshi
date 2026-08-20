# 运动与相机配表审计（2026-08-20）

## 结论

本轮将运动规律、输入解释与相机行为拆成三个可独立替换的层。相机只消费 `ViewTargetSampleV1`，相机相对移动只消费 `ViewControlFrameV1`；两者之间不再传递 Babylon Camera、Subject Controller、Control Profile 或现实主体类别。

`safetyLimits` 继续作为 Runtime 硬边界，新增的 `authoringRanges` 只负责调控台中的推荐区间和步长。调控台会依据 Motion Kernel 的 `runtimeParameterNames` 区分“即时生效”和“仅草稿、待接入”。

## 已进入 Runtime 的运动参数

| Kernel | 已消费参数 |
|---|---|
| K01 Free Ground | 行走速度、奔跑速度、跳跃力度、加速度、减速度、转身速率、空中控制 |
| K02 Forward Steer | 前进/倒退速度、加速度、减速度、转向率、跳跃力度、Boost |
| K03 Wheeled Arcade | 前进/倒退速度、加速度、制动力、滑行阻力、低/高速转向率、转向输入渐变、松手回正、完整转向车速、速度曲线指数、Boost |
| K04 Surface Slide | 最高速度、推进加速度、表面摩擦、转向率、Boost |
| K06 Water Surface | 前进/倒退速度、加速度、阻力、转向率、贴水强度、Boost |
| K08 Unpowered Glide | 最低/最高前进速度、滑翔加速度、重力倍率、升力效率、偏航率、失速速度 |

本轮补齐了 K01 的加速度、减速度、转身速率和空中控制；K03 新增固定 Tick 转向状态、速度转向权限、回正、曲线插值、倒车偏航、滑行与制动。K03 同时校验 `highSpeedTurnRate <= lowSpeedTurnRate`。

## 已进入 Runtime 的相机参数

七套 Camera Profile 通过四种通用 Rig 复用，行为由 `headingSource` 决定：

| Profile | Heading Source | 结果 |
|---|---|---|
| 第一人称 | `target-forward` | 镜头跟随观察目标朝向 |
| 自由环绕 | `view` | 只跟位置，不被主体转身带动 |
| 稳定跟随 | `target-forward` | 保持相对主体的观察方向 |
| 高速追逐 | `target-velocity` | 跟随已提交速度方向，低速保持最后稳定方向 |
| 水面跟随 | `target-velocity` | 低速方向稳定，不因停车抖动 |
| 滑翔视角 | `target-velocity` | 跟随飞行方向并保持世界水平线 |
| 乘坐跟随 | `target-forward` | 跟随关系目标朝向 |

以下参数已被 Camera Runtime 消费：目标 Socket、距离及上下限、观察高度、肩部偏移、俯仰及上下限、位置/旋转平滑、碰撞半径、Look Ahead、基础/速度 FOV、切换时间、最低速度朝向阈值。Profile 切换会连续混合位置、目标与 FOV；微调数据按 Profile 和内容 Hash 隔离。

当前碰撞仍为 Ray Cast 缩距，不等同于完整的体积碰撞。

## 已声明但尚未进入 Runtime

以下参数在调控台中必须显示为“仅草稿、待接入”，不得提示即时应用：

- K04：`slopeGravityRatio`。当前坡度加速度直接来自重力在表面切平面的分量。
- K08：`pitchRateRadiansPerSecond`、`rollRateRadiansPerSecond`。当前简化滑翔只消费输入俯仰对垂直速度的影响与偏航。
- Medium Profile：水、空气介质参数尚未形成统一的 Kernel 输入。
- Camera Shape Cast：尚未替代现有 Ray Cast。
- Mounted 自动关系相机：协议已保留，关系目标自动解析尚未实现。
- 正式 Parameter Schema Registry：目前由 Profile、Kernel 声明与 Registry 校验共同承担。

## 后续建议参数

建议按以下顺序继续扩展，避免先堆主体专用脚本：

1. K01：跳跃宽容时间（Coyote Time）、跳跃预输入（Jump Buffer）。
2. K03：车辆侧向抓地、手刹转向；保持为通用轮式参数，不创建车型专用 Controller。
3. Camera：自动回正策略、回正延时、遮挡恢复速度；继续放在 Camera Profile，不读取 Control Profile。
4. Medium：把地面、水面、空气的共享事实正式提交给 Kernel。
5. Relationship：Mounted/Seat/Tether 提交统一 View Target，不创建 `KayakCamera`、`VehicleCamera` 等主体专用核心类。

## 配表规则

- Profile 默认值必须位于 `authoringRanges` 内。
- `authoringRanges` 必须位于 `safetyLimits` 内，且 `step > 0`。
- Browser/AI API 可以在安全边界内提交参数；调控台只展示策划推荐区间。
- Runtime 只接受当前 Kernel `runtimeParameterNames` 中的参数。
- 草稿键包含 Subject Definition、Profile 精确引用与内容 Hash，旧的高灵敏载具草稿不会覆盖新默认值。
- 导出 Schema V3 必须保留参数来源、策划范围、Runtime 支持状态和所选 Camera Profile。
