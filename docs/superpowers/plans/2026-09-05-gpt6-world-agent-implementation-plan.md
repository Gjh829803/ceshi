# GPT-6 世界 Agent 重构实施计划

- 状态：Design reviewed；实现工作包尚未开始。
- 分支：`codex/gpt6-world-agent-refactor`。
- 基线：`50a1e14a8f790da8e17c5fd935a3a49817f20e75`。
- 上位规格：[主规格](../specs/2026-09-05-gpt6-controllable-world-agent-design.md)；[云端运行规格](../specs/2026-09-05-gpt6-cloud-creator-runtime-design.md)。
- 机器可校验图：[work graph](2026-09-05-gpt6-world-agent-work-graph.json)。以下任务表由该图生成；修改两者需同步。

## 1. 实施原则

用户已授权新分支全面重构并最终跑通云端。本阶段完成设计与基线；不得把这些文档当成功能或部署完成。按依赖推进实现，不因旧 Planner/Builder、四方块、5.6 锁或旧无 NPC 范围再次请求许可。云端平台权限/服务输入真正缺失时应指出具体依赖，继续独立工作。

主 Agent 负责跨包合同、Native 语义集成、Runtime 共享核心、最终集成和发布裁决。只并行已就绪且无共享写资源的工作包；固定当前源码、资源与工具版本，不从原工作区自动同步新改动。

## 2. 工作图总览

| ID | 工作包 | depends_on | blocks | 模式 | Owner |
|---|---|---|---|---|---|
| GW-00 | 需求、基线、主规格与设计审查 | — | GW-01, GW-03 | main-agent-only | integration |
| GW-01 | Native底座语义集成 | GW-00 | GW-02 | main-agent-only | integration |
| GW-02 | 唯一公共合同与能力定义冻结 | GW-01 | GW-04, GW-05, GW-08, GW-11, GW-12 | main-agent-only | contracts |
| GW-03 | LWDP Creator运行配置与基础工具探针 | GW-00 | GW-06, GW-15 | parallel-safe | cloud-platform |
| GW-04 | 资产与动作目录去Block耦合 | GW-02 | GW-06, GW-10, GW-12 | parallel-safe | assets |
| GW-05 | 自由低模实体注册与几何准入 | GW-02 | GW-06, GW-08, GW-09, GW-12 | parallel-safe | geometry |
| GW-06 | 云端Creator插件与真实反馈工具 | GW-03, GW-04, GW-05 | GW-07, GW-12 | parallel-safe | creator-tools |
| GW-07 | 单GPT6 Creator编排与简化Skill | GW-06 | GW-14 | parallel-safe | creator-agent |
| GW-08 | 保持玩家状态的增量结构事务 | GW-02, GW-05 | GW-10, GW-11, GW-12, GW-13 | sequential | runtime-mutations |
| GW-09 | Native导航与路径查询 | GW-05 | GW-10 | parallel-safe | navigation |
| GW-10 | NPC持续行为与统一tick调度 | GW-08, GW-09, GW-04 | GW-11, GW-13, GW-14 | sequential | npc-runtime |
| GW-11 | 轻量LLM控制界面与能力扩展 | GW-02, GW-08, GW-10 | GW-14 | parallel-safe | world-control |
| GW-12 | 外观身份与实时视频条件桥 | GW-02, GW-04, GW-05, GW-08, GW-06 | GW-14 | parallel-safe | appearance-video |
| GW-13 | 保存恢复与创作基线再编辑 | GW-08, GW-10 | GW-14 | sequential | persistence |
| GW-14 | 构图、探索、控制与性能验收集 | GW-07, GW-10, GW-11, GW-12, GW-13 | GW-15 | parallel-safe | evaluation |
| GW-15 | 云端完整流程与视频联调 | GW-03, GW-14 | GW-16 | main-agent-only | integration |
| GW-16 | 产品默认切换与旧编排收口 | GW-15 | — | main-agent-only | integration |

## 3. 分包合同、排他所有权与完成证据

### GW-00 — 需求、基线、主规格与设计审查

