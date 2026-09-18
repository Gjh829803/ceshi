# 海滨小镇：Creator 交付到公共播放器验收

日期：2026-09-17。工作区：`agent-whitebox-world-sdk-stream-design`，分支 `codex/world-stream-ui`。

> 后续新增了本地直出 UI 和 case 启动脚本；以下身份保留为当时正式交付快照，不能作为后续重新编译版本的身份。

## 本次完成范围

当前 Codex Agent 根据用户提供的海滨小镇图片，按正式 Creator Agent 文档编写简化白模与独立 UI。
通过真实 Creator CLI 同一会话执行 `world_validate`、`world_preview`、`world_inspect`、完整 `world_playtest`、`world_submit`，
再从封装交付包取出原始作者源码，放入公共目录，由 Stream CLI 启动 Chromium 并接入公共 React 播放器。
用户已选择先验收白模＋UI，未接入世界模型转换；没有启动远程生产 Agent 作业或部署 GPU 服务。

公共目录为 [examples/worlds](../../examples/worlds/README.md)，默认 `pnpm dev:stream` 扫描该目录。
当前仅展示 [海滨小镇](../../examples/worlds/seaside-town/README.md)。旧 health-bar/mission demo 不再出现在默认世界列表；
`examples/three-creator` 的 SDK API 示例仍有测试和 Agent 发现消费者，保留作为 fixtures，不混入公共 demo 目录。
历史录制、交付和评审证据保留。旧临时 53901 服务已关闭，当前演示使用 `http://127.0.0.1:53900/`。

## 世界内容和 UI

保留海面帆船、海港栏杆、喷泉广场、咖啡馆、上坡旧街和灯塔的主要关系，按用户要求简化细节。
人物使用获准的 `humanoid.uefn-mannequin`，同一角色可上下自定义摩托车，使用 SDK 原生行走/驾驶能力。
没有额外任务或收集要求；海面/船只为景观，海滨有物理边界，不支持游泳。

UI 单独声明 catalog、state schema、JSON 布局/显隐绑定及 React 组件：地点、步行/骑行、实际速度、可隐藏指南、操作按钮。
世界端只输出场景画面和可序列化状态；操作回传后更新权威状态，播放器依据源帧时间应用 UI。
UI 布局以 1280×720 为设计坐标，在 854×480 视频下仍按公共播放器缩放。

## Creator 实际证据

- 完整输入计划：先站稳，再上车、沿街反馈控制驾驶、停车、下车、步行、转镜头和跳跃。
- `world_playtest.status = passed`，`isCompleteEpisode = true`。
- 实际墙钟 32.79 秒，移动 66.61 米。
- 视频 32.277 秒、93 帧、960×540；录制请求 3 fps，用于覆盖验证而非性能测评。
- 街道目标已到达；路由、上下车连续性及检查结果见真实回执。
- 交付 `technicalStatus = passed`，`status = ready-for-independent-review`，`semanticStatus = unreviewed`。
- 已人工查看开场、骑行和下车关键帧。简化程度符合本次原型范围，不将技术通过声称为独立语义评审通过。
- 场地连通性与路线预计可供多路径探索，5 分钟为估计容量；没有声称逐路实测 5 分钟。

## 同一产物验证

| 身份 | 值 |
| --- | --- |
| Source | `d24bfd9f563318cb946099e3825c997e7c756621af09ba13e5e2fd998a42d291` |
| World build | `b79f30887cd6cd778c24b498051d8b2fdde9979288f504e27803163ce4b00d06` |
| Runtime | `66de15ea7e1d1a61622e908e1892652182fccc63fe48870022dd62a75b477197` |
| UI bundle | `772b672eee595f2093482eb37fd20ef4574d02d2019c17226da1ebade22052bc` |
| Episode | `d9ab47477ee544a11a91bc7b0e7a99f276fdc7a18f6bea36ea509d95c14d4906` |
| Archive SHA-256 | `5520b44294df7047d51a577e1281eed49b420d7eab357c723702944c793c9265` |

公共项目与正式交付的 115 个 source/playable 封装文件逐一一致。
分别从仓库根目录和 `packages/stream-host` 编译均得到相同文件与身份；HTTP 世界列表和浏览器实际会话显示同一 World/UI identity。
晋升时不把编译器生成的 `ui/catalog.generated.ts` 当作新的作者输入；生成类型仍包含在正式交付包里。

## 公共播放器实际操作

在 Codex 内置浏览器验证：

- 真实白模视频和自定义 UI 同时出现；F 回传后步行→骑行→步行。
- 指南隐藏后卸载；仅 UI 模式仍能通过按钮恢复指南。
- 仅 UI：视频连接未订阅，控制连接、UI 和操作仍可用。
- 仅视频：UI 未订阅且隐藏，控制/操作仍保留；恢复双流正常。
- 重置保持会话 ID、增加 epoch、回到初始位置和步行/指南显示状态。
- 720p/24 目标动态改为 480p/12 目标，世界状态与 epoch 保持不变。
- 观察到 UI 未映射帧为 0。本机 Chromium headless 使用 SwiftShader 软件渲染，720p 观察约 4–8 fps，480p 约 10 fps；
  当前预览保留 480p/12 目标以降低本机负载。这些是现场样本，不是 GPU 吞吐或稳定性能保证。

## 本次链路中修复的问题

1. 编译依赖进程 cwd：不同 CLI 启动位置将路径写入打包注释/模块名，造成同源产物不一致。
   runtime/addon 固定仓库基准，scene/UI 固定作者源码基准；增加跨 cwd 完整封装与跨目录 UI 哈希回归。
2. 新场景重复创建 presentation：Stream Host 应持有唯一 presentation 和远程输入 lease。
   删除作者场景的重复创建，并补入 [Agent UI 指南](../../packages/creator-host/docs/agent/ui.md)。
3. 结构化 SDK 错误跨 Playwright 只显示 `Object`：启动边界保留 JSON 诊断，实际定位到 `PRESENTATION_ALREADY_EXISTS`。
4. 默认世界目录与友好名称：增加公共 demo 目录，按 case.json 显示标题，目录名作为稳定 ID；忽略点目录。

## 验证与限制

5 个相关 Vitest 文件共 28 项：27 项首轮通过，1 项 workspace-runtime 在并行录制/构建时超过默认 5 秒；
该失败项独立复测 2.51 秒通过，没有放宽超时或修改断言。包含真实编码传输/回传/恢复、Creator 编译和 Episode source export 消费。
类型检查、相关 ESLint、181 文件测试清单、workspace 边界、最终 runtime prebuild、应用 Vite build 和 diff 检查通过。
Vite 仍有既有大 bundle 提示；未作为此次案例扩展优化。

未运行云 Agent、Linux 镜像、GPU 部署、世界模型转换、Seedance 或 App 侧叠加。
所有修改仍是本地未提交状态。

## 本地证据

- [Creator playtest 回执](../../.codex-tmp/seaside-town-production/evidence/deliver/world_playtest.json)
- [Creator submit 回执](../../.codex-tmp/seaside-town-production/author/creator-result.json)
- [完整交付包](../../.codex-tmp/seaside-town-production/author/creator-delivery.tar.gz)
- [公共目录逐文件比对](../../.codex-tmp/seaside-town-production/evidence/public-identity.json)
- [package cwd 比对](../../.codex-tmp/seaside-town-production/evidence/public-identity-package-cwd.json)
- [浏览器验证摘要](../../.codex-tmp/seaside-town-production/evidence/browser-receipt.json)

生成记录、归档和临时运行目录全部保留在忽略目录，公共目录只保留源码与用户参考图。
