# 资产与行动模式接入说明

面向资产生产和 SDK 接入同事。交付目标是：**Agent 能找到主体、理解使用条件、绑定已有能力，并在真实场景中操作。** 以新增飞机为例，交付模型、行动配置、简短使用说明和可运行示例。

## 1. 先确定接入层级

| 需求 | 做法 | 是否修改 SDK 控制器 |
| --- | --- | --- |
| 新飞机外观，行为与现有飞机相同 | 新模型绑定现有 `mode: 'plane'`；重测尺寸、座位和碰撞包围盒 | 通常不需要 |
| 同类飞机，速度或操纵手感不同 | 复制飞机 spec，修改实际生效的参数 | 通常不需要 |
| 垂直起降、直升机、独立起落架等新机制 | 增加或扩展状态与控制逻辑，同时接通观察、输入和录制 | 需要 |

当前 `training.plane` 与 `training.trainer-plane` 都使用 `mode: 'plane'`、`kernel: 'K09'`。真正的行为分派依据 `spec.mode`；`kernel` 和 `locomotionBindingIds` 是描述信息，填写新名字不会生成控制器。

模型外观、动画片段和行动能力分别交付：飞机可以没有骨骼动画，仍由控制器飞行；GLB 中有“起飞”片段，也不代表已实现起飞物理。普通自制主体可使用 `createWorld` / `addCharacter` / `registerMovement`，但 `registerMovement` 不是 Training 飞机模式的注册入口，也不自动提供驾驶和上下机。

## 2. 资产生产需要交付什么

| 交付项 | 要求 |
| --- | --- |
| 模型 | 自包含 GLB，纹理和 buffer 内嵌；白色、浅灰基本体块，少量关键标志物加识别色，基础材质即可 |
| 坐标与尺寸 | 使用米制，写清前方、上方、原点和实际尺寸。Training 载具前方为 **+Z**、上方为 **+Y**；普通 actor 的语义前方为 **-Z**，两者不能混用 |
| 物理与座位 | 按实际模型提供 `envelope`、`radius`、`seat`；`halfExtents` 是包围盒半尺寸，角度使用弧度。视觉根与碰撞、座位使用同一坐标系 |
| 动画（按需） | 给出真实片段名、循环方式和用途；骨骼、模型与动画必须兼容。静态模型使用 `actions: {}`；车辆动画还需要实际播放绑定 |
| 来源与依赖 | 提供来源、授权文件和实际依赖清单。随运行包交付的授权资料也登记到 `resources` |
| 使用说明 | 用途、适合的场景、绑定入口、按键、前置条件、成功状态、失败反馈和已知限制 |

主体优先复用提供的模型；人形保留 `humanoid.source-101` 的可见模型、骨架和动作，不额外制作服装、配饰。其他主体没有合适资源时可以自行绘制，再绑定能力。

SDK 控制外层 root 的位置和姿态；模型的朝向、缩放修正放在视觉子对象中，并据此测量包围盒和座位。不要在模型脚本中另开物理、动画时钟或相机循环。Unity 来源的动画资产应从配置好的 prefab 导出，确认有效网格、材质、骨骼权重和片段；不要混用不同骨架的模型与动画。

## 3. 文件放哪里、登记哪些信息

以新资产 ID `aircraft.scout-01` 为例，以下路径是建议命名：

```text
assets/three-creator/aircraft/scout-01/
  model.glb
  LICENSE.txt
  README.md
assets/three-creator/asset-catalog.json
config/three-creator/asset-policy.json
examples/three-creator/aircraft-scout/   # 最小接入示例
```

