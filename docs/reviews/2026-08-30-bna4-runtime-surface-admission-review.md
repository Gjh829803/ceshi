# BNA-4 Runtime Surface Admission 实现审查

- 日期：2026-08-30
- 模式：实现候选自审 + exact-SHA Cursor Cloud 全量门禁 + Mode B/runtime-deep 独立复核
- 实现基线：`origin/main@2fd8c1c2694a861e213ad2c72e9cb3aefec087ce`
- 产品候选 SHA：`dfa6fbcdc18d3b6fa9fedce741efc1ec0dcb53d7`
- 范围：BNA4-00、10、20、30、40、50、60、90
- 当前裁决：**GO；无开放 P0/P1/P2**

## 1. 候选结论

BNA-4 候选已把 receipt-bound Babylon Native WorldPackage 接入现有 source-neutral
`RuntimeHost`、`WorldSession`、Gameplay、Subject、Camera、fixed Tick 和 Havok Runtime。Native Module
仍只在 Host 提供的 Candidate Scene 中构造视觉对象并登记 Spawn/静态 Collider intent；实际碰撞 Mesh、
`PhysicsShapeMesh`、`PhysicsAggregate`、Character support、相机、输入和生命周期继续由 SDK 单一拥有。

Cloud Ridge 示例不再直接创建 `BabylonWorldRuntime`，而是先读取并验证完整 Package，再由唯一 Adapter
创建 Candidate、等待首帧 readiness 并原子发布。Canonical 与 Native 使用同一个 RuntimeHost create、
replace、Full Reload reset 和 dispose 事务，没有新增 Native RuntimeHost/package 或兼容重载。

## 2. 实现闭合

### D1 定位与边界

- `RuntimeWorldAdapterDescriptorV1.sceneSource` 是关闭的 Canonical/Native union；RuntimeHost 不接收
  Babylon 对象、Package Directory 或 Module 对象。
- BNA-4 只完成 trusted-local Runtime/Havok admission。Hosted/Worker 隔离、租户资源上限、执行环境
  provenance 和恶意代码安全仍属于 BNA-5，不在本候选中冒充已完成能力。
- `apps/native-scene-playground` 是正式组合链路的验证应用，不是第二套 Runtime 内核。

### D2 合同与 AI 友好性

- Runtime 输入只接受 `VerifiedBabylonNativeWorldPackageDirectoryV1 + Host loader`；旧 `module/assets/budget`
  raw 字段和直接 create 路径已删除。
- Package 派生唯一 Bootstrap、Bundle ref/bytes、Dependency/Asset Lock、Contribution、Registry membership
  和资源预算；调用方不能另传碰撞预算或未锁资产 fallback。
- Cloud Ridge Bootstrap 只由唯一 Authoring Workspace parser 读取；打包器直接消费该解析结果，浏览器
  运行时只消费 verified Package，不保留第二份 Bootstrap parser/运行时常量。

### D3 承诺与事实

- 实际 replay Contribution 必须与 Package/Receipt/World Build Identity 中冻结的 Contribution canonical
  bytes/hash 完全相等，才允许创建 Havok body、Subject 和 SDK Camera。
- Host loader 是 BNA-4 的 trusted capability：Runtime 传入精确锁定且新拷贝的 Bundle bytes、Manifest、Ref
  和 Dependency Lock，并关闭错误文本。BNA-4 不把该 trusted-local loader 宣称为安全沙箱。
- Browser 证据证明 Spawn、三个 Collider、落地、跳跃着陆、主路径、Camera reset 与连续 Full Reload；
  不把白膜示例证据扩大为 Hosted、多租户或最终 Capture 生产验收。

### D4 单一权威

- RuntimeHost 独占 create/replace/publication/reset/dispose；Native Module 没有 Engine、Scene publication、
  Render Loop、Havok、Subject、Camera、Input、timer 或独立 Tick 权威。
- public `RuntimeHost.reset()` 保持仓库统一 Full Reload；provider-local `BabylonWorldRuntime.reset()` 只重置
  当前 Runtime 状态。两者是不同抽象层的既有语义，不是两套公开 Native reset dialect。
- Babylon authority probe 会临时检查 process-global Material Observable，因此同一 JS realm 内只串行
  admission build epoch；已完成的 Runtime 实例仍可并发且完全隔离。

