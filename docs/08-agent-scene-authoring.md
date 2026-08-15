# Coding Agent 场景创作指南

## 直接交给 Agent 的用法

使用项目提供的隔离入口启动 Coding Agent：

```bash
pnpm test:isolation
pnpm agent:scene -- "创建一个中央有弯曲河谷、两侧有高台的室外白膜场景"
```

图片参考通过同一个隔离入口传入：

```bash
pnpm agent:scene -- \
  --image /absolute/path/coastal-reference.png \
  "按参考图的可见空间构图创建可玩的海湾白膜场景；保留前景高地、中央海湾、两侧海岸和远处岛屿关系"
```

启动脚本只读取命令中明确指定的图片，将它复制到一次性隔离目录，再作为 Codex 初始图片附件传入；场景 Agent 看不到原始目录，任务结束后副本自动删除。支持 PNG、JPEG 和 WebP，可重复使用 `--image` 传多张参考图。

单张透视图没有不可见区域和真实尺度，因此验收目标是“指定观察点下的空间构图、地貌拓扑和关键轮廓相符”，不是从一张图恢复唯一且逐点完全一致的三维地形。花草、云层、绘画风格、纹理与密集小船属于生成式渲染层；白膜只负责海湾轮廓、高地、岛屿、道路、灯塔、房屋等会影响空间关系的内容。

`.codex/config.toml` 使用 `whitebox_workspace_only` 权限 Profile：整个文件系统默认不可读，只重新开放当前 workspace，并关闭网络和权限升级。工具运行仍需要读取 Codex 官方定义的 `:minimal` 系统运行路径和只读的 `/opt/homebrew` Node 工具链，但不能读取其他用户目录或相邻项目。

也可以在仓库根目录启动 Agent，然后直接描述场景。推荐提示词：

```text
请遵守仓库根目录 AGENTS.md，创建一个可玩的室外白膜场景：<写你的场景描述>。
只修改 apps/playground/src/scenes/ 下的场景代码并注册到 sceneCatalog；
内置 API 不够时，在场景模块中用 defineWorldFeature 和受追踪的 BuildContext 自定义，
不要为了这个场景修改 SDK 内部。完成后运行 test:scenes、typecheck、build，并在浏览器验收。
```

例如可以把 `<写你的场景描述>` 换成“中央是一条弯曲河谷，两侧有高台，远处有三座几何瞭望塔，黄昏光线，玩家从南侧高地出发”。Agent 可以自由写新的 Feature，不需要等待 SDK 预置“河谷”这个名词。

## 可验收目标

Coding Agent 创建新室外场景时，只新增或修改 `apps/playground/src/scenes/` 下的场景模块，不修改相机、物理、渲染器或 SDK 内部代码。

场景文件经过下面的固定链路：

```text
defineOutdoorScene
       ↓
Scene authoring context
       ↓
FeatureRegistry + resource ownership
       ↓
Generic runtime compiler
       ↓
Three.js meshes + Rapier colliders + SubjectKit
```

## 最小场景

```ts
import { defineOutdoorScene } from "@whitebox-world/world";

export const scene = defineOutdoorScene({
  id: "green-valley",
  seed: 42,
  build(world) {
    const terrain = world.terrain.landscape({
      id: "terrain",
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [96, 96],
      relief: "plain",
      semantic: "green_valley",
    });
    world.player.spawn({
      terrain,
      at: [0, 40],
      facingRadians: Math.PI,
      camera: { pitchRadians: 0.45, distance: 6 },
    });
    world.atmosphere.set({ preset: "clear-day" });
  },
});
```

完整模板见 [`templates/outdoor-scene.ts`](../templates/outdoor-scene.ts)。

### 出生方向与参考镜头

场景图像匹配不仅是地形问题，参考图的观察点也必须进入定义：

- `facingRadians: 0` 朝 `-Z`，`Math.PI` 朝 `+Z`。
- `camera.pitchRadians` 是第三人称轨道相机初始俯仰；正值越大，相机越高、看得越向下，范围 `-0.95..0.65`。
- `camera.distance` 是初始跟随距离，范围 `1.8..8` 米。
- 这些参数只决定首帧构图；进入游戏后，SDK 仍统一处理拖拽、方向键、滚轮、碰撞和跟随。

对于“站在山坡俯瞰海湾”这类参考图，应先验证玩家确实面向海湾，再提高 pitch/distance。不要因为镜头背向或过平，就反复抬高地形。

## 内置创作能力

### 大地形

