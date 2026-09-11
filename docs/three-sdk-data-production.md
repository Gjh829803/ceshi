# Three 数据生产

生产链路使用同一份世界与运行时：**Agent 创作 → Creator 自检交付 → Episode
动作规划与真实录制 → 样式素材 → 视频请求 → Seedance 云端生成与 S3 回收**。动作、碰撞和状态由 SDK 执行，
视频 Prompt 使用实际记录的动作证据。

| 阶段 | 入口 | 输入与产物 |
| --- | --- | --- |
| 创作与交付 | `packages/creator-host` | 原图、需求、自由绘制/复用的 Mesh、能力绑定 → 可玩世界、源码、运行时、自检 |
| 案例选取 | 共享场景审核 | 明确选定的交付清单 |
| 源准备 | `packages/episode-pipeline/src/source/source.ts` | 验证的交付 → 可移植 `source.json` 与生产副本 |
| 规划与录制 | `workflow.ts`、`capture.ts` | 路线和动作计划 → 6×30 秒、1280×720、24fps，60Hz 模拟与 trace |
| 风格制作 | `visuals.mjs` | 1 套原图风格与 9 套重设计 → 锚点、各段首帧和目标三视图 |
| 事件与请求 | `event-prefetch.mjs`、`visuals.mjs` | 真实动作/视觉资料 → Prompt、单样式请求和最多 60 条汇总 |
| 视频生成与回收 | `seedance-preflight.mjs`、`seedance-dispatch.py`、`seedance-delivery.py` | 已审核请求 → 真实任务、原片、规格证据与私有 S3 交付 |
| 展示与恢复 | `report.ts`、`preview-server.mjs`、`resume.ts` | 真实产物、检查点、请求身份与人工反馈 |

Episode 素材准备使用 `--stop-before-seedance`；[Seedance 云端入口](three-episode-seedance.md)
独立执行准入、提交和回收。Creator 交付自动订阅尚未实现。媒体规格和持久化通过后，
最终内容质量仍需检查。

## 本地准备和执行入口

```sh
pnpm install --frozen-lockfile
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
pnpm three:episode:source \
  --payload /absolute/verified/payload \
  --output /absolute/production/source \
  --world-id selected-case \
  --reference-image /absolute/reference.png \
  --reference-image-sha256 ACTUAL_REFERENCE_SHA256
pnpm three:episode:batch register \
  --cohort production-run --cases-file /absolute/episode-ids.json
pnpm three:episode:run \
  --source-manifest /absolute/production/source/source.json \
  --output-root /absolute/production/episode \
  --episode-id selected-case-episode --cohort production-run --stop-before-seedance
pnpm three:episode:batch status --cohort production-run
pnpm three:episode:preview /absolute/production/episode/report 53847
```

工作流执行可能产生云调用。构建本身不启动生产。输出使用独立目录；源文件、资产
和实际运行时字节具有可校验身份。复制源包应复制完整依赖闭包，并在传输解包后
再次验证；精确调用方式见 [Episode README](../packages/episode-pipeline/README.md)。

## 配置与资源

[Host 配置示例](../packages/episode-pipeline/config/three-episode-runtime.example.json) 和
[launcher 配置示例](../packages/episode-pipeline/config/three-episode-launcher-runtime.example.json) 不含凭据。
填入实际胶囊、S3、镜像摘要和 cohort，保存在忽略目录或部署 Secret 中。

GPU 只用于白膜录制。一个任务录一个 Episode 六段，使用一个 L4 执行槽。
队列满 100 个兼容任务，或 cohort 所有生产者均已确知终结后，录制余量。
CPU 后处理独立接续；并发和服务账号是否可用以当前配置与真实状态为准。
模型账号分类参考[能力记录](evaluations/gpt6-three/account-performance/gpt6-capabilities-20260907.md)。

## 证据与恢复

- 记录真实输入、动作目标、执行结果、模拟状态、帧和相机；不可用动作明确失败。
- `ready-render-requests.json` 记录独立样式就绪，`pre-seedance-manifest.json`
  记录完整汇总。锚点通过、Prompt 完成、素材齐全与视频完成是不同状态。
- 请求结果未知时通过持久化的 request/job 身份协调，不重复提交。
- 保留已验证片段，失败案例不会重录整批。变更运行时创建新身份，不改写录像出处。
- 人工反馈沿用共享审核身份；图片决定只适用于其精确内容和范围。

Creator 云执行见 [云生成说明](../apps/creator-cloud/three-eval-README.md)，生产接续与
取消见 [Episode README](../packages/episode-pipeline/README.md)。
