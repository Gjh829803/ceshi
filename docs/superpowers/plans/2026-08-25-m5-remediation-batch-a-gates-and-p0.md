# M5 Remediation Batch A: Gates and P0 Implementation Plan

> **Execution:** Implement task-by-task in the main process. Use subagents only when the user explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the fail-closed two-lane test gate, close the four effective M5 P0 findings with fix-before-fix RED/GREEN evidence, and formally withdraw the invalid step-up pose-delta finding.

**Architecture:** First replace the unstable single-process root Vitest command with an explicit complete lane manifest and three sequential processes. Then stabilize Path station/support authority, close zero-tick and Tick-0 receipt holes, and bind Build Input Envelope bytes to the admitted Lock. Babylon/Jolt source verification establishes that validated stair-step reposition is not governed by the ordinary `speed × dt` pose-delta oracle, so the step-up item changes documentation only. Public contracts use a clean break; no aliases or fallback reads are allowed.

**Tech Stack:** TypeScript 5.9, Vitest 3.2.7 public Node API, Babylon.js 9.21.2, Havok 1.3.14, Recast Navigation 0.43.1, pnpm 10.14.

**Spec:** `docs/superpowers/specs/2026-08-25-m5-traversability-remediation-design.md`

## Global Constraints

- Every production behavior change starts with a focused test that is observed failing for the expected reason.
- `checkSupport()` remains owned only by MotionKernel; Route code consumes retained evidence and never performs a second support query.
- Do not change movement profiles, tolerances, Feel speed, slope/step ownership, or public units.
- Route V2 is unreleased: update every local consumer atomically and do not preserve an old factory overload or alias field.
- Gate work adds no dependency and must not modify `pnpm-lock.yaml`.
- Do not modify `codex/modular-subject-source-assets`; its future test must make census RED until explicitly classified.
- Resource-heavy verification processes run serially and exclusively.

---

### Task 1: Freeze the complete test-lane manifest and census API

**Files:**

- Create: `scripts/lib/test-gate-manifest.ts`
- Create: `scripts/lib/test-gate-census.ts`
- Create: `scripts/lib/test-gate-census.test.ts`
- Create: `scripts/verify-test-gate-census.ts`

**Interfaces:**

- Produces:

```ts
export type TestLaneV1 = "contract" | "resource-heavy";
export type ResourceHeavyReasonCodeV1 =
  | "browser-or-server-process"
  | "native-havok-or-recast"
  | "measured-duration"
  | "measured-memory"
  | "measured-contention";

export interface TestGateManifestEntryV1 {
  readonly path: string;
  readonly lane: TestLaneV1;
  readonly reasonCodes?: readonly ResourceHeavyReasonCodeV1[];
}

export interface TestGateCensusReportV1 {
  readonly rootTestFiles: readonly string[];
  readonly contractTestFiles: readonly string[];
  readonly resourceHeavyTestFiles: readonly string[];
}

export function evaluateTestGateCensusV1(input: {
  readonly rootTestFiles: readonly string[];
  readonly contractConfigTestFiles: readonly string[];
  readonly resourceHeavyConfigTestFiles: readonly string[];
  readonly manifest: readonly TestGateManifestEntryV1[];
}): TestGateCensusReportV1;

export async function discoverVitestTestFilesV1(input: {
  readonly repositoryRoot: string;
  readonly configPath: string;
}): Promise<readonly string[]>;
```

- Error codes are stable strings: `UNCLASSIFIED`, `STALE`, `DUPLICATE`, `OUTSIDE_ROOT`, `CONFIG_DRIFT`, `HEAVY_REASON_MISSING`.

- [ ] **Step 1: Write collection-level RED tests**

Add table-driven cases that require the API to reject: a root path absent from the manifest; the same path twice; one path in both lane config sets; a stale manifest path; `../outside.test.ts`; an unsorted manifest; and a resource-heavy row with no reason code. Add one passing case whose three sorted files appear exactly once across two lanes.

