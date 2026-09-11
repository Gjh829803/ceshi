# 车辆按需诊断与固定翼 Agent 接入

基点：`7d1414db09516f555eb0e2b9097914de471f94b2`。工作分支：`codex/vehicle-diagnostics-aircraft-agent`；本记录对应该分支的源码与本地验证；合入状态以 Git 记录为准，不表示运行包已部署。

## 已实现

- `world.inspectVehicles` 与 `world_inspect({sections:['vehicles']})` 返回按实体筛选的车辆摘要，显式 `vehicleDetail:'wheels'` 展开逐轮数据。默认观察不增加该分区。
- 复用现有发动机状态、轮胎及飞行求解结果；报告模拟时间、物理子步序号、pre-integration 阶段，以及 unmeasured/sampled/stale/not-applicable。观察不推进模拟，返回副本，缺失诊断局部为 null。
- `humanoid.createAircraftSpec('plane')`、Host schema、工作区源码说明和 `custom-aircraft` 示例已接通；运行包源码清单包括示例。
- 飞机由 Agent 自绘 Mesh/Group，绑定同一人物和 SDK 控制器；现有固定标定提供推力、升阻力、姿态、失速和起落架。airframe 仅为真实固定标定的建模参考，不能通过修改该字段或缩放根节点改变物理；未新增直升机、VTOL、螺旋桨动力或空中寻路。
- 独立审查提出的可选源码缺失和遥测时序问题已修复。只允许缺失新增可选模块时省略其说明；缺失原本必需的核心模块仍明确报错。不以 Host 数值冒充工作区实际能力。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| SDK、Creator、Episode 与观察桥接的 Vitest 范围 | 82 文件、1177 项；首轮 1173 通过、4 失败。1 项为源码缺失边界，修复后通过；3 项为 5 秒超时，单 worker 复核通过，未放宽断言或超时 |
| 上述失败所在 3 文件串行复核 | 37 项通过；保留核心源码缺失的原有断言 |
| 独立 Node Episode/调度/生产合同 | 140 项通过，云传输使用现有 mock |
| Typecheck / ESLint / test census | 通过；census 为 102 文件，31 contract、71 resource-heavy |
| Runtime prebuild | 通过，实际浏览器加载相同 runtimeHash |
| Creator 真实键盘操作 | 完整 episode 通过；登机、加油门、起飞、转弯、reset/start，无 page/runtime errors，真实 MP4 已保存 |
| 独立 Episode | 从地面使用实际语义输入起飞；高度与三轮旋转/转向/悬架显示断言通过 |
| 本地源码胶囊 staging | 通过；确认包含 custom-aircraft，未构建/上传外部运行包 |
| 文档 | 相对链接与 source-claim 检查、diff 检查通过；schema 实际消费者包含在测试中 |

当前 runtimeHash：`b1c6951edded79025ceccf685ee41997a88851fae6ea2e8f4a93fe271ebf563e`。

本地证据：`.codex-tmp/vehicle-final-vitest.log`、`vehicle-recheck.log`、`vehicle-node.log`、`vehicle-typecheck.log`、`vehicle-lint.log`、`vehicle-census.log`、`vehicle-prebuild.log`、`vehicle-capsule.log`；源码身份清单位于 `.codex-tmp/vehicle-source-identity.json`。

飞机证据位于 `.codex-tmp/plane-acceptance/acceptance.json` 及该目录下 `.three-creator/evidence/` 的真实视频/关键帧。查看了未登机三视图与飞行转弯关键帧；这是基本白模和输入闭环检查，不是飞行手感、全部动作或产品画面质量的人工验收。包含 reset 的累计 travelledMeters 不是纯飞行航程，不能用它替代起飞状态证据。

没有运行根 `pnpm test` 聚合入口、完整 Playground 浏览器验收、独立 Python/Site 全门禁、远端 CI 或真实云 Agent 生成。未作性能前后测量、外部部署或发布。上述范围内的验证不能宣称所有生产环境已更新。

## 长期架构

[可扩展运行时与内容接入设计](../superpowers/specs/2026-09-10-extensible-world-and-content-design.md) 对照用户的 R0–R6 任务书及当前主干，覆盖批量模型、动作、操控配置、多人协作与 AI-friendly 接口。已进行独立设计审查；它仍是设计提案，不表示多角色、共享目标、持续动作任务或包构建管线已实施。

先前试写的接入清单原型已移出本次交付改动，避免在完整架构决策前留下第二套权威。后续按设计阶段交付真实可运行切片。
