# 七大类运动入口

大类选择运动规则，小类提供能力说明与参数范围，实例持有自己的配置和状态。现有按键映射、固定步长时钟、Rapier 碰撞世界、骑乘和相机仍由原有运行时维护。

`packages/three-world/src/humanoid-runtime/motion-families/registry.ts` 是唯一的大类注册入口，以下目录分别维护各类入口和小类目录：

| ID / 目录 | 现有实现 |
| --- | --- |
| `human` | 人物步行、跳跃、游泳及情境动作，仍由 HumanoidController 推进 |
| `ground-vehicle` | 轮式、履带、两轮、滑行、悬浮和陆地骑乘；各自保持原有算法 |
| `surface-vessel` | 动力船、摩托艇、木筏、皮划艇／独木舟 |
| `aircraft` | 固定翼动力飞行与无动力滑翔 |
| `flying-creature` | Three 主线现有飞龙运动与骑乘 |
| `underwater` | 潜航器与观察潜艇 |
| `space` | 现有六向移动和姿态控制 |

这次完成的是入口分类、现有算法整理和飞机动力接入，并非七套全新物理解算器。算法文件仍按原有实现复用；部分环境运动保留在 `simulation.ts`，各大类通过注入的公共回退入口调用。不会创建第二个时钟、碰撞世界或相机更新循环。

固定翼采用原 5190 分支的推力、升阻力、失速、力矩转弯和三轮弹簧起落架实现，保留 Shift 增油门、Ctrl 减油门／地面制动、W/S 俯仰、A/D 转向、T 切换视角。5191 的另一套飞机实现未迁入。自动航线通过 SDK 公共导出的飞机标定获取转弯参数。

旋翼、垂直起降、飞鸟和帆船标为 `reserved`，不能解析成可运行的小类。独立 Century 飞龙训练场及其资源已通过[独立页面](dragon-training-integration.md)接入地图菜单；目录中的飞龙仍指 Three 已有实现。

## 后续如何完善

1. 先确定运动方式所在大类。在对应 `family.ts` 增加或维护小类；仅调数值时复用已有算法和 `MovementSettings`，资源、动作绑定继续使用现有 VehicleSpec。
2. 新的运动规律放在该大类内部的专门模块，通过该类 `step` 入口调用。公共接触查询、输入语义和时间步长从调用者取得，不自行监听按键或创建物理世界。
3. 状态放入载具实例，并接通创建、复制、重置流程。不要把可变速度、角速度或配置放在大类模块全局变量中。
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
