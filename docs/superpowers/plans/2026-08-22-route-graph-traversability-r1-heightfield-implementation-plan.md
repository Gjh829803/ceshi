# Route Graph / Traversability R1 Heightfield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first production M5 slice in which a locked humanoid can be proven to travel from an explicit start Anchor to an explicit destination Anchor inside a `hard-ribbon` Heightfield Route, with both a deterministic graph/query gate and a real fixed-tick Babylon/Havok Character Controller gate.

**Architecture:** Authoring V4 is promoted through a versioned `NormalizedWorldIRV4` and `ExecutionPlanV5`; it is not interpreted as a sidecar beside the V3 runtime pipeline. `ExecutionPlanV5.traversal` owns the compiled Heightfield Traversal Surface identity and required connectivity rows. An engine-neutral `@whitebox-world/traversal` contract remains the canonical boundary, while a separate `@whitebox-world/traversal-recast` adapter uses the locked Heightfield, water exclusions, and authoritative static collider geometry to build/query a Recast/Detour NavMesh and project it into `TraversalGraphV1` and `RoutePathReceiptV1`. The real runtime probe drives the existing Babylon/Havok Character Controller with fixed-tick canonical walk intents; it records the already-consumed single `checkSupport()` sample and never performs a second grounding query. `@whitebox-world/validation` alone evaluates the two blocking Route gates and emits `ValidationReportV2`.

**Tech Stack:** TypeScript 5.9, Authoring JSON Schema 2020-12/AJV, canonical JSON + SHA-256, `recast-navigation` 0.43.1 behind an internal adapter, Babylon.js/Havok 9.21.2/1.3.14, NullEngine for headless runtime verification, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`

**Baseline:** `main` / `origin/main` at `5e0d6bf537c22f71aee5dc31ed8d9829be9fe9b3` (the plan commit on top of PR #18 and the Canonical World State design); `pnpm verify:route-r0-contract`, `pnpm typecheck`, `pnpm test` (94 files / 848 tests), and `pnpm build` all passed from this exact commit on 2026-08-22.

## Delivery Boundary

This plan delivers **R1 Heightfield Route only**. It does not close M5 by itself.

- Included: one locked ground humanoid, one Heightfield Traversal Surface, static blocking primitives, blocked water, required `connected-by-route`, `hard-ribbon`, deterministic graph/query evidence, real fixed-tick runtime evidence, CLI verification, and read-only Browser evidence.
- Included failure classes: slope, static wall, capsule-width clearance, overhead clearance, blocked water/surface gap, graph budget, start support, lock mismatch, runtime stall/deviation/support loss, and render-cadence determinism.
- Excluded: traversable static platforms, stairs assembled from platform surfaces, ramps that leave the Heightfield, bridges, caves, multiple stacked surfaces, jump/drop/climb links, water locomotion, dynamic obstacles, NPC path following, crowd simulation, and gameplay `goTo`.
- R1b starts only after this plan is green. R1b gets its own plan and reuses the surface/collider identity and runtime probe seams created here.

## Frozen Authority Rules

- AI authors `spatial.routes`, Anchors, subjects, and `constraints.connectivity`; AI never writes NavMesh polygons, graph nodes, provider parameters, or Babylon/Havok handles.
- `AuthoringSpecV4 -> NormalizedWorldIRV4 -> ExecutionPlanV5` is the only R1 projection path. Do not read V4 connectivity directly beside an independently compiled V3 plan.
- The compiled Heightfield Traversal Surface is derived deterministically from the locked terrain entity. Its `traversalSurfaceId`, `surfaceEntityId`, and `colliderSubshapeId` remain distinct.
- `ExecutionPlanV5.staticColliders` is a flat, sorted collection of canonical Collider Subshape rows. R1 emits one row for each collision-enabled static object; the same entity may own multiple rows later, so consumers must key by `colliderSubshapeId`, not assume one collider per entity. A source-declared logical Subshape ID is preserved; the R1 single-primitive compatibility projection uses the reserved logical ID `primary`. `deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)` returns `collider-subshape:` plus the canonical SHA-256 of those two named inputs, so identity never depends on delimiter parsing, an array index, Tile, LOD, or Runtime handle.
- `compileResolvedTraversalLockV1()` is the only lock-construction seam. It joins `NormalizedWorldIRV4`, `ExecutionPlanV5`, the selected Subject, and one trusted `TraversalRuntimeImplementationIdentityV1`; Graph build, Path query, Runtime probe, and Validation receive the same immutable receipt and never reconstruct it independently.
- `@whitebox-world/traversal` owns the provider-neutral `TraversalRuntimeImplementationIdentityV1` contract type. The trusted Babylon adapter exports a value satisfying that type with its Backend/Adapter Ref, resolved version, and content hash. The Compiler accepts that value as input; it does not own the type, import Babylon, or hard-code Babylon/Havok identity, and Recast cannot invent Runtime identity.
- `TraversalCapabilityEnvelopeV1` is the sole provider-neutral projection of locked capsule, slope, step, ground capability/Profile identities, conservative builder clearance, and the locked Runtime implementation identity needed to select a tested equivalence mapping. Its canonical factory accepts exactly `ResolvedTraversalLockReceiptV1` plus `ResolvedTraversalGraphBuilderProfileV2`; it does not add fields to frozen `ResolvedTraversalLockV1`. `@whitebox-world/traversal` owns the type and derivation; `@whitebox-world/traversal-recast` maps it to provider build parameters without rereading Subject/Profile resources. Provider field names and formulas stay inside the adapter.
- Recast/Detour is an internal Graph Builder provider. Provider polygon/tile refs, WASM pointers, provider paths, and provider errors never enter canonical artifacts or Browser/CLI public fields.
- Recast agent geometry, maximum climb, and maximum slope are derived from the `ResolvedTraversalLockReceiptV1` used by the Character Controller; conservative erosion additionally uses the resolved Graph Builder Profile's clearance. The resulting Envelope carries both identities/hashes, and no adapter-owned copy is permitted.
- The Graph Builder Profile owns voxel/tile/quantization/build-budget policy. It does not own Subject speed, acceleration, gravity, capsule, step, slope, validation thresholds, or runtime stop conditions.
- `route-connectivity` passing never implies `route-runtime-conformance` passing. Both are blocking for a required Route.
- Runtime simulation uses the existing fixed timestep. Rendering never advances the probe.
- Every simulated tick performs exactly one Character Controller `checkSupport()` call. The returned raw support state/normal is retained as evidence from that same call. Do not add a ray, AABB, terrain-height, NavMesh-height, or extra `checkSupport()` grounding path.
- Heightfield sampling may map an already-supported tick to a canonical R1 surface identity for evidence. It must not decide Ground/Air, jump eligibility, gravity, or Character Controller support.
- Support-to-surface classification consumes the already-sampled Character Controller support result, controller pose, and a compiled surface/collider index. Only raw `SUPPORTED` or `SLIDING` enters correlation. Candidate surfaces must lie within the locked conservative contact band around the controller bottom/contact normal: zero candidates is `unmatched`, one is `resolved`, and more than one is `ambiguous`. Heightfield sampling is corroborating evidence only after raw support exists; an unsupported tick cannot resolve a surface, and neither `unmatched` nor `ambiguous` may satisfy the runtime gate.
- `@whitebox-world/terrain-surface` owns one canonical Heightfield triangle emitter. V5 render mesh, `PhysicsShapeMesh`, sampling, Graph build, and evidence consume that topology rather than duplicating triangle loops. Babylon 9.21.2's HeightField adapter exposes sample reordering but does not freeze Havok's cell diagonal; V4 keeps its existing compatibility path.
- `SLIDING` is recorded as raw support and is not Support Loss. `UNSUPPORTED` is recorded from the first tick; only Validation Profile thresholds decide whether the run fails.
- Runtime probe setup may reset the subject to the explicit start Anchor. After tick 0, the probe must not teleport, disable collision, change step/slope, or skip graph corners.
- Tests and implementations use strict `===` / `!==`; null/undefined checks use `lodash-es` `isNil` where both values are intentionally accepted.
- World-XZ probe intent enters the Motion Kernel as a canonical planar-vector command and bypasses camera-relative input compilation. Browser input and probe input share only the post-command fixed-tick simulation/commit path; camera yaw cannot change a probe receipt.
- `@whitebox-world/traversal` owns only provider-neutral request/receipt/tick contracts. It may not import `@whitebox-world/validation`; all arrival, deviation, stall, unsupported-duration, and timeout thresholds and counters remain in the Validation runner.
- Every runtime change follows `docs/reviews/runtime-deep-review-checklist.md`; every completed slice runs the relevant full-dimension review protocol.

---

### Task 1: Promote Authoring V4 Through Canonical IR and Execution Plan

**Files:**
- Modify: `packages/authoring/src/types-v4.ts`
- Create: `packages/authoring/src/normalize-v4.ts`
- Create: `packages/authoring/src/normalize-v4.test.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-contracts/package.json`
- Modify: `packages/traversal/src/types.ts`
- Create: `packages/traversal/src/collider-subshape-id.ts`
- Create: `packages/traversal/src/collider-subshape-id.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/subject-registry/src/capability-registry.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Create: `packages/compiler/src/compile-traversal-lock.ts`
- Create: `packages/compiler/src/compile-traversal-lock.test.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/compiler/package.json`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Verify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `scripts/worldkit.test.ts`
- Modify: `scripts/lib/worldkit-pipeline.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `NormalizedConnectivityRequirementV1`, `NormalizedWorldIRV4`, `NormalizeAuthoringResultV4`, `normalizeAuthoringSpecV4()`, `ExecutionHeightfieldTraversalSurfaceV1`, the versioned closed discriminated union `ExecutionTraversalSurfaceV1`, `ExecutionStaticColliderV1`, `ExecutionConnectivityRequirementV1`, `ExecutionPlanV5`, `CompileWorldInputV5`, `CompileWorldResultV5`, `compileWorldV5()`, `compileResolvedTraversalLockV1()`, and `loadWorldkitRoutePipeline()`. `@whitebox-world/traversal` separately owns and exports both the `TraversalRuntimeImplementationIdentityV1` input contract and the unique `deriveColliderSubshapeIdV1()` identity function; Compiler, Graph, Runtime evidence, and R1b consumers call that function rather than copying its hash algorithm.
- `ExecutionPlanV5.traversal` contains exactly `surfaces` and `connectivityRequirements` in R1. `surfaces` is typed as `readonly ExecutionTraversalSurfaceV1[]`; R1 emits only rows with `kind: "heightfield"`, while R1b may add a new closed union member without changing the collection or its consumers. `ExecutionPlanV5.staticColliders` is the separate locked collision authority shared by Graph Builder and Runtime; it is not inferred independently from visual meshes.
- Each `ExecutionStaticColliderV1` describes one closed primitive Collider Subshape, including `entityId`, stable `logicalSubshapeId`, derived `colliderSubshapeId`, transform, dimensions, and canonical collider hash. Rows are sorted by `colliderSubshapeId`; R1 emits one row per collision-enabled object, while R1b may emit multiple rows for one entity without nesting or changing consumer ownership. The ID derivation is tested as a pure canonical-hash function of the owning Entity ID and source logical Subshape ID; list position and collider bytes are not identity inputs, while the separate collider hash changes with geometry.
- The R1 Heightfield surface identity is compiler-derived from the locked terrain entity and content hashes; no Authoring duplicate is introduced.
- The built-in primitive `humanoid.third-person@1` is clean-broken from legacy Subject Definition V2 to capability-driven V3 while retaining primitive visuals and the static whitebox Pose Set. It selects the explicit `worldkit://collider-profile/humanoid.medium-capsule@1` rather than a derivation profile, so frozen `colliderProfileRef/Hash` keep their literal contract meaning. It uses the capability-driven Character Physics Body and complete Motion/Control/Feel/Medium assembly. This gives R1 a GLB-independent humanoid whose every lock resource exists in the normalized Resource Lock; the lock compiler must never synthesize missing legacy identities or store a Collider Derivation Profile in a `colliderProfileRef` field.
- Registry discovery classifies the migrated primitive exactly like other V3 capability Subjects: it appears once in both the canonical CLI Subject Definition list and capability Subject list, is absent from the legacy `listResources()` projection, and resolves to the same frozen content hash through every supported discovery path.
- Registry `resourceLock[].contentHash` locks the immutable Registry resource bytes, while `ExecutionSubjectV3.subjectDefinitionHash` and `ResolvedTraversalLockV1.subjectDefinitionHash` lock the normalized Definition bytes. These byte domains are intentionally distinct for Registry Subjects and must never be compared as aliases. The lock compiler binds them by validating the complete canonical `resourceLockHash` against both Normalized IR and Execution Plan, while separately validating Plan-to-normalized-Definition identity.

