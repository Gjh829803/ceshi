# Agent / SDK v2 独立职责与 Schema 审阅

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

审阅范围：仅设计，不评定当前 SDK 实现通过，不继续运行代码修改或物理实验。

- 设计正文：[Agent / SDK v2](https://github.com/seedleap/agent-whitebox-world-sdk/blob/4256b6fdf06c7ba732e13a7c9aeee553544438e9/docs/superpowers/specs/2026-09-05-agent-sdk-contract-v2.md)
- 拟公开声明：[public-api.d.ts](https://github.com/seedleap/agent-whitebox-world-sdk/blob/4256b6fdf06c7ba732e13a7c9aeee553544438e9/docs/superpowers/designs/agent-sdk-v2/public-api.d.ts)
- 审阅快照 SHA256：正文 `4fb47ed9f329d403352df5bb905dd30a5a5fcf19f202434ee2d4b7186d9f1b0b`；声明 `2f91fa4d4228cd5d09808594bceedf9be08ba3cab8ae03bec35426a2dc5af0d2`。

结论：职责方向成立，但下列合同缺口应在 D0 内闭合，再派发 D1–D6。核心问题是同一实际状态仍可能有两个合法写入口，或正文承诺的失效/接管行为在公开接口中没有对应约定。以下建议不是要求把底层物理参数或基础设施字段交给快模型。

## 已明确且应保留的决定

- Creator 创作普通 Three 几何及视觉子树；SDK 统一执行受管理的根变换、运动、动作与相机。
- WASD 移动、方向键转镜头，同 tick 使用期望镜头方向映射移动。
- 普通跳跃不会因竖直速度变负自动变成 fall/hard landing；单次动作结束归还控制。
- NPC stop 暂停自主行为；move-to 完成后不会被巡逻立即带走。
- 参数描述期望值，实体描述实际姿态；accepted 不等于 reached。
- 快模型只读取真实能力并提交意图；来源、命令 ID 和上下文由 Host 绑定。
- 镜头碰撞约束优先于平滑；旧碰撞草稿不被描述为已通过的实现。

## 必须先修的合同缺口

### A01 — 持久参数仍可执行非持久、一次性的副作用

位置：正文 §7–8；`ParameterDefinition.plan`、`PrimitiveCommand`、`WorldDescription.parameters`。

`ParameterDefinition.plan` 当前返回任意 `PrimitiveCommand[]`，因此下列定义在类型上成立：参数值变化返回 `entity.spawn`、`entity.apply-impulse` 或 `entity.play-action`。这些操作不是某个持续期望状态的投影。正文又规定 initialValue 在 start 前求值、reset 恢复同一映射；由此无法确定是否重复生成、重复施力或再次播放。

**最小失败场景：** `gate.open=true` 已提交，0.35 秒旋转执行到一半后被 `operations.cancel` 取消。参数仍显示 true；实际门半开。未约定此时是暂停、失败、继续自动收敛还是回滚 false，也未说明后续设置同一 true 值是否重试。

**必须明确：**

1. 将参数计划限制为能表达持续目标的操作/意图；一次性生成、冲量、动画触发放入 action。若允许参数控制持续 NPC 任务，须明确它拥有的是目标状态而不是反复触发命令。
2. 描述中给出 desiredValue 与执行状态的关系：未提交、收敛中、满足、失败/取消及最近 operation。失败后保留期望值还是回滚须选择一种语义，不能静默显示已满足。
3. 明确重复相同值的行为；幂等 commandId 与“用户再次要求相同目标”是不同问题。
4. 初始参数映射带 duration 时，start 是直接求值到初始终态，还是等待完成才封存/ready。不能在首帧封存一个与 initialValue 不一致的中间姿态，也不能等待永不完成的 follow 任务。

### A02 — 通道声明缺失，且 locomotion 与根变换的重叠尚未仲裁

位置：正文 §2、§7–8；`ParameterDefinition`、`ActionDefinition`、`EntityState`、`PrimitiveCommand`。

正文要求禁止未声明的目标/通道，但两类 Definition 只有 `entityIds`，没有写通道声明。单次运行 plan 不能推导所有分支会写什么；number 参数的所有取值也不能通过穷举证明。`entityIds` 还没有区分被读取、被修改和即将创建的对象。

另一方面，locomotion 被描述为独立通道，但它实际写入 character 根 position 和 facing rotation；`entity.set-position(duration)`、`entity.set-rotation(duration)` 同样写这些字段。

**最小失败场景：** 快模型让正在走路的 guide 在 0.5 秒内转向 90°，导航下一 tick 又按路径朝向覆盖 rotation。两个入口都符合当前 API，仍重现每帧抢写。

**必须明确：**

1. 参数/动作声明可核验的写目标与通道集合，或者采用同等可静态建立绑定的接口。参数占用的通道应能由 describe 返回，不能只在失败后靠字符串解释。
2. 给出实际写入通道的依赖关系：character locomotion 占用根位置及行进朝向；独立视觉朝向/尾巴摆动不占用这些根通道。
3. 给出 fixed、kinematic、dynamic、character 对即时/持续 position、rotation、scale 的允许矩阵。尤其 dynamic 的物理所有权、character 的瞬移/持续移动、kinematic 的关门过程不能靠实现者猜测。
4. 同一事务内既写 parameter 又绕过它写根通道，必须在提交前整体拒绝。Action 展开后也不能绕过参数所有权。
5. 控制权转移对旧任务的取消结果、状态暴露和恢复方式应可观察；owner 来源不能由 Controller JSON 自填。

### A03 — 纯计划的事务验证范围需要覆盖完整展开和候选世界

位置：正文 §6–7；`ActionDefinition.plan`、`onInteract`、`CommandReceipt`、`OperationStatus`。

“校验全部内置操作，原子提交状态与任务意图”是正确边界，但尚未确定验证是在当前 live registry 还是按计划构建的候选 registry 上进行。

**最小失败场景：** 一个 action 返回 `spawn(crate)` 后 `attach(crate, hero)`。只验证当前 registry 会错误拒绝尚未存在的 crate；逐条执行后再验证会在 attach 失败时留下已生成 crate。类似地，两个 parameter 展开后可能冲突，即使各自独立合法。

**必须明确：**

- 计划一次性求值，完整展开参数投影，收集读/写身份与通道、所需资源和预算，然后验证候选最终状态。不能在已开始提交后再次调用 plan。
- 说明是否支持计划内新建对象引用、重复写同通道、despawn 后重用 ID；若首版不支持，应明确拒绝，而不是留下未定义顺序。
- 准备失败时，参数值、实体 generation、任务表与物理候选都不发布。
- accepted 的 operation 是整个计划的聚合任务还是单个执行任务；若多持续操作未来部分成功，要能报告各项状态，不能将其描述为全体到达。
- 纯计划须同步、无副作用；authoring 检查是正确性约束，不是任意 JavaScript 的可证明事务沙箱。越界写被发现后的失败/暂停/重置策略应明确。

### A04 — reset epoch 保证缺少 Creator 异步调用的绑定入口

位置：正文 §6、§8；`ExecutionOptions`、`UpdateContext`、`World`、`StateHandle`。

当前只有实体 generation 和可选 expectedWorldRevision，没有异步作用域/epoch token、取消信号或绑定了 generation 的实体句柄。Host 可以对模型请求绑定它实际读取的版本；普通 Creator Promise 回调仍持有 World 并可在 reset 后调用不带版本的 execute/addEntity。

**最小失败场景：** 请求 A 在 await 前针对旧 guide；期间 reset 移除并重建同名 guide；A 完成后 `world.execute({type:'actor.follow',entityId:'guide',...})`。SDK 无法仅从这个调用判断它来自旧 epoch 还是当前用户的新命令。

**必须明确：**

- SDK 自有 asset/path/prototype 准备自动绑定 epoch 与 entity generation，并取消过期提交。
- Creator 的异步工作也需要一个简单、可取消且带 epoch 的作用域入口，或明确安全的绑定句柄。快模型不负责填这些字段。
- scope 中的 execute/state/registration 提交拒绝旧 epoch，不能只取消 Promise 的等待者。
- 公共说明区分“SDK 管理的异步工作”与任意浏览器异步副作用；不声称 SDK 能自动还原闭包变量。
- worldRevision 在 reset 后是否保持单调、与 epoch 的组合规则、旧 operation 查询的生命周期应固定下来。

### A05 — 模板与资产实例的所有权、身体适用性尚未完整定义

位置：正文 §5；`AssetInstance`、`Assets`、`CharacterOptions`、`SpawnTemplate`、`registerPrototype`。

`SpawnTemplate` 持有可变 Object3D 或 AssetInstance，而同一资产也可以已经注册为 live hero。正文没有定义模板是借用、消耗还是在准备时封存快照；也没有规定准备成功后修改模板源对象是否影响未来 spawn。

**最小失败场景：** 以 hero 的 asset 注册 NPC 模板；随后 hero 换姿态/材质或被删除；再生成两个 NPC。如果模板复用活体根或 Mixer，则互相抢写；如果隐式转移所有权，则 hero 消失；如果每次读活体状态，原型身份不稳定。

**必须明确：**

- 模板准备时冻结什么：几何/材质基础值、局部变换、子树、身体与语义动作绑定。作者保有的源对象是否仍可编辑。
- spawn 每次产生独立根、骨架/Mixer、身份/generation 与可变材质；不可变资源可共享，释放不能影响模板或其他实例。
- prototype 的重名/替换、版本及准备失败后的可用性；旧异步准备不能覆盖 reset 后的新定义。
- `recommendedBody:null` 时 addCharacter 省略 body 必须明确失败或在类型中收窄；不可默造默认人体尺寸。search/describe 应让 Agent 在加载前判断是否具备角色身体与动作绑定。
- body 表示核心运动代理，不是包括长尾、翼、服饰的整对象包围盒；完整捕获范围与碰撞范围是两个明确概念。
- attach 对已有独立物理子实体的政策：首版可明确仅支持非物理附件；若需要抓取刚体，应是另一个已验证能力，不能静默移除其物理身份。

### A06 — 相机只有进入 follow 的入口，缺少合法退出与再次接管

位置：正文 §2、§5、§8；`World.camera`、`CameraFollowOptions`、`setCameraFollow`。

follow 激活后禁止 Creator 直接写游玩相机是合理的，但公开 API 没有退出 follow、切换 scripted/authored 模式、或提交过场镜头意图的方式。`activateOnInput` 控制首次激活，不等于释放控制权。

**最小失败场景：** 玩家已进入 follow；打开门后需要短暂看向塔顶再回到玩家。Creator 只能直接写 camera（违反职责）或反复改 follow target（不能表达同一功能），因此又出现被禁掉的原生能力没有等价入口。

**必须明确：**

- authored/opening、follow 和需要的 scripted 模式各由谁持有 camera，何时切换/取消/恢复。可以先只设计必要模式，但退出路径必须存在。
- 明确手动方向键/拖动是否打断 scripted 相机，以及恢复的目标朝向、距离、FOV 与弹簧臂状态。
- 相机 query/pan/orbit 的期望状态与被碰撞约束后的实际状态分开，运动输入不能依赖被避障改变的最终视线。
- capture 的临时相机所有权及恢复属于 Host/SDK，不能引入第二个持续写 camera 的循环；静态捕获不能无意重置实时用户修改。

## 应补齐的易用性与观测字段

这些不会决定具体物理算法，但正文与声明需要统一，避免实施时再次扩出隐含接口。

| 项目 | 当前缺口 | 建议 |
| --- | --- | --- |
| 能力不可用原因 | entity CommandDescriptor 有 reason；全局 actions 只有 isAvailable，prototype failed 没有 error | 所有不可用能力都返回可行动的原因与关联 ID |
| 通道与持续期望值 | 只有 locomotionOwner；parameter 只有 value/operationId | describe 返回参数的写通道绑定、desired 执行状态及实际 owner，保持只读 |
| 验收数据 | 标准要求速度/支撑/碰撞、期望与实际 arm 距离、动作时间；Snapshot 目前只有少量语义枚举 | 定义 Host 可读的诊断/遥测合同；不要求快模型每次读取全部底层数据 |
| 错误阶段 | 正文要求阶段与原始原因；RuntimeError 没有 phase/cause | 给出有界的阶段/原因结构，保留可用诊断而非拼接任意堆栈 |
| 私有游戏状态 | StateHandle.value 的 T 仍可能包含可变引用 | 说明读取是深只读快照还是借用；外部对象修改不应破坏 reset 基线 |
| 同步回调 | TypeScript 的 `()=>void` 仍接受 async 函数 | 明确 onUpdate 的 thenable 运行期拒绝/诊断；不要将单纯 typecheck 称为已保证同步 |
| Schema 验证 | ObjectSchema.required 可列未知键；数值约束可互相矛盾 | 注册时验证完整 Schema，不把类型兼容当成能力可发布 |

## 后续实现问题，不应现在替设计选算法

以下事项属于 D1–D7 的实现与验收，不是要求本轮继续写运行代码：

- 选择角色 pair 求解的迭代/收敛策略；保留旧速度 carry、相向穿入和墙边夹击的真实反例。
- 相机碰撞球查询、弹簧臂阻尼/滞回的具体实现与数值参数。
- 导航网格重建性能、多个身体 profile 的缓存与过期路径重算策略。
- 实例复制、资源引用计数、动画混合时间和 landing 阈值的具体实现。
- 固定设备上的命令延迟、30/60/120Hz 调度与实际控制手感。

D0 的退出条件应是上述合同选择进入正文、公开声明和设计例子且相互一致。类型检查只能证明接口使用方式；运行、浏览器、视觉与用户手感仍分别验收。

## 第二轮复核：§8.1–8.5 与同步声明

本轮只复核合同，不修改运行源，不重复物理/浏览器测试。

复核快照 SHA256：

- spec：`fb50aa591481852e75fc61a9ad00574e08eec2740386f8f176e138f419556796`
- public-api.d.ts：`ce8d7840b88002aa6d55b8046c4eef46bd061e91a69c7affcff928d9136856f0`
- quickstart.md：`25b3c4d08a5b468327ad685d6f2479fa13e4af6c5d8277bddf55282ddd8026e5`

| 原问题 | 状态 | 复核结果 |
| --- | --- | --- |
| A01 持久参数与副作用 | **resolved** | Parameter.plan 已收窄到 PropertyCommand；取消保留期望值与当前姿态并标 interrupted；新 commandId 可重试相同值；初始映射在 tick 0 求终态后再封存。与 ParameterHandle/describe 状态一致。 |
| A02 通道声明及运动共享姿态 | **not-resolved（主体已解决，仅剩下述声明映射）** | writes、控制所有者、locomotion 占用 position/facing，以及四类物理对象的写入矩阵已明确；但结构操作和冲量仍没有明确 WriteClaim 对应项。 |
| A03 纯计划与候选 registry | **not-resolved（主体已解决，仅剩下述计划内新对象权限）** | 完整展开、一次求值、候选验证、禁止重用 ID、聚合步骤与部分完成语义已明确；但 prototype claim 对计划内新建对象的后续操作授权尚无定义。 |
| A04 异步 epoch | **resolved** | runTask/TaskScope 提供 scope 绑定的资产、注册、execute、setState 和取消信号；正文明确旧 epoch 不能提交，裸 Promise 不在保证内，revision 单调与旧 operation 终态保留。 |
| A05 模板及身体 | **resolved** | 准备时封存独立模板，源对象后改不影响原型；实例和可变资源独立；原型重名/更新/reset政策、同一 asset 禁止两个 live 角色、recommendedBody 为 null 的拒绝及非物理附件限制均已明确。 |
| A06 相机接管 | **resolved** | cameraMode/useAuthoredCamera 提供明确释放与重新接管；过场仅 authored 模式写相机；重新 follow 清旧阻尼并从当前 pose 过渡；实时捕获与独立验收重置分开。 |

### 唯一剩余的共享合同点：完整的命令权限映射

这是 A02/A03 的收尾，不要求引入新调度算法。

当前 entity WriteClaim 的 channels 为 position / rotation / scale / visibility / locomotion / animation。以下内置命令的声明校验仍无确定答案：

- `entity.attach` 修改父子关系，不能只假定等同位置写。
- `entity.despawn` 修改实例生命周期，不能从某个属性写权限推导出来。
- `entity.apply-impulse` 提交物理冲量，不应被解释成接管物理所拥有的位置。

此外，正文允许同计划 spawn 后 attach，而 prototype claim 仅列 prototypeId，尚未定义它怎样授权该计划中新建 entityId 的后续写；“writes 引用真实目标”也应说明是否包含候选 registry 中的新对象。

最小场景：某 action 声明可生成 lantern 原型，返回 `spawn(lantern-1)` 与 `attach(lantern-1, hero)`。候选世界是合法的非物理附件，但无法从当前声明确定 attach 的写权限。将“原型许可”理解为可修改任意同名 live 对象则又扩大了权限。

建议补一张 PrimitiveCommand → WriteClaim 的完整映射，并明确：原型许可只覆盖本计划由该原型新建的实例；哪些计划内后续操作获准、哪些仍需单独声明；绝不匹配任意已有实体。字段可以沿用现有结构并写清语义，也可以给结构/冲量操作独立的声明项。ParameterDefinition 的 writes 最好同时收窄为四种 property channel，与正文“参数只声明实体属性通道”一致。

### 其他原有易用性意见的复核

不可用原因、phase/cause、运动/动画/相机遥测、深只读 State、onUpdate thenable 检查、Schema 注册验证均已补入正文或声明；没有据此新增运行实现要求。独立一页 quickstart 把常用入口与 SDK 实现规格分开，符合按需获取上下文的目标。完整 spec 不应成为每个 Creator 请求的必读长提示。

本轮结论：四项已闭合，两项共享一个小的声明一致性缺口。补齐该映射后可关闭本次 authority/schema 评审；D1–D7 的运行正确性仍须独立验收。

## 最终复核：六项合同问题全部关闭

本轮最终读取版本 SHA256：

- spec：`893a4a2b546cd9598e15667774004732dd50d6ab5eaad671518c34f9f20d9855`
- public-api.d.ts：`0a6ed4d88a594752b4bb0b072e36a32c377815708843a64fd5bf9c1992c57e2b`
- quickstart.md：`cf94a89b4d966ece2ea0a70dab431a6b4290f5265f0f492f9720bb07fb6f65e3`

| 原问题 | 最终状态 | 关闭依据 |
| --- | --- | --- |
| A01 持久参数与副作用 | **resolved** | PropertyCommand/PropertyWriteClaim 限定持续属性目标，参数执行状态、取消/重试及 tick 0 初始映射明确。 |
| A02 写通道与实际姿态 | **resolved** | §8.1.1 给出完整内置命令到 writes 的映射；EntityWriteChannel 显式包含 parentage/lifecycle/impulse；locomotion 与 position/rotation 做别名冲突检查；对象写入矩阵保持明确。 |
| A03 纯计划与候选 registry | **resolved** | prototype 许可仅覆盖本计划确实新建的候选实例及其合法后续操作，不授权任意 live 对象；创建初始化与随后一次写入区分；删除闭包要求独立注册后代的 lifecycle 声明，受控/受保护对象仍拒绝；聚合任务与部分完成语义保留。 |
| A04 异步 epoch | **resolved** | TaskScope 绑定异步资产/注册/状态/命令；过期提交拒绝；裸 Promise 的保证范围、单调 revision 和旧 operation 历史规则明确。 |
| A05 模板与身体 | **resolved** | 独立模板快照、实例与资源所有权、准备失效、推荐身体缺失的拒绝以及非物理附件范围明确。 |
| A06 相机接管 | **resolved** | authored/follow-pending/follow 与 useAuthoredCamera 明确唯一写者；重新接管、阻尼重置、输入处理与实时捕获恢复有对应约定。 |

新增 `Operations.wait` 与 `TerminalOperationStatus` 的职责也已对齐：等待只观察终态，不 step/start 世界；reset/dispose 取消任务并唤醒；Abort 只终止本次等待；未知/清理后的 ID 明确报错。等待完成后修改世界仍使用 scope，不因 await 获得新的写权限。这消除了每个 Creator 自行实现帧轮询的需要，没有引入另一个任务执行器。

本次支持范围以显式接口与 §2 为准：初始化几何自由；运行时支持声明的姿态/缩放和已准备原型生命周期，直接物理网格顶点/拓扑替换留待后续版本化接口。C09 已同步限定为受支持的姿态/缩放/增删；纯视觉子树与 mesh 派生碰撞子树也已区分，角色独立 body 的尾巴可自由变化，活动地形装饰需显式排除父碰撞。set-visible 仅控制视觉；despawn 才移除实例及其碰撞/导航/任务。该区分与 visibility/lifecycle 的独立声明一致，也已进入一页入口。

**最终结论：本次 authority/schema 一致性评审通过，A01–A06 全部 resolved。** 这是设计合同关闭，不是运行 SDK、3C 手感、浏览器结果或云端质量通过；现有未完成的实现草稿仍需按 D1–D7 的独立验证要求处理。本轮仅追加此评审文档，未修改运行代码、启动模型或重跑 SDK 测试。
