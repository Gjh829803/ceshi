# Agentic 白模世界到可控视频：开源方案调研与架构启示

- 性质：外部研究与架构评审支撑材料，不是权威协议规格。
- 日期：2026-08-19（外部项目状态以该日核实结果为准）。
- 研究对象：Agent 生成可执行 3D 白模世界，物理运行时产生结构控制信号，生成式视频模型完成最终视觉呈现。
- 对照规格：[`AI-first LEGO 游戏 SDK 总体设计`](./2026-08-17-ai-first-lego-game-sdk-design.md)、[`Terrain Authoring Pipeline`](./2026-08-17-terrain-authoring-pipeline-design.md)、[`可扩展主体组装 Authoring`](./2026-08-19-extensible-subject-authoring-design.md)、[`Placement Constraint / Layout Solver`](./2026-08-19-placement-constraint-layout-solver-design.md)、[`Simulation Take / Control Capture Bundle`](./2026-08-19-simulation-take-control-capture-design.md)、[`Validation Report / Quality Gates`](./2026-08-19-world-validation-report-and-quality-gates-design.md)。
- 当前实现边界：[`Canonical Authoring V2 / Runtime Protocol V3 快速接入`](../../17-canonical-json-quickstart.md)。

## 1. 结论摘要

1. **产品路线成立，并已有直接先例。** 2025–2026 年出现的 VideoCoCo、WorldClaw、PAT3D、SAGE、NVIDIA 3D Guided GenAI Blueprint 与 Cosmos Transfer 已分别验证“可执行白模承载物理/构图”“语义布局生成室外地形”“分阶段生成可模拟场景”“3D Depth 控制生成画面”“多控制通道生成视频”等关键环节。
2. **没有一个成熟开源项目覆盖完整链路。** 现有项目分别解决场景生成、场景表示、Agent 执行、实时模拟或生成式渲染；不能选择其中一个直接替代本 SDK。
3. **当前核心架构不需要推翻。** `AuthoringSpec → NormalizedWorldIR → ExecutionPlan → Runtime Adapter`、Registry/Lock、Definition/Instance/Relationship 分离、确定性编译和结构化 Diagnostic 均与外部最强实践一致。
4. **调研识别出三个应提前的一等协议，现已形成专项设计。** 一是 AI-facing 的空间放置约束与确定性 Layout Solver；二是独立于 WorldPackage 的 Simulation Take 与 Control Capture Bundle；三是统一量化 Metric、Evidence 和阻断策略的 Validation Profile/Report。三份文档已成稿待评审，实现仍未交付。
5. **不建议更换 Babylon + Havok。** Blender、Godot、O3DE、Habitat 和 OpenUSD 各有值得吸收的子系统思想，但没有证据表明它们更适合作为本项目的 Web 实时白模运行时。Blender 可作为未来离线 Provider，OpenUSD 可作为语义和交换格式参考。

本项目更准确的长期定位是：

> 面向 AI 的确定性世界编译器、可交互模拟运行时和生成式视频控制渲染器。

它不是简单的 Babylon 包装层，也不是让 Agent 直接操作通用 3D 编辑器。

## 2. 研究问题与评估方法

本次调研回答四个问题：

1. 是否已有“Prompt/图片 → Agent → 3D 世界”的开源系统；
2. 是否已有“低细节 3D/物理草稿 → 生成式最终视频”的公开系统；
3. 这些系统中哪些机制适合进入 SDK，哪些只适合上游 Agent 或离线工具；
4. 对照这些机制，当前 SDK 的长期设计还缺什么。

评估不以项目新旧或演示画面作为主要标准，而按以下维度判断：

- 中间表示是否显式、可校验、可编辑；
- AI 是否操作高层语义，而非直接猜底层引擎参数；
- 布局和物理是否由确定性工程模块兜底；
- 资产、实例、关系和运行状态是否分离；
- 是否支持反馈、局部修复、重放和来源追踪；
- 是否真正公开实现代码，以及实现是否达到可复用或生产依赖水平；
- 是否适合 Web、CLI、Playwright 和实时交互场景；
- 是否能稳定输出视频模型所需的结构控制信号。

外部项目按五层归类：

```text
Scene Planning / Generation
  Holodeck · ProcTHOR · Infinigen · WorldClaw · SceneCode · SceneWeaver
                    ↓
Scene Representation / Composition
  OpenUSD · Scene Graph · Registry · DSL · Prototype/Instance
                    ↓
Agent Operation / Repair
  Voyager · Mineflayer · Tool Cards · Skills · Diagnostics
                    ↓
Simulation / Control Rendering
  Babylon/Havok · Godot · O3DE · Habitat-Sim · Blender
                    ↓
Generative Visual Realization
  Cosmos Transfer · DiffusionRenderer · VideoCoCo · 3D Guided GenAI
```

