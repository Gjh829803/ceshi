# 输入系统 1.5：基础功能、姿态与镜头输入开发计划

状态：待用户确认后实施。

基线：`dev@ea1527cd`。产品键位以飞书
[`input-system-1-5-key-matrix`](https://icnimsatr0zz.feishu.cn/sheets/DDQSsQetShZUDqtXUKccuOAanUd)
的 `1.5 键位矩阵` revision 278 为准；运行时背景和设备适配见
[`input-system-and-control-conventions.md`](../../input-system-and-control-conventions.md)。

## 目标

先落地飞书矩阵中的“基础功能”和“姿态与镜头”两组输入，使人物、坐骑、地面载具、
船只、潜艇、飞行对象和飞船通过现有 SDK 输入链路获得一致、无串键的控制。保留一个
固定时钟、一个输入 owner、一个载具控制器和一个相机 writer，不建立第二套输入系统。

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
- 同步 Creator、Playground 和 Episode 中实际消费上述输入的代码与测试。

### 暂不纳入

- 技能组全部输入：R、LMB、RMB、1/2/3、4、5、F1-F4、X、B。
- 射击、瞄准、换弹、武器切换、投掷物、收回武器和射击模式。
- F1-F4 换座及多座乘员、座位占用、驾驶权和座位相机模型。
- HUD、快捷键面板、资产提示和移动端虚拟按钮改版。
- 新的音频、喇叭或载具叫声能力。

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

- 将读取基线从飞书 revision 222 更新到 revision 278。
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

### 任务 5：长按复位和消费者收口

**主要文件：**

- `packages/three-world/src/input.ts`
- `packages/three-world/src/engine.ts`
- `apps/sdk-playground/src/main.ts`
- 受影响的 Creator/Episode 消费者与测试

**工作：**

- 使用 `WorldKeyboard` 已有 simulation tick 和 reset callback 实现 0.8 秒阈值；达到阈值
  后只排队一次，避免在 input sampling 或 fixed transaction 中重入 reset。
- keyup、blur、visibility change、输入 owner 切换和 reset 后清除长按状态。
- Playground 删除与本轮键位冲突的 R 复位旁路，玩法键交给 SDK；不修改 HUD 文案。
- Episode 继续提交设备无关 `WorldInput`，并迁移受影响的飞行 `forward/pitch` 语义。
- Creator 的真实输入检查使用同一 SDK 路径，不增加 Host 级键盘监听器。

## 验证矩阵

- 人物：WASD、Shift、Space、C/Ctrl、Q、Z、F、V、H。
- 每个已实现挂载 mode：W/S、A/D、Shift、Ctrl、Space、F、Q/E、C、方向键、V、
  Backspace；飞书标为 `—` 的键不得改变运动状态。
- 状态边界：人物/挂载切换、固定翼起飞/落地、飞龙地面/空中、潜艇水面/水下、
  热气球、失焦、暂停、reset、Episode clock lease。
- 所有输入均检查按下沿、保持、松开和清理；相机与物理立即状态在边界帧断言。

建议验证命令：

```sh
pnpm exec vitest run packages/three-world/src/input.test.ts packages/three-world/src/humanoid-runtime/runtime.test.ts --maxWorkers 1
pnpm exec vitest run packages/three-world/src/humanoid-runtime --maxWorkers 1
pnpm test:camera
pnpm typecheck
pnpm test
pnpm test:independent
pnpm build:editor
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/input-system-1-5-runtime
```

鼠标/触摸分流未在本轮修改，因此本轮只验证既有指针行为没有退化，不把鼠标瞄准列为
完成项。云端任务、发布、历史产物和飞书表均不在实施授权范围内。

## 完成标准

- [ ] 飞书基础功能和姿态/镜头列对已实现对象具有对应运行时行为。
- [ ] F、Ctrl、C、Q/E 和方向键不存在同上下文双重消费。
- [ ] 飞行对象 W/S 不再控制俯仰，方向键上下通过唯一姿态路径控制俯仰。
- [ ] V 和 Backspace 分别满足按下沿与 0.8 秒长按合同。
- [ ] SDK 键盘输入与 Episode 显式输入在相同语义字段下产生一致结果。
- [ ] HUD、射击技能、多座能力未被误报为已实现。
- [ ] 相关 SDK、Creator、Episode、Playground 验证通过，最终 diff 不包含用户无关文件。
