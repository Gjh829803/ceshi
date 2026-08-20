# Capability runtime code review (2026-08-20)

## Review metadata

- Reviewer: Cursor Grok 4.6, running as the Cursor IDE agent.
- Review HEAD: `3faf4f140229d869d4f1e5c7d531555e82832594` (`main`, `fix: register Babylon browser shaders`).
- Compared against: `3346585e3ea310b5c5a4d87bbabfacdb6298ac37` (G Bot product-asset close) through current `main`.
- Scope: capability-driven motion/camera integration, Babylon character hardening, playground workbench, and the two follow-up commits after the timeout pin (`8107d39`, `3faf4f1`).
- Method: full read of `motion-kernel-runtime.ts`, `camera-director.ts`, `control-profile-runtime.ts`, `babylon-world-runtime.ts` (`runFixedInput` / `renderFrame` / water / terrain collider), `babylon-world-adapter.ts` tick accumulator, `terrain.ts`, `authoring-loader.ts`, plus targeted checks of compiler spawn height, layout Euler matrices, animation pose sampling, and shader bootstrap. Line numbers refer to this HEAD; re-verify before patching.
- Audience: follow-up review-and-fix pass. Do not re-open findings that the earlier deep-check already closed unless the current tree reintroduces them.
- Related document: `docs/reviews/2026-08-20-babylon-runtime-deep-check-findings.md` (Fable 5 deep-check + Codex disposition). This document is a new review of the integration that landed after that fix, not a rewrite of it.

## How this review relates to the earlier deep-check

The 2026-08-20 Fable 5 deep-check (`H1`–`H4`, `M5`–`M7`, `L8`–`L10`) targeted the pre-capability `SubjectController`. Codex addressed the confirmed bugs in `8f86c95` and preserved them through the capability merge. A later independent review of `3346585..HEAD` found **new** defects introduced by the capability integration. Those new defects were re-checked against `3faf4f1` and are still present.

| Earlier finding | Current disposition |
|---|---|
| H1 airborne gravity without jump | Closed. Gravity is applied whenever unsupported (`motion-kernel-runtime.ts` `stepActiveKernel`). Tests cover unsupported falling. |
| H2 dual groundedness (bilinear height vs `checkSupport`) | Closed in intent. Ground/air for locomotion uses Havok support + `jumpInProgress` + a one-tick spawn raycast pending flag. Water is a separate volume test (see open P2). |
| H3 display-tied simulation rate | Closed for **physics** ticks. Adapter `consumeFixedTicks` accumulates real elapsed time, caps at 5 ticks/frame. Camera damping is **not** on that clock (open P2). |
| H4 level-triggered jump | Closed. `jumpActionWasActive` makes jump edge-triggered. |
| M5 Euler Ry·Rx·Rz vs Rz·Ry·Rx | Closed. Layout solver and runtime AABB comments/matrices match Babylon `FromEulerAngles`. |
| M6 unhandled `animate()` rejection kills the loop | Closed. Adapter catches, pauses, records `WORLDKIT_RUNTIME_FRAME_FAILED`. |
| M7 water locomotion | Still a capability gap (swimming not claimed). The **volume** used to classify `"water"` is now worse than the pre-fix ±0.6 m band (open P2). |
| L8–L10 snapshot/reset/animation Hz | Closed in the harden commit. |
| Heightfield “verified clean” (Fable 5) | Correctly rejected by Codex. Square heightfields remapped; rectangular terrain uses `PhysicsShapeMesh`. Tests exist. |

User-reported interaction bugs at the original baseline (all keys walk forward; character faces camera; jump falls through terrain) are treated as closed on the controlled G Bot path. This review does not re-litigate them.

## Open findings

### P1. Uncontrolled subjects marked `ground` never `step`, so spawn pending never clears and they can hover

