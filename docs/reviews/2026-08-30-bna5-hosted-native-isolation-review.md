# BNA-5 Hosted Native Isolation 实现审查

- 日期：2026-08-31
- 模式：实现候选自审 + capable-runner hostile evidence + exact-SHA Cursor Cloud 全量门禁 + Mode B/security/runtime-deep 独立复核
- 实现基线：`origin/main@14ba724b5660be9d47d90b374cc6ffeae8909e55`
- 产品候选 SHA：`2f46b3c92c175d49b2bf684052be27b6d044658f`
- 范围：BNA5-10、20、30、40、50、55、60、70、90
- 当前裁决：**GO；开放 P0/P1/P2 = 0；PR #58 已合入 `main`**
- 文档提交 SHA：`31a5f728d2844938c3fe3a8e6142a45c69edd48d`
- `main` 合入 SHA：`d6859f2277e352de106ff44ac4317dbc6b28658c`

## 1. 候选结论

BNA-5 候选在不新增 Native 专用 workspace package、第二 RuntimeHost、第二 Gameplay/Camera/Input
状态机或 Hosted command dialect 的前提下，把 verified Native WorldPackage 放入关闭的 Trust Profile、
effective-minimum budget、Host admission、provider-neutral supervisor 和 disposable isolation domain。
Trusted Host 只拥有 admission、lease、deadline、attestation、protocol sequencing 与 cleanup；现有
RuntimeHost/WorldSession/Babylon/Havok/Subject/Camera/Input/fixed Tick 整体位于执行域内，Babylon/Havok
handle 不跨边界。

正式 Hosted Docker provider 只接受 Host mint 的 request identity，使用 digest-only image、固定非 root
UID/GID、user namespace、无网络、只读 root、只读 Package bind、独立 tmpfs、cap-drop、no-new-privileges、
seccomp、PID/CPU/memory/output/protocol limits。Dedicated-Origin Browser lane 的 shell/runtime origin 只来自
Host 配置；Runtime CSP 的 `frame-ancestors` 只允许精确 shell origin，第三方嵌入与 query override 均失败。

本审查只裁决 BNA-5 隔离机制。它不宣称 BNA-6 AI 生成评测、BNA-7 正式 Capture/Route Evidence、BWB-5
重建语料或 BNA-8 最终生产 disposition 已完成，也不把参考 Docker/Colima runner 宣称为已选定生产厂商。

## 2. 权威与合同闭合

### D1 定位与边界

- `nativeSceneProfileRef` 仍只描述结构；`nativeExecutionTrustProfileRef` 是唯一执行信任选择。
- Hosted Isolated 没有 in-process、`node:vm`、Worker、same-user child 或 Trusted Local fallback。
- 容器和 iframe 是 provider 实现术语，不进入 Authoring、WorldPackage 或 AI-facing Schema。

### D2 Schema 与 AI 友好性

- Request、Result、Receipt、Trust Profile、Cap、effective budget 与 transport envelope 都是 exact-key、
  current-only、单 parser 合同；没有旧 alias、双字段或新旧解析路径。
- effective budget 是 Package、Host、tenant 三方逐字段最小值；调用方不能提高任何 cap。
- Browser 只使用 Runtime Session Protocol V1 envelope；没有第二套 Gameplay/Camera command language。

### D3 承诺与事实

- Host 在 provider allocation 前绑定 verified Package root、Trust Profile/hash、runner identity/image digest、
  sandbox policy hash、effective budget/hash、operation、Runtime Session 与 fresh nonce。
- Runtime usage 是 trusted runner 对 Host post-ready fresh challenge 的观测；Module stdout 既不是 attestation
  也不能预计算 proof。Receipt/attestation 的过程、elapsed、cleanup 与 result 由 control plane 生成。
- Browser 证据与 Linux 容器证据分开：Origin/CSP 通过不冒充 container isolation，Cloud VM 缺少 rootless
  control 也不能替代 capable-runner hostile replay。

### D4 单一权威

- `NativeIsolationSupervisorV1` 独占 prepare/start/ready/submit/terminate/receipt/quarantine/dispose phase 与首个
  terminal reason；provider 只实现 lease，不保留第二 lifecycle state machine。
- RuntimeHost/WorldSession 继续独占 Gameplay/Havok/Subject/Camera/Input/fixed Tick/Snapshot/Reset/Replay。
- `checkSupport()` 仍是 Character ground support 唯一权威；BNA-5 未增加 ray/AABB ground inference。

