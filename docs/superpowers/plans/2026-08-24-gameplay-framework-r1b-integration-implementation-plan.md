# Gameplay Framework 与 Route R1b 融合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在最新 Route R1b 上实现 provider-neutral、事务化、可扩展的 Gameplay Framework，并通过 Browser Protocol V5 把 Gameplay、Route Evidence、Camera 与 Outdoor runtime 统一到一条可验证路径。

**Architecture:** 以 `RuntimeHost → WorldSession → GameplayMode/State → GameplayWorldPort → Babylon` 为运行时骨架；`possessedBy` 是唯一控制权真相，Route 保持只读派生查询，Camera 保持独立 View owner。公共 wire contract 使用关闭 V1 union，ExecutionPlan 保留 R1b V5 全部字段并 clean-break 重命名初始控制候选。

**Tech Stack:** TypeScript 5.9、Vitest 3.2、Babylon.js 9.21.2、Havok 1.3.14、Vite 7、pnpm workspace、Playwright/Chromium verification。

**Spec:** `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md`

## Global Constraints

- 当前分支 fork 自 `origin/codex/r1b-integration@1bf9f5d`；最新权威参考为 `df9f674`（R1b Task 6–8
  已实现）。共享 Runtime/Browser 接线前必须 fetch 并吸收 Task 9/10 atomic cutover/completion HEAD。
- 不直接 merge `origin/pr/19@faab0fd`，只移植并修正有价值的设计和实现。
- Canonical Schema、CLI、Browser、Receipt、Report、Snapshot 不出现 Babylon、Havok、Recast provider 名或 Handle。
- `possessedBy` 是控制关系唯一权威；Controller、Runtime root 和 Camera 不保存竞争 target 真相。
- Runtime 只选择锁定 Camera Profile Ref；数字调整只进入隔离 Authoring Preview。
- `checkSupport()` 是 Ground/Support 唯一路径；Gameplay 与 Route 不新增 ray/AABB/height fallback。
- Runtime Tick 只由 Babylon fixed simulation step 推进；WorldSession 不维护第二时钟。
- Route Build Input V2、Surface/Collider join、全部 Route Hash 和两个 blocking gate 必须原样保留。
- 公共对象 exact-key、严格 `===/!==`；null/undefined 检查使用 `lodash-es` 的 `isNil`。
- 每个行为先写失败测试并观察正确失败，再写最小实现。
- 每个任务形成独立提交；子智能体报告不是集成证据。

## Current implementation status (2026-08-24)

| Workstream | Status | Evidence / next boundary |
| --- | --- | --- |
| G19-0 design and dependency graph | Complete | Design and plan are committed from `db01979`; later review dispositions are incorporated in the authoritative spec. |
| G19-2 / G19-2A / G19-2B contracts and artifacts | Complete | Closed Gameplay contracts, identity/hash helpers, Feature/Action artifacts, capacity and retention invariants are committed through `1a3d824`. |
| G19-3 Gameplay core, WorldSession and RuntimeHost | Complete | Implementation checkpoint starts at `f71bcb3`; post-review RuntimeHost suite passes 118/118, full repository suite passes 1,972/1,972, typecheck/build and canonical/placement/subject/Route gates pass. Cursor code re-review returned `CODE GO`; see the G19-3 review disposition. |
| G19-4 onward | Blocked by declared dependency | `origin/codex/r1b-integration` is still `df9f674`; wait for R1b Task 9 atomic cutover and Task 10 completion HEAD before touching shared ExecutionPlan/Compiler/WorldPackage/Babylon/Browser owners. |

---

### Task 1: 冻结设计、基线与执行账本

**Files:**
- Create: `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md`
- Create: `docs/superpowers/plans/2026-08-24-gameplay-framework-r1b-integration-implementation-plan.md`
- Create: `.superpowers/sdd/2026-08-24-gameplay-framework-r1b-integration-implementation-plan/progress.md`（git ignored）

**Interfaces:**
- Consumes: R1b fork `1bf9f5d`、latest reviewed reference `df9f674`、PR #19 `faab0fd`、Aurora `854dbff`。
- Produces: G19-0 冻结合同与任务 DAG。

- [ ] **Step 1: 记录基线 SHA 与远端状态**

Run:

```bash
git rev-parse origin/main origin/codex/r1b-integration origin/pr/19 origin/aurora/p15-camera-tuning-cleanup
git status --short --branch
```

Expected: `9c5a615 / 1bf9f5d / faab0fd / 854dbff`，工作树只有本文档。

- [ ] **Step 2: 运行 R1b baseline gates**

Run:

```bash
pnpm typecheck
pnpm test -- --reporter=dot
pnpm build
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
```

Expected: 全部 exit 0；记录 Test Files/Test 数与既有 chunk warning。

- [ ] **Step 3: 自审规格与计划**

逐节核对 Spec 的 Owner、版本、字段、Route hash、Camera、Reset、容量和门禁均在 Plan 有任务；搜索 `TBD|TODO|implement later|similar to` 并删除占位。

- [ ] **Step 4: 提交文档**

```bash
git add docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md docs/superpowers/plans/2026-08-24-gameplay-framework-r1b-integration-implementation-plan.md
git commit -m "docs: design gameplay framework r1b integration"
```

---

### Task 2: 实现关闭的 Gameplay Contracts V1

