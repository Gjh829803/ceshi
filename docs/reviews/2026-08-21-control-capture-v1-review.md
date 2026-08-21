# Simulation Take / Control Capture V1 深度评审

- 评审日期：2026-08-21
- 评审范围：`34137c4` 之后的 Simulation Take、Capture Profile、Runtime/Browser
  Capture Protocol、Babylon 五 Pass、Playwright Runner、原子 Bundle 与 CLI。
- 对照规格：
  [`2026-08-19-simulation-take-control-capture-design.md`](../superpowers/specs/2026-08-19-simulation-take-control-capture-design.md)
- 实施计划：
  [`2026-08-21-simulation-take-control-capture-v1.md`](../superpowers/plans/2026-08-21-simulation-take-control-capture-v1.md)
- Runtime Checklist：[`runtime-deep-review-checklist.md`](./runtime-deep-review-checklist.md)
- 结论：V1 窄纵向切片的架构边界、确定性时间映射、Runtime Authority、五 Pass
  真实性和 Bundle 引用完整性成立；最终合入结论以本文第 7 节新鲜全量门禁为准。

## 1. 范围与非目标

本次只交付一条生产形态的窄切片：严格 `SimulationTakeV1` 经固定 Tick Runner 驱动
Canonical Babylon/Havok Runtime，在精确 Capture Schedule 上生成五个结构 Pass，并由
Node 端原子写入、重新计算并校验 `ControlCaptureBundleV1`。

本次没有实现，也不能从 Smoke/Probe 推断为已支持：

- 完整 WorldPackage 目录、Registry Lock、签名和跨机器分发；
- Semantic Action、Event、Relationship Receipt Track；
- Resume、多 Session 拼接和完整 Replay Metric；
- Motion Vector、Albedo/PBR Pass、WebGPU Profile；
- VideoModelAdapter 或生成式视频；
- 新相机算法、新 Gameplay、游泳或特殊地形。

## 2. Authority Map

| 状态/制品 | 唯一 Authority | 只读消费者 | 评审结果 |
|---|---|---|---|
| `simulationTick` | `BabylonWorldRuntime.runFixedInput` | Take Runner、Snapshot、Frame Metadata | Render 不推进 Tick |
| `renderFrameIndex` / Render Ready | `BabylonWorldRuntime.renderFrame` | Browser Reservation、Capture Provider | Fixed Input/Reset/Camera/Resize 后旧 Receipt 失效 |
| `captureFrameIndex` / Tick 映射 | Pure Take Compiler | Runner、Bundle Writer/Validator | 60 Hz → 24 fps 使用整数有理数算法；600 Tick 为 240 帧，0..597 |
| Subject Transform / Action | Havok Controller + Subject Visual | Snapshot 与所有 Pass | Capture 不重算位置或动作 |
| Camera Orbit / Matrix | `CameraDirectorV1` + Babylon Camera | Frame Metadata 与所有 Pass | Take 只提交显式 Delta，不旋转 Subject |
| Pass Bytes | Babylon Capture Provider | Browser Base64、Node Writer | 五 Pass 独立读取，不复制 Neutral Screenshot |
| Semantic / Instance Table | 稳定字符串排序后的 Capture Table | ID Material、Frame、Bundle Validator | 不依赖 Mesh Draw Order |
| Runtime Session | Host 注入的 UUID | Receipt、Frame、Bundle | Bundle 内禁止混 Session |
| Bundle Root | Node Finalizer 重算所有文件字节 | Validator、Adapter | staging 完整后才原子 rename |

未发现第二层根据 Height Sample 决定 Ground Support、Render Frame 推进模拟时间、相机反向
旋转主体或 Browser 页面写文件等重复 Authority。

## 3. Babylon 9.21.2 源码核对

安装版本由 workspace 依赖实测为 `@babylonjs/core 9.21.2`。本次没有依赖记忆推断：

- `Rendering/depthRenderer.pure.js`：`storeCameraSpaceZ` 生成
  `STORE_CAMERASPACE_Z`；`Shaders/depth.fragment.js` 将 `vViewPos.z` 写入 R 通道。
  V1 取绝对值得到正值 Camera-space 米制 Depth，Clear/No-hit 固定为 0。
- 同一实现的 `_initShaderSourceAsync` 和 `_shadersLoaded` 证明 Depth Shader 是异步可用；
  Capture 在 `RenderTargetTexture.isReadyForRendering()` 成立后才读回，且以 15 秒稳定
  Diagnostic 超时，未使用任意 `sleep` 猜测 readiness。
- `Rendering/geometryBufferRenderer.pure.js` 明确区分
  `generateNormalsInWorldSpace` 与 `normalsAreUnsigned`。V1 开启 World Space，并根据实际
  Texture 类型解码/单位化，而不是假设固定的 signed/unsigned 格式。