### D5 工程质量

- admission cutoff、forged request、wrong identity/hash、timeout、cancel、provider loss、nonce/sequence、
  oversized messages、attestation rejection、receipt drift、cleanup failure 与 throwing dispose 有 focused 回归。
- Linux hostile suite 覆盖 network、environment、filesystem、process、cross-run read/write、CPU、memory、output
  与 protocol。CPU fixture 先完成 authenticated challenge，再由 provider/Supervisor timeout，而非 outer harness
  SIGKILL 伪造成功。
- 双租户并发、顺序复用、Host canary 与 retained-container census 证明 isolation domain 不跨 run 泄漏。

## 3. 候选期发现与修复

### [已关闭 P1] 未经 Host mint 的结构合法 request 可到达 provider allocation

- 证据：历史候选只 parse DTO；攻击者可复制结构和 hash 后直接调用 provider/supervisor。
- 期望：正式 request 必须由唯一 Host admission mint，任何 clone 在 allocation 前 fail-closed。
- 影响：绕过 Package/Trust Profile/effective budget 决策，直接占用隔离资源。
- 建议：Host 用不可伪造的 process-local possession 标记绑定 exact parsed request；supervisor 与 Docker
  provider 两层都断言 possession，但不公开 token/alias。
- 复核：当前 `assertHostAdmittedNativeExecutionRequestV1` 在 provider allocation 前拒绝 clone；对应 Host/
  supervisor/provider focused 回归通过。已被 Codex 复核确认关闭。

### [已关闭 P1] guest stdout 可伪造 runtime usage

- 证据：历史候选接受紧随 ready 的 guest-authored usage JSON，Native Module 可预先输出相同 shape。
- 期望：usage 必须绑定 Host 在 ready 后生成的不可预知 challenge，且 identity/proof 全部 exact-match。
- 影响：Module 可低报 mesh/material/shader/physics body，破坏 Receipt 资源事实。
- 建议：Host 生成 32-byte fresh nonce；trusted runner 验证 request identity 后回传 challenge-bound proof；
  unexpected/precomputed stdout 按 protocol violation 关闭。
- 复核：runtime-usage frame、runner distribution、injected/precomputed output 回归通过。已被 Codex 复核确认关闭。

### [已关闭 P1] Browser origin 可由 query 改写且 Runtime CSP 未限制嵌入者

- 证据：历史 shell 读取 `runtimeOrigin` query；Runtime response 未给唯一 `frame-ancestors`。
- 期望：shell/runtime origin 只来自 Host deployment config；Runtime 只允许配置 shell 嵌入。
- 影响：攻击者可把 Runtime Session protocol 导向第三方 origin，或从第三方页面嵌入 Runtime。
- 建议：删除 query dialect，精确校验 HTTP(S) origin；未知 Host fail-closed；CSP 使用唯一
  `frame-ancestors <shellOrigin>`。
- 复核：恶意 query、第三方 embed、missing/duplicate frame-ancestors 与 exact source/origin/nonce/sequence
  均有真实 Browser 证据。已被 Codex 复核确认关闭。

### [已关闭 P1] CPU hostile case 由 outer harness 终止

- 证据：历史 fixture 由 1.5 秒 harness kill，只证明测试进程会杀容器，不证明 provider/Supervisor deadline。
- 期望：CPU case 经真实 Docker provider + Supervisor handshake，稳定终态必须为 `timeout`，outer harness
  只作更晚的 fail-closed watchdog。
- 影响：生产 deadline/receipt reason 可能失效而 verifier 仍误报绿。
- 建议：明确 `10s provider < 30s supervisor < 45s harness`，Receipt 必须记录 provider-owned timeout。
- 复核：capable runner 报告 `executionAuthority: native-isolation-supervisor`、`terminationReason: timeout`；
  authenticated fixture 与 invalid zero hash 都有 RED→GREEN。已被 Codex 复核确认关闭。

### [已关闭 P2] clean-break 只扫描 BNA-owned 文件

- 证据：历史 verifier 未扫描全仓 packages/apps/scripts，旧 alias 可移到普通模块逃逸。
- 期望：禁止 alias/fallback/direct request bypass 必须跨生产源码；必要术语只作精确、最小 allowlist。
- 影响：current-only clean break 可被路径搬移绕过。
- 建议：扫描全仓生产目录，并对 Authoring `trustProfileRef` 使用精确文件 allowlist。
- 复核：585 文件、15 个对抗测试、0 diagnostics；非 BNA 路径注入会失败。已被 Codex 复核确认关闭。

