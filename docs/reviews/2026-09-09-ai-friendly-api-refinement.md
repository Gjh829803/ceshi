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
检查全部内容。query 与 entityIds 直接传入当前 SDK，Host 原样返回描述，不重复
过滤实体、参数或 boarding。query 按 SDK 的 id/name/tags 作忽略大小写的子串匹配；
省略 entityIds 选择全部，空数组选择空集合。实体筛选不裁剪 snapshot 或 hierarchy。
层级遍历和额外 diagnostics 只在请求时执行；每次保留 sample 版本/tick/模拟秒数。
当前 Raw 模式缺少可选遥测时返回 null，未请求反馈留空。

项目尚未上线。本次移除旧 SDK boarding 缺失保护、旧回调忽略参数时的 Host
二次筛选，以及旧全文搜索/空数组语义适配；对应旧版兼容测试删除。

`world_execute_command` 可选 waitSeconds；`world_get_operation` 的正等待也能在
结果就绪时直接返回。等待超时仍通过同一个 Creator operationId 查询，不取消或
重提。Host 请求成功不代表 World 动作完成；applied、accepted、rejected 与实际
operation 状态分别保留。队列或长动作仍可能需要额外 Host 查询，不承诺每次一步
完成。MCP、JSON-lines 和单次 CLI 沿用同一反馈封装。

## 验证

- 移除旧版兼容后，4 个相关测试文件共 46 项通过：观察接口、工具反馈、真实
  MCP/浏览器、单次 CLI、World v2 和 Episode。
- 类型检查、68 文件 test census、diff 检查和 runtime prebuild 通过。
  runtimeHash：`81b02f44bca0ca7225874d2a6516375dd1c5d686f5ab3efd57d58ef4352019a4`。
- 浏览器用两个简单主体验证实体筛选、精简 snapshot、即时命令成功/拒绝与状态
  读回；暂停时重复观察及等待不推进 simulationTick。未重新跑模型生成或视频生产。
- 独立复审确认单次 CLI 摘要保留；旧 SDK 兼容建议经用户确认不适用，已移除。

这轮验证覆盖 API 和真实消费者，不代表已经测得生成成功率或生成耗时改善。
测试临时目录自动清理，未创建持久场景、截图或录像归档。没有调用云生成或供应商。

使用说明见 [Creator](../../scripts/three-creator/README.md#inspect-and-execute) 与
[SDK](../../packages/three-world/README.md)。
