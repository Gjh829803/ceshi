# Workspace 结构与权威边界审查

> 状态：**Current review evidence / non-authoritative**
>
> 当前审查对象：`origin/main@01ee4b9dd403dcc3f05b59ec29d7dbd8e5b17f10`
>
> 开发分支：`cursor/workspace-structure-audit-ad0d`；最新 `main` 合并提交：`380a13b`
>
> 用途：记录当前代码树的结构、公共 owner、事实源、Workspace 与门禁边界；不替代
> Canonical Schema、冻结 Spec、`AGENTS.md`、正式 Gameplay 合同或可复跑的交付证据。
>
> 结论：**GO with findings**。基础分层相较初审显著收敛，未确认 P0；仍有 8 组 P1
> 和 5 组 P2，优先事项是修当前权威/发布断链、唯一 owner 和只读门禁，而不是继续删包。

## 1. 审查元数据与判断口径

- 日期：2026-08-25。
- 模式：[`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) 的 **C（整仓审计）**，覆盖 D1–D6；Runtime 相关判断继续受
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md) 约束。
- Draft PR：[#27](https://github.com/seedleap/agent-whitebox-world-sdk/pull/27)。
- 历史输入：Cursor 原始报告 `c924b37`、对抗修订 `1b8487b`、Codex 修订
  `ed86a68`，以及用户提供的 ChatGPT Gameplay/RuntimeHost 分析。
- 原审查基线是 `main@4ae1912`。本轮不是 rebase 后沿用旧结论，而是把
  `4ae1912..01ee4b9` 的 135 个 main-side commits 作为语义迁移重新审查。
- 本 PR 仍只修改本报告。工作区已有的未跟踪 `.codex/tmp/` 保持原样，不读取其内容作为
  当前结论，不纳入提交。

### 1.1 Authority hierarchy

| 作用域 | 当前权威 | 约束 |
|---|---|---|
| 仓库流程、阶段边界、命名规则 | `AGENTS.md` | README、计划和 review 不能覆盖 |
| 已冻结公共合同 | 对应 Frozen Spec + Canonical Schema + conformance test | 不能由示例、UI 或 Adapter 猜测 |
| Gameplay 对接 | [`docs/20-gameplay-integration-contract.md`](../20-gameplay-integration-contract.md) + 导出 exact types | 文档若与 Browser/Host 实现冲突，必须在同一变更中修正 |
| 当前能力与 Backlog | [`docs/00-project-overview.md`](../00-project-overview.md) 与 [`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md)，并由当前代码和新鲜 gate 佐证 | 带日期的旧计数只是历史证据 |
| Onboarding | README 与 [`docs/17-canonical-json-quickstart.md`](../17-canonical-json-quickstart.md) | 应从上述事实派生，不另持有版本/里程碑真相 |
| 历史证据 | `docs/reviews/**`、`docs/superpowers/plans/**` | 不拥有当前完成状态；本文也属于此类 |

### 1.2 相对旧基线的实质变化

当前 `main` 已经完成三项会改变旧审查结论的架构迁移：

1. G19 Gameplay Contracts、Gameplay、RuntimeHost、Babylon transactional port、Browser V5
   与 World/View/Runtime projection 已进入当前生产树；
2. 未发布旧 major 已 clean break，Authoring/Compiler 当前入口分别为
   `normalizeAuthoringSpecV4` 和 `compileWorldV5`；
3. `01ee4b9` 删除 Three/Rapier Legacy cluster、`SdkWorldAdapter` 和旧
   `core/physics/subjects/animation` packages，`pnpm dev` 现在是 Babylon-backed catalog
   Playground，`worldkit run` 才是 Canonical Authoring Runtime。

因此，旧报告中的“Gameplay 仅是 later context”“Canonical/Legacy 双 Runtime”“World barrel
加载 Three”和“无版本 facade 绑定旧 major”都不能继续作为当前 finding。

## 2. 新鲜执行证据与限制

