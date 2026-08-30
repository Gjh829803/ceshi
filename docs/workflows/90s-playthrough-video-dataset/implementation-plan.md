# 实施与验收记录

## 原则

- 先冻结合同和 Provider 事实，再接 UI；不把实验脚本直接塞进 Studio 主流水线。
- 复用当前世界、Runtime、录制和视觉资产，不修改 Planner/Builder 权威边界。
- 自动试玩是白膜成功后的独立工作流，默认由用户或数据批次显式触发。
- 每个 Stage 可停止、恢复和重试；不因下游图像/视频失败阻断进入白膜世界。
- 机械合同自动 Gate，视觉质量保留指标和人工审核，不增加脆弱的图片比例规则。

## Phase 0：外部能力烟测（进行中）

### MG Seedance 480p

用一条已规范化 30 秒白膜视频、1 张样式首帧和 1 张主体三视图测试准确型号
`mg-seedance-2.5-480p`：

- 验证 API base、鉴权、submit/poll/download；
- 验证是否接受直接 `reference_videos`；
- 验证 30 秒、16:9、原生 480p、图片数量和音频；
- 保存净化后的 Request/Result，不保存 Key 和签名 URL；
- 失败时不尝试抽帧 fallback。

MG 完成后调用 `cf-超分-720p-30s`。准确 MG/CF model id 已确认存在；当前单 Case 会同时
验证直接参考视频、MG 音频、30 秒 480p 原片与 720p 超分输出。
Phase 0 只做最小烟测，不批量烧量。任一目标型号合同不成立时，方案停在 Provider Adapter
边界，不改用其他模型冒充。

## Phase 1：合同与 Validator（已实现）

新增独立 package（建议 `@whitebox-world/playthrough-dataset`）：

- `PlaythroughPlanV1`、`SeedancePromptEventV1`；
- `ExecutedPlaythroughTraceV1`、`SegmentManifestV1`、`EpisodeManifestV1`；
- Tick/Frame 映射、三窗口随机采样、输入冲突和 Segment Frame Range；
- WASD/Shift/Space 与 Camera Direction Coverage 报告；
- Event 时间、Grounding、完整性和禁止结构变化 validator；
- canonical JSON 和 Hash。

不直接扩展现有 `SimulationTakeV1` 的关闭 Union。首版通过 Adapter 把
`PlaythroughPlanV1` 的移动/相机部分编译为现有 Fixed Input；Seedance Prompt Event 仅作为
派生视频 Metadata，不进入 Runtime。等合同稳定后再评估 Simulation Take V2。

## Phase 2：Codex Playthrough Planner（已实现）

创建专门 Skill 和 Host Runner：

- Skill 只解释世界证据、真实玩家行为、探索目标、Prompt 边界和输出合同；
- Skill 目录提供 `inspect-world-for-playthrough`、`validate-playthrough-plan`、
  `replay-playthrough-review` 脚本；
- 云端/本地 Codex 开关沿用现有设置；正式批量默认支持云端独立单任务并发；
- 一个 Codex Job 内侦察、写剧本、自检和修复，不增加后置 Repair Agent；
- 输出完整计划和 Self-check Report，Host 再做 Schema/Hash/Capability 校验。

测试至少覆盖：狭窄步道、开阔地面、水面载具、飞行主体、无跳跃 Capability、易卡住边界、
不连通区域和地标分散世界。

## Phase 3：Seedance Prompt Event Authoring（已实现）

新增三个清晰边界：

1. `PromptEventAuthor`：根据当前世界证据、用户参考和试玩动作写三条可直接渲染的事件块。
2. `PromptEventValidator`：检查时间、Grounding、单一主事件、动作兼容和禁止结构变化。
3. `SegmentPromptComposer`：把事件原文嵌入现有白膜/外观权威模板，不改写事件含义。

必须证明：

- 每条 Prompt 明确目标、开始秒数、过渡、完成状态、动作耦合、声音和负面限制；
- Prompt 只能描述现有主体/环境的视觉变化，不要求 Seedance增删实体或改变拓扑；
- 需要额外主要姿态的能力事件必须与白膜剧本中真实动作对齐，否则拒绝；
- 三条 Prompt 不得复用需求示例或使用同一模板只替换名词；
- Event 原文和 Hash 在 Planner 输出、Segment Metadata 和最终 Provider 请求间保持一致；
- 白膜 Runtime 不执行 Event，也不生成虚假的 Gameplay Receipt。

## Phase 4：90 秒 Runner 与录制（已实现）

扩展 `CanvasRecorder` 的 Host 控制，不复用页面按钮模拟人工点击：

- Runtime Ready/Reset/Activity Lock；
- 90 秒单调时钟 Timeline；
- 输入状态和相机变化调度；Prompt Event 只记录 Timeline Marker；
- Stop/Cancel/Browser Crash 恢复；
- 1280×720、24 fps 母片规范化为 2160 帧；
- 独立有界面 Chromium 承载 WebGL 长录制，避免 headless 合成器降低画面提交频率；
- 规范化前探测原始视频帧数，90 秒至少 1800 个真实提交帧，否则以
  `EPISODE_RAW_CAPTURE_CADENCE_FAILED` 阻断，禁止靠补帧掩盖卡顿；
