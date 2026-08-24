# xier120 非人类动画就绪度审计

日期：2026-08-25

范围：`xier120.quadruped-animal`、`xier120.quadruped-ridable` 的源 FBX；不修改 Runtime、Schema、Registry 或生成资产

判定依据：[`2026-08-24-xier120-non-human-static-subject-intake-design.md`](../superpowers/specs/2026-08-24-xier120-non-human-static-subject-intake-design.md) §5.6

## 结论

两个候选都 **未达到 Production Rigged Subject 就绪条件**。它们仍是已经完成并验证的 Static Subject；本结论不影响如下现有入口：

- `worldkit://subject-definition/xier120.quadruped-animal@1`
- `worldkit://subject-definition/xier120.quadruped-ridable@1`
- `pnpm worldkit run examples/authoring/xier120-subject-gallery.json`

不能把源文件中时长超过两秒的匿名 Clip 当作 `idle / walk / run / jump`。本次不创建 Rig Profile、Animation Set 或 Rigged Subject Definition，也不复制 Clip、重命名 Pose 或用静态帧伪造动作。

## 审计环境与输入身份

探针使用仓库锁定依赖：Three.js `0.180.0` 的 `FBXLoader` 解析源 FBX；当前 Canonical Babylon Runtime 使用 `@babylonjs/core` / `@babylonjs/loaders` `9.21.2`。版本复现命令：

```bash
node -p "require('./node_modules/three/package.json').version"
node -p "require('./node_modules/@babylonjs/core/package.json').version"
node -p "require('./packages/runtime-babylon/node_modules/@babylonjs/loaders/package.json').version"
```

源身份与 `assets/subjects/source-fbx/contributors/xier120/catalog.json` 一致：

| 候选 | 字节数 | SHA-256 |
|---|---:|---|
| `xier120.quadruped-animal` | 2,183,164 | `df789fffa1526308d5bd0386fd22a2fe62c4e57f0b5dc29b23e662c5879080b7` |
| `xier120.quadruped-ridable` | 5,691,164 | `b3aec424ca5eeb4286a5909703fac502f6a3175882632fac8fec26238572674b` |

复现命令：

```bash
wc -c \
  assets/subjects/source-fbx/contributors/xier120/animals/quadruped-animal/source.fbx \
  assets/subjects/source-fbx/contributors/xier120/compositions/quadruped-ridable/source.fbx
shasum -a 256 \
  assets/subjects/source-fbx/contributors/xier120/animals/quadruped-animal/source.fbx \
  assets/subjects/source-fbx/contributors/xier120/compositions/quadruped-ridable/source.fbx
```

## 确定性源 FBX 探针

下面的只读探针记录 Loader 实际看到的 Mesh、Skinned Mesh、Skeleton、Bone、Animation Stack/Clip、时长、轨道首尾差和源 Bounds。`FBXLoader` 将 FBX Animation Stack/Layer 物化为 `root.animations` 中的 `AnimationClip`；报告中的 Clip 名称是 Loader 输出，不是人工推断的动作语义。

```bash
node --input-type=module - <<'JS'
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Box3, Vector3 } from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const candidates = [
  ["xier120.quadruped-animal", "assets/subjects/source-fbx/contributors/xier120/animals/quadruped-animal/source.fbx"],
  ["xier120.quadruped-ridable", "assets/subjects/source-fbx/contributors/xier120/compositions/quadruped-ridable/source.fbx"],
];
for (const [id, relativePath] of candidates) {
  const bytes = await readFile(relativePath);
  const sourcePath = resolve(relativePath);
  const root = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    `${dirname(sourcePath)}/`,
  );
  root.updateMatrixWorld(true);
  const meshes = [], skinnedMeshes = [], bones = [], skeletons = new Set();
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
    if (node.isBone) bones.push(node);
    if (node.isSkinnedMesh) {
      skinnedMeshes.push(node);
      skeletons.add(node.skeleton);
    }
  });
  const bounds = new Box3().setFromObject(root);
  const positiveDurationClips = root.animations.filter((clip) => clip.duration > 0).map((clip) => {
    let maximumFirstLastDelta = 0;
    for (const track of clip.tracks) {
      const stride = track.values.length / track.times.length;
      for (let index = 0; index < stride; index += 1) {
        maximumFirstLastDelta = Math.max(
          maximumFirstLastDelta,
          Math.abs(track.values[index] - track.values[track.values.length - stride + index]),
        );
      }
    }
    return {
      name: clip.name,
      durationSeconds: clip.duration,
      trackCount: clip.tracks.length,
      maximumFirstLastDelta,
    };
  });
  console.log(JSON.stringify({
    id,
    rootTransform: {
      position: root.position.toArray(),
      quaternion: root.quaternion.toArray(),
      scale: root.scale.toArray(),
      up: root.up.toArray(),
    },
    counts: {
      meshes: meshes.length,
      skinnedMeshes: skinnedMeshes.length,
      distinctSkeletonObjects: skeletons.size,
      hierarchyBoneObjects: bones.length,
      clips: root.animations.length,
      zeroDurationClips: root.animations.filter((clip) => clip.duration === 0).length,
    },
    skeletonBoneCounts: [...skeletons].map((skeleton) => skeleton.bones.length),
    hierarchyRootBoneNames: bones
      .filter((bone) => !bone.parent?.isBone)
      .map((bone) => `${bone.parent?.name ?? "<none>"}/${bone.name}`),
    positiveDurationClips,
    bounds: {
      minimum: bounds.min.toArray(),
      maximum: bounds.max.toArray(),
      size: bounds.getSize(new Vector3()).toArray(),
    },
  }, null, 2));
}
JS
```

