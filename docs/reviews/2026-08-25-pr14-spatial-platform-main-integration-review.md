# PR #14 Spatial Platform Integration Review

## Review metadata

- Source PR: `#14 feat: integrate lightweight scene planning and evaluation workflow`
- Source branch reviewed through: `origin/codex/spatial-plan-platform-main@917b9b60890fa971fd38ef5dab33b8db417aa592`
- Original implementation slice selectively integrated through: `15b3fd952247b56403b355ba81450777274794ed`
- Target baseline: `origin/main@01ee4b9dd403dcc3f05b59ec29d7dbd8e5b17f10`
- Integration method: current-main reimplementation and squash, not a history merge
- Review protocols: `full-dimension-review-protocol.md` and `runtime-deep-review-checklist.md`

PR #14 accumulated several generations of the repository architecture. A direct merge would reintroduce obsolete public protocols, replace current authority documents, weaken compiler gates, and add a large evaluation corpus to ordinary Git history. The valuable workflow was therefore ported onto current `main` while stale or conflicting slices were rejected.

## Current authority baseline

The target repository has one active execution chain:

```text
AuthoringSpec V4
  -> NormalizedWorldIR V4
  -> ExecutionPlan V5
  -> Babylon/Havok Runtime
  -> Browser Protocol V5 / Runtime Snapshot V4
```

Route R1 Heightfield and R1b Static Platform are complete and M5 is closed. The formal repository planning authority remains `OutdoorWorldSpec + World Plan + Opening Shot -> plan-lock`. The production capability boundary remains outdoor heightfield worlds; unsupported movement and world structures must be reported as capability gaps.

## Accepted and reworked

The integration keeps these valuable ideas:

- a compact Scene Brief for the optional hosted evaluation path;
- explicit separation of user facts, visible reference evidence, inferred continuation, and render-layer ideas;
- one to five complete visual targets with stable IDs and identity colors;
- a trusted Scene Brief implementation map bound to Scene Brief and AuthoringSpec hashes;
- grouped Babylon tri-view capture through the existing runtime artifact-capture owner;
- source-generated portable Planner and Builder self-checkers with parity tests;
- isolated hosted Planner/Builder tasks, atomic artifact writes, receipts, and bounded concurrency;
- protected Studio proxy and provider-neutral workflow stages;
- a separate user-triggered recording/video workbench;
- external visual provider adapters kept outside Canonical Schema and runtime state.

The current integration additionally closes gaps found during review:

- Scene Brief now has required provenance sections instead of mixing evidence and invention;
- movement labels are requests only and cannot manufacture Registry capabilities;
- nonexistent slide/glide subject refs were removed;
- `maxVertices`, `maxTriangles`, and `maxColliders` are all blocking budgets;
- the false fixed-duration exploration formula was removed;
- implementation mappings and capture groups must have identical visual-target sets and cannot reuse runtime entities;
- capture uses the existing Babylon artifact boundary instead of a second camera/material owner;
- recording UI is installed only for a hosted Authoring world, so Legacy/catalog and G Bot retain local download behavior;
- Studio carries one unreleased current workflow rather than compatibility branches.

## Rejected or removed

The following source-branch content is intentionally not integrated:

- replacement of the repository `AGENTS.md` and README authority;
- `SpatialWorldPlan V1` as a second planning or Canonical authority;
- obsolete Authoring/IR/Plan and Browser/Snapshot versions;
- legacy Three.js/Rapier runtime or capture behavior;
- capture code that independently mutates live camera or material state;
- compiler paths that treated triangle overruns as non-blocking;
- production claims for board riding, gliding, vehicles, caves, flight, underwater traversal, or dynamic platforms;
- the committed reference-image corpus, generated results, logs, and hosted evaluation Site;
- V18-V23 Studio workflow branches and compatibility imports;
- the fixed “five-minute exploration” perimeter/speed blocking gate.

The final source commit `917b9b6` adds a selectable local Codex execution backend. Its concept is useful, but it is intentionally not bundled into this merge. It expands the trusted execution and credential boundary, while its current documentation overstates filesystem isolation and read-only context enforcement. It should return as a dedicated security-reviewed change with explicit path, symlink, output-destination, child-termination, and credential-access threat tests.

## Contract disposition

Scene Brief is a non-Canonical hosted intent artifact. It does not replace formal WorldSpec planning or `plan-lock`. AuthoringSpec V4 remains the first Canonical world authority on the hosted path.

The Authoring Capture API is intentionally separate from the exact public Browser Protocol V5. It exposes stable semantic target IDs and entity IDs only; Babylon/Havok handles and provider names do not enter Canonical Schema, CLI results, manifests, reports, or snapshots.

Recording and video generation remain downstream, user-triggered workflows. A generated video is never simulation evidence, and a provider failure cannot rewrite or discard the source whitebox recording.

## Verification disposition

Contract and integration evidence completed during review:

- TypeScript typecheck;
- Scene Brief, capture-target, visual-reconstruction, CLI, Skill parity, capture API, recording and entry-camera tests;
- Studio server, public proxy and recording workbench tests;
- LWDP client/profile tests;
- repository-wide `pnpm test`: 193 files / 2229 tests;
- production build and scene suite: 2 files / 20 tests;
- `verify:unreleased-clean-break` with zero forbidden matches;
- Canonical, Placement, Rigged Subject, G Bot, Control Capture and Validation Capture gates;
- Route R0 contract, R1 Heightfield and R1b Static Platform gates;
- all catalog Outdoor Gameplay browser and artifact-only gates.

All listed commands completed successfully on the integration worktree before the independent completion review. The runtime gates produced real Chromium/Babylon/Havok evidence; no generated verification output is included as an incidental source change.
