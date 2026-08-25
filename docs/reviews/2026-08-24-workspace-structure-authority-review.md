# Workspace 结构与权威边界审查

> 状态：**Current review evidence / non-authoritative**
>
> 当前产品审查对象：`origin/main@a8b9fd363a7116a8eb731e2c56f0f210c0ee00c8`
>
> 开发分支：`cursor/workspace-structure-audit-ad0d`；最新 `main` 合并提交：`8e7298e`
>
> 用途：记录当前代码树的结构、公共 owner、事实源、Workspace 与门禁边界；不替代
> Canonical Schema、Frozen Spec、`AGENTS.md`、正式 Gameplay 合同或可复跑的交付证据。

结论分两层：**大结构方向 GO；当前 authority / publication / gate closure NO-GO**。最新
`main` 没有恢复 Legacy/Three/Rapier，也没有形成第二套 Runtime、Camera 或 Capture 实现；但当前树
仍有 11 组 P1 和 5 组 P2。这里的 NO-GO 只表示不能宣称“结构规整和审查门禁已闭环”或据此发布，
不表示应回滚现有架构，也不阻止按依赖图继续开发。本轮未确认 P0。

## 1. 审查元数据与判断口径

- 日期：2026-08-25。
- 模式：[`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) 的 **C（整仓审计）**，
  覆盖 D1–D6；Runtime 相关判断继续受
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 约束。
- Draft PR：[#27](https://github.com/seedleap/agent-whitebox-world-sdk/pull/27)。
- 原审查基线：`main@4ae1912`。`4ae1912..a8b9fd3` 共 141 commits、458 files；不是把旧结论
  机械搬到新 SHA，而是逐项回当前源码复验。
- 上一版报告审到 `01ee4b9`；本轮新增复审 `01ee4b9..a8b9fd3` 的 6 commits、113 files，包含
  Babylon retirement follow-up、Cursor review session hardening、Hosted Scene Brief / Studio / LWDP
  workflow 及其 review fixes。
- 历史输入包括 Cursor 原始报告、此前 Codex 对抗修订、用户提供的 ChatGPT Gameplay/RuntimeHost
  分析，以及 `docs/reviews/**` 中的旧证据。它们只提供调查线索；本报告的 P0/P1 均重新落到当前树。
- 产品验证在 merge tree `8e7298e` 上完成。其后本分支只更新本报告、
  [`full-dimension-review-protocol.md`](full-dimension-review-protocol.md)、
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 和
  [README](../../README.md) 的审查门禁说明；按新的 evidence invalidation 规则，这些纯文档修订
  不让产品 type/test/build 证据失效。

优先级按当前影响而不是 Roadmap 热度：P0 是已确认的静默正确性/冻结边界破坏；P1 是当前合同、
事实源、可运行入口或 blocking evidence 不可信；P2 是未造成静默提升的工程边界和可维护性债。
同一根因按一组 finding 计数，避免把每个字段或测试文件拆成虚高的独立问题。

### 1.1 Authority hierarchy

| 作用域 | 当前权威 | 约束 |
|---|---|---|
| 仓库流程、阶段边界、Schema 命名 | `AGENTS.md` | README、计划和 review 不能覆盖 |
| 已冻结公共合同 | 对应 Frozen Spec + Canonical Schema + conformance tests | 不能由示例、UI 或 Adapter 猜测 |
| Gameplay 对接 | [`docs/20-gameplay-integration-contract.md`](../20-gameplay-integration-contract.md) + exact exported types | 文档、Browser 和 Host 必须同义 |
| 当前能力与 Backlog | [`docs/00-project-overview.md`](../00-project-overview.md) 与 [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)，并由当前代码和新鲜 gate 佐证 | 带日期计数只是历史证据 |
| Onboarding | README、[`docs/15-creator-studio.md`](../15-creator-studio.md)、[`docs/17-canonical-json-quickstart.md`](../17-canonical-json-quickstart.md) | 从上述事实派生，不另持有能力真相 |
| 历史证据 | `docs/reviews/**`、`docs/superpowers/plans/**` | 不拥有当前完成状态；本文也属于此类 |

### 1.2 最新 main 的实质变化

当前大结构已经完成并保持以下收敛：

1. 唯一当前 Authoring/Compiler 链是 `normalizeAuthoringSpecV4` → `compileWorldV5`；Gameplay、
   RuntimeHost、Babylon transactional port 和 Browser V5 已进入生产树。
2. `01ee4b9` 删除 Three/Rapier Legacy cluster、`SdkWorldAdapter` 和旧
   `core/physics/subjects/animation` packages；`pnpm dev` 是 Babylon catalog Playground，
   `worldkit run` 才提供 Canonical Authoring Runtime。
3. `ff3c23c` 将 Camera 参数不变量收口到 provider-neutral Camera Domain，并修复 artifact capture
   的共享材质 identity-mask 污染和临时贴图释放；本轮没有发现第二个 Camera/Pose owner。
4. Hosted workflow 保持 Scene Brief 为 non-canonical input，Trusted Host 才提升 Authoring V4、
   ExecutionPlan V5 与 capture artifacts。Authoring capture API 只在 authoring route 安装，并继续
   委托 Babylon Adapter 的 `captureArtifactView()`；它不是第二个 Runtime/Renderer。

因此，旧报告中的“Gameplay 只是未来背景”“Canonical/Legacy 双 Runtime”“World barrel 加载 Three”
和“无版本 facade 绑定旧 major”继续保持 **fixed**，不能因为 Hosted DTO 增多而重新包装成旧问题。

## 2. 最终产品树执行证据与限制

| 命令 / 检查 | 结果 | 当前解释 |
|---|---:|---|
| `git fetch origin main cursor/workspace-structure-audit-ad0d` | 0 | 最终确认远端 `main` 仍为 `a8b9fd3` |
| `git merge --no-edit origin/main` | 0 | 生成 `8e7298e`，无文本冲突；产品树等于最新 main |
| `pnpm typecheck` | 0 | 当前 TypeScript gate 通过 |
| `pnpm test` | 0 | 194/194 files、2236/2236 tests；381.14 秒；已包含 `test:scenes` |
| `pnpm test:studio` | 0 | 36/36；独立 Node Test Runner |
| `pnpm test:lwdp-client` | 0 | 13/13；独立 Node Test Runner |
| Cursor skill 两组 Python tests | 0 | 6/6 + 11/11；仍未进入 root aggregate |
| `pnpm build` | 0 | Vite 2189 modules，约 74 秒；只有既存 `>500 kB` chunk warning |
| 18-file Hosted/Runtime 聚焦批跑 | 1 → 单文件 0 | 并发冷态出现 5 个 timeout；5 个用例 single-worker 全部通过，其中 Route test 116.34/120 秒 |
| `pnpm worldkit registry describe --resource-ref worldkit://control-feel-profile/humanoid.medium-ground@1 --json` | 2 | Capability 资源仍被通用 CLI `describe` 误报 not found |
| Motion Kernel `parameterSchemaRef` 静态 census | 10/10 dangling | 10 个 ref 存在，仓库无 `motion-parameter-schema` resource owner/resolver |
| Site 聚焦 Node test | 1 | 稳定 `ENOENT public/legacy/index.html` |
| `node --test scripts/image-delivery.test.mjs` | 1 | collection 即因不存在的 `write-visual-plan-manifest.mjs` 失败；root test 未收集 |
| Cursor fresh final review `workspace-audit-a8b9fd3` | `FINAL GO` | 独立复验关键 claims；两处 P2 引用问题已按当前源码修正 |

旧报告的 `179/180 files`、`2193/2194 tests` 与 Subject Preset 单红已经失效：本轮完整 root suite
中 Subject Preset 21/21 通过。另一方面，先跑相关批次时仍复现资源竞争 timeout，因此只能裁决为
“旧具体失败关闭、冷态预算风险仍在”，不能把一次预热后的全绿写成 suite 已稳定。

没有运行 `verify:canonical`、`verify:placement-layout`、`verify:rigged-subject` 或
`verify:g-bot-subject`：四者当前成功路径会 promotion tracked golden，不符合只读审查。也没有用
unit/build 冒充 Browser、rendered visual、manual interaction、外网 tunnel 或 provider production
验证。相关能力若要宣称 release-ready，仍需在 check/update 分权后取得对应层级的新鲜证据。

## 3. 当前结构判断

以下 package 分层是合理的，不应为了目录更少而合并：

- `authoring → compiler → runtime-contracts → runtime-host / runtime-babylon`；
- `gameplay-contracts → gameplay`，Host 独占事务、Session、Journal 与 Publication Barrier；
- `traversal` 与 `traversal-recast`；`world` 与 `world-package`；
- `subject-actions`、`subject-composition` 与 `subject-registry`；
- provider-neutral `camera` 与最终 Pose owner `runtime-babylon/CameraDirector`。

`WorldRuntimeSnapshotV4` 已拆分 `world/view/runtime/resources`，WorldSession publication 也原子聚合
World State、Gameplay Inspection 与 View State。Camera Domain 到 Registry Lock、Gameplay Context、
Browser preference 和 CameraDirector 的剩余接线是公开 Backlog seam，不是当前结构 bug。
`mountedOn`、完整 Relationship、Compound Collider 和 Ragdoll 同样不能因为战略重要就升级成本审查缺陷。

当前规整重点已经从“再退役哪些包”转为：

1. 让 active docs、Site、公开 Studio entrypoint 和真实实现同义；
2. 关闭 Registry、SubjectPreset、Canonical JSON、Catalog 与 Hosted Preview 的权威断链；
3. 把 check/update、generated parity 和 aggregate lanes 变成可相信的只读证据；
4. 再处理 scripts、test imports、manifest、tsconfig 和 oversized composition shells。

## 4. 当前 Findings

### [P1] [D1/D3/D6] Babylon-only completion 没有原子关闭 active docs、Site 与 review provenance

**Disposition：changed / remains。** `docs/18` 已正确把 TR0–TR7 标为完成，上一版报告关于
“TR5 进行中、TR7 待执行”的证据已撤回；但其 `:549` 又要求未来冻结 World/View/Runtime
projection，`:873-879` 和当前代码已把该投影作为冻结基础使用。`docs/00:101-105,153-170`
及 `docs/17:456-464` 仍笼统把 R1b/M5、Gameplay、Relationship 或 non-empty
Relationship 写成未交付，未区分已交付 possession 基础与尚未交付 mount/seat 产品关系。

`sites/world-sdk-blueprint/app/page.tsx:3-7` 继续 iframe 已删除的 `/legacy/index.html`，对应 test
`sites/world-sdk-blueprint/tests/rendered-html.test.mjs:42-67` 在最终树稳定 ENOENT；Site 又在 root aggregate 外。
`docs/reviews/2026-08-25-pr14-spatial-platform-main-integration-review.md:10,130-135` 把
`126a8f4` 记成 final push baseline，但 Hosted commits 实际在它之后直到 `a8b9fd3`。后者只是历史
provenance P2 级漂移，不单独抬高计数；它与 active docs/Site 共同说明 completion record 仍不可信。

最小修复是完成一次 current-state record：对齐 docs 00/17/18，修复或明确归档 Site，更新 review
baseline，并把 Site build/test 接到 aggregate。不能恢复 Legacy bundle，也不能用“Relationship 未实现”
覆盖已经存在的 possession/GamePlay contract。

### [P1] [D2/D4] 正式 Gameplay 文档把 Browser Reset 的 possession 语义写反

**Disposition：remains。** `docs/20-gameplay-integration-contract.md:186-187` 说 Reset 清空
possession、consumer 必须重新 bind。真实 Browser 路径调用
`resetWithInitialControlBinding()`，并在返回 Snapshot 前完成初始绑定；Host 内部 unbound candidate
与 Browser 对外已绑定 Snapshot 是两个阶段。

最小修复是分别记录 Host reset 和 Browser reset。Browser consumer 应读取返回 Snapshot 的
`possessedBy`，不能按错误文档无条件再发一次 bind。

### [P1] [D2/D3] Registry CLI 与 Browser 仍不是同一资源发现权威

**Disposition：remains；最终树实测。** `subject-registry/types-v3.ts` 继续公开
`listResources()` 与 `listCapabilityResources()` 两套视图；`scripts/worldkit.ts:676` 的通用
`registry describe` 只查 legacy list，Browser `worldkit-browser-api.ts:1000-1017` 从 Capability
视图发现当前资源。最终树查询 `control-feel-profile/humanoid.medium-ground@1` 仍 exit 2。

Registry 应提供 closed-kind `resolveResource(ref)` 与稳定排序的
`listDiscoverableResources(filter)`；CLI、Browser、Closure 和 conformance 共同消费。旧 projection
只能是显式兼容/内部 API，不能继续冒充通用 discovery backend。

### [P1] [D2/D5] Canonical 生产不变量仍由 `testkit` 所有

**Disposition：remains。** Compiler/World manifest 仍把 `@whitebox-world/testkit` 列为 production
dependency，生产入口 `packages/compiler/src/compile.ts:18` 与 `packages/world/src/scene.ts:10`
调用其中的 `validateSpawnSafety()`；testkit 又依赖低层 contracts。

应把 spawn safety、finite transform、feature ownership 等确定性不变量迁到低层生产合同包，保持
diagnostic code、path、排序和 hash 不变；不要复制算法或新建 `shared` 巨包。

### [P1] [D2] `SubjectPresetClosureV1` 仍有两个公共 owner

**Disposition：remains。** Registry 版本的 `resourceKind` 是 closed
`SubjectRegistryResourceV3["kind"]`，`runtime-contracts/src/subject-preset.ts:11-23` 的同名公开形状
却是 `string`；两者都从 package root 导出。结构兼容不能证明 wire contract 一致。

选择一个不会制造 `runtime-contracts ↔ subject-registry` 环的低层 owner，另一侧只导入或显式投影，
并增加 exact-key、closed-kind 和 hash conformance。

### [P1] [D2/D6] Canonical JSON 仍接受并归一化 Frozen Spec 禁止的 `-0`

**Disposition：remains。** Frozen AI-first spec 要求 parser 和 Golden Fixture 拒绝 `-0`；
`packages/protocol/src/canonical-json.ts:27-34` 将程序内负零改为 `0`，对应 test 正向锁定接受行为，
Authoring parser 在重复键检查后直接 `JSON.parse`。

修复必须原子覆盖 parser、canonicalizer、Golden fixtures 与 hash conformance；只改测试期望会让同一
identity 的 admission 继续分叉。

### [P1] [D2/D3] Catalog 的公开 Ref、能力描述与锁定 Profile 仍不闭合

**Disposition：remains；证据复验。** `assets/registry/motion-kernels/catalog.json` 的 10 个
`parameterSchemaRef` 全部指向仓库不存在的 `motion-parameter-schema` resource kind/resolver。
部分 Subject Definition 文案声称专用 Kernel，实际 default profile 仍锁 K01 或 safe-ground；当前
validation 只检查 Profile → Kernel，不检查 public Ref 和“Capability → Profile → Kernel”的完整闭包。

应建立“每个 public `...Ref` 必须 resolve”与 Definition/Profile/Kernel exact closure conformance，
并分开表达 recommended/advanced/experimental availability 和 production admission。K06 的实验实现
真实存在，不应为了修文案倒退成 reserved。

### [P1] [D6] `verify`、generated check 与 aggregate gate 仍会给出 false green

**Disposition：worsened。旧 Subject Preset 单红已关闭，根因未关闭。**

- 四个 Browser verifier 仍通过 `artifact-directory-promotion.ts` 替换 tracked golden，没有只读
  `--check` / 显式 `*:update` 分权。
- root Vitest 只收 `.test.ts`。`pnpm test` 194/194 全绿，但 9 个 `.test.mjs` 不会被收集；Studio
  36/36 和 LWDP 13/13 只能靠独立脚本，Playground Vite、Site、image-delivery 与 Cursor Python
  tests 没有统一 aggregate/CI。
- `scripts/image-delivery.test.mjs:7-8` 导入仓库不存在的
  `write-visual-plan-manifest.mjs`，直接运行 collection fail；这证明 root green 没有闭合新增 workflow。
  该模块现行 `agent:world` 不消费，所以不能夸大成生产 workflow 已坏。
- `scripts/agent-self-check.test.ts:76-90` 在比较 source/bundle 前先运行
  `scripts/build-agent-self-check.mjs`，后者直接写 tracked
  `.codex/skills/worldkit-canonical-builder/scripts/self-check.mjs`。stale bundle 会先自愈再通过，root
  test 也不再是严格只读；负向 fixtures 又只跑 source。
- 冷态相关批跑复现 5 个 timeout，single-worker 全过；Route 用例单跑 116.34/120 秒，说明当前预算
  对调度竞争仍敏感。一次预热后的全量通过不能抵消该风险。

本分支已更新审查策略，禁止再把 update-capable producer 当只读 gate；实现层仍需新增
`generate:agent-self-check` / temp-build byte-compare `check:agent-self-check`、拆分 verifier check/update、
建立 aggregate lane 和末尾 clean-tree assertion。

### [P1] [D2/D3/D4] Studio Preview 丢失 AuthoringSpec 与 implementation map 的 hash join

**Disposition：new on `a8b9fd3`；confirmed。** 设计文档
`docs/22-hosted-scene-brief-and-evaluation.md:45-53` 要求 promoted implementation map 绑定 Scene
Brief 与 AuthoringSpec hash。正式 CLI 在 `scripts/worldkit.ts:920-941` 读取完整 map 并校验
`authoringSpecHash`，方向正确。

Studio Preview 却分别提供 `authoring-spec` 与 `visual-capture-targets`：
`apps/studio/server.mjs:2344-2375` 的 targets endpoint 只返回
`{ targets: visualCaptureGroups }`，丢掉 hash；Playground `main.ts:1924-1945` 并行读取两份响应，
`authoring-loader.ts:102-129` 只验证 target 形状。重试或文件切换期间，可以组合“entity IDs 仍合法、
但来自另一 AuthoringSpec/attempt”的 mapping。它不会改写 Canonical simulation truth，因此不是 P0；
但 Preview/capture evidence 可能绑定错 attempt，属于当前 P1。

最小修复是由 Host 返回一个原子 Preview Bootstrap，至少携带并校验 AuthoringSpec hash、完整 capture
groups 和 attempt identity；或让 Browser 对两个响应执行 fail-closed hash join。需要跨 attempt/stale
map 对抗测试，不能只测 target shape。

### [P1] [D2/D3] Hosted implementation/capture wire contract 暴露竞争 identity 与非 Canonical 命名

**Disposition：new on `a8b9fd3`；confirmed。** 当前 Hosted contract 在未发布阶段仍可 clean break，
但已经从 `runtime-contracts` public root 导出并作为 Agent/Host serialized protocol 使用，必须遵守
`AGENTS.md` 的 closed discriminator 和唯一公共词汇规则：

- final `SceneBriefImplementationMapV1` 在 `runtime-contracts/src/capture-targets.ts:21-33` 要求
  Brief/Authoring hashes 和 `visualCaptureGroups`；Builder draft 在
  `scripts/finalize-spatial-build.ts:21-44` 缺少这些字段，却使用完全相同的
  `kind: worldkit-scene-brief-implementation-map` / `schemaVersion: 1`。Host 目前靠文件名和额外
  shape guard 区分两个阶段，discriminator 本身不再能 closed-narrow。
- 同一 public module 同时导出 `CaptureTargetManifestV1` 和 `RuntimeTriviewManifestV1`；前者没有
  非测试 producer/consumer，后者才由 `scripts/worldkit.ts:1187-1195` 生产并被 Studio/visual
  pipeline 消费，形成两个对外 manifest truth。
- `WhiteboxTriviewCaptureV1` / manifest 暴露 `imageDataUrl`、`imagePath`、`targetId` 等字段，未使用
  Canonical `...Uri` 与 role-qualified reference；相关视觉 DTO 还有无单位的 `width/height`。

现有 final validator 和 filename boundary 使不完整 draft 不能静默冒充 promoted final，因此不升级
为 P0，也不拆成三条 P1。最小修复是在发布前一次 clean break：draft 使用独立 kind 或保持 Host-private；
删除未使用 manifest；统一到一个 capture manifest/validator owner，并原子重命名 public fields、tests、
examples 与 generated types，不保留永久 alias。

### [P1] [D3/D5/D6] `pnpm studio:public` 没有组成可运行的公开 Studio topology

**Disposition：new on `a8b9fd3`；confirmed。** 根脚本 `package.json:16` 只启动 proxy。Proxy 默认
upstream 是 `127.0.0.1:4197`，普通 Studio 默认是 4174；proxy 不启动或监督内部 Studio，缺少
upstream 时返回 502，且没有至少 16 字符 access key 时会在启动前失败。example env 也指向 4197，
`docs/15-creator-studio.md:39-41` 却没有第二进程、端口、auth/env 隔离的可执行命令。现有 proxy tests
传入测试内 upstream，只证明代理安全边界，不证明 root entrypoint topology。

安全拆 proxy 的方向是对的：loopback-only target、Authorization stripping、method/path allowlist 和
Upgrade denial 都有实现/测试，且 docs 已把 quick tunnel 限为非生产。本 finding 不是公开穿透漏洞。
最小修复是提供受监督 wrapper（内部 4197 Studio + 4175 proxy + process cleanup），或把脚本明确改名
`studio:public-proxy` 并文档化精确双进程启动，再增加默认 topology 的 `/api/health` E2E。

---

### [P2] [D5] test imports、manifest、深层源码与 tsconfig 隔离仍不一致

**Disposition：remains / worsened。** 生产 package 源码的 sibling `src` 穿透已明显减少，manifest
生产 DAG 未发现新环；但 tests 继续从根隐式获得 Vitest/DOM/Node，Compiler test 仍穿透 sibling
private source，scripts 和 cross-package tests 不在正式 exports/manifest 图内。根 `tsconfig.json`
一次性覆盖 packages/apps/scripts，workspace packages 没有分层 tsconfig。

先建 import/manifest boundary gate，再从 leaf packages 引入 `tsconfig.base + library/browser/node/test`
配置；测试辅助面走显式 `/testing` export。不要机械生成大量无差异配置。

### [P2] [D5/D6] `scripts/` 与 Studio 仍是 Workspace 图外的 Host/Provider 产品模块

**Disposition：worsened。** `scripts/worldkit.ts` 约 1633 行，Studio server 从约 841 增至 2611 行；
Studio、Playground Vite 与 `scripts/lib` 继续交叉导入，真实 Host ownership 不在 manifest DAG 内。
新增 child process、recording/provider 路径还缺统一 deadline、AbortSignal、SIGTERM grace/SIGKILL
escalation、provider readiness 与资源总配额。Quick tunnel 已明确非生产，当前没有实际 hang/SSRF
reproducer，因此这些 lifecycle/security residual 保持 P2，不凭静态可能性抬成 P1/P0。

先提取 App 已稳定消费的 provider-neutral Host primitives，再将 CLI composition 正式化；为 child/fetch/
download 建立有界生命周期和 capability preflight。根脚本保留薄 wrapper，JSON、exit code、repo-root
与事务语义保持不变。

### [P2] [D2/D5/D6] Schema、validator 与 generated/parity 仍无机械边界

**Disposition：worsened，但未确认新的静默权威提升。** 既有 Authoring V4 schema/types/AJV 和四份
`WorldBuildArtifactV4` 仍是多份手写 truth；Hosted 的 portable checker 又增加新的 parity 边界：

- docs 22 声称 Planner/Builder checker 都 source-generated；Planner checker 实际是手写 regex，漏掉
  canonical parser 的 duplicate target、second Subject 和 movement-label length 规则。Trusted Host 随后
  在 `run-spatial-world-agent.sh:141` 调 canonical CLI 会 fail closed，因此影响是 agent 得到错误 passed
  receipt 后流程终止，而不是非法 Brief 被提升；客观分级为 P2，并入 parity 根因。
- Builder checker 虽有 source owner，但 root parity test 在比较前重写 tracked bundle，且负向 fixtures
  只跑 source；这个 false-green 的 blocking impact 已计入 P1 gate finding，这里只记录生成边界根因。

每个领域选择唯一 source，Planner/Builder checker 都从 parser/compiler source 构建到临时目录并做
正负 fixture exact parity；建立 `check:generated`、round-trip、unknown-key 和 validator diagnostic
coverage。不要把 `WorldBuildArtifactV4` 的局部 private parser 冒充尚未完成的完整 WorldPackage root。

### [P2] [D2] Action、Bone 与 Topology vocabulary 仍有多个 owner

**Disposition：remains。** Ground Humanoid Action union 继续平行存在于 `subject-actions`、
`subject-registry/types-v2` 与 `runtime-contracts/execution-plan`；Biped Bone 和 Body Topology 也在
Registry/Execution/compiler fixture 中重复。

修复应选择唯一 vocabulary owner 或 generated parity，并给 automatic resolver 定义窄 subset。
`idle/walk/run/jump` 是当前自动选择集合，不等于产品 AnimationSet 只能有四个 Action。

### [P2] [D5] Runtime authority 已统一，但 Playground/Studio composition shells 仍偏大

**Disposition：旧双 Runtime finding 保持关闭；maintainability residual worsened。** Playground route
已显式区分 authoring、catalog gameplay 与 artifact-only，三条路线使用同一 Babylon owner；新增
Authoring capture API 也 identity-safe dispose，不能误报成第二 Runtime。与此同时 `main.ts` 仍约
2465 行，Studio server 约 2611 行，Studio recording service 约 1035 行，继续混合 DOM/API、route、
process lifecycle、capture/recording 与 disposal composition。

可以拆 bootloader、route-specific composition、API controllers 和 services，但所有模块必须消费
同一个 coordinator/adapter/contract owner；不要为了拆文件重新制造 canonical/catalog 两套 Runtime。

## 5. 存量 Findings 在最新 main 上的逐项状态

| 旧 finding | 当前状态 | 最新裁决 |
|---|---|---|
| Browser V5 vs Placement/docs V4 | 主体已修复 | Runtime/Placement 是 V5；剩余 current docs 漂移并入 P1 publication truth |
| Registry CLI vs Browser discovery | 仍存在 | 最终树 CLI exit 2 |
| Compiler/World 生产依赖 testkit | 仍存在 | owner 倒置未变 |
| `SubjectPresetClosureV1` 双 owner | 仍存在 | closed kind vs `string` 未统一 |
| Canonical JSON 接受 `-0` | 仍存在 | Frozen spec 与实现/测试相反 |
| Plan-first Camera 无单位字段 | 继续撤回 | `AGENTS.md` 明确 catalog-local convention，进入 Canonical 时已映射单位字段 |
| Motion/Subject Catalog 闭包 | 仍存在 | 10/10 parameter Schema Ref dangling |
| verify 更新 golden + gate 不健康 | 改写后仍存在 | 旧 Subject Preset 单红关闭；check/update、self-heal generated check、漏测 lane、orphan test 与冷态预算仍开放 |
| exports/manifest/tsconfig/import graph | 收窄后仍存在 | 生产依赖改善；test/scripts/tsconfig isolation 仍开放 |
| `scripts/` 隐式 Host/CLI | 加重 | Hosted/Studio/LWDP/recording 继续扩大图外产品职责 |
| `packages/world` barrel 加载 Three | 已修复 | 本增量未回退 |
| Schema/type/validator/generated | 加重 | Scene Brief/checker、draft/final、capture manifests 新增 parity debt |
| Action/Bone/Topology 重复 | 仍存在 | owner 未统一 |
| Canonical/Legacy 共用 Playground | 已修复原问题 | Babylon-only 路由统一；只余 shell 可维护性 |
| docs/Site provenance | changed / remains | TR 状态已修；active docs、Site 与 PR14 baseline 仍漂移 |
| 无版本 facade 绑定旧 major | 已修复 | current-only V4/V5 保持 |

本轮另新增三项不属于旧列表的 P1：Hosted Preview 的 hash join 断裂、Hosted capture public
contract 的竞争 identity/命名，以及 `studio:public` 缺失可运行的 process topology。

## 6. 对补充 ChatGPT 分析的最新裁决

外部分析总体方向合理：Gameplay Authority / RuntimeHost、`possessedBy` 唯一 control truth、
World/View/Runtime projection、Camera provider-neutral Domain 都已成为现行事实，而不是 future-only
context。它对 `mountedOn`、Compound Collider、Ragdoll 的方向建议仍属于产品路线，不是本次 Workspace
P0/P1；当前也没有理由恢复旧 Camera fallback 或 Motion 参数袋。

需要补正的是时间点和证据：最新 main 的主要新增风险已转到 Hosted Preview 原子绑定、Studio
entrypoint、generated/self-check parity 和 aggregate gates。判断“方向正确”不能抵消当前 public
command、active docs 或 blocking evidence 的具体失败。

## 7. 本轮启用的门禁策略

本分支已把下述规则写入 full-review protocol、Runtime checklist 和 README，后续审查以这些正式入口
为准；本表只记录本次如何应用：

| 阶段 | 策略 | 本轮应用 |
|---|---|---|
| 影响面建模 | 先列改动/claim 的输入与证据层 | 将 product source、Studio/LWDP、build、Browser、visual/manual、docs 分 lane |
| 聚焦回归 | failing reproducer / affected tests first | 先跑 Hosted 相关批次，识别冷态 timeout；逐文件确认非稳定语义失败 |
| 最终树完整门禁 | 每个相关 full gate 只跑一次 | typecheck、root test、Studio、LWDP、build 各一次；root test 后不再跑 `test:scenes` |
| 证据复用 | 仅在输入/claim 未变时复用，记录来源 tree | main 产品树验证后只改 docs，未重复 runtime gates |
| 独立证据层 | 不把 root green 推广到 Node/Python/Browser/visual | 单跑 Studio/LWDP/Cursor tests；未跑 Browser/render/manual 如实标明 |
| 只读边界 | producer 不能冒充 check | 未运行四个会 promotion tracked golden 的 verifier |
| 收口 | diff/link/claim + clean-tree | 文档编辑后只重做文档门禁；提交前检查 tracked diff |

策略解决的是“如何高效取得可信证据”，不是把当前漏口写成已修复。`WS-06A/WS-06B` 仍需把脚本
实现、aggregate 和 CI 跟上；在此之前，审查者必须按协议直接选择独立 lane，而不能假设 root 覆盖。

## 8. 依赖感知工作图

本 PR 更新审查与门禁文档，不执行下列产品修复。实施前按 stable ID、owner 和 integration point
拆分；架构、公共合同与最终集成继续由主 Agent 独占。

| ID / goal / independently verifiable deliverable | depends_on | blocks | 独占 ownership、I/O contract 与 integration point | required evidence | mode |
|---|---|---|---|---|---|
| `WS-00` current publication truth：docs 00/17/18/20、Site、PR14 provenance | 无 | `WS-INT` | 主 Agent独占 active authority 与 Site route；输出同一 current fact set，不恢复 Legacy | Browser reset contract、Site build/test、active-doc/link census | `main-agent-only` |
| `WS-01` Registry discovery + Catalog closure | 无 | `WS-02`, `WS-07`, `WS-INT` | Registry 提供 closed resolver/list；CLI/Browser/Closure 只消费 facade；每个 public Ref 可解 | list/describe/resolve、Definition→Profile→Kernel exact closure | `main-agent-only` |
| `WS-02` SubjectPreset + vocabulary owner | `WS-01` | `WS-07`, `WS-INT` | 低层 contract owner；Registry/Runtime 只导入/显式投影，不建 shared god package | exact-key、closed-kind、Action/Bone/Topology parity、0 cycles | `sequential` |
| `WS-03` Canonical `-0` admission | 无 | `WS-07`, `WS-INT` | protocol parser/canonicalizer + Authoring + hash fixtures 原子变更 | negative-zero parser/golden/hash conformance | `main-agent-only` |
| `WS-04` production invariants 迁出 testkit | 无 | `WS-05`, `WS-INT` | 低层生产包独占 spawn/finite/ownership invariants；diagnostics 不变 | Compiler/World parity、testkit 无生产反向依赖 | `parallel-safe` |
| `WS-05` workspace boundaries | `WS-04` | `WS-06B`, `WS-07`, `WS-08`, `WS-INT` | manifests/exports/tsconfigs/`/testing` subpaths | import-manifest lint、leaf isolation、0 cycles | `parallel-safe` |
| `WS-06A` 只读 gate floor | 无 | `WS-06B`, `WS-07`, `WS-INT` | check/update 分权；agent checker temp byte-compare；接入现有 Node/Python/Site lanes | stale generated negative、image-delivery collection、clean-tree assertion | `main-agent-only` |
| `WS-06B` aggregate/CI lanes | `WS-05`, `WS-06A` | `WS-INT` | `check:fast/integration/browser/full` 和 tracked CI；每条只读且预算隔离 | cold/warm repeat、all lanes、git diff exit 0 | `main-agent-only` |
| `WS-07` schema/type/validator/generated parity | `WS-01..WS-03`, `WS-05`, `WS-06A`, `HSE-00`, `HSE-01` | `WS-INT` | 每个领域唯一 source；Planner/Builder bundle 和 validators 机械校验 | `check:generated`、正负 source/bundle parity、unknown-key/round-trip | `sequential` |
| `HSE-00` 原子 Preview Bootstrap | 无 | `WS-07`, `WS-INT` | Host 独占 `{attempt, authoringSpecHash, captureGroups}`；Browser fail-closed join | stale/cross-attempt/adversarial Browser tests | `main-agent-only` |
| `HSE-01` Hosted capture contract clean break | 无 | `WS-07`, `WS-INT` | 独立 draft kind、单 manifest owner、Canonical public names；Agent/Host/Browser 原子更新 | closed-union、producer/consumer census、old dialect rejection | `main-agent-only` |
| `HSE-02` public Studio topology | 无 | `WS-08`, `WS-INT` | wrapper 或明确双进程 contract；端口/auth/process tree 单一 owner | default `/api/health` E2E、missing upstream、shutdown cleanup | `main-agent-only` |
| `WS-08` Host/CLI/Studio composition | `WS-05`, `HSE-02` | `WS-INT` | stable Host primitives → formal package；thin CLI/app wrappers 保持 JSON/exit/path | CLI snapshots、Studio/Vite lifecycle、timeouts/abort/readiness | `sequential` |
| `WS-INT` 最终集成 | `WS-00..WS-08`, `HSE-00..HSE-02` | 无 | 主 Agent独占 semantic merge、authority 裁决与 release evidence | relevant full gates once、clean tree、必要 Browser/render/manual、独立复核 | `main-agent-only` |

只有依赖 ready、owner 和 integration point 不重叠的任务可以并行；worker 报告不是集成证明。

## 9. 明确不做的“规整”

- 不恢复 Three/Rapier、Legacy Site bundle 或已删除 packages。
- 不合并 `authoring/compiler/runtime-contracts/runtime-host/runtime-babylon`，也不合并
  `traversal/traversal-recast`、`world/world-package`。
- 不把 Authoring capture API 报成第二 Runtime/Camera owner；它当前正确委托 Babylon capture。
- 不把 Plan-first catalog 的 `distance/targetHeight` 改成 Canonical Schema 字段；这是被授权的局部 convention。
- 不为未发布私有 draft 保留永久 alias/migration；可以明确 clean break。
- 不新建模糊 `shared/common/utils` 巨包收纳重复类型。
- 不把 Camera 后续接线、mounted relationships、Compound Collider 或 Ragdoll 塞进结构修复。
- 不删除 plan-lock、scene artifacts、planning images、tri-view 或 golden fixture；应修 producer 权限。
- 不运行会写 tracked artifact 的命令后丢弃 diff，再把结果写成“只读验证通过”。

## 10. 覆盖与当前结论

| 维度 | 状态 | 当前结论 |
|---|---|---|
| D1 定位与需求 | 已查 | Babylon-only、Gameplay 与 Hosted non-canonical Brief 方向成立；active docs/Site/public Studio entry 未闭合 |
| D2 Schema / AI-friendly | 已查 | `-0`、SubjectPreset、Catalog Ref、Hosted draft/final/manifest/checker parity 仍开放 |
| D3 承诺与事实 | 已查 | Registry discovery、Reset 文档、Preview hash join、Site 与 Studio root command 分叉 |
| D4 单一状态权威 | 已查 | Runtime/Camera/possession 主体 owner 成立；新问题是 Preview evidence 跨 attempt，不是第二 simulation truth |
| D5 工程边界 | 已查 | Legacy/provider leakage 已清；testkit、scripts/Studio、manifest/tsconfig/generated 边界开放 |
| D6 门禁与证据 | 已查 | 新策略已落文档；实现仍有 mutating verifier、self-heal、漏测 lane、orphan test 和 cold timeout 风险 |

总体判断：**保留现有架构，不做第二轮大搬家；先修可验证的 authority 与 gate 断链。** 建议执行顺序
是 `WS-06A`、`HSE-00`、`HSE-01`、`HSE-02`、`WS-00/WS-01/WS-03`，随后再做 testkit/workspace/generated 与
Host/CLI 的结构工程。只有所有相关 P1 有 focused reproducer、修复和按新策略取得的最终树证据后，
“authority / gate closure”才能从 NO-GO 改为 GO。
