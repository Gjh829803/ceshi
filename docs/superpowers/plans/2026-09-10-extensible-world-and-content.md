# 可扩展运行时与内容接入实施计划

**Goal:** 一个玩家与两个完整人形 NPC 共用模拟、目标与动作合同，内容包可独立接入并经现有 Creator/Episode 消费。

**Architecture:** 保留 ThreeWorld、execute、OperationLedger、WriteClaim、ThreeNavigation 和现有运动求解器。按阶段迁移实际 owner；内容包由受信构建工具汇合，不加载 manifest 中的代码。

**Tech Stack:** TypeScript、Three 0.185.1、Rapier、Recast/Detour、Playwright、Vitest、pnpm。

**Spec:** [已授权设计](../specs/2026-09-10-extensible-world-and-content-design.md)。本计划在当前独立 worktree 内执行，阶段结束汇报后继续；不自动合并。

## 全局约束

用户再次明确：项目未上线，不保留旧系统兼容层。以新设计统一实现并同步迁移
SDK、Playground、Creator、Episode、示例、Skill 与实际测试；不增加旧版本判断、
双协议解析、兼容别名或废弃入口。多角色期间初始人物与新增人物分开管理的过渡结构
必须继续收敛到统一 Actor 状态与生命周期，不能因为保留旧测试而作为最终方案交付。
历史基线和记录保留其真实身份，不将历史记录当作需要兼容的运行时消费者。

- 起点 `3f52d21532232502827df6dd9a289078fc49bbe3`，2026-09-10 fetch 核对 origin/main 相同。所有实现仅在本 worktree。
- 物理统一推进 owner，保留 60 Hz SDK tick 内 120 Hz 车辆子步及力/结果顺序。
- pickup/sit 的 operation 完成不释放持有/占座；取消终态不得早于实际安全清理。
- 普通 Three、白模、Source101、当前动作和简洁照明保留；不换模型、不购买资产、不迁入 GASP。
- 观察只读；未知、失败、stale 分开。源身份、runtime bytes、输入和采样时刻跟随证据。
- 无外部生产、Seedance、部署或账号切换；本地云合同测试 mock。
- 用户已授权按实际需要新增 npm 依赖；选成熟库并锁定版本，验证 Three/Rapier、浏览器打包和生命周期兼容性。
- 每阶段同步实际 SDK、Host schema/tools、Playground、Episode 和样例；新增测试入 census。
- 用户 2026-09-10 调整为单分支：后续全部在 `codex/extensible-world-r0` 累积，按阶段记录提交与证据，不再拆分支或另建 PR，方便用户统一处理。已有 R0 PR #232 保留；不自动合并或直推 main。

## R0：基线与决策（本地完成）

文件：`scripts/three-creator/runtime-baseline.ts`、本计划、`docs/reviews/2026-09-10-extensible-world-r0.md`。

- [x] 核对 worktree、远端和旧任务书差异；阅读 architecture/runtime checklist/设计与资产规范。
- [x] 创建 `codex/extensible-world-r0`，`pnpm install --frozen-lockfile`。
- [x] 构建当前 runtime，记录 hash。复制 character-actions/custom-vehicle 到 `.codex-tmp`，不借用旧验证和私有配置。
- [x] 基线工具先调用 Creator validate/inspect/playtest 保存真实视频、输入和失败；独立 Episode prepare/advance/execute/operation/frame 覆盖移动/跳跃落地、pickup/putDown/sit/standUp、视角与骑乘。
- [x] 同一 Chromium/1280×720/软件渲染下先 warmup，再三轮各 600 固定步；记录固定步与 render CPU p50/p95、mixer 评估数、body/collider、JS heap、原始样本。计时挂在测试工作区中的实际 owner 上，不向生产接口塞测试钩子。
- [x] 对照实际 consumers 明确 actor/target/operation/事件字段与生命周期决策；保存基线未覆盖项。
- [x] typecheck、census、相关文档 schema tests、diff；提交并创建 R0 PR。

## C1：首批内容包的真实发现与打包

2026-09-10 用户明确：Playground 调好后，Codex 按 Skill 完成接入。验收重点是链路跑通、
资产解耦、AI 知道如何接入和工作链路清楚；不要求所有资产完全工程化注册。
因此下列包版本/自动依赖求解内容仅在真实需要时实现，不能成为固定前置步骤。
本阶段先交付仓库接入 Skill、独立资产源、同源示例入口以及 Source101/现有动作/车辆的真实接线；
现有代码、binding、配置与说明均允许 AI 直接维护。运行时 R1–R6 范围不变。

文件 owner：`assets/three-creator/` 包源；`scripts/three-creator/asset-catalog.ts` 和实际导入/导出脚本；`example-files.ts`、`creator-discovery.ts`、`scripts/cloud/three-capsule.mjs`；SDK action-schema/action-system 与 vehicle factory；`shared/preset-content/config.ts`。

