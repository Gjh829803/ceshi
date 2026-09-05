# Agent / SDK v2：职责、体验标准与公开接口

状态：设计提案与可用性检查，**不是已实现的 SDK API**。用户要求先对齐职责再系统优化；本轮只修改设计/评审资料，不恢复运行代码修改或云端案例提交。当前 SDK 运行基线为 `e1fdfd5a`；之后的镜头输入/碰撞草稿保持未完成状态。

本提案替代旧设计中“方向键等同 WASD”的产品假设。用户已明确：WASD 移动、方向键转镜头、普通跳不自动硬落地、角色相撞不抖动、弹簧臂平滑。它保留自由 Three.js 创作和独立质量验收。

Creator 先读[一页入口](../designs/agent-sdk-v2/quickstart.md)，按需查阅公开合同：[public-api.d.ts](../designs/agent-sdk-v2/public-api.d.ts)。该文件只用于类型/文档审阅，不进入运行包、MCP 当前能力表或生产出口。示例同样只用于验证拟定接口。

## 1. 职责细分：内容归 Creator，执行归 SDK，判定归独立评测

| 事项 | Creator Agent 必须交付 | SDK 必须保证 | 独立验收 |
| --- | --- | --- | --- |
| 首帧 | 按原图选择 Three 相机、FOV、姿态、主体位置/轮廓、地标遮挡与颜色 | 原相机/原世界渲染；启动和捕获不擅自改成固定居中后视 | 相同画幅对比原图，并侧移检查真实三维 |
| 世界几何 | 普通 Mesh/Group/InstancedMesh、真实高差、完整建筑、合理画外延伸 | 直接运行几何；按声明生成真实碰撞，不换成隐形底板 | 可见表面与实际支撑相符 |
| 道路和探索 | 建出通路、岔路、关键目的地及 180–300 秒有内容的游览 | 提供地面移动、寻路、路线检查和具体失败证据 | 实登塔、跨梯田、过桥、到远端并返回；不以作者自选目标代替 |
| 主体与附件 | 选合适资产或自由造角色；完整身体/尾巴/服饰同组；为自造角色声明身体尺寸 | 资产归一、每实例动画、完整随动、碰撞分组、重置和释放 | 跑转跳后附件仍连接；三视图包含完整对象 |
| 3C 操作 | 选择相容的运动能力及少量场景参数 | 按键语义、动作边沿、真实支撑、碰撞求解、镜头弹簧臂 | 固定 3C 试验场和真实输入基准 |
| 玩法逻辑 | 机关触发、胜负/任务、环境变化、NPC 的高层任务 | 一个时钟；动作/变换/导航等执行通道，支持取消与恢复 | 交互、失败、重新开始都一致 |
| 世界可控性 | 注册有意义的实体 ID/名称/标签/外观说明、原型、参数和动作 | 从真实注册内容生成能力表；执行命令并同步渲染/物理/导航 | 命令不会下帧被旧脚本改回；未支持能力明确失败 |
| 视频渲染分工 | 给出外观语义、完整主体/地标分组和需交互的实体 | 输出同一世界的 RGB 观察/状态；维护稳定身份 | 三视图/视频与同一世界版本一致；视频效果另验 |
| 创建闭环 | 查看真实预览、读错误、修改自己的世界代码 | 编译、运行、截图、实际输入、诊断和版本绑定工具 | 保存失败，不把技术交付标签当成效果通过 |

快模型 Controller 不创建 Three 源码。它读取当前相关实体/能力，输出一个结构化命令。调用 ID、上下文版本和来源由 Host 记录，不要求模型生成基础设施字段。

视频模型负责外观生成；需要碰撞、行动、交互的变化必须在 SDK 世界落地。SDK 不负责自然语言理解、视频模型调用或凭空生成未准备好的资产。缺少龙原型时，“生成龙”返回能力缺失并交给 Creator 异步准备，不伪装成实时 spawn 成功。

## 2. 必须保持的自由与执行边界

