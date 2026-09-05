# GPT-6 世界 Agent 设计审查

## 1. 审查元数据

- 模式：A（设计规格）；D1 / D2 / D3 / D6，另检查 Runtime 单一权威、调度、生命周期。
- 对象：[主规格](../superpowers/specs/2026-09-05-gpt6-controllable-world-agent-design.md)、[云端规格](../superpowers/specs/2026-09-05-gpt6-cloud-creator-runtime-design.md)、[实施图](../superpowers/plans/2026-09-05-gpt6-world-agent-implementation-plan.md)。
- 分支：`codex/gpt6-world-agent-refactor`；继承基线：`50a1e14a8f790da8e17c5fd935a3a49817f20e75`。
- 用户权威：已明确授权全面重构；原图还原、可玩低模、3–5 分钟探索、可复用素材、实时命令及云端插件是本次范围。旧无 NPC / 四方块 / Planner 固定流程不作为拒绝新设计的理由。
- 独立审查：`design_authoring_geometry` 负责创作/几何/资产/验收；`design_world_contract` 负责实体/命令/NPC/热修改/恢复；主 Agent 整合并核对云端工具和依赖图。
- 证据层级：`static-read`；另有文档/JSON/DAG 检查，不属于 Runtime automated-contract。
- 引擎版本研究基线：Babylon 9.23.0 / Havok 1.3.14；自由几何、collider 重建、热更新的引擎行为尚待工作包实验，本审查未宣称已证明。
- 实际设计检查命令：`git diff --check`；本地 Python 链接、JSON、DAG、反向 blocks、任务表与源码快照一致性检查。最终输出见 [verification](../superpowers/plans/2026-09-05-gpt6-world-agent-design-verification.json)。
- 未跑：typecheck、完整测试、Browser Runtime、模型请求、云端部署、视频联调；本次没有修改实现代码，不把继承基线的旧测试报告算成新能力证据。

## 2. 旧结论复验

| 结论 | 处置 |
|---|---|
| Codex 与真 Runtime 在不同环境，精简任务不能自行执行真实 preview | 已按当前 `run-spatial-world-agent.sh`、generic 客户端、Worker Dockerfile 复验；设计改为专用 Creator profile |
| 实时命令仅四类，authoring publication 仍 full-reload | 已按 Gameplay union、receipt/recovery 源码复验；新增操作/NPC/增量发布明确列为未实现 |
| 当前素材目录 27 pack、人形 25 动作 | 已按基线 catalog 复验；条目数不证明所有运行行为通过，GW-04 要逐项检查 |
| main Native 能力可作复用底座 | 仅对固定 donor 源码作候选判断，未整分支 merge，未声称当前分支已有全部 donor 能力 |
| 旧 LWDP runner 复制账号环境/缺插件初始化 | 只发现 7 月源码快照；明确不可当作现网事实，GW-03 必须核实部署版本 |

## 3. Findings 与修订复核

### [P1][D1/D2] 可见几何与 Collider 来源不闭合 — 已修订并复核关闭

- 证据（static-read）：初稿 §4.1 同时接收 `visualRoot` 与独立 collider Mesh，缺同源约束。
- 期望：显示、碰撞和通行不能各自描述不同台阶/地形；尺寸变化有单一 transform Owner。
- 影响：隐藏坡面可以使通过性测试成功，实际画面却悬空或出现隐形墙。
- 修订：§4.1 定义 `visual-geometry / derived-proxy`，Host 同源 derivation hash、entity-local 坐标、支撑/开口/净空误差门禁。
- 复核：`design_authoring_geometry` 二次只读确认设计闭合。运行证据留在 GW-05/GW-08，未提前宣称通过。

### [P1][D1/D2] 新程序化对象缺可重复实例化入口 — 已修订并复核关闭

- 证据（static-read）：初稿只有已放置 Mesh 登记，而 `spawn` 只接受锁定 definition。
- 期望：GPT-6 新造的对象也能被轻量模型再次生成、独立控制并恢复。
- 影响：会迫使实现者重写整个场景或另造未约束 factory。
- 修订：§4.2.1 Creator-only `assets.publish_definition`；隔离 factory 生成 Host 固化局部模板；初始登记/spawn/日志同用 `definitionRef`。同步云端工具表与 GW-05/06/13 验收。
- 复核：独立二次审查确认闭合。