**Files:**
- Create: `packages/gameplay-contracts/package.json`
- Create: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Create: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Create: `packages/gameplay-contracts/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Spec §6–8；不依赖 Runtime/Browser/R1b。
- Produces: `GameplayCommandV1`、`GameplayCommandReceiptV1`、`GameplayEventV1`、`GameplayInspectionSnapshotV1`、`WorldStateSnapshotV1`、`GameplayCapacityBudgetV1`、parser/canonicalizer/hash helpers。

- [ ] **Step 1: 写 Command parser 的失败测试**

测试四个合法分支和以下非法输入：缺 `schemaVersion`、旧 `subjectEntityId/actionId/expectedBinding`、unknown field、accessor、Symbol、非普通原型、空 ID、非有限 Tick/数值。合法 bind fixture 使用：

```ts
{
  schemaVersion: 1,
  id: "command-bind-primary",
  type: "control.bind",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  controllerEntityId: "controller-primary",
  controlledEntityId: "g-bot-primary",
  expectedPossession: { mode: "unbound" }
}
```

Run: `pnpm vitest run packages/gameplay-contracts/src/gameplay-contracts.test.ts`

Expected: FAIL because package/parser does not exist.

- [ ] **Step 2: 实现 Command exact parser**

实现普通数据 snapshot、closed key 检查、safe integer/finite number、角色字段与深冻结；只导出 V1，不导出 V2/V3 alias。

- [ ] **Step 3: 写 Receipt/Event union 的失败测试**

断言：

- committed 必须有 `simulationTick/eventIds/worldStateAfterRef/worldStateAfterHash` 且无 diagnostic；
- rejected 必须有 diagnostic、空 eventIds 且无 state-after；
- failed 必须有 diagnostic；
- Event 必须有 `sequence`，ID 与 `worldSessionId + sequence` 稳定；natural action completion 无 `commandId`；
- unknown status/type/key fail closed。

Run same test file; Expected: FAIL on missing types/parser.

- [ ] **Step 4: 实现 Receipt/Event parser 与 canonicalizer**

Event type 首批固定为：

```ts
"relationship.committed" | "relationship.removed" |
"semantic-fact.started" | "semantic-fact.ended" |
"action.started" | "action.completed" |
"action.cancelled" | "action.failed" | "world.failed"
```

Relationship payload 使用 `controlledEntityId/controllerEntityId`；Action payload 使用 `semanticActionRef/actionExecutionId/actorEntityId`。

- [ ] **Step 5: 写 State 与 Capacity 的失败测试**

断言 Participant 无 controller ID 数组、Controller 无 binding/target、Possession 基数和 map key/object ID 一致；插入顺序不同得到相同 canonical hash；容量每个字段拒绝负数、小数、NaN、Infinity 和超 safe integer。

同时覆盖：

- `relationship` Controller/Subject、Capability owner、Action actor 和 inspection Participant/
  Controller 的 dangling 或错误角色引用全部拒绝；
- `__proto__` 作为 JSON map key 不得修改结果对象 prototype、丢失条目或破坏 canonicalization；
- `semanticFactsById` 是必填 Map，首批关闭联合为 `supportedBy | touching | insideVolume`；
- Fact 必须携带锁定 Projector Profile Ref/Hash，ID 由 type、canonical endpoints、started Tick 和
  Profile 派生；`semantic-fact.started/ended` Event 携带 exact Fact 快照；
- `worldStateHash` 排除 artifact/session identity 和自身，包含 Tick、WorldPackage/ExecutionPlan
  Hash、五类 State Map 与 `lastEventSequence`；跨 Session 相同语义状态 hash 相同，任何 hash 域
  字段被篡改都拒绝；
- air/ground 与 locomotion mode、非负速度、Relationship/Fact/Action Tick 顺序全部一致。

- [ ] **Step 6: 实现 State/Capacity canonicalizer**

`WorldStateSnapshotV1` 与上位 Canonical State V1 使用同一 exact envelope，包含 entity、
relationship、capability、semantic fact、active Action map 和已验证 `worldStateHash`；
`GameplayInspectionSnapshotV1` 是唯一 inspection 公名并明确标记 inspection projection。默认
budget 常量为：

```ts
{
  maximumParticipantCount: 1,
  maximumControllerEntityCount: 1,
  maximumPossessedByRelationshipCount: 1,
  maximumActiveActionStateCount: 256,
  maximumGameplayFeatureCount: 16,
  maximumSemanticActionDefinitionCount: 256,
  maximumSemanticFactCount: 4096,
  maximumSemanticFactTransitionCountPerTick: 1024,
  maximumIdempotencyRecordCount: 4096,
  maximumUsedActionExecutionIdCount: 4096,
  maximumRetainedReceiptCount: 4096,
  maximumRetainedEventCount: 8192,
  maximumRetainedWorldStateSnapshotCount: 4096
}
```

- [ ] **Step 7: 验证并提交**

```bash
pnpm install --lockfile-only
pnpm vitest run packages/gameplay-contracts/src/gameplay-contracts.test.ts
pnpm typecheck
git add packages/gameplay-contracts pnpm-lock.yaml
git commit -m "feat: define canonical gameplay contracts"
```

### Task 2A: 收口 RuntimeHost 所需的 Canonical identity 与 Fact capacity

**Files:**
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Modify: 上位 Canonical State/Gameplay design 同名字段

在 Task 4 前以 clean break 完成：Receipt Base 增加 `commandHash`；Snapshot/Receipt ID 使用设计 §9.1
公式并由 parser 重算；committed Receipt 的 `worldStateAfterRef` 也必须由自身 session identity 与
`worldStateAfterHash` 重算并拒绝不匹配；容量增加 `maximumSemanticFactCount` 与
`maximumSemanticFactTransitionCountPerTick`；Diagnostic 增加
`WORLD_REPLACEMENT_CAPACITY_EXCEEDED` 与 `RUNTIME_HOST_CAPACITY_EXCEEDED`。先写 mismatch/collision、
changed-payload、Fact count/transition N/N+1 与 hostile input RED tests，再修改 parser/helper。Task 3
只需同步新的 exact Capacity shape；Task 4 不得私自实现另一套 identity helper。

### Task 2B: 收口 data-only Gameplay artifact 与 RuntimeHost 容量合同

**Files:**
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Modify: `packages/gameplay/src/gameplay-feature-manager.ts`
- Modify: `packages/gameplay/src/core-semantic-action-feature.ts`
- Modify: `packages/gameplay/src/index.ts`

**Interfaces:**
- Consumes: Task 2A 与 Spec §6–9。
- Produces: Compiler/WorldPackage 可依赖的纯数据 Artifact Schema；行为包只保留 function-bearing lifecycle。
- Execution mode: `sequential`，必须在 Task 4/6 前完成；不修改 Runtime/Compiler/WorldPackage。

- [ ] **Step 1: 写依赖方向与 exact-schema RED tests**

覆盖 `GameplayEntityDescriptorV1`、Feature Resource Budget/Manifest Body/Manifest/Resource Lock、Action
Definition Body/Definition、Gameplay Bootstrap Body/Bootstrap 的 exact key、closed union、canonical hash、
hostile accessor/prototype/unknown field 与 changed-payload。加入依赖门禁：`gameplay-contracts` 不得依赖
`gameplay`，Compiler/WorldPackage 不得为解析数据 Artifact 反向依赖行为包。
Bootstrap builder 必须将 descriptors 按 `id`、locks/actions 按 `resourceRef`、capability refs 按 lexical
order 排序并拒绝重复；serialized parser 拒绝非 canonical order。置换输入顺序必须得到相同 content hash。

- [ ] **Step 2: 移动 data-only schema，不保留 alias**

类型、parser、builder、canonical hash helper 移到 `@whitebox-world/gameplay-contracts`；
`GameplayFeatureFactoryV1`、Handler、Catalog、State Slice 和 lifecycle 继续属于 `@whitebox-world/gameplay`。
行为包只消费并 re-export 必要的 canonical type，不复制 parser/hash 实现。

- [ ] **Step 3: clean-break 容量语义**

把 `maximumRetiredActionExecutionIdCount` 改为 `maximumUsedActionExecutionIdCount`，把 Transition delta
改为 `immediateEventCount + terminalEventReservationCountDelta`；新增
`maximumRetainedWorldStateSnapshotCount`。Action activate 必须预留一个 terminal Event，cancel/completion
消费该预留；测试 N/N+1、同 Tick 多 completion、cancel 释放及 rejected/abort 不泄漏 reservation。

- [ ] **Step 4: 验证并提交**

```bash
pnpm vitest run packages/gameplay-contracts/src packages/gameplay/src
pnpm typecheck
git commit -am "refactor: separate gameplay artifact contracts"
```

---

### Task 3: 实现纯 Gameplay State、Mode、Feature 与 Action Catalog

**Files:**
- Create: `packages/gameplay/package.json`
- Create: `packages/gameplay/src/gameplay-state.ts`
- Create: `packages/gameplay/src/gameplay-state.test.ts`
- Create: `packages/gameplay/src/gameplay-mode.ts`
- Create: `packages/gameplay/src/gameplay-command-dispatcher.ts`
- Create: `packages/gameplay/src/gameplay-command-dispatcher.test.ts`
- Create: `packages/gameplay/src/gameplay-feature-manager.ts`
- Create: `packages/gameplay/src/gameplay-feature-manager.test.ts`
- Create: `packages/gameplay/src/core-control-feature.ts`
- Create: `packages/gameplay/src/core-semantic-action-feature.ts`
- Create: `packages/gameplay/src/core-semantic-action-feature.test.ts`
- Create: `packages/gameplay/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 2 V1 contracts。
- Produces: pure `GameplayState`, `GameplayModeV1`, typed transition plans, injected `GameplayFeatureFactoryV1` 与 frozen Action Catalog。
- Direct dependencies: `@whitebox-world/gameplay-contracts` 与用于 manifest/definition canonical hash 的
  `@whitebox-world/protocol`；不得依赖 Runtime/Browser/Babylon。