| 位置 | 本次修改 |
| --- | --- |
| [asset-catalog.json](../assets/three-creator/asset-catalog.json) | 增加这一资产的条目与真实依赖，保留其他条目 |
| [asset-policy.json](../config/three-creator/asset-policy.json) | 在 `allowedAssetIds` 增加 ID；默认人形仍为 `humanoid.source-101`，保留 `allowCustomAssets: true` |
| 示例的 `project.json` | 选择 `humanoid.source-101` 和 `aircraft.scout-01`；项目选择不能扩大 Host 白名单 |
| [example-files.ts](../scripts/three-creator/example-files.ts)、[tools.ts](../scripts/three-creator/tools.ts) | 若要让 Agent 直接取得新独立示例，在 `EXAMPLE_TOPICS` 与 `exampleRoot` 建立 topic 到目录的映射；仅放入目录不会自动成为工具入口 |
| [three-capsule.mjs](../scripts/cloud/three-capsule.mjs) | 新增独立示例目录需要加入 `SOURCE_TREES`，保证云端能读取该示例 |

目录条目至少包含 `id`、`displayName`、`sourcePath`、`uri`、`sha256`、`byteLength`、`rootTransform`、`actions`、`limitations`。可参考现有 `training.plane` 条目，但新模型要使用自己的文件身份、尺寸和来源。

- `sourcePath` 是仓库相对路径，例如 `assets/three-creator/aircraft/scout-01/model.glb`，禁止路径越界和软链接。
- 主模型 `uri` 使用 `./assets/subjects/<实际 SHA-256>.glb`；附属资源使用 `./assets/resources/<实际 SHA-256>.<扩展名>`。哈希和字节数从最终文件计算，不复制其他资产的值。
- `resources` 只列实际依赖；每项同样记录路径、URI、哈希和字节数。`path` 是专项加载器消费的逻辑名称。**登记依赖不会自动修复 GLB 的外部纹理或 buffer 链接**；普通加载入口要求自包含 GLB。
- `actions` 的每项使用真实 `clipName`、`loop`、`blendSeconds`、`timeScale`。片段名应在主 GLB 中唯一存在；不要复制人形专用的骨骼或动作统计到飞机。
- 为方便 Agent 直接复用驾驶配置，在 catalog 提供 `training: {schemaVersion: 1, spec: ...}`；运行时将 spec 显式绑定到 `TrainingVehicleInstance`，也可由接入代码提供该 spec。`collision` 元数据应与实际 `spec.envelope` 一致；仅填写元数据不会创建物理体。
- 声明 `sockets[].node` 时，该节点必须存在于模型。没有 `seat.driver` 节点就不要虚构；Training 的逻辑座位使用 `spec.seat`。

资产目录和白名单就绪后，`assets_search` / `assets_describe` 会读取公开条目；`sourcePath` 不会暴露给 Agent。新资产子目录由 capsule 按 catalog 收集，通常不用再加目录白名单。运行包支持 `glb/json/bin/png/jpg/webp/md/txt`；大型源工程和制作过程文件放在制作侧。

新增资产不要直接调用 [import-training-content.ts](../scripts/three-creator/import-training-content.ts)：它是固定来源的全量导入器，会重建 `training.*` 和示例模块。独立生产的新资产宜使用自己的稳定 ID 前缀，按条目接入。

## 4. 飞机如何绑定现有行动模式

先从目录读取新飞机的 `training.spec`，沿用现有 `plane` 模式；按实际模型修正 `seat`、`envelope`、`radius` 和观察距离。`mode`、座位和包围盒属于初始化配置，不能通过运行时 profile 随意替换。

示例中的 `scene`、`camera`、`canvas`、`map` 沿用 Creator 起步示例；下面的资产 ID 必须已经登记并由 `project.json` 选中：

```ts
import * as THREE from 'three';
import {createHumanoidWorld, type TrainingVehicleSpec} from '@worldkit/three';

const catalog = await (await fetch('./asset-definitions.json')).json();
const asset = catalog.assets.find((a: {id: string}) => a.id === 'aircraft.scout-01');
if (!asset?.training?.spec) throw new Error('缺少飞机资产或行动配置');
const instanceId = 'plane-1';
const spec = structuredClone(asset.training.spec) as TrainingVehicleSpec;
const planeRoot = new THREE.Group();
const world = await createHumanoidWorld({
  scene, camera, canvas, map,
  vehicles: [{instanceId, assetId: asset.id, spec, object: planeRoot}],
});
planeRoot.add((await world.assets.load(asset.id)).object);
world.training!.applyProfile({
  vehicles: {[instanceId]: {speed: 46, accel: 10, steer: .9}},
});
world.setCaptureTargets(['player', instanceId]);
await world.start();
```

