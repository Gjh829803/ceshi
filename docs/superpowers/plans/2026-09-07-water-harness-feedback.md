# Water harness feedback

User scope: improve harness feedback without adding validation or changing
existing admission, swimming thresholds, motion or acceptance rules.

- [x] Expose read-only measured water contact and the existing decision operands
  in Training snapshots. Hide stale contacts while mounted or traversing.
- [x] Add advisory water feedback to world_inspect and playtest results, plus
  a bounded timeline from actual recorded samples. No new gate or automatic fix.
- [x] Test real water entry/exit/reset and existing hysteresis, feedback causes,
  unsupported snapshots, and unchanged submission eligibility. Update Agent docs.

Root owns snapshot telemetry, controller observation fields, bridge sampling,
Host feedback and integration. A separate test lane may own only the new water
runtime test. Map validation and existing controller swimming predicates remain
unchanged. No real cloud calls, deployment or existing job edits.

Public `TrainingSnapshot.water`: `{declaredVolumeCount,controllerActive,swimming,
contact}`. Contact is null or `{volumeId,surfaceHeightMeters,depthMeters,
submersionRatio,feetBelowSurfaceMeters,requiredDepthMeters,
requiredFeetBelowSurfaceMeters,depthCheckPassed,immersionCheckPassed,
wasSwimmingAtSample,entrySpeedMetersPerSecond,entrySerial}`.

Diagnostics describe the latest controller sample, not a fresh physics query.
No contact does not assert that the map has no water. All diagnostics are advisory.

## Verification — 2026-09-08

Verified the uncommitted working tree based on
`43a4e3ab01bc1356d42ce82cf222192e4ab49284`:

- Three SDK, Creator and Episode Vitest closure: 559 tests passed.
- Creator cloud/policy/capsule Node contracts: 29 passed; Episode/cloud production
  Node contracts: 104 passed. Cloud calls stayed mocked.
- Typecheck, test census (50 files), schema documentation consumer tests and
  runtime prebuild passed. Runtime hash:
  `14cd865ab704c77b87dd0689c0e3166a39774a33c811e36ba50740856a86a9ec`.
- Real `world_playtest` recordings plus `world_inspect`: 2 m pool progressed from
  no contact through insufficient immersion to swimming; 0.5 m pool reported
  shallow water. Both short recordings passed the existing debug playtest rules.
  Evidence: `.codex-tmp/water-harness/live/report.json`, per-case videos and frames.
  These are roughly 6-second probes, not 180-second submission evidence.
- Independent read-only review passed after fixing incomplete telemetry fallback.
  The malformed-observation regressions failed before the parser fix.
- The real probe exposed unsupported `v`/`n` keys in the prior character example.
  Its episode now uses the existing movement allowlist; a regression consumes
  the unchanged episode schema. Interactive controls remain available.
- Map validator hash is unchanged; existing swimming and playtest/submission
  predicates are unchanged. No production calls, deployment or commit performed.
