# dev 合并与云端测试交接（2026-09-18）

目标分支：`codex/subject-library-demo`。资产重构保存提交：`17834c51`；合入 `origin/dev`：`f6000cdc`（飞行器手感配表与载具恢复）。未修改远端 dev/main，未启动云端生产任务。

## 合并结果

- 保留资产库为唯一内容源；旧 `assets/` 和旧相机配表路径不恢复。
- 两处冲突涉及 `packages/preset-content/src/config.ts` 和生成相机表。继续由主体数据生成 SPECS，把 dev 的 50 项相机回正更新及 6 类动力飞行器 aircraftFlight 配置迁入 `config/presets/subjects.json`，重新生成消费文件。
- 保留 dev 的飞行控制、载具恢复、SDK 接口调整、Playground 与 Creator 更新。
- 更新对应基线校验；云端打包测试区分原始内容目录与宿主组合后的目录；新增 Node 测试同步进入 census 期望清单。
- library build 测试改在临时副本执行，不改写 Git 跟踪的 catalog 时间戳。测试截图、录像、临时凭据与输出包不提交。

## 本地验证

- Library validate、协议/客户端副本检查、44 项 Host 目录生成检查通过。
- TypeScript、ESLint、workspace boundaries、test census 通过。
- 资产库/协议/客户端/适配器/云端资产策略：62/62；Registry Host 编译与来源：4/4；云端 capsule 资产闭包专项：2/2。
- 全部 contract suite：806/811 通过；其中编码超时随后独立重跑，capture suite 15/15 通过。其余 4 项受 Windows 文件名换行和符号链接限制。
- Creator 工具、编译器、飞机骑乘、原始模型加载、飞机运行：132/137 通过；5 项均在 compiler boundary fixture 创建 Windows 符号链接时 EPERM。
- 广泛云端 Node 测试初次运行还有 python3 缺失、Linux 路径/符号链接假设及 Windows TS loader 路径限制，未将这些断言禁用或改成跳过。不能据此宣称完整 Linux 云端套件已验收。
- 新增临时 build fixture：6/6；运行时 prebuild 成功，runtimeHash=`257a9aeefde415dc46624c81d54ab08c7bb7add7e0bf60197cd274c8889b285e`。

## 云端使用

从本分支最新提交重新构建 Creator toolkit/runtime。旧 capsule 不会自动包含新资产库与接口；不要复用旧 source/runtime lock 冒充新构建。

Linux 环境先执行 `pnpm install --frozen-lockfile`，再执行 `pnpm assets:check`、`pnpm content:check`、`pnpm typecheck`、`pnpm test:contract` 和正常 runtime/capsule 构建。仓库 CI setup 已声明 Node、Python、FFmpeg 与 Playwright 依赖。

需要测试 HTTP Registry 时先 `pnpm assets:publish` 生成发布包，再启动 Registry；消费者指定可达的 `ASSET_REGISTRY_URL`，二进制独立部署时另设 `ASSET_ARTIFACT_BASE_URL`。尚未发布真实 CDN。

默认 Creator 资产准入策略未扩大；要复现人形与直升机用例，使用明确允许 `humanoid.uefn-mannequin` 与 `vehicle.helicopter` 的任务策略。此前人物＋直升机录像绑定的是合并前版本；本次 runtime 和 preset 改变后，旧运行证据不自动升级为新版本证据。
