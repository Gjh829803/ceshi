# PHO-6 Report CLI 独立复核

> 临时 remediation 输入。Codex 按 Findings 修完并复验后，删除本文件，不要把审查文档留在最终树。

## 1. 审查元数据

- 模式：B 变更审查（分支 diff）。必查 D2 D3 D4 D5 D6。Runtime deep-review checklist 不适用：本分支不改物理、移动、输入、动画、相机、渲染调度或 Browser Runtime。
- 仓库：`seedleap/agent-whitebox-world-sdk`
- 分支：`codex/pho-6-report-cli`
- 对象 SHA：`893d6d5eac79288851e627e754f1a269173f84cc`（当时远端 HEAD，`fix: close project health report trust chain`）
- 基线：`origin/main` `bcd2beea736ab68199df04c2ed937d63ea389f4a`
- 祖先：`ebdf2562`、`a6494679`
- 规格：`docs/superpowers/specs/2026-08-30-project-health-observatory-design.md`（当前树已改为同进程 Host 链，不再使用 `--receipts`）
- 计划：`docs/superpowers/plans/2026-08-30-project-health-observatory-implementation.md` Task 8
- Backlog：`docs/18-refactor-progress-and-backlog.md` P3.7（PHO-6 仍未勾选）
- 引擎版本：本次不依赖 Babylon/Havok 语义，未断言引擎行为。
- 只读审查当时未改代码，未合并 PR，未跑 `health:pr/nightly/release`（会重跑 playground-build 与重型 test/runtime Gate）。

### 门禁

| 命令 | exit | 结果 |
|---|---|---|
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `pnpm exec vitest run scripts/project-health` | 0 | 20 files / 191 tests 通过 |
| `pnpm test:census` | 0 | 376 / 338 contract / 38 resource-heavy |
| `pnpm verify:workspace-boundaries` | 0 | 49 debt / 1688 public symbols |
| `git diff --check` | 0 | 无 whitespace 错误；worktree 干净 |

未跑：`pnpm test` 全量、`pnpm build`、Studio/independent、Browser/Havok verifier。原因：审查明确排除无关 Babylon/Havok Browser 重型门禁；本分支输入是 `scripts/project-health/**` 与 census/workspace 合同。

### 裁决

**NO-GO**（绑定 `893d6d5eac79288851e627e754f1a269173f84cc`）

开放：P0 × 1，P1 × 2，P2 × 3。

---

## 2. 旧结论复验

`docs/reviews/2026-08-30-project-health-observatory-design-review.md` 是 Mode A 设计审查（DESIGN GO），对象不是本 SHA。其中「无开放 P0/P1/P2」只对当时设计文本成立，**已失效**于本实现树，不得沿用。

PR #67（`cursor/pho-6-report-cli-04db` @ `3664b28a`）是 wip/handoff，不是本对象。本次只以 `origin/codex/pho-6-report-cli` HEAD 源码与当场命令为准。

---

## 3. 八项信任链对拍

### 1. health check 是否只能消费同进程 Registry Gate 结果

**架构意图成立，消费失效。**

`runCheck` 不再接受 `--receipts`。它在同一进程对 Profile 固定 Gate 调用 `executeRegisteredProjectHealthGateV1`，再把内存 `validatedGatesById` 交给 `observeProjectHealthModeV1`。`health:record` 只写审计 Receipt，check 不读回。

但 Gate stdout 在进入 Sensor 前被 `redactOutput` 破坏，见 P0。因此 Host **执行了** Registry Gate，却 **不能消费** 其语义结果。

### 2. 外部 Receipt / Observation / 测试注入能否伪造全绿 Report

**生产 CLI check 不能靠外部 Receipt 变绿；库函数与 baseline 写入仍能得到 passed Report。**

- CLI 拒绝 `--receipts`、拒绝非本 checkout 的 `repositoryRoot`、没有 Observation 文件入口。
- `aggregateProjectHealthReportV1` 与各 `observe*V1` 仍接受调用方注入的 Observation/Evidence。`report.test.ts` 用 `PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1` 构造全绿 fixture 并断言 `status: "passed"`。
- `health:update-baseline` 读磁盘 Report，只比 commit / profileHash / implementation hash / 无 `not-evaluated` Metric，不要求该 Report 来自同次 Host check。

在 P0 成立时，真实 Gate 路径无法变绿，测试注入反而成为唯一能得到 `passed` 的路径。见 P1。

### 3. Sensor implementation hash 是否绑定 repositoryRoot 源码闭包与 lockfile

**成立（函数层）。**

`projectHealthSensorImplementationHashV1` 从 Sensor 入口做 TypeScript `importedFiles` 递归，解析相对路径与 Workspace `exports["."]`，并始终加入 `pnpm-lock.yaml`。当场复算：

