# Route R1 Heightfield Runtime Review

## 1. 审查元数据

- 模式：B 变更审查（`origin/main...HEAD`），必查 D2–D6；D1 只用来把 R1b / NPC / 洞穴 / 载具 / 公开 `goTo` 标成 capability gap，不当成实现 bug。Runtime 专项完整执行 `runtime-deep-review-checklist.md`。
- 对象：PR [#20](https://github.com/seedleap/agent-whitebox-world-sdk/pull/20) / 分支 `cursor/m5-route-r1-heightfield-39e1`。覆盖 M5 **已经落地** 的部分：R0 合同（已在 `main`）+ 本 PR 的 R1 Heightfield。**不**把 M5 标成完成。
- Base：`5e0d6bf537c22f71aee5dc31ed8d9829be9fe9b3`（`origin/main`）
- Head：`5de4ee7383933ceadab5fefe571733ba52cf001e`
- 独立审查范围：`git diff --stat origin/main...HEAD`（216 files）。本审查是只读结论；`5de4ee7` 仅含 Task 10 对审查 P1 的门禁补强，不改 Graph/Runtime 权威路径。
- 安装版本（lockfile / `package.json`，非训练记忆）：Babylon.js **9.21.2**，`@babylonjs/havok` **1.3.14**，`recast-navigation` **0.43.1**（含仓库 pinned patch）。
- 证据层级：`static-read` + `automated-contract`。R1 生产门禁跑的是 Babylon `NullEngine` + Havok，**没有** rendered-visual 截图，也**没有** manual-interaction 手感验收。不得把本审查说成控制手感或像素构图已生产验收。
- 阶段 Cursor CR（Codex 交接里的 `reviewing-with-cursor`）保持 `INTERRUPTED/TIMEOUT`，不当作 `GO`。本文件是 Task 10 要求的全维度 + Runtime 终审记录。

### 权威状态表

| 状态 | 单一权威 | 本切片消费者 | 禁止的第二权威 |
| --- | --- | --- | --- |
| Ground support | 每 tick 一次 Havok `PhysicsCharacterController.checkSupport()`，结果冻结进 retained sample | Motion Kernel resolver、Traversal evidence、Probe | 地形高度采样、ray/AABB、第二次 `checkSupport()` |
| Water membership | semantic water sensor / `waterSurfaceHeightAtSubjectOrigin` | 仅 `water-surface` kernel；R1 不发布 `movementMedium: water` | 用 Graph 水域排除或 visual mesh 名推断 Ground/Air |
| Subject facing | Motion Kernel / controller | visual root、snapshot、主体相对输入 | Camera Director、Traversal Driver |
| Camera orbit | Camera Director | Babylon camera、Browser controls、snapshot | Probe 不得 `controlFrame` / 改朝向 |
| Active action | semantic action resolver（消费 motion snapshot） | animation player、snapshot | 从 Clip 名反推接地 |
| Simulation time | `commitFixedTick` → `physicsEngine._step(1/60)`；`scene.physicsEnabled = false` | motion、animation、Probe | render-frame delta |
| Traversal surface identity | 已支持 sample 的几何相关（Heightfield 三角采样 + 竖直 collider 命中） | Probe / Validation 证据 | 改变 Ground/Air 或物理 |
| Traversal lock | `compileResolvedTraversalLockV1()` 一次编译，收据只传递 | Envelope、Build Input、Graph、Probe、Report | 消费者从 IR 重建 lock |
| Resource lifetime | Runtime `ownedDisposers`；Recast reverse-order destroy | instance / WASM / scene | 泄漏 provider handle 到 Canonical 字节 |

### 验证命令

| 命令 | HEAD | Exit | 记录 |
| --- | --- | --- | --- |
| `pnpm typecheck` | `a846320` 与 `5de4ee7` | 0 | 无新诊断 |
| `pnpm test` | `a846320` | 0 | 143 files / 1407 tests。`b1c20a5` 已把完整 R1 重型矩阵移出通用 Vitest；少 1 条相对早期 1408 是预期 |
| `pnpm build` | `a846320` | 0 | 既有 Vite large-chunk 警告；Havok WASM ≈ 2094.56 kB / gzip 664.19 kB。本切片未新增 chunk/WASM 回归 |
| `pnpm verify:route-r0-contract` | `5de4ee7` | 0 | 八项 frozen check 全绿。结尾改为 `R0 contract frozen; this command does not prove R1/R1b runtime capability` |
| `pnpm verify:route-r1-heightfield` | `a846320` 与 `5de4ee7` | 0 | `ok: true`。success 双 Gate `passed`。11 fixture oracle 全中。success report hash `sha256:df9af3a6d133a3fdffd284cc2903a26926bde95813da1ec1aa6ff2f6cbfdaf49`（repeat + 两次 concurrent 相同）。30/60/120-like：同一 `runtimeProbeReceiptHash` `sha256:bff269115813cc99a376e116124cb3cab5774ae7a4263251f6f140e650f90a44` / `finalRuntimeEvidenceHash` `sha256:cc18a4746b65e35315557df5fff582e77fb2f7df3bf846f771e351156c53c9e9`；`processedTickCount` 均为 221；`renderFrameCount` 110 / 221 / 442。`plannerOnlyFieldsInCanonicalRoute: []`，`providerIdentityLeaks: []`。`5de4ee7` 额外精确命中 `start-surface-unmatched-or-wrong-resolved`；fixture hash 相对 `a846320` 未漂移 |
| `pnpm verify:canonical` | `a846320` | 0 | Browser + Babylon/Havok 既有门禁 |
| `pnpm verify:placement-layout` | `a846320` | 0 | Placement S1 回归 |
| `pnpm verify:rigged-subject` | `a846320` | 0 | pose / isolation / collision / asset-tamper |
| `pnpm verify:g-bot-subject` | `a846320` | 0 | 四动作、实例隔离、墙体碰撞 |
| focused `route-evaluator` / R0 / R1 fail-closed | `5de4ee7` | 0 | 3 files / 44 tests |

`5de4ee7` 未重跑 canonical / placement / rigged / g-bot / 全量 `pnpm test` / `pnpm build`：该 commit 只改 R1 adversarial 清单、R0 提示句和一处等价 `isNil`。这些门禁与 R1 fixture 矩阵无共享权威状态。

已知警告分类：Vite large-chunk 与既有 NullEngine/Rapier deprecation 警告继续存在，不作为 R1 blocker，也不当作 R1 能力证据。

## 2. 旧结论复验

引用前必须回当前源码核对。标注以本 HEAD 为准。

| 旧结论 | 现状 |
| --- | --- |
| Task 1：`compileResolvedTraversalLockV1()` 是唯一构造缝；消费者不得重建 lock | **已复验，成立**。Orchestrator 每行编译一次并下传收据（`packages/compiler/src/compile-traversal-lock.ts`，`scripts/lib/route-validation-orchestrator.ts`） |
| Task 2：Recast lifecycle 反向销毁、throw 后继续、package root 无 Recast 类型 | **已复验，成立**（`packages/traversal-recast/src/provider-lifecycle.ts`，`public-boundary.test.ts`） |
| Task 4：Graph 是连通性通过/失败权威；source graph 不能凭空制造 complete Path；Recast 句柄不出 adapter | **已复验，成立** |
| Task 4 P1：宽度量化与复合碰撞体垂直分层 | **已复验，已关闭**。当前 HEAD 仍走 slab clipping + 矛盾证据 fail-closed |
| Task 5：单次 `checkSupport()`；分类器不得改 Ground/Air；dynamic surface → unmatched | **已复验，成立**。对照安装版 `characterController.d.ts` 仍无 body/triangle id；`isSurfaceDynamic` 时 `supportedState` 恒为 `SUPPORTED` |
| Task 5：unit gravity direction，避免全幅重力把缓坡标成 SLIDING | **已复验，成立**（`motion-kernel-runtime.ts` 注释与实现；依据安装版 solver 用单位法线点积） |
| Task 8：页面不生产证据；V3 Route 输入拒绝；Browser V4 只加四个只读 getter | **已复验，成立** |
| Task 8 Cursor CR `TIMEOUT` | **已复验，仍成立**。不得改写成 `GO` |
| Task 9：11 个 Authoring V4 fixture + 可信管道 + traversalAreas 只裁 Graph | **已复验，成立**。`fail-start-surface` 的 *runtime unmatched/ambiguous* 表述与 oracle 表不一致，见下方 P1；已用同一 blocking gate 的 Havok Probe 测试补上 |
| Handoff：通用 Vitest 不得递归跑完整 R1 重型门禁 | **已复验，成立**（`b1c20a5`；`scripts/verify-route-r1-heightfield.test.ts` 只留 zero-match fail-closed） |
| `pnpm verify:route-r0-contract` 打印 “R1/R1b runtime capability not implemented” | **已失效**。R1 Heightfield 已实现。`5de4ee7` 改为 “this command does not prove R1/R1b runtime capability” |
| R1b 未实现 | **capability gap，不是 bug** |

## 3. Findings

### [P1] [D3/D6] `fail-start-surface` Authoring fixture 不能单独证明 runtime unmatched/ambiguous

- 证据（`static-read` + `automated-contract`）：计划 Task 9 闭集 oracle 要求该 fixture 输出 `ROUTE_START_SURFACE_NOT_FOUND`（`docs/superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md`）。同段 prose 又写 “supported-but-unmatched/ambiguous surface identity”。`examples/traversal/r1-heightfield/fail-start-surface.json` 在 spawn 放 blocked water；Graph 查询发出 `ROUTE_START_SURFACE_NOT_FOUND` 后，`orchestrateRouteValidationV1()` 在 `routeConnectivityResult.status === "complete"` 之前不跑 Probe（`scripts/lib/route-validation-orchestrator.ts`）。Runtime unmatched/ambiguous 映射的是 Probe `support-surface-mismatch` → `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`（`packages/validation/src/route-runtime-probe.ts`，`packages/validation/src/route-evaluator.ts`），不是 Graph 的 start-poly miss。
- 期望：闭集 oracle 保持 Graph 诊断；supported-but-unmatched/ambiguous 作为 CharacterSurfaceInfo 分类器，必须进入**同一** `pnpm verify:route-r1-heightfield` blocking gate。计划已允许编排/集成故障不必再开第十二份 Authoring JSON。
- 影响：只跑 11 个 Authoring fixture 时，golden matrix 全绿仍可能从未在可信管道里碰到 runtime 错表面。
- 建议 / 已实施：保留 `fail-start-surface` = Graph `ROUTE_START_SURFACE_NOT_FOUND`。`5de4ee7` 把已有真实 Havok 测试 `Route R1 fixed-tick probe with real Recast and Babylon/Havok rejects real unmatched static support and a wrong resolved path surface at tick zero` 编进 adversarial check `start-surface-unmatched-or-wrong-resolved`。
- 复核：已被本审查确认，并在 `5de4ee7` 关闭。不再作为 open P1。

### [P2] [D5] R1 provider 扫描仍以禁止 key 为主

- 证据（`static-read`）：`scripts/verify-route-r1-heightfield.ts` 的 `FORBIDDEN_PROVIDER_HANDLE_KEYS` 抓 `providerHandle` / `tileRef` 等 key，不扫 string leaf。CLI 另有 runner-failure 投影，不把 raw provider cause 送进公共诊断。Canonical 身份 Ref 有意包含 `worldkit://runtime-backend/babylon-havok@1`；Snapshot V3 仍冻结 `runtimeBackend: "babylon-havok"`。对全体 string 做 `/babylon|havok|recast/` 会误伤已审计身份。
- 期望：Canonical Report / Evidence 无 Recast polyRef、WASM pointer、Babylon/Havok handle。已审计 Backend 身份 Ref 可以保留。
- 影响：若内部 throw 文案漏进 Report message，key 扫描不会红。当前 CLI 投影与 package `public-boundary` 测试仍挡住主路径。
- 建议：以后若要加强，只扫未审计的 provider 句子/句柄，不要禁掉锁定 Backend Ref。
- 复核：未复核。不阻断 R1 收口。

### [P2] [D5] Recast adapter 重复了一份 Euler TRS

- 证据（`static-read`）：`packages/traversal-recast/src/heightfield-source.ts` 的 Graph blocker soup 自写 yaw(Y)*pitch(X)*roll(Z)，未调用 `emitTransformedStaticColliderTriangleMeshV1`。对齐测试锁在 `heightfield-source.test.ts`。
- 期望：Graph soup 与 Runtime/layout 网格共用同一 TRS helper，避免未来修一边漏一边。
- 影响：当前有对齐回归；漂移时 Graph 阻挡与 Runtime 碰撞会分叉。
- 建议：R1b / 后续维护里改委托，不在本 Heightfield 收口扩大 scope。
- 复核：未复核。不阻断 R1 收口。

无 open P0。R1b 静态平台、Collider 缝、多 Surface 身份、公开 `goTo`、NPC、载具、洞穴不是本切片缺陷。

## 4. 维度覆盖表

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | R1 只交付 Heightfield。R1b/M5 仍开放。无“先做简单版”公共旁路。未改冻结 plan-lock。 |
| D2 Schema 与 AI-friendly | 已查 | Authoring/CLI/Browser 无 Recast 字段。数值带单位。`kind`/`type`/`mode` 用法符合 AGENTS。低预算 Graph Builder Profile 只出现在 trusted-host runner option，不进 Authoring JSON。 |
| D3 承诺与事实 | 已查 | 公开进度在本 disposition commit 与事实对拍：R1 Heightfield 完成，M5/R1b 仍开放。R0 提示句不再声称 R1 未实现。 |
| D4 单一权威 | 已查 | 见权威表。分类器在 `traversal-runtime-port.ts` `classifySurface()`；`unsupported` / dynamic / 零 Heightfield hit / Heightfield+collider → `unmatched` 或 `ambiguous`，均不改 Ground/Air。 |
| D5 工程质量 | 已查 | 新包具名 `lodash-es`；`===`/`!==`；一处 `isNil` 已修。确定性：canonical JSON + 稳定排序 + 同 hash。对抗：墙、坡、宽、顶、水、缝、预算、起点支撑、起点表面、ribbon 外绕行、lock mismatch、Graph-pass/Runtime-fail、support loss、deviation、cadence、unmatched/wrong surface。 |
| D6 门禁与证据分层 | 已查 | Blocking Gate 不被总分抵消。Graph 与 Runtime 独立。自动化合同已跑。无 rendered-visual / manual-interaction 证据。 |

## 5. Runtime checklist 逐项

| 必查项 | 结论 | 证据 |
| --- | --- | --- |
| Babylon 9.21.2 `CharacterSurfaceInfo` | 安装版无 body/triangle id；`isSurfaceDynamic` ⇒ `SUPPORTED`；`averageSurfaceNormal` 为流形平均。Adapter 用 unit gravity；dynamic → `unmatched`；身份用几何相关 | `node_modules/@babylonjs/core/Physics/v2/characterController.d.ts`；`motion-kernel-runtime.ts`；`traversal-runtime-port.ts` |
| 每 tick 一次 `checkSupport()` | Probe 主体每 tick 一次；reset/bootstrap 后一次；uncontrolled sibling 走 `publishSupport()` 各一次，不是 Probe 主体的第二次查询 | `motion-kernel-runtime.ts`；port/integration spy |
| unmatched / ambiguous | 实现完整。Authoring `fail-start-surface` 证明 Graph start-poly miss。Runtime 分类由 adversarial Havok 测试进入同一 R1 gate | 见 P1 处置 |
| V5 collision-body uniqueness | V5 不为 `objects[].collisionEnabled` 再建聚合体；地形一份 `PhysicsShapeMesh` + 每个 `staticColliders` 行一份。ID 经 `deriveColliderSubshapeIdV1` | `babylon-world-runtime.ts`；compiler V5 |
| 共享三角字节 | `@whitebox-world/terrain-surface` 的 `emitTriangleHeightfieldSurfaceV1` 供 V5 渲染/碰撞、采样、Graph、证据。V4 `PhysicsShapeHeightField` 路径未改 | `terrain-surface`；`heightfield-source.ts` |
| Backend / Recast coupling | Envelope → `mapTraversalCapabilityEnvelopeToRecastTiledConfigV1`；adversarial 跑两条 Recast config 测试（坡度竖界、胶囊净空） | `recast-config.test.ts` 编进 R1 gate |
| Provider cleanup | mutex + consume-once WeakSet；反向销毁；部分 throw → AggregateError。Probe lease 在 factory throw 后仍 dispose Runtime | `provider-lifecycle.ts`；runner |
| Fixed / render time | Probe `runTraversalFixedTick` → kernel → `commitFixedTick`。`renderFrame` 只 pose + `scene.render()`。cadence 在 tick **之后** 渲染 0/1/2 次 | `route-validation-runner.ts`；cadence 矩阵 |
| Reset / rebind | Probe `resetAt` 起点 Anchor，epoch+1，一次 support。普通 reset/rebind 清 retained sample → evidence unavailable / not controlled | port tests |
| 30/60/120 | success fixture 三档同一 report/probe/final-state hash；processed ticks 不变 | R1 gate cadence 结果 |
| Lock equality | 一行一次 `compileResolvedTraversalLockV1`；Graph/Path/Probe/Report hash 必须一致；lock-mismatch 在 gate 内 | evaluator + adversarial |
| Provider-ID redaction | 公共字段无名 Recast handle。Graph node 用 hashed `tileId`。Gate 扫禁止 key。已审计 Backend Ref 可含 `babylon-havok` | 见 P2 |
| Deterministic bytes | canonical JSON + SHA-256；collider/area/requirement 按 id 排序；success hash 可复现 | R1 gate |
| Browser V4 clean-break | `WORLDKIT_BROWSER_PROTOCOL_VERSION = 4`；四个必选 Route getter；无 V3 API alias。Snapshot payload 仍为 schemaVersion 3 | protocol contracts |
| Failure fixtures | 11 个 Authoring V4 文件对上 oracle。编排故障用精确测试全名 + zero-match fail-closed | `examples/traversal/r1-heightfield/` |
| Graph-pass / Runtime-fail | 结构独立。命名集成：伪造 passing graph + 真墙 | `route-runtime-probe.integration.test.ts` |
| `spatial.traversalAreas` | 只裁 Graph/nav source。Havok 地形碰撞/support 仍在 | `traversal-area-runtime-collision.integration.test.ts` |
| Low-budget profile | 仅 `TrustedRouteValidationOptionsV1.graphBuilderProfileRef`；Authoring/CLI/Browser 无此字段 | runner + fail-budget |
| 无 Ground 双权威 | 无 raycast/height-sample 决定 Ground/Air。高度采样只在 raw support 之后做身份 | port + kernel |

## 6. Fixture oracle（Task 9 闭集）

| Fixture | 期望 | 层 |
| --- | --- | --- |
| `success` | 双 Gate `passed` | Graph + Runtime |
| `fail-wall` | `ROUTE_REQUIRED_PATH_UNREACHABLE` | Graph |
| `fail-slope` | `ROUTE_SLOPE_EXCEEDED` | Graph |
| `fail-width` | `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT` | Graph |
| `fail-overhead` | `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT` | Graph |
| `fail-water` | `ROUTE_REQUIRED_PATH_UNREACHABLE`，证据点名 blocked Water entity | Graph |
| `fail-gap` | `ROUTE_SURFACE_GAP_EXCEEDED` | Graph |
| `fail-budget` | `incomplete` / `ROUTE_GRAPH_BUDGET_EXCEEDED`，trusted-host 低预算 Profile | Graph |
| `fail-start-support` | `ROUTE_START_SUPPORT_INVALID` | Runtime Probe（Graph 须 complete 才会跑 Probe） |
| `fail-start-surface` | `ROUTE_START_SURFACE_NOT_FOUND` | Graph start-poly miss；Heightfield 运行时碰撞可仍在 |
| `fail-outside-detour` | `ROUTE_REQUIRED_PATH_UNREACHABLE` | Graph `hard-ribbon` |

## 7. 完成判定

**可以关闭 R1 Heightfield（不可以关闭 M5）。**

条件：`5de4ee7` 上 `pnpm verify:route-r1-heightfield` 与 R0 合同门禁为绿；本审查无 open P0/P1；公开进度文档在随后的 `docs: record route r1 heightfield disposition` commit 中与事实对拍。R1b 另开计划。无 rendered-visual / 手感证据，R1 声称的是固定 Tick 可信管道合同，不是美术或手感生产验收。
