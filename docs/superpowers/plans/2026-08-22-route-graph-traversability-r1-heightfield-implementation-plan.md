# Route Graph / Traversability R1 Heightfield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first production M5 slice in which a locked humanoid can be proven to travel from an explicit start Anchor to an explicit destination Anchor inside a `hard-ribbon` Heightfield Route, with both a deterministic graph/query gate and a real fixed-tick Babylon/Havok Character Controller gate.

**Architecture:** Authoring V4 is promoted through a versioned `NormalizedWorldIRV4` and `ExecutionPlanV5`; it is not interpreted as a sidecar beside the V3 runtime pipeline. `ExecutionPlanV5.traversal` owns the compiled Heightfield Traversal Surface identity and required connectivity rows. An engine-neutral `@whitebox-world/traversal` contract remains the canonical boundary, while a separate `@whitebox-world/traversal-recast` adapter uses the locked Heightfield, water exclusions, and authoritative static collider geometry to build/query a Recast/Detour NavMesh and project it into `TraversalGraphV1` and `RoutePathReceiptV1`. The real runtime probe drives the existing Babylon/Havok Character Controller with fixed-tick canonical walk intents; it records the already-consumed single `checkSupport()` sample and never performs a second grounding query. `@whitebox-world/validation` alone evaluates the two blocking Route gates and emits `ValidationReportV2`.

**Tech Stack:** TypeScript 5.9, Authoring JSON Schema 2020-12/AJV, canonical JSON + SHA-256, `recast-navigation` 0.43.1 behind an internal adapter, Babylon.js/Havok 9.21.2/1.3.14, NullEngine for headless runtime verification, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`

**Baseline:** PR #18 merge commit `2fb12e4c8dd852fb47b4fd657d3f5dfa4a3a62d1`; `pnpm verify:route-r0-contract`, `pnpm typecheck`, `pnpm test` (94 files / 848 tests), and `pnpm build` passed on `main` at `0b1af67` on 2026-08-22.

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
- Recast/Detour is an internal Graph Builder provider. Provider polygon/tile refs, WASM pointers, provider paths, and provider errors never enter canonical artifacts or Browser/CLI public fields.
- Recast agent radius, height, maximum climb, and maximum slope are derived from the same `resolvedTraversalLockHash` used by the Character Controller. No adapter-owned copy is permitted.
- The Graph Builder Profile owns voxel/tile/quantization/build-budget policy. It does not own Subject speed, acceleration, gravity, capsule, step, slope, validation thresholds, or runtime stop conditions.
- `route-connectivity` passing never implies `route-runtime-conformance` passing. Both are blocking for a required Route.
- Runtime simulation uses the existing fixed timestep. Rendering never advances the probe.
- Every simulated tick performs exactly one Character Controller `checkSupport()` call. The returned raw support state/normal is retained as evidence from that same call. Do not add a ray, AABB, terrain-height, NavMesh-height, or extra `checkSupport()` grounding path.
- Heightfield sampling may map an already-supported tick to a canonical R1 surface identity for evidence. It must not decide Ground/Air, jump eligibility, gravity, or Character Controller support.
- `SLIDING` is recorded as raw support and is not Support Loss. `UNSUPPORTED` is recorded from the first tick; only Validation Profile thresholds decide whether the run fails.
- Runtime probe setup may reset the subject to the explicit start Anchor. After tick 0, the probe must not teleport, disable collision, change step/slope, or skip graph corners.
- Tests and implementations use strict `===` / `!==`; null/undefined checks use `lodash-es` `isNil` where both values are intentionally accepted.
- Every runtime change follows `docs/reviews/runtime-deep-review-checklist.md`; every completed slice runs the relevant full-dimension review protocol.

---

### Task 1: Promote Authoring V4 Through Canonical IR and Execution Plan

**Files:**
- Modify: `packages/authoring/src/types-v4.ts`
- Create: `packages/authoring/src/normalize-v4.ts`
- Create: `packages/authoring/src/normalize-v4.test.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-contracts/package.json`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `scripts/lib/worldkit-pipeline.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `NormalizedConnectivityRequirementV1`, `NormalizedWorldIRV4`, `NormalizeAuthoringResultV4`, `normalizeAuthoringSpecV4()`, `ExecutionHeightfieldTraversalSurfaceV1`, `ExecutionStaticColliderV1`, `ExecutionConnectivityRequirementV1`, `ExecutionPlanV5`, `CompileWorldInputV5`, `CompileWorldResultV5`, `compileWorldV5()`, and `loadWorldkitRoutePipeline()`.
- `ExecutionPlanV5.traversal` contains exactly `surfaces` and `connectivityRequirements` in R1. `ExecutionPlanV5.staticColliders` is the separate locked collision authority shared by Graph Builder and Runtime; it is not inferred independently from visual meshes.
- The R1 Heightfield surface identity is compiler-derived from the locked terrain entity and content hashes; no Authoring duplicate is introduced.

