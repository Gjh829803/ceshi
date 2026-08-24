# xier120 非人类源资产静态 Subject 接入设计

## 1. 文档状态

- 状态：**Frozen for implementation planning**。本文冻结首个可交付切片；实施前另写依赖感知的执行计划。
- 日期：2026-08-24。
- 目标分支：`codex/xier120-non-human-subject-integration`。
- 输入分支：`origin/codex/xier120-non-human-source-assets`，审计提交 `a63993e`。
- 所属系统：Subject Registry / Authoring Normalizer / Compiler / Babylon Runtime / Playground Asset Resolver。
- 适用审查：[`Full-dimension Review Protocol`](../../reviews/full-dimension-review-protocol.md) 与
  [`Runtime Deep Review Checklist`](../../reviews/runtime-deep-review-checklist.md)。

本文把产品提交的 19 个 FBX 源文件接成可解析、可实例化、可控制、可碰撞、可重置和可释放的
静态视觉 Subject。本文不把源文件中的姿态片段、骑乘构图或载具外形解释成已经支持的动画、
坐骑、车辆动力学或飞行能力。

## 2. 已确认事实

### 2.1 源资产完整性

输入提交包含 19 条 Catalog 记录和 19 个 FBX 文件：

- 动物 4 个；
- 人物与动物、载具组合 9 个；
- 车辆 6 个。

审计已逐项核对 Catalog 的 `sourceId`、相对路径、字节长度和 SHA-256；19/19 匹配，ID 唯一，
文件都能被当前安装的 `three@0.180.0` `FBXLoader` 解析。资产没有外部纹理依赖，适合本项目的
白盒材质表达。

因此，**源素材包是完整的**。但 FBX 是 `source-only`：它们的原始单位、原点、朝向、蒙皮和
动画不满足 Runtime Asset Contract，不能直接称为可用 Subject。

### 2.2 动画素材边界

多数文件没有有效动画，或只有约 `0` / `0.033s` 的姿态片段。只有两个四足类文件出现超过
2 秒的片段，但它们包含重复 Stack、多组 Skinned Mesh 和非 Canonical 骨架。当前公开 Rig
合同要求单一 17 骨骼人形骨架和 `idle / walk / run / jump` 四个语义动作。

结论：19 个资产可以完整进入**静态 Subject**切片；现有素材不足以证明任何一个非人类资产
已经满足生产级 Rigged Subject 合同。

### 2.3 当前实现缺口

Schema 已表达 `SubjectVisualPartDefinitionV2` 的 Asset Part 和
`SubjectVisualBindingV1.mode: "static"`，但实现仍拒绝该组合：

- Authoring Normalizer 只为 Rigged Binding 解析 Subject Asset，并显式拒绝静态 Asset Part；
- Compiler 在静态 Subject 带 Asset Part 时抛出不变量错误；
- Babylon Subject Visual 加载资产后要求 Binding 必须是 `rigged`；
- Runtime 目前只有一份 `assetLease` / `assetInstance` 所有权槽位，不支持多 Asset Part。

本切片补通这一条已存在于公共类型中的纵向路径，不引入第二套 Subject 方言。

## 3. 目标与非目标

### 3.1 “可用 Subject”的验收定义

每个 xier120 Subject 必须同时满足：

1. Registry Ref 可解析且锁定到内容哈希；
2. Runtime 使用自包含 GLB，不在运行时解析 FBX；
3. GLB 采用米、`+Y` 向上、`-Z` 向前，底部支撑中心位于局部原点；
4. Authoring Normalize 与 Compiler 都能生成有效执行计划；
5. Babylon 能加载并实例化至少两个隔离实例；
6. 使用已有 Character Capability 路径完成移动、转向、重力、碰撞、相机、Reset 和 Dispose；
7. Visual 不含 Skeleton 或 Animation Group，不触发 Rigged Subject 路径；
8. Playground Resolver 可提供同源 URL，并有可运行的 Catalog/Gallery 验证入口；
9. 许可证策略明确为公司内部使用，不暗示可再分发。

### 3.2 首切片范围

