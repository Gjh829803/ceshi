# Creator Harness 首批优化结果

分支 `codex/harness-authoring-feedback`，基线 `e39f8805`。
实现提交：`9c265661`（身份和展示语义）、`3deccaef`（声明与错误反馈）。

## 已实现

- Training 方法声明通过 AST 生成，移除实现默认值，保留正确参数类型、可省略性和公开重载。`Math.PI`、`Number.EPSILON`、`!0` 等默认值按静态类型处理；无法解析的导入默认值只将对应声明标为 unavailable，其他声明和指南继续返回。没有执行作者初始化表达式或增加声明打包层。
- 场景初始化错误在导航前采集，与 Host 私有 bridge RPC 错误分别处理。可用的 SDK code/category/phase/entityIds/suggestedAction、原始 stack/cause 和 Host 阶段/candidate 身份进入原 operation。
- 辅助诊断读取失败不阻断正常就绪、不覆盖原始失败。浏览器 launch/context/page 失败清理已创建资源；查询原失败 operation 不重新打开浏览器或重做动作。
- `addEntity` 的 role 拒绝保留原条件和错误码，增加实体 ID、实际值/类型及修复说明。非法输入不留下已注册对象；没有改物理或运行状态语义。
- materialize 新建/已存在路径统一返回 `runtimeSourceHash`；gallery 不再把墙钟值写作 `simulationSeconds`；prepared 和 approach 的展示准确表达请求准备与重定位。
- 工具说明明确 preview/triview 的 reset/暂停效果、playtest 技术结果与完整性的区别、时长参数三种行为、视频采样频率，以及 submit 只生成本地交付包。

主要入口：[声明提取](../../scripts/three-creator/authoring-schema.ts)、[错误序列化](../../scripts/three-creator/diagnostic-serialization.ts)、[Host 生命周期](../../scripts/three-creator/tools.ts)、[错误恢复指引](../../scripts/three-creator/tool-errors.ts)、[SDK role 检查](../../packages/three-world/src/world.ts)、[当前 Creator 用法](../../scripts/three-creator/README.md)。

## 验证

| 检查 | 结果与范围 |
| --- | --- |
| 首次集成验证 | 7 文件、133 项通过，76.92 秒；覆盖 SDK World、Creator 工具/源码/身份和 Episode adapter |
| 最后受影响复验 | 声明、workspace guidance、工具可用性 3 文件、49 项通过，51.80 秒；包含 `!0` 修正和严格索引访问修正后的代码。这 49 项与上行重叠，不相加 |
| gallery Python | 25 项通过；覆盖导出指标与既有交付校验 |
| TypeScript | 最终源码 `pnpm typecheck` 通过 |
| Test census | 74 个测试文件分配通过：25 contract、49 resource-heavy |
| Workspace boundary | Three boundary 与 workspace floor 通过，0 debt entries |
| Runtime prebuild | three-sdk 构建成功，具体字节身份见下节 |
| 展示与语法 | gallery JS/Python 语法检查通过；执行实际生成的 Episode report JS，最终 prepared 文案只显示一次，providerVideoSubmissionCount 保持 0 |
| 独立源码审查 | 命名/SDK 拒绝、声明、Host 错误分项及整分支复审通过，已关闭发现的问题 |

复现主要检查：

```sh
pnpm exec vitest run scripts/three-creator/authoring-schema.test.ts scripts/three-creator/runtime-guidance.test.ts scripts/three-creator/tool-usability.test.ts scripts/three-creator/tools.test.ts scripts/three-creator/workspace-runtime.test.ts packages/three-world/src/world-v2.test.ts scripts/three-episode/adapter.test.ts --maxWorkers=1 --minWorkers=1
python3 scripts/cloud/prepare-three-evaluation-site.test.py
pnpm typecheck
pnpm test:census
pnpm verify:workspace-boundaries
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/harness-first-batch/runtime
git diff --check
```

新增回归先复现了 TS2371、错误上下文丢失、辅助诊断阻断启动、阶段覆盖、Proxy 序列化失败和 `!0` 类型误判，再验证修复。没有通过调大既有测试超时或放宽执行/交付条件来通过检查。

## Runtime 字节身份

本地输出：`.codex-tmp/harness-first-batch/runtime/runtime-manifest.json`。