这里的参数是配置示例，不是所有飞机的标准值。使用自绘模型时，用 `planeRoot.add(authoredPlaneMesh)` 替换资产加载行；输入、运动、碰撞和跟随仍由 SDK 负责。完整载具接法可参考 [独立载具示例](../examples/three-creator/training-independent/main.ts)。

场景必须同时准备：

- `map.regions` 至少一项包含 `modes: ['plane']`，否则飞机不可用且不可见。这是地图的可用模式声明，不是空域围栏。
- `map.spawns` 显式设置出生点，`vehicleId` 使用实例 ID `plane-1`，不是资产 ID；给人物留出能走近飞机的位置。
- 真实跑道碰撞、足够的助跑和升空空间，以及容纳完整机翼、转弯和高度范围的 `map.bounds`。地面画出跑道纹理不等于已有支撑。

### 当前飞机的按键和触发条件

| 按键 | `plane` 模式的实际行为 |
| --- | --- |
| F | 靠近后进入飞机；驾驶时尝试离开 |
| Shift / C 或 Ctrl | 增加 / 减少油门；松开后保持当前油门 |
| W / S | 俯冲 / 拉起 |
| A / D | 转弯，并混入侧倾 |
| Q / E | 受限横滚 |
| Space、方向键 | 当前飞机分支不消费这些控制，不应标成飞机刹车或键盘镜头控制 |

当前起飞由输入和物理状态驱动：从受支撑地面起飞时，速度 **>14 m/s** 才进入飞行分支，还需要实际拉起及净空；已离地后低于此速度仍继续飞行计算。速度 **<19 m/s** 有下沉补偿。俯仰目标限幅 `.62 rad`、横滚目标限幅 `.9 rad` 写在控制器中，不是完整特技飞行模型，也没有 `takeOff` / `land` 语义命令。

进入飞机要求人物可登乘、飞机速度 `<3 m/s`，距离 `<max(5.3, envelope.halfExtents[0] + 2)` 米。离开要求速度 `≤5 m/s`，并找到有支撑、满足人物净空的落点；不能承诺空中跳伞。当前未驾驶的普通飞机不持续物理推进。条件以 [simulation.ts](../packages/three-world/src/training/simulation.ts) 为准。

飞机可调参数包括 `speed`、`accel`、`steer`、`drag`、`dragQuadratic`、`pitchResponse`、`rollResponse`、`throttleResponse`、`steeringResponse`、`steeringReturn`、`minimumSpeed`。速度使用 m/s、加速度使用 m/s²；其余参数按实际消费方式填写，范围见 [control-tuning.ts](../packages/three-world/src/training/control-tuning.ts)。共享 schema 接受某字段，不代表飞机分支会消费它，例如当前 `grip`、`maxSpeed` 不是有效的飞机调参入口。

## 5. 确实需要新行动模式时

先写清状态、输入、转换条件和可观察结果，再修改现有状态拥有者。没有公共的 `registerFlightKernel` 接口。

| 接入点 | 要同步的内容 |
| --- | --- |
| [training/config.ts](../packages/three-world/src/training/config.ts)、[simulation.ts](../packages/three-world/src/training/simulation.ts) | 模式与 spec 类型、运动状态、输入消费、推进和碰撞 |
| [control-tuning.ts](../packages/three-world/src/training/control-tuning.ts)、[input.ts](../packages/three-world/src/training/input.ts) | 参数默认值和范围；确有新增输入语义时补统一键位 |
| [runtime.ts](../packages/three-world/src/training/runtime.ts)、[presentation.ts](../packages/three-world/src/training/presentation.ts)、[camera.ts](../packages/three-world/src/training/camera.ts) | 快照、初始化、reset、状态呈现与相机交接，保持一个模拟时钟和相机控制者 |
| [Creator command-schema.ts](../scripts/three-creator/command-schema.ts)、[SDK 指南](../packages/three-world/README.md) | 新增输入字段或命令时同步 schema；提供 Agent 使用说明。复用已有输入无需新增命令 |
| [Episode training-route.ts](../scripts/three-episode/training-route.ts) | 模式白名单与实际输入生成；确认录制也能操作这一模式 |

