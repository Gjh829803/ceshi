# Human-ten pre-Seedance 生产启动

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

用户授权：使用 reliable-human-open-ten-20260906 整批生产；使用去 UI、镜头兼容的独立副本；禁止 H100；停在 Seedance 提交前。

## 输入冻结

初次读取页面时仍显示 9 个原交付和 05 失败；后续读取发现页面已被人物动作修复版本更新，全部 10 个已 ready。生产采用这 10 个修复版本，不采用旧 host-verified 的原人物动作。

每例修复输入绑定公开 manualRepair 的 source/world/runtime hash、本地修复 candidate、通过的短时动作回归报告及带 hash 的新三视图。使用专门的 three-episode-repaired-delivery 格式记录来源，不伪造原 Creator 完整交付。05 与 08 的真实浏览器入口预检通过，无运行时报错。原图均保留；UI 仅在派生页面隐藏。

## 执行与故障处理

- r14 准备 Job：`three-human-ten-prepare-r14`；普通 platform CPU 节点，GPU request=0；两个并行规划通道，任务总量 10。
- r14 cohort：`human-ten-production-20260906-r14`。
- r14 image：`sha256:c801587c001c21783fb37a6973b25cbcb5c83ba2cc69650ff7741b1f0042cb06`。
- r14 archive：`d5abb1e63687a67bc2124665a156fe3cc87ed25c72db7f243c915cbfd1558d61`，310130367 bytes。
- 部分请求的旧账号被 LWDP 健康筛选拒绝，错误为 `codex job has no usable Codex accounts after health filtering`，发生在模型执行前；原始失败记录及精确 request/job 身份保留。
- 06 已取得云端 plan.json、planner-tool-evidence.json 并进入录制准备队列；其余任务状态以队列和实时日志为准。
- GPU admission 目前 paused；防止旧失败 cohort 触发过早小尾批。
- r15 接续使用当时健康检查通过的 A/B/C/G 账号，等待 r14 CPU producer 真正终止后接续其已发布检查点，复用成功路线；新 cohort 保留独立失败/恢复身份。仅当全部 10 个重新准备完成，接续入口才解除 GPU 暂停。

两个 reconciler 已启用，当前代码保证仅单卡 g6.2xlarge/L4 Spot；资源回收器独立运行。没有使用 H100，没有提交 Seedance。镜像、胶囊和 API 请求都保留版本身份；不修改已经提交的冻结输入。

## 本地验证

- 新增共享胶囊 caseRuntimeConfig，prepare 与 CPU continuation 都根据实际 source manifest 确定独立路径和 hash，防止病例串用。
- workflow/adapter 9 tests 通过，含修复来源及默认 Creator 两种输入。
- controller/cloud 50 tests 通过，镜像内 batch integration 25 tests 通过。
- 类型检查通过。初次 Host 构造缺 stop flag 被本地门禁拒绝，补齐 `--stop-before-seedance` 后 server dry-run 和实际创建成功。

证据目录：`.codex-tmp/three-episode-human-production-r14/`、`.codex-tmp/three-episode-human-production-r15/`。流程仍在运行中；本文件不是完成报告，不代表视频/样式已生成完成。

## r15 已部署

- 接续 Job：`three-human-ten-recovery-r15`，已 Running，日志确认等待 `three-human-ten-prepare-r14`；两者均普通 platform CPU 节点。
- r15 cohort：`human-ten-production-20260906-r15`，10 个 immutable case IDs 已登记。
- 镜像：`829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:196868c7db366493fcaffbbd2d812536e3e90ecf0014e8e8f1bf5cd95ecd2bc7`。
- 源码 archive SHA-256：`1ab39f09dd59ca448f4f22c34dd721d49747fb9c7f2350a1efaeb11fa408d46f`，310128284 bytes。
- S3：`s3://leap-world-us-east-2/world-model/platform/worldkit-three-episode/human-ten-production-20260906-r15/source/release-r15.tar.gz`。
- Pod 解包完成后校验 archive OK。两个 CronJobs 指向 r15，资源对账继续运行。GPU admission 保持 paused，接续脚本只有在10个任务全部 paused-capture-queue 后解除。
- 恢复先等前轮 Job 真正终态，取消旧 cohort，下载每例已发布 checkpoint，再使用健康账号池接续。故障或未知状态保留失败并不解除 GPU 暂停。没有重写 r14 archive、请求或已完成路线。
- 启动状态快照：`.codex-tmp/three-episode-human-production-r15/start-status.json`。生成与录制尚未完成；Seedance 提交计数仍为0。

