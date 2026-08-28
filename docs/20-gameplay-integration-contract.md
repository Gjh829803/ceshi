# Gameplay 正式对接合同

> 状态：**当前正式合同**
>
> 面向：调用 SDK 的程序、CLI/Browser Driver，以及负责生成对接代码的 AI Agent
>
> 原则：只使用仓库导出的 Canonical 类型和当前协议；不复制 DTO，不做版本探测，不保留兼容别名。

## 0. 当前唯一生产协议链路

当前已经实现并允许正式对接的世界输入、编译和 Runtime 只有一条生产链路：

```text
AuthoringSpec V4
  -> NormalizedWorldIR V4
  -> ExecutionPlan V5
  -> Babylon/Havok Runtime
  -> Runtime Snapshot V4 / Browser Protocol V5
```

[ADR-0007](decisions/0007-canonical-and-babylon-native-authoring-lanes.md) 已接受未来互斥的 Babylon
Native Scene Lane；其 [长期设计](superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
与 [Block Whitebox Profile](superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)
仍在 BNA/BWB 生产门禁前，不是本合同的第二个当前入口，也不改变下面 Browser/Gameplay exact 类型。

这是一条不向开发历史兼容的关闭合同。更早的输入、IR、Plan、Snapshot 和 Browser
形状不提供解析、迁移、字段别名或 feature detection。对接方必须同步当前 `main`，然后直接按
当前类型改写本地 fixture；不得在 Adapter 中维护新旧两套协议。

真实 Browser 调用的可用条件是：

1. `pnpm worldkit run <world.json>` 成功启动 Canonical Authoring Runtime；
2. `await window.__WORLDKIT__.ready()` 成功；
3. `window.__WORLDKIT__.version === 5`；
4. 请求和返回值直接使用 SDK 导出的 exact 类型。

`pnpm dev` 启动 Babylon-backed catalog Playground；不得与 `?authoring=1` 组合，也不是
本合同的 Canonical Authoring Runtime 入口。

## 1. 权威包与所有权

| 内容 | 权威来源 | 对接规则 |
|---|---|---|
| Command、Receipt、Event、World State | `@whitebox-world/gameplay-contracts` | 直接导入 exact 类型 |
| Browser V5、Snapshot V4、Capture、Activity | `@whitebox-world/runtime-contracts` | 只通过 `window.__WORLDKIT__` 使用；结构修改走 `__WORLDKIT_AUTHORING_EDIT__`，不要给 V5 加第 40 个 key |
| RuntimeHost command/journal/session | `@whitebox-world/runtime-host` | SDK 内部所有；下游不 import |
| Camera Profile/Context/Preference/Selection | `@whitebox-world/camera` | 当前提供 provider-neutral 领域合同和纯选择；不得误写成已接入 Browser/Runtime Pose |
| Babylon Gameplay World Port | `@whitebox-world/runtime-babylon` | Adapter 内部所有；下游不依赖 internal Symbol |

权威状态分层如下：

- 控制权只由 Canonical `possessedBy` Relationship 表达；
- Gameplay Inspection 是实时控制、Action 和 Event 游标的权威投影；
- World State 是可寻址、可校验的 Canonical 状态；
- Subject State 是运动和能力的 Runtime 投影；
- 当前 Babylon CameraDirector 独占最终 Pose；`@whitebox-world/camera` 独占新的 Profile、
  Modifier、Context、Preference 和纯 Selection 语义。两者的正式单向接线尚未交付；
- Simulation Tick 是唯一 Gameplay 时间。

Babylon、Havok、Recast 的对象、handle、provider 名称和内部状态不得进入 Command、Snapshot、
CLI、Browser、Report 或 Capture 合同。

## 2. 最小接入流程

先在当前 checkout 运行：

```bash
git fetch origin main
pnpm install
pnpm typecheck
pnpm worldkit validate examples/authoring/package-subject-world.json --json
pnpm worldkit run examples/authoring/package-subject-world.json
```

页面就绪后的调用顺序：

```text
ready
  -> 从 Snapshot 读取 runtimeSessionId / worldSessionId
  -> executeGameplayCommand(control.bind, expectedPossession = unbound)
  -> 检查 committed Receipt
  -> runFixedInput([{ actions, axes?, ticks }])
  -> 按 worldStateAfterRef 查询 WorldStateSnapshotV1
  -> 用 getWorldSessionEvents 增量读取统一 WorldSession Event
```

CLI、Browser 和生成类型使用同一组字段名。任何 unknown field、unknown version、非有限数字、
unsafe integer、accessor 或 symbol 数据都会 fail closed。

## 3. Browser V5 Gameplay 核心面

下面是文档子集，不是可以复制到下游的替代接口。完整合同以
`WorldkitBrowserApiV5` 为准。

```ts
interface GameplayBrowserSubset {
  readonly version: 5;

  ready(): Promise<WorldRuntimeSnapshotV4>;
  getSnapshot(): WorldRuntimeSnapshotV4;
  getDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];

  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;
  runFixedInput(
    steps: readonly FixedInputV1[],
  ): Promise<WorldRuntimeSnapshotV4>;

  getWorldSessionEvents(query: WorldSessionEventsQueryV1): WorldSessionEventsQueryResultV1;
  getGameplayInspectionSnapshot(): GameplayInspectionSnapshotV1;
  getWorldStateSnapshot(
    request: WorldStateSnapshotRequestV1,
  ): WorldStateSnapshotV1;

  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;

  reset(): Promise<WorldRuntimeSnapshotV4>;
  setPaused(paused: boolean): WorldRuntimeSnapshotV4;
}
```

完整 Browser V5 还提供 Control Capture、Route Evidence、Capability Discovery、Subject
Harness 和 Camera Authoring 方法。调用方必须导入 `@whitebox-world/runtime-contracts` 中的
接口，不根据本文子集手写 Browser 对象。

Snapshot V4 不在根级重复发布控制目标。实时 UI 从
`snapshot.world.gameplayInspection.relationshipStatesById` 读取 `possessedBy` 与
`mountedOn`；回放和训练数据从
`getWorldStateSnapshot(...).relationshipStatesById` 读取同一关闭 Relationship Union。

## 4. 绑定、切换和释放

首次绑定：

```json
{
  "schemaVersion": 1,
  "id": "command.bind.player.0001",
  "type": "control.bind",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "controlledEntityId": "hero",
  "expectedPossession": { "mode": "unbound" }
}
```

从人物切换到坐骑或其他主体仍使用 `control.bind`：

```json
{
  "schemaVersion": 1,
  "id": "command.rebind.mount.0001",
  "type": "control.bind",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "controlledEntityId": "mount-dragon",
  "expectedPossession": {
    "mode": "possessed",
    "controlledEntityId": "hero"
  }
}
```

释放控制：

```json
{
  "schemaVersion": 1,
  "id": "command.release.0001",
  "type": "control.release",
  "runtimeSessionId": "runtime-session-01",
  "worldSessionId": "world-session-01",
  "controllerEntityId": "controller-primary",
  "expectedPossession": {
    "mode": "possessed",
    "controlledEntityId": "mount-dragon"
  }
}
```

`expectedPossession` 是 compare-and-swap 前置条件，不是第二份控制权状态。收到
`CONTROL_POSSESSION_STALE` 时先刷新 Snapshot，再决定是否发出新 Command；不要盲重试旧请求。

Host Reset 与 Browser Reset 是两层合同，不能混写成同一个状态所有者：

- [`RuntimeHost.reset()`](../packages/runtime-host/src/runtime-host.ts) 使用冻结的初始
  `RuntimeWorldConfigurationV1` 执行事务式 World replacement，发布新的 `worldSessionId`，并使旧
  Session 的 Command、World State Ref 和 possession fail closed；Host 是 Session 生命周期权威。
- [`WorldkitBrowserApiV5.reset()`](../apps/playground/src/worldkit-browser-api.ts) 只负责 Browser 边界的
  并发保护、错误封装和调用 Adapter；Adapter 会清空按键、相机输入与 Capture reservation，再通过
  Runtime coordinator 请求 Host Reset，并返回新 Snapshot。Browser 不自行创建第二份 Session 真相。

Reset 后调用方必须读取新 Snapshot，并按新 `worldSessionId` 重新显式绑定；不得重放旧 Session 请求。

## 5. Receipt、Event 与 World State

Committed Receipt 的稳定形状：

```ts
{
  kind: "worldkit-gameplay-command-receipt";
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  commandId: string;
  commandHash: `sha256:${string}`;
  commandType: "control.bind" | "control.release" | "action.activate" | "action.cancel";
  status: "committed";
  simulationTick: number;
  eventIds: readonly string[];
  worldStateAfterRef: string;
  worldStateAfterHash: `sha256:${string}`;
}
```

Rejected Receipt 使用 `status: "rejected"`、空 `eventIds` 和
`diagnostic: { code, message }`；failed Receipt 保留已产生的 `eventIds`。业务逻辑只按稳定
`code` 分支，不匹配自由文本 `message`。

控制切换会发布：

- `relationship.removed`：旧 `possessedBy` 已移除；
- `relationship.committed`：新 `possessedBy` 已提交。

Event `sequence` 在同一 World Session 内严格递增。`getWorldSessionEvents()` 的 cursor 是
exclusive；空页的 `nextAfterEventSequence` 等于输入 cursor。

`getWorldStateSnapshot({ worldStateRef })` 只接受属于当前 World Session、且仍被 Host 保留的
Canonical Ref。不得使用 Tick、裸 Entity ID、Runtime 对象引用或 provider handle 代替 Ref。

## 6. 幂等、并发和 Runtime Activity

- 相同 Command `id` 与相同 Canonical payload 重放时返回原 Receipt；
- 相同 Command `id` 与不同 payload 稳定拒绝 `COMMAND_ID_CONFLICT`；
- stale World Session 稳定拒绝 `WORLD_SESSION_STALE`；
- Possession 提交是原子的：关系、Gameplay Inspection、World State 和 Camera target 不允许
  部分发布；
- `runFixedInput` 临时暂停 Runtime，并在 `finally` 恢复调用前 pause 状态；
- `runtime-run`、`simulation-take` 和 `control-capture` 通过 Runtime Activity 合同协调，调用方
  不得绕开 Host 直接抢占时间或 Capture 生命周期。

Host 配置的 `fixedInputControllerEntityId` 是物理固定输入的唯一权威消费者。多个 Controller
可以存在于 Canonical Relationship 和 Inspection，但在多 Controller 输入调度合同发布前，
下游不得自行轮换输入归属或直接操作 Babylon Controller。

## 7. 当前边界

现在可以依赖：

- `control.bind`、A 到 B rebind、`control.release`；
- Command Receipt、Event journal、Gameplay Inspection、可寻址 World State；
- `mountedOn` stand-ground 的 Mount/Dismount Semantic Action、原子 possession 切换、
  Runtime 投影、安全下车与 Reset；
- fixed Tick 输入、Reset/Session 隔离、Runtime Activity；
- Snapshot V4、Browser V5、Control Capture Action/Event/Relationship Track 与当前 Route
  Evidence 合同。

仍需独立能力 Gate 的内容：

- 更完整的 Semantic Action Presentation 与动画内容映射；
- 多 Controller 输入调度；
- `mountedOn` S1 之外的关系型玩法，例如 seated riding、装备、拖挂和容器；
- `@whitebox-world/camera` 的命名 Profile、Context admission、View Preference、纯
  Selection/Explain 已实现；committed Gameplay Context Projection、Browser 命令、
  Registry Lock 以及 Babylon CameraDirector 消费 Selection Decision 仍需独立能力 Gate。

这些能力通过新增关闭合同扩展，不通过修改已经冻结的 Gameplay 字段或增加兼容 alias 实现。
当 Action 展示不可用时，调用方应按 unavailable 处理，不得从 Ref 尾段、Definition ID、文件名或
Clip 名推断动作。

## 8. 对接方禁止事项

- 不调用已删除的直接控制绑定旁路；
- 不从启动候选、Subject 字段或 Camera target 反推 possession；
- 不复制 Runtime 内部 Controller、World Port 或 internal Symbol；
- 不读取 provider-specific 对象或序列化引擎 handle；
- 不增加同义字段、旧字段 alias、双版本 parser、迁移层或 feature detection；
- 不持久化自己猜测的 Snapshot DTO；
- 不把相机数值塞进 Gameplay Command；
- 不把示例代码当成比导出类型更高的权威。

## 9. 可直接交给对接 AI 的指令

> 使用当前 `main` 的唯一生产协议链路 AuthoringSpec V4 → NormalizedWorldIR V4 → ExecutionPlan V5
> → Runtime Snapshot V4 / Browser Protocol V5。直接从
> `@whitebox-world/gameplay-contracts` 和 `@whitebox-world/runtime-contracts` 导入 exact 类型，
> 不复制 DTO、不写兼容 alias、不做 feature detection。真实 transport 只通过
> `window.__WORLDKIT__`；先 await `ready()`。控制权只由 `possessedBy` 表达；绑定、rebind、release
> 只调用 `executeGameplayCommand`，每次使用当前 Session ID 和准确 `expectedPossession`。
> stale 时刷新 Snapshot，不盲重试。World State 只按 Receipt 返回的 Canonical Ref 查询。
> 不访问 Babylon/Havok/Recast 对象、Runtime internal Symbol 或 provider handle。

权威文件：

- `packages/gameplay-contracts/src/gameplay-contracts.ts`
- `packages/runtime-contracts/src/runtime-session.ts`
- `packages/runtime-host/src/runtime-host.ts`
- `packages/runtime-host/src/world-session.ts`
- [`2026-08-24-gameplay-framework-r1b-integration-design.md`](../docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md)
