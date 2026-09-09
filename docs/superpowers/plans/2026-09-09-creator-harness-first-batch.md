# Creator Harness First Batch Implementation Plan

执行完成；实际交付与验证见 [首批优化结果](../../reviews/2026-09-09-creator-harness-first-batch.md)。
实施时修正了两项计划细节：无法解析的默认类型局部标记 unavailable，而不阻断指南；参数属性构造声明不虚构其属性形状。对应源码审查已通过。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Preserve the exclusive ownership below; root integrates and reviews.

**Goal:** 修复生成 Agent 收到的非法 Training 方法声明，并让初始化、bridge 与浏览器启动错误保留足够的原始诊断。

**Architecture:** 在现有声明提取器、Host 私有 bridge 调用和 operation 错误封装内修复。公开成功响应、动作状态和交付证据规则保持现状；初始化异常与 RPC 异常分别采集。

**Tech Stack:** TypeScript 5.9.3、Vitest 3.2.7、Playwright 1.62.1、现有 MCP/CLI 与 Three SDK。

**Spec:** [最新 main 复核与首批设计](../../reviews/2026-09-09-creator-harness-recheck.md)。

**Naming review:** [API 与阶段命名审查](../../reviews/2026-09-09-creator-api-naming-audit.md)。确定的字段/文案错配安排独立小补丁；本文 Task 1–3 不隐式包含整套公共 API 重命名。

## Global Constraints

- Base: `e39f88051a7c487e34b85bf0f3bda78e3f897461`; branch: `codex/harness-authoring-feedback`.
- 保留 `trainingContractSource(source: string): string` 入口与现有主题边界。
- 不运行项目 SDK 的初始化表达式。
- 保持公开 MCP/CLI 及 browser bridge 成功返回形状、operationId 和 accepted/rejected 语义。
- 不增加新的生产步骤或门禁；不修改模拟、碰撞和录制选择语义；不自动重试。
- 不改变完整响应或异步完成模式；不新增通用 SDK Error 类或日志平台。
- 错误恢复、示例和说明引用当前真实工具名；候选新名称仅在 schema、活动消费者和对应测试同步迁移后生效。
- 原主工作区用户改动不带入、不修改。所有命令在本计划所在 worktree 执行。

## 文件分工

| 任务 | 独占文件 | 产出 |
| --- | --- | --- |
| 1 声明 | `scripts/three-creator/authoring-schema.ts`、`authoring-schema.test.ts` | 合法方法声明与真实源码消费回归 |
| 2 Host 错误 | `scripts/three-creator/tools.ts`、`tool-errors.ts`、`tool-usability.test.ts`、`tools.test.ts`；需要独立序列化模块时放在同目录 | 初始化/RPC/启动错误保留及操作日志验证 |
| 3 SDK 错误上下文 | `packages/three-world/src/world.ts`、`world-v2.test.ts` | role 拒绝携带现有字段中的实体与修复说明 |
| Root | `scripts/three-creator/README.md`、`runtime-guidance.test.ts`、`scripts/lib/test-gate-manifest.ts`、本计划与复核记录 | 跨模块集成、文档、census 和最终验证 |

任务 2 可在任务 1 的独占范围之外并行。任务 3 在任务 2 的错误字段保留规则明确后执行。任何共享文件修改先由 root 协调。

## Task 1: 规范 Training 的公开方法声明

**Consumes:** 真实 SDK 源码字符串与现有 `trainingContractSource` 返回。
**Produces:** 相同入口，返回合法参数声明；保留真实重载和公开类型名称。

- [x] 在 `authoring-schema.test.ts` 中用真实 runtime 源码构造消费测试。保留原模块 imports 作为类型上下文，将提取结果作为虚拟源文件放在同模块目录，用 `ts.createProgram` 检查该文件。使用现有测试中的 CompilerHost 覆盖方式，不往源码目录写临时文件。

消费片段必须包含以下正反用法：

