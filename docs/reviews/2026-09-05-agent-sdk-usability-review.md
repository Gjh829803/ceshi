# Agent / SDK V2：公开合同易用性审阅

日期：2026-09-05。当前阶段为设计审阅；本文不是 SDK 功能实现或运行验收。唯一审阅输出为本文件，不修改运行 SDK、Creator 工具或云端任务。

审阅者了解此前 SDK 和调试历史，因此这不是完全陌生用户的盲测。下文的“首次错误”将专指依据 V2 公开设计写出用例后，第一次类型检查实际返回的错误，不代表新手群体的统计结论。

## A. 当前公开 API 的前五个易误用点

只读依据：当前工作区的 [SDK README](../../packages/three-world/README.md)、[导出入口](../../packages/three-world/src/index.ts)、[公开 contracts](../../packages/three-world/src/contracts.ts)，以及 `ThreeWorld` / `loadAsset` 的公开方法签名。没有把设计草案或尚未集成的模块当成已提供能力。

### 1. 素材加载、动作初始化与所有权交接分散

公开用法需要串起 `assets_search` → `project.json` → `fetch('./asset-definitions.json')` → 按 ID 取完整 definition → `loadAsset(definition)` → 判断 idle 是否存在 → `play('idle'); update(0)` → `addCharacter({object, asset, ...})`。名称看起来相近的 asset ID、definition、实例、原始 clip 名和 action ID 分布在不同对象中。`AssetInstance` 同时公开 `mixer`、`update`、`dispose`，但传入角色之后改由 World 更新和释放；用于非角色装饰时又由作者处理。同步 prototype factory 与异步加载还需要额外衔接。

易发生的使用错误：把 ID 直接传给 `loadAsset`；复用同一个实例生成多个角色；未求值初始动作即截图；将没有 idle 的静态资产当成动画资产；角色注册后继续手动 update/dispose，形成重复推进或提前释放。类型中的 `play(actionId: string)` 本身不能帮助判断这个实例提供哪些动作。

V2 必须让公开路径回答：如何按 ID 得到已校验、可实例化的资源；何时成为独立实例；谁初始化首帧姿态；何时把动画/释放所有权交给 World；静态、角色和非角色动画分别用哪个最短路径。底层 mixer 可以保留，但不能让每个标准角色用例都必须先理解这些底层细节。

证据位置：README 第 78–99、136–140、159–163 行；contracts 的 `AssetDefinition` / `AssetInstance` / `CharacterEntityOptions`。

### 2. 自由首帧相机与跟随接入缺少明确的过渡合同

Agent 可以直接设置 Three 相机，也可以调用 `setCameraFollow`。当前参数主要表达目标距离、俯仰、跟随目标和 `activateOnInput`；公开接口不直接表达从远景首帧接入时的当前位置/距离、转入跟随过程、手动相机与 SDK 跟随的写入优先级，以及重置应恢复哪一阶段。作者在玩法回调里继续改相机时，容易认为它和跟随器可以同时保持最终控制。

易发生的使用错误：首帧符合参考，第一次按键却突然进入固定近景；每帧重设跟随配置导致平滑状态不断清空；同时运行作者相机更新和 SDK 跟随；把遮挡安全收缩和平滑恢复当成相同问题。接口只接受参数并不说明这些行为已经成立。

V2 必须说明：首帧构图由 Agent 创建；游玩时哪个模块拥有相机；何时、从什么状态交接；什么变化可平滑、什么物理约束必须立即满足；暂停/重置/更换目标如何处理旧状态。应允许显式的自定义相机模式，而非为了防冲突禁止自由相机。

证据位置：README 第 17–21、147–157 行；`CameraFollow` 与 `setCameraFollow` 公开签名。

### 3. 玩法、命令与重置没有共享的显式游戏状态入口

公开 API 同时允许 `getObject()` 后直接改 Three 对象、`onUpdate` / `onInteract` 修改玩法、以及 `execute(WorldCommand)` 接受运行时控制。文档说明直接变更在下一物理步同步、命令同步刷新碰撞，但没有提供公开的 typed 游戏状态机制：作者自己的 `doorOpen`、任务进度、开关和参数仍通常存在闭包中。外部命令可以先被接受，下一帧又被作者回调用旧变量覆盖。

初始基线还隐含地在首次 `start` / `step` / `advance` 封存；任意作者变量和未注册子节点又需要分别写 `onReset`。因此“门打开了”“可控参数变了”“reset 恢复了什么”可能分属多个真值来源。

