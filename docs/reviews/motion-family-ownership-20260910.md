# 大类物理所有权拆分验证

本记录描述分类拆分当时的验证。后续载具物理按用户指定恢复到 PR #225，当前行为与验证见 [PR #225 物理恢复记录](pr225-vehicle-physics-restore-20260910.md)。

工作区：`D:/CodexData/Temp/Workspaces/aircraft-seven-families-main-20260910`。基于 `63e25eb0` 的本地工作树，包含上一轮划桨归类修改；本轮没有提交或推送。

## 改动边界

- 车、水面船、飞机、飞行生物、水里、太空分别拥有物理配置解析、状态创建／重置和运动控制。人物继续使用独立 HumanoidController。
- 实例只有一个带大类标识的 `motion` 状态。船的划桨与刚体反馈均属于水面船；公共观察快照保持原有字段。
- 注册器只分发；原公共载具运动规则移入各类的 `dynamics.ts`、`intent.ts`、`motion-forces.ts`。固定翼、轮式车辆等旧算法文件移入所属目录，旧路径只重导出。
- `shared/rigid-body.ts` 只同步与回读刚体边界；`shared/body-state.ts` 只提供基础数据与数值校验。唯一物理世界、原更新顺序、碰撞响应及原生飞龙扫掠算法保留。
- 增加跨大类配置和直接跨类调用的拒绝验证。同一对象的双物理所有者错误优先返回原有 `VEHICLE_PHYSICS_OWNER_CONFLICT`。

## 最终通过的验证

1. 32 种预设，每种 360 个固定步长；分段推进、转向、加速、制动及水下升降。每 30 步保存位置、旋转、速度、油门和接地状态，拆分前后结果逐字节一致。对照数据在 `.codex-tmp/family-before.json` 与 `.codex-tmp/family-final.json`。
2. `pnpm exec vitest run packages/three-world/src/humanoid-runtime --pool forks --maxWorkers 1 --minWorkers 1`：26 个文件、423 项测试全部通过。包括船桨握点、骑手、飞机起落、飞龙、轮胎、碰撞、相机和实例隔离。日志：`.codex-tmp/family-physics-tests-final.log`。
3. `pnpm typecheck`、修改范围 ESLint、`pnpm test:census`、SDK runtime prebuild 通过。
4. 独立本地预览 `5296` 的浏览器实测：飞龙转向、制动后保持悬停、加速后自然悬停、喷火、T 切换、飞机／飞龙场景切换与重置；飞机起飞、转弯、回正、减油门与 T 切换通过，两个页面均无 pageerror。

浏览器结果和图片在 `D:/CodexData/Artifacts/motion-family-isolation-20260910/dragon` 与 `aircraft` 子目录。旧飞龙脚本点击画布被 Presentation 输入层拦截，已改为点击正式 `[data-worldkit-surface]` 输入面，随后实测通过。

最终 SDK 构建位于 `.codex-tmp/three-runtime`，runtimeHash：

`03d3240dc916985f890ca55a9a93bbb0d93eb4378c03b531b5bb85a9696c0f75`

## 扩展测试的限制

运行过 `pnpm exec vitest run packages/three-world scripts/three-creator scripts/three-episode`：当时 80 个文件中 71 通过，1197 项中 1172 通过、25 失败。日志为 `.codex-tmp/family-runtime-tests.log`。

其中物理校验错误顺序的一项已修复，并在最终 423 项运行时回归中通过。其余失败涉及 Windows 符号链接权限、虚拟 TypeScript 文件路径、Windows ESM 路径、ffmpeg 参数、录像／探测结果断言，以及视频像素一个通道相差 1。未把这轮扩展测试宣称为通过，也未为此修改断言或调整参考结果；部分录像／探测断言的根因尚未独立复现确认。

人物／载具回归曾在 Node 的线程池中触发 V8/Wasm 原生崩溃，因此最终使用单 worker 的进程池重跑并通过；没有修改项目默认测试配置。
