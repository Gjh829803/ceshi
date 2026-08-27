# 真实模型绑定实现审查（G Bot / Mixamo GLB）

## 审查元数据

- 审查者：Cursor Grok 4.6
- 审查 HEAD：`3faf4f140229d869d4f1e5c7d531555e82832594`（`main`）
- 范围：今天把产品级 G Bot GLB 接入 Canonical 管线的实现——Registry 清单、Rig、AnimationSet、Host 解析、Babylon 加载/骨骼校验/动画播放、Authoring 示例与 verify 门禁。不重复 `docs/reviews/2026-08-20-capability-runtime-code-review.md` 里的运动 skip / 相机 dt / 水域体积，除非与模型绑定直接相交。
- 方法：对照 `built-in-resource-manifests.ts`、`built-in-subject-definitions.ts`、`assets/subjects/humanoid/g-bot/*`、`subject-visual.ts`、`subject-animation-player.ts`、`subject-asset-cache.ts`、`ground-humanoid-action-resolver.ts`、`worldkit-asset-resolver.ts`、`examples/authoring/g-bot-subject-world.json`、`scripts/verification/verify-g-bot-subject-world.ts`；并用本机文件核验 GLB 的 `byteLength` / `sha256`。
- 结论先行：**绑定方式是大型项目该走的路（content-addressed、契约冻结、Host 才有 URI）。实现大体合理，没有「把 GLB 塞进场景」的回潮。真正的问题是同一产品出现两套 Definition、25 个 clip 锁进运行时枚举却只有 4 个会被选中、以及 sidecar 清单与运行时校验不完全同构。**

## 1. 今天实际接上的是什么

权威字节在：

`apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb`

本机实测与 Registry 锁一致：

- `byteLength = 5302160`
- `sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b`

Canonical 里**没有**文件路径。Authoring / IR / ExecutionPlan 只带：

`worldkit://subject-asset/actor.humanoid.g-bot@2`

Playground Host 用 `PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1` 映射到同源 URL，请求带 `worldkit-content-hash` 查询参数且 `cache: "no-store"`，避免旧 GLB 通过 HTTP 缓存混进 hash 校验。这是对的：URI 停在 Host，契约停在 ref + hash。

端到端链路：

```text
GLB 字节（Host）
  → SubjectAssetCache（magic/version、禁外部 uri、hash、inventory）
  → instantiateModelsToScene
  → validateRig（单 skeleton、单 root、骨名 1:1）
  → validateRootMotion（root/hips 禁止 position 轨）
  → SubjectAnimationPlayer（binding.actionId → AnimationGroup.name）
  → resolveGroundHumanoidAction（idle/walk/run/jump）
  → renderFrame.applyAnimationPose()
```

这不是越绑越乱的「场景里 special-case G Bot」，而是把一个产品包登记进已有的 Subject Asset 契约。方向正确。

## 2. 是否合理、是否朝着良好方式

### 2.1 做对了的部分（应保持）

- **内容寻址。** Compiler 把 `artifactContentHash` / `byteLength` / `inventory` 编进 ExecutionPlan；运行时再量一遍。换文件不改 ref 会在加载期失败，而不是静默播错模型。
- **骨骼语义层。** Mixamo 源名（`mixamorig:LeftArm`）只出现在 Rig Profile 的 `sourceNodeNameByBoneId`。Socket、相机、以后的装备走 `hand.right` / `head`，不把 Mixamo 字符串漏到 Authoring。Golden 包用独立 `root` + 同名语义骨；G Bot 的映射表是同一套 `GOLDEN_BIPED_BONE_IDS`，换骨架只换 profile，不换游戏逻辑。这是可长期维护的做法。
- **Root motion 有门禁。** 绑定声明 `rootMotionMode: "in-place"`，加载时拒绝 hips/root 上的 `position*` 动画。产品清单也写了 stripped translation。物理位移只来自 Motion Kernel，不来自 clip。
- **朝向适配放在 visual part，不放在每帧。** Mixamo 常见 +Z forward，世界契约是 `-Z`。`localTransform.rotationEulerRadiansXYZ: [0, π, 0]` 在 part 上拧一次。`MotionKernelRuntime` 的 yaw=0 仍表示 `-Z`。不要改成在 `syncVisual` 里再猜。
- **白模覆盖材质是阶段策略，不是疏忽。** `createSubjectVisual` 对导入 mesh 赋 `materials.subject`。`appearance.mode: "whitebox-neutral"` 与当前 SDK 阶段一致：绑定的是结构（骨骼、clip、碰撞），不是 PBR 出片。
- **Verify 盯的是产物而不是「能加载」。** `verify-g-bot-subject-world.ts` 核 hash、clip 名、双实例、idle/walk/run/jump 截图与剪影差。产品资产有独立门禁，这是对的。

