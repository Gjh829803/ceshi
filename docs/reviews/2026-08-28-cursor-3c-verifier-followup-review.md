# Cursor 3C verifier follow-up integration review

## 1. 审查元数据

- 模式：B，变更审查；因变更涉及物理、移动、动作、相机、固定 Tick、资源回滚和 Browser
  capability verifier，同时完整执行 Runtime deep-review checklist。
- 目标分支：`explore/scene-reconstruction-api`。
- 三方基线：`febba985255b77a180b54b3b88be7f36601ff9c5`。
- 第一批 incoming：`8e6efbd87a62b051579956371395f84e40820931`。
- 第一批 merge：`74aa58176158d782ac2e3330855357f18ebe0cad`。
- 集成修复：`cab5797038b2cd515165132f4816d84a19232607`。
- 最新 incoming：`3363a9ae00f8910b3190ebd0edccb557b00d4cca`。
- 最终 Runtime merge：`de704aa86a4e42acbeaf7c23028aa4142b4664c5`，父提交为
  `cab5797038b2cd515165132f4816d84a19232607` 与
  `3363a9ae00f8910b3190ebd0edccb557b00d4cca`。
- 依赖锁：Babylon.js `9.23.0`、Havok `1.3.14`；已对照 lockfile、当前
  `traversal-implementation-identity.ts`、Character Body conformance fixture，以及安装源码
  `node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/Physics/v2/characterController.js`。
  安装实现中的 `_displacementEps = 1e-4`、`_tryStepUp()`、`integrate()` 和
  `checkSupport()` 均已按实际版本复核，不从版本号猜测行为。

审查范围仅是 Cursor follow-up 两批 incoming、冲突解决和针对这些变更的集成修复；本分支上的
Babylon Native Authoring 工作不是本报告重新审计的对象。

### 命令与结果

以下命令均在最终 Runtime 树 `de704aa` 上执行，exit code 均为 `0`：

- 聚焦回归：
  `pnpm exec vitest run apps/playground/src/gameplay-babylon-runtime-coordinator.test.ts packages/camera/src/camera-domain-contract.test.ts packages/runtime-babylon/src/babylon-character-body-port.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts packages/runtime-babylon/src/runtime.test.ts --testTimeout=120000`
  —— 5 files、310 tests passed。
- Babylon/Havok Character Body conformance —— 1 file、21 tests passed。
- `pnpm typecheck && pnpm build` —— TypeScript 通过；Vite production build 通过，2202 modules，
  仅有既有 chunk-size warning。
- `pnpm test` —— census 闭合 301 个 Vitest 文件；contract lane 269 files，3033 passed、
  3 skipped；resource-heavy lane 32 files，510 passed。
- `pnpm verify:3c-migration` —— 11 entries、61 live references，通过。
- `pnpm verify:canonical`、`pnpm verify:rigged-subject`、`pnpm verify:g-bot-subject` —— 均通过。
  capture 使用 SwiftShader，只有 `CLI_CAPTURE_SOFTWARE_RENDERER` 性能代表性 warning；协议、碰撞、
  动作图和静态白膜证据均通过。
- `git diff --check`、冲突标记扫描、五类临时 debug marker 扫描 —— 通过。

`pnpm test:studio` 与 `pnpm test:independent` 未重跑：本审查增量不修改 Studio、root Node `.mjs`、
Cursor Python 或 Site 输入；受影响的 Vitest、production build 与四个 capability verifier 已在最终树
直接执行。未做本轮人工键鼠交互；该缺口没有被自动化或截图证据冒充。

## 2. 旧结论复验

- 已复验 `2026-08-28-babylon-9-23-upgrade-review.md` 的依赖锁与 Character Controller 假设：当前仍是
  Babylon.js `9.23.0` / Havok `1.3.14`，实际安装实现与 conformance gate 一致。旧报告的测试计数不复用，
  本报告只使用 `de704aa` 上的新结果。
- 已复验 `2026-08-28-ai-friendly-babylon-native-world-authoring-design-review.md` 中的 provider 隔离结论：
  本次修复仍只在 Babylon adapter 暴露 `didStepUp` 与有界 solver correction receipt；公共 Motion proposal
  与 SDK 权威没有加入 Babylon/Havok 方言。