- Location: `packages/runtime-babylon/src/babylon-world-runtime.ts` `runFixedInput` (HEAD lines 698–706); `packages/runtime-babylon/src/motion-kernel-runtime.ts` `movementMediumForSupport` / `initialGroundSupportPending` (HEAD lines 599–609, 477).
- Introduced by: capability integration (`if (controlled \|\| controller.movementMedium !== "ground")` skip).
- Evidence: `initialGroundSupportPending` is set from a short downward raycast in the kernel constructor/`reset`, and `movementMediumForSupport` returns `"ground"` while that flag is true. The flag is cleared only at the end of `stepActiveKernel` / `stepGlide`. Compiler spawn is `groundHeight + spawnYOffset` (`packages/compiler/src/compile.ts` around the `spawnSubjectOriginPositionMetersXYZ` assignment). Any positive offset, or a raycast hit while Havok has not yet supported the capsule, yields `medium === "ground"` on tick 0. Uncontrolled subjects then skip `step()` forever. `refreshMovementMedium()` still runs, but it consults the same pending flag, so the classification cannot recover.
- Why a controlled G Bot session hides it: the possessed subject always `step`s, so pending clears after one tick.
- Existing test does not cover this: `runtime.test.ts` “applies gravity to an uncontrolled airborne Subject…” spawns the observer at `y = 8`, so the raycast misses and medium is `"air"`. That is a different path.
- Expected behavior: every subject whose capsule is not actually Havok-supported must `step` (empty actions are fine) until pending is cleared and support is real. Skipping grounded idle NPCs is optional **after** the first successful support resolve, not before.
- Suggested fix: always `step` while `initialGroundSupportPending` is true, or drop the skip entirely and only skip integrate-heavy work after `checkSupport` reports supported **and** pending is false. Clearing pending from `refreshMovementMedium` when support is known is not enough if `step`/`integrate` never runs.
- Required test: two-subject plan; uncontrolled spawn at terrain height + 0.2 m; after a bounded tick count, `movementMedium === "ground"` **and** `position.y` is within capsule-settling tolerance of the sampled terrain, not stuck at spawn Y.

### P2. `CameraDirector.update` is driven from `renderFrame` with a fake `1/60 s` dt

- Location: `packages/runtime-babylon/src/babylon-world-runtime.ts` `renderFrame` (HEAD lines 816–821) and `updateCamera` (HEAD lines 852–868).
- Introduced by: capability camera director (stateful exponential damping). Before the director, `updateCamera` was an idempotent pose formula; extra calls were harmless.
- Evidence: `runFixedInput` already calls `updateCamera()` once per simulation tick. Playground `animate()` then always calls `render()` → `renderFrame()` → `updateCamera(FIXED_TIME_STEP_SECONDS)` again. `8107d39` added pose sampling to `renderFrame` (correct) but left the extra director tick in place.
- Consequences:
  - 60 Hz play: damping parameters apply roughly twice per 16 ms.
  - 120 Hz: frames with 0 physics ticks still advance the director by 1/60 s, so camera feel is refresh-tied again (physics ticks are not).
  - Pause: simulation stops; `renderFrame` still damps the camera toward its target.
- Expected behavior: director time matches simulation time. `renderFrame` may sample animation poses and draw; it must not advance camera smoothing unless a sim tick just occurred, or it must use the real display delta **instead of** (not in addition to) the sim dt, with pause freezing the director.
- Suggested fix: remove `updateCamera()` from `renderFrame`, or gate it on “this frame consumed N sim ticks” and pass `N * FIXED_TIME_STEP_SECONDS`. Keep `applyAnimationPose()` on the render boundary.
- Required tests: (1) `runFixedInput` only, no `renderFrame`, director snapshot equals a second call after a no-op render if render is pose-only; (2) `setPaused(true)` then several `renderFrame`s does not change `viewYawOffsetRadians` / camera position while the target is still catching up.

### P2. Swimmable water volume is oversized and steals ground locomotion