### [已关闭 P2] Receipt elapsed/duration 使用非 monotonic `Date.now()`

- 证据：壁钟回拨会得到负数或彼此不同的 elapsed/duration。
- 期望：一个 process-local monotonic origin 生成一次 terminal elapsed sample，复用于 usage 与 Receipt。
- 影响：deadline 证据与 Receipt duration 可漂移或失真。
- 建议：使用 `performance.now()`，终态只取一次向上取整的非负 elapsed。
- 复核：monotonic clock 回归与 CPU receipt 通过。已被 Codex 复核确认关闭。

### [已关闭 P1] Origin 加固后 standalone Native verifier 被 unknown-Host CSP 锁死

- 证据：`verify:native-scene-playground` 使用随机端口，Vite middleware 对非配置 Host 返回
  `default-src 'none'`，页面停在 LOADING。
- 期望：unknown Host 仍 fail-closed；正式 verifier 通过 Host 配置声明自己的精确 shell origin，而不是给
  任意 localhost 放宽 CSP。
- 影响：BNA-4 真实 Havok/Camera/collider 回归失效，Cloud gate 无法执行。
- 建议：verifier 先分配 loopback port，设置 exact shell/runtime origins，再 strict-port 启动 Vite。
- 复核：保留 Browser RED；修复后走路、跳跃/落地、Camera reset、三个 Collider、四次 Runtime create 与
  0 browser error 全部通过。已被 Codex 复核确认关闭。

### [已关闭 P2] CPU hostile fixture 未登记到唯一 test-gate manifest

- 证据：`a424501` 的 exact-SHA Cloud full gate 首次执行 `pnpm test` 时由 census 报告
  `UNCLASSIFIED: scripts/native-scene/hosted/hostile-fixtures/cpu.test.ts`，并正确给出 NO-GO。
- 期望：每个根 Vitest 文件恰好进入 contract 或 resource-heavy lane，不能靠 focused 命令绕过整仓门禁。
- 影响：CPU authenticated-handshake 回归存在于源码但不由默认 `pnpm test` 执行。
- 建议：把该快速 child-process contract test 加入现有唯一 `TEST_GATE_MANIFEST_V1`，不创建第二清单。
- 复核：`4cf5748` 只增加该 manifest row；`pnpm test:census` 报告 348 = 311 contract + 37
  resource-heavy，focused census/CPU 12/12 通过。已被 Codex 复核确认关闭。

### [已关闭 P1] 等 deadline 的 timeout Receipt 会因真实 cleanup latency 被误判无效

- 证据：正式 provider 默认使用 admitted wall cap 作为 process deadline；Supervisor 也使用同一 cap。
  timeout 触发后还需采样 cgroup、终止完整 container domain 并完成 cleanup，因此 control plane 记录的
  `actualWallTimeMilliseconds` 会诚实地超过 cap。历史 verifier 对所有 outcome 一律要求 wall usage 不超过
  cap，导致合法 timeout 进入 `NATIVE_ISOLATION_RECEIPT_INVALID` quarantine。
- 期望：预算继续由 provider/Supervisor 强制执行；Receipt 保留真实观测。仅 `terminated/timeout` 可在 wall
  字段记录 deadline 后 cleanup latency，completed 与所有其他 usage 字段继续严格 fail-closed。
- 影响：生产默认 deadline 路径会把正常资源终止误报为隔离证据损坏，隐藏真正 timeout 原因并触发错误
  quarantine。
- 建议：在 Receipt verifier 按 exact terminal reason 解释 wall evidence；不要 clamp、伪造或丢弃实际值。
- 复核：contract 与 Supervisor 的 matching-deadline RED 在修复前分别失败；修复后 30/30 focused 通过。
  capable runner 以 `5000ms provider === 5000ms Supervisor` 实跑，记录 `5250ms` observed wall、
  `reason: timeout`、`receiptAccepted: true`；completed wall overrun 与 unrelated budget overrun 仍被拒绝。
  已被 Codex 复核确认关闭。

### [已关闭 P2] Dedicated Runtime Origin 暴露整个 Playground public tree

- 证据：历史 Native Vite 配置把 `apps/playground/public` 直接设为 `publicDir`；Runtime Origin 可 200 读取
  其他 scene plan、reference image 和未被当前 Package 引用的 Subject GLB。CSP 的 same-origin source 不能
  构成内容寻址文件 allowlist。
