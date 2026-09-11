# 原生飞龙训练场

Playground 顶部选择“飞龙 · 空中训练场”，或打开
`/#/scenes/flying-creature-training`。该地图与人物、飞机、NPC 和太空训练共用
同一个 Three SDK 会话，通过主页面 hash 路由切换。

## 资源与绑定

[资源清单](../assets/dragon-training/bundle.json)包含 17 个文件，逐项记录字节数
与 SHA-256。D01 使用 `dragon.glb`，D02–D11 分别使用同名 GLB；其余文件为
H01 参考骑手、火焰图集及四份 JSON。模型和动作来自已有 Century 本地提取；
[manifest.json](../assets/dragon-training/__creature-assets/manifest.json)记录 D01/H01
装配信息，[variant-sources.json](../assets/dragon-training/__creature-assets/variant-sources.json)
记录其他变体的源模型、材质、动作与重定向参数，
[ground-sources.json](../assets/dragon-training/__creature-assets/ground-sources.json)
记录地面动作来源。

[variants.json](../assets/dragon-training/__creature-assets/variants.json)是各变体的
模型文件、镜头距离、鞍座、空中/地面球组与支撑范围的标定源。Playground 通过
[dragon-variants.ts](../shared/preset-content/dragon-variants.ts)读取它，并把配置
交给 SDK；不得只换模型而沿用另一变体的碰撞与座位尺寸。顶部飞龙选择器会以
`?dragon=D02#/scenes/flying-creature-training` 形式重新载入所选变体。未骑乘人物
的位置在通过 SDK 起点检查后保留。

真实骑手始终是当前 `humanoid.source-101` 人物，绑定既有 Source101 骨架与动作。
原始 UEFN 外形资源包含黑色关节贴图；模型贴图默认不解码，因此人物可呈纯白，
原始 GLB 字节与资源身份保持不变。H01 GLB 用于适配参考，没有替换真实角色，也未
完成其整套骨骼动作到 Source101 的重定向。

Creator 可通过 `assets_search` 查找 D01–D11，再用 `assets_describe` 读取
`creature.dragon.d01` 至 `creature.dragon.d11`。每个资产的 `vehicle.spec` 包含自身
标定，`integrationMetadata.visual` 指定 `animationPrefix`、`modelResource` 与
`flameResource`。资源按逻辑 `path` 在该资产的 `resources` 中解析为实际 URI。
`requiredAssetIds` 明确该变体与 `humanoid.source-101` 的依赖。

`creator_get_examples({topic:'flying-creature'})` 返回
[完整示例](../examples/three-creator/flying-creature/README.md)。它默认声明 D01 与
Source101，从 `asset-definitions.json` 读取上述字段，将加载后的
`FlyingCreatureVisual.root`、`flyingVisual` 和复制的 spec 一起交给
`createHumanoidWorld`。切换变体时同时改选中的 asset ID 与 `project.json`；
不手写资源 URL，也不复用另一变体的碰撞标定。示例飞龙从空中开始，人物通过真实
召唤、接近和登乘输入进入骑乘流程；附带输入计划只对应默认 D01 场地，执行结果
仍从当前状态确认。

目录中的 [`creature.dragon`](../assets/three-creator/catalog/creature.dragon.json)
是另一份 WYVERN 资源，路径为 `presets/creatures/dragon.glb`。它与这些原生变体是
不同资产；查到该 ID 不代表加载了原生飞行、召唤、上下龙或喷火能力。

## 模型贴图

模型加载默认 `loadTextures:false`，跳过模型图像解码，保留材质基础因子和顶点
颜色。马、原生飞龙、通用资产与完整人物使用同一模型加载规则。浏览器需要贴图
时在首次加载显式开启：`world.assets.load(id,{loadTextures:true})`、
`createHumanoidWorld({...,characterLoadOptions:{loadTextures:true}})`、
`HumanoidCharacter.load(url,{loadTextures:true})`、
`HorseVisual.load(resolve,{loadTextures:true})` 或
`FlyingCreatureVisual.load({...resources,loadTextures:true})`。

飞龙的 `flameTextureUrl` 是显式火焰效果图集，继续按原有效果契约加载，不随模型
贴图选项关闭。缺少图像解码 API 时开启模型贴图会返回
`MODEL_TEXTURE_DECODER_UNAVAILABLE`；关闭模型贴图不代表完整飞龙 visual、火焰
或浏览器呈现功能支持 Node。此选项不修改任何模型二进制。

