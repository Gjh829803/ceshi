# 未发布协议兼容层 Clean Break 设计

## 1. 文档状态与实施窗口

- 状态：**Design ready; implementation not started**。
- 日期：2026-08-24。
- 适用仓库：`agent-whitebox-world-sdk`。
- 调研基线：`main@5ffd031`，并核对当前 `codex/g19-7-integration@3527029` 的已提交集成内容。该 SHA 只是本文编写时的观察点；是否构成 G19-7 稳定完成基线仍须由 UCCB-00 验证。
- 实施窗口：**G19-7 完成并形成稳定集成提交之后，G19-8 completion review 宣布完成之前**。
- 本文只冻结 clean break 的目标、依赖和验收门禁，不表示任何旧合同已经删除，也不表示 G19-7、G19-8 已完成。

本项目尚未发布，没有生产 WorldPackage、外部稳定协议消费者或必须回放的历史世界数据。因此，被当前权威合同取代的开发期版本不获得长期兼容资格。兼容清理必须是一次可验证的原子切换，而不是把旧 parser、union、converter、fallback 或双份测试留在生产路径。

## 2. 目标

1. 把唯一权威世界构建和运行链路收口为：

   ```text
   AuthoringSpecV4
     -> NormalizedWorldIRV4
     -> ExecutionPlanV5
     -> RuntimeWorldConfigurationV1
     -> RuntimeHost / Babylon Gameplay Runtime
   ```

2. 删除已被替代的顶层 `AuthoringSpecV1-V3`、`NormalizedWorldIRV1-V3`、`ExecutionPlanV1-V4` 的声明、默认导出、parser、validator、normalizer、compiler、adapter 分支、fixture 和生产消费者。
3. 使 V4 Authoring/IR 和 V5 Execution Plan 自包含；当前实现不得通过投影到旧版本来复用旧编译链路。
4. 让 CLI、Browser Authoring、WorldPackage、RuntimeHost、Babylon Runtime、示例和测试只接受同一套当前版本。
5. 对不能在本轮安全删除的兼容项逐项登记真实消费者、阻塞原因、owner 和可执行删除门禁；不允许留下无主 `TODO` 或笼统的“为了兼容”。
6. 以生产、测试和序列化资产三个 census 证明 clean break，而不是以 TypeScript 编译成功代替消费者清零。

## 3. 非目标

- 不因为符号带 `V1`、`V2` 或 `V3` 后缀就自动删除它。尚未被新版替代、仍是唯一权威合同的类型不属于兼容债务。
- 不重写 Route R1b 已冻结的 Traversal V2、Browser V5、Route Evidence V2 或当前首次发布的 Gameplay V1 合同。
- 不借清理改变物理、移动、相机、Route、Gameplay 或 WorldPackage 的语义所有权。
- 不删除历史设计、实施计划和评审文档中的旧版本名称；它们是可追溯记录，但不能作为生产 census 的消费者例外。
- 不新增开发历史专用 migration、alias、converter、fallback read、双写或双发布。
- 不在 G19-7 仍修改 Authoring、Compiler、Playground 集成文件时并行实施本设计。
- 不在缺少失败复现、聚焦回归和仓库相关全量门禁时宣称完成。

## 4. 当前证据

### 4.1 已经没有代码消费者的顶层旧合同

当前代码中不存在 `AuthoringSpecV1`、`AuthoringSpecV2`、`NormalizedWorldIRV1`、`NormalizedWorldIRV2`、`ExecutionPlanV1`、`ExecutionPlanV2` 或 `ExecutionPlanV3` 的生产声明。精确符号只存在于历史文档。

`packages/authoring/src/migrate-v2-to-v3.ts` 使用私有 `LegacyAuthoringSpec` 提供 `migrateAuthoringSpecV2ToV3()`；它未从 `@whitebox-world/authoring` 包入口导出，仓库中只有其直接测试调用。该函数不构成当前产品入口。

### 4.2 Authoring V3 仍是默认和内部基座

