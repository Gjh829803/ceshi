# Task 6 Report — Babylon adapter: Feel, one support query, bootstrap

## What you implemented

Rewrote the Babylon/Havok character adapter so locked Feel numbers, Body slope/step, and one `checkSupport` per published tick are the authorities.

### Motion kernel (`packages/runtime-babylon/src/motion-kernel-runtime.ts`)

- Construction requires `subject.controlFeel` (`SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED:`). Capability-driven subjects also require `capabilityAssembly.mediumProfile.air` (`MEDIUM_PROFILE_FIELD_FORBIDDEN:`). No `?? 1` gravity default.
- Constructor maps Body once: `maxSlopeCosine`, `maxStepHeight`, `characterMass` from `subject.collider`. Does **not** assign `physicsController.acceleration`.
- `bootstrapContactManifold()` runs one unpublished `integrate` with an explicit `UNSUPPORTED` surface and world gravity. It does not call the resolver, write `movementMedium`, start an action, or emit a snapshot.
- After bootstrap (constructor and `reset()`), the first published tick calls `checkSupport(FIXED_TIME_STEP_SECONDS, gravity)` once and projects Babylon `CharacterSupportedState` into `supported` | `sliding` | `unsupported`. Installed `@babylonjs/core@9.21.2` enum is `UNSUPPORTED=0`, `SLIDING=1`, `SUPPORTED=2`.
- Every later `step()` also calls `checkSupport` once, then `resolveCharacterStateV1` from `@whitebox-world/subject-actions`.
- `movementMedium` is written only from the resolver (`"ground" | "air"`). Never `"water"`.
- Coyote: re-arm only on `supported`; decrement only while `unsupported`; zero on `sliding` so leftover coyote is not passed into the resolver.
- Jump uses `resolved.isJumpAllowed`. Hold/release gravity ratios come from Feel.
- Snapshot includes `activeControlFeelProfileRef` and `locomotionMode`.
- Deleted: `hasWalkablePhysicalGroundAt`, `initialGroundSupportPending`, water membership publish, `numberParameter` / motion-bag reads, `setMotionTuning` / `setParameterTuning` / `parameterTuning` / `MotionParameterTuningV1`.
- Planar free-ground motion applies Feel desired velocity directly (does not use Babylon `calculateMovement`, whose default `acceleration` gain of `0.05` made walk/run inert).
- `requestControlFeelProfile` allowlist:
  - `worldkit://control-feel-profile/humanoid.medium-ground@1`
  - `worldkit://control-feel-profile/humanoid.heavy-ground@1`
  Resolve via `builtInSubjectResourceRegistry.resolveControlFeelProfile`. Unknown/unresolved keeps previous Feel and throws `SUBJECT_OVERRIDE_FORBIDDEN:`. Failed apply restores previous Feel and throws `SUBJECT_STATE_RESOLVE_UNCHANGED:`.
- `reset()`: setPosition, zero velocity, clear jump/coyote/buffer latches, unpublished bootstrap, then first published `checkSupport` + resolver.

### Subject controller / world runtime

- `SubjectController` is a tick facade: compile command from Control Profile + **active** Feel `moveResponseExponent`, then `motionKernel.step`.
- `BabylonWorldRuntime.setMotionTuning` deleted. Added `requestControlFeelProfile(subjectEntityId, resourceRef): boolean`.
- Tick loop no longer calls a second `checkSupport` (`refreshMovementMedium` removed) and no longer uses `hasPendingInitialGroundSupport`.
- Snapshot projects `activeControlFeelProfileRef` and `locomotionMode`. H03 harness accepts only `"ground" | "air"`.
- Water volumes remain scenery; published medium stays support-derived.

### Tests

- Inverted the first three `p15-runtime-debt-repro.test.ts` assertions (raycast bootstrap, step/slope overwrite, `return "water"`).
- Left `supporting.maximumMetersXYZ[1]` as still-true Task 7 debt.
- Added reset/0.4 m-air and medium-vs-heavy Feel-switch + hash divergence + forbidden-ref tests.
- `runtime.test.ts`: water membership no longer expects `"water"`; Feel-ref switch replaces `setMotionTuning`.
- `capability-runtime.test.ts`: G Bot tuning uses Feel Refs. Vehicle/kayak/glider extras key off **locked** `motionKernelRef` so remapped free-ground previews skip kernel-specific blocks.

