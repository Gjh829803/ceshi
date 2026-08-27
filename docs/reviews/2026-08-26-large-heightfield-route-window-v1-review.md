# Large Heightfield and Route Window V1 change review

## 审查元数据

- 模式：B（变更审查）。
- 对象：`codex/terrain-generation` 中第二阶段 Large Heightfield and Route Window V1 变更。
- diff 基线：terrain commit `d1d7f8b`。
- 上位规格：
  - `docs/superpowers/specs/2026-08-26-large-heightfield-route-window-design.md`
  - `docs/superpowers/plans/2026-08-26-large-heightfield-route-window-implementation-plan.md`
- 变更边界：保留 AuthoringSpec V4、ExecutionPlan V5、单一 Heightfield 和现有 Runtime；新增
  trusted Host 的大地形证据、生成栅格量化、保守 Route build-window 预检和 Builder 自检约束。

## 结论

主审查没有发现未关闭的 P0、P1 或 P2 finding。该变更足以把当前单 Heightfield 的可信
authoring/preview 范围扩展到约 `1–2km`，但不构成开放世界流式加载能力。

`maximumTiles: 1024` 保持为每条 required Route 的单次构建预算，不再被误认为整个世界的
尺寸上限。长直窄 Route 可以在该预算内通过；跨越大范围的对角 Route 必须由 Builder 显式拆成
共享 seam Anchor 的有序 Route/constraint 链。Host 不自动创造 Route、Anchor 或公共 ID。

## 已关闭问题

1. 五个新/受影响测试最初从 workspace 外部相对路径导入 authoring 私有 fixture，违反 package
   边界。它们已改用公开的 `@whitebox-world/authoring/testing` 入口；workspace boundary gate 通过。
2. Builder large-world 分析最初早于 Authoring normalization，导致 malformed/no-terrain draft 可能
   抛出而不是生成稳定诊断。分析现位于 normalization 之后，focused regression 通过。
3. terrain CLI integration test 的 `5s` harness timeout 无法覆盖两个实际 `pnpm` 子进程。仅测试
   suite timeout 统一调整为 `30s`；产品命令、重试和运行时行为没有改变。
4. commit `a81134d` 对 terrain V0 找到三个 hard-constraint NO-GO：交叉 Route 后写覆盖、亚网格
   protected region 零效果、最终高程逃出世界范围。三者均已用 RED reproducer 确认并在
   `docs/reviews/2026-08-26-signed-height-intent-compiler-v0-remediation-review.md` 中闭合。

## 权威与边界复验

- 世界 bounds、分辨率和 Route/Anchor 仍由 AuthoringSpec V4 唯一声明。
- `heightSamplesMeters` 仍是 Babylon mesh、Havok collider、terrain query 和 Route source 的唯一
  运行时高程权威；图片、量化报告和 scale evidence 都不会进入第二条 Runtime 推导路径。
- 大栅格量化只处理 constraint solver 未锁定样本。Water、Spawn、Landmark support 和 Route 的
  protected samples 保留 solver 的精确值。
- route-window estimator 只做 Heightfield R1 的保守预检。R1B 静态结构可能扩大实际几何 bounds，
  因此 trusted Route Build Input receipt 仍是最终 admission 权威。
- ground support、movement medium、subject facing、camera orbit、fixed-step time 和资源生命周期的
  Runtime owner 均未改变。

## 证据

