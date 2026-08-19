# Asset Subject S1b Visible Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one production-shaped vertical slice where Canonical JSON spawns a versioned rigged GLB Subject that moves with Havok, switches deterministic `idle/walk/run/jump` animations, exposes stable runtime state, and can be validated and captured through CLI/Browser without product-specific runtime code.

**Architecture:** Add immutable Asset/Rig/Animation/Collider Registry resources and an Asset Visual Part union, resolve them into Normalized IR, compile engine-neutral runtime descriptors, and let an injected Host Asset Resolver provide hash-verified GLB bytes to a Babylon AssetContainer cache. Each Subject clones its own Skeleton and AnimationGroups while Havok remains the authoritative movement source; fixed-tick semantic action state drives paused Babylon animation groups deterministically.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12, Ajv, noble hashes, Vitest, Babylon.js 9.21, `@babylonjs/loaders`, Havok WASM, Vite, Playwright, pnpm workspaces, glTF 2.0/GLB.

**Spec:** [`docs/superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md`](../specs/2026-08-19-asset-subject-s1b-visible-slice-design.md)

## Global Constraints

- Ordinary World Agents continue to author only `subjectDefinitionRef`; GLB location, Bone names, source Clip names, Collider dimensions, Babylon objects, and Havok handles never enter scene JSON.
- Runtime accepts GLB 2.0 only. FBX and Blender files are offline source formats and are never runtime inputs.
- Asset bytes are identified by exact `subjectAssetRef`, byte length, and `sha256:` artifact hash; runtime verifies both before Babylon parsing.
- Asset location and authentication belong to the Host Asset Resolver, not Canonical Schema, Normalized IR, or ExecutionPlan.
- Asset Mesh bounds never decide production physics at runtime. Rigged Subjects use an exact versioned Collider Profile.
- Visual Root, Collider, Socket, Camera target, and Snapshot position continue to use the `support-center` Subject Origin, `-Z` forward, `+Y` up, and one meter per unit.
- Havok Character Controller remains the authoritative position source. This slice accepts only in-place animation bindings.
- One cache entry may share immutable parsed source assets; each Subject must own independent cloned Skeletons, AnimationGroups, Action state, Transform, Socket nodes, and disposal.
- Missing Asset, Hash, Rig, Bone, Clip, Socket Bone, or Collider Profile is a hard structured failure. No Primitive fallback or heuristic alias lookup is allowed.
- Existing Primitive Canonical worlds remain valid and pass their current behavior gates. No compatibility alias for `groundSpeedMetersPerSecond` is retained after the clean Walk/Run split.
- Public names follow `AGENTS.md`: role-qualified `...Ref`, `...ById` maps, unit-bearing numeric fields, closed enums, discriminated unions, and no Babylon/provider terminology outside adapters.
- S1b visible scope excludes automatic Retarget, Root Motion authority, Compound Collider, LOD selection, swimming variants, equipment, mounts, vehicles, NPCs, flight, and asset publishing UI.

---

## File and Package Map

### New files

- `scripts/fixtures/generate-golden-humanoid-glb.ts`: deterministic project-owned GLB fixture generator.
- `scripts/fixtures/generate-golden-humanoid-glb.test.ts`: byte determinism and glTF inventory contract.
- `apps/playground/public/worldkit-assets/golden-humanoid.glb`: generated browser/CI fixture.
- `packages/subject-actions/package.json`: engine-neutral semantic locomotion action package.
- `packages/subject-actions/src/types.ts`: stable action state inputs and IDs.
- `packages/subject-actions/src/ground-humanoid-action-resolver.ts`: deterministic state selection.
- `packages/subject-actions/src/subject-actions.test.ts`: resolver conformance.
- `packages/runtime-babylon/src/subject-asset-cache.ts`: resolver, hash gate, AssetContainer cache, reference ownership.
- `packages/runtime-babylon/src/subject-animation-player.ts`: Babylon AnimationGroup mapping, fixed-tick sampling, blending, reset, dispose.
- `apps/playground/src/worldkit-asset-resolver.ts`: same-origin built-in asset resolver owned by the Playground Host.
- `examples/authoring/rigged-subject-world.json`: canonical end-to-end asset Subject fixture.
- `scripts/verify-rigged-subject-world.ts`: CLI/Browser/physics/action/screenshot conformance gate.

### Modified files

- `package.json`, `pnpm-lock.yaml`: fixture generation and rigged conformance scripts; glTF/Babylon loader dependencies.
- `packages/protocol/src/canonical-json.ts`, `packages/protocol/src/index.ts`, `packages/protocol/src/canonical-json.test.ts`: raw byte SHA-256 helper.
- `packages/subject-registry/src/types-v2.ts`: Asset/Rig/Animation/Collider resources and Visual/Socket unions.
- `packages/subject-registry/src/subject-resource-registry.ts`: exact resource resolution methods.
- `packages/subject-registry/src/built-in-resource-manifests.ts`: Golden Asset/Rig/Animation/Collider resources.
- `packages/subject-registry/src/built-in-subject-definitions.ts`: Golden Rigged Subject Definition and explicit Socket kinds.
- `packages/subject-registry/src/subject-registry.test.ts`: locking, compatibility, lookup, and no-alias tests.
- `packages/authoring/src/subject-definition-v1.schema.json`: Asset Part, Visual Binding, Collider Policy, and Socket unions.
- `packages/authoring/src/types.ts`: public/normalized resource and Subject types.
- `packages/authoring/src/validate.ts`: strict format and cross-field validation wiring.
- `packages/authoring/src/subject-definition-normalizer.ts`: resource resolution, compatibility validation, resource tables, costs, diagnostics.
- `packages/authoring/src/resource-lock.ts`: new resource kinds.
- `packages/authoring/src/subject-definition-normalizer.test.ts`, `packages/authoring/src/authoring.test.ts`, `packages/authoring/src/test-fixture.ts`: accepted/rejected asset fixtures.
- `packages/runtime-contracts/src/execution-plan.ts`: engine-neutral asset/rig/animation/collider descriptors and Visual Part union.
- `packages/runtime-contracts/src/runtime-session.ts`: `run` input and `activeActionId` snapshot state.
- `packages/runtime-contracts/src/runtime-contracts.test.ts`: serialization and closed-union coverage.
- `packages/compiler/src/compile.ts`, `packages/compiler/src/compile.test.ts`: stable resource-table compilation and budget accounting.
- `packages/runtime-babylon/package.json`: `@babylonjs/loaders`, protocol, and subject-actions dependencies.
- `packages/runtime-babylon/src/subject-visual.ts`: async Primitive/Asset visual factory, rig/socket binding, ownership.
- `packages/runtime-babylon/src/subject-controller.ts`: Walk/Run speed and motion sample.
- `packages/runtime-babylon/src/babylon-world-runtime.ts`: async preload, per-instance animation step/reset/snapshot/dispose.
- `packages/runtime-babylon/src/runtime.test.ts`: cache, instance isolation, actions, failures, and cleanup.
- `apps/playground/src/babylon-world-adapter.ts`: `run` key/input mapping and Host Resolver injection.
- `apps/playground/src/main.ts`: stable Action HUD from runtime snapshot.
- `scripts/lib/subject-explain.ts`: Asset/Rig/Animation/Collider explanation and lock entries.
- `scripts/worldkit.ts`, `scripts/worldkit.test.ts`: registry discovery and asset Subject CLI coverage.
- `scripts/verify-canonical-world.ts`: regression adaptation for the Walk/Run field rename.
- `README.md`, `docs/16-subject-assets-3c-integration.md`, `docs/18-refactor-progress-and-backlog.md`, `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md`: status, commands, handoff, and remaining scope.

---

### Task 1: Deterministic Golden Humanoid GLB

**Files:**
- Create: `scripts/fixtures/generate-golden-humanoid-glb.ts`
- Create: `scripts/fixtures/generate-golden-humanoid-glb.test.ts`
- Create: `apps/playground/public/worldkit-assets/golden-humanoid.glb`
- Modify: `package.json`

**Interfaces:**
- Consumes: no product asset and no local ignored Xbot.
- Produces:

```ts
export interface GoldenHumanoidInventoryV1 {
  byteLength: number;
  contentHash: string;
  meshCount: 1;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: 1;
  boneCount: 18;
  animationClipNames: readonly ["idle", "jump", "run", "walk"];
}

export function buildGoldenHumanoidGlb(): {
  bytes: Uint8Array;
  inventory: GoldenHumanoidInventoryV1;
};
```

- Asset contract: GLB 2.0, one embedded buffer, one skinned low-poly biped, 18 semantic bones, four named clips, no image/texture/light/camera/audio, `-Z` forward, `+Y` up, support-center origin.

- [ ] **Step 1: Add a failing deterministic fixture test**

```ts
import { describe, expect, it } from "vitest";
import { buildGoldenHumanoidGlb } from "./generate-golden-humanoid-glb";

describe("golden humanoid GLB", () => {
  it("is byte-deterministic and exposes the frozen inventory", () => {
    const first = buildGoldenHumanoidGlb();
    const second = buildGoldenHumanoidGlb();
    expect(first.bytes).toEqual(second.bytes);
    expect(new TextDecoder().decode(first.bytes.slice(0, 4))).toBe("glTF");
    expect(first.inventory).toMatchObject({
      meshCount: 1,
      skeletonCount: 1,
      boneCount: 18,
      animationClipNames: ["idle", "jump", "run", "walk"],
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(first.inventory.byteLength).toBe(first.bytes.byteLength);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `pnpm vitest run scripts/fixtures/generate-golden-humanoid-glb.test.ts`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement a deterministic GLB builder**

Build the GLB from stable typed arrays and sorted JSON keys. The mesh is a small weighted biped made from fixed vertices and indices; joints use the exact semantic order from `BipedBoneIdV1`; inverse bind matrices are fixed; each animation uses fixed 30 FPS key times. The four clips have these contracts:

```ts
const CLIPS = [
  { name: "idle", durationSeconds: 2, loop: true, amplitudeRadians: 0.03 },
  { name: "walk", durationSeconds: 1, loop: true, amplitudeRadians: 0.35 },
  { name: "run", durationSeconds: 0.6, loop: true, amplitudeRadians: 0.55 },
  { name: "jump", durationSeconds: 0.8, loop: false, amplitudeRadians: 0.4 },
] as const;
```

Use only rotation channels for locomotion clips so Root/Hips world translation remains zero. Emit aligned JSON and BIN chunks with GLB magic `0x46546c67`, version `2`, and exact total length.

- [ ] **Step 4: Generate and verify the committed fixture**

Add script:

```json
{
  "generate:golden-humanoid": "tsx scripts/fixtures/generate-golden-humanoid-glb.ts --write"
}
```

Run: `pnpm generate:golden-humanoid`

Run: `pnpm generate:golden-humanoid && git diff --exit-code -- apps/playground/public/worldkit-assets/golden-humanoid.glb`

Expected: the second generation produces byte-identical output and no diff.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/fixtures apps/playground/public/worldkit-assets/golden-humanoid.glb
git commit -m "test: add deterministic rigged subject asset"
```

