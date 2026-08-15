# Agent-facing API

> 本文包含两种 API：当前可运行的 Outdoor Scene Authoring API，以及长期目标的高层游戏 API。带 `createWorld/createNPC/rule/trigger` 的示例目前不可运行，不能复制到当前 Playground 中。

## 1. 目标

本文主要描述创作期 Coding Agent API。运行期还会有一套更窄的 `Runtime World Director` 工具协议；它只能观察和操作已声明能力的 Entity，不编写任意场景代码，也不接触底层 Three.js/Rapier 对象。完整设计见 [运行时世界导演与受控世界操作协议](09-runtime-world-director.md)。

长期 Agent API 应该让 Coding Agent 把主要注意力放在：

- 世界里有什么
- 主体放在哪里
- 玩家控制谁
- 后续阶段中 NPC 做什么
- 后续阶段中游戏目标和规则是什么
- 最终画面应该是什么样

镜头碰撞、角色地面检测、动画切换和刚体参数等由 SDK 套餐负责。

## 2. 当前 Alpha 的可运行入口

新场景应先用 `defineOutdoorWorldSpec` 声明整个世界，再用 `definePlannedOutdoorScene` 实现；旧的 `defineOutdoorScene` 只保留兼容：

```ts
import { defineOutdoorWorldSpec, definePlannedOutdoorScene } from "@whitebox-world/world";

export const worldSpec = defineOutdoorWorldSpec({
  kind: "outdoor-world-spec",
  version: 1,
  id: "lake-plain",
  title: "Lake Plain",
  source: { request: "一片围绕大湖展开的平原" },
  intent: "以大湖为中心、从南向北进入的可玩平原",
  worldPrompt: {
    identity: "一片围绕大湖展开、可自由步行的开阔平原。",
    spatialComposition: "玩家从南侧进入，湖位于中央，东西两侧保留可通行草地。",
    environment: "轻微起伏的草地、自然岸线和开阔地平线。",
    lighting: "清晰明亮的白昼侧光。",
    visualStyle: "比例可信、轮廓清楚的自然主义世界。",
    openingShot: "第三人称主体从南侧看向中央湖面。",
    invariants: ["中央湖和南侧入口的位置关系不得改变。"],
    negativePrompt: ["城市", "遮挡湖面的高山", "文字", "UI"],
  },
  entityCatalog: {
    prototypes: [{
      id: "player-humanoid",
      role: "subject",
      semantic: "playable_humanoid",
      description: "第三人称可玩人形。",
      approximateSize: [0.8, 1.8, 0.6],
      forwardAxis: "-Z",
      pivot: "ground-center",
      instanceColor: "#E85D5D",
      appearancePrompt: "比例自然、轮廓清楚的旅行者",
      negativePrompt: "不要改变身体比例或添加巨大装备",
      evidence: "planner-inferred",
      views: {
        canonical: ["front", "right", "back"],
        whiteboxUri: "/scene-plans/lake-plain/prototypes/player-humanoid/whitebox-triview.png",
        styledUri: "/scene-plans/lake-plain/prototypes/player-humanoid/styled-triview.png",
      },
    }],
    instances: [{
      id: "player",
      prototypeId: "player-humanoid",
      binding: { kind: "runtime-entity", id: "player" },
      evidence: "planner-inferred",
    }],
  },
  bounds: { center: [0, 0], size: [640, 640], heightRange: [-10, 20] },
  terrain: { baseRelief: "plain", regions: [] },
  water: [],
  landmarks: [],
  routes: [],
  entry: {
    spawn: [0, 70],
    facingRadians: 0,
    camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    composition: {
      foreground: [],
      middleground: ["large lake"],
      background: [],
      visibleLandmarkIds: [],
    },
  },
  claims: [],
  artifacts: [
    {
      kind: "world-plan",
      generator: "codex-imagegen",
      uri: "/scene-plans/lake-plain/world-plan.png",
      prompt: "...",
    },
    {
      kind: "opening-shot",
      generator: "codex-imagegen",
      uri: "/scene-plans/lake-plain/opening-shot.png",
      prompt: "...",
    },
    {
      kind: "height-slope-plan",
      generator: "sdk-derived",
      uri: "runtime://planning/height-slope",
    },
  ],
  traceability: { requiredFeatureIds: ["terrain"] },
});

export const scene = definePlannedOutdoorScene({
  id: "lake-plain",
  seed: 42,
  worldSpec,
  build(world) {
    const terrain = world.terrain.landscape({
      id: "terrain",
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [96, 96],
      relief: "plain",
    });
    world.water.lake({
      id: "lake",
      terrain,
      center: [0, 0],
      radius: [60, 45],
      depth: 8,
    });
    world.player.spawn({ terrain, at: [0, 70] });
  },
});
```