V2 必须说明：公开状态的定义/读写/事件入口，交互与文本控制是否调用同一动作，动作参数和副作用如何声明，生命周期何时提交初始状态，哪些状态由 SDK 自动重置。保留自由的 Three 视觉代码；同时明确哪些持久玩法状态不应由无协调的多处代码共同改写。

证据位置：README 第 37–42、103–117、128–143、164–165 行；`WorldCommand`、`WorldSnapshot`、`getObject` / `onUpdate` / `execute` / `reset`。

### 4. 视觉身份、物理角色与父子碰撞边界容易混成一次“注册”

`EntityOptions` 的 role 与 physics 都可选；`CharacterEntityOptions` 又继承整份 EntityOptions 并附加 character/asset。Agent 必须知道地面要以何种角色注册、哪些形状用于胶囊、什么组合合法，以及独立注册一个子节点会怎样改变父实体碰撞边界。这些事实同时影响显示、稳定 ID、碰撞、导航和控制，但单看宽泛的参数结构难以推断。

易发生的使用错误：可见地面仅被当成装饰；把所有小碎石都设成障碍；把衣服/尾部也计入角色碰撞；将角色当成动态刚体再配置一套 capsule；为修某个局部问题改父子注册方式，意外改变主地面或整体主体的碰撞。

V2 必须让“我画的是什么”和“它怎样参与交互/物理”具有清楚的模块和组合规则：普通 Three 几何仍自由，碰撞类型与角色控制的合法组合有类型/验证支持，完整主体和装饰附件有可读的标准路径。不能只靠一条宽泛运行时异常让 Agent 自己猜是哪层职责冲突。

证据位置：README 第 46–74 行；contracts 的 `EntityOptions` / `CharacterEntityOptions` / `RigidPhysics` / `CharacterOptions`。

### 5. 缺能力和当前不可执行状态的发现仍太弱

`capabilities()`、`inspect()` 及观察接口中的相应方法返回 `unknown`；命令结果只有 applied/rejected、revision 与字符串 code/message。文档中能读到不支持飞行、游泳、群体避让，但没有统一的 typed 能力描述，让 Agent 先区分“系统不支持”“当前配置未启用”“这个对象不允许”“本次目标没有路线”“作者输入错误”“SDK 自身缺陷”。

易发生的使用错误：猜一个相似 API；把不存在的动作当成原始 clip 播放；把缺少攀爬能力当成某条路线坐标错误；反复修改场景来绕过 Runtime 的缺能力或失败；拿 `applied` 当成异步 NPC 行动已经完成。

V2 必须提供可检索的全局和实体能力、参数合同、可用条件/限制、可检查的执行状态，以及有区别的拒绝/失败分类。缺能力时应能给出明确缺口和可复现上下文；不应要求创作 Agent 私自改共享 SDK，也不应让“写了一个自定义回调”自动等同于已实现某种物理能力。

证据位置：README 第 112–117、128–134 行；contracts 的 `WorldObservation` / `WorldCommandResult`；`ThreeWorld.capabilities(): unknown` / `inspect(): unknown` 公开签名。

## B. V2 公开设计试用协议

等待 Root 提供 `docs/superpowers/specs/2026-09-05-agent-sdk-contract-v2.md`、独立公开 `.d.ts` 和公开 examples 后执行。当前尚未编写 V2 用例，不猜新 API。

只使用这三类公开资料及正常 Three 类型；编写用例时不打开运行 SDK 实现寻找未公开的快捷方式。不改 Root 的声明或 examples 来使测试通过，不使用 `as any`、`@ts-ignore` 或删掉需求掩盖失败。片段将保存在本文，使用虚拟 TypeScript 文件检查，避免写入运行源码或 Root 独占的例子目录。

拟试用的六个短用例：

| ID | 用户意图 | 需要从公开合同确认 |
| --- | --- | --- |
| U1 | 按公开目录加载一个可动角色，并得到正确首帧 | ID/definition/实例边界，初始姿态，动画和资源所有权，初始状态提交 |
| U2 | 保留参考相机，游玩后接入有遮挡约束的跟随，再 pause/reset | 相机职责、接管时机、过渡状态、重置/暂停合同 |
| U3 | 玩家交互开门，文本指令关门，二者驱动同一状态 | 状态/动作定义、交互绑定、命令执行、碰撞副作用、重置 |
| U4 | 从已准备的资源生成第二个完整主体，附上道具，再显隐/删除 | factory/实例化、稳定身份、父子空间、更新/释放与原型复用 |
| U5 | NPC 去一个点、跟随玩家、停止；处理不可达或权限拒绝 | 运动所有权、开始与完成的区分、状态查询、失败/中断与重试 |
| U6 | 发现请求的运动能力缺失，并按设计提供扩展或缺口报告 | 全局/局部能力目录、参数 schema、unsupported 分类、允许的扩展边界 |

