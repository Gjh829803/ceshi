# Agent Whitebox World SDK

一个基于 Three.js 的语义白膜游戏 SDK。当前提供可运行的第一期 Alpha，目标是让 Coding Agent 根据一句话或图片创建可玩的室外白膜世界，并为后续实时世界模型提供确定性的空间、动作和语义条件。

> 第一次阅读请从[项目总览](docs/00-project-overview.md)开始。它区分了当前实现、实验能力和后续规划；其他文档中的目标 API 不代表已经交付。

用户通过一句话或图片提出创作需求，Coding Agent 使用 SDK 生成可玩的白膜世界；玩家操控确定性的 3D 游戏运行时；实时世界模型根据白膜、空间结构和语义条件生成最终视觉画面。

创作不再从“直接写几何”开始。Coding Agent 会先把输入扩展为可追踪的 `WorldSpec`，再用 Codex 内置图片生成能力制作一张严格俯视的世界规划图和一张进入视角构图图，随后实现白膜。SDK 从真实白膜反算俯视图与高度/坡度图，用于检查规划和实现是否一致。图片表达意图，`WorldSpec` 与白膜运行时共同约束真实空间。

## 核心定义

本项目不是完整传统游戏引擎，也不是让 Agent 在运行时控制角色。

它由三部分组成：

1. **Coding Agent 创作层**：当前根据用户输入编写室外场景；未来再扩展主体、NPC 和游戏规则。
2. **白膜游戏运行时**：当前负责镜头、输入、人形运动、物理和基础动作；未来扩展导航、玩法和更多主体。
3. **生成式渲染层**：未来把白膜世界实时转换为具有材质、光影和细节的最终画面，当前尚未接入。

白膜世界是游戏逻辑和空间关系的真实来源，生成式渲染层不负责决定碰撞、导航和玩法结果。

## 设计原则

- 面向 Coding Agent 提供少量、高层、稳定的 API。
- Agent 优先选择完整的主体套餐，而不是逐项配置相机、物理和动画。
- SDK 内部保持镜头、运动、物理、动作等模块解耦。
- 主体与客体使用相同 Entity 模型，区别来自控制权和能力配置。
- 影响移动、碰撞、遮挡、导航和关键轮廓的内容必须存在于白膜中。
- 材质、纹理、表面装饰、氛围和非关键细节交给生成式渲染层。
- 每个白膜实体具有稳定 ID、语义和外观绑定，供世界模型持续识别。

## 文档

- [项目总览：范围、状态与阅读顺序](docs/00-project-overview.md)
- [产品与系统边界](docs/01-product-definition.md)
- [SDK 总体架构](docs/02-sdk-architecture.md)
- [Agent-facing API](docs/03-agent-facing-api.md)
- [世界模型渲染契约](docs/04-render-contract.md)
- [MVP 范围与演进路线](docs/05-mvp-roadmap.md)
- [自由世界特征扩展协议](docs/06-world-feature-system.md)
- [第一期 Alpha 实现与运行指南](docs/07-alpha-implementation.md)
- [Coding Agent 场景创作指南](docs/08-agent-scene-authoring.md)
- [运行时世界导演与受控世界操作协议](docs/09-runtime-world-director.md)
- [当前实验与验证记录](docs/10-current-experiments.md)
- [世界模型团队接入说明](docs/11-world-model-team-handoff.md)
- [Plan-first 世界创作协议](docs/12-plan-first-world-authoring.md)
- [架构决策：向 Agent 暴露主体套餐](decisions/0001-subject-kits.md)
- [架构决策：第一、二期范围](decisions/0002-phased-scope.md)
- [架构决策：Agent、Director 与 World Model 边界](decisions/0003-agent-director-world-model-boundaries.md)
- [架构决策：新场景采用 Plan-first 创作](decisions/0004-plan-first-world-authoring.md)

## 当前状态

第一期 Alpha 已有可运行实现，但不等于第一期生产完成：

- `World / Entity / fixed timestep / Input / EventBus`
- Rapier 刚体、碰撞体、高度场与射线查询
- `humanoid.third_person` 主体套餐：WASD、走/跑/跳、动作状态、第三人称镜头与镜头碰撞
- 可绑定 Mixamo 骨架的白膜 GLB 加载；本地 Xbot 已验证 `idle / walk / run`
- 640m × 640m 连续分块高度场；`flat / plain / hills / mountains` 可玩性地貌预设；噪声、抬高、压低、平整、平滑、Circle、Ellipse、Polygon
- 专用 WaterBody：连续岸带、湖底/水位语义、浅深水着色、菲涅尔和轻微波纹
- `FeatureRegistry`：schema、seed、预算、诊断、资源所有权、更新、重建和删除
- `defineOutdoorScene` 场景 DSL、通用运行时编译器、Agent 自定义 Feature、场景目录与可追踪的初始镜头构图
- `OutdoorWorldSpec / definePlannedOutdoorScene`：全世界拓扑、证据来源、进入视角和规划资产的可验证契约
- Codex 内置图片生成的 World Plan / Opening Shot，以及 SDK 从真实场景导出的 Top-down / Height-Slope 规划工件
- `WASD / Shift / Space / ↑ / ↓`、相机相对移动、符合视线语义的上下视角、固定步长插值与防颠簸跟随
- 统一人形通行契约：42° 最大爬坡角、48° 自动滑落角、局部坡度查询和出生点坡度检查
- 可玩的 Vite Playground、世界检查器、截图与固定输入 Smoke API

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:5173/`。仓库不分发来源尚未确认的 Xbot；本地开发可按[运行指南](docs/07-alpha-implementation.md)链接自己的 Mixamo 兼容 GLB。没有本地资产时会明确显示无骨骼占位体，不会伪装成已绑定角色。

让 Coding Agent 创作新场景时，直接描述目标并要求它遵循仓库根目录的 `AGENTS.md`；它只需新增/修改 `apps/playground/src/scenes/`，无需改 SDK 内部。完整流程和能力边界见 [Coding Agent 场景创作指南](docs/08-agent-scene-authoring.md)。

场景 Agent 默认使用项目级 `whitebox_workspace_only` 权限 Profile：禁止读取其他用户目录、禁止网络、禁止权限升级。启动前可运行 `pnpm test:isolation` 验证，再用 `pnpm agent:scene -- --scene-id <catalog-id> "<场景描述>"` 启动。图片参考可追加 `--image /absolute/reference.png`；启动器只把明确指定的图片复制到一次性隔离目录，不会向 Agent 开放图片所在目录。只想先评审世界定义和两张规划图时可加 `--plan-only`。

测试数量以当前 `pnpm test` 输出为准；`typecheck`、生产构建和规划工件一致性均属于交付门禁。详细场景、近期反馈修正、自动验证边界和已知告警见[当前实验与验证记录](docs/10-current-experiments.md)。

第二期的其他主体、更多动作和室内搭建尚未开始；NPC、完整玩法、Render Bridge、实时世界模型和 Runtime World Director 均属于后续范围。Playground 当前显示的是本地 Three.js 白膜预览，不是实时世界模型输出。
