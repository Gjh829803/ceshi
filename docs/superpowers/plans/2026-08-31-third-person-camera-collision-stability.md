# Third-person Camera Collision Stability Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Deliver the first implementation slice from the 2026-08-30 camera collision design: a deterministic, exact-sweep third-person hard-collision path that uses one resolved target, does not collapse or pop in overlaps/corners, and preserves CameraDirector as the sole final-pose owner.

**Architecture:** Replace the two competing V1 query paths with one camera-specific Geometry Query V2 contract and one Babylon/Havok provider. Keep geometry facts in the provider, move hard-decollision and temporal state into provider-neutral camera code, and make CameraDirector build the damped proposed pose before applying the immediate safety clamp. Commit the resolved target, safe pose, decollision state, and telemetry atomically.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Babylon.js 9.23.0, Havok 1.3.14, pnpm 10.14.

**Design authority:** `docs/superpowers/specs/2026-08-30-third-person-camera-collision-and-spring-arm-design.md`

**Baseline:** `origin/main@14ba724b5660be9d47d90b374cc6ffeae8909e55`; focused baseline is 59/59 passing tests across the Spring Arm, Havok query, camera query, and camera preview suites.

---

## Authority map

| State or decision | Sole owner | Consumers | Reset / rollback representation |
| --- | --- | --- | --- |
| Camera semantic selection and locked parameters | `@whitebox-world/camera` selection | CameraDirector, preview | existing Director transaction |
| Ideal target and pose | `CameraViewSolverV1` under CameraDirector | pose damping, Hard Decollider | recomputed from committed context |
| Geometry facts | `BabylonHavokCameraGeometryQueryV2` | Spring Arm adapter / Hard Decollider | stateless query plus provider capability |
| Hard collision phase, stable contact, constrained arm and last safe pose | `CameraHardDecolliderV1` | CameraDirector, telemetry | explicit immutable transaction state |
| Final target, pose and FOV | `CameraDirectorV1` | Babylon camera, snapshot, renderer | existing atomic Director transaction extended with decollision state |
| Subject facing and locomotion | movement/runtime authority | Camera Context only | unchanged; camera never writes it |

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / stable integration point | Verification evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `CAM-0` | Freeze Git baseline, current authority census, design document, failing-fixture list and engine facts | — | `CAM-1` | docs/spec/plan; no runtime source | SHA/status, focused 59-test baseline, Babylon/Havok source references | `main-agent-only` |
| `CAM-1` | Freeze one current-only Camera Geometry Query V2 request/result/capability contract | `CAM-0` | `CAM-2`, `CAM-3` | `packages/camera/src/camera-domain.ts`, contract tests, public index | strict-schema RED→GREEN, deep freeze, bounds, truthful closest-hit capability | `sequential` |
| `CAM-2` | Replace the actual V1 sphere query and unused ray-fan path with one Babylon/Havok V2 provider | `CAM-1` | `CAM-3`, `CAM-5` | query provider files, runtime wiring, provider tests | real Havok wall/L-corner/door/overlap/normal fixtures; exact version probe | `sequential` |
| `CAM-3` | Add provider-neutral hard-decollision and temporal state | `CAM-1`, `CAM-2` | `CAM-4` | new `packages/camera/src/camera-hard-decollider.ts` and focused tests | wall recovery, overlap fallback, stable contact, clear hold, deterministic snapshot RED→GREEN | `sequential` |
| `CAM-4` | Reorder CameraDirector so one resolved target and one damped proposed pose feed the hard safety clamp | `CAM-3` | `CAM-5` | `camera-director.ts`, `spring-arm-component.ts`, preview regressions | target identity, no collision damping bypass, L-corner/narrow-door sequence, rollback, transition tests | `main-agent-only` |
| `CAM-5` | Complete runtime wiring, clean break, docs and relevant gates | `CAM-2`, `CAM-4` | delivery | world runtime/component/index wiring, obsolete V1 deletion, README/telemetry | focused tests, typecheck, root test, build, diff check, runtime deep review | `main-agent-only` |

Stable integration contracts:

- `CAM-2` consumes `CameraGeometryQueryRequestV2` and returns one bounded, capability-labelled `CameraGeometryQueryResultV2`; it never chooses a camera pose.
- `CAM-3` consumes an ideal/proposed arm, the V2 geometry fact, the prior decollision state, and fixed delta; it returns a safe pose plus the next state without touching Babylon.
- `CAM-4` computes the final resolved target and the position-damped proposed camera pose first, then asks the Spring Arm adapter for an immediate hard-safety clamp. The exact returned target and position are committed together.
- `CAM-5` wires the query only after the fixed physics commit already used by the Runtime and preserves rollback on any provider/projection failure.

