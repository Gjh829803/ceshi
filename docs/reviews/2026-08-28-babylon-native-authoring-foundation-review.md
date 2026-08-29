# Babylon Native Authoring Foundation 变更审查

## 1. 审查元数据

- 审查模式：Mode B（变更审查）；必查 D2–D6。因为变更涉及 Babylon/Havok、移动、输入、相机、
  固定 Tick、渲染和资源生命周期，同时完整执行
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)。
- 审查对象：Babylon Native Authoring Foundation Task 1–5 及 Task 6 门禁修复。
- Diff 基线：`5bee45faa3a34b13ba3af8925c3af228cf9e77a6`。
- Task 6 起点：`58189c14b395a305ae4a7a9707eeb19b8807f6ca`，branch
  `explore/scene-reconstruction-api`，起点 tracked worktree clean。
- 被审 Native commits：`48f6adc`、`dac83fd`、`dc2f4fb`、`6708883`、`bd2fadb`、
  `17045d8`、`c2a8d33`、`58189c1`。其中 `74aa581` / `de704aa` 把 3C Camera、Action、Support
  follow-up 合入同一目标树，本审查按 semantic three-way merge 复验共享 Runtime owner。
- Task 6 代码修复：以 `58189c1` 为父树，
  `apps/native-scene-playground/src/cloud-ridge-scene.test.ts` 的单文件 patch SHA-256 为
  `729a7dd9ac2fcea7c8606c8cdf3cf3282db462bac2e5cbe5c49e11d7c44514fc`。其后只修改本报告、
  Backlog 和长期规格的 current-fact 文案；不使 Runtime/type/test/build/browser 证据失效。
- 明确排除：实施计划 Task 6 Step 6 的 BNA-1 identity clean-break 计划。本报告不创建该计划。
- 已安装依赖（重新读取当前 workspace 与安装声明）：`@babylonjs/core@9.23.0`、
  `@babylonjs/havok@1.3.14`、TypeScript `5.9.3`、Vite `7.3.6`、Vitest `3.2.7`、
  Node `22.21.0`、pnpm `10.14.0`。
- 引擎语义复验：已对照 Babylon 9.23.0 安装源码/声明；`Scene.getMeshByName()` 返回
  `Nullable<AbstractMesh>`，`AbstractMesh.getVerticesData()` 是有效读取面，
  `Vector3.TransformCoordinatesToRef()` 包含平移，`PhysicsShapeMesh(mesh, scene)` 从传入 Mesh
  建立 shape。非零 transform、真实 Havok shape 与 disposal 另由本轮测试执行覆盖，不靠记忆推断。
- 执行时间：2026-08-28 至 2026-08-29，Asia/Shanghai。

### 1.1 命令与结果

以下 focused 命令先在 clean `58189c1` 上运行；`typecheck` 复现测试类型缺陷后，只重跑被该修复
失效的 app focused lane、workspace boundary 和 typecheck。其余完整门禁各自在修复后的同一产品/测试树
运行一次。没有运行 root `pnpm test`，因为 `test:census` 已闭合 Vitest 分类，随后直接运行计划要求的
`test:contract` 和 `test:resource-heavy`，避免重复两条 lane。

