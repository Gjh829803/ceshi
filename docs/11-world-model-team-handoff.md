# 世界模型团队接入说明

## 1. 当前交付是什么

本仓库交付的是确定性白模世界 SDK 和 Playground，不包含世界模型实现。当前
Canonical Authoring V4 已能编译到 Babylon/Havok Runtime，并提供 Runtime Snapshot V4、
Browser Protocol V5、单截图和五 Pass Control Capture Bundle；生成式视频链路尚未实现。
Catalog、artifact-only 和 Canonical Authoring 页面共享同一 Babylon/Havok Runtime 边界，
新接入协议真相仍是 Canonical Schema、CLI 和 Browser Protocol。

世界模型团队可以运行现有样例理解白模世界中的地形、主体、相机、动作、语义和
稳定 ID。当前优先目标不是立刻追求实时最终画质，而是评审并冻结
`SimulationTake → ControlCaptureBundle → ValidationReport` 的最小离线制品契约，
再制作确定性数据导出样例。

`grassland` 还保留旧 Plan-first 创作样例：结构化 `WorldSpec / WorldPrompt / Entity
Catalog`、规划图、冻结锁、SDK 派生的 Top-down/Height-Slope 工件和白模三视图。
这些可以作为迁移 Fixture 和构图/身份证据，但不得覆盖 Canonical Runtime 中的
Camera、Entity Transform、Collision 或可通行性真相。

## 2. 双方职责

| World SDK 团队 | World Model 团队 |
|---|---|
| 决定 Entity、Transform、Camera、Physics、Action 和语义真相 | 根据条件生成最终 RGB 画面 |
| 输出稳定 ID、Simulation Take 和已验证控制通道 | 保持主体身份、数量、位置、轮廓、动作和镜头一致 |
| 玩家输入与模拟不等待模型 | 接受异步帧率、延迟与条件 revision |
| 逻辑变化经 World Command 提交 | 纯视觉变化经 Render Directive 表现 |
| 模型失败时提供白膜/降级画面 | 不反向决定碰撞、导航和玩法结果 |

## 3. 建议的最小接入顺序

### WM-0：冻结坐标、相机和身份约定

- Canonical Runtime 使用右手坐标、Y-up、`-Z` Forward；引擎内部对象不进入协议。
- 明确 Depth 米制语义、Near/Far、World Normal、Pixel Origin 和 Camera Matrix Profile。
- 冻结 `entityId`、Stable Instance ID 与 Semantic Class ID 的生命周期和映射表。
- 只使用 `simulationTick`、`renderFrameIndex`、`captureFrameIndex` 三个明确计数器。

### WM-1：离线 Simulation Take 与 Control Capture Bundle

第一版必需 Pass/元数据：

```text
ControlCaptureFrame
├── neutral-color
├── linear-depth-meters
├── semantic-class-id
├── instance-id
├── world-normal
├── Camera Snapshot / Matrix Profile
├── Simulation Tick / Render Frame / Capture Frame
└── Snapshot / Event / Action / Relationship Receipt
```

先固定一个 WorldPackage 和两个不同 Simulation Take，导出不可变 Bundle、映射表、
Manifest、Hash 和 Evidence。两个 Take 复用同一世界但拥有不同 Take/Bundle Hash，先
验证数据语义、帧归属和 Replay，再进入模型适配。

### WM-2：实验 Video Model Adapter

- Adapter 只消费通过 Gate 的 Control Capture Bundle。
- 模型专属边缘图、Depth 归一化、Tensor、Prompt 和参数不进入 Canonical Schema。
- 输出记录 Adapter Profile、Provider/Model、输入 Bundle Root 和 Provenance。
- 先评估 Region/Anchor、Instance、接触、遮挡、运动方向和长时漂移。

### WM-3：后续实时异步接入

- SDK 模拟保持固定步长。
- Render Bridge 按独立频率提交条件帧。
- 世界模型返回带 source tick/revision 的生成帧。
- 显示合成层处理延迟、过期帧、重投影和降级。

### WM-4：Runtime Render Directive

增加材质、颜色、天气、氛围和风格等纯视觉指令。Directive 经过 SDK 通道记录和绑定，但不修改碰撞世界。