完整字段、证据分层、图片生成约束和导出格式见 [Plan-first 世界创作协议](12-plan-first-world-authoring.md)。

完整现有 API 和工作流见 [Coding Agent 场景创作指南](08-agent-scene-authoring.md)。

## 3. 长期目标 API 示例（尚未实现）

```ts
import {
  createWorld,
  landmark,
  rule,
  trigger,
} from "@whitebox-world/sdk";

const world = createWorld({
  terrain: {
    relief: "plain",
    size: [400, 400],
  },
  lighting: "sunset_side",
  appearance: {
    prompt: "an epic desert kingdom during a red sunset",
    reference: "references/style.png",
  },
});

const player = world.createPlayer({
  preset: "humanoid.third_person",
  position: [0, 1, 8],
  handling: "responsive",
  appearance: {
    prompt: "a young desert knight wearing white armor",
    reference: "references/hero.png",
  },
});

world.addLandmark(
  landmark.castle({
    id: "capital",
    position: [0, 0, -160],
    scale: [80, 50, 70],
    collision: true,
    appearance: {
      prompt: "a monumental sandstone palace with giant banners",
    },
  }),
);

const finish = world.addTrigger(
  trigger.box({
    position: [0, 2, -130],
    size: [12, 4, 12],
  }),
);

world.addRule(
  rule.when(player.enters(finish)).then(world.game.win()),
);

world.start();
```

## 4. 主体套餐目标 API

最小字段：

```ts
type PlayerOptions = {
  preset:
    | "humanoid.first_person"
    | "humanoid.third_person"
    | "car.third_person"
    | "horse_rider.third_person";
  position: [number, number, number];
  rotation?: [number, number, number];
  handling?: "responsive" | "standard" | "physical";
  appearance: AppearanceBinding;
};
```

任何阶段都不默认向 Agent 暴露大量底层参数。高级参数只作为受控 escape hatch 提供。第一期只实现 `humanoid.third_person`。

## 5. 人、车与骑乘（第二期或更晚）

Agent 可以直接创建完整可玩套餐：

```ts
world.createPlayer({
  preset: "car.third_person",
  position: [0, 1, 0],
  handling: "standard",
  appearance: {
    prompt: "a black futuristic rally car",
  },
});
```

也可以创建人形并在运行时切换控制权：

```ts
const player = world.createPlayer({
  preset: "humanoid.third_person",
  position: [0, 1, 0],
  appearance: { prompt: "a courier" },
});

const car = world.createEntity({
  preset: "car",
  position: [8, 1, 0],
  appearance: { prompt: "a battered red delivery van" },
});

world.allowPossession({
  actor: player,
  target: car,
  interaction: "enter_vehicle",
});
```

`horse_rider.third_person` 对 Agent 是一个可玩主体，SDK 内部仍然保留 Rider Entity、Horse Entity、挂载关系、配对动作和独立的渲染身份。

## 6. NPC API（后续）

NPC 不属于第一、二期已确定范围，本节仅保留为后续 API 方向。

NPC 复用主体模型和运动能力：

```ts
const guard = world.createNPC({
  preset: "humanoid",
  position: [20, 1, -10],
  appearance: {
    prompt: "a royal guard holding a spear",
  },
  behavior: {
    type: "patrol",
    points: [
      [20, 1, -10],
      [30, 1, -20],
    ],
  },
});
```

后续行为应采用可组合节点，而不是让大模型逐帧控制 NPC。

## 7. Agent 验证目标 API

目标形态：

```ts
const report = await world.validate();

await world.testScenario({
  name: "player-can-reach-castle",
  input: [
    { action: "move_forward", duration: 4 },
    { action: "turn_right", duration: 1 },
    { action: "run_forward", duration: 6 },
  ],
  expect: [
    player.shouldNotBeStuck(),
    player.shouldRemainInsideWorld(),
  ],
});

await world.capture({
  name: "castle-approach",
  passes: ["whitebox", "depth", "instance_id"],
});
```

错误信息应包含实体 ID、空间位置、原因和可执行修复建议。

## 8. 内外部 API 边界

```text
当前 Agent 默认可见
├── defineOutdoorWorldSpec / definePlannedOutdoorScene
├── Terrain / Water / Landmark builders
├── WorldFeature / BuildContext
├── humanoid.third_person player spawn
├── Atmosphere / Appearance semantics
└── Scene tests / Playground Capture

未来 Agent 默认可见
├── createWorld / createPlayer / createNPC
├── 更多 SubjectKit presets
├── Trigger / Rule / Objective
└── 更完整 Validation / Capture

SDK 内部
├── Three.js scene graph details
├── Rapier body synchronization
├── Character ground detection
├── Camera collision
├── Animation transitions
├── Mount synchronization
└── Render pass implementation
```

底层 Three.js 对象可以保留高级入口，但不应出现在默认文档和生成示例中。
