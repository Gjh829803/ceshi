# Project Health Observatory 设计审查

## 1. 审查元数据

- 审查模式：Mode A（设计规格审查），覆盖 D1、D2、D3、D6，并额外复核 D4 单一权威、
  D5 工程任务图与执行边界。
- 最终设计观察点：`2d1d80e18d503724df82374b77db1ad9126f3127`，基线为已合入 BNA-2 的
  `main@00b5e33c9fa549bd9f8fb5a797b59928da7409c4`；重放后复核 BNA-2 状态、PHO 任务依赖和文档链接，
  未改变原 DESIGN GO 裁决。
- 状态：**DESIGN GO**。这只接受 Observatory 的设计和 PHO-0A～PHO-8 实施任务，不表示功能已实现。
- 审查对象：
  - [`2026-08-30-project-health-observatory-design.md`](../superpowers/specs/2026-08-30-project-health-observatory-design.md)
  - [`2026-08-30-project-health-observatory-implementation.md`](../superpowers/plans/2026-08-30-project-health-observatory-implementation.md)
  - [`18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md) 的 P3.7。
- 独立复核：Cursor Cloud 使用 detached exact commit；`git cat-file -t` 返回 `commit`，
  `git status --porcelain` 为空，`git diff --check` 通过。审查只读，未运行与文档输入无关的重型门禁。

## 2. Findings 与修复复核

### 2.1 最终开放 Findings

**无开放 P0、P1 或 P2。**

### [P1] [D4/D6] Change Impact 缺少稳定 path/Package → capability 输入（已解决）

- 证据：早期设计只有 `capabilityGateIdsById`，没有可实现的路径与 Package selector。最终 Profile
  增加同键闭合的 `capabilitySelectorsById`，只接受 repo-relative exact path、prefix、suffix 和
  Workspace Package ID；PHO-3 只能消费这一份映射。
- 期望：同一变更在任何机器上得到相同 capability 与 Gate Plan，未知顶层目录、Package 或 verifier input
  必须 fail-closed。
- 影响：若缺少 selector authority，Change Impact 会依赖运行时猜测，无法稳定说明为什么需要某个门禁。
- 建议：已在 PHO-0A 冻结首个 14-key 闭表，并要求 selector/Gate key 集完全相同。
- 复核：已被 Codex 复核确认。

### [P1] [D2/D5] Workspace 根路径合同无法表达根 Package（已解决）

- 证据：早期 path parser 全面拒绝 `"."`，但当前 workspace scanner 的根 Package 需要稳定 repo-relative
  表达。最终合同只允许根 Package 的 `rootPath` 为 `"."`，其它 path 字段及非根 Package 仍拒绝该值。
- 期望：证据 DTO 不含机器绝对路径，同时能够无歧义表达根 Workspace。
- 影响：未关闭时，PHO-1 无法把现有 workspace graph 投影到冻结 DTO，或会被迫引入特殊旁路。
- 建议：已将该例外关闭在中立 Workspace Boundary DTO parser 中，没有扩散到其它路径字段。
- 复核：已被 Codex 复核确认。

### [P2] [D2/D6] Git identity 与依赖清单证据不稳定（已解决）

- 证据：所有公共字段和 CLI 已统一为 `commitSha` / `--commit`，Host 用 `git cat-file -t` 拒绝 tree object；
  `ProjectHealthDependencyInventoryV1` 只保留 package name、version、SPDX license 和固定 owner identity，
  丢弃 `pnpm licenses list --json` 中的绝对安装路径、作者、主页、描述和原始顺序。
- 期望：Receipt、Report、baseline 与依赖证据必须绑定同一 exact commit，并在不同 checkout 根目录生成
  byte-identical canonical evidence。
- 影响：歧义 Git identity 或机器路径进入 hash 会制造不可复现的健康报告和错误趋势。
- 建议：已要求不同安装根的 RED fixture、排序/去重、冲突或缺失条目 `incomplete`。
- 复核：已被 Codex 复核确认。

### [P2] [D3/D6] 初始 capability selector 含当前树不存在的路径（已解决）

- 证据：第三轮复核发现 Studio 被写成不存在的 `packages/studio/`，Native capability 预登记不存在的
  `scripts/native-scene/`。最终观察点改为 `apps/studio/` 与 Package ID
  `@whitebox-world/studio`，并删除 dead Native path。
- 期望：每个 selector entry 在冻结时至少命中 exact tree 的一个路径或 Workspace Package，且每个
  capability 至少有一个 entry。
- 影响：死路径会让 Change Impact / explain 漏掉真实 `test-studio` 归因；Profile 的固定全量 Receipt
  只能防止漏跑，不能证明归因正确。
- 建议：已冻结 `PROJECT_HEALTH_CAPABILITY_SELECTOR_EMPTY`，并在 PHO-0A 计划中要求 dead-path
  对抗 fixture，即使同一 capability 还有合法 entry 也必须拒绝。
- 复核：已被 Codex 复核确认。

## 3. 单一权威裁决

| 状态或资源 | 唯一 Owner | 设计裁决 |
|---|---|---|
| Workspace graph 与既有 49 条边界债务 | `scripts/lib/workspace-boundary.ts` + 现有 debt ledger | PHO-1 只扩展同一 scan，不复制 scanner/debt |
| 外部命令、timeout、日志截断、进程树清理 | PHO-0B execution envelope | Sensor 不得自行 spawn 或实现第二套 cleanup |
| path/Package → capability → Gate | current-only Project Health Profile | PHO-3 只投影，不猜测、不缩小 Profile Receipt 闭包 |
| lock/install/patch identity | `contract-parity` owner Receipt | Supply Chain 只引用，不重新解析 lockfile |
| dependency/license inventory | `dependency-inventory` owner | 稳定投影 `pnpm licenses list --json`，不接管 workspace import 检查 |
| Test census | 现有 `TEST_GATE_MANIFEST_V1` | Observatory 复用 census，不创建第二份测试清单 |
| Gate execution Receipt | 唯一 `health:record` | CI 替换直接 owner command，不在其后重复执行 |
| 聚合与 blocking/advisory/debt policy | PHO-6 Profile-driven aggregator | Sensor 只发布 Observation，不自行决定最终状态 |

## 4. D1–D6 覆盖表

| 维度 | 状态 | 结论 |
|---|---|---|
| D1 定位与边界 | 已查 | Repository health 工具层；不进入 Registry/WorldPackage/Runtime/Browser，不替代 `ValidationReportV1` |
| D2 Schema / AI-friendly | 已查 | current-only closed DTO、稳定 `commitSha`/hash/units、一个 canonical vocabulary，无 aliases |
| D3 文档与事实 | 已查 | 设计保持 Proposed；Backlog 只登记 PHO-0A～PHO-8，不提高项目实现进度 |
| D4 单一权威 | 已查 | graph、inventory、lock、census、process、policy 与 Receipt 分工唯一，GatePlan 不能缩小 Profile 闭包 |
| D5 工程质量 | 已查 | PHO-0A → 0B/1 → 2..5 → 6 → 7 → 8 无环；共享 seam 保持 main-agent-only |
| D6 门禁与证据 | 已查 | PR/Nightly/Release exact-commit Receipt，重型命令各执行一次，Advisory 不冒充 Required 证据 |

## 5. 审查结论

**DESIGN GO：接受 Project Health Observatory 设计与 PHO-0A～PHO-8 实施计划。**

实施必须从 PHO-0A 的失败 fixture 与 current-only DTO/Profile 开始；不得把本审查扩张成 Observatory
已经交付，也不得在实现时创建第二套 Runtime validator、workspace scanner、test census、process runner
或 CI 重型门禁。
