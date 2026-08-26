# M8-S1 `mountedOn` Progress Record

- Date: 2026-08-26
- Branch: `main`
- Status: core vertical slice implemented; final evidence closure remains open
- Authority: [design](../superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md),
  [implementation plan](../superpowers/plans/2026-08-26-m8-s1-mounted-on-skateboard-implementation-plan.md),
  [central backlog](../18-refactor-progress-and-backlog.md)

## Implemented

- `mountedOn` is the only public mount Relationship term; role-qualified Rider/Mount/Slot endpoints,
  strict parsing, hashing, Events, generic Relationship inspection/capacity and the implemented
  `mounted-on.stand-ground@1` profile are in place.
- Authoring V4 validates package-local Mount slots and exact `mountedOn`; Compiler emits typed initial
  Relationship state in ExecutionPlan V5.
- Core Semantic Action remains the only `action.activate` owner. Locked Mount/Dismount effects plan
  atomic `mountedOn` plus `possessedBy` changes.
- GameplayState and RuntimeHost prepare/project/commit one fixed-Tick transaction with exact write-set
  validation, rollback, Event journal, Receipt and World State identity.
- Babylon projects the Rider from the Mount socket/offset, suspends Rider locomotion/body collision,
  moves only the possessed Mount and evaluates deterministic safe Dismount candidates.
- Playground scene `mounted-skateboard-s1` uses separate G Bot Rider and package-local primitive board;
  Browser Protocol V5 remains the exact existing 39-key surface.
- Control Capture Bundle V1 now writes Action/Event/Relationship rows and cross-validates Command,
  Receipt, Event, World State, Snapshot, Frame and Relationship projections. Tamper tests cover missing
  rows, wrong Relationship payload, wrong Receipt World State and wrong transition Tick.

Implementation commits already on local `main`:

- `423f5f3` relationship contracts
- `c68ad61` authoring/compiler closure
- `00f8872` trusted mounted Action effects
- `bf06477` atomic Gameplay relationships
- `47f8ed0` RuntimeHost mounted projection transaction
- `2bd6a8a` Babylon Rider projection and safe Dismount
- `cbdb4bc` Playground mounted-skateboard slice

## Current evidence

- Focused Capture/Validation: 43 tests pass.
- TypeScript typecheck passes.
- Real Chromium Browser V5 run passes Mount → 30 fixed movement Ticks → Dismount → 30 Rider movement
  Ticks → Reset. The run confirmed control transfer, `mountedOn`, Rider `suspended`, Mount-only movement,
  independent Rider movement after Dismount, new WorldSession on Reset and no old Relationship leakage.
- Local rendered evidence is produced under `output/playwright/` and intentionally ignored by Git.

## Remaining before final M8-S1 completion

1. Add explicit ledge departure/landing, two-pair isolation and partial native-allocation cleanup Runtime
   adversarial tests.
2. Publish/assert skateboard `supportedBy` only from retained `checkSupport()` evidence; never infer it
   from `mountedOn`.
3. Add foreign-WorldSession and post-reset leakage Capture fixtures, connect real RuntimeHost journal
   records, and produce the formal before-Mount / after-Mount-move / after-Dismount-move / after-Reset
   multi-frame Bundle verifier.
4. Run the implementation plan's full same-tree gates, apply the full-dimension/runtime review
   checklists, and complete the project-local read-only Cursor review.
5. Only after items 1–4 pass, create the final completion record and mark M8-S1 complete.

## Known issue outside this slice

`CAM-MOUNT-1`: after Mount changes possession to the skateboard, rendered camera follow can retract too
close and crop the Rider. Relationship, possession, movement, Dismount and Reset state are correct.
This remains a P2.4 Camera Context/CameraDirector issue; M8-S1 must not add scene-specific camera logic
or change camera ownership to hide it.

## Explicit non-claims

This work does not claim seat/tether, wheel physics, skateboard tricks, vehicle dynamics, full mounted
Camera behavior, dynamic Route publication, NPC behavior or Hosted Builder mount admission.
