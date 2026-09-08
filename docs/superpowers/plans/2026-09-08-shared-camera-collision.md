# Shared Camera Collision Implementation Plan

> Execute sequentially using superpowers:executing-plans. Root owns interfaces,
> runtime edits and integration; use an independent final code reviewer.

**Goal:** Both camera paths actually use the same collision solver while retaining their framing and lifecycle behavior.
**Architecture:** A provider-neutral `CameraCollisionSolver` composes geometry projection with the existing `CameraHardDecolliderV1`. Three/Rapier adapters live in three-world; render projection is stateless.
**Tech Stack:** TypeScript, Three 0.185.1, installed Rapier, Vitest, Playwright.
**Spec:** [Approved design](../specs/2026-09-08-shared-camera-collision-design.md).
**Base:** `092590c4`, `codex/shared-camera-collision-20260908`.

## Global constraints

Preserve one camera writer, fixed clock and live physics world. No global solver
state, minimum recording duration, new package or cloud submission. Keep capsule
visibility separate from eye collision. Displays/captures never advance recovery.

## Task 1: Shared solver and baseline

Files: `packages/camera-collision/src/camera-collision-solver.ts`, its test and index;
`packages/three-world/src/camera.test.ts`, Training runtime/presentation tests.

- [x] Run existing ordinary/Training camera baselines before editing runtime code.
- [x] Test immediate retraction, elapsed-time recovery, pivot separation and a visible subject behind an arm obstacle, while eye collision remains mandatory.
- [x] Implement `CameraCollisionSolver(probe)` with `solve(request, timing)`, read-only `project(request)`, `reset`, capture/restore transaction state. Probe takes target/eye tuples and radius and returns native distance/contact data.
- [x] Test projection and duplicate captures leave solver state unchanged, instances recover independently, and resets discard contact memory.

## Task 2: Integrate real consumers

Files: `packages/three-world/src/camera.ts`, `training/camera.ts`,
`training/environment/queries.ts`, new `training/camera-queries.ts` if needed.

- [x] Delegate ordinary pivot/recovery solving while preserving its existing native probe semantics, errors, reset snapshots and Episode start relocation.
- [x] Adapt Training native queries with sensor/self exclusions and capsule visibility supplied by its camera policy. Preserve the 5/s release response and shoulder offset.
- [x] Route vehicle safety and interpolated projection through the same solver. Keep vehicle follow damping in framing and exact capture read-only.
- [x] Remove replaced geometry/retraction/recovery loops; verify mode/actor/map/reset transitions and independent world instances with real Rapier.

## Task 3: Verification and integration

- [x] Run `pnpm exec vitest run packages/three-world packages/camera-collision scripts/three-creator scripts/three-episode` and the runtime checklist's independent Node commands.
- [x] Run typecheck, census, boundaries and runtime prebuild on final source.
- [x] Exercise actual Creator recording/captures and Episode lease/reset/repeated frame captures; inspect saved images and frame/state evidence.
- [x] Update architecture principles and package guidance; review the complete diff independently and resolve concrete findings.
- [x] Fetch working main, preserve incoming edits, commit and integrate through the existing authorized workflow. Record source identity and evidence without claiming deployment.

## Verification evidence

- Baseline: 96 existing ordinary/Training/mounted camera tests passed before runtime edits.
- Final runtime closure: 55 Vitest files / 685 tests passed.
- Independent Node closure: 105 tests passed; provider transport mocked.
- Typecheck, workspace boundaries and census (61 files) passed.
- Runtime prebuild: `dddaf44c10743c4ffd5456ed224152d492b349917eb7e9e943aed815853c9e46`.
- Real visibility browser: six cases passed. Partial/visible cases keep the 8.8 m arm with zero measured arm change; full occlusion retracts to about 1.7697 m. Inspected thin-pillar, fully-blocked and mounted screenshots.
- Creator complete recordings: ordinary 7.0599 s and mounted 23.3196 s real input, both delivered successfully with the runtime hash above. These are local authored verification scenes, not cloud generation.
- Actual Episode repeated PNGs and reset/replay camera/PNG equality passed for both worlds. A mounted 30-second segment also passed: 720 real frames at 1280×720 / 24 fps, 203.78 m of physical travel, no browser errors or padding.
- Independent review caught a display-order-dependent emergency fallback; a failing regression reproduced x=2 versus x=0.4. Display now uses the committed snapshot and the final regression passes. Re-review found no remaining actionable issue.
- New solver regressions also cover failed solve rollback and consistent fixed/display fallback. Training free-arm configuration stays exact while geometry-derived constrained distances remain measured.

Artifacts stay in the preserved worktree under `.codex-tmp/shared-camera/` and
`outputs/training-camera-visibility/browser/`. Fixture-only setup failures (missing
HTML head, duplicate verification-plan starts and loading a relative source path
without its adapter) were corrected without changing runtime or validators; completed
Creator deliveries were retained for Episode continuation.

The initial mounted recording route encountered the second horse and correctly
failed with `EPISODE_TRAINING_ROUTE_BLOCKED`. That evidence was preserved as
`mounted-blocked-route.json`; the final selected segment follows a clear forward
corridor using unchanged runtime/validators. This verifies one segment, not the
six-segment production campaign. No cloud execution or deployment occurred.
