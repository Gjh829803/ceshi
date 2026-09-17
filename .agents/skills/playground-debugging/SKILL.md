---
name: playground-debugging
description: Use when investigating SDK Playground gameplay, vehicle, character or camera problems from a live scene, saved snapshot or input recording, including handoff without prior conversation context. Not for Creator production jobs or Episode data production.
---

# Playground 现场调试

先读仓库 `AGENTS.md`。启动、录制前提、UI 与工具参数见
[Playground 调试说明](../../../apps/sdk-playground/README.md#local-diagnostics-and-reproduction)；
本文只补接手现场、选择证据和验证修复的流程，不要求读取旧会话。

## 接手正在使用的工作区

- 确认用户指定的 checkout/worktree、分支、未提交修改、页面 URL 和端口监听进程的工作目录。
  默认端口不是版本证据；修复分支存在也不表示当前页面已加载它。
- 已有保存目录时可先离线分析。需要核实当前页面且任务允许访问时，再读取
  `inspect_debug_recording` 和必要的 `inspect_debug_controls` / `inspect_camera`。
  用户还在测试时，不刷新、复位、重启其服务，也不在其页面执行回放。使用独立调试页面；
  若要改当前工作区，先保存未完成的录制，再告知 HMR 可能重置场景。
- 从页面实际发现 WebMCP 工具再调用。浏览器环境允许直接调试接口时，录制对象是
  `window.playground.recording`（`inspect/start/stop/capture/replay`）；
  人物/相机控制对象是 `window.playground.debug`。遵循所在浏览器工具的执行限制。

## 找到并判断保存内容

保存目录位于**运行服务所属仓库**的 `.codex-tmp/playground-incidents/<bundleId>/`。
优先使用保存结果中的 ID；没有 ID 时，按 `incident.json` 的时间、`mapId`、主体和截图
匹配用户描述，不直接认定最近目录就是该问题。

先提取少量摘要，不把整个 `events` 数组塞进上下文：

| 文件 | 首先读取 |
| --- | --- |
| `incident.json` | `createdAt`、`mapId`、`source`、`frame`、`recordingId`、`recordingCoversFrame`；按问题选取 `fixedSnapshot` / `cameraInspection` |
| `recording.json`（可选） | `id`、`source`、`start.mapId`、`status`、`invalidReason`、`firstTick`、`inputTicks`、事件数量 |
| `frame.png`（可选） | 保存时真正显示的画面，不以当前页面截图替代 |

车辆问题先读 `fixedSnapshot.humanoid.mountedInstanceId`，再从同一 `humanoid` 下的
`vehicles` / `vehicleDynamics` 只取对应车辆；不要输出整个 `fixedSnapshot` 或 `start.profile`。

- 没有 `recording.json`：只有快照/近期输入，缺少回放起点。仍可分析画面与物理状态；
  若已有另一份完整录制覆盖该问题，先使用它，不要求用户重复录制。
- 有轨迹且 `invalidReason` 为空：只是回放候选，仍需工具校验并实际执行。
  `recordingCoversFrame` 表示轨迹是否覆盖这张截图，不等于整个轨迹是否有效。
- **bundleId 是保存目录 ID，recordingId 是轨迹 ID，两者不能互换。**
  `inspect().savedRecording` 只代表当前 recorder 最近停止保存的记录，不是全部历史目录索引。
- 保留原始文件。跨工作区交接时复制整个 bundle 到目标仓库相同的忽略目录下，保留目录 ID，
  不覆盖已有文件，也不改写记录的源码身份。现场文件不会随 Git 提交自动传给同学。

## 回放与定位

1. 修改代码前尽量完成同源基线。比较 `sourceHash`，不能只比较 HEAD：未提交源码、资产、
   文档等 Git 可见文件都参与身份计算。现场不包含完整源码；无法还原当时 dirty tree 时，
   明确缺少同源基线，不把检出同一个 commit 当成恢复成功。
   当前工作区身份可用 [identity.ts](../../../apps/sdk-playground/scripts/camera-quality/identity.ts)
   的 `cameraRouteSourceIdentity(仓库路径)` 读取；旧录制的 `source` 不是当前代码身份。
2. 在对应 `start.mapId` 的独立页面调用
   `replay_debug_recording({bundleId: "保存目录的 UUID"})`。
   回放会重置场景；`status: started` 不是完成。通过 `inspect_debug_recording.replayOperation`
   读取终态与 `result`，记录 `advancedTicks`、`sourceComparison`，以及偏差的
   `inputTick`、`stage`、`expected` / `actual`；需要中止时用 `cancel_debug_replay`。
3. 从首个异常附近选择必要的输入、状态和相关代码，缩小复现。若需要补录，使用 README 的
   完整录制流程；快照无需重置，完整录制需要步行人物与 follow 相机，并重置场景基线。

## 修复验证与交接

- 源码变化后默认回放拒绝是正常保护。验证修复时可明确调用
  `replay_debug_recording({bundleId: "保存目录的 UUID", allowSourceChange: true})`，
  保留双方 sourceHash，并标注跨版本比较；该参数不会跳过地图或输入合法性校验。
- 回放在首次状态/相机偏差处停止。修复本身也可能产生偏差，不能直接判为失败，
  更不能声称已跑完后面的输入。需要验证原问题终点时，补针对根因的回归测试或新录制的
  人工复现，分别报告证据；不要篡改旧轨迹绕过偏差检查。
- 区分轨迹可回放、实际回放完成、问题已修复、人工体验验收。`replayed` 也要检查
  `result.errors`；画面效果和操控体验需相应观察，编译通过不能代替。
- 交接给无会话上下文的同学时，留下：现象与预期、工作区/分支/未提交状态、服务 URL、
  bundle 路径与 ID、地图/主体、源码身份、问题截图或 tick、回放终态与首次偏差、
  修复所在提交或 patch、已验证项与待验证项。明确用户页面是否仍在使用，以及该页面
  是否已经运行修复代码。
