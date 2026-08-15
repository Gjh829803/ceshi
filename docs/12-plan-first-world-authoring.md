# Plan-first 世界创作协议

## 1. 为什么先规划

一句话通常只描述几个物体，一张透视图通常只展示世界的一面。直接写几何会让 Coding Agent 随机补全不可见区域，也难以判断“看起来像”究竟是地形、镜头还是表面风格造成的。

本项目把创作拆成职责隔离、可检查的阶段：

```text
用户文字 / 参考图
        ↓
World Planner：OutdoorWorldSpec + WorldPrompt + Entity Catalog
        ↓
Codex imagegen：World Plan + Opening Shot
        ↓
plan-lock.json：冻结规划
        ↓
World Builder：可玩的白膜实现
        ↓
SDK：真实 Top-down + Height/Slope + Opening Shot + 白膜三视图
        ↓
Visual Bible：样式三视图 + 渲染首帧
```

这不是用两张图替代结构化世界。`WorldSpec` 是设计契约，编译后的白膜是运行时真相，两张生成图是人和模型都容易理解的空间意图证据。

## 2. 三类规划工件

| 工件 | 产生者 | 表达什么 | 不表达什么 |
|---|---|---|---|
| World Plan | Codex 内置图片生成 | 整个世界的俯视拓扑、区域、路线和标志物关系 | 精确高度、碰撞、真实坡度 |
| Opening Shot | Codex 内置图片生成 | 玩家进入后的前中后景、视线和关键轮廓 | 世界背面和不可见区域 |
| Height/Slope Plan | SDK 从已构建地形派生 | 真实高度、局部坡度、主要路线可通行性 | 最终美术风格 |

World Plan 必须是严格正交俯视，不带透视，不依赖文字标签。Opening Shot 必须固定主体位置、朝向、镜头 pitch/distance/FOV 和可见标志物。高度坡度图不能交给图片模型猜测。

## 3. WorldSpec 是什么

`OutdoorWorldSpec` 至少声明：

- 可交付给世界模型的 WorldPrompt：世界身份、空间、环境、光线、风格、首帧和不可变约束。
- 所有主体、NPC、标志物和客体的 Entity Catalog：Prototype、Instance、稳定运行时绑定和唯一实例色。
- 世界边界与预期高度范围。
- 基础地貌，以及显式 terrain regions。
- 水体、标志物和稳定 Feature ID。
- 主要/次要路线、宽度和最大坡度。
- 进入点、主体朝向、镜头和前中后景。
- 三类规划工件的生成方式和项目内 URI。
- 必须由白膜实现的 Feature ID。
- 每一项信息的证据来源。

Entity Catalog 的 Prototype 是视觉定义单元，Instance 是世界中的具体对象。多个相同房屋可共享一个 Prototype，但每个房屋都有独立 Instance 与绑定。每个 Prototype 固定声明 Front / Right / Back 的白膜三视图和样式三视图路径；白膜图必须由 SDK 从真实运行时捕获，不能由图片模型想象。

证据分四类：

- `user-explicit`：用户明确说过。
- `reference-visible`：参考图中直接可见。
- `planner-inferred`：为了连成完整可玩世界而做的必要推断。
- `planner-optional`：不影响核心世界、以后可替换的创意补充。

这样 Agent 可以发散，但不能把自己的补充伪装成用户要求。修改规划时也能判断哪些内容可以自由重做。

## 4. 目录与命令

一个新场景使用同一个稳定 ID：

```text
apps/playground/src/scenes/plans/<id>.ts
apps/playground/src/scenes/<scene-file>.ts
apps/playground/public/scene-plans/<id>/world-plan.png
apps/playground/public/scene-plans/<id>/opening-shot.png
apps/playground/public/scene-plans/<id>/prototypes/<prototype-id>/whitebox-triview.png
apps/playground/public/scene-plans/<id>/prototypes/<prototype-id>/styled-triview.png
apps/playground/public/scene-plans/<id>/opening-frame-rendered.png
artifacts/scenes/<id>/*.json
```

推荐入口：

```bash
pnpm agent:plan -- --scene-id coastal-overlook \
  --image /absolute/reference.png \
  "创建一个从花坡俯瞰海湾的可玩白膜世界"
```

Planner 完成后会生成并验证冻结锁。评审通过，再让独立 Builder 接手：

```bash
pnpm plan:check -- --scene coastal-overlook
pnpm agent:build -- --scene-id coastal-overlook
```

实现后导出并锁定结构化规划工件：

```bash
pnpm plan:scene -- --scene coastal-overlook
pnpm plan:scene:check -- --scene coastal-overlook
```

`plan:scene` 在图片缺失、WorldSpec 缺失或实际路线违反坡度约束时失败；`plan:scene:check` 在已提交 JSON 与当前场景不一致时失败。

浏览器验收后导出 SDK 白膜三视图，并启动 Visual Bible：

```bash
pnpm visual:inputs -- --scene coastal-overlook
pnpm agent:visual -- --scene-id coastal-overlook
```

`agent:scene` 可以连续运行 Planner 和 Builder，但两个阶段仍是独立 Agent 调用，中间存在冻结门禁。Visual Bible 始终单独执行。

## 5. 运行时校验接口

Playground 的 `window.__WHITEBOX_PLAYGROUND__` 目前为 automation API v2，新增：

```ts
getWorldSpec();
getPlanArtifacts();
capturePlanningView("world-plan");
capturePlanningView("height-slope-plan");
capturePlanningView("opening-shot");
getVisualPrototypes();
captureWhiteboxTriview("prototype-id");
exportWhiteboxTriviews();
```

- `world-plan` 是真实白膜的正交俯视截图。
- `height-slope-plan` 是 SDK 根据真实高度场生成的确定性颜色图。
- `opening-shot` 会复位到 WorldSpec 指定的进入镜头再截图。
- `captureWhiteboxTriview` 会隐藏其他网格，以 Prototype 唯一实例色正交捕获 Front / Right / Back。
- `exportWhiteboxTriviews` 只在本地 Vite 开发服务器中写入声明好的项目路径。

第一版要求人或 Agent 对比生成参考图与真实截图。后续可增加语义分割、轮廓/区域 IoU、标志物屏幕位置误差和路线覆盖率等自动评分，但不能只用一个视觉相似度分数替代可玩性检查。

## 6. 与世界模型、Runtime Director 的关系

- Coding Agent 在创作期读取 WorldSpec，用创作 SDK 构建白膜。
- 世界模型在渲染期消费白膜状态、语义和外观提示；规划图可作为风格/构图辅助条件，但不覆盖白膜位置。
- Runtime World Director 在运行期使用同一套稳定 Entity/Feature ID 和受控 SDK 命令改变位置、大小、显隐、动作或 NPC 任务。
- Director 的修改先进入白膜，再由 Render Bridge 输出给世界模型。它不会直接修改生成画面来假装世界已经改变。

因此，`WorldSpec → Feature ID → Runtime Entity → Render Binding` 是创作期、运行期和生成式渲染之间的追踪主线。

## 7. 当前边界

当前完整迁移样例是 `grassland`；其规划已冻结、白膜已验证，玩家和高塔两个 Prototype 的真实白膜三视图已导出。样式三视图与渲染首帧留给 Visual Bible 阶段。其他目录场景仍作为旧 DSL 与实验回归样例存在。当前协议面向室外高度场，不声称支持洞穴、倒悬几何或完整室内；视觉差异自动评分仍是后续工作。
