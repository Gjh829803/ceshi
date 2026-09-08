# 本地 playground 第一人称

工作分支 `codex/three-sdk-data-production-20260907`，基线 `621cc9ea`。仅本地修改、构建和浏览器验证，不发布或上传。

实现分工按顺序执行，由主代理独占编辑和本地服务：

| ID | 交付 / 所有权 | 依赖 | 集成证据 |
| --- | --- | --- | --- |
| F1 | training/camera.ts：模式 1 的眼位、座位局部观察角、零臂长；character.ts 和 first-person-body.ts：本地头部遮挡 | 无 | 姿态、转向独立、切换恢复测试 |
| F2 | input.ts / engine.ts：可选第一人称鼠标锁定，沿用唯一输入路由 | F1 | 锁定、释放、暂停与非训练输入回归 |
| F3 | sdk-capabilities 的 main.ts / inspector.ts / models.ts：切换入口、说明和真实驾驶舱几何 | F1,F2 | 本地浏览器逐主体与三个地图检查 |
| F4 | runtime.test.ts、文档：集成验收 | F1,F2,F3 | Three 测试、typecheck、census、prebuild；保留既有用户改动 |

借鉴本地 PUBG 证据中的座位眼位与本地第一人称表现分工，不复制未恢复的原生代码。现有 playground 只有单玩家驾驶席；本次支持现有全部驾驶/骑乘主体，不声称实现多人乘客系统。模式 0 为原跟随，1 改为第一人称，2 保留俯视。第一人称步行眼位稳定于控制胶囊姿态，驾驶眼位取当前人物头部，车体旋转只应用一次。人物头部使用实例私有的裁剪网格，不改变动画骨骼或源资产。

## 已实现与使用

- T 切换第一/第三人称；底部相机按钮仍循环跟随、第一人称、俯视。
- 第一人称点击画面锁定鼠标，Esc 释放并暂停；继续后再次点击即可。不能锁定的环境可拖动观察。
- WASD 沿用人物移动或载具操控；F 上下车，C 蹲伏，Z 匍匐，V 翻滚不冲突。
- 全部 19 个驾驶/骑乘主体均可进入第一人称，包括滑板、马、马车、飞龙以及透明座舱载具。没有改动物理包围体来绕过遮挡，没有把相机移到车外。
- 第一人称驾驶自由观察限于左右 150°，俯仰约 -77° 至 80°；车体姿态只组合一次，不用观察角驱动转向。近裁面 0.035 米，镜头臂长 0。FOV 使用配置值，不在第一人称做速度变焦。
- 人物实例在第一人称剔除头颈三角形；切换和销毁恢复原几何。该简单本地表现也会使第一人称下人物投影缺少头部，不等同于 PUBG 完整的独立阴影/远端人物渲染方案。骑乘动作仍使用本项目已有程序姿态。

## 验证记录

- 最终 SDK、Creator schema/inspector、Episode 相机兼容：24 文件、348 项通过。
- 专项运行时、输入与 Episode capture 重试：55 项通过（其中 capture 首次并行跑超过默认 5 秒；单独复核通过）。
- 最终 typecheck 通过；test census 通过：53 个测试文件；Three SDK prebuild 通过。
- 浏览器：19/19 主体、3/3 地图，零 pageerror。真实点击鼠标锁定，观察角变化后按 W，沿视线移动 1.515 米；T 恢复第三人称和完整人物。补查蹲伏/匍匐过渡眼位，截图与状态已保留。锁定后重复点击的 InvalidStateError 已修复并增加回归。
- 更广 Three/Creator/Episode 初次测试：593 通过、12 失败。其中 10 项为 Windows 不允许创建符号链接；1 项为 capture 超时，复核通过；1 项为新输入测试未等待 pointerlockchange 事件，已修正等待条件并在最终 348 项运行中通过。
- 独立 Node 合约测试：88/89 通过。未改动的 `scripts/three-episode/cloud.test.mjs` 使用 `/outside/plan.json` 的越界输出测试在 Windows 未得到预期拒绝；本次未修改云客户端。测试使用 mock，没有生产提交。不能声称整个仓库全绿。

本地预览：`http://127.0.0.1:5187/`。重启命令（仓库根目录）：

```powershell
$env:TEMP='D:\CodexData\Temp'
$env:TMP=$env:TEMP
pnpm dev examples/three-creator/sdk-capabilities 5187
```

浏览器验收脚本在 `.codex-tmp/fpp-check/`；截图、报告及日志副本在 `D:\CodexData\Artifacts\playground-first-person`。运行时构建在 `D:\CodexData\Builds\playground-first-person`，runtimeHash 为 `9faa3004a3eaa5236db17302f96339435a7cd184d610f7ca6f173141eae9369a`。没有提交、推送、发布，既有重定向文件和 package.json 等用户修改保留。