## 2026-09-07 07:16 九例放行与两小时监控

用户明确要求已有9例立即运行，10号不得阻塞。实际状态为9个capture-ready、10号failed-final、上游全部终态。已解除全局paused，并实际提交录制Job `three-gpu-capture-a1a2389a82b4ef3112643577-2`（9例/54段）。本地prepare-recovery改为复用upstreamComplete条件，31项队列/集成测试和类型检查通过；当前运行Job沿用已冻结r15源码，不篡改其archive。

Spot连续5次以上UnfulfillableCapacity后，专用池临时切到相同g6.2xlarge按需容量，GPU限额仍1。证据为 `two-hour-capacity-override.json`。录制后须恢复Spot，核验实例/卷资源闭合。目标时间为2026-09-07 09:16 Asia/Shanghai，属于用户时限目标，未承诺尚未测得的完成时间。

已开启本任务每5分钟heartbeat监控（automation `seedance`），仅实质进展/阻塞通知；截止未完成必须如实报告。禁止H100和Seedance提交。GPU、CPU和provider状态以实时回执为准，不以本文件视作完成证明。

## 2026-09-07 07:25 起监控处置

L4 已实际录制，01/02/04 的六段分别完成，其他案例继续（以实时回执为准）。实例 `i-052471882b1e46acd`、根卷 `vol-0357966fb1ad655e2` 已记录用于收尾核验。

01 CPU 样式规划请求 `gen_869cbc60faf39558` 在模型执行前因账号健康筛选失败，已精确查询终态。原 A/B/G 额度不足，C 登录失效；没有修改健康阈值或登录状态。平台健康池另有可用账号，因此增加显式 CPU routing（codex09/codex10/codex18 三个已验证可用账号），仅修改 CPU attempt 的本地配置，不改冻结 GPU 输入或已有 provider 请求。

新增 controller r16：`sha256:b9dbc7b59cee9e9bdba83e35b71b282e6fe8fa6c34bb219f132a2f875dc94611`。27 项 controller/routing 测试及类型检查通过。global.cpuPaused 可独立暂停后处理而不打断录制；切换完成后已解除 CPU 暂停并恢复主 reconciler CronJob。01 仅在旧 provider 精确 failed 验证后授权一次从最新 checkpoint 的第二 CPU attempt。未知请求不重发，成功白膜不重录。

## 2026-09-07 07:39 轮次：逐段验收、06兼容补录

逐段S3摘要核验识别出重要状态区别：worker的capture-succeeded表示产物发布返回，06实际capture-summary为failed、六段0帧，原因为EPISODE_MOVEMENT_UNSUPPORTED，不能当作有效视频。01/02/03/04/07当时六段各720帧通过。06旧条目已加captureValidation失败并移除旧continuation，原记录保留。

06实际使用hash绑定的arborist.ground-with-steps自定义地面移动，通过SDK desiredDirectionWorldXYZ消费方向，其Space事件临时切到ground执行跳跃。新增私有capture adapter仅接纳已核对的main.ts及world/movement.ts哈希，保留custom语义，未知/改动的extension仍拒绝。浏览器真实验证走动1.65米、跳跃isGrounded=false且向上速度>0、reset恢复原movement，无浏览器或世界错误。原场景、计划和SDK物理不改。

补录胶囊：release-arborist-r17，SHA-256 `6e131a1e3d4bdab7b1d090adcd9468bd40aa6bb2c4eec15cdddf1ff8acc0c4d3`；新队列任务 `capture-a26ae6558eebd822cd83106b08e959c488aac8e4`。沿用原r15 GPU镜像，执行新冻结胶囊中的capture代码，以便符合条件时同卡接续。只补06。

后处理发现codex10平台健康信息滞后：实际图像任务返回usage limit。没有降低阈值或重试同一受限账号；后续CPU routing已去掉codex10，保留实际有图像成功回执的codex09/codex18。01等已有在途图片请求继续等待终态，成功图片保留，不能通过换账号重复未知请求。04确认为gen_cc6adfa0f3e728a2 failed且选中codex10后，已允许从检查点第二次CPU执行。