### D5 工程质量

- initial create、Canonical/Native 互换、failed replacement 保留旧 publication、loader/Scene/Havok/Camera/
  Subject/readiness partial failure、throwing cleanup、双实例与 30/60/120-like cadence 均有聚焦回归。
- 清理使用逆序 owned-disposer stack，即使一个 disposer 抛错也继续尝试后续资源，并只发布稳定关闭诊断。
- `@babylonjs/core@9.23.0` 源码确认：传入现有 `PhysicsShape` 时 `PhysicsAggregate` 把
  `_disposeShapeWhenDisposed` 设为 false（`physicsAggregate.js:55-60`），其 `dispose()` 只销毁 Body 而不
  重复销毁 supplied Shape（`:151-159`）。Runtime 因此按 Aggregate -> Shape -> private Mesh 逆序释放。
- `@babylonjs/havok@1.3.14` 是 lockfile 安装实现；Native Module 不直接 import、创建或销毁 Havok 对象。

### D6 门禁与证据

本地只运行受影响门禁；整仓重型门禁交给精确 SHA Cursor Cloud，避免重复占用本地机器：

| 命令 | Exit | 结果 |
| --- | ---: | --- |
| Package Runtime/RuntimeHost/WorldPackage CLI focused suites | 0 | 3 files / 53 pass；Contribution/initial readiness/CLI source-neutral load |
| Native Surface + Runtime suites | 0 | 2 files / 162 pass；真实 Native Havok、step、cadence、cleanup |
| Character Body + real Havok conformance suites | 0 | 3 files / 95 pass；真实 support contact 携带四项 Surface identity |
| Native app/migration suites | 0 | 4 files / 11 pass；Package Module 单一执行权威与 Canvas cleanup |
| Headless/WorldPackage/Durable/Session focused suites | 0 | 4 files / 30 pass；source-neutral load 与 Canonical-only adapter 边界 |
| RuntimeHost + Canonical Playground readiness regression | 0 | 13 files / 211 pass；initial control 在唯一 readiness 前提交 |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `pnpm build:native-scene` | 0 | Native Playground production build 通过 |
| `pnpm test:census` | 0 | 336 files = 300 contract + 36 resource-heavy |
| `pnpm native:cloud-ridge:package:check` | 0 | byte-exact；Package `c42b85cc…d7a07` |
| `pnpm verify:bna1-clean-break` | 0 | diagnostics 0；删除已被 BNA-4 取代的 formal rejection 守卫 |
| `pnpm verify:bna2-clean-break` | 0 | diagnostics 0；唯一 Workspace parser/import profile |
| `pnpm verify:unreleased-clean-break` | 0 | forbidden match 0 |
| `pnpm verify:native-scene-playground` | 0 | 落地/跳跃/主路径/相机通过；4 次 Runtime create；0 browser error |
| `git diff --check` | 0 | 通过 |
| Cursor Cloud exact-SHA full gates | 0 | 336 tests 分类；contract 3631 pass / 3 skip；resource-heavy 574 pass；两个 production build、Package、clean-break、Browser verifier 全绿 |
| Cursor Cloud Mode B + runtime-deep | 0 | 10 files / 98 pass + Native 11 pass + real Havok 23 pass；无新增 P0/P1/P2 |

Browser 最终位置为 `[~0, 14.030374, -39.319647]`，physics body count 为 4（3 个静态代理 + 1 个
Character），Contribution hash 为
`sha256:bb339a494526ee6bb51a40ec351777bfcb77dcc0bc08a9fa2886a63c9215d984`。

## 3. 候选期发现与修复

### [已关闭 P1] [D4/D5] Babylon process-global authority probe 并发串扰

- 证据：两个同时构造 `StandardMaterial` 的合法 Native admission 会互相覆盖 Babylon Material 事件
  Observable instrumentation，导致其中一个被错误拒绝。
- 期望：审计必须 fail-closed，但并发合法 Candidate 不得因 Host instrumentation 共享状态而失败。
- 影响：并发创建两个 Native WorldSession 时可能出现非确定性 admission failure。
- 建议：在单 JS realm 内串行完整 probe/build/restore epoch；不得缩小 Authority Audit。
- 复核：已加入 RED 回归；`candidate-admission.ts` 使用 finally 释放的独占 Promise lease，259 个审计/
  replay 测试通过。已被 Codex 复核确认关闭。

