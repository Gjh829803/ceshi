# AI 友好的 Babylon Native 世界创作长期设计

- 状态：Accepted architecture direction；生产化仍需按本文工作图独立验收
- 日期：2026-08-28
- 目标仓库：`agent-whitebox-world-sdk`
- 目标读者：SDK、Runtime、上游 Agent、Studio、验证与安全团队
- 决策记录：[ADR-0007](../../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)
- 上位基础：[AI-first LEGO 游戏 SDK 设计](./2026-08-17-ai-first-lego-game-sdk-design.md)
- 实验依据：[Babylon Native Scene Lane 实验设计](./2026-08-27-babylon-native-scene-lane-design.md)
- 首个创作 Profile：[Babylon Native Block Whitebox 创作 Profile 长期设计](./2026-08-28-babylon-native-block-whitebox-profile-design.md)
- 资产供应链：[Source-neutral 资产生产与准入长期设计](./2026-08-28-source-neutral-asset-production-and-admission-design.md)
- 当前实施真相：[SDK 重构总进度与 Backlog](../../18-refactor-progress-and-backlog.md)

> 本文是 Canonical JSON 与 Babylon Native Scene 长期分工的唯一详细设计权威。
> 它接受架构方向，不把尚未实现的 Native Package、Receipt、Hosted 隔离、Route 或
> WorldChangeSet 能力写成当前事实。2026-08-27 文档继续保存实验实现和证据，不再承担长期边界。

## 1. 决策摘要

项目采用：

> **一个世界产品模型，两条互斥的场景创作 Lane，一个 Babylon/Havok Gameplay Kernel。**

- **Canonical Lane**：AI 用 AuthoringSpec JSON 描述受支持的完整场景，Compiler 生成
  NormalizedWorldIR、ExecutionPlan 和 WorldPackage。它继续负责结构化、可验证、可迁移、
  可自动测试的世界。
- **Babylon Native Scene Lane**：AI 用小型 Bootstrap JSON 选择世界资源和运行策略，再用
  Babylon Native TypeScript 创建视觉场景。视觉不经过项目自建的场景 Compiler；只有显式登记的
  Spawn、Collider 和后续受控语义贡献进入 SDK。
- **Babylon Native Block Whitebox Profile**：Native Lane 的首个参考图白膜方法；继承固定米制方块、
  真实体积、稳定调色板、结构/视觉/通过性检查等构造原则，但不引入持久 Block Manifest、第三个 Scene
  Source 或 Block Compiler。
- **SDK Runtime**：无论场景来自哪条 Lane，人物、动作、输入、相机、固定 Tick、Havok、状态、
  查询、回执、Capture 和生命周期都只有一套权威实现。

两条 Lane 不是把同一份几何写两遍，也不是 `JSON geometry + Native geometry overlay`。
**每个世界必须选择且只选择一个 `sceneSource.kind`，因此视觉几何和 Gameplay 地表始终只有一个
创作来源。** Native 世界中的 JSON 与 TypeScript 按职责正交：JSON 管身份、资源与 Gameplay
启动；TypeScript 管视觉；SDK 管运行时真相。

```text
Canonical world
AuthoringSpec JSON -> Normalizer / Compiler -> ExecutionPlan / locked resources
                                               |
                                               v
                                      Babylon/Havok Gameplay Kernel

Native world
Bootstrap JSON -------> locked gameplay/runtime resources ----------+
Babylon TypeScript ---> Babylon Scene + explicit registrations -----+
                                                                    |
                                                                    v
                                                   Babylon/Havok Gameplay Kernel
```

两条 Lane 都可以消费同一条离线资产供应链，但供应链不进入 `RuntimeSceneSource`：

```text
provider / library / DCC / reconstruction
  -> immutable untrusted raw asset candidate
  -> asset-class-owned Build Record / normalized bytes
  -> asset admission + immutable Registry ref
  -> selected Scene Source references and places the asset
```

生成或重建系统不拥有世界 Placement、Scene Graph、Spawn、Collider、Route 或 Gameplay。它只能在场景
构建前提供被锁定的资源；Scene Source 发布后不存在第三个 Dressing Pass。

Native Lane 不采用以下循环：

```text
AI writes Babylon-like API
  -> project-owned scene protocol
  -> scene compiler
  -> Babylon adapter
  -> Babylon objects
```

它直接使用 Babylon 的建模、材质、灯光、雾、天空、粒子与层级 API。项目只定义跨越“视觉创作”与
“可信 Gameplay”边界所必需的薄登记合同；该合同不复制 Babylon Scene Graph，因此不是第二套场景
语言或内部视觉 Compiler。

## 2. 为什么这是长期方案，而不是实验补丁

### 2.1 需要同时保留的两种价值

Canonical JSON 的价值不是追赶 Babylon 的全部视觉表达力，而是提供：

- 闭合 Schema、稳定命名、静态校验和结构化诊断；
- 不可信输入的安全 Admission；
- 确定性布局、资源锁、Hash、WorldPackage 和 ChangeSet；
- 大批量自动生成 Fixture、自动化测试和无头验证；
- Heightfield、基础 Primitive、标准 Structure 与已支持 Route 的正式证据；
- 引擎无关的数据资产和长期迁移边界。

Babylon Native Code 的价值是直接使用成熟引擎的完整场景表达力：

- 独特山峰、峡谷、断崖、阶梯、平台和建筑剪影；
- 任意 Mesh 层级、程序化几何、CSG、实例、GLB 和视觉代理；
- 材质、灯光、雾、天空、云海、粒子、动画与后处理；
- 可直接利用 Babylon 的公开文档、示例和类型系统；BNA-2 bake-off 只冻结工程 Import 方言，具体模型
  生成与修复成功率由 BNA-6 独占验证，不以训练数据印象代替证据；
- 新视觉效果无需先扩充 Schema、Compiler、IR、Adapter 和迁移器。

这两种能力解决的问题不同。删除 JSON 会失去确定性、自动化与安全边界；强迫所有视觉都进入 JSON
会重新发明 Babylon。长期稳定点不是“只保留一种语法”，而是**让每类数据只有一个权威 Owner，并让
两条 Lane 在同一个 Runtime Kernel 汇合**。

### 2.2 不割裂的判定标准

本设计只有在以下不变量同时成立时才算统一架构：

1. 一个世界只选择一条场景几何 Lane，不允许两个来源同时写同一视觉或碰撞事实。
2. 两条 Lane 使用同一个 `GameplayBootstrapV1` 语义，并消费同一种 Plan-independent
   `WorldRuntimeBootstrap`；Native 世界不复制人物、动作、能力、物理或相机闭包。
3. 两条 Lane 使用同一个 RuntimeHost、WorldSession、Havok、Subject、Input、Action、Camera 和
   Snapshot 权威。
4. Native Module 不创建 Engine、Scene、Render Loop、Physics Body、主相机或 Gameplay Entity。
5. SDK 不从 Mesh 名称、材质、颜色或包围盒猜测 Gameplay；Native Code 必须显式登记意图。
6. Native 视觉对象不能反向决定 Gameplay 状态；Gameplay 状态只从 SDK 固定 Tick 和权威查询产生。
7. 生产制品必须锁定输入、依赖、资产与贡献 Hash；不能用一个匿名 Vite Bundle 冒充 WorldPackage。
8. Canonical 与 Native 的能力声明和证据分开；一条 Lane 的通过不能替另一条 Lane 背书。

### 2.3 未发布项目的 Clean Break 原则

本项目尚未对外发布，因此本文涉及的公共合同、实验 API、Fixture 和生成制品一律按 **current-only
clean break** 实施，不为仓库历史保留兼容负担：

- 一个被接受的 tree 对同一概念只允许一个当前名称、一个 Parser、一个公共入口和一个状态 Owner；
- 禁止保留旧字段 alias、optional 双字段、旧/新 Parser fallback、deprecated re-export、桥接 Adapter、
  两套 Package 或按场景选择 legacy/new Runtime 的开关；
- 改名或换合同必须在同一集成切片更新 Schema、类型、全部 consumer、Fixture、Golden、Package、Receipt
  与文档，然后删除旧实现；不能以“以后再清理”完成该切片；
- Feature branch 可以用多个 RED/GREEN commit 完成迁移，但中间 tree 不是可接受能力状态；最终 GO、PR 或
  发布候选不得同时含新旧合同；
- `schemaVersion: 1` 和类型名中的 `V1` 只表示当前唯一序列化合同的身份，不授权同时维护 V1/V2/V3。
  在首次发布前若合同改变，可以直接重写当前私有版本，或升级后彻底删除旧版本；不得并行保留；
- Canonical 与 Native 两个 `sceneSource.kind` 是长期并列的产品能力，不是 legacy/new 兼容层；两者共用
  Kernel 且每个世界只选一个 Source，因此不违反本原则。

实验期的 `@whitebox-world/runtime-babylon` Native 根导出和 `surfaceKind` 已由 Foundation
current-only 迁移删除；影子 ExecutionPlan 和把 `executionPlanHash` 当通用世界身份的做法仍属于
BNA-1 必须删除的旧实现。两类旧合同都不得通过 alias 或 Adapter 继续存活。

## 3. 目标与非目标

### 3.1 目标

- 让 Coding Agent 能直接写常见、标准、可搜索的 Babylon TypeScript，而不是学习一套镜像 DSL。
- 用少量稳定 JSON 初始化世界身份、Scene Source、Gameplay、资源、运行策略和 Spawn 绑定。
- 让 SDK 从显式登记的视觉代理创建并拥有真实 Havok 碰撞。
- 让 Native 世界无缝使用现有人物、动作、输入、相机、状态、Snapshot 与 Capture。
- 为参考图白膜还原提供足够的地形拓扑、轮廓、内容和构图表达力。
- 用版本化 API、Profile、Bundle、资源锁、Receipt、诊断和 Golden Corpus 控制长期升级成本。
- 保留 Canonical Lane 的自动测试、批量生成、Route、ChangeSet 和引擎无关价值。
- 让正确性由 Schema、类型、Admission 和测试保证；Skill 或 Prompt 只提高生成质量，不成为隐藏协议。

### 3.2 非目标

- 不把 Babylon Scene Graph 重新序列化为项目自有 JSON。
- 不让 Native Module 自己创建 Havok、CharacterController、PhysicsAggregate 或物理查询。
- 不让 Native Module 替换 SDK 主相机、输入、固定 Tick、世界状态或 Render Loop。
- 不在同一个世界中叠加 Canonical 几何和 Native 几何并让二者共同声称地表权威。
- 不自动遍历视觉 Mesh 猜 Collider、Walkable Surface 或导航区域。
- 不因为 Native 场景能显示就宣称 Route、自动寻路、WorldChangeSet、Hosted 安全或生产发布已完成。
- 不提供一个并行 Three.js Runtime Endpoint；Three.js 代码可以作为离线 GLB/资产制作来源，但不成为
  第二套在线 Scene、Camera、Physics 和 Lifecycle。
- 不在 Native `build()`、Canonical Compiler 或 Runtime load 期间调用生成模型、下载任意 URL、转换
  Candidate 或按本机文件存在性选择回退资产。
- 不在 V1 支持动态刚体、移动平台、NPC 行为、车辆、洞穴双层 Route、飞行体积或水下导航。

## 4. 单一权威与职责矩阵

