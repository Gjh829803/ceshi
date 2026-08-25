# SDK 全量设计与实现审计

## 审查元数据

- 审查者：Cursor Grok 4.6
- 日期：2026-08-20
- 审查 HEAD：以工作树为准（`main` 近期提交含 shader bootstrap / pose-at-render / capability 运行时修补）
- 方法：按模块并行派出 6 路只读审计（Authoring/Compiler、Babylon 运行时、Capability、Subject 资产、World/Playground 双栈、跨包原则），父会话对每条 P0/P1 **回源码核对**，并对 G Bot GLB 做了二进制拆包。不是只读摘要。
- 范围：Canonical 管线（AuthoringSpec V3 → Layout Solver → Normalized IR V3 → ExecutionPlan V4 → Babylon/Havok）以及仍在 playground 默认路径上的 Three/Rapier outdoor 栈。不重复实现修复。
- 原则基准：`AGENTS.md`（AI Schema 命名、lodash、单位入字段名、单一权威状态）、`docs/reviews/runtime-deep-review-checklist.md`、以及「catalog 宣称的能力必须等于运行时真正消费的能力」。
- 续篇：`docs/reviews/2026-08-20-sdk-protocol-gates-terrain-audit.md`（CLI/Browser、Hash/Lock、verify vs ValidationReport、地形双管线、Plan-first/Studio/Capture）。WorldPackage / Take / ValidationReport 按能力缺口记，不当实现 bug。

## 结论先行

Canonical 的**结构方向是对的**：content-addressed 资源、Host 才有 URI、Havok 支撑查询、固定步长累加器、Rig Profile 把 Mixamo 骨名挡在 adapter 里。这不是「把模型塞进场景」的回潮。

当前最大的问题不是缺功能，而是 **三层契约对 AI 过度承诺，执行面仍是窄切片**，再加上几处**静默语义错误**（同一字段两端含义不同）。Catalog / 联合类型 / UI 已经看起来像完整能力包；运行时、选择器、门禁样例并没有接上。

一句话：基础设施能养大型项目；产品切片和能力表在「假装已经完整」上走得过满。

---

## 已确认不再成立的旧问题

不要按 2026-08-20 早些时候的 runtime/capability review 原文去修下面这些：

| 旧问题 | 现状 |
|---|---|
| 非受控 + `medium===ground` 且 pending 永不清除 → 永久悬空 | 首 tick 用 `hasPendingInitialGroundSupport` 强制 `step`；有回归 `settles an uncontrolled Subject spawned just above terrain` |
| `renderFrame` 用假 `1/60` 再推 Camera Director | `renderFrame` 只 `applyAnimationPose` + `scene.render` |
| 水域上界 `waterLevel+2` 偷码头 | 上界已收到 `+0.1m` |
| rAF = 1 tick | Adapter 有固定步长累加器，每显示帧最多 5 tick |
| Sidecar 说剥了 Spine 平移、运行时不查 → 躯干会滑 | GLB 实测：`mixamorig:Hips` / `Spine` 平移轨为 0；其余 63 骨平移是 **cm 空间亚毫米噪声**（Armature `scale=0.01` 后可忽略）。运行时只禁 hips/root 是对的 |

---

## P0

### P0. Solved spawn Anchor 的 Y 被 Compiler 当「离地偏移」再加一次地形高

**这是静默正确性漏洞，不是命名偏好。**

Layout 对 solved 实体写入的是**世界绝对高度**：

```185:188:packages/layout-solver/src/candidates.ts
    const yFor = (point: LayoutVec2V1): number => {
      const sample = heightfield === undefined ? undefined : sampleHeightfieldV1(heightfield, point);
      return (sample?.heightMeters ?? 0) + entity.halfExtentsMetersXYZ[1];
    };
```

Spawn Anchor 的 `halfExtentsMetersXYZ` 被写成 `[0,0,0]`（`layout-input.ts:348`），所以 Anchor Y **就是地形采样高度**。

Compiler 把同一字段当偏移：

