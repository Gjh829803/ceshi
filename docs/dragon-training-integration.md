# 原生飞龙训练场

顶部“飞龙 · 空中训练场”现在调用当前 Three Session 的地图切换。直接入口为 `/?map=flying-creature-training`；旧 `/dragon-training.html` 书签转到该入口。没有 iframe，也不再启动 Babylon/Havok。

## 运行与构建

`pnpm dev:editor` 启动开发站点；`pnpm build:editor` 生成 `.codex-tmp/react-playground-dist`，部署整个目录即可。源码、模型、动画和贴图均在本仓库，修改或构建不需要另一份工作区或 5186 服务。

`assets/dragon-training/__creature-assets` 保留 D01 龙、H01 原始骑手、动画装配清单和火焰图集。当前场景使用项目原有 Source101 角色作为真实骑手，并保持其身份，切换飞机或人物时不替换成装饰骑手。H01 文件保留为动作适配参考，当前未将其完整骨架动作重定向到 Source101。资源来源仍是既有 Century D01/H01 本地提取，不改变资源权属。

`pnpm prepare:dragon-training` 只重新计算上述四个资源的大小与 SHA-256。开发服务及构建验证清单并仅发布这些资源；运动代码直接编译自 Three SDK。旧 Babylon 发布包可从备份分支 `codex/dragon-before-native-20260910` 查阅。

## 执行结构

- `packages/three-world/src/humanoid-runtime/motion-families/flying-creature/state.ts`：独立飞行、体力、喷火、闪避和碰撞恢复状态。
- `flight.ts`：输入到飞行请求，松键与 Ctrl 刹停后保持零速悬停。
- `controller.ts` / `collision-probes.ts`：现有 Rapier 世界中的完整姿态与位移扫掠；以真实蒙皮、翼拍、尾部和混合动作标定球组。
- `visual.ts` / `flame.ts`：GLTFLoader、Three 动画混合、仅颌骨叠加喷火、固定步粒子历史、真实座位和缰绳。
- `HumanoidRuntime`：唯一固定步、呈现插值、角色座位与相机生命周期。第一视角由现有 FollowCamera 读取稳定骑乘观察点，T 沿用三视角切换。
- `shared/preset-content/environment/dragon-training.ts`：地图几何、障碍与人物/飞机准备区；与飞机共用同一个物理世界。

这些飞行公式是本项目依据已有资产与行为分析重建的实现，不是恢复出的 Century C++ 源码。当前碰撞是保守球组的运动学扫掠，不等同于原游戏的完整碰撞组件或动力学布料。

## 控制与配置

W/S 俯冲/抬头，A/D 左右转向，Shift 加速，Ctrl（现有 crouch 绑定也支持 C）刹停，松开 WASD 自动减速悬停，Space 滑翔，E 持续喷火，Q 闪避，T 切换视角，鼠标继续观察镜头。

`humanoid.createFlyingCreatureSpec(id)` 创建可复用飞行配置；将实例交给 `createWorld({humanoid:{vehicles:...}})`，并将已加载的 `humanoid.FlyingCreatureVisual` 绑定到该实例的 `flyingVisual`。运行时负责采样与释放，场景不要再自行推进 mixer、粒子或相机。

巡航速度、加速速度、普通加速度、松键减速度、刹停减速度、低速偏航、俯仰响应和侧倾响应使用公共运动配置，是这些参数的唯一运行入口。`spec.flyingCreature` 的额外标定用于俯冲/爬升、体力推进、速度硬限、姿态极限、高速转向和碰撞恢复。飞鸟可以复用飞行状态计算，但必须重新标定模型、动画、座位及碰撞体，不能直接套用 D01 的体积。

未提供 `flyingCreature` 配置的旧程序化飞龙保持已有控制语义，保护其他消费者；当前 Playground 中的飞龙已启用原生系统。Creator/Episode 可通过同一 SDK 接入，现有资产目录中的旧飞龙预设没有被静默替换。

## 已接入与后续边界

训练场默认已经骑在龙上，可在地图菜单切换至飞机或人物场地。当前保留悬停飞行方案，没有地面步行、降落/起飞动作、自然上下龙过渡、完整 H01 动作重定向、伤害结算和音效；不能将这些列为完成的能力。第一视角是本项目的适配设计。

## 验证

`pnpm verify:dragon-training <URL> <证据目录>` 提供真实键盘与地图菜单冒烟测试。核心测试为 `flying-creature.test.ts` 和 `flying-creature-visual.test.ts`，覆盖零速悬停、转向、薄墙、自己/其他碰撞代理、公共 SDK 动作与相机、地图复位、实际蒙皮的代表性混合动作、嘴部隔离、粒子暂停与重采样。蒙皮测试是离散取样回归，不是所有动画时刻的数学证明。