| 命令 / 检查 | 结果 | 当前解释 |
|---|---:|---|
| `git fetch origin main cursor/workspace-structure-audit-ad0d` | 0 | 锁定远端 `main@01ee4b9` 与审查分支 |
| `git merge-tree --write-tree cursor/workspace-structure-audit-ad0d origin/main` | 0 | 预演无文本冲突 |
| `git merge --no-edit origin/main` | 0 | 生成 `380a13b`；未覆盖未跟踪文件 |
| Workspace manifest 生产依赖 DAG census | 0 cycles | 25 个 package/app manifest 未发现生产环；分层方向成立 |
| `pnpm typecheck` | 0 | 当前根 TypeScript gate 通过 |
| `pnpm build` | 0 | Babylon-backed catalog Playground 生产构建通过；仅有既存 chunk-size warning |
| `pnpm why three -r` / `pnpm why @dimforge/rapier3d-compat -r` | 0 / empty | Workspace 已无 Three/Rapier dependency owner |
| `pnpm test` | 1 | 179/180 files、2193/2194 tests 通过；唯一失败是 Subject Preset promotion 的 20 秒超时 |
| 聚焦重跑上述 Subject Preset 用例，single worker | 0 | 1 passed / 20 skipped，16.96 秒；表明是全量预算/竞争问题，不是稳定语义失败 |
| 全量中的 Route real fixture 与 Browser Host integration | 0 | 分别约 166 秒和 98 秒；旧报告的两项超时已关闭 |
| `pnpm worldkit registry describe --resource-ref worldkit://control-feel-profile/humanoid.medium-ground@1 --json` | 2 | 现行 Capability 资源仍被 CLI 误报 not found |
| Registry 全视图对 `MotionKernel.parameterSchemaRef` census | 10/10 dangling | 所有公开参数 Schema Ref 均无法在 Registry 资源集合解析 |
| `node --test --test-name-pattern "keeps the blueprint wrapper" tests/rendered-html.test.mjs`（Site 目录） | 1 | `public/legacy/index.html` 已删除，Site 测试稳定 ENOENT |
| Cursor fresh final review `latest-main-01ee4b9` | `FINAL GO` | 只读独立复核返回 `No findings`；Host 仍以本表可复跑证据而非 reviewer 权威作最终裁决 |

没有运行 `verify:canonical`、`verify:placement-layout`、`verify:rigged-subject` 或
`verify:g-bot-subject`，因为它们当前成功路径会替换 tracked golden；不能把“未运行”包装成
通过。也没有完成 rendered visual、手工交互、发布后 Site 或生产 Runtime 验证；本文不据此
宣称产品 release-ready。

## 3. 当前结构判断

当前主要分层是合理的，不应为了目录更少而合并：

- `authoring → compiler → runtime-contracts → runtime-host / runtime-babylon`；
- `gameplay-contracts → gameplay`，Host 独占事务、Session、Journal 与 Publication Barrier，
  Babylon 只在 Adapter 内拥有 provider 对象；
- `traversal` 与 `traversal-recast`；
- `world` 与 `world-package`；
- `subject-actions`、`subject-composition` 与 `subject-registry`；
- provider-neutral `camera` 与最终 Pose owner `runtime-babylon/CameraDirector`。

`WorldRuntimeSnapshotV4` 已明确拆分 `world/view/runtime/resources`，WorldSession publication 也把
World State、Gameplay Inspection 与 View State 原子聚合。Camera Domain 到 Registry Lock、
Gameplay Context、Browser preference 和 CameraDirector 的剩余接线是公开 Backlog seam，不是
当前结构 bug。`mountedOn`、完整 Relationship、Compound Collider 和 Ragdoll 同样不能因为战略
重要就升级为本审查缺陷。

当前最大问题已经从“Legacy 包是否要退役”转为：

