# 模块化 Subject 资产导入与 xier120 修改清单

本文件是产品资产权威源的当前导入标准，也是本次 G Bot、Golden 和 xier120 迁移结果。
它不改变现有 Runtime 合同：当前 Babylon Runtime 仍加载一个自包含 GLB，并使用
`whitebox-neutral` 材质；模块化目录是产品可维护源，现有合并 GLB 是兼容运行产物。

## 1. 长期权威结构

1. **Source Package**：一个创建者限定、不可变版本的完整闭包，锁定来源、许可、Hash 和各资源 Ref。
2. **Model Asset**：`Mesh + Skin + 恰好一个 Skeleton + Bind Pose + Material Slots`；不含动作。
3. **Rig Profile**：独立语义合同，定义骨骼拓扑、Bone 映射、Socket 和 Rig Signature；不能从节点名猜。
4. **Material Set / Texture**：材质槽稳定版本化，纹理按内容 Hash 独立存放；更新外观不升级模型或动作。
5. **Animation Clip / Set**：一个语义动作一个 `clip.glb`，无 Mesh/材质/纹理；Animation Set 只做 `actionId → Clip Ref`。

推荐交付目录：

```text
assets/subjects/packages/<creator-id>/<subject-id>/v<version>/
├── package.manifest.json
├── model/
│   ├── model.glb
│   └── model.manifest.json
├── materials/<variant-id>/
│   ├── material-set.manifest.json
│   └── textures/<sha256>.<ext>
├── animations/<action-id>/
│   ├── clip.glb
│   └── clip.manifest.json
└── extensions/source-archive/
    ├── original.glb
    └── original.manifest.json
```

`extensions/` 保存当前标准层未消费的相机、灯光、辅助节点、`extras`、自定义 glTF
Extension 等来源内容。归档保持原字节，Manifest 必须写
`runtimeConsumption: "forbidden"`。以后要使用其中内容，必须先建立独立、版本化、受测的
公共合同；Runtime 不得机会式读取。

任何二进制、Rig 层级、Bind Pose、材质槽或语义映射变化都发布新版本，禁止覆盖已发布
`vN`。Rig Signature 或 Bind Pose 变化后，所有动作必须重新验证；第一版只接受精确
Signature，不做自动 Retarget。

## 2. 批量导入流程

收到一批素材时，先冻结来源清单和许可，再逐资产执行：

1. 确认受控主体边界：谁拥有移动、碰撞、输入和 Camera；组合体先决定单主体还是申请多 Rig 能力。
2. 检查单位、`+Y` Up、`-Z` Forward、`support-center` Pivot，并保存三视图/实际渲染证据。
3. Rigged Model 必须有可渲染 Mesh、恰好一个 Skeleton、完整 Bind Pose、稳定材质槽和零动作。
4. 每个动作单独导出；名称、Loop、Blend、速度和 in-place Root Motion 由清单显式声明。
5. 材质和纹理独立提交；不要把纹理更新伪装成 Model 更新。
6. 未进入标准层的内容放入 `extensions/`，不得丢失，也不得自动提升为 Runtime 能力。
7. 生成、校验并提交不可变包；随后另行完成 Registry、Resolver、Runtime、渲染和人工交互门禁。

本仓库当前恢复命令：

```bash
pnpm assets:subjects:modularize
pnpm assets:subjects:modularize:check
pnpm vitest run \
  scripts/lib/modular-subject-source.test.ts \
  scripts/lib/subject-source-migration-audit.test.ts \
  scripts/modular-subject-source-packages.test.ts
```

`--write` 在受管目录内完整暂存、验证后替换；`--check` 在系统临时目录重建并逐字节比较，
不修改目标。机器可读总表位于
[`assets/subjects/packages/migration-inventory.json`](../assets/subjects/packages/migration-inventory.json)。

## 3. 当前实际可用入口

- G Bot：场景引用 `worldkit://subject-definition/humanoid.g-bot@1`；当前仍解析合并
  `g-bot.glb`，模块化包已生成但未接入独立动作/材质 Runtime。
- Golden：场景引用 `worldkit://subject-definition/humanoid.rigged-golden@1`；同样保留现有自包含 Runtime GLB。
- xier120：19 个 Definition 已能以 `static-subject` 直接引用，例如
  `worldkit://subject-definition/xier120.biped-animal@1`。它们只有静态外观加当前 ground
  Character 能力，不等于车辆、飞行、骑乘或 NPC 行为。

因此，本次拆分不会让现有入口失效，也不声称 Runtime 已能跨文件加载动作或切换真实材质。
下一片经批准的 Runtime 工作应选择：从模块化源确定性组装兼容 Bundle，或增加 Model、Clip、
Material/Texture 独立缓存和显式目标转换。该工作尚未实现。

## 4. 当前资产结论与产品修改项

