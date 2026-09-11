# Seedance 云端生成与回收

Episode 先产生真实白膜录像、已审核的样式首帧、完整目标三视图和 Prompt。
本入口读取已就绪的单片段或单样式，提交 Seedance 视频编辑任务，将结果存入私有 S3。
素材准备仍使用 `--stop-before-seedance`；生成由独立命令显式启动。

| 阶段 | 入口 | 完成依据 |
| --- | --- | --- |
| 素材接入 | `seedance-preflight.mjs prepare` | 当前源包、录像、动作证据、逐图审核和请求哈希一致 |
| 全局准入 | `seedance-admission-service.mjs`、`seedance-slot.mjs` | 已登记请求获得共享并发槽和总量额度 |
| 提交与恢复 | `seedance-dispatch.py` | 真实 task ID；查询原任务直到提供商终态 |
| 视频回收 | `seedance-delivery.py` | 原片、探测证据、交付清单均上传成功并通过 S3 HEAD 校验 |

## 云端运行环境

在隔离的 Linux CPU Host 中运行。准备固定提交的完整仓库源码和
`pnpm install --frozen-lockfile` 的依赖，以及 Python 3.12、`requests`、`boto3`、
FFmpeg/ffprobe、kubectl。preflight 复用源包验证器及 Three 的素材模块，不能只复制
Python 文件。部署时固定镜像摘要和源码归档 SHA；发布闭包不包含凭据或运行记录。

dispatcher 和 admission 必须读取同一云端工作目录及绝对路径，包括源包、录制和
visuals 输出、已登记 manifest 与 attempt journal。跨 Pod 使用共享卷；dispatcher
恢复时先还原相同路径的素材闭包，并从 S3 恢复任务 journal。delivery 只需独立暂存盘
和 S3 权限。设置 `WORLDKIT_CLOUD_MEDIA_HOST=1`；实际媒体操作同时检查云端 Linux
环境。GPU 仍只用于前面的真实录制。

将[提供商配置](../packages/episode-pipeline/config/three-episode-seedance-provider.example.json)和
[准入配置](../packages/episode-pipeline/config/three-episode-seedance-admission.example.json)复制到私有运行目录，
填入实际 endpoint/model、桶前缀、登记清单、并发和总量。提供商接口使用 Seedance 的
`contents/generations/tasks` 视频编辑协议。`limitUnits` 每 15 秒计 1 单位，当前
30 秒请求计 2；例如 120 单位最多接受 60 个 30 秒生成结果。它是产出与占用额度，
不代表货币费用。`sourceProof` 记录本轮发布和执行授权的出处。

凭据由 Secret 注入：`SEEDANCE_API_KEY` 或 `SEEDANCE_API_KEY_FILE` 二选一；
`SEEDANCE_ADMISSION_TOKEN` 供服务与客户端共用。AWS 使用 Host 身份链。
S3 需限定本轮前缀的读写、列举和 HEAD 权限；admission 需对应 namespace 的
ConfigMap get/create/replace 权限。禁止公开桶。跨 Host 的 admission 地址使用 HTTPS；
同 Host 可用 `http://127.0.0.1:53871`。凭据不进入 Agent 或浏览器。

## 启动顺序

以下命令在云端完整仓库根目录执行；路径替换成该轮实际路径。

1. 从独立样式就绪清单准备不可变批次；`--ready` 也支持
   `fast-ready/<style>/ready-clips.json` 和最终 `pre-seedance-manifest.json`。
   `--anchor-history` 使用该 visuals 输出当前 history 文件。
   `--rejections` 是持续同步的共享审核导出，格式沿用 `{ "rejections": [...] }`；
   确实没有拒绝记录时为空数组。准备命令只校验和写清单，不调用模型。

