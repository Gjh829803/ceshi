# Canonical Authoring V1 / Runtime Protocol V2 快速接入

Canonical Authoring V1 是本仓库面向 AI Agent 和其他程序的稳定输入；它会编译成复数主体的 ExecutionPlan V2 和 Runtime Snapshot V2。调用方只提交严格 JSON；SDK 负责校验、Registry 解析、归一化、确定性编译，并通过 Babylon.js + Havok 渲染和执行白膜世界。调用方不需要生成 Babylon 节点、Mesh、碰撞体或物理脚本。

## 1. 最短运行路径

```bash
pnpm install
pnpm worldkit validate examples/authoring/multi-subject-world.json
pnpm worldkit run examples/authoring/multi-subject-world.json
```

浏览器打开命令输出的地址。默认是 `http://127.0.0.1:5173/?authoring=1`，使用 `WASD` 移动、`Space` 跳跃。

生成确定性编译工件和浏览器截图：

```bash
pnpm worldkit build examples/authoring/multi-subject-world.json \
  --output artifacts/examples/multi-subject-world/world.normalized.json

pnpm worldkit capture examples/authoring/multi-subject-world.json \
  --output artifacts/examples/multi-subject-world/world.png \
  --snapshot artifacts/examples/multi-subject-world/snapshot.json
```

首次截图若提示 Chromium 不存在，执行：

```bash
pnpm exec playwright install chromium
```

该链路不需要 `.env` 或模型 Token。图片理解和场景规划属于上游 Agent；本 SDK 从已经生成的 JSON 开始工作。

## 2. Agent 应输出什么

权威协议是 [`packages/authoring/src/authoring-spec-v1.schema.json`](../packages/authoring/src/authoring-spec-v1.schema.json)，复数主体示例是 [`examples/authoring/multi-subject-world.json`](../examples/authoring/multi-subject-world.json)，原有单主体 [`basic-world.json`](../examples/authoring/basic-world.json) 仍保持兼容。根结构固定为：

```json
{
  "kind": "worldkit-authoring-spec",
  "schemaVersion": 1,
  "id": "basic-world",
  "seed": 1024,
  "world": {},
  "resources": { "prototypes": [] },
  "nodes": [],
  "relationships": [],
  "rules": [],
  "startup": {},
  "constraints": {}
}
```

V1 的公开概念如下：

| 概念 | JSON 表达 | 当前作用 |
|---|---|---|
| 世界 | `world` | 坐标系、边界、重力、环境和资源预算 |
| 可复用白膜 | `resources.prototypes` | `box / sphere / cylinder / cone` 原型 |
| 地形 | `kind: "terrain"` | 单个确定性的程序化 Heightfield |
| 水面 | `kind: "water"` | 圆、椭圆或多边形边界及通行语义 |
| 障碍物/地标 | `kind: "object"` | 引用原型的静态实例和碰撞体 |
| 主体 | `kind: "subject"` | 一个或多个引用已注册 Kit 的可移动主体实例 |
| 相机 | `kind: "camera"` | 初始目标明确、运行时随控制绑定切换的第三人称相机 |
| 锚点 | `kind: "anchor"` | 出生点等有稳定 ID 的空间位置 |
| 启动绑定 | `startup` | 明确出生点、受控主体和相机 |

坐标统一使用右手系，`+Y` 向上，主体正前方是 `-Z`。长度字段带 `Meters`，旋转字段带 `Radians` 或 `Degrees`。ID 只使用稳定、可读的语义名，例如 `terrain-main`、`lake-main`、`player`；不要把显示名称或随机 UUID 当作场景语义。

所有对象都是闭合 Schema：未知字段、重复 JSON Key、注释、尾逗号、错误引用、超预算以及 V1 不支持的能力都会失败，不会被静默忽略。[`invalid-world.json`](../examples/authoring/invalid-world.json) 展示了未知字段的失败方式。

首批内置 Kit 是 `worldkit://kit/humanoid.third-person@1` 和 `worldkit://kit/quadruped.ground-proxy@1`。启动受控主体可以继续继承 `startup.spawnAnchorId`；每个额外主体必须显式填写 `spawnAnchorEntityId`。Normalizer 会通过可注入 Registry 解析 Kit，并把实际使用的 Definition 固化进 Normalized IR，Compiler 不访问宿主 Registry，也不按主体类型写分支。

## 3. 编译与运行边界

数据按单向管线流动：

```text
AuthoringSpecV1 JSON
  -> strict parse + JSON Schema validation
  -> semantic validation + defaults + stable ordering
  -> NormalizedWorldIRV1 + SHA-256
  -> ExecutionPlanV2 + SHA-256
  -> BabylonWorldRuntime + Havok
```