### [已关闭 P2] [D2/D3] 旧 BNA clean-break 仍要求正式 Native 永久拒绝

- 证据：BNA-1/BNA-2 verifier 仍查找 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`，与 BNA-4
  current-only 正式接入相冲突。
- 期望：BNA-4 删除旧拒绝、旧静态 AST guard 及其测试，不保留兼容包袱；实际 preallocation failure
  cutoff 由 RuntimeHost/Package/Runtime 行为回归负责。
- 影响：正确实现无法通过 clean-break，且旧 verifier 会把已删除设计重新固化为权威。
- 建议：删除过期 diagnostic/fixture，不添加 bypass allowlist。
- 复核：BNA-1/BNA-2 verifier 自测与真实仓库门禁均通过；已被 Codex 复核确认关闭。

### [已关闭 P1] [D1/D5] Package 直接依赖与构建脚本 Workspace 边界不闭合

- 证据：历史候选 `a431a4590a3beb9e9b37e6269ca6fea2d1f2a735` 的 exact-SHA Cloud 整仓测试在
  `verify:workspace-boundaries` 发现两项真实违规：公开 Cloud Ridge Module import
  `@whitebox-world/native-babylon`，但 `apps/playground` 未声明直接依赖；仓库级 Package builder 又跨边界
  import `apps/native-scene-playground/src/native-bootstrap.js` 私有 App 源码。
- 期望：每个 Workspace 自己声明所 import 的依赖；Repository builder 只消费公开合同和稳定 Authoring
  输入，不把验证 App 的私有实现变成生产构建权威。
- 影响：严格 pnpm layout 下生成 Module 可能无法解析依赖；Builder 与 App 形成反向私有源码耦合，使
  Package identity 和 Bootstrap ownership 随 App 重构漂移。
- 建议：给实际 Module 宿主声明直接依赖；Builder 使用公开 Native admission 和 Gameplay/Runtime
  Bootstrap parsers 读取稳定 JSON 输入；把浏览器专用 Subject Asset resolver 从 Bootstrap Authoring
  parser 分离。不得新增 workspace debt 或 allowlist。
- 复核：已加入直接 workspace dependency，删除跨 App 私有 import，重新生成 Package；
  `verify:workspace-boundaries`、typecheck、Package byte-exact check、Native App 聚焦测试和 Browser verifier
  均通过。已被 Codex 复核确认关闭。

### [已关闭 P1] [D3/D4] 运行时 Contribution 对象未重新钉住 Receipt 身份

- 证据：历史候选允许调用方在保持 Manifest/Receipt/WBI hash 不变时替换
  `verifiedWorldPackage.nativeSceneContribution` 对象；旧 preflight 只比较 descriptor，没有在 Module loader 前
  重算该对象的 canonical hash。
- 期望：实际 replay 的 Contribution 必须同时等于 Manifest、Receipt Manifest 和 World Build Identity 的
  唯一 `nativeSceneContributionHash`，且失败发生在 Module、Engine、Scene、Havok 分配前。
- 影响：一个结构上伪装成 verified 的 Package 对象可能把未收据绑定的 Spawn/Collider 送入 Runtime。
- 建议：在 Runtime Package preparation 最前面重算 Contribution hash，并与三处冻结身份逐项 `===`。
- 复核：加入 forged Contribution RED；当前实现以
  `WORLDKIT_NATIVE_SCENE_RUNTIME_PACKAGE_MISMATCH` 在 loader 调用前关闭，focused 5 pass。已被 Codex
  复核确认关闭。

### [已关闭 P1] [D2/D3] 共享 Package loader 仍保留 BNA-3 Native capability rejection

- 证据：历史候选的 `loadRuntimeWorldConfigurationFromPackageDirectoryV1` 对已经验证的 Native Package
  仍返回 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`，与 BNA-4 current-only admission 相冲突。
- 期望：共享 loader 对 Canonical/Native 使用同一个 source-neutral Runtime configuration projection；只在
  具体 Host adapter 不具备该 Scene Source 能力时返回 adapter-specific、非历史兼容的关闭错误。
- 影响：CLI/Host 无法消费正式 Native Package，旧里程碑守卫成为第二权威。
- 建议：删除旧守卫并复用 RuntimeHost 的唯一 Package projection；Canonical-only headless adapter 在自己的
  边界诚实拒绝 Native，不伪装为 BNA-4 未完成。