| 事实 | Canonical Lane Owner | Native Lane Owner | 运行时最终 Owner |
|---|---|---|---|
| 视觉几何与 Transform | AuthoringSpec -> Compiler | Babylon Native Module | Babylon Scene，仅用于渲染 |
| 材质、灯光、雾、天空、粒子 | Canonical 已支持字段/资源 | Babylon Native Module | Babylon Scene，仅用于渲染 |
| 静态碰撞意图与代理形状 | Canonical Collider/Surface | Native 显式登记 | SDK 冻结快照并创建 Havok |
| Spawn 意图 | Canonical placement | Native `spawnMarkerId` + 登记 | SDK 校验、消费并重置 |
| Subject 身份、Gameplay 能力 | `GameplayBootstrapV1` | 同一个 `GameplayBootstrapV1` | SDK Gameplay Runtime |
| Subject 渲染/物理/控制/相机闭包 | Compiler 产生 `WorldRuntimeBootstrap` | Host Resolver 产生同一合同 | SDK Subject/Physics/Camera Runtime |
| 动作、输入与控制权 | Gameplay 合同 | 同一 Gameplay 合同 | WorldSession / RuntimeHost |
| 主相机与镜头控制 | Camera Profile/Context | 同一 Camera Profile/Context | SDK CameraDirector |
| Ground Support 与运动介质 | Physics Runtime | 同一 Physics Runtime | 单一 `checkSupport()` 路径 |
| 固定时间、状态、Event、Receipt | RuntimeHost | RuntimeHost | RuntimeHost |
| Route/导航证明 | 受支持 Canonical Surface | 未默认提供；未来只能来自同一冻结 Surface | Trusted Route/Navigation Host |
| 生命周期与销毁 | Runtime Host | Runtime Host | Runtime Candidate Scene + Session 原子所有权 |

### 4.1 人物使用 JSON，视觉场景使用 Native Code

可控制人物及任何具有 Gameplay 意义的 Subject 必须由 JSON/Registry/`GameplayBootstrapV1` 定义，
并由 SDK 创建。Native Module 只登记出生标记，不实例化第二个人物，也不持有 Subject Runtime Handle。

Native Module 可以创建没有 Gameplay 身份的远景剪影或装饰人物。静态环境碰撞可以保持为非 Gameplay
的 Native Scene Contribution；需要动作、可变状态、命令、查询身份或 Relationship 的对象必须进入
SDK Gameplay/Entity 合同，不能用 Static Collider 登记冒充 Entity。

### 4.2 相机、动作和状态不进入 Native Scene 逻辑

Native Module 可以设置 Scene 级视觉环境，例如 Fog、Image Processing 和灯光；它不得设置
`scene.activeCamera`、创建输入监听或维护独立 Update Loop。相机跟随、镜头控制、动作播放、状态切换和
Reset 继续由 SDK 拥有。需要与相机绑定的后处理必须通过未来显式的 SDK Visual Extension 合同接入，
不能临时取得主相机并旁路修改。

## 5. 每个世界只选一个 Scene Source

BNA-1 已将 Runtime 输入从“必然包含 ExecutionPlan”的形态升级为闭合 Source Union。当前正式合同
使用以下精确 V1 类型；Native member 可被严格解析，但在 BNA-3/BNA-4 前仍由 RuntimeHost 分配前拒绝：

```ts
type RuntimeSceneSourceV1 =
  | {
      readonly kind: "canonical-execution-plan";
      readonly executionPlan: CanonicalSceneExecutionPlanV1;
      readonly executionPlanHash: Sha256HashV1;
    }
  | {
      readonly kind: "babylon-native-scene";
      readonly bootstrap: BabylonNativeSceneBootstrapV1;
      readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
};
```

`CanonicalSceneExecutionPlanV1` 已是唯一当前 Canonical Scene Source 合同。BNA-1 的
receipt-bound V5 过渡投影已经删除；Scene Plan 与 Runtime Kernel Bootstrap 不再是两份重叠权威。

规则：

- `sceneSource` 必填且只能匹配一个 Union 成员。
- Canonical Source 才能声明 Canonical IR/ExecutionPlan/Route/ChangeSet 能力。
- Native Source 不再携带一份“只为借人物资源而存在”的影子 ExecutionPlan。
- `sceneModuleBundleRef` 是 Host 对 Bootstrap `sceneModuleRef` 的内容寻址解析结果，二者必须由同一资源锁
  证明，不能各自指向不同 Module。
- 两种 Source 都引用同一份已解析 `GameplayBootstrapV1`，并消费同一份
  `WorldRuntimeBootstrap`；Runtime 不从 Scene Source 临时重建第二套 Subject、Control、Camera 或
  Physics 闭包。
- 从一种 Source 切换到另一种 Source 是世界来源变更，必须 Full Reload、重新打包和生成新 Receipt。
- V1 不允许 `canonical-execution-plan` 内再挂 `nativeOverlayRef`，也不允许 Native Module 导入并修改
  Canonical Runtime Scene。
- Source-neutral Asset Production/Admission 位于该 Union 之前。它只产生 Candidate、Receipt 和锁定
  Resource Ref，不得新增 Union 成员，也不得用完整场景 Manifest 绕开某个已选择的 Source。
- 单资产生产可以独立发生；Host 在生成 Scene Module 或组装完整场景 Attempt 前冻结
  `SceneAuthoringRouteDecisionV1`。任何 Lane、组合策略、
  Source、Asset、Seed 或 Profile 切换都会创建新的 `SceneAuthoringAttemptV1`，并使受影响的场景级 Gate/
  Receipt 失效。未变化资产的 Admission Receipt 仍按内容身份复用，不由 Attempt 拥有。

这个 Union 是消除割裂的关键：上层 WorldSession 和 Gameplay 不需要知道几何由哪种语言创作；
Scene Builder 知道 Source 类型，但没有第二套 Subject、Camera 或 Physics Runtime。

### 5.1 Source-neutral World Build Identity

仅增加 `sceneSource` Union 还不够。BNA-1 已将 `WorldSessionCreateOptionsV1`、
`WorldStateSnapshotV1`、`RuntimeWorldAdapterDescriptorV1`、Whitebox Tri-view 与通用
Capture/Validation 合同迁移到 `worldBuildIdentityHash`，并冻结以下 source-neutral 身份：

```ts
interface WorldBuildIdentityV1 {
  readonly kind: "world-build-identity";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneSourceIdentity:
    | Readonly<{
        kind: "canonical-execution-plan";
        executionPlanHash: Sha256HashV1;
      }>
    | Readonly<{
        kind: "babylon-native-scene";
        nativeSceneBootstrapHash: Sha256HashV1;
        sceneModuleBundleHash: Sha256HashV1;
        nativeSceneContributionHash: Sha256HashV1;
      }>;
}
```

规则：

- Runtime/Gameplay/通用 Capture 合同引用完整 `WorldBuildIdentity` 或其 canonical hash，不能要求 Native
  世界伪造 `executionPlanHash`。
- Canonical Route、Authoring Edit 和 Plan-specific Validation 可以继续显式使用 `executionPlanHash`；
  它们不因此自动支持 Native Source。
- Browser、Snapshot、WorldSession、Runtime Adapter、Capture Manifest、Take、Validation Subject 和
  Package Receipt 的受影响协议必须做完整 consumer census，并在当前未发布阶段通过
  current-only clean break 一次迁移。若名称或结构升级，旧版本必须在同一迁移切片删除；不能增加
  optional alias、兜底推断或 legacy hash 旁路。
- `worldPackageRootHash` 仍是完整 Package 身份；`sceneSourceIdentity` 解释该 Package 的场景来源，
  `gameplayBootstrapHash` 和 `worldRuntimeBootstrapHash` 绑定共用 Kernel 输入。
- Route/Nav 若未来支持 Native，必须绑定同一个 `nativeSceneContributionHash` 及其冻结 Surface，而不是
  恢复一个影子 Plan。

## 6. Native JSON Bootstrap

### 6.1 目标形态

Native JSON 是小型、闭合、可哈希的启动合同，不是详细场景描述。目标字段语义如下；进入实现前必须
作为一个版本化 Schema 同步冻结 JSON Schema、类型、Parser、示例和负向测试：

```json
{
  "kind": "babylon-native-scene-bootstrap",
  "schemaVersion": 1,
  "id": "cloud-ridge-native",
  "sceneModuleRef": "worldkit://native-scene/cloud-ridge@1",
  "nativeSceneApiRef": "worldkit://native-scene-api/babylon@1",
  "nativeSceneProfileRef": "worldkit://native-scene-profile/whitebox.standard@1",
  "gameplayBootstrapRef": "worldkit://gameplay-bootstrap/cloud-ridge@1",
  "initialControlledEntityId": "g-bot-primary",
  "gravityMetersPerSecondSquaredXYZ": [0, -9.81, 0],
  "initialCamera": {
    "mode": "third-person",
    "pitchRadians": 0.22,
    "distanceMeters": 5,
    "fovDegrees": 58,
    "targetHeightMeters": 1.25
  },
  "seed": 18427,
  "spawnMarkerId": "player-spawn"
}
```

字段职责：

- `sceneModuleRef`：选择内容寻址并经 Host Resolver 锁定的 Native Module。
- `nativeSceneApiRef`：冻结 Module 面向的项目边界 API 版本。
- `nativeSceneProfileRef`：AI 只能从 Host/tenant 发布的 allowlist 中选择请求 Profile；Host 用
  `min(requested profile limit, host/tenant hard cap)` 逐项计算有效依赖、资源和几何/Collider 预算，
  AI 不能通过改选高配 Profile 越过授权。
- `gameplayBootstrapRef`：复用现有 Gameplay 实体、能力和动作闭包，不复制人物字段。
- `initialControlledEntityId`：选择 `GameplayBootstrapV1.entityDescriptors` 中恰好一个可控制实体；Host
  Assembler 从其 `entityDefinitionRef` 和锁定资源生成 `WorldRuntimeBootstrap`，不在 Native JSON 中
  重复 `controlledSubjectDefinitionRef`、`cameraRigRef` 或 `actionOrPoseSetRef`。
- `gravityMetersPerSecondSquaredXYZ`：世界级重力，单位和坐标域显式；固定 Tick 与 Camera/Control
  算法仍由 SDK 和锁定资源拥有。
- `initialCamera`：只表达开场第三人称构图，数值由锁定 Camera Profile 校验；它不创建 Babylon Camera，
  也不改变 SDK 对后续镜头控制的所有权。Subject 初始朝向仍来自登记 Spawn 的 `facingRadians`。
- `seed`：Host PRNG 的唯一场景随机输入；必须是 `0..0xffffffff` 的无符号 32 位整数，且拒绝 `-0`、小数和越界值。该域与 Native V1 LCG 状态完全一致。
- `spawnMarkerId`：把 JSON 启动意图绑定到 Module 恰好一次登记的本地标记。

Native V1 只允许 `WorldRuntimeBootstrap.subjectRuntimeDescriptors` 中恰好一个空间 Subject，且其
`entityId` 必须等于 `initialControlledEntityId`；`GameplayBootstrapV1` 仍可包含 Controller 等非空间
Gameplay Entity。多个空间 Subject 不得共享或猜测同一个 Marker。未来扩展必须引入显式、
role-qualified 的 `subjectSpawnBindings`（每项包含 `subjectEntityId` 与 `spawnMarkerId`）并升级 Schema，
不能把 V1 单值字段静默解释为默认 Spawn。

### 6.2 JSON 不负责的内容

- 山、峡谷、台阶、建筑、云、树或材质的逐对象描述；
- Babylon Mesh、Material、Texture、Light、TransformNode 或 Scene Graph；
- Havok Shape、Body、Filter、CharacterController 或 Ground Query；
- 主相机实例、输入事件或每帧更新；
- Collider 数量、顶点数、三角数等可被 AI 任意放宽的裸预算；
- Provider Handle、URL、文件路径或未锁定 npm 依赖。
- Asset Production Request、Provider/model 选择、Candidate 路径、费用或 Cache key；这些属于离线 Host，
  Bootstrap 只引用最终被接受并锁定的资源。

### 6.3 Plan-independent `WorldRuntimeBootstrap`