1. clean break 后，部分正式文档、Site consumer 和根 gate 没有一起闭合；
2. Registry、SubjectPreset、Canonical JSON 与 Catalog 仍存在竞争或悬空 owner；
3. `verify` 同时拥有检查和更新权限，root suite 又漏掉真实 consumer；
4. scripts、test imports、manifest、tsconfig 和 generated/parity 仍未形成可隔离边界。

## 4. 当前 Findings

优先级表示当前缺陷影响，不表示 Roadmap 重要性。P0 只用于已确认会在当前交付路径造成
静默错误、数据损坏或安全事故的问题；本轮没有确认 P0。

### [P1] [D1/D3/D6] Babylon-only cutover 没有原子关闭正式文档、Site 与验证状态

**Disposition：new on current main；confirmed。**

- `docs/18-refactor-progress-and-backlog.md:37-55,695-709` 仍把 TR5 写成进行中、TR7
  写成“提交/推送前待执行”，但删除已经位于 `origin/main@01ee4b9`；它也在
  `:547` 把 World/View/Runtime projection 标为未冻结，却在 `:870` 和当前类型中当成已冻结。
- `docs/00-project-overview.md:55-57,153-170` 与
  `docs/17-canonical-json-quickstart.md:25-27,456-464` 继续把 R1b/M5、Gameplay、Relationship
  或非空 Relationship 一概写成未交付，和 `docs/18`、`docs/20` 及当前代码冲突。
- `01ee4b9` 删除 `sites/world-sdk-blueprint/public/legacy/**`，但
  `sites/world-sdk-blueprint/app/page.tsx:6` 仍 iframe `/legacy/index.html`，其测试
  `sites/world-sdk-blueprint/tests/rendered-html.test.mjs:42-67` 仍读取已删除 bundle；聚焦执行稳定 ENOENT。
- Site 在 pnpm workspace 外，README 仍是 starter；根 Vitest 又不收 `.test.mjs`，所以本次
  断链没有被合并门禁发现。

最小修复不是恢复 Three bundle，而是完成一次 TR completion record：以当前代码和新鲜 evidence
更新 `docs/00/17/18`，让 Architecture Site 直接消费现行架构 app/资产或明确归档，并把 Site
build/test 纳入 aggregate check。当前状态文档必须区分“已交付的 possession 基础关系”和“尚未
交付的 mounted/seat 等产品关系”，不能用一个笼统的 Relationship 未实现覆盖两者。

### [P1] [D2/D4] 正式 Gameplay 文档把 Browser Reset 的 possession 语义写反

**Disposition：new on current main；confirmed。**

`docs/20-gameplay-integration-contract.md:186-187` 告诉 Browser consumer：Reset 清空 possession，
调用方必须在新 Session 重新 bind。真实 public path 相反：

- `apps/playground/src/babylon-world-adapter.ts:636-645` 的 Browser reset 调用
  `resetWithInitialControlBinding()`；
- coordinator `apps/playground/src/gameplay-babylon-runtime-coordinator.ts:649-654` 在返回
  Snapshot 前完成初始 bind；
- `apps/playground/src/gameplay-babylon-runtime-coordinator.test.ts:294-311` 断言新 Session 已发布
  `possessedBy`；
- Frozen G19 design `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md:802,904,976`
  明确“Host candidate 先 unbound，Playground bootstrap 在 first Snapshot 前显式绑定”。

Host 内部 unbound candidate 与 Browser 对外已绑定 Snapshot 是两个阶段，不能被文档压成同一
语义。最小修复：分别描述 Host reset 和 Browser reset；Browser consumer 读取返回 Snapshot 的
possession，不应无条件再发一次 bind。

### [P1] [D2/D3] Registry CLI 与 Browser 仍不是同一资源发现权威

**Disposition：remains。**

- `packages/subject-registry/src/types-v3.ts:372-390` 继续暴露 kind-specific resolvers、
  `listResources()` 与 `listCapabilityResources()` 两套视图；
