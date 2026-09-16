# 相机职责边界与回归验收

本页供维护者重构相机时使用，配合[架构维护规范](three-sdk-architecture.md#相机扩展维护规范)和[运行时检查清单](reviews/runtime-deep-review-checklist.md)。它描述当前实现，不增加生产作品的生成步骤。

## 当前职责分工

相机保留一个状态提交者。拆分的是计算职责，不是增加多个相机控制器。

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| [controller](../packages/three-world/src/camera/controller.ts) | 接收合法请求、主体身份和 generation 校验、固定步事务、切换激活、历史与状态提交、失败回滚 | 不在 Host 或 UI 再实现一份控制器 |
| [input-intent](../packages/three-world/src/camera/input-intent.ts) | 校验语义输入，计算本步环绕、俯仰、缩放意图和移动方向基准 | 不绑定设备、不写 Three 相机、不让碰撞结果反过来决定行走方向 |
| [view-transition](../packages/three-world/src/camera/view-transition.ts) | 为已经获准的视角切换计算初始意图、朝向连续性、切镜或混合方案 | 不决定请求权限，不拥有 pending 激活状态，不实现游泳等自动选镜规则 |
| [pose](../packages/three-world/src/camera/pose.ts) 与 [strategies](../packages/three-world/src/camera/strategies/) | 从主体事实、配置和已有历史计算期望姿态、过渡候选 | 不发布状态、不推进独立时钟、不直接写主相机 |
| [constraints](../packages/three-world/src/camera/constraints.ts) | 接入现有碰撞求解器；固定步求解与显示投影使用各自既有合同 | 不新建物理世界、不改变载具物理、不在显示采样中推进恢复历史 |
| [display-sample](../packages/three-world/src/camera/display-sample.ts) | 对已经提交的前后帧插值，按显示主体锚点对齐，返回显示候选 | 不消耗输入、不修改固定步历史、不替代 controller 的身份检查和碰撞投影 |
| [state](../packages/three-world/src/camera/state.ts) | 定义提交状态与观测数据合同 | 观测返回值不能成为修改控制器内部状态的通道 |
| [engine](../packages/three-world/src/engine.ts) 与 [presentation](../packages/three-world/src/camera/presentation.ts) | 在既有固定步和展示事务内把已求出的姿态应用到 Three 相机 | 不添加第二套 requestAnimationFrame；作者相机模式仍遵循现有交接合同 |
| Playground [世界观察镜头](../apps/sdk-playground/src/display-camera.ts) 与 [取景窗](../apps/sdk-playground/src/camera/preview.ts) | 显示模型、取景范围、碰撞探针与游玩镜头预览 | 不接管游玩镜头状态，不把辅助线和 UI 混入纯世界捕获 |

配置字段、默认值、解析与校验仍统一归 [SDK config](../packages/three-world/src/config/README.md)。Creator 发现入口和 Playground 消费它们，不各自复制默认值。显式 `setCameraView` 与可选 `viewSelection.rules` 均已实现。[view-selection](../packages/three-world/src/camera/view-selection.ts) 按已提交状态选择视角；controller 保留手动选择、编辑和 Episode 控制权，调用 view-transition 计算过渡。未声明规则的文档不启用自动选镜。

主体数据通过 [WorldCameraSubjects](../packages/three-world/src/camera/world-subject.ts) 接入：它只接收普通实体读取函数及可选的 `CameraSubjectSource`，后者仅提供主体采样和操作身份。Engine 在原装配位置连接原生 Host；适配器不再引用完整 HumanoidRuntime。原生采样优先，只有没有原生结果时才回退普通实体；异常继续向上传播。固定／显示采样与主体 generation 的来源保持不变，显示采样仍必须在已有展示事务内执行。

## 一帧如何流动

1. World 的既有固定步接收语义输入；controller 校验请求与主体，计算输入意图和移动方向基准。
2. 使用物理后的主体事实求期望镜头、过渡与碰撞约束，由 controller 提交固定状态。事务失败恢复原状态。
3. 展示阶段从已提交的两帧取样，必要时重新投影碰撞，只输出当前显示姿态；不再推进输入、过渡时钟或碰撞恢复历史。
4. Engine 在既有展示事务中应用姿态，Creator 临时捕获结束后恢复展示状态。Episode 接管时保留原有独占时钟与控制租约。

读 `inspectCamera`、打开辅助显示、反复截图或改变显示插值比例，都不能额外推进模拟。`sampleProjection` 返回对象与提交历史隔离；调用方修改返回对象不能影响下一次取样。

## 每次结构调整的验收顺序

先固定基准，再移动职责。一次只拆一个计算边界；同一次结构调整不改变相机参数、按键、碰撞算法和载具物理。确需行为修复时另列问题、期望变化和验证场景。

### 自动回归

从仓库根目录运行已有测试。以下入口对应真实消费者，无需新建测试框架：

```sh
pnpm exec vitest run packages/three-world/src/camera packages/three-world/src/camera-observation.test.ts packages/three-world/src/camera-public-conformance.test.ts packages/three-world/src/camera-world-integration.test.ts packages/camera-collision/src/camera-collision-solver.test.ts
pnpm exec vitest run apps/sdk-playground/src/camera apps/sdk-playground/src/display-preview.test.ts apps/sdk-playground/src/display-camera-probes.test.ts apps/sdk-playground/server/camera-config.test.ts
pnpm exec vitest run packages/creator-host/tests/discovery/camera-configuration.test.ts packages/creator-host/tests/discovery/camera-presets.test.ts packages/creator-host/tests/compiler/camera-configuration.test.ts packages/creator-host/tests/integration/vehicle-camera.test.ts
pnpm exec vitest run packages/three-world/src/episode.test.ts
pnpm typecheck
pnpm lint
pnpm test:census
pnpm verify:workspace-boundaries
pnpm build
pnpm build:editor
```

最后一项必须实际写出编辑器生产文件，不能只以开发服务器启动或内存构建代替。测试日志、生成的 runtime 和构建文件保存在忽略目录，不提交到源码仓库。

文件符号链接安全用例需要运行环境允许创建真实链接。Windows `EPERM` 出现在夹具创建阶段时，不等于业务断言已通过；应在支持链接的环境重跑同一文件，保留文件链接和父目录链接均拒绝的原断言。不得用 mock 或跳过测试宣称已通过。

纯重构还需用重构前保存的相同输入轨迹比较结果：主体、配置、固定时间步、几何和查询顺序一致，覆盖人物／车／马 × 无遮挡／墙／坡侧，包含第三人称、第一人称和越肩切换。比较固定状态、移动方向基准、显示采样、查询与命中；每次显示采样后确认提交状态没变。比较时禁止覆盖旧基准。基准脚本、原始轨迹与日志可保存在独立本地验收归档，不以新输出替换旧结果。

### 浏览器定点验收

使用相同场景和项目相机配置，先记录主体、位置、视角、yaw/pitch、期望／实际镜头距离、遮挡对象、simulationTime 和提交版本。测试入口造成的暂停要明确区分于游玩故障，完成后恢复运行。

| 场景 | 操作 | 通过条件 |
| --- | --- | --- |
| 人物 | T 依次切第三人称、第一人称、越肩、第三人称 | 一次按键切一次，主体正确，实际画面与状态一致 |
| 越野车和马 | 登乘、三视角切换、下车；切换期间再操作 | 镜头主体随交接更新，旧主体缓存不残留，视角保留规则与基准一致 |
| 坡侧静止 | 镜头压到坡侧，松开鼠标与移动键；随后转出遮挡 | 连续观测没有持续往复抖动；离开遮挡后按现有恢复规则回到期望距离 |
| 世界观察 | 开启摄像机与碰撞辅助，拖动世界镜头、定位、跟随 | 模型、取景框、探针可见；角色／载具控制仍可用 |
| 实时取景窗 | 放大、还原，在观察模式按 T | 取景窗跟随游玩镜头，模拟持续运行 |
| 观察隔离 | 在同一暂停帧拖动世界镜头，再比较游玩状态 | 游玩镜头、提交版本、simulationTime 不变 |
| 关闭辅助 | 关闭摄像机与碰撞辅助，继续游玩 | 回到原游玩模式和对应视角，不遗留输入捕获 |
| 捕获与录制 | 运行 Creator／Episode 相关测试 | 捕获恢复状态、独占控制、reset 与释放保持原合同 |

坡侧复测可使用 campus 的 `grade-12`：马位于约 `[37.990364, 0.0151, 163.605836]`，第三人称 yaw 约 `4.021522385` rad、pitch 约 `0.12` rad。该点期望臂长 8 m、受约束距离约 4.879295 m；这些是定位参考值，不是新的相机默认值，也不用于全场景硬编码。不同资源或配置版本需先核对身份再比较数值。

离散抽样稳定只证明已采样时间点，不等价于逐帧录像或所有载具／所有坡道通过。验收报告需说明覆盖范围、浏览器错误和仍未处理的问题。

## 当前保留的边界

本轮整理没有引入独立生命周期组件框架或新的相机包；合并保留 dev 已实现的可选状态选镜。飞机越肩表现与放大取景窗被其他 UI 遮挡，仍按既定范围另行处理。不要通过本轮重构悄悄改动它们。
