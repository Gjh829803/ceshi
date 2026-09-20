# 控制配置集中与主体规格解耦方案

状态：已实施。共享静态控制默认值、项目/实例覆盖和本地 debug 覆盖均已分层；输入映射保持 SDK owner。

## 当前实施状态

本轮已完成以下边界收敛：

- 共享控制 profile 已集中到 `packages/preset-content/src/control/`；
- 控制 profile v3 只保存控制参数和飞行姿态参数，不再保存碰撞 envelope；
- `packages/preset-content/src/control/resolve.ts` 按共享资产、项目资产、项目实例、
  debug 资产、debug 实例顺序解析，并为每个字段返回来源；
- Playground 的 `profiles.json` 只保存项目覆盖，浏览器覆盖改为独立的
  `worldkit.control-profile.v3.*` 存储，且仍只在本地 `debugProfiles=1` 时读取；
- Playground 在应用配置时通过上述解析器为人物、汽车、水类载具和飞行器生成最终 profile；
- 碰撞包络、座位和其他主体规格继续由 `VehicleSpec` 等资产事实拥有。

`packages/preset-content/src/control/defaults/` 现为所有 preset 主体的静态手感唯一来源，并按
控制领域分为 `ground.ts`、`water.ts`、`aircraft.ts` 和 `creatures.ts`；其中动力飞机的
`aircraftFlight` 也由飞行器控制域拥有。`defaults/index.ts` 是聚合、冻结和读取的唯一入口，
`shared-defaults.ts` 仅保留为兼容转出。载具规格只注入已解析的副本，不再内嵌这些默认值。
每个载具规格还显式声明 `controlProfileId`（当前为稳定的 `preset.<assetId>`），用于表达资产到
控制 profile 的引用；SDK 只承载该身份，不解析 preset-content 的控制数据。

水面动力船、摩托艇、独木舟、皮划艇、木筏、两类潜艇、地面车辆、雪具、生物、固定翼、
旋翼机、滑翔小类和太空载具的静态手感基线均已迁入这些领域文件：速度、加速度、转向、阻尼、
制动、回舵、水下升沉响应和动力飞机姿态响应从控制域提供；船体包络、座位、出生点、浮力、
轮组、动力总成和其他资产事实仍留在 `VehicleSpec`、`bodyPhysics` 或所属物理模型。

本轮没有重写汽车、船、潜艇、飞机或人物的运动算法，也没有把当前速度、油门或飞行状态
写进 profile。v3 profile 从最终构造后的 spec 读取有效控制值；控制默认值在进入 spec 前已由
控制域注入，因此不会再把前置表格值误当作最终值。

临时控制限制通过 `src/control/runtime-overrides.ts` 的命名 override 处理；它只允许覆写既有静态
控制字段，并记录原因和目标。Playground 已在切图、重置和销毁时清理 override store，并重新应用
静态/项目/debug 配置；当前没有擅自把受损或着陆状态接成新的自动行为。

键位的共享默认值继续由 SDK `packages/three-world/src/config/input.ts` 单一拥有；它输出设备无关
语义输入，SDK、HUD 和 Playground 都通过同一 `getKeyBindings()`/`setKeyBindings()` 契约读取。
项目级键位修改应作为该 SDK 契约的项目覆盖保存，不与任何资产手感 profile 混写。

当前共享资产控制目录如下。它集中的是“静态手感参数”，不是项目快照、相机配置或运行时状态：

```text
packages/preset-content/src/control/
├─ defaults/
│  ├─ ground.ts              # 汽车、摩托、履带、雪具、悬浮等地面载具
│  ├─ water.ts               # 船、艇、桨船、潜艇和水下观察艇
│  ├─ aircraft.ts            # 飞机、旋翼机、滑翔类、太空载具及 aircraftFlight
│  ├─ creatures.ts           # 坐骑、生物和动物牵引载具
│  └─ index.ts               # 聚合、冻结和按 assetId 读取
├─ profiles.ts               # schema、profileId 与 debug 存储校验
├─ resolve.ts                # 共享/项目/实例/debug 覆盖解析及来源诊断
├─ runtime-overrides.ts      # 有原因、可清理的临时静态限制
└─ shared-defaults.ts        # 旧引用的兼容转出，不再保存数据
```

## 1. 目标

将 Whitebox 项目中与“如何操控主体”有关的配置集中到一个明确的 `control/` 配置域，
并与车辆、飞行器或人物的主体规格解耦。

