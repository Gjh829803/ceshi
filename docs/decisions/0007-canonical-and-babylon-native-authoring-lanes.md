# ADR-0007：Canonical 与 Babylon Native 场景创作双 Lane

- 状态：Accepted（架构方向已接受；Native 生产化仍按 Backlog 独立验收）
- 日期：2026-08-28
- 详细设计：[AI 友好的 Babylon Native 世界创作长期设计](../superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- 首个创作 Profile：[Babylon Native Block Whitebox 创作 Profile 长期设计](../superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)
- 资产供应链：[Source-neutral 资产生产与准入长期设计](../superpowers/specs/2026-08-28-source-neutral-asset-production-and-admission-design.md)
- 实验依据：[Babylon Native Scene Lane 实验设计](../superpowers/specs/2026-08-27-babylon-native-scene-lane-design.md)

## 背景

ADR-0006 选择 AuthoringSpec JSON -> Compiler -> Babylon/Havok 作为正式架构。该链路已经证明其在
Schema 校验、确定性编译、资源锁、WorldPackage、Route、ChangeSet 和自动化方面的价值；但参考图中的
独特山峰、峡谷、悬崖、复杂阶梯、建筑剪影、灯光和大气效果需要不断扩张自有 Schema、IR 和 Adapter，
视觉表达仍明显弱于 AI 直接使用 Babylon。

2026-08-27 的隔离实验验证了另一种分工：Babylon Native Code 可以更直接地还原白膜场景，SDK 仍可
通过显式登记接管 Havok、人物、移动和相机。现在需要把实验结论变成不会形成双权威的长期架构。

## 决策

1. 项目长期保留两条场景创作 Lane：
   - Canonical Lane 使用 AuthoringSpec JSON 和现有 Compiler；
   - Babylon Native Scene Lane 使用小型 Bootstrap JSON 和 Babylon Native TypeScript。
2. 每个世界必须选择且只选择一个 `sceneSource.kind`。V1 不支持 Canonical 几何与 Native 几何的实时
   overlay，避免视觉、碰撞、Spawn 和 Route 双权威。
3. Native 视觉不经过 Authoring Normalizer、World Compiler 或 Babylon-like 内部场景协议。普通
   TypeScript Bundle、Schema/资源校验和登记 Admission 不得被包装成第二套视觉 Compiler。
4. 两条 Lane 复用同一个 `GameplayBootstrapV1`、Plan-independent `WorldRuntimeBootstrapV1`、
   source-neutral `WorldBuildIdentityV1`、RuntimeHost、WorldSession、Babylon/Havok Kernel、Subject、
   Input、Action、Camera、State、Capture 和生命周期。
5. Native Module 可以用 Babylon API 创建视觉 Mesh、Transform、Material、Light、Fog、Sky、Particle
   和 Scene-level visual effects，但不得创建 Engine、Scene、Render Loop、Physics Body、主相机、
   Gameplay Entity、输入或独立 Tick。
6. Native Code 必须显式登记 Spawn 与 Static Collider 意图。SDK 校验并冻结世界坐标几何，创建和拥有
   Havok；未登记 Mesh 默认纯视觉，SDK 不扫描 Scene 猜碰撞或可走性。
7. Subject 与 Gameplay Entity 的身份、能力、动作和状态继续由 JSON/Registry/Gameplay 合同定义。
   Native Module 只提供视觉世界，以及薄合同允许的静态地表碰撞意图和本地 Spawn 登记；最终物理与
   Gameplay 所有权仍属于 SDK/Havok。
8. Native Lane 的长期公共入口为独立的 `@whitebox-world/native-babylon` 与
   `defineBabylonNativeScene`。Babylon 原生 API 不被项目重新包装成 Scene DSL。
9. Native 生产制品必须锁定 Bootstrap、Module Bundle、API/Profile、依赖、资产、Gameplay Bootstrap、
   World Runtime Bootstrap、World Build Identity 和冻结 Contribution Hash，并产生正式 Package/Build
   Receipt；不得保留不被消费的影子 ExecutionPlan 或伪造 `executionPlanHash`。
10. Trusted Local 与 Hosted Isolated 分开验收。当前完整 Babylon Scene 访问只证明受信本地实验，
    不证明远程任意代码安全。
11. 不增加 Three.js Native Runtime Endpoint。Three.js 可用于离线生成并经 Admission 的 GLB，但在线
    Scene、Physics、Camera 和 Lifecycle 继续统一到 Babylon/Havok。
12. Skill 可以辅助 AI 拆场景和修复错误，但 Schema、类型、Profile、Golden 和诊断是正确性权威；
    API 不依赖某个隐藏 Skill 才能正确使用。
13. 生成模型、素材库、DCC、Three.js 或场景重建工具属于两条 Lane 之前的 source-neutral 离线资产
    生产阶段。其原始输出首先是不可信、不可变 Candidate；需要修整时必须由资产类别 Owner 产生新的
    Build Record/字节，Asset Admission 只读验收，资产类别 Publisher 再原子发布并生成 Publication
    Receipt。只有发布为内容寻址 `...Ref` 并进入 Asset Lock 后，
    才可由当前被选择的 Scene Source 引用和放置；该阶段不增加
    `sceneSource.kind`，不拥有世界 Placement，也不产生 Spawn、Collider、Route、Camera 或 Gameplay。
14. 单资产生产可以独立发生；Host 必须在生成 Scene Module、组装完整 Scene Authoring Attempt 或采用
    某个已发布资产前冻结 `SceneAuthoringRouteDecisionV1`。切换
    Canonical/Native、ground-first/locked-asset composition、Source、Asset、Seed 或 Profile 必须创建新的
    `SceneAuthoringAttemptV1` 并重放受影响的场景 Gate；不得在同一 Attempt 内静默换 Lane、追加发布后
    Dressing Overlay，或复用旧 Source/Package/Contribution/Collider/Route 证据为新视觉背书。Asset
    Admission/Publication 由内容字节、Profile、License 和 Provenance 决定；这些身份完全不变时可跨
    Attempt/Lane 复用，不由场景路线反向拥有。
15. Native Lane 的首个参考图白膜方法采用 `Babylon Native Block Whitebox Profile`。它完整吸收
    `codex/block-world-sdk-v2@618d96b` 中有效的米制方块、真实体积、空间剖面、调色板、视觉分组、
    结构/渲染/通过性验收和性能优化思想，但替换其 Three.js Adapter、持久 Block Manifest、Block
    Compiler 与旧 Runtime。Profile 可以维护单次 Build Epoch 的 package-local 内存 Layout；不得发布逐块
    JSON、增加第三个 Scene Source，或让 Layout 成为 Gameplay Ground/Route 的第二真相。

## 对既有 ADR 的关系

- **ADR-0006 保持有效，但被本 ADR 做范围修订。** AuthoringSpec Compiler 继续是 Canonical Lane 和
  当前唯一正式生产入口；“所有正式场景都只能由 JSON 描述”的全局结论不再适用于通过独立门禁的
  Babylon Native Scene Lane。
- **ADR-0003 保持 Runtime 权威边界，但被本 ADR 做创作期例外。** 创作 Agent 可在独立 Native Lane
  操作 Babylon 视觉对象；它仍不能操作 Havok、Runtime Gameplay State、主相机或底层控制 Handle。
- ADR-0004/0005 的 Plan-first、证据分层和角色冻结继续适用于 Canonical/Hosted 工作流。Native Lane 的
  AI 输入、审查和证据流程必须在生产化计划中显式定义，不能静默进入既有 Catalog/Hosted Builder。

## 结果

- AI 对复杂参考场景可以直接使用 Babylon 公开 API，视觉能力不再受自有形状目录限制；模型生成成功率
  仍由 BNA-2/BNA-6 的冻结基准验证，不把“更熟悉”当作既成事实。
- JSON 不被删除；它继续承担世界身份、资源、Gameplay、自动化、Compiler、Route 和 ChangeSet 价值。
- 项目会新增一个 Provider-specific Authoring 包和一种 Runtime Scene Source，但不会新增第二套
  Gameplay Runtime、Physics、Camera、State 或 Browser Protocol。
- Block Whitebox 作为可选 Native Profile/Helper 存在，而不是新的 World Protocol。它可以直接创建
  Babylon Mesh，并从同一内存布局辅助产生 core `StaticColliderContribution` 及其关闭
  `traversalBinding`；Host 冻结后仍由 SDK 创建 Havok，未登记视觉对象默认没有 Gameplay Physics。
  Visual Group 只属于 Profile-local Capture/诊断 inventory，不是 Native V1 Contribution。
- 离线 Asset Production 可以更换 Provider，但它只发布经资产类别 Build Record 闭合、再被只读
  Admission 接受并由原子 Publication 完成的锁定资源；完整房间/关卡重建在 V1 只保留 artifact-only
  研究证据，不能进入 Registry、
  Runtime，也不能成为地表、碰撞、Route 或 WorldPackage 权威。开放户外默认使用 ground/terrain-first，
  再由被选择的 Scene Source 布置已发布的独立资产。
- Native V1 不支持 `WorldChangeSet`。Source/Bootstrap 修改必须构建新的 Package/World Build Identity，
  再由 RuntimeHost 做 Full Reload replacement；未来 Native Edit/Incremental 协议必须另立版本化设计。
  Route、导航和 Hosted 任意代码同样需要独立 Gate，不能从视觉/碰撞实验推导。
- 在 BNA-1 至 BNA-6 完成前，当前生产能力和文档入口仍以 Canonical Lane 为准。

## 不采用的方案

- **让所有视觉继续经过项目自有 Compiler**：会重复 Babylon API，造成长期追赶和 AI 表达损失。
- **删除 JSON、全部使用 Native Code**：失去 Schema、资源锁、自动化、ChangeSet 和不可信输入边界。
- **同一世界混合 Canonical geometry 与 Native overlay**：无法维持单一几何、Spawn、Collision 和 Route
  权威，V1 明确禁止。
- **Native Code 自己创建物理、人物和相机**：会产生第二套 Runtime 与状态真相。
- **同时提供 Three.js 与 Babylon Endpoint**：会重新引入双引擎桥接、两套生命周期和长期测试矩阵。
- **把 Babylon 再包成完整自有 API**：本质上恢复了要避免的内部场景协议和 Compiler 循环。
- **把旧 Block World 三个 Package 原样迁移**：会保留 Three -> Manifest -> Compiler -> Babylon 的
  跨引擎重复链路。只重写其中与方块创作、检查和优化有关的算法思想。
- **禁止一切生成期结构化布局**：会失去 Occupancy、坡面、边界、Chunk 和确定性检查。允许关闭的内存
  Layout，但它不能持久化、进入 Runtime 或替代冻结 Contribution。
- **把生成场景 Manifest 作为第三条 Scene Source**：会让 Provider Pipeline 拥有世界 Placement，重新
  引入隐藏视觉 Compiler，并与 Canonical/Native 的几何和生命周期权威冲突。
- **在 Runtime 或 Scene publish 后生成/回退资产**：会让网络、费用、文件存在性和 Provider 状态决定
  正在运行的世界，破坏 Asset Lock、Package Root、确定性和原子替换。