```776:790:packages/compiler/src/compile.ts
      const [spawnX, spawnYOffset, spawnZ] =
        spawnAnchor.transform.positionMetersXYZ;
      const groundHeightMeters = sampleTerrainHeight(terrain, [spawnX, spawnZ]);
      return {
        ...
        spawnSubjectOriginPositionMetersXYZ: [
          spawnX,
          groundHeightMeters + spawnYOffset,
          spawnZ,
        ],
        forwardDirection: "-z",
```

后果：非平坦地形上，solved spawn 会浮在约 `2 × 地形高`。Object 节点走绝对 transform，只有 Subject 特例。

门禁 `verify-placement-layout.ts:301-305` 断言「player origin ≡ spawn-main transform」。样例 `placement-coastal-world.json` 用 `relief: "flat"` + `baseHeightMeters: 0`，`0+0` 碰巧相等，**把 bug 测成绿**。

**建议：** Execution 一律用世界绝对坐标。Compiler 对 Subject 直接采用 Anchor transform；或 Layout 对 spawn Anchor 只输出 XZ、Y 恒为偏移——二者择一。verify 必须覆盖非零 `baseHeightMeters` / 非 flat relief。

---

## P1

### P1-1. 同一 G Bot 两套 Subject Definition，门禁 ≠ 用户玩的包

| Ref | 出处 | 实际用在 |
|---|---|---|
| `worldkit://subject-definition/humanoid.g-bot@2` | `built-in-subject-definitions.ts`（V2，无 `capabilityAssembly`，socket 几乎只有 `hand.right`） | `examples/authoring/g-bot-subject-world.json`、`pnpm verify:g-bot-subject` |
| `worldkit://subject-definition/humanoid.g-bot.ground@1` | `assets/registry/subject-definitions/catalog.json`（V3 + K01 + 相机 sockets） | playground 能力包、`capability-runtime.test.ts` |

共用同一 GLB / Rig / AnimationSet / Capsule。改相机 socket 或 motion profile **不会**被 `verify:g-bot-subject` 挡住。这是大型项目最典型的双入口漂移。

新后果：`.ground@1`（catalog `recommended`）有相机/座椅 socket，**没有** `hand.right` / `equipment-grip`；`@1` 只有手、没有第一人称 socket。装备与 FP 相机无法在「同一个产品包」上同时成立。

### P1-2. 25 个 clip 锁进 SDK 动作枚举，选择器仍只有 4 格

`GroundHumanoidActionIdV1` 与 ExecutionPlan 镜像是 25 元联合类型。AnimationSet `requiredActionIds` 是全部 25 个。`SubjectAnimationPlayer` 启动时要求每个名字都有且仅有一个 `AnimationGroup`。

真正选动作的仍是：

```17:21:packages/subject-actions/src/ground-humanoid-action-resolver.ts
  if (input.movementMedium === "air") return "jump";
  if (input.horizontalSpeedMetersPerSecond <= 0.08) return "idle";
  return input.runRequested ? "run" : "walk";
```

- 空中全程 `jump`（`once`，过 apex 停在起跳末帧）；包里 loop 的 `fall` 永不被选。
- 水中仍 walk/run。
- Normalizer 的 `REQUIRED_GROUND_ACTION_IDS` 其实只要 idle/walk/run/jump 四个——**加载成本按 25 付，校验下限按 4**。

`GroundHumanoidActionIdV1` 本应是通用地面人型表，现在被一个产品的 Mixamo 清单污染。下一个角色没有 `dance.rumba` 会和联合类型打架。

### P1-3. Solved spawn 的朝向被丢掉

Layout `faces-entity` 会把 yaw 写进 Anchor `rotationEulerRadiansXYZ`。Compiler 只取 position，并写死 `forwardDirection: "-z"`。运行时 `reset()` 里 `this.yawRadians = 0`。

Outdoor 栈有 `facingRadians`（例如 `azure-bay-scene.ts` 的 `Math.PI`）。迁到 Canonical 会静默朝 `-Z`。`spawn-faces-focus` 约束对玩家主体无效。

