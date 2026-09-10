# Creator 两例反馈优化实施记录

基线：`a7281cbaf18b277a790c8b62ae0fab885e7d1883`。工作分支：`codex/creator-case-feedback-20260910`。

已落实[优化计划](2026-09-10-creator-two-case-optimization-plan.md)第 1—5 项的代码与指引：动态物件选择和真实结果自检、预览字段说明、三个具体错误的反馈，以及 authored 镜头的封存/reset 修复。没有新增载具系统、场景物体类别清单、生产门禁或新的模拟循环。一次完整 Agent 复测及独立浏览器回放已验证木箱/路锥可被车辆撞移、视觉同步和 reset；该单例不等于普遍生成成功率或稳定提速证明。

## 实现范围

| 改动 | 实际行为与边界 |
| --- | --- |
| 动态物件指导 | 根据固定关系和预期推力/撞击选择物理类型；明确落在地面上不等于固定。Humanoid 使用已有 `rigidGroup` 与当前 environment 的 `propBoxPose`。不同物件独立分组，保持整组质量和视觉同步。共享生成指令按 profile 分开，不将 Humanoid 字段套用到 raw 世界。 |
| 撞击自检 | 要求按玩法观察真实接触前后的物件位姿；人物接近、被固定箱体阻挡或技术 `passed` 不证明物件被撞动。不要求所有场景都有动态物件或固定的一套碰撞用例。 |
| 预览命名 | `world_preview` 描述直接使用 `entityIds: ['rider']`，说明三视图至多一个元素和省略时的主体选择。实际 schema、参数名称和校验规则不变。 |
| 环境反馈 | 对本次实际失败的 `regions[i].center` 增加字段路径、region ID、有界实际值、三维坐标及 ±100000 的现有约束。二维 `size` 不变。其他未专项处理的 `ENVIRONMENT_INVALID` 分支保持原行为，不声称所有环境错误已逐字段细化。 |
| 注册反馈 | Humanoid 后注册物理实体、decoration 携带 physics 的拒绝条件不变；补对象 ID、冲突路径和具体建议。只有已有碰撞的纯观测地标使用 decoration 并省略 physics，真正需要的地图碰撞仍保留。 |
| 错误传输 | 沿用已有错误序列化，白名单补 `path`、`expected` 和有界标量/平坦数组 `actual`；跳过作者 getter 和对象强制转换，保留不可用/截断标记以及 null/false/0。三个诊断的下一步直接使用已有 `suggestedAction`，查询仍保留原 operation 身份。 |
| 镜头 reset | 在原有首次 start/step/reset 封存边界保存 Humanoid authored 状态和 camera。reset 恢复该状态；authored 恢复封存投影，follow 基线仍使用 profile 默认视角。临时视角不改默认值。 |

镜头最小复现证明：正确地在封存前配置 authored 后，切为 follow 再 reset，原 SDK 会变为 follow/FOV 58；反向的临时 authored 也会错误保留。修复在同一相机所有者内完成，Episode prepare 仍在 reset 后明确选择自己的相机模式。release 与后续 opening reset 是两个边界，未承诺 release 自动返回开场。

已核对安装的 Three 0.185.1：`Camera.clone()` 不接受 recursive 参数，快照使用 `new PerspectiveCamera().copy(camera,false)`，封存与恢复同样显式非递归，避免复制相机附属子对象。父对象恢复仍由 Engine/CameraRig 负责。

## 工程验证

- 基线 3 文件 42 项通过；SDK 诊断、镜头以及 Host 字段传输均先观察到对应失败，再验证修复。
- 集成 13 文件 261 项通过，覆盖真实浏览器错误传输、MCP/CLI、current 暂停观察、SDK 默认相机、Humanoid、Creator 载具、Episode 适配与捕获、指引提取和测试清单。
- 另有 preset-workspace 20 项通过，覆盖预设载具驾驶、制动与 reset。以上为 14 个不同文件共 281 项，不与之前的聚焦迭代重复相加。
- 动态复合道具推动/固定场景/reset 的 4 项既有物理用例另外通过，含汽车复合刚体推动及其他载具模式。这 4 项来自另一个文件，不与上述 281 项重复。
- typecheck、test census 和 workspace boundaries 通过；census 为 77 文件，26 contract、51 resource-heavy，新相机生命周期测试已登记。
- 两轮只读独立代码审查没有阻塞发现；镜头审查另用实际 Rapier 复现验证直接 Humanoid reset、父子对象身份和投影。审查不替代像素验收。
- 修改文档中的本地链接、源码声明和真实 schema 消费已核对。未运行完整仓库 CI、云端独立测试 gate 或外部视觉审核。

本批预构建 runtimeHash：`d0e1b13e61cfc0b01bb99e19885e1ae528c8b915f1c470c611186ba6e4202d59`；manifest SHA256：`3aaafbb966eaf0af90db3b511f0931cef95f8b8e850d3d667d0f12c50b70dbb3`。

### 提交前同步 main

实现提交 `d1ca19eee5a91c5d51cd359f78bf4151645dda53` 之后，合入 `main` 的 `c7bcc67d78df29c674a96f586d73339977190913`。唯一文本冲突位于测试清单，同时保留上游新增载具测试与本批 camera-lifecycle 测试。独立静态审查确认自动合并的 runtime 和 README 完整保留双方改动，未发现合并缺陷。

