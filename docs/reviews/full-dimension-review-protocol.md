# 全维度审查协议

对本仓库的设计规格、代码变更或整仓状态执行审查时，按本协议进行。本协议规定审查模式、必查维度、证据标准、输出格式和完成标准。Runtime 专项条目委托给 [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)，不在此重写。

审查是只读任务：不修改代码，不更新金标制品，不改冻结的 plan/lock，不擅自评论或合并 PR。修复建议只进 findings。

## 0. 审查模式

先声明本次属于哪种模式，再按模式选维度：

| 模式 | 对象 | 必查维度 |
|---|---|---|
| A 设计规格审查 | `docs/superpowers/specs/` 单份规格 | D1 D2 D3 D6 |
| B 变更审查 | PR / 分支 diff | D2 D3 D4 D5 D6 |
| C 整仓审计 | 当前 HEAD 全量 | D1–D6 全部 |

变更涉及物理、移动、输入、动画、相机、渲染调度、资源所有权或 Browser/CLI 运行时行为时，额外完整执行 `runtime-deep-review-checklist.md`。

## 1. 审查前置（所有模式必做）

1. 记录审查对象：commit SHA、分支、diff 基线；模式 A 另记规格路径与状态（Draft / Frozen / Implemented）。
2. 按顺序读权威来源：`AGENTS.md` → [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md) → 被审对象及其上位规格 → 对应实施计划。
3. `docs/reviews/` 下带日期的旧审查只作线索，不作结论。引用其中任何一条前，必须回当前源码复验并标注「已复验」或「已失效」；旧审计里专门有「已确认不再成立的旧问题」一节，把过期结论当现行 bug 报出来即审查失败。
4. 断言 Babylon / Havok / Playwright 等引擎行为前，从 lockfile 读实际安装版本，并以安装源码或官方文档为准；禁止凭训练记忆断言引擎语义。
5. 业界对照必须给出处（官方文档或源码链接），并区分「已核对出处」与「凭印象、未核对」。未核对的对照不得作为 P0/P1 依据。

## 2. 维度清单

### D1 定位与需求边界

- 对照产品定位：Canonical/Hosted Lane 中，AI 用结构化配置组装世界，SDK 负责编译、物理、验收；
  让该 Lane 的 AI 直接触碰 Babylon/Havok、场景脚本或引擎 Handle 仍是缺陷。ADR-0007 的独立
  Babylon Native Scene Lane 只允许创作期视觉例外；审查它时必须同时证明单一 `sceneSource.kind`、
  Host-owned Candidate Scene、显式 Spawn/Collider 登记，以及 SDK 独占 Havok、人物、动作、主相机、
  固定 Tick、状态和生命周期。缺少任一边界即为缺陷。
- 当前阶段边界是 outdoor heightfield。室内、载具、NPC 行为、洞穴、悬挑、联网必须报 capability gap，不得写成受支持能力；也不得把 gap 记成实现 bug。
- 检查目标 / 非目标是否闭合：有没有为「先做简单版」预留的退路字段、临时旁路或未声明的隐含承诺。
- 对照 `docs/18` 的依赖图与里程碑顺序：被审设计是否提前实现未冻结协议的公共字段；「技术探针」是否泄漏进 Canonical Schema。
- 上下游冲突必须走 change-request 机制，静默修改上游冻结产物（plan 源、规划图、lock）即 P0。

### D2 Schema 与 AI-friendly

命名与结构逐条对照 `AGENTS.md` 的 Schema 规则和 [`2026-08-17-ai-first-lego-game-sdk-design.md`](../../docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md)：

- 一个概念一个词；出现同义公共字段、provider 方言或要求 adapter 在两种叫法间翻译，即缺陷。
- 数值字段名必须自带单位与坐标域（`Meters` / `Seconds` / `Radians` / `Ratio` / `XYZ` / `XZ` 等）；靠 prose 解释单位的字段即缺陷。
- 判别器用法：持久定义用 `kind`，Command/Event/Change 用 `type`，互斥运行态用 `mode`；资源引用用 `...Ref`，本地引用带角色限定（`...EntityId` 等）。
- 优先闭合枚举与 discriminated union；用多个可选布尔拼组合状态即缺陷。
- Canonical Schema、AI Profile、CLI、Browser 协议、examples、生成类型必须同名同义。抽查同一字段在各处的定义。
- 检查诊断质量：失败必须返回稳定错误码与结构化定位（世界坐标 / 图像位置 / 资源 Ref），不允许裸 provider 报错穿透公共边界。

### D3 承诺与事实对拍

这是本仓库最高频的被忽略问题，每次审查必查：

