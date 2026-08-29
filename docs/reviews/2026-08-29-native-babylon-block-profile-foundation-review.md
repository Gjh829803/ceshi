# Babylon Native Block Profile Foundation 变更审查

## 1. 审查元数据

- 审查模式：**B 变更审查**，按 `full-dimension-review-protocol.md` 检查 D2、D3、D4、D5、D6。Package 创建 Candidate Scene 内的 Babylon Mesh，因此额外执行 `runtime-deep-review-checklist.md` 的引擎语义、资源权威、部分构造、disposed/throwing cleanup 和双实例隔离条目；本 diff 不修改 Runtime、物理、移动、输入、动画、相机、渲染调度或 Browser/CLI 行为。
- 审查对象：`codex/native-babylon-block-profile` 产品/合同树 `3138aa16ffb1601f9f5fa9c969f0aab226341762`。
- Diff 基线：`main@7d1e4f41d6ae4b00a3b7461cc3ac284ed7039085`。
- 规格与计划：`docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`、`docs/superpowers/plans/2026-08-29-native-babylon-block-profile-foundation-implementation.md`。
- 安装引擎：`@babylonjs/core@9.23.0`。已对照安装源码：`Mesh.hasInstances`、`Mesh.hasThinInstances` 的公开 getter 位于安装包 `Meshes/mesh.pure.js`；NullEngine 不支持真实 thin-instance buffer，所以 focused test 只在真实 Mesh 上替换该公开观察点，不读取 Babylon 私有字段。几何、world matrix 和轴变换行为由同版本 NullEngine 回归覆盖。
- Diff 范围：新增一个可选 Package、其七个 contract test、lockfile workspace entry、test-gate census entry 和本计划；Runtime/Host/Havok/Character/Camera/Compiler/Canonical/Apps 的 diff 为 0。

### 1.1 命令与结果