- 已确认旧的候选问题“Camera action summary 应一律 unavailable”不成立并撤回：当前 Schema 只在
  locomotion `suspended` 时要求 unavailable；active locomotion 的 available/full publication 是正确合同，
  因此没有为迎合旧判断而改实现。

## 3. Findings

没有未解决的 P0、P1 或 P2 finding。以下是合并过程中发现、修复并在最终树复验的事项；它们不是
遗留 finding：

1. 3C ledger 的 Git prior 解析现在遍历 merge commit 的全部 parent，且只对精确 genesis commit/parent
   放行 genesis，避免 merge-parent 顺序绕过 append-only 验证
   （586:605:`scripts/verification/verify-3c-migration.ts`）。
2. Locomotion publication helper 遇到两个 authority candidate 时 fail closed，不再以对象迭代顺序选一个
   （14:27:`scripts/verification/locomotion-capability-state.ts`）。
3. Playground coordinator 的 owned wrapper 保留可选 `prepareFixedInputTick` seam，事务准备能力不再因
   ownership 包装被静默丢失（207:260:`apps/playground/src/gameplay-babylon-runtime-coordinator.ts`）。
4. Camera Relationship ID 使用自己的 V2 validator，接受 Registry/Gameplay 合法的冒号 ID，同时 Entity ID
   仍按自己的域验证（237:320:`packages/camera/src/camera-domain.ts`）。mounted Camera fixture 的旧期望也已
   与当前 Runtime publication 对拍。
5. Character Body 保留 incoming 的合法 walk-speed step-up，并增加 provider 明示的 `didStepUp` 与
   `maximumSolverCorrectionMeters` receipt；SDK 只接受不超过安装实现 `1e-4` 的 correction，继续阻断
   横向或纵向 proposal amplification（1014:1057:`packages/runtime-babylon/src/babylon-character-body-port.ts`；
   1240:1254:`packages/runtime-babylon/src/babylon-character-body-port.ts`）。step-up 仅在 Havok
   `SUPPORTED` 状态启用，`SLIDING` 墙面接触不会被误当台阶。
6. prepared Golden Tick 的 360-tick wall-contact 对抗回归保留，确保长时接触不穿墙
   （2444:2466:`packages/runtime-babylon/src/runtime.test.ts`）；G Bot 120 秒回归按有限地形每 240 tick
   反向，验证的是接地稳定而不是跑出 fixture 边界（3299:3384:`packages/runtime-babylon/src/runtime.test.ts`）。
7. 最新 incoming 的 Camera 修复完整保留：possess/rebind 只登记 pending intent，下一 Golden Tick 在生成
   control frame 前锁定 Subject heading，并在 A-to-B rebind 时同步新 Subject 的 published view；第一次
   profile bind 不会覆盖已锁 heading（1425:1438、2180:2215、2928:2968：
   `packages/runtime-babylon/src/babylon-world-runtime.ts`；777:787、1439:1455：
   `packages/runtime-babylon/src/camera-director.ts`）。prepare/abort/replay 也保存并恢复两个 pending flag，
   没有第二份 Camera authority。
8. Golden Action projection 在 Camera 同步和 Movement step 前完成 tick 与 authority admission；render 只同步
   已发布 view revision，不成为模拟时间或 Subject facing owner
   （2024:2075、2180:2215、2837:2853：`packages/runtime-babylon/src/babylon-world-runtime.ts`）。
9. BodyPort 用 authored upward proposal 区分真实 takeoff 与 Havok 数值级 upward lift；commit 后下一次 support
   保持 airborne，abort 则恢复先前权威（1183:1260：
   `packages/runtime-babylon/src/babylon-character-body-port.test.ts`）。
10. 在全量资源负载下暴露的临时 Git 仓库、scene/browser startup 测试 timeout 已按实际门禁成本调整；未通过
    改宽生产协议、删断言或跳过测试来换取通过。

### Runtime authority map

