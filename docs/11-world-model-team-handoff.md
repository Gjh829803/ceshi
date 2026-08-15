# 世界模型团队接入说明

## 1. 当前交付是什么

本仓库交付的是确定性白膜世界 SDK 和 Playground，不包含实时世界模型实现。目前 Three.js 只渲染本地白膜预览；UI、截图和 Water shader 都不代表生成式渲染链路已经接通。

世界模型团队可以直接运行四个样例场景，理解白膜世界中的地形、主体、相机、动作、语义和稳定 ID。当前优先目标不是立刻追求最终画质，而是共同冻结最小 RenderFrame 契约并制作离线数据导出样例。

`grassland` 还提供完整的多 Agent plan-first 样例：结构化 `WorldSpec / WorldPrompt / Entity Catalog`、Codex imagegen 的全局俯视规划图与进入视角图、冻结锁、SDK 从真实白膜派生的 Top-down/Height-Slope 工件，以及人物/高塔的唯一颜色正/右/后三视图。规划图和后续样式图可以成为构图与身份条件，但不得覆盖白膜中的相机、Entity 位置或可通行性真相。

## 2. 双方职责

| World SDK 团队 | World Model 团队 |
|---|---|
| 决定 Entity、Transform、Camera、Physics、Action 和语义真相 | 根据条件生成最终 RGB 画面 |
| 输出稳定 ID 和条件缓冲 | 保持主体身份、数量、位置、轮廓、动作和镜头一致 |
| 玩家输入与模拟不等待模型 | 接受异步帧率、延迟与条件 revision |
| 逻辑变化经 World Command 提交 | 纯视觉变化经 Render Directive 表现 |
| 模型失败时提供白膜/降级画面 | 不反向决定碰撞、导航和玩法结果 |

## 3. 建议的最小接入顺序

### WM-0：冻结坐标、相机和身份约定

- Three.js 右手坐标系；运行时人形正前方为 `-Z`。
- 明确深度单位、near/far、法线空间和相机矩阵布局。
- 冻结 `entityId`、`instanceId`、`semanticId` 的生命周期。
- 确定条件帧与最终帧的时间戳、tick 和 world revision。

### WM-1：离线 RenderFrame 导出

最小字段：

```text
RenderFrame
├── whiteboxRgb
├── depth
├── instanceId
├── cameraIntrinsics
├── cameraExtrinsics
├── entityManifest
└── actionState
```

先从固定相机、固定轨迹导出 PNG/二进制数据和 JSON manifest，验证数据含义，再进入实时传输。

### WM-2：实时异步接入

- SDK 模拟保持固定步长。
- Render Bridge 按独立频率提交条件帧。
- 世界模型返回带 source tick/revision 的生成帧。
- 显示合成层处理延迟、过期帧、重投影和降级。

### WM-3：Runtime Render Directive

增加材质、颜色、天气、氛围和风格等纯视觉指令。Directive 经过 SDK 通道记录和绑定，但不修改碰撞世界。

## 4. 近期需要共同决定的问题

1. 世界模型最小必需条件：RGB + Depth + ID 是否足够，是否第一版就需要 Normal、Motion Vector 和 Skeleton。
2. Instance/Semantic ID 的位深、编码与抗锯齿策略。
3. 人形动作应传语义状态、骨骼矩阵，还是两者都传。
4. 条件缓冲的分辨率、overscan、FOV 和传输格式。
5. 快速转头、遮挡揭示和模型延迟下的显示策略。
6. Appearance Manifest 如何引用用户图片，同时处理权限、生命周期和缓存。
7. 世界模型输出未保持关键几何时，如何检测、降级和记录 bad case。

## 5. 当前仓库可用于接入的部分

- `apps/playground/src/sdk-world-adapter.ts`：当前真实 World/Physics/SubjectKit/Scene 编译链路，也是规划视图和后续 Render Bridge 的实验接入点。
- `packages/core`：World、Entity、Transform、Input 和固定更新。
- `packages/world`：Terrain、Water、Landmark、FeatureRegistry 和场景 DSL。
- `packages/world/src/world-spec.ts` 与 `planning-artifacts.ts`：创作意图、WorldPrompt、Entity Catalog、证据来源、进入镜头和真实地形规划工件。
- `apps/playground/public/scene-plans/grassland/` 与 `artifacts/scenes/grassland/`：当前规划图片、白膜三视图、冻结锁和可重复导出的结构化样例。
- `packages/subjects`、`packages/camera`、`packages/animation`：主体、相机和动作状态。
- `assets/humanoid/action-manifest.json`：动作语义清单；不包含可再分发的人形资产。
- `window.__WHITEBOX_PLAYGROUND__` automation API v2：快照、固定输入、普通截图、WorldSpec/规划工件/三种规划视图，以及 Prototype 查询和白膜三视图捕获/导出入口。

## 6. 当前缺口

仓库尚未实现：

- 多 pass Render Bridge 与 GPU readback。
- Depth、Normal、Instance ID、Semantic ID 和 Motion Vector 导出。
- 正式 `EntityManifest / AppearanceManifest` 序列化协议。
- Visual Bible 当前只落地了输入/输出工件门禁；样式三视图尚未转换成正式运行时 `AppearanceManifest`。
- 实时传输、模型服务客户端和生成帧回传。
- 重投影、插帧、异步合成与白膜降级 UI。
- Render Directive Gateway。

因此当前共享代码的目的，是让双方基于同一份确定性世界实现契约，而不是把现有 Playground 当成世界模型接入完成品。

## 7. 本地运行与验证

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

详细实验状态见 [当前实验与验证记录](10-current-experiments.md)，完整目标契约见 [世界模型渲染契约](04-render-contract.md)。