- `scripts/worldkit.ts:639-644` 的非 Subject `registry describe` 只查 legacy list；
- `apps/playground/src/worldkit-browser-api.ts:1000-1017` 从 Capability 视图发现现行资源；
- 实测 `control-feel-profile/humanoid.medium-ground@1` 在 Browser/Registry Capability view
  存在，CLI 返回 `REGISTRY_RESOURCE_NOT_FOUND` / exit 2。

Registry 应提供一个 closed-kind `resolveResource(ref)` 与稳定排序的
`listDiscoverableResources(filter)`；CLI、Browser、Closure 和 conformance 共同消费。旧 projection
只能是显式兼容/内部 API，不能继续冒充通用 discovery backend。

### [P1] [D2/D5] Canonical 生产不变量仍由 `testkit` 所有

**Disposition：remains。**

`packages/compiler/package.json:9-16` 与 `packages/world/package.json:9-13` 把
`@whitebox-world/testkit` 放在 production dependencies；生产入口
`packages/compiler/src/compile.ts:17-21` 和 `packages/world/src/scene.ts:9-14` 调用其中的
`validateSpawnSafety()`。`testkit` 又依赖旧低层 `contracts`。

这不是“测试代码可复用”的命名偏好，而是 compile admission 的业务 owner 倒置。应把 spawn
safety、finite transform、feature ownership 等确定性不变量迁到低层生产合同包，并保持
diagnostic code、path、排序和 hash 行为不变；不要复制算法或新建 `shared` 巨包。

### [P1] [D2] `SubjectPresetClosureV1` 仍有两个公共 owner

**Disposition：remains。**

- `packages/subject-registry/src/subject-preset-closure.ts:10-22` 的 lock entry 用 closed
  `SubjectRegistryResourceV3["kind"]`；
- `packages/runtime-contracts/src/subject-preset.ts:11-23` 导出同名形状，但
  `resourceKind: string`；
- 两者都从 package root 导出。

当前依赖 TypeScript 结构兼容穿透，无法证明 wire contract 与 Registry closure 始终一致。选择
一个不会制造 `runtime-contracts ↔ subject-registry` 环的低层 owner，另一侧只导入或显式投影，
再增加 exact-key、closed-kind 和 hash conformance。

### [P1] [D2/D6] Canonical JSON 仍接受并归一化冻结规范禁止的 `-0`

**Disposition：remains。**

- Frozen spec `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md:2120-2125,2208`
  要求 parser 与 Golden Fixture 拒绝 `-0`；
- `packages/protocol/src/canonical-json.ts:27-34` 把程序内负零改为 `0`；
- `packages/protocol/src/canonical-json.test.ts:62-66` 正向锁定接受行为；
- `packages/authoring/src/parse.ts:93-98` 在重复键检查后直接 `JSON.parse`，不拒绝字面量。

修复必须原子覆盖 parser、canonicalizer、Golden fixtures 与所有 hash conformance；只改测试期望会
让相同 identity 的 admission 行为继续分叉。

### [P1] [D2/D3] Catalog 的公开 Ref、能力描述与锁定 Profile 仍不闭合

**Disposition：remains，证据已更新。**

全 Registry 视图实测 10 个 Motion Kernel 的 `parameterSchemaRef` 全部无法解析；仓库没有
`motion-parameter-schema` resource kind、catalog 或 resolver。与此同时，
`assets/registry/motion-kernels/catalog.json` 的 recommended K01 同时声明 ground/air/water，
而部分 Subject Definition 文案声称使用专用 K02/K03/K04/K06，实际默认仍锁 K01 或 safe-ground。
Registry 当前验证 Profile → Kernel，却不验证 Kernel parameter Schema Ref 或“描述/Capability →
default Profile → Kernel”的闭包。

不要把 `K06 runtimeStatus: implemented` 本身改回 reserved；Runtime 实验实现真实存在。应建立
“每个 public `...Ref` 必须 resolve”和 Definition capability/profile/kernel closure conformance，
并把 recommended/advanced/experimental availability 与 production admission 分开表达。

