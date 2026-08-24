# Route R1b Static Platform Task 10 Runtime Review

## 1. 审查元数据

- 日期：2026-08-24
- 状态：**Final GO / R1b and M5 complete**
- 审查模式：B（变更审查），并因涉及 Babylon/Havok、资源生命周期、CLI/Browser
  Runtime Evidence 而完整纳入 `runtime-deep-review-checklist.md`
- 分支：`codex/r1b-integration`
- 本文创建时 HEAD：`2e761c3a7da70999a7fc5aeef2838c1c16e5a4ab`
- 最终候选 HEAD：`506e088bf929d153f4bbc4a24be5eaaa64a1ba87`
- 最终 `merge-base origin/main HEAD`：
  `9c5a6158c347e08ea0af01135cb827166ffbede0`
- 首轮 Cursor 审查对象：`28752e0`；chat
  `1e938715-a5b2-4a25-ad83-45eec0c37c15`，Final GO / No findings
- 条件复核对象：`506e088bf929d153f4bbc4a24be5eaaa64a1ba87`；chat
  `d61f751c-a398-4063-bcbf-2ddc55ea20a9`，Final GO / No findings
- 权威规格：
  - `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md`
  - `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`
  - `docs/superpowers/plans/2026-08-23-route-r1b-static-platform-implementation-plan.md`
- 审查协议：
  - `docs/reviews/full-dimension-review-protocol.md`
  - `docs/reviews/runtime-deep-review-checklist.md`
- 安装依赖版本：Babylon.js `9.21.2`、Havok `1.3.14`、patched
  Recast Navigation `0.43.1`；版本来自 `package.json`、`pnpm-lock.yaml` 与
  `pnpm-workspace.yaml`
- 最终源码已完成 Task 10 完整矩阵、主 Agent 深审与两轮 Cursor 独立复核；门禁生成的
  Rigged/G Bot Artifact 已与源码变更区分并恢复。本文绑定上述最终 candidate/base，
  可作为 R1b/M5 完成凭据。

### 1.1 当前结论

Task 9 实现、Task 10 完整验证矩阵、主 Agent 深审和独立复核均已完成。首轮 Cursor
对 `28752e0` 给出 Final GO / No findings，同时提出 Runtime ambiguous 应留在 Runtime
诊断层的建议。主审独立确认当 Graph 已通过时，该失败不应发布 Graph 层的
`ROUTE_SURFACE_CORRELATION_AMBIGUOUS`，并在 `506e088` 统一为
`ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`，补充 `unmatched / ambiguous / wrong resolved
Surface` 三模式回归。修后完整矩阵与条件复核全部通过，当前无 open confirmed P0/P1，
因此 R1b/M5 完成。

## 2. 审查对象与已证实合同

### 2.1 Task 9 已证实范围

已证实的实现范围仅包括 R1b 普通静态地面通行：Heightfield、显式台阶、普通静态
平台、静态坡道和回到 Heightfield。当前代码使用统一 `RouteBuildInputV2`，静态
Collider 与 Traversal Surface 通过稳定身份/Hash 关联；公共 Browser 协议已经 clean
break 到 V5，并发布多 Surface Route Evidence V2：

- `99:126:packages/traversal/src/build-input.ts`：`RouteBuildInputV2` 的权威输入结构；
- `1140:1268:packages/traversal/src/build-input.ts`：严格 admission 与 canonical hash；
- `348:359:packages/runtime-contracts/src/runtime-session.ts`：Browser Protocol V5
  常量与公共 API；
- `195:212:scripts/verify-route-r1b-static-platform.ts`：两条冻结失败诊断；
- `555:563:scripts/verify-route-r1b-static-platform.ts`：两种 verifier-only fault
  与固定 Fixture ID 的闭合映射；
- `501:557:scripts/lib/route-validation-runner.ts`：Graph correlation adversary 与
  withdraw-support Runtime 路径；
- `152:173:scripts/verify-route-r1b-static-platform.test.ts`：wrong-collider 与
  platform-edge-fall oracle。

证据层级为 `static-read` 与 `automated-contract`。这不等于 rendered-visual 或
manual-interaction 证据，也不扩大为桥下双层、洞穴、动态平台或 NPC 导航支持。

### 2.2 Runtime 最终修复后的完整自动化证据

以下结果来自 2026-08-24 的最新 Runtime 修复后执行，均为 exit code `0`：

