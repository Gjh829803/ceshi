# Route Graph / Traversability 独立架构设计审查

本文是对 `9d1e47e` 新增 Route Graph 设计的独立审查，不复述作者自审结论。
作者审查声称「无开放 P0/P1/P2」；本审查回当前 main 源码、安装版 Babylon/Havok
与相邻规格后，**不接受该结论**。

本文只做设计审查。不修改原规格，不实现功能，不更新金标，不提交代码。

## 1. 审查元数据

| 项 | 值 |
| --- | --- |
| 模式 | A 设计规格审查；因规格规定移动、支撑、固定 Tick 与 Browser/CLI Runtime Gate，额外完整应用 `runtime-deep-review-checklist.md`（D4/D5/D6） |
| 对象 | `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md` |
| 对象状态 | Reviewed / Field Freeze Pending。公共字段未冻，代码未实现 |
| 分支 / HEAD | `main` / `9d1e47e6e54192000d063dbe07a7976d65b68019` |
| 该提交内容 | 仅 9 个 Markdown 文件（`+628/-35`）。无 TypeScript、Schema、Fixture、Validation 包 |
| Runtime 依赖 | lockfile：`@babylonjs/core@9.21.2`、`@babylonjs/havok@1.3.14` |
| 证据层级 | 仅 `static-read`。没有把文档互引、作者自审或 typecheck 写成运行证据 |

本次实际执行：

| 命令/检查 | Exit code | 结论 |
| --- | ---: | --- |
| `git rev-parse HEAD` | 0 | SHA 与审查基线一致 |
| 阅读对象规格、作者审查、`docs/18`、Placement / Validation / Hybrid / Terrain / AI Geometry、README、AGENTS、Runtime checklist | — | 见下文引用 |
| 对照 `packages/authoring`、`layout-solver`、`subject-registry`、`runtime-babylon`、`runtime-contracts`、`world` | — | 设计未落地；现网权威与规格假设不一致处见 P1 |
| 阅读安装源码 `node_modules/.pnpm/@babylonjs+core@9.21.2/.../Physics/v2/characterController.js` | — | `maxStepHeight` 是跨阶严格上限，并与胶囊半径/斜坡接触高度耦合 |
| 阅读 Recast `Recast.h`、Godot `NavigationMesh` 官方页 | — | Agent 半径/身高/坡度/步高是烘焙参数；Link 与普通 walk 分离 |
| `pnpm typecheck` / `pnpm test` / `pnpm build` / 任何 `worldkit verify` | 未跑 | 本次无新代码可验收。作者审查声称的 typecheck 0 不构成本审查证据 |

对照过、但**不能当成已交付能力**的缺口：

- `packages/validation/` 不存在。
- 仓库内无 `connected-by-route`、`TraversalGraph`、`TraversalDriverProfile`、`worldkit verify route`。
- `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md` **不在本 HEAD**。R0 不能假定 P1.5 已清除双速度/双步高。

## 2. 旧结论复验

引用旧审查前均回当前 HEAD 复验。

| 旧结论 | 出处 | 本审查 |
| --- | --- | --- |
| 无开放 P0/P1/P2 | 作者审查 §3 | **已失效**。作者自审处理了术语、Hash 自引用、V3 污染和双 Gate 方向，但没有对照 free-ground 每 Tick 覆写步高/坡度、Heightfield `surfaceId` 合同、走廊闭合语义、现网两条 Route 方言 |
| `Walkable Surface` 应收敛为 `Traversal Surface`，禁止全局 `walkable: true` | 作者审查 §2.1；Hybrid 审查「Surface 只能引用 Collider Subshape」 | **成立**。`Traversal Surface` 比 Walkable Surface 准确：它是候选通行语义，不是所有主体共享的布尔真相 |
| `connected-by-route` 不进已发布 V3 | 作者审查 §2.2；Placement §4.3；`docs/18` R0 | **成立**。现网 `PlacementConstraintSpecV1` 无该 Kind |
| Graph Hash 不自引用 | 作者审查已处置表 | **成立**。对象规格 §6.1 由 Compiler/Index 对 Canonical Bytes 计算 |
| 完整同 XZ 桥面/桥下 Runtime 归 P2.6 H1/M10 | 作者审查 §2.3；对象规格 §10 | **成立**。R1b 只收普通静态平台，合同保留分层 3D 节点 |
| Hybrid：Runtime 落地只由物理接触 + 唯一 Resolver 拥有 | Hybrid 规格 §2.5、Hybrid 审查结论 | **方向仍成立，合同未闭合**。Hybrid §5.4 仍把「失去支撑的固定 Tick 语义」写给 Surface，与本规格 §4 冲突 |
| README / `docs/18` 标明 Route Graph 未实现 | README 能力表；`docs/18` M5 开放项 | **成立**。D3 对拍基本诚实，没有把成稿规格写成已交付 |

## 3. 对八个审查问题的结论

### 3.1 根因覆盖

问题类别（过高台阶、过陡坡、Collider 缝、窄踏面、低净空、错误碰撞体、路线断开、错误高度层、Graph 与 Controller 分歧）在对象规格 §2、§9.3、§11 **被点名了**。当前仍可「Build/Render 成功但不可玩」的漏洞，不是类别没想到，而是：

1. 现网 Agent 入口是 `OutdoorWorldSpec` + `plan:scene:check` 的 Heightfield 坡度采样，不是 Canonical `connected-by-route`。
2. 现网 Placement `within-slope-limit` 只采 Heightfield 三角面，墙/台阶/缝不会让 Solver 失败。
3. R1b 把「当前人形 Profile = 0.3m」当成单一oracle，但 Canonical free-ground 每 Tick 把 `maxStepHeight` 写成 `0.35`。
4. R1 的 `wrongSupportSurfaceCount` 依赖尚未冻结的 Heightfield `surfaceId`。

这些是已确认合同缺口，不是「设计完全没覆盖台阶」。

### 3.2 权威边界

分层方向正确：Collider 是几何真相；Traversal Surface 是绑定 Subshape 的候选语义；Traversal Graph 是按主体 Profile 派生的查询产物；Havok Controller / Ground Support Resolver 是走通与支撑的最终真相；Validation 的两个 Blocking Gate 不能互相覆盖。

名称上，`Traversal Surface` 优于 `Walkable Surface`。

未闭合处：Surface 与 Resolver 谁写失去支撑的 Tick 结果；Graph Filter 是否允许成为第二套坡度/步高物理；Driver Profile 是否允许第二套手感；Probe 记录的 Support Surface ID 在现网 Snapshot 中不存在。

### 3.3 AI-friendly

AI 默认路径（Route + Anchor + Subject + 下一 Major 的 `connected-by-route`）正确，没有要求手写 NavMesh 节点或 Provider 参数。候选约束使用角色限定 ID，不进 V3。

混淆点：`OutdoorWorldSpec.PlannedRoute`（`points` / `width` / `maxSlopeDegrees`）与 Authoring V3 `spatial.routes`（`pointsMetersXZ` / `widthMeters` / `locomotionProfileRef`）是两套公共 Route；`routeTraversalCostSeconds` 的单位与代价公式冲突；走廊是硬约束还是提示未冻。