```ts
declare const runtime: TrainingRuntime;
runtime.prepareCharacter([0, 0, 0]);
runtime.prepareCharacter([0, 0, 0], 0.5);
// @ts-expect-error yaw must remain numeric.
runtime.prepareCharacter([0, 0, 0], 'east');
runtime.setInput(undefined);
```

检查编译器诊断，不用单纯字符串快照代替实际消费。当前应因 interface 的默认参数报 TS2371；若出现无关导入错误，先修测试上下文再记录失败。

- [x] 执行失败测试：

```sh
pnpm exec vitest run scripts/three-creator/authoring-schema.test.ts --maxWorkers=1 --minWorkers=1
```

- [x] 在现有 AST 提取路径规范方法声明。默认初始化器从声明中移除，参数保持对应的可省略性和静态类型；有公开 overload 时保留 overload，不额外复制实现签名。不要通过修改 runtime 方法来迎合提取器。

本基线的目标签名为：

```ts
prepareCharacter(position: Vec3, yaw?: number): boolean;
```

使用 TypeScript AST/编译器的静态类型语义；不得执行默认表达式或将未知类型补为 any。覆盖返回中受同一提取逻辑影响的 TrainingHorse/factory 声明，避免只修一条字符串。

- [x] 在 `runtime-guidance.test.ts` 通过现有 workspace SDK fixture 修改默认值/显式参数类型，确认返回跟随该 workspace sourceHash，Host baseline 不替代修改后的声明。
- [x] 重跑 authoring-schema 与 runtime-guidance 相关测试；同步缩窄 Creator README 的 dependency closure 描述。此任务不改变 sourceFiles 的全量依赖集合或 topic 路由。

## Task 2: 保留三条错误路径与原 operation

**Consumes:** browser Error/RuntimeError、Host Error/AggregateError 和已验证 candidate hashes。
**Produces:** 既有 `error` 字符串与 `errorDetails` 中的可序列化诊断，关联实际 Host 阶段；成功结果保持原样。

- [x] 先在现有工具测试中增加真实初始化失败 fixture：作者模块在 observer 尚未发布时拒绝一个 RuntimeError。不得用已有 observer 方法抛错代替初始化路径。

```ts
throw {
  code: 'ENTITY_ROLE_REQUIRED',
  message: 'The landmark needs an explicit role.',
  category: 'invalid-input',
  phase: 'control',
  entityIds: ['landmark'],
  suggestedAction: "Set role to terrain, obstacle or decoration."
};
```

对失败 operation 断言原 code/message/category/phase/entityIds 保留，Host 阶段为启动阶段；同一 operation 再读得到同一失败现场。没有 stack 时不得出现伪造作者位置。

- [x] 分别增加 browser bridge 同步 throw、异步 reject、普通 Error 和成功返回 rejected command receipt 的用例。失败应记录实际 bridge method；rejected receipt 仍为成功 Host 调用。用副作用计数确认调用只执行一次。
- [x] 以有限 mock 隔离实际浏览器不可用情形：bundled 与系统 Chrome 均拒绝时，断言两个原因进入原 operation；context/newPage 失败时已创建资源得到清理。不执行真正坏环境重试或修改系统浏览器安装。
- [x] 在 Host 导航前安装 error/unhandledrejection 监听，保留 Playwright pageerror fallback，不调用 preventDefault。关闭失败 session 前尝试提取已采集记录；提取失败仅作为辅助诊断，原错误仍为主错误。
- [x] 在 Host 私有 `bridge()` 的 page.evaluate 回调内部包装调用，Host 解包；不要修改 browser bridge 公开方法返回形状。

内部传输的逻辑形状为：

```ts
type BrowserCallResult =
  | { ok: true; result: unknown }
  | { ok: false; error: {
      code?: string;
      message: string;
      category?: string;
      phase?: string;
      entityIds?: string[];
      suggestedAction?: string;
      stack?: string;
      cause?: { code?: string; message: string };
    } };
```

这些字段只在确实存在时保留；Host 阶段与原 SDK phase 分开。transport failure 没有浏览器执行结果，必须走独立失败路径。