没有单个项目同时覆盖这五层。本 SDK 的价值正是冻结层间协议，而不是把五层揉成一个巨大 Agent。

## 3. 原调研清单逐项评估

| 项目 | 实际解决的问题 | 最值得借鉴的设计 | 不适合直接照搬的部分 | 参考级别 |
|---|---|---|---|---|
| [Holodeck](https://github.com/allenai/Holodeck) | 自然语言生成可交互室内环境 | LLM 生成空间关系约束，工程求解器决定位置；资产检索与布局分离 | 固定于 AI2-THOR/Unity 与室内场景；仓库依赖锁定的旧 Unity/THOR 版本 | 战略参考 |
| [ProcTHOR](https://procthor.allenai.org/) | 大规模程序化生成可交互住宅 | 拓扑、结构、大型物体、表面物体和光照的分阶段生成；硬约束优先 | 规则和房间类型受限，面向训练数据而非开放世界 Authoring | 子系统参考 |
| [Infinigen / Infinigen Indoors](https://github.com/princeton-vl/infinigen) | 程序化自然/室内世界、资产工厂和约束布局 | Asset Factory、Recipe、配置、布局求解、内容生成与求解分离、导出到模拟器 | Blender 离线流水线较重；随机长尾资源消耗与 Web 实时运行目标不匹配 | 战略参考 |
| [Voyager](https://github.com/MineDojo/Voyager) + [Mineflayer](https://github.com/PrismarineJS/mineflayer) | LLM 通过高层 API 操作复杂开放世界 | 高层动作 API、技能库、执行反馈、错误修复、自验证 | 解决的是 Agent 操作已有 Minecraft，不是生成通用世界；技能编排属于上游 Agent | Agent 接入参考 |
| [O3DE White Box](https://www.docs.o3de.org/docs/user-guide/components/reference/shape/white-box/) | 在编辑器中快速制作代理 Mesh | 白模作为具有尺寸、碰撞和后续资产替换能力的正式组件；白模资产可复用 | 主要是人工编辑器工具，不提供 AI-friendly Schema、Compiler 或生成视频协议 | 局部参考 |
| [OpenUSD](https://openusd.org/release/intro.html) | 大型场景组合、覆盖、变体、实例和时间采样 | Layer、Reference、Payload、Variant、Prototype/Instance、Relationship、Instancing | 完整 USD 复杂度远超本 SDK 需要；不负责 Gameplay、物理语义和 AI Schema | 战略参考 |
| [Godot](https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html) | 开源游戏运行时、Node/Resource/PackedScene 与 Headless | 资源与实例分离、可保存场景、节点生命周期、Headless 运行 | Node 树不是 AI Schema；不能单独解决约束布局、确定性编译和视频控制通道 | 运行时对照 |
| [Habitat-Sim](https://github.com/facebookresearch/habitat-sim) | 高吞吐物理模拟和 RGB-D/Semantic 传感器渲染 | 多 Sensor 同步、SceneGraph 资源复用、RGB/Depth/Semantic、GPU Tensor 输出 | Authoring 能力弱，重点是 Embodied AI 吞吐，不是 Web 游戏或开放世界生成 | Capture 参考 |
| [Cosmos Transfer](https://github.com/nvidia-cosmos/cosmos-transfer2.5) | 多模态结构条件控制视频生成 | Depth、Edge、Segmentation、Visual Blur 的组合控制；JSON 化 Control Spec | Transfer1 已由 2.5 取代；模型接口不能反向污染 Canonical Authoring Schema | 下游契约参考 |
| [DiffusionRenderer](https://github.com/nv-tlabs/diffusion-renderer) | G-buffer 与 Lighting 驱动的生成式 Forward Rendering | Depth、Normal、Albedo、Roughness、Metallic、Lighting 作为更丰富控制面 | 当前仍是研究型离线视频框架，不是交互式游戏渲染器 | 下游契约参考 |

### 3.1 Holodeck 的核心启示：AI 生成关系，求解器生成坐标

Holodeck 的关键贡献不是“LLM 会写 Unity”，而是拒绝让 LLM 独自决定所有绝对位置。其公开论文说明：LLM 先产生 `near`、`in front of`、`on top of`、`face to` 等空间关系，再由 DFS 或 MILP 风格求解器满足碰撞、房间边界等硬约束；直接输出绝对坐标的对照方案更容易产生越界和碰撞。[论文方法与对照实验](https://arxiv.org/html/2312.09067)

这对当前 SDK 导出一个明确结论：

- AI-facing Authoring 不能长期只依赖最终 Transform；
- 应增加独立的 Placement Constraint 层；
- Solver 输出 Transform、求解报告和 Provenance；
- 求解失败应返回冲突约束与可执行修复建议；
- Placement Constraint 不能与运行时 Gameplay Relationship 混为一谈。

### 3.2 Infinigen 的核心启示：内容工厂与布局求解分离

Infinigen 把“如何生成一个床/树/地形材料”与“它应当出现在哪里”分成不同职责，并允许通过配置、Factory 和约束求解组织大场景。[官方仓库与文档](https://github.com/princeton-vl/infinigen)

本 SDK 对应关系是：

| Infinigen 思想 | 本 SDK 对应 |
|---|---|
| Asset Factory / Procedural Generator | Registry Definition / Geometry Recipe / 受信 Provider |
| Scene composition config | AuthoringSpec / AI Schema Profile |
| Constraint solving | 未来 Placement Solver |
| Blender scene | NormalizedWorldIR + ExecutionPlan + Runtime Adapter |
| Export to simulator | WorldPackage / 可选 OpenUSD 或资产导出 Adapter |

应吸收边界思想，不应把 Blender Node、随机执行代码或 Infinigen 配置格式直接暴露给 Agent。

### 3.3 OpenUSD 的核心启示：组合语义比父子节点更重要

OpenUSD 的 Layer、Reference、Variant 和 Instancing 解决的是大型内容如何复用、覆盖和按需加载，而不是 Gameplay。[OpenUSD Introduction](https://openusd.org/release/intro.html)

当前总设计采用 Prototype、Instance、Variant、Layer、Relationship 的有限子集是正确取舍。无需把 Canonical JSON 改成 USD，也不应让 USD Prim Path 成为业务 Entity ID。未来如需与 Blender、Omniverse 或资产团队互通，应通过 Export/Import Adapter 映射。

### 3.4 Habitat、Cosmos 与 DiffusionRenderer 的联合启示：白模输出不是一张截图

Habitat 证明高吞吐模拟可以把 RGB、Depth、Semantic 作为同步 Sensor；Cosmos Transfer 2.5 直接消费 Depth、Edge、Segmentation 和 Blur；DiffusionRenderer 则表明更丰富的 G-buffer 与 Lighting 可以提升生成式 Forward Rendering。[Habitat-Sim](https://github.com/facebookresearch/habitat-sim)、[Cosmos Transfer 2.5](https://github.com/nvidia-cosmos/cosmos-transfer2.5)、[DiffusionRenderer](https://github.com/nv-tlabs/diffusion-renderer)

因此长期 CapturePort 必须输出一个可验证的多通道 Bundle，而不只是 PNG：

- Neutral Color RGB；
- Linear Metric Depth；
- Semantic Class Mask；
- Stable Instance ID；
- World/View Normal；
- 可选 Motion Vector；
- 每帧 Camera Intrinsics/Extrinsics；
- Tick、Snapshot、Event、Action 与 Relationship Receipt；
- WorldPackage、Normalized IR、ExecutionPlan 与 Registry Lock Hash。

Edge 和 Blur 可以由权威通道确定性派生。Albedo、Roughness、Metallic 和 Lighting 应属于可选 Capture Profile，不进入所有世界都必须填写的 Authoring Schema。

## 4. 2025–2026 年更接近目标的公开项目

### 4.1 VideoCoCo：与“双引擎”产品链路最接近

[VideoCoCo](https://github.com/micky-li-hd/VideoCoCo) 的公开链路是：

```text
Prompt
  → Physical State Planner
  → Coding Agent 生成 Blender 模拟程序
  → 中性白色/黏土物理草稿视频
  → 物理过程检查
  → 视频编辑模型生成写实视频
```

它把物理过程和视觉实现交给两个专门引擎：可执行模拟负责因果、运动和遮挡，视频模型负责材质、光照和视觉感染力。仓库在 2026-07-29 公开了 Agent Skills、物理状态 Schema、Blender 实现指南、8 个玩具样例和推理补丁；其训练权重与部分组件仍受研究/上游模型许可证约束，不能视为生产 SDK。

对本项目的启示：

- 白模是可执行、可检查的时空控制表示，不是低质量最终画面；
- 物理世界与生成式视觉必须是两个明确边界；
- 当前 SDK 不应照搬“Agent 每次生成任意 Blender 代码”，而应让 Agent 生成受限 Schema；
- Blender 可作为未来离线复杂 Take Provider，但不替代 Web 实时 Runtime。

### 4.2 WorldClaw：与室外地形和区域化生成最接近

[WorldClaw 论文](https://arxiv.org/html/2608.05248v1) 采用 coarse-to-fine、global-to-regional 流程：

1. Intent Agent 只提取用户明确表达的事实；
2. Planning Agent 按预定义 Schema 补齐 Region、Terrain、Asset、Material 和 Spatial Relationship；
3. GPT-Image-2 生成使用离散颜色编码 Region 类别的 Semantic Layout Map；
4. 工程模块提取 Region Mask，并结合区域高度、噪声和 geomorphic operator 生成 Heightfield；
5. 可复用 Asset Prototype 按 Region、坡度和表面法线散布；
6. 重点 Region 单独生成局部构图、资产与位置；
7. Render-based Agent 修正比例、接触、穿插和局部地形问题。

这与本仓库的 Terrain 子规格高度一致，特别是“生成图只是不可信输入，最终固化为 Height Raster + Semantic/Constraint Mask”的原则。WorldClaw 还直接验证了先前提出的 Image 2 色带/语义图方案。

必须保留开源状态判断：截至核查日期，[WorldClaw GitHub](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw) 只有 README 和展示素材，没有实现源码；它是高价值研究依据，不是可以引入的开源依赖。

### 4.3 NVIDIA 3D Guided GenAI Blueprint：工程链路验证

[NVIDIA 3D Guided Generative AI Blueprint](https://github.com/NVIDIA-AI-Blueprints/3d-guided-genai-rtx) 使用 Blender 草模产生 Depth，再由 FLUX Depth 模型生成最终图像；其后续官方视频工作流继续使用 3D 场景生成首尾控制帧并交给视频模型。[官方视频工作流说明](https://www.nvidia.com/en-us/geforce/news/rtx-ai-video-generation-guide/)

它验证了三点：

- 生成式视觉不要求白模拥有高质量材质；
- 3D 相机、物体位置和遮挡能提供比纯 Prompt 更强的构图控制；
- 3D 控制与生成模型应通过适配工作流连接，而不是绑死在同一引擎内部。

该 Blueprint 的部分模型具有非商业或单独授权要求，因此只能作为技术验证和 Adapter 参考，不能直接决定生产模型选型。

### 4.4 SceneCode 与 Genie Sim：最接近世界编译器和 Registry

[SceneCode](https://github.com/wangpuyi/SceneCode) 将自然语言编译成可执行、可编辑的室内世界程序。它使用 Structured Layout、AssetRequest、Planner–Designer–Critic、Execution-guided Repair 和 Persistent Scene-state Registry，最终导出带碰撞、关节和物理元数据的模拟资产。

[Genie Sim](https://github.com/AgibotTech/genie_sim) 已公开以下链路：

```text
Natural Language
  → Asset Search
  → Scene-Language DSL
  → scene.usda + Relationship Graph
  → Isaac Sim / Robotics Runtime
```

这两者共同支持本仓库的 Compiler 取向：Agent 不应直接持有运行时对象；中间应存在结构化、可追踪、可局部修改的世界表示。但本 SDK 的生产边界应比研究项目更严格：任意 Python/Blender 程序只能出现在隔离的扩展制作流程，正式 WorldPackage 仍消费闭合 Schema、精确 Ref 和已锁定实现。

### 4.5 SceneWeaver、SceneSmith 与 EmbodiedGen：工具扩展和物理门禁

- [SceneWeaver](https://github.com/Scene-Weaver/SceneWeaver) 使用 Reason–Act–Reflect、Tool Card 和物理/视觉/语义评价循环，说明不同粒度生成工具应通过统一接口被 Agent 选择。但其公开实现仍要求修改固定工具列表，属于研究型扩展，不是生产 Plugin Registry。
- [SceneSmith](https://github.com/nepfaff/scenesmith) 强调对象独立、物理属性、碰撞、关节、稳定性检查、场景分支和多格式导出；其生成场景报告低碰撞率和物理稳定性，但仍以室内机器人模拟和重型 GPU 流程为主。
- [EmbodiedGen](https://github.com/HorizonRobotics/EmbodiedGen) 提供可插拔 3D 生成后端、自动物理属性、Collider、质量重试，以及向 SAPIEN、Isaac、MuJoCo、Genesis、PyBullet 等运行时导出。

适合吸收的是 Manifest、质量 Gate、可替换 Provider、失败重试与跨后端 Conformance；不适合把机器人模拟器格式或特定模型字段带入 AI-facing Schema。

### 4.6 PAT3D 与 SAGE：最新公开的物理布局和规模化 Agent Pipeline

[PAT3D](https://github.com/Simulation-Intelligence/PAT3D) 公开了一条分阶段的
Prompt-to-simulation Pipeline：参考图生成、Depth/Segmentation、物体与
Support/Containment 关系提取、资产生成、初始布局、低模模拟网格准备、物理模拟、
预览导出和指标评估。它还明确区分语义指标与物理指标，包括穿透三角形比例、模拟
后的异常位移，以及由视觉模型评估的接触、支撑、重力、浮空和穿插问题。

PAT3D 最值得吸收的不是 CUDA/Blender/特定物理后端，而是：

- 每个 Pipeline Stage 输出独立中间制品和状态；
- Support/Containment 等关系先于最终坐标；
- Simulation Preparation 是资产生成和运行时之间的正式边界；
- 物理正确性使用定量指标与阻断 Gate，而不是只看最终截图；
- Dashboard 可以检查阶段日志、制品和失败归属。

其完整环境依赖重型 Linux/CUDA、多个模型和特定物理 Wheel；部分模拟位移指标实现
仍需另行获取，因此适合作为 Solver、Artifact 和 Physics Gate 参考，不适合作为
本 Web Runtime 的直接依赖。

[SAGE](https://github.com/NVlabs/sage) 公开了面向 Embodied Task 的场景和动作生成
代码、Client/Server 分层、Foundation Model/资产生成服务、Scene Layout Solver、
Isaac Sim 接入以及 SAGE-10k 数据集。它证明了“任务描述 → Agent Pipeline →
布局求解 → 可模拟场景 → 动作数据”的规模化方向，并把布局级增强与任务关键物体
保持作为独立流程。

对本 SDK 的直接启示是：

- Authoring Pipeline 应有稳定 Job/Stage/Artifact 状态，而不是一次黑盒 Agent 调用；
- Placement Solver 和 Action/Take 需要独立协议；
- 场景生成、动作生成和 Runtime 执行可以共享锁定世界，但不能混成一个 JSON；
- Isaac Sim、TRELLIS 或具体 VLM/LLM 属于 Provider，不进入 Canonical Schema。

### 4.7 Scene Language、CubePart 与 Genie Sim：程序组合、部件语义和 Agent 工具面

[The Scene Language](https://github.com/zzyunzhi/scene-language) 使用程序表达精确
结构和复用，用自然语言与 Embedding 保留开放视觉语义，并从程序调用图导出层级
Part。它支持本项目的双层 Authoring 判断：AI-facing Kit/Definition 负责高层
组合，Normalized IR 保存展开后的确定结构。但该项目也公开说明 Prompt 小改动会
影响结果，因此任意可执行程序不能取代闭合 Canonical Schema、求解器和 Gate。

[Roblox CubePart](https://github.com/Roblox/cube) 根据用户给定的 Parts Schema 将
输入 Mesh 分解或生成成可独立寻址、能够重新组装的部件，并面向后续动画、物理和
行为脚本。这为本项目的 Visual Part、Socket、Pivot、Collider Policy 和
Capability 分离提供了新的外部证据，但不要求把模型生成方法放进 Runtime。

Genie Sim 的最新公开版本还提供 Agent-ready `SKILL.md`、统一 CLI、资产搜索、
相对 `attach/align` 操作、Scene-Language DSL，以及 `scene.usda + Relationship
Graph` 输出。应借鉴的是“先发现真实 Registry 资源、再组合、再编译和检查 Graph”
的工具面；不应照搬其可直接执行 Python、固定 Isaac/ROS 目录或 USD 业务 ID。

### 4.8 GPT4Motion 与 EgoSim：控制视频的历史先例与长时状态

[GPT4Motion](https://github.com/jiaxilv/GPT4Motion) 早于 VideoCoCo 公开了
“LLM 生成 Blender 物理脚本 → 渲染 Depth/Edge 序列 → ControlNet 视频生成”的
完整样例。它进一步证明白模输出应当是时间对齐的控制序列，而不只是单帧截图；但
任意 `bpy` 代码和固定 ControlNet 配置只能属于隔离实验 Provider。

[EgoSim](https://github.com/jinkun-hao/EgoSim) 使用初始 3D 状态、Action Sequence、
第一视角场景先验和手部骨架生成可控交互视频，并探索跨多个 Clip 更新 3D 场景状态。
当前训练与部分连续模拟流程仍处于发布中的研究状态，但它提示长期 Capture 协议需要
显式记录 Action、Camera、Scene State Revision 和 Clip 边界，避免多段视频之间的
世界状态漂移。

## 5. 对当前 SDK 长期设计的评审

### 5.1 应保持的核心决策

以下决策经本次外部调研后仍然成立：

1. Canonical Authoring、Normalized IR、ExecutionPlan 和 Runtime Adapter 四层分离；
2. AI 不直接操作 Babylon、Havok Handle、DOM、Mesh 或任意运行时对象；
3. Definition、Instance 和 Relationship 是独立概念；
4. Registry 使用精确版本、内容 Hash、Implementation Lock 和来源记录；
5. Package 局部 Definition 与宿主 Registry Definition 走同一 Normalizer/Compiler；
6. Gameplay Relationship 不以 RenderNode 父子关系为权威事实；
7. 固定 Tick、Snapshot、Receipt、Replay 和结构化 Diagnostic；
8. 图片生成的 Terrain/Region 图是不可信 Authoring Input，最终必须固化为可校验 Raster/Mask；
9. 下游模型通过 Adapter 消费运行时 Capture，不反向控制 Canonical Schema；
10. Babylon + Havok 是默认 Runtime，对外协议保持引擎无关。

### 5.2 必须新增的设计一：Placement Constraint 与确定性 Solver

当前 [`AuthoringSpec V2 Schema`](../../../packages/authoring/src/authoring-spec-v2.schema.json) 中的 `constraints` 仍是关闭未知字段的空保留对象，实例主要依赖最终 Transform。该方式可以支撑当前 S1a，但不足以让 AI 稳定搭建开放世界。

未来应增加独立的 Placement Constraint 判别 Union，至少覆盖：

- `inside-region` / `outside-region`；
- `distance-range`；
- `relative-direction`；
- `faces-entity`；
- `supported-by`；
- `minimum-clearance`；
- `connected-by-route`；
- `within-slope-limit`；
- `visible-in-camera-region`。

约束分为：

- **Required Constraint**：碰撞、边界、支撑、出生可达、路线坡度等，不允许静默违反；
- **Preferred Constraint**：靠近、朝向、构图偏好等，Solver 在无法全部满足时返回稳定评分与违反项。

权威边界必须是：

```text
Placement Constraint
  → 只解决“编译时怎样摆放”
  → Solver 产出 Transform + Provenance + Diagnostic

Gameplay Relationship
  → 表示“运行时两个 Entity 当前是什么关系”
  → 例如 mountedOn / equippedBy / towing
  → 必须保留状态、事务、事件与回放
```

两者不能复用同一个万能 `relationships` 数组，也不能根据字段名称隐式推断属于哪一类。

字段、求解 Pipeline、确定性、Report、Diagnostic 和首条 Fixture 已细化到
[Placement Constraint 与确定性 Layout Solver 专项设计](./2026-08-19-placement-constraint-layout-solver-design.md)，本文不再作为字段级协议真相。

### 5.3 必须新增的设计二：WorldPackage、Simulation Take 与 Control Capture Bundle 分离

当前总设计已经包含固定输入、Replay、Camera Path、Action Timeline 和 Capture Pass，但它们尚未组合成面向视频生产的独立制品。建议冻结三个对象边界：

```text
WorldPackage
  描述世界里有什么、实体能做什么、使用哪些锁定资源

SimulationTake
  引用一个 WorldPackage
  描述 Controller/Action/Input、Camera、Tick Range 和 Capture Schedule

ControlCaptureBundle
  引用一个 SimulationTake
  保存多 Pass 帧、相机参数、状态/事件轨和全部 Hash
```

约束：

- 同一个 WorldPackage 可以生成多个 Take，不因换镜头或换动作重新定义世界；
- Take 的时间使用固定 Tick，帧号必须显式映射到 Tick/Render Frame；
- Control Capture Bundle 不允许混入不同 WorldPackage、IR、Registry Lock 或 Session 的帧；
- 模型专属配置放在 `VideoModelAdapter`，不进入 WorldPackage；
- 生成式视频结果是派生 Artifact，不得反向成为 Gameplay 真相。

五层制品边界、固定 Tick、三种 Frame 计数、五个必需 Pass、Encoding Profile、
Bundle 目录与 CLI/Browser 协议已细化到
[Simulation Take 与 Control Capture Bundle 专项设计](./2026-08-19-simulation-take-control-capture-design.md)。

### 5.4 必须新增的设计三：Validation Profile、Report 与量化 Gate

仅写出“物理/构图/Capture 必须通过”不足以形成生产协议。阈值如果散落在测试、
Prompt 和 CI 中，或者只输出一个总体分数，Agent 无法稳定修复，关键失败也可能被
平均值掩盖。需要将以下对象提升为一等协议：

```text
ValidationProfile
  固定 Gate / Metric / 单位 / 阈值 / Evaluator / Platform Profile

ValidationReport
  针对单一 WorldPackage / Take / Bundle 输出不可变结果

GateResult + MetricResult + EvidenceArtifact
  保存逐项状态、实测值、阈值、证据、Diagnostic 和 Hash
```

`blocking` Gate 或 Required Metric 缺失必须阻断，不能由美学分数、VLM 判断或总体
评分覆盖。Physics 至少量化穿插、支撑、Settling 和可达性；Composition 对每个
Required Region/Anchor 单独阻断；Capture 验证 Pass、ID、Depth 单位、Camera、帧映射
和 Hash 归属。VLM/LLM 第一阶段只输出 Advisory Evidence。

完整 Profile/Report/Policy/CLI/Conformance 见
[World Validation Report 与质量门禁专项设计](./2026-08-19-world-validation-report-and-quality-gates-design.md)。

### 5.5 已有设计但尚未交付的关键部分

| 能力 | 长期设计状态 | 当前实现状态 | 后续要求 |
|---|---|---|---|
| Region/Semantic/Constraint Mask 地形 | Terrain 子规格已详细设计 | Canonical V2 仍是单一程序化 Heightfield | 实现内容寻址 Raster/Mask、Region Graph 与 Gate |
| 多 Pass Capture | 总规格已列 Color/Semantic/Instance/Depth/Collision Debug | Runtime Contract 当前主要暴露单一 `captureScreenshot()` | 冻结 Control Capture Bundle、Profile 与多帧输出 |
| Replay 与多 Controller | 总规格与 3C 文档已设计 | 当前 Host 只有一个默认 Controller 和固定输入 | 实现稳定 Take/Replay Log 与同 Tick Batch |
| Asset Subject / Animation / Relationship | Subject 专项设计已分期 | S1a 只实现 Primitive Subject Definition | 按 S1b/S2+ 门禁推进，不伪装已支持 |
| 受信 Plugin 与 Capability Registry | 总规格已定义原则 | 当前 Registry 内容仍是闭合集 | 冻结 Package、签名、Conformance 与发布流程 |

当前交付真相仍以 [`Canonical JSON 快速接入 §8`](../../17-canonical-json-quickstart.md#8-当前能力边界) 为准：室外 Heightfield、Primitive 静态物体、Primitive Subject、第三人称相机、基础移动/跳跃/碰撞/水域检测；GLB、动画、Relationship、动态 Spawn、NPC、车辆、飞行与第一人称均尚未交付。

### 5.6 自定义扩展应采用双通道

为了同时满足开放性、确定性和生产安全，扩展必须分成两条通道：

```text
内容级扩展
  WorldPackage 局部 Definition
  Geometry Recipe / Asset / Socket / Collider Policy / 已注册 Capability
  → 当前世界可直接使用

算法级扩展
  Agent 在隔离环境开发 SDK Plugin
  → Schema / Determinism / Resource / Replay / Performance Conformance
  → 签名并发布到受信 Registry
  → WorldPackage 只引用冻结版本
```

Agent 可以创造新能力，但“开发能力”和“在世界中使用能力”必须分开。Blender 官方 MCP 页面也明确警告其会直接执行 LLM 生成代码且没有保护措施，这适合作为隔离制作工具，不适合作为生产世界协议。[Blender MCP 官方说明](https://www.blender.org/lab/mcp-server/)

## 6. 推荐的目标架构

```text
Reference Image + Prompt
            ↓
External Planning Agent
  - facts / visible evidence / inferred continuation
  - region graph / placement constraints / selected definitions
            ↓
AI Schema Profile
            ↓
Canonical AuthoringSpec
            ↓
Schema Validation + Registry Resolution
            ↓
Placement Solver + Terrain Compiler
            ↓
NormalizedWorldIR + Provenance + Resource Lock
            ↓
ExecutionPlan / WorldPackage
            ↓
SimulationTake
  - fixed-tick control/action track
  - camera track
            ↓
Babylon Runtime + Havok Physics / RuntimeSession
  - event/relationship receipts
            ↓
ControlCaptureBundle
  - neutral color / linear depth / semantic / instance / world normal
  - camera matrices / tick mapping / snapshots / hashes
            ↓
ValidationReport
  - blocking gates / metrics / evidence
            ↓
Model Adapter
  - Cosmos Transfer
  - DiffusionRenderer
  - Seedance / other video editor
            ↓
Final Generated Video
```

横向基础设施：

- Definition/Capability/Relationship/Action Registry；
- WorldChangeSet 与局部重新编译；
- Diagnostic、Explain 与 AI 修复建议；
- Determinism、Physics、Composition、Capture 与 Resource Gates；
- WorldPackage 和 Plugin 的完整性、签名与许可证清单。

## 7. Runtime 与工具选型结论

### 7.1 保持 Babylon + Havok 为默认 Runtime

原因不是其渲染最精美，而是它满足当前产品边界：

- Web 原生运行与分发；
- CLI 启动和 Playwright 自动控制；
- 低细节场景快速加载与交互；
- 固定 Tick、Snapshot、截图和浏览器协议；
- 角色、Heightfield、碰撞和后续多 Pass Capture；
- 可以把实现隔离在 Runtime Adapter 后。

本次调研没有发现 Godot、O3DE、Habitat 或 Blender 能在这些约束下整体替代它。

### 7.2 Blender 作为未来可选离线 Provider

适用范围：

- 复杂程序化资产；
- 软体、流体、破坏等 Babylon/Havok 当前不支持或质量不足的有限 Take；
- 离线高质量控制 Pass；
- 资产编译、检查与 OpenUSD 导出。

Blender Provider 不能让 Blender 对象路径、`bpy` 代码或任意脚本进入 Canonical Authoring。它应消费冻结的中间协议，输出带 Hash 和 Provenance 的 Artifact。

### 7.3 OpenUSD 作为交换与组合语义，不作为 Gameplay Runtime

可选导出适合资产团队、Blender/Omniverse 和离线制作；内部 Entity ID、Capability、Relationship Transaction 与 Runtime Command 仍由 WorldKit 协议负责。

## 8. 推荐优先级

### P0：先证明产品闭环

完成一条端到端纵向切片：

```text
外部 Agent JSON
  → Region/Heightfield/Subject
  → 固定 Tick 移动与相机
  → Neutral Color + Linear Depth + Semantic + Instance + World Normal 视频
  → 量化 Validation Report
  → 一个下游 Video Model Adapter
  → 最终视频与结构一致性报告
```

该切片应优先于同时实现全部坐骑、装备、飞行和 NPC 行为，因为它直接验证产品核心假设。

### P1：冻结三个新协议

1. Placement Constraint / Layout Solver 专项设计；
2. Simulation Take / Control Capture Bundle 专项设计；
3. Validation Profile / Report / Quality Gates 专项设计。

三份设计都已成稿待评审，评审必须冻结 Schema、Hash、Diagnostic、CLI/Browser API、
Fixture 和 Conformance；设计完成不等于 Runtime 或生产能力已经交付。

### P2：落实已经设计的基础能力

- Terrain Raster/Mask/Region Graph；
- 多 Pass Capture；
- Asset Subject、动画和动作绑定；
- 类型化 Relationship 与事务；
- 多 Controller、Replay 和 Camera Take；
- 受信 Plugin 发布门禁。

### P3：建立外部方案 Bake-off

固定一组相同的 WorldPackage/Take/Control Capture Bundle，对 Cosmos Transfer、DiffusionRenderer 和其他候选视频模型比较：

- 构图与 Anchor 保持；
- Instance/Region 一致性；
- 运动、接触和遮挡一致性；
- 长视频漂移；
- 多镜头主体身份一致性；
- 失败可诊断性；
- 推理资源和延迟。

成本不是当前首要指标，但资源数据必须记录，避免选择只能在实验室运行的链路。

## 9. 冻结判断与非判断

本报告支持冻结：

1. 双引擎方向：确定性模拟负责结构和物理，生成式模型负责视觉实现；
2. Babylon + Havok 继续作为默认 Web Runtime；
3. Canonical Schema、IR、Compiler、Registry 和 Adapter 分层继续保持；
4. Image 2 语义/色带图可以作为 Terrain Authoring 输入，但必须工程化固化；
5. Placement Constraint/Layout Solver、Simulation Take/Control Capture Bundle 和 Validation Profile/Report 应成为一等协议；
6. 下游视频模型通过 Adapter 接入；
7. 任意引擎代码只能存在于隔离扩展制作流程，不进入世界 JSON。

本报告不冻结：

- 新协议的最终字段名和版本号；
- Cosmos、DiffusionRenderer、Seedance 或其他模型的生产选型；
- Blender Provider 的实施时间；
- OpenUSD 是否成为第一期导出格式；
- Relationship、坐骑、装备和飞行的具体阶段顺序。

## 10. 主要外部依据

- [Holodeck: Language Guided Generation of 3D Embodied AI Environments](https://arxiv.org/html/2312.09067)
- [ProcTHOR](https://procthor.allenai.org/)
- [Infinigen](https://github.com/princeton-vl/infinigen)
- [Voyager](https://github.com/MineDojo/Voyager) / [Mineflayer](https://github.com/PrismarineJS/mineflayer)
- [O3DE White Box Component](https://www.docs.o3de.org/docs/user-guide/components/reference/shape/white-box/)
- [OpenUSD Introduction](https://openusd.org/release/intro.html)
- [Godot Resources / PackedScene](https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html)
- [Habitat-Sim](https://github.com/facebookresearch/habitat-sim)
- [Cosmos Transfer 2.5](https://github.com/nvidia-cosmos/cosmos-transfer2.5)
- [DiffusionRenderer](https://github.com/nv-tlabs/diffusion-renderer)
- [VideoCoCo](https://github.com/micky-li-hd/VideoCoCo)
- [WorldClaw paper](https://arxiv.org/html/2608.05248v1) / [public repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw)
- [NVIDIA 3D Guided Generative AI Blueprint](https://github.com/NVIDIA-AI-Blueprints/3d-guided-genai-rtx)
- [SceneCode](https://github.com/wangpuyi/SceneCode)
- [Genie Sim](https://github.com/AgibotTech/genie_sim)
- [SceneWeaver](https://github.com/Scene-Weaver/SceneWeaver)
- [SceneSmith](https://github.com/nepfaff/scenesmith)
- [EmbodiedGen](https://github.com/HorizonRobotics/EmbodiedGen)
- [PAT3D](https://github.com/Simulation-Intelligence/PAT3D)
- [SAGE](https://github.com/NVlabs/sage)
- [The Scene Language](https://github.com/zzyunzhi/scene-language)
- [Roblox Cube / CubePart](https://github.com/Roblox/cube)
- [GPT4Motion](https://github.com/jiaxilv/GPT4Motion)
- [EgoSim](https://github.com/jinkun-hao/EgoSim)

外部项目会继续演进。后续若据此冻结公共协议，应重新核实模型版本、仓库代码完整度、许可证、权重条款和生产运行要求，不能把本报告中的时间点事实当作永久契约。