### 3.4 M5 拆分

R0 → R1 Heightfield → R1b 普通静态平台 → Validation 集成，顺序可实施。M5 完成标准（双 Gate、0.25 过 / 0.35 不过、失败 Fixture 出结构化 Diagnostic、桥双层不冒充完成）足够严。

可验收的前提是 R0 **先**冻：走廊语义、单一 Profile Lock、Heightfield `surfaceId`、Driver 白名单、Graph/Runtime Lock 相等失败码。否则 R1b 的 0.3m 预言无法写成稳定 Fixture。

普通静态平台与 H1/M10 桥面/桥下多层 Runtime **解耦正确**。R1b 只应共享「最小 Traversal Surface → Collider Subshape」字段，不能把 H1 的 Opening/双层 Probe 提前冻进 V3。

### 3.5 真实运行时验证

只验 Graph 连通不足；规格已要求独立 Blocking `route-runtime-conformance`。使用真实 Havok Character Controller、锁定主体、固定 Tick 输入回放合理，也与现网 `FIXED_TIME_STEP_SECONDS = 1/60`、`scene.physicsEnabled = false` 一致。

风险：`TraversalDriverProfile` 可能变成第二套移动参数；30/60/120 Hz-like 只写了原则，没有规定 Probe 禁止读渲染帧、必须只消费固定 Tick 命令队列；Reset/Rebind/边缘跌落/支撑丢失被点名，但没禁止现网 spawn raycast，也没定义 SLIDING / coyote 是否计入 `unexpectedSupportLossCount`。

### 3.6 Schema 与产物

`connected-by-route` 进入下一 Canonical Major、不污染 V3：**正确，必须保持**。

角色限定 ID、`...Ref`、Graph Hash 不自引用：方向正确。

未闭合：Registry Profile 与 Subject resolved lock 没有相等失败码；Heightfield Surface 身份从 H1 才稳定，与 R1 Probe 指标冲突；Validation 规格 §5.4 仍留旧指标名，与本规格 `maximumObserved*` 并存。

### 3.7 长期扩展

jump / drop / climb / swim / mount / vehicle / flight / dynamic platform 必须走 Typed Traversal Link + 独立 Capability/Profile，不能塞进普通 `walk` 边。这个边界正确，也与 Recast Off-mesh、Godot `NavigationLink3D`、Unity NavMesh Link、Unreal Nav Link Proxy 一致。

过早抽象的风险不在分层本身，而在 R0 把 H1 全量 Surface Tick 语义、Graph Builder 安全余量、Driver 手感一起冻进去。

### 3.8 业界对齐

核心原则对齐：Agent 尺寸驱动烘焙；普通表面邻接与显式 Link 分离；NavMesh 是派生查询，不能回写 Collider。Provider 方言不进 Canonical Schema，这个边界正确。

具体差异见 §7。未把未核对的引擎印象写成 P0/P1。

## 4. Findings

分级：P0 = 静默正确性 / 双权威已冻进公共合同 / 冻结边界被破坏；P1 = 违反已陈述合同、命名规则，或按现状实施会得到错误验收预言；P2 = 可维护性、测试矩阵、文档方言；P3 = 后续能力，不构成本切片缺口。

每条标注：`已确认问题` / `设计风险` / `后续能力建议`。

### 无成立的 P0

检查过、但不升级为 P0 的攻击面：

| 攻击面 | 为什么不是 P0 |
| --- | --- |
| 只凭 Graph / 截图 / 总分放行不可玩世界 | 规格 §3.7、§9.2 明确双 Blocking Gate，Graph 不能覆盖 Runtime |
| 把 `connected-by-route` 偷进 V3 | 规格 §5.2、Placement §4.3、`docs/18` R0 都禁止；现网枚举无该值 |
| Graph 正文自带 Hash | §6.1 已改为 Index 对 Canonical Bytes 计算 |
| 用 Recast Poly Ref 当 Canonical ID | §6.1 / §13 禁止 |
| 把完整桥双层 Runtime 算进 M5 | §10 明确归 H1/M10 |
| 字段已经冻错 | 状态是 Field Freeze Pending，错误合同还没进 Schema |
| 当前 0.3m / 0.35m 半径耦合把合法 42° 坡打成墙 | 见 P1-12；G Bot `r=0.35`、`maxStepHeight=0.3` 时，耦合阈值约 81.8°，高于 42° |

没有已冻结的公共字段在生产路径上静默接受不可通行世界。现网不可玩世界能过门禁，是因为 **M5 尚未实现**，不是因为本规格已经冻错。

---

### [P1] [D3/D4] 已确认问题：R1b 的「当前 0.3m Profile」在 Canonical Runtime 上不是单一权威

- 证据（`static-read`）：
  - 对象规格把 R1b 成败钉在「当前人形 Profile 的 `0.3m` 跨阶上限」：

```193:196:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
Graph Builder 使用主体半径侵蚀可走区域，使用主体高度排除低顶区域，按最大坡度排除
坡面，按最大跨阶判断相邻表面。R1b 必须使用当前人形 Profile 的 `0.3m` 跨阶上限证明：
安全余量内的台阶可走，超过上限的立面不可走。不能为了让失败 Fixture 通过而在 Graph
Builder 中另写一个更大的台阶默认值。
```

```331:332:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
- `0.25m` 台阶通过、`0.35m` 台阶在当前 `0.3m` Profile 下失败；
```

  - Physics Body 锁确实是 `0.3m` / `42°`：

```388:393:packages/subject-registry/src/built-in-resource-manifests.ts
  physicsBody: {
    mode: "character",
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  },
```

  - 构造时写入 Controller 的也是 Subject Collider 的 0.3m / 42°：

```217:220:packages/runtime-babylon/src/motion-kernel-runtime.ts
    this.physicsController.maxSlopeCosine = Math.cos(
      (subject.collider.maxSlopeDegrees * Math.PI) / 180,
    );
    this.physicsController.maxStepHeight = subject.collider.maxStepHeightMeters;
```

  - 但 `free-ground` **每个 Tick** 用 motion-profile 参数覆写；兼容 Profile **没有** `stepHeightMeters` / `maximumSlopeDegrees`，于是落入硬编码 fallback `0.35` 和 `50`：

```170:181:packages/runtime-babylon/src/motion-kernel-runtime.ts
    const compatibilityProfile: ExecutionMotionProfileV1 = {
      resourceRef: "worldkit://motion-profile/legacy-ground.compatibility@1",
      motionKernelRef: "worldkit://motion-kernel/free-ground@1",
      parameters: {
        walkSpeedMetersPerSecond: subject.locomotion.walkSpeedMetersPerSecond,
        runSpeedMetersPerSecond: subject.locomotion.runSpeedMetersPerSecond,
        jumpSpeedMetersPerSecond: subject.locomotion.jumpSpeedMetersPerSecond,
        accelerationMetersPerSecondSquared: 24,
        decelerationMetersPerSecondSquared: 30,
        turnRateRadiansPerSecond: 12,
        airControlRatio: 0.35,
      },
```

