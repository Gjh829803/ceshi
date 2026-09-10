# 轮式载具制动漂移

适用于未配置 `wheelPhysics`、且 `VehicleSpec.mode` 为 `wheeled` 或 `motorcycle` 的载具。
设置 `brakeDrift: true` 启用。当前 Playground 的物理车辆使用逐轮轮胎力模型，
保留该模型的手刹受力与既有操控参数，不启用此街机漂移路径。
船、滑板、飞行器和坐骑不使用这套模型。

## 设计与执行归属

这是街机式侧滑模型，不是独立前后轮的轮胎受力模拟。SDK 保留世界空间速度，
转动车头后计算速度在新车身横轴上的分量，以抓地力逐步消除它。
制动转弯降低这一消除速度，车头方向与移动方向就会暂时分离。
没有额外旋转视觉车身、移动根节点或第二个物理/动画时钟。

输入、Creator 自检和 Episode 录制共用这套 SDK 运动逻辑。
目前不模拟轮胎温度、路面摩擦分区、前后轴载荷或打滑烟尘；质量与轮胎数量
也不是此模型的独立参数。实际碰撞仍可改变或截断侧滑。

## 触发与恢复

- 采用沿车头方向的有符号速度。低于 2.5 m/s（9 km/h）不产生新增漂移效果；
  2.5–6 m/s 线性增强，6 m/s（约 22 km/h）及以上达到最大强度。倒车不触发。
- 经过平滑处理的实际转向量绝对值大于 0.12，并且行进制动或手刹激活时启动。
  默认 S 对应 `forward: -1`；仅前进速度大于 1 m/s 时表示制动，再低则进入倒车。
  默认 Space 对应 `brake: true`。按键可重绑定，模拟只消费输入合同。
- 松开制动后，已有横向速度仍参与恢复。侧向/纵向速度比超过 0.2 时，继续
  适度降低抓地力；侧滑消退或车速降低后恢复正常抓地。没有独立的漂移计时器。
- 不检测按键“手速”。按下时机、持续时间和方向反打会通过转向响应及实际速度
  影响结果。持续按 S 最终会停车并倒车，并非无限漂移。

当前内部常量：完整触发时，S 制动侧向抓地力为正常值的 4%，Space 为 2%；
车头转向倍率最高为 1.35。松开后，侧滑比例提供的横向抓地恢复权重最高为 0.9，
转向与制动的恢复权重仍为 0.85，两者分别计算以避免延长侧滑时增强转向。
完整漂移时，S 制动减速度和 Space 阻尼降至配置值的 70%，以保留滑动惯性；
普通直线制动不变。这是一档便于体验明显侧滑的强化调校。
这些值与速度阈值目前不属于可导出的操控参数。
`brakeDrift` 缺省或为 false 时沿用原有控制器；轮式汽车原先的基础手刹行为仍保留。

## 车型配置

```ts
import type { humanoid } from "@worldkit/three";

const driftTuning = {
  brakeDrift: true,
  grip: 10,
  steer: 0.65,
  steeringResponse: 7,
  steeringReturn: 12,
  brakeDeceleration: 6,
  brakeDamping: 0.5,
  coastDeceleration: 1.8,
} satisfies Partial<humanoid.VehicleSpec>;
// 将 ...driftTuning 放入传给 SDK 的完整 VehicleSpec 中。
```

| 参数 | 单位与作用 |
| --- | --- |
| `brakeDrift` | VehicleSpec 开关，只启用对应车型的新增模型 |
| `grip` | 1/s，横向速度衰减率；越低越滑，恢复更慢 |
| `steer` | 转向倍率；越高车头转动越快，也可能掩盖侧滑感 |
| `steeringResponse` | 1/s，按住方向时接近目标转向量的速度 |
| `steeringReturn` | 1/s，松开方向后的回正速度 |
| `brakeDeceleration` | m/s²，S 行进制动的减速度 |
| `brakeDamping` | 1/s，Space 手刹的指数减速阻尼 |
| `coastDeceleration` | m/s²，松油门时的减速度；不踩油门拉手刹时也会叠加 |
| `speed` / `maxSpeed` / `accel` | m/s、m/s、m/s²，影响是否能达到和维持漂移速度 |

上面是自建摩托/卡丁车的起始调参示例，不是每辆车的统一值。
车辆包围盒、地面支持、坡度与障碍物也会影响实际运动结果。

`brakeDrift` 放在 VehicleSpec 中；其他数值属于 MovementSettings，可通过
`world.humanoid.applyProfile({vehicles: {[instanceId]: numericTuning}})` 修改。
不要把 `brakeDrift` 填进数值 profile。生成交付应保存开关和数值配置到源码，
只在浏览器本地保存调试参数不会改变交付内容。旧工作区运行时需要先更新并重建 SDK。

## 调参顺序与验收

1. 在宽阔平地固定起始速度，先将普通转向调到容易控制，再调漂移。
2. 车头转得太突然时降低 `steer`、`steeringResponse`。松手回得太快时降低
   `steeringReturn`，但注意过低会使转向残留。
3. 尚未滑起来就停车，先降低相应制动力或阻尼。车头与运动方向仍过于一致，
   再适度降低 `grip`。超跑与卡丁车应分别验证。
4. 用同一车型比较：直线刹车、低速转向、高速 S 带方向、高速 Space 带方向、
   松开后恢复，以及倒车。确认有侧向速度、仍保留速度、能恢复且不穿过碰撞体。
5. 切换车型和 reset 后核对参数仍归属正确实例；Creator/Episode 使用同一
   配置与输入。截图只能辅助检查姿态，不能单独证明漂移物理正确。

## Agent 发现入口

- `creator_get_authoring_schema({topic: 'humanoid', sections: ['guide', 'humanoid']})`：
  获取启用方法、单位和当前 SDK 的 VehicleSpec/MovementSettings 合同。
- `creator_get_examples({topic: 'custom-vehicle'})`：获取可编译的自绘摩托示例，
  使用 `wheelPhysics` 逐轮模型，不启用本文的 `brakeDrift`。`preset-assets`
  提供 Playground 现有轮式载具的配置；Creator 默认资源策略不允许加载这些载具模型。
- 工作区自带 SDK 时，以 Creator 返回的工作区合同为准；Host 新文档不代表旧运行时
  已经具备该能力。部署云端 Host 或更新已有工作区运行时是单独的发布操作。

实现：[侧滑积分](../packages/three-world/src/humanoid-runtime/simulation.ts)、
[配置合同](../packages/three-world/src/humanoid-runtime/config.ts)、
[车型参数](../shared/preset-content/config.ts)、
[完整摩托示例](../examples/three-creator/custom-vehicle/main.ts)。