| 命令 | Exit | 结果 / 计数 | 警告分类 |
|---|---:|---|---|
| `pnpm vitest run packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts` | 0 | 1 file / 8 passed | 无 warning |
| `pnpm vitest run packages/native-babylon/src` | 0 | 4 files / 51 passed | Babylon NullEngine banner 是信息，不是 warning |
| `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry"` | 0 | 1 passed / 130 skipped（131 discovered） | NullEngine banner only |
| `pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts apps/native-scene-playground/src/native-package-migration.test.ts` | 0 | 修复前与修复后均为 2 files / 5 passed | NullEngine banner only；修复后重跑是因测试输入已变 |
| `pnpm verify:workspace-boundaries` | 0 | 修复前、修复后均通过；51 registered debt entries | 已登记 debt inventory，不是新 warning；因 Babylon import 路径改变而重跑 |
| `pnpm test:census` | 0 | 301 Vitest files：269 contract / 32 resource-heavy | 无 uncovered lane；test-only 类型修复不改变文件分类，未重复运行 |
| `pnpm typecheck`（RED） | 2 | 5 个 `TS2379`，均为 `getMeshByName(): AbstractMesh` 传给 `localAxisExtent(mesh: Mesh)` | 真实测试类型缺陷；不是 Runtime 失败 |
| `pnpm typecheck`（GREEN） | 0 | 全 workspace 通过 | 无 warning |
| `pnpm test:contract` | 0 | 269 files；3029 passed / 3 skipped（3032 total） | 反复出现的 Babylon NullEngine skeleton uniform advisory：headless 设备报告 16 uniform vectors，属于既有软件/空引擎能力提示；不影响通过，也不是 rendered/browser 或生产 GPU 证据 |
| `pnpm test:resource-heavy` | 0 | 32 files / 510 passed | 同一 NullEngine skeleton uniform advisory；同上分类 |
| `pnpm build` | 0 | Vite 7.3.6；2206 modules；49.02 s | Vite chunk-size advisory；最大 JS `world-runtime-snapshot-D1CBPHju.js` 2520.03 kB（gzip 610.69 kB），`store` 718.57 kB，WASM 2094.56 kB；非阻塞 bundle/performance backlog，不形成性能声明 |
| `pnpm build:native-scene` | 0 | 1847 modules；46.52 s | Vite chunk-size advisory；`index-BS3um9ni.js` 2759.16 kB（gzip 670.81 kB），Havok WASM 2094.56 kB；同上 |
| `pnpm verify:3c-migration` | 0 | ledger 11 entries / 61 live refs | 无 warning |
| `pnpm dev:native-scene -- --host 127.0.0.1` | 0（检查后 Ctrl-C 正常退出） | Vite 打印 `http://127.0.0.1:5174/`；未使用 `?authoring=1` | 启动时因 lockfile re-optimize；不是运行失败 |

`pnpm test:studio` 与 `pnpm test:independent` 未运行：本 diff 不修改 Studio、root Node `.test.mjs`、
Cursor Python 或 Site 输入。`pnpm test:scenes` 未重复运行，因为其 Vitest 文件已在 contract lane。
没有 Native 正式 Browser/Capability verifier；本轮按计划执行真实浏览器、截图和人工交互层。

## 2. 旧结论复验

### 2.1 长期设计审查的生产边界仍成立；其旧“当前 API”事实已失效

[`2026-08-28-ai-friendly-babylon-native-world-authoring-design-review.md`](./2026-08-28-ai-friendly-babylon-native-world-authoring-design-review.md)
关于 Canonical 仍是唯一正式入口，以及 WorldPackage、Hosted、Route、WorldChangeSet 和 Native Production
尚未完成的结论，已回当前代码与 Backlog 复验，仍成立。该旧 review 所述
`@whitebox-world/runtime-babylon` 根导出、App-local Bootstrap 和 `surfaceKind` 只代表当时实验树，现已失效：
当前 root/Host 分界由 package boundary 固定，旧 source/export/import census 为零
（`35:73:packages/native-babylon/src/package-boundary.test.ts`、
`86:146:apps/native-scene-playground/src/native-package-migration.test.ts`）。本轮同步修正了长期规格的
current-vs-target 表，而没有改写历史 review。

### 2.2 Deep ESM bake-off 结论仍成立

[`2026-08-28-babylon-native-import-profile-bakeoff.md`](./2026-08-28-babylon-native-import-profile-bakeoff.md)
接受 Deep ESM、拒绝 root barrel 的结论已在当前安装版本复验。生产 source census 禁止 bare
`@babylonjs/core`、namespace import、Runtime/Havok owner、环境 I/O、Timer 和 ambient randomness，并把
实际使用的 Babylon 模块限制在 frozen allowlist（`9:70:packages/native-babylon/src/package-boundary.test.ts`）。
本报告不重跑已淘汰 root-barrel bake-off，也不把 bundle 大小推导为 AI 生成成功率；后者仍属 BNA-6。

### 2.3 Task 5 clean break 与最终 uint32 结论成立

Task 5 的最终结论已从当前 tree 复验：Cloud Ridge 只从 AI-facing root author，Runtime 只从 `/host`
消费 admission/contribution；旧 Runtime source、test 和 re-export 已删除。Task 5 中间报告曾短暂主张
大于 uint32 的 safe-integer seed 必须保持不同序列，该结论已被 `58189c1` 明确撤销；当前唯一合同只接受
`0..0xffffffff`（`65:65`、`171:179`、`204:249:packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts`；
`15:35:packages/native-babylon/src/random.ts`）。没有兼容 seed 路径。

### 2.4 Block Profile 旧 review 的实验登记描述已成为历史