- [ ] **Step 1: 写 Possession State 的失败测试**

覆盖 bind/release/rebind、stale `expectedPossession`、一 Controller 多目标、一目标多 Controller、输入顺序确定性、Participant→Controller 单向归属和 commit 前后 snapshot/hash。已绑定同一目标时稳定拒绝 `CONTROL_ALREADY_OWNED`；Relationship ID 从 accepted bind command ID canonical 派生，replay 稳定且解除后新建得到新 ID。

Expected production mutation caught: 若 Controller 自带 target 或同一目标允许两个 Controller，测试失败。

- [ ] **Step 2: 实现最小 GameplayState control planning/commit**

Planning 不改变 State，返回判别 Transition Plan；commit 校验 revision/所有 before-image，在 cloned
map 上一次 swap 并只增加一次 revision。Rebind 的一个 plan 同时包含 remove+add 和 2 个 Event
容量；使用关系 map 为唯一事实。World State projection 必须显式接收 Adapter-owned spatial entity/
capability/fact context，由 Gameplay 加入 Controller Entity 后调用 Task 2 builder，不能由 Adapter
复制 Controller，也不能由 Gameplay 推断 Physics/Medium/Fact。另提供 immutable plan 的 staged
projection：完整验证但不改状态，供 Task 4 在 logical commit 前预构造 Publication Bundle。
Plan 必须由当前 `GameplayState` 实例私有签发，伪造、浅拷贝和其他实例的 Plan 在 staged projection/
commit 前即拒绝；成功 commit 消费签发凭据。Action 归 actor，不保存启动 Controller 的第二所有权；
release/rebind 不使用 `isMovementInputBlocked` 作为控制变更策略，cancel 由 actor 的当前 possession 授权。
签发凭据必须绑定 canonical command hash、command ID/type/Tick；Dispatcher 使用 State 暴露给 trusted
Host 的独立 authorization port 对当前命令授权，Handler 只能看到 restricted planning port。仅证明
“由同一 State 生成”不够：替换 ID/type/target/payload/Tick、跨 State、复制或绕过 Dispatcher 的 Plan
都必须在 staged projection 前拒绝。成功 commit 同时消费 issuance 与 authorization。