| 命令 / Gate | 结果 | 证据层级 |
| --- | --- | --- |
| P1.5 focused conformance | 1 file / 9 tests passed | automated-contract/runtime-integration |
| R1b verifier after snap-down fix | 11 / 11 fixtures passed | automated-contract/runtime-integration |
| `pnpm typecheck` | passed | automated-contract |
| `pnpm test` | 148 files / 1577 tests passed | automated-contract/runtime-integration |
| `pnpm build` | passed | automated-contract |
| `pnpm verify:route-r0-contract` | passed | automated-contract |
| `pnpm verify:route-r1-heightfield` | passed | automated-contract/runtime-integration |
| `pnpm verify:route-r1b-static-platform` | 11 / 11 fixtures passed | automated-contract/runtime-integration |
| `pnpm verify:canonical` | passed | automated-contract/rendered-visual |
| `pnpm verify:placement-layout` | passed | automated-contract/rendered-visual |
| `pnpm verify:rigged-subject` | passed | automated-contract/rendered-visual |
| `pnpm verify:g-bot-subject` | passed | automated-contract/rendered-visual |
| `git diff --check` | passed | static-check |

Task 9 较早的聚焦矩阵也已通过 43 files / 525 tests；R1 success Report 在重复、
并发和 30/60/120-like cadence 下保持 Hash：
`sha256:87b2c4c6c7d64384075d52c65b5a6bdc8ca63e92c84647cd2cedbc5f72da4b91`。

上述完整矩阵均已在保留原有 0.5m/s snap-down 上行阈值、增加 surface-normal
alignment 防护并修正 Runtime 诊断分层的最终源码上退出 `0`。自动化与视觉 Gate
没有替代独立代码审查；两轮 Cursor 结论已分别绑定 `28752e0` 与最终 `506e088`。

## 3. 旧结论复验

| 既有结论 | 当前处置 | 当前证据 |
| --- | --- | --- |
| `fail-wrong-collider-binding` 曾出现 Graph/Runtime double-green | 已修复并在 Task 9 聚焦门禁复验 | 当前 verifier 将固定 Fixture 映射到 Graph correlation adversary，预期诊断为 `ROUTE_SURFACE_CORRELATION_MISSING`；相关测试与 R1b Gate 通过 |
| `fail-platform-edge-fall` 曾在到达容差内提前成功 | 已修复并在 Task 9 聚焦门禁复验 | trusted host 在成功 reset 后撤销 fixture-owned support，真实 Probe 在第七个连续 unsupported Tick 输出 `ROUTE_RUNTIME_SUPPORT_LOST`；相关测试与 R1b Gate 通过 |
| V1 Route / Browser V4 可能残留公共消费者 | Task 9 census 已复验为零 | 43 files / 525 tests 聚焦矩阵与 `verify:route-r1b-static-platform` 已执行 census；最终全量深审仍需再次搜索 |

详细根因与 Task 9 处置见
`docs/reviews/2026-08-24-route-r1b-task9-fixture-disposition.md`。该旧记录仅作线索；
上表已对当前实现路径和聚焦门禁重新核对，但不替代 Task 10 最终 HEAD 审查。

## 4. Runtime authority map

此表记录 Task 10 必须最终复核的唯一权威；“待深审”不表示已验证无缺陷。

| 状态 / 事实 | 预期唯一权威 | R1b 消费者 | 当前状态 |
| --- | --- | --- | --- |
| Ground support | Havok Character Controller `checkSupport()` 的 retained support | movement medium、Probe support correlation、Route Runtime Gate | 已核对安装源码 normal normalization、snap-down ownership、support-loss 与 reset/rebind 路径 |
| Traversal Surface identity | Canonical Surface Binding + Collider Subshape identity + locked resource hashes | Recast Graph、Runtime support resolver、Evidence/Report | provider-leak census 与三方 provenance Gate 已通过 |
| Route connectivity | Canonical Graph/Path receipt bound to `RouteBuildInputV2` | Validation Graph Gate、CLI/Browser projection | R0/R1/R1b 与完整矩阵通过 |
| Runtime conformance | fixed-tick Babylon/Havok Probe receipt | Validation Runtime Gate、Report、Browser readonly projection | R1/R1b、cadence、support mismatch/loss 与完整矩阵通过 |
| Simulation time | fixed-step accumulator/tick | controller integration、Probe cadence、deterministic hashes | 30/60/120-like 与整仓回归通过；未新增时间所有者 |
| Resource lifetime | Runtime Lease / fixture-owned aggregate owner stack | partial construction、support withdrawal、dispose/cleanup | throwing/withdraw-support、dispose 与整仓回归通过 |
| Browser publication | trusted host same-byte canonical artifacts | Browser Protocol V5 readonly getters | V2/V5 same-byte transport、legacy census 与完整矩阵通过 |