### P1-4. Playground 在 compile 前静默改 AuthoringSpec

`apps/playground/src/authoring-loader.ts` 的 `applyCapabilityDemoContext`：

- 把 `resourceBudget` 抬到至少 200k/300k/128，让 G Bot 能过小世界预算。
- water-surface：把 spawn 挪到水椭圆中心。
- unpowered-glide：把 Anchor Y 写成 `Math.max(12, current[1])`。Compiler 再把 Y 当离地偏移，起伏地形上实际高度是 `ground + 12`，不是绝对 12m。

CLI / `pnpm worldkit build` 不走这层 overlay。同一 JSON 在 playground 与 CLI 行为不同。测试未覆盖这些分支。

### P1-5. Catalog 标 `implemented` 的能力，运行时没有对应行为

这些不是「以后再做」的 reserved（reserved kernel 编译期会拦）。它们对 AI **谎报已实现**：

1. **`velocity-chase` 相机算法**（`camera-profiles/catalog.json`，`runtimeStatus: "implemented"`）。`CameraDirectorV1.update` 只对 `socket-first-person` / `flight-horizon` 做 `endsWith` 分叉，其余走同一 orbit 公式。`chase.surface-fast` 只是参数不同（距离、FOV），不是算法。
2. **Seat / Tether** 关系 profile 标 implemented。Snapshot 写死 `relationshipRole: "none" as const`。没有 control transfer、没有 seat 对齐。
3. **Mounted 相机规则永假。** Context 规则 `when.relationshipRoles: ["driver","passenger","rider"]`。`ruleMatches` 见到不含 `"none"` 的 `relationshipRoles` 直接 `return false`（`camera-director.ts:64-67`）。`follow.mounted` 选不上。
4. **`mediumProfile` 编进 ExecutionPlan，runtime-babylon 零引用。** 水/气行为硬编码在 motion kernel。改 catalog 的 medium 参数不生效。
5. **每个 kernel 的 `parameterSchemaRef`**（如 `worldkit://motion-parameter-schema/free-ground@1`）仓库内没有对应资源。参数是开放 `Record`。
6. **Glide 契约空心。** Profile 声明 `pitchRateRadiansPerSecond` / `rollRateRadiansPerSecond`；`stepGlide` 用 `pitchInput * 3`，不读 roll，不读 `actionRequested`。Playground 调参 UI 会骗人。
7. **`facingPolicy` / `lateralMovementPolicy` 编译后无人读。** `compileMotionCommandV1` 几乎只看 `commandKind`。

### P1-6. G Bot 把 Mixamo `Beta_Joints` 当正式网格渲染

GLB 实测：

| 节点 | 顶点 | 三角 |
|---|---:|---:|
| `Beta_Joints` | 12473 | 20840 |
| `Beta_Surface` | 15901 | 28272 |
| 合计 | 28374 | 49112 |

这与 Registry inventory 完全一致——**43% 的几何是 Mixamo 骨骼可视化网格**，不是角色表面。`createSubjectVisual` 对 `assetInstance.meshes` 全部赋白模材质，没有按名过滤。白模阶段会看到一套「内部骨架胶囊」叠在角色上。

场景根是 `Armature`：旋转 `Rx(90°)`（glTF `[0.707,0,0,0.707]`）+ `scale = 0.01`（厘米→米）。Hips rest translation 在 cm 空间约为 `(0, 1.55, -104)`，经 Armature 后髋高约 1.04m。产品门禁 `inspectGBotProductAssetEvidence` 不检查网格名、Armature TRS、或平移轨。

更糟的是 bone socket 按名字字典序取 `affectedMeshes[0]`（`subject-visual.ts:380-412`）。`Beta_Joints` 排在 `Beta_Surface` 前面，**手/头 socket 附着在 joints cage 上**。Golden 单 mesh 测试盖不住；下一只 Mixamo 角色会原样复发。

### P1-7. Outdoor spawn 不校验水 / 地标