- [ ] **Step 3: 写 FeatureManager/Dispatcher 的失败测试**

覆盖 dependency cycle、missing feature/capability/lock、manifest content-hash mismatch、duplicate
ref/handler、稳定拓扑顺序、factory/create/prepare/activation throw、reverse cleanup、cleanup
aggregation、单命令单 handler和多 WorldSession factory 隔离。证明全部 graph/lock/handler 校验在
创建 State Slice 前完成。
另覆盖 surplus lock、Handler 的 `plan` 非函数，以及 factory 返回实例后 ref/handler 校验失败仍执行
`dispose(undefined)`；Resource Lock 与 Factory manifest Ref 必须精确闭集相等。

- [ ] **Step 4: 实现 FeatureManager/Dispatcher**

Function-bearing Feature/State Slice 仅 package-private；可序列化 manifest 使用冻结的
`kind/id/version/resourceRef/contentHash/dependencyFeatureRefs/requiredCapabilityRefs/commandTypes/budget`
形状，Host 注入每 Session factory。Manifest hash 与实现 build fingerprint 分离。

- [ ] **Step 5: 写 Action Catalog/State 的失败测试**

覆盖 unknown/duplicate `semanticActionRef`、definition content-hash、request presence/schema mismatch、
actor/possession mismatch、availability constraint、exclusive-per-subject、movement blocking、
fixed-duration、explicit cancel、used execution ID、natural completion 无 commandId、同 Tick稳定排序、
active 与永久 used execution ID 两个容量维度 N/N+1；另覆盖 terminal Event reservation 的
activate/cancel/completion/abort 和同 Tick 多 completion。

- [ ] **Step 6: 实现通用 Semantic Action Feature**

不得硬编码 `dance.rumba`/`emote.salute`；Action Definition 使用设计 §8.2 exact shape，从
WorldSession 构造参数注入、canonical hash 校验、排序并冻结。首期 activation 直接进入 active，
cancel/completion 直接移除，不制造 starting/completing 中间阶段。

- [ ] **Step 7: 验证并提交**

```bash
pnpm install --lockfile-only
pnpm vitest run packages/gameplay/src
pnpm typecheck
git add packages/gameplay pnpm-lock.yaml
git commit -m "feat: implement pure gameplay state and features"
```

---

### Task 4: 实现 RuntimeHost、WorldSession 与 provider-neutral transaction port

