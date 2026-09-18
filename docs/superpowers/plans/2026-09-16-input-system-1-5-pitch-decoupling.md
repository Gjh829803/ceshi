# 输入系统 1.5：俯仰与镜头解耦开发计划

状态：基础实现与后续修正见第 7–9 节；最新键位以第 9 节 revision 402 为准，上文 revision 367 任务保持历史记录。全量共享相机门禁仍有未通过项。本文件不替代飞书矩阵，也不改写上一阶段的完成记录。

## 1. 基线与交付范围

- 本地检查基线：`dev@6c6231d0`，规划开始前工作区干净。实际开工前重新检查工作区和最新 `origin/main`，保留用户分支与其他任务改动，不自动 reset、切换或覆盖分支。
- 产品依据：开工重新读取飞书 [1.5键位矩阵（俯仰解耦）](https://icnimsatr0zz.feishu.cn/sheets/DDQSsQetShZUDqtXUKccuOAanUd?sheet=C6ibZf) 全部 A1:AA200，revision **367**，已包含动力固定翼/尾推 Z/X 空闲、旋翼“侧倾侧移”、滑翔无独立俯仰；另叠加用户明确确认的上下观察额外限幅解除。
- 开工已 fetch `origin/main`；`HEAD...origin/main` 为 `18 / 0`，当前 dev 已包含最新 main。保留当前分支与先前未跟踪计划，不覆盖用户改动。
- 交付仍限定本地 Playground 和其必要的共享 SDK / HUD 代码；不做 Creator / Episode 功能迁移、外部任务、部署、发布或飞书写入。
- 只做“基础功能”和“姿态与镜头”两组输入及其必要 HUD 提示，不扩展技能组。射击、瞄准、换弹、装备槽、投掷物、收武器、射击模式、多座换位、移动端控件不纳入；已存在的程序化能力不因取消默认键而删除。Z/X 作为姿态键仍在范围内，不因 X 曾用于收武器而将其整体排除。

相关依据：

- [架构与 Harness 原则](../../three-sdk-architecture.md)
- [当前运行时约定](../../input-system-and-control-conventions.md)
- [上一阶段开发与验收记录](2026-09-16-input-system-1-5-foundation-and-camera.md)
- [运行时检查表](../../reviews/runtime-deep-review-checklist.md)

规划时的运行时约定与上一阶段计划描述的是旧方向键俯仰、Q/E 横滚版本；本次已同步当前运行时约定，上一阶段历史记录保持不变。

## 2. 本轮目标矩阵

以下只摘录发生变化的按键，不复制完整飞书表。人物 Q 翻滚、Z 匍匐保持不变。

| 对象 | Q / E | Z / X | 其他关键约束 |
| --- | --- | --- | --- |
| 飞龙 | 低头 / 抬头 | Z 闪避；X 未使用 | Space/C 起飞、升降；Shift 耐力冲刺保留 |
| 潜艇 | 低头 / 抬头 | 未使用 | Space/C 上浮、下潜；取消默认手动横滚 |
| 动力固定翼、尾推 | 低头 / 抬头 | 未使用 | A/D 自动侧倾转弯保留；W/S 继续增减油门 |
| 旋翼与倾转 | 未使用 | 侧倾侧移左 / 右，行为口径见第 3 节 | W/S 前后运动需求，Space/C 升降需求；无独立俯仰键 |
| 滑翔机、滑翔伞、翼装 | 未使用 | 未使用 | W/S 目标空速配平；A/D 自动侧倾转弯；保留已有起降特殊动作 |
| 飞船 | 低头 / 抬头 | 左右横滚 | W/S 推进，A/D 偏航，Space/C 升降，Ctrl 制动 |
| 坦克 | 未使用 | 炮塔左右转 | 只保留已有炮塔水平控制，不新增射击或瞄准 |
| 悬浮载具 | 未使用 | 左右侧移 | 复用现有运动控制器 |
| 其他挂载对象、热气球 | 未使用 | 未使用 | 不给空键补功能；热气球 Ctrl 也不消费 |

所有对象的 ↑↓←→ 只提交镜头观察，V 继续切换 CameraDocument 视角。挂载 H 不消费，人物 H 继续召唤飞龙。F 统一交互、拾取/放下和上下对象，长按 Backspace 0.8 秒复位保持既有合同。

**没有获得删除确认的内容不顺带删除：**

- 固定翼 Shift 仍按现有“辅助增加油门”保留，不因建议过删除就执行；HUD 不把它称为已实现的独立加力。
- 潜艇 Q/E 俯仰保留，用户只确认取消了固定翼 Z/X。
- revision 367 的固定翼 Space 仍是“地面刹车”，继续保留，不沿用更早为让出 Space 而取消刹车的讨论。
- 人物 X 是否恢复“收回武器”属于产品文档 / 后续技能阶段，本轮既不实现，也不据空格删除既有程序化接口。

## 3. 实现边界与待复核口径

### 3.1 旋翼侧移：优先复用，不冒充新增飞控

现有 `aircraft/rotorcraft.ts` 将 `input.roll` 解释为目标侧倾角，依靠旋翼合力产生横向运动；它并非横向目标速度控制器。

本计划的保守默认是：Z/X 请求现有的左右侧倾机动，HUD 明确为“侧倾侧移”。需要验证实际左右位移、松键后的姿态回正和漂移表现，不能仅检查 `roll` 数值。

若最终产品要求的是“稳定横向速度、松键主动停漂”或倾转巡航也维持独立平移，则必须先确认这一行为增量，再规划现有控制器内的局部反馈控制；不能把它暗含在一次换键中，也不能直接写位置/速度实现侧移。

### 3.2 取消独立俯仰键，不等于删除俯仰物理能力

- 旋翼、倾转和滑翔类仍通过现有飞控协调姿态；只取消它们的默认键盘独立俯仰入口。
- 倾转巡航：现有 W/S 引起的旋翼俯仰作用会随转换衰减，需验证整个悬停、加速、巡航、减速、下降路径。若基本操控失效，先补局部转换衔接，不恢复隐藏的方向键俯仰。
- 硬翼滑翔：现有地面抬头分支直接消费 `pitch`，而空中 W/S 通过空速配平影响俯仰。先测牵引起飞和着陆；如确实依赖被移除的键，按现有速度需求补局部起降辅助，而非新增发动机推力或额外按键。
- 固定翼取消 Z/X 后，A/D 自动侧倾仍要工作；不能清零物理横滚或拆掉自动转弯。
- 保留程序化 `pitch`、`roll`、`strafe` 等现有轴及显式命令语义。键盘可用动作清单不应成为程序化控制能力的删除清单。

### 3.3 镜头：解除输入耦合与上下观察额外限幅

- 保留左右观察方向修正、同一个 CameraController、CameraDocument、碰撞和生命周期逻辑。
- ↑↓ 不再生成载具 `pitch`；Q/E 只生成载具 `pitch`，不额外注入镜头 orbit。主体运动导致的正常相机跟随不属于串键。
- 按用户最新要求，取消此前飞行/潜水/太空对象键盘 ↑↓ 相对开场/默认角度的 **±10° 额外限制**，不再由键盘路径传入该限幅。旋翼、倾转和滑翔类同样解除，不受是否保留独立俯仰键影响。
- ↑↓ 沿当前 CameraDocument 允许的正常范围观察；保留相机本身的俯仰边界、极点保护和碰撞约束，不把解除额外限幅扩大为允许镜头无限翻转或穿模。
- 普通人物等原本无该额外限制的对象维持原行为；鼠标/触摸与程序化观察继续遵守原来的 CameraDocument 合同，不扩大这次变更的作用域。
- 本次明确改变观察范围，不另行调整观察速率标定；左右方向修正与同一相机 owner 保留。

## 4. 分阶段任务

### 阶段 0：冻结输入依据与失败用例

1. 开工前读取用户更新完成的飞书表，确认 Q/E 俯仰、固定翼 Z/X 空闲、飞龙 Z 闪避、旋翼侧移、滑翔四键空闲，并纳入用户已确认的上下观察额外限幅解除。
2. 记录源表 revision、当前源码身份及其他任务改动。发现新的实质范围变化时先说明，不反向覆盖用户文档。
3. 补默认键位和上下文可用性失败测试，固定旧版与目标版的行为差异。

出口：表、计划和测试预期一致；旋翼侧移按第 3 节的保守口径推进，镜头按已确认的解除额外限幅方案实施。

### 阶段 1：默认绑定与上下文路由

主要位置：

- `packages/three-world/src/config/input.ts`
- `packages/three-world/src/humanoid-runtime/input.ts`
- `packages/three-world/src/input.ts`
- `packages/three-world/src/input.test.ts`
- `packages/three-world/src/humanoid-runtime/runtime.test.ts`

工作：

- 在现有 ControlAction 表内补必要的独立低头/抬头绑定，默认 Q/E。复用既有 `Input.pitch`，正值低头、负值抬头，不增加第二组姿态字段。
- 将挂载辅助左右绑定默认改到 Z/X，按表中的实际能力启用。现有飞龙闪避优先复用同一上下文分发，不新增一套键盘监听器。
- 固定翼、滑翔、潜艇不激活默认横滚键；旋翼、滑翔不激活独立俯仰键。人物的 Q/Z 不随挂载绑定被全局替换。
- `activeControlActions`、冲突校验、`readControls`、重绑和 HUD 共用同一可用性判断。确认 `plane` 子类与 legacy `mode:'glider'` 两条实际入口，不只测一种 spec。
- 默认映射、重绑、禁用单侧绑定和成对相抵均需正确；切换实例、blur、输入框焦点、重绑和 reset 后不残留 held/edge。

出口：每次按键只产生当前上下文允许的意图；禁用键不改变运动、触发闪避或污染人物动作。

### 阶段 2：镜头与姿态分离

主要位置：`packages/three-world/src/input.ts`、`src/engine.ts`、`src/humanoid-runtime/input.ts`，及现有 camera/input 测试。

- 从键盘采样和兼容的 `cameraOrbitInput` 路径中解除“方向键上下 = 载具俯仰”。
- 移除键盘路径对 ±10° 额外限幅的提交及其专用判断；现有常量/辅助函数只做必要清理，并检查所有公开导出及实际消费者。不为删除键盘调用点而一并删除仍有其他消费者的通用相机能力。
- 不重写 camera/controller 或策略算法；仅在现有入口传递正确意图与限制。
- 覆盖方向键与 Q/E 同时按、方向键重绑、上下载具、切换 V、碰撞回缩、鼠标混合观察与程序化接管。
- 在 CameraDocument 允许范围大于旧限幅的视角中，验证长按 ↑↓ 能跨过原 ±10° 边界且不产生载具俯仰输入；到达视角自身边界后仍正确停止，不翻转、不穿模。

出口：方向键只观察且无旧 ±10° 额外限制；姿态键不附加 orbit；保留预期方向、观察速率、视角自身边界与单 owner。

### 阶段 3：运动控制定向验证与最小修补

主要位置：`packages/three-world/src/humanoid-runtime/motion-families/aircraft/`，必要时涉及其他受影响控制族与已有测试。

- 固定翼/尾推：W/S 油门、Q/E 俯仰、A/D 转弯；Z/X 无输入效果，自动侧倾保留。
- 飞龙：Q/E 俯仰与 Space/C 升降独立，Z 仅闪避；继续使用原冷却、耐力和按下沿。
- 潜艇：Q/E 俯仰、Space/C 上浮下潜；Z/X 不触发横滚。
- 飞船：Q/E 俯仰、Z/X 横滚，分别验证辅助模式和惯性模式，保留 Ctrl 制动。
- 坦克/悬浮：Z/X 调用原有炮塔/侧移路径；Q/E 不再触发旧动作。
- 旋翼：按“侧倾侧移”测试横向响应，保持 W/S、Space/C 和 Ctrl 的分工；倾转全阶段检查不以直升机通过代替。
- 滑翔机/滑翔伞/翼装：无独立俯仰、横滚键仍可完成各自起飞/离台、转弯、空速调整和着陆/开伞流程。

默认仅改输入路由。只有实际测试暴露操控缺口时，才在原 controller 中增加最小衔接修补，并单独记录原因、行为变化和回归；不改物理时钟，不瞬移，不强行覆盖速度/姿态。

### 阶段 4：HUD 与运行时说明同步

主要位置：

- `packages/preset-content/src/ui/shortcuts.ts` 及测试
- `apps/sdk-playground/src/main.ts`、`src/shell.test.ts`
- `packages/three-world/src/humanoid-runtime/motion-families/aircraft/wearable-flight.ts`
- `packages/three-world/src/humanoid-runtime/input-guidance.ts`
- 当前运行时约定和必要的包内说明

工作：

- Q/E 提示仅在支持独立俯仰的对象显示；Z/X 按横滚、炮塔、侧倾侧移、悬浮侧移或飞龙闪避显示。
- 固定翼和滑翔不显示手动横滚；旋翼/滑翔不显示独立俯仰；所有对象方向键显示镜头观察。
- 移除旧“方向键俯仰/俯仰附带镜头跟随”及“上下额外限制 ±10°”文案；如需说明观察边界，只描述实际 CameraDocument 的视角范围。
- 标签读取当前 KeyBindings；不同对象、同类型实例切换与重绑后均刷新，不增加硬编码键位表。
- 复用现有布局，不重做 HUD，不把未实现技能和多座能力显示成可用。
- 当前运行时说明在实现验证后更新；保留旧计划的历史验收事实，不把旧测试次数用作新版本证明。

出口：实际输入、可用动作、HUD 和运行时说明一致。

### 阶段 5：本地验收与交付

| 验证层 | 必须证明的事实 |
| --- | --- |
| 输入单测 | 默认/重绑、同上下文冲突、跨上下文复用、对向相抵、空键、按下保持松开和生命周期清理 |
| 运动回归 | 每类载具的真实运动；固定翼自动侧倾不因移除手动横滚失效；滑翔起降与倾转巡航可控 |
| 相机回归 | 左右方向正确，上下只观察；可跨过旧 ±10° 额外边界，仍受当前视角自身边界约束；姿态/观察同时输入互不串线；观察不推进模拟 |
| HUD/DOM | 真实有效键位、重绑、对象切换、无陈旧提示与未实现能力声明 |
| 本地浏览器 | 真正按键驱动飞龙、潜艇、固定翼/尾推、直升机/倾转、三类滑翔、飞船、坦克、悬浮；人物和热气球作为无副作用对照 |

按实际改动选择既有输入、runtime、aircraft、flying-creature、submersible、space、tank 与 camera 测试，不能只测试解析结果或更改快照。优先扩展已有 `apps/sdk-playground/scripts/input-hud-smoke.ts`，必要时增加一个本地姿态解耦 smoke，避免复制生产浏览器桥。

主要命令（实际执行结果见第 7 节）：

```sh
pnpm exec vitest run packages/three-world/src/input.test.ts packages/three-world/src/humanoid-runtime/runtime.test.ts --maxWorkers 1
pnpm exec vitest run packages/three-world/src/humanoid-runtime/aircraft.test.ts packages/three-world/src/humanoid-runtime/flying-creature.test.ts packages/three-world/src/humanoid-runtime/submersible.test.ts packages/three-world/src/humanoid-runtime/space.test.ts packages/three-world/src/humanoid-runtime/tank.test.ts --maxWorkers 1
pnpm exec vitest run packages/preset-content/src/ui/shortcuts.test.ts apps/sdk-playground/src/shell.test.ts --maxWorkers 1
pnpm test:camera
pnpm typecheck
pnpm test:census
pnpm verify:workspace-boundaries
pnpm build:editor
pnpm exec tsx apps/sdk-playground/scripts/input-hud-smoke.ts http://127.0.0.1:5178
```

共享 SDK 改动仍需按仓库检查表检查实际 Creator/Episode 消费者与本地 runtime prebuild，不能以“不做 Creator 功能”掩盖公共合同破坏。此类检查只运行本地、mock 云端的维护测试与构建，不部署、不迁移生产任务，不宣称跨端可交付。较广泛运行时变更再选择完整门禁；已覆盖且源码未变的检查不重复运行。

```sh
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/input-pitch-decoupling-runtime
```

新测试按所属目录放置；需要时更新 test census。所有浏览器证据、构建产物进入忽略的 `.codex-tmp`，记录源码身份、命令、通过/失败/未运行及环境限制。

## 5. 完成标准

- [x] 最终飞书 revision 与用户“固定翼 Z/X 取消”的决定已核对，不擅自采用其他未确认的删键建议。
- [x] 所有对象方向键仅观察；Q/E、Z/X 的上下文映射与表一致，人物操作未退化。
- [x] 固定翼无默认手动横滚但仍正常转弯；旋翼/滑翔无独立俯仰键且完整基本飞行流程通过。
- [x] 旋翼侧移的交付语义明确，倾转巡航和硬翼滑翔起降有真实验证证据。
- [x] 上下方向键的旧 ±10° 额外限制已解除；保留镜头方向修正、视角自身安全边界和 F 拾取/放下，不新增 owner 或第二套架构。
- [x] HUD、公开输入指引与本地实际行为一致；未实现技能未被宣称完成。
- [x] 测试、类型检查、census、边界、本地构建与必要的共享消费者检查完成并如实报告（全量门禁不全通过，见下）。
- [x] 未修改飞书、未开展 Creator/Episode 功能迁移、未启动外部任务或发布。

## 6. 规划阶段交付记录（历史）

仅新增本计划。未修改产品矩阵、当前运行时约定、上一阶段历史计划或任何实现代码；运行时测试尚未开始，不能将本计划中的命令和完成标准当成通过记录。

规划检查：4 个本地 Markdown 链接、6 个根脚本入口、空白格式与最终变更范围已核对；相关实现声明已对照当前输入、相机路由、旋翼和滑翔源码。未修改公共 schema 或其消费的 README。

用户后续确认：解除上下方向键的额外观察限制，仍只开发基础功能、姿态与镜头；已同步本计划的范围、镜头任务、HUD 清理项和验收标准，尚未修改实现。

## 7. 实施与验收记录（2026-09-16）

实现基线为 `dev@6c6231d0`，产品矩阵 revision 367。沿用原来的输入、控制器和相机 owner，仅修改默认绑定、上下文可用性、键盘镜头入口及实际 HUD 提示。

- 新增 `pitchDown` / `pitchUp` 默认 Q/E；辅助左右改为 Z/X，按矩阵分发。人物 Q/Z 保持不变；固定翼/滑翔/潜艇取消默认手动横滚，旋翼/滑翔取消独立俯仰键。
- 四个方向键仅观察，移除键盘提交的 ±10° 限幅；保留飞行/潜水/太空原来的 20% 上下观察速率、左右方向、CameraDocument 正常边界与碰撞。通用 CameraController 可选限幅合同不为此次入口变更而删除。
- HUD、镜头说明、翼装提示、SDK README 与当前运行时约定已同步。`input-guidance.ts` 描述的是程序化能力，原有 pitch/roll 能力保留，不因取消默认键而误删。
- 实测硬翼滑翔机可用 Shift/S 牵引起飞、W/S 空速配平、A/D 转弯和 C/Ctrl/Space 着陆，无须改动滑翔物理；旋翼 Z/X 的左右位移和松键回正通过测试，不承诺主动停漂。
- 唯一运动逻辑修补在 `rotorcraft.ts`：原倾转转换只依赖空速，巡航后 Ctrl 无法退出约 49 m/s 的前推状态。现在 Ctrl 或 S 请求时，以原 `tiltRate` 恢复朝上的旋翼，由原有力/力矩飞控减速。Ctrl 回悬停、S 进入向后飞行以及后续下降均有定向回归；不覆盖位置、速度或增加隐藏发动机。

已完成检查：

- `pnpm typecheck`、`pnpm test:census`（152 个测试文件）、`pnpm verify:workspace-boundaries` 通过。
- SDK README 直接消费者 `authoring-schema.test.ts`：17 项通过，包含实际导出类型检查。
- Playground build 通过；当前 Windows 环境的 pnpm fallback 不能解析 `pnpm exec vitest`，Vite runner 又无法加载部分 CJS 依赖，因此使用已安装的 `node node_modules/vitest/vitest.mjs` 和 `node --import tsx node_modules/vite/bin/vite.js build --configLoader bundle`，没有安装依赖或改包管理配置。
- 本地 SDK prebuild 通过，产物在 `.codex-tmp/input-pitch-decoupling-runtime`；这不是 Creator 功能迁移或生产发布。
- 完整共享相机门禁：**1083 通过、17 失败 / 1100**（57 个文件）。未计为全量通过。已定位包含旧 T 键消费者测试未迁移（`vehicle-camera`、`subject-routing`）、缺少 ffmpeg、Windows symlink 权限、绝对路径 ESM 加载和 schema discovery 不可用。未修改 Creator/Episode 源码来扩大本轮范围，也不把未经基线复测的失败一概宣称为既有问题。
- 本地浏览器验收使用已构建预览，避免源码热更新中断。第一次扩展 smoke 在校园固定翼准备点未能登乘，已改为相应飞行训练场；另一次在第 13 类被开发热更新打断，均未算完整通过。

最终结果：

| 定向检查 | 结果 |
| --- | --- |
| runtime / aircraft / flying-creature / HUD shortcuts | 最终重跑 223 项通过（103 / 50 / 54 / 16） |
| space / submersible / tank | 33 项通过（21 / 7 / 5） |
| 浏览器 input / Shell DOM | 14 项通过（10 / 4） |
| README 的 authoring-schema 消费者 | 17 项通过 |
| 本地 Markdown 链接与最终 diff | 34 个本地链接可解析；`git diff --check` 通过；源码声明已对照实际输入、飞控与 HUD |
| 构建后浏览器 smoke | 14 类全部通过；无 page error；含方向键跨旧限幅、Q/E/Z/X、无效键、实际 F 登乘、V、尾推油门/制动与 1280×720 布局 |

上述 9 个输入/运动/HUD 文件合计 **270 项通过**，不与全量相机门禁重复累计。飞龙浏览器走真实 H 召唤、接近、F 登乘和 Space 起飞；记录中 `evadeCount=1`，射击仍未开放。1440×960 与 1280×720 截图已目视检查：尾推 Q/E 低头/抬头、无 Z/X 横滚，四方向键均为镜头提示，底部未越界。

证据在忽略目录 `.codex-tmp/input-pitch-decoupling-browser-final/`（`result.json`、`pusher-hud.png`、`pusher-hud-1280.png`）。最终 prebuild：

- `runtimeHash`: `08e0e99a83dd630abe3807a46a8ea3359b422dddd1acb6ce2cabce816cbe4539`
- `manifestSha256`: `f3332fcf3925480a4fdbf3542ea28367a47a1a116c02017448572804be177088`

本轮创建的本地开发/预览服务验收后关闭。未写飞书、未启动外部任务、未提交或发布。

## 8. 人物 Ctrl 按住慢走补充（2026-09-16）

用户补充人物 Ctrl+WASD 与 Shift 同为按住修饰机制，但 Ctrl 慢走、不蹲下；此补充优先于上文历史矩阵记录。仅调整现有默认绑定、人物上下文与提示，复用 `slow` → controller `walk` 和既有 `slowSpeed`，不新增控制器或修改运动算法。

- Ctrl 不再产生蹲伏/滑铲按下沿；单按 Ctrl 不移动、不切换姿态。Ctrl 与 Shift 同按沿用慢走优先，松开 Ctrl 恢复普通移动或仍按住的 Shift 冲刺。
- C 保留蹲伏/起身与攀爬松手，Shift+C 保留助跑滑铲；挂载 Ctrl 减速不变。HUD、公开输入指引、SDK/Playground README 和当前运行时约定同步更新。
- 新增左右 Ctrl 与四个移动方向、保持/松开、重绑/冲突、UI 焦点清理和实际运动回归；实测站立胶囊高度不变、状态为 `walk`、速度使用现有慢走参数，而不是仅检查输入字段。

本次最终源码验证：

- 5 个文件 **154 项通过**：runtime 106、浏览器 input 11、HUD shortcuts 16、Shell DOM 4、README 直接 schema 消费者 17。不与第 7 节历史结果累计。
- `pnpm typecheck`、`pnpm test:census`（152 个测试文件）、`pnpm verify:workspace-boundaries` 通过；34 个本地 Markdown 链接及最终 diff 检查通过。
- Playground build 和本地 SDK runtime prebuild 通过，沿用第 7 节所述 Windows 替代入口；未重新运行完整共享相机门禁，第 7 节的范围外失败仍未解决，不能宣称全仓通过。
- prebuild 产物：`.codex-tmp/input-ctrl-walk-runtime`；`runtimeHash` 为 `80c0c9f12e5a46825567d139f95a172ce46dbabd84a8f6cc7f399581d8cbc1f8`，`manifestSha256` 为 `c17b10eabe8b9e639bab44a4c0975cbdb4efd50befd8aa9e9f1609d371452274`。

未写飞书、未做 Creator/Episode 功能迁移、未提交或发布；前一轮俯仰与镜头改动完整保留。

## 9. 镜头偏移修复与 revision 402 换键（2026-09-16）

用户确认修复飞行载具第三人称、按过方向键后的镜头偏移，并按新表橙色改动交换 Space/C 与 Q/E。继续只做基础功能、姿态与镜头；不增加射击或 Creator/Episode 功能适配。开工重新 fetch，当前 `dev@6c6231d0` 包含最新 `origin/main`（18 / 0），保留前面各轮和其他任务已有改动。

### 产品依据与最小实现

使用 lark-sheets 的飞书 CLI 读取 `C6ibZf!A1:AA200` 全量值及样式，revision **402**，确认 26 个橙色（`#ff8800`）单元格。第 2 行总说明仍写 Q/E 俯仰，以具体单元格为准，未回写飞书。

| 对象 | Space / C | Q / E |
| --- | --- | --- |
| 飞龙、潜艇、飞船 | 抬头 / 低头 | 起飞、上升或上浮 / 下降或下潜 |
| 动力固定翼、尾推 | 抬头 / 低头，不同时 Space 刹车 | 空闲 |
| 旋翼、倾转、热气球 | 空闲 | 上升 / 下降；气球为加热 / 放热 |
| 滑翔机、滑翔伞、翼装 | 保留原特殊动作 / 扰流辅助 | 空闲 |

人物、普通坐骑和地面对象的 Space 跳跃/制动、人物 C 蹲伏、Ctrl 按住慢走保持不变。Z/X 延续上一轮分工。

- 只在现有语义绑定表补 `ascend`、`airbrake`，将 `descend` 默认改 E，`pitchUp` / `pitchDown` 改 Space/C。复用现有 `lift`、`pitch`、`brake` 与跳跃/起飞按下沿，不另建输入系统。
- 上下文可用性、冲突校验、重绑和 HUD 同步；飞龙快速按下再松开 Q 仍保留一次起飞边沿，Space 不触发起飞。滑翔 C 独立重绑，不与 Q/E 垂直需求混用。
- 动态快捷键、飞龙地面起飞提示、潜艇上浮提示、SDK/Playground README、当前运行时约定与浏览器 smoke 均更新。顺带纠正 legacy glider 起飞提示仍称方向键俯仰的旧文字，改为实际 W/S 空速配平。

### 镜头修复

- 根因一：连续航向只积分逐帧 world-Y twist，闭合俯仰/翻滚组合后仍可能留下虚假偏航。保留当前 heading helper 和单一 CameraController，以实际前向校正绝对航向，帧间旋转只选择连续分支；倒飞过极点保留连续性，半筋斗加半滚恢复正飞时对齐真实机头。
- 根因二：原第三人称回正要求速度至少 0.8 m/s，静止/悬停会保留观察偏移。将内容库 39 个载具/坐骑第三人称、11 个飞龙变体及三个 Playground 项目快照的现有速度门槛改为 0，标识版本 `vehicle-recenter-20260916`。仍在松开观察后等待 1.5 秒，沿用原阻尼、俯仰目标、碰撞和回缩参数。
- 不改变人物、第一人称、过肩标定，也不修改 SDK 通用默认门槛或公共相机 schema。多数载具第三人称仍保持世界水平；飞船继续使用其原主体上方向/独立偏航配置，不统一强加机体俯仰和横滚跟随。
- 之前的只读诊断（实际项目相机配置、合成主体位姿、无障碍）闭合路径残留约 31.8199°；同一诊断修复后残留为 0°。静止时释放 60° 观察偏移，10 秒后剩约 0.00093°；这是诊断测量，不冒充真实飞行场景帧率或视觉结果。

### 最终检查

- 定向测试共 **402 项 / 12 文件通过**：camera controller 78、runtime 113、项目相机 26、HUD shortcuts 16；aircraft 50、flying-creature 54、space 21、submersible 7、tank 5、input 11、Shell DOM 4；README 的 authoring-schema 直接消费者 17。最终补充固定翼 Space 不刹车、旋翼 Space/C 空闲、滑翔 C 重绑断言后，runtime 113 再次通过。不与下方共享门禁重复累计。
- 共享 `test:camera` 使用等价 Vitest 入口重跑：**1107 通过、17 失败 / 1124，57 文件**。所有 SDK 相机单元/集成回归通过；失败涉及旧 T 键消费者、缺少 ffmpeg、Windows symlink/换行文件名/绝对路径 ESM、schema discovery 和相机文件 HMR 测试。未宣称全仓通过，未为通过门禁而扩展 Creator/Episode 改造。
- 对 HMR 用例单独重跑仍为 `HMR not invalidated`，未归因为并发负载。Discovery 的 11 个源文件哈希与 CRLF 字节不符，归一为 LF 后全部匹配既有 artifact；此次未修改这些 schema 源文件，也未为本地换行重生成历史身份。
- `pnpm typecheck`、`pnpm test:census`（152 文件，55 contract / 97 resource-heavy）、`pnpm verify:workspace-boundaries` 通过。Census 在沙箱内不能加载配置，获准沙箱外重跑通过。
- Playground build、本地 SDK prebuild 通过，沿用第 7 节已记录的 Windows 入口；无依赖安装。预览使用空闲 5188 端口，不停用已占用 5178 的现有服务。

本地 runtime 产物在 `.codex-tmp/input-camera-402-runtime`：

- `runtimeHash`: `6272d6aa6787297814b96598ee1df0c92a3d6100def9f8410b1ba048173db4d2`
- `manifestSha256`: `03e22793a478618467037820ad7fb9c4c0a3022a5dd8054306c7de2d689a0181`

构建后浏览器最终验收 **14 类全部通过，page errors 为 0**，证据在 `.codex-tmp/input-camera-402-browser-verified/`（`result.json` 和两张 HUD 截图）：

- 实际 F 登乘、飞龙 H 召唤/接近/Q 起飞、Space/C 俯仰、Q/E 升降及空键、Z/X、V、尾推 W/Ctrl 油门、方向键跨旧限幅均通过；仍无射击入口。
- 明确切回第三人称后验证直升机静止回正：约 0.0000174 m/s，释放方向键 8 秒后 yaw 约 3.141284 rad（目标 π），pitch 约 0.199761 rad（目标 0.2）。不再因低于 0.8 m/s 而停在观察偏移。
- 1440×960、1280×720 截图已目视检查：尾推显示 Space/C 抬头/低头，没有 Q/E 或 Z/X 无效提示，底部未越界。
- 前两次浏览器运行分别被“继承上一对象过肩视角”和测试把无输入的 -0 与 0 判成不同值中断；已修正测试的视角前置条件和数值比较，保留失败证据，不将这些中断计为通过。
- 36 个本地 Markdown 链接可解析；源码声明、最终 diff 检查通过。对五份 JSON 做结构化差异核对，只有第三人称回正速度门槛及对应版本标识变化，没有覆盖其他标定。

本次 5188 测试预览已关闭，原有 5178 服务未动。未写飞书、未做 Creator/Episode 功能迁移、未启动外部任务、未提交或发布。

## 10. 固定翼、滑翔与翼装步行补充（2026-09-16）

本节覆盖上文历史键位记录。沿用此前核对的 revision 408，并以用户后续确认的规则为准：本地 `dev` 开发，保留其他任务的已有修改；不访问 Git 远端、不改飞书、不提交或发布。仍只做基础功能、姿态与镜头，不迁移 Creator 功能或开放射击。

### 最终规则与实现

- 动力固定翼、尾推和教练机：W/S 增减油门，Q 低头、E 抬头，Space 地面轮刹；C、Z/X 不消费。增加两个固定翼专用重绑槽，但仍提交既有 `pitch` 轴，双轴对象的 Space/C 俯仰不变。
- 飞龙、潜艇、飞船继续 Q/E 升降、Space/C 俯仰；旋翼/倾转只有 Q/E 升降，不新增独立俯仰；热气球 Q/E 加热/放热。
- 硬翼滑翔机 W 触发有限牵引，离地释放或达到既有限额后不可重新触发；空中 W/S 空速配平，地面 S 减速。滑翔伞 W 助跑。两者不再要求 Shift；保留程序化的旧 boost 牵引入口，不增加持续推力。
- 翼装保留 F 穿戴/脱下。穿戴后在地面使用既有人物控制器：WASD 自由走动、Shift 可选跑步、Ctrl 慢走、Space 普通跳跃。普通跳跃不切成滑翔；实际离台且有超过 3 米净空、持续下落 0.15 秒后，才交给原飞行控制器。没有第二套物理循环或同时驱动的碰撞体。
- 离台后 W/S 空速配平、A/D 转弯，重新按 Space 开伞；不能把地面仍按住的跳跃键自动解释为开伞。开伞后 Space 可按住制动。
- 落稳收伞后自动脱下，翼装平放在实际落点。平地靠近按 F 能再次穿戴并继续走动，清除上一轮开伞、牵引和落地状态，不传送回高台。原高台装备准备位置保持不变。
- 动态 HUD、场景交互提示、公开输入指引、SDK/Playground README 与当前运行时约定同步。按翼装实际地面/空中阶段切换提示；不批量迁移离线资产旧说明。

### 验证与限制

- 最终定向回归 **301 项 / 10 文件通过**：aircraft 51、runtime 114、input 11、mounted-presentation 15、wingsuit 6、HUD shortcuts 17、humanoid-actors 46、README authoring-schema 消费者 17、Episode 消费者 22、地图 2。包含 W 单键滑翔起飞、牵引不可重启、平地穿戴、四向步行、普通跳跃、墙体碰撞、真正离台、落地自动脱下、原地再穿戴与唯一控制器检查。
- 最终 `pnpm typecheck`、Playground build、本地 SDK runtime prebuild 通过。测试登记为 154 个文件（56 contract / 98 resource-heavy）；依赖边界检查通过。未重跑全仓门禁，第 9 节记录的范围外失败不能据此视为已解决。
- 14 类载具真实浏览器检查通过，page errors 为 0，证据在 `.codex-tmp/flight-input-408-browser-verified/`。包含固定翼 Q/E、Space 地面刹车、双轴映射、旋翼、滑翔/翼装 HUD、相机观察与静止回正。1280×720 截图已目视检查，底栏未越界。此检查之后仅补充了中央穿戴/步行提示及翼装步行时沿用人物瞬移修订号的处理，最终类型、构建和上述单元/消费者回归覆盖这些补充；未把旧截图称为最终所有文案的截图。
- 新增可复用 `apps/sdk-playground/scripts/wingsuit-smoke.ts`，但额外全流程浏览器运行未获授权，**未执行、未计为自动化通过**；没有绕过授权。用户随后自行测试翼装并明确反馈“没问题”。完整起降与再穿戴流程另有上述运行时物理回归，不混同为该浏览器脚本已通过。
- 最终本地 runtime 产物：`.codex-tmp/flight-input-408-runtime`；`runtimeHash` 为 `e267aad6c6f410de23d728c7a8d87e82a4190f87316e1566aca27ee845e22ed9`，`manifestSha256` 为 `6ebae36d8f7417766a1f90687b42b8ba13f7c70a6368bfdb22ef44249207f517`。仅用于本地验证，不代表已部署 Creator 或 Episode。
- 34 个本地 Markdown 链接可解析；按工作区正常换行设置的 `git diff --check` 通过。本轮自建 5188 测试预览已关闭，未停止其他用户服务。开发预览日志另有 `ResizeObserver loop completed with undelivered notifications`，未将浏览器 smoke 的零 page error 扩大为所有开发日志都无告警，也未扩大范围改动 UI 布局框架。

## 11. 滑翔伞着地转向导致人物翻倒（2026-09-16）

用户反馈滑翔伞落地时按 A/D，人物倒插入地面。仍在本地 `dev@6c6231d0` 的既有工作区修复，不访问或修改远端。

- 已在同一 Rapier 世界复现：临近落地持续左右转向，落地后 up 向量 Y 分量最低约 -0.994，根节点高度约 1.33 米，与截图中的倒立姿态相符。翼装开伞后复用同一路径，也能复现；完全回正后才按 A/D 的对照组不会复现。
- 根因是 `stepSoaring` 在地面锁住 X/Z 旋转后，仍每步回写空中的 X/Z 角速度。当前安装的 Rapier `0.20.0-whitebox-query.2` 的旋转锁约束力矩/冲量响应，不能替代对显式角速度写入的处理。
- 最小修复：仅在可穿戴飞行装备获得既有真实地面支撑时，清掉 X/Z 角速度，同时同步到原刚体；保留 Y 轴、位置、线速度、空中气动、转向输入和原收伞/自动脱下流程。不改动画、键位、Creator 功能或物理所有者，也不靠抬高模型掩盖问题。
- 新增 8 组物理回归（滑翔伞/开伞翼装 × 左/右 × 临近落地开始按/落地后才按），以及 1 项真实人物蒙皮回归（左右各执行一次，检查着地到自动脱下期间固定与插值显示、模型最低顶点和站稳状态）。先确认 4 个连续转向复现用例失败，再验证修复后通过。
- 最终 **120 项 / 5 文件通过**：aircraft 59、mounted-presentation 16、wingsuit 6、Episode 消费者 22、authoring-schema 消费者 17。类型检查、测试登记（154 文件）、依赖边界、Playground build、本地 SDK prebuild 均通过；未运行新的浏览器验收或全仓门禁。
- 实际模型测试最初因训练场自己的 spawn 覆盖了测试起点而未起飞，修正为显式场景起点；实际双向蒙皮采样超过默认 5 秒，给该重型测试单独设置 15 秒超时。两次均未计为通过，没有放宽姿态或穿地断言。
- 本地验证包 `.codex-tmp/canopy-landing-steering-runtime`：`runtimeHash` 为 `430dc5a8d162a0cbe24b0895b715a69d9b40d18309bf99e4d4104748654c5e70`，`manifestSha256` 为 `fb33a198a52d278f8919384ebd2e3db39f1f702a188ffc57f238d1026bc0d507`。未启动浏览器/外部任务，未提交或发布。