- [ ] **Step 1: Write RED normalization tests**

Cover all of the following:

```ts
expect(normalizeAuthoringSpecV4(validV4).value).toMatchObject({
  kind: "worldkit-normalized-world",
  schemaVersion: 4,
  layout: {
    connectivityRequirements: [{
      constraintId: "hero-to-goal",
      type: "connected-by-route",
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

- [ ] **Step 2: Run the RED normalization test**

Run: `pnpm vitest run packages/authoring/src/normalize-v4.test.ts`

Expected: FAIL because `normalizeAuthoringSpecV4` and `NormalizedWorldIRV4` do not exist.

- [ ] **Step 3: Implement V4 normalization without duplicating the layout solver**

Implement an explicit V4-to-V3 placement projection for the existing solver, then wrap the solved V3 result with sorted connectivity requirements and recompute the V4 canonical hash. The inner V3 hash is an implementation detail and must not be returned as the V4 hash.

Do not mutate `NormalizedWorldIRV3`, do not add empty connectivity fields to it, and do not alias `normalizeAuthoringSpecV4` to the V3 function.

- [ ] **Step 4: Write RED compiler tests for `ExecutionPlanV5.traversal`**

The tests must prove:

- the connectivity row is carried from normalized V4 with unchanged role-qualified IDs;
- one deterministic Heightfield Traversal Surface is compiled;
- its three IDs are distinct and stable across reordered input;
- every collision-enabled static object has one deterministic `ExecutionStaticColliderV1` with a stable Collider Subshape ID;
- the current cone visual compiles to the same cylinder collider shape used by Babylon/Havok instead of inventing a cone-only Graph collider;
- `resourceHash` changes when height samples change;
- the execution plan hash includes connectivity and surface identity;
- no Recast/provider field exists in the plan.

- [ ] **Step 5: Implement `ExecutionPlanV5` and `compileWorldV5()`**

Use the existing V4 compiler core for shared world projection, then add the V5 traversal section, explicit static colliders, and recompute the plan hash. The derived Heightfield surface must use a stable package resource ref and a content hash over the canonical locked terrain/collider source. The Graph Builder consumes `staticColliders`; Task 5 changes Runtime V5 to consume the same rows. Visual object primitives remain rendering input only.

`ExecutionPlanV5` must reuse `TraversalSurfaceIdentityV1` from `@whitebox-world/traversal` through a declared direct dependency rather than copying a competing surface-identity shape.

- [ ] **Step 6: Add a route-specific pipeline entry**

`loadWorldkitRoutePipeline()` must require Authoring V4 and return `NormalizedWorldIRV4` plus `ExecutionPlanV5`. Existing `loadWorldkitPipeline()` remains the V3 runtime entry until a separately reviewed default-version migration; R1 must not silently reinterpret existing V3 worlds.

- [ ] **Step 7: Run focused and dependency gates**

Run:

```bash
pnpm vitest run packages/authoring/src/normalize-v4.test.ts packages/compiler/src/compile.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts
pnpm verify:route-r0-contract
pnpm typecheck
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
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/traversal-recast/package.json`
- Create: `packages/traversal-recast/src/adapter-identity.ts`
- Create: `packages/traversal-recast/src/adapter-identity.test.ts`
- Create: `packages/traversal-recast/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Adds `TraversalGraphBuilderProfileV2`, `ResolvedTraversalGraphBuilderProfileV2`, and a version-dispatching `resolveTraversalGraphBuilderProfile()` without mutating frozen V1.
- Built-in ref: `worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1`.
- V2 adds provider-neutral voxel/tile build policy required by a real builder: `voxelCellSizeMeters`, `voxelCellHeightMeters`, `tileSizeCells`, `maximumEdgeLengthMeters`, `maximumSimplificationErrorMeters`, and the existing quantization/cost/budget fields.
- `@whitebox-world/traversal-recast` owns the pinned provider dependency and conversion only; `@whitebox-world/traversal` stays provider-neutral.

- [ ] **Step 1: Write RED profile tests**