`GameplayBootstrapV1` 只拥有 Entity Definition/Capability 引用、Feature Locks、Semantic Actions 和
Gameplay 状态启动语义；它**不包含**完整 Subject/Physics/Control/Camera 闭包。该闭包现在由
`WorldRuntimeBootstrapV1` 唯一拥有，因此“删除影子 Plan”不是“只复用 GameplayBootstrap”。

BNA-1 已抽取 source-neutral、可哈希的 `WorldRuntimeBootstrap`；职责固定为：

```ts
interface WorldRuntimeBootstrapV1 {
  readonly kind: "world-runtime-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly contentHash: Sha256HashV1;
  // Closed, locked fields listed below; BNA-1 freezes their exact DTOs.
}
```

`contentHash` 必须定义为移除 `contentHash` 后 `WorldRuntimeBootstrapBodyV1` 的 canonical body hash，
Parser 重新计算并要求完全相等；完整 artifact bytes Hash 由 Package Inventory 另行记录。不得把包含
`contentHash` 自身的对象再次哈希，或让两个 Hash 共用同一字段名却表达不同对象。

- 引用并校验一个 `GameplayBootstrapV1`；
- 锁定 `initialControlledEntityId`；
- 为每个 Runtime Subject 锁定 Subject Definition、Asset、Rig、Animation、Render Binding、Collider、
  Motion Kernel、Control、Control Feel、Locomotion、Medium、Physics Body 和 Camera Context/Profile
  闭包；
- 锁定世界重力和 Native JSON/Canonical Entry Composition 提供的初始 Camera 描述；
- 持有相应 Registry Resource Lock 与 `contentHash`；
- 不包含 Terrain、Water、Structure、Static Scene Mesh 或 Provider Handle。

Native Host Assembler 从 Bootstrap JSON、`GameplayBootstrapV1` 和 Registry Lock 产生该合同。BNA-1
曾在 Feature branch 以 exact-equality/hash Gate 验证旧合体 Plan 到 Bootstrap 的派生等价性；该迁移态
已经删除，不是当前协议。当前唯一终态的 `CanonicalSceneExecutionPlanV1` 只保留 Terrain、Water、
Structure、Static Surface、Subject Scene Instance/Placement 与 Traversal 等 Scene Source 数据，并引用
`worldRuntimeBootstrapRef`/Hash；旧类型、Parser、字段、Fixture 和生成制品不留兼容开关。

终态下，两条 Lane 的 Runtime Kernel 只消费 `WorldRuntimeBootstrap`，不再直接依赖 Scene Source 中
偶然存在的 Subject/Camera 字段。Canonical Subject 的空间 Placement 仍由 Canonical Scene Source
拥有；Native V1 的唯一 Subject Placement 仍由 Spawn Marker 拥有。

这一步是有价值的内部协议：它描述的是 SDK 自己拥有的 Gameplay/Physics/Camera 启动闭包，而不是复制
Babylon 视觉 API。Assembler 可以做 Schema/Registry/Hash 校验，但不得投影或重写 Native Scene Graph。

### 6.4 场景 Lane 与创作策略路由

Host 必须在生成 Scene Module 或组装完整场景 Attempt 前冻结一次
`SceneAuthoringRouteDecisionV1`。单资产生产是可跨场景复用的独立离线工作，不以 Scene Route 为身份。
路由顺序固定为：Trust/当前发布能力 -> 必需
Route/ChangeSet/确定性能力 -> 开放或封闭空间与可交互拓扑 -> 视觉身份与构图 -> 许可证/资源/费用。
后项不能覆盖前项 Blocking Gate。

| 条件 | `SceneAuthoringRouteDecisionV1` |
|---|---|
| BNA-8 前的正式生产请求，或 Hosted Native 尚未通过安全 Gate | Canonical 或明确 Capability Gap |
| 必须使用 Route R1/R1B、WorldChangeSet、确定性 Solver 或不可信 Hosted 数据 | Canonical |
| 开放户外、参考图要求独特轮廓，且不存在未支持 Gameplay 能力 | Native ground-first：由 Native 创作地表/静态拓扑，再组合 admitted assets |
| 外观没有强约束，或已有许可证与质量均合格的 Registry 资产，且两条 Lane 都满足硬要求 | 默认 Canonical；locked-asset 是上游 sourcing/composition 策略，不是 Scene Source |
| 室内、洞穴、封闭高保真整景、多层动态表面 | 当前 Capability Gap 或 research-only；不得借“可显示”宣称支持 |
| 视觉目标与 Route/ChangeSet 等硬要求冲突 | Change Request 或显式用户决策；不得 overlay 两条 Lane |

优先选择 Canonical Lane 的场景：

- 平地、缓坡、标准 Heightfield、湖泊和基础室外世界；
- Primitive、已登记 Prototype、标准 Structure 和规则化布局；
- 大规模自动生成的测试世界、Golden Fixture 与回归用例；
- 需要确定性 Placement Solver、Route R1/R1B、WorldChangeSet 或结构化 Diff 的世界；
- Hosted 环境中的不可信数据创作；
- 需要引擎无关资产、长期迁移或无头 Compiler 的场景。

优先选择 Native Lane 的场景：

- 参考图驱动的独特轮廓和空间构图；
- 明显的山峰、峡谷、断崖、复杂阶梯和非规则平台；
- 视觉层次、雾、天空、云海、灯光和材质对可读性非常重要；
- Schema 扩展成本明显高于直接调用成熟 Babylon API；
- 第一目标是高质量白膜场景复原，且 V1 可接受 Full Reload。

场景重建模型可以为 Native 提供深度、多视角提示或被 Build/Admission 接受的独立静态 Mesh，但开放
户外默认仍是 ground/terrain-first。整房间/整关卡 `scene-shell` 在 V1 只允许作为 artifact-only 研究证据，
不能发布 `assetRef`、进入 Package 或被 Native 加载。重建输出若尺度任意、仅覆盖相机可见表面或存在
天空幕布、深度拉伸、孔洞和不连续表面，不能直接成为 Gameplay 地表。

### 6.5 Scene Authoring Attempt 与 Runtime Candidate Scene

`SceneAuthoringAttemptV1` 是一次完整场景创作运行的不可变身份，绑定
`SceneAuthoringRouteDecisionV1` Hash、参考/Brief、Bootstrap 或 Authoring 输入、Module 生成输入、被选择的
**已发布 Asset Resource Ref/Publication Receipt Ref**、Seed/Profile、验收目标和证据要求。它不引用 raw
Candidate 或未完成的 Production Result；Asset Production/Admission 失败属于独立的上游结果，不通过伪造
场景 Attempt 记录。它不是单个 Provider invocation，不是 `RuntimeSceneSource`，也没有已发布的
`WorldBuildIdentity`。

```ts
interface SceneAuthoringAttemptV1 {
  readonly kind: "scene-authoring-attempt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneAuthoringRouteDecisionRef: string;
  readonly sceneAuthoringRouteDecisionHash: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: string;
  readonly sourceInput:
    | Readonly<{
        kind: "canonical";
        authoringInputRef: string;
        authoringInputHash: string;
      }>
    | Readonly<{
        kind: "babylon-native";
        bootstrapInputRef: string;
        bootstrapInputHash: string;
        moduleGenerationInputRef: string;
        moduleGenerationInputHash: string;
      }>;
  readonly selectedAssetResources: readonly Readonly<{
    assetResourceRef: string;
    assetPublicationReceiptRef: string;
    assetPublicationReceiptHash: string;
  }>[];
  readonly seed: number;
  readonly authoringProfileRef: string;
  readonly acceptanceTargetRefs: readonly string[];
  readonly requiredEvidenceProfileRefs: readonly string[];
}

type SceneAuthoringAttemptResultV1 =
  | Readonly<{
      kind: "scene-authoring-attempt-result";
      schemaVersion: 1;
      id: string;
      sceneAuthoringAttemptRef: string;
      sceneAuthoringAttemptHash: string;
      outcome: "completed";
      authoredSourceRef: string;
      authoredSourceHash: string;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "scene-authoring-attempt-result";
      schemaVersion: 1;
      id: string;
      sceneAuthoringAttemptRef: string;
      sceneAuthoringAttemptHash: string;
      outcome: "rejected" | "tool-error";
      diagnosticRefs: readonly string[];
    }>;
```

`selectedAssetResources` 只负责冻结选择，不把 Asset Schema 复制进 BNA-1。BNA-3 校验每个 Publication
Receipt、Resource Manifest 与 Package Asset Lock 的 exact identity。

本文第 7.3 节的 **Runtime Candidate Scene** 只表示 Host 创建、尚未附着 Havok、Subject、Camera 和
fixed Tick 的临时 Babylon Scene。两者不得简称为同一个 Candidate，也不得共享身份：

- `SceneAuthoringAttemptResultV1.outcome` 为 `rejected` 或 `tool-error` 时，不产生新的 WorldPackage/
  World Build/场景生产能力证据；已在此前独立通过
  Admission 的内容寻址资产不被回滚或作废；
- Runtime Candidate Scene 失败时，原子销毁临时 Scene，当前已发布世界保持不变；
- 改变 Lane、组合策略、Source、Asset、Seed、Profile 或验收目标必须创建新 Authoring Attempt；
- 新 Attempt 必须从最早受影响的场景 Gate 重放，不能复用旧 Source/Package/Contribution/Collider 或
  Route Evidence；只有 Asset 字节、Admission Profile、License 或 Provenance 变化才重跑 Asset Admission。

## 7. Babylon Native Author API

### 7.1 独立包与唯一入口

生产化后，AI 只从专门的 Provider Authoring 包导入边界 API：

```ts
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContext,
} from "@whitebox-world/native-babylon";
```

Babylon 原生能力继续直接从冻结的 **Deep ESM Import Profile** 导入。不得使用 bare
`@babylonjs/core` root barrel、namespace import、旧 `babylonjs` 方言，或在同一代 Golden 中混用路径。

```ts
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
```

BNA-2 bake-off 见 `docs/reviews/2026-08-28-babylon-native-import-profile-bakeoff.md`。在当前
`@babylonjs/core@9.23.0` 上，同一五符号 Deep ESM fixture 稳定产生 330 modules / 2,884,740 bytes；
root barrel 因 package 标记的 side-effectful index 在超过 150 秒后仍未完成，已被工程门禁淘汰。淘汰候选
不进入永久 Test Lane；`@whitebox-world/native-babylon` 的 Package Boundary 直接禁止它。未来 Babylon
升级时重做一次性 bake-off 并 current-only 替换本结论，不并存两套公开写法。BNA-6 再用冻结后的唯一
Profile 测量模型首轮生成/修复成功率，不能用生成便利性推翻本边界。

`@whitebox-world/native-babylon` 不重写 `MeshBuilder`、`Material`、`Light` 或 Transform API。
它只提供 `defineBabylonNativeScene`、BuildContext、登记合同、资源 Resolver 和结构化诊断类型。
当前 Foundation 已把 AI-facing API 迁移到该包根入口，并把 Candidate Admission/Contribution Host
能力隔离在 `@whitebox-world/native-babylon/host`；这仍只是内部实验 checkpoint，不是 Native 生产入口。

### 7.2 目标 BuildContext

```ts
export interface BabylonNativeSceneBuildContext {
  readonly scene: Scene;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly random: HostRandom;
  readonly assets: LockedAssetResolver;
  readonly registration: BabylonNativeSceneRegistration;
}
```

- `scene`：由 Host 创建的 Runtime Candidate Scene。Module 不创建或替换 Engine/Scene。
- `bootstrap`：已解析、冻结的 Bootstrap，只读。
- `random`：由 uint32 `seed` 派生的确定性随机源；禁止 `Math.random()`。
- `assets`：只解析已经通过 source-neutral Asset Admission、进入 Registry/Package Lock 的精确 `...Ref`；
  Resolver 必须复验 class-specific Manifest/Build Record、字节 Hash、Import Profile、Admission Receipt 和
  Publication Receipt，
  不接受 Candidate ID、裸路径、任意 URL、Provider Handle 或运行时 `assets.has(...)` 回退。
