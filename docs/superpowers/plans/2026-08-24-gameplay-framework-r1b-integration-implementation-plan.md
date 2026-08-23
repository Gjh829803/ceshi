# Gameplay Framework 与 Route R1b 融合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在最新 Route R1b 上实现 provider-neutral、事务化、可扩展的 Gameplay Framework，并通过 Browser Protocol V5 把 Gameplay、Route Evidence、Camera 与 Outdoor runtime 统一到一条可验证路径。

**Architecture:** 以 `RuntimeHost → WorldSession → GameplayMode/State → GameplayWorldPort → Babylon` 为运行时骨架；`possessedBy` 是唯一控制权真相，Route 保持只读派生查询，Camera 保持独立 View owner。公共 wire contract 使用关闭 V1 union，ExecutionPlan 保留 R1b V5 全部字段并 clean-break 重命名初始控制候选。

**Tech Stack:** TypeScript 5.9、Vitest 3.2、Babylon.js 9.21.2、Havok 1.3.14、Vite 7、pnpm workspace、Playwright/Chromium verification。

**Spec:** `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md`

## Global Constraints

- 实施基线是 `origin/codex/r1b-integration@1bf9f5d`；共享 Runtime/Browser 接线前必须 fetch 并吸收 R1b Task 5–10 completion HEAD。
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

---

### Task 1: 冻结设计、基线与执行账本

**Files:**
- Create: `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md`
- Create: `docs/superpowers/plans/2026-08-24-gameplay-framework-r1b-integration-implementation-plan.md`
- Create: `.superpowers/sdd/2026-08-24-gameplay-framework-r1b-integration-implementation-plan/progress.md`（git ignored）

**Interfaces:**
- Consumes: R1b `1bf9f5d`、PR #19 `faab0fd`、Aurora `854dbff`。
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
- `worldStateHash` 排除 artifact/session identity 和自身，包含 Tick、WorldPackage/ExecutionPlan
  Hash、五类 State Map 与 `lastEventSequence`；跨 Session 相同语义状态 hash 相同，任何 hash 域
  字段被篡改都拒绝。

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
  maximumIdempotencyRecordCount: 4096,
  maximumRetainedReceiptCount: 4096,
  maximumRetainedEventCount: 8192
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

- [ ] **Step 1: 写 Possession State 的失败测试**

覆盖 bind/release/rebind、stale `expectedPossession`、一 Controller 多目标、一目标多 Controller、输入顺序确定性、Participant→Controller 单向归属和 commit 前后 snapshot/hash。

Expected production mutation caught: 若 Controller 自带 target 或同一目标允许两个 Controller，测试失败。

- [ ] **Step 2: 实现最小 GameplayState control planning/commit**

Planning 不改变 State，返回判别 Transition Plan；commit 校验 revision，提交 `possessedBy`，使用关系 map 为唯一事实。

- [ ] **Step 3: 写 FeatureManager/Dispatcher 的失败测试**

覆盖 dependency cycle、missing feature/capability、duplicate ref/handler、稳定拓扑顺序、activation throw、reverse cleanup、cleanup aggregation 与单命令单 handler。

- [ ] **Step 4: 实现 FeatureManager/Dispatcher**

Function-bearing Feature 仅 package-private；公共 manifest 使用 Ref/version/hash/budget，Host 注入 factory。

- [ ] **Step 5: 写 Action Catalog/State 的失败测试**

覆盖 unknown/duplicate `semanticActionRef`、hash/request mismatch、exclusive-per-subject、movement blocking、fixed-duration、explicit cancel、retired execution ID、natural completion 无 commandId、容量 N/N+1。

- [ ] **Step 6: 实现通用 Semantic Action Feature**

不得硬编码 `dance.rumba`/`emote.salute`；Action Definition 从 WorldSession 构造参数注入并冻结。

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
- Consumes: Task 2/3 contracts；暂时消费 R1b 当前 `ExecutionPlanV5`，字段读取集中在一个 helper，Task 6 切换 `initialControlledEntityId`。
- Produces: RuntimeHost/WorldSession lifecycle、serialized barrier、idempotency、capacity reservation、transaction rollback、Runtime Run lease。

- [ ] **Step 1: 写 WorldSession transaction RED tests**

覆盖 parse before mutation、prepare failure、commit failure+rollback、rollback failure→failed Receipt/Session、logical commit revision conflict、event sequence、same ID replay/different payload conflict。

- [ ] **Step 2: 实现窄 `GameplayWorldPortV1`**

端口只允许 subject query、Action availability、`prepareGameplayTransition`、fixed input/tick、snapshot、capture、dispose；不出现 provider 名和 Handle。

- [ ] **Step 3: 实现 WorldSession barrier/transaction**

顺序严格为 parse → identity/capacity/admission → pure plan → adapter prepare/commit → logical commit → canonical WorldState → Event/Receipt。Failed Receipt 与 Session phase 按 Spec 区分。

- [ ] **Step 4: 写 RuntimeHost lifecycle RED tests**