```397:406:packages/runtime-babylon/src/motion-kernel-runtime.ts
    if (implementationId === "free-ground") {
      this.physicsController.maxSlopeCosine = Math.cos(
        numberParameter(this.activeProfile, "maximumSlopeDegrees", 50) *
          Math.PI / 180,
      );
      this.physicsController.maxStepHeight = numberParameter(
        this.activeProfile,
        "stepHeightMeters",
        0.35,
      );
    }
```

  - 安装版 Havok 把 `maxStepHeight` 当作「不超过则跨上、超过则挡住」的严格上限：

```117:125:node_modules/.pnpm/@babylonjs+core@9.21.2/node_modules/@babylonjs/core/Physics/v2/characterController.js
         * Maximum height the character can automatically step up onto a walkable surface.
         * When greater than 0 the controller enforces this as a strict cap on step climbing,
         * independent of the collision shape's geometry:
         *
         *  - Obstacles whose top is at most maxStepHeight above the character's foot are
         *    climbed (either rolled over naturally by the capsule, or snapped up via the
         *    step-up sweep when the simplex would otherwise be blocked).
         *  - Obstacles taller than maxStepHeight are blocked, even ones the capsule's
         *    rounded bottom would otherwise glide over.
```

  - 作者审查声称「当前 `0.3m` Profile 被传入 Controller」。该断言只看到构造函数，**已复验为不完整**。
  - 规格还另开 `TraversalDriverProfile`，只列举走廊跟随/转向/到达/卡住/最大 Tick，**没有禁止** `walkSpeed` / `maxStepHeight` / 加速度：

```239:241:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
1. 解析并锁定 `TraversalDriverProfile`；它声明 Path Corridor 跟随、转向、到达容差、
   卡住窗口和最大 Tick，Profile Ref/Version/Hash 进入 Evidence；
```

  - 现网速度已经双写：Locomotion Profile 有 `walkSpeedMetersPerSecond: 2.4`，free-ground 又从 motion-profile 读同名字段，缺省再 fallback `2.4`。本 HEAD **没有** P1.5 Control Feel 规格来收口。

- 期望：§4 权威表写明「主体尺寸和运动限制」只来自 resolved Subject/Physics/Locomotion/Capability Lock；Graph Builder 不得自带另一套步高。R1b 的 0.25/0.35 必须相对**实际驱动 Controller 的那一个锁**。
- 影响：按字面实现 R1b 时，Graph 若用 Physics `0.3`，Runtime Probe 在第一 Tick 后用 `0.35`。`0.35m` 台阶在 Havok 语义下是「at most maxStepHeight」，**会跨上去**。Graph 失败 + Runtime 通过，或两边都对齐到 0.35 后失败 Fixture 变成功。M5 无法验收「不可通行世界被阻断」。
- 可复现/失败场景：Canonical 人形、`free-ground`、高度恰好 `0.35m` 的垂直台阶。构造瞬间 Controller 仍是 0.3；`step()` 一次后变成 0.35，人物跨上。Graph 若坚持 0.3 则 Blocking 失败，Runtime Gate 却通过。
- 建议：R0 冻结单一 `resolvedTraversalLockHash`，覆盖 Physics Body、Collider、Locomotion，以及**实际写入** `PhysicsCharacterController.maxStepHeight` / `maxSlopeCosine` 的字段。Driver Profile 做成关闭白名单（走廊、转向政策、到达容差、卡住窗口、最大 Tick），禁止速度/加速度/步高/坡度。R1b 的 0.25/0.35 必须引用该 Lock 的数字，而不是散文里的 `0.3m`。在 P1.5 合入前，Route 实施计划必须把 free-ground 覆写列为阻塞依赖，或在 Probe 路径禁用该覆写。
- 需补测试/门禁：
  1. 合同测试：同一 Subject 的 Physics `maxStepHeightMeters`、Controller 在 Tick 0 与 Tick N、Graph Filter 使用的步高，三者 SHA/数值相等。
  2. R1b：`0.35m` 台阶在**未覆写**的 0.3 Lock 下 Graph 与 Runtime 都失败。
  3. 对抗：Driver Profile 若携带 `walkSpeedMetersPerSecond` 或 `stepHeightMeters`，Admission 以稳定码拒绝。
- 复核：未复核

---

### [P1] [D2] 已确认问题：Route 走廊是硬裁切还是提示，3D 挤出未冻

- 证据（`static-read`）：

```102:107:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
Polyline 是意图走廊和求解边界，不是可通行结论。`pointsMetersXZ` 不承担多层高度真相；
Graph Builder 从起点 Anchor、终点 Anchor、Surface 连通性和真实世界 Y 选择正确高度层。
Route 的 `locomotionProfileRef` 声明该走廊面向的运动类型；`connected-by-route` 仍必须从
`traversingEntityId` 解析完整 Subject/Physics/Collider/Capability Lock。Registry
Compatibility 需要证明二者兼容，不能按 Ref 字符串猜测；不兼容时以
`ROUTE_LOCOMOTION_PROFILE_MISMATCH` 拒绝。
```

```124:126:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
语义固定为：使用 `traversingEntityId` 所绑定并锁定的 Physics Body、Collider、Locomotion
和 Capability Profile，证明两个 Anchor 在指定 Route 走廊中连通。字段不用通用
`subjectId/targetId/params`，也不接受自由文本能力说明。
```

```247:247:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
7. 出现卡住、离开 Route、穿插、悬空、跌落、错误 Surface 或超时即失败；
```

  「意图走廊」「求解边界」「在指定 Route 走廊中连通」「离开 Route 即失败」四句可以读成三种闭合语义：硬 XZ 彩带、仅搜索包围盒、或提示最优路径但允许绕行。竖直范围完全没写：无限挤出薄板，还是跟 Region 一样用 `minimumHeightMeters` / `maximumHeightMeters`。现网 Region 已有可选高度域，Route 没有。

- 期望：R0 必须用关闭枚举冻一种语义，并写 3D 挤出规则。AGENTS.md 要求互斥状态用判别器，而不是重叠散文。
- 影响：墙在 2.4m 走廊正中、旁边 3m 处有可走空地时，Agent 不知道该加宽走廊、拆墙，还是把绕行当成成功。多层平台上，无限竖直挤出会把桥面与桥下收进同一条走廊。
- 可复现/失败场景：`widthMeters: 2.4` 的 polyline 穿过一块 3m 宽石块；石块左侧 1m 处有平行空地。硬走廊 → `ROUTE_REQUIRED_PATH_UNREACHABLE`。软走廊 → Graph 绕行通过。同一 Fixture 在两种读法下验收结论相反。
- 建议：R0 冻 `routeCorridorMode: "hard-ribbon" | "search-bounds"`（不要第三种「提示」）。硬走廊：Graph 与 Probe 都必须留在 XZ 膨胀多边形内，偏离记 `ROUTE_RUNTIME_DEVIATED`。竖直范围显式为 `unbounded` 或 `heightRangeMeters`。修复文案区分「加宽走廊」与「移除阻挡」。
- 需补测试：硬走廊被墙截断；硬走廊外存在绕行不得通过；桥面/桥下同 XZ 走廊不得因无限挤出串层（合同级即可，完整 Runtime 仍归 H1）。
- 复核：未复核

---

### [P1] [D2] 已确认问题：`routeTraversalCostSeconds` 的单位与代价公式冲突

