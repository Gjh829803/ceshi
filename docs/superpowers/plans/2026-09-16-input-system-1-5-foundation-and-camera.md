# 输入系统 1.5：基础功能、姿态与镜头输入开发计划

状态：本地 Playground 阶段已实施并完成定向验收，待用户体验确认；不包含 Creator / Episode 适配。

后续范围追加：用户要求对齐另一任务的镜头修改并更新本地 HUD；见文末“HUD 对齐”。

实施基线：`dev@56d59e22`（已 fetch 并确认包含当时的 `origin/main`，保留用户分支）。产品键位以飞书
[`input-system-1-5-key-matrix`](https://icnimsatr0zz.feishu.cn/sheets/DDQSsQetShZUDqtXUKccuOAanUd)
的 `1.5 键位矩阵` revision 283 为准（开工前从原计划的 278 重新读取）；运行时背景和设备适配见
[`input-system-and-control-conventions.md`](../../input-system-and-control-conventions.md)。

## 目标

先落地飞书矩阵中的“基础功能”和“姿态与镜头”两组输入，使人物、坐骑、地面载具、
船只、潜艇、飞行对象和飞船通过现有 SDK 输入链路获得一致、无串键的控制。保留一个
固定时钟、一个输入 owner、一个载具控制器和一个相机 writer，不建立第二套输入系统。

本阶段只交付本地 Playground 及其依赖的共享 SDK。Creator / Episode 的适配和跨端验收
推迟；本轮曾做的相关改动已撤回。共享 SDK 的语义修改并非应用隔离开关，其他消费者
仍需后续迁移，不能视为已经兼容或可发布。

本轮优先在现有 `WorldKeyboard -> WorldInput -> HumanoidRuntime -> motion family` 链路内
替换旧映射。仅当现有 `Mode` 信息不足以安全区分对象行为时，增加窄范围的上下文数据，
不新增通用输入框架、注册中心或事件总线。

## 本轮范围

### 纳入

- 基础功能：W、A、S、D、Shift、Ctrl、Space、F。
- 姿态与镜头：Q、E、C、Z、方向键、V、H、长按 Backspace。
- F 统一上下文交互：场景交互、攀爬、进入和离开可乘对象只能产生一个最终动作。
- 人物使用 C / Ctrl 蹲伏；挂载对象使用 Ctrl 减速，C 按对象表示下降或特殊动作。
- W/S 保持前后、目标速度或油门语义；飞行对象的俯仰改由方向键上下提供。
- Q/E 按对象解释为横滚、炮塔转动、侧移或未使用。
- V 使用现有 CameraDocument 视角循环；方向键通过现有相机 owner 提交观察输入。
- Backspace 按模拟时间长按 0.8 秒后触发现有 reset/recovery 生命周期。
- H 保留人物召唤飞龙；载具信号只有在已有实际消费者时才接通，否则保持无副作用。
- 同步本地 Playground 中实际消费上述输入的代码与测试，以及必要的共享 SDK 引用。

### 暂不纳入

- 技能组全部输入：R、LMB、RMB、1/2/3、4、5、F1-F4、X、B。
- 射击、瞄准、换弹、武器切换、投掷物、收回武器和射击模式。
- F1-F4 换座及多座乘员、座位占用、驾驶权和座位相机模型。
- 基础输入阶段不改 HUD；随后追加的本地键位提示更新见文末。移动端虚拟按钮及离线资产提示仍不改版。
- 新的音频、喇叭或载具叫声能力。
- Creator / Episode 代码与测试迁移、跨端验收、生产 runtime 交付和发布。

## 保守修改原则

1. 保留现有 `WorldInput`、Humanoid `Input`、CameraController、固定步进和 motion-family
   owner；现有字段能够准确表达行为时直接替换旧映射，不增加同义字段。
2. 不按飞书每一行复制一套监听器。物理键只在输入入口读取，模式分支只解析语义。
3. 不保留新旧两套永久路径。单个控制族通过测试后直接替换其旧映射；尚未迁移的控制族
   继续走原实现，避免一次提交同时改变所有物理模型。
4. `createKeyBindings` 从“全局禁止重复键”收窄为“当前有效上下文禁止冲突”。F、Ctrl、
   C、Q 等跨上下文复用是合法的；同一上下文双重消费仍返回明确冲突。
5. 只增加一个窄的挂载输入上下文，至少包含 `mode` 和 `aircraftSubtype`。这是区分热气球
   与其他 `plane` 子类所必需的信息，不扩展成新的配置体系。
6. 本轮不拆现有鼠标/触摸路由。方向键是明确验收的 PC 观察路径；现有指针拖拽暂作
   兼容。RMB 瞄准开发时再一次性区分鼠标瞄准与触摸观察，避免连续两次修改同一 owner。

## 实施任务

### 任务 0：同步实施基线文档

**主要文件：** `docs/input-system-and-control-conventions.md`

**工作：**

- 将读取基线从飞书 revision 222 更新到开工时重新读取的 revision 283。
- 将 Ctrl+数字换位更新为 F1-F4，并明确整个技能组不在本轮实施范围。
- 记录本轮对鼠标/触摸兼容路径的保守决定，以及方向键和飞行俯仰的唯一消费规则。
- 删除已经被飞书修正的“源表待规范化项”，仅保留仍存在的录入问题。

**出口：** 计划、运行时约定和飞书源表不存在会改变本轮代码方向的冲突；文档仍明确区分
“目标键位”和“已经实现的能力”。

### 任务 1：锁定上下文键位解析

**主要文件：**

- `packages/three-world/src/config/input.ts`
- `packages/three-world/src/humanoid-runtime/input.ts`
- `packages/three-world/src/input.ts`
- 对应 `*.test.ts`

**工作：**

- 将默认交互从 E/F 分裂改为 F 上下文交互，视角键从 T 改为 V。
- 为挂载态补齐独立的 Ctrl 减速、C 下降/特殊、Q/E 成对姿态输入；人物 C/Ctrl
  蹲伏与 Q 翻滚保持原语义。
- 用 `{mode, aircraftSubtype}` 替代只返回 `Mode` 的键盘上下文查询。
- 让 `readControls` 只填写当前控制族实际消费的轴，未使用键保持中性值。
- 保持 `getKeyBindings`、`setKeyBindings` 的公开入口和不可变返回值。

**出口：** 每个纳入范围的物理键在给定上下文中只解析成一个确定意图；失焦、可见性变化、
控制对象切换和重新绑定后没有残留 held/edge 状态。

### 任务 2：统一 F 交互边沿

**主要文件：**

- `packages/three-world/src/humanoid-runtime/input.ts`
- `packages/three-world/src/input.ts`
- `packages/three-world/src/humanoid-runtime/runtime.ts`
- 必要的现有 interaction/boarding 测试

**工作：**

- 复用现有 `interactPressed` 边沿，不新增第二个公共交互字段。
- 已挂载时只尝试离开对象或请求飞龙着陆。
- 未挂载时通过现有目标和资格判断选择可乘对象或场景交互，不同时提交
  `actor.interact()` 与人物 `actions.interact`。
- 保留现有距离、速度、净空、占用和动作资源检查；输入层不绕过交互系统。

**出口：** 一次 F 只产生一次可观察操作；没有目标时保持无副作用，失败原因仍来自现有
交互/登乘 owner。

### 任务 3：方向键、姿态和相机路由

**主要文件：**

- `packages/three-world/src/humanoid-runtime/input.ts`
- `packages/three-world/src/input.ts`
- `packages/three-world/src/engine.ts`
- 受影响的 camera/input 测试

**工作：**

- 普通人物、普通地面/水面对象和热气球：方向键提交相机观察。
- 飞龙、潜艇、飞船、固定翼、旋翼/倾转和滑翔类：方向键上下提交 `pitch`，镜头继续
  由现有跟随 owner 根据主体姿态更新；方向键左右仍提交相机观察。
- 坦克本轮不接射击瞄准，方向键保持相机观察；Q/E 只保留现有炮塔水平转动。
- 移除飞船“方向键左右侧移”的旧键盘映射；本轮不另设默认侧移键。
- V 只产生一次 `cameraTogglePressed`，不直接写相机。

**出口：** 每个固定步中，同一方向键不会同时被相机和载具姿态独立消费；重复显示、
截图和零步观察不改变姿态或相机历史。

### 任务 4：按控制族替换基础运动语义

**主要文件：** 各既有 `motion-families/*/intent.ts`、飞龙 flight compiler 及其测试。

迁移顺序：

1. 人物、普通坐骑、轮式车辆、公交、摩托和非飞行地面对象。
2. 动力船、桨船/木筏、悬浮载具和坦克。
3. 飞龙、潜艇和飞船。
4. 固定翼、旋翼/倾转、滑翔类和热气球。

统一字段解释：

- `forward`：W/S 的前后、推进、目标速度或油门需求，不再表示飞行俯仰。
- `steer`：A/D 水平移动、转向或偏航。
- `pitch`：方向键上下产生的俯仰需求。
- `roll`：Q/E 横滚；仅悬浮载具可按现有控制器解释为侧移。
- `lift`：Space/C 的直接升降需求，仅支持该能力的对象消费。
- `boost`、`slow`、`brake`：分别对应 Shift、Ctrl 和 Space 的对象语义，不再通过
  `interact` 或 `crouch` 字段间接生成。

每个控制族先补失败测试，再替换旧字段解释并运行本族测试；不以一个通用分支同时改写
所有物理实现。

### 任务 5：长按复位和本地 Playground 收口

**主要文件：**

- `packages/three-world/src/input.ts`
- `packages/three-world/src/engine.ts`
- `apps/sdk-playground/src/main.ts`
- Playground smoke 脚本与 SDK 回归测试

**工作：**

- 使用 `WorldKeyboard` 已有 simulation tick 和 reset callback 实现 0.8 秒阈值；达到阈值
  后只排队一次，避免在 input sampling 或 fixed transaction 中重入 reset。
- keyup、blur、visibility change、输入 owner 切换和 reset 后清除长按状态。
- Playground 删除与本轮键位冲突的 R 复位旁路，玩法键交给 SDK；不修改 HUD 文案。
- Playground 调试输入 schema 补齐已有 `pitch`、`roll`、`lift` 等轴，仍交给 SDK 消费。
- Creator / Episode 保持本轮修改前状态；后续迁移飞行 `forward/pitch`、潜艇/飞船
  `boost/slow` 以及默认键位，不在本阶段建立兼容层或 Host 级监听器。

## 验证矩阵

- 人物：WASD、Shift、Space、C/Ctrl、Q、Z、F、V、H。
- 每个已实现挂载 mode：W/S、A/D、Shift、Ctrl、Space、F、Q/E、C、方向键、V、
  Backspace；飞书标为 `—` 的键不得改变运动状态。
- 状态边界：人物/挂载切换、固定翼起飞/落地、飞龙地面/空中、潜艇水面/水下、
  热气球、失焦、暂停、reset、程序化输入接管。
- 所有输入均检查按下沿、保持、松开和清理；相机与物理立即状态在边界帧断言。

建议验证命令：

```sh
node node_modules/vitest/vitest.mjs run packages/three-world/src/input.test.ts packages/three-world/src/humanoid-runtime/runtime.test.ts --maxWorkers 1
node node_modules/vitest/vitest.mjs run packages/three-world/src/humanoid-runtime --maxWorkers 1
pnpm typecheck
pnpm build:editor
```

另执行仓库测试清单与工作区边界检查；本地 Playground 按既有 Vite runner 配置构建。
不再运行 Creator / Episode 专属验收或生产 runtime prebuild。

鼠标/触摸分流未在本轮修改，因此本轮只验证既有指针行为没有退化，不把鼠标瞄准列为
完成项。云端任务、发布、历史产物和飞书表均不在实施授权范围内。

## 完成标准

- [x] 飞书基础功能和姿态/镜头列对本轮已实现对象具有对应运行时行为；无消费者的能力不新增。
- [x] F、Ctrl、C、Q/E 和方向键按有效上下文分配，拒绝同上下文重绑冲突。
- [x] 飞行对象 W/S 不再直接控制俯仰，方向键上下通过唯一姿态路径控制俯仰。
- [x] V 和 Backspace 分别满足按下沿与 0.8 秒长按合同。
- [x] SDK 键盘输入与程序化显式输入消费同一组语义字段；Episode 调用者迁移另行安排。
- [x] HUD、射击技能、多座能力未被误报为已实现。
- [x] 相关 SDK 与本地 Playground 定向验证通过，最终内容 diff 不包含 Creator / Episode 修改。

## 实施记录（2026-09-16）

- 原输入链路内替换默认映射，没有新增 owner、调度器或物理时钟；上下文增加实例 ID，
  防止同类型载具切换时保留旧按键。
- F 复用既有交互资格，按人物场景动作 / 挂载对象做唯一分发；V 复用 CameraDocument。
- Ctrl 复用各族既有制动，坐骑 Space 接通原跳跃参数与碰撞路径；飞机、潜艇、飞龙、
  飞船分别迁移纵向、俯仰和垂直输入。刚体潜艇的独立动力路径也同步迁移。
- Backspace 在固定步事务完成后调用既有 reset callback；未新增车辆局部复位系统。
- aircraft 语义动作与 Playground 调试输入 schema 同步迁移；HUD 只处理旧绑定名删除后
  必需的编译引用，没有改版。Creator / Episode 本轮改动已按用户最新范围撤回。
- 本地运行用直接 Node 入口执行仓库中相同工具，未安装或修改依赖。

### 已完成验证

- TypeScript `--noEmit`、测试清单（54 contract / 97 resource-heavy）和两项工作区边界检查通过。
- Playground 按既有 Vite runner 配置构建通过（Windows 依赖解析需在沙箱外运行）。
- SDK 输入及各控制族针对性回归 410 项通过，飞龙姿态/镜头与真实模型回归 43 项通过
  （包含 11 个飞龙变体）；合计 453 项，不计入此前运行的 Creator / Episode 测试。
- 本地 Playground 飞机浏览器冒烟通过：F 登乘、W 持续油门、↑ 抬头起飞、A 转向、
  V 视角循环、Ctrl 减油门和 Backspace 长按复位；脚本捕获的 pageerror 和 worldErrors 均为空。
- 本地飞龙浏览器冒烟通过：H 召唤、步行接近、F 登乘、Space 起飞、W/D 转向、
  Ctrl 悬停、Shift 加速、E 不触发喷火、V 视角切换、地图/URL 切换及重载。
  首轮脚本误把相机绕转角当行走方向；现改为读取 SDK 实际控制前向，未修改登乘资格。
- 最终 TypeScript 检查、Playground build、31 个本地 Markdown 链接和 diff 检查通过。
- Vite 开发日志仍出现 `ResizeObserver loop completed with undelivered notifications`，
  未导致上述输入断言失败；不宣称开发控制台无错误，本轮不扩展为 HUD/布局诊断修复。
- 验证记录保存在忽略目录 `.codex-tmp/input-system-1-5-final.json`（SDK 条目）、
  `.codex-tmp/input-system-1-5-local-visual.json`、`.codex-tmp/input-system-1-5-playground/browser-results.json`
  和 `.codex-tmp/input-system-1-5-dragon-playground/result.json`，不提交生成产物。
- 新增了上下文冲突、F 单 owner、0.8 秒复位、Ctrl/C 分离、W/俯仰分离、飞龙独立
  升降、潜艇推进与制动、真实坐骑跳跃等回归。

### 收窄范围前运行的全量门禁（不作为跨端交付）

- 首次 contract：642 通过、9 失败。失败涉及 Windows 不支持的换行文件名/符号链接、
  ffmpeg 不可用、资产目录生成内容漂移及一个 capture 超时；不能记为全量通过。
- 独立 Node 门禁：230 通过、40 失败，涉及当前 Windows 环境的 python3、符号链接、
  POSIX 路径/运行时封装夹具。未为本次输入开发修改这些生产/云端测试。
- resource-heavy 首轮 1762 通过、48 失败，包含旧输入断言、Windows 路径/符号链接、
  ffmpeg 缺失及超时等问题。输入相关问题通过针对性回归处理，不宣称全量通过。
- 范围收窄后停止跨端门禁；Creator / Episode 尚未适配是明确的后续工作。
  未启动外部云端任务或修改飞书。

## 后续：本地 HUD 对齐（2026-09-16）

范围：保留另一任务的左右观察修正与俯仰有限镜头跟随（20% 速率、相对开场/默认俯仰
上下各 10°），只修改本地显示提示及其测试。保留同一任务新增的 F 拾取/放下语义。
未修改镜头 owner、输入路由或物理逻辑，未适配 Creator / Episode。

- 快捷键提示改为读取实际载具 `mode` / `aircraftSubtype` 与当前 `KeyBindings`。
  固定翼、尾推、旋翼、滑翔、热气球分别显示；上下方向键注明俯仰与有限镜头跟随。
- 固定翼主提示改为 W/S 增减油门，Shift 如实标为辅助增加油门，Ctrl 为减油门/地面制动。
- V、F、Space/C、Q/E、Ctrl 和长按 Backspace 提示随绑定刷新；坦克不宣称键盘炮管俯仰，
  飞龙不宣称 E 喷火，飞船不宣称方向键侧移或 Shift 制动。
- 当前飞机提示不再消费旧 `spec.hint`；翼装状态说明同样读取当前绑定。HUD 布局与移动端
  虚拟按钮不重做，历史资产静态元数据不批量改写。
- 237 项输入/飞机/镜头回归通过；新增/更新的 HUD 语义与真实 DOM 测试 20 项通过。
  五类载具的真实 Playground 冒烟通过，并验证尾推飞机 W 加油门、Ctrl 收油及切换回
  同类型对象后的提示刷新。1440×960、1280×720 截图均已检查，无快捷键栏越界。
- 证据：`.codex-tmp/input-system-1-5-hud-tests.json` 的四个 SDK 文件、
  `.codex-tmp/input-system-1-5-hud-ui-tests.json`、
  `.codex-tmp/input-system-1-5-hud-browser/result.json` 及同目录截图。
  首轮 HUD 测试的两个正则断言误跨越提示分段，已修正并重跑通过，不计为运行时失败。
- 最终 TypeScript、Playground build、测试清单（55 contract / 97 resource-heavy）、两项
  工作区边界、6 个本地文档链接与 diff 检查通过。Vite 仍有此前的 ResizeObserver
  通知循环错误；构建有大包体积提示，均未扩展为布局/打包优化任务。
