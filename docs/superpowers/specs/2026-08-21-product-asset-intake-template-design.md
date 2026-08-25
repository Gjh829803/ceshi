# Product Asset Intake Template

## 1. 文档状态

- 状态：Draft，M1 纵向切片。固化 G Bot 已验证的接入合同，供后续产品人物复用。
- 所属系统：Subject Registry / Host Asset Resolver / CLI·Browser Gate。
- 上位规格：
  - [`Asset Subject S1b`](2026-08-19-asset-subject-s1b-visible-slice-design.md)
  - [`G Bot Product Asset S1`](2026-08-20-g-bot-product-asset-s1-design.md)
  - [`主体资产与 3C 对接`](../../16-subject-assets-3c-integration.md) §13
- 当前实现：G Bot 已通过独立 Gate。本文不增加第二个产品人物，不开放其余 Clip，
  不修改已提交 GLB，也不进入 P0.2 Capture / P1.3 姿态协议。

Agent 执行步骤见
[`docs/superpowers/skills/product-asset-intake.md`](../skills/product-asset-intake.md)。
G Bot 的 Intake Fixture 为
`examples/product-asset-intakes/humanoid.g-bot@2.json`。

## 2. 目标与非目标

### 2.1 目标

- 把 G Bot 的交付 Manifest → 五条 Registry 资源 → World JSON 只引
  `subjectDefinitionRef` → 独立 Browser Gate 收成可复制合同。
- 产品手交 Manifest 保持 provenance，不进入 Canonical Schema。
- 静态 GLB/Manifest 对拍使用通用 Diagnostic，不再带 `G_BOT_` 前缀。
- 下一个产品人物先写 Intake Fixture，再填 Registry，最后跑同一套 Gate。
- 缺 Rig、Clip、Hash、Collider 或 Host URI 时稳定失败，禁止在 Scene JSON 或
  Babylon Loader 里补丁。

### 2.2 非目标

- 不接入第二个产品 GLB。
- 不把 G Bot 其余 21 个源 Clip 开放为 Runtime Semantic Action。
- 不实现 Compound Collider、LOD、四足/非人拓扑、独立动画包。
- 不实现 `fall`/`land`、蹲伏/趴伏、Action Request/Receipt。
- 不修改 Compiler 分支、Babylon Loader 或 Authoring 字段来迁就资产。
- 不把产品 `asset.manifest.json` 的词汇提升为 Canonical Registry 字段。

## 3. 冻结的接入合同

后续人形产品资产在当前切片必须同时满足：

| 层 | 权威 | 禁止 |
|---|---|---|
| 产品手交 | `asset.manifest.json` + `action-manifest.json` + 不可变 GLB 字节 | 把产品字段写进 Authoring / IR / ExecutionPlan |
| Registry | 恰好五条资源：Asset、Rig、Animation Set、Collider、Subject Definition | 用产品 Manifest 冒充 Registry 资源 |
| Host | `subjectAssetRef` → 同源 public URI | URI 进入 Canonical JSON |
| World JSON | 只写 `subjectDefinitionRef` + spawn / 实例 ID | 写 clip 名、骨名、文件路径、Babylon Handle |
| Runtime 动作 | 仅 `idle` / `walk` / `run` / `jump` | 凭多余 Clip 宣称能力已完成 |
| Gate | 同一套 validate / build / explain / 双实例 / 墙体 / 四动作截图 / Hash 篡改 | 只看能加载或只看一张图 |

坐标合同不变：米制、`+Y` 上、`-Z` 前、Pivot 为 support-center。Rig 使用 17 个解剖
`BipedBoneIdV1`；`skeletonRootBoneName` 是唯一无父 Bone，可以与 `hips` 是同一根
物理骨。

## 4. Intake Fixture

`ProductAssetIntakeFixtureV1` 是 Host/Gate 输入，不是 Authoring Schema。它锁定一次
接入要用的路径、Ref 和验收身份。

```ts
interface ProductAssetIntakeFixtureV1 {
  schemaVersion: 1;
  kind: "product-asset-intake-fixture";
  id: string;
  subjectDefinitionRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  animationSetRef: string;
  colliderProfileRef: string;
  hostPublicUri: string;
  glbRepositoryPath: string;
  productAssetManifestPath: string;
  productActionManifestPath: string;
  authoringWorldPath: string;
  artifactDirectoryPath: string;
  primaryEntityId: string;
  secondaryEntityId: string;
  controllerId: string;
  requiredRuntimeActionIds: readonly ["idle", "walk", "run", "jump"];
  minimumSubjectPoseDifferenceRatio: number;
}
```