- `packages/authoring/package.json` 的 `./schema` 仍指向 `authoring-spec-v3.schema.json`。
- `packages/authoring/src/index.ts` 把无后缀 `normalizeAuthoringSpec` 指向 `normalizeAuthoringSpecV3`，并公开 V3 types/parser/validator。
- `normalize-v4.ts` 通过 `projectPlacementsToV3()` 把 V4 降级为 V3，再调用 `normalizeAuthoringSpecV3()`。
- `types-v4.ts` 的 `AuthoringSpecV4` 和 `NormalizedWorldIRV4` 直接继承 V3 类型。
- `canonical-authoring-identity.ts` 通过构造 `projectedV3` 计算 V4 identity。
- `apps/playground/src/authoring-loader.ts` 仍接受 `schemaVersion` 3 或 4，并返回 `ExecutionPlanV4 | ExecutionPlanV5`。
- `examples/authoring/basic-world.json`、`invalid-world.json`、`multi-subject-world.json` 仍是 Authoring V3。

Playground 的 V3 分支虽然能解析和编译，但不会产生 `RuntimeWorldConfigurationV1`；Authoring composition root 随后会拒绝缺失的 Runtime 配置。因此它不是一个完整产品路径。

### 4.3 V5 Compiler 仍通过 V3/V4 中间产物实现

- `packages/compiler/src/compile.ts` 的 `compileWorldV5()` 先调用 `projectNormalizedWorldV4ToV3()`。
- 降级后的 IR 再进入 `compileWorldV4()`，生成 `ExecutionPlanV4`。
- V5 Compiler 从该 V4 Plan 生成 static colliders、traversal surfaces 和最终 `ExecutionPlanV5`。
- 无后缀 `compileWorld` 仍指向 `compileWorldV4`。
- `ExecutionPlanV5` 当前通过 `Omit<ExecutionPlanV4, ...>` 定义，不是自包含合同。

当前 G19-7 集成提交同时修改 `authoring-spec-v3.schema.json`、`authoring-spec-v4.schema.json` 和 `compileTerrainV3()`，说明 V3/V4 依赖仍在 G19-7 的关键路径上。清理必须以 UCCB-00 验证后的 G19-7 稳定结果为输入，不能仅因本文观察到 `3527029` 就宣称 G19-7 已完成。

### 4.4 产品 Host 已经是 V5-only

- `RuntimeWorldConfigurationV1.executionPlan` 是 `ExecutionPlanV5`。
- `RuntimeWorldAdapterDescriptorV1.executionPlan` 是 `ExecutionPlanV5`。
- Playground 的 Gameplay Coordinator 从 RuntimeHost descriptor 创建 Babylon Runtime，因此产品 composition root 只会传入 V5。
- CLI 的 validate/build/run 使用 V4 Authoring 路径 `loadWorldkitRoutePipeline()`；旧 `loadWorldkitPipeline()` 只有测试消费者和一个未使用 import。

Babylon Runtime 仍公开接受 `ExecutionPlanV4 | ExecutionPlanV5` 并包含 V4 terrain/collider/control 分支，但仓库产品调用图中没有 V4 Runtime 配置生产者。这是应删除的兼容表面，不是当前产品能力。

### 4.5 相邻的 Subject 兼容路径

`subject-definition-normalizer.ts` 仍接受 `PackageSubjectDefinitionV1 | RegistrySubjectDefinitionV2`。只有 Registry Definition V3 会产生完整 `capabilityAssembly`；`ExecutionSubjectV3.capabilityAssembly` 在 V5 Plan 中仍可缺省。Babylon 随后在 `subject-controller.ts`、`motion-kernel-runtime.ts` 和 `babylon-world-runtime.ts` 注入硬编码 legacy control/motion profiles。

`examples/authoring/package-subject-world.json` 包含当前 package subject，因此不能把这条路径简单归为死代码。clean break 必须选择并验证以下一个当前语义：

1. 为当前 package definition 编译完整、锁定的 capability assembly；或
2. 在进入 canonical Gameplay Runtime 之前明确拒绝缺少 assembly 的 subject。

