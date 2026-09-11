# 11 条龙起降与上下龙验收（2026-09-10）

工作区：`D:/CodexData/Temp/Workspaces/aircraft-seven-families-main-20260910`。在原有模型重定向、核心碰撞和三视角修正基础上实现；本轮未提交或推送 Git。

## 交互和范围

- 空中按 F 请求着陆：减速、找平、检查地面、下降并混合地面姿势；再次按 F 可取消下降并升回悬停。
- 骑乘落稳后按 F 下龙；人物到鞍侧按 F 上龙。上下龙展开鞍侧绳梯，沿已检查路径攀爬，混合入座/离座姿势，完成后收梯。
- 骑乘落稳后 Space 起飞；空中 Space 保留滑翔。WASD、Shift、Ctrl、E、Q、T 延续原动作语义。
- 下龙完成后恢复人物胶囊和步行；过程仍由 SDK 唯一固定步、动画和相机负责人驱动。各龙独立保存地面及过渡状态。
- D01–D11 均有自己的地面姿势、鞍位、脚底高度、支撑范围和 12 个地面核心碰撞球。翼尖和尾尖继续允许擦边。

地面阶段只支持平整、干燥、有足够空间的停驻点。未实现地面行走、逐脚地形 IK、斜坡停驻或空中跳龙。攀爬使用项目 Source101 动画和程序化绳梯，并非原游戏专用上下龙表演动画。

## 原游戏参考与资产

只读检查解包的落地相机配置、D02 落地 BlendSpace、PSA 动作和 Skeleton 重定向数据；没有恢复完整 C++ 或动画蓝图。D02 使用自己的 Ground_Idle，其余使用各自 MM_IdleBase1，D11 使用 MM_IdleBase2。D02 的 Landing/JumpStart 已收录，但当前运行时按实际离地距离混合地面/飞行姿势，没有单独播放这两段。

`prepare-dragon-ground.py` 沿用源骨架位移重定向，`merge-dragon-ground.py` 追加动作且拒绝重复合入；原网格、材质和飞行动作保留。`measure-dragon-ground.mjs` 与运行时共用公共 `humanoid.dragonGroundHeading`，将侧向大厅姿势转正后测量。来源及哈希见资产目录 `ground-sources.json`，准备步骤见资产 README。

## 实测发现与修正

1. 大型龙鞍位高，直接套普通上下车动作会让人物悬空攀爬。增加可见绳梯、路径支撑和踏棍手脚目标，按实际角色骨长做旋转 IK；D09 也检查了另一侧下龙与重新上龙。手腕/脚骨到目标的回归容差为 18/20 厘米，不能解释为逐指或逐脚掌精确接触。
2. 过渡中新增障碍可能使落点失效。现在暂停原路径，障碍移除后继续；不临时切换另一侧瞬移。重置会清除过渡状态；过渡期间屏蔽驾驶指令。
3. 初始落稳阈值让脚底仍离地约 10 厘米。收紧最终高度误差至 0.012 米，并重查实际地面模型。
4. D11 地面第一人称被收翼遮挡，根因是大厅待机姿势朝向与骑乘朝向不同。统一模型地面朝向和鞍位、碰撞、支撑测量坐标；实际眼位保持在骑手头部。全型号增加地面朝向与镜头回归。
5. 地面测量脚本曾直接导入 SDK 私有源码，工作区边界检查发现后改为公共导出并复查通过。

## 验证结果

最终相关测试 **190 通过、0 失败（11 个文件）**。其中飞龙运动及真实资产/人物可视化 88 项，其余为 mounted interaction/lifecycle、camera lifecycle、Creator vehicle seating/families/mount guidance/capture plan 和 Episode adapter/route controller。

覆盖全部 11 条龙的着陆、停驻、重新起飞、真实地面模型核心碰撞、Source101 完整上下龙流程、骨盆连续性、左右侧绳梯接触、第一人称及 T 切换；另覆盖薄墙、窄道、水面/陡坡/窄平台/无支撑拒绝、顶棚阻挡起飞、途中障碍暂停恢复、过渡重置及实例隔离。

浏览器逐条检查 11 条龙地面模型；D09 检查高鞍位上下攀爬，D11 实际按 F 着陆、T 切换并复查地面姿势朝向修正后的第一人称、第三人称和越肩。自动检查补充所有型号朝向修正后的几何、碰撞与镜头约束，不将锚点通过等同于全部动画观感完美。

类型检查、ESLint、95 文件测试目录检查、工作区边界、SDK 预编译及 Playground 生产构建通过。最终 runtimeHash：`d9478e1f021c227454ed5809c4ab130f95b4c36e0855c69fb85767c7e320f012`；manifestSha256：`ed48e38450f572d75bb583df3c59258e637c742dccd687258976bba7848778c7`。

### 更大范围测试仍有失败

本轮还执行了 SDK、Creator、Episode 的更大范围回归：1205 通过、28 失败（1233 项），另有 worker RPC 超时。失败涉及 Windows 符号链接权限、虚拟 consumer 文件路径、Windows 绝对路径 ESM loader、FFmpeg 的旧 `-vsync` 参数、Creator 录制/清理及 GPU 像素蓝色通道相差 1。此前验收也记录过同类平台问题，但本轮没有对所有失败逐项运行原始基线，因此不把它们全部断言为既有失败。

Node Episode/云端调度脚本测试 122 通过、3 失败：一项 POSIX 输出路径假设，两项 Windows 的 `python3` 别名退出 9009。未提交外部云任务。本次相关 190 项复测通过不代表全仓库全绿。

完整本机证据目录：`D:/CodexData/Artifacts/CenturyDragon/MultiDragon/`：

- `ground-normalized-final-tests.json` / `.log`：最终 190 项。
- `ground-runtime-closure.json` / `.log`：较大范围 1205/28。
- `ground-node-closure.log`：Node 122/3。
- `ground-editor-build.log`：最终生产构建。
- `Ground/`：每条龙地面动画导出及重定向记录；`BeforeGround/`：本轮资产修改前备份。
