# 项目总览：我们正在做什么

> 本文是项目范围和交付状态的唯一入口。架构细节分散在其他文档中；当表述冲突时，以本文和已接受的 ADR 为准。

## 1. 一句话定义

这是一个面向创作 Agent 的 Three.js 白膜世界 SDK：用户用一句话或图片描述世界，Planner 定义完整世界，Builder 编写受追踪的场景代码，Visual Bible 定义最终视觉条件；玩家在确定性白膜运行时中操作，未来实时世界模型再把白膜条件渲染成最终画面。

系统同时规划另一条运行时链路：Director LLM 可以理解用户在游玩过程中的指令，但只能通过 SDK 的受控命令和任务接口修改世界。

## 2. 四个角色与唯一世界真相

```text
创作期
用户文本/图片 → Planner → 冻结 WorldSpec/规划图 → Builder → 创作 SDK → 白膜运行时
                                                                  ↓
                                        白膜三视图 → Visual Bible → 视觉条件

运行期
用户指令 → Director LLM → Director SDK → 白膜运行时
玩家输入 ─────────────────────────→ 白膜运行时

渲染期
白膜运行时 → Render Bridge → 实时世界模型 → 最终画面
Director LLM → Render Directive SDK ────────────┘
```

| 角色 | 负责什么 | 不负责什么 | 当前状态 |
|---|---|---|---|
| Planner / Builder / Visual Bible | 分别定义世界、实现可版本化白膜、生成视觉条件 | 不跨越冻结边界，不参与每帧控制，不绕过 SDK 改 Three.js/Rapier | 多 Agent Alpha 可用 |
| 白膜 World SDK | 世界构建、主体、镜头、运动、物理、动作和确定性状态 | 不生成最终高质量视觉 | 第一期 Alpha 可运行 |
| Director LLM + Director SDK | 运行时理解意图，并通过观察、命令、任务和回执受控改世界 | 不逐帧驱动刚体，不直接拿底层对象 | 仅完成方案设计 |
| 实时世界模型 | 根据白膜条件生成材质、光影、天气、风格和视觉细节 | 不决定位置、碰撞、导航、数量和玩法结果 | 尚未接入 |

白膜运行时是唯一世界真相。凡是影响位置、数量、碰撞、导航、遮挡、动作、关键轮廓或玩法结果的变化，都必须先在白膜世界提交。

## 3. 当前真正可运行的范围

第一期 Alpha 已证明以下链路可以运行：

- 一个第三人称人形主体：WASD 镜头相对移动、跑步、物理跳跃、第三人称镜头和碰撞。
- 本地 Mixamo 兼容骨骼 GLB 的 `idle / walk / run` 动作绑定；没有本地资产时显示明确占位体。
- 室外高度场场景：连续分块地形、四种 relief、局部塑形、湖泊/水体、复合几何标志物。
- 可追踪的 `WorldFeature`：稳定 ID、schema、seed、依赖、资源所有权、预算、诊断、重建和清理。
- `defineOutdoorScene` 场景 DSL、场景目录、Playground、检查器和固定输入 Smoke API。
- `OutdoorWorldSpec`、WorldPrompt、Entity Catalog、两张 Codex imagegen 规划图、冻结锁、SDK 派生的俯视/高度坡度工件，以及规划和白膜的一致性检查。
- SDK 从真实实体导出的唯一颜色白膜三视图，以及 Visual Bible 输入/最终包门禁。
- 三个创作 Agent 的 workspace 隔离入口，以及仅向 Planner 开放的受控图片输入入口。

当前的“自由创造”严格指室外高度场白膜世界，不等于任意 3D 游戏类型。洞穴、倒悬结构、完整室内、车辆、骑乘、动物、NPC、寻路、Gameplay、联网、Render Bridge、实时世界模型和 Runtime Director 都尚未实现。

## 4. 当前交付不能被误解为完成的部分

- 物理跳跃已经存在，但 `jump` 骨骼动作尚未绑定和视觉验收。
- WaterBody 是白膜水体与基础本地预览，不是最终生成式水面。
- 图片可以传给 Coding Agent，但单张透视图只能重建可见构图与合理的可玩延伸，不能恢复唯一真实三维几何。
- World Plan 和 Opening Shot 是创作意图，不是碰撞或高度真相；高度、坡度、可通行性必须从实际白膜计算。
- Playground 目前只显示 Three.js 本地白膜预览，没有实时世界模型参与。
- `mistbound-rider` 中的马和骑手是静态标志物，用于测试构图；它不是可骑乘主体。
- 现有自动测试覆盖编译、资源归属、物理高度场和固定步长等工程契约；固定输入 Smoke 目前通过 Playground 按钮/API 手动触发，尚未纳入浏览器 E2E。两者都不能代替运动手感和图像构图的人工验收。

## 5. 工作分期

### Phase I：第三人称人形与室外自由搭建

当前处于 Alpha 收敛阶段。剩余重点是人形资产合规与动作 QA、移动/镜头手感回归、更多图片参考场景、地形与水体视觉/物理边界验证、性能预算和稳定的 Agent 验收闭环。

### Phase II：更多主体、动作与室内

候选包括第一人称、人形动作扩展、车辆、骑乘、动物，以及独立的室内空间与紧凑镜头方案。具体顺序尚未确定。

### 后续独立工作流

- **World Model Integration**：实现 Render Bridge、条件缓冲、异步生成与显示合成。
- **Runtime World Director**：实现观察、实体解析、权限、dry-run/commit、任务、日志与回执；后续再接动作、NPC 和导航。
- **Gameplay/NPC**：触发器、规则、目标、导航和行为，不假装属于当前 Alpha。

这些是相互依赖但不应被强行命名为同一个“第三期”的工作流。World Model 团队可以现在就对齐契约和样例，不必等待 Phase II 完成。

## 6. 阅读顺序

1. 本文：范围、角色、状态和分期。
2. [当前实验与验证记录](10-current-experiments.md)：代码现在实际能做什么。
3. [第一期 Alpha 实现与运行指南](07-alpha-implementation.md)：如何运行。
4. [Coding Agent 场景创作指南](08-agent-scene-authoring.md)：如何创建新场景。
5. [Plan-first 世界创作协议](12-plan-first-world-authoring.md)：如何从输入得到可追踪世界和规划工件。
6. [多 Agent 世界创作流水线](13-multi-agent-world-authoring.md)：三个 Agent 的权限、工件和门禁。
7. [能力分层与体验路线](14-capability-levels-and-experience-roadmap.md)：SDK、World Model 和玩家体验如何逐级增长。
8. [SDK 总体架构](02-sdk-architecture.md)：目标模块和实现状态。
9. [世界模型团队接入说明](11-world-model-team-handoff.md)：双方边界与近期接口工作。
10. [运行时世界导演方案](09-runtime-world-director.md)：后续受控世界操作协议。