- 合入并泛化 contributor FBX Source Inventory；
- 新增确定性的 FBX 静态烘焙工具与每资产修正配置；
- 生成并注册 19 个自包含 GLB Subject Asset；
- 补通单 Asset Part 的 Static Subject Normalizer / Compiler / Runtime 路径；
- 为 19 个资产注册显式 Collider Profile、Subject Definition 和 Resolver 映射；
- 增加自动化全量资产门禁与浏览器渲染/交互验证；
- 对四足动画做独立 readiness gate；只有通过 Canonical Rig 与四动作合同才允许进入后续动画切片。

### 3.3 非目标

- 不实现真实车辆悬挂、轮胎、转向、履带或摩托车动力学；
- 不实现飞行、滑翔、悬浮、坐骑、骑手拆分、NPC 行为或动画状态机；
- 不改变 Physics、Camera、Render Scheduler 或 Authoring Schema 的既有权威；
- 不让 Runtime 直接加载 FBX，不保留外部纹理 URI；
- 不用动画名字、文件名或 Mesh 名猜测语义动作；
- 不把静态 Subject 宣称为生产级动画 Subject；
- 不把这些资产加入默认公开 Catalog，也不声明外部分发权。

## 4. 权威与数据流

```text
xier120 FBX + catalog.json
  -> Source Inventory（来源、作者、哈希、source-only）
  -> Deterministic Static Bake（单位/轴/原点/拓扑/材质）
  -> Self-contained GLB + generated inventory
  -> Subject Asset Manifest（内容、预算、internal-only）
  -> Static Subject Definition（一个 Asset Part + 显式 Collider/Profile refs）
  -> Authoring Normalizer（resolve + lock + cost）
  -> Compiler Execution Plan
  -> Playground same-origin resolver
  -> SubjectAssetCacheV1
  -> Babylon static SubjectVisual instance
```

| 事实 | 唯一所有者 | 禁止的第二真相 |
|---|---|---|
| 原始文件身份和哈希 | Source Inventory | 文件名推断、生成目录副本 |
| 归一化比例/朝向/原点 | 每资产 Bake Config | Runtime 临时缩放、Definition 隐式修正 |
| 运行时内容与预算 | Subject Asset Manifest | Loader 猜测或越限后静默降级 |
| Subject 行为组合 | Subject Definition + locked Profiles | Mesh/动画名驱动能力 |
| 碰撞体 | 显式 Collider Profile | Visual Bounds 在 Runtime 反推 |
| 静态资产生命周期 | Babylon Subject Visual | Cache 外另建未跟踪 Asset Container |
| 许可证与再分发 | Registry Manifest | README 注释或部署环境猜测 |

## 5. Canonical 合同

### 5.1 Contributor Source Inventory

不能为每位提交者新增一套公开类型。扩展唯一的 `SourceAssetCoarseClassV1` 闭合联合，并新增
通用 contributor entry：

```ts
interface ContributorSourceFbxAssetInventoryEntryV1
  extends SourceFbxAssetInventoryEntryV1 {
  readonly sourceId: `${string}.${string}`;
  readonly creatorId: string;
  readonly authorship: "independent-original-model";
}
```

聚合导出使用 `sourceFbxContributorAssetInventory`；允许提供按 Creator 过滤的只读 View，
但不发布 `xier120` 字面量专用接口。`coarseClass` 只描述源资产粗分类，不承诺 Runtime 能力。

输入分支的 19 个二进制和 Catalog 原样保留；实现不得修改源文件来伪造新的 Provenance。

### 5.2 Deterministic Static Bake

转换器复用 workspace 已声明的 `three` 能力，不新写通用几何库。每个输入执行：

1. 校验 Catalog byte length 与 SHA-256；
2. FBX 解析后更新 World Matrix；
3. 将当前可见姿态烘焙为普通 Mesh，去除 Skin、Bone 和 Animation；
4. 清理 Camera、Light、Helper 和空控制节点；
5. 对缺失/无效法线重新计算法线；
6. 将三角 Mesh 索引化；
7. 使用确定性的白盒 PBR 材质，禁止外部纹理；
8. 应用每资产显式比例与 Orientation Correction；
9. 把 XZ Bounds 中心移到局部原点，把最低支撑 Y 移到 `0`；
10. 导出 GLB，并生成 byte length、SHA-256、Mesh/Vertex/Triangle/Skeleton/Animation Inventory。

相同输入、相同配置、相同锁定依赖必须产生相同字节。生成器输出目录是独占写资源；测试使用
临时目录，不得覆盖提交产物。

