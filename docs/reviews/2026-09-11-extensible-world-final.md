# R0–R3 / C1 最终集成检查

本次范围由用户在 2026-09-11 明确收敛为 R0–R3、C1 与对应 R6 验证。
R4 通用持续任务/动作事件和 R5 新姿态/动作包绑定留后续。它们不是当前世界
创建、角色控制、导航、交互、骑乘或录制的启动依赖。本记录不承诺这些未来能力。
全部改动累积于 `codex/extensible-world-r0`，没有合并主分支或执行外部生产。

## 分层与实际扩展路径

| 要求 | 当前实现与实际消费者 |
| --- | --- |
| 普通 Three 创作 | `createWorld/addEntity/addCharacter` 接收普通对象和碰撞；自绘车辆使用 `createRoadVehicleSpec` 的尺寸/轮组/座位与独立 visual root |
| 内容独立维护 | `assets/three-creator/catalog/<assetId>.json` 是独立源，派生目录由 `content:sync` 汇总；Creator discovery/compiler 与 capsule 读取同一来源 |
| Playground 到 AI 接入 | 仓库 `whitebox-content-integration` Skill 指明调参来源、代码绑定、发现工具、SDK owner 和 Creator/Episode 验证；不要求通用注册框架 |
| 共享资源与实例隔离 | Source101 `source-character-assets` lease 共享原始资源；每实例骨架/mixer/可变动画状态独立；最后释放源资源；普通资产由 `WorldAssets` 管理实例所有权 |
| 多 Actor 与 NPC | `WorldEngine` 统一登记普通与完整角色；`Simulation.actors` 管理完整人物，普通角色经借用的 `ThreePhysics` 执行；输入与相机目标分开，导航返回意图，共享 Rapier 提交实际位移 |
| 交互和占用 | `WorldInteractions` 管理目标/槽位/generation/预约；动作完成后持有与占座继续存在，删除/复位和安全退出清理真实关系 |
| 资源仲裁 | `ActorResources` 原子获取移动/动画/姿态/左右手，导航、动作和关系使用同一账本；失败无部分占用，候选计划不写实际状态 |
| 相机与时间 | WorldEngine 固定时钟和唯一物理推进；车辆保留每秒120子步；主相机同一时刻一个 owner，显示与捕获只采样已提交状态 |
| Agent 叙事扩展 | `registerPrototype`、spawn/despawn、`execute`、导航/巡逻和现有动作可组合；新执行能力修改所属 SDK 模块，不额外创建物理/动画/镜头循环 |
| 两端消费 | Creator 真实 playtest，独立 Episode prepare/advance/execute/operation/frame 和 actionGoals 消费同一接口与运行时字节 |

不能保证任何数量的资产、任意行为或未来要求永远不需重构。当前边界使复用现有能力的
模型/配置接入主要落在内容层；新的物理或动作能力仍需实现和验证所属执行模块。

## 本轮深查后修复

1. **大地板匍匐下沉。** 原生大 Cuboid 的接触精度导致完整人物在40米地板下沉约
   0.42米。固定盒体现在保持相同体积/transform/真实 collider 身份，内部用至多4米
   的 Voxel 单元避免大支持面精度与内部接缝；构建期共享 native shape，结束后封存。
   小盒体仍是 Cuboid。导航读取同一盒体定义的外表面，未扩展导航三角数量。
2. **准确查询与支持。** Voxel 的单次 `contactShape` 不支持完整实体体积查询；仅对
   SDK 构建且不可变的完整盒体，用同一半尺寸和 collider 当前 transform 做 Cuboid
   接触。任意 Voxel 或被替换的 shape 不冒充完整盒体。原生 solver manifold 观测包含
   clustered contacts，车辆支撑/碰撞事件不再因几何 manifold 清空而丢失。
3. **原生扫掠缺陷。** pinned Parry 补丁修正 target distance 未覆盖候选单元、网格
   舍入导致方向被丢弃，以及前缘跨格时提前丢掉后缘仍覆盖的单元。只修候选范围，
   保留原 narrow phase；相机继续用原生 world cast，没有保留临时 JS 扫掠绕行。
   独立窗口覆盖检查480,000次；1,440项扫掠无命中/漏检差异，整体盒体与逐格 GJK
   仍有最大约0.511毫米的数值差，不宣称完全等价。源码 patch、依赖锁和 archive
   SHA256 均可检查，普通安装不需要 Rust。
4. **动作接近条件。** 拾取/坐下资格检查与实际水平对齐使用同一水平路径；垂直
   容差、重力和支撑仍由现有 owner 判定，避免将向下对齐到地面的向量误判为障碍。
