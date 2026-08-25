# 分期范围与演进路线

> 路线图只表达范围和顺序，不代表全部模块已经实现。当前事实以[项目总览](00-project-overview.md)和[实验记录](10-current-experiments.md)为准。
> 可执行任务、加权进度、依赖和完成证据统一查看[重构总进度与 Backlog](18-refactor-progress-and-backlog.md)。

面向产品体验的简明版本见[能力分层与体验路线](14-capability-levels-and-experience-roadmap.md)。本文继续保留工程范围和模块拆分。

## 当前进度摘要（2026-08-23）

> Golden Humanoid 与首个产品 G Bot 的 S1b 可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.

| 工作流 | 状态 | 说明 |
|---|---|---|
| Phase I：第三人称人形 + 室外搭建 | Alpha 收敛中 | 主链路可运行；资产/动作 QA、视觉回归、手感和更多图像场景仍需收敛 |
| Subject Authoring S1a | 已完成 | AuthoringSpec V4、Registry/Package Primitive Definition、自动 Capsule、Hash/Lock、复数实例、CLI Explain；Browser Protocol V5 通过当前合同提供对应能力，不保留旧版本别名 |
| Subject Authoring S1b | Golden + 首个产品切片已完成 | 项目自有 Golden 与产品 G Bot 的 GLB、Rig、Collider Profile 与 `idle/walk/run/jump` 已通过 Canonical Babylon/Havok E2E；更多产品资产、Compound Collider、LOD 和更多动作/拓扑仍开放 |
| M5 Route Graph / Traversability | R1 Heightfield 已完成 | Authoring V4 Golden/Adversarial Fixture、双 Blocking Gate、真实 Babylon/Havok Probe 与 `pnpm verify:route-r1-heightfield` 已进入回归；R1b 与 M5 总验收仍开放 |
| Phase II：更多主体/动作 + 室内 | 未开始 | 优先级尚未冻结 |
| World Model Integration | 契约设计 | 尚无 Render Bridge 实现，可立即与模型团队开始 WM-0/WM-1 |
| Runtime World Director | 方案完成 | 尚无运行时代码；依赖稳定 Entity/Action/Nav 等能力 |
| Gameplay/NPC | 未开始 | 不属于当前 Alpha |

## 第一期：第三人称人形与室外自由搭建

第一期只验证两件事：

1. SDK 能否提供稳定、可复用的第三人称人形主体。
2. Coding Agent 能否自由创建可追踪的室外开放白膜世界。

### 1. 第三人称人形主体

- `humanoid.third_person`
- 可绑定骨骼和动作的标准人形白膜
- 胶囊碰撞体与基础地面检测
- WASD 镜头相对移动
- 走路、跑步，按实现需要加入跳跃
- `idle`、`walk`、`run`，按实现需要加入 `jump`
- 基础动作状态切换和混合
- 标准第三人称跟随镜头
- 镜头旋转、距离、阻尼和基础碰撞

第一期不实现第一人称、车辆、骑马、动物或飞行主体。

当前实现说明：Canonical Babylon 路径的项目自有 Golden GLB 与首个产品 G Bot 已验证
`idle / walk / run / jump`、固定 Tick 动作状态、Havok 位移、墙体碰撞与双实例隔离。
Catalog、artifact-only 和 Canonical Authoring 页面现在都由 Babylon/Havok 承载；首个产品
资产通过不代表后续产品资产已验收。

### 2. 室外自由地形搭建

“自由”不表示 SDK 预置所有山川湖泊，而是提供一组可组合、确定性、可追踪的空间操作：

- 创建高度场
- 局部抬高和压低
- 平整、平滑与噪声扰动
- 使用 Circle、Ellipse、Polygon 定义区域；Curve 和通用 SDF 是后续扩展
- 创建地面、水面和其他基础表面
- 生成与地形一致的碰撞
- 标记表面和区域语义
- 使用种子保证可重现

Coding Agent 可以通过 `defineWorldFeature` 自行定义湖泊、山脉、峡谷、道路等世界特征。SDK 官方只提供少量参考实现和常用快捷入口。

### 3. 标志物搭建

- Box、Sphere、Cylinder、Cone、Plane
- Transform、层级与组合
- 低多边形自定义 Mesh 或受控 GLB 导入
- 可选碰撞体
- 稳定 Entity ID
- 语义和外观描述
- Feature 所有权与资源追踪

标志物以室外开放场景中的大型空间锚点为主，例如塔、桥、城门、巨石和简化建筑体块，不追求内部结构和精细家具。

### 4. 必要运行时底座

这些不是独立产品能力，但属于上述两项目标的必要支撑：

- World、Entity、Transform
- 固定更新循环
- 输入系统
- Babylon 场景同步
- Havok 物理同步
- Asset Registry
- Feature Registry
- 创建、更新、删除和重建 Feature
- 资源预算和结构化错误
- 基础调试显示、截图和自动验证

### 5. 第一期验收案例

Coding Agent 在不修改 SDK 内部代码的前提下完成：

> 创建一个山峦起伏的室外草地，中间有一个大湖，远处有几何体组合形成的高塔；玩家使用可绑定动作的第三人称人形白膜在场景中走路和跑步。

验收要求：

- 地形、湖泊和高塔都能追踪到各自的 Feature 定义、参数和输出资源。
- 同一随机种子可以重建相同世界。
- 玩家不会穿地，并能稳定上下坡。
- 人形动作与移动状态一致。
- 镜头在室外场景中稳定工作。
- Agent 可以修改湖泊或高塔参数并只重建相关 Feature。

### 6. M5 Route Graph / Traversability R1

