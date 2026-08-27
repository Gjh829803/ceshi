# Babylon Native Scene Lane 设计

- 状态：Accepted for experimental vertical slice
- 日期：2026-08-27
- 分支：`explore/scene-reconstruction-api`
- 实验参考：用户提供的“云海山门”参考图（本地输入，不纳入仓库）
- 上位生产决策：[ADR-0006](../../decisions/0006-authoring-spec-compiler-architecture.md)
- 当前生产状态：[重构进度与 Backlog](../../18-refactor-progress-and-backlog.md)

## 1. 决策摘要

为“依据参考图还原可读的 3D 结构白模”新增一条隔离的 Babylon Native Scene Lane。它与现有 Canonical
Lane 并存，不取代、不修改现有 Compiler、Terrain、WorldPackage 或生产 Runtime 合同。

```text
Canonical Lane
AuthoringSpec V4 -> Normalizer -> Compiler -> ExecutionPlan V5
                 -> Babylon/Havok Runtime -> formal evidence

Babylon Native Scene Lane（本实验）
small bootstrap JSON + Babylon TypeScript scene module
                 -> Babylon Native Scene Host
                 -> SDK-owned Havok / Subject / Input / Camera
                 -> experimental visual and passability evidence
```

Native Lane 的视觉世界**不经过 Authoring Normalizer、Compiler、NormalizedWorldIR 或
ExecutionPlan 的场景几何投影**。AI 直接使用 Babylon API 创建视觉 Mesh、材质、灯光、雾、天空、
粒子和场景层级。SDK 只接管需要成为玩法权威的集成点：玩家出生、碰撞注册、固定 Tick、动作、相机、
查询和销毁。

本实验的视觉验收不是最终美术还原：优先判断地形拓扑、主路径、关键轮廓、场景内容和空间层次是否能被
AI 稳定读懂；材质精度、PBR 细节和电影级体积光不作为白模通过条件。

第一阶段以实验结论为目标，不宣称生产发布能力。若实验失败，删除本 Lane 不影响 Canonical Lane。

## 2. 背景：为什么当前不走 Compiler

现有 Compiler 解决的是另一组重要问题：

- 对不可信结构化输入进行静态校验；
- 生成确定性 IR、ExecutionPlan、WorldPackage 与 Hash；
- 冻结 Registry 资源和 Gameplay 能力；
- 为 Heightfield Route、布局、Snapshot、ChangeSet 和正式 Gate 提供权威输入；
- 隔离 Babylon/Havok Provider 类型。

这些能力对正式、可验证、可迁移的世界成立，但不是视觉场景还原的主要瓶颈。参考图还原首先需要
Babylon 已经拥有的完整表达力：任意 Mesh 层级、程序化几何、GLB、材质、灯光、雾、粒子、天空和
后处理。如果再建立一套与 Babylon 相似的 AI API，把它投影成自有 Scene Protocol，最后又翻译回
Babylon，会产生以下循环：

```text
AI writes Babylon-like intent
  -> project-owned scene dialect
  -> compiler and adapter mapping
  -> Babylon objects
```

这条循环的直接成本是：

- SDK 必须重新描述并追赶 Babylon 的视觉能力；
- AI 不能直接复用熟悉的 Babylon 代码与文档；
- 材质、灯光和层级语义会在投影中损失；
- 每个效果都要修改 Schema、Compiler、Adapter、类型和示例；
- 协议工作量可能大于真实场景工作量，却不提升画面上限。

因此，本实验要验证一个更直接的假设：

> 对视觉场景使用 Babylon Native Code，对真实物理和 Gameplay 使用 SDK Adapter；只在两者交界处
> 保留一个很薄的注册合同，不对完整 Babylon Scene 做中间协议复制。

## 3. “不走 Compiler”的精确定义

本实验中，下列输入不进入现有 Compiler：

- 山峰、悬崖、岩石、阶梯、平台和山门几何；
- 材质、灯光、雾、云海、天空和后处理；
- Babylon Scene Graph、Transform 层级和实例化；
- 视觉 Mesh 与低精度碰撞代理的创建；
- Entry Composition 的 Native Camera 调试数据。

Native Scene Module 通过普通 TypeScript/Vite 构建成为浏览器代码。它不是 AuthoringSpec，不能伪装成
NormalizedWorldIR、ExecutionPlan 或 WorldPackage。

