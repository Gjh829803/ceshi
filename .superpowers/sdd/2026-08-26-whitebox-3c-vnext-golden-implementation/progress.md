docs/superpowers/plans/2026-08-26-whitebox-3c-vnext-golden-implementation.md

# 3C vNext Golden completion SDD ledger

## Session scope

- Canonical workspace: `D:\01_Workspace\01_Loopit\00_repos\agent-whitebox-world-sdk-dv`
- Diversion branch: `codex/3c-vnext-task6-integration` (`dv.branch.6`)
- Main-agent-only files: `packages/runtime-babylon/src/babylon-world-runtime.ts`,
  `docs/reviews/2026-08-27-whitebox-3c-vnext-golden-progress.md`, migration ledger,
  acceptance matrix, final integration and Diversion commits.
- Product status remains `experimental`; automated evidence cannot mint a human
  `FeelReviewReceipt`.

## Preflight rulings

| Conflict | Ruling |
| --- | --- |
| The Superpowers worktree default conflicts with the canonical repository rule. | Use the existing Diversion feature branch. Do not create Git worktrees or use Git commands. |
| The user requested one main integrator plus three parallel lanes, while the generic SDD workflow prefers sequential workers. | Use strict non-overlapping file ownership after interface freeze; the main agent retains cross-cutting interfaces and integration. |
| Main and the feature branch both changed `babylon-world-runtime.ts`. | Diversion merge `dv.commit.7` kept the feature version at the conflict, then the main agent semantically restored main's shared `canonical-numbers` owner. |
| Human feel approval is required for promotion. | Complete technical repair and commit it to the feature branch; leave the profile experimental for the user's review and Henry's bot. |

## Work graph

| ID | Goal | Depends on | Blocks | Owner | Exclusive files | Mode | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FIX-0 | Freeze route, Body, animation and interpolation contracts | merged main | FIX-1..3 | main | this ledger, central Runtime | main-agent-only | frozen decisions below |
| FIX-1 | Prevent airborne snap-down teleport while preserving grounded descent | FIX-0 | FIX-4 | Body worker | Body adapter and focused tests | parallel-safe | focused RED/GREEN + Havok conformance |
| FIX-2 | Bind committed vertical phases to G Bot jump/fall/landing clips with blends | FIX-0 | FIX-4 | Animation worker | animation player, G Bot manifests, focused tests | parallel-safe | focused RED/GREEN + telemetry assertions |
| FIX-3 | Store two committed poses and expose deterministic render interpolation | FIX-0 | FIX-4 | Interpolation worker | movement component/helper and focused tests; no central Runtime | parallel-safe | 30/60/120-like interpolation tests |
| FIX-4 | Admit each eligible rigged Subject to vNext and integrate render alpha | FIX-1..3 | FIX-5 | main | `babylon-world-runtime.ts`, playground adapter/tests | main-agent-only | real two-G-Bot Runtime regression |
| FIX-5 | Browser, full gates, truth docs and narrow Diversion commits | FIX-4 | user review | main | ledgers, reviews, evidence | main-agent-only | commands + desktop/narrow screenshots |

## Frozen interfaces

1. **Per-Subject vNext admission.** A rigged Subject is admitted independently of
   world Subject count. Unsupported rigged Control fails closed; it does not silently
   select the legacy owner. In multi-Golden worlds only the possessed Subject may
   mutate CameraDirector; every Subject still receives animation projection.
2. **Body continuity.** The authoritative Tick-start `checkSupport()` sample gates
   snap-down. `supported` and `sliding` may use the existing step allowance;
   `unsupported` gets no snap-down and no vertical step-height amplification budget.
   Provider-neutral BodyPort and Locomotion contracts do not change.
3. **Vertical-phase animation.** `takeoff/rising/apex` use `jump`; `falling` prefers
   `fall`; `landing` prefers `land.hard`, then `land.hard.alt`. Missing optional clips
   fall back to `jump`. The player never predicts airtime or infers a phase from
   velocity. G Bot landing lasts 8 fixed Ticks so its 5-Tick entry blend can complete.
4. **Committed render poses.** Babylon presentation stores previous/current committed
   visual-root poses. Fixed Tick `synchronizeVisual()` advances the pair; render-only
   `renderVisual(alphaRatio)` samples position linearly and orientation by shortest
   quaternion arc without changing Snapshot, Body, CameraContext or state hash.
5. **Render alpha.** `renderFrame(alphaRatio = 1)` is provider-internal. Real-time
   Adapter passes `fixedStepAccumulatorSeconds / fixedDeltaSeconds`, clamped to
   `[0, 1]`; paused, capture and explicit renders use `1`. Non-finite/out-of-range
   direct Runtime input fails closed.
6. **No provider-neutral protocol change.** The ten-stage Tick, Locomotion V2,
   Action, BodyPort, World Snapshot and Browser DTO contracts remain unchanged.

## Checkpoints

- 2026-08-27: User `pnpm-workspace.yaml` change shelved as
  `codex-pre-3c-fix-pnpm-workspace` (`dv.shelf.d2c7a4ed-af86-4753-ab71-33721564df31`).
- 2026-08-27: Latest `main` merged into this branch as `dv.commit.7`; canonical number
  helper restored semantically in the central Runtime working change.
- 2026-08-27: User workspace configuration restored with shelf retained because the
  package manager otherwise rejects the existing esbuild install. It remains excluded
  from 3C commits. Main canonical capture regression: 7/7 passing.
- 2026-08-27: FIX-1 completed in `dv.commit.11`. Unsupported bodies receive no
  snap-down/step allowance; supported slope/contact and surface-velocity contributions
  are consumed only within frozen geometric bounds. Real G Bot takeoff/landing passes.
- 2026-08-27: FIX-3/4 completed in `dv.commit.12`. Every rigged Subject is admitted
  independently to Golden vNext, initial and interpolated visual poses come only from
  committed movement, and Camera/Animation consume the same committed Tick.
- 2026-08-27: Browser gate completed in `dv.commit.13`. The reset Smoke establishes
  one neutral committed Tick before input; result: 14.07 m movement, finite transform,
  camera up/down both true, desktop and 390x844 ready, no console warning/error.
- 2026-08-27: Final technical gates: 250/250 3C core tests, 28/28 Playground Adapter
  tests, `tsc --noEmit`, production build (2,270 modules), and migration ledger
  (11 entries / 61 non-increasing live references) passed. Human FeelReview remains 0/2.