```ts
expect(() => evaluateTestGateCensusV1({
  rootTestFiles: ["packages/a.test.ts", "scripts/new.test.ts"],
  contractConfigTestFiles: ["packages/a.test.ts"],
  resourceHeavyConfigTestFiles: [],
  manifest: [{ path: "packages/a.test.ts", lane: "contract" }],
})).toThrow(/UNCLASSIFIED: scripts\/new\.test\.ts/);
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
pnpm exec vitest run scripts/lib/test-gate-census.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the census module/API does not yet exist.

- [ ] **Step 3: Implement canonical manifest evaluation**

Normalize only repository-relative POSIX paths, require strict lexical order, compare sets without silently sorting caller input, and return deeply frozen sorted arrays. Do not default unclassified files to `contract`.

- [ ] **Step 4: Add real Vitest discovery**

Use the installed public API and close it in `finally`:

```ts
const vitest = await createVitest("test", {
  root: input.repositoryRoot,
  config: input.configPath,
  run: true,
  watch: false,
});
try {
  const specifications = await vitest.globTestSpecifications();
  return canonicalRepositoryRelativePaths(
    specifications.map((specification) => specification.moduleId),
    input.repositoryRoot,
  );
} finally {
  await vitest.close();
}
```

- [ ] **Step 5: Populate the complete current-tree manifest**

Classify every root-discovered test explicitly. Use the resource-heavy list and reason criteria frozen in the spec; classify `scripts/verification-browser-launch.test.ts` as `contract`. Keep all rows lexically sorted.

- [ ] **Step 6: Run focused GREEN and commit**

Run the Step 2 command and `git diff --check`. Commit:

```bash
git add scripts/lib/test-gate-manifest.ts scripts/lib/test-gate-census.ts scripts/lib/test-gate-census.test.ts scripts/verify-test-gate-census.ts
git commit -m "test: add fail-closed test lane census"
```

---

### Task 2: Wire independent contract and resource-heavy Vitest processes

**Files:**

- Create: `vitest.shared.ts`
- Create: `vitest.contract.config.ts`
- Create: `vitest.resource-heavy.config.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `scripts/lib/test-gate-census.test.ts`

**Interfaces:** Consumes the complete manifest and discovery API from Task 1. Produces `test:census`, `test:contract`, `test:resource-heavy`, and the sequential root `test` wrapper.

- [ ] **Step 1: Add source-backed config drift RED**

Read `package.json` and require:

```ts
expect(packageJson.scripts.test).toBe(
  "pnpm test:census && pnpm test:contract && pnpm test:resource-heavy",
);
```

Invoke real discovery for root/contract/resource configs and require `evaluateTestGateCensusV1()` to accept exactly those sets.

- [ ] **Step 2: Run census test and observe RED**

Use the Task 1 focused command. Expected: FAIL because lane configs and scripts do not exist.

- [ ] **Step 3: Implement shared and lane configs**

Keep the root include globs and common Node environment in `vitest.shared.ts`. Contract config uses the manifest's contract paths with `pool: "threads"`, `minWorkers: 1`, `maxWorkers: 2`. Resource config uses only heavy paths with `fileParallelism: false`, `minWorkers: 1`, `maxWorkers: 1`. Do not set `passWithNoTests`.

- [ ] **Step 4: Replace the root wrapper**

Set exactly:

```json
{
  "test": "pnpm test:census && pnpm test:contract && pnpm test:resource-heavy",
  "test:census": "tsx scripts/verify-test-gate-census.ts",
  "test:contract": "vitest run --config vitest.contract.config.ts",
  "test:resource-heavy": "vitest run --config vitest.resource-heavy.config.ts",
  "test:focused": "vitest run"
}
```

- [ ] **Step 5: Verify the gate**

Run:

```bash
pnpm test:census
pnpm test:contract
pnpm test:resource-heavy
pnpm exec vitest run scripts/lib/route-validation-runner.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
pnpm test
pnpm test
```

