# Package Subject Definition Visible Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AuthoringSpecV2 so one Canonical JSON world can define a reusable Package-local primitive Subject Definition, spawn multiple independently controlled instances, and inspect the deterministic Definition/Collider/Resource Lock through CLI and Babylon/Havok runtime artifacts.

**Architecture:** Extract Canonical JSON hashing into a dependency-neutral protocol package, add an engine-neutral subject-composition package, and expand the immutable subject registry into exact-version resource resolution. Authoring V2 fully replaces the unpublished V1 and materializes resolved NormalizedWorldIRV2; Compiler and Babylon consume only versioned resolved contracts, with Subject Origin separated from the internal Havok collider center.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12, Ajv, noble hashes, Vitest, Babylon.js 9, Havok WASM, Vite, Playwright, pnpm workspaces.

**Spec:** [`docs/superpowers/specs/2026-08-19-package-subject-definition-design.md`](../specs/2026-08-19-package-subject-definition-design.md)

## Global Constraints

- Public V2 uses only `subjectDefinitionRef`; `kitRef` and V1 migration do not exist in the completed repository.
- Package Definition references are exactly `package://subject-definition/<id>@<version>`; Registry references are exactly `worldkit://subject-definition/<id>@<version>`.
- Authoring cannot provide computed Definition hashes, resolved Profile values, collider results, or resource costs.
- Subject Origin is `support-center`; Visual Root, Socket transforms, Camera target, and Snapshot positions use that origin.
- Collider derivation is engine-neutral, deterministic, and independent of Babylon mesh bounds.
- Normalizer may resolve Registry resources; Compiler and Runtime may not query Registry or inspect Authoring input.
- Runtime-facing contracts contain no Babylon, Havok, DOM, or in-process object handles.
- S1a supports primitive whitebox ground-character proxies only; no GLB, Compound Collider, Relationship, mount, equipment, vehicle, animation, NPC behavior, or flight claims.
- Every public rename updates Schema, TypeScript, examples, validation, CLI, Browser Protocol, and conformance coverage in the same slice.
- Use strict discriminated unions, closed enums, unit-bearing numeric names, stable ordering, exact-version refs, and structured Diagnostics.

## Progress

| Task | Status | Commit | Evidence |
|---:|---|---|---|
| 1. Shared Canonical Protocol | Complete | `d3bf828` | 3 focused test files / 19 tests + typecheck |
| 2. Subject Composition | Complete | `567f159` | 7 focused tests + dependency audit + typecheck |
| 3. Subject Resource Registry | Complete | `182cca2` | 6 focused tests + typecheck |
| 4. Clean AuthoringSpecV2 | Complete | `d5e976c` | 10 focused / 20 Authoring tests + schema exports + typecheck |
| 5. Definition Normalize/Hash/Lock | Not started | — | — |
| 6. Runtime Contracts V3 | Not started | — | — |
| 7. Compiler V3 | Not started | — | — |
| 8. Babylon + Browser V3 | Not started | — | — |
| 9. CLI Discovery/Explain | Not started | — | — |
| 10. V2 Browser E2E | Not started | — | — |
| 11. Docs and Audit | Not started | — | — |

---

## File and Package Map

### New packages

- `packages/protocol/`: Canonical JSON bytes and SHA-256 helpers shared by Registry, Authoring, and Compiler.
- `packages/subject-composition/`: primitive bounds, support-origin validation, vertical capsule derivation, and primitive resource-cost calculation; no engine dependencies.

### Existing package responsibility changes

- `packages/subject-registry/`: canonical built-in Subject Definitions plus Capability/Profile/Derivation manifests and exact immutable resolution.
- `packages/authoring/`: the only Authoring V2 schema, strict parser, Package Definition validation, Definition resolution, Definition Hash, Resource Lock, and NormalizedWorldIRV2.
- `packages/runtime-contracts/`: ExecutionPlanV3, RuntimeSnapshotV3, Browser Protocol V3 data types.
- `packages/compiler/`: stable materialization from NormalizedWorldIRV2 into ExecutionPlanV3.
- `packages/runtime-babylon/`: map Subject Origin to Havok Character Controller center and back.
- `apps/playground/`: load V2 worlds and expose Browser Protocol V3.
- `scripts/worldkit.ts`: versioned Build Artifact V3 plus Registry, Definition Validate, and Subject Explain CLI commands.

---

### Task 1: Shared Canonical Protocol Package

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/canonical-json.ts`
- Create: `packages/protocol/src/canonical-json.test.ts`
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/canonical-json.ts`

**Interfaces:**
- Consumes: existing JCS-like canonicalization behavior and `@noble/hashes` dependency from `packages/authoring/src/canonical-json.ts`.
- Produces: `stringifyCanonicalJson(value: unknown): string`, `canonicalJsonBytes(value: unknown): Uint8Array`, and `sha256CanonicalJson(value: unknown): string` from `@whitebox-world/protocol`.
- Invariant: existing normalized and execution hashes remain byte-for-byte unchanged before any intentional protocol data change.

- [x] **Step 1: Write failing protocol tests**

```ts
import { describe, expect, it } from "vitest";
import { canonicalJsonBytes, sha256CanonicalJson, stringifyCanonicalJson } from "./index";

describe("canonical JSON protocol", () => {
  it("sorts object keys while preserving array order", () => {
    expect(stringifyCanonicalJson({ z: 1, a: [3, 2, 1] })).toBe('{"a":[3,2,1],"z":1}');
  });

  it("returns stable UTF-8 bytes and a domain-formatted SHA-256", () => {
    expect(new TextDecoder().decode(canonicalJsonBytes({ value: "世界" })))
      .toBe('{"value":"世界"}');
    expect(sha256CanonicalJson({ a: 1 })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects non-finite numbers", () => {
    expect(() => stringifyCanonicalJson({ bad: Number.NaN })).toThrow(/finite/i);
  });
});
```

- [x] **Step 2: Run the focused test and verify the missing package failure**

Run: `pnpm vitest run packages/protocol/src/canonical-json.test.ts`