**Files:**
- Create: `packages/runtime-host/package.json`
- Create: `packages/runtime-host/src/gameplay-world-port.ts`
- Create: `packages/runtime-host/src/world-session.ts`
- Create: `packages/runtime-host/src/world-session.test.ts`
- Create: `packages/runtime-host/src/runtime-host.ts`
- Create: `packages/runtime-host/src/runtime-host.test.ts`
- Create: `packages/runtime-host/src/test/fake-gameplay-world-adapter.ts`
- Create: `packages/runtime-host/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 2/3 contracts；暂时消费 R1b 当前 `ExecutionPlanV5`，字段读取集中在一个 helper，
  Task 6 切换 `initialControlledEntityId`。
- Produces: RuntimeHost/WorldSession lifecycle、serialized barrier、idempotency、capacity reservation、staged abort、统一 Runtime Activity lease。
- Owns only: `runtime-host` package and lockfile；不修改 ExecutionPlan/Compiler/Browser/Babylon/
  Camera/R1b shared files。

- [ ] **Step 1: 写 WorldSession transaction RED tests**

先冻结 `RuntimeHostCreateOptionsV1` 的 exact `RuntimeWorldConfigurationV1`、self-hashed
`GameplayBootstrapV1`、Participant/Controller bootstrap、Mode/Feature/Action request resolver、
Gameplay/Host Capacity、Adapter factory 与不可复用 WorldSession ID factory。Host Activity budget 使用
`maximumRuntimeActivityRecordCount`。覆盖 hostile
accessor/Symbol/prototype/unknown command、parse-before-mutation、same ID replay/different payload
conflict、stale Runtime/WorldSession、failed/disposed phase。

- [ ] **Step 2: 实现窄 `GameplayWorldPortV1`**

端口只允许 Entity query、controllability、Action availability、无外部可见副作用的
`prepareGameplayTransition`、单 Tick capacity estimate/推进、canonical Spatial Entity/Capability/Fact
projection、可选 capture/render capability 和 dispose；不出现 provider 名和 Handle。Prepared
Transaction exact API 返回 `projectedWorldStateAfter`、`projectedViewStateAfter`、同步 no-throw
`commitPrepared(): void` 与 same-Promise `abort(): Promise<void>`。prepare/abort 不得改变 published epoch；
`commitPrepared` 不分配、不 await、不调用用户代码且不可抛，成功后不能重新 commit。

- [ ] **Step 3: 实现 WorldSession barrier/transaction**

顺序严格为 parse → canonical idempotency → journal/terminal reservation → identity/phase → pure plan →
worst-case capacity → Adapter invisible prepare → validate staged World/View projection → Task 3 staged
projection → prebuild/freeze success 与 fail-closed Publication Bundle → 关闭 render/capture → 同步执行
`commitPrepared()`、Gameplay cached commit 和单次 Publication Bundle pointer swap → 开放新 published epoch。
Snapshot ID/Ref 与 Receipt ID 只调用 Task 2A helper；同步 snapshot、render 与 capture 只读同一上一份或
新一份完整 epoch，不能观察 half-published Camera/Action/Control。覆盖 rebind remove-before-commit Event
顺序、prepare rejected、abort failure、invalid after-projection abort、logical revision conflict abort、
`commitPrepared` no-throw 合同被违反时 fail closed，且不发布混合 epoch。

- [ ] **Step 4: 写 RuntimeHost lifecycle RED tests**

覆盖两个 Host 隔离、new/duplicate WorldSession ID、reset 默认 unbound、旧命令 stale、candidate
create/init/snapshot 失败保留 old、double-residency preflight、任一 active Activity 阻止 reset/replace、
queued command/reset 顺序、candidate build 期间 Activity epoch 改变取消 swap、swap critical section拒绝 acquire、partial
create、throwing cleanup、successful swap 后 old dispose failure、double dispose same Promise、
reset/dispose race；candidate build pending→dispose cancel→candidate resolve 后 exactly-once cleanup、swap
成功但 old cleanup pending→dispose current 并 join 两者、cleanup throw 聚合但不复活 route。

- [ ] **Step 5: 实现 Host 注入与 replacement**

Host options 必须注入所有 §9.1 字段；Bootstrap factories/Catalog/descriptors/capabilities 必须逐项
对锁，禁止硬编码身份、Core Features/Action 或 WorldPackage Hash。Task 4 只校验 Bootstrap self-hash，
Task 6 加入 `gameplay-bootstrap` Plan/Package membership 后才允许外部 Loader 使用。Host 只使用一条
mutation queue 的短 barrier；`disposeRequested` 同步关闭新准入。Replacement phase A 在 queue 内设置
唯一 single-flight token 并捕获 current/generation/activity epoch，candidate 在 queue 外构造，phase B 回到
queue 复核 token/current/generation/epoch/lease 后才 swap。任意时刻只允许 old + 一个 candidate，第二
replace 不得形成 old+A+B。Runtime Activity 类型暂由
`runtime-host` 作为 trusted in-process API 拥有，不写入 Browser/CLI/Canonical Schema，也不修改
R1b 的 `runtime-contracts`。Activity kind 关闭为 runtime-run/simulation-take/control-capture；Run 显式
acquire，Take/Capture trusted orchestration 自动 acquire/finally release。acquire/release 使用同步 epoch
coordinator；replace final barrier 二次检查 epoch/全部 active lease/current world，
`replacementCommitPending` 阶段拒绝 acquire。Activity request exact `{ kind, requestId, payloadHash }`；
retained record 锁定 bound worldSessionId、epoch 与 active/released/terminated-by-host 状态，
达到 Host retention 上限后新 request fail closed。Host dispose join pending candidate 与 retiring old cleanup，
原子终结 active records、取消并 join Take/Capture/Run cleanup；所有 Host-owned cleanup settle 后 same Promise
才完成，迟到 release 幂等返回终态。

- [ ] **Step 6: 写容量/retention RED tests 并实现**

每个预算 N 成功、N+1 在 Adapter prepare 前拒绝；不淘汰幂等/Receipt/Event/used execution ID/used
Session/Activity records。Action activate 通过 Transition delta 预留 terminal Event；cancel/completion 消耗，
所有 abort/失败路径释放且不泄漏。committed Receipt 引用的 canonical WorldState artifact 必须保留在受
`maximumRetainedWorldStateSnapshotCount` 约束的 store 中并可按 Ref 解引用，不能只缓存 latest。
journal 第 N+1 个新 command 触发不可逆 admission-closed Tick，之后
按 commandHash/Task 2A Receipt identity 合成同 bytes、空 Event、不入已满 journal 的 capacity Receipt；旧 command replay
仍返回 retained Receipt，fixed input 可继续但 command admission 不重开。

- [ ] **Step 7: 写 fixed-input 与 capacity/race RED tests 并实现**

公开调用可以请求 N Tick，但 Host 必须展开成 N 个 `FixedInputOneTickV1`：每 Tick 先 estimate、推进一次、
投影并发布 Fact/Event/WorldState，再进入下一 Tick。覆盖 zero/unsafe Tick、同一批次中 started→ended 不会
因 endpoint diff 消失、Fact count/transition estimate 与实际 delta、estimate breach、Event capacity
不足时推进前拒绝、按 natural completion Tick 分段、同 Tick completion 稳定顺序、invalid projection/
adapter failure 使 Session fail closed、caller mutation 不影响 replay、command/fixed-input/replace/
dispose 同 barrier、三类 Activity acquire/release/idempotency/isolation、capture/take 期间 reset/replace 拒绝、
dispose 终结 active record 且迟到 release 幂等。

- [ ] **Step 8: 验证并提交**

```bash
pnpm install --lockfile-only
pnpm vitest run packages/runtime-host/src packages/gameplay/src packages/gameplay-contracts/src
pnpm typecheck
git add packages/runtime-host pnpm-lock.yaml
git commit -m "feat: add transactional runtime host"
```

---

### Task 5: 吸收 R1b completion HEAD 与 Aurora Camera cleanup

**Files:**
- Modify: 由新的 `origin/codex/r1b-integration` completion diff 决定；必须先记录 HEAD。
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Create/Modify: `packages/runtime-babylon/src/camera-preview-channel.test.ts`
- Modify: `packages/runtime-babylon/src/capability-runtime.test.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/main.ts`

Task 5 在 completion HEAD fetch 前不可 dispatch。主 Agent 必须先生成 base→completion 的 exact changed-file
ledger，再把 Camera 移植文件与 R1b authority 文件逐项锁定；“由 diff 决定”不是交给 worker 的 broad
写权限。

**Interfaces:**
- Consumes: R1b `df9f674` 后续 Task 9/10 completion + Aurora commits `3d5fc02/854dbff`。
- Produces: Route V2 atomic cutover 和 locked Camera Profile/authoring preview 基线。

- [ ] **Step 1: fetch 并验证 R1b completion**

```bash
git fetch origin codex/r1b-integration
git log --oneline 1bf9f5d..origin/codex/r1b-integration
```

要求 completion docs/gates 明确 R1b Task 9/10 完成；否则记录 blocked，不修改 Camera、ExecutionPlan、
Compiler、Runtime 或 Browser 共享文件，只继续独立 package 的 Task 2–4。

- [ ] **Step 2: merge/rebase R1b 新提交并运行其门禁**

发生冲突时 R1b Route/Runtime/Browser V5 是权威，不保留 Route V1 fallback。

- [ ] **Step 3: 先写 Camera public-boundary RED tests**

断言 Runtime numeric overlay 不进入 Snapshot/Gameplay/Preset，locked Ref 请求可用，Preview 原子校验且隔离；profile heading/recenter/chase/flight 字段仍影响真实行为。

- [ ] **Step 4: 移植 Aurora 语义**

优先 cherry-pick 两个 camera commit；冲突必须按三方语义手工合并，禁止 choose-ours/theirs 覆盖 R1b。

- [ ] **Step 5: 验证并提交**

运行 R1b completion gates、focused camera tests、typecheck；提交 Route sync 和 Camera cleanup 可拆为两个提交。

---

### Task 6: 组合唯一 ExecutionPlanV5 与 Compiler

**Files:**
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile-v5.test.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/world-package/src/types.ts`
- Modify: `packages/world-package/src/manifest.ts`
- Modify: `packages/world-package/src/build-receipt.ts`
- Modify: WorldPackage manifest/build-receipt tests
- Modify: 所有 `ExecutionPlanV5.controlledEntityId` 消费者和 fixtures
- Regenerate: examples/artifacts 中 V5 snapshot/hash

