# Three Episode 修复与单卡小尾批验证

状态：已修复确认的问题，并完成真实单案例尾批测试及资源回收。自动生产保持暂停。

## 修复对应关系

- CPU 槽释放：持久 CPU 终态回执与短命 Job 对象分离。已确认创建的 Job 消失且没有活跃 Pod 时可释放容量；缺失回执则保留 unknown/attention-required，不伪造成功或盲目重提。
- CPU 失败接续：匹配物理 Job 身份的 attempt/receipt，最多两次尝试；仅有已发布 checkpoint 的可恢复终态故障自动接续，使用最新 checkpoint 和原 provider journals。
- GPU 领取：获得全局槽后，在 cohort CAS 中再次验证 batch hash/就绪状态，先持久化 reserved 再启动；恢复未完成的 reservation，不重复计数或启动已完成任务。
- 资源收尾：三个 reconcile 使用 allSettled，另有独立资源 CronJob。保留未闭合记录；十分钟仍 pending 则标记 attention-required。资源 API 有单次时间预算。
- GPU IO：一个受大小限制的不可变胶囊缓存；GPU 校验远端 manifest 与本地字节，CPU 下载媒体并完成独立 hash 校验。缓存复用收益尚未实测。
- 部署兼容：CPU Host 请求 2 CPU / 4 GiB，上限 4 CPU / 12 GiB；保留普通 CPU 池约束。准入表达式使用 dyn 处理当前 API 类型检查的 Quantity map 字段。新增只选择专用 L4 池的 NVIDIA 插件 DaemonSet，没有滚动重启共享插件。

## 真机测试

- cohort：`gvs2-l4-tail-20260906`。
- 案例：`episode-gvs2-l4-tail-20260906`，复用先前真实 Agent 规划的路线。
- 初始队列：1 个完整 Episode 任务，上游已完成，因此合法发出不足 100 的尾批。
- CPU prepare：`three-episode-l4-smoke-prepare-r11`，在普通 platform CPU 节点执行，入队并持久化检查点后退出。
- GPU Job：`three-gpu-capture-584b3e543448735deab760b1-1`，2026-09-06 13:12:53 北京时间完成。
- GPU：实际 `nvidia-smi` 返回 NVIDIA L4，录制中采样 GPU 利用率 14%、显存 132 MiB。该采样不代表全程平均利用率。
- 实例：`g6.2xlarge` / `i-093f2cd9a2288432e` / us-east-2b，1 卡。
- CPU continuation：`three-post-df106a6c2da4a185078cf0ae8b8b9734-1`，13:15:11 完成。
- 结果：6 段全部 completed；逐个 ffprobe 检查均为 1280×720、24 fps、720 帧、30 秒、无音轨，总计 4320 帧。57 个交付文件通过 S3 manifest/hash 校验。
- 结束边界：`paused-before-visuals`。没有重生整套样式图，没有提交 Seedance；此次不是完整视觉生产吞吐测试。

Spot 在单可用区和多可用区各出现一次 UnfulfillableCapacity。为完成有界测试，临时使用相同 g6.2xlarge 的 On-Demand 容量，没有放宽到 H100 或多卡机型。AWS Pricing API 当时返回 Ohio Linux 按需价 $0.9776/小时；它不是整轮所有费用的账单。

## 资源闭合

- 生产池已恢复为仅 Spot、仅 g6.2xlarge；NodeClass 改为同区域多可用区的 `ray-gpu-ec2-all-baked`。
- 测试实例已确认 `terminated`。
- 根卷 `vol-0d6d186666ca4a52e` 已确认删除。
- 对应 Node/NodeClaim 均已消失，没有替代 GPU 任务或实例。
- 队列资源回执在 13:21:51 记录 `resource-closed`。
- GPU Job 完成后实例曾停留 shutting-down 数分钟。确认产物保存且没有业务 Pod 后发送了幂等 force/skip-OS-shutdown 请求；AWS 返回 PreviousState 和 CurrentState 均为 terminated，不能把该请求描述成实际导致了终止。
- AWS 文档规定算力计费在进入 shutting-down 时停止；磁盘及完整资源闭合仍需独立核验。[AWS 终止排查说明](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesShuttingDown.html)

## 版本与证据

- GPU/CPU smoke 镜像：`829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:455922bb4c71f80775bfb41a0380879c66236cdfaab0b535e119edda3c4ab96e`。
- 冻结测试源码 archive SHA-256：`7f3738abbe1ed2987395e17c079c84f8ad583a37fbdb85d4b2eb6be1db06c661`，release-r11。
- 最终 controller 镜像：`829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:00637f56fea22b296808d765eeaaf056b2a6593b9ef04e316d1e040573855f17`，补充无回执 Job 消失后的容量释放和最终部署模板；GPU 录制代码与 smoke 版相同。两个 CronJob 已更新镜像并继续 suspend。
- 证据目录：`.codex-tmp/three-episode-batch-smoke/`，包括 validation-receipt.json、media-verification.json、resource-closure-final.json、queue/cohort 最终状态、镜像/源码信息、H100 拒绝日志以及实际媒体。
- 云产物：`s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/gvs2-l4-tail-20260906-r11/host`。
- 关键故障回归覆盖 TTL 清理、已知/未知 CPU 终态、最新 checkpoint 重试、过期快照、竞争领取、取消、看门狗和独立回收。

## 保留边界

两个 CronJob 均 suspend=true，全局队列 paused=true。此次未启用自动接收 Creator 交付、未跑 100 案例压测、未重跑样式图生成，也没有给“最便宜机型”作未经基准的结论。后续正式批量启动必须明确登记 cohort，并在校验容量后启用调度。
