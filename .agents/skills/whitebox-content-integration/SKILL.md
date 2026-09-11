---
name: whitebox-content-integration
description: 将 Playground 已调好的 Whitebox 模型、生物、动画绑定或车辆操控接入 SDK 与 Creator，并验证 Episode 消费。用于接入或更新已有内容；具体场景创作仍使用普通 Three。
---

# Playground 内容接入

目标：保留 Playground 已验证的效果，让 Creator 能找到、读懂、绑定并执行同一能力，
Episode 能使用同一运行时复现。按内容实际需要编辑资源、binding、配置、代码与说明；
不要求所有内容包装成统一 manifest、自动注册或独立 npm 包。

同一完整人物需要多个实例时，在已有 humanoid world 调用 `createCharacter()`，
通过 `world.addCharacter({id,humanoid:character})` 绑定；使用稳定的实例 ID 指定输入和动作。
共享源资源，不复用同一个 root/mixer。角色输入目标与相机跟随目标分开设置，
NPC 不创建独立物理、动画调度或相机循环。实际入口见 SDK `humanoid` topic 与
`multiple-actors` 示例；自动导航、可执行动作及尚未支持的组合以实际接口为准。
导航和动作通过 SDK 争用角色资源，冲突返回 `ACTOR_RESOURCE_BUSY`，可用
`getEntityState(id).controlOwners` 查询占用。接近完成后再拾取/就座；拾取完成后的
持有允许继续导航，起身安全结束后才恢复导航。显式输入与导航之间先释放前者，
不要通过直接写位置或额外动画循环绕过占用。

先读取仓库 `AGENTS.md` 与 [架构](../../../docs/three-sdk-architecture.md)。以当前源码和实际
消费者为准；下面路径均相对仓库根。遵循用户指定 worktree 与修改范围。

## 找到应当迁移的内容

- 从用户指定的 Playground 实例、导出 profile、资源目录或提交确认实际生效值与来源。
  `exportProfile()` 是可重放参数，`inspectConfiguration()` 是当前解析结果；只保存在 UI
  localStorage 的值还不是 SDK 默认值。保留这次调好的数值，不擅自重新调手感。
- 分清模型、animation clip、rig binding、motion profile 和可执行动作。
  换材质或同动作变体通常改内容/binding；增加新行为才扩展动作 owner。
  只有 clip 不能声明已支持拾取、攀爬、飞行或碰撞。
- 资源按资产独立维护。普通 Mesh/Group、自绘车辆无需为了可发现而创建假模型资产。
  稳定 ID 沿用实际已注册的 ID；可见名称可以变化。Source101 与现有动作保持默认。

## 按受影响 owner 接线

| 内容 | 主要修改位置 | 检查消费者 |
| --- | --- | --- |
| 模型及资源元数据 | `assets/three-creator/<内容目录>/`、`assets/three-creator/catalog/<assetId>.json` | asset loader、Creator assets_search/assets_describe、编译后 asset-definitions |
| Source101 动画/绑定 | `humanoid-runtime/humanoid/source-character.ts`、`catalog.ts`、`action-schema.ts` 与实际 source manifest/clip | Character 单个 mixer、动作资格和终态；按实际绑定支持变体 |
| 可执行动作 | 当前 action-system/controller、capabilities、World execute/operations | 键盘、Creator command schema、Episode action-controller |
| 操控与几何约定 | SDK `config/`、所属 motion-family、`road-vehicle.ts`/`aircraft-spec.ts` | Playground resolved 配置、自绘示例、真实碰撞与机械动画 |
| 示例 | `examples/three-creator/<主题>/`、`scripts/three-creator/example-registry.json` | creator_get_examples、完整文件清单、运行包 staging |

SDK 路径前缀为 `packages/three-world/src/`。Playground 是同源定义的调试客户端。
默认值留在所属 SDK/内容模块；场地位置、颜色、实例命名等由 Playground 或场景覆盖。
不要在 UI、SDK 工厂和 Agent 示例复制三套可变物理默认值。

