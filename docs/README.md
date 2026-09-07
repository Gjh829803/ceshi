# 当前文档

本分支采用普通 Three.js 创作、统一 SDK 执行、独立 Episode 数据生产。
以下文档是当前入口，旧编号架构、旧引擎 ADR 和历史路线图已移除。

| 要了解什么 | 文档 |
| --- | --- |
| 设计原则、职责与 SDK 边界 | [Three SDK 架构](three-sdk-architecture.md) |
| 数据流程、来源、部署边界与后续工作 | [Three SDK 与数据生产](three-sdk-data-production.md) |
| 公开 API 与用法 | [SDK README](../packages/three-world/README.md) · [实际公共类型](../packages/three-world/src/contracts.ts) |
| 场景创作工具与交付契约 | [Creator](../scripts/three-creator/README.md) · [云生成](../scripts/cloud/three-eval-README.md) |
| 路线、六段录制、样式与恢复 | [Episode](../scripts/three-episode/README.md) |
| 变更审查与运行时验证 | [审查协议](reviews/full-dimension-review-protocol.md) · [Runtime 检查表](reviews/runtime-deep-review-checklist.md) |

## 历史材料的用途

[reviews](reviews/README.md) 保存与当前 Three 工作有关的已有审查和验证记录；
[evaluations](evaluations/README.md) 保存固定案例、评测政策、原始身份和部署记录。
它们只证明记录中的源码、时间与产物，不能充当当前 HEAD 或线上状态的验证。

[superpowers](superpowers/README.md) 只保留维护工作清单与可复用审查模板。
当前公共 API 不再有另一份设计目录下的独立声明。

删除前的完整文档可从 Git 提交
`4256b6fdf06c7ba732e13a7c9aeee553544438e9` 检索，例如：

```sh
git show 4256b6fdf06c7ba732e13a7c9aeee553544438e9:docs/02-sdk-architecture.md
```

旧 packages、应用、脚本、技能与发布站点仍在仓库中，留待后续检查依赖后清理。
本轮只整理文档，不意味着旧代码已移除或站点已重新发布。
`17-canonical-json-quickstart.md` 暂留迁移提示，满足仍存在的旧校验器文件路径依赖。