controller r17支持显式maximumCpuSlots，范围1–4，默认2；本批为用户两小时时限提升到4，仍不增加GPU数量。Episode69项、补充workflow8项、controller27项及类型检查通过；四CPU通道受集群实际容量限制。所有能力/回执以实际执行结果为准，09:16是目标而非完成承诺。

## 2026-09-07 07:55–08:05 监控

S3逐段核验：08六段通过；06适配补录五段通过，segment-04在345帧因ROUTE_BACKTRACK_BLOCKED失败。现有有效白膜53段/54段，8例完整；原worker的发布成功回执不等价于所有segment通过。06 CPU接续已进入route-repair，精确模型Job `gen_5a91986c670bfbf9`，SDK工具锁定仅修segment-04，已过五段不改。

L4原Job已drained，NodePool已恢复Spot。实例 `i-052471882b1e46acd` 实际terminated，卷 `vol-0357966fb1ad655e2` 返回InvalidVolume.NotFound，Node和NodeClaim均已消失；回收器于00:03:01 UTC写resource-closed。以后06一段补录需重新合法申请单卡；无暖卡占用。

额度/容量仍影响样式：01完成6张首帧、4张明确usage-limit失败；02完成7张、3张明确usage-limit失败，旧在途请求已全部终态才允许接续。01因第一次纯账号健康拒绝已经消耗一次CPU attempt，显式授权最多第三次；默认自动上限仍2，operator上限硬限制3，新增controller r18和28项回归/类型检查通过。07确认模型返回Selected model is at capacity，允许有界第二次，模型仍GPT-6，不换模型。

健康池的quota展示与实时usage限制存在滞后，不绕过限制、不修改平台health。未来CPU按最新官方可用池且较高quota的六个账号分流（20/04/12/13/11/06），既有任务不改payload。已成功的图片、录像和请求日志均保留，失败部分使用新明确attempt恢复；未知提交不重发。此时仍未有完整pre-Seedance case闭合，不能报告整体完成。

## 连接中断与09:02恢复核对

本地kubectl在08:09发生TLS超时，随后出现DNS解析失败，监控操作未能持续完成；恢复时当前时钟已09:02。02第二次CPU接续的尝试在读取日志时失败，尚未写入retryable授权，不能把上文计划视作已执行。后续调用同时限制kubectl请求8秒和外层进程20–25秒。

09:02队列：06 Agent已完成单段新路线，但补录Job在Spot无货下两次各25分钟调度超时，未产生新帧。01/02/03等图像任务失败，04仍在appearance-lock和style-image阶段，其余多例style-planning失败。已告知用户整批无法在09:16完成，保持成功产物和原请求身份。

06最终尾批新cohort `human-ten-06-final-repair-r19`，仅沿用Agent修复的segment-04，旧失败任务capture-e8be4dccd0e249bd77acfde8d3ce2ac475452a05归档。新批次gpu-capture-43cd9a288b9fd61ed8195dd0已实际提交，再次临时使用单张g6.2xlarge按需容量。结束后必须恢复Spot并核验新实例/卷回收。旧实例i-052471882b1e46acd已完全闭合，不得混淆两次生命周期。

进一步实际CLI错误证明平台health中的100%显示不足以证明当前可用：05对应codex06返回usage limit；08对应codex20返回usage limit至9月10日。没有修改平台阈值、购买额度、重置账号或绕过限制。后续不得仅凭health的quota字段宣称额度问题解决。

## 09:15 已录制案例独立推进

06最终尾批S3 capture-summary已核验completed：segment-04为720帧、30秒，视频SHA256 `09f2ed4ce25c1961e39616945b38bf53d67729afa28f0749c748bc02b8a0ed0d`。与之前53段合计54/54有效白膜。CPU已合并并进入style-planning，无需再录。证据在 `.codex-tmp/three-episode-arborist-r17/final-tail/capture-summary.json`。

