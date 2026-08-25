# Static GLB Subject Asset Batch Intake

这是一条给“收到一目录 Static GLB，想把它们作为可用 Subjects”的重复使用流程。
入口路由在 [`product-asset-intake.md`](./product-asset-intake.md)；Rigged G Bot 仍走原来的
Rigged 路径，不能用本流程削减其骨架或动作合同。统一的模块化权威源和当前资产修改项见
[`20-modular-subject-source-assets.md`](../../20-modular-subject-source-assets.md)。仓库只接收已转换的 GLB；FBX、Blender
工程等源格式必须在 SDK 仓库外完成转换，转换工具和参数作为 provenance 记录，而不是仓库
脚本、Runtime 或 Registry 的能力。

## 当前合同与决策

每个 Static Subject 必须是一个已冻结的、可单独解析的 GLB：`model/gltf-binary`、原始
bytes 的 `sha256:` 与 `byteLength`、`-Z` forward、`+Y` up、1 meter/unit，且原点是
`support-center`（X/Z 居中，最低可见点在 Y=0）。它还必须有明确的 Collider Profile、
Asset Manifest 和 schema-v3 Subject Definition。Definition 的静态资产不带 Rig、Socket、
动画或动画能力；当前只能复用已有的 ground Character capability。

Ready Static GLB 是受限兼容路径，不是长期 Rigged 产品源模板。来源内容仍应按不可变
Source Package 记录；材质/纹理可独立保存，非标准内容进入
`extensions/source-archive/` 且禁止 Runtime 消费。以后增加 Rig/动作时必须发布新的
Rigged 版本，不能覆盖这个 Static GLB 或借用空 Rig/Clip。

这不是“看到车模型就有 vehicle 驾驶”或“看到飞行器就能 flight / mount”的快捷路径。
也不提供 NPC 行为。外观类别可以是 animal、vehicle 或 composite，但实际运行能力必须
由 Registry 中已实现的 capability 定义；没有合同就维持静态视觉加地面 Character 的
范围。

先逐个资产回答下表，再开始注册。每个输出 Subject 必须有自己的 Asset、Collider 与
Definition Ref。

| 来源情况 | 决定 | 证据与限制 |
|---|---|---|
| 已有 GLB 满足本节全部静态合同 | Ready Static GLB admission | 冻结该 GLB bytes，记录清单、Hash、尺寸和人工朝向检查；当前仓库没有可直接接收任意目录的通用 admission CLI |
| GLB 的单位、轴、Pivot、朝向、内容清单或自包含性不符合 | 不能直接注册 | 在仓库外修正并重新导出，再把新 GLB 当成新的不可变输入完整 admission；不要靠 Subject 的 local transform 掩盖错误 |
| 只有 FBX 或其他源格式 | 不能直接注册 | 在仓库外转换为满足合同的 GLB，记录原始来源 Hash、转换工具版本和显式单位/轴/Pivot 参数，再从 Ready Static GLB admission 开始 |
| 需要骨架、Clip 或语义动作 | 改走模块化 Rigged Source | 回到入口的 G Bot 路由；Model/单 Skeleton/Bind Pose、材质纹理和单动作分别交付，不把 Rigged 资产伪装成 Static |

xier120 的 19 个已提交 GLB 是受 Registry Hash、长度和 Babylon 加载门禁保护的现有
artifact，不是可重新烘焙的模板。不要改写其 bytes 或把新来源加入 xier120 专用 Registry
常量。可复用的是最终 GLB admission、Registry/Resolver 闭环和实际 Runtime 验证合同。

## 1. 冻结输入与许可

不要把“目录中所有文件”直接视为可发布资产。先为该 batch 建不可变 Source Catalog；
xier120 的实际模板是
`assets/subjects/source-fbx/contributors/xier120/catalog.json`，并由
`packages/subject-registry/src/source-asset-inventory.ts` 导出。

每条 Catalog 至少记录：稳定且创建者限定的 `sourceId`、`creatorId`、`authorship`、
原始相对路径、仓库相对路径、`byteLength`、`contentHash`、`coarseClass`、`format`，以及
`runtimeStatus` / `conversionRequired`。用读取到的 bytes 重新计算 Hash 和长度；任一不符
即停止，不能用新的 Hash 覆盖 Catalog 以继续接入。Ready Static GLB 也要建立等价的
immutable inventory；来源 provenance 与最终 Runtime artifact inventory 分开记录。

