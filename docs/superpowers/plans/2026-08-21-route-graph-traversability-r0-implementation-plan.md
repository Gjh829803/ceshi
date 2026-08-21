# Route Graph / Traversability R0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the AI-facing Route connectivity request, traversal identity/lock contracts, validation vocabulary, and Planner normalization required before any R1 Graph Builder or Runtime Probe code is written.

**Architecture:** Authoring V4 adds one `constraints.connectivity` union without changing V3. A new engine-neutral `@whitebox-world/traversal` package owns canonical Traversal Surface identity, resolved lock receipts, graph/driver profiles, and canonical graph hashing. The existing `@whitebox-world/validation` package adds a versioned `world-package` Subject/Profile/Report V2 and exclusively owns Route gate thresholds, metrics, diagnostics, and policy; Capture-only V1 stays immutable. Planner routes normalize into the same Canonical Route fields. R0 produces contracts and conformance only—R1/R1b remain blocked until P1.5 removes the current Babylon motion fallbacks and support bootstrap bypasses.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12/AJV, canonical JSON + SHA-256 protocol helpers, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`

## Global Constraints

- Do not add `connected-by-route` to `PlacementConstraintSpecV1` or Authoring V3; it enters Authoring V4 only under `constraints.connectivity`.
- Route corridor semantics are always `hard-ribbon`; do not add a public `routeCorridorMode` in R0.
- Planner and Canonical Route fields are `pointsMetersXZ`, `widthMeters`, and `locomotionProfileRef`; `maximumDesignSlopeDegrees` remains Planner-only evidence.
- `traversalSurfaceId`, `surfaceEntityId`, and `colliderSubshapeId` are distinct required identities.
- `resolvedTraversalLockHash` must cover the actual Subject, Collider, Physics Body, Locomotion Capability, Control Feel, Control, Motion/Kernel, Medium, and Runtime Backend/Adapter lock inputs.
- `TraversalDriverProfileV1` may contain Path-following and Canonical Intent generation fields only; it must reject all Validation thresholds as well as speed, acceleration, turn rate, jump, slope, step height, gravity, capsule, and Medium values. `RouteRuntimeGateThresholdsV1` belongs only to the unified Validation Profile.
- `routePathCost` is dimensionless and deterministic. R0 must not publish `routeTraversalCostSeconds` or an estimated duration derived from an unlocked speed.
- Graph and Runtime evidence with different `resolvedTraversalLockHash` values fails before query with `ROUTE_TRAVERSAL_LOCK_MISMATCH`.
- Route gate thresholds, metric results, and public diagnostics extend `@whitebox-world/validation` through `ValidationProfileV2`/`ValidationReportV2` with `subject.kind:"world-package"`; do not mutate Capture V1, copy them into `@whitebox-world/traversal`, or create a Route-only report.
- Provider IDs, Babylon/Havok handles, Recast Poly Refs, runtime array indexes, paths, environment, time, and network data never enter canonical bytes.
- R0 does not build a NavMesh, execute a Character Controller, modify Runtime, or claim the two route gates are implemented.
- R1/R1b cannot begin until the frozen P1.5 Ground/Air authority slice is implemented and its regression gates prove no Motion/Adapter step/slope override, spawn ray bootstrap, or AABB support fallback remains.
- Use TDD for every task. Stage only task-owned paths and end each task with focused tests plus `pnpm typecheck`.

---

### Task 1: Engine-neutral Traversal Contract Package

**Files:**
- Create: `packages/traversal/package.json`
- Create: `packages/traversal/src/types.ts`
- Create: `packages/traversal/src/profile-registry.ts`
- Create: `packages/traversal/src/profile-registry.test.ts`
- Create: `packages/traversal/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `TraversalSurfaceIdentityV1`, `ResolvedTraversalLockV1`, `ResolvedTraversalLockReceiptV1`, `TraversalGraphBuilderProfileV1`, `TraversalDriverProfileV1`, `validateTraversalDriverProfileV1()`, `resolveTraversalGraphBuilderProfileV1()`, and `resolveTraversalDriverProfileV1()`.
- Built-in refs are exactly `worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@1` and `worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1`.

