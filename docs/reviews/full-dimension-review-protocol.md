# 全维度审查协议

对本仓库的设计规格、代码变更或整仓状态执行审查时，按本协议进行。本协议规定审查模式、必查维度、证据标准、输出格式和完成标准。Runtime 专项条目委托给 [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)，不在此重写。

审查默认只读：不修改代码、金标制品或冻结的 plan/lock，不擅自评论或合并 PR。默认在会话中输出 findings；用户明确要求落盘报告时，只写获授权的报告，不把审查授权扩大为修复授权。用户指定的范围、只读和停止测试要求优先。

## 0. 审查模式

先声明本次属于哪种模式，再按模式选维度：

| 模式 | 对象 | 必查维度 |
|---|---|---|
| A 设计规格审查 | 单份设计规格 / 协议文档 | D1 D2 D3 D6 |
| B 变更审查 | PR / 分支 / 指定未提交 diff | D2 D3 D4 D5 D6；目标或架构边界改变时加 D1 |
| C 整仓审计 | 当前 HEAD 全量 | D1–D6 全部 |

必查维度要求作出适用性判断，不要求机械执行无关检查。涉及 Runtime 状态或生命周期时，只选 `runtime-deep-review-checklist.md` 的适用章节，并记录选择依据；仅涉及 Browser/CLI 文案或编排不触发完整 Runtime 审查。迁移与生产链路对齐另按 §1.1 建立覆盖记录。

## 1. 审查前置（所有模式必做）

先确认 checkout 与用户指定的工作树一致；同名文档甚至相同文件内容，都不能证明配套代码、未提交改动和上位规则相同。发现基础树选错时，先在正确树复验相关判断，不能直接迁移结论。

1. 记录 checkout 路径、HEAD SHA、分支、diff 基线与范围；含未提交变更时记录对应 diff / 内容指纹，不能仅用 HEAD 标识被审输入。模式 A 另记文档路径与状态；记录工作树初始状态，以区分被审变更和审查新增变更。
2. 先读 `AGENTS.md`、被审对象及直接相关合同；用 `rg` 定位上位规格与实施计划的必要章节，不预加载文档树。仅审查路线图或状态声明时读 [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)，不在本协议复制其进度公式。
3. `docs/reviews/` 下带日期的旧审查只作线索，不作结论。引用前回被审树复验并标注「成立 / 已失效 / 尚未复验」；未复验条目不能作为当前缺陷。
4. 断言 Babylon / Havok / Playwright 等引擎行为前，从 lockfile 读实际安装版本，并以安装源码或官方文档为准；禁止凭训练记忆断言引擎语义。
5. 业界对照必须给出处（官方文档或源码链接），并区分「已核对出处」与「凭印象、未核对」。未核对的对照不得作为 P0/P1 依据。

### 1.1 迁移与生产链路对齐记录

分支迁移、生产链路调整或声明「与旧基线对齐」时适用。普通局部变更只追踪受影响边界，不扩大为整仓审计。

本仓库当前场景还原迁移遵循 [production outcome parity design](../superpowers/specs/2026-09-04-block-world-production-outcome-parity-design.md)，以该冻结规格锁定的 `codex/block-world-main-integration` 提交为基线；记录实际比较 SHA，不能随移动分支静默升级基线。核心目标是保留老分支已验证的流程与还原效果，不是重新设计一套生产标准。除获准的架构适配外，流程、参数、Skill、反馈修复和成功失败标准都必须逐项对齐；未经用户明确调整目标，不得把非架构差异标成「有意不同」或「不适用」来跳过。

