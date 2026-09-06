# 已恢复的历史 Creator 基线

2026-09-06。用户要求恢复产生两个好案例时的版本，之后逐项加入后续优化。

- 分支：`codex/creator-known-good-baseline`。
- 历史源码：`03b8cb656c2e4ccf0770f50d8c09872c39259a48`。
- 恢复点 `324befb3` 的 SDK、Creator、公共 prompt、launcher 和 runner 与该历史提交一致。
- 用户随后授权的精选迁移已在 `f9fcf804` 实施；旧云端锁和原始对照产物保持不变，见 [迁移测试](../selected-migration-20260906.md)。
- 后来的全部改动保存在 `codex/gpt6-world-agent-refactor`，未删除。
- 基线包含当时的 Agent 自测试玩机制。生产评测页面仍独立运行，不重新添加人工评审门槛。

## 云端版本

同目录 `runtime-lock.json` 是当时实际使用的原始锁文件，未重新生成或修改字段：

- 锁文件 SHA256：`968433bf78ac958c0d7960a12ac2c397311283876c974b594adf58b1ff268c04`。
- SDK runtime hash：`0a52dc8c4c877fc48ea20f730b07c869ee5af411fbafb50d341bcf7bd8d50290`。
- 模型：`gpt-6-astra / xhigh`；原限时 2700 秒。
- 云端 launcher：`/fsx/pipeline/worldkit-three-creator-experiments/three-sdk-v2-holdout-five-20260905-r2/revision-4/launcher-v4/three-eval-launcher.mjs`。

已在云端使用历史验证器执行 `readRuntimeLock(..., {checkInstalled:true})`，完整已安装文件校验通过。无需重建或覆盖旧环境。

本工作区默认锁 `.codex-tmp/three-creator-eval/runtime-lock.json` 已指向这份原始文件；私有本地配置单独保存在被 Git 忽略的目录，未写入文档或提交。

## 参照产物

| 案例 | 历史 Job | worldBuildHash |
| --- | --- | --- |
| `gpt6-holdout-013-grand-canyon-courier--three-sdk` | `gen_fe1079992dc9b5e3` | `95bb7cb3a577defdbecd5c0f0519c4c25d44fd827496fe8f717944081daff938` |
| `gpt6-holdout-screenshot-20260823-193953--three-sdk` | `gen_ffb6845e2a241543` | `b9054b3a0079cfea75485fffbe258bfdfc965fc7259b494510619f2a53c7c869` |

原始图片及用户请求已复制到本工作区 `.codex-tmp/known-good-baseline/inputs/`。
`known-good-baseline-two-20260906` 已完成两例并发云端复跑。环岩约 24 分 51 秒，峡谷约 33 分 41 秒，均交付并开放试玩；路线结果分别为 4/4 和 3/5。未到达目标不能以技术 passed 掩盖，详见 [复跑证据](replay-20260906.md)。五项历史清单是格式要求，其余三项未提交。

后续迁移以这轮作为 before 对照。用户已授权本批镜头、输入、云端恢复、三视图、搜索和传输修复一同迁移，正常任务说明和原图不变；本批只能评估整体影响，不独立归因于某一项。