- 证据（`static-read`）：

```198:204:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
### 6.4 代价与确定性

R1 的路径选择成本只由 Profile 中的关闭公式组成：平面距离、坡度代价和跨阶代价。
相同输入、Lock、Profile、Seed、Tile 和预算必须产生同一节点/边顺序、Path 与 Hash。

成本仅用于在多条合格路线中稳定选择，不允许把不可通行边变成“高成本可通行”。浮点
```

```267:269:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
- `routePathDistanceMeters`；
- `routeTraversalCostSeconds`；
- `traversalGraphNodeCount`、`traversalGraphEdgeCount` 和 `traversalGraphHash`。
```

  §6.3 还要求从主体资源解析「Authoring 安全余量和 Graph 量化参数」，但现网 Physics / Locomotion / Collider Profile 都没有这些字段。把距离代价换成秒，必须用速度；速度现网双权威（见上条）。

- 期望：数值字段名自带单位，且公式量纲与字段名一致。代价若只用于排序，就不要叫 `Seconds`，或公式锁到已锁定速度，禁止 Builder 默认余量改写 0.25/0.3 结论。
- 影响：实现者为了填 `Seconds` 会从 Locomotion、motion-profile 或 Driver 里再读一套速度。两条等长路线因「安全余量」或不同速度源得到不同 Hash；更糟的是用余量把 0.35m 边变成高成本可走，直接违反 §6.4。
- 可复现/失败场景：同一世界两条合格绕行，一条更长但更平。Builder A 用 `distance/2.4`，Builder B 用 `distance/4`（跑步速度）。`routeTraversalCostSeconds` 与 Path 选择、Graph Hash 都变。
- 建议：拆成 `routePathCost`（无单位排序键，公式关闭且不含速度）和可选的 `estimatedTraversalDurationSeconds`（只用锁定 walk 速度，禁止余量）。Authoring 安全余量若存在，必须住在已锁定 Profile 里，并写明「只侵蚀净空，不放宽 `maxStepHeightMeters`」。
- 需补测试：同输入 Hash 稳定；公式禁用速度后 Path 选择不依赖 walk/run；余量不得让 0.35m 边变成可走。
- 复核：未复核

---

### [P1] [D2/D4] 已确认问题：R1 Probe 要记 Support Surface ID，Heightfield 身份合同还不存在

- 证据（`static-read`）：

```244:245:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
5. 每 Tick 记录 Subject Position、Support Surface ID、Movement Medium、Collision/Action 和 Progress；
```

```281:282:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
- `unexpectedSupportLossCount`；
- `wrongSupportSurfaceCount`；
```

```158:159:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
Graph 节点至少保存稳定 `id`、`surfaceId`、`positionMetersXYZ`、所在 Tile、可用净空和
来源 Collider/Subshape 证据。
```

  Hybrid 把稳定 Surface 身份推迟到 H1，并把 Tick 语义写给 Surface：

```186:201:docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md
- 稳定 Surface ID 与所属 Entity ID；
- 可行走区域或 Collider Subshape 的引用；
- Surface Semantic/Profile Ref；
- 坡度、净空、单/双面和边缘策略；
- 允许的 Locomotion/Subject Profile；
- 进入、离开和失去支撑时的固定 Tick 语义。
```

```199:201:docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md
Surface 身份从 H1 起稳定：由所属 Entity ID、Registry 中稳定的逻辑 Subshape ID 和
resolved Kit/Resource Version 派生。不得使用数组序号、Runtime Handle、Tile 拆分、Render
LOD 或加载顺序作为身份组成部分。
```

  现网 Snapshot 只有 `movementMedium`，没有 Surface ID：

```100:107:packages/runtime-contracts/src/runtime-session.ts
export interface SubjectRuntimeStateV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  positionMetersXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  movementMedium: "ground" | "air" | "water";
  activeActionId: string;
```

  Hybrid 查询草案用的是 `surfaceEntityId`，与本规格 `surfaceId` 不是同一个词：

```314:318:docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md
interface SupportSurfaceHit {
  readonly surfaceEntityId: string;
  readonly supportPointMetersXYZ: readonly [number, number, number];
  readonly normalXYZ: readonly [number, number, number];
  readonly distanceMeters: number;
```

- 期望：R1 是纯 Heightfield，也必须有一个**本切片即可冻**的逻辑 ground `traversalSurfaceId`（例如 terrain entity + 稳定逻辑 subshape）。Probe 字段与 Runtime Snapshot 同期出现。Surface 只提供数据；`isGrounded` / 失去支撑只由 Resolver 每 Tick 一次 `checkSupport` 写入。
- 影响：不冻身份，`wrongSupportSurfaceCount` 无法测，或实现者用 Mesh 名、Tile 序号、AABB 顶冒充 Surface。Hybrid §5.4 若被 R1b「共享最小合同」原样搬过来，Surface 会和第二份 grounded 推导一起进 M5。
- 可复现/失败场景：R1 缓坡 Heightfield。Probe 要填 `wrongSupportSurfaceCount`，现网没有可引用的 ID。实现者用 `"terrain"` 字符串或 height sample 伪造身份；H1 桥面出现后同一 XZ 无法区分层。
- 建议：R0 只冻 Heightfield 最小身份：`traversalSurfaceId` + `surfaceEntityId` + `colliderSubshapeId`。不要在 M5 冻「进入/离开/失去支撑的固定 Tick 语义」。Hybrid 查询类型与 Graph 节点、Probe 收据使用同一字段名。
- 需补测试：R1 全 Tick 的 `traversalSurfaceId` 稳定且可哈希；改 Tile 拆分不改 ID；R1b 错误 Surface 身份 Fixture 输出 `ROUTE_SURFACE_PROFILE_MISSING` 或错误身份码，而不是比较 Mesh 名。
- 复核：未复核

---

### [P1] [D1/D2] 已确认问题：当前 Agent 白模入口的 Route 方言不在 M5 Gate 上

- 证据（`static-read`）：对象规格把路线意图钉在 Canonical `spatial.routes`：

```87:99:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
### 5.1 复用现有 Route

R1 不新增第二个 `paths`、`navigationRoutes` 或 `walkways` 集合。继续使用现有
`spatial.routes`：

{
  "id": "spawn-to-watchtower",
  "kind": "polyline-xz",
  "pointsMetersXZ": [[-12, 18], [-4, 10], [3, 2], [8, -6]],
  "widthMeters": 2.4,
  "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
}
```

  现网 Authoring V3 确实是这组字段：

```66:72:packages/authoring/src/types-v3.ts
export interface RouteSpecV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}
```

  AGENTS.md / playground 的 Planner 入口是另一套公开 Route，字段名和单位规则都不同，坡度是唯一硬检查：

```98:105:packages/world/src/world-spec.ts
export interface PlannedRoute {
  id: string;
  points: readonly Vec2Tuple[];
  width: number;
  priority: "primary" | "secondary";
  maxSlopeDegrees: number;
  evidence: WorldPlanEvidence;
}
```

