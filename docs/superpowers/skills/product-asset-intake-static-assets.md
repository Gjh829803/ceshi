# Static Subject Asset Batch Intake

这是一条给“收到一目录 Static GLB，想把它们作为可用 Subjects”的重复使用流程。
它也覆盖只有 FBX 的批量来源。入口路由在
[`product-asset-intake.md`](./product-asset-intake.md)；Rigged G Bot 仍走原来的 Rigged
路径，不能用本流程削减其骨架或动作合同。

## 当前合同与决策

每个 Static Subject 必须是一个已冻结的、可单独解析的 GLB：`model/gltf-binary`、原始
bytes 的 `sha256:` 与 `byteLength`、`-Z` forward、`+Y` up、1 meter/unit，且原点是
`support-center`（X/Z 居中，最低可见点在 Y=0）。它还必须有明确的 Collider Profile、
Asset Manifest 和 schema-v3 Subject Definition。Definition 的静态资产不带 Rig、Socket、
动画或动画能力；当前只能复用已有的 ground Character capability。

这不是“看到车模型就有 vehicle 驾驶”或“看到飞行器就能 flight / mount”的快捷路径。
也不提供 NPC 行为。外观类别可以是 animal、vehicle 或 composite，但实际运行能力必须
由 Registry 中已实现的 capability 定义；没有合同就维持静态视觉加地面 Character 的
范围。

先逐个资产回答下表，再开始注册。一个 batch 内可以混用两条来源路径，但每个输出
Subject 必须有自己的 Asset、Collider 与 Definition Ref。

| 来源情况 | 决定 | 证据与限制 |
|---|---|---|
| 已有 GLB 满足本节全部静态合同 | Ready Static GLB admission | 冻结该 GLB bytes，记录清单、Hash、尺寸和人工朝向检查；当前仓库没有可直接接收任意目录的通用 admission CLI |
| GLB 的单位、轴、Pivot、朝向、内容清单或自包含性不符合 | 不能直接注册 | 先为该 batch 做一个经评审的确定性 normalizer；不要靠 Subject 的 local transform 掩盖错误 |
| 只有 FBX | Source FBX deterministic bake | 冻结 source Catalog 后，按 xier120 的 bake/config 模式实现并验证该 batch 的转换 |
| 需要骨架、Clip 或四个语义动作 | 改走 Rigged GLB | 回到入口的 G Bot 路由；不要把 Rigged 资产伪装成 Static |

`pnpm bake:xier120-subjects` 只处理 19 个 `xier120.*` FBX 条目及
`xier120StaticSubjectBakeConfigs`，不是通用转换器。新 batch 绝不调用它、绝不把新项塞进
`xier120StaticSubjectBakeConfigs`，也不改写 xier120 已提交的 GLB。可复用的是它的受测
模式：`scripts/lib/static-subject-bake.ts` 的确定性 flatten、`support-center` 重心、
GLB inventory 和精确字节比对；`bakeStaticSubjectFbx` 的当前输入类型是
`ContributorSourceFbxAssetInventoryEntryV1`，因此它也不是跨 batch 的公开转换 API。为
新来源建立自己的 Catalog、配置、driver、验证器和测试，或先把泛化设计作为单独的
Capability/Adapter 评审。

## 1. 冻结输入与许可

不要把“目录中所有文件”直接视为可发布资产。先为该 batch 建不可变 Source Catalog；
xier120 的实际模板是
`assets/subjects/source-fbx/contributors/xier120/catalog.json`，并由
`packages/subject-registry/src/source-asset-inventory.ts` 导出。

每条 Catalog 至少记录：稳定且创建者限定的 `sourceId`、`creatorId`、`authorship`、
原始相对路径、仓库相对路径、`byteLength`、`contentHash`、`coarseClass`、`format`，以及
`runtimeStatus` / `conversionRequired`。用读取到的 bytes 重新计算 Hash 和长度；任一不符
即停止，不能用新的 Hash 覆盖 Catalog 以继续接入。Ready Static GLB 也要建立等价的
immutable inventory，即使它不使用当前的 FBX 专用 TypeScript 导出。

`SubjectAssetManifestInputV1.provenance` 要有 `licenseSpdxId` 和
`redistributionPolicy`；可再记录 `sourceUri`、`licenseUri` 和 `author`。没有书面可公开
再分发授权时，默认 `internal-only`，不要选择 `allowed`。xier120 是具体例子：其
`XIER120_SUBJECT_ASSET_MANIFESTS` 使用
`LicenseRef-Loopit-Company-Private`、`internal-only` 和作者 `xier120`；这些值不能被
复制为其他来源的许可证结论。

## 2. Ready Static GLB admission

对目录中的每一个 GLB 做以下清单，并把结果写入该 batch 的受测 inventory/manifest，而
不是依赖人工记忆：

1. 原始 GLB 是自包含的二进制 GLB；检查每个 buffer 没有外部 URI，且没有外部 image。
2. 有可渲染三角网格、indexed triangles、有限 normals、正的三轴尺寸；记录
   `meshCount`、`vertexCount`、`triangleCount` 和 bounds。
