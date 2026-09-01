# BWB-6 Profile Optimization Contract Design

**Project:** WRC-1 / BWB-6

**Status:** frozen current-only implementation authority

**Date:** 2026-09-01

**Source baseline:** `origin/main@a687a27b645522fd06d175f0eb754a52fbb4a373`

**Parent authorities:**

- [WRC-1 World Reconstruction & Control Milestone](./2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)
- [Babylon Native Block Whitebox Profile](./2026-08-28-babylon-native-block-whitebox-profile-design.md)
- [Block Settlement and Step Closure](./2026-08-31-babylon-block-settlement-and-step-closure-design.md)

## 1. Decision

BWB-6 adds one Profile-side, read-only assessment entry point over one already finalized Block epoch.
It emits deterministic grouping eligibility, a deterministic resource-count benchmark, equivalence
coverage, and a content hash. It does not instantiate Thin Instances, change Babylon scene objects,
merge Collider geometry, create Havok objects, alter a Contribution, or publish Runtime policy.

```text
BabylonNativeBlockFinalizedEpochV1
  -> assessBabylonNativeBlockOptimizationV1({ finalizedEpoch })
       -> frozen residency grouping
       -> frozen Thin Instance eligibility groups
       -> frozen Collider coalescing eligibility groups
       -> baseline and projected resource counts
       -> equivalence coverage and assessment hash
```

The assessment is a proposal consumed by a future BNA-owned implementation task. A favorable count
does not authorize Runtime adoption or a production performance claim.

## 2. Scope and ownership

### 2.1 BWB-6 owns

- `packages/native-babylon-block-profile/src/optimization.ts`;
- the sole public assessment function and its public result types;
- Profile-local fixed Chunk policy and deterministic grouping algorithms;
- Profile-local baseline/projected resource counts;
- equivalence fixtures and a BNA-4 optimization proposal/review.

### 2.2 BWB-6 does not own

- `runtime-babylon`, RuntimeHost, Havok shape creation, physics material defaults, support queries,
  Character, Camera, Input, fixed Tick, Browser, ports, or lifecycle;
- BNA core Registration, Contribution, Package, Hash, Debug Overlay, or admission contracts;
- AI-facing Schema, WorldPackage, Canonical Authoring, or reconstruction production Cases;
- real Thin Instance, Chunk residency, Collider replacement, or resource disposal behavior.

Any implementation that needs one of those owners stops and moves to a separately approved stable
BNA task ID.

## 3. One public contract

The package root exports exactly one new callable entry:

```ts
function assessBabylonNativeBlockOptimizationV1(input: Readonly<{
  finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
}>): BabylonNativeBlockOptimizationAssessmentV1;
```

The package root also exports the result's TypeScript types. It does not export a second builder,
parser, benchmark command, policy override, compatibility alias, or Runtime adapter.

The returned assessment is deeply frozen plain data and contains:

- `kind = "babylon-native-block-optimization-assessment"`;
- `schemaVersion = 1`;
- the input `profileInventoryHash`;
- the fixed `chunkPolicy`;
- `residencyGroups`, `thinInstanceGroups`, and `colliderCoalescingGroups`;
- `independentVisualBlockIds` and `independentColliderIds`;
- `baselineResources`, `projectedResources`, and `equivalence`;
- `assessmentHash`, computed from every preceding field.

The function accepts only a passed, issue-free finalized epoch whose block and Collider identities
are unique and exactly joined. Invalid or forged input fails with
`WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID` before publishing an assessment.

## 4. Collider semantics retained in Profile inventory

`BabylonNativeBlockColliderCandidateInventoryEntryV1` gains optional `frictionRatio` and
`restitutionRatio`. The materializer copies each field only when it was explicitly present on the
canonical frozen selection. Absence remains different from an explicit number; the assessor never
invents or normalizes a Runtime default.

This is a Profile-local inventory extension. The actual BNA Static Collider Contribution already
retains these values, so the change does not alter Registration or Contribution semantics. Existing
Profile settlement and Contribution hashes remain owned by their current layers.

## 5. Fixed semantic Chunk policy

The assessment uses one non-configurable XZ grid:

- `kind = "fixed-xz-grid"`;
- `sizeMetersXZ = [4, 4]`;
- `originMetersXZ = [-0.5, -0.5]`;
- chunk index uses `floor((centerMeters - originMeters) / sizeMeters)`;
- grid intervals are half-open for center ownership;
- a block is a normal Chunk member only when its complete XZ bounds fit inside the selected Chunk;
- a block crossing either boundary becomes one stable singleton boundary residency group.

The current BWB-3 lattice permits a full Block centered on a Chunk boundary, such as `X = 3.5m`,
whose bounds cross the center-owned Chunk. Such a Block is therefore a current, reachable singleton
case and must remain ineligible for Thin grouping or Collider coalescing across that boundary.

The `-0.5m` origin aligns ordinary one-meter Block faces with four-meter boundaries. The policy is a
Profile assessment rule, not a Runtime streaming promise. Every block appears in exactly one
residency group. Group IDs encode signed X/Z indices or the stable boundary block ID and are sorted
lexically.

