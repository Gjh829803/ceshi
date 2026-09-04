# 六起点白膜与 180 秒 Seedance 数据工作流

## Ten-style production mode

Current production records one six-Segment whitebox set once, then expands it into
exactly ten independent visual-world variants. Every variant has its own appearance
specification, six styled opening frames, complete-target styled tri-views, Gemini
event prompt, six Seedance prompts, six final videos, and conformance receipts.

An independent LWDP Codex Visual Reviewer compares each styled opening with its
whitebox camera/composition authority and reviews every Front/Right/Back sheet. This
is semantic image review, not a pixel threshold Gate. Only a hash-current `passed`
review may enter Gemini or Seedance. A failed variant receives at most one targeted
visual repair; Planner, Builder, whitebox capture, and other variants never rerun.

Whitebox capture separately rejects Runtime failure, Tick stall, no meaningful
movement, or more than five consecutive seconds of effective Subject immobility.
All ten variants bind the same whitebox trace, quality report, and per-Segment video
hashes.

本目录记录当前 Episode 生产合同。场景生产完成后，Episode 不再规划一条连续两分钟
路线，也没有段尾镜头回正缓冲。Planner 一次规划六个独立出生点；Runtime 分别重置并
把受控主体放到对应安全位置，每个位置真实渲染 30 秒、1280×720、24fps 白膜视频。

## 当前生产链

1. Host 从已准入的 Scene 构建 Runtime 侦察与可通行导航证据。
2. Playthrough Planner Codex Job 输出一个 `schemaVersion: 3` 计划，包含六组
   `initialPositionMetersXYZ`、`initialFacingYawRadians`、本地游荡目的、输入区间和
   I/J/K/L 镜头观察。
3. 唯一 Deterministic Capture 实现分别录制 `segment-00` 至 `segment-05`。每段
   720 个真实渲染帧，不补帧、不插值、不用 MediaRecorder；同时保存首帧、Runtime
   telemetry 和全局 0–180 秒输入时间线。
4. Episode Visual Reconstructor 为六段分别生成样式首帧；完整目标三视图只生成一套，
   六段共享。六段全部进入视频生成链。
5. Gemini 3.5 Flash 在一次请求中同时读取三段完整白膜视频和三张样式首帧。视频按
   0.25fps（每 4 秒一帧）送入理解；一次返回五条互不重复、强场景关联的事件，分布为
   2 / 2 / 1。
6. Host 生成六条用户锁定结构的 Seedance Prompt。00/02/04 写入 Gemini 事件，
   01/03/05 明确保持基础场景、不含 Prompt Event。每条 Prompt 都附带一段白膜视频、
   一张该段样式首帧和全部完整目标的样式三视图，并详细描述主体、空间、材质、光照、
   运动细化、镜头连续性、声音和限制。
7. 默认调用项目锁定的 Seedance 2.5 直接 API，生成 30 秒、16:9、720p、
   带音效的视频。只有服务端确认返回 `failed` / `refunded` 时，才对该
   Segment 转入 MG `mg-seedance-2.5-480p` + `cf-超分-720p-30s`备用链路。
   未知提交和网络错误只按原幂等键对账，不转备用渠道。
8. Host 只做最终媒体闭合：1280×720、24fps、720 帧、30 秒、有音轨。白膜视频本身
   始终是 720 个真实帧；最终六段视频与对应白膜在分辨率、帧率和帧数上完全一致。
9. 云端 Worker 将六段白膜、六段最终视频、所有图片/JSON/Prompt/日志和可移植 ZIP
   上传 S3；Studio 仅保存小型记录与远端索引并按需流式播放。

## 人工与 Host 边界

Planner 决定怎样探索，Host 不评价路线是否漂亮、按键分布是否符合某个手工评分器，
也不要求到达精确终点。Host 只校验计划可执行、Runtime Tick 健康、每段主体确实移动，
以及媒体规格闭合。最终游玩效果由页面人工审核。

Gemini 决定大型视觉事件，不把事件与跳跃、转向或任何按键绑定。五条事件必须结合各自
画面真实可见内容并在整组内去重，但不设置“禁止圆环”等具体创意黑名单。

## 凭证与 Provider

生产调用只读项目内 `.codex-tmp/runtime-config/`：

- `mg.key`：MG Seedance 2.5 与 CF 超分 OpenAPI Bearer Key；
- `infinite-canvas.key`：项目锁定的 Seedance 2.5 直接 API Key；
- `gemini.env` 与 `google-service-account.json`：Gemini Event Director；
- `aws-credentials` 与 `aws-config`：云端制品上传。

这些文件由 `config/project-runtime-credentials.json` 声明、Git 忽略、不会进入 Prompt、
日志、产物或 ZIP。OpenAPI 合同与幂等恢复规则见
[`seedance25-provider.md`](seedance25-provider.md)。

## 主要实现

- Planner Skill：`.codex/skills/worldkit-playthrough-planner/`
- 捕获：`scripts/lib/deterministic-playthrough-capture.ts`
- 六起点 Runner：`scripts/episodes/run-playthrough-capture.ts`
- Gemini：`scripts/episodes/run-gemini-visual-event-director.py`
- Prompt：`scripts/lib/episode-seedance-prompt.mjs`
- Seedance：`scripts/episodes/run-episode-video-segment.py`
- 总编排：`scripts/episodes/run-episode-workflow.mjs`
- 云端 Worker：`scripts/cloud/run-worldkit-cloud-episode-worker.mjs`
- Studio：`apps/studio/src/episode-workflows.mjs`
