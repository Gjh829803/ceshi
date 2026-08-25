# G Bot Product Asset S1 Design

## Status

- Date: 2026-08-20
- Decision: implemented and verified; independent review findings resolved
- Scope: first product-authored humanoid asset through the existing Canonical Registry → Authoring → Compiler → Babylon/Havok pipeline
- Input commits: initial package `4ccfaa1b4fbdccb8111af8c97dda39e48b257c98`; 25-Clip update `7f8a48ba960088ba5a99305014b0afca0add7cec`

## Goal

Integrate the committed G Bot GLB as a versioned Registry Subject Definition and prove that an AI-authored world can select it by one stable `subjectDefinitionRef`, render it in the real Babylon/Havok playground, move and collide with it, and visibly play `idle`, `walk`, `run`, and `jump` without exposing asset URLs, source clip names, or engine objects to the World Authoring Schema.

## Verified source facts

The committed asset has already passed a read-only loader probe through `SubjectAssetCacheV1`:

- self-contained GLB 2.0, 5,302,160 bytes;
- SHA-256 `41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b`;
- two renderable meshes, 28,374 vertices, and 49,112 triangles;
- one Skeleton with 65 Bones and one parentless Bone named `mixamorig:Hips`;
- twenty-five uniquely named Animation Clips;
- Babylon world bounds approximately `[-0.902566, -0.000351, -0.148957]` to `[0.902567, 1.808883, 0.171742]` meters;
- no external Buffer/Image URI, Camera, Light, Sound, ActionManager, or Node Behavior.

The current Semantic Action runtime supports the four ground actions `idle`, `walk`, `run`, and `jump`. The remaining committed clips stay as product asset facts and are not exposed as working runtime actions in this slice.

## Rig contract correction

The current `BipedBoneIdV1` incorrectly mixes two concepts:

1. the unique parentless Skeleton root Bone used to validate hierarchy and in-place root motion;
2. the canonical anatomical `hips` Bone used by animation, sockets, and semantic retargeting.

The deterministic Golden fixture happens to contain distinct `root` and `hips` Bones. Standard Mixamo rigs commonly use `Hips` itself as the parentless Skeleton root. Requiring both as distinct semantic Bone mappings would force asset mutation or dishonest aliasing.

The corrected contract is:

```ts
type BipedBoneIdV1 =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upper-arm.left"
  | "lower-arm.left"
  | "hand.left"
  | "upper-arm.right"
  | "lower-arm.right"
  | "hand.right"
  | "upper-leg.left"
  | "lower-leg.left"
  | "foot.left"
  | "upper-leg.right"
  | "lower-leg.right"
  | "foot.right";

interface RigProfileManifestInputV1 {
  kind: "rig-profile";
  skeletonRootBoneName: string;
  requiredBoneIds: readonly BipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
}
```

Runtime validation resolves `skeletonRootBoneName` independently, requires it to be the one parentless Bone, resolves every anatomical semantic Bone one-to-one, and validates forbidden position animation against the union of the Skeleton root and the mapped `hips` Bone. Golden therefore uses root Bone `root` and maps `hips → hips`; G Bot uses root Bone `mixamorig:Hips` and maps `hips → mixamorig:Hips` without an alias.

This is a clean public Registry/IR/Execution rename. The project is not released, so no permanent alias or legacy field is retained. Schema types, locks, compiler projections, examples, artifacts, documentation, and conformance tests change together.

## G Bot Registry resources

The product handoff manifests remain source/provenance inputs. They are not treated as Canonical Registry resources because their vocabulary and version representation intentionally differ from the SDK contract.

The SDK adds five explicit Registry entries:

```text
worldkit://subject-asset/actor.humanoid.g-bot@2
worldkit://rig-profile/biped.mixamo-g-bot@2
worldkit://animation-set/humanoid.ground.g-bot@2
worldkit://collider-profile/humanoid.g-bot-capsule@1
worldkit://subject-definition/humanoid.g-bot@2
```

The Rig Profile maps canonical anatomical IDs to Mixamo source Bone names. The Animation Set exposes only the four supported ground actions. The Collider Profile uses the accepted 0.35m radius, 1.8m height, and `[0, 0.9, 0]` center. The Subject Definition composes the Asset, Rig, Animation Set, Collider, existing ground locomotion Capability, physics-body Profile, and locomotion Profile.

The World Authoring example contains only:

```json
{
  "id": "g-bot-player",
  "kind": "subject",
  "subjectDefinitionRef": "worldkit://subject-definition/humanoid.g-bot@2",
  "spawnAnchorEntityId": "spawn-g-bot-player"
}
```

The Host resolver owns the mapping from the stable asset ref to `/subject-assets/humanoid/g-bot/v1/g-bot.glb`. No URI enters Canonical Authoring, Normalized IR, or ExecutionPlan.

## Verification

The slice is accepted only when all of the following hold:

1. Registry tests lock exact G Bot Asset/Rig/Animation/Collider/Definition resources and canonical hashes.
2. Authoring and Compiler tests prove the 17 anatomical Bone contract and exact `skeletonRootBoneName` projection.
3. Runtime tests load the committed G Bot bytes, validate the Hips-root Mixamo structure, instantiate isolated visual state, and play all four supported actions.
4. The G Bot example validates, compiles, explains, and captures through the ordinary CLI path.
5. A browser conformance Gate uses the real Host resolver and Babylon/Havok runtime, records an idle world capture plus fixed-action captures, checks movement/collision and stable diagnostics, and writes transactional artifacts.
6. Golden `verify:rigged-subject` remains green and its deterministic GLB bytes remain unchanged.
7. Full tests, scene tests, typecheck, build, canonical verifier, placement verifier, and both rigged-asset verifiers pass.

## Non-goals

- Do not expose the 21 additional G Bot Clips as supported Semantic Actions in this slice.
- Do not implement swimming State Resolver, sitting interactions, mounts, equipment, root-motion locomotion, or animation retargeting.
- Do not modify or replace the committed G Bot GLB.
- Do not weaken inventory, hash, provenance, same-origin resolver, cleanup, or provider-boundary checks.
- Do not replace the Golden fixture; it remains the deterministic protocol/runtime regression oracle.