[`2026-08-28-babylon-native-block-whitebox-profile-design-review.md`](./2026-08-28-babylon-native-block-whitebox-profile-design-review.md)
所写 `registerStaticCollisionMesh/surfaceKind` 是当时快照，不能再作为当前接口结论。当前登记是必填闭合
`traversalBinding`（`14:33:packages/native-babylon/src/module.ts`），但 BWB-1+ 仍全部开放；本 Foundation
没有实现或授权 Block Profile。

## 3. Findings

### 3.1 最终开放 Findings

截至最终 candidate tree：**无开放 P0、P1 或 P2**。以下两项是在门禁/审查中复现并最小修复的缺陷。

### [P1] [D3] 长期规格仍把已删除实验 owner 写成当前事实（已解决）

- 证据（static-read）：current-fact census 命中长期规格中的 Runtime 根导出、App-local Bootstrap 和旧登记
  描述，但当前源码 clean-break census 证明这些 owner 已删除。旧文字与当前实现冲突。
- 期望：规格必须分开已完成 Foundation checkpoint 与仍开放的 BNA-1/BNA-3+；不能把历史实验写成
  current，也不能把内部 checkpoint 写成 production。
- 影响：后续 BNA-1/BWB Agent 可能恢复旧导出/`surfaceKind`，或重复实现已经迁移的 Bootstrap/Package
  root。
- 建议：已只更新 current-vs-target 真相：root/Host、闭合 Bootstrap 和 Contribution 已完成内部
  checkpoint；shadow Plan、World Identity、Authority Audit、Runtime Replay、Package/Receipt、Hosted 和
  Production 仍开放（`141:143`、`564:567`、`1121:1141:docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`）。
- 复核：当前长期规格对旧术语的命中只把它们标成已删除的历史实验合同；裸 current-fact 描述只剩
  historical review/计划。当前长期权威已对齐。本修复是 docs-only，不失效 Runtime 门禁。

### [P2] [D5/D6] Cloud Ridge 回归 helper 使用了过窄的 Babylon Mesh 类型（已解决）

- 证据（automated-contract + installed-source）：首次 `pnpm typecheck` exit `2`，5 个 `TS2379` 指向
  `cloud-ridge-scene.test.ts`。Babylon 9.23.0 安装声明明确 `Scene.getMeshByName()` 返回
  `Nullable<AbstractMesh>`，而 `AbstractMesh` 提供 `getVerticesData()`；原 helper 却要求 `Mesh`。
- 期望：行为回归 helper 接受它真正使用的最小 Babylon 类型，不以不成立的下窄假设阻断 workspace gate。
- 影响：Runtime 行为测试能通过，但仓库 `typecheck` 不能完成，Foundation 不可接受。
- 建议：已按最小边界把 import/参数改为 `AbstractMesh`，未改运行时代码或断言
  （`1:26:apps/native-scene-playground/src/cloud-ridge-scene.test.ts`）。
- 复核：GREEN 为 focused app 2 files / 5 tests、`pnpm typecheck` exit `0`、
  `pnpm verify:workspace-boundaries` exit `0`；完整 contract lane 也通过。

### 3.2 Runtime authority map

