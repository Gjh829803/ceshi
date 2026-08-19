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
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
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

export type SubjectVisualPartV3 = SubjectVisualPrimitivePartV3 | SubjectVisualAssetPartV3;

export type SemanticInputActionV1 =
  | "move-forward" | "move-backward" | "move-left" | "move-right"
  | "jump" | "run";
```

- `ExecutionPlanV3` adds stable, deduplicated `subjectAssets`, `rigProfiles`,
  `animationSets`, and `colliderProfiles` arrays. No URI or Babylon type appears.

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
plus resource-budget accounting that counts asset vertices/triangles once per instance.

- [ ] **Step 2: Run focused tests and verify missing contract fields**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.test.ts`

Expected: FAIL because asset descriptors, the `run` semantic input, and split Walk/Run speed
fields do not exist. Snapshot Action state remains deferred to Task 7, where Runtime can
populate it atomically with the Action resolver and animation player.

- [ ] **Step 3: Implement engine-neutral execution descriptors**

Mirror only normalized data required by Runtime. Preserve exact refs and artifact hashes.
Do not copy Provenance URLs into ExecutionPlan. Keep Primitive and Asset visual branches
closed and role-qualified.

- [ ] **Step 4: Compile stable resource tables and costs**

Collect only resources reachable from materialized Subjects, deduplicate by exact Ref, sort by
Ref, and throw invariant errors only when Normalized IR is internally inconsistent. Count each
Subject instance's declared vertices/triangles and one Character Collider against world budget.

- [ ] **Step 5: Split ground locomotion speed cleanly**

Replace `groundSpeedMetersPerSecond` everywhere in Registry → Normalized IR → ExecutionPlan
with `walkSpeedMetersPerSecond` and `runSpeedMetersPerSecond`. Use built-in defaults `2.4` and
`4.0`; keep `waterSpeedMetersPerSecond: 2.2` and `jumpSpeedMetersPerSecond: 5.5`. Update
`SubjectController` in the same commit so `run` selects Run speed, ordinary movement selects
Walk speed, and intermediate commits continue to typecheck. Snapshot Action state is added in
Task 7 together with the Action resolver and animation player.

- [ ] **Step 6: Run focused tests, canonical regression, and typecheck**

Run: `pnpm vitest run packages/runtime-contracts/src packages/compiler/src`

Run: `pnpm typecheck`

Expected: PASS; expected fixture hashes are updated only for the intentional speed-field change.

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

Run: `pnpm vitest run packages/subject-actions/src/subject-actions.test.ts`

Run: `rg -n "babylon|havok|three|window|document" packages/subject-actions`

Expected: test PASS; dependency audit returns no implementation matches.

- [ ] **Step 5: Commit**

```bash
git add packages/subject-actions
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
export interface SubjectAssetResolverV1 {
  resolveSubjectAsset(request: SubjectAssetResolveRequestV1):
    Promise<{ bytes: Uint8Array; sourceLabel: string }>;
}

export interface SubjectAssetLeaseV1 {
  instantiate(subjectEntityId: string): InstantiatedEntries;
  release(): void;
}

export class SubjectAssetCacheV1 {
  acquire(asset: ExecutionSubjectAssetV1): Promise<SubjectAssetLeaseV1>;
  dispose(): Promise<void>;
}
```

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

Add missing resolver, resolver throw, byte-length mismatch, unsupported format, release twice,
dispose twice, and acquire-after-dispose tests.

- [ ] **Step 2: Add Babylon GLB loader dependency and verify failing tests**

Run: `pnpm add --filter @whitebox-world/runtime-babylon @babylonjs/loaders@^9.21.2 @whitebox-world/protocol@workspace:* @whitebox-world/subject-actions@workspace:*`

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because the cache implementation is missing.

- [ ] **Step 3: Implement pre-parse integrity gates**

Compare `bytes.byteLength` and `sha256Bytes(bytes)` to the Execution descriptor before calling
Babylon. Wrap resolver errors with `SUBJECT_ASSET_RESOLVE_FAILED` and include only Ref,
expected Hash, and `sourceLabel`; never include credentials or raw bytes.

- [ ] **Step 4: Implement AssetContainer parsing and reference ownership**

Import the glTF loader registration once, then use:

```ts
const container = await LoadAssetContainerAsync(bytes, scene, {
  pluginExtension: ".glb",
});
```

Key entries by `${subjectAssetRef}\n${artifactContentHash}`. Keep a ref count for leases;
`release()` is idempotent. Cache disposal rejects new acquires, waits for pending loads, disposes
containers in reverse stable-ref order, and is idempotent.

- [ ] **Step 5: Load the real Golden GLB in NullEngine**

