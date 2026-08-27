# Hybrid Terrain 设计审查（业界对照）

## 阅读顺序（给其他审查者）

1. 先读被审规格：
   [`docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md`](../../docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md)。
2. 再读本文。本文不重写规格，也不开始 H1 实现。
3. 现网权威以 `docs/17-canonical-json-quickstart.md` 和
   `docs/18-refactor-progress-and-backlog.md` 为准。WorldPackage / Take /
   ValidationReport / 室内 / Voxel 仍是能力缺口，不要当实现 bug。
4. 08-20 审计里已经修掉的双权威问题（spawn Y 双重计数、双线性 vs 三角面、catalog
   假 `implemented`）不要当开放缺陷重开；本文只指出**同一类合同**会在 Hybrid
   Terrain 里再次出现的位置。

## 审查元数据

- 审查者：Cursor Grok 4.6
- 维护者处置：Codex，2026-08-21，结论为“修改后采纳”；详见 §8。
- 日期：2026-08-21
- 审查 HEAD：`bb6ba1d`（`docs: add hybrid terrain AI conformance gate`）
- 性质：设计审查，不是规格，也不是实施计划。规格演进时本文不自动更新。
- 方法与深度分层见 §0。结论是合同级审查，不是 Havok 可执行探针。
- 对照规格：
  - `docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md`
  - `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md` §5.13、§6.1、T7
  - `docs/superpowers/specs/2026-08-20-ai-authored-geometry-extension-design.md` §12.3
  - `docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md` §4.3–4.4
  - `docs/18-refactor-progress-and-backlog.md` P1.1 / P2.5 / P2.6 / M9
  - `docs/reviews/runtime-deep-review-checklist.md`

## 0. 这轮查到了哪一层

原始审查是**合同级**深度审查，不是 Havok 可执行探针，也不是把相关规格逐字重读一遍。

已核对：

- Hybrid Terrain 专项全文；Terrain 子规格 §5.13 / §6.1 / T7；Placement §4.3–4.4；
  AI Geometry §12.3；总规格 §8.3 Water；Backlog P1.1 / P2.5 / P2.6 / M9。
- 现网源码：`babylon-world-runtime.ts` Heightfield/Mesh 分叉与
  `revalidateSupportAssertion`；`terrain.ts` 分辨率与三角面采样；
  `motion-kernel-runtime.ts` 的 `checkSupport` / 水域 / spawn raycast；
  `compile.ts` spawn Y。
- 官方文档：Godot `HeightMapShape3D`、Unity Terrain Holes、Unreal Landscape
  Visibility、Recast Introduction、Godot 3D Collision Shapes。
- Babylon 上游源码（GitHub `master`，不是本仓 `node_modules`）：
  `PhysicsShapeHeightField` 构造函数只有尺寸、采样数、`Float32Array`；
  `havokPlugin.ts` 的 `HP_Shape_CreateHeightField(samplesX, samplesZ, scale, buffer)`
  没有 hole/mask 参数。

维护者处置时追加核对：

- 已在本仓锁文件安装的 `@babylonjs/core@9.21.2` 与 `@babylonjs/havok@1.3.14`
  精确版本源码中复核：`PhysicsShapeHeightField` 公开构造参数只有尺寸、采样数和
  `Float32Array`；`HP_Shape_CreateHeightField(numX, numZ, scale, heights)` 没有
  hole/mask 参数。
- 已对照当前 Canonical V3：Object 使用 `placement`，Placement Constraint 位于根级
  `constraints.placements`；原始 §3.10 示例不是可直接复制的完整 V3 片段，已在主规格修正。
- 已复核 Recast：NavMesh 通常由 Collider 输入派生，但它是简化查询结构，不能反过来
  充当碰撞体。因此采纳“禁止独立作者 walkable mesh”，不采纳“Navigation 永远逐三角
  复制 Collider”的过强解读。

仍未做、不能冒充已做：

