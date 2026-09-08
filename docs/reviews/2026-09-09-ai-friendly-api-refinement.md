# AI-friendly API 复核与改进

基于 `ef450d2c` 复核公开 API、Creator 工具及实际消费者。保留薄 SDK：自由 Three
创作，运行时继续负责唯一时钟、物理、动画和相机；本轮无新 package 或生产门禁。

## 复核结论与改动

| 原建议 | 复核后的处理 |
| --- | --- |
| 简化命令等待 | 在现有 Host 队列上增加可选短等待及 `worldExecution`、`next`；保留两层操作身份与原始结果，不另建调度器 |
| 增强相机/移动/骑乘观察 | 现有状态基本齐全，收窄为修复实体筛选传递与按需选择输出，不新增诊断模型 |
| 重组常用/底层 API | 主题式渐进发现已存在，不调整 exports；修复入门、自制主体、扩展主题漏掉 `onReset`/`onDispose` 的实际问题 |
| 补接入指导 | 在公共主题前言、相关参数和示例旁说明坐标、碰撞体原点及 reset 生命周期 |
| 姿态/骨骼扩展 | 当前没有足够重复案例支持新增通用接口，本轮不实现 |

`world_inspect.sections` 可选 snapshot、description、hierarchy、diagnostics。省略时
保留完整响应。description 的非空 entityIds 传给 SDK，Host 继续执行已有描述全文
搜索；实体参数和 boarding 一起过滤。实体筛选不代表裁剪 snapshot 或 hierarchy。
层级遍历和额外 diagnostics 只在请求时执行；每次保留 sample 版本/tick/模拟秒数，
未知值用 null，未请求反馈留空。旧 workspace SDK 缺少 boarding 时保留字段缺失。

`world_execute_command` 可选 waitSeconds；`world_get_operation` 的正等待也能在
结果就绪时直接返回。等待超时仍通过同一个 Creator operationId 查询，不取消或
重提。Host 请求成功不代表 World 动作完成；applied、accepted、rejected 与实际
operation 状态分别保留。队列或长动作仍可能需要额外 Host 查询，不承诺每次一步
完成。MCP、JSON-lines 和单次 CLI 沿用同一反馈封装。

## 验证

- 10 个相关测试文件共 126 项通过：工具契约、真实 MCP/浏览器、捕获、项目 SDK
  指导、骑乘与非人主体、World v2 和 Episode。
- 额外单次 CLI 摘要保留回归 1 项通过；新增总计计入 127 项相关验证。
- 类型检查、68 文件 test census、workspace boundaries、diff 检查和 runtime
  prebuild 通过。runtimeHash：`6a380cda6be2a21ec92293640eb31c770f38896877d66495d139716bd2d62595`。
- 浏览器用两个简单主体验证实体筛选、精简 snapshot、即时命令成功/拒绝与状态
  读回；暂停时重复观察及等待不推进 simulationTick。未重新跑模型生成或视频生产。
- 独立复审发现并修复了旧 SDK 缺失 boarding 导致 inspection 抛错、单次 CLI
  覆盖摘要两处问题，均有回归覆盖。

这轮验证覆盖 API 和真实消费者，不代表已经测得生成成功率或生成耗时改善。
测试临时目录自动清理，未创建持久场景、截图或录像归档。没有调用云生成或供应商。

使用说明见 [Creator](../../scripts/three-creator/README.md#inspect-and-execute) 与
[SDK](../../packages/three-world/README.md)。