- 复核：共享 loader 的 Canonical/Native 测试均通过；旧 diagnostic 只保留在“不得出现”的负向测试和历史
  文档中。已被 Codex 复核确认关闭。

### [已关闭 P2] [D3/D4] Cloud Ridge 校验 Package bytes 却执行 `src/scene.ts`

- 证据：历史候选 browser loader 校验 `native/scene.mjs` bytes/hash 后，`main.ts` 实际静态 import 的仍是
  `./scene.js`，形成 packaged Module 与 executed Module 两份可漂移权威。
- 期望：构建实际执行的 ESM 必须由 checked-in Package 的 `native/scene.mjs` 精确字节产生，并把对同一
  Buffer 计算的 hash 送入 Runtime preflight。
- 影响：Package/Receipt 可以全绿但浏览器执行另一份代码，exact replay 声明失真。
- 建议：由 Vite virtual module 从 Package bytes 生成唯一执行 Module；删除正式入口对 source Module 的 import。
- 复核：`main.ts` 只 import Package virtual module；build-time hash、verified Manifest 和请求 bytes 三方不等即
  在 Candidate 前失败；Native build 与 4 个 App suites 通过。已被 Codex 复核确认关闭。

### [已关闭 P2] [D4/D5] Initial WorldSession 未经过 publication readiness gate

- 证据：历史候选只在 replacement 调用 `awaitCandidatePublicationReady`，`RuntimeHost.create()` 在初始
  `WorldSession.create()` 后直接发布 Host。
- 期望：initial 与 replacement 使用同一个 adapter readiness boundary；失败必须释放初始 Port/Session，且
  不泄漏 provider 私有错误。
- 影响：首个世界可能在 GPU/Havok/首帧尚未 ready 时被发布，或初始化失败后留下资源。
- 建议：构造 Host 前以初始 snapshot 调 readiness gate；失败 best-effort dispose 后返回关闭诊断。
- 复核：initial success/failure RED→GREEN；Headless 双阶段 ready 与 throwing cleanup 回归通过。已被 Codex
  复核确认关闭。

### [已关闭 P2] [D3/D4] 初始控制绑定落在 readiness 之后并重复首帧

- 证据：exact `b2e3d20` 的全量门禁和独立审查都稳定复现 Canonical Catalog coordinator
  `renderFrame` 期望 1 次、实际 2 次。`RuntimeHost.create()` 先对未绑定控制的 Session 执行
  publication-ready，Coordinator 随后执行 `control.bind` 并再次 `renderFrameWhenReady()`；Native Playground
  也在 Host ready 之后另行绑定控制。
- 期望：调用方已经知道初始 Controller/controlled Entity 时，绑定必须属于 RuntimeHost 初始创建原子事务，
  在唯一 publication gate 之前提交；不得保留 bind-after-ready 或第二首帧 shadow readiness。
- 影响：Canonical 创建多绘制一帧，Native 首个 readiness 又没有覆盖绑定后的状态；受影响 contract 测试为红，
  initial 与 replacement 的原子语义不一致。
- 建议：给关闭的 `RuntimeHostCreateOptionsV1` 增加严格 optional `initialControlBinding`，复用已冻结的
  `RuntimeHostInitialControlBindingV1`，在 WorldSession create 后、readiness 前提交；Canonical/Native Playground
  删除各自的 post-ready bind/render。
- 复核：保留原 Catalog RED 并新增 RuntimeHost owner-level RED；当前 RuntimeHost/Playground 13 files / 211 pass，
  Native App 4 files / 11 pass，Browser verifier 4 次 create、主路径/跳跃/相机均通过。上一候选
  `7e556f8` 的独立复核进一步发现 replacement 与 create 两项覆盖缺口；最终 `dfa6fbc` 已把
  create/reset/P16 replacement 全部收敛到 Host-owned bind-before-ready，并由 exact-SHA Cloud 独立复核确认关闭。

### [已关闭 P2] [D4/D5] P16 replacement 在 readiness/publication 后补交控制绑定

- 证据：上一候选 `7e556f8` 的 Coordinator 在 `publishWorldReplacementV1()` 成功发布后才调用
  `control.bind`；失败不会回滚已发布 Candidate，形成 publication 与 possession 两个提交点。
