# 工作流设计

## 1. 总体链路

```text
Reference Image Library
  → existing Whitebox World pipeline
  → World Ready bundle
  → Codex reconnaissance + playthrough planning
  → immutable PlaythroughPlan + 3 SeedancePromptEvents (90 s)
  → automated real-time replay + 720p/24 fps recording
  → 90 s Whitebox Episode + Executed Trace
  → frame-exact split: 3 × 30 s
  → one Codex visual reconstruction job
       ├─ 3 styled segment opening frames
       └─ 1 shared complete-target styled tri-view set
  → 3 segment-specific video prompts
  → MG Seedance 2.5 480p batch
  → CF 720p 30 s upscale batch
  → exact media conformance + paired delivery
```

世界生成仍然在样式化首帧之前完成。自动试玩和视频生成属于独立、可重试的数据生产
工作流；任何失败都不能把成功白膜世界改成不可进入状态。

## 2. Episode 状态机

```text
world-ready
  → reconnaissance-running
  → playthrough-planning
  → playthrough-validating
  → whitebox-recording
  → whitebox-recorded
  → segmenting
  → visual-reconstructing
  → segment-prompts-ready
  → mg-generating
  → cf-upscaling
  → media-conforming
  → ready
```

每个 Stage 保存输入 Hash、输出 Hash、开始/结束时间、执行端、Provider Job ID、稳定
`request_id` 和错误。下游失败只从该 Stage 恢复：例如 CF 失败不重跑 MG，MG 失败不重录
白膜，视觉重建失败不重跑 Planner/Builder。

## 3. Codex 试玩规划

### 3.1 一个 Codex Job 内完成

推荐沿用正式 `gpt-5.6-sol / xhigh` 单任务模式。一个世界只创建一个规划 Job，并在同一个
Job 内完成：

1. 阅读 Scene Brief、Authoring/世界实现代码、Visual Target、移动模式、Runtime Snapshot、
   俯视规划图、实际进入首帧和可用 Capability。
2. 使用项目提供的只读/可回滚试玩工具进行侦察。工具允许固定输入、相机调整、截图、
   Snapshot、可达空间采样和恢复到出生点，不允许改代码或世界定义。
3. 先提出覆盖目标和路线，再生成完整 90 秒脚本。
4. 调用同目录的 validator 和 replay-review 工具自检；若出现卡住、坠落、越界、输入缺失
   或覆盖明显不足，在同一 Job 内修正，最后只交付一份正式计划。

Host 不在失败后另起 Planner Repair Agent。Codex 获得诊断脚本并在自己的任务里闭环。

### 3.2 侦察证据

侦察输出至少包含：

- 主体移动能力与当前控制映射；
- 出生位置和相机配置；
- 地面/水面可达连通分量，或飞行/游泳的可探索采样空间；
- 视觉目标位置、可见方向和建议接近点；
- 碰撞、边界、悬崖、不可穿越体和容易卡住的区域；
- 短动作 Probe 的位移、朝向、速度、是否落地/受承托及截图。

“地图尽可能全部探索”不能简单变成固定路线。地面主体以可达表面单元和视觉目标覆盖为
目标；水面、飞行和游泳主体以空间采样网格、观察方向和地标可见性为目标。90 秒不能覆盖
的部分要记录未访问原因，而不是通过加速穿墙、瞬移或修改世界解决。

### 3.3 输入行为策略

剧本保存原始键位与编译后的语义动作。默认分布策略如下，后续可依据数据统计调整：

- `W` 是主要前进输入，但不得形成 90 秒单一长按。
- `A`、`D` 都必须跨多个位置出现，用于转向、侧移、绕障或观察地标。
- `S` 至少形成三个互不相邻的真实回退 Episode，三个 30 秒分段各至少一个；默认目标是
  占有效移动时间的 5%–10%。回退应服务于避障、重新取景或离开死角，不能只是空地点按。
- `Shift` 形成多次独立跑步/加速段，并与普通速度交替。
- `Space` 在主体支持跳跃、上升或对应离散动作时正常使用；不支持时仍允许一次短能力
  Probe 并记录 `unsupported/no-op` Receipt，但不得伪造跳跃结果。
- 镜头必须包含左看、右看、抬头、低头和回正，分散在全程；保持第三人称空间连续性，
  不自行切镜、瞬移相机或长时间背离移动方向。
- 同时按键和持续时间必须符合真实输入：允许 `W+Shift`、`W+A`、`W+D` 等组合，禁止
  高频逐帧抖动或机械等长循环。

结构检查只证明键位覆盖；“像真实玩家”和探索质量由回放统计、轨迹可视化和人工审核
判断，不使用脆弱的图片像素占比 Gate。

## 4. 三条 Seedance Prompt Event

### 4.1 时间