- Creator 继续用正常 Three.js 创作几何、材质、实例与视觉子树。没有四种方块、统一调色板、固定首帧中心或私有建场 DSL。
- 注册粒度是角色、桥、树、房子等有语义对象；不要求每块 primitive 注册。
- **注册根的 position / rotation / scale / visibility 分别是管理通道**。实时修改这些通道走 SDK。单独控制缩放不应取消尾巴的局部摆动。
- 未独立注册的视觉子节点可以在同步 `onUpdate` 中使用普通 Three.js 动画、粒子或材质逻辑。这里纯视觉指不参与物理形状：例如使用独立 body 的角色尾巴、装饰实体内部节点。terrain/obstacle 默认从网格派生碰撞，其子树不是自动的视觉豁免区；活动装饰需单独标为 decoration 并排除父碰撞，未声明的物理子树变形由 authoring 诊断拒绝。SDK 不为每个顶点提供一种私有指令语言。
- 角色根的运动、受管理动作 Mixer、游玩相机和物理 step 不由 Creator 另起循环驱动。自定义玩法提交任务/意图；不能每帧 `position=旧值` 抢回用户命令。
- 初始化几何仍自由；本次公开接口负责运行中的姿态/缩放及已准备原型的生命周期。直接修改受管理物理网格的顶点/拓扑暂不在 v2 公共保证内，需后续独立的异步几何替换接口与版本校验，不能假称已有可调用入口。纯装饰变形不触发物理。具有碰撞的连续姿态变换需要 kinematic 实体；SDK 返回明确前置条件，不能暗中改成无碰撞。
- 新运动方式通过版本化 movement 扩展合同进入一个执行时钟，不开放“再跑一个物理世界”作为回退。当前 ground 能力之外的 climb/fly/swim 必须在真实能力表里说明是否支持；缺能力和世界几何错误分别报告。

## 3. 产品体验标准与验收方法

| ID | 标准 | 必须验证的情况 |
| --- | --- | --- |
| C01 输入 | WASD 相对期望镜头朝向移动；四个方向键控制镜头 yaw/pitch；拖动同样控制镜头 | 单键、组合键、按住/重复/松开，方向键单独操作无人物 XZ 位移；同 tick 先更新期望朝向再计算移动 |
| C02 跑跳 | Shift 按住持续跑，松开恢复；Space 每次新按下触发一次跳跃 | 重复 keydown 不切换跑步；长按不重复起跳；落地可立即再次操作 |
| C03 普通跳动画 | 普通跳上升、顶点、下降连续使用已验证 jump 绑定；着地按真实速度回 idle/walk/run | 片段时间连续；不因 vy 变负选夸张 fall；不自动插 land.hard 或移动锁定；物理和动画时钟分别如实记录 |
| C04 特殊动作 | 单次动作结束/取消后归还动画控制；循环动作有明确 stop | 跳舞结束能继续走跑；缺动作返回 unsupported，不报假播放 |
| C05 物理 | 真几何支撑、正确脚底高度；人物相撞不继承对方侧向接触旧速度 | 静止 NPC、追赶、迎面、斜擦、多角色和墙边夹击；正常阻挡与速度抖动分开 |
| C06 相机 | 首帧保持；进入游玩有过渡；有体积的防穿墙探测；离墙平滑恢复 | 正面/侧面接近墙、门洞、墙角、上下坡、转向、缩放、重置；安全限位优先，不能为平滑留在墙里 |
| C07 遮挡稳定 | 遮挡边缘不持续缩放抖动；参数改变与解除遮挡分别处理 | 不同帧率、轻微往返、对象显隐/缩放、突然出现墙；后者可能需要安全纠正，不能承诺永不跳变 |
| C08 生命周期 | 暂停不补跑；重置恢复初始世界、相机、动作与 SDK 状态 | 失焦、重入、重复开始/暂停、跳跃中重置；旧异步结果不复活实体 |
| C09 命令一致性 | 同一目标只接受一个有效通道所有者；受支持的姿态/缩放/增删同步物理与导航 | 用户改尺寸后仍保持；隐藏父节点时子节点有效可见性正确；删桥后旧路线失效 |
| C10 证据 | 从当前真实世界产生截图、视频、输入和状态 | 同世界/同版本闭包；不使用另一个“展示场景”，不修改测试目标掩盖问题 |

验收不只列“测试通过”：要保存实际输入、速度、脚底高度、碰撞对象、期望/实际相机距离、动画 ID/时间、帧时间与关键画面。30/60/120Hz 调度下结果应在记录的引擎容差内一致。相机恢复曲线和“手感”需实际操作评审，不能用单元测试数代替。

