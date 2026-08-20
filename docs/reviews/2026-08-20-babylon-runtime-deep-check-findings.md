# Babylon runtime deep-check findings (2026-08-20)

## Review metadata

- Reviewer: Claude Fable 5 (Anthropic), running as the Cursor IDE agent.
- Review baseline: commit `3346585e3ea310b5c5a4d87bbabfacdb6298ac37` (`main`).
- Scope: the canonical Babylon + Havok runtime path — input mapping, `SubjectController`, physics stepping, movement-medium detection, subject animation, camera, subject asset cache, terrain heightfield conversion, and layout assertion revalidation.
- Method: full source read of `packages/runtime-babylon`, `packages/subject-actions`, `packages/layout-solver`, `apps/playground/src/babylon-world-adapter.ts`, and `apps/playground/src/worldkit-asset-resolver.ts`, cross-checked against the installed Babylon.js 9.21.2 sources (`characterController.js`, `havokPlugin.js`, `math.vector.pure.js`) for gravity semantics, heightfield data layout, and Euler composition order.
- Audience: this document is the work order for a follow-up review-and-fix pass (Codex). Each finding lists evidence, expected behavior, and a suggested fix direction. Re-verify every claim against the current tree before fixing; line numbers refer to the baseline commit and may have shifted.

## Codex revalidation and disposition

Revalidated against the post-baseline working tree before applying fixes. The original findings remain as review evidence; this section records the current disposition instead of rewriting that evidence after the fact.

- **Confirmed and addressed:** H1, H2, H3, H4, M5, M6, L8, L9, and L10. Regression coverage now includes unsupported falling and landing, support-state authority on triangle-interpolated slopes, held-jump edge triggering, fixed-step accumulation at different display-frame intervals, frame-loop failure diagnostics, multi-axis Babylon rotation parity, reset input cleanup, real camera/facing/FPS snapshot values, and shared animation timing.
- **M7 narrowed, not implemented as swimming:** the runtime still does not claim complete swimming or buoyancy. The report's “undocumented” statement was not current: `docs/07-alpha-implementation.md`, `docs/10-current-experiments.md`, and the G Bot S1 design already describe swimming as unsupported or out of scope. This remains an explicit capability gap rather than an implied production feature.
- **The original heightfield “verified clean” conclusion was rejected:** an asymmetric physical-ray regression exposed an X/Z transpose on square heightfields. That mapping is corrected. Babylon 9.21.2 also cannot preserve the intended axes for rectangular heightfields through this adapter path, so rectangular terrain now uses the rendered triangle mesh as the exact static collider instead of `PhysicsShapeHeightField`.
- **Terrain height semantics were unified:** Compiler and Runtime terrain sampling now use the same two-triangle interpolation as the rendered mesh, while physical Havok support remains the sole ground/air authority for subjects.
- **Previously in-flight interaction fixes were preserved and integrated:** movement-relative facing, orbit camera controls, and terrain centering remain part of the same working-tree change set; the fixes above were coordinated around those changes rather than replacing them.

The corrected baseline was committed on `main` before the character/camera capability integration. The semantic integration preserves these fixes and adds its own final verification record in the accepted integration design.

### Verification record

- `pnpm typecheck`: passed.
- `pnpm test`: 50 files and 459 tests passed.
- `pnpm build`: passed with 2,085 transformed modules. The pre-existing Vite large-chunk advisory remains and is tracked as a separate bundle-splitting concern, not a runtime-correctness failure.
- `pnpm verify:canonical`: passed; Normalized IR `sha256:e5b53f5d853c33e07e4d09c960d01210ad951b3666dcd41faf2c442d9d698d83`, ExecutionPlan `sha256:39925981aac70d61b5056259c384346fb0db4fde628499dbf6799e098c15ba0d`.
- `pnpm verify:placement-layout`: passed; Normalized IR `sha256:869fbf4e48fc6200d8512a643914d091358e3f8e254e705dffd315233e7c7190`, ExecutionPlan `sha256:e55aa781caa92af917b5224a3846e0ddd5e672b1ab9f3613fcb62645b3b98b6d`.
- `pnpm verify:rigged-subject`: passed; Normalized IR `sha256:ffe2240f2fa90931d7d7cb3863c0d1068b0984dd2b4897f2ffbc9473ca76a1f9`, ExecutionPlan `sha256:df3a35b3ff935c0ddc1f9c68a8dfca6395193b02c92b1db6e63b20429f55f994`.
- `pnpm verify:g-bot-subject`: passed; Normalized IR `sha256:6960d9c3a373d32f7db5bbebcf8559ebc3639ddb5f03fe39600a757fdbdd6ea9`, ExecutionPlan `sha256:b5be7cb6b675217d606ff36957978287f2fc86ecad40f49178d09330c60442c5`.
- Automated behavioral acceptance covers falling and landing after an unsupported spawn, leaving a raised collider, one jump per held Space press, and equivalent fixed-tick progression across 120 Hz-like and 30 Hz-like render intervals. The last item is deterministic timestamp-driven adapter coverage, not a claim that two physical monitors were manually tested.