本方案要解决的不是简单移动文件，而是确定每个控制参数的：

- 权威来源；
- 作用域（全局、资产、实例或本地调试）；
- 覆盖优先级；
- 最终生效位置；
- 导出、保存和复现方式。

## 2. 当前问题

当前控制数据至少分布在以下位置：

| 数据 | 当前可能的来源 | 风险 |
| --- | --- | --- |
| 键位和语义输入 | SDK 的 `config/input.ts`、Playground 重绑状态 | 运行时、HUD 和调试面板可能读取不同来源 |
| 人物/载具移动手感 | SDK 的 control tuning、preset profile | 参数定义和资产默认值边界不清晰 |
| 飞行器手感 | `aircraftFlight` 默认值、资产 profile、实例覆盖 | 只复制表格可能漏掉实例覆盖或运行时应用结果 |
| 车辆速度、加速度等 | 车辆 spec、资产配置表、运行时重新赋值 | 表中的初始值不一定是最终生效值 |
| Playground 调参 | 浏览器 localStorage/debug profile | 默认不会进入项目文件，不能当成交付配置 |
| 相机预设 | 项目 CameraDocument、共享相机 preset | 与控制数据的生命周期和作用域不同，不能强行合并 |

特别需要注意：如果车辆表中有 `speed`，后续创建流程或运行时又给车辆设置了速度，
那么表中的 `speed` 只是一个来源，不是最终配置。迁移时必须追踪实际消费链路。

## 3. 边界定义

### 3.1 属于控制配置

以下内容统一归入控制配置：

- 键位、按键重绑定和语义输入映射；
- 轴的方向、灵敏度、响应速度和死区；
- 最大速度、加速度、制动、阻尼、转向响应；
- 水面推进、阻力、航向转向、漂移/滑行和水下升降、俯仰、滚转响应；
- 飞行器俯仰、横滚、偏航增益与角速度阻尼；
- 车辆或飞行器的控制模式及其控制族参数；
- 只影响操控手感的实例级覆盖；
- 仅用于本地调试的临时调参 profile。

因此，之前修改的键位和飞行器手感配置表都属于控制配置。

### 3.2 不属于控制配置

以下内容仍属于主体规格或资产事实：

- 模型、网格、材质和骨架；
- 质量、尺寸、惯量、翼面积、轮位和碰撞包络等物理/几何事实；
- 座位锚点、眼位、轮胎位置和模型坐标转换；
- 资产 ID、实例 ID、出生点和场景位置；
- 车辆外观、颜色和显示对象绑定。

其中，质量或尺寸虽然会影响手感，但它们是主体的物理事实，不能因为控制器使用了它们，
就复制一份到控制 profile 中。控制 profile 只引用主体事实，不重复拥有主体事实。

### 3.3 相机保持独立

相机项目快照、共享相机 preset 和 SDK 执行时覆盖继续留在相机配置域。
相机快照允许项目独立修改，不因控制配置集中而合并到 `control/`，也不允许车辆 spec
或控制 profile 隐式修改主相机。

## 4. 目标目录

建议在 Whitebox 项目中建立一个项目级控制配置目录。目录名可以固定为 `control/`，其内部
按职责拆分，而不是把所有内容塞进单个大文件。这里的“集中”指项目控制配置集中，
不表示把 SDK 默认值和共享资产包复制进项目：

```text
control/
├─ schema.ts                 # 控制配置类型、字段单位和版本
├─ project-defaults.ts       # 项目层默认值，不复制 SDK 默认值
├─ input-bindings.ts         # 键位和语义输入映射
├─ profiles/                 # 项目自己的 profile 或对共享 profile 的明确引用
│  ├─ character.ts           # 人物移动 profile
│  ├─ ground-vehicle.ts      # 汽车、摩托等地面载具 profile
│  ├─ watercraft.ts          # 船、艇、潜水器等水类载具 profile
│  ├─ aircraft.ts            # 飞行器手感 profile
│  └─ index.ts
├─ overrides/
│  ├─ assets.ts              # 项目对资产默认值的覆盖
│  └─ instances.ts           # 场景实例级覆盖
├─ debug/
│  └─ browser-profile.ts     # 仅 debugProfiles=1 时导入的本地调参
├─ resolve.ts                # 唯一配置解析入口
├─ inspect.ts                # 输出最终生效值和来源
└─ README.md                # 字段、单位、作用域和迁移说明
```

