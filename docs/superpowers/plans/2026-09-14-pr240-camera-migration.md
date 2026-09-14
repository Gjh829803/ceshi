# PR #240 Camera Migration Implementation Plan

> Execute the approved migration in the existing PR branch. Independent SDK,
> Playground and content tasks use the dispatching-parallel-agents workflow;
> the coordinator integrates and verifies their actual consumers.

**Goal:** Merge current main into #240 and preserve its vehicle/content fixes on
one shared camera runtime, then push the same draft PR for review.

**Architecture:** CameraController and its strategies own camera history and writes.
Subjects supply pose facts; the collision kernel supplies safety. CameraDocument
and content presets own tuning. Playground observes or submits supported intent.

**Tech Stack:** Existing Three, Rapier, TypeScript, React, Vitest and Playwright.
**Spec:** [Camera architecture](../../three-sdk-architecture.md#相机控制权与交接).

## Fixed scope and identities

- PR branch: codex/main-merge-review-20260913-135618; prior head d16f23d4.
- Merge target: origin/main at 6c4b5ef3, including #241. Preserve both histories.
- Keep physical/control/model/animation fixes from #240 and named view/configuration
  ownership from main. Do not restore FollowCamera, profile.camera or spec.camera.
- Preserve historical source/review identities. Regenerate active catalog hashes
  from resolved content. No cloud production jobs, new production gates or merge
  to main; keep #240 draft pending verification and review.
- Each package reads its AGENTS.md. Every edit stays in its responsibility.

## Task 1 — Shared SDK camera migration

Own packages/three-world/src/camera/, world.ts, engine.ts, humanoid-runtime/runtime.ts,
camera-host.ts, camera-lifecycle.test.ts and vehicle-camera.test.ts. Retire old
config/camera.ts and humanoid-runtime/camera.ts; port their actual improvements.

- [x] Preserve aircraft action/locomotion and mounted presentation additions while
  resolving runtime.ts against main's one camera owner.
- [x] Move continuous aircraft camera heading into shared camera strategy history,
  using subject facts. Prediction/checkpoint restore and presentation must not
  integrate heading again. Cover inverted cockpit-to-third-person and pole passage.
- [x] Capture optional existing collision queries in shared constraints, with
  separate fixed/prediction/presentation samples and bounded retention. Disabled
  capture adds no queries; inspection is a detached read and advances no clock.
- [x] Expose world.setCameraCollisionDiagnosticsEnabled(enabled: boolean) and
  inspectCamera().collisionQueries?: {fixed?, prediction?, presentation?}.
  Each sample has sampleId, source, simulationTick, probes[{from,to,radius,hit}],
  and droppedProbes. Export CameraCollisionProbeSample through the public SDK.
- [x] Move legacy slope-side recovery regression to actual CameraDocument + World
  consumers, preserving geometry/safety assertions and current wall fixes.

## Task 2 — Content and preset migration

Own packages/preset-content/, assets/dragon-training/, assets/three-creator/, and
scripts/assets/register-flying-creatures.ts.

- [x] Merge model/asset/config fixes by fields rather than replacing generated
  catalogs wholesale. Keep current camera preset snapshots and remove old scalars.
- [x] Translate #240 recovery tuning and wearable framing into named camera preset
  values where it remains needed; compare existing defaults before adding data.
- [x] Preserve aircraft shell, wearable ground origin, dragon discovery/thumbnails,
  road body collision, sled and other physical/model tuning.
- [x] Regenerate dependent resource/catalog hashes with existing maintenance tools.
  Verify actual asset discovery + consumers and report generator provenance.

## Task 3 — Playground migration

Own apps/sdk-playground/.

- [x] Resolve main.ts retaining shared project document/editor flows and #240's
  asset/thumbnail/vehicle/display additions. No numeric modes or profile overrides.
- [x] Preserve observation camera, frustum/model, real-time monitor and gameplay
  input focus. Observation controls write only their own camera.
- [x] Replace old followCamera diagnostics with the Task 1 public interface. Select
  presentation/fixed samples explicitly; never create physics queries for drawing.
- [x] Update existing display and browser smoke consumers; verify editing, view
  switching, reset, monitor focus and no second active camera writer.

## Task 4 — Integration, review and delivery

Coordinator owns remaining conflicts (episode contracts, environment types,
SDK exports, non-camera tests), dependency installation and final validation.

- [x] Inventory all 26 conflicted files and compare auto-merges with both parents,
  including runtime actions, mounted actor position, camera metadata and input.
- [x] Install exact merged workspace dependencies; run typecheck, relevant lint,
  census, package boundaries, camera/content/Creator/Episode tests and builds.
- [x] Run actual World regressions for inverted aircraft, wearable ground/flight
  and slope/wall recovery, plus browser observer/editor and Creator/Episode checks.
  Full manual browser play across all vehicles remains outside this verification;
  technical checks and player-feel acceptance remain distinct.
- [x] Independent review of final migration diff; repair concrete findings and
  repeat only affected checks. Record remaining verification limits.
- Delivery: commit merge + migration, push original #240 branch, update the MR
  around final behavior and verify remote head. Keep it draft; do not merge main.

## Migration decisions and review

- Aircraft continuous heading is camera strategy history, derived from committed
  subject quaternion deltas. Display sampling evaluates the displayed pose
  against that history without advancing it. An independent review reproduced
  a heading-offset endpoint error of 0.3993337 m; the regression now measures 0 m
  and covers intermediate and repeated reverse-order sampling.
- Both new diagnostics/render methods are declared on the public `World` interface
  and exercised through that interface in the actual World render lifecycle test.
- Playground copies gameplay pixels during source rendering and draws its
  independent observer after temporary SDK subject presentation is restored.
  The observer shows committed subjects beside the displayed camera pose; this
  can differ from gameplay interpolation by at most one fixed tick.
- Content owns 120 named presets for 40 development vehicles and three views per
  numbered flying creature. Camera scalars were removed from vehicle specs;
  physical/model changes were retained. Current dragon catalogs were regenerated
  from maintained sources; the historical preset import donor was not rerun.
- Wearable third-person framing is explicit static content tuning: paraglider
  distance 9.5 m / anchor height 2.1 m, wingsuit 7.5 m / 1 m. The former implicit
  state-dependent framing is not recreated: general state-driven view selection
  remains future work in the architecture contract. This is a declared visual
  migration difference, not a claim of pixel-identical framing.
- Independent migration review closed both findings after the focused fixes; it
  did not re-audit every pre-existing physical tuning choice in PR #240.

Final results and limitations: [migration verification](../../reviews/2026-09-14-pr240-camera-migration.md).