M5 的目标不是让 AI 编写 NavMesh，而是让 AI 继续使用 Route、Anchor、Subject 和
`connected-by-route` 表达意图；SDK 根据锁定主体能力和世界物理真相证明路线是否真的
可走。当前 R1 Heightfield 已完成：

1. Canonical Authoring V4 → NormalizedWorldIR V4 → ExecutionPlan V5；
2. `@whitebox-world/world-package` 生成最小正式 Package Root/Build Receipt；
3. Validation Subject 绑定同一组五个权威 Hash；
4. Recast 只作为 Provider Adapter 构建 Graph/Path；
5. 真实 Babylon/Havok `NullEngine` Character Controller 做固定 Tick Probe；
6. CLI 发布 Canonical Evidence/Report，可信 Host 向 Browser Protocol V5 注入只读投影；
7. 11 个 Authoring V4 Golden/Adversarial Fixture 与 `pnpm verify:route-r1-heightfield` 进入回归。

终审见 [R1 Heightfield Runtime Review](reviews/2026-08-22-route-r1-heightfield-runtime-review.md)。
R1b 静态平台/Collider Subshape 合同与完整 M5 仍开放。

## 第二期：扩展主体、动作与室内搭建

进入第二期前，主体 Authoring 已先完成 S1a 基础：AI 可以定义 Package 局部
Primitive 白膜主体并生成多个独立实例，SDK 负责 Collider、Profile、Hash、
Lock、物理与控制。该能力证明了“Definition 与 Instance 分离”的 LEGO 边界，
但不代表以下二期能力已经交付。

### 1. 主体扩展

候选方向：

- 第一人称人形
- 汽车
- 骑马组合主体
- 动物
- 飞行主体

具体优先级在第一期完成后确定。

主体演进按独立 S 阶段推进：

1. **S1b**：Golden 与首个产品 G Bot 的 GLB/Asset Part、Rig、Animation 与 Capsule
   Profile 纵向切片已完成；Compound Collider、LOD、更多 Profile/拓扑、独立动画
   资产与后续产品资产验收继续开放。
2. **S2**：类型化 Relationship、Socket 对齐、事务、Receipt 与回滚。
3. **S3**：坐骑、拖拽、控制上下文与安全解绑。
4. **S4**：飞行、装备和 Action Variant/Animation Binding。

### 2. 动作扩展

- 更多人形动作
- 主体专属动作
- 动作状态机扩展
- 动作混合与配对动作
- 主体和动作的标准绑定协议

### 3. 室内搭建

- 房间、墙、地板和天花板
- 门、窗口、楼梯和走廊
- 房间连接关系
- 紧凑空间镜头处理
- 室内碰撞和分区
- 室内标志物与低模结构

室内系统不假定为室外 Terrain 的简单延伸，需要单独讨论空间拓扑、房间连接和镜头问题。

## 其他后续待定

除下方两个独立工作流外，以下内容暂不排入第一、二期承诺：

- NPC 战斗、复杂群体行为和大规模 AI（基础导航与简单行为纳入 D-B）
- 完整交互、任务、胜负和玩法框架
- 车辆与骑乘的进入/退出流程
- 大型开放世界流式加载
- 多人联网
- UI 与音频
- 复杂布料、破坏和高级物理
- 完整可视化编辑器

这些方向保留在总体架构中，但只有后续明确目标后才进入开发计划。

## 后续工作流 A：World Model Integration

该工作流可以与第一期收敛并行开始，不需要等待 Phase II：

1. **WM-0 契约冻结**：坐标、相机、深度、ID、tick/revision 和动作语义。
2. **WM-1 离线导出**：Whitebox RGB、Depth、Instance ID、Camera、Entity Manifest、Action State。
3. **WM-2 实时接入**：异步条件提交、生成帧回传、过期帧处理、降级与显示合成。
4. **WM-3 视觉指令**：Render Directive、Appearance Manifest 和运行时风格/天气变化。

完整交接和双方待决问题见[世界模型团队接入说明](11-world-model-team-handoff.md)。

## 后续工作流 B：Runtime World Director（已规划、未承诺排期）

第一期不实现，但将它作为正式后续模块规划：让运行时 LLM 根据用户需求，通过受控协议修改
世界，而不是重新运行 Coding Agent 或直接操作 Babylon/Havok Provider 对象。

建议分三步：

1. **D-A 协议与瞬时操作**：Observation、world revision、dry-run/commit、回执、权限、Transform、统一缩放、spawn/suspend/despawn、日志与重放。
2. **D-B 动作和 NPC 任务**：ActionRegistry 工具化、NavMesh、goTo/follow/patrol/lookAt、任务生命周期和简单行为。
3. **D-C 世界级编排**：多步 WorldPlan、Feature 更新、组操作、环境/镜头编排、冲突与撤销。

所有阶段都保持双通道：逻辑相关变化走 `World Command`，纯视觉变化走 `Render Directive`。详细协议见 [运行时世界导演与受控世界操作协议](09-runtime-world-director.md)。

## 第一期建议实现顺序

1. 定义 World、Entity、SubjectKit、WorldFeature 和资源所有权协议。
2. 实现固定更新循环与 Babylon/Havok 同步。
3. 实现标准骨骼人形白膜和第三人称控制。
4. 绑定少量基础动作并完成状态切换。
5. 实现 Shape、Terrain、Surface 和 Geometry 基础操作。
6. 实现 Feature Registry、确定性种子、重建和清理。
7. 用扩展协议实现官方起伏地形、湖泊和高塔示例。
8. 加入 Agent 项目模板、结构化错误、截图和自动验证。