Prove that V2 accepts only its closed field set, rejects Subject/Validation values such as `capsuleRadiusMeters`, `maxSlopeDegrees`, `walkSpeedMetersPerSecond`, and `maximumProbeTicks`, and produces a stable Registry content hash.

- [ ] **Step 2: Run the RED profile test**

Run: `pnpm vitest run packages/traversal/src/profile-registry.test.ts`

Expected: FAIL because V2 resolution is absent.

- [ ] **Step 3: Implement V2 profile resolution**

Keep Subject geometry and motion values out of the profile. At build time those values are supplied only through `ResolvedTraversalLockV1`. Update Graph validation to resolve either the frozen V1 profile or the new V2 profile by exact resource ref/hash; do not weaken validation to accept arbitrary profiles.

- [ ] **Step 4: Add the isolated Recast package**

Declare `recast-navigation` `0.43.1` as a direct dependency of `@whitebox-world/traversal-recast`. Do not add it to the root or `runtime-babylon` package. Define an internal adapter identity/hash that is resolved by the profile implementation but never serialized into `TraversalGraphV1`.

- [ ] **Step 5: Add the provider acceptance test**

The test must initialize/destroy the WASM provider repeatedly, prove Node compatibility, prove a right-handed Y-up triangle is interpreted correctly, and prove that provider refs/polygon refs do not appear in canonical JSON.

If any provider acceptance assertion fails, stop this plan and write a short ADR under `docs/reviews/`; do not silently ship a second custom graph dialect.

- [ ] **Step 6: Run focused gates**

Run:

```bash
pnpm vitest run packages/traversal/src/profile-registry.test.ts packages/traversal/src/graph-contract.test.ts packages/traversal-recast/src/adapter-identity.test.ts
pnpm typecheck
```

Expected: PASS.

---

### Task 3: Build the Locked Heightfield Traversal Source

**Files:**
- Create: `packages/traversal/src/build-input.ts`
- Create: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/traversal-recast/src/heightfield-source.ts`
- Create: `packages/traversal-recast/src/heightfield-source.test.ts`
- Modify: `packages/traversal-recast/package.json`

**Interfaces:**
- `@whitebox-world/traversal` produces provider-neutral strict `HeightfieldRouteBuildInputV1`, `StaticBlockingColliderV1`, `RouteHardRibbonV1`, and `assertHeightfieldRouteBuildInputV1()` without importing Runtime Contracts.
- `@whitebox-world/traversal-recast` produces `createHeightfieldRouteBuildInputV1()` from `ExecutionPlanV5` plus `ResolvedTraversalLockReceiptV1`; it declares `@whitebox-world/runtime-contracts`, `@whitebox-world/terrain-surface`, and `@whitebox-world/traversal` as direct dependencies.
- The input contains the exact hashes required by `TraversalGraphV1`, the V5 connectivity row, locked subject/capsule/physics limits, the compiled Heightfield surface identity, blocked water boundaries, and collision-enabled static primitive geometry.
- Terrain height/normal sampling delegates to `@whitebox-world/terrain-surface` so render, collision, slope, graph, and evidence use the same triangle diagonal.

- [ ] **Step 1: Write RED source-assembly tests**

Cover:

- asymmetric 2x2 saddle orientation;
- rotated/scaled box blocker from `ExecutionStaticColliderV1`;
- sphere/cylinder deterministic tessellation, including a cone visual already locked as the Runtime's cylinder collider;
- `collisionEnabled:false` exclusion;
- blocked water exclusion and `swimmable` rejection for the R1 ground profile;
- source hash changes for terrain/collider/surface changes;
- route/anchor/profile missing diagnostics;
- no Babylon mesh, visual bounds, file path, or provider ref in the build input.

- [ ] **Step 2: Run the RED source test**

Run: `pnpm vitest run packages/traversal/src/build-input.test.ts packages/traversal-recast/src/heightfield-source.test.ts`

Expected: FAIL because the build source does not exist.

- [ ] **Step 3: Implement deterministic locked input assembly**

Use ExecutionPlan V5 only. Generate collision triangle soup from `ExecutionStaticColliderV1`, not rendered meshes, visual primitives, or AABBs. Crop/resample Heightfield triangles conservatively to the `hard-ribbon`; Recast erosion then applies the locked capsule radius plus builder clearance margin. Points outside the ribbon may never become walkable just because the global terrain is connected.

- [ ] **Step 4: Add input budget checks**

Reject non-finite values and stop before WASM allocation when source triangle/tile estimates exceed the locked builder profile. Return stable structured failure data for `ROUTE_GRAPH_BUDGET_EXCEEDED`.

- [ ] **Step 5: Run focused gates**

Run:

```bash
pnpm vitest run packages/traversal/src/build-input.test.ts packages/traversal-recast/src/heightfield-source.test.ts
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