Expected: census and both complete wrapper repetitions pass without changing the 180-second Route timeout.

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts vitest.shared.ts vitest.contract.config.ts vitest.resource-heavy.config.ts scripts/lib/test-gate-census.test.ts
git commit -m "test: split contract and resource-heavy gates"
```

---

### Task 3: Make Route support station total and 3D-authoritative

**Files:**

- Modify: `packages/traversal/src/runtime-probe-contract.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`
- Modify: `packages/validation/src/route-runtime-probe.test.ts`

**Interfaces:** Extend `advanceRouteRuntimeProbeSupportStationV2()` output with `totalArcLengthMeters` and `remainingArcLengthMeters`. Its position parameter is semantically `sampledFootPositionMetersXYZ`.

- [ ] **Step 1: Add station RED cases**

Add a one-node/zero-edge canonical Path whose sole identity is `surface-a`; expect arc/remaining/total all `0`, expected IDs `['surface-a']`, and empty retained segments. Add a 3D vertical segment and a layered non-adjacent XZ crossing to prove the helper does not flatten topology.

- [ ] **Step 2: Observe RED**

```bash
pnpm exec vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts -t "support station"
```

Expected: current one-node case throws while reading identity/point index `1`.

- [ ] **Step 3: Implement total station semantics**

For a single point, return its sole Surface identity without reading a segment. For multi-point paths, preserve ordered 3D arc projection and contiguous tied segments. Return:

```ts
{
  arcLengthMeters: nextArc,
  totalArcLengthMeters: polyline.total,
  remainingArcLengthMeters: Math.max(0, polyline.total - nextArc),
  expectedTraversalSurfaceIds,
  retainedSegmentIndexes,
}
```

Delete no canonical Path shapes and add no XZ-only rejection.

- [ ] **Step 4: Run GREEN and adjacent contracts**

```bash
pnpm exec vitest run packages/traversal/src/path-receipt.test.ts packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/traversal/src/runtime-probe-contract.ts packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts
git commit -m "fix(traversal): make route support station total"
```

---

### Task 4: Close long-loop zero-tick completion

**Files:**

- Modify: `packages/validation/src/route-runtime-probe.ts`
- Modify: `packages/validation/src/route-runtime-probe.test.ts`

**Interfaces:** Consumes Task 3 station totals. Arrival requires endpoint tolerance, expected support, and remaining canonical arc within the existing destination tolerance.

- [ ] **Step 1: Add arrival RED matrix**

Add the reproduced lower→ramp→upper path with total arc `16.795m` and endpoint XZ distance `0.4m`; assert `fixedTickCallCount > 0` and no zero-tick complete. Add a true `0.4m` total path and require legal zero-tick completion. Add a tick case near the endpoint but outside the final retained-foot station.

- [ ] **Step 2: Observe RED**

```bash
pnpm exec vitest run packages/validation/src/route-runtime-probe.test.ts -t "zero-tick|remaining route arc"
```

Expected: the long path returns complete with zero ticks.

- [ ] **Step 3: Implement one arrival predicate**

Use the same predicate for initial and per-tick completion:

```ts
const hasArrived =
  hasExpectedSurface &&
  station.remainingArcLengthMeters <= thresholds.destinationToleranceMetersXZ &&
  distanceXZ(sampledFootXZ, destination) <= thresholds.destinationToleranceMetersXZ;