每案记录：先读的公开材料、第一版完整片段、第一次 typecheck 的原始错误、额外查阅的位置、必要修改、第二次结果、仍无法从合同确定的语义。若片段类型通过但关键行为无法由合同判定，记为“类型通过，语义未确定”；不以 typecheck 代替相机手感、物理、动画、性能或真实浏览器验收。

## C. V2 首次试用结果

首次阅读了 spec 与公开 `.d.ts` 后，Root 在本审阅者落笔/编译之前更新了设计：新增 writes、runTask、useAuthoredCamera 等。此变更属于设计版本变更，不计为 Agent 首轮错误。以下第一版代码依据更新后的公开声明；未查看 Root 的完整 examples 或运行 SDK 实现。spec 的同步若滞后于声明，下面另记，不把冲突归给使用者。

这些是设计用片段，导入名按 spec 写作 `@worldkit/three`，类型检查会映射到设计 `.d.ts`；不会执行或导入当前运行 SDK。U2/U3 接收已创建、已注册角色但尚未 start 的 World；U4/U5 接收已创建的 World 和调用方选择的真实资产/路线。

### U1 第一版：资源角色与首帧

```ts u1.ts
import * as THREE from 'three';
import { createWorld } from '@worldkit/three';

export async function createPlayable(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 1000);
  camera.position.set(7, 5, 10);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x52643b, 2));
  const world = await createWorld({ scene, camera, canvas });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 40),
    new THREE.MeshStandardMaterial({ color: 0x718b4f }));
  ground.position.y = -0.1;
  world.addEntity({ id: 'ground', object: ground, role: 'terrain' });
  const candidate = world.assets.search('humanoid').find(item => item.actionIds.includes('jump'));
  if (!candidate) throw new Error('No verified humanoid with jump is available');
  await world.runTask(async scope => {
    const hero = await scope.assets.load(candidate.assetId);
    if (!hero.recommendedBody) throw new Error('This asset needs authored body dimensions');
    scope.addCharacter({ id: 'hero', asset: hero });
  });
  world.setControlledEntity('hero');
  world.setCameraFollow({ distanceMeters: 5 });
  world.setCaptureTargets(['hero']);
  await world.start();
  return world;
}
```

### U2 第一版：参考相机、接管、暂停与重置

```ts u2.ts
import type { World } from '@worldkit/three';

export async function configureCamera(world: World) {
  world.camera.position.set(12, 8, 20);
  world.camera.lookAt(0, 1, 0);
  world.setCameraFollow({
    targetEntityId: 'hero', distanceMeters: 5, pitchRadians: 0.35,
    activateOnInput: true, transitionSeconds: 0.4,
    collisionRadiusMeters: 0.2, recoveryHalfLifeSeconds: 0.2,
  });
  await world.start();
  const afterStart = world.cameraMode;
  world.stop();
  await world.start();
  await world.reset();
  const afterReset = world.cameraMode;
  const authoredCamera = world.useAuthoredCamera();
  authoredCamera.position.set(6, 4, 9);
  authoredCamera.lookAt(0, 1, 0);
  return { afterStart, afterReset, handedBackMode: world.cameraMode };
}
```

### U3 第一版：交互和文本控制同一扇门