`AuthoringSpecV1` 和 `NormalizedWorldIRV1` 不包含 Babylon、Havok、DOM、Mesh 或 WASM 句柄。只有运行时适配包知道引擎实现。因此以后更换渲染/物理实现，或增加新的 Kit、节点、关系和规则时，不需要让上游 Agent 改写底层引擎代码。

相同合法 JSON 与 `seed` 会产生字节稳定的归一化 IR、Heightfield 采样顺序和 ExecutionPlan。`build` 输出同时记录两个哈希，适合缓存、审计和复现。

## 4. CLI 契约

| 命令 | 成功退出码 | 输入错误退出码 | 输出 |
|---|---:|---:|---|
| `validate <file> [--json]` | 0 | 2 | 诊断与两个确定性哈希 |
| `build <file> --output <file> [--json]` | 0 | 2 | 原子写入 Canonical Build Artifact |
| `run <file> [--port <port>] [--json]` | 0 | 2 | 本地交互式 Playground 地址 |
| `capture <file> --output <png> [--snapshot <json>] [--port <port>] [--json]` | 0 | 2 | 原子写入 PNG 和可选 Runtime Snapshot |

`--json` 适合其他程序调用。失败结果包含稳定的 `code`、JSON Pointer 风格的 `instancePath`、人类可读 `message`，可能附带 `details`；命令不会回显源文件正文或环境变量。

## 5. 浏览器自动化协议

Canonical JSON 页面就绪后暴露 `window.__WORLDKIT__`：

```ts
interface WorldkitBrowserApiV2 {
  version: 2;
  ready(): Promise<WorldRuntimeSnapshotV2>;
  getSnapshot(): WorldRuntimeSnapshotV2;
  getDiagnostics(): readonly Record<string, unknown>[];
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV2>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV2;
  setPaused(paused: boolean): WorldRuntimeSnapshotV2;
}
```

固定输入使用语义动作 `move-forward / move-backward / move-left / move-right / jump` 和明确 tick 数。输入只作用于 `controller-primary` 当前绑定的主体；`bindControl` 使用 `expectedControlledEntityId` 做原子比较并切换。Snapshot 通过 `subjectStatesByEntityId` 报告每个主体的位置、速度和 `ground / air / water` 介质，并显式报告 `controlledEntityId`、`controllersById`、相机目标、Havok 就绪状态和资源数量。

## 6. V1 到 V2 的显式迁移

Authoring 输入仍是 V1；本次升级的是编译工件、运行时 Snapshot 和 Browser Protocol。不要在一个对象里同时发布新旧字段。

| V1 | V2 |
|---|---|
| `executionPlan.subject` | `executionPlan.subjects[]` |
| `snapshot.subject` | `snapshot.subjectStatesByEntityId[entityId]` |
| 隐式受控主体 | `snapshot.controlledEntityId` 加 `controllersById` |
| Browser `version: 1` | Browser `version: 2` 加 `bindControl` |

`kitRef` 在这个切片中有意保持不变，避免把多主体运行时迁移与公开命名迁移混在一起；未来如调整名称，会通过新的 Authoring Schema 版本和显式迁移完成，不增加永久别名字段。

## 7. 当前明确不支持的能力

当前交付只覆盖室外 Heightfield 白膜世界：多个已注册主体、一个可切换受控目标的第三人称镜头、静态 Primitive 障碍物、水域、地面移动、跳跃、碰撞和水域检测。Quadruped 是结构验证用白模代理，不代表已经交付动物资产或动画。

以下内容必须作为能力缺口返回，不能通过随意字段或场景私有脚本伪装支持：

- 室内、洞穴、悬挑地形、车辆和飞行；
- NPC 行为、战斗、武器、坐骑、动画资产绑定与飞行；
- 非 Primitive 资产、动态刚体、导航和网络同步；
- 第一人称/自由镜头切换；
- 非空 `relationships`、`rules`、Package 局部 Definition 和未注册 Kit。

这些概念已经在总体架构中预留为版本化资源、组件、关系、规则和 Kit 的扩展点，但不属于 V1 运行能力。

## 8. 旧场景的定位

现有 `OutdoorWorldSpec`、Three.js/Rapier 场景 DSL 和 Plan-first Agent 流水线继续作为兼容与回归样例运行。它们不会被 Canonical JSON 页面执行，也不是新程序的公共接入协议。新集成应从 `AuthoringSpecV1` 开始，避免依赖 `sdk-world-adapter.ts` 或直接写 Three/Babylon 对象。

完整发布门禁：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:v1
```

`verify:v1` 的命令名为兼容既有自动化而保留；它现在验证 Canonical Authoring V1 编译到 Runtime Protocol V2，包括严格输入拒绝、确定性复数主体工件、截图、Babylon/Havok 初始化、墙体碰撞、进入水域、控制切换和全体复位。