- Catalog、联合类型、Registry 清单、UI 列出的每一项能力，逆向核对到真正消费它的 Runtime 代码与门禁 Fixture。列出「已声明但无运行时消费者」的成员。
- 「设计完成」不等于能力完成。对照 `docs/18` 的进度口径：仅有设计最多计该工作流 20%，只有过全链路门禁的纵向切片才算完成。发现文档或 PR 把成稿规格说成已交付能力，即缺陷。
- README、quickstart、backlog、规格四处的能力声明互相对拍，列出不一致项。
- PR / 文档中的验证声明必须核实：要求具体命令、exit code 与运行环境。写了「已验证」但给不出命令与输出的，按未验证处理。

### D4 单一权威状态

执行 `runtime-deep-review-checklist.md` 的 authority map 后，额外搜索以下本仓库实际发生过的复发模式：

- 同一状态的第二推导路径：如 ground support 除 Havok support 查询外，另有 spawn 期独立 raycast 或地形高度采样参与判定。搜索所有对支撑、介质、朝向、时间的旁路推导。
- 同一字段两端语义不同：如一端写入世界绝对高度、另一端当作离地偏移再叠加地形高。对每个跨包传递的数值字段确认双方读写语义一致。
- 空间关系用包围盒近似冒充权威碰撞：如 `supported-by` 取 AABB 顶面而非实际 Collider 表面。
- 视觉层反向决定 Gameplay：从 Mesh 名、材质、颜色或动画 Clip 名推断可走、可游、姿态或接地，均为缺陷。

### D5 工程质量与可维护性

- 依赖复用：集合与对象操作用 `lodash-es` 具名导入，3D 数学用引擎 API；重造这两类轮子即缺陷。每个包的直接 import 必须出现在自己的 `package.json`。
- 相等判断使用 `===` / `!==`；判空用 `isNil` / `isEmpty`，不使用 `==` 与隐式转换。
- 确定性：同输入、同 Registry Lock、同 Seed 必须产生相同产物与 Hash；检查稳定排序、无 Map/Set 迭代序依赖、无时间与随机源泄漏。
- 测试分层与对抗性：unit/contract、runtime integration、browser gate 各证各的；检查是否只有对称、稳态的 happy path。对抗清单（非对称几何、非法输入、部分构造、throwing cleanup、双实例隔离、reset/rebind）见 runtime checklist §3。
- 失败路径：不允许静默钳制、静默降级或猜测；非法输入应在 Admission/Validation 阶段稳定失败。
- 面向 agent 的文件（SKILL、协议、prompt）只含可执行指令，不含维护者叙事与会漂移的具体值（版本号写「以 lockfile 为准」）。

### D6 门禁与证据分层

- 每条结论标注证据层级：`static-read`（读代码）、`automated-contract`（测试/CLI）、`rendered-visual`（截图/像素）、`manual-interaction`（人工操作）。不得用低层证据冒充高层结论，例如用 smoke test 宣称生产支持。
- 金标 Hash 漂移必须区分行为漂移与环境光栅漂移：协议 Hash（IR / Plan / 资产）与行为数值一致而 PNG 像素不同，属环境噪声，不得为让审查通过而更新金标。
- Blocking Gate 与 Required Metric 一票否决，不被总体分数或 advisory 项抵消；发现任何「总分掩盖关键失败」的写法即缺陷。
- 审查声明跑过的每条命令附 exit code；环境缺依赖导致未跑的门禁，明说「未跑及原因」，不得含糊为「应该能过」。

### D6.1 变更感知的门禁选择与证据复用

先建立「改动/结论 → 输入 → 门禁」映射，再运行命令。门禁数量不是审查质量指标；目标是让每项
受影响的承诺在最终树上得到一次足够强、可追溯且不改写被审对象的证据。

1. 先跑失败复现或最窄的受影响回归；确认方向后，在最终待审树上把每个相关完整门禁各跑一次。
2. 同一树上，宽门禁已经明确包含窄门禁时不重复执行。当前根 `pnpm test` 先用
   `test:census` 对全部 Vitest `.test.ts` 做精确分类，再依次运行最多两个 worker 的
   `test:contract` 和单 worker 的 `test:resource-heavy`；`pnpm test:scenes` 的两个文件已在
   contract lane 内，不得把别名的二次通过计成新增证据。
   `pnpm test:contract:coverage` 会用 coverage instrumentation 重跑 contract lane，只在覆盖率
   claim 或盲区诊断需要时运行；它不是 root aggregate 通过后的默认第二遍 contract gate。
3. 不得反向假设聚合覆盖。test census 只闭合 Vitest `.test.ts`；`pnpm test:studio` 与
   `pnpm test:independent`（root Node `.test.mjs`、Cursor Python、Site）仍是独立门禁，生产 build、
   Browser verifier、rendered visual 与 manual interaction 仍是不同证据层。审查触及相应输入时必须
   直接运行对应 lane，或明确记为未跑。tracked CI 覆盖了哪些独立 lane，也必须以当前 workflow
   为准，不能从“存在 CI”推导成所有证据层已闭合。