```ts u3.ts
import * as THREE from 'three';
import type { World } from '@worldkit/three';

export function installGate(world: World) {
  const hinge = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2, 2.8, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x806743 }));
  leaf.position.set(1, 1.4, 0);
  hinge.add(leaf);
  world.addEntity({ id: 'gate', object: hinge, role: 'obstacle', physics: { kind: 'kinematic' } });
  const gateOpen = world.defineParameter({
    id: 'gate.open', description: 'Open or close the gate',
    schema: { type: 'boolean' }, initialValue: false,
    writes: [{ kind: 'entity', entityId: 'gate', channels: ['rotation'] }],
    plan: open => [{ type: 'entity.set-rotation', entityId: 'gate',
      rotationLocalRadiansXYZ: [0, open ? Math.PI / 2 : 0, 0], durationSeconds: 0.35 }],
  });
  world.onInteract('gate', () => ({ type: 'parameter.set', parameterId: gateOpen.id, value: !gateOpen.value }));
  world.registerAction({
    id: 'gate.set-open', description: 'Set the gate open state',
    writes: [{ kind: 'parameter', parameterId: gateOpen.id }],
    inputSchema: { type: 'object', properties: { open: { type: 'boolean' } },
      required: ['open'], additionalProperties: false },
    plan: ({ open }) => [{ type: 'parameter.set', parameterId: gateOpen.id, value: open }],
  });
  const openTime = world.state.define('gate.openTimeSeconds', 0);
  world.onUpdate(({ deltaSeconds }) => {
    if (gateOpen.value) openTime.set(openTime.value + deltaSeconds);
  });
  return {
    gateOpen,
    closeFromText: () => world.execute({ type: 'action.invoke', actionId: 'gate.set-open', arguments: { open: false } }),
  };
}
```

### U4 第一版：原型、第二主体、附件与生命周期

`settle` 是用公开 operations 及 SDK 更新通知写的调用方等待辅助，不是宣称 SDK 提供了未声明的 wait 方法；U5 复用它。

```ts u4.ts
import * as THREE from 'three';
import type { CommandReceipt, World } from '@worldkit/three';

export async function settle(world: World, receipt: CommandReceipt): Promise<void> {
  if (receipt.status === 'rejected') throw receipt.error;
  if (receipt.status === 'applied') return;
  for (;;) {
    const operation = world.operations.get(receipt.operationId);
    if (operation.status === 'succeeded') return;
    if (operation.status === 'failed' || operation.status === 'cancelled')
      throw operation.error ?? new Error(`Operation ${operation.status}`);
    await new Promise<void>(resolve => {
      const off = world.onUpdate(() => { off(); resolve(); });
    });
  }
}

export async function createCompanion(world: World, assetId: string) {
  const template = await world.assets.load(assetId);
  await world.registerPrototype({ id: 'companion', description: 'A complete companion',
    template: { kind: 'character', options: { asset: template } } });
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffc46b }));
  world.addEntity({ id: 'lantern', object: lantern, role: 'decoration' });
  await world.start();
  await settle(world, await world.execute({ type: 'entity.spawn', prototypeId: 'companion',
    entityId: 'companion-2', positionWorldMetersXYZ: [3, 0, 2] }));
  await settle(world, await world.execute({ type: 'entity.attach', childEntityId: 'lantern',
    parentEntityId: 'companion-2', positionLocalMetersXYZ: [0.4, 1, 0] }));
  await settle(world, await world.execute({ type: 'entity.set-scale', entityId: 'companion-2', scaleLocalXYZ: [1.2, 1.2, 1.2] }));
  await settle(world, await world.execute({ type: 'entity.set-visible', entityId: 'companion-2', isVisible: false }));
  await settle(world, await world.execute({ type: 'entity.set-visible', entityId: 'companion-2', isVisible: true }));
  return { remove: () => world.execute({ type: 'entity.despawn', entityId: 'companion-2' }) };
}
```

### U5 第一版：NPC 到点、跟随、停止和恢复

```ts u5.ts
import type { Vec3, World } from '@worldkit/three';
import { settle } from './u4';

export async function directNpc(world: World, npcId: string, heroId: string, points: readonly Vec3[]) {
  const destination = points.at(-1);
  if (!destination) throw new Error('A destination is required');
  const descriptor = world.describe({ entityIds: [npcId] }).entities
    .find(entity => entity.state.id === npcId);
  const move = descriptor?.commands.find(command => command.type === 'actor.move-to');
  if (!move?.isAvailable) throw move?.unavailableReason ?? new Error('NPC movement unavailable');
  world.setAutonomy(npcId, { kind: 'patrol', waypointPositionsWorldMetersXYZ: points });
  await settle(world, await world.execute({ type: 'actor.move-to', entityId: npcId,
    targetPositionWorldMetersXYZ: destination, run: true }));
  const follow = await world.execute({ type: 'actor.follow', entityId: npcId,
    targetEntityId: heroId, distanceMeters: 2 });
  if (follow.status === 'rejected') throw follow.error;
  return {
    follow,
    readFollow: () => follow.status === 'accepted' ? world.operations.get(follow.operationId) : null,
    stop: () => world.execute({ type: 'actor.stop', entityId: npcId }),
    resumePatrol: () => world.execute({ type: 'actor.resume-autonomy', entityId: npcId }),
  };
}
```

