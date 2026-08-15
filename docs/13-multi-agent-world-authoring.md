# 多 Agent 世界创作流水线

## 1. 结论

世界规划、白膜搭建和视觉定义由三个职责隔离的 Agent 完成。它们可以使用同一种 Coding Agent 模型，但不能是一次连续、无门禁的自由修改：每个阶段都从项目内的确定性工件接手，完成后由宿主脚本校验。Agent 调用和 Agent 产出代码的后置测试/构建/导出都运行在同一个 workspace-only、无网络 sandbox 中，避免通过宿主执行形成间接越界。

```text
用户文字 / 参考图片
        │
        ▼
World Planner Agent
  WorldSpec + WorldPrompt + Entity Catalog
  World Plan + Opening Shot
        │
        ▼  plan-lock.json（冻结）
World Builder Agent
  Three.js 白膜 + Rapier 碰撞 + 可玩主体
        │
        ▼  tests / build / SDK-derived plans（验收）
SDK 白膜三视图导出
  每种 Prototype 的 Front / Right / Back
        │
        ▼
Visual Bible Agent
  Styled tri-views + rendered opening frame
        │
        ▼
世界模型运行时条件
```

如果 Builder 或 Visual Bible 发现规划无法实现，它只能写 `artifacts/scenes/<id>/change-request.json`，不能绕过冻结锁改规划。启动器在每个 Agent 前后计算 workspace 内容快照，并按阶段文件白名单拒绝越权修改；这不会覆盖进入任务前已经存在的用户改动。人或 Planner 评审后生成新的规划修订，再重新冻结和搭建。

## 2. Planner 的交付物

Planner 必须先扩展“整个可玩世界”，再固定进入视角。`OutdoorWorldSpec` 是机器可校验的设计真相，包含：

- 世界边界、地貌区域、水体、路线、标志物和 Opening Shot。
- `WorldPromptBundle`：世界身份、空间构图、环境、光线、视觉风格、首帧、不可变规则和负面约束。
- `Entity Catalog`：所有主体、NPC、标志物和客体的 Prototype 与 Instance。
- 每个 Prototype 的尺寸、正面轴、轴心、唯一实例色、外观提示词和白膜/样式三视图路径。
- 用户事实、参考图可见事实、Planner 推断和可选创意的证据分层。
- Codex imagegen 生成的严格正交 `world-plan.png` 与进入视角 `opening-shot.png`。

Planner 不写 Three.js 几何。规划评审通过后运行：

```bash
pnpm plan:freeze -- --scene <id>
pnpm plan:check -- --scene <id>
```

冻结锁同时记录 WorldSpec 源码、World Plan 和 Opening Shot 的 SHA-256。任何一项漂移都会阻止 Builder 和后续导出。

## 3. Builder 的交付物

Builder 读取冻结 WorldSpec，使用 SDK 实现：

- 可玩的连续室外地形、水体、通路和关键轮廓。
- 与规划完全相同的 Feature ID、Runtime Entity ID、位置、尺寸和朝向。
- 第三人称主体、碰撞、坡度和初始镜头构图。
- 只影响空间、碰撞、导航、遮挡和语义的白膜；表面风格不进入几何。

完成后宿主运行场景测试、类型检查、生产构建和规划工件导出。`manifest.json` 只有在冻结锁仍一致时才会获得 `workflowStage: "verified"`。

## 4. Entity Catalog 与两套三视图

`Prototype` 表示可以共享视觉定义的一类物体，`Instance` 表示世界中的一个具体对象。十座相同房屋可以共享一个 Prototype，但有十个 Instance 和十个稳定绑定。

每个 Prototype 需要两张固定布局的三视图：

1. `whitebox-triview.png`：SDK 从真实运行时对象正交捕获，按 `front / right / back` 排列，使用该 Prototype 的唯一实例色。
2. `styled-triview.png`：Visual Bible Agent 以白膜三视图为结构参考生成，必须保持尺寸比例、轮廓、朝向和三格相机一致。

不同 Prototype 不得复用实例色。颜色是分割与追踪 ID，不是最终材质。

Playground 可通过“导出白膜三视图”按钮生成项目内资产，也可以调用：

```js
await window.__WHITEBOX_PLAYGROUND__.exportWhiteboxTriviews();
```

写入接口只在本地 Vite 开发服务器存在，并且只允许写入当前项目的：

```text
apps/playground/public/scene-plans/<id>/prototypes/<prototype-id>/whitebox-triview.png
```

## 5. Visual Bible 的交付物

Visual Bible Agent 在白膜验证完成后读取 WorldPrompt、Entity Catalog、Opening Shot 和真实白膜三视图，生成：

- 每个 Prototype 的 `styled-triview.png`。
- `opening-frame-rendered.png`：最终视觉首帧目标。
- `visual-bible-manifest.json`：所有输入/输出的哈希和 `visualized` 阶段状态。

它不能改变地形、镜头、物体位置或白膜轮廓。最终样式可以很丰富，但几何关系必须来自已验证白膜。

## 6. 推荐命令

分阶段执行最适合人工评审：

```bash
pnpm test:isolation

pnpm agent:plan -- --scene-id coastal-world \
  --image /absolute/reference.png \
  "创建一个从高地进入、俯瞰海湾的完整世界"

# 人工评审 WorldSpec、World Plan、Opening Shot 后：
pnpm agent:build -- --scene-id coastal-world

pnpm dev
# 打开 ?scene=coastal-world，验收并导出白膜三视图

pnpm visual:inputs -- --scene coastal-world
pnpm agent:visual -- --scene-id coastal-world
```

`pnpm agent:scene` 是 Planner + Builder 的便捷连续入口，内部仍然启动两次独立的临时 Agent，并在中间冻结计划。它不会自动执行 Visual Bible，因为真实白膜需要先在浏览器中进行可玩性和构图验收、导出三视图。

## 7. 当前实现边界

流水线、冻结门禁、Entity Catalog、真实白膜三视图捕获和视觉包校验已经实现。当前 `grassland` 已冻结并通过 Builder 验证，两个 Prototype 的白膜三视图已实际导出。样式三视图与渲染首帧尚未作为默认样例提交；它们应在选定美术方向后由 Visual Bible 阶段生成。

当前世界几何能力仍以室外高度场为主。室内、车辆、NPC 导航、复杂动作和实时世界模型桥属于后续阶段；多 Agent 流水线已经为它们保留 Prototype、Instance、稳定绑定和变更请求边界。