`compileOutdoorScene` 只查地形外、坡度、相机范围。`scenes.test.ts` 调 `validateSpawnSafety` 时不传 water/landmark colliders。AGENTS.md 要求 spawn 在水/地标之外，编译器不执行这条。玩家可以合法编译出站在湖盆底的场景。

### P1-8. `bindControl` 把前一主体速度清零

```678:679:packages/runtime-babylon/src/babylon-world-runtime.ts
    this.controllerFor(this.controlledEntityId).stop();
    this.visualFor(this.controlledEntityId).stepAnimation(this.tick, "idle");
```

`stop()` 无条件 `setVelocity(0)`。A 在空中切到 B，A 的跳跃弧被掐断，同时 animation 被写成 `idle`（与 `movementMedium=air` 分裂）。缺「跳中 rebind」回归。

### P1-9. Playground `dispose()` 丢掉异步清理

`BabylonWorldAdapter.dispose()` 对 `disposeRuntime()` 做 `void` fire-and-forget。Havok/引擎失败可变成 unhandled rejection，调用方以为已清完。

### P1-10. `@whitebox-world/playground` 未声明 `subject-registry`

`authoring-loader.ts` / `worldkit-browser-api.ts` 直接 import `@whitebox-world/subject-registry`，`apps/playground/package.json` 没有该依赖。隔离安装会裂。

---

## P2 原则违反与权威分裂

### 运行时权威

清单要求每种状态一个写者。当前仍有双源：

| 状态 | 问题 |
|---|---|
| Ground / medium | `step` 里 `checkSupport`，随后每 tick 再 `refreshMovementMedium`；`initialGroundSupportPending` 用短射线伪造 ground；水体积检测先于 Havok |
| 水 | 垂直带下界仍是 `waterLevel - depth - 1`，湖床以下多 1m 会弱重力、禁跳 |
| 相机交互 | `adjustCameraView` / 指针每次用假 `1/60` 推阻尼；`applyCameraActions` 再在 `runFixedInput` 前多推一次。Sim 路径已干净，pause + 转镜仍 damp |
| 非受控动画 | 强制 `idle`，协议不能靠 `activeActionId` 推断腾空 |
| 非受控地面 | pending 清掉后 skip `step`：静态世界无感，动态表面会冻在过期速度 |

### AI Schema / 方言

- **`resolutionCellsXZ` ↔ `resolutionVerticesXZ`：** Authoring/Execution 叫 cells，Layout 叫 vertices，Compiler remap。采样循环按 `(n-1)` 当顶点数。Cells 名不副实。
- **`fovDegrees` ↔ `verticalFovDegrees`。**
- **相机 `targetHeightMeters` 双字段：** `cameraRig.target.targetHeightMeters?` 与必填的 `thirdPerson.targetHeightMeters`，投影用 `??`。
- **Relationship：** Authoring `RelationshipSpecV1` 只有 `{ id, type, schemaVersion }`，非空即 `AUTHORING_FEATURE_NOT_SUPPORTED`。Capability 用泛化 `source`/`target` socket，不是 `riderEntityId` / `mountEntityId`。
- **版本号三轨：** Authoring `schemaVersion: 3`，ExecutionPlan **4**，Snapshot / Browser API **3**，BindControl receipt **2**。Compiler 内部 core 先写 3 再升 4，有意步进，但对 AI 不友好。
- **URI 双方言：** 运行时 `worldkit://…`；CLI 包资源 `package://prototype/…`。
- **V2/V3 Subject Definition 双轨：** 内置 TS 无 `schemaVersion`；catalog JSON 是 V3。V3 仍强制投影 V2 `locomotionProfileRef`。
- **`PhysicsBodyKindV1 = "character" \| "rigid-body"`** 把引擎体类型露给 AI；runtime 实际一律 CharacterController。
- **`CameraPreferenceV1`：** `"auto" \| "first-person" \| string`，开放字符串。
- **Outdoor `amplitude` / `facingRadians` / `heightOffset`：** 旧栈公开字段大量无单位后缀；Canonical 侧多数合格。
- **`colliderContribution` 编进 Execution 时丢掉。**
- **`parameterTuning` 用 `Object.keys(...).length === 0`：** 全仓无 `isNil`/`isEmpty` 导入。lodash-es 生产用法几乎只有 `subject-asset-cache.ts`。`sdk-world-adapter.ts:975` 仍有 `height == null`。

