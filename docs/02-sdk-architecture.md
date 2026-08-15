# SDK 总体架构

> 本文同时包含已实现模块和目标架构。状态标记：`Alpha` 表示当前仓库已有可运行实现，`Partial` 表示只有部分能力，`Design` 表示只有方案/契约，`Planned` 表示尚未开始。

## 1. 一级模块

```text
World SDK
├── Core Runtime                 [Alpha]
├── World Construction           [Alpha: outdoor heightfield]
├── Subject Kits                 [Partial: humanoid.third_person]
├── Control & Camera             [Partial: third person]
├── Motion & Simulation          [Partial: humanoid + Rapier]
├── Gameplay                     [Planned]
├── NPC                          [Planned]
├── Runtime World Director       [Design]
├── Render Bridge                [Design]
└── Agent Tooling                [Alpha: plan-first outdoor]
```

| 模块 | 当前仓库 | 下一阶段 |
|---|---|---|
| Core Runtime | World、Entity、Transform、fixed timestep、Input、EventBus | 生命周期/快照协议继续收敛 |
| World Construction | Terrain、Water、Landmark、FeatureRegistry、Outdoor Scene DSL | 路径/曲线、更多 QA、室内另行设计 |
| Subject/Camera/Motion | 第三人称人形、Rapier motor、idle/walk/run、本地 rig 加载 | jump 动作、更多主体与第一人称 |
| Agent Tooling | Planner/Builder/Visual Bible 隔离流程、WorldSpec/WorldPrompt/Entity Catalog、冻结锁、内置图片生成、白膜三视图、规划工件、场景测试、检查器、固定输入 | 自动视觉差异评分、可达性和性能报告 |
| Gameplay/NPC | 无 | 后续定义后实现 |
| Runtime Director | 完整设计文档，无运行时代码 | Director SDK 的 Observation/Command/Task |
| Render Bridge | 目标契约，无多 pass 导出 | 与 World Model 团队先做离线 RenderFrame |

Agent Tooling 的规划链路是：`用户输入 → Planner: WorldSpec + World Plan + Opening Shot → 冻结锁 → Builder: 白膜实现 → SDK 派生 Top-down + Height/Slope + 白膜三视图 → Visual Bible: 样式三视图 + 渲染首帧`。规划图和样式图不进入物理判定；它们与 `WorldSpec` 一起约束空间与视觉意图，运行时白膜仍是最终真相。

## 2. Core Runtime

提供所有系统共用的底座：

```text
Core Runtime
├── World
├── Entity
├── Transform
├── Component
├── Game Loop
├── Time
├── Input
├── Event
├── Entity Lifecycle
├── Asset Registry
└── Semantic Metadata
```

第一阶段可以使用简单的 Entity/Component 结构，不要求立即引入完整 ECS。

## 3. World Construction

### 3.1 环境与地形

负责定义可通行空间和宏观环境：

- 平面地形
- 高度图地形
- 程序化起伏地形
- 道路和路径
- 平台、坡道和边界
- 天空、雾和地平线语义
- 少量典型光照 preset

建议的基础光照 preset：

- `noon_hard`
- `overcast_soft`
- `sunset_side`
- `night_moon`
- `indoor_top`
- `neutral_flat`

当前室外 Alpha 实际公开的是 `clear-day / golden-hour / overcast / night`。上面的 `noon_hard` 等名称是目标方向，尚未作为现有 API 发布；`indoor_top` 要等室内阶段。

这些 preset 主要用于白膜可读性和向世界模型传达环境意图，不代表最终生成画面的固定光照。

### 3.2 标志物

使用基础几何体和低多边形组合表达关键空间结构：

- Box、Sphere、Cylinder、Cone、Plane
- 墙、门、平台、坡道
- 房屋、塔、桥、城门
- 复合几何和自定义低多边形 GLB

标志物至少具有：

- Transform
- 白膜几何
- 可选碰撞体
- 导航影响
- 语义名称
- 重要程度
- 世界模型外观描述

## 4. Subject Kits

面向 Agent 的核心抽象。每个主体套餐包含一套经过验证的完整体验：

```text
SubjectKit
├── Whitebox Model
├── Collider / Rigid Body
├── Input Mapping
├── Motion Controller
├── Default Camera Rig
├── Action Binding
├── Possession Rules
├── Semantic Identity
└── Render Binding
```

规划中的主体套餐：

| ID | 白膜 | 运动 | 默认镜头 |
|---|---|---|---|
| `humanoid.first_person` | 人形或简化手臂 | 走、跑、跳 | 第一人称 |
| `humanoid.third_person` | 骨骼人形 | 走、跑、跳 | 第三人称跟随 |
| `car.third_person` | 低多边形汽车 | 油门、刹车、转向 | 车辆跟随 |
| `horse_rider.third_person` | 马和骑手组合 | 走、小跑、奔跑 | 骑乘跟随 |

