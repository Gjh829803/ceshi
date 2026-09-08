# 文档索引

| 目的 | 入口 |
| --- | --- |
| 快速理解轻量 SDK 的背景与设计取舍 | [设计背景与取舍](three-sdk-architecture.md#设计背景与取舍) |
| 判断生产门禁与 Agent 反馈的边界 | [Harness 反馈与生产校验](three-sdk-architecture.md#harness-反馈与生产校验) |
| 理解创作自由、四层能力与执行职责 | [Three SDK 架构](three-sdk-architecture.md) |
| 选择主体入口、绑定自制 Mesh、查询动作条件 | [SDK 用法](../packages/three-world/README.md) · [入口与封装边界](three-sdk-architecture.md#入口与封装边界) |
| 生产新资产、接入行动模式并提交 PR | [资产包提交与 Agent 接入规范](asset-production-integration.md) |
| 读取真实接口 | [公共类型](../packages/three-world/src/contracts.ts) |
| 使用 Agent 工具、编译、验证和交付 | [Creator](../scripts/three-creator/README.md) |
| 规划动作、录制、生成样式和恢复 | [Episode](../scripts/three-episode/README.md) |
| 运行数据生产 | [生产流程](three-sdk-data-production.md) · [云生成](../scripts/cloud/three-eval-README.md) |
| 生成 Seedance 视频、恢复任务和回收成片 | [Seedance 云端链路](three-episode-seedance.md) |
| 共享相机避障与验证证据 | [职责原则](three-sdk-architecture.md#相机控制权与交接) · [验证记录](reviews/2026-09-08-shared-camera-collision.md) |
| 骑乘接入、马动画与实现记录 | [SDK 骑乘](../packages/three-world/README.md#imported-horse-and-rider-anchors) · [设计](superpowers/specs/2026-09-08-three-mounted-interaction-design.md) · [实现记录](reviews/2026-09-08-three-mounted-interaction.md) |
| 验证源码和跨组件行为 | [审查协议](reviews/full-dimension-review-protocol.md) · [Runtime 检查表](reviews/runtime-deep-review-checklist.md) |

SDK README 的 topic 标记供 Creator schema 工具按需提取。维护接口时同步实际类型、
对应主题与示例；使用 Agent 无需一次读取全部底层源码。
