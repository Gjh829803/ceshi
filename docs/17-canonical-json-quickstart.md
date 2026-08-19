# Canonical Authoring V2 / Runtime Protocol V3 快速接入

Canonical Authoring V2 是本仓库面向 AI Agent 和其他程序的唯一 JSON
输入协议。调用方只描述世界、资源、节点和启动绑定；SDK 负责严格校验、
Registry 解析、确定性归一化、Collider 推导、编译、物理执行和截图。

Authoring V1 从未发布，现已删除，也没有兼容解析或字段别名。当前版本链路为：

```text
AuthoringSpec V2
  -> NormalizedWorldIR V2
  -> ExecutionPlan V3
  -> Runtime Snapshot V3 / Browser Protocol V3
```

## 1. 最短运行路径

```bash
pnpm install
pnpm worldkit validate examples/authoring/package-subject-world.json --json
pnpm worldkit build examples/authoring/package-subject-world.json \
  --output artifacts/examples/package-subject-world/world.build.json --json
pnpm worldkit subject explain examples/authoring/package-subject-world.json \
  --entity-id pack-animal-a --json
pnpm worldkit run examples/authoring/package-subject-world.json
```

浏览器使用 `WASD` 移动、`Space` 跳跃。生成截图和运行时快照：

```bash
pnpm worldkit capture examples/authoring/package-subject-world.json \
  --output artifacts/examples/package-subject-world/world.png \
  --snapshot artifacts/examples/package-subject-world/snapshot.json --json
```

首次截图若提示 Chromium 不存在，执行：

```bash
pnpm exec playwright install chromium
```

该链路不需要 `.env` 或模型 Token。图片理解与 Prompt 规划属于上游 Agent；
SDK 从上游交付的 Canonical JSON 开始工作。

## 2. Agent 应输出什么

权威 Schema 是
[`authoring-spec-v2.schema.json`](../packages/authoring/src/authoring-spec-v2.schema.json)，
Package 主体 Schema 是
[`subject-definition-v1.schema.json`](../packages/authoring/src/subject-definition-v1.schema.json)，
完整示例是
[`package-subject-world.json`](../examples/authoring/package-subject-world.json)。

根结构固定为下列形状。这个片段只展示字段布局，空的 `world` 与 `nodes` 不是
合法世界；可执行输入请复制完整示例：

```json
{
  "kind": "worldkit-authoring-spec",
  "schemaVersion": 2,
  "id": "package-subject-world",
  "seed": 4096,
  "world": {},
  "resources": {
    "prototypes": [],
    "subjectDefinitions": []
  },
  "nodes": [],
  "relationships": [],
  "rules": [],
  "startup": {},
  "constraints": {}
}
```

当前公开概念如下：

| 概念 | JSON 表达 | 当前作用 |
|---|---|---|
| 世界 | `world` | 坐标系、边界、重力、环境和资源预算 |
| 静态白膜原型 | `resources.prototypes` | `box / sphere / cylinder / cone` |
| Package 主体定义 | `resources.subjectDefinitions` | 组合 Primitive Part、Socket、Capability 与 Profile |
| 地形 | `kind: "terrain"` | 单个确定性程序化 Heightfield |
| 水面 | `kind: "water"` | 圆、椭圆或多边形边界及通行语义 |
| 障碍物/地标 | `kind: "object"` | 引用版本化原型的静态实例和碰撞体 |
| 主体实例 | `kind: "subject"` | 引用一个精确版本 Subject Definition |
| 相机 | `kind: "camera"` | 第三人称相机，目标随控制绑定切换 |
| 锚点 | `kind: "anchor"` | 出生位置等稳定空间实体 |
| 启动绑定 | `startup` | 默认出生锚点、受控主体和相机 |

所有对象都是闭合 Schema。未知字段、重复 JSON Key、注释、尾逗号、
非有限数字、错误引用、版本缺失、超预算和当前不支持的能力都会返回结构化
Diagnostic，不会被静默忽略。

