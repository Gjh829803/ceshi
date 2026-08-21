# Hybrid Terrain 与非 Heightfield 特殊地形设计

## 1. 文档状态

- 状态：Draft，已进入长期 Roadmap；首个公共字段和纵向切片仍需专项评审后冻结。
- 所属系统：Agent Whitebox World SDK。
- 上位规格：
  - [`AI-first LEGO Game SDK 总设计`](2026-08-17-ai-first-lego-game-sdk-design.md)
  - [`AI-first Terrain Authoring Pipeline`](2026-08-17-terrain-authoring-pipeline-design.md)
  - [`AI Authored Geometry Extension`](2026-08-20-ai-authored-geometry-extension-design.md)
- 相关能力：Canonical Terrain、静态 Object/Prototype、Collider、Surface Semantics、
  Placement、Runtime Physics、Camera、Validation 和未来 Navigation。
- 当前实现状态：尚未实现。本文件不会把洞穴、悬挑、桥下空间或完整室内描述为当前
  可交付能力，也不改变 [`Canonical JSON 快速接入`](../../17-canonical-json-quickstart.md)
  中的现状边界。

本文定义长期支持桥梁、桥洞、垂直崖壁、天然拱门、悬挑、洞口、洞穴和多层可行走
空间时的稳定架构。目标不是用一种几何表示承载整个世界，而是让不同拓扑使用最适合
它们的表示，并在统一的物理、语义、查询、验证和资源生命周期边界下组合。

## 2. 决策摘要

长期方案采用 **Heightfield Terrain + Terrain Opening + Static Structure + Walkable
Surface + Interior Region/Portal** 的混合拓扑架构：

```text
World
  ├── Heightfield Terrain
  │     └── 连续地表、丘陵、山地、道路、海岸、湖床
  ├── Terrain Opening
  │     └── 洞口、隧道入口、需要移除地形三角形与碰撞的区域
  ├── Static Structure
  │     └── 桥、崖壁、拱门、洞穴外壳、洞穴地板/墙壁/顶部
  ├── Walkable Surface
  │     └── 桥面、洞穴地板、平台等可被主体支撑的表面
  ├── Interior Region
  │     └── 洞穴内部、隧道、室内等空间语义和环境上下文
  └── Portal / Route Connection
        └── 室外与洞穴、隧道两端、上下层路线之间的稳定连接
```

冻结以下方向：

1. Heightfield 继续负责大面积连续自然地表，不升级成可表达所有拓扑的万能数据结构。
2. 非 Heightfield 结构是版本化、内容寻址的 Object/Structure 资源，不是对 Babylon Scene
   的不透明副作用。
3. 洞穴不是一个包含所有数据的巨型 `cave` 节点，而是 Opening、Structure、Region、
   Portal 和 Surface 的可组合装配。
4. 视觉几何、碰撞几何、可行走语义和空间区域分别拥有自己的权威数据；它们通过稳定
   Entity/Resource Ref 关联，不互相猜测。
5. Runtime 的实际落地状态只由物理接触和唯一的 Ground Support Resolver 拥有；
   Height Query、Raycast、动画或水域分类不能独立推断第二份 `isGrounded`。
6. AI 只选择 Prototype、Capability、Profile 和结构化关系，不接触 Babylon/Havok
   Handle，也不需要理解 Triangle Mesh Collider 的引擎参数。
7. Voxel/SDF、运行时挖洞、可破坏地形和任意 Boolean CSG 不进入首批生产路线。

## 3. 为什么 Heightfield 不能单独解决

Heightfield 本质上是 `height = f(x, z)`：同一个 XZ 坐标只能得到一个高度。它适合大面积
户外地表，但无法同时表达：

- 桥面与桥下地面；
- 洞穴地板与洞顶；
- 悬挑岩石的上表面与下表面；
- 垂直墙面两侧或多层平台；
- 隧道上下方仍存在的自然地表。