### U6 第一版：缺能力和缺原型的显式发现

返回的 gap 是调用方提供给 Creator 的检查结果，不冒充 SDK 已执行的操作，也不调用任何未声明的扩展 API。

```ts u6.ts
import type { RuntimeError, Vec3, World } from '@worldkit/three';

export function movementGap(world: World, entityId: string, movementKind: string): RuntimeError | null {
  if (world.describe({ entityIds: [entityId] }).supportedMovementKinds.includes(movementKind)) return null;
  return { code: 'CREATOR_MOVEMENT_EXTENSION_REQUIRED', category: 'unsupported-capability',
    entityIds: [entityId], message: `No registered ${movementKind} movement capability`,
    suggestedAction: 'Report the missing movement contract to Creator; do not teleport or create another physics world' };
}

export async function spawnOrReport(world: World, prototypeId: string, entityId: string, position: Vec3) {
  const prototype = world.describe().prototypes.find(item => item.id === prototypeId);
  if (!prototype || prototype.status !== 'ready') {
    const gap: RuntimeError = { code: 'CREATOR_PROTOTYPE_PREPARATION_REQUIRED',
      category: 'unsupported-capability', entityIds: [entityId],
      message: `Prototype ${prototypeId} is ${prototype?.status ?? 'missing'}`,
      suggestedAction: 'Have Creator prepare or diagnose the prototype, then describe it again' };
    return { kind: 'creator-gap' as const, gap };
  }
  return { kind: 'command-receipt' as const, receipt: await world.execute({
    type: 'entity.spawn', prototypeId, entityId, positionWorldMetersXYZ: position,
  }) };
}
```

### 首轮检查记录

以上第一版代码保持原样。首次实际检查使用 TypeScript 5.9.3，将六个代码块作为虚拟文件，`@worldkit/three` 仅映射到设计声明；没有加载运行 SDK。编译选项为 ES2022、ESNext、Bundler、strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess、noEmit，skipLibCheck=false、types=[]。

首次检查实际返回三个诊断：

```text
u3.ts:28:38 TS2345
Argument of type 'number' is not assignable to parameter of type '0'.

u6.ts:5:3 TS2741
Property 'phase' is missing in type '{ code: string; category: "unsupported-capability"; entityIds: string[]; message: string; suggestedAction: string; }' but required in type 'RuntimeError'.

u6.ts:13:11 TS2741
Property 'phase' is missing in type '{ code: string; category: "unsupported-capability"; entityIds: string[]; message: string; suggestedAction: string; }' but required in type 'RuntimeError'.
```

首次检查结束时观察到的磁盘 SHA-256：d.ts 为 `d679c80ca7b797260aa7ca65787e1ac477dd67be91887b86abf3fceccc77402d`，spec 为 `fb50aa591481852e75fc61a9ad00574e08eec2740386f8f176e138f419556796`。该次脚本在检查结束后读取文件 hash，期间 Root 正并发完善合同；这些值不是首次阅读内容的快照证明。首次阅读的 RuntimeError 尚无必填 phase，实际编译时已有；两处 phase 诊断因此是设计版本差异，不能计为 Agent 漏读同一版本合同。

U3 则暴露了真实的默认推导问题：`define('gate.openTimeSeconds', 0)` 推导为 `StateHandle<0>`，不能接受下一个 number。Root 已在公开设计中给 number/boolean/string 加默认 widen overload；修正的是 API，不要求每个使用者手写 `define<number>`。本报告没有把“知道加泛型”算成易用性通过。

## D. 冻结设计复核与必要修订

复核前将实际编译的声明文本一次读入内存，TypeScript CompilerHost 始终读取此快照，hash 也来自同一文本。冻结输入为：

| 输入 | SHA-256 |
| --- | --- |
| public-api.d.ts | `0a6ed4d88a594752b4bb0b072e36a32c377815708843a64fd5bf9c1992c57e2b` |
| spec | `893a4a2b546cd9598e15667774004732dd50d6ab5eaad671518c34f9f20d9855` |
| U1 原始代码 | `47ee99750476267d2cb053f877710750356df4b3fe8534d5248695e1d09970ae` |
| U2 原始代码 | `306bf576881d8e988c2bbc7c63f3144e9aa9bbdb5838e929d0fd5c96d3819e0a` |
| U3 原始代码 | `5075b26a1a0aeb2a1bf02ae379919093fc5697fff6dd8eba945462cf03229cd8` |
| U4 原始代码 | `ea7b7642ffbf6f7e890981c8409fca5758d2f70dda327309fa07abcd354bac5c` |
| U5 原始代码 | `e485acbda12a2c8e5866872fca2691e3be2d1ae772580edc087acb6926b435d0` |
| U6 原始代码 | `b17c6ecc8cd7be85c539a705c99b019f1697748e4feba6592865119381ab0fe4` |