### [P1] [D6] `verify` 仍混合 check/update 权限，根 gate 也不是完整且稳定的闭环

**Disposition：changed / remains。旧两项 integration timeout 已修，但 gate graph 未修。**

- `verify:canonical`、Placement、Rigged 与 G Bot 成功后仍通过
  `scripts/lib/artifact-directory-promotion.ts:53-83` 替换 tracked `artifacts/examples/**`；根脚本
  没有对应 `--check` 或 `artifacts:update:*` 权限分离。
- `vitest.config.ts:5` 只收 `.test.ts`，遗漏 Playground Vite、Studio 和 Site 的 3 个
  `.test.mjs`；根没有 `check:fast/integration/browser/full`，也没有 tracked CI workflow。
- `verify:outdoor-gameplay` 默认写 `.codex/tmp/outdoor-gameplay-*`，但 `.gitignore:11` 只忽略
  `.codex-tmp/`，会留下未跟踪工作区污染。
- `maxWorkers: 2` 已让旧 Host/Recast 用例通过，是合理改进；但本轮完整 `pnpm test` 又因一个
  Subject Preset Git fixture 超过 20 秒而红，聚焦单 worker 用例在 16.96 秒通过。当前 gate 仍会受
  共享进程/文件系统预算影响。

应把检查和更新拆权，定义 lane 与总入口，并要求 check 结束时 `git diff --exit-code`。Site、Studio、
Vite config、Havok/Recast/Playwright 和 Git fixture 需要显式 lane/预算；提高所有 timeout 不是唯一修法。

---

### [P2] [D5] test imports、manifest、深层源码与 tsconfig 隔离仍不一致

**Disposition：changed / remains。生产源码已有改善。**

当前生产 package 源码的 sibling `src` 穿透已基本清零，生产 DAG 也无环；但静态 census 仍发现：

- 21 个 packages 加 Playground tests 直接导入 `vitest`，各自 manifest 未声明；Compiler tests
  还穿透 `subject-registry/src`，manifest 不声明该测试依赖；
- scripts 与少数 cross-package tests 继续直接导入 sibling private `src`；
- 根 `tsconfig.json:14-17` 向 packages、apps、scripts 一次性注入 DOM、Node 和 Vitest，25 个
  workspace manifest 没有 package-level tsconfig。

先加 import/manifest boundary gate，再从 leaf packages 引入 `tsconfig.base + library/browser/node/test`
配置；测试辅助面走显式 `/testing` export。不要机械生成大量无差异配置。

### [P2] [D5] `scripts/` 仍是 Workspace 图外的 Host/CLI 产品模块

**Disposition：remains。**

`scripts/worldkit.ts` 仍约 1390 行；`scripts/lib` 承担事务发布、Composition Gate、Route、Server、
Validation、Take 与 Preset 等长期职责。`apps/playground/vite.config.mjs:5-16` 反向导入四个
`scripts/lib` Host 模块，而 `scripts/lib/world-package-resource-resolver.ts:12-15` 又导入
Playground asset resolver，真实 ownership 不在 manifest DAG 内。

先把 App 已消费的 provider-neutral Host 原语提取到正式 package，再把 CLI composition 提升为
`apps/worldkit-cli`；根脚本保留薄 wrapper，CLI JSON、exit code、repo-root 与事务语义不变。

### [P2] [D2/D5] Schema、TS wire type、validator 与 generated/parity 仍无机械边界

**Disposition：changed / remains。**

旧 major clean break 已减少表面重复，但 Authoring V4 JSON Schema、
`packages/authoring/src/types-v4.ts`、AJV formats / validator 和 WorldPackage field tables 仍由多份手写结构维护；没有 `generated/` 或
`check:generated`。四个 verifier 也仍各自定义 `WorldBuildArtifactV4`，再用泛型 JSON cast 消费，
只把旧报告的 `V3` 重复升级成了 `V4` 重复。