- [ ] **Step 1: Write RED tests for closed profiles and forbidden Driver fields**

```ts
expect(resolveTraversalDriverProfileV1(
  "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
)).toMatchObject({
  resolvedVersion: "1",
  contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  profile: {
    kind: "traversal-driver-profile",
    schemaVersion: 1,
    pathLookaheadMeters: expect.any(Number),
    cornerSelectionMode: "next-visible-segment",
    intentDirectionQuantizationRatio: expect.any(Number),
    locomotionIntentMode: "walk",
  },
});
expect(() => validateTraversalDriverProfileV1({
  kind: "traversal-driver-profile",
  schemaVersion: 1,
  walkSpeedMetersPerSecond: 3,
})).toThrow("TRAVERSAL_DRIVER_FIELD_FORBIDDEN");
```

- [ ] **Step 2: Run the RED gate**

Run: `pnpm vitest run packages/traversal/src/profile-registry.test.ts`
Expected: FAIL because `@whitebox-world/traversal` does not exist.

- [ ] **Step 3: Implement exact closed types and immutable profile resolution**

```ts
export interface TraversalSurfaceIdentityV1 {
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly resourceRef: string;
  readonly resolvedVersion: string;
  readonly resourceHash: `sha256:${string}`;
}

export interface ResolvedTraversalLockV1 {
  readonly kind: "resolved-traversal-lock";
  readonly schemaVersion: 1;
  readonly subjectEntityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: `sha256:${string}`;
  readonly colliderProfileRef: string;
  readonly colliderProfileHash: `sha256:${string}`;
  readonly physicsBodyProfileRef: string;
  readonly physicsBodyProfileHash: `sha256:${string}`;
  readonly locomotionProfileRef: string;
  readonly locomotionProfileHash: `sha256:${string}`;
  readonly controlFeelProfileRef: string;
  readonly controlFeelProfileHash: `sha256:${string}`;
  readonly controlProfileRef: string;
  readonly controlProfileHash: `sha256:${string}`;
  readonly motionProfileRef: string;
  readonly motionProfileHash: `sha256:${string}`;
  readonly motionKernelRef: string;
  readonly motionKernelHash: `sha256:${string}`;
  readonly mediumProfileRef: string;
  readonly mediumProfileHash: `sha256:${string}`;
  readonly runtimeBackendRef: string;
  readonly runtimeBackendResolvedVersion: string;
  readonly runtimeBackendHash: `sha256:${string}`;
  readonly capsuleRadiusMeters: number;
  readonly capsuleHeightMeters: number;
  readonly colliderCenterOffsetMetersXYZ: readonly [number, number, number];
  readonly maxSlopeDegrees: number;
  readonly maxStepHeightMeters: number;
}

export interface ResolvedTraversalLockReceiptV1 {
  readonly lock: ResolvedTraversalLockV1;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
}

export interface TraversalDriverProfileV1 {
  readonly kind: "traversal-driver-profile";
  readonly schemaVersion: 1;
  readonly pathLookaheadMeters: number;
  readonly cornerSelectionMode: "next-visible-segment";
  readonly intentDirectionQuantizationRatio: number;
  readonly locomotionIntentMode: "walk";
}

export interface TraversalGraphBuilderProfileV1 {
  readonly kind: "traversal-graph-builder-profile";
  readonly schemaVersion: 1;
  readonly clearanceMarginMeters: number;
  readonly positionQuantizationMeters: number;
  readonly slopeCostWeight: number;
  readonly stepCostWeight: number;
  readonly maximumNodes: number;
  readonly maximumEdges: number;
  readonly maximumTiles: number;
  readonly maximumSearchSteps: number;
}
```

