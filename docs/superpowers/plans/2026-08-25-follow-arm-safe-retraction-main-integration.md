# Follow Arm 安全回缩与主线集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute each implementation task with a scoped review before proceeding.

**Goal:** 修复第三人称 Follow Arm 在首帧与极近障碍时未及时回缩、以及解算后位置阻尼重新越过安全距离的问题；随后在独立 worktree 中将最新远端 `main` 合入 PR #31 的功能分支，并以最终合并树重新完成验证。

**Architecture:** `FollowArmSolverV1` 只负责每 tick 的 sweep、安全距离与臂长状态；`CameraDirector` 必须将解算后的安全姿态作为碰撞收缩时的最终 pose，不能再以位置阻尼或转场插值跨越该边界。`MotionKernelRuntimeV1` 继续独占 Subject facing。Git 集成由主代理在干净 worktree 中串行完成，绝不触碰当前脏工作区。

**Tech Stack:** TypeScript、Babylon.js、Vitest、pnpm、Git/GitHub CLI。

**Spec:** `docs/superpowers/specs/2026-08-25-follow-arm-safe-retraction-main-integration-design.md`

## Global Constraints

- `minimumDistanceMeters` 是构图偏好，发生遮挡时绝不能提升 `collisionSafeDistanceMeters`。
- 每个固定 tick 必须满足 `effectiveArmLengthMeters <= safeArmLengthMeters`；无遮挡时 safe 等于请求长度。
- 收缩（含首帧和极近障碍）必须即时，恢复才可按 `collisionRecoveryMetersPerSecond` 平滑；第一人称不得做 Follow Arm sweep。
- WASD 的 yaw-only 相机相对移动与 Motion Kernel 的 Subject facing 权威不能回退。
- 合并必须保留 main 的 M5 回滚保护、Playground 启动顺序、G Bot v2 资源与所有测试门禁；不得删除测试或降低断言。
- 当前 `feat/gameplay-camera-optimization` worktree 有用户未提交改动。不得 reset、stash、checkout 覆盖或在该 worktree 合并；所有集成写入单独的 git-ignored worktree。
- `pnpm test` 失败必须逐项复现并修复；若失败只可由外部环境前置（例如未安装的运行时）解除，记录确切证据并向用户请求该外部授权，不能在 PR 中豁免。

## Work Graph

| ID | 依赖 | 产物/接口 | 文件所有权 | 模式 |
| --- | --- | --- | --- | --- |
| T1 | 无 | 已验证远端 main SHA 与干净集成 worktree | `.worktrees/camera-optimization-integration`、Git refs | main-agent-only |
| T2 | T1 | 不会把最小构图距离当作安全下限的 Follow Arm | `follow-arm-solver.ts`、其单元测试 | sequential |
| T3 | T2 | 解算后位置/转场不能越界的 Camera Director 安全 pose | `camera-director.ts`、预览通道回归 | sequential |
| T4 | T1,T3 | main 三方语义比对、合并冲突解决和最终验证产物 | 集成分支、生成产物 | main-agent-only |
| T5 | T4 | 全量门禁、GitHub CI 与 PR #31 状态证据 | 验证日志、PR 描述 | main-agent-only |

## Task 1: 建立可审计的主线集成基线

**Files:**
- Create: `.worktrees/camera-optimization-integration/`（git-ignored 临时 worktree）
- Create: `.superpowers/sdd/2026-08-25-follow-arm-safe-retraction-main-integration/progress.md`

**Steps:**
1. 记录 `git ls-remote origin refs/heads/main`、PR #31 base/head SHA 与现有 feature head。
2. 使用 Git 传输 fetch 远端 main，验证 fetch 后的 `origin/main` SHA 等于同一次远端查询结果；不同则重新查询并记录时间差。
3. 从当前 feature 提交创建独立集成分支/worktree；检查该 worktree 干净且当前原 worktree 未被改写。
4. 记录 feature 到远端 main 的 merge-base 与差异摘要，作为 T4 三方语义比对基线。

**Verification:** `git status --porcelain`、`git rev-parse origin/main`、`git merge-base`、`git diff --check`。

## Task 2: Follow Arm sweep 的即时安全回缩

**Files:**
- Modify: `packages/runtime-babylon/src/follow-arm-solver.ts`
- Create: `packages/runtime-babylon/src/follow-arm-solver.test.ts`

