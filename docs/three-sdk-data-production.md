# Three SDK 与数据生产统一分支

分支：`codex/three-sdk-data-production-20260907`。本次将我们正在使用的
Three 场景生成、SDK 修复和后续数据生产收拢到一处。现有生产工作树、云任务、
案例文件和审核数据继续保留在原位置。

## 当前设计依据

[Three SDK 架构](three-sdk-architecture.md) 说明创作自由、运行时职责、公开接口和
画面/UI 分层。本文负责生产流程与接入边界；组件 README 负责实际用法。
旧编号设计、Babylon/Native/Block ADR 和独立 API 草案不再作为本分支的指导。
对应源码包与历史发布站点尚未清理，不应从它们的存在推断当前生产使用它们。

## 合并来源

| 来源 | 纳入内容 |
| --- | --- |
| `codex/creator-camera-triview-reliable-ten`，`0abd9a00` | 已验证的 Creator 生产入口、角色与相机指导、代表对象三视图、云任务调度、交付恢复、场景展示和共享审核；包含当前两份工作记录修改 |
| `codex/three-episode-agent-production`，`864c2dd2` | Episode SDK 接口、路线规划、实际录制、样式和视频请求准备 |
| 上一行工作树当前尚未提交的生产代码 | 批量 GPU/CPU 调度、镜头兼容、去 UI、恢复、流式样式、Prompt 预取、单 clip 就绪包和图片人工反馈，共纳入 75 个文件变化 |
| `codex/sdk-human-ten-locomotion-20260907` 的修复 | 步态连续性、小台阶下坠展示阈值、Episode 初始化时历史状态清理及回归测试 |

Creator 入口保留 **v0.2 生产交付契约**，工具、云 launcher、校验器和测试保持一致。
Creator 自检录像与 Episode 数据录制是两个用途不同的阶段。新分支没有混用
另一条 preview-first v0.3 入口的提交规则。

SDK 集成同时保留 Creator 的开场镜头/代表对象捕获和 Episode 的生命周期/固定步进。
兼容原案例的镜头通过编译选项进入同一个运行时，仍只有一个相机写入者。

2026-09-07 已完成的原路径更新是独立部署记录：本地 10 个、线上 212 个 SDK
已替换并核验，线上当时审核通过的 39 个优先完成。那次更新不等于当前整合分支
已被打包成新的云生产胶囊；新的发布必须使用本分支实际构建的 SDK。

## 数据如何流转

| 阶段 | 代码入口 | 输入 → 输出 | 当前边界 |
| --- | --- | --- | --- |
| 场景生成 | `scripts/three-creator`、`scripts/cloud/three-eval-runner.mjs` | 原图、需求、资产与运行锁 → Three 源码、可玩场景、自检和交付包 | 已实现；批次运维在 `scripts/production` |
| 案例选取 | 现有场景展示与共享人工审核 | 通用审核记录 → 明确的生产案例清单 | 当前显式选取，尚无交付自动订阅 |
| 接入 | `scripts/three-episode/source.ts` | 验证过的 Creator 或 repaired payload → `source.json` 与生产用 playable | 保留原源码；重新派生实际运行时身份 |
| 路线规划 | `workflow.ts`、`mcp.ts` | 场景观测、局部试走 → 云 Agent 提交的路线计划 | SDK 执行输入，Host 不把角色传送到目标 |
| 白膜录制 | `capture.ts`、`player-controller.ts` | 路线计划 → 6 段视频、首帧、三视图、trace、health | 每段 30 秒、1280×720、24fps、720 帧；60Hz 模拟 |
| 样式制作 | `visuals.mjs` | 白膜构图与原图 → 10 套样式锚点、各段样式首帧、目标三视图 | 1 套原图风格 + 9 套重设计；逐样式推进 |
| 事件与 Prompt | `event-prefetch.mjs`、`visual-contracts.mjs` | 实际运动证据与样式信息 → 视频视觉事件和 Prompt | Prompt 可先完成；缺素材不等于请求就绪 |
| 请求准备 | `visuals.mjs`、`fast-clip-package.mjs` | 完整且通过检查的素材 → 单 clip/单样式请求及最终 60 条汇总 | 当前停在 Seedance 提交前 |
| 展示与反馈 | `report.ts`、`preview-server.mjs`、`human-review-store.mjs` | 检查点和实际产物 → 报告、媒体浏览、人工反馈 | 沿用共享身份，不增加 SDK 版本维度 |

完整一例是 **6×30 秒白膜、10 套样式、最多 60 条视频请求**。录制 trace
保存实际 SDK 输入、位置和镜头；视觉事件是给后续视频模型的外观指令，两者
分别保存。历史文档目录里的 `90s` 名称不能用作当前规格。

`ready-render-requests.json` 表示独立样式已就绪，`pre-seedance-manifest.json`
是完整汇总；单 clip 包可以先交付。锚点通过、Prompt 完成、素材就绪和最终
视频生成完成必须分别显示，不能互相代替。

## 任务分类与账号能力