对**未经修改的六段代码**重新编译，U3 原样通过；仅剩上述 U6 两个 TS2741。U1–U5 没有类型错误，但 U4/U5 的类型通过不代表异步状态安全。

### U4 第二版：SDK 等待入口与异步作用域

原来的 settle 等下一次 onUpdate 才重查 operation：暂停后没有新帧，reset/dispose 的取消也不保证触发 onUpdate，因此会悬挂；每个作者自己实现监听清理、终态竞争、取消处理是多余负担。建议 SDK 提供一个 `operations.wait`，Root 已采纳到冻结设计。其合同适合常用路径：终态直接返回；等待者注册与终态变化没有丢通知窗口；不启动或推进世界；reset/dispose 取消并唤醒；外部 AbortSignal 只取消等待，取消操作仍显式调用 cancel；不存在/已清理 ID 明确失败。

以下保留一个很薄的应用层 settle，将失败/取消转换成此用例的异常控制流；等待和生命周期处理由 SDK 负责。第二版前提是调用方已启动世界，运行中生成同伴。跨 await 的资产、原型、注册及命令都在同一个 runTask 内；返回的 remove 是之后的独立用户意图，不能捕获已经结束的 scope。

```ts u4-revised.ts
import * as THREE from 'three';
import type { CommandReceipt, World } from '@worldkit/three';

export async function settle(world: World, receipt: CommandReceipt, signal: AbortSignal): Promise<void> {
  if (receipt.status === 'rejected') throw receipt.error;
  if (receipt.status === 'applied') return;
  const terminal = await world.operations.wait(receipt.operationId, { signal });
  if (terminal.status !== 'succeeded')
    throw terminal.error ?? new Error(`Operation ${terminal.id} ${terminal.status}`);
}

export async function createCompanion(world: World, assetId: string) {
  await world.runTask(async scope => {
    const template = await scope.assets.load(assetId);
    if (!template.recommendedBody) throw new Error('This asset needs authored body dimensions');
    await scope.registerPrototype({ id: 'companion', description: 'A complete companion',
      template: { kind: 'character', options: { asset: template } } });
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xffc46b }));
    scope.addEntity({ id: 'lantern', object: lantern, role: 'decoration' });
    await settle(world, await scope.execute({ type: 'entity.spawn', prototypeId: 'companion',
      entityId: 'companion-2', positionWorldMetersXYZ: [3, 0, 2] }), scope.signal);
    await settle(world, await scope.execute({ type: 'entity.attach', childEntityId: 'lantern',
      parentEntityId: 'companion-2', positionLocalMetersXYZ: [0.4, 1, 0] }), scope.signal);
    await settle(world, await scope.execute({ type: 'entity.set-scale', entityId: 'companion-2',
      scaleLocalXYZ: [1.2, 1.2, 1.2] }), scope.signal);
    await settle(world, await scope.execute({ type: 'entity.set-visible', entityId: 'companion-2',
      isVisible: false }), scope.signal);
    await settle(world, await scope.execute({ type: 'entity.set-visible', entityId: 'companion-2',
      isVisible: true }), scope.signal);
  });
  return { remove: () => world.execute({ type: 'entity.despawn', entityId: 'companion-2' }) };
}
```

此用例不会把 set-visible 当成删除碰撞：显隐仅检查视觉，remove 才删除主体及其删除闭包。附件必须是非物理子树；角色缩放仍可能被真实身体限制拒绝。原型/资源生命周期及刚体能力要按实际 Runtime 检查，不能由类型结果认定通过。

### U5 第二版：同一任务的 move → follow，以及新的 stop 意图