- `registration`：唯一 Gameplay 交界面。

最小 V1 登记面：

```ts
registration.registerSpawnMarker({
  id: "player-spawn",
  positionMetersXYZ: [0, 1.1, 18],
  facingRadians: Math.PI,
});

registration.registerStaticCollider({
  id: "main-route-collider",
  mesh: routeCollisionProxy,
  traversalBinding: {
    kind: "static-surface",
    surfaceEntityId: "main-route",
    logicalSubshapeId: "primary",
    traversalSurfaceProfileRef:
      "worldkit://traversal-surface-profile/ground.static@1",
  },
});
```

这里的 `mesh` 是 Babylon Mesh，因为登记发生在 Provider-specific Authoring 包内；冻结输出不得把
Babylon Handle 泄漏到 engine-neutral Gameplay、Browser 或 Canonical Schema。V1 只登记一个 Spawn
和静态 Collider。动态刚体、移动平台、Trigger、可交互对象或 Semantic Anchor 需要单独版本和完整
Runtime Owner 设计，不能用可选参数袋提前占位。

`traversalBinding` 是必填闭合 Union：`{ kind: "not-traversable" }` 表示普通障碍，
`{ kind: "static-surface", surfaceEntityId, logicalSubshapeId, traversalSurfaceProfileRef }` 表示未来可进入
可信 Surface/Route 的候选。BNA-4 必须从登记 ID、`surfaceEntityId`、`logicalSubshapeId`、冻结几何 Hash
和 Profile Lock 确定性生成并冻结 `colliderSubshapeId` 与 `traversalSurfaceId`。BNA-7 只能消费这些既有
身份，不能再次扫描 Mesh 或合成另一套 Surface ID。`surfaceEntityId` 在这里是静态 Scene Surface 身份，
不自动创建 Gameplay Entity。

### 7.3 Build Epoch 与 Authority Audit

V1 的 `build()` 不是持续存在的 Scene Controller。目标 Host 必须按以下顺序建立能力闭包：

1. 创建尚未附着 SDK Havok、Controlled Subject 和主相机的 Runtime Candidate Scene，记录 Engine/Scene、
   Active Camera、Physics、Render callback、Observable/listener 与 Action Manager 基线；
2. 恰好调用一次 `build(context): void | Promise<void>`；Module 不能返回 Controller、Disposer、Update
   callback 或其他持续执行 Handle，`registration` 只在该 Promise settlement 前开放；
3. settlement 后立即关闭 Registration 并丢弃 Module/build 引用。Bundle 静态 Gate 禁止把 Scene、
   Engine、Mesh、BuildContext 或 Registration 保存到 module/global mutable binding，禁止用户定义的
   Babylon subclass lifecycle hook、直接 Render callback/Observable/Timer 注册，以及 Camera/Physics/
   Engine 控制 API；
4. Host 用受控 instrumentation 比较基线，拒绝 `activeCamera`、Physics Engine、Render Loop、Action
   Manager 或匿名 Module-owned observer/listener 的变化。Profile 允许的 Babylon Animation/Particle
   等纯视觉系统必须能归因到锁定的 Babylon-owned 类型和资源，并进入 Receipt，不能表现为匿名 Module
   closure；
5. 只有 Build、静态 Gate、Registration Admission 和 Authority Audit 全部通过后，Host 才冻结
   Contribution，附着 SDK-owned Havok、Subject、Camera 和 fixed Tick；在 30/60/120 Hz-like render
   调度、双实例与 Reset/Dispose 中再次证明没有 Module callback 执行或 Host-owned Handle 被替换；
6. 任一步失败都销毁整个 Candidate；不能清掉异常 observer 后继续发布一个已被 Module 触碰的世界。

这些机制是 Trusted Local 对受信代码的强制正确性 Gate，不是抵御恶意 JavaScript 的安全沙箱。完整
`Scene`、从 Mesh 反取 Scene 和动态语言逃逸仍要求 Hosted 使用 11.2/11.3 的进程/Worker/Origin 隔离或
更窄 Capability Facade。

### 7.4 禁止项

Native Module 不得：

- 创建或销毁 Engine、Scene、SDK Camera、Havok Plugin 或 Render Loop；
- 创建 Physics Body、Physics Aggregate、CharacterController 或调用 Physics Query；
- 注册 DOM/Input/WebSocket/Timer/全局事件或独立 Tick；
- 调用 `fetch`、访问环境变量、文件系统、任意 URL 或动态导入未锁定包；
- 使用 `Date.now()`、`performance.now()`、`Math.random()` 或 GPU 结果决定结构；
- 取得 Subject、Gameplay State、WorldSession 或 Browser Protocol 的可变 Handle；
- 用 Mesh 名、材质或颜色暗示碰撞和可走性而不登记；
- 在 Build 完成后继续登记或变换已经被冻结的 Collider 以期更新物理。

Babylon Animation、Particle System 等由 Scene 自身驱动的纯视觉效果可以被 Profile 允许，但不得产生
Gameplay 状态或外部副作用。任何会影响 Gameplay 的持续行为必须进入 SDK Action/System。

## 8. 登记、碰撞和通过性

### 8.1 “AI 选择意图，SDK 创建物理”

```text
high-detail visual mesh -----------------> Babylon render only

explicit low-detail proxy
  -> registration.registerStaticCollider
  -> ownership / finite / topology / budget admission
  -> immutable world-space geometry snapshot
  -> Host-private Babylon collision mesh
  -> SDK-created Havok shape and body
  -> checkSupport / movement / camera query
```

Native Code 负责决定：

- 哪些表面需要碰撞；
- 使用视觉 Mesh 还是独立低模代理；
- Collider ID；需要发布可行走语义时，选择已登记的 `traversalSurfaceProfileRef`；
- Spawn Marker 在视觉世界中的位置与朝向。

SDK 负责：

- Scene 归属、对象状态、有限数值、索引与拓扑校验；
- Collider 数量、顶点、三角形、资产和构建时间预算；
- 世界坐标快照、Hash、Host 私有 Mesh 与 Havok 生命周期；
- Physics Material、Filter、Ground Support、步进与碰撞查询；
- Spawn 与地表的支持关系校验；
- Debug Overlay、诊断、清理和失败时 Candidate 回滚。

SDK **不会**扫描整个 Scene 自动生成碰撞。显式登记已经足够简洁，也保留了 AI 对代理形状的表达能力，
同时避免远景山峰、云、瀑布、树叶或高面数视觉 Mesh 意外成为物理地表。

### 8.2 冻结后的视觉/物理关系

Admission 结束后，SDK 只相信被冻结的世界坐标几何快照。Module 后续隐藏、销毁或变换原始代理 Mesh，
不会改变物理；若视觉需要变更碰撞，V1 必须 Full Reload 并重新生成 Contribution Hash。

这条规则防止 Visual/Collider 在同一 Session 中产生双向隐式同步。Debug Overlay 必须同时显示视觉代理
和 Host 私有碰撞来源，方便 AI 与人检查错位。

Package build 与每次 Runtime load 使用同一 Contribution canonicalization：Spawn、按稳定 ID 排序的
Collider、冻结世界坐标 positions/indices、traversal binding、Profile/Resource Lock 和单位语义共同进入
canonical bytes；Module 的登记调用顺序不得影响 Hash。Runtime 必须在锁定 Bundle、Dependency、Asset、
Seed 和 Profile 下重新执行 Module，对 Candidate 做 Admission，再把实际 Contribution Hash 同
Package/Receipt/`WorldBuildIdentityV1.sceneSourceIdentity.nativeSceneContributionHash` 做 byte-exact
match。匹配前不得附着 SDK Kernel 或 publish Candidate；缺失/新增 Collider、Transform/vertex/index/
binding 漂移、非确定输出或 Receipt 篡改都必须产生稳定 mismatch Diagnostic，原子销毁 Candidate，不能
回退到 Package 中的旧 Collider 或继续显示新视觉。

### 8.3 碰撞、Route Evidence 与自动寻路是三层能力

V1 可以证明玩家在真实 Havok Surface 上落地、移动和通过固定 Probe，但不自动发布 Route 或 NavMesh。
未来若 Native Lane 需要 Route/Nav Evidence：

1. 导航输入必须来自同一份冻结 Static Collider Contribution 及其关闭 Traversal Surface binding；
2. Recast 或其他导航结果是该 Surface 的派生制品，不得重新扫描视觉 Mesh；
3. Route Profile、Agent 尺寸、坡度、台阶和 Portal 继续由 Trusted Host 校验；
4. 未通过正式 Gate 时，只能报告 Manual/Probe Passability，不能写成 Route Evidence。

因此不需要立即引入第二个游戏框架；先把 Surface 权威冻结。BNA-7 只负责可信 Route/Nav Evidence，
**不实现**产品级 `goTo`。自动寻路还需要目标/失败语义、路径请求 Command、重规划、取消、移动执行、
状态/Event/Receipt 和多 Agent 预算，应在 BNA-7 之后另立 Gameplay/Navigation 设计与实施计划。

## 9. Runtime Kernel 的统一

两条 Lane 的 Scene Builder 不同，但 Scene Builder 之后必须共享同一 Kernel：

```text
                     +-> Canonical Babylon Scene Builder -+
RuntimeSceneSource --|                                    |
                     +-> Native Babylon Scene Builder -----+
                                                          v
  GameplayBootstrap + WorldRuntimeBootstrap -> RuntimeHost -> WorldSession
                                               |       |       |
                                               v       v       v
                                            Havok   Subject   Camera/Action
                                      |
                                      v
                              Snapshot / Receipt / Capture
```

当前实现已把 Babylon Gameplay Kernel 输入抽取为 `WorldRuntimeBootstrap`，并把 Kernel 从 Canonical
Scene Builder 中分离；Native 实验复用该 Kernel，不复制 Native Runtime。具体不变量：

- 一个 Session 只有一个 Scene、一个 Physics Plugin、一个固定 Tick 和一个主 Camera Owner；
- Spawn 只有一个来源；Native Source 不再保留 Plan Spawn 作为影子值；
- `GameplayBootstrapV1` 与 `WorldRuntimeBootstrap` 各解析一次，Entity/Feature/Action/Subject/Camera 只创建
  一次；
- `checkSupport()`、Subject Facing、Action、Camera Orbit 和 Runtime State 不因 Lane 改变；
- Scene Source 的差异只通过 source-neutral `WorldBuildIdentity` 发布，不污染 Browser Protocol 的
  Gameplay 状态字段；
- Runtime Candidate 构建、Contribution Admission、Promotion 和 Dispose 保持原子：部分构造失败不能污染
  当前世界；上游 Asset Publication 使用自己的原子边界。

## 10. Package、Hash 与 Receipt

Native Module 是代码，因此比 JSON 更需要完整身份。生产 Native 世界至少锁定：

- Bootstrap canonical bytes 与 `contentHash`；
- Scene Module 源/Bundle 的内容 Hash；
- `nativeSceneApiRef` 与解析后的版本/Hash；
- `nativeSceneProfileRef` 与解析后的版本/Hash；
- `sceneAuthoringRouteDecisionHash`、completed `sceneAuthoringAttemptResultRef`/Hash 与对应 Attempt ID/Hash；
- Host/tenant 授权的 Profile/Cap identity、逐项 effective budget 和实际用量；
- npm/Babylon/Havok 的 `resolvedVersion` 与依赖锁 Hash；
- 所有 `assetRef`、Manifest/实际字节 Hash、许可证和来源，以及对应 Asset Admission Profile/Receipt Hash、
  Asset Publication Receipt Hash；
- Asset Manifest 所引用的 Production Request/Result/Receipt Hash、Provider/模型 `resolvedVersion`、输入
  Hash、Seed、坐标/尺度/Forward/Pivot、Inventory 和 class-specific Build Record；这些是来源证据，不让
  Provider Handle 进入 Runtime；