每个领域内选择 source of truth，生成或机械校验 wire types、field tables、validator scaffold。
`WorldBuildArtifactV4` 先建立一个私有 exact producer/parser owner，不要冒充尚未完成的完整
WorldPackage root。

### [P2] [D2] Action、Bone 与 Topology vocabulary 仍有多个 owner

**Disposition：remains。**

Ground Humanoid Action union 继续平行存在于 `packages/subject-actions/src/types.ts:1-26`、
`packages/subject-registry/src/types-v2.ts:84-109` 与
`packages/runtime-contracts/src/execution-plan.ts:113-138`；
Biped Bone 和 Body Topology 也在 Registry/Execution/compiler fixture 中重复。

修复应是唯一 vocabulary owner 或 generated parity，并给 automatic resolver 定义窄 subset。
`idle/walk/run/jump` 是当前自动选择集合，不等于产品 AnimationSet 只能有四个 Action。

### [P2] [D5] Playground authority 已统一，但 composition shell 仍偏大

**Disposition：旧双 Runtime finding 已关闭；只保留 maintainability residual。**

`apps/playground/src/playground-runtime-route.ts` 已显式区分 authoring、catalog gameplay 与 artifact-only；artifact renderer
不创建 Gameplay Runtime，三条路线都使用 Babylon，不再形成第二套引擎真相。但
`apps/playground/src/main.ts` 仍约 2404 行，同时承担 DOM、路由、inspector、camera/preset UI、
artifact controls 与生命周期组合。

可以继续拆成 bootloader、route-specific composition、UI controller 和 inspection panels，但所有模块
必须消费同一个 coordinator/adapter owner；不要重新制造 canonical/catalog 两套 Runtime 或为了拆文件
移动 physics/camera authority。

## 5. 旧 Findings 在最新 main 上的逐项状态

| 旧 finding | 当前状态 | 本轮裁决 |
|---|---|---|
| Browser V5 vs Placement/docs V4 | **主体已修复** | Runtime、Placement verifier 与 tracked evidence 都是 V5；状态文档仍漂移，转入当前 P1 文档 finding |
| Registry CLI vs Browser discovery | **仍存在** | CLI 实测 exit 2 |
| Compiler/World 生产依赖 testkit | **仍存在** | owner 倒置未变 |
| `SubjectPresetClosureV1` 双 owner | **仍存在** | closed kind vs `string` 未统一 |
| Canonical JSON 接受 `-0` | **仍存在** | Frozen spec 与实现/测试相反 |
| Plan-first Camera 无单位字段 | **撤回** | 最新 `AGENTS.md:97-101` 明确授权 catalog convention；进入 Canonical 时已映射为 `...Meters` |
| Motion/Subject Catalog 闭包 | **仍存在** | 10/10 parameter Schema Ref dangling；Profile/Kernel 描述不闭合 |
| verify 更新 golden + gate 不健康 | **改写后仍存在** | 旧两 timeout 已修；check/update、suite coverage、CI 和新全量 timeout 仍开放 |
| exports/manifest/tsconfig/import graph | **收窄后仍存在** | 生产源码改善；test/scripts/tsconfig isolation 仍开放 |
| `scripts/` 隐式 Host/CLI | **仍存在** | App 与 scripts/lib 双向 ownership 未正式化 |
| `packages/world` barrel 加载 Three | **已修复** | World 只依赖 provider-neutral geometry；Three/Rapier 已退出 |
| Schema/type/validator/generated | **仍存在** | clean break 改善；V4 重复与 parity gate 仍在 |
| Action/Bone/Topology 重复 | **仍存在** | animation 包删除不等于 vocabulary owner 已统一 |
| Canonical/Legacy 共用 Playground | **已修复原问题** | Babylon-only 路由已统一；仅余 shell 可维护性 |
| docs/Site provenance | **仍存在且 Site 断链加重** | legacy bundle 删除后 consumer/test 未更新 |
| 无版本 facade 绑定旧 major | **已修复** | current-only `normalizeAuthoringSpecV4` / `compileWorldV5` |

