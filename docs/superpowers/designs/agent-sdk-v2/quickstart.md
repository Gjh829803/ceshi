# Creator 一页入口（v2 设计稿，尚未实现）

用普通 Three.js 创建场景、模型和相机。SDK 负责角色运动、碰撞、动画、镜头、命令和重置。
只导入 `three` 和 `createWorld`；不需要配置物理引擎、Mixer 或弹簧臂内部参数。

```ts
const world = await createWorld({scene, camera, canvas});
world.addEntity({id:'ground', object:groundMesh, role:'terrain'});
const hero = await world.assets.load('humanoid.g-bot');
world.addCharacter({id:'hero', asset:hero});
world.setControlledEntity('hero');
world.setCameraFollow({distanceMeters:5});
world.setCaptureTargets(['hero','tower']);
await world.start();
```

这里 scene/camera/groundMesh/tower 都是你创建的 Three 对象；tower需提前注册。
相机按参考图摆放，首帧不被 SDK 改写；第一次移动/转镜头才进入跟随。
默认 WASD 移动、方向键/拖动转镜头、Shift 跑、Space 跳、E 交互、R 重置。

| 你要做什么 | 用什么 |
| --- | --- |
| 建地形、建筑、道具 | 自由写 Three；`addEntity` 的 role 是 terrain / obstacle / decoration |
| 用已有角色 | `assets.load(id)` 后 `addCharacter({id,asset})`；默认姿态/身体/动作由已验证资产绑定提供 |
| 自己做狐狸 | 普通 Group；`addCharacter({id,object:fox,body:{heightMeters:1.2,radiusMeters:.35}})`；尾巴仍是视觉子节点 |
| 把镜头交给过场 | `useAuthoredCamera()`；回到游玩用 `setCameraFollow()` |
| 让 NPC 去某处 | `execute({type:'actor.move-to',entityId:'guide',targetPositionWorldMetersXYZ:[...]})` |
| 看能操作什么 | `describe({entityIds:['guide']})` 返回当前能力、参数 Schema 与不可用原因 |
| 等 NPC 到达或变换完成 | `await operations.wait(operationId)`；失败/取消有明确终态，无需自己轮询 |
| 改大小或显隐 | `execute` 的 entity.set-scale / entity.set-visible；不要每帧直接写受管理根 |
| 动画尾巴、草、材质 | `onUpdate` 中正常 Three 操作纯视觉子节点；角色独立 body 的尾巴可自由动，地形碰撞子树不能当作装饰改动 |
| 新物体可随时生成 | `await registerPrototype(...)` 先准备模板，再发 entity.spawn |
| 可被文本控制的机关 | `defineParameter` 或 `registerAction`，返回 SDK 命令计划；交互也调用同一入口 |
| await 后修改世界 | `runTask(async scope => {...})`，在 scope 中加载/注册/提交，reset 自动作废旧任务 |

简单可控机关只有一份状态：

```ts
const open = world.defineParameter({
 id:'gate.open', description:'打开北门', schema:{type:'boolean'}, initialValue:false,
 writes:[{kind:'entity',entityId:'gate',channels:['rotation']}],
 plan:value=>[{type:'entity.set-rotation',entityId:'gate',
   rotationLocalRadiansXYZ:[0,value?Math.PI/2:0,0],durationSeconds:.35}]
});
world.onInteract('gate',()=>({type:'parameter.set',parameterId:open.id,value:!open.value}));
```

gate 是你构造的铰链 Group，注册为 kinematic 障碍。文本控制发相同 parameter.set。
参数 `value` 是期望值，`status` 表明是否仍在变化/被中断；实际姿态可从 getEntityState 读取。

命令回执：applied=已提交；accepted+operationId=任务已受理，尚未完成；rejected=未提交并附原因。
NPC stop会暂停巡逻，resume-autonomy才恢复；单次动作结束会回到正常动作。
set-visible只控制画面显示；让物体真正消失用despawn，同步移除碰撞和任务。
位置用 World 坐标，附件用 Local 偏移；变量名称已写清单位和坐标域。

[完整可类型检查例子](examples.ts) · [按需查阅的类型声明](public-api.d.ts) · [SDK实现者职责/标准](../../specs/2026-09-05-agent-sdk-contract-v2.md)