Expected: FAIL because `packages/protocol/src/index.ts` does not exist.

- [x] **Step 3: Move the canonical implementation without changing behavior**

Create `@whitebox-world/protocol` with `@noble/hashes` as its only dependency. Move the implementation from Authoring, export all three functions, and replace `packages/authoring/src/canonical-json.ts` with explicit re-exports:

```ts
export {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
```

- [x] **Step 4: Run focused and regression tests**

Run: `pnpm vitest run packages/protocol/src/canonical-json.test.ts packages/authoring/src/normalize.test.ts packages/compiler/src/compile.test.ts`

Expected: PASS; existing fixture hashes remain unchanged.

- [x] **Step 5: Commit**

```bash
git add packages/protocol packages/authoring/package.json packages/authoring/src/canonical-json.ts
git commit -m "refactor: share canonical protocol hashing"
```

---

### Task 2: Engine-neutral Subject Composition

**Files:**
- Create: `packages/subject-composition/package.json`
- Create: `packages/subject-composition/src/index.ts`
- Create: `packages/subject-composition/src/types.ts`
- Create: `packages/subject-composition/src/primitive-bounds.ts`
- Create: `packages/subject-composition/src/vertical-character-capsule.ts`
- Create: `packages/subject-composition/src/resource-cost.ts`
- Create: `packages/subject-composition/src/subject-composition.test.ts`

**Interfaces:**
- Consumes: finite primitive shapes and local transforms in right-handed Y-up space.
- Produces:

```ts
export type CompositionPrimitiveV1 =
  | { kind: "box"; sizeMetersXYZ: readonly [number, number, number] }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
  | { kind: "capsule"; radiusMeters: number; heightMeters: number };

export interface ColliderSourcePartV1 {
  id: string;
  shape: CompositionPrimitiveV1;
  localPositionMetersXYZ: readonly [number, number, number];
  localRotationEulerRadiansXYZ: readonly [number, number, number];
}

export type DeriveVerticalCharacterCapsuleResultV1 =
  | { ok: true; collider: DerivedVerticalCharacterCapsuleV1; bounds: CompositionBoundsV1 }
  | { ok: false; issues: readonly SubjectCompositionIssueV1[] };

export function deriveVerticalCharacterCapsule(
  parts: readonly ColliderSourcePartV1[],
): DeriveVerticalCharacterCapsuleResultV1;

export function calculatePrimitiveResourceCost(
  parts: readonly { shape: CompositionPrimitiveV1 }[],
): { vertices: number; triangles: number; colliders: 1 };
```

- [x] **Step 1: Write failing bounds, origin, collider, and cost tests**

```ts
it("derives a grounded capsule without Babylon bounds", () => {
  const result = deriveVerticalCharacterCapsule([
    {
      id: "body",
      shape: { kind: "box", sizeMetersXYZ: [0.8, 1.2, 0.6] },
      localPositionMetersXYZ: [0, 0.6, 0],
      localRotationEulerRadiansXYZ: [0, 0, 0],
    },
  ]);
  expect(result).toEqual({
    ok: true,
    bounds: {
      minimumMetersXYZ: [-0.4, 0, -0.3],
      maximumMetersXYZ: [0.4, 1.2, 0.3],
    },
    collider: {
      kind: "capsule",
      radiusMeters: 0.4,
      heightMeters: 1.2,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.6, 0],
    },
  });
});

it("rejects a composition whose included bounds do not meet support-center", () => {
  const result = deriveVerticalCharacterCapsule([
    {
      id: "floating-body",
      shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      localPositionMetersXYZ: [0, 2, 0],
      localRotationEulerRadiansXYZ: [0, 0, 0],
    },
  ]);
  expect(result).toMatchObject({
    ok: false,
    issues: [{ code: "SUBJECT_SUPPORT_ORIGIN_INVALID", partIds: ["floating-body"] }],
  });
});

it("uses a deterministic resource-cost table", () => {
  expect(calculatePrimitiveResourceCost([
    { shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] } },
    { shape: { kind: "sphere", radiusMeters: 0.5 } },
  ])).toEqual({ vertices: 313, triangles: 524, colliders: 1 });
});
```

Also add a rotated-cylinder case and assert its conservative bounds exactly to six decimal places.

- [x] **Step 2: Run the focused test and verify failure**

Run: `pnpm vitest run packages/subject-composition/src/subject-composition.test.ts`

Expected: FAIL because the package and exports do not exist.

- [x] **Step 3: Implement primitive validation and right-handed XYZ bounds**

Implement finite-number checks, positive dimensions, Capsule `heightMeters >= 2 * radiusMeters`, and an explicit X-then-Y-then-Z rotation matrix. Transform the eight corners of each primitive's conservative local AABB; do not import Babylon or Three.js.

- [x] **Step 4: Implement capsule derivation and cost calculation**

Use the spec's `0.01m` support-origin tolerance. Compute radius from the largest X/Z diameter, height from `max(boundsMaximumYMeters, 2 * radiusMeters)`, and Y center from `heightMeters / 2`. Return issues rather than throwing for expected invalid composition.

- [x] **Step 5: Run focused tests and dependency audit**

Run: `pnpm vitest run packages/subject-composition/src/subject-composition.test.ts`

Run: `rg -n "babylon|havok|three|window|document" packages/subject-composition`

Expected: tests PASS; dependency audit returns no matches outside explanatory test descriptions.

- [x] **Step 6: Commit**

```bash
git add packages/subject-composition
git commit -m "feat: derive subject composition deterministically"
```

---

### Task 3: Versioned Subject Resource Registry

