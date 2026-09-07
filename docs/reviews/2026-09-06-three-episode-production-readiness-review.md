# Three Episode 生产就绪复查

## 审查元数据

- 模式：B，最近批量录制改动的只读审查；兼看上游入口与生产就绪缺口，不是整个 SDK 的 C 模式全仓审计。
- 分支：`codex/three-episode-agent-production`；HEAD / diff 基线：`864c2dd28d68d95b1c60f9009ebedd8c4898951e`。
- 审查对象包含未提交及未跟踪的新批处理源码，不能用 HEAD 单独重建本次对象。
- 被审源码 SHA-256：`f31993a5b74246b6f76658cde81d905b644f7e12cd1dca3e7b1054dbd7a3858f`。按路径排序，对 Three Episode 的 `.mjs/.ts`、`scripts/cloud/three-episode-*.mjs`、旧 batch manifest 模块和 production JSON 拼接路径/NUL/文件字节计算。
- 实际依赖：Node 24.3.0，Three 0.185.1，Playwright 1.62.1，lodash-es 4.18.1。通过磁盘 package.json 核实；首次用 `require('three/package.json')` 因 exports 限制失败，未将其算作成功验证。
- 权威来源：当前 AGENTS、docs/18、批量调度规格/实施计划、full-dimension-review-protocol、runtime-deep-review-checklist。
- 本次执行：源码/行号检查 exit 0；内存故障探针 `node --input-type=module` exit 0，确认下述三个缺陷；源码 fingerprint 检查 exit 0。
- 本次不修改实现、不提交云 Job、不重跑 GPU。上一轮的 234 项通过只代表当时已有场景，不能覆盖本次新增的故障时序。

资源所有权：cohort 账本持有 prepare/task 状态；全局 ConfigMap 持有 GPU 所有权与 CPU 槽；Kubernetes 持有实际 Job/Pod 生命周期；S3 保存产物；EC2 是实例回收事实来源。本次检查重点是这些所有者之间的转移，不重新评价引擎运动手感或图像风格。

## 旧结论复验

- 满 100 / 封口尾批 / 单卡 profile / 禁 H100 的仓库代码存在，成立；线上未安装新策略、未发布新镜像、未做 L4 真机验证这一限制仍成立。
- “重复提交与恢复已完善”需要收窄：已有测试未覆盖 Job 清理、CPU 阶段失败和队列快照过期，不能认为无人值守闭环已经完成。
- docs/18 中较早的 Babylon-only 全局进度不用于否决已由当前 AGENTS 授权的独立 Three lane，也不用于给本改动背书。

## Findings

### [P1] [D4/D6] Job 对象清理后，CPU 槽位可能永久占满

- 证据（automated-contract）：`batch-controller.mjs:72–74` 只在 `jobEnded(job)` 为真时释放槽。Job 不存在时返回 null，槽不会释放。探针先提交两个 CPU 后处理 Job，再模拟其完成后的对象清理；第三个案例无法提交，结果为 `remainingSlots:2, newJobsForThirdCase:0`。
- 期望：持久化 Job UID、提交/终态回执，并在 Job 被 TTL 清理后仍能安全确认完成；未知创建与已知完成后的消失必须区分。
- 影响：调度器停机超过对象保留期后恢复，整个后处理队列可能持续停住。
- 建议：CPU 槽采用显式状态机和可独立保存的终态证明，不依赖短命 Job 对象作为唯一释放依据。
- 复核：已被 Node 内存故障探针复核确认；未修复。

### [P1] [D3/D4] CPU 后处理只有“已提交”，没有失败接续闭环

- 证据（automated-contract）：`batch-controller.mjs:79,86` 写入 continuationJob 后永远跳过该任务。探针把已提交的 CPU Job 设为 Failed，后续 reconcile 返回 `newAttempts:0, stillMarkedDispatched:true`。
- 期望：从提交、运行到成功/失败独立对账；已确认可重试的终态故障应使用最新有效 checkpoint 有界续跑，未知结果继续对账原尝试。
- 影响：图片、事件或打包途中失败后会停在那里；GPU 录制虽成功，案例仍不能完成。
- 建议：增加 CPU attempt / terminal receipt / retry budget。续跑时核对最新 provider journals，不能机械使用录制前 checkpoint 重交已成功的模型调用。
- 复核：已被 Node 内存故障探针复核确认；未修复。

### [P1] [D4/D5] 领取全局槽前未重新校验任务就绪状态

