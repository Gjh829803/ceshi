# ADR-0003：Coding Agent、Runtime Director 与 World Model 的边界

- 状态：已接受
- 日期：2026-08-15

## 背景

系统同时包含创作期 Coding Agent、运行期 Director LLM、确定性 World SDK 和实时世界模型。如果不明确边界，容易出现三种错误：把 Director 当作逐帧游戏控制器、让世界模型改变逻辑状态，或让两个 Agent 绕过 SDK 各自操作 Three.js/Rapier。

## 决策

1. Coding Agent 只在创作期编写可版本化的场景代码，并通过创作 SDK/Compiler 构建世界。
2. Runtime World Director 由两部分组成：SDK 外部的 Director LLM，以及 SDK 内部的 Observation/Control/Task/Receipt 模块。
3. 两类 Agent 都不能直接操作底层 Three.js、Rapier、动画 mixer 或导航内部对象。
4. 白膜 World Runtime 是位置、数量、碰撞、导航、动作、相机和玩法结果的唯一世界真相。
5. 实时世界模型只消费 Render Bridge 条件并生成视觉画面，不反向决定逻辑状态。
6. 逻辑变化走 `World Command`；纯视觉变化走 SDK 记录的 `Render Directive`。

## 结果

- Coding Agent 可以自由创作，同时保持 Feature 可追踪、可重建。
- Director LLM 可以在运行时编排世界，但所有修改仍可授权、验证、回执和重放。
- 世界模型团队拥有明确的输入契约，不需要承担物理和玩法一致性。
- 当前没有实现的模块必须在文档中标记为目标或计划，不得用目标 API 暗示已交付。
