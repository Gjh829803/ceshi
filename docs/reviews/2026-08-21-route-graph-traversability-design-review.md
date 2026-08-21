# Route Graph 与主体可通行性设计审查

## 1. 审查元数据

- 模式：A，设计规格审查；因规格涉及移动、物理支撑和 Browser/CLI Runtime Gate，额外
  完整应用 `runtime-deep-review-checklist.md`。
- 审查对象：
  `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`。
- 审查前状态：Proposed / Design Review Ready；审查处置后为 Reviewed / Field Freeze
  Pending。尚未实现、尚未冻结公共字段。
- 分支：`main`。
- Diff 基线：`4cfbf07`（`origin/main`，审查开始时）。
- Runtime 依赖：lockfile 中 `@babylonjs/core@9.21.2`、`@babylonjs/havok@1.3.14`。
- 证据层级：本次只有 `static-read`。没有新增源码、Fixture 或可执行能力，因此没有把
  文档检查描述为 `automated-contract`、`rendered-visual` 或 `manual-interaction` 证据。

执行并通过的检查：

| 命令/检查 | Exit code | 结论 |
| --- | ---: | --- |
| `git diff --check` | 0 | 无空白错误 |
| 9 个变更 Markdown 文件的本地链接存在性检查 | 0 | 所有本地链接存在 |
| `rg` 检查 Route/Surface 同义词、占位符、重复标题和 Diagnostic 名称 | 0 | 无开放命名冲突或占位符 |
| `rg` 对照 `motion-kernel-runtime.ts`、内置 Physics Profile 与 Babylon 9.21.2 安装源码 | 0 | 当前 `0.3m` Profile 被传入 Controller；安装源码把 `maxStepHeight` 作为严格跨阶上限 |
| `pnpm typecheck` | 0 | 当前仓库 TypeScript 类型检查通过 |

未运行 `pnpm test` 和 `pnpm build`：本次只有 Markdown 规格、Backlog 和导航入口变更，
未改 TypeScript、JSON Schema、依赖、Fixture、生成制品或 Runtime。本文不据此声明任何
Route 能力已经通过自动化或浏览器门禁。

业界对照已核对以下一手来源：Recast/Detour 官方仓库与头文件、Godot 4.x 官方
NavigationMesh/NavigationLink3D 文档、Unity 官方 AI Navigation/agentClimb 文档、Unreal
官方 Nav Link Proxy 文档。未核对的业界印象没有作为 P0/P1 依据。

## 2. 旧结论复验

1. `2026-08-21-hybrid-terrain-design-review.md` 关于“Surface 只能引用 Collider Subshape，
   禁止平行 walkable mesh”的结论已回当前权威规格复验，仍成立。当前设计进一步将术语
   从未冻结的 `Walkable Surface` 收敛为 `Traversal Surface`，并明确它不是全局
   `walkable: true`。旧 review 保留历史用词，不作为当前命名权威。
2. Placement S1 关于 `connected-by-route` 尚未实现、不能进入 V3 枚举的结论已回当前
   Schema/Backlog 复验，仍成立。新规格只给出下一 Canonical Major 的候选合同，并将 R0
   字段评审作为实现前置，没有把设计成员宣称为现有能力。
3. P2.6 H1/M10 对完整同 XZ 桥面/桥下双层 Runtime Fixture 的所有权已复验。M5 R1b 只
   验收普通静态台阶/平台；Graph 合同保留分层 3D 能力，但不冒充 H1 Bridge 已完成。

## 3. Findings

当前规格没有开放 P0、P1 或 P2 Finding。正式审查前的作者自审已经处置以下问题：

| 已处置问题 | 处置结果 |
| --- | --- |
| `Walkable Surface` 容易被理解成所有主体共享的布尔真相 | 统一为 `Traversal Surface`；主体 Profile + Query 决定最终通行性 |
| M5 R1b 与 P2.6 H1/M10 重复拥有同 XZ 双层 Runtime Fixture | M5 收口普通静态平台；完整 Bridge 双层 Fixture 保留给 H1/M10 |
| Graph 正文携带自身 Hash 会产生自引用 | `traversalGraphHash` 改由 Compiler/Artifact Index 对 Canonical Bytes 计算和返回 |
| Route 与 Traversing Subject 可能带两套 Locomotion Profile | 要求 Registry Compatibility，并增加 `ROUTE_LOCOMOTION_PROFILE_MISMATCH` |
| 抽象 Path Query 可能被误当成真实可玩证明 | 新增独立 Blocking `route-runtime-conformance` Gate 和锁定 `TraversalDriverProfile` |