5. **默认值与假入口。** 内容车辆继承 SDK 默认配置，仅保留有意差异；全部32项
   resolved spec 修改前后深比较一致，含原隐式轮组。删除没有执行消费者的
   `CharacterOptions.locomotionBindingId`，目录复数标签仅用于发现；实际控制器由
   `asset/object + movement` 或 `humanoid` 实例确定，README 与 Skill 同步说明。
6. **调试消费者。** Playground 地面过滤使用真实 collider owner ID，摆脱对 Cuboid
   形状的假定；绘制仍来自实际 Rapier debugRender，不修改物理。

7. **原生人物推力归属。** KCC 将多个动态 collider 的接触查询写入同一数组，
   而 Parry 会覆盖而非追加，导致接触点与 body/pose 错配。现在按 collider 生成
   独立结果后组合，冲量公式不变。无地图、无 Voxel 的两物体例子复现了“椅子
   没被推、未接触的邻居反而被推”；两种插入顺序的回归和原家具场景通过。
8. **公共消费边界与测试身份。** Creator 交互 schema 改从 SDK 公共导出读取，
   工作区边界检查为零债务。潜艇路线测试显式选择原定 `vehicle.sub`，避免目录
   排序变化后错误选到5 m/s观测潜艇；路线、时长、阈值和实际路由代码均未修改。

9. **子步时长隔离。** 车辆物理子步临时使用1/120秒，完成或抛错后恢复调用方的
   timestep。完整人物的KCC冲量读取同一参数；原先遗留半帧时长会让下一帧推力
   翻倍。新增实际身体接触对照证明有无远处车辆时人物推力一致，并保留两次车辆
   子步和异常恢复检查；没有调整人物质量、车辆参数或冲量公式。

测试断言也核对了实际语义：角色碰撞逐tick检查胶囊间距/穿透，允许真实绕行；
滑雪静止转向比较相同 neutral 身体与输入身体的角度差，保留速度/位移限制，
不把共同的微小接触静置偏航当成输入能原地旋转，也不修改操控参数。

## 与公开引擎实践的关系

Three 的 [SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html)
会重新关联克隆骨骼，但几何/材质默认共享；因此 SDK 明确实例可变状态与源资源
释放归属，而非将普通 clone 当作完整生命周期隔离。
Epic 的 [资产管理说明](https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-management-in-unreal-engine)
区分资产身份、引用依赖、加载与卸载。这里采用对应的责任划分和资源闭包验证，
不照搬 UE 的框架和所有资产注册流程。这些是适用于本项目的实践判断，不是
第三方对本项目的认证，也不能替代实际消费者测试。

## 最终证据

SDK 最终运行时为 `4a3ca6d7683a90646c12ee31267e2c8ef3186dc5d35b92c181b46c9468a1b70b`，
预编译清单位于 `.codex-tmp/r0/r6-final/runtime-verified/runtime-manifest.json`。
原生依赖 archive SHA256 为
`575cd152b6fe51d67003e56213d9c3996c4c3aef3855977a77d0d31bb01dde5c`；
`native-identity.json` 核对构建源码、patch、Cargo.lock 与 archive。
各 report 自带 source/runtime 身份；不同场景源码 hash 不混为同一份场景。

| 验证 | 结果与本地证据 |
| --- | --- |
| SDK 最终测试 | 55文件876项通过；`sdk-timestep.log` |
| 受最终 timestep 修复影响的消费者 | 60项通过；`consumers-timestep.log` |
| Creator / Episode 全量消费者 | native575版本450项通过，1项冷启动超时；将该资源重测试的墙钟上限设为15秒后，相关31项通过（`consumers.log`、`preset-display.log`）；模拟时长与断言不变 |
| Node 消费者 | 140项通过；`.codex-tmp/r0/r6-node-consumers.log`，云传输 mock |
| 人物与混合角色 | `verified/actions/report.json`、`verified/mixed-actors/report.json`；Creator 真实输入及独立 Episode 通过 |
| 共享交互 | `verified/interactions/report.json`；争用拾取、持有/释放、独立座位、起身、复位和 actionGoals 通过 |
| Playground 配置消费 | `verified/profile-bike/report.json`；实际导出 speed=4 配置，Creator / Episode 骑乘、行驶、制动、退出及 reset 后有效配置通过 |
| 原 Playground UI | `playground.log`；驾驶、输入焦点、暂停/恢复、复位、弹窗、小屏及导出通过 |
| 构建与工程边界 | typecheck、lint、test census、runtime prebuild、32项内容源一致、零 workspace 边界债务及 frozen offline install 通过；对应日志在本目录 |

上述无前缀文件均位于 `.codex-tmp/r0/r6-final/`。后加的 Playground NPC 展示
只修改应用与地图内容；其独立浏览器证据另列，不将之前的 UI case 冒充新增入口验证。