- 期望：Runtime Origin 只提供当前 verifier-accepted WorldPackage inventory 以及由精确内容 hash 绑定的
  admitted Subject asset；未登记的 same-origin public path 必须 404。
- 影响：不可信 Runtime Module 可读取同一部署中其他 case/tenant 的静态内容，扩大数据暴露面并破坏
  Package identity 边界。
- 建议：关闭 Vite `publicDir`；复用现有 WorldPackage directory verifier 建立 exact serve map；把路径/hash
  inventory 纳入 Browser policy identity，并要求 Subject fetch 携带唯一 content-hash query。
- 复核：Browser RED 对 unrelated world-plan 首次得到 200；修复后 unrelated scene/Subject、admitted Subject
  缺 hash 均为 404，精确 hash 的 GLB byte hash 匹配并可正常启动 Cloud Ridge。CSP default 改为 none，
  Host-configured origin、第三方 embed、Runtime Session、Havok traversal 均继续通过。已被 Codex 复核确认关闭。

### [已关闭 P2] Vite 开发服务器仍可通过 `/@fs` 读取仓库文件，且配置直接导入 workspace 源码导致稳定启动失败

- 证据：关闭 `publicDir` 后，历史配置仍让 Vite 的 `/@fs/<repository>/package.json?raw` 返回 200；同时
  `vite.config.ts` 直接导入 workspace Package 的 TypeScript 源码，稳定 `pnpm dev:native-scene` 由 Vite
  config loader 触发 `ERR_MODULE_NOT_FOUND ... package-contract.js`，只有特定预打包路径能够启动。
- 期望：Runtime Origin 只读取 Native app、根安装依赖和当前运行时依赖闭包；仓库根、其他应用与 case
  文件均不可达。稳定开发命令必须直接启动，不能依赖 verifier 的偶然加载方式。
- 影响：恶意 Module 可绕过静态 serve map 读取同一 checkout 的源码或配置；正式开发入口与 Browser
  verifier 的启动语义不一致，可能隐藏部署故障。
- 建议：`server.fs.strict = true`，allowlist 只包含 Native app、根 `node_modules` 与从 manifest 推导的精确
  transitive runtime workspace package 目录；Browser policy hash 同时绑定该 package name closure。Vite
  config 只执行最小 closed receipt/root checksum 校验，不跨 package 直接加载 TypeScript 实现。
- 复核：行为 RED 中仓库根 `package.json` 首次返回 200，稳定命令首次报模块解析错误；修复后仓库根
  `/@fs` 返回 403，Browser evidence 输出 `repositoryRootFileSystemBlocked: true`，稳定
  `pnpm dev:native-scene` 在约 219ms 内进入 ready，Native Browser verifier 与 production build 均继续
  通过。已被 Codex 复核确认关闭。

## 4. 本地与 capable-runner 证据

| 命令/证据 | Exit | 结果 |
| --- | ---: | --- |
| 本轮受影响 focused Vitest set | 0 | 4 files / 44 pass；Receipt/Host/provider/control-plane usage |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `pnpm check:agent-self-check` | 0 | Planner/Builder bundles current |
| `pnpm native:cloud-ridge:package:check` | 0 | Package root `0d2079db…3214` byte-exact |
| `pnpm verify:bna2-clean-break` | 0 | 881 files；0 diagnostics |
| `pnpm verify:bna5-clean-break` | 0 | 585 files；全部 7 项 true；0 diagnostics |
| `pnpm verify:workspace-boundaries` | 0 | 49 registered debt；无新增边界债务 |
| `pnpm verify:hosted-native-browser` | 0 | malicious query/third-party embed 拒绝；Runtime frame-ancestors 精确；unrelated public asset 404；Subject content hash 必需；仓库根 `/@fs` 403 |
| `pnpm verify:native-scene-playground` | 0 | Havok traversal/jump/landing/Camera reset/Collider identity；0 browser error |
| `pnpm dev:native-scene` | 0 | 稳定开发入口进入 Vite ready 后人工终止；未依赖 verifier-only 配置 |
| `pnpm build:native-scene` | 0 | Vite production build 通过；仅既有 chunk-size advisory |
| `DOCKER_CONTEXT=colima-bna5-evidence pnpm verify:hosted-native-isolation` | 0 | userns/seccomp/cgroup v2；11 hostile cases；matching deadline 5000/5000ms、observed 5250ms Receipt accepted；并发/复用/cleanup/canary 全绿 |
| `git diff --check` | 0 | 通过 |

