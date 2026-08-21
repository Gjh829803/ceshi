# P1.5 Control Feel / Medium / State Resolver 设计审查

## 1. 审查元数据

- 模式：**A + D4**。按
  [`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) 执行规格审查，
  并额外执行 Support / Medium / Feel 单一权威审查。
- 对象：
  [`2026-08-21-control-feel-physics-medium-state-resolver-design.md`](../superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md)。
- PR：#8，分支 `cursor/p15-control-feel-design-39e1`，目标 `main`。
- 审查输入 HEAD：`ef921774cf76e35945a42f2286c653e1aa77851a`；同一 PR 上直接修订，
  未新开平行规格。
- Diff 基线：`main@4cfbf07df677bea9a12933bf9d40717cc431f902`。
- 规格状态：审查前 `Draft`；本次关闭下列 Findings 后改为
  `Frozen for implementation planning`。
- 只读对照：`AGENTS.md`、`docs/16-subject-assets-3c-integration.md`、
  `docs/18-refactor-progress-and-backlog.md` P1.5/M7、Hybrid Terrain review §2.5/§3、
  Character/Camera design §5.2、Registry V2/V3 类型、Motion/Medium Catalog、
  Babylon Runtime 支撑路径与安装源码。
- 引擎版本：`@babylonjs/core@9.21.2`、`@babylonjs/havok@1.3.14`；已对照
  lockfile、安装依赖清单与本地安装源码。
- 证据层：本次只有 `static-read` 与文档/typecheck 自动门禁；没有修改 Runtime、
  Catalog、CLI 或测试，也没有把文档结论冒充 `rendered-visual` / `manual-interaction`
  证据。
- 明确未修改：`docs/18-refactor-progress-and-backlog.md` 的勾选/进度，以及派发方列出的
  全部 P0.3 文件。

验证命令与结果：

| 命令 | Exit code | 说明 |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | 建立隔离 worktree 依赖，不改 lockfile |
| `pnpm typecheck` | 0 | 修订后仓库类型门禁 |
| `git diff --check` | 0 | 修订 diff 无 whitespace error |
| `pnpm test` / `pnpm build` / Runtime verify | 未跑 | 本次只改规格/交叉引用，且明确禁止实施；不把未改 Runtime 的既有 Gate 当设计正确性证据 |

**审查结论：可以按此开实施计划。**

该结论只表示字段归属、首切片和支撑权威已经可以冻结；不表示 P1.5 Runtime 能力已实现，
也不改变 `docs/18` 的完成度。

派发方 Freeze checklist：

| # | 结果 | 冻结位置 |
|---:|---|---|
| 1 | 通过 | canonical kind 与旧方言映射：规格 §5、`docs/16` 顶部映射表 |
| 2 | 通过 | Feel 独占运动数字；Locomotion boolean-only；两类稳定 Admission code：规格 §5.1–§5.2 / §11 |
| 3 | 通过 | 删除 ray bootstrap；唯一 unpublished integration → checkSupport：规格 §8.1 |
| 4 | 通过 | Object AABB 禁止；primitive/convex 当前闭合，triangle/Surface 下一入口 P2.6+P2.5：规格 §8.2 |
| 5 | 通过 | Resolver/Snapshot 关闭 Ground/Air，water 返回稳定失败码：规格 §7 / §11 |
| 6 | 通过 | Motion 无 parameters/Feel；Definition Feel 唯一：规格 §5.3 / §6 |
| 7 | 通过 | slope/step 只在 Physics Body，Medium 无 grounding tolerance；已核对安装源码：规格 §5.5–§5.6 / §10 |
| 8 | 通过 | 游泳、Hybrid、Validation 新协议排除于第一切片：规格 §2.2 / §9 / §12 |
| 9 | 通过 | 数值字段带单位、Ratio 或明确数学域：规格 §5.2 / §5.4–§5.7 |
| 10 | 通过 | 目标、权威图、闭合集、诊断、后续边界互相一致：规格 §2 / §4 / §9 / §11–§13 |

## 2. 旧结论复验

### 2.1 Hybrid Terrain review §2.5：spawn ray 是第二份支撑

- 现状：**成立，已复验并纳入修订**。
- 当前一手证据（static-read）：`224:229:packages/runtime-babylon/src/motion-kernel-runtime.ts`
  在 spawn 设置 `initialGroundSupportPending`；
  `1129:1155:packages/runtime-babylon/src/motion-kernel-runtime.ts` 又以水位、pending 与
  raycast 改写 Ground/Water/Air，而固定步另有 `checkSupport()`。
- 修订结果：规格 `419:443` 冻结无射线的唯一初始化顺序，明确删除 pending 与第二条
  接地路径。

### 2.2 Hybrid Terrain review §2.5 / §3：Object `supported-by` 使用 AABB 顶

- 现状：**成立，已复验并纳入修订**。
- 当前一手证据（static-read）：
  `231:240:packages/runtime-babylon/src/babylon-world-runtime.ts` 使用
  `supporting.maximumMetersXYZ[1]` 计算 Object 支撑 gap。
- 修订结果：规格 `445:466` 要求当前可查询 primitive/convex Collider 走锁定 shape，
  无法查询时稳定阻断；triangle subshape / Surface ID 的下一入口明确归 P2.6 H1 与
  P2.5 Surface 联合切片。

### 2.3 Character / Camera design §5.2：首 tick 可使用 bounded ray bootstrap

- 现状：**作为 P1.5 方案已失效**。
- 安装源码复验（static-read）：锁定 Babylon 9.21.2 的 `setPosition()` 只复制位置；
  `checkSupportToRef()` 从当前 manifold 建约束；`integrate()` 执行 cast/proximity 并更新
  manifold。因此直接 raycast 会建立第二权威，直接 setPosition 后 checkSupport 又没有
  足够的 contact lifecycle。
- 修订结果：规格 `421:443` 以唯一的“不发布 bootstrap integration → 一次
  checkSupport”取代 ray；该顺序是 Provider lifecycle adapter，不进入 AI Schema。

### 2.4 `docs/18` P1.5 / M7

- 现状：**仍是待实施项**。文档要求先完成专项评审，不能把规格成稿算成 Runtime
  交付。
- 处理：本次只冻结实施权威；没有修改复选框或进度数字。

## 3. Findings

以下 Findings 均在同一 PR 中修订。没有未关闭的 P0/P1。

### [P0] [D4] Feel 在 Definition 与 Motion 中存在双重选择入口（已修订）

- 证据（static-read）：审查输入稿
  `171:189:docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md@ef92177`
  给 Motion Profile 增加 `controlFeelProfileRef` 与“零 Feel”；
  `319:321` 又要求它与 Definition Feel 相等。这不是单一真相，只是用一致性校验维持
  两份 Agent 可编辑字段。
- 期望：一个 Profile Ref 只在一个公共位置选择；Motion 只选择 Kernel，Feel 数字只由
  Definition 的 `profiles.controlFeelProfileRef` 进入第一切片。
- 影响：Agent 切换 Motion 或 Feel 时必须同时修改两处；失败回滚、fallback 与 Snapshot
  会出现无法判定的生效 Feel。
- 建议：删除 Motion 的 Feel Ref 和 mismatch Diagnostic；冷启动缺 Feel 在 Admission
  失败，运行中切换失败保持上一稳定组合。
- 复核：**已修订**。当前规格 `190:213` 与 `327:360` 冻结 Definition 唯一 Feel；
  Fallback Motion 使用同一 Feel，不再绑定“零 Feel”。

### [P0] [D4] spawn/reset 与支撑迟滞会覆盖 `checkSupport()`（已修订）

- 证据（static-read）：当前 Runtime 的
  `224:229`、`341:366`、`1129:1155:packages/runtime-babylon/src/motion-kernel-runtime.ts`
  存在 pending/raycast 支撑旁路；审查输入稿 `228:255` 与 `356:362` 又引入
  `groundingToleranceMeters`、enter/exit support hold ticks，并用迟滞写 ground/air。
- 期望：每个活动 Character 每个发布 Tick 只有一次 `checkSupport()`；Medium 不得重新
  判定 Ground。初始化必须符合锁定 Provider 的 contact manifold 生命周期。
- 影响：悬空出生、Reset、离开台沿或陡坡 sliding 时可能被 pending/迟滞继续报告为
  ground，跳跃准入与重力积分随之错误。
- 建议：删除 ray、pending、Ground 容差与支撑迟滞；只允许一次不发布的 bootstrap
  integration，随后一次 support query，unsupported 立即发布 air。
- 复核：**已修订**。当前规格 `238:279` 删除 Medium 支撑阈值并冻结重力组合，
  `392:443` 冻结
  Support 状态投影与 spawn/reset 唯一顺序，并增加
  `SUBJECT_SUPPORT_BOOTSTRAP_INVALID`。

### [P1] [D2] Locomotion 不是 boolean-only，且第三套 Profile 方言未完全作废（已修订）

- 证据（static-read）：审查输入稿 `101:119` 仍给 Locomotion
  `supportedMediums`、`allowedMotionKernelRefs`、`allowSwim`、`allowFlight`；原
  `docs/16` 的 `81:84`、`296:319`、`381:396` 仍展示
  `ControlMethodProfile` / `PhysicsMediumProfile` / Motion 内 Feel 方言。
- 期望：Canonical 只使用 `control-profile`、`control-feel-profile`、
  `locomotion-profile`、`medium-profile`；Locomotion V1 领域载荷只有布尔 Ground/Run/
  Jump 能力，速度和 Kernel 白名单各回唯一所有者。
- 影响：AI 会在多组同义类型、Medium 列表与 Kernel 白名单之间猜测，继续生成旧字段或
  双重约束。
- 建议：关闭 Locomotion V1，给所有旧名明确“作废 → canonical”映射，并用稳定
  Admission code 阻止速度与其他非布尔领域字段。
- 复核：**已修订**。当前规格 `100:143` 冻结 canonical map 与 boolean-only V1；
  `18:29:docs/16-subject-assets-3c-integration.md` 明确旧名/旧 Ref 字段映射与作废方式；
  `34:34:AGENTS.md` 固化后续实施规则。

### [P1] [D2] 速度/坡度/响应数字仍分散在 Motion、Locomotion 与 Control（已修订）

- 证据（static-read）：现树
  `260:270:packages/subject-registry/src/types-v2.ts` 在 Locomotion 保存四类速度；
  `71:78:packages/subject-registry/src/types-v3.ts` 允许 Motion 开放参数袋；
  `41:71:assets/registry/motion-profiles/catalog.json` 同时保存速度、Feel、坡度和台阶；
  审查输入稿又把 `responseExponent` 留在 Control。
- 期望：Feel 独占速度、加减速、转向、响应曲线、jump/coyote/buffer/air-control；Body
  独占 slope/step；Control 只保留 Intent 解释与死区；Motion 只保留 Kernel Ref/Tags。
- 影响：同一数字可以从多个 Profile 或 Adapter 覆盖，导致不同 Agent/Compiler 路径产生
  不同轨迹与 Hash。
- 建议：删除 Motion 参数袋；把响应指数迁入 Feel；明确 Body 到 Babylon Controller 的
  唯一单位映射，并为旧字段给稳定失败码。
- 复核：**已修订**。当前规格 `145:213`、`215:236`、`281:323` 分别冻结 Feel、
  Control 与 Body 的职责和数值域；`508:524` 冻结 Admission/Resolve Diagnostic。

### [P1] [D1/D3] 第一切片仍通过字段和 Catalog 语义暗含 Water/Flight（已修订）

- 证据（static-read）：审查输入稿 `71:72`、`107:112`、`201:218`、`228:259` 允许
  Water Sensor、Swim/Flight capability、flight-frame 与 water block；现树
  `15:35:packages/subject-registry/src/types-v3.ts` 和 Medium/Motion Catalog 也声明了远超
  当前 Ground Character 切片的能力。
- 期望：规格必须区分“现树实验声明”与“第一切片生产合同”；V1 不应通过 `false` 的
  Swim/Flight flag 或未消费的 Water 字段提前冻结后续协议。
- 影响：实施者可能把 Catalog 中已声明但未形成纵向 Gate 的能力当作 P1.5 必交付，或让
  Resolver 提前写 water。
- 建议：将 Control/Locomotion/Medium V1 收窄到 Ground/Air；Water、Flight 只能由后续
  Schema 版本引入；第一切片输出 water 稳定失败。
- 复核：**已修订**。当前规格 `19:20`、`47:55`、`117:143`、`215:266`、`396:400`
  关闭首切片并冻结 `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`；`290:318:docs/16-subject-assets-3c-integration.md`
  将游泳链路明确标为 P2.5 产品目标态。

### [P1] [D4] Object `supported-by` 的第一切片和 Hybrid Surface 边界不闭合（已修订）

- 证据（static-read）：现树
  `231:240:packages/runtime-babylon/src/babylon-world-runtime.ts` 用 AABB maximum；审查
  输入稿 `386:396` 要求 Collider 表面，却同时把斜面、栏杆、拱桥 Fixture 全塞入 P1.5，
  没有说明不支持的 Collider 如何失败，也没有下一切片入口。
- 期望：AABB 顶永远不得充当权威表面；P1.5 应给现有可查询 Collider 一个闭合最小切片，
  对更复杂 triangle/surface 明确 Owner、入口与失败语义。
- 影响：实现者要么继续 AABB 回退，要么被迫在 P1.5 偷渡 Hybrid Surface 公共协议。
- 建议：P1.5 只承诺锁定 primitive/convex Collider query；不支持的 shape 阻断；P2.6 H1
  从同一接口扩展 triangle subshape / Surface ID，并与 P2.5 Surface 合同共同冻结。
- 复核：**已修订**。当前规格 `445:466` 写死查询来源、稳定错误码、非 grounding 用途及
  下一切片入口。

### [P1] [D1/D6] 目标、诊断、门禁与后续边界互相矛盾（已修订）

- 证据（static-read）：审查输入稿一面称第一切片 Ground/Air，另一面在 §11 说 Water
  Sensor/迟滞已经进入 Medium；一面要求唯一 Feel，另一面定义
  `SUBJECT_DEFINITION_FEEL_MISMATCH`；第一切片还引用 P0.3 Validation 并列出
  CLI/Browser 行为，却未区分现有协议与新协议。
- 期望：目标/非目标、权威图、Schema、Resolver、Diagnostics、闭合集和后续切片必须用
  同一术语描述同一范围；设计审查不能声称 Runtime 已通过。
- 影响：后续实施计划无法确定哪些字段必须改、哪些协议不能碰，也无法为失败建立稳定
  Gate。
- 建议：重写首切片闭合集与诊断表，删除 mismatch/hysteresis 旧码，明确只复用现有
  Admission/Explain/Snapshot 通道，并把 Runtime Gate 留给实施计划。
- 复核：**已修订**。当前规格 `22:98`、`468:484`、`508:540` 形成一致的目标、权威、
  闭合集、诊断和后续边界；本文结论明确只授权开实施计划。

## 4. 维度覆盖表

| 维度 | 状态 | 证据与结论 |
|---|---|---|
| D1 定位与需求边界 | 已查 | 首切片关闭为 Ground/Air Character；游泳、飞行、Hybrid、Validation 新协议均排除并给出后续 Owner |
| D2 Schema 与 AI-friendly | 已查 | canonical kind、Ref、单位/Ratio、boolean-only Locomotion、关闭联合、稳定 Diagnostic 已逐项核对 |
| D3 承诺与事实对拍 | 已查 | 对拍 V2/V3 类型、Catalog 与 Runtime；明确这些仍是后续 Clean Break 债务，规格冻结不等于能力完成 |
| D4 单一权威状态 | 已查 | Feel、Support、Medium、Body traversal、Object support surface 均给出唯一 Owner 和禁止旁路 |
| D5 工程质量与可维护性 | 不适用 | 模式 A 未要求，且本次没有代码、依赖或实现变更；未据此跳过任何 Schema/authority 问题 |
| D6 门禁与证据分层 | 已查 | 记录命令与 exit code；只声明 static/typecheck 证据，Runtime/视觉/人工证据明确未产生 |
