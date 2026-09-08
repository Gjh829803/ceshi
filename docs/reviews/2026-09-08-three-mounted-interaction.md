# Three mounted interaction implementation and verification

Status: implementation, independent reviews, final scoped aggregate and final-runtime local Creator/Episode acceptance are complete. Integration into `codex/three-sdk-data-production-20260907` is user-authorized; no production deployment is claimed.

Working main: `codex/three-sdk-data-production-20260907`. Feature branch: `codex/three-mounted-interaction-20260908`, based on `621cc9ea`. The structure migration was already integrated into working main; the feature is developed in its own worktree.

Design: [single-rider mounted interaction](../superpowers/specs/2026-09-08-three-mounted-interaction-design.md). Execution: [implementation plan](../superpowers/plans/2026-09-08-three-mounted-interaction.md). Public usage remains [SDK README](../../packages/three-world/README.md) and actual TypeScript contracts.

## Reviewed implementation

| Area | Commits | Evidence and limits |
| --- | --- | --- |
| Safe entry/exit, direct queries, real controller velocity and passive mount motion | `56f1962d`, `b6b3e90c` | Meaningful failing reproducers preceded fixes; final affected run92 tests. Independent review and scoped re-review approved. Includes real4cm step vertical inheritance and action-command transition refusal. |
| Fixed state, display/capture sampling, camera history, input edges and Episode ownership | `0ae15867`, `57640fdd` | Task run84 tests plus5 capture checks; review fix48 affected tests and typecheck. Independent review approved after fixing same-tick rewind and permitted visual-child ownership. |
| Actual horse clips, source normalization, optional Body anchor and rider pelvis | `0de3c727` |57 tests and typecheck; actual horse/Source101 geometry and dense/key-time calibration. Independent review approved. Geometry containment alone does not establish visual quality. |
| Discovery, catalog, example and real recording | `817dfd5e` through `10cbdee4` | Permission-filtered semantic guidance, actual-source schema and minimal horse example; no default-character policy change. Independent review and scoped re-review approved. Corrected mounted front/right/back captures and separate Creator/Episode recordings are bound below. |

## Source-model calibration

The original horse GLB and Source101 source meshes/clips are retained. The logical seat and horse collision envelope are unchanged. Horse clips Idle/Walk/Gallop are sampled from the common runtime frame; Walk also represents trot. Source animation is not replaced with a procedural horse.

The final adapter normalization includes blend geometry. Its uniform scale is `0.451293531822985`.64-interval geometry samples and8192-interval plus original key-time anchor samples are recorded in ignored task evidence. The maximum measured anchor displacement is `.1455786947069444 m`, rotation `.12295040239665772 rad`; declared fixture limits round upward to `.145579 m` and `.122951 rad`. Combined geometry fits the existing X±.8, Y0..3.3, Z±1.9 envelope. The highest measured point is2.5208534690812163m.

An earlier64-only calibration missed source key extrema; its tighter limit is retained as a failing regression. Blended skin geometry also required correcting the visual normalization baseline. Neither finding was addressed by expanding physics or changing original asset bytes.

Source101 still uses the existing procedural rider overlay. Authored mount/dismount animations and rein/stirrup IK remain outside scope. The inspected views pass basic whole-body alignment and framing; this is not a claim of authored cinematic riding quality. The flat example has no contact shadows, which limits perceptual grounding.

## Final validation

Final code commit: `26163127844590e7e96c641524017fa507a97622`. Later documentation commits do not alter these inputs.

| Check | Result | Evidence |
| --- | --- | --- |
| Three SDK + Creator + Episode Vitest, `--maxWorkers=1` | 51 files, 644 tests passed, exit 0 | `final-vitest-camera.log` |
| Episode + scheduling + shared production Node contracts, `--test-concurrency=2` | 104 tests passed, exit 0; inputs unchanged by the subsequent camera/test-budget fixes | `final-node.log` |
| Typecheck on final camera source | Passed, exit 0 | `task-2-evidence/final-camera-typecheck.log` |
| Test census | 57 files: 22 contract, 35 resource-heavy; registration unchanged after this check | `final-census.log` |
| Final Three SDK prebuild | Passed, exit 0; runtime hash `6d359ad2c8a2e6460488739e056f6e77cfedba7687aa47b7e387a1057acb2175` | `final-prebuild.log` |
| Documentation links and diff | 53 relative links resolved; diff check passed | Root-owned final document checks |

Logs are retained under `.superpowers/sdd/2026-09-08-three-mounted-interaction/` in the feature worktree. The broader Root `pnpm test` command, remote CI and production deployment are not claimed by these scoped local gates.