延迟要求分开量：普通显隐/参数等轻量命令在下一个固定 tick 提交；寻路、原型准备或复杂碰撞重建立即给 operation，再异步计算并按版本提交，不阻塞当前游玩。具体毫秒预算在固定设备、场景规模和浏览器配置下测量；未测不宣称总延迟或任意规模下 60fps。

## 4. 模块结构：Agent 看到一个 World，内部按责任拆开

| 模块 | Agent 常用入口 | 内部唯一职责 |
| --- | --- | --- |
| World / 生命周期 | `createWorld`, `start`, `stop`, `reset`, `dispose` | 调度、准备完成、初始快照、错误与释放 |
| Entities / 身份 | `addEntity`, `addCharacter` | 语义对象、父子关系、实例 generation、变换通道 |
| Assets / 角色表现 | `assets.search`, `assets.load` | 原始资产校验、默认姿态、克隆、动作语义绑定、Mixer 和共享资源 |
| Input / Character Motion | `setControlledEntity`、角色的 `movement`/`body` | 输入意图与物理执行；Creator 不接触 KCC 句柄 |
| Camera Rig | `setCameraFollow` | 期望朝向、首帧到游玩切换、防穿墙、弹簧臂状态 |
| Navigation / NPC | `setAutonomy`、`actor.move-to/follow/stop` 命令 | 寻路、任务状态、取消和自主行为恢复；不补造道路 |
| Parameters / Actions | `defineParameter`, `registerAction`, `onInteract` | 可控参数、纯命令计划、参数校验、状态与操作绑定 |
| Gameplay / State | `onUpdate`, `state.define`, `onReset` | 自定义视觉和游戏规则；私有游戏状态默认不暴露给快模型 |
| Control / Observation | `describe`, `execute`, `snapshot`, `operations` | 实际能力 Schema、事务、幂等、诊断和任务状态 |
| Creator Host 工具（SDK 外） | validate / preview / inspect / playtest / submit | 浏览器进程、记录、图片返回、独立证据和交付 |

这些是内部模块，**不要求 Agent 初始化十套服务**。生产入口只导入 Three 和 `createWorld`。底层 Rapier、Recast、动画播放器、弹簧臂 solver 是 SDK 实现接口，不出现在入门任务里。

## 5. 入门路径与公共接口约定

最常见路径为：创建普通 Three 场景 → 注册地形/角色 → 设置控制和镜头 → 声明主要捕获目标 → `await world.start()`。

```ts
import * as THREE from 'three';
import { createWorld } from '@worldkit/three'; // 以下为拟定 v2 API

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, .05, 1000);
camera.position.set(7, 5, 10);
camera.lookAt(0, 1, 0); // Agent 按参考图选择
const world = await createWorld({ scene, camera, canvas });

world.addEntity({ id: 'ground', object: groundMesh, role: 'terrain' });
const hero = await world.assets.load('humanoid.g-bot');
world.addCharacter({ id: 'hero', asset: hero });
world.setControlledEntity('hero');
world.setCameraFollow({ distanceMeters: 5 });
world.setCaptureTargets(['hero', 'ground']); // 实际案例选完整主体和主要地标
await world.start();
```

`canvas` 和 `groundMesh` 是正常 DOM / Three 对象，不是新的 SDK 建模接口。完整可类型检查示例与声明放在 designs/agent-sdk-v2。

基础调用的默认行为：

