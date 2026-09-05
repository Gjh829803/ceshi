# Camera stability and fresh five-case cloud execution

Status: SDK changes implemented and verified; the five-model run is blocked by server runtime-environment FD exhaustion. No new generated world is available. This is a production infrastructure failure, not a content review outcome.

## Frozen implementation

Source commit: `aa986075d801a8fc09b560519f5716fb2d259b82`.
Runtime lock: `0994b630cb275c188e5806c4d2a29b3715c25e6acad9665d3878e10688c920ca`.
Cloud toolkit: `/fsx/pipeline/worldkit-three-creator-experiments/camera-stability-aa986075d801/toolkit/sdk`.

- Correct the quaternion alias that kept the opening orientation fixed until a final 10.066° snap.
- Default `setCameraFollow()` adopts the authored pose and framing, including camera changes before first input. Explicit orbit settings retain a continuous transition.
- Share the provider-neutral hard decollision solver with the legacy camera; keep the cloud closure small through the new dependency-free camera-collision package.
- Add native Rapier world/local hit adaptation, bounded arm recovery, contact hold, overlap separation and valid-eye fallback.
- Separate character body anchors from a tall visual LookAt point, preserve angular subject framing during contraction and prevent smoothed pivots crossing solid walls after legal short teleports.
- Add actual-render numeric camera diagnostics and at most two keyframes to short preview input. No recording, assistant review or new delivery gate.
- Permit verified GPT-6/xhigh account-success routing across SDK versions, preserving source identity and provider health filtering.

The immutable plan and task responsibilities are in `docs/superpowers/plans/2026-09-05-three-camera-stability.md`.

## Verification evidence

Evidence root: `.codex-tmp/camera-case-diagnosis`.

- Two original camera regressions failed before the fix: midpoint orientation remained unchanged and arm recovery exceeded3m/s.
- Targeted camera/physics/legacy-core checks:78 passed, including off-center pose adoption, tall target contraction, rotated dirty/committed collider normals, time/reset/parent behavior and legal wall-crossing teleport.
- Creator tools:43 passed, including actual Chromium input, transient camera keyframes, direct schema-v2 submit and independent unpack.
- TypeScript and production build passed. Build retained the existing large-chunk warning.
- Cloud/capsule/progress checks:41 passed at runtime freeze; subsequent Host-only submitted/cancellation projection tests also passed.
- Broad contract lane:3213 passed,3 skipped, one obsolete dependency-list assertion failed. The new pure dependency was added to that boundary assertion, and the whole boundary file (6 tests) passed.
- Broad resource-heavy lane:734 passed, one hidden-child test's exact pose assertion was affected by intentional default target damping (0.000022m). The test now explicitly disables damping to isolate hidden collision filtering; the full world test file (21 tests) passed. Combined non-duplicated coverage is3950 passing tests and3 skips. The original aggregate failure logs are retained; do not describe those original commands as exit0.
- Actual browser camera fixture passed: maximum observed handoff step0.157°, character fully inside the frame at7.756m contracted arm, zero runtime/page errors and exact opening pose restored on reset. This fixture is SDK evidence, not an assessment of the five generated cases.
- Linux capsule build, installed 4-second no-video preview/submit doctor and independent schema-v2 archive unpack passed.

## New test selection and run

Selection: five references drawn once by seeded hash ordering from85 eligible unused references. Historical ten actually submitted cases and an earlier preview candidate were excluded. Original reference/prompt bytes were verified. All five receive one shared prompt/runtime with ImageGen overall planning, exact reference opening, meaningful exploration over5min and optional GBot.

Run: `three-camera-holdout-five-20260905-r1`.
Selection manifest: `.codex-tmp/camera-holdout-five/selected-cases.json`.
Local run root: `.codex-tmp/three-creator-eval/runs/three-camera-holdout-five-20260905-r1`.

| Case | Initial job |
| --- | --- |
| gpt6-camera-14-lbd-0c157abbb8388a71d67c1eb2 | gen_ff69d178a7cf0cf5 |
| gpt6-camera-023-green-sahara | gen_e5d752adf740366c |
| gpt6-camera-057-stained-glass-continent | gen_0e083c7bbd9597ed |
| gpt6-camera-012-penguin-aurora-expedition | gen_30d7783a1ef1603a |
| gpt6-camera-050-silk-landscape | gen_8db6482d1deab53b |

Five submissions were accepted between12:55:42 and12:55:43 UTC. All remained before CLI execution and hit the1800s queue guard. Service cancellation completed, but LWDP cleanup acknowledgement remained pending despite exact GCS evidence that all five never-started supervisors were DEAD. No second model attempt was submitted, no scene edited, and no model quality conclusion is possible.

## Server incident and bounded recovery

Ray2.55.0 RuntimeEnvAgent retained one eagerly opened setup-log handler per historical job. Affected processes exhausted65536/65536 FDs; a sampled node held65504 distinct setup-log descriptors,63513 for empty files. The per-job logger cache has no bound or handler cleanup when environments are removed. Local reproduction against the installed library source confirms retention and successful explicit closure.

All33 checked idle driver agents lacked FD headroom. Existing container capabilities could not raise the hard limit; no limit/privilege/FD mutation was made. One strictly verified idle worker tfqss was gracefully drained. KubeRay removed it and reduced desired replicas50→49; a race-checked patch restored only original capacity50. Replacement gdlzp was Ready/ALIVE but accumulated29655→65536 FDs in about7min; a bounded no-model runtime-env task timed out. Further node churn and model retries were stopped. Original desired/actual/Ready count50 was restored; other groups/templates/min/max/security were unchanged.

Required server action: lazy setup-log opening (`delay=True`) as immediate mitigation, active-use-aware bounded logger lifecycle with `removeHandler`/`close`, construction-failure rollback, safe worker-pool recovery, and cancellation cleanup reconciliation. Full forwardable request and installed-source/reproduction evidence:

- `.codex-tmp/camera-holdout-five/server-help-request.md`
- `.codex-tmp/camera-holdout-five/server-logging-analysis/findings.md`
- `.codex-tmp/camera-holdout-five/cloud/runtime-env-fd-diagnosis.json`
- `.codex-tmp/camera-holdout-five/cloud/exact-cleanup-and-ray-probe.log`

After server recovery, resume with the same selected five, immutable runtime and instructions; first confirm the old requests cannot execute. Do not create overlapping attempts or substitute easier cases.

The public gallery is `/creator-evals/three/`. Old R2 results remain at `/creator-evals/three/runs/three-sdk-v2-holdout-five-20260905-r2/`. Publication continues to depend only on production technical delivery, never assistant review.