- 期望：create、reset 与 P16 replacement 都把同一个严格 initial binding 作为 Host replacement 事务输入，
  在唯一 readiness gate 前提交；失败 Candidate 不 gate、不 swap，旧 Session 保持可用。
- 影响：replacement 可先向外发布未绑定世界，再吞掉绑定失败，破坏 RuntimeHost 单一发布权威。
- 建议：删除 Coordinator post-publish bind，把 optional binding 传入 Host `performReplacement()`。
- 复核：最终 `dfa6fbc` 已删除 post-publish bind；replacement 的 commit count at ready 为 1，failed bind
  不进入 gate 且释放 Candidate。已被 Codex 与 Cursor Cloud 复核确认关闭。

### [已关闭 P2] [D5/D6] Initial create failed-bind 缺少独立行为回归

- 证据：上一候选只有 reset/replacement 间接覆盖，无法独立证明 initial create 的 failed bind 在 readiness
  之前关闭并释放 Port/Session。
- 期望：独立 RED 锁定“不进 gate、稳定 `WORLD_SESSION_FAILED`、Port dispose exactly once”。
- 影响：未来 create 路径漂移可能绕过 replacement 回归而不被发现。
- 建议：保留 owner-level create failed-bind 测试，不以共享实现推断行为。
- 复核：最终候选新增独立回归并通过；Cloud deep review 对当前源码复验确认。已被 Codex 与 Cursor Cloud
  复核确认关闭。

### [已关闭 P2] [D3/D4] Surface identity 未进入真实 Havok support contact

- 证据：历史候选只把 Surface/Subshape identity 写在私有 collision Mesh metadata 和 admission DTO；真实
  Character `checkSupport()` contact 没有对应 identity。
- 期望：SDK-owned Havok Body 的既有 metadata 以 provider-local 投影进入真实 manifold contact；
  `checkSupport()` 仍是唯一 support authority，不增加 ray/AABB 或第二套 ground inference。
- 影响：Runtime 无法把实际人物支撑接触与 receipt-bound Surface/Subshape 稳定关联。
- 建议：从真实 `PhysicsBody.transformNode.metadata` 读取完整四元组，只附加到静态 contact，并保持 checkpoint
  parser 的全有或全无闭合约束。
- 复核：Babylon 9.23/Havok 1.3.14 conformance 以真实 Body 证明 contact 携带
  `colliderSubshapeId/traversalSurfaceId/surfaceEntityId/traversalSurfaceProfileRef`，95 pass。已被 Codex复核确认关闭。

### [已关闭 P2] [D3/D5] 无条件翻转法线把底面和天花板伪装为支撑面

- 证据：历史实现对 `normal.y < 0` 直接乘 `-1`，所以同一三角形两种绕序都会成为向上面；Cloud Ridge
  自定义 ramp 的反向绕序也因此长期被掩盖。
- 期望：按安装的 Babylon 9.23 左手 outward convention 计算真实面法线，只接纳锁定 Profile 指定且满足
  Subject slope 的向上面；标准 `MeshBuilder.CreateBox` 无需特制重写。
- 影响：天花板底面、Box 底面或反向 Mesh 可被错误当作 Spawn/ground support。
- 建议：使用与 `VertexData.ComputeNormals` 等价的 `Cross(edgeB, edgeA)`；修复错误 authoring source 并重建
  Package，不保留双绕序兼容。
- 复核：标准 Box top 通过、反向面失败；Cloud Ridge ramp 有独立 RED→GREEN 并重建 Package，Browser 主路径
  通过。已被 Codex 复核确认关闭。

### [已关闭 P2] [D3/D6] 新测试未进入整仓 census 且容差来源描述失真

- 证据：历史 Cloud gate 对 `26e7db6` 报告两个 Runtime test 未分类；后续新增 App loader test 也先以
  `UNCLASSIFIED` 失败。BNA-4 spec 又把 `0.0001m` 错称为 Babylon controller collision tolerance。
- 期望：每个 test 在 contract/resource-heavy lane 唯一登记；数值容差只声明真实 SDK owner，不把本地策略
  伪装成引擎保证。
