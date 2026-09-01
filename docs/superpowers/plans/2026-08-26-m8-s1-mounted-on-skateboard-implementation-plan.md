# M8-S1 `mountedOn` Human-Skateboard Implementation Plan

> **Execution:** Implement task-by-task in the main process. Use subagents only when the user explicitly requests delegation. Follow TDD: observe each focused reproducer fail for the intended reason before changing production code.

**Goal:** Deliver the first `mountedOn` human-skateboard vertical slice with atomic Semantic Action, Relationship, possession, Runtime, Event, Receipt and Capture evidence.

**Architecture:** Keep `action.activate` owned by Core Semantic Action. A locked trusted-effect planner returns a closed mount/dismount plan; GameplayState remains the sole state writer and RuntimeHost remains the fixed-tick transaction/journal owner. Babylon projects the committed `mountedOn` state, while Physics support remains owned only by MotionKernel `checkSupport()`.

**Tech stack:** TypeScript 5.9, Vitest 3.2.7, Babylon.js 9.23.0, Havok 1.3.14, pnpm 10.14.

**Spec:** `docs/superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md`

**Progress (2026-09-01):** Tasks 1-8 are implemented in the working tree after `6948d1a`, including the
listed Runtime adversarial hardening, retained-support `supportedBy` projection, formal four-phase mounted
Capture verifier and a stricter current-only Camera V2 clean break. Historical Cloud evidence on `4c7551e`
and `7f9abd8` is retained but is not promoted across these production Camera/Runtime/Registry and generated-
artifact changes. Current focused verification passes 14 files / 288 tests plus the 3/3 self-check suite,
generated-validator, agent-self-check and Native package checks. Task 9 remains open pending a new exact pushed SHA, the Cloud
matrix and final Claude/Grok reviews. No final M8-S1 internal-capability GO is claimed, and Hosted Builder
production admission remains explicitly closed.

## Global constraints

- Do not add a new Mount command or a second `action.activate` handler.
- Do not modify `SubjectRuntimeStateV3` or Browser Protocol V5 keys.
- Use one canonical public term: `mountedOn`; delete the unreleased `mount` dialect.
- Do not infer `supportedBy` from `mountedOn` and do not call `checkSupport()` outside MotionKernel.
- Do not add wheel physics, tricks, vehicle movement, new camera ownership or dynamic Route claims.
- Keep `mountedOn.stand-ground@1` internal to Host-fixed Canonical acceptance. Hosted Builder production
  self-check must reject non-empty Relationships and package-local Relationship Capability Refs.
- Camera remains the sole View owner and consumes only committed fixed-tick truth. Use only
  `relationshipContexts` / `allRelationshipConditions`; delete `relationshipRole(s)` and the Task-6
  semantic-authority fallback rather than retaining compatibility.
- Camera Socket Context comes from locked Socket data plus committed Subject pose, never Babylon Nodes,
  render parenting or mesh metadata.
- Existing Action definitions must gain explicit `{ mode: "state-only" }`; no optional fallback.
- Commit small independently reviewable tasks only after their focused GREEN. Final integration evidence must run on one tree.
- Local verification is limited to affected tests and targeted capability verifiers. Root typecheck/test/build,
  Studio/independent lanes and other whole-project gates run in a remote Cloud Agent against the exact
  pushed SHA.

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

- [x] RED/GREEN coverage includes asymmetric slot projection, Rider suspension/collider policy,
  Mount movement, Physics-unsupported and admitted-bounds rejection, safe/blocked Dismount, isolated
  probe cleanup, Reset, ledge departure/landing, two mounted pairs and partial Runtime-construction
  cleanup.
- [x] Project Rider Subject Origin from committed Mount pose + slot + authored Rider offset. Preserve Snapshot/Visual Root at Subject Origin and project Rider locomotion as the closed `suspended` branch with no fake medium/speed.
- [x] Suspend Rider controller/input/body support while mounted. Do not add a second grounding query.
- [x] Implement deterministic Dismount candidate evaluation through an isolated Rider Physics placement
  probe using static environment contacts plus Babylon `checkSupport()`, admitted terrain bounds and
  deterministic Subject blocking. Add RED cases for unsupported Physics, out-of-bounds candidate 1,
  blocked candidate 1 selection and all-candidates-fail without mutation.
- [x] The board keeps the existing single `checkSupport()` locomotion authority and no rider-board fact is
  fabricated. Board `supportedBy` is published and asserted only from retained support evidence.