- [x] **Step 1: Write RED normalization tests**

Cover all of the following:

```ts
expect(normalizeAuthoringSpecV4(validV4).value).toMatchObject({
  kind: "worldkit-normalized-world",
  schemaVersion: 4,
  layout: {
    connectivityRequirements: [{
      constraintId: "hero-to-goal",
      kind: "connected-by-route",
      traversingEntityId: "hero",
      startAnchorEntityId: "spawn",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    }],
  },
});
expect(normalizeAuthoringSpecV4(reorderedV4).normalizedWorldIrHash)
  .toBe(normalizeAuthoringSpecV4(validV4).normalizedWorldIrHash);
expect(normalizeAuthoringSpecV4(changedRouteV4).normalizedWorldIrHash)
  .not.toBe(normalizeAuthoringSpecV4(validV4).normalizedWorldIrHash);
```

Also prove that the explicit V3 normalizer still rejects V4 and that V4 normalization does not erase layout-solver provenance.

Add Registry and Authoring Subject Normalizer regressions proving the primitive R1 humanoid resolves as schemaVersion 3, uses `worldkit://pose-set/static.whitebox@1`, has exactly one ground-locomotion capability, and contributes every resource required by `ResolvedTraversalLockV1` to the normalized Resource Lock without loading a GLB. Prove CLI/capability discovery returns it exactly once with the resolved content hash and that the legacy resource projection no longer returns the V3 definition.

- [x] **Step 2: Run the RED normalization test**

Run: `pnpm vitest run packages/authoring/src/normalize-v4.test.ts`

Expected: FAIL because `normalizeAuthoringSpecV4` and `NormalizedWorldIRV4` do not exist.

- [x] **Step 3: Implement V4 normalization without duplicating the layout solver**

Implement an explicit V4-to-V3 placement projection for the existing solver, then wrap the solved V3 result with sorted connectivity requirements and recompute the V4 canonical hash. The inner V3 hash is an implementation detail and must not be returned as the V4 hash.

Do not mutate `NormalizedWorldIRV3`, do not add empty connectivity fields to it, and do not alias `normalizeAuthoringSpecV4` to the V3 function.

- [x] **Step 4: Write RED compiler tests for `ExecutionPlanV5.traversal`**

The tests must prove:

- the connectivity row is carried from normalized V4 with unchanged role-qualified IDs;
- one deterministic Heightfield Traversal Surface is compiled;
- the surface uses the persistent-definition discriminator `kind: "heightfield"` and is exposed through `ExecutionTraversalSurfaceV1` rather than a Heightfield-only collection type;
- its three IDs are distinct and stable across reordered input;
- every collision-enabled static object has one deterministic `ExecutionStaticColliderV1` with `logicalSubshapeId: "primary"` and a stable derived Collider Subshape ID;
- static collider consumers do not key by `entityId` or assume one collider per entity;
- the current cone visual compiles to the same cylinder collider shape used by Babylon/Havok instead of inventing a cone-only Graph collider;
- `resourceHash` changes when height samples change;
- the execution plan hash includes connectivity and surface identity;
- no Recast/provider field exists in the plan.

- [x] **Step 5: Implement `ExecutionPlanV5` and `compileWorldV5()`**

Use the existing V4 compiler core for shared world projection, then add the V5 traversal section, explicit static colliders, and recompute the plan hash. The derived Heightfield surface uses a stable package resource ref and a content hash over the canonical locked terrain source only; every Static Collider row has its own canonical hash, the Execution Plan hash covers both collections, and the later Graph Build Input hash covers the combined terrain/collider source. The Graph Builder consumes `staticColliders`; Task 5 changes Runtime V5 to consume the same rows. Visual object primitives remain rendering input only.

`ExecutionPlanV5` and the Compiler must reuse `TraversalSurfaceIdentityV1` and `TraversalRuntimeImplementationIdentityV1` from `@whitebox-world/traversal` through declared direct package dependencies rather than relying on workspace hoisting or copying competing shapes. This direction remains acyclic: Traversal does not import Runtime Contracts or Compiler.

- [x] **Step 6: Write RED lock-compilation tests**

Prove that `compileResolvedTraversalLockV1()`:

