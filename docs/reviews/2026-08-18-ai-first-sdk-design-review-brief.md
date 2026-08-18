# AI-first 白模游戏 SDK 设计评审

> 建议阅读时间：10～15 分钟
>
> 文档目的：帮助团队判断总体设计方向是否成立，以及哪些关键边界需要在开发前冻结。
>
> 本文不是完整技术规格，不展开所有 Schema 字段、接口和测试细节。

## 1. 我们要做什么

我们要提供一个面向 AI Agent 的游戏场景 SDK。

上游 Agent 根据图片和 Prompt 理解场景，输出结构化场景描述；SDK 负责把描述编译成一个可以运行、移动、碰撞、截图和自动验收的 3D 白模游戏世界。

第一阶段聚焦室外场景：地形、水面、可控制主体和关键物件。最终画面是否精美不是 SDK 的核心目标，空间结构、玩法语义和物理结果是否正确才是。

```text
图片 + Prompt
    ↓
上游 AI Agent
    ↓
AuthoringSpec（结构化世界描述）
    ↓
SDK 校验、规范化和编译
    ↓
Babylon Runtime + Havok Physics
    ↓
可操作白模世界 + 截图/状态/诊断
```

一句话定义：**这是一个让 AI 用结构化配置“组装游戏世界”的 SDK，而不是让 AI 直接编写游戏引擎代码。**

## 2. 为什么不能只让 Agent 直接写场景代码

Agent 直接生成 Three.js、Babylon 或物理引擎代码，短期很快，但会逐渐出现以下问题：

- 同一种人物、相机和碰撞逻辑被反复实现，行为不一致。
- 场景能显示，但物理、动作、坐骑和装备无法稳定组合。
- 上游程序很难判断场景为什么失败，也难以自动修复。
- 引擎实现细节进入 AI 输出，未来替换 Runtime 或升级引擎代价很高。
- 相同输入难以稳定复现，无法作为生产制品缓存、审计和重放。

因此，我们把 AI 可以表达的内容收敛为版本化 Schema，把复杂的游戏实现留在 SDK 内部。

## 3. 总体设计：外部简单，内部像 LEGO

### 3.1 AI 只面向 AuthoringSpec

AuthoringSpec 是 SDK 的正式输入，它描述：

- 世界里有什么：人物、动物、地形、水面、塔、墙、道路等。
- 它们在哪里、大小如何、彼此是什么关系。
- 主体具备什么能力：行走、跳跃、飞行、骑乘、攻击等。
- 需要满足什么硬约束：可走路线、出生点、坡度、构图和资源预算。

Agent 不需要知道 Babylon Mesh、Havok Handle、渲染循环或角色控制器的内部实现。

Schema 分成两层：

- **Canonical Schema**：完整且稳定的 SDK 协议，是语义真相。
- **AI Schema Profile**：根据当前任务和模型能力裁剪出的简化版本。

任何模型输出都必须重新通过 Canonical Schema 和语义校验，模型的“结构化输出成功”不等于场景正确。

### 3.2 SDK 内部使用三个核心积木

1. **Entity**：世界中独立存在的对象，例如人物、飞龙、剑、灯塔。
2. **Capability**：对象能做什么，例如行走、飞行、骑乘、攻击。
3. **Relationship**：对象之间的逻辑关系，例如人物骑在飞龙上、剑装备在人物右手。

人物、坐骑和武器保持为独立 Entity，通过 Relationship 组合。渲染层再根据关系把模型挂到对应骨骼或 Socket 上。

这样设计后：

- 人物可以更换成人、儿童或其他模型。
- 同一个人物可以骑马、骑龙或不骑坐骑。
- 武器可以装备、收起、掉落或转交其他主体。
- 新增能力主要增加 Capability 和配置，不需要不断修改人物这个基础节点。

扩展性来自“稳定实体 + 能力 + 关系 + 明确生命周期”，而不是把所有东西永久嵌套在人物节点下面。

## 4. 动作如何组合

`run`、`attack`、`mount` 这类动作首先是 Gameplay 语义，不是某个动画文件名。

例如人物执行 `run`：

- 空手时选择空手跑动表现。
- 持剑时选择持剑跑动表现。
- 骑龙时由当前控制模式解析为坐骑移动或飞行动作。

动作结果由固定 Tick 的游戏状态决定，动画只负责表现。即使缺少“持剑攻击”专用动画，SDK 也必须按声明的降级规则运行或给出明确错误，不能让 Gameplay 永久卡住。

这使动作资源可以持续增加，同时保持上层动作 ID 稳定。

## 5. 地形为什么需要单独的编译链路

图片非常适合表达海湾、山脊、岛屿和高低关系，但图片不能直接成为权威物理地形。

推荐链路是：

```text
参考图
  ↓
AI 生成宏观地形规划图或结构控制数据
  ↓
SDK 解析语义区域、色带、路线和约束
  ↓
确定性 Terrain Compiler
  ↓
权威 Heightfield + Semantic Mask
  ↓
同一份高度数据生成 Mesh、碰撞和调试图
```

关键原则：

- AI 图片负责表达宏观意图，不直接决定最终碰撞高度。
- 路线、出生点、水域和地标平台属于结构化硬约束。
- Mesh 和物理 Collider 必须来自同一份权威 Heightfield。
- 图片模型、专业地形工具和具体 Runtime 都是可替换实现，不进入公共 Schema。

## 6. 为什么选择 Babylon + Havok

第一版 Runtime 推荐 Babylon，物理默认 Havok，但两者都放在 Adapter/Port 后面，不进入 AuthoringSpec。