### Layout vs Authoring 投影缺口

- `candidateRouteIds: []`、`explicitAnchorEntityIds: []`、`anchorsByEntityId: {}` 写死。Solver 能沿 route 采样，Authoring 永远不填。Agent 写「沿路线放」只能碰运气。
- provenance 的 `placementConstraintIds` 被换成 solver 的 `satisfiedConstraintIds`。`visible-in-camera-region` 的 touch 集是**全部 layout entity**，每个 solved 实体都会挂上 lighthouse-visible 之类约束，即使 Authoring 没声明。

### 动画混合中断会 snap

`SubjectAnimationPlayer.beginTransition` 在已有 transition 时：停掉旧 source、把旧 target 权值打到 1，再以它为新 source。idle→walk 走到一半再切 run，会先跳到 100% walk。测试只断言「最多两个 group started」，不覆盖姿势连续。

### 骨空间 socket 单位未关门禁

`.ground` 的 `FirstPersonView` offset 是米制 `[0, 0.09, -0.08]`，经 `attachToBone` 写在 Mixamo 骨局部。骨链 rest 仍是 cm 量级、IBM 对角约 100。Local 相机 socket 挂 visual root（单位正确）；骨空间 offset 与 Armature `0.01` 是否同量纲 **没有运行时断言**。Sidecar `anchors.FirstPersonView [0,1.64,0]` 与 catalog 骨 socket 也不一致。FP 视点最容易偏。

### 输入契约撒谎

- throttle-steer：`jump` 同时映射 `brakeRequested` 和 `jumpRequested`（测试还把这冻成契约）。
- flight：`yaw` 与 `roll` 同源 lateral。
- surface-slide：runtime 读 `driveResponsePerSecond`（catalog 无此键）；catalog 有 `slopeGravityRatio`（runtime 不读）。
- Camera `transitionSeconds` 编入 profile，Director 不用。

### 双栈

Playground 默认 Three/Rapier（`sdk-world-adapter` + `packages/world|physics|subjects|camera|animation`）；`?authoring=1` 走 Babylon/Havok。场景模块**没有**直接 `THREE.Scene.add`，AGENTS 边界目前被遵守。

但：

- 两套朝向补丁：旧栈 `visualMount.rotation.y = π`；Canonical G Bot part `rotationEulerRadiansXYZ: [0, π, 0]`。
- Host URI 表 `PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1` 对 G Bot 再写一遍同路径。
- `packages/subjects` 用相对路径 `../../camera` / `../../animation` / `../../contracts`，绕开包名。
- `packages/physics` / `camera` **不是死包**，是 legacy 活路径。删了会断 outdoor。

---

## P3 债务（真实，但不要假装是今天的回归）

- Terrain fractal noise 在 `layout-input.ts` 与 `compiler/src/noise.ts` 双份；靠 hash 对拍，长期会漂。
- `normalizeNodeV2` 相机路径丢掉 `aspectRatio`，靠 V3 覆盖救回。
- V2→V3 migrate 硬编码 `aspectRatio: 16/9`。
- 游泳 / 载具 / 座椅 / 关系运行时：能力缺口。水中 0.15g、禁跳，不是生产游泳。
- `ExecutionSubjectV3.forwardDirection` 字面量锁定 `"-z"`，无法渐进加朝向。
- Golden rig 独立 `root` 骨；G Bot `root ≡ mixamorig:Hips`。`70be782` 的 root/hips 拆分对这个产品是空操作。下一个 Mixamo 角色会再踩一次。
- Capsule `0.35 × 1.8` vs 网格 bounds X 约 `±0.90`（T-pose 手臂在胶囊外）——对人型控制器可接受，不要当碰撞精度。
- 证据脚本不锁 Armature TRS、网格名、`strippedTranslationNodes`。
- Compiler 内部 `ExecutionPlanCompilerCore.schemaVersion: 3` 再升 4：有意，但增加认知负担。