- `addEntity` 必须声明 terrain/obstacle/decoration，避免忘记碰撞的沉默成功。前两类默认真实 fixed mesh；decoration 无碰撞。连续移动物理对象显式选 kinematic，dynamic 显式选可用碰撞形状。
- `addCharacter` 在 `asset` 与 `object` 两种来源中选一种，不重复传入可能不一致的 object+asset。预验证资产可使用其推荐身体尺寸；recommendedBody 为 null 且未提供 body 时明确拒绝，不能默造人体尺寸。自制 Three 角色必须提供 height/radius，不能把九尾整体包围盒直接当身体碰撞。
- `assets.load(id)` 只加载 Host 锁定目录里的资产，完成坐标归一、默认姿态求值与实例所有权登记。Creator 不写 GLB 哈希、不手动更新人物 Mixer、不重做 armature 修正。
- `setCameraFollow` 默认保持现有相机直到首次视角/移动输入，再进入跟随。参数是距离、目标高度等产品概念；底层碰撞判定与阻尼状态留在 SDK。省略 `setCameraFollow` 表示保留 authored 相机模式，不宣称自动具备标准游玩镜头；常规案例模板默认调用它。
- `start` 等待已登记的准备任务，封存初始状态并安装同世界 Host 观察接口；不再要求额外 `expose()` 或第一帧 `mixer.update(0)`。加载失败时不发布 ready。
- `setCaptureTargets` 引用完整对象且总含受控角色；没有固定五个槽位。辅助小件不用每个单独捕获。
- `registerPrototype` 接收预构造模板并异步准备；模板不需预留实体 ID，spawn 时再给 ID。准备失败/未准备好时能力表如实反映，spawn 不临时运行模型或下载未知资产。注册在准备时封存独立模板快照，不借用或夺走 live 角色；之后改源对象不影响该模板。每次 spawn 有独立根、骨架/Mixer、可变材质和 generation；只共享不可变资源，引用计数释放。原型重名拒绝，更新使用新 ID；reset 保留初始原型并丢弃后来注册/过期准备。

## 6. 实时控制协议：快模型只输出意图

代码构建使用 Three 对象；运行控制使用封闭命令。它们表达不同阶段，不是两种相互竞争的几何语言。

```ts
await world.execute({
  type: 'entity.set-scale', entityId: 'tree-7', scaleLocalXYZ: [2, 2, 2]
});
await world.execute({
  type: 'actor.follow', entityId: 'guide', targetEntityId: 'hero', distanceMeters: 2
});
```

`set-visible` 只改变渲染可见性，不隐式删除物理或导航。用户要求对象真正“消失/移除”时使用 `despawn`，同步撤销其碰撞、导航贡献和任务。Controller 收到的命令描述必须说明这种区别，不能把隐藏产生的隐形障碍当成已满足移除。

v2 坐标命名明确：位置命令为 `positionWorldMetersXYZ`，附件偏移为 `positionLocalMetersXYZ`，缩放为 `scaleLocalXYZ`，旋转为 `rotationLocalRadiansXYZ`。查询直接返回这些字段及有效可见性，减少“这个坐标是相对谁”的猜测。v2 将整体升级例子、Schema、工具与消费者，不保留永久同义字段。

`describe({query:'桥'})` 返回相关对象的当前状态、允许命令及参数 Schema、动作 ID、原型准备状态、自定义参数和不可用原因。描述来自实际注册的 handler/资源/状态，不是单独手写的“支持全部能力”清单。返回类型见 .d.ts，不能继续是 unknown。

命令回执有三种：

- `applied`：即时状态已在固定 tick 提交。
- `accepted + operationId`：已接受一个持续或异步任务，**不是已经到达或已经完成**。用 `operations.get(id)` 读取 queued/running/succeeded/failed/cancelled。
- `rejected + error`：未提交，给出错误分类、关联对象和可操作原因。

需要等待任务结束时使用 `await world.operations.wait(operationId, {signal})`，返回 succeeded / failed / cancelled 终态；无需 onUpdate 或定时轮询。wait 不推进或自动启动世界，暂停期间可以继续等待恢复；reset/dispose 将相应任务置为 cancelled 并唤醒等待者，不能永久悬挂。AbortSignal 仅停止本次等待并拒绝为 WAIT_ABORTED，不暗中取消底层任务；主动取消调用 operations.cancel。终态历史被清理或 ID 不存在时明确返回 OPERATION_NOT_FOUND 错误，不挂起。异步完成后要改世界时仍使用 runTask 的 scope/epoch 保护。

Host 为 Controller 调用补 commandId、它实际读取的 worldRevision 和来源。重试同 commandId 返回原回执；同 ID 不同内容必须拒绝。worldRevision 反映控制/注册/结构变化，不随每帧位移增长；simulationTick 单列。缓存对象引用在 reset/despawn 后以 generation 判旧，异步结果提交也检查该身份和几何版本。

对多条动作计划，SDK先校验全部内置操作，原子提交状态与任务意图；多个持续动作未来完成不能承诺为同一瞬间或全部可回滚。物理影响需要准备时先异步生成候选，验证成功才提交。外部 IO/任意 JS 副作用不在事务保证中，也不允许作为直接暴露给快模型的控制 handler。

## 7. 自定义参数和交互：共用同一份状态

