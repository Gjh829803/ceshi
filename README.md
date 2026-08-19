# Agent Whitebox World SDK

一个面向 AI 的语义白膜游戏 SDK。当前同时保留 Three.js/Rapier Alpha 场景作为兼容回归样例，并已把 Canonical Authoring V1 扩展为 Registry-ready 的多主体链路：其他程序只需生成严格 JSON，就能校验、编译、运行、切换受控主体并截图一个带物理的室外白膜世界。

> 第一次阅读请从[项目总览](docs/00-project-overview.md)开始。它区分了当前实现、实验能力和后续规划；其他文档中的目标 API 不代表已经交付。

新程序接入请直接阅读 [Canonical JSON V1 快速接入](docs/17-canonical-json-quickstart.md)，并运行：

```bash
pnpm install
pnpm worldkit validate examples/authoring/multi-subject-world.json
pnpm worldkit run examples/authoring/multi-subject-world.json
```

用户通过一句话或图片提出创作需求，Planner、Builder 和 Visual Bible Agent 通过 SDK 工件接力生成世界；玩家操控确定性的 3D 游戏运行时；实时世界模型根据白膜、空间结构和语义条件生成最终视觉画面。

创作不再从“直接写几何”开始。World Planner Agent 先把输入扩展为可追踪的 `WorldSpec`、世界 Prompt 和 Entity Catalog，并用 Codex 内置图片生成能力制作严格俯视的世界规划图和进入视角构图图。规划被哈希冻结后，独立的 World Builder Agent 才实现白膜；SDK 再从真实白膜导出俯视图、高度/坡度图和每类实体的正/右/后三视图。最后由 Visual Bible Agent 生成匹配的样式三视图和渲染首帧。图片表达意图，`WorldSpec` 与白膜运行时共同约束真实空间。

## 核心定义

本项目不是完整传统游戏引擎，也不是让 Agent 在运行时控制角色。

它由三部分组成：

1. **多 Agent 创作层**：Planner 负责世界定义，Builder 负责白膜实现，Visual Bible 负责视觉条件；未来再扩展主体、NPC 和游戏规则。
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
- [能力分层与体验路线](docs/14-capability-levels-and-experience-roadmap.md)
- [自由世界特征扩展协议](docs/06-world-feature-system.md)
- [第一期 Alpha 实现与运行指南](docs/07-alpha-implementation.md)
- [Coding Agent 场景创作指南](docs/08-agent-scene-authoring.md)
- [运行时世界导演与受控世界操作协议](docs/09-runtime-world-director.md)
- [当前实验与验证记录](docs/10-current-experiments.md)
- [世界模型团队接入说明](docs/11-world-model-team-handoff.md)
- [Plan-first 世界创作协议](docs/12-plan-first-world-authoring.md)
- [多 Agent 世界创作流水线](docs/13-multi-agent-world-authoring.md)
- [Creator Studio：上传、生成与历史世界](docs/15-creator-studio.md)
- [主体资产与 3C 配置接入契约](docs/16-subject-assets-3c-integration.md)
- [Canonical JSON V1：AI/CLI 接入与运行指南](docs/17-canonical-json-quickstart.md)
- [架构决策：向 Agent 暴露主体套餐](decisions/0001-subject-kits.md)
- [架构决策：第一、二期范围](decisions/0002-phased-scope.md)
- [架构决策：Agent、Director 与 World Model 边界](decisions/0003-agent-director-world-model-boundaries.md)
- [架构决策：新场景采用 Plan-first 创作](decisions/0004-plan-first-world-authoring.md)
- [架构决策：分离 Planner、Builder 与 Visual Bible](decisions/0005-separated-planner-builder-visual-bible.md)

### 下一代架构规格与 V1 实现依据

以下文档描述 AuthoringSpec 编译架构与 Babylon Runtime 的长期目标。Canonical JSON V1 已交付其中的最小纵向切片；关系、规则、更多 Kit、资产系统与高级地形等仍是后续设计，不应误认为已经实现：