```139:146:packages/world/src/planning-artifacts.ts
  return {
    routeId: route.id,
    samples,
    steepestDegrees,
    ...(steepestAt === undefined ? {} : { steepestAt }),
    limitDegrees: route.maxSlopeDegrees,
    pass: samples > 0 && steepestDegrees <= route.maxSlopeDegrees,
  };
```

  Placement 现网坡度检查同样只采样 Heightfield，不看静态台阶/墙/缝：

```414:452:packages/layout-solver/src/evaluators.ts
function evaluateSlope(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "within-slope-limit" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const terrain = context.geometry.heightfieldsByTerrainEntityId[constraint.terrainEntityId];
  // ...
  const samples = points.map((point) => sampleHeightfieldV1(terrain, point));
```

  `definePlannedOutdoorScene` 只做 WorldSpec 校验，不生成 Authoring V3，更不跑连通 Gate：

```368:384:packages/world/src/scene.ts
export function definePlannedOutdoorScene(
  definition: Omit<OutdoorSceneDefinition, "kind" | "version" | "worldSpec"> & {
    kind?: "outdoor";
    version?: 1;
    worldSpec: OutdoorWorldSpec;
  },
): OutdoorSceneDefinition {
  const diagnostics = validateOutdoorWorldSpec(definition.worldSpec, definition.id);
```

- 期望：一个概念一个词。要么 R0 写明「OutdoorWorldSpec Route 仍只是规划坡度证据，不构成可玩证明」，并给 Planner→Canonical 的唯一映射；要么 M5 完成标准包含当前 Agent 白模入口。
- 影响：用户陈述的失败模式——场景生成并渲染、人物被台阶/平台挡住——走的是 WorldSpec / `plan:scene:check`。按本规格做完 R1，这条入口仍然只检查 Heightfield 坡度。AI 还会继续写 `maxSlopeDegrees` 和 `width`，与 `locomotionProfileRef` / `widthMeters` 并列。
- 可复现/失败场景：现有 playground 规划场景加一段 0.4m 白模台阶，Heightfield 走廊坡度 < 35°。`plan:scene:check` 通过，人物卡住。M5 若只挂在 Authoring V3 包上，该场景仍算「合格规划」。
- 建议：R0 增加一页「规划 Route → Canonical Route」：字段对照、单位、谁拥有坡度上限（Route 声明 vs 主体 Lock）。`docs/18` / AGENTS 写清：WorldSpec 坡度通过 ≠ M5 可玩。不要把 `maxSlopeDegrees` 再引进 V3 Route。
- 需补测试：同一条走廊的 WorldSpec 坡度通过 / Canonical `connected-by-route` 失败，必须同时存在且不得互相覆盖。禁止新的公共同义字段。
- 复核：未复核

---

### [P1] [D4] 已确认问题：Hybrid Surface 与本规格把「失去支撑」派给了两个所有者

- 证据（`static-read`）：本规格权威表把实际支撑只给 Havok Resolver：

```79:80:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
| 实际支撑与移动结果 | Havok Character Controller / Ground Support Resolver | Terrain Height 或 Route Graph 独立写 `isGrounded` |
| 生产通过决策 | Validation Report | 单独脚本日志或总体分数覆盖 Blocking Failure |
```

  Hybrid §5.4 却要求 Traversal Surface 负责「进入、离开和失去支撑时的固定 Tick 语义」（见上条引用，Hybrid 186–191 行）。`docs/18` 又要求 R1b **共享** 最小 Traversal Surface 合同：

```184:186:docs/18-refactor-progress-and-backlog.md
- [ ] R1b 与 P2.6 H1 共享最小 Traversal Surface → Collider Subshape 合同，覆盖地形、
  台阶、坡道和普通静态平台；`0.25m` 台阶通过，`0.35m` 台阶在当前
  `0.3m` 人形 Profile 下失败。
```

- 期望：checklist §1 与 Hybrid §2.5——落地状态只有一个所有者。Surface 提供迟滞阈值、允许 Profile、边缘策略；Resolver 每 Tick 一次 `checkSupport` 才写 grounded / support-loss。
- 影响：R1b「共享最小合同」若把 Hybrid 子弹列表整段搬来，M5 会重新引入刚在 Heightfield 路径上清理过的双权威。Graph、Surface、Resolver 可能在同一 Tick 对「还在台上」给出三个答案。
- 可复现/失败场景：0.25m 台阶上升过程中 Havok 短暂 `SLIDING`。Surface 按自己的离开 Tick 记 support-loss，Resolver 仍视为接触。`ROUTE_RUNTIME_SUPPORT_LOST` 误杀合法 R1b。
- 建议：R0 的共享最小合同只含：稳定 ID、Collider Subshape Ref、允许的 Locomotion/Capability、坡度/净空/边缘**数据**。明确删除或改写 Hybrid §5.4 最后一颗子弹（这是给后续规格修订的建议；本次不改规格）。
- 需补测试：同一 Tick 只允许一处写入 support 状态；Surface 变更不得在 Resolver 之前改变 `movementMedium`。
- 复核：未复核

---

### [P1] [D5/D6] 已确认问题：对抗矩阵没有坡度失败 Fixture，现网坡度检查也挡不住静态斜面

- 证据（`static-read`）：§2 把「坡度过大 / Route 只过 Heightfield 坡度却被静态物阻断」列为当前可编译世界。§11 只有「连续平地与缓坡 → 通过」，没有 `ROUTE_SLOPE_EXCEEDED` 失败行。诊断码已经存在：

```297:298:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
- `ROUTE_STEP_HEIGHT_EXCEEDED`；
- `ROUTE_SLOPE_EXCEEDED`；
```

  R1 完成标准写「覆盖坡度」，但没有失败预言。现网 `within-slope-limit` 只问 Heightfield（见 P1 WorldSpec 条）。Validation 规格仍留一组旧指标名，且「当前阶段只承诺室外人形 Heightfield Route」，与 M5 的平台扩展并置：

```236:245:docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md
- Spawn 位于 Terrain 内且不在禁止 Water/Collider；
- `requiredSpawnReachableRatio`；
- `unreachableRequiredRouteCount`；
- `maximumRouteSlopeDegrees`；
- `minimumRouteClearanceMeters`；
- `maximumStepHeightMeters`；
- `minimumRouteWidthMeters`；
- 固定 Locomotion Script 的完成状态、耗时 Ticks 和异常位移。
```

- 期望：每个已命名诊断码至少有一条 Canonical 失败 Fixture。Blocking 指标一票否决，不被 `requiredSpawnReachableRatio` 或旧 `maximumRouteSlopeDegrees` 平均值吃掉。
- 影响：实现者可以用 Heightfield 缓坡 happy path 关掉「覆盖坡度」。静态 50° 斜面平台会重现「渲染成功、走不过去」，且可能只落到笼统的 `ROUTE_REQUIRED_PATH_UNREACHABLE`，Agent 不知道该改坡还是改台阶。
- 可复现/失败场景：Heightfield 上一段 48° 斜坡（高于锁定 42°，低于 free-ground fallback 50°——也同时打 P1 双权威）；以及一块带 Traversal Surface 的 50° 静态斜面，Heightfield 走廊本身平缓。
- 建议：§11 增加两行失败：Heightfield 超坡、静态斜面超坡，都期望 `ROUTE_SLOPE_EXCEEDED`。R0 删除或降级 Validation §5.4 旧指标，避免和 `maximumObservedSlopeDegrees` 双名。
- 需补测试：上述两条失败 Fixture 走完整 Authoring → Compiler → Runtime → Report；总体构图分数不得覆盖。
- 复核：未复核