**独立交付物：** 冻结可实施设计、原始需求、来源清单与无环依赖图；不声称功能交付

- 输入/集成合同：用户需求 R01-R10；Owner map / 切换边界。
- 独占文件范围：`docs/superpowers/specs/2026-09-05-gpt6-*`；`docs/superpowers/plans/2026-09-05-gpt6-*`；`docs/reviews/2026-09-05-gpt6-*`；`AGENTS.md`；`docs/18-refactor-progress-and-backlog.md`。
- 进程/制品/共享资源：独立worktree与设计commit。
- 依赖：无；阻塞：GW-01, GW-03。
- 模式：`main-agent-only`；Owner：`integration`。
- 完成证据：Markdown链接与diff检查；DAG无环/反向blocks/完整字段验证；独立Mode A审查并修订。

### GW-01 — Native底座语义集成

**独立交付物：** 从761d854按能力集成BNA底座；保留50a1e14a主体/动作/kart/3C行为

- 输入/集成合同：固定donor Native Admission/Package/Runtime ports。
- 独占文件范围：`packages/native-babylon/**`；`packages/scene-authoring-contracts/**`；`packages/runtime-contracts/**`；`packages/world-identity/**`；`packages/world-package/**`；`scripts/native-scene/**`；`packages/runtime-host/**`；`packages/runtime-babylon/**`。
- 进程/制品/共享资源：仅本工作区集成分支；不切换原工作区。
- 依赖：GW-00；阻塞：GW-02。
- 模式：`main-agent-only`；Owner：`integration`。
- 完成证据：base/incoming/target语义映射；受影响Native/3C/资产回归；typecheck及相关完整门禁；不导入无关Studio/NPC声明。

### GW-02 — 唯一公共合同与能力定义冻结

**独立交付物：** 明确类型/字段/错误/状态机与single owner；定义不可变输入输出与示例

- 输入/集成合同：Entity注册/命令/能力schema/结构revision/appearance与工具信封；provider-neutral facade与内部Runtime端口。
- 独占文件范围：`packages/gameplay-contracts/**`；`packages/runtime-contracts/**`；`packages/scene-authoring-contracts/**`；`packages/native-babylon/src/module.ts`；`packages/world-package/src/package-types.ts`。
- 进程/制品/共享资源：共享接口编辑权；后续owner只消费已冻结接口。
- 依赖：GW-01；阻塞：GW-04, GW-05, GW-08, GW-11, GW-12。
- 模式：`main-agent-only`；Owner：`contracts`。
- 完成证据：Schema解析正负例；单位/命名/身份规则审查；capability与handler同源样例；本阶段未实现成员不能进入运行目录。

### GW-03 — LWDP Creator运行配置与基础工具探针

**独立交付物：** 当前部署核实、平台profile契约与可执行镜像；真实GPT6/MCP/view-image/imagegen基础canary

- 输入/集成合同：runtime_profile_ref（拟新增平台字段）；认证lease/净化config/plugin启动/doctor receipt。
- 独占文件范围：`deploy/creator-runtime/**`；`config/creator-runtime-profile.*`；`scripts/cloud/creator-runtime-probe.*`；`external:LWDP generation profile/schema/runner/scheduler`。
- 进程/制品/共享资源：独立creator worker pool与测试namespace；探针独立request_id/S3前缀；不切换生产默认镜像。
- 依赖：GW-00；阻塞：GW-06, GW-15。
- 模式：`parallel-safe`；Owner：`cloud-platform`。
- 完成证据：精确CLI/model/effort/plugin/SDK版本；required MCP真实调用；浏览器+Havok启动；隔离和取消负向测试；平台不支持profile时明确拒绝。

### GW-04 — 资产与动作目录去Block耦合

**独立交付物：** 保留27pack与人形25动作条目的真实可用边界，提供短目录和视觉预览