- `workspace-boundary` 闭包 8 项，含 `pnpm-lock.yaml`、`packages/protocol/src/*`、`contracts.ts`、`workspace-boundary-contract.ts`；**不含** scanner `scripts/lib/workspace-boundary.ts`。
- `test-topology` 闭包 11 项，含 lockfile、`test-gate-manifest.ts`、`change-impact.ts`、`process-runner.ts`。
- 模块常量与对当前 `repositoryRoot` 重算值相同：`sha256:90648116cf1dc27851874e4668b68eb6a65f9717186de61ccc1a64ecfee58b50`。

CLI 要求 `repositoryRoot ===` 已加载实现的 canonical checkout，因此生产路径不会用 checkout A 的实现去 hash checkout B。缺少 lockfile 变更对抗测试，见 P2。

### 4. workspace-boundaries 与 test-census 是否只执行一次，并由同次 Gate stdout 提供语义 Evidence

**只执行一次成立；stdout 语义 Evidence 不成立。**

check 对 `requiredGateIds` 去重后各执行一次。`verify-workspace-boundaries.ts` / `verify-test-gate-census.ts` 在 `PROJECT_HEALTH_OUTPUT_ROOT` 下把 JSON 写到 stdout。`mode-observer` 也只 `JSON.parse(gate.evidence.stdout)`，不二次 `scan` / `discoverVitestTestFilesV1`。

Runner 先把 stdout 交给 `redactOutput`。该函数把任意 `/...` 当成机器路径。repo-relative POSIX 路径（`packages/foo/src/bar.ts`）被改成 `packages[REDACTED_PATH]`。当场对真实 workspace JSON 正文脱敏：`JSON.parse` 失败，`[REDACTED_PATH]` 出现 123 次。另：Registry argv 是 `pnpm verify:*`，pnpm 还会在 JSON 前打印带绝对路径的 banner。

因此同次 Gate **没有** 可用的语义 Evidence。见 P0。

### 5. fixed required Gates、failed、infrastructure-incomplete、timeout、cleanup failure 是否正确传播

**合同层成立，集成层被 P0 短路。**

- Receipt：`passed` / `failed` 原样，其余 execution status → `incomplete`。
- `contract-parity`：timeout / dirty-tree / cleanup / infrastructure → `not-evaluated`；Owner 失败 → Observation `failed`。
- `test-topology`：固定 Required Gate 失败 → `PROJECT_HEALTH_GATE_FAILED`；incomplete → `GATE_RECEIPT_STALE` + Observation `incomplete`。
- Report：Required Metric `not-evaluated` 优先于 failed。

这些映射有 focused 测试。真实 check 因 stdout 不可解析而先变成 Required Observation 缺失，到不了「failed vs incomplete」的精细传播。

### 6. exact-clean 是否拒绝 tracked / untracked 源码变化

**成立。**

`assertProjectHealthExactCleanCheckoutV1` 用 `git diff HEAD` 与 `git status --porcelain=v1 --untracked-files=all`（排除 Registry-owned `.project-health`）。check / record / update-baseline 在发布前再次检查 HEAD 与 exact-clean。`process-runner.test.ts` 覆盖 dirty tracked、untracked `.ts`、symlink 基础设施。gitignore 普通忽略文件不在 exact-clean 集合内，与「tracked/untracked source」口径一致。

### 7. ExecutionEvidence parser 是否闭合字段与跨字段状态

**成立。**

`parseProjectHealthExecutionEvidenceV1` 拒绝未知键；闭合 `passed/failed/timeout/mutation/cleanup/infrastructure` 与 exit/signal、failureCodes、前后仓库指纹、临时目录清理的交叉约束。`process-runner.test.ts` 48 例覆盖矛盾组合。Runner 在返回前强制 parse。

### 8. PR head/base ancestry、merge checkout、reset/replay 是否 fail-closed

**按当前规格成立。**

- PR 要求显式 40-hex `--base`，且 `merge-base --is-ancestor`；base==head 或非祖先 → exit 1。
- `--commit` 必须等于 checkout HEAD；执行后再次读取 HEAD。
- 规格明确：用 trusted `pull_request.head.sha` 与 checkout 相等拒绝 GitHub 合成 merge tree；**不**用 parent count 拒绝开发者双亲 merge。`cli.test.ts` 覆盖该口径。
- check 不回放 Receipt。git reset 到另一 SHA 会让 `--commit` 或中途 HEAD 检查失败。

CLI 的 ancestry git 未走 PHO-0B，见 P2。PHO-7 若把 `github.sha`（合成 merge）同时当作 checkout 与 `--commit`，本 CLI 无法识别。那是 PHO-7 接线责任，不是本 SHA 的 P0。

---

## 4. Findings