### 2.2 正在变差、但还没散架的部分

运行时**没有**为 G Bot 新开一套 Babylon 特例。变挤的是「一张能力/动作表预登记未来，实现仍是窄切片」。对真实模型绑定来说，具体表现是下面几条。

## 3. 发现（按优先级）

### P1. 同一产品两套 Subject Definition，Agent 和门禁会绑到不同运行时

| Ref | 出处 | 实际用在 |
|---|---|---|
| `worldkit://subject-definition/humanoid.g-bot@2` | `built-in-subject-definitions.ts`（无 capabilityAssembly，socket 几乎只有 `hand.right`） | `examples/authoring/g-bot-subject-world.json`、`verify-g-bot-subject-world.ts`、多数 registry/compiler 测试 |
| `worldkit://subject-definition/humanoid.g-bot.ground@1` | `assets/registry/subject-definitions/catalog.json`（V3 + K01 + 相机 sockets） | playground 能力包切换、`capability-runtime.test.ts` |

共用同一 GLB / Rig / AnimationSet / Capsule，但组装不同：一个走 legacy locomotion 字段 + 旧相机；一个走 capability 的 motion/camera context，带 `FirstPersonView`、`ThirdPersonTarget` 等 socket。

后果：CLI 证据门禁验证的不是用户在 playground 里玩的那个包。改相机 socket 或 K01 参数不会被 `pnpm verify:g-bot-subject` 挡住。这是大型项目里最典型的「双入口漂移」。

建议：只保留一个对外 Definition。要么 verify 改绑 `.ground@1`，要么 catalog 的 ground 包成为唯一内置定义、删掉无 assembly 的 `@1`。不要靠「共用 GLB」假装它们是同一个产品。

### P1. 25 个 clip 锁进 SDK 动作枚举，运行时选择器仍只有 4 格

`packages/subject-actions/src/types.ts` 的 `GroundHumanoidActionIdV1` 现在是 25 元联合类型，含 `dance.rumba`、`sit.ground.idle`、`land.hard.alt` 等。AnimationSet 的 `requiredActionIds` 是这 25 个全部；`SubjectAnimationPlayer` 启动时要求 GLB 里每个名字都有且仅有一个 `AnimationGroup`。

真正选动作的仍是：

```17:21:packages/subject-actions/src/ground-humanoid-action-resolver.ts
  if (input.movementMedium === "air") return "jump";
  if (input.horizontalSpeedMetersPerSecond <= 0.08) return "idle";
  return input.runRequested ? "run" : "walk";
```

Registry 自己写了 `runtimeStateBinding: "not-implemented"`，这点诚实。但实现上：

- 坠落全程播 `jump`（once，播完停在起跳末帧），`fall` 永远不会被选。
- 水中仍 walk/run，`swim.*` 不会被选。
- 21 个 clip 占用类型空间、ExecutionPlan、校验时间和内存，却没有状态机。

更大的架构问题：`GroundHumanoidActionIdV1` 本应是通用地面人型动作表，现在被一个产品的 Mixamo 清单污染。下一个角色若没有 `dance.rumba`，不是「缺一条 binding」，而是和这个联合类型打架。

建议（二选一，不要拖）：

1. **窄运行时：** ExecutionPlan/播放器的 required 动作仍是 `idle|walk|run|jump`；其余 21 个只留在资产 sidecar / provenance，等 state binding 切片再升格。
2. **真做 binding：** 空中下降用 `fall`，落地用 `land.hard`，不要把 25 元枚举提前做成 SDK 公共类型。

当前状态是两者之间最差的：类型和加载成本已经按 25 付了，行为还是 4。

### P2. Sidecar 清单与运行时校验不是同一份契约

三份「G Bot 是什么」并立：