**Files:**
- Modify: `packages/subject-registry/package.json`
- Create: `packages/subject-registry/src/types-v2.ts`
- Create: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Create: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/index.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`

**Interfaces:**
- Consumes: protocol hashing and subject-composition primitive types.
- Produces `SubjectResourceRegistryV2` with exact immutable methods:

```ts
export interface SubjectResourceRegistryV2 {
  resolveSubjectDefinition(resourceRef: string): RegistrySubjectDefinitionV2 | undefined;
  resolveCapability(resourceRef: string): CapabilityManifestV1 | undefined;
  resolvePhysicsBodyProfile(resourceRef: string): PhysicsBodyProfileManifestV1 | undefined;
  resolveLocomotionProfile(resourceRef: string): LocomotionProfileManifestV1 | undefined;
  resolveColliderDerivationProfile(resourceRef: string): ColliderDerivationProfileManifestV1 | undefined;
  listSubjectDefinitions(): readonly RegistrySubjectDefinitionV2[];
  listResources(): readonly SubjectRegistryResourceV1[];
}

export function createSubjectResourceRegistry(
  resources: readonly SubjectRegistryResourceInputV1[],
): SubjectResourceRegistryV2;
```
- Worktree-only staging rule: S0 Registry exports may remain during Tasks 3–8 only so intermediate commits typecheck. No compatibility tests or fallback resolution are added, the branch must not integrate in that state, and Task 9 deletes the old exports before the full gate.

- [x] **Step 1: Replace S0 registry tests with canonical resource tests**

```ts
it("exposes canonical subject-definition resource refs", () => {
  expect(builtInSubjectResourceRegistry.listSubjectDefinitions().map(
    (definition) => definition.resourceRef,
  )).toEqual([
    "worldkit://subject-definition/humanoid.third-person@1",
    "worldkit://subject-definition/quadruped.ground-proxy@1",
  ]);
});

it("locks every immutable manifest with canonical content hash", () => {
  for (const resource of builtInSubjectResourceRegistry.listResources()) {
    expect(resource.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(resource)).toBe(true);
  }
});
```

Add duplicate-ref rejection tests across resource kinds, stable `resourceRef` ordering, and Profile resolution tests.

- [x] **Step 2: Run registry tests and verify type/ref failures**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts`

Expected: FAIL because S0 exposes `kitRef` and has no Profile manifests.

- [x] **Step 3: Define registry resource discriminated unions**

Create manifests for:

```text
worldkit://capability/locomotion.ground@1
worldkit://physics-body-profile/character.medium@1
worldkit://locomotion-profile/ground.standard@1
worldkit://collider-derivation-profile/vertical-character-capsule@1
worldkit://subject-definition/humanoid.third-person@1
worldkit://subject-definition/quadruped.ground-proxy@1
```

Each manifest has `kind`, `id`, `version`, `resourceRef`, `contentHash`, closed configuration, and AI metadata where relevant. Compute `contentHash` from the manifest without its own hash field.

- [x] **Step 4: Implement immutable exact resolution**

Deep-clone and deep-freeze inputs, reject duplicate `resourceRef` with `SUBJECT_REGISTRY_DUPLICATE_REF`, index by exact Ref, and sort list output by `resourceRef`. Do not resolve `latest`, unversioned aliases, or old Kit refs.

- [x] **Step 5: Run registry and type checks**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts`

Run: `pnpm typecheck`

Expected: registry tests and repository typecheck PASS because the V2 Registry is additive at this checkpoint.

- [x] **Step 6: Commit**

```bash
git add packages/subject-registry
git commit -m "feat: register versioned subject resources"
```

---

### Task 4: Clean AuthoringSpecV2 Schema

**Files:**
- Create: `packages/authoring/src/authoring-spec-v2.schema.json`
- Create: `packages/authoring/src/subject-definition-v1.schema.json`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/validate.ts`
- Modify: `packages/authoring/src/parse.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/authoring.test.ts`
- Modify: `packages/authoring/src/test-fixture.ts`

**Interfaces:**
- Consumes: strict JSON whose only accepted root protocol version is AuthoringSpecV2.
- Produces:

```ts
export function validateAuthoringSpecV2(value: unknown): AuthoringResult<AuthoringSpecV2>;
export function validatePackageSubjectDefinitionV1(
  value: unknown,
): AuthoringResult<PackageSubjectDefinitionV1>;
export function parseAuthoringSpecJsonV2(sourceText: string): AuthoringResult<AuthoringSpecV2>;

export function createValidAuthoringSpecV2(): AuthoringSpecV2;
export function createValidPackageSubjectWorldV2(options?: {
  reverseDefinitionCollections?: boolean;
  bodyWidthMeters?: number;
}): AuthoringSpecV2;
```
- Worktree staging rule: existing S0 consumers may stay unchanged through Task 8 only to keep intermediate commits buildable. No V1 parser, migration API, compatibility test, or old-field fallback is added; Task 9 deletes all obsolete S0 surfaces before integration.

- [x] **Step 1: Write failing clean-break V2 tests**

```ts
it("rejects unknown Subject fields in AuthoringSpecV2", () => {
  const spec = createValidAuthoringSpecV2();
  const subject = spec.nodes.find((node) => node.kind === "subject")!;
  const result = validateAuthoringSpecV2({
    ...spec,
    nodes: [{ ...subject, unexpectedSubjectField: true }],
  });
  expect(result).toMatchObject({ ok: false });
});

it("rejects the unpublished schemaVersion 1 instead of migrating it", () => {
  const parsed = parseAuthoringSpecJsonV2(JSON.stringify({
    ...createValidAuthoringSpecV2(),
    schemaVersion: 1,
  }));
  expect(parsed).toMatchObject({
    ok: false,
    diagnostics: [{
      code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
      instancePath: "/schemaVersion",
      details: { supportedSchemaVersions: [2] },
    }],
  });
});
```

Also test duplicate JSON keys before Schema validation, unsupported non-integer versions, unknown V2 fields, invalid resource refs, and attempts to author computed fields.

