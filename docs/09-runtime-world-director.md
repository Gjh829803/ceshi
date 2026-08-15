# 运行时世界导演与受控世界操作协议

> 状态：Design。当前仓库没有 Observation、World Control Gateway、Runtime Task Manager 或 Director LLM 接入代码。本文是后续实现契约，不是现有 API。

## 1. 定位

系统需要支持两种不同时间尺度的 Agent：

```text
创作期：用户 → Coding Agent → TypeScript 场景代码 → 编译后的白膜世界
运行期：用户 → Director LLM → 受控世界操作协议 → 正在运行的白膜世界
```

本系统暂称 `Runtime World Director`。严格说它由 SDK 外的 `Director LLM`（理解和规划）以及 SDK 内的 Director 模块（观察、解析、权限、验证、事务、任务、回执）组成。它让 LLM 根据用户意图改变正在运行的世界，但 LLM 不是游戏循环、物理系统或世界真相。LLM 只提交结构化意图，SDK 负责解析目标、验证权限、规划执行，并在固定 tick 边界改变确定性状态。

它与实时世界模型渲染器是两个角色：

- `Runtime World Director` 决定世界中逻辑相关的对象应该发生什么变化。
- `Render Bridge / World Model` 根据白膜状态和视觉指令决定最终画面长什么样。

## 2. 设计原则

1. **命令而非逐帧控制**：LLM 发出“把守卫带到湖边”一类任务，不连续输出每帧坐标。
2. **白膜仍是唯一真相**：位置、碰撞、导航、生命周期和动作阶段最终以运行时结果为准。
3. **能力默认拒绝**：每个 Entity 显式声明允许 LLM 操作的能力、范围和动作集合。
4. **可验证、可追踪、可重放**：每个请求都有 world revision、命令 ID、执行回执和事件日志。
5. **瞬时命令与持续任务分离**：改大小是命令；寻路、跟随、巡逻是有生命周期的任务。
6. **逻辑通道与视觉通道分离**：改变房屋大小必须更新白膜；把房屋变红只需要渲染指令。
7. **玩家输入和物理优先**：LLM 延迟、失败或断开不得阻塞游戏循环。

## 3. 总体架构

```text
用户自然语言
    ↓
Director LLM
    ↕ 观察 / 工具调用 / 回执
World Control Gateway
├── Observation Service
├── Entity Resolver
├── Command Schema Registry
├── Capability & Policy Engine
├── Planner / Validator / Dry Run
├── Transaction & Task Queue
└── Receipt / Event Log
    ↓ 固定 tick 边界提交
确定性 World Runtime
├── Entity Lifecycle
├── Transform / Physics
├── Action System
├── Navigation / NPC Behavior
├── Feature Registry
└── Gameplay Rules
    ↓
Render Bridge → 实时世界模型
```

LLM 面对的是小而稳定的工具协议，不直接获得 `THREE.Object3D`、Rapier body、动画 mixer 或导航内部对象。

## 4. 两条操作通道

### 4.1 World Command

只要请求影响以下任一内容，就必须进入白膜运行时：

- Entity 数量、出现与消失
- 位置、旋转、尺度和父子挂载
- 碰撞、遮挡和导航占用
- 主体或 NPC 的动作、路径和行为
- 玩家控制权、触发器、游戏规则或关键镜头
- 地形、标志物或其他 Feature 的结构参数

### 4.2 Render Directive

只影响视觉的请求不创建逻辑实体：

- 材质、颜色、纹理和画风
- 毛发、布料和表面装饰
- 不影响通行的花草、云、粒子和背景细节
- 光影气氛和纯视觉天气变化

判断规则保持不变：如果变化会影响移动、碰撞、导航、遮挡、关键轮廓或游戏规则，就不能只交给渲染器。

## 5. 观察接口

LLM 不应每次读取完整场景树，而是通过受限查询获得语义快照：

```ts
type WorldObservationQuery = {
  entityIds?: string[];
  semantics?: string[];
  within?: { center: [number, number, number]; radius: number };
  view?: {
    cameraId?: string;
    visibleOnly?: boolean;
    screenRegion?: "left" | "center" | "right" | "top" | "bottom";
    instanceIdAtPointer?: number;
  };
  include?: Array<"transform" | "bounds" | "screenBounds" | "action" | "behavior" | "capabilities">;
  limit?: number;
};

type WorldObservation = {
  worldRevision: number;
  tick: number;
  entities: ObservedEntity[];
  ambiguities: Array<{ query: string; candidates: string[] }>;
};
```