同机相邻复测的单角色固定帧 p95：R0 为1.0/0.8/0.8ms，当前为1.0/0.9/0.9ms。
稳定样本差约0.1ms（约12.5%），接近浏览器计时粒度；native physics p95均约0.1ms。
这不足以宣称无性能回退，也不能精确归因。3角色 p95 为2.2/2.5/2.2ms，10角色
为6.0/6.4/6.9ms；两组 NPC 均有实测巡逻位移，物理仍每600tick执行1200子步。
见 `verified/single-comparison.json` 与 `verified/perf-{1,3,10}/report.json`。

独立源码审查记录为 `.codex-tmp/r0/r6-independent-review.md`。修复后未确认剩余
P1/P2 问题，但不承诺不存在所有 code smell。PR232远端仍是较早的R0提交
`53f8f059`；其成功 CI 不覆盖本地最终改动。本轮没有推送、合并或外部生产。
真实输入和媒体证明功能执行，不替代用户对动作观感、镜头手感的人工验收。
开发环境还观察到布局切换的 ResizeObserver 通知警告与软件渲染器能力警告，
未在上述 UI case 中形成实际功能失败，不宣称浏览器全局零警告。


## Playground NPC 展示交付

主 Playground 的地图选择器与 URL `/#/scenes/npc-workshop` 已接入一个玩家、
两个完整人形 NPC。地图文件只定义碰撞、物品和左右座位；`npc-playground.ts`
负责场地内实例生命周期、Presentation DOM 和演示命令。全部导航、动作、输入、
相机、动画与物理仍由既有 SDK 执行，没有新增 SDK 场景 ID 分支或第二运行循环。

角色切换同步当前动画/骨骼状态、辅助显示主体与镜头；物品显示读取所有角色的
实际持有附件。离场前交还玩家控制，离场后移除 NPC；基线只保存常驻内容，
reset 后按当前场地重建 NPC。异步加载使用 generation 和 SDK scope 失效检查，
取消也覆盖 SDK 排队期间较晚返回的 accepted 收据。

真实浏览器证据：`.codex-tmp/npc-playground/final-pass/report.json`，包含巡逻位移、
真实 WASD 控制和相机跟随交接、一个成功/一个拒绝的共享拾取、搬运放下、两个
座位与起身、取消、操作中复位、离场/再进入及小屏截图。最终 ready=true，恰有
两个新 generation 的 NPC，浏览器与 SDK errors 均为空。源码文件 SHA256 在
`.codex-tmp/npc-playground/source-identity.json`，Playground 生产构建通过，日志为
`build.log`。新增入口另经源码独立审查；发现的晚到收据取消竞态已修复。

浏览器接入过程中修正了场地演示条件：地图座位使用独立目标 ID，巡逻避开桌子，
可移动桌子沿用独立示例物理配置，接近物品先经过空通道，等待人物留出足够的
胶囊碰撞间距。没有关闭碰撞、放宽动作资格或调整 SDK 求解参数。
新增 UI 与地图相关23项测试、既有 preset workspace 24项、typecheck、lint、
32项内容源一致、test census 和零工作区边界债务检查通过。

新增入口之后，既有 Playground 浏览器回归也通过：实际驾驶2.293米、暂停后倒车、表单输入隔离、弹窗恢复及小屏布局；errors=[]。证据为 `.codex-tmp/npc-playground/existing-playground.log`。


## 合并主干后的收尾

`02537cfe` 已合入 `origin/main` 的 `cb216317`，保留显示诊断按需刷新与本分支
多 Actor/实际碰撞体归属；26项相关测试、typecheck、lint、census、Playground
构建及完整显示/NPC浏览器 case 通过。对应证据在 `.codex-tmp/main-merge/`。

随后对已观察到的页面热更新退出错误做了定向复现：`pagehide` 释放 SDK 后，
失焦、可见性和键盘监听器仍可能访问它，浏览器测试记录了三次
`HUMANOID_DISPOSED`。页面现在用同一个 AbortController 管理应用事件、画面
准备与工具注册，退出时先标记不可用并撤销监听，再释放实例与渲染资源。
没有给 SDK 添加忽略 disposed 错误的分支。

新增 `lifecycle-smoke.ts` 先复现失败，再验证退出后的焦点/可见性/尺寸/键盘/路由
事件、全部页面工具撤销及真实 reload 后 WASD 位移。浏览器通过，另有15项
画面准备/路由测试和 typecheck、lint 通过；日志在
`.codex-tmp/playground-lifecycle/{red,green,reload}.log`。此修复只修改 Playground
页面生命周期，不改变上述 SDK runtime hash。PR232远端实时核对仍为R0提交
`53f8f059`，其成功 CI 仍不代表本地最终分支已通过远端 CI。
