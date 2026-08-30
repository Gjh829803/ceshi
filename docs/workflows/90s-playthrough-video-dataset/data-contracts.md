# 数据合同草案

本文件描述建议的 V1 持久制品。实现时应放入独立 package 并使用关闭 Schema Validator；
本文示例不是可以直接提交给 Runtime 的现有 JSON。

## 1. PlaythroughPlanV1

```json
{
  "kind": "worldkit-playthrough-plan",
  "schemaVersion": 1,
  "id": "episode-scene-a-seed-731991",
  "sceneId": "scene-a",
  "worldPackageRootHash": "sha256:...",
  "seed": 731991,
  "simulationTickRate": 60,
  "captureFrameRate": 24,
  "startTick": 0,
  "endTickExclusive": 5400,
  "controlledEntityId": "subject-a",
  "motionRenderingGuidance": "<movement-specific natural final micro-animation while root motion stays locked>",
  "movementCapabilityRefs": ["worldkit://..."],
  "inputIntervals": [
    {
      "startTick": 0,
      "endTickExclusive": 90,
      "rawKeys": ["W"],
      "semanticActions": ["move-forward"],
      "purpose": "leave-spawn-and-establish-heading"
    }
  ],
  "cameraIntervals": [
    {
      "startTick": 120,
      "endTickExclusive": 180,
      "yawDeltaRadians": -0.35,
      "pitchDeltaRadians": 0.08,
      "purpose": "inspect-left-landmark"
    }
  ],
  "seedancePromptEvents": [],
  "recoveryPolicies": [],
  "explorationTargets": [],
  "planningEvidenceRefs": [],
  "selfCheckReportRef": "playthrough-self-check.json"
}
```

规则：

- Tick 区间均为左闭右开，不能重叠产生互斥键冲突。
- `rawKeys` 只允许 `W/A/S/D/Shift/Space`；Camera 不伪装成键盘移动。
- `semanticActions` 必须由当前主体 Control Profile 编译，不能由 Agent 猜测 Clip 名。
- 计划固定 5400 Tick；Capture Schedule 固定 2160 帧。
- 所有随机结果已落盘，重放不能再次随机。

## 2. SeedancePromptEventV1

```json
{
  "kind": "worldkit-seedance-prompt-event",
  "schemaVersion": 1,
  "id": "prompt-event-01",
  "windowIndex": 0,
  "windowStartTick": 600,
  "windowEndTickExclusive": 1200,
  "selectedTick": 947,
  "segmentId": "segment-00",
  "segmentRelativeTick": 947,
  "eventClass": "environment-transformation",
  "magnitude": "large-scale",
  "frameImpact": {
    "scope": "environment-dominant",
    "coverage": "large",
    "contrast": "dramatic"
  },
  "dominantChange": "<large immediately readable before/after transformation>",
  "eventPrompt": "<scene-specific, time-explicit Seedance rendering instruction>",
  "grounding": {
    "visualTargetIds": ["visual-target-1"],
    "naturalTargetNames": ["<existing target name>"],
    "pairedInputIntervalIds": ["input-interval-17"],
    "whiteboxEvidenceRefs": ["segment-00.mp4#t=15.783"]
  },
  "timing": {
    "onsetSeconds": 15.783,
    "transitionDurationSeconds": 1.2,
    "holdDurationSeconds": 4.0,
    "ending": "settle-or-fade-as-described"
  },
  "continuityRequirements": [
    "preserve-whitebox-motion",
    "preserve-camera-path",
    "preserve-spatial-layout",
    "preserve-controlled-actor-root-track-and-count"
  ],
  "audioRequirement": "synchronized-effect-sound-only",
  "promptHash": "sha256:..."
}
```

Validator 要求三个 Event 的窗口分别为 `[600,1200)`、`[2400,3000)`、`[4200,4800)`；
每个 Event 恰好属于一个 Segment。

Event JSON 用于时间、Grounding 和审计；`eventPrompt` 才是交给 Seedance 的自然语言事件
块。它必须包含事件开始时间、变化过程、动作/镜头保持要求和禁止项，不能只依赖 JSON
字段让 Provider 猜测含义。

## 3. ExecutedPlaythroughTraceV2

执行 Trace 不覆盖 Plan，而是记录事实：

```json
{
  "kind": "worldkit-executed-playthrough-trace",
  "schemaVersion": 2,
  "episodeId": "episode-scene-a-seed-731991",
  "planHash": "sha256:...",
  "runtimeSessionId": "runtime-session-...",
  "worldSessionId": "world-session-...",
  "recordingStartedAt": "...",
  "recordingFinishedAt": "...",
  "executedInputEvents": [],
  "executedCameraEvents": [],
  "seedancePromptEventMarkers": [],
  "frameTelemetry": {
    "kind": "worldkit-episode-frame-telemetry",
    "schemaVersion": 1,
    "samplingMode": "nearest-runtime-sample",
    "captureFrameRate": 24,
    "frameCount": 2160,
    "widthPixels": 1280,
    "heightPixels": 720,
    "coordinateSystems": {},
    "samples": []
  },
  "runtimeSnapshots": [],
  "coverage": {
    "visitedCellCount": 0,
    "reachableCellCount": 0,
    "visitedVisualTargetIds": [],
    "unvisitedReasons": []
  },
  "recoveries": [],
  "diagnostics": [],
  "contentHash": "sha256:..."
}
```

