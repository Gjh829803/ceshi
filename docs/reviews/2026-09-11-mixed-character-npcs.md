# 普通 NPC 与完整人形共享运行时

Humanoid world 现在直接接受普通 Mesh/Group 或 AssetInstance 角色。普通胶囊由共享
Rapier 中的 ThreePhysics 管理，读取自身身体和移动参数；完整人形继续拥有自己的
上下文控制器。Engine 在同一固定步计算自定义移动意图和导航，随后统一推进物理
及各自的动画实例。没有增加第二时钟，也没有恢复旧注册入口。

借用物理通过明确的 collider kind 通知 Environment。普通角色胶囊参与实时碰撞和
局部绕让，建导航网格时排除；不能把移动人物当作静态场景几何。

本次同时修复了消费者和生命周期边界：

- Episode 在 Humanoid world 使用既有 map bounds，不再为车辆读取默认人物身体。
- 首次同步 step 同时封存 World 元数据和 Engine 初始状态；否则初始 actor 删除后
  reset 会只恢复底层实例。ticks/input 先共用校验，失败 prototype 不允许封存。
  有待准备内容或初始参数时，先 await start 再同步步进。
- 删除旧 HUMANOID_CONTENT_REGISTER_IN_OPTIONS 恢复提示和测试；Creator 的活检查
  fixture 直接调用指定 actor controller，不重建已删除的 setHumanoidAssets 别名。

## 验证

- SDK 全量 54 files / 809 tests 通过。普通地面 NPC、自定义 XYZ 移动、独立实际
  AssetInstance mixer、胶囊相碰、reset/map replacement 均有相关行为覆盖。
- 真实错误红测包含车辆 Episode 身体查询、初始 actor 上下层恢复不一致、非法首次
  step 半封存、失败 prototype 跳过检查；修复后通过。最早非法 step fixture 缺少
  必需 body，修正 fixture 后重新确认了实际半封存红测。
- Creator tool usability 和 Episode action controller 50 tests 通过；Creator runtime
  guidance 最初发现遗漏旧 fixture，迁移后 11 tests 通过。未通过恢复旧 API 解围。
- typecheck、相关 lint、test census、runtime prebuild、diff 检查通过。独立只读审查
  发现的车辆与封存问题已修正，最终复查无新的确认问题。
- Creator playtest 与独立 Episode 在三个完整人形 + 一个普通白模 NPC 的实际浏览器
  中通过，检查 NPC 位移、完整人形动画、主角输入、重新准备和错误列表；截图已检查。
  证据 `.codex-tmp/mixed-npc-browser/report.json`，同一运行时
  `aaa7dc97344decc185522562a65bd2b10db4744bc7d0bd5b895e833d06de356a`。

本批完成普通 NPC 共存；普通角色成为受控主角时的输入、相机与 Episode 能力选择
仍需继续迁移，R2 和整体任务尚未完成。没有提交远端 CI 或人工最终验收结论。
