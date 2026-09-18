# 文档索引

| 目的 | 入口 |
| --- | --- |
| 理解包职责、依赖和开发/生产指令边界 | [Workspace 包](workspace-packages.md) |
| 快速理解轻量 SDK 的背景与设计取舍 | [设计背景与取舍](three-sdk-architecture.md#设计背景与取舍) |
| 判断生产门禁与 Agent 反馈的边界 | [Harness 反馈与生产校验](three-sdk-architecture.md#harness-反馈与生产校验) |
| 理解创作自由、四层能力与执行职责 | [Three SDK 架构](three-sdk-architecture.md) |
| 选择主体入口、绑定自制 Mesh、查询动作条件 | [SDK 用法](../packages/three-world/README.md) · [入口与封装边界](three-sdk-architecture.md#入口与封装边界) |
| 评审多角色运行时、批量资产/动作/操控接入的长期设计（提案） | [可扩展运行时与内容接入设计](superpowers/specs/2026-09-10-extensible-world-and-content-design.md) |
| 生产新资产、接入行动模式并提交 PR | [资产包提交与 Agent 接入规范](asset-production-integration.md) |
| 读取真实接口 | [公共类型](../packages/three-world/src/contracts.ts) |
| 修改内部调参、效果开关与 Playground 默认值 | [配置入口](../packages/three-world/src/config/README.md) · [验证记录](reviews/2026-09-09-runtime-tuning.md) |
| 集中控制配置并与主体规格解耦 | [控制配置集中与解耦方案](control-configuration-decoupling.md) |
| 查看当前车辆按需诊断、固定翼自绘接入与验证 | [接入验证](reviews/2026-09-10-vehicle-diagnostics-aircraft-agent.md) |
| 理解飞行器手感 profile 的资产默认值、实例覆盖与 3C 自动绑定 | [飞行器手感 profile 作用域](aircraft-flight-profile-scope.md) |
| 查看 #215 / #218 自绘载具接入范围、验证与剩余缺口 | [载具接入现状](reviews/2026-09-09-creator-vehicle-integration-status.md) |
| 配置汽车、摩托车漂移及理解速度/抓地力影响 | [制动漂移设计与调参](three-vehicle-drift.md) |
| 使用 Agent 工具、编译、验证和交付 | [Creator](../packages/creator-host/README.md) |
| 查看星夜骑行与练车两次 Agent 试跑后的优化优先级 | [两例 Harness 优化建议](reviews/2026-09-10-creator-two-case-optimization-plan.md) · [实施记录](reviews/2026-09-10-creator-case-feedback-results.md) |
| 查看开场输入接线、能力发现与第四次 Agent 复测 | [输入接线与复测](reviews/2026-09-10-creator-input-guidance.md) |
| 规划动作、录制、生成样式和恢复 | [Episode](../packages/episode-pipeline/README.md) |
| 运行数据生产 | [生产流程](three-sdk-data-production.md) · [云生成](../apps/creator-cloud/three-eval-README.md) |
| 生成 Seedance 视频、恢复任务和回收成片 | [Seedance 云端链路](three-episode-seedance.md) |
| 共享相机避障、状态交接与验证 | [职责原则](three-sdk-architecture.md#相机控制权与交接) · [验证记录](reviews/2026-09-08-shared-camera-collision.md) · [状态交接 TODO](reviews/2026-09-12-camera-handoff-todo.md) |
| 评审相机架构、可视化配置和旧标定迁移（提案） | [相机技术设计](superpowers/specs/2026-09-13-camera-configuration-design.md) · [深度审查](reviews/2026-09-13-camera-configuration-design-review.md) |
| 骑乘接入、马动画与实现记录 | [SDK 骑乘](../packages/three-world/README.md#imported-horse-and-rider-anchors) · [设计](superpowers/specs/2026-09-08-three-mounted-interaction-design.md) · [实现记录](reviews/2026-09-08-three-mounted-interaction.md) |
| 查看 Agent 能力缺口的修复和本地 case | [闭环修复记录](reviews/2026-09-09-agent-capability-closure.md) |
| 对照 Agent 链路与 Playground 的能力和剩余缺口 | [能力闭环审查](reviews/2026-09-08-agent-playground-capability-audit.md) |
| 查看输入、导航、起点探测与载具指导的契约修复 | [8 项修复记录](reviews/2026-09-08-control-contract-fixes.md) |
| 验证源码和跨组件行为 | [审查协议](reviews/full-dimension-review-protocol.md) · [Runtime 检查表](reviews/runtime-deep-review-checklist.md) |

SDK README 的 topic 标记供 Creator schema 工具按需提取。维护接口时同步实际类型、
对应主题与示例；使用 Agent 无需一次读取全部底层源码。