1. 固定旧基线与被审树的 SHA / 未提交输入、入口、配置和比较目标。Git 已合并不等于行为等价；历史 Case 只证明其记录的输入和树状态。
2. 以旧基线的成功失败标准核对当前判定：旧基线可成功交付的状态，不得仅因新增质量门槛在新链路被判失败；旧基线用于反馈或修复的指标不得擅自升级为发布否决。新架构的必要差异与冻结的安全/单一权威边界单独列明，不能借架构变更豁免生产语义差异。发现现行原则与对齐目标冲突时列出具体冲突，交由有权者更新，不静默选择一方或自行改写冻结合同。
3. 从入口沿实际调用、数据和失败路径枚举环节，并反向检查旧实现独有的行为。按环节拆分以下适用检查项，不能只比较文件存在或函数签名：

   - 输入与预处理：图像尺寸、裁剪、色彩/坐标域、路径、输入身份与来源。
   - 生成与 Skill：实际提交的 Prompt、模型配置、工具权限、具名图像/附件、上下文预算；Skill 活源、冻结副本及实际加载位置是否一致。
   - 参数与产物传递：显式值、缺省值与覆盖顺序、单位、Schema、parser/转换、Hash/Receipt，以及最终消费者是否真正使用。
   - 反馈与效果：Capture 视角/配置、比较图、评分合同、诊断定位，以及修复任务实际收到并消费的反馈。
   - 控制与结束：分别核对同任务自修复、外部 Native Attempt、Provider 任务重试和 Host-only 恢复的 owner、预算、持久化与触发条件；外部 Attempt 不得伪称同任务修复。核对超时、取消、未知提交的原 request-id 协调、成功/失败判定、发布、清理与替代路径删除，不能重复提交已完成的付费任务。

4. 使用下表逐项记录；同一格有多个独立参数或分支时继续拆行。未覆盖范围必须列明，不能用 D1–D6 勾选替代具体覆盖证据。

| 稳定 ID / 环节 | 旧基线位置与实际行为/值 | 当前位置与实际行为/值 | 差异及依据 | 证据与覆盖方式 | 结论 / 跟踪 |
|---|---|---|---|---|---|
| `<ID / 检查项>` | `<源码/配置位置>` | `<生产者到消费者>` | `<无差异 / 获准架构适配 / 其他待决差异>` | `<全查/抽查范围；代码、回归或图像证据>` | `<已对齐 / 未对齐 / 未验证 / 有依据的不适用；任务 ID 与责任方>` |

5. 流程一致与效果一致分别举证：核对旧基线成功/失败样本在新链路的判定，效果结论还需可比输入、配置与可追溯图像/评测证据。单个 Case 通过不能证明总体效果或失败率等价；缺证据标「未验证」，不为补证明擅自启动昂贵 Case。
6. 每个缺口优先关联已有任务，新增项沿用现有任务编号体系，记录影响、建议责任方与所需证据。优先处理改变成功失败结果、阻断链路/反馈修复或明显损害还原效果的非架构差异；其他缺口也必须记录，延期不等于对齐。只读审查不得擅自改 backlog；只有核对实际落盘记录后才能声称「已记录」。表格是本次审查证据，不是第二份 live status authority。

## 2. 维度清单

### D1 定位与需求边界

- 对照产品定位：Canonical/Hosted Lane 中，AI 用结构化配置组装世界，SDK 负责编译、物理、验收；
  让该 Lane 的 AI 直接触碰 Babylon/Havok、场景脚本或引擎 Handle 仍是缺陷。ADR-0007 的独立
  Babylon Native Scene Lane 只允许创作期视觉例外；审查它时必须同时证明单一 `sceneSource.kind`、
  Host-owned Candidate Scene、显式 Spawn/Collider 登记，以及 SDK 独占 Havok、人物、动作、主相机、
  固定 Tick、状态和生命周期。缺少任一边界即为缺陷。
