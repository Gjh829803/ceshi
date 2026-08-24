# Workspace 结构与权威边界审查

> 状态：**Point-in-time review / non-authoritative**
>
> 审查对象：`main@4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5`
>
> 用途：记录该快照上的结构、权威和验证边界，不替代当前 Schema、冻结 Spec、`AGENTS.md` 或交付状态文档。
>
> 结论：**GO with findings**。未确认 P0；存在需要在大规模搬目录前处理的 P1/P2。

## 1. 审查元数据与适用范围

- 日期：2026-08-24。
- 审查模式：**C（整仓审计）**，覆盖结构、公共合同 owner、事实源、Workspace 依赖、门禁和制品通道。
- 开发分支：`cursor/workspace-structure-audit-ad0d`。
- Draft PR：[#27](https://github.com/seedleap/agent-whitebox-world-sdk/pull/27)。
- Cursor 原始报告提交：`c924b37`；第一次对抗修订：`1b8487b`。
- 本次修订输入：Cursor 报告、Codex 主审、三路只读复核、用户补充的 ChatGPT 架构分析。外部分析只作为线索；只有回到指定 Git 快照、冻结合同或实测命令的内容才进入最终 finding。
- 相对 `4ae1912`，本 PR 的 committed 变更只应包含本报告；审查过程中出现的未跟踪文件不属于本 PR，也不得被顺带提交。

### 1.1 Authority hierarchy

不存在一条简单的“后者覆盖前者”规则。权威按作用域划分：

| 作用域 | 权威来源 | 非权威或派生来源 |
|---|---|---|
| 仓库流程、阶段边界、命名纪律 | `AGENTS.md` | README、reviews、临时计划 |
| 已冻结领域合同 | 对应 Frozen Spec + Canonical Schema + conformance test | 架构展示、讨论稿 |
| 当前交付状态 | [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)，但必须带可复跑证据 | 旧验证计数、历史 review |
| 分层解释 | [`docs/02-sdk-architecture.md`](../02-sdk-architecture.md) | 架构站快照 |
| Onboarding 与调用示例 | README、[`docs/17-canonical-json-quickstart.md`](../17-canonical-json-quickstart.md)，内容必须由上述权威派生 | 不得自行拥有协议版本或 Roadmap 状态 |
| 历史证据 | `docs/reviews/**`、`docs/superpowers/plans/**` | 不拥有当前能力真相 |

### 1.2 快照漂移

本报告继续审查用户指定的 `4ae1912`，不把后续分支状态倒灌成该快照事实。

2026-08-24 复核时，`origin/main` 与 `origin/codex/pr19-gameplay-main-integration-v2` 已共同前进到 `1df2fac`；相对 `4ae1912` 新增了 Gameplay Contracts、Gameplay、Runtime Host、Babylon Gameplay Port 与相关预接入文档，约 25k 行变更。因此：

- “G19 三个包在本树不存在”只描述 `4ae1912`；不能作为当前 `main` 的行动项。
- 本文仍可作为历史快照证据，但不能直接宣称是 `1df2fac` 的当前整仓审计。
- 若要把本文转成当前实施 Backlog，必须另做 `4ae1912..1df2fac` 漂移复验；不能只 rebase 后沿用旧 finding。

## 2. 执行证据与限制

### 2.1 Cursor 原始只读检查

Cursor 原始报告完成了目录 census、协议版本搜索、旧审计复验和 Babylon `9.21.2` 安装源核对。原报告命令表中两条“`rg` exit 0 且无匹配”记录不成立，现校正为：

| 命令 | exit | 结论 |
|---|---:|---|
| `rg -n 'humanoid\.g-bot\.ground' packages apps assets/registry examples scripts` | 1 | 当前产品源码路径无匹配；历史文档仍可能保留旧名字 |
| `rg -n 'Beta_Joints\|Beta_Surface' packages apps assets/registry examples scripts` | 1 | 当前产品源码路径无匹配；不等于全 Git 历史或二进制资产无该字符串 |

### 2.2 Codex 独立复核

| 命令 | exit | 证据 |
|---|---:|---|
| `pnpm typecheck` | 0 | 当前 `4ae1912` 代码树通过 TypeScript gate |
| `pnpm test` | 1 | 147 files passed、2 failed；1587 tests passed、2 failed |
| `pnpm vitest run scripts/worldkit-route-run.integration.test.ts --maxWorkers=1 --minWorkers=1` | 1 | Host readiness 在 75 秒内未就绪 |
| `pnpm vitest run scripts/lib/route-validation-runner.test.ts -t "runs the frozen V4/V5 fixture through Recast and real Babylon/Havok" --maxWorkers=1 --minWorkers=1` | 1 | 测试预算 120 秒超时；不是仅由全量并发造成 |
| `pnpm vitest run packages/protocol/src/canonical-json.test.ts packages/world/src/scene.test.ts apps/playground/src/authoring-loader.test.ts packages/subject-registry/src/capability-registry.test.ts --maxWorkers=1 --minWorkers=1` | 0 | 4 files / 65 tests 通过；支持 overlay/scene finding 的撤回和 Catalog/Canonical JSON 现状复验 |
| `pnpm worldkit registry describe --resource-ref worldkit://control-feel-profile/humanoid.medium-ground@1 --json` | 2 | CLI 对 Registry 可解析的现行 Capability 资源误报 `REGISTRY_RESOURCE_NOT_FOUND` |
| `git diff --check 4ae1912...1b8487b` | 0 | Cursor 原始文档 diff 无 whitespace error |

没有运行会刷新 tracked `artifacts/examples/**` 的 `verify:*`。这是本报告确认的问题之一，不应把“未跑”伪装成 gate 通过。

本审查没有完成 rendered visual evidence、手工交互、30/60/120 Hz 对抗运行或生产发布验证；不得据此宣称 Runtime release-ready。

## 3. 结论先行

Workspace 的基础分层方向成立，生产依赖图未发现环。以下边界是合理层次，不应为了目录更少而合并：

- `authoring → compiler → runtime-contracts → runtime-babylon`；
- `traversal` 与 `traversal-recast`；
- `world` 与 `world-package`；
- `subject-actions` 与 `animation`；
- `subject-composition` 与 `subject-registry`；
- Canonical Babylon/Havok 与 Legacy Three/Rapier 的迁移期双栈。

当前最大的结构问题不是“包太多”，而是：

1. 公开事实和版本在代码、文档、Registry 视图和 tracked evidence 中分叉；
2. package exports、manifest、tsconfig 与真实 import graph 不一致；
3. `scripts/` 已成为隐式 Host/CLI 产品模块，却不在 workspace graph 中；
4. `verify`、golden update 与完整 gate graph 没有清楚分权；
5. 多个公共合同或 vocabulary 没有唯一 owner。

因此结论是 **结构方向 GO，直接大搬家 NO-GO**。先修事实源、gate 和 owner，再迁目录；版本 facade 与 Legacy 退役最后处理。

## 4. 最终 Findings

优先级表示缺陷影响，不表示 Roadmap 战略重要性。P0 只用于已确认会在当前交付路径造成静默错误、数据损坏或安全事故的缺陷；尚未证明进入已交付路径的冻结合同偏差按 P1 处理。“下一步很重要”不能因此标为 P0。

### 当前无开放 P0

旧审计中的 spawn 高度双加、Canonical spawn 期第二套 grounding、假 `1/60` 推 Camera 等问题在 `4ae1912` 未复现。下列问题从 P1 起。

---

### [P1] [D2/D3/D6] 当前事实源分裂：Browser V5，文档与 Placement evidence 仍写 V4

**Disposition：Codex confirmed，并扩充 Cursor 证据。**

- `packages/runtime-contracts/src/runtime-session.ts:354-365` 定义 Browser Protocol V5。
- `scripts/verify-placement-layout.ts:673-679` 硬编码 `browserProtocol: 4`。
- tracked `artifacts/examples/placement-coastal-world/verification.json` 同样发布 V4。
- `docs/00`、`docs/02`、`docs/05`、`docs/17` 仍有 V4、R1b/M5 开放口径；`docs/18` 已写 V5、R1b/M5 关闭。
- Placement verifier 检查了 Browser 对象键，但没有把实测 `api.version` 与 `WORLDKIT_BROWSER_PROTOCOL_VERSION` 对拍。

影响不是文案瑕疵：Agent、CLI consumer 和审计制品会获得不同的公开协议事实。

最小修复：以运行时常量或一份机器可读 capability/status manifest 为唯一版本源；Browser capture 实测并断言版本；定向刷新 Placement golden；README/Quickstart 只引用，不再手写版本和 gate 列表。`docs/18` 中带日期的旧计数应降为历史证据，而不是另开一个当前事实块。

### [P1] [D2/D3] Registry CLI 与 Browser 不是同一资源发现权威

**Disposition：Codex confirmed；Cursor 原报告遗漏。**

- `packages/subject-registry/src/types-v3.ts:360-370` 同时暴露 legacy `listResources()` 与 Capability `listCapabilityResources()`。
- `scripts/worldkit.ts:651-656` 对非 Subject 的 `registry describe` 只查 `listResources()`。
- `apps/playground/src/worldkit-browser-api.ts:613-630` 从 Capability 视图发现 Motion/Profile 资源。
- 实测现行 `control-feel-profile` 在 Registry resolver 与 Capability list 中存在，但 CLI 返回 not-found / exit 2。

最小修复：由 Registry 提供唯一 closed-kind `resolveResource(ref)` 与稳定排序的 `listDiscoverableResources(filter)`；CLI、Browser、Closure builder 都消费它。Legacy projection 保留为显式迁移 API，不能继续充当通用 discovery backend。

### [P1] [D2/D5] Canonical 生产不变量由 `testkit` 所有

**Disposition：Codex confirmed，并从 Cursor P2 升为 P1。**

- README 将 `packages/testkit` 定义为仅测试/门禁。
- `packages/compiler/package.json:9-16` 和 `packages/world/package.json` 把 `@whitebox-world/testkit` 列为生产依赖。
- `packages/compiler/src/compile.ts:18-22` 与 `packages/world/src/scene.ts` 的生产路径调用 `validateSpawnSafety()`。
- `testkit` 又依赖 Legacy `contracts`。

这使 Canonical compile admission 由测试命名、Legacy 归属的包拥有。最小修复不是复制算法，而是把 spawn safety、finite transform、feature ownership 等确定性不变量迁到低层生产合同包；保持 diagnostic code、路径、顺序和 Hash 不变。

### [P1] [D2] 同名 SubjectPreset Closure 有两个公共 owner

**Disposition：Codex confirmed；Cursor 原报告遗漏。**

- `packages/subject-registry/src/subject-preset-closure.ts:10-23` 的 `SubjectPresetResourceLockEntryV1.resourceKind` 是闭合 Registry kind。
- `packages/runtime-contracts/src/subject-preset.ts:11-24` 导出同名类型，但 `resourceKind: string`。
- 两者都从 package root 导出，目前依赖 TypeScript 结构兼容穿透，不能证明 wire contract 与 Registry closure 一致。

最小修复：选择一个不会制造 `runtime-contracts ↔ subject-registry` 环的低层 contract owner，另一侧只导入或显式投影；增加 exact-key 与 closed-kind conformance。不要把所有领域合同集中进一个新的 `shared` 巨包。

### [P1] [D2/D6] Canonical JSON 对 `-0` 的行为违反冻结字节协议

**Disposition：Codex confirmed；Cursor 原报告遗漏。**

- 冻结 Spec `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md:2120-2125,2208` 要求解析和 Golden Fixture 拒绝 `-0`。
- `packages/protocol/src/canonical-json.ts:27-34` 把程序内 `-0` 静默归一成 `0`。
- `packages/protocol/src/canonical-json.test.ts:62-67` 反向锁定了接受行为。
- `packages/authoring/src/parse.ts:56-100` 没有拒绝 JSON 负零字面量。

这不是目录问题，但必须在结构迁移前关闭，否则同一 Hash/identity 可接受规范禁止的输入。修复需要 parser、canonicalizer、Golden fixture 与所有 Hash conformance 同步，不能只改测试期望。

### [P1] [D2] Plan-first Opening Shot 暴露第二套无单位 Camera 方言

**Disposition：Codex confirmed，并从 Cursor P2 升为 P1。**

- `packages/world/src/world-spec.ts:141-147` 使用 `distance` / `targetHeight`。
- Canonical Authoring / ExecutionPlan 使用 `distanceMeters` / `targetHeightMeters`。
- `docs/03` 示例继续传播无单位字段。

这直接违反公共 AI Schema 的一词一义和单位入字段名规则。它是未发布 DSL 的 clean break，但必须原子更新 WorldSpec、scene plans、示例、测试和 Host freeze 流程；不得手改 `plan-lock.json` 或增加永久 alias。

### [P1] [D3] Motion/Subject Catalog 的现行资源引用与能力声明不闭合

**Disposition：Cursor finding modified。**

Cursor 把 `water-surface runtimeStatus: implemented` 本身判成错误，结论过度。Runtime 确有实验 K06 分支和 focused tests；Compiler 拒绝 production water 是当前阶段的 admission 边界。

确认的问题是：

- 多个 `parameterSchemaRef` 指向不存在的 `motion-parameter-schema` Registry 资源；
- 推荐级 K01 仍声明支持 water；
- 部分 Subject Definition 的能力描述与实际锁定 Motion Profile 不一致；
- Motion catalog 的参数名与 Feel/Physics owner 边界缺少机器校验。

最小修复是修 capability availability、锁定 Profile 和 dangling Ref，并建立“每个 public `...Ref` 均可 resolve”的 conformance；不要为了第一切片删除已有实验实现或 `ExecutionMovementMediumV1` vocabulary。

### [P1] [D6] `verify` 会更新 tracked golden，且当前完整 gate 不健康

**Disposition：Codex confirmed；Cursor 原报告只看到了脚本重叠。**

- `verify:canonical`、`verify:placement-layout`、`verify:rigged-subject`、`verify:g-bot-subject` 成功后都调用 `scripts/lib/artifact-directory-promotion.ts:53-107` 替换 tracked `artifacts/examples/**`。
- `vitest.config.ts:5` 只收 `.test.ts`，默认遗漏 `apps/playground/vite.config.test.mjs`；Studio 与 Site 的 `.test.mjs` 也不在根 suite。
- 根没有 aggregate `check:*` 或 tracked CI 定义。
- 本次 `pnpm test` 的两项真实 Host/Havok/Recast 集成用例在单 worker 下仍超时。

最小修复：

1. `verify:* --check` 只在临时目录生成和比较；
2. `artifacts:update:*` 才能显式刷新 golden；
3. 定义 `check:fast / check:integration / check:browser / check:full`；
4. Havok/Recast/Playwright 子进程进入限并发的独立 lane；
5. CI check 结束时执行 `git diff --exit-code`。

保留 plan-lock、scene artifacts、tri-view 和 Golden fixture；问题是 producer/update 权限，不是这些制品存在。

---

### [P2] [D5] package exports、manifest 与真实 import graph 不一致

**Disposition：Codex confirmed，并扩大 Cursor 范围。**

- 多个生产模块穿透 sibling `src`，包括 `subjects → contracts/camera/animation`、`camera/animation → contracts`、`runtime-babylon → subject-registry` 与多个 `scripts/lib → packages/*/src`。
- 23 个 workspace 的测试直接导入 Vitest，但各自 manifest 不声明；Compiler 测试还有未声明的 workspace import。
- Playground 仅测试使用的 `testkit` 位于 production dependencies。
- 根 `tsconfig.json:14-17` 同时向所有 packages/apps/scripts 注入 DOM、Node 和 Vitest；workspace 内没有独立 tsconfig。

先加 import/manifest boundary gate，再修 specifier 和 direct dependency；之后从 leaf packages 开始引入 `tsconfig.base + library/browser/node/test` 环境配置。不要一上来机械生成二十多份配置。

### [P2] [D5] `scripts/` 已是隐式 Host/CLI 产品模块

**Disposition：Codex confirmed；Cursor “维持现状”建议被修改。**

- `scripts/worldkit.ts` 已是 1435 行完整 CLI composition root。
- `apps/playground/vite.config.mjs:5-16` 反向导入四个 `../../scripts/lib/*.ts` Host 模块。
- `scripts/lib` 承担事务发布、Composition Gate、Route orchestrator、server、validation、take、preset 等长期职责，却没有 package、直接依赖或类型环境边界。

迁移顺序应是先提取 App 已消费的 provider-neutral Host 原语到正式 package，再把 CLI 编排提升为 `apps/worldkit-cli`；根 `scripts/worldkit.ts` 暂时保留薄 wrapper，stdout JSON、exit code、参数和 repo-root 解析必须不变。

### [P2] [D5] `packages/world` 的 provider-neutral 出口会加载 Three 实现

**Disposition：Codex confirmed。**

`packages/world/src/index.ts` 通过 `export *` 暴露 `terrain.ts`，后者顶层导入 Three；Route verifier 只需要 Canonical projection，却通过根 barrel 进入 provider 实现。最小修复是增加窄的 provider-free subpath/export；不需要先拆整个包，也不能把 Three/Recast 类型抬进 AI Schema。

### [P2] [D2/D5] Schema、TS wire type 与 validator table 缺少 source/generated 边界

**Disposition：Codex confirmed；Cursor 原报告遗漏。**

Authoring V3/V4 JSON Schema、TS wire type、AJV formats、WorldPackage field table/canonical reconstruction 都由多份手写结构维护；仓库没有 `generated/` 或 `check:generated`。四个 verifier 还各自声明 `WorldBuildArtifactV3` 并以 `JSON.parse(...) as` 消费。

应在每个领域 owner 内选择一个 source of truth，生成或机械校验 wire type、field table、validator scaffolding；过渡 `WorldBuildArtifactV3` 先建立私有 exact parser/producer owner，不得冒充正式 WorldPackage Root。

### [P2] [D2] Action/Bone/Topology vocabulary 被多个包手抄

**Disposition：Cursor “25 actions 应缩成 4 个”被修改。**

`GroundHumanoidActionIdV1` 在 `subject-actions`、`subject-registry`、`runtime-contracts` 三处平行定义；Biped Bone 与 Body Topology 也在 Registry/Execution 重复。当前 automatic locomotion resolver 只选择 idle/walk/run/jump，不等于产品 AnimationSet 只能包含四个 action。

正确修复是唯一 vocabulary owner或生成式 conformance，并为 automatic resolver 返回值定义窄 subset；不要删除其余资产映射，也不要把“暂时不可自动选择”误写成“协议非法”。

### [P2] [D1/D5] Canonical/Legacy 共用一个 Playground composition root

**Disposition：Cursor P1 降级。**

双栈是明确迁移事实；`AGENTS.md:81-84` 已规定 `pnpm dev:g-bot` 是 Canonical 产品入口，`pnpm dev` 只用于 Legacy/catalog，并禁止 plain `pnpm dev + ?authoring=1`。因此直接把根 `dev` 改指 Canonical 会改变现行政策，不是本 finding 的最小修复。

合理的结构步骤是把 2000+ 行入口收成 bootloader + canonical/legacy composition modules，在 UI 明示 backend；是否更改默认命令或拆成两个 app，需要独立产品决策并同步 AGENTS、README 与自动化。

### [P2] [D3/D5/D6] 文档生命周期与 Architecture Site 缺少 provenance

**Disposition：Codex confirmed，但修改修法。**

- 编号文、specs、plans、reviews 混合 current/history/evidence 状态；`docs/10-current-experiments.md` 已过期仍被当当前入口。
- `sites/world-sdk-blueprint` 是 workspace 外独立 npm 工程，README 仍是 starter。
- Site 测试硬编码 legacy build 的 hashed JS/CSS；同一 3 MB architecture PNG 以相同 SHA 跟踪三份；没有 source commit 或 sync/check 命令。

先为文档增加 `status/authority/asOf/owner/supersededBy`，为 Site 增加 build/copy/provenance/check，再决定纳入 workspace 还是移出仓库。不能先删部署快照或把“移出仓库”写成唯一答案。

### [P2] [D2/D5] 无版本 facade 静默绑定旧 major

**Disposition：Codex confirmed，明确最后处理。**

- `packages/authoring/src/index.ts:9-13` 的无版本 normalizer 绑定 V3。
- `packages/compiler/src/compile.ts:1976` 的无版本 compiler 绑定 V4，尽管已有 V5。
- Playground 与 CLI 各自实现 V3/V4 dispatch。

最终方向是显式 versioned entrypoints + 一个 discriminator-aware facade；但必须排在 owner、gate 和 migration contract 之后。当前直接翻转 alias 或删除 V3/V4 会扩大协议与 Hash 风险。

## 5. Cursor 原始 Findings 的裁决摘要

| 原主张 | 最终处置 | 理由 |
|---|---|---|
| 文档 Browser V4 / R1b 开放 | confirmed P1，并入事实源 finding | 代码、文档、tracked evidence 三方分裂 |
| `docs/18` 旧验证数字单独 P1 | downgrade P2 | 已带日期；应标历史证据，不是独立协议缺陷 |
| 默认 `pnpm dev` 是 Legacy P1 | downgrade P2 / policy decision | 这是 AGENTS 明定入口；可分 composition root，不能擅自翻默认值 |
| water `implemented` 必须改 reserved | modified | 实验 Runtime 分支真实存在；修 package/profile/ref 声明，不删除实验实现或 vocabulary |
| `parameterSchemaRef` 无资源 | confirmed P1 | public `...Ref` 必须可解析 |
| `relationshipRole: "none"` 是假状态 | withdrawn | `none` 是 required union 的诚实当前值，Relationship Runtime 仍 reserved |
| 25 action union 必须缩成 4 | modified P2 | 自动 locomotion subset 与产品 AnimationSet vocabulary 是两件事 |
| Playground 静默改 AuthoringSpec | withdrawn | 当前实现用 immutable `hostOverlay` 显式记录，成功/失败路径都返回；不是静默 mutation |
| `bindControl.stop()` 应直接删除 | deferred P2 | 源码事实成立，但当前测试冻结 idle；需先冻结 rebind/animation interruption 合同和 reproducer |
| README G19 包是假当前包 | downgrade / historical | `4ae1912` 已标 integration branch；`1df2fac` 已实际落地这些包 |
| `world` barrel 加载 Three | confirmed P2 | 用窄 provider-free export 修复 |
| Legacy 跨包相对 import | confirmed P2，范围扩大 | 应统一 package export 和 boundary gate |
| 私有 V2 migration 是开放结构债 | withdrawn | 它是未导出的 one-time developer tool；只需修旧 onboarding 文案 |
| Playground scene test 缺 water/blocker gate | withdrawn | compile path 与 focused world tests 已覆盖，不需要重复同一 assertion |
| Bone mesh `[0]` 是当前 bug | deferred P2/P3 | 需要 asymmetric multi-skinned-mesh reproducer，不能先改公共 Rig Schema |
| compiler/world 依赖 testkit | confirmed，升 P1 | 生产 admission owner 与文档职责直接冲突 |
| Plan-first camera 无单位 | confirmed，升 P1 | 直接违反公共 Schema 命名纪律 |
| verify scripts 暂维持现状 | modified | 保留门禁资产，但必须拆 check/update 并正式化 Host/CLI owner |

## 6. 补充 ChatGPT 分析的裁决

用户补充分析对长期架构有参考价值，但混用了 `4ae1912`、后续 Gameplay 集成分支和当前 `main`，并把 Roadmap 重要性当成缺陷严重度。

| 主张 | 处置 | 判断 |
|---|---|---|
| Gameplay Authority / RuntimeHost 设计已较成熟 | confirmed as later-context | `1df2fac` 已包含 Gameplay Contracts、Gameplay、Runtime Host 与 Babylon staged port；不属于 `4ae1912` 的已实现事实 |
| Gameplay 分支 ahead main 41 commits | stale | 复核时该分支与 `origin/main` 都是 `1df2fac`；状态描述必须带 commit/time |
| Publication barrier、`projectedWorldStateAfter/projectedViewStateAfter` 值得保留 | confirmed as design direction | 与后续代码和冻结设计一致；仍需按 Browser/CLI shipping gate 区分 internal staging 与 production |
| `possessedBy` 先成为唯一 control truth | confirmed as later design | 后续合同中 `GameplayRelationshipStateV1` 首批只含 `PossessedByRelationshipStateV1`，方向合理 |
| Gameplay cutover 是 P0 | rejected severity | 它是战略关键路径，不是 `4ae1912` 上已确认的静默缺陷；应使用 milestone/blocker，而不是 P0 defect |
| `mountedOn` 必须是紧接着的下一项 | deferred product decision | 角色化 endpoint、事务、rollback 方向正确；是否下一步做需以 G19 shipping gate 和 Roadmap 授权为准 |
| Camera numeric Authoring/fallback 仍待 clean break | confirmed as later debt | 后续 main 仍存在 numeric Authoring/ExecutionPlan 和 `updateLegacy()`；应在 possession/profile coverage/golden migration 后独立 clean break，不能现在顺手删 |
| World/View/Runtime Status 分离 | confirmed as design direction | 后续 Gameplay projection 已推进该边界；本报告不把它倒灌成 `4ae1912` 的完成项 |
| Compound Collider → Body Graph → Ragdoll，且现在不做 | accepted as non-action | 长期方向合理，也符合 YAGNI；不应阻塞当前结构与 Relationship/Gameplay 门禁 |

因此，这份补充分析可以作为后续 Roadmap 讨论材料，但不应把 `mountedOn`、Ragdoll 或 Camera clean break 塞进本次 workspace 规整 PR。

## 7. 依赖感知工作图

本 PR 只更新审查文档，不执行以下任务。真正实施前必须按 stable ID 分支或工作树隔离。

| ID / goal / deliverable | depends_on | blocks | 独占 ownership 与 I/O contract / integration point | 验证证据 | mode |
|---|---|---|---|---|---|
| `WS-00` 冻结当前 facts：机器可读 capability/status、authority metadata、版本 census | 无 | 全部 | 主 Agent 独占协议版本、状态清单和文档 authority；输出供 docs、verifier、CLI 消费 | V5/R1b/docs/evidence census；无重复 current truth | `main-agent-only` |
| `WS-01A` 修 Canonical 合同：拒绝 `-0`、修 Plan-first Camera 单位 | `WS-00` | `WS-INT` | `protocol`、Authoring/World Schema、scene plan migration；Hash 与 frozen plan 是 integration point | parser/canonical golden、scene/plan freeze/check、Hash conformance | `main-agent-only` |
| `WS-01B` 收 Registry/public owner：统一 discovery、SubjectPreset Closure、Action/Bone vocabulary | `WS-00` | `WS-04`, `WS-08`, `WS-INT` | Registry/低层 contracts owner；CLI/Browser 只消费统一 facade；不得形成 package cycle | 每个 public Ref 可 list/describe/resolve；exact-key/closed-kind tests | `main-agent-only` |
| `WS-01C` 迁 Spawn Safety owner | `WS-00` | `WS-03`, `WS-INT` | Compiler/World admission 不再依赖 testkit；输入输出 diagnostic 完全不变 | Compiler、World、scene gates；diagnostic snapshot parity | `sequential` |
| `WS-02` 分离 check/update 并建立 gate graph | `WS-00` | `WS-INT` | root scripts、Vitest/CI、artifact producer manifest；check 只读，update 显式写 golden | `check:fast/integration/browser/full`；结束 worktree diff 为空 | `parallel-safe` |
| `WS-03` 执行 workspace boundary：imports、manifests、tsconfigs | `WS-00` | `WS-04`, `WS-05`, `WS-INT` | package manifests/exports 与 environment configs；公共测试资产走 `/testing` subpath | import/manifest lint、leaf isolation typecheck/test、0 cycles | `parallel-safe` |
| `WS-04` 正式化 Host/CLI | `WS-01B`, `WS-03` | `WS-05`, `WS-08`, `WS-INT` | 先 `packages/host-tools`，后 `apps/worldkit-cli`；根 wrapper 保持 CLI JSON、exit code、路径语义 | CLI snapshot、Host transaction tests、Browser Vite Host tests | `sequential` |
| `WS-05` 分离 Playground composition root | `WS-03`, `WS-04` | `WS-08`, `WS-INT` | bootloader + canonical/legacy modules；不改 Runtime/physics/camera；默认命令变更需产品批准 | 两入口启动、UI backend 标签、Canonical/Legacy 各自 regression | `sequential` |
| `WS-06` 文档与 Site provenance | `WS-00`, `WS-02` | `WS-INT` | 文档 metadata、Site source commit/sync/check、单一源资产；不先决定移仓 | link/status census、Site drift check、source hash/provenance | `parallel-safe` |
| `WS-07` generated/parity gate | `WS-00`, `WS-01B`, `WS-03` | `WS-08`, `WS-INT` | 每个领域 owner 内的 schema/type/validator generation；禁止 `shared` 巨包 | `check:generated`、schema/type parity、fixture round-trip | `sequential` |
| `WS-08` version facade 与 Legacy clean break | `WS-01B`, `WS-04`, `WS-05`, `WS-07` | `WS-INT` | 显式 versioned entrypoints、唯一 discriminator facade、migration；公共 rename 原子完成 | V3/V4/V5 migration、CLI/Browser/package/hash full gate | `main-agent-only` |
| `WS-INT` 最终集成 | `WS-01A..WS-08` | 无 | 主 Agent 独占 cross-cutting merge、权威裁决和 release evidence | 全量 typecheck/test/build/check/verify-check、render/manual evidence 按风险补齐 | `main-agent-only` |

可以并行的只有文件和接口 owner 明确不重叠的 ready tasks；worker 完成不等于集成通过。

## 8. 明确不做的“规整”

- 不合并 `authoring/compiler/runtime-contracts/runtime-babylon`。
- 不合并 `traversal/traversal-recast`、`world/world-package`、`subject-actions/animation`、`subject-composition/subject-registry`。
- 不删除 `artifacts/scenes/**`、plan-lock、scene-plan images、whitebox/styled tri-view、Golden fixture。
- 不把 Recast、Babylon、Havok、Three 或 provider handle 抬进 AI Schema。
- 不因单个 barrel 或深 import 问题提前删除 Legacy packages。
- 不在 owner/gate 稳定前翻转无版本 alias 或提前退役 V3/V4。
- 不把后续 Gameplay/Relationship、Camera clean break、Compound Collider 或 Ragdoll 工作塞进本次文档 PR。

## 9. 覆盖与新鲜度结论

| 维度 | 结论 |
|---|---|
| D1 定位与需求 | 双栈与 outdoor heightfield 阶段边界合理；问题是 composition/onboarding 边界未完全制度化 |
| D2 Schema / AI-friendly | 发现 Plan-first 单位方言、`-0` 冻结合同偏差、SubjectPreset 双 owner、重复 vocabulary |
| D3 承诺与事实 | 发现 Browser/R1b docs + tracked evidence 漂移、Registry discovery 分裂、Catalog Ref/availability 不闭合 |
| D4 单一状态权威 | Canonical support owner 未发现新 P0；`relationshipRole:none` finding 撤回；Gameplay 后续状态不倒灌到基线 |
| D5 工程边界 | 发现 testkit owner 倒置、深 import、manifest/tsconfig 隔离缺失、Host/CLI 隐式 package、World provider leakage |
| D6 门禁与证据 | 发现 verify/update 混用、默认 suite 漏项、集成超时、无 aggregate gate/CI、Site 无 provenance |

本报告可合并为 `4ae1912` 的历史审查证据；在有人据此启动结构实施或声称当前 `main` 已完成规整前，必须先刷新审查基线。
