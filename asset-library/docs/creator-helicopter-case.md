# 人物与直升机：Creator 资产调用验收（2026-09-18）

本次在 `codex/subject-library-demo` 现有 worktree 完成一个真实 Creator 用例。结果：修复直升机宿主接入后，Agent 能搜索、理解、加载并组合人形和直升机，执行上机、飞行、落地与下机，并通过正式 `world_submit` 提交。独立核对了输出、版本身份、行为轨迹、画面与资源切源。该结论仅覆盖本用例及锁定版本。

## 打开结果

- 本地入口：<http://127.0.0.1:3196/>；可运行场景：<http://127.0.0.1:3196/payload/playable/>。
- 固定输出：`outputs/creator-library-cases/human-helicopter-20260918/`。
- 原始提交：`creator-result.json`、`creator-delivery.tar.gz`、`payload/`。输出是构建/交付副本，不是第二套可编辑资产库。
- 录像：`payload/playtest/playtest.mp4`；完整轨迹：`payload/playtest/trace.json`。
- 精确资产与运行时：`payload/playable/project.assets.lock.json`。
- 独立验证：`evidence/independent-review.json`、`evidence/cdn-verification.json`。
- 可重新启动入口：`node packages/episode-pipeline/src/cli/preview-server.mjs outputs/creator-library-cases/human-helicopter-20260918 3196`。

## 本次证明了什么

| 项目 | 实测结果 |
| --- | --- |
| 初始失败 | Registry 有 vehicle.helicopter@0.1.0，但无 Whitebox adapter；默认 Creator 搜索不命中，显式准备报 THREE_ASSET_ADAPTER_REQUIRED。 |
| 最小接入修复 | 新建 vehicle.helicopter@0.1.1 元数据与绑定，复用 0.1.0 原始模型字节；引擎配置选择精确版本并组合现有操控/相机预设。 |
| Agent 发现 | MCP calls 0005/0006 search、0007/0008 describe，分别命中人形和直升机。describe 当前不直接暴露资产版本；最终精确版本由锁文件证明。 |
| 真实行为 | 31/31 输入步骤、518 个采样、移动 129.08 米；上机、飞行、转向、侧倾、落地、停转、下机、步行。最终直升机 grounded=true、throttle=0、速度约 0.0000068 m/s。 |
| 人物连续性 | 同一个 player root UUID 贯穿前后；无 continuity issues。第一人称期间 SDK 暂缓几何身份比较，返回外部视角后恢复；不能把这一观测误写为所有视角的完整几何证明。 |
| 画面 | 人形、驾驶员、主旋翼、尾旋翼、飞行与下机画面已复核；MP4 第 21 秒驾驶舱前窗可见。最终禁用了遮挡明显的可选肩后视角。 |
| 正式提交 | world_submit 0072/0073 返回 technicalStatus=passed；独立核验 196 个 payload 文件及归档 SHA256，另存 73 次 MCP 原始结果。 |
| 可迁移加载 | 78 个工件从独立本地 artifact origin 冷下载，全部长度/哈希匹配；关闭该 origin 后同一锁成功离线重放。 |

正式录像 61.139 秒、960×540、308 帧，无 page/runtime errors。输入活动时间约 55 秒；录像有前置时间，视频时间不等于输入轨迹 wallSeconds。没有进行五分钟持续回放，也没有遍历每个远端建筑。

## 本次发现并沉淀的接入规则

1. GLTFLoader 会把同名节点改成 `aircraft-rotor` / `aircraft-rotor_1`，原始名字保存在 `userData.name`。按原始节点名加出现序号绑定，不能只比较加载后的 name。
2. 初始/重置帧的 rotorPhases 可能为空。读取 `sample.vehicles[vehicleIndex]?.aircraft?.rotorPhases[index] ?? 0` 并检查有限数；否则把 undefined 写入旋转会产生 NaN，模型旋翼消失。
3. 尾旋翼保留模型父节点的轴向变换；视觉消费 SDK 已有物理相位，不增加第二个旋转时钟。

规则写入 `packages/creator-host/docs/agent/assets/vehicles/README.md` 和 `packages/creator-host/src/discovery/subject-guidance.ts`；相关测试在 `packages/three-world/src/assets.test.ts`、`packages/preset-content/src/assets/host-adapter.test.mjs`、`packages/creator-host/tests/integration/tool-usability.test.ts` 与 `asset-library/tests/whitebox.test.mjs`。

