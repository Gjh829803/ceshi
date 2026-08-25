# Product Asset Intake

主体资产接入先按交付物选择路径；不要为了资产修改 Compiler、Babylon Loader、
Authoring 字段或 Scene 脚本。长期的设计合同见
[`2026-08-21-product-asset-intake-template-design.md`](../specs/2026-08-21-product-asset-intake-template-design.md)，
当前模块化目录、命令和逐资产修改项见
[`20-modular-subject-source-assets.md`](../../20-modular-subject-source-assets.md)。

| 交付物 | 接入路径 | 当前可用范围 |
|---|---|---|
| 模块化 Rigged Source Package：Model/Rig/Material/Texture/独立动作齐全 | **Rigged Source**：继续本文件的 G Bot 路径；确定性生成当前 Runtime Bundle | G Bot 当前 Runtime 的四个地面动作；额外 Clip 只有相应状态/能力实现后才可声明 |
| 只有已规范化的合并 Rigged GLB | **一次性恢复拆分**：运行模块化恢复并标记 `derived-recovery`，原文件只保留于 `extensions/` | 切到派生 Bundle 后删除旧公开入口；不能把恢复产物伪称原始产品源 |
| 已规范化的无 Rig、无动画 Static GLB | **Ready Static GLB**：读 [批量 Static GLB 指南](./product-asset-intake-static-assets.md) | 静态视觉加现有 ground Character 能力，不意味着车辆、飞行、坐骑或 NPC 行为 |
| 只有源格式，或 Static GLB 未满足单位、轴、Pivot、朝向或静态清单 | **外部转换后重新接入**：先在 SDK 仓库外生成符合合同的 GLB，再走 [批量 Static GLB 指南](./product-asset-intake-static-assets.md) | 仓库不提供源格式转换器；转换工具、参数和来源版本只作为 provenance 记录，Runtime 与 Registry 只接收最终 GLB |

所有路径共同要求精确版本的 Registry Ref、每个模块化制品及最终 Runtime GLB 字节的 `sha256:`、确定的
`byteLength`、`-Z` forward、`+Y` up、1 meter/unit、`support-center` Pivot，以及
每个资产经过 Registry、Resolver、自动化、渲染和人工证据闭环。World JSON 只持有
`subjectDefinitionRef`，不持有 GLB 路径、骨名、Clip 名、引擎 Handle 或 Collider 参数。
产品 `asset.manifest.json` / `action-manifest.json` 不进入 Canonical Schema；已提交的
G Bot GLB 和 Golden Humanoid GLB 不作为新资产的可编辑输入。模型/骨骼/Bind Pose、
材质纹理和单动作必须能独立升级；`extensions/` 中的归档禁止 Runtime 消费。

## Ready Rigged Source：保留 G Bot Runtime 路径

首条 Fixture 是 `examples/product-asset-intakes/humanoid.g-bot@2.json`。新的人形
Rigged GLB 可参照该契约，但不能把静态资产混入这条路径。

1. 先建立不可变 Source Package：Model GLB 只含 Mesh/Skin/单 Skeleton/Bind Pose，
   Rig Profile 独立，材质/纹理独立，一个语义动作一个 Clip GLB；未知内容进入
   `extensions/source-archive/` 并标记禁止 Runtime 消费。
2. 运行 `pnpm assets:subjects:modularize` 和
   `pnpm assets:subjects:modularize:check`，确认目录闭包和字节可重复；新资产需要先加入
   明确 Catalog，不得靠扫描文件名发现语义。
3. 运行 `pnpm assets:subjects:runtime-bundles` 和
   `pnpm assets:subjects:runtime-bundles:check`，生成并锁定唯一 Runtime Bundle。
4. 复制 G Bot Fixture，并填精确的 `subjectDefinitionRef`、`subjectAssetRef`、
   `rigProfileRef`、`animationSetRef`、`colliderProfileRef`、仓库相对 GLB 路径、
   以 `/subject-assets/` 开头的 `hostPublicUri`，以及两个不同的 Entity ID。
5. 从已锁定模块化源确定性生成当前 Runtime 自包含 GLB；它与 `asset.manifest.json`、`action-manifest.json` 一起进入 Fixture。
   `runtime.contentHash` 是原始 GLB bytes 的 `sha256:`；Action Manifest 的 Clip
   顺序等于 GLB animation 名顺序。
6. Registry 增加恰好五条资源：Subject Asset、Rig Profile、Animation Set、Collider
   Profile 与 Subject Definition。Rig 显式映射 17 个 `BipedBoneIdV1` 和
   `skeletonRootBoneName`；Animation Set 至少映射 `idle`、`walk`、`run`、`jump`。
7. 在 `apps/playground/src/worldkit-asset-resolver.ts` 注册对应的 Host URL；缺映射
   必须失败。Fixture 的 `inspectProductAssetEvidence` 必须通过，失败码只允许
   `PRODUCT_ASSET_*`。随后运行该资产自己的 Gate。现有 G Bot Gate：

```bash
pnpm worldkit validate examples/authoring/g-bot-subject-world.json --json
pnpm worldkit subject explain examples/authoring/g-bot-subject-world.json \
  --entity-id g-bot-primary --json
pnpm verify:g-bot-subject
```

Rigged 资产没有独立 verifier 前，不能把 `pnpm verify:g-bot-subject` 的成功继承给它。
如果接入要求新增公共 Schema、Loader 或 Runtime 启发式，停止在 Capability Gap，回到
Profile/Adapter 评审。

## 共同的 AI-facing 使用方式

无论视觉资产如何进入 Registry，场景只选择已发布的 Definition。例如 xier120 的静态
动物使用：

```json
{
  "id": "xier120-subject",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/xier120.biped-animal@1",
  "spawnAnchorEntityId": "spawn-xier120"
}
```

Capability-driven 调用方必须先在
`builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions()` 中发现同一 Ref，再读取
精确资源。当前 `worldkit registry list --kind subject-definition` 是 legacy CLI view，
不列出 xier120 的 schema-v3 Capability Definitions；它不能作为静态 Subject 的发现面。
完整的 capability discovery 命令在 [批量 Static GLB 指南](./product-asset-intake-static-assets.md)。
已知 Ref 可以用 CLI describe 核对：

```bash
pnpm worldkit registry describe \
  --resource-ref worldkit://subject-definition/xier120.biped-animal@1 --json
```

不要根据文件名、类别（例如 `vehicle`）或外观推断可用行动。Registry 的
`authoringAvailability` 和 Capability Catalog 才是选择依据。
Capability Catalog 可发现或场景可直接引用的 Definition，也不自动出现在 public Browser
selector；该 selector 只从 `builtInSubjectDefaultRegistry.listPublicDefaults()` 读取批准的
defaults。把 internal-only、advanced 或 experimental 资产加入公开 defaults 是独立策略，
不是资产接入步骤。