- Location: `packages/runtime-babylon/src/babylon-world-runtime.ts` `waterSurfaceHeightAtSubjectOrigin` (HEAD lines 376–385).
- Introduced/worsened by: capability/harden path. Pre-fix band was roughly `waterLevel ± 0.6 m` with depth. Current band is `waterLevel - depth - 1` through `waterLevel + 2`, XZ-only membership via `containsPoint`.
- Evidence: `movementMediumForSupport` returns `"water"` as soon as that helper is defined, **before** Havok support. Jump requires `"ground"`. Unsupported gravity in water is scaled by 0.15. A pier, steep bank, or any walkable surface inside the water polygon and within 2 m above the water line becomes water: no jump, weak gravity.
- M7 said swimming is an explicit gap. Expanding the classifier is not documenting a gap; it changes ground gameplay.
- Expected behavior: `"water"` only when the subject origin is actually in the water column (at or below water level, above the basin floor), or a later dedicated buoyancy kernel owns the medium. Walkable geometry above the water plane must stay `"ground"` / `"air"` from Havok support.
- Suggested fix: restore a tight vertical band (`y <= waterLevel + small epsilon`, `y >= waterLevel - depth - epsilon`) or require `subjectOrigin.y <= waterLevel` plus XZ containment. Do not use +2 m.
- Required test: swimmable ellipse plus a collision-enabled box/pier whose top is 1 m above water level and whose XZ is inside the ellipse; a subject standing on that top must be `"ground"` and able to jump.

## Follow-up commits on current `main` (not the open findings)

These landed after `63891a3` and were included in the HEAD re-check. They do **not** close P1/P2.

### `8107d39` — sample rigged poses at render boundary

- Change: `SubjectAnimationPlayer.step` only records `latestTick` / transitions; `applyPose()` / `SubjectVisual.applyAnimationPose()` run from `renderFrame`.
- Assessment: correct split (deterministic sim vs render sample). Explains walk/run/jump PNG hash updates. Residual: any caller that inspects bone/mesh pose after `runFixedInput` without `renderFrame` sees the previous pose; action IDs in snapshots still update in `step`, so protocol snapshots stay consistent. Not a defect if capture/verify always renders. Do not put camera damping on this render path (see open P2).

### `3faf4f1` — register Babylon browser shaders

- Change: `packages/runtime-babylon/src/babylon-shader-bootstrap.ts` writes default / postprocess / rgbd shaders into `ShaderStore`; imported as a side effect from `babylon-world-runtime.ts`.
- Assessment: appropriate fix for bundled-browser missing shader names. Side-effect import is acceptable if every runtime entry loads this module (it does). Keep the unit test that the store keys exist.

### `63891a3` — explicit timeouts

- Azure Bay walkability and G Bot 25-clip smoke tests now use `15_000` ms. Test-only. No product behavior change.

## Intentional behavior — do not treat as bugs

- Throttle-steer profiles bind Space to both `brakeRequested` and `jumpRequested`. Playground copy documents Space as brake for vehicles/skimmers and jump for humanoid/forward-steer. `control-profile-runtime.test.ts` asserts both flags.
- Flight-attitude uses lateral input for both yaw and roll. Workbench text: “偏航并带动机体倾斜”.
- Uncontrolled airborne subjects play `idle` rather than `jump`. The high-spawn observer test requires `activeActionId: "idle"`.
- `unpowered-glide` and `water-surface` kernels are demos, not production swimming/flight.

## Still sound — do not spend fix effort here unless a new test fails

- Adapter fixed-step accumulator (`MAXIMUM_FIXED_TICKS_PER_DISPLAY_FRAME = 5`), pause clock reset, keyboard clear on `reset` / `resetRuntime`.
- Jump edge trigger and unsupported gravity in `MotionKernelRuntimeV1` for the **controlled** path.
- Square heightfield remapping + rectangular `PhysicsShapeMesh`; existing ray alignment tests.
- Layout / runtime Euler matrices aligned to Babylon y-x-z.
- Subject asset cache hash/length/inventory contracts (unchanged in this window).
- Playground authoring overlay budget bump for G Bot triangle count.

