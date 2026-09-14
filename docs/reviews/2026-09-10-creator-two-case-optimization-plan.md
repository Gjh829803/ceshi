# 两次 Creator Agent 试跑后的优化建议

本文保留 2026-09-10 两个完整本机 case 的证据、优先级和验收计划。第 1—5 项的当前实现及验证进度见[实施记录](2026-09-10-creator-case-feedback-results.md)，其余候选不视为已完成。

**先让 Agent 正确选择物件的物理行为并验证实际结果，同时减少错误后的猜测和源码定位，再修清楚镜头生命周期。** 两个 case 都通过了真实输入录制与技术交付，均复用了现有载具系统。但练车场的木箱和路锥全部是固定碰撞体，未实现用户明确期望的车辆撞击位移；技术通过不能掩盖这一功能缺口。重复出现的执行成本集中在 Humanoid 注册、开场镜头恢复，以及完成录制后的继续调整。

## 1. 证据范围与计时口径

两次基线都是 `a7281cbaf18b277a790c8b62ae0fab885e7d1883`，使用本机 Codex CLI 0.153.4、GPT-6 Astra / xhigh、相同通用创作指令与资产策略，分别从全新作品目录开始。维护者没有代写场景，也没有将前一 case 的 SDK 补丁提供给后一 case。

| 指标 | A：星夜山谷骑行 | B：练车场 |
| --- | --- | --- |
| 参考图 | `051_swirl_starry_sky.png` | `练车.png` |
| Agent 进程墙钟 | 12 分 49.4 秒 | 16 分 0.7 秒 |
| 启动至交付归档完成 | 12 分 28.6 秒 | 15 分 39.5 秒 |
| 首次场景写入完成 | 5 分 38.5 秒 | 3 分 59.1 秒 |
| 首次成功预览 | 6 分 30.7 秒 | 5 分 20.6 秒 |
| `world_preview` 调用 | 8 次：1 次初始化失败、1 次入参拒绝 | 10 次：3 次初始化失败 |
| `world_playtest` | 5 次 | 4 次 |
| 各次录制墙钟，秒 | 9.30 / 12.18 / 20.73 / 20.98 / 25.95 | 8.48 / 23.58 / 42.47 / 42.48 |
| 异步 Host 操作区间并集 | 116.0 秒 | 154.2 秒 |
| 其余进程墙钟 | 653.4 秒 | 806.5 秒 |
| shell 命令 | 20 次，其中 11 次涉及 SDK 读取 | 15 次，其中 8 次读编译 SDK、2 次读复制后的 SDK |
| `operations_get` | 19 次 | 21 次 |
| 项目 SDK 修改 | 4 个文件：初始骑乘与镜头恢复 | 1 个文件：镜头恢复 |
| 最终视频 / 文件闭包 | 25.904 秒、75 帧 / 268 个文件通过 | 41.944 秒、119 帧 / 273 个文件通过 |

计时来自 `events.jsonl`、事件接收时间、Host operation 起止时间和交付回执。准备与维护者验收不计入 Agent 进程墙钟；`operations_get` 等待与 Host 执行重叠，不另加一次。异步操作并集不包含全部同步发现工具或 shell，因此“其余墙钟”不能称为纯模型思考，也不能把首次写文件前的时间全部算成阅读。

两张参考图、任务内容和生成路径不同，样本仅两个。这些记录能证明具体失败发生过，不能证明某项优化会稳定节省几分钟，不能作为性能 A/B 结论。

## 2. 优先级与实施顺序

P1 表示下一批优先处理，不表示必须增加发布或生成门禁。先修正创作与自检目标的遗漏，并做范围小的文案与反馈，再处理需要生命周期验证的运行时项。