## 3. Subject Definition 与实例

Registry 资源使用精确版本引用：

```json
{
  "id": "player",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.third-person@1",
  "spawnAnchorEntityId": "spawn-main"
}
```

世界局部定义使用 Package 引用。Definition 写一次，可以生成多个独立实例：

```json
{
  "resources": {
    "prototypes": [],
    "subjectDefinitions": [
      {
        "id": "coastal-pack-animal",
        "version": 1,
        "kind": "subject-definition",
        "category": "animal",
        "bodyTopology": "quadruped",
        "semanticClassId": "subject.animal.pack",
        "coordinateConvention": {
          "forwardAxis": "-Z",
          "upAxis": "+Y",
          "metersPerUnit": 1,
          "pivot": "support-center"
        },
        "visualParts": [
          {
            "id": "body",
            "kind": "primitive",
            "shape": {
              "kind": "box",
              "sizeMetersXYZ": [0.9, 1, 1.4]
            },
            "localTransform": {
              "positionMetersXYZ": [0, 0.5, 0]
            },
            "colliderContribution": "include",
            "semanticTags": ["body"]
          }
        ],
        "sockets": [],
        "colliderPolicy": {
          "kind": "derive",
          "colliderDerivationProfileRef": "worldkit://collider-derivation-profile/vertical-character-capsule@1"
        },
        "capabilityRefs": [
          "worldkit://capability/locomotion.ground@1"
        ],
        "profiles": {
          "physicsBodyProfileRef": "worldkit://physics-body-profile/character.medium@1",
          "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
        },
        "aiMetadata": {
          "displayName": "Coastal pack animal",
          "description": "A package-local quadruped whitebox proxy.",
          "semanticTags": ["animal", "ground", "quadruped"]
        }
      }
    ]
  },
  "nodes": [
    {
      "id": "pack-animal-a",
      "kind": "subject",
      "subjectDefinitionRef": "package://subject-definition/coastal-pack-animal@1",
      "spawnAnchorEntityId": "spawn-pack-animal-a"
    }
  ]
}
```

上面为结构节选；完整世界还必须包含 Terrain、Anchor、Camera 和 Startup。
请以完整示例和 JSON Schema 为准。Part 使用 Definition 局部坐标，
`support-center` 是 Subject Origin，主体正前方固定为 `-Z`。SDK 根据标记为
`include` 的 Part 确定性推导 Capsule，并从 Profile 得到质量、坡度、台阶和
地面运动参数。

Authoring 不能填写 Definition Hash、Collider 结果、资源成本或 Resource Lock。
Normalizer 统一生成这些字段。Compiler 和 Runtime 只消费已经解析的 IR，不再
访问 Registry，也不会按“人/动物”写硬编码分支。

## 4. Registry、校验与 Explain

其他程序可以先发现 SDK 支持的资源，再生成 JSON：

```bash
pnpm worldkit registry list --kind subject-definition --json
pnpm worldkit registry describe \
  --resource-ref worldkit://subject-definition/humanoid.third-person@1 --json
pnpm worldkit subject-definition validate ./subject-definition.json --json
pnpm worldkit subject explain ./world.json --entity-id pack-animal-a --json
```

`subject explain` 将实例、Definition、自动 Collider、Capability、Profile、
资源成本和 Resource Lock 连接为一份机器可读结果，适合 Agent 调试，而不需要
读取 Babylon/Havok 内部对象。

## 5. 确定性编译边界

```text
Canonical JSON bytes
  -> strict parse + Schema validation
  -> semantic validation + exact Registry resolution
  -> normalized Part/Socket ordering + Collider derivation
  -> Definition Hash + Resource Lock
  -> NormalizedWorldIR V2 + SHA-256
  -> ExecutionPlan V3 + SHA-256
  -> Babylon Runtime Adapter + Havok
```

