# main 集成冲突与处理

集成基线：origin/main e39f8805。本地物理快照 c531c856。独立集成分支 codex/vehicle-physics-main-integration-20260909。
原运行目录与 codex/local-vehicle-playground-20260908 的未提交文件保留原状。

| 冲突位置 | 原因 | 处理 |
| --- | --- | --- |
| examples/.../main.ts | main 删除旧入口，迁入 apps/three-playground | 保留新入口，迁入 R/按钮复位、挡位仪表、物品位置同步和同时间戳轮子显示 |
| examples/.../platform/inspector.ts、workbench.ts | main 使用 React 面板 | 保留 React 面板，接入物理模式下的有效参数提示 |
| examples/.../ui/workspace.ts、workspace.css | main 使用新的 Shell 和样式 | 在新 Shell 中加入仪表与复位按钮，删除集成目录中的旧页面文件 |
| examples/.../vehicle-animation.ts | main 改为共享内容对 SDK 的转发 | 继续只由 SDK 更新轮子，保留物理样本 |
| packages/three-world/README.md | 同位置增加文档 | 保留主分支配置职责说明和物理说明，校正旧行程和四轮限定描述 |
| packages/three-world/src/config/control-fields.ts | 参数定义迁入 SDK，同时新增动力链提示 | 保留统一字段定义，并让 UI、配置观测、命令字段说明一致识别动力链模式 |
| packages/three-world/src/training/public.ts | 两边新增不同公开接口 | 两边接口均保留 |
| packages/three-world/src/training/runtime.test.ts | 同位置新增复位和相机/上下车测试 | 两边测试均保留 |
| packages/three-world/src/training/runtime.ts | 新配置/观测接口与物理显示回调重叠 | 保留主分支 schema/inspectConfiguration，增加 recover 命令和显示样本参数 |
| packages/three-world/src/training/simulation.ts | 新姿态配置导入与轮式求解导入重叠 | 两边导入保留，物理载具提前进入物理解算分支，飞行等主体使用原控制器 |

额外发现：
- 主分支新增 supercar 和 kart，轮径、轮位与旧车不同；按各自模型配置，不照搬旧车模板。保留其原有速度上限。
- 新主分支锁定的 lucide-react 1.43.0 被本机现有最低发布时间策略拒绝。将其固定到兼容的 1.42.0，使用官方 npm 完整性值更新锁文件，仅该依赖改变；原安装策略保持启用且已通过。

验证结果：
- 264 项训练、配置和面板相关测试通过，包含新增车辆接地/加速/刹停回归。
- 根项目与编辑器 typecheck、test census、workspace boundaries、SDK prebuild 和编辑器 build 通过。
- 新编辑器浏览器 smoke 通过；七款轮式载具真实按键加速、转向、刹停、R 和按钮复位通过，页面错误为零。
- 扩展 contract 初跑 275/277，通过之外的一项 capture 用例在单独复跑时全组 11/11 通过；source-export 的符号链接用例因 Windows EPERM 无法建立夹具。
- Creator/Episode 补充检查 20/22；workspace-runtime 两项符号链接夹具同样受 Windows EPERM 限制。相关测试文件与 main 一致，未跳过测试或改变系统权限。
Runtime hash: 996c6d61cebb88d3087befd22de5b083aed31c5c9ddc017c0854fe4175250258
Manifest SHA256: f47e6bc599a0d770cae5ded5399c7d23c46b28521b657bbcfe4eac1ffbcb4e71
集成预览：http://127.0.0.1:5189/；原预览 5188 保留。
当前没有向远端推送，也没有合并远端 main。## 后续 main 合并（2026-09-09）

按用户要求保留当前物理系统和全部场景操控标定，合入 main 227c7ebf：
- runtime.ts 保留物理参数过滤、双参数动画采样回调，并接入相机构图诊断。
- shared config.ts 使用 SDK 公共类型，SPECS 数值及生物载具配置保持本分支原值。
- profiles.ts 保留当前默认参数、加速极速与倒车速度读取方式。
- 主分支可选街机漂移路径保留给未启用 wheelPhysics 的主体；不覆盖本训练场逐轮物理。
- 补齐 Creator 命令校验表的 training.recover 声明。

验证：288 项训练/配置/应用测试通过；补充检查 121 项中 116 项通过，复位命令校验补齐后对应测试通过。仍有 4 项本机环境限制：3 项 Windows 符号链接夹具 EPERM，1 项已安装 FFmpeg 9 不支持旧编码流程的 -vsync。没有跳过或修改这些测试来声明全绿。

SDK/Playground 类型检查、census、runtime prebuild 通过。浏览器真实按键复测坡道转向和四车连续左右转向。

## PR #215 的 CI 回归修复（2026-09-09）

- README 的开发调参与逐轮物理说明补齐主题边界，避免随 mounted-interaction 简明指南返回。保留 12,000 字节预算，并验证详细物理说明仍可通过 training 主题读取。
- 七种道路配置继续使用 wheelPhysics，不添加不生效的 brakeDrift 开关。回归验证实际轮胎负载、行驶、刹车及复位。发动机/换挡起步使用最多 6 秒的窗口，保持驶出 15 米的要求。
- 七个坡道测试准备点移到场景准备逻辑，初始车辆仍每种只有一个生成点。逐配置验证 12° 坡道定位、上坡行驶及其他车辆位置不被修改。
- 修改在独立工作目录完成，没有纳入另一工作目录尚未提交的飞行载具开发。

验证：原先失败的两份 Creator 测试共 37 项通过；62 项逐轮物理测试通过；SDK 与 Playground 类型检查、workspace boundaries、census、runtime prebuild 通过。构建 runtimeHash 仍为 d8164c696811106b14783e26d16967e34d81767eb1385fa736b7f6be1815c038，物理解算代码与调校未变。

完整本地门禁仍受 Windows 符号链接权限、python3 命令及 POSIX 路径假设、FFmpeg 9 移除 -vsync 等环境差异影响；不删除测试或声明本地全绿。最终完整门禁以本次提交的 GitHub Linux CI 为准。
