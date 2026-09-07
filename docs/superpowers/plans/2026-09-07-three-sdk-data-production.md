# Three SDK and data production integration

User instruction: consolidate our Three SDK branch and its downstream data
production into one new branch; exclude the old Babylon production workflow.
Target: `codex/three-sdk-data-production-20260907`.

## Integration contract

The Creator production entry retains the deployed v0.2 self-check/delivery
contract from `codex/creator-camera-triview-reliable-ten`. The independent Three
Episode consumer retains source verification, runtime derivation, Episode APIs,
route planning, capture and visual preparation from
`codex/three-episode-agent-production`, including its uncommitted production code.
Both use the same Three SDK with the verified gait/small-step correction. Episode
camera compatibility remains an explicit build-time adapter. Shared human review
identity does not acquire an SDK-version dimension.

This integration does not submit cloud jobs, replace frozen running capsules,
change review records, or implement an unrequested video-provider integration.
The implemented Episode boundary remains prepared requests before Seedance.

## Work graph and exclusive ownership

| ID | Goal and deliverable | Depends on / blocks | Owner and files | Input/output contract | Evidence / mode |
| --- | --- | --- | --- | --- | --- |
| I1 | Snapshot current Three production code and merge branch history | none / I2,I3,I4 | Root: Git state, initial source copy, shared manifests | Episode HEAD + current code, excluding old lane config; merge Creator HEAD | source-copy hashes; main-agent-only |
| I2 | Preserve production Creator contract consistently | I1 / I5 | Creator integrator: scripts/three-creator and scripts/cloud/three-eval family | Creator v0.2 tools/lock/validator must agree; retain Episode compiler camera override | Creator/cloud focused tests; parallel-safe |
| I3 | Merge SDK responsibilities and locomotion correction | I1 / I5 | SDK integrator: packages/three-world | One clock, KCC, animation and camera; Episode APIs plus Creator capture and opening behavior | runtime regressions; parallel-safe |
| I4 | Document runnable pipeline and integration provenance | I1 / I5 | Root: AGENTS, README, docs, package scripts, test manifest; production auditor read-only | explicit input/output paths and external runtime configuration; SDK-independent feedback | entrypoint/link checks; parallel-safe |
| I5 | Integrate and verify exact final branch; commit clean tree | I2,I3,I4 / none | Root: cross-file reconciliation and Git commits | unified source produces correct Creator and Episode contracts | relevant full tests, typecheck, census, build/prebuild; main-agent-only |

Source worktrees and their running processes remain owned by their original
tasks. Generated cases, videos, credentials, cloud journals and reviewer data
remain outside Git. Existing production files are not used as scratch outputs.
