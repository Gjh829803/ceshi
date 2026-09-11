# 内容接入基础：Skill、独立源与示例消费

基点 `53f8f059`，所有后续工作按用户要求留在 `codex/extensible-world-r0`。
这是 C1 的首个可运行切片，不表示共享加载、多角色、动作 binding 或全部 C1 已完成。

## 已实现

- 32 个现有资产的 metadata 各自放在 `assets/three-creator/catalog/<id>.json`，
  `asset-catalog.json` 保留为现有 Host/Playground/Episode 的派生产物。
  独立审查逐 ID 比较与基点完全相同，资源 bytes、ID、权限未改变。
- `pnpm content:sync` 派生聚合目录；`content:check --asset <id>` 核对目录与选中资源
  实际 hash/byteLength，分别报告 policy/资源/未运行行为/视觉/发布。
  源写入检查 ID、重复、文件名与 symlink，写一个条目不修改无关源。
- 已有 11 个车辆 exporter、preset importer、Source101 builder 写所属源后派生目录。
  新增内容由 AI 按需要编辑资源、binding、配置和代码，无强制通用 package manifest。
- `example-registry.json` 单次登记 topic/root/default files。示例工具、discovery 和
  capsule staging 共用该登记；保留全部 12 个现有 topic 与默认文件。
- 仓库 `.agents/skills/whitebox-content-integration/SKILL.md` 描述 Playground 调参结果如何
  接入各 owner、成为实际 Agent 可见说明、通过 Creator/Episode 验证。
  Skill 不承担物理/任务/释放一致性，不自动授权生产白名单或部署。

## 验证

本地 `.codex-tmp/r0/c1-*` 保留日志；这是本 worktree 当前源码的实际运行。

| 范围 | 结果 |
| --- | --- |
| catalog-sources、example-files、asset-policy、preset-import-catalog | 4 文件 / 37 项通过 |
| 实际浏览器消费者 | 上述 example-files 包含独立 Episode 的自绘摩托、vehicle-camera 与固定翼起飞/轮组显示验证 |
| 独立源定向复核 | 新文件包含 3 项测试，已纳入 census |
| Typecheck、ESLint | 通过 |
| Census | 103 文件：32 contract / 71 resource-heavy |
| 本地 capsule staging | 480 文件 / 32 资产，未构建容器、上传或部署 |
| Source101 资源身份 | `content:check --asset humanoid.source-101` 通过 |
| Skill frontmatter 与相对链接 | 通过 |
| 独立只读审查 | 未发现需修复的 P1/P2；检查源与派生产物、实际写入入口、registry 消费者和 Skill |

Source101 builder 的 `--check` 在 provenance.sources 失败。用改动前 `53f8f059` 脚本
复现同一失败；模型字节一致，当前新来源整理不是该失败原因。未覆盖或重写历史 provenance，
保留 `.codex-tmp/r0/c1-humanoid-check.log`。它不能被表述为全量资产生产检查已通过。

没有新增 npm 依赖，没有执行云生产或新增资产。独立 reviewer 未运行工程测试；
它的只读审查不替代上表的实际消费者运行。动作自然度人工验收与线上发布均未完成。

## 下一步边界

SDK 目前仍是完整人形/普通世界二选一，Source101 仍有专用加载流程。
随后继续共享 Rapier 生命周期、按 Actor 的骨架/mixer/任务、共享资源 lease，以及
动作定义与动画 binding 分离。数量增长应主要进入所属内容文件，新增行为才扩展对应 owner。
不把当前 metadata 拆文件误称为这些运行时能力已实现。