仍然保留的“编译/校验”只有普通工程构建和薄边界 Admission：

- TypeScript 类型检查与 Vite bundle；
- 固定 Babylon/Havok workspace 版本；
- Scene Module ID、Spawn Marker ID、Collider ID 唯一性；
- Collider Mesh 所属 Scene、有限数值、Vertex/Triangle 与数量预算；
- Vite 内容哈希文件名与浏览器加载失败诊断；当前不产生可信 Build Receipt。

这些不构成第二个场景 Compiler，也不会生成 Canonical IR。

## 4. JSON 的新职责

Native Lane 的 JSON 是小型 Bootstrap，不是完整场景描述：

```json
{
  "kind": "babylon-native-world-bootstrap",
  "schemaVersion": 1,
  "id": "cloud-ridge-native-spike",
  "sceneModuleRef": "app://native-scene/cloud-ridge",
  "sceneModuleId": "cloud-ridge-native-spike",
  "gravityMetersPerSecondSquaredXYZ": [0, -9.81, 0],
  "controlledSubjectDefinitionRef": "worldkit://subject-definition/humanoid.g-bot@2",
  "spawnMarkerId": "player-spawn",
  "cameraRigRef": "worldkit://camera/third-person.standard@1",
  "actionOrPoseSetRef": "worldkit://animation-set/humanoid.ground.g-bot@2",
  "staticCollisionBudget": {
    "maximumStaticColliderCount": 3,
    "maximumStaticColliderVertexCount": 256,
    "maximumStaticColliderTriangleCount": 1000
  }
}
```

它负责：

- 选择 `kind: "babylon-native-world-bootstrap"`；
- 通过闭合 Resolver 引用唯一 Scene Module，并校验其 ID；
- 选择 Subject、动作和相机资源闭包；
- 给出重力、Spawn Marker 精确绑定和碰撞预算；
- 作为 Host 启动与诊断的稳定输入。

它不负责：

- 描述每座山、每级台阶、顶点或材质；
- 创建 Heightfield；
- 保存 Babylon Scene、Mesh、Material、PhysicsAggregate 或 Provider Handle；
- 参与现有 AuthoringSpec 的 Union；
- 在本实验中发布为 Canonical Schema。

第一阶段为了复用已验证的 G Bot 能力锁，Runtime 可以读取一份已冻结的实验 Bootstrap 数据；它不得在
启动时调用 Authoring Normalizer 或 Compiler。这个复用是实验实现事实，不代表 ExecutionPlan 成为新
Native Scene 的视觉权威。

## 5. 权威分工

### 5.1 Babylon Native Scene Module 拥有

- 所有场景视觉 Mesh 与 Transform；
- 材质、灯光、环境、天空、雾、云海和后处理；
- 高精度视觉阶梯与低精度碰撞代理的几何选择；
- 场景构图所需的 Landmark 与视觉层次；
- 哪些 Mesh 应被提交给 SDK 作为碰撞候选。

### 5.2 SDK Host 拥有

- Engine、Scene 与 Render Loop 生命周期；
- Havok 初始化；
- `PhysicsShape`、`PhysicsAggregate`、Filter、摩擦和销毁；
- 玩家 Capsule、Motion Kernel、接地和固定 Tick；
- Input、Action、Camera 与 Capture；
- Collider Admission、ID、预算和诊断；
- Spawn Marker 消费与 Reset。

### 5.3 AI 不拥有

- Havok Plugin、PhysicsAggregate 或 CharacterController 的创建；
- SDK 主相机的替换；
- 第二套 Render Loop；
- SDK Subject、Ground Support 或 Fixed Time 的旁路推导；
- Canonical/Route/WorldPackage 能力声明。

## 6. Native API 边界

候选 API：

```ts
export interface BabylonNativeSceneModuleV1 {
  readonly kind: "babylon-native-scene-module";
  readonly id: string;
  build(context: BabylonNativeSceneBuildContextV1): void | Promise<void>;
}

export interface BabylonNativeSceneBuildContextV1 {
  readonly scene: BABYLON.Scene;
  registerSpawnMarker(input: {
    readonly id: string;
    readonly positionMetersXYZ: readonly [number, number, number];
    readonly facingRadians: number;
  }): void;
  registerStaticCollisionMesh(input: {
    readonly id: string;
    readonly mesh: BABYLON.Mesh;
    readonly surfaceKind: "walkable" | "obstacle";
    readonly frictionRatio?: number;
    readonly restitutionRatio?: number;
  }): void;
}
```