所有可操作目标使用稳定 `entityId`。Entity Resolver 可以结合当前相机、可见性、屏幕区域和 Instance ID pass 理解“右边那个房子”或用户指向的对象。语义/视图查询只用于发现候选；真正提交命令前必须解析为确定 ID，歧义不能静默猜测。

## 6. 操作模型

### 6.1 瞬时命令

在单个 tick 边界原子提交：

| 命令族 | 示例 | 运行时责任 |
|---|---|---|
| `entity.transform` | 移动、旋转、缩放 | 同步 Transform、碰撞体、导航障碍和渲染身份 |
| `entity.spawn` | 让一辆车出现 | 只从批准的 prefab、Feature 或 SubjectKit 创建 |
| `entity.suspend/resume` | 暂时消失、重新出现 | 渲染、碰撞、导航和行为一致暂停/恢复 |
| `entity.despawn` | 永久移除 | 检查控制权与依赖，记录 tombstone |
| `action.play/stop` | 挥手、坐下、攻击 | 验证 ActionRegistry、前置条件与打断策略 |
| `behavior.set/clear` | 切换巡逻或警戒 | 交给 SDK 行为系统，不运行任意 LLM 代码 |
| `feature.update` | 调整塔高、湖泊范围 | 通过 Feature Registry 重建受影响资源 |
| `environment.update` | 修改时间或逻辑天气 | 更新受追踪环境状态和 Render Binding |

初版缩放只承诺 primitive 和批准资产的统一缩放。缩放必须同时更新碰撞体、包围盒和导航占用；不能只缩放 Three.js mesh。非均匀骨骼主体缩放、动态刚体瞬时放大等高风险操作默认拒绝。

“消失”需要明确语义：

- `suspend`：保留 ID 和状态，但一致关闭渲染、碰撞、导航占用和行为。
- `despawn`：永久销毁并处理依赖。
- 禁止只隐藏画面却留下不可见碰撞体。

### 6.2 持续任务

持续一段时间的目标由 Runtime Task 执行：

| 任务族 | 示例 |
|---|---|
| `navigation.goTo` | NPC 走到指定坐标或语义锚点 |
| `navigation.follow` | 跟随玩家并保持距离 |
| `navigation.patrol` | 沿路径巡逻 |
| `navigation.flee/chase` | 逃离或追逐目标 |
| `lookAt` | 持续看向某 Entity |
| `action.perform` | 播放带完成条件的语义动作 |

任务状态为 `accepted → running → succeeded / failed / cancelled`。寻路系统决定每帧位移，LLM 只给目标、速度模式、容差和超时。

### 6.3 多步计划

“守卫跑到湖边，然后面向玩家挥手”不应靠 LLM 高频轮询，而应编译成有依赖的 `WorldPlan`：

```ts
const plan = {
  id: "guard-greets-at-lake",
  nodes: [
    {
      id: "move",
      task: "navigation.goTo",
      target: { entityId: "guard-01" },
      destination: { anchorId: "lake-overlook" },
      locomotion: "run",
    },
    {
      id: "face-player",
      dependsOn: ["move"],
      task: "lookAt",
      target: { entityId: "guard-01" },
      lookAt: { entityId: "player" },
    },
    {
      id: "wave",
      dependsOn: ["face-player"],
      command: "action.play",
      target: { entityId: "guard-01" },
      action: "wave",
    },
  ],
};
```

## 7. 命令封装与回执

```ts
type WorldOperationRequest = {
  requestId: string;
  issuedBy: string;
  expectedWorldRevision: number;
  mode: "dry-run" | "commit";
  atomic: boolean;
  operations: WorldOperation[];
};

type WorldOperationReceipt = {
  requestId: string;
  acceptedRevision: number;
  committedRevision?: number;
  status: "planned" | "committed" | "rejected" | "partially-failed";
  resolvedTargets: string[];
  actualChanges: unknown[];
  tasks: Array<{ taskId: string; status: string }>;
  diagnostics: Array<{ code: string; message: string; entityId?: string }>;
};
```

