# Creator 诊断与按需发现

基于已合入 #223 的 `origin/main`（`fe1c57e45`）开发，提交前同步 #224（`fc65bd48`）。本批处理此前清单中的 P2 诊断误读和 P3 发现冗余；P1 录制区间查询已在 #223。沿用现有观察与声明入口，不增加创作必经步骤。

## 实际行为

- Humanoid 地面分块的射线命中统一返回原地图对象 ID。车辆刚体的各碰撞部件返回车辆实例 ID；角色代理返回 `actorId`，不再返回内部部件键。释放后不保留旧映射，无法映射的仍返回 `collider-<handle>`。复用现有环境、车辆和角色索引，不改变碰撞体、过滤器或物理步进。
- 普通与 Humanoid 镜头在 authored 模式下，`desiredPositionWorldMetersXYZ`、`desiredYawRadians`、`desiredPitchRadians` 返回 `null`，不输出 follow arm distance / collision phase。实际位置和四元数仍可读取；Humanoid 改为读取真正的世界坐标，包含相机父节点变换。
- 相机观察从变换通道计算世界位姿，尊重手动 local/world matrix，不刷新相机或父节点的矩阵缓存，保留原有镜头写入保护。固定步/渲染异常在内部记录中保留结构化错误，并传至公开 snapshot，避免 RuntimeError 对象被替换为 Unknown failure。
- Episode 根据当前模式和有效数值决定是否发送 follow 相机意图；图像选点探测在无 follow yaw 时使用实际相机方向。控制器自身的相机输入方向 getter 未改动。
- `creator_get_authoring_schema` 在选择 sections 后才读取和解析对应声明。guide-only 不生成 public/factory/Humanoid 声明或 workspace runtimeDefinitions，仍保留来源身份和可选 sections。workspace SDK 的源文件完整性检查继续执行，不退回 Host 声明。
- 各专题 guide 只返回自己的正文；公共介绍保留在 getting-started 和 all，readHint 指向该入口。`sections:['all']`、直接 service schema、现有完整声明与示例入口继续可用。

相机遥测类型现在明确允许 null，外部数值消费者需要判断适用性；仓库内实际消费者已同步。已知碰撞 ID 修正只提高可定位性，不能将相邻物件、接触或近距判定当作已推动物件的证据。

## P3 证据和范围

前次中性练车记录查询了 6 次 schema、5 次示例，但次数本身不能证明冗余：上车、动态物件和镜头接线需要不同契约。本批先消除可复现的内部浪费及重复公共介绍，没有缓存“Agent 已读过”的会话状态，也没有裁掉按需声明或加长默认提示词。

同一进程依次查询四个 guide，以下为 JSON UTF-8 字节数和 RuntimeGuidance.source 声明读取调用数。临时测量脚本与原始结果在本 worktree 的 `.codex-tmp/discovery-{before,after}.json`。

| guide 主题 | 修改前字节 | 修改后字节 | 声明读取调用数 |
| --- | ---: | ---: | ---: |
| getting-started | 14,811 | 14,835 | 2 → 0 |
| humanoid | 43,157 | 41,535 | 12 → 0 |
| mounted-interaction | 11,865 | 10,245 | 15 → 0 |
| observation | 9,274 | 8,085 | 2 → 0 |

getting-started 增加的是入口提示；observation 包含本批新增的诊断语义。此表不能证明模型思考更快、发现调用更少或创作总耗时降低。workspace 源码仍需校验来源身份，不能把声明调用数为零表述为完全不读取 SDK 文件。

## 验证

受影响的 16 个文件共 335 项测试通过，覆盖相机状态切换、世界坐标、零步进观察、地面/车辆/角色 ID 与释放、驾驶/骑乘回归、声明的按需生成和来源一致性、实际 Creator 捕获、Episode 录制与真实 Chromium 选点探测。新增浏览器测试通过 TSX 运行实际消费者，避免 Vitest 对 page.evaluate 内 dynamic import 的改写；未为测试修改生产加载路径。

Typecheck、test census（88 文件：27 contract、61 resource-heavy）、workspace boundaries 已通过。最终运行时预构建：`6f63910d7040bab9a23769615365f4d7d23592f16967b3611d52ad89a7bb954f`，manifest SHA256：`9beddba1544416ca3110177fcd41eff47fba0d63cd8f93aa04afb78cfd1625c6`。

