# R1 共享物理验证

本阶段让 Humanoid 世界的普通 fixed/dynamic/kinematic 实体复用人物、车辆所在的
Rapier 世界，使用标准 `addEntity`、命令、refresh 和 reset。R2 多个完整人物、
R3 共享交互目标和 R4 持续动作任务尚未完成，不以本阶段验证替代它们。

## 实现与所有权

- `ThreePhysics` 可借用现有世界；内部 host 拆分 prepare、子步目标插值和 finish。
  借用实例不能自行 step 或 free 世界，释放只移除它登记的 body/controller。
- Environment 仍拥有实际物理推进。SDK tick 内车辆保留 120 Hz 子步；kinematic
  目标按子步插值，避免第一子步提前走完后第二子步速度归零。
- 普通动态物体维持 9.81 m/s² 重力，并排除车辆固定查询代理，只与实际车身求解。
- reset/map replacement 先在替换世界准备普通实体，再切换 owner；保留 pose/velocity
  和 reset 基线。物理 ID 冲突在注册、batch 和换图/reset staging 采用同一规则；
  冲突时旧世界仍有效。删除普通物体不销毁人物和共享世界。
- 新增、移动、启停碰撞体通过原生 BVH 刷新立即进入查询；查询不推进模拟。
  初始地图也使用刷新，实际接触求解与事件仍归正常物理步。

## Rapier 依赖

原包 JS 0.20.0 只有 pose propagation，没有非积分的 broad-phase 刷新入口。
JS 补充 ray/shape query 无法更新原生 KCC；临时 scalar movement clamp 已移除。
最终使用 [窄范围原生补丁](../../vendor/rapier-query-refresh/README.md)，基于 npm
发布记录中的上游 commit `3e12c2679cb1940a876bde93af9cec0cf2f57944`。

补丁调用现有 `set_aabb`，保留下一次正常 step 的 pair change detection。查询和插入
都考虑显式禁用与当前父 body 状态，避免刷新将已禁用物体重新带入碰撞求解。
精确 archive 和补丁 SHA 在 [build.json](../../vendor/rapier-query-refresh/build.json)，
SDK manifest/pnpm lock 固定该文件。Creator capsule 将 archive 纳入 source/dependency
哈希和 manifests，并在 doctor 中执行真实原生刷新检查。

干净目录构建配方已实际跑通，重建包的 9 项原生合同测试通过。重建目录改变后包字节
不同，因此不宣称跨目录逐字节可复现；安装与运行始终使用已登记的精确 archive，
重建产物没有替换本次受测依赖。

## 本地验证

证据目录均为本 worktree 的 `.codex-tmp`，生成媒体和日志不进 Git。

| 验证 | 结果与证据 |
| --- | --- |
| SDK | 50 文件 / 741 tests 通过，`r0/r1-sdk-regression.log` |
| 原生查询 | 9 tests：无积分、增删/移动/启停/复用、法线/见证点、过滤、滑墙/跨阶/贴地、正常碰撞事件和禁用后重建；先原包失败再补丁通过 |
| 共享物理 | 8 tests，包含真实车身接触、子步速度、立即 headroom 检查、reset/换图及 ID 冲突；包含在上述 SDK 回归 |
| Creator/Episode | `r1-browser-final/report.json`：Creator 真实输入录制、Episode 推箱和 reset 通过 |
| 现有动作 | `r1-actions/report.json` 与 4 段动作视频：移动/跳跃落地/视角、拾取持续持有/放下、坐下持续占座/起身通过 |
| 骑乘 | `r1-bike/report.json`：mount/drive/brake/exit 通过 |
| 下游合同 | example-files、Episode 共 119 tests：118 通过，1 个原有潜艇路线失败，见下文；authoring-schema 另 16 tests 通过 |
| 隔离依赖 | 本地 capsule staging、离线 frozen-lockfile 安装、CJS 原生刷新通过；未运行 Linux Docker doctor 或外部云任务 |
| 工程检查 | typecheck、lint、census、workspace boundaries、prebuild、diff 检查通过；文档链接及 schema topic 按最终文档检查 |
| 独立审查 | 只读 reviewer 的 KCC 裁剪、车辆代理碰撞、禁用 ghost pairs、ID 入口一致性问题已修复，最终无剩余 actionable findings |

最终 runtime hash：
`e37dfc228cae1bf7a0f9eac7abff96b990f7342658d5a32e118d9bdb882983d9`。
`r1-runtime-final/runtime-manifest.json`、上述 Creator/Episode 和动作/骑乘证据一致。

## 同机性能对照

沿用 R0 的 Chromium 151、SwiftShader、1280×720、DPR 1、300 tick warmup 和
三轮各 600 tick 测量。计时在页面内执行，render CPU 不包含 GPU 完成时间。

| 场景 | R0 固定步 p95，ms | R1 固定步 p95，ms | 每轮实际 owner 计数 |
| --- | --- | --- | --- |
| 单人物 | 0.5 / 0.4 / 0.4 | 0.4 / 0.5 / 0.4 | 600 mixer / 600 physics；5 bodies / 25 colliders |
| 骑乘 | 0.7 / 0.7 / 0.7 | 0.8 / 0.8 / 0.8 | 600 mixer / 1200 physics；2 bodies / 8 colliders |

骑乘首次差异超过 10%，因此复测 R1 得到 0.9 / 0.8 / 0.8，再直接打开保留的
R0 **原始 runtime bytes**，使用同样页面内测量得到 0.9 / 0.7 / 0.8。
本轮没有观察到超出同时段旧版对照范围的稳定回退，不能把单次 0.1 ms 差异归因于
改动或当作优化收益。证据：`r1-performance-character`、`r1-performance-bike`、
`r1-performance-bike-repeat`、`r1-performance-bike-original` 下的 `report.json`。

单人物 render p95 0.3 ms、骑乘 0.2 ms；body/collider/mixer/physics 数量与基线一致。
页面 JS heap 读数：人物 R0 47.4 MB / R1 53.5 MB，骑乘同时段旧版 72.2 MB /
R1 76.6 MB。没有强制 GC，这些是粗粒度页面堆读数，不能据此推断泄漏或总原生/GPU
内存；R2 仍需多实例和反复创建/释放验证。SDK bundle 从 5,461,836 增至 5,568,293 字节。

## 基线问题与验收边界

`scripts/three-episode/vehicle-route.test.ts` 的 submarine 30 秒路线只到 waypoint index 1，
终点 `[5.102285861968994,-18.699312210083008,101.9040756225586]`。
使用原始 HEAD 模块和原始 Rapier 0.20.0 重放得到完全相同数值，证据为
`r0/r1-submarine-baseline.log`；保留失败，没有削弱断言或把它计为通过。
这是后续完整下游验收仍需处理的已知问题。

本阶段没有执行外部生产、部署、Seedance、远端 CI 或自动合并。检查了推箱截图与动作
录制产物；自动行为通过不等于人工动作观感验收。C1 的原有 Source101 provenance check
差异仍按前一阶段记录保留。