在当前 monorepo 中，SDK 的通用默认值仍由 `packages/three-world/src/config/` 维护，
共享资产默认 profile 仍由 `packages/preset-content/` 拥有；项目和场景实例覆盖才进入
项目自己的 `control/`。这样同一架飞机、船或人物可以在不同项目中使用不同覆盖，
但不会改写共享资产包。

本文的 `control/` 是项目侧控制配置域；落地时通过适配器调用 SDK 的现有
`setKeyBindings`、`applyProfile` 和 `exportProfile` 入口，避免反向依赖包内部实现。

如果后续决定把共享源文件物理迁移到某个包，也必须保持同一 ownership：SDK 默认值归 SDK，
共享资产默认值归 preset-content，项目/场景覆盖归当前项目，不能通过复制两份可变配置制造
新的权威来源。

## 5. 配置模型

### 5.1 主体只引用控制 profile

主体规格不再内嵌完整控制参数，只引用 profile ID：

```ts
const aircraftSpec = {
  id: "plane",
  massKg: 1200,
  envelope: { /* 主体几何事实 */ },
  controlProfileId: "aircraft.plane",
};
```

控制配置独立维护：

```ts
const aircraftProfile = {
  id: "aircraft.plane",
  kind: "aircraft",
  controlContextId: "aircraft.fixed-wing",
  control: {
    speedMetersPerSecond: 16.1,
    accelerationMetersPerSecondSquared: 12,
  },
  aircraftFlight: {
    pitchGain: 11,
    rollGain: 14,
    pitchRateDamping: 5,
    rollRateDamping: 5,
    yawRateDamping: 4,
  },
};
```

上面的数值仅表示结构示例，不替换当前已经标定的值。`controlContextId` 只表示控制上下文，
不直接拥有键盘、手柄或手机的具体按键。具体输入映射由独立的输入配置和用户重绑定处理。
单位必须写在字段名或 schema 中，禁止由调用方猜测单位。

### 5.2 资产级和实例级分开

同一资产的多实例应共享资产默认值，但允许某个实例拥有明确覆盖：

```text
SDK 默认值
  ↓
共享资产默认 profile，例如 aircraft.plane
  ↓
项目控制默认值或项目覆盖
  ↓
实例覆盖，例如 plane-01
  ↓
本地 debug profile（仅显式开启）
  ↓
最终生效配置
```

`assetId` 表示“哪一种载具”，`instanceId` 表示“场景中的哪一个实体”。
项目覆盖只对当前项目生效，不回写共享资产默认值。调试面板可以自动注入 `instanceId`，
但不应让用户手工伪造实例身份。

### 5.3 水类载具单独建模

水类载具属于控制配置，但不能直接复用地面载具或飞行器 profile。建议先以
`watercraft.ts` 作为统一入口，再按运行模型区分水面和水下：

| 类型 | 典型对象 | 控制参数示例 |
| --- | --- | --- |
| 水面载具 | 船、快艇、独木舟、皮划艇、木筏、摩托艇 | 推进、倒退、阻力、滑行减速、转向响应、回舵、俯仰/横滚响应 |
| 水下载具 | 潜艇、潜水器 | 推进、垂直加速度、升沉阻尼、制动、转向响应、俯仰/横滚响应 |

水面/水下参数都属于操控手感；浮力、船体尺寸、质量、吃水深度、碰撞包络和座位锚点等
仍属于主体规格或物理事实。当前车辆表中这些数值若会被水面或水下控制器重新应用，必须
按照“来源—覆盖—最终消费者”链路迁移，不能只复制初始 spec。

## 6. 配置、运行时状态和运动算法的边界

控制配置只描述输入如何影响运动，以及运动算法需要读取的参数；它不替代已有运动算法。

以下内容是运行时状态，不应写进静态 profile：

- 当前速度、当前油门、当前空速；
- 当前是否起飞、着水、失速、翻车或受阻；
- 当前姿态、位置、接触和支撑状态；
- 算法根据输入和物理计算出的临时结果。

只有明确的临时限制才使用 runtime override，例如受损后的限速、着陆阶段的控制限制或
脱困阶段的短时控制覆盖。现有汽车、船和飞机的运动算法继续负责读取参数、计算受力和
推进物理，不由配置迁移替代。

以汽车按下 W 为例，链路应保持清晰：

```text
W 键
  ↓
throttle 意图
  ↓
汽车控制算法读取车辆参数
  ↓
车辆运动与物理结果
```

控制层不应把“W”直接写入汽车算法，汽车算法也不应知道用户使用的是键盘、手柄还是手机按钮。