---

### Task 2: Raw Byte Hashing and Asset Registry Resources

**Files:**
- Modify: `packages/protocol/src/canonical-json.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/canonical-json.test.ts`
- Modify: `packages/subject-registry/src/types-v2.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/authoring/src/types.ts`

**Interfaces:**
- Consumes: Task 1 artifact Hash and Inventory.
- Produces:

```ts
export function sha256Bytes(bytes: Uint8Array): string;

export interface SubjectResourceRegistryV2 {
  resolveSubjectAsset(resourceRef: string): SubjectAssetManifestV1 | undefined;
  resolveRigProfile(resourceRef: string): RigProfileManifestV1 | undefined;
  resolveAnimationSet(resourceRef: string): AnimationSetManifestV1 | undefined;
  resolveColliderProfile(resourceRef: string): ColliderProfileManifestV1 | undefined;
  // Existing exact resolvers remain.
}
```

- Built-in refs:
  - `worldkit://subject-asset/humanoid.golden@1`
  - `worldkit://rig-profile/biped.golden@1`
  - `worldkit://animation-set/humanoid.ground.golden@1`
  - `worldkit://collider-profile/humanoid.medium-capsule@1`

Task 3 consumes those four resources and produces
`worldkit://subject-definition/humanoid.rigged-golden@1` after Registry and Authoring share
the same Visual/Socket unions.

- [ ] **Step 1: Add failing protocol and registry tests**

```ts
it("hashes raw bytes without canonical JSON conversion", () => {
  expect(sha256Bytes(new Uint8Array([0, 1, 2]))).toBe(
    "sha256:ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc",
  );
});

it("resolves the exact Golden asset binding graph", () => {
  const animationSet = builtInSubjectResourceRegistry.resolveAnimationSet(
    "worldkit://animation-set/humanoid.ground.golden@1",
  );
  expect(animationSet).toMatchObject({
    subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
    rigProfileRef: "worldkit://rig-profile/biped.golden@1",
    requiredActionIds: ["idle", "walk", "run", "jump"],
  });
});
```

Also assert exact refs reject `@latest`, unversioned refs, alternate namespaces, duplicate resource refs, duplicate Action IDs, and duplicate Clip mappings.

- [ ] **Step 2: Run focused tests and verify type/export failures**

Run: `pnpm vitest run packages/protocol/src/canonical-json.test.ts packages/subject-registry/src/subject-registry.test.ts`

Expected: FAIL because byte hashing and the four resource kinds are absent.

- [ ] **Step 3: Implement byte hashing and immutable registry types**

```ts
export function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}
```

Implement the four resource interfaces from the Spec exactly. Extend
`SubjectRegistryResourceInputV1`, `SubjectRegistryResourceV1`, registry locking, stable listing,
and exact resolvers. Extend Authoring `ResolvedResourceKindV1` with only these four Registry
resource kinds so its closed lock-entry contract continues to typecheck. Do not change Subject
Visual Part, Socket, or Subject Definition shapes in this task; Task 3 changes Registry and
Authoring definitions together.

- [ ] **Step 4: Register the Golden resource graph**

Use Task 1's exact byte length, Hash, Inventory, project-owned provenance, 18 Bone mappings,
four required Animation bindings, and an explicit medium capsule. Task 3 adds the rigged
Subject Definition after the public Subject unions exist.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm vitest run packages/protocol/src/canonical-json.test.ts packages/subject-registry/src/subject-registry.test.ts`

Run: `pnpm typecheck`

Expected: PASS; every new resource is deeply frozen and Canonical-hashed.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol packages/subject-registry
git commit -m "feat: register rigged subject resources"
```

---

### Task 3: Strict Asset Subject Authoring and Normalization

**Files:**
- Modify: `packages/authoring/src/subject-definition-v1.schema.json`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/resource-lock.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/normalize.test.ts`
- Modify: `packages/authoring/src/validate.ts`
- Modify: `packages/authoring/src/authoring.test.ts`
- Modify: `packages/authoring/src/test-fixture.ts`
- Modify: `packages/subject-registry/src/types-v2.ts`
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `scripts/lib/subject-explain.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`

**Interfaces:**
- Consumes: Task 2 exact registry graph.
- Produces stable normalized tables:

```ts
interface NormalizedWorldResourcesV2 {
  prototypes: readonly PrimitivePrototypeSpecV2[];
  subjectDefinitions: readonly NormalizedSubjectDefinitionV2[];
  subjectAssets: readonly NormalizedSubjectAssetV1[];
  rigProfiles: readonly NormalizedRigProfileV1[];
  animationSets: readonly NormalizedAnimationSetV1[];
  colliderProfiles: readonly NormalizedColliderProfileV1[];
  resourceLock: readonly ResolvedResourceLockEntryV1[];
  resourceLockHash: string;
}
```

- `normalizeSubjectDefinitionV2` adds every transitive resource to the lock exactly once and never reads GLB bytes.

- [ ] **Step 1: Add accepted and rejected JSON Schema tests**

```ts
it("accepts one rigged Asset Part with exact Profiles", () => {
  const result = validatePackageSubjectDefinition(createValidRiggedPackageDefinition());
  expect(result.ok).toBe(true);
});

it.each([
  ["asset part with colliderContribution", "/visualParts/0/colliderContribution"],
  ["rigged binding without animationSetRef", "/visualBinding/animationSetRef"],
  ["static binding containing an asset part", "/visualBinding/mode"],
  ["bone socket without boneId", "/sockets/0/boneId"],
])("rejects %s", (_label, instancePath) => {
  const result = validatePackageSubjectDefinition(invalidFixtureFor(instancePath));
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: "error", instancePath }),
  ]));
});
```

- [ ] **Step 2: Run Authoring tests and verify Schema/type failures**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts packages/authoring/src/subject-definition-normalizer.test.ts`

Expected: FAIL because Asset Part, Profile Collider, Bone Socket, and normalized tables are absent.

- [ ] **Step 3: Implement the Schema and TypeScript discriminated unions**

Use `oneOf` branches with `additionalProperties: false`. Asset Part requires
`subjectAssetRef`, `localTransform.positionMetersXYZ`, `localTransform.scaleXYZ`, and
`appearance.mode`. Rigged Visual Binding requires both refs. Collider Policy has exact
`derive` and `profile` branches. Socket has exact `local` and `bone` branches.

Apply the same unions to Registry definitions in this step, add
`visualBinding: { mode: "static" }` and `kind: "local"` to existing built-ins, then register
`worldkit://subject-definition/humanoid.rigged-golden@1` with one Golden Asset Part, rigged
Visual Binding, Bone Socket, and explicit Collider Profile.

Until Task 4 adds the corresponding ExecutionPlan branches, Compiler must explicitly reject a
Normalized Asset Part or Bone Socket with a stable unsupported/invariant error. It must never
silently filter or miscompile either branch. Shared subject explain/CLI code discriminates the
Collider Policy and reports the role-qualified derive or profile Ref.

- [ ] **Step 4: Normalize and lock the transitive binding graph**

Add helpers with exact signatures:

```ts
function resolveRiggedVisualResources(
  definition: SubjectDefinitionSourceV2,
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedRiggedVisualResourcesV1 | undefined;

function resolveColliderPolicy(
  definition: SubjectDefinitionSourceV2,
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedSubjectColliderV2 | undefined;
```

Validate one Asset Part, compatible Asset refs, required Action IDs, Clip inventory,
required Bones, Bone Socket IDs, body topology, positive finite scale, and support-center
Collider. Sort refs, Action bindings, Bone maps, sockets, parts, and resource tables before
hashing. Task 2 already extended Authoring `ResolvedResourceKindV1` with the four transitive
resource kinds required by the lock.

- [ ] **Step 5: Add stable Diagnostic assertions**

Assert every code from Spec section 10 that belongs to Normalize, including exact
`instancePath`, offending Ref, and available compatible refs. Verify no message recommends
editing Babylon or a Scene script.

- [ ] **Step 6: Run Authoring and regression tests**

Run: `pnpm vitest run packages/authoring/src`

Run: `pnpm vitest run packages/subject-registry/src packages/subject-composition/src`

Expected: PASS; reordering manifest arrays does not change normalized hashes.

- [ ] **Step 7: Commit**

```bash
git add packages/authoring packages/subject-registry
git commit -m "feat: normalize asset subject definitions"
```

---

### Task 4: Runtime Contracts and Compiler Resource Tables

**Files:**
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/subject-registry/src/types-v2.ts`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/resource-lock.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: Task 3 Normalized resource tables.
- Produces:

```ts
export interface ExecutionSubjectAssetV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  inventory: SubjectAssetInventoryV1;
}

export type ExecutionBipedBoneIdV1 =
  | "root" | "hips" | "spine" | "chest" | "neck" | "head"
  | "upper-arm.left" | "lower-arm.left" | "hand.left"
  | "upper-arm.right" | "lower-arm.right" | "hand.right"
  | "upper-leg.left" | "lower-leg.left" | "foot.left"
  | "upper-leg.right" | "lower-leg.right" | "foot.right";

export type ExecutionGroundHumanoidActionIdV1 = "idle" | "walk" | "run" | "jump";

export interface ExecutionRigProfileV1 {
  rigProfileRef: string;
  bodyTopology: "biped";
  skeletonRootNodeName: string;
  requiredBoneIds: readonly ExecutionBipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<ExecutionBipedBoneIdV1, string>>;
}

export interface ExecutionAnimationBindingV1 {
  actionId: ExecutionGroundHumanoidActionIdV1;
  sourceClipName: string;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

export interface ExecutionAnimationSetV1 {
  animationSetRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: ExecutionGroundHumanoidActionIdV1;
  requiredActionIds: readonly ExecutionGroundHumanoidActionIdV1[];
  animationBindings: readonly ExecutionAnimationBindingV1[];
}

export interface ExecutionColliderProfileV1 {
  colliderProfileRef: string;
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  collider: ExecutionSubjectCapsuleV1;
}

export interface ExecutionSubjectCapsuleV1 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: Vec3;
}

export interface SubjectVisualAssetPartV3 {
  id: string;
  kind: "asset";
  subjectAssetRef: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
    scaleXYZ: Vec3;
  };
  appearance: { mode: "whitebox-neutral" };
  semanticTags: readonly string[];
}

