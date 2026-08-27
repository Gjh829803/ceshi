# Whitebox 3C vNext Golden Humanoid 集成进度审查

- 审查日期：2026-08-27
- 结论：**Task 6 Golden Humanoid 纵向切片已集成；Task 7 全仓 clean break 尚未完成**
- 工作分支：`codex/3c-vnext-task6-integration`（Diversion `dv.branch.6`）
- 基线：Diversion `dv.commit.1`，导入自 Git `387551a9f722d1ec2791654dac5bb4745103a01a`
- 发布状态：`experimental`
- 人工手感凭证：`0 / 2 FeelReviewReceipt`

本文是 Mode B 进度审查，不是生产完成声明。它记录 Golden 单人带骨骼角色已经闭合的
3C 权威链、实测门禁和仍由 Task 7/8 拥有的遗留范围。

## 1. 审查裁决

Golden Humanoid 现在由同一固定 Tick 事务驱动：输入、Action admission、LayeredMove、
一次环境/支撑采样、MovementMode、运动提案、BodyPort 碰撞裁决、Committed State、
动画与相机投影按冻结顺序执行。动画和 Camera 不再从速度、Clip 名或实时 Transform
反推世界模型事实；Root Motion 也只能作为锁定资源产生的 LayeredMove 进入同一 BodyPort。

这关闭了所有带骨骼人形产品路径的双运动权威：双 G Bot 也按 Subject 独立进入 vNext，
不再因为场景中存在第二个角色而回退旧 Kernel。全仓旧 Motion Kernel、静态夹具、坐骑关系
和未迁移控制类别仍未完成 Task 7 clean break，因此不能把整个 SDK 宣称为 clean break，
也不能把 Profile 从 `experimental` 自动升级。

## 2. 当前权威图

| 领域 | Golden 权威 Owner | Provider/表现层职责 | 禁止事项 |
|---|---|---|---|
| Movement | `@whitebox-world/character-movement` 的 `CharacterMovementRuntimeV1` | Babylon/Havok `CharacterBodyPortV1` 只采样和解算 | Motion Kernel、动画或 Camera 直接写 Transform |
| Locomotion | committed `LocomotionCapabilityStateV2` | Runtime 投影 legacy 兼容字段仅供未迁移消费者 | 速度或 Clip 二次推断 gait/verticalPhase |
| Action | committed Action State + 锁定 Presentation Registry | 播放器按 committed Tick 选 Clip | Clip 名、播放时间成为世界权威 |
| Root Motion | 锁定资源 → `LayeredMove` → MovementRuntime → BodyPort | 动画只呈现碰撞裁决后的结果 | 动画直接位移角色 |
| Camera | committed `CameraContextSampleV2` + Camera Domain | Collision Query Port、CameraDirector 独占最终 Pose | 原始输入、Socket 或 Relationship 在 unavailable 时冒充语义权威 |
| Transaction | RuntimeHost / WorldSession prepared transaction | Adapter 提供 prepare/commit/abort | Body、事件、Journal 或表现层提前发布 |

## 3. Golden Acceptance Matrix

