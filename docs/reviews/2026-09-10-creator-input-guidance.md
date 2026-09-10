# Creator 开场输入接线与能力发现

基线：`10cddf1b0a5cc5cebe09f1ad33c25ce3893d402f`（#220）。分支：`codex/creator-input-guidance-20260910`。

本批处理[上一轮复测](2026-09-10-creator-case-feedback-results.md)仍需修改项目 SDK 的镜头交接，以及查询上车条件时的源码定位成本。作者选择何时交接镜头，SDK 继续负责实际输入、跟随与生命周期。

## 已确认的接入缺口

- 默认相机发现响应使用 `play: humanoid.camera`，它不是可调用的方法；现有真实入口是 `world.humanoid.setCameraMode` 和 `humanoid.set-camera-mode` 命令。
- Presentation 的键盘目标是独立覆盖层，监听 renderer canvas 会漏掉已聚焦覆盖层上的输入。此前只能通过内部 DOM 标记定位该元素。
- SDK 已有 `inspectBoarding`、`inspectControls` 和 `inputGuide`，但 Creator 的 Humanoid 方法声明白名单未包含它们。上一轮六次 SDK 读取涉及动态物件位姿、上车条件和镜头输入/更新时序；不能把所有读取都归为无效工作。

## 当前接法

`WorldPresentation.inputSurface` 返回已有的可聚焦游戏输入元素，和 `ui.root`、renderer canvas 分开。读取不推进模拟，不更换输入路由；dispose 后访问按已有 Presentation 生命周期报错。场景可安装普通 DOM 监听器，并负责清理。

[可选示例](../../examples/three-creator/vehicle-camera/opening-camera.ts)在聚焦游戏表面收到移动、跳跃或上车键时，调用原有 `setCameraMode`，按当前 profile 选择默认视角。它使用当前键位配置，忽略重复按键、UI 与暂停状态，不拦截或重发输入、不写相机姿态、不添加时钟。reset 依靠已封存的开场；示例不是所有场景必须安装的行为。

Creator 的键盘计划会触发同一 DOM 监听。直接语义输入需要在选定的开始步骤明确发送相机命令。Episode 独立选择分段视角并占有时钟，场景监听不应覆盖它。`start()` 启动时钟，不等于首次用户输入；`onUpdate` 不提供本帧输入，不能把它描述成通用输入拦截点。

默认发现响应直接给出正确入口和按需读取示例的工具参数。Humanoid 声明补出已有三个查询方法；Host 仍可从 description 的 boarding、controlState、inputGuide 读取结果。没有新增观察步骤、物体类别清单或生产门禁。

## 验证

- 六个相关文件共 91 项测试通过，覆盖真实浏览器的聚焦表面、重绑按键、UI/暂停隔离、实际移动输入、视角切换、开场 reset、相机命令、Episode 交接、监听解除及纯 renderer 捕获。
- 补齐声明后，重新运行受影响的工具/声明消费者，两个文件 72 项通过；这是上述 91 项的子集，不重复累加。
- typecheck、test census（87 文件：26 contract、61 resource-heavy）、workspace boundaries 和 28 个本地文档链接检查通过。
- 最终 SDK 预构建 runtimeHash：`156f66d59c8544de584b58507e3596f52d466297142d013ad94b5b296ed5a695`；manifest SHA256：`c269c1d4304b57f4ad86ff0f5e1a6c5d5cdcfabacd738f76662856a58a290195`。

工程检查未运行全仓 CI 或外部独立审查。首次指针/任意语义输入的通用自动切换没有新增；本示例的触发范围是明确的键盘策略。

## 中性要求复测

使用同一练车参考图、原始中性用户要求和本机 GPT-6 Astra / xhigh，在全新作品目录运行。没有追加木箱/路锥动态要求，也没有指定镜头示例。通用 Harness 包含上一批已合入的物理选择指导。本次用于观察能力发现、实际物理选择和返工原因；单例不足以证明稳定成功率或速度收益。