Assert one cache entry can instantiate two `InstantiatedEntries`, both have one Skeleton and
four AnimationGroups, and their Skeleton/AnimationGroup object identities differ.

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
```

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
`hand.right`, missing required Bone, missing Clip, Reset, and double Dispose tests.

- [ ] **Step 2: Run focused tests and verify async visual/action failures**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because visuals are synchronous Primitive-only and Snapshot has no Action state.

- [ ] **Step 3: Implement `SubjectAnimationPlayer`**

Map `sourceClipName` to the instance's exact AnimationGroup. Start groups, immediately pause
them, and sample frames from fixed ticks. On transition, keep previous and next groups active,
set deterministic weights from elapsed ticks and `blendDurationSeconds`, then stop the previous
group when weight reaches zero. `reset()` stops all groups and samples `idle` at frame zero.

- [ ] **Step 4: Implement Asset Visual instantiation and Rig validation**

Acquire a lease, call `instantiate(..., { doNotInstantiate: true })`, create one visual root,
parent every imported root under the Asset Part root, apply local Transform and scale, replace
renderable materials with the neutral Subject material, reject imported Camera/Light behavior,
resolve semantic Bones, and build local/Bone Socket nodes. On any failure, dispose the partial
instance and release the lease before rethrowing the stable code.

- [ ] **Step 5: Split Walk/Run physics and return motion samples**

`SubjectController.step()` selects Walk or Run speed from the `run` modifier and returns the
post-command horizontal motion request. Havok remains authoritative; visual animation never
writes the controller position.

- [ ] **Step 6: Make runtime creation await every Subject visual atomically**

Preload required assets, create Subjects in stable Entity ID order, and if any creation fails,
dispose all previously created Subjects, cache entries, physics resources, Scene, and Engine.
After each physics tick, compute movement medium and actual horizontal velocity, resolve the
Action, and call `stepAnimation(this.tick, actionId)`. Snapshot reads `activeActionId` from the
visual.

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
- Create: `apps/playground/src/worldkit-asset-resolver.ts`
- Create: `examples/authoring/rigged-subject-world.json`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `scripts/lib/subject-explain.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`

**Interfaces:**
- Consumes: Task 7 Runtime.
- Produces:

```ts
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

Assert the Canonical example contains no GLB URI/Bone/Clip/Collider fields; `subject explain`
returns Asset/Rig/Animation/Collider refs and lock entries; Registry describe can inspect each
new resource kind; and the HUD uses Snapshot `activeActionId` instead of deriving Walk from
velocity.

- [ ] **Step 2: Run focused tests and verify missing resolver/example failures**

Run: `pnpm vitest run scripts/worldkit.test.ts apps/playground/src/authoring-loader.test.ts`

Expected: FAIL because the Host mapping and rigged example do not exist.

- [ ] **Step 3: Implement the fetch resolver**

Reject unmapped refs with `SUBJECT_ASSET_NOT_FOUND`, require `response.ok`, read exactly one
`arrayBuffer`, and return a copied `Uint8Array` plus a credential-free pathname label. Runtime,
not the fetch resolver, performs the authoritative length/Hash checks.

- [ ] **Step 4: Wire Playground input and HUD**

Map `ShiftLeft` and `ShiftRight` to `run`; map legacy Playground `run` action to the same
Canonical token. Pass the fetch resolver into `BabylonWorldRuntime.create`. Display the
controlled Subject's `activeActionId` directly.

- [ ] **Step 5: Add the rigged Canonical world and Explain output**

Reuse the existing terrain/wall/camera shape but spawn two instances of
`worldkit://subject-definition/humanoid.rigged-golden@1`. Extend lock selection so Explain
includes the Asset, Rig, Animation Set, Collider Profile, Physics Body, Locomotion, Capability,
and Definition entries.

- [ ] **Step 6: Run CLI, Playground, and build gates**

Run: `pnpm vitest run scripts/worldkit.test.ts apps/playground/src`

Run: `pnpm build`

