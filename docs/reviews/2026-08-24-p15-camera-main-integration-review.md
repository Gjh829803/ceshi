# P1.5 Camera Main Integration Review

## 1. 审查元数据

- 日期：2026-08-24
- 状态：**Final GO for P1.5 integration**（带已记录的基线/资源竞争例外）
- 审查模式：B（变更审查）；变更涉及 Camera、输入方向、Render、Capture、Reset/Rebind
  与 Browser Runtime，因此同时适用
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)
- 当前集成分支：`codex/p15-camera-main-integration`
- 本文创建时已提交 HEAD：`84ee454b3634cefc670df24ca4897a9d2faddd32`
- 当前目标基线：`origin/main@429fe1d183fdcb6d5b6da11cfd78ff07a86cf93f`
- 原始 Camera 分支：
  `origin/aurora/p15-camera-tuning-cleanup@854dbff67379b59a942a226518008b9c10f38916`
- `origin/main` 与原始 Camera 分支的 merge-base：
  `3c66e15236c31f842940b948585f16f7dc4c2513`
- 当前工作树包含待统一提交的集成修复、测试、门禁制品和本文；最终合入仍须由主 Agent
  区分源码、文档与门禁生成制品，并在提交后复核 clean tree。
- 安装依赖：Babylon.js `9.21.2`、Havok `1.3.14`；版本来自根
  `package.json`、`packages/runtime-babylon/package.json` 与 lockfile。
- 权威依据：
  - [`P1.5 Camera Tuning cleanup plan`](../superpowers/plans/2026-08-23-p15-camera-tuning-cleanup.md)
  - [`Context-driven Gameplay Camera composition design`](../superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)
  - [`AI-first Lego SDK design`](../superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)
  - [`docs/18 refactor progress`](../18-refactor-progress-and-backlog.md)

### 1.1 当前结论

当前实现已达到 **P1.5 integration Final GO**：保留 `main` 的 Browser V5 / Route Evidence
V2 和现有 Runtime 合同，只把 Camera 数字 overlay 收进显式 Authoring Preview Channel；
Gameplay 继续只消费锁定 Profile 和 fixed-tick 状态。最终相机矩阵、构建、Canonical、
Route/资产、Validation Capture、类型与 Lock 门禁均通过；两条全量测试失败已在串行复跑和
同机 `main` 对拍中确认是重型 Route 资源竞争，不是 Camera regression。`verify:control-capture`
在 `main` 与候选上均因相同 stale World Package Hash 失败，记录为既有基线漂移，不在本
切片改金标。当前无 open confirmed P0/P1。

## 2. 三方语义融合

| 语义面 | merge-base / 原始共同状态 | 原始 Camera 分支意图 | 最新 `main` 必须保留 | 当前候选处置 |
| --- | --- | --- | --- | --- |
| Browser 协议 | 旧 Browser 形状 | 删除 `setCameraTuning` 与自由字符串 Preference，增加 Preview | Browser V5、Route Evidence V2 只读查询、V2/V5 clean break | 在 V5 上移植 Camera 能力，不恢复 V4、Route V1 或兼容 alias |
| Gameplay Camera 选择 | 自由字符串或会话态选择 | production 只接受可达的锁定 Profile Ref | Camera Context/Registry 锁与现行 Runtime State | 暂用 `requestCameraProfile/resetCameraProfile` 过渡入口；Runtime admission 校验可达 Ref |
| Camera 数字调参 | Runtime/Snapshot 会话 overlay | 数字仅留 Authoring Preview | Canonical Snapshot 和 Take 不应出现数字袋 | `CameraPreviewStateV1.tuningByProfileRef` 是独立 Preview State；Snapshot 不含 tuning |
| Subject Preset | Preset 请求可夹带 Camera 数字 | 从 Gameplay Preset 请求删除 Camera 数字 | main 的 Feel/Control/Profile Ref 收口 | `ApplySubjectPresetTuningRequestV1` 不再承担 Camera tuning/preference |
| Camera-relative Control | Camera 呈现参数可能反向影响移动方向 | Preview 不得改变 Gameplay | fixed-tick Subject trajectory 与控制所有权 | CameraDirector 使用锁定参数维护独立 control-forward lane；Preview 参数只驱动呈现 lane |
| Render / Capture | Camera Pose 与渲染输出同源 | Preview 必须能实时改变画面 | Capture 发布真实 View/Projection Matrix 与 Pass hash | Preview 改变 rendered Camera、Matrix/Pixels 和最终 `frameHash`，但不成为 Gameplay 输入 |
| Reset / Rebind / lifetime | 单实例稳态为主 | Preview 为 Runtime 私有临时态 | main 的 reset/rebind/pause/resource ownership | Reset/Rebind 清理本 Runtime Preview；多实例和 dispose 不共享 tuning map |