The Driver validator must reject unknown fields through an explicit allowed-key set; generic AJV `additionalProperties:false` alone is not sufficient evidence for programmatic construction. Registry resolution returns frozen projections and hashes canonical bytes with `@whitebox-world/protocol`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run packages/traversal/src/profile-registry.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/traversal/package.json packages/traversal/src/types.ts packages/traversal/src/profile-registry.ts packages/traversal/src/profile-registry.test.ts packages/traversal/src/index.ts pnpm-lock.yaml
git commit -m "feat: define traversal r0 contracts"
```

### Task 2: Authoring V4 Connectivity Constraint Without V3 Pollution

**Files:**
- Create: `packages/authoring/src/types-v4.ts`
- Create: `packages/authoring/src/authoring-spec-v4.schema.json`
- Create: `packages/authoring/src/authoring-v4.test.ts`
- Create: `packages/authoring/src/validate-v4.ts`
- Create: `packages/authoring/src/parse-v4.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/package.json`

**Interfaces:**
- Produces: `ConnectedByRouteConstraintV1`, `ConnectivityConstraintSpecV1`, `AuthoringSpecV4`, `validateAuthoringSpecV4()`, and `parseAuthoringSpecV4()`.
- V3 remains byte-for-byte unchanged and must continue rejecting `constraints.connectivity` and `connected-by-route`.

- [ ] **Step 1: Write RED schema and type tests**

```ts
const requiredRoute: ConnectedByRouteConstraintV1 = {
  id: "player-can-reach-watchtower",
  kind: "connected-by-route",
  requirement: "required",
  traversingEntityId: "player",
  startAnchorEntityId: "spawn-main",
  destinationAnchorEntityId: "watchtower-entry",
  routeId: "spawn-to-watchtower",
};

expect(validateAuthoringSpecV4(withConnectivity(validV4, requiredRoute)).ok).toBe(true);
expect(validateAuthoringSpecV3(withConnectivity(validV3, requiredRoute)).ok).toBe(false);
expect(validateAuthoringSpecV4(withConnectivity(validV4, {
  ...requiredRoute,
  subjectId: "player",
})).ok).toBe(false);
```

Cover required/preferred exclusivity, role-qualified IDs, missing Anchors/Route/Subject references, unknown fields, and the prohibition against placing the constraint in `constraints.placements`.

- [ ] **Step 2: Run the RED gate**

Run: `pnpm vitest run packages/authoring/src/authoring-v4.test.ts`
Expected: FAIL because V4 modules do not exist.

- [ ] **Step 3: Implement the V4-only connectivity union**

```ts
export type ConnectedByRouteConstraintV1 = Readonly<{
  id: string;
  kind: "connected-by-route";
  requirement: "required";
  preferenceWeightRatio?: never;
  traversingEntityId: string;
  startAnchorEntityId: string;
  destinationAnchorEntityId: string;
  routeId: string;
}>;

export type ConnectivityConstraintSpecV1 = ConnectedByRouteConstraintV1;

export interface AuthoringSpecV4 extends Omit<AuthoringSpecV3, "schemaVersion" | "constraints"> {
  readonly schemaVersion: 4;
  readonly constraints: {
    readonly placements: readonly PlacementConstraintSpecV1[];
    readonly connectivity: readonly ConnectivityConstraintSpecV1[];
  };
}
```

R0 supports Required only. A Preferred connectivity policy requires a later Schema version because production passage cannot be silently traded against composition score.

- [ ] **Step 4: Run Authoring tests and typecheck**

Run: `pnpm vitest run packages/authoring/src/authoring-v3.test.ts packages/authoring/src/authoring-v4.test.ts && pnpm typecheck`
Expected: PASS; V3 rejects the new collection and V4 accepts only the closed union.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/authoring/src/types-v4.ts packages/authoring/src/authoring-spec-v4.schema.json packages/authoring/src/authoring-v4.test.ts packages/authoring/src/validate-v4.ts packages/authoring/src/parse-v4.ts packages/authoring/src/index.ts packages/authoring/package.json
git commit -m "feat: define route connectivity authoring v4"
```

### Task 3: Planner Route Clean Break and Canonical Projection

