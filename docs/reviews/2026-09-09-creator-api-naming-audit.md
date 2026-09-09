# Creator、SDK 与 Episode 命名审查

基线：`e39f88051a7c487e34b85bf0f3bda78e3f897461`，分支 `codex/harness-authoring-feedback`。本轮检查名称、描述、参数和返回状态与实际实现的对应关系，未修改产品接口或启动新测试、浏览器、模型及外部生产。

判断标准：作者仅凭名称与就近描述，能否预测操作对象、状态变化、参数意义、返回身份和完成范围。下面的实际行为均有源码依据；“AI 容易误读”是风险判断，尚未通过模型对照实验证明。

本记录保留审查时的命名与候选方案。首批已修 materialize 的 hash 字段、墙钟展示、prepared/approach 文案和工具副作用说明；实现及验证见 [首批结果](2026-09-09-creator-harness-first-batch.md)。其余候选名称尚未成为公共 API。

## 应优先修正的确定性语义错配

| 当前名字或展示 | 实际含义与风险 | 建议 |
| --- | --- | --- |
| `creator_materialize_runtime` 返回的 `sourceHash` | 是 SDK 源码身份；其他 Creator 工具同名字段是作品源码、资源与策略身份。按同名字段直接比较会错误地认定版本不一致。 | 将 materialize 返回字段改为 `runtimeSourceHash`，同步直接消费者。不改其他正确的 `sourceHash` 或 delivery 身份算法。 |
| 展示数据 `metrics.simulationSeconds` | `prepare-three-evaluation-site.py` 填入的其实是 `played.actualWallSeconds`。这是墙钟测量，不是模拟时间。 | 导出和展示明确使用现有 `actualWallSeconds`；删除错误 simulation 别名，不能把墙钟值重新标成模拟秒数。 |
| Episode `prepared` 显示“等待与你对齐” | 当前 state 仅证明视频请求已经准备、Seedance 提交数为零，并不证明存在待用户回答的问题。 | 显示“视频请求已准备”；`pre-seedance-ready` 显示“视频请求就绪 · 尚未提交 Seedance”。保留真正需要用户动作的状态分支。 |
| 示例 `training.approach` 按钮“前往越野车” | 操作直接放置人物并清零速度，不产生走过去的过程。 | 按钮改为“传送到登乘点”，对应描述明确准备性重定位。API 名称另作原子迁移评估。 |

来源：[materialize 返回](../../scripts/three-creator/workspace-runtime.ts:34)、[现有相等性测试](../../scripts/three-creator/workspace-runtime.test.ts:23)、[作品 sourceHash 算法](../../scripts/three-creator/compiler.ts:199)、[展示数据映射](../../scripts/cloud/prepare-three-evaluation-site.py:372)、[Episode 展示](../../scripts/three-episode/report.ts:28)、[prepared 的判定](../../scripts/three-episode/workflow.ts:149)、[示例按钮](../../examples/three-creator/training-independent/main.ts:29)。

这些问题不需要新增 SDK 抽象、模型调用或生产门禁。字段改名须与当前活动消费者一起修改；只改文案不得偷偷改变数据或执行行为。

## Creator 工具与状态

