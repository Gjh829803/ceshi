# Training movement tuning implementation plan

> Execute inline in the requested checkout without a worktree. Use test-driven-development for the runtime and inspector contracts; a later follow-up authorizes exact-SHA verification and a merge request, but not external production deployment.

**Goal:** expose independent per-asset speed, acceleration, release deceleration, braking and family-specific handling controls in the existing movement tab.

**Architecture:** the SDK owns numeric control defaults, validation and execution. Extend the existing control record, not a second simulation. The content profile carries the resolved record, UI edits that record and observes the solver. New values are initialized from the current family formulas to preserve default behavior. Persist full effective records through export/reset/map replacement; validate before mutation.

**Tech stack:** TypeScript, Three/Rapier, existing DOM inspector, Vitest and Playwright.

**Spec:** user request in this task: independently editable base/max speed, acceleration, release deceleration and other core handling values for each asset.

## Constraints

- Preserve existing uncommitted inspector work and current checkout.
- No camera algorithm, collision shape, input binding, asset or production-job changes.
- SDK is the sole numeric control authority. Inapplicable fields are hidden or explained, never presented as effective.
- Prior four-field profiles receive deterministic defaults for the added fields; exported records contain every effective number. Existing speed/accel/grip/steer meanings remain explicit in UI.
- Browser checks use isolated storage and `outputs/training-inspector`. Cursor Cloud may verify the frozen Git SHA; production cloud jobs remain out of scope.

## Execution (main-agent-only, sequential)

### M1 — SDK defaults and independent dynamics

Files: new `packages/three-world/src/training/control-tuning.ts`; modify `config.ts`, `simulation.ts`, `runtime.ts`, `public.ts`, `creatures/controller.ts`, `humanoid/controller.ts`; tests in `runtime.test.ts`.

- [x] Add regression: two otherwise equal occupied rover instances with different release deceleration retain different velocities after the same input release; acceleration is unchanged.
- [x] Add regression: independent base/max/reverse speeds, braking, invalid updates atomic, profile export/reset/map replacement retain values; character stopping acceleration independent from moving acceleration.
- [x] Run those tests RED before implementation.
- [x] Centralize defaults/ranges; resolve them into each instance's existing spec, extend profile validation and command schema, consume fields in the current fixed solver.
- [x] Run focused runtime tests GREEN; verify same-family instance isolation.

### M2 — complete content record and discoverable editor

Files: `examples/three-creator/sdk-capabilities/platform/profiles.ts`, `inspector.ts`, `profile-runtime.ts`, `workbench.ts`, new `control-fields.ts`, `main.ts`; tests `scripts/three-creator/training-inspector.test.ts`, `training-workspace.test.ts`.

- [x] Extend browser tests for editing release/braking/max-speed fields and each family's supported fields; observe RED.
- [x] Profile parser resolves old four-field input into complete validated control values; save/export binds all fields.
- [x] Group speed, acceleration/braking, steering/grip and family-specific controls in the movement tab. Display units and semantics, current velocity and all effective numbers.
- [x] Use the same field definitions in advanced configuration. Reset movement only, retain camera and other assets.
- [x] Run focused DOM/profile tests and both typechecks.

### M3 — local integration evidence

Files: `scripts/three-creator/training-inspector-browser-smoke.ts`, SDK README.

- [x] Real browser: change coasting and observe physical speed decay, inspect/save/export expanded fields; verify character and road/water/air representatives.
- Freeze the candidate, then run relevant Three/Creator/Episode tests, census, workspace boundaries, runtime prebuild and an exact-SHA Linux gate; do not publish production jobs.
- Inspect desktop/narrow screenshots and final diff. Open the compiled preview and report tested scope plus the remaining external release boundary.
