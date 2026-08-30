# Babylon Native Authoring BNA-2 生产闭环审查

## 1. 审查元数据

- 审查模式：Mode B（变更审查），覆盖 D1–D6；因为改动涉及 Babylon Scene、相机、渲染调度、
  Candidate 生命周期和 Runtime consumer，同时执行
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)。
- 集成基线：`main@7fa3197220ef6b8b1ad86f57fc85f8b3e248e0c3`。
- 最终产品代码观察点：`cdd2267e2333b9b3dd89674964aeaafbefce3c8a`。
- 设计权威：
  [`2026-08-29-babylon-native-authoring-production-closure-design.md`](../superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md)
  和
  [`2026-08-29-babylon-native-authoring-production-closure-implementation.md`](../superpowers/plans/2026-08-29-babylon-native-authoring-production-closure-implementation.md)。
- 锁定引擎：`@babylonjs/core@9.23.0`、`@babylonjs/havok@1.3.14`。相机、Scene、Node、Light、
  Observable、ActionManager、PhysicsEngine、dispose 和 render-loop 的审计面已对照安装源码，不依据记忆。
- 范围：只裁决 BNA-2 Trusted Local Source Admission、Candidate Authority Audit、Runtime Replay、
  `worldkit native check/explain` 和 current-only Cloud Ridge/Runtime consumer 迁移。BNA-3 Package/Receipt、
  BNA-4 正式 RuntimeHost/Havok、BNA-5 Hosted 隔离、BNA-6 AI 评测、BNA-7 Capture/Route 与 BNA-8
  最终生产裁决继续开放。

### 1.1 自动化证据

最终 Cloud gate 锁定产品代码 SHA `cdd2267e2333b9b3dd89674964aeaafbefce3c8a`，任务为
`bc-97bcf91d-d4f5-4f09-a9b3-a8df49c2d4a5`；结果为 **GO**。文档提交不改变其产品、测试、构建或
依赖输入。

| 命令 | Exit | 结果 |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile sha256 未变 |
| `pnpm test:census` | 0 | 324 = 289 contract + 35 resource-heavy |
| PC-90 Step 2 的 26 文件 focused suite | 0 | 26 files / 637 passed |
| `pnpm verify:workspace-boundaries` | 0 | floor passed；49 registered debt |
| `pnpm typecheck` | 0 | `tsc --noEmit` |
| `pnpm test` | 0 | contract 3532 passed / 3 skipped；resource-heavy 540 passed |
| `pnpm build` | 0 | 2214 modules；只有 chunk-size advisory |
| `pnpm build:native-scene` | 0 | 2032 modules；只有 chunk-size advisory |
| `pnpm verify:bna1-clean-break` | 0 | `ok: true`；扫描 1025；diagnostics 空 |
| `pnpm verify:bna2-clean-break` | 0 | `ok: true`；扫描 809；diagnostics 空 |
| `pnpm verify:native-scene-playground` | 0 | 主路径、jump/landing、camera orbit/reset、3 collider 通过 |
| PC-90 Step 4 census | 0 | 旧 API 0；一个 workspace convention；一个 Import Profile owner；正式 guard 存在 |
| `git diff --check` / final clean-tree | 0 | 无 whitespace；HEAD/lockfile/worktree 未变 |

旧 API `rg` 的进程 exit 为 1，含义是预期的零匹配，不是 gate failure。没有单独重跑 `test:scenes`；
根 `pnpm test` 已覆盖它。

独立 Mode B + runtime-deep 审查任务 `bc-7d3e6667-f122-4f42-a30f-6b8077c31c27` 对同一 SHA
给出 **GO**：无 P0、P1 或 P2。其仓外 constructor-provenance 探针覆盖 43 案，结果为 42 个预期匹配、
0 个 fail-open、1 个 fail-closed P3；两组 focused 复核分别为 4 files / 334 passed 与 5 files /
229 passed。审查未修改 tracked 文件。

此前多个精确 SHA 的独立 NO-GO 只作为修复过程证据，不替代最终观察点：

- `f307b53`：generic/direct/structural 参数流已修，但 rest、spread、identity bag、`new Wrapper`、Light
  rest 与 helper-return bag 仍可逃逸；
- `a2ec543`：上述六条关闭，但 bind 后 `new`、BindingElement 默认值、隐式 `arguments` 和 getter
  返回值仍有四条 fail-open；
- `c3519fa`：上述四条关闭，但 helper/getter-returned bind、赋值解构 shorthand 默认值和构造参数
  全量 spread 仍有三条 fail-open；
- `cdd2267`：三类剩余旁路均先形成行为级 RED，再通过统一 bind 创建传播、赋值解构 carrier 和静态
  spread 参数展开关闭；不可静态展开的登记控制参数保持 fail-closed。