| 顺序 | 优先级 | 优化项 | 证据强度 | 主要归属 |
| --- | --- | --- | --- | --- |
| 1 | P1 | 根据物理关系选择动态物件，并验证撞击结果 | B 未声明动态刚体，且读过已有指南；用户明确预期可撞动 | Agent 创作指引、SDK 能力发现、自检计划 |
| 2 | P1 | 纠正 `world_preview` 参数描述 | A 有一次明确误用；描述与 schema 可直接核对 | Creator 工具说明 |
| 3 | P1 | 补 Humanoid 注册与 decoration 错误的可执行反馈 | A、B 都发生注册失败，B 又错误修复一次 | SDK 抛错点、Creator 指南 |
| 4 | P1 | 环境校验指出字段路径、实际值和要求 | B 的二维 `region.center` 导致查编译代码 | SDK 环境校验、Host 错误保留 |
| 5 | P1 | 明确并修复 authored 开场的封存与 reset 契约 | A、B 均在项目中修改镜头恢复；根因和通用修法还需最小复现 | SDK、Creator、Episode |
| 6 | P2 | 减少功能通过后的构图调整与重复录制 | B 有同 episode、不同源码的两次约 42 秒录制 | 现有创作指引、案例复盘 |
| 7 | P2 | 初始骑乘的公开接入方式 | 仅 A 为此修改 SDK | SDK 骑乘契约、示例 |
| 8 | P2 | 排查观测字段中的旧状态与匿名碰撞 ID | 轨迹中观察到，尚无独立根因复现 | SDK 观测适配 |
| 暂缓 | — | 自行车专用运动、全面 API 改名、增加录制门禁 | 两例不足以证明这些投资必要 | 后续需求评估 |

### 1）物件物理意图与结果自检

**已确认缺口。** B 的三个木箱以及五个路锥底座/主体均在 `map.boxes` 中，没有 `rigidGroup`，视觉也没有接入动态道具位姿同步，所以它们是固定障碍。用户明确本 case 应能用汽车把它们撞移；最终录像的 `crate-contact` 仅验证人物靠近/被箱体阻挡，没有覆盖车辆撞击物件后的位移。此前“碰撞检查通过”只适用于这些已有阻挡证据，不代表撞动物件的玩法通过。

**不是 API 缺失。** 基线已有 `EnvironmentBox.rigidGroup: {id,massKg}`、同一 Rapier 世界中的复合动态刚体、`propBoxPose(id)` 显示同步和 reset。运行事件确认 Agent 的 `humanoid` guide/contracts 响应含完整 movable props 指南，另一次 humanoid 声明响应含 `rigidGroup` 字段；它看到能力仍未采用。需要修的是场景物理判断和验收意图，不能只再追加一份 API 文档。

**改动。**

- 在现有创作指令中用一段短指导连接“对象如何放置/固定、预期怎样交互”与物理选择：没有固定连接、且应受推力或碰撞移动的物件，接入 SDK 动态刚体；需要固定支撑或明确固定的结构保持静态。静止放在地面上不等于静态刚体。依据请求、参考及空间关系判断，不能默认所有碰撞物固定。
- 不建立“所有木箱/路锥一律动态”的类别清单，也不强制每个场景都加入可撞动物体。本 case 的动态要求来自用户确认；其他场景仍由实际物理关系和玩法决定。
- 将这段能力入口放在 Agent 首轮会读到的通用/载具相关指引中，引用现有 movable props 契约与示例。调整现有说明的关联与位置，不全面扩大默认 schema 响应。必要时给一个小型绑定片段，不新增道具框架或复制整套场景。
- 使用 `rigidGroup` 时，同一物件的碰撞部件属于同一个组并使用一致的整组质量；不同物件独立分组。保留支撑、合理尺寸和质量。视觉从当前 environment 读取 `propBoxPose` 并转换到正确父坐标；不能只让碰撞体移动，也不能用场景动画伪造撞击位移。
- 自检围绕预期结果选择输入和观察。若玩法要求车辆撞动物件，应记录真实车辆接触以及物件前后的位姿变化；不能以车辆接近坐标、人物被挡住或 `world_playtest.status:'passed'` 代替。复用正常 playtest 与按需观察，不新增每单固定碰撞测试步骤。

**验收。** 用本 case 的明确要求验证车辆撞击木箱和路锥后，实际物理位姿改变、视觉跟随、路面及坡道仍固定；重置恢复物件初态并清除速度。记录对象身份、采样时刻、前后位置/姿态及相关接触证据，采用与尺度和测量误差相符的容差，不要求所有撞击都翻倒或飞出固定距离。若现有观测无法取得某项状态，应如实标明并按需补窄范围反馈，不能推断成功。生成仍调用现有 SDK 所有者，不另建物理或显示时钟。

这项主要提高功能覆盖率，不能承诺提速；合理的动态建模与撞击自检可能增加必要工作。后续复测应分别记录功能符合度、返工和耗时。原始两例输入及证据保持不变，新增用户要求或提示词调整需另存版本。