**Files:**
- Modify: `packages/world/src/world-spec.ts`
- Modify: `packages/world/src/world-spec.test.ts`
- Modify: `packages/world/src/planning-artifacts.ts`
- Modify: `packages/world/src/planning-artifacts.test.ts`
- Create: `packages/world/src/canonical-route-projection.ts`
- Create: `packages/world/src/canonical-route-projection.test.ts`
- Modify: `apps/playground/src/scenes/plans/grassland.ts`
- Modify: `apps/playground/src/scenes/plans/sunlit-flower-bay.ts`
- Modify: `apps/playground/src/scenes/plans/world-08170639-54db.ts`

**Interfaces:**
- Produces: revised `PlannedRoute` and `projectPlannedRouteToCanonicalRouteV1(route): RouteSpecV1`.
- The projection copies only `id`, `kind`, `pointsMetersXZ`, `widthMeters`, and `locomotionProfileRef`; Planner-only `priority`, `maximumDesignSlopeDegrees`, and `evidence` remain provenance.

- [ ] **Step 1: Write RED projection and naming tests**

```ts
const route: PlannedRoute = {
  id: "spawn-to-lookout",
  pointsMetersXZ: [[0, 0], [8, -12]],
  widthMeters: 2.4,
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  priority: "primary",
  maximumDesignSlopeDegrees: 35,
  evidence: { kind: "user-fact", source: "prompt" },
};

expect(projectPlannedRouteToCanonicalRouteV1(route)).toEqual({
  id: "spawn-to-lookout",
  kind: "polyline-xz",
  pointsMetersXZ: [[0, 0], [8, -12]],
  widthMeters: 2.4,
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
});
```

Add a source guard that fails when `PlannedRoute` still exposes `points`, `width`, or `maxSlopeDegrees`.

- [ ] **Step 2: Run the RED gate**

Run: `pnpm vitest run packages/world/src/world-spec.test.ts packages/world/src/canonical-route-projection.test.ts packages/world/src/planning-artifacts.test.ts`
Expected: FAIL on the old Planner field names and missing projection.

- [ ] **Step 3: Apply the clean break and migrate all tracked plans**

```ts
export interface PlannedRoute {
  id: string;
  pointsMetersXZ: readonly Vec2Tuple[];
  widthMeters: number;
  locomotionProfileRef: string;
  priority: "primary" | "secondary";
  maximumDesignSlopeDegrees: number;
  evidence: WorldPlanEvidence;
}
```

Planning artifacts continue measuring Heightfield slope against `maximumDesignSlopeDegrees`, but their result text must state `planning-evidence`, never route playability. Do not add `maximumDesignSlopeDegrees` to `RouteSpecV1`.

- [ ] **Step 4: Run World/scene gates and typecheck**

Run: `pnpm vitest run packages/world/src/world-spec.test.ts packages/world/src/canonical-route-projection.test.ts packages/world/src/planning-artifacts.test.ts packages/world/src/scene.test.ts apps/playground/src/scenes/scenes.test.ts && pnpm typecheck`
Expected: PASS with all three tracked scene plans on canonical names.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/world/src/world-spec.ts packages/world/src/world-spec.test.ts packages/world/src/planning-artifacts.ts packages/world/src/planning-artifacts.test.ts packages/world/src/canonical-route-projection.ts packages/world/src/canonical-route-projection.test.ts apps/playground/src/scenes/plans/grassland.ts apps/playground/src/scenes/plans/sunlit-flower-bay.ts apps/playground/src/scenes/plans/world-08170639-54db.ts
git commit -m "refactor: normalize planner route vocabulary"
```

### Task 4: Canonical Traversal Lock and Unified Validation Route Extension

**Files:**
- Create: `packages/traversal/src/lock.ts`
- Create: `packages/traversal/src/lock.test.ts`
- Create: `packages/traversal/src/graph-contract.ts`
- Create: `packages/traversal/src/graph-contract.test.ts`
- Modify: `packages/traversal/src/types.ts`
- Modify: `packages/traversal/src/index.ts`
- Create: `packages/validation/src/types-v2.ts`
- Create: `packages/validation/src/profile-v2.ts`
- Create: `packages/validation/src/validate-v2.ts`
- Create: `packages/validation/src/route.ts`
- Create: `packages/validation/src/route.test.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Traversal produces: `resolveTraversalLockV1(input)`, `TraversalGraphV1`, `TraversalNodeV1`, `TraversalEdgeV1`, `canonicalTraversalGraphV1()`, and `assertMatchingTraversalLocksV1(graphHash, runtimeHash)`.
- Validation produces: `WorldPackageValidationSubjectV1`, `ValidationProfileV2`, `ValidationReportV2`, `RouteConnectivityMetricsV1`, `RouteRuntimeConformanceMetricsV1`, `RouteRuntimeGateThresholdsV1`, the Route members of `ValidationDiagnosticCodeV2`, and `OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2` at `worldkit://validation-profile/outdoor-world-package-dev@1`.

