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

- [ ] Run existing ordinary/Training camera baselines before editing runtime code.
- [ ] Test immediate retraction, elapsed-time recovery, pivot separation and a visible subject behind an arm obstacle, while eye collision remains mandatory.
- [ ] Implement `CameraCollisionSolver(probe)` with `solve(request, timing)`, read-only `project(request)`, `reset`, capture/restore transaction state. Probe takes target/eye tuples and radius and returns native distance/contact data.
- [ ] Test projection and duplicate captures leave solver state unchanged, instances recover independently, and resets discard contact memory.

## Task 2: Integrate real consumers

Files: `packages/three-world/src/camera.ts`, `training/camera.ts`,
`training/environment/queries.ts`, new `training/camera-queries.ts` if needed.

- [ ] Delegate ordinary pivot/recovery solving while preserving its existing native probe semantics, errors, reset snapshots and Episode start relocation.
- [ ] Adapt Training native queries with sensor/self exclusions and capsule visibility supplied by its camera policy. Preserve the 5/s release response and shoulder offset.
- [ ] Route vehicle safety and interpolated projection through the same solver. Keep vehicle follow damping in framing and exact capture read-only.
- [ ] Remove replaced geometry/retraction/recovery loops; verify mode/actor/map/reset transitions and independent world instances with real Rapier.

## Task 3: Verification and integration

- [ ] Run `pnpm exec vitest run packages/three-world packages/camera-collision scripts/three-creator scripts/three-episode` and the runtime checklist's independent Node commands.
- [ ] Run typecheck, census, boundaries and runtime prebuild on final source.
- [ ] Exercise actual Creator recording/captures and Episode lease/reset/repeated frame captures; inspect saved images and frame/state evidence.
- [ ] Update architecture principles and package guidance; review the complete diff independently and resolve concrete findings.
- [ ] Fetch working main, preserve incoming edits, commit and integrate through the existing authorized workflow. Record source identity and evidence without claiming deployment.