## 6. Thin Instance eligibility

Two or more blocks form one eligible Thin Instance group only when all are true:

1. they belong to the same non-boundary residency group;
2. they have the same fixed `shape`;
3. they have the same `paletteRole`;
4. they have the same semantic capture class, derived from the exact `visualGroupId` or `ungrouped`;
5. their stable Block IDs remain listed individually in the proposal.

Rotation and translation remain per-block transforms and therefore do not split an otherwise equal
fixed shape. Boundary singleton blocks and groups of size one stay in `independentVisualBlockIds`.
The future Runtime implementation must preserve the existing per-block runtime entity and semantic
capture mapping; BWB-6 does not claim Babylon Thin Instance handle equivalence.

## 7. Collider coalescing eligibility

Collider candidates are partitioned only when all of these values are exact-equal:

- residency group;
- complete closed `traversalBinding`, including `surfaceEntityId`, `logicalSubshapeId`, and
  `traversalSurfaceProfileRef` when present;
- explicit presence and value of `frictionRatio` and `restitutionRatio`;
- sorted `visualGroupIds`;
- `proxyKind = "layout-block-volume"`.

Within one partition, blocks are connected through face-adjacent occupied microcells. A connected
component is eligible only when it contains at least two Colliders and its occupied microcell union
exactly fills one axis-aligned rectangular prism. This prevents an L-shaped or gapped union from
adding collision volume. The proposal retains all original Collider IDs, source Block IDs, exact
semantics, and the candidate bounds. Components that fail any rule remain independent.

The assessor does not create the merged box. A future BNA-owned implementation must rebuild and
revalidate Contribution Hash, real Havok support/contact behavior, overlays, dual-session isolation,
and throwing cleanup.

## 8. Benchmark oracle

BWB-6's authoritative Profile-side benchmark is deterministic resource-driver counts, not noisy wall
clock or platform counters:

### Baseline

- `visualMeshCount` and `visualDrawUnitCount`: one per checked Block;
- `visualGeometryBufferSetCount`: one per checked Block in the current ordinary-Mesh baseline;
- `paletteMaterialCount`: unique used palette roles;
- `colliderProxyCount`: current Collider inventory length;
- `colliderTriangleCount`: twelve triangles per exact box proxy.

### Projected proposal

- one visual draw unit and geometry buffer set per eligible Thin Instance group;
- one independent visual draw unit and geometry buffer set per remaining Block;
- one Collider proxy and twelve triangles per eligible coalesced group;
- one Collider proxy and twelve triangles per independent Collider;
- `residencyGroupCount` from the fixed Chunk policy.

The report uses `measurementKind = "deterministic-resource-counts"`. It contains no CPU milliseconds,
GPU milliseconds, or byte estimates. Actual CPU/GPU/memory measurements are only meaningful after a
BNA-owned implementation exists and must freeze platform, renderer/backend, resolution, warm-up,
sample count, statistic, noise budget, and resource accounting. This design records that later gate
instead of fabricating an A/B runtime result from `NullEngine`.

## 9. Equivalence oracle

The assessment is accepted only when construction proves all five closed invariants:

- every checked Block ID appears exactly once across Thin groups plus independent visual blocks;
- every Block remains in exactly one residency group;
- semantic capture class membership is unchanged;
- every Collider ID and source Block ID appears exactly once across coalescing groups plus independent
  Colliders;
- every proposed Collider group has exact traversal/material/visual semantics and an occupied-cell
  union equal to its rectangular candidate bounds.

The result records these as required `true` fields and includes them in `assessmentHash`. Any failed
invariant throws rather than returning a partial or downgraded proposal.

Rendered visual equivalence, frustum behavior, real GPU resources, Havok contact/support equivalence,
and production cleanup remain required gates of the later BNA implementation. They are not inferred
from this structural assessment.

## 10. Verification and evidence

Focused RED to GREEN must cover:

- Collider friction/restitution preservation;
- exact semantic splits for traversal, ratios, visual group, gaps, and non-rectangular unions;
- asymmetric and negative Chunk indices plus a current boundary-crossing singleton;
- creation-order determinism and stable assessment hash;
- exact Block/Collider coverage and deep freezing;
- literal BWB-5 baseline resource counts;
- forged input rejection and package-root export/type visibility.

Affected gates are the focused optimization test, all
`packages/native-babylon-block-profile/src` tests, root `pnpm typecheck`, test census, and
`git diff --check`. Runtime, Havok, Browser, rendered, manual, Studio, and full repository tests are
not inputs to this Profile-only proposal and are not run.

## 11. Completion boundary

BWB-6 is complete when the frozen public assessment contract, deterministic grouping/benchmark,
equivalence fixtures, package exports, review/proposal, and affected gates are merged. The live
backlog is marked complete only after merge.

BWB-6 completion does not mean any optimization is active. A later BNA-owned implementation requires
a new stable task, its own design/plan, actual engine/Havok gates, and production disposition.
