# M8-S1 `mountedOn` Human-Skateboard Implementation Plan

> **Execution:** Implement task-by-task in the main process. Use subagents only when the user explicitly requests delegation. Follow TDD: observe each focused reproducer fail for the intended reason before changing production code.

**Goal:** Deliver the first `mountedOn` human-skateboard vertical slice with atomic Semantic Action, Relationship, possession, Runtime, Event, Receipt and Capture evidence.

**Architecture:** Keep `action.activate` owned by Core Semantic Action. A locked trusted-effect planner returns a closed mount/dismount plan; GameplayState remains the sole state writer and RuntimeHost remains the fixed-tick transaction/journal owner. Babylon projects the committed `mountedOn` state, while Physics support remains owned only by MotionKernel `checkSupport()`.

**Tech stack:** TypeScript 5.9, Vitest 3.2.7, Babylon.js 9.21.2, Havok 1.3.14, pnpm 10.14.

**Spec:** `docs/superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md`

**Progress (2026-08-26):** The core paths in Tasks 1–7 are implemented on `main`; Task 8's canonical
Track writer/validator and primary tamper checks are implemented. Remaining before final M8-S1
completion is the listed Runtime adversarial hardening, retained-support `supportedBy` evidence,
formal four-phase mounted Capture verifier, and Task 9's final independent completion review. The
current integration checkpoint's full same-tree base gates pass; subsequent hardening/Capture edits
must rerun the evidence they invalidate. `CAM-MOUNT-1` is recorded in the central Backlog and remains owned by P2.4 Camera work,
outside this slice.

## Global constraints

- Do not add a new Mount command or a second `action.activate` handler.
- Do not modify `SubjectRuntimeStateV3` or Browser Protocol V5 keys.
- Use one canonical public term: `mountedOn`; delete the unreleased `mount` dialect.
- Do not infer `supportedBy` from `mountedOn` and do not call `checkSupport()` outside MotionKernel.
- Do not add wheel physics, tricks, vehicle movement, new camera ownership or dynamic Route claims.
- Existing Action definitions must gain explicit `{ mode: "state-only" }`; no optional fallback.
- Commit small independently reviewable tasks only after their focused GREEN. Final integration evidence must run on one tree.

## Task 1: Clean-break Relationship and Action contracts

**Files:**