## 6. 对补充 ChatGPT 分析的最新裁决

此前外部分析的价值主要在 Gameplay/RuntimeHost 方向。更新到当前 main 后：

| 主张 | 当前判断 |
|---|---|
| Gameplay Authority / RuntimeHost 已较成熟 | **现行事实**，不再只是 later-context；Command/Receipt/Event/World State、Publication Barrier、Browser V5 与 Babylon port 已在当前树 |
| `possessedBy` 是唯一 control truth | **现行事实**；但 `docs/20` 的 Browser Reset 说明需要修正 |
| World/View/Runtime Status 分离 | **核心投影已落地**；完整 Typed Relationship/Transition 产品切片仍按 Backlog 扩展 |
| Camera numeric legacy debt | **具体 `updateLegacy()` fallback 已删除**；provider-neutral Domain 已成型，Registry/Gameplay/Browser/CameraDirector 接线是明确 seam，不应标当前 bug |
| `mountedOn` 必须立即做 | **仍是产品优先级决策**，不是 workspace P0/P1 |
| Compound Collider → Body Graph → Ragdoll，且现在不做 | **仍合理**；不阻塞本轮结构修复 |

因此，外部分析总体方向合理，但当前最需要处理的是已交付链路的事实/consumer/gate 闭环，而不是
提前展开 mount、ragdoll 或新的 Camera 功能。

## 7. 更新后的依赖感知工作图

本 PR 只更新审查文档，不执行下列代码修复。实施前仍需按 stable ID 隔离工作树/分支。

| ID / goal / deliverable | depends_on | blocks | 独占 ownership、I/O contract 与 integration point | 验证证据 | mode |
|---|---|---|---|---|---|
| `WS-00` 修当前 publication truth：Reset 语义、docs 00/17/18、Site consumer/completion record | 无 | `WS-06`, `WS-INT` | 主 Agent 独占 active authority 与 Site route；输入当前代码/evidence，输出无冲突 current facts；不恢复 Legacy bundle | Browser reset contract test、Site build/test、active-doc census、链接检查 | `main-agent-only` |
| `WS-01` 统一 Registry discovery 与 Catalog closure | 无 | `WS-02`, `WS-06`, `WS-07`, `WS-INT` | Registry owner 提供 closed resolver/list；CLI/Browser/Closure 只消费 facade；Catalog Ref/availability 是同一 integration point | 每个 public Ref list/describe/resolve；Definition→Profile→Kernel exact closure | `main-agent-only` |
| `WS-02` 收敛 SubjectPreset 与公共 vocabulary owner | `WS-01` | `WS-07`, `WS-INT` | 低层 contract owner；Registry/Runtime 只导入或显式投影；禁止新 shared god package | exact-key、closed-kind、Action/Bone/Topology parity、0 cycles | `sequential` |
| `WS-03` 修 Canonical `-0` admission | 无 | `WS-07`, `WS-INT` | protocol parser/canonicalizer + Authoring input + hash fixtures 原子变更 | negative-zero parser/golden/hash conformance；旧合法 hash 不漂移 | `main-agent-only` |
| `WS-04` 迁 production invariants 出 testkit | 无 | `WS-05`, `WS-INT` | 低层生产合同包独占 spawn/finite/ownership invariant；Compiler/World diagnostic I/O 不变 | Compiler/World/scene parity、diagnostic snapshots、testkit 无生产反向依赖 | `parallel-safe` |
| `WS-05` 建立 workspace boundaries | `WS-04` | `WS-06`, `WS-07`, `WS-08`, `WS-INT` | manifests、exports、library/browser/node/test tsconfigs 与 `/testing` subpaths | import/manifest lint、leaf isolation typecheck/test、0 cycles | `parallel-safe` |
| `WS-06` 分离 check/update 并闭合 aggregate gates | `WS-00`, `WS-01`, `WS-05` | `WS-INT` | root scripts/CI、artifact producer manifest、Site/Studio/Browser/integration lanes；check 只读、update 显式写 | `check:fast/integration/browser/full`；clean worktree；全量稳定重复通过 | `main-agent-only` |
| `WS-07` 建立 schema/type/validator generated/parity | `WS-01`, `WS-02`, `WS-03`, `WS-05` | `WS-INT` | 每个领域 owner 内生成/机械校验；WorldBuildArtifact exact private parser | `check:generated`、round-trip、unknown-key 与 schema/type parity | `sequential` |
| `WS-08` 正式化 Host/CLI，并缩小 Playground shell | `WS-05` | `WS-INT` | provider-neutral Host primitives → formal package；CLI/app wrapper 保持 JSON/exit/path；Playground 模块共享同一 coordinator | CLI snapshots、Vite Host tests、三 route lifecycle、Browser/artifact isolation | `sequential` |
| `WS-INT` 最终集成 | `WS-00..WS-08` | 无 | 主 Agent独占 cross-cutting merge、authority 裁决和 release evidence | typecheck/test/build、所有 check lane、必要 rendered/manual evidence、独立复核 | `main-agent-only` |

