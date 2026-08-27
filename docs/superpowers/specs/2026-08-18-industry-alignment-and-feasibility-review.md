# 业界对照与可落地性核查报告

- 性质：评审支撑材料，不是规格；被核查规格演进时本报告不自动更新。
- 日期：2026-08-18（外部事实核实日期，链接内容以当日为准）。
- 核查对象：[`2026-08-17-ai-first-lego-game-sdk-design.md`](./2026-08-17-ai-first-lego-game-sdk-design.md) 与 [`2026-08-17-terrain-authoring-pipeline-design.md`](./2026-08-17-terrain-authoring-pipeline-design.md)。
- 核查方法：对照本仓库现状验证复用主张；联网核实运行时选型的关键能力；对照模型提供方已发布的结构化输出硬上限评估 AI-facing 协议。
- 后续专题：[`Agentic 白模世界到可控视频：开源方案调研与架构启示`](./2026-08-19-agentic-whitebox-to-video-open-source-research.md) 进一步对照场景生成、约束求解、模拟控制信号和生成式视频渲染项目。

## 1. 结论摘要

1. **可落地性**：架构可落地，未发现致命设计错误。运行时选型的两个最大疑点（Havok Heightfield、官方角色控制器）已核实为成熟能力；剩余主要风险是编译数学确定性（已补进规格）与工程量本身。
2. **业界最佳实践**：核心机制与 Unreal GAS、OpenUSD Composition、Unity DOTS/Bevy 调度、固定时间步模拟、lockfile/内容寻址构建等业界最强实践对齐；偏离处均为有意取舍且有兜底路径。
3. **AI 友好性**：方向正确（受限 Profile、注册表枚举、Diagnostic 修复回路、增量 ChangeSet）；对照提供方结构化输出硬上限发现两条具体缺口（嵌套深度、枚举规模），已作为协议要求补进规格。

## 2. 可落地性核查

### 2.1 Babylon + Havok 运行时（已联网核实）

