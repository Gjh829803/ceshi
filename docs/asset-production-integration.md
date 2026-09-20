# 资产包提交与 Agent 接入规范

面向资产生产和接入同事。完成标准是：**资产已提交，Agent 能找到、知道怎么接入，并能使用已声明的能力。** 提交资源、登记信息和使用说明；有新行动模式时，再附实现或明确的接入需求。

日常路径是 **Playground 调好 → Codex 按 [接入 Skill](../.agents/skills/whitebox-content-integration/SKILL.md)
整理与绑定 → Creator 实际发现/执行 → Episode 使用同一运行时验证**。
AI 可以编辑所属资源、binding、配置和必要代码，不要求内容全部套入统一注册框架。
工程工具用于减少重复和核对身份；资产定义与实例、clip 与行为、共享资源与实例状态分别维护。

## 接入维护约束

以下规则约束负责接入素材和能力的开发者及开发 Agent，覆盖资产、SDK、Creator 和示例的
跨包修改，用于保持现有去重与分层结果，不增加生产 Agent 创作世界的执行步骤。

- 按既有包职责、目录和资产分类更新所属文件。保留“任务要求 → 编程规范 → SDK 索引 →
  资产分类 → 所需能力或绑定”的阅读层级，优先扩展已有分类和 topic。
- 每项要求、能力说明和绑定流程只维护一处权威来源，其他文档和工具入口引用它，
  不在多个指南、资产页面或示例中重复展开。
- 公开文档和片段只保留理解接口所需的最小参数化绑定。完整可运行示例和自检夹具放入
  既有示例或内部夹具目录，按实际消费者登记、引用，不嵌入生产 Agent 指南。
- 按受影响范围核对实际发现工具返回的导航、接口和示例，防止后续接入重新引入
  重复说明、冗长示例或与能力无关的场景配方。

## 命名规范

本节是全仓库命名规则的权威来源，适用于代码、API、配置、工具、文档和生产产物。
资产接入涉及的资源、能力、绑定与实例遵循同一套规则。

所有名称必须清晰、无歧义，忠实表达实际指代对象、职责和行为。使用相关技术领域当前
通行的术语和命名惯例，使 AI 维护者和生产 Agent 能够正确理解和使用。

全项目保持术语和命名风格一致，遵循对应语言及文件格式的惯例。同一概念在不同界面、
代码和文档中使用一致术语，不同概念使用不同名称。

既有名称不豁免：发现不一致或具有误导性的名称，必须重命名，并同步更新其引用、
消费者和文档。不能仅因为名称已经存在，就保留不符合规范的命名。

避免含糊的缩写、自造术语，以及暗示不存在的能力或错误职责归属的名称。
当省略作用范围、单位或生命周期状态可能引起误解时，必须在命名中明确表达。
命名应降低 AI 维护成本，减少生产 Agent 的误解、错误操作和重试。

## 1. 从目标分支另开资产分支

拉取 `main` 最新版本，从它新建自己的资产分支。PR 的目标分支选择 `main`，不直接推送共享分支。

一个资产包或一类能力一个 PR，不混入无关清理、目录重构和评测运维改动。

## 2. 一个资产包可以包含什么

资产包可以包含一个或多个配套主体、动画、行动模式和场景组件，按实际用途组合，不要求每个包都包含全部内容。**包是提交组织单位，资产 ID 是 Agent 的选择单位**；可独立使用的模型分别登记稳定 ID，依赖已有资产时引用其 ID，不重复复制。

资源唯一来源是 `asset-library/subjects/<分类>/<稳定ID>/<版本>/`。模型在 `model/`，独立动作在 `animations/`，实际文件与哈希在 `resources.json`；原有双目录已退役。

| 内容 | 何时提供 | 交付要求 |
| --- | --- | --- |
| 模型/组件 | 包含新外观时 | 角色、动物、载具、道具、环境或组合组件；普通加载入口使用自包含 GLB |
| 材质与贴图 | 模型依赖时 | 随模型交齐，普通 GLB 的贴图和 buffer 内嵌；不得留下制作机器上的路径 |
| 骨骼与动画 | 包含动画时 | 与模型兼容的骨骼、真实片段名、循环设置和必要资源；独立动画资源需明确加载和绑定方式 |
| 行动模式/能力 | 包含行为时 | 复用模式及参数、单位和范围；新增行为附对应实现，或标明待 SDK 同事接入的需求 |
| 场景与交互配置 | 能力有场景要求时 | 碰撞、座位/挂点、交互锚点、出生点、水体或攀爬面等必要配置，说明由哪个接口消费 |
| 清单、来源与授权 | 每包必交 | 包内资产 ID、实际文件和依赖、来源、许可证；尺寸、朝向等事实写入说明，哈希和字节数按最终文件登记 |
| `README.md` 与使用入口 | 每包必交 | 包的用途、各资产如何组合、已支持/待接入能力、对应使用说明和可复用示例；已有入口可以引用 |
| 预览与验证说明 | 每包必交 | 能看清资产的预览，以及实际检查结果；有行为的包提供能演示主要能力的示例或操作证据 |

