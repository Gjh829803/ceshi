# Workspace 结构与权威边界审查

## 1. 审查元数据

- 日期：2026-08-24
- 审查模式：**C（整仓审计）**，透镜是设计原则下的结构 / 权威 / 承诺对拍，不是一次功能实现评审
- 审查对象：`origin/main` 检出 `4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5`（`docs: map workspace package responsibilities`）
- 审查分支：`cursor/workspace-structure-audit-ad0d`
- 原则基准（冲突时以后者为准）：
  - `AGENTS.md`（AI Schema 一词一义、单一权威状态、P1.5 四 Profile、Agent 角色冻结、室外 heightfield 阶段边界）
  - [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)
  - [`docs/02-sdk-architecture.md`](../02-sdk-architecture.md) 分层与依赖方向
  - README Workspace Package Map（同 commit 新冻）
  - [`docs/reviews/runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)
  - [`docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md`](../superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md)
- 安装依赖（根 `package.json`，并与 `node_modules` 实测一致）：`@babylonjs/core` `9.21.2`、`@babylonjs/havok` `1.3.14`、Rapier `^0.19.3`、Three `^0.180.0`。`patches/` 只有 recast-navigation，Babylon 无补丁
- 引擎语义：Canonical 支撑路径先按仓库调用点与回归测试标记 `static-read`；对抗复核另开 `node_modules/@babylonjs/core@9.21.2` 核对了 `checkSupport` / `_castWithCollectors` / `_tryStepUp` / `physicsEngine._step`，见 §6
- 方法：只读核对当前树。2026-08-20 全量审计只作线索，每条引用都回当前源码复验。报告初稿之后又做了四路并行对抗复核（双栈 / 文档 / 包边界 / Runtime），§2–§3 已按宿主复验改过，不以 worker 原文为准

### 1.1 跑过的命令与 exit code

| 命令 | exit | 用途 |
|---|---:|---|
| `git fetch origin main && git pull --ff-only origin main` | 0 | 对齐审查对象 |
| `git rev-parse HEAD` | 0 | 记录 `4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5` |
| `ls packages apps sites docs/*.md` | 0 | 目录census |
| `rg WORLDKIT_BROWSER_PROTOCOL_VERSION` | 0 | 协议版本对拍 |
| `rg humanoid.g-bot.ground` | 0（无匹配） | 复验旧双 Definition |
| `rg Beta_Joints` | 0（无匹配） | 复验旧网格名断言 |
| `find packages -maxdepth 1 -type d` | 0 | 包地图 vs README |

**未跑及原因**（本审查是结构 / 权威审计，不是行为修复）：

- `pnpm typecheck` / `pnpm test` / `pnpm build`
- `pnpm verify:canonical` / `verify:g-bot-subject` / `verify:route-r1b-static-platform` 等全链路门禁

不得用本文件声称这些门禁在本 HEAD 通过。`docs/18` §3.4 的「2026-08-20 新鲜验证」数字也不得转抄为本审查证据。

### 1.2 当前结论

Canonical 分层方向仍然成立：Authoring → Compiler → ExecutionPlan → `runtime-babylon` / Havok，Route 走独立 V4/V5 + 可信 Host Evidence。P1.5 支撑路径在 Canonical 内收口到 `checkSupport()`；旧 P0「spawn Y 当偏移再加地形高」在本 HEAD **已失效**。

当前最大的结构问题不是包太多，而是 **三套「当前真相」还在同一棵树里并行**：

1. Canonical Babylon/Havok + Browser Protocol **V5**（代码与 `docs/18` 正文）
2. Legacy Three/Rapier Playground + `packages/core|physics|camera|animation|subjects`（`pnpm dev` 默认入口）
3. 编号文档 / 架构展示站仍写 Browser **V4**、R1b 未完成、Three.js/Rapier 已实现

没有确认到新的 Canonical **P0**（静默正确性 / 冻结边界被代码破坏）。开放项从 P1 起：公开合同口径分裂、Catalog 对水介质谎报 `implemented`、Playground 在 compile 前改 AuthoringSpec、Gameplay Snapshot 把 relationship 写死为 `none`。文档通道曾主张把 V4/V5、R1b/M5 口径漂移升为 P0；宿主保持 **P1**：那是公开合同 / onboarding 失败，不是同一字段两端静默不同语义。

**GO with findings**：可以继续在 Canonical 上做切片；在收口文档权威和默认入口之前，不适合把仓库表述成单栈 SDK。

## 2. 旧结论复验

对象：[`2026-08-20-sdk-full-audit.md`](2026-08-20-sdk-full-audit.md) 及其「已确认不再成立的旧问题」。

| 旧结论 | 本 HEAD 现状 |
|---|---|
| P0 Compiler 把 spawn Anchor Y 当离地偏移再加地形高 | **已失效**。`974:976:packages/compiler/src/compile.ts` 直接展开 `spawnAnchor.transform.positionMetersXYZ` |
| 非受控 + `medium===ground` 永久悬空；`renderFrame` 用假 `1/60` 推 Camera；rAF=1 tick | **仍不成立（已复验）**。`1230:1244:packages/runtime-babylon/src/babylon-world-runtime.ts` 的 `renderFrame()` 只 `applyAnimationPose` + `scene.render` |
| P1-1 两套 G Bot Definition（`humanoid.g-bot@1` vs `.ground@1`） | **已失效**。全树 `humanoid.g-bot.ground` 零匹配；产品路径统一 `worldkit://subject-definition/humanoid.g-bot@1` |
| P1-2 25 元动作联合类型 vs resolver 只选 4 个 | **仍成立**。见本文件 P1-4 |
| P1-3 solved spawn 朝向被丢掉 / `yawRadians = 0` | **部分失效**。Compiler 现写 `spawnSubjectFacingRadians`（`977:978:packages/compiler/src/compile.ts`）；`motion-kernel-runtime.ts` 用它初始化 yaw。`forwardDirection` 仍写死 `"-z"` |
| P1-4 Playground compile 前改 AuthoringSpec | **仍成立**。见本文件 P1-5 |
| P1-5 Catalog `implemented` 无运行时消费者 | **部分失效 / 部分成立**。Seat/Tether catalog 已标 `reserved`；`velocity-chase` 现有算法分支；水介质与 `parameterSchemaRef` 仍谎报。见 P1-3 |
| P1-6 G Bot `Beta_Joints` 当正式网格 | **未能复验**。当前树文本无 `Beta_Joints`/`Beta_Surface`。Socket 仍按名字排序取 `affectedMeshes[0]`，风险保留为 P2，不以旧二进制结论当现行 P0 |
| P1-7 Outdoor spawn 不校验水 / 地标 | **作为编译缺陷已失效**。`validateCompiledSpawnFootprintsV3` 与 `compileOutdoorScene` 已查 blocked water / static blocker。`scenes.test.ts` 仍不把 water/landmark 传给 `validateSpawnSafety`，降为 P2 测试洞 |
| P1-8 `bindControl` 把前一主体 `stop()` | **仍成立**。见 P1-6 |
| P1-10 playground 未声明 `subject-registry` | **已失效**。`apps/playground/package.json` 已列入该依赖 |
| 支撑第二路径：spawn 期独立 raycast 伪造 ground | **Canonical 路径已失效**。`p15-runtime-debt-repro.test.ts` 断言 kernel 源码不含 `physicsEngine.raycast` / `initialGroundSupportPending`。**Legacy 支撑不是 raycast**：`178:178:packages/subjects/src/rapier-humanoid-motor.ts` 用 Rapier `computedGrounded()`。`packages/physics` 的 `raycast` 只给相机避障，见 P1 双入口 |

## 3. Findings

按 P0 → P2。证据层级未另行说明时均为 `static-read`。

### 当前无开放 P0

本 HEAD 未复现 Canonical 管线上的静默正确性错误或冻结边界被代码破坏。旧 P0 spawn 双加高度已关闭。下列双栈 / 文档分裂会误导 Agent，但走错入口时物理后端是显式分叉，不是同一字段两端静默不同语义。

---

### [P1] [D3] 公开接入文档与代码协议版本分裂：文档写 Browser V4，运行时是 V5

- 证据（static-read）：
  - 代码：`354:365:packages/runtime-contracts/src/runtime-session.ts` 导出 `WORLDKIT_BROWSER_PROTOCOL_VERSION = 5` 与 `WorldkitBrowserApiV5`
  - 进度权威：`docs/18` 正文写 Browser Protocol V5 clean break、不保留并行 V4 alias
  - 接入文档仍写 V4：`1:20:docs/17-canonical-json-quickstart.md` 标题与链路图；`376:415:docs/17-canonical-json-quickstart.md` 章节名「Browser Protocol V4」，示例却是 `interface WorldkitBrowserApiV5 { version: 4; ... }`
  - `64:64:docs/02-sdk-architecture.md` 架构图节点 `Browser Protocol V4`
  - `67:78:docs/00-project-overview.md` 仍写 Browser Protocol V4
  - `15:15:docs/05-mvp-roadmap.md` 写 Browser Protocol 已升级至 V4
- 期望：Canonical Schema、CLI、Browser Protocol、examples、文档同一公开名字与版本。未发布协议允许 clean break，但必须整面一起改，不能类型名 V5、字段 `version: 4`、章节名 V4 并存
- 影响：Agent / 外部集成按 quickstart 实现 `version === 4` 会与运行时 `5` 对不上；审查记录与计划里的 `WorldkitBrowserApiV4` 会被当成现行合同
- 建议：以 `runtime-session.ts` 为唯一版本源，一次性改 `00` / `02` / `05` / `17` 标题、链路图、示例 `version: 5`；历史计划/审查标明「当时基线」，不再当接入指南
- 复核：未复核

### [P1] [D3] `docs/00` / `05` / `17` 仍写 R1b 与 M5 开放，进度权威已关闭

- 证据（static-read）：
  - `16:19:docs/18-refactor-progress-and-backlog.md`：Route R1 Heightfield 与 R1b Static Platform 已完成，M5 已关闭；`package.json` 已有 `verify:route-r1b-static-platform`
  - `47:55:docs/00-project-overview.md`、`102:105:docs/00-project-overview.md`、`25:28:docs/17-canonical-json-quickstart.md`、`17:17:docs/05-mvp-roadmap.md` 仍写 R1b / 完整 M5 开放
  - `docs/00` 阅读顺序第 2 条仍指向 `docs/10-current-experiments.md`（文内状态日期 2026-08-20，启动命令是 `pnpm dev`，实验 9 仍写 Authoring V2）
  - README「验证」与 `docs/17` 最短路径列出 `verify:route-r0-contract` / `verify:route-r1-heightfield`，都没有 `verify:route-r1b-static-platform`
- 期望：进度只认 `docs/18`；编号总览与 quickstart 必须同步，不能让 Agent 把已关门禁当成缺口去「实现」
- 影响：重复开工、错误的 capability gap 报告、和真实 `examples/traversal/r1b-static-platform/` 打架
- 建议：`00` / `05` / `17` 的进度横幅改为引用 `docs/18` 一句，删除本地过期副本
- 复核：未复核

### [P1] [D3] 进度权威自己的「新鲜验证」已过期，且与同文 V5 口径矛盾

- 证据（static-read）：`136:141:docs/18-refactor-progress-and-backlog.md` 仍写「2026-08-20 的新鲜验证」：`pnpm test` 49 文件 / 441 项、`verify:canonical` 的 Browser Protocol **3**。同文 §1 / §3.4 已声明 Browser Protocol **V5**。本树 `packages/**/*.test.ts` 已远超 49 个文件
- 期望：权威 backlog 里的验证数字要么更新并标注日期，要么降级为历史附录；禁止和同文现行协议版本并存
- 影响：后续审查会把过期数字当现行门禁基线
- 建议：把 §3.4 的 2026-08-20 块移到「历史证据」，现行证据只保留能复跑的命令名，不写过期计数
- 复核：未复核

### [P1] [D1/D4] 默认 Playground 入口仍是 Three/Rapier 世界真相，Canonical 要靠 `?authoring=1`

- 证据（static-read）：
  - `9:10:package.json`：`dev` → playground Vite；`dev:g-bot` → `worldkit run` Canonical
  - `1668:1760:apps/playground/src/main.ts`：`authoring=1` 走 `babylon-world-adapter`；否则 `SdkWorldAdapter.create(resolveScene(...))`
  - `1:36:apps/playground/src/sdk-world-adapter.ts` 依赖 `@whitebox-world/core`、`physics`、`subjects`、`three`
  - Legacy 支撑权威：`178:178:packages/subjects/src/rapier-humanoid-motor.ts` 在 `computeColliderMovement` 之后读 `this.controller.computedGrounded()`
  - Legacy `physics.raycast`（内部 `castRayAndGetNormal`）只给第三人称相机避障：`373:378:apps/playground/src/sdk-world-adapter.ts`。这与 Canonical `camera-director.ts` 的 `scene.pickWithRay` 同位，**不是** grounding
  - Canonical 支撑权威：`481:481:packages/runtime-babylon/src/motion-kernel-runtime.ts` 的 `physicsController.checkSupport(...)`
  - `docs/03-agent-facing-api.md` 仍把 Outdoor Scene DSL + Three.js/Rapier 写成「当前 Alpha 的可运行入口」；`docs/07` 虽标明 Legacy，链接文案仍是「Canonical Authoring V2 快速接入」
  - 同一 UI：`startPlayground()` 不区分两套 adapter 的状态语义
- 期望：每块状态一个权威。产品 G Bot / Canonical 入口不得与 Rapier 角色控制器共享默认 `dev` 脚本名。AGENTS.md 已禁止 `pnpm dev` + `?authoring=1`
- 影响：Agent 跑 `pnpm dev` 会看到另一套物理、相机、动作机，却以为在验 Canonical；审查/手感结论会串栈。初稿曾把 Legacy grounding 误写成 `packages/physics` raycast，对抗复核已改正；双入口问题本身仍在
- 建议：不并包。把 Legacy 场景迁到显式命令（例如 `dev:legacy`），根 `dev` 指向 Canonical；或拆 app。在拆开之前，Playground 顶栏必须写死当前物理后端，不能只显示 adapter 名
- 复核：未复核

### [P1] [D3] Motion Catalog 把水介质标成 `implemented`，Compiler 对 published `water` 介质关闭

- 证据（static-read）：
  - `10:17:assets/registry/motion-kernels/catalog.json`：`K01.free-ground` 的 `supportedMediums` 含 `"water"`，`runtimeStatus: "implemented"`
  - `113:127:assets/registry/motion-kernels/catalog.json`：`K06.water-surface` 仅 `"water"`，同样 `implemented`
  - `63:68:packages/compiler/src/compile.ts`：`assertPublishedMovementMediumSupported("water")` 抛 `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED`
  - `651:656:packages/runtime-babylon/src/p15-conformance.test.ts` 锁定该拒绝
  - `245:245:packages/runtime-contracts/src/execution-plan.ts`：`ExecutionMovementMediumV1` 仍含 `"water"`
  - Playground UI 仍展示水面 kernel：`402:402:apps/playground/src/main.ts`
- 期望：P1.5 冻结第一片不发布 `movementMedium: "water"`。Catalog `implemented` 必须等于运行时真正消费且允许发布的能力；水切片属 P2.5，应为 `reserved` / `experimental` 且编译期与 UI 一致失败
- 影响：AI / 调控台会选 Kayak / water-surface，以为能力已交付；真正 compile/runtime 拒发 water medium，形成「UI 能选、协议有枚举、发布被拒」三层方言
- 建议：Catalog 与 `ExecutionMovementMediumV1` 跟 P1.5 对齐；Playground 能力包对未发布 medium 走稳定失败，而不是 overlay 改 spawn
- 复核：未复核

### [P1] [D3] `parameterSchemaRef` 指向不存在的 Registry 资源，kernel 仍列出 Feel 域速度参数

- 证据（static-read）：catalog 多项 `parameterSchemaRef: "worldkit://motion-parameter-schema/free-ground@1"` 等；仓库内该 kind 的资源目录 **不存在**。`K01.runtimeParameterNames` 仍含 `walkSpeedMetersPerSecond` 等。P1.5 规定速度在 control-feel-profile，不在 Motion 参数袋
- 期望：资源引用必须能在 Registry 解析；公开参数名必须落在已冻 Profile，禁止 Motion bag 回流
- 影响：AI 按 `parameterSchemaRef` 找 schema 会空；调 kernel 速度字段与 Feel 权威打架
- 建议：删掉空 Ref，或补真实 schema 资源且只描述 kernel 允许的非速度字段
- 复核：未复核

### [P1] [D4] Snapshot / Camera sample 把 `relationshipRole` 写死为 `none`

- 证据（static-read）：
  - `1049:1049:packages/runtime-babylon/src/babylon-world-runtime.ts`
  - `1309:1309:packages/runtime-babylon/src/babylon-world-runtime.ts`
  - Camera 规则已能匹配 role：`101:104:packages/runtime-babylon/src/camera-director.ts`
  - 关系 catalog 已诚实标 `reserved`（如 `6:8:assets/registry/relationship-profiles/catalog.json`）
- 期望：未实现的 Relationship 不得出现在可观察 Snapshot 里假装有角色；要么省略字段，要么显式 `unavailable`。Camera Context 的 rider/driver 规则在 role 恒为 `none` 时永假，不能当成已接线
- 影响：后续 Kit/座椅切片会误以为 Snapshot 已有关系面；mounted 相机规则看起来「实现了」却选不上
- 建议：Snapshot 在无关系运行时不发布 role，或发布 `none` 且 Camera catalog 的 mounted 规则标 reserved
- 复核：未复核

### [P1] [D3] 地面人型动作合同 25 元，解析器只返回 idle/walk/run/jump

- 证据（static-read）：
  - `1:26:packages/subject-actions/src/types.ts` 与 `111:136:packages/runtime-contracts/src/execution-plan.ts` 含 `dance.rumba`、`swim.surface`、`fall` 等
  - `6:20:packages/subject-actions/src/ground-humanoid-action-resolver.ts` 只分支 air→`jump`，否则 idle/walk/run
- 期望：Catalog / 联合类型列出的每一项都有运行时消费者，或降为非公开产品清单。通用地面人型表不应被单一 Mixamo 产品清单污染
- 影响：加载与校验按 25 个 clip 付费；`fall` / 游泳 clip 永不被选；下一个没有 rumba 的角色会和联合类型冲突
- 建议：公开 `GroundHumanoidActionIdV1` 收到当前 resolver 闭集；其余 clip 留在产品 AnimationSet 的非公开清单
- 复核：未复核

### [P1] [D1] Playground 在 Compiler 之前改 AuthoringSpec（预算、定义、spawn）

- 证据（static-read）：`213:391:apps/playground/src/authoring-loader.ts` 的 `applyCapabilityDemoContext`：抬 `resourceBudget`、替换 `subjectDefinitionRef`、按 water-surface / unpowered-glide 改 spawn。CLI `worldkit build` 不走这条路径
- 期望：页面不补写 AI 意图。演示 overlay 若必须存在，应是显式 Host 诊断，且 CLI 与页面同一输入得到同一 IR
- 影响：同一 JSON 在 Playground 与 CLI 行为不同；G Bot 能在小世界预算里「演示通过」
- 建议：去掉静默 mutation；演示世界用独立 Authoring fixture；overlay 只出现在 `hostOverlay` 诊断通道
- 复核：未复核

### [P1] [D4] `bindControl` 仍无条件 `stop()` 前一主体并写 idle 动画

- 证据（static-read）：`878:881:packages/runtime-babylon/src/babylon-world-runtime.ts`
- 期望：控制权切换不得篡改未控主体的物理轨迹；动画必须跟 `movementMedium` / action resolver，不能直接写 `"idle"`
- 影响：空中切人会掐断跳跃弧，并造成 medium=air 与 action=idle 分裂
- 建议：rebind 只换 controlledEntityId 与输入；补「跳中 rebind」回归后再改
- 复核：未复核

### [P1] [D1] README 把未进本树的 G19 包画进现行 Workspace Map；`sites/` 与架构站是另一套产品叙事

- 证据（static-read）：
  - README 表含 `packages/gameplay-contracts/`、`packages/gameplay/`、`packages/runtime-host/`，并写「位于 G19 集成分支」。本树 `packages/` 无这三项；`pnpm-workspace.yaml` 只有 `packages/*` 与 `apps/*`
  - `sites/world-sdk-blueprint/` 是 vinext/Cloudflare starter（自带 `package-lock.json`、D1/Drizzle、ChatGPT 站点 auth），不在 pnpm workspace 内
  - `apps/architecture/src/main.ts` 把「已经实现」写成 Rapier、SubjectKit、Three 叙事（约 388:396 行），并说 Agent 不直接操作 Three.js/Rapier
- 期望：现行包图只列本树存在的包。展示站要么跟 Canonical 口径，要么标明 Legacy Alpha 历史稿。无关 starter 不应与 SDK 源码同库
- 影响：Agent 会去找 `packages/gameplay`；架构站会把 Three/Rapier 说成当前底座
- 建议：G19 三包从现行表移到「分支预告」。`sites/world-sdk-blueprint` 移出或改成明确的独立站点工程并更新 pnpm workspace。架构站状态列改成 Babylon/Havok Canonical
- 复核：未复核

---

### [P2] [D5] `packages/world` 同时承担 Canonical Authoring 投影与 Three 场景 DSL，barrel 把 `three` 拉进 Route 门禁

- 证据：`packages/world/package.json` 直接依赖 `three` 与 `@whitebox-world/authoring`。`12:12:packages/world/src/index.ts` `export * from "./terrain"`，而 `terrain.ts` 顶行 `import { BufferAttribute, BufferGeometry } from "three"`。`scripts/verify-route-r0-contract.ts` 与 `verify-route-r1-heightfield.ts` 从 `@whitebox-world/world` 取 `projectPlannedRouteToCanonicalRouteV1`，会评估整个 barrel
- 期望：AI/场景作者入口与 Canonical Route 投影不依赖 Provider。Three 类型应停在 Legacy adapter
- 建议：barrel 不要再 `export *` 带 Three 的 terrain；Plan-first DSL 与 Canonical 投影拆出口，或把网格构建迁出 `world`
- 复核：已复验 import 图；未跑打包分析证明 three 进入最终产物

### [P2] [D5] Legacy 包群仍全量进 workspace；`camera` / `animation` 是活代码，但 `subjects` 用相对路径跨包引用

- 证据：根 `package.json` 同时依赖 `@babylonjs/core`、`@babylonjs/havok`、`@dimforge/rapier3d-compat`、`three`。`packages/subjects/package.json` 声明了 `@whitebox-world/camera` / `animation`，源码却走 `../../camera/src/index.js` 与 `../../animation/src/index.js`（`14:23:packages/subjects/src/humanoid-third-person-subject-kit.ts`）。全树没有 `from "@whitebox-world/camera"` / `animation` 的包名导入。对抗复核曾把这两包判成死包，宿主复验后驳回
- 期望：`docs/18` 「生产 Gate、默认切换与旧实现退出」完成前，旧包必须标明 `legacy`，不能出现在 Canonical 依赖图。跨包必须走 package export，禁止相对路径穿透
- 建议：给 Legacy 包 `package.json` 加明确 description；Canonical 包禁止新增对这些包的引用；`subjects` 改为包名导入或内联，去掉无效 workspace 声明
- 复核：已复验 `subjects` 相对导入；未跑 bundler 证明声明依赖可删

### [P2] [D2] 未发布的 Authoring V2 迁移代码仍留在包内

- 证据：`packages/authoring/src/migrate-v2-to-v3.ts` 仍接受 `schemaVersion: 2`。`packages/authoring/src/index.ts` 未导出该函数。`docs/07-alpha-implementation.md:5` 仍链接「Canonical Authoring V2 快速接入」
- 期望：未发布旧版本应删除，不靠迁移养第二方言；文档不得指向 V2
- 建议：迁移文件降为测试夹具或删除；改 `docs/07` 链接到 `docs/17`
- 复核：未复核

### [P2] [D3] Outdoor 场景测试仍不覆盖 compile 已有的水 / 地标 spawn 门禁

- 证据：`compileOutdoorScene` 会传 `waterSurfaces` / `staticBlockingObjects`（`598:608:packages/world/src/scene.ts`），但 `44:58:apps/playground/src/scenes/scenes.test.ts` 只传 `ground`
- 期望：测试与编译器执行同一条 spawn 合同
- 建议：测试改为断言 `scene.diagnostics`，或把同一 water/blocker 列表传入 `validateSpawnSafety`
- 复核：未复核

### [P2] [D5] Bone socket 仍按 mesh 名排序取 `[0]`

- 证据：`381:413:packages/runtime-babylon/src/subject-visual.ts`。旧审计的 `Beta_Joints` 名未能在本树文本复现，故不升级为 P0
- 期望：socket 附着在产品表面 mesh / Rig Profile 声明的 mesh，而不是字典序第一
- 建议：Rig Profile 增加 affected mesh id；禁止无名排序
- 复核：未复核

### [P2] [D5] 文档语料双轨：编号 00–19 与 `docs/superpowers/specs|plans|reviews`

- 证据：`docs/` 顶层 20 篇编号文 + 23 specs + 16 plans + 31 reviews。编号文仍承担总览，但多篇进度句未跟上 `docs/18`
- 期望：现行能力只从 `00`（校准后）+ `17` + `18` + 冻结 spec 进入；审查/计划是证据，不是第二套总览
- 建议：给编号文档加「权威 / Legacy / 历史」页眉；不要把 reviews 当 onboarding
- 复核：未复核

### [P2] [D5] Compiler / World 生产依赖 `testkit`，与 README 包图冲突

- 证据：README Workspace Map 写 `packages/testkit/`「仅测试/门禁」，明确禁止「被生产 Runtime 依赖为业务实现」。`packages/compiler/package.json` 与 `packages/world/package.json` 都把 `@whitebox-world/testkit` 列为 `dependencies`。`compile.ts` 与 `scene.ts` 生产路径调用 `validateSpawnSafety`
- 期望：Spawn Safety 若是编译合同，应住在 compiler/world/validation，而不是名叫 testkit 的包被生产依赖
- 影响：Agent 按 README 会以为 testkit 可删或可随意改测试辅助；改 `validateSpawnSafety` 会改 Canonical compile
- 建议：把 `validateSpawnSafety` 迁到真正的合同包，或改 README 承认它是编译门禁实现。不要为了目录好看把校验逻辑复制一份
- 复核：已复验 package.json 与 import；未评估迁包成本

### [P2] [D2] Plan-first Opening Shot 相机字段仍是无单位方言

- 证据：`141:147:packages/world/src/world-spec.ts` 的 `OpeningShotSpec.camera` 用 `distance` / `targetHeight`。Canonical Authoring / ExecutionPlan 已是 `distanceMeters` / `targetHeightMeters`（`packages/authoring/src/types.ts`、`packages/runtime-contracts/src/execution-plan.ts`）。`docs/03` 示例同样写 `distance: 4.5`
- 期望：AI 可见 Schema 一词一义，单位进字段名。Plan-first 与 Canonical 不得让 adapter 翻译两种相机方言
- 建议：Plan-first 相机字段改成带单位名，并改 `docs/03` 示例。这是未发布 DSL 的 clean break，不要加永久 alias
- 复核：已复验类型字段；未查全部场景 plan 字面量

### [P2] [D3] README 能力表把已接线的 Camera Director 写进「尚未交付」

- 证据：README「当前能力与后续边界」把「Camera Director 和多 Rig 切换」放在尚未交付列；同表已交付列写「第三人称跟随」。运行时已有 `CameraDirectorV1`（`136:136:packages/runtime-babylon/src/camera-director.ts`），Workspace Map 也把 Camera Director 写进 `runtime-babylon` 职责。未交付的是第一人称 / 飞行 / 车辆 / 多 Rig，不是 Director 类本身
- 期望：已接线的运行时权威用现行名字；未交付的是多 Rig 与非第三人称，不要把 Director 说成没做
- 建议：尚未交付列改成「第一人称、飞行/车辆 Rig、多 Rig 切换」；Camera Director 留在已交付或 Workspace Map
- 复核：已复验 README 与类名；不把这句升 P1（原句把 Director 和多 Rig 捆在一起，存在合理解读）

### [P2] [D6] `scripts/verify-*.ts` 与 `packages/validation` 编排重叠，但是门禁资产不是垃圾

- 证据：根脚本有 canonical / g-bot / placement / capture / r0 / r1 / r1b 等多条 verify；`packages/validation` 已有 route evaluator / evidence publication。重复的是 Host 编排，不是第二套 Route 语义
- 期望：CLI 入口稳定；领域判定留在 validation 包。不要求为「目录好看」合并脚本
- 建议：维持现状，直到默认栈切换完成后再收 CLI 表面
- 复核：未复核

## 4. 维度覆盖表

| 维度 | 状态 | 说明 |
|---|---|---|
| D1 定位与需求边界 | 已查 | 室外 heightfield 边界仍在 AGENTS/`docs/18`。越界点是架构站 / vinext starter / G19 包预告混进现行地图，不是把室内做成生产特性 |
| D2 Schema 与 AI-friendly | 已查 | 公开协议版本名分裂（V4/V5）；`ExecutionMovementMediumV1` 仍含 water；动作联合类型过宽；Plan-first Opening Shot 仍用 `distance` / `targetHeight`。未做全字段单位普查 |
| D3 承诺与事实 | 已查 | 文档 R1b/M5、Browser V4、Catalog water/`parameterSchemaRef`、25 clip、docs/18 过期验证数字、README 验证列表漏 R1b、README 把 Camera Director 捆进尚未交付 |
| D4 单一权威状态 | 已查 | Canonical：ground → `checkSupport`；camera boom 射线只用于碰撞缩短（`891:917:packages/runtime-babylon/src/camera-director.ts`），**不是** grounding。Legacy 支撑是 Rapier `computedGrounded()`，其 `physics.raycast` 只给相机避障。`relationshipRole` 恒 `none`。`bindControl` stop。Playground 改 AuthoringSpec |
| D5 工程质量 | 已查 | `world` barrel 把 three 拉进 Route 门禁；compiler/world 生产依赖 testkit；`subjects` 相对路径引用 camera/animation；根同时锁 Babylon+Rapier+Three；V2 migrate 残留。未做全仓 `==` 扫描，不声称 D5 风格干净 |
| D6 门禁与证据分层 | 已查（部分） | 标明本审查未跑 typecheck/test/verify。发现权威文档把 2026-08-20 计数当新鲜证据。未声称生产支持新能力 |

Runtime checklist 条目：权威表已写（support / medium / facing / camera / action / time）。`checkSupport` 的 slope 公式与 `_castWithCollectors` 三参调用已对照 `@babylonjs/core@9.21.2` 安装源（见 §6）；Havok 插件内部接触流形布局未再拆 WASM。对抗性几何 / 30/60/120 Hz **未**在本审查重跑。

## 5. 规整优先级（建议，本分支不实施）

只动「当前真相」口径，不并 Canonical 包、不改冻结 Runtime 合同。

| 档 | 动作 | 不做什么 |
|---|---|---|
| A 文档收口 | 以代码 V5 与 `docs/18` 进度为准，改 `00/02/03/05/07/10/17` 与架构站状态列；docs/18 历史验证降级；README 验证列表补 R1b；Camera Director 从「尚未交付」解开 | 不改 Schema 字段；不把文档漂移静默升 P0 |
| B 入口分清 | `pnpm dev` 不再默默进 Rapier；Playground 顶栏写死后端 | 不删除 Legacy 包（退出要单独门禁） |
| C Catalog 诚实 | water kernel / medium 枚举 / 空 `parameterSchemaRef` / 25 clip 联合类型与运行时闭集对齐 | 不借机做 P2.5 水介质实现 |
| D 树边界 | G19 包移出现行地图；处理 `sites/world-sdk-blueprint`；`world` barrel 去掉 Three；Spawn Safety 迁出 testkit；Plan-first 相机字段补单位名 | 不把 gameplay 提前合进 `runtime-babylon` |

**明确不要做的「规整」：** 合并 `authoring`/`compiler`/`runtime-contracts`/`runtime-babylon`；把 Recast 类型抬进 AI Schema；为了目录扁平化拆正在关门的 Route 包；因为 `subjects` 用了相对导入就把 `camera`/`animation` 当死包删掉。

## 6. 对抗复核补记

四路只读审计完成后，宿主按源码复验，采纳 / 驳回如下。worker 原文不当现行结论。

| 主张 | 宿主处置 |
|---|---|
| Canonical ground / medium / facing / camera lane / `renderFrame` 不推进 tick | **采纳**。支撑只走 `checkSupport()`；published medium 闭合 `ground \| air`；`yawRadians` 只在 motion kernel 写；preview tuning 不进 `controlFrame()`；`renderFrame()` 只 pose + render |
| 安装源 `checkSupport` 用归一化 gravity 的 `velocity.dot(direction)` 判 SLIDING；`_castWithCollectors` 三参安全；`DYNAMIC_PHYSICS_MOTION_TYPE = 2` 等于安装枚举 | **采纳为升级假设点**，P3 维护项，不是现行 bug。`snapDownToWalkableSupport` 的 shape cast 是下台阶重定位，不是第二套 grounded 判定 |
| 旧 P0 spawn Anchor Y 双加高度、pending 永不清、假 1/60 推相机、水域上界 +2、rAF=1 tick | **仍不成立**，与 §2 一致 |
| Legacy grounding 是 `packages/physics` raycast | **驳回**。是 `computedGrounded()`；raycast 只给相机。初稿 P1 双入口与 D4 表已改 |
| `packages/camera` / `animation` 是死包 | **驳回**。`subjects` 用相对路径消费它们。保留为「跨包相对导入 + 包名依赖未使用」P2 |
| `world` barrel 把 `three` 拉进 Route verify | **采纳**，并入现有 `world` P2 |
| compiler/world 生产依赖 testkit | **采纳**，新增 P2。与 README「仅测试/门禁」冲突 |
| Plan-first `distance` / `targetHeight` 对 Canonical `...Meters` | **采纳**，新增 P2 |
| `ExecutionMovementMediumV1` 仍含运行时不可达的 `"water"` | **已在** Catalog 水介质 P1 证据里；相机规则写 `"water"` 永假，不是权威分裂 |
| 文档 V4/V5、R1b/M5 应标 P0 | **不采纳升格**。公开合同 / onboarding 失败，走错入口时后端是显式分叉。保持 P1 |
| `docs/03` / `docs/10` / README 漏 R1b / Camera Director 文案 | **采纳为补充证据或 P2**，不新开 Canonical P0 |

本补记仍是 static-read。未跑 `pnpm test` / `verify:*`，不得把 §3.4 的 2026-08-20 数字当本 HEAD 证据。