- 没有对锁定版本运行 Heightfield Hole/Static Triangle Collider 行为探针，也没有反汇编
  WASM。源码只证明公开接口未暴露 Hole 参数，不证明所有碰撞、接缝和资源行为已经合格。
- 没有把总规格、Validation、AI Geometry 全文再审一遍。
- Recast 的「输入网格」以 [官方 Introduction](https://recastnav.com/md_Docs_2__1__Introduction.html)
  为准；Unity 集成里也可以 rasterize collider，那是宿主选择，不是 Recast 内核只吃碰撞。

## 结论先行

**方向正确，和业界一致，可以做长期架构。现在不能冻结公共字段，也不能开始 H1
实现。H0 必须先收紧几条合同，否则会重演刚修完的双权威 bug。**

一句话：混合拓扑、单一 Ground Support、AI 不碰引擎、视觉 Mesh 不自动可走——这些
都站得住。真正的风险不在「要不要洞穴节点」，而在 Opening 由谁展开、Walkable
Surface 会不会变成第二套几何、Layout 查询会不会采错网格、以及 Havok Heightfield
没有一等 Hole 时把 Mesh 回退写成「罕见 fallback」。

| 主张 | 判定 |
|---|---|
| Heightfield 不升级成万能表示 | 通过，业界铁律 |
| 洞穴拆成 Opening / Structure / Surface / Region / Portal | 通过，不要巨型 `cave` 节点 |
| 视觉 / 碰撞 / 可行走 / 空间语义分权威 | 通过 |
| Runtime 落地只由物理接触 + 唯一 Resolver 拥有 | 通过，必须坚持 |
| H1 跨谷桥不需要先挖洞 | 通过 |
| 动态体禁止任意 Concave Trimesh | 通过 |
| Voxel / SDF / 运行时挖洞不进首批 | 通过 |
| Walkable Surface「不复制顶点」 | 方向对，合同还不够硬 |
| Interior Region「不拥有几何」 | 过强，缺 membership Volume |
| Portal 作为独立顶层概念 | 过早；应并入现有 Route Graph |
| H2 把 Tile Mesh Collider 当 fallback | 对本后端应作为候选默认路径；探针通过后冻结 |
| H0 现在可以冻公共字段 | 否 |
| 可以开始 H1 实现 | 否，先完成 H0 Fixture/探针并写窄实施计划 |

---

## 1. 业界对照：哪些站得住

Heightfield 是 `height = f(x, z)`。同一 XZ 不能同时表达桥面与桥下地面、洞穴地板与
洞顶、悬挑上下表面。这不是 Babylon / Unity / Unreal 的实现缺陷，而是二维高度场的
拓扑约束。成熟引擎都不因此改成全 Mesh 或全 Voxel 世界，而是 **Heightfield + 开洞
Mask + 静态结构 Mesh**。

| 引擎 / 库 | 官方做法 | 对本规格的含义 |
|---|---|---|
| Godot `HeightMapShape3D` | 明确不能存洞穴/悬挑；可用 `NAN` 在碰撞高度场打洞，再插入独立 Mesh 碰撞 | 混合拓扑是默认答案，不是本仓发明 |
| Unity Terrain Holes | Mask 同时去掉渲染、Terrain Collider 和 NavMesh；洞口用岩石 Mesh 挡住锯齿 | Opening 必须三通道一致；接缝靠装饰 Mesh，不是 CSG |
| Unity hole mask 分辨率 | **heightmap − 1**（1025 顶点 → 1024 hole texel） | Opening Mask 必须冻 cells vs vertices，不能再写一套方言 |
| Unreal Landscape Visibility | Hole Material 挖洞，洞穴用 Static Mesh Actor 填 | 洞穴是装配，不是第二种 Landscape |
| Godot 3D Collision Shapes | 动态体用 Primitive / Convex；Concave trimesh 仅 Static | 规格 §9 矩阵正确 |
| Recast / Detour | 官方流程是把**输入三角网格**体素化，再用 Agent 半径/身高/坡度/步高过滤；Portal ≈ off-mesh connection。输入可以是碰撞或视觉网格，但输出 navmesh 是派生结果，不是作者另做的平行可行走几何 | 本仓应喂已锁定 Collider，禁止再写一份 walkable vertex buffer |
| Unreal `NavLinkProxy` | 断开导航空间之间的显式边 | Portal 应是 Route Graph 上的类型化边 |
| Babylon 9.21.2 + Havok 1.3.14 | 锁定版本公开接口只收尺寸、采样数、`Float32Array`，没有 Hole 参数 | H2 以 Tile Mesh Collider 为候选默认路径，并用可执行探针决定 Runtime Profile |

官方出处（2026-08-21 核对）：

- Godot：[HeightMapShape3D](https://docs.godotengine.org/en/stable/classes/class_heightmapshape3d.html)
- Unity：[Paint holes in the terrain](https://docs.unity3d.com/Manual/terrain-PaintHoles.html)
- Unreal：[Landscape Visibility](https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/Landscape/Editing/SculptMode/Visibility/)
- Godot：[3D collision shapes](https://docs.godotengine.org/en/stable/tutorials/physics/collision_shapes_3d.html)
- Babylon：[`PhysicsShapeHeightField`](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.PhysicsShapeHeightField)
- Recast：[Introduction](https://recastnav.com/md_Docs_2__1__Introduction.html)（输入三角网格 → 体素 → Agent 参数过滤 → navmesh）；off-mesh connection 是导航图上的显式边

本规格已经对齐的正确决策：

1. 不把 Heightfield 升级成可表达所有拓扑的万能数据结构。
2. 洞穴不是巨型 `cave` 节点，而是 Opening / Structure / Surface / Region / Portal 装配。
3. 视觉 Mesh 不自动可走、可攀爬、可游泳。
4. Runtime `isGrounded` 只有一个所有者。
5. AI 只选 Prototype / Profile / 关系，不接触 Babylon / Havok Handle。
6. H1 跨谷桥可以先做，不必先挖洞。
7. Voxel / SDF / 运行时 Boolean CSG 不进首批。

这些和 2026-08-18 的业界对照报告、Terrain 子规格 §5.13 一致，不需要推翻。

---

## 2. 对本仓现网权威：哪些贴得住

现网已经用过「双权威会静默错」这一课。Hybrid Terrain 如果合同发虚，会在同一位置再错一次。

### 2.1 Heightfield 碰撞已经分叉过一次

`packages/runtime-babylon/src/babylon-world-runtime.ts` 对正方形网格走
`PhysicsShapeHeightField`，非方网格走 `PhysicsShapeMesh(terrainMesh)`。注释写明：
Babylon 9.21 在长宽采样数不同时会交换 Heightfield 轴。H2 Opening 若只改
Heightfield 缓冲区、不改 Mesh 回退路径，矩形 Tile 会和方形 Tile 行为不一致。

### 2.2 落地权威已经收口，不能再开第二入口

`motion-kernel-runtime.ts` 用 `physicsController.checkSupport(...)` 决定支撑和
medium。水域分类是另一条权威：`waterSurfaceHeightAtSubjectOrigin` 用 XZ 多边形 +
`waterLevelMeters` 体积，不读 Heightfield 洞。规格要求 Ground Support 唯一 Resolver
是对的；H1 必须把桥面接触映射到 Surface ID，且 **不得** 让 Layout 的 Surface Query
或 `terrainHeight(x, z)` 再写一份 `isGrounded`。

### 2.3 分辨率已经有 cells / vertices 方言

- ExecutionPlan：`resolutionCellsXZ`
- Layout / `terrain-surface`：`resolutionVerticesXZ`
- Runtime 网格构建把 `resolutionCellsXZ` **当顶点数** 用（三角形数是 `columns - 1`）

Unity 的 hole mask 明确是 heightmap − 1。H2 若不先冻「Mask 是 cell 还是 vertex」，
Opening 会对齐失败。这不是命名偏好，是洞开在哪一个四边形上。

### 2.4 Region / Route 已经有一套语义

Placement S1 的 `spatial.regions`（`polygon-xz` + 可选高度带）和 `spatial.routes`
（`polyline-xz` + `locomotionProfileRef`）已经声明：**后续 Terrain Pipeline 可以让
同一 ID 引用 Mask / Graph，但不能新增第二套 Region/Route 语义。** 规格 §16.2 把
Portal 归属写成「实施计划前评审」是对的，但级别不够——这是 **冻字段前的阻断**。

### 2.5 现网已经有两处「第二份支撑」

规格要求落地只信物理接触。现网还没到 H1，但已经有两条旁路；H1 桥面会把它们放大。

1. **Spawn 用独立 raycast。** `motion-kernel-runtime.ts` 的
   `hasWalkablePhysicalGroundAt` 从脚底向上 0.25m、向下 `maxStepHeight+0.25m`
   打 `physicsEngine.raycast`，用来置 `initialGroundSupportPending`。步进中的
   落地仍走 `checkSupport`。同一主体、两种查询。桥面薄、桥下有地或有水时，
   raycast 和 controller support 可以对到不同表面。
2. **Object 的 `supported-by` 用 AABB 顶。**
   `babylon-world-runtime.ts` 的 `revalidateSupportAssertion`：支撑体是地形时走
   `sampleExecutionTerrainHeight`（三角面）；支撑体是 Object 时用
   `supporting.maximumMetersXYZ[1]`，也就是包围盒顶，不是甲板 Collider。
   拱桥、带栏杆的桥、斜桥面都会把 Layout/Runtime 断言测绿、角色却站在错误高度。

这两条不是「H1 以后才要防」。它们已经在代码里，是 §3.3 同源采样合同的现网反例。

### 2.6 Transform Y 刚改成世界绝对坐标

Compiler 现在直接拷贝 `spawnAnchor.transform.positionMetersXYZ`，不再把 Y 当离地
偏移。规格 §6 的 AI 示例 `positionMetersXYZ: [24, 3, -18]` 会被 Agent 读成
「世界 Y = 3m」。地形高不是 0 时，这不是「桥面离地 3m」，而是绝对高度。Kit 必须
用 `supported-by` + Prototype 甲板高度，或由 Layout 解出绝对 Y。

---

## 3. H0 前必须收紧的合同（阻断）

下面不是文风问题。不改这些就冻字段，H1 会把错误协议锁死。

### 3.1 Opening 由 Kit 展开，不由 Agent 猜测

跨谷桥：**不必** Opening。拱门穿山脊：**必须**带 Opening Recipe。

规格把五层画成并列树，又给了一个只含 `prototypeRef` + Transform 的桥示例。实现者
会问：只放 `stone-arch-bridge` 时，谁切地形？

**冻结句：**

- 普通 AI Profile 只交 `prototypeRef`、Placement、必要 Constraint。
- Opening / Collider / Surface / Region / Portal 由 Registry Kit + Compiler 确定性展开。
- Kit Manifest 必须用闭合判别 Contract 区分“无需 Opening”和“必须 Opening”；后者还要
  引用内容寻址 Opening Recipe。这里冻结职责，不冻结单个布尔字段名。
- 无需 Opening 的跨谷桥是 H1 范围；必须 Opening 的穿脊拱门是 H2。
- 禁止 Agent 手写 Opening 坐标来「补」一个没声明 Opening 的 Kit。

不写死这条，H1 和 H2 会搅在一起。

### 3.2 Walkable Surface = 碰撞子集标签 + Profile，禁止平行 mesh

规格 §5.4 写了「引用 Collider Subshape、不复制顶点」，但 §8 的
`SupportSurfaceHit` 和 §11 Gate 仍可能被读成「再备一份 walkable 几何」。

业界（Recast、Unity NavMesh、Unreal Recast/NavMesh）的可行走面是：

1. 从碰撞或简化碰撞光栅化；
2. 加上 Agent 半径、步高、最大坡度；
3. 用 Area / Modifier 标签，而不是第二套作者网格。

本仓刚修掉「Layout 双线性 vs Runtime 三角面」。平行 walkable mesh 就是下一次。

**冻结句：**

- Surface 的几何权威是已锁定 Collider Subshape（primitive / convex / 预算内 triangle）。
- Surface 自己只存稳定 ID、Subshape 引用、Semantic/Profile Ref、单双面和边缘策略。
- Compiler Gate：Surface Hash 必须覆盖所引 Collider Hash；禁止 Surface 自带 vertex
  buffer。
- 未来 Navigation 从同一份 Collider + Profile 派生，不从 Visual Mesh 派生。

P2.5 的第一份生产 Fixture **就是** H1 桥面 Surface。P2.5 / P2.6 必须当同一切片，
否则会做出两套 Surface。

### 3.3 Layout 采样与 Havok 必须吃同一份 collider 三角

规格正确地区分了：Layout 用 Surface Query，Runtime 用 Havok contact。危险已经在
现网：Object `supported-by` 采 AABB 顶，spawn 另打一条 raycast（§2.5）。Query
如果再采 Visual Mesh 或旧的 `terrainHeight(x, z)`，桥面会把主体摆到 Runtime
站不住的地方。

**冻结句：**

- Surface Query 的命中点必须落在**同一份**已锁定 Collider 三角形（或等价 primitive）上。
- Terrain 命中走现网三角面采样（`sampleTriangleHeightfieldSurface`），不走双线性。
- Structure 命中走该 Surface 声明的 Collider Subshape，不走 Visual LOD。
- Query 结果不是 `isGrounded`；Runtime 仍只信 `checkSupport` + Resolver。

### 3.4 Havok 无 Heightfield Hole：受影响 Tile 默认改 Static Triangle Collider

Unity 有原生 hole collider。Godot 可用 `NAN` 打洞。Babylon 上游
`PhysicsShapeHeightField` 和 `havokPlugin.ts` 的 `HP_Shape_CreateHeightField`
只接收采样数、世界尺度和高度缓冲，没有 hole/mask 参数。这是公开插件源码结论，
不是 WASM 探针。

规格 §5.2 / H2 把 Tile Mesh Collider 写成「后端不支持洞时的回退」。根据当前锁定版本
公开接口，它应是本生产后端的**候选默认路径**；只有可执行探针通过后才能冻结进 Runtime
Import Profile：

1. Opening 进入 Tile Hash。
2. 受影响 Tile 编译为预算内 Static Triangle Collider（从同一 Height Resource 删掉
   被 Opening 覆盖的 cell）。
3. 未受影响 Tile 继续用 Heightfield。
4. Query / Overlay / 未来 Navigation 读同一份 Opening 结果。
5. 禁止「视觉开洞、Heightfield 碰撞还在」。

H0 必须记录两层证据：当前 `@babylonjs/core@9.21.2` + `@babylonjs/havok@1.3.14`
公开接口没有 Heightfield Hole 参数；可执行探针还要验证 Static Triangle Collider 的
Winding/Sidedness、接缝、Character Controller 支撑、Shape Lease 和释放成本。未做行为
探针前不得宣称生产路径已经冻结。

### 3.5 Opening Mask 分辨率与 cells / vertices 一起冻

H2 不先回答下面三个问题，Mask 会对不齐：

1. Height Resource 的权威索引是 vertex 还是 cell？
2. Opening Mask 的 texel 对应哪个四边形（Unity：vertex 数 − 1）？
3. 矩形 Tile 的 Mesh 回退路径是否用同一套索引？

建议沿用 Unity：Height 用 vertex，Opening 用 cell（vertex − 1）。公共字段名必须
消掉 `resolutionCellsXZ` 实际表示 vertex 的现状，或在 Compiler 边界做一次显式
rename，并改所有 Fixture。

### 3.6 Portal / Interior Region 并入现有图，不新增第六套顶层概念

规格 §2 把 Interior Region / Portal 和 Terrain 画成并列兄弟。Placement 已经有
`spatial.regions` / `spatial.routes`。Backlog M4 也写了「扩展既有 Graph，不新增
第二套语义」。

**冻结句：**

- AI-facing Portal 连通意图由现有 Route Graph 上的类型化边拥有（类 Recast off-mesh /
  Unreal NavLinkProxy）。字段是两端 Region/Route Node、入口几何、净空、通行 Profile、
  关联 Structure。
- Interior Region = 现有 Region Graph 的一种 `semanticClassId` / `mode`，不是新
  顶层 `kind`。
- 「Region 不拥有几何」对碰撞/可行走成立，但对 membership 过强。Region 需要
  **触发 Volume**（不阻挡、不支撑），否则「是否在洞里」只能靠猜测或射线。
- Compiler 后续可以从同一 Route/Region 身份派生 Visibility、Acoustics、Streaming 或
  Navigation 使用的 Portal 元数据；不得把这些派生数据变成第二套作者真相。
- H1 **不**引入 Region/Portal 公共字段。跨谷桥的桥上/桥下是两条 Route，不是 Portal。
- H3 才冻 Portal 边类型和 Interior membership Volume。

### 3.7 H1 不要五层一起做

§2 的并列树会让实现者一次铺 Opening + Region + Portal。H1 的最小闭合集是：

- 一个版本化桥 Prototype（Visual + 简化 Static Collider）
- 桥面 Walkable Surface（Collider Subshape 标签）
- 统一 Support Surface Query
- 唯一 Ground Support Resolver
- 桥上 / 桥下两条 Route
- Overlay + 确定性截图

H1 **没有** Opening、Interior Region、Portal、Navigation bake。崖壁可以并行，但
仍不挖洞。

### 3.8 Surface ID 从 H1 就稳定

规格把「Streaming 不改变 Surface ID」写在 H4。身份稳定性从第一份 Fixture 就要有：
`surfaceId` 由 Entity ID + Registry 中稳定的逻辑 Subshape ID + resolved Kit/Resource
Version 派生，不使用数组序号、Runtime Handle 或只有内容 Hash 的匿名索引，也不因 Tile
拆分、LOD、重新加载而改。H4 只验证原子加载，不重新发明命名。

### 3.9 AI Conformance「两个 Adapter」写成宿主编码，不是两种几何方言

§11.1 第 6 条「至少两个结构化输出 Adapter」含糊。实现者可能去做两套 Geometry
Provider。

**冻结句：** 同一 AuthoringSpec 字段，两种宿主编码（CLI Canonical JSON 与 Browser
Protocol）都能生成同一 Bridge Fixture，并能按同一 Diagnostic 修复。H0 **不必**
先做两个 LLM Provider Adapter。H5 之前不要把 Navigation 同步 Opening 写进 H1
schema。

### 3.10 AI 示例的 Y 必须带约束

§6 示例需要改成 Canonical V3 的 `placement` + 根级 `constraints.placements`，并在文中
写明 Y 是世界绝对坐标。原始片段只表达了约束意图，但把 `constraints` 放在 Object 内部，
不能作为可复制的 V3 示例；权威修订以主规格 §6 为准。

`3` 若只是示意，应作为 `initialTransform`，最终绝对 Y 由 `supported-by` 和 Collider-backed
Surface Query 求解。否则 Agent 会复用刚修掉的「Y = 离地偏移」误读。

---

## 4. 应写进 Fixture、但不是设计方向错误

### 4.1 桥下净空 vs 胶囊

桥下地形还在时，胶囊可能同时碰到桥面和地面，或从桥沿吸附到地面。Babylon 角色
控制器已有 `maxStepHeight`；支撑必须只认脚底 `footOffset` 附近接触。

H1 Fixture 至少包含：

- 桥面厚度 / 桥下净空 vs 主体胶囊高度
- 支撑只映射脚底附近接触，忽略桥下顶到胶囊的接触
- 桥沿离开、落地、Reset、Rebind
- 30 / 60 / 120 Hz-like 渲染间隔不改变 Fixed Tick 接触
- **桥下有水**：现网水域是相对 Heightfield 的 XZ 体积。沿海桥是第一真实产品例。
  水域分类不得因为脚下有桥面就失效，也不得把桥面判成水面。

### 4.2 接缝 Gate 有名无算法

业界不靠 CSG 补缝（规格已排除 CSG）。实际做法是：

- 洞口用重叠装饰 Mesh 挡住锯齿（Unity / Unreal 都这样教）
- 碰撞相对视觉略扩张，避免角色卡进可见缝
- 禁止不可见墙：视觉已开洞则碰撞必须开洞

H2 Seam Gate 应写可测阈值，而不是「不得形成不可见墙」这种散文：

- 最大可见缝宽（米）
- 法线不连续上限
- 角色半径内不得存在「可见可过、碰撞不可过」或反向
- Opening 边界 cell 的 collider 允许保守扩张，扩张量进入 Profile 与 Hash

### 4.3 Kit 展开后的资源预算

穿脊拱门会把受影响 Tile 从 Heightfield 打成 Triangle Mesh。H2 Performance Profile
必须给「每 Tile 因 Opening 增加的三角形数」设上限。否则「预算内」没有数字。

---

## 5. 不要当 bug，也不要提前实现

| 对象 | 口径 |
|---|---|
| 洞穴 / 悬挑 / 完整室内现在不可玩 | 规格已声明；quickstart 边界不变 |
| Voxel / SDF / 运行时挖洞 | 非目标；只有明确破坏需求才单独立项 |
| 完整室内 Room / Visibility / NPC NavMesh | H5 / P3.3，不是 H3 完成证据 |
| Navigation 同步 Opening | 原则正确，字段进 H5，不进 H1 |
| WorldPackage / Take / ValidationReport | 能力缺口，沿用 08-20 审计口径 |
| AI 自定义 MeshDraft | 不阻塞 P2.6；P2.6 先吃审核过的 Prototype / 产品 GLB |
| Godot `NAN` 打洞、Unity 原生 Hole | 他引擎能力，不是本仓当前 Havok 能力；不要写进 Adapter 方言 |

---

## 6. 建议对规格的最小修订（H0，不写字段全集）

不建议重写架构，也不建议提前冻 Schema。H0 只补合同：

1. §2 标明 H1 只用 Heightfield + Static Structure + Walkable Surface；Opening /
   Region / Portal 从 H2 / H3 才出现。
2. §5.2 把「后端无 Hole → Tile Mesh Collider」改成当前生产后端的候选默认路径，要求
   锁版本行为探针，并写 cells/vertices 规则。
3. §5.4 升格为硬规则：Surface 禁止自带 vertex buffer。
4. §5.5 把 AI-facing Portal 意图写成 Route Graph 边，Region 写成带 membership Volume
   的既有 Region；允许 Compiler 从同一身份派生运行时 Portal 元数据，而不是新建作者真相。
5. §6 示例改为合法 Canonical V3 `placement` + 根级 `supported-by`，并声明 Y 为世界
   绝对坐标。
6. §10.2 明确跨谷桥不展开 Opening；穿脊拱门由 Kit 展开 Opening。
7. §11.1 把「两个 Adapter」改成 CLI / Browser 同一 Canonical 字段；Fixture 增加
   桥下有水、脚底接触过滤。
8. §11.2 Seam Gate 补可测阈值。
9. §14 H0 增加：P2.5 第一 Fixture = H1 桥面；Surface ID 命名规则从 H1 生效。
10. §16.2 把 Opening Kit 展开、Collider 同源采样、cells/vertices、Portal 归属、
    Havok 无原生 Hole 探针升为冻结阻断。

写完以上合同，再写 H1 实施计划。在此之前不要加公共字段，不要改
`sdk-world-adapter.ts` / 物理 / 相机。

---

## 7. 证据与版本

| 项 | 值 |
|---|---|
| 被审规格提交 | `99da2b5` 设计正文；`bb6ba1d` AI Conformance Gate |
| 现网 Babylon | Lockfile / 安装版本 `@babylonjs/core@9.21.2` |
| 现网 Havok | Lockfile / 安装版本 `@babylonjs/havok@1.3.14` |
| Heightfield 分叉 | `babylon-world-runtime.ts` 方形 `PhysicsShapeHeightField` / 非方 `PhysicsShapeMesh` |
| 步进落地 | `motion-kernel-runtime.ts` → `checkSupport` |
| Spawn 旁路 | 同文件 `hasWalkablePhysicalGroundAt` → `physicsEngine.raycast` |
| Object `supported-by` | `revalidateSupportAssertion` 用 AABB `maximumMetersXYZ[1]` |
| 水域权威 | `waterSurfaceHeightAtSubjectOrigin`：XZ 多边形 + `waterLevelMeters` |
| Spawn Y | `compile.ts` 直接拷贝 Anchor 世界坐标 |
| 分辨率方言 | ExecutionPlan `resolutionCellsXZ`；Layout `resolutionVerticesXZ`；Runtime 按 vertex 建网格 |
| Havok Heightfield API | 锁定版本 `HP_Shape_CreateHeightField(numX, numZ, scale, heights)`，无 hole 参数 |

未做、也不应被本文冒充已做的事：

- 没有对锁定的 `@babylonjs/havok@1.3.14` 跑 Heightfield Hole/Static Triangle Collider
  行为探针；当前只核对锁文件与已安装精确版本源码。
- 没有开始 H1 桥 Prototype 或公共 Schema。
- 没有把本文升格为规格；规格仍是 Draft。

---

## 8. 维护者 Disposition（2026-08-21）

本评审按“修改后采纳”处理，并并入同一 PR。权威结论已经回写主规格和 Backlog；本文保留
为审查证据与取舍记录，不作为第二份协议。

### 已采纳

- Heightfield + Opening + Static Structure + Collider-backed Surface 的混合拓扑；
- Kit/Compiler 确定性展开，普通 AI 不手写 Collider、Opening 或引擎参数；
- Walkable Surface 禁止独立作者 vertex buffer，Navigation 只能从同源 Collider +
  Profile 派生；
- Height Vertex Grid 与 Opening Cell Mask 的索引域必须分别命名并一次性迁移历史方言；
- H1 只做 Bridge/Cliff 最小闭合集，稳定 Surface ID 从首个 Fixture 生效；
- Spawn Raycast 与 Object AABB 顶面是 H1 支撑权威收口的迁移阻断，不作为当前线上 Bug
  立即修改。

### 修改后采纳

- 不冻结 `requiresTerrainOpening: boolean`；冻结闭合 Opening Contract，并要求“必须
  Opening”分支引用内容寻址 Recipe，具体字段由 H0 Fixture 决定。
- Static Triangle Collider 是当前 Babylon/Havok 的候选默认路径，不是已验证事实；源码
  证据与可执行行为探针分层记录。
- AI-facing 连通意图复用现有 Route/Region Graph；后续 Portal Runtime Metadata 可以从
  同一身份派生，避免把特定引擎的 Portal 实现误写成普遍行业定律。
- Surface ID 使用稳定逻辑 Subshape ID 与 resolved Resource Version，不使用数组序号、
  Runtime Handle 或匿名 Hash 索引。
- AI 示例按当前 Canonical V3 修正，不保留旧 `transform`/节点内 `constraints` 方言。

### 延后到 H0/H1 实施计划

- 锁版本 Static Triangle Collider、Character Controller、Winding/Sidedness、矩形 Tile、
  Shape Lease 和 Dispose 可执行探针；
- Bridge Fixture 的具体尺寸、Seam/Clearance 阈值与 Performance Profile 数值；
- `resolutionCellsXZ` 历史命名迁移以及两条支撑旁路的源码修改；
- H1 公共字段、Runtime Adapter 与 Bridge Prototype 实现。
