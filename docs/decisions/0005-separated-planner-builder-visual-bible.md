# ADR-0005：分离 Planner、Builder 与 Visual Bible Agent

- 状态：Accepted
- 日期：2026-08-15

## 决策

世界创作采用三个职责隔离的 Agent 阶段：

1. World Planner 只定义完整 WorldSpec、WorldPrompt、Entity Catalog、World Plan 和 Opening Shot。
2. World Builder 只把已冻结规划实现为可玩的确定性白膜，并接受测试和 SDK 派生工件验收。
3. Visual Bible Agent 只根据已验证白膜和世界提示生成样式三视图与渲染首帧。

Planner 的源码和两张规划图通过 `plan-lock.json` 冻结。Builder 与 Visual Bible 不得修改这些输入；无法满足时提交结构化变更请求。

## 原因

- 规划期需要发散，搭建期需要收敛；把两者放在同一次自由修改中会让 Agent 为了方便实现而悄悄改变设计。
- 每个主体、客体和标志物必须同时拥有结构身份与视觉身份，Entity Catalog 是二者之间的明确接口。
- 样式生成不应改变碰撞、空间关系或玩法，因此只能在真实白膜通过验收之后发生。
- 独立阶段和哈希工件让失败可以归因于规划、实现或视觉，而不是一个不可解释的混合结果。

## 结果

- `agent:plan`、`agent:build`、`agent:visual` 是正式入口；`agent:scene` 仅串联前两阶段。
- WorldSpec 新增 WorldPrompt 与 Entity Catalog，并要求 Prototype 唯一实例色和固定 Front/Right/Back 路径。
- Builder 运行前后都验证冻结锁，验证场景清单记录所依据的锁与图片哈希。
- Playground 从运行时白膜捕获三视图，Visual Bible 输入和最终输出分别由自动门禁校验。
- 修改冻结计划必须显式开始新修订，不能由下游 Agent 就地覆盖。

## 不采用的方案

- 一个 Agent 从提示词一直做到最终样式：阶段边界不可追踪，规划容易被实现反向篡改。
- 规划期先生成所有样式三视图：白膜轮廓尚未验证，容易让美术图反过来掩盖空间错误。
- 先自由搭建、再从结果反写规划：无法区分用户要求与 Agent 偶然实现，也不适合稳定复现。