## 2. Findings 与修复复核

### 2.1 最终开放 Findings

截至最终产品代码观察点：**无开放 P0、P1 或 P2**。

### [P1] [D4/D5] Build callable、Module reference 与 Babylon 构造器来源可经类型擦除逃逸（已解决）

- 证据：早期实现只识别直接 API 名称。当前 `scripts/native-scene/source-admission.ts` 使用三套单调
  fixed-point carrier（Module reference、TransformNode、Scene-registered Light），覆盖 object/array/
  Map/Set、声明与赋值解构、默认值、getter、rest/spread、direct/call/apply/bind/new、helper 参数与返回、
  跨文件与循环；`arguments` 不在 V1 能力面。相应正负向回归位于 `source-admission.test.ts`。
- 期望：Build settlement 后 Module/Context/Registration/Resolver/Babylon imported reference 或 callable
  不得成为持久状态；TransformNode/Light 的 skip-registration flag 不得绕过 Candidate Scene wrapper。
- 影响：未关闭时，Module 可绕过 Build Epoch、登记基线与生命周期权威，属于 P1。
- 建议：已使用统一 carrier owner；新增语法必须扩展同一 fixed-point，而不是增加平行 parser。
- 复核：已被 Codex 复核确认。

### [P1] [D4/D5] Candidate 权威可被相机、物理、循环、输入和生命周期 API 接管（已解决）

- 证据：`packages/native-babylon/src/authority-audit.ts` 在 Build Epoch 前建立 Candidate baseline，并对
  Babylon 9.23.0 的 camera、physics、render scheduling、Observable/ActionManager、Scene/Engine disposal
  做 instrumentation 与差异审计；precondition 失败时不调用 Build/Registration，restore 在所有终态执行。
- 期望：Native Module 只能创建视觉对象，并通过 Registration 提交 Spawn/静态 Collider intent；Scene、
  Camera、Physics、Input、Tick、Render Loop 和 Gameplay 继续由 Host/SDK 独占。
- 影响：任一旁路都会形成第二个 Runtime owner，破坏 Canonical/Native 一 Kernel 的设计。
- 建议：已把 Audit 设为 Candidate Admission 的不可选阶段；公开 Host API 不提供 raw build shortcut。
- 复核：已被 Codex 复核确认。

### [P1] [D4/D6] 单 Candidate 通过不能证明确定性与清理顺序（已解决）

- 证据：`packages/native-babylon/src/runtime-replay.ts` 顺序创建两个隔离 Candidate lease，执行完整
  Admission，对 handle-free canonical Contribution bytes/hash 精确比较，并在成功、主失败和 cleanup
  failure 路径释放 Candidate。
- 期望：同一输入必须在独立 Scene 中得到 byte-exact 相同 Contribution；cleanup failure 不覆盖更早主失败。
- 影响：否则 module-scope state、实例污染或 disposal 顺序错误可能进入后续 Package/Receipt。
- 建议：已由 Replay 成为 checker 的唯一动态入口；BNA-3 只消费结果，不复制 replay 规则。
- 复核：已被 Codex 复核确认。

### [P2] [D2/D5] Native 检查缺少稳定、可解释的 CLI 合同（已解决）

- 证据：`scripts/native-scene/native-scene-check.ts` 组合 workspace、Source、ephemeral bundle 与 Host
  replay；`worldkit native check/explain` 共享同一稳定 DTO。子进程测试覆盖 stdout JSON、stderr、
  `0/1/2` exit、相对路径和敏感路径清洗。
- 期望：AI 与 CI 消费一个闭合 Diagnostic DTO，不能依赖 raw TypeScript/Rollup/Babylon error。
- 影响：没有稳定 stage/code/location/exit 时，自动修复会猜测失败层并可能泄漏本机信息。
- 建议：已实现单一 checker/explain owner；BNA-3 Package 检查必须复用它。
- 复核：已被 Codex 复核确认。

### [P2] [D3/D5] Cloud Ridge 与 Runtime consumer 保留旧 Controller/raw build 路径（已解决）

- 证据：Cloud Ridge 已迁移为 default-export pure Module；实验 app 与 Runtime consumer 走 audited
  admission。`verify:bna2-clean-break` 扫描旧 Controller、raw build export、legacy parser/consumer 和第二
  Scene Source 路径。
- 期望：未发布仓库采用 current-only clean break，删除旧入口、alias、fallback 与双消费者。
- 影响：旧路径会形成“检查器通过但产品不使用”的假闭环。
- 建议：已删除旧 API 并更新消费者、fixture、verifier 和 package boundary tests。
- 复核：已被 Codex 复核确认。

