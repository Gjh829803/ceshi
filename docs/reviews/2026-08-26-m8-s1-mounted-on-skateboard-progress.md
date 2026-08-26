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
  validation, rollback, Event journal, Receipt and World State identity. Gameplay planning rejects
  direct Rider rebind and possessed-Mount release while `mountedOn` is active, so Dismount remains the
  only legal control-transfer path.
- Babylon projects the Rider from the Mount socket/offset, suspends Rider locomotion/body collision,
  moves only the possessed Mount and evaluates deterministic safe Dismount candidates inside admitted
  terrain bounds through an isolated Rider Physics probe. The probe retains only static environment
  contacts, searches within the locked Rider step-height window, calls Babylon `checkSupport()` and is
  disposed on every path; it does not resample heightfield or triangle heights.
- Playground scene `mounted-skateboard-s1` uses separate G Bot Rider and package-local primitive board;
  Browser Protocol V5 remains the exact existing 39-key surface.
- The scene now exposes visible Mount/Dismount acceptance controls through a product-layer UI Adapter.
  It submits the existing Browser V5 `action.activate` contract and renders only committed
  Snapshot/Inspection/Camera telemetry; it does not own Relationship, Possession or Camera state.
- Control Capture Bundle V1 now writes Action/Event/Relationship rows and cross-validates Command,
  Receipt, Event, World State, Snapshot, Frame and Relationship projections. Tamper tests cover missing
  rows, wrong Relationship payload, wrong Receipt World State and wrong transition Tick. The mounted
  fixture uses the real five-Event Host sequence: Rider possession removal, `mountedOn` commit, Mount
  possession commit, Action start and Action completion.

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

- Review-hardening affected matrix passes 9 files / 496 tests. Fresh `pnpm typecheck`, production
  `pnpm build`, `verify:unreleased-clean-break` and `verify:outdoor-gameplay` pass; the Outdoor gate
  covers 6/6 Gameplay scenes, unknown-scene fail-closed and 6/6 artifact-only scenes.
- Fresh root contract lane passes 190 files / 2,057 tests. The 21-file resource-heavy aggregate exposed
  only existing fixed-5-second load sensitivity: its first run passed 20 files / 402 tests and timed out
  one modular-source test at 5.367 seconds; that exact file then passed 15/15 in 2.387 seconds. A redundant
  aggregate retry moved the timeout to three Planner self-check cases that had already passed 6/6 in the
  first run, so no unrelated timeout was hidden or changed in this patch.
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
- A fresh in-app Chromium rendered run used the visible controls and confirmed Mount publishes
  `Possession=skateboard`, `Camera Target=skateboard`, `mounted-framing active` and a 7m arm; Dismount
  restores `player`, `player`, no modifier and the 5m base arm. Reset re-enables a fresh one-cycle run.
- Local rendered evidence is produced under `output/playwright/` and intentionally ignored by Git.

## 2026-08-26 manual review disposition

Two manually requested independent reviews were produced against the checkpoint tree: zcode reported
`FINAL GO` with follow-ups, while Cursor reported `FINAL NO-GO`. The host reproduced and dispositioned
every concrete finding before changing code:

- Confirmed and fixed: Dismount used heightfield/static-triangle height selection instead of the Physics
  support authority and admitted out-of-bounds candidates; mounted Rider bind and possessed-Mount
  release were not rejected early; World State/Inspection accepted direct possession of a mounted Rider;
  the Hosted Builder prohibition named only the retired capability; the Capture fixture omitted the two
  possession Relationship Events; and the mounted Playground loader test used the default short timeout.
- Rejected after reproduction: forcing every parsed `mountedOn` World State to contain a `suspended`
  locomotion state would make the public parser own Adapter capability projection that belongs to staged
  Gameplay/Runtime integration. Direct Rider possession is rejected, while the existing owner boundary is
  preserved.
- Rejected after canonical-domain analysis: replacing parsed write-set deep equality with a second byte
  comparison has no observable semantic difference. Both projections have already passed the same closed
  parser, which removes unknown structure and rejects negative zero and non-finite numbers before comparison.

The two temporary reviewer reports were deleted after this disposition was preserved here. Because the
fixes changed the reviewed tree, neither original verdict is a final completion verdict for the new tree.

## Remaining before final M8-S1 completion

1. Add explicit ledge departure/landing, two-pair isolation and broader partial Runtime-construction cleanup
   adversarial tests. Isolated Dismount probe cleanup is now covered.
2. Publish/assert skateboard `supportedBy` only from retained `checkSupport()` evidence; never infer it
   from `mountedOn`.
3. Add foreign-WorldSession and post-reset leakage Capture fixtures, connect real RuntimeHost journal
   records, and produce the formal before-Mount / after-Mount-move / after-Dismount-move / after-Reset
   multi-frame Bundle verifier.
4. After items 1–3 change the tree, rerun only their invalidated gates, apply the final
   full-dimension/runtime completion review, and obtain a completed project-local read-only Cursor
   verdict. The checkpoint zcode/Cursor reports were completed and dispositioned, but predate the fixes;
   no final-tree Cursor GO is claimed.
5. Only after items 1–4 pass, create the final completion record and mark M8-S1 complete.

## Resolved Camera follow-up outside this slice

`CAM-MOUNT-1` is resolved on `codex/camera-development`: Camera projection now separates the Rider
control context from the physical skateboard ViewTarget, applies the 7m mounted modifier for one
unambiguous Rider and fails closed for multiple Riders. The visible fixture controls remain only an
acceptance adapter and do not add scene-specific CameraDirector behavior.

## Explicit non-claims

This work does not claim seat/tether, wheel physics, skateboard tricks, vehicle dynamics, generalized
mounted Camera behavior beyond this stand-ground S1, the formal four-stage Capture Bundle verifier,
dynamic Route publication, NPC behavior or Hosted Builder mount admission.