```sh
node packages/episode-pipeline/src/seedance/seedance-preflight.mjs prepare \
  --source /work/run/source/source.json \
  --capture /work/run/episode/capture-input.json \
  --visual-root /work/run/episode/visuals \
  --ready /work/run/episode/visuals/ready-render-requests.json \
  --anchor-history /work/run/episode/visuals/anchors/history-ACTUAL.json \
  --rejections /work/run/control/human-rejections.json \
  --output /work/run/batch/seedance-requests.json --maximum-concurrency 4
```

2. 将该 manifest 的绝对路径加入 admission 配置的 `manifestPaths`，启动准入服务。
   相同配置的服务通过 Kubernetes CAS 共用额度；`name` 必须是该轮统一名称。

```sh
node packages/episode-pipeline/src/seedance/seedance-admission-service.mjs \
  --config /work/run/control/admission.json
```

3. 在另一个进程启动 dispatcher。环境 `SEEDANCE_ADMISSION_URL` 指向准入服务。
   journal、queue、completed 和 media 使用互不重叠的私有 S3 前缀。

```sh
python3 packages/episode-pipeline/src/seedance/seedance-dispatch.py \
  --manifest /work/run/batch/seedance-requests.json --attempt attempt-01 \
  --config /work/run/control/provider.json \
  --post-slot-root /work/run/control/post-slots \
  --submission-journal-prefix s3://example-private-bucket/owned-run/journal \
  --delivery-queue-prefix s3://example-private-bucket/owned-run/queue
```

4. 运行独立 CPU 回收进程；可先于 dispatcher 启动并持续消费队列。

```sh
python3 packages/episode-pipeline/src/seedance/seedance-delivery.py \
  --output-root /work/seedance-delivery \
  --queue-prefix s3://example-private-bucket/owned-run/queue \
  --completion-prefix s3://example-private-bucket/owned-run/completed \
  --s3-prefix s3://example-private-bucket/owned-run/media
```

## 身份、恢复与验收

- `style-00-segment-00` 仅是 Episode 内名称。全局去重使用内容 `inputHash`，
  provider endpoint、模型、参数和输出策略另进入提交身份。换账号或目录不代表新任务。
  登记清单中重复 inputHash 会被拒绝；追加就绪素材用准备命令的可重复
  `--only-request style-00-segment-01` 选取未登记请求，输出到新批次目录，已提交清单保持原位。
- preflight 在 POST 前重新验证当前源/runtime 字节、素材、审核范围、当前锚点和拒绝记录。
  Agent 修改 SDK 后必须重新录制并准备素材，不能把旧录像改标成新 SDK。
- 提交意图先写持久 S3 journal。请求超时且没有 task ID 时保留 `submission-unknown`
  和额度，不自动重发；已有 task ID 只查询原任务。使用原 manifest、attempt、模型和
  S3 前缀重新执行同一命令即可恢复。保留预算 ConfigMap 和 journal，不能清空后重跑。
- 当前接入器消费完整 30 秒录制，保留所有目标三视图。传输和回收层识别 15 秒契约，
  但半段的独立首帧审核、裁剪与事件证明尚未接入本入口，preflight 会拒绝直接改时长。
- 默认要求原生视频达到 1280×720、24fps、720 帧且带音轨。提供商成功不等于规格通过；
  回收记录实际原片 SHA 和探测值。允许帧时钟归一化时，必须同时设置提供商配置
  `allowFrameNormalization:true` 和回收参数 `--allow-frame-normalization`；归一化策略
  绑定不可变请求。原片与转换版分别保留，不能称为原生达标，也不能冒充 SDK 真实录像。
- `delivery-queued` 表示等待回收；S3 completion 才证明产物持久化。当前验收覆盖媒体
  规格和身份闭包，最终内容质量仍需检查。Creator 交付自动订阅不在此入口中。

本地回归：`node --test packages/episode-pipeline/seedance-*.test.mjs`，以及
`python3 packages/episode-pipeline/tests/seedance/seedance-dispatch.test.py`、
`python3 packages/episode-pipeline/tests/seedance/seedance-delivery.test.py`。测试模拟云服务；合成媒体用来
验证回收契约，不构成真实提供商成功或视觉质量的证据。
