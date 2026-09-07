# Three Episode 小批验证后的异常路径复查

结论：仍有三个阻塞自动生产的问题。本轮没有修改实现、启动 GPU 或提交生成任务。上一轮白膜小尾批成功不能证明后处理失败、运行中取消和控制器崩溃恢复正确。

## 1. 审查元数据

- 模式 B：针对未提交的 Three Episode 批处理变更做异常路径复查，不是整仓无缺陷证明。
- 分支：`codex/three-episode-agent-production`；diff 基线及 HEAD：`864c2dd28d68d95b1c60f9009ebedd8c4898951e`。下文代码引用指该 HEAD 上的当前工作树，包含未提交文件。
- 环境：macOS，Node `v24.3.0`。本次不作引擎、物理或浏览器 API 语义断言。
- 输入 SHA-256：`workflow.ts` = `aee6efa6b07d7a07f0b10281bbb506632d5348218124fcbfe32c36d6b8668890`；`batch-controller.mjs` = `741060a133b240464d876e52594993ecca8c1eb4365b597b796a895fc87a5d4f`；`batch-state.mjs` = `43a9c29c4ae8f73e53f2411ed2c3ca65217fe18626ba291b62ce490745e17319`。
- 依据：`docs/superpowers/specs/2026-09-06-three-episode-cost-bounded-scheduling.md`、`docs/superpowers/plans/2026-09-06-three-episode-batch-capture.md`；范围遵循用户要求的禁 H100、100 个或上游结束即发尾批、停在 Seedance 前。

本轮命令与证据：

| 命令/探针 | 结果 | 范围 |
|---|---|---|
| `node --import ./node_modules/tsx/dist/loader.mjs --input-type=module`，临时 workflow 故障夹具 | exit 0，复现 F1 | 使用真实 workflow 和 closeProducer，注入 capture 故障；临时目录已清理 |
| `node --input-type=module`，内存队列与 K8s request 替身 | exit 0，复现 F2、F3 | 使用真实 queue.cancel、reconcileContinuations；没有向集群提交请求 |
| `kubectl -n lwdp get cronjobs three-episode-batch-reconciler three-episode-resource-reconciler -o json` | exit 0，两者 suspend=true | 只读观察，不修改部署 |
| `kubectl get nodeclaims -l karpenter.sh/nodepool=worldkit-episode-graphics -o name` | exit 0，空 | 专用池当时没有 NodeClaim；不推导全账户费用 |
| `git diff --check`、上述三个源文件 SHA-256 前后对比 | exit 0，源文件哈希未变 | 本次只新增报告，保留原有工作树修改 |

未重跑全套单元、类型、浏览器和云端生成门禁：本轮没有实现变更，目标是补齐之前未覆盖的异常组合；本报告不把旧的通过数计成新证据。没有新增 rendered-visual 或 manual-interaction 结论。以下保留夹具条件、调用顺序和实际输出，便于独立重建复现。

## 2. 旧结论复验

- `2026-09-06-three-episode-small-tail-validation.md` 的测试边界已复验：其结论明确止于 `paused-before-visuals`，六段白膜正常路径的成功不覆盖本轮三个故障场景。
- “CPU 回执能跨 TTL 保留”只在已持久化 continuationJob 的路径成立；“创建已发生但确认未落盘”的路径不成立，见 F3。
- 取消 GPU 与停止后续派发的实现存在，但不能概括为已经停止所有运行中的生产工作，见 F2。
- 旧报告“已修复确认的问题”仅描述当时列出的修复，不代表生产就绪。当前应以本报告阻塞结论为准。没有把旧审计条目未经复验作为新 finding。

## 3. Findings

### [P0] [D3/D4/D5/D6] F1：下游失败被清理异常覆盖，CPU 回执可误报成功

- 证据（automated-contract + static-read）：`104:109:scripts/three-episode/workflow.ts` 在入队前发布 checkpoint；`135:141:scripts/three-episode/workflow.ts` 在 catch 中先关闭 producer、后保存失败状态，并以“status 不是 failed”推导成功。`8:10:scripts/three-episode/batch-state.mjs` 禁止将已成功 producer 改为 failed-final；入队在该文件第 22 行已将 producer 置 succeeded。
- 复现条件：用最小有效 source 和六段 plan 调用真实 `runEpisodeWorkflow`；恢复状态没有 captureTaskId，cohort 中该 case 已 succeeded；注入 capture 抛出 `EPISODE_CAPTURE_OUTPUT_UNAVAILABLE`，batchQueue.terminal 调用真实 closeProducer，publishDirectory 读取落盘状态。没有设置 WORLDKIT_CPU_*，因此不访问真实回执存储。
- 实际输出：`{"probe":"postcapture_failure_from_pre_capture_checkpoint","originalError":"EPISODE_CAPTURE_OUTPUT_UNAVAILABLE","caught":"EPISODE_PRODUCER_TERMINAL","publishedStatus":"running","cpuReceiptStatusBranch":"succeeded"}`。错误被覆盖、发布状态仍 running 是执行结果；succeeded 回执是依据第 141 行对该实测状态的确定性分支推导，本次没有写真实 K8s 回执。
- 期望：下游失败保存原始错误和失败终态；prepare 已结束不能再被下游异常改写。计划要求查询失败不伪造关闭、CPU 后处理按持久身份接续。
- 影响：恢复后下载录制产物或视觉生成发生非 PENDING/UNKNOWN 错误时，原始故障可能丢失；集群执行 finally 时可能形成成功回执，使工作停止恢复而交付不完整。
- 建议：先保存原始失败，再执行不遮蔽主错误的清理；按明确阶段/所有权判断是否能关闭 producer；成功回执只接受明确的成功终态。checkpoint 保存队列身份或通过受约束的队列查询恢复，避免以缺少字段判断 prepare 未完成。
- 复核：已被 Node 临时集成夹具复核确认；尚未修复。

