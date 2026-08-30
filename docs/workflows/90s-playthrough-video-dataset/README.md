# 90 秒自动试玩与视频数据工作流

> 状态：首版端到端实现与单 Case 验收中。本目录同时记录已确认需求、当前代码合同、
> Provider 边界和后续质量迭代；Studio 中每个阶段的已落盘工件均可独立查看。

## 目标

从现有参考图片库出发，为每个成功白膜世界自动生产一条 90 秒、接近真实玩家行为的
试玩 Episode，并把它切成三条 30 秒白膜视频。每条视频具有自己的样式化首帧，三条视频
共享同一组完整视觉目标三视图。随后直接调用指定的
`mg-seedance-2.5-480p` 生成原生 480p 视频，再由 `cf-超分-720p-30s` 提升画面清晰度，
最终规范化为与白膜分段在分辨率、帧率、时长和帧数上完全对齐的视频对。

## 已确认需求

1. 图片库和“参考图 → 白膜世界”流程已经存在，本期从成功白膜世界开始。
2. 每个世界调用一次 Codex。Codex 必须先阅读世界代码和可信运行产物，再通过实际试玩
   探查世界，最终一次性写出完整 90 秒游玩剧本。
3. 剧本必须像真实玩家：使用 `W/A/S/D`、`Shift`、`Space`，上下左右观察并回正镜头，
   组合行走、转向、回退、跑步和跳跃，尽可能探索可达地图。`S` 必须具有真实、分散的
   使用分布，不能只为了过检查在结尾点按一次。
4. 在全局 `[10s,20s)`、`[40s,50s)`、`[70s,80s)` 三个窗口中，各按固定随机种子选择
   一个注入时刻，并各写一条高质量自然语言 `SeedancePromptEvent`。事件不由白膜 Runtime
   执行，而是在对应 30 秒 Seedance 视频中按相对时间渲染。
5. 三条 Prompt 必须依据实际世界设计，不能照抄举例，但必须属于同等级别的大幅电影化
   变化：主体大幅变身、能力显现、广域环境状态/材质转化或天空/大气奇观。小尘尾、小粒子、
   接触飞溅、微弱高光和轻微调色不合格。允许大范围瞬态视觉体和 Event 授权的主体/环境
   外观变化；禁止新增/删除持久实体、增加人物、改变碰撞与空间拓扑或移动标志物。
6. 自动录制一条 1280×720、24 fps、16:9、精确 90 秒的白膜视频，共 2160 帧；再按帧
   切成三段 30 秒视频，每段 720 帧，不能重叠、缺帧或跨段复制帧。
7. 从三段白膜视频分别提取第 0 帧，并分别生成样式化首帧；完整视觉目标三视图只生成
   一次，供三段共享。
8. 每段由白膜锁定根节点轨迹、主要动作节拍、相机和空间，由 Seedance 按主体运动方式
   补全自然肢体/推进微动作；样式首帧和三视图锁定基础外观。直接调用目标型号
   `mg-seedance-2.5-480p`，随后只对 MG 结果调用 `cf-超分-720p-30s`。
9. 最终视频规范化为 1280×720、24 fps、720 帧、30 秒，与白膜参考逐项一致；画面来自
   CF，声音始终取自 MG 原片。生成视频需要场景音效，但不加入音乐、对白、旁白或歌声。

## 权威边界

- 世界代码、Authoring/Runtime 制品：世界结构、碰撞、主体能力和可达空间权威。
- `PlaythroughPlan`：录制前的输入、镜头和 Seedance Prompt Event 计划权威。
- `ExecutedPlaythroughTrace`：实际执行的按键、相机和 Tick 权威；不声称白膜执行视觉事件。
- 90 秒白膜视频：最终运动、镜头、时序和空间遮挡权威。
- 三张样式化分段首帧：每段起始外观和画面风格权威。
- 一组三视图：完整主体和标志物身份、结构及材质权威。
- MG Seedance 视频：派生视觉数据，不得反向修改世界或执行轨迹。

## 当前可复用能力

- [`CanvasRecorder`](../../../apps/playground/src/canvas-recorder.ts) 已固定
  1280×720、24 fps、16:9 录制画布。
- [录制与视频工作台](../../23-recording-and-video-workbench.md) 已实现整秒裁切、白膜视频
  规范化、Codex Prompt、参考视频生成、音频要求和逐帧对齐。
- [`SimulationTakeV1`](../../../packages/control-capture/src/types.ts) 已实现 60 Hz 固定 Tick、
  `W/A/S/D` 对应的 Control Intent、跑步、跳跃、Camera Rig 和 24 fps Capture Schedule。
- Browser Protocol V5 已提供固定输入、相机调整、可信 Runtime Snapshot、Render Ready
  和 Control Capture。