- runtimeHash：`6a2cd2c71f510aaf440c7e405faa5f74e0a3592b27bbd189b727749c0990fd4b`
- manifestSha256：`a4ce98ad4d1fdb68a894e5da16be812b755c983d731bfd75322160e2e17bf9f5`
- `runtime/worldkit-three.js` SHA-256：`9178c49fc9d902b544c593924ef479812e223f30023fb5b6a2fb25aaf14bf5ee`

这些值对应本地实际构建，未部署到任何生产运行环境。

## 当前分支补充

- 已合入 `origin/main` 的 `227c7ebf`，包含 `world_preview({view:'current'})` 与相机创作/构图反馈。合并提交 `0d5f988c` 保留准确的暂停和 reset 说明。
- `createWorld` 摘要使用真实 `WorldOptions` 和 `ThreeWorld` 类型，参数可省略。真实 SDK 类型消费测试覆盖无参数、部分选项、完整配置和非法输入；workspace SDK 继续不暴露 Host factory 摘要。
- `targetResults` 增加最近采样的位置、时间、原始 trace 索引、目标减人物的 XYZ 差值及容差外距离。复用录制样本，保留原接近度判定；没有新增录制、采样或提交门禁。具体字段见 [Creator 用法](../../scripts/three-creator/README.md#real-input-episodes)。
- 增量验证：Creator 声明、工具、workspace guidance 共 3 文件 80 项通过；包含真实浏览器输入、未到达目标仍可技术交付，以及测量值随交付保留。Gallery 25 项、unpack 8 项通过；typecheck、test census 和 runtime prebuild 通过。
- 增量 runtime 输出 `.codex-tmp/harness-target-feedback/runtime`，runtimeHash 为 `9f1ca85ee65cf77958d5effd1c31f6a694277f653a1c1a95da974d39e67fbf64`，与 main 合入后相同；本轮只改 Host 摘要和结果反馈。
- `recordingReadiness` 在自检返回时列出已有录制条件与缺项，绑定录制 operation、world/episode 身份和检查时间。它只评价该份录像；submit 仍重新检查当前身份、文件和既有门禁。没有历史录像选择或复用。
- [生成指令](../../scripts/cloud/three-eval-instructions.md) 明确公开指南优先、按具体问题查源码、当前视角与开场区别、全计划自检及完成覆盖后的交付路径。已核对云 runner 读取此文件；原本机 runner 是否消费该文件尚未确认。
- 上述收尾改动验证：Creator 工具及可用性 2 文件 86 项、云契约 20 项（外部传输 mocked）、gallery 25 项、unpack 8 项通过；云契约包含 Python 回归调用，不将这些数字加总。typecheck、test census、文档链接与源码核对、独立审查通过；`.codex-tmp/harness-recording-readiness/runtime` 预构建身份与上行一致。
- `d4d694e3` 上完成一次本机 Codex CLI 同名参考图试跑：GPT-6 Astra / xhigh，进程耗时 11 分 25.7 秒，交付操作结束于 11 分 5.3 秒，首次成功预览 6 分 10.8 秒。发生 2 次预览失败，执行 1 次短调试和 1 次完整录制；原生视频及 188 个归档文件的 hash 闭包校验通过。该试跑未经过原测试平台，完整提示词与原单不同，不能作为严格 A/B 或稳定提速证明。
- 试跑暴露的碰撞预算错误码、实体定位与修复建议问题已在后续补丁处理；具体最终源码与验证见 [碰撞预算诊断](2026-09-09-creator-collision-budget-diagnostics.md)。上述模型试跑不覆盖此后补丁。

## 尚未覆盖

没有运行完整 CI、云端独立测试 gate 或 Seedance 作业。单次同名参考图试跑不能证明可归因的端到端耗时/成功率改善；源码审查和工程回归不等同于场景视觉验收。

已在本机下载目录找到 `004_solar_fire_skimmer.png`，用于上述新试跑。原本机运行 `run-mtti9598-6cb1a4 / world-09090254-6d57` 的平台入口、完整需求、启动参数和事件产物仍未取得，原图 hash 也未核对，因此严格同用例对照及卡片开始/完成时间修复未执行。

工作区即时交付状态、完整尝试/证据选择、短等待、默认输出裁剪，以及输入通道/工具名整体迁移仍是后续范围，见 [命名审查](2026-09-09-creator-api-naming-audit.md)。