Expected: PASS; Vite emits the GLB at the stable public path.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/src/worldkit-asset-resolver.ts examples/authoring/rigged-subject-world.json apps/playground scripts
git commit -m "feat: expose rigged subjects through CLI and browser"
```

---

### Task 9: Rigged Subject End-to-End Conformance

**Files:**
- Create: `scripts/verify-rigged-subject-world.ts`
- Modify: `package.json`
- Modify: `scripts/verify-canonical-world.ts`

**Interfaces:**
- Consumes: rigged Canonical example and Browser Protocol V3.
- Produces command `pnpm verify:rigged-subject` and evidence under
  `artifacts/examples/rigged-subject-world/`:
  - `world.build.json`
  - `idle.png`, `walk.png`, `run.png`, `jump.png`
  - `snapshot.json`
  - `explain.json`

- [ ] **Step 1: Write the failing end-to-end verifier**

The verifier must:

```ts
assert.equal(await worldkitMain(["validate", INPUT_PATH, "--json"]), 0);
assert.equal(await worldkitMain(["build", INPUT_PATH, "--output", BUILD_PATH, "--json"]), 0);
assert.equal(await worldkitMain(["capture", INPUT_PATH, "--output", IDLE_PATH, "--json"]), 0);
```

Then use one Browser Session and fixed inputs to assert:

```ts
idle.activeActionId === "idle";
walk.activeActionId === "walk";
run.activeActionId === "run";
jump.activeActionId === "jump";
reset.activeActionId === "idle";
```

Bind the controller to the second instance and prove the first instance's Transform and Action
remain unchanged. Move into the wall and prove the Havok stop boundary still holds. Capture
each Action screenshot after deterministic ticks.

- [ ] **Step 2: Run the verifier and confirm the missing-script failure**

Run: `pnpm verify:rigged-subject`

Expected: FAIL because the script is not implemented.

- [ ] **Step 3: Implement artifact, lifecycle, and negative gates**

In addition to positive flow, run a Browser fixture with one tampered byte and assert startup
fails with `SUBJECT_ASSET_HASH_MISMATCH`. Assert repeated `reset()` and `dispose()` do not leak
or throw. Inspect PNG signatures and require at least `800×450` dimensions.

- [ ] **Step 4: Update the existing canonical verifier intentionally**

Adapt only the expected Walk/Run locomotion fields and newly required Snapshot Action field.
Keep all existing multi-Subject, water, wall, control binding, reset, and hash gates.

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
git add package.json scripts/verify-rigged-subject-world.ts scripts/verify-canonical-world.ts artifacts/examples/rigged-subject-world
git commit -m "test: verify rigged subject end to end"
```

---

### Task 10: Documentation, Product Handoff, and Final Audit

**Files:**
- Modify: `README.md`
- Modify: `docs/16-subject-assets-3c-integration.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md`
- Modify: `docs/superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md`

**Interfaces:**
- Consumes: verified implementation and exact evidence from Task 9.
- Produces: one current entrypoint for product asset onboarding, an honest S1b partial-completion status, and a completed progress table with commit/evidence links.

- [ ] **Step 1: Update docs from observed behavior**

Document the exact product handoff fields: GLB bytes, coordinate convention, Pivot, Asset Hash,
License/Provenance, Bone mapping, four Clip mappings, Collider reference, and optional Bone
Sockets. Include the one-command local flow:

```bash
pnpm worldkit validate examples/authoring/rigged-subject-world.json --json
pnpm worldkit capture examples/authoring/rigged-subject-world.json \
  --output artifacts/examples/rigged-subject-world/world.png \
  --snapshot artifacts/examples/rigged-subject-world/snapshot.json \
  --json
pnpm verify:rigged-subject
```

- [ ] **Step 2: Mark scope precisely**

Mark the visible slice complete while leaving S1b Compound Collider/LOD/more topology and
the tracked P1.3 Common Humanoid Posture/Action follow-up below open. Do not label all of S1b
or Semantic Actions production-complete.

- [ ] **Step 3: Run naming and boundary audits**

Run:

```bash
rg -n "assetUrl|assetPath|kitRef|groundSpeedMetersPerSecond|sourceTarget|AnimationGroup|AssetContainer|Babylon|Havok" \
  packages/authoring packages/compiler packages/runtime-contracts examples/authoring
```

Expected: no obsolete/public provider-specific fields; Babylon/Havok appear only in the
existing backend discriminator or explanatory internal comments explicitly allowed by the spec.

Run:

```bash
rg -n "Xbot|local-humanoid" packages/runtime-babylon examples/authoring scripts/verify-rigged-subject-world.ts
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

```bash
git add README.md docs
git commit -m "docs: complete rigged subject visible slice"
```

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
| 1. Deterministic Golden Humanoid GLB | Pending | — | — |
| 2. Raw Byte Hashing and Asset Registry Resources | Pending | — | — |
| 3. Strict Asset Subject Authoring and Normalization | Pending | — | — |
| 4. Runtime Contracts and Compiler Resource Tables | Pending | — | — |
| 5. Engine-neutral Fixed-tick Subject Actions | Pending | — | — |
| 6. Babylon Asset Resolver, Hash Gate, and Cache | Pending | — | — |
| 7. Rigged Visuals, Fixed-tick Animation, and Havok Integration | Pending | — | — |
| 8. Playground Resolver, Canonical Example, CLI Explain, and HUD | Pending | — | — |
| 9. Rigged Subject End-to-End Conformance | Pending | — | — |
| 10. Documentation, Product Handoff, and Final Audit | Pending | — | — |
