# 越野车驾驶故障修复

本次针对 5296 的驾驶问题修正车类轮胎模块、刚体姿态回写及 Playground 弹窗焦点交接。未替换其他大类算法，未修改地图障碍、车辆配置或操作映射，未提交或推送。

## 原因与改动

- `motion-families/ground-vehicle/wheel-physics.ts`：压缩限位原先读取接触法向速度，却沿悬架轴施加冲量，斜边接触把水平运动放大成抬升。现在速度约束与冲量沿同一轴；压缩阻尼以实际轴向压缩及原有受限纠偏速度为界，保留连续坡面的行程响应。质量、动力链、抓地、行程、自然腾空与刚体碰撞不变。
- 轮胎模块及车类、水面船类、水里类各自的 `dynamics.ts` 恢复 Rapier 姿态回写归一化。旧的单精度误差会被 Three 当作缩放，触发相机碰撞三角网格反复重建。测试确认持续物理转向时网格只构建一次，真正改变模型尺寸时仍会重建；没有改变其他大类的受力或碰撞算法。
- `apps/three-playground/src/shell.tsx` 与 `main.ts`：暂停弹窗关闭后，Radix 的延迟焦点恢复会盖掉提前执行的驾驶焦点交接。真实页面复现“已解除暂停但按住 W 无输入”；现在在加载/暂停弹窗的 `onCloseAutoFocus` 中交还现有 SDK 输入界面。未更改公共输入的 UI 隔离规则。
- S→制动→倒挡的键位和动力链本身在回放中正常。补测 `WorldKeyboard` 持续 W/S、压坎后倒车，以及浏览器暂停后直接按 S，避免用 Space 制动代替倒车验收。

## 验证

- 最终统一执行 15 个文件 266 项全部通过：轮胎、动力链、车类状态、相机、七大类注册、各显式刚体小类、SDK 浏览器输入、Creator 载具消费及 Episode 路线。日志 `.codex-tmp/rover-repair-final-tests.log`。
- 压坎覆盖 3 种车、左右/中央 3 个位置、普通/加速、动态/固定障碍，共 36 组，并验证压坎后倒车；原有 12°/22° 坡道转向、落地、翻滚、墙体阻挡仍通过。6 个不同主体的持续姿态更新与相机缓存生命周期回归通过。
- 真实 5296 页面独立浏览器键盘测试：W 越过训练障碍；持续 S 触发 `directionBraking` 后进入 R 挡，向后速度超过 1 m/s；暂停/继续后无需再次点击画面，W 恢复前进。修复前此最后一步失败，修复后通过。
- 既有 `apps/three-playground/scripts/browser-smoke.ts` 补充“暂停后直接 S 倒车”并通过，其余地图、表单输入隔离、面板恢复和小屏检查也通过，页面错误为空。
- 类型检查、ESLint、test census、差异空白检查、runtime prebuild 通过。runtimeHash：`2808b77990b0ae4270a12803f9d124972b4272ed0bc4b50187c737f476efba64`；manifestSha256：`0f2acd0257795adf4b16f1c15e1622ebe3e251c47b4b03c63c44a2166f903cbd`。Playground 开发服务读取本工作区源码；预构建位于 `.codex-tmp/three-runtime`。
- 旧的 0.3 m 横杆测试曾要求车身最低弹起 0.15 m。去除额外阻尼抬升后约为 0.147 m；断言改为抬升超过 0.1 m 悬架上压行程且低于 0.45 m，仍检查通过障碍与行程上下限，不要求额外弹跳。

## 证据及边界

备份：`.codex-tmp/rover-repair-backup`。日志：`.codex-tmp/rover-repair-tests.log`、`rover-repair-consumers.log`、`rover-page-check.json`、`rover-repair-browser-smoke.log`。倒车截图：`.codex-tmp/rover-repair-reverse.png`。低障碍修复前/后回放：`rover-repair-before.log`、`rover-repair-final.log`。

独立浏览器对相机缓存的 5 秒采样中，修复前观测到 observation-sub 3360 次、canoe 2520 次、kayak 1820 次、raft 1960 次重建，总计 9660 次，渲染回调约 13 次/秒。恢复这些主体的姿态归一化后，同一场景异常重建为 0，渲染回调约 60 次/秒。证据：`.codex-tmp/rover-performance-before.log` 与 `rover-performance-after.log`。采样使用独立测试浏览器，未连接或操作用户浏览器的调试协议。

确认修复的是已复现的弹飞、焦点失效和载具姿态导致的网格重复构建；未拿到用户原来那一次卡死的逐帧记录，不声称覆盖所有可能的卡死原因。