- `Materials/Textures/renderTargetTexture.pure.js` 将
  `setMaterialForRendering` 委托给隔离 Object Renderer；Semantic/Instance Pass 因此不替换
  Gameplay Mesh 的权威 Material。所有临时 Target/Material/Renderer 在 `finally` 释放。
- WebGL `readPixels` 返回底部行为 V1 通过不对称两行 Codec Test 锁定为 top-left 输出；
  Float/Uint32 原始文件通过 DataView 明确 little-endian，不依赖宿主 TypedArray 端序。

## 4. 对抗性覆盖

### 4.1 Schema 与 Schedule

- 关闭未知字段、错误 Hash、重复 ID、冲突 Track、非法 Tick/Rate/Axis；
- `explicit-ticks` 不静默排序/去重；
- 相同 Take Hash 稳定，Control 或 Camera 改变都会改变 Take Hash；
- 600 Tick / 24 fps 精确得到 240 个 Entry，首帧 Tick 0、末帧 Tick 597。

### 4.2 Runtime 与 Browser

- Simulation Tick 与 Render Frame 分离；Reset 和状态变更使 Receipt 失效；
- NullEngine 缺 Float/MRT 时在 Capture 前稳定拒绝；尺寸越界拒绝；
- Browser `waitForRenderReady` 后保留一次 Capture Reservation，防止 Adapter RAF 在
  Playwright 的两个调用之间替换 Receipt；Capture 成功或失败都释放 Reservation；
- 暂停 Capture 不推进 Camera/Animation 时间，捕获后恢复原 Pause 状态；
- Row Flip、Depth、Normal、Uint32/Float32 端序和 Draw-order-independent Table 有焦点测试。

### 4.3 Bundle 与 Runner

- Writer 只接受编译 Schedule 的连续 Frame；少帧、错误 Tick、混 Session 均不发布；
- 缺 Pass、改字节、旧 Root、错 Frame Hash、混 Take/World 被阻断；
- Validator 重新编译 `take.json`，交叉检查 Manifest、World Identity、Profile Lock 和
  ID Table。即使攻击者同步重算 Frame/Manifest/File/Root Hash，也不能让 Bundle 脱离
  权威 Take；
- Keyframe 在声明 Tick 生效，Jump 只在离散 Keyframe 触发一次，Capture 只发生在编译
  Schedule Tick；Runner 不调用超时 sleep 作为协议正确性条件。

## 5. 真实 Chromium 证据

命令：

```bash
WORLDKIT_VERIFY_ARTIFACTS_DIR=/tmp/worldkit-control-capture-evidence-2 \
  pnpm verify:control-capture
```

两个源 Take 均为 600 Tick / 240 Frame；Gate 为控制日常成本，从各自源 Take 派生 1 Tick /
1 Frame Probe，但仍经过真实 Vite、Chromium、Browser Protocol、Babylon WebGL、五 Pass
RenderTarget、Bundle Writer 和 Validator 全链路。

共同 WorldPackage Root：
`sha256:428998f06fd5823c349e29c715c45dfe0410b32b58c452084d206f91bcaa11fc`。

| 证据 | Walk Probe | Orbit/Run Probe |
|---|---|---|
| 源 Take Hash | `sha256:093c01fdc1e86de28f24f3efc4f88e5ffdaaef3304ea8ef597def136e669dd5b` | `sha256:0927f3608b110413a9507a891de9dbc459f937fc990089772972a14b84f2974d` |
| Bundle Root（本次留存） | `sha256:9edb500146b939f4bbc792d78f5873ca658554bbef3dccf47423ed455d981992` | `sha256:076fbce2b2d1b7dbcf7a95f75b21f04f8fde9710b711a07f02a904476b71b1d9` |
| Neutral PNG | 160×90；`sha256:452e0fa50d9107cc7e2a836f30c7be890ee748ed69ee7e596d545cfc086f0e25` | 160×90；`sha256:50ecd96939ebdd084bc3fd1a9c0bf2fcf6856a9835b60fa4999aaac65d8eba57` |
| 非零 Depth Pixel | 9742；`sha256:25a00c4a32b4f0dc9ed5f22ec4e66f47a8df6aae33f6b61932c5833ea6225f86` | 8750；`sha256:050362631ddeca8f7d815196bf3274464aa09b0098c612aabdb612b560983b96` |
| Semantic ID | `{0, 5}`；表内合法 | `{0, 5}`；表内合法 |
| Instance ID | `{0, 5}`；表内合法 | `{0, 5}`；表内合法 |
| 非零单位 Normal Pixel | 9680；`sha256:06b7bf21e17c1737eb52dcd1c1afd2427745a1ba840a51688ebedc8b348f73e3` | 8921；`sha256:e1252a34bc137937ca4d0f6acc7b0548b539828318bafba5e7d7290415357791` |

人工查看两张 Neutral PNG，均显示浅色海岸地面、蓝色背景、红色 Subject 和棕色静态
障碍；两个 Camera Track 的主体/障碍构图不同，不是相同背景被不同 Hash 包装。