| State / resource | 当前唯一 owner | 消费者与本轮结论 |
|---|---|---|
| Scene geometry source | `BabylonWorldRuntime.create()` 的 experimental `nativeScene` 分支 | Native 存在时不创建 ExecutionPlan Terrain/Water/Object/Collider，Canonical 分支反之（`183:189`、`835:923:packages/runtime-babylon/src/babylon-world-runtime.ts`）。这只是内部互斥分支，不是 BNA-1 RuntimeHost `sceneSource` Union。 |
| Native visual build | one-shot Module + Host Candidate Scene | Host 先 exact-parse Bootstrap/budget/module，Registration 只在 build settlement 前开放（`368:405`、`635:658:packages/native-babylon/src/host.ts`）。完整 Scene 的 Authority Audit 尚未实现，因此不能宣称恶意/未审 Module 被强制隔离。 |
| Spawn | Bootstrap `spawnMarkerId` + Host 唯一登记 | Host 要求恰好一次并 exact bind；Runtime 只把已冻结位置/朝向投影到当前 shadow ExecutionPlan（`405:460`、`644:657:packages/native-babylon/src/host.ts`；`525:557:packages/runtime-babylon/src/babylon-world-runtime.ts`）。BNA-1 仍需删除 shadow Plan。 |
| Collider / traversal identity | Host Contribution Admission | Module 只选择显式 Mesh/binding；Host 校验 Scene、provider state、geometry、预算、drift，稳定排序并冻结 hash（`475:606`、`660:739:packages/native-babylon/src/host.ts`）。Runtime 从无 Handle 数据重建私有 Mesh/Havok shape（`898:922:packages/runtime-babylon/src/babylon-world-runtime.ts`）。 |
| Ground support | Havok character `checkSupport()` through Character Body Port | native collider 不自行推断 supported；Body Port 每个 Tick 从 controller support 形成 sample（`1187:1210`、`1741:1765:packages/runtime-babylon/src/babylon-character-body-port.ts`）。 |
| Movement medium | Golden locomotion/body support；Native 不启用 Canonical water sensor | Native Module 的 Mesh 名、材质、颜色不决定 ground/air；本轮浏览器证实 jump air -> landing ground。Water/underwater 不是本 checkpoint 能力。 |
| Subject facing | Motion/Character controller | Spawn 只给初始 `facingRadians`；后续 facing、snapshot 与 subject-relative input 仍由 3C owner 处理。 |
| Camera orbit | Camera Director / Camera Component | Module 不拥有 SDK 主相机；manual orbit 在一个 fixed Tick 后发布 yaw/pitch，R reset 恢复 Director offset。Director snapshot/reset 的唯一状态位于 `1070:1110`、`1305:1364:packages/runtime-babylon/src/camera-director.ts`。 |
| Active action | semantic action/locomotion resolver + Subject visual projection | 浏览器公开 probe 观察 idle -> walk -> jump/takeoff/rising/landing，不从动画 Clip 名反推 Gameplay。 |
| Simulation time | Runtime fixed-step Tick | Browser render loop只积累到 `FIXED_TIME_STEP_SECONDS`；probe 输入也逐 Tick 提交。Render FPS/HUD 不定义 simulation speed。 |
| Deterministic random | Host `BabylonNativeHostRandomV1` | sole uint32 Bootstrap seed -> one LCG stream；Cloud Ridge exact visual baselines与 ambient-random negative test覆盖（`15:59:packages/native-babylon/src/random.ts`）。 |
| Resource lifetime | Runtime reverse `ownedDisposers` stack + Candidate Scene | Runtime 先从 Contribution 重建并拥有 Physics objects；初始化失败继续清理并保留 primary error（`605:620`、`1184:1192:packages/runtime-babylon/src/babylon-world-runtime.ts`）。Module-owned visual Mesh 的 disposal 不破坏 Runtime collider，focused integration 已证。 |

### 3.3 Semantic three-way merge

- merge-base：Native Task 4 line `6708883` 与 3C incoming `3363a9a` 的 merge-base 是
  `febba985255b77a180b54b3b88be7f36601ff9c5`。
- incoming-only 行为：3C line 带来 authored upward leave、Golden Action admission、Camera initial heading/
  published view synchronization 和 view revision 修复；这些状态仍由 Character Body、Golden Runtime 和
  Camera Director 拥有。
- Native-only 行为：新 package/Host admission、Native geometry branch、spawn/camera/gravity overlay、
  frozen collider reconstruction。
- target 语义：`bd2fadb` 只在 Runtime 初始化 source branch 接入 Native Host；没有复制 `checkSupport()`、
  Camera orbit、Action resolver 或 fixed Tick。当前 source 显示两组行为共存，完整 269+32 Vitest lanes、
  3C migration verifier 和浏览器 movement/jump/orbit/reset 共同证明 integration；文本无冲突本身没有被当作证据。
- 仍开放：Native 继续依赖影子 `ExecutionPlanV5` 的 Gameplay closure，`creationExecutionPlanHash` 在 Native
  branch 为 `undefined`。这是设计明确的 BNA-1 clean break 输入，不作为兼容 fallback 或已完成身份合同。

### 3.4 rendered / manual browser evidence

- URL：`http://127.0.0.1:5174/`，无 `?authoring=1`；页面标题
  `Cloud Ridge · Babylon Native Scene`，HUD 显示 `EXPERIMENTAL LANE`。
- 起点（公开 `window.__WORLDKIT_NATIVE_SPIKE__`）：`[0, 0.05000002932548475, 18]`、
  `ground`、`idle`、速度 `[0,0,0]`；Camera target 为 `g-bot-primary`，无 collision retraction。
- 移动：120 fixed ticks `move-forward` 后位置约
  `[0, 0.05000002932548475, 13.360000000000095]`，`ground/walk`，速度 `2.4 m/s` 向 `-Z`。