## 7. 唯一解析入口和覆盖规则

所有控制配置通过一个函数解析：

```ts
const resolved = resolveControlConfig({
  subjectSpec,
  assetId,
  instanceId,
  projectOverrides,
  debugProfilesEnabled: query.debugProfiles === "1",
});
```

解析器必须返回两部分：

```ts
{
  values: ControlConfig,
  sources: Record<string, string>,
  profileRevision: string,
}
```

`values` 是执行使用的完整配置；`sources` 用于回答“这个速度/增益最终来自哪里”。

静态控制配置通过解析入口生成只读副本，运行时读取该副本；业务代码不能绕过配置入口
改写静态控制字段：

```ts
const config = resolveControlConfig(context);
runtime.applyControlProfile(config.values);
```

以下写法只有在 `speed` 明确表示静态控制参数时才禁止：

```ts
vehicle.speed = 20;
```

如果确实需要改变静态限速或控制参数，应通过命名的控制覆盖入口，并记录覆盖原因：

```ts
runtime.applyControlOverride({
  target: "plane-01",
  field: "control.speedMetersPerSecond",
  value: 20,
  reason: "landing-mode",
});
```

当前速度等算法状态仍由运动算法和 runtime state 维护；它们不应被错误地记录为 profile
覆盖。诊断结果必须区分“配置值”“临时控制覆盖”和“算法计算状态”。

## 8. 输入映射和生命周期

### 8.1 输入映射独立于主体运动参数

键盘、手柄、手机按钮和用户重绑定都只输出设备无关的语义输入，例如：

```text
forward / throttle / steer / brake / pitch / roll / lift
```

输入配置可以根据当前控制上下文选择可用语义，但不修改飞机、汽车或船的运动参数。
这样调整键位只会改变操作方案、提示和测试，不会改变底层运动算法。

### 8.2 生命周期清理

控制模块必须接入以下生命周期事件：

- 切换控制对象或停用时，清除 held keys、edge 状态和未提交的控制意图，避免离开后继续加速；
- 重置时保留静态配置，清除临时输入和运行时运动状态，恢复既有 reset 语义；
- 销毁时解除输入监听，释放实例引用和临时覆盖，避免状态串到下一个实例；
- 暂停时停止继续提交控制输入，恢复后按既有规则重新建立输入状态。

生命周期模块不负责计算速度，也不负责解释每个控制参数；控制模块和运行时只约定输入、
配置读取和清理接口。

## 9. 浏览器调参的处理

浏览器 localStorage/debug profile 只作为本地开发覆盖：

- 默认不开启；
- 只有 `debugProfiles=1` 时读取；
- 读取时必须校验 schema、assetId 和 instanceId；
- 不自动写回项目源文件；
- 不自动进入 Creator、Episode 或发布产物；
- 需要交付时，由用户显式执行“导出 profile”，再审查并写入项目 `control/`。

推荐的导出流程：

```text
浏览器调参
  ↓ debugProfiles=1
当前实例临时覆盖
  ↓ 用户确认
导出完整 profile
  ↓ 人工审查来源和作用域
写入当前项目的 control/profiles 或 control/overrides
  ↓ 项目运行时读取
```

因此，不能因为某次 Playground 调出来的手感正确，就假设该配置已经存在于项目文件中。

## 10. 车辆速度问题的迁移规则

速度类字段必须逐项区分：

| 字段类型 | 应放置的位置 | 说明 |
| --- | --- | --- |
| 最高速度、加速、制动、阻尼 | `control/profiles/` | 操控手感，允许 profile 覆盖 |
| 质量、尺寸、轮位、翼面积 | 主体 spec | 物理/几何事实，不复制到 profile |
| 当前速度、当前油门、当前空速 | runtime state | 运行时状态，不属于静态配置 |
| 起飞/着陆/受损时的临时限速 | 命名 runtime override | 必须记录状态和来源 |
| 浏览器面板改出的速度 | debug override | 仅在 debugProfiles=1 时有效 |

迁移每个速度字段时执行以下检查：

1. 找到字段声明和默认值。
2. 找到资产 profile 或车辆 spec 的初始值。
3. 搜索所有后续赋值、合并和构造函数参数。
4. 确认实际控制器读取的字段。
5. 将真正生效的来源接入 `resolveControlConfig`。
6. 删除或改写绕过解析器的重复赋值。
7. 用 `inspect` 输出最终值和来源。