04新图片Job `gen_84e0cccf0a93362d` 与 `gen_cec5e72887654e9a` 均成功；前者实际使用codex09。因此将后续CPU路由恢复为09/18双账号池，不修改正在运行的请求。02/05/08/09明确终态失败后，已各授权一次有界第二次CPU接续，保留成功图像与录像。09:14实际槽位为04、02第二次、05第二次、09第二次，08排队，最多4槽。01第三次、03/07第二次已用完，保持失败证据，不能声称全部样式正在运行。

06首次CPU样式规划 `gen_30ef4c7b653de599` 实际在codex20失败，已确认provider completed且item failed；授权从合并后的检查点用09/18池第二次接续，等待空闲CPU槽位。

最后L4 `i-0589e6549c296f55b` 已shutting-down，NodeClaim `worldkit-episode-graphics-l6xqk` 已有deletionTimestamp。专用NodePool已恢复Spot，GPU队列active=null；卷 `vol-0b0e8c58a86912499` 与实例终态仍待回收器核验，不能提前称费用归零。全程禁止H100和Seedance提交。已再次明确整批样式无法按09:16期限完成，继续有界恢复与监控。

## 09:28 并发扩展与结果页

用户要求提高并发、量化额度并展示现有结果。09:00健康快照中09剩7%、18剩6%，阈值各1%；06/20显示100%但实际usage limit，无法换算准确缺口金额或token。平台百分比不能用作完成整批的额度承诺。

控制器r21 `sha256:a3d97843b0f726a82492fbcbefa422be1258fb4c0f178e129dc5c1e6db226a1d` 已部署，CPU槽位上限由4提升9。实际运行Host只用3–29m CPU和491–574Mi内存，却请求2CPU；故仅后处理Host请求调整500m CPU、内存4Gi和4CPU/12Gi上限不变。三个Pending Pod通过Kubernetes resize原位下调CPU请求，未重建Job、未重启运行中的请求。已确认02/04/05/06/08/09六个Host全部Running，01/03/07保留耗尽重试的失败状态。并发与CPU资源断言/无GPU请求回归通过。

本地新结果页 http://127.0.0.1:53747/human-ten/#human-ten-04 已在应用浏览器展示并检查图片实际加载。首个快照包含54段白膜、28张候选图、9张后续样式图，04完整十种候选并标记style-00为用户原图风格。图片/视频来自S3内容哈希产物，使用12小时临时读取链接，不改变bucket权限。预览构建脚本 `.codex-tmp/three-episode-human-production-r15/live-preview/build-preview.py`，输入manifest和live快照应先更新，再构建；页面每30秒检查本地status.json更新，不宣称独立向云端实时拉取。

预览刷新已整理为 `.codex-tmp/three-episode-human-production-r15/live-preview/refresh-preview.py`：先更新9例S3 manifest及队列，再抓取仍在运行Host的最新JSON和已完成图片，按SHA复用预览上传，最后原子替换页面status.json。Heartbeat有新产物时运行该脚本；临时链接12小时过期也需刷新。最后L4已核验terminated。

09:38 heartbeat：六个CPU Host仍Running；预览已更新54录像、36候选图、10后续样式图（上一快照29/9）。最后L4 closure已正式resource-closed，实例terminated、卷删除。旧两条Spot调度失败因历史节点证据缺失仍保留attentionRequired，不伪造结论。逐例图片计数：[{"case": "human-ten-01", "anchors": 6, "images": 0}, {"case": "human-ten-02", "anchors": 9, "images": 0}, {"case": "human-ten-03", "anchors": 5, "images": 0}, {"case": "human-ten-04", "anchors": 10, "images": 10}, {"case": "human-ten-05", "anchors": 4, "images": 0}, {"case": "human-ten-06", "anchors": 0, "images": 0}, {"case": "human-ten-07", "anchors": 0, "images": 0}, {"case": "human-ten-08", "anchors": 2, "images": 0}, {"case": "human-ten-09", "anchors": 0, "images": 0}]。Seedance仍0提交。

## 按样式流水推进：r22工作边界

