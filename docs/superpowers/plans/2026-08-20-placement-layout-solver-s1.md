# Placement Constraint / Layout Solver S1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an AI-facing, deterministic outdoor placement slice where Authoring V3 expresses spatial intent, the SDK solves final transforms, and CLI/Browser conformance proves the result and its report.

**Architecture:** Authoring resolves V3 schema and Registry-backed facts into a closed `ResolvedLayoutInputV1`. A new engine-neutral `@whitebox-world/layout-solver` package performs bounded discrete search and emits a canonical `LayoutSolveReportV1`; Authoring then projects NormalizedWorldIR V3, Compiler emits ExecutionPlan V4, and Babylon only revalidates frozen assertions. No Solver code reads files, time, environment, network, Babylon, Havok, or LLM/VLM providers.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12/AJV, canonical JSON + SHA-256 protocol helpers, Vitest, Babylon.js/Havok runtime, Playwright Browser conformance, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md`

## Global Constraints

- Public versions are an atomic clean break: Authoring Spec V3, NormalizedWorldIR V3, ExecutionPlan V4; do not retain V2/V3 aliases or optional compatibility branches.
- S1 public Constraint kinds are exactly `inside-region`, `outside-region`, `distance-range`, `faces-entity`, `supported-by`, `minimum-clearance`, `within-slope-limit`, and `visible-in-camera-region`.
- `relative-direction` and `connected-by-route` are invalid in S1.
- Required constraints block package creation; Preferred constraints may lose only with an explicit per-constraint result and stable cost.
- `placement.kind` is required on Object and Anchor. Subject placement remains `spawnAnchorEntityId`; Camera placement remains derived from the locked rig and target.
- Coordinate convention remains right-handed, `+Y` up, `-Z` forward, meters/radians, with screen UV `[0,0]` at top-left, `+U` right and `+V` down.
- Solver identity includes Authoring Hash, Registry Lock Hash, terrain/bounds hashes, Profile Ref/version/hash, Seed, budgets, and quantization profile.
- Provider terms, raw URIs, file paths, Babylon/Havok handles, search queues, and wall-clock results never enter Canonical Schema, Normalized IR, ExecutionPlan, or Layout Report.
- Runtime may reject a failed assertion but must never move an entity to repair layout.
- Use TDD for every implementation task; stage only the task-owned files; every task ends with a focused green gate and a commit.

---

### Task 1: Versioned Layout Contracts and Built-in Solver Profile

**Files:**
- Create: `packages/layout-solver/package.json`
- Create: `packages/layout-solver/src/types.ts`
- Create: `packages/layout-solver/src/profile-registry.ts`
- Create: `packages/layout-solver/src/profile-registry.test.ts`
- Create: `packages/layout-solver/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `LayoutSolverProfileV1`, `ResolvedLayoutSolverProfileV1`, `resolveLayoutSolverProfileV1(ref)`, `BUILT_IN_LAYOUT_SOLVER_PROFILE_REF`.
- The built-in Ref is exactly `worldkit://layout-solver-profile/outdoor.s1@1`.
- The resolved row exposes exact `resolvedVersion`, `contentHash`, quantization, tolerance, and budget fields; it does not expose mutable Maps or provider handles.

- [x] **Step 1: Write Registry/profile RED tests**

```ts
expect(resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF)).toEqual({
  resourceRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  resolvedVersion: "1",
  contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  profile: expect.objectContaining({ kind: "layout-solver-profile", schemaVersion: 1 }),
});
expect(() => resolveLayoutSolverProfileV1("worldkit://layout-solver-profile/outdoor.s1@latest"))
  .toThrow("LAYOUT_SOLVER_PROFILE_NOT_FOUND");
```

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/layout-solver/src/profile-registry.test.ts`
Expected: FAIL because package/module does not exist.

- [x] **Step 3: Implement the closed profile types and immutable resolver**

```ts
export interface LayoutSolverProfileV1 {
  kind: "layout-solver-profile";
  schemaVersion: 1;
  candidateGeneration: {
    gridSpacingMeters: number;
    boundarySampleSpacingMeters: number;
    routeSampleSpacingMeters: number;
    yawStepDegrees: number;
  };
  quantization: {
    positionStepMeters: number;
    rotationStepRadians: number;
    ratioStep: number;
    scoreStep: number;
  };
  tolerances: {
    distanceMeters: number;
    angleDegrees: number;
    supportGapMeters: number;
    overlapMeters: number;
  };
  budgets: {
    maximumConstraints: number;
    maximumCandidatesPerEntity: number;
    maximumSearchNodes: number;
    maximumConflictChecks: number;
    maximumDiagnostics: number;
  };
}
```

Use canonical JSON and `sha256Bytes` for the content hash; deep-project a fresh frozen value on every resolve.

- [x] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run packages/layout-solver/src/profile-registry.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/layout-solver/package.json packages/layout-solver/src/types.ts packages/layout-solver/src/profile-registry.ts packages/layout-solver/src/profile-registry.test.ts packages/layout-solver/src/index.ts pnpm-lock.yaml
git commit -m "feat: define deterministic layout solver profile"
```