### [P0] [D4/D6] Gate stdout 在进 Sensor 前被路径脱敏撕毁，同进程语义 Evidence 链不成立

- 证据（`automated-contract` + `static-read`）：
  - `redactOutput` 最后一条正则匹配任意 `/...`，不区分机器绝对路径与 repo-relative POSIX 路径：

```413:416:scripts/project-health/process-runner.ts
  return value.replace(
    /(?:file:\/\/[^\s]+|[A-Za-z]:\\[^\s]+|\/(?:[^\s/=]+\/)*[^\s=]*)/g,
    "[REDACTED_PATH]",
  );
```

  - 当场探测：`{"sourcePath":"packages/protocol/src/index.ts"}` → `{"sourcePath":"packages[REDACTED_PATH]`。对 `pnpm exec tsx scripts/testing/verify-workspace-boundaries.ts` 在 `PROJECT_HEALTH_OUTPUT_ROOT` 下得到的合法 JSON 正文再跑同一函数：原始 `JSON.parse` 成功；脱敏后失败，`[REDACTED_PATH]` 123 次。
  - `mode-observer` 只做 `JSON.parse(gate.evidence.stdout)`，失败则 `catch` 成 `null`，不发 infrastructure Finding：

```42:46:scripts/project-health/mode-observer.ts
  try {
    return parseWorkspaceBoundaryEvidenceV1(JSON.parse(gate.evidence.stdout));
  } catch {
    return null;
  }
```

  - Registry 对这两个 Gate 的 argv 是 `["pnpm", "verify:workspace-boundaries"]` / `["pnpm", "test:census"]`。即使去掉脱敏，pnpm banner 也会让整段 stdout 不是 JSON。
  - `process-runner.test.ts` 只用 `node -e "process.stdout.write('ok')"`，测不到 JSON Evidence。
- 期望：设计 §4.5 / §5.1 与 docs/18 P3.7 要求「workspace graph 与 test census 只取同次 Gate stdout 的语义 evidence」，且 execution-evidence 在 redaction 后仍能被关闭 parser 消费。脱敏只能去掉绝对路径、凭证和 Host token，不能改 repo-relative 字段。
- 影响：`health:pr/nightly/release` 无法从真实 Owner stdout 得到 `workspace-boundary` / `supplemental-authority` / `test-topology` Observation。Required Sensor 缺失 → Report 只能 `incomplete`。声称已闭合的信任链在生产 Host 上不工作。同时 `aggregateProjectHealthReportV1` 仍可用注入 Observation 得到 `passed`，全绿只存在于测试/手工路径。
- 建议：语义 stdout 禁止用「任意 `/`」擦除；只 redact 已知机器根、token 与凭证。`JSON.parse` 前去掉 pnpm banner，或 Registry 直接跑 `tsx scripts/testing/*.ts`。解析失败应变成 Gate `incomplete` + 稳定 reason，而不是静默 `null`。补一条「真实 workspace JSON 经 runner 后仍可 parse」的 RED。
- 复核：未复核

### [P1] [D3/D6] `observeProjectHealthModeV1` 没有执行 Profile 已选的 Advisory / Nightly-Release Required Sensor

- 证据（`static-read`）：`mode-observer.ts` 只调用 `workspace-boundary`、`supplemental-authority`、`contract-parity`、`test-topology`。没有 `supply-chain`、`documentation-truth`、`runtime-health`、`visual-evidence`、`independent-review`、`performance-size`。`package.json` 已公开 `health:nightly` / `health:release`。无 `mode-observer.test.ts`。
- 期望：三个 `...BySensorId` map 的 key 等于该 mode Required∪Advisory；Required 缺失必须 `incomplete`；PR Advisory 至少应跑本地 Sensor。设计 §6.1 的 nightly/release Required 含 `runtime-health` 等。
- 影响：`health:pr` 即使修好 P0，`passed` 也不表示 supply-chain / documentation-truth 已观察。`health:nightly` / `health:release` 会先跑一组重型 Registry Gate，再因缺失 Observation 固定 `incomplete`。
- 建议：对 `selectedSensorIds` 逐个走 Registry `observe`；缺 Gate/Evidence 时由该 Sensor 发 `incomplete`，不要整段省略。补 mode-observer 合同测试。
- 复核：未复核

### [P1] [D6] `health:update-baseline` 接纳磁盘 Report，不能证明它来自同进程 Host check

