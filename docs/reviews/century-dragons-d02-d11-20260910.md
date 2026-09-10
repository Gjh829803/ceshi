# D02～D11 原生飞龙导入验证

## 交付

在飞龙训练场增加 D01～D11 选择器。D02～D11 共新增约 89.4 MiB 的十份 GLB，每份包含完整身体、鞍具、同族骨架及 15 段动作。D01 原资产保持不变。切换会重新创建当前龙，回到空中训练起点；每次只加载所选龙，保留 Source101、现有按键及三种视角。

来源、映射、局限及复现步骤见 [资源说明](../../assets/dragon-training/README.md)。GLB 与来源哈希见 [bundle](../../assets/dragon-training/bundle.json) 和 [variant-sources](../../assets/dragon-training/__creature-assets/variant-sources.json)。D09 为完整长身龙；D10、D11 使用名字不含 Body01 的完整 Naked 身体。

## 实现边界

- 大类仍为 flying-creature。不同骨架使用自己的动作轨道，通过 `animationPrefix` 映射到现有控制器的动作角色；没有增加独立模拟循环。
- 每条新增龙配置 64 个局部碰撞球。完整动作和运行时混合姿态共同参与测量；旋转扫掠、平移扫掠和 actor 接触使用相同配置。
- `VehicleSpec.flyingCreatureCollision` 在实例构造时复制并验证，保持实例隔离。旧 D01 缺省配置兼容。
- 骨盆跟随真实鞍位，真实 Source101 眼睛驱动第一人称；缰绳跟随各龙的原始 Leash sockets。
- D09 的非整数 PSA 帧率被校正为源秒数；D02/D09 喷火和 D09 左转、加速使用明确别名。透明图集以 alpha test 显示毛发与羽毛。
- 调参 profile 的盒体半尺寸允许到 50 米，以容纳大型龙真实翼展；相机保持原有 1～40 米编辑范围。
- 这次没有恢复原游戏布料/毛发模拟、完整材质图、战斗伤害、自然上下龙过渡。保留原 D01 的已骑乘空中训练范围。
- 第一人称锚点与按键切换已验证；D11 的长鬃毛在部分悬停姿态仍会遮挡前方，需要进一步处理近景毛发显示。该外观限制与眼位正确性分开记录。

## 验证

- 可视化/资产专项：27 项通过。覆盖 11 条龙的真实 Source101 第一人称眼位、越肩及 T 切换；十条新龙的混合蒙皮包络；完整身体、鞍具、内嵌贴图、透明材质、150 段动作源时长，以及全部型号的 Playground profile 解析。
- 飞行专项：17 项通过。包括新型号薄墙高速碰撞、松键零速悬停、配置实例隔离和非法碰撞配置拒绝。
- Shell 专项：2 项通过。
- 浏览器：通过训练场选择菜单逐条加载十条新龙。每条执行 100 个固定步加速转弯、300 步松键、30 步喷火；均有实际位移并减速为零，喷火进入 loop，骑手骨盆与鞍位误差小于 1e-12 米。材质、完整身体和骑手通过现场截图检查。
- 类型检查、ESLint、测试目录检查（95 个测试文件）、工作区边界检查通过。
- SDK 预编译与 Playground 生产构建通过。运行时哈希：`09417dbf4042e08ec7ec8a76b094f5d9f43f182eb564aa610bdf24729faf8a2d`；运行时 manifest SHA-256：`751df8db232b62ea97ed0f4f95b96f9e9914e757ec5857024776085d340c14ec`。

全量测试运行结果为 1286 通过、25 失败，不能宣称全绿。失败集中于已有 Windows 符号链接权限、绝对路径 ESM loader、ffmpeg `-vsync`、Creator/Episode 测试及一项 GPU 像素比较（蓝色通道相差 1）。像素测试独立复跑仍失败，本次未更改其实现。完整输出位于本机 `D:/CodexData/Artifacts/CenturyDragon/MultiDragon/full-tests.json`；专项结果为同目录 `tests.json`、`final-visual-tests.json`。这些测试不提交外部生产任务。