```ts u5-revised.ts
import type { Vec3, World } from '@worldkit/three';
import { settle } from './u4';

export async function directNpc(world: World, npcId: string, heroId: string, points: readonly Vec3[]) {
  const destination = points.at(-1);
  if (!destination) throw new Error('A destination is required');
  const descriptor = world.describe({ entityIds: [npcId] }).entities
    .find(entity => entity.state.id === npcId);
  const move = descriptor?.commands.find(command => command.type === 'actor.move-to');
  if (!move?.isAvailable) throw move?.unavailableReason ?? new Error('NPC movement unavailable');
  world.setAutonomy(npcId, { kind: 'patrol', waypointPositionsWorldMetersXYZ: points });
  const follow = await world.runTask(async scope => {
    await settle(world, await scope.execute({ type: 'actor.move-to', entityId: npcId,
      targetPositionWorldMetersXYZ: destination, run: true }), scope.signal);
    const receipt = await scope.execute({ type: 'actor.follow', entityId: npcId,
      targetEntityId: heroId, distanceMeters: 2 });
    if (receipt.status === 'rejected') throw receipt.error;
    return receipt;
  });
  return {
    follow,
    readFollow: () => follow.status === 'accepted' ? world.operations.get(follow.operationId) : null,
    stop: () => world.execute({ type: 'actor.stop', entityId: npcId }),
    resumePatrol: () => world.execute({ type: 'actor.resume-autonomy', entityId: npcId }),
  };
}
```

这里 move-to 的成功才触发 follow；NO_PATH、冲突、失败和取消会保留实际错误，不能假称到达。follow 是持续任务，返回 accepted 后不等其自然结束。stop 与 resumePatrol 是调用方以后主动触发的同步入口。描述只做提前提示，execute 仍负责校验当下状态，不根据旧 describe 结果承诺一定成功。已接受任务归 world 管理，runTask 正常返回与 reset/dispose 取消必须保持不同语义。

### U6 第二版：不把准备中或准备失败混为缺能力

补 phase 是同步到新版声明。另一个与类型无关的修正是对 prototype preparing/failed 分流：准备中返回 pending；失败保留 SDK 实际错误（公开类型允许 error 缺省，因此也保留 null），不重写成 unsupported-capability。movementGap 仅检测全局是否注册了该运动类型，返回 null 不表示此实体可执行它；具体命令仍查该实体的 commands 并看执行回执。

```ts u6-revised.ts
import type { RuntimeError, Vec3, World } from '@worldkit/three';

export function movementGap(world: World, entityId: string, movementKind: string): RuntimeError | null {
  if (world.describe({ entityIds: [entityId] }).supportedMovementKinds.includes(movementKind)) return null;
  return { code: 'CREATOR_MOVEMENT_EXTENSION_REQUIRED', phase: 'creator-preflight',
    category: 'unsupported-capability', entityIds: [entityId],
    message: `No registered ${movementKind} movement capability`,
    suggestedAction: 'Report the missing movement contract to Creator; do not teleport or create another physics world' };
}

export async function spawnOrReport(world: World, prototypeId: string, entityId: string, position: Vec3) {
  const prototype = world.describe().prototypes.find(item => item.id === prototypeId);
  if (!prototype) {
    const gap: RuntimeError = { code: 'CREATOR_PROTOTYPE_PREPARATION_REQUIRED', phase: 'creator-preflight',
      category: 'content', entityIds: [entityId], message: `Prototype ${prototypeId} is not registered`,
      suggestedAction: 'Have Creator prepare the prototype, then describe it again' };
    return { kind: 'creator-gap' as const, gap };
  }
  if (prototype.status === 'preparing') return { kind: 'preparation-pending' as const, prototypeId };
  if (prototype.status === 'failed') return { kind: 'preparation-failed' as const,
    prototypeId, error: prototype.error ?? null };
  return { kind: 'command-receipt' as const, receipt: await world.execute({
    type: 'entity.spawn', prototypeId, entityId, positionWorldMetersXYZ: position,
  }) };
}
```

公开合同足以发现并报告没有 climb/fly 等能力；CharacterOptions 当前只接受 GroundMovement，尚无公开的运动扩展注册接口。本例没有猜 `registerMovement` 等名字，也没有自己增加第二套物理。完成“可用能力扩展实现”不在这六个设计片段的通过范围内。prototype 描述没有准备 operationId，观察者可以返回 pending 或重新 describe；持有 registerPrototype Promise 的作者直接等待它，不能伪造可 wait 的任务 ID。

### 最终类型检查记录

最终实际检查使用原 U1/U2/U3 + 第二版 U4/U5/U6，共六个虚拟入口文件。第二版代码块映射回 u4.ts/u5.ts/u6.ts，因此 U5 的相对导入实际解析到第二版 U4。声明快照和编译选项与本节原样复核一致；检查耗时约 2.14 秒，进程退出码 0，诊断为空：