```

For initial evidence, `hasExpectedSurface` must already have passed the Tick-0 support check. Do not add or widen a tolerance.

- [ ] **Step 4: Run focused GREEN and commit**

Run the entire `route-runtime-probe.test.ts`, then commit its source and test with message `fix(validation): require route arc completion`.

---

### Task 5: Use retained-foot position for every support station

**Files:**

- Modify: `packages/validation/src/route-runtime-probe.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.ts`
- Modify: `packages/validation/src/route-runtime-probe.test.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`

**Interfaces:** `TraversalRuntimeTickEvidenceV1.characterSupport.sampledFootPositionMetersXYZ` is the sole station position. `subjectPositionMetersXYZ` remains the subject pose for deviation/intent and is not a support locator.

- [ ] **Step 1: Add asymmetric RED**

Create evidence whose subject origin has crossed to segment/Surface B while retained foot remains on segment/Surface A. Require runner expected IDs and context validation to select A. Add reset/rebind evidence proving no prior station survives reset.

- [ ] **Step 2: Observe RED**

Run both focused files and confirm the current runner/context choose B.

- [ ] **Step 3: Replace both station call sites**

At initial and every tick, pass:

```ts
evidence.characterSupport.sampledFootPositionMetersXYZ
```

Keep subject origin for steering, route deviation, and presentation position. Do not invoke `checkSupport()`.

- [ ] **Step 4: Run GREEN and Runtime support conformance**

```bash
pnpm exec vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts
```

- [ ] **Step 5: Commit**

Commit source/tests with message `fix(traversal): station route support at retained foot`.

---

### Task 6: Reject forged Tick-0 support in complete Probe receipts

**Files:**

- Modify: `packages/traversal/src/runtime-probe-contract.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`

**Interfaces:** Canonical metrics always include the initial mismatch. Context validation re-derives Tick-0 expected IDs from Task 3/5 and requires a Tick-0 mismatch failure with no later ticks.

- [ ] **Step 1: Add forged-receipt RED matrix**

From a complete receipt with later ticks, independently mutate initial `surfaceResolution` to `ambiguous`, `unmatched`, and a different resolved Surface. Require both the standalone canonicalizer and Path-aware context validator to reject; require `wrongSupportSurfaceCount` to include Tick 0.

- [ ] **Step 2: Observe RED**

```bash
pnpm exec vitest run packages/traversal/src/runtime-probe-contract.test.ts -t "Tick 0|initial support"
```

- [ ] **Step 3: Implement initial mismatch accounting**

Compute initial mismatch before folding tick rows. A complete receipt rejects any initial unresolved/ambiguous support. The context validator additionally compares a resolved initial Surface against the retained-foot station and rejects mismatch even when `ticks.length > 0`.

- [ ] **Step 4: Run GREEN and commit**

Run all `runtime-probe-contract.test.ts`, then commit with message `fix(traversal): validate Tick 0 support evidence`.

---

### Task 7: Make Build Input receipt self-bind its Lock-derived Envelope

**Files:**

- Modify: `packages/traversal/src/build-input.ts`
- Modify: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/build-input.v2.test.ts`
- Modify: `packages/traversal/src/route-v2-test-support.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.ts`
- Modify all current factory call sites returned by `rg -n 'createRouteBuildInputReceiptV2\(' --glob '!docs/**'`
- Modify orchestrator and adjacent tests that construct Build Input receipts

**Interfaces:** Clean-break factory:

```ts
export interface CreateRouteBuildInputReceiptV2Input {
  readonly input: RouteBuildInputV2;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
}

export interface RouteBuildInputReceiptV2 {
  readonly input: RouteBuildInputV2;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly routeBuildInputHash: Sha256Hash;
  readonly budgetEvidence: RouteBuildBudgetEvidenceV2;
}

export function createRouteBuildInputReceiptV2(
  value: CreateRouteBuildInputReceiptV2Input,
): RouteBuildInputReceiptV2;
```

- [ ] **Step 1: Add Envelope tamper RED matrix**

Create one real Lock/Envelope/Build Input chain. Mutate only `capsuleRadiusMeters`, `capsuleHeightMeters`, `colliderCenterOffsetMetersXYZ`, `maxSlopeDegrees`, and `maxStepHeightMeters` while retaining the Lock hash. Require both factory and standalone receipt assert to reject every case.

- [ ] **Step 2: Observe RED**

```bash
pnpm exec vitest run packages/traversal/src/build-input.test.ts packages/traversal/src/build-input.v2.test.ts -t "Lock-derived Envelope"
```

Expected: current factory accepts at least the radius/slope/step mutations.

- [ ] **Step 3: Implement self-sufficient receipt admission**

Canonicalize the Lock receipt, resolve the Envelope's registered Graph Builder Profile, call `createTraversalCapabilityEnvelopeV1({ traversalLockReceipt, graphBuilderProfile })`, and require deep canonical byte equality with `input.capabilityEnvelope`. Require all three Lock hashes—receipt, Envelope, and input—to match before computing `routeBuildInputHash`.

`assertRouteBuildInputReceiptV2()` must reconstruct expected bytes from the receipt's own `input` and `traversalLockReceipt`. Delete the old single-argument factory shape; do not add an overload.

- [ ] **Step 4: Migrate every producer and fixture atomically**