禁止继续以隐式 legacy profile 作为第三种语义。

## 5. 分类原则

每个候选符号、文件、协议版本或 fallback 必须归入且只归入下列一类：

| 类别 | 判定条件 | 本轮动作 |
| --- | --- | --- |
| `superseded-delete` | 存在当前权威替代版本，且没有获批准的外部或生产消费者 | 删除声明、导出、消费者、fixture 和 fallback |
| `current-authority` | 没有新版替代，或虽有版本后缀但它仍是当前唯一合同 | 保留；不得为了数字整齐而改语义 |
| `historical-record` | 仅存在于历史 spec/plan/review，且不参与构建、测试发现或运行 | 保留记录；从生产 census 排除 |
| `deferred-blocked` | 已确认被替代，但本轮存在未迁移的真实当前消费者 | 按第 9 节登记；completion review 不得静默忽略 |

以下情况不能作为保留理由：

- “可能有外部消费者”，但仓库私有、未发布且没有消费者证据；
- 测试仍在构造旧版本；测试必须迁移到当前合同，而不是反向证明旧合同仍权威；
- 新版类型通过 `extends`、`Omit` 或 converter 依赖旧版；这是待消除的实现依赖；
- 名称中含 `legacy`、`compatibility` 或 `fallback`，但没有明确的当前产品语义和 owner。

## 6. 权威目标链路与边界

```text
Authoring JSON
  parseAuthoringSpecV4 / validateAuthoringSpecV4
        |
        v
normalizeAuthoringSpecV4
  -> NormalizedWorldIRV4 + authoringSpecHash + layout evidence
        |
        v
compileWorldV5
  -> closed, parsed, deep-frozen ExecutionPlanV5
        |
        v
WorldPackageBuildReceiptV1 + GameplayBootstrapV1
        |
        v
RuntimeWorldConfigurationV1
        |
        v
RuntimeHost -> GameplayBabylonRuntimeCoordinatorV1
        |
        v
BabylonWorldRuntime(ExecutionPlanV5 only)
```

边界规则：

- V4 Authoring Normalizer 不构造 V3 值，也不调用 V3 validator/normalizer。
- V5 Compiler 不构造 IR V3 或 Plan V4；共享算法接收当前 IR 的最小只读视图，而不是旧顶层合同。
- V5 Plan 接口自包含，不继承 V4 Plan。
- RuntimeHost 是可运行 World 配置的唯一入口；Playground Adapter 不重新扩大成 V4/V5 union。
- 当前 component 合同可以继续使用其唯一权威版本名，例如 `TraversalAreaSpecV1`。如果它只是 V5 中沿用的当前结构，则不因数字较小而删除。
- 缺少当前 capability assembly 的 Subject 必须在 Authoring/Compiler 边界得到显式结果，Runtime 不再猜测 legacy profiles。

## 7. 依赖图

```text
UCCB-00  G19-7 稳定基线冻结
   |
   +--> UCCB-10  Authoring V4 / IR V4 自包含
   |        |
   |        +--> UCCB-20  Compiler V5 直接编译
   |        |        |
   |        |        +--> UCCB-30  ExecutionPlanV5 合同展平
   |        |                 |
   |        |                 +--> UCCB-50  Babylon / Adapter V5-only
   |        |
   |        +--> UCCB-40  Subject capability clean break
   |                         |
   |                         +--> UCCB-50
   |
   +--------------------------------------+
                                          v
                              UCCB-60  旧文件/导出/fixture 删除
                                          |
                                          v
                              UCCB-70  zero-census + G19-8 review
```

`UCCB-10`、`UCCB-20` 和 `UCCB-30` 共享 Authoring/Compiler/Runtime Contracts 的跨层合同，必须顺序实施。`UCCB-40` 在 `UCCB-10` 冻结 Subject 输入后可独立设计，但它与 Runtime 的最终删除在 `UCCB-50` 汇合。最终集成、冲突处置和 completion claim 始终由主代理负责。

