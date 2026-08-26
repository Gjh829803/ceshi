# M8-S1 `mountedOn` Progress Record

- Date: 2026-08-26
- Branch: `main`
- Status: core vertical slice and current-tree base gates implemented; targeted hardening, formal mounted
  Capture evidence and final completion review remain open
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

Implementation commits already on local `main` after rebasing onto `origin/main@1cc8054`:

- `4838da2` relationship contracts
- `5bb87cc` authoring/compiler closure
- `2f3201b` trusted mounted Action effects
- `9154259` atomic Gameplay relationships
- `7b4e1b0` RuntimeHost mounted projection transaction
- `cef19f0` Babylon Rider projection and safe Dismount
- `fb5719f` Playground mounted-skateboard slice
- `b781e88` mounted Gameplay evidence in Control Capture
- `d0d9c16` progress/backlog synchronization
- `e90d761` latest-Camera-main integration reconciliation

## Current evidence

- Focused Capture/Validation: 43 tests pass.
- Final-tree `pnpm typecheck` and Playground production `pnpm build` pass.
- Final-tree root aggregate passes its fail-closed census and both lanes: 190 contract files / 2,050
  tests plus 21 resource-heavy files / 401 tests. Workspace boundary verification passes with the
  current 52 explicitly registered debt entries.
- Studio passes 73/73. Independent Node passes 23/23, the two Python lanes pass 11/11 and 6/6, and
  the Site lane passes 1/1 after installing its isolated dependencies from the committed lockfile.
- `verify:unreleased-clean-break`, `verify:canonical`, `verify:placement-layout`,
  `verify:rigged-subject`, `verify:g-bot-subject` and `verify:outdoor-gameplay` all pass.
- Integration-gate repairs regenerated the Planner/Builder self-check bundles, added the public
  Authoring `/testing` export, reconciled Camera-main `FootAlignment`, removed legacy
  possession-only entry inspection, and canonicalized signed zero only at Runtime Snapshot output.
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
4. After items 1–3 change the tree, rerun only their invalidated gates, apply the final
   full-dimension/runtime completion review, and obtain a completed project-local read-only Cursor
   verdict. The 2026-08-26 checkpoint attempted two Cursor final reviews, but Ask mode rejected its
   read-only Git commands and the no-inspection retry produced no report after more than ten minutes;
   no Cursor GO is claimed.
5. Only after items 1–4 pass, create the final completion record and mark M8-S1 complete.

## Known issue outside this slice

`CAM-MOUNT-1`: after Mount changes possession to the skateboard, rendered camera follow can retract too
close and crop the Rider. Relationship, possession, movement, Dismount and Reset state are correct.
This remains a P2.4 Camera Context/CameraDirector issue; M8-S1 must not add scene-specific camera logic
or change camera ownership to hide it.

## Explicit non-claims

This work does not claim seat/tether, wheel physics, skateboard tricks, vehicle dynamics, full mounted
Camera behavior, dynamic Route publication, NPC behavior or Hosted Builder mount admission.
