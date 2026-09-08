# 人物挂点与装备预览审查

结论：在 Source101 刚性视觉附件与 Playground 装备预览的范围内，当前实现符合
[架构原则](../three-sdk-architecture.md)和[运行时检查表](runtime-deep-review-checklist.md)。
本轮发现的生命周期、故障恢复、键盘操作和契约表述问题已修复；已验证范围内没有遗留阻塞项。
这不代表对任意模型、浏览器或装备玩法的通用认证。

## 归属与契约

| 检查项 | 当前实现与依据 |
| --- | --- |
| 动画与时间 | 六个挂点是现有骨骼的子节点，无新增固定步进、动画循环或物理世界；附件局部变换不进入人物动画快照。 |
| 相机与预览 | 预览克隆骨架，独立相机只写预览场景；仅在打开、调整、尺寸变化或上下文恢复时重绘。原人物继续由 SDK 管理。 |
| 资源所有权 | 调用者拥有附件资源；人物销毁先卸下附件，再释放自身资源。预览共享几何体与材质，仅释放自身骨架缓冲、渲染器、控件及地台。 |
| 坐标与单位 | Source101 采用加载完成时的 idle 初始参考姿态校准，非蒙皮绑定姿态；位置为缩放前模型局部米，旋转为 XYZ 弧度，正数统一缩放。 |
| API 边界 | 不存在的挂点、无效变换、已有父节点和祖先循环在改动层级前拒绝；卸载幂等；一个槽位允许多个独立附件。 |
| Creator / Episode | 消费者明确使用原始 `renderer.domElement`。预览 DOM 与画布不进入源画面；真实穿戴物作为人物视觉子树进入源画面。 |
| Agent 默认行为 | 未修改默认资产、白名单、生成提示或动作契约；全部样件默认关闭，试穿状态不写入项目或交付配置。 |

Three 0.185.1 的安装源码已核对：`SkeletonUtils.clone`、`Skeleton.clone/dispose`、
`WebGLRenderer` 的构造/恢复/释放，以及 `OrbitControls` 的按键与事件清理。
克隆的骨骼独立、几何体与材质共享，符合
[官方克隆说明](https://threejs.org/docs/pages/module-SkeletonUtils.html)；
显式资源所有权和按需绘制分别对照
[资源释放指南](https://threejs.org/manual/en/how-to-dispose-of-objects.html)与
[按需渲染指南](https://threejs.org/manual/en/rendering-on-demand.html)。

## 已修复的问题

| 问题 | 修复与回归证据 |
| --- | --- |
| 显卡上下文恢复后预览不重绘 | 在 Three 恢复自身状态之后触发重绘；真实 `WEBGL_lose_context` 丢失/恢复测试通过。 |
| 画布可聚焦但不支持键盘旋转 | 接入 OrbitControls 的局部键盘监听，提供 Shift＋方向键提示；旋转、Escape 关闭及焦点返回测试通过。 |
| 渲染器创建失败抛出未处理异常 | 显示可读错误、禁用穿戴、允许关闭重试；废弃带有半初始化监听器的旧画布。注入 context 创建失败后重试成功。 |
| 快速关闭重开时旧事件恢复了场景 | 原生 close 事件异步到达，处理前检查面板仍处于关闭状态；重开后不得发送恢复回调的回归通过。 |
| 文档把初始参考姿态写成绑定姿态 | 对照 SourceCharacter 构造中的 idle 采样，修正注释与使用说明，并明确单位、缩放及自定义骨架要求。 |

代码入口：[挂点实现](../../packages/three-world/src/training/character-attachments.ts)、
[装备面板](../../examples/three-creator/sdk-capabilities/humanoid/equipment-panel.ts)、
[浏览器回归](../../scripts/three-creator/equipment-panel.test.ts)、
[使用说明](../../packages/three-world/attachments.md)。

## 验证证据

工作树：`.worktrees/character-attachments`，分支 `codex/character-attachments-playground-20260908`。
功能提交：`3eeb257f`。集成基线：目标分支 `codex/three-sdk-data-production-20260907` 的 `abc1816a`。
以下门禁验证的是已合入该基线的功能分支；SDK 与 Playground 源码相对审查版本未改变。

| 验证 | 结果 |
| --- | --- |
| `pnpm test` | 64 文件、736 测试通过（209 contract、527 resource-heavy）；包括 6 项装备预览浏览器回归和真实 Source101 步行/骑乘/姿态恢复挂载验证。 |
| `node --test scripts/three-episode/*.test.mjs scripts/cloud/three-episode-scheduling.test.mjs scripts/lib/cloud-production-run.test.mjs` | 140 测试通过，包含 Seedance Python 契约桥接；外部云传输保持模拟。 |
| `pnpm typecheck` | 通过；另对根 tsconfig 未收录的装备面板、文档示例直接运行严格类型检查，通过。 |
| `pnpm test:census` | 64 文件已纳入测试门禁：24 contract、40 resource-heavy。 |
| `pnpm verify:workspace-boundaries` | 通过，0 已登记边界债务。 |
| `pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/attachments-runtime` | 通过。 |
| 真实 Playground | 打开预览前后，Source101 骨骼、主相机、模拟时间和纯世界像素相同；穿戴六件样件后源画面改变，原骨骼、主相机与模拟时间保持不变。已查看最终截图。 |

运行时字节哈希：`f936b1d856f1f73e1f2a9eee4724723c2c3d3e1ffda72c9dad0bbb1de54064fb`。
运行时清单哈希：`0bf9daa1c8438d38297282291402368f92b105299125f0c58a2ba7954511a52c`。
Playground 构建哈希：`96972849d7f15ef256e1d782f71ba97fb71653280e183070a9d9879d2e64e7fc`。
本地截图与复现脚本保存在工作树 `.codex-tmp/equipment-reviewed.png`、
`.codex-tmp/verify-real-equipment.cjs`，不进入 Git。

## 适用边界

- 这是刚性视觉挂载。布料模拟、抓握/双手 IK、脚底贴合、装备碰撞和能力加成均未实现；滑板仍由载具系统驱动。
- Source101 是已验证骨架。自定义骨架需要验证骨骼映射、初始姿态和缩放，不能根据名称相同推断兼容。
- 预览借用原材质，不能直接修改借用材质做染色或高亮；以后若新增此类功能，应明确克隆和释放所需材质。
- 浏览器证据来自本机 Chromium；未做 Safari/Firefox、不同 GPU 的兼容认证。未验收远端 CI，未进行独立第三方复审或云端生成。
- 已核对目标分支新增的运行时指导与 Seedance 交付：未修改人物、动画、相机和预览实现，测试清单保留双方新增项。后续基线变动仍需另行核验。