Authoring、Normalized IR 和 Runtime Contracts 不含 DOM、Mesh、WASM Handle 或
引擎对象。Babylon/Havok 只存在于运行时适配层。相同输入、Registry 内容和
Compiler 版本会得到字节稳定的 Definition、IR 与 Plan 哈希。

## 6. CLI 契约

| 命令 | 成功 | 输入/语义失败 | 作用 |
|---|---:|---:|---|
| `validate <file> [--json]` | 0 | 2 | 校验完整管线并返回 IR/Plan 哈希 |
| `build <file> --output <file> [--json]` | 0 | 2 | 原子写入 Build Artifact V3 |
| `run <file> [--port <port>] [--json]` | 0 | 2 | 启动本地交互式 Playground |
| `capture <file> --output <png> [--snapshot <json>] [--json]` | 0 | 2 | 写入 PNG 与可选 Snapshot V3 |
| `registry list --kind subject-definition [--json]` | 0 | 2 | 稳定顺序列出主体定义 |
| `registry describe --resource-ref <ref> [--json]` | 0 | 2 | 描述精确版本资源 |
| `subject-definition validate <file> [--json]` | 0 | 2 | 独立校验 Package Definition |
| `subject explain <world> --entity-id <id> [--json]` | 0 | 2 | 解释已编译主体 |

`--json` 输出稳定字段名、`code`、JSON Pointer 风格的 `instancePath`、
`message` 和可选 `details`。命令不会回显源文件正文或环境变量。

## 7. Browser Protocol V3

Canonical 页面就绪后暴露 `window.__WORLDKIT__`：

```ts
interface WorldkitBrowserApiV3 {
  version: 3;
  ready(): Promise<WorldRuntimeSnapshotV3>;
  getSnapshot(): WorldRuntimeSnapshotV3;
  getDiagnostics(): readonly Readonly<Record<string, unknown>>[];
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV3>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): WorldRuntimeSnapshotV3;
}
```

固定输入使用 `move-forward / move-backward / move-left / move-right / jump`
和明确 tick 数。`bindControl` 用 `expectedControlledEntityId` 做原子比较并切换。
Snapshot 通过 `subjectStatesByEntityId` 报告每个主体的 Definition 身份、Subject
Origin 位置、速度与 `ground / air / water` 介质。

当前 Host 只有一个受信默认 Controller；同时创建多个 Controller、NDJSON
长连接和按 Tick 批量输入属于后续控制协议，不应由调用方自行模拟。

## 8. 当前能力边界

S1a 只支持室外 Heightfield 白膜世界、Primitive 静态物体、一个第三人称相机、
Registry 或 Package Primitive 主体、自动 Capsule、地面移动、跳跃、碰撞、
可游泳水域检测和控制目标切换。

以下能力尚未交付，必须报告为能力缺口：

- GLB/资产型 Subject Definition、骨骼和动画绑定；
- Relationship、挂载、坐骑、拖拽、装备、武器和车辆；
- NPC 行为、战斗、导航、玩法规则、网络与动态刚体；
- 飞行、第一人称/自由镜头、室内、洞穴、悬挑和 Overhang 地形；
- 非空 `relationships`、非空 `rules` 和运行时动态 Spawn。

`seat.mount` 目前只是可验证、可解释的 Socket 数据，不代表骑乘逻辑已经实现。

## 9. 旧场景与发布门禁

现有 `OutdoorWorldSpec`、Three.js/Rapier 场景 DSL 和 Plan-first Agent 流水线
继续作为兼容回归与创作实验运行；它们不是新程序的 Canonical JSON 接口。
新集成不要依赖 `sdk-world-adapter.ts`，也不要直接写 Three/Babylon 对象。

完整门禁：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
```

`verify:canonical` 在真实 Chromium 中验证严格输入、确定性 Build Artifact、
Package Definition Hash/Lock、三个独立 Subject、Havok 初始化、墙体碰撞、入水、
两个 Package 实例的原子控制切换、复位和 936×596 截图。
