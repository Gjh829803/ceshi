# Workspace 结构与权威边界审查

> 状态：**核心根因闭包 GO；Host 与独立 completion review 均通过**
>
> 最新 `main` 基线：`origin/main@749b594bb35830b5c92f8e6b7df1c645e36fc530`
>
> 实现分支：`codex/authority-root-cause-closure`
>
> 原始审查对象：`main@4ae1912`；原 Cursor Draft PR：
> [#27](https://github.com/seedleap/agent-whitebox-world-sdk/pull/27)

本文是结构审查与任务裁决记录，不替代 Canonical Schema、Frozen Spec、`AGENTS.md`、正式 Gameplay
合同或可复跑的交付证据。历史 Cursor 报告、Codex 修订和补充 ChatGPT 分析只作为调查线索；当前裁决
均重新落到最新源码、实际 diff 和当前命令。

## 1. 当前结论

结论需要分层表达：

- **核心 authority / public contract 根因闭包：GO。** 本轮选择的 HSE 与 WS 根因均已实现，
  当前没有未处置的 P0/P1；Host 证据通过，fresh read-only Cursor completion review 结论为
  `FINAL GO / No findings`。
- **整仓可维护性“全部完成”：NO。** 仍有 3 组明确的 P2 总任务：52 条历史 workspace boundary
  债、剩余领域的广义 generated parity、Host/Studio/CLI 大型模块拆分。它们不再制造第二套产品
  truth，且已有门禁阻止新增债，因此不应冒充阻塞根因，也不能从总任务中删除。
- **大结构方向继续 GO。** 不做第二轮大搬家，不合并已经正确分层的 Authoring、Compiler、Runtime、
  Gameplay、Traversal、World 和 provider adapter。

本轮不是按文件大小或目录整齐度选任务，而是优先消除会持续传播错误设计的根因：竞争 authority、
虚假 public entrypoint、不闭合 Ref、生产依赖测试包、冻结协议 admission 漂移，以及无法阻止新增结构债
的门禁缺口。大规模历史搬迁和 shell 拆分被显式延期，不为了宣称“全修完”而扩大改动面。

## 2. 判断口径与设计原则

- 日期：2026-08-26。
- 模式：[`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) 的 C（整仓审计），
  覆盖 D1–D6；Runtime 判断继续受
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 约束。
- 实现依据：
  [`2026-08-26-authority-root-cause-closure-design.md`](../superpowers/specs/2026-08-26-authority-root-cause-closure-design.md)
  与
  [`2026-08-26-authority-root-cause-closure-implementation-plan.md`](../superpowers/plans/2026-08-26-authority-root-cause-closure-implementation-plan.md)。
- P0：已确认的静默正确性或冻结边界破坏；P1：公共命令、事实源、发布入口或 blocking evidence
  不可信；P2：尚未造成静默错误、但需要计划化治理的工程边界与可维护性债。
- 一个概念只允许一个 public owner；unreleased private Schema 采用 clean break，不用永久 alias
  保存开发历史。
- worker 报告不是集成证据；主 Agent 必须审查 actual diff、处理语义合并并在最终树运行相关门禁。

## 3. 核心根因处置

| ID | 原 finding / 根因 | 当前处置 | 关键闭包证据 |
|---|---|---|---|
| `HSE-00` | Studio Preview 分拆读取，可能跨 attempt 拼接 AuthoringSpec 与 capture groups | **Fixed** | 单一 `/preview-bootstrap` 绑定 record before/after、attempt、evaluation、Authoring hash、完整 final map 和 groups；旧 split routes 移除；stale/cross-attempt/hash/group negatives |
| `HSE-01` | Hosted draft/final/capture contract 使用竞争 identity、双 manifest 和非 Canonical 字段 | **Fixed / clean break** | draft/final 独立 kind；唯一 whitebox tri-view manifest；`visualTargetId`、`imageDataUri`、`imageUri`；unknown-safe diagnostics；旧 types/kinds/fields 只留 negative census |
| `HSE-02` | `studio:public` 只启动 proxy，公开命令并不组成可运行 topology | **Fixed** | 受监督 wrapper 在鉴权后启动 internal Studio；nonce+PID readiness；secret isolation；进程组 SIGTERM→SIGKILL；crash/timeout/port/signal E2E；73/73 Studio tests |
| `WS-00` | active docs 对 M5/R1b 与 Browser Reset possession 的描述互相矛盾 | **Fixed** | docs 00/18 对当前 R1b 与后续 H1/H2/H3 分界一致；docs 20 区分 Host reset 与 Browser `resetWithInitialControlBinding()`，consumer 读取返回 Snapshot |
| `WS-01` | CLI、Browser 和 closure 使用不同 Registry discovery view；Motion Catalog 暴露 dangling parameter refs | **Fixed / clean break** | 唯一 `resolveResource` / `listDiscoverableResources({kind})`；删除 4 套旧 typed list APIs；统一 reference-edge owner；CLI/Browser/Preview/promotion 共用 facade；删除 `parameterSchemaRef` / `runtimeParameterNames` |
| `WS-02` | SubjectPreset DTO、Subject resource kind、Action/Bone/Topology vocabulary 有多个公共 owner | **Fixed / clean break** | 新底层 `@whitebox-world/subject-contracts` 独占 serialized DTO、closed terms 和 guards；旧 Runtime/generic owners 删除；automatic resolver 窄化为 `idle\|walk\|run\|jump`；Authoring 拒绝 stale bone `root` |
| `WS-03` | Canonical JSON 接受并归一化 Frozen Spec 禁止的 `-0` | **Fixed** | object/string/hash/bytes 与 Authoring text/object admissions 全部 fail closed；SubjectPreset numeric override 同步拒绝；Traversal regression fixture 对新 admission 对齐 |
| `WS-04` | Compiler/World 的生产 spawn-safety 不变量位于 `testkit` | **Fixed** | 算法唯一 owner 迁入 `terrain-surface`；diagnostics/order/epsilon/42° 行为不变；零生产 `testkit` import，无 compatibility re-export |
| `WS-05A` | Workspace 图没有 fail-closed floor，新增 deep import/undeclared edge 不会被拦截 | **Fixed floor** | TS AST 扫描 static/export/dynamic/require；拒绝 undeclared、prod→dev、private sibling source、非法 export、prod testing edge 和 cycle；精确 debt ledger 无 wildcard；stale debt 也失败 |
| `WS-06A/B` | check/update 混权、generated check 自愈、independent tests 漏 lane | **Fixed on prior main work** | verifier 默认只读、显式 update；临时 bundle byte-compare；6 Node / 2 Python / 1 Site independent census；root contract/heavy 去重 |
| `WS-07A` | Planner checker 手写且与 Canonical parser 不等价，tracked bundle 无双向 parity | **Fixed** | Planner source 直接消费 `parseSceneBriefV1`；raw Brief bytes hash 保留；valid、duplicate target、second Subject、49-char movement source/bundle exact parity；Planner+Builder 统一 generate/check |

### 3.1 主审中额外纠正的假闭包

1. WS-01 初稿只迁移 CLI/Browser，却保留旧 public list APIs。主审要求并完成 clean break；否则原
   “多 discovery authority” finding 仍成立。
2. WS-01 的正式 producer 原子更新 JSON/hash/PNG 受管目录。PNG bytes 的刷新来自 producer 演进，
   不是 Motion 视觉语义变化；只回退二进制会破坏同一 receipt 的原子一致性。
3. WS-02 合入后 Planner/Builder portable bundles 因公共依赖闭包改变而变 stale。最终 generated gate
   先 RED，再通过唯一 producer 刷新两份 bundle，并由只读 check 与 10 个 parity tests 证明 current。
4. 完整 contract lane 暴露 Simulation Take 测试仍硬编码旧 Placement hashes。三个 received hashes
   与当前正式 producer receipt 一致，因此只更新 exact expectation，不恢复旧 Catalog；focused 1/1
   通过，其他 2020 个 contract tests 的同树通过证据未被该 test-only 修改失效。

## 4. 明确延期的总任务

| ID | 优先级 | 为什么延期而不是忽略 | 推荐交付与验收 |
|---|---:|---|---|
| `WS-07B` | 后续 1 | Public Schema/generated drift 会影响正确性，但 Planner、Builder 与 Hosted wire 的当前高风险切片已闭合；全仓一次性推广成本高 | 按 public contract family 建唯一 source、正负 parity、unknown-key/round-trip；每次只迁一个领域，禁止私有 deep import 换小 bundle |
| `WS-05B/C` | 后续 2 | 当前 52 条历史 debt 是工程边界债，不是 52 个产品 bug；`WS-05A` 已阻止新增并要求 debt 只能下降 | 按 owner 批次消减 exact ledger；补必要 `/testing` exports 与每包 direct deps/tsconfig；每批要求 debt count 下降、零 cycle、无 wildcard |
| `WS-08` | 后续 3 | `scripts/worldkit.ts`、Studio server、recording/Host tooling 偏大，但当前 authority、lifecycle 与 entrypoint 已闭合；立即拆包协调成本最高 | 先稳定 Host primitives，再抽正式 package；保持 Runtime/Camera/Capture 唯一 owner；用 CLI snapshots、readiness/lifecycle 和 build graph 证明无行为变化 |

推荐顺序是 `WS-07B → WS-05B/C → WS-08`。前两项提高机械正确性与依赖纪律；WS-08 主要提升长期
可维护性，应在 public contracts 稳定后分阶段做。52 是当前 ledger 的真实数量；此前 55 中有 3 条已被
WS-01 消除，门禁正确要求同步删除 stale debt，不能为了“数字稳定”保留虚假记录。

## 5. 更新后的门禁策略

| 阶段 | 策略 | 本轮实际应用 |
|---|---|---|
| 影响面建模 | 先列 owner、输入、证据层和 invalidation scope | HSE/WS 任务图明确 depends_on、blocks、独占文件/接口、execution mode |
| TDD / focused | 每个行为修复先 RED，修复后只跑受影响 suite | Preview、Hosted contract、Studio lifecycle、Registry、Subject vocabulary、negative zero、Planner parity、boundary floor 均有 reproducer |
| Generated | producer 与 check 分权；check 只在 temp 生成并 byte-compare | 最终发现 stale bundle 后仅显式 generate 一次，再用 read-only check 收口 |
| Root aggregate | `pnpm test` 内部依次运行 boundary、census、contract、heavy | 不额外重复 `test:scenes`；contract 的单一 stale fixture 采用 scoped rerun，heavy 首次完整执行 |
| Independent | 不从 root green 推导 Node/Python/Site/Browser | Studio、6 Node / 2 Python / 1 Site、四个真实 Browser verifier 分层执行 |
| 证据复用 | 后续修改只使可能受影响的证据失效 | test-only hash expectation 只重跑该 test；文档 truth 更新只需 diff/link/claim check |
| 收口 | frozen install、diff check、tracked tree cleanliness、独立 review | 不通过重复全量命令“证明更绿”；Cursor finding 必须由 Host 复现和裁决 |

这与最新 `main` 的提速意图一致：删除重复 lane，但不删除独立证据层。速度来自正确的 invalidation
模型，而不是少验证 public contract 或用成功 worker report 代替集成。

## 6. 最终实现树证据

| 命令 / 检查 | 结果 | 解释 |
|---|---:|---|
| `git fetch origin main && git merge origin/main` | 0 | `origin/main` 仍为 `749b594`；实现分支已包含最新 main，无文本或语义增量 |
| `pnpm install --frozen-lockfile` | 0 | 27 workspace projects；新 `subject-contracts` 由冻结 lock 正式链接 |
| `pnpm typecheck` | 0 | 最终 TypeScript source tree 通过 |
| `pnpm check:agent-self-check` | 0 | Planner/Builder tracked bundles 与临时 generated bytes 一致 |
| self-check focused | 3 files / 10 tests | source/bundle 正负 parity 与 mutated tracked copy fail-closed 全过 |
| `pnpm test:studio` | 73/73 | atomic Preview、current Hosted contract 与 supervised public topology 同树通过 |
| independent Node | 23/23 | 按 CI 的隔离 Python `pillow + requests` 前置运行，Seedance conformance 通过 |
| independent Python | 11/11 + 6/6 | 两个 manifest-登记 Python suites 通过 |
| independent Site | 1/1 | 按 Site lock `npm ci` 后 production build 与 server-render contract 通过 |
| `pnpm test` boundary/census | 52 debt；206 = 186 + 20 | boundary floor 与 exact lane census 通过 |
| contract lane + scoped fixture rerun | 2020/2021 初次通过；stale fixture 修后 1/1 | 唯一失败是旧 producer hash expectation；test-only 更新不使其余 2020 个结果失效 |
| `pnpm test:resource-heavy` | 20/20 files、344/344 tests | 单 worker；Runtime、Recast/Havok、Browser host、Planner/Builder portable parity 全过 |
| `pnpm build` | 0 | Playground production build，2187 modules；仅保留既有 >500 kB chunk warning |
| `verify:canonical` / `verify:rigged-subject` / `verify:g-bot-subject` / `verify:placement-layout` | 0 / 0 / 0 / 0 | 真实 Browser/Havok checks；全部 `publicationMode: check`，未 promotion tracked artifacts |
| `git diff --check` | 0 | 当前 committed implementation 无 whitespace error |
| Cursor completion review `arc-final-20260826-b` | `FINAL GO / No findings` | read-only；exit 0；review 前后 tree fingerprint 都是 `36356e830e...`，无 tree drift。更早未产出 durable report 的静默尝试不计作证据 |

自动 contract、真实 Browser/render、manual interaction 是不同证据层。本轮没有把自动 Browser smoke
冒充人工交互或 production provider 验证；这些结构修复也没有新增 interiors、vehicles、NPC behavior、
caves、overhangs 或 networking 的生产能力声明。

## 7. 当前合理架构与禁止的“规整”

以下分层继续成立：

- `authoring → compiler → runtime-contracts → runtime-host / runtime-babylon`；
- `gameplay-contracts → gameplay`，Host 独占事务、Session、Journal 与 Publication Barrier；
- `traversal` 与 `traversal-recast`；`world` 与 `world-package`；
- `subject-contracts` 只拥有 serialized DTO/vocabulary，`subject-registry` 拥有发现/解析，
  `subject-actions` 拥有自动选择行为；
- provider-neutral `camera` 与最终 Pose owner `runtime-babylon/CameraDirector`。

明确不做：

- 不恢复 Three/Rapier、Legacy Site bundle 或已删除 packages；
- 不把上述正确分层合并成 `shared/common/utils` 巨包；
- 不为 unreleased private contract 保留双读、alias 或只服务开发历史的 migration；
- 不把 Authoring capture 报成第二 Runtime/Camera owner；
- 不把 Camera 后续接线、mounted relationships、Compound Collider、Ragdoll 或新产品能力塞进结构修复；
- 不为了 line count 拆开强耦合 authority，或为了占用并行 Agent 人为切碎任务。

## 8. 对 Cursor 与补充 ChatGPT 分析的裁决

外部分析对 Gameplay Authority / RuntimeHost、`possessedBy` 唯一 control truth、World/View/Runtime
projection、Camera provider-neutral Domain 的方向判断合理；但旧结论的时间点、P1/P2 分级和“已完成”
声明必须以最新 tree 复验。

本轮没有因为模型来源决定采纳与否：

- 接受了能在当前源码复现的 authority 断链；
- 撤回或延期了没有静默错误证据、只属于未来能力或大规模可维护性的建议；
- 对 Cursor/worker 初稿保留判断权，例如要求彻底删除旧 Registry list APIs，而不是只迁移主要消费者；
- 所有确认修复都有本地 reproducer、focused regression 与集成证据。

## 9. 后续依赖感知工作图

| ID / deliverable | depends_on | blocks | ownership / integration point | required evidence | mode |
|---|---|---|---|---|---|
| `ARC-INT` 当前根因闭包最终集成 | 当前 HSE/WS slice | 无 | 主 Agent独占 report、semantic merge、main push | relevant gates、fresh final review、remote SHA | `main-agent-only` |
| `WS-07B` 分领域扩展 generated parity | `ARC-INT` | 相关 schema release | 每领域唯一 source 与 explicit producer/check | 正负 parity、unknown-key、round-trip、tracked bytes | `sequential` |
| `WS-05B/C` 分批消减 52 条 boundary debt | `ARC-INT` | `WS-08` 的 package extraction | exact ledger owner；public/testing exports；direct deps/tsconfig | debt count 单调下降、zero stale/new、zero cycles | `parallel-safe`（仅不重叠 owner） |
| `WS-08` Host/Studio/CLI composition | 稳定 public contracts；相关 WS-05 debt 已清 | 无 | main Agent保留 architecture/lifecycle；按 stable primitive 抽 package | CLI snapshots、readiness/shutdown、build graph、Studio E2E | `sequential` |

只有依赖 ready、owner 和 integration point 不重叠的工作才能并行；最后集成、cross-cutting interface 和
发布证据继续由主 Agent持有。

## 10. 当前发布判断

**核心根因闭包最终发布判断：GO。** Host 复验和 fresh read-only Cursor completion review 均通过，
独立 review `arc-final-20260826-b` 在同一 tree fingerprint 上返回 `FINAL GO / No findings`。
这不是“整个仓库没有债务”，而是最核心、最差的竞争设计已经被清除；剩余工作已进入有门禁、
有 owner、有验收条件的总任务，不再靠模糊的“以后规整”管理。