运行证据保存在本 worktree 的 `.codex-tmp/input-guidance-validation`，包含冻结的提示词、参考图/策略/运行时身份、改动源码哈希、原始事件和最终结果。Agent 于 2026-09-10 北京时间 14:19:23 开始，14:31:31 结束，正常交付。

| 观察项 | 第四次结果 |
| --- | --- |
| Agent 进程 / 完成交付 | 12 分 7.7 秒 / 11 分 46.3 秒 |
| 首次写场景 / 成功预览 | 4 分 15.4 秒 / 4 分 30.2 秒 |
| 编译 / 预览 / playtest | 4 / 6 / 6 次；无工具或初始化失败 |
| 录制墙钟 | 3.08、6.52、23.87、13.14（截断调试）、22.36、24.05 秒 |
| SDK 修改 | 没有 materialize 或项目 `sdk/`；三份交付 runtime 文件与预构建逐字节相同，runtimeSourceHash 为 null |
| 接入选择 | 主动读取并原样采用 `opening-camera.ts`，使用 `presentation.inputSurface` 和 `inspectBoarding` |
| 动态声明 | 自主给 3 个箱子各分配 18 kg 动态组、5 个路锥各分配 3 kg 动态组，并从 `propBoxPose` 同步视觉 |
| 最终视频 / 归档 | 22.861 秒、67 帧、960×540；110 文件闭包校验通过 |

旧统计脚本的 `sdkReadCommands` 为 0，但其中一次 shell 仍在编译产物里以 `rg -l` 搜索 `addEntity/useAuthoredCamera/propBoxPose` 的文件位置。应报告“未读写项目 SDK；有一次编译产物定位”，不能将该计数解释为完全没有源码查找。六次 playtest 包含初期短计划、路线扩展、制动调试和几何修复后重录；没有把技术通过直接当作任务通过。

独立浏览器重放交付的全部 17 步真实按键，观测到首次操作由 authored 切为 follow、人物推动中央箱子最大约 **1.81 m**、白车骑乘与后续下车。点击作品重置按钮后，八个物件与开场镜头恢复到初始采样值，采样差为 0，运行错误为空。已查看开场、推箱后、终点和 reset 画面；浏览器仅有 favicon 404。第一次回放的数值输出未被 CLI 保存，第二次修正证据输出后留下 `browser-replay.json`，不额外计为 Agent 创作。

本次证据证明自主动态声明、人物推箱和视觉/reset 同步，**没有独立覆盖汽车逐一撞击所有箱子/路锥或蓝车驾驶**；上一轮带明确撞击要求的复测保留其独立证据。新旧要求与运行环境不同，且总耗时与上次约 12 分 10 秒接近，不能据此宣称稳定提速。当前收益是减少镜头接入的 SDK 修改、补齐查询入口，以及在中性要求下观察到正确物理选择。

实际交付 runtimeHash 与上文预构建相同。worldBuildHash：`bbcd5b75913cdccbbcf5a3631a68ad3233bde48ec500fe04594d1697ae5ad8c8`；episodeHash：`70253880835189f016a9ce1943b2b4161218a113b614466192e60135aa1c5e42`。临时浏览器与服务验收后关闭。

2026-09-10 用户要求本批合入后清理四次本地 case 及相关 worktree。上述本地路径是运行时证据索引，不承诺清理后仍可访问；本记录及上一批已提交的结果保留摘要、边界和产物哈希，原始参考图不在清理范围。

初始骑乘配置、匿名碰撞身份与不适用的相机诊断尚未修复。本次再次出现驾驶计划的加速/制动调试，以及录制后发现自绘车顶与人物头部重叠、修复后重录；这是后续应继续观察的成本。先利用现有车身尺寸、座位锚点和当前状态判断具体问题，不增加所有场景必做的检查，也不通过复用旧源码录像或放宽玩法结果减少次数。