- [x] 每项资产独立源文件，Host 聚合目录由这些定义确定性生成；保留原资产身份与字节。
- [x] 仓库接入 Skill 描述 Playground 调参、内容修改、SDK 绑定、Creator 和 Episode 的实际消费路径。
- [x] 示例发现与离线 capsule 打包共享入口，实际资源闭包及策略校验通过。
- [ ] 动作 binding、SDK/Playground 配置和默认值收敛到各自唯一来源，消除按资产 ID 扩展核心的分支。
- [ ] 用动作变体与载具配置接入证明扩展成本；将行为验证、人工视觉审阅与发布状态分别记录。

资产包 manifest、包版本求解和通用注册框架不作为固定交付项；独立源、代码 binding
与 Skill 已能满足的内容直接维护。所有实际消费者同步迁移，不保留旧聚合源或旧目录读取分支。

## R1：共享模拟服务（本地完成）

文件：`engine.ts`、`physics.ts`、`humanoid-runtime/environment/queries.ts`、`humanoid-runtime/simulation.ts`、`humanoid-runtime/runtime.ts`。

- [x] 先写两入口物体/人物共享接触、子步计数、借用释放的失败测试。
- [x] 提取实际 Rapier 生命周期和推进 owner，完整人形与通用 rigid 使用同一世界；保留现有碰撞过滤和求解算法。
- [x] 普通物体碰撞、骑乘和 reset 浏览器复核；SDK/Creator/Episode 相关测试、typecheck/census/prebuild；记录原有下游失败与性能复测。

证据见 [R1 验证记录](../../reviews/2026-09-10-extensible-world-r1.md)。Rapier JS 缺少
非积分查询刷新，采用可独立重建且 hash 锁定的窄范围原生补丁；未保留 JS 位移裁剪。
SDK 741 tests 通过；下游原有潜艇路线失败已用原始源码/依赖复现，R6 仍需处理。

## R2：Actor 与导航

文件：`world.ts`、`contracts.ts`、`engine.ts`、`navigation.ts`、`assets.ts`、Humanoid runtime/controller、Creator command schema、Episode contracts/action-controller、Playground 与多人样例。

资源基础已完成：完整人物按资源 URL 闭包共享模板，骨架/逆绑定矩阵/mixer/clip/材质/
纹理对象独立；最后 lease 释放共享几何。部分加载、克隆、adopt 和清理监听器失败，
以及异步加载晚于角色 dispose 都有真实资源测试。116 项相关测试与 Creator/Episode
单人物推箱/reset 通过；记录在 `.codex-tmp/r0/r2-source-*` 和 `.codex-tmp/r2-source-browser`。
多 Actor 输入、完整动画实例、输入/相机目标分离、基于实际 collider 的导航及
Creator/Episode 三人物示例现已实现。参见 [R2 验证记录](../../reviews/2026-09-11-extensible-world-r2.md)。
完整人形 prototype 消费与候选场景事务已通过本地验证。初始人物与 NPC 已迁移为统一
Actor 绑定、输入、骑乘、模型生命周期和呈现历史，实际消费者回归已完成；
参见 [统一 Actor 验证](../../reviews/2026-09-11-unified-actors.md)。
确定性绕让仍待收尾，不将实际碰撞停住描述成已完成绕让。

- [x] 测试 3 Actor 独立输入/mixer/controller，despawn 不销毁共享世界，旧 generation 异步完成只释放 lease。
- [ ] 完整人物按 actorId 绑定；输入目标和相机目标分开。复用导航生成意图，碰撞几何生成 navmesh，保留失效/受阻原因与确定性让行。
- [x] 相同内容共享只读资源，独立骨架/mixer/可变材质；部分加载失败和最后 lease 释放可核对。
- [ ] 三角色浏览器导航、玩家骑乘、本地 Episode；3/10 活动角色首次性能和 50 次生命周期测试；阶段提交与验证记录。

## R3：共享目标与资源

共享交互基础已实现：环境拥有交互物、松散箱子及预约；控制器只持有自己的关系。
拾取/落座完成保留 held/occupied，取消握取前的预约不重建物体。世界复位恢复
物体，单角色复位不重置其他物体；箱子查询与 Playground 显示采用声明 ID。
验证记录：`.codex-tmp/r0/r2-content-regression-final.log`（98 tests）、
`r2-world-content-final.log`（资源实例及显示等 17 tests）；typecheck、lint 和 prebuild 通过，
runtime `77acc3f00d289a50a1b0f8bbbbc076c021382aa861ce51a41fbe3a51bb58735b`。
独立只读复核无剩余确认问题。尚不代表多 Actor 注册、动态目标失效和完整 R3 验收完成。

文件：现有 MapInteraction/action-schema/action-system、world/control-support、对应 Host/Episode 消费者。