```ts
const gateOpen = world.defineParameter({
  id: 'gate.open', description: '打开或关闭北侧大门',
  schema: { type: 'boolean' }, initialValue: false,
  writes: [{ kind: 'entity', entityId: 'gate', channels: ['rotation'] }],
  plan: open => [{
    type: 'entity.set-rotation', entityId: 'gate',
    rotationLocalRadiansXYZ: [0, open ? Math.PI / 2 : 0, 0], durationSeconds: .35
  }]
});
world.onInteract('gate', () => ({
  type: 'parameter.set', parameterId: gateOpen.id, value: !gateOpen.value
}));
// 快模型也发 parameter.set；不另维护一个与 gateOpen 冲突的局部布尔变量。
```

这里 gate 是 Creator 创建的普通 Three Group，铰链原点由 Creator 放对，并声明 kinematic 物理。`plan` 只返回 position/rotation/scale/visibility 属性目标，不允许 spawn、冲量、播放动作或持续 NPC 任务；这些一次性/任务操作使用 action。不要在其中直接改 Three、做 IO 或返回 Promise。SDK 收集目标通道、校验、提交参数值与变换任务，后续旋转由 SDK 执行。

参数值表示当前提交的期望值；持续变换期间描述中同时返回 operationId 和实体实际姿态，不能把“期望打开”当成“通道已完全打开”。`initialValue` 的映射在 start 封存基线前直接求值到终态，忽略过渡时长并在 tick 0 完成物理准备，避免首帧封存中间姿态；重置同样恢复该终态。

复杂自定义动作使用 `registerAction({id, description, inputSchema, writes, plan})`，计划可组合内置命令和已注册参数。Schema 与 handler 一处注册，回调参数类型从 Schema 推导。禁止递归 action.invoke 和不声明的目标/通道。SDK只能保证返回命令的提交，不声称能事务回滚任意作者 JavaScript；越界写由 authoring 检查/运行诊断报告，并阻止该能力以已验证状态发布。

自由视觉循环仍是正常代码：

```ts
world.onUpdate(({ simulationSeconds }) => {
  tailVisual.rotation.z = Math.sin(simulationSeconds * 3) * .2;
});
```

`tailVisual` 为角色内未独立注册的纯视觉子节点；角色根整体移动/缩放仍由 SDK 执行，所以实时改变狐狸大小不会被摆尾循环覆盖。需要重置的计数/游戏数据用 `world.state.define`；任意闭包变量不能自动还原，仍需 onReset。私有游戏状态不自动暴露为快模型可写参数。

## 8. 控制权与任务结束的明确规则

| 通道/动作 | 执行与结束规则 |
| --- | --- |
| 受控角色 locomotion | 玩家输入独占；NPC move/follow 不抢夺，返回冲突。切换受控对象是 Host/Creator 显式操作 |
| NPC 自主巡逻 | SDK 的 setAutonomy 持有任务；用户 move/follow 接管同一个 locomotion 通道，不让巡逻回调下帧抢回 |
| NPC stop | 取消当前移动并暂停自主行为；直到 resume-autonomy 或新的移动命令，不是只清一帧速度 |
| NPC move-to 完成 | 到达后保持；不悄悄恢复巡逻把角色带走。恢复自主行为需要明确命令 |
| 单次动画 | 播完/取消后自动回当前 locomotion 表现；循环动作需要 stop-action。不再使用永久 manualActions Set |
| 位置/旋转/缩放/可见性 | 分开仲裁；同一通道新意图取消旧任务。颜色/视觉子节点等不相关变化不取消根运动 |
| 参数映射 | 参数值为持久期望状态。映射占用的根通道暴露为语义参数，快模型不能绕过参数直接写同一通道；有冲突返回应使用哪个参数 |
| 内部 gameplay 直接写受管理根 | authoring违规；提供对应 SDK 调用和对象 ID，不静默与命令竞争 |
| reset/despawn | 递增epoch/generation，取消相关任务、清输入、释放非基线实例，晚到异步结果作废 |

来源与优先级由 Host/SDK 赋予，不出现在模型可填的 JSON 中。Creator 私有脚本不能通过自填 priority 抢过用户操作。命令不能自动切掉不相关通道的行为。

本版本不设计一个任意“写属性路径”入口；那会让快模型操作 engine 内部字段、破坏碰撞和状态归属。新增语义能力通过有 Schema 的参数/动作或 SDK 扩展进入。