## 4. 维度覆盖表

| 维度 | 状态 | 证据与结论 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | AI 只声明 Route/Anchor/Subject；SDK 生成 Graph 并验收。R1/R1b 明确不含 NPC、载具、跳跃、攀爬、洞穴和完整室内，未越过当前阶段边界。 |
| D2 Schema 与 AI-friendly | 已查 | 复用 `spatial.routes`；候选 `connected-by-route` 使用 `traversingEntityId`、`startAnchorEntityId`、`destinationAnchorEntityId`、`routeId`；单位字段和 Ref/Hash 命名显式，Provider ID 不进入 Canonical Artifact。 |
| D3 承诺与事实对拍 | 已查 | README/Backlog/规格都标明未实现；只有专项设计复选框完成，R0/R1/R1b 与 Validation Gate 保持开放。 |
| D4 单一权威状态 | 已查（Runtime 附加） | Collider 是几何真相，Traversal Surface 是语义绑定，Traversal Graph 是派生查询，Havok Controller/Ground Support Resolver 是实际移动与支撑真相，Validation Report 是生产决策真相。 |
| D5 工程质量与可维护性 | 已查（设计级） | Stable ID、Canonical Hash、Profile Lock、Tile/预算、稳定排序、Provider Adapter 边界和失败语义已闭合；具体实现质量待实施计划和代码审查证明。 |
| D6 门禁与证据分层 | 已查 | `route-connectivity` 与 `route-runtime-conformance` 均为 Blocking；Graph 通过不能覆盖 Runtime 失败；Evidence 缺失/预算耗尽为 `incomplete`；当前审查没有冒充运行证据。 |

Runtime Checklist 补充覆盖：

- Authority map：已在规格第 4 节明确；Graph 不产生第二份 `isGrounded`。
- Installed semantics：已对照 lockfile、项目传参代码和安装的 Babylon 9.21.2
  `PhysicsCharacterController` 声明/实现。
- Adversarial transitions：规格覆盖跨阶上下界、Collider 缝隙、窄踏面、低顶、错误
  Surface、边缘跌落、Graph/Runtime 分歧、Reset/Rebind 和 30/60/120 Hz-like Render 节奏。
- Semantic merge：不适用；本次不是分支运行时合并。
- Evidence layers：Graph Contract、Runtime Integration、Browser/CLI Evidence 与人工体验未
  混为同一层。
- Completion gates：当前只完成设计审查；实施完成时仍须按 Runtime Checklist 跑完整门禁。

## 5. 审查结论

该架构方向成立，并且与现有 AI-first、Placement、Hybrid Terrain、Subject Profile、
Babylon/Havok Runtime 和统一 Validation 主线一致。它解决的是“不可通行世界被错误接受”
的问题：合格世界必须有确定性路径并由真实控制器走通；不合格世界应被阻断并返回可修复
Diagnostic，而不是通过调大默认步高或关闭碰撞掩盖。

当前只可声明“设计已成稿并通过本轮静态规格审查”。R0 字段冻结、R1 Heightfield Fixture、
R1b Static Platform Fixture、统一 Validation 集成和真实 Browser Gate 均未实现，不能据此
宣称 M5 或台阶/平台通行能力已经交付。

## 6. 后续审查状态

本文件记录作者在 `4cfbf07..9d1e47e` 上的首次静态自审，其“没有开放 P0/P1/P2”结论已被
[独立审查及 disposition](./2026-08-21-route-graph-traversability-independent-review.md)
取代。后续实现必须读取修订后的权威 Route/Hybrid/Validation 规格和 R0 实施计划，不能以
本文件第 3 节作为跳过 R0、P1.5 Runtime 依赖或对抗 Fixture 的依据。