合并后的 8 文件 180 项针对性回归通过，覆盖 Humanoid runtime、镜头生命周期、载具动力学、Creator 载具族/镜头/指引、Episode adapter 和测试清单。typecheck、workspace boundaries 与 test census 通过；当前 census 为 87 文件，26 contract、61 resource-heavy。上述检查与原实现的 285 项验证分开记录，不重复累加，也未在同步 main 后重跑完整 Agent 创作或视觉验收。

合并后预构建 runtimeHash：`45cc0585b174d092c8557c77799cbc51d4a75cce8fb3aa067390564a9d11fd79`；manifest SHA256：`5dfc7ff9f16f2e3f586005b3e54b5c5e9d8c9b9219d994a4cb89a522df21be17`。下文 Agent 复测仍对应同步 main 前冻结的作品与运行时身份。

## Agent 复测

使用同一 `练车.png`，在全新作品目录、本机 GPT-6 Astra / xhigh 和更新后的指引上运行。输入增加了用户明确确认的要求：车辆能撞动木箱/路锥，物理位姿和视觉同步，重新开始恢复初态。原始 case、回执和两个预览均保留。

这是功能复测，不是速度 A/B：提示词及 Harness 均已变化。运行记录冻结基线 commit、工作树 patch SHA256、提示词/参考图/策略身份和实际 runtimeHash。模型源码只写入隔离作品目录。

本地证据根目录：工作分支的 `.codex-tmp/creator-feedback-driving-validation-20260910`，产物在 Git 忽略目录中。原始输入、事件、回执和独立回放分别保存，没有改写生成证据。

| 复测项目 | 结果 |
| --- | --- |
| Agent 进程 / 交付完成 | 12 分 10.4 秒 / 11 分 42.0 秒 |
| 首次场景写入 / 成功预览 | 4 分 47.7 秒 / 5 分 9.5 秒 |
| validate / preview | 3 次显式编译、3 次预览，全部成功 |
| playtest | 4 次：6.51 / 16.28 / 44.84 / 51.82 秒录制墙钟；首段未到上车点，后续完成真实撞击及完整覆盖 |
| 最终视频 / 交付闭包 | 50.223 秒、144 帧、960×540；270 个文件通过 unpack 校验 |
| SDK 源码 | 仍修改了 1 个文件，给首次操作自动切换跟随镜头；没有再改 reset、载具或道具物理 |
| 原始物件 | 3 个木箱各独立 30 kg 组；5 个路锥各独立 4 kg 复合组；固定地面/坡道保留 |
| 错误 | 最终 pageErrors/runtimeErrors 为空，所有工具操作无失败；不是宣称全部目标计划第一次就成功 |

记录中的白车倒车撞击使 `crate-left` 移动约 **7.715 m**、`cone-left-near` 约 **3.509 m**；蓝车使 `crate-right` 约 **6.023 m**、`cone-right-near` 约 **1.014 m**。这些值由具备 worldBuildHash 与采样时间的 inspect 结果对照源码初始位置得到，不是仅比较人物到目标的距离。最后 reset 后八个物件距源码初始位置最大 **0.0104 m**；轻微差值包含再次落地后的物理稳定过程。

独立 Playwright 对打包后的 playable 重放全部 **36 步**实际键盘/生命周期输入，记录每步物件位置。观测到白/蓝两车骑乘，左右木箱最大位移约 **7.75 / 7.03 m**，对应路锥约 **1.84 / 5.44 m**，最终物件相对回放初始采样的位置差最大 **0.012 m**。未硬编码这些位移为门禁；真实墙钟执行差异会改变碰撞结果。已查看交付关键帧、撞击后画面和回放重置结果，未执行外部独立美术验收。

**剩余接入成本。** Agent 在 `humanoid-runtime/runtime.ts` 的 advanceOwned 中增加了检测首次移动/交互/视角输入后调用现有跟随相机的逻辑。该改动仅属于生成项目，未合入本批 SDK 修复。此前“SDK 零修改”的中途判断已由最终逐文件比对纠正；实际改善是没有重复修 reset，不能说彻底消除了源码修改。后续应先检查能否用已有公开相机命令在场景输入入口完成同一交接，不直接推广自动覆盖 authored 模式的通用行为。

实际交付 runtimeHash：`d91560d8b8423178e1cedb2858f6a9e3d743f67b0e8b190d8846d57ef0fec743`，包含上述项目镜头扩展，与本批 Host 预构建身份不同。最终 worldBuildHash：`07a2bb34aa22924f4ac36f0ae8adbbbe6a592feb632dc2aaaa2256a00d1d6ce2`，episodeHash：`fba5a379a4cd6e6a7cc997eea10155235db501a25e7d00fd4b721307b061af8f`。

关键记录：`summary.json`、`prop-evidence.json`、`browser-replay.json`、`sdk-source-comparison.json`、`project-runtime-changes.diff`、`creator-result.json` 与 `verified-delivery/payload`。本轮改善的直接证据是动态声明、真实撞移和不再为 reset 修改 SDK；没有将不同要求的新旧案例时长差归因为确定提速。

## 未扩大实施的范围

初始骑乘的新配置、自行车踩踏能力、匿名碰撞 ID 与不适用镜头诊断尚未扩展实现。完整录制后的构图工作顺序保留为案例观察，未增加强制检查。当前批次不直接修改旧作品；按用户要求提交分支并建立面向 main 的 PR，最终合入由用户处理。