这不是 Babylon、Godot、Unity 或 Unreal 某个实现的缺陷，而是二维高度场表示本身的
拓扑约束。Godot 的
[`HeightMapShape3D`](https://docs.godotengine.org/en/4.4/classes/class_heightmapshape3d.html)
明确说明 Heightmap 不能存储洞穴等悬挑结构。Unity 的
[`Terrain Holes`](https://docs.unity3d.com/ja/2023.2/Manual/terrain-PaintHoles.html)
使用 Mask 移除 Terrain 的视觉、碰撞和 NavMesh 信息，并建议使用岩石 Mesh 衔接洞口；
Unreal 的
[`Landscape Visibility`](https://dev.epicgames.com/documentation/en-us/unreal-engine/visibility?application_version=4.27)
同样通过 Landscape Hole 配合额外 Static Mesh Actor 创建洞穴。

因此，本 SDK 采用与这些成熟工具一致的混合方式，而不是把 Heightfield 替换成难以验证、
难以流式加载的全 Mesh 世界。

## 4. 目标与非目标

### 4.1 目标

- 让同一 XZ 上的桥面、地面和洞穴地板可以分别参与渲染、碰撞和支撑查询。
- 让桥、崖壁、洞口和洞穴在白模阶段已经具备正确尺度、碰撞、净空和可玩路线。
- 保持 Terrain、Structure、Surface、Region 和 Portal 的职责正交，可以独立演进和测试。
- 保持 Canonical Schema、Normalized IR、ExecutionPlan 与 Babylon/Havok Adapter 解耦。
- 让 AI 优先复用 Registry Prototype；目录缺失时才使用受控 Geometry Recipe 或锁定资产。
- 让布局、运行时、Capture 和 Validation 使用稳定 Entity ID 与相同资源 Hash。
- 支持 Tile/Cell 级加载、卸载、LOD 和资源预算，而不改变 Gameplay Surface 身份。
- 为未来多层 Navigation、NPC 和 Streaming World 保留明确接口，但不提前实现完整 Gameplay。

### 4.2 非目标

- 首批切片不实现完整室内编辑器、NPC NavMesh、任务系统或光照烘焙系统。
- 不把视觉上存在的 Mesh 自动判定为可行走、可攀爬或可游泳。
- 不允许动态 Object 使用任意 Concave Triangle Mesh Collider。
- 不根据 Mesh 名、材质名、颜色或模型文件名推断 Gameplay 语义。
- 不在 Runtime 执行 AI 生成的 JavaScript、Shader、Blender 脚本或 Babylon 代码。
- 不承诺任意外部 GLB 自动获得正确洞穴 Collider、Portal 和可玩路线。
- 不用 Voxel/SDF 解决当前不需要的破坏、运行时雕刻或无限体积世界问题。

## 5. 权威职责与数据边界

### 5.1 Heightfield Terrain

Heightfield 仍是以下内容的唯一真相：

- 连续户外地表高度；
- 大面积坡度、法线和地表语义；
- Spawn、Route、Water、Platform 等 Terrain Constraint；
- Terrain Tile、LOD、Height/Slope Debug Artifact；
- 未被 Opening 移除区域的 Terrain Collider。

非 Heightfield Structure 不修改 `NormalizedTerrainIR.heightRaster`。如果结构需要在地形上
开口，必须通过显式 Terrain Opening 产生新的 Mask/Tile 编译结果，不能在 Runtime 隐藏
Mesh 却保留原碰撞。

### 5.2 Terrain Opening

Terrain Opening 是内容寻址的地形控制层，不是材质透明效果。它至少需要锁定：

- Opening 的稳定 ID；
- 关联 Terrain Entity；
- 世界空间或 Raster 空间边界；
- 对 Visual、Physics、Query 和未来 Navigation 的一致移除语义；
- 与衔接 Structure/Portal 的引用；
- Tile、Mask、Compiler Profile 与结果 Hash。

后端原生 Heightfield 不支持洞时，Compiler/Runtime Adapter 必须为受影响 Tile 生成预算内
的静态 Triangle Collider 或其他已验证表示。禁止视觉开洞但保留不可见碰撞，也禁止只
删除碰撞而保留错误的 Terrain Query。

### 5.3 Static Structure

Static Structure 是一般 Object/Prototype 的环境用途，不新建与 Object 竞争的公共对象
体系。它可以引用：

- Registry Prototype；
- 内容寻址 Geometry Definition；
- 锁定的产品资产；
- 受控 Geometry Recipe 编译产物。

Structure 至少包含或解析出独立的 Visual Geometry、Collider Definition、Bounds、Pivot、
Forward Axis、Semantic Class、Resource Cost 和可选 Surface/Portal Binding。桥、拱门、
崖壁、洞穴外壳只是不同 Prototype/Assembly，不需要在 Canonical Schema 中持续增加新的
顶层 `kind`。

### 5.4 Walkable Surface

Walkable Surface 表达“某个已存在的碰撞表面可以怎样被主体使用”，不复制 Mesh 顶点或
Collider 数据。它负责：

- 稳定 Surface ID 与所属 Entity ID；
- 可行走区域或 Collider Subshape 的引用；
- Surface Semantic/Profile Ref；
- 坡度、净空、单/双面和边缘策略；
- 允许的 Locomotion/Subject Profile；
- 进入、离开和失去支撑时的固定 Tick 语义。

`walkable` 不是任意 Mesh 的默认属性。没有显式 Surface Capability 的 Structure 可以阻挡
主体，但不能自动成为 Placement、Route 或 Navigation 的合法支撑面。

### 5.5 Interior Region 与 Portal

Interior Region 描述空间上下文，不拥有几何：例如洞穴内部、隧道、室内或半开放拱廊。
它可影响环境、音频、Camera Context、Capture 标签和未来 Gameplay，但不能取代 Collider
或 Walkable Surface。

Portal 连接两个 Region 或 Route Node，记录入口几何、方向、宽高、净空、通行 Profile、
关联 Structure 和稳定 ID。洞穴入口既需要 Terrain Opening/Structure 的几何衔接，也需要
Portal 的空间连通语义；只看到一个洞不代表路线已连通。

## 6. AI-facing 表达原则

普通 Agent 的默认路径是选择已经验证的 Prototype，而不是描述完整网格：

```json
{
  "id": "stone-bridge-01",
  "kind": "object",
  "prototypeRef": "worldkit://prototype/stone-arch-bridge@1",
  "transform": {
    "positionMetersXYZ": [24, 3, -18]
  }
}
```

上例中的白模几何、Collider、可行走桥面、Bounds、Anchor 和资源预算由 Prototype/Registry
解析。Agent 只表达实例身份、位置、引用和必要约束。

当目录缺少独特结构时，按以下优先级降级：

1. 注册 Prototype/Kit；
2. 受控 `compound`、`extrude`、`sweep`、`deform` Geometry Recipe；
3. 经过预算、拓扑、安全和 Hash Gate 的 `MeshDraft` 或产品 GLB；
4. 无法满足时返回 Capability Gap/Change Request，不执行任意 Runtime 代码。

未来公共字段冻结时继续遵守：持久定义使用 `kind`，资源使用 `...Ref`，当前对象使用
`id`，本地引用使用 `...EntityId`/`...SurfaceId`/`...PortalId`，数值显式携带
`Meters`/`Degrees`/`XYZ`/`XZ`。本文件只冻结职责和命名规则，不提前冻结未经 Fixture
验证的完整字段集合。

## 7. Compiler 与 Runtime 数据流

```text
AuthoringSpec
  ├── Terrain Source / Opening Controls
  ├── Object Instances / Prototype Refs
  ├── Region / Portal / Route Intent
  └── Placement Constraints
        ↓
Normalizer + Registry Lock
        ↓
Terrain Compiler
  ├── authoritative Height/Mask/Tiles
  └── Opening results
        ↓
Structure Compiler
  ├── visual geometry descriptors
  ├── collider descriptors
  ├── walkable-surface descriptors
  └── bounds/resource inventory
        ↓
Layout + Connectivity Validation
        ↓
Normalized World IR / ExecutionPlan
        ↓
Runtime Adapters
  ├── Babylon visual resources
  ├── Havok terrain/static colliders
  ├── Surface/Region/Portal index
  └── ownership leases
```

Terrain Compiler 和 Structure Compiler 分别拥有自己的输入与缓存，但最终在 Layout、
Connectivity 和 Validation 阶段汇合。Runtime 不重新生成 Collider、不重新判断 Opening，
也不从 Visual Mesh 反推 Walkable Surface。

## 8. 支撑表面与多层空间查询

单一 `terrainHeight(x, z)` 只能回答 Heightfield，高层世界需要一个引擎无关的 Surface
Query 边界。候选结果至少包含：

```ts
interface SupportSurfaceHit {
  readonly surfaceEntityId: string;
  readonly supportPointMetersXYZ: readonly [number, number, number];
  readonly normalXYZ: readonly [number, number, number];
  readonly distanceMeters: number;
  readonly semanticClassId: string;
  readonly sourceKind: "terrain" | "structure";
}
```

这只是候选查询结果，不等于 Runtime 的实际落地状态。权威规则是：

1. Layout、Route 和离线验证可以通过 Surface Query 查询指定射线或范围内的候选表面。
2. Runtime Character Controller 的实际支撑由 Havok Contact/Controller 结果产生。
3. 唯一 Ground Support Resolver 将物理接触映射到稳定 Surface/Entity ID，并输出 Ground
   Support、坡度、法线和 Surface Semantic。
4. Movement Medium、Action、Animation 和 Camera 只消费该已解析状态，不能各自再次
   Raycast 或调用 Terrain Height 推断 `ground`。
5. 桥边、洞口、Opening Seam 和控制权切换必须具有明确迟滞、顺序和 Reset 语义。

同一 XZ 上存在多个表面时，查询必须携带 3D Origin、方向、最大距离和过滤条件，返回按
距离稳定排序的命中；不能通过“取最高 Y”或“总是取 Terrain”猜测。

## 9. 物理与 Collider 最佳实践

视觉与物理必须分离：

| Motion Mode | 允许的 Collider | 说明 |
|---|---|---|
| Static environment | Primitive、Convex、Compound、预算内 Static Triangle Mesh | 桥、洞穴墙体和大型崖壁可以使用简化 Triangle Mesh |
| Kinematic | Primitive、Convex、Compound | 不使用任意 Concave Triangle Mesh |
| Dynamic | Primitive、Convex、Compound | 需要质量、惯量和质心 Profile |
| Visual only | None | 不能阻挡或支撑主体 |

Godot 的官方
[`3D Collision Shapes`](https://docs.godotengine.org/en/stable/tutorials/physics/collision_shapes_3d.html)
同样建议动态对象优先使用 Primitive/Convex，并将 Concave/Trimesh 限制为 Static Body；
大型关卡应使用简化碰撞网格而不是把所有视觉细节送入物理系统。本 SDK 将该原则落实为
引擎无关 Collider Profile 和编译期 Gate，而不是依赖 Babylon/Havok 默认行为。

额外规则：

- Visual、Collider、Walkable Surface 分别生成 Hash 和 Debug Overlay。
- Static Triangle Collider 必须移除退化/重复面，固定 Winding/Sidedness 和局部 Transform。
- 洞穴外壳可以是开放视觉网格，但支撑/阻挡 Collider 必须满足所选 Profile 的拓扑要求。
- Opening 边缘、Terrain 与 Structure 接缝不得形成不可见墙、跌落缝或角色卡点。
- Collider Shape/Body/Visual Asset 分别拥有 Lease；卸载 Tile 或 Structure 不得提前释放共享资源。
- Runtime Adapter 的后端能力差异由版本化 Runtime Import Profile 和 Conformance Fixture
  处理，不能泄漏成 AI-facing 方言。

## 10. 典型结构如何组装

### 10.1 垂直崖壁

- Heightfield 表达崖顶、崖底和两侧连续地表。
- 独立 Static Structure 表达垂直/负坡度岩壁轮廓。
- 简化 Collider 负责阻挡；只有崖顶/崖底声明 Walkable Surface。
- Terrain 与崖壁交界必须通过 Seam Gate。

### 10.2 桥与桥洞

- 桥是 Object/Prototype Instance，不是 Terrain 的凸起。
- 桥面具有 Walkable Surface，桥墩/拱体具有静态 Collider。
- 桥下保持原 Terrain 或 Water，形成同一 XZ 上的两层空间。
- Route Graph 分别连接桥上路线和桥下路线；没有 Portal/Route Connection 时不能假定互通。

### 10.3 天然拱门和悬挑

- 主体轮廓使用 Static Structure Mesh。
- 上表面只有显式声明且通过坡度、边缘、净空 Gate 后才能行走。
- 下方通道验证最小净空、碰撞面朝向和 Camera 穿透。

### 10.4 洞穴

洞穴是 Assembly：

```text
Terrain Opening
  + Entrance Structure
  + Interior Shell / Floor / Wall Collider
  + Walkable Cave Floor
  + Interior Region
  + Exterior ↔ Interior Portal
  + Route Connection
```

如果只是远景洞口，可以只交付 Visual/Static Collider 并明确不可进入；可进入洞穴必须
同时通过 Opening、Collider、Surface、Portal、净空、路线和 Camera Gate，不能因截图看见
洞口就宣称 Gameplay 已支持。

### 10.5 完整室内与多层建筑

完整室内复用 Structure、Surface、Region 和 Portal，但需要额外的 Room/Cell Streaming、
Visibility、Camera、Navigation 和更复杂的构图要求。它属于后续独立纵向切片，不因为
基础洞穴切片完成就自动获得生产支持。

## 11. Validation 与 Golden Fixtures

### 11.1 必需 Fixture

1. **Bridge Two-Level Fixture**：同一 XZ 同时存在桥面与桥下地面；从不同 Y 发起查询得到
   正确 Surface，主体可从桥上通过且不会吸附到桥下。
2. **Terrain Opening Fixture**：洞口的 Render、Physics、Height/Surface Query 和 Debug
   Overlay 一致移除，没有不可见 Terrain Collider。
3. **Cliff/Overhang Fixture**：垂直崖壁和悬挑下通道没有穿模、卡点或错误可行走面。
4. **Cave Entrance Fixture**：室外 Terrain → Portal → 洞穴地板连续可走，入口净空、坡度、
   Camera 和碰撞接缝通过。
5. **Resource Lifecycle Fixture**：重复加载/卸载 Tile 与 Structure，无 Body、Shape、Mesh、
   Listener、Surface Index 或 Portal 残留。
6. **AI Authoring Conformance Fixture**：普通 AI Schema Profile 只允许 Agent 提交稳定
   `prototypeRef`、实例 Transform 和必要 Placement/Route Constraint；Bridge/Cave Kit 的
   Collider、Opening、Surface、Region 和 Portal 由 Registry/Compiler 确定性展开。至少
   两个结构化输出 Adapter 使用同一 Canonical 字段生成有效 Fixture，并能根据结构化
   Diagnostic 完成修复，不创建 Provider 方言或底层引擎字段。

### 11.2 阻断 Gate

- Schema/Registry/Hash/Resource Lock 完整；
- 普通 AI Schema Profile 不暴露 Collider、Opening、Surface、Portal 或 Babylon/Havok
  实现字段；高级 Profile 只能使用显式允许且仍属于 Canonical Schema 的组合字段；
- Geometry 与 Collider Topology 分别合格；
- Visual/Collider/Surface ID 集合和 Transform 一致；
- Terrain Opening 在当前 Render、Physics、Query 三个通道一致；未来存在 Navigation
  数据时，Opening 必须同步进入 Navigation 编译，不能保留旧可行走区域；
- Surface Query 多层排序、边缘和最大距离稳定；
- 物理接触与 Ground Support Resolver 结果一致；
- Spawn/Route 不落在无支撑区域，Portal 两端存在安全落点；
- 坡度、台阶、净空、角色半径、跌落和桥边安全满足 Profile；
- 30/60/120 Hz-like Render 调度不改变 Fixed Tick 接触与 Replay；
- LOD/Streaming 不改变 Gameplay Surface ID、Collider 或支撑高度；
- Required Gate 缺失或失败不能被 Opening Shot/总体分数抵消。

### 11.3 调试与 Agent 修复

CLI/Browser 至少需要输出：

- Terrain Opening Mask；
- Visual/Collider/Walkable Surface Overlay；
- Surface ID、Region ID 与 Portal Connection；
- 多层 Support Ray 命中列表；
- Seam、Clearance、Slope 和 Route Failure；
- 资源 Hash、Profile Ref、Tile/Cell 归属和修复建议。

Agent 修复必须回到 AuthoringSpec/WorldChangeSet，重新 Normalize、Compile 和 Gate；不能通过
浏览器脚本移动 Collider、隐藏 Terrain 或修改 Babylon Node 绕过权威制品。

## 12. LOD、Streaming 与性能

- Heightfield 和 Structure 可以使用不同 LOD，但 Gameplay Collider/Surface 的语义保持稳定。
- 大型洞穴/桥梁按 World Cell 或明确 Structure Chunk 拆分，边界属于编译产物而不是 Agent
  临时切割结果。
- Terrain Opening 必须按 Tile 编译并进入 Tile Hash；Structure/Portal 不得在对应 Opening
  尚未就绪时发布为可进入状态。
- Host 以原子 Cell/Dependency Set 加载 Visual、Collider、Surface、Region 和 Portal；部分
  构造失败时逆序释放并保持旧稳定世界。
- Static Triangle 数、Collider Shape 数、Surface 数、Portal 数、包体字节、加载时间和峰值
  内存进入版本化 Performance Profile。
- 远景可使用简化 Visual LOD；近景/可玩区域的 Collider 与支撑高度只能按已验证 Profile
  切换，不能跟随 Render LOD 任意变化。

## 13. 与 AI 自定义几何的关系

特殊地形能力不依赖“AI 直接生成 Mesh”才能成立。首批生产路径应优先使用经过产品和 SDK
验证的 Registry Prototype/GLB。AI Authored Geometry 只是 Structure Geometry 的可替换
制作来源之一：

```text
Registry Prototype ─┐
Product GLB ────────┼→ Canonical Geometry/Collider Resource → Structure Instance
Geometry Recipe ────┤
Validated MeshDraft ┘
```

无论来源如何，都必须生成相同类型的锁定 Geometry/Collider/Inventory/Provenance 制品，
并通过相同 Gate。Provider 差异不能改变 Canonical Object、Surface、Region 或 Portal 字段。

## 14. 分阶段实施顺序

### H0：协议与 Fixture 冻结

- 评审本文并冻结首个 Bridge Fixture 的范围。
- 冻结 Terrain Opening、Static Structure Resource、Walkable Surface 和 Support Query 的
  职责，不一次冻结完整室内协议。
- 在 Validation Profile 中增加 Multi-Surface、Opening、Seam 和 Clearance Gate。

### H1：桥梁/垂直崖壁纵向切片

- 接入一个版本化白模桥 Prototype 和简化 Static Collider。
- 实现 Structure Walkable Surface 与统一 Support Surface Query。
- 同一 XZ 上验证桥面/桥下地面的双层命中和实际物理支撑。
- CLI/Browser 输出 Surface/Collider Overlay 与确定性截图。

### H2：Terrain Opening 与洞口纵向切片

- 实现内容寻址 Opening Mask 和受影响 Tile 的 Render/Collider/Query 一致编译。
- 接入洞口 Structure，验证接缝、净空、Camera 和失足/落地行为。
- 后端 Heightfield 不支持洞时，验证静态 Tile Mesh Collider 回退和资源预算。

### H3：可进入洞穴纵向切片

- 增加 Interior Region、Portal 和 Route Connection。
- 实现洞穴地板/墙体/顶面 Collider 与 Walkable Surface。
- 固定 Tick 验证室外→洞穴→室外、Reset、控制切换、Capture 和 Replay。

### H4：Streaming/LOD 与多实例收敛

- 原子加载/卸载 Terrain Tile、Opening、Structure、Surface、Region 和 Portal。
- 验证跨 Cell 接缝、共享 Shape Lease、失败回滚和性能预算。
- Render LOD 切换不得改变 Surface ID 或 Gameplay 支撑。

### H5：按产品需求扩展

- 多层 Navigation 与 NPC Route；
- 完整室内 Room/Portal/Visibility；
- 更复杂 Camera Context、音频和环境切换；
- 只有出现明确的运行时雕刻/破坏需求后，才单独评估 Voxel/SDF。

H1～H4 每个阶段都必须有独立实施计划和 Golden Fixture。不能把一个可见洞口 Smoke Test
当作 H3/H4 完成证据。

## 15. 生产完成标准

只有同时满足以下条件，才能对外声明支持特殊地形：

1. AI 使用稳定 Prototype/Ref、Surface、Region 和 Portal 语义，无需接触引擎对象。
2. Heightfield、Opening、Structure 和 Collider 的边界没有双重真相。
3. 桥梁 Fixture 证明同一 XZ 多层表面的查询、物理支撑和路线行为正确。
4. 洞穴 Fixture 证明 Terrain Opening 的视觉、碰撞、查询和入口连接一致；引入 Navigation
   后，同一个 Opening 必须同步作用于 Navigation 数据。
5. Ground Support 只有一个 Runtime Owner；动画、Camera、Medium 不独立推断落地。
6. 静态与动态 Collider 兼容矩阵、拓扑和预算 Gate 全部通过。
7. 30/60/120 Hz-like 调度、Reset、Rebind、Replay 和多实例行为确定。
8. CLI/Browser 能解释 Surface/Region/Portal、Collider、Opening 和失败原因。
9. Streaming/LOD 不改变 Gameplay Surface 身份、支撑高度和碰撞结果。
10. 未支持的洞穴、室内、破坏或 Navigation 要求返回明确 Capability Gap，不静默降级。

## 16. 冻结决策与待评审字段

### 16.1 本文冻结的方向

- 采用 Heightfield + Structure 的混合拓扑，不切换为全 Mesh 或全 Voxel 世界。
- Terrain Opening 同时影响当前 Visual、Physics 和 Query；引入 Navigation 后同步影响
  Navigation 数据。
- Bridge/Cave 是可组合 Assembly，不增加不断膨胀的特殊顶层 Node Kind。
- Static Structure 可以使用预算内简化 Triangle Collider；动态对象不允许。
- Walkable Surface 必须显式声明，视觉 Mesh 不自动可走。
- 物理接触拥有实际 Ground Support；Surface Query 不创建第二份 Grounded 真相。
- Prototype、产品资产和 AI Geometry Provider 汇聚到相同锁定资源协议。
- 完整室内、多层 Navigation、Voxel/SDF 和破坏保持独立后续能力。

### 16.2 首个实施计划前必须评审

- Terrain Opening 的首个 Canonical Shape/Mask 表达和 Tile 编译规则；
- Structure Geometry/Collider Resource 的 Registry Manifest；
- Walkable Surface 与 Collider Subshape 的稳定绑定方式；
- Support Surface Query 的请求、结果、排序和预算；
- Runtime Contact → Surface Entity 的唯一映射与事件顺序；
- Bridge Fixture 的尺寸、路线、主体 Profile 和阻断阈值；
- Babylon 9.x/Havok 当前版本下 Heightfield Hole、Static Triangle Collider、Shape Lease 与
  Character Controller 接触语义的源码/探针证据；
- 何时引入 Region/Portal 公共字段，以及它们与现有 Region Graph/Route Graph 的唯一归属。