- [x] **Step 2: Run Authoring tests and verify failure**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts`

Expected: FAIL because the V2 schema and types do not exist.

- [x] **Step 3: Add V2 TypeScript discriminated types**

Define the exact interfaces from the S1a spec. `AuthoringSpecV2.resources` requires both `prototypes` and `subjectDefinitions`; `SubjectNodeSpecV2` requires `subjectDefinitionRef`. Keep old types only as untouched worktree staging needed by S0 consumers; do not export them from any V2 API or add compatibility behavior. Task 9 deletes them before integration.

- [x] **Step 4: Add strict V2 and standalone Definition JSON Schemas**

Use `additionalProperties: false` at every object boundary, closed enum values, finite/positive numeric constraints, unique list values where JSON equality is sufficient, and conditional Shape requirements. V2 Subject nodes must not mention `kitRef`. Definition schema must not define computed Hash, Lock, derived Collider, or resource-cost fields.

- [x] **Step 5: Implement the V2-only parser**

After syntax/duplicate-key checks, require exact `kind` and integer `schemaVersion: 2`, then validate the V2 Canonical Schema. Any other version returns:

```ts
{
  severity: "error",
  code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
  instancePath: "/schemaVersion",
  message: `Authoring schema version '${String(version)}' is not supported.`,
  details: { supportedSchemaVersions: [2] },
}
```

- [x] **Step 6: Run focused tests and schema export checks**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts`

Run: `pnpm typecheck`

Expected: focused tests and repository typecheck PASS because the V2 parser is additive at this checkpoint.

- [x] **Step 7: Commit**

```bash
git add packages/authoring
git commit -m "feat: define canonical authoring v2"
```

---

### Task 5: Package Definition Normalization, Hash, and Lock

**Files:**
- Modify: `packages/authoring/package.json`
- Create: `packages/authoring/src/subject-definition-normalizer.ts`
- Create: `packages/authoring/src/resource-lock.ts`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/types.ts`
- Replace/extend: `packages/authoring/src/normalize.test.ts`
- Create: `packages/authoring/src/subject-definition-normalizer.test.ts`

**Interfaces:**
- Consumes: `AuthoringSpecV2`, `SubjectResourceRegistryV2`, and subject-composition derivation.
- Produces:

```ts
export interface NormalizeAuthoringOptionsV2 {
  subjectResourceRegistry?: SubjectResourceRegistryV2;
}

export interface NormalizedSubjectDefinitionV2 {
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  source: "package" | "registry";
  // normalized metadata, parts, sockets, refs, resolved profiles, collider, resourceCost
}

export interface NormalizedWorldIRV2 {
  kind: "worldkit-normalized-world";
  schemaVersion: 2;
  resources: {
    prototypes: readonly PrimitivePrototypeSpecV1[];
    subjectDefinitions: readonly NormalizedSubjectDefinitionV2[];
    resourceLock: readonly ResolvedResourceLockEntryV1[];
    resourceLockHash: string;
  };
  // V2 nodes use subjectDefinitionRef
}

export function normalizeAuthoringSpecV2(
  value: AuthoringSpecV2,
  options?: NormalizeAuthoringOptionsV2,
): NormalizeAuthoringResultV2;
```
- Staging rule: existing S0 `normalizeAuthoringSpec` remains available until Task 9; all new S1a code calls `normalizeAuthoringSpecV2` explicitly.

- [ ] **Step 1: Write failing Package resolution and determinism tests**

```ts
it("normalizes one Package Definition once for two Subject instances", () => {
  const spec = createValidPackageSubjectWorldV2();
  const result = normalizeAuthoringSpecV2(spec);
  expect(result.ok).toBe(true);
  expect(result.value?.resources.subjectDefinitions).toHaveLength(2); // built-in + package
  const packageDefinition = result.value?.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  );
  expect(packageDefinition).toMatchObject({
    subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
    subjectDefinitionHash: expect.stringMatching(/^sha256:/),
    collider: { kind: "capsule" },
  });
});

it("makes Definition Hash insensitive to order-only changes", () => {
  const first = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
  const reordered = normalizeAuthoringSpecV2(
    createValidPackageSubjectWorldV2({ reverseDefinitionCollections: true }),
  );
  const firstDefinition = first.value!.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  )!;
  const reorderedDefinition = reordered.value!.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  )!;
  expect(reorderedDefinition.subjectDefinitionHash).toBe(firstDefinition.subjectDefinitionHash);
  expect(reordered.normalizedWorldIrHash).toBe(first.normalizedWorldIrHash);
});

it("changes Definition Hash for semantic geometry changes", () => {
  const first = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
  const changed = normalizeAuthoringSpecV2(
    createValidPackageSubjectWorldV2({ bodyWidthMeters: 1.1 }),
  );
  const hashOf = (result: NormalizeAuthoringResultV2): string => result.value!.resources
    .subjectDefinitions.find((definition) => definition.source === "package")!
    .subjectDefinitionHash;
  expect(hashOf(changed)).not.toBe(hashOf(first));
});
```

Add exact Diagnostic tests for duplicate Definition, missing Ref, bad Profile, bad support origin, failed derivation, and Resource Lock conflicts.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm vitest run packages/authoring/src/subject-definition-normalizer.test.ts packages/authoring/src/normalize.test.ts`

Expected: FAIL because NormalizedWorldIRV2 and Package resolution do not exist.

- [ ] **Step 3: Implement local Definition indexing and canonical refs**

Build `package://subject-definition/${id}@${version}` from every local definition, reject duplicates, and resolve Subject instances by exact Authority. Package refs never fall through to Registry; Registry refs never search Package resources.

- [ ] **Step 4: Normalize composition and resolve manifests**

Sort Part/Socket IDs and semantic tags, inject zero rotations, resolve Capability/Profile/Derivation refs, derive the capsule from included Parts, compute resource cost, and map composition issues to exact Authoring JSON Pointers.

- [ ] **Step 5: Compute Definition Hash and Resource Lock**

Hash the normalized Definition without computed Hash/Lock fields. Emit one sorted Lock Entry per referenced immutable resource plus each Package Definition. Compute `resourceLockHash` over the complete ordered array. Detect the same exact Registry Ref resolving to different content within one normalization request.

- [ ] **Step 6: Upgrade semantic validation and normalized nodes**

Replace `kitRef` lookup with `subjectDefinitionRef`, keep role-qualified `spawnAnchorEntityId`, verify controlled/camera targets, and emit only NormalizedWorldIRV2. Compiler-facing data must contain no unresolved Package Definition or Registry object.