| 现有接口 | 可以产生的误读 | 已有事实与处理建议 |
| --- | --- | --- |
| `world_validate` | 完整验证可玩性、运行和类型均通过 | 实际构建候选并检查源码/依赖/资产边界，不执行场景；已返回 `compiled` 与 `runtimeValidation:not-run`，描述开头也写 Compile。名称偏宽，但并非虚假成功。集中改名时可选 `world_build`；当前不为名称增加额外验证。 |
| `creator_get_authoring_schema` | 默认返回机器可校验 JSON schema | 实际默认返回 guide，并可选择 TS contracts/JSON schema。已有 availableSections/readHint。改名候选 `creator_get_authoring_reference`；不需要拆成多个工具。 |
| `creator_materialize_runtime` | 启动 runtime，或得到已构建二进制 | 实际复制可编辑 SDK 源码。现有描述准确；优先修 hash 字段，工具名较低优先级。若改可用 `creator_copy_runtime_source`。 |
| `world_preview` | 只看当前位置，不改变执行 | 当前所有 view 先 stop，opening 再 reset；MCP 描述没有说明。保留名字也必须将这些副作用放到描述首句。单纯改名 capture 仍无法解决。 |
| `world_capture_triviews` | 只截图，不复位 | 会先 reset。应说明 capture 对世界的生命周期影响；当前视角能力另行实现，不把建议中的 current 值提前写进可调用契约。 |
| `world_playtest.status=passed` | 完整核心功能验收通过、可以提交 | 截断 debug 可 passed；targets 全未 reached 也可通过技术判定。候选为内层 `technicalStatus`，与 `executionMode/isCompleteEpisode/semanticStatus` 并列；需要同步所有 report 消费者，不能只改一个返回字段。 |
| `world_playtest.durationSeconds` | 严格最长运行时长 | 小于计划为截断；省略为全计划；大于计划还会延长等待，held keys 在 finally 才释放。先补三种行为；若改名 `requestedRunSeconds` 比 maxDurationSeconds 准确。 |
| `world_playtest.framesPerSecond` | SDK 模拟频率或游戏渲染 FPS | 实际为视频采样请求频率，最终视频还应读取实测帧数/时长。候选 `videoCaptureFramesPerSecond`，不改变模拟或录制行为。 |
| `operations_get` 与 `world_get_operation` | 两个近义查询，可互换 ID | 前者查询 Creator 队列，后者查询 SDK 动作；World 查询本身还可能产生 Creator operation。已有 next 给出精确后续调用，应保留。后续可将 Host 工具改为 `creator_get_operation/creator_cancel_operation`，对应 `creatorOperationId`；不可合并两层状态。 |
| `world_submit` | 上传、发布、正式送审或启动 Episode | 实际只验证并生成本地 delivery archive/result；没有自动 Episode 订阅。首句说明“生成本地交付包”；工具改名候选 `creator_package_delivery`。 |

来源：[工具声明](../../scripts/three-creator/mcp.ts:18)、[编译结果](../../scripts/three-creator/tools.ts:207)、[preview 生命周期](../../scripts/three-creator/tools.ts:247)、[时长分支](../../scripts/three-creator/tools.ts:40)、[延长等待](../../scripts/three-creator/tools.ts:333)、[playtest 判定](../../scripts/three-creator/tools.ts:358)、[两个 operation](../../scripts/three-creator/operation-feedback.ts:14)、[本地交付](../../scripts/three-creator/tools.ts:369)。

`world_playtest` 描述中的 “never steer automatically or teleport” 也应限定对象：固定 XYZ targets 仅测量接近度，不负责导航或传送；用户明确写入的 episode lifecycle/commands 仍会执行，包含 reset 和准备性 relocation。避免让描述与实际允许的命令相矛盾。

### 状态的作用域

保留现有细分语义，摘要应表达完整句意：

| 信号 | 可以据此判断 | 不能据此判断 |
| --- | --- | --- |
| Host operation `succeeded` | 该工具调用成功返回结果 | World 动作完成，或内层自检通过 |
| command `applied` | 同步命令已应用 | 全部产品目标完成 |
| command `accepted` | 异步动作已接受，返回 World operationId | 动作最终成功 |
| World operation `succeeded` | 该动作已完成 | 全场景视觉/产品验收通过 |
| playtest `passed` | 当前技术录制检查通过 | 输入计划完整、目标覆盖充分、可提交 |
| target `reached` | 某个真实采样点进入固定 XYZ 容差 | 正确穿门、按顺序完成、碰撞/功能验收通过 |
| delivery `ready-for-independent-review` | 本地技术交付已封装 | 已送审、审核通过、已发布 |