这是 `@whitebox-world/runtime-babylon` 内的 Provider Adapter API。Babylon 类型只存在于该包和 Native
Scene App，不进入任何 engine-neutral Schema。

未注册 Mesh 默认纯视觉。SDK 绝不遍历所有视觉 Mesh 猜测碰撞。

Admission 会把登记 Mesh 的世界坐标顶点与索引冻结为不可变快照；Runtime 只基于该快照创建 Host 私有
碰撞 Mesh。Module 保留的原始 Mesh 仅用于视觉 Debug，后续销毁或变换不会改变 SDK 已接管的 Havok
地表。V1 同时拒绝带 Thin Instance 或既有 Physics Body 的碰撞候选。

当前切片是受信本地实验，不是代码沙箱。由于完整 Babylon `Scene` 正是视觉表达力来源，Module 在技术上
仍能访问 Scene 上的 Provider 能力，也能尝试导入额外 Babylon API；“不创建物理、相机或第二 Render
Loop”目前由包依赖、代码审查和实验约束保证，不能被描述成运行时安全隔离。生产化前必须选择并验证导入
allowlist、受限构建环境或更窄的 Capability Facade，且 Host 只对显式登记并最终重验的碰撞对象负责。

## 7. 碰撞与通过性

分工原则是“AI 决定碰撞意图和代理形状，SDK 创建并拥有真实物理”。

```text
high-detail visual mesh     -> Babylon rendering only
simplified collision proxy  -> SDK registration
                             -> validated PhysicsShapeMesh
                             -> SDK-owned PhysicsAggregate
                             -> Motion Kernel / Camera query
```

首个云海山门场景：

- 前景平台：显式静态碰撞；
- 中央石阶：视觉上是大量不规则石板，碰撞使用连续缓坡加少量平台；
- 山门平台：显式静态碰撞；
- 远景山峰、云、瀑布和树：纯视觉，无碰撞；
- 玩家：SDK G Bot Capsule；
- 相机：SDK 第三人称相机，碰撞查询仍由 SDK PhysicsWorldQuery 所有。

通过性只证明当前 Runtime 中玩家可以从 Spawn 沿注册代理到达山门平台。它不是 Route R1/R1b、Recast
或 Canonical Connectivity Evidence。

## 8. Terrain 的关系

现有 `@whitebox-world/terrain-compiler` 和 Heightfield Runtime 保持不变。Native Lane 当前不调用它们，
也不创建隐藏 Heightfield 作为第二地面权威。

两条 Lane 的地面来源互斥：

- Canonical Lane：Heightfield/受支持 Static Surface 是正式地表；
- Native Lane：显式注册的 Babylon Collision Proxy 是实验地表。

本实验不删除 Terrain，不修改 Terrain Compiler，不改现有 Scene Fixtures。未来大世界、确定性高度采样、
坡度 Gate 或 Route 证明仍可选择 Canonical Lane。

## 9. 第一个视觉场景

目标参考包含：

- 宽阔岩石前景平台；
- 中央逐级抬升的窄石路；
- 顶部具有明显 T 字轮廓的中式山门；
- 左右多层柱状山峰；
- 云海、瀑布、松树和右上方强日光；
- 第三人称主体位于画面下方中央。

Native 实现使用 Babylon 原生能力：

- 程序化分层岩柱 Mesh；
- 独立石板和连续隐藏碰撞代理；
- Box/Cylinder 组合山门与屋檐；
- 程序化松树和半透明云团；
- Standard 材质、Fog、Directional/Hemispheric Light；
- Babylon Image Processing。

不使用参考图作为背景贴图，不用一张图片冒充 3D 还原。

## 10. 当前实验实现状态边界

截至 2026-08-27，本分支已完成实验性垂直切片：

