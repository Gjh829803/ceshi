# 统一 Actor 执行与生命周期

本轮直接迁移未上线系统的全部实际消费者。分支仍为 `codex/extensible-world-r0`。

## 实现与归属

- `Simulation.actors` 管理初始人物和后来加入的完整人形；每个 Actor 拥有 controller、
  committed pose、骑乘关系和过渡状态。删除初始人物专用 player/humanoid/active 接口。
- Runtime 的统一 binding/input 映射和 Presentation 的 `actors[id]` 历史覆盖所有人物。
  输入目标与相机目标独立；骑乘与步行共用唯一相机写入 owner。
- 环境、车辆和物理时钟仍由 Simulation 统一推进；Actor 不推进自己的物理世界。
  map/reset 使用新的 Simulation 实例及显式重绑定，不再通过 Object.assign 伪装旧实例。
- 初始人物与新增人物具有相同模型发布、保留、despawn、reset 和 dispose 生命周期。
  人物源 factory 只捕获资源 URL 闭包，独立于任一活跃模型；最后实例释放后可重新加载。
- vehicle prepare/approach/enter/exit/recover 接受 actorId，省略时使用当前控制对象。
  SDK、Creator schema、Episode 和实际示例同步迁移；源码提取所需参数有显式类型。
- 单角色准备只清理自己的交互关系；世界复位才重置共享目标。其他角色驾驶中的载具
  不允许被 prepare 或二次登乘。相机、观察和回执均读取实际被指定的角色。

## 验证

- SDK 全量 54 files / 784 tests 通过；包括真实 Source101、骑乘/下马、共享交互、
  源资源释放、异步失效、多角色与地图复位。
- Creator tools、authoring schema、Episode action controller：3 files / 91 tests 通过。
- Creator preset workspace 与车辆家族：63 tests 通过。测试使用明确资产身份，避免
  独立目录排序变化后无意选择不同操控配置。Episode 原有潜艇路线失败仍留待 R6。
- typecheck、变更文件 lint、test census（109 files）、Playground production build 通过。
- 最终 runtime prebuild：`61b038a21be1ecf500608818d24d235cf30058814805b08585dd12f226227409`；
  manifest：`c6bc62ba1e893192a0fdb09f89570520f2775d091c00776c6594d208a5110476`。
- 同一 runtime 的 Creator 三人物与独立 Episode 输入验证通过，证据
  `.codex-tmp/unified-actor-browser/report.json`；已查看三人物画面。
- Playground 真实驾驶、刹停、悬停、喷火、座位对齐、视角、换图、刷新、前进后退通过，
  证据 `.codex-tmp/unified-actor-playground/result.json`；已查看喷火画面。临时服务已关闭。
- 独立只读审查指出共享目标被单角色重置、他人载具被 prepare、factory 依赖初始人物
  三处问题；均已修复并用实际资源/关系测试覆盖，审查者复核未发现剩余确认问题。
  这属于本轮审查，不代表整个重构的最终架构审查。

## 性能与验收边界

Chromium、1280×720、软件渲染、每轮 600 固定步，三轮；统计固定步 CPU p95。
3 人为 1.5/1.5/1.5 ms；10 人为 3.8/3.5/3.4 ms。分别保持每轮 1800/6000 次
mixer 评估和 1200 次共享物理子步；真实驾驶、刹车和下车检查通过。
这是角色静止但 controller/mixer 正常执行的采样，不是连续多人导航或 GPU 压力验收。

单角色首次为 1.0/0.9/0.8 ms，重复为 0.9/0.9/0.9 ms；此前 R1 为 0.8/0.8/0.8 ms。
已触发超过 10% 的复测规则。同机交替打开保存的 R1/当前/R1/当前构建，
相同人物位置、300 步预热、每次三轮 600 步，得到：
R1 0.9/0.8/0.8，当前 1.3/1.1/1.1，R1 1.4/1.2/1.1，当前 1.1/1.0/1.0 ms。
旧构建自身出现明显漂移，不能从这组数据确认稳定回退或非回退；保留最终 R6
性能验收缺口。交替原始样本为 `.codex-tmp/unified-actor-paired-performance.json`。
原始证据保存在 `.codex-tmp/unified-actor-bike-{1,1-repeat,3,10}`。

尚未完成确定性绕让、动态目标、安全取消、完整姿态边界及最终综合验收。
自动浏览器检查和本次图像检查不代替用户人工视觉验收，也不代表远端 CI 或发布。
