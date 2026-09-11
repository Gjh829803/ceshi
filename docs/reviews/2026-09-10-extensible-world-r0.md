# 可扩展运行时 R0：基线与接口决策

状态：R0 本地基线与合同决策已建立。不是 R1–R6/C1–C3 完成记录。

## 身份与当前基线

2026-09-10 在独立 worktree `fda3/agent-whitebox-world-sdk` 从
`3f52d21532232502827df6dd9a289078fc49bbe3` 建立 `codex/extensible-world-r0`。
fetch 后 origin/main 相同；没有修改主 checkout。
外部旧任务书的 training 路径映射到 `humanoid-runtime` 与 `shared/preset-content`。
L0 道路车辆诊断、固定翼配置入口已经存在，不重复实现。

本次 `pnpm build` 重新生成的浏览器 runtimeHash：
`b1c6951edded79025ceccf685ee41997a88851fae6ea2e8f4a93fe271ebf563e`。
与 L0 相同代表 runtime 字节相同，本记录使用本 worktree 新采集的证据。

## 已核对的 owner 与迁移位置

| 状态 | 当前实际 owner | 阶段决策 |
| --- | --- | --- |
| SDK tick、输入边沿、Episode 独占 | `WorldEngine.fixedStep`、ThreeWorld episode lease | 保留一套时钟与独占；Actor 不增加 requestAnimationFrame |
| Rapier 世界及子步 | Humanoid 选择 `EnvironmentQueries`，普通世界选择 `ThreePhysics` | R1 抽取借用与生命周期；唯一推进阶段根据车辆 rig 保留 120 Hz 子步 |
| 车辆子步 | `EnvironmentQueries.stepPhysics`: rig.beforeStep → world.step → rig.afterStep | 不改为每 SDK tick 无条件只 step 一次；初始化 query refresh 不算活动 tick |
| 完整人形 | `Simulation.humanoid/player`、`HumanoidRuntime.options.character` | R2 按 actorId 绑定控制器、mixer、骨架、输入和 generation；相机目标独立 |
| 导航 | `ThreeNavigation`、engine goalDrive/ensureNavigation | 扩展人形意图消费者及实际碰撞几何；复用重算、失效、受阻机制 |
| 持有/占座/目标碰撞 | 当前单角色 `ActionSystem` | R3 目标注册、物理本体、预约与持续归属移到世界；角色仅引用归属 |
| 对外执行/幂等/等待 | ThreeWorld execute、requests、OperationLedger | R4 原地扩展任务和取消，禁止第二动作服务 |
| 动作结果映射 | world.humanoidActivities → SkillResult → OperationStatus | 保留外部 queued/running/succeeded/failed/cancelled，不输出第二套终态 |
| 骨架求值/显示 | SourceCharacter mixer、Character presentation | R5 源采样与显示隔离；一个 actor 一个 mixer |
| 资源共享 | assets.ts 内容缓存、引用释放、实例 clone | R2 扩展 Source101 接入 lease，保留该加载器，不能只复制 runtime |
| 能力与发现 | action-schema、capabilities、Host discovery、资产目录 | C1 收敛 source descriptor/binding，派生索引；真实资格仍由 runtime predicate 判断 |

当前 `cancel` 并非总会谎报成功：ThreeWorld 的人形取消回调在技能仍 running 时抛出，
从而阻止 Ledger 标记 cancelled。R4 必须保留这个实际安全行为，再支持可等待取消点。
当前 `putDown` 同步完成，返回 applied；其他持续技能返回 accepted 和 operation。
R0 测试必须接受这一真实差异，不伪造缺失 operation。

## 本轮合同决策

以下是分阶段实施合同，不表示当前 schema 已支持这些字段。

- `actorId` 等于既有实体 ID，不建立平行身份。R2 扩展现有
  `humanoid.perform-action`/`humanoid.set-input` 的 actor 选择；未指定时解析为当前输入主体，
  不让所有 NPC 消费键盘。解析后固定 actorId 与 generation，后续切换输入主体不转移任务。
- `SkillRequest.action` 保留现有六个行为 ID，`targetId` 引用共享目标；首批每个 pickup/seat
  默认一个稳定 `slotId`，容量 1。MapInteraction 增加实体引用和局部锚点，保留旧字段真实语义
  到实际消费者同时迁移，随后删除被替代的未发布分支。
- operation 内关联 actorId/actorGeneration、targetId/targetGeneration、slotId、phase、
  startedTick/updatedTick 与结果；默认 inspect 返回摘要，详情按需，不复制全部骨骼/目标表。
- 命令去重沿用 commandId 与同载荷比较；同 ID 不同载荷拒绝。第一版不淘汰世界生命期内
  已接收命令的幂等记录，reset 不将旧请求重新当作新请求执行。
- World generation 与 Actor generation 分开。reset/map replacement 失效旧任务及引用，
  despawn 只清理该 actor。异步加载检查 generation，失效完成仅释放 lease。
- 资源 claim 在 schema 校验后解析 actor/target/slot，按稳定顺序原子取得；第一版冲突明确拒绝，
  不隐式无限等待。预约转为 heldBy/occupiedBy 后不随 operation 清理；放下/起身/移除才释放。