Initialize the provider once per builder lifecycle and always destroy owned WASM objects in reverse order, including partial construction and thrown-query paths. Set walkable radius/height/climb/slope only from the resolved lock. Convert provider polygons/adjacency into stable, sorted `TraversalNodeV1` / `TraversalEdgeV1` IDs using canonical positions and surface identity; provider refs remain local lookup keys only.

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
- Create: `packages/runtime-babylon/src/traversal-runtime-port.ts`
- Create: `packages/runtime-babylon/src/traversal-runtime-port.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `CharacterSupportEvidenceV1`, `TraversalRuntimeTickEvidenceV1`, `TraversalRuntimePortV1`, and `createBabylonTraversalRuntimePortV1()`.
- Raw support is exactly `supported | sliding | unsupported` plus normal and dynamic-surface flag from the single Character Controller sample.
- The R1 surface classifier is evidence-only and returns `resolved | unsupported | unmatched | ambiguous`; surface IDs are absent when no surface is resolved.
- Babylon Runtime accepts `ExecutionPlanV4 | ExecutionPlanV5`; V5 static bodies are created only from `ExecutionPlanV5.staticColliders`, while existing V4 fixtures retain their current compatibility projection.

- [ ] **Step 1: Write a RED call-count regression**

Spy on `PhysicsCharacterController.checkSupport()` for constructor/reset and every probe tick. After setup, each simulated tick must add exactly one call regardless of supported/sliding/unsupported state. The probe evidence must contain the raw state from that call.

- [ ] **Step 2: Write RED evidence-ownership tests**

Prove:

- `MotionKernelRuntimeV1.publishResolvedState()` retains a read-only copy of the same support sample it resolves;
- reading evidence does not call physics;
- evidence classification cannot mutate `movementMedium`;
- supported terrain resolves the compiled Heightfield surface identity;
- supported contact that does not match the R1 surface reports `unmatched`, not fake terrain support;
- V5 Runtime and Graph input consume byte-identical static collider rows, including the current cone-visual-to-cylinder-collider mapping;
- unsupported ticks publish no surface IDs;
- `SLIDING` remains distinct;
- reset/rebind clears old evidence.

- [ ] **Step 3: Run the RED runtime evidence tests**

Run: `pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/p15-conformance.test.ts`

Expected: FAIL because the port/evidence seam is absent.

- [ ] **Step 4: Retain the single support sample**

Add an internal immutable support evidence field at the point where `publishResolvedState()` consumes `CharacterSurfaceInfo`. Expose it through `SubjectController` and the dedicated traversal runtime port only. Do not add raw Havok data to `WorldRuntimeSnapshotV3` and do not add a second public ground owner.

Make V5 static physics construction consume the compiled `staticColliders` rows. Keep V4 compatibility behavior isolated and tested; do not let the Graph Builder reverse-engineer V4 visual objects.

- [ ] **Step 5: Add trusted reset-to-start and canonical walk intent**

The runtime port may reset the controlled subject to the explicit start Anchor before tick 0 and may submit a unit world-XZ walk direction per fixed tick. It must reuse the existing Motion Kernel, Control Feel speed, Physics Body step/slope, animation, physics step, and cleanup paths. It must not accept speed, jump, gravity, step, slope, or capsule overrides.

Refactor the fixed-tick loop once so Browser input and traversal intent share the same physics/visual/camera commit path; do not duplicate a second simulation loop.

- [ ] **Step 6: Run the deep runtime regression set**

Run:

```bash
pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/p15-conformance.test.ts packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts packages/runtime-babylon/src/runtime.test.ts
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
- The driver consumes only Path receipt, resolved Driver Profile, the Runtime Port, and the Validation Profile. It cannot declare or override thresholds.

- [ ] **Step 1: Write RED driver-unit tests with a fake runtime port**

Cover lookahead/corner choice, intent quantization, no run/jump requests, destination completion, stall/deviation timeout, consecutive unsupported counting, `SLIDING` handling, invalid numeric detection, and lock mismatch before reset/tick 0.

- [ ] **Step 2: Run the RED driver test**

Run: `pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts`

Expected: FAIL because the runner/receipt is absent.

- [ ] **Step 3: Implement the engine-neutral fixed-tick driver**

