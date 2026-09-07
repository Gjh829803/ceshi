# Continuous gait playback after the 04 rerecord

The user reports recurrent left-foot hesitation in the actual SDK rerecord.
The six hash-verified traces have no unexpected same-action time resets, but
many explicit walk/run transitions. The G-bot source clips start at 1/30 second;
Three clamps to the first key before that time on every loop. Direct gait
switches also reset to zero. The earlier physics/state fix addressed neither.

## Contract

Only SDK automatic walk/run selects instance-local normalized loop clips and
transfers normalized phase between directly adjacent automatic gaits. Raw GLB,
raw clips, generic/manual playback, idle, jump, world reset and initial frames
retain their existing meaning. Physics and route inputs remain unchanged.

## Work graph

| ID | Deliverable | Dependencies / blocks | Exclusive ownership | Evidence / execution |
| --- | --- | --- | --- | --- |
| G1 | Actual trace, installed interpolation and rig probes | none / G2,G3 | Root trace download; auditor temporary bone probes | Six complete trace hashes and constant-walk reproduction; parallel-safe |
| G2 | Instance-local automatic gait player | G1 / G4 | Root: assets.ts, engine.ts, shared test registry | Shared clock/mixer; no second animation writer; main-agent-only |
| G3 | Real-asset regression tests | G1 / G4 | Auditor: assets-locomotion.test.ts | Leading hold, phase transfer, manual/reset/isolation; parallel-safe |
| G4 | Same-case browser replay, build, integration and reporting | G2,G3 / none | Root: local A/B artifacts, tests, docs and commits | Original 04 inputs/camera and exact baseline SDK; main-agent-only |

Existing production worktrees, frozen r2 source/capture packages, queues and
review records are not scratch space. A new diagnostic SDK is built by overlaying
only the scoped source fixes on the exact prior Episode-compatible SDK.
