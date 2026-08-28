# Whitebox 3C vNext Golden Humanoid Implementation Plan

> **For Codex:** Execute this plan task-by-task with Subagent-Driven Development. Each implementation
> task starts with a focused failing test, receives a task-compliance review, and is committed only
> after focused GREEN. Use the Windows pinned Node entrypoints when the repository's configured WSL
> script shell is unavailable.

**Goal:** Replace the Golden Humanoid's competing Motion Kernel, action inference, animation and camera
paths with one deterministic movement authority and provider-neutral contracts, then remove the old
authority in the same branch.

**Architecture:** `CharacterMovementRuntime + MovementMode + TransitionResolver + LayeredMove` owns
movement semantics. Babylon/Havok is isolated behind `CharacterBodyPortV1`. RuntimeHost commits state
once; Action, animation and camera consume committed state. CameraDirector alone owns final camera pose.

**Tech stack:** TypeScript 5.9, Vitest 3.2.7, Babylon.js 9.21.2, Havok 1.3.14, pnpm 10.14.

**Spec:** `docs/superpowers/specs/2026-08-26-whitebox-3c-vnext-architecture-design.md`

**Baseline rulings:** Full-suite inherited failures are recorded in the SDD ledger. New 3C focused
tests must be green. No automated process may fabricate a `FeelReviewReceipt`; the shipped profile
status remains `experimental` pending two human rounds.

### Task 1: Freeze contracts, package boundary and migration ledger (`3C-0/3C-1`)

**Files:**

- Create: `config/3c-migration-ledger.json`
- Create: `scripts/verification/verify-3c-migration.ts`
- Create: `scripts/verification/verify-3c-migration.test.ts`
- Modify: `package.json`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Create: `packages/runtime-contracts/src/character-movement-contracts.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Create: `packages/character-movement/package.json`
- Create: `packages/character-movement/tsconfig.json`
- Create: `packages/character-movement/src/index.ts`
- Create: `packages/character-movement/src/package-boundary.test.ts`
- Modify: `packages/camera/src/camera-domain.ts`
- Modify: `packages/camera/src/camera-domain-contract.test.ts`

**Public interfaces:** strict `LocomotionCapabilityStateV2`, transition events, `LayeredMoveV1`, opaque
tick tokens, Body sample/proposal/resolution/commit shapes, `CharacterBodyPortV1`,
`CharacterMovementRuntimeV1`, `CameraContextSampleV2`, `CameraCollisionQueryPortV1` and stable `3C_*`
diagnostic codes exactly as specified.

- [x] Add RED contract tests proving exact-key parse/freeze, suspended-state closure, illegal
  ground/vertical combinations, one event schema per transition, and rejection of non-finite values.
- [x] Add RED verifier tests for malformed ledger, increased live reference count, a `completed` slice
  with live old symbols and a target owner outside the package boundary.
- [x] Add the strict parsers and exports without adding Babylon/Havok imports to neutral packages.
- [x] Seed the ledger with every Golden legacy authority symbol and measured source reference count.
- [x] Add `verify:3c-migration` and make the package-boundary test prove the new dependency direction.
- [x] Run focused gameplay-contracts, runtime-contracts, camera and verifier tests, then typecheck.

### Task 2: Implement deterministic CharacterMovementRuntime (`3C-2`)

**Files:**

- Create: `packages/character-movement/src/transition-resolver.ts`
- Create: `packages/character-movement/src/transition-resolver.test.ts`
- Create: `packages/character-movement/src/layered-move.ts`
- Create: `packages/character-movement/src/layered-move.test.ts`
- Create: `packages/character-movement/src/root-motion-source.ts`
- Create: `packages/character-movement/src/root-motion-source.test.ts`
- Create: `packages/character-movement/src/character-movement-runtime.ts`
- Create: `packages/character-movement/src/character-movement-runtime.test.ts`
- Modify: `packages/character-movement/src/index.ts`

**Produces:** a pure fixed-tick state machine with jump buffer, coyote time, variable jump cutoff,
deterministic LayeredMove ordering, locked root-motion sampling, rollback-safe opaque tokens and
exactly-once semantic events.

- [x] Write RED tables for idle/walk/run, takeoff/rising/apex/falling/landing, noisy apex hysteresis,
  ceiling impact, ledge departure, jump buffering, coyote success/expiry and landing duration.
- [x] Write RED property-style cases for LayeredMove insertion-order independence and root sample
  determinism/hash mismatch.
- [x] Write RED lifecycle cases for stale/reused tokens, duplicate reconciliation, reset, dispose and
  failure byte equality.
- [x] Implement pure transition and composition helpers first, then the stateful runtime.
- [x] Prove 30/60/120-like render sampling does not change an identical fixed-Tick command stream hash.
- [x] Run the complete `packages/character-movement/src` suite and typecheck.

### Task 3: Isolate Babylon/Havok behind CharacterBodyPort (`3C-3`)

**Files:**

- Create: `packages/runtime-babylon/src/babylon-character-body-port.ts`
- Create: `packages/runtime-babylon/src/babylon-character-body-port.test.ts`
- Create: `packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `packages/runtime-babylon/package.json`

**Produces:** one version-locked adapter that owns `PhysicsCharacterController`, protected extension,
`checkSupport()` and collision resolution. It yields only provider-neutral immutable results.

- [x] Add RED NullEngine/fake-port cases proving exactly one support query and one resolve per Tick,
  stale token rejection, collision-shortened displacement and ceiling contact.
- [x] Add a real Babylon/Havok probe for the protected extension and locked constructor/method surface.
- [x] Move or wrap `GroundAwarePhysicsCharacterController` inside this adapter; no other new file may
  call `checkSupport()`.
