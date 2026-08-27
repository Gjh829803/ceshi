# Open-source Core Adversarial Runtime Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the accepted Godot, Rapier, Bevy, and camera-controls references into real Babylon/Havok adversarial evidence for camera collision, mounted transforms, and grounded-only step-up behavior.

**Architecture:** Keep Canonical Schema, Gameplay Relationship truth, `checkSupport()` ownership, CameraDirector selection, and fixed-tick publication unchanged. Each slice starts with one real-engine fixture; production code changes only when that fixture demonstrates a current defect, and any fix stays inside the existing provider-owned adapter.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Babylon.js 9.21.2, Havok 1.3.14, existing Authoring V4 → ExecutionPlan V5 fixture compiler.

**Spec:** `docs/21-open-source-design-reference-ledger.md`

> Integration reconciliation (2026-08-26): `codex/camera-development` replaced the temporary nine-ray
> `FollowArmSolverV1` closure with `SpringArmComponentV1` plus provider-neutral
> `PhysicsWorldQueryPortV1`. The accepted adversarial fixtures now live in
> `babylon-physics-world-query.test.ts` and run against real Havok ShapeCast/shapeProximity. The task
> history below remains useful RED/GREEN provenance; the reconciled paths and final implementation are
> authoritative in the ledger and completion review.

## Global Constraints

- `checkSupport()` remains the only Ground support owner; no terrain-height, ray, or AABB grounding path may be added.
- `mountedOn` Gameplay state remains authoritative; Babylon node parenting is a derived rendering mechanism only.
- CameraDirector remains the owner of orbit, target, Profile, Context, and View publication; Follow Arm owns collision probing and recovery only.
- Tests use real Babylon scene queries and real Havok Character behavior where the claim depends on engine semantics.
- No Canonical Authoring, ExecutionPlan, Browser Protocol, Command, Event, or Snapshot field changes are allowed in this plan.

---

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Input → output contract and integration point | Evidence | Mode |
|---|---|---|---|---|---|---|---|
| `CAM-COLL-01` | Detect a thin diagonal blocker inside the configured Follow Arm collision cross-section using real Havok | none | `CAM-SWEEP-01` | `packages/runtime-babylon/src/babylon-physics-world-query.ts`, its focused test | `SphereSweepRequestV1` → `SphereSweepHitV1`; integration stays behind `PhysicsWorldQueryPortV1` | RED on ray/multi-ray approximation, GREEN on true ShapeCast; focused test | sequential, main-agent-only |
| `MNT-XFORM-01` | Prove a rotated Mount and asymmetric local Socket/slot offset produce the same Rider world pose in prepared projection, committed controller/visual, and the next fixed Tick | `CAM-COLL-01` only for shared review ordering | `MNT-PAIR-01` | mounted section of `packages/runtime-babylon/src/runtime.test.ts`; production `mountedPose()` only if RED | Frozen Mount pose + local Socket/slot → Rider Subject Origin and yaw; `mountedOn` remains source-of-truth | Real Havok Runtime, immediate pre/post commit, visual/controller/snapshot, reset cleanup | sequential, main-agent-only |
| `TRAV-STEP-01` | Prove the same admitted static step is climbed while grounded but cannot pull an airborne Character upward | `MNT-XFORM-01` only for shared fixture ownership | `TRAV-SNAP-01` | traversal section of `packages/runtime-babylon/src/runtime.test.ts`; `motion-kernel-runtime.ts` only if RED | Existing Character collider `maxStepHeightMeters` + fixed input → real Havok position/support state | Grounded/airborne paired fixture, immediate support state, fixed-tick final pose | sequential, main-agent-only |
| `OS-LEDGER-02` | Update the living ledger with adopted files, outcome, and exact fresh gates | all three slices | none | `docs/21-open-source-design-reference-ledger.md` | Candidate rows → `已吸收测试` or documented rejected hypothesis | Link/claim inspection and `git diff --check` | sequential, main-agent-only |

### Task 1: `CAM-COLL-01` real Babylon diagonal blocker

**Files:**
- Modify: `packages/runtime-babylon/src/follow-arm-solver.test.ts`
- Modify only after RED: `packages/runtime-babylon/src/follow-arm-solver.ts`

**Interfaces:**
- Consumes: `FollowArmSolverV1.solve(request: FollowArmSolveRequestV1): FollowArmSolveResultV1`.
- Produces: the same result type; no new public field. A detected blocker lowers `safeArmLengthMeters`, sets `isCollisionRetracted`, and reports the blocker entity ID.

- [x] **Step 1: Add a real Babylon fixture test**

  Create a `NullEngine`, `Scene`, and a `MeshBuilder.CreateBox` blocker centered near `(0.32, 0.32, 5)` with a cross-section narrow enough to miss center/cardinal rays but inside the `0.5m` collision radius. Set `isPickable=true` and `metadata.worldkitEntityId="diagonal-blocker"`. Call `solve()` from target `(0,0,0)` toward desired camera `(0,0,10)` and assert `safeArmLengthMeters < 10`, `isCollisionRetracted === true`, and the blocker ID is published. Dispose Scene and Engine in `finally`.

- [x] **Step 2: Run the focused test and verify RED**

  Run: `pnpm exec vitest run packages/runtime-babylon/src/follow-arm-solver.test.ts`

  Expected: the new test fails because the current center/cardinal five-ray pattern does not hit the diagonal blocker; the four existing tests stay green.