容器 evidence identity：runner image
`sha256:fe411b64b021d114d8e798d84cc70f5e773ed709c4ef820dbc9f684a99f8d25a`；sandbox policy
`sha256:70df8b8e054ce4240f070a72553f52a60f46f54b8ac5f1fea2abe3a00209228a`；Package root
`sha256:0d2079db1526abd29587a744b90cb937947004e709d79d9200a404574b843214`；retained container count 0；
Host canary unchanged。

## 5. Exact-SHA Cloud 证据与裁决

以下 Agent 只审产品候选 `2f46b3c92c175d49b2bf684052be27b6d044658f`。旧 Agent 曾依次发现
standalone Native verifier origin、CPU hostile fixture census、matching-deadline Receipt、过宽 `publicDir`、
稳定 Vite 启动与 `/@fs` 边界问题；每次产品代码改变后均取消旧任务并重新绑定精确 SHA。旧结果只作为
已复验线索，不构成当前 GO 证据。

| 责任 | Agent / Run | 结果 |
| --- | --- | --- |
| exact-SHA full gates | `bc-0fc9afa4-5133-44fa-bec8-0049ad7183a7` / `run-b5e40964-2f93-4415-96f9-e9cec6a5c3df` | **GO**；3719 contract pass / 3 skip，584 resource-heavy pass，Studio 75 pass，build 与全部可跑专项门禁通过 |
| Mode B/security/runtime-deep | `bc-66d50f28-4ee9-464e-ad9d-8f9035293c91` / `run-22583448-19f3-4bc0-9049-0f88f66c7ce7` | **GO**；开放 P0/P1/P2 = 0；85 + 13 focused、typecheck、BNA5 clean-break、两项 Browser verifier 通过 |

独立复核明确把 Docker-less Cloud 的 `HOSTED_NATIVE_DOCKER_CLI_UNAVAILABLE` 记录为未运行而非失败，
没有用 Browser 绿替代 container isolation。它给出三个非阻断 P3：Docker-less verifier 可选择输出稳定 JSON、
Receipt `durationMilliseconds` 可在未来加强与 wall usage 的交叉一致性、生产 Hosted 静态宿主必须保持
deny-by-default 而不能把 Vite 开发 fallthrough 当作生产边界。它们不改变 BNA-5 当前合同，但已作为
BNA-8 生产部署审查输入保留。Full-gate Cloud 环境同样无 Docker，因此明确把 container verifier 标为
environment-unavailable；它没有覆盖或否定上文 capable-runner 的 11-case container evidence。

最终裁决：产品 SHA `2f46b3c92c175d49b2bf684052be27b6d044658f` 在 capable-runner、本地 Browser/
Havok、exact-SHA Cloud full gates 和独立 security/runtime-deep 四层证据下 **GO**。BNA-5 范围完成；
BNA-6、BNA-7、BWB-5 与 BNA-8 仅解除相应依赖，不因此完成。

集成裁决：PR #58 以 merge commit `d6859f2277e352de106ff44ac4317dbc6b28658c` 合入
`main`；产品 SHA `2f46b3c92c175d49b2bf684052be27b6d044658f` 与文档 SHA
`31a5f728d2844938c3fe3a8e6142a45c69edd48d` 均已通过 `git merge-base --is-ancestor`
验证为 `origin/main` 祖先。

## 6. D1-D6 覆盖表

| 维度 | 状态 | 证据 |
| --- | --- | --- |
| D1 定位与边界 | 已查 | BNA-5 isolation only；BNA-6/7/8 与 vendor production 未冒充完成 |
| D2 Schema 与 AI-friendly | 已查 | exact current-only contracts；单 Trust selector；无 Hosted command dialect |
| D3 承诺与事实 | 已查 | Package/Profile/budget/runner/policy/session/usage/Receipt identity 全链绑定 |
| D4 单一权威状态 | 已查 | Supervisor lifecycle；RuntimeHost/SDK Gameplay/Havok/Camera/Input/Tick 不迁移 |
| D5 工程质量 | 已查 | hostile、并发、复用、partial/throwing cleanup、Browser origin/CSP、精确静态与 `/@fs` 边界、稳定 Vite 启动、真实 Havok |
| D6 门禁与证据 | 已查 | local affected + capable runner + exact-SHA Cloud full gates + independent review 均 GO；Docker-less Cloud 未冒充 container evidence |