- 唯一生产入口仍是 AuthoringSpec V4 -> IR V4 -> Plan V5 -> Babylon/Havok；本次没有替换、迁移或降级 Canonical Lane；
- `BabylonWorldRuntime.create()` 新增显式 `nativeScene` 实验选项。启用后，Native Module 直接构建 Babylon 视觉，Runtime 不再投影 ExecutionPlan 的 Terrain、Object、Water 或静态碰撞；
- Native Module 只通过闭合的 V1 BuildContext 登记一个 Spawn Marker 和显式静态碰撞 Mesh；SDK 校验 Scene 归属、生命周期、顶点/三角形数据、唯一 ID 与预算，冻结世界坐标几何快照，再从 Host 私有 Mesh 创建并拥有 Havok Shape/Aggregate；
- Subject、动作、固定 Tick、Gameplay possession、第三人称相机、Snapshot、Reset 与资源清理由既有 SDK Runtime 继续拥有；
- 小型 Bootstrap JSON 只选择 Native Module 和复用既有 Subject/动作/相机资源闭包，不描述视觉细节，也不进入 Authoring Normalizer 或 Compiler；
- Terrain 与 Compiler 保持独立且未修改；Three Runtime 仍为退休状态，本实验不提供 Three Endpoint；
- 独立预览 `apps/native-scene-playground` 已复原前景平台、中央抬升路径、T 字山门、左右柱状山峰、云海、瀑布、松树和第三人称主体构图；
- 浏览器固定输入实测从 `(0, 0.1, 18)` 到达门楼平台约 `(0, 14.0, -36.1)`，结束为 `IDLE · GROUND`；这证明本实验碰撞代理上的主路径连续可通行，但不等同于 Canonical Route R1/R1B 证明。

该入口仍是实验 API，不是新的公开 Authoring Schema，也没有改变正式 Hosted Scene 或 Catalog Scene 工作流。

## 11. 验收证据

### 11.1 Automated contract

- Native Scene Module 只能注册唯一 Spawn Marker 和唯一 Collider ID；
- 非有限 Spawn、错误 Scene 的 Mesh、已销毁 Mesh、空 ID、重复 ID 被拒绝；
- Runtime Native 模式不创建 Plan Terrain/Object/Water；
- SDK 为已注册 Collider 创建并销毁 Havok Shape/Aggregate；
- 玩家固定输入可以在 Native Collider 上落地、移动和停止；
- Canonical Runtime 默认模式的既有测试不回退。

### 11.2 Rendered visual

- 真实 Chromium 打开独立 Native Preview；
- 截图中可辨认前景平台、中央上升路径、T 字山门与左右山峰；
- 玩家位于前景中央，SDK Camera 正常跟随；
- 视觉 Mesh 与 Collider Proxy 可通过 Debug Toggle 区分。

### 11.3 Manual interaction

- WASD 移动；
- Shift 奔跑；
- Space 跳跃；
- 鼠标或方向输入旋转/缩放 SDK Camera；
- 从 Spawn 沿中央路径移动，不掉入碰撞坑、不被高频石板卡住；
- 到达顶部平台后保持接地。

## 12. 非目标

- 不发布新的 Canonical Schema；
- 不让 Native 世界通过现有 Route Gate；
- 不支持动态刚体、NPC、车辆、洞穴或双层通路；
- 不实现 Three Endpoint；
- 不删除或迁移现有 Terrain/Compiler；
- 不在本切片实现生产沙箱、远程 AI 执行或多租户安全；
- 不宣称一个参考场景证明所有 Babylon Native 世界可生产发布。

## 13. 风险

| 风险 | 缓解 |
|---|---|
| Native Code 破坏 Host 权威 | 当前仅受信本地代码；Host 撤销注册期并最终重验碰撞，生产化前另做依赖 allowlist、沙箱或 Capability Facade |
| Visual/Collider 不一致 | Host 私有几何快照、Debug Overlay、独立命名、人工通过性检查 |
| 任意 Mesh 造成性能失控 | Collider 数量、顶点和三角预算，拒绝 Thin Instance/既有 Physics Body，Fail Closed |
| Native Lane 被误称 Canonical | 独立 App/URL/文档，Snapshot 与 Route 不发布正式证据 |
| 实验 Hook 污染生产 Runtime | 默认分支行为不变、显式 native mode、既有全量 Gate |
| 代码执行安全不足 | 当前仅本地受信实验；生产化前必须独立 Threat Model |

## 14. 后续方向

实验完成后只允许三种处置：

### Continue

视觉和通过性都明显成立：