- `GameplayBootstrapV1` 的 Ref 与 `contentHash`；
- `WorldRuntimeBootstrap` 的 Ref 与 `contentHash`；
- `GameplayBootstrapV1`、`WorldRuntimeBootstrap`、Native Module 和所有登记项的完整传递 Registry Lock，
  包括 Subject/Physics/Control/Camera 资源以及每个 `traversalSurfaceProfileRef`；
- source-neutral `WorldBuildIdentityV1` 的 canonical bytes 与 Hash；
- 冻结 Spawn/Collider Contribution 的 canonical Hash；
- Admission Profile、诊断和构建结果。

Candidate 目录、Provider Cache、Unknown submission、Rejected Receipt、未接受字节和 artifact-only
`scene-shell` 不得进入 Native WorldPackage Root。BNA-3 只消费 source-neutral Asset Publication 完成的
不可变 Resource Ref；它不负责调用 Provider、执行 class-specific Build 或补全缺失的资产证据。

Host 必须为 Native Source 产生正式 Package/Build Receipt 变体，不能伪造一个没有被消费的
ExecutionPlan，也不能只用 Vite 文件名当可信 Receipt。具体 Package 版本在 BNA-1/BNA-3 中冻结；任何
公开变化使用 `schemaVersion` 和显式迁移，不保留永久 alias 字段。

`WorldBuildIdentityV1` 含 `worldPackageRootHash`/`worldPackageRef`，因此它是 **root 计算后的
receipt-derived transport metadata**，不得进入 root-bound Package Inventory，避免自引用 Hash。冻结
顺序必须是：先冻结 Bootstrap、Module、Runtime Bootstrap、Registry Lock 与 Contribution 等 root
文件并计算 Package Root；再派生 Package Ref 和 `WorldBuildIdentityV1`；最后把 Identity canonical bytes/
Hash 写入同样不参加 Root Inventory 的 Build Receipt/transport metadata。Verifier 必须从 root-bound
文件重算 Package Root 和全部组件 Hash，再重建 Identity 并与 Receipt byte-exact 对拍。BNA-3 不得把
Identity 文件反向加入 Root Inventory 或用第二个“近似 Root”打破该顺序。

结构确定性与像素确定性分层：

- 同 Bootstrap、Module Bundle、Dependency Lock、Asset Lock、Seed 和 Profile 必须得到相同的结构
  Contribution 与 Hash；
- 浏览器/GPU 像素可按既有 Capture 容差验收，不承诺跨硬件 bit-for-bit 相同；
- 任何未锁定网络资源、系统时间或随机源都会使 Receipt 失败。

## 11. Trust Profile 与安全边界

### 11.1 Trusted Local

第一阶段可生产化的合理边界是受信本地/仓库代码：

- Module 属于当前 Workspace 并经过代码审查；
- 依赖来自固定 workspace allowlist；
- 无凭据、无任意网络、无动态包；
- Typecheck、Bundle、静态规则、Admission 和浏览器 Gate 全部通过；
- Runtime 仍只信 Host 的最终登记与重验结果。

### 11.2 Hosted Isolated

AI 远程生成并执行任意 Babylon TypeScript 是不同的威胁模型。在生产 Hosted Lane 宣布可用前必须证明：

- 隔离的构建/执行环境与最小凭据；
- 依赖 allowlist、静态导入和 Bundle 资源上限；
- 无网络、DOM、存储、环境变量、动态代码和跨世界访问；
- CPU、内存、构建时间、Scene Node、Texture、Shader、Collider 与资产预算；
- Runtime Candidate Scene 失败/超时时可强制终止且不污染 Host；
- Bundle、依赖和输出可重放并生成完整 Receipt。

当前完整 `Scene` 暴露只在 Trusted Local 实验中存在，它本身不是安全沙箱。Hosted Isolated 可以采用
进程/Origin/Worker/构建隔离或更窄 Capability Facade，但不得为了安全重新发明一套完整 Babylon DSL。
在方案和对抗 Gate 冻结前，Hosted Native 状态保持 No-Go。

### 11.3 完整 `Scene` 不是 Capability Sandbox

TypeScript 的 `readonly scene: Scene` 只禁止类型层替换引用，不能限制 Babylon 对象本身的能力。即使
Import Profile 不公开某些构造器，Module 仍可能尝试调用 `scene.dispose()`、`scene.getEngine()`、
`scene.registerBeforeRender(...)`、Scene Observables 或 `scene.enablePhysics(...)`；被允许的 Babylon 导入
也可能被用于创建额外 Camera、Physics 或持续回调。因此“只给完整 Scene + readonly”不能作为恶意代码
隔离结论，静态 lint 也不能证明运行时无逃逸。

- **Trusted Local** 的安全前提是受信仓库代码、代码审查、冻结依赖、静态禁止规则、Bundle 后检查和
  Host Admission 的组合；它防误用并提供可追责证据，不声称抵御恶意 Module。
- **Hosted Isolated** 必须把 Module 放进可强制终止、无凭据、无网络且与主 Runtime 隔离的进程、Worker
  或 Origin；若完整 Scene 无法被安全暴露，可以提供更窄的 Babylon Capability Facade，但该 Facade
  只缩小安全能力，不能演变成另一套场景 DSL 或把 Provider Handle 泄漏给 Gameplay。
- BNA-5 必须对上述具体逃逸路径和直接构造 Camera/Physics/Render callback 做对抗测试，并分别给出
  Trusted Local 的检测证据与 Hosted 的阻断/终止证据；未通过时 Hosted 维持 No-Go。

## 12. AI 友好性合同

AI 友好不等于减少所有约束，而是让约束少、稳定、可发现、可自动修复。

### 12.1 一套方言

- 一个入口：`defineBabylonNativeScene`。
- 一个核心 Provider/Registration 包：`@whitebox-world/native-babylon`。可选创作 Profile Helper 可以独立
  发包，但不得定义第二个 Scene Source、Registration Authority 或 Runtime。
- 一个 Babylon Import Profile：首代由 BNA-2 bake-off 冻结，发布后只保留一套公开方言。
- 一套单位与坐标：米、`+Y` 向上、`-Z` 为主体前方、角度字段使用 Radians。
- 一个显式登记对象：`registration`。
- 一个 Asset 入口：只接受 `...Ref`。
- 一个随机源：`context.random`。

### 12.2 类型、诊断和自修复

生产 API 必须提供：

```ts
type NativeSceneDiagnosticMeasurementV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "count";
      actualCount: number;
      maximumCount: number;
    }>
  | Readonly<{
      kind: "bytes";
      actualBytes: number;
      maximumBytes: number;
    }>
  | Readonly<{
      kind: "duration-seconds";
      actualSeconds: number;
      maximumSeconds: number;
    }>;

interface NativeSceneDiagnosticV1 {
  readonly kind: "native-scene-diagnostic";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly severity: "warning" | "error";
  readonly stage:
    | "routing"
    | "capability"
    | "bootstrap"
    | "tooling"
    | "dependency"
    | "typecheck"
    | "bundle"
    | "build"
    | "source-admission"
    | "contribution-admission"
    | "authority-audit"
    | "runtime-replay"
    | "runtime"
    | "capture";
  readonly code: string;
  readonly location:
    | Readonly<{ kind: "none" }>
    | Readonly<{ kind: "bootstrap"; instancePath: string }>
    | Readonly<{
        kind: "source";
        sourcePath: string;
        lineNumber: number;
        columnNumber: number;
      }>
    | Readonly<{ kind: "registration"; registrationId: string }>
    | Readonly<{ kind: "asset-resource"; assetResourceRef: string }>
    | Readonly<{
        kind: "asset-lock";
        assetResourceRef: string;
        assetAdmissionReceiptRef: string;
        assetPublicationReceiptRef: string;
      }>
    | Readonly<{
        kind: "world";
        positionMetersXYZ: readonly [number, number, number];
      }>;
  readonly measurement: NativeSceneDiagnosticMeasurementV1;
  readonly message: string;
  readonly repairHint: string;
}

interface NativeSceneCheckResultV1 {
  readonly kind: "native-scene-check-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly checkedInput:
    | Readonly<{ kind: "unresolved-world" }>
    | Readonly<{
        kind: "native-scene-module";
        sceneModuleRef: string;
      }>;
  readonly outcome: "passed" | "rejected" | "tool-error";
  readonly diagnostics: readonly NativeSceneDiagnosticV1[];
}
```

所有诊断都携带闭合 `measurement` Union；非预算诊断使用 `{ kind: "none" }`，预算诊断使用
`count`、`bytes` 或 `duration-seconds`，并使用
`actualCount/maximumCount`、`actualBytes/maximumBytes`、`actualSeconds/maximumSeconds` 等带单位字段；
不得把 provider 异常或任意 `details/params` 对象作为公共机器合同。
`location.kind === "source"` 时，`sourcePath` 必须是相对 Native `world-directory`、使用 `/` 分隔的
canonical relative path；不得输出绝对 Host 路径、Workspace 路径或临时目录。BNA-3 Bundle 必须原样
保留同一相对路径，不得把同一个字段重新解释为另一套 bundle-internal 路径方言。
Bootstrap 尚未解析或工具在解析前失败时，Check Result 使用
`checkedInput: { kind: "unresolved-world" }`，不能伪造 `sceneModuleRef`；解析成功后必须使用
`native-scene-module` 成员。Module 身份只由 Result-level `checkedInput` 拥有，Diagnostic 不重复
`sceneModuleRef`，避免未解析输入被迫伪造 Ref 或两处身份漂移。
`outcome` 与 Diagnostics 必须满足闭合不变量：`passed` 不得含 `severity: "error"`；`rejected` 至少
包含一条 Error；`tool-error` 至少包含一条 `stage: "tooling"` 的 Error。Parser、CLI 与 Golden 必须用
负向用例拒绝 `passed + error`、`rejected + warnings-only` 和 `tool-error` 无 tooling Error 的组合。

Asset Candidate 使用 source-neutral 资产设计中独立的 Asset Production/Admission/Publication Result，不扩张
`NativeSceneCheckResultV1.checkedInput` 来同时承担 Asset 和 Module 身份。BNA-2 的
`worldkit native check <world-directory>` 是 workspace/module 检查且明确 asset-free；任何
`context.assets.resolve()` 都 fail-closed，它不校验尚不存在的 Package/Receipt。BNA-3 才定义独立的
Package/Asset admission 入口，校验 Package 中已发布、已锁定的 Asset Resource/Admission/Publication
Receipt 与 Module 消费关系；该入口不得复用 BNA-2 CLI 名称来形成同名双语义。缺失资源使用
`location.kind: "asset-resource"`，三者 identity 不一致使用 `location.kind: "asset-lock"`。Rejected 或
tool-error 的 Asset Result 发生在 Package 之前，必须原样由 APA 工具返回，不能为了塞进 Native Diagnostic
伪造不存在的 Resource Ref，也不能复制其 stage、code、measurement 或 Provider details 为另一套字段。

- 完整 TypeScript 类型、JSDoc 和最小可运行示例；
- 稳定错误码、Module/Collider/Marker ID、世界坐标和预算差额；
- `worldkit native check` 与 `worldkit native explain` 等只读检查入口；
- 构建失败、Source/Contribution Admission、Authority Audit、Runtime Replay、运行失败和视觉 Gate 的
  分层报告；
- 同一个 Agent Task 内最多三次 bounded self-repair，Host 重放 Checker；
- 不把 Babylon/Havok 的裸异常当公共诊断。