Task 6 是 `main-agent-only` integration。R1b completion fetch 后先用 `rg` 解析出所有 V5 consumer、generator
与 golden 的 exact file ledger，并与 Task 5/7/8/9 排除重叠；不得把 `packages/apps/scripts/examples/
artifacts` broad glob 作为 worker ownership 或提交范围。

**Interfaces:**
- Consumes: 完整 R1b V5 + Task 2B data-only artifacts + Task 4 RuntimeHost。
- Produces: 只有一个含 `initialControlledEntityId + R1b fields` 的 V5，以及有 Package membership
  证据的 canonical `gameplay/bootstrap.json`。

- [ ] **Step 1: 写 unified V5 RED tests**

断言 exact shape 无 `controlledEntityId`，缺 authoring/resource/traversal/static/gameplay bootstrap lock
失败，只接受 IR V4；改 initial candidate 或 Bootstrap lock 改变 Plan hash但不改变 runtime possession。

- [ ] **Step 2: 修改 V5 类型和 Compiler 单向投影**

从 compiled V4 destructure `controlledEntityId: initialControlledEntityId`，保留 R1b全部字段/Hash；Plan
深冻结。Bootstrap 在 compile V5 前由 IR entity identity 与 trusted gameplay catalog/locks 构建；Compiler
只接收 exact canonical bootstrap lock。Bootstrap 不得包含 ExecutionPlan hash，避免 hash cycle。