The first aggregate at `66b26b1a` passed 639 tests and hit the default 5000 ms timeout in two real-horse tests. An isolated run reproduced 7132 ms for two real asset loads and 5149 ms for asset plus runtime initialization. Each load measures skinned pure/blend geometry. Commit `57a5f281` gives these two tests the existing local 30000 ms real-asset budget, retaining every assertion. The two affected tests then passed. The aggregate rerun passed 640 and hit a separate 30000 ms geometry-census timeout at 36443 ms under concurrent load. Commit `b4e93d40` makes the real-asset default local to this test file (30000 ms) and gives the full geometry census 60000 ms, as the dense anchor census already has. All 10 horse tests then passed in 28.16 s. No samples or assertions were removed. These test-budget changes do not modify product runtime.

## Final cross-owner review

The independent whole-branch review found one P2: presentation unconditionally recast the character camera arm, overriding fixed-camera full framing for partial capsule visibility. The extended actual render regression reproduced the problem for all five existing partial-visibility fixtures. Commit `26163127` fixes the original camera owner: exact humanoid frames preserve the already-solved camera; intermediate frames share the original pivot, capsule-visibility and eye-trajectory policy with fixed update. Nine confirmed failing render regressions preceded the fix; the 49 affected tests and typecheck passed afterward. Independent scoped re-review approved `26163127` with the P2 closed and no new actionable finding; the final 644-test aggregate subsequently passed. No other actionable issue was found in the full review. The fix changes runtime bytes. A new recording at the reviewed final source passed and is bound below; the previous `mounted-acceptance-review-1` output remains immutable history.

## Creator, Episode and visual evidence

Actual local acceptance is saved under the feature worktree at:

`.codex-tmp/mounted-acceptance-camera-final/`

This directory is external to Git. `artifact-index.json`, `manifest.json`, `creator-receipt.json`, `creator-playtest.json`, `creator-trace.json`, `creator-milestones.json`, `creator-mount-summary.json`, `episode-trace.json`, `episode-health.json` and `acceptance-summary.json` identify the inputs, artifacts and measured results. Earlier runs remain immutable history and are not substituted for this run.

| Identity | Value |
| --- | --- |
| Recorded source commit | `26163127844590e7e96c641524017fa507a97622` |
| Creator source hash | `c1acbdc71861d0f577d266b73ece0c0b9276ddbc2bc83c546b1c11b949dcd794` |
| Creator world build | `203297c68ec1da244407b7ba035b02b45c99e8e4ce28b12ed1fc9927e8f90ff7` |
| Runtime bytes | `6d359ad2c8a2e6460488739e056f6e77cfedba7687aa47b7e387a1057acb2175` |
| Episode adapter world build | `5f73d45de4f1aa7af756ab6d3550e6ee69a8ced1b1d94182b29aeeb4822b0104` |

- **Creator technical delivery:** existing v0.2 gate passed with 184.3931 s actual input, 184.319924939 s active playtest and 185.509 s recorded video. The route uses actual W/F entry, riding/turning/braking, exit, post-exit walking and reset. Recorded gallop lasted 4.8994 s across 44 samples. No approach or hidden position correction repairs the route.
- **Independent Episode:** `episode.mp4` is 30.000 s, 720 frames, 24 fps, 1280×720 H.264, from 1800 fixed ticks. Repeated initial frames are byte-identical; ordinary commands reject with `EPISODE_CAPTURE_OWNS_CLOCK`. Second initialization followed by 60 ticks of `{}` input settles vehicle speeds to approximately 0.000002436 and 0 m/s without a leftover transition. No browser errors were recorded; maximum measured pelvis error is 3.17772129440181e-14 m.
- **Actual visual inspection:** root reviewed approach/entry/turn/exit/reset evidence and the corrected `mounted-assembly-triview.png` (1536×640). The latter shows complete horse+rider front/right/back views, including heads and hooves, with no gross torso penetration or displaced rider root. The image bytes match the three-view image independently inspected in the Task4 re-review. Root also inspected `episode-gallop.png`, extracted from the final Episode at 18 seconds. Its SHA-256 is `83eea4122ba745ed025ff6d5957906fdda8dea95535e9976126a8c3a9bf8c8b1`.
- **Capture integrity:** supplemental mounted views derive canonical current heading, use the existing Host presentation transaction and preserve the entire before/after snapshot. The saved mounted horse-1 state is at tick 1 with matching -Z front. Opening assembly metadata separately uses the actual +Z front. Creator capture and Episode recording retain separate identities and media.

Run the same local acceptance from a new output directory:

```sh
pnpm exec tsx scripts/three-creator/training-mounted-browser-smoke.ts --output .codex-tmp/mounted-acceptance-new
```

This is a bounded single 30-second Episode runtime acceptance, not the full six-clip/ten-style production workflow or a Seedance submission. The final capture source matches the final reviewed/tested code; subsequent documentation changes do not change the recorded runtime or scene source.

## Production boundary

No SDK deployment, cloud generation restart or video provider submission is performed by this feature work. The earlier ski case remains deferred by user instruction; a future cloud run must bind the final integrated source and actual runtime bytes rather than reuse the earlier35d91711 lock.