---

### [P1] [D2/D4] 已确认问题：Graph 构建 Lock 与 Runtime Probe Lock 没有相等失败码

- 证据（`static-read`）：规格要求「同一 Runtime Backend 和锁定主体」，并有 `ROUTE_LOCOMOTION_PROFILE_MISMATCH`（Route 走廊 Ref vs traversing Entity）。没有 `ROUTE_PROFILE_LOCK_MISMATCH` / `ROUTE_TRAVERSAL_LOCK_MISMATCH` 覆盖：Physics Body Hash、Collider Hash、实际 Controller 步高/坡度、Capability、Driver Profile。§9.3 诊断列表到 `ROUTE_GRAPH_BUDGET_EXCEEDED` 为止，不含 Lock 相等。Validation 规格 §10 的 Route 码还更少，缺 `ROUTE_SLOPE_EXCEEDED`、`ROUTE_START_SURFACE_NOT_FOUND`、`ROUTE_LOCOMOTION_PROFILE_MISMATCH`、`ROUTE_RUNTIME_DEVIATED`。

  Registry 侧，Locomotion 与 Physics 是不同资源：`ground.standard` 仍带 walk/run/water/jump 速度；`character.medium` 带 42°/0.3m。Subject 解析锁与 Graph Builder 声明的 Profile 可以各取一条。

- 期望：每次 Graph 构建与每次 Runtime Probe 的 Evidence 携带同一组 Ref/Hash；不等则 `incomplete`/`failed`，稳定码，禁止继续走路径。
- 影响：Graph 用 G Bot 胶囊 `r=0.35`，Probe 用 Golden `r=0.32`，或 Graph 用 0.3 步高、Probe 用 0.35 fallback。一边通过一边失败时，Agent 会改错几何。
- 可复现/失败场景：同一 `connected-by-route`，Graph Builder Profile 钉 `character.medium`，Probe 实际绑定带 `stepHeightMeters: 0.35` 的 motion-profile。
- 建议：R0 增加关闭码 `ROUTE_PROFILE_LOCK_MISMATCH`，Evidence 列出期望/实际 Hash。Validation §10 与本规格 §9.3 对齐成同一份码表。
- 需补测试：故意错配 Physics / Locomotion / Driver Hash，Admission 在 Query 前失败；Hash 相等时才允许比较 Graph 与 Runtime。
- 复核：未复核

---

### [P1] [D4] 设计风险：Runtime Probe 未禁止现网 spawn raycast 与 AABB `supported-by`

- 证据（`static-read`）：规格 §8.2 要求 Reset 到「合法 Spawn」，但没定义合法、也没禁止旁路。

```224:226:packages/runtime-babylon/src/motion-kernel-runtime.ts
    this.initialGroundSupportPending = this.hasWalkablePhysicalGroundAt(
      spawnSubjectOrigin,
    );
```

```341:366:packages/runtime-babylon/src/motion-kernel-runtime.ts
  reset(): void {
    const spawn = new Vector3(...this.subject.spawnSubjectOriginPositionMetersXYZ);
    // ...
    this.initialGroundSupportPending = this.hasWalkablePhysicalGroundAt(spawn);
    this.currentMovementMedium = this.movementMediumForSupport(
      CharacterSupportedState.UNSUPPORTED,
    );
  }
```

```1142:1156:packages/runtime-babylon/src/motion-kernel-runtime.ts
  private hasWalkablePhysicalGroundAt(subjectOrigin: Vector3): boolean {
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) return false;
    const castHeightMeters = 0.25;
    const castDepthMeters = Math.max(
      0.5,
      this.subject.collider.maxStepHeightMeters + castHeightMeters,
    );
    const result = physicsEngine.raycast(
      subjectOrigin.add(this.up.scale(castHeightMeters)),
      subjectOrigin.subtract(this.up.scale(castDepthMeters)),
    );
    return result.hasHit &&
      result.hitNormalWorld.dot(this.up) >= this.physicsController.maxSlopeCosine;
  }
```

```1138:1139:packages/runtime-babylon/src/motion-kernel-runtime.ts
    if (this.initialGroundSupportPending) return "ground";
    return supportedState === CharacterSupportedState.UNSUPPORTED ? "air" : "ground";
```

  Object `supported-by` 运行时仍用 AABB 顶：

```231:240:packages/runtime-babylon/src/babylon-world-runtime.ts
  const supporting = boundsByEntityId[assertion.supportingEntityId];
  if (supporting === undefined) return false;
  // ...
  const gap = Math.abs(bottom - supporting.maximumMetersXYZ[1]);
  return gap <= assertion.maximumSupportGapMeters + supportGapTolerance &&
    ratio + 0.000001 >= assertion.minimumSupportRatio;
```

  `docs/18` P2.6 已把这两条旁路列为 H1 收口，并写「不把它们当作当前 Heightfield 场景的紧急 Bug」。M5 R1 却要把 Reset 后的支撑当生产证据。

- 期望：Runtime Gate 从 Reset 后的第一个模拟 Tick 起，只信 `checkSupport`。射线与 AABB 顶不得把 `movementMedium` 写成 `ground`，也不得让 `supported-by` 冒充起点合法。
- 影响：起点悬空但射线打到下方 Heightfield 时，Probe 第 0 Tick 已是 `ground`，`unexpectedAirborneDurationTicks` / `ROUTE_START_SURFACE_NOT_FOUND` 被吃掉。视觉盒子顶对齐、Collider 更矮的平台会被当成可站。
- 可复现/失败场景：Spawn 抬高 0.4m（大于 0.3、小于射线深度 0.55）。`hasWalkablePhysicalGroundAt` 为 true，`initialGroundSupportPending` 把 medium 钉成 `ground`，人物下落前 Gate 可能已记「起点可站」。
- 建议：Route Runtime Gate 合同写死：Reset 后清除 `initialGroundSupportPending` 旁路，或 Probe 专用装配不安装该旁路。起点合法性 = 第一 Tick `checkSupport === SUPPORTED` 且命中声明 Surface。
- 需补测试：悬空 Spawn、水中 Spawn、AABB 顶高于 Collider 顶的平台。Reset / Rebind 后立即 snapshot，不得出现射线伪造的 ground。
- 复核：未复核

---

### [P1] [D6] 设计风险：`unexpectedSupportLossCount` 没有迟滞，SLIDING 语义未定义

- 证据（`static-read`）：规格把 `unexpectedSupportLossCount` / `ROUTE_RUNTIME_SUPPORT_LOST` 列为 Blocking，但没说哪一个 `CharacterSupportedState` 算丢失，也没说 coyote 窗口内是否计数。

  安装版枚举是 `UNSUPPORTED | SLIDING | SUPPORTED`（`characterController.js` 10–15 行）。`checkSupport` 在速度被坡度偏转时标 `SLIDING`（1144–1153 行）。现网把非 `UNSUPPORTED` 都映射成 `ground`，并给 coyote 默认 `0.1s`（约 6 个 60Hz Tick）：

