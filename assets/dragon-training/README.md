# 原生 Three 飞龙训练资产

训练场的“选择飞龙”提供 D01～D11。D01 保留原模型；D02～D11 包含完整裸身、Harness01 鞍具、各自骨架及 15 段飞行/攻击动作。本次各自增加地面待机，D02 还收录原生落地、起跳动作，合计 D02 为 18 段，其余为 16 段。D09 使用 `D09_Body01_Naked`，D10、D11 分别使用 `D10_Naked`、`D11_Naked`，不会把装备版本当作完整龙。

D09 原始身体是双足长身造型：只有左右前肢骨链，没有后腿骨链。其三个身体材质分区共 53,109 个三角形，导入后全部保留；不能依据常见四足东方龙的造型判断它少装了后半身。

入口：`/?dragon=D09#/scenes/flying-creature-training`。开场为地面人物，龙在空中等候。步行时切换型号会重新加载所选龙并保留人物位置，不会自动登乘。只加载当前所选模型，继续使用现有 Source101 人物、统一输入、固定物理步、动画采样和三种相机模式。

- H 召唤：在干燥地面站稳后，龙从当前地点飞到人物侧前方的安全落点。已停驻的龙会先起飞。人物不传送，镜头继续由人物控制；等落稳后走到鞍侧按 F 上龙。H 属于公共输入映射，可重新绑定。
- 召唤时按当前人物位置选定落点；人物之后走开不会拖着落点移动。途中出现障碍会停止接近并提示重新召唤；没有安全路线/落点时拒绝。该实现检查候选升高路线，不提供任意复杂地形的全局寻路。

- WASD 操控；松键减速到零悬停，Ctrl 主动刹停，Shift 加速。
- 空中 F 请求着陆：减速、找平、下降、收翼/盘身停驻；再次 F 可取消下降并升回悬停。落稳后 F 下龙，人物靠近鞍侧按 F 重新上龙。
- 骑乘且落稳时 Space 起飞；空中 Space 滑翔，E 喷火，Q 闪避，T 保留三种视角。
- 上下龙期间展开鞍侧绳梯，沿检查过的路径攀爬并混合入座/离座姿势。手脚目标取自可见踏棍，保持 Source101 骨长；完成后收起绳梯。下龙后恢复人物步行与胶囊。
- 拒绝水面、陡坡、窄平台和无支撑落点；起降与姿态体积变化共用扫掠。上下龙途中遇到障碍会等待，移开后继续，不临时换到另一侧瞬移。
- 下龙落点额外检查向鞍外迈出 0.8 米的支撑与通道，避免只验证能站住而无法离开。调试单步只提交一帧输入，不遗留持续零输入覆盖。
- 每条龙各有 12 个躯干、颈部和头部通行球，翼尖、尾尖和毛发允许擦边，平移、转动扫掠和实际物理接触共用同一份数据。
- 骑手骨盆跟随真实 Seat，人物保持原尺寸；脚部悬垂，缰绳从真实手骨连到龙的原始 LeashLeft/Right 挂点。

## 资源和来源

[`__creature-assets/variants.json`](./__creature-assets/variants.json) 保存模型、镜头距离、鞍位、包围盒与局部碰撞球；[`__creature-assets/variant-sources.json`](./__creature-assets/variant-sources.json) 保存 PSK/PSA 来源相对路径、哈希、动画源时长、材质对应及测量结果。编号是游戏内部资源编号，界面名称不代表已确认的官方龙名。

控制器使用稳定动作角色，`FlyingCreatureVisual.load({dragonUrl, flameTextureUrl, animationPrefix:'D09'})` 读取所选龙自己的骨骼轨道。D09 左转映射自 `Flight_Base_L3`，加速循环使用自己的 `Flight_Fast`；D02、D09 的 `Shoot_Flame*` 映射到统一喷火角色。PSA 源时长保留为秒，包括 D09 非整数帧率的转换。喷火仅叠加下颌旋转，避免整段攻击动画使脖子后缩。

导出同时读取源 Skeleton 的 `BoneTree.TranslationRetargetingMode`：`Skeleton` 骨骼使用目标 PSK 的绑定位移，`Animation` 保留动画位移，`AnimationScaled` 按目标/源参考骨长比例缩放。PSA 插件自身只处理配置里的 `RemoveTracks`，不处理这些位移策略；直接导入会使 D06、D10 等模型的颈部和肢体分离。准备脚本在输出目录的 `_retargeted` 副本中烘焙规则，保存逐动作来源哈希与修正骨骼记录，原始解包文件保持只读。

材质是 1024 像素以内的简化漫反射 PBR；透明通道使用 alpha test，保留毛发和羽毛镂空。dummy 槽位按纹理图集顺序对应，未恢复原游戏完整材质图、布料/毛发模拟或战斗伤害。