## Historical out of scope at the review baseline

At the original review baseline, the following three user-reported defects were being fixed separately. They are now covered by the corrected baseline and preserved by the capability integration; the list remains here only to explain the original review scope:

1. All movement keys move the character forward (input/direction mapping).
2. The character faces the camera instead of `-Z` forward, and the camera cannot be rotated.
3. Jumping lets the character fall below the terrain surface.

## High-priority findings

### H1. No gravity is applied when airborne without a jump — walking off a ledge levitates forever

- Location: `packages/runtime-babylon/src/subject-controller.ts`, `step()` (baseline lines 92–110).
- Evidence: Babylon 9.21.2 `PhysicsCharacterController.integrate(deltaTime, surfaceInfo, gravity)` uses its `gravity` argument only inside `_resolveContacts` to compute impulses applied to contacted **dynamic** bodies; it never accelerates the character itself. `calculateMovementToRef` decomposes velocity in the surface frame with a zero desired normal component, so it actively drives vertical velocity toward 0. Gravity must therefore be integrated into the velocity by the caller. The current code does this only in the `isUnsupported && this.jumpInProgress` branch. When the character becomes `UNSUPPORTED` without a preceding jump (walking off a cliff, platform edge, spawn in air), `calculated.y` is frozen at the current value (~0) every tick: the character hovers permanently, `movementMedium` stays `"air"`, and the animation resolver plays `jump` forever. Non-controlled subjects spawned above the ground never fall either.
- Test gap: `packages/runtime-babylon/src/runtime.test.ts` has no coverage for non-jump falling.
- Expected behavior: gravity is applied to the character's velocity on every tick in which the controller is not supported (and, if water is modeled, scaled per medium); `jumpInProgress` should only gate the initial upward impulse.
- Suggested fix: apply the gravity integration whenever `isUnsupported`, independent of `jumpInProgress`. Add runtime tests: (a) subject walks off a ledge and reaches the lower ground within a bounded number of ticks; (b) subject spawned above terrain falls and lands.

### H2. Two independent "grounded" truths diverge on slopes

- Location: `movementMediumAtSubjectOrigin` in `packages/runtime-babylon/src/babylon-world-runtime.ts` (baseline lines 355–375) versus `checkSupport` usage in `subject-controller.ts`.
- Evidence: physical support uses Havok contact queries (`checkSupport`), but jump permission, animation action resolution, and medium detection use `sampleExecutionTerrainHeight` (bilinear interpolation) with a fixed `+0.16 m` tolerance. The Havok heightfield collides against per-cell triangle pairs; bilinear interpolation does not equal the triangulated surface inside a cell, and on steep cells the difference can exceed 0.16 m. Consequences: the character can be physically supported while `movementMedium === "air"` (jump denied, jump animation looping), or be reported `"ground"` mid-fall so `jumpInProgress` is cleared at the wrong time. This interacts directly with the user-reported fall-through-terrain defect.
- Expected behavior: a single source of truth for groundedness. Physical support state (`checkSupport().supportedState`) should drive jump permission, `jumpInProgress` lifecycle, and the ground/air distinction; terrain-height sampling should remain only for water-region membership.
- Suggested fix: pass the tick's `CharacterSurfaceInfo` (or a boolean derived from it) into the medium/action decision instead of re-deriving groundedness from sampled terrain height. Keep `sampleExecutionTerrainHeight` for water tests only. Add a steep-slope runtime test where bilinear height and triangle height diverge by more than 0.16 m.

### H3. Simulation speed is tied to the display refresh rate

- Location: `apps/playground/src/babylon-world-adapter.ts`, `animate()` (baseline lines 460–476).
- Evidence: every `requestAnimationFrame` callback advances exactly 1 fixed tick (1/60 s). On a 120 Hz display the world runs at 2× real time; at 30 fps it runs at 0.5×. There is no time accumulator.
- Expected behavior: fixed-timestep simulation decoupled from render rate — accumulate real elapsed time and run `floor(accumulated / FIXED_TIME_STEP_SECONDS)` ticks per frame, with a cap (e.g. 5 ticks) to avoid spiral-of-death after tab suspension. Determinism of `runFixedInput` for CLI/protocol callers must be preserved.
- Suggested fix: implement the accumulator inside `animate()` only (adapter layer); do not change `runFixedInput` semantics.

### H4. Jump input is level-triggered — holding Space re-fires and auto-bunny-hops

- Location: `packages/runtime-babylon/src/subject-controller.ts`, `step()` (baseline lines 97–101).
- Evidence: `jumpRequested = hasAction(actions, "jump") && movementMedium === "ground"` evaluates the *held* key every tick. During the first ticks of a jump the subject origin is still within the 0.16 m ground band, so vertical velocity is re-set to `jumpSpeedMetersPerSecond` on consecutive ticks; on landing with Space held the character immediately jumps again.
- Expected behavior: jump triggers once per key press (edge-triggered), gated on being physically supported (see H2).
- Suggested fix: track the previous tick's jump-action state in the controller (or convert the semantic action into a pressed-edge event in the adapter) and require a release before re-arming. Coordinate with the in-flight input fix listed as out of scope.

