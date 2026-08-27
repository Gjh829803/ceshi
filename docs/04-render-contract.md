# 世界模型渲染与控制制品契约

> 状态：Design。当前 Canonical Runtime 尚未实现多 Pass Control Capture Bundle，也
> 没有连接世界模型；本地画面只是白模预览。字段、Hash、时间和目录的权威设计见
> [Simulation Take 与 Control Capture Bundle](../docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)，
> 质量验收见 [World Validation Report 与质量门禁](../docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md)。

## 1. 定位

世界模型是视觉实现，不是游戏状态模拟器。白模运行时输出确定性的空间、物理、
身份、动作和 Camera 条件，世界模型生成最终画面。

第一条生产链路优先使用不可变离线制品，而不是先冻结实时网络协议：

```text
WorldPackage
  → SimulationTake
  → RuntimeSession
  → ControlCaptureBundle
  → VideoModelAdapter
  → GeneratedVideoArtifact
```

世界、一次操作/拍摄、执行实例、实际控制帧和模型输出各自版本化并哈希。实时
Render Bridge 是未来对同一语义的流式 Adapter，不另建一套字段真相。

## 2. 每帧控制输出

每个 Control Capture Frame 的必需 Pass：

```text
ControlCaptureFrame
├── Neutral Color
├── Linear Depth Meters
├── World Normal
├── Instance ID
├── Semantic Class ID
├── Camera Intrinsics
├── Camera Extrinsics
├── Simulation Tick / Render Frame / Capture Frame
├── Snapshot / Event / Action / Relationship Receipt
└── Pass Artifact Hashes
```

可选 Pass/Track：

- Motion Vector Pixels；
- Albedo、Material Properties 和 Lighting；
- Pose/Skeleton；
- Collision/Height/Slope Debug；
- Appearance/Reference 资产与 Semantic Action Track。

可选能力必须通过 Capture Profile/Capability Discovery 声明。第一版不能因某个模型
暂时不用 Depth/Normal 就把必需 Pass 从合格 Bundle 中删除。每帧必须明确绑定唯一
Package Root、Take Hash、Runtime Session、Simulation Tick 和 Camera Snapshot。

## 3. Entity 渲染绑定

```ts
type AppearanceBinding = {
  id: string;
  kind: "appearance-binding";
  appearancePrompt: string;
  referenceAssetRefs: readonly ResourceRef[];
  semanticClassId: string;
  identityPersistenceEnabled: boolean;
  silhouettePreservationEnabled: boolean;
  surfaceVariationAllowed: boolean;
};
```

每个实体必须具有跨帧稳定的 `entityId` 和 `instanceId`。同一个主体在骑乘、进入载具或切换控制权时，其身份不能被重新分配。`instance-id` 与 `semantic-class-id` 的像素值必须存在于 Bundle 的稳定映射表中。

## 4. 世界模型自由度

世界模型可以自由生成：

- 材质和纹理
- 光影和色彩风格
- 毛发、布料与表面细节
- 非关键背景细节
- 粒子、天气和氛围

世界模型必须尽量保持：

- 关键主体的位置、朝向和数量
- 可交互对象的位置
- 地面、墙体和大型障碍物轮廓
- 镜头视角和透视关系
- 主体动作语义
- 标志物方向和相对尺度

运行时用户请求分为两条通道：

- 颜色、材质、画风和非交互细节使用 `Render Directive`，经 SDK 的 Directive/Render Bridge 通道记录后由世界模型表现。
- 大小、位置、数量、碰撞、动作和 NPC 行为使用 `World Command`，必须先由白膜运行时提交，再通过新 revision 传给世界模型。

世界模型不能因为一句视觉提示自行移动、删除或复制逻辑 Entity。运行时 Director 的完整边界见 [运行时世界导演与受控世界操作协议](09-runtime-world-director.md)。

## 5. 验证与模型 Adapter

Control Capture Bundle 在交给模型前必须通过版本化 Validation Profile：

- 帧数、必需 Pass、分辨率和 Encoding Profile 完整；
- Depth 单位、Camera Matrix 和坐标约定明确；
- Semantic/Instance ID 集合合法且跨帧稳定；
- Tick/Render/Capture Frame 映射与 Take 一致；
- Package/IR/Plan/Lock/Take/Session Hash 归属唯一；
- Bundle Root 与文件完整性通过。

模型专属边缘图、深度归一化、Tensor、Prompt 和 Provider 参数只存在于
`VideoModelAdapter`。生成结果是派生 Artifact，不能写回 Runtime Snapshot 或改变
Gameplay 真相。结构 Gate 失败不能被视频美学分数覆盖。

## 6. 后续实时运行方式

白膜模拟、白膜渲染和生成式渲染应异步运行：

```text
物理和游戏逻辑：固定高频更新
白膜渲染：跟随显示刷新
生成式渲染：按模型能力异步输出
最终显示：重投影、插帧或局部更新
```

玩家输入永远不等待世界模型。世界模型超时或失败时，可以暂时显示白膜、上一帧重投影结果或降级渲染结果。

流式协议必须复用 Bundle 的 Pass ID、Camera、坐标、Tick 和身份约定，并使用
Receipt/Render Ready 形成背压；它不能以墙钟延时或到达顺序建立世界状态。

## 7. 摄像机快速转动

快速转头会暴露上一帧不存在的区域，是实时生成的主要风险之一。可预留：

- 更宽 FOV 的条件缓冲
- Overscan 生成区域
- 深度重投影
- 运动向量
- 缺失区域快速补全
- 下一完整生成帧替换

这些属于 Render Bridge 和显示合成层，不应污染主体运动逻辑。