只有完成这条链路，才能说速度配置已经迁移完成。

## 11. 分阶段迁移计划

### 阶段一：记录当前实际生效行为

先记录每类载具当前真正有效的按键、速度、加速度、刹车、转向和后续覆盖，不能只看
最前面的参数表。汽车、船、飞机和人物都先保留现有运动算法。

建立表格记录：

| 参数 | 当前文件/代码 | 当前作用域 | 后续覆盖点 | 最终消费者 | 目标文件 |
| --- | --- | --- | --- | --- | --- |
| 键位 | input 配置/Playground | 全局/上下文 | 重绑 | 输入解析器 | `input-bindings.ts` |
| `maxSpeed` | vehicle spec/profile | 资产/实例 | runtime 赋值 | 车辆控制器 | 对应 profile |
| 水面/水下推进、阻力、转向、俯仰 | 水类 vehicle spec/profile | 资产/实例 | 水面/水下状态覆盖 | 水类控制器 | `watercraft.ts` |
| `pitchGain` | aircraft profile | 资产/实例 | debug profile | 飞行动力学 | `aircraft.ts` |

清单未完成前不删除旧来源。

### 阶段二：分离输入映射和运动算法

把键盘、手柄和手机按钮统一转换为语义输入，确认汽车、船、飞机和人物算法仍接收相同
的语义输入。新键位方案单独修改和验证，不与底层运动算法重写绑定。

### 阶段三：先接入解析器

新增 `resolveControlConfig`、schema 校验和 `inspectControlConfig`，先让旧配置通过适配器
进入统一解析器。此阶段不改变默认数值，只改变读取路径并记录来源。

### 阶段四：先迁移一个主体类别

建议先迁移一辆汽车或一艘船，再迁移人物、其他水类载具和飞行器。每迁移一类，验证：

- 默认键位仍然正确；
- 重绑定仍然正确；
- 同一资产的多个实例互不污染；
- debug profile 未开启时不会生效；
- 导出后可以重新加载并得到相同结果。

- 切换控制对象后旧输入不会继续生效；
- 停用、暂停、重置和销毁会清理正确的临时状态；
- 迁移前后的运动结果和相机表现保持一致。

### 阶段五：清理主体 spec 中的控制字段

主体 spec 只保留物理、几何、绑定和资产事实，并添加 `controlProfileId`。
删除重复的控制默认值；如果某字段暂时不能移除，标记为兼容字段并禁止新增调用方使用。

### 阶段六：删除无法解释的隐式赋值

逐个处理速度、加速度、转向等后续重新赋值点。能归入静态配置的，迁入 profile；
确实属于算法状态的，保留在运动算法/runtime state；确实属于临时限制的，改为命名
runtime override；无法解释来源的赋值不得保留。

## 12. 验收标准

### 结构验收

- 所有控制配置都有 `control/` 下的归属或明确的 SDK/preset-content owner；
- 主体 spec 不再重复保存控制默认值；
- 相机配置没有被移动到控制目录；
- 没有新增第二份可变 profile。
- 共享资产默认值和项目/实例覆盖不会互相写回。

### 行为验收

- 键位、重绑定和 HUD 提示来自同一语义输入定义；
- 飞行器起飞、爬升、转弯、横滚、拉起和降落手感与迁移前一致；
- 同一资产的多个实例可以独立覆盖；
- 未开启 `debugProfiles=1` 时，浏览器调参不会改变项目运行结果；
- 开启 debug profile 时，实际生效值与诊断来源一致；
- `reset`、重新加载和导出/导入不会丢失或串用实例配置。
- 切换控制对象、停用、暂停和销毁后，不会遗留旧输入或临时覆盖。
- 迁移前后汽车、船、飞机和人物的既有运动算法行为保持一致。

### 诊断验收

对任意关键参数能够回答：

```text
最终值是多少？
来自哪个 profile？
作用于哪个 assetId / instanceId？
是否被 debug 或 runtime override 覆盖？
当前配置版本是什么？
```

## 13. 结论

推荐采用“一个项目控制配置域、多个职责文件、一个解析入口、保留既有运动算法”的方案。

这样可以把项目侧键位和控制覆盖集中管理，同时保留 SDK 默认值、共享资产默认值、主体规格、
运行时状态和相机项目快照各自的边界。迁移的完成标志不是文件夹移动成功，而是每个控制
参数都能从唯一来源解析，输入设备与运动算法已经解耦，且迁移前后的实际运动结果保持一致。
