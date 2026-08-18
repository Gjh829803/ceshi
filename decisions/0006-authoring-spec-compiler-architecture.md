# ADR-0006：AuthoringSpec 编译架构与 Babylon Runtime

- 状态：Proposed（随 `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` 评审一同定稿）
- 日期：2026-08-18

## 决策

SDK 的下一代架构采用「引擎无关协议 + 确定性编译 + 可替换 Runtime」：

1. 上游 Agent 的正式输出改为声明式 AuthoringSpec JSON，不再编写 TypeScript 场景代码。
2. SDK 通过 Schema 校验、Normalizer、Capability Resolver 和 Compiler 生成引擎无关的 NormalizedWorldIR 与可持久化 WorldPackage。
3. 第一版生产 Runtime 采用 Babylon.js 与 Havok 物理，经 Port 层隔离；公共协议不包含任何引擎类型。
4. 正式交付物是库 API、无状态 CLI、版本化 Browser Protocol 和 WorldPackage；增量修改使用带基线哈希的 WorldChangeSet。
5. 现有 Three.js/Rapier 实现降级为回归基准，在新 Runtime 通过全部 Production Gates 后移除或归档。

协议边界、确定性等级与阶段计划见总规格及其地形子规格 `2026-08-17-terrain-authoring-pipeline-design.md`。

## 原因

- 直接生成 TypeScript 场景代码无法静态校验、难以增量修改，也无法从机制上阻止 Agent 触碰引擎内部对象。
- 面向 AI 的协议必须可导出、可投影、可验证，这要求 Canonical Schema 与确定性编译，而不是代码约定。
- 当前 Core 已与 Three.js 类型耦合，继续演进会把引擎细节固化进公共 API。
- 可玩 Web 游戏需要的资源、骨骼动画、相机与调试基础设施在 Babylon 中更完整，避免继续自建引擎。

## 结果

- ADR-0001 的 Subject Kit 方向被继承为 AI-facing Kit 层。
- ADR-0004 与 ADR-0005 的原则（Plan-first、四类证据、角色分离、冻结门禁）由 AuthoringSpec、Evidence 分类、WorldChangeSet 与 Production Gates 继承；其具体载体（`plans/<catalog-id>.ts`、`plan-lock.json`、`agent:plan/build/visual` 脚本链）在总规格阶段 F 由新协议取代，届时两份 ADR 标记为 Superseded by ADR-0006。
- 迁移期间旧创作链路保持可用且只接收缺陷修复；切换点为总规格阶段 F，届时同步更新 `AGENTS.md` 与创作工作流文档。
- 生产 Agent 编排迁出本仓库，由独立仓库实现；本仓库保留 Fixture 与接入文档。

## 不采用的方案

- 继续在 Three.js + Rapier 上补齐引擎基础设施：复用最多，但需要长期自建资源、动画、场景与调试体系，且 Core 已被引擎类型污染。
- 直接暴露 Godot 风格节点树：无法表达 Capability、Possession、物理权威和动态 Relationship，容易把公共 Schema 绑定引擎。
- 新建第二个 SDK 仓库：割裂回归基准与 Golden Fixture，迁移期需要双向同步协议变更。