| 树 | 命令 | Exit | 结果 / 证明范围 |
|---|---|---:|---|
| `da06765` | `pnpm test:contract` | 0 | 281 files / 3024 pass / 3 skip；全仓 contract 基线 |
| `dd9cc48` | `pnpm vitest run packages/native-babylon-block-profile/src` | 0 | 7 files / 35 pass；最终产品源码的完整 Profile suite |
| `3138aa1` | `pnpm vitest run packages/native-babylon-block-profile/src/package-boundary.test.ts` | 0 | 1 file / 3 pass；最后一笔 test-only boundary 加强 |
| `3138aa1` | `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `dd9cc48` | `pnpm test:census` | 0 | 313 tests：281 contract / 32 resource-heavy |
| `dd9cc48` | `pnpm verify:workspace-boundaries` | 0 | boundary floor 通过；49 个已登记 debt entry |
| `3138aa1` | `git diff --check main...HEAD` | 0 | 无 whitespace 错误 |
| `3138aa1` | Runtime/physics/camera diff census | 0 | 指定 Runtime、Host、Character、Camera、Authoring、Compiler、Apps 路径无改动 |
| `3138aa1` | 旧分支 rejection census | 0 | 固定旧分支含 `BlockWorldManifest` 10、Preset 54、physics 17、Three 2；当前生产 Package 对这些词与依赖为 0 |

`da06765` 后唯一产品改动是 Profile 对普通 Babylon instances 的拒绝；它由先红后绿的 focused regression 和 `dd9cc48` 完整 Package suite 闭合。`dd9cc48` 后只加强 package-boundary test，产品输入未变，并在 `3138aa1` 重跑该 test 与 typecheck。按变更感知证据复用规则，不重复其余 280 个输入未变的 contract files。

未跑 `pnpm test:resource-heavy`、Browser verifier、production app build、rendered visual 或 manual interaction：本 checkpoint 不消费 Havok、不进入 Runtime、不生成截图，也不声明 Collider、Spawn Support、人物通过性、视觉还原、室内、Route/Nav 或 `goTo` 能力。

### 1.2 资源与状态权威

| 状态 / 资源 | 唯一权威 | 当前消费者与生命周期 |
|---|---|---|
| Candidate Scene / 成功创建的 Mesh | BNA Host 提供并拥有的 Candidate Scene | Profile 只在该 Scene 创建 Mesh，不创建 Engine/Scene/render loop；成功 Mesh 随 Candidate Scene 生命周期销毁 |
| Block 最终 transform / hierarchy / material | build 期间的 Babylon Mesh | finalize 读取最终 world transform；不维护第二份 transform，material 不决定结构或 physics |
| Profile 创建输入与原始几何 | 一个 build-epoch Session | 创建时 snapshot，finalize 对漂移/instance fail-close；report 生成后清空 Session 记录 |
| 结构 Layout | finalize 内一次性派生值 | 仅生成 authoring diagnostics/metrics/group inventory；不导出 root query，不进入 Runtime |
| Physics / support / fixed Tick / Subject / Camera | 仍由现有 SDK/Runtime owners 独占 | 本 Package 不读取、不写入，也没有对应 diff |

部分构造边界：disposed Scene 在分配前拒绝；预算超限在 Mesh 分配前拒绝；极端 Babylon box 缺少 position/index 时立即 dispose；finalize 把 disposed、foreign、geometry/instance drift 与 throwing geometry observation 关闭成结构诊断。成功 Mesh 不由 Session dispose，因为它属于 Host Candidate Scene。

## 2. 旧结论复验

| 既有结论 | 当前裁决 |
|---|---|
| BWB-0 要求 Profile 是可选独立包，不是第三条 Scene Source，也不恢复 Three/Manifest/Compiler | **已复验，成立。** 当前 manifest 只有 `@babylonjs/core@9.23.0` 与 `@whitebox-world/native-babylon` 两个直接依赖，只有 `.` 根出口（`1:13:packages/native-babylon-block-profile/package.json`）；精确 runtime export 与 forbidden-import gate 在 `42:111:packages/native-babylon-block-profile/src/package-boundary.test.ts`。 |
| 旧 `codex/block-world-sdk-v2@618d96b` 只迁移 shape/grid/occupancy/topology 机械，不迁移 DTO、Preset、physics、Three 或第二 ground sampler | **已复验，成立。** 当前 diff 只新增 Profile Package；旧分支 rejection census 见 §1.1。最终根出口没有 Manifest、Compiler、Preset、Collider 或 traversal surface（`1:31:packages/native-babylon-block-profile/src/index.ts`）。 |
| BNA-2 Foundation 已冻结本阶段所需的 BuildContext 与 Deep ESM Import Profile，但不等于 BNA-2 生产闭合 | **已复验，成立。** Session 只消费 core `BabylonNativeSceneBuildContextV1`，Babylon import 都是安装版本的 Deep ESM path（`1:20:packages/native-babylon-block-profile/src/session.ts`）；本 diff 没有 Host 子路径或 Runtime admission 变更。 |

## 3. Findings

**无未解决 P0、P1 或 P2。** 审查期间发现并在最终审查树前关闭以下问题：

| 已关闭问题 | 修复与当前证据 |
|---|---|
| palette role 没有冻结实际颜色 | `BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1` 现在是闭合、冻结的六角色映射（`4:25:packages/native-babylon-block-profile/src/profile.ts`）。 |
| public diagnostic `code: string` 与 `Definition` 旧术语 | Diagnostic code 由唯一常量推导 closed union（`12:40:packages/native-babylon-block-profile/src/check.ts`）；公开输入统一为 `BabylonNativeBlockCreateInputV1`（`22:35:packages/native-babylon-block-profile/src/session.ts`），旧术语有生产源码负向 gate。 |
| 调用方可改写 vertices/indices 或制造 thin instance，Checker 仍信任 shape | Session 保存创建时的本地几何快照（`204:228:packages/native-babylon-block-profile/src/session.ts`）；finalize 拒绝几何漂移、普通/thin instance 与 throwing observation（`117:168:packages/native-babylon-block-profile/src/layout.ts`）。 |
| 普通 `InstancedMesh` 可产生 inventory 外块 | `hasInstances` 与 `hasThinInstances` 都在 finalization fail-close；真实 Babylon InstancedMesh 回归见 `486:512:packages/native-babylon-block-profile/src/check.test.ts`。 |
| package-boundary test 会漏 bare import、额外 export 和额外 runtime root export | Import 提取、manifest exports 与 Runtime root keys 现在都是精确断言（`28:111:packages/native-babylon-block-profile/src/package-boundary.test.ts`）。 |

最终 Session 只有一个 build-epoch owner：创建时记录真实 Mesh，finalize 从最终 Babylon world transform 派生一次 layout，生成无 Handle 的 report 后清空记录（`158:243:packages/native-babylon-block-profile/src/session.ts`）。Layout 按 ID 排序并只发布结构观察（`407:430:packages/native-babylon-block-profile/src/layout.ts`）；report 明示“structural candidate，不是 Runtime passability”（`353:363:packages/native-babylon-block-profile/src/check.ts`）。

## 4. 维度覆盖表

| 维度 | 状态 | 结论 |
|---|---|---|
| D1 定位与需求边界 | 不要求；辅助核对 | Profile 仍是 ADR-0007 Native Lane 内的可选 authoring helper，不是 Canonical/Hosted 能力，也未扩大室内、导航或事件能力。 |
| D2 Schema 与 AI-friendly | 已查 | 一个 Profile Ref、四个 shape、六个 palette role、一个 `CreateInput`、一个 Session、一个 closed report；字段单位/角色命名闭合，无旧新 alias。 |
| D3 承诺与事实对拍 | 已查 | 只关闭 BWB-1/BWB-2。BWB-3 视觉/截图、BWB-4 Collider/Havok、BWB-5 Corpus/人物通过性和 BNA-3+ 保持开放。 |
| D4 单一权威状态 | 已查 | Babylon Mesh 是创作期视觉/transform 输入；build-only layout 只派生一次且不从颜色/材质推断 physics；Runtime 不可查询 layout。Geometry/instance drift fail-close。 |
| D5 工程质量 | 已查 | 两个直接依赖、Deep ESM、Babylon math、稳定排序、hard caller budget、双 Session 隔离、disposed/foreign/throwing/非对称/非法 transform/overlap 回归均闭合。 |
| D6 门禁与证据分层 | 已查 | §1.1 给出 exact tree、命令和 exit；仅声明 automated-contract。未用 NullEngine 或 contract tests 冒充 rendered visual、Havok 或人工通过性。 |

## 5. 裁决与后续依赖

**BWB-1 / BWB-2 checkpoint：GO。** 该 GO 只接受可选 Package、build-epoch Session、固定 shape/grid/palette、结构 Layout/Checker、闭合诊断和 Visual Group inventory。

后续必须按依赖继续：BNA-3 后才进入 BWB-3 稳定材质与 build-epoch authoring screenshots；BNA-4 后才进入 BWB-4 同源 Collider Contribution/Havok；BNA-5/BNA-6 与 BWB-3/BWB-4 完成后才执行 BWB-5 场景还原和真实人物通过性。当前不得合并为“JSON + Babylon 场景还原已完成”。