- [ ] **Step 3: 更新消费者，不添加 alias**

Runtime bootstrap 只把 initial candidate 用于显式 `control.bind`；Route connectivity 的 traversing entity
不从它推断。Manifest 同步 clean-break 为 `initialControlledEntityId`，不保留 alias；
`ExecutionResourceKindV1` 只新增 `gameplay-bootstrap`。

- [ ] **Step 4: 重新生成制品并验证 Hash 链**

WorldPackage producer 把 canonical Bootstrap bytes 写入 `gameplay/bootstrap.json`，media type 为
`application/vnd.worldkit.gameplay-bootstrap+json`；Manifest resource row、file integrity 和 BuildReceipt
完整覆盖。closure replay 必须使用同一 Bootstrap lock 重新 compile，不能调用丢失该输入的旧
`compileWorldV5(world)`。Host 六方核验 BuildReceipt/root、Manifest row、artifact bytes hash、Bootstrap
semantic content hash 与 Plan lock；明确 bytes hash 与内部 semantic hash 不是同一个 hash 域。
只运行 generator/verify 命令，不手改 hash。运行 Compiler、Route V2、WorldPackage membership/closure tests。

- [ ] **Step 5: 提交**

```bash
git add <Task-6-exact-file-ledger>
git commit -m "refactor: compose gameplay bootstrap into execution v5"
```

---

### Task 7: 接入 Babylon Gameplay Port、Possession、Action 与 Camera transaction

**Files:**
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify/Create: `packages/runtime-babylon/src/gameplay-world-adapter.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/runtime-babylon/src/traversal-runtime-port.test.ts`
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`

**Interfaces:**
- Consumes: Task 4 port、Task 5 Camera/Route、Task 6 Plan。
- Produces: committed possession/action 的唯一物理/视觉投影。

- [ ] **Step 1: 写 bind/rebind/release RED integration tests**

证明 A→B 即时转移 input/snapshot/camera；released Subject 只收 neutral input但 Havok/support继续；release 后 Camera suspended/frozen且 Snapshot无 target。

- [ ] **Step 2: 实现 control transaction**

Prepare 构造隔离的 projected World/View state，不改变 live input/camera/render。`commitPrepared()` 只做
同步 no-throw pointer swap；`abort()` 逆序释放 staged resources。render/capture 按 published epoch gated，
不能看到 Gameplay 已新而 Camera 仍旧或反之。

- [ ] **Step 3: 写 Action RED tests**

证明 logical Action 与 rendered Action 分相、movement blocking 不冻结 physics/camera、fixed duration跨分段 tick自然完成、30/60/120 render cadence一致。

- [ ] **Step 4: 实现 Action projection**

只保存 committed semantic Action projection；下一 fixed tick映射锁定动画；自然 locomotion仍从 motion sample解析。

- [ ] **Step 5: 补 Camera staged-abort 对抗测试**

覆盖 target/profile/modifiers/offsets/base heading/velocity-recenter history/transition/input edge/preview map；
abort 后 byte-equivalent inspection state；30/60/120Hz render 与 capture 都只能观察完整 published epoch。

- [ ] **Step 6: 运行 Runtime 深审门禁并提交**

```bash
pnpm vitest run packages/runtime-babylon/src/runtime.test.ts packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts
pnpm typecheck
git commit -am "feat: project gameplay through babylon runtime"
```

---

### Task 8: 发布 Browser Protocol V5 与原子 Reset/Rebind

**Files:**
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `scripts/lib/simulation-take-runner.ts`
- Modify: `scripts/lib/simulation-take-runner.test.ts`
- Modify: `scripts/lib/simulation-take-cli.ts`
- Modify: Simulation Take CLI tests，completion fetch 后先以 `rg` 锁定 exact paths
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `scripts/verify-g-bot-subject-world.ts`
- Modify: `scripts/verify-rigged-subject-world.ts`
- Modify: `scripts/verify-placement-layout.ts`

**Interfaces:**
- Consumes: R1b Route Evidence V2、Task 2–7。
- Produces: 单一 `WorldkitBrowserApiV5` 与 `WorldRuntimeSnapshotV4`。

- [ ] **Step 1: 写 exact Browser V5 RED tests**

Enumerable key 精确包含 Gameplay command/event/activity/capture/camera preview/4 Route getters，以及
`getWorldStateSnapshot`；明确不含 `bindControl`、V4、Route V1和 runtime camera numeric overlay。
`getGameplayEvents` query 固定 `{ afterEventSequence, maximumEventCount }`，result 固定
`{ events, nextAfterEventSequence, hasMore }`；覆盖 exclusive cursor、空页 cursor、分页、unknown key 和
unsafe count。

- [ ] **Step 2: 实现 V5 contract/api**

`executeGameplayCommand` 返回 V1 Receipt；`getWorldStateSnapshot({ worldStateRef })` 只返回当前或 retained
canonical artifact，未知、跨 Session 或已释放 Ref fail closed；Route getter原样返回 trusted V2 DTO；
Snapshot分离 world/view/runtime status并移除 provider/root controlled truth。
生成 `acquireRuntimeActivity/releaseRuntimeActivity` wire：request 使用 schemaVersion/id/activityKind/
expectedWorldSessionId，Host 派生 payload hash；receipt 返回 request/session/epoch/status。changed-payload、
capacity、dispose termination 与迟到 release 均走稳定 Diagnostic/幂等语义。

- [ ] **Step 3: 写 Reset RED tests**

按键保持时 reset：新 worldSession、tick 0、显式 bind committed、首次 render 后 Promise才 resolve；并发 getSnapshot稳定抛 `WORLDKIT_RUNTIME_RESET_IN_PROGRESS`；bind失败不发布 ready。

- [ ] **Step 4: 实现 Playground reset policy**

Host reset保持 generic unbound；Playground在同一 mutation barrier执行 bind initial candidate，清输入并等待 render。Workbench preview只在 bind committed后重放。

- [ ] **Step 5: 保留 Authoring V4/Route fail-closed loader**

不采用 #19 loader；只把 RuntimeHost 接到现有 compileWorldV5/Route publication路径。

- [ ] **Step 6: 迁移 Simulation Take、Capture 与 verifier 调用方**

`SimulationTakeBrowserDriverV1` 删除 `bindControl`，改用
`executeGameplayCommand(control.bind)`。Runner 在任何 bind/input/capture 前 acquire `simulation-take`，在
`finally` release；单帧 capture 由 Browser adapter 自动持有短 `control-capture` lease，Take 内嵌 capture
允许同 Session 非互斥重叠。覆盖 capture Promise pending 时 reset/replace 拒绝、dispose cancel/join、
迟到 release 幂等、失败路径 finally release。对 `bindControl` 做全仓 consumer census；上述 verifier
全部迁移到 command path，不留 Browser public 旁路。

- [ ] **Step 7: 验证并提交**

运行 runtime-contracts、browser-api、authoring-loader、runtime-host、Simulation Take、两项 Capture verifier、
Route Evidence tests与 typecheck。

---

### Task 9: 统一 Outdoor playable runtime 并隔离 artifact lifecycle

**Files:**
- Port/Rework from PR #19: `apps/playground/src/playground-runtime-route.ts`
- Port/Rework: `apps/playground/src/gameplay-page-lifecycle.ts`
- Port/Rework: `apps/playground/src/artifact-renderer-lifecycle.ts`
- Port/Rework: outdoor import/loader/fixtures/tests
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `apps/playground/src/main.ts`
- Create: `scripts/verify-outdoor-gameplay.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 当前 Compiler V5、RuntimeHost、Browser V5。
- Produces: 六个 Outdoor Scene 统一 Gameplay runtime；artifact-only 保持隔离。

