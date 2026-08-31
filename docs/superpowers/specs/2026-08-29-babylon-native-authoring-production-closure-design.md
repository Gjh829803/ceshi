# Babylon Native Authoring BNA-2 生产闭环设计

- 状态：BNA-2 Trusted Local engineering closure accepted
- 日期：2026-08-29
- 设计基线：`main@9794f0cb05ec2ce54ec3367fa25e1274ea3605a6`
- 上位架构：
  [`2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- 架构决策：
  [`ADR-0007`](../../decisions/0007-canonical-and-babylon-native-authoring-lanes.md)
- Foundation 事实：
  [`2026-08-28-babylon-native-authoring-foundation-review.md`](../../reviews/2026-08-28-babylon-native-authoring-foundation-review.md)
- 必须遵循：
  [`full-dimension-review-protocol.md`](../../reviews/full-dimension-review-protocol.md) 与
  [`runtime-deep-review-checklist.md`](../../reviews/runtime-deep-review-checklist.md)

## 1. 目的与裁决

本设计关闭 BNA-2 Foundation 之后仍缺失的四项结构能力：

1. 对 AI 提交的 TypeScript Module 做真实的 Source Admission，而不是只在仓库测试里用正则扫描已知源码；
2. 在每次 Native Build 中强制执行 Candidate Authority Audit；
3. 在两个隔离 Candidate Scene 中重放同一 Module，并对冻结 Contribution 做 byte-exact 判等；
4. 提供 `worldkit native check` / `worldkit native explain` 的正式诊断与 exit contract。

设计采用已经获批的职责拆分：

- Node 工具层拥有文件系统、TypeScript Source Graph、临时 Bundle 和 CLI 编排；
- `@whitebox-world/native-babylon/host` 拥有 Provider-specific Candidate Admission、Authority Audit、
  Contribution freeze 和 Runtime Replay；
- BNA-3 只消费 BNA-2 已关闭的结果去建立正式 Bundle、Dependency/Asset Lock、WorldPackage 和 Receipt，
  不复制 Source/Audit/Replay 逻辑；
- BNA-4 才允许 RuntimeHost 正式接纳 Native Scene Source，并负责 SDK-owned Havok、Surface Admission、
  Subject、Camera、fixed Tick 和原子 Candidate publication。

因此 BNA-2 完成后，Native Authoring 获得可重复、可诊断、不可旁路的受信本地检查闭环，但仍不是正式
Runtime 产品入口。

## 2. 当前事实与问题

### 2.1 已完成 Foundation

当前 `@whitebox-world/native-babylon` 已经提供：

- AI-facing root 与 Host-only `/host` 子路径；
- `defineBabylonNativeScene()`、只读 BuildContext、Host deterministic random 和 locked asset resolver 接口；
- 一个 Spawn、显式 Static Collider、必填闭合 `traversalBinding`；
- 世界坐标几何冻结、预算校验、稳定 Collider/Subshape/Surface ID 与无 Handle Contribution Hash；
- 闭合 `NativeSceneDiagnosticV1` / `NativeSceneCheckResultV1`；
- 唯一 Babylon `9.23.0` Deep ESM 方言；
- Cloud Ridge 受信本地实验和 BWB-1/BWB-2 Block Profile Foundation。

### 2.2 实施前的基线缺口

BNA-2 生产闭环实施前，Foundation 的 `buildBabylonNativeSceneCandidateV1()` 只验证 Module 定义、登记、
几何、预算和 Build 期间漂移。当时尚未证明：

- Source Graph 没有动态依赖、环境 I/O、Timer、全局随机、用户生命周期 callback 或 retained reference；
- Module 没有接管 active camera、physics、render scheduling、Action Manager 或 Observable；
- 同一锁定输入在第二个隔离 Scene 中产生相同 Contribution；
- CLI 对错误阶段、stdout、stderr 和 exit code 有可供 Agent 稳定消费的正式合同。

当时 Cloud Ridge 还通过 `createCloudRidgeNativeSceneControllerV1()` 返回 Controller，并在 Build 闭包外
长期保留 Collider Mesh。该基线形态适合实验调试，但与“Build settlement 后关闭 Registration、丢弃
Module/Context 引用、没有 Module-owned Runtime Controller”的目标合同冲突，因此本切片要求 current-only
迁移；本节只记录问题基线，不是当前 API 清单。

### 2.3 BNA-6 不属于 BNA-2 关闭条件

BNA-6 的同图提示、模型首轮成功率、bounded repair 成功率和 Golden 视觉/人工评估必须在 BNA-5 之后执行。
它不能反向成为 BNA-2 的依赖，否则会形成 `BNA-2 -> BNA-3 -> BNA-4 -> BNA-5 -> BNA-6 -> BNA-2`
环。BNA-2 关闭的是 Authoring API、Source/Audit/Replay/CLI 的工程合同；BNA-6 再决定该能力在不同信任
范围内是否 GO。Import Profile 的工程方言已由 bake-off 冻结，AI 成功率仍由 BNA-6 独占。

## 3. 范围

### 3.1 本设计包含

- 一个固定的 Native authoring workspace 目录合同；
- TypeScript AST/Program 驱动的 Source Graph 与 Source Admission；
- Host 生成的 typecheck 配置与无发布副作用的临时 Bundle；
- Module 默认导出和 Build 返回值合同；
- Candidate Authority baseline、受控 instrumentation、差异审计与失败销毁；
- 双 Candidate Runtime Replay 与 Contribution canonical bytes/hash 判等；
- `worldkit native check` / `worldkit native explain`；
- Cloud Ridge 和受影响消费者的 current-only API 迁移；
- BNA 新增源码的判空规范清理与直接依赖声明；
- focused、adversarial、CLI 和 exact-tree 审查证据。

### 3.2 本设计不包含

- BNA-3 的持久 Module Bundle、Bundle Manifest、Dependency Lock、Asset Lock、Package、Receipt 或
  `WorldBuildIdentityV1` Native hash 绑定；
- BNA-4 的正式 RuntimeHost admission、Havok attach、Spawn support、Surface Profile admission、
  collision overlay publication 或 Gameplay Kernel publication；
- BNA-5 的 Hosted Worker/Process/Origin 沙箱；
- BNA-6 的模型生成成功率、视觉 Gate、人工交互和产品 GO/NO-GO；
- BNA-7 的正式 Capture、Route/Nav Evidence 或产品级 `goTo`；
- BWB-3 之后的材质/截图/Collider/Corpus；
- Canonical Compiler、Canonical Scene Plan、Catalog/Hosted Builder 或 `WorldChangeSet` 的修改；
- Runtime World Configuration parser 的独立诊断增强，以及旧 ExecutionPlan V5 名称清理。二者是已登记
  BNA-1 follow-up，不塞入 BNA-2 形成无关改动。

## 4. 总体架构与单一权威

```text
Native authoring workspace
  native-scene.bootstrap.json
  scene.ts + relative local .ts graph
          |
          v
scripts/native-scene (Node-only trusted tooling)
  workspace admission -> dependency/source graph -> typecheck
  -> ephemeral bundle -> exact default export load
          |
          v
@whitebox-world/native-babylon/host
  Candidate A: build + registration/contribution admission + authority audit
  -> dispose Candidate A
  Candidate B: build + registration/contribution admission + authority audit
  -> compare canonical Contribution bytes/hash
  -> dispose Candidate B
          |
          v
NativeSceneCheckResultV1 (replay/full checker only)
  worldkit native check/explain + exit 0/1/2

Later only:
  BNA-3 packages the admitted source/locks/result
  BNA-4 replays the packaged module, matches the locked hash, then attaches SDK Kernel
```

权威表：

| 状态或资源 | 唯一 Owner | BNA-2 消费方式 |
|---|---|---|
| workspace path、Source Graph、临时文件 | Node checker | 只在一次 check 期间存在，绝对路径不进入公共诊断 |
| Bootstrap wire 结构 | `@whitebox-world/runtime-contracts` exact parser | checker 先解析，后续全部使用冻结值；parser 不因此接管 Gameplay、World Runtime、WorldPackage Bounds 或 Case 事实的上游所有权 |
| Import Profile 与 Native Module API | `@whitebox-world/native-babylon` | Source Admission 只接受该唯一方言 |
| Native Scene Profile Registry、local hard cap 与 check-policy | BNA-2 checker | CLI/Admission 的唯一 Profile/诊断语义；BNA-5 只叠加 Host/tenant cap 与隔离 |
| Candidate Engine/Scene 创建与销毁 | Host-provided Candidate factory | 每次 replay 产生一份独立 lease，始终在 `finally` 销毁 |
| Module visual objects | 当前 Candidate Scene | 只在该 Candidate 生命周期内存在，不跨 Build 返回 Handle |
| Spawn/Collider 意图 | core Registration | 只在 Build Promise settlement 前开放 |
| Collider 几何与 Contribution | `/host` admission | 从登记 Mesh 冻结世界坐标，Module 调用顺序不影响 bytes |
| Authority baseline 与 instrumentation | `/host` | 含 Provider Handle，仅存在于一次 Build，不序列化、不导出 root |
| 单 Candidate Admission 结果 | `/host` 的 `BabylonNativeSceneCandidateAdmissionResultV1` | 只表达 passed/rejected 与无 Handle Contribution；不是 CLI Check DTO |
| Replay 判等 | `/host` | 比较两次 canonical Contribution bytes；Hash 只是 bytes 的派生值 |
| CLI 结果 | `NativeSceneCheckResultV1` | stdout 的唯一机器合同 |
| Physics、Subject、Camera、fixed Tick | BNA-4 后的 Runtime/SDK Owner | BNA-2 Candidate 中不存在，不能被 Module 创建 |

## 5. Native authoring workspace 合同

`worldkit native check <world-directory> --json` 使用固定约定，不读取用户提供的 `package.json`、
`tsconfig.json`、Vite config 或插件：

```text
<world-directory>/
  native-scene.bootstrap.json   # 唯一 Bootstrap 输入
  scene.ts                      # 唯一 Module entry
  src/**/*.ts                   # scene.ts 静态引用的可选本地模块
```

规则：

- `native-scene.bootstrap.json` 必须通过当前唯一 `BabylonNativeSceneBootstrapV1` exact parser；
- 本 BNA-2 工具只把该文件当作已物化的 checker 输入，不规定上游生成方式。进入
  NBR/BNA-6 生成链路时，必须由 Host 从已解析的 Case/Attempt seed、
  `GameplayBootstrapV1`、`WorldRuntimeBootstrapV1` 以及 Host-selected Module/API/Profile refs
  派生并 canonical materialize；Builder 只读且不得回写；
- `WorldPackageWorldBoundsV1` 仍由 WorldPackage owner 验证和发布；Subject/Camera resource closure
  仍由 `WorldRuntimeBootstrapV1` 所有。`BabylonNativeSceneBootstrapV1` 只复制 Native startup
  所需的闭合数值/引用，不得被解读为这些上游事实的第二权威；
- `scene.ts` 必须只有一个 Runtime 导出：默认导出的 `BabylonNativeSceneModuleV1`；type-only export 不进入
  Bundle Runtime export census；
- 本地依赖只允许从 entry 开始可达的普通 `.ts` 文件，使用相对静态 ESM import/export；`.js` specifier
  可以按 TypeScript ESM 规则解析同路径 `.ts` source；
- 禁止 `.tsx`、JavaScript、JSON Module、WASM、CSS、裸本地路径、absolute path、`..` 越界、symlink 和
  case-fold collision；所有 realpath 必须位于 `world-directory`；
- checker 不把目录中未被 Source Graph 引用的图片、说明文档或实验文件写入结果，也不将其打包；
- workspace 约定是 BNA-2 工具输入，不是第三个 Scene Source、WorldPackage Manifest 或 Runtime 协议；
- BNA-3 后续从同一闭合 Source Graph 产生内容寻址 Bundle，但不得重新定义另一套入口文件或 import 规则。

## 6. Source Admission

### 6.1 实现边界

Node-specific 实现放在 `scripts/native-scene/`，由 `scripts/cli/worldkit.ts` 调用。不得把 `node:fs`、
TypeScript compiler API、Vite 或临时目录逻辑加入 `@whitebox-world/native-babylon` root 或 `/host`。
不创建一个只包一层脚本的新 workspace package。

Source Admission 使用 TypeScript AST、Program 和 resolved module graph；生产判定不得依赖正则。正则只可
用于独立 census test，不可成为安全/正确性 Owner。checker 生成并拥有编译选项，不执行用户配置文件。

### 6.2 唯一允许的依赖

Module graph 只允许：

- 相对本地静态 ESM；
- `@whitebox-world/native-babylon` root；
- 可选 `@whitebox-world/native-babylon-block-profile` root；
- 当前 `BabylonNativeImportProfileV1` 明确列出的 `@babylonjs/core/.../*.js` Deep ESM specifier。

明确禁止：

- bare `@babylonjs/core`、namespace import、`babylonjs`、Three.js；
- `@whitebox-world/native-babylon/host`、RuntimeHost、Runtime Babylon、Havok、Compiler、Authoring、
  World、Camera、Character Movement 或其他状态 Owner；
- `node:`、文件系统、网络、数据库、DOM、Web Worker、动态 import、CommonJS `require`；
- 用户 package、npm alias、workspace-relative escape、URL import 和非锁定插件。

Import Profile 的机器常量和 Source checker 共用一个 Owner。Babylon 升级时必须以一次 current-only
bake-off 替换版本与 allowlist，不并存旧/新 Profile。

BNA-2 V1 的 `BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1` 精确包含：

```text
@babylonjs/core/Buffers/buffer.js
@babylonjs/core/Lights/directionalLight.js
@babylonjs/core/Lights/hemisphericLight.js
@babylonjs/core/Lights/pointLight.js
@babylonjs/core/Materials/standardMaterial.js
@babylonjs/core/Maths/math.color.js
@babylonjs/core/Maths/math.vector.js
@babylonjs/core/Meshes/mesh.js
@babylonjs/core/Meshes/mesh.vertexData.js
@babylonjs/core/Meshes/meshBuilder.js
@babylonjs/core/Meshes/transformNode.js
@babylonjs/core/scene.js
```

该列表覆盖当前 Cloud Ridge 和 Block Whitebox 的实际白膜原语。Particle、Animation、loader、post-process、
shader 和 texture import 不在本闭环中凭空开放；需要时先增加来源明确的 Golden、资源/副作用审计和
current-only Profile 变更，不使用 wildcard。

### 6.3 禁止语义

Source Admission 至少拒绝：

- `Math.random()`、`Date.now()`、`new Date()`、`performance.now()`、crypto randomness；
- `fetch`、XHR、WebSocket、Worker、DOM、process/env、文件系统和任意 URL；
- `setTimeout`、`setInterval`、`queueMicrotask`、`requestAnimationFrame` 和独立 scheduling；
- `eval`、`Function` constructor、dynamic import、CommonJS、decorator/plugin side effect；
- `scene.getEngine()`、Engine/Scene 创建或销毁、`runRenderLoop` / `stopRenderLoop`；
- Physics Body/Aggregate/Plugin/CharacterController/query；
- Camera 创建、`activeCamera`/`activeCameras` 写入；
- ActionManager、Action、输入 attach、pointer/keyboard handler；
- 对 Babylon-owned property 写入 function/class/callable object、向 Babylon API 传入 callable argument、
  替换任意 Babylon Observable、写 `notifyIfTriggered`、修改其 live `observers` 数组、访问其
  `constructor`、调用 Observable mutation/control API，或调用唯一
  forbidden retained-callback method census 中任一成员；当前 whitebox Profile 不需要 callback-valued
  Babylon API，因此不保留匿名 callback 例外；
- user-defined class/subclass。V1 用函数和 Babylon 原生实例组合，避免隐藏 lifecycle hook；
- module-scope `let`/`var`、对 module-scope container 的 Build 期写入、把 Scene/Engine/Mesh/Context/
  Registration 保存到 module/global binding；
- `build()` 返回 Controller、Disposer、callback、Handle 或非空值。

允许 module-scope `const` 纯函数、类型、冻结的 primitive/tuple/table，以及唯一默认 Module 定义。
每个嵌套 tuple/table 容器都必须各自经过 `Object.freeze`，不能用只冻结外层、内部仍可写的对象冒充冻结表。
checker 需要用 symbol/scope 分析区分局部 Build 变量和 module binding，不能因普通局部 `let` 误拒场景算法。

V1 的静态能力边界还必须满足：

- 显式 `any` 一律拒绝，不能用类型擦除隐藏 Context、Babylon 或标准全局能力；
- reserved capability member name 在 property/type member、`Record`/`Pick`/mapped type、字符串字面量 computed
  member、`typeof` 字符串字面量 mapped key 和全部对象解构位置采用同一闭合语义；
- Module Source 完全禁止使用 `this`；AI 只通过显式 `BuildContext` 取得能力。任何 callable 对象都禁止写入
  自定义属性。Source Admission 追踪 local/imported module reference、Babylon imported reference 与递归冻结表
  经对象、数组、Map/Set、comma、属性/元素赋值、声明/赋值解构及其 shorthand 默认值、spread、条件表达式、
  默认参数、for-of、generator、普通 getter、helper 参数/返回值、标准 identity/container API 和多层
  helper 的单调来源传播。隐式 `arguments` 不属于 V1 能力面，必须 fail-closed。所有
  direct/`.call`/`.apply`/`.bind` 调用先归一化为同一 invocation surface，再执行参数、receiver、callee 与
  container flow 规则；这同时覆盖 const-array `.apply` 参数、`[].concat(...)`/`Array.from(...)`/
  `reduce(...)` 等容器注入、Promise resolve/reject、迭代器 getter/静态 alias、异常 throw/catch 回流和
  bind 创建时即传播预绑定参数，并覆盖 bind 后的二次 call/apply/bind/new，避免为每种语法建立可分叉的
  ad-hoc 旁路。Babylon 构造器的登记控制位必须在静态展开 tuple/spread 后按真实参数位置审计；无法静态
  展开的 spread 必须 fail-closed。即使中途用
  `unknown` 或结构类型擦掉引用类型，也不能把 module reference 变成 Context/Handle 袋。递归冻结表允许读取，
  但直接、局部别名或 helper 返回后的任意层级写入都在静态阶段拒绝。Imported pure callable 的直接调用、
  普通局部数据/解构，以及 Babylon factory 或 helper 新建并返回的视觉对象仍保持可用；
  `Object.create`、`Object.assign`、`Object.defineProperty`、
  `Object.defineProperties`、`Object.setPrototypeOf` 等 reflection 不能成为保留 Context/Module 状态的旁路；
- Scene 输入/相机所有权方法使用 `/host` 的唯一安装版本 census，同时供 Source Admission 与 Authority
  instrumentation 消费。Babylon `9.23.0` 的七个 core Scene 方法为 `attachControl`、`detachControl`、
  `addCamera`、`switchActiveCamera`、`setActiveCameraById`、`setActiveCameraByName`、`setActiveCameraByID`；
  另有 `createDefaultCamera`、`createDefaultCameraOrLight`、`createDefaultVRExperience`、
  `createDefaultXRExperienceAsync` 四个 helper augmentation/stub 名。十一项全部拒绝；测试同时对拍安装的
  `scene.pure.d.ts`、`scene.pure.js` 与 `Helpers/sceneHelpers.types.d.ts`，并验证直接调用和抽方法都拒绝；
- exact `Scene` helper type、允许的视觉属性以及 `context.random` 保持可用。不能因为拒绝能力名而退化成
  禁止普通 Babylon 白膜算法。

真正运行期计算出的 property key、`Proxy`、`eval` 或恶意 JavaScript 数据流不由 BNA-2 AST Gate 冒充
完整证明；Runtime Authority 仍负责捕获可见的 Candidate mutation，而 Hosted 对抗隔离属于 §11 与 BNA-5。

### 6.4 Typecheck 与临时 Bundle

顺序固定为：workspace/bootstrap -> dependency/source admission -> typecheck -> ephemeral bundle -> load。

- Typecheck 使用 Host 生成的 strict 配置、唯一 TypeScript 版本和唯一依赖解析；不继承用户 `extends`、path
  alias、plugin 或 emit hook；
- Bundle 使用仓库锁定的 Vite/Rollup 版本和 Host config，关闭网络、用户插件与外部化漂移；
- Bundle 只写到 Host 创建的临时目录，成功或失败都删除；不产生 Package、Receipt、Registry Ref 或 tracked
  artifact；
- load 后检查 Runtime exports 只有 `default`，并通过 `defineBabylonNativeScene()` exact guard；
- default Module 的 `id`、Bootstrap `sceneModuleRef` 与后续 BNA-3 Bundle identity 关系由 BNA-3 正式锁定；
  BNA-2 不伪造 content-addressed Bundle Ref；
- TypeScript、Vite 或 provider 原始异常只在 stderr 的受控调试日志中出现；公共 DTO 使用稳定 WorldKit code、
  canonical relative source path、line/column 和 repair hint。

## 7. Candidate Admission 与 Authority Audit

### 7.1 公共 Host 入口 clean break

`buildBabylonNativeSceneCandidateV1()` 不再作为可跳过 Audit 的 `/host` 公共入口。最终 `/host` 提供两个
角色明确的入口：

```ts
export function admitBabylonNativeSceneCandidateV1(
  input: AdmitBabylonNativeSceneCandidateInputV1,
): Promise<BabylonNativeSceneCandidateAdmissionResultV1>;

export function replayBabylonNativeSceneModuleV1(
  input: ReplayBabylonNativeSceneModuleInputV1,
): Promise<ReplayBabylonNativeSceneModuleResultV1>;
```

`admit...` 对一个调用方已创建、尚未接入 SDK Kernel 的 Candidate 执行 Build、Registration/Contribution
Admission 和 Authority Audit。`replay...` 通过 Host factory 创建两个 Candidate，分别调用同一个
`admit...`，比较 canonical Contribution bytes，并负责两次销毁。旧类型、旧导出和旧消费者在同一切片删除，
不保留 alias。

`BabylonNativeSceneCandidateAdmissionResultV1` 是 `/host` 私有角色的闭合
`passed | rejected` Union：passed 持有冻结 Contribution/hash，rejected 持有稳定 Diagnostics；它没有
`checkedInput`、`tool-error` 或 `kind: "native-scene-check-result"`。Candidate 创建、cleanup、Source、Bundle
与 CLI tooling 才可能产生 `tool-error`。`ReplayBabylonNativeSceneModuleResultV1` 是闭合包装：所有成员只含
一个 `checkResult: NativeSceneCheckResultV1`；仅 `checkResult.outcome === "passed"` 的成员额外携带冻结
Contribution/hash，失败成员不携带 Contribution。完整 Checker 直接发布其中的 `checkResult`。这样单
Candidate Admission 不会冒充已经完成 Source + 双 Replay 的正式 Check，同时 BNA-3 仍能消费 Replay 的
无 Handle Contribution。

Host 从已解析 Bootstrap `seed` 自己创建 deterministic random；调用方不再传入可与 Bootstrap 漂移的随机源。
Locked Asset Resolver 的每次返回仍被 Host 复制/冻结；BNA-3 再把它绑定到正式 Asset Lock。

### 7.2 Candidate precondition

调用 `build()` 前，Candidate 必须满足：

- Scene 未 disposed，且 `scene.getEngine()` 是 Candidate factory 创建时记录的同一 Engine；
- 没有 active camera、camera collection、physics engine、physics body 或 Action Manager；
- 没有 SDK Subject、input、fixed Tick、Runtime observer 或 render callback；
- Host 记录公开可观测的 Scene/Engine authority baseline 和受控 instrumentation 计数；
- Registration 尚未暴露。

不满足 precondition 是 `authority-audit`/`capability` rejection，不调用 Module Build。

### 7.3 Build Epoch

1. Host 创建冻结 BuildContext 并打开 Registration；
2. 恰好调用一次当前 Candidate 的 `module.build(context)`；
3. Host 捕获返回值；只有 `undefined` 合法，Promise resolve 到其他值同样拒绝；
4. Promise settlement 后在 `finally` 立即关闭 Registration；
5. Host 再验证 Spawn、Collider Mesh ownership、geometry/binding drift 和预算，冻结 Contribution；
6. Host 执行 post-build Authority Audit；
7. 只有所有步骤通过才返回无 Handle Contribution/hash；任一步失败都拒绝 Candidate。

Module Build 期间的异常被清洗为稳定 `build` diagnostic。Registration 首个失败保持根因，不被随后 Module
catch/rethrow 覆盖。

### 7.4 Authority probe

Probe 只使用 Babylon `9.23.0` 已安装源码证明存在的公开 API，或 Build 期间 Host 自己安装并恢复的函数
instrumentation；禁止读取 `_activeRenderLoops` 等私有字段推断引擎状态。

Observable 审计只有一个机器 Owner：`/host` 中版本锁定的
`BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1` 与
`BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1`。它们必须与安装的
`scene.pure.d.ts` 全部 65 个 public `Observable` 属性、`abstractEngine.pure.d.ts` 全部 15 个 public
`Observable` 属性 byte-exact 对齐，包括没有 `Observable` 后缀的 `onActiveCameraChanged` /
`onActiveCamerasChanged`、Scene/Engine 两个 `onDisposeObservable`、camera/draw/render-group/ready/
resource/input Observables。测试从锁定声明文件独立提取 public census，与这两个常量做 exact equality；
设计、实现和测试不得各维护一份手抄子集或数字为 13/2 的旧列表。Babylon 版本变化时，版本、两个常量和
声明 census test 作为一次 current-only 变更共同替换。

Observable 不是完整 callback 面。`/host` 还拥有唯一版本锁定的
`BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1`，当前 Babylon 9.23.0 精确包含 17 个会被
后续 pointer/render/LOD/candidate selection 调用的 public function-valued Scene 属性：

```text
customLODSelector
pointerDownPredicate
pointerUpPredicate
pointerMovePredicate
onPointerMove
onPointerDown
onPointerUp
onPointerPick
pointerMoveTrianglePredicate
pointerDownTrianglePredicate
pointerUpTrianglePredicate
getActiveMeshCandidates
getActiveSubMeshCandidates
getIntersectingSubMeshCandidates
getCollidingSubMeshCandidates
getDeterministicFrameTime
customRenderFunction
```

Audit 对每个 key 比较 Build 前后的 function identity，不接受匿名例外。另一个 Host-private
`BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1` 锁定会保留 callback/Module object 或接管后续
渲染的 public method：`registerBeforeRender`、`registerAfterRender`、`executeOnceBeforeRender`、
`executeWhenReady`、`whenReadyAsync`、`addIsReadyCheck`、`freezeActiveMeshes`、`setRenderingOrder`、
`addExternalData`、`getOrAddExternalDataWithFactory`。Authority Probe 对这十个 method 安装 instance wrapper，记录首次调用并
fail-closed；Source Admission 同时按 TypeChecker symbol 拒绝。该清单来自安装的
`scene.pure.d.ts`/`.js` retained semantics，而不是只按方法名包含 `callback` 猜测。

Scene/Engine 不是完整的 Module callback 面。`/host` 还拥有唯一版本锁定的
`BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1`，覆盖当前 Deep ESM Import Profile 中所有
Module 可创建并能留在 Candidate Scene 的 Babylon 类型、继承面和静态全局面。Babylon 9.23.0 至少必须
exact 包含：

- `Node`：`onAccessibilityTagChangedObservable`、`onDisposeObservable`、
  `onEnabledStateChangedObservable`、`onEffectiveEnabledStateChangedObservable`、`onClonedObservable`，
  callback setter `onDispose`，direct callback property `onReady` 必须为 nullish，并要求 `behaviors` 为空；
- `TransformNode`：继承 `Node`，另含 `onAfterWorldMatrixUpdateObservable`；direct callback property
  `customMarkAsDirty` 必须为 nullish；
- `AbstractMesh`：继承 `TransformNode`，另含 `onCollideObservable`、
  `onCollisionPositionChangeObservable`、`onMaterialChangedObservable`、`onRebuildObservable`，以及
  `onCollide` / `onCollisionPositionChange` setter；
- `Mesh`：继承 `AbstractMesh`，另含 `onMeshReadyObservable`、`onBeforeRenderObservable`、
  `onBeforeBindObservable`、`onAfterRenderObservable`、`onBetweenPassObservable`、
  `onBeforeDrawObservable`，`onBeforeDraw` setter，以及 direct callback property
  `onLODLevelSelection` 必须为 nullish；
- `Material`/`StandardMaterial`：`onDisposeObservable`、`onBindObservable`、`onUnBindObservable`、
  `onEffectCreatedObservable`，`onDispose` / `onBind` setter，以及必须在 Build 前后保持 identity 与 observer
  顺序不变的 static `Material.OnEventObservable`；direct callback properties `customShaderNameResolve`、
  `onCompiled`、`onError`、`getRenderTargetTextures` 必须等于 Host 在 provider 构造期记录的 exact identity；
- `Light` 继承 `Node` 的完整面，三个允许的 Light concrete types 当前没有额外 callback surface，exact
  census 必须明确记录空增量；Geometry 的 direct callback property `onGeometryUpdated` 必须为 nullish，
  Buffer 当前仍是空增量。

Build 前，Host 对 Scene、Engine 和 provider static/global surface 做 baseline，并在 Candidate Scene instance 上
包装同步 collection insertion 方法：`addMesh`、`addTransformNode`、`addMaterial`、`addLight` 和
`pushGeometry`。wrapper 必须在调用原 Babylon 方法之前按传入对象的有效继承类型记录公开 callback
Observable、setter-backed Observable、direct callback property、Behavior/retained-object collection 的
provider-owned 初始 identity/order，并安装可恢复的 direct callback accessor probe；这才是 Module 获得构造
结果前的公开同步边界。Babylon 9.23.0 的 `onNewMeshAddedObservable`、`onNewMaterialAddedObservable`、
`onNewLightAddedObservable` 和 `onNewGeometryAddedObservable` 通过 `TimingTools.SetImmediate` 延后通知，不能
承担准入边界，也不能用来采集 provider baseline。Host wrappers 必须在 `finally` 恢复原 descriptor，恢复后
Scene/Engine/static surface 仍须与原 baseline exact 相等。

普通新对象的 Build-end callback 面必须与记录的 provider baseline exact 相等且没有 Module closure。
Host-owned `BABYLON_NATIVE_ALLOWED_PROVIDER_CALLBACK_TRANSITIONS_V1` 是唯一允许的构造期变化机器清单；
Babylon 9.23.0 当前 exact 只有 `StandardMaterial` 这一条：`Material` 基类先把实例暴露给 Scene，
随后 `StandardMaterial` 构造器会通过 `_attachImageProcessingConfiguration(null)` 在共享的
`scene.imageProcessingConfiguration.onUpdateParameters` 上增加一个 provider observer，并把
`getRenderTargetTextures` 从 nullish 赋为 provider function。因此 Audit 只允许每个刚暴露的 exact
`StandardMaterial` 在同步 `addMaterial` wrapper 中登记一次、按该安装顺序发生的 provider observer add 和一次
`getRenderTargetTextures` identity transition；记录 `Observable.add()` 返回的公开 `Observer` identity 和
最终公开 function identity。任何额外、缺失、重排、后续替换或无法归属到该同步构造窗口的变化都拒绝。
不得读取 `_imageProcessingConfiguration`、`_imageProcessingObserver` 或其他私有字段。

Source Admission 按 TypeChecker symbol 拒绝 Module 对上述 direct callback/Observable 的赋值和调用，并拒绝
使用 `doNotAdd`/等价跳过 Scene 登记的构造路径，以及手工调用 Scene 的 add/remove Mesh、TransformNode、
Material、Light、Geometry collection API；这样 Module 不能先在 Host 观察不到的对象上安装 callback 再手工
加入 Candidate。运行时 probe 负责核实 provider identity 与残留状态；两者不能互相替代。

Host-boundary runtime discovery 只遍历公开 own data-property descriptor 和机器清单中显式批准、经安装源码证明
不会产生副作用的 eager object path；不得为了“发现更多对象”而泛化调用 public getter。尤其不能读取会懒创建
对象的 `scene.defaultMaterial`、`scene.collisionCoordinator` 或未来未知 getter，否则 census 本身会新增 Material、
observer 或其他 authority state。TypeScript Program 必须枚举 public object-valued accessor；新增/未分类 accessor
先使 census 失败。回归必须证明 discovery 前后 Material/observer/Scene collection exact 不变。

Host-owned nested object 另有一个唯一机器清单
`BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1`。在 Babylon 9.23.0 的冻结 Candidate factory 与
12-specifier 图上 exact 包含两个路径：

- `scene.imageProcessingConfiguration.onUpdateParameters`：object/Observable identity 必须不变，最终 observer
  list 必须等于原 baseline 加上前述按构造顺序记录的 live `StandardMaterial` provider observers；
- `scene.postProcessManager.onBeforeRenderObservable`：`PostProcessManager` object、Observable identity 与
  `observers.slice()` 有序副本必须和 Build 前 baseline exact 相等，不允许 provider delta。

二者都不伪装成 Scene 自身 65 个 Observable 之一。有效 TypeScript Program 声明扫描与 cycle-safe、
Host-boundary runtime discovery test 必须证明没有第三个未登记的预建 nested Observable/function callback
surface；未来新增时先使 census 失败，再 current-only 更新 nested 清单、
`BABYLON_NATIVE_ALLOWED_PROVIDER_CALLBACK_TRANSITIONS_V1` 与 Audit，不接受匿名 provider 例外。

声明/源码清单之外还必须有一条冻结导入图复验：测试按唯一 Deep ESM Import Profile 创建同一个
TypeScript Program，并从该 Program 的有效 `Scene`、`AbstractEngine`、`Node`、`TransformNode`、
`AbstractMesh`、`Mesh`、`Material`、`StandardMaterial`、`Geometry`、`Buffer` 和允许 Light symbols 提取
`ImageProcessingConfiguration`、`PostProcessManager` 以及继承/module augmentation 后的
instance/static/nested public surface；
随后在相同 12-specifier 运行时导入图上
创建 Host-private NullEngine/Scene 和每类最小对象，比较实际 Observable、callback setter、direct
function-valued property、Behavior/retained-object collection、static global 与被 wrapper 的 method
descriptors。`scene.js` 当前只
重导出 `scene.pure.js` 并调用 `RegisterScene()`，因此 Babylon 9.23.0 没有额外 callback key；未来任一
允许导入引入新的 augmentation、function-valued property 或 retained method 时，census 必须先失败，
并与唯一常量、Source Admission 和 Authority Probe 在一次 current-only 变更中共同更新。不得扫描整个
未导入的 Babylon 包后把无关可选组件混入 Module Profile，也不得只扫 `scene.pure.d.ts` 后忽略实际导入图。

Scene 的五个公开 callback setter `onDispose`、`beforeRender`、`afterRender`、
`beforeCameraRender`、`afterCameraRender` 必须单独进入 setter regression；它们最终改变 Observable
subscription，Audit 比较有序 observer identity，而不只比较数量。

Observable baseline 对每个 key 同时冻结 Observable 对象 identity 与
`observable.observers.slice()` 的有序副本；禁止保存 live `observers` 数组引用。Build 后 identity 和有序
Observer 引用必须同时相等。Babylon `remove()` 的延迟注销在同一个 Build settlement 仍视为 mutation 并
fail-closed，不等待 `setTimeout(0)`、不读取 `_willBeUnregistered` 等私有字段。Source Admission 禁止对
任意 audited Observable 属性赋值、`notifyIfTriggered` 写入、live `observers` 数组修改、通过其
`constructor` 替换实例，以及调用 Observable 的 `add/addOnce/remove/removeCallback/clear/notifyObserver/
notifyObservers/makeObserverTopPriority/makeObserverBottomPriority/cleanLastNotifiedState/clone`
mutation/control API。

Audit 至少验证：

- Scene/Engine identity 未变，Scene 未 disposed；
- `activeCamera`/`activeCameras` 为空，camera collection 没有新增；
- Physics Engine 仍为空、physics 未启用、所有 Candidate Mesh 没有 provider-created physics body；
- Scene `actionManager`/`actionManagers` 和 Mesh action manager 没有新增；
- `registerBeforeRender`、`registerAfterRender`、Engine render-loop 控制 API 没有被调用，Engine
  `customAnimationFrameRequester` identity/descriptor 与 baseline 相同；
- 两个唯一 Observable census 常量中每个 public Observable 的对象 identity 与
  `observers.slice()` 有序副本都与 baseline byte-exact 相同；五个 Scene callback setter 以及任意
  Observable mutation/control 同样被拒绝；
- 17 个 Scene callback function property identity 与 baseline 相同，十个 retained callback/object method
  没有被调用；
- created-object callback surface census 没有 Module observer、Module direct callback 或 Behavior；direct callback
  identity 与 Host 记录的 provider baseline/允许 transition 相同，provider static/global Observable 与 baseline
  identity/order 相同；
- nested authority surface 清单中 object/Observable identity 均不变；PostProcessManager observer order 与 baseline
  exact 相同，ImageProcessingConfiguration observer order 只包含 baseline 加已记录 StandardMaterial provider delta；
- Host instrumentation 在成功、rejection、throwing Build 和 cleanup 后全部恢复；
- V1 Profile 允许的 Mesh、TransformNode、Geometry、Material、Light 和 Scene visual scalar state 仍属于
  Candidate Scene；未来新增的 Babylon-owned 纯视觉系统必须先进入唯一 Import Profile，并证明不含 Module
  closure，Authority Audit 不接受匿名例外；
- Build 完成后没有 Module callback、Controller 或 Registration handle 可被 Runtime 调用。

Audit 发现任何 authority mutation 时，不尝试移除异常 callback 后继续发布；整个 Candidate 必须销毁。

## 8. Runtime Replay

### 8.1 Replay 输入

`ReplayBabylonNativeSceneModuleInputV1` 只接受：

- 已解析 Bootstrap；
- 已通过 Source Admission、exact default export guard 的 Module；
- Host-owned Candidate factory；
- locked asset resolver；
- Host-authorized admission budget。

Candidate factory 返回一份 lease：Candidate Scene 以及能够销毁其 Scene/Engine/临时资源的 disposer。lease
是 Host-private Handle，不进入 root API、Check Result、Contribution、BNA-3 Package 或 Browser Protocol。

### 8.2 固定算法

1. 创建 Candidate A；执行完整 `admit...`；无论结果如何在 `finally` 销毁 A；
2. A 通过后创建 Candidate B；使用相同 Bootstrap、Module、Profile、budget 和 locked assets 执行完整
   `admit...`；无论结果如何在 `finally` 销毁 B；
3. 对两次 `BabylonNativeSceneContributionV1` 先 exact parse，再产生 canonical bytes；
4. byte-exact 相等才通过；Hash 相等但 bytes 不等仍拒绝；
5. 不同 Spawn、Collider 数量/ID、world positions、indices、material ratios、traversal binding、Subshape/
   Surface ID 或调用顺序归一化错误都产生稳定 `runtime-replay` diagnostic；
6. 通过时只返回一份冻结 Contribution、其 canonical bytes 派生 Hash 和 Check Result，不返回 Candidate。

两次 replay 故意复用同一个已加载 Module object，同时创建不同 Candidate Scene。这样 retained mutable state
会在第二次 Build 暴露；Source Admission 同时负责静态拒绝 retained binding。BNA-5 Hosted 隔离以后可以
增加跨进程 replay，但不改变 Contribution 判等合同。

### 8.3 cleanup precedence

- Gate rejection 且 cleanup 成功：`outcome: "rejected"`，exit `1`；
- Candidate factory、临时环境或 cleanup 失败：`outcome: "tool-error"`，必须至少包含一条 `stage:
  "tooling"` Error，exit `2`；
- gate rejection 与 cleanup 同时失败：保留原 rejection diagnostic，并追加 tooling cleanup Error，最终
  outcome 为 `tool-error`；
- 任何失败都不保留 Candidate、不产生 Package/Receipt，也不更新当前运行世界。

## 9. CLI 与诊断合同

### 9.1 命令

```bash
worldkit native check <world-directory> --json
worldkit native explain <world-directory> [--json]
```

- `check --json` 的 stdout 恰好是一行、一个闭合 `NativeSceneCheckResultV1` JSON；无 banner、进度、stack
  或额外空行；
- `explain` 调用同一个 checker。默认把 stage/code/location/message/repairHint 的确定性人类视图写 stdout；
  `--json` 时输出同一个 DTO，不定义第二套 machine schema；
- JSON 模式下所有人类日志只写 stderr；
- CLI usage、无法解析路径、Host 工具/环境故障也必须生成 `checkedInput: { kind: "unresolved-world" }` 的
  `tool-error` DTO，不能在 JSON 模式输出裸 UsageError；
- Bootstrap 解析后，Result-level `checkedInput` 必须是唯一的 `native-scene-module` member；Diagnostic 不复制
  `sceneModuleRef`；
- `sourcePath` 只使用 `/` 分隔、相对 `world-directory` 的 canonical path，绝不暴露 checkout/temp/home。

### 9.2 exit code

| 结果 | Exit | 例子 |
|---|---:|---|
| `passed` | 0 | 全部 Gate 通过；可以含 warning |
| `rejected` | 1 | Bootstrap、dependency、typecheck、bundle、source、build、contribution、authority、replay、capability rejection |
| `tool-error` | 2 | CLI usage、文件系统不可用、Candidate factory/cleanup、内部工具异常 |

CLI 不复用现有 WorldPackage 的多段 exit code。Native V1 只使用 `0/1/2`，与已冻结长期规格一致。

### 9.3 Diagnostic 稳定性

- 每个已知失败点有唯一稳定 code，不把 Babylon/TypeScript/Vite 裸消息当 code；
- 同一 Stage 内 Diagnostics 按 canonical source location、registration ID、code、id 排序；
- `passed` 不含 Error；`rejected` 至少一条 Error；`tool-error` 至少一条 tooling Error；
- 所有预算值使用闭合 measurement union 和带单位字段；
- 不增加 `details`、`params`、provider error 或 arbitrary metadata；
- Source/Audit/Replay 错误给出 AI 可执行 repair hint，但不建议绕过 Gate、改用旧 API 或回退旧 Collider。

### 9.4 BNA-2 本地检查策略

CLI 只有 `<world-directory>` 输入，不能从用户 `package.json`、`tsconfig.json`、环境变量或未锁定文件暗中
取得预算与资产。因此 BNA-2 固定以下 trusted-local check policy：

- CLI 接受 `worldkit://native-scene-profile/whitebox.standard@1` 与已合入的
  `worldkit://native-scene-profile/whitebox.blocks@1`；两者由同一个闭合 check-policy map 解析，未知
  Profile 以 `capability` rejection 结束；
- 两个 Profile 的本地结构 hard cap 都固定为 `256` 个 Static Collider、`65_536` 个 Collider vertex 和
  `131_072` 个 Collider triangle；它只是 BNA-2 checker hard cap，不是 Tenant entitlement、Package
  identity 或正式 Runtime budget；
- BNA-2 CLI 不接收资产目录或 lock 参数。Module 调用 `context.assets.resolve()` 时，asset-free checker
  以稳定 `WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE` capability diagnostic fail-closed；
- `/host` Admission/Replay 仍接受调用方提供的 locked asset resolver 与授权 budget。BNA-3 使用同一入口
  注入正式 Dependency/Asset Lock 与 `min(profile, host/tenant hard cap)` 的有效预算，不复制 Source、Audit
  或 Replay；
- NullEngine Candidate 只证明结构准入、Authority 和确定性 replay，不冒充 BNA-4 的 Havok、Surface、
  人物通过性或真实浏览器渲染证据。

## 10. Cloud Ridge 与 Block Profile 关系

### 10.1 Cloud Ridge current-only 迁移

Cloud Ridge entry 改为：

```ts
export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-ridge-native-spike",
  build(context) {
    // Babylon visuals + explicit registration only
  },
});
```

删除 `CloudRidgeNativeSceneControllerV1`、`createCloudRidgeNativeSceneControllerV1()`、Module-owned
`collisionMeshes` 和运行期 setter/snapshot。碰撞调试如果继续保留，必须由实验 Host/Adapter 从已冻结
Contribution 与其自己创建的 collision proxy 管理；Module 不再拥有 Debug Runtime API。

### 10.2 Block Profile

已合入的 `@whitebox-world/native-babylon-block-profile` 仍是可选 root，只在一个 Build Epoch 内创建真实
Babylon Mesh、推导结构报告并释放 layout。BNA-2 Source Profile 允许该 root import，但：

- 不把 Profile report 合并进 core `NativeSceneCheckResultV1` 的 arbitrary details；Profile Error 由 Module
  在 Build 内 fail-closed，再映射为稳定 Build diagnostic；
- 不把 Profile layout、visual group 或 block inventory 加进 Runtime Replay 判等；Replay 唯一 physics/
  traversal truth 仍是 core Contribution；
- 不提前实现 BWB-3 screenshots、BWB-4 Collider 或 BWB-5 Corpus；
- BWB-3 的详细依赖仍以 Block Profile 长期规格为准：BWB-1+BWB-2+BNA-3 后开始，不能只因 BNA-2
  关闭就提前发布截图/Bundle identity。

## 11. 安全与信任声明

BNA-2 是 **Trusted Local correctness gate**，不是恶意 JavaScript 安全沙箱。理由：

- Module 仍得到完整 Babylon Scene；动态语言可通过未知路径取得更大能力；
- AST Gate、typecheck、instrumentation 和 replay 能强制项目约定并发现常见/意外越权，但不能证明对抗性
  隔离；
- 本地 Bundle 的执行仍发生在 Host 进程信任域内。

因此 BNA-2 文档和 CLI 不得出现 “sandboxed” 或 “safe for untrusted code” 声明。Hosted 任意代码必须等待
BNA-5 的进程/Worker/Origin、资源限额、timeout/kill、网络/credential 隔离和多租户证据。

## 12. current-only clean break

项目未发布，本切片完成时必须满足：

- `/host` 只有一个 Candidate admission 入口名和一个 Replay 入口名；
- `buildBabylonNativeSceneCandidateV1` 旧导出、旧类型、旧测试名、旧消费者为零；
- Native workspace 只有一组固定文件名、一个默认 export 和一个 Source Graph parser；
- 不接受 user tsconfig/package/vite config，不保留 legacy workspace layout；
- Cloud Ridge 不保留 Controller 兼容层或旧 factory；
- `@whitebox-world/native-babylon` 对使用的 `lodash-es` 具名 `isNil`/`isEmpty` 声明直接依赖；BNA 新增
  Parser/Host 文件按审查规则判空，所有普通相等仍使用 `===` / `!==`；
- Schema、类型、consumer、fixture、census、docs 和 CLI 示例在同一 merge candidate 更新；
- RuntimeHost 的 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` 保持原位，仍在 adapter/Candidate 分配前
  fail-closed；只有 BNA-4 可以移除。

## 13. 测试与证据

### 13.1 Source Admission

正向：多文件静态 ESM、type-only import、`.js` -> `.ts` ESM resolution、Deep ESM Babylon、standard 与
Block 两个已登记 Profile、default Module、async Build。

负向：symlink/越界/case collision、动态 import、bare Babylon、namespace import、Host/Runtime/Havok、
Node/DOM/network/timer/random/time、user config、class/subclass、module mutable binding、retained assignment、
observable/render-loop/action/camera/physics API、额外 runtime export、Controller return、type error、bundle error。

### 13.2 Authority Audit

至少覆盖：active camera 替换、camera 创建、上述十一个 Scene 输入/相机所有权方法、physics enable/body、
ActionManager、五个 Scene callback setter、
两个唯一 census 中全部 65 个 Scene / 15 个 Engine public Observable、mesh action manager、Scene dispose、
Engine control、Build 返回 Handle、登记关闭后调用、instrumentation restoration、Audit failure 后完整
Candidate dispose。

### 13.3 Replay 与生命周期

至少覆盖：

- 两个隔离 Candidate 的相同 Contribution；
- 第二次 Build 才漂移的 retained counter；
- 创建顺序不同但 canonical sort 后相同；
- Spawn、Collider、geometry、binding、ratio 任一漂移；
- Candidate A/B create、build、audit、dispose 各阶段 throw；
- 双 checker 并发互不共享 Module/Candidate/temp path；
- success/rejected/tool-error 后无活动 Scene、Engine、observer、临时目录或 Registration；
- Module/Asset Resolver 的 throwing 与异步 settlement。

### 13.4 CLI

以子进程验证真实 stdout/stderr/exit，不直接调用函数冒充 CLI：

- passed -> 一行 DTO + exit 0；
- 每个 rejection stage -> DTO + exit 1；
- usage/tool/cleanup failure -> tooling DTO + exit 2；
- `explain --json` 与 `check --json` 使用同一 parsed DTO；
- absolute path、stack、temp/home/credential 不出现在 stdout；
- 缺少 Bootstrap 时不得伪造 Module Ref。

### 13.5 集成 Gate

每个实现任务先运行 focused RED -> GREEN。最终 merge candidate 运行一次：

- Native core、Source checker、CLI、Cloud Ridge 和 Block Profile 的 focused suite；
- `pnpm verify:workspace-boundaries`；
- `pnpm test:census`；
- `pnpm typecheck`；
- `pnpm test`；
- `pnpm build` 与 `pnpm build:native-scene`；
- `pnpm verify:bna1-clean-break`，证明正式 RuntimeHost admission 仍关闭；
- `git diff --check` 与旧 API/alias/source-path census；
- 按 full-dimension Mode B 和 runtime-deep checklist 独立审查。

BNA-2 不用 NullEngine/contract test 冒充真实 Havok、人物通过性、视觉还原或 Hosted security 证据。

## 14. 依赖工作图

| ID | Goal / 独立交付物 | depends_on | blocks | 独占文件/资源 | 输入 -> 输出 / 集成点 | 验证证据 | 模式 |
|---|---|---|---|---|---|---|---|
| BNA2-PC-00 | 冻结本规格与上位文档关系 | BNA-0、BNA-1、BNA-2 Foundation | 全部后续 | 本规格、长期规格的 BNA-2 指针、Backlog 真相 | current tree + reviews -> approved production-closure contract | link/diff/placeholder/contradiction review | `main-agent-only` |
| BNA2-PC-05 | 清理 BNA 新源码判空规范并声明直接依赖 | PC-00 | PC-20、PC-30、PC-40 | Native package manifest 与 module/contribution/diagnostics/host、Runtime Contracts Native Bootstrap parser、lockfile | review P2 -> one `isNil`/`isEmpty` convention | focused parsers、dependency/export census、typecheck | `sequential` |
| BNA2-PC-10 | 实现 Node workspace、Source Graph、typecheck 与临时 Bundle Admission | PC-05 | PC-40、PC-50、BNA-3 | `scripts/native-scene/authoring-workspace*`、`source-admission*`、`ephemeral-bundle*`、test support；不改 Host/CLI | world-directory -> loaded exact Module 或 structured diagnostics | AST/Program adversarial fixtures、symlink/temp cleanup | `sequential` |
| BNA2-PC-20 | 用不可旁路的 Authority Audit 替换 raw build export | PC-00、PC-05 | PC-30、PC-40、PC-50、BNA-3/4 | `packages/native-babylon/src/host*`、authority/candidate internals | parsed Module + one Candidate -> admitted Contribution/result | installed Babylon source-backed audit tests、throw cleanup | `main-agent-only` |
| BNA2-PC-30 | 实现双 Candidate Runtime Replay 与 byte-exact 判等 | PC-20 | PC-40、PC-50、BNA-3/4 | Native replay internals、Candidate lease contract | candidate factory + locked inputs -> replayed Contribution/result | drift、two-instance、factory/dispose adversarial tests | `sequential` |
| BNA2-PC-40 | 接通 `worldkit native check/explain` 和 exit/stdout contract | PC-05、PC-10、PC-30 | PC-50、PC-90、BNA-3 | `scripts/native-scene/check-policy*`、`native-scene-check*`、`explain*`，`scripts/cli/worldkit.ts` Native branch、CLI tests；不建第二 CLI | world-directory -> exact DTO + 0/1/2 | real child-process CLI matrix、path/stack leakage census | `main-agent-only` |
| BNA2-PC-50 | current-only 迁移 Cloud Ridge 与所有 Host consumers | PC-10、PC-20、PC-30、PC-40 | PC-90 | Native experiment app、Runtime Babylon experimental consumer、fixtures | old controller/raw build -> default pure Module + audited Host APIs | compile/build/browser smoke、old API/controller census | `sequential` |
| BNA2-PC-90 | 完整门禁、独立 Mode B/runtime deep review 与 Backlog closure | PC-05..PC-50 | BNA-3、BNA-4、BNA-5、BNA-6 | review、Backlog 状态、evidence only；不改冻结 plan/lock | exact candidate tree -> scoped BNA-2 GO/NO-GO | §13 全部证据、D2-D6、无 P0/P1/P2 | `main-agent-only` |

关键路径：

```text
PC-00 -> PC-05 -> PC-20 -> PC-30 -> PC-40 -> PC-50 -> PC-90
             \-> PC-10 ------------/

PC-90 -> BNA-3 -> BNA-4 -> BNA-5 -> BNA-6
```

PC-10 与 PC-20 的文件 Owner 不重叠，但两者都先消费 PC-05 的唯一 Import Profile；在合同尚未实现前仍按
计划顺序集成，不得为了并行而复制 Diagnostic、Import Profile 或 Candidate types。

## 15. 终态验收

BNA-2 只有同时满足以下条件才可标记完成：

1. 任意 Native check 都必须经过 Source Admission、Candidate Admission、Authority Audit 和双 Candidate
   Replay，没有公开旁路；
2. Source Graph、Import Profile、默认导出、CLI DTO 和 exit code 各只有一个当前合同；
3. 两次 Replay 的 canonical Contribution bytes byte-exact 相等；
4. Candidate、observer、instrumentation、Registration、Module/Context reference 和临时文件在所有失败路径
   原子清理；
5. Cloud Ridge 与受影响 consumers 不再使用 Controller/raw build 旧入口；
6. 正式 RuntimeHost 仍在 Candidate 分配前拒绝 Native，未提前声称 BNA-3/BNA-4 完成；
7. 没有 Package/Receipt、Hosted、Route/Nav、Havok/人物通过性或 AI 模型成功率的虚假能力声明；
8. focused、full relevant gates 和独立审查对同一 exact tree 通过；
9. Backlog 把 BNA-2 标为工程闭合，同时继续把 BNA-3 至 BNA-8 与 BWB-3+ 标为开放。

## 16. 不采用的方案

### 16.1 一个巨型 CLI 同时拥有 Source、Scene Audit 和 Replay

拒绝。它会让 Babylon authority semantics 隐藏在 Node 脚本，Runtime/BNA-3 只能复制或 shell out，形成第二
套 Host admission。Node 工具只拥有文件/构建，Provider authority 必须留在 `/host`。

### 16.2 把 Source/Audit/Replay 延后到 BNA-3 或 BNA-4

拒绝。BNA-3 若在没有 BNA-2 closure 时打包，会把未经审计的 Bundle 和 Contribution 写进 Receipt；BNA-4
再补 Gate 会导致 Package build 与 Runtime load 使用不同规则。BNA-2 必须先成为唯一可复用 Checker。

### 16.3 继续公开 raw `buildBabylonNativeSceneCandidateV1`

拒绝。调用者可直接拿 Contribution 并跳过 Authority Audit/Replay，类型命名也会把 Foundation checkpoint
误当生产入口。未发布项目直接 clean break。

### 16.4 用正则扫描和单次 NullEngine Build 代替 Source/Audit/Replay

拒绝。正则不能理解 scope、symbol、alias 或 resolved graph；单次 Build 不能发现 retained state 和第二次
漂移；NullEngine Build 通过也不证明 Authority 未被接管。

### 16.5 在 core Contribution 中加入整个 Block layout 或视觉 Scene snapshot

拒绝。Block layout 是 Build-Epoch-local authoring evidence，视觉 Scene graph 不是 Gameplay truth。core
Contribution 继续只冻结 Spawn 与显式 Static Collider；BNA-6/BWB-5 另做视觉/结构评估。
