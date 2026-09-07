# Three Episode 异常路径修复验证 — r13

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

状态：已修复复查报告中的 F1–F3，完成本地、浏览器工具与 Linux 镜像内回归；控制器已更新且保持暂停。没有启动新的录制、样式生成或 Seedance 任务。本报告不声明整体生产无缺陷，也不把替身请求测试描述成云端故障实测。

## 修复和权威边界

对应 `2026-09-06-three-episode-post-smoke-review.md`：

- F1：workflow 先落盘原始失败，再尝试 producer 清理。清理仅能关闭真实队列中仍 pending 的 producer，不能从 checkpoint 缺字段推断其状态。清理/发布再失败不遮蔽原错误。CPU 成功只接受明确的 prepared 或 paused-before-visuals 状态和已完成的 checkpoint 发布；Job Complete 但应用回执缺失记为 unknown。
- F2：cohort 持久取消阻止新的模型提交；controller 删除正在运行的本轮 CPU Job，等待活跃 Pod 消失后释放槽位。取消与 create 并发时，晚到 Job 也被删除。清理不受 global.paused 影响；CronJob 自身 suspend 时，需要显式运行 reconcile 才会执行清理。
- F2 远端闭合：Codex/T2I 提交前把 pipeline/requestId 持久到 cohort，收到 jobId 后补记；控制器按精确 ID 查询和取消。每轮最多三项取消、每次 HTTP 五秒时限，未知结果保持原身份重查。已完成历史留在本地/S3 journal，队列只保留未闭合请求和最近取消结果，不随完成任务数无限增长。恢复入口也使用带取消检查的 workflow client。
- F3：cpuPending 与已确认 continuationJob 都参与回执身份、槽位回收和恢复。成功回执阻止 TTL 后重复 create；失败回执允许的下一次尝试从最新 checkpoint 开始，总次数仍最多两次。旧 attempt 回执不能覆盖新 attempt；创建前重读最新回执，防止旧快照在查询期间过期。

没有改人物、物理、相机或固定步进语义；没有改变 100 个或上游结束即发尾批、单卡 L4、禁止 H100 和 pre-Seedance 边界。

## 对抗测试

先加失败复现，再改实现：

- `node --test --test-name-pattern 'cancel stops active CPU|success written against pending' scripts/three-episode/batch-integration.test.mjs`：修复前 exit 1，两个预期断言失败；修复后纳入完整 Node gate 通过。
- `pnpm exec vitest run scripts/three-episode/workflow.test.ts`：最初夹具遇到 macOS 临时路径 realpath 差异；修正夹具后，在实现未改时 exit 1，确认原始错误被 EPISODE_PRODUCER_TERMINAL 覆盖。修复后四种场景通过：下游失败、producer cleanup 失败、发布失败、暂时错误可恢复回执。
- 追加覆盖：暂停时取消、残存活跃 Pod、cancel/create 竞态、slot/intent 之间取消、成功回执在 Job lookup 期间到达、pending attempt 失败接续、旧回执拒绝、远端精确取消重试，以及 150 个已完成远端请求不使队列历史膨胀。

## 最终验证

环境：macOS Node v24.3.0；Linux amd64 构建镜像额外执行 controller 回归。HEAD 基线 `864c2dd28d68d95b1c60f9009ebedd8c4898951e`，分支 `codex/three-episode-agent-production`，本轮代码尚未提交。精确源码哈希保存在证据目录 `source-hashes.json`。

| 命令 | 结果 | 证据范围 |
|---|---|---|
| `node --test scripts/three-episode/*.test.mjs scripts/lib/cloud-production-run.test.mjs` | exit 0，88 tests | 队列、资源、云端请求替身、视觉流程契约 |
| `pnpm test:cloud-orchestration` | exit 0，119 tests | 云编排、调度和凭证引用分离；相关输入在最后一次通过后未改变 |
| `pnpm exec vitest run scripts/three-episode` | exit 0，35 tests / 5 files | workflow、录制接续与真实 stdio MCP/Chromium 观察、点选、计划提交 |
| `pnpm typecheck` | exit 0 | 类型检查 |
| `docker build --platform linux/amd64 ...` / `docker push ...` | exit 0 | 新镜像构建与注册表发布 |
| `docker run --rm --platform linux/amd64 --entrypoint node <r13 image> --test scripts/three-episode/batch-integration.test.mjs` | exit 0，25 tests | 实际交付镜像内的 controller 回归，不是远端 API 实测 |
| 镜像/冻结源码与本地六个关键实现文件逐项 SHA-256 比较 | exit 0，完全一致 | 防止发布旧实现；文档后续更新不改变代码 |
| `git diff --check` | exit 0 | 工作树格式检查 |

各环境的通过数存在重复覆盖，不相加成独立测试数。全仓 build、全部引擎测试和付费远端生成没有重跑：修改范围是 Episode 编排控制流，镜像构建与上述相关 gates 已覆盖本轮变更。没有新的视觉质量或大规模吞吐结论。

## 发布及资源状态

- r13 镜像：`829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:01fcdafafcfb53113a67b6b9d2ec6793d43d706af94a1daf4dbfea8665491b89`。
- 新不可变源码：`s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-fixes-20260906-r13/source/release-r13.tar.gz`。
- archive SHA-256：`216e3078bceed1f2f8157c3b5594dd8b7a270ba62bfd844003dbe7a833a5e0c5`；大小 248344644 bytes；S3 HEAD 大小已核对。
- 独立 release 目录：`/fsx/pipeline/worldkit-three-episode-experiments/gvs2-pre-seedance-20260905/release-r13`。r11 目录和 archive 未覆盖。
- 胶囊准备了 `gvs2-fixes-20260906-r13` 的配置，状态为 frozen-not-submitted；没有登记/启动该 cohort。
- `three-episode-batch-reconciler` 和 `three-episode-resource-reconciler` 都已更新到 r13，且 suspend=true。更新使用 JSON patch 的 suspend=true 前置断言，不启用自动生产。
- 仅 CPU batch reconciler 新增 `lwdp-generation-token` 的 Secret 引用，用于取消已提交模型任务；resource reconciler 与 GPU worker 没有新增模型凭证。
- 最后只读检查：全局 paused=true、active=null、cpuSlots=[]；专用 GPU 池无 NodeClaim。本轮没有创建云端生产 Job 或 GPU。

证据目录：`.codex-tmp/three-episode-fixes-r13/`，包含各门禁日志、release-receipt.json、deployment.json、source-hashes.json 和 final-verification.json。

## 保留限制

已发出的 Gemini 同步请求没有当前实现可用的撤回接口；取消后标记 cancellation-unconfirmed/attentionRequired，阻止后续工作，不宣称请求已停止或费用归零。旧版本已经提交且未登记到新队列的远端请求，需要从其原 journal 按精确 ID 对账；本轮不会扫描或取消无归属任务。

新工作必须同时使用 r13 镜像和匹配 archive；旧任务冻结身份不被静默替换。自动生产仍暂停，本轮证据不替代后续小规模完整视觉流程和批量吞吐验证。