## 5. Findings

### [P1] [D4] Snap-down 使用离开平面的圆角命中制造 `sliding` 支撑 Tick

- 证据（static-read / automated-contract）：`289:356:packages/runtime-babylon/src/motion-kernel-runtime.ts`
  的旧路径只按最大步高、walkable slope 和向下距离接受 capsule cast；离开平坦台面时，
  cast 可先命中 Minkowski rounded edge，其法线与上一权威支撑平面不一致，却被 snap-down
  当作连续地面。P1.5 ledge/coyote 回归在修复前观察到合成的 `sliding` Tick；修复后的
  focused suite 为 9/9，最终 full `pnpm test` 为 148 files / 1577 tests。
- 期望：snap-down 只能延续与上一 retained support 几何法线一致的平面；已离开支撑后，
  独立且可走的新落地点仍可被接受。Ground support 继续由 Havok Character Controller
  和 retained `checkSupport()` 单一链路拥有。
- 影响：角色走下台沿时可能在真正进入 Air 前发布一个伪 `sliding` 状态，清空合法 coyote
  window，导致离台一 Tick 后跳跃失效；它也会污染依赖 retained support 的动作选择。
- 建议：已按最小 Runtime 修复处理。`integrate()` 将 pre-integrate support 传给
  snap-down；当先前有支撑而新命中法线与其平均法线的 dot 小于
  `1 - 1e-3` 时拒绝 snap。原有
  `SNAP_DOWN_UPWARD_SPEED_LIMIT_METERS_PER_SECOND = 0.5` 保持不变，避免扩张无关运动
  行为；当先前为 `unsupported` 时，独立可走落点不受法线对齐限制。回归同时断言进入
  Air 前 retained support 仍是 `supported`，并验证一 Tick coyote jump。
- 复核：已由 focused P1.5 9/9、R1b 11/11、typecheck 与最终 full 148/1577 tests 复核；
  最终完整矩阵、主 Agent 深审与两轮 Cursor 复核通过，
  无 open confirmed P0/P1。

该修复只触及 Babylon Runtime 的 snap-down 几何判定及其 P1.5 回归测试；没有修改
Canonical Schema、Camera、Route Graph/Query/Evidence 合同或 R1b Fixture oracle。

### [P2] [D6] Runtime `ambiguous` 被错误发布为 Graph correlation 诊断

- 证据（static-read / automated-contract）：`28752e0` 中，Graph 已成功完成而真实 Runtime
  support resolver 返回 `ambiguous` 时，Validation Report 发布了 Graph 层
  `ROUTE_SURFACE_CORRELATION_AMBIGUOUS`。这会混淆构图期 Surface correlation failure 与
  运行时支撑身份不匹配两个独立权威。
- 处置：首轮 Cursor 的非阻断建议触发主审复核；主审确认后在 `506e088` 将 Runtime
  `support-surface-mismatch` 的 `unmatched / ambiguous / wrong resolved Surface` 三种模式
  统一映射为 `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`，并新增三模式回归。真实
  `fail-runtime-overlapping-surfaces` 继续使用 `0.02m` 静态薄片与 Heightfield 的实际
  Runtime 重叠支撑，并由真实 Probe 产生 `ambiguous` 支撑证据。
- 复核：R1b 11/11、148 files / 1577 tests 与完整矩阵通过；条件复核 chat
  `d61f751c-a398-4063-bcbf-2ddc55ea20a9` 对 `506e088` 为 Final GO / No findings。

主 Agent 深审与两轮 Cursor 复核没有发现其他 open confirmed P0/P1。

## 6. 完整验证矩阵

| Gate | 状态 | 完成要求 |
| --- | --- | --- |
| `pnpm typecheck` | passed after final Runtime fix | exit 0 |
| `pnpm test` | passed after final Runtime fixes: 148 files / 1577 tests | exit 0；记录 warning disposition |
| `pnpm build` | passed after final Runtime fix | exit 0；Chunk/资源 warning 已纳入主审 |
| `pnpm verify:route-r0-contract` | passed after final Runtime fix | exit 0 |
| `pnpm verify:route-r1-heightfield` | passed after final Runtime fix | exit 0 |
| `pnpm verify:route-r1b-static-platform` | passed after final Runtime fix: 11 / 11 fixtures | exit 0 |
| `pnpm verify:canonical` | passed after final Runtime fix | exit 0 |
| `pnpm verify:placement-layout` | passed after final Runtime fix | exit 0 |
| `pnpm verify:rigged-subject` | passed after final Runtime fix | exit 0 |
| `pnpm verify:g-bot-subject` | passed after final Runtime fix | exit 0 |
| 主 Agent full-dimension/runtime review | passed | D2–D6 闭合、无 open host P0/P1 |
| 安装源码复核 | passed for changed semantics | Babylon 9.21.2 `checkSupport()` normal normalization、snap-down ownership 与 diff clean break 已核对 |
| Cursor 首轮核心 CR | Final GO / No findings | chat `1e938715-a5b2-4a25-ad83-45eec0c37c15`，对象 `28752e0` |
| 条件式 Cursor 修复复核 | Final GO / No findings | chat `d61f751c-a398-4063-bcbf-2ddc55ea20a9`，对象 `506e088` |