## 8. 实施工作图

### UCCB-00 — 冻结 G19-7 输入基线

- 目标与交付物：确认 G19-7 已完成其六场景、Heightfield、Artifact lifecycle 和集成门禁；记录唯一输入 commit、dirty state 为零以及 G19-7 completion evidence。
- `depends_on`：无。
- `blocks`：UCCB-10、UCCB-40、UCCB-60。
- 独占所有权：不修改协议文件；主代理独占基线选择、集成分支和 Git 状态判断。
- 输入/输出合同：输入为 G19-7 集成分支；输出为一个不可变 commit SHA 和通过的 G19-7 门禁清单。
- 集成点：本设计的所有 diff 必须基于该 SHA，不基于当前可见未提交 WIP。
- 验证证据：`git status --short --branch`、`git rev-parse HEAD`、G19-7 规定的聚焦测试及全量相关门禁。
- execution mode：`main-agent-only`。

### UCCB-10 — 让 Authoring V4 / IR V4 自包含

- 目标与交付物：V4 parser、validator、normalizer、canonical identity、layout input 和类型不再引用或构造 Authoring/IR V3；三个 V3 示例迁入 V4 或按其测试意图重建。
- `depends_on`：UCCB-00。
- `blocks`：UCCB-20、UCCB-40、UCCB-60。
- 独占所有权：`packages/authoring/**`、`examples/authoring/basic-world.json`、`invalid-world.json`、`multi-subject-world.json`。
- 输入合同：`AuthoringSpecV4` 和现有 V4 schema 的关闭字段集合。
- 输出合同：`parseAuthoringSpecV4 -> normalizeAuthoringSpecV4 -> NormalizedWorldIRV4`；失败诊断不经过 V3。
- 集成点：`loadWorldkitRoutePipeline()` 和 Playground Authoring loader。
- 验证证据：先增加能证明 V4 不再调用 V3 的失败 census/contract test；随后运行 Authoring 全套测试、三个示例的 validate/normalize、typecheck。
- execution mode：`sequential`。

### UCCB-20 — 让 Compiler V5 直接消费 IR V4

- 目标与交付物：`compileWorldV5()` 直接从 `NormalizedWorldIRV4` 生成 V5 所需 terrain、objects、subjects、layout、static colliders 和 traversal 数据；删除 V4->V3 与 V5->V4 中间路径。
- `depends_on`：UCCB-10。
- `blocks`：UCCB-30、UCCB-60。
- 独占所有权：`packages/compiler/src/compile.ts`、Compiler 聚焦测试和 Compiler 自有 test support。
- 输入合同：深快照后的 `CompileWorldInputV5`。
- 输出合同：成功时只产生通过权威 parser 的 `ExecutionPlanV5` 与对应 canonical hash；失败时保持当前 closed diagnostics 语义。
- 集成点：`loadWorldkitRoutePipeline()`、WorldPackage build receipt 和 Route lock compilation。
- 验证证据：V4 projection 函数零引用；Compiler V5 determinism、hash、static collider、layout、resource lock、malicious input 回归；Compiler 全套测试与 typecheck。
- execution mode：`sequential`。

### UCCB-30 — 展平 ExecutionPlanV5 合同

- 目标与交付物：`ExecutionPlanV5` 不再 `extends Omit<ExecutionPlanV4, ...>`；V5 parser、field census、hash 和 deep-freeze 以自包含 V5 结构为唯一权威。
- `depends_on`：UCCB-20。
- `blocks`：UCCB-50、UCCB-60。
- 独占所有权：`packages/runtime-contracts/src/execution-plan.ts`、其 parser/hash tests 和公共出口。
- 输入合同：Compiler 产生的 V5 数据图及不可信 serialized V5 输入。
- 输出合同：精确键、关闭 union、deep-frozen `ExecutionPlanV5`；schemaVersion 非 5 一律拒绝。
- 集成点：Compiler、WorldPackage、RuntimeHost、Babylon Runtime。
- 验证证据：缺失/多余键、accessor/symbol、非 canonical lock、错误 Plan 版本、篡改 hash、deep-freeze 回归；Runtime Contracts 全套测试。
- execution mode：`main-agent-only`，因为它是跨 package 公共接口切换点。