用户要求移除整批阶段等待、尽快得到可提交Seedance的输入，仍未授权实际视频提交。S1（main-agent-only，visuals.mjs与测试）：单样式锚点检查→素材→素材检查→事件→六条请求；产物ready-render-requests.json按世界、锚点和请求hash绑定，失败样式不阻挡其余样式。S2（依赖S1，workflow/report）：每出现新就绪请求即发布安全检查点，页面分开展示请求数量与完整案例数量。S3（依赖S1/S2测试，main-agent-only运行资源）：先冻结04旧Host的唯一workflow进程、持久化S3检查点，再创建带可核验代码overlay的新CPU Host接续；旧provider身份完整继承，不取消或重复提交在途请求，GPU不动。切换失败则恢复旧进程。S4（依赖实际接续）：更新预览与监控，验证优先样式进展。

单样式完整图像检查保留；跨样式差异审核后置为独立批次报告，ready清单明确readinessScope=independent-style、batchDiversityStatus=pending，不假称整批差异审核已通过。原完整批次实现保留为streaming=false回归基线。优先一套样式可占用最多10图像槽，降低首批六条请求的等待时间。已有完成的请求在恢复时重新校验文件/hash并保留，坏文件或锚点变更撤销就绪后重建。

10:17 r22b已完成实际切换：04 `three-stream-human-ten-04-r22b`，02/06/08/09对应同格式任务全部Running；原Host停止并保存检查点后才迁移队列所有权、删除旧Job、启动新Job。04检查点623文件，所有迁移详见 `.codex-tmp/three-episode-streaming-r22/remaining-migration.json`。05第二次原流程因6/10候选失败，于02:03:52 UTC失败；新语义能利用4张成功锚点，显式授权最后第三次，`three-post-c22eb26abf348ea241b256f37c5a06f9-3`已Running并带streaming overlay。01/03/07原耗尽失败记录保留，不自动突破上限。

控制器r23已部署，全局streamingOverlay固定至 829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:3bc14ed55d37b02540fbd86bb94b5f950dabf2531ad29a7841a732f58e8b9f13。20项视觉流水测试、29项控制器/补丁测试、8项工作流测试及25项云端身份/重试测试通过，tsc无错误。初次误用node --test跑Vitest文件的测试工具错误已用vitest正确复跑通过。镜像r22已存在不可覆盖，最终使用新不可变tag r22b；未覆盖旧镜像。迁移途中ConfigMap CAS冲突按resourceVersion重读，kubectl delete不支持-o json的命令错误已改为普通delete后完成切换；没有两个活动写入者。

04实际visual-state进入streaming-styles，style-00处于style-images。用户原图锚点、segment01/02/03和灯塔三视图已完成，另六张仍待云端。精确provider Job清单在04-priority-jobs.json；API显示job running但item counters queued=1/running=0，不能称这些图已实际在推理。当前瓶颈为云端队列，不是整批阶段屏障；未修改共享Ray扩容/账号阈值或取消/重发这些请求。

页面快照更新为54白膜、38候选、17后续图、0就绪请求，已新增0/540就绪计数和每例0/60计数，应用浏览器验证展示正确。

## 人工反馈及05–09暂停

用户要求在样式候选图添加人工审核，已上线preview-server本地GET/POST /human-ten/api/reviews与每图人工审核按钮，支持通过/效果不行/未审核及备注。反馈保存human-ten/human-reviews.json（含历史），以case/style/图片SHA绑定，不因URL签名刷新串图，不自动触发生成或修改生产审核许可。跨源写入、过期图片绑定和并发持久化测试通过；在53748独立测试站完成浏览器保存/刷新恢复验证，未写入生产测试标记。生产已有真实用户标记，后续不得覆盖该文件。

用户随后明确05–09暂停、优先04。主cohort与06 cohort的对应case写入productionPause，task.continuation保存在pausedContinuation并移除，阻止再调度。07/09和06最新Host本已终态失败；05/08活跃工作流先停止写入并发布完整S3检查点（295/234文件），再删除Host。对精确的10个05/08远程生成任务执行取消，超时不视为失败或成功，另以精确jobId查询确认；证据在paused-cases.json与pause-remote-verified.json。02与04继续原任务，04优先。未重录白膜或提交Seedance。

用户询问新版SDK能否优化白膜但保持首帧，当前仅说明可行方案，尚未授权切换/重录：锁定六段各自的场景、人物姿态、相机及确定性初始状态，变化从后续帧开始；需要对比实际渲染首帧并验证版本兼容。已有样式首帧在对齐校验通过后可复用，新视频的hash和事件时间轴/请求需重新校验。等用户明确下一步，不能因SDK更新自动替换现有录制。