- resolves every Subject/Profile/Capability/Kernel hash from the normalized resource lock and compiled Subject rather than fixture constants;
- rejects a one-sided mutation in either the Resource Lock hash chain or the Plan-to-normalized-Definition hash chain without comparing their unlike Subject Definition hashes;
- requires exactly one compatible ground-locomotion capability for the R1 subject and fails closed on missing or ambiguous capability identity;
- rejects legacy/incomplete Subjects instead of filling absent Control/Motion/Medium hashes from Runtime constants;
- requires a complete trusted `TraversalRuntimeImplementationIdentityV1` and changes the lock hash when Backend or Adapter identity changes;
- returns byte-identical immutable receipts across reordered normalized inputs;
- exposes the only lock-construction seam for Graph build and Runtime orchestration; Tasks 3-9 must prove those consumers receive its receipt instead of reconstructing locks when the consumers exist.

- [x] **Step 7: Implement the unique lock compiler and add a route-specific pipeline entry**

`compileResolvedTraversalLockV1()` accepts `NormalizedWorldIRV4`, `ExecutionPlanV5`, `traversingEntityId`, and a trusted provider-neutral Runtime implementation identity. It delegates final closed validation/hash construction to `resolveTraversalLockV1()` and never reads a Registry at Runtime. `loadWorldkitRoutePipeline()` must require Authoring V4 and return `NormalizedWorldIRV4` plus `ExecutionPlanV5`. Existing `loadWorldkitPipeline()` remains the V3 runtime entry until a separately reviewed default-version migration; R1 must not silently reinterpret existing V3 worlds.

- [x] **Step 8: Run focused and dependency gates**

Run:

```bash
pnpm vitest run packages/authoring/src/normalize-v4.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/subject-registry/src/subject-registry.test.ts packages/subject-registry/src/capability-registry.test.ts packages/compiler/src/compile.test.ts packages/compiler/src/compile-v5.test.ts packages/compiler/src/compile-traversal-lock.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts packages/traversal/src/collider-subshape-id.test.ts packages/runtime-babylon/src/runtime.test.ts apps/playground/src/authoring-loader.test.ts scripts/worldkit.test.ts
pnpm verify:route-r0-contract
pnpm typecheck
pnpm test
```

Expected: PASS, and the R0 verifier remains byte-stable.

---

### Task 2: Freeze the R1 Graph Builder Profile and Recast Adapter Boundary