选择原因：

- Babylon 更接近完整 Web 游戏引擎，具备场景、资源、动画、骨骼、渲染和调试体系。
- Havok 提供角色控制、Heightfield、Raycast 和通用碰撞能力。
- 浏览器 Runtime 天然适合 CLI、Playwright、截图和其他程序自动控制。

这不是承诺未来永远只支持 Babylon。真正需要冻结的是引擎无关的 AuthoringSpec、NormalizedWorldIR、PhysicsPort 和 Browser Protocol。

## 7. SDK 如何被其他程序调用

SDK 提供三种正式交付面：

- **TypeScript API**：给 Node.js/TypeScript 程序直接调用。
- **无状态 CLI**：给 Python、Go、Java 和 Agent 服务通过 JSON/NDJSON 调用。
- **Browser Protocol**：给 Playwright 或宿主程序移动主体、执行动作、查询状态和获取截图。

浏览器控制协议默认不在普通生产页面中开放。测试或受信宿主需要通过 Session、Scope 和短期凭证获得 `observe`、`control`、`capture` 或 `load` 权限。

## 8. 生产级设计中最重要的保障

### 确定性

- 相同 AuthoringSpec、Registry Lock 和 Seed 应产生相同的规范化结果和 Package Hash。
- 物理重放在锁定 Runtime、WASM 和平台类别内按容差验收。
- 视觉结果不笼统承诺跨设备像素完全一致；同一冻结 Capture Profile 可以像素级比较，跨 Profile 比较语义区域、Instance ID、Anchor 和容差指标。

### 可诊断和可修复

错误必须包含稳定错误码、JSON Pointer、相关实体 ID、实际值、期望值和机器可读修复建议。

Agent 使用带 `baseAuthoringSpecHash` 的 WorldChangeSet 修复场景；修改在隔离候选中重新编译并通过 Gate 后才原子发布，失败不产生半成品。

### 可审计和可发布

WorldPackage 保存规范化世界、资源、Runtime Target、版本锁和完整性清单。所有 Hash 都明确自己对应的对象，发布签名使用版本化 Canonical Envelope，避免字符串拼接歧义。

### 生命周期和资源所有权

Capability、System、Collider、Asset 和 Browser Session 都有明确 Owner 和幂等 Dispose。动态安装坐骑、武器或能力时采用 prepare/commit/rollback 事务，避免出现只挂了一半的状态。

## 9. 第一阶段明确不做什么

第一阶段目标是可玩的室外 Heightfield 世界，不把以下能力假装成已经支持：

- 室内空间、洞穴、悬崖下方和复杂 Overhang。
- 完整 NPC 行为、战斗 AI 和任务系统。
- 车辆驾驶和联网同步。
- 最终材质、影视级光照和生成式实时渲染。

这些能力未来可以沿 Entity、Capability、Relationship 和 Port 扩展，但不应阻塞第一条生产链路。

## 10. 本次评审需要确认的六个决定

| 决策 | 推荐结论 | 评审重点 |
|---|---|---|
| AI 正式输出 | 接受 AuthoringSpec，不让 Agent 直接写 Runtime 代码 | Schema 是否足以表达目标世界 |
| 组合模型 | 接受 Entity + Capability + Relationship | 坐骑、武器和动作是否能自然扩展 |
| 编译边界 | 接受 AuthoringSpec → NormalizedWorldIR → Runtime | 引擎细节是否被正确隔离 |
| 第一版 Runtime | 接受 Babylon + Havok，并保留 Port | 是否满足 Web、物理和自动化需求 |
| 地形路线 | 接受“生成式规划输入 + 确定性编译” | 是否兼顾图片理解能力和物理可靠性 |
| 实施顺序 | 先做 Phase 0 技术探针，再冻结协议 | 高风险能力是否都有明确通过标准 |

## 11. 主要风险与处理方式

| 风险 | 影响 | 当前处理方式 |
|---|---|---|
| Schema 过于复杂，AI 难以稳定输出 | Agent 成功率下降 | AI Schema Profile、Kit、枚举裁剪、结构化 Diagnostic |
| LEGO 组合导致运行时状态复杂 | 动态装备/骑乘出现半状态 | Capability/Relationship 事务与 Ownership Ledger |
| 单张图片无法恢复唯一 3D 世界 | 隐藏区域和尺度存在歧义 | 区分可见证据、用户事实和推断延伸 |
| 地形生成漂亮但不可玩 | 路线、出生点和坡度失败 | 权威 Heightfield、Gameplay Constraint 和阻断 Gate |
| Web 物理和截图存在平台差异 | 重放或视觉测试不稳定 | 锁定 Profile、分层确定性承诺、Phase 0 探针 |
| 第一版范围持续膨胀 | 无法形成生产闭环 | 先完成室外地形 + 主体 + 关键物件的 Vertical Slice |

## 12. 建议的评审结论模板

评审结束时，请明确记录：

1. 总体架构：接受 / 修改后接受 / 拒绝。
2. AuthoringSpec 与 Runtime 边界：是否接受。
3. Entity、Capability、Relationship 组合模型：是否接受。
4. Babylon + Havok 第一版选型：是否接受。
5. 地形编译路线：是否接受。
6. Phase 0 探针清单和通过标准：是否足以支持协议冻结。
7. 阻塞开发的问题、负责人和截止时间。

完整接口、Schema、确定性协议、地形算法和实施阶段以仓库中的总体设计、地形子规格、ADR-0006 与 Phase 0 探针计划为准。
