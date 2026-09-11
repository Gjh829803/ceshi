# 未上线接口兼容清理

用户明确要求同步迁移实际调用方，不保留旧系统兼容层。当前变更位于
`codex/extensible-world-r0`，未合并或执行外部生产。

## 已清理

- 删除无实际调用方的 `cameraModulePath` 构建替换入口及 `camera-compat` 类型出口。
  项目运行时源码继续通过现有 workspace runtime 构建消费。
- FollowCamera 删除像素 `orbit/scroll` 入口；实际输入与测试使用弧度和米。
  普通相机的 preserve-opening 与 target 阻尼分别读取自己的参数，不再跨字段回退。
- 飞龙动作只读取 `primary/secondary`，移除 `roll` 代替喷火/闪避的旧输入映射。
- Episode 删除废弃的 `assertPlayerBehavior` 别名和未参与执行的
  `coverageTargetIds` 字段；反馈与动作完成检查继续走各自现有合同。
- Episode 删除为单个历史 arborist 场景设置的源码白名单、键盘合成与准入特例。
  自定义移动使用已声明的 Episode 输入合同。
- Episode source 必须携带当前资产策略 hash、快照和资产定义，不再接受三者全部
  缺失的历史交付。验证使用交付携带的策略，不读取当前 Host 配置替代。
- Playground 地图入口统一为 `#/scenes/{id}`；迁移实际链接、浏览器检查和说明，
  删除 query 迁移函数及独立旧页面重定向构建入口。
- 实施计划删除已被用户取消的强制包框架步骤，按独立资产源、Skill、绑定与实际
  消费者组织剩余内容工作。

## 验证

- 相机、Humanoid runtime、Episode source/contract/route/workflow、地图路由：
  8 files / 197 tests 通过。
- Episode capture、实际 delivery adapter、stdio MCP + Chromium、Creator schema、
  飞龙动作：5 files / 42 tests 通过。
- Creator compiler、workspace runtime 与工具：3 files / 76 tests 通过。
- typecheck、变更文件 lint、test census（109 files）、runtime prebuild、
  Playground production build 通过。构建仍报告主包体积提示，未以隐藏提示作为修复。
- runtime hash：`133d49bb2dceff6ef4f5b2efeeb5e4d668f5ccae06342663a73d2821bf1117bf`。
- Playground production preview 的真实操作通过：驾驶、刹停、加速后悬停、喷火、
  骑手座位对齐、视角切换、换图复位、新链接直达、刷新、浏览器前进/后退；无 pageerror。
  本地证据 `.codex-tmp/no-compat-playground/result.json`，已查看喷火画面。
  验证后关闭临时服务；未声称人工视觉验收。
- 独立只读复核未发现代码调用遗漏或合同放宽，指出的旧文档链接已修复。

## 仍需收尾

当前不等于整个重构已经完成。初始人物与新增人物的 Simulation/Runtime 管理分叉
仍须统一；飞龙家族中的旧求解路径仍被另一套 Playground 内容消费，需要连同资产
绑定迁移。R3/R4 安全取消和动态目标、R5 姿态边界及最终综合验收继续按实施计划推进。
历史记录与基线保持原始身份；不能为了扫描无 `legacy` 字样而篡改历史证据，
也不能把不同资产的真实运动与碰撞差异伪装成同一种已完成能力。