| 资产 | 当前可用状态 | Rigged/动态阻断 | 产品需要修改 |
| --- | --- | --- | --- |
| `seedleap.g-bot` | 合并 Runtime GLB 可用；模块化恢复完成 | 空间朝向/支点仍需渲染复核 | 补正/右/背及旧新 Opening Frame 对比；通过前保持 `needs-visual-review` |
| `seedleap.golden-humanoid` | Runtime 与模块化 Fixture 均可用 | 无 | 无需重导；保持 Model、Rig、材质和动作的不可变独立版本 |
| `xier120.aerial-cockpit` | 静态 Subject 可用 | 控制主体未定义；无 composite Rig/flight 合同 | 拆分骑手/设备权属，声明唯一受控根，再分别导出 Rig/动作并申请飞行能力 |
| `xier120.aerial-hanging` | 静态 Subject 可用 | 同上 | 声明受控根和附件合同，输出单一批准 Rig、Bind Pose 与独立动作 |
| `xier120.aerial-seated` | 静态 Subject 可用 | 同上 | 拆分骑手与飞行器视觉/控制权，申请对应能力后重导 |
| `xier120.aerial-seated-variant` | 静态 Subject 可用 | 同上 | 与 `aerial-seated` 同合同独立重导，不复用未经验证的 Rig/动作 |
| `xier120.aerial-standing` | 静态 Subject 可用 | 同上 | 声明唯一受控根、附件和飞行合同，再交付模块化资源 |
| `xier120.biped-animal` | 静态 Subject 可用 | 无批准的非人类 Rig 与语义动作 | 重导一个单 Skeleton Model、语义 Bone 表、Bind Pose 和独立 idle/walk/run/jump |
| `xier120.flat-seated-glider` | 静态 Subject 可用 | 控制主体未定义；无 flight/composite 合同 | 拆分骑手/滑翔器权属、声明受控根并申请飞行能力后重导 |
| `xier120.four-wheel` | 静态 Subject 可用 | 无 vehicle 能力；活动零件/Pivot 未定义 | 分离车身、转向、车轮，冻结 Pivot/材质槽/受控根并申请车辆能力 |
| `xier120.four-wheel-variant` | 静态 Subject 可用 | 同上 | 作为独立版本交付车身与活动件，不从外观推断车辆行为 |
| `xier120.hoverboard-standing` | 静态 Subject 可用 | 骑手/板控制权未定义；无 board/composite 合同 | 声明唯一受控根和附件关系，拆分资源并申请 board 能力 |
| `xier120.prone-glider` | 静态 Subject 可用 | 控制主体未定义；无 flight/composite 合同 | 拆分人物与滑翔器，声明受控根、Rig 和独立动作后申请飞行能力 |
| `xier120.quadruped-animal` | 静态 Subject 可用 | **源文件有 18 个 Skeleton**；无 quadruped Rig/语义动作 | 所有 Mesh 重绑到恰好一个批准四足 Skeleton，交付 Bone 表、Bind Pose 和独立动作 |
| `xier120.quadruped-reptile` | 静态 Subject 可用 | 无批准的爬行动物 Rig 与语义动作 | 重导单 Skeleton Model、语义骨骼/接触点和独立 in-place 动作 |
| `xier120.quadruped-ridable` | 静态组合外观可用 | **源文件有 2 个 Skeleton**；骑手/动物控制权未定义 | 先决定动物单独受控，或申请多 Rig mount 能力；再按决定拆分并重导 |
| `xier120.snake-animal` | 静态 Subject 可用 | 无批准蛇形 Rig 与语义动作 | 建立蛇形语义 Rig/接触合同，重导单 Skeleton Model 与独立动作 |
| `xier120.three-wheel` | 静态 Subject 可用 | 无 vehicle 能力；活动件/Pivot 未定义 | 分离车身、转向和车轮/附件，声明受控根并申请车辆能力 |
| `xier120.tracked` | 静态 Subject 可用 | 无 tracked vehicle 能力；履带/车身合同未定义 | 分离车身和履带驱动语义，冻结 Pivot/材质槽并申请履带车辆能力 |
| `xier120.two-wheel-motorcycle` | 静态 Subject 可用 | 无 vehicle 能力；转向/车轮/Pivot 未定义 | 分离车身、前叉和车轮，声明受控根、Pivot 后申请两轮车辆能力 |
| `xier120.two-wheel-motorcycle-variant` | 静态 Subject 可用 | 同上 | 按独立不可变版本重导活动件和车辆合同，不借用另一 Variant 的证据 |

## 5. 产品重导硬性要求

单一动物 Subject：一个 Model 只能有一个受控 Skeleton；所有 Skinned Mesh 共享它；提供
语义 Bone/Socket 表、Bind Pose、Rig Signature、预算和独立 in-place 动作。匿名 FBX
Stack、Pose、重复骨架或把 Clip 改名都不能代替语义验收。

骑手/载具/动物组合：产品必须先决定控制权。若动物/载具是 Subject，骑手只能按批准的
附件/视觉合同随动，不能引入第二个受控 Skeleton；若两者都需要独立动画，先申请并实现
multi-Rig mount/composite 能力，再交付数据。当前 Schema/Runtime 不能把两个 Skeleton
塞进单 Rigged Subject。

结构自动化通过只证明 Hash、清单、Rig Signature 与拆分确定性。朝向、支点、材质还原、
动作观感和 Collider 对位必须保留渲染及人工证据；不能把结构恢复写成视觉等价结论。