- [ ] **Step 7: Run Authoring tests and typecheck**

Run: `pnpm vitest run packages/authoring/src`

Run: `pnpm typecheck`

Expected: Authoring tests and repository typecheck PASS because V2 normalization is additive at this checkpoint.

- [ ] **Step 8: Commit**

```bash
git add packages/authoring
git commit -m "feat: normalize package subject definitions"
```

---

### Task 6: ExecutionPlanV3 and RuntimeSnapshotV3 Contracts

**Files:**
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`

**Interfaces:**
- Consumes: Normalized Definition identity and origin/collider offset semantics.
- Produces `ExecutionSubjectV3`, `ExecutionPlanV3`, `SubjectRuntimeStateV3`, `WorldRuntimeSnapshotV3`, and `WorldkitBrowserApiV3` data contracts.
- Preserves: `BindControlRequestV2` and its receipt because their structure and semantics do not change.
- Worktree-only staging rule: old execution/snapshot types may remain through Task 8 only for green intermediate commits. They receive no compatibility tests or new behavior, the branch must not integrate in that state, and Task 9 deletes every old type containing `kitRef`.

```ts
export interface SubjectRuntimeStateV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  positionMetersXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  movementMedium: "ground" | "air" | "water";
}

export interface WorldRuntimeSnapshotV3 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 3;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  controlledEntityId: string;
  controllersById: Readonly<Record<string, ControllerStateSnapshotV2>>;
  subjectStatesByEntityId: Readonly<Record<string, SubjectRuntimeStateV3>>;
  camera: {
    entityId: string;
    targetEntityId: string;
    positionMetersXYZ: Vec3;
  };
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  resources: { meshes: number; bodies: number; terrainSamples: number };
}
```

- [ ] **Step 1: Write failing V3 contract tests**

```ts
it("separates Subject Origin from collider center in ExecutionSubjectV3", () => {
  const subject = {
    entityId: "pack-animal-a",
    subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
    subjectDefinitionHash: `sha256:${"a".repeat(64)}`,
    bodyTopology: "quadruped",
    semanticClassId: "subject.animal.pack",
    spawnAnchorEntityId: "spawn-pack-animal-a",
    spawnSubjectOriginPositionMetersXYZ: [4, 0, 2],
    forwardDirection: "-z",
    visualParts: [],
    sockets: [],
    collider: {
      kind: "capsule",
      radiusMeters: 0.7,
      heightMeters: 1.4,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
      massKilograms: 75,
      maxSlopeDegrees: 42,
      maxStepHeightMeters: 0.3,
    },
    locomotion: {
      mode: "ground",
      groundSpeedMetersPerSecond: 4,
      waterSpeedMetersPerSecond: 2.2,
      jumpSpeedMetersPerSecond: 5.5,
    },
  } satisfies ExecutionSubjectV3;
  expect(subject).toMatchObject({
    subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
    subjectDefinitionHash: expect.stringMatching(/^sha256:/),
    spawnSubjectOriginPositionMetersXYZ: [4, 0, 2],
    collider: {
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
    },
  });
  expect(subject).not.toHaveProperty("spawnPositionMeters");
});