**Files:**
- Modify: `packages/traversal/src/types.ts`
- Modify: `packages/traversal/src/profile-registry.ts`
- Modify: `packages/traversal/src/profile-registry.test.ts`
- Modify: `packages/traversal/src/graph-contract.ts`
- Modify: `packages/traversal/src/graph-contract.test.ts`
- Create: `packages/traversal/src/capability-envelope.ts`
- Create: `packages/traversal/src/capability-envelope.test.ts`
- Create: `packages/traversal/src/build-budget.ts`
- Create: `packages/traversal/src/build-budget.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/traversal-recast/package.json`
- Create: `packages/traversal-recast/src/adapter-identity.ts`
- Create: `packages/traversal-recast/src/adapter-identity.test.ts`
- Create: `packages/traversal-recast/src/provider-patch-identity.test.ts`
- Create: `packages/traversal-recast/src/recast-config.ts`
- Create: `packages/traversal-recast/src/recast-config.test.ts`
- Create: `packages/traversal-recast/src/provider-lifecycle.ts`
- Create: `packages/traversal-recast/src/provider-lifecycle.test.ts`
- Create: `packages/traversal-recast/src/provider-acceptance.test.ts`
- Create: `packages/traversal-recast/src/index.ts`
- Create: `packages/runtime-babylon/src/traversal-implementation-identity.ts`
- Create: `packages/runtime-babylon/src/traversal-implementation-identity.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `packages/runtime-babylon/package.json`
- Create: `patches/@recast-navigation__core@0.43.1.patch`
- Create: `patches/@recast-navigation__generators@0.43.1.patch`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Adds `TraversalGraphBuilderProfileV2`, `ResolvedTraversalGraphBuilderProfileV2`, a version-dispatching `resolveTraversalGraphBuilderProfile()`, `TraversalCapabilityEnvelopeV1`, and `createTraversalCapabilityEnvelopeV1()` without mutating frozen V1.
- Built-in ref: `worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1`.
- V2 adds provider-neutral voxel/tile build policy required by a real builder: `voxelCellSizeMeters`, `voxelCellHeightMeters`, `tileSizeCells`, `maximumEdgeLengthMeters`, `maximumSimplificationErrorMeters`, and the existing quantization/cost/budget fields.
- The built-in V2 Profile is fully frozen rather than left to adapter defaults: `clearanceMarginMeters: 0.05`, `voxelCellSizeMeters: 0.15`, `voxelCellHeightMeters: 0.1`, `tileSizeCells: 64`, `maximumEdgeLengthMeters: 2.4`, `maximumSimplificationErrorMeters: 0.15`, `positionQuantizationMeters: 0.001`, both cost weights `1`, `maximumNodes: 100000`, `maximumEdges: 200000`, `maximumTiles: 1024`, and `maximumSearchSteps: 100000`. Validation accepts finite clearance in `[0, 2]`, cell sizes in `[0.001m, 4m]`/`[0.001m, 2m]`, integer tile size in `[16, 1024]`, positive maximum edge length no greater than `256m` and no smaller than one horizontal cell, positive simplification error no greater than `16m`, and the existing V1 cost/budget domains. These are canonical policy values and units, not Recast names or defaults.
- `@whitebox-world/traversal-recast` owns the pinned provider dependency and conversion only; `@whitebox-world/traversal` stays provider-neutral.
- The Capability Envelope is derived from the frozen V1 lock receipt plus the resolved V2 Graph Builder Profile. It contains canonical geometry/capability units, the locked ground capability/Profile identities, conservative builder clearance, the complete V2 voxel/tile/quantization/cost/budget policy, the `resolvedTraversalLockHash`, Graph Builder Profile identity, and the locked provider-neutral Backend/Adapter identity needed for an audited equivalence mapping. It does not mutate the R0 lock and contains no Recast field names, poly refs, WASM identity, validation thresholds, speed, acceleration, gravity, Control/Feel/Motion/Medium identity, or Driver policy.
- `TraversalCapabilityEnvelopeV1` is a closed object with `kind: "traversal-capability-envelope"`, `schemaVersion: 1`, `traversalMode: "ground"`, and no self-hash field. Its factory returns `{ envelope, traversalCapabilityEnvelopeHash }`, where the hash is `sha256CanonicalJson(envelope)`. In addition to the lock/profile receipt hashes and exact identities, the Envelope copies only these payload fields: `subjectEntityId`, capsule radius/height/center offset, slope/step limits, Collider/Physics Body/Locomotion/Ground Capability refs and hashes, Runtime Backend/Adapter refs/versions/hashes, Graph Builder ref/version/hash, and every V2 build-policy field. The adapter accepts the Envelope only; it never accepts a raw lock, Profile, Subject, or Registry.
- Registry Subject Definition bytes and normalized Definition bytes remain separate as frozen in Task 1. The Envelope does not copy either Subject Definition hash because Recast mapping needs the already-bound `resolvedTraversalLockHash`, capability identities, and geometry rather than visual/semantic Definition identity.
- V2 uses `schemaVersion: 2`, resource version `@1`, and `resolvedVersion: "1"`. The dispatcher is an exact two-ref table; it does not infer versions from a suffix or payload. `resolveTraversalGraphBuilderProfileV1()` and the exact V1 hash remain byte-stable.
- Receipt validation is independent: lock receipt hash must equal `sha256CanonicalJson(lock)`; Profile content hash must equal `sha256CanonicalJson(profile)` and its exact Registry resolution; V1 Profiles are rejected by the Envelope factory. The lock hash is never compared with the Profile hash.
- `@whitebox-world/runtime-babylon` owns and exports the one production `TraversalRuntimeImplementationIdentityV1`. Its Backend manifest is canonical JSON over `{ kind: "traversal-runtime-backend-manifest", schemaVersion: 1, resourceRef: "worldkit://runtime-backend/babylon-havok@1", resolvedVersion: "9.21.2+1.3.14", babylonCoreVersion: "9.21.2", havokPluginVersion: "1.3.14" }`; its Adapter manifest is canonical JSON over `{ kind: "traversal-runtime-adapter-manifest", schemaVersion: 1, resourceRef: "worldkit://runtime-adapter/babylon.character-controller@1", resolvedVersion: "1", runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1", runtimeBackendResolvedVersion: "9.21.2+1.3.14", adapterContractVersion: "character-controller-ground-support.v1" }`. The two content hashes are `sha256CanonicalJson()` of those exact manifests. No fixture hash or legacy `babylon-world-runtime@1` Ref is accepted as production identity.
- Task 2 pins `@babylonjs/core` and `@babylonjs/loaders` to exact `9.21.2` and `@babylonjs/havok` to exact `1.3.14` in `runtime-babylon` rather than leaving compatible ranges. The identity test reads the package's declared direct dependency versions and fails if they drift from the manifest before a manifest/hash update; an upgraded engine cannot retain the old production identity silently.
- `@whitebox-world/traversal-recast` keeps a compatibility allowlist keyed by that exact six-field Runtime identity tuple, but its production code does not import Runtime Babylon or invent a competing Runtime identity. Its test package declares Runtime Babylon as a dev dependency and proves the exported production tuple is accepted, while R0 placeholder hashes and the legacy Adapter Ref fail with `TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED`. Recast provider identity uses separate internal `graphProviderAdapter...` fields and never enters Profile, Envelope, Lock, canonical Graph, or Runtime identity.
- R1 uses `generateTiledNavMesh`. `tileSizeCells` is required, integer, and mapped to the tiled generator. `maximumTiles` is not a Recast config field: the provider-neutral `estimateHeightfieldTileCountV1()` first applies the same integer-micrometer normalization and computes `ceil(widthMicrometers / (tileSizeCells * voxelCellSizeMicrometers)) * ceil(depthMicrometers / (tileSizeCells * voxelCellSizeMicrometers))` for the one-layer R1 Heightfield. `assertTraversalGraphBuildBudgetV1()` fails with `ROUTE_GRAPH_BUDGET_EXCEEDED` before any WASM allocation when the estimate exceeds the Envelope budget. Task 3 must call this named guard before invoking the provider. Solo generation is not an R1 fallback.
- Published `@recast-navigation/core` and `@recast-navigation/generators` `0.43.1` do not release every operation-local WASM wrapper on tiled builds, including retained-intermediate builds required by the SDK's query-before-dispose lifecycle. Task 2 therefore carries two exact pnpm patches scoped only to resource ownership and cleanup. They may not change geometry, winding, bounds, Recast configuration, mesh/polygon output, query semantics, or canonical SDK contracts. Exact package versions/integrities, version-qualified patch keys, repository-relative patch paths/revision/byte hashes, and content hashes of the two installed patched `dist/index.mjs` files are part of `RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1`, so dependency, patch, or installed-byte drift cannot retain the old Adapter identity. Absolute installation paths and non-local registry metadata never enter the manifest. The ownership table, evidence, and rejected alternatives are frozen in `docs/reviews/2026-08-22-recast-0431-resource-lifecycle-adr.md`.

- [ ] **Step 1: Write RED profile tests**

Prove that V2 accepts only its closed field set, rejects Subject/Validation values such as `capsuleRadiusMeters`, `maxSlopeDegrees`, `maxStepHeightMeters`, `walkSpeedMetersPerSecond`, `gravityMetersPerSecondSquared`, and `maximumProbeTicks`, rejects Provider dialects such as `cs`, `ch`, `walkableRadius`, `walkableClimb`, and `agentRadius`, and produces a stable Registry content hash. Lock `schemaVersion: 2`, resource `resolvedVersion: "1"`, the exact V1 hash `sha256:0c716c3d733d679d8518018ec2e54d678bc26715beac98c9928218862778d4a1`, and mismatched V1/V2 Ref-hash pairs in Graph validation.

- [ ] **Step 2: Run the RED profile test**

Run: `pnpm vitest run packages/traversal/src/profile-registry.test.ts`

Expected: FAIL because V2 resolution is absent.

- [ ] **Step 3: Implement V2 profile resolution**

Keep Subject geometry and motion values out of the profile. At build time, locked Subject geometry and traversal limits come from `ResolvedTraversalLockReceiptV1`, while conservative builder clearance and voxel/tile policy come from the separately resolved `ResolvedTraversalGraphBuilderProfileV2`. Those two immutable inputs are joined exactly once by `createTraversalCapabilityEnvelopeV1()`; do not add either input's fields to the other contract. Update Graph validation to resolve either the frozen V1 profile or the new V2 profile by exact resource ref/hash; do not weaken validation to accept arbitrary profiles.

- [ ] **Step 4: Write and run RED Capability Envelope and build-budget tests**

Prove that `createTraversalCapabilityEnvelopeV1()` accepts only one immutable `ResolvedTraversalLockReceiptV1` plus one immutable `ResolvedTraversalGraphBuilderProfileV2`, copies every geometry/capability/identity and V2 policy field from the correct owner, independently validates each receipt's canonical hash and exact Profile Registry identity, rejects V1 Profiles and non-finite values, returns immutable canonical bytes plus a non-self-referential envelope hash, and contains no Validation, Driver, speed, gravity, Control/Feel/Motion/Medium, Provider, or Recast field. Changing only `capsuleRadiusMeters`, `clearanceMarginMeters`, or `voxelCellSizeMeters` must change the Envelope hash. Separately prove exact-multiple and boundary tile estimates, one-layer semantics, integer-overflow rejection, and stable `ROUTE_GRAPH_BUDGET_EXCEEDED` before a provider callback can run. Run: `pnpm vitest run packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-budget.test.ts`. Expected: FAIL because the factories do not exist.

- [ ] **Step 5: Implement the canonical Capability Envelope and pre-provider budget guard**

Implement and export the strict Envelope factory plus the pure Heightfield tile estimator/budget guard in `@whitebox-world/traversal` before adding any Recast mapping. No adapter code may accept a raw lock or Graph Builder Profile. The guard owns no WASM or provider values and Task 3 must invoke it before the first provider call.

- [ ] **Step 6: Add the isolated Recast package**

Declare `recast-navigation` `0.43.1` as a direct dependency of `@whitebox-world/traversal-recast`. Do not add it to the root or `runtime-babylon` package. Pin lifecycle-only patches for exact `@recast-navigation/core@0.43.1` and `@recast-navigation/generators@0.43.1` through root `pnpm.patchedDependencies`; no workspace package imports a transitive provider module as an undeclared dependency. Define a separate internal Graph Provider Adapter identity/hash over all four exact provider package versions/lockfile integrities, both version-qualified patch keys, repository-relative paths/revision/patch-byte hashes, content hashes of the two installed patched files, tiled-generator choice, closed mapping/rounding formulas, and every remaining explicit provider constant. The manifest contains portable literals only; test-only resolution paths never enter it, and its final hash remains outside the hash input. `provider-patch-identity.test.ts` must start from the declared umbrella entry and use chained `createRequire()` lookup to validate root patch declarations, lockfile SRI/patch entries, patch bytes, installed versions, and installed file bytes under pnpm strict isolation. Do not equate pnpm's generated patch hash with the SDK patch-byte SHA-256. The Adapter identity is not resolved by the Graph Builder Profile and is never serialized into Profile, Envelope, Lock, or `TraversalGraphV1`.

The Recast adapter accepts only the already-derived Envelope and maps it to provider build parameters; Recast radius, height, climb, slope, and erosion inputs must come only from that mapping. The adapter may conservatively transform canonical values but may not accept or reread Subject, Physics Body, Locomotion, raw Lock, or Graph Builder Profile records.

Source audit of published `recast-navigation` `0.43.1` freezes the mapping boundary: `cs`/`ch` are world units; `walkableHeight`, `walkableClimb`, `walkableRadius`, `maxEdgeLen`, and `maxSimplificationError` are voxel-domain inputs in the high-level generator. Map exactly once inside the adapter after normalizing meter values to nearest integer micrometers (`round(meters * 1_000_000)`) so decimal policy values do not lose a voxel through IEEE-754 division: height uses integer `ceil(capsuleHeightMicrometers / voxelCellHeightMicrometers)`, climb uses integer `floor(maxStepHeightMicrometers / voxelCellHeightMicrometers)`, radius uses integer `ceil((capsuleRadiusMicrometers + clearanceMarginMicrometers) / voxelCellSizeMicrometers)`, maximum edge length uses integer `floor(maximumEdgeLengthMicrometers / voxelCellSizeMicrometers)` with V2 requiring at least one cell, simplification error uses `maximumSimplificationErrorMicrometers / voxelCellSizeMicrometers`, and slope remains degrees. `walkableHeight` never uses collider center offset. RED locks `0.3m / 0.1m -> 3`, `2.4m / 0.15m -> 16`, and `0.299m / 0.1m -> 2`. Remaining generator values are closed adapter constants included in the internal adapter hash: input `borderSize: 0` (the pinned tiled generator derives effective border as walkable radius plus three cells), `minRegionArea: 8`, `mergeRegionArea: 20`, `maxVertsPerPoly: 6`, `detailSampleDist: 6`, `detailSampleMaxError: 1`, `buildBvTree: true`, and `chunkyTriMeshTrisPerChunk: 128`; library defaults are not accepted implicitly. Unknown Runtime Backend/Adapter identity tuples fail with `TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED`.

- [ ] **Step 7: Add the provider acceptance test**

The test must initialize/use the real WASM provider repeatedly, prove Node compatibility, prove a right-handed Y-up counter-clockwise triangle is walkable while reversed winding is not accepted as the same walkable surface, and prove that provider refs/polygon refs do not appear in canonical JSON. It must prove at least two locked Capability Envelopes map deterministically without reading any external Subject/Profile value. Canonical changes always change the Envelope hash, but quantization-equivalent inputs may intentionally map to the same voxel parameters; mapping tests therefore prove that crossing a voxel boundary changes the mapped value and that the effective eroded radius in meters is always greater than or equal to `capsuleRadiusMeters + clearanceMarginMeters`.

Lifecycle is frozen to one process-level idempotent `init()` Promise because 0.43.1 exposes no global shutdown and documents repeated `init()` as immediate. All provider build/query operations share one package-owned asynchronous mutex. Each operation follows the exact ownership table in the lifecycle ADR; no test or production path destroys global WASM. Before applying either patch, pack the unpatched plane fixture output as Float32 positions plus Int32 indices and commit its SHA-256 golden. The core patch closes grid/data result holders and the build-context implementation handle. The generator patch closes input arrays, configs/parameters, temporary owned arrays and view shells, tile-data wrapper transfer, remove-tile receipts, retained intermediates, and partial/empty/failure/throw paths. A returned retained result transfers only NavMesh, build context, chunky mesh, and tile intermediates to SDK cleanup. Instrumented real-WASM tests observe arrays once through inner `Raw.destroy`, separately observe NavMesh/build-context destruction and all five `Raw.Recast.free*` functions, key returned SDK-owned pointers through `Raw.Module.getPointer`, and treat reused temporary addresses as new lifetimes. The empty fixture uses two `8 x 8` grid islands (128 triangles each) at `x=0..4m` and `x=24..28m`; with the frozen 128-triangle chunk limit, tests prove the two leaf AABBs do not overlap the middle tile's expanded `x=8.7..20.1m` query rectangle, then prove tile `x=1` has no compact/polygon data and no tile-add call. Separate tests inject a later `Raw.Recast.createHeightfield` failure and a `NavMesh.prototype.addTile` throw after one successful transfer. They must prove no double-free, no generator destruction of returned SDK-owned objects, exactly-once SDK cleanup, repeated/concurrent safety, and the same packed-output hash after patching. Patch-identity tests bind root patch declarations, lockfile versions/integrities/patch entries, patch bytes, installed patched bytes, and the Adapter manifest/hash.

If any provider acceptance assertion fails, stop this plan and write a short ADR under `docs/reviews/`; do not silently ship a second custom graph dialect.

- [ ] **Step 8: Run focused gates**

Run:

```bash
pnpm vitest run packages/traversal/src/profile-registry.test.ts packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-budget.test.ts packages/traversal/src/graph-contract.test.ts packages/runtime-babylon/src/traversal-implementation-identity.test.ts packages/traversal-recast/src/adapter-identity.test.ts packages/traversal-recast/src/provider-patch-identity.test.ts packages/traversal-recast/src/recast-config.test.ts packages/traversal-recast/src/provider-lifecycle.test.ts packages/traversal-recast/src/provider-acceptance.test.ts
pnpm typecheck
pnpm verify:route-r0-contract
```

Expected: PASS. Also run dependency/grep guards proving `packages/traversal` does not import `@whitebox-world/validation` or `recast-navigation`, does not expose Validation threshold names, and `traversal-recast` public exports do not expose Recast config/WASM/handle types.

---

### Task 3: Build the Locked Heightfield Traversal Source

**Files:**
- Create: `packages/traversal/src/build-input.ts`
- Create: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `packages/terrain-surface/src/index.ts`
- Create: `packages/terrain-surface/src/triangle-heightfield.test.ts`
- Create: `packages/traversal-recast/src/heightfield-source.ts`
- Create: `packages/traversal-recast/src/heightfield-source.test.ts`
- Modify: `packages/traversal-recast/package.json`

**Interfaces:**
- `@whitebox-world/traversal` produces provider-neutral strict `HeightfieldRouteBuildInputV1`, `StaticBlockingColliderV1`, `RouteHardRibbonV1`, and `assertHeightfieldRouteBuildInputV1()` without importing Runtime Contracts.
- `@whitebox-world/traversal-recast` produces `createHeightfieldRouteBuildInputV1()` from `ExecutionPlanV5` plus one already-derived `TraversalCapabilityEnvelopeV1`; it declares `@whitebox-world/runtime-contracts`, `@whitebox-world/terrain-surface`, and `@whitebox-world/traversal` as direct dependencies. It never accepts raw Subject/Profile records or recompiles the Envelope.
- The input contains the exact hashes required by `TraversalGraphV1`, the V5 connectivity row, locked subject/capsule/physics limits, the compiled Heightfield surface identity, blocked water boundaries, and collision-enabled static primitive geometry.
- `@whitebox-world/terrain-surface` exports one deterministic canonical vertex/index emitter plus sampling over those exact triangles. Render, V5 Mesh collision, slope, Graph, and evidence consume that shared output; matching diagonals implemented by duplicated loops are not accepted as common topology.

- [ ] **Step 1: Write RED source-assembly tests**

Cover:

- asymmetric 2x2 saddle orientation;
- canonical triangle bytes shared by the render-consumable terrain mesh payload, terrain sampling, V5 collision input, and Graph input;
- rotated/scaled box blocker from `ExecutionStaticColliderV1`;
- conservative sphere/cylinder deterministic tessellation against analytic Babylon/Havok shapes, including a cone visual already locked as the Runtime's cylinder collider;
- `collisionEnabled:false` exclusion;
- blocked water exclusion and `swimmable` rejection for the R1 ground profile;
- source hash changes for terrain/collider/surface changes;
- route/anchor/profile missing diagnostics;
- no Babylon mesh, visual bounds, file path, or provider ref in the build input.

- [ ] **Step 2: Run the RED source test**

Run: `pnpm vitest run packages/traversal/src/build-input.test.ts packages/traversal-recast/src/heightfield-source.test.ts`

Expected: FAIL because the build source does not exist.

- [ ] **Step 3: Implement deterministic locked input assembly**

Use ExecutionPlan V5 only. Generate collision triangle soup from `ExecutionStaticColliderV1`, not rendered meshes, visual primitives, or AABBs. Primitive tessellation must be conservative relative to the analytic Runtime collider: Graph construction may reject marginal clearance, but it may not approve a path that the larger analytic collider blocks. Crop/resample Heightfield triangles conservatively to the `hard-ribbon`; Recast erosion then applies the locked capsule radius plus builder clearance margin. Points outside the ribbon may never become walkable just because the global terrain is connected.

- [ ] **Step 4: Add input budget checks**

Reject non-finite values and call the Task 2 `assertTraversalGraphBuildBudgetV1()` guard before WASM allocation; do not duplicate its integer-micrometer tile estimate. Stop when source triangle/tile estimates exceed the locked builder profile and return stable structured failure data for `ROUTE_GRAPH_BUDGET_EXCEEDED`.

- [ ] **Step 5: Run focused gates**

Run:

```bash
pnpm vitest run packages/terrain-surface/src/triangle-heightfield.test.ts packages/traversal/src/build-input.test.ts packages/traversal-recast/src/heightfield-source.test.ts
pnpm typecheck
```

Expected: PASS.

---

### Task 4: Build and Query Canonical Traversal Graph Evidence

**Files:**
- Create: `packages/traversal/src/path-receipt.ts`
- Create: `packages/traversal/src/path-receipt.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/traversal-recast/src/build-graph.ts`
- Create: `packages/traversal-recast/src/build-graph.test.ts`
- Create: `packages/traversal-recast/src/query-route.ts`
- Create: `packages/traversal-recast/src/query-route.test.ts`
- Modify: `packages/traversal-recast/src/index.ts`

**Interfaces:**
- Produces strict `RoutePathReceiptV1`, `RouteConnectivityFailureV1`, `buildHeightfieldTraversalGraphV1()`, and `queryRequiredRouteV1()`.
- `RoutePathReceiptV1` includes Route/Subject/Anchor IDs, graph hash, lock hash, ordered canonical node IDs/positions, distance, dimensionless cost, observed slope/step/clearance/gap metrics, completion status, and stable diagnostics.

- [ ] **Step 1: Write RED graph/query tests**

Required fixtures:

- continuous flat/slope route passes;
- static wall across the ribbon is unreachable;
- a global detour outside the ribbon remains unreachable;
- slope above the locked maximum fails;
- corridor narrower than locked capsule clearance fails;
- low overhead collider fails;
- blocked water/trench disconnects the route;
- start/destination surface miss fails;
- maximum node/edge/tile/search budget fails closed;
- repeated and concurrent builds produce identical graph/path hashes;
- changing the `resolvedTraversalLockHash` blocks query before provider execution;
- serialized graph/path bytes contain no Recast polygon or tile refs.

- [ ] **Step 2: Run the RED graph/query tests**

Run: `pnpm vitest run packages/traversal-recast/src/build-graph.test.ts packages/traversal-recast/src/query-route.test.ts packages/traversal/src/path-receipt.test.ts`

Expected: FAIL because builder/query/receipt code is absent.

- [ ] **Step 3: Implement Recast build and canonical projection**

Initialize the provider once per builder lifecycle and always destroy owned WASM objects in reverse order, including partial construction and thrown-query paths. Set walkable radius/height/climb/slope only by mapping the `TraversalCapabilityEnvelopeV1` embedded in the locked Build Input; do not reread the lock or Graph Builder Profile here. Convert provider polygons/adjacency into stable, sorted `TraversalNodeV1` / `TraversalEdgeV1` IDs using canonical positions and surface identity; provider refs remain local lookup keys only.

- [ ] **Step 4: Implement deterministic route query**

Use the provider query internally, but calculate the published `routePathCost` with the frozen SDK formula and graph profile weights. Treat partial paths as unreachable. Validate every returned point/segment against the hard-ribbon and the same surface identity before publishing the receipt.

- [ ] **Step 5: Implement diagnostic projection**

Map provider/build failures to the frozen Route diagnostic vocabulary. Do not publish provider error strings as stable codes. Include actual location, observed value, expected lock value, unit, evidence IDs, and a concrete fix suggestion.

- [ ] **Step 6: Run focused and leak-adversarial gates**

Run:

```bash
pnpm vitest run packages/traversal/src/path-receipt.test.ts packages/traversal-recast/src/build-graph.test.ts packages/traversal-recast/src/query-route.test.ts
pnpm typecheck
```

Expected: PASS, including repeated construction/disposal and throwing cleanup.

---

### Task 5: Expose Single-Source Character Support Evidence

**Files:**
- Create: `packages/traversal/src/runtime-evidence.ts`
- Create: `packages/traversal/src/runtime-evidence.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `packages/runtime-babylon/package.json`
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/terrain.ts`
- Create: `packages/runtime-babylon/src/traversal-runtime-port.ts`
- Create: `packages/runtime-babylon/src/traversal-runtime-port.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `CharacterSupportEvidenceV1`, `TraversalRuntimeTickEvidenceV1`, `TraversalRuntimePortV1`, and `createBabylonTraversalRuntimePortV1()`.
- Raw support is exactly `supported | sliding | unsupported` plus normal and dynamic-surface flag from the single Character Controller sample.
- The R1 surface classifier is evidence-only and returns `resolved | unsupported | unmatched | ambiguous`; surface IDs are absent when no surface is resolved.
- Babylon Runtime accepts `ExecutionPlanV4 | ExecutionPlanV5`; V5 static bodies are created only from `ExecutionPlanV5.staticColliders`, while existing V4 fixtures retain their current compatibility projection.
- The V5 terrain body uses `PhysicsShapeMesh` over the exact compiled Heightfield triangle topology. V4 retains its current square-HeightField/rectangular-Mesh compatibility path and is covered by unchanged fixtures.
- Camera and Subject Visual consumers are widened only to the explicit `ExecutionPlanV4 | ExecutionPlanV5` union (or a named common read-only projection); they must not accept arbitrary plan-shaped objects or fork behavior by duplicating camera/visual logic.
- `@whitebox-world/runtime-babylon` uses the immutable `TraversalRuntimeImplementationIdentityV1` value already frozen and exported in Task 2; Task 5 does not redefine its manifests, hashes, Ref, or version. Neither Compiler, CLI, tests, nor Recast may substitute fixture hashes.

- [ ] **Step 1: Write a RED call-count regression**

Spy on `PhysicsCharacterController.checkSupport()` for constructor/reset and every probe tick. After setup, each simulated tick must add exactly one call regardless of supported/sliding/unsupported state. The probe evidence must contain the raw state from that call.

- [ ] **Step 2: Write RED evidence-ownership tests**

Prove:

- `MotionKernelRuntimeV1.publishResolvedState()` retains a read-only copy of the same support sample it resolves;
- reading evidence does not call physics;
- evidence classification cannot mutate `movementMedium`;
- supported terrain resolves the compiled Heightfield surface identity;
- support classification starts from the retained Character Controller sample and then correlates controller bottom/contact normal to the compiled surface/collider index within a conservative contact band; terrain sampling alone can never produce `resolved`;
- zero candidate surfaces returns `unmatched`, more than one returns `ambiguous`, and neither status satisfies expected-surface validation;
- supported contact that does not match the R1 surface reports `unmatched`, not fake terrain support;
- V5 Runtime and Graph input consume byte-identical static collider rows, including the current cone-visual-to-cylinder-collider mapping;
- V5 creates exactly one physics body for each `staticColliders` row and never creates a second body from `objects[].collisionEnabled`; V4 continues to derive its compatibility bodies from objects;
- unsupported ticks publish no surface IDs;
- `SLIDING` remains distinct;
- reset/rebind clears old evidence.

- [ ] **Step 3: Run the RED runtime evidence tests**

Run: `pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/p15-conformance.test.ts`

Expected: FAIL because the port/evidence seam is absent.

- [ ] **Step 4: Retain the single support sample**

Add an internal immutable support evidence field at the point where `publishResolvedState()` consumes `CharacterSurfaceInfo`. Expose it through `SubjectController` and the dedicated traversal runtime port only. Do not add raw Havok data to `WorldRuntimeSnapshotV3` and do not add a second public ground owner.

Branch physics construction explicitly by execution-plan `schemaVersion`. V4 continues deriving compatibility bodies from `objects`; V5 still uses `objects` for visuals but creates static physics bodies only from `staticColliders`, never both. Create both the V5 rendered terrain mesh and its collision body from the canonical triangle emitter in `@whitebox-world/terrain-surface`. Add an asymmetric saddle regression that distinguishes the two possible cell diagonals across rendered mesh, `PhysicsShapeMesh`, sampling, and Graph input, plus a body-count regression that detects duplicate V5 collision. Keep V4 behavior isolated and tested; do not let the Graph Builder reverse-engineer V4 visual objects.

- [ ] **Step 5: Add trusted reset-to-start and canonical walk intent**

The runtime port may reset the controlled subject to the explicit start Anchor before tick 0 and may submit a unit world-XZ walk direction per fixed tick. That intent is a canonical planar-vector Motion Kernel command and must not pass through camera-relative browser input compilation. It must reuse the existing Motion Kernel, Control Feel speed, Physics Body step/slope, animation, physics step, and cleanup paths. It must not accept speed, jump, gravity, step, slope, or capsule overrides.

Refactor the fixed-tick loop once so Browser input and traversal intent share the same post-command physics/visual/camera commit path; do not duplicate a second simulation loop. Add a regression proving identical world-XZ intent and fixed ticks produce identical Probe evidence under different camera yaw values.

- [ ] **Step 6: Run the deep runtime regression set**

Run:

```bash
pnpm vitest run packages/runtime-babylon/src/traversal-implementation-identity.test.ts packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/p15-conformance.test.ts packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts packages/runtime-babylon/src/runtime.test.ts
pnpm typecheck
```

Expected: PASS. Review against `docs/reviews/runtime-deep-review-checklist.md` before continuing.

---

### Task 6: Implement the Fixed-Tick Route Driver and Runtime Probe Receipt

**Files:**
- Create: `packages/traversal/src/runtime-probe-contract.ts`
- Create: `packages/traversal/src/runtime-probe-contract.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/validation/src/route-runtime-probe.ts`
- Create: `packages/validation/src/route-runtime-probe.test.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `scripts/lib/route-runtime-probe.integration.test.ts`

**Interfaces:**
- Produces `RouteRuntimeProbeRequestV1`, `RouteRuntimeProbeReceiptV1`, `RouteRuntimeProbeTickV1`, and `runRouteRuntimeProbeV1()`.
- Receipt/request contracts stay provider-neutral in `@whitebox-world/traversal`. The runner lives in `@whitebox-world/validation`, which already owns `RouteRuntimeGateThresholdsV1`; this avoids a Traversal → Validation dependency cycle and prevents threshold copies.
- `@whitebox-world/traversal` declares only the closed provider-neutral request/receipt/tick and Runtime Port shapes. `@whitebox-world/validation` owns the executable driver, all progress/counter state, and every arrival/deviation/stall/support-loss/timeout threshold. The driver consumes only Path receipt, resolved Driver Profile, the Runtime Port, and the Validation Profile; it cannot declare or override thresholds.

- [ ] **Step 1: Write RED provider-neutral receipt/port contract tests**

In `packages/traversal/src/runtime-probe-contract.test.ts`, cover only closed request/receipt/tick/Runtime Port shape, immutable canonicalization, lock mismatch before any reset/tick 0, invalid numeric rejection, provider-ID rejection, and the absence of Validation thresholds/counters. Do not put lookahead, progress, stall, deviation, unsupported-duration, arrival, or timeout constants in this package or test.

In `packages/validation/src/route-runtime-probe.test.ts`, use a fake Runtime Port to cover lookahead/corner choice, intent quantization, no run/jump requests, destination completion, stall/deviation timeout, consecutive unsupported counting, `SLIDING` handling, and invalid runtime evidence. Every threshold/counter assertion comes from `ValidationProfileV2.routeRuntimeGateThresholds`.

- [ ] **Step 2: Run the RED driver test**

Run: `pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts`

Expected: FAIL because the runner/receipt is absent.

- [ ] **Step 3: Implement the engine-neutral fixed-tick driver**

For each tick, choose the next visible path segment using the locked Driver Profile, quantize only the unit intent direction, call one Runtime Port tick, then compute progress/deviation/stall counters using `ValidationProfileV2.routeRuntimeGateThresholds`. Record the original runtime evidence and derived progress separately. A package dependency/grep test must prove `@whitebox-world/traversal` neither imports Validation nor declares those thresholds/counters.

- [ ] **Step 4: Write RED real Babylon/Havok tests**

Required cases:

- continuous Heightfield route completes without teleport;
- wall/stall fails even if graph evidence was forged as passed in the test;
- first supported tick followed by fall records support loss;
- wrong/unmatched support surface fails;
- 30/60/120 Hz-like render calls around the same fixed ticks produce identical receipt hash and final state;
- reset after pass/fail restores subject/listener/body/resource counts;
- two consecutive and two concurrent runtimes remain isolated.

- [ ] **Step 5: Run real Runtime tests**

Run:

```bash
pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts scripts/lib/route-runtime-probe.integration.test.ts
pnpm typecheck
```

Expected: PASS.

---

### Task 7: Evaluate Both Blocking Route Gates in Validation Report V2

**Files:**
- Create: `packages/validation/src/route-evaluator.ts`
- Create: `packages/validation/src/route-evaluator.test.ts`
- Modify: `packages/validation/src/index.ts`
- Modify: `packages/validation/src/validate-v2.ts`
- Modify: `packages/validation/src/validation.test.ts`

**Interfaces:**
- Produces `createRouteValidationReportV2()` from V5 world identity, Graph, Path, Probe, Lock, Profile, and evidence bytes.
- Produces only the existing `route-connectivity` and `route-runtime-conformance` gates inside `ValidationReportV2`; no Route-only report is introduced.

- [ ] **Step 1: Write RED report tests**

Prove:

- Graph + Path evidence can pass only `route-connectivity`;
- missing Probe evidence makes runtime gate/report `incomplete`, never `passed`;
- Graph pass + Runtime fail makes the report fail while preserving Graph evidence;
- different Graph/Probe lock hashes fail before evaluation;
- every evaluated metric references the required evidence kind;
- thresholds for slope/step/clearance/gap come from the lock, while progress/stall/deviation/timeout thresholds come from the Validation Profile;
- stable diagnostics include Route, Subject, Anchors, surface/collider IDs where known, position, unit, expected/actual values, evidence ref, and suggested fix;
- report hash is stable under input-map reorder.

- [ ] **Step 2: Run the RED report test**

Run: `pnpm vitest run packages/validation/src/route-evaluator.test.ts packages/validation/src/validation.test.ts`

Expected: FAIL because the evaluator is absent.

- [ ] **Step 3: Implement evidence assembly and gate evaluation**

Use canonical `artifact://route/<routeId>/...` refs. Hash and size the actual canonical Graph/Path/Probe/Overlay bytes before constructing Evidence rows. Do not infer a passed metric when its evidence is absent or malformed. Update V2 evidence validation to use the exact version-dispatching Graph Builder Profile resolver created in Task 2; a V2 profile must not bypass Registry ref/version/hash checks.

- [ ] **Step 4: Run focused gates**

Run:

```bash
pnpm vitest run packages/validation/src/route-evaluator.test.ts packages/validation/src/validation.test.ts
pnpm verify:route-r0-contract
pnpm typecheck
```

Expected: PASS.

---

### Task 8: Add `worldkit verify route` and Read-Only Browser Evidence

**Files:**
- Create: `scripts/lib/route-validation-cli.ts`
- Create: `scripts/lib/route-validation-cli.test.ts`
- Modify: `scripts/lib/validation-cli.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/02-sdk-architecture.md`
- Modify: `docs/05-mvp-roadmap.md`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**CLI:**

```text
worldkit verify route <world.json> \
  --profile worldkit://validation-profile/outdoor-world-package-dev@1 \
  --output <validation-report.json> [--json]
```

**Interfaces:**
- CLI writes the report without replacing an existing file and writes canonical evidence to a sibling `<report-name>.evidence/` directory using a temporary directory plus atomic rename.
- `worldkit verify explain` dispatches V1/V2 by `schemaVersion` and explains either Route gate.
- Browser introduces `WORLDKIT_BROWSER_PROTOCOL_VERSION = 4` and a complete `WorldkitBrowserApiV4` successor containing every V3 method, with unchanged control/capture/reset semantics, plus read-only getters for Route summary, Path receipt, Probe receipt, and overlay data. Route evidence is additive to the complete protocol, not a route-only replacement interface. Because the protocol is unreleased, update host wiring, CLI/Playwright consumers, canonical verification, docs, examples, and generated/public types in the same clean-break slice; do not retain a parallel V3 alias on `window.__WORLDKIT__`. A contract test enumerates the V3 method set and proves that V4 loses none of it before checking the new getters. It does not expose graph building, arbitrary queries, provider handles, or mutable validation thresholds.

- [ ] **Step 1: Write RED CLI parser and failure tests**

Cover missing/duplicate options, unsupported profile, V3 input, existing output, partial evidence-write cleanup, exit codes (`0 passed`, `2 failed`, `3 incomplete`, `1 infrastructure`), and JSON/non-JSON diagnostics.

- [ ] **Step 2: Run the RED CLI tests**

Run: `pnpm vitest run scripts/lib/route-validation-cli.test.ts`

Expected: FAIL because the command is absent.

- [ ] **Step 3: Implement the CLI orchestration**

The command must run the V4/V5 pipeline, obtain the trusted implementation identity exported by `@whitebox-world/runtime-babylon`, and compile exactly one lock receipt per required connectivity row. It then resolves the locked Graph Builder Profile, joins that profile with the receipt exactly once through `createTraversalCapabilityEnvelopeV1()`, and passes the resulting Envelope to `createHeightfieldRouteBuildInputV1()`. Graph/query, Runtime probe, and Validation receive the same unchanged lock receipt; none may reconstruct the lock or reread capability geometry from Registry resources. The command creates a real Babylon/Havok runtime using the same `BabylonWorldRuntime.create()` path with `NullEngine`, runs the probe, disposes all resources, and finally builds the unified report. Infrastructure exceptions never become gameplay diagnostics. Because root scripts import `@whitebox-world/traversal-recast` and `@whitebox-world/runtime-babylon`, declare both as direct root workspace dependencies.

- [ ] **Step 4: Write RED Browser Protocol tests**

Prove that the browser fields use the same canonical names as CLI artifacts, return immutable data, hide provider IDs, are unavailable before evidence is loaded, and cannot initiate build/query/probe work. Also prove that every V3 control, capture, pause, screenshot, reset, and capability-discovery method remains available with unchanged behavior after the V4 version bump.

- [ ] **Step 5: Implement the read-only Browser projection**

Implement the complete `WorldkitBrowserApiV4` and update host wiring, CLI/Playwright consumers, canonical verification, docs/examples, and generated/public types atomically. Do not add optional aliases to V3. The trusted host may inject already-created Route evidence; page scripts may only inspect/overlay it.

- [ ] **Step 6: Run focused gates**

Run:

```bash
pnpm vitest run scripts/lib/route-validation-cli.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm typecheck
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Expected: PASS.

---

### Task 9: Add the R1 Golden/Adversarial Fixture Matrix

**Files:**
- Create: `examples/traversal/r1-heightfield/success.json`
- Create: `examples/traversal/r1-heightfield/fail-wall.json`
- Create: `examples/traversal/r1-heightfield/fail-slope.json`
- Create: `examples/traversal/r1-heightfield/fail-width.json`
- Create: `examples/traversal/r1-heightfield/fail-overhead.json`
- Create: `examples/traversal/r1-heightfield/fail-water.json`
- Create: `examples/traversal/r1-heightfield/fail-gap.json`
- Create: `examples/traversal/r1-heightfield/fail-start-support.json`
- Create: `examples/traversal/r1-heightfield/fail-start-surface.json`
- Create: `examples/traversal/r1-heightfield/fail-budget.json`
- Create: `examples/traversal/r1-heightfield/fail-outside-detour.json`
- Create: `scripts/verify-route-r1-heightfield.ts`
- Modify: `package.json`

**Gate:** `pnpm verify:route-r1-heightfield`

- [ ] **Step 1: Create fixtures through Canonical Authoring V4**

Every fixture must use the actual Authoring Normalizer, Compiler, Graph Builder, Runtime, and Validation evaluator. No test may begin from a hand-written Execution Plan, Graph, or Report.

The success world uses the capability-driven primitive `worldkit://subject-definition/humanoid.third-person@1`, so the gate has a complete Resource Lock without depending on a product GLB. It has one explicit Spawn Anchor, Goal Anchor, Route, `connected-by-route`, deterministic seed, locked profile, and static obstacle arrangement that proves in-ribbon navigation rather than a straight unobstructed line. Its Route is first authored as the current `OutdoorWorldSpec.PlannedRoute`, projected through the existing `projectPlannedRouteToCanonicalRouteV1()`, inserted into Authoring V4, and then passed through the same Normalizer/Compiler/Graph/Probe/Validation path. The verifier must assert that planner-only `priority`, `maximumDesignSlopeDegrees`, and `evidence` never enter Canonical Route bytes; this closes the current Agent whitebox entry without making planning slope evidence a gameplay authority.

- [ ] **Step 2: Implement the R1 verification script**

The script must assert expected exit/status/diagnostic for each fixture according to this closed oracle table, compare repeat/concurrent hashes, run the success fixture under 30/60/120 Hz-like render schedules, and assert no provider ID appears in evidence:

| Fixture | Required status / primary diagnostic |
| --- | --- |
| `success` | both Route gates `passed`; no error diagnostic |
| `fail-wall` | `failed` / `ROUTE_REQUIRED_PATH_UNREACHABLE` |
| `fail-slope` | `failed` / `ROUTE_SLOPE_EXCEEDED` |
| `fail-width` | `failed` / `ROUTE_CLEARANCE_WIDTH_INSUFFICIENT` |
| `fail-overhead` | `failed` / `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT` |
| `fail-water` | `failed` / `ROUTE_REQUIRED_PATH_UNREACHABLE`, with structured evidence naming the blocked Water entity rather than a new provider-specific code |
| `fail-gap` | `failed` / `ROUTE_SURFACE_GAP_EXCEEDED`; a non-water trench/excluded walkable interval separates the two walkable Heightfield regions, not a fabricated hole in the collision mesh |
| `fail-start-support` | `failed` / `ROUTE_START_SUPPORT_INVALID` |
| `fail-start-surface` | `failed` / `ROUTE_START_SURFACE_NOT_FOUND` |
| `fail-budget` | `incomplete` / `ROUTE_GRAPH_BUDGET_EXCEEDED` |
| `fail-outside-detour` | `failed` / `ROUTE_REQUIRED_PATH_UNREACHABLE` |

`fail-start-support` proves the controller is physically unsupported; `fail-start-surface` separately proves supported-but-unmatched/ambiguous surface identity is rejected. The orchestration/integration matrix must also inject and reject lock mismatch, Graph-pass/Runtime-stall, support loss, route deviation, missing Probe evidence, and at least two locked Capability Envelopes at Backend-coupling slope/clearance boundaries; these fault cases need not be separate Authoring JSON when their trigger is an evidence/orchestration fault, but they must enter the same blocking verification gate. In R1, `fail-water` and `fail-gap` are distinct Heightfield exclusion cases; collider seams and terrain-to-platform gaps remain mandatory R1b fixtures rather than being simulated as Heightfield-only support.

- [ ] **Step 3: Register and run the new gate**

Add:

```json
"verify:route-r1-heightfield": "tsx scripts/verify-route-r1-heightfield.ts"
```

Run: `pnpm verify:route-r1-heightfield`

Expected: PASS with one dual-gate success and every failure fixture rejected by its expected blocking diagnostic.

- [ ] **Step 4: Prove R0 remains frozen**

Run: `pnpm verify:route-r0-contract`

Expected: PASS without refreezing R0 fixtures.

---

### Task 10: Full Verification, Review, and R1 Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `scripts/verify-canonical-world.ts`
- Create: `docs/reviews/2026-08-22-route-r1-heightfield-runtime-review.md`

- [ ] **Step 1: Run all mandatory gates**

Run:

```bash
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass. The existing large-chunk build warning may be recorded but cannot hide a new chunk or WASM regression; compare output before disposition.

- [ ] **Step 2: Perform a full-dimension runtime review**

Use both:

- `docs/reviews/full-dimension-review-protocol.md`
- `docs/reviews/runtime-deep-review-checklist.md`

The review must explicitly cover authority ownership, Babylon 9.21.2 `CharacterSurfaceInfo` limitations, one-`checkSupport()` evidence, unmatched/ambiguous surface classification, V5 collision-body uniqueness, shared triangle bytes, Backend/Recast coupling acceptance, provider cleanup, fixed/render time separation, reset/rebind, 30/60/120 cadence, lock equality, provider-ID redaction, deterministic bytes, Browser V4 clean-break conformance, failure fixtures, and Graph-pass/Runtime-fail behavior.

- [ ] **Step 3: Update status truthfully**

Mark R1 complete only when both blocking gates pass for the success fixture and all adversarial fixtures fail as expected. Keep M5 open and R1b pending. Link the R1 review and this plan from the spec, backlog, and README.

- [ ] **Step 4: Commit by semantic slice**

Do not produce one giant commit. Use reviewable commits in this order:

1. `feat: project route connectivity into execution plan v5`
2. `feat: build canonical heightfield traversal graphs`
3. `feat: record single-source traversal runtime evidence`
4. `feat: verify route runtime conformance`
5. `test: add route r1 heightfield conformance gate`
6. `docs: record route r1 heightfield disposition`

- [ ] **Step 5: Prepare the R1b plan**

After R1 is merged and verified, write a separate R1b implementation plan for explicit static Traversal Surfaces, terrain-to-step-to-platform, `0.25m` pass / `0.35m` fail under the locked `0.3m` step profile, multi-surface identity, seam/gap behavior, and wrong Collider/Surface evidence. Do not add those implementations to this R1 branch.

## Completion Review

- [ ] Authoring V4 connectivity flows through `NormalizedWorldIRV4` and `ExecutionPlanV5`; there is no V4 sidecar next to a V3 plan.
- [ ] AI-facing fields remain Route/Anchor/Subject intent only; no NavMesh or provider configuration leaks into Schema.
- [ ] Graph Builder/Driver/Validation/Subject ownership is unchanged from the frozen spec.
- [ ] Graph and Runtime evidence share an identical `resolvedTraversalLockHash`.
- [ ] Recast/Detour is isolated behind `@whitebox-world/traversal-recast` and absent from canonical bytes.
- [ ] Static collision input comes from authoritative locked primitives, not visual/AABB bounds.
- [ ] `hard-ribbon` is enforced even when a global outside detour exists.
- [ ] One compiler-owned lock receipt is passed unchanged to Graph, query, Runtime probe, and Validation; no consumer reconstructs a lock.
- [ ] The provider-neutral Capability Envelope is the only Recast parameter source and contains no Validation/Driver/Provider fields.
- [ ] Every runtime tick consumes one and only one Character Controller support sample.
- [ ] Heightfield evidence classification never changes Ground/Air or physics.
- [ ] V5 render, sampling, collision, Graph, and evidence share one tested Heightfield triangle diagonal; V4 compatibility remains unchanged.
- [ ] World-XZ probe results are invariant under camera yaw.
- [ ] The real Babylon/Havok controller reaches the success destination without teleport or parameter override.
- [ ] Graph pass alone cannot pass the runtime gate.
- [ ] `SLIDING`, `UNSUPPORTED`, wrong surface, stall, deviation, invalid numbers, reset, rebind, and cleanup have adversarial coverage.
- [ ] 30/60/120 Hz-like render schedules yield identical fixed-tick receipt/final-state hashes.
- [ ] CLI, Browser, Validation, examples, and generated/public types use the same canonical names.
- [ ] R0, canonical, placement, rigged-subject, G Bot, typecheck, full tests, and build remain green.
- [ ] M5 remains open until the separately planned R1b static-platform slice passes.