- 执行 Trace、Coverage 和异常记录；
- Frame-exact 三段切片和三张首帧导出。

长录制应有独立本地浏览器槽位，避免与白膜 Capture、用户试玩和其他评测平台争用同一
页面/进程。任务停止时先终止 Runner 和 MediaRecorder，再保留已完成上游制品。

## Phase 5：Episode Visual Reconstructor（已实现）

在当前 `worldkit-visual-reconstructor` 基础上增加 Episode 模式：

- 三张白膜分段首帧分别锁空间；
- 用户图锁外观；
- 三张 Styled Frame 保持同一身份、材质和世界风格；
- 每张 Styled 首帧表达当前 Segment Event 发生前的基础外观，不能提前渲染事件；
- 白膜三视图输入一次、Styled 三视图输出一次；
- 失败的单张首帧/单个目标允许同一 Codex Job 内一次重试；
- 不重新生成白膜、不要求人工试玩。

## Phase 6：Segment Prompt 与 Provider Adapters（已完成真实单 Case Provider 验收）

### Segment Prompt

从现有录制 Prompt 模板派生，不复制 Provider 逻辑。每个 Prompt 明确：

- 白膜分段是运动/相机/时序/空间权威；
- Styled 首帧和三视图是外观权威；
- Seedance Prompt Event 原文、相对秒数、变化过程和持续时间；
- 同步音效、无音乐/语音；
- 禁止切镜、新动作、新人物和结构变化。

### Provider

实现单一 `OvSeedance25VideoAdapter`，Provider 配置放项目内受控
配置文件，Secret 只从项目运行时 Secret 文件/环境注入，不写进制品。Adapter 统一输出：

- stable request id / provider task id；
- status、sanitized error、started/finished；
- 原始媒体 Hash 和 ffprobe metadata；
- 下载/恢复方法。

三段可以一个 Provider batch 提交，也可以三个单 Item；无论哪种形式，Segment ID 和
request id 必须独立，某一段失败不能重跑其他成功段。

## Phase 7：媒体 Conformance 与 Studio（已完成真实单 Case UI 验收）

复用当前 Seedance Media Conformance，扩展为 Segment Pair：

- 白膜和最终视频都为 1280×720、24 fps、720 帧、30 秒；
- 最终视频包含音频，白膜可静音；
- 三条白膜 Segment 的 Frame Range 完整闭合 2160 帧母片；
- 输出 Pair Report 和 Episode Delivery Report。

Studio 增加独立 Episode 视图：

- 90 秒时间线、按键分布、相机方向、三条 Seedance Prompt Event 和 Marker；
- 地图覆盖轨迹与未访问区域说明；
- 90 秒母片和三条白膜分段；
- 三张 Styled Frame、共享三视图；
- OV Seedance 原始 720p、最终 Conformed 视频；
- 同步双播放器和逐段下载；
- Stop、从失败 Stage 重试、删除 Episode（需明确操作），均不影响 World Record。

## 验收测试

### 硬合同

- 5400 Tick、2160 母片帧、三段各 720 帧；
- 三个 Prompt Event 各自在正确窗口且随机结果可复现；
- WASD/Shift/Space 和上下左右 Camera Coverage 报告完整，`S` 跨三段分散；
- Event Prompt 缺少目标/时间/变化过程或要求结构变化时稳定拒绝；
- Prompt Event Marker 与视频 Timeline 对齐；
- Segment 无重叠/缺口；
- OV Seedance 请求具备本地持久任务接管，连接中断后继续轮询原 Task；
- 最终白膜/Seedance width、height、fps、frame count、duration 完全一致；
- Provider 失败不改变白膜世界 `ready/enterable` 状态。

### 人工/质量审核

- 行为是否像真实玩家而非键位覆盖脚本；
- 90 秒内是否合理最大化探索；
- 镜头观察是否自然且不眩晕；
- 三条 Prompt 是否真正依据场景且没有复用需求示例；
- Seedance 是否在指定时间渲染事件、没有改变拓扑或增加人物；
- Styled 首帧与白膜空间一致；
- 生成视频是否保持动作、相机、身份和场景连续性。

## 实现前需要确认的产品事实

1. Prompt 文本不显示在白膜视频或最终视频 UI 中，而作为 Seedance 的视频内渲染指令。
2. 三条 30 秒生成视频当前按独立样本处理，不继承上一段 Event 的视觉结果。
3. 对无跳跃能力的主体，是否接受一次 `Space` 能力 Probe/no-op，还是要求过滤这些 Case。
4. `mg-seedance-2.5-480p` 的准确 API 合同与可用 model id 必须由
   Phase 0 烟测确认，当前不能宣称已接通。