- 能力边界按 Scene Source / Lane 核对当前冻结规格、Skill 与验证器。Catalog 的 outdoor heightfield 限制不泛化到所有 Native 视觉；视觉可近似也不等于 Gameplay 支持。未激活的能力标为 capability gap，不虚报支持或实现 bug。
- 检查目标 / 非目标是否闭合：有没有为「先做简单版」预留的退路字段、临时旁路或未声明的隐含承诺。
- 核对被审设计是否提前引入未冻结协议的公共字段、「技术探针」是否泄漏进 Canonical Schema；涉及里程碑与进度声明时再对照 `docs/18` 的依赖关系。
- 上下游冲突必须走 change-request 机制；静默修改上游冻结产物（plan 源、规划图、lock）是边界缺陷，按 §3 的实际影响分级，不能用低分级豁免修复。

### D2 Schema 与 AI-friendly

命名与结构先对照 `AGENTS.md` 的 Schema 规则；公共合同决策仍不明确时，查 [`2026-08-17-ai-first-lego-game-sdk-design.md`](../superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md) 的相关章节：

- 一个概念一个词；出现同义公共字段、provider 方言或要求 adapter 在两种叫法间翻译，即缺陷。
- 数值字段名必须自带单位与坐标域（`Meters` / `Seconds` / `Radians` / `Ratio` / `XYZ` / `XZ` 等）；靠 prose 解释单位的字段即缺陷。
- 判别器用法：持久定义用 `kind`，Command/Event/Change 用 `type`，互斥运行态用 `mode`；资源引用用 `...Ref`，本地引用带角色限定（`...EntityId` 等）。
- 优先闭合枚举与 discriminated union；用多个可选布尔拼组合状态即缺陷。
- 对受影响字段追踪 Schema、AI Profile、CLI、Browser、生成类型、examples、fixtures 与 Hash/Receipt 的适用消费者，核对同名同义及旧路径删除。迁移按 §1.1 逐项记录；抽查必须标出样本与未查范围。
- 检查诊断质量：失败必须返回稳定错误码与结构化定位（世界坐标 / 图像位置 / 资源 Ref），不允许裸 provider 报错穿透公共边界。

### D3 承诺与事实对拍

每次审查均核对范围内的承诺；不因本节存在而扩大用户指定范围：

- 对范围内 Catalog、联合类型、Registry、UI 的能力声明，逆向核对真正消费者及相应验证证据；Gameplay 声明必须落到 Runtime，不能只找到创作期代码。
- 分开报告设计完成、代码实现、生产交付与正式验收，不用一种状态替代另一种；涉及进度时以 `docs/18` 为唯一 live status authority。
- 核对直接相关 README、quickstart、规格中的声明；涉及状态声明时再核对 backlog，列出不一致项。
- PR / 文档中的验证声明必须核实：要求具体命令、exit code 与运行环境。写了「已验证」但给不出命令与输出的，按未验证处理。

### D4 单一权威状态

先建立受影响状态的 owner → 消费者映射；涉及 Runtime 时使用 `runtime-deep-review-checklist.md` 的 authority map。只检查适用的复发模式；无相关状态时说明不适用：

- 同一状态的第二推导路径：如 ground support 除 Havok support 查询外，另有 spawn 期独立 raycast 或地形高度采样参与判定。搜索所有对支撑、介质、朝向、时间的旁路推导。
- 同一字段两端语义不同：如一端写入世界绝对高度、另一端当作离地偏移再叠加地形高。对每个跨包传递的数值字段确认双方读写语义一致。
- 空间关系用包围盒近似冒充权威碰撞：如 `supported-by` 取 AABB 顶面而非实际 Collider 表面。
- 视觉层反向决定 Gameplay：从 Mesh 名、材质、颜色或动画 Clip 名推断可走、可游、姿态或接地，均为缺陷。

### D5 工程质量与可维护性

