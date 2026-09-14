# LP01 翡翠低模龙

为当前飞行生物控制器创作的简化西方龙。模型、骨架和动作由 `scripts/assets/build-low-poly-dragon.py` 在 Blender 中从基本几何生成，没有复制 Century 的网格、骨架、贴图或动作数据。沿用运行时挂点名称和动作角色契约；喷火粒子仍使用训练场现有的效果与贴图。

- 资产：`assets/dragon-training/__creature-assets/LP01.glb`，451984 字节，2168 个三角面、32 根骨骼、16 个动作、7 种不透明纯色材质，无图片纹理。
- SHA-256：`5acb6726845d6b49980e04e4ba61e6fe43cf1db4e44dbdc6ef4fa8f31738a232`。
- 外形：四足、双翼、双角、长尾与鞍座。翼膜是闭合薄网格，独立翼根与翼尖骨骼驱动。
- 动作：普通及方向飞行、快速飞行、加速、俯冲、悬停、左右闪避、喷火开始/循环/结束、闭嘴参考姿态和地面待机。起降沿用 SDK 对地面与空中动作的混合；上下龙沿用现有人物与登乘梯流程。
- 适配：Seat 骨骼加运行时 0.06 m 偏移；7 个躯干/颈/头部阻挡球，翼尖、尾尖和角尖允许擦边。飞行参数、相机与输入保持现有权威实现。
- 入口：训练场“选择飞龙”中的 `LP01 · 翡翠低模龙（原创）`，或 `?dragon=LP01#/scenes/flying-creature-training`。原有 D01–D11 保留。

用 Blender 4.5 执行 `--background --python-exit-code 1 --python scripts/assets/build-low-poly-dragon.py` 可重建资产，同时更新 variants/bundle。可编辑源文件输出到 `D:/CodexData/Artifacts/LowPolyDragon-LP01/LP01.blend`。

## 验证

2026-09-11：`flying-creature-visual.test.ts -t 'LP01|publishes eleven'` 的 5 项测试通过，覆盖真实核心蒙皮与碰撞、实际人物骑乘视角及上下龙过渡、动作混合/挂点稳定性、四足/地面高度/不透明材质、原有十一条龙清单。测试还验证喷火仅改变下颌而不后缩头部。定向 ESLint、测试目录 census 与 `build:editor` 通过。

构建产物在 5195 的浏览器验证：LP01 资源成功加载；召唤从 40 m 空中完成接近、落地及收翼，状态为 `summon.arrived` / `grounded`，无碰撞或落地失败。骑乘及上下龙使用上述实际 SDK/人物集成测试验证，未声称本轮完成浏览器手动驾驶验收。

全仓 typecheck 被同期编辑的 `shared/preset-content/soaring-shell.ts:80` 语法错误阻塞；SDK prebuild 被 `packages/three-world/src/index.ts` 引用缺失的 `motion-families/registry.js` 阻塞。本次没有修改这些其他工作内容。浏览器验证使用语法错误出现前构建成功的训练场产物。