该融合不是“选择某一侧整个文件”。当前候选逐项保留 `main` 的 V5/Route 合同、原始 Camera
分支的数字袋收口目标，以及最新 Camera Context 设计对长期 View Preference 的唯一命名。

## 3. Authority matrix

| 状态 / 事实 | 唯一权威 | 下游消费者 | 当前证据与边界 |
| --- | --- | --- | --- |
| Active Camera Profile（过渡期） | CameraDirector 的显式 Profile Ref；Babylon Runtime 负责 Camera Context 可达性 admission | Babylon Camera、Snapshot、Preview State | `1337:1364:packages/runtime-babylon/src/babylon-world-runtime.ts`；GCC-3 将 clean break 公共入口 |
| Camera Preview tuning | 单 Runtime 的 CameraDirector `tuningByProfileRef` | Render Camera 参数、Preview State | `253:281`、`637:655:packages/runtime-babylon/src/camera-director.ts`；不写回 Registry/World State |
| Rendered Camera Pose / FOV | CameraDirector + Babylon Camera | Render、Capture Camera Matrix、Snapshot Camera projection | `331:459:packages/runtime-babylon/src/camera-director.ts`；Preview 可有意改变该状态 |
| Camera-relative control direction | CameraDirector 的 locked-parameter control lane | fixed-input 到 Subject command 的方向基 | `218:240`、`355:456:packages/runtime-babylon/src/camera-director.ts`；不得消费 Preview tuning |
| Subject Gameplay trajectory | fixed-tick Subject Controller / Motion Kernel | Subject Snapshot、Take、Validation | Preview 对照测试要求同输入下 tick 与 `subjectStatesByEntityId` 完全一致 |
| Canonical Runtime projection | Babylon Runtime `snapshot()` | Browser Snapshot、Take/Capture envelope | `146:173:packages/runtime-contracts/src/runtime-session.ts` 不含 Camera tuning/preference 数字袋 |
| Control Capture frame identity | 真实 rendered Camera Matrix + Pass Content Hash 的 canonical bundle | Capture Bundle、Validation | Preview 不进入 Take 输入，但渲染变化必须导致相应 Matrix/Pass/`frameHash` 变化 |
| Simulation time | fixed tick | Motion、Camera Director update、deterministic trajectory | `renderFrame()` 只应用动画 Pose 并渲染，不推进 Camera/Simulation：`1230:1244:packages/runtime-babylon/src/babylon-world-runtime.ts` |
| Preview lifetime | 拥有它的 Runtime / CameraDirector | reset、rebind、dispose | 双 Runtime Preview 隔离、reset/dispose 与异常回滚矩阵已通过 |

## 4. 保留项与拒绝项

### 4.1 必须保留

1. Browser Protocol V5 和 Route Evidence V2 的当前方法、稳定错误与同字节投影。
2. Gameplay production 路径只消费锁定、Camera Context 可达的 Camera Profile Ref。
3. 数字调参只存在于显式 `getCameraPreviewState/applyCameraPreview` Authoring Preview
   通道；Promotion 后才通过新 Registry 版本影响正式配置。
4. Snapshot 不暴露 `camera.tuning` 或旧自由字符串 `camera.preference`。
5. Preview 能改变 rendered Camera 构图，同时 locked control lane 保证 Subject Gameplay
   trajectory 不被 authoring 数字调参污染。
6. Reset、Rebind、Pause、双 Runtime 和 dispose 的单一所有权；render cadence 不定义
   simulation time。

### 4.2 明确拒绝

1. 不整体合入旧 Browser V4 文件，不增加 V4 adapter、Route V1 或永久 alias。
2. 不恢复 `setCameraPreference`、`setCameraTuning`，也不把 Camera 数字重新塞进
   `applySubjectPresetTuning` 或 `WorldRuntimeSnapshotV3`。
3. 不同时发布 `request/reset`、自由字符串 preference、长期 `cameraViewPreference` 和
   `view.set-mode/view.set-rig` 多套公共方言。
4. 不允许 Preview 参数决定 Subject movement、Action、Possession、Relationship 或
   fixed-tick Gameplay 状态。
5. 不把 Babylon Node、Camera Handle、输入设备名或其他 provider 术语暴露到 Canonical
   Schema、CLI、Browser、Snapshot、Report 或 Capture manifest。
6. 不在 P1.5 内临时投影 Relationship/Action/Equipment/Medium 的 Camera Context Tag。

## 5. GCC-3 与后续 Projector 边界

`requestCameraProfile/resetCameraProfile` 是尚未发布的 P1.5 过渡协议。它允许当前候选验证
“production 只认可达 Profile Ref”，但不是长期公共命名。GCC-3 必须一次 clean break 到
唯一闭合 `cameraViewPreference` 与 `view.camera-preference.set/reset`，并同步 Schema、
Runtime/World Session、CLI、Browser、generated types、Snapshot/Event、examples 和测试；
不得保留 request/reset alias。

