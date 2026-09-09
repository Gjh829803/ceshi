# Creator Harness 首批优化复核

基线：fetch 后的 `origin/main`，`e39f88051a7c487e34b85bf0f3bda78e3f897461`。
工作分支：`codex/harness-authoring-feedback`。本记录用于收窄实施范围，不代表已经完成优化。

本记录保留实施前的取舍；已完成内容与最终验证见 [首批优化结果](2026-09-09-creator-harness-first-batch.md)。

## 复核后的判断

| 判断 | 证据与处理 |
| --- | --- |
| Training 声明包含非法默认参数 | `trainingContractSource` 把实现头截成 interface 成员；当前 `prepareCharacter(position:Vec3,yaw=0):boolean;` 可复现 TS2371。首批修复。 |
| 所有专题都应独立闭合成 .d.ts | 不成立。当前是分文件的源码摘录，并非独立声明包。应保证签名合法、公开类型引用可追踪；不建设全量声明打包器。 |
| 人物专题缺基础 API 导致本次读源码 | 尚未证实。生成指令已要求 getting-started，其中存在 role 和 reset 说明。暂不把基础成员复制到每个专题。 |
| createWorld 摘要准确性 | 手写摘要将部分可省略参数写成必填，值得单独修复；不能据此声称实际 SDK 不支持其他选项。人形 factory 正常引用公开导出类型不是缺陷。 |
| bridge catch 能覆盖首次初始化异常 | 不成立。作者模块初始化发生在 observer 就绪之前，需在导航前独立采集 error/unhandledrejection。 |
| Host 可以恢复实体、实际值、源码位置 | 只能保留已有信息。当前 role 抛值缺实体和 stack；补实体应改该抛错点，无栈时位置不可用。源码映射后置。 |
| 同 hash 的旧成功录像可以直接复用 | 条件不足。取消、初始化/录制前失败可能没有 report；必须先建立完整尝试状态，保留最新失败，再讨论显式证据选择。 |
| 大响应说明默认接口错误 | 不能这样推断。默认已是 guide，all/asset detail 是主动请求。字节量已复测，但没有本次读取和模型耗时证据。 |
| readiness 可以直接称为当前可交 | 必须带采样身份和时刻。Host 队列不锁外部工作区编辑；历史回执不能代表当前源码。validate 不应因可选 episode 观察失败新增编译门禁。 |

源码入口：[声明提取](../../scripts/three-creator/authoring-schema.ts)、[生成指令](../../scripts/cloud/three-eval-instructions.md)、[工具与浏览器生命周期](../../scripts/three-creator/tools.ts)、[错误封装](../../scripts/three-creator/tool-errors.ts)、[RuntimeError](../../packages/three-world/src/contracts.ts)、[云回执消费者](../../scripts/cloud/three-eval-statistics.mjs)。

## 首批设计

### 声明准确性

保留 `trainingContractSource(source: string): string` 入口与现有主题边界。将公开方法生成合法声明：移除实现体、规范默认参数、保留显式类型与真实公开重载。通过原模块 imports 解析公开引用，验证返回内容，不用 any 或忽略 TS2371 使检查通过。不运行项目 SDK 的初始化表达式。

修改 Creator README，把 dependency closure 的描述限定为 `contracts.ts` 内被选择的公开类型；Training 内容仍明确为来源可追溯的声明摘录。

### 错误信息保留

保持公开 MCP/CLI 及 browser bridge 成功返回形状、operationId 和 accepted/rejected 语义。

- Host 私有 bridge 调用在浏览器内捕获同步 throw 与异步 reject，Host 解包；Playwright transport 失败另记，不能把成功返回的 rejected receipt 改成 transport 失败。
- 导航前安装 `error` 与 `unhandledrejection` 采集，不阻止浏览器原事件。关闭失败 session 前读取有限诊断；读取失败不得覆盖原错误。
- 保留实际 Host 阶段和 candidate 的 source/runtime/build 身份；SDK phase 单独保留。
- 使用白名单字段和有界 cause，兼容普通 Error、RuntimeError、AggregateError。诊断自身应可 JSON 化，不能因循环对象、异常 getter 或超长内容导致二次失败。
- `addEntity` 的 role 拒绝只补现有 RuntimeError 的 message、entityIds、suggestedAction；保持拒绝条件、code、category 与运行行为。
- 沿用既有 operation 日志与 operations_get。读取已保存的失败现场不重新打开浏览器。

## 首批不包含

不增加新的生产步骤或门禁；不修改模拟、碰撞和录制选择语义；不自动重试；不改变完整响应或异步完成模式；不新增通用 SDK Error 类或日志平台。current 视角、路线摘要、readiness、证据选择、短等待与默认输出裁剪分别在后续评估。

## 验证边界

- 声明检查同时覆盖真实 TrainingRuntime、公开重载、factory/horse 受影响路径及修改后的 workspace SDK；检查公开摘录的合法性，不要求每段独立成为声明包。
- 初始化错误在 observer 尚未存在时重现；RPC 错误通过真实调用边界重现，两者不能互相替代。
- 错误用例包含普通 Error、plain RuntimeError、transport failure、launch 双失败、初始化资源清理以及诊断自身异常。
- 已有 MCP/CLI command accepted/rejected、暂停观察与操作身份继续通过。
- 涉及 SDK role 抛错点时，运行相关世界测试、typecheck、test census、runtime prebuild，并检查 Creator 与 Episode 的实际消费者。执行中不调用外部生产。

## 已完成的准备

`pnpm install --offline --frozen-lockfile` 成功，331 包从本地缓存安装。

```sh
pnpm exec vitest run scripts/three-creator/authoring-schema.test.ts scripts/three-creator/tool-usability.test.ts --maxWorkers=1 --minWorkers=1
```

结果：2 个文件、25 项通过，54.16 秒。包含既有 MCP/CLI 与暂停浏览器观察验证；尚未新增回归测试或产品实现，不能据此声称报告中的缺陷已经修复。没有运行完整 CI 或模型生成。

后续执行步骤见 [首批计划](../superpowers/plans/2026-09-09-creator-harness-first-batch.md)。

## API 与阶段命名补充

[命名专项审查](2026-09-09-creator-api-naming-audit.md) 已覆盖 Creator 工具、SDK 输入与生命周期、Episode/Seedance 阶段和展示消费者。新增确定问题包括 materialize 的 sourceHash 与 runtimeSourceHash 含义不一致、墙钟值误写入 simulationSeconds，以及 prepared 被显示为等待用户对齐。优先修字段/文案事实，再评估工具和输入协议改名；候选名称尚未成为可调用 API。
