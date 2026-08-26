# Follow Arm 碰撞安全回缩与主线集成设计

## 目标与范围

本次集成修复 G Bot 第三人称 Follow Arm 在首帧、极近障碍和持续遮挡时可能穿过障碍的缺陷，并将 `feat/gameplay-camera-optimization` 同步到最新远端 `main`。同步时必须保留主线中的 M5 Motion Kernel 回滚保护、Playground 启动顺序、G Bot v2 资源和最新测试门禁，随后更新 PR #31 的验证状态。

不改变第一人称无 Follow Arm 的边界，不改变 WASD 的镜头 Yaw 相对坐标语义，不将 Camera Director 变成 Subject facing 的写入者，也不以删除测试或降低门禁来掩盖失败。

## 权威与安全语义

- `CameraDirector` 与 Follow Arm 解算器拥有镜头轨道、期望臂长、碰撞 sweep 和最终镜头位置。
- `MotionKernelRuntimeV1` 独占 Subject facing。Follow Arm、鼠标和方向键均不得写入 Subject facing。
- `minimumDistanceMeters` 是构图/体验偏好；它不是碰撞安全距离，也不能在发生遮挡时提高已回缩的臂长。
- 每个固定 tick 的有效臂长必须满足：

  ```text
  effectiveArmLengthMeters <= collisionSafeDistanceMeters
  ```

  其中 `collisionSafeDistanceMeters` 来自本 tick 的实际 sweep 命中结果和安全裕量；无阻挡时等于期望臂长。
- 进入遮挡、首帧发现遮挡和极近障碍时立即收缩到安全距离，不对收缩做可能越过障碍的时间插值。离开遮挡时可以按既有恢复参数平滑拉长，但每个中间值仍必须不超过当前安全距离。

## 运行时流程

```text
相机配置（desired / minimum）
  -> Follow Arm sweep
  -> collisionSafeDistanceMeters
  -> immediate clamp(desired, collisionSafeDistance)
  -> 可选的无碰撞恢复平滑
  -> 最终 Camera pose

WASD
  -> CameraDirector yaw-only control frame
  -> Motion Command
  -> Motion Kernel 平面速度与角色朝向
```

收缩路径不得使用 `max(minimumDistanceMeters, collisionSafeDistanceMeters)`。它只能选择不大于安全 sweep 允许值的有效长度。

## 集成策略

采用将最新 `origin/main` 合并到功能分支的策略，避免对已公开 PR #31 强制推送。当前工作区含用户未提交文件，因此不得在其中执行合并、重置或 stash；在独立的临时集成 worktree 中完成所有合并与验证，再安全更新功能分支。

在开始合并前必须通过 GitHub 远端和 Git 传输重新获取并记录同一个 `main` SHA。若 GitHub API、`git ls-remote` 和本地远端跟踪引用不一致，以成功 fetch 后的远端跟踪引用为合并输入，并记录其余引用的时间差。

## 工作图与所有权

| ID | 目标与交付物 | 依赖/阻塞 | 独占所有权 | 验证 | 模式 |
| --- | --- | --- | --- | --- | --- |
| I1 | 记录最新远端 main SHA、PR 基线和干净集成 worktree | 阻塞 I3/I4 | 临时 worktree、Git 集成命令 | `ls-remote`、fetch、merge-base | main-agent-only |
| I2 | 复现并修复 Follow Arm 安全距离 | 阻塞 I4 | CameraDirector/Follow Arm 解算及其测试 | 首帧、极近、遮挡进入/退出回归 | sequential |
| I3 | 输出三方语义冲突清单 | 依赖 I1，阻塞 I4 | 只读提交范围与冲突清单 | M5、启动顺序、G Bot v2、门禁逐项比对 | parallel-safe |
| I4 | 合并 main、解决冲突、生成最终产物 | 依赖 I1/I2/I3 | 功能分支历史、锁文件、生成产物 | 合并后差异审查和专项验证 | main-agent-only |
| I5 | 运行全量门禁并更新 PR #31 | 依赖 I4 | PR 描述与检查状态 | 聚焦测试、typecheck、build、G Bot verifier、`pnpm test`、GitHub CI | main-agent-only |

## 冲突解决保留规则

1. M5 Motion Kernel：保留 main 的回滚与失败保护；仅在不破坏该保护的前提下保留摄像机相对运动修复。
2. Playground 启动：保留 main 的 WorldKit/Authoring 启动顺序和同世界证据注入约束。
3. G Bot v2：保留 main 的资源身份、哈希、Package/Registry 引用和生成校验；不得以旧资源覆盖。
4. 测试门禁：保留 main 的测试文件与断言；摄像机分支只能增加或语义化更新其覆盖，不能删除失败门禁。
5. 验证产物：只在最终合并树上重新生成；不得混入临时 worktree、旧世界哈希或不相关截图。

## 验证与完成条件

1. Follow Arm 回归至少覆盖：无遮挡、首帧遮挡、相机/障碍近于零距离、进入遮挡、退出遮挡恢复、30/60/120 Hz-like 渲染节奏和第一人称无臂模式。
2. 镜头输入与移动回归覆盖：鼠标/方向键不写 Subject facing；W/S/A/D 使用当前镜头 yaw-only 前/右向量；Shift 只改变速度。
3. 合并后运行受影响 Vitest、`pnpm typecheck`、`pnpm build`、G Bot verifier 和全量 `pnpm test`。
4. `pnpm test` 任一失败都必须有可复现根因和修复，或由用户明确指定外部环境前置条件；不能在 PR 中直接豁免。
5. 等待 GitHub CI 实际完成并检查结果。若仓库没有配置匹配的 CI workflow，PR 必须明确标为“CI 未配置”，不得报告 CI 已通过。

## 失败处理

- 若 sweep API 或单位含义与假设不符，先对已安装 Babylon/Havok 版本建立可执行探针，再修改解算。
- 若合并暴露的全量失败与摄像机无关，保留失败输出、按责任域拆分，并停止合并声明，直到修复或取得明确的环境授权。
- 若临时集成 worktree 无法安全更新功能分支，保留该 worktree 和提交，不重置当前脏工作区。