---

## 明确不是缺陷

- 禁 GLB 外部 `uri` / camera / light：确定性与安全，应保留。
- `doNotInstantiate: true` 克隆网格：多实例隔离合理。
- reserved motion kernel 编译拦截：符合「未实现进不了 Plan」。问题是 **implemented 标得太满**，不是 reserved 没拦住。
- 白模覆盖导入材质：阶段策略，`appearance.mode: "whitebox-neutral"` 应继续等于丢弃源材质。
- `relationships` / `rules` 非空即报错：显式 unsupported，不是静默吞。
- Object 的绝对坐标放置：与 Layout 一致；P0 只在 Subject 特例。
- ExecutionPlan `schemaVersion` 3→4 的显式升级：不是静默丢版本。
- Hips/Spine 平移轨已剥、其余骨平移为噪声：不要当成 root-motion 泄漏去「修」Spine1。

---

## 建议落地顺序

不要同时做能力扩张。先把谎报和静默语义关掉。

1. **P0 spawn Y：** 绝对坐标 vs 偏移，选一个；verify 加非 flat 地形。
2. **合并 G Bot Definition**；`verify:g-bot-subject` 打 playground 那个包。
3. **Catalog 诚实：** `velocity-chase` / seat / tether / mounted 规则要么实现，要么改 `reserved`/`experimental` 并让规则可匹配；删掉或实现 `parameterSchemaRef`；mediumProfile 要么读要么移出 Plan。
4. **动作表收窄到 idle|walk|run|jump**，或给 `air` 接 `fall`。停止往 `GroundHumanoidActionIdV1` 加产品 clip。
5. **Compiler 消费 Anchor yaw**（或显式 unsupported faces-entity on spawn）。
6. **去掉 / 声明** Playground overlay；CLI 与 UI 必须同语义。
7. **过滤 `Beta_Joints`**（或从 GLB 剥掉），证据脚本锁网格名。
8. Outdoor spawn ∩ water/landmark 门禁。
9. `bindControl` 保留腾空速度；`dispose()` await。
10. 再谈 state binding、游泳、座椅。在 1–8 之前不要再往 catalog 加 `runtimeStatus: "implemented"`。

## 验证

改完对应项后至少：