it("defines SnapshotV3 position as Subject Origin", () => {
  const snapshot = {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick: 0,
    ready: true,
    controlledEntityId: "player",
    controllersById: {
      "controller-primary": { id: "controller-primary", controlledEntityId: "player" },
    },
    subjectStatesByEntityId: {
      player: {
        entityId: "player",
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
        subjectDefinitionHash: `sha256:${"b".repeat(64)}`,
        positionMetersXYZ: [0, 0, 0],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
      },
    },
    camera: {
      entityId: "camera-main",
      targetEntityId: "player",
      positionMetersXYZ: [0, 3, 5],
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    resources: { meshes: 3, bodies: 2, terrainSamples: 1089 },
  } satisfies WorldRuntimeSnapshotV3;
  expect(snapshot.schemaVersion).toBe(3);
  expect(snapshot.subjectStatesByEntityId.player).toMatchObject({
    subjectDefinitionRef: expect.any(String),
    subjectDefinitionHash: expect.stringMatching(/^sha256:/),
    positionMetersXYZ: expect.any(Array),
  });
});
```

- [ ] **Step 2: Run contract tests and verify failure**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts`

Expected: FAIL because V3 types are absent.

- [ ] **Step 3: Define V3 contracts and remove canonical V2 subject aliases**

Add V3 interfaces exactly as the spec defines. `ExecutionPlanV3.subjects` is stable Entity-ID order and includes Definition Hash plus Sockets. SnapshotV3 states carry Definition identity and Subject-Origin position. Do not add `kitRef` compatibility fields.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts`

Run: `pnpm typecheck`

Expected: contract tests PASS; Compiler/Runtime/Playground type errors remain until Tasks 7–9.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-contracts
git commit -m "feat: define subject origin runtime contracts"
```

---

### Task 7: Compile NormalizedWorldIRV2 into ExecutionPlanV3

**Files:**
- Modify: `packages/compiler/package.json`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/compiler/src/index.ts`

**Interfaces:**
- Consumes: `{ normalizedWorldIr: NormalizedWorldIRV2; normalizedWorldIrHash: string }`.
- Produces: `compileWorldV3(input: CompileWorldInputV3): CompileWorldResultV3` with deterministic `ExecutionPlanV3` and hash.
- Invariant: Compiler resolves instances only from `normalizedWorldIr.resources.subjectDefinitions`; no Registry dependency is added.
- Staging rule: S0 `compileWorld` remains until Task 9; S1a consumers call `compileWorldV3` explicitly.

- [ ] **Step 1: Write failing compiler tests**

```ts
it("compiles two instances from one resolved Package Definition", () => {
  const normalized = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
  const result = compileWorldV3({
    normalizedWorldIr: normalized.value!,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
  });
  expect(result.executionPlan?.schemaVersion).toBe(3);
  expect(result.executionPlan?.subjects.map((subject) => ({
    entityId: subject.entityId,
    ref: subject.subjectDefinitionRef,
    hash: subject.subjectDefinitionHash,
  }))).toEqual([
    {
      entityId: "pack-animal-a",
      ref: "package://subject-definition/coastal-pack-animal@1",
      hash: expect.stringMatching(/^sha256:/),
    },
    {
      entityId: "pack-animal-b",
      ref: "package://subject-definition/coastal-pack-animal@1",
      hash: expect.stringMatching(/^sha256:/),
    },
    expect.objectContaining({ entityId: "player" }),
  ]);
});

it("places Subject Origin on sampled terrain without adding half collider height", () => {
  const normalized = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
  const compiled = compileWorldV3({
    normalizedWorldIr: normalized.value!,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
  });
  const subject = compiled.executionPlan!.subjects.find(
    (candidate) => candidate.entityId === "pack-animal-a",
  )!;
  expect(subject.spawnSubjectOriginPositionMetersXYZ[1]).toBeCloseTo(
    sampleTerrainHeight(compiled.executionPlan!.terrain, [4, 2]),
  );
});
```

Also assert Sockets, collider center offset, exact aggregated resource cost, stable Entity order, Definition Hash propagation, and normalized-hash mismatch failure.

- [ ] **Step 2: Run compiler tests and verify failure**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts`

Expected: FAIL because Compiler consumes NormalizedWorldIRV1 and emits ExecutionPlanV2.

- [ ] **Step 3: Upgrade compiler input and subject materialization**

Index normalized definitions by `subjectDefinitionRef`; propagate resolved fields without recomputing Profile/Collider data. Compute Subject Origin from anchor X/Z, sampled terrain height, and anchor Y offset. Do not add collider height to the Origin.

- [ ] **Step 4: Upgrade resource usage and execution hashing**

Aggregate SDK-computed per-definition costs once per instance, preserve existing terrain/object/water costs, emit ExecutionPlanV3, and hash through `@whitebox-world/protocol` rather than Authoring re-exports.

- [ ] **Step 5: Run compiler regression tests**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts`

Run: `pnpm typecheck`

Expected: compiler tests and repository typecheck PASS because `compileWorldV3` is additive at this checkpoint.

- [ ] **Step 6: Commit**

```bash
git add packages/compiler
git commit -m "feat: compile package subject instances"
```

---

### Task 8: Babylon/Havok Subject-Origin Runtime and Browser Protocol V3

**Files:**
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`

**Interfaces:**
- Consumes: `ExecutionPlanV3`; `collider.centerOffsetFromSubjectOriginMetersXYZ` is the only authority for controller/root conversion.
- Produces: `BabylonWorldRuntime` SnapshotV3 and `window.__WORLDKIT__` Browser Protocol V3.
- Preserves: atomic `bindControl`, fixed input, reset-all, camera follow, water-medium detection, and deterministic disposal.
- Test helpers created privately in `runtime.test.ts`:

```ts
async function createRuntimeWithPackageSubject(): Promise<{
  runtime: BabylonWorldRuntime;
  executionPlan: ExecutionPlanV3;
  debug: RuntimeDebugProbe;
}>;
function addVec3(left: Vec3, right: Vec3): Vec3;
function moveRightForTicks(tickCount: number): FixedInputV1;
```

- [ ] **Step 1: Write failing origin/controller tests**

```ts
it("keeps Snapshot and Visual Root at Subject Origin", async () => {
  const { runtime, executionPlan, debug } = await createRuntimeWithPackageSubject();
  const snapshot = await runtime.ready();
  const subject = executionPlan.subjects.find((value) => value.entityId === "pack-animal-a")!;
  const state = snapshot.subjectStatesByEntityId[subject.entityId]!;
  expect(state.positionMetersXYZ).toEqual(subject.spawnSubjectOriginPositionMetersXYZ);
  expect(debug.subjectVisualOrigin(subject.entityId)).toEqual(state.positionMetersXYZ);
  expect(debug.controllerCenter(subject.entityId)).toEqual(addVec3(
    state.positionMetersXYZ,
    subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
  ));
});

it("reset restores origin, controller center, velocity, and camera", async () => {
  const { runtime, executionPlan } = await createRuntimeWithPackageSubject();
  runtime.bindControl({
    controllerId: "controller-primary",
    expectedControlledEntityId: "player",
    controlledEntityId: "pack-animal-a",
  });
  await runtime.runFixedInput(moveRightForTicks(30));
  const reset = await runtime.reset();
  expect(reset.subjectStatesByEntityId["pack-animal-a"]?.positionMetersXYZ)
    .toEqual(executionPlan.subjects.find(
      (subject) => subject.entityId === "pack-animal-a",
    )!.spawnSubjectOriginPositionMetersXYZ);
  expect(reset.subjectStatesByEntityId["pack-animal-a"]?.velocityMetersPerSecondXYZ)
    .toEqual([0, 0, 0]);
});
```

Use existing test-only engine/controller observability patterns; do not add debug methods to the Browser Protocol.

- [ ] **Step 2: Run runtime tests and verify failure**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts apps/playground/src/authoring-loader.test.ts`

Expected: FAIL because Runtime accepts V2 and exposes collider-center positions.

- [ ] **Step 3: Map Origin to Controller Center**

Initialize Havok at `origin + centerOffset`. On every sync, calculate `origin = controllerCenter - centerOffset` and place Visual Root there. Snapshot uses Origin; physics support and velocity still use the controller. Reset applies the same conversion.

- [ ] **Step 4: Upgrade camera and subject visuals**

Camera target is `subjectOrigin + [0, targetHeightMeters, 0]`. Render each resolved Primitive Part and preserve local transforms relative to Visual Root. Carry Socket data as runtime contract data without creating Babylon attachment nodes in S1a.

- [ ] **Step 5: Upgrade Browser Protocol and Playground HUD**

Expose version `3`, return SnapshotV3, and display `controlledEntityId` by looking up the plural subject state. Remove any V2-only type assertion; do not add a singular active-subject alias.

- [ ] **Step 6: Run focused runtime and Playground tests**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts apps/playground/src/authoring-loader.test.ts`

Run: `pnpm typecheck`

Expected: focused tests and typecheck PASS except CLI tests updated in Task 9.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime-babylon apps/playground/src
git commit -m "feat: run subjects from support origin"
```

---

### Task 9: Machine-readable Registry, Definition Validate, and Subject Explain CLI

**Files:**
- Create: `scripts/lib/worldkit-pipeline.ts`
- Create: `scripts/lib/subject-explain.ts`
- Modify: `package.json`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/src/parse.ts`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/types.ts`
- Delete: `packages/authoring/src/authoring-spec-v1.schema.json`
- Modify: `packages/subject-registry/src/index.ts`
- Delete: `packages/subject-registry/src/built-in-subject-kits.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/index.ts`

**Interfaces:**
- Consumes: Authoring parse/normalize, Registry discovery, Compiler V3, Runtime SnapshotV3.
- Produces these exact commands:

```text
worldkit registry list --kind subject-definition --json
worldkit registry describe --resource-ref <ref> --json
worldkit subject-definition validate <file> --json
worldkit subject explain <world-file> --entity-id <id> --json
```

- Produces `WorldBuildArtifactV3` with NormalizedWorldIRV2 and ExecutionPlanV3.
- Finalizes versionless APIs: `parseAuthoringSpecJson`, `normalizeAuthoringSpec`, and `compileWorld` become the only canonical V2/V2/V3 pipeline. All obsolete S0 Authoring, normalized, registry, compiler, and runtime types containing `kitRef` are removed.

- [ ] **Step 1: Write failing argument and JSON output tests**

```ts
const packageWorldPath = path.resolve("examples/authoring/package-subject-world.json");

it("parses discovery and explain commands without positional guessing", () => {
  expect(parseWorldkitArgs([
    "registry", "describe", "--resource-ref",
    "worldkit://subject-definition/humanoid.third-person@1", "--json",
  ])).toEqual({
    command: "registry-describe",
    resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
    json: true,
  });
  expect(parseWorldkitArgs([
    "subject", "explain", "world.json", "--entity-id", "pack-animal-a", "--json",
  ])).toEqual({
    command: "subject-explain",
    inputPath: "world.json",
    entityId: "pack-animal-a",
    json: true,
  });
});

it("explains Definition, collider derivation, profiles, lock, and cost", async () => {
  const result = await explainSubjectFile(packageWorldPath, "pack-animal-a");
  expect(result).toMatchObject({
    ok: true,
    subject: {
      entityId: "pack-animal-a",
      subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:/),
      collider: { derivationProfileRef: expect.any(String) },
      resourceLockEntries: expect.any(Array),
      resourceCost: { colliders: 1 },
    },
  });
});
```

Add stable ordering, missing Ref/Entity diagnostics, invalid standalone Definition, and Build Artifact V3 tests.

- [ ] **Step 2: Run CLI tests and verify failure**

Run: `pnpm vitest run scripts/worldkit.test.ts`

Expected: FAIL because nested discovery commands and V3 artifacts are absent.

- [ ] **Step 3: Extract the shared world pipeline**

Move file read → Parse V2 → Normalize → Compile into `scripts/lib/worldkit-pipeline.ts`. `validate`, `build`, `run`, `capture`, and `subject explain` all call the same function. Preserve atomic writes and current exit-code policy.

- [ ] **Step 4: Implement Registry list/describe**

Return versioned JSON objects with stable resource order, `resourceRef`, `kind`, `version`, `contentHash`, AI metadata, and closed configuration. A missing exact Ref returns `SUBJECT_DEFINITION_NOT_FOUND` or the kind-appropriate resource diagnostic with available Discovery guidance.

- [ ] **Step 5: Implement standalone Definition validation**

Parse a single JSON object with the same size, syntax, and duplicate-key rules. Validate it with `validatePackageSubjectDefinitionV1`, normalize it through the same exported Definition normalizer using the built-in Registry, and return its derived Ref, Definition Hash, Collider, Resource Lock Hash, and Diagnostics.

- [ ] **Step 6: Implement Subject Explain and Artifact V3**

Join the normalized Definition with the Execution Subject by `subjectDefinitionRef`, then return the fields required by the spec. Build output becomes `kind: "worldkit-build-artifact", schemaVersion: 3` and contains only IR V2 and Plan V3.

- [ ] **Step 7: Rename and update the canonical verifier**

Replace the unpublished `verify:v1` package script with `verify:canonical`. Print and assert Authoring `2`, Normalized IR `2`, ExecutionPlan `3`, Runtime Snapshot `3`, and Browser Protocol `3`; do not retain a command alias.

- [ ] **Step 8: Switch versionless APIs and remove S0 aliases**

Make the versionless parser accept only AuthoringSpecV2, make the versionless Normalizer accept only canonical AuthoringSpecV2, and make the versionless Compiler emit V3. Remove `AuthoringSpecV1`, `SubjectNodeSpecV1`, `SubjectKitDefinitionV1`, `SubjectDefinitionRegistryV1`, `NormalizedWorldIRV1`, `ExecutionSubjectV2`, `ExecutionPlanV2`, `WorldRuntimeSnapshotV2`, the V1 JSON Schema, and built-in Kit data. Delete `kitRef` from all current source, fixtures, examples, and generated artifacts.

- [ ] **Step 9: Run CLI and full type tests**

Run: `pnpm vitest run scripts/worldkit.test.ts`

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json scripts packages/authoring packages/subject-registry packages/runtime-contracts packages/compiler
git commit -m "feat: explain subject definitions from cli"
```