`world.terrain.landscape` 创建连续分块高度场。每个 tile 具有独立 Mesh 和 Rapier Collider，但所有 tile 使用世界坐标噪声，因此边界高度一致。

必须按照用户场景选择 `relief`，而不是默认把所有场景做成强烈起伏：

- `flat`：城市、广场、机场、人工铺装区域，默认无噪声。
- `plain`：草原、农田、开阔谷地，只有轻微缓坡。
- `hills`：丘陵地带，存在明显高差，但主要路线仍应单独整平。
- `mountains`：山地背景和不可通行山坡；必须额外创建可行走谷地或道路。

主要参数：

- `tileSize`：单块尺寸。
- `tiles`：X/Z 方向块数。
- `segmentsPerTile`：单块精度。
- `amplitude/frequency/octaves`：高级覆盖项；通常应使用 relief 预设。
- `semantic/appearancePrompt`：给生成式渲染层的条件。

全局噪声只定义基础地表。山脉、山谷、湖盆、台地和道路应使用 `raise/lower/basin/flatten/smooth` 等显式形状叠加，不能通过无限增大全局噪声来表达。

`falloffWidth` 在形状内部向边界衰减，不会从边界向形状外扩散。要做一段 140 米长的连续下坡，应让形状包含整段坡面、把边界放在坡底，再设 `falloffWidth: 140`；不要把边界放在坡顶后期待它向外生成坡面。

第三人称人形的最大爬坡角为 42°，48°以上会自动滑落。为了给碰撞采样和转向留出余量，主要通路应保持在 35°以下。可用 `world.terrain.slopeDegrees(terrain, [x, z])` 查询局部坡度；场景编译器会拒绝位于不可行走斜坡上的出生点。

### 水体

- `world.water.lake`：椭圆湖泊。
- `world.water.body`：Circle、Ellipse 或 Polygon 边界水体。

WaterBody 会统一雕刻岸带、湖底、水位和最小深度，并输出水面、通行语义和渲染提示。白膜运行时提供浅水颜色、菲涅尔和轻微波纹；最终材质仍由生成式渲染层决定。

### 标志物

`world.landmark.compound` 可以递归组合 Box、Sphere、Cylinder、Cone 和 Plane。运行时会为每个允许碰撞的 primitive 自动生成匹配的 Rapier Collider。

### 自定义 Feature

当内置名词不够时，Agent 可以在场景文件中定义：

```ts
const VolcanoFeature = defineWorldFeature({
  type: "custom.volcano",
  version: 1,
  schema: { height: "positiveNumber" },
  build(ctx, params) {
    const terrainId = ctx.terrain.createGrid({
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [64, 64],
    });
    ctx.terrain.raise(terrainId, {
      area: ctx.shape.circle([0, 0], 70),
      amount: params.height,
      falloffWidth: 60,
    });
    return { terrainId };
  },
});
```

随后用 `world.terrain.custom(...)` 把输出登记为场景主地形。资源仍然会被 Registry 追踪和预算约束。

## 注册与打开

将场景加入 `apps/playground/src/scenes/index.ts`：

```ts
export const sceneCatalog = {
  grassland: currentScene,
  canyon: canyonScene,
  myScene,
};
```

浏览器打开：

```text
http://127.0.0.1:5173/?scene=myScene
```

当前示例：

- `?scene=grassland`：640m × 640m 起伏草地、湖泊和高塔。
- `?scene=canyon`：Agent 自定义分块峡谷、Polygon 河流和石拱。
- `?scene=azure-bay`：前景高地、中央海湾、两侧海岸、远处岛屿和灯塔的图片构图实验。
- `?scene=mistbound-rider`：山谷、村落、城堡和远景组合实验；其中马/骑手只是静态标志物，不代表骑乘主体已实现。

## Agent 验收门禁

```bash
pnpm test:scenes
pnpm typecheck
pnpm build
```

`test:scenes` 会检查：

- 所有 Feature 是否成功构建。
- 资源是否具有唯一所有者。
- 依赖是否存在。
- Spawn 是否位于有效地形上。
- Transform 是否为有限值。
- 自定义 Feature 是否可确定性重建。

最后必须在浏览器中检查构图、岸线、碰撞、镜头和移动手感。

## 当前“任意”的边界

当前可自由组合的是室外高度场世界：山地、丘陵、湖泊、河流、峡谷、道路式区域、岛状区域和几何标志物。洞穴、倒悬结构、完整室内拓扑、车辆、NPC 和生成式渲染桥仍不在这一阶段的能力承诺内。

四个当前场景的具体实验目的、自动测试与人工验收缺口见[当前实验与验证记录](10-current-experiments.md)。