### Task 2: Authoring V3 Placement and Spatial Schema

**Files:**
- Create: `packages/authoring/src/authoring-spec-v3.schema.json`
- Create: `packages/authoring/src/authoring-v3.test.ts`
- Create: `packages/authoring/src/types-v3.ts`
- Create: `packages/authoring/src/validate-v3.ts`
- Create: `packages/authoring/src/parse-v3.ts`
- Create: `packages/authoring/src/migrate-v2-to-v3.ts`
- Create: `packages/authoring/src/migrate-v2-to-v3.test.ts`
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/index.ts`

**Interfaces:**
- Produces: `AuthoringSpecV3`, `PlacementSpecV1`, `PlacementConstraintSpecV1`, `SpatialRegionSpecV1`, `RouteSpecV1`, `ScreenRegionSpecV1`, `validateAuthoringSpecV3()`, `parseAuthoringSpecV3()`, and `migrateAuthoringSpecV2ToV3()`.
- This task builds an explicit V3 path beside the still-green V2 path. The temporary coexistence is branch-internal scaffolding only; Task 8 atomically migrates tracked inputs, switches public defaults, and deletes V2.
- `migrateAuthoringSpecV2ToV3` is a one-time developer tool and is not called by parsing, validation, normalization, Compiler, Runtime, or Browser code.

- [x] **Step 1: Add RED schema cases for exact unions and field paths**

```ts
expect(validateAuthoringSpecV3({ ...validV3, schemaVersion: 2 }).ok).toBe(false);
expect(validateAuthoringSpecV3(withObjectPlacement(validV3, {
  kind: "solved",
  placementConstraintIds: ["inside-east-bluff"],
})).ok).toBe(true);
expect(validateAuthoringSpecV3(withConstraint(validV3, { kind: "relative-direction" })).toMatchObject({
  ok: false,
  diagnostics: [expect.objectContaining({ instancePath: "/constraints/placements/0/kind" })],
});
```

Cover: fixed/solved exclusivity, required/preferred weight rules, all eight kinds, role-qualified endpoints, duplicate IDs, UV ranges/order, polygon/polyline cardinality, units/ranges, and unknown fields.

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/authoring/src/authoring-v3.test.ts`
Expected: FAIL because V3 schema/types do not exist.

- [x] **Step 3: Implement V3 public types and JSON Schema**

```ts
export type PlacementSpecV1 =
  | { kind: "fixed"; transform: TransformSpecV3 }
  | {
      kind: "solved";
      initialTransform?: TransformSpecV3;
      placementConstraintIds: readonly string[];
    };

export interface AuthoringSpecV3 {
  kind: "worldkit-authoring-spec";
  schemaVersion: 3;
  id: string;
  seed: number;
  layout: { solverProfileRef: string };
  spatial: {
    regions: readonly SpatialRegionSpecV1[];
    routes: readonly RouteSpecV1[];
    screenRegions: readonly ScreenRegionSpecV1[];
  };
  constraints: { placements: readonly PlacementConstraintSpecV1[] };
  // Existing V2 world/resources/nodes/relationships/rules/startup shapes migrate atomically.
}
```

- [x] **Step 4: Implement and test the one-time migration without rewriting tracked inputs yet**

Migration rules: Object `transform` → `placement:{kind:"fixed",transform}`; Anchor same; add the built-in Solver Profile Ref, empty spatial collections, and `constraints:{placements:[]}`. Do not leave both fields. Test exact output, immutability and idempotency of `V2 → V3 → canonical bytes`; do not add fallback calls to production parsers.

Run: `pnpm vitest run packages/authoring/src/migrate-v2-to-v3.test.ts`
Expected: PASS; no tracked example changes in this task.

- [x] **Step 5: Run Authoring and repository gates**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts packages/authoring/src/authoring-v3.test.ts packages/authoring/src/migrate-v2-to-v3.test.ts packages/authoring/src/normalize.test.ts && pnpm typecheck`
Expected: PASS; current V2 regressions and the new V3 contract are both green before the atomic cutover.

- [x] **Step 6: Commit**

```bash
git add packages/authoring/package.json packages/authoring/src/authoring-spec-v3.schema.json packages/authoring/src/authoring-v3.test.ts packages/authoring/src/types-v3.ts packages/authoring/src/validate-v3.ts packages/authoring/src/parse-v3.ts packages/authoring/src/migrate-v2-to-v3.ts packages/authoring/src/migrate-v2-to-v3.test.ts packages/authoring/src/index.ts
git commit -m "feat: define placement authoring v3"
```

### Task 3: Engine-neutral Geometry Query and Candidate Generation

**Files:**
- Create: `packages/layout-solver/src/geometry.ts`
- Create: `packages/layout-solver/src/geometry.test.ts`
- Create: `packages/layout-solver/src/candidates.ts`
- Create: `packages/layout-solver/src/candidates.test.ts`
- Modify: `packages/layout-solver/src/types.ts`
- Modify: `packages/layout-solver/src/index.ts`

**Interfaces:**
- Produces: `LayoutGeometryQueryV1`, `ResolvedLayoutEntityV1`, `LayoutCandidateV1`, `generateLayoutCandidatesV1(input, profile)`.
- Geometry uses quantized numbers and plain records/arrays only.

- [x] **Step 1: Write RED geometry tests**

Cover polygon containment/clearance, point-to-polygon distance, AABB separation, terrain height/normal/slope sampling, route samples, camera projection, screen UV convention, and deterministic quantization.

```ts
expect(projectToScreenUv(camera, [0, 0, -5])).toEqual([0.5, 0.5]);
expect(quantizeMeters(1.23456, 0.001)).toBe(1.235);
```

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/layout-solver/src/geometry.test.ts packages/layout-solver/src/candidates.test.ts`
Expected: FAIL because modules do not exist.

- [x] **Step 3: Implement pure geometry helpers and the Query Port**

No Babylon/Three imports. Reject NaN/Infinity and degenerate polygons before search.

- [x] **Step 4: Implement stable candidate generation**

Candidate order is: valid `initialTransform`, stable region grid, polygon boundary samples, route samples, explicit anchors; then quantized `(x,y,z,rotation)` and stable candidate ID. Enforce `maximumCandidatesPerEntity` before allocation growth.

- [x] **Step 5: Run focused tests and mutation checks**

Run: `pnpm vitest run packages/layout-solver/src/geometry.test.ts packages/layout-solver/src/candidates.test.ts`
Expected: PASS. Temporarily reverse candidate sort and prove determinism tests fail, then restore.

- [x] **Step 6: Commit**

```bash
git add packages/layout-solver/src/geometry.ts packages/layout-solver/src/geometry.test.ts packages/layout-solver/src/candidates.ts packages/layout-solver/src/candidates.test.ts packages/layout-solver/src/types.ts packages/layout-solver/src/index.ts
git commit -m "feat: generate deterministic placement candidates"
```

### Task 4: Eight Constraint Evaluators

**Files:**
- Create: `packages/layout-solver/src/evaluators.ts`
- Create: `packages/layout-solver/src/evaluators.test.ts`
- Modify: `packages/layout-solver/src/types.ts`
- Modify: `packages/layout-solver/src/index.ts`

**Interfaces:**
- Produces: `evaluatePlacementConstraintV1(context, constraint, assignments)` returning a closed `ConstraintEvaluationV1` with `satisfied`, quantized measurements, tolerance, evidence IDs, and `preferenceCostRatio`.

- [x] **Step 1: Write table-driven RED tests for all eight kinds**

Each kind gets satisfied, boundary-equal, violated, missing-reference, and non-finite cases. Explicitly prove `minimum-clearance:0` is overlap prevention, `faces-entity` uses `-Z`, route slope samples its full width/profile spacing, and Camera Region checks projected area plus visibility.

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/layout-solver/src/evaluators.test.ts`
Expected: FAIL because evaluator is missing.

- [x] **Step 3: Implement one exhaustive discriminated-union evaluator**

```ts
switch (constraint.kind) {
  case "inside-region": return evaluateInsideRegion(...);
  case "outside-region": return evaluateOutsideRegion(...);
  case "distance-range": return evaluateDistanceRange(...);
  case "faces-entity": return evaluateFacesEntity(...);
  case "supported-by": return evaluateSupport(...);
  case "minimum-clearance": return evaluateClearance(...);
  case "within-slope-limit": return evaluateSlope(...);
  case "visible-in-camera-region": return evaluateCameraVisibility(...);
}
```

Use `never` exhaustiveness; no default/fallback and no evaluator registry strings.

- [x] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run packages/layout-solver/src/evaluators.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/layout-solver/src/evaluators.ts packages/layout-solver/src/evaluators.test.ts packages/layout-solver/src/types.ts packages/layout-solver/src/index.ts
git commit -m "feat: evaluate placement constraints"
```

### Task 5: Deterministic Search, Preferred Optimization, Report, and Conflict Core

**Files:**
- Create: `packages/layout-solver/src/solve.ts`
- Create: `packages/layout-solver/src/solve.test.ts`
- Create: `packages/layout-solver/src/report.ts`
- Create: `packages/layout-solver/src/report.test.ts`
- Modify: `packages/layout-solver/src/types.ts`
- Modify: `packages/layout-solver/src/index.ts`

**Interfaces:**
- Produces: `solveLayoutV1(input, profile): LayoutSolveResultV1` and `hashLayoutSolveReportV1(report)`.
- Status is exactly `solved | unsatisfied | budget-exceeded | invalid-input`.

- [x] **Step 1: Write RED solver/report tests**

Cover coupled distance/clearance backtracking, stable variable/candidate order, Required blocking, Preferred weighted tie-break, equal-score canonical tie-break, search budget, diagnostic budget, invalid input, and repeated/concurrent hash identity.

```ts
expect(await Promise.all(Array.from({ length: 8 }, () => solveAndHash(input))))
  .toEqual(Array(8).fill(expectedHash));
```

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/layout-solver/src/solve.test.ts packages/layout-solver/src/report.test.ts`
Expected: FAIL because Solver/Report are missing.

- [x] **Step 3: Implement bounded stable CSP search**

Order variables by constrained-domain size then Entity ID; order candidates by initial flag, quantized local cost, position, rotation and stable ID. Increment `searchNodeCount` before expansion. Required constraints prune immediately; Preferred costs are evaluated only on complete feasible assignments.

- [x] **Step 4: Implement deterministic approximate irreducible Conflict Core**

For constraints touching the failed Entity component, remove one Required constraint at a time in stable ID order and rerun within `maximumConflictChecks`; keep a constraint only when its removal changes satisfiability. Budget exhaustion returns `budget-exceeded`, never a partial Production transform.

- [x] **Step 5: Implement exact-shape canonical Report and diagnostics**

Report excludes its own hash. Hash canonical report bytes externally. Diagnostics are closed codes with JSON Pointer, Entity/Constraint IDs, quantized measurements and closed repair operation kinds; no free-form provider errors.

- [x] **Step 6: Run focused/full package tests**

Run: `pnpm vitest run packages/layout-solver/src && pnpm typecheck`
Expected: PASS; repeated and concurrent result hashes match.

- [x] **Step 7: Commit**

```bash
git add packages/layout-solver/src/solve.ts packages/layout-solver/src/solve.test.ts packages/layout-solver/src/report.ts packages/layout-solver/src/report.test.ts packages/layout-solver/src/types.ts packages/layout-solver/src/index.ts
git commit -m "feat: solve and explain deterministic layouts"
```

### Task 6: Authoring Orchestration and NormalizedWorldIR V3

**Files:**
- Create: `packages/authoring/src/layout-input.ts`
- Create: `packages/authoring/src/layout-input.test.ts`
- Create: `packages/authoring/src/normalize-v3.ts`
- Create: `packages/authoring/src/normalize-v3.test.ts`
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/types-v3.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/src/resource-lock.ts`

**Interfaces:**
- Produces: `resolveAuthoringLayoutV3(spec, options)` and `normalizeAuthoringSpecV3(spec, options)` returning NormalizedWorldIR V3.
- Normalized nodes contain final `transform` plus `placementProvenance`; constraints/search internals do not leak into Runtime tables.
- Existing `normalizeAuthoringSpec` V2 remains untouched until Task 8's atomic switch.

- [x] **Step 1: Write RED Authoring→Solver→IR tests**

Prove fixed nodes are validated but unchanged, solved nodes receive final transforms, Subject uses solved spawn Anchor, missing Profile/Bounds/Region/Constraint Ref fails with exact path/code, Required failure returns no IR, and Registry URIs/provider fields remain absent from serialized IR.

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run packages/authoring/src/layout-input.test.ts packages/authoring/src/normalize-v3.test.ts`
Expected: FAIL on missing V3 orchestration/IR.

- [x] **Step 3: Implement exact ResolvedLayoutInput projection**

Project only locked primitive/asset bounds, terrain query data, camera parameters, spatial definitions, constraints, Seed and Profile identity. Never `structuredClone` a Registry manifest into IR.

- [x] **Step 4: Integrate Solver before Normalized IR projection**

Return `{ value, normalizedWorldIrHash, layoutSolveReport, layoutSolveReportHash, diagnostics }`. The Report hash referenced in every solved provenance must match the returned report bytes.

- [x] **Step 5: Run gates and golden hash locks**

Run: `pnpm vitest run packages/authoring/src/layout-input.test.ts packages/authoring/src/normalize-v3.test.ts packages/authoring/src/normalize.test.ts && pnpm typecheck`
Expected: PASS; add exact golden hash assertions for one solved and one fixed fixture.

- [x] **Step 6: Commit**

```bash
git add packages/authoring/package.json packages/authoring/src/layout-input.ts packages/authoring/src/layout-input.test.ts packages/authoring/src/normalize-v3.ts packages/authoring/src/normalize-v3.test.ts packages/authoring/src/types-v3.ts packages/authoring/src/index.ts packages/authoring/src/resource-lock.ts pnpm-lock.yaml
git commit -m "feat: normalize solved placement layouts"
```

### Task 7: ExecutionPlan V4 and Compiler Projection

**Files:**
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`

**Interfaces:**
- Produces: `ExecutionPlanV4` and `compileWorldV4(normalizedWorldIrV3)` with final transforms and closed `layoutAssertions`.
- Existing V2→V3 public Compiler entry remains green until Task 8; there is no V3→V4 fallback or coercion.

- [x] **Step 1: Write RED contract/compiler tests**

Assert V3 IR → V4 Plan, exact projection, Report Hash/provenance, reachable assertions only, no Authoring constraints/provider/URI/search state, and stable Plan hash.

- [x] **Step 2: Implement V4 Plan and Compiler projection**

Runtime assertions carry only IDs, closed kind, quantized expected/tolerance values, and final transform references. They do not carry repair suggestions or Solver candidates.

- [x] **Step 3: Run focused regression gates**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.test.ts && pnpm typecheck`
Expected: PASS for both the existing V3 Compiler path and the new V4 path.

- [x] **Step 4: Commit**

```bash
git add packages/runtime-contracts/src/execution-plan.ts packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.ts packages/compiler/src/compile.test.ts
git commit -m "feat: compile solved layout execution plans"
```

### Task 8: Atomic V3/V3/V4 Cutover and Runtime Assertion Revalidation

**Files:**
- Delete: `packages/authoring/src/authoring-spec-v2.schema.json`
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/validate.ts`
- Modify: `packages/authoring/src/parse.ts`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/test-fixture.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Modify: `examples/authoring/basic-world.json`
- Modify: `examples/authoring/invalid-world.json`
- Modify: `examples/authoring/multi-subject-world.json`
- Modify: `examples/authoring/package-subject-world.json`
- Modify: `examples/authoring/rigged-subject-world.json`
- Modify: `examples/evidence/package-subject-world/explain.json`
- Modify: `examples/evidence/package-subject-world/snapshot.json`
- Modify: `examples/evidence/package-subject-world/world.build.json`
- Modify: `examples/evidence/package-subject-world/world.png`
- Modify: `examples/evidence/rigged-subject-world/explain.json`
- Modify: `examples/evidence/rigged-subject-world/idle.png`
- Modify: `examples/evidence/rigged-subject-world/jump.png`
- Modify: `examples/evidence/rigged-subject-world/run.png`
- Modify: `examples/evidence/rigged-subject-world/snapshot.json`
- Modify: `examples/evidence/rigged-subject-world/verification.json`
- Modify: `examples/evidence/rigged-subject-world/walk.png`
- Modify: `examples/evidence/rigged-subject-world/world.build.json`
- Modify: `examples/evidence/rigged-subject-world/world.png`

**Interfaces:**
- Public defaults become V3/V3/V4; V2 Authoring schema/types and V3 ExecutionPlan exports are removed.
- Runtime rejects a failed assertion with stable `WORLDKIT_LAYOUT_ASSERTION_FAILED` and never mutates placement.

- [x] **Step 1: Write RED cutover and Runtime tests**

Assert old Authoring V2 input fails at `/schemaVersion`, V3 examples use `placement` without Object/Anchor `transform`, build emits IR V3/Plan V4, Browser loads V4, and support/clearance assertion failures reject before ownership publication while cleaning every resource once.

- [x] **Step 2: Apply the one-time migration and switch public exports**

Run: `pnpm tsx packages/authoring/src/migrate-v2-to-v3.ts --write`
Then remove V2 schema/public aliases and point `validateAuthoringSpec`, `parseAuthoringSpec`, `normalizeAuthoringSpec`, `compileWorld`, CLI build/capture and Playground loader at V3/V3/V4 only. A second migration run must create no diff.

- [x] **Step 3: Implement Runtime assertion revalidation without repair**

Run assertions after static physics construction and before `ready`; on failure preserve final transforms, sanitize provider details, unwind ownership and reject. Runtime never imports `@whitebox-world/layout-solver` or Authoring Constraint types.

- [x] **Step 4: Regenerate canonical/rigged artifacts and run cutover gates**

Run: `pnpm verify:canonical && pnpm verify:rigged-subject && pnpm test && pnpm typecheck && pnpm build`
Expected: PASS, artifact protocol versions are V3/V3/V4, old V2 Authoring fixtures fail, and no production import references V2 types/schema.

- [x] **Step 5: Commit exact migrated paths**

Before staging, use `git diff --name-only` to enumerate verifier outputs and stage only the listed cutover files plus those exact regenerated artifact paths.

```bash
git commit -m "feat: switch canonical runtime to solved layout contracts"
```

### Task 9: CLI Layout Validate, Solve, and Explain

**Files:**
- Create: `scripts/lib/layout-artifacts.ts`
- Create: `scripts/lib/layout-artifacts.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Adds: `worldkit layout validate`, `worldkit layout solve`, `worldkit layout explain --entity-id|--constraint-id`.
- `solve` writes a transactionally promoted directory containing `layout-report.json`, `normalized-world-ir.json`, and an integrity manifest.

- [x] **Step 1: Write RED CLI tests**

Cover JSON stdout/stderr, exact exit codes for invalid/unsatisfied/budget/process failures, mutually exclusive explain selectors, output-directory transaction rollback, and deterministic rerun bytes.

- [x] **Step 2: Run RED gate**

Run: `pnpm vitest run scripts/cli/worldkit.test.ts scripts/lib/layout-artifacts.test.ts`
Expected: FAIL because layout commands do not exist.

- [x] **Step 3: Implement CLI orchestration and artifacts**

Reuse `artifact-directory-promotion.ts`; never partially replace a good output. `validate` performs schema/reference/profile checks without search; `solve` never starts Browser; `explain` reads only the report and emits exact selected rows.

- [x] **Step 4: Run CLI/type gates**

Run: `pnpm vitest run scripts/cli/worldkit.test.ts scripts/lib/layout-artifacts.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/lib/layout-artifacts.ts scripts/lib/layout-artifacts.test.ts scripts/cli/worldkit.ts scripts/cli/worldkit.test.ts package.json pnpm-lock.yaml
git commit -m "feat: expose deterministic layout cli"
```

### Task 10: Coastal Golden Fixture and Browser Conformance

**Files:**
- Create: `examples/authoring/placement-coastal-world.json`
- Create: `scripts/verification/verify-placement-layout.ts`
- Create: `scripts/verification/verify-placement-layout.test.ts`
- Create: `examples/evidence/placement-coastal-world/layout-report.json`
- Create: `examples/evidence/placement-coastal-world/normalized-world-ir.json`
- Create: `examples/evidence/placement-coastal-world/world.build.json`
- Create: `examples/evidence/placement-coastal-world/world.png`
- Create: `examples/evidence/placement-coastal-world/verification.json`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `package.json`

**Interfaces:**
- Adds one command: `pnpm verify:placement-layout`.
- Browser protocol remains read-only for Solver data and returns layout assertion evidence; it exposes no mutation/search handle.

- [x] **Step 1: Write the coastal fixture and RED verifier**

Fixture contains one Heightfield, Water Region, solved Player Spawn Anchor, derived Camera, three solved primitive Landmarks and one Route. No Landmark has a final coordinate in Authoring. Include the eight S1 kinds across Required and Preferred constraints.

- [x] **Step 2: Run RED verifier**

Run: `pnpm verify:placement-layout`
Expected: FAIL before Browser/report/artifact support exists.

- [x] **Step 3: Implement positive Browser gates**

Prove final transforms match report/IR/Plan/Snapshot; support gap, overlap, route slope, camera screen region and visibility pass; fixed Seed/Profile repeated and concurrent runs produce identical report/IR/Plan hashes.

- [x] **Step 4: Implement negative integrity gates**

Mutations for Required conflict, Seed, Profile, bounds, missing Report, stale Report Hash and budget exhaustion must return exact codes and must not create/promote WorldPackage output. Browser must never auto-repair placement.

- [x] **Step 5: Generate evidence transactionally and inspect the PNG**

Run: `pnpm verify:placement-layout`
Expected: PASS and exact declared artifact set. View `world.png`; confirm three Landmarks, grounded spawn, no visible overlap, route continuity and required opening composition.

- [x] **Step 6: Run all conformance gates**

Run: `pnpm verify:canonical && pnpm verify:rigged-subject && pnpm verify:placement-layout && pnpm test && pnpm typecheck && pnpm build`
Expected: PASS; only the documented Vite chunk warning may remain.

- [x] **Step 7: Commit**

```bash
git add examples/authoring/placement-coastal-world.json scripts/verification/verify-placement-layout.ts scripts/verification/verify-placement-layout.test.ts examples/evidence/placement-coastal-world apps/playground/src/worldkit-browser-api.ts apps/playground/src/worldkit-browser-api.test.ts package.json
git commit -m "test: verify solved coastal layout end to end"
```

### Task 11: Documentation, Audit, and Completion

**Files:**
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md`
- Modify: this plan

**Interfaces:**
- Documents the exact V3/V3/V4 flow, AI examples, CLI, Report, limitations and product status without claiming P0.1 beyond S1.

- [x] **Step 1: Update current-status entrypoints and examples**

State exactly: “Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask/Route Graph、更多 Constraint 与 P0.1 整体仍未完成。” Show one Fixed and one Solved placement, Required/Preferred behavior, and the three layout CLI commands.

- [x] **Step 2: Run machine boundary audits**

Audit public Schema/IR/Plan/artifacts for obsolete V2 Authoring fields, provider terms, URI leakage, non-finite numbers, unimplemented Constraint kinds, duplicated `transform`+`placement`, and Solver access to filesystem/network/time/env/Babylon/Havok.

- [x] **Step 3: Run final verification from a clean worktree**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm verify:canonical && pnpm verify:rigged-subject && pnpm verify:placement-layout && git diff --check`
Expected: PASS, tracked verifier artifacts unchanged, no temp/backup/Vite residue.

- [x] **Step 4: Review every requirement against evidence**

Record commit hashes, exact test totals, IR/Plan/Report hashes, screenshot dimensions/hash, constraints/evidence, conflict and cache-integrity outcomes in this plan's Progress table. Do not mark deferred kinds or P0.1 overall complete.

- [x] **Step 5: Commit**

```bash
git add README.md docs/00-project-overview.md docs/17-canonical-json-quickstart.md docs/18-refactor-progress-and-backlog.md docs/superpowers/specs/2026-08-19-placement-constraint-layout-solver-design.md docs/superpowers/plans/2026-08-20-placement-layout-solver-s1.md
git commit -m "docs: complete placement solver s1 slice"
```

## Spec Coverage Matrix

| Spec requirement | Owning task(s) | Completion evidence |
|---|---|---|
| Placement vs Gameplay Relationship boundary | 2, 6, 11 | V3 closed Schema plus provider/relationship audit |
| Fixed/Solved Placement and eight closed kinds | 2, 4 | AJV exact-union tests and evaluator table |
| Region/Route/Screen Region inputs | 2, 3 | Schema tests and geometry-query tests |
| Deterministic candidates, Required/Preferred search | 3, 5 | mutation-tested order plus concurrent hash gate |
| Solver Profile, Seed, quantization and budgets | 1, 5 | immutable profile/hash tests and budget outcomes |
| Report, diagnostics, Conflict Core and repair suggestions | 5, 9 | canonical report tests and CLI explain artifacts |
| IR/Plan projection and no provider/URI leakage | 6, 7, 11 | exact-shape serialized negative assertions/audits |
| Runtime revalidation without relayout | 8 | injected assertion failure and ownership tests |
| CLI validate/solve/explain and transactionality | 9 | exit-code, rollback and deterministic byte tests |
| Coastal fixture, Route/Camera/Physics Browser gates | 10 | `verification.json`, PNG and Playwright verifier |
| Clean V3/V3/V4 cutover | 8, 10, 11 | no V2 production refs; all three verifiers green |
| Security/resource limits and no hidden I/O | 1, 3, 5, 11 | budget tests and source boundary audits |

## Progress

Placement Solver S1 首个海湾纵向切片已完成并进入回归；通用 Terrain Mask/Route Graph、更多 Constraint 与 P0.1 整体仍未完成。

### Final S1 evidence

- Coastal Fixture：3 个 Solved Landmark、1 个 Solved Spawn、1 个 Fixed Composition
  Anchor、1 条 Route、1 个 Screen Region；19 条 Required/Preferred Constraint 覆盖
  S1 八种关闭 Kind。
- `layoutSolveReportHash`：
  `sha256:b89559755fea6cf71beba7cf4a308cef35bcd99c19749b85d818a378124c1ebd`；
  `normalizedWorldIrHash`：
  `sha256:869fbf4e48fc6200d8512a643914d091358e3f8e254e705dffd315233e7c7190`；
  `executionPlanHash`：
  `sha256:e55aa781caa92af917b5224a3846e0ddd5e672b1ab9f3613fcb62645b3b98b6d`。
- Solver Profile Hash：
  `sha256:52129288492651e7ff052be16615597f09b7ceb290f136b5691829a0dff1b1cb`；
  Authoring Spec Hash：
  `sha256:3f5600ea5697d219463be49d5b741c5fabffd7999ac4b4e7250152e72cdb0c17`。
- Screenshot：936×596、23,709 bytes、
  `sha256:d5c8c2bd8bbba62c86903679792094d0e00d1f1d1d6ba5d55e743d409a414f04`、
  8 种采样 RGB；人工检查确认 Spawn、三个 Landmark 与水面可见且无可见重叠。
- Solver 搜索 72,041 nodes；接地最大间隙 0、支撑比例 1；Landmark 最小净空
  35.695m；Route 最大坡度 0°、117 个采样点；Lighthouse 可见比例 0.679312、
  投影面积比例 0.076655。
- 连续 2 次与并发 2 次 Report/IR Bytes、Plan Hash 相同。Required 冲突返回
  `PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED`；Seed/Profile/Bounds/Missing Report/
  Stale Hash/Budget 分别返回稳定 Code，且失败前后目标目录指纹完全一致。
- `pnpm test`：48 files / 435 tests；`pnpm typecheck`、`pnpm build`、
  `pnpm verify:canonical`、`pnpm verify:rigged-subject`、
  `pnpm verify:placement-layout` 全部通过；Build 仅保留既有 Vite large-chunk warning。

### Machine boundary audit evidence

| Boundary | Machine check and result |
|---|---|
| Obsolete V2 public surface | Production `rg` for `AuthoringSpecV2 / NormalizedWorldIRV2 / ExecutionPlanV3 / authoring-spec-v2` found only the private, non-exported one-time `migrate-v2-to-v3.ts`; public exports, apps, scripts, examples and artifacts are V3/V3/V4-only. |
| Provider isolation | Case-insensitive source audit found no Babylon/Havok term in Authoring, Layout Solver or examples. Compiler/Runtime Contract has exactly five approved backend discriminator literals; recursive generated-JSON audit allows only exact `runtimeBackend: babylon-havok` and `physics.backend: havok` value paths and rejects provider keys. |
| URI privacy | `sourceUri / licenseUri / artifactUri / .glb` audit is empty across Authoring V3 Schema/types, Compiler, ExecutionPlan and all coastal artifacts; the JSON Schema meta `$schema` URL is not world/resource provenance. |
| Finite canonical numbers | Recursive parse of all four coastal JSON artifacts verifies every numeric leaf with `Number.isFinite`; zero violations. |
| Closed implemented kinds | Schema and Fixture independently resolve exactly eight kinds: `distance-range`, `faces-entity`, `inside-region`, `minimum-clearance`, `outside-region`, `supported-by`, `visible-in-camera-region`, `within-slope-limit`; deferred kinds are absent. |
| One placement truth | `jq` over all six tracked Authoring examples found zero Object/Anchor nodes that contain both `transform` and `placement`. |
| Solver purity | Production Layout Solver audit for `node:fs/net/http/https`, `process.env/cwd`, time/performance, randomness, fetch, Babylon and Havok returned zero matches. |

| Task | Status | Commit | Evidence |
|---|---|---|---|
| 1. Layout Contracts/Profile | Complete | `c582fb8` | Profile manifest/hash, immutable resolver and protocol contract tests |
| 2. Authoring V3 | Complete | `de1361c` | Closed Placement/Spatial/Constraint Schema and V2→V3 one-time migration tests |
| 3. Geometry/Candidates | Complete | `cb8c21c` | Pure query port, quantized geometry and stable candidate tests |
| 4. Constraint Evaluators | Complete | `2ff1d79` | Exhaustive eight-kind evaluator table and non-finite/reference diagnostics |
| 5. Search/Report | Complete | `41c87eb` | Bounded deterministic search, Preferred ordering, Conflict Core and Report Hash |
| 6. Authoring/IR V3 | Complete | `9742862`, `4ec1a02`, `334f61b` | Camera aspect/fixed derivation plus Authoring→Solver→IR V3 projection |
| 7. Plan V4/Compiler | Complete | `2a59b2d` | Exact ExecutionPlan V4 projection and assertion/resource privacy tests |
| 8. Atomic Cutover/Runtime Assertions | Complete | `5e3ed01` | V3/V3/V4-only cutover; Runtime revalidation without repair and cleanup tests |
| 9. CLI | Complete | `797bfab` | layout validate/solve/explain, exit codes and transactional artifact tests |
| 10. Browser/E2E | Complete | `068b1d7` | Coastal Browser/Havok evidence, deterministic/negative gates and visible PNG |
| 11. Docs/Audit | Complete | `f7039fa` | Six entrypoint/design docs, seven machine boundaries, clean-worktree 48/435 + type/build + three Browser gates; completion evidence synchronized in the immediate follow-up commit |