- 输入/集成合同：source-neutral资产查询/实例化/动作/相机目录。
- 独占文件范围：`scripts/lib/agent-authoring-catalog.ts`；`scripts/agents/agent-subject-setup.ts`；`packages/subject-registry/**`；`scripts/assets/creator-*`；`scripts/verification/verify-creator-assets*`。
- 进程/制品/共享资源：只读资产源；每次preview独立临时目录。
- 依赖：GW-02；阻塞：GW-06, GW-10, GW-12。
- 模式：`parallel-safe`；Owner：`assets`。
- 完成证据：asset/rig/action/socket/motion/camera逐项parity；人形动作实际播放；两个实例动画隔离；静态资产不假装有骨骼动作。

### GW-05 — 自由低模实体注册与几何准入

**独立交付物：** 坡面/网格/桥/台阶和稳定可控实体；无第二份几何DSL

- 输入/集成合同：冻结entity→render/collider/traversal映射；从同一Native Mesh派生贡献。
- 独占文件范围：`packages/native-babylon/src/entity-*`；`packages/native-babylon/src/geometry-*`；`packages/native-babylon/src/host.ts`；`packages/scene-authoring-contracts/src/creator-*`；`scripts/native-scene/creator-*`。
- 进程/制品/共享资源：几何实验独立fixture与端口。
- 依赖：GW-02；阻塞：GW-06, GW-08, GW-09, GW-12。
- 模式：`parallel-safe`；Owner：`geometry`。
- 完成证据：锁定Babylon/Havok几何实验；非对称/退化/镜像/非均匀TRS负例；双候选重放与authority audit；真实支撑与相机碰撞；视觉/collider同源代理偏差与开口保真；程序化新定义发布、两次实例化及独立身份。

### GW-06 — 云端Creator插件与真实反馈工具

**独立交付物：** 新Codex会话能实际发现和调用工具，真实图像可读回同一Agent

- 输入/集成合同：MCP/CLI共享应用服务；preview/playtest/triview/inspect/submit operation receipts。
- 独占文件范围：`plugins/worldkit-creator/**`；`scripts/creator-tools/**`；`scripts/agents/agent-runtime-preview.ts`；`scripts/cli/worldkit.ts`；`scripts/lib/creator-tool-*`。
- 进程/制品/共享资源：同候选串行browser/session；独立资产preview可并行；Host-owned evidence目录。
- 依赖：GW-03, GW-04, GW-05；阻塞：GW-07, GW-12。
- 模式：`parallel-safe`；Owner：`creator-tools`。
- 完成证据：工具schema及实际handler对齐；同一候选preview+动作视频；过期候选/超时/取消/跨任务拒绝；imagegen与读回canary；软件与GPU证据分开；Creator发布新definition工具与轻量控制权限分离。

### GW-07 — 单GPT6 Creator编排与简化Skill

**独立交付物：** 原图直接创作，规划/草图可选；预算内同会话真实反馈修复

- 输入/集成合同：formal=gpt-6-astra/xhigh；自由scratch/不可变candidate/最终submit协议。
- 独占文件范围：`scripts/agents/run-world-creator.*`；`scripts/lib/lwdp-codex-profile.mjs`；`scripts/agents/run-codex-task.mjs`；`scripts/agents/run-lwdp-codex-task.mjs`；`scripts/agents/run-local-codex-task.mjs`；`plugins/worldkit-creator/skills/**`。
- 进程/制品/共享资源：创作会话与候选唯一writer；工具Host写证据。
- 依赖：GW-06；阻塞：GW-14。
- 模式：`parallel-safe`；Owner：`creator-agent`。
- 完成证据：云端request与实际CLI模型一致；无旧固定视角/两图/四方块指令泄漏；至少一次真实预览导致的记录修改；预算结束不伪造完成。

### GW-08 — 保持玩家状态的增量结构事务

**独立交付物：** spawn/despawn/visibility/受支持resize真正原子生效，worldSession/tick/玩家/相机连续

