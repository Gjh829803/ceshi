# Babylon Alpha 实现与运行指南

> 本文记录当前唯一的 Babylon/Havok 白膜 Runtime 与 catalog 场景工作流。Canonical
> Authoring 输入和 Browser 协议以
> [Canonical Authoring V4 快速接入](17-canonical-json-quickstart.md)为准；本文不定义第二套
> Schema 或 Gameplay 真相。

## 1. 当前运行链路

```text
OutdoorWorldSpec / AuthoringSpec V4
  -> NormalizedWorldIR V4
  -> ExecutionPlan V5 / RuntimeWorldConfiguration V1
  -> BabylonWorldAdapter + Havok
  -> Gameplay / Opening Composition / Planning Capture / Whitebox Tri-view
```

Babylon 拥有场景、相机、资产、动画与渲染资源；Havok 拥有碰撞、支撑和 Character
运动。统一 Canonical Viewer 与内部 artifact-only 捕获使用相同的 Authoring/Compiler 和
Babylon/Havok 边界；旧 catalog-gameplay 已删除，不允许场景模块直接创建 Provider 对象或
维护备用状态。

`@whitebox-world/camera` 已提供 provider-neutral 的命名 Camera Rig/Modifier/Context Profile、
View Preference、纯 Selection/Explain 和诊断。它还没有接入 committed Gameplay Context
Projection、Browser preference 命令或 Babylon CameraDirector 的最终 Pose 流程，因此不能把
第一人称、飞行跟随或按场景自动切换视角描述成已交付 Runtime 能力。

## 2. Canonical Authoring Runtime

要求 Node.js 20+ 与 pnpm 10+：

```bash
pnpm install
pnpm worldkit validate examples/authoring/package-subject-world.json --json
pnpm worldkit run examples/authoring/package-subject-world.json
```

`worldkit run` 负责把一个 AuthoringSpec 固定到统一 Viewer，并发布
`window.__WORLDKIT__` Browser Protocol V5。旧 `?authoring=1` 路由已删除。

查看 G Bot：

```bash
pnpm dev
```

依赖切换后若浏览器报告 `504 Outdated Optimize Dep`，停止旧服务并只运行一次：

```bash
pnpm dev:refresh
```

## 3. Babylon/Havok Viewer

```bash
pnpm dev
```

打开 `http://127.0.0.1:5173/`。默认是 G Bot `feel-flat`；页面选择器可切换
allowlisted Canonical 调试预设。`worldkit run` 与 Studio Preview 复用同一页面壳并固定
自己的 Canonical 来源。规划/三视图的 trusted artifact capture 仍是独立内部证据能力。

场景页面可通过 `window.__WHITEBOX_PLAYGROUND__` 暴露有界的自动化能力，例如 Snapshot、
Feature inspection、固定输入和截图。它是 catalog/制品工作流的测试面，不替代
`window.__WORLDKIT__` 的 Canonical Browser 合同。

常用门禁：

```bash
pnpm test:scenes
pnpm typecheck
pnpm build
pnpm verify:scene-viewer
```

## 4. Plan-first 场景与制品合同

Plan-first 工作流继续保留以下权威工件：

1. `apps/playground/src/scenes/plans/<catalog-id>.ts` 中完整的 WorldSpec、WorldPrompt、
   Entity Catalog 和 Opening Shot；
2. Codex imagegen 生成的 `world-plan.png` 与 `opening-shot.png`；
3. Host 生成且不可手改的 `artifacts/scenes/<catalog-id>/plan-lock.json`；
4. SDK 从实际白膜派生的 Height/Slope、Opening Composition、planning views 和每个
   Prototype 的 `front/right/back` whitebox tri-view；
5. 以 verified whitebox tri-view 为结构输入生成的 styled tri-view 和最终 opening frame。

基本流程：

```bash
pnpm plan:freeze -- --scene <catalog-id>
pnpm plan:check -- --scene <catalog-id>
pnpm plan:scene -- --scene <catalog-id>
pnpm plan:scene:check -- --scene <catalog-id>
pnpm visual:finalize -- --scene <catalog-id>
pnpm visual:check -- --scene <catalog-id>
```

World Plan 和 Opening Shot 表达创作意图，不能替代实际高度、坡度、碰撞和可通行性。
Opening Composition 的 required region/anchor 失败是 Blocking Failure，不能由综合分数或
Feature presence 抵消。Whitebox tri-view 必须由已验证的 Babylon Runtime 捕获，不能用图片
生成工具虚构。

## 5. 当前明确边界

- 当前生产承诺是室外 Heightfield、静态障碍、水域、Ground/Air Character 和第三人称跟随；
- 第一人称、车辆、骑乘、飞行、游泳、NPC、完整室内、洞穴、联网与实时 World Model 仍是
  Capability Gap；
- `mistbound-rider` 等 catalog 场景中的组合主体可以是构图 Fixture，不自动获得骑乘或飞行
  能力；
- 最终 GLB 必须经过 Registry、长度/Hash、Inventory、Babylon load/instantiate/dispose 门禁；
  源格式转换不属于 SDK Runtime 或仓库内资产接入能力；
- 自动化合同、渲染证据与人工交互证据必须分开报告，单一 smoke test 不代表生产支持。

当前迁移与最终集成状态见
[SDK 重构总进度与 Backlog](18-refactor-progress-and-backlog.md)和
[Babylon-only Runtime 收口实施计划](../docs/superpowers/plans/2026-08-25-babylon-only-threejs-retirement.md)。