`worldkit native check <world-directory> --json` 的 stdout 始终只输出一个闭合
`NativeSceneCheckResultV1` JSON：`outcome: "passed"` 对应 exit code `0`；Bootstrap/Typecheck/Bundle/
Source Admission/Contribution Admission/Authority Audit/Runtime Replay/Capability 拒绝对应
`outcome: "rejected"` 和 exit code `1`；工具自身或环境失败对应
`outcome: "tool-error"` 和 exit code `2`。人类日志只写 stderr。`worldkit native explain` 使用同一
Diagnostic DTO。
上述 CLI 名称和语义已由 BNA-2 实现。BNA-3 必须消费同一检查结果，不得复用这些名称创建第二套
Package/Receipt 检查语义；BNA-2 的交付输出始终是结构化 Diagnostics，不只返回 build callback 或
字符串 Error。

### 12.3 失败处置与回退

`SceneAuthoringAttemptResultV1` rejection 与 Runtime Candidate Scene rollback 是两件事：

- 当前 Scene Authoring Attempt `rejected` 或 `tool-error` 不得产生新的 WorldPackage、World Build Receipt 或
  场景 Production capability evidence，但不撤销已独立完成的 Asset Publication；
- Asset Admission/Publication `rejected` 或 `tool-error` 不得为该输入产生新的 Registry Resource；当前已
  发布世界和此前独立发布的资产保持不变；
- bounded self-repair 的每一轮都创建新的 `SceneAuthoringAttemptV1` identity。Source、Asset、Lane、组合策略、Seed、
  Profile、预算或验收目标变化会使受影响的场景 Receipt/Hash 失效，并从最早受影响 Gate 重放；未变化
  资产的 Admission/Publication Receipt 不随场景 Attempt 失效；
- Asset 格式、许可证、预算或视觉质量失败时，只能提交新的 Asset Production Request，或由资产类别
  Owner 使用新的 Build 输入/Profile 产生新的 Build Record/字节；允许的下一步是新的生成
  尝试、通过同等 Admission/Publication 的授权资产、在验收目标不变时使用 Primitive/ground-first
  composition，或
  明确 Capability Gap；
- 场景重建不一致时不得无界重滚。切换 ground-first、授权资产或 Lane 必须形成新的
  `SceneAuthoringRouteDecisionV1` 与 `SceneAuthoringAttemptV1`，不得静默降级、不得把必需 Gameplay
  能力改写成装饰视觉；
- Source Admission、Authority/Security 或 Runtime Replay 失败没有“旧 Collider + 新视觉”回退：Host
  原子销毁 Runtime Candidate Scene，保留当前世界并返回稳定诊断。

回退选择必须在 Package build 前冻结并进入 Receipt；Native Module 不在 Runtime 内查询文件存在性或
Provider 状态。外部工具推荐的室内/封闭重建路线不能覆盖 WorldKit 当前能力边界。

### 12.4 Golden Corpus

至少维护以下正向 Golden：

1. `minimal-ground`：最小 Scene、Spawn 与一个地面 Collider；
2. `stairs-platforms`：规则台阶、平台、低模连续代理和顶部落地；
3. `cliff-canyon`：明显峡谷/悬崖轮廓与连续主路径；
4. `gltf-landmark`：锁定 GLB、资源生命周期和静态碰撞代理；
5. `fog-water-background`：雾、水和纯视觉远景不进入碰撞；
6. `cloud-ridge`：参考图白膜、T 字山门、柱状山峰、云海与真实通过性。

负向 Golden 至少覆盖：重复 Spawn/Collider ID、错误 Scene Mesh、NaN/Infinity、空几何、越界索引、
Thin Instance、已有 Physics Body、预算超限、登记关闭后写入、未锁定 Asset、Asset Receipt/字节 Hash
不一致、错误尺度/Forward/Pivot、缺失许可证、artifact-only `scene-shell` 试图进入 Registry/Package/Runtime、
网络/随机/时间
访问、Module throw、部分构造清理、双实例隔离、Visual/Collider 错位，以及拒绝后静默换 Lane/Asset
并复用旧证据。

BNA-6 开始生成前必须冻结 `NativeSceneEvaluationProfile`：模型与版本、reasoning effort、共同用户任务、
参考图/Brief Hash、两条 Lane 各自公开且版本锁定的 contract docs 与 system/task prompt Hash、实际
context token 数、相同有效生成/修复预算、Bootstrap/API/Import Profile、Dependency Lock、Seed、最大
三轮修复、Case 列表和每项 Blocking Threshold；还必须冻结 `SceneAuthoringRouteDecisionV1`、组合策略、
是否允许 published asset/reconstruction research candidate、对应 Production/Admission/Publication Receipt
Hash 和相同有效
资产生产预算。每个适用 Case 使用同一用户参考、Scene Brief、模型、reasoning effort 和预算分别生成
Canonical 与 Native 候选；由于输出合同不同，两条 Lane 可以附带各自已冻结的合同说明，但不得加入
未登记的针对性提示，也不得给一条 Lane 临时追加未计费的生成资产。随后分开量化：

- Typecheck/Bundle/Admission 首轮与三轮内成功率；
- 关键地形/结构/语义目标、Opening Frame region/anchor 和白膜轮廓；
- Spawn Support、固定路径 Probe、Collider Overlay 对齐和 Dispose；
- Scene/Collider/Texture/Bundle 预算与生成/修复轮次；
- Canonical 与 Native 各自不支持能力的诚实诊断。

为实证“模型是否更熟悉 Three.js”，BNA-6 还要在预先选定的代表 Case 中运行一个**非产品、离线
Three visual baseline**：冻结同一模型、用户参考、Scene Brief、reasoning effort、生成/修复预算及
版本化 Three contract context，只比较首轮/三轮内 Typecheck、可渲染率、结构目标和白膜视觉构图。
它只输出 GLB/截图与评测记录，不接入 Runtime、Havok、Camera、Capture 合同或公开 Endpoint，也不能因
某次视觉得分更高推翻单 Babylon 内核的集成成本裁决。Three baseline 的 prompt/context Hash 和 token
数与另外两条 Lane 一并记录，禁止事后挑 Case 或增加专用提示。

阈值必须在看到正式结果前登记，BNA-8 不得为取得 GO 事后改阈值或只挑成功 Case。Native 方向至少要在
复杂山峰/峡谷/阶梯参考 Case 上表现出预先定义的结构或构图改善，同时保持 SDK Physics/Camera Gate；
否则应回到 Change/Stop disposition，而不是因为 API 已经实现就默认继续。

### 12.5 Skill 的定位

Skill 可以教 AI 如何从参考图拆解前景/中景/背景、如何选择低模 Collider 和如何跑 Checker，但它不是
正确性的必要条件，也不保存私有字段。Schema、类型、Profile、Golden 和诊断才是稳定合同。即使没有
Skill，一个通用 Coding Agent 也应能依靠公开 API 和错误信息完成场景；有 Skill 时只提升首轮成功率。

### 12.6 Block Whitebox 是 Profile，不是 Protocol

参考图白膜的首个推荐方法由
[Babylon Native Block Whitebox 创作 Profile](./2026-08-28-babylon-native-block-whitebox-profile-design.md)
定义。它允许一个可选 `@whitebox-world/native-babylon-block-profile` 包在单次 Build Epoch 中维护
package-local 的内存 Block Layout，用于固定形状、Occupancy、连续坡面、边界、Chunk 和 authoring
diagnostics；Profile Helper 必须返回真实 Babylon 对象，普通 Babylon `MeshBuilder` 始终可直接使用。

该内存 Layout 不是可序列化 `BlockWorldManifest`、Runtime 输入或第二状态权威。它只能在 Finalize 时
产生结构诊断、Profile-local Visual Group inventory，以及 core Registration 已冻结的显式 Spawn/Static
Collider Contribution；Traversal 只使用同一 Collider 登记的关闭 binding。Runtime 只信 Host 冻结的
Contribution 与 SDK 创建的 Havok。Profile 的详细 Package 处置、场景构造原则、碰撞同源派生、Corpus
和 BWB 工作图以上述文档为唯一权威。

## 13. 版本与升级策略

- Bootstrap 序列化结构使用 `schemaVersion`。
- Registry Module/Profile/API 资源使用 `version`。
- Package Lock 使用 `resolvedVersion` 与内容 Hash。
- Babylon/Havok 版本由 Workspace 和 Native Scene Profile 冻结，AI 不在每个世界里选择版本。
- 引擎升级必须跑 Native Golden、Canonical Runtime、碰撞/移动/相机、Bundle 和 Visual Gate；不能只靠
  Typecheck 判定兼容。
- `nativeSceneApiRef` 只在边界合同不兼容时升级；新增 Babylon 功能通常只升级 Engine/Profile，
  不需要修改项目自有 Scene DSL，因为本设计没有 Scene DSL。
- 当前仓库全部相关 API/Schema 均未发布，本设计默认使用 Clean Break，而不是把兼容作为默认成本；
  Rename 必须同步 Schema、类型、全部 consumer、示例、Fixture、Golden、Parser 和 Conformance，并删除
  旧入口、旧字段与旧制品。
- 首次外部发布之后才允许为真实采用者设计版本迁移；在此之前不得为了假想用户保留 deprecated
  re-export、alias 字段、双 Parser 或 legacy/new Runtime 分支。
- Native V1 不接受 `WorldChangeSet`。Source/Bootstrap 变化必须产生新的 Package Root 和
  `WorldBuildIdentityV1`，再由 RuntimeHost 原子 Full Reload replacement；这只是发布替换语义，不是
  Native ChangeSet。未来 Native Edit/Incremental 能力必须另立版本化协议、Receipt 和等价性 Gate。

截至本文写作时，仓库安装的是 `@babylonjs/core@9.23.0` 与 `@babylonjs/havok@1.3.14`；这是当前实现
证据，不是文档永久承诺。实际版本始终以 Package Lock 和 Build Receipt 为准。

## 14. 为什么不提供 Three.js Native Endpoint

公开生态可能让模型更容易生成 Three.js，但本设计不把这种印象当作已验证事实；BNA-6 会用冻结的
非产品离线 Three baseline 与 Canonical/Babylon Native 候选做公平对照。无论熟悉度结果如何，当前
产品内核已经统一到 Babylon/Havok，再提供在线
Three Endpoint 会引入：

- 第二个 Scene Graph、资源加载、材质、相机、Render Loop 和销毁语义；
- Three 视觉与 Babylon/Havok Gameplay 地表之间的 Transform/Asset/生命周期桥；
- 两套浏览器、Capture、Debug、性能和引擎升级矩阵；
- AI 需要选择两种方言，反而降低长期稳定性；
- 很容易重新出现 Three 视觉真相与 Babylon 物理真相的漂移。

因此，Native Scene 的对外代码与底层 Runtime 都使用 Babylon。Three.js 可以继续作为离线制作工具：
AI 用 Three 生成原始 GLB，经资产类别 Build Record 和只读 Asset Admission 后由 Babylon 加载；这不创建
第二个运行时 Endpoint。
若未来要恢复 Three Runtime，必须单独 ADR、Provider Parity 和完整生产 Gate，不能作为本设计的兼容层。

## 15. 当前实现事实与目标差距