- 影响：`pnpm test` 无法启动，且规格会把未来维护错误绑定到 Babylon 未承诺的语义。
- 建议：补齐 census；把容差改为 SDK-owned BNA-4/body-resolution numerical coherence allowance。
- 复核：`pnpm test:census` 为 336 = 300 + 36；spec 和 adapter 注释均已更正。已被 Codex复核确认关闭。

## 4. Exact-SHA Cloud 证据与最终裁决

历史候选 `a431a459`、`26e7db6`、`b2e3d20` 与 `7e556f8` 的 NO-GO 均已失效，只作为
RED/修复证据。最终产品候选 `dfa6fbcdc18d3b6fa9fedce741efc1ec0dcb53d7` 由两个独立 Cursor Cloud
Agent 分别执行整仓门禁与 Mode B/runtime-deep 审查：

| 责任 | Agent / Run | 结果 |
| --- | --- | --- |
| 历史全量门禁 | `bc-08bec7f8-ff05-4085-b36c-37a2130af684` / `run-6f248d79-4312-452f-9845-f7e74fcd522e` | `a431a45` NO-GO；2 项 Workspace 边界违规，已修复 |
| 历史全量门禁 | `bc-a7bc3f55-2dda-43ae-9ed0-9cd5edf493ce` / `run-e0c10b38-9aba-49c0-aa2f-f6ff77afca95` | `26e7db6` NO-GO；test census 未分类，已修复 |
| 历史独立审查 | `bc-c109b784-…` / `run-2e8f…`（历史记录仅保留前缀） | `a431a45` NO-GO；2 P1 + 5 P2，逐项复验并关闭 |
| 历史全量门禁 | `bc-f73f61e4-7cb8-4c7a-8de1-348cf4b0b08b` / `run-db06cb2d-78dd-4d51-b0de-86d659be6561` | `b2e3d20` NO-GO；contract 3627 pass / 1 fail；双首帧 P2 已修复 |
| 历史 Mode B + runtime-deep 独立审查 | `bc-a8920265-be04-4c23-84bd-d2a125bb151f` / `run-a3b743e1-1868-4d2c-b53f-be36d889d547` | `b2e3d20` NO-GO；0 P0/P1、1 P2；已复验并修复 |
| 历史 Mode B + runtime-deep 独立审查 | `bc-41b015ff-4511-4318-a8b0-69c940cca99c` / `run-5f7122c9-4b3e-4178-8102-345afd55cee6` | `7e556f8` NO-GO；2 P2，已在 `dfa6fbc` 关闭 |
| 最终 Mode B + runtime-deep 独立审查 | `bc-e6f0ed3d-942d-46f3-963b-8863b73e7069` / `run-9de8b51c-fc2d-4c6d-9345-2e4941ebc0f5` | exact `dfa6fbc` GO；0 P0/P1/P2；focused 98 + Native 11 + real Havok 23 pass |
| 最终全量门禁 | `bc-7d1eca9a-97d0-40a4-8855-ddb728599089` / `run-99287f63-9fee-49fd-bd5d-b2725b05360b` | exact `dfa6fbc` GO；install/typecheck/test/build/Package/clean-break/Browser 全部 exit 0 |

最终裁决：**GO**。产品候选无开放 P0/P1/P2，Cloud exact-SHA 全量门禁与独立审查均通过；文档提交
不改变已审产品输入。PR #57 合入后以 `git merge-base --is-ancestor dfa6fbc origin/main` 复验 ancestry。

## 5. D1-D6 覆盖表

| 维度 | 状态 | 证据 |
| --- | --- | --- |
| D1 定位与边界 | 已查 | BNA-4 trusted-local Runtime/Havok admission；BNA-5 隔离安全未冒充完成 |
| D2 Schema 与 AI-friendly | 已查 | verified Package + Host loader 单一路径；无 raw input、alias、第二 parser |
| D3 承诺与事实 | 已查 | Package identity、actual replay 与 Browser 可玩证据分层；安全/Capture 边界明确 |
| D4 单一权威状态 | 已查 | RuntimeHost/SDK 独占 lifecycle、Havok、Subject、Camera、Input、Tick |
| D5 工程质量 | 已查 | partial failure、替换、reset、cadence、多实例、并发 probe 与 throwing cleanup |
| D6 门禁与证据 | 已闭合 | 本地 affected gates + exact-SHA Cloud full gates + 独立 Mode B/runtime-deep 全绿 |