| 核查项 | 结果 | 依据 |
|---|---|---|
| Heightfield 碰撞体 | 支持。`PhysicsShapeHeightField` 接收尺寸、采样数与 `Float32Array`，与 `ContentAddressedHeightRasterRef → Float32Array` 适配路径吻合；另有 `PhysicsShapeGroundMesh` 辅助构造 | [Babylon PR #14752](https://github.com/BabylonJS/Babylon.js/pull/14752)、[PhysicsShapeHeightField 文档](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.PhysicsShapeHeightField) |
| 角色控制器 | 支持。官方 `PhysicsCharacterController` 具备 `maxSlopeCosine`（坡度墙判定）与 `maxStepHeight`（跨阶，up→forward→down shape cast），覆盖 BodyProfile 要求的自动跨阶/最大坡度/贴地 | [Babylon PR #18449](https://github.com/BabylonJS/Babylon.js/pull/18449) |
| 已知耦合副作用 | 步高过滤会把可走坡度上限压到 `cos(θ) ≥ 1 − maxStepHeight/capsuleRadius`。按本项目典型参数（42° 爬坡、步高 0.3m、胶囊半径约 0.35m）推得上限约 81°，不构成冲突；仍须在总规格阶段 0 探针中实测确认 | 同上 PR 的文档化说明 |
| Havok 包许可证 | 当前 `@babylonjs/havok` 发布包声明 MIT；这不是对未来版本或整个发布物的法律结论。实际锁定包仍须通过 LICENSE/NOTICE、来源、内容 Hash 与再分发清单 Gate | [`@babylonjs/havok` npm](https://www.npmjs.com/package/@babylonjs/havok)、[package.json](https://github.com/BabylonJS/havok/blob/main/packages/havok/package.json)、总规格 §19 |

### 2.2 编译确定性（发现缺口，已补进规格）

ECMAScript 只规定 `Math.sin/cos/exp/pow` 等超越函数为实现近似，不能把跨 JS 引擎 bit-for-bit 一致当作协议前提。地形重建的距离场与平滑求解可能使用这类函数，而 normalize/校验会同时运行在 Node CLI 与浏览器中。若不处理，编译层 bit-for-bit 承诺会在跨环境下静默破产。

已补进规格的约束：参与协议哈希的计算必须使用 Compiler Profile 声明的确定性数学实现（自带软件数学库，或限制在 IEEE-754 完全确定的加减乘除与 `sqrt`）；bit-for-bit 范围限定为锁定 SDK 构建加声明的 JS 引擎类别；Node 与浏览器重算哈希一致属于 Conformance 测试范围（总规格 §15.6、地形子规格 §13.2）。

### 2.3 其余子系统评估

- **Canonical Bytes（RFC 8785 + 输入限制）**：拒绝重复键、`-0`、非法数值需要自定义 JSON parser，有成熟实现可参考，可行。
- **Semantic Mask / Instance ID / Depth Capture Pass**：Babylon RenderTargetTexture + 材质覆盖是可行路径；headless Playwright 可走 SwiftShader。pixel-exact 只在浏览器、SwiftShader、字体、分辨率和渲染参数全部锁定的同一 Capture Profile 内成立；跨 Profile 应验收 Region、Anchor、Instance ID 集合与容差指标。阶段 0 P5 已按此分级。
- **地形单调重建**：距离场 + 带内单调插值是 GIS 等高线插值的成熟问题，CPU 确定性实现无理论障碍。
- **Capability 热安装事务 + Ownership Ledger**：比业界常规激进（引擎一般整世界重载），复杂度由泄漏测试与回滚 Conformance 兜底；建议阶段 D 按高风险项排期。
- **工程量**：协议栈 + 编译器 + 运行时三线并行，阶段 B–F 每段为月级工作量。「探针先行、协议后冻结」顺序合理，落地瓶颈在团队投入而非设计本身。

## 3. 业界最佳实践对照

| 规格机制 | 业界对应 | 评价 |
|---|---|---|
| Semantic Action + ActionContext + Variant + Channel Lock | Unreal Gameplay Ability System（GameplayTags、Montage、Ability 阶段） | 高度对齐；权威结果来自模拟 Tick 而非动画 Marker，是联网游戏铁律 |
| windup/active/recovery + Tick 命中窗口 | 格斗游戏 frame data、GAS effect window | 标准做法 |
| Prototype/Instance/Variant/Layer/Tombstone | OpenUSD Composition | 取子集避开 USD 全量复杂度，明智 |
| Kit/Profile 分离（Body/Visual/Rig/AnimationSet） | Prefab/Archetype + 模块化角色管线 + Retargeting | 标准做法；「儿童≠缩放成人」判断正确 |
| Relationship 一等公民 | Flecs entity relationships | 超前于 Unity/Unreal 的组件引用惯例，但有成熟先例 |
| System reads/writes 声明 + Command Buffer + Phase Barrier | Unity DOTS / Bevy 调度器 | 标准做法；编译期检测非交换多 Writer 比多数引擎更严格 |
| 固定时间步 + 渲染插值 | 业界固定步长模拟共识 | 标准做法 |
| 确定性三分层 | lockstep 工程共识的诚实版本 | 不承诺跨设备 bit-exact 模拟是正确的 |
| Registry Lock + 内容寻址 + 增量/全量等价 | lockfile 生态 + Bazel 式内容哈希构建 | 标准做法 |
| CLI stdout 纯 JSON + NDJSON 流式 | terraform / LSP 工具链惯例 | 标准做法 |
| Browser Driver 握手 + Scope + Nonce | WebDriver BiDi / CDP Session 模型 | 标准做法 |

**有意偏离业界的取舍**（均有明确理由与兜底）：

- 无人工编辑器工作流：AI-first 取舍；专业工具产物可经 `height-raster@1` 与受信 Refiner 进入流水线。
- Capability 运行时热安装：为 AI 改世界付出的复杂度成本，由事务与 Ledger 测试兜底。
- Navigation/NavMesh、音频、网络：诚实声明 out of scope；`path` 节点为未来 NavMesh Bake 留位。

## 4. AI 友好性评估

### 4.1 对照结构化输出硬上限（核实于 2026-08-18）

以 [OpenAI Structured Outputs 已发布限制](https://developers.openai.com/api/docs/superpowers/skills/structured-outputs) 为参照（strict 模式）：属性总数上限 5,000、嵌套 10 层、全 Schema 枚举值 1,000 个、总字符 120,000；根级禁 `anyOf`；对象必须 `additionalProperties: false` 且字段全 required（可选字段转 nullable）。据此发现两条缺口，均已补进总规格：

1. **嵌套深度**：AuthoringSpec 天然深度不浅（根 → `nodes[]` → 节点 → `components{}` → 组件 → 参数已达 6 层），叠加受控嵌套易破 10 层。已补：AI Schema Profile 声明深度预算，受控嵌套默认只投影一层（总规格 §7.5、§8.1）。
2. **枚举与规模预算**：注册表全量投影为 enum 会超上限。已补：Projector 把提供方规模上限作为显式预算，超限枚举按声明策略降级为 `pattern`/`format` 引用并由 Canonical Schema 兜底（总规格 §7.5）。

具体数值属于提供方随时可变的事实，因此规格只写「预算与降级策略」机制，不写数字；数字快照仅保留在本报告。

### 4.2 评估为无碍的项

- 根级禁 `anyOf` 只限 Schema 根：`nodes[]` 元素级 Union 不受影响。
- `additionalProperties: false` 与规格「默认关闭未知字段」一致；optional→nullable 是 Provider Adapter 的既定职责。
- 弧度制与米制坐标对模型不构成实际障碍；构图 Gate 与物理 Gate 兜底数值误差。
- Token 成本：中等世界 AuthoringSpec 在数千 Token 量级；WorldChangeSet 避免整包重写，成本模型健康。

### 4.3 修复回路完整性

Diagnostic（稳定错误码 + JSON Pointer + 机器可读建议）→ WorldChangeSet（明确的 `baseAuthoringSpecHash` + 幂等 Receipt）→ 重新验证的闭环完整，与「Agent 根据结构化反馈迭代」的目标匹配；地形侧另有图像区域/世界区域双坐标定位，优于业界一般实践。

## 5. 本报告导出的规格修订

以下修订已随本报告落入规格：

| 修订 | 位置 |
|---|---|
| 确定性数学实现与 bit-for-bit 范围限定 | 总规格 §15.6；地形子规格 §13.2 |
| Schema Projector 规模预算与枚举降级策略 | 总规格 §7.5 |
| 受控嵌套深度预算（默认一层） | 总规格 §7.5、§8.1 |
| Runtime Target 第三方二进制记录来源与许可证 | 总规格 §19 |
| optional/null Provider 投影的无损往返规则 | 总规格 §7.5；阶段 0 §1.5 |
| AuthoringSpec Hash 与其他 World Hash 的对象边界 | 总规格 §16.3 |
| 版本化签名 Envelope 与协议域隔离 | 总规格 §19.1 |
| Probe Lock、Report Schema 与 Capture Profile | 阶段 0 §2.1、P5 |

## 6. 遗留跟踪项

后续核查与探针计划见[阶段 0 技术探针计划与外部资料核查](./2026-08-18-phase0-probe-plan-and-external-research.md)（2026-08-18），各项状态：

- `maxStepHeight` 与 `maxSlopeCosine` 耦合实测：**转入探针 P2**。
- Babylon-Havok 包许可证：**候选包声明已核对**——当前 `@babylonjs/havok` 包声明 MIT；实际锁定版本的 LICENSE/NOTICE、来源、内容 Hash 与再分发清单仍由生产 Package Gate 校验。WebAssembly SIMD 依赖转为平台支持矩阵决策项。
- Canonical JSON parser 选型：**存在候选、尚未批准**（序列化侧候选必须跑 RFC 8785 与项目附加向量；解析侧重复键拒绝需小型扫描器或带源位置 parser），定案转入探针 P8。
- 确定性数学实现：**候选已确认**（限制运算集合 / WASM libm / 纯算术实现三条路径），定案转入探针 P7。
- 提供方结构化输出差异：**已核查三家**——`constrained-json@1` 使用保守可投影基线；全 required、nullable 等提供方限制由版本化 Adapter Projection Map 处理，不反向污染 Canonical Schema。Conformance 用例清单已列入探针文档 §1.5。