| 验收项 | 状态 | 证据/边界 |
|---|---|---|
| 十阶段固定 Tick 和失败回滚 | 通过 | Golden spy-port 与 RuntimeHost transaction 测试覆盖 prepare/commit/abort |
| 走、跑、停、短/长跳、buffer、coyote、顶头、离台、斜坡 | 通过 | Golden 与 BodyPort conformance；Locomotion V2 发布 committed Tick |
| `takeoff/rising/apex/falling/landing` | 通过 | Apex 阈值/滞回/单次事件和 Landing 短状态均有测试 |
| 一个可中断 Action | 通过 | Action admission、Tick conflict、replay 和 Presentation Registry 测试 |
| 碰撞受限 Root Motion | 通过 | LayeredMove、RootMotionSource、BodyPort 接触锥和 Runtime 集成测试 |
| 动画只消费 committed state | 通过 | vNext AnimationPlayer 拒绝 authority Transform channel 和 Tick 冲突 |
| Camera 与动画消费同一 committed Tick | 通过 | Golden context projection、CameraDirector 和 Runtime replay 测试 |
| Orbit 不反写角色朝向 | 通过 | Camera preview/control focused tests |
| 30/60/120-like 一致性 | 通过 | Movement、RuntimeHost、Camera 与 legacy P1.5 cadence 测试 |
| Snapshot Hash / replay / rollback | 通过 | WorldSession 和 Golden fixed-input history 测试 |
| 真实 G Bot 浏览器 Smoke | 通过 | 14.07 m、finite Transform、Camera Up/Down 均通过；桌面与 390×844 ready，Console 无 error/warning |
| 多主体迁入 vNext | 通过 | 双 rigged G Bot 均发布 Locomotion V2，且不发布 `activeMotionKernelRef` |
| 坐骑关系迁入 vNext | 未完成 | Golden mounting 仍 fail-closed，Task 7 负责 V2 relationship adapter |
| 全仓旧权威退出 | 未完成 | Ledger 当前仍有 61 个受控 live references |
| 人工手感升级 | 未完成 | 必须补齐两轮绑定 Commit/Profile Hash/Fixture Take 的 `FeelReviewReceipt` |

## 4. 本轮发现并修复的问题

### P1：同 Tick legacy Camera Context 被重复重算

真实浏览器固定输入曾触发 `3C_CAMERA_CONTEXT_UNCOMMITTED`。原因是同一 committed Tick 内，
多次视角更新重新采样了实时 Socket/Input Tag。修复后 Runtime 按 Entity + committed Tick
复用一个不可变 Context，并在 reset、traversal reset、view revision 变化时失效。

独立复核进一步发现该 legacy helper 曾把 `semanticAuthorityStatus: unavailable` 覆盖成
`available`，从而错误提升 Relationship、Socket 和 Input Tag。现已保持 `unavailable` 和
neutral payload；Playground 坐骑测试也改为验证目标跟踪/碰撞臂长，而不期待伪造的
`mounted-framing` 语义 Modifier。

### P1：资源重测仍引用旧运行时换 Profile 契约

Golden 现在 compiler-lock Control Feel 与 Motion Profile。能力测试已改为验证越权请求抛出
`SUBJECT_OVERRIDE_FORBIDDEN`、Snapshot 不变、默认 locomotion 继续工作；不再用旧
Motion Kernel identity 证明实现。

### P1：P1.5 夹具意外进入 Golden 路径

P1.5 是保留的 legacy conformance suite。其夹具现明确使用 `visualBinding.mode = static`，
并用稳定的纵向相机相对输入避免侧移/朝向反馈环造成圆周运动。该 suite 10/10 通过。

### P1：Diversion clean workspace 的 diff sentinel

首次提交后，`dv diff` 在无工作区变化时返回文本 `No changes detected`，旧 verifier 把它
误当成 unified diff 并报 `3C_MIGRATION_PRIOR_UNAVAILABLE`。现已把该 sentinel 明确解析为
空 diff，再从 path history 取当前 commit 与冻结 import base；回归为 58 通过、1 skipped，
并已在 committed tree 上实测通过。

### P0：Havok 支撑连续性被错误当成位移放大

旧 Body 审计有三种错误假设：悬空时仍允许 snap-down、向下位移在斜坡接触面上的有界投影
必须为零、冻结的支撑表面速度每 Tick 必然完整施加。它们分别造成落地前瞬移、斜坡微位移
误报和起跳首 Tick 误报。现在只消费冻结几何/速度范围内且同向的真实贡献；unsupported、
upward、反向与超界对抗项继续 fail-closed，全局 `1e-9` 容差没有放宽。

### P0：表现根节点缺少 committed pose 插值

Golden 现在保存 previous/current committed visual pose，Render 只按 alpha 插值位置和最短 yaw，
不改 Snapshot、Body 或 CameraContext。构造时即应用初始 committed pose，避免首帧前 Socket/模型
仍在原点；这修复了持续移动时模型轻微上下抖动而相机稳定的分层不同步。

### P1：跳跃相位 Clip 与首个相机输入