Agent 在单个项目中可用 `creator_materialize_runtime` 修改项目 SDK，再由 `world_validate` 构建。要让所有后续项目复用，应将验证后的实现落回仓库对应模块，通过代码 PR 接入。

若新增录制起始状态字段，还要同步 [Episode 起始状态类型](../packages/three-world/src/episode-contracts.ts)、[Episode 输入 schema](../scripts/three-episode/contracts.ts) 和 `training/runtime.ts` 的初始化逻辑。

## 6. 给 Agent 的说明模板

写进该资产的 README，并将名称、用途、限制、完整 spec 等可检索信息放入 catalog，例如 `displayName`、`training.spec.hint` 和 `limitations`。`assets_describe` 不会自动读取旁边的 README；专门的指导文本需要通过 SDK 对应 topic 或示例入口提供。新增 schema 主题时同步 [authoring-schema.ts](../scripts/three-creator/authoring-schema.ts)、SDK README 的 topic 标记与 `tools.ts` 分派。不要虚构一个 `integrationMetadata` 字段就认为新能力已被自动接入。

```text
资产：aircraft.scout-01；用途：可驾驶的轻型飞机。
入口：TrainingVehicleInstance，复用 mode=plane；驾驶员复用 Source101。
场景：声明 plane region、实例出生点、真实跑道和空中净空。
操作：F上下机；Shift加油门；C/Ctrl减油门；W/S俯仰；A/D转弯；Q/E横滚。
起飞：满足速度与拉起条件；成功以实际高度、离地状态和持续位移确认。
失败：上下机速度或距离不满足、出口缺少支撑/净空时，返回实际状态和原因。
限制：无Space刹车、无完整翻滚、无无人持续飞行；其他限制按交付实现填写。
修改：手感参数在spec/profile；新物理行为进入simulation及其消费者。
```

## 7. 合并与交付流程

1. **确认基线。** 目标分支是 `codex/three-sdk-data-production-20260907`。先 `git fetch origin`，再从 `origin/codex/three-sdk-data-production-20260907` 另开本资产分支，例如 `codex/asset-scout-01`；资产 PR 的 base 使用目标分支。若依赖另一项尚未合入的能力 PR，先以其 head 为开发基线和 PR base，标注依赖；依赖合入后再同步目标分支并调整 base，保持差异只包含本资产。不要直接向共享开发分支推资产改动。
2. **一个资产或一种能力一个 PR。** 先选复用或扩展层级；新增文件放自己的目录，catalog 和 policy 只合并本资产增量，保留其他同事的条目。目录迁移按目标分支，模型哈希按最终文件。
3. **提供最小白模示例。** 验证能搜到、能加载、能进入、能运动和安全退出。飞机至少实际完成加速起飞、转弯、减速返场，并验证上下机条件和 reset；记录实际未支持的情况。用最短能覆盖目标的真实输入计划，不要求固定录制秒数。
4. **按影响范围检查。** 纯模型接入验证文件身份、GLB/动画/座位/碰撞、示例加载和打包；修改动作模式时，再验证 Creator 与 Episode 的同一输入、状态转换、失败条件、暂停/重置和录制。正常 CI 继续执行类型检查、已有相关测试与构建；不需要另起大批云评测来提交资产。
5. **PR 说明可复核。** 列出资产 ID、来源授权、复用的控制族、修改文件、实际按键/限制、验证结果和预览位置。目录资产与行为实现一起审查，别用静态截图证明能飞。
6. **发布新运行包。** 合入源码后，由发布侧按[运行包指南](../deploy/three-creator-runtime/README.md)重新构建包含资产和示例的 capsule、校验资源身份，并生成匹配的运行时配置供新任务使用。已有云任务继续使用其冻结资产策略和运行包，不覆盖它们的输入或锁文件。

接入完成的判断是：**同事不需要猜如何绑定，Agent 不需要猜触发条件，用户能用真实输入完成说明中的行为。**
