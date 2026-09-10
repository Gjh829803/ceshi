# 可扩展运行时与内容接入实施计划

**Goal:** 一个玩家与两个完整人形 NPC 共用模拟、目标与动作合同，内容包可独立接入并经现有 Creator/Episode 消费。

**Architecture:** 保留 ThreeWorld、execute、OperationLedger、WriteClaim、ThreeNavigation 和现有运动求解器。按阶段迁移实际 owner；内容包由受信构建工具汇合，不加载 manifest 中的代码。

**Tech Stack:** TypeScript、Three 0.185.1、Rapier、Recast/Detour、Playwright、Vitest、pnpm。

**Spec:** [已授权设计](../specs/2026-09-10-extensible-world-and-content-design.md)。本计划在当前独立 worktree 内执行，阶段结束汇报后继续；不自动合并。

## 全局约束

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

- [ ] 先测试重复 ID、依赖缺失/循环、精确闭包、确定性输出、未授权包不可被策略扩权。
- [ ] 将 Source101 模型、交互动作 binding、汽车/摩托/固定翼配置登记为独立包。manifest 只引用受信定义与静态路径，不运行命令。
- [ ] 生成目录、Agent 索引、例子 topic/打包清单；迁移条目从聚合源移出，未迁移条目只读旧目录。编译器自动展开已准入的精确依赖。
- [ ] pickup descriptor/binding 引用真实原因码、tuning 和 clip roles；测试实际拒绝结果。Playground 与 SDK 引用同一规范默认值。
- [ ] 按包检查报告分列 registered/policy-allowed/compiled/behavior-verified/visual-reviewed/released；证据键包含闭包/runtime/配置/检查器/输入。
- [ ] 通过实际 discovery、示例编译和本地浏览器/Episode 验证；阶段提交与验证记录。

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

- [ ] 测试 3 Actor 独立输入/mixer/controller，despawn 不销毁共享世界，旧 generation 异步完成只释放 lease。
- [ ] 完整人物按 actorId 绑定；输入目标和相机目标分开。复用导航生成意图，碰撞几何生成 navmesh，保留失效/受阻原因与确定性让行。
- [ ] 相同内容共享只读资源，独立骨架/mixer/可变材质；部分加载失败和最后 lease 释放可核对。
- [ ] 三角色浏览器导航、玩家骑乘、本地 Episode；3/10 活动角色首次性能和 50 次生命周期测试；阶段提交与验证记录。

## R3：共享目标与资源

文件：现有 MapInteraction/action-schema/action-system、world/control-support、对应 Host/Episode 消费者。

- [ ] 同 tick 两请求争物/座恰一成功；先写原子全有或全无预约、目标移动/移除、reset/despawn 测试。
- [ ] 世界持有 target/slot generation 与 reservation；grip/sit 转成持续 heldBy/occupiedBy。物理实体及视觉引用同一个目标。
- [ ] 样例真实争用、搬运、释放、低顶退出、取消；阶段提交与验证记录。

## R4：持续任务与事件

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
