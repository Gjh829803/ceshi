# BWB-6 Profile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one deterministic Profile-side optimization assessment with safe grouping
eligibility, resource-count benchmarks, equivalence fixtures, and no Runtime/Havok mutation.

**Architecture:** Extend the existing Profile Collider inventory with the material values already
present in its frozen selection, then add one pure `optimization.ts` assessor over a finalized epoch.
The assessor emits data-only Chunk, Thin Instance, and Collider-coalescing proposals plus count-based
resource and equivalence evidence; it never mutates Babylon or BNA contributions.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Babylon.js 9.23 types/data, `lodash-es`, canonical JSON SHA-256.

**Spec:** `docs/superpowers/specs/2026-09-01-bwb6-profile-optimization-contract-design.md`

## Global Constraints

- Modify only `packages/native-babylon-block-profile/**`, the single contract-lane entry in
  `scripts/lib/test-gate-manifest.ts`, and BWB-6-focused specs, plans, reviews, and live backlog
  status after merge.
- Do not modify Runtime, Havok, Camera, Input, Browser, ports, AI Schema, BNA Registration, or
  Contribution semantics.
- Keep exactly one new package-root callable entry and no compatibility alias.
- Run focused RED to GREEN first; run affected package tests, typecheck, census, and diff-check once
  on the frozen candidate.
- Do not run full repository tests or wait for lengthy GitHub CI.

---

### Task 1: Freeze BWB-6 contract and retain Collider material semantics

**Files:**

- Modify: `packages/native-babylon-block-profile/src/optimization-contract.test.ts`
- Modify: `packages/native-babylon-block-profile/src/collider-contribution.ts`
- Modify: `packages/native-babylon-block-profile/src/collider-contribution.test.ts`

**Interfaces:**

- Consumes: canonical `BabylonNativeBlockStaticColliderSelectionV1`.
- Produces: `BabylonNativeBlockColliderCandidateInventoryEntryV1` with optional exact-presence
  `frictionRatio` and `restitutionRatio`.

- [ ] **Step 1: Confirm the existing focused RED**

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/optimization-contract.test.ts
```

Expected: one failure showing the inventory omits `frictionRatio: 0.25` and
`restitutionRatio: 0.5`.

- [ ] **Step 2: Copy explicit material fields into the inventory**

Add both optional fields to the inventory interface. When constructing an entry, copy each only when
`Object.hasOwn(selection, field)` is true. Do not supply defaults.

- [ ] **Step 3: Update the existing Collider contract test**

Assert that deterministic evidence retains `{ frictionRatio: 0.25, restitutionRatio: 0.5 }` for the
explicit selection and retains absence for the selection that omitted both fields.

- [ ] **Step 4: Run the focused material test**

Run the optimization RED and the named Collider test. Expected: PASS.

- [ ] **Step 5: Commit the contract slice**

```bash
git add packages/native-babylon-block-profile/src/optimization-contract.test.ts \
  packages/native-babylon-block-profile/src/collider-contribution.ts \
  packages/native-babylon-block-profile/src/collider-contribution.test.ts
git commit -m "fix(native-block): retain collider optimization semantics"
```

### Task 2: Add deterministic assessment RED fixtures

**Files:**

- Modify: `packages/native-babylon-block-profile/src/optimization-contract.test.ts`

**Interfaces:**

- Consumes: the future package-root `assessBabylonNativeBlockOptimizationV1({ finalizedEpoch })`.
- Produces: literal expected Chunk, Thin Instance, coalescing, resource, equivalence, and hash behavior.

- [ ] **Step 1: Add the public-entry RED**

Import `assessBabylonNativeBlockOptimizationV1` from `./index.js` and assert a synthetic finalized
epoch with a rectangular two-block pair emits one Thin Instance group, one coalescing group, exact
baseline/projected counts, complete coverage, and a SHA-256 assessment hash.

- [ ] **Step 2: Add semantic-split and negative-Chunk RED cases**

Use literal fixtures proving different traversal identity, explicit material ratio, visual group,
non-rectangular occupied union never enter the same eligibility group. Include a negative-coordinate
Chunk fixture, a current full Block centered on the `3.5m` boundary, and reversed creation order.

- [ ] **Step 3: Add rejection and deep-freeze RED cases**

Assert stable `WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID` rejection for a failed check,
duplicate identity, or broken Collider join. Assert every nested result collection is frozen.

- [ ] **Step 4: Run and confirm RED**

Run only `optimization-contract.test.ts`. Expected: module/export failure because the assessor is not
implemented.

### Task 3: Implement the one Profile-side assessment

**Files:**

- Create: `packages/native-babylon-block-profile/src/optimization.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`

**Interfaces:**

- Consumes: `BabylonNativeBlockFinalizedEpochV1`.
- Produces: `assessBabylonNativeBlockOptimizationV1` and
  `BabylonNativeBlockOptimizationAssessmentV1` with the fields frozen by the design.

- [ ] **Step 1: Define closed public types**

Define fixed-grid policy, residency group discriminated union, Thin Instance and Collider proposal
groups, baseline/projected resource counts, equivalence booleans, and the top-level assessment.
Numeric metric names include `Meters`, `XZ`, or `Count`.

- [ ] **Step 2: Validate the finalized epoch**

Fail with `WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID` unless the finalized epoch is passed,
issue-free, uniquely joined, and uses the expected current kinds/versions and hash format.

- [ ] **Step 3: Derive fixed residency groups**

Apply `[4, 4]m` XZ chunks from origin `[-0.5, -0.5]m`; place fully contained blocks in signed-index
grid groups and boundary-crossing blocks in stable singleton groups. Assert exact Block coverage.

- [ ] **Step 4: Derive conservative Thin Instance groups**

Group only non-boundary blocks with exact residency, shape, palette, and semantic capture class.
Publish groups of at least two and list all remaining Block IDs independently.

- [ ] **Step 5: Derive conservative Collider groups**

Partition on exact residency, traversal binding, ratio presence/value, visual groups, and proxy kind.
Find face-connected components and publish only components whose microcell union is one filled axis-
aligned rectangular prism. List every remaining Collider independently.

- [ ] **Step 6: Derive resource and equivalence evidence**

Compute the literal count oracle from the design, prove exact Block/Collider coverage, hash the plain
payload with `sha256CanonicalJson`, and deeply freeze the result.

- [ ] **Step 7: Export the sole callable entry**

Export the function and types from `src/index.ts`; add no alias or policy override.

- [ ] **Step 8: Run the focused test until GREEN**

Run only `optimization-contract.test.ts`. Expected: all tests PASS.

- [ ] **Step 9: Commit the assessment**

```bash
git add packages/native-babylon-block-profile/src/optimization.ts \
  packages/native-babylon-block-profile/src/optimization-contract.test.ts \
  packages/native-babylon-block-profile/src/index.ts