### UCCB-40 — Subject capability clean break

- 目标与交付物：冻结 package subject 与 Registry Definition 的当前语义；V5 Runtime 收到的可控制 Subject 不再依赖隐式 legacy control/motion profiles。
- `depends_on`：UCCB-10。
- `blocks`：UCCB-50、UCCB-60。
- 独占所有权：Subject Definition 的 Authoring normalize 边界、Subject Registry 当前 definition 解析边界，以及相应 capability assembly tests。不得同时修改 Babylon runtime 文件。
- 输入合同：当前获支持的 package/registry Subject Definition 和精确 Resource Lock。
- 输出合同：每个进入 Gameplay Runtime 的可控制 Subject 有一套完整、锁定的 capability assembly；若当前不支持则在 Authoring/Compiler 阶段给出关闭诊断。
- 集成点：`ExecutionSubject` materialization 和 Resource Lock。
- 验证证据：package subject、registry subject、缺失 profile、错误 hash、未知旧 definition 版本的正反例；证明 Runtime 无需 legacy profile 才能运行当前示例。
- execution mode：`sequential`；稳定输入后可与 UCCB-20 的内部实现并行评审，但不能并行修改共享 Authoring 文件。

### UCCB-50 — Babylon Runtime 与 Playground Adapter V5-only

- 目标与交付物：Runtime options、Camera Director、Subject Visual、Traversal internal、Playground Adapter 只接受 V5；删除 schemaVersion 4 terrain/collider/control 分支和隐式 legacy profile 注入。
- `depends_on`：UCCB-30、UCCB-40。
- `blocks`：UCCB-60。
- 独占所有权：`packages/runtime-babylon/**`、`apps/playground/src/babylon-world-adapter.ts`、`gameplay-babylon-runtime-coordinator.ts` 及相应测试。
- 输入合同：RuntimeHost 的 `RuntimeWorldAdapterDescriptorV1` 和 `ExecutionPlanV5`。
- 输出合同：单一 V5 runtime construction、固定步进、physics/support、camera 和 disposal 语义保持不变。
- 集成点：RuntimeHost AdapterFactory 和 Playground composition root。
- 验证证据：V5 runtime initialization、非方形 Heightfield、static collider、30/60/120Hz-like timing、多实例隔离、partial construction、throwing cleanup、Gameplay possession 和 traversal 回归；按 runtime deep-review checklist 执行。
- execution mode：`sequential`。

### UCCB-60 — 删除旧表面和迁移测试

- 目标与交付物：删除所有已断开的 V2 migration、V3 Authoring/IR、V4 Plan 文件/符号/默认别名、旧 pipeline、旧 fixture，并把仍有价值的测试迁到当前合同。
- `depends_on`：UCCB-10、UCCB-20、UCCB-30、UCCB-40、UCCB-50。
- `blocks`：UCCB-70。
- 独占所有权：旧文件删除、package exports、Worldkit pipeline/CLI imports、Playground Authoring loader、跨包测试 fixture。
- 输入合同：前序任务已经提供当前替代实现和已迁移测试。
- 输出合同：生产与测试代码不再声明、导入、构造或接受被替代的顶层版本。
- 集成点：workspace package exports、CLI、Browser Authoring、tests。
- 验证证据：删除前失败 census；删除后精确 symbol、schemaVersion branch、legacy alias、converter、fallback census；相关包全测、typecheck、build。
- execution mode：`main-agent-only`，因为它执行跨包原子删除和最终冲突处置。

### UCCB-70 — Zero census 与 G19-8 completion review