全量远端 CI 和外部独立审查与上述本地检查分开报告。指定物件的保存轨迹位姿差摘要未新增；当前仍通过已有实时观察读取实际物件前后状态。


## 完整 Agent 复测与修复

第五次完整本机创作使用同一《练车》参考图、原始中性要求、GPT-6 Astra / xhigh 和全新 workspace。原始事件、提示词、输入身份、源码 patch、交付和测量保存在本 worktree 的 `.codex-tmp/harness-feedback-20260910`。首次运行于北京时间 15:35:40 开始，15:47:22 结束，Agent 进程耗时 **702.213 秒（11 分 42.2 秒）**；约 3 分 59 秒拿到首次成功预览，未发生初始化失败。

| 观察项 | 结果 |
| --- | --- |
| schema / 示例 | 5 / 4 次；同主题的 guide/contracts 和 humanoid 是不同 sections，并非重复调用 |
| validate / preview / playtest | 各 5 次 |
| 录制墙钟 | 8.81 秒短调试；7.44 / 9.15 秒因异常停止；23.11 秒完整驾驶；51.74 秒最终完整计划 |
| 保存轨迹查询 | 自主调用 world_read_playtest 3 次；仍有一次 Python 按 crate-center 接触筛 trace |
| 物理选择 | 人物使用预设，两车使用 car handling 配置及自绘几何；箱体和路锥自主声明动态组并从 propBoxPose 同步 |
| 交付 | 36 步计划；312 文件闭包验证通过；视频 50.163 秒、145 帧、960×540 |
| 项目 SDK | materialize 一次，只修改 engine.ts 的异常消息记录；其余 96 份 TS 源码与运行输入一致 |

这次实跑暴露了本批世界坐标读取的回归，不能记为无故障成功：`getWorldPosition/getWorldQuaternion` 刷新了相机缓存矩阵，状态栏在 onUpdate 中读取完整 snapshot 时可能触发 `CAMERA_CHANNEL_OWNED`。原有 Engine 又只接受 Error 实例，SDK 自己抛出的 RuntimeError 对象因此变成了 `Unknown failure`。Agent 为排查而修改项目 SDK，随后将状态栏改读 Humanoid 专用 snapshot 绕开触发点。

维护代码已同时修复观察副作用和错误丢失。未放宽镜头写入保护；新增 dirty matrix、手动矩阵和结构化异常回归。原始 Agent 交付保持不变，另建 workspace 去掉项目 SDK，恢复状态栏的完整 `world.snapshot()`，用维护分支最终运行时重新编译、完整重放。这是原作品的回归验收，不额外计为一次独立 Agent 创作。

原始 Agent 交付 runtimeHash 为 `8ae0f095bac451864f1742869e503a63d80e93a26cfd474c7103b385f88f48e6`，worldBuildHash 为 `3a9cfe3e572d2cf662f385042936a7bece865d7d4216e64898a20025b9b23246`。它包含排查时的项目 SDK，不能冒充最终维护代码的产物。合并 #224 前的修复重放已通过全部 36 步及 6 个位置目标；最终合并状态的验收另存 final-* 文件。

本次没有稳定提速或“所有问题都解决”的证据。查错反馈和按需读取已有可验证改善；按物件筛查保存轨迹、物件位姿差摘要仍有后续价值，未新增为必经检查。模型生成质量、每个物件被汽车撞击的完整覆盖，不能从目标到达或技术录制通过推断。

合并 #224 后，最终 335 项相关测试全部通过；完整重放 **52.067 秒、36/36 步**，六个位置目标全部到达。保存轨迹确认蓝车、白车各自的骑乘和下车转换；中央箱子有 4 个真实接触采样，前后位姿差约 **1.05 m**。录制 pageErrors / runtimeErrors 为空。三份 runtime JS 与最终预构建逐字节相同，runtimeSourceHash 为 null；worldBuildHash：`e7af08dadcd0cee785f33766fd7981f87250450848681766b2f2f09cefe315a7`。

Playwright CLI 另行打开最终 playable 检查开场画面、HUD 与观察器，应用运行错误为空，仅临时静态服务器的 favicon 返回 404。截图在 `output/playwright/feedback-final-opening.png`。本次确认了人物推动中央箱子，未据此宣称汽车已逐一撞动所有箱子/路锥。临时浏览器及服务验收后关闭。
