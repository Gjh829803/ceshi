# Creator 预设人物与自建载具

分支 `codex/preset-human-continuity-20260908`，基于 `abc1816a`。
按用户要求独立保留；本记录不代表已合入开发分支或发布云运行胶囊。

## 行为与职责

- Creator 的人物创作要求覆盖玩家、NPC、骑手：使用许可预设人物的可见模型、
  骨架和动作，每个人在步行、上下车、骑乘和重置中保持同一实例。
- 自制载具只包含载具几何，通过 `TrainingVehicleInstance` 与
  `createHumanoidWorld` 中的原人物组合，不隐藏人物或替换成自绘骑手。
- `humanAuthoring` 随环境、schema guide 和资产详情返回，属于 Host 要求；
  项目导出或修改 SDK 源码不把这些要求替换成 Host 的旧动作条件。
- `custom-vehicle` 示例仅选择 `humanoid.source-101`，其余为普通 Three 几何。
  地图声明 `bike` 可用区域和实例出生点；同一个人物控制器处理上下车。
  冻结策略的 `allowCustomAssets:false` 限制外部资源文件，仍允许程序化几何。
- Host 桥接层记录 Training 人物的根对象、网格、几何、骨架/骨骼引用和
  可渲染性。场景基线跨 SDK observer 重建、暂停、恢复和正常重置保留。
  检查不推进模拟或动画，不改人物的可见性、姿态或父节点。
- playtest 反馈保留中途变化时间线，即使最后恢复了原人物也能看到问题。
  单次查看有当前反馈，完整录像仍需覆盖上下车和重置。

这是生成要求与辅助诊断，不是新的技术交付准入条件。诊断仅比较首个可观测
Training 场景的结构连续性，不证明资产来源、像素可见性、动画写入权，也不能
从任意 Mesh 形状识别额外骑手。缺失 telemetry/骨架明确标为 unavailable。
人物身份与骨架一致，不代表任意车型都自动完成握把/脚踏 IK；仍需看画面。
SDK 通用自定义角色 API、冻结策略格式和 Creator v0.2 交付契约保持原有职责。

## 验证

- 20 个相关 Vitest 文件共 235 项通过，包含实际浏览器加载预设模型、自建摩托
  上下车，以及替换人物、隐藏父节点/材质/缩放/层、observer 重建回归。
- 最后一次示例视觉整理后，自建载具 2 项浏览器/编译检查重新通过；
  独立测试清单的 10 项检查通过。
- 云胶囊与冻结资源策略 12 项 Node 检查通过；实际 staging 验证示例四个入口
  文件和人物观测模块进入胶囊源码闭包。
- typecheck、测试 census（64 个文件）、workspace boundaries、runtime prebuild 通过。
- 独立只读复审发现并修复：云示例漏打包、错误扩大外部资产开关范围、
  observer 重建导致基线丢失。最终复审无新的可操作问题。
- 实际 Creator 完整输入录制 9.050 秒并完成技术交付；
  观察到步行、骑乘、下车、重置，连续性问题列表为空。
- 独立 Episode 浏览器骑乘推进 120 个固定 tick；同帧重复捕获完全一致，
  release 后重新准备相同起点的 PNG 完全一致，无浏览器错误。
  本次没有录制 Episode 六段 30 秒视频，也没有发起云生成。

复验命令：

```sh
pnpm exec vitest run scripts/three-creator apps/three-creator-playground/character-continuity.test.ts
node --test deploy/three-creator-runtime/capsule.test.mjs scripts/cloud/three-eval-asset-policy.test.mjs
pnpm typecheck
pnpm test:census
pnpm verify:workspace-boundaries
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/preset-human/prebuilt-final
```

本地外部证据：`.codex-tmp/preset-human/run-1788862784820/`，含 Creator
receipt、录制报告、运行身份、Episode 骑乘图及重复/重置比较结果。
输入作者文件为 `examples/three-creator/custom-vehicle/` 的复制品。

- sourceHash: `6d441bdf01c3d59656571aff7da8811d3adef60b78c9c3000e8a742796d8abbd`
- runtimeHash: `2e94394769660af0f58be56ad3006ce2ead53e62eaa723483f5077982870d177`
- worldBuildHash: `c929998c4c2392e6a81fcb4dba929aa6bbe9ccbcfd3d6a86ee5c46950308f049`

## 深度复审后的诊断修复

针对 `685c7a0b` 的进一步浏览器复现发现三个 P2：手动矩阵未参与隐藏判断、
多材质忽略实际绘制组、辅助诊断异常传播到 Host ready/inspect。均已修复：

- 只计算临时世界矩阵，遵守 `matrixAutoUpdate` 和 `matrixWorldAutoUpdate`；
  不修改对象或 SDK 的矩阵，秩二平面仍可显示，点/线塌缩判定为隐藏。
- 材质可见性按实际绘制组与 drawRange/元素数量的交集判断；未引用空槽及未
  指定 materialIndex 的组遵循 Three 的跳过语义，不凭任意可见材质判通过。
- 诊断异常返回 `CHARACTER_DIAGNOSTICS_UNAVAILABLE`，不阻断 ready/inspect；
  初次观察失败不提交部分基线，后续失败不替换已有基线。

新增 6 项单元回归和 1 项真实浏览器回归，后者对比人物隐藏/正常 PNG，
并注入仅影响诊断的矩阵克隆故障，验证工具仍可用且恢复后基线保留。
相关 20 个文件共 242 项通过；胶囊 Node 6 项、typecheck、census、
workspace boundaries 和 runtime prebuild 通过。独立静态复审无新可操作问题。

最终真实 Creator 自检 9.074 秒并技术交付，连续性问题列表为空；
Episode 骑乘推进 120 tick，同帧重复和重置后的 PNG 一致。
新证据目录 `.codex-tmp/preset-human/run-1788870580403/`。
运行时构建输出 `.codex-tmp/preset-human/prebuilt-diagnostic-fixes/`。

- runtimeHash: `a4866397f286812afde751dfaee067e3af422a2e0f66e0e1351ff29baa94f592`
- worldBuildHash: `52e014717c86ee93df5b52e7a8949197939e67e38dca236affdb89f40a4d7019`

保持辅助诊断范围；本轮没有修改 SDK 控制权、技术交付准入或云部署。

## 与工作分支装备功能集成

合入前发现工作分支已前进至 `30cd30da`，新增 Source101 刚性挂点和装备预览。
集成时保留双方测试清单，并修复语义冲突：刚性装备的穿脱不等于人物替换。
连续性检查限定为 Training 人物的蒙皮网格、几何、骨架和根身份；Source101
两个人体网格均为 SkinnedMesh。刚性装备不参与比较，隐藏/删除/替换人体本身
仍会被检出。SDK 可选装备功能与 Creator 默认生成要求分别维持原有职责。

新增装备装卸单元回归及真实 SDK attach → reset → detach 浏览器回归。
集成树的完整 `pnpm test` 通过（66 个文件），typecheck、6 项胶囊 Node
检查和 runtime prebuild 通过；独立静态复审无新可操作问题。
石化森林自绘坐骑案例重新完成 9.422 秒 Creator 自检和技术交付，人物连续性
问题列表为空；独立 Episode 骑乘 120 tick、重复截图和重置 PNG 一致。

- 本地证据：`.codex-tmp/preset-human/run-1788871311800/`
- runtimeHash: `68573e17d5a32ad0ab806c31f923c152d14ae65b415d1ad140750217b7c13b15`
- worldBuildHash: `4c1cc2c155f6a70319b6121ee49201fd1dc51710731dbc3af0d160597b622532`