## 7. Runtime 对抗覆盖处置

主 Agent 已结合聚焦门禁、完整矩阵和当前 diff 逐项对拍：

- 非对称/偏移几何、精确 seam、gap、coplanar overlap、0.25m 成功与 0.35m 失败；
- unsupported spawn、平台边缘离开、落地、wrong/unmatched/ambiguous support；
- reset/rebind 的即时状态、重复与并发执行、多实例隔离；
- 30/60/120-like cadence、长帧上限、pause、zero-tick；
- 部分构造、sibling throwing cleanup、重复 dispose、Runtime Lease 释放；
- CLI、stored Evidence、Browser、Validation input 的 canonical bytes/hash 一致；
- Canonical Schema、CLI、Browser、Report、Snapshot 中不存在未审计的 Recast、Babylon、
  Havok handle/provider name、raw error、native path 或内部 area/tag。

## 8. 明确非目标与后续缺口

R1b/M5 已通过，但以下能力仍然开放，不能由本切片宣称支持：

- H1：桥面/桥下同 XZ 双层通行、underpass、完整 Bridge/Cliff Fixture；
- H2：Terrain Opening、洞口和 Render/Physics/Query 同步移除；
- H3：可进入洞穴、Interior Region、Portal 与室内语义；
- Dynamic Platform、移动门、电梯及动态支撑；
- NPC Path Following、Crowd、动态避障；
- 公共 `goTo` 或其他公开导航命令；
- Jump/Drop/Climb/Vault 等离开支撑面的 Traversal Link；
- 车辆、坐骑、飞行、水中运动。

这些是冻结范围之外的 capability gap，不是 R1b 实现 bug，也不能通过临时字段、场景
脚本或 Provider 术语泄漏到公共合同来提前“支持”。

## 9. 维度覆盖表

| 维度 | 状态 | 当前证据 / 待办 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | R1b 仅普通静态 Ground Surface；H1/H2/H3、dynamic platform、NPC/public `goTo` 明确开放 |
| D2 Schema 与 AI-friendly | 已查 | V2/V5 clean break、legacy/provider census 与公共边界通过；snap-down 修复未改公共 Schema |
| D3 承诺与事实对拍 | 已查 | README/spec/docs18 同步关闭 R1b/M5，并继续明确所有范围外能力 |
| D4 单一权威状态 | 已查 | Ground support/Surface/Graph/Runtime authority、安装源码 normal normalization 与 snap-down ownership 已核对 |
| D5 工程质量与可维护性 | 已查 | 聚焦/全量确定性、对抗、cleanup、依赖和失败路径审计完成，无 open host P0/P1 |
| D6 门禁与证据分层 | 已查 | 自动合同、Runtime integration、视觉 Gate、主审与两轮 Cursor 复核分层记录；Runtime ambiguous 使用 Runtime mismatch 诊断 |

## 10. 完成判定

本文最终结论是 **FINAL GO：R1b/M5 COMPLETE**。以下完成条件已全部满足：

1. §6 所有 blocking gates 在最终 clean tree 上退出 `0`，warning 已分类；
2. §7 对抗覆盖和 §9 D2–D6 全部闭合；
3. 安装依赖源码语义已核对并记录；
4. 没有 open confirmed P0/P1；
5. 首轮 Cursor 核心 CR 已完成，结论为 Final GO / No findings；
6. 首轮建议引出的诊断分层修复已完成，并通过修后条件复核；
7. README、R1b 规格、实施计划与 `docs/18` 继续明确 H1/H2/H3 等非目标。

该完成判定只覆盖 R1b 普通静态地面通行与 M5 冻结合同。H1/H2/H3、动态平台、
NPC/public `goTo`、车辆及 §8 其余能力保持开放；当前证据仍按 automated-contract、
runtime-integration、rendered-visual 与独立 review 分层，不扩张为这些能力的生产支持。