- 输入/集成合同：统一mutation coordinator；prepare/commit/abort与state transfer。
- 独占文件范围：`packages/authoring-edit/**`；`packages/authoring-host/**`；`packages/runtime-host/**`；`packages/runtime-babylon/**`；`packages/gameplay/src/entity-*`。
- 进程/制品/共享资源：RuntimeHost/Babylon共享核心文件排他编辑；候选资源与导航/外观依赖准备。
- 依赖：GW-02, GW-05；阻塞：GW-10, GW-11, GW-12, GW-13。
- 模式：`sequential`；Owner：`runtime-mutations`。
- 完成证据：运行中状态保留；collider同步与移除后无隐形墙；脚下/骑乘/载荷冲突；失败保留旧世界；重复/迟到/并发/取消与cleanup回归；堵唯一出口的拓扑变更门禁；prepared/decision/switch/receipt各切点崩溃注入。

### GW-09 — Native导航与路径查询

**独立交付物：** 真实Native几何可查询目标路径和局部失效；不把图连接当实际通过

- 输入/集成合同：冻结Native geometry→导航候选；按实体包络的路径与path revision。
- 独占文件范围：`packages/traversal/**`；`packages/traversal-recast/**`；`scripts/verification/verify-native-navigation*`。
- 进程/制品/共享资源：路径构建临时资源；不得编辑RuntimeHost核心。
- 依赖：GW-05；阻塞：GW-10。
- 模式：`parallel-safe`；Owner：`navigation`。
- 完成证据：桥上下层分离；坡/梯/窄口/净空；多个主体包络；几何修改后的局部路径失效；真实控制器路径fixture供GW-10消费。

### GW-10 — NPC持续行为与统一tick调度

**独立交付物：** 真实移动/动作/取消/阻塞与玩家接管，无mesh瞬移或多重物理时钟

- 输入/集成合同：moveTo/follow/patrol/stop；多主体意图→一次物理step；可序列化行为生命周期。
- 独占文件范围：`packages/gameplay/src/npc-*`；`packages/runtime-host/**`；`packages/runtime-babylon/**`；`packages/gameplay/src/gameplay-action-effect-registry.ts`。
- 进程/制品/共享资源：在GW-08释放后独占Runtime核心；玩家相机不归NPC。
- 依赖：GW-08, GW-09, GW-04；阻塞：GW-11, GW-13, GW-14。
- 模式：`sequential`；Owner：`npc-runtime`。
- 完成证据：两NPC与玩家同时运行；目标删除/阻路/取消/新目标替换；动作与movement同一tick；30/60/120-like timing；异常清理与snapshot/restore；自定义执行器超时不阻塞玩家；旧generation/迟到意图拒绝。

### GW-11 — 轻量LLM控制界面与能力扩展

**独立交付物：** 轻量模型只选实体和明确操作；未知能力转后台Creator或返回gap

- 输入/集成合同：query/describe/execute/inspect/cancel同源schema；已准入custom action运行接口。
- 独占文件范围：`packages/world-control/**`；`apps/studio/src/world-control-*`；`apps/studio/public/world-control-*`；`scripts/control-agent/**`。
- 进程/制品/共享资源：短请求队列与相关对象缓存；不编辑Runtime核心。
- 依赖：GW-02, GW-08, GW-10；阻塞：GW-14。
- 模式：`parallel-safe`；Owner：`world-control`。
- 完成证据：schema/handler/state同源；指代歧义/过期观察/非法参数；实体版本绑定/幂等；accepted与committed区分；记录模型/检索/执行p50,p95，不凭空承诺延迟。

### GW-12 — 外观身份与实时视频条件桥

**独立交付物：** 物理与颜色解耦，持久视觉状态编译prompt，变化与视频条件一致

- 输入/集成合同：appearanceRef/颜色/真实与外观三视图；revision+tick+RGB+prompt+triview condition bundle。
- 独占文件范围：`packages/appearance/**`；`packages/video-bridge/**`；`scripts/visual/creator-*`；`apps/studio/src/creator-video-*`。
- 进程/制品/共享资源：独立外观资产namespace；视频服务连接由host保有凭据。
- 依赖：GW-02, GW-04, GW-05, GW-08, GW-06；阻塞：GW-14。
- 模式：`parallel-safe`；Owner：`appearance-video`。
- 完成证据：真实三视图方向/尺度/姿态/组装；颜色复用与重要对象可区分；旧revision输出拒绝；极光/对象出现/月球外观场景；实际服务参数未提供时仅adapter-fixture证据。

