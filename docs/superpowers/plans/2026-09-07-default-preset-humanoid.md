# Default preset humanoid implementation plan

**Goal:** Creator defaults to the Playground's 101-bone preset with authored motions. Other characters remain supported; the user's follow-up explicitly excludes enforcing preset use.

**Approved design:** The user approved replacing the default character while keeping ordinary Three authoring and SDK ownership. G Bot and existing worlds keep their asset identities. No production deployment is included.

**Architecture:** Build a deterministic, derived ordinary-character GLB from the preserved Playground source model and its idle/walk/run/jump/fall clips. Remove visual root translation and yaw; the existing SDK remains the only motion and animation owner. Keep the original 48-action Training resource bundle unchanged for contextual traversal and interaction.

**Ownership:** This task owns the preset builder/output, catalog entry, default examples and authoring guidance, and focused tests. It does not change physics, camera, Training controllers, provider locks, running jobs, or existing published worlds.

## Tasks

- [x] Add a failing real-asset integration test: preset discovery, 101 bones, bound animated legs, grounded dimensions, loop continuity, physical walk/run/jump/landing/reset and Episode initialization. Extend the Creator starter packaging test to exercise the new preset.
- [x] Build `humanoid.preset-101` with a reproducible script under `scripts/three-creator`; record source hashes and normalization. Add its hash-addressed catalog definition with `ground.standard`, preserving source files and G Bot. Validate loaded tracks against actual bones.
- [x] Update the Creator starter, SDK README and cloud authoring instructions to recommend the new default without restricting other assets or custom characters. Contextual abilities require matching SDK support and scene conditions.
- [x] Run focused tests, relevant Three tests, typecheck, census and runtime prebuild. Inspect the actual default starter in a local browser (front/side/back, movement and reset). Review the final diff and report deployment/coverage limits separately.

## Verification commands

```sh
pnpm exec vitest run packages/three-world/src/preset-humanoid.test.ts scripts/three-creator/tools.test.ts
pnpm exec vitest run packages/three-world scripts/three-creator scripts/three-episode
pnpm typecheck
pnpm test:census
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/preset-humanoid/runtime
git diff --check
```

## Completed verification

- Final Three runtime/Creator/Episode suite: 39 files, 469 tests passed.
- Creator cloud and host reliability contracts: 28 tests passed, local mocks only.
- Typecheck, test census (45 files), runtime prebuild, deterministic preset rebuild
  and diff checks passed. No SDK runtime implementation was changed.
- Independent read-only review found no confirmed defects. Source clip inverse
  bind matrices and bone hierarchy were independently compared with the model.
- Local Creator starter: real keyboard walk/run/jump, reset, and captured
  front/right/back poses visually checked; no browser or blocked network errors.
  Artifacts: `.codex-tmp/preset-humanoid/visual/` (external to Git).
- All 22 prior catalog entries remain identical, including G Bot and Source101.
- No cloud generation, production release, existing-world migration or provider
  submission was performed. The full 48 contextual actions were not re-certified.