- [ ] **Step 1: Write RED lock, hash, identity, and diagnostic tests**

```ts
expect(resolveTraversalLockV1(validLockInput)).toMatchObject({
  resolvedTraversalLockHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  lock: {
    maxStepHeightMeters: 0.3,
    maxSlopeDegrees: 42,
    capsuleRadiusMeters: 0.35,
  },
});
expect(() => assertMatchingTraversalLocksV1(
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
)).toThrow("ROUTE_TRAVERSAL_LOCK_MISMATCH");
expect(canonicalTraversalGraphV1(graph)).not.toHaveProperty("traversalGraphHash");
expect(new Set(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2).size)
  .toBe(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2.length);
expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById)
  .toHaveProperty("route-connectivity");
expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById)
  .toHaveProperty("route-runtime-conformance");
expect(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.subjectKind)
  .toBe("control-capture-bundle");
```

Include adversarial cases where only Control Feel, Motion Kernel, Backend version, Collider hash, or Physics Body hash differs. Every difference must change the lock hash even when the Graph Builder consumes only a subset.

- [ ] **Step 2: Run the RED gate**

Run: `pnpm vitest run packages/traversal/src/lock.test.ts packages/traversal/src/graph-contract.test.ts packages/validation/src/route.test.ts packages/validation/src/validation.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the canonical contracts**

```ts
export interface TraversalNodeV1 {
  readonly id: string;
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly tileId: string;
  readonly clearanceWidthMeters: number;
  readonly clearanceHeightMeters: number;
}

export interface TraversalEdgeV1 {
  readonly id: string;
  readonly type: "walk" | "slope" | "step";
  readonly fromTraversalNodeId: string;
  readonly toTraversalNodeId: string;
  readonly distanceMeters: number;
  readonly heightDeltaMeters: number;
  readonly slopeDegrees: number;
  readonly minimumClearanceWidthMeters: number;
  readonly minimumClearanceHeightMeters: number;
  readonly routePathCost: number;
}

export interface RouteRuntimeGateThresholdsV1 {
  readonly destinationToleranceMeters: number;
  readonly maximumRouteDeviationMeters: number;
  readonly minimumProgressMeters: number;
  readonly stalledWindowTicks: number;
  readonly maximumConsecutiveUnsupportedTicks: number;
  readonly maximumProbeTicks: number;
}

export interface WorldPackageValidationSubjectV1 {
  readonly kind: "world-package";
  readonly worldPackageRootHash: Sha256HashV1;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly resourceLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
}

export interface ValidationProfileV2 {
  readonly kind: "worldkit-validation-profile";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly resourceRef: string;
  readonly version: string;
  readonly subjectKind: "world-package";
  readonly routeRuntimeGateThresholds: RouteRuntimeGateThresholdsV1;
  readonly gateDefinitionsById: Readonly<Record<string, GateDefinitionV2>>;
}

export interface ValidationReportV2 {
  readonly kind: "worldkit-validation-report";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly dependencyReportRefs: readonly string[];
  readonly validationProfileRef: string;
  readonly resolvedVersion: string;
  readonly validationProfileHash: Sha256HashV1;
  readonly status: ValidationReportStatusV1;
  readonly gateResultsById: Readonly<Record<string, GateResultV2>>;
  readonly evidenceArtifactsById: Readonly<Record<string, EvidenceArtifactV2>>;
  readonly diagnostics: readonly ValidationDiagnosticV2[];
}