## 6. 残余限制与风险分类

| 项目 | 分类 | 处理 |
|---|---|---|
| 常规 Gate 不生成两套完整 240 帧 Bundle | 已接受的测试成本边界 | 源 Schedule 用纯测试验证 240 帧；真实浏览器用派生 Probe；视频接入前增加离线全序列 Gate |
| 当前 WorldPackage Root 是 IR/Plan Hash 的过渡组合 | P1.4 能力缺口 | 文档与 Manifest 明示，不宣称完整 Package/Registry Lock |
| Event/Action/Relationship Track 当前为空 | P0.2 后续 | 不从空文件推断 Receipt 支持；进入统一 Replay 前实现 |
| 只验证 Chromium/WebGL Platform Profile | 平台范围 | 不承诺 WebGPU 或跨 GPU bit-for-bit；后续使用 Platform Metric Gate |
| Bundle 完整性没有外部签名 | 信任边界 | 当前证明内部自洽和引用归属；跨主机分发前由完整 WorldPackage/Artifact Signing 补齐 |
| Vite 大 Chunk 警告 | 既有非阻断构建警告 | 与本切片正确性无关；继续由构建体积 Backlog 跟踪，不在本任务顺带拆包 |

## 7. 新鲜完成门禁

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 70 Files、629 Tests 全部通过 |
| `pnpm test:scenes` | 2 Files、26 Tests 全部通过 |
| `pnpm build` | 通过；2129 Modules；保留既有大 Chunk 警告 |
| `pnpm verify:canonical` | 通过；Browser/Havok/水域/墙体/双实例/Reset Gate 全部成立 |
| `pnpm verify:placement-layout` | 通过；19 Constraints、真实 Browser/Havok、确定性与负向 Gate 成立 |
| `pnpm verify:rigged-subject` | 通过；四动作、Pose Difference、双实例、墙体、资产篡改成立 |
| `pnpm verify:g-bot-subject` | 通过；四动作、Pose Difference、双实例与墙体成立 |
| `pnpm verify:control-capture` | 通过；两个真实 Chromium 五 Pass Probe 成立 |
| `git diff --check` | 通过 |

第一次运行 `verify:placement-layout` 时准确发现该 Gate 仍把 Browser API 键集合锁定在
新增 Capture 方法之前。Disposition：更新 Gate 和持久化 Verification Artifact，使其同时
要求四个新增方法并继续禁止 `solve/search/repair/mutate` 旁路；随后重新运行通过。该失败
不是忽略的 Flake，也没有通过放宽断言处理。

### 7.1 `origin/main` 集成处置

最终合入前发现 `origin/main` 已推进到能力驱动 Motion/Camera 框架。该变更与本切片在
Runtime Session、Babylon Runtime、Browser API 和 Playground Adapter 存在语义交叉，
因此以三方合并提交 `3f546da` 集成，而不是覆盖任一侧：

- Runtime Session 同时保留新的 Camera Tuning / Input Axes 契约与 Control Capture
  Receipt / Frame 契约；
- Fixed Tick 同时更新能力驱动 Input 状态并使旧 Render-ready Receipt 失效；Render Frame
  仍不推进 Simulation Tick；
- Reset 同时清空新的输入状态、重置 Camera Director 并使 Capture Receipt 失效；
- 定向运行 6 个交叉区测试文件、136 Tests 全部通过；随后在合并提交上重新运行第 7 节
  完整矩阵；在产品资产模板与 Hybrid Terrain 评审一并进入最终 `main` 后，最终结果为
  70 Files / 629 Tests、26 Scene Tests、五项真实 Browser Gate 全部通过；
- 新 Motion Profile 改变了 Rigged/G Bot 的预期位移、姿态和派生 Hash。重新生成并提交
  受影响的 Screenshot、Snapshot、Build 与 Verification Artifact；Pose Difference、双实例
  隔离、墙体阻挡、资产篡改和 Capture Pass Hash 门禁仍成立。

最终快进前 `origin/main` 又推进到产品资产接入模板 `67dca5f`。第二次三方合并仅在本
Backlog 的里程碑状态产生文本冲突：保留已完成的 Capture M2/M3，同时吸收并标记已完成
的产品资产模板 M1。新增 Product Asset Intake 的 3 个测试文件、12 Tests、类型检查和
更新后的真实 G Bot Gate 均通过；G Bot 派生 Artifact 二次运行保持干净，证明两条纵向
切片可以共存且证据生成稳定。

## 8. 最终结论

没有未处置的 P0/P1/P2 级发现。V1 达到计划中的窄纵向切片完成标准，可以合入
`main`。本结论只覆盖本文第 1 节的范围；第 6 节所列能力仍留在 Backlog，不能用本次
通过记录宣称完整视频世界模型链路已经生产就绪。
