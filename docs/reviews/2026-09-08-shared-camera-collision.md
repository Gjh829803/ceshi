# Shared camera collision verification

Base: `092590c4`. Ordinary follow and Training humanoid/vehicle cameras now use
`CameraCollisionSolver` in the existing camera-collision package. Three-world
retains framing, capsule visibility, native query filtering and final camera writes.
The solver owns geometry correction and independent temporal state. Display
projection uses fixed-snapshot fallbacks and cannot advance recovery.

## Automated checks

- `pnpm exec vitest run packages/three-world packages/camera-collision scripts/three-creator scripts/three-episode`: **685 passed / 55 files**.
- `node --test scripts/three-episode/*.test.mjs scripts/cloud/three-episode-scheduling.test.mjs scripts/lib/cloud-production-run.test.mjs`: **105 passed**, cloud transport mocked.
- Typecheck, test census (61 files), workspace boundaries, changed documentation links and diff checks passed.
- Runtime prebuild passed; `runtimeHash` **`dddaf44c10743c4ffd5456ed224152d492b349917eb7e9e943aed815853c9e46`**.

The existing 96 camera/mounted tests passed before implementation. New regressions
cover temporal rollback, fixed/display emergency consistency, sweep contact state,
render-order independence and repeated Episode captures. A review reproduced an
emergency display dependency on the previous rendered alpha; fixed snapshots now
supply the fallback. Independent re-review found no remaining actionable issue.

## Actual browser and delivery checks

The preserved worktree is `.worktrees/shared-camera-collision`. Artifacts under
`.codex-tmp/shared-camera/acceptance-1788858434862/` are external to Git.

| Check | Result |
| --- | --- |
| Ordinary Creator full input and delivery | 7.0599 seconds, successful source-bound receipt |
| Mounted Creator full input and delivery | 23.3196 seconds; walk, mount, ride, dismount, reset |
| Ordinary and mounted Episode PNG capture | Repeated frame and reset/replay PNGs and camera snapshots identical |
| Mounted Episode segment | 30 seconds, 720 frames, 1280×720, 24 fps, 203.78 m physical travel |
| Video health | No browser errors, no added repeated frames or padding |

Both Creator receipts and the Episode segment bind the runtime hash above.
`report.json`, receipts, source packages, media, trace and health files are retained
with the verification scripts `acceptance.ts` and `resume-capture.ts` in the parent
`.codex-tmp/shared-camera/` directory.

`pnpm exec tsx scripts/three-creator/training-camera-visibility-browser.ts http://127.0.0.1:5191/`
passed six actual browser cases. Partial visibility retains the 8.8 m arm without
measured popping; full occlusion retracts to about 1.7697 m. Screenshots and the
report are in `outputs/training-camera-visibility/browser/`. Thin-pillar, full
occlusion, ordinary and mounted frames were inspected visually.

An initial local route was blocked by the parked second horse; its failed segment
was retained and the verification plan was corrected to use the clear corridor.
No runtime or admission rule was relaxed. The completed recording is one selected
segment, not a complete six-segment campaign, cloud generation or deployment.