- [ ] **Step 1: 写 route/lifecycle RED tests**

覆盖 authoring、catalog gameplay、artifact-only、unknown scene；partial load/mount/setup/dispose throwing cleanup exactly-once。

- [ ] **Step 2: 移植路由与 lifecycle helpers**

只移植 #19 的职责分离，不移植旧 Authoring/ExecutionPlan 数据；outdoor scene 必须确定性编译为当前 V5。

- [ ] **Step 3: 写 Browser smoke RED tests**

每个 scene ready、移动、reset、Route query；artifact页面截图且无 RuntimeHost/`__WORLDKIT__`；unknown fail closed。

- [ ] **Step 4: 实现 verifier 并运行真实 Chromium**

保存每个场景结构化结果和 screenshot path；不能只断言 DOM 文案。

- [ ] **Step 5: 提交**

```bash
git add apps/playground scripts package.json pnpm-lock.yaml
git commit -m "feat: unify outdoor gameplay runtime"
```

---

### Task 10: 全维审查、Cursor CR、修复与交付

**Files:**
- Create: `docs/reviews/2026-08-24-gameplay-framework-r1b-integration-review.md`
- Modify: design/plan status and README/progress entries only when implementation evidence supports them

**Interfaces:**
- Consumes: Tasks 1–9 commits。
- Produces: disposition、完整 gate evidence、可审查远端分支。

- [ ] **Step 1: 主 Agent 按两个 review checklist 自审**

使用 `docs/reviews/full-dimension-review-protocol.md` 和 `runtime-deep-review-checklist.md`，逐项记录 P0–P3、复现、修复/拒绝/延期。

- [ ] **Step 2: 子智能体 whole-branch review**

分别覆盖公共合同/AI naming、Runtime authority/physics/camera、R1b/Browser/outdoor；主 Agent 复核实际 diff 和每条 finding。

- [ ] **Step 3: Cursor code review**

使用 project-local `reviewing-with-cursor`，新 code review ID，要求 GO/NO-GO + P0–P3；只修复独立复现成立项，同一 ID scoped re-review。

- [ ] **Step 4: 跑完整门禁**

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:control-capture
pnpm verify:validation-capture
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:outdoor-gameplay
```

- [ ] **Step 5: Cursor final review**

使用新的 final review ID；所有 P0/P1 和成立 P2 必须 disposition，不能复用 code chat。

- [ ] **Step 6: 更新 review disposition、提交并推送集成分支**

```bash
git status --short
git log --oneline origin/codex/r1b-integration..HEAD
git push -u origin codex/pr19-gameplay-r1b-integration
```

- [ ] **Step 7: main 集成门禁**

若 PR #24 已独立合入 main：同步最新 main、三方语义合并、重跑 Step 4/5 后按用户授权合入并 push main。

若 PR #24 仍为 Draft/未合：不得借本分支越过其评审；交付已完成远端分支和明确的单一 blocker，等待 R1b 合入后只执行最终同步门禁。
