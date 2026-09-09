# Creator 碰撞预算诊断

基线 `d4d694e3`，分支 `codex/harness-authoring-feedback`。

本机 `004_solar_fire_skimmer.png` 同图试跑实际遇到 mesh 三角面预算失败，
随后改为 box 又触发 collider 预算失败。原错误正文和栈已保留，但 Host 顶层
错误码为 `THREE_TOOL_FAILED`；box 错误还建议直接换回 mesh。

## 改动

- 两类预算错误保留原错误码和 Error 栈，补充 `code/category/phase/entityIds/suggestedAction`。
- 细分、源几何、层级和世界总量分别报告相应计数及预算。未完成的三角细分与 box 处理结果明确为下界；世界总量区分已有实体和候选处理后的总数。
- add、候选校验、刷新、同步和 reset 的刚体计划传递真实实体 ID。诊断补充失败不替换原异常，非法实例数的显示不调用作者的格式化函数。
- 修复建议明确 mesh 和静态 box 都可能细分；仅当封闭凸体的 hull 就是所需碰撞体时，建议 `convex-hull`。保留凹面、洞口和通路所需的实际几何，所有形状仍受源几何和世界预算约束。
- Host 同时识别已有纯文本 `PHYSICS_*` 错误，沿用原 operation 与恢复指引。没有增加自动重试。

预算、拒绝条件、细分与碰撞算法、物理分配顺序及提交门禁均保持不变。
实现见 [几何错误](../../packages/three-world/src/geometry.ts)、
[物理计划](../../packages/three-world/src/physics.ts)、
[Host 诊断](../../scripts/three-creator/tool-errors.ts)；
使用说明由 [SDK 入门指南](../../packages/three-world/README.md) 进入 Creator schema。

## 验证

- 新增 SDK 和真实浏览器启动回归先复现缺字段、通用错误码及缺少计数的问题，再验证修复。
- 受影响完整检查：5 文件 125 项通过，覆盖 Physics、World v2、Creator 工具/声明与 Episode adapter。
- 最终异常边界补验：2 文件 9 项通过，覆盖预算诊断、Host 序列化和恶意值；与上行重叠，不相加。包含 Symbol/异常 toString 不覆盖原预算错误的回归。
- typecheck、test census（74 个文件）、文档链接/源码核对、diff 检查和独立源码审查通过。
- 最终 runtime 预构建：`.codex-tmp/harness-collision-diagnostics/runtime`。
  runtimeHash `bd6f4b356160c0324151f3be607ef4f53996338a3dda0f37cb0f495f7d4f706d`；
  manifestSha256 `0d9b074f73565dd431f2c3ec493759bb0806f4d45d55618d6997bb0d5803d927`。

没有再次运行模型生成、完整 CI 或外部生产；本轮证明反馈准确且拒绝行为保持，
尚未测得端到端耗时的进一步改善。飞行器镜头与输入能力没有在本轮扩展。