For each tick, choose the next visible path segment using the locked Driver Profile, quantize only the unit intent direction, call one Runtime Port tick, then compute progress/deviation/stall counters using `ValidationProfileV2.routeRuntimeGateThresholds`. Record the original runtime evidence and derived progress separately.

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
- Browser exposes only getters for Route summary, Path receipt, Probe receipt, and overlay data. It does not expose graph building, arbitrary queries, provider handles, or mutable validation thresholds.

- [ ] **Step 1: Write RED CLI parser and failure tests**

Cover missing/duplicate options, unsupported profile, V3 input, existing output, partial evidence-write cleanup, exit codes (`0 passed`, `2 failed`, `3 incomplete`, `1 infrastructure`), and JSON/non-JSON diagnostics.

- [ ] **Step 2: Run the RED CLI tests**

Run: `pnpm vitest run scripts/lib/route-validation-cli.test.ts`

Expected: FAIL because the command is absent.

- [ ] **Step 3: Implement the CLI orchestration**

The command must run the V4/V5 pipeline, resolve one lock per required connectivity row, build/query the graph, create a real Babylon/Havok runtime using the same `BabylonWorldRuntime.create()` path with `NullEngine`, run the probe, dispose all resources, and finally build the unified report. Infrastructure exceptions never become gameplay diagnostics. Because root scripts import `@whitebox-world/traversal-recast` and `@whitebox-world/runtime-babylon`, declare both as direct root workspace dependencies.

- [ ] **Step 4: Write RED Browser Protocol tests**

Prove that the browser fields use the same canonical names as CLI artifacts, return immutable data, hide provider IDs, are unavailable before evidence is loaded, and cannot initiate build/query/probe work.

- [ ] **Step 5: Implement the read-only Browser projection**

Version the Browser Protocol cleanly if its public shape changes. Do not add optional aliases to the existing version. The trusted host may inject already-created Route evidence; page scripts may only inspect/overlay it.

- [ ] **Step 6: Run focused gates**

Run:

```bash
pnpm vitest run scripts/lib/route-validation-cli.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm typecheck
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
- Create: `examples/traversal/r1-heightfield/fail-water-gap.json`
- Create: `examples/traversal/r1-heightfield/fail-start-support.json`
- Create: `examples/traversal/r1-heightfield/fail-budget.json`
- Create: `scripts/verify-route-r1-heightfield.ts`
- Modify: `package.json`

**Gate:** `pnpm verify:route-r1-heightfield`

- [ ] **Step 1: Create fixtures through Canonical Authoring V4**

Every fixture must use the actual Authoring Normalizer, Compiler, Graph Builder, Runtime, and Validation evaluator. No test may begin from a hand-written Execution Plan, Graph, or Report.

The success world uses a primitive humanoid so the gate does not depend on a product GLB. It has one explicit Spawn Anchor, Goal Anchor, Route, `connected-by-route`, deterministic seed, locked profile, and static obstacle arrangement that proves in-ribbon navigation rather than a straight unobstructed line.

- [ ] **Step 2: Implement the R1 verification script**

The script must assert expected exit/status/diagnostic for each fixture, compare repeat/concurrent hashes, run the success fixture under 30/60/120 Hz-like render schedules, and assert no provider ID appears in evidence.

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

The review must explicitly cover authority ownership, Babylon 9.21.2 `CharacterSurfaceInfo` limitations, one-`checkSupport()` evidence, provider cleanup, fixed/render time separation, reset/rebind, 30/60/120 cadence, lock equality, provider-ID redaction, deterministic bytes, failure fixtures, and Graph-pass/Runtime-fail behavior.

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
- [ ] Every runtime tick consumes one and only one Character Controller support sample.
- [ ] Heightfield evidence classification never changes Ground/Air or physics.
- [ ] The real Babylon/Havok controller reaches the success destination without teleport or parameter override.
- [ ] Graph pass alone cannot pass the runtime gate.
- [ ] `SLIDING`, `UNSUPPORTED`, wrong surface, stall, deviation, invalid numbers, reset, rebind, and cleanup have adversarial coverage.
- [ ] 30/60/120 Hz-like render schedules yield identical fixed-tick receipt/final-state hashes.
- [ ] CLI, Browser, Validation, examples, and generated/public types use the same canonical names.
- [ ] R0, canonical, placement, rigged-subject, G Bot, typecheck, full tests, and build remain green.
- [ ] M5 remains open until the separately planned R1b static-platform slice passes.