Episode Seed 决定三个事件 Tick：

- Event 1：全局 `[10s,20s)`；
- Event 2：全局 `[40s,50s)`；
- Event 3：全局 `[70s,80s)`。

每个窗口均匀采样一个 60 Hz Tick，选择结果写入计划，因此“位置随机”可复现。三个事件
分别落在三条 30 秒分段的中部，Segment 相对时间都处于 `[10s,20s)`。

### 4.2 渲染职责

三条 Prompt 是 Seedance 的视频内事件，不是白膜 Runtime 命令。白膜录制从头到尾只执行
玩家操作和相机；Event 文本、选中 Tick 与对应动作上下文作为 Segment Metadata 保存。
生成阶段把 Event 作为独立、不可丢失的 Prompt Block 交给 Seedance，要求模型在指定的
Segment 相对时间把视觉变化渲染出来。

因此同一对视频的职责是：

- 白膜 Segment：事件发生前后的运动、镜头、空间和遮挡参考；自身不显示视觉变化；
- Styled 首帧和三视图：事件开始前的身份、材质和环境外观；
- `SeedancePromptEvent`：何时、对哪个现有目标、以什么过程发生何种视觉变化；
- Seedance 输出：在不改变白膜运动和空间的情况下呈现该事件。

### 4.3 内容边界

Codex 只能依据当前 Scene Brief、主体能力、视觉目标和侦察结果创作 Prompt。需求说明里的
示例只用于解释能力边界，不进入 Agent 的候选模板、随机词表或 few-shot；正式输出不得
照抄或近义改写示例来凑数。

允许的变化：

- 已存在主体的材质、颜色、发光参数、服装资源变体等视觉状态；
- 已声明主体能力或 Semantic Action 的触发，以及对应的非碰撞 VFX；
- 地形和环境的材质/表面表现、天空、雾、光照、天气表观；
- 非碰撞、非持久实体的粒子、体积和后处理效果。

禁止的变化：

- 新增/删除人物、主体、建筑、标志物或其他持久 Gameplay Entity；
- 移动、缩放、替换现有碰撞体或改变可通行拓扑；
- 改变房间/室外地形等整体空间类型；
- 传送主体、修改相机轨迹、增加切镜，或以视觉效果遮蔽整个可玩画面；
- 调用世界没有声明的技能、服装或资源并假装成功。

### 4.4 高质量 Prompt 合同

每条 Event Prompt 都必须完整表达：

1. **准确时间**：Segment 相对第几秒开始，过渡持续多久，效果保持、增强还是消退。
2. **现有目标**：使用 Scene Brief 和 Visual Target 中的自然名称，明确主体、地标、环境
   区域或全局渲染层；不得用“角色”“场景”这种无指向代词作为唯一目标。
3. **变化前状态**：以当前 Styled 首帧/用户参考为基础，说明哪些身份与材质必须保持。
4. **可见变化过程**：颜色、材质、光照、粒子、体积、能量或环境表观如何从初态连续演变，
   包含方向、范围、速度、强弱层次和与现有表面的接触/遮挡关系。
5. **变化后状态**：事件完成后的稳定画面或自然消退状态，不能只写抽象概念词。
6. **动作耦合**：明确白膜中的主体动作、速度、朝向和镜头继续原样执行。需要释放能力的
   事件必须与剧本中预留的对应按键/动作时刻对齐；不能让 Seedance凭空增加主要姿态。
7. **空间不变量**：不移动、增删或替换现有实体，不改变碰撞、路线、地形轮廓、遮挡顺序
   和相机轨迹。
8. **声音**：只描述与事件同步的环境/动作效果音；无音乐、对白、旁白、歌声。
9. **负面限制**：无新增人物、肢体异常、材质跳变、闪烁、文字、Logo、UI 或切镜。

Prompt 必须是可直接嵌入 Seedance 最终 Prompt 的自然语言事件块，而不是标签、关键词列表、
JSON 摘要或创作解释。它应只包含一个清晰的主要事件，允许少量从属光照/粒子响应，避免
在 30 秒片段里堆叠多个互相竞争的变化。

正式 Agent 指令不提供需求说明中的具体示例作为 few-shot 或候选词库，只提供当前世界的
证据、允许/禁止边界和上述结构。这样模型必须从实际场景推导事件，而不是复述示例。

## 5. 90 秒自动执行与录制

### 5.1 时间轴

- Simulation：60 Tick/s，`[0,5400)`。
- Capture：24 fps，Frame `[0,2160)`。
- 输出：1280×720、16:9、H.264/MP4，白膜允许静音。