export interface SubjectBoneSocketV3 {
  id: string;
  kind: "bone";
  boneId: ExecutionBipedBoneIdV1;
  offsetTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export type SubjectVisualPartV3 = SubjectVisualPrimitivePartV3 | SubjectVisualAssetPartV3;
export type SubjectSocketV3 = SubjectLocalSocketV3 | SubjectBoneSocketV3;

export type ExecutionSubjectVisualBindingV1 =
  | { mode: "static" }
  | { mode: "rigged"; rigProfileRef: string; animationSetRef: string };

export type SemanticInputActionV1 =
  | "move-forward" | "move-backward" | "move-left" | "move-right"
  | "jump" | "run";
```

- `ExecutionPlanV3` adds stable, deduplicated `subjectAssets`, `rigProfiles`,
  `animationSets`, and `colliderProfiles` arrays. No URI or Babylon type appears.
- `ExecutionSubjectV3` preserves the selected `visualBinding`; Asset Visual Parts preserve only
  their exact Ref, Transform, whitebox appearance, and semantic tags. Bone Sockets preserve
  `boneId` and `offsetTransform`. Runtime must never infer selected Rig/Animation resources from
  global tables.
- Runtime-owned descriptors copy only fields required by the adapter. They exclude Registry
  `id`, `version`, manifest `contentHash`, `aiMetadata`, bounds, coordinate metadata,
  Provenance/URI fields, raw bytes, and provider handles. The Asset descriptor keeps the
  separate artifact content Hash required for byte verification.
- Normalized IR uses the same explicit minimal descriptor shapes rather than aliasing complete
  Registry manifests: field names and nesting are literally identical to the four Execution
  descriptors (`subjectAssetRef`, `rigProfileRef`, `animationSetRef`, `colliderProfileRef`, and
  flattened Asset artifact fields). Registry Manifest `contentHash` remains only in Resource Lock; Asset
  Provenance, `sourceUri`, `licenseUri`, `aiMetadata`, bounds, and other discovery/import data
  never enter serialized Normalized IR or ExecutionPlan.

- [ ] **Step 1: Add failing contract and compiler tests**

```ts
it("compiles one rigged Subject into ref-only visual parts and resource tables", () => {
  const plan = compileValidRiggedWorld();
  expect(plan.subjects[0]?.visualParts).toEqual([
    expect.objectContaining({
      kind: "asset",
      subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
    }),
  ]);
  expect(plan.subjectAssets).toHaveLength(1);
  expect(JSON.stringify(plan)).not.toContain("golden-humanoid.glb");
  expect(JSON.stringify(plan)).not.toMatch(/Babylon|Havok|AssetContainer/);
});
```

Add a two-instance test proving resource tables deduplicate while Subjects remain distinct,
plus resource-budget accounting that counts asset vertices/triangles once per instance. Add an
unused Definition/resources case proving unreachable rows do not leak into ExecutionPlan, and
missing/duplicate/mismatched normalized-table cases proving stable
`COMPILER_NORMALIZED_IR_INVALID` diagnostics. Assert exact descriptor keys using a fixture whose
Asset Provenance contains `sourceUri` and `licenseUri`, so stripping is tested rather than
assumed. Serialize and inspect both Normalized IR and ExecutionPlan; neither may contain those
injected URI values, Asset Provenance, Registry AI metadata, or provider terms. The four
Normalized resource tables and four Execution tables may not contain Manifest `contentHash`.
Whole Normalized IR legitimately retains Resource Lock entry `contentHash` and optional
top-level world Provenance; the test must not reject those unrelated fields.

- [ ] **Step 2: Run focused tests and verify missing contract fields**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.test.ts`

Expected: FAIL because asset descriptors, the `run` semantic input, and split Walk/Run speed
fields do not exist. Snapshot Action state remains deferred to Task 7, where Runtime can
populate it atomically with the Action resolver and animation player.

- [ ] **Step 3: Implement engine-neutral execution descriptors**

Mirror only normalized data required by Runtime. Preserve exact refs and artifact hashes.
Do not copy Provenance URLs into ExecutionPlan. Keep Primitive and Asset visual branches
closed and role-qualified. Replace Task 3's explicit Compiler guard for Asset Parts and Bone
Sockets with the real ref-only ExecutionPlan mapping in this task. Preserve the closed selected
Visual Binding on each Subject. Add an explicit guard in `subject-visual.ts` that returns the
stable asset-resolver-required failure for an Asset Part until Task 7 installs async asset
visuals; the Primitive rendering path must remain unchanged.

Replace Task 3's full-Manifest aliases for `NormalizedSubjectAssetV1`,
`NormalizedRigProfileV1`, `NormalizedAnimationSetV1`, and `NormalizedColliderProfileV1` with
explicit normalized descriptors matching the minimal field policy above. Normalizer validates
against immutable Registry manifests, then emits only these stable descriptors; Resource Lock
continues to pin exact Manifest content hashes separately.

- [ ] **Step 4: Compile stable resource tables and costs**

Collect only resources reachable from materialized Subjects, deduplicate by exact Ref, sort by
Ref, and throw invariant errors only when Normalized IR is internally inconsistent. Count each
Subject instance's already-declared vertices, triangles, and single Character Collider exactly
once against world budget; never add resource-table inventory or another Collider a second time.
Two instances sharing one Definition charge two instance costs while all four descriptor tables
keep one row.

- [ ] **Step 5: Split ground locomotion speed cleanly**

Replace `groundSpeedMetersPerSecond` everywhere in Registry → Normalized IR → ExecutionPlan
with `walkSpeedMetersPerSecond` and `runSpeedMetersPerSecond`. Use built-in defaults `2.4` and
`4.0`; keep `waterSpeedMetersPerSecond: 2.2` and `jumpSpeedMetersPerSecond: 5.5`. Update
`SubjectController` in the same commit so `run` selects Run speed, ordinary movement selects
Walk speed, and intermediate commits continue to typecheck. Snapshot Action state is added in
Task 7 together with the Action resolver and animation player.

- [ ] **Step 6: Run focused tests, canonical regression, and typecheck**

Run: `pnpm vitest run packages/runtime-contracts/src packages/compiler/src`

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts packages/authoring/src/subject-definition-normalizer.test.ts`

Run: `pnpm typecheck`

Expected: PASS. The locomotion resource content Hash, Resource Lock Hash, Normalized IR Hash,
ExecutionPlan Hash, and serialized speed fields may change intentionally; Subject Definition
Hashes remain stable. Tracked canonical artifacts and the long-distance canonical verifier are
updated by their conformance owner in Task 9 rather than by this contract task.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime-contracts packages/compiler packages/subject-registry packages/authoring packages/runtime-babylon
git commit -m "feat: compile rigged subject execution resources"
```

---

### Task 5: Engine-neutral Fixed-tick Subject Actions

**Files:**
- Create: `packages/subject-actions/package.json`
- Create: `packages/subject-actions/src/index.ts`
- Create: `packages/subject-actions/src/types.ts`
- Create: `packages/subject-actions/src/ground-humanoid-action-resolver.ts`
- Create: `packages/subject-actions/src/subject-actions.test.ts`
- Modify: `packages/animation/package.json`
- Modify: `packages/animation/src/humanoid-action-state-machine.ts`
- Modify: `packages/animation/src/animation.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: physics-derived movement medium/speed and current input modifier.
- Produces:

```ts
export type GroundHumanoidActionIdV1 = "idle" | "walk" | "run" | "jump";

export interface GroundHumanoidActionInputV1 {
  movementMedium: "ground" | "air" | "water";
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
}

export function resolveGroundHumanoidAction(
  input: GroundHumanoidActionInputV1,
): GroundHumanoidActionIdV1;
```

- [ ] **Step 1: Write the complete transition-table test**

```ts
it.each([
  [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0, runRequested: false }, "idle"],
  [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0.081, runRequested: false }, "walk"],
  [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 2.4, runRequested: true }, "run"],
  [{ movementMedium: "air", horizontalSpeedMetersPerSecond: 0, runRequested: false }, "jump"],
] as const)("maps %j to %s", (input, expected) => {
  expect(resolveGroundHumanoidAction(input)).toBe(expected);
});
```

Also assert non-finite/negative speed throws `RangeError`, water movement resolves to `walk`
or `run` only as the explicitly documented S1b fallback, and zero-speed water resolves `idle`.
The table must cover Ground and Water at `0`, exactly `0.08`, and `> 0.08` with both Run
values; Air at zero/moving speed with both Run values; and validation of `NaN`, both infinities,
and negative values before action resolution. Air always wins.

- [ ] **Step 2: Run the focused test and verify missing package failure**

Run: `pnpm vitest run packages/subject-actions/src/subject-actions.test.ts`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement the pure resolver**

```ts
export function resolveGroundHumanoidAction(input: GroundHumanoidActionInputV1) {
  if (!Number.isFinite(input.horizontalSpeedMetersPerSecond) || input.horizontalSpeedMetersPerSecond < 0) {
    throw new RangeError("horizontalSpeedMetersPerSecond must be finite and non-negative.");
  }
  if (input.movementMedium === "air") return "jump";
  if (input.horizontalSpeedMetersPerSecond <= 0.08) return "idle";
  return input.runRequested ? "run" : "walk";
}
```

- [ ] **Step 4: Run tests and dependency audit**

Make `@whitebox-world/subject-actions` the single action-selection truth. The existing legacy
Three-facing Humanoid state machine may continue to derive `runRequested` from its configured
speed threshold and apply declared missing-clip fallback, but delegates priority/action
selection to the pure resolver. It must not retain a competing branch table.

Run: `pnpm vitest run packages/subject-actions/src/subject-actions.test.ts`

Run: `pnpm vitest run packages/animation/src/animation.test.ts`

Run: `rg -n "babylon|havok|three|window|document" packages/subject-actions`

Expected: test PASS; dependency audit returns no implementation matches.

- [ ] **Step 5: Commit**

```bash
git add packages/subject-actions packages/animation pnpm-lock.yaml
git commit -m "feat: resolve semantic subject actions"
```

---

### Task 6: Babylon Asset Resolver, Hash Gate, and Cache

**Files:**
- Modify: `packages/runtime-babylon/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/runtime-babylon/src/subject-asset-cache.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: `ExecutionSubjectAssetV1`, Host `SubjectAssetResolverV1`, Task 1 GLB bytes.
- Produces:

```ts
export interface SubjectAssetResolveRequestV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
}

export interface ResolvedSubjectAssetBytesV1 {
  bytes: Uint8Array;
  sourceLabel: string;
}

export interface SubjectAssetResolverV1 {
  resolveSubjectAsset(request: SubjectAssetResolveRequestV1):
    Promise<ResolvedSubjectAssetBytesV1>;
}

export interface SubjectAssetLeaseV1 {
  instantiate(subjectEntityId: string): SubjectAssetInstanceV1;
  release(): void;
}

export interface SubjectAssetInstanceV1 {
  rootNodes: readonly TransformNode[];
  meshes: readonly AbstractMesh[];
  skeletons: readonly Skeleton[];
  animationGroups: readonly AnimationGroup[];
  dispose(): void;
}

export interface SubjectAssetRuntimeLimitsV1 {
  maxByteLengthBytes: number;
  maxMeshCount: number;
  maxVertexCount: number;
  maxTriangleCount: number;
  maxSkeletonCount: number;
  maxBoneCount: number;
  maxAnimationClipCount: number;
}

export interface SubjectAssetCacheOptionsV1 {
  runtimeLimits?: SubjectAssetRuntimeLimitsV1;
}

export type SubjectAssetRuntimeErrorCodeV1 =
  | "SUBJECT_ASSET_RESOLVER_REQUIRED"
  | "SUBJECT_ASSET_RESOLVE_FAILED"
  | "SUBJECT_ASSET_LENGTH_MISMATCH"
  | "SUBJECT_ASSET_HASH_MISMATCH"
  | "SUBJECT_ASSET_FORMAT_UNSUPPORTED"
  | "SUBJECT_ASSET_INVENTORY_EXCEEDED"
  | "SUBJECT_ASSET_INVENTORY_MISMATCH"
  | "SUBJECT_ASSET_CACHE_DISPOSED"
  | "SUBJECT_ASSET_LEASE_RELEASED"
  | "SUBJECT_ASSET_DISPOSE_FAILED"
  | "SUBJECT_ASSET_RIG_INCOMPATIBLE"
  | "SUBJECT_ASSET_ANIMATION_MISSING"
  | "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE"
  | "SUBJECT_ASSET_SOCKET_BONE_MISSING"
  | "SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED";

export class SubjectAssetRuntimeErrorV1 extends Error {
  readonly code: SubjectAssetRuntimeErrorCodeV1;
  readonly subjectAssetRef?: string;
  readonly artifactContentHash?: string;
}

export function isSubjectAssetRuntimeErrorV1(
  error: unknown,
): error is SubjectAssetRuntimeErrorV1;

export class SubjectAssetCacheV1 {
  constructor(scene: Scene, resolver?: SubjectAssetResolverV1, options?: SubjectAssetCacheOptionsV1);
  acquire(asset: ExecutionSubjectAssetV1): Promise<SubjectAssetLeaseV1>;
  dispose(): Promise<void>;
}
```

Export every type above from `packages/runtime-babylon/src/index.ts`. The resolve request contains
exactly Ref, expected content Hash, byte length, and media type: no URI, credentials, raw bytes, or
provider option may enter ExecutionPlan. A missing result or non-`Uint8Array` `bytes` value is
`SUBJECT_ASSET_RESOLVE_FAILED`. `sourceLabel` is diagnostic metadata owned by the Host, but S1b never
copies it into thrown errors or logs.

All Task 6/7 Asset, Rig, Animation, Socket, and Root Motion failures use the closed public Error
type above; its message contains no provider/Babylon text or `cause`. The type guard validates the
closed code rather than asking Task 8 to parse `Error.message`. Ref and expected Hash are the only
optional safe context fields. Unknown Runtime initialization errors are not coerced into this
class.

- [ ] **Step 1: Add resolver/hash/cache failure tests**

```ts
it("resolves and parses identical Asset bytes once", async () => {
  const resolver = createCountingMemoryResolver(goldenBytes);
  const cache = new SubjectAssetCacheV1(scene, resolver);
  const first = await cache.acquire(goldenDescriptor);
  const second = await cache.acquire(goldenDescriptor);
  expect(resolver.calls).toBe(1);
  first.release();
  second.release();
  await cache.dispose();
});

it("rejects bytes before Babylon parsing when the hash is wrong", async () => {
  const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(tamperedBytes));
  await expect(cache.acquire(goldenDescriptor)).rejects.toThrow(
    /SUBJECT_ASSET_HASH_MISMATCH/,
  );
});
```

Add missing resolver, invalid resolver result, resolver throw, byte-length mismatch, unsupported
format, forbidden external GLB buffer/image URI, invalid/relaxed injected limits, release twice,
instantiate-after-release, dispose twice, and acquire-after-dispose tests. Add two concurrent
acquires sharing one resolver and parse Promise; cache-hit and pending-join descriptor-conflict
tests; failure eviction followed by successful retry; Dispose racing pending resolve/parse;
release/instantiate during and after Dispose; disposal of live forgotten instances; repeated
Dispose Promise identity; and stable descending full-cache-key disposal-order tests. Assert the
stable error-precedence table below with multi-invalid fixtures.

- [ ] **Step 2: Add Babylon GLB loader dependency and verify failing tests**

Run: `pnpm add --filter @whitebox-world/runtime-babylon @babylonjs/loaders@^9.21.2 @whitebox-world/protocol@workspace:* @whitebox-world/subject-actions@workspace:*`

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because the cache implementation is missing.

- [ ] **Step 3: Implement pre-parse integrity gates**

Compare `bytes.byteLength` and `sha256Bytes(bytes)` to the Execution descriptor before calling
Babylon. Before parsing require non-empty bytes, a 12-byte GLB header, magic `glTF`, version 2,
and header-declared total length equal to `bytes.byteLength`. Read the header through
`DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)` with little-endian integer reads.
Walk the complete GLB chunk table, require one valid JSON chunk, and reject any
`buffers[*].uri` or `images[*].uri` before Babylon; S1b accepts self-contained GLB bytes only and
must not permit loader-initiated network or file resolution. Map malformed headers/chunks, JSON,
forbidden external references, or loader parse failures to `SUBJECT_ASSET_FORMAT_UNSUPPORTED`
without leaking Babylon text. Wrap resolver throws or invalid return values with
`SUBJECT_ASSET_RESOLVE_FAILED` and include only Ref and expected Hash. Never include
`sourceLabel`, credentials, raw bytes, arbitrary resolver messages, or causes.

Apply this stable failure precedence whenever one input violates more than one gate:

1. closed cache → `SUBJECT_ASSET_CACHE_DISPOSED`;
2. unsupported descriptor media/format → `SUBJECT_ASSET_FORMAT_UNSUPPORTED`;
3. descriptor Inventory/bytes above configured limits → `SUBJECT_ASSET_INVENTORY_EXCEEDED`;
4. missing Resolver → `SUBJECT_ASSET_RESOLVER_REQUIRED`;
5. Resolver throw or invalid result → `SUBJECT_ASSET_RESOLVE_FAILED`;
6. actual byte length mismatch → `SUBJECT_ASSET_LENGTH_MISMATCH`;
7. content Hash mismatch → `SUBJECT_ASSET_HASH_MISMATCH`;
8. GLB header/chunk/JSON/loader/forbidden-content failure → `SUBJECT_ASSET_FORMAT_UNSUPPORTED`;
9. parsed runtime limits exceeded → `SUBJECT_ASSET_INVENTORY_EXCEEDED`;
10. exact descriptor Inventory mismatch → `SUBJECT_ASSET_INVENTORY_MISMATCH`.

Validate every configured limit as a finite positive integer no greater than the SDK default;
invalid or relaxed values throw `RangeError`. Check expected descriptor bounds before resolving
and parsed actual bounds after loading.

- [ ] **Step 4: Implement AssetContainer parsing and reference ownership**

Import the glTF loader registration once, then use:

```ts
const container = await LoadAssetContainerAsync(bytes, scene, {
  pluginExtension: ".glb",
});
```

Key entries by `${subjectAssetRef}\n${artifactContentHash}`. Keep a ref count for leases;
`release()` is idempotent. Cache disposal rejects new acquires, waits for pending loads, disposes
containers in descending lexicographic full-cache-key order, and is idempotent. Every acquire,
including a cache hit or pending-Promise join, validates media type, format, byte length, and the
complete expected Inventory against the entry's frozen descriptor and parsed Inventory before
incrementing its ref count; conflict rejects without changing ownership. A lease may instantiate multiple
independent `SubjectAssetInstanceV1` wrappers until release. Each wrapper owns cloned roots,
Skeletons, and AnimationGroups and has idempotent `dispose()`. Lease release safely disposes any
forgotten live instances before decrementing the Ref count; zero refs retain a reusable parsed
entry until Cache Dispose. The lease always calls Babylon with `{ doNotInstantiate: true }`
internally; Task 7 never passes provider options.

Dispose atomically closes the Cache, invalidates/releases all existing leases, disposes their
live instances, awaits pending loads with all-settled semantics, then disposes every successfully
loaded container. An acquire already pending when Dispose begins rejects with
`SUBJECT_ASSET_CACHE_DISPOSED` regardless of its eventual load outcome and cannot return a lease.
If its resolve/parse completes during the race, dispose the newly created container exactly once.
`instantiate()` after Cache disposal or lease release rejects with
`SUBJECT_ASSET_LEASE_RELEASED`; later `release()` is harmless. Repeated `dispose()` returns the
same stored completion Promise object.

After parsing, compute actual mesh/vertex/triangle/Skeleton/Bone/Clip inventory and require it
to match the descriptor and not exceed adapter-owned `SubjectAssetRuntimeLimitsV1`. Mesh count
includes every renderable geometry-bearing Mesh even when Geometry is shared. Vertex/index totals
deduplicate referenced Geometry by object identity/`uniqueId`; S1b requires indexed triangle-list
Geometry, so missing indices or an index count not divisible by three is
`SUBJECT_ASSET_FORMAT_UNSUPPORTED`. Skeleton count is the container Skeleton array length and
Bone count is their summed Bone count. Sort Clip names for order-insensitive exact-set comparison,
but reject duplicate actual AnimationGroup names as `SUBJECT_ASSET_INVENTORY_MISMATCH`.
Descriptor mismatch uses stable `SUBJECT_ASSET_INVENTORY_MISMATCH`. Use conservative
default browser safety limits of 128 MiB, 256 meshes, 2,000,000 vertices, 2,000,000 triangles,
8 Skeletons, 512 Bones, and 256 Clips; Hosts may inject stricter limits. Inventory overflow uses
stable `SUBJECT_ASSET_INVENTORY_EXCEEDED`. Hash identity remains the primary exact-content gate.

Reject with `SUBJECT_ASSET_FORMAT_UNSUPPORTED` when the source container has non-empty Cameras,
Lights, Sounds, or container `actionManagers`; when any Mesh has an attached `actionManager`; or
when any `container.getNodes()` entry has Behaviors. Dispose the newly loaded container exactly
once for every post-parse rejection, including forbidden content, Inventory mismatch/overflow,
and Cache-disposal races. Standard static glTF material/mesh extensions are not rejected merely
for being extensions; executable behavior remains outside the runtime asset contract.

- [ ] **Step 5: Load the real Golden GLB in NullEngine**

Assert one cache entry can instantiate two `InstantiatedEntries`, both have one Skeleton and
four AnimationGroups, and their root/Mesh/Skeleton/AnimationGroup object identities differ.
Build each wrapper Mesh snapshot by visiting every returned root (including a root that is itself
an `AbstractMesh`) and `getChildMeshes(false)`, deduplicating by `uniqueId` in stable
root/traversal order. Snapshot all wrapper arrays before native Babylon disposal empties its
entries. Use `subjectEntityId` only as the deterministic clone-name prefix; never rename source
Bone names. Dispose both instances before releasing their leases and prove forgotten-instance
safety cleanup.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime-babylon/package.json packages/runtime-babylon/src pnpm-lock.yaml
git commit -m "feat: load hash-verified subject assets"
```

---

### Task 7: Rigged Visuals, Fixed-tick Animation, and Havok Integration

**Files:**
- Create: `packages/runtime-babylon/src/subject-animation-player.ts`
- Modify: `packages/runtime-babylon/src/subject-asset-cache.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6 execution resources, action resolver, Asset leases.
- Produces:

```ts
export interface SubjectMotionSampleV1 {
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
  movementMedium: "ground" | "air" | "water";
}

export interface SubjectRuntimeStateV3 {
  // Existing identity, transform, velocity, and movement-medium fields remain.
  activeActionId: "idle" | "walk" | "run" | "jump";
}

export interface SubjectVisual {
  root: TransformNode;
  meshes: readonly AbstractMesh[];
  socketNodesById: ReadonlyMap<string, TransformNode>;
  activeActionId: GroundHumanoidActionIdV1;
  stepAnimation(tick: number, actionId: GroundHumanoidActionIdV1): void;
  resetAnimation(): void;
  dispose(): void;
}

export async function createSubjectVisual(...): Promise<SubjectVisual>;

export interface BabylonWorldRuntimeOptions {
  // Existing executionPlan/canvas/engine/render-loop/Havok fields remain.
  subjectAssetResolver?: SubjectAssetResolverV1;
  subjectAssetCacheOptions?: SubjectAssetCacheOptionsV1;
}
```

Task 7 is the Runtime composition owner: it creates one Asset Cache from these injected Host
options and supplies it to every Asset Visual. Primitive-only worlds may omit both fields; an
Asset world without a Resolver fails with `SUBJECT_ASSET_RESOLVER_REQUIRED`. Task 8 injects the
Playground fetch Resolver through this public options boundary and never constructs a Cache
itself.

- [ ] **Step 1: Add animation, rig, socket, and instance-isolation tests**

```ts
it("keeps two Subjects on independent Skeleton and Action state", async () => {
  const runtime = await createRiggedRuntimeWithTwoSubjects();
  const probe = createRiggedRuntimeProbe(runtime);
  await runtime.runFixedInput({ actions: ["move-forward", "run"], ticks: 30 });
  expect(runtime.snapshot().subjectStatesByEntityId.heroA?.activeActionId).toBe("run");
  expect(runtime.snapshot().subjectStatesByEntityId.heroB?.activeActionId).toBe("idle");
  expect(probe.skeleton("heroA")).not.toBe(probe.skeleton("heroB"));
  await runtime.dispose();
});
```

Add `idle → walk → run → jump → idle`, fixed-tick same-input same-state, Bone Socket follows
`hand.right`, mixed Asset+Primitive parts, Local+Bone Sockets, duplicate/missing source Bone,
missing/duplicate/empty or malformed Clip, invalid playback/blend values, Root/Hips translation
rejection for Bone and linked TransformNode targets, Reset, partial-construction cleanup, and
double Dispose tests. Require one and only one Skeleton, one unique parentless named root Bone,
and one-to-one required semantic Bone mappings. Two instances must also have different
roots/Meshes/AnimationGroups, independent weights/frames/Sockets, and isolated disposal.

- [ ] **Step 2: Run focused tests and verify async visual/action failures**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because visuals are synchronous Primitive-only and Snapshot has no Action state.

- [ ] **Step 3: Implement `SubjectAnimationPlayer`**

Map `sourceClipName` to the instance's exact AnimationGroup. Start groups, immediately pause
them, and sample frames from fixed ticks with per-action `actionStartTick`:
`elapsedFrames = (tick - actionStartTick) / 60 * playbackSpeedRatio * fps`. With
`span = to - from`, Repeat actions sample `from + (elapsedFrames % span)` and Once actions sample
`min(to, from + elapsedFrames)`. Transitions store start Tick and duration in integer Ticks;
`blendAlpha = durationTicks === 0 ? 1 : clamp((tick - transitionStartTick) / durationTicks, 0, 1)`.
Advance previous and next groups during blending, call `goToFrame(frame, true)`, set deterministic
weights from elapsed Ticks, then stop the previous group at zero weight. Render frames never
advance action time. Convert `blendDurationSeconds * 60` with `Math.round` and a minimum of zero
Ticks. Require exactly one group for every mapped Clip, non-empty targeted animations, one finite
positive FPS across the group, finite `from < to`, a finite positive playback ratio, and a finite
nonnegative blend duration; these structural failures use
`SUBJECT_ASSET_ANIMATION_INCOMPATIBLE`. If a third Action arrives mid-blend, stop the older
source, promote the current target to source weight 1, and start only the new target; at most two
groups remain active. `reset()` stops all groups and samples `idle` at `idle.from`; “frame zero”
means elapsed frame zero, never absolute Babylon frame 0 unless the Clip starts there.

- [ ] **Step 4: Implement Asset Visual instantiation and Rig validation**

Acquire a lease, call `instantiate(subjectEntityId)`, create one visual root,
parent every imported root under the Asset Part root, apply local Transform and scale, replace
renderable materials with the neutral Subject material, reject imported Camera/Light behavior,
resolve semantic Bones through a manually built unique source-name map, and build Local/Bone
Socket nodes. Bone sockets use `TransformNode.attachToBone(bone, affectedSkinnedMesh)`; never
use `Bone.linkTransformNode()`. Dispose/detach Socket nodes explicitly. Reject Root/Hips
translation channels with `SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED`; forbidden target identities
are the mapped Root/Hips Bone objects and each non-null `bone.getTransformNode()` result. Reject
any targeted property path beginning with `position`, even when its keys are constant, and never
infer targets from display names. Animation cannot move the controller. On any failure, dispose
the partial instance and release the lease before rethrowing the stable code.

Require `instance.skeletons.length === 1` for the current S1b Asset. Build a unique map of every
`bone.name`; verify `skeletonRootNodeName` names the one unique parentless Bone and every required
semantic mapping resolves to a distinct Bone. For a Bone Socket, collect meshes
using that Skeleton, require at least one descendant of the instance root, and select the
lexicographically smallest stable mesh name as `affectedSkinnedMesh`. Add missing/multiple
Skeleton, missing/multiple root, and no affected-mesh tests.

- [ ] **Step 5: Split Walk/Run physics and return motion samples**

`SubjectController.step()` preserves Task 4 Walk/Run speed selection and remains the pre-physics
integration phase. Runtime then calls Havok `_step()`, synchronizes each Visual Root from the
post-step Controller position, and calls a separate post-step `sampleMotion(runRequested)` that
returns actual horizontal velocity and movement medium computed from that same position.
Requested motion is not Action truth. Only the controlled Subject's current input contributes
`runRequested`; bypass the resolver for uncontrolled Subjects and set their Visual Action
directly to `idle`. Havok remains authoritative; visual animation never writes the controller
position.

- [ ] **Step 6: Make runtime creation await every Subject visual atomically**

Preload required assets, create Subjects in stable Entity ID order, and if any creation fails,
unwind an ownership stack established immediately after Engine creation. `SubjectVisual.dispose()`
is the exclusive owner of stopping its Animation player, detaching/disposing Socket nodes,
disposing Primitive nodes or its Asset instance, then releasing its Asset lease. Runtime's
reverse ownership stack contains only Controllers, Subject Visuals, Asset Cache, physics
resources, Scene, and Engine; it never separately disposes nested instance/lease resources.
Normal and partial-failure paths use the same ownership boundaries. Every entry disposes exactly
once even if a later Subject/camera fails.
After each physics tick, compute movement medium and actual horizontal velocity, resolve the
Action, and call `stepAnimation(this.tick, actionId)`. Snapshot reads `activeActionId` from the
visual. Reset restores default binding, controller Transform/velocity, Tick zero, Idle action,
all group weights, and Idle elapsed frame zero. `BabylonWorldRuntime.create()` itself rejects on
initialization failure; only successfully returned instances exist and their `ready` Promise is
already resolved. Task 8's deferred Browser API owns carrying factory rejection to automation.

