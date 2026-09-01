# BWB-6 Profile Optimization Contract Gap

**Status:** blocked before production implementation; focused RED retained as evidence

**Baseline:** `origin/main@a687a27b645522fd06d175f0eb754a52fbb4a373`

**Scope:** `@whitebox-world/native-babylon-block-profile` measurement and equivalence only

## Decision

BWB-6 prerequisites are present: the
[live backlog](../18-refactor-progress-and-backlog.md) marks BWB-3, BWB-4, and BWB-5 complete and keeps
BWB-6 open. The current Profile can also publish deterministic Layout, visual-group, and one-proxy-
per-block Collider inventories from the same finalized epoch.

Production implementation does not start in this slice. The
[WRC-1 policy](../superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)
requires a detailed implementation plan before production code, and no BWB-6 plan exists. More
importantly, the current handoff does not carry all information required to decide equivalence without
guessing. The focused RED demonstrates one concrete loss: `finalize()` accepts Collider friction and
restitution, and the Host-frozen Static Collider Contribution retains them, but the Profile-side
Collider inventory drops both values. A Profile-only coalescing assessor therefore cannot distinguish
two geometrically compatible Colliders with different material behavior.

This branch intentionally adds no Thin Instance, Chunk, Collider coalescing, Runtime, Havok, Camera,
Input, Browser, port, or production Case behavior. BWB-6 remains open.

## Current measured baseline

The measurement replayed the five positive BWB-5 cases with Babylon `9.23.0` `NullEngine` through
the real Profile Session/finalize and Native admission path. These are deterministic resource counts,
not CPU time, GPU time, allocated bytes, rendered equivalence, Havok equivalence, or a production
performance claim.

| Case | Block Meshes | Visual groups | Palette materials | Shape kinds used | Collider proxies | Static surfaces | Not traversable |
|---|---:|---:|---:|---:|---:|---:|---:|
| `mountain-cliff` | 12 | 2 | 2 | 2 | 12 | 6 | 6 |
| `t-shaped-traversal` | 12 | 3 | 2 | 1 | 12 | 8 | 4 |
| `ordinary-and-blocked-steps` | 6 | 0 | 1 | 3 | 6 | 6 | 0 |
| `building-exterior` | 8 | 1 | 2 | 2 | 8 | 5 | 3 |
| `limited-interior` | 10 | 1 | 2 | 1 | 10 | 3 | 7 |
| **Total** | **48** | **7** | **9 case-local** | **9 case-local** | **48** | **28** | **20** |

The baseline proves there is something worth evaluating, especially the 48 visual Meshes and 48
independent Collider proxies. It does not prove how many may be grouped or coalesced.

## Exact contract gaps

1. **Missing implementation plan.** The WRC-1 spec requires exact files, interfaces, deletion
   targets, RED/GREEN reproducers, affected gates, review boundary, and commit boundary before a work
   package changes production code. No BWB-6 plan is present under `docs/superpowers/plans/`.
2. **Thin Instance eligibility is not closed.** The design does not decide whether a batch may cross
   `visualGroupId`, semantic capture class, rotation, or Chunk boundaries, nor how stable per-block
   identity remains observable after grouping. Shape and palette alone are insufficient to infer this
   policy.
3. **Chunk identity is not closed.** There is no frozen Chunk size, world origin, boundary ownership,
   block-on-boundary rule, semantic-group split rule, stable Chunk ID/hash, frustum rule, or residency
   measurement window. Choosing any of these in code would invent architecture.
4. **Collider equivalence input is incomplete.** The Profile inventory retains Collider ID, source
   block ID, visual-group IDs, proxy kind, and traversal binding, but omits the accepted
   `frictionRatio` and `restitutionRatio`. The
   [detailed design](../superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md)
   also forbids coalescing across different Surface Profile, semantic boundary, or stable Subshape
   identity. Every traversable BWB-5 block uses a unique `surfaceEntityId`, so the conservative current
   rule yields no demonstrated traversable coalescing candidate.
5. **Benchmark protocol is not closed.** CPU/GPU/memory comparisons require a frozen platform
   profile, renderer/backend, resolution, warm-up, sample count, statistic, noise budget, and resource
   accounting boundary. A `NullEngine` object count cannot substitute for those measurements.
6. **Equivalence oracles are not closed.** The spec names visual/collider identity, frustum/Chunk
   boundaries, and candidate A/B, but does not freeze whether acceptance means exact Profile inventory
   identity, semantic capture mapping, metric rendered tolerance, collider geometry/bounds, or
   downstream Havok support/contact equivalence. Runtime/Havok validation remains BNA-owned.

## Focused RED

`packages/native-babylon-block-profile/src/optimization-contract.test.ts` constructs one real checked
Layout and one real Collider candidate with `frictionRatio: 0.25` and `restitutionRatio: 0.5`. It
expects the Profile-side inventory to retain those values so a future assessor can reject a
material-changing merge.

The test fails only because both values are absent from the returned inventory:

```text
Expected: frictionRatio 0.25, restitutionRatio 0.5
Received: neither field is present
```

This RED does not prescribe an optimization API or authorize adding the fields. The BWB-6 plan must
first decide whether the Profile inventory is the stable assessor input or whether another existing,
fully frozen Contribution snapshot is the sole input. The failing test should then either become the
first GREEN contract test or be replaced by the approved input-boundary test.

## Verification evidence

| Command | Result | Scope |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | PASS | all workspace dependencies installed from the lockfile |
| `corepack pnpm exec vitest run packages/native-babylon-block-profile/src` before the RED | PASS, 15 files / 114 tests | clean Profile package baseline |
| five-case `NullEngine` measurement replay | PASS | deterministic Profile object/inventory counts in the table above |
| `corepack pnpm exec vitest run packages/native-babylon-block-profile/src/optimization-contract.test.ts` | expected FAIL, 1 test | missing Collider material semantics |

No full repository test, Runtime/Havok gate, Browser, port, rendered capture, manual interaction, or
production reconstruction Case was run.