Use the existing orchestrator Lock receipt. Test fixtures must create a real canonical Lock receipt; they may not forge a placeholder hash.

- [ ] **Step 5: Run complete adjacent suites**

```bash
pnpm exec vitest run packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-input.test.ts packages/traversal/src/build-input.v2.test.ts packages/traversal-recast/src/heightfield-source.test.ts scripts/lib/route-validation-orchestrator.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit**

Commit all atomic factory/consumer changes with message `fix(traversal): bind build input envelope to lock`.

---

### Task 8: Withdraw the invalid fixed-tick step-up oracle

**Files:**

- Modify: `docs/reviews/2026-08-24-m5-route-traversability-deep-review.md`
- Modify: `docs/superpowers/specs/2026-08-25-m5-traversability-remediation-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-m5-remediation-batch-a-gates-and-p0.md`

**Interfaces:** No production interface changes. Stair stepping remains a provider-owned kinematic reposition accepted only after Babylon's up/forward/down casts validate clearance and landing. Ordinary locomotion keeps its fixed-tick budget; the stair landing pose itself is not constrained by a `speed × dt` pose-delta assertion.

- [x] **Step 1: Reproduce the observation and inspect the installed engine source**

The real `success-steps-platform-ramp` fixture reproduces the observed approximately `0.34m` stair tick. Installed Babylon.js 9.21.2 explicitly labels step-up as teleport/reposition and validates it with upward, forward, and downward casts before committing the landing pose.

- [x] **Step 2: Compare against an independent production KCC**

Jolt CharacterVirtual `WalkStairs` uses the same up/forward/down collision-cast pattern and intentionally supplies minimum forward travel because high-frequency `velocity × dt` can be too short to mount a step. Its official tests cover 60/120/240/360 Hz stair progression.

- [x] **Step 3: Run minimal counter-hypothesis experiments**

Removing the padded forward travel makes the legal 0.25m fixture fail `runtime-stalled`. A provider-private multi-tick clipping experiment stops the capsule at the stair side and fails `support-surface-mismatch` with `surfaceResolutionMode="unmatched"`. Revert both experiments; neither is a valid fix.

- [x] **Step 4: Correct the finding and preserve the real gates**

Withdraw the P0 and explain why the observed pose delta does not establish an unchecked skip. Do not modify Runtime code. Keep existing R1b coverage for legal 0.25m success, over-height 0.35m failure, narrow-tread failure, penetration/dynamic/slope rejection, and cadence stability.

- [ ] **Step 5: Commit**

Commit the evidence correction with message `docs: withdraw invalid step-up finding`.

---

### Task 9: Batch A integration and evidence checkpoint

**Files:**

- Modify: `docs/reviews/2026-08-24-m5-route-traversability-deep-review.md`
- Modify: `docs/superpowers/plans/2026-08-25-m5-remediation-batch-a-gates-and-p0.md` checkbox state only after evidence exists

**Interfaces:** Integrates Tasks 1–8 on one tree; no worker report substitutes for this gate.

- [ ] **Step 1: Review actual commits and authority invariants**

Confirm one support query, retained-foot station, no old Build Input factory overload, no test omitted from census, and no timeout increase.

- [ ] **Step 2: Run Batch A gates**

```bash
pnpm test:census
pnpm test:contract
pnpm test:resource-heavy
pnpm typecheck
pnpm build
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
pnpm verify:canonical
pnpm verify:unreleased-clean-break
pnpm exec vitest run scripts/worldkit-route-run.integration.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

- [ ] **Step 3: Repeat the complete wrapper**

Run `pnpm test` twice. Both executions must pass with the 180-second Route timeout unchanged.

- [ ] **Step 4: Update the report precisely**

For each P0 record the fix commit, RED command/result, GREEN command/result, and remaining limitations. Do not mark M5 Final GO; Batch B P1 findings remain open.

- [ ] **Step 5: Commit the checkpoint**

```bash
git add docs/reviews/2026-08-24-m5-route-traversability-deep-review.md docs/superpowers/plans/2026-08-25-m5-remediation-batch-a-gates-and-p0.md
git commit -m "docs: record M5 batch A remediation evidence"
```