地面动作来源保存在 `ground-sources.json`：D02 使用 `Ground_Idle`，其他龙使用自己的 `MM_IdleBase1`，D11 使用 `MM_IdleBase2`。运行时按实际离地距离混合地面/飞行姿态；D02 的专用 Landing/JumpStart 已收录，但当前未单独播放。已检查原游戏落地相机配置、D02 落地 BlendSpace 和骨架重定向数据，未恢复原游戏 C++ 实现。绳梯、人物攀爬适配与起降状态机是本 SDK 的实现，不宣称是原游戏原版上下龙动画。

当前地面功能为平整地面停驻；未实现龙在地面行走、逐脚地形 IK、斜坡停驻或空中跳龙。

本地完整 pak 路径清单及已解 JSON 未检出能确认“步行人物召唤飞龙”的实现，原游戏完整 C++ 也未恢复。召唤状态和航点导航是本 SDK 新实现，复用上述实际飞行及地面动画，不宣称复刻了原作召唤算法。

部分大厅待机动画朝向侧面。资源测量与运行时共用 `humanoid.dragonGroundHeading`，按地面首帧 Head→Seat 的水平关系统一身体朝向；鞍位、核心碰撞和支撑范围均在同一坐标系测量。这样地面第一人称保持骑手眼位，不靠移动镜头或隐藏身体绕过翼面遮挡。

## 重新准备

1. 只读本地解包目录，用 UModel 的 `-files` 清单导出每族完整 Naked 身体和 Harness01 的 PSK 到 `MultiDragon/PSK/Game/Characters/Dragons`。
2. Blender 后台执行 [`prepare-century-dragons.py`](../../scripts/assets/prepare-century-dragons.py)，提供 `--source`（包含 Models_glTF、Animations_PSA、Analysis/Compact、MultiDragon/PSK）、`--output` 和 `--importer`（PSK/PSA 插件路径）。所有输出放 D 盘。
3. `pnpm exec tsx scripts/assets/measure-century-dragons.mjs <导出目录> assets/dragon-training/__creature-assets`。该脚本使用 `dragon-core-collision.mjs`，从普通悬停、巡航和加速动作的躯干/颈/头蒙皮生成 12 个硬碰撞球；全身动作范围只用于镜头测量；可用最后一个参数 `D09` 只重新测量指定族。
4. 若需统一重新拟合全部 11 条龙，运行 `node scripts/assets/prepare-dragon-core-collision.mjs`，同步 D01 的 SDK 默认通行体积。硬碰撞采用稳定局部体积，包含 0.2 米采样余量；不追随极限闪避动作的每个蒙皮顶点。
5. Blender 执行 `prepare-dragon-ground.py -- --source <解包目录> --output <地面导出目录> --importer <插件目录>`，沿用同一骨架重定向规则；`python scripts/assets/merge-dragon-ground.py <地面导出目录> assets/dragon-training/__creature-assets` 将动作追加到尚未合入地面动画的 GLB。脚本拒绝重复合入。
6. `pnpm exec tsx scripts/assets/measure-dragon-ground.mjs <地面导出目录>` 生成各龙地面鞍位、脚底高度、地面核心碰撞和支撑范围，更新 D01 SDK 默认值。重新导出飞行 GLB 后需要重做第 5～6 步。
7. `pnpm prepare:dragon-training` 更新 bundle 哈希，再执行飞龙运行时与可视化测试、类型检查及构建。

运行不依赖游戏安装目录、解包目录或旧 Babylon 工作区。此目录的 GLB、JSON 和火焰图集是运行时所需资源；SDK 外部使用者读取 variants 配置，将 `collisionProbes` 传入 `VehicleSpec.flyingCreatureCollision`，`ground` 传入 `flyingCreatureGround`，再绑定现有 `flyingVisual` 接口。

## Creator / Agent 接入

`creature.dragon.d01` 至 `creature.dragon.d11` 分别注册现有 D01–D11 模型，
与旧资源 `creature.dragon` 保持独立。源定义位于
[`assets/three-creator/catalog`](../three-creator/catalog/)，默认资产策略允许这些 ID。
`assets_search` / `assets_describe` 返回每条龙的 `vehicle.spec` 和
`integrationMetadata.visual`；`creator_get_examples` 的 `flying-creature` 示例消费同一契约。

模型和火焰逻辑路径分别为 `flying-creatures/D01/model.glb`（按编号替换）与
`flying-creatures/flame.png`。用 `FlyingCreatureVisual.load` 加载，并将它作为
`VehicleInstance.flyingVisual` 交给 SDK；Source101 骑手复用 `humanoid.source-101`，
不加载历史 `rider.glb`。`actions:{}` 表示不提供普通资产动作播放，专用控制器仍驱动原始飞行动画。

修改模型或校准后运行 `pnpm exec tsx scripts/assets/register-flying-creatures.ts`，
只更新这 11 个独立目录源及聚合目录，不复制模型、不重导出、不修改测量数据。
同一命令加 `--check` 验证源字节、工厂默认配置与已注册元数据一致。