相关 adapter 8 项、library 27 项、loader 16 项、focused discovery 1 项检查通过；最终复核直升机两个定向测试通过。完整 tool-usability 在此 Windows sandbox 下有 15 项 esbuild 临时路径权限错误，不宣称整个仓库测试全绿。原始修复与复核记录见 `.superpowers/sdd/2026-09-18-human-helicopter-case/`。

## 精确版本证据及 Runtime unknown

本次内容：`humanoid.uefn-mannequin@0.1.0`、`vehicle.helicopter@0.1.1`。

| 身份 | SHA256 / 版本 |
| --- | --- |
| Registry snapshot | 5b2ac2bba385d6614c28b80a5b3526442d26c8583d5db7e802788c0b7eb3eeb3 |
| Asset lock | d96805624b8a805e5eee6b20db753a3ac828545a3716e12af4fde09967e857cc |
| Runtime bundle | cf7057a244d7adc9d85de5de1f4394746c9ca41ac60341ba84e2dd5d15f7d8ad |
| Adapter | @worldkit/preset-content@0.0.0 |
| Preset composition | 5cc07ae5b27d7e5d4b407b6576df48f314e088494b4b059b160d19b55308b20d |
| Project overrides | 439fa12338d5c4402f08c0d95fb0c6b97530a414496b4f4b8883a8a7f4bde1aa |
| World build | 1425454d03333ad3be0ac673e5880965c732ff8a3ec41cb6bdf993c1d5b27f5c |
| Episode | 1276b9502030bb68287216a20f97b9c7553b50952753487a90d9c5edb1855318 |
| Archive | c572b45e7454a342e47f0844305be83233637854c63ac7e4f42f8c44c2631bb8 |

`unknown/not_run` 表示尚无对应组合的已登记运行证据，不等于损坏或不能加载。模型格式正确、可以预览，并不能证明上机挂点、动作、旋翼与宿主物理正确。本次问题就是区别的实证。

本次已生成外部 case evidence，包含 manifest_digest、runtime_digest、adapter_version、preset_digest、overrides_digest，以及源文件、轨迹、录像和包哈希；**尚未把它登记到 Registry 的兼容性证据索引**。因此构建时锁内 compatibility=unknown 是真实历史状态，保留不改。Registry 发布版本不可变，不能覆盖原版本 validation 文件或把整个库标为 verified。后续应将精确匹配的测试结果作为新增证据发布，供兼容性查询引用。当前 SDK 允许 unknown 进入测试；明确 incompatible 或缺少 adapter 是另一类阻断。

## Harness 与策略边界

本地 standalone Codex CLI 未登录，因此使用全新原生 Codex 子 Agent，通过受控 localhost bridge 连接真实 Creator MCP Stdio 服务。它自行读文档、搜索资产、编写用例、调用检查与提交；父任务只做资产接入、基础环境、最终独立验收。保留的是完整 MCP 调用轨迹，不宣称 standalone CLI 或 Linux 云调度已验收。

测试策略只允许上述两个 ID，禁用 custom assets。默认生产策略未改，仍不包含直升机。测试时源码资产目录配置为不存在路径，通过 Registry 和本地缓存准备内容，证明不依赖工程源码目录回退。FFmpeg/ffprobe 仅安装在本任务输出环境，未改系统 PATH。

## 后续入库建议

继续建设骨骼语义、动作槽、挂点和能力标签，但按需要的主体建立最小可用闭环：先能发现与预览，再支持实际所需动作与交互，最后验证。强编码能力可以减少标注劳动，不能自动把猜测变成事实。

批处理建议：提取原始骨架拓扑/姿态/单位/轴向/clip 清单 → 按骨架家族归组并匹配已有模板 → 自动建议语义映射、动作槽、挂点、能力及置信度 → 高置信度应用、低置信度保留 unknown → 批量加载/行为验证并归档证据。动作名存在不等于动作可用，挂点坐标存在不等于交互已验证；不同种类只补适用字段。

完整统一骨架标准可在样本增多后沉淀。现在必须保留稳定 ID/版本、来源许可、原始文件与哈希、原始骨骼名/层级/局部变换、坐标与单位、动作范围；否则之后无法可靠批量处理。优先选人形、四足、载具等代表主体跑通家族模板，不先人工填满全库，也不只堆模型数量。

本次未部署 CDN。下一步可部署 Registry API 和对象存储/CDN，配置独立 ASSET_REGISTRY_URL / ASSET_ARTIFACT_BASE_URL，并用同一锁重跑云端冷启动验收。无需等待全库骨骼标准化，但真实域名、CORS、权限、缓存和生产 Creator 策略仍需上线验证。