### 探针摘要

| 源事实 | `quadruped-animal` | `quadruped-ridable` |
|---|---:|---:|
| Mesh / Skinned Mesh | 18 / 18 | 9 / 2 |
| 不同 Skeleton 对象 | 18 | 2 |
| 每个 Skeleton 的 Bone 数 | 7（18 个均如此） | 65（2 个均如此） |
| 层级中的 Bone 对象 | 144 | 147 |
| Loader Clip 总数 | 51 | 24 |
| 零时长 Clip | 42 | 21 |
| 正时长 Clip | 9 | 3 |
| 正时长分布 | 6 × 2.633333 s；3 × 4.133333 s | 3 × 2.633333 s |
| 源 Bounds 尺寸 | `[208.283604, 157.944598, 283.696986]` | `[208.283616, 198.697032, 118.556743]` |
| 源 root Transform | position `[0,0,0]`；quaternion `[0,0,0,1]`；scale `[1,1,1]`；up `[0,1,0]` | 同左 |

`quadruped-animal` 的 9 个正时长 Clip 是三个近似重复骨架命名域上的匿名 Stack/Layer 结果；所有正时长 Clip 的轨道首尾数值相同，但这只能说明首尾闭合，不能证明 `idle / walk / run` 的动作身份。其 42 个零时长 Clip 是 Pose，不是可结束的 `jump`。

`quadruped-ridable` 的 3 个正时长 Clip 分属两个人形 Mixamo 命名域和一个动物骨架命名域；其中一个 Mixamo Clip 的轨道首尾最大差为 `0.612198568880558`（源单位），其余两个首尾闭合。Clip 名只有 `mixamo.com|Layer0` 或通用“骨架动作”，没有可验证的四动作语义。文件同时包含骑手与动物，且探针没有找到单一控制骨架的权威归属。

## 静态归一化事实不是动画就绪证据

当前静态 Bake 对两个候选都显式使用 `scaleToMeters: 0.01`、Y 轴旋转 `-π/2`、目标 forward `-Z`，然后把输出按 X/Z 中心及最低 Y 支撑归一化。它会将可见 Mesh 几何展平，并显式以 `animations: []` 导出；因此生成 GLB 的 `skeletonCount`、`boneCount` 和动画 Clip 均为零。

```bash
pnpm bake:xier120-subjects -- --check
```

该命令通过 `19/19 exact-byte outputs matched`，且两个候选输出分别是：

| 静态输出 | Bounds 尺寸（米） | Skeleton / Bone / Clip |
|---|---|---|
| `quadruped-animal.glb` | `[2.836970, 1.579446, 2.082836]` | `0 / 0 / 0` |
| `quadruped-ridable.glb` | `[0.982464, 1.986970, 2.082836]` | `0 / 0 / 0` |

现有浏览器 Gallery 的 57 张 tri-view 已分别确认两个静态产物的 visible geometry、support placement、scale 和 `-Z` forward；这些证据只覆盖静态外观与支撑，不覆盖骨骼足底、动作语义或动画 Root Motion。

## 六项 Gate 矩阵

状态含义：`PASS` 表示该候选在本次证据中完整满足；`FAIL` 表示已有确定性反证；`NOT TESTED` 表示上游前置条件失败，因此不能建立有效的 Rigged Runtime 或语义检查。