只有 owner 和 integration point 不重叠的 ready tasks 可以并行；worker 报告不等于最终集成通过。

## 8. 明确不做的“规整”

- 不恢复 Three/Rapier、Legacy Site bundle 或已删除的旧 packages。
- 不把 Plan-first catalog 的 `distance/targetHeight` 改成 Canonical Schema 字段；当前
  `AGENTS.md` 已明确该局部 convention。
- 不重新引入 V3/V4 migration/facade，只因为当前类型名仍带 V1/V2/V3 后缀。
- 不合并 `authoring/compiler/runtime-contracts/runtime-host/runtime-babylon`。
- 不合并 `traversal/traversal-recast`、`world/world-package` 或 Registry/Gameplay/Camera owners。
- 不新建模糊 `shared/common/utils` 巨包来容纳所有重复类型。
- 不把 Camera 后续接线、mounted relationships、Compound Collider 或 Ragdoll 塞进结构修复。
- 不删除 plan-lock、scene artifacts、planning images、tri-view、Golden fixture；问题是 producer 权限，
  不是受控制品存在。
- 不运行会改 tracked golden 的命令后直接把 diff 当“验证通过”。

## 9. 覆盖与当前结论

| 维度 | 当前结论 |
|---|---|
| D1 定位与需求 | Babylon-only 与 Gameplay 当前方向成立；active docs/Site 没有随 cutover 原子关闭 |
| D2 Schema / AI-friendly | `-0`、SubjectPreset 双 owner、Catalog dangling Ref 和重复 vocabulary 仍在；Plan-first Camera 旧 finding 撤回 |
| D3 承诺与事实 | Browser V5 evidence 已修；Registry discovery、docs 状态、Site consumer 和 Reset 文档仍分叉 |
| D4 单一状态权威 | possession、World/View/Runtime publication 主体设计成立；当前问题是 Browser Reset 文档错误，不是实现有第二份 control truth |
| D5 工程边界 | Legacy/provider leakage 与旧 facade 已清；testkit owner、scripts Host、test manifest/tsconfig 和 generated 边界仍开放 |
| D6 门禁与证据 | 旧两项 timeout 修复；check/update 未分权、`.mjs`/Site 漏测、完整 suite 仍有资源预算红项 |

总体判断是：**最新 main 已经完成了正确的大结构收口，现在不应再做第二轮大搬家。** 下一轮规整应先
修 `WS-00/WS-01/WS-03/WS-06`，让事实、Ref、Canonical admission 和只读 gate 可信；随后再处理
testkit、workspace、generated 与 Host/CLI 的工程边界。