## 用户再次恢复05–09，等待SDK通知后重录

最新用户指令覆盖短暂停止：继续生成，04优先，05–09也恢复；SDK准备好后用户会另行通知，再按完全相同标准重录白膜。当前不得自动升级SDK或重录。已保存 `.codex-tmp/three-episode-sdk-rerecord-baseline.json`，包含54张原始首帧hash与录制标准文件hash。

恢复采用独立的一次用户恢复Job `three-resume-human-ten-XX-r24b`，从保存的S3检查点恢复。`resume-production.mjs`只对明确终态失败/已取消的具体云端请求额外授权一次重试，每个逻辑请求累计retry最多2；实际仍运行或状态未知的请求继续使用原jobId，不重复提交。旧CPU回执与暂停历史保存在task.userResumes，原CPU尝试计数和图像修复预算不重置。为恢复08被用户暂停的Codex外观任务，增加与图像请求一致的exact-job cancelled recovery白名单，测试通过；没有允许一般自动重试取消任务。

04保持原10图像调度槽；恢复的05–09仅2图像槽/2检查槽/1事件槽，减少竞争。背景并发设置不改变首帧、prompt、素材身份、模型或录制标准。恢复补丁通过单独不可变镜像和文件hash安装，不修改捕获源包。

本轮05–09五个用户恢复Job已全部创建并验证Pod Running，04与02未中断。恢复启动记录保存在 `.codex-tmp/three-episode-user-resume-r24/started.json`，新入口resume-production.mjs；未来暂停操作必须识别这个入口，不能只匹配workflow.ts。监控已改为04优先、05–09继续，等待用户另行通知SDK就绪后才重录。人工审核已完成隔离浏览器保存/刷新验证，生产用户标记保持不变。

### 2026-09-07 11:30 首批交付追赶与事实状态

用户要求 11:30 前有可进入 Seedance 的数据。本节点未达成：完整可交付请求仍为 0，不能将 prompt-ready 当作素材齐备。04 的原图风格 style-00 已有 5 个真实 Gemini 事件和六段 prompt，绑定旧版白膜、接受锚点与 appearance lock；现有首帧覆盖 segment-00–03，尚缺 traveler、bench-and-field-case 两张必需三视图。原请求 `gen_99f5e14cf0a07f92` / `gen_410408febaa53c50` 的失败 items 均为 Ray shard timeout，已查实后于 11:25 发出唯一 retry-1，分别为 `gen_b0b2b21668271ec5` / `gen_b0304a42940858a6`，没有重复仍存活的请求。

04 当前 CPU Host 为 `three-fast-human-ten-04-r25-q2cbh`，使用 hash 验证的单 tar 检查点续跑。r25 让事件先于完整样式帧生成，并允许素材完整且独立审核通过的片段先发布 `visuals/fast-ready/style-00/ready-clips.json`。原 full-style ready 清单保留；页面按请求 ID 合并计数。人工拒绝按 case/style/anchor SHA 从 S3 `control/rejected-candidates.json` 生效；04 style-02、03 停止下游，已有图片与反馈保留。

应急操作脚本留档 `.codex-tmp/three-episode-fast-prompts-r25/repair-priority.mjs` 与 `finish-priority.mjs`。前者仅补两个已失败目标的相同输入，后者等待素材后做独立视觉审核并发布已完成片段；均不提交视频。finish 首次启动响应超时，经检查无进程/日志，随后以 detached subprocess 启动 PID 1399，避免双写者。页面 `http://127.0.0.1:53747/human-ten/#human-ten-04` 已显示 6 条实际 prompt；11:32 快照为 54 白膜、41 候选、23 后续图、0 完整请求。

另一个任务 `01a079e4-9146-7770-a289-38d77b97ee6a` 通知用户已在该任务授权新版 SDK 重录，其独立负责单 L4 与独立输出/队列。本任务不动 capture/browser/SDK，不派重复捕获，样式及 prompt 继续绑定旧视频。新视频通过验证后再协调生成新的事件与请求身份；禁止混用版本。全程仍停在 Seedance 提交前，禁止 H100。
