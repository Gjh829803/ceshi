# Task 4 Report: Authoring, Compiler, and ExecutionPlan projection

## Status

**COMPLETE** — all focused gates green (`124/124`).

## Summary

Projected P1.5 control feel and boolean locomotion through Authoring normalization and Compiler execution-plan projection. Removed speed fields from `ExecutionSubjectV3.locomotion`, deleted motion-parameter bags from motion profiles and `setMotionTuning` from the production session contract, and narrowed published movement medium to `"ground" | "air"`.

## Contract changes

### `ExecutionSubjectV3`
- `locomotion`: `{ allowWalk, allowRun, allowJump }` only
- `controlFeel`: full locked feel surface copied from `profiles.controlFeelProfileRef`
- `capabilityAssembly.defaultMotionProfile`: `{ resourceRef, motionKernelRef, motionTags }` (no `parameters`)
- `capabilityAssembly.controlProfile`: `moveDeadzoneRatio` only (no `inputTuning`)
- `capabilityAssembly.mediumProfile`: `{ resourceRef, air: { gravityRatio, linearDragPerSecond } }` (no `water`)

### `SubjectRuntimeStateV3` / Browser protocol
- `movementMedium`: `"ground" | "air"`
- Added `activeControlFeelProfileRef?`, `locomotionMode?`
- Removed `motionParameterTuning` and `setMotionTuning`

### Authoring normalizer
- Resolves `controlFeelProfileRef` (explicit on V3 definitions; defaults to `worldkit://control-feel-profile/humanoid.medium-ground@1` for V2/package subjects)
- Copies locked feel numbers onto normalized subjects; boolean locomotion from locomotion profile flags

### Compiler
- Projects `controlFeel` + boolean `locomotion` onto execution subjects
- `assertPublishedMovementMediumSupported()` throws `SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED` for `"water"`
- Rejects forged normalized medium profiles that still publish `water`

## RED evidence (Step 2)

Before implementation, new compile projection tests failed on missing `controlFeel` and legacy locomotion speed keys:

```
FAIL compileWorld > projects feel and body traversal, not locomotion speeds
  expect(player.controlFeel).toEqual(...) // received undefined

FAIL compileWorld > locks the current valid rigged ExecutionPlan hash
  // TS/build failures on definition.locomotion.mode / walkSpeedMetersPerSecond
```

Normalizer/compiler type errors on `locomotionProfile.locomotion.*` confirmed Task 3 boolean-only locomotion profiles were not yet projected.

## GREEN evidence (Step 5)

```bash
pnpm vitest run packages/authoring/src packages/compiler/src packages/runtime-contracts/src
```

```
Test Files  11 passed (11)
Tests       124 passed (124)
```

Key new assertions (G Bot, locked refs verbatim):

- `resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1"`
- `walkSpeedMetersPerSecond: 2.4`, `accelerationMetersPerSecondSquared: 16`
- `mediumProfile.resourceRef: "worldkit://medium-profile/ground-air.standard@1"`
- `mediumProfile.air: { gravityRatio: 1, linearDragPerSecond: 0.05 }`
- Water rejection: `assertPublishedMovementMediumSupported("water")` → `/SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED/`

## Hash rotations (expected clean-break fallout)

| Artifact | New hash |
|---|---|
| Rigged package definition | `sha256:7e4d654a765ca1334df2dc8b33d86ce23d5914e62b8604730c5c23ba88518c2b` |
| Rigged resource lock | `sha256:f0ea64e8683520b4718ba479fecdd884d8cd4a7bfe9ce0c2780b4f54c2d54373` |
| Rigged normalized IR | `sha256:63b3f3e6e253d7997f5ae8e0fe5a4d633813ad62ef2e465d50ae7d91d792a8a4` |
| Rigged execution plan | `sha256:c4801ed2b0a3a5c284971a0f88d6e793f1eea91f38c506fa7972466dfadca9f0` |
| V3 solved normalized IR | `sha256:e17b2a3497997f003ea1805c474496083f8ea93aed202a8991d706407b247d8d` |
| V3 solved execution plan | `sha256:3d7a0bf1a5479e8f9925543e7acfdb30d044f389aac739dafcefb935a77e468f` |
| V3 all-fixed normalized IR | `sha256:4621add4cea50eb9ff21e182cdf2d3b485860b4bbccfa95216560520e6d2f76a` |

## Out of scope / deferred

- Babylon adapter, State Resolver, collider-support (Tasks 5–7)
- `runtime-babylon` tests intentionally not gated here

## Concerns

- V2/package subject definitions without explicit `controlFeelProfileRef` bind implicitly to `humanoid.medium-ground@1`; acceptable for first slice but may need explicit profile refs later.
- `ExecutionMovementMediumV1` still includes `"water"` for camera-context / motion-kernel rule matching; only published snapshot/default paths reject water.

---

## Review findings fix (2026-08-21)

### Changes

1. **Authoring normalizer** — removed `DEFAULT_CONTROL_FEEL_PROFILE_REF`. Missing `profiles.controlFeelProfileRef` now emits `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED` (message starts with that code) instead of silently defaulting.
2. **V2/package fixtures** — added explicit `controlFeelProfileRef` to `SHARED_PROFILES`, package test fixtures, package schema, and `examples/authoring/package-subject-world.json`.
3. **Runtime contracts test** — `createSnapshotFixtureV3` and snapshot test now assert `activeControlFeelProfileRef` on the player state.

### Verification

```bash
pnpm vitest run packages/authoring/src packages/compiler/src packages/runtime-contracts/src
```

```
Test Files  11 passed (11)
Tests       124 passed (124)
```

### Updated hash rotations

| Artifact | New hash |
|---|---|
| Rigged package definition | `sha256:d4b3f85dd6731f5afc6354f07013b2dff01688c61f8e8e0be8140b70dc4ccf62` |
| Rigged resource lock | `sha256:d893599dae14a380b84e5fe59df14d525677411ea1907e6fbe09988a948e4993` |
| Rigged normalized IR | `sha256:f2e14f9bb6aec746739ca81b789568687edc6d20550b4dbd8431d6e330f7cd43` |
| Rigged execution plan | `sha256:ba26373def874dde57c6c9ab979566827bcec24bbfdef800748eb3c07e108190` |
| V3 solved normalized IR | `sha256:8c8184c76a0b09b74556bccdb7b80d6b100813a2c1aa6b2b2c2380ba0c089548` |
| V3 solved execution plan | `sha256:2538583a1319b564a5f8af747e2d8f5c8c6b0b1278db3dc95c9757c0e2875be0` |
| V3 all-fixed normalized IR | `sha256:6332b1d6e550abf6d5e029875d85023ef1889514cf72f2824383a1efc37dec1f` |