- 目标与交付物：生成可复查的最终 census、门禁结果、暂缓登记和 Git 状态；只有全部必要证据通过后才允许 G19-8 completion claim。
- `depends_on`：UCCB-60。
- `blocks`：G19-8 completion、合入 main。
- 独占所有权：最终集成、completion report、Git branch/upstream 状态；不在此任务中补实现。
- 输入合同：已集成 clean-break diff 和全部聚焦证据。
- 输出合同：第 10 节 gate 全部通过，或明确的失败/暂缓报告。
- 集成点：G19-8 completion review。
- 验证证据：全仓 census、相关全量测试、typecheck、build、CLI V4 examples、Browser V5/Runtime V5 smoke、`git diff --check`、clean status。
- execution mode：`main-agent-only`。

## 9. 可本轮删除项与暂缓登记

### 9.1 已确认可本轮删除

在前序替代实现完成后，下列项不得继续作为“兼容需要”保留：

- `migrateAuthoringSpecV2ToV3()`、其私有 legacy input 和 migration-only test；
- Authoring V3 默认 schema export、无后缀 V3 aliases、V3 parser/validator/normalizer/type exports；
- Playground 的 V3/V4 parse union 和 `AuthoringSceneLoadResult.executionPlan` V4 union；
- 旧 `WorldkitPipelineSuccess`、`loadWorldkitPipeline()` 和 CLI 未使用 import；
- `CompileWorldInputV4`、`CompileWorldResultV4`、`compileWorldV4()`、`compileWorld = compileWorldV4`；
- `projectNormalizedWorldV4ToV3()` 及 V5 Compiler 的 `planV4` 中间值；
- 顶层 `ExecutionPlanV4` 及 V5 对它的继承；
- Babylon/Adapter 的 `ExecutionPlanV4 | ExecutionPlanV5` unions 和 schemaVersion 4 runtime branches；
- 公开 `WorldRuntimeSnapshotV3`、`BindControlRequestV2` 与直接 `bindControl()` 入口；Snapshot 只发布 V4，控制所有权只通过 Gameplay Possession transaction 改变；
- `RegistrySubjectDefinitionV2`、`RegistrySubjectDefinitionInputV2` 与 `SubjectResourceRegistryV2`；当前 Subject Registry 只接受 capability-driven definition，并在编译前完成精确 Resource Lock；
- `LEGACY_CONTROL*`、`LEGACY_MOTION*`、`LEGACY_CAMERA*` 常量及其 Runtime 注入路径；
- 只为 V4 runtime fixture 服务的 `lockPublishedGroundFeels()`；若测试语义仍有效，改为当前 V5 fixture；
- `basic-world.json`、`invalid-world.json`、`multi-subject-world.json` 的 V3 serialized shape。

删除应发生在消费者迁移之后的同一原子系列提交中；本节不是允许提前删除共享基座的授权。

### 9.2 当前暂缓候选

以下名称不能仅凭版本数字删除，必须先证明存在新版替代：

- 当前 V4/V5 内仍是唯一形状的 component 合同，例如 `TraversalAreaSpecV1`、`ExecutionTraversalSurfaceV1`、`ExecutionObjectV3`；
- `PackageSubjectDefinitionV1`，因为它仍是当前 package definition 合同；本轮处理的是其 Runtime 语义，不是按名称删除；
- 当前 Gameplay、RuntimeHost、WorldPackage、Route、Validation 中尚无替代版本的 V1/V2 合同；
- 历史 spec/plan/review 文件中的旧顶层版本名称。

### 9.3 暂缓登记模板

任何 `deferred-blocked` 项必须在 G19-8 completion report 中使用以下完整记录；缺字段即不合格：

```markdown
#### DEFER-<stable-id> — <symbol or contract>

- classification: deferred-blocked
- files: <exact production files>
- superseded_by: <authoritative replacement>
- production_consumers: <exact call sites; tests do not count>
- blocking_reason: <current technical dependency, not "for compatibility">
- owner: <package/team/task owner>
- removal_task: <stable task id>
- depends_on: <ids>
- delete_when: <machine-verifiable gate>
- verification: <commands/tests/census>
- latest_allowed_milestone: <explicit milestone>
```