| Gate | `quadruped-animal` | `quadruped-ridable` |
|---|---|---|
| 1. 单一可控 Skeleton 且不超过 Runtime Inventory 预算 | **FAIL** — 18 个 Skeleton，超过默认 `maxSkeletonCount: 8`，也不满足 Authoring/Runtime 强制的 `skeletonCount === 1`。 | **FAIL** — 2 个 65-Bone Skeleton 虽未超过数量/骨骼预算，但仍不满足单一 Skeleton；骑手和动物的控制权未定义。 |
| 2. 映射到已获批的 Canonical 非人类 Rig | **FAIL** — 当前公开 Rig Profile 只有 `bodyTopology: "biped"` 和固定的 Biped Bone IDs；无获批 quadruped Rig 合同。7-Bone 重复骨架也没有语义 Bone 映射。 | **FAIL** — 两套 65-Bone Mixamo 人形 Skeleton 不能替代动物/组合体 Rig 合同；当前无获批 composite、多 Rig 或 mount 合同。 |
| 3. 独立且不重叠的 `idle / walk / run` 循环与 terminal `jump` | **FAIL** — 51 个 Clip 中 42 个为零时长；9 个正时长 Clip 只有匿名/重复骨架名称，不能确定四动作身份。 | **FAIL** — 24 个 Clip 中 21 个为零时长；3 个正时长 Clip 跨骑手/动物命名域，无法证明四个独立动作，且没有可验证 terminal `jump`。 |
| 4. Root Motion、朝向、足底和尺度可稳定归一化 | **FAIL** — Static Bake 只证明去 Rig 后的米制尺度、支撑和朝向；没有唯一 root、Canonical foot 映射或保留动画的归一化产物。 | **FAIL** — 同样只有静态归一化；组合体没有唯一 root/foot 权威，其中一个 Mixamo Clip 还存在首尾非闭合轨道，当前 Runtime 又禁止 root/hips position 动画。 |
| 5. 两实例、30/60/120 Hz-like、Reset/Rebind/Dispose | **NOT TESTED** — 现有两实例/Reset/Dispose 证据只运行静态 GLB；没有可合法编译的 Rig/Animation Set。 | **NOT TESTED** — 同左，且现有 canonical two-instance 浏览器夹具覆盖的是 `quadruped-animal` 静态定义，不是本候选动画。 |
| 6. 渲染与人工交互确认动作语义 | **NOT TESTED** — Gallery/host input 已确认静态形状和 Character Controller 位移，但没有播放源动画。 | **NOT TESTED** — Gallery 仅有静态 tri-view；没有骑手/动物动画播放或人工语义确认。 |

两个候选均为 **0/6 PASS**，因此不得进入 Rigged Subject 实施。

## 当前合同为何不能接入这些源动画

当前 `RigProfileManifestInputV1` 将 `bodyTopology` 固定为 `biped`，Bone ID 固定为 17 个 Biped 语义；Normalizer 和 Babylon Runtime 都要求 Asset 恰好一个 Skeleton。Runtime 还要求 Skeleton 只有一个 root、Bone 名唯一，并拒绝映射 root 或 hips 的 position 动画。Animation Set 虽能绑定多个动作，但绑定类型仍是 `GroundHumanoidActionIdV1`，且 `rootMotionMode` 只有 `in-place`。

这意味着不能通过“挑一套 Skeleton”“把匿名 Clip 改名”“把 rider 的 Mixamo Rig 当作整套坐骑 Rig”来绕过 Gate。那会把资产清理、非人类 Rig、组合体控制权和 mount 行为等未设计问题藏进数据。

## 上游补齐要求

### `quadruped-animal`

资产提供方需要重新导出一个动画保留的 GLB，并同时满足：

1. 整个 Subject 恰好一个可控 Skeleton；Mesh 共用这一个 Skeleton，不再产生 18 个 Skeleton 对象；
2. 明确的四足语义 Bone 表，至少能稳定识别 root/躯干/头、四条腿及四个接触足，并说明 Skeleton/Bone/Clip 预算；
3. 四个独立源 Clip：`idle`、`walk`、`run` 是可循环且互不重叠的时间段，`jump` 是可结束的非循环时间段；提供原始语义标注和动作预览，不能从当前匿名 Stack 名猜测；
4. 以米、`+Y` up、`-Z` forward、support-center pivot 输出；把位移 Root Motion 烘成 in-place，并提供每个循环首尾、足底接触和跳跃落地证据。

此外，SDK 需要另立并批准 quadruped Canonical Rig/Action 设计，之后才能创建 Rig Profile、Animation Set 和 Rigged Definition。

### `quadruped-ridable`

资产提供方首先必须明确产品语义，只能选择其一：

1. **动物是 Subject，骑手只是随动外观**：重新导出为一个动物控制 Skeleton，并使骑手附件不引入第二个可控 Skeleton；或
2. **骑手与动物均独立动画**：提交单独的 mount/composite 多 Rig 能力需求，等待 Runtime/Schema 设计批准，不能塞入现有单 Skeleton Rigged Subject。

选定后仍需满足上述四个独立动作、非人类 Bone 语义、in-place Root Motion、米制/朝向/支撑归一化与预算要求。当前两个 65-Bone Mixamo Skeleton 和三段匿名正时长 Clip 不足以证明任何一种方案。

### 后续 SDK 验收（只在上游资产与合同都补齐后执行）

1. 动画保留 GLB 的 Asset Manifest 与精确 Inventory/Hash；
2. 获批的非人类 Rig Profile 和 Animation Set，以及 Registry closure/Compiler/Runtime Admission；
3. 两个同时存在的实例在 Skeleton、Animation Group、active action 和资源释放上互相隔离；
4. 30/60/120 Hz-like render timing 下固定 Tick 取样一致；Reset、受控 Subject Rebind、重复 Dispose 和异常清理通过；
5. 浏览器逐动作渲染证据与真实键盘交互证据共同确认 `idle / walk / run / jump` 语义、循环、足滑、朝向和落地均正确。

在这些证据完成前，xier120 的交付承诺保持为“可直接使用的 Static Subject”，不宣称动画、骑乘、NPC 或载具行为。