**Steps:**
1. 先新增直接调用 `FollowArmSolverV1` 的失败回归：`minimumDistanceMeters` 大于极近命中安全距离时，首个 tick 的 effective 不得超过命中距离减半径；同一测试还验证无遮挡恢复的单调且速率受限行为。
2. 将命中距离减 `collisionRadiusMeters` 后的非负长度定义为本 tick `safeArmLengthMeters`；不得与 `minimumDistanceMeters` 取 max。
3. 阻挡或安全距离变小：将 solver 内部长度直接 clamp 到安全长度，不调用收缩速率插值。无阻挡且安全长度变大：仅以 `collisionRecoveryMetersPerSecond * max(0, deltaSeconds)` 逐步恢复，且最终 clamp 到本 tick safe。
4. 保持现有五射线探针、Subject 自身过滤、命中遥测和 reset 语义不变。

**Verification:** `pnpm exec vitest run packages/runtime-babylon/src/follow-arm-solver.test.ts`；测试必须包含首帧极近障碍、持续遮挡、无遮挡恢复和 Subject 自过滤。

## Task 3: Camera Director 对安全 pose 的后处理约束

**Files:**
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Modify: `packages/runtime-babylon/src/camera-preview-channel.test.ts`

**Steps:**
1. 先将现有阻挡测试加强为首个 orbit tick 即断言 `effectiveArmLengthMeters <= safeArmLengthMeters`，并以极近 blocker 验证不会因位置阻尼留下超安全有效臂长。
2. 定义碰撞收缩为不可滞后的安全边界：当 `isCollisionRetracted` 为真，Camera Director 直接采用 Follow Arm position，跳过会向旧 pose 回插的 position lag 与 transition position 插值；target/FOV 仍可按原规则平滑。
3. 无阻挡恢复继续允许既有 position damping，但只使用 solver 已限速且不超过当 tick 安全距离的 desired position。
4. 保持第一人称没有 Follow Arm telemetry/sweep 的行为不变。

**Verification:** `pnpm exec vitest run packages/runtime-babylon/src/camera-preview-channel.test.ts packages/runtime-babylon/src/capability-runtime.test.ts`；验证首帧、极近、sprint modifier 前后、退出遮挡、第一人称与至少 30/60/120 Hz-like fixed-input 节奏。

## Task 4: 合入远端 main 并进行三方语义冲突审查

**Files:**
- Modify only as required by merge: 远端 main 冲突文件、锁文件、G Bot v2 验证产物

**Steps:**
1. 在 T1 的集成 worktree merge 已验证的 `origin/main`，保留 merge commit，不 rebase 已公开 PR 分支。
2. 对每个冲突文件记录 base/incoming/feature 的语义；逐项确认 M5 Motion Kernel rollback、Playground Authoring 启动顺序、G Bot v2 资源 ref/hash、当前测试门禁均由最终树保留。
3. 将 T2/T3 通过的安全修复应用在合并后的最终树；若 main 已改动相同接口，重跑对应回归后才继续。
4. 重新生成由 main 要求的验证产物；`git diff --check` 后提交一条完整中文规范集成提交。

**Verification:** `git diff <merge-base>...HEAD --check`；`pnpm exec vitest run` 对所有受影响 runtime、registry、playground 测试；`pnpm typecheck`、`pnpm build`、`pnpm exec tsx scripts/verify-g-bot-subject-world.ts`。

## Task 5: 全量验证、CI 与 PR 更新

**Files:**
- Modify: PR #31 标题/说明（只在所有本地代码与产物检查完成后）

**Steps:**
1. 在最终合并树运行 `pnpm test`，对每个失败保留命令、退出码、首个失败根因；修复仓库内可复现失败并重新执行，直到通过或只剩需要用户提供的外部环境前置。
2. 推送集成分支到 `origin/feat/gameplay-camera-optimization` 仅在 fast-forward 可证明且用户先前授权的 PR 更新范围内；不 force push。
3. 等待 GitHub PR #31 对新 head 的所有 checks 真实完成；没有配置的 workflow 只能报告“未配置”，不得报告通过。
4. 更新 PR 中文说明，列出安全不变量、主线保留项、实际门禁命令与结果；不得掩盖任何失败。

**Verification:** `git ls-remote origin refs/heads/feat/gameplay-camera-optimization` 等于推送 head；`gh pr view 31 --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup`；所有本地成功命令有退出码 0。

## Final Review

1. 以 feature 与远端 main 的 merge-base 到最终 head 生成完整 diff package，进行独立代码审查。
2. 对 Critical/Important 审查意见执行一次汇总修复与 scoped re-review。
3. 只有当 Follow Arm 安全不变量、main 保留项和所有可在本机运行的门禁均有实际证据时，才更新 PR 状态。
