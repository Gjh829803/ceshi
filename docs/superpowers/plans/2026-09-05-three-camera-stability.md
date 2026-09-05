# Three camera stability and a fresh five-case cloud run

User authorization: fix the SDK camera issues, select five different cases, run the existing cloud workflow concurrently and publish production results. Preserve GPT-6 / xhigh, autonomous creation, the ImageGen full-map requirement, optional GBot, and direct publication without recordings or assistant review gates.

## Ownership and dependency graph

| ID | Goal / independently verifiable deliverable | depends_on | blocks | Exclusive owner / integration | Mode / evidence |
| --- | --- | --- | --- | --- | --- |
| C1 | Continuous camera handoff, bounded recovery, safe overlap escape and subject framing | none | C4 | Main: three-world camera, physics, contracts, engine, package dependency, README and their tests | main-agent-only; failing reproducer then deterministic real-physics regressions and browser camera fixture |
| C2 | Short interactive preview camera diagnostics and representative actual frames | none | C4 | Preview worker: scripts/three-creator tools and tests, apps/three-creator-playground bridge and tests, MCP tool description | parallel-safe; consume existing observer camera/player and snapshot fields, optional new camera fields; no delivery gates or public review state |
| C3 | Five previously unrun immutable references and prepared cloud orchestration | none | C5 | Cloud worker: new .codex-tmp/camera-holdout-five directory and read-only selection/run evidence; no source edits or POST before C4 | parallel-safe; excluded historical case IDs, source hashes, unchanged creative prompts, five task identities |
| C4 | Freeze and deploy one verified SDK/tools runtime | C1,C2 | C5 | Main: integration, required checks, exact capsule/runtime lock and cloud installation | sequential; typecheck, relevant full tests/build, short installed no-video doctor, independent archive unpack |
| C5 | Concurrent cloud generation and automatic publication of five new cases | C3,C4 | none | Main dispatches or explicitly hands off sole runner/publication ownership; unique run/request IDs and S3 prefix | sequential dispatch boundary then five concurrent model jobs; exact job status/artifacts and gallery state |

Main owns cross-package interfaces and final integration. No worker edits another owner's files or mutates another run. Generated case sources and old artifacts are immutable.

## Runtime direction

One ThreeCameraRig owns final pose and reset. Fix the quaternion alias defect first. Reuse the provider-neutral hard decollision core with a Rapier hit adapter, speed-bounded release, contact hold, and validated overlap escape. Camera framing and physical subject anchors are distinct: derive subject anchors from registered body dimensions, keep their framing through arm contraction, and preserve the current authored camera when follow is first attached. Explicit authored orbit settings remain available and transition continuously.

Public additions must stay optional and descriptive; defaults cover normal reference worlds. Diagnostics add actual quaternion/angular and position changes, arm/obstruction state, and projected subject bounds to a bounded input observation. Camera telemetry and representative frames are informational: they must not create a recording requirement, human review status, or publication blocker.

## Verification scope

Cover opening-to-movement quaternion continuity, default pose adoption, explicit orbit settings, long/short-arm recovery rate, corners/edge chatter, overlapping pivots, tall look targets, different body sizes, zero time, 30/60/120 Hz-like schedules, reset and parent transforms. Browser evidence concerns SDK behavior, not a manual content approval step. New cloud cases use identical frozen tools/instructions and no case-specific hints or corrections.