git commit -m "feat(native-block): assess profile optimization eligibility"
```

### Task 4: Close package exports, corpus measurement, and review

**Files:**

- Modify: `packages/native-babylon-block-profile/src/api-type.test.ts`
- Modify: `packages/native-babylon-block-profile/src/package-boundary.test.ts`
- Replace: `docs/reviews/2026-09-01-bwb6-profile-optimization-contract-gap.md`
- Create: `docs/reviews/2026-09-01-bwb6-profile-optimization-review.md`

**Interfaces:**

- Consumes: the package-root assessment and five positive BWB-5 finalized epochs.
- Produces: public type/export evidence, exact baseline/proposal measurements, BNA follow-up proposal,
  and Mode B review.

- [ ] **Step 1: Update public API tests**

Assert the root package exposes only `assessBabylonNativeBlockOptimizationV1` as the new callable and
that a consumer can type the returned assessment without importing internal files.

- [ ] **Step 2: Add literal corpus measurement assertions**

Run all five positive BWB-5 cases through the assessor and assert the existing literal baseline table:
48 Block Meshes, 48 Collider proxies, 28 static surfaces, and 20 not-traversable Colliders in total.
Record proposal counts produced by the frozen algorithm, without calling them Runtime measurements.

- [ ] **Step 3: Replace the gap report with final Mode B review**

Record exact diff, installed versions, commands and exit codes, D2-D6 coverage, the deterministic
resource table, explicit non-claims, and the BNA-owned implementation gates. Remove the obsolete gap
report from the accepted tree.

- [ ] **Step 4: Run affected final gates once**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
pnpm typecheck
pnpm test:census
git diff --check origin/main...HEAD
```

Expected: all pass; no tracked output generated.

- [ ] **Step 5: Commit review closure**

```bash
git add packages/native-babylon-block-profile/src \
  docs/reviews/2026-09-01-bwb6-profile-optimization-contract-gap.md \
  docs/reviews/2026-09-01-bwb6-profile-optimization-review.md
git commit -m "docs: close BWB-6 profile optimization review"
```

### Task 5: Integrate and update live status

**Files:**

- Modify after merge: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**

- Consumes: reviewed exact branch SHA and merged PR.
- Produces: merged `main` plus truthful live BWB-6 completion status.

- [ ] **Step 1: Self-review the actual branch diff**

Apply Mode B D2-D6 and the relevant runtime authority/lifecycle/evidence checklist. Fix any P0/P1;
record non-blocking limitations. Re-run only invalidated focused evidence.

- [ ] **Step 2: Synchronize latest `origin/main`**

Fetch and merge or rebase the latest `origin/main`. Resolve conflicts semantically. If upstream
changes Profile inputs or contracts, rerun the affected package gate and typecheck; unrelated docs do
not invalidate them.

- [ ] **Step 3: Push and create the PR**

Push `codex/wrc1-bwb6-profile`, create one PR with scope, evidence, non-claims, and review link. Do not
wait for lengthy GitHub CI.

- [ ] **Step 4: Merge after no open P0/P1**

Merge the PR into `main`, update local `main`, then mark BWB-6 complete in the live backlog with the PR
and merge SHA. Push that documentation-only status commit after link/claim/diff checks.

- [ ] **Step 5: Report final evidence**

Return worktree, branch commits, PR URL/number, merge and final main SHAs, test counts, exact measured
resource table, explicit deferred BNA runtime work, and confirmation that Runtime/Havok/Camera/Input/
Browser/AI Schema/Contribution semantics were untouched.