第一期只实现 `humanoid.third_person`。其他主体套餐属于第二期或更晚阶段。

后续候选：

- `animal.third_person`
- `flying.third_person`
- `swimming.third_person`
- `spectator.free_camera`

## 5. Control & Camera

### 5.1 控制链路

```text
Player Input
    ↓
Input Mapping
    ↓
Movement Intent
    ↓
Motion Controller
    ↓
Physics
    ↓
Transform + Action State
```

镜头不直接控制刚体，但可以参与解释输入方向：

- 第三人称人形通常相对镜头方向移动。
- 第一人称的视线与主体朝向高度一致。
- 汽车和马通常相对自身朝向运动，镜头可以独立观察。

内部应支持明确的方向参考：

```ts
type MovementReference = "camera" | "body" | "vehicle" | "world";
```

### 5.2 镜头

第一期：

- 标准第三人称跟随镜头

第二期再扩展第一人称镜头和其他主体所需的专用镜头。

内部能力：

- 鼠标/触屏旋转
- FOV
- 灵敏度
- 跟随目标和观察点
- 平滑与阻尼
- 镜头碰撞
- 第一/第三人称切换基础设施

## 6. Motion & Simulation

### 6.1 Motion Controller

```text
MotionController
├── HumanoidLocomotion
├── HorseLocomotion
├── VehicleController
├── AnimalLocomotion
└── GenericMotion
```

运动系统表达“希望如何移动”，物理系统决定“实际能够如何移动”。

### 6.2 Physics

建议基于 Rapier 接入：

- 静态、动态和运动学刚体
- 基础碰撞体与复合碰撞体
- 重力
- 地面检测
- 触发区域
- 射线检测
- 碰撞事件
- 后续主体所需的少量关节

### 6.3 Action

统一使用语义动作：

- `idle`
- `walk`
- `run`
- `jump`
- `drive`
- `ride`
- `attack`
- `hit`
- `interact`

动作可以绑定骨骼动画、程序动画或只作为世界模型条件输出。人形优先使用可绑定动作的标准白膜；其他主体可以先使用低多边形白膜和有限动作。

## 7. Gameplay

仅有可移动世界还不是游戏。以下是后续最低目标，当前仓库尚未实现：

- Trigger Zone
- Enter / Exit / Touch / Use
- 控制权切换和进入/离开载具
- Spawn / Respawn
- Timer
- Objective
- Win / Lose
- Game State 与变量
- Condition → Effect 规则

## 8. NPC

本模块尚未实现。下述内容是目标复用关系，不是当前公开 API。

NPC 与玩家复用相同主体套餐，区别仅在控制源：

```text
Player Input ─┐
NPC Behavior ─┼→ SubjectKit
Script ───────┘
```

后续阶段的候选行为：

- 移动到目标点
- 巡逻
- 跟随
- 逃离
- 追逐
- 看向目标
- 停留
- 播放动作
- 简单状态机

## 9. Agent Tooling

目标上为 Coding Agent 提供：

- 启动和热更新
- 结构化错误
- 场景截图
- 输入录制和重放
- 自动控制玩家执行测试路线
- 出生点与碰撞检查
- 地图可达性检查
- 摄像机遮挡检查
- 缺失语义检查
- 性能预算检查
- 世界 snapshot

Agent 默认只能修改游戏项目目录，不应修改 SDK 内部控制器实现。

当前已实现启动/热更新、结构化场景编译错误、截图、固定输入、出生点/坡度检查、资源所有权、预算、Feature 检查器和 world snapshot。完整可达性、镜头遮挡、语义与性能报告仍是后续工作。

## 10. Runtime World Director

这是后续的运行时 LLM 操作系统，不属于当前实现。严格说它由 SDK 外的 `Director LLM` 和 SDK 内的下列模块组成；LLM 负责理解/规划，SDK 负责观察、权限、校验和执行：

```text
Runtime World Director
├── Observation Service
├── Entity Resolver
├── Command Schema Registry
├── Capability / Policy Engine
├── Planner / Dry Run
├── Transaction Queue
├── Runtime Task Manager
└── Receipt / Event Log
```

目标上它支持受控的 Transform、生命周期、语义动作、NPC 导航、行为和后续 Feature 更新，但不逐帧驱动刚体。所有变更在固定 tick 边界提交，并同步更新物理、导航、渲染身份和 Render Bridge 状态。

纯视觉变化走独立 `Render Directive`；影响碰撞、导航、数量、动作或关键轮廓的变化必须走 `World Command`。完整方案见 [运行时世界导演与受控世界操作协议](09-runtime-world-director.md)。

## 11. Render Bridge

Render Bridge 当前只有[目标契约](04-render-contract.md)，尚未实现 Depth、Normal、Instance/Semantic ID、Motion Vector 或实时模型连接。世界模型团队的近期接入拆分见[接入说明](11-world-model-team-handoff.md)。
