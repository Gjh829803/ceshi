# ADR-0001：向 Agent 暴露主体套餐

- 状态：已接受
- 阶段：方案设计

## 背景

人走路、骑马和开车并不只对应一个 Locomotion。完整体验由输入映射、运动控制、物理、动作、镜头和控制权共同组成。

如果 Coding Agent 每次都分别配置这些模块，它会反复实现底层细节，容易产生镜头、碰撞、动作和输入不一致。

## 决策

向 Coding Agent 暴露经过验证的 `SubjectKit` / `PlayablePreset`：

```ts
world.createPlayer({
  preset: "humanoid.third_person",
  handling: "standard",
  position: [0, 1, 0],
  appearance: {
    prompt: "a silver robot",
  },
});
```

每个套餐内部绑定：

- 白膜模型
- 碰撞体和刚体
- 输入映射
- Motion Controller
- 默认镜头
- 动作绑定
- 控制权规则
- 语义与世界模型输出

## 内部约束

套餐只属于 Agent-facing API。SDK 内部仍保持模块解耦：

- 镜头不直接修改刚体。
- Input Mapping 只产生运动意图。
- Motion Controller 解释意图。
- Physics 决定实际运动结果。
- Action 根据运动状态驱动动画和语义输出。
- Camera 跟随结果，并可参与输入方向的解释。

## 原因

- 显著减少 Agent 需要编写的代码。
- 运动手感和镜头由 SDK 统一调优。
- 每个套餐可以独立测试和版本化。
- 玩家、NPC 和脚本可以复用同一主体能力。
- 仍然允许 SDK 团队独立替换物理或相机实现。

## 代价

- 套餐组合数量可能增长。
- 特殊游戏可能需要高级扩展入口。
- 套餐升级需要考虑旧世界兼容性。

解决方式是保持首批套餐数量很少，并对套餐进行版本化；底层 escape hatch 不进入 Agent 默认文档。