### 8.1 参数、动作计划和失败

- writes声明实际写目标/通道：实体通道、参数ID或可生成的原型ID。参数只声明实体属性通道；自定义action可以声明参数或原型。描述表投影同一声明，plan每个分支都必须是其子集。读取无写权限效果；未经声明的目标直接拒绝。
- 参数有 settled / transitioning / interrupted / failed 状态。value始终是已提交的期望值；取消后保持当前物理姿态，value不假装已完成，状态改interrupted并给出operation。新commandId再次设置相同值会从当前姿态重新趋近；相同commandId只是重放原回执。
- SDK一次求值并完整展开action和参数，构建候选registry/目标通道集合，验证预算、资源和最终状态后再提交。允许spawn后引用该计划新建对象（比如非物理挂件），不允许同计划despawn后重用ID；重复写同一通道或参数+直接绕写其通道都整体拒绝。
- 复合计划返回聚合operation及按commandIndex标记的步骤状态；任一步失败使聚合失败、取消未完成步骤，已完成的物理动作不宣称能回滚。准备阶段失败则完全不发布value、实体或任务。
- 自定义plan不是任意JavaScript的事务沙箱。运行时发现越界写/thenable时暂停该世界、撤销该能力的可用状态并给诊断，要求修复并重置；不将已发生的任意JS副作用伪装为成功回滚。
- action输入目前使用标准JSON Schema的对象/标量子集；数值范围、布尔、枚举或普通有界字符串可直接使用。嵌套复杂输入需要扩展Schema支持并生成对应类型，不能声明后让handler自行猜解。

### 8.1.1 每条命令的写声明与计划内生成

| 内置命令 | 自定义 action 所需 writes |
| --- | --- |
| entity.set-position / set-rotation / set-scale / set-visible | 目标实体对应 position / rotation / scale / visibility |
| actor.move-to / follow / stop / resume-autonomy | 目标实体 locomotion；follow 的被跟随者仅为读取目标 |
| entity.play-action / stop-action | 目标实体 animation |
| entity.apply-impulse | 目标实体 impulse；物理实际积分仍由 physics 拥有，不是额外 position tween |
| entity.attach | child 的 parentage 和 position；parent 是引用目标，校验存在、无环和可挂接条件；保持 child 原 local rotation/scale，应用给定 local position |
| entity.despawn | 目标实体 lifecycle；必须展开真实删除闭包，独立注册后代也需显式 lifecycle 声明，不隐式授权删除其他注册对象 |
| entity.spawn | 对应 prototype 声明 |
| parameter.set | 对应 parameter 声明；其属性写由已经注册的参数映射展开，不要求重复声明 entity，也不允许绕过参数 |

prototype 声明授权本计划创建该原型的实例，并授权**本计划确实新建的实体**后续执行其能力表允许的内置写操作，例如先 spawn 灯笼再 attach 到 hero。它不授权修改执行前已存在的同原型实例或同名实体，也不扩大 live parent / follow target 的写权限。action 的可见描述同时展示这项局部授权及原型实际能力。注册时验证声明里的 live entity / parameter / prototype 已存在；计划内生成的 ID 在一次求值后的候选 registry 中验证，不要求它预先存在。

spawn 初始位置属于创建初始化，不算与随后一次 attach/属性写冲突；后续相同通道的两个写仍拒绝。locomotion 与根 position/rotation 做别名冲突检查；parentage 与进行中的根运动/变换需要统一取消或拒绝，不能让旧任务继续写旧坐标。despawn 与同一实体的其他新任务不组合，删除闭包中受控玩家/受保护对象按真实能力拒绝。物理是否支持某项操作仍按下表判断，writes 只是声明范围，不会凭声明获得新能力。

### 8.2 实际物理写入矩阵

locomotion同时占角色根position与行进朝向，不是与根变换互不相关的一条通道。

| 对象 | 即时位置/旋转 | 持续位置/旋转 | 缩放 |
| --- | --- | --- | --- |
| fixed地形/障碍 | 候选碰撞准备和校验后提交 | 拒绝，提示显式kinematic | 准备新碰撞后提交 |
| kinematic | SDK提交 | SDK统一执行并提供平台运动给角色 | 同步形状；连续缩放需能力表明确支持 |
| dynamic | 显式重定位，清理旧线/角速度 | 拒绝tween，使用已支持的力/冲量 | 只有能力表允许且质量/形状策略明确才提交 |
| character | set-position仅支持即时安全重定位，重置运动历史/取消NPC旧路线；set-rotation不作为通用根命令暴露 | 拒绝通用tween，使用actor.move-to/follow等运动任务 | 依据身体的实际缩放限制验证；默认统一缩放，不推导尾巴包围盒 |