### GW-13 — 保存恢复与创作基线再编辑

**独立交付物：** 已提交prompt修改可恢复，后续GPT6再创作不静默覆盖用户状态

- 输入/集成合同：base source+结构日志+checkpoint；按稳定ID三方rebase与冲突。
- 独占文件范围：`packages/world-package/**`；`packages/authoring-host/**`；`packages/runtime-host/**`；`scripts/lib/creator-checkpoint-*`。
- 进程/制品/共享资源：在GW-08/GW-10后独占共享持久化/Runtime文件。
- 依赖：GW-08, GW-10；阻塞：GW-14。
- 模式：`sequential`；Owner：`persistence`。
- 完成证据：保存/重载/继续行为；删除/新建/缩放后身份稳定；结构与运行态分离；源变化冲突检测；锁定环境replay证据；resolved operation不重复解释相对放置；checkpoint与两journal/事件/幂等水位一致。

### GW-14 — 构图、探索、控制与性能验收集

**独立交付物：** 校准首帧容差，180–300秒探索，实时控制/性能/失败验证

- 输入/集成合同：R01-R10到证据矩阵；固定图与预算的A/B/C benchmark。
- 独占文件范围：`scripts/verification/creator-*`；`scripts/testing/creator-*`；`config/creator-validation-*`；`docs/evaluations/gpt6-creator/**`。
- 进程/制品/共享资源：独立case目录/浏览器端口；不改运行实现；评测原图不提交大媒体到Git。
- 依赖：GW-07, GW-10, GW-11, GW-12, GW-13；阻塞：GW-15。
- 模式：`parallel-safe`；Owner：`evaluation`。
- 完成证据：原图/侧后视盲评；真实玩家轨迹与目标覆盖；目标设备帧时间/输入延迟/内存；跨case/多实例/取消故障；未通过关键门禁不可被总分覆盖。

### GW-15 — 云端完整流程与视频联调

**独立交付物：** 云端真实创建/看图修复/试玩/实时编辑/三视图/S3/Studio闭环，再实际视频体验验收

- 输入/集成合同：固定runtime/image/plugin/model与正式产物；Studio可玩入口和实际视频服务。
- 独占文件范围：`scripts/cloud/creator-e2e-*`；`docs/evaluations/gpt6-creator/cloud/**`；`config/creator-release-candidate.*`。
- 进程/制品/共享资源：独立云端request/attempt/S3前缀；不替换生产默认直到证据通过。
- 依赖：GW-03, GW-14；阻塞：GW-16。
- 模式：`main-agent-only`；Owner：`integration`。
- 完成证据：真实GPT6工具调用证据；180–300秒云端探索；守卫全操作且玩家相机不重置；断连/取消/素材缺失/浏览器退出恢复；真实视频延迟与身份一致；mock不算GO。

### GW-16 — 产品默认切换与旧编排收口

**独立交付物：** 通过门禁后切换默认，删除被替代的强制编排/旧模型文案/永久切换旁路

- 输入/集成合同：新建世界唯一Creator路由；历史制品按source kind读取。
- 独占文件范围：`apps/studio/**`；`scripts/agents/run-spatial-world-agent.sh`；`config/cloud-scene-production.json`；`README.md`；`AGENTS.md`；`docs/18-refactor-progress-and-backlog.md`；`.codex/skills/worldkit-*`。
- 进程/制品/共享资源：生产默认配置单一writer；部署digest/回滚release身份。
- 依赖：GW-15；阻塞：无。
- 模式：`main-agent-only`；Owner：`integration`。
- 完成证据：完整受影响repo门禁；Studio/构建/独立lane/真实Browser验证；历史case读取不混合source；部署digest复核；最终独立审查与产品GO记录。

## 4. 并发边界与接口交接