- [x] Add reset/dispose/two-world ownership tests and no-native-allocation-leak failure tests.
- [x] Run adapter focused tests and the existing Physics/traversal conformance tests.

### Task 4: Make Action, Root Motion and animation consume committed authority (`3C-4`)

**Files:**

- Create: `packages/subject-actions/src/action-presentation-resolver.ts`
- Create: `packages/subject-actions/src/action-presentation-resolver.test.ts`
- Create: `packages/subject-actions/src/action-presentation-registry.ts`
- Create: `packages/subject-actions/src/action-presentation-registry.test.ts`
- Modify: `packages/subject-actions/src/types.ts`
- Modify: `packages/subject-actions/src/index.ts`
- Modify: `packages/subject-actions/src/character-state-resolver.ts`
- Delete: `packages/subject-actions/src/ground-humanoid-action-resolver.ts`
- Modify: `packages/runtime-babylon/src/subject-animation-player.ts`
- Modify: adjacent Runtime Babylon animation tests

**Produces:** Action admission/lifecycle remains semantic; a locked compiled binding emits a
deterministic Root Motion LayeredMove; animation chooses clips exclusively from committed
Locomotion/Action state and emits debug-only clip telemetry.

- [x] Add RED tests that velocity cannot override a committed locomotion phase, animation cannot write
  Transform, clip names cannot select Root Motion and an interruptible Action exits deterministically.
- [x] Add RED root-motion Action cases for correct hash, wrong hash, collision-limited delta and replay.
- [x] Implement semantic presentation resolution and registry lookup with strict locked references.
- [x] Remove the independent idle/walk/run/jump inference path and update all imports/tests.
- [x] Run subject-actions and animation-focused suites, then the migration verifier.

### Task 5: Commit camera context and collision query ownership (`3C-5`)

**Files:**

- Modify: `packages/camera/src/camera-domain.ts`
- Modify: `packages/camera/src/selection.ts`
- Modify: `packages/camera/src/*.test.ts`
- Create: `packages/runtime-babylon/src/babylon-camera-collision-query-port.ts`
- Create: `packages/runtime-babylon/src/babylon-camera-collision-query-port.test.ts`
- Modify: `packages/runtime-babylon/src/camera-director.ts`
- Modify: `packages/runtime-babylon/src/follow-arm-solver.ts`
- Modify: adjacent CameraDirector/follow-arm tests

**Produces:** Camera Domain reads a committed `CameraContextSampleV2`; the existing ray fan is hidden
behind a provider port declaring `ray-fan-approximation`; CameraDirector alone commits pose.

- [x] Add RED context tests rejecting an uncommitted/mismatched Tick and mapping vertical phases and
  Action summaries to semantic camera selections.
- [x] Add RED adapter tests for deterministic ray order, approximation quality, no-hit and blocked-arm
  results.
- [x] Inject the query port into CameraDirector/FollowArm without exposing Babylon to Camera Domain.
- [x] Prove orbit input changes camera yaw/pitch but leaves committed character facing byte-identical.
- [x] Run camera and runtime-babylon focused suites.

### Task 6: Integrate the complete Golden Humanoid fixed-Tick slice (`3C-6`)

**Files:**

- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/gameplay-world-adapter.ts`
- Modify: `packages/runtime-babylon/src/runtime-projection.ts`
- Modify: `packages/runtime-host/src/world-session.ts`
- Create: `packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts`
- Create: `packages/runtime-host/src/character-movement-transaction.test.ts`

**Produces:** one transaction in the specified ten-stage order, one body query/resolve, atomic commit,
then animation and camera projection. World model state exposes Locomotion V2 at authoritative Tick.

- [x] Add a RED spy-port test asserting exact stage order and rollback on body/animation/camera prepare
  failures without state/event/journal advance.
- [x] Add RED Golden scenarios: walk/run, short/long jump, buffer/coyote, ceiling, ledge, slope,
  vertical events, interruptible Action and collision-limited Root Motion.
- [x] Route SubjectController through CharacterMovementRuntime and BodyPort; prevent direct native body
  or Transform writes outside the adapter/projection barriers.
- [x] Add reset/dispose/two-session isolation, replay hash and render-cadence invariance.
- [x] Run Golden integration tests, RuntimeHost tests and Runtime Babylon focused tests.

### Task 7: Clean break, automated gates and evidence (`3C-7/3C-8`)

**Files:**

- Delete: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Delete/modify: obsolete Motion Kernel tests, exports and fixtures in Golden scope
- Modify: `config/3c-migration-ledger.json`
- Create: `docs/reviews/2026-08-26-whitebox-3c-vnext-golden-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Produces:** no Golden dual authority, green focused gates, same-tree integration evidence and an
honest `experimental` release record awaiting human feel receipts.

- [ ] Make the migration verifier RED against every remaining legacy symbol, then delete/migrate all
  Golden references and mark ledger entries complete with command/evidence paths.
- [x] Run `verify:3c-migration`, clean-break, package-boundary and source-census gates.
- [x] Run typecheck, contract tests, resource-heavy tests, build and every canonical/control verifier;
  distinguish inherited environment failures from regressions with exact output.
- [ ] Run the Playground Golden route in the in-app browser at desktop and narrow width; inspect camera
  stability, jump phases, Root Motion collision, reset and readable diagnostics.
- [x] Perform independent task-compliance and full-dimension final-tree reviews; reproduce and fix every
  accepted finding, then rerun invalidated gates.
- [ ] Record artifacts, commit, profile hash and Fixture Take. Keep profile `experimental` and list the
  two human `FeelReviewReceipt` records as the only remaining promotion gate.
