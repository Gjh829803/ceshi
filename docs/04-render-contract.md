# 世界模型渲染契约

> 状态：Design。当前 Playground 没有实现多 pass Render Bridge，也没有连接实时世界模型；本地 WebGL 画面只是白膜预览。近期协作计划见[世界模型团队接入说明](11-world-model-team-handoff.md)。

## 1. 定位

实时世界模型是视觉渲染器，不是游戏状态模拟器。白膜运行时持续输出确定性的空间和语义条件，世界模型生成最终画面。

## 2. 每帧输出

建议 Render Bridge 支持：

```text
RenderFrame
├── Whitebox RGB
├── Depth
├── World Normal
├── Instance ID
├── Semantic ID
├── Motion Vector
├── Pose / Skeleton
├── Camera Intrinsics
├── Camera Extrinsics
├── Entity Action State
└── Appearance Manifest
```

未来开始接入实时世界模型时，最小可先打通：

- 白膜 RGB
- Depth
- Instance ID
- Camera State
- Entity Semantic / Appearance Manifest
- 人形 Action State

## 3. Entity 渲染绑定

```ts
type AppearanceBinding = {
  prompt: string;
  reference?: string;
  semantic?: string;
  identityPersistent?: boolean;
  preserveSilhouette?: boolean;
  allowSurfaceVariation?: boolean;
};
```

每个实体必须具有跨帧稳定的 `entityId` 和 `instanceId`。同一个主体在骑乘、进入载具或切换控制权时，其身份不能被重新分配。

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

## 5. 实时运行方式

白膜模拟、白膜渲染和生成式渲染应异步运行：

```text
物理和游戏逻辑：固定高频更新
白膜渲染：跟随显示刷新
生成式渲染：按模型能力异步输出
最终显示：重投影、插帧或局部更新
```

玩家输入永远不等待世界模型。世界模型超时或失败时，可以暂时显示白膜、上一帧重投影结果或降级渲染结果。

## 6. 摄像机快速转动

快速转头会暴露上一帧不存在的区域，是实时生成的主要风险之一。可预留：

- 更宽 FOV 的条件缓冲
- Overscan 生成区域
- 深度重投影
- 运动向量
- 缺失区域快速补全
- 下一完整生成帧替换

这些属于 Render Bridge 和显示合成层，不应污染主体运动逻辑。