- 第一波：GW-01 与 GW-03 可并行；平台探针不修改 Native 集成文件。
- GW-02 完成后：GW-04、GW-05 可并行。GW-03 的 profile/doctor 初始合同可先验证，完整 Creator canary 等待 GW-06。
- GW-05 后：GW-08 与 GW-09 可并行；前者独占 RuntimeHost/Babylon 核心，后者只拥有导航包。
- GW-06 的插件包在交付时向 GW-07 释放 `plugins/worldkit-creator/skills/**`；不得两个Agent同时改同一Skill。
- GW-08、GW-10、GW-13 依次拥有 Runtime 共享文件；不能通过分配不同名字来假装并行安全。
- GW-11、GW-12 只消费冻结端口。若需要更改 Runtime 接口，先交给主 Agent，依赖图更新后再继续。
- GW-14 只写验证与证据；发现代码缺陷交回对应Owner，不能在评测中偷偷修Runtime或更新黄金图掩盖失败。
- 所有并行包在交接时提交：源基线、实际diff、输入输出合同、通过命令、未跑项、artifact hash、资源释放情况。成功报告不能代替实际集成门禁。

## 5. 前置实验与通过条件

| 实验 | 执行包 | 要回答的问题 | 不通过时处理 |
|---|---|---|---|
| 当前LWDP profile/账户/CLI审计 | GW-03 | 当前部署能否真运行GPT6和必需MCP/读图/imagegen | 修平台profile或账户可用性；不降级模型 |
| 自由几何与Native包 | GW-01/GW-05 | donor可集成性、真实支撑、相机、geometry contribution闭包 | 修Owner实现；不改回旧四方块作为完成品 |
| 原子collider更新 | GW-08 | resize/spawn/despawn的合法更新、状态迁移与成本 | 能力未通过不进目录；保持旧世界 |
| Native路径与NPC | GW-09/GW-10 | 多层空间、角色净空、多主体一次tick | 修路径或输入调度，不瞬移 |
| 自定义行为 | GW-11 | 受控状态/执行器能否承载新增玩法且可取消恢复 | 未准入行为不暴露给轻量模型 |
| 真视频输入与延迟 | GW-12/GW-15 | RGB+prompt+三视图编码、长时一致性与实际响应 | 记录服务依赖和实测结果；不以mock称视频跑通 |

## 6. 验证命令与证据政策

在每个实现包中先补最窄失败复现/合同验证；最终树执行受影响完整门禁一次。沿用项目现有入口：`pnpm typecheck`、`pnpm test`、`pnpm test:studio`、`pnpm test:independent`、受影响生产build，以及新增Native/Creator/云端能力verifier。

当前仅文档阶段不运行这些Runtime门禁；只验证源快照、设计文件、链接与DAG。不能沿用原工作区旧测试通过作为当前实现证据。

每份正式结果记录：commit/tree、SDK/CLI/plugin/image digest、输入hash、模型/effort、command、exit code、运行环境、artifact/S3索引、证据等级。等级使用 static-read / automated-contract / rendered-visual / manual-interaction。视频联调与云端真实模型调用另标记 actual-provider。

## 7. 云端完成的明确含义

以下全部通过才可称为“云端Codex流程跑通”：

1. 实际GPT6 xhigh新会话加载必要插件并真实调用，而非仅写JSON或doctor自报。
2. 同一会话使用资产/动作、创建世界、查看真实截图并完成有记录的修复。
3. 完成180–300秒探索，首帧与原图评审通过，三视图闭包正确。
4. 轻量控制Agent执行守卫生命周期与NPC行为，玩家/相机/tick没有重置。
5. 可信Host独立重放、S3发布和Studio游玩通过。
6. 实际视频服务使用正确条件包，验证运行中视觉/结构变化同步和长时体验。
7. 必需负向场景、资源清理和最终独立审查通过。

只完成前五项时，最多报告“云端世界创作与控制闭环通过，视频联调未完成”；不得省略范围。

## 8. 回滚与历史数据

实现均留在新分支。切换前旧生产默认不变；候选用独立profile/release与case前缀。正式切换失败时回滚发布配置到上一已验证release，不回滚用户世界内已提交的状态，也不改写既有S3历史。

Native与Canonical是每个制品显式的source kind；历史读取按其合同处理，不把运行fallback作为新Creator能力。删除的是被替代编排和错误默认，不是用户素材、历史case或原分支。