- Modify: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-artifacts.ts`
- Modify: `packages/gameplay-contracts/src/*.test.ts`
- Modify: `packages/subject-registry/src/types-v3.ts`
- Modify: `assets/registry/relationship-profiles/catalog.json`
- Modify: owning registry tests and generated resource fixtures

**Produces:** the exact contracts in spec sections 4–6.

- [x] Add RED tests for parsing/freezing/hashing `MountedOnRelationshipStateV1`, typed Relationship Events, generic inspection/capacity names, explicit Action `effect`, immediate completion, `mountedOn` profile terms, and rejection of the old `mount`, generic profile socket roles, possession-only inspection and capacity names.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/gameplay-contracts/src packages/subject-registry/src --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

  Confirm failures are missing contracts, not fixture mistakes.
- [x] Add the union member and strict parsers. Replace Relationship Event endpoint fields with `relationship`. Replace possession-only inspection/capacity fields without aliases.
- [x] Add explicit Action effect unions and migrate every current Action definition to `state-only`.
- [x] Replace the registry `mount` vocabulary with `mountedOn`; add only `mounted-on.stand-ground@1` as implemented and retain seat/tether as reserved.
- [x] Regenerate only through owning generators, rerun the focused command, `pnpm verify:unreleased-clean-break`, and `git diff --check`.

## Task 2: Authoring, slot and initial Relationship compilation

**Files:**

- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/authoring-spec-v4.schema.json`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/compiler/src/compile.ts`
- Test: adjacent Authoring/Compiler/Runtime Contracts tests

**Produces:** Authoring V4 `mountedOn` and package-local Mount slots compiled into ExecutionPlan V5 initial Relationship state.

- [x] Add RED tests for one valid initial relationship plus missing Rider, missing Mount, same endpoint, missing/duplicate slot, missing Socket, reserved profile, duplicate Rider occupancy, duplicate slot occupancy, contradictory possession, extra key and old `mount` input.
- [x] Add `SubjectMountSlotDefinitionV1[]` to Subject Definition with strict ID ordering and socket closure. Migrate current definitions to explicit empty arrays.
- [x] Replace the all-Relationship rejection with a closed `mountedOn` validator. Do not accept generic `sourceEntityId`, `targetEntityId` or `params`.
- [x] Normalize endpoints and slot/profile closure; lock every consumed resource.
- [x] Extend ExecutionPlan V5 with the typed initial Relationship union and strict/deep-frozen parser. Compile without re-inference.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/authoring/src packages/compiler/src packages/runtime-contracts/src --no-file-parallelism --maxWorkers=1 --minWorkers=1
  pnpm typecheck
  ```

## Task 3: Trusted Semantic Action effect registry

**Files:**

- Modify: `packages/gameplay/src/core-semantic-action-feature.ts`
- Create: `packages/gameplay/src/gameplay-action-effect-registry.ts`
- Create: `packages/gameplay/src/mounted-relationship-feature.ts`
- Modify: `packages/gameplay/src/gameplay-feature-manager.ts`
- Modify: `packages/gameplay/src/index.ts`
- Test: adjacent Gameplay tests

**Produces:** locked effect Ref/Hash → exactly one trusted effect planner; no second Command handler.

- [x] Add RED tests for missing/duplicate/wrong-hash effect planner, non-canonical result, mutation attempt, forged request bytes, schema mismatch, and a manifest census proving one `action.activate` handler.
- [x] Implement an immutable `GameplayActionEffectRegistryV1` keyed by canonical Ref. Each planner receives a read-only planning view and immutable request resolution.
- [x] Make `mounted-relationship@1` depend on Core Control and Core Semantic Action, contribute zero command handlers, and register the Mount/Dismount effect planner during feature activation.
- [x] Extend Core Semantic Action planning to resolve the locked effect and pass the closed plan to GameplayState authorization.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/gameplay/src/core-semantic-action-feature.test.ts packages/gameplay/src/gameplay-feature-manager.test.ts packages/gameplay/src/mounted-relationship-feature.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

## Task 4: GameplayState atomic Mount/Dismount transition

**Files:**

- Modify: `packages/gameplay/src/gameplay-state.ts`
- Modify: `packages/gameplay/src/gameplay-state.test.ts`
- Modify: `packages/gameplay/src/core-control-feature.ts` only if private possession indexing needs an exported read port

**Produces:** one authorized transition containing Action and both Relationship types.

- [x] Add RED Mount cases: valid immediate transition, stale possession, actor mismatch, occupied slot, already mounted Rider, missing capability, distance failure, conflicting Action and every capacity boundary.
- [x] Add RED Dismount cases: Rider actor with Mount possession succeeds; wrong controller/relationship fails; ordinary state-only Action still requires actor = possession target.
- [x] Generalize Relationship state storage and private possession indices. Validate the effect plan inside GameplayState; never trust a planner-provided before-state or count.
- [x] Produce stable change/event order: Relationship removals by ID, Relationship additions by ID, Action started/completed; Receipt lists emitted IDs in that order and no immediate Action remains active.
- [x] Prove prepare/project/commit staleness and rollback with before/after immediate-state assertions.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/gameplay/src/gameplay-state.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

## Task 5: RuntimeHost, journal and adapter prepare/commit hooks

**Files:**

- Modify: `packages/runtime-host/src/world-session.ts`
- Modify: `packages/runtime-host/src/gameplay-world-port.ts`
- Modify: `packages/runtime-host/src/command-journal.ts`
- Modify: RuntimeHost tests

**Produces:** one fixed-tick transaction whose adapter projection, WorldState, Events and Receipt agree.

- [x] Add a RED test that prepares Mount, makes the adapter throw, and proves no Relationship, possession, Event sequence or WorldState advances. Add another proving an undeclared Adapter projection write is rejected.
- [x] Replace possession-shaped Event construction with the typed Relationship union.
- [x] Extend the provider-neutral World Port with prepare/commit/rollback hooks for a closed mounted projection and exact `runtimeProjectionWriteSet`. Register ownership immediately after any native allocation.
- [x] Replace the blanket “Command cannot change Adapter-owned World projection” check with exact outside-write-set byte equality, changed-entry parsing and undeclared add/remove rejection. Build the WorldState-after, Event list and Receipt only from that validated prepared transition. Commit journal/state/adapter at the existing phase barrier.
- [x] Add reset, replacement, disposal and two-WorldSession late-command isolation tests.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/runtime-host/src --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

## Task 6: Babylon mounted projection and safe Dismount

**Files:**

- Modify: `packages/runtime-babylon/src/gameplay-world-adapter.ts`
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: subject visual/body ownership helpers and adjacent tests only as required

**Produces:** Rider follows the skateboard slot; board alone owns movement/support; rollback and disposal are exact.

- [ ] Current RED/GREEN coverage includes asymmetric slot projection, Rider suspension/collider policy,
  Mount movement, Physics-unsupported and admitted-bounds rejection, safe/blocked Dismount, isolated
  probe cleanup and Reset. Explicit ledge departure/landing, two mounted pairs and broader partial
  Runtime-construction cleanup cases remain completion-hardening work.
- [x] Project Rider Subject Origin from committed Mount pose + slot + authored Rider offset. Preserve Snapshot/Visual Root at Subject Origin and project Rider locomotion as the closed `suspended` branch with no fake medium/speed.
- [x] Suspend Rider controller/input/body support while mounted. Do not add a second grounding query.
- [x] Implement deterministic Dismount candidate evaluation through an isolated Rider Physics placement
  probe using static environment contacts plus Babylon `checkSupport()`, admitted terrain bounds and
  deterministic Subject blocking. Add RED cases for unsupported Physics, out-of-bounds candidate 1,
  blocked candidate 1 selection and all-candidates-fail without mutation.
- [ ] The board keeps the existing single `checkSupport()` locomotion authority and no rider-board fact is
  fabricated. Publishing and asserting board `supportedBy` from retained support evidence remains open.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/runtime-babylon/src/runtime.test.ts packages/runtime-babylon/src/p15-conformance.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

## Task 7: Playground fixture and unchanged Browser V5 surface

**Files:**

- Create: `apps/playground/src/scenes/mounted-skateboard-s1.ts`
- Modify: `apps/playground/src/scenes/index.ts`
- Modify: `apps/playground/src/gameplay-babylon-runtime-coordinator.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts` only behind existing methods
- Test: Playground loader/coordinator/Browser contract tests

**Produces:** a real separate Rider and primitive skateboard fixture with bind → mount → move → dismount → move → reset.

- [x] Build the Rider from the current G Bot/Golden definition and the board from package-local primitive visual parts with one support-centered capsule approximation, one `MountStand` Socket and one stand slot.
- [x] Add two request resources and two Semantic Action definitions/effect locks to the fixture Bootstrap.
- [x] Activate the mounted Relationship feature through the canonical Bootstrap closure.
- [x] Add Browser tests proving exact V5 key count remains 39 and current submit/receipt/event/state/inspection calls expose the transition.
- [x] Add a source census proving the retired composite hoverboard asset is not referenced and no wheel/vehicle capability is claimed.
- [x] Add a contract assertion that `MountedOnRelationshipStateV1`, Mount/Dismount requests and Mount slots contain no Ground Motion Kernel/Profile Ref; the S1 Ground closure belongs only to the skateboard Subject capability assembly so a later dynamics closure can replace it without Relationship migration.

## Task 8: Control Capture track closure

**Files:**

- Modify: `scripts/lib/control-capture-bundle.ts`
- Modify: `scripts/lib/control-capture-bundle.test.ts`
- Modify: capture orchestration/verification scripts owning the real fixture

**Produces:** populated Action/Event/Relationship/Snapshot tracks bound to frame and Receipt identities.

- [ ] RED fixtures now cover missing Relationship row, wrong Event payload, Receipt → WorldState
  mismatch and wrong transition Tick. The unit fixture now reproduces the five-Event Host Mount sequence;
  formal foreign-WorldSession and post-reset leakage fixtures remain with the mounted Capture verifier.
- [ ] Feed committed RuntimeHost journal records to the existing reserved NDJSON tracks in canonical sequence order.
- [x] Extend validation to cross-check every reference described in spec section 10; keep bundle schemaVersion 1 because paths and frame refs already reserve these tracks.
- [ ] Capture frames before Mount, after Mount movement, after Dismount movement and after Reset.
- [ ] Focused bundle suite passes; the formal mounted fixture Capture verifier remains to be added and run.

## Task 9: Integration and completion evidence

**Files:**

- Create: `docs/reviews/2026-08-26-m8-s1-mounted-on-skateboard-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md` only if the public capability index needs an M8 entry

- [x] Run focused tests after the final implementation edit.
- [x] Run once on the same current checkpoint tree:

  ```bash
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm test:studio
  pnpm test:independent
  pnpm verify:unreleased-clean-break
  pnpm verify:canonical
  pnpm verify:placement-layout
  pnpm verify:rigged-subject
  pnpm verify:g-bot-subject
  pnpm verify:outdoor-gameplay
  ```

  Evidence: 190 contract files / 2,050 tests, 21 resource-heavy files / 401 tests, Studio 73/73,
  independent Node 23/23 + Python 17/17 + Site 1/1, typecheck/build and all listed verifiers pass.
  The Site lane required `npm ci` inside `sites/world-sdk-blueprint` from its committed lockfile.

- [ ] Run the new mounted-skateboard Browser/Capture verifier. Record command, test count, artifact paths and warnings.
- [ ] Inspect the real rendered surface for Rider/board separation, slot alignment, Mount movement, Dismount placement and Reset. Record manual input separately from automated evidence.
- [x] Apply `docs/reviews/full-dimension-review-protocol.md` change dimensions and
  `docs/reviews/runtime-deep-review-checklist.md` authority, adversarial, lifecycle and evidence checks
  to this integration checkpoint. Repeat the final completion review after the open Tasks 6/8 work.
- [ ] Obtain a completed read-only project-local Cursor completion verdict and reproduce every candidate
  finding before disposition. Manual zcode/Cursor checkpoint reports were produced and fully dispositioned;
  their confirmed defects were fixed, but both reports predate the fixes and are not a final-tree GO.
- [ ] Update the backlog only after all gates pass. Do not mark seat/tether, wheel physics, tricks, full mounted Camera, dynamic Route or hosted Builder support complete.