| 能力 | 2026-08-30 当前实现事实 | 本设计目标 |
|---|---|---|
| Native Module API | BNA-2/BNA-3/BNA-4 已工程闭合；verified Package 经唯一 Host 入口进入 Source/Authority/Runtime/Surface Admission | 完成 BNA-5/BNA-6，并通过 BNA-8 disposition 后，才可开放 Hosted 与最终生产入口 |
| Bootstrap | Bootstrap、Bundle、Contribution 与 WorldPackage/Receipt identity 已闭合并进入正式 Runtime | BNA-5 增加 Hosted Trust/Isolation，不改变 Bootstrap 权威 |
| Gameplay 复用 | Native 已通过正式 Package/Surface Admission 复用 `GameplayBootstrapV1` + Plan-independent `WorldRuntimeBootstrapV1` 与同一 Kernel，无影子 Plan | 后续只扩展隔离、评测与 Capture，不复制 Kernel |
| 通用世界身份 | BNA-3 已由同一 Root 后派生 Native Package Ref、Build Identity 和 Receipt；Plan-specific Route/Edit 仍显式使用 Plan Hash | BNA-4 只消费该已冻结身份，不恢复 generic Plan Hash |
| Runtime Source | verified union 已把 receipt-bound Native Bootstrap/Bundle identity 接入同一 RuntimeHost；旧 formal rejection 已 current-only 删除 | BNA-5 为 Hosted 增加隔离 admission，不恢复第二 Runtime Source |
| 登记 | Spawn、静态 Collider Contribution、Route/Attempt/Check 及预算进入 Native Root；BNA-4 从冻结 Contribution 创建 SDK-owned Havok | BNA-5/6/7 补隔离、评测与 Capture 证据 |
| Physics/Subject/Camera | 已由 SDK/Havok 接管并通过实验移动 | 继续使用同一生产 Kernel，不复制 Runtime |
| 场景效果 | `cloud-ridge` 已显示核心构图并有通过性 Probe | Golden Corpus、正式 Visual/Interaction Gate |
| Package/Receipt | BNA-3 已实现 deterministic Bundle、Dependency/Asset Lock、统一 Package/Receipt/verifier/Store/File/signing/inspect，并通过 exact-SHA Cloud GO 合入 main | 作为 BNA-4 唯一 Package 输入 |
| Asset Production/Admission | 无已实现的 source-neutral Request/Candidate/Build/Admission/Publication 合同；实验只消费本地 GLB | 由独立 APA 设计经 class-specific Build、只读 Admission 与原子 Publication 产生 locked assetRef，Native 只消费，不调用 Provider |
| 安全 | 受信本地实验，完整 Scene 访问 | Trusted Local 生产 Profile；Hosted 需隔离 Gate |
| Route/寻路 | 无正式 Route/Nav Evidence | 可选地从同一冻结 Surface 派生并独立验收 |
| WorldChangeSet | 未支持 | Native V1 明确不支持；Source/Bootstrap 变化构建新 Package/Identity 并由 RuntimeHost Full Reload replacement |
| Hosted Builder | 未支持 | 只有 BNA-5 安全闭合后才可开放 |

因此，本设计通过不表示 Native Lane 当前生产可用。当前唯一正式生产世界构建入口仍是 Canonical
Authoring V4 -> IR V4 -> Canonical Scene Plan V1 + Gameplay/World Runtime Bootstrap V1 ->
RuntimeWorldConfiguration V1 -> Babylon/Havok。

## 16. 风险与缓解

| 风险 | 设计约束 |
|---|---|
| 两条 Lane 变成两套游戏引擎 | Scene Builder 可分，Gameplay Kernel、Havok、Subject、Camera、State 不分 |
| JSON 与 Native 同时写几何 | 每个世界恰好一个 `sceneSource.kind`，V1 禁止 overlay |
| Asset Production 变成第三条 Scene Source | raw Candidate -> class Build -> read-only Admission -> atomic Publication；只发布独立 locked Ref，世界 Placement 仍由所选 Source 独占，发布后无 Dressing Pass |
| 重建 Mesh 被误当米制 Gameplay 地表 | 独立 Mesh 需尺度/Build/Admission；整房间 `scene-shell` 只作 artifact-only 研究；Gameplay 使用独立代理、显式登记和 SDK Surface Admission |
| 失败后静默换 Lane、资产或策略 | 冻结 `SceneAuthoringRouteDecisionV1`；变化创建新 `SceneAuthoringAttemptV1` 并重放受影响场景 Gate，未变化 Asset Admission/Publication 可复用 |
| Provider 状态污染 Runtime | 仅离线一次提交/对账；Runtime 只消费 Asset Lock，不访问 Provider/Cache/任意 URL |
| Native 代码绕过 Host | Build-only、禁止 Physics/Camera/Input/Tick、Candidate 原子发布、最终 Admission |
| Visual/Collider 漂移 | 显式代理、世界坐标冻结、Contribution Hash、Debug Overlay、Full Reload |
| 影子 ExecutionPlan 形成幽灵真相 | Runtime Source Union + `GameplayBootstrapV1` + `WorldRuntimeBootstrap` + source-neutral `WorldBuildIdentity` |
| AI 随意抬高预算 | AI 只能选 Host/tenant allowlist；effective budget 逐项取 requested profile 与 hard cap 最小值，Receipt 记录请求、授权、有效值和 actual |
| Hosted 任意代码风险 | Trusted Local 与 Hosted Isolated 分开验收；Hosted 默认 No-Go |
| Babylon 升级导致模型代码漂移 | 单一 Import Profile、依赖锁、API Ref、Golden Corpus 和升级矩阵 |
| AI 仍不知道项目约束 | 类型 + 示例 + `check/explain` + 稳定诊断；Skill 只做辅助 |
| Native 场景被误称 Route 可达 | Passability、Route、Nav 与 Manual evidence 分层声明 |
| Native 侵蚀 Canonical 价值 | Canonical 继续拥有 Compiler、Route、ChangeSet、自动化和不可信数据 Lane |

## 17. 生产化依赖工作图

### BNA-0：冻结长期架构权威

- 目标与独立交付物：接受“一世界、两 Lane、一 Kernel”，交付本文、ADR-0007、source-neutral Asset
  Production/Admission 指针和 Mode A 审查。
- `depends_on`：ADR-0006、2026-08-27 实验切片和用户 Continue 决策。
- `blocks`：BNA-1 至 BNA-8。
- 独占所有权：跨 Lane 架构、术语、Source/Gameplay/Runtime 权威分工。
- 输入/输出合同：实验事实与 Canonical 合同 -> 长期设计权威。
- 集成点：文档与 Backlog，不修改 Runtime。
- 验证证据：D1/D2/D3/D6 审查、链接/claim/diff 检查。
- 执行模式：`main-agent-only`。

### BNA-1：Runtime Scene Source 与 Bootstrap 合同

- 状态：**已完成（2026-08-29）**。完成仅指合同、Canonical identity migration、实验 shadow Plan
  删除和分配前 Native rejection；不表示 Native 生产准入。

- 目标与独立交付物：冻结闭合 `sceneSource` Union、Native Bootstrap Schema、Plan-independent
  `WorldRuntimeBootstrap` 与 source-neutral `WorldBuildIdentity`；移除 Native 对影子 ExecutionPlan 的
  依赖，同时复用 `GameplayBootstrapV1`；Canonical 先在 Feature branch 建立 V5 exact-equality 派生
  Gate，再以 current-only clean break 切换到只引用 World Runtime Bootstrap 的当前 Scene Plan，接受树中
  不保留旧类型、旧 Parser、alias、双字段或 legacy/new 选择；同时冻结 Scene Authoring Route
  Decision、Authoring Attempt 与 Runtime Candidate Scene 的身份/失效语义，禁止静默换 Lane/策略。
- 阶段边界：BNA-1 只迁移正式 Canonical RuntimeHost identity，并让已解析 Native member 在 adapter/
  Candidate 分配前返回稳定 capability rejection。Trusted-local Cloud Ridge 可在显式实验 harness 中证明
  无 shadow Plan 的共享 Kernel；BNA-3 提供正式 Package/Receipt 后，只有 BNA-4 可以移除该 rejection
  并接通 Native RuntimeHost admission。
- `depends_on`：BNA-0。
- `blocks`：BNA-3、BNA-4、BNA-7、BNA-8。
- 独占所有权：RuntimeWorldConfiguration 下一版本、Native Bootstrap Schema/Parser、
  `WorldRuntimeBootstrap`、`WorldBuildIdentity`，以及 WorldSession/State/Adapter/Browser/Capture/Take/
  Validation 中 source-neutral identity 的版本迁移；同时独占 `SceneAuthoringRouteDecisionV1`、
  `SceneAuthoringAttemptV1` 与 `SceneAuthoringAttemptResultV1` Schema/Parser/Hash，不拥有 Asset
  Request/Result/Admission/Publication；不得同时改 Native API 实现。
- 输入/输出合同：Scene Brief/capability/trust facts -> Route Decision；Route Decision + Authoring/Module
  inputs + selected published resource refs -> Authoring Attempt；completed Attempt Result + Bootstrap +
  Gameplay Bootstrap + locked Registry refs ->
  Runtime Scene Source + World Runtime Bootstrap + World Build Identity。
- 集成点：RuntimeHost configuration Parser、Canonical Candidate load/create/replace，以及 Native
  pre-allocation capability gate；不在 BNA-1 创建正式 Native Candidate。
- 验证证据：exact-key/union/hash/mismatch 负向测试、Canonical 回归、所有 `executionPlanHash` consumer
  census、V5 projection exact equality、终态无重复 Runtime closure、无 ghost/fake Plan Hash、
  Browser/State/Capture identity migration、route/attempt identity 与换路失效测试，以及 current-only clean
  break；最终 source census 必须证明旧字段、旧 Parser、旧导出、兼容 Adapter 和旧 Fixture 为零。
- 执行模式：`main-agent-only`。

### BNA-2：独立 Babylon Native Authoring 包

- 状态：**Trusted Local 工程闭合已通过 exact-SHA Cloud gate 与独立 Mode B + runtime-deep 审查**。
  闭合包括 Source Admission、Candidate Authority Audit、双 Candidate Replay、稳定 checker/explain CLI
  和 current-only consumer 迁移；不包含 BNA-3 Package/Receipt、BNA-4 正式 RuntimeHost/Havok 或 BNA-5+
  Hosted/评测/Capture 能力。
- 后续生产闭环的专项实施权威为
  [`2026-08-29-babylon-native-authoring-production-closure-design.md`](./2026-08-29-babylon-native-authoring-production-closure-design.md)。
- 目标与独立交付物：创建 `@whitebox-world/native-babylon`、`defineBabylonNativeScene`、BuildContext、
  单一 Import Profile 和结构化诊断；拆分 Source/Contribution Admission、Authority Audit 与 Runtime
  Replay stage，并只引用独立 Asset Check/Admission Result。
- `depends_on`：BNA-0；与 BNA-1 只在已冻结的 Bootstrap 类型处集成。
- `blocks`：BNA-3、BNA-4、BNA-5、BNA-6。
- 独占所有权：Native Author API、Provider-specific 登记类型、示例 import 风格；不修改 RuntimeHost。
- 输入/输出合同：单 Candidate Module definition -> typed build callback、pending registrations 和闭合
  `BabylonNativeSceneCandidateAdmissionResultV1`；双 Candidate Replay -> 无 Handle Contribution/hash 与
  `NativeSceneCheckResultV1`；`worldkit native check/explain` 发布同一个 Check DTO。
- 集成点：Native Scene Builder 的 Module Resolver。
- 验证证据：public export census、API type tests、diagnostic/CLI exit tests、旧实验 App 编译迁移，以及
  bundle/module graph、Authority Audit、双 Candidate Runtime Replay 和启动成本。Import Profile 的工程
  方言由一次性 bake-off 冻结；同图同提示的模型生成/修复成功率由 BNA-6 独占，不反向成为 BNA-2 依赖。
- 执行模式：`main-agent-only`。

本任务只建立 core Native API。可选 `@whitebox-world/native-babylon-block-profile` 由 BWB-1 独占，
不得塞入 core 包形成隐式默认 DSL；BWB-1 只有在本任务 BuildContext/Import Profile 冻结后才能接入。

### BNA-3：Native Bundle、资源锁、Package 与 Receipt

- 当前状态（2026-08-30）：本地实现候选已闭合 BNA3-00..60，等待同一精确 SHA 的 Cloud 全量门禁、
  独立深审、PR 合入和 `origin/main` 祖先证明；在此之前仍视为开放。