| 证据层级 | 命令或制品 | 结果 |
| --- | --- | --- |
| automated-contract | root `pnpm test` | test census 224；contract 203 files / 2126 tests；resource-heavy 21 files / 405 tests；合计 2531 tests passed |
| automated-contract | `pnpm typecheck` | exit `0` |
| automated-contract | `pnpm test:studio` | 73 / 73 passed |
| automated-contract | `pnpm build` | exit `0`；Playground production bundle built |
| automated-contract | `pnpm check:agent-self-check` | Planner/Builder source 与生成 bundle 一致 |
| static-read | `git diff --check` | exit `0` |
| large-terrain contract | `801 x 801` / `2000m x 2000m` fixture | `641,601` vertices、`1,280,000` triangles、`2.5m` cell span；量化 JSON 低于 `8MiB` admission boundary |
| route contract | focused traversal/Builder tests | `2km` 直窄 Route 为 210 tiles；单条对角 Route 为 44,100 tiles 并 fail closed；十段对角 Route 每段 484 tiles |
| Runtime topology | `packages/runtime-babylon/src/terrain-topology.test.ts` | 真实 `401 x 401` / `1km` Babylon terrain：160,801 vertices、960,000 indices、最大 index 160,800，证明使用 32-bit topology 且 throwing cleanup 无泄漏 |
| rendered-visual | `014-heroic-valley-overlook/runtime-opening-v3-overlook.png` | transport 与约束链通过；目标宽谷入口构图仅 partial，保留为 Prompt/单视图边界案例 |
| rendered-visual | `015-alien-rift-plateau/runtime-opening-v0.png` | transport、validation、layout、capture 通过；可读出前景平台、中央下陷裂谷和对岸抬升地形 |

Runtime topology 使用 Babylon NullEngine，实验截图使用 SwiftShader。二者都不能支持硬件渲染性能
结论。本轮没有 manual interaction，不声明千米尺度漫游手感或完整游玩验收。

## 维度覆盖表

| 维度 | 状态 | 当前树证据 |
| --- | --- | --- |
| D2 Schema 与 AI-friendly | 已查 | 无公共 Schema/Protocol 变化；内部数值字段含单位；Route segmentation 复用既有 ID、Anchor、constraint 方言 |
| D3 承诺与事实对拍 | 已查 | 文档、Builder Skill、自检报告和测试一致限定为单 Heightfield `1–2km` authoring/preview，不宣称 streaming |
| D4 单一权威状态 | 已查 | 图片和 analyzer 只提供/报告 authoring input；最终 metric Heightfield 与 trusted Route receipt 保持唯一权威 |
| D5 工程质量与可维护性 | 已查 | estimator 复用既有微米整数预算逻辑；量化确定、caller immutable；generated checker 有 parity gate |
| D6 门禁与证据分层 | 已查 | automated、rendered、manual、performance 明确分层；NullEngine/SwiftShader 限制如实披露 |
| Runtime 深审 | 已查 | terrain mesh 32-bit index、部分构造/throwing cleanup、既有 support/physics authority 与 package boundary 均有回归证据 |

## 保留限制

- 没有 terrain streaming、multiple Heightfields、LOD/HLOD、world-origin rebasing、分层寻路或跨 tile
  物理生命周期；这些需要新的版本化 Terrain Source/Execution contract。
- `1024 x 1024` 是当前大单 Heightfield 的 operational profile，而不是引擎硬上限。
- route-window preflight 的 AABB 策略对长对角线有意保守；V1 的修复是显式语义分段，不是提高
  `maximumTiles` 或绕过 final trusted receipt。
- `014` 表明即使使用源图作为 primary-coordinate reference，Image2 仍可能误解精确 spawn 高程和
  视点纵深；Prompt 与 SDK constraint compiler 必须保持职责分离。

## 独立审查

独立 Cursor review 在最初的 Host 门禁后尝试一次。它在约 4 分钟内读完审查协议、设计/计划以及
route-window estimator、量化器、large-world evidence、自检接入、compiler 量化和 1km Runtime
topology 测试；但只读环境拒绝 Git 基线读取，且进程始终没有产出 findings/report/verdict，随后被
终止。terrain remediation 和最终全量门禁完成后，又启动一次仅包含 solver/compiler 六个文件的
窄复核；该 session 读完实现和两份审查文档后停在读取测试之前，220 秒仍没有 verdict，随后终止。
两次步骤结论均为“无独立 verdict”，不能作为通过证据。独立的 `a81134d` 对抗审查 findings 已由
Host 逐条复现并用 RED/GREEN regression 闭合，但这不被表述成 Cursor 通过。