character朝向由运动模式管理，不能通过普通rotation tween和导航抢写。需要独立面向/瞄准的玩法要声明并实现专门actor能力。瞬时重定位的固定tick先提交重定位再处理新输入；玩家按住的移动键可在新位置继续，不复用旧碰撞/速度。

### 8.3 异步作用域与状态

SDK内部所有路径/资产/原型任务自动绑定world epoch、实体generation和相应几何版本。Creator的自定义await工作用一个入口：

```ts
await world.runTask(async scope => {
  const asset = await scope.assets.load('humanoid.g-bot');
  scope.addCharacter({id: 'guide', asset});
});
```

scope带AbortSignal；scope的注册、execute、setState和原型提交都检查起始epoch/身份。reset/dispose会取消scope，过期资源实例释放，不能只取消等待者而仍提交结果。worldRevision在reset后仍单调；旧operation保留终态以供查询，直到世界dispose或明确的有界历史清理。裸Promise闭包仍能写普通JS，SDK不能自动推断其年代；它不在上述保证内，涉及世界状态的异步工作必须使用scope。

StateHandle.value是深只读快照，set会克隆输入；普通游戏数据不随外部对象引用被篡改。私有游戏状态逐tick变化不递增control worldRevision；其快照与simulationTick一致。对状态的异步写通过scope.setState。onUpdate的同步要求还需运行时拒绝thenable，TypeScript的void回调类型本身不足以保证。

### 8.4 相机接管与捕获

`world.cameraMode`明确为authored / follow-pending / follow。`world.useAuthoredCamera()`交还同一Three camera给Creator，保留当前pose，不销毁或另建相机。过场脚本仅在authored模式写相机；该模式默认不消费SDK的方向键/拖动，不假称标准第三人称控制已启用。需要可被输入打断的过场由Creator处理触发并调用setCameraFollow。

`setCameraFollow`重新接管时从当前pose过渡，清理旧阻尼速度；reset恢复初始模式、FOV/投影及初始跟随配置。Host静态首帧捕获可以重置独立验收会话；对实时会话的临时三视图捕获必须保存/恢复完整相机和暂停状态，不能重置用户世界或增加第二个持续写镜头循环。

### 8.5 资源和观测细节

同一个AssetInstance不能注册为两个live角色，第二次需load/实例化获得独立实例。prototype准备会快照模板而不窃取源对象；作者自由资源仍由作者生命周期释放，SDK管理的资产/模板共享资源由引用计数管理。通用attach首版只支持非物理子树，抓取刚体/骑乘是独立能力，不能暗中删除碰撞。

`getEntityState(id)`提供实际速度、支撑、碰撞对象、语义运动状态和动画时间，方便自制角色做视觉表现而不用访问物理句柄。snapshot.camera提供期望与实际位置/臂长、阻挡对象和期望朝向。describe是面向控制的裁剪信息；调试与验收可以读完整快照，但不把大段底层遥测强塞给快模型。action/prototype/command不可用时都有结构化原因。

Schema在注册时检查：required中的键必须存在，初始值满足类型/边界，范围不能矛盾，writes引用真实目标。参数期望值与实际姿态、局部可见性与有效可见性分别呈现；显示隐藏父节点中的孩子应返回前置条件而不是假称对象已显现。

## 9. 错误与 Creator 工具

错误分为 invalid-input、unsupported-capability、content、runtime、stale-context：字段错误可就地改；未支持能力换已验证方式或进入能力扩展；内容错误修场景；SDK runtime 问题回到固定试验场；过期上下文重新查询，不盲重试 spawn。

诊断至少含 code、entityIds、阶段、原始原因和建议动作。比如 NO_PATH 指明目标/断开的区域；ANIMATION_UNAVAILABLE 列实际 actionIds；CHANNEL_OWNED_BY_PARAMETER 指向控制该通道的参数；SDK 内部错误不能重新包装成泛化 MODULE_BUILD_FAILED。