---

### Task 1: Freeze Geometry Query V2 with strict RED tests (`CAM-1`)

**Files:**

- Modify: `packages/camera/src/camera-domain-contract.test.ts`
- Modify: `packages/camera/src/camera-domain.ts`
- Modify: `packages/camera/src/index.ts`
- Delete after replacement: `packages/runtime-framework/src/physics-world-query-port.ts`
- Modify: `packages/runtime-framework/src/index.ts`

**Contract to implement:**

```ts
type CameraGeometryQueryCapabilityV2 = Readonly<{
  shape: "sphere";
  maximumHitCount: 1;
  maximumExcludedEntityCount: 1;
  reportsContactNormal: true;
  reportsStartOverlap: true;
  penetrationDepth: "exact-or-zero";
}>;

type CameraGeometryQueryRequestV2 = Readonly<{
  schemaVersion: 2;
  committedTick: number;
  startPositionMetersXYZ: readonly [number, number, number];
  endPositionMetersXYZ: readonly [number, number, number];
  radiusMeters: number;
  collisionMask: "camera-hard";
  excludedEntityIds: readonly string[];
  maximumHitCount: 1;
}>;

type CameraGeometryHitV2 = Readonly<{
  hitEntityId?: string;
  travelDistanceMeters: number;
  travelFraction: number;
  hitPointMetersXYZ: readonly [number, number, number];
  hitNormalXYZ: readonly [number, number, number];
  startedOverlapping: boolean;
  penetrationDepthMeters: number;
  obstructionClass: "hard";
}>;

interface CameraGeometryQueryPortV2 {
  readonly capability: CameraGeometryQueryCapabilityV2;
  query(request: CameraGeometryQueryRequestV2): CameraGeometryHitV2 | undefined;
}
```

**Steps:**

1. Replace V1 ray-fan request/result tests with exact V2 exact-key, finite-value, normalized-normal, request-bound, duplicate-exclusion and deep-freeze cases.
2. Run `node node_modules/vitest/vitest.mjs run packages/camera/src/camera-domain-contract.test.ts` and confirm the new tests fail because V2 does not exist.
3. Implement the smallest strict parsers/types; reject capability claims or hit counts the locked provider cannot meet.
4. Remove the generic Runtime Framework V1 sphere port export once all compile errors have explicit V2 migration owners.
5. Rerun the focused contract file to green.

### Task 2: Build the truthful Babylon/Havok V2 provider (`CAM-2`)

**Files:**

- Add: `packages/runtime-babylon/src/babylon-camera-geometry-query.ts`
- Add/modify: `packages/runtime-babylon/src/babylon-camera-geometry-query.test.ts`
- Delete: `packages/runtime-babylon/src/babylon-camera-collision-query-port.ts`
- Delete: `packages/runtime-babylon/src/babylon-camera-collision-query-port.test.ts`
- Delete after migration: `packages/runtime-babylon/src/babylon-physics-world-query.ts`
- Delete after migration: `packages/runtime-babylon/src/babylon-physics-world-query.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`

**Steps:**

1. Write real-engine RED fixtures for contact normal, positive wall sweep, L-corner closest hit, narrow doorway, start overlap, overlap penetration evidence, excluded Subject body, invalid multi-exclusion request, reset/dispose, and throwing disposal.
2. Run only the new provider test and capture the expected missing-provider failures.
3. Implement one cached `PhysicsShapeSphere` provider using Babylon 9.23.0 `shapeProximity` before `shapeCast`; use `hitShapeResult.hitNormal`, report overlap explicitly, and derive non-negative penetration evidence only from locked provider output.
4. Keep `maximumHitCount: 1` and `maximumExcludedEntityCount: 1`; fail closed rather than pretending Havok exposes stable multi-hit/multi-ignore through this adapter.
5. Map all non-trigger static collision in this first slice to `camera-hard`; do not invent soft/transparent classification.
6. Rerun the provider tests to green, then delete the unused nine-ray provider and old generic query provider in the same clean break.

### Task 3: Implement provider-neutral Hard Decollider and temporal state (`CAM-3`)

**Files:**