- [x] Run:

  ```bash
  pnpm exec vitest run packages/runtime-babylon/src/runtime.test.ts packages/runtime-babylon/src/p15-conformance.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

## Task 6A: Retained-support Semantic Fact closure

**Files:**

- Modify: `packages/gameplay-contracts/src/gameplay-artifacts.ts`
- Modify: `packages/gameplay/src/core-gameplay-bootstrap.ts`
- Modify: Runtime Body/support ports
- Create: `packages/runtime-babylon/src/semantic-fact-projector.ts`
- Modify: owning generated Bootstrap/World Build/Package artifacts through their generators
- Test: adjacent contract, Runtime, Host capacity and asset-validation suites

**Produces:** one exact, hash-bound Projector Profile and deterministic `supportedBy` facts from the
already committed Physics support result.

- [x] Add the complete required `semanticFactProjectorProfileResource`; reject omission, extra keys, stale
  content Hash and any alias/default path.
- [x] Regenerate every checked-in Gameplay Bootstrap and enclosing World Build/Package identity through its
  owner. Do not hand-edit derived Hashes or signatures.
- [x] Retain exact traversal surface identity on Babylon supporting contacts. Keep `sliding`; remove side-wall
  contacts with the installed Babylon 9.23.0 positive-support constraint; do not reuse Route max slope.
- [x] Do not introduce any per-Subject/per-Tick whole-scene geometry reconstruction/query path. The
  Projector validates exact admitted identities and
  omits ambiguous/dynamic contacts. The already-removed Dismount height probe is not a Fact source.
- [x] Adapt Golden and non-Golden committed Body support into the same Projector input. Exclude mounted Riders;
  allow a dismounted Rider Fact only after a real subsequent Physics Tick.
- [x] Clear prior Facts before Tick 0 traversal reset; prove departure/landing episode identity,
  reset/replay/rollback byte equality and `P` / `C + P` capacity bounds.
- [x] Run only the affected contract/Runtime/Host/asset tests locally. Leave root gates to a remote Cloud
  Agent.

## Task 6B: Latest Camera contract clean break

**Files:**

- Modify: `packages/camera/src/camera-domain.ts`, `selection.ts` and owning tests
- Modify: `packages/runtime-contracts/src/world-runtime-bootstrap.ts` plus generated schema/validator
- Modify: `packages/subject-registry` Camera types/catalog and generated Builder/Planner bundles
- Modify: `packages/runtime-babylon` Camera Context/Director/publication paths and focused tests
- Modify: checked-in runtime bootstrap/build/package artifacts through their owning generators

**Produces:** one typed Camera relationship contract and one coherent fixed-tick Camera publication.

- [x] Replace `relationshipRole(s)` atomically with `relationshipContexts` and
  `allRelationshipConditions`; the mounted rule is `{ type: "mountedOn", entityRole: "rider" }`.
- [x] Delete the Task-6 legacy conversion helper, production-unreachable semantic-authority unavailable
  branch, unused subject/render relationship role field and duplicate Playground Camera projection helper.
- [x] Sort Relationship Context by type then ID using canonical code-unit order. Add unique Rider and shared
  Mount ambiguity/fail-closed tests.
- [x] Project local Socket positions from locked Socket definitions plus committed Subject origin/facing.
  Omit unsupported bone projections and preserve explicit fallback diagnostics. Prove Babylon Node mutation
  cannot alter same-Tick Camera Context.
- [x] Publish Target, SelectionDecision, Rig, Modifiers, Spring Arm and pose as one Camera epoch. Prove the
  immediate state after Mount/Dismount is the previous coherent view and the first following fixed Tick is the
  new coherent view; include reset, rebind, rollback and dual-Runtime isolation.
- [x] Keep Browser V5 at exactly 38 keys and Snapshot V4 unchanged in shape.
- [x] Regenerate all owning schemas/catalog bundles/artifacts and retain focused clean-break regressions for
  every deleted field/helper/path.
- [ ] Run `pnpm verify:unreleased-clean-break` on the new exact product candidate in Cloud. Historical
  exact `4c7551e` passed 1,519 scanned / 0 forbidden but predates the current Camera V2 clean break.

The design amendment and deletion graph are main-agent-owned. Before Task 6B can be considered accepted,
the main agent self-reviews the document and sends the exact pushed design SHA to an independent deep-review
agent. The review records reviewer identity and exact SHA. Every finding is reproduced against source and
disposed before final implementation review.

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
- [x] Add Browser tests proving exact V5 key count remains 38 and current submit/receipt/event/state/inspection calls expose the transition.
- [x] Add a source census proving the retired composite hoverboard asset is not referenced and no wheel/vehicle capability is claimed.
- [x] Add a contract assertion that `MountedOnRelationshipStateV1`, Mount/Dismount requests and Mount slots contain no Ground Motion Kernel/Profile Ref; the S1 Ground closure belongs only to the skateboard Subject capability assembly so a later dynamics closure can replace it without Relationship migration.

## Task 8: Control Capture track closure

**Files:**

- Modify: `scripts/lib/control-capture-bundle.ts`
- Modify: `scripts/lib/control-capture-bundle.test.ts`
- Modify: capture orchestration/verification scripts owning the real fixture

**Produces:** populated Action/Event/Relationship/Snapshot tracks bound to frame and Receipt identities.

- [x] RED fixtures cover missing Relationship row, wrong Event payload, Receipt → WorldState
  mismatch, wrong transition Tick, foreign WorldSession, post-reset leakage, missing Camera Event and
  rehashed canonical-order tampering. The unit fixture reproduces the five-Event Host Mount sequence.
- [x] Feed complete committed RuntimeHost journal segments to the existing reserved NDJSON tracks in canonical
  sequence order, including fixed-Tick Semantic Fact and Camera Events.
- [x] Extend validation to cross-check every reference described in spec section 10; keep bundle schemaVersion 1 because paths and frame refs already reserve these tracks.
- [x] Capture frames before Mount, after Mount movement, after Dismount movement and after Reset.
- [ ] Rerun the formal mounted fixture Capture verifier on the new exact product candidate in Cloud. The
  historical Runtime-equivalent `4c7551e` pass predates changed Camera inputs.

## Task 9: Integration and completion evidence

**Files:**

- Create: `docs/reviews/2026-08-26-m8-s1-mounted-on-skateboard-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md` only if the public capability index needs an M8 entry

- [x] Run focused tests after the final implementation edit.
- [ ] After focused local tests pass, push one exact candidate SHA and run these whole-project gates once in
  a remote Cloud Agent rather than on the local machine:

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
  ```

  The historical catalog `verify:outdoor-gameplay` command is retired together with the deleted catalog
  Gameplay route. Do not restore that route or command for M8; the formal mounted verifier below plus the
  current Canonical capability gates are the internal acceptance evidence. Hosted Builder production
  admission remains closed and is guarded by its self-check.

  Previous checkpoint evidence is historical only and does not prove the amended contract or final SHA.
  Record the cloud agent identity, exact commit, command exit codes, test counts and artifacts.

  Current run: Cursor Cloud agent `bc-b60819cf-e058-4aa1-a02e-38fc021a4757`, run
  `run-1642dd9b-1a77-413f-80c5-ca03c910dce2`, exact candidate `08f8f199e2751f80cf5aa25162bc00927425dfcd`.
  This first attempt completed NO-GO: `pnpm typecheck` returned exit 2 with 28 errors in 4 files, and root
  `pnpm test` stopped in the workspace-boundary preflight before census. Build, Studio, independent,
  unreleased-clean-break and the listed current Canonical capability gates passed. This remains historical
  first-attempt evidence; the type/boundary/root blockers were later closed by the current run below.

  Historical root closure: Cursor Cloud agent `bc-94b2272e-38ea-4525-971c-a817000e9cec`, run
  `run-512cffea-279d-45fd-ae83-9457ee381c26`, exact candidate
  `7f9abd8bc78010cd0e04df8542d40f18c24bfae4`. Install and typecheck passed. Root test passed:
  workspace boundaries 49 debt / 1,760 public symbols; census 386 = 347 contract + 39 resource-heavy;
  contract 347 files / 4,150 passed / 3 platform skips / 0 failed; resource-heavy 39 files / 613 passed /
  0 failed. This closes the root checkbox's install/typecheck/test portion, but the matrix checkbox remains
  open because the later Camera V2 clean break changes product and generated-artifact inputs.

  D6 non-root lineage: Cursor Cloud agent `bc-74b5577c-59da-4b4e-b2a0-3103f602894f`, run
  `run-08af7359-9330-42ea-ae84-2b52dc2e182f`, exact `4c7551e3cee123df3767bda21e1cf72665dca457`,
  passed frozen install, typecheck, build, independent 23/23 + 1/1, unreleased clean break 1,519/0,
  Control Capture 2/2 and the formal mounted verifier. The only failure was the new semantic-fact projector
  test missing from the fail-closed census. The D6 lineage reaches `7f9abd8` only; it does not cover the
  current Camera V2 clean break. A new exact-SHA Cloud run is required.

- [x] Run the new mounted-skateboard Browser/Capture verifier. Record command, test count, artifact paths and warnings.
- [x] Inspect the real rendered surface for Rider/board separation, slot alignment, Mount movement, Dismount placement and Reset. Record that the retained-frame inspection is rendered evidence, not manual input.
- [x] Apply `docs/reviews/full-dimension-review-protocol.md` change dimensions and
  `docs/reviews/runtime-deep-review-checklist.md` authority, adversarial, lifecycle and evidence checks
  to the local candidate and Capture subreview.
- [ ] Repeat the independent final completion review on the exact post-gate candidate with Claude and Grok.
- [ ] Complete the final-tree host review and reproduce every candidate finding before disposition. Earlier
  optional external checkpoint reports were fully dispositioned, but they predate the fixes and are not
  final-tree evidence.
- [ ] Mark the backlog complete only after all gates pass. Do not mark seat/tether, wheel physics, tricks, general
  vehicle/multi-camera behavior, dynamic Route or hosted Builder support complete.