## 4. 近期需要共同决定的问题

1. 五个必需 Pass 的首版 Capture Encoding Profile：位宽、端序、压缩、背景值和 Preview。
2. Camera Matrix Profile 是否同时提供 Graphics 与 OpenCV Adapter，避免消费者猜转换。
3. Motion Vector 和 Skeleton/Pose 在哪个阶段进入可选 Profile；Semantic Action 是否已足够。
4. Bundle 分辨率、FOV、Overscan、总 Bytes 和捕获时长预算。
5. 模型输出结构一致性使用哪些确定性 Metric，哪些 VLM 指标只能 Advisory。
6. Appearance/Reference 资产如何引用，同时处理权限、许可证、生命周期和缓存。
7. 实时阶段如何处理快速转头、遮挡揭示、模型延迟、过期帧和降级。

## 5. 当前仓库可用于接入的部分

- `packages/authoring`、`packages/compiler`、`packages/contracts`：当前 Canonical Authoring、Normalized IR、Resource Lock 与编译底座。
- `packages/runtime-babylon`、`packages/runtime-contracts`：当前 Canonical Babylon/Havok Runtime、ExecutionPlan、Session 与 Port。
- `apps/playground/src/main.ts`、`packages/runtime-contracts` 与 `scripts/cli/worldkit.ts`：Browser Protocol、Snapshot、截图和 CLI 入口。
- `apps/playground/src/babylon-world-adapter.ts` 与 `babylon-artifact-renderer.ts`：当前
  gameplay、catalog、Opening Composition、planning capture 和 tri-view Runtime 入口。
- `packages/world`：Terrain、Water、Landmark、FeatureRegistry、规划工件和场景 DSL；只输出
  引擎无关数据。
- `packages/world/src/world-spec.ts` 与 `planning-artifacts.ts`：创作意图、WorldPrompt、Entity Catalog、证据来源、进入镜头和真实地形规划工件。
- `apps/playground/public/scene-plans/grassland/` 与 `artifacts/scenes/grassland/`：当前规划图片、白膜三视图、冻结锁和可重复导出的结构化样例。
- `packages/subject-registry`、`packages/subject-composition`、`packages/subject-actions`：主体、
  组合、资产和动作语义；`packages/camera` 提供命名 Profile/Context/Preference 与纯选择，
  尚未接入最终 Runtime Pose。
- `assets/humanoid/action-manifest.json`：动作语义清单；不包含可再分发的人形资产。
- `window.__WHITEBOX_PLAYGROUND__` automation API：快照、固定输入、普通截图、WorldSpec/规划工件/三种规划视图、语义构图 Mask/评分，以及 Prototype 查询和白膜三视图捕获/导出入口。

## 6. 当前缺口

仓库已经实现 Simulation Take V1、固定 Tick/Capture Schedule、五 Pass、Control Capture
Bundle、Integrity 和首条 Validation Capture/Integrity Report；仍未实现：

- 完整 Replay/Resume、Motion Vector、Event/Action/Relationship Receipt 和视频级长序列 Gate。
- 正式 Instance/Semantic Table 与 Appearance/Reference 资产接入协议。
- Visual Bible 当前只落地了输入/输出工件门禁；样式三视图尚未转换成正式运行时 `AppearanceManifest`。
- 实时传输、模型服务客户端和生成帧回传。
- 重投影、插帧、异步合成与白膜降级 UI。
- Render Directive Gateway。

因此当前共享代码的目的，是让双方基于同一份确定性世界评审并实现控制制品契约，
而不是把现有截图、五 Pass 窄切片或 catalog Playground 当成世界模型接入完成品。

## 7. 本地运行与验证

```bash
pnpm install
pnpm worldkit run examples/authoring/package-subject-world.json
pnpm dev # Babylon catalog Playground
pnpm test
pnpm typecheck
pnpm build
```

详细实验状态见 [当前实验与验证记录](10-current-experiments.md)，完整目标契约见
[世界模型渲染与控制制品契约](04-render-contract.md)、
[Simulation Take 与 Control Capture Bundle](../docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md) 和
[World Validation Report 与质量门禁](../docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)。