入口：[生成指令](../../scripts/cloud/three-eval-instructions.md)、[Creator 动态物件指引](../../scripts/three-creator/README.md)、[SDK 动态道具契约](../../packages/three-world/README.md#movable-environment-props)、[公开刚体描述](../../packages/three-world/src/humanoid-runtime/environment/types.ts)、[示例入口](../../scripts/three-creator/examples.ts)。

### 2）预览参数说明与实际 schema 对齐

**现象。** A 调用了 `world_preview({view:'entity-triview', entityId:'rider'})`，得到 `THREE_TOOL_INPUT_INVALID`。当前说明写了 “one entityId”，实际 schema 只有 `entityIds` 数组。三视图最多允许一个元素；随后 Agent 省略该字段、使用默认主体才成功。

**改动。** 在现有工具描述中直接写清 `entityIds: ['rider']`，说明省略时选择主体。保留 `entityIds` 参数与现有筛选行为，不为这一次误用再增加单数别名或迁移整套工具命名。

**验收。** 核对 MCP 描述、实际 schema、CLI 共用消费者和示例；正确单元素调用有效，三视图多元素仍按现有规则拒绝。错误仍准确指出非法字段，不把入参错误混同为浏览器启动失败。

入口：[MCP/CLI 工具定义](../../scripts/three-creator/mcp.ts)、[工具使用测试](../../scripts/three-creator/tool-usability.test.ts)。

### 3）Humanoid 注册错误给出对象与正确接法

**现象。** 两个 Agent 都在 `createHumanoidWorld` 创建地图后，以通用物理实体方式注册已有地标，触发 `HUMANOID_CONTENT_REGISTER_IN_OPTIONS`。当前 `addRigid` 经由 `addCharacter` 抛出普通 Error，反馈虽保留调用栈，但没有对象 ID、用途区别或具体修复示例。B 改为 decoration 时仍带物理参数，又触发 `DECORATION_CANNOT_HAVE_PHYSICS`，该反馈的 `entityIds` 为空。

**改动。**

- 在现有 Humanoid 抛错点保留失败条件，补真实对象 ID、当前接入路径和建议：Humanoid 地图碰撞、人物与车辆由相应创建选项接入；已有碰撞对应的观测/三视图地标可使用 `role:'decoration'`，并省略 `physics`。
- 在 decoration 拒绝处指出具体 ID 与冲突字段。不能建议把所有实体都改成 decoration；真正缺失的碰撞仍需按实际 SDK 契约声明。
- 在 mounted-interaction/Humanoid 的现有相关指南中补一个短例子，区别“创建碰撞”与“注册已有对象用于观察”。不复制通用 SDK 手册，不增加地标包装 API。

**验收。** 用这两种实际误用验证字段、实体、建议和源码身份经过 SDK → 浏览器 → Host → MCP/CLI 保留。正确修复后地标可捕获，地图真实碰撞仍存在；失败操作查询不重试。普通 `createWorld` 的物理注册不受影响。

入口：[Humanoid Runtime](../../packages/three-world/src/humanoid-runtime/runtime.ts)、[ThreeWorld.addEntity](../../packages/three-world/src/world.ts)、[SDK 指南](../../packages/three-world/README.md)、[主题提取](../../scripts/three-creator/authoring-schema.ts)、[Host 错误封装](../../scripts/three-creator/tool-errors.ts)。

### 4）环境校验从笼统失败改为可定位反馈

**现象。** B 的 `regions[0].center` 是 `[0,24]`，实际 `MapRegion.center` 为三维 `Vec3`；相邻的 `size` 则确实是二维。这是有效契约差异，不应为了形式统一改成相同维度。当前校验仅抛 `ENVIRONMENT_INVALID`，Agent 读取编译后的 `validateEnvironment` 才找到问题。

**改动。** 在现有校验分支中指出字段路径、对象 ID（可用时）、有界实际值和现有要求，例如“`regions[0].center` 需要三个有限数值 `[x,y,z]`，实际为两个”。沿用现有错误传输能力，不新增第二套全量 schema 或执行门禁，不自动补零或放宽校验。若需保留额外结构字段，应先核对 Host 白名单，避免 SDK 补了而工具仍丢失。

**验收。** 真实 `[0,24]` 复现能从工具反馈直接定位；有效三维中心与二维 size 保持通过。覆盖错误字段、非有限数值、缺项以及诊断序列化失败，诊断不能覆盖原始错误。非法物理数据仍在创建 Rapier 世界前拒绝。

入口：[环境类型](../../packages/three-world/src/humanoid-runtime/environment/types.ts)、[现有校验](../../packages/three-world/src/humanoid-runtime/map-validation.ts)、[Host 错误封装](../../scripts/three-creator/tool-errors.ts)。

### 5）镜头生命周期先最小复现，再确定修法

**现象。** 两个 Agent 都发现驾驶后 opening/reset 不能恢复预期构图，并在各自项目中增加初始 authored 状态保存。B 还调整了初始 camera 的保存时刻和 authored 模式下的 FOV 恢复。两份补丁不同，不能直接选择一份合入。

**源码线索。** `WorldEngine` 在封存时保存相机并调用 Humanoid 的 `sealInitialState`，reset 时先恢复 engine/camera rig，再调用 Humanoid reset。基线 Humanoid 的 `sealInitialState` 只保存 profile；其 `initialCamera` 在构造时复制，reset 又复制这份 camera、设置基础 FOV 并恢复模式。存在多个初始状态来源。作者在首次 start 前后设置开场的时序也必须纳入复现，不能把所有不一致直接归因于 SDK 缺陷。

**改动路径。**

1. 用未修改的基线建立最小 case，区分“封存前配置开场”“首次 start 后才配置开场”“跟随镜头默认值”“临时第一人称”等路径，明确 API 承诺的初始状态边界。
2. 对正确用法仍无法恢复的情况，在现有相机所有者内修复封存/恢复；仅因用法错误的情况，修正指南与示例。不要在每个场景的 `onReset` 中无条件写镜头来掩盖所有权问题。
3. 保持跟随模式的配置默认值语义，不能把临时视角一律封存成新默认值；不增加第二个相机循环。

**验收。** 对照真实 camera 的位置、姿态、FOV 和 owner，验证 authored → 跟随驾驶 → reset 的恢复；分别覆盖首次 start、暂停与运行中 reset、连续 reset、Humanoid/普通世界及 Creator opening/current 捕获。Episode 独占时钟的起点准备和捕获释放也需验证，不能让恢复逻辑覆盖 Episode 明确选择的镜头。`current` 观察不得推进模拟或改镜头状态。

入口：[Engine 封存/reset](../../packages/three-world/src/engine.ts)、[Humanoid Runtime](../../packages/three-world/src/humanoid-runtime/runtime.ts)、[相机回归](https://github.com/seedleap/agent-whitebox-world-sdk/blob/a7281cbaf18b277a790c8b62ae0fab885e7d1883/packages/three-world/src/camera.test.ts)、[Creator 载具浏览器回归](../../scripts/three-creator/vehicle-camera.test.ts)、[Episode 捕获消费者](../../scripts/three-episode/capture.ts)、[Episode 适配回归](../../scripts/three-episode/adapter.test.ts)。

已有相机与载具测试不能替代本次 authored/封存时序的最小复现。本项实施需按 [Runtime 检查表](runtime-deep-review-checklist.md) 做相关回归、typecheck、test census 和最终 runtime prebuild，并保留实际源码与字节身份。

## 3. 需要继续验证的候选

### 最终录制前收敛已观察到的构图问题

B 第三次完整录制已验证扩展路线，之后修改 main.ts 的开场构图，第四次使用相同 episodeHash 重录约 42 秒。源码改变后重录是正确行为；可优化的是工作顺序，而不是复用旧录像。

现有生成指令已经要求检查开场、完成核心功能后提交，应先判断该 case 为何在后期才调整，避免再堆一段重复提示。若确有帮助，只收敛现有句子：将已经观察到、确定要修的构图问题尽量放在最终录制前处理；完整证据之后仍允许为实际缺陷返工。不要强制每次增加全视角、reset 或车辆回归清单。

后续记录“最后一次源码修改时间、完整录制次数、录制后改动原因和涉及文件”。从已有事件离线统计即可，不新增模型必调工具。A 的短计划扩展、撞护栏后的路线修复及镜头修复重录均有原因，不能把 5 次录制整体标为浪费。

### 初始骑乘接入

仅 A 为“开场已经骑在车上”新增 `initialMountedVehicleId`，经正常上车检查建立初态，并恢复同一人物。先检查现有 prepare/enter、初始状态封存和动作过渡是否足以表达需求，再决定补指南还是窄范围初态配置。

验收必须区分初始场景配置与录制中的真实上车，保留上车资格、实例连续性和 reset 条件；不能通过初态配置让录制中的移动或上车自动成功。一个 case 不足以支持新增完整自行车或骑乘框架。

### 观测质量与有限视觉验收

- A 的 authored 镜头实际位置正确，但部分 desired 跟随诊断仍保留旧值。应先查采样/适用范围，必要时标明不适用或来源；不因旧诊断误判实际镜头失败。
- B 少量接触 ID 是 `collider-7.4e-322` 一类匿名值。映射来源未复现；先定位适配层和采样对象，不能据此宣称物理计算错误。
- A 缺自行车踩踏及精确手脚贴合，B 是简单汽车白模。这是能力/效果边界，不是技术门禁应该自动修复的问题。自行车专项能力等有持续需求再投入。
- B 的第一人称连续性 `partial` 有明确 `deferred-first-person` 原因且 issues 为空。保留这种区别，不将部分观测强制升级为失败。

## 4. 下一批的验收边界

建议拆成两个可独立审查的批次：**先交付第 1—4 项的 Agent 创作/自检指引、参数文字与错误反馈修复；再交付第 5 项经最小复现支持的镜头修复或接入指引。** 第 6—8 项继续采集证据，不阻塞前两批。第 1 项需用明确的撞击位移需求检查功能覆盖，不能仅用文案或编译检查判定优化有效。

每批只运行影响范围内的工程检查。SDK 行为变更验证 Creator/Episode 实际消费者，外部云传输保持 mock；生成中的可选诊断失败应局部降级。完成源码验证后，再用原提示词、参考图和固定运行身份进行少量端到端复测，比较具体错误、源码修改与重录原因，并同时检查画面质量，不能仅以更短时间判胜。

优先观察的结果是：物件是否按预期物理行为接入并通过真实结果自检；上述错误能否一次定位；合法开场是否不再需要生成 Agent 修改 runtime；是否减少因错误修复而产生的额外候选和重录。总墙钟用于辅助观察，不给出两例无法支持的提速承诺。

本次不建议：重写载具物理、全量改工具名、强制禁止 SDK 阅读、全面扩大默认 schema 响应、每次创作跑整套工程 CI、增加固定录制时长、自动跨源码复用录像。之前的 `forks` CI 调整已有独立验证，不能用这两次创作耗时证明或否定其收益。

## 5. 证据索引与复核状态

以下记录位于本机忽略目录，未随 Git 提交；跨机器评审需另行提供实际产物。本文保留基线、统计和关键 operation ID，避免只有不可共享的结论。

| case | 本机记录根目录 | 关键 operation |
| --- | --- | --- |
| A | `.codex-tmp/harness-starry-local-20260910` | 注册失败 `3aa4cfa7-516d-4ced-b277-ab7045a3bc9a`；最终录制 `ef1a7592-47ce-4ae8-98c0-65d8ddf12ab1`；交付 `be9017f5-d4a2-4e94-a499-581f9e5eb9b8` |
| B | `.codex-tmp/harness-driving-local-20260910` | 环境失败 `cc161e91-7ef8-417d-b7aa-0381faab6e74`；注册失败 `6b483429-6689-45ee-8c7e-2ce867e49263`；decoration 失败 `8b8b2391-6167-45d9-84f5-6b99c7df6a01`；最终录制 `7fbfdadc-08a8-4efb-a221-161c160a1591`；交付 `435de9a7-1a14-492b-ad54-6516e5cf840c` |

每个记录根包含 `run-input.json`、`events.jsonl`、`event-timing.jsonl`、`summary.json`、`runtime-changes.diff`、`creator-result.json`、归档和 `verified-delivery/payload`。A 的单数字段拒绝发生在工具入参阶段，没有 Host operation；应查其 events，不与初始化失败重复统计。

基线 runtimeHash：`94313c657178f9a469c59d21bcc816e056641e2e21964e45d1f2b684d9b6e17f`。

- A 参考图 SHA256：`1fe72aadd967505090db6fc1119d5b1c00d88d5b34beb9df80b75ce63852da82`；交付 runtimeHash：`37764f8c6a98ef70e062a16c291888c0875391dc0eb6294d417bcfa2985aecf7`。
- B 参考图 SHA256：`9600a99b9ef4f9445bca3c786e304ac3f926c566134aee6917ed35bd657daa76`；交付 runtimeHash：`2ab9022d244a85ddbf699d40bfb41a226d9ea6fc53b94020f8c4ce763a1af72b`。

已复核原始事件、操作错误、当前类型/schema 消费者和两份生成 SDK 差异；两份归档闭包、录像关键帧与独立浏览器基本交互检查通过。独立浏览器没有重放全部输入计划，没有外部视觉审核或下游 Episode/Seedance 生产验收。A 的目标容差为 4—5 米，B 为 0.8—5 米，且由生成 Agent 自定；目标全部到达不是独立语义验收。

本文只新增优化记录与索引，不修改 SDK、Host、生成指令或现有服务，也不要求立即再跑两个模型 case。
