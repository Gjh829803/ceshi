# 七大类运动入口

大类选择运动规则，小类提供能力说明与参数范围，实例持有自己的配置和状态。现有按键映射、固定步长时钟、Rapier 碰撞世界、骑乘和相机仍由原有运行时维护。

`packages/three-world/src/humanoid-runtime/motion-families/registry.ts` 是唯一的大类注册入口，以下目录分别维护各类入口和小类目录：

| ID / 目录 | 现有实现 |
| --- | --- |
| `human` | 人物步行、跳跃、游泳及情境动作，仍由 HumanoidController 推进 |
| `ground-vehicle` | 轮式、履带、两轮、滑行、悬浮和陆地骑乘；各自保持原有算法 |
| `surface-vessel` | 动力船、摩托艇、木筏、皮划艇／独木舟 |
| `aircraft` | 固定翼动力飞行与无动力滑翔 |
| `flying-creature` | 原生动力飞行、悬停、俯冲、体力与动作状态；兼容旧飞龙控制 |
| `underwater` | 潜航器与观察潜艇 |
| `space` | 现有六向移动和姿态控制 |

各大类拥有自己的运动入口、物理配置校验、状态创建与重置，以及小类算法。载具物理行为以 PR #225 的 `58821fc5` 为基准：仅在预设明确提供 `wheelPhysics` / `bodyPhysics` 时创建对应刚体状态，不自动将普通载具转换成通用动态刚体。`simulation.ts` 负责实例调度、PR 中的载具阻挡处理和共享世界更新；`registry.ts` 只按归属调用大类。人物继续由 HumanoidController 执行。各类使用同一个 Rapier 世界。

载具实例的 `motion` 是带 `family` 标识的状态联合：例如水面船的 `motion` 内包含本类的刚体反馈、划桨、摩托艇或艇身状态；飞机状态位于飞机类，飞龙状态位于飞行生物类。创建、重置和推进都由所属大类负责。旧的顶层 `vehicle.bodyPhysics`、`vehicle.kayak` 等状态访问已迁移为 `vehicle.motion.body`、`vehicle.motion.kayak`；公开观察快照保持原有字段，观察不取得控制权。

`shared/body-state.ts` 只提供基础数据和数值校验。轮胎、划桨、履带及潜航受力规则在各大类中维护。PR #225 的普通载具直接使用各类 `intent.ts` 运动与碰撞流程，不经过后来增加的 `motion-forces.ts` 转换。固定翼空气动力与原生飞龙扫掠控制保留。

维护时修改对应大类的 `physics-state.ts`（显式配置、状态和归属校验）、`dynamics.ts`（本类受力与反馈）、`intent.ts`（本类运动与碰撞），或具体小类模块。轮胎、履带等位于 `ground-vehicle`，固定翼位于 `aircraft/aerodynamics.ts`，划桨与摩托艇位于 `surface-vessel`，潜航器位于 `underwater`。旧源码入口只重导出实际实现。

错误的大类／算法组合会在配置解析时拒绝；直接调用错误大类的入口也会在写入状态前拒绝。普通大类内的规则调整不需要改其他大类控制器；公共输入、碰撞接口或物理边界工具发生变化时，仍需要跨类回归。

固定翼采用原 5190 分支的推力、升阻力、失速、力矩转弯和三轮弹簧起落架实现，保留 Shift 增油门、Ctrl 减油门／地面制动、W/S 俯仰、A/D 转向、T 切换视角。5191 的另一套飞机实现未迁入。自动航线通过 SDK 公共导出的飞机标定获取转弯参数。

旋翼、垂直起降、飞鸟和帆船标为 `reserved`，不能解析成可运行的小类。飞龙训练场已通过[原生飞行生物模块](dragon-training-integration.md)接入当前 Three Session。Playground 启用新飞行配置；其他消费者的旧飞龙预设保持兼容，可显式采用 `createFlyingCreatureSpec` 和 `FlyingCreatureVisual`。

## 后续如何完善

划桨状态、桨姿势、握桨位置和划桨计算由 `surface-vessel/paddling.ts` 维护。SDK 新调用使用 `humanoid.surfaceVessel.createKayakState()`、`humanoid.surfaceVessel.kayakPaddlePose(state)` 和 `humanoid.surfaceVessel.paddleGrip(state, side)`；`KayakState` 类型也从该入口导出。姿势返回船体局部坐标下的桨位置与旋转，握点返回桨局部坐标，调用者依次应用桨和船体变换得到世界位置。旧的 `humanoid.createKayakState()` 等平铺接口及内部 `kayak.ts` 路径继续重导出同一实现。

划桨状态位于水面船实例的 `vehicle.motion.kayak`，推进力和人物握桨读取同一份状态。公共人物动画模块负责消费姿势，不另行推进划桨周期；刚体反馈也在这一份水面船状态内，由水面船控制器维护。

1. 先确定运动方式所在大类。在对应 `family.ts` 增加或维护小类；仅调数值时复用已有算法和 `MovementSettings`，资源、动作绑定继续使用现有 VehicleSpec。
2. 新的运动规律放在该大类内部的专门模块，通过该类 `step` 入口调用。公共接触查询、输入语义和时间步长从调用者取得，不自行监听按键或创建物理世界，也不调用其他大类控制器。
3. 状态放入载具实例所属大类的 `motion`，在该类 `physics-state.ts` 接通创建、复制、重置流程。不要把可变速度、角速度或配置放在大类模块全局变量中。
4. 参数元数据以现有 `config/control.ts` 与 `config/control-fields.ts` 为准；为实际消费参数的算法提供行为验证。新增模式时同步现有 Mode、配置、表现和生命周期消费者，注册只负责路由，不替代这些集成。
5. 在对应大类增加有意义的行为回归，并按仓库规则登记新测试。公共接口变化时检查其他大类。

SDK 使用 `humanoid.listMotionFamilies()` 浏览独立目录副本，`motionFamilyForMode(mode)` 查询归属，`motionSubtypeControlFields(familyId, subtypeId)` 读取现有控制字段。`resolveMotionFamilyMovement(familyId, subtypeId, value, defaults)` 拒绝错误归属、未实现小类和现有参数范围之外的值，返回独立配置。

调参面板的“七大类能力目录”用于浏览实现状态与参数范围；实际修改仍应用于当前选中资产的原有控制面板。切换目录不会切换载具或改写参数。模型、骑乘、攻击等能力也不会因浏览目录自动装配。

## 验证

- 相同输入重放 32 个现有载具、各 240 个固定步长，分类前后序列化运动状态完全一致。
- 注册、范围校验、预留小类拒绝、配置和运动状态隔离测试通过。
- 固定翼起飞、双向转弯、松键回正、碰撞、正常落地制动、硬着陆和固定步长重复性测试通过。
- 浏览器验证起飞、转弯、回正、减油门、T 视角切换，以及七类目录浏览不修改当前资产控制。

浏览器检查可运行 `pnpm exec tsx apps/three-playground/scripts/aircraft-smoke.ts <预览地址> <输出目录>` 和 `pnpm exec tsx apps/three-playground/scripts/motion-family-smoke.ts <预览地址> <输出目录>`。这些是开发回归，不是新的生成或交付准入门槛。