从 committed `possessedBy/mountedOn/equippedAt`、Action、Motion、Equipment、Medium 与
Socket 投影 Camera Context 的工作属于后续 GCC Camera Context Projector。P1.5 不读取这些
raw committed inputs，也不允许 Agent 直接提交任意 Camera Context Tag。本切片只解决
Camera tuning 数字 overlay 与 Preview/Gameplay 隔离。

## 6. Preview、Take 与 Capture 的语义

三个概念必须区分：

- `SimulationTakeV1` 不含 Preview tuning，Take runner 不发送 Preview 命令，所以 Preview
  不是 Replay 输入或 Subject Gameplay Ground Truth。
- Preview 会改变实际 Babylon Camera 的 Pose、FOV、Target 或 damping 结果，因此相同
  Subject fixed-input 下可以得到不同的 rendered Camera Matrix 与 Pixels。
- Control Capture 的 Camera Matrix、Pass Content Hash 和 canonical frame body 属于呈现证据；
  Preview 导致这些内容变化时，`frameHash` 也应变化。这是预期行为，不是 determinism
  破坏。确定性要求是“相同 World/Take/Preview 条件得到相同 Capture”，而不是忽略 Preview
  强行得到相同画面 Hash。

当前 NullEngine 聚焦测试证明 Preview 改变 renderFrame 后的 Camera position，同时
30/60/120 Hz-like render cadence 下最终 Camera State 一致，且 Subject trajectory/tick 与
无 Preview baseline 一致。Canonical 的真实 Chromium/Playwright Capture 与
`verify:validation-capture` 已通过；独立 `verify:control-capture` 在 `main` 和候选上均在进入
Camera 差异对拍前因同一个 stale World Package Hash 失败。该失败证明现有金标与当前
World Package 基线漂移，不是本分支引入的 Camera 行为差异；本切片不通过更新金标掩盖它，
而是在后续基线维护任务中独立收口。

## 7. 最终验证证据

### 7.1 Blocking gates

以下结果均来自最终候选工作树，exit code 均为 `0`：

| 命令 / Gate | 结果 | 证据层级 |
| --- | --- | --- |
| 最终 Camera focused matrix（Contract、Camera、Registry、Runtime、Adapter、Workbench、Browser） | 10 files / 190 tests passed | automated-contract / runtime-integration |
| `pnpm typecheck` | passed | automated-contract |
| `pnpm install --frozen-lockfile --offline` | 27 workspace projects；Lockfile up to date | dependency/lock integrity |
| `pnpm build` | Vite build passed；1m54s | automated-contract |
| `pnpm verify:canonical` | Browser Protocol V5、Playwright Capture、Babylon/Havok 等 13 gates passed | automated-contract / rendered-visual |
| `pnpm verify:route-r0-contract` | passed | automated-contract |
| `pnpm verify:route-r1-heightfield` | passed | automated-contract / runtime-integration |
| `pnpm verify:route-r1b-static-platform` | passed | automated-contract / runtime-integration |
| `pnpm verify:placement-layout` | passed | automated-contract / rendered-visual |
| `pnpm verify:rigged-subject` | passed | automated-contract / rendered-visual |
| `pnpm verify:g-bot-subject` | passed | automated-contract / rendered-visual |
| `pnpm verify:validation-capture` | passed | automated-contract / capture-validation |
| `git diff --check` | passed | static-check |

Build 仅保留既有 Rollup 大 Chunk warning；NullEngine Runtime 测试保留 Skeleton
vertex-uniform 能力估算 warning。二者均已分类，未作为真实 Chromium 视觉通过的替代证据。

### 7.2 Full-suite 资源竞争处置

`pnpm test` 连续两次都得到相同分类：149 个测试文件中 147 个通过，1589 项测试中 1587 项
通过；失败只来自两条重型 Route 测试超时。它们脱离全量并发后均通过：

- `worldkit-route-run`：串行通过，耗时 `46.964s`；
- `route-validation-runner`：12/12 通过，耗时 `102.07s`。

为排除 Camera 分支导致 1041-tick Route 变慢，在同一机器直接对拍候选与 `main`：候选
`39.035s`，`main` `40.372s`。候选没有性能回退；全量并发失败由重型 Route 任务争抢资源
触发。该例外不隐藏失败计数，但不阻断 P1.5 Camera integration。

### 7.3 Control Capture 基线例外

`pnpm verify:control-capture` 在 `main` 与候选上均因相同 stale World Package Hash 失败。
由于两侧失败点与 Hash 完全一致，且 `verify:validation-capture`、Canonical Playwright Capture
与候选其余 Capture/Runtime 门禁通过，判定为既有基线漂移而非 Camera regression。本切片
不得为通过门禁直接重写该金标；后续由独立基线维护任务修复。

