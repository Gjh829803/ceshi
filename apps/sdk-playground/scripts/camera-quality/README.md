# Camera maintenance routes

Start the target checkout's Playground and run from that same checkout, so the
recorded source identity describes the served code. This is a development harness,
not a Creator production requirement. It uses the existing World Episode port and
real runtime assets; it does not implement another camera or simulation loop.

```sh
pnpm test:camera:browser --url http://127.0.0.1:5190 --output output/playwright/camera-before
pnpm test:camera:browser --url http://127.0.0.1:5190 --output output/playwright/camera-after --baseline output/playwright/camera-before/report.json
pnpm test:camera:browser --url http://127.0.0.1:5190 --profiling --output output/playwright/camera-profile
```

Use `--route campus-walk-orbit` for a focused run, or comma-separated route IDs.
Run `pnpm test:camera:editor http://127.0.0.1:5190` for real editor selection,
paused apply/resume, live diagnostics, performance toggle and cancellation. To compare an older checkout
without this command, invoke this runner by its absolute path **from the older
checkout**, using its own server URL. Route definitions must match: the report
rejects mismatched input hashes, sample ticks and view IDs. Keep browser version,
machine and viewport constant and run timings without competing test processes.

Reports include source hash, Git head, fixed routes, camera/actor poses, control
directions, per-stage CPU samples when enabled, and renderer frames at 10 Hz.
World advance timing excludes image encoding and transport; camera probe time is
already included in camera stage time. These are CPU measurements, not display
FPS or GPU measurements. Timing comparisons are advisory; deterministic pose/input
comparisons use the tolerances from existing native baseline tests. Frames remain
available for continuous visual review. Do not regenerate a baseline to hide drift.

The source fingerprint covers every tracked and non-ignored untracked file,
including model/image assets, styles, HTML, lockfiles and vendor archives. It records
deleted inputs and linked file bytes, and is checked again after capture. Ignored
capture output is excluded; this fingerprint does not attest an independently
modified dependency installation. The harness fingerprint also includes the source
identity implementation.

## Maintained coverage

Run `pnpm test:camera` for the shared contract/runtime consumer suite, then use
these browser routes for dense-scene review. Existing tests are the authoritative
fixtures; do not copy them into generation guides.

| Behavior | Owner |
| --- | --- |
| Open ground, wall, corner, corridor, orbit and pitch against captured old trajectories | SDK `humanoid-camera-opening.test.ts` |
| Vehicle collision, transparent parts and transformed meshes | SDK `vehicle-camera.test.ts` |
| Forward/reverse movement, recenter sources, delay and frame conversion | SDK `strategies/recenter.test.ts` |
| Native swimming entry/exit, manual and automatic camera selection | SDK `camera-view-selection.test.ts` and `episode.test.ts` |
| Mounted transitions, release/reset and recording ownership | SDK `runtime.test.ts`, `camera-lifecycle.test.ts` and `episode.test.ts` |
| Actual Creator schema, compilation and browser capture | Creator `camera-configuration.test.ts`, `vehicle-camera.test.ts` and capture integration tests |
| Dense campus walking, indoor orbit, racing/reverse and inverted exit | This directory's `routes.ts` and captured frames |

Exit routes continue sampling throughout dismount and subsequent walking; the
report records a hash of the harness as well as the declared input plan.

Preparation may seed a vehicle pose (including inversion) through the supported
Episode start contract. Subsequent driving and exit use actual SDK input/commands.
A completed route is technical evidence for that route, not all-scene acceptance.