`SubjectAssetManifestInputV1.provenance` 要有 `licenseSpdxId` 和
`redistributionPolicy`；可再记录 `sourceUri`、`licenseUri` 和 `author`。配套 Source
Catalog 或接入证据另行记录源字节 Hash、转换工具版本和转换参数。没有书面可公开再分发
授权时，默认 `internal-only`，不要选择 `allowed`。xier120 是具体例子：其
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

如果第 4 或第 5 步失败，Ready GLB 不能直接登记。必须在仓库外重新转换，并把输出当作
新的 ready artifact 完整 admission。provenance 要明确记录 units、上轴、forward、旋转、
缩放、Pivot、转换工具与版本，不得把这些判断留给 Runtime。

## 3. 外部转换边界

SDK 仓库不拥有 FBX 或 DCC 工程到 GLB 的转换实现，也不承诺某个离线转换器的行为。
提供方必须在交付前完成转换，并随最终 GLB 提供可审计 provenance：原始来源标识和 Hash、
转换工具及精确版本、单位换算、轴向、forward、旋转/缩放、Pivot 处理、材质/纹理策略，
以及适用时的镜像 winding 和 normals 处理。

仓库评审只以最终 GLB bytes 为权威输入。转换后必须重新执行第 2 节全部 admission，不能用
来源文件可解析、转换工具本地通过或旧 batch 的结果代替。若转换过程需要成为产品能力，
应在独立工具仓库和独立安全/格式合同下设计；不得把它加入 SDK Runtime、Registry adapter
或场景工作流。

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
| Trusted `worldkit run` preflight | `scripts/lib/route-validation-runner.ts` 在 schema-v4 `worldkit run` 启动 Host 前调用 `resolveWorldPackageResourceArtifactsV1`；该函数使用 `scripts/lib/world-package-resource-resolver.ts` 的 `DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1` 独立读取、锁定并校验 public asset bytes |
| Trusted `worldkit run` Host | `pnpm worldkit run` 通过 `scripts/worldkit.ts` 启动带 `?authoring=1` 的受信 Host；它先经过上行 preflight，再加载同一 Authoring Loader 和 Runtime Resolver |

Host URL 必须以 `/subject-assets/` 开头，并同 Registry 锁定的 `artifactContentHash`、
`byteLength` 匹配。新的非 xier120 batch 必须维护四个相互独立的映射面：

1. `PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1`；
2. `PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1`；
3. `PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1`；
4. `DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1`。

前三项只满足 Playground Runtime 和 Authoring Loader；它们**不足以**通过 trusted
`worldkit run` 的 resource-resolution preflight。新 batch 应扩展通用 Playground
URI/package-path 映射，并扩展或由新 batch map 合成第四项；为该 Ref 测试第四项的
`publicUri`、`packagePath`、media type、磁盘 bytes、长度和 Hash。若将来把这四项合并为
一个权威来源，必须先完成独立重构和回归；在当前实现中不能省略第四项。不要污染
`XIER120_*` 常量。不要用 plain `pnpm dev` 加 `?authoring=1` 代替 `worldkit run`。

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

Capability Catalog discovery 和已知 Ref 的直接使用也不等于 public Browser selector
可见。`apps/playground/src/worldkit-browser-api.ts` 的 `listSubjectDefinitions()` 从
`builtInSubjectDefaultRegistry.listPublicDefaults()` 生成选择项；它是默认公开产品目录，
不是全部 capability Definitions。xier120 的 internal-only、advanced 或 experimental
条目故意不在这个 defaults Catalog 中；把一个新 batch 加入
`listPublicDefaults()` 是单独的公开产品/发布策略决定，不能作为 Registry、Resolver 或
直接 `subjectDefinitionRef` 接入的副作用。

## 5. 必需验证证据

每个新 batch 都需要自己的命名 verifier 与受测 fixture；没有通用的
`verify:static-subjects`。xier120 的 `pnpm verify:xier120-subjects` 只证明 xier120 的
19 项，不证明另一目录的 30 项。