3. 验证 `skeletonCount: 0`、`boneCount: 0`、`animationClipNames: []`、无 camera、无
   light。否则它不是此 Static 路径的已接纳输入。
4. 用已知的正面参照或三视图逐资产验证视觉 forward 是 `-Z`、up 是 `+Y`，并在实际
   Playground 画面中确认朝向。不能只检查一个代表项；30 个 GLB 就需要 30 份朝向结论。
5. 验证 Pivot：X/Z 居中、最低可见点在 Y=0；不以 Collider 或世界位置的补偿来伪装错误。
6. 记录原始 GLB Hash/长度。之后 asset bytes、Registry artifact 的 Hash/长度、Host
   Resolver 取得的 bytes 必须完全相同。

如果第 4 或第 5 步失败，Ready GLB 不能直接登记。当前代码没有“给任意 GLB 旋转并导出”
的通用命令；为该 batch 新建确定性 normalizer 后，再把 normalizer 输出当作上面的
ready artifact 重新 admission。normalizer 要明确记录 units、上轴、forward、旋转、缩放
和 Pivot，不得把这些判断留给 Runtime。

## 3. Source FBX deterministic bake

FBX 先进入 Catalog，再为每个 `sourceId` 写显式配置。xier120 的配置类型
`StaticSubjectBakeConfigV1` 与
`packages/subject-registry/src/xier120-static-subject-config.ts` 展示了当前所需事实：
`scaleToMeters`、`rotateXYZRadians`、`expectedForward: "-Z"` 和
`displayColorHex`。xier120 的实际 driver 是
`scripts/bake-xier120-static-subjects.ts`，输出在
`apps/playground/public/subject-assets/xier120/` 下；它的 `outputPathFor()` 由每个
`xier120.` 前缀 Source ID 导出对应的 `slug/v1/slug.glb` 路径。

新的 FBX batch 复制这种**结构**而不是名称或数据：在一次写入前验证所有 source
`byteLength` / `contentHash` 和一对一配置；每个 Mesh 应用完整 world transform 加配置
旋转/缩放，flatten 后 support-center；导出自包含 GLB 和 inventory；然后在临时目录
重算并逐字节比较已提交输出。`scripts/lib/static-subject-bake.ts` 有一个必须保留的
几何规则：如果合成的 `worldToBakeMatrix.determinant() < 0`，必须反转每个三角形的
winding（交换 B/C），再计算 normals。否则镜像或负缩放会产生错误的外向面。

`scripts/lib/static-subject-bake.test.ts` 是这项模式的可执行参考：它覆盖负 determinant
的外向 normals、两次 bake 的 byte identity、自包含 GLB、静态 inventory 以及
Babylon admission。新 batch 的测试至少同样覆盖其配置完整性、来源 Hash、反射 winding、
determinism 和 GLB admission；不应只复用 xier120 的 19 项通过结果。

## 4. Registry、Definition 与所有 Resolver

接纳一个静态 artifact 后，新增或更新以下 Registry 资源，并全部使用精确版本 Ref：

| Registry 资源 | xier120 已验证示例 | 必需事实 |
|---|---|---|
| Subject Asset | `worldkit://subject-asset/xier120.biped-animal@1` | `format: "glb"`、artifact bytes/Hash/长度、静态 inventory、coordinate convention、许可 |
| Collider Profile | `worldkit://collider-profile/xier120.biped-animal@1` | 明确 authoring 尺寸，不从 Runtime mesh bounds 猜测 |
| schema-v3 Subject Definition | `worldkit://subject-definition/xier120.biped-animal@1` | 一个 asset visual part、`visualBinding: { mode: "static" }`、对应 Collider、现有 ground capability 和 static pose set |

xier120 的实现位置分别是
`packages/subject-registry/src/xier120-resource-manifests.ts` 的
`XIER120_SUBJECT_ASSET_MANIFESTS` / `XIER120_COLLIDER_PROFILES`，以及
`packages/subject-registry/src/xier120-subject-definitions.ts` 的
`XIER120_SUBJECT_DEFINITIONS`；`packages/subject-registry/src/index.ts` 导出它们，
`packages/subject-registry/src/built-in-subject-resource-registry.ts` 注册它们。新 batch
应有自己的命名与资源集合，
不得借用 xier120 Ref。

每个资产还必须在下面的真实使用面可解析；只加 Registry 是不够的。

| 使用面 | 必须维护的映射/入口 |
|---|---|
| Canonical Playground Runtime | `apps/playground/src/main.ts` 用 `PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1` 调用 `createFetchSubjectAssetResolver` |
| Authoring Loader / World Package artifact 收集 | `apps/playground/src/authoring-loader.ts` 使用 `PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1` 与 `PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1` 调用 `resolveWorldPackageSubjectAssetArtifactsV1` |
| xier120 的已有 batch 级映射 | `XIER120_SUBJECT_ASSET_URI_BY_REF_V1` 与 `XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1`；它们只属于 xier120，通用 Playground 映射由 spread 合成 |
| Trusted `worldkit run` | `pnpm worldkit run` 通过 `scripts/worldkit.ts` 启动带 `?authoring=1` 的受信 Host；它加载同一 Authoring Loader 和 Runtime Resolver，因此前两行都缺一不可 |