- 当前视觉重建 Agent 已支持“实际白膜首帧是空间底图、用户图是外观权威”，并一次生成
  完整目标三视图。
- 当前录制工作台把 MG 480p 原片交给 CF 做生成式超分，再固定为 1280×720、24 fps、
  与白膜相同帧数；普通 FFmpeg 只做最终规格对齐，不冒充超分。

## 当前实现

- `scripts/episodes/inspect-playthrough-world.ts` 通过真实 Browser Protocol 侦察主体、移动和镜头。
- `worldkit-playthrough-planner` Skill 与 LWDP Codex Runner 生成并自检 90 秒剧本。
- `scripts/episodes/run-playthrough-capture.ts` 执行真实键鼠时间线，录制 2160 帧母片并切成三个
  精确 720 帧的白膜片段。长录制使用独立的有界面 Chromium：无界面 Chromium 的
  WebGL 合成器可能在模拟仍为高 FPS 时只向 `captureStream` 提交不足 1 FPS 的真实画面。
  Runner 会在规范化前探测原始提交帧数；90 秒低于 1800 帧直接失败，禁止用 FFmpeg
  重复少量旧帧伪装成 24 FPS。Prompt Event 在这里只记录 Marker，不修改 Runtime。
- `worldkit-episode-visual-reconstructor` 在一个 Codex ImageGen Job 中生成三张事件发生前
  的最终样式首帧和一套共享三视图。
- `scripts/episodes/build-episode-seedance-prompts.mjs` 保持每条 Event 原文与 Hash，并写入对应
  30 秒 Seedance 渲染 Prompt。生产模板锁定为
  `worldkit-reference-video-relaxed-action@1`：根轨迹和镜头严格服从白膜，滑行、划桨、
  飞行、行走等肢体动作允许按场景补全自然发力和过渡帧。
- `scripts/episodes/run-episode-video-segment.py` 以可恢复任务记录直接调用准确型号
  `mg-seedance-2.5-480p`，再调用 `cf-超分-720p-30s`。最终画面强制对齐为
  1280×720、24fps、720 帧，音轨仍取 MG。Adapter 会在最终规范化前要求 MG 和 CF
  结果都至少覆盖 29 秒并具有相应真实源帧，
  避免把意外短片复制成 30 秒后误判为成功；缓存身份包含模型、Prompt、白膜和全部图片
  Hash，换模型或改 Prompt 不会误用旧任务。
- `scripts/episodes/run-episode-workflow.mjs` 串联所有阶段；三段视频阶段并发执行，已成功段不会因
  另一段失败而重提 Provider 任务。
- Studio 世界详情的“90 秒数据”页签把 90 秒拆为三个独立 30 秒验收阶段；每段将白膜
  动作真值与最终视频并排并支持一键同步播放、暂停和复位。播放器下方依据实际执行
  Trace 动态展示 W/A/S/D、方向键、空格与 Shift 状态，并在实际 Marker 时刻高亮本段
  Prompt Event；事件 Prompt 直接展示，完整 Seedance Provider Prompt 可展开检查。
  三段对比下方集中展示用户参考图、世界规划图、三组白膜/样式首帧和共享白膜/样式
  三视图，并提供 `interaction-timeline.json` 等输入/Prompt/Provider 文件的独立下载。
  “一键下载全部 ZIP”使用稳定的 `<episode-id>-seedance-review.zip` 命名，包含所有白膜、
  MG、CF 与最终视频及可移植审阅元数据；其余阶段产物、Provider 任务状态与日志继续保留
  在同一页。

准确的 MG 与 CF Provider model id 已通过项目内凭证查询确认。完整 30 秒
`reference_videos`、音轨、480p 生成与 720p 超分合同以单 Case 真实运行为最终验收，
不提供抽帧降级。MG 型号没有
固定时长后缀，Provider 合同要求明确传 `seconds=30`；Host 仍独立验收返回媒体覆盖
30 秒；CF 的固定 30 秒型号使用 `seconds=1` 哨兵值。Host 对两级返回媒体都做真实时长与
源帧验收，再裁成精确 720 帧。

不允许用抽取少量白膜帧替代直接参考视频并宣称运动锁定；若目标 OV 型号不支持 30 秒
参考视频，该 Stage 必须明确失败并等待 Provider 能力，而不是静默降级。

## 文档索引

- [workflow-design.md](workflow-design.md)：端到端状态机、Codex 规划、执行、录制、视觉和
  Provider 架构。
- [data-contracts.md](data-contracts.md)：Episode、游玩剧本、Prompt Event、分段和交付包
  的建议 JSON 合同。
- [prompt-event-authoring.md](prompt-event-authoring.md)：Seedance Prompt Event 的证据输入、
  时间结构、动作耦合、写作合同和审核标准。
- [implementation-plan.md](implementation-plan.md)：实现阶段、测试策略、迁移边界和待确认
  Provider 事实。
