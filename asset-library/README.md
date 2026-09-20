# Whitebox 独立资产库

内容制作和发布工具包为 `@worldkit/asset-library`。Web 平台是独立的 [Worldkit Atlas](../apps/asset-platform/README.md)，使用 Next.js 全栈服务。仓库根运行 `pnpm assets:publish`、`pnpm dev:assets`，打开 http://127.0.0.1:3188/；Windows 可运行 `start-dashboard.cmd`。工具使用 Node 22+，`dist/published` 是独立的发布数据目录。

## 权威数据与生成产物

资产内容的可编辑权威来源是 `subjects / shared / assemblies`。`schemas / taxonomy` 定义约束，`apps/asset-platform` 是独立预览消费者。`catalog / dist` 和仓库内 `packages/preset-content/config/generated` 是生成快照，不应手工维护第二份主体定义。宿主算法继续由 SDK 提供。

每个主体目录为 `subjects/<browse_group>/<stable-id>/<version>/`：

- `asset.json`：身份、分类、形态、尺寸与生命周期。
- `capabilities.json`：运动、控制、交互能力及各自成熟度。
- `resources.json`：模型、动画、贴图的路径、SHA-256 与字节数；骨架与蒙皮保留在 GLB 中。
- 可选 `bindings/`、`facts/`：实际骨骼语义、动作槽、挂点与模型物理事实；相机、操控手感在引擎 `packages/preset-content/config/presets/`。
- `assemblies/default.json`：接入入口、资源引用与控制权归属。
- `provenance.json`、`validation/latest.json`：来源、转换与授权事实，以及各类验证证据。

## 日常命令

在本目录运行：

```sh
node tools/library.mjs search horse
node tools/library.mjs describe creature.horse
node tools/library.mjs validate
node tools/library.mjs validate-formats
node tools/library.mjs build
node --test tests/contracts.test.mjs tests/whitebox.test.mjs
```

`node tools/library.mjs materialize creature.horse --output <新目录>` 可按锁定资源导出主体。在 Whitebox 仓库根运行 `pnpm content:sync` 同步宿主适配目录和 preset 包生成快照；`pnpm content:check` 检查它们是否与权威数据一致。

跨包测试通过 `@worldkit/asset-library/testing/*` 读取制作夹具和发布工具；这些子路径不允许进入生产代码。生成目录快照通过 `@worldkit/asset-library/catalog` 导出。

## 消费与验证边界

远程消费使用 `ASSET_REGISTRY_URL`，可另外设置 `ASSET_ARTIFACT_BASE_URL` 指向 CDN。Creator 与 Playground 按选择解析版本、生成项目锁、校验并交付完整资源依赖。默认未配置来源时仍支持本地制作适配器；网络失败不会回退本地库。核心目录、接口、发布与 Agent 调用示例见[接入接口](docs/integration.md)。

当前有 69 个主体、54 个带模型条目（52 个 GLB、2 个 FBX 样本）和 17 个 placeholder；两个 FBX 样本属于 placeholder。271 条动画记录包含未绑定片段与源姿态，不能视为已验证行为。格式检查覆盖 75 个 GLB，0 errors、233 warnings；以[交付说明](docs/delivery.md)和证据文件记录具体范围。

旧目录的 181 个文件经逐字节哈希覆盖核对后，已从当前分支移除。原始路径、旧目录快照和停用导入工具保留为迁移追溯记录，不参与运行或生成。没有将此变更复制到 main 或其他工作区的含义。

飞龙选择缩略图也已迁入主体目录，应用内原副本已移除。详见[维度说明](docs/dimensions.md)、[入库流程](CONTRIBUTING.md)、[原始映射](migrations/whitebox-map.json)、[移除覆盖记录](migrations/legacy-removal-coverage.json)与[本轮验收](docs/unique-library-verification.md)。