若没有真实生产消费者，项目必须归为 `superseded-delete`，不能登记为暂缓。

## 10. Zero-census gate

G19-8 completion review 必须同时满足以下条件。历史文档目录可以从生产 symbol gate 排除，但 active code、tests、examples、package exports 和生成资产不能排除。

### 10.1 顶层旧符号为零

```bash
rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!dist/**' \
  --glob '!coverage/**' \
  --glob '!.git/**' \
  --glob '!docs/superpowers/plans/**' \
  --glob '!docs/reviews/**' \
  '\b(AuthoringSpecV[1-3]|NormalizedWorldIRV[1-3]|ExecutionPlanV[1-4])\b' \
  packages apps scripts examples
```

期望结果：零匹配。若某个旧符号作为迁移说明出现在 active code comment 中，也必须删除或改为不形成生产合同例外的表述。

### 10.2 兼容机制为零

以下 census 必须人工 disposition 每个匹配，不能只看命令退出码：

```bash
rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!dist/**' \
  --glob '!coverage/**' \
  --glob '!.git/**' \
  '(WorldRuntimeSnapshotV3|BindControlRequestV2|RegistrySubjectDefinition(Input)?V2|SubjectResourceRegistryV2|migrateAuthoringSpecV2ToV3|projectPlacementsToV3|projectNormalizedWorldV4ToV3|compileWorldV4|loadWorldkitPipeline|ExecutionPlanV4 \| ExecutionPlanV5|LEGACY_(CONTROL|MOTION|CAMERA)|legacy-(control|motion)|legacy\.(camera|ground)|bindControl\()' \
  packages apps scripts examples
```

期望结果：被本设计确认的兼容符号零匹配。业务意义上的 safe fallback、历史 UI migration 或其他当前协议不得被此命令自动删除；每个剩余匹配必须按第 5 节分类并记录。

`schemaVersion === 4` 和 `schemaVersion !== 5` 这类表达式本身不是兼容机制：它们通常是当前 Authoring V4 / ExecutionPlan V5 的严格识别或 fail-closed 门禁。机器 gate 不把它们计为债务；审查应确认它们没有把旧输入转换为当前输入，而不是为了追求文本零匹配删除正确的版本校验。

### 10.3 Serialized assets 只使用当前 Authoring 版本

```bash
rg -n '"kind"\s*:\s*"worldkit-authoring-spec"|"schemaVersion"\s*:\s*[1-3]' \
  examples apps packages scripts artifacts
```

必须逐文件确认所有 Authoring JSON 为 V4。其他当前合同合法使用 schemaVersion 1、2 或 3 时，应以 kind 识别并记录为 `current-authority`，不得误删。

### 10.4 结构与运行门禁

- Authoring、Compiler、Runtime Contracts、WorldPackage、RuntimeHost、Runtime Babylon 的全套相关测试通过；
- `pnpm typecheck` 通过；
- `pnpm build` 通过；
- 当前 V4 Authoring examples 通过 CLI validate/build；
- Browser V5 Authoring 启动、Gameplay Runtime 创建和至少一个 Outdoor 场景真实 smoke 通过；
- Runtime deep-review checklist 要求的 adversarial timing、multi-instance、partial construction 和 cleanup 证据完成；
- `git diff --check` 通过，工作树只包含已评审的 clean-break changes；
- 暂缓登记为空，或每一项均有明确 owner、删除门禁和不晚于指定 milestone 的期限。任何未登记旧生产消费者都会阻止 completion。

## 11. Completion 声明约束

只有 UCCB-70 的所有证据真实执行并通过后，才可以声明：

> 未发布 Authoring/IR/ExecutionPlan 兼容链路已完成 clean break，产品路径只接受 Authoring V4、Normalized IR V4 和 ExecutionPlan V5。

在此之前，允许的状态表述只能是“设计已冻结”“实施中”“某个任务通过聚焦门禁”或“被已登记项阻塞”。不得用某个 worker 成功、单包测试通过、编译通过或旧符号数量下降替代最终完成证明。