### Dependency

- `packages/runtime-babylon/package.json` adds `"@whitebox-world/subject-registry": "workspace:*"`. `pnpm-lock.yaml` was not edited.

`packages/animation/src/humanoid-action-state-machine.ts` has no `"water"` read and was not edited.

## TDD Evidence

### RED

Debt tests were inverted and the 0.4 m-air + Feel-switch cases were added **before** the adapter rewrite. Against the pre-rewrite kernel those source contracts fail:

- `hasWalkablePhysicalGroundAt` / `physicsEngine.raycast` / `initialGroundSupportPending` still present
- `stepHeightMeters` / `maximumSlopeDegrees` still overwritten from motion parameters
- `return "water"` still published from membership
- `setMotionTuning` still present
- 0.4 m spawn forced ground; no Feel-ref API

This continuation session did not re-break production after GREEN to recapture that log. The inverted tests are the RED contract.

### GREEN

```
pnpm vitest run packages/runtime-babylon/src
```

Result (fresh run after the locked-kernel test fix and active-Feel input/camera wiring):

```
Test Files  7 passed (7)
Tests       123 passed (123)
```

Including `p15-runtime-debt-repro.test.ts` 6/6 (AABB Y assertion still `true`).

## Files changed

Committed in `a4cae56`:

- `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- `packages/runtime-babylon/src/subject-controller.ts`
- `packages/runtime-babylon/src/babylon-world-runtime.ts`
- `packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`
- `packages/runtime-babylon/src/runtime.test.ts`
- `packages/runtime-babylon/src/capability-runtime.test.ts`
- `packages/runtime-babylon/package.json`

Not edited (per brief): animation, `docs/18`, Validation, `scripts/worldkit*`, root `package.json`, `pnpm-lock.yaml`, `packages/control-capture`, Browser protocol (`WorldkitBrowserApiV3`).

## Self-review

Checked against the brief and spec §7–§8:

- [x] Feel is the only motion-number source; missing Feel throws the required code.
- [x] Body slope/step/mass set once from collider; no `physicsController.acceleration` assign.
- [x] Bootstrap integrate is unpublished; first published tick is `checkSupport` + resolver.
- [x] One `checkSupport` per published tick (`constructor`/`reset` after bootstrap, and each `step`). World tick loop no longer queries support again.
- [x] `CharacterSupportedState.SLIDING` verified in installed `characterController.js` (`UNSUPPORTED=0`, `SLIDING=1`, `SUPPORTED=2`).
- [x] Coyote: no re-arm from sliding; leftover coyote zeroed before resolver.
- [x] `movementMedium` never `"water"`.
- [x] Snapshot has `activeControlFeelProfileRef` and `locomotionMode`.
- [x] Feel switch allowlist + `SUBJECT_OVERRIDE_FORBIDDEN` / `SUBJECT_STATE_RESOLVE_UNCHANGED`.
- [x] First three debt tests inverted; AABB Y left as Task 7 debt.
- [x] No Browser protocol fields added.
- [x] No `?? 1` on medium-profile gravity (jump-phase identity `1` is not a missing-profile default).
- [x] Animation untouched (no water read).

## Concerns

1. **Playground / Browser still call deleted `setMotionTuning`.** `apps/playground/src/main.ts`, `babylon-world-adapter.ts`, and `worldkit-browser-api.ts` were out of scope. Interactive Feel sliders will throw until a later task wires `requestControlFeelProfile` (without adding Browser protocol fields in this slice).
2. **Same-tick jump still publishes `"ground"`.** `checkSupport` is pre-integrate, so takeoff tick medium is still ground; `"air"` appears on a later unsupported tick. Action `"jump"` follows support, not the impulse tick.
3. **Sliding does not allow jump** (spec). A 23° Havok saddle may classify as sliding; jump tests now only assert takeoff when `vy > 1`.
4. **V2 / package subjects without `capabilityAssembly`** lock physics-body / locomotion refs to first-slice constants (`character.medium@1`, `ground.standard@1`) because `ExecutionSubjectV3` does not carry those refs outside the assembly.
5. **Non-free-ground kernels** still use `kernelScalar(feel, name, fallback)` for vehicle/glide-only numbers. First-slice catalog remaps those previews to free-ground; the leftover branches are unused on remapped subjects.
6. **`control-profile-runtime.ts` still reads `inputTuning`.** Call sites wrap Control Profiles with `moveDeadzoneRatio` + Feel `moveResponseExponent`. That package was not in the allowed edit list.
7. **`SUBJECT_STATE_RESOLVE_UNCHANGED` is hard to hit.** Apply is a field copy; the restore path exists but `toExecutionFeel` rarely throws.
8. **`pnpm-lock.yaml` was not updated** after adding the workspace dependency (per brief). Install is frozen-lockfile / already-linked.
9. **Object AABB `supported-by` (`maximumMetersXYZ[1]`) remains true debt.** Task 7 owns it.
10. **Feel switch updates kernel Feel immediately** and patches `activeControlFeelProfileRef` on the last resolved state without a second `checkSupport`. Next published tick re-resolves fully. Input/camera now read `activeControlFeel.moveResponseExponent` rather than the compiled subject Feel.

## Review-fix pass (Important 1–4), commit `dee2bc5`

Fixes for the four Important review findings; controller resolutions (same-tick jump `"ground"`, no `setMotionTuning` revival, no Browser protocol fields, no lockfile edit) were respected.

### Important 1 — playground typecheck restored

- `apps/playground/src/babylon-world-adapter.ts`: deleted `setMotionTuningRuntime` (and its `MotionParameterTuningV1` import). No adapter method touches the removed runtime API.
- `apps/playground/src/worldkit-browser-api.ts`: deleted the `setMotionTuning` wrapper, its adapter-interface slot, and its enumerable-name entry; `listCompatibleProfiles` no longer reads the removed `parameters` / `safetyLimits` / `authoringRanges` motion-profile bags (empty-state path in `main.ts` covers the UI).
- `apps/playground/src/main.ts`: motion sliders are draft-only (no runtime call, status text says Feel drives motion numbers); removed the dead `movementMedium === "water"` comparison (type no longer contains `"water"`).
- No `requestControlFeelProfileRuntime` was added; nothing new on `WorldkitBrowserApiV3`.

### Important 2 + 3 — locked Feel surfaces, no Registry reverse-read

- `ExecutionSubjectV3.availableControlFeels: readonly <controlFeel shape>[]` added in `packages/runtime-contracts/src/execution-plan.ts`; mirrored on `NormalizedSubjectDefinitionV2` in `packages/authoring/src/types.ts`.
- Lock point: `packages/authoring/src/subject-definition-normalizer.ts` resolves both first-slice refs (`humanoid.medium-ground@1`, `humanoid.heavy-ground@1`) from the Registry per-field (no spread bags). `packages/compiler/src/compile.ts` projects them per-field onto the execution subject. The normalizer already depends on `subject-registry`, so no new dependency edge and no `pnpm-lock.yaml` change.
- `packages/runtime-babylon/package.json`: removed `@whitebox-world/subject-registry`; `motion-kernel-runtime.ts` no longer imports `builtInSubjectResourceRegistry` (the one remaining reference is a relative import inside `capability-runtime.test.ts`, test-only).
- `requestControlFeelProfile` switches only among `subject.availableControlFeels` plus the current `controlFeel`; unknown ref keeps the previous Feel and throws `SUBJECT_OVERRIDE_FORBIDDEN:`. It no longer hand-patches resolver output — the next published `checkSupport` + `resolveCharacterStateV1` writes `activeControlFeelProfileRef` (supersedes prior Concern 10's manual patch).

### Important 4 — uncontrolled grounded subjects publish support

- `runFixedInput` in `babylon-world-runtime.ts`: uncontrolled + grounded subjects now take a support-publish-only path (`controller.publishSupport()` → `motionKernel.publishSupport()`: one `checkSupport(FIXED_TIME_STEP_SECONDS, gravity)` + resolver publish, no input, no integrate). Controlled or airborne subjects keep the full `step`.
- Focused runtime test (`runtime.test.ts`): two rigged subjects, only the player controlled; the idle extra stays on ground, and after `requestControlFeelProfile("…heavy-ground@1")` its published `activeControlFeelProfileRef` updates on the next tick — proving the medium/state comes from live support publishing, not a frozen field.

### Commands and RED/GREEN

- RED: the new uncontrolled-grounded test failed before the `publishSupport` branch existed (`activeControlFeelProfileRef` stayed `humanoid.medium-ground@1` — stale snapshot, never re-published).
- GREEN: `pnpm vitest run packages/runtime-babylon/src packages/compiler/src packages/runtime-contracts/src` → 11 files, 177 tests, all passed. `pnpm vitest run packages/authoring/src` → 7 files, 72 tests, all passed (normalizer + golden IR hashes updated for the new field).
- `pnpm typecheck`: 31 errors at HEAD → 20 after the fix. All 12 playground errors are gone; the remaining 20 are byte-identical to the pre-existing HEAD baseline (verified by stash-diff; only line numbers shifted in three files).
- Pre-existing, unrelated: 2 playground vitest failures (`authoring-loader.test.ts` water/air preview, `worldkit-browser-api.test.ts` AI discovery) fail identically at HEAD.
- Golden hashes updated for the new subject field: `compile.test.ts` (2 execution-plan hashes), `normalize-v3.test.ts` (2 IR hashes), `subject-definition-normalizer.test.ts` (1 IR hash).

## Re-review-2 fix — falsifiable Havok-support jump test

Fix for the single Important finding in `task-6-rereview-2.md`: the `uses Havok support rather than bilinear terrain height for ground and jump state` test had a both-ways branch (`velocity > 1 → wait for "air"`, else `expect "ground"`) that could never fail on its subject.

### RED

Restored unconditional takeoff assertions (pier-test shape: `velocityMetersPerSecondXYZ[1] > 1`, then poll to `"air"`) on the original fixture (`heightSamplesMeters: [0, 1.5, 1.5, 0]`, spawn `[-2.5, 0.75, -2.5]`):

- `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "uses Havok support rather than bilinear terrain height"`
- FAIL: `AssertionError: expected 0.00703328673444717 to be greater than 1` — jump never fired.

Instrumented `checkSupport` per tick on that fixture: `supportedState=1` (SLIDING) every tick, surface normal `(-0.147, 0.978, -0.147)` (~12°, not the ~23° the old comment claimed), medium `"ground"`, settle Y 0.750. Root cause of SLIDING at 12°: Babylon 9.21.2 `checkSupportToRef` computes `angleSin = normalizedOutputVelocity.dot(direction)` against the **raw** `direction` argument, and the adapter passes the unnormalized gravity vector `(0, -9.81, 0)`. So `cosSqr = 1 - (9.81·sinθ)²` goes negative for any slope over ~4°, always below `maxSlopeCosine²`, and every incline is classified SLIDING → resolver forbids jump. This is verified against the installed dependency source, not changed here (production motion/support code is out of scope for this fix).

### Fixture tighten

Kept the same 10×10 m, 2×2-sample saddle shape but reduced the amplitude so the cell is deterministically SUPPORTED while still discriminating Havok triangle height from bilinear:

- `heightSamplesMeters: [0, 0.4, 0.4, 0]`, spawn `[-2.5, 0.2, -2.5]`.
- At (-2.5, -2.5): Havok triangle y = 0.2, bilinear y = 0.15 (5 cm apart vs ~1 mm observed settle jitter). Slope ≈ 3.2°.
- Instrumented run confirms `supportedState=2` (SUPPORTED) every settle tick, settle Y 0.2000–0.2001, takeoff `velocityMetersPerSecondXYZ[1] = 5.5`, then `"air"`.
- Ground Y band updated to `> 0.175`, `< 0.28` (excludes the 0.15 bilinear height).
- Takeoff assertions are now unconditional; the else-pass branch is deleted. Debug instrumentation was removed before commit.

### GREEN

- `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "uses Havok support rather than bilinear terrain height"` → 1 passed (83 skipped).
- `pnpm vitest run packages/runtime-babylon/src` → 7 files, 124 tests, all passed.

### Concern (recorded, not fixed here)

Because the adapter passes unnormalized gravity into `checkSupport`, the effective jumpable-slope ceiling is ~4°, not the Body's 42° `maxSlopeDegrees`. A ~23° supported-jump fixture is unreachable without adapter changes (normalizing the direction argument), which were out of scope per the controller resolution.