1. 新增独立 ADR，正式定义 Canonical Lane 与 Native Lane；
2. 将 Bootstrap Schema、Scene Module Bundle、依赖 allowlist 和安全边界冻结；
3. 把 Babylon Gameplay Kernel 从 Plan Scene Builder 中抽离；
4. Canonical Plan Builder 与 Native Scene Builder 共享同一个 Kernel；
5. 建立 Native Scene 的 Bundle Hash、Build Receipt、预算和浏览器 Gate；
6. 决定是否需要生产沙箱；
7. 只有需要 Route/WorldChangeSet 的数据才设计进入 Canonical Contract。

### Change

视觉成立但物理接入不稳定：保留 Native Visual Lane，将 Gameplay 地表限制为显式低模 Surface Package，
不允许任意 Mesh Collider。

### Stop

AI 使用 Babylon Native API 仍无法明显改善画面，或者玩法接入成本接近重写 Runtime：删除实验入口，
回到 Geometry Asset/Recipe 或外部 DCC 资产路线。

## 15. 依赖工作图

### BNS-0：冻结规格与实施计划

- 目标：记录无 Compiler 背景、当前事实、实验边界与后续处置。
- 交付物：本规格与对应实施计划。
- `depends_on`：ADR-0006、当前 Backlog、用户本轮确认。
- `blocks`：BNS-1 至 BNS-4。
- 独占所有权：设计与集成决策。
- 输入/输出：当前架构事实 -> 实验合同。
- 集成点：无代码。
- 验证：Mode A 的 D1/D2/D3/D6 自检。
- 执行模式：`main-agent-only`。

### BNS-1：Native Scene 注册合同

- 目标：定义 Scene Module、Spawn 和 Static Collider 注册及 Admission。
- 交付物：`packages/runtime-babylon/src/native-scene-module.ts` 与测试。
- `depends_on`：BNS-0。
- `blocks`：BNS-2、BNS-3。
- 独占所有权：Provider-specific build context 和诊断。
- 输入/输出：Babylon Mesh/marker -> validated contribution。
- 集成点：Babylon Runtime 初始化。
- 验证：duplicate/foreign/disposed/non-finite/budget tests。
- 执行模式：`sequential`。

### BNS-2：SDK Physics/Gameplay 接入

- 目标：Native 模式不创建 Compiler geometry，由 SDK 把注册 Mesh 接到 Havok 和现有 Subject/Camera。
- 交付物：Runtime 显式 native option 与 Havok 集成测试。
- `depends_on`：BNS-1。
- `blocks`：BNS-3、BNS-4。
- 独占所有权：Runtime native initialization branch 与生命周期。
- 输入/输出：validated contribution + frozen gameplay bootstrap -> running world。
- 集成点：`BabylonWorldRuntime.create()` 的显式实验分支。
- 验证：no-plan-geometry、support/movement/dispose 与默认模式回归。
- 执行模式：`sequential`。

### BNS-3：云海山门 Native App

- 目标：用 Babylon Native 代码还原参考图并提供浏览器控制。
- 交付物：独立 Vite app、Scene Module、Bootstrap、UI 和 root dev command。
- `depends_on`：BNS-1、BNS-2。
- `blocks`：BNS-4。
- 独占所有权：`apps/native-scene-playground/`。
- 输入/输出：参考图 -> Native scene + explicit collision proxies。
- 集成点：Runtime Native option。
- 验证：module contract test、typecheck、production build。
- 执行模式：`sequential`。

### BNS-4：真实视觉与通过性验证

- 目标：确认视觉、碰撞、移动和相机共同工作。
- 交付物：浏览器截图、固定输入 Probe、人工可试 URL 与结果说明。
- `depends_on`：BNS-2、BNS-3。
- `blocks`：后续 Continue/Change/Stop 决策。
- 独占所有权：实验验证制品，不修改 Canonical 金标。
- 输入/输出：运行中的 Native app -> 分层证据。
- 集成点：真实 Chromium 与人工操作。
- 验证：focused tests、typecheck、build、browser probe、manual interaction。
- 执行模式：`main-agent-only`。

```text
BNS-0 -> BNS-1 -> BNS-2 -> BNS-3 -> BNS-4
```

## 16. 最终原则

> JSON 管启动和玩法配置；Babylon Native Code 管视觉世界；SDK 管真实物理、玩家、动作、相机和
> 生命周期。Native 视觉不经过场景 Compiler，只有显式注册的 Gameplay 集成点进入 SDK 权威。

这是一条实验 Lane，不是对现有 Canonical 架构的静默破坏。实验用真实画面和真实通过性决定后续，
而不是用架构偏好提前决定结果。