- 跳跃/落地：Jump 首 Tick 为 `air/takeoff`、Y `0.1416667 m`、竖直速度 `5.5 m/s`；随后
  `air/rising`，峰值 Y `0.8671334 m`；最终为 `ground/landing`、竖直速度 `0`。
- Camera：对可见 Canvas 拖动后再提交一个 fixed Tick，公开 snapshot 为
  `viewYawOffsetRadians=-0.5477276882`、`viewPitchOffsetRadians=0.1427666306`。通过可见 `R` 控制 reset 后
  Tick `50`、位置回到起点、`ground/idle`，Camera yaw `0`、pitch `-0.15`、distance offset `4 m`。
- Collider/T-gate：通过可见 `C` 控制显示 overlay；截图可见中央 T 形山门/平台，并显示三项登记代理
  `foreground-platform`、`gate-platform`、`primary-path`。exact 三项及 overlay on/off 另由
  `102:106`、`197:235:apps/native-scene-playground/src/cloud-ridge-scene.test.ts` 自动合同约束。
- 终点：`[0, 0.05000002932548475, 18]`、`ground/idle`；HUD 为 `PAUSED`，位置文本
  `0.0 / 0.1 / 18.0`。
- Browser errors：`tab.dev.logs()` 的 error/warn 集合为空；页面 `[data-error]` hidden 且 text empty。
  实际浏览器没有发出 SwiftShader/软件渲染 warning。NullEngine 测试 advisory 已在命令表单独分类，
  不能冒充本截图的 renderer 证据。
- Screenshot（rendered-visual）：
  `/Users/xiateng/work/ai/agent-whitebox-world-sdk/.superpowers/sdd/2026-08-28-babylon-native-authoring-foundation-implementation/task-6-native-browser-evidence.jpg`，
  1280×720 JPEG，SHA-256
  `6bfa20c8f76190e83fa92e1a3465b2382c15a8eb4ed32890101b02aa08be452f`；该文件是 SDD workspace 下的
  ephemeral evidence，不进入 tracked 产品树。

## 4. 维度覆盖表

| 维度 | 状态 | 覆盖与结论 |
|---|---|---|
| D1 定位与需求边界 | 已查（Mode B 上下文） | Foundation 只接受内部 API/Bootstrap checkpoint；Canonical 仍是唯一正式入口。无 WorldPackage、Route、Hosted、Block Profile、Native Production、WorldChangeSet、洞穴/多层/车辆/NPC 承诺。 |
| D2 Schema 与 AI-friendly | 已查 | `kind/schemaVersion/id`、role-qualified `...EntityId/...MarkerId`、资源 `...Ref`、单位/坐标字段、closed traversal union、exact parser/hash 和结构化 location/measurement/outcome 一致性均复验；旧 alias/parser/export census 为零。 |
| D3 承诺与事实对拍 | 已查 | 修正长期规格的两个 stale current-fact 区域；Backlog 只关闭 BNA-2 Foundation 和 BNA-1 Bootstrap 窄 checkpoint，BNA-1 身份、BNA-2 后续生产闭合、BNA-3+、BNA-4 gates 与 BWB-1+ 继续开放。 |
| D4 单一权威状态 | 已查 | authority map 覆盖 Scene、Spawn、Collider/Surface、Support、Medium、Facing、Camera、Action、Tick、Random、Lifecycle；无由 Mesh 名/材质反推 Gameplay。影子 Plan 作为 BNA-1 明示缺口，不被包装成终态。 |
| D5 工程质量与可维护性 | 已查 | direct dependencies、Deep ESM、stable sort/hash、uint32 determinism、budget fail-close、registration closure/drift、foreign/disposed/provider-state、partial build、cleanup、旧 owner 删除和真实 package migration 均有对抗证据；本轮修复 test helper 的错误下窄。 |
| D6 门禁与证据分层 | 已查 | static-read、automated-contract、rendered-visual、manual-interaction 分开报告；每条命令有 exit/count/warning。Vite chunk 与 NullEngine software/headless advisory 明确非阻塞且不形成生产或性能主张。 |

## 审查结论

**ACCEPT：仅接受 BNA-2 Foundation 与 `BabylonNativeSceneBootstrapV1` 窄切片作为内部工程
checkpoint。** 当前树无开放 P0/P1/P2；两个门禁缺陷已最小修复并复核。该结论不授予 WorldPackage、
Route/Nav、Hosted、Block Profile、Native Production、兼容性或性能承诺；BNA-1 identity clean break、
BNA-2 后续生产闭合、BNA-3+、BNA-4 production gates 与 BWB-1+ 仍必须按独立计划完成。