规则：

- `kind` 关闭为 `product-asset-intake-fixture`。
- 五个 `...Ref` 必须是 `worldkit://` 资源引用，且能在 Built-in Registry 解析为对应
  `kind`。
- 所有 `...Path` 相对仓库根，禁止绝对路径和 `..`。
- `hostPublicUri` 只允许同源 public 路径，必须以 `/subject-assets/` 开头。
- `requiredRuntimeActionIds` 本切片固定为四动作，顺序为
  `idle`、`walk`、`run`、`jump`。
- `primaryEntityId` 与 `secondaryEntityId` 必须不同。
- `minimumSubjectPoseDifferenceRatio` 必须是 `(0, 1]` 的有限数。

G Bot 是第一条 Fixture。Golden Humanoid 继续走 `pnpm verify:rigged-subject`，不占用
本模板；它是协议回归，不是产品手交。

## 5. 静态 Evidence

`inspectProductAssetEvidence` 对拍：

1. GLB 原始字节 Hash / 长度 / `glTF` 2.0；
2. 产品 Asset Manifest 的 mesh/vertex/triangle/attribute/rootBone/jointCount；
3. 产品 Action Manifest 的源 Clip 名集合（可多于四动作）；
4. `requiredActions` 必须覆盖 Fixture 的四动作，且能在 Action Manifest 里找到
   `clip`；
5. 单一 Skin、唯一无父关节等于 Manifest `rootBone`；
6. 禁止外部 Buffer/Image URI、Camera、KHR lights。

失败码使用 `PRODUCT_ASSET_*`。不再新增 `G_BOT_*` Diagnostic。G Bot Gate 继续调用
同一函数。

产品 Action Manifest 可以列出 25 个艺术 Clip。那只证明库存，不证明 Runtime 已绑定。
Registry Animation Set 可以保留额外 Binding 供后续 P1.3；Intake Gate 只验收四动作。

## 6. Registry 与 World JSON

接入者必须新增或复用五条 Registry 资源，字段走现有
`SubjectAssetManifestInputV1` / `RigProfileManifestInputV1` /
`AnimationSetManifestInputV1` / `ColliderProfileManifestInputV1` /
`RegistrySubjectDefinitionInputV3`。禁止为单个产品发明平行 Manifest 类型。

World 示例只允许：

```json
{
  "id": "actor-primary",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/<id>@1",
  "spawnAnchorEntityId": "spawn-actor-primary"
}
```

Host Resolver 单独登记 `subjectAssetRef → hostPublicUri`。缺映射时 Gate 失败，不
回退猜测路径。

## 7. Gate

当前切片的一键命令仍是 `pnpm verify:g-bot-subject`。它必须从 G Bot Intake Fixture
读取路径和 Ref，不再在脚本里手写第二份常量。

后续人物的 Gate 复用同一 verifier，只换 Fixture。未提供第二个 GLB 前，不增加第二条
生产命令。

Gate 仍必须证明：

1. 产品字节与 Manifest Hash 一致；
2. Authoring validate/build/explain/capture 走普通 CLI；
3. 两个实例独立位移与 `activeActionId`；
4. Havok 墙体停止；
5. 四张固定 Tick 动作图姿态差不低于 Fixture 阈值；
6. 篡改 GLB 得到 `SUBJECT_ASSET_HASH_MISMATCH`，磁盘 Hash 不变；
7. Golden `verify:rigged-subject` 仍绿。

## 8. 生产完成标准

M1 在同时满足以下条件后才能勾选完成：

1. Intake Fixture Schema 与 G Bot Fixture 进入回归；
2. 静态 Evidence 使用 `PRODUCT_ASSET_*` 且 G Bot 对拍仍通过；
3. `pnpm verify:g-bot-subject` 从 Fixture 读入，不再复制路径/Ref；
4. Agent 指令只描述可执行步骤，不含维护叙事；
5. 未接入第二个产品人物，也未扩大 Runtime 动作面。
