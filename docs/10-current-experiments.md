# 当前实验与验证记录

> 状态日期：2026-08-15。本文只记录当前仓库中可以运行或已经验证的事实，不描述远期目标 API。

## 1. 实验目的

当前实验要回答六个问题：

1. 第三人称人形的移动、物理、动作和镜头能否由一个稳定 SubjectKit 统一提供。
2. Coding Agent 能否只写场景模块，不改 SDK 内部，就创建不同的室外白膜世界。
3. 大地形分块能否保持视觉高度、物理高度和边界采样一致。
4. 场景中的地形、水体和标志物能否追踪到 Feature、参数、seed 和资源所有者。
5. 图片参考能否被转译成可玩的白膜空间构图，而不是把纹理和视觉细节错误建成碰撞几何。
6. Coding Agent 能否先把输入扩展为可追踪的整个世界和进入视角，再用两张规划图与 SDK 实测工件闭环，而不是直接猜几何。

## 2. 当前 Playground 场景

| URL 参数 | 实验内容 | 已证明的能力 | 必须避免的误读 |
|---|---|---|---|
| `?scene=grassland` | 640m × 640m base-plain 地形、西北低缓塔岭、大湖和高塔 | relief 预设、显式地貌区域、分块高度场、LakeFeature、复合标志物、第三人称主体；首个完整 WorldSpec/World Plan/Opening Shot/Height-Slope 样例 | 两张生成规划图是空间意图，不是物理真相；本地水面也不是世界模型效果 |
| `?scene=canyon` | 自定义峡谷、Polygon 河流和石拱 | Coding Agent 可用 BuildContext 定义 SDK 未预置的地貌名词 | 河流没有流体模拟，blocked/swimmable 仍主要是语义契约 |
| `?scene=azure-bay` | 南侧高地俯瞰海湾、两侧海岸、岛状轮廓、灯塔、村落和帆船 | 单图构图转译、自定义地形、Polygon 水体、初始镜头构图、连续可走下坡 | 岛状轮廓来自同一地形 Feature 的塑形，并非独立 Island Feature；不重建花海、云层和绘画风格 |
| `?scene=mistbound-rider` | 山谷、道路式区域、废墟、村落、城堡和远景天体 | 更复杂的自由 Feature/标志物组合和语义提示 | 马与骑手是静态几何标志物，不代表骑马主体已实现 |

运行方式：

```bash
pnpm install
pnpm dev
```

然后打开 `http://127.0.0.1:5173/?scene=<上表参数>`。

## 3. 针对近期反馈做过的实验

| 反馈 | 当前处理 | 验证状态 |
|---|---|---|
| W 前进方向与人物朝向相反 | 统一运行时前进轴为 `-Z`，Mixamo `+Z` 资产正面在加载层校正 | SubjectKit 单测覆盖运动方向；仍需每个新资产做视觉 QA |
| 镜头离人物过远 | 第三人称默认距离下调，并允许场景在 `1.8..8m` 内设置初始距离 | 参数校验和镜头单测已覆盖 |
| 地图太小 | 默认草地扩展为 4 × 4 个 160m tile，即 640m × 640m | 场景编译测试已覆盖 |
| 水体奇怪 | 增加专用 WaterBody/Lake：湖盆、岸带、水位、浅深色、菲涅尔和轻微波纹 | 功能已运行；最终水质仍由世界模型负责 |
| ↑/↓ 视角方向反 | 输入语义统一为“↑ 向上看、↓ 向下看” | 固定输入 Smoke 同时验证两个方向 |
| 角色在不平地面上带动镜头颠簸 | 固定物理步长插值、接地高度平滑和镜头竖直抖动过滤 | 单测/Smoke 覆盖数值稳定性；主观手感仍需持续人工回归 |
| 所有地形都过度起伏 | 增加 `flat/plain/hills/mountains`，要求按用户场景选择 | API、场景规则和测试已覆盖 |
| 不可爬坡面没有定义 | 人形 42° 最大爬坡、48° 自动滑落，主路线建议 ≤35° | 出生点坡度检查；Azure Bay 路线测试覆盖 ≤35° |
| 分块地形出现缝或高差 | 分块使用世界坐标采样；渲染网格和 Rapier 高度场复用同一高度数据 | 自动测试验证高度/物理对齐；像素级接缝仍需浏览器截图回归 |

## 4. 2026-08-15 自动验证结果

```text
pnpm test         16 test files / 84 tests passed
pnpm test:scenes  2 test files / 14 tests passed
pnpm typecheck    passed
pnpm build        passed
pnpm test:isolation passed; workspace 外目录不可读
pnpm plan:scene -- --scene grassland passed
pnpm plan:scene:check -- --scene grassland passed
```

已知非阻塞告警：

- Rapier compat 初始化仍会输出 deprecated parameter 警告，需要升级调用方式。
- Playground 生产 bundle 约 2.94 MB（gzip 约 1.02 MB），Vite 提示需要后续 code splitting。

## 5. 自动验证覆盖与未覆盖

自动验证已经覆盖：

- 场景可编译、所有 Feature 构建成功。
- 资源唯一所有权、依赖、有限 Transform，以及出生点的地形高度/落差/坡度安全；尚未检查出生点与水体、标志物或世界边界相交。
- 各场景渲染高度采样与 Rapier 高度场一致。
- Azure Bay 从出生点到观景坡底的主路线坡度不超过 35°。
- Core、Physics、Camera、Subject、Animation、Terrain、Feature、Schema 和 Testkit 的核心单元测试。
- WorldSpec 的必需字段、项目内图片 URI、Feature/进入镜头一致性，以及结构化规划工件的确定性导出。
- `grassland` 主要路线的真实地形坡度采样；高度/坡度图来自编译后的 Heightfield，而不是图片模型。

仍需人工或未来视觉回归覆盖：

- 长时间上下坡时的主观移动手感和剩余镜头微振。
- tile 边界的像素级阴影/法线接缝。
- 每个图片参考场景的首帧构图相似度。
- 生成 World Plan/Opening Shot 与真实白膜截图的自动视觉差异评分；当前已经能分别截图，但仍由人或 Agent 对比。
- 水岸在各种视角和地形高度下的观感。
- Mixamo 动作混合观感、脚滑和 jump 动作绑定。
- 世界模型条件帧与最终生成画面的一致性；该链路尚未实现。

其他实现层已知问题：

- `WorldSnapshot.player.grounded` 目前由最近动作推断，不是 Rapier motor 的真实 grounded 状态。
- `reset()` 重置主体、镜头和输入，但不会把 World tick 或 frame 归零。
- `humanoid-rig-status` 是 Adapter 为检查器追加的运行时状态项，不属于 FeatureRegistry 资源图。
- 早期未引用的 `demo-world-adapter.ts` 已删除；Playground 只保留真实 `SdkWorldAdapter` 链路。

## 6. 当前结论

当前代码已经证明“受约束的 Coding Agent 可以创建可追踪的室外高度场白膜世界”，但还不能宣称“任意场景”或“第一期生产完成”。下一步应该扩大图片参考实验集，并把构图、可玩性、性能和主观手感变成可重复验收，而不是继续堆更多地貌名词。