### [P3] [D5] `const addToScene = true` 被保守视为可能跳过登记（接受）

- 证据：`new TransformNode(..., addToScene)` 在 alias 值为 `true` 时仍拒绝；字面 `true`、省略 flag 和
  可静态展开的安全 tuple/spread 通过。
- 期望：仅在能静态证明登记极性时放行。
- 影响：合法但不必要的 flag alias 被误拒；没有静默逃逸，不影响正确性。
- 建议：V1 保持 fail-closed；未来若改进，只解析不可变 literal origin，不弱化未知值拒绝。
- 复核：已被 Codex 复核确认。

## 3. 实施任务闭合

| Task | 交付 | 裁决 |
|---|---|---|
| PC-05 | `isNil`/`isEmpty`、直接依赖、唯一 Import Profile owner | 已闭合 |
| PC-10A | 固定 workspace、local source graph、symlink/escape/dynamic import admission | 已闭合 |
| PC-10B | 严格 typecheck、临时 bundle、exact Module load、全路径清理 | 已闭合 |
| PC-20A | Candidate Build Epoch 与 Host API clean break | 已闭合 |
| PC-20B | precondition、Babylon authority instrumentation/audit | 已闭合 |
| PC-30 | 双 Candidate deterministic replay 与 cleanup precedence | 已闭合 |
| PC-40A | 可信本地 checker 与稳定 Diagnostic DTO/explain | 已闭合 |
| PC-40B | `worldkit native check/explain` 与 `0/1/2` process contract | 已闭合 |
| PC-50A | Cloud Ridge default pure Module 迁移 | 已闭合 |
| PC-50B | Runtime consumer audited admission 与旧 API 零 census | 已闭合 |
| PC-90 | exact-tree gate、独立深审与文档真相 | 已闭合 |

## 4. Runtime authority map

| 状态/资源 | 唯一 Owner | BNA-2 结论 |
|---|---|---|
| Native Source graph/typecheck/bundle | Node trusted tooling | 固定 workspace，临时产物清理；不写 Package |
| Module Build epoch | Candidate Admission | Build 后 Registration 关闭，reference 不得逃逸 |
| Candidate Scene/Engine lifetime | Candidate factory/lease | Module 不得 dispose；Replay Host 顺序释放 |
| Camera/Physics/Input/Tick/Render | RuntimeHost/SDK | Audit 禁止接管；BNA-2 不创建 Gameplay owner |
| Spawn/static Collider intent | Native Registration/Contribution | handle-free、排序、冻结、hash；BNA-2 不 attach Havok |
| Determinism | Runtime Replay | 两个隔离 Candidate 的 bytes/hash 必须一致 |
| Diagnostic/CLI | Native checker | 一个 DTO、一个 CLI 分支、稳定 code/location/exit |
| 正式 Runtime admission | RuntimeHost pre-allocation guard | `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` 保持 fail-closed，等待 BNA-3/BNA-4 |

## 5. D1–D6 覆盖表

| 维度 | 状态 | 结论 |
|---|---|---|
| D1 定位与边界 | 已查 | 只关闭 Trusted Local checker；未提前宣称 Package、Runtime、Hosted、AI、Capture、Route/Nav |
| D2 Schema/AI-friendly | 已查 | 一个 Import Profile、Module/Contribution/Check DTO 与 diagnostic/exit；无 alias 或双 parser |
| D3 文档与事实 | 已查 | 设计、本报告与 Backlog 只关闭 BNA-2；BNA-3–8/BWB-3+ 继续开放 |
| D4 单一权威 | 已查 | Source/Build/Audit/Replay/CLI 各一 owner；正式 Runtime rejection 仍在 Candidate 分配前 |
| D5 工程质量 | 已查 | fixed-point provenance、临时清理、stable hash、throw precedence、clean-break 与正负向回归闭合 |
| D6 证据 | 已查 | RED→GREEN、exact-SHA Cloud gate、独立安装引擎深审分层记录；NullEngine 不冒充 Havok/Hosted |

## 6. 审查结论

**GO：接受 BNA-2 Trusted Local engineering closure。**

该 GO 只表示 Native Module 已有不可旁路的本地 Source Admission、Authority Audit、双 Candidate Replay 和
正式 checker/CLI，可作为 BNA-3 的输入。它不表示 Native 已进入正式 RuntimeHost，不授予 Havok/Subject/
Camera 产品能力，不声明 Hosted 任意代码安全、AI 生成质量、视觉还原、Route/Nav 或生产发布。上述能力必须
分别完成 BNA-3 至 BNA-8 与 BWB-3+，不得扩大本结论。