## Medium-priority findings

### M5. Euler composition order differs between rendering/physics and layout math

- Locations: `applyTransform` in `babylon-world-runtime.ts` and `applyLocalTransform` in `subject-visual.ts` use `Quaternion.FromEulerAngles(x, y, z)`; `runtimeLayoutBounds` in `babylon-world-runtime.ts` (baseline lines 109–124) and `packages/layout-solver/src/candidates.ts` (baseline line 57) hand-build a rotation matrix.
- Evidence: Babylon 9.21.2 `Quaternion.FromEulerAngles(x, y, z)` delegates to `RotationYawPitchRollToRef(y, x, z)`, i.e. **R = Ry·Rx·Rz**. The solver and the runtime revalidation both build **R = Rz·Ry·Rx**. The two agree only for single-axis (yaw-only) rotations. The solver currently emits yaw-only candidates, so nothing is broken today, but any authored multi-axis `rotationEulerRadiansXYZ` will make layout assertions validate a different AABB than what is actually rendered and collided — silently.
- Suggested fix (pick one, apply consistently): (a) restrict object/placement rotations to yaw-only at schema validation time and document the constraint, or (b) change the two hand-built matrices to Babylon's y-x-z order and add a conformance test comparing the analytic AABB against Babylon's computed world bounds for a multi-axis rotation.

### M6. An exception in the adapter frame loop silently kills the world

- Location: `apps/playground/src/babylon-world-adapter.ts`, `animate()` / `scheduleAnimationFrame()`.
- Evidence: `animate()` is invoked as `void this.animate()`. If `runtime.runFixedInput` throws, the rejection is unhandled and `scheduleAnimationFrame()` is never called again — the canvas freezes with no diagnostic and no recovery.
- Suggested fix: wrap the tick in try/catch, surface the error through the existing diagnostic channel (and/or `console.error`), and decide explicitly whether to keep rendering (paused) or stop; never exit the loop silently.

### M7. Water locomotion is half-implemented and undocumented as a gap

- Location: `subject-controller.ts` `step()` water branches; `movementMediumAtSubjectOrigin` water band checks.
- Evidence: without `jumpInProgress`, vertical velocity is frozen in water (same mechanism as H1), so a character translates at a constant depth; after jumping into water, 0.15× gravity pulls it down indefinitely, jumping out is impossible (`jumpRequested` requires `"ground"`), and sinking below `waterLevelMeters - depthMeters - 0.6` flips the medium back to `"air"`. There is no buoyancy or surfacing model.
- Suggested fix: either implement minimal buoyancy/surfacing semantics, or record water traversal explicitly as a capability gap in the subject-physics gap document and constrain `traversalMode: "swimmable"` content until it is supported. Do not leave the current behavior looking like supported swimming.

## Low-priority findings

- L8. `apps/playground/src/babylon-world-adapter.ts` `snapshot()` hardcodes `performance.fps: 60`, `player.rotationY: 0`, and `camera.yaw: 0`. Protocol consumers receive fabricated values; report real ones or omit the fields.
- L9. `resetRuntime()` (worldkit protocol path) does not clear `PhysicalKeyboardActionTracker`, unlike `reset()`; keys held across a protocol reset keep acting. Clear tracked keys on both reset paths.
- L10. `packages/runtime-babylon/src/subject-animation-player.ts` hardcodes the 60 Hz tick rate twice (`Math.round(binding.blendDurationSeconds * 60)` and `/ 60` in `sampleActive`), duplicating `FIXED_TIME_STEP_SECONDS`. Derive both from the shared constant so a future tick-rate change cannot silently desynchronize animation timing.

## Verified clean — do not spend fix effort here

- Terrain heightfield data layout: `toBabylonHeightfieldData` applies an X-mirror + transpose, and Babylon's `havokPlugin.js` HEIGHTFIELD branch applies a second X-mirror + transpose; the composition is the identity mapping onto the plan's row-major samples and matches the corner-origin terrain mesh. Correct, but it depends on Babylon internals — a regression test pinning a known asymmetric heightfield through physics raycast/support is worthwhile if not already covered by the verify scripts.
- `SubjectAssetCacheV1`: hash/byte-length/inventory triple validation, refCounted leases, concurrent pending-load dedup, and reverse-order disposal are sound.
- Self-contained GLB validation (external `uri` rejection, forbidden cameras/lights/sounds/actionManagers/behaviors) and the playground fetch resolver's same-origin + no-redirect policy have no gaps found.
- `SubjectAnimationPlayer` samples deterministically from ticks (no wall clock) and its blend-weight convergence is correct.

## Verification commands

Run after fixes, from the repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Manual check: open `pnpm dev` playground, load the G Bot world, and confirm (a) walking off any raised terrain results in falling and landing, (b) holding Space produces exactly one jump, (c) behavior is identical on a 60 Hz and a 120 Hz display.