```json
{
  "typescript": "5.9.3",
  "sourceCount": 6,
  "dtsSha256": "0a6ed4d88a594752b4bb0b072e36a32c377815708843a64fd5bf9c1992c57e2b",
  "specSha256": "893a4a2b546cd9598e15667774004732dd50d6ab5eaad671518c34f9f20d9855",
  "diagnostics": []
}
```

第二版实际编译文本 SHA-256：U4 为 `1d10a991183a8e228e4ddf791093da279e14d2c85f4d4a02ab586e86cdcd2695`；U5 为 `8044658c7bd119546740340f431a306ec20fde8a29e257c120dfad4ec7e85f85`；U6 为 `0df905110bb1d267dc944d96f3a54a7f1bddf1d82ce503102aea416a0cb51482`。U1–U3 与上表完全相同。

## E. 六用例的易用性与语义判断

初稿依据仅两份公开输入（spec + d.ts）。复核时另读了新增 quickstart 的入口/默认操作说明，没有读取 Root 的 examples.ts 或 SDK 实现。下表记录查阅的合同区域；没有记录逐次点击数，因此不编造“只查了几次”的指标。

| 用例 | 最终类型 | 为理解语义所需查阅 | 是否需猜接口、剩余边界 |
| --- | --- | --- | --- |
| U1 资产角色/首帧 | 原版通过 | Assets、CharacterOptions、TaskScope；spec 角色/素材与 start 约定 | 无需猜加载器、Mixer、动作 ID 翻译。调用方选择已有资产，缺身体资料显式中止；role=terrain 的默认碰撞、idle 求值、首帧保持由合同承诺，真实结果尚未验。作为尚未向用户发布的初始化流程使用；运行中跨 await 的生成用 U4 scope 路径。 |
| U2 相机/生命周期 | 原版通过 | CameraFollowOptions、cameraMode、useAuthoredCamera；spec §5、§8.4；复核 quickstart 默认输入 | 无需猜接管/交还方法；普通 Three 相机仍可构图。默认首键进入跟随、reset 恢复初始模式已写清。示例是显式生命周期顺序演示，不是允许旧异步过场在 reset 后继续改相机；手感、碰撞和过渡连续性待浏览器验证。 |
| U3 参数/交互/状态 | 原版经声明修正通过 | ParameterDefinition、ActionDefinition、StateStore；spec §7、§8.1–§8.2 | 无需猜 Schema 或双份 doorOpen。自然数值初始值真实触发了字面量类型问题，API 已修。gateOpen.value 是期望值；openTime 统计期望打开期间的时间，不能作为实际通道已经打开的证据。门铰链几何及 kinematic 语义仍由场景与 Runtime 验证。 |
| U4 生成/附件 | 第二版通过 | PrototypeDefinition、TaskScope、Operations；spec §6、§8.3、§8.5 | 原版确实额外手写了有悬挂风险的等待循环；wait 消除了该负担。原版还漏用异步 scope，类型没有拦截，不能只归咎于并发文档变动。修订后无需底层实例化/物理 API；是否安全生成、克隆独立、附件随动和删除闭包待实现验收。 |
| U5 NPC 任务 | 第二版通过 | describe commands、CommandReceipt、Operations、Autonomy；spec §8 | 无需猜 move/follow/stop 名称、坐标或优先级；必须理解 accepted 不等于到达。原版跨 await 后的 follow 改为 scope 提交；新用户 stop/resume 仍走新入口。真实路径存在、被接管后巡逻不抢回以及异步取消不悬挂不能靠类型证明。 |
| U6 缺能力 | 第二版通过 | WorldDescription、RuntimeError；spec §8.5、§9 | 未猜运动扩展 API。phase 缺失来自并发声明变更；preparing/failed 的误分类是首版调用方语义问题，已分流。只能证明能查全局支持/实体命令并明确报缺口，未证明公开合同足以实现新的运动模式。 |

六条基础路径均不需要导入 Rapier、Recast、AnimationMixer 或弹簧臂实现，不需要拼资源 hash、自己修骨架或填写来源优先级。实际发现并推动的公开设计改善是标量状态默认 widen 和统一任务等待；另两处通过使用侧修订纠正的是异步 scope 的使用和准备状态的分类。

本轮结论为**六用例公开类型通过，设计级语义路径可表达**。这不是陌生 Agent 盲测，也不是 Runtime、真实模型创作成功率或用户手感通过。没有运行 mock SDK、浏览器物理测试或新云端模型任务；原始错误、合同并发变动和二版修正均已分别保留。
