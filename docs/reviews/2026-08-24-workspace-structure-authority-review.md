# Workspace 结构与权威边界审查

> 状态：**Current review evidence / non-authoritative**
>
> 当前产品审查对象：`origin/main@47525bb2967a0b04190c3b2b8db536fd9fa9c32d`
>
> 开发分支：`cursor/workspace-structure-audit-ad0d`；最新 `main` 合并提交：`1018d15`
>
> 本文记录当前代码树的结构、公共 owner、事实源与门禁边界；不替代 Canonical Schema、
> Frozen Spec、`AGENTS.md`、正式 Gameplay 合同或可复跑的交付证据。

结论分两层：**大结构方向 GO；当前 authority / publication / gate closure NO-GO**。最新
`main` 没有恢复 Legacy/Three/Rapier，也没有形成第二套 Runtime、Camera 或 Capture owner；M5
remediation、模块化 Subject 资产链、测试 census/分 lane 与 tracked CI 都是实质进步。逐项复验后
仍有 **10 组 P1、6 组 P2**，本轮未确认 P0。

相对上一版的 `11 P1 / 5 P2`，不是机械减一：`testkit` 反向生产依赖确实存在，但当前只有一个
实现 owner、没有已复现的错误结果，客观上应从 P1 降为 P2。这里的 NO-GO 只表示不能宣称“结构、
公开 authority 与审查门禁已经闭环”或据此发布，不表示应回滚现有架构。

## 1. 审查元数据与判断口径

