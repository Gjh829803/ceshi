# Episode data contracts

## Playthrough Plan V3

固定 Header：六段、每段 30 秒、执行与交付均 180 秒、24fps、4320 帧、无镜头重置
缓冲。`segmentPlans` 恰好六项，每项增加：

```json
{
  "segmentId": "segment-00",
  "executionStartSeconds": 0,
  "deliveryDurationSeconds": 30,
  "cameraResetBufferSeconds": 0,
  "initialPositionMetersXYZ": [0, 1, 0],
  "initialFacingYawRadians": 0,
  "destinationId": "local-viewpoint",
  "destinationPositionMetersXYZ": [8, 1, -12],
  "routeBandIds": ["safe-local-band"],
  "routeWaypointsMetersXYZ": [[0, 1, 0], [8, 1, -12]],
  "coverageTargetIds": ["primary-landmark"],
  "purpose": "从独立起点持续游荡并观察主标志物"
}
```

输入和镜头事件仍使用全局 0–180 秒时钟，但单个区间不能跨越 30 秒边界。六段之间
没有位置连续性要求。视觉事件不属于这个合同。

## Whitebox capture

输出：

```text
whitebox/
  episode-180s.mp4
  segment-00.mp4 ... segment-05.mp4
  segment-00-first-frame.png ... segment-05-first-frame.png
  executed-playthrough-raw-trace.json
  executed-playthrough-trace.json
  executed-playthrough-quality-report.json
```

每段视频必须是 1280×720、24fps、720 帧、30 秒、无音频；母片是六段按顺序拼接的
4320 帧。Trace V3 的 `segments` 保存每段出生位置、朝向、帧范围和
`selectedForSeedance`；`frameTelemetry` 保存逐帧输入、世界坐标、主体姿态、速度、
FOV、相机内参、View/Camera-to-world/Projection 矩阵。

每个 Segment 还保存视频和首帧内容 Hash，母片保存独立内容 Hash。地面主体逐帧记录
`movementMedium`、`mobilityMode`、`supportMode` 和 `verticalPhase`，用于识别持续失去
支撑或坠出地图；飞行/水下的正常垂直运动不会被当作地面坠落。

云端 Episode 根目录包含 `episode-source-receipt.json`，绑定 Scene execution、Scene
artifact manifest、World Build Identity、Scene capture receipt、Worker image digest 和
冻结的生产模式。

## Visual assets

六个 Segment 都生成各自的样式首帧：

```text
visual/
  segment-00-styled-opening-frame.png
  segment-01-styled-opening-frame.png
  segment-02-styled-opening-frame.png
  segment-03-styled-opening-frame.png
  segment-04-styled-opening-frame.png
  segment-05-styled-opening-frame.png
  triviews/<visual-target-id>/styled-triview.png
  episode-visual-prompts.json
  episode-visual-manifest.json
```

三视图按完整视觉目标只生成一次，六段共享。

## Gemini Visual Events V1

一次模型调用输入三段视频和三张样式首帧。视频采样元数据为 `fps: 0.25`。输出由 Host
补齐槽位身份后恰好五项：

```text
segment-00: prompt-event-00 @ 8s, prompt-event-01 @ 20s
segment-02: prompt-event-02 @ 8s, prompt-event-03 @ 20s
segment-04: prompt-event-04 @ 14s
```

每项包含场景目标、事件类别、变化前/过程/结果、画面影响、空间连续性、音效与限制。
事件独立于玩家按键和角色动作。

## Seedance request V2 / provider run V3

Ten-style production stores shared motion once under `whitebox/` and variant-owned
artifacts under `style-variants/style-00..09/`. The aggregate
`style-variant-manifest.json` binds every variant to the shared trace and video hashes.
Each `review/visual-quality-review.json` is authored by an independent LWDP Codex Job,
contains the exact generated-image input hashes, and must have `verdict=passed` before
the variant's Gemini event plan or Seedance requests are admitted.

六个 Segment 的 `request.json` 都指向：

- 一个详细 Prompt JSON；
- 对应白膜 Segment MP4；
- 对应样式首帧；
- 全部完整目标样式三视图；
- `seedance-2.5.mp4` 原生 Provider 输出；
- `final-1280x720-24fps-720f.mp4` 最终闭合输出。

`provider-run.json` 保存输入 Hash、稳定幂等键、唯一 Job ID、模型链
`["seedance-2.5"]`、状态、原始 Provider 视频 Hash/媒体探针/正式结果 URL 和最终媒体
探针。Bearer Key、上传签名和下载签名从不保存。原始视频 Hash 不匹配时，从同一 Job
重新下载，不重新创建视频任务。

## Review bundle

ZIP 包含六段白膜与首帧、六个 Segment 的样式首帧/Prompt/Provider 记录/原生与
最终视频、共享三视图、用户图、世界规划图、交互时间线、执行 Trace、质量报告和日志。
云端生产将 ZIP 与全部制品留在 S3，Studio 只维护 Hash 闭合的远端索引。