- [x] **Step 3: Add the minimum provider-local probe closure**

  Extend the current offset list with four diagonal directions:

  ```ts
  const diagonalScale = radius / Math.SQRT2;
  const diagonalRight = right.scale(diagonalScale);
  const diagonalUp = probeUp.scale(diagonalScale);
  // add ±diagonalRight ±diagonalUp after the existing five offsets
  ```

  Keep the current inclusive minimum-hit selection, Subject filter, telemetry, immediate retraction, and capped recovery untouched. Do not add Havok ownership or a new public parameter.

- [x] **Step 4: Run focused GREEN and adjacent camera integration tests**

  Run: `pnpm exec vitest run packages/runtime-babylon/src/follow-arm-solver.test.ts packages/runtime-babylon/src/camera-preview-channel.test.ts`

  Expected: all tests pass; the Subject-filter test records nine provider queries rather than five.

### Task 2: `MNT-XFORM-01` rotated asymmetric Mount pose

**Files:**
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify only if the real test is RED: `packages/runtime-babylon/src/babylon-world-runtime.ts`

**Interfaces:**
- Consumes: `prepareMountedRelationshipTransition()` and the frozen `SubjectMountSlotDefinitionV1` contract.
- Produces: no new API; Rider world position is `TransformCoordinates(slotOffset, socketWorldMatrix)` and Rider facing equals committed Mount yaw.

- [x] **Step 1: Add a paired transform fixture**

  Clone `createValidMountedOnAuthoringSpec()`, give the Mount anchor a yaw of `Math.PI / 2`, give `MountStand.localTransform.positionMetersXYZ` distinct X/Y/Z values, and give `riderSubjectOriginOffsetMetersXYZ` another asymmetric X/Y/Z vector. Prepare Mount, inspect `projectedWorldStateAfter`, commit, inspect the Runtime debug probe and world projection immediately, run one fixed Tick, and inspect again.

- [x] **Step 2: Prove the test is capable of failing**

  Before accepting a characterization GREEN, temporarily replace the expected world-space X/Z transform with the unrotated local sum and run the focused test. Expected: mismatch on X/Z. Restore the correct expectation and rerun. No production mutation is retained for an already-correct implementation.

- [x] **Step 3: Implement only if the correct expectation is RED**

  If current `mountedPose()` disagrees with the frozen spec, keep the fix inside that function using Babylon `socket.getWorldMatrix()` and the Mount controller yaw. Do not parent the Rider or infer the Relationship from renderer state.

- [x] **Step 4: Run focused mounted evidence**

  Run: `pnpm exec vitest run packages/runtime-babylon/src/runtime.test.ts -t "rotated asymmetric Mount"`

  Expected: prepared projection, committed controller/visual, and next-Tick world state agree to six decimals; Reset restores the authored initial Relationship state without residual pose.

### Task 3: `TRAV-STEP-01` grounded versus airborne step-up

**Files:**
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify only after RED and root-cause proof: `packages/runtime-babylon/src/motion-kernel-runtime.ts`

**Interfaces:**
- Consumes: existing Character collider `maxStepHeightMeters`, real ExecutionPlan V5 static-collider rows, and fixed input.
- Produces: no new API; grounded Character may climb an admitted step below the maximum, airborne Character must remain governed by gravity/collision and must not be lifted by step-up.

- [x] **Step 1: Build one paired real-Havok fixture**

  Add an ExecutionPlan helper with flat terrain and one static box whose top is below `maxStepHeightMeters`. Run one grounded Subject horizontally into it and assert forward progress plus elevated supported pose. Run the same geometry with a Subject starting unsupported above/alongside the riser and assert no upward step impulse and no fabricated `ground` state before real contact.

- [x] **Step 2: Verify the regression can fail**

  Run the paired focused test first. If both branches already pass, temporarily invert the airborne height assertion to demonstrate the test observes the distinction, then restore it. If the correct assertion fails, preserve the RED output as the bug reproducer.

- [x] **Step 3: Fix only a reproduced defect**

  Any fix must gate the existing provider-local step-up path with the pre-integration `CharacterSurfaceInfo` supplied by Havok. It must not call a second support query, terrain sampler, raycast, or AABB ground test.

- [x] **Step 4: Run focused traversal evidence**

  Run: `pnpm exec vitest run packages/runtime-babylon/src/runtime.test.ts -t "grounded.*airborne.*step"`

  Expected: grounded branch climbs; airborne branch does not gain step-up height; adjacent ledge, jump, and support-owner tests remain green.

### Task 4: Update ledger and close affected gates

**Files:**
- Modify: `docs/21-open-source-design-reference-ledger.md`

**Interfaces:**
- Consumes: final source/test diff and command evidence.
- Produces: exact adopted/rejected status and local integration links; no capability-completion claim.

- [x] **Step 1: Update candidate states**

  Mark each completed row `已吸收测试`; record whether production code changed and why. If a hypothesis was disproved, record the existing behavior and retained test rather than inventing a defect.

- [x] **Step 2: Run final affected gates once**

  Run focused regressions after each slice, then on the final Runtime tree run:

  ```bash
  pnpm typecheck
  pnpm test
  pnpm build
  git diff --check
  ```

  Record automated-contract evidence separately from any rendered/manual evidence; this plan makes no control-feel claim.