行动实现和程序化 Mesh/场景构造代码按职责放入 SDK 或示例目录，通过同一个 PR 提交；它们不会因为放在资源目录里就自动执行。原始 FBX、Blender/Unity 工程和制作过程文件保留在制作侧，在 README 提供链接；运行包只收录实际需要的资源。

世界整体以白色为主，主体、关键客体和需做三视图的标识物用不同的克制识别色区分；地面、水面等用轻微灰度或色调差区分。同一对象在游玩与各视图中保持颜色一致。主体尽量复用提供的资源，人形使用提供的模型与动作，不额外做装饰。

颜色由 Agent 根据参考图和场景关系自行决定，不绑定固定身份色表。不同关键客体分别配色，
同类重复对象可以共色；有敌人需求时使其易于区分，不因配色类别而额外生成敌人或玩法。
资产提交保留原始资源，不为每种身份复制 GLB。人形通过 `characterColor` 或实例
`setColor` 着色；其他模型通过 `setObjectColor` 创建独立材质，原贴图 RGB 不参与叠色。
资产侧说明透明裁切、材质槽及自定义着色器需求；接入侧检查多个实例、工厂生成、骑乘、
重置和各视图的配色一致性，并按模型生命周期释放着色绑定。详细接口见
[人形接入](../packages/creator-host/docs/agent/assets/humans/integration.md)及
[对象配色](../packages/three-world/README.md#per-object-whitebox-color)。

## Agent 文件结构与阅读路径

```text
packages/creator-host/docs/agent/
  README.md                 通用要求、交付标准、何时读哪份说明
  programming.md            编程规范、检查工具、录制与交付
  sdk.md → sdk/basics.md     SDK 能力索引及公共能力
  examples/                 raw、humanoid、actions、mount、vehicle、nonhuman 最小片段
  assets/README.md          资产分类入口
    humans/README.md        人形入口
      movement.md           运动
      actions.md            场景动作
      interactions.md       交互
      integration.md        人形、镜头与骑乘接入
    animals/README.md       动物/生物 → 独立主体或骑乘
      flying-mounts.md      飞行坐骑的资产选择、条件与接入
      flying-mounts.ts      同类资产共用的最小绑定片段
    vehicles/README.md      载具配置、绘制与驾驶接入
    scene/README.md         地形、道具、标识物与交互
```

自然阅读从 `creator_describe_environment.readingGuide` 进入四个通用入口，
再通过分类页返回的 `navigation.children` 逐层读取；按名字搜索时，
`assets_search → assets_describe.documentation` 直接进入所选资产所属的下层说明。
飞行坐骑的 `assets_describe.bindingExample` 给出 `mounted-interaction` 下的
`flying-creature` 变体。说明讲何时使用和如何判断结果，片段只写绑定与生命周期；
参考图构图、场地规模、出生点、HUD 和游玩路线由当前任务决定。

同类新资产复用此路径，只增加各自资源、标定和能力数据。新增分类子页须在
[agent-docs.ts](../packages/creator-host/src/discovery/agent-docs.ts) 注册路径与父子导航；资产条目的
`integrationMetadata.documentation` 指向该已注册页面，`assets_describe` 实际读取它。
绑定有差异时在 [binding-examples.ts](../packages/creator-host/src/discovery/binding-examples.ts)
和 MCP 参数中接通所属 topic 的变体，并从真实工具走通搜索、说明、片段、接口查询。
较深的 schema/源码只在配置或修改能力时读取。

## 3. 注册到 Agent 能读取的入口

| 注册内容 | 放在哪里 | Agent 如何获取 |
| --- | --- | --- |
| 资产及能力信息 | [subjects/](../asset-library/subjects/) 下的 asset.json、capabilities.json、resources.json、bindings/whitebox.json 和 profiles：稳定 ID、真实资源、能力、绑定和限制；`pnpm content:sync` 生成 Host 目录和 package 配置快照 | `assets_search` 查找，`assets_describe` 读取详情 |
| 可用权限 | [asset-policy.json](../packages/creator-host/config/asset-policy.json) 的 `allowedAssetIds`，保留默认主体和现有策略 | 进入白名单后，才会出现在上述工具中；Agent 再用项目 `project.json.assetIds` 选择要打包的资产 |
| 分类阅读入口 | [Agent 资产索引](../packages/creator-host/docs/agent/assets/README.md) 及人、动物、载具、场景对象子目录；新增子页时接入 [agent-docs.ts](../packages/creator-host/src/discovery/agent-docs.ts) 的路径和父子导航 | `creator_get_authoring_schema({document:...})` 按层读取，页面再链接具体资产与能力 topic |
| 能力接口与说明 | SDK 对应实现、[SDK 指南](../packages/three-world/README.md) 的 topic，以及 [authoring-schema.ts](../packages/creator-host/src/discovery/authoring-schema.ts) / [creator-discovery.ts](../packages/creator-host/src/discovery/creator-discovery.ts) 的主题分派 | `creator_get_authoring_schema` 默认读取简短 guide，按需用 `sections` 获取 contracts、commands、humanoid 等接口 |
| Agent 接入片段 | [agent/examples/](../packages/creator-host/docs/agent/examples) 与 [binding-examples.ts](../packages/creator-host/src/discovery/binding-examples.ts)；复用对应主体的现有入口，片段只演示绑定和调用 | `creator_get_examples` 返回最小代码及文件清单，场景和参数由 Agent 提供 |
| 内部运行示例 | `examples/three-creator/`；在 [example-registry.json](../packages/creator-host/config/example-registry.json) 登记 topic、root 和默认文件，供维护者回归和运行包引用 | 维护者通过示例预览/测试使用；新增登记不会自动扩充 Agent 的片段入口 |

包内文件不会自动全部加载，依赖的其他资产 ID 也不会自动被选中：文件依赖登记到条目的 `resources`，需要组合的资产 ID 在项目中一并选择。

`pnpm content:check --asset <assetId>` 核对派生目录和选中资源实际 hash/字节数，分别报告目录、
policy、资源验证状态；动作、视觉和发布仍需要各自的实际证据。独立源减少多人编辑聚合目录的冲突。
已有 import/export 脚本写回所属源，随后更新派生目录；不手工维护两份可变 metadata。

同类资产复用已有能力、topic 和示例；只有新增能力时才扩展接口和工具说明。接入同事要确保资产描述能指向正确的使用入口；新增能力的指导信息需实际接入工具返回内容。

项目使用自带 `sdk/` 时，schema 和 `runtimeDefinitions` 读取该项目的源码，并返回 `runtimeSourceHash`；按这个身份核对编译和运行时检查结果。目录搜索与宿主示例只作为资产发现和接入基线，不能证明修改后的能力条件仍然相同。

**目录中的 README 不会被 `assets_describe` 自动读取。** 名称、动作/模式、操作提示和限制必须进入工具可见的信息，例如 `displayName`、`actions`、适用时的 `vehicle.spec.hint`、`limitations`；较长说明放入可读取的 topic 或示例。检查工具实际返回了什么，不能只检查文件是否存在。

## 4. 让 Agent 能正确使用

每类能力提供一张简短使用说明，资产生产同事填写事实，接入同事补齐接口和示例入口：

| 必须讲清楚 | 内容 |
| --- | --- |
| 何时选它 | 用途、适用场景、已支持和未支持的能力；名称及描述包含用户常用的叫法 |
| 如何直接复用 | 资产 ID、绑定/创建入口、需要一起选择的资源、对应 topic 和最小示例 |
| 如何触发 | 统一按键或实际命令；区分动画播放、可执行动作与自动状态转换 |
| 什么条件下可用 | 主体状态、目标、距离/速度等阈值，以及碰撞、净空、水体等必要场景条件；特殊动作不能省略这些条件 |
| 如何判断结果 | 完成状态、可查询的 snapshot/operation，以及拒绝原因或失败反馈；请求被接受不等于动作完成 |
| 如何调整与扩展 | 可调参数、单位和范围；需要改底层时给出真实源码入口，继续使用 SDK 的统一控制与时钟 |
| 镜头如何接入 | 主体坐标系、身体范围、实际眼位/座位、支持视角及其配置入口；首帧由 Agent 决定，资产不能带入自动重置首帧的脚本 |

Agent 的使用顺序应明确为：**搜索资产 → 查看能力说明 → 读取所需 schema/示例 → 选择资源并绑定 → 检查条件后操作 → 查询实际结果。** 一般任务直接复用，需要变化时再调参数或修改对应源码。

只填写模式名称或上传动画不会自动获得能力。新增行动模式需接通 SDK 实现及 Creator、Episode 消费端；由不同同事完成时，在 PR 中标明负责人、待接入项，并将未完成能力标成未支持。

### 新主体的镜头与输入接入

初始关系与镜头的接入顺序统一遵循 [编程规范](../packages/creator-host/docs/agent/programming.md#initial-state-and-camera)。资产侧提供下表事实；不在资产包中另写初始化按键或镜头接管脚本。
新增视角策略或按行动状态选视角时，遵循 [相机扩展维护规范](three-sdk-architecture.md#相机扩展维护规范)；该文档区分当前能力与待实现的状态选择合同。

资产生产侧提供以下事实，并由接入同事绑定到实际接口。仅命名一个 `camera.driver` 节点不会自动启用驾驶视角。

| 资产侧提供 | 接入位置与约定 |
| --- | --- |
| 根节点、尺寸、正前方与单位 | 米制、+Y 向上；普通主体语义前方默认局部 -Z，Humanoid/载具航向使用 +Z。记录实际转换，不旋转预设骨架来迁就镜头 |
| 身体范围与独立主体眼位 | `addCharacter({body,eyePositionLocalMetersXYZ})`；眼位是主体根节点的局部坐标，随缩放/旋转变换，不能照抄人形眼高 |
| 骑乘座位与眼位来源 | `VehicleInstance.spec.seat` 是局部骨盆锚点；人形眼位来自真实头部姿态。先校验座位和骑手贴合，不靠抬高镜头掩盖错位 |
| 支持的视角、触发与限制 | 在能力说明中指出使用 CameraDocument 的命名 views 与 binding，是否有第一人称/肩后视角；保留统一输入语义，按需配置 `input.cycleViewIds` |

镜头信息的简短用途与限制写进工具可见的资产条目（如 `limitations`、适用时的 `vehicle.spec.hint`）；数值和绑定代码放入对应 topic/示例。新加目录字段前先接通实际读取方，不能把未消费的元数据当作已支持能力。

SDK 的主体适配器只返回姿态、身体和眼位等查询数据。通用首帧继承与碰撞由公共镜头模块执行；主体专属视角也通过既有 owner 提交，不得直接写主相机、监听首次按键切镜头、另建输入系统或模拟循环。首次输入及上下车不能自动换成预设构图。Agent 可以修改首帧和公开跟随参数；需要改底层时修改对应 SDK 源码，仍遵守相同契约。用法见 [SDK 首帧与接入契约](../packages/three-world/README.md#authored-opening-and-subject-integration)。

人物出生位置用 `map.playerSpawn`；默认背朝最终首帧镜头。Agent 用
`createHumanoidWorld({characterFacingYawRadians})` 覆盖朝向，单位弧度，0 朝 −Z、
PI/2 朝 −X、PI 朝 +Z，与 Episode 朝向约定一致。资产正面轴转换留在适配层；
不得通过旋转镜头或每帧改人物根节点补偿。初始朝向在首次启动前封存，重置和
Creator 首帧捕获一致恢复，Episode 可显式指定片段朝向。

新增控制器的 PR 要通过公共 `world.setCameraFollow` 入口的共同契约测试：任意首帧位置/朝向/FOV、首次输入、移动、可用的主体切换、碰撞恢复及重置；检查键盘和程序化输入共享行为，Creator/Episode 捕获不接管镜头。将新主体 fixture 加入 [camera-public-conformance.test.ts](../packages/three-world/src/camera-public-conformance.test.ts) 的 `fixtures`，复用整组断言；适配器的局部计算另在 [camera-world-integration.test.ts](../packages/three-world/src/camera-world-integration.test.ts) 验证，不能只测试内部相机类。Creator 则在现有真实操作自检中对照首帧和首次操作，不另加一轮生成流程。

## 5. 提 PR 时写清楚这些

```text
资产包及包内资产 ID：
新增或更新的资源、动画、配置或实现：
依赖的资产 ID：
对应行动模式：复用已有 / 新增
Agent 获取入口：资产 ID、topic、示例
使用条件与已知限制：
来源与授权：
验证结果及示例或预览链接：
需要接入同事完成的事项（如有）：
```

提交前由接入同事对声明已支持的内容，从实际 Agent 工具走通一次：能搜到并读到说明、能取得示例并加载、能按说明完成主要操作、能查到结果。存在特殊前置条件的能力，再验证一次条件不满足时的明确反馈。检查范围随改动决定，没有固定录制时长要求。

## 6. 合并后发布

由接入同事审查资源、登记和能力绑定；共享目录发生冲突时，保留双方资产条目，按最终文件更新哈希。合入目标分支后，由发布侧重新打包，供新任务使用。**文件合入 Git 不等于线上运行包已经更新。**

具体接口按需查阅 [SDK 指南](../packages/three-world/README.md) 和[运行包指南](../deploy/three-creator-runtime/README.md)。

### 可见外形与碰撞

资产外形及其在世界中的地形、构图、标识物、主体和客体关系以参考图与用户要求为准。
可见 Mesh 独立绘制，碰撞体用于支撑、阻挡与动作净空。简化碰撞应匹配外形的有效表面，
不得作为可见外形的替代物；空气墙仅提供不可见的物理边界。资产能力说明只描述可用能力
及触发条件；玩法由用户 Prompt 决定，未要求的能力不自动生成玩家任务。
