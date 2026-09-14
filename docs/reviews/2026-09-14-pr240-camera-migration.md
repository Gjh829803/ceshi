# PR #240 camera migration verification

## Scope and identity

Migrates draft PR #240 (`codex/main-merge-review-20260913-135618`, previous head
`d16f23d4ff54233322f73fcfc0fe667e0ff0202e`) onto main
`6c4b5ef3380f2642c807237dd24499a148466f27`, preserving both parents. The existing
vehicle physics, fixed rider poses, wearable ground animation, aircraft models,
D01–D11 discovery and recording compatibility changes remain in the PR.

The migration uses the single SDK CameraController and named CameraDocument
presets. It does not restore FollowCamera or camera scalars inside vehicle specs,
and does not add production generation gates. See the
[migration plan](../superpowers/plans/2026-09-14-pr240-camera-migration.md) for
ownership and explicit framing differences.

## Independent review

A focused independent review of SDK camera history, public contracts, diagnostics,
Playground ownership and content mappings found two issues; both were repaired
and independently rechecked:

- A heading-space anchor used the current fixed heading for interpolated subjects.
  The independent alpha-zero reproduction moved the camera by 0.3993337 m.
  Display sampling now derives heading from the displayed pose against committed
  history without changing history; the reproduction measures zero error.
  Regression coverage includes both endpoints, intermediate and reversed samples.
- The new render observer and collision diagnostics methods were missing from the
  exported World interface. They are now declared and exercised through that
  interface by the World render restoration integration test.

The full suite also exposed a test fixture mismatch: mounted horses settle from
0.025 m to approximately 0.015099949 m with PR #240's existing support behavior.
The reset test incorrectly mixed that settled movement reference with the sealed
spawn baseline. It now separately checks initial subject restoration and original
camera pose. The Humanoid fixture no longer advances privately before setup.
All position, orientation, FOV and projection tolerances remain unchanged; this
adjustment was independently reviewed. Runtime behavior was not changed for it.

## Local verification

All commands ran in the dedicated PR #240 worktree on macOS. Evidence is retained
in ignored `.codex-tmp/pr240-migration/`; screenshots and browser results remain
outside Git. No cloud production job was started.

- Frozen dependency install, workspace boundaries and test census passed:
  141 files, 48 contract and 93 resource-heavy.
- `pnpm content:check`: 43 production assets match maintained sources. Development
  camera presets resolve for 40 vehicles × three named views and all D01–D11.
- `pnpm test:contract`: 588/588 passed.
- Full resource-heavy run: 1650/1653 passed; three failed cases and two Vitest
  `onTaskUpdate` communication timeouts. This full invocation was not green.
- The corrected public camera conformance file passed 14/14. The two original
  5-second timeout cases passed focused serial retries: NPC route/reset 3.848 s;
  dynamic campus obstacles 4.617 s and the static companion 4.241 s. No timeout
  increase, skipped gate entry or weakened physical assertion was introduced.
- Full-run successes include the 60 vehicle regressions, 42 aircraft tests,
  slope-side recovery, mounted presentation, actual Source101 aircraft fit,
  Creator browser capture and Episode subject/vehicle route consumers.
- Independent Node/Python lane: 284/284 passed with Python 3.13. The initial
  system Python 3.9 attempt failed on the existing `zip(..., strict=True)` use.
- Final repository TypeScript and ESLint passed. Production runtime prebuild
  passed with runtime hash
  `6d5d32b7f53dfa74d41f84df2ab6722b8267a28d0e29416e629babbeaebaa709`.
- Playground display smoke passed six picture modes, two helper modes, source
  purity, selection/isolation, observer input, named views, monitor focus, reset,
  map and mobile checks, with no collected page errors. Its separate delegated
  run is documented as a transcription of tool output rather than a raw log.

- Camera editor browser smoke passed apply/invalid draft, pure capture, independent
  preview, save, HMR SHA identity, reload, shared Workbench and rebuilt static
  configuration checks. Temporary saved configuration was restored afterward.
  The browser reported two existing ResizeObserver loop notifications before
  editor interactions; their count did not increase during the editor checks.
  Shader-extension/readback warnings were retained, not suppressed.

## Limits

The full suite's runner communication timeouts have not been reproduced in the
focused retries; those retries do not turn the earlier full invocation green.
The exact pushed head still requires Linux CI and review. Independent review was
focused on migration seams, not a new audit of every pre-existing physical tuning
change in #240. Technical World and browser checks do not establish subjective
player feel or pixel-identical behavior across all 40 development vehicles.
