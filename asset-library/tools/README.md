# tools

Node 22+。独立看板、库内验证和生成不依赖 Whitebox 引擎源码或外部 node_modules。宿主同步操作另需 Whitebox 仓库。

## 生成与检查

`node tools/library.mjs build` 从 `subjects / shared / assemblies` 生成索引、锁文件、`dist/whitebox/asset-catalog.json` 和 `asset-definitions.json`。`catalog / dist` 是产物；生成不读取迁移快照或旧资产目录。

`whitebox.mjs` 提供 `buildWhiteboxCatalog(root)` 和 `syncWhiteboxCatalog(root, check = false)`，root 为库根。`check = true` 检查确定性产物，缺失或过期时抛错。

`presets.mjs` 的 `syncPresetContent(libraryRoot, packageRoot, check)` 从相同权威元数据生成 `packages/preset-content/config/generated`。在仓库根运行 `pnpm content:sync` 统一同步适配目录与 preset 快照，`pnpm content:check` 检查一致性。包内 spec 和 config 读取这些产物，不构成另一份可编辑资产配置。

主体身份、变换、动作、挂点、碰撞、资源哈希和控制参数来自对应主体文件。`bindings/whitebox.json` 仅保存宿主策略、集成提示及专用字段。`resources.json` 的 `model_logical_path` 和 `files[].logical_paths` 是稳定逻辑 ID；实际文件由 `files[].path` 定位。

拥有显式 Whitebox binding、非 placeholder、非 planned 的最新主体版本才进入适配产物。缺失资源、哈希变化、重复逻辑 ID 或重复维护主体字段均报错。

## 读取与交付

Host 默认读取仓库 `asset-library`，也支持 `ASSET_LIBRARY_ROOT` 外部目录和 `ASSET_LIBRARY_URL` HTTP 来源，无旧目录回退。远程同步读取依赖预先 `await prepareAssetLibrary(root)`。

Host 私有目录的 `sourcePath` 为 `asset-library/<库内路径>`；交付地址保留 `./assets/subjects|resources/<sha256>.<ext>`。Playground 的 Vite 端通过 Host 校验资源后供给浏览器，远程源也走同一路径。独立浏览用 `asset-definitions.json` 的 URI 相对库根，不是 Playground 绕过校验的交付入口。

## 入库与历史工具

`ingest.mjs` 以显式输入创建新主体版本，检查 GLB 与外部依赖并拒绝覆盖。程序化导出先产出候选文件与 intake 记录，再按[入库流程](../CONTRIBUTING.md)补充绑定与验证。

原 import-whitebox、export-whitebox-procedural 和 setup-docs 已停用，源码仅保存在 `migrations/retired-bootstrap-records.json` 供追溯。不得执行归档内容或以它重建权威主体。

适配回归：`node --test tests/whitebox.test.mjs tests/contracts.test.mjs`；格式检查：`node tools/library.mjs validate-formats`。