| 状态 | 最终唯一权威 | 下游消费者 / 边界 |
|---|---|---|
| Ground support | Babylon BodyPort 内一次 Havok `checkSupport()` 采样 | jump、gravity、locomotion/action；无 terrain height/ray/AABB 第二推导 |
| Locomotion | committed Locomotion Capability State V2 | Camera Context、Snapshot、verifier；发现双 candidate 即 fail closed |
| Subject facing | Movement Kernel/controller | visual root、snapshot、subject-relative input；Camera 只消费，不反写 |
| Camera orbit/control heading | Camera Context + Camera Director | Babylon main camera、Browser view、snapshot；pending flags 只表达事务时序 |
| Active action | admitted semantic Action projection/resolver | animation、snapshot；raw input 不直接成为动作事实 |
| Simulation time | Host fixed Tick / prepared transaction | motion、action、camera publication；render frame 不推进模拟 |
| Resource lifetime | provider owner stack、port/cache lease | partial construction、abort、reset、dispose；throwing cleanup 保留 primary error |

### 三方语义合并矩阵

| 关注点 | Base `febba985` | Incoming `8e6efbd` + `3363a9a` | Target `de704aa` |
|---|---|---|---|
| 3C prior ledger | 不含 follow-up gate | 新增 migration verifier 路径 | 保留 gate，并修正 merge-parent/genesis 与 completion evidence 边界 |
| 小步台阶 | walk-speed 时 Babylon look-ahead 不闭合 | 引入 padded step-up 与实际 controller 回归 | 保留合法台阶；加 provider receipt、1e-4 correction 上限与 `SUPPORTED`-only 墙面保护 |
| Camera orbit/rebind | 初始/换绑时 published view 与 control heading 可能跨 tick 陈旧 | 增加 view revision sync、heading lock、profile-bind lock | 全量保留，并纳入 prepared Tick snapshot/abort/replay；无第二次 Camera Context 推导 |
| Action/Camera 顺序 | Golden Tick 的跨域顺序未覆盖新语义 | Action admission 提前，Camera 在 control frame 前同步 | 保留顺序并由 runtime/browser 回归闭合 |
| 支撑离开 | provider 数值 lift 与 authored takeoff 可混淆 | 记录 authored upward departure | commit/abort/reset 均闭合，数值 lift 仍 grounded，真实 takeoff 仍 airborne |
| owned wrapper | 可选 prepare seam 可能被包装丢弃 | incoming 依赖 prepared Golden Tick | wrapper 明确保留 seam，coordinator 与 Runtime 共用同一事务 |

## 4. 维度覆盖表

| 维度 | 状态 | 结论与证据层级 |
|---|---|---|
| D1 定位与需求边界 | 不适用 | 模式 B 不要求 D1；同时抽查确认本次变更不扩大 Canonical/Native Lane 边界，不把 experimental capability 宣称为 production。`static-read` |
| D2 Schema 与 AI-friendly | 已查 | Relationship ID、Camera Context、Locomotion V2 与 provider receipt 边界保持一个概念一个名字；Babylon 私有语义未进入公共 Authoring Schema。`static-read`、`automated-contract` |
| D3 承诺与事实对拍 | 已查 | verifier、runtime consumer、fixture 与本报告命令逐项对拍；没有以设计或 build 代替运行能力。`static-read`、`automated-contract` |
| D4 单一权威状态 | 已查 | authority map 闭合 Ground、Locomotion、Facing、Camera、Action、Tick、Lifetime；无确认的第二 owner。`static-read`、`automated-contract` |
| D5 工程质量与可维护性 | 已查 | 三方语义合并、事务回滚、双实例、长时墙接触、数值 lift/takeoff、reset/rebind、throwing cleanup 均有对抗覆盖。`static-read`、`automated-contract` |
| D6 门禁与证据分层 | 已查 | exact-tree focused/full/build/direct verifier 均通过；G Bot 的五张 world/idle/walk/run/jump PNG 已做 rendered visual 检查，角色、动作与墙体构图一致；未声称 manual interaction。`automated-contract`、`rendered-visual` |

### Runtime deep-review closure

- Engine semantics：已对照安装版本与真实源码；conformance 21/21。
- Adversarial transitions：rebind 后 strafe、published heightfield、360 wall ticks、120 秒接地、
  solver lift、authored takeoff、abort、双实例与 throwing cleanup 已覆盖。
- Semantic merge：base / incoming / target 已逐 authority 对拍，冲突未用整文件择边处理。
- Evidence separation：自动合同、软件渲染截图、人工交互分别记录；没有用 SwiftShader 性能代表硬件表现。
- 完成判断：当前审查范围没有开放 P0/P1/P2；可以结束本轮集成，但这不等于 Babylon Native Lane 的
  后续 Task 5 或 production gates 已完成。
