# 原生飞龙与预设人物

通过 `creator_get_examples({topic:'flying-creature'})` 取得完整示例。
默认资产为 `humanoid.source-101` 与 `creature.dragon.d01`。选择其他原生飞龙时，
同时修改 `main.ts` 的 `assetId` 和 `project.json` 中对应 ID：
`creature.dragon.d02` 至 `creature.dragon.d11`。

`assets_describe` 的 `vehicle.spec` 提供该变体的飞行、座位、碰撞与地面配置，
`integrationMetadata.visual` 指定模型资源、火焰资源和动画前缀。示例从本项目
`asset-definitions.json` 解析逻辑资源路径到已声明的 URI，不借用 Playground URL
或另行创建资源加载器。`creature.dragon` 是另一份 WYVERN 资源，不能代替这些
原生变体。

人物从真实地面起步，飞龙从空中开始。H 召唤并等待实际落地，走到鞍側后 F 登乘；
等待过渡完成后 Space 起飞，WASD 飞行，E 喷火，
F 请求着陆，落稳后再次 F 下龙。离龙后 H 可召唤原实例。当前输入绑定可从 SDK
读取。`world.humanoid.inspectBoarding('training-dragon','person')` 提供登乘点、
资格与拒绝原因；snapshot 的 transition 和 vehicleDynamics 中 groundPhase、
summon 描述执行结果。接受指令不代表动作已经完成。

SDK 持有唯一时钟、Rapier 世界、人物控制器、飞龙 mixer、粒子和相机。环境只用
普通 Three 绘制，同时用 map 声明碰撞。身体核心球组覆盖躯干、颈部与头部，翼尾
末端不保证完整碰撞；地面步行、伤害和音效没有在此示例中实现。

`episode.json` 先 H 召唤等待 25 秒，再用 W/D 接近默认 D01 的鞍侧，随后以约 15 秒
真实键盘输入尝试登乘、起飞、转向、喷火和着陆请求。接近步长只对应本示例的
地图、人物默认速度和 D01 标定，不能作为任意变体/场景的寻路。
Creator 应读取实际状态确认结果，再按请求扩充输入；Episode 使用同一交付的 SDK
与资产独立执行。切换变体后必须用该变体实际上下龙时长重新验证输入计划。

模型贴图默认不解码，保留材质基础因子和顶点颜色，GLB 原文件不变。
如果需要在浏览器加载原生模型贴图，在 `visual.load` 的参数中加入
`loadTextures:true`；人物需要在 `createHumanoidWorld` 参数中另外设置
`characterLoadOptions:{loadTextures:true}`。两者是独立选择。
火焰图集是显式效果贴图，仍按 `flameTextureUrl` 加载，不受模型贴图选项控制。
开启模型贴图而缺少图像解码 API 时返回 `MODEL_TEXTURE_DECODER_UNAVAILABLE`；
默认关闭模型贴图不代表完整飞龙 visual 与其火焰效果可以在 Node 中运行。
