# Product Asset Intake

后续人形产品资产按本文件执行。设计合同见
[`2026-08-21-product-asset-intake-template-design.md`](../specs/2026-08-21-product-asset-intake-template-design.md)。
第一条 Fixture：`examples/product-asset-intakes/humanoid.g-bot@1.json`。

## 禁止

- 不要改 Compiler、Babylon Loader、Authoring 字段或 Scene 脚本来迁就资产。
- 不要把产品 `asset.manifest.json` / `action-manifest.json` 写进 Canonical Schema。
- 不要把文件路径、骨名、Clip 名或引擎 Handle 写进 World JSON。
- 不要把四动作以外的 Clip 标成已实现 Runtime 能力。
- 不要改已提交的 G Bot GLB 或 Golden Humanoid GLB。

## 步骤

1. 复制 `examples/product-asset-intakes/humanoid.g-bot@1.json` 为
   `examples/product-asset-intakes/<id>@1.json`。填五个 `worldkit://...Ref`、仓库相对路径、
   `hostPublicUri`（必须以 `/subject-assets/` 开头）、两个不同 Entity ID，以及
   `requiredRuntimeActionIds: ["idle","walk","run","jump"]`。
2. 把不可变 GLB 放到 Fixture 的 `glbRepositoryPath`。写入产品
   `asset.manifest.json` 与 `action-manifest.json`。`runtime.contentHash` 必须是
   `sha256:` + 原始字节。Action Manifest 的 `clip` 顺序必须等于 GLB animation 名顺序。
3. 在 `packages/subject-registry` 增加恰好五条资源：Subject Asset、Rig Profile、
   Animation Set、Collider Profile、Subject Definition。Rig 填 17 个 `BipedBoneIdV1`
   与 `skeletonRootBoneName`。Animation Set 至少绑定四动作；多余 Clip 只进库存。
4. Host Resolver 增加 `subjectAssetRef → hostPublicUri`。缺映射必须失败。
5. World JSON 只写：

```json
{
  "id": "<primaryEntityId>",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/<id>@1",
  "spawnAnchorEntityId": "<spawn-id>"
}
```

6. 用 Fixture 跑静态对拍：`inspectProductAssetEvidence` 必须通过。失败码只允许
   `PRODUCT_ASSET_*`。
7. 跑 `pnpm verify:g-bot-subject` 作为当前切片 Gate。新人物未提供独立 verifier 前，
   不得勾选该人物完成。Golden 仍跑 `pnpm verify:rigged-subject`。
8. 若任一步要求改公共 Schema、Loader 或运行时启发式，停在 Capability Gap，回到
   Profile/Adapter 评审。