- 目标与独立交付物：建立 Module Bundle、依赖/资产锁、Bootstrap/Contribution Hash 和正式 Package/
  Build Receipt 变体，并按第 10 节顺序在 Package Root 计算后派生、绑定 BNA-1 `WorldBuildIdentity`；
  Package/Receipt 同时绑定 `sceneAuthoringRouteDecisionHash` 与 completed
  `sceneAuthoringAttemptResultRef`/Hash；只消费 APA 已发布资源或同等手工 Golden
  Admission/Publication，不执行 Provider/Candidate promotion。
- `depends_on`：BNA-1、BNA-2。
- `blocks`：BNA-4、BNA-5、BNA-6、BNA-7、BNA-8。
- 独占所有权：Native Bundle manifest、Package manifest 变体、Receipt 和 Host Resolver；不修改 Physics，
  不拥有 source-neutral Asset Production/Admission。
- 输入/输出合同：completed Authoring Attempt Result + source module + published asset refs/receipts + locks + seed/profile
  + World Runtime Bootstrap -> immutable bundle/package/receipt/build identity。
- 集成点：WorldPackage build/load 与 RuntimeHost preflight。
- 验证证据：reproducible bytes/hash、tamper/missing asset/version mismatch、atomic promotion、clean rebuild；
  root inventory 明确排除 Identity/Receipt transport metadata、无自引用 Hash、Root 后派生 Identity 的
  byte-exact replay。
- 执行模式：`sequential`。

### BNA-4：统一 Kernel 与 Gameplay Surface Admission

- 详细实现权威：
  [BNA-4 Verified Native Runtime and Surface Admission Design](2026-08-30-bna4-runtime-surface-admission-design.md)
  与
  [BNA-4 Implementation Plan](../plans/2026-08-30-bna4-runtime-surface-admission-implementation.md)。
- 目标与独立交付物：把 Gameplay Kernel 从 Plan Scene Builder 抽离；消费当前唯一、已进入 Package
  Registry Lock 的 `TraversalSurfaceProfileV1`，冻结 Collider Contribution 及稳定
  `surfaceEntityId`/`colliderSubshapeId`/`traversalSurfaceId`，并用
  `WorldRuntimeBootstrap`、SDK Havok 和单一 Spawn/Camera/Subject 接通 Native Source；在 BNA-3 Package/
  Receipt identity 验证通过后移除 BNA-1 的 formal Native capability rejection。
- `depends_on`：BNA-1、BNA-2、BNA-3。
- `blocks`：BNA-6、BNA-7、BNA-8。
- 独占所有权：Babylon Native Scene Builder、Havok Contribution Adapter、Runtime Candidate Scene
  lifecycle 和 Debug Overlay；不得改 Authoring Attempt、Asset Production 或 Gameplay 状态权威。
- 输入/输出合同：parsed Native Source + closed traversal bindings + registrations -> admitted Scene +
  frozen collider/surface identity + SDK-owned physics/session。
- 集成点：BabylonWorldRuntime/RuntimeHost create、reset、replace 和 dispose。
- 验证证据：异形几何、unsupported spawn、ledge departure、30/60/120 Hz-like render、双实例、partial
  construction、throwing cleanup、visual/proxy drift 和 Canonical regression；forbidden API/retained
  reference、observer/listener census、Build 后 mutation、Active Camera/Physics/Render ownership audit；
  Runtime actual-vs-locked Contribution Hash exact match、登记重排同 Hash、缺失/新增 Collider、Transform/
  geometry/binding drift 和 tampered Receipt mismatch 的 fail-before-publish 负向证明。
- 执行模式：`main-agent-only`。

### BNA-5：Hosted 隔离、Tenant Hard Cap 与 Trust Profile

- 目标与独立交付物：消费 BNA-2 已冻结的 PRNG、依赖 allowlist、Source/Authority Admission、Profile
  Registry、CLI Diagnostics 与本地结构 cap；增加 Hosted Worker/Origin 强制隔离、timeout/kill、凭据与
  环境隔离、Host/tenant hard cap、`min(BNA-2 profile cap, host/tenant cap)` effective budget 计算和 Hosted
  threat model/gates，不重建 BNA-2 静态/动态检查合同。
- `depends_on`：BNA-2、BNA-3、BNA-4。
- `blocks`：Hosted Native、BNA-6、BNA-8。
- 独占所有权：Hosted Worker/Origin lifecycle、timeout/kill、凭据/环境隔离、Host/tenant entitlement 与
  effective-budget policy、Hosted threat model 和隔离诊断；Native Scene Profile Registry、Source/
  Authority Admission、CLI/安全诊断继续由 BNA-2 独占。
- 输入/输出合同：requested profile + Host/tenant allowlist/hard cap + bundle + transitive asset/resource lock
  -> allowed/rejected build、effective/actual budget 与 diagnostics。
- 集成点：Module build runner 与 RuntimeHost preflight。
- 验证证据：网络/DOM/环境/动态 import/超时/内存/节点/贴图/Collider 对抗测试和凭据泄漏 census；
  `scene.dispose/getEngine/registerBeforeRender/enablePhysics`、Observables、额外 Camera/Physics 构造的逃逸
  尝试；Hosted 进程/Worker/Origin 的强制终止和主 Runtime 无污染证明。
- 执行模式：`sequential`。

### BNA-6：AI 文档、Golden Corpus 与场景复原评估

- 目标与独立交付物：消费 BNA-2 已冻结的 `worldkit native check/explain`，提供最小 API 文档、
  Golden/negative Corpus、bounded self-repair 流程和多类参考图白膜评估；正式跑数前冻结
  `NativeSceneEvaluationProfile`、lane-specific contract context、
  Route Decision、资产生产/准入方式、预算和 Blocking Threshold，结果产生后不得修改；用非产品离线
  Three visual baseline 单独量化模型熟悉度，不创建 Three Runtime Endpoint，并覆盖拒绝后的显式回退
  与禁止静默换路。
- `depends_on`：BNA-2、BNA-3、BNA-4、BNA-5。
- `blocks`：BNA-8。
- 独占所有权：Native 评测 examples/fixtures、evaluation profile、Corpus/阈值、AI authoring guide/可选
  Skill 与视觉评估制品；CLI 与 Diagnostics 继续由 BNA-2 独占。
- 输入/输出合同：reference + route decision + bootstrap/module + admitted asset refs -> checked package +
  layered evidence。
- 集成点：CLI、Studio/Playground 和真实 Chromium Capture。
- 验证证据：正负 Golden、Canonical/Native/离线 Three 三臂冻结基准、首轮/修复成功率、结构 Gate、
  rendered visual、manual interaction。
- 执行模式：`sequential`。

BNA-6 提供 Native 通用评测框架；Block Profile 专属的山地、T 字空间、台阶、建筑、有限室内视觉及负向
Corpus 由 BWB-5 冻结。BWB 结果不能跳过 BNA 通用 Trust、Package、Kernel 或 Capability Gate。

### BNA-7：Capture 与 Route/Nav Evidence

- 目标与独立交付物：让 Native Package 进入正式 Capture；只有产品需要时，再从同一冻结 Surface 派生
  Route/Nav Evidence。本任务不交付 `goTo`、重规划或移动执行。
- `depends_on`：BNA-1、BNA-3、BNA-4。
- `blocks`：任何 Native Route/Nav Evidence 生产声明；不阻塞仅视觉/人工可玩的 Trusted Local Alpha，
  也不授权自动寻路声明。
- 独占所有权：Native Capture identity、Surface-to-Route adapter 和对应 Gate；不修改视觉 Module。
- 输入/输出合同：package/receipt + frozen surface -> capture bundle and optional trusted route report。
- 集成点：worldkit capture / verify route / Browser evidence transport。
- 验证证据：同 Surface hash、坡度/台阶/断路负向、Capture freshness、Route blocking gate。
- 执行模式：`sequential`。

### BNA-8：生产 Go/No-Go 与文档切换

- 目标与独立交付物：按 Trust Profile 分别裁决 Trusted Local、Hosted Native 和 Route 能力，更新
  AGENTS、Quickstart、Backlog、公开 API、Asset Production/Admission 指针与迁移说明；不得把 research
  reconstruction candidate 写成生产 Scene 能力。
- `depends_on`：Trusted Local 至少 BNA-1 至 BNA-6；Hosted 还必须完成 BNA-5 Hosted Gate；Route
  声明还必须完成 BNA-7。
- `blocks`：Native Lane 对外 Production 声明。
- 独占所有权：最终集成、能力状态、文档真相和发布裁决。
- 输入/输出合同：exact-tree verification evidence -> scoped GO/NO-GO disposition。
- 集成点：发布流程与当前文档入口。
- 验证证据：全量受影响 Gates、独立深审、真实浏览器、manual interaction、clean tree 和 Receipt replay。
- 执行模式：`main-agent-only`。

```text
BNA-0 -> BNA-1
BNA-0 -> BNA-2
BNA-1 + BNA-2 -> BNA-3
BNA-1 + BNA-2 + BNA-3 -> BNA-4
BNA-2 + BNA-3 + BNA-4 -> BNA-5
BNA-2 + BNA-3 + BNA-4 + BNA-5 -> BNA-6
BNA-1 + BNA-3 + BNA-4 -> BNA-7 (Route scope only)
BNA-1..BNA-6 -> BNA-8 (Trusted Local / Hosted disposition)
BNA-7 -> BNA-8 (Route scope only)
```

## 18. 分阶段验收边界

### Trusted Local Alpha 可以宣布前

- BNA-1 至 BNA-6 完成；
- 不再借用或伪造 ExecutionPlan；
- Package/Receipt/Asset Lock 和结构 Contribution 可重放；
- Subject、Havok、Input、Action、Camera、State 与 Canonical 共用同一 Kernel；
- Golden Corpus、真实 Chromium 和人工通过性闭合；
- 文档明确 Native V1 不支持 `WorldChangeSet`，也不承诺 Route、Hosted 任意代码或增量编辑。

### Hosted Native 可以宣布前

- 在 Trusted Local Alpha 基础上完成 BNA-5 Hosted Isolated 的全部威胁模型和对抗 Gate；
- 证明生成任务没有凭据、任意网络、动态依赖和跨世界写入；
- Host 能强制终止、回滚、重放并核验 Bundle/Receipt。

### Route/Nav Evidence 可以宣布前

- 完成 BNA-7；
- 导航只消费同一冻结 Traversal Surface；
- Route Blocking Gate、断路负向和运行时通过性同时通过。

产品级自动寻路不属于 BNA-7 或本设计的生产化交付。它只能在 Route/Nav Evidence 成立后，由独立设计
补齐 `goTo` Command、重规划、取消、执行状态、Event/Receipt 和产品 Gate，再单独宣布。

## 19. 最终原则

> **JSON 管世界身份、资源、Gameplay 与启动；Babylon Native Code 管视觉场景；显式登记表达物理意图；
> SDK 管 Havok、人物、动作、相机、状态、证据与生命周期。**

离线 Asset Production 只提出不可变原始 Candidate，资产类别 Owner 用 Build Record 产生目标字节，
Asset Admission 只读决定资格，资产类别 Publisher 再原子发布锁定资源；这些层都不拥有世界 Placement
或运行时真相。被选择的 Scene
Source 决定资源如何进入世界，SDK 决定哪些冻结贡献成为物理与 Gameplay。

本设计不要求为统一而把所有东西塞进 JSON，也不以自由为名把 Runtime 交给任意代码。它用
`sceneSource` 互斥消除几何双权威，用 `GameplayBootstrapV1`、Plan-independent
`WorldRuntimeBootstrapV1`、source-neutral `WorldBuildIdentityV1` 和统一 Kernel 消除两套游戏逻辑及
伪造 Plan 身份，用薄登记合同连接视觉与物理。这样既保留 AI 直接写 Babylon 的表达力，也保留 SDK
长期可验证、可升级和可维护的工程边界。