1. `assets/subjects/humanoid/g-bot/asset.manifest.json` + `action-manifest.json`（美术/打包 sidecar）
2. `packages/subject-registry/src/built-in-resource-manifests.ts`（SDK 权威）
3. `assets/registry/subject-definitions/catalog.json`（V3 能力包装）

已核对：hash、byteLength、clip 名集合、capsule 0.35/1.8 目前一致。会漂的字段运行时**并不读 sidecar**：

- sidecar `rig.strippedTranslationNodes` 含 `mixamorig:Hips` **和** `mixamorig:Spine`。运行时 `validateRootMotion` 只禁 skeleton root 与语义 `hips`。Spine 上若仍有平移轨，清单说剥了，运行时不查。
- sidecar `coordinates.forwardAxis: "-Z"`，同时 Definition 上有 `yaw = π`。若清单描述的是「适配后的世界朝向」，应写明；若描述的是 GLB 原生朝向，则与 Mixamo 惯例和 π 旋转矛盾。
- sidecar `rig.rootBone: "mixamorig:Hips"`，Golden 包的 root 是独立 `"root"`。G Bot 把 **skeleton root 和 hips 建成同一根骨**。`70be782` 的拆分对 Golden 有效，对这个产品包是空操作。Mixamo 可以这样绑，但 Rig Profile 应显式记录「root ≡ hips」，避免以后按 Golden 的假设写 socket/root-motion。
- sidecar `qa.runtimeVerifiedActions: []`，verify 脚本实际已经拍 idle/walk/run/jump。sidecar 不是门禁输入，会过期。

建议：sidecar 只做 provenance；运行时只信 Registry。或者写一个检查脚本断言 sidecar 的 hash/clip/root/stripped 节点是 Registry + `validateRootMotion` 的子集，CI 跑。不要靠人眼同步。

### P2. 空中动作绑定在产品观感上是错的

跳跃 clip 是 `once`。离地后 `movementMedium === "air"` 一直解析成 `jump`。上升还像跳跃；过了 apex 仍停在 jump 末帧，而包里有 loop 的 `fall`。这不是物理 bug（Havok 仍在积分），是**绑定没接完却把 25 clip 标成 art-ready**。用户会觉得「模型绑定了但跳起来姿势不对」。

与 capability review 的 P1（非受控悬空）独立：受控角色正常跳也会露出这个问题。

### P3. Host 解析表复制、材质路径、双实例动画

- `PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1` 只是 spread 后再写同一条 G Bot URL，没有新映射。增加了「有两张表」的假象。
- 导入 mesh 无条件换白模材质。阶段正确；若有人把 `appearance.mode` 理解成保留贴图，现在没有分支。需要在 Definition 契约上写死：whitebox-neutral = 丢弃源材质。
- 示例世界两个 G Bot 共用一个 AnimationSet 缓存、各自 instantiate。这是对的。非受控实例被强制 `idle`，永远不会播 walk——结合 capability P1，第二个 Bot 还可能因 skip `step` 悬着。绑定层本身允许双实例，运动层没把它当一等公民。

### 不作为缺陷

- 加载期要求 25 个 AnimationGroup 名称精确匹配：在「清单 = 包内容」的前提下是对的；问题是清单不该等于运行时 required set。
- `doNotInstantiate: true` 克隆网格：避免多实例共享 morph/skeleton 出错，合理。
- 禁 GLB 内 camera/light/外部 uri：安全与确定性，应保留。
- 产品包 `productionReady: false`：与 qa.status warning 一致，不要在文档里当成已交付美术运行时。

## 4. 和「大型项目长期维护」的对照

健康模式（本仓库已经在走）：

- 稳定 ref，版本与 hash 分开
- 引擎骨骼名停在 adapter（Rig Profile）
- 物理与 clip 位移分离
- Host 拥有 URI
- 切片门禁（verify:g-bot-subject）

不健康的苗头（今天绑定放大了它们）：

- **同一产品两个 Definition。** 比缺测试更伤：门禁和产品入口分叉。
- **把产品 clip 清单写进 SDK 联合类型。** 下一个角色会被迫继承 G Bot 的动作方言，或再分叉一套 ActionId。
- **三份清单。** sidecar / TypeScript registry / catalog JSON。hash 今天对齐，Spine 剥离和 forward 轴已经有缝。
- **预登记未实现能力。** 与 kernel catalog 的 reserved 还不一样：kernel 的 reserved 进不了 ExecutionPlan；clip 的 25 个 **会** 进 ExecutionPlan 和播放器。Clip 这边没有 `runtimeStatus: reserved`。

