# Three Runtime review checklist

Apply this checklist to changes in input, movement, physics, animation, camera,
render scheduling, assets, lifecycle or runtime protocols. The current design is
[Three SDK architecture](../three-sdk-architecture.md). Verify installed Three
and Rapier semantics against the actual installed source.

## 1. Map state owners and consumers

| State | Owner | Consumers to check |
| --- | --- | --- |
| Character support and collision | Rapier world / character controller | gravity, jump eligibility, motion snapshot |
| Locomotion presentation | SDK locomotion resolver and asset animation | rendered gait, walk/run phase, jump/fall presentation |
| Controlled actor input and facing | SDK input/movement path | physics, animation, camera-relative movement |
| Camera | authored camera or the single SDK follow owner | browser view, Creator opening/triview, Episode capture |
| Simulation time | one fixed-step SDK clock | input edges, physics, animation, commands, Episode stepping |
| Command and parameter channels | SDK registry / operations | gameplay, Agent tools, snapshots, reset |
| Source pixels and UI mapping | renderer + Presentation | pure model input, displayed output, mapped HUD |
| Resource lifetime | explicit instance/asset/presentation owner | reset, disposal, asynchronous completion |

Do not infer physical support from animation, visual color, names or a substitute
floor. Brief locomotion presentation grace must not change physics, gravity or
jump eligibility. Direct visual writes must not overwrite managed roots or camera.

## 2. Verify actual dependency semantics

Record installed versions and inspect the relevant implementation/types before
asserting coordinate order, KCC behavior, collision timing, animation sampling or
disposal semantics. Use a small failing reproducer for a confirmed defect.
Check exact consumers after changing a shared contract; type declarations alone
do not prove that the engine or browser implements it.

## 3. Exercise transitions and asymmetric cases

- Actions: eligibility, interaction priority, sprint/crouch edges, constrained slide
  exits, supported targets, climb detach/top attempts, deep/shallow water, and replay.
- Motion: steps, slopes, edges, wall sliding, unsupported starts, falling,
  landing, jump hold/release/repress, actor collision and control switching.
- Animation: real walk/run clips, first-key timestamps, phase transitions,
  single-tick speed/contact changes, jump/fall, manual playback and reset.
- Camera: original pose/FOV/roll, first-input follow activation, orbit/drag,
  obstruction retraction/recovery and a complete target with rotated parents.
  Apply the [camera ownership and handoff rules](../three-sdk-architecture.md#相机控制权与交接)
  to the actual render/capture consumer, not only fixed-step observations. Check
  exact and interpolated frames for partial-subject visibility, full occlusion
  and eye-sphere collision; display must preserve canonical camera control state.
- Time/lifecycle: varied render intervals, pause/start, zero-tick frame reads,
  reset with held keys, cancellation and stale async completion.
- Geometry/assets: asymmetric shapes and transforms, collision updates,
  multiple instances, shared resources, partial construction and failed cleanup.
- Presentation: UI excluded from source pixels, independent model output,
  input focus, known/unknown frame mapping, reset epochs and external track ownership.

Assert the immediate state at each boundary, not only the state after another tick.

## 4. Preserve Creator and Episode together

Creator retains its actual self-check input/video and opening/representative
capture contract. Episode retains reset-baseline initialization, segment start
validation, input-driven motion, fixed stepping and pure renderer capture.

The Host-only Episode port must own the clock during capture and release it
correctly. Initialization may relocate the start; later route targets must be
reached through actual input/physics. Preserve successful capture evidence and
source/runtime identities. Neither side's passing tests prove the other's behavior.

For merges, compare base, incoming and target implementations of every shared
owner. List side-specific behavior and verify the combined result. A clean merge
or typecheck alone is insufficient.

## 5. Select evidence for affected inputs

Use the focused reproducer first. For camera maintenance, run the shared suite:

```sh
pnpm test:camera
```

Its membership lives in `scripts/lib/test-gate-manifest.ts` (`suites: ["camera"]`).
It includes SDK strategies/configuration, real physics contact and native subjects,
content calibration, Playground editing, Creator discovery/capture, and Episode
consumers. Add camera-related consumer tests there even when their filename does
not contain "camera". The command reuses CI's serial fork isolation and runs the
existing tests; it does not add a production Agent step or replace full CI.
It is an explicit maintenance selection, not automatic dependency analysis.

For broader runtime changes, use the repository's current package-aware gates:

```sh
pnpm test
pnpm test:independent
pnpm typecheck
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
```

`pnpm test` includes workspace boundaries, test census, contract tests and
resource-heavy tests. Add `pnpm build:editor` when changing Playground consumers.
Do not select the removed `scripts/three-creator` or `scripts/three-episode`
paths: Creator and Episode tests live under their owning `packages/` directories.

Add Creator cloud contract tests when its launcher/delivery inputs change, and
real browser/visual checks for affected capture or interaction claims. Keep cloud
calls mocked in local contract tests; verification does not authorize production.
Use the caller's permitted temporary output location for build artifacts.

Documentation-only changes need whitespace, links and source-claim checks. If a
README is consumed by the schema tool, also check topic extraction and its focused
tests. Do not replay runtime/media work for unrelated prose changes.

Reuse passing evidence only while its relevant inputs and claim remain unchanged.
Do not repeat narrow tests already covered by the broader run. Root `pnpm test`,
independent Node/Python/Site tests, tracked CI, browser capture, visual inspection
and manual interaction have different scopes; inspect actual commands before
claiming aggregate coverage. Select gates with actual consumers in the changed code.

## 6. Report the limits

Record source SHA/tree, commands, exit codes, test counts, inspected artifacts and
remaining gaps. Separate environment failures, repository defects and unrun checks.
Do not update goldens or historical artifacts to make a check pass. Preserve any
user-owned changes, and inspect the final diff for unintended mutations.

A prebuild is not a deployment; a ready Prompt is not a material-complete request;
a prepared request is not a generated video. Final video acceptance remains
outside the currently implemented pre-Seedance workflow.