- Add: `packages/camera/src/camera-hard-decollider.ts`
- Add: `packages/camera/src/camera-hard-decollider.test.ts`
- Modify: `packages/camera/src/index.ts`

**State and behavior:**

- Phases: `clear`, `constrained`, `recovering`, `emergency-inside`.
- Preserve stable hit entity/normal as telemetry/contact-cluster evidence.
- Immediate inward clamp is unconditional hard safety.
- A clear result starts a bounded clear hold, then monotonic exponential recovery capped by the existing locked recovery-speed parameter.
- Start overlap never returns the LookAt target as the camera position. It uses the previous committed safe pose/current committed pose and keeps a non-zero usable arm; it does not mark an unverified ideal pose safe.
- A shorter new contact always wins for safety. A different contact that only permits a longer arm cannot cause an outward pop.
- Snapshot/restore/reset are exact and deterministic.

**Steps:**

1. Add pure RED sequences for single wall, alternating L-corner identities/normals, narrow-door alternating contacts, clear-hold recovery, start overlap on first and later ticks, zero/negative delta, reset/rebind, and transaction restore.
2. Run the new test and confirm behavioral failures.
3. Implement the minimum tuple-math solver and immutable state; no Babylon imports.
4. Rerun to green and run the camera package boundary test to prove the provider-neutral boundary.

### Task 4: Integrate one resolved target and clamp after damping (`CAM-4`)

**Files:**

- Modify: `packages/runtime-babylon/src/spring-arm-component.ts`
- Modify: `packages/runtime-babylon/src/spring-arm-component.test.ts`
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Modify: `packages/runtime-babylon/src/camera-preview-channel.test.ts`
- Modify: `packages/runtime-babylon/src/camera-component.ts`

**Steps:**

1. Add RED Spring Arm tests that pass the V2 port, prove the full excluded-ID request, preserve a prior safe pose on overlap, hold alternating contacts, and roll state back byte-for-byte.
2. Add RED Director regressions proving:
   - the query start equals the exact target finally passed to `camera.setTarget()`;
   - target motion under collision follows target damping instead of a separate unsmoothed timeline;
   - position damping occurs before the safety clamp, so collision does not teleport every axis to the ideal pose;
   - a profile transition remains collision safe without bypassing target/FOV transition;
   - provider failure restores Camera and Decollider state.
3. Compute the resolved target from the View Solver result before collision. Shift the third-person ideal position by the same target delta.
4. Compute maximum-lag-bounded position damping and active profile-transition position before the collision query.
5. Apply the Hard Decollider as the last immediate position safety clamp; never bypass all damping merely because a hit exists.
6. Commit returned target, safe position, FOV, decollision state and telemetry in the existing Director transaction.
7. Rerun Spring Arm and preview tests to green.

### Task 5: Runtime wiring, clean break and verification (`CAM-5`)

**Files:**

- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime-projection.ts`
- Modify: `packages/runtime-babylon/src/world-runtime-snapshot.ts`
- Modify as required: focused fixtures importing the renamed query port
- Modify: `packages/camera/README.md`
- Modify: relevant camera review/telemetry documentation only when the code proves the claim

**Steps:**

1. Rename runtime ownership from generic `physicsWorldQuery` to `cameraGeometryQuery`; keep provider construction after Havok enablement, body registration before use, camera update after the committed physics step, and disposal exactly once.
2. Publish phase, stable normal, overlap and constrained-arm telemetry without exposing provider handles.
3. Search for and delete all production/test references to `PhysicsWorldQueryPortV1`, `BabylonHavokPhysicsWorldQueryV1`, `CameraCollisionQueryPortV1`, and `BabylonCameraCollisionQueryPortV1`.
4. Run focused tests:

```powershell
node node_modules/vitest/vitest.mjs run packages/camera/src/camera-domain-contract.test.ts packages/camera/src/camera-hard-decollider.test.ts packages/runtime-babylon/src/babylon-camera-geometry-query.test.ts packages/runtime-babylon/src/spring-arm-component.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts
```

5. Run final same-tree gates once:

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
git diff --check
```

6. Apply `docs/reviews/runtime-deep-review-checklist.md`: verify authority, exact engine semantics, adversarial transitions, lifetime/rollback, and evidence-layer claims.
7. Request code review, inspect the actual diff, add a focused reproducer for every confirmed defect, rerun only invalidated evidence, and report the first-slice claim honestly: static-building third-person hard-collision stability, not complete Indoor/AAA camera support.
