# 普通实体交互槽位与实际消费者

本记录对应 `ac9e9c30` 的槽位阶段；后续角色资源统一交接见
[资源仲裁验收](2026-09-11-actor-resource-arbitration.md)。

R3 的实体绑定和槽位链路已接通；角色移动、全身动作及手部资源的统一仲裁、
R4 动作事件和 R5 姿态边界仍未完成。本记录不代表整个重构验收完成。

## 实现与接入

- `EntityOptions.interactions` / prototype options 提供纯本地槽位定义。
  `entity.set-interactions` 替换或清空绑定。Map 和普通实体进入同一个
  `WorldInteractions`，请求明确 entity、slot，内部关系校验实际 generation。
- 同实体多个座位独立占用；拾取排他占有整个实体。预约使用五秒模拟时间，
  接触成功转为持续 held/occupied，操作成功不会释放持有或座位。
- 普通 Mesh/Group 复用已有模型和刚体，偏心抓握从本地锚点换算根姿态。
  物理 owner 保留质量、碰撞和释放职责；可显式配置 `lockRotations`，动作不隐式锁转。
- 接触时复查实际 collider、质量、目标状态和 Source101 可达范围。
  槽位替换、实体删除、禁用和 reset 使旧引用失效。低顶下失去座位保留
  1.40 米胶囊，清理完成后才恢复站立；完整坐姿采样最高点约 1.34 米。
- SDK 公共类型、Creator schema/能力卡、Playground 工具和 Episode 均传递 slotId。
  能力卡保留实际选中槽位，避免同实体多槽被误报成不可执行。
  Episode 完成判断核对 entity/slot/generation、实际 actor 和本次请求 claim。
- Episode 的 NPC move-to/follow/stop 使用现有 World 命令与录制 lease。
  观察不步进，普通输入仍不能抢录制时钟；lease 失效后释放未提交的角色克隆。

可操作样例为 [multiple-actors](../../examples/three-creator/multiple-actors/main.ts)，
接线集中在 [interactions.ts](../../examples/three-creator/multiple-actors/interactions.ts)。
先让 NPC 接近物件，再争用、搬运放下、分别就座；还提供取消、删除物件、解除座位、
右侧低顶和 reset。路径绕开实际可移动桌子；固定座椅前先到可导航的位置，再做动作对齐。

```sh
pnpm dev:example examples/three-creator/multiple-actors
```

## 本地证据

最终运行时预构建：
`2eb273147ee9b1ab15c9aa08eaef98ab5df32719e0b3ed1d9850edb1646d9684`。
浏览器脚本为
[shared-interactions-browser.ts](../../scripts/three-creator/shared-interactions-browser.ts)。
本地报告和近景：`.codex-tmp/r0/shared-interaction-slots-accepted/`；
同一 runtime bytes 由 Creator 编译/录制和独立 Episode 加载。

- SDK 54 文件、847 测试通过；随后能力卡 slot 修复通过 129 项针对性回归。
  输出分别为 `dynamic-slots-sdk-final.log`、`slot-capability-tests.log`。
- Creator/Episode schema、工具、动作控制和录制 113 测试通过，
  输出 `interaction-consumers-final.log`。新增录制 lease 失效使用真实角色克隆回归。
- typecheck、lint、test census 和 runtime prebuild 通过；日志位于 `.codex-tmp/r0/`。
- Creator 使用真实键盘输入及命令录制：NPC 接近、拾取、搬运放下、两人就座、
  单人起身、降低右侧顶板、解除座位绑定、抬高顶板后安全退出。
- Episode 同 tick 提交两次争物请求，恰一方接受；确认持有跨操作完成持续、
  放下清空关系、两个座位分别占用、离开一席不释放另一席、reset 恢复三个槽位。
  实际 `EpisodeActionController` 通过指定右席完成 sit/standUp。
- 增加近景观察以检查抓握与座位；观察前后模拟 tick 相同。
  近景与正式录制分别保留，不把远景状态通过当作近景视觉验收。

## 范围与剩余项

本阶段是三角色共享物件/双座位的局部验收，不是全部载具、性能或整套 CI。
图像已由 Agent 检查；人工操作/人工视觉验收、远端 CI 和发布未执行。
Source101 搬运静止仍使用原行走 clip 的静帧，无专用搬运 idle/放下动画。

独立只读审查确认的 Episode 槽位遗漏、地图身份冲突与 lease 失效克隆释放已修复。
最终局部独立复核未发现新的确认问题；审查未另行运行测试。
角色跨资源原子仲裁、动作事件统一提交、动作身份及缓存生命周期、
源姿态/显示隔离和完整 R6 验收继续按主计划推进。