- grip/release 事件身份为 operationId + actorGeneration + actionInstanceGeneration + loopIndex + eventId；
  事件包含源时间和提交 tick。同源区间跨越一次，暂停、捕获和重复渲染不提交。
- 取消前未产生归属则释放预约；已持有后的取消不凭空放下；坐姿过渡或低顶保持真实姿态/占用，
  返回具体暂不能取消原因或等待安全退出。终态在真实清理后写入。
- 物理推进阶段拥有实际 Rapier；Actor 在前后阶段提交/读取自己的控制器结果。根运动只消费一次，
  camera/render/overlay 无权写逻辑根。姿态交接明确世界/局部空间、米、秒、骨原点速度。
- C1 manifest 的 package/version/dependencies 精确；模型、clip、rig、motion profile、action binding
  使用不同稳定 ID。运行时加载闭包与 Agent 索引由构建产生，权限仍来自 Host 冻结策略。
- R6 行为验证键覆盖完整单体 runtimeHash、精确内容闭包、resolved 配置、检查器与场景输入。
  不宣称已有模块级 runtime hash 或自动发布；本轮只准备本地发布/回退材料。

## 单角色性能实测

场景为当前 character-actions 的静止 Source101，保留桌椅动态物体；先 warmup 300 tick，
每轮 600 tick/600 render，连续三轮。Intel i9-9880H、macOS Darwin 24.6.0、
Chromium 151.0.7922.34、SwiftShader、1280×720、deviceScaleFactor=1。

| 轮次 | fixed p50/p95 ms | render CPU p50/p95 ms | mixer / Rapier steps | bodies / colliders |
| --- | --- | --- | --- | --- |
| 1 | 0.30 / 0.50 | 0.20 / 0.40 | 600 / 600 | 5 / 25 |
| 2 | 0.30 / 0.40 | 0.20 / 0.30 | 600 / 600 | 5 / 25 |
| 3 | 0.30 / 0.40 | 0.20 / 0.30 | 600 / 600 | 5 / 25 |

JS heap 采样约 47.4 MB，renderer memory 27 geometries / 2 textures。
JS heap 是浏览器近似值，不是整个进程/原生/GPU内存。render 是 CPU 提交耗时，不是 GPU 执行时长。
performance.now 精度约 0.1 ms，短时 10% 差异不能仅用此表判定回退，后续同场景多轮复测。
此基线没有支持多人；3/10 角色首次测量在 R2，不伪造旧多人基线。

## 本地证据与验证范围

原始样本及身份在 `.codex-tmp/r0/actions-final/report.json`。
Creator 全部原例输入录制 passed，MP4 在该工作区 `.three-creator/evidence/`。
独立 Episode 实际动作检查：移动/跳跃落地/切换视角、pickup 完成后继续持有再 putDown、
sit 完成后继续占座再 standUp，当前均通过；Episode page errors 为空。
关键帧来自实际 renderer；`.codex-tmp/r0/action-media` 保存 pickup/putDown/sit/standUp
四段 MP4，每段 60 个真实帧、20 fps、每帧推进 3 tick，源帧 hash 与动作状态在 timeline。
查看了拾取、坐下和起身关键帧；背后视角会遮挡部分手部/腿部，不能代替动作自然度人工验收。

`.codex-tmp/r0/bike/report.json` 保存自绘摩托 Creator 真实录制和三轮性能：
每轮 600 SDK tick、600 mixer、1200 Rapier step，2 bodies / 8 colliders，fixed p95 约 0.70 ms。
`.codex-tmp/r0/bike-reviewed/report.json` 补强行为断言并记录实际 WebGL 后端为 SwiftShader：
驾驶 120 tick 位移约 5.633 m、速度约 6.064 m/s；刹车 240 tick 后速度约 0.0000103 m/s，
随后下车成功。补测没有重跑已有 Creator/性能项目；它们保留各自准确 harness hash。

首轮 `.codex-tmp/r0/actions-first` 保留两个测试工具问题：把同步 putDown 错当持续动作、
tsx keepNames 辅助函数缺失使性能采样失败。修正测试脚本，不修改 runtime；后续完整动作检查通过。

工程：依赖安装、prebuild、typecheck 和 census 已运行通过；census 102 文件（31 contract、71 resource-heavy）。
新增脚本 ESLint、16 项 authoring-schema 实际消费者测试、文档相对链接和 diff 检查通过。
独立只读审查发现驾驶断言不足、环境标签可漂移、Creator 失败未导致非零退出三项问题；
已补实际位移/刹停、固定软件渲染并读取后端、检查录制及运行时错误，车辆补测通过。独立复核无剩余 actionable findings；只读复核不替代新的工程运行。
尚未完成：远端 CI、人工视觉验收。
未运行整个运行时工程测试：R0 未改生产代码，后续 runtime 阶段按 checklist 执行。

复现入口（输出目录必须不存在，避免覆盖失败证据）：

```sh
pnpm exec tsx scripts/three-creator/runtime-baseline.ts .codex-tmp/r0-new character-actions --record-actions
pnpm exec tsx scripts/three-creator/runtime-baseline.ts .codex-tmp/r0-bike custom-vehicle
```

`--skip-performance`/`--skip-creator` 只用于补缺失证据，不把跳过项报告为通过。
实施顺序与未完成项见[实施计划](../superpowers/plans/2026-09-10-extensible-world-and-content.md)。