新摘要如使用 `proximityChecks/withinTolerance`，应明确是采样接近度。不要把它升级为自动任务通过条件。readiness 必须标明 source/runtime/episode 身份和采样时刻，历史回复不能称为“当前可交”。

## SDK 输入与能力边界

### 高风险输入语义

| 字段 | 实际家族含义 | 典型误用 |
| --- | --- | --- |
| `boost` | 地面加速；飞机增加油门；滑翔机弹射；space/sub 制动 | 给飞船 boost 希望加速，实际减速 |
| `forward` | 飞机/滑翔机为俯仰；space 等为推进 | 用 forward 作为飞机油门 |
| `pitch` | space 中用于俯仰，飞机却不使用这一通道 | 飞机输入 pitch 后没有预期变化 |
| `roll` | hover 中为横向推力，其余若干家族为横滚 | 调横滚却改变横向运动 |
| `speed/accel/grip/steer` | 人物部分为换算基准，其他家族为限速/阻尼/倍率等 | 人物 speed=3.8 并不产生 3.8 m/s 的普通目标速度；grip 在人物上不是抓地力 |

这类字段存在实际语义冲突，即使当前 inputGuide/controlFields 已解释，也会增加按直觉构造参数的风险。第一步应在使用点保留当前 family 的字段说明与有效配置。后续如仍有误用，单独修改输入映射：space/sub 制动使用 brake、飞机俯仰使用 pitch，并为油门/弹射采用明确语义。不能全域文本替换 boost，也不能只加单位后缀伪装成实际测量值。

来源：[实际输入指南](../../packages/three-world/src/training/input-guidance.ts:18)、[家族参数说明](../../packages/three-world/src/config/control-fields.ts:10)、[人物换算](../../packages/three-world/src/training/runtime.ts:341)、[实际目标速度](../../packages/three-world/src/training/humanoid/controller.ts:506)。

### 局部可改名与应保留的 API

- `training.approach` 实际是准备性放置。候选 `training.place-character-for-boarding` / `placeCharacterForBoarding(vehicleInstanceId)` 明确副作用；保留 enter/exit。`prepare` 同时处理车辆与人物，应先补对象范围。
- `setInput` 设置持续输入 override，优先于之后的 WorldInput/键盘。全零对象也仍占有输入，必须 release 或 `setInput(undefined)` 才释放。候选 `setInputOverride`；先补参数旁的持续性和释放说明。
- `createWorld/createHumanoidWorld/addCharacter` 名称基本合理。重要缺口是能力边界：相同返回类型不意味着 Training backend 允许任意额外物理/人物注册；新增带碰撞内容应遵循 Training options/map 契约。不要为此创建多个近义 factory。
- `start/stop/reset/dispose` 保留。stop 是暂停；world.reset 恢复完整世界基线并保留原运行状态。底层 training.reset 不等同于完整 world.reset，应明确两者范围。
- 保留 `assetId/instanceId/entityId` 的层次。公开方法的裸 id 可改为 vehicleInstanceId；MapSpawn.vehicleId 目前还接受分配选择器语义，不能仅改名 instanceId 而不改实际规则。
- 保留 `positionWorldMetersXYZ/rotationLocalRadiansXYZ/eyeOffsetLocalMetersXYZ` 等明确坐标与单位的名称。Training yaw=0 指向 +Z，Episode facingYawRadians=0 指向 -Z，适配器有转换；局部文档必须注明，不能只凭相似名字直接复制。

来源：[approach 重定位](../../packages/three-world/src/training/simulation.ts:442)、[输入优先级](../../packages/three-world/src/training/runtime.ts:423)、[输入释放](../../packages/three-world/src/training/runtime.ts:298)、[Training 注册限制](../../packages/three-world/src/training/runtime.ts:556)、[World 生命周期](../../packages/three-world/src/world.ts:527)、[Episode 朝向契约](../../packages/three-world/src/episode-contracts.ts:13)。

