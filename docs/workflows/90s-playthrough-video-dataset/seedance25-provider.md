# Seedance 2.5 direct adapter and MG fallback

生产默认配置为 `config/episode-video-pipeline.json`，直接调用项目锁定的
Seedance 2.5 API；`config/episode-video-pipeline-mg-fallback.json` 只是服务端终态
失败后的备用链路。

## 主链路

- 输入是可被 Provider 直接 GET 200/206 的 HTTPS 视频和图片。
- `POST /v1/videos` 提交 `seedance-2.5`，30 秒、16:9、720p，开启音效。
- `GET /v1/jobs/{jobId}` 只轮询已持久化的 Job ID。
- 每次提交前持久化完整请求和幂等键；超时、断网、429 或 5xx 保留原键对账，不创建新任务。

## 备用链路

只有主链路日志已确认为 `failed` 或 `refunded` 才触发。原日志保留为
`provider-run.primary.json`，路由决策保留为 `provider-run.route.json`；当前有效结果仍在
`provider-run.json`，供下游无差别断点续跑。备用链路先调用 MG 480p，再调用
CF 720p，最后闭合为 1280×720、24fps、720 帧、30 秒、带音轨。

## S3 与凭证

签名前查询 bucket 真实 region，禁止继承错误环境 region；签名后先执行 Range
GET 可读性探针，避免将 301/403 素材地址提交给 Provider。主链 Key 从
`.codex-tmp/runtime-config/infinite-canvas.key` 读取，备用 MG Key 从
`.codex-tmp/runtime-config/mg.key` 读取；二者都不得写入日志、S3 artifact 或源码。