`RealtimePlaythroughRunner` 在 Runtime Ready 后重置世界并冻结计划，先启动录制，再根据
同一单调时钟调度输入和相机。Prompt Event 只在对应 Tick 写入 Trace Marker，供后续
Seedance Segment Prompt 对齐，不修改 Runtime。实际下发 Tick、墙钟时间、Snapshot 和
异常写入 `ExecutedPlaythroughTrace`。Runner 录制略多于 90 秒缓冲，
最终规范化只保留计划对应的 2160 帧。

当前 `CanvasRecorder` 可作为首版编码器，但需要增加脚本控制入口和终止保护。后续可切换
为离线逐帧 RGB Take Renderer；两者必须输出相同的计划/执行 Trace 合同。

### 5.2 运行恢复

剧本可以声明有限的状态条件恢复策略，例如检测持续无位移后回退、回正镜头或选择已规划
的备用方向。实际执行动作必须落入 Trace。禁止录制过程中让 Codex重新规划、改代码、
瞬移或动态创建新路线。

## 6. 精确切片

90 秒母片规范化为 2160 帧后，按视频帧而不是浮点时间切片：

| Segment | Global frames | Global time | Local prompt window |
|---|---:|---:|---:|
| `segment-00` | `[0,720)` | `[0s,30s)` | `[10s,20s)` |
| `segment-01` | `[720,1440)` | `[30s,60s)` | `[10s,20s)` |
| `segment-02` | `[1440,2160)` | `[60s,90s)` | `[10s,20s)` |

使用 FFmpeg `trim=start_frame:end_frame` 和 `setpts=PTS-STARTPTS` 重编码，三段逐帧 Hash
清单必须能闭合回母片的连续 Frame Range。每段第 0 帧导出为白膜样式化输入。

## 7. Episode 视觉重建

一个 Codex 视觉重建 Job 接收：

- 三张分段白膜首帧；
- 用户原始参考图；
- 一组实际白膜完整目标三视图；
- Scene Brief、Visual Target Manifest 和三个 Seedance Prompt Event。

输出：

- `segment-00/01/02-styled-opening-frame.png`；
- 一组共享 `styled-triview.png`；
- 三段各自的视觉 Prompt 记录。

三张首帧分别以自己的白膜 Frame 为唯一空间底图，并表达各 Segment 在 Prompt Event 发生
前的基础外观。Event 只由该 Segment 的 Seedance 输出渲染，不能提前泄露到 Styled 首帧。
共享三视图锁定基础身份和完整目标结构，不为三个 Event 重复生成三套。

## 8. 三段视频 Prompt

每段调用一次现有录制 Prompt 合成逻辑，但增加：

- 当前分段对应的样式化首帧；
- 共享主体/标志物三视图；
- 该分段白膜视频；
- 该分段 `SeedancePromptEvent` 原文、Grounding Metadata 和相对发生时间。

白膜视频继续作为运动、相机、时序、空间和遮挡唯一权威。模型只在指定相对时刻执行已
批准的视觉变化，不得增加主要动作、人物、切镜或结构变化。Segment Prompt Composer
可以补充引用角色和限制，但不得弱化、改写或丢失 Event 的目标、时间和变化过程。

三条生成视频按独立 30 秒样本验收，不假设一个 Segment 的 Seedance视觉事件会自动成为
下一 Segment 的初始状态；跨段连续性若未来需要，应作为另一种 90 秒生成 Profile 设计。

## 9. MG Seedance 480p Provider 链

### 9.1 MG Seedance 2.5

目标型号按需求锁定为 `mg-seedance-2.5-480p`。Provider Adapter 每个 Segment 提交：

- 30 秒白膜参考视频；
- 当前分段样式化首帧；
- 共享三视图；
- 最终 Segment Prompt；
- 30 秒、16:9、480p、生成音效的请求。

实现前必须用一条 Segment 做 Contract Smoke：确认准确 model id、`reference_videos` 支持、
30 秒上限、图片数量、音频和轮询终态。若不支持直接白膜视频，整个 Adapter 标记
`unsupported`；不回退到只传抽样帧的 `-nv` 路线。

### 9.2 CF 独立超分

MG 的 480p 原始结果作为 CF 的唯一参考视频。CF 只能提升清晰度与分辨率，不得改变主体
细节、Prompt Event、动作、构图、颜色或时序；失败只重试 CF，不得重跑 MG。

### 9.3 最终媒体规范化

Provider 原始输出不直接交付。最终 Conformance 固定：

- 1280×720；
- 24 fps；
- 720 视频帧；
- 30.000 秒；
- 有音频流，音频只含同步环境/动作/事件音效；
- 无水印、字幕、Logo 或 UI。

最终校验同时读取白膜分段和生成分段，比较 width、height、fps、frame count、duration，
并写一份配对报告。视觉相似度、Prompt 效果质量和真实玩家感作为指标与人工审核项，
不使用脆弱的单一像素阈值阻塞白膜世界访问。