一句话：绑定基础设施是优质的；G Bot 这个产品切片在「把未来动作表提前冻进运行时」上走得过满，在「一个 Definition、一个选择器」上走得不够。

## 5. 建议落地顺序

1. 合并或明确淘汰 `humanoid.g-bot@1` vs `humanoid.g-bot.ground@1`，让 verify 打的就是 playground 玩的。
2. 把运行时 required 动作收回到 `idle|walk|run|jump`，或给 `air` 接上 `fall`；不要让 25 元枚举继续冒充通用 Schema。
3. 用脚本把 sidecar 的 hash/clip/root/stripped 节点钉死为 Registry + 运行时校验的投影。
4. 再考虑 state binding 切片；在 1–3 之前不要再往 `GroundHumanoidActionIdV1` 加 clip。

## 6. 验证

改完后至少：

```bash
pnpm typecheck
pnpm test
pnpm verify:g-bot-subject
pnpm verify:rigged-subject
```

人工：playground 分别加载 `humanoid.g-bot@1` 与 `humanoid.g-bot.ground@1`（若暂时双留），确认朝向 `-Z`、跳起后腾空姿势是否仍停在 jump 末帧、第二人是否落地。

---

## 7. Disposition（2026-08-21）

本节是后续实现的追加结论，不改写上面的原始审查。SDK audit closure 分支已经过逐任务 review、全分支对抗性 review 和 Fix Round 复审；最终范围 `15e2add..5fb8a43` 的复审结论为 **CLEAN，在本轮承诺范围内无未关闭的 P0–P2**。这里的 CLEAN 不代表动作语义、Sidecar 收敛或全部产品能力已经完成。

| 原发现 | 处置 | 结论 |
|---|---|---|
| 两套 G Bot Subject Definition | **已修复**（`74a90e3`） | 对外只保留 `worldkit://subject-definition/humanoid.g-bot@2`；`.ground@1` 已删除且无 alias。CLI 与 Browser 返回同一 Ref 和 canonical hash，G Bot verifier 使用同一产品定义。 |
| 25 个 clip 进入 SDK 动作枚举，但运行时只有四态选择 | **延期** | 当前资产加载与资源锁仍可验证完整 clip inventory，但“可加载”不等于“语义动作已实现”。`fall`、`land.hard`、蹲伏/攀爬等应在独立 Semantic Action / State Binding 切片中设计，不能在本轮靠扩充 if/else 假装完成。 |
| Sidecar、Registry、Catalog 三份信息可能漂移 | **延期，边界已明确** | Canonical Runtime 只信 Registry + Resource Lock；Host URI/Sidecar 仍属于 provenance/交付层。后续应增加从 Sidecar 到 Registry 投影的专门 conformance 脚本，而不是让运行时读取多份真值。 |
| 空中下降仍绑定 jump，而不是 fall | **延期** | 物理运动没有因此失真，但动画语义仍未完成。需和动作状态机、打断/落地规则一起做，不能只按 `medium=air` 临时替换 clip。 |
| Host 映射复制、材质覆盖、双实例动画 | **部分关闭** | 白模阶段继续明确覆盖源材质；真实 G Bot 双实例 clone、Skeleton、AnimationGroup、Socket 与独立 dispose 已有运行时覆盖。Host URI 表的进一步收敛属于 Host 资源接入清理，不是 Canonical Schema 变更。 |

本轮同时修复了与真实模型接入直接相关的基础问题：Solved Anchor 的绝对 Y 与 yaw 不再被 Compiler/Runtime 重算；G Bot 的六个 canonical sockets 保持唯一；Playground 的 capability demo 改写不再静默，而是通过不可变 `hostOverlay` 明确返回；产品出生点会拒绝与 blocked water / 已证明静态障碍的真实胶囊相交。

因此产品侧现在可以继续提供建模、骨骼、Socket 与动作资产进行接入；但交付说明必须区分“资产已解析/锁定”和“动作语义已接入运行时”。

最终验证矩阵：`pnpm typecheck`、`pnpm test`（571/571）、`pnpm test:scenes`（26/26）、`pnpm build`、四个 conformance verifier、三个 `plan:scene:check` 均通过；全分支独立复审 CLEAN。
