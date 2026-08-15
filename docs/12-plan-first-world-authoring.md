# Plan-first 世界创作协议

## 1. 为什么先规划

一句话通常只描述几个物体，一张透视图通常只展示世界的一面。直接写几何会让 Coding Agent 随机补全不可见区域，也难以判断“看起来像”究竟是地形、镜头还是表面风格造成的。

本项目把创作拆成五个可检查阶段：

```text
用户文字 / 参考图
        ↓
整个世界的 OutdoorWorldSpec
        ↓
Codex imagegen：World Plan + Opening Shot
        ↓
Coding Agent：可玩的白膜实现
        ↓
SDK：真实 Top-down + Height/Slope + Opening Shot
        ↓
对比、修正、导出
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

- 世界边界与预期高度范围。
- 基础地貌，以及显式 terrain regions。
- 水体、标志物和稳定 Feature ID。
- 主要/次要路线、宽度和最大坡度。
- 进入点、主体朝向、镜头和前中后景。
- 三类规划工件的生成方式和项目内 URI。
- 必须由白膜实现的 Feature ID。
- 每一项信息的证据来源。

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
artifacts/scenes/<id>/*.json
```

推荐入口：

```bash
pnpm agent:scene -- --scene-id coastal-overlook \
  --image /absolute/reference.png \
  "创建一个从花坡俯瞰海湾的可玩白膜世界"
```

只先生成、评审世界定义与两张图：

```bash
pnpm agent:scene -- --scene-id coastal-overlook --plan-only \
  --image /absolute/reference.png \
  "先定义完整世界，不实现几何"
```

实现后导出并锁定结构化规划工件：

```bash
pnpm plan:scene -- --scene coastal-overlook
pnpm plan:scene:check -- --scene coastal-overlook
```

`plan:scene` 在图片缺失、WorldSpec 缺失或实际路线违反坡度约束时失败；`plan:scene:check` 在已提交 JSON 与当前场景不一致时失败。

## 5. 运行时校验接口

Playground 的 `window.__WHITEBOX_PLAYGROUND__` 目前为 automation API v2，新增：

```ts
getWorldSpec();
getPlanArtifacts();
capturePlanningView("world-plan");
capturePlanningView("height-slope-plan");
capturePlanningView("opening-shot");
```

- `world-plan` 是真实白膜的正交俯视截图。
- `height-slope-plan` 是 SDK 根据真实高度场生成的确定性颜色图。
- `opening-shot` 会复位到 WorldSpec 指定的进入镜头再截图。

第一版要求人或 Agent 对比生成参考图与真实截图。后续可增加语义分割、轮廓/区域 IoU、标志物屏幕位置误差和路线覆盖率等自动评分，但不能只用一个视觉相似度分数替代可玩性检查。

## 6. 与世界模型、Runtime Director 的关系

- Coding Agent 在创作期读取 WorldSpec，用创作 SDK 构建白膜。
- 世界模型在渲染期消费白膜状态、语义和外观提示；规划图可作为风格/构图辅助条件，但不覆盖白膜位置。
- Runtime World Director 在运行期使用同一套稳定 Entity/Feature ID 和受控 SDK 命令改变位置、大小、显隐、动作或 NPC 任务。
- Director 的修改先进入白膜，再由 Render Bridge 输出给世界模型。它不会直接修改生成画面来假装世界已经改变。

因此，`WorldSpec → Feature ID → Runtime Entity → Render Binding` 是创作期、运行期和生成式渲染之间的追踪主线。

## 7. 当前边界

当前完整迁移样例是 `grassland`；其他目录场景仍作为旧 DSL 与实验回归样例存在。当前规划协议面向室外高度场，不声称支持洞穴、倒悬几何或完整室内。两张参考图已经成为新场景门禁，但视觉差异自动评分仍是后续工作。