### [P1] [D3/D4/D5] F2：取消 cohort 不停止正在运行的 CPU 后处理

- 证据（automated-contract + static-read）：`14:14:scripts/three-episode/batch-controller.mjs` 仅写 cancelled；`85:100:scripts/three-episode/batch-controller.mjs` 对 active CPU Job 无删除动作，后续仅跳过 cancelled cohort。GPU 专用取消在 `59:60`，不覆盖 CPU。workflow 的视觉生成调用也没有 cohort 取消检查。
- 复现条件：内存 store 中有已完成 capture、continuationJob、全局 cpuSlots 和 active CPU Job；调用真实 queue.cancel，再调用真实 reconcileContinuations；request 替身记录 delete 请求。
- 实际输出：`{"probe":"cancel_running_cpu","cohortCancelled":true,"jobStillActive":true,"deleteCalls":0}`。
- 期望：取消成为各恢复入口尊重的持久终态，并停止该 cohort 继续生产；规格的取消约束不能只阻止新建 GPU。
- 影响：用户取消后 CPU 仍可继续运行、提交新的付费模型调用；已提交远端作业也不会因为 cohort 标记改变而自动停止。
- 建议：取消状态机按所有权终止 CPU Job，等待 Pod 闭合，保留 checkpoint；提交模型调用前检查取消。对已提交 provider job 使用持久 jobId 对账，支持取消则调用对应取消接口，不支持则明确记录并停止继续提交。未知提交不能另起新请求。
- 复核：已被 Node 内存 controller 夹具复核确认；尚未修复。

### [P1] [D3/D4/D5/D6] F3：CPU 创建确认丢失后，成功回执不能阻止 TTL 后重新创建

- 证据（automated-contract + static-read）：`77:78:scripts/three-episode/batch-controller.mjs` 允许 cpuPending 身份写回执；`88:90` 回收槽时只识别 continuationJob；`99:106` 只在 continuationJob 存在时检查终态，否则选择 attempt 1 和最初 checkpoint；`115:116` 的 create 与持久化确认之间存在崩溃窗口。
- 复现条件：真实 controller 使用内存 store，capture 已完成，cpuPending 指向 attempt 1，continuationJob 缺失；模拟 create 实际成功后 controller 未保存确认。worker 已写匹配 cpuPending 的 succeeded 回执；随后 Job 和 Pod 已被 TTL 清除。调用 reconcileContinuations，request 替身记录 create 与命令参数。
- 实际输出：`{"probe":"cpu_succeeded_before_create_ack_and_then_ttl_deleted","createdAgain":true,"checkpoint":"s3://bucket/before-capture"}`。
- 期望：成功回执是吸收终态，不能因短命 Job 对象消失或 create 确认缺失再次执行；计划明确要求覆盖成功回执后 ACK 前崩溃。
- 影响：从旧 checkpoint 重建已经成功的 CPU Job，浪费 CPU，并可能重做视觉工作。复现证明重新创建和旧 checkpoint 选择；没有实际调用模型，不能把重复计费当成已发生事实。
- 建议：统一持久 CPU attempt 权威状态，涵盖 intent、pending、Job UID 和 receipt；先对账有效终态回执，再决定是否创建。cpuPending 和 continuationJob 都应参与身份与槽回收，不能把 Job 名称当作 TTL 前后唯一生命周期凭据。
- 复核：已被 Node 内存 controller 夹具复核确认；尚未修复。

## 4. 维度覆盖表

| 维度 | 状态与范围 |
|---|---|
| D1 定位与需求边界 | 已查批处理约束：禁 H100、尾批、pre-Seedance；未做整仓能力审计（模式 B） |
| D2 Schema 与 AI-friendly | 已查 producer/capture/CPU receipt 状态及 checkpoint 身份字段，不涉及公共引擎 schema |
| D3 承诺与事实 | 已查计划、前次小批报告与失败/取消/恢复消费者，F1–F3 |
| D4 单一权威状态 | 已查 checkpoint、case terminal、cpuPending、continuationJob、receipt 与 K8s 生命周期，F1–F3 |
| D5 工程与对抗性 | 已查 throwing cleanup、运行中取消、create 确认丢失与 TTL 组合，F1–F3 |
| D6 证据分层 | 已查，区分本地真实函数执行、请求替身、静态分支和只读集群状态；未新增视觉或完整生产证据 |

建议顺序：先修 F1 的失败与回执语义，再修 F2/F3，补三条对抗回归后才恢复自动调度。仍需有界的后处理故障/恢复测试；没有必要为这些控制流回归再启动 GPU。