- 依赖复用：集合与对象操作用 `lodash-es` 具名导入，3D 数学用引擎 API；重造这两类轮子即缺陷。每个包的直接 import 必须出现在自己的 `package.json`。
- 相等判断使用 `===` / `!==`；判空用 `isNil` / `isEmpty`，不使用 `==` 与隐式转换。
- 确定性：对可信编译与 Runtime 的确定性合同，在相同冻结输入、Registry Lock、Seed 及合同要求的环境下核对产物、状态与 Hash，检查排序和时间/随机源泄漏。AI/图像生成核对实际输入、配置、产物冻结与可追溯性，不把重复调用模型必得相同内容作为默认门禁；生成物一旦成为冻结输入，下游仍必须遵守确定性合同。
- 测试分层与对抗性：unit/contract、runtime integration、browser gate 各证各的；检查是否只有对称、稳态的 happy path。对抗清单（非对称几何、非法输入、部分构造、throwing cleanup、双实例隔离、reset/rebind）见 runtime checklist §3。
- 失败路径：不允许静默钳制、静默降级或猜测；非法输入应在 Admission/Validation 阶段稳定失败。
- 面向 agent 的文件（SKILL、协议、prompt）以可执行指令为主；参数与版本引用其权威配置，不复制易漂移的值。合同明确冻结的值不能删成模糊建议。Skill 活源、冻结副本与实际加载内容按适用 drift gate 核对。

### D6 门禁与证据分层

- 每条结论标注证据层级：`static-read`（读代码）、`automated-contract`（测试/CLI）、`rendered-visual`（截图/像素）、`manual-interaction`（人工操作）。不得用低层证据冒充高层结论，例如用 smoke test 宣称生产支持。
- 协议 Hash、行为数值一致不能排除真实视觉退化。PNG 差异需核对相机、材质、光照、遮挡和渲染环境等相关输入，有证据才归为环境光栅差异；否则标「未解释的视觉差异」。不得为让审查通过而更新金标，也不把未经分类的像素差异自动设为生产阻断。
- 先记录调用工作流、请求范围、成功失败合同和指标作用，再核对 Profile 的具体测量/严格验收配置。只有适用合同明确的 Blocking Gate / 阻断型 Required Metric 才能一票否决，不能被总分抵消；「必须计算指标」不等于「指标未达标必须拒绝交付」。
- 当前普通生产入口固定 `executionPurpose: production`；`productionOutcome` 由请求范围内的历史等价必需阶段是否完成决定，`strictDiagnosticOutcome` 不覆盖它。不能由 Evaluation Profile、环境开关或新质量阈值把普通生产抬升为严格验收；明确请求的 `strict-acceptance` 才拥有相应严格阻断。不要恢复 `preview-ready / not-accepted` 作为已完成普通生产的另一套终态。
- 分别报告生产交付、严格验收与 advisory 诊断。有效质量报告的失败判定，不等同于必需产物缺失、格式损坏、身份失效、构建/Capture/原子发布失败；后者仍按请求范围的完整性合同处理。下游可选阶段失败不能覆写已完成上游产物的结果，但请求包含该阶段时顶层仍须等待该阶段成功。审查协议不能新增或豁免产品门禁；冲突应列为待决问题，不能凭审查偏好修改标准。
- 审查声明跑过的每条命令附 exit code；环境缺依赖导致未跑的门禁，明说「未跑及原因」，不得含糊为「应该能过」。

### D6.1 变更感知的门禁选择与证据复用

先建立「改动/结论 → 输入 → 门禁」映射，再运行命令。门禁数量不是审查质量指标；目标是让每项
受影响的承诺在最终树上得到一次足够强、可追溯且不改写被审对象的证据。