模型与账号选择先查[用户确认的 GPT-6 账号清单](evaluations/gpt6-three/account-performance/gpt6-capabilities-20260907.md)。其中 18 个账号已由用户确认支持 GPT-6；实时额度、登录状态和历史质量独立判断。

## 批量生产和恢复

`batch-cli.mjs` 注册固定 cohort 清单；`batch-controller.mjs`、`batch-store.mjs`
管理生产者、CPU 接续和 GPU 队列。每个 GPU 任务录制一个 Episode 的六段，
使用一个 L4 GPU 执行槽。满 100 个兼容任务成批，或在该 cohort 所有生产者
确知结束后处理余量；不把排队超时当成生产结束。

录制成功段落可复用。CPU 后处理通过检查点独立继续，多个案例和样式不必
等待某个失败案例。确切并发来自外部生产配置，不能把排队 Pod 算作运行。

`cloud.mjs` 保存精确 request/job 身份；未知提交必须协调原请求，不能重复
POST。`resume.ts`、`resume-production.mjs`、`rerun-runtime.ts` 分别处理已有
检查点接续、用户明确恢复以及 SDK 改变后的新 Episode。新运行时的身份由
源码和实际文件派生，不改写旧录像的出处。

## 统一命令入口

这些命令是操作说明。本次分支整理仅做本地构建和测试，没有执行新的云生产。

```sh
pnpm install --frozen-lockfile

# 本地构建 SDK，供新的 Creator/生产胶囊使用。
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime

# 从已验证 payload 准备一个生产源；目标必须是新目录。
pnpm three:episode:source \
  --payload /absolute/verified/payload \
  --output /absolute/production/source \
  --world-id selected-case \
  --reference-image /absolute/reference.png \
  --reference-image-sha256 ACTUAL_REFERENCE_SHA256

# 配好实际运行配置后，显式注册 cohort。
pnpm three:episode:batch register \
  --cohort production-run --cases-file /absolute/episode-ids.json

# 以下启动对应 Episode 工作流，可能产生云调用。
pnpm three:episode:run \
  --source-manifest /absolute/production/source/source.json \
  --output-root /absolute/production/episode \
  --episode-id selected-case-episode \
  --cohort production-run --stop-before-seedance

# 读取队列和查看已有报告。
pnpm three:episode:batch status --cohort production-run
pnpm three:episode:preview /absolute/production/episode/report 53847
```

Creator 云生成的 prepare/run/resume、运行锁和案例清单格式见
[云生成说明](../scripts/cloud/three-eval-README.md)。
Episode 接续和部署参数见 [Episode 说明](../scripts/three-episode/README.md)。

## 外部运行配置

仓库提供两份无凭据示例：

- [Host 配置](../config/three-episode-runtime.example.json)：复制到忽略目录
  `.codex-tmp/three-episode-runtime.json`，填写真实胶囊、S3、镜像摘要和 cohort。
- [胶囊 launcher 配置](../config/three-episode-launcher-runtime.example.json)：
  发布工具填写真实固定二进制和摘要，在胶囊内保存为
  `scripts/three-episode/episode-runtime.json`。

示例里的占位值不能直接提交生产任务。AWS/LWDP/图像服务凭据继续由独立
运行配置或 Kubernetes Secret 注入，示例和 Git 都不保存凭据。
多案例共用胶囊时用 `planningSourceRoot`，由 `caseRuntimeConfig()` 派生各例路径。

新分支包含通用 Episode 报告和预览服务。用户目前 `/human-ten` 聚合页还由原工作树
忽略目录里的专用运维脚本维护；那些脚本包含具体批次路径和云刷新副作用，
未伪装成可移植产品入口，也没有带入原页面的审核数据或临时链接。

## 后续接入点

1. 从现有共享人工审核生成明确案例清单；需要后台自动生产时，再接通 Creator
   delivery consumer，复用现有 outbox 去重，避免重建场景或另起审核版本。
2. 为已就绪请求接入视频提供商，沿用精确提交身份、检查点和有界恢复。
   当前所有可执行 Episode 入口仍要求 `--stop-before-seedance`。
3. 视频返回后补最终尺寸/时长/帧数检查，以及实际运动和事件对应检查，形成最终
   数据清单与发布产物。请求里的 `frameSynthesisAllowed:false` 需继续遵守。

以上是明确的下一段工作，不是本分支已实现能力。本次已将后续录制与素材准备
代码整合到同一分支，没有借用另一套引擎的生产实现。

## 整合验证

```sh
pnpm exec vitest run packages/three-world scripts/three-creator scripts/three-episode
node --test scripts/three-episode/*.test.mjs \
  scripts/cloud/three-episode-scheduling.test.mjs scripts/lib/cloud-production-run.test.mjs
pnpm typecheck
pnpm test:census
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
git diff --check
```

历史合并职责与证据要求见 [整合计划（历史快照）](https://github.com/seedleap/agent-whitebox-world-sdk/blob/4256b6fdf06c7ba732e13a7c9aeee553544438e9/docs/superpowers/plans/2026-09-07-three-sdk-data-production.md)。

本次合并的实际结果见 [整合验证记录](reviews/2026-09-07-three-sdk-data-production-integration.md)。