---

### Task 10: Canonical V2 Package Definition Example and Browser E2E

**Files:**
- Create: `examples/authoring/package-subject-world.json`
- Update: `examples/authoring/basic-world.json`
- Update: `examples/authoring/multi-subject-world.json`
- Modify: `scripts/verify-canonical-world.ts`
- Generated during verification: `artifacts/examples/package-subject-world/world.build.json`
- Generated during verification: `artifacts/examples/package-subject-world/world.png`
- Generated during verification: `artifacts/examples/package-subject-world/snapshot.json`
- Generated during verification: `artifacts/examples/package-subject-world/explain.json`

**Interfaces:**
- Consumes: completed V2 pipeline and Browser Protocol V3.
- Produces: one reviewable fixture with one built-in Humanoid and two instances of one Package-local quadruped Definition.

- [ ] **Step 1: Add the V2 fixture and failing verification assertions**

The fixture must contain:

```json
{
  "kind": "worldkit-authoring-spec",
  "schemaVersion": 2,
  "id": "package-subject-world",
  "resources": {
    "prototypes": [],
    "subjectDefinitions": [
      {
        "id": "coastal-pack-animal",
        "version": 1,
        "kind": "subject-definition",
        "category": "animal",
        "bodyTopology": "quadruped"
      }
    ]
  }
}
```

