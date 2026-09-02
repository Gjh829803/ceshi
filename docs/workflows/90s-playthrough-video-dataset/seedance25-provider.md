# Seedance 2.5 OpenAPI adapter

当前 Adapter 实现用户提供的 Infinite Canvas Seedance 2.5 OpenAPI 文档，生产配置位于
`config/episode-video-pipeline.json`。

## HTTP 映射

- Base URL：`https://env-00jy6ktfybhu.dev-hz.cloudbasefunction.cn/gateway`
- `GET /v1/models`：提交前确认 `seedance-2.5` 可用。
- `POST /v1/uploads/sign`：为一段白膜 MP4、该段样式首帧和全部样式三视图取得上传地址；
  单文件不超过 50MiB。
- `PUT uploadUrl`：按签名响应给出的 Header 上传，正式请求只引用 `publicUrl`。
- `POST /v1/videos`：`model=seedance-2.5`、`duration=30`、`resolution=720p`、
  `ratio=16:9`、`generate_audio=true`，`videos` 含白膜视频，`images` 顺序为样式首帧
  后接全部样式三视图。
- `GET /v1/jobs/{id}`：只轮询首次返回的 Job；`completed` 只接受 `result.url`，
  `failed` 和 `refunded` 是失败终态。

## 幂等与恢复

每个 Episode Segment 使用由 Episode、Segment 和全部输入 Hash 派生的稳定
`Idempotency-Key`。首次提交前先持久化完全相同的素材 URL、请求 JSON 和幂等键。
创建请求遇到网络错误、408、429 或 5xx 时，只能用同一请求体和同一 Key 重试；一旦
获得 Job ID，后续恢复只轮询该 Job，绝不创建第二个任务。Provider URL 只在运行元数据
中短暂保留，Job 下载完成后从正式记录删除。

Bearer Key 只从 `.codex-tmp/runtime-config/infinite-canvas.key` 读取。该路径受项目凭证
清单和云端 Kubernetes Secret 管理；源码与文档从不保存 Key 值。