### 7.4 独立复核证据边界

Cursor fast 最终复核在限定时间内没有输出，已终止，因此不能引用为 review 证据。Final GO
来自 Host 对三方语义融合、authority、最终 diff 和上述门禁/例外的复核，而不是把沉默的
Cursor 会话当作通过。

## 8. 旧结论复验

| 旧结论 | 当前处置 | 当前证据 |
| --- | --- | --- |
| 原始 Camera 分支的 Browser V4 Canonical Gate 可作为完成证据 | 已失效 | 当前目标是 Browser V5 / Route Evidence V2；旧 V4 结果不能证明三方融合 |
| Preview 不进入 Take，所以 Capture Hash 不变 | 已失效并修正文档 | Take 输入与 rendered Capture 是不同权威；Capture frame body 包含 Camera Matrix/Pass Hash |
| Camera 数字 overlay 已完成 | 已在 Browser V5 `main` 基线上重新验证后恢复为完成 | 最终 10/190 相机矩阵、完整门禁和 Host 三方语义复核完成；GCC-3 仍是独立后续 |
| Preview 可以复用 Gameplay Camera control-forward | 已失效 | 当前 CameraDirector 使用 locked-parameter control lane，Preview 只影响呈现 lane；聚焦 trajectory 对照通过 |

## 9. Findings 状态

最终 Host 审查没有 open confirmed P0/P1。两条全量 Route 超时和 Control Capture stale Hash
已在 §7 分别完成 branch/main 对拍与基线处置，不是被静默忽略的失败。Cursor fast 会话没有
输出，未被当作证据。任何后续 confirmed finding 仍须按
`full-dimension-review-protocol.md` 的 P0–P2 固定格式追加并绑定当前代码证据。

## 10. 最终门禁 disposition

| Gate | 最终状态 | 处置 |
| --- | --- | --- |
| 最终 Camera focused matrix | passed | 10 files / 190 tests |
| Full `pnpm test` | accepted with resource-contention exception | 两次 147/149 files、1587/1589 tests；两项 Route 串行通过并完成 branch/main timing 对拍 |
| Build / Typecheck / Frozen Lock / Diff | passed | exit `0`；warning 已分类 |
| R0 / R1 / R1b Route gates | passed | Browser V5 / Route V2 无回退 |
| Canonical / Placement / Rigged / G Bot | passed | 自动合同与 rendered artifacts 均生成成功 |
| Validation Capture | passed | Capture validation 闭环通过 |
| Control Capture | accepted baseline exception | `main` 与候选同一 stale World Package Hash；不在 Camera 切片改金标 |
| Reset/Rebind/Pause、双 Runtime、30/60/120 Hz | passed | 最终 focused matrix 覆盖 |
| Host full-dimension/runtime review | passed | 三方融合、authority 与例外已闭合；无 open confirmed P0/P1 |
| Cursor fast final CR | not evidence | 限定时间无输出后终止；不影响基于 Host + gates 的结论 |
| 提交后 clean-tree/upstream check | integration step | 由主 Agent 提交时区分源码、文档和生成制品后执行 |

## 11. 维度覆盖表

| 维度 | 状态 | 当前证据 / 待办 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | P1.5 只收口 Camera overlay；GCC Projector、Relationship/Action/Equipment Context 明确后续 |
| D2 Schema 与 AI-friendly | 已查 | V5 删除旧数字袋/自由字符串且未恢复 alias；GCC-3 clean break 明确为后续，不冒充本切片 |
| D3 承诺与事实对拍 | 已查 | 实施计划、`docs/18` 与本文同步 P1.5 完成、GCC-3 开放及两项门禁例外 |
| D4 单一权威状态 | 已查 | Preview/locked control/Subject trajectory、Capture、pause/reset/rebind 与 cadence 完成矩阵复验 |
| D5 工程质量与可维护性 | 已查 | 稳定失败、双实例、cleanup、frozen lock、build 与重型测试资源竞争已处置 |
| D6 门禁与证据分层 | 已查 | automated/runtime/rendered 证据与 baseline exception 分层记录；Cursor 无输出未充当证据 |

## 12. 合入判定

当前判定是 **FINAL GO FOR P1.5 INTEGRATION**。§7/§10 已完整记录通过项、资源竞争例外和
既有 Control Capture 基线漂移；当前无 open confirmed P0/P1。主 Agent可按所有权清理门禁
制品、提交并集成该候选。该结论只关闭 P1.5 Camera tuning overlay；GCC-3 的
`cameraViewPreference` clean break 和后续 Camera Context Projector 仍是独立未完成工作，
不得由 Preview Channel 提前宣称交付。