Fill every required field exactly from the approved spec. Include body, head, four legs, and tail; include `seat.mount` as a carried but unused Socket. Spawn instances `pack-animal-a` and `pack-animal-b` far enough apart to verify independent collisions.

Add verifier assertions for one shared Definition Hash, three independent Snapshot states, control transfer, movement of only the selected target, reset, screenshot dimensions, and explain artifact identity.

- [ ] **Step 2: Run the verifier and confirm the new gate fails**

Run: `pnpm verify:canonical`

Expected: FAIL at the missing or invalid Package Definition fixture gate.

- [ ] **Step 3: Rewrite existing examples as canonical V2**

Replace every `schemaVersion: 1` with `2`, add empty `resources.subjectDefinitions` where appropriate, rename every Subject `kitRef` to `subjectDefinitionRef`, and use canonical `worldkit://subject-definition/...@1` refs. Delete V1 fixtures and compatibility assertions; the repository keeps no accepted V1 input.

- [ ] **Step 4: Complete the Package Definition fixture**

Use support-center local geometry, deterministic Part IDs, closed Profile/Capability refs, stable semantic tags, and two Subject nodes that reference the same `package://subject-definition/coastal-pack-animal@1`.

- [ ] **Step 5: Run unit, build, and real-browser gates**

Run: `pnpm typecheck`

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm verify:canonical`

Expected: all commands PASS. The verifier prints normalized IR V2, ExecutionPlan V3, Snapshot V3, Browser Protocol V3, Definition Hash, Resource Lock Hash, Havok body count, movement evidence for both Definition instances, and artifact paths.

- [ ] **Step 6: Inspect the generated screenshot**

Open `artifacts/examples/package-subject-world/world.png` and verify the Humanoid plus two distinct quadruped whitebox proxies are visible, grounded, separated, and not intersecting obvious terrain/obstacles. Record the exact visual result in the plan progress section.

- [ ] **Step 7: Commit**

```bash
git add examples scripts/verify-canonical-world.ts artifacts/examples/package-subject-world
git commit -m "test: verify package subject world end to end"
```

---

### Task 11: Documentation, Conformance Audit, and Main Integration

**Files:**
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/05-mvp-roadmap.md`
- Modify: `docs/10-current-experiments.md`
- Modify: `docs/16-subject-assets-3c-integration.md`
- Replace/update: `docs/17-canonical-json-quickstart.md`
- Modify: `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md`
- Modify: `docs/superpowers/plans/2026-08-19-package-subject-definition-visible-slice.md`

**Interfaces:**
- Consumes: verified code, generated artifacts, hashes, screenshot, and exact version output.
- Produces: truthful current-state docs, checked task boxes, validation evidence, remaining S1b/S2 boundary, and a clean main branch synchronized with `origin/main`.

- [ ] **Step 1: Update current-state and quickstart docs**

Document:

```text
pnpm worldkit validate examples/authoring/package-subject-world.json --json
pnpm worldkit build examples/authoring/package-subject-world.json --output artifacts/examples/package-subject-world/world.build.json --json
pnpm worldkit subject explain examples/authoring/package-subject-world.json --entity-id pack-animal-a --json
pnpm worldkit run examples/authoring/package-subject-world.json
pnpm worldkit capture examples/authoring/package-subject-world.json --output artifacts/examples/package-subject-world/world.png --snapshot artifacts/examples/package-subject-world/snapshot.json --json
```

State that Authoring V2 is the only accepted input, V1 was never released and has been removed, and S1a does not support assets, relationships, mounts, equipment, vehicles, animations, NPC behavior, or flight.

- [ ] **Step 2: Run naming and engine-leak audits**

Run:

```bash
rg -n 'kitRef|presetRef|definitionRef' packages apps scripts examples docs/17-canonical-json-quickstart.md README.md
rg -n 'Babylon|Havok|PhysicsCharacterController' packages/authoring packages/subject-registry packages/subject-composition packages/runtime-contracts
```

Expected: `kitRef`, bare `definitionRef`, and `presetRef` return no matches in current source, examples, CLI, quickstart, or README; Babylon/Havok terms do not appear in engine-neutral protocol data or implementation imports.

- [ ] **Step 3: Run the complete final gate from a clean build state**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
git diff --check
```

Expected: all commands PASS; only documented non-failing bundler warnings may remain.

- [ ] **Step 4: Record exact evidence and close plan checkboxes**

Fill the existing progress table with commit IDs and add final evidence below it: test totals, Definition Hash, Resource Lock Hash, Normalized IR Hash, ExecutionPlan Hash, screenshot dimensions, Havok body count, and movement/reset evidence. Mark a checkbox only after its command or artifact is verified.

- [ ] **Step 5: Commit documentation and audit**

```bash
git add README.md docs
git commit -m "docs: complete package subject definition audit"
```

- [ ] **Step 6: Verify branch integration state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -12
git rev-list --left-right --count main...origin/main
```

If implementation used an isolated feature branch, fast-forward `main` only after the complete gate passes, then push `main`. Final expected state is a clean `main` with `main...origin/main` equal to `0 0`.