Creator 默认只收到一页入口和当前任务相关示例；完整实现规范留给 SDK 维护者。discover 按主题返回相应声明/可执行例子，describe 按实体与意图裁剪实际 Schema，不把全部能力和限制塞入每次 prompt。生成的 Schema、文档与导出接口必须同源并带版本，避免工具宣称存在但包中没有。

Creator 工具保留四类心智模型：discover（环境/Schema/示例/资产）、check（编译/结构/能力）、observe（预览/inspect/完整三视图）、exercise（短测/长测/提交）。不增加一堆让模型反复交文件的前置阶段。短测检测到停止立即返回，不空等180秒；几何/首帧内容未改时，episode编辑不重编世界。

## 10. 如何检验“Agent 容易用”

不凭设计者自评宣布易用。先执行下列设计级检查，实施后再执行真实 Creator 评测：

1. 仅给公开 .d.ts 和本页，不给 SDK 实现源码，请另一 Agent 完成六个任务：资产角色/首帧、标准镜头、门参数和交互、原型生成/附件、NPC任务状态、能力缺失处理。
2. 保存第一遍代码与错误，再做 TypeScript 检查；不使用 any、ts-ignore 或私有导入，不用 mock Runtime 的通过冒充功能实现。
3. 记录要查几处、是否猜名字/坐标/默认行为、是否需要底层物理/Mixer、是否出现两个状态来源。公开合同或示例不足就修改合同，再审，而不是在 prompt 追加长补丁。
4. 六任务基础路径应不需要导入 Rapier/Recast/Mixer/弹簧臂实现；素材无需手抄hash和修骨架；命令无需手算来源/优先级；相同参数可被交互与文本控制复用。
5. 这些只证明接口可理解、类型一致；不能证明 SDK 已实现或真实模型稳定用对。完成 SDK后，固定模型/原图/prompt/预算做独立 case 评测，记录首次构建率、诊断后修复次数、工具时间、内容完整性及基础操作问题。

## 11. 按依赖实施，不立即重开修改

| ID | 目标/交付 | depends_on | blocks | 独占所有权 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- | --- |
| D0 | 当前职责/标准/公开API设计 | 用户对齐；旧行为证据 | D1–D8 | Root：本spec、public-api.d.ts、设计例子 | 类型检查、六任务独立试用、authority review | main-agent-only |
| D1 | 世界实体/状态/命令事务与generation | D0 | D3–D7 | Root或指定唯一owner：contracts/world/state/control | 幂等、冲突、批提交、reset晚回调 | sequential |
| D2 | 输入与运动/角色碰撞适配 | D0 | D5,D7 | physics owner：physics/input的指定文件；不与Root重叠 | 原移动基线+相向/追赶/墙边真实轨迹 | parallel-safe |
| D3 | 相机rig和弹簧臂 | D0,D2 probe合同 | D7 | camera owner：camera模块；Root接线 | sphere probe、安全界限、恢复曲线和真浏览器 | parallel-safe |
| D4 | 资产与语义动作绑定 | D0,D1 | D7 | assets owner：assets/animation/bindings | 普通jump连续、一次动作归还、克隆和初始姿态 | parallel-safe |
| D5 | NPC任务与自主行为接管 | D1,D2 | D7 | navigation owner：navigation/task adapter | 到达/失败/取消/stop与resume；无瞬移 | sequential |
| D6 | Agent facade、Schema和工具同步 | D1,D3,D4,D5 | D7,D8 | tools owner：公开指南/examples/Creator tools；Root审API | 同源Schema+可执行例子+具体诊断 | sequential |
| D7 | 固定试验场、产品基线与集成 | D1–D6 | D8 | Root：集成、census、验收记录和试玩入口 | 分层自动/浏览器/视觉/手感验收 | main-agent-only |
| D8 | 新云端包和案例对照 | D7 | 交付 | cloud owner；Root独立质量评测/发布 | 变更感知环境复验、真实模型case、完整交付 | sequential |

D0 是本轮工作范围。内部模块文件归属在实施派发时逐个确认；D2 的 input 若仍由Root修改则physics owner只处理physics，不能同时写。当前未完成的碰撞草稿和接口实验不能直接作为D7通过。优先迁移旧版已经验证的产品行为，再实现同样标准的 Three 适配；不把旧版创作约束一起搬回。