覆盖两个 Host 隔离、new WorldSession ID、重复 ID 拒绝、reset 默认 unbound、旧命令 stale、active run 阻止 replace、partial create、throwing cleanup、double dispose、reset/dispose race。

- [ ] **Step 5: 实现 Host 注入与 replacement**

Host options 必须注入 Mode factory、Feature factories、Action definitions、Capacity budget、Adapter factory 和 ID factory；禁止硬编码 Core Features/Action。

- [ ] **Step 6: 写容量/retention RED tests 并实现**

每个预算 N 成功、N+1 在 Adapter prepare 前拒绝；不淘汰幂等/Receipt/Event 记录继续运行。

- [ ] **Step 7: 验证并提交**

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

**Interfaces:**
- Consumes: Cursor R1b Task 5–10 completion + Aurora commits `3d5fc02/854dbff`。
- Produces: Route V2 atomic cutover 和 locked Camera Profile/authoring preview 基线。

- [ ] **Step 1: fetch 并验证 R1b completion**

```bash
git fetch origin codex/r1b-integration
git log --oneline 1bf9f5d..origin/codex/r1b-integration
```

要求 completion docs/gates 明确 Task 5–10 完成；否则记录 blocked，不修改 Camera、ExecutionPlan、
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
- Modify: 所有 `ExecutionPlanV5.controlledEntityId` 消费者和 fixtures
- Regenerate: examples/artifacts 中 V5 snapshot/hash

**Interfaces:**
- Consumes: 完整 R1b V5 + Task 4 RuntimeHost。
- Produces: 只有一个含 `initialControlledEntityId + R1b fields` 的 V5。

- [ ] **Step 1: 写 unified V5 RED tests**

断言 exact shape 无 `controlledEntityId`，缺 authoring/resource/traversal/static 字段失败，只接受 IR V4；改 initial candidate 改变 Plan hash但不改变 runtime possession。

- [ ] **Step 2: 修改 V5 类型和 Compiler 单向投影**

从 compiled V4 destructure `controlledEntityId: initialControlledEntityId`，保留 R1b全部字段/Hash；Plan 深冻结。

- [ ] **Step 3: 更新消费者，不添加 alias**

Runtime bootstrap 只把 initial candidate 用于显式 `control.bind`；Route connectivity 的 traversing entity 不从它推断。

- [ ] **Step 4: 重新生成制品并验证 Hash 链**

只运行已有 generator/verify 命令，不手改 hash。运行 Compiler、Route V2、WorldPackage tests。

- [ ] **Step 5: 提交**

```bash
git add packages apps scripts examples artifacts pnpm-lock.yaml
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

Prepare 捕获 previous projection/input/camera state；commit 清旧输入、写 possession projection、retarget/suspend；rollback 恢复全部状态。

- [ ] **Step 3: 写 Action RED tests**

证明 logical Action 与 rendered Action 分相、movement blocking 不冻结 physics/camera、fixed duration跨分段 tick自然完成、30/60/120 render cadence一致。

- [ ] **Step 4: 实现 Action projection**

只保存 committed semantic Action projection；下一 fixed tick映射锁定动画；自然 locomotion仍从 motion sample解析。

- [ ] **Step 5: 补 Camera rollback adversarial tests**

覆盖 target/profile/modifiers/offsets/base heading/velocity-recenter history/transition/input edge/preview map；rollback 后 byte-equivalent inspection state。

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

**Interfaces:**
- Consumes: R1b Route Evidence V2、Task 2–7。
- Produces: 单一 `WorldkitBrowserApiV5` 与 `WorldRuntimeSnapshotV4`。

- [ ] **Step 1: 写 exact Browser V5 RED tests**

Enumerable key 精确包含 Gameplay command/event/run/capture/camera preview/4 Route getters；明确不含 `bindControl`、V4、Route V1和 runtime camera numeric overlay。

- [ ] **Step 2: 实现 V5 contract/api**

`executeGameplayCommand` 返回 V1 Receipt；Route getter原样返回 trusted V2 DTO；Snapshot分离 world/view/runtime status并移除 provider/root controlled truth。

- [ ] **Step 3: 写 Reset RED tests**

按键保持时 reset：新 worldSession、tick 0、显式 bind committed、首次 render 后 Promise才 resolve；并发 getSnapshot稳定抛 `WORLDKIT_RUNTIME_RESET_IN_PROGRESS`；bind失败不发布 ready。

- [ ] **Step 4: 实现 Playground reset policy**

Host reset保持 generic unbound；Playground在同一 mutation barrier执行 bind initial candidate，清输入并等待 render。Workbench preview只在 bind committed后重放。

- [ ] **Step 5: 保留 Authoring V4/Route fail-closed loader**

不采用 #19 loader；只把 RuntimeHost 接到现有 compileWorldV5/Route publication路径。

- [ ] **Step 6: 验证并提交**

运行 runtime-contracts、browser-api、authoring-loader、runtime-host、Route Evidence tests与 typecheck。

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