`takeoff/rising/apex` 使用 Jump，`falling` 使用 Fall，`landing` 使用 LandHard；Landing 保持
8 个固定 Tick，足以完成 5 Tick entry blend。浏览器 Smoke 还在 reset 后先提交一个 neutral
Tick，使 Camera Profile/Context 在首个确定性输入前完成初始化，避免第一次 Camera Up 被重基准吞掉。

### P2：CameraDirector checkpoint ownership

Camera 事务 checkpoint 当前仍缺少跨实例 Owner token 的显式诊断。现有实例隔离与生命周期
测试未发现污染，但 Task 7 应把该项纳入 Ledger；它不阻断 Golden 单实例纵切。

### P2：极短 Falling 的两路 Blend

正常 Golden 跳跃已覆盖 Jump → Fall → LandHard；但若 Falling 短于现有 7 Tick Jump/Fall blend，
播放器晋升中间目标时仍可能出现权重跳变。后续应使用三路 blend 或 pose snapshot；不阻断本轮
正常人形跳跃和人工手感评审。

## 5. 验证记录

| 命令/门禁 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `runtime.test.ts` | 118 / 118 通过 |
| 3C 核心六文件 | 250 / 250 通过 |
| Playground Adapter | 28 / 28 通过 |
| `capability-runtime.test.ts` | 11 / 11 通过 |
| `p15-conformance.test.ts` | 10 / 10 通过 |
| `gameplay-babylon-runtime-coordinator.test.ts` | 10 / 10 通过 |
| Agent Planner/Builder generated self-check | 11 项通过 |
| `verify:3c-migration` | 通过：11 entries，61 live references；禁止遗留数增长 |
| Workspace boundary | 通过：51 个已登记 debt entries |
| Test census | 通过：292 files = 260 contract + 32 resource-heavy |
| Playground production build | 通过：2,270 modules；保留既有大 chunk warning |
| Resource-heavy 全量 | 27 files / 466 tests 通过，1 file / 21 tests skipped；4 files 失败 |
| Contract 全量 | 250 files / 2,865 tests 通过，3 skipped；10 files / 50 tests 因 Windows 环境基线失败 |

Resource-heavy 的剩余失败全部发生在 3C 之外：三个 suite 因 Windows 原子目录发布失败而
无法完成 WorldPackage setup；两个 fresh-process test 因 `spawn pnpm ENOENT` 失败。

Contract lane 的 50 项剩余失败集中在 Windows 对 POSIX `0700`、owner-private WAL、目录
fsync/原子 rename、symlink 权限以及 FFmpeg/terrain CLI 环境的差异。它们在本轮改动前
已存在，且不位于 3C production files。修复本轮 mounted-camera 断言后，全量通过数由
2,864 增至 2,865，失败数由 51 降至 50。

G Bot 产品 verifier 已完成 Compiler，得到 Execution Plan Hash
`sha256:8dc6ccfdfdde31fd7ca4eb980c3288e7ffdd38a9313a1cc9000cf67f633e00cf`，
随后同样因 Windows 原子目录发布返回 `WORLD_PACKAGE_OUTPUT_UNAVAILABLE`。

## 6. 迁移 Ledger 真相

当前 11 个切片中有 8 个 `live`、3 个 `migrating`。Golden 生产路径已不发布
`activeMotionKernelRef`，Camera V2 和 Subject motion/action 二次推断的目标计数已降到 0；
其余引用属于 mount/static legacy owners、兼容合同、测试与尚未执行的全仓 clean break。

Task 7 必须在同一次纵切迁移中删除对应旧 Owner，不允许主线长期运行两个 Golden 权威；
但也不得为了让数字归零而删除仍服务未迁移产品类别的 legacy path。

## 7. 合并后的下一步

1. 在支持 POSIX mode、symlink 和目录 fsync 的 CI/WSL runner 复跑两条全量 lane。
2. 执行 Task 7：逐切片把 mount/static legacy 等消费者迁到 vNext，然后删除旧 Kernel/Resolver。
3. 为 commit + Profile Hash + Fixture Take 执行两轮人工手感评审；在此前保持 `experimental`。
4. 人工评审先看镜头稳定与眩晕风险，再看走跑跳、动作中断和 Root Motion 碰撞手感。