- 证据（automated-contract）：`batch-controller.mjs:27–33` 先从快照选择批次，再领取全局槽；`reserveTasks` 不检查任务是否已有 receipt。探针在选出批次后、槽 CAS 前把该任务标记 completed，仍得到 `batchAdmitted:true, taskAlreadyComplete:"completed"`。
- 期望：领取时的任务状态/修订号仍与被选批次一致；完成或取消的任务不得重新触发 GPU 启动。
- 影响：另一 worker 完成任务且释放槽的交错时序下，会创建无有效工作可做的 GPU Job，浪费启动和回收成本。现有 receipt 跳过逻辑能避免重录，但避免不了机器空跑。
- 建议：对任务版本与全局执行所有权实施一致的领取协议；同时覆盖全局槽写入后、任务 reservation 写入前崩溃的恢复。
- 复核：已被 Node 内存故障探针复核确认；未修复。

### [P1] [D3/D4] 回收核验会被前面的调度错误阻断

- 证据（static-read）：`batch-cli.mjs:20` 串行 await GPU reconcile、CPU continuations、资源核验。任一前置操作抛错，资源核验不执行。`batch-resources.mjs:27–37` 只记录 pending，没有异常升级或通知；`batch-controller.mjs:62` 还会无条件截断最旧的回收记录到 100 条，可能丢弃未闭合记录。
- 期望：新任务调度错误不影响已有资源的收尾；未闭合资源一直跟踪，超时可见。
- 影响：一个坏输入或 API 故障可能反复阻断回收核验。Karpenter 仍可能自行回收，但流程无法证明资源已经关闭，也不能及时暴露持续费用。
- 建议：回收对账独立执行，给每项 API 设置时间预算，保存分页进度；只归档已闭合记录，对长期 pending 做异常升级。
- 复核：已从当前源码复核确认；未运行真实云故障注入，未修复。

### [P2] [D5] GPU 批处理仍承担大量可移出的文件工作

- 证据（static-read）：`batch-worker.mjs:22–29` 每个案例重新创建目录、下载完整胶囊、校验和解包；`:39–44` 在 GPU 节点重新下载整套已上传产物作校验，随后删除目录。
- 期望：批量复用不只复用机器，还应尽量复用相同的不可变依赖/胶囊，并将可异步完成的文件核验放在 CPU。
- 影响：100 个案例仍可能有相当多的 GPU 等待下载、解包和上传时间；目前没有实测数据判断占比。
- 建议：按胶囊 hash 做有容量上限的缓存；CPU 预取、校验，GPU 只做必要录制。必须保留 hash 闭合，不能为了省 IO 取消校验。
- 复核：已从当前源码复核确认；节省幅度尚未测量。

## 生产缺口与建议顺序

这些是已披露的能力/部署缺口，不冒充本次新发现的运行事故：

1. 新镜像、RBAC、准入策略和 reconciler 尚未上线；Creator 交付事件的自动生产订阅也没有完成。当前仍需登记案例清单并启动 prepare。
2. L4 的实际 Vulkan/驱动兼容、单位成功案例耗时、CPU/内存需求和成本仍未测；不能称当前参数“已证明最节省”。
3. 当前有并发限制与阶段超时，但没有完整的整轮成本累计、跨阶段预算和可操作告警视图。

建议顺序：先修 P1 恢复与领取缺陷 → 独立回收及可见性 → 部署单卡小尾批做端到端验证 → 比较冷启动/连续案例成本 → 再运行正式 100 批次。保留满 100/封口尾批、禁 H100 和 pre-Seedance 边界。

## 维度覆盖表

| 维度 | 覆盖 |
| --- | --- |
| D1 | 补充核对当前用户生产边界；不是全 SDK 能力审计 |
| D2 | 已查任务、批次、回执、Job 身份及状态字段的消费者 |
| D3 | 已对拍实现计划、README、实际消费者和部署限制 |
| D4 | 已查 cohort/全局槽/Kubernetes/S3/EC2 权威转移；发现上述恢复问题 |
| D5 | 已查 CAS、重试、胶囊 IO、失败传播及依赖复用 |
| D6 | 已区分 static-read 与本次内存故障探针；未做新真机/视觉/人工操作验证 |

本次只有审查报告新增；被审实现保持原样。后续修复必须保留本报告对应的失败复现作为回归。

## 后续修复与复验

上述 P1 已落实修复和故障回归；P2 的胶囊缓存与 CPU 媒体验证拆分已实现，收益仍需多案例基准。一次真实单卡 L4 尾批完成了六段录制、CPU 接续、H100 准入拒绝及实例/磁盘回收。详细版本、测试边界和资源证据见 [小尾批验证报告](2026-09-06-three-episode-small-tail-validation.md)。保留上文原始失败证据，不将后续通过覆盖成“此前无缺陷”。