普通 Mesh/Group 的交互使用 `EntityOptions.interactions` 或 prototype 的同名 options：
每个槽位显式提供 `slotId/label/kind/capacity:1`，位置、接近点为实体根的本地米制坐标，
旋转为 XYZ 欧拉弧度。Map 内容也显式提供 `slotId`，两者进入同一个交互 owner。
拾取复用原动态 body 和模型；固定座椅可声明多个实际座位槽。不要为接入再造一份物理对象。
若 Playground 标定依赖锁定物体旋转，显式传入 `physics.lockRotations:true`；默认仍自由旋转，
动作执行器不会隐式覆盖这个配置。`multiple-actors` 示例演示偏心 Group 与双座位的完整接线。
通过 `entity.set-interactions` 替换槽位，空数组清空；目标删除/重绑会使旧关系失效，
reset 按 baseline 绑定新物理实例。实际 API 和完整参数见 SDK `character-actions` topic。

动作请求用 `targetId` 指实体、`slotId` 指交互槽；实体多槽时必须选槽。
从 `interactionTargets` 读取实际 approach、eligibility、generation 和 claim。
Episode 的 actionGoals 也传递同一 `targetId/slotId`，完成判断必须对应实际占用者。
锚点必须接触实际 collider，且与供应动作的抓握/坐姿标定匹配，不能只凭动画名称声明可达。
坐姿胶囊与起身空间由动作 owner 管理；UI 和显示回调不修改关系、body 或动作阶段。

汽车/摩托先调用 `humanoid.createRoadVehicleSpec`，固定翼调用 `humanoid.createAircraftSpec('plane')`。
用实际 resolved spec 的轮组、碰撞尺寸与座位画普通 Three 几何；不加载车辆模型。
飞机 `airframe` 当前是固定标定参考，修改该对象或缩放 visual root 不会改变求解器标定。
超出当前能力时明确说明需要修改哪个 owner，不用包装名称掩盖未实现行为。

## 让 Agent 找到并知道怎么用

资产源文件编辑后用 `pnpm content:sync` 更新派生 `asset-catalog.json`。
已有 import/export 脚本写入独立源；不直接编辑聚合目录。
资源 hash/byteLength/逻辑路径指向最终实际 bytes，保留来源与许可。不要复制同一模型来承载新动画。

新增示例在 `example-registry.json` 写一次 topic/root/default files；源码工具与运行包消费同一登记。
文件清单仍必须包含所有实际 import 和资源。已有 topic 能说明用法时直接复用。

`assets_describe` 不会自动读取目录 README。将用途、绑定入口、参数单位、实际前置条件、
完成状态和限制写入工具可见 metadata 或 SDK 对应 topic。
若需要新增 SDK topic，同步 `authoring-schema.ts`/discovery 的真实主题分派；验证实际工具回复。
不要为每个动作增加一个 MCP 方法。详细源码按需读，生成 Agent 不必阅读整套求解器。

发现与权限分开：冻结 asset policy 决定生产允许项。接入内容不自动授权修改白名单或部署。
沿用当前任务已授权范围；没有要求发布时交付本地可运行成果与明确发布状态。

## 用实际消费者验证

先检查受影响内容，工具可选辅助：

```sh
pnpm content:check --asset humanoid.source-101
```

它检查派生目录及选中资源身份，并分别报告 policy 状态；不证明动作效果或发布完成。
按改动选择相关 tests/typecheck/census/prebuild。工程检查服务本次开发，不变成生成 Agent 的固定流程。

用 Creator 实际工具取得说明与完整示例，编译后加载资源，按真实输入/execute 完成主要行为，
同时检查一个相关拒绝条件。持续动作 receipt accepted 仅为开始，要读取 operation 终态与物理状态。
拾取结束仍持有、坐下结束仍占座；只有实际释放才清理关系。观察不推进模拟。

Episode 使用同一 runtime bytes 的本地 prepare/advance/execute/operation/frame，或已有本地录制脚本。
角色模型/控制器/mixer 不因骑乘、拍摄或重复截图更换。保留一个 Rapier world/时钟/相机 owner，
车辆 60 Hz SDK tick 内的 120 Hz 子步不能删除。

保存这次 runtime/source/config 身份、输入、结果和必要媒体。工程测试、独立审查、浏览器/视频、
人工视觉、远端 CI 与实际发布分别报告；未检查项写未检查。不能把旧视频或另一个 runtime 当作当前验收。
资源或 binding 改动后，证据必须重新对应确切 bytes；同身份无关检查不重复运行。

交付应让下一位 Codex 清楚：改了什么，唯一源在哪里，Agent 从哪个工具/示例进入，
主要行为是否真实跑通，哪些限制仍存在。将反复出现的机械重复再提炼成小工具，避免预建通用注册框架。