### [P1][D1/D6] 自定义行为的异步 tick 调度缺失 — 已修订并复核关闭

- 证据（static-read）：初稿同时要求每 tick 收集全部意图和隔离执行任意行为，未写等待/逾时规则。
- 期望：慢脚本不能阻塞玩家，取消后旧结果不能重新驱动 NPC。
- 影响：主循环等待无限循环，或晚到意图覆盖新行为。
- 修订：§8.2/8.3 明确输入邮箱、observation/effective tick、执行 generation、截止窗口、安全默认、连续超时终止及旧结果拒绝。
- 复核：独立二次审查确认闭合；GW-10 保留无限循环、临界截止和恢复后旧回包的真实门禁。

### [P1][D2/D6] 相对操作日志缺 canonical 解析结果 — 已修订并复核关闭

- 证据（static-read）：初稿保存结构操作，但在提交时解释“玩家前方”。
- 期望：恢复不重新定位、抽样或分配 ID。
- 影响：玩家移动后重载会让树换位置或重复 spawn。
- 修订：§4.3 分离原始 intent 与 resolved operation；保存绝对 transform、最终 ID、锁定资源/参数、选择结果、基准版本和 tick。
- 复核：`design_world_contract` 二次确认闭合；GW-13 检查玩家移动后的保存重载。

### [P1][D1/D6] 热修改未继承探索连通约束 — 已修订并复核关闭

- 证据（static-read）：初稿检查玩家支撑和导航更新，未要求保留必达目标/唯一出口。
- 期望：普通 spawn/resize 不能使已交付世界突然无法探索。
- 影响：新增道具堵住唯一桥口仍可通过原提交条件。
- 修订：§9 将拓扑影响、承诺目标/路线/出口作为准备和提交门禁。显式封路玩法须同事务更新目标及恢复策略，不能偷偷删除验收目标。
- 复核：独立二次确认闭合；GW-08 补相应负向验收。

### [P1][D2/D6] 持久提交、checkpoint 与双 journal 缺一致切点 — 已修订并复核关闭

- 证据（static-read）：初稿有保存/事务目标，但缺崩溃时结构、运行状态、事件和幂等记录的一致边界。
- 期望：已提交变化可恢复，重试不重复执行；旧进程不能继续写新会话。
- 影响：结构与玩家 checkpoint 版本不一致、恢复后重复 spawn 或被迟到 worker 覆盖。
- 修订：§4.3 checkpoint manifest；§9.1 prepared/commit-decided/runtime-applied/committed、双 journal 水位、实际 tick、incarnation fencing 和各切点故障注入。
- 二次发现：durable decision 后的 abort/reprepare 语义有歧义。
- 最终修订：校验/提交预约/依赖保护及 abort/reprepare 都在决议前；决议后仅完成/确认/显式补偿。无法证明保持条件的操作不能进入实时能力。
- 复核：`design_world_contract` 第三次确认设计层闭合；底层调度和持久恢复证明仍由 GW-08/GW-13 完成。

## 4. 维度覆盖与裁决

| 维度 | 覆盖 | 结果 |
|---|---|---|
| D1 目标与范围 | 已查 | R01–R10 覆盖用户要求；平台/视频依赖明确；不以旧范围阻止新设计 |
| D2 Schema / AI-friendly | 已查 | 稳定身份、单位字段、能力同源、命令与Provider边界；具体导出类型由 GW-02 冻结 |
| D3 承诺与事实 | 已查 | 现有/拟实现/历史线索分开；不声称工具、热更新、NPC 或云端部署已完成 |
| D4 实现单一权威 | 实现审查不适用；设计 Owner 已查 | Native/Gameplay/Havok/Camera/tick/appearance/journal Owner 明确，运行证明待实施 |
| D5 实现工程质量 | 本轮不适用 | 未写 Runtime 实现；依赖复用与共享文件 ownership 已列入计划 |
| D6 门禁与证据 | 已查 | 真实预览、控制器探索、工具 canary、状态连续、视频联调、性能分别验收 |

裁决：**详细设计可作为 GW-01 / GW-03 前置实施与后续合同冻结的依据。** 六项 P1 在设计层已修订并经独立复核。引擎、平台、持久化和性能实验仍是明确的实现前置条件；本裁决不是 Runtime、云端或产品 GO。
