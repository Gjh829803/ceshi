# 阶段 0 技术探针计划与外部资料核查

- 性质：总规格阶段 0 的实施计划，附带评审期外部资料核查结论；不是 Public API 规格。
- 日期：2026-08-18（外部事实核实日期）。
- 上位规格：[`2026-08-17-ai-first-lego-game-sdk-design.md`](./2026-08-17-ai-first-lego-game-sdk-design.md) §24 阶段 0。
- 关联报告：[业界对照与可落地性核查报告](./2026-08-18-industry-alignment-and-feasibility-review.md)。

## 1. 外部资料核查结论

### 1.1 Havok 包许可证与平台约束（包信息已核对，发布合规待 Gate）

- `@babylonjs/havok` 当前发布包在 [npm](https://www.npmjs.com/package/@babylonjs/havok) 与其 [package.json](https://github.com/BabylonJS/havok/blob/main/packages/havok/package.json) 中声明为 **MIT**。这证明当前候选包的许可证声明，不等同于替项目作出最终法律结论。进入生产发布前仍须由 Package Gate 核对实际锁定版本中的 `LICENSE`/`NOTICE`、来源、内容 Hash 和再分发清单。
- **平台约束**：Havok WASM 依赖 WebAssembly SIMD（iOS < 16.4 不支持）。已决策：第一版目标平台类别为桌面浏览器（PC Web），该约束不构成阻碍；约束记录在平台类别 Profile 中，未来扩展移动端时重新评估。
- 本项目的生产 Host Profile 要求自托管并按内容 Hash 锁定 WASM，不依赖外部 CDN；实际锁定构建的内存增长行为和基线由探针 P6 实测，不能从候选包说明直接推断。

### 1.2 确定性数学实现选型（候选已确认，探针 P7 定案）

ECMAScript 将 `Math.sin/cos/exp/pow` 等结果定义为实现近似，规格已禁止协议哈希计算直接依赖这些原生函数。阶段 0 只确认存在以下工程路径，不提前批准某个第三方包：

| 路径 | 代表 | 特点 |
|---|---|---|
| WASM libm 模块 | 锁定源码、工具链和 WASM 内容 Hash 的软件数学实现 | 需要异步初始化；必须用跨引擎 Golden Hash 证明结果，不凭包说明承诺 |
| 项目内参考实现 | 只使用协议允许运算的受审计算内核 | 无运行时第三方依赖；维护成本和性能由 P7 衡量 |
| 限制运算集合 | 编译算法只用 `+ − × ÷ sqrt`（IEEE 完全确定） | 零依赖；约束算法设计（距离场可行，指数衰减类平滑需改写） |

倾向：Terrain Compiler 优先尝试「限制运算集合」，不足时引入 WASM libm；两者都要通过 P7 微基准验证编译耗时预算。第三方包不直接采信，选型后须以 Golden Fixture 锁定实现内容 Hash。

### 1.3 Canonical JSON 实现选型（候选已确认，探针 P8 定案）

- 序列化侧存在 RFC 8785 实现候选，例如 [`canonicalize`](https://www.npmjs.com/package/canonicalize)；目前没有库被规格预先批准。P8 必须对候选的具体版本与内容 Hash 运行 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) 测试向量和本项目附加限制后才能定案。
- **注意边界**：现有库解决的是序列化侧；规格要求的「解析阶段拒绝重复属性名」`JSON.parse` 做不到（静默取末值），需要一个小型自研扫描器或带源位置的 parser 在入口处执行。这是阶段 B 的一个明确工作项，不是风险。

### 1.4 Headless 测试与截图路径（已确认双轨）

- `NullEngine`：Node 内无渲染运行 Babylon，适合物理/逻辑/固定 Tick 的单元与 Smoke 测试；不产出图像。
- 视觉验证：Playwright + Chromium `--use-gl=swiftshader` 软渲染；[Playwright 视觉比较文档](https://playwright.dev/docs/test-snapshots)明确建议在相同环境生成和比较基线，因此浏览器、SwiftShader、字体、分辨率和启动参数都进入 Probe Lock。
- 结论：测试体系按双轨设计——确定性断言走 NullEngine/纯 Compiler，构图与 Capture Pass 走 Playwright 软渲染；与规格「视觉可复现性用结构 Pass 而非像素相等」一致。

### 1.5 三家 Provider 结构化输出差异（Adapter Conformance 输入）

核实于 2026-08-18：三家都提供结构化输出能力，但支持的 JSON Schema 子集、限制处理和规模预算会演进。核查依据分别为 [OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)、[Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)和 [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest)。Provider 的某个即时限制不得写入 Canonical Schema；确切兼容矩阵属于带核查日期和 Adapter 版本的测试数据。

对本项目的直接结论：

1. `constrained-json@1` 使用保守、可投影的共同基线：纯对象、枚举、显式判别字段、受控 Union 和有限嵌套，不依赖 Provider 强制数值边界。若具体 Provider 要求全 required，Adapter 可以通过 required + nullable 投影 optional；Canonical 字段同时允许缺失和 `null` 时，必须改用带 `present` 判别字段的包装对象或拒绝投影。Projection Map 负责无损还原，该规则不反向污染 Canonical Schema。
2. 数值边界、跨字段不变量一律由 Canonical Schema 与语义验证器兜底——规格既有架构（Adapter 输出必须重新过 Canonical Schema）已覆盖，此处是证实而非变更。
3. Provider Adapter Conformance Fixture 必须包含：数值边界被忽略、根级 Union 改写、optional↔nullable 无损往返、Canonical Schema 本身允许 `null`、超规模预算降级五类用例。

## 2. 阶段 0 探针计划

每个探针给出目的、方法、通过判据和失败出口；探针代码不进入公共 API，场景代码不得依赖探针实现。P1–P6 对应总规格阶段 0 清单，P7/P8 是协议底座（阶段 B）的前置探针，可并行。

### 2.1 所有探针共用的可复现执行契约

探针结果会直接决定公共协议和 Runtime 选型，因此不能只保留终端结论。每次运行必须产生：

```text
artifacts/probes/<probe-id>/<run-id>/
  probe-lock.json
  report.json
  stdout.log
  metrics.json
  captures/              # 仅需要视觉证据的探针
```

`probe-lock.json` 至少固定：探针计划版本、仓库 Commit 与 Dirty Patch Hash、Node/pnpm/SDK/Babylon/Havok/Playwright 的精确版本、Havok WASM 与浏览器构建 Hash、OS/CPU/架构、GPU 或 SwiftShader 信息、浏览器启动参数、Compiler/Determinism/Host Profile Hash、输入 Fixture Hash 和随机 Seed。无法取得的字段必须显式为 `null` 并解释原因，不能静默省略。

`report.json` 至少记录 `pass | fail | inconclusive`、开始/结束时间、执行命令、判据版本、每项阈值与实测值、输入/输出 Artifact Hash、Diagnostic 和失败出口建议。只有 `pass` 可以支撑协议冻结；`inconclusive` 不能按通过处理。性能结果只允许在同一 Host Profile 内纵向比较，跨机器结果必须分组报告。

探针实现与报告 Schema 由仓库测试代码校验。阶段 B 冻结评审引用具体 `run-id + probe-lock hash + report hash`，不能只引用本文中的自然语言结论。

执行责任按领域固定，具体负责人姓名和截止日期进入项目里程碑系统而不是协议文档：

| 探针 | Owner Role | 阻塞决策 | 前置依赖 |
|---|---|---|---|
| P1 | Physics Runtime | Heightfield Collider / PhysicsPort | 锁定 Havok 候选版本 |
| P2 | Character Runtime | Character Controller 契约 | P1 基础物理环境 |
| P3 | Animation & Asset | Rig/Socket/Animation Profile | 标准测试 GLB Fixture |
| P4 | Runtime Protocol | 固定 Tick / Browser Session | Browser Protocol 草案 |
| P5 | Rendering & QA | CapturePort / 视觉 Gate | P4 Session 与冻结 Capture Profile |
| P6 | Runtime Host | Session 池 / Dispose 策略 | P1、P4 可运行切片 |
| P7 | Compiler | Determinism Profile | 地形重建 Golden Fixture |
| P8 | Protocol | Canonical Bytes Profile | RFC 与项目附加测试向量 |

### P1 地形 Heightfield Collider

- 方法：以 `sunlit-flower-bay` 尺度（约 600×500 格、2m/格）构造全域 Raster 与分块 `PhysicsShapeHeightField`，测创建/更新/Raycast/释放；跨 Tile 边界做扫掠与射线一致性测试。
- 判据：Tile 接缝处 Raycast/角色扫掠无断缝；采样高度与权威 Raster 在容差内一致；反复重建后内存回到基线。
- 失败出口：改用 Mesh Collider 并重新测量性能、内存和接缝行为，或调整 PhysicsPort 后端决策；不修改 AuthoringSpec。

### P2 Character Controller 通行契约

- 方法：`PhysicsCharacterController` 实测 42° 可爬 / 48° 滑落 / 0.3m 跨阶组合；重点验证 `maxStepHeight` 的坡度耦合副作用（可走坡度被压到 `cos(θ) ≥ 1 − maxStepHeight/capsuleRadius`）在本项目胶囊参数下的实际行为；测边缘、贴地、跳跃落地。
- 判据：三项通行参数同时满足且互不破坏；固定输入脚本下轨迹可重放（同构建同平台类别）。
- 失败出口：基于 Havok shape cast 实现项目自有控制器，并用同一 Fixture 重新验证；通行契约参数不变。

### P3 GLB Rig、动画与 Socket

- 方法：本地 Mixamo 兼容 GLB 验证骨骼映射、`idle/walk/run` 播放、`hand-r`/`saddle` Socket 挂载、Upper-body 分层与 Bone Mask。
- 判据：Retarget 后动作无明显骨骼错位；分层混合不产生根骨骼漂移；挂载物随 Socket 变换正确。
- 失败出口：Rig Profile 契约按实测能力收窄（例如首版仅 Full-body + Upper-body 两层）。

### P4 Headless 固定 Tick 与 Session

- 方法：NullEngine 内跑固定步长模拟 + 暂停/单步；Playwright SwiftShader 环境跑同一 WorldPackage，验证 `setPaused/stepTicks` 语义与两环境状态一致性（容差内）。
- 判据：按 Tick 精确步进可用；Node 与浏览器对同一输入脚本的状态快照满足声明容差。
- 失败出口：Browser Protocol 的步进语义在冻结前调整（这是把探针放在协议冻结前的原因）。

### P5 Capture Pass

- 方法：RenderTargetTexture + 材质覆盖实现 color/semantic-mask/instance-id/depth/collision-debug 五个 Pass；软渲染环境测单帧截图耗时。
- 判据：在同一冻结 Capture Profile（浏览器/SwiftShader 构建、字体、分辨率、AA、色彩空间和启动参数完全一致）内，Mask/ID Pass 可以采用 pixel-exact Gate；跨 Profile 只比较 Semantic Region、Instance ID 集合、Anchor、覆盖率和带边缘忽略带的容差指标。Color/Depth Pass 始终使用声明容差。单场景全套 Pass 耗时须在验收流水线预算内。
- 失败出口：Pass 降级为分帧渲染或降分辨率；协议中的 Pass 枚举不变。

### P6 资源生命周期与内存

- 方法：大场景加载→运行→dispose 循环，跟踪 Babylon 资源、锁定 Havok WASM 构建的堆增长/复用行为和 Session 句柄。
- 判据：dispose 后 Babylon 侧资源计数归零；WASM 堆增长可解释且重复循环不递增；无泄漏监听器。
- 失败出口：如果实测确认 WASM 堆不能按 Session 回落，则按「进程级 Session 池 + 上限重启」设计 Runtime 宿主策略，并写入 Browser Protocol 的 Session 生命周期约定。

### P7 确定性数学微基准（协议底座前置）

- 方法：用地形重建原型（距离场 + 单调插值 + 平滑迭代）分别以限制运算集合、锁定 WASM libm、项目内参考实现三种路径跑同一 Golden 输入；跨 Node/Chromium/WebKit 比较输出 Hash 与耗时。
- 判据：候选实现跨引擎 Hash 一致；以 600×500 格场景为基准，单场景地形编译（重建 + 约束求解 + 打包）在参考桌面机单线程下不超过 30 秒，确定性数学实现相对原生 `Math` 的开销不超过 3 倍。该初始预算在 T2 Bake-off 后按实测修订，修订随 Compiler Profile 版本化。
- 出口：定案写入 Compiler Profile；若限制运算集合可满足全部算法需求，优先零依赖路径；超预算时优先换 WASM libm 路径而不是放宽确定性要求。

### P8 Canonical Bytes 与重复键拒绝（协议底座前置）

- 方法：候选 JCS 库跑 RFC 8785 官方测试向量 + 本项目输入限制（拒绝 `-0`、非有限数、重复键）；实现并验证解析侧重复键扫描器。
- 判据：全部向量通过；属性重排 Hash 不变、语义数组重排 Hash 改变；重复键在解析阶段被拒绝并给出 JSON Pointer。
- 出口：选型与自研部分一起以 Golden Fixture 冻结为 `canonical-json-jcs@1` 参考实现。

## 3. 阶段 A / T0 基准冻结可行性确认

已核对仓库现状，冻结旧基准所需工具链齐备，无前置开发：

- 场景与工件：`sunlit-flower-bay` 场景源码、`artifacts/scenes/sunlit-flower-bay/`（plan-lock、manifest、top-down/opening-shot plan、visual-bible manifest）均在版本管理内。
- 采集能力：Playground 具备截图、无 UI 录屏（`canvas-recorder`）、固定输入 Smoke API 与三视图导出；`plan:scene` / `plan:scene:check` 可导出并校验结构化工件。
- 待执行动作（评审通过后）：跑一遍全套导出并把结果连同当前性能/资源数据存为冻结基准目录，此后旧实现只读。

## 4. 决策记录

1. **平台支持矩阵**：第一版目标平台类别为桌面浏览器（PC Web），移动端为后续决策；iOS SIMD 限制不构成阻碍。
2. **确定性数学的性能预算**：初始上限为单场景 30 秒（600×500 格基准，参考桌面机单线程），数学实现开销不超过原生 `Math` 的 3 倍；T2 Bake-off 后按实测数据修订，修订必须升 Compiler Profile 版本，不得为达标放宽确定性要求。
3. **探针排期**：第一批 P1、P2、P4（阻塞 PhysicsPort 与 Browser Protocol 冻结，最先执行）；第二批 P3、P5、P6；P7、P8 由协议侧并行推进。全部探针须在阶段 B 协议冻结评审前完成。
4. **证据契约**：全部探针使用统一 Probe Lock 与 Report Schema；未锁定工具链或状态为 `inconclusive` 的结果不能支撑协议冻结。
5. **视觉确定性**：pixel-exact 只在相同冻结 Capture Profile 内承诺；跨 Profile 使用结构 Pass、Region/Anchor 和容差指标。