| 证据层 | 每资产或每 batch 的最小证明 |
|---|---|
| 自动化合同 | 冻结最终 GLB bytes 的 Hash 和长度；拒绝 malformed GLB 与 Hash mismatch；GLB inventory；Asset/Collider/Definition closure；Capability Catalog discovery；`subjectDefinitionRef` 的 normalize/compile；同一 asset 的双实例、隔离、dispose、cache 生命周期；以及 `DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1` 的 trusted preflight 解析、路径和 bytes/Hash 匹配 |
| 渲染 | 每个资产在 Canonical Authoring Runtime 的截图或同等持久画面证据，核对朝向、up、support-center、可见网格与 Collider 对位；更新 Definition 或 Resolver 后重新跑 |
| 人工交互 | 先声明交互等价类别。静态 ground Subject 共用同一 capability/profile/Host 路径且所有资产已有自动化加渲染证据时，每类抽一个代表验证 spawn、W/A/S/D、jump、相机拖拽/滚轮和 reset；样本只证明该类代表。若要对每个资产作单独交互承诺、它引入新 capability/profile/Host 路径，或渲染/抽样发现异常，则该资产必须逐项人工验证。所有记录都只能声明 ground Character 交互，不能解释为驾驶、飞行、骑乘或 NPC 行为。 |

xier120 可作为完整工作例子：

```bash
pnpm verify:xier120-subjects
pnpm worldkit validate examples/authoring/xier120-subject-gallery.json --json
pnpm worldkit subject explain examples/authoring/xier120-subject-gallery.json \
  --entity-id xier120-subject --json
pnpm worldkit run examples/authoring/xier120-subject-gallery.json
```

其持久的渲染/人工记录位于
`artifacts/examples/xier120-subject-gallery/gallery.png` 和
`artifacts/examples/xier120-subject-gallery/manual-check.json`。这些是 xier120 的先例，
不是新 batch 可以复用的通过证书。该例对全部 19 个 Definition 完成自动化和渲染检查；
人工 trusted-host interaction 仅覆盖 animal、vehicle、composition 三个代表类别，
不是 19 个资产逐项手工通过的声明。

在 batch verifier 和渲染证据通过后，还要运行
`pnpm vitest run scripts/lib/world-package-resource-resolver.test.ts`，确认 trusted
preflight 的 fourth mapping surface 能读取并锁定对应 Subject Asset；最后启动同一
schema-v4 fixture 的 `pnpm worldkit run`，确认 preflight 和 Host 都成功。新 batch 的
测试不得只断言三个 Playground 映射。

## 常见失败与处理

| 失败 | 处理 |
|---|---|
| 最终 GLB Hash 或长度变化 | 停止；确认来源版本、转换 provenance 和许可后，以新版本重新 admission、Registry 和 Resolver，而不是篡改旧记录 |
| 反射后黑面、内翻或 normals 错误 | 回到仓库外转换流程修正 winding/normals，产生新的 GLB，并重新执行完整 admission |
| 资产横放、倒置、脚悬空或正面错误 | 回到仓库外转换流程；明确 scale、旋转、up、forward 和 support-center，不用世界 Transform 补偿 |
| Registry 可 describe 但 Playground 或 `worldkit run` 解析失败 | 同时检查三个 Playground maps 与 `DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1`；确认 URL 在 `/subject-assets/` 下、package path 唯一，且四面读取的 bytes/Hash 一致 |
| Capability Catalog 能发现 Definition，Browser selector 却不显示 | 先区分 direct/capability use 与 public-default policy。检查 `listCapabilitySubjectDefinitions()`；不要自动修改 `listPublicDefaults()`，除非公开产品目录策略已批准 |
| 资产外观像车、飞行器或带骑手 | 保持 internal/static ground 范围；若产品需要 vehicle、flight、mount 或 NPC，提交 Capability Gap，不虚构行为 |
| 想把一个未验证目录批量发布 | 按每资产 inventory、Registry Ref、Resolver 和三类证据收齐；抽样不能替代 30 个资产的视觉朝向 QA |