4. 后续改动只让它可能影响的证据失效：Runtime/shared contract 改动会失效相关回归、typecheck、
   root test、build 和直接相关的 capability evidence；构建或依赖改动只失效受影响 build；纯文档修订
   只需重做 diff、链接和 claim 对拍。跨域公共合同、共享 Runtime owner 或依赖图改变时，才重新打开
   整个相关 closure。
5. 复用证据必须记录来源 commit/tree、命令、结果、时间和适用输入。只有被审产品树与该证据输入
   相同、且其结论范围没有扩大时才能复用；旧 review 的一句「已通过」不是可复用证据。
6. 审查命令必须只读。任何成功路径会生成、替换或格式化 tracked 文件的命令，都属于 update-capable
   producer，不得在只读审查中当作 check 运行。先要求 `--check` / 临时目录 byte-compare / 独立
   `*:update` 权限；在拆分完成前，只能复用 exact-input 证据或如实记为未跑，不能运行后清掉 diff。
7. 每组自动门禁结束后检查 tracked worktree；完成前执行 `git diff --check` 和 clean-tree assertion。
   审查前已存在的用户文件不纳入证据，也不得为了得到 clean result 而删除或覆盖。

最小命令矩阵如下；按受影响输入选行，不机械全跑：

| Lane | 当前入口 | 证明范围 / 不覆盖范围 |
|---|---|---|
| Type / source contract | `pnpm typecheck` | TypeScript 输入；不证明 Runtime、Node `.mjs` 或视觉行为 |
| Root Vitest aggregate | `pnpm test` | census 后运行 contract + resource-heavy，两 lane 精确覆盖 `.test.ts` 并已包含 scenes；不包含独立 Node/Site tests |
| Contract coverage diagnostic | `pnpm test:contract:coverage` | 按需重跑 contract 并生成 coverage；证明覆盖率 claim，不作为默认 completion gate 或新增行为证据 |
| Studio | `pnpm test:studio` | Studio Node tests；不被 root Vitest 包含 |
| Independent | `pnpm test:independent` | fail-closed census 后顺序运行 root Node、Cursor Python、Site；不被 root Vitest 包含 |
| Production bundle | `pnpm build` 或受影响 app 的 build | bundling 与 shipped import graph；不证明交互/像素 |
| Tracked CI | `.github/workflows/ci.yml` 的实际命令 | 当前组合临时 generated check、typecheck、Studio、independent、root test、build 与 clean-tree；未列入 workflow 的 Browser/visual/manual lane 仍未覆盖 |
| Browser / capability | 默认 verifier；发布时使用 `*:update` | 默认真实检查后清理 staging；只有显式 update 可替换 tracked artifact |
| Visual / interaction | 截图检查、manual interaction | 可见结果或手感；不能由单元测试、hash 或 smoke 替代 |

## 3. 输出格式

产出一份 `docs/reviews/YYYY-MM-DD-<subject>-review.md`（模式 B 若派发方要求，可输出为 PR 评论，结构不变）。findings 必须自包含，能被另一个模型在不读本会话上下文的情况下对抗复核。

每条 finding 使用固定结构：

```markdown
### [P0|P1|P2] [D1-D6 维度] 标题

- 证据（<证据层级>）：当前 HEAD 的代码引用或命令输出；代码用 startLine:endLine:filepath 格式
- 期望：正确行为及依据（规格文件 / AGENTS 规则 / 已核对的业界出处）
- 影响：谁在什么场景下受害
- 建议：最小修复方向（不自动实施）
- 复核：未复核 | 已被 <工具> 复核确认 | 复核后撤回（附原因）
```

分级标准：P0 = 静默正确性错误、双权威、冻结边界被破坏；P1 = 违反已冻结合同或命名规则、承诺与事实不符；P2 = 可维护性、测试覆盖、文档一致性。

报告固定包含四节：

1. **审查元数据**：模式、对象、HEAD SHA、依赖版本、跑过的命令与 exit code。
2. **旧结论复验**：本次触及的既有 review 结论及其现状（成立 / 已失效）。
3. **Findings**：按 P0 → P2 排列。
4. **维度覆盖表**：D1–D6 逐项标「已查 / 未查（原因）/ 不适用」，不允许静默跳过。

## 4. 完成标准

同时满足才算审查完成：

- 所选模式的必查维度全部在覆盖表中闭合。
- 每条 P0/P1 都有当前 HEAD 的一手证据，不存在仅转抄旧审计的条目。
- 所有引擎语义断言标明「已对照安装版本」。
- 验证命令如实列出，含未跑项及原因。
- 报告可独立交给第二个模型做对抗复核，无需本会话上下文。
