# 原生 Three 飞龙训练资产

训练场的“选择飞龙”提供 D01～D11。D01 保留原模型；D02～D11 新增完整裸身、Harness01 鞍具、各自骨架及每条 15 段动作。D09 使用 `D09_Body01_Naked`，D10、D11 分别使用 `D10_Naked`、`D11_Naked`，不会把缺少身体部位的装备版本当作完整龙。

入口：`/?dragon=D09#/scenes/flying-creature-training`。菜单切换会重新加载所选龙，在训练起点进入骑乘状态。只加载当前所选模型，继续使用现有 Source101 人物、统一输入、固定物理步、动画采样和三种相机模式。

- WASD 操控；松键减速到零悬停，Ctrl 主动刹停，Shift 加速。
- Space 滑翔，E 喷火，Q 闪避，T 切换第三人称、第一人称和越肩。
- 每条龙各有动画包络碰撞球，平移、转动扫掠和实际物理接触共用同一份数据。
- 骑手骨盆跟随真实 Seat，人物保持原尺寸；脚部悬垂，缰绳从真实手骨连到龙的原始 LeashLeft/Right 挂点。

## 资源和来源

[`__creature-assets/variants.json`](./__creature-assets/variants.json) 保存模型、镜头距离、鞍位、包围盒与局部碰撞球；[`__creature-assets/variant-sources.json`](./__creature-assets/variant-sources.json) 保存 PSK/PSA 来源相对路径、哈希、动画源时长、材质对应及测量结果。编号是游戏内部资源编号，界面名称不代表已确认的官方龙名。

控制器使用稳定动作角色，`FlyingCreatureVisual.load({dragonUrl, flameTextureUrl, animationPrefix:'D09'})` 读取所选龙自己的骨骼轨道。D09 左转映射自 `Flight_Base_L3`，加速循环使用自己的 `Flight_Fast`；D02、D09 的 `Shoot_Flame*` 映射到统一喷火角色。PSA 源时长保留为秒，包括 D09 非整数帧率的转换。喷火仅叠加下颌旋转，避免整段攻击动画使脖子后缩。

材质是 1024 像素以内的简化漫反射 PBR；透明通道使用 alpha test，保留毛发和羽毛镂空。dummy 槽位按纹理图集顺序对应，未声称完全恢复原游戏材质图。没有恢复布料/毛发模拟、翼膜形变、战斗伤害或自然上下龙过渡；本次范围与原 D01 一致，为已经骑乘的空中训练。

## 重新准备

1. 只读本地解包目录，用 UModel 的 `-files` 清单导出每族完整 Naked 身体和 Harness01 的 PSK 到 `MultiDragon/PSK/Game/Characters/Dragons`。
2. Blender 后台执行 [`prepare-century-dragons.py`](../../scripts/assets/prepare-century-dragons.py)，提供 `--source`（包含 Models_glTF、Animations_PSA、Analysis/Compact、MultiDragon/PSK）、`--output` 和 `--importer`（PSK/PSA 插件路径）。所有输出放 D 盘。
3. `pnpm exec tsx scripts/assets/measure-century-dragons.mjs <导出目录> assets/dragon-training/__creature-assets`。该脚本采样真实蒙皮和 SDK 混合姿态，生成每条 64 个覆盖身体、翼尖、尾部的球；可用最后一个参数 `D09` 只重新测量指定族。
4. `pnpm prepare:dragon-training` 更新 bundle 哈希，再执行飞龙运行时与可视化测试、类型检查及构建。

运行不依赖游戏安装目录、解包目录或旧 Babylon 工作区。此目录的 GLB、JSON 和火焰图集是运行时所需资源；SDK 外部使用者也可读取同一份 variants 配置，将 `collisionProbes` 传入 `VehicleSpec.flyingCreatureCollision`，将 `envelope`、`seat`、`camera` 传入对应配置字段，再绑定现有 `flyingVisual` 接口。