推荐调用过程：

1. `observe` 获取当前 revision 和候选 Entity。
2. `dryRun` 解析目标、检查权限、碰撞、可达性、预算和依赖。
3. LLM 根据诊断修正计划。
4. `commit` 在固定 tick 边界提交。
5. 通过 receipt 和 task event 获取实际结果。

旧 revision、目标消失或状态冲突时应拒绝或要求重新规划，不能把过期意图盲目施加到新世界。

`worldRevision` 表示结构、权限和已提交控制操作的版本，不随每一个物理 tick 自动增长；连续运动状态另带 `tick`。否则正常的角色移动会让所有 LLM 请求在到达时都失效。`atomic: true` 只保证瞬时变更和持续任务的“创建”一起成功或一起拒绝，持续任务之后仍可能因动态世界变化而失败，并通过 task event 报告。

## 8. 能力与安全策略

场景作者为每个 Entity 或类型声明能力：

```ts
type LlmControlPolicy = {
  transform?: {
    position?: boolean;
    rotation?: boolean;
    uniformScale?: [minimum: number, maximum: number];
    allowedRegion?: string;
  };
  lifecycle?: Array<"spawn" | "suspend" | "resume" | "despawn">;
  navigation?: boolean;
  actions?: string[];
  behaviors?: string[];
  protected?: boolean;
};
```

默认策略：

- 玩家当前控制的主体、关键任务对象和世界根节点不可被 LLM 删除。
- Transform 变更先做 sweep / overlap 和世界边界检查；默认 `reject_if_blocked`。
- NPC 导航目标必须可达，否则返回最近可达点候选或明确失败。
- Action 必须存在于主体 ActionRegistry，并满足挂载、地面和互斥条件。
- 每次请求有实体数、任务数、重建时间和调用频率预算。
- 冲突优先级建议为：安全与物理约束 > 游戏规则 > 玩家控制 > 已提交关键任务 > Director LLM。

## 9. 确定性与追踪

- 所有已提交命令写入 append-only command log。
- 日志记录输入 revision、解析后的 Entity ID、确定性 seed、提交 tick 和执行结果。
- 可逆 Transform 和状态命令保存 before/after；永久销毁使用 tombstone 支持诊断与有限撤销。
- 重放时使用解析后的命令，不重新调用 LLM。
- Render Bridge 只读取提交后的状态和 revision，避免画面先变化、碰撞后变化。

## 10. 分期方案

本模块不进入第一期实现，作为后续明确方向保留。

### D-A：协议与受控瞬时修改

- Observation API、稳定 ID 查询和 world revision
- JSON Schema 工具定义、dry-run、commit 和 receipt
- primitive/批准资产的移动、旋转、统一缩放
- spawn、suspend、resume、despawn
- Capability Policy、tick 边界事务、命令日志和重放
- Render Directive 的独立视觉通道

### D-B：动作、NPC 与导航任务

- ActionRegistry 工具化
- NavMesh / 路径查询和可达性验证
- goTo、follow、patrol、stop、lookAt
- Runtime Task 生命周期、取消、超时和事件
- 简单 Behavior 节点与主体/NPC 复用

### D-C：计划、Feature 与世界级编排

- 有依赖的 WorldPlan
- `feature.update/rebuild` 和组操作
- 控制权切换、逻辑环境与受控镜头编排
- 规则触发的 Director 请求与多人/多 Agent 冲突策略
- 更完整的撤销、审计和长期世界状态压缩

## 11. 验收案例

1. 用户说“把右边的塔放大一倍”：塔保持同一 ID，几何、碰撞和导航占用原子更新；若空间冲突则 dry-run 拒绝。
2. 用户说“让那辆车消失，十秒后回来”：使用 suspend/resume，不留下不可见碰撞，也不重新分配身份。
3. 用户说“让守卫跑到湖边再挥手”：导航和动作作为两个有依赖的任务执行，LLM 不逐帧控制。
4. 用户说“把城堡变成红色石头”：仅更新 Appearance / Render Directive，不重建碰撞。
5. LLM 尝试删除玩家或把 NPC 放到湖底：Policy Engine 明确拒绝并返回可执行修正建议。
6. 使用同一初始 snapshot 和已解析 command log 重放，得到相同关键世界状态。
