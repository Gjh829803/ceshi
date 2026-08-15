# 第一期 Alpha 实现与运行指南

> 本文是当前可运行实现的操作指南。2026-08-15 的测试数字、四个实验场景和已知边界见[当前实验与验证记录](10-current-experiments.md)。

## 已交付的运行链路

当前 Playground 不是静态界面，而是用 SDK 的真实模块构建并运行下面这条链路：

```text
FeatureRegistry
  ├─ TiledRollingTerrain   → 4×4 Heightfield → Three Mesh + Rapier Collider
  ├─ Lake/WaterBody        → Basin + outer shore bank + shader surface + Semantic
  └─ CompoundLandmark      → Geometry hierarchy + Rapier Collider

HumanoidThirdPersonSubjectKit
  ├─ Rapier capsule motor
  ├─ Mixamo-compatible SkinnedMesh（+Z 资产正面自动校正到运行时 -Z 前进轴）
  ├─ idle / walk / run state machine
  └─ ThirdPersonCameraRig + physics raycast collision + vertical jitter filtering
```

用户操作与固定输入 Smoke 走同一套 SubjectKit、物理世界和固定更新循环。世界检查器直接显示 Feature 参数、版本、seed、状态、资源、顶点数和诊断；Feature budget 与 build time 由 Registry 追踪，但当前 UI 尚未显示。

## 运行

要求 Node.js 20+ 与 pnpm 10+。

```bash
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173/`。

常用验证命令：

```bash
pnpm typecheck
pnpm test
pnpm build
```

默认 `grassland` 场景为 640m × 640m 的 `plain` 分块地形和大型湖泊；`?scene=canyon` 是一个只使用公开 BuildContext 编写的自定义峡谷/Polygon 河流场景；`?scene=azure-bay` 和 `?scene=mistbound-rider` 用于更复杂的图片构图/语义组合实验。地形基础预设为 `flat / plain / hills / mountains`，人形最大爬坡角为 42°，48°以上自动滑落。`↑ / ↓` 按玩家视线方向控制上下观察；角色显示使用固定物理步长插值和接地高度平滑，固定输入 Smoke 同时验证移动、Transform 有限性和两个方向的镜头输入。

Playground 左上角的 `WHITEBOX / LOCAL PREVIEW` 明确表示当前只运行 Three.js 本地白膜预览；没有实时世界模型或多 pass Render Bridge。

Playground 暴露只用于测试和集成的浏览器 API：

```ts
window.__WHITEBOX_PLAYGROUND__.getSnapshot();
window.__WHITEBOX_PLAYGROUND__.inspectFeatures();
await window.__WHITEBOX_PLAYGROUND__.runFixedInput([
  { actions: ["forward", "run"], ticks: 120 },
]);
window.__WHITEBOX_PLAYGROUND__.captureScreenshot();
```

## 本地 Mixamo 兼容人形

仓库记录了本地 Mixamo 动作和候选 Xbot 的文件哈希、骨架与 clip 清单，但不会复制或分发来源/再分发授权尚未确认的资产。

在启动隔离 Agent 之前，由用户把自己的带骨骼 GLB 导入到 Playground：

```bash
pnpm import:local-humanoid -- /absolute/path/to/Xbot.glb
```

也可以使用环境变量：

```bash
WHITEBOX_HUMANOID_GLB=/absolute/path/to/Xbot.glb pnpm import:local-humanoid
```

导入命令会复制文件到 gitignored 的 workspace 本地缓存，不会创建指向其他目录的符号链接。运行时要求至少包含一个 `SkinnedMesh`，并包含归一化后名为 `mixamorighips` 的根骨骼（例如 `mixamorig:Hips`）。当前 action manifest 只声明目标 GLB 中真实存在的 `idle`、`walk`、`run`。本地 `Jump.fbx` 已登记为源动作，但尚未完成目标绑定和视觉 QA，因此跳跃物理存在、跳跃动画不会被伪报为完成。

## Agent 如何自由定义世界

Agent 不需要等 SDK 新增“火山”或“峡谷”名词。它可以使用受追踪的 BuildContext 组合基础空间操作：

```ts
const VolcanoFeature = defineWorldFeature({
  type: "custom.volcano",
  version: 1,
  source: "game/features/volcano.ts",
  schema: { size: "positiveNumber", height: "positiveNumber" },
  build(ctx, params) {
    const terrainId = ctx.terrain.create({
      width: params.size * 3,
      depth: params.size * 3,
      xSegments: 64,
      zSegments: 64,
    });
    ctx.terrain.raise(terrainId, {
      area: ctx.shape.circle([0, 0], params.size),
      amount: params.height,
      falloffWidth: params.size,
    });
    ctx.terrain.lower(terrainId, {
      area: ctx.shape.circle([0, 0], params.size * 0.2),
      amount: params.height * 0.4,
      falloffWidth: params.size * 0.2,
    });
    ctx.semantic.bind(terrainId, { semantic: "volcano" });
    return { terrainId };
  },
});
```

Registry 会追踪定义版本、来源哈希、参数、seed、依赖、输出资源、预算和诊断。失败构建会回滚，不会留下半完成资源。

## 当前明确边界

- 这是第一期 Alpha，不是生产级完整游戏引擎。
- 已实现 Circle、Ellipse、Polygon；Curve/Path 和通用 SDF 仍是后续扩展点。
- 湖泊的地形凹陷、水面和语义已实现；`blocked/swimmable` 目前是语义契约，尚未变成完整游泳/禁行玩法。
- 目前只有第三人称人形；车辆、骑乘、动物、第一人称与室内属于第二期。
- 未实现 NPC、寻路、任务、联网和实时生成式渲染桥。
- `mistbound-rider` 的马和骑手是非碰撞静态标志物，只用于构图实验，不是骑乘 SubjectKit。
- 当前候选 Xbot GLB 中确实存在并可绑定 `idle / walk / run` clip；这不证明 retarget 观感、循环接触质量或发布就绪。正式分发前仍需确认资产授权并做人工动作观感验收。