```411:429:packages/runtime-babylon/src/motion-kernel-runtime.ts
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    const unsupported =
      support.supportedState === CharacterSupportedState.UNSUPPORTED;
    // ...
    if (!unsupported) {
      this.coyoteRemainingSeconds = numberParameter(
        this.activeProfile,
        "coyoteTimeSeconds",
        0.1,
      );
```

- 期望：Probe 与玩法共用同一 support 权威和同一迟滞。R1 连续台阶的合法瞬时 SLIDING / 单 Tick UNSUPPORTED 不得误杀。
- 影响：0.25m 成功 Fixture 在跨阶时被 `ROUTE_RUNTIME_SUPPORT_LOST` 打成失败，Agent 会把合法台阶改成更平的坡，或反过来放宽阈值把真跌落放过去。
- 可复现/失败场景：R1b 成功台阶。跨阶 Tick 出现 `SLIDING`。若 Probe 把非 `SUPPORTED` 都计数，`unexpectedSupportLossCount >= 1`，Blocking 失败。
- 建议：R0 冻：丢失 = Resolver 在 coyote 耗尽后仍为 `UNSUPPORTED`；`SLIDING` 单独记录，默认不记 support-loss。`unexpectedAirborneDurationTicks` 用连续 Tick 阈值，不用单帧。
- 需补测试：成功台阶的 SLIDING 不失败；真正走下无续台的边缘必须失败；Reset 后 coyote 不得继承。
- 复核：未复核

---

### [P1] [D4] 设计风险：Graph 的独立坡度/步高过滤是第二套物理，未对齐安装版 Havok 耦合

- 证据（`static-read`）：§6.3 把 `maxSlopeDegrees` 与 `maxStepHeightMeters` 写成两个独立过滤器。安装版 Controller 文档写明：斜坡接触升高超过 `maxStepHeight` 时，斜坡也会被降级为墙：

```127:133:node_modules/.pnpm/@babylonjs+core@9.21.2/node_modules/@babylonjs/core/Physics/v2/characterController.js
         * This is enforced by demoting any "walkable" contact that sits more than
         * maxStepHeight above the foot into an extra horizontal wall constraint, so the
         * step-height limit does not depend on the capsule radius. As a documented side
         * effect, slopes whose contact rises above maxStepHeight (roughly when
         * `capsuleRadius * (1 - cos(slopeAngle)) > maxStepHeight`) are also treated as
         * walls. Pick maxStepHeight large enough to clear the slope angles you want to
         * remain walkable, or rely on `maxSlopeCosine` alone (with maxStepHeight = 0)
         * when the rounded-capsule riding behavior is acceptable.
```

  对**当前** G Bot（`radiusMeters: 0.35`，`maxStepHeightMeters: 0.3`）验算：`0.35 * (1 - cos θ) > 0.3` ⇒ `θ ≳ 81.8°`，高于 Body 的 42°。Golden `r=0.32` 更晚才触发。因此这不是当前金标人物的产品 bug。

  若未来 Lock 变成 `maxStepHeightMeters: 0.08`、`r=0.35`，则 `θ ≳ 39.5°`，**低于** 42°：Graph 会放行、Havok 会当成墙。

- 期望：Graph Filter 不得发明与 Controller 不等价的几何规则。业界 NavMesh 烘焙本来就是 Agent 参数近似，所以本仓才要求 Runtime Gate 作最终真相；但 Filter 仍应尽量等价，并有对抗 Fixture 锁住耦合。
- 影响：换更矮步高或更大半径后，出现「Graph 通、人物在合法坡度上像撞墙」。双 Gate 会挡住生产，但 Diagnostic 会指向错误的 `ROUTE_SLOPE_EXCEEDED` 或 `ROUTE_RUNTIME_STALLED`。
- 可复现/失败场景：专用测试 Profile `radiusMeters=0.35`、`maxStepHeightMeters=0.08`、`maxSlopeDegrees=42`，斜坡 41°。Havok 降级为墙；只比 42° 的 Graph 会放行。
- 建议：R0 写「Graph walk 边必须能被同一锁定 Controller 的步高/坡度/半径规则解释」。不要在 Canonical Schema 暴露 Havok 公式；用锁定版本的等价探针证明。当前金标人物这条是回归，不是 R1 产品失败行。
- 需补测试：上述专用 Profile Fixture；金标 42° 缓坡仍须通过。证据标「已对照 `@babylonjs/core@9.21.2`」。
- 复核：未复核

---

### [P2] [D2] 已确认问题：Hybrid 编译图仍写 `walkable-surface descriptors`

```285:289:docs/superpowers/specs/2026-08-21-hybrid-terrain-and-non-heightfield-topology-design.md
Structure Compiler
  ├── visual geometry descriptors
  ├── collider descriptors
  ├── walkable-surface descriptors
  └── bounds/resource inventory
```

作者审查用 `rg` 声称无开放命名冲突。该方言仍在依赖规格的数据流里。Agent / 实现者会再做出 `WalkableSurface` 类型。R0 应把这行改成 `traversal-surface descriptors`（建议留给规格修订，本次不改）。

---

### [P2] [D2] 已确认问题：公共字段还有同义与判别器漂移

1. Graph 节点 `surfaceId` vs Hybrid `surfaceEntityId` vs Probe「Support Surface ID」。
2. Graph Edge 用 `type: walk | slope | step`。AGENTS.md：持久节点用 `kind`，Relationship 用 `type`。边更像 Relationship，可接受，但 R0 必须写死，不能和节点 `kind` 混用。
3. Validation §5.4 的 `maximumRouteSlopeDegrees` / `minimumRouteClearanceMeters` / `maximumStepHeightMeters` 与本规格 `maximumObservedSlopeDegrees` 等并存。
4. `widthMeters: 2.4` 是走廊宽，不是胶囊净空。Recast / Godot 用 `walkableRadius` / `agent_radius` **侵蚀**可走区域。规格说了用半径侵蚀，没冻 `clearance = 2 * radius + margin`，margin 也没有 Profile 字段。

建议：R0 字段表一次对齐。净空公式进锁定 Collider/Traversal Profile，禁止 Builder 魔法数。

---

### [P2] [D1/D6] 设计风险：M5 依赖尚未存在的 M4 Validation 包，但不阻塞 R0 合同

`docs/18` §6 顺序是 M4 统一 Validation，再 M5 Route。`packages/validation/` 不存在。Validation 规格 CLI 面甚至还没有 `worldkit verify route`（对象规格 §12 是候选命令）。

这不是「M5 不能做」，而是：R0 不得把未冻枚举偷进 V3；R1 的 Report 形状必须等 M4 字段冻完或与 M4 同一实施计划冻结。作者审查把 D5「稳定排序、Provider 边界已闭合」写成已查——那是设计意图，不是实现闭合。本审查把实现质量留在实施计划审查。

---

### [P2] [D5] 设计风险：出生点不可达被点名，但矩阵没有独立失败行

§2 写了「起点和终点各自可站立，中间没有连接」。§9.3 有 `ROUTE_START_SURFACE_NOT_FOUND`。§11 没有：水中 Spawn、Collider 内 Spawn、悬空 Spawn、起点可站但第一 Tick 即跌落。配合 P1 Reset 旁路，这是最容易漏的「能渲染不能玩」。