Host URL 必须以 `/subject-assets/` 开头，并同 Registry 锁定的 `artifactContentHash`、
`byteLength` 匹配。新的非 xier120 batch 应扩展通用 Playground URI/package-path 映射或
先引入自己的 batch map 再由这两个通用 map 合成；不要污染 `XIER120_*` 常量。不要用
plain `pnpm dev` 加 `?authoring=1` 代替 `worldkit run`。

场景使用的唯一直接选择是 Definition Ref，例如：

```json
{
  "id": "xier120-subject",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/xier120.biped-animal@1",
  "spawnAnchorEntityId": "spawn-xier120"
}
```

发布前验证 AI 发现面：

```bash
pnpm exec tsx --eval 'import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry"; console.log(builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions().map((definition) => definition.resourceRef).filter((resourceRef) => resourceRef.startsWith("worldkit://subject-definition/xier120.")));'
pnpm worldkit registry describe \
  --resource-ref worldkit://subject-definition/xier120.biped-animal@1 --json
```

batch verifier 还要断言
`builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions()` 含同一
`subjectDefinitionRef`。Capability Catalog 是 capability-driven Authoring 的实际选择面；
当前 `pnpm worldkit registry list --kind subject-definition --json` 只调用
`listSubjectDefinitions()` 的 legacy CLI view，不能列出 xier120 schema-v3 静态
Definitions。不要把该 CLI list 的通过当作 capability discovery；在拿到精确 Ref 后，
`worldkit registry describe` 仍应通过。

## 5. 必需验证证据

每个新 batch 都需要自己的命名 verifier 与受测 fixture；没有通用的
`verify:static-subjects`。xier120 的
`pnpm bake:xier120-subjects -- --check` 和
`pnpm verify:xier120-subjects` 只证明 xier120 的 19 项，不证明另一目录的 30 项。

| 证据层 | 每资产或每 batch 的最小证明 |
|---|---|
| 自动化合同 | 冻结 source/ready bytes Hash 和长度；FBX bake 的 exact-byte 回归；GLB inventory；Asset/Collider/Definition closure；Capability Catalog discovery；`subjectDefinitionRef` 的 normalize/compile；同一 asset 的双实例、隔离、dispose、cache 生命周期和 Hash 拒绝 |
| 渲染 | 每个资产在 Canonical Authoring Runtime 的截图或同等持久画面证据，核对朝向、up、support-center、可见网格与 Collider 对位；更新 Definition 或 Resolver 后重新跑 |
| 人工交互 | 通过 trusted `pnpm worldkit run` Host，对每个可发布 asset 至少验证 spawn、W/A/S/D、jump、相机拖拽/滚轮和 reset；记录这是 ground Character 交互，不将其解释为驾驶、飞行、骑乘或 NPC 行为 |

xier120 可作为完整工作例子：

```bash
pnpm bake:xier120-subjects -- --check
pnpm verify:xier120-subjects
pnpm worldkit validate examples/authoring/xier120-subject-gallery.json --json
pnpm worldkit subject explain examples/authoring/xier120-subject-gallery.json \
  --entity-id xier120-subject --json
pnpm worldkit run examples/authoring/xier120-subject-gallery.json
```

其持久的渲染/人工记录位于
`artifacts/examples/xier120-subject-gallery/gallery.png` 和
`artifacts/examples/xier120-subject-gallery/manual-check.json`。这些是 xier120 的先例，
不是新 batch 可以复用的通过证书。

## 常见失败与处理

| 失败 | 处理 |
|---|---|
| source Hash 或长度变化 | 停止；确认来源版本和许可后，以新版本重新 Catalog、bake、Registry 和 Resolver，而不是篡改旧记录 |
| 反射后黑面、内翻或 normals 错误 | 检查 bake matrix determinant；负值必须反转 winding 后再算 normals |
| 资产横放、倒置、脚悬空或正面错误 | 回到 batch 配置/normalizer；明确 scale、旋转、up、forward 和 support-center，不用世界 Transform 补偿 |
| Registry 可 describe 但 Playground 或 `worldkit run` 解析失败 | 同时检查通用 URI map、package-path map 和 capability Runtime URI map；确认 URL 在 `/subject-assets/` 下且 bytes/Hash 一致 |
| CLI 能列出 Definition，Capability UI 却不显示 | 在 verifier 中检查 `listCapabilitySubjectDefinitions()`，并修复 schema-v3 定义与 Registry 注册 |
| 资产外观像车、飞行器或带骑手 | 保持 internal/static ground 范围；若产品需要 vehicle、flight、mount 或 NPC，提交 Capability Gap，不虚构行为 |
| 想把一个未验证目录批量发布 | 按每资产 inventory、Registry Ref、Resolver 和三类证据收齐；抽样不能替代 30 个资产的视觉朝向 QA |