- [AI-first 白模游戏 SDK 设计评审简版](docs/reviews/2026-08-18-ai-first-sdk-design-review-brief.md)：面向团队评审的 10～15 分钟阅读稿，只保留关键设计、风险和待确认决策。
- [AI-first LEGO 游戏 SDK 总体设计](docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)：下一代总架构规格，含双层 AI API、引擎无关 IR、确定性编译与迁移阶段计划。
- [AI-first Terrain Authoring Pipeline 设计](docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md)：地形子规格，定义从生成式规划图到权威 Heightfield 的确定性编译链路。
- [可扩展主体组装 Authoring 专项设计](docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md)：定义自定义主体 Definition、实例化、自动 Collider、Capability 与类型化 Relationship 的长期扩展边界；讨论中的 `define / spawn / bind` 仅为概念操作名。
- [Package 局部 Subject Definition（S1a）设计](docs/superpowers/specs/2026-08-19-package-subject-definition-design.md)：冻结 Authoring V2、自定义 Primitive 白模、Socket、Collider 推导、Definition Hash、Resource Lock 与 Discovery/Explain 契约。
- [业界对照与可落地性核查报告](docs/superpowers/specs/2026-08-18-industry-alignment-and-feasibility-review.md)：评审支撑材料，含运行时选型核实、业界实践对照与 AI 友好性评估。
- [阶段 0 技术探针计划与外部资料核查](docs/superpowers/specs/2026-08-18-phase0-probe-plan-and-external-research.md)：协议冻结前的风险探针清单、判据与已定决策记录。
- [架构决策：AuthoringSpec 编译架构与 Babylon Runtime（Proposed）](decisions/0006-authoring-spec-compiler-architecture.md)：随总体设计评审一同定稿。

### 重构实施计划与进度

- [Canonical JSON Babylon V1 实施计划](docs/superpowers/plans/2026-08-18-canonical-json-babylon-v1.md)：已交付的第一条生产形态纵向切片，覆盖严格 JSON、NormalizedWorldIR、ExecutionPlan、Babylon/Havok、CLI、Browser Protocol 与 Playwright Gate。
- [Subject Foundation 可视切片 TODO](docs/superpowers/plans/2026-08-19-subject-foundation-visible-slice.md)：多主体、可注入 Definition Registry、自动 Collider、复数 Snapshot 与控制切换的实施与验收记录；顶部进度表和任务复选框是实施状态真相。

## 当前状态

Canonical Authoring V1 当前已经具备：严格 JSON Schema、语义校验、可注入主体 Definition Registry、确定性归一化与哈希、引擎无关的复数 `ExecutionPlanV2`、Babylon.js 白模渲染、每主体独立 Havok Controller、Heightfield/静态障碍物/角色碰撞、水域检测、第三人称镜头、原子控制切换、Browser Protocol V2，以及 `validate / build / run / capture` CLI。运行 `pnpm verify:v1` 可执行真实 Chromium 端到端验收；命令名中的 V1 指 Authoring 输入版本。

第一期 Alpha 已有可运行实现，但不等于第一期生产完成：