Marker 只证明 Event 与白膜 Timeline 的时间对应，不代表 Runtime 已执行视觉变化。

`frameTelemetry.samples` 与最终白膜母片逐帧对齐。每项包含当前按键、Simulation Tick、
主体世界坐标/四元数/速度，以及相机位置、实际 Target、动态垂直 FOV、near/far、3×3
像素内参、View/Projection 和 Camera-to-World 4×4 矩阵。世界和相机均为右手米制坐标；
矩阵默认 column-major，只有 `intrinsics.matrixRowMajor` 明确使用 row-major。

## 4. SegmentManifestV1

| Segment | Source frames | Required output |
|---|---:|---|
| `segment-00` | 0–719 | 30 s / 720 frames |
| `segment-01` | 720–1439 | 30 s / 720 frames |
| `segment-02` | 1440–2159 | 30 s / 720 frames |

每段 Manifest 保存：

- 母片 Hash 和 Frame Range；
- 白膜分段 Hash、首帧 Hash；
- 样式化首帧 Hash；
- 共享 Styled Tri-view Manifest Hash；
- Seedance Prompt Event、最终 Segment Prompt Hash；
- MG request_id/job_id、480p 原始输出 Hash；
- CF request_id/job_id、720p 原始输出 Hash；
- 最终 Conformed 视频 Hash和媒体参数；
- 白膜/生成视频 Pair Validation Report Hash。

## 5. Episode 目录

```text
episodes/<scene-id>/<episode-id>/
  episode-manifest.json
  planning/
    reconnaissance-report.json
    playthrough-plan.json
    playthrough-self-check.json
    seedance-prompt-events.json
  execution/
    executed-playthrough-trace.json
    runtime-snapshots.ndjson
    seedance-prompt-event-markers.ndjson
  whitebox/
    episode-90s.mp4
    episode-90s-media.json
    segment-00.mp4
    segment-01.mp4
    segment-02.mp4
    segment-00-first-frame.png
    segment-01-first-frame.png
    segment-02-first-frame.png
  visual/
    segment-00-styled-opening-frame.png
    segment-01-styled-opening-frame.png
    segment-02-styled-opening-frame.png
    styled-triviews-manifest.json
    triviews/<visual-target-id>/styled-triview.png
  prompts/
    segment-00.json
    segment-01.json
    segment-02.json
  generated/
    mg-480p/segment-00.mp4
    mg-480p/segment-01.mp4
    mg-480p/segment-02.mp4
    cf-720p/segment-00.mp4
    cf-720p/segment-01.mp4
    cf-720p/segment-02.mp4
    conformed/segment-00.mp4
    conformed/segment-01.mp4
    conformed/segment-02.mp4
  validation/
    segment-00-pair.json
    segment-01-pair.json
    segment-02-pair.json
```

Provider URL、Token、Authorization、临时签名地址和 Codex 登录状态不得进入 Episode 目录。

## 6. 幂等键

- Codex 规划：`<scene-id>-<world-hash>-playthrough-plan-v1-<seed>`。
- Episode 视觉重建：`<episode-id>-visual-v1`。
- MG：`<episode-id>-segment-XX-mg-v1`。
- CF：`<episode-id>-segment-XX-cf-v1`。

HTTP 502/504、连接超时或本地进程退出后，先按 `request_id` 查询原 Job。发现原 Job 后只
接管轮询/下载，不能新建随机 request_id。只有明确失败且人工/策略批准新尝试时才使用
`-attempt-N`。

## 7. Seedance 审阅下载包

三段最终视频全部完成后，Studio 提供：

```text
<episode-id>-seedance-review.zip
  <episode-id>-seedance-review/
    manifest.json
    interaction-timeline.json
    episode-record.json
    planning/
      playthrough-plan.json
      reconnaissance-report.json
    whitebox/
      episode-90s-1280x720-24fps.mp4
      episode-raw.webm
      executed-playthrough-trace.json
    reference/
      user-first-frame.png
      world-plan.png
      base-styled-opening-frame.png
    visual/
      episode-visual-prompts.json
      episode-visual-manifest.json
      triviews/<visual-target-id>-whitebox.png
      triviews/<visual-target-id>-styled.png
    segments/segment-00..02/
      whitebox-1280x720-24fps-720f.mp4
      whitebox-first-frame.png
      styled-opening-frame.png
      seedance-mg-480p.mp4
      seedance-cf-720p.mp4
      seedance-final-1280x720-24fps-720f.mp4
      seedance-prompt.json
      provider-run.json
    logs/pipeline.log
```

`interaction-timeline.json` 是便携的人类操作合同。每个 Segment 同时记录实际执行的
`W/A/S/D/Shift/Space`、方向键镜头输入、分段时间、全局时间，以及对应 Prompt Event 的
自然语言输入 `inputPrompt` 和实际发送给 Seedance 的 `seedanceProviderPrompt`。下载包不
包含含本地绝对路径的内部 `request.json`，也不得包含 Token、Authorization 或临时签名
URL；可移植输入身份由 `provider-run.json` 中的 Hash 和任务 ID 表达。