export type EvidenceArtifactKindV2 =
  | "traversal-graph"
  | "route-path-receipt"
  | "route-runtime-probe-receipt"
  | "route-overlay";

export interface EvidenceArtifactV2 {
  readonly id: string;
  readonly kind: EvidenceArtifactKindV2;
  readonly artifactRef: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export type RouteDiagnosticDetailsV1 =
  | Readonly<{ kind: "meters-threshold"; expectedMeters: number; actualMeters: number }>
  | Readonly<{ kind: "degrees-threshold"; expectedDegrees: number; actualDegrees: number }>
  | Readonly<{ kind: "ticks-threshold"; expectedTicks: number; actualTicks: number }>
  | Readonly<{ kind: "count-threshold"; maximumAllowedCount: number; actualCount: number }>
  | Readonly<{ kind: "hash-mismatch"; expectedHash: Sha256HashV1; actualHash: Sha256HashV1 }>
  | Readonly<{ kind: "identity-mismatch"; expectedId: string; actualId: string }>
  | Readonly<{ kind: "missing-reference"; missingRef: string }>
  | Readonly<{ kind: "state-mismatch"; expectedState: string; actualState: string }>;

export interface ValidationDiagnosticV2 {
  readonly id: string;
  readonly code: ValidationDiagnosticCodeV2;
  readonly severity: "error" | "warning";
  readonly gateId: string;
  readonly metricId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly traversalSurfaceId?: string;
  readonly colliderSubshapeId?: string;
  readonly positionMetersXYZ?: readonly [number, number, number];
  readonly evidenceArtifactRefs: readonly string[];
  readonly details: RouteDiagnosticDetailsV1;
  readonly message: string;
  readonly suggestedFix: string;
}
```

`MetricDefinitionV2` / `MetricResultV2` retain all V1 branches and add closed
unit-bearing branches instead of a generic numeric value:

```ts
type RouteScalarMetricDefinitionV2 =
  | Readonly<{
      kind: "meters-threshold";
      minimumAllowedMeters?: number;
      maximumAllowedMeters?: number;
    }>
  | Readonly<{
      kind: "degrees-threshold";
      minimumAllowedDegrees?: number;
      maximumAllowedDegrees?: number;
    }>
  | Readonly<{
      kind: "ticks-threshold";
      minimumAllowedTicks?: number;
      maximumAllowedTicks?: number;
    }>
  | Readonly<{
      kind: "cost-threshold";
      minimumAllowedCost?: number;
      maximumAllowedCost?: number;
    }>;

type RouteScalarMetricResultV2 =
  | Readonly<{ kind: "meters-threshold"; valueMeters?: number }>
  | Readonly<{ kind: "degrees-threshold"; valueDegrees?: number }>
  | Readonly<{ kind: "ticks-threshold"; valueTicks?: number }>
  | Readonly<{ kind: "cost-threshold"; valueCost?: number }>;
```

Intersect each branch with the existing definition/result base fields and its same-kind expected
threshold fields. Unknown or cross-unit fields are rejected; `meters-threshold` cannot carry
`maximumAllowedDegrees`, and no branch exposes generic `value`, `minimum`, or `maximum`.

`TraversalGraphV1` stores the lock, source hashes, nodes, and edges but not its own hash. The Artifact Index computes `traversalGraphHash` over canonical graph bytes. `packages/validation/src/route.ts` owns the Route metrics, `RouteRuntimeGateThresholdsV1`, and the stable Route diagnostic list, including `ROUTE_TRAVERSAL_LOCK_MISMATCH`, `ROUTE_CORRIDOR_LAYER_AMBIGUOUS`, and `ROUTE_START_SUPPORT_INVALID`. V2 reports validate exactly one `world-package` Subject and use `dependencyReportRefs` for cross-stage evidence. Keep all V1 files and the `outdoor-control-video-dev@1` hash golden unchanged; do not create `TraversalValidationReportV1`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run packages/traversal/src/lock.test.ts packages/traversal/src/graph-contract.test.ts packages/validation/src/route.test.ts packages/validation/src/validation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add packages/traversal/src/lock.ts packages/traversal/src/lock.test.ts packages/traversal/src/graph-contract.ts packages/traversal/src/graph-contract.test.ts packages/traversal/src/types.ts packages/traversal/src/index.ts packages/validation/src/types-v2.ts packages/validation/src/profile-v2.ts packages/validation/src/validate-v2.ts packages/validation/src/route.ts packages/validation/src/route.test.ts packages/validation/src/index.ts
git commit -m "feat: freeze traversal lock and evidence contracts"
```

### Task 5: R0 Canonical Fixtures and Executable Conformance Gate

**Files:**
- Create: `examples/traversal/route-r0-contract.json`
- Create: `examples/traversal/route-r0-lock-mismatch.json`
- Create: `scripts/verify-route-r0-contract.ts`
- Create: `scripts/verify-route-r0-contract.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Produces `runRouteR0ContractVerification()` and the command `pnpm verify:route-r0-contract`.
- The command validates Authoring V4 connectivity, Planner projection, stable Surface IDs, canonical Graph bytes, Driver whitelist, metric/diagnostic vocabulary, and the expected lock-mismatch rejection. It does not build a graph or run Babylon.

- [ ] **Step 1: Write the RED verifier test**

```ts
const result = await runRouteR0ContractVerification({ repositoryRoot });
expect(result).toEqual({
  ok: true,
  checks: [
    "authoring-v4-connectivity",
    "planner-route-projection",
    "traversal-surface-identity",
    "resolved-traversal-lock",
    "driver-profile-whitelist",
    "canonical-graph-bytes",
    "route-validation-vocabulary",
    "lock-mismatch-diagnostic",
  ],
});
```

- [ ] **Step 2: Run the RED gate**

Run: `pnpm vitest run scripts/verify-route-r0-contract.test.ts`
Expected: FAIL because the verifier and fixtures do not exist.

- [ ] **Step 3: Implement the deterministic verifier and fixtures**

The verifier must call exported parsers/validators and canonical-hash functions directly. It must not use regex checks as protocol evidence, start a browser, call a network service, inspect wall-clock duration, or claim `route-connectivity`/`route-runtime-conformance` passed.

- [ ] **Step 4: Run the full R0 gate set**

Run: `pnpm verify:route-r0-contract && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS. Output must explicitly end with `R0 contract frozen; R1/R1b runtime capability not implemented`.

- [ ] **Step 5: Update status without overstating implementation**

Mark only the Backlog R0 field-freeze item complete and link the command evidence. Leave R1, R1b, both production Route gates, and the overall M5 item open. README must say the command verifies contracts, not traversability.

- [ ] **Step 6: Commit Task 5**

```bash
git add examples/traversal/route-r0-contract.json examples/traversal/route-r0-lock-mismatch.json scripts/verify-route-r0-contract.ts scripts/verify-route-r0-contract.test.ts package.json README.md docs/18-refactor-progress-and-backlog.md
git commit -m "test: add route r0 conformance gate"
```

## Completion Review

- [ ] Authoring V3 is unchanged and still rejects connectivity fields.
- [ ] Authoring V4 exposes exactly one connectivity constraint kind.
- [ ] Planner Route uses canonical unit-bearing names and projects deterministically.
- [ ] No public corridor mode, provider handle, generic endpoint, or numeric parameter bag exists.
- [ ] Driver validation rejects every movement/physics authority field.
- [ ] Graph and Probe lock mismatch has one stable code and cannot proceed to Query.
- [ ] Surface identities remain stable across Tile/LOD ordering changes.
- [ ] Route thresholds, metrics, diagnostics, and report policy have one owner in `@whitebox-world/validation` V2; Capture V1 is unchanged and Traversal exports no competing report vocabulary.
- [ ] The verifier states that R1/R1b and Runtime Gates are not implemented.
- [ ] P1.5 implementation remains an explicit prerequisite for R1/R1b.