- 证据（`static-read`）：`runUpdateBaseline` 只检查 `status === "passed"`、`commitSha`、`profileHash`、`sensorImplementationHashesBySensorId` 与 Metric 无 `not-evaluated`。不重放 Gate，不比对 observation hash 与现场 Host 产物。implementation hash 是模块常量，手工 JSON 可以抄。
- 期望：设计 §7 / Task 8：baseline 必须是 exact-tree accepted Report；外部 Observation 不能回灌。唯一 tracked 写入仍须绑定同次 Host 链。
- 影响：在 P0 下，真实 check 到不了 `passed`，但调用方仍可把测试注入或手写的全绿 Report 写成 `config/project-health/baseline.json`。
- 建议：只接受本进程刚刚写出的 Report（内容 hash / evidence bundle 闭包），或 update-baseline 内部先跑同一 check 再比 byte identity。
- 复核：未复核

### [P2] [D5] 信任缝 `mode-observer.ts` 没有专项测试

- 证据（`static-read` + `automated-contract`）：census 未登记、仓库中不存在 `mode-observer.test.ts`。CLI 测试只覆盖 `--receipts` 拒绝、checkout 身份、ancestry/merge 口径，不覆盖「真实 Gate stdout → Sensor」或「伪造 stdout 不能变绿」。
- 期望：冻结 Host 链应有行为级 RED，覆盖 banner、脱敏、缺 Gate、failed vs incomplete。
- 影响：P0 能通过 191 个 project-health 测试合入。
- 建议：用 runner 跑 fixture Owner，断言 observer 得到可 parse Evidence；对损坏 stdout 断言 incomplete 而非 passed。
- 复核：未复核

### [P2] [D5] PR ancestry 直接 `execFileSync("git")`，不经 PHO-0B

- 证据（`static-read`）：`assertProjectHealthPrIdentityV1` 自己 spawn git。设计 §9：外部命令走唯一 execution envelope。change-impact diff 已登记为 Gate。
- 期望：身份 git 与 diff 使用同一 runner，timeout/redact/cleanup 同一套。
- 影响：ancestry 失败与 infrastructure 失败混成 CLI exit 1；与「禁止旁路 spawn」不完全一致。
- 建议：登记只读 `merge-base --is-ancestor` descriptor，或把该检查并入 `change-impact-diff` Gate。
- 复核：未复核

### [P2] [D5] Sensor implementation hash 没有 lockfile 变更对抗

- 证据（`automated-contract`）：`registry.test.ts` 只改 `workspace-boundary.ts` 字节。当场清单含 `pnpm-lock.yaml`，但无「改 lockfile → hash 变」测试。
- 期望：规格 §4.1：实现身份包含 lockfile；测试应锁住该承诺。
- 影响：后续若有人把 lockfile 从 inventory 拿掉，现有测试仍绿。
- 建议：在复制树里改 `pnpm-lock.yaml` 一行，断言 hash 变化。
- 复核：未复核

---

## 5. 维度覆盖表

| 维度 | 状态 |
|---|---|
| D1 定位与需求边界 | 已查。Observatory 仍是仓库工具，未进入 Runtime/Browser/ValidationReport。PHO-6 在 docs/18 仍未勾选，未宣称生产 GO。 |
| D2 Schema 与 AI-friendly | 已查。当前规格与 CLI 已去掉 `--receipts`；DTO 仍用 `kind`/`schemaVersion`、单位字段、关闭 enum。未发现新的双轨公共字段。 |
| D3 承诺与事实 | 已查。同进程 Host 与 stdout Evidence 是当前施工合同；P0 使事实不满足承诺。`health:nightly/release` 已挂入口但 observer 未接 Required Sensor。计划 Task 8 checkbox 仍空，与已提交实现不一致，但不构成独立 P0。 |
| D4 单一权威 | 已查。Observation/Report status 由 Profile 重算。Gate 语义本应由 Owner stdout 唯一提供，却在 runner 层被脱敏改写，权威链断开。 |
| D5 工程质量 | 已查。`lodash-es` 具名导入、`===` / `isNil`。缺少 mode-observer 测试与 lockfile hash 对抗。CLI 旁路 spawn git。 |
| D6 门禁与证据 | 已查。上表五条命令均在 `893d6d5e` 上 exit 0。191 个 focused 测试不能覆盖 P0。未跑 Browser/Havok。 |

Runtime checklist：不适用（未改 Runtime 权威状态）。

---

## 6. 结论

绑定 SHA `893d6d5eac79288851e627e754f1a269173f84cc`：**NO-GO**。

同进程 Registry 执行、exact-clean、ExecutionEvidence parser、PR ancestry/合成 merge 口径、Sensor 源码+lockfile hash 在源码层大体按当前规格落地。但 Host 在把 Gate stdout 交给 Sensor 之前用「任意 `/`」脱敏，撕毁 workspace/census JSON。这使第 1/4 项在生产路径上失败，并让全绿 Report 只能来自注入/磁盘，而不是同次 Gate。

修复 P0 并补上 observer 接线与 baseline 身份之前，不能把本 SHA 当作 PHO-6 信任链闭合。