- 日期：2026-08-25。
- 模式：[`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) 的 **C（整仓审计）**，
  覆盖 D1–D6；Runtime 判断继续受
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 约束。
- Draft PR：[#27](https://github.com/seedleap/agent-whitebox-world-sdk/pull/27)。
- 原审查基线：`main@4ae1912`；上一版产品基线：`main@a8b9fd3`。
- 本轮复审 `a8b9fd3..47525bb`：52 commits、264 files、`+14,936/-1,383`，覆盖 M5 remediation、
  Hosted Studio cloud/local execution、模块化 Subject source/runtime bundles、gate census 与 CI。
- 历史 Cursor 报告、Codex 修订、用户提供的 ChatGPT 分析和旧 review 只作为调查线索；所有现行
  P0/P1 均重新落到当前源码或当前命令。
- 合并后的共享工作树一度被并行任务写入 4 个未提交产品改动；当时本审查没有还原、提交或作为
  产品证据使用。它们随后由 `47525bb` 正式进入 `main`，本轮再按正式 commit 复审：三文件 81/81
  聚焦回归与 typecheck 通过。此前全量产品门禁在 detached clean worktree 的 exact `d4e4e8b`
  tree 上执行；本分支自主改动仍只有本文和三份门禁说明。

优先级按当前影响而不是 Roadmap 热度：P0 是已确认的静默正确性/冻结边界破坏；P1 是已冻结合同、
公共命令、事实源、发布入口或 blocking evidence 不可信；P2 是尚未造成静默错误的工程边界、
生命周期和可维护性债。同一根因按一组 finding 计数。

### 1.1 Authority hierarchy

| 作用域 | 当前权威 | 约束 |
|---|---|---|
| 仓库流程、阶段边界、Schema 命名 | `AGENTS.md` | README、计划和 review 不能覆盖 |
| 已冻结公共合同 | Frozen Spec + Canonical Schema + conformance tests | 不能由示例、UI 或 Adapter 猜测 |
| Gameplay 对接 | [`docs/20-gameplay-integration-contract.md`](../20-gameplay-integration-contract.md) + exact exports | 文档、Browser 和 Host 必须同义 |
| 当前能力与 Backlog | [`docs/00-project-overview.md`](../00-project-overview.md) 与 [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)，由当前代码和新鲜 gate 佐证 | 日期计数只是历史证据 |
| Onboarding | README、docs 15/17 | 从上述事实派生，不另持有能力真相 |
| 历史证据 | `docs/reviews/**`、`docs/superpowers/plans/**` | 不拥有当前完成状态；本文也属于此类 |

### 1.2 最新 main 的实质变化

1. M5 在 R1 Heightfield / R1b Static Platform 当前生产边界内完成 remediation；Traversal 仍由
   `traversal` 公共合同与 `traversal-recast` provider adapter 分层，没有新增第二个 Route owner。
2. G Bot/Golden 引入不可变模块化 Source Package 与派生 Runtime Bundle，Registry 升到 `@2`；
   两个只读 `--check` 均通过，source、Runtime bundle 与视觉/人工证据边界清楚。
3. root test 现在先做 200-file census，再运行 182-file contract lane 与 18-file single-worker
   resource-heavy lane；tracked CI 组合 generated diff、typecheck、Studio/LWDP/Seedance、root test 和 build。
   新增 `test:contract:coverage` 是按需覆盖率诊断，不应在 root green 后默认重复执行 contract。
4. `47525bb` 修正 Static Platform Route 不应强制 Anchor 位于 terrain bounds 的错误假设，并增加
   多 Route inventory 隔离与 seeded progress invariants；它强化现有 Traversal owner，没有新增 authority。
5. Hosted Studio 增加 cloud/local bounded queues、stop/cancel、Snapshot V4/opening-frame validation；
   但 public Preview hash join、capture DTO 与 public process topology 尚未闭合。
6. Babylon-only、Gameplay RuntimeHost、Camera Domain 和 Authoring capture 委托关系没有回退；Hosted
   DTO 不能被误报为第二套 Runtime/Renderer/Camera。

## 2. 当前产品树执行证据与限制

| 命令 / 检查 | 结果 | 当前解释 |
|---|---:|---|
| `git fetch origin main cursor/workspace-structure-audit-ad0d` | 0 | 远端 `main` 为 `47525bb` |
| `git merge --no-edit origin/main` | 0 | 生成 `1018d15`，无文本冲突 |
| `pnpm install --frozen-lockfile`（`d4e4e8b` clean tree） | 0 | 按 lock 刷新新增 GLTF 工具依赖 |
| `pnpm assets:subjects:modularize:check` | 0 | tracked Source Package 与确定性恢复一致 |
| `pnpm assets:subjects:runtime-bundles:check` | 0 | tracked Runtime Bundle 与唯一派生输出一致 |
| `pnpm test:census` | 0 | 200 files = 182 contract + 18 resource-heavy |
| `pnpm test:contract`（`d4e4e8b` clean tree） | 0 | 182/182 files、1972/1972 tests；181.49 秒 |
| `pnpm test:resource-heavy`（`d4e4e8b` clean tree） | 0 | 18/18 files、336/336 tests；412.88 秒；single worker |
| `pnpm typecheck`（`d4e4e8b` clean tree） | 0 | root `tsc --noEmit` 通过 |
| `pnpm test:studio` / `pnpm test:lwdp-client`（`d4e4e8b` clean tree） | 0 / 0 | 独立 Node lane 分别 50/50、20/20 通过 |
| Seedance Node conformance（`d4e4e8b` clean tree） | 0 | 按 CI 的 `pillow + requests` 前置条件运行，1/1 通过；裸本机 Python 缺 `requests` 不计产品失败 |
| `pnpm build`（`d4e4e8b` clean tree） | 0 | Playground production bundle 成功；仅保留既有 chunk-size warning |
| 最新 Traversal delta 三文件聚焦回归 | 0 | 3/3 files、81/81 tests；覆盖 Static Platform inventory 与 seeded progress invariants |
| 最新 Traversal delta 后 `pnpm typecheck` | 0 | `47525bb` 产品输入的 root `tsc --noEmit` 通过 |
| Registry CLI `describe control-feel-profile/humanoid.medium-ground@1` | 2 | 通用 CLI 仍误报当前 Capability resource not found |
| Motion Kernel `parameterSchemaRef` census | 10/10 dangling | 仓库仍无对应 resource owner/resolver |
| `node --test scripts/image-delivery.test.mjs` | 1 | collection 因不存在的 `write-visual-plan-manifest.mjs` 失败 |
| Site 聚焦 Node test | 1 | `public/legacy/index.html` 不存在；该 test 不在 CI |
| Cursor fresh read-only review `workspace-audit-2e8cf72` | 不作为完成证据 | 已完成主要源码/10 P1/6 P2/testkit 分级对拍；按用户收口指令在最终 verdict 前停止，且早于 `47525bb`，未伪报 `FINAL GO` |

没有运行 `verify:canonical`、`verify:placement-layout`、`verify:rigged-subject` 或
`verify:g-bot-subject`：四者成功路径会 promotion tracked golden，不符合只读审查。也没有用 unit/build
冒充 Browser、rendered visual、manual interaction、外网 tunnel 或 provider production 验证。

## 3. 当前结构判断

以下 package 分层合理，不应为了目录更少而合并：

- `authoring → compiler → runtime-contracts → runtime-host / runtime-babylon`；
- `gameplay-contracts → gameplay`，Host 独占事务、Session、Journal 与 Publication Barrier；
- `traversal` 与 `traversal-recast`；`world` 与 `world-package`；
- `subject-actions`、`subject-composition` 与 `subject-registry`；
- provider-neutral `camera` 与最终 Pose owner `runtime-babylon/CameraDirector`。

`WorldRuntimeSnapshotV4` 已拆分 `world/view/runtime/resources`，WorldSession publication 原子聚合 World
State、Gameplay Inspection 与 View State。Camera 剩余接线、`mountedOn`、完整 Relationship、Compound
Collider 和 Ragdoll 是 backlog seam，不是当前结构 bug。模块化资产链也没有把 glTF 处理泄漏到 Runtime；
它的问题主要是大型 tooling 仍留在 `scripts/` 的工程归属。

当前规整重点已经从“再退役哪些包”转为：

1. 对齐 active docs、Site、公开 Studio entrypoint 与真实实现；
2. 关闭 Registry、SubjectPreset、Canonical JSON、Catalog 与 Hosted Preview 权威断链；
3. 完成 check/update、generated parity 和 independent test lanes 的可信闭包；
4. 再处理 testkit、scripts、test imports、manifest/tsconfig 和 oversized shells。

## 4. 当前 Findings

### [P1] [D1/D3/D6] 当前完成记录仍没有原子关闭 active docs 与 Site

**Disposition：changed / remains。** docs 00/17 已更新 R1b/M5 的头部状态，但
`docs/00-project-overview.md:103-107` 仍把“完整 M5”和 Gameplay 整体写成未实现，与同页 :55-59
及现行 G19/M5 事实冲突；`docs/18-refactor-progress-and-backlog.md:277-285` 仍保留未勾选的 R1b Task 10，
而 :843-865 又明确 M5 已关闭。

`sites/world-sdk-blueprint/app/page.tsx:3-7` 继续 iframe 已删除的 `/legacy/index.html`；对应 test 找不到
该文件，Site build/test 又不在 CI。最小修复是完成一次 current-state record、修复或明确归档 Site，
不能恢复 Legacy bundle。

### [P1] [D2/D4] 正式 Gameplay 文档把 Browser Reset 的 possession 语义写反

**Disposition：remains。** `docs/20-gameplay-integration-contract.md:186-187` 说 Reset 清空 possession、
consumer 必须重新 bind；真实 Browser 路径调用 `resetWithInitialControlBinding()`，在返回 Snapshot 前
完成初始绑定。应分别记录 Host reset 和 Browser reset，consumer 读取返回 Snapshot 的 `possessedBy`。

### [P1] [D2/D3] Registry CLI 与 Browser 仍不是同一资源发现权威

**Disposition：remains；当前树实测。** Registry 继续公开 `listResources()` 与
`listCapabilityResources()` 两套视图；通用 CLI 只查前者，Browser 从 Capability 视图发现当前资源。
查询 `worldkit://control-feel-profile/humanoid.medium-ground@1` 仍 exit 2。应提供 closed-kind
`resolveResource(ref)` 与统一的 `listDiscoverableResources(filter)`。

### [P1] [D2] `SubjectPresetClosureV1` 仍有两个公共 owner

**Disposition：remains。** Registry 版本的 `resourceKind` 是 closed union；
`runtime-contracts/src/subject-preset.ts:11-23` 的同名公开形状仍是 `string`，两者都从 package root
导出。选择一个低层 owner，另一侧只导入或显式投影，并增加 exact-key/closed-kind/hash conformance。

### [P1] [D2/D6] Canonical JSON 仍接受并归一化 Frozen Spec 禁止的 `-0`

**Disposition：remains。** Frozen AI-first spec :2122、:2208 要求 parser 和 Golden Fixture 拒绝
`-0`；`packages/protocol/src/canonical-json.ts:27-34` 将负零改成 `0`，test :62-67 正向锁定接受。
修复必须原子覆盖 parser、canonicalizer、Golden fixtures 与 hash conformance。

### [P1] [D2/D3] Catalog 的公开 Ref 与锁定 Profile 仍不闭合

**Disposition：remains。** Motion Kernel catalog 的 10 个 `parameterSchemaRef` 全部指向不存在的
`motion-parameter-schema` resource kind/resolver。应建立“每个 public `...Ref` 必须 resolve”与
Definition/Profile/Kernel exact closure conformance。

### [P1] [D6] Gate 已明显提速，但 check/update 与独立 lane 仍可 false green

**Disposition：partially fixed / remains。** census、contract/resource-heavy split 与 tracked CI 关闭了
“没有 CI”和“重资源用例与全套并发竞争”两项旧结论；剩余 blocking gap：

- 四个 Browser verifier 仍会替换 tracked golden，没有只读 `--check` / 显式 `*:update` 分权；
- CI 未消费 `apps/playground/vite.config.test.mjs`、broken `scripts/image-delivery.test.mjs`、Site test 和
  Cursor Python tests；
- `scripts/agent-self-check.test.ts:76-90` 在 parity 前运行会写 tracked bundle 的 builder。CI 的先生成再
  `git diff` 能挡住初始 stale，这是有效修复；但本地 root test 仍是 self-heal producer，负向 fixtures
  也只跑 source；
- clean contract lane 中该用例约 22 秒/30 秒，适合重新评估为 measured-duration/resource-heavy，
  但不能用重复跑整套来掩盖裕量问题。

最小修复是 verifier check/update 分权、Builder 临时目录 byte compare、补齐独立 Node/Python/Site lane
与 CI clean-tree assertion；不要退回重复执行同一测试文件的旧策略。

### [P1] [D2/D3/D4] Studio Preview 丢失 AuthoringSpec 与 implementation map 的 hash join

**Disposition：remains。** 正式 CLI 读取完整 map 并校验 `authoringSpecHash`；Studio 在
`apps/studio/server.mjs:2740-2770` 分别提供 AuthoringSpec 与只含 `{ targets }` 的 capture groups，
Playground `main.ts:1924-1946` 并行读取，loader 只验证 target shape。应返回绑定 attempt、
AuthoringSpec hash 与 capture groups 的原子 Preview Bootstrap，并增加 stale/cross-attempt 对抗测试。

### [P1] [D2/D3] Hosted implementation/capture wire contract 暴露竞争 identity

**Disposition：remains。** final `SceneBriefImplementationMapV1` 要求 hashes 与 capture groups；Builder
draft 缺少这些字段，却使用相同 `kind/schemaVersion`。同一 public module 又同时导出无实际消费者的
`CaptureTargetManifestV1` 与现行 `RuntimeTriviewManifestV1`，并暴露 `imageDataUrl`、`imagePath`、
`targetId` 等非 Canonical 名称。发布前应 clean break：独立 draft kind 或 Host-private draft、单 manifest
owner、Canonical names 与稳定 unknown-shape diagnostics。

### [P1] [D3/D5/D6] `pnpm studio:public` 没有组成可运行的公开 Studio topology

**Disposition：remains。** 根脚本只启动 proxy；默认 upstream 是 4197，普通 Studio 默认 4174，
proxy 不启动或监督内部 Studio，docs 15 也没有精确双进程命令和 env/auth 隔离。代理本身的 loopback、
Authorization stripping、allowlist 与 Upgrade denial 是合理安全边界；最小修复是受监督 wrapper，或
明确重命名为 public proxy 并增加默认 `/api/health` topology E2E。

---

### [P2] [D2/D5] Canonical 生产不变量仍位于 `testkit`

**Disposition：remains；从 P1 降为 P2。** Compiler/World 显式生产依赖 testkit 并调用其中的
`validateSpawnSafety()`。这是包职责与依赖方向不整洁，但当前只有一个算法 owner，没有证据表明生产
结果错误或出现双 truth。应迁到低层生产合同包并保持 diagnostics/hash，不复制算法或新建 god package。

### [P2] [D5] test imports、manifest 与 tsconfig 隔离仍不一致

**Disposition：changed / remains。** 新 census 已机械关闭所有 Vitest `.test.ts` 的 lane 归属；但 tests
仍从根隐式获得 Vitest/DOM/Node，部分 test 穿透 sibling private source，scripts 与 cross-package tests
不在正式 exports/manifest 图内。根 tsconfig 一次覆盖 packages/apps/scripts，workspace packages 没有
分层 tsconfig。先建 boundary gate，再从 leaf packages 引入最少必要的 library/browser/node/test 配置。

### [P2] [D5/D6] `scripts/` 与 Studio 仍是 Workspace 图外的 Host/Provider 产品模块

**Disposition：changed / worsened structure。** `scripts/worldkit.ts` 约 1,633 行，Studio server 约
3,062 行，recording service 约 1,167 行，模块化资产核心又在 `scripts/lib` 达约 1,741 行。
新增 bounded queue、job timeout、stop/cancel 和上传 byte cap 是进步；残余是 SIGTERM 后缺统一
grace→SIGKILL/process-tree escalation、部分 provider/output 缺统一 byte/deadline budget，以及 readiness
未形成单一合同。

### [P2] [D2/D5/D6] Schema、validator 与 generated/parity 仍无完整机械边界

**Disposition：partially fixed / remains。** Builder bundle 进入 CI diff check 是有效进步；但 docs 22
仍声称 Planner/Builder checker 都 source-generated，Planner checker 实际是手写 validator，与 canonical
parser 在 duplicate target、second Subject、movement-label length 等规则上不等价。Trusted Host 会随后
fail closed，所以当前是错误 passed receipt 后任务终止，不是非法 Brief 被提升。应建立 source/bundle
正负 exact parity、unknown-key、round-trip 与 diagnostic coverage。

### [P2] [D2] Action、Bone 与 Topology vocabulary 仍有多个 owner

**Disposition：remains。** Ground Humanoid Action、Biped Bone 与 Body Topology 继续在多个 package/fixture
重复；当前未确认 shape drift，故保持 P2。选择唯一 vocabulary owner 或 generated parity，并明确
automatic resolver 只是窄 subset。

### [P2] [D5] Runtime authority 已统一，但 Playground/Studio shells 仍偏大

**Disposition：旧双 Runtime finding 保持关闭；maintainability residual worsened。** 三条 Playground
route 继续使用同一 Babylon owner，Authoring capture 继续委托 `captureArtifactView()`；但 `main.ts`、
Studio server 与 recording service 仍混合 DOM/API、route、process lifecycle、capture 与 disposal。
可以拆 bootloader/controllers/services，但不能重新制造 canonical/catalog 两套 Runtime。

## 5. 存量 Findings 在最新 main 上的逐项状态

| 旧 finding | 当前状态 | 最新裁决 |
|---|---|---|
| Browser V5 vs Placement/docs V4 | 主体已修复 | 只余 active publication truth |
| Registry CLI vs Browser discovery | 仍存在 | 当前树 CLI exit 2 |
| Compiler/World 生产依赖 testkit | 仍存在但降级 | 单 owner 包边界债，改列 P2 |
| `SubjectPresetClosureV1` 双 owner | 仍存在 | closed kind vs `string` |
| Canonical JSON 接受 `-0` | 仍存在 | Frozen spec 与实现/测试相反 |
| Plan-first Camera 无单位字段 | 继续撤回 | catalog-local convention 被明确授权 |
| Motion/Subject Catalog 闭包 | 仍存在 | 10/10 parameter Schema Ref dangling |
| verify 更新 golden + gate 不健康 | 部分修复 | CI/census/heavy lane 已落地；mutating/self-heal/orphan lanes 仍开放 |
| exports/manifest/tsconfig/import graph | 收窄后仍存在 | census 已修；test/scripts/tsconfig isolation 开放 |
| `scripts/` 隐式 Host/CLI | 加重 | Studio/local-cloud/assets tooling 扩大图外职责 |
| `packages/world` barrel 加载 Three | 已修复 | 本增量未回退 |
| Schema/type/validator/generated | 部分改善后仍存在 | Builder CI 正向；Planner、draft/final、manifests 仍有 parity debt |
| Action/Bone/Topology 重复 | 仍存在 | 尚未确认 shape drift，保持 P2 |
| Canonical/Legacy 共用 Playground | 已修复 | Babylon-only 路由统一，只余 shell 可维护性 |
| docs/Site provenance | changed / remains | M5 头部已修；内部矛盾与 Site 开放 |
| 无版本 facade 绑定旧 major | 已修复 | current-only V4/V5 保持 |

Hosted Preview hash join、Hosted capture public contract 与 `studio:public` topology 是上一基线新增的三项
P1，本轮 main 没有关闭；模块化 Subject 资产链未新增独立 P0/P1。

## 6. 对补充 ChatGPT 分析的最新裁决

外部分析总体方向合理：Gameplay Authority / RuntimeHost、`possessedBy` 唯一 control truth、
World/View/Runtime projection、Camera provider-neutral Domain 都已成为现行事实。它对 `mountedOn`、
Compound Collider、Ragdoll 的建议仍属于产品路线，不是本次 Workspace P0/P1；当前也没有理由恢复旧
Camera fallback 或 Motion 参数袋。

需要补正的是时间点和证据：M5 当前生产边界已 remediation，模块化资产也通过 deterministic checks；
当前 blocking 风险集中在 public authority、Preview 原子绑定、Studio entrypoint、generated/check-update
与独立 lane。方向正确不能抵消当前可复现失败。

## 7. 本轮启用并校正的门禁策略

| 阶段 | 当前策略 | 本轮应用 |
|---|---|---|
| 影响面建模 | 先列改动/claim 的输入与证据层 | source、Studio/LWDP、assets、build、Browser、visual/manual、docs 分 lane |
| 聚焦回归 | reproducer / affected checks first | Registry、image-delivery、Site、两项 asset check 先行 |
| Root aggregate | census → bounded contract → single-worker heavy | exact clean tree 各 lane 一次，不重复 `test:scenes` |
| 独立 lane | 不从 root/CI green 推导 Node/Python/Site/Browser | Studio/LWDP/Seedance 单跑；未跑 Browser/render/manual 明说 |
| 证据复用 | 仅在输入/claim 未变时复用 | 纯文档修订后不重放产品 Runtime gates |
| 只读边界 | producer 不能冒充 check | 未运行四个会 promotion golden 的 verifier |
| 收口 | diff/link/claim + scoped status | 只暂存 review/docs，不碰并行产品改动 |

这与 main 去重/提速的意图一致：contract 与 resource-heavy 只各运行一次，scene alias 不再重复。剩余
工作不是退回“多跑几遍”，而是提高 lane 分类、独立 test coverage 和 check/update 的可信度。

## 8. 依赖感知工作图

| ID / independently verifiable deliverable | depends_on | blocks | ownership / integration point | required evidence | mode |
|---|---|---|---|---|---|
| `WS-00` current publication truth：docs 00/18/20 + Site | 无 | `WS-INT` | 主 Agent独占 active authority 与 Site route | Reset contract、Site build/test、claim census | `main-agent-only` |
| `WS-01` Registry discovery + Catalog closure | 无 | `WS-02`, `WS-07`, `WS-INT` | Registry closed resolver/list；CLI/Browser/Closure 只消费 facade | list/describe/resolve、exact closure | `main-agent-only` |
| `WS-02` SubjectPreset + vocabulary owner | `WS-01` | `WS-07`, `WS-INT` | 低层 contract owner；Registry/Runtime 只导入/投影 | exact-key、closed-kind、vocabulary parity | `sequential` |
| `WS-03` Canonical `-0` admission | 无 | `WS-07`, `WS-INT` | parser/canonicalizer + Authoring + hash fixtures | negative-zero parser/golden/hash | `main-agent-only` |
| `WS-04` invariants 迁出 testkit | 无 | `WS-05`, `WS-INT` | 低层生产包独占；diagnostics 不变 | Compiler/World parity、无生产反向依赖 | `parallel-safe` |
| `WS-05` workspace boundaries | `WS-04` | `WS-07`, `WS-08`, `WS-INT` | manifests/exports/tsconfigs/`/testing` | import lint、leaf isolation、0 cycles | `parallel-safe` |
| `WS-06A` 只读 gate floor | 无 | `WS-06B`, `WS-07`, `WS-INT` | verifier check/update；checker temp byte-compare | stale negative、clean-tree | `main-agent-only` |
| `WS-06B` independent lane closure | `WS-06A` | `WS-INT` | 保留 census/contract/heavy；补 Node/Python/Site | cold/warm lane、orphan 0、CI matrix | `main-agent-only` |
| `WS-07` generated parity | `WS-01..WS-03`, `WS-05`, `WS-06A`, `HSE-01` | `WS-INT` | 每领域唯一 source；Planner/Builder/validator parity | 正负 parity、unknown-key/round-trip | `sequential` |
| `HSE-00` 原子 Preview Bootstrap | 无 | `WS-INT` | Host 独占 attempt/hash/groups | stale/cross-attempt Browser tests | `main-agent-only` |
| `HSE-01` Hosted contract clean break | 无 | `WS-07`, `WS-INT` | 独立 draft kind、单 manifest、Canonical names | closed union、consumer census | `main-agent-only` |
| `HSE-02` public Studio topology | 无 | `WS-08`, `WS-INT` | wrapper 或明确双进程 contract | health E2E、shutdown cleanup | `main-agent-only` |
| `WS-08` Host/CLI/Studio composition | `WS-05`, `HSE-02` | `WS-INT` | stable Host primitives → formal package | CLI snapshots、lifecycle/readiness | `sequential` |
| `WS-INT` 最终集成 | 上述全部 | 无 | 主 Agent独占 semantic merge 与 release evidence | relevant gates once、必要 Browser/render/manual、独立复核 | `main-agent-only` |

只有依赖 ready、owner 和 integration point 不重叠的任务可以并行；worker 报告不是集成证明。

## 9. 明确不做的“规整”

- 不恢复 Three/Rapier、Legacy Site bundle 或已删除 packages。
- 不合并 `authoring/compiler/runtime-contracts/runtime-host/runtime-babylon`，也不合并
  `traversal/traversal-recast`、`world/world-package`。
- 不把 Authoring capture API 报成第二 Runtime/Camera owner。
- 不把 Plan-first catalog 的 `distance/targetHeight` 改成 Canonical Schema 字段。
- 不为未发布私有 draft 保留永久 alias/migration；可以明确 clean break。
- 不新建模糊 `shared/common/utils` 巨包。
- 不把 Camera 后续接线、mounted relationships、Compound Collider 或 Ragdoll 塞进结构修复。
- 不删除 plan-lock、scene artifacts、planning images、tri-view 或 golden fixture；应修 producer 权限。

## 10. 覆盖与当前结论

| 维度 | 状态 | 当前结论 |
|---|---|---|
| D1 定位与需求 | 已查 | Babylon-only、Gameplay、M5 与 Hosted approximation 边界成立；docs/Site/public Studio 未闭合 |
| D2 Schema / AI-friendly | 已查 | `-0`、SubjectPreset、Catalog Ref、Hosted draft/final/manifest/checker parity 开放 |
| D3 承诺与事实 | 已查 | Registry、Reset 文档、Preview hash join、Site 与 Studio command 分叉 |
| D4 单一状态权威 | 已查 | Runtime/Camera/possession owner 成立；Preview evidence 可能跨 attempt，但不是第二 simulation truth |
| D5 工程边界 | 已查 | testkit 降为 P2；scripts/Studio、manifest/tsconfig/generated 边界开放 |
| D6 门禁与证据 | 已查 | census/CI/heavy lane 是进步；mutating verifier、self-heal 与 orphan lanes 开放 |

总体判断：**保留现有架构，不做第二轮大搬家；先修可验证的 public authority 与 gate 断链。** 推荐顺序
是 `WS-06A/WS-06B`、`HSE-00`、`HSE-01`、`HSE-02`、`WS-00/WS-01/WS-03`，随后再做
testkit/workspace/generated 与 Host/CLI。只有所有相关 P1 有 reproducer、修复和按当前去重策略取得的
最终树证据后，“authority / gate closure”才能从 NO-GO 改为 GO。
