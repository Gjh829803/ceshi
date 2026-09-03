# MG Seedance 2.5 + CF upscale adapter

当前 Adapter 使用 MG Seedance 2.5 480p 与 CF 720p 超分链路，生产配置位于
`config/episode-video-pipeline.json`。

## HTTP 映射

- Base URL：`https://clmm-mall.top/v1`。
- 输入白膜视频、该段样式首帧和全部样式三视图先上传到短期 S3 引用地址。
- `POST /videos` 第一步提交 `mg-seedance-2.5-480p`，生成 30 秒、16:9、带音效的
  480p 视频。
- 第一步完成后，以其输出为唯一视频输入再次调用 `/videos`，模型为
  `cf-超分-720p-30s`，只允许提升清晰度和分辨率。
- `GET /videos/{id}` 只轮询已经持久化的任务 ID；最终使用 CF 画面和 MG 原始音轨
  闭合成 1280×720、24fps、720 帧、30 秒视频。

## 幂等与恢复

每个 Episode Segment 使用由 Episode、Segment 和全部输入 Hash 派生的稳定
`Idempotency-Key`。首次提交前先持久化完全相同的素材 URL、请求 JSON 和幂等键。
创建请求遇到网络错误、408、429 或 5xx 时，只能用同一请求体和同一 Key 重试；一旦
获得 Job ID，后续恢复只轮询该 Job，绝不创建第二个任务。Provider URL 只在运行元数据
中短暂保留，Job 下载完成后从正式记录删除。

Bearer Key 只从 `.codex-tmp/runtime-config/mg.key` 读取。该路径受项目凭证
清单和云端 Kubernetes Secret 管理；源码与文档从不保存 Key 值。