建议：R1 增加四条起点失败 Fixture，期望码与 Reset 合同一起冻。

---

### [P3] 后续能力建议：Typed Link 扩展，不要塞进 walk 边

对象规格 §10 / §13 把 jump、drop、climb、swim、mount、vehicle、flight、dynamic platform 留在后续切片，并用显式 Typed Traversal Link。这与已核对的 Godot `NavigationLink3D`、Recast Off-mesh Connection、Unity NavMesh Link、Unreal Nav Link Proxy **一致**。

不要在 R0 预留「先做简单版」的通用 `params` 或把 `step` 边偷偷抬高成 hop。也没有必要为尚未存在的 Provider 先冻 NavMesh 多边形 Schema。

本条不是缺口，是防止后续大重构的边界，应保持。

## 5. 维度覆盖表

| 维度 | 状态 | 证据与结论 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | AI 不手写 NavMesh；R1/R1b 不含 NPC/载具/洞穴。缺口是当前 Planner WorldSpec 入口未接到 Gate（P1） |
| D2 Schema 与 AI-friendly | 已查 | 候选约束角色化、不进 V3、Hash 不自引用。走廊语义、代价秒、Surface ID、旧 Validation 指标名未冻（P1/P2） |
| D3 承诺与事实对拍 | 已查 | README/`docs/18` 标明未实现。作者「0.3m 传入 Controller」与 free-ground 覆写不符（P1）。本审查未跑 typecheck，不沿用作者声明 |
| D4 单一权威状态 | 已查 | 分层方向对。现网步高/坡度/速度双写、spawn raycast、AABB 顶、Hybrid Surface Tick 与 Resolver 冲突（P1） |
| D5 工程质量与可维护性 | 已查（设计级） | 确定性/预算/`incomplete` 原则对。缺坡度失败行与起点失败行。实现质量待代码审查 |
| D6 门禁与证据分层 | 已查 | 双 Blocking Gate 正确。Support-loss 无迟滞；`wrongSupportSurfaceCount` 依赖未冻身份。本次无运行证据 |

Runtime checklist 补充：

| 项 | 状态 |
| --- | --- |
| Authority map | 规格 §4 已写；与现网/Hybrid 未对齐处见 P1 |
| Installed semantics | 已对照 lockfile 9.21.2 / 1.3.14 与 `characterController.js` |
| Adversarial transitions | 类别有，坡度失败/起点失败/SLIDING/半径耦合未写成可验收行 |
| Semantic merge | 不适用（单规格审查，不是运行时三方合并） |
| Evidence layers | 未把设计审查写成 automated-contract |
| Completion gates | 设计未实现；不能宣称 M5 完成 |

## 6. M5 实施顺序是否可验收

可实施，前提是把 R0 当成**真正的字段冻结**，而不是再写一篇方向文。

| 阶段 | 必须先关上的合同 | 验收预言 |
| --- | --- | --- |
| R0 | 走廊 mode；`resolvedTraversalLockHash`；Driver 白名单；Heightfield `traversalSurfaceId`；Lock 相等失败码；代价与秒拆分；`connected-by-route` 只进下一 Major | Schema/示例/生成类型同名；V3 枚举不变 |
| R1 | 共享三角面采样；固定 1/60 Tick；Probe 不读渲染帧；Reset 后只信 `checkSupport` | 平地/缓坡双 Gate 通过；墙截断、超坡、窄道、低顶、缝隙、预算耗尽按码失败；30/60/120 Hz-like 结果一致 |
| R1b | 最小 Surface→Subshape（无 Tick 所有权）；步高以 Lock 为准，不是散文 0.3 | 0.25 双 Gate 通过；0.35 在 Lock=0.3 时双 Gate 失败；错误 Collider/Surface/边缘跌落失败 |
| Validation 集成 | M4 Report 形状或同一计划共冻 | 两 Gate 都是 Blocking；Graph 通 Runtime 失败 → Report `failed`；Evidence 缺失 → `incomplete` |

M5 完成标准已经够严：**不要放松**。不要把「Graph 通了」或「Heightfield 坡度过了」写成完成。桥双层 Runtime 继续留在 M10。

## 7. 业界对齐（已核对出处）

| 来源 | 本审查核对 | 对本设计的含义 |
| --- | --- | --- |
| Recast `rcConfig`：`walkableSlopeAngle` / `walkableHeight` / `walkableClimb` / `walkableRadius`（[Recast.h](https://github.com/recastnavigation/recastnavigation/blob/main/Recast/Include/Recast.h)） | 已核对 2026-08-21 | Agent 参数烘焙可走区域；半径用于侵蚀。本设计「按主体 Profile Filter」对齐。Recast 也是近似，所以必须另做真实控制器 Gate |
| Godot `NavigationMesh`：`agent_radius` / `agent_height` / `agent_max_climb` / `agent_max_slope`；`geometry_parsed_geometry_type` 可选 Static Collider（[官方文档](https://docs.godotengine.org/en/stable/classes/class_navigationmesh.html)） | 已核对 2026-08-21 | 应喂 Collider 而不是视觉 Mesh。`agent_radius` 明确是侵蚀距离，支持「走廊宽 ≠ 净空」这条 P2 |
| Godot `NavigationLink3D`、Unity NavMesh Link、Unreal Nav Link Proxy | 作者审查声称已核；本审查抽查了规格所引链接的存在性，**未逐页重读 Unity/Unreal 全文**，不作为 P0/P1 依据 | 离开表面的运动用显式 Link。本规格 Typed Traversal Link 方向正确 |
| Babylon 9.21.2 `PhysicsCharacterController.maxStepHeight` | 已对照本仓安装源码 | 跨阶严格上限；与半径/斜坡接触高度耦合。Graph 独立过滤是近似，不是 Controller 真相 |

偏离业界、且有影响的点：成熟引擎把 Agent 半径/步高/坡度收在**一套**烘焙参数里。本仓现网把它们拆在 Physics Body、Locomotion、motion-profile fallback 三处，设计又加第四处 Driver。这不是「不该用 Graph」，而是 R0 必须先收成一个 Lock，否则比 Recast 更易漂移。

## 8. 审查结论

架构分层成立，和 Placement、Hybrid、Validation、AI-first 主线一致，也与 Recast/Godot 的 Agent + Link 分责一致。`Traversal Surface` 这个名字比 Walkable Surface 准确。`connected-by-route` 留在下一 Canonical Major 是对的。只验 Graph 不够、必须用真实固定 Tick Controller——这条不能退。

**不能接受作者审查「无开放 P0/P1/P2」。** 没有成立的 P0；有多条成立的 P1。最重的是：R1b 把「0.3m Profile」当成已经存在的单一 Runtime 真相，但 Canonical `free-ground` 每 Tick 把步高写成 `0.35`、坡度写成 `50°`。按现状实施，M5 会验收一套与玩法人物不同的控制器。

当前只能说：方向可采纳，**修改并真正冻结 R0 合同之前不要开始 R1 代码**。本规格、R0/R1/R1b、Validation Gate、台阶/平台通行能力均未实现。
