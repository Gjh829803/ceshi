# 新资产与新版本入库

资产的可编辑权威来源是 `subjects / shared / assemblies`；`catalog / dist` 和宿主 preset 包的 `config/generated` 均由工具生成。内容变化使用新版本，不直接覆盖已发布资源或手改生成快照。

1. 在制作侧或 intake 保留原件、许可文件、来源 hash 与转换记录。程序化导出器必须传显式 `--output <新文件.glb>`，输出 GLB 和 `.intake.json` 候选记录；它们不会自动替换库内资产，也不会更新消费目录。
2. 在资产库目录执行 `node tools/ingest.mjs --input <模型.glb> --id <稳定ID> --group animals --name <名称> --version <新版本>`。载具使用 `--group vehicles`；更新现有主体沿用其稳定 ID 并选择尚不存在的版本。入库命令拒绝覆盖已有版本。
3. 若需 FBX 转换，明确记录转换器、单位、轴、缩放和源 hash；不得改扩展名冒充 GLB。转换工具使用显式输入输出，候选文件进入同一入库流程。
4. 检查真实骨骼与片段，补齐 capabilities、bindings、profiles、default assembly、provenance 和验证记录。候选 `.intake.json` 中的配置需要审查后转入主体，ingest 不会自动导入它或复制旧版本的宿主绑定。Whitebox 集成所需策略放入 `bindings/whitebox.json`，主体事实仍在对应元数据中。
5. 在库内运行 `node tools/library.mjs validate-formats`、`validate`、`build`，以及 `node --test tests/contracts.test.mjs tests/whitebox.test.mjs`。通过看板检查模型、骨架、动作与外部动画。不得把待支持运动标成 verified。
6. 在 Whitebox 仓库根运行 `pnpm content:sync`，由权威数据生成适配目录和 `packages/preset-content/config/generated`；再运行 `pnpm content:check`。使用外部本地库时设置 `ASSET_LIBRARY_ROOT`；HTTP 库应在其本地源编辑、验证后发布。
7. 相机、操控和手感参数在引擎 preset-content/config 中维护；内容 profiles 只保留物理事实。新增运行适配需要引擎声明精确主体版本。实际控制、碰撞与骑乘通过后，单独登记精确 Runtime/adapter/preset 证据。
8. 运行 `pnpm assets:publish` 或独立库内 `node tools/serve.mjs --publish --prepare-only` 生成发布包。只部署 `dist/published`；同版本发布内容变化会被拒绝。制作全库锁与项目消费锁职责不同，详见 docs/integration.md。

Shared 用于已有真实复用或明确独立版本契约的内容。第一份专属资源留在 Subject。来源记录和停用工具归档仅用于追溯，不能成为第二个生成源。