## 跨阶段名称

推荐在说明、日志摘要和展示里使用以下带对象的阶段名，不全局替换底层 status 枚举：

| 阶段 | 推荐表述 | 对应证据 |
| --- | --- | --- |
| Creator 编译 | 场景构建完成 | compiled candidate；运行尚未验证 |
| Creator 自检 | 自检录制技术检查通过／未通过 | playtest report，另示完整性与目标接近度 |
| Creator 交付 | 本地交付包已生成 | archive/result 与文件身份 |
| Episode 计划 | 六段录制计划已保存 | plan.json；recordingHasRun=false |
| Episode 录制 | 白模录制完成 | 实际帧、视频、动作与健康记录 |
| Episode 样式/请求 | 视频素材与请求已准备 | prepared requests；providerVideoSubmissionCount=0 |
| Seedance 接单 | 提供商已接单 | 原 request/job identity |
| 提供商完成 | 视频生成完成，等待回收 | provider success，delivery-queued |
| 云端交付 | 云端媒体已验证 | 原生媒体、S3 completion 与校验 |

三个容易混用的文件必须带所属阶段说明：Creator 的 `episode.json` 是自检输入计划，Episode 的 `plan.json` 是六段录制计划，Episode 输出的 `episode.json` 是运行 checkpoint。暂不为词面统一改名全部历史文件。

“准备流程”也不等于 dry-run。Episode `--stop-before-seedance` 仍可能运行云端规划、真实录制、图像与事件生成，只在 Seedance 视频提交前停止；独立 `seedance-preflight.mjs prepare` 才是验证材料并写清单。任务说明应把这一区别放在执行命令旁。

来源：[Episode 说明](../../scripts/three-episode/README.md:1)、[计划提交的明确回执](../../scripts/three-episode/mcp.ts:154)、[素材生产与停止边界](../../scripts/three-episode/workflow.ts:134)、[Seedance 独立流程](../three-episode-seedance.md)。

## 命名修改的实施顺序

1. **明确字段/文案错配**：materialize runtimeSourceHash、展示墙钟字段、prepared 标签、approach 按钮。作为独立小补丁完成对应消费者核对。
2. **就近说明**：preview/triview 的暂停与 reset，playtest 三种 duration 行为和视频采样频率，setInput 的持续 override，Training 参数家族意义。描述必须使用当前已存在工具名，不能提前引用本文候选 API。
3. **公共接口原子迁移**：world_build、authoring_reference、Creator operation 名称、technicalStatus、输入字段语义等分别评估；每次迁移同步当前 schema、提示、例子、SDK、录制器和消费者。

项目尚未上线，不为了改名长期保留同义工具与兼容分支。历史不可变回执/录像继续保留原版本身份，不为统一名字改写旧证据。

涉及工具或结果改名时，检查至少覆盖：Creator MCP/CLI、THREE_TOOLS allowlist、recovery next、生成指令、cloud eventStatistics、runtime doctor/live/progress、交付解包、gallery、Episode import/record/resume。尤其是 cloud 当前要求提交回执与 creator-result.json 深度相等，不能只裁剪其中一个响应。

## 验证方法

首先以代码和测试保证名字描述的行为真实，再用固定提示比较模型的首次选择/误用率。候选提示包括：

- “只构建场景，暂时不运行浏览器。”
- “查看飞行到一半的当前画面，保持输入和运行状态。”
- “让飞船加速；让飞机抬头。”
- “录制人物走向车辆再上车。”
- “判断这次短调试是否已经满足完整交付。”
- “比较导出 SDK 源码与当前候选使用的 runtime 源码身份。”
- “视频请求已经 prepared，判断是否有生成视频、是否需要用户回答问题。”

记录正确工具/参数选择、意外 reset/重定位、额外发现调用、身份误比对和状态误判；不以名称长度或个人偏好代替结果。不启动这些模型对照任务作为本次审查的隐含步骤。