1. 运行验证前声明改动输入、失效证据、最小重跑集，以及是否为最终完整门禁检查点。先复用仍适用的证据；需补测时先选最窄回归，完整门禁仅在范围需要且未被有效证据覆盖时运行一次。代码只读审查不默认要求新测试，未跑项如实注明。
2. 同一树上，宽门禁已包含窄门禁时不重复执行；以当前 `package.json`、test census 与 CI workflow 核对覆盖关系，不在协议中冻结测试数量或 worker 配置。Coverage instrumentation 只在覆盖率声明或盲区诊断需要时运行，不作为聚合通过后的默认第二遍门禁。
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
7. 每组自动门禁结束后对照初始工作树检查新增修改；完成前对被审 diff 执行 `git diff --check`，区分原有问题与审查引入的问题。完成条件是未引入未授权的 tracked / untracked 修改，不要求用户工作树全局干净。范围内的用户改动可以是被审对象，不得为获得 clean result 删除或覆盖；获授权的报告写入单独列明。

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

默认在会话中输出；用户要求持久化时写 `docs/reviews/YYYY-MM-DD-<subject>-review.md`，明确要求 PR 评论时才发布。以下结构可按范围精简，findings 必须自包含，能被另一个审查者在不读本会话上下文的情况下复核。

每条 finding 使用固定结构：

```markdown
### [P0|P1|P2|P3] [D1-D6 维度] 标题

- 证据（<证据层级>）：被审树的源码/文档位置或命令输出；含路径与行号，未提交输入附可追溯标识
- 期望：正确行为及依据（规格文件 / AGENTS 规则 / 已核对的业界出处）
- 影响：触发条件、受影响对象与范围、严重性依据；区分已证实影响与推测
- 建议：最小修复方向（不自动实施）
- 复核：未复核 | 已被 <工具> 复核确认 | 复核后撤回（附原因）
- 跟踪（需后续工作时）：已有任务 ID，或待记录 ID / 建议责任方 / 所需证据；未落盘不得称已记录
```

按实际影响、触发条件与范围分级，不按命中的规则名称直接定级：

- P0：已证实的紧急严重问题，例如广泛不可用、不可恢复的数据破坏或信任边界失守。
- P1：在明确适用条件下破坏关键功能或合同，例如生产链路无法完成、错误接受/拒绝、权威状态冲突导致错误行为。
- P2：影响局部且可控的缺陷，或有具体风险依据的测试、维护与文档问题。
- P3：不改变行为的命名、风格或低风险可选改进；若命名实际导致协议误解或调用失败，按该影响升级。

规则违反仍需记录，证据不足时标出待验证假设，不能臆造 P0/P1。P0/P1 阻断被审变更的集成验收，P2/P3 可批处理或有依据地延期；这与产品对单个 Case 的成功失败判定不是同一层门禁。

报告固定包含四节：

1. **审查元数据**：模式、范围与排除项、checkout / 树输入标识、相关依赖版本、调用工作流/请求范围与成功失败合同、跑过的命令与 exit code。
2. **旧结论复验**：本次触及的既有 review 结论及其现状（成立 / 已失效）。
3. **Findings**：按 P0 → P3 排列；无发现只表示本次范围内未发现缺陷。
4. **覆盖与结论**：D1–D6 标「已查（全查/抽查范围）/ 未查（原因）/ 不适用（依据）」；迁移附 §1.1 表及未完成跟踪，说明证据层级、缺口和残余风险。

## 4. 完成标准

同时满足才算本次审查报告完成；未查项不算覆盖完成：

- 所选模式的每个必查维度都有明确状态，未查/抽查/不适用范围与原因可追溯；迁移缺口有逐项跟踪，不用维度勾选代替行为对齐。
- 每条 P0/P1 都有被审树的一手证据，不存在仅转抄旧审计的条目。
- 所有引擎语义断言标明「已对照安装版本」。
- 验证命令如实列出，含未跑项及原因。
- 报告可独立交给第二个模型做对抗复核，无需本会话上下文。

最终结论区分「审查报告完成」「声明范围内对齐已验证」「生产交付成功」「正式验收通过」。宣称对齐已验证必须有该范围逐项适配依据和相应证据，未决差异或证据缺口不能计为完成；生产与验收结果各按自己的合同判定。不得把本次未发现问题、任务已记录或一次 Case 通过表述为零遗漏保证。