## 实际流程与控制

训练场以地面人物开始。站稳在干燥地面后按 **H** 召唤场内已有飞龙；SDK 规划
飞行路线并检查附近降落空间，不移动人物、不创建另一条龙。飞龙落稳后，到鞍座
侧面按 **F** 登乘。登乘和下龙沿经过净空检查的路径执行，途中被占用则等待。

| 状态 | 输入与结果 |
| --- | --- |
| 地面骑乘 | Space 检查头顶空间并起飞；F 检查下龙路径与站立落点 |
| 空中 | W/S 俯冲/抬头，A/D 转向，Shift 加速，Ctrl 刹停，松开 WASD 减速悬停 |
| 空中动作 | Space 滑翔，E 持续喷火，Q 闪避，F 请求着陆 |
| 接近/着陆 | F 取消接近或转入起飞；落稳后再次 F 才下龙 |
| 镜头 | T 切换第三、第一与越肩视角；鼠标环绕，各视角可抬头观察天空 |

按键可通过既有 controls 绑定修改；上表是默认值。读取
`world.humanoid.snapshot().vehicleDynamics[].flyingCreature` 获取
`groundPhase`、`groundFailure` 和 `summon` 的实际状态。
`summon.phase` 为 `flying`、`landing`、`arrived` 或 `blocked`；请求被接受不等于
已经落地。`world.humanoid.inspectBoarding(instanceId, actorId)` 提供当前人物的
接近点、资格与原因。多人物的骑乘与过渡归各自 `HumanoidActor`，切换控制目标
不转移已经接受的上下龙过程。

## 执行与碰撞边界

`humanoid.createFlyingCreatureSpec(id)` 创建飞行配置，
`humanoid.FlyingCreatureVisual.load({dragonUrl, animationPrefix, flameTextureUrl})`
加载原生模型与动作。将 spec、可见 root 和该 visual 作为同一个 vehicle instance
交给 `createWorld({humanoid:{vehicles: ...}})`；SDK 负责固定步、人物控制器、
动画、碰撞、座位、呈现插值和相机。场景与 UI 只提交输入/命令，不另外推进
mixer、粒子或相机循环。

`motion-families/flying-creature` 中，`flight.ts`/`controller.ts` 执行飞行，
`ground.ts` 检查起降支撑与空间，`summon.ts` 规划召唤路线，`mount.ts` 检查并
采样上下龙路径，`visual.ts`/`flame.ts` 展示模型、缰绳、接触与火焰。
配置使用米、秒与弧度。地面支撑范围用于拒绝狭窄平台、陡坡和水面。

空中与地面的碰撞球组重点覆盖躯干、颈部和头部，并按地面混合比例过渡。
翼尖、尾尖等末端不保证完整碰撞，可能擦过或穿过障碍；该实现不是逐三角形蒙皮
碰撞，也不提供原游戏的动力学布料。地面视觉采用已加载的 Ground_Idle 与飞行
姿态混合；D02 文件还含 Landing/Takeoff 片段，但当前 visual 不单独播放它们。
地面步行、完整 H01 动作重定向、伤害结算和音效不属于已实现能力。

这些飞行与交互公式是本项目依据资产和行为重建的实现，不是恢复出的 Century
C++ 源码。Creator/Episode 消费同一 SDK 能力时仍需提供对应资产与标定条件。

## 构建与验证

```sh
pnpm dev:editor
pnpm prepare:dragon-training
pnpm build:editor
pnpm verify:dragon-training http://127.0.0.1:5178 .codex-tmp/dragon-native-smoke
```

`prepare:dragon-training` 重新计算上述 17 个文件的身份，不生成模型或更改动作。
开发插件与生产构建验证相同清单，产物位于 `.codex-tmp/react-playground-dist`。

[浏览器 smoke](../apps/three-playground/scripts/dragon-training-smoke.ts)使用真实
键盘验证地面开始、召唤、接近、登乘、起飞、飞行与喷火，并检查变体加载、地图
切换、重载和历史路由。失败时保存实际状态、间隔采样的接近过程与截图。
运行时测试覆盖飞行、碰撞、起降与人物过渡；visual 测试覆盖动作采样、座位、
喷火与呈现生命周期。离散蒙皮取样不是全部动作时刻的数学证明；测试通过、
真实浏览器完成和人工视觉验收分别报告。