- [x] 在 `tool-errors.ts` 保留原结构化 code，展开有限 AggregateError 原因；`errorDetails.nextSteps` 针对实际错误给现有公开契约或原 operation 查询指引。保留原 `error` 字符串字段和 AJV details。
- [x] 诊断白名单只读取上述字段及 Host candidate 身份；限制条数、文本和 cause 深度。增加循环 cause、BigInt、异常 getter、异常 toJSON 和过长文本用例，保证诊断可 JSON.stringify，且不把任意 throw payload/环境变量复制到日志。
- [x] 测试重复 operations_get 不触发浏览器启动；对暂停世界的 RPC 失败测试检查 simulationTick、输入与相机状态没有额外推进。保留当前操作调度和取消语义。

执行命令：

```sh
pnpm exec vitest run scripts/three-creator/tool-usability.test.ts scripts/three-creator/tools.test.ts --maxWorkers=1 --minWorkers=1
```

首次先选择新测试观察预期失败，完成实现后再运行完整两个受影响文件。不要为维持绿色结果放宽运行/提交校验。

## Task 3: 让 role 拒绝提供现成的修复说明

**Consumes:** Task 2 保留现有 RuntimeError 字段的能力。
**Produces:** 相同拒绝条件与 code，增加实体和具体修复说明。

- [x] 在现有 `world-v2.test.ts` 通过真实 `world.addEntity` 传缺失或非法 role，断言仍抛 RuntimeError，实体未注册；同时要求实体 ID 和 allowed-role 修复说明。
- [x] 仅修改 `world.ts` 的 role 检查分支，复用 `failure` 与 RuntimeError 的现有字段。

期望形状：

```ts
{
  code: 'ENTITY_ROLE_REQUIRED',
  category: 'invalid-input',
  phase: 'control',
  entityIds: ['landmark'],
  message: 'addEntity options.role must be terrain, obstacle or decoration; received undefined.',
  suggestedAction: 'Set options.role explicitly before adding this entity.'
}
```

实际 message 使用真实 id/标量值；对象值只描述其类型，不序列化 Three 对象。合法 role 和无效输入的拒绝条件保持原样。

- [x] 用真正 `addEntity` 的初始化失败接通 Task 2 fixture，确认从 SDK 到 persisted operation 的实际路径保留相同 code/entityIds，而非仅用人工 RuntimeError 证明。
- [x] 运行世界和相关 Creator/Episode 消费测试，不修改 Episode 的独立 RPC 或将 Creator 改进声称为其功能改进。

## Root Integration and Verification

- [x] 检查最终 diff 只包含上述任务；新增测试文件若存在则加入 test census 的正确 lane。
- [x] 运行相关测试文件、typecheck 和 census；涉及运行字节时执行 runtime prebuild，记录输出路径及 runtimeHash。

```sh
pnpm exec vitest run scripts/three-creator/authoring-schema.test.ts scripts/three-creator/runtime-guidance.test.ts scripts/three-creator/tool-usability.test.ts scripts/three-creator/tools.test.ts packages/three-world/src/world-v2.test.ts scripts/three-episode/adapter.test.ts --maxWorkers=1 --minWorkers=1
pnpm typecheck
pnpm test:census
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/harness-first-batch/runtime
git diff --check
```

已通过且源码未变的检查不重复执行。新增失败必须判断属于基线、测试环境还是本次改动；不顺带修其他功能。

- [x] 独立审查声明语义、错误主次、诊断自身失败、operation 身份与唯一执行者；审查不得替代运行测试。
- [x] 更新复核记录中的实际验证结果。未运行模型生成时明确耗时/成功率改善尚未实测。
- [x] 完成后按独立任务提交本地变更；未得到发布指令前不推送、不开外部生产任务。

## Preparation Status

- [x] 从最新 origin/main 创建独立 worktree。
- [x] 使用 frozen lockfile 从本地缓存安装依赖。
- [x] 基线 authoring-schema + tool-usability：25 项通过。
- [x] 原报告经独立复核，确定性缺陷与体验假设已分开。
- [x] API、输入参数、阶段状态及展示命名已审查，确定误标与改名候选已分开。
- [x] 产品实现与新增回归测试。