```bash
pnpm typecheck
pnpm test
pnpm verify:canonical
pnpm verify:placement-layout   # 必须包含非零地形高的 spawn
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

人工：`?authoring=1` 与 CLI 对同一 JSON；playground 切 G Bot ground 包；跳起后腾空姿势；第二人落地；非 flat 世界 solved spawn 是否贴地。

---

## 审计处置（2026-08-21 SDK audit closure）

本节只追加 disposition，不改写原始 findings。实现范围 `15e2add..5fb8a43` 已完成逐任务 review、Fix Round 和全分支复审；结论为 **CLEAN，在本轮承诺范围内无未关闭的 P0–P2**。以下“延期/接受”项仍然是 backlog，不应被解释为已实现。

### P0 / P1

| Finding | 状态 | 处置与证据 |
|---|---|---|
| P0 Solved spawn Y 被再次加地形高 | **已修复**（`374fdc1`、`466ccc9`） | Layout/Compiler/Babylon/legacy World 共用三角面地形采样；Subject Anchor 作为绝对世界变换复制，非平地 placement、G Bot、rigged artifacts 已迁移并由 verifier 锁定。 |
| P1-1 双 G Bot Definition | **已修复**（`74a90e3`） | 单一 `humanoid.g-bot@1`，无 `.ground` alias；CLI/Browser 同 Ref、同 hash、同六个 sockets。 |
| P1-2 25 clips 与四态 selector 不一致 | **延期** | 归入 Semantic Action / State Binding 切片；本轮不扩充公共 ActionId，不把资产 inventory 冒充运行时行为。 |
| P1-3 Solved spawn yaw 丢失 | **已修复**（`374fdc1`） | `spawnSubjectFacingRadians` 进入 ExecutionPlan，Runtime 初始化与 reset 保留权威 yaw。 |
| P1-4 Playground 静默改 AuthoringSpec | **已修复**（`6e4fe07`、`dd55c17`） | 输入保持不变；成功、normalize failure、compile failure 都返回深冻结、闭合联合的 `hostOverlay`，无 option 时字段 absent。 |
| P1-5 Catalog 能力假 implemented | **当前 Catalog 已关闭**（`6825733`、`03782db`） | Browser/Authoring/Compiler 共同验证实际 kernel/profile/control/camera/medium/action 能力；mount/seat/tether 保持不可执行，reserved relationship 不能进入 Plan。五个仍实现的 kernel 通过真实 runtime smoke 覆盖。 |
| P1-6 `Beta_Joints` 按名字过滤 | **不接受该修法** | `Beta_Joints` 是 provider-specific 名称，名字本身不能证明是辅助网格。若产品资产需要排除 mesh，应在资产预处理或 Registry inventory 中显式声明，不能在 Runtime 增加名称启发式。 |
| P1-7 spawn 不校验水/地标 | **已修复**（`6825733`、`03782db`、`5fb8a43`） | 共享 Testkit 做严格 3D capsule/footprint 相交；Compiler/World 仅适配数据。覆盖 blocked water、静态 blocker、胶囊边缘、非均匀 primitive 长轴，并保留高空和顶面接触的合法情况。 |
| P1-8 `bindControl` 清零旧主体速度 | **延期** | 控制权切换时速度继承/停止属于产品语义，需要明确 receipt 与接管策略；本轮不改变既有行为。 |
| P1-9 Playground `dispose()` 未 await | **延期** | 需要单独冻结 Host 生命周期 API（sync/async dispose、退出时序、错误传播），不能只改变一个调用点。 |
| P1-10 Playground 未声明 Registry 依赖 | **已修复**（`6e4fe07`） | `@whitebox-world/playground` 已声明直接 workspace dependency，lockfile importer 同步。 |

### P2 与长期边界

- **地形/空间 authority 已修复。** 三角网格 surface、绝对 Anchor Y、yaw 与 reset 已统一；Verifier 不再只在 flat fixture 上假绿。
- **Canonical JSON 边界已加固。** 非 plain prototype、Map/Set/Date/TypedArray/class/null-prototype、symbol key、Array subclass、稀疏 Array、Array 额外 own key 均拒绝；合法 `__proto__` 数据键保留且不再产生 hash collision。
- **构图状态已诚实。** reference image 或 `composition.guide` 都必须经过 Host 重算、绑定 plan identity 的持久 report 才能晋升；写盘使用事务 promotion。`grassland` 可为 `verified`，两个 reference scene 保持 `whitebox-built`，没有伪造成功。
- **输入语义保持原状。** Space=brake、flight lateral 同时影响 yaw/roll 等是已有公开行为，本轮按范围明确不改；若产品要变更，应版本化 Command/Profile，而不是顺手改 Runtime。
- **动画 fall/land、混合中断、骨空间 socket 单位、Session/Receipt、async dispose、solver profile lock** 仍是明确 backlog。
- **Three/Rapier 与 Babylon/Havok 双栈** 是当前阶段边界，不是本轮可删除的重复代码；Canonical Schema/IR/ExecutionPlan 仍不得泄露 provider 句柄或 URI。

### 最终验证

- Focused closure gates：85/85；最终全分支复审 focused：117/117。
- `pnpm typecheck`、`pnpm test`（571/571）、`pnpm test:scenes`（26/26）、`pnpm build`：通过。
- `verify:canonical`、`verify:placement-layout`、`verify:rigged-subject`、`verify:g-bot-subject`：通过。
- `grassland`、`sunlit-flower-bay`、`world-08170639-54db` 的 `plan:scene:check`：通过。
- 全分支独立复审：CLEAN；无 artifact、temp、backup、server/process residue。
