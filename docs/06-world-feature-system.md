# 自由世界特征扩展协议

> 当前 Alpha 已实现 Circle、Ellipse、Polygon 与高度场组合；Curve/Path、通用 SDF 和完整道路工具仍是计划能力。下方 World Kernel 树同时列出当前与目标内容。

## 1. 目标

SDK 不预先实现所有山川湖泊和建筑名词，而是提供有限、稳定的空间操作，让 Coding Agent 自己定义新的世界特征，并让运行时能够追踪、检查、更新和删除其产物。

```text
SDK 提供空间操作动词
        ↓
Agent 定义 World Feature
        ↓
Feature Registry 记录定义与参数
        ↓
World Compiler 生成引擎无关数据，Babylon/Havok Adapter 创建运行资源
```

## 2. World Kernel

第一期目标的最小世界内核：

```text
World Kernel
├── Shape
│   ├── Circle / Ellipse / Polygon
│   ├── Curve / Path                    [Planned]
│   └── SDF                             [Planned]
├── Terrain
│   ├── Heightfield
│   ├── Raise / Lower
│   ├── Flatten / Smooth
│   └── Noise
├── Geometry
│   ├── Primitive
│   ├── Transform / Hierarchy
│   └── Compound
├── Surface
│   ├── Ground
│   └── Water
├── Physics
│   └── Collider
├── Semantic
│   ├── Surface Type
│   └── Appearance Binding
└── Feature Registry
    ├── Define / Instantiate
    ├── Inspect / Update
    └── Rebuild / Remove
```

## 3. Feature 定义

```ts
const Lake = defineWorldFeature({
  type: "custom.lake",
  version: 1,

  schema: {
    center: "vec2",
    radius: "vec2",
    depth: "positiveNumber",
    waterLevel: "number",
    seed: "integer",
  },

  build(ctx, params) {
    const boundary = ctx.shape.noisyEllipse({
      center: params.center,
      radius: params.radius,
      seed: params.seed,
    });

    const basin = ctx.terrain.lower({
      area: boundary,
      amount: params.depth,
      falloff: "smooth",
    });

    const water = ctx.surface.water({
      area: boundary,
      elevation: params.waterLevel,
    });

    ctx.semantic.bind(water, {
      type: "lake_water",
      prompt: "a clear natural lake",
    });

    return { boundary, basin, water };
  },
});
```

Agent 可以使用同一协议定义山脉、峡谷、道路、岛屿或新的标志物组合。

## 4. 可追踪性

每个 Feature Instance 记录：

- 唯一实例 ID
- Feature 类型和版本
- 定义源文件与内容哈希
- 输入参数与随机种子
- 依赖的其他 Feature
- 产生的 Mesh、Collider、Surface 和语义区域
- 顶点、碰撞体、构建时间等资源消耗

Feature 拥有其全部输出资源。更新或删除 Feature 时，SDK 能精确重建或清理相关资源。

## 5. 约束

Agent 不能直接向 renderer scene 或 physics world 添加不透明对象，而应通过 `BuildContext`
修改世界。Feature 必须：

- 声明参数 schema
- 使用确定性随机种子
- 通过 `ctx` 创建资源
- 返回结构化结果
- 接受顶点数、碰撞体数、构建时间和内存预算
- 能够被独立重建和删除

底层 Provider 对象不作为未来 Agent 扩展入口；算法扩展必须经过版本化 Adapter/Plugin 合同。

## 6. 第一期参考 Features

SDK 官方只需提供少量范例：

- `RollingTerrainFeature`
- `LakeFeature`
- `CompoundLandmarkFeature`

验收时应让 Coding Agent 在不修改 SDK 内部代码的情况下，再自行定义一种新的 Terrain Feature，以验证自由扩展能力。