- [ ] **Step 7: Run runtime and physics regression tests**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts packages/physics/src/physics.test.ts`

Run: `pnpm typecheck`

Expected: PASS; Primitive Subjects still render and collide without an Asset Resolver.

- [ ] **Step 8: Commit**

```bash
git add packages/runtime-contracts packages/runtime-babylon
git commit -m "feat: animate rigged Babylon subjects"
```

---

### Task 8: Playground Resolver, Canonical Example, CLI Explain, and HUD

**Files:**
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Create: `apps/playground/src/worldkit-asset-resolver.ts`
- Create: `apps/playground/src/worldkit-asset-resolver.test.ts`
- Create: `apps/playground/src/worldkit-browser-api.ts`
- Create: `apps/playground/src/worldkit-browser-api.test.ts`
- Create: `examples/authoring/rigged-subject-world.json`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `scripts/lib/subject-explain.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`

**Interfaces:**
- Consumes: Task 7 Runtime.
- Produces:

```ts
export interface WorldkitBrowserDiagnosticV1 {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export function createFetchSubjectAssetResolver(
  assetUriByRef: Readonly<Record<string, string>>,
  fetchImplementation?: typeof fetch,
): SubjectAssetResolverV1;
```

- Built-in mapping exists only in the Playground Host:

```ts
{
  "worldkit://subject-asset/humanoid.golden@1":
    "/worldkit-assets/golden-humanoid.glb"
}
```

- [ ] **Step 1: Add failing Playground and CLI tests**

Assert structurally that each ordinary Subject Node contains only `id`, `kind`,
`subjectDefinitionRef`, and `spawnAnchorEntityId`; the world package must not embed a Subject
Definition or expose GLB URI, Bone, Clip, or Collider-size fields. Scope these assertions to
Subject Nodes and an empty `resources.subjectDefinitions`; do not globally ban fields such as
`radiusMeters`, because terrain/water/landmark nodes legitimately use them. `subject explain`
returns Asset/Rig/Animation/Collider refs and lock entries; Registry describe can inspect each
new resource kind; and the HUD uses Snapshot `activeActionId` instead of deriving Walk from
velocity. Add Browser API state-machine tests for early installation, stable Promise identity,
loading/ready/error status, guarded Runtime diagnostics, unknown-error redaction, sync/async
method behavior, and cleanup after post-Runtime startup failure. Add overlapping Left/Right Shift
and Blur input tests. Add Resolver tests for copied mapping ownership, unmapped refs, cross-origin,
userinfo/non-HTTP URLs, redirects, non-OK responses without body reads, exactly one
`arrayBuffer()` call, copied bytes, credential/query/hash-free pathname labels, and the same-origin
built-in mapping.

- [ ] **Step 2: Run focused tests and verify missing resolver/example failures**

Run: `pnpm vitest run scripts/worldkit.test.ts apps/playground/src/authoring-loader.test.ts apps/playground/src/worldkit-asset-resolver.test.ts`

Expected: FAIL because the Host mapping and rigged example do not exist.

- [ ] **Step 3: Implement the same-origin fetch resolver**

Snapshot the mapping's own properties at Resolver creation so later Host mutation has no effect.
Resolve relative URIs against the captured page Origin and permit only same-origin HTTP(S) URLs
without UserInfo. Fetch with `mode: "same-origin"`, `credentials: "same-origin"`, and
`redirect: "error"`; reject redirected/cross-origin responses and non-OK responses without
reading their body. Read exactly one `arrayBuffer`, return `Uint8Array.from(...)` so bytes are an
independent copy, and expose only the URL pathname as `sourceLabel`. An unmapped Ref uses a Host-
internal error, not Normalize's `SUBJECT_ASSET_NOT_FOUND`; once invoked through Runtime every
Resolver failure is the public `SUBJECT_ASSET_RESOLVE_FAILED`. Runtime, not the fetch Resolver,
performs authoritative length/Hash checks.

- [ ] **Step 4: Wire Playground input and HUD**

Track pressed physical keyboard codes, then derive the semantic Action Set, so holding both Shift
keys and releasing one keeps `run`; Blur clears all codes. Map legacy Playground `run` to the same
Canonical token. Pass the fetch Resolver through Task 7's `BabylonWorldRuntimeOptions`. Display
the controlled Subject's `activeActionId` directly.

Create a tested `worldkit-browser-api.ts` state machine. As soon as `authoring=1` is recognized,
before dynamic imports or Authoring load, install one API in state `loading` and set
`data-worldkit-status="loading"`. `ready()` always returns the same startup Promise; diagnostics
are empty while loading. Sync methods throw stable `WORLDKIT_RUNTIME_NOT_READY` while loading;
async methods await startup. Publish `ready` only after Adapter creation, mount, and first frame.
If startup fails, dispose any created Adapter/Runtime before atomically publishing `error`; do not
rethrow an unhandled top-level error. `ready()` rejects and `getDiagnostics()` returns the same
stable diagnostic. Guarded `SubjectAssetRuntimeErrorV1` codes are forwarded without parsing the
message; unknown errors map to `WORLDKIT_RUNTIME_INITIALIZATION_FAILED` with no Cause. Replace the
Browser protocol's arbitrary `Readonly<Record<string, unknown>>` diagnostics with
`WorldkitBrowserDiagnosticV1[]`.

- [ ] **Step 5: Add the rigged Canonical world and Explain output**

Reuse the existing terrain/wall/camera shape but spawn two instances of
`worldkit://subject-definition/humanoid.rigged-golden@1` at two different Spawn Anchors and
non-overlapping positions, with stable Entity IDs and Camera/startup control targeting the
intended controlled instance. Extend lock selection so Explain
includes the Asset, Rig, Animation Set, Collider Profile, Physics Body, Locomotion, Capability,
and Definition entries—exactly those eight resource kinds. Explain keeps
`visualParts[].subjectAssetRef`, adds the selected ref-only `visualBinding`, preserves
`collider.colliderProfileRef`, and never invents aliases or emits URI, bytes, Provenance, or
engine handles.

- [ ] **Step 6: Run CLI, Playground, and build gates**

Run: `pnpm vitest run scripts/worldkit.test.ts apps/playground/src`

Run: `pnpm build`

Run: `pnpm typecheck`

Expected: PASS; Vite emits the GLB at the stable public path.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime-contracts apps/playground examples/authoring/rigged-subject-world.json scripts
git commit -m "feat: expose rigged subjects through CLI and browser"
```

---

### Task 9: Rigged Subject End-to-End Conformance

**Files:**
- Create: `scripts/verify-rigged-subject-world.ts`
- Modify: `package.json`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/lib/worldkit-server.ts`
- Create: `scripts/lib/worldkit-server.test.ts`
- Create: `scripts/lib/artifact-directory-promotion.ts`
- Create: `scripts/lib/artifact-directory-promotion.test.ts`
- Modify: `apps/playground/vite.config.mjs`
- Modify: `examples/authoring/package-subject-world.json`
- Modify: `artifacts/examples/package-subject-world/`
- Create: `artifacts/examples/rigged-subject-world/`

**Interfaces:**
- Consumes: rigged Canonical example and Browser Protocol V3.
- Produces command `pnpm verify:rigged-subject` and evidence under
  `artifacts/examples/rigged-subject-world/`:
  - `world.build.json`
  - `world.png`
  - `idle.png`, `walk.png`, `run.png`, `jump.png`
  - `snapshot.json`
  - `explain.json`
  - `verification.json`

- [ ] **Step 1: Write the failing end-to-end verifier**

The verifier must:

```ts
assert.equal(await worldkitMain(["validate", INPUT_PATH, "--json"]), 0);
assert.equal(await worldkitMain(["build", INPUT_PATH, "--output", BUILD_PATH, "--json"]), 0);
assert.equal(await worldkitMain(["capture", INPUT_PATH, "--output", WORLD_PATH, "--json"]), 0);
```

Then use one Browser Session and fixed inputs to assert:

```ts
idle.activeActionId === "idle";
walk.activeActionId === "walk";
run.activeActionId === "run";
jump.activeActionId === "jump";
reset.activeActionId === "idle";
```

Bind the controller to the second instance and prove the first instance's observable Subject
Origin `positionMetersXYZ` and `activeActionId` remain unchanged; Rotation/Scale isolation stays
owned by Task 7 unit tests because Snapshot does not expose them. Move into the wall and prove
the Havok stop boundary still holds. Capture
each Action screenshot after deterministic ticks. `world.png` is the CLI capture; the four
Action PNGs are Browser fixed-tick captures with distinct provenance.

- [ ] **Step 2: Run the verifier and confirm the missing-script failure**

Run: `pnpm verify:rigged-subject`

Expected: FAIL because the script is not implemented.

- [ ] **Step 3: Implement artifact, lifecycle, and negative gates**

Create `server`, `browser`, `context`, and `page` as optional handles inside one encompassing
`try/finally`, then close Page → Context → Browser → Server in reverse order. Chromium launch
failure reuses `CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE`, stops the Server, and never triggers an
install command. Positive flow uses one Context and Page: call `setPaused(true)`; before every
Action call `reset()`; run fixed Ticks; assert Snapshot Action; then use Browser API
`captureScreenshot()`. Choose Jump Ticks that remain airborne after visible blend weight, then
finish with another Reset/Idle assertion.

Run Tamper in a separate Page/Context. Before `goto`, route exactly
`/worldkit-assets/golden-humanoid.glb`, allow one hit, preserve status/headers, and flip one byte
only in memory. Assert `ready()` rejects, Diagnostics contain exact
`SUBJECT_ASSET_HASH_MISMATCH`, request count is one, and committed GLB bytes before/after are
identical. Runtime double-Dispose remains a Task 7 unit gate. Inspect PNG signatures and require
at least `800×450` dimensions.

Both canonical and rigged verifiers create a unique sibling temporary artifact directory on the
same filesystem as their target. Build, Explain, CLI/Action Capture, Tamper, JSON/PNG/Hash checks,
and runtime-handle cleanup all operate/finish before promotion. Then transactionally promote the
whole target directory with same-filesystem Renames: rename old target to a unique backup and
rename temp to target. If the second
rename fails, restore the untouched backup. After the new target is committed, backup removal is
post-commit garbage collection: a removal failure leaves the new target authoritative, reports
`deferred`, and preserves the backup for later cleanup instead of attempting an unsafe rollback
from a possibly partial backup. Missing Chromium or any pre-promotion Gate/cleanup failure never
promotes. The promoted directory contains exactly the declared file set, so stale artifacts cannot
survive. Fault-injection tests cover all Rename stages and both pre-removal and partial-removal
backup garbage-collection failures.

Write `verification.json` with a versioned Kind/Schema, input/Asset/Normalized IR/ExecutionPlan
Hashes, and per-PNG filename/source/tick/action/entity/dimensions/SHA-256. Include before/after
observable position/action for instance isolation, wall-stop evidence, and Tamper Diagnostic.
Require the four Action PNG Hashes to be pairwise distinct, while retaining the manual pose check.

Harden the shared Server helper with tests. Generate a nonce per start, pass it through the child
environment, and have the Vite authoring endpoint return it in a response header; readiness must
match that nonce while racing child `error`, exit, HTTP readiness, and timeout. Explicit occupied
ports fail stably without reuse or terminating the owner; automatic ports use bounded retry.
Launch the Vite CLI directly, not a pnpm wrapper. On POSIX own a detached process group and signal
only that recorded group; on other platforms signal only the directly owned Vite PID. Establish
and reuse Exit/Stop Promises at handle creation. Stop uses owned SIGTERM, bounded wait, then owned
SIGKILL only; `pkill`/`killall` and any broad process search are forbidden.

- [ ] **Step 4: Update the existing canonical verifier intentionally**

Migrate `examples/authoring/package-subject-world.json` to the strict static `visualBinding` and
Local Socket shapes. Adapt Walk/Run locomotion fields, required Snapshot Action state, and
deterministic tick counts for the lower Walk speed without weakening wall/water boundaries.
Keep all existing multi-Subject, water, control binding, reset, and hash gates. Regenerate the
existing canonical build/snapshot/explain/screenshot artifacts only after verification passes.

- [ ] **Step 5: Run full automated and visual gates**

Run: `pnpm verify:rigged-subject`

Run: `pnpm verify:canonical`

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: all PASS. Manually inspect the four screenshots: the same whitebox humanoid remains
grounded, faces `-Z`, does not intersect the wall, and visibly changes pose across the four
Action states.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/verify-rigged-subject-world.ts scripts/verify-canonical-world.ts scripts/worldkit.ts scripts/lib/worldkit-server.ts scripts/lib/worldkit-server.test.ts scripts/lib/artifact-directory-promotion.ts scripts/lib/artifact-directory-promotion.test.ts apps/playground/vite.config.mjs examples/authoring/package-subject-world.json artifacts/examples/package-subject-world artifacts/examples/rigged-subject-world
git commit -m "test: verify rigged subject end to end"
```

---

### Task 10: Documentation, Product Handoff, and Final Audit

**Files:**
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/05-mvp-roadmap.md`
- Modify: `docs/07-alpha-implementation.md`
- Modify: `docs/10-current-experiments.md`
- Modify: `docs/16-subject-assets-3c-integration.md`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md`
- Modify: `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md`
- Modify: `docs/superpowers/specs/2026-08-19-agentic-whitebox-to-video-open-source-research.md`
- Modify: `docs/superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md`

**Interfaces:**
- Consumes: verified implementation and exact evidence from Task 9.
- Produces: one current entrypoint for product asset onboarding, an honest S1b partial-completion status, and a completed progress table with commit/evidence links.

- [ ] **Step 1: Update docs from observed behavior**

Document the exact product handoff fields: GLB bytes, coordinate convention, Pivot, Asset Hash,
License/Provenance, Bone mapping, four Clip mappings, Collider reference, and optional Bone
Sockets. Include the minimum onboarding and verification flow; the final command is the actual
one-command Gate:

```bash
pnpm worldkit validate examples/authoring/rigged-subject-world.json --json
pnpm worldkit capture examples/authoring/rigged-subject-world.json \
  --output artifacts/examples/rigged-subject-world/world.png \
  --snapshot artifacts/examples/rigged-subject-world/snapshot.json \
  --json
pnpm verify:rigged-subject
```

- [ ] **Step 2: Mark scope precisely**

Use the exact current-status wording: `Golden Humanoid S1b 首个可视纵向切片已完成并进入回归；S1b 整体与 Semantic Actions 整体仍未完成.` Mark the visible slice complete while leaving S1b Compound Collider/LOD/more topology and
the tracked P1.3 Common Humanoid Posture/Action follow-up below open. Do not label all of S1b
or Semantic Actions production-complete. Mark only the project-owned Golden GLB/Rig/Animation/
Collider binding and `idle/walk/run/jump` ground-action slice complete. Product asset acceptance,
more topologies, independent animation assets, posture, equipment, mount, swimming, and flight
remain open. Update the overview/quickstart/current S1b design status from observed behavior,
replace stale Hash/screenshot facts in `docs/10-current-experiments.md`, update current-status
claims in the MVP roadmap and open-source research, and label `docs/07-alpha-implementation.md`
explicitly as the Legacy Three/Rapier/local-Mixamo path rather than Canonical Babylon S1b.

- [ ] **Step 3: Run naming and boundary audits**

Review RED proof: controlled probes placed an obsolete public field and Registry URI in
`packages/runtime-babylon/src`, a provider name in `packages/protocol/src`, a second provider value
beside an allowed `runtimeBackend`, provider-specific root/nested/array-object keys in generated
JSON, and a Playwright auto-install lifecycle in a workspace `package.json`. The previous commands
returned success because those paths were outside their search roots, shared a minified artifact
line with an allowed value, or placed the provider term in an object key instead of a string value.
The probes are not committed; the commands below must fail for each equivalent probe before they
are accepted.

Define the complete non-historical production/public search roots once, then run the obsolete-
field audit. Tests/specs are excluded because their negative fixtures intentionally spell removed
fields; no production package, app, CLI/lifecycle helper, Authoring example, generated public
artifact, or deployed blueprint source is excluded:

```bash
audit_roots=(
  package.json
  packages
  apps
  scripts
  examples/authoring
  artifacts/examples
  sites/world-sdk-blueprint
)

obsolete_matches=$(rg -n --glob '!*.test.*' --glob '!*.spec.*' \
  '\b(assetUrl|kitRef|groundSpeedMetersPerSecond|sourceTarget)\b|(^|[,{;])[[:space:]]*assetPath[[:space:]]*[?:]|"assetPath"[[:space:]]*:' \
  "${audit_roots[@]}")
obsolete_status=$?
if test "$obsolete_status" -gt 1; then
  exit "$obsolete_status"
fi
if test -n "$obsolete_matches"; then
  printf '%s\n' "$obsolete_matches"
  exit 1
fi
```

Expected: zero matches. A local variable such as `assetPath` is not a public field, so that name
is matched only in serialized or property-shaped forms. An `rg` I/O/configuration error is not
converted into a pass.

Run the Registry-URI audit over the same complete roots. The only production allowance is the
exact optional Provenance field declaration in the Registry manifest type; an occurrence in any
other file or line shape fails:

```bash
uri_matches=$(rg -n --glob '!*.test.*' --glob '!*.spec.*' \
  '\b(sourceUri|licenseUri)\b' "${audit_roots[@]}")
uri_status=$?
if test "$uri_status" -gt 1; then
  exit "$uri_status"
fi
uri_allowlist='^packages/subject-registry/src/types-v2\.ts:[0-9]+:[[:space:]]+(sourceUri|licenseUri)\?: string;$'
uri_unexpected=$(printf '%s\n' "$uri_matches" | rg -v "$uri_allowlist")
uri_filter_status=$?
if test "$uri_filter_status" -gt 1; then
  exit "$uri_filter_status"
fi
if test -n "$uri_unexpected"; then
  printf '%s\n' "$uri_unexpected"
  exit 1
fi
```

Run the case-insensitive provider-boundary audit over every production/public text entry. The
allowlist is path-and-line-shape specific: the Babylon adapter implementation, its exact Host
wiring/dependencies, the frozen `runtimeBackend`/physics discriminator, and two human-facing
descriptions or conformance assertions. A provider term in any other public package or protocol
file fails. Generated JSON is checked structurally afterward, so a second provider-valued field
cannot hide on the same minified line as an allowed discriminator:

```bash
provider_roots=(
  package.json
  packages
  apps
  scripts
  examples/authoring
  sites/world-sdk-blueprint
)
provider_matches=$(rg -ni --glob '!*.test.*' --glob '!*.spec.*' \
  '@babylonjs|animationgroup|assetcontainer|\bbabylon(?:\.js)?\b|\bhavok\b' \
  "${provider_roots[@]}")
provider_status=$?
if test "$provider_status" -gt 1; then
  exit "$provider_status"
fi
provider_allowlist='^packages/runtime-babylon/src/[^:]+:[0-9]+:|^packages/runtime-babylon/package\.json:[0-9]+:[[:space:]]+("name": "@whitebox-world/runtime-babylon"|"@babylonjs/(core|havok|loaders)": "[^"]+"),?$|^apps/playground/src/babylon-world-adapter\.ts:[0-9]+:|^apps/playground/package\.json:[0-9]+:[[:space:]]+"@whitebox-world/runtime-babylon": "workspace:\*",$|^apps/playground/src/(main|worldkit-asset-resolver|worldkit-browser-api)\.ts:[0-9]+:.*(babylon-world-adapter\.js|@whitebox-world/runtime-babylon|Protocol · Subject Definition · Babylon · Havok)|^package\.json:[0-9]+:[[:space:]]+"description": "An AI-first semantic whitebox game SDK with a Canonical JSON compiler and Babylon\.js plus Havok runtime\.",$|^packages/compiler/src/compile\.ts:[0-9]+:[[:space:]]+runtimeBackend: "babylon-havok",$|^packages/runtime-contracts/src/(execution-plan|runtime-session)\.ts:[0-9]+:.*(runtimeBackend: "babylon-havok"|backend: "havok")|^scripts/verify-(canonical|rigged-subject)-world\.ts:[0-9]+:[[:space:]]+(assert\.equal\([^;]*(runtimeBackend|physics\.backend), "(babylon-havok|havok)"\);|backend: "havok",|"Terrain, three static objects, and three Subjects must own Havok bodies\.",|"babylon-havok-runtime",)$'
provider_unexpected=$(printf '%s\n' "$provider_matches" | rg -v "$provider_allowlist")
provider_filter_status=$?
if test "$provider_filter_status" -gt 1; then
  exit "$provider_filter_status"
fi
if test -n "$provider_unexpected"; then
  printf '%s\n' "$provider_unexpected"
  exit 1
fi

node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const jsonFiles = [];
const collect = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && path.endsWith(".json")) jsonFiles.push(path);
  }
};
collect("artifacts/examples");

