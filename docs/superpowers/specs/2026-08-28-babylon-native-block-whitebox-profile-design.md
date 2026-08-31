# Babylon Native Block Whitebox 创作 Profile 长期设计

- 状态：Accepted authoring direction；实现与生产声明仍需通过 BNA/BWB 工作图
- 日期：2026-08-28
- 目标仓库：`agent-whitebox-world-sdk`
- 上位架构：[AI 友好的 Babylon Native 世界创作长期设计](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- 决策记录：[ADR-0007](../../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)
- 借鉴基线：[`codex/block-world-sdk-v2@618d96b`](https://github.com/seedleap/agent-whitebox-world-sdk/tree/618d96b4e297d90d13ee6d1bf9be1e0b83423dbe)
- 当前实施真相：[SDK 重构总进度与 Backlog](../../18-refactor-progress-and-backlog.md)
- Mode A 审查：[Block Whitebox Profile 设计审查](../../reviews/2026-08-28-babylon-native-block-whitebox-profile-design-review.md)
- BWB-3/4 集成施工：
  [Block Settlement 与真实台阶闭环](./2026-08-31-babylon-block-settlement-and-step-closure-design.md)

> 本文定义 Babylon Native Lane 的首个参考图白膜创作 Profile。它继承 Block World 实验中有效的
> 场景构造方法、度量体系和验收思想，但明确替换其 Three.js、持久 Block Manifest、Compiler 和旧
> Runtime 链路。本文不把尚未实现的 Profile Package、Traversal binding、室内 Route 或 Hosted
> Native 写成当前能力。

## 1. 决策摘要

采用以下长期组合：

> **JSON Control Plane + Babylon Native Block Whitebox + Frozen Contributions + SDK/Havok Gameplay Runtime**

```text
Scene Brief / small Bootstrap JSON
  world identity, Subject, Gameplay, camera, resources, profile, acceptance intent
                                |
                                v
Babylon Native Module -- optional in-memory Block Layout / small helpers
  direct Babylon Mesh, transforms, materials, lights, fog, sky
  sole visual geometry authority
                                |
                                v explicit registration
Frozen Native Contribution
  spawn + static collider with closed traversal binding
                                |
                                v admission
SDK / Host
  Havok + Character + Input + Action + Camera + Fixed Tick + State + Evidence

Profile-local authoring inventory
  visual groups + structural diagnostics -> Capture / evaluation only
```

核心名词是 **Babylon Native Block Whitebox Profile**，不是 `Block World Protocol`：

- JSON 不逐块描述几何；
- 方块代码不先转换成公开 `BlockWorldManifest`；
- 不恢复 `Block Compiler -> AuthoringSpec -> ExecutionPlan`；
- Profile 不增加第三个 `sceneSource.kind`；
- Babylon Module 及其冻结后的 Contribution 才是最终场景制品权威。

旧 Block World 代码只作为固定提交中的迁移来源，不作为依赖或兼容层。可复用的纯算法实现和测试在新
Package Owner 下直接迁移并更换类型边界；旧 Package、旧导出、旧 DTO、Manifest、Compiler、Runtime
分支和 re-export 在最终接受树中全部不存在。实现过程中不得通过 alias 或双 API 让新 Profile 同时支持
旧 Block World 与新 Native 方言。

允许生成期存在临时 Scene Brief、关系图、布局草图和 package-local 的内存 Block Layout。禁止的是把这些
中间结构升级为可持久化的第二套场景协议、Runtime 输入或跨 Lane 几何真相。

## 2. 为什么这个平衡点成立

### 2.1 Block World 实验真正证明了什么

固定基线 [`618d96b`](https://github.com/seedleap/agent-whitebox-world-sdk/tree/618d96b4e297d90d13ee6d1bf9be1e0b83423dbe)
证明了以下创作方法对参考图白膜有价值：

- 用真实米制体积构造山体、峡谷、台阶、平台、建筑和室内，而不是只做朝向相机的薄立面；
- 使用少量固定尺寸的方块形成稳定尺度，同时用不同尺寸表达主体质量、过渡和暴露细节；
- 先推理 footprint、纵剖面和横剖面，再填充体积；
- 用稳定语义调色板和视觉分组帮助 AI、截图审查和后续世界模型理解；
- 同时检查结构、渲染和人物通过性，而不是把“画面能显示”当作完成；
- 对大量重复块做确定性分组、实例化、Chunk 和简化碰撞代理。

它没有证明以下旧工程链路应被保留：

```text
Three Scene
  -> BlockWorldManifest
  -> Block Compiler
  -> AuthoringSpec / ExecutionPlan
  -> Babylon / Havok
```

该链路横跨两个渲染引擎并重复表达场景几何，恰好是 Native Lane 要消除的绕行。

### 2.2 外部证据支持的是组合原则，不是本项目全部协议

| 来源 | 可借鉴结论 | 不可外推 |
|---|---|---|
| [SceneCraft（ICML 2024）](https://proceedings.mlr.press/v235/hu24g.html) | 先规划关系，再生成可执行 Blender Code，并用渲染反馈修复；支持“规划结构 + Native Code + 小型复用库” | 未验证 Havok、Character、固定 Tick 或任意 Native Code 安全 |
| [WorldGen（CVPR 2026）](https://openaccess.thecvf.com/content/CVPR2026/html/Wang_WorldGen_From_Text_to_Traversable_and_Interactive_3D_Worlds_CVPR_2026_paper.html) | 先建立功能正确的 Blockout 与可导航结构，再进行视觉生成；白膜是尺度与通过性的结构基础 | 未证明视觉 Mesh 自动等于理想 Collider，也未定义 Babylon/JSON 边界 |
| [ImperativeScene（SIGGRAPH Asia 2025）](https://arxiv.org/abs/2510.16147) | 命令式程序适合表达和修正复杂空间布局 | 不引入它的场景 DSL、Optimizer 或第二语言 |
| [Holodeck（CVPR 2024）](https://openaccess.thecvf.com/content/CVPR2024/html/Yang_Holodeck_Language_Guided_Generation_of_3D_Embodied_AI_Environments_CVPR_2024_paper.html) | 视觉资产、空间约束和简化碰撞网格分层；可信系统负责布局与准入 | 跨资产/跨引擎转换有价值，不代表同一 Babylon 内还需要视觉 Compiler |
| [SAGE（CVPR 2026）](https://openaccess.thecvf.com/content/CVPR2026/html/Xia_SAGE_Scalable_Agentic_3D_Scene_Generation_for_Embodied_AI_CVPR_2026_paper.html) | Visual Critic 与 Physics Critic 分开，Simulator-in-the-loop 后再修复 | 静态物体稳定不等于角色台阶、坡度、相机和固定 Tick 正确 |
| [PhyScene（CVPR 2024）](https://openaccess.thecvf.com/content/CVPR2024/html/Yang_PhyScene_Physically_Interactable_3D_Scene_Synthesis_for_Embodied_AI_CVPR_2024_paper.html) | 碰撞、边界和 Agent Reachability 是独立约束 | 室内布局约束不定义本项目 Gameplay Runtime |
| [OpenUSD Physics](https://openusd.org/release/api/usd_physics_page_front.html) | 视觉 Mesh 与不渲染的 sibling Collider Mesh 可以独立存在 | 不引入 USD 作为新的中间场景协议 |
| [ProcTHOR](https://proceedings.neurips.cc/paper_files/paper/2022/hash/27c546ab1e4f1d7d638e6a8dfbad9a07-Abstract-Conference.html) | 完整 JSON 对封闭领域数据集、缓存、重放和自动测试有价值；Runtime 仍需真实 Spawn/Reachability 检查 | 数千行房屋 JSON 不证明开放式峡谷、山峰和任意建筑适合逐几何体 JSON 创作 |

没有单一论文完整证明本设计。这里采用的是多个成熟结论的工程组合，并把未被论文证明的安全、物理、
生命周期和通过性部分留给本项目 Gate。

## 3. 三类结构化信息与唯一场景权威

为了避免“JSON 或代码只能二选一”的假问题，本设计区分三类生命周期：

1. **Durable Bootstrap JSON**：世界、Subject、Gameplay、Camera、资源和 Profile 的稳定控制面；进入
   Package/Hash/Receipt。
2. **Ephemeral Planning Structure**：Scene Brief、关系图、布局图、Block Layout；只服务本次生成、检查和
   修复，除非某项被另一份正式合同明确纳入 Receipt，否则不是 Runtime 输入。
3. **Durable Native Scene Module**：可执行 Babylon TypeScript，是 Native Lane 唯一视觉几何源；其显式
   登记经 Host 冻结后形成 Runtime 可消费的 Contribution。

因此可以保留 JSON 的规划和自动化价值，也不会形成 `JSON geometry + Native overlay`：规划数据不给
Runtime 造 Mesh，Native Module 不读取另一套持久几何 Manifest。

## 4. JSON Control Plane 的职责

Native Bootstrap 继续由上位设计拥有。本 Profile 只建议增加一个稳定选择：

```ts
interface BabylonNativeBlockProfileSelectionV1 {
  readonly nativeSceneProfileRef:
    "worldkit://native-scene-profile/whitebox.blocks@1";
}
```

`nativeSceneProfileRef` 选择 Import、预算、检查和证据 Profile，不包含逐块几何，也不决定 Runtime
Physics Material。JSON 继续负责：

- 世界、Package、Scene Source 与版本身份；
- Controlled Subject、动作、输入、相机 Profile、Spawn binding；
- Registry Resource Ref、依赖/资产锁、Seed 和 Trust Profile；
- Gameplay Rule、状态、事件订阅与能力声明；
- Host 授权预算、验收目标和 Evidence Profile。

JSON 不负责：

- 每个方块、山体、台阶、墙体或房间的坐标；
- Babylon Mesh、TransformNode、Material、Light、Fog、Sky 或 Particle；
- Collider 自动猜测、Havok Shape、CharacterController 或主相机实例；
- 生成期 Block Layout 的序列化和 Runtime replay。

## 5. Babylon Native Block Profile 的包边界

### 5.1 两层 Provider-specific Package

- `@whitebox-world/native-babylon`：上位 Native Authoring 与 Registration 边界；BNA-2 独占。
- `@whitebox-world/native-babylon-block-profile`：可选白膜创作 Profile；BWB 工作图独占。

Block Profile 可以提供：

- 固定方块形状、米制网格和语义调色板常量；
- 单块创建/登记、重复块实例化和稳定 ID 的小型 Helper；
- 返回真实 Babylon `Mesh`/`TransformNode` 的直接 API；
- package-local、in-memory 的 Occupancy/Block Layout；
- 连续坡面、边界、Chunk 和 Authoring QA 所需的确定性算法；
- 结构报告、Profile-local Visual Group inventory，以及 core Registration 已冻结的 Spawn/Static Collider
  （含关闭 `traversalBinding`）构造辅助。

Block Profile 不得：

- 创建 `Engine`、`Scene`、Render Loop、Havok、Camera、Subject、Input、Timer 或独立 Tick；
- 输出可持久化 `BlockWorldManifest` 或另一种 WorldPackage；
- 编译 AuthoringSpec、Normalized IR 或 ExecutionPlan；
- 从颜色、材质、名称、父子层级或未经登记的 Mesh 扫描推断 Gameplay Physics；
- 暴露 `createMountain`、`createBuilding`、`createLevel` 等不断扩张的公共语义世界 DSL；
- 让内部 Layout 成为 Gameplay Ground Support、Route 或 Snapshot 的第二状态权威。

普通模块始终可以直接使用 `MeshBuilder` 和其他 Babylon API。Profile Helper 是高频白膜机械操作的薄层，
不是使用 Native Lane 的强制入口。每个 Helper 返回真实 Babylon 对象，后续 Transform、材质和层级仍使用
Babylon 原生类型与语义。

### 5.2 允许的内存布局

禁止持久 Manifest 不等于禁止算法内部数据。为了复用 Occupancy、坡面、边界和 Chunk 算法，Profile
可以在一次 Build Epoch 内维护关闭的内存布局，但必须满足：

- 只从本 Epoch 的显式 Profile 调用产生；
- 不从整个 Babylon Scene 反向扫描；
- 不作为 Package 中的第二份视觉几何；
- Finalize 后只输出结构诊断、Profile-local Visual Group inventory 和 core Registration 已允许的显式
  Contribution；
- Build 完成即冻结并释放，Runtime 不查询它来决定支撑或运动；
- 同一输入、Seed、Profile 和依赖锁产生同一规范顺序与同一 Contribution Hash。

## 6. 度量、形状与网格

首版 `whitebox.blocks@1` 继承实验中验证最有效的严格 Profile：

| shape | `sizeMetersXYZ` | 主要用途 |
|---|---:|---|
| `full` | `[1, 1, 1]` | 大体量、承重核心、基础地形质量 |
| `half` | `[1, 0.5, 1]` | 半米高度体量、低台和阻断体 |
| `quarter` | `[0.5, 0.5, 1]` | 窄边、长向细节、轮廓修正 |
| `small` | `[0.5, 0.5, 0.5]` | 暴露角点、小尺度剪影和局部修补 |
| `step` | `[1, 0.25, 1]` | 真实四分之一米踏步和连续台阶踏面 |

- 世界单位为米，`+Y` 向上，Subject forward 为 `-Z`；
- Occupancy Grid 为 `[0.5, 0.25, 0.5]m XYZ`，Block center lattice 为
  `[0.25, 0.125, 0.25]m XYZ`；
- Profile Block 只允许 Y 轴四分之一圈旋转；
- `full` 用于表达主体质量，`step` 用于真实台阶，`half` 用于半米体量，`quarter/small` 只用于
  可见轮廓和必要细节；
- 不规则细节可使用普通 Babylon Mesh，但不自动进入 Block Occupancy 或 Collider。

这些是 `whitebox.blocks@1` 的创作规则，不是整个 Native Lane 的全局形状限制。未来其他 Native Profile
可以使用程序化 Mesh、GLB 或不同格网，但不得静默改变本 Profile 的版本化语义。

## 7. 场景构造原则

### 7.1 先拓扑、再体积、最后细节

每个参考图场景先明确：

1. Spawn、主要目的地、关键高度层和可玩边界；
2. 地表 footprint、主要路线和阻断区；
3. 沿主要路线的纵剖面；
4. 山体、峡谷、建筑和平台的横剖面；
5. 前景、中景、远景的结构层次和开场构图；
6. 最后才增加暴露轮廓、装饰和大气。

Opening Shot 是一个验收视角，不是隐藏几何的唯一真相。单图未展示区域应形成有意义、连贯的世界延续，
不能用固定倍数扩大地图、空白填充或隐藏平面冒充完整世界。

### 7.2 真实体积，不做相机立面

- 山峰包含基座、主体、山脊、顶面与落脚关系；
- 悬崖包含 rim、face、base 和背后的质量，不是单层竖墙；
- 峡谷包含 floor、两侧坡面和入口/出口；
- 建筑包含外轮廓、楼板/支撑和真实可进入空间；
- 台阶连接两个真实标高，具有踏面、踢面、平台和承托质量；
- T 字、L 字、环形等空间关系必须在俯视图中成立，不只在开场截图中看起来成立。

### 7.3 方块与连续表面分工

方块视觉可以保留离散白膜语言；人物主路线不应被无意义的微台阶破坏。Profile 可以从同一内存布局构造
更简化、连续的 Collider proxy，但必须：

- proxy 必须 materialize 为 core Registration 当前接受的实际 Babylon `Mesh`；若未来要接受关闭
  Primitive 集合，必须先由 BNA core 新版本冻结，Profile 不得自行扩张；
- 通过 Native Registration 显式提交；
- Host 冻结后由 SDK 创建 Havok；
- Capture、Collider Debug 和通过性证据绑定同一 Contribution Hash；
- Runtime `checkSupport()` 只查询 Havok 结果，不查询 Block Layout 或隐藏 Height Sampler。

## 8. 语义调色板、视觉分组与可理解性

Profile 使用固定、低歧义的白膜调色板表达规划和 Capture 语义，例如 ground、route、structure、hazard、
water-like visual、background mass。颜色帮助人和 AI 阅读场景，但不是 Runtime Physics 或 Gameplay 标签。

每个完整目标在 Profile-local authoring inventory 中使用稳定 `visualGroupId`：

- 同一完整山门、桥、建筑或山峰作为一个组；
- 重复实例可共享 Group definition，但 Instance ID 必须稳定；
- Visual Group 用于 Capture、预算、诊断和对照，不替代 Gameplay Entity，也不是 Native V1
  Contribution；
- Runtime 不按颜色或 Group 自动创建 Collider。

Display 可以使用轻微 cube gap、柔和材质和方向光增强体块可读性，但 gap 只属于视觉。物理代理必须由
Profile/Module 显式决定，不能让显示缝隙制造角色卡顿。

## 9. Collision、Traversal 与 SDK Authority

### 9.1 同源派生，显式登记

推荐从同一内存布局派生视觉块与简化 Collider proxy，以减少坡面和边界漂移；但二者身份不同：

- `Mesh` 是视觉对象；
- `StaticColliderContribution` 是物理意图；可走表面只能使用 BNA core 在同一登记上冻结的关闭
  `traversalBinding`，不是另一个 `TraversalSurfaceContribution`；
- SDK Admission 与 Havok 实例才是运行时物理真相。

“同源派生”不能变成“扫描全部视觉 Mesh 自动生成碰撞”。未登记对象默认纯视觉；Profile Checker 可以对
Profile 创建的块提出 authoring warning，但不能替 Runtime 决定碰撞。

### 9.2 边界与地表

- 地面、悬崖边界和安全阻挡只能从显式登记且 Profile 锁定的 Traversal Surface 派生；
- 不允许用隐藏的无限平面或大面积基础板让角色看似可走；
- Collider 合并不能越过不同 Surface Profile、语义边界或稳定 Subshape identity；
- Chunk/Thin Instance/合并只是 Host/Adapter 内部优化，不能进入 AI-facing Schema；
- Visual 和 Collider drift 必须在 publish 前 fail closed。

### 9.3 证据分层

Native Block 场景至少分开报告：

1. `structural-check`：网格、重叠、预算、连通候选、视觉组和显式登记完整性；
2. `rendered-visual`：Opening Frame、top-down、关键侧视和参考图语义区域；
3. `collider-debug`：冻结 Collider/Surface overlay 与 Hash；
4. `runtime-passability`：Spawn Support、角色尺寸通道、台阶/坡度、ledge departure、关键探针；
5. `route-evidence`：只有 BNA-7 支持并通过后才能产生；
6. `manual-interaction`：真实人物移动、跳跃、相机和 Reset。

前四层或人工体验通过都不能自动升级为产品级自动寻路声明。

## 10. Gameplay、人物、相机与未来事件

人物、动作、相机和状态继续使用 JSON/Registry 与当前 3C Kernel。不可被 Profile 替换的当前 Owner
至少包括 `CharacterMovementRuntimeV1`、`CharacterBodyPortV1`、committed
`LocomotionCapabilityStateV2`、Action Presentation、`CameraContextSampleV2`/`CameraDirectorV1` 和单一
`checkSupport()` 路径。Native Block Module 不移植旧分支的 Motion Runtime、Preset 参数、相机控制、
profile-specific body/movement adapter 或 `primary-action -> resetAt()` 旁路。

未来“走到某处出现人物/事件/变化”采用单向链路：

```text
Native registration: semantic volume/anchor geometry + stable entity identity
  -> frozen Contribution
  -> SDK committed Character movement
  -> trusted semantic fact projector: inside-volume started/ended
  -> JSON Gameplay Rule
  -> next fixed Tick Action / trusted Effect Transaction
```

Native Module 不持有区域回调、不监听每帧位置、不直接 Spawn Gameplay Entity、不修改人物/相机，也不创建
Timer。Semantic Volume/Anchor 属于 Native Contribution 的未来版本，必须另立合同与 Gate；不塞进
BWB 首个视觉/静态碰撞切片。

## 11. 对旧分支 Package 的处置

| 旧 Package/能力 | 裁决 | 新落点 |
|---|---|---|
| `packages/block-world-three` | 不迁移 | Native Module 直接使用 Babylon；不保留 Three binding/extraction |
| `packages/block-world-compiler` | 不迁移 | 不再编译 AuthoringSpec/ExecutionPlan |
| `packages/block-world` 持久 Manifest/Presets | 不迁移 | 不建立第三个 Scene Source 或公开逐块 JSON |
| shapes/grid/palette | 直接迁移纯算法实现并更换类型边界 | `@whitebox-world/native-babylon-block-profile`；不依赖旧 Package |
| occupancy/layout/checker | 测试先行后迁移可复用算法 | package-local in-memory layout + authoring diagnostics；不迁移旧 DTO |
| smooth surface / cliff boundary | 条件保留 | 只产出显式登记并冻结的 Static Collider Mesh；Traversal 使用同一登记的关闭 binding |
| clustering/chunking/thin instances | 条件保留 | Host/Adapter 内部优化，先正确后性能 |
| old movement/preset/transition runtime | 不迁移 | 当前 SDK 3C、Action、Camera、State 和 `checkSupport()` |

明确拒绝旧分支中的隐藏 `64m` foundation、按块数自动抬高预算、未消费 Preset 字段、材质决定物理、第二
Ground Height Sampler、固定“世界必须大于参考可见面积若干倍”等做法。地图完整性由有意义的可玩延续和
冻结 Evidence 判定，不由面积常数替代。

## 12. Capability 边界

| 能力 | 本 Profile 目标 | 当前声明 |
|---|---|---|
| 山峰、峡谷、悬崖、台阶、平台、建筑白膜 | Native Block + Babylon Mesh | 设计已接受，尚未生产化 |
| Static Collider 与人物通过性 | 显式 Contribution + SDK Havok | 依赖 BNA-4/BWB-4 |
| Formal Native WorldPackage/Browser Capture | 不由 Profile-local screenshots 替代 | 依赖 BNA-7 |
| 室内视觉白膜 | 可以建模 | 不等于正式室内能力 |
| 多层室内 Route、桥下穿越、洞穴 | 不在首版 | Capability gap |
| 自动寻路 `goTo` | 不在本设计 | 需要 BNA-7 后独立设计 |
| 动态刚体、移动平台、车辆 | 不在首版 | Capability gap |
| Semantic Volume 事件 | 未来 Contribution + Gameplay Rule | 尚未设计/实现 |
| Hosted 任意 Native Code | 不在 Trusted Local Alpha | 依赖 BNA-5 Hosted Gate |

室内画面和手工碰撞探针成功，只能证明视觉/局部交互实验。多层 Surface、相机遮挡、可见性、Streaming、
Navigation 和室内 Gameplay Gate 完成前，不得宣称正式室内支持。

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Helper 逐渐变成第二套 DSL | 只提供方块机械操作；高层场景语义留在 Module 普通代码；API 扩张需新 Profile 版本与审查 |
| 内存 Layout 变成第二状态真相 | Build-only、Finalize 冻结、Runtime 不可查询；Contribution/Havok 是唯一物理真相 |
| 视觉块与平滑 Collider 分叉 | 同源派生、稳定 ID、overlay、Hash 和 visual/proxy drift Gate |
| 方块数量造成性能问题 | 先按语义边界正确，再做 Chunk/Thin Instance/Collider coalescing；优化不改变公开合同 |
| AI 只优化 Opening Shot | 强制 top-down、侧视、世界继续区域和真实人物通过性证据 |
| Profile 被误称室内/Route/自动寻路能力 | Capability 分层声明，缺少对应 Gate 时 fail closed |
| Native 自由度旁路 Runtime | BNA Authority Audit、禁止 API、Bundle 审计和 Candidate 原子销毁 |

## 14. BWB 依赖工作图

### BWB-0：冻结 Profile 权威与证据

- 目标与独立交付物：交付本文、ADR/Backlog/引用台账指针和旧分支固定 commit 裁决。
- `depends_on`：BNA-0、`codex/block-world-sdk-v2@618d96b` 和本轮外部研究。
- `blocks`：BWB-1 至 BWB-6。
- 独占所有权：Block Profile 术语、构造原则、旧 Package 处置和 Capability 声明。
- 输入/输出合同：实验源码 + 外部证据 + Native 上位设计 -> Accepted Profile 设计。
- 集成点：文档，不修改 Runtime。
- 验证证据：D1/D2/D3/D6、占位符/冲突/链接/diff 检查。
- 执行模式：`main-agent-only`。

### BWB-1：冻结 Block Profile API 与 Package

- 目标与独立交付物：创建 `@whitebox-world/native-babylon-block-profile`，冻结 shape/grid/palette、单块
  Helper、内存 Layout 生命周期、稳定 ID 和 diagnostics；所有创建 API 返回真实 Babylon 类型。
- `depends_on`：BWB-0、BNA-2 的核心 BuildContext/Import Profile 已冻结。
- `blocks`：BWB-2、BWB-3、BWB-4。
- 独占所有权：Block Profile 公共 API 和 package exports；不修改 core Native Registration 或 Runtime。
- 输入/输出合同：Native BuildContext + deterministic seed -> build-epoch-local Profile session。
- 集成点：`defineBabylonNativeScene` build callback。
- 验证证据：API type tests、export census、Babylon version lock、deterministic ID/order、forbidden durable
  manifest test。
- 执行模式：`main-agent-only`。

### BWB-2：移植结构算法与 Checker

- 目标与独立交付物：重写四形状、Occupancy、lattice、重叠、坡面输入、边界、Visual Group 和预算检查；
  不复制旧 DTO/Presets/Compiler。
- `depends_on`：BWB-1。
- `blocks`：BWB-3、BWB-4、BWB-5。
- 独占所有权：Profile 内存 Layout、结构算法、authoring diagnostics 和 focused fixtures。
- 输入/输出合同：explicit Profile calls -> canonical in-memory layout + structural check result。
- 集成点：Profile Finalize 与 Native `check/explain`。
- 验证证据：非对称体、旋转、重叠、断路、悬空块、确定性排序、预算 hard cap、旧分支等价与拒绝矩阵。
- 执行模式：`sequential`。

### BWB-3：Babylon 视觉与多视角 Capture

- 目标与独立交付物：实现直接 Babylon Mesh、稳定材质/视觉组和 display gap 的非优化正确性基线，并
  生成 Opening/top-down/侧视的 Build-Epoch-local authoring screenshots；不创建 Camera owner，不发布
  formal WorldPackage/Browser Capture identity。Thin Instance eligibility 只由 BWB-6 后续评估。
- `depends_on`：BWB-1、BWB-2、BNA-3 Package/Receipt identity。
- `blocks`：BWB-5、BWB-6。
- 独占所有权：Profile visual adapter、authoring screenshot grouping 和视觉 fixtures；不修改 Gameplay
  Camera 或 BNA-7 formal Capture。
- 输入/输出合同：checked layout + Babylon Candidate Scene -> visual nodes + visual group inventory。
- 集成点：Native Candidate build 与 pre-publication authoring screenshot harness。
- 验证证据：Transform/材质/组 identity、双实例、dispose、Opening/top-down/侧视 golden、参考语义区域。
- 执行模式：`sequential`。

BWB-3 的独立 authoring screenshot 证据不能与 BWB-4 独立 Collider 证据直接相加。二者必须按
[Block Settlement 与真实台阶闭环](./2026-08-31-babylon-block-settlement-and-step-closure-design.md)
通过一个 Checked Layout、一个 Finalize、一个 Host settlement 和一个 Contribution/Package 后才可标记完成。

### BWB-4：Collider 与关闭 Traversal Binding 同源派生、SDK Admission

- 目标与独立交付物：从同一内存 Layout 构造显式 Collider proxy；只在 BNA-4 Profile-based Registration
  上通过 `registerStaticCollider` 登记，SDK 冻结并创建 Havok；可走性只使用该登记中 BNA 已冻结的关闭
  `traversalBinding`，不新增独立 Traversal Contribution。
- `depends_on`：BWB-2、BNA-4。
- `blocks`：BWB-5、BWB-6 和任何 Block Profile passability 声明。
- 独占所有权：Profile layout-to-core-Contribution candidate builder、visual/proxy identity metadata 和
  overlay input metadata；不拥有 BNA-4 Runtime Debug Overlay、Registration 类型、Havok Adapter、
  `CharacterMovementRuntimeV1`、`CharacterBodyPortV1`、`checkSupport()`、Character 或 Physics Tick。
- 输入/输出合同：checked in-memory layout + explicit surface selections -> core
  `StaticColliderContribution` candidates with closed traversal bindings -> SDK-admitted Havok shapes。
- 集成点：Native Contribution Admission 与 Babylon/Havok Candidate publish。
- 验证证据：Spawn Support、真实 Havok 台阶/坡度/ledge、异形 Collider、drift/tamper、30/60/120 Hz-like、
  Reset、双实例、throwing cleanup。
- 执行模式：`main-agent-only`。

BWB-4 的真实 Havok narrow fixture 只有迁移到同一 Block Session/Finalize，且 source visual、独立 no-gap
proxy、Scene membership 与 Contribution Hash 全部 settlement 后，才构成正式 Profile passability 证据。

### BWB-5：参考图 Corpus 与分层验收

- 目标与独立交付物：冻结关闭的 Block Reconstruction Corpus。每个 Case 使用稳定 ID、确定性 seed 和
  同一 finalized Layout，同时产生 Babylon Native block visual、Opening/top-down/side
  `BabylonNativeBlockAuthoringCaptureV1`（`scope = build-epoch-local`）、Static Collider
  Contribution、关闭 `traversalBinding`、BNA-4 Collider overlay、Spawn Support 与真实人物 Havok
  通过性。负向 Case fail-closed。可执行工作图见
  [BWB-5 implementation plan](../plans/2026-08-31-bwb5-block-reconstruction-corpus-implementation.md)。
- `depends_on`：BWB-2、BWB-3、BWB-4、BNA-5。BNA-6 AI 生成/修复评测、WRC-SR-1 scorecard 和 BNA-7
  formal Capture/Route 仍独立；本任务不得实现或伪称它们。
- `blocks`：BWB-6 优化基准。不阻塞 WRC-1 其他泳道。
- 独占所有权：`packages/native-babylon-block-profile/src/reconstruction-corpus.ts`、testing Module
  factory、`scripts/verification/bwb5-block-reconstruction-corpus.test.ts` 和 corpus evidence index。
  不拥有 BNA-7 Capture/Route identity、Runtime/Havok/Camera/Input/Tick、Surface Identity 或新
  Validation DTO。
- 输入/输出合同：closed case ID + seed + Host Candidate context -> one Session/Layout/Finalize
  chain -> existing check/capture/contribution types + corpus evidence index。
- 集成点：现有 Block Session、BWB-3 authoring capture、BNA-4 admission/overlay、BWB-4 Package/Havok
  fixture。不创建第三条 Scene Source。
- 关闭 Case ID（current-only，禁止别名）：
  - 正向：`mountain-cliff`、`t-shaped-traversal`、`ordinary-and-blocked-steps`、
    `building-exterior`、`limited-interior`
  - 负向：`overlap-occupancy`、`out-of-budget`、`invalid-traversal-binding`、
    `unsupported-spawn`、`disconnected-route`、`cleanup-throw-partial`
- 验证证据：0.25m step 可通过、0.5m blocker 不可通过、ledge departure/support、mountain/T/building/
  limited-interior 预期通路与阻挡、reset、dispose/cleanup、30/60/120-like cadence 下固定 Tick hash
  一致、同一 Subject 跨 Session rebind 前释放 Scene/Engine/Collider Mesh。跨实体与
  Subject/Listener/Camera/Input owner 专项残留检查仍是接受债务，不由本切片伪称。有限室内只证
  白模视觉、单层静态支撑和人物通过性。
- 明确非宣称：完整 Room/Visibility、多层 Navigation、洞穴、桥下双层、NPC Nav、`goTo`、formal
  Capture/Route、BNA-6 成功率、Thin Instance/Chunk/Collider coalescing。
- 执行模式：Corpus 合同 `sequential`；Havok/cadence/rebind/review `main-agent-only`。

### BWB-6：Chunk、实例化与 Collider 优化提案

- 目标与独立交付物：在 BWB-5 正确性基线后评估 Thin Instances、语义 Chunk、Collider coalescing 和
  residency，交付 Profile-side eligibility/grouping inventory、等价性 fixtures、benchmark 和 BNA-4
  Runtime Adapter 优化提案；本任务不直接修改 Runtime/Havok。
- `depends_on`：BWB-3、BWB-4、BWB-5。
- `blocks`：当前工作图无；任何 Runtime 优化实施或大场景性能声明必须在本提案后另立稳定 ID、BNA-owned
  计划和 Runtime Gate，不阻塞小型 correctness Alpha。
- 独占所有权：Profile-side eligibility/grouping inventory、benchmark 和 equivalence fixtures；BNA-4
  继续独占 Runtime batching/coalescing、Havok shape creation、Debug Overlay 与 disposal。
- 输入/输出合同：same checked layout/contribution -> optimization proposal + equivalence fixtures + measured
  resource envelope。
- 集成点：BNA-4 后续优化计划的只读输入，不直接接入 Runtime publish。
- 验证证据：visual/collider identity equivalence、frustum/Chunk 边界、CPU/GPU/memory/collider baseline 和
  候选 A/B；生产资源释放与 Havok 等价性由后续 BNA-4-owned 实施重新验证。
- 执行模式：`sequential`。

```text
BWB-0 + BNA-2 -> BWB-1
BWB-1 -> BWB-2
BWB-1 + BWB-2 + BNA-3 -> BWB-3
BWB-2 + BNA-4 -> BWB-4
BWB-2 + BWB-3 + BWB-4 + BNA-5 -> BWB-5
BWB-3 + BWB-4 + BWB-5 -> BWB-6
```

## 15. 验收边界

Block Profile Trusted Local Alpha 可以宣布前：

- BNA-1 至 BNA-6 与 BWB-1 至 BWB-5 按其实际范围完成；
- 不存在 `block-world-three`、持久 `BlockWorldManifest` 或 Block Compiler Runtime 依赖；
- Babylon Module 是唯一视觉源，冻结 Contribution/Havok 是唯一物理源；
- 同一布局的视觉、Collider overlay、Spawn Support 和人物通过性 Evidence 可重放；
- 五类 Corpus 的结构与视觉 Gate 通过，负向 Corpus 能 fail closed；
- 室内、Route、自动寻路、Hosted 和增量编辑只按各自已完成 Gate 声明。

## 16. 最终原则

> **继承方块分支的场景构造智慧，不继承它的跨引擎 Compiler；允许临时规划结构，不建立第二个持久场景
> 协议；让 Babylon 负责白膜表达，让 SDK/Havok 负责可信世界。**