每资产配置至少包含：

```ts
interface StaticSubjectBakeConfigV1 {
  readonly sourceId: `${string}.${string}`;
  readonly scaleToMeters: number;
  readonly rotateXYZRadians: readonly [number, number, number];
  readonly expectedForward: "-Z";
  readonly displayColorHex: `#${string}`;
}
```

朝向修正必须通过三视图或运行时 Capture 确认，不能只根据原始 Bounds 或名称决定。

### 5.3 Static Asset Part 第一切片

`visualBinding.mode: "static"` 可继续包含零个 Asset Part（既有 Primitive-only Subject），也可
包含 **一个** Asset Part。第一切片不支持多个 Asset Part；这是实现能力限制，不新增 Alias 字段。

约束：

- 全局 `visualParts` 中 Asset Part 数量必须为 `0..1`；xier120 的资产型 Definition 必须等于 1；
- 允许 Primitive Part 仅用于调试，但 Release Definition 不混合 Primitive 与 Asset；
- Static Binding 不接受 Rig、Clip Set、Bone Socket 或 Animation Binding；
- Authoring 必须解析 Asset Ref、写 Registry Lock、计入 Resource Cost；
- Compiler 必须把锁定 Asset 写入 Execution Plan；
- Runtime 从 `SubjectAssetCacheV1` 获取一份 Lease，实例化一份静态 Asset Instance；
- Reset 只重置 Subject Node Transform，不重新下载或重新解析资产；
- Dispose 顺序为 Instance -> Lease -> Subject-owned nodes/material bindings；即使构造中途失败也不得泄漏；
- 两个 Subject 实例不得共享可变 Transform、Mesh、Material 或生命周期状态。

稳定 Diagnostic：

| Code | 条件 |
|---|---|
| `XIER120_SUBJECT_ASSET_PART_REQUIRED` | xier120 资产型 Definition 没有 Asset Part |
| `STATIC_SUBJECT_MULTIPLE_ASSET_PARTS_UNSUPPORTED` | Static Binding 有多个 Asset Part |
| `STATIC_SUBJECT_RIGGED_RESOURCE_FORBIDDEN` | Static Binding 引用 Rig / Clip / Animation 资源 |
| `STATIC_SUBJECT_ASSET_RESOLUTION_FAILED` | Asset Ref 无法解析或锁定 |
| `STATIC_SUBJECT_ASSET_INVENTORY_INVALID` | GLB 包含 Skeleton/Animation 或违反静态预算 |

这些 Code 由最早拥有完整上下文的边界产生；Runtime 不用泛化异常覆盖 Authoring/Compiler
已经能确定的错误。

### 5.4 Registry 资源与命名

Creator-qualified ID 使用一个 canonical 词汇：

```text
worldkit://subject-asset/xier120.<slug>@1
worldkit://collider-profile/xier120.<slug>@1
worldkit://subject-definition/xier120.<slug>@1
```

`<slug>` 与 Source Catalog 稳定名称一一对应。每个 Subject Definition：

- 只有一个 Asset Part；
- 使用显式 Capsule Collider Profile；不得从 Visual Bounds 在 Runtime 反推；
- 复用现有 Control / Feel / Locomotion / Motion / Physics Body / Camera Profile Ref；
- `bodyTopology` 如实映射：两足用 `biped`，四足与爬行类用 `quadruped` 或 `custom`，四轮
  才使用 `four-wheel`，组合体使用 `composite`；
- 动物可标记 `advanced`；车辆、飞行构图、骑乘构图标记 `experimental`；
- 不声明现阶段没有的飞行、驾驶、悬浮、骑乘或 NPC 能力。

Capsule 是首切片的控制/阻挡近似，不是精确载具碰撞。宽大资产必须通过浏览器 QA 确认不遮挡
相机、不穿入地面且能通过测试路线；无法满足时保留为 Gallery-only Experimental Subject，
不得通过夸大 Collider 能力过门禁。

### 5.5 许可证

19 个 Runtime Manifest 统一使用：

```ts
licenseSpdxId: "LicenseRef-Loopit-Company-Private"
redistributionPolicy: "internal-only"
```

这是本接入的保守默认，不改变提交者声明的作者身份。没有新的书面授权时，不能改成
`allowed`，不能放入公开下载或公共默认 Catalog。

### 5.6 动画 Readiness Gate

动画探索是静态交付后的独立、非阻塞工作流。一个候选只有同时满足以下条件才可进入 Rigged
Subject 实施计划：

1. 单一可控 Skeleton，且 Runtime Inventory 不超过预算；
2. 可确定性映射到新的、明确获批的非人类 Canonical Rig 合同；
3. 有独立、非重叠、可循环的 `idle / walk / run` 和可结束的 `jump`；
4. Root Motion、朝向、足底与尺度可稳定归一化；
5. 两实例隔离、30/60/120 Hz-like 驱动、Reset/Rebind/Dispose 均通过；
6. 渲染证据和人工交互证据都确认动作语义正确。

任一条件不满足时，交付物是结构化 Readiness Report / Asset Change Request；不得复制 Clip、
改名 Pose 或用静态帧伪造四动作。

## 6. 资产分类与运行时承诺

| 组 | 数量 | 静态 Subject | Authoring Availability | 首切片能力承诺 |
|---|---:|---|---|---|
| animals | 4 | 是 | `advanced` | Character Controller 驱动的地面移动与碰撞预览 |
| compositions | 9 | 是 | `experimental` | 整体静态外观随 Character Controller 移动 |
| vehicles | 6 | 是 | `experimental` | 整体静态外观随 Character Controller 移动 |

`experimental` 条目仍必须满足本文“可用 Subject”的技术门禁；它只是在产品语义上明确没有真实
车辆、飞行或坐骑行为。

## 7. 失败处理与可观察性

- Source hash 不匹配：转换前失败，不产生或更新 GLB；
- 转换结果非确定：测试比较两次输出字节并失败；
- GLB 有外部 URI、Skeleton、Animation、Camera、Light 或非索引三角：Admission 失败；
- Asset Ref/hash/byte length/inventory 不一致：Cache 加载失败，错误包含 Ref 和稳定 Code；
- 第二实例创建失败：第一实例保持有效，失败实例完整回滚；
- 部分构造或 Dispose 抛错：执行尽力清理并保留原始异常为 Cause；
- 浏览器可见朝向、支撑点或比例错误：只修改该资产 Bake Config，重新生成并更新 Manifest Hash；
- 动画 Gate 失败：只记录证据和缺口，不回退到猜测式动画绑定。

## 8. 依赖感知工作图

| ID | Goal / independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Stable I/O contract and integration point | Required evidence | Mode |
|---|---|---|---|---|---|---|---|
| XNHS-01 | 冻结本文、ID/许可/静态能力边界 | — | 02,03,04 | 本设计文档、架构决策 | 输入 `a63993e` 审计；输出 frozen design | 自审、无 TBD、提交哈希 | `main-agent-only` |
| XNHS-02 | 合入 19 个原始 FBX/Catalog，并泛化 Contributor Inventory | 01 | 05 | `assets/subjects/source-fbx/contributors/xier120/**`、`source-asset-inventory*` | Catalog -> readonly generic inventory export | 19/19 hash/length/path/ID tests | `parallel-safe` |
| XNHS-03 | TDD 补通单 Asset Part Static Subject 的 Normalize/Compile/Runtime 生命周期 | 01 | 05 | `subject-definition-normalizer*`、`compile*`、`runtime-babylon/subject-visual*` 的静态路径 | Definition -> lock/cost/plan -> cache lease/instance | 失败用例先红；正常、双实例、部分失败、reset/dispose 回归 | `sequential` |
| XNHS-04 | 建立确定性静态烘焙工具、配置、生成 GLB 和 Inventory | 01 | 05 | converter、bake config、generated xier120 assets；转换进程独占输出目录 | Source entry + config -> GLB + manifest inventory | 双次字节一致；19/19 Babylon NullEngine admission | `sequential` |
| XNHS-05 | 注册 19 套 Asset/Collider/Definition 并接入 Resolver/Gallery | 02,03,04 | 06,08 | xier120 manifests/definitions、resolver mapping、专用 fixture | qualified refs -> same-origin URL -> buildable world | Registry closure、Compiler、resolver、19-item fixture tests | `sequential` |
| XNHS-06 | 端到端 Gate 与浏览器视觉/交互 QA | 05 | 07 | verifier、捕获物、验证用 dev server/port | fixture -> report/capture/manual checklist | 19/19 automated；代表性动物/车辆/组合 rendered + manual evidence | `main-agent-only` |
| XNHS-07 | 全维度主审与可用时的 Cursor 只读复审 | 06 | completion | review 文档；不共享实现文件写权 | integrated diff + gate logs -> finding dispositions | 每条 finding 独立复现/关闭；全量相关门禁复跑 | `main-agent-only` |
| XNHS-08 | 四足动画 Readiness Probe；不阻塞静态交付 | 05 | future rig plan only | readiness report/change request；禁止修改公共 Rig 合同 | candidate GLB/source stacks -> pass/fail evidence | 六项 Gate 明细；失败不生成伪 Rigged Definition | `parallel-safe` |

XNHS-03 和 XNHS-04 虽修改不同文件，但二者共同冻结 Asset Inventory/生命周期语义；首轮由主 Agent
顺序完成红绿闭环，避免转换器假设与 Runtime Admission 分叉。XNHS-08 只有在静态合同稳定后才
可并行，且不能改变本切片完成条件。

## 9. 验证策略

### 9.1 TDD 与自动合同证据

- Source Inventory：19 条、唯一 ID、路径存在、byte length/hash 匹配；
- Converter：先写最小 FBX 的失败测试；验证确定性、米制 Bounds、底部原点、索引、法线、无 Skin/
  Animation/外部 URI；
- Authoring：Static Asset Part 可解析、锁定、计费；0 个/多个 Asset Part 与 Rigged Resource 拒绝；
- Compiler：执行计划包含 Asset Resource；Static Binding 不再误判为 Rigged；
- Runtime：load/instantiate、双实例隔离、cache hit、reset、partial construction、throwing dispose；
- Registry：19 个 Asset/Collider/Definition closure 和 internal-only license；
- Resolver：19 个 URL 同源、内容哈希与 byte length 匹配；
- 全量：19 个 GLB 在 Babylon NullEngine 下 inventory/admission 通过。

### 9.2 仓库门禁

至少运行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:xier120-subjects
```

若现有脚本名称变化，实施计划必须记录等价命令和原因，不得跳过对应维度。

### 9.3 渲染与人工证据

- Gallery 能轮换查看全部 19 个 Subject；
- 每个资产记录 front/right/back 或等价可复核 Capture，确认 `-Z` forward、支撑点、比例和无明显
  穿地；
- 至少选择动物、车辆、组合体各一个做键盘/手柄交互：移动、转向、碰撞、相机、Reset；
- 至少两个实例同时存在，验证 Transform/Material/Dispose 隔离；
- 自动合同证据、渲染证据和人工交互证据分别报告，不能互相替代。

## 10. 验收标准

静态接入完成必须满足：

- 输入分支 19 个源资产无遗漏、无哈希漂移；
- 19 个 Runtime GLB 都确定性生成并通过静态 Asset Inventory；
- 19 个 Subject Ref 都能从 Authoring Spec 编译到 Execution Plan，并在 Playground 实例化；
- Static Asset Part 的新增纵向路径有 adversarial regression coverage；
- 浏览器 QA 没有错误朝向、明显穿地、不可见资产或生命周期泄漏；
- 车辆/飞行/骑乘类保持 `experimental`，文档不声称不存在的行为能力；
- 许可证为公司私有、`internal-only`，未加入公共默认 Catalog；
- 全量相关门禁通过，主审和独立复审发现已 disposition。

动画不属于静态接入完成条件。动画 readiness 的合法完成结果可以是“当前素材不满足合同”，前提是
报告包含可复现证据和明确的上游补充要求。

## 11. 风险与回滚

- **源方向不一致**：每资产修正配置隔离，回滚单个生成物和 Manifest Hash；
- **Capsule 与宽大外形偏差**：保持 experimental，使用测试路线暴露限制，不修改 Physics 核心；
- **生成物体积/性能超预算**：Admission 阻断并调整 Bake，不提升 Runtime 全局预算掩盖问题；
- **生命周期回归**：Static 路径保留 Rigged 既有行为，使用双实例与 throwing cleanup 回归；
- **许可变化**：只有新的书面来源证据才修改 Manifest，源文件和提交者信息保持不变；
- **回滚策略**：Registry 条目和 resolver mapping 可整体移除；Static Runtime 路径由独立测试保护，
  不需要回滚或修改源 FBX。