- `World / Entity / fixed timestep / Input / EventBus`
- Rapier 刚体、碰撞体、高度场与射线查询
- `humanoid.third_person` 主体套餐：WASD、走/跑/跳、动作状态、第三人称镜头与镜头碰撞
- 可绑定 Mixamo 骨架的白膜 GLB 加载；本地 Xbot 已验证 `idle / walk / run`
- 连续分块高度场；`flat / plain / hills / mountains` 预设；以及 Agent 可生成/导入的全局标量 Raster、可选 Mask、双线性采样和无缝跨 tile 投影
- 专用 WaterBody：连续岸带、湖底/水位语义、浅深水着色、菲涅尔和轻微波纹
- `FeatureRegistry`：schema、seed、预算、诊断、资源所有权、更新、重建和删除
- `defineOutdoorScene` 场景 DSL、通用运行时编译器、Agent 自定义 Feature、场景目录与可追踪的初始镜头构图
- `OutdoorWorldSpec / definePlannedOutdoorScene`：全世界拓扑、证据来源、进入视角、屏幕空间构图 Guide 和规划资产的可验证契约
- `WorldPromptBundle / Entity Catalog`：世界级渲染描述，以及主体、NPC、标志物、客体的 Prototype/Instance、唯一实例色和三视图契约
- `plan-lock.json`：冻结项目内参考图、WorldSpec 源码、World Plan 和 Opening Shot；Builder 前后都会检查漂移
- Codex 内置图片生成的 World Plan / Opening Shot，以及 SDK 从真实场景导出的 Top-down / Height-Slope 规划工件
- SDK 真实正交白膜三视图导出，以及 Visual Bible 输入/最终包校验
- `WASD / Shift / Space / ↑ / ↓`、相机相对移动、符合视线语义的上下视角、固定步长插值与防颠簸跟随
- 统一人形通行契约：42° 最大爬坡角、48° 自动滑落角、局部坡度查询和出生点坡度检查
- 可玩的 Vite Playground、世界检查器、截图、无 UI 的纯 WebGL 游玩录屏、固定输入 Smoke，以及语义构图 Mask / 区域 IoU / 实体屏幕锚点门禁
- 本地 Creator Studio：Prompt / 参考图上传、Codex 串行生成队列、持久化历史、日志、失败重试和白膜体验入口

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:5173/`。仓库不分发来源尚未确认的 Xbot；本地开发可按[运行指南](docs/07-alpha-implementation.md)链接自己的 Mixamo 兼容 GLB。没有本地资产时会明确显示无骨骼占位体，不会伪装成已绑定角色。

如需使用图形化创作入口，运行：

```bash
pnpm studio
```

然后打开 `http://127.0.0.1:4174/`。Studio 会同时保证 Playground 在 `http://127.0.0.1:5173/` 可用；现有已验证世界会自动进入历史列表，新任务的输入、状态与日志保存在 `apps/studio/data/worlds/`。

让 Agent 创作新场景时，优先分阶段执行并在 Planner 后人工评审：

```bash
pnpm agent:plan -- --scene-id <id> --image /absolute/reference.png "<场景描述>"
pnpm agent:build -- --scene-id <id>
pnpm dev  # 浏览器验收并导出白膜三视图
pnpm agent:visual -- --scene-id <id>
```

三个阶段遵守仓库根目录的 `AGENTS.md`，且无需改 SDK 内部。完整流程和能力边界见 [Coding Agent 场景创作指南](docs/08-agent-scene-authoring.md)与[多 Agent 世界创作流水线](docs/13-multi-agent-world-authoring.md)。

三个创作 Agent 都使用项目级 `whitebox_workspace_only` 权限 Profile：禁止读取其他用户目录、禁止网络、禁止权限升级。图片只允许传给 Planner；启动器把明确指定的文件复制到一次性隔离目录，不开放原目录。`pnpm agent:scene -- --scene-id <id> "<描述>"` 仍可连续运行 Planner 与 Builder，但内部是两次独立任务并带冻结门禁；Visual Bible 必须在浏览器白膜验收和三视图导出后单独运行。

测试数量以当前 `pnpm test` 输出为准；`typecheck`、生产构建和规划工件一致性均属于交付门禁。详细场景、近期反馈修正、自动验证边界和已知告警见[当前实验与验证记录](docs/10-current-experiments.md)。

Package 局部自定义主体 Definition、类型化 Relationship、坐骑/拖拽、装备、更多动作和室内搭建尚未开始；NPC、完整玩法、Render Bridge、实时世界模型和 Runtime World Director 均属于后续范围。当前 Quadruped 只是 Registry、白模组合和多 Controller 的代理验证。默认旧场景页面仍是本地 Three.js 白膜预览；`worldkit run` 启动的是 Babylon.js/Havok Canonical JSON 页面，两者都不是实时世界模型输出。