## Suggested implementation order

1. P1 (skip/`pending`) — small, correctness, hidden in single-player G Bot.
2. Camera director clock — `renderFrame` is now the pose boundary; easy to leave the extra `updateCamera` in by accident.
3. Water vertical band — gameplay on coastal/capability demo water.

Do not broaden into swimming, new camera algorithms, or schema renames.

## Verification

From the repository root, after fixes:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Manual: capability playground with a second idle subject spawned slightly above terrain (must land); pause while orbiting (camera must freeze); stand on any surface whose XZ is inside a swimmable body but whose feet are above the water plane (must remain ground, jump works).

## Codex disposition (2026-08-20)

The three requested findings were re-located against the current tree before editing. All three were confirmed. Findings closed by the earlier deep-check were not reopened, and the intentional Space/brake, flight yaw-plus-roll, and uncontrolled-airborne idle behaviors were left unchanged. This pass did not add swimming, change the camera algorithm, or change Authoring Schema.

### P1 — uncontrolled initial ground support: confirmed and fixed

- RED: an uncontrolled second Subject spawned `0.2m` above flat terrain remained at `y=0.2` after 120 fixed Ticks because its provisional `ground` medium caused `runFixedInput` to skip `step()` forever.
- Fix: `MotionKernelRuntimeV1` exposes its internal pending-support state through the Runtime-only `hasPendingInitialGroundSupport` getter. `BabylonWorldRuntime.runFixedInput` now steps a Subject when it is controlled, not in `ground`, or still resolving initial ground support. A settled, uncontrolled ground Subject keeps the existing idle skip.
- GREEN: the second Subject reaches Havok's stable capsule contact height (`y=0.142775m` on this fixture), reports `ground`, keeps `idle`, and has near-zero vertical velocity within the bounded Tick count.
- Conformance follow-up: canonical, Golden rigged, and G Bot isolation checks now consume one empty fixed Tick after reset before taking their strict isolation baseline. The `1e-9m` no-drift assertion was not relaxed; this separates one-time controller support resolution from input-driven movement.

### P2 — Camera Director render clock: confirmed and fixed

- RED: after one camera adjustment, 12 render-only frames changed `viewYawOffsetRadians` from about `0.2268` to `0.7895` and changed camera position even though no simulation Tick ran.
- Fix: `renderFrame()` still calls every Subject Visual's `applyAnimationPose()` and renders the Scene, but no longer calls `updateCamera()` with a fabricated fixed `1/60s` delta. Camera Director time remains owned by fixed simulation Ticks and explicit camera operations.
- GREEN: repeated render-only frames preserve the complete camera Snapshot while the director still has unapplied target offsets, covering the paused-display path.

### P2 — water volume above the surface: confirmed and fixed

- RED: a collision-enabled pier with its top `1m` above the water plane, inside a swimmable ellipse in XZ, was classified as `water` and could not jump.
- Fix: the water-column upper bound is now `waterLevelMeters + 0.1m`, replacing `waterLevelMeters + 2m`. The `0.1m` epsilon covers the existing Character Controller contact offset (the canonical water fixture is approximately `0.068m` above its declared water level) without absorbing elevated walkable geometry.
- GREEN: the pier Subject remains `ground`, enters `air` on a jump edge, receives upward velocity, and selects the `jump` Action. Existing water movement and watercraft harness coverage remains green.

### Verification

- Focused Runtime, Capability Runtime, and Adapter suites: 95/95 passed.
- `pnpm typecheck`: passed.
- `pnpm test`: 56 files, 495/495 tests passed.
- `pnpm build`: passed; the existing Vite large-chunk advisory remains.
- `pnpm verify:canonical`: passed.
- `pnpm verify:placement-layout`: passed.
- `pnpm verify:rigged-subject`: passed.
- `pnpm verify:g-bot-subject`: passed.