- [ ] 同 tick 两请求争物/座恰一成功；先写原子全有或全无预约、目标移动/移除、reset/despawn 测试。
- [ ] 世界持有 target/slot generation 与 reservation；grip/sit 转成持续 heldBy/occupiedBy。物理实体及视觉引用同一个目标。
- [ ] 样例真实争用、搬运、释放、低顶退出、取消；阶段提交与验证记录。

## R4：持续任务与事件

安全取消已实现并经局部独立审查：低顶等待、坐姿过渡安全起身、握取后保持持有，
角色删除在同边界结束操作。见 [取消验证](../../reviews/2026-09-11-safe-action-cancellation.md)。
步行到骑乘的交接仅结束该 Actor 的导航步骤；分组操作继续跟踪其他角色，终态历史
不会被后来请求改写。见 [交接验证](../../reviews/2026-09-11-mounted-navigation-ownership.md)。
事件绑定、动态目标和整体 R4 验收尚未完成。

文件：OperationLedger、WriteClaim 解析、action-system、CharacterAttachments、Creator/Episode 操作消费。

- [ ] 测试跨事件 tick、暂停、循环、重复呈现、grip 前后取消、目标失效；operation 状态核对实际归属。
- [ ] 在既有 execute 中实现 pickup/sit task 阶段及动态资源；安全点再校验并提交，事件用 operationId/generation/loopIndex/eventId 去重。
- [ ] 保留纯 plan 行为；取消请求与清理完成分离，putDown 无有效落点保持持有并解释。
- [ ] 键盘/Creator/Episode 同合同真实完成与失败；阶段提交与验证记录。

## R5、C2：姿态与动作包

文件：Character、SourceCharacter、presentation、动作 binding/rig profile 和包检查。

- [ ] 测试显示骨骼扰动不污染同源时间采样、根运动只消费一次、骑乘 overlay 恢复。
- [ ] 源姿态/根运动提案/实际身体/overlay/显示分离；交接明确 actor/rig、tick、空间、单位、速度参照。
- [ ] 用已有 clip 做动画 binding 变体，主要修改内容；rig 不兼容拒绝，纯动画不冒充 gameplay。
- [ ] 真实动作与骑乘媒体及工程回归分别记录；阶段提交与验证记录。

## R6/C3：最终消费与发布材料闭环

- [ ] 全部核心矩阵在同一场地跑通；Creator 和独立本地 Episode 对应最终 runtime hash。
- [ ] 复测相同单角色及 3/10 角色性能；单角色 p95 回退超过 10% 复测并解释。
- [ ] 包锁、资源/配置/runtime/验证闭包及回退材料由本地发布准备消费；不执行外部发布。
- [ ] 完成 runtime checklist 相关合同和资源测试、typecheck、census、prebuild、Playground 浏览器与独立审查。
- [ ] 汇报单分支各阶段提交、远端 CI 实态、浏览器/视频与人工视觉验收缺口；未经人工审阅的动作观感保持未验收。

## 全部实现后的深度验收

用户要求在全部实现后检查需求符合度、游戏资产维护实践、分层、低耦合和 code smell。
以下为本次工程交付验收，不增加 Creator 生成的强制步骤。按
[runtime checklist](../../reviews/runtime-deep-review-checklist.md) 检查最终源码和实际消费者，
由独立审查交叉核对；修复后针对受影响行为复验，再给出最终结论。

- [ ] 将任务书和用户补充要求逐项对应到实现、实际调用方、验证证据及未覆盖项，分别标注完成、部分完成和未完成。
- [ ] 核对资产数据与 binding、加载和实例生命周期、SDK 执行、Three 场景创作、Playground、Creator、Episode 的依赖方向和状态归属；检查循环依赖、跨层私有访问、重复默认值和多重状态来源。
- [ ] 用实际新增或变体接入验证模型、载具配置和动作的扩展成本：遵循 Playground 调参与 Skill 接入流程，复用已具备能力时不依赖核心按资产 ID 增加分支。新增执行能力允许修改所属 SDK 模块，不承诺未来零重构。
- [ ] 核对 NPC 自行运转和 Agent 叙事所需的输入、生成/消失、动作及行为扩展边界；现有合同、已实现能力和未来能力明确区分，不为尚无消费者的功能增加框架。
- [ ] 检查大而多责的模块、重复逻辑、隐藏共享可变状态、时序耦合、魔法常量、过度抽象、无用兼容层、吞错，以及异步失效和资源释放漏洞；每项结论给出具体调用路径和影响，不以文件长度单独判错。
- [ ] 对照相关引擎和依赖的官方文档、实际实现及本项目需求审视资产身份、共享只读资源、独立实例状态、预约归属、取消/复位/销毁语义；记录适用的实践和必要取舍，不因框架形式相似就认定合理。
- [ ] 汇总发现的问题、修复及复验结果、剩余风险和验收缺口；证据绑定最终源码/runtime 身份，测试通过不代替架构审查或人工视觉验收。