const violations = [];
const providerPattern = /babylon|havok/i;
const isAllowedProviderValue = (path, value) => {
  const serializedPath = path.join(".");
  return (
    ((serializedPath === "runtimeBackend" ||
      serializedPath === "executionPlan.runtimeBackend") &&
      value === "babylon-havok") ||
    (serializedPath === "physics.backend" && value === "havok")
  );
};
const visit = (value, path, file) => {
  if (typeof value === "string" && providerPattern.test(value)) {
    if (!isAllowedProviderValue(path, value)) {
      violations.push(`${file}:${path.join(".")}=${JSON.stringify(value)}`);
    }
  }
  if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...path, index], file));
  else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = [...path, key];
      if (providerPattern.test(key)) {
        violations.push(`${file}:${entryPath.join(".")}=<provider-specific-key>`);
      }
      visit(entry, entryPath, file);
    }
  }
};
for (const file of jsonFiles) visit(JSON.parse(readFileSync(file, "utf8")), [], file);
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
NODE
```

Run the Playwright lifecycle audit separately. It covers the root lifecycle, every workspace
package script, deployed-site package script, CLI/lifecycle helpers, and Vite lifecycle helpers.
Only the exact human diagnostic is allowed; an executable install, install-deps, or download
command anywhere in those roots fails:

```bash
playwright_matches=$(rg -ni \
  'playwright[^\n]*(install(-deps)?|download)|(install(-deps)?|download)[^\n]*playwright' \
  package.json apps/*/package.json packages/*/package.json sites/*/package.json \
  scripts apps/*/vite.config.* sites/*/vite.config.*)
playwright_status=$?
if test "$playwright_status" -gt 1; then
  exit "$playwright_status"
fi
playwright_allowlist='^scripts/worldkit\.ts:[0-9]+:[[:space:]]+"Playwright Chromium is unavailable\. Run '\''pnpm exec playwright install chromium'\''\.",$'
playwright_unexpected=$(printf '%s\n' "$playwright_matches" | rg -v "$playwright_allowlist")
playwright_filter_status=$?
if test "$playwright_filter_status" -gt 1; then
  exit "$playwright_filter_status"
fi
if test -n "$playwright_unexpected"; then
  printf '%s\n' "$playwright_unexpected"
  exit 1
fi
```

Expected: all four audits pass with zero non-allowlisted matches. Registry Manifest Provenance URI
fields remain legal only in the exact Registry type declaration; structure tests still prove they
do not serialize into Canonical World, Normalized IR, or ExecutionPlan. Provider types stay behind
the exact adapter/Host boundary, while serialized artifacts may contain only the frozen backend
discriminators. The verifier never invokes Playwright installation itself.

Run:

```bash
if rg -n "Xbot|local-humanoid" \
  packages/runtime-babylon examples/authoring scripts/verify-rigged-subject-world.ts; then
  exit 1
else
  test $? -eq 1
fi
```

Expected: no dependency on local ignored Xbot.

- [ ] **Step 4: Run final repository gates**

Run: `pnpm test`

Run: `pnpm test:scenes`

Run: `pnpm typecheck`

Run: `pnpm build`

Run: `pnpm verify:canonical`

Run: `pnpm verify:rigged-subject`

Expected: all PASS; only the already documented Vite large-chunk warning may remain.

- [ ] **Step 5: Record exact progress evidence and commit**

Fill this plan's Progress table with commit hashes, test counts, asset Hash, build hashes,
Screenshot dimensions, independent-instance movement evidence, and final gate output.
Record exact hashes for Tasks 1–9. Use `this docs commit` for Task 10 rather than attempting to
embed a self-changing commit SHA.

```bash
git add README.md docs/00-project-overview.md docs/05-mvp-roadmap.md docs/07-alpha-implementation.md docs/10-current-experiments.md docs/16-subject-assets-3c-integration.md docs/17-canonical-json-quickstart.md docs/18-refactor-progress-and-backlog.md docs/superpowers/specs/2026-08-19-agentic-whitebox-to-video-open-source-research.md docs/superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md docs/superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md
git commit -m "docs: complete rigged subject visible slice"
```

Before staging, inspect every listed diff/hunk. Existing controller/user documentation changes
are intentional inputs to reconcile, not files to reset or overwrite; never use broad
`git add README.md docs` in this dirty worktree.

---

## Tracked Follow-up: Common Humanoid Posture and Action Pack

This follow-up is intentionally outside Tasks 1–10: the four-action rigged Subject slice must
first prove the Asset/Rig/Animation/Collider pipeline. It is nevertheless designed now so the
current contracts do not treat `idle/walk/run/jump` as the permanent limit.

### Follow-up A: Canonical Posture and Action Resources

- [ ] Define `HumanoidPostureModeV1 = "standing" | "crouched" | "prone"` and require actual
  `postureMode` beside `activeActionId` in Subject runtime state.
- [ ] Extend the common Action vocabulary with `fall`, `land`, `crouch-enter`, `crouch-idle`,
  `crouch-walk`, `crouch-exit`, `prone-enter`, `prone-idle`, `crawl`, and `prone-exit`.
- [ ] Extend the Golden GLB and Animation Set with deterministic in-place clips for the common
  Action vocabulary; update exact artifact byte length, SHA-256, inventory, bindings, and
  conformance fixtures together.
- [ ] Add versioned standing/crouched/prone Capsule descriptors to the Collider Profile and add
  `crouchSpeedMetersPerSecond` plus `crawlSpeedMetersPerSecond` to Ground Locomotion Profile.
- [ ] Keep source Clip names, Capsule dimensions, and fallback mappings in Registry resources;
  ordinary World JSON continues to reference only `subjectDefinitionRef`.

### Follow-up B: Deterministic Posture, Physics, and Animation Runtime

- [ ] Implement a pure fixed-tick reducer with this priority: active posture transition → air
  `jump/fall` → landing `land` → crouched `crouch-idle/crouch-walk` → prone
  `prone-idle/crawl` → standing `idle/walk/run`.
- [ ] Permit `run` and `jump` only while the actual posture is `standing`; use actual accepted
  posture, not requested posture, as the animation and locomotion truth.
- [ ] Switch Babylon `PhysicsCharacterController` shape through
  `setShapeOptions(..., true)` so the support point remains fixed.
- [ ] Before increasing Capsule height, query the target Capsule with Havok Shape Proximity at
  `maxDistance: 0`; reject blocked expansion with `SUBJECT_POSTURE_BLOCKED` and retain the
  previous posture, collider, transform, and action state atomically.
- [ ] Make posture transitions, landing duration, Reset, interruption, and missing-Clip fallback
  deterministic in ticks. Root motion remains in-place and cannot move the controller.

### Follow-up C: Host Input and Conformance

- [ ] Add one canonical posture request field/token shared by CLI, Browser Protocol, keyboard
  mapping, replay input, and generated types; do not introduce separate `isCrouching` and
  `isProne` booleans.
- [ ] Add a low-ceiling Havok fixture proving crouch/prone traversal and blocked standing, then
  prove standing succeeds after leaving the obstruction.
- [ ] Verify two Subjects keep independent posture, Collider, Skeleton, Action, Transform, and
  Reset/Dispose state while sharing immutable Asset cache data.
- [ ] Capture deterministic standing, crouched, prone, blocked-rise, fall, and land screenshots
  and snapshots; the Snapshot `postureMode` and `activeActionId` must match the physical shape.
- [ ] Keep swimming, weapon, equipment, mount, and flight variants in their existing separate
  Capability/Context milestones rather than expanding this ground-humanoid pack.

---

## Progress

| Task | Status | Commit | Evidence |
|---:|---|---|---|
| 1. Deterministic Golden Humanoid GLB | Complete | `a55089f68c73d63f9ef1dd1ac45d81c4850663ff` | 43,656-byte deterministic GLB; Asset SHA-256 `1095fd65…8c2c2`; independent review clean |
| 2. Raw Byte Hashing and Asset Registry Resources | Complete | `312fb649266a3ecd78258c5f4979263916f574da` | Cross-runtime byte hash plus four exact immutable Registry resources; independent review clean |
| 3. Strict Asset Subject Authoring and Normalization | Complete | source: `3e733cd540b06065e177dd161eb1b1f70ecbb7a8`, `12f8651d66c87d05e3c96719d70250311d5b9f91`, `0458724d79bc363fc4842aaaf5f045bc161315a3`; sideband docs only: `eefd9837e43a81b616976a6f3d3291344138b7ae` | Final review clean; 224-test implementation suite plus 93 focused reviewer tests/typecheck; sideband posture plan kept separately attributed |
| 4. Runtime Contracts and Compiler Resource Tables | Complete | `5d58eb3c0c4b421e2d86548bc7802f4c43dfa285`, `c8ee254d3c26d237fd12cf71c2cf4966fd3f7dda`, `1ef43d2a527229b60871a9d0c8951d8bd138d079`, `7fab420c9c5865c0535e5f5791c9188af96bc484` | Minimal ref-only descriptors, no Registry URI/provider leakage; 241-test suite/typecheck/diff check; final review clean |
| 5. Engine-neutral Fixed-tick Subject Actions | Complete | `6527b9faf08d3b2b0df22555a20bbca4794cc933` | 25 focused + 263 full tests, typecheck/build/dependency audit; independent review clean |
| 6. Babylon Asset Resolver, Hash Gate, and Cache | Complete | `081902ea124e7f341c20f6eae232e34590cbb474`, `99abd05beb8ff99bb322de80d159c4352bf21586`, `2623a37bc3a32fa987942b66d6ace501349fcf1a` | 38 focused + 289 full tests, typecheck/build; hash/inventory/lifecycle/retry gates; final review clean |
| 7. Rigged Visuals, Fixed-tick Animation, and Havok Integration | Complete | `130757286fa7807e6ec965c8253a3e7fccbe3edb`, `cf4bebbad2ec0851e190094046a629148d1125ff`, `bd5fea4467748288ca738fc19f0246d5a180bf04` | 72 focused + 312 full tests, typecheck/build; clone/action/socket/disposal isolation; final review clean |
| 8. Playground Resolver, Canonical Example, CLI Explain, and HUD | Complete | `e940bb383b5c35fedfa49b330f3bf8b6e4342d61`, `ddddd32908c8bfbd390fe7feb69af3329e858ce9` | 325 full tests, typecheck/build, native Fetch + real Browser GLB readiness; final review clean |
| 9. Rigged Subject End-to-End Conformance | Complete | `8cfc238fee0f7f1c4fcd6117e80b6c33c6419215`, lifecycle/evidence fix `339feac92715ce9f776675afdbb18245994f9f3d`, visible-pose fix `c16c2c727efb135ad0c938dea6667b710c2ad3a1` | 36 files / 340 tests, typecheck/build, both verifiers, deterministic paused Tick 0 world capture, lifecycle/directory-promotion/tamper/visible-pose gates pass; final full-branch independent review clean; no temp/backup/Vite residue |
| 10. Documentation, Product Handoff, and Final Audit | Complete | initial docs `dbdc729ca77c7f43bf9a66f2788c1dc1fe153bad`; audit fixes `fe675401068fca2dfeb03032869afafe7ec10fd9`, `0f3321a1364571313b0cc9d2af8155b8e3c01b7a`; `this evidence sync commit` | 36/340 tests, 2/18 scene tests, typecheck, build, both verifiers, hardened boundary audits and documentation contract audit pass; only documented Vite large-chunk warning |

Task 9 的精确机器证据来自提交后的
`artifacts/examples/rigged-subject-world/verification.json`：Authoring Spec
`sha256:abd4865be5fe4c483757174c3ed70d63bb7c9266e3f518b124889e53f15ceb37`，
Golden GLB
`sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2`，
Normalized IR
`sha256:e746bd738e13ec8603779afba4d62d2d4610d0b03d428a6a1f8cc4f468ce1984`，
ExecutionPlan
`sha256:22e38f9dc474b33a2adbe8442dba411e70f62731ac1e9a54fe1ac90f9f73249f`。
`verification.json` 使用 `schemaVersion: 2`。五张 PNG 均为 936×596：CLI
`world.png` 为暂停 Reset 后的 Tick 0，Hash
`sha256:b9ff828333641e548ea7ef3d2f8dbc6c8ae96c120659db3a6f6c17df19a09d9b`；
Browser `idle/walk/run/jump` 分别为
`sha256:af60b01ae2bf9db87c5ea5a5e01a08539e1ca35186e7b88b60125cc049a641aa`、
`sha256:63e1f332c7dcbb446f093d0d32db0e151288ab94a92aeb2d666b52bd8fd1f513`、
`sha256:d8957ad8b2bc115a9a493dd5404ef38e10cd2373a40b2743b2af83851400e3c7`、
`sha256:992383d2cc70d49b827af24815dff7a41bbed8e5da7e0f8bf527294b00f61552`。
Walk 使用 1s/30 FPS Clip、1× Playback、0.2s Blend 与 60Hz Runtime，在 Action Start
Tick 1 后的首个 Post-blend Quarter-cycle Tick 16 捕获，位置 z 为
29.398333333333344。四张动作图在 `[374,166,188,287]` Crop 内做 Foreground-origin
Subject Silhouette 比较；Idle/Walk、Idle/Run、Idle/Jump、Walk/Run、Walk/Jump、Run/Jump
差异率依次为 0.500432、0.531802、0.398077、0.657316、0.298178、0.602627，全部高于
0.15 门禁。
隔离 Gate 记录未受控 `rigged-primary` 位置与 `idle` 不变，受控
`rigged-secondary` 从 x=3 移至 x=5.361666666666668 并进入 `walk`；墙体 Gate
停在 x=5.561666666666668（上限 6.2m），Tamper Gate 只命中一次资源请求并返回
`SUBJECT_ASSET_HASH_MISMATCH`，磁盘资产 Hash 前后相同。

Task 10 在 Task 9 最终全分支独立复审 CLEAN 与 Visible-pose P2 收口后记录最新门禁：
`pnpm test` 为 36/36 files、340/340 tests，`pnpm test:scenes` 为 2/2 files、18/18 tests，
`pnpm typecheck`、`pnpm build`、`pnpm verify:canonical` 和
`pnpm verify:rigged-subject` 均通过。Obsolete public field、provider boundary、Registry URI
leak、Playwright auto-install 与 Xbot/local-humanoid 五项机器审计均为零违规；构建仅保留
已记录的 Vite large-chunk warning。最终 verifier 后未发现本任务临时目录、备份目录或
该 Worktree 的 Vite 进程。
