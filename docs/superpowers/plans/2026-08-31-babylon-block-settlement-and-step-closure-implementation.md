# Babylon Block Settlement and Step Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fuse BWB-3 visuals and BWB-4 colliders into one Host-settled Block Profile epoch, bind it to the existing Native Contribution/WorldPackage, and prove a real 0.25m step pass plus 0.5m blocker through SDK-owned Havok.

**Architecture:** One Block Session derives one Checked Layout and commits one Profile-private settlement batch through the existing Native Host-only boundary. Candidate admission rechecks visuals, colliders, and Scene membership after `build()` settles, publishes one opaque receipt inside the existing Contribution, and Runtime replay exact-matches that Contribution before Havok. The Profile then clean-breaks to an anisotropic Y grid with a `step` shape; no Manifest, callback, second geometry owner, or Native-specific package is introduced.

**Tech Stack:** TypeScript 5.9, Babylon.js 9.23.0, Havok 1.3.14, Vitest 3.2.7, canonical JSON/SHA-256, lodash-es named imports, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-31-babylon-block-settlement-and-step-closure-design.md`

## Global Constraints

- BNA-5 must be accepted on `main` before product implementation begins; merge/rebase that exact accepted tree first.
- Current-only clean break: one public name, parser, finalize path, state owner and Profile identity; no aliases or migrations.
- Do not add a Native-specific workspace package. Reuse `native-babylon`, `runtime-contracts`, `world-package`, `runtime-babylon`, and `native-babylon-block-profile`.
- `nativeSceneProfileRef` selects authoring Profile only; `trustProfileRef` and `nativeExecutionTrustProfileRef` remain independent trust identities.
- The Module cannot import `@whitebox-world/native-babylon/host`, return callbacks, or self-certify settlement.
- SDK/Havok remain the only Physics, support, Character, Camera, Input and fixed-Tick owners.
- Use `===`/`!==`; use lodash-es `isNil`/`isEmpty` for null/empty checks; use Babylon math/geometry APIs for 3D operations.
- Every worktree runs `pnpm install --frozen-lockfile`; each task runs focused tests only. Full gates and independent review run once on the final pushed SHA.

---

## File Structure

### Existing authority files modified

- `packages/runtime-contracts/src/native-scene-contribution.ts`: persistent `profileSettlement` union/parser/hash authority.
- `packages/native-babylon/src/profile-settlement.ts`: Candidate-private recorder and Mesh fingerprint implementation.
- `packages/native-babylon/src/candidate-admission.ts`: recorder lifecycle, settle recheck, Scene membership census, receipt assembly.
- `packages/native-babylon/src/host.ts`: Host-only settlement commit export.
- `packages/native-babylon-block-profile/src/session.ts`: sole public finalize orchestration.
- `packages/native-babylon-block-profile/src/profile-settlement.ts`: package-private inventory/hash/batch projection.
- `packages/native-babylon-block-profile/src/babylon-visual-adapter.ts`: package-private visual materialization.
- `packages/native-babylon-block-profile/src/collider-contribution.ts`: package-private no-gap proxy materialization.
- `packages/native-babylon-block-profile/src/authoring-capture.ts`: finalized-epoch-only capture input.
- `packages/native-babylon-block-profile/src/shapes.ts`, `layout.ts`, `check.ts`: anisotropic grid and `step` semantics.
- `packages/world-package/src/test-fixture.ts` and Native fixture builders: current Profile identities and settlement receipt.
- `scripts/verification/bwb4-block-collider-runtime.test.ts`: real end-to-end Havok evidence.

### Focused test owners

- `packages/runtime-contracts/src/native-scene-contribution.test.ts`
- `packages/native-babylon/src/candidate-admission.test.ts`
- `packages/native-babylon/src/module.test.ts`
- `packages/native-babylon/src/package-boundary.test.ts`
- `packages/native-babylon-block-profile/src/session.test.ts`
- `packages/native-babylon-block-profile/src/profile-settlement.test.ts`
- `packages/native-babylon-block-profile/src/babylon-visual-adapter.test.ts`
- `packages/native-babylon-block-profile/src/collider-contribution.test.ts`
- `packages/native-babylon-block-profile/src/shapes.test.ts`
- `packages/native-babylon-block-profile/src/layout.test.ts`
- `packages/native-babylon-block-profile/src/check.test.ts`
- `packages/world-package/src/package-build.test.ts`
- `packages/world-package/src/package-directory.test.ts`
- `packages/runtime-babylon/src/runtime.test.ts`
- `scripts/native-scene/source-admission.test.ts`

---

### Task 0: BWS-00 — Integrate accepted inputs on the BNA-5 main ancestry

**Files:**
- Modify through cherry-pick: files owned by BWB-3 commits `7fa5aed`, `74774e9`
- Modify through cherry-pick: files owned by BWB-4 commits `caa4495`, `858cd45`, `6b9350a`
- Resolve: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: accepted `origin/main` containing BNA-5; the five exact BWB commits.
- Produces: one integration branch with both narrow evidence sets and no lost test-census rows.

- [x] **Step 1: Update the isolated worktree to accepted main**

Run:

```bash
git fetch origin main
git merge --no-edit origin/main
git merge-base --is-ancestor 2f46b3c92c175d49b2bf684052be27b6d044658f HEAD
```

Expected: all exit 0; the last command proves BNA-5 ancestry.

- [x] **Step 2: Cherry-pick the BWB inputs in dependency order**

Run:

```bash
git cherry-pick 7fa5aed 74774e9
git cherry-pick caa4495 858cd45 6b9350a
```

If `scripts/lib/test-gate-manifest.ts` conflicts, preserve every BWB-3 and BWB-4 row plus all current main rows, keep the array path-sorted, and continue the same cherry-pick. Do not rewrite either implementation yet.

- [x] **Step 3: Install and run the imported focused evidence**

Run:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run \
  packages/native-babylon-block-profile/src \
  scripts/verification/bwb3-block-capture-evidence.test.ts \
  scripts/verification/bwb4-block-collider-runtime.test.ts
pnpm test:census
git diff --check
```

Expected: all exit 0; this records the narrow baseline without claiming integration closure.

---

### Task 1: BWS-05 — Clean-break Native Scene Profile identity

**Files:**
- Modify: `packages/world-package/src/test-fixture.ts`
- Modify: `packages/native-babylon/src/candidate-admission.test.ts`
- Modify: `packages/native-babylon/src/runtime-replay.test.ts`
- Modify: `packages/native-babylon/src/authority-audit.test.ts`
- Modify: `packages/runtime-contracts/src/native-scene-module-bundle.test.ts`
- Modify: `scripts/native-scene/native-scene-check.test.ts`
- Modify: `scripts/native-scene/native-package-input.test.ts`
- Modify: `scripts/native-scene/module-bundle.test.ts`
- Modify: any generated test package fixture whose `nativeSceneProfileRef` is `trusted-local@1`
- Test: `scripts/verification/verify-unreleased-clean-break.test.ts`

**Interfaces:**
- Consumes: `BabylonNativeSceneBootstrapV1.nativeSceneProfileRef`.
- Produces: exactly `whitebox.standard@1` or `whitebox.blocks@1` as authoring Profiles; zero `native-scene-profile/trusted-local@1` values.

- [x] **Step 1: Add the clean-break RED**

Add a production-and-fixture census assertion that scans `packages/`, `apps/`, `scripts/`, and tracked generated examples for the literal:

```text
worldkit://native-scene-profile/trusted-local@1
```

Expected diagnostic code:

```text
WORLDKIT_UNRELEASED_LEGACY_NATIVE_SCENE_PROFILE_REF
```

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run scripts/verification/verify-unreleased-clean-break.test.ts
```

Expected: FAIL and identify the current legacy fixture paths.

- [x] **Step 3: Replace the old Profile value atomically**

Use `worldkit://native-scene-profile/whitebox.standard@1` for ordinary Native tests and fixtures. Use `whitebox.blocks@1` only for modules that actually create a Block Profile Session. Do not change `trustProfileRef` or `nativeExecutionTrustProfileRef`.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm exec vitest run \
  packages/runtime-contracts/src/native-scene-module-bundle.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/native-babylon/src/runtime-replay.test.ts \
  packages/world-package/src/package-build.test.ts \
  scripts/native-scene/native-scene-check.test.ts \
  scripts/native-scene/native-package-input.test.ts \
  scripts/native-scene/module-bundle.test.ts \
  scripts/verification/verify-unreleased-clean-break.test.ts
pnpm verify:unreleased-clean-break
```

Expected: all exit 0 and legacy match count 0.

- [x] **Step 5: Commit**

```bash
git add packages apps scripts
git commit -m "refactor(native): separate scene profiles from trust"
```

---

### Task 2: BWS-10A — Add the required persistent settlement receipt

**Files:**
- Modify: `packages/runtime-contracts/src/native-scene-contribution.ts`
- Modify: `packages/runtime-contracts/src/native-scene-contribution.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/world-package/src/test-fixture.ts`
- Modify: `packages/world-package/src/package-build.test.ts`
- Modify: `packages/world-package/src/package-directory.test.ts`
- Modify: generated Cloud Ridge contribution/package bytes after the source builder changes

**Interfaces:**
- Consumes: canonical `profileRef`, count, Profile inventory hash and settled visual hash.
- Produces: required `BabylonNativeProfileSettlementReceiptV1` inside `BabylonNativeSceneContributionV1.profileSettlement`.

- [x] **Step 1: Write exact-key and hash RED tests**

Add fixtures for both branches:

```ts
const standard = {
  kind: "none",
  profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
} as const;

const blocks = {
  kind: "host-snapshot",
  profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
  targetCount: 7,
  profileInventoryHash: `sha256:${"1".repeat(64)}`,
  settledVisualHash: `sha256:${"2".repeat(64)}`,
} as const;
```

Assert missing/extra/accessor/symbol/unknown Profile, negative count, malformed hash and wrong branch/Profile pair reject. Assert changing any receipt field changes Contribution Hash.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/runtime-contracts/src/native-scene-contribution.test.ts
```

Expected: FAIL because `profileSettlement` is not in the current contract.

- [x] **Step 3: Implement the closed union and parser**

Add `profileSettlement` to the required Contribution field list. Snapshot untrusted inputs before semantic reads, canonicalize signed zero only at the existing publication boundary, freeze every returned branch, and keep `schemaVersion: 1` as the sole current contract.

- [x] **Step 4: Update Package fixtures and run GREEN**

Run:

```bash
pnpm exec vitest run \
  packages/runtime-contracts/src/native-scene-contribution.test.ts \
  packages/world-package/src/package-build.test.ts \
  packages/world-package/src/package-directory.test.ts
pnpm typecheck
```

Expected: all exit 0.

- [x] **Step 5: Commit**

```bash
git add packages/runtime-contracts packages/world-package apps/playground/public/world-packages
git commit -m "feat(native): bind profile settlement to contributions"
```

---

### Task 3: BWS-10B — Implement the Host-private settlement recorder

**Files:**
- Create: `packages/native-babylon/src/profile-settlement.ts`
- Create: `packages/native-babylon/src/profile-settlement.test.ts`
- Modify: `packages/native-babylon/src/host.ts`
- Modify: `packages/native-babylon/src/index.ts`
- Modify: `packages/native-babylon/src/module.test.ts`
- Modify: `packages/native-babylon/src/package-boundary.test.ts`
- Modify: `scripts/native-scene/source-admission.test.ts`

**Interfaces:**
- Consumes: active `BabylonNativeSceneBuildContextV1` and one `BabylonNativeProfileSettlementBatchV1`.
- Produces: Candidate-private retained target fingerprints and a Host-created persistent receipt after recheck.

- [x] **Step 1: Write recorder RED tests**

Cover: no active recorder, malformed batch, wrong Profile, duplicate target, foreign/disposed/parented/instanced/thin/physics Mesh, duplicate commit, late commit, reversed target order determinism, and a commit error caught by caller remaining retained.

The root import must remain absent:

```ts
expect("commitBabylonNativeProfileSettlementV1" in nativeRoot).toBe(false);
```

The Host-only import must exist, while Module source import of `/host` remains rejected.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run \
  packages/native-babylon/src/profile-settlement.test.ts \
  packages/native-babylon/src/module.test.ts \
  packages/native-babylon/src/package-boundary.test.ts \
  scripts/native-scene/source-admission.test.ts
```

Expected: FAIL because the recorder and Host-only export do not exist.

- [x] **Step 3: Implement Context-bound recorder and fingerprints**

Use a module-private `WeakMap` keyed by exact Context identity. Snapshot exact plain batch data without invoking accessors. Retain Mesh identity plus canonical world positions, indices, parent/instance/thin/physics/scene/disposed/visible/enabled state. Do not include Material or keep handles in the returned receipt.

- [x] **Step 4: Run GREEN**

Run the same command as Step 2 plus `pnpm typecheck`. Expected: all exit 0.

- [x] **Step 5: Commit**

```bash
git add packages/native-babylon scripts/native-scene/source-admission.test.ts
git commit -m "feat(native): add host-only profile settlement"
```

---

### Task 4: BWS-10C — Integrate settlement into Candidate admission

**Files:**
- Modify: `packages/native-babylon/src/candidate-admission.ts`
- Modify: `packages/native-babylon/src/candidate-admission.test.ts`

**Interfaces:**
- Consumes: parsed Bootstrap Profile, retained settlement targets, existing retained Collider proxies.
- Produces: exact Profile receipt, visual drift rejection and blocks-only Scene membership closure before Contribution publish.

- [x] **Step 1: Write Candidate behavior REDs**

Add tests for:

- standard Profile with exact `none` receipt;
- blocks Profile missing/two settlement batches;
- target/proxy same Mesh;
- direct extra geometry Mesh;
- commit then mutate position, rotation, scaling, parent, vertices, indices, visibility, enabled or dispose;
- stable targets with reversed creation order producing equal Contribution bytes;
- settlement failure caught by Module still rejecting;
- partial/throwing cleanup preserving the first stable diagnostic.

Expected stable codes include:

```text
WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_REQUIRED
WORLDKIT_NATIVE_SCENE_PROFILE_TARGET_DRIFT
WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH
```

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/native-babylon/src/candidate-admission.test.ts
```

Expected: new tests FAIL on missing settlement lifecycle.

- [x] **Step 3: Compose recorder lifecycle with existing admission**

Open the recorder only after Bootstrap/module/precondition admission and before `build(context)`. Close registration and recorder in the same `finally`. After build/authority checks, surface retained registration/asset/settlement failure, recheck all visual targets and existing Collider geometry/binding, run the blocks Scene Mesh identity census, create receipt, parse one Contribution, then restore authority probes. Always unbind recorder in outer `finally`.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm exec vitest run \
  packages/native-babylon/src/profile-settlement.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/native-babylon/src/runtime-replay.test.ts
pnpm typecheck
```

Expected: all exit 0.

- [x] **Step 5: Commit**

```bash
git add packages/native-babylon
git commit -m "feat(native): settle profile visuals before publish"
```

---

### Task 5: BWS-20 — Fuse BWB-3 and BWB-4 behind one finalize

**Files:**
- Modify: `packages/native-babylon-block-profile/package.json`
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `packages/native-babylon-block-profile/src/session.test.ts`
- Create: `packages/native-babylon-block-profile/src/profile-settlement.ts`
- Create: `packages/native-babylon-block-profile/src/profile-settlement.test.ts`
- Modify: `packages/native-babylon-block-profile/src/babylon-visual-adapter.ts`
- Modify: `packages/native-babylon-block-profile/src/babylon-visual-adapter.test.ts`
- Modify: `packages/native-babylon-block-profile/src/collider-contribution.ts`
- Modify: `packages/native-babylon-block-profile/src/collider-contribution.test.ts`
- Modify: `packages/native-babylon-block-profile/src/authoring-capture.ts`
- Modify: `packages/native-babylon-block-profile/src/authoring-capture.test.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Modify: `packages/native-babylon-block-profile/src/api-type.test.ts`
- Modify: `packages/native-babylon-block-profile/src/package-boundary.test.ts`

**Interfaces:**
- Consumes: public Block calls plus closed static Collider selections.
- Produces: one `BabylonNativeBlockFinalizedEpochV1` and one Host-private complete settlement batch.

- [x] **Step 1: Write single-finalize RED tests**

Assert `finalize(input)` derives Layout and Check once, passes the same `checkedLayout` object identity to package-private visual/collider adapters, includes every block in the target inventory, registers only independent proxies, applies display gap before Host snapshot, rejects missing/extra/duplicate selections, and returns the same frozen result on an equal repeated finalize call while rejecting a different repeated input.

Add order/hash tests for shape, palette, group, transform, gap and Collider join. Add Nth allocation/registration/commit failure tests proving reverse cleanup and continuing after a throwing disposer.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
```

Expected: new tests FAIL because visuals/colliders are separate entry points.

- [x] **Step 3: Implement Profile-private adapters and sole finalize**

Move visual and Collider materialization behind Session. The Collider adapter accepts the exact `BabylonNativeBlockCheckedLayoutV1`, not separate Layout/Check/records. The settlement assembler hashes every Layout block and Collider join, then calls the Host-only commit. Delete root exports for the separate materializers; keep capture reading the finalized epoch only.

- [x] **Step 4: Run GREEN and boundary checks**

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
pnpm typecheck
pnpm verify:workspace-boundaries
```

Expected: all exit 0, no new boundary debt, and root API exposes one finalize path.

- [x] **Step 5: Commit**

```bash
git add packages/native-babylon-block-profile
git commit -m "feat(block-profile): finalize visuals and colliders together"
```

---

### Task 6: BWS-30 — Bind Package and Runtime replay to settlement

**Files:**
- Modify: `packages/world-package/src/test-fixture.ts`
- Modify: `packages/world-package/src/package-build.test.ts`
- Modify: `packages/world-package/src/package-directory.test.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `scripts/native-scene/native-package-input.ts`
- Modify: `scripts/native-scene/native-package-input.test.ts`
- Modify: BWB test package builder/fixture after Task 0 integration

**Interfaces:**
- Consumes: settled Candidate Contribution and existing Native Package inputs.
- Produces: byte-bound WorldPackage whose Runtime replay recomputes the same settlement receipt before Havok allocation.

- [x] **Step 1: Write Package/replay REDs**

Cover missing/tampered receipt, Profile mismatch between Bootstrap and receipt, changed inventory/visual hash, and a Runtime replay whose visual Mesh drifts while Collider Contribution stays stable. Assert rejection occurs before Havok/Subject/Camera allocation with existing `WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH` semantics.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run \
  packages/world-package/src/package-build.test.ts \
  packages/world-package/src/package-directory.test.ts \
  packages/runtime-babylon/src/runtime.test.ts \
  scripts/native-scene/native-package-input.test.ts
```

Expected: new drift fixture FAILS because Profile receipt is not yet part of replay equality.

- [x] **Step 3: Update package fixtures and exact-match composition**

Reuse the existing whole-Contribution equality; do not add a Block Runtime branch. Ensure every package builder receives the replayed settled Contribution and that generated fixture bytes are rebuilt through existing generators, never hand-edited.

- [x] **Step 4: Run GREEN**

Run the Step 2 command plus `pnpm native:cloud-ridge:package:check` and `pnpm typecheck`. Expected: all exit 0.

- [x] **Step 5: Commit**

```bash
git add packages/world-package packages/runtime-babylon scripts/native-scene apps/playground/public/world-packages
git commit -m "feat(block-profile): bind settlement to package replay"
```

---

### Task 7: BWS-40 — Clean-break to the anisotropic grid and `step` shape

**Files:**
- Modify: `packages/native-babylon-block-profile/src/shapes.ts`
- Modify: `packages/native-babylon-block-profile/src/shapes.test.ts`
- Modify: `packages/native-babylon-block-profile/src/layout.ts`
- Modify: `packages/native-babylon-block-profile/src/layout.test.ts`
- Modify: `packages/native-babylon-block-profile/src/check.ts`
- Modify: `packages/native-babylon-block-profile/src/check.test.ts`
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `packages/native-babylon-block-profile/src/session.test.ts`
- Modify: `packages/native-babylon-block-profile/src/babylon-visual-adapter.ts`
- Modify: Block Profile API/boundary tests

**Interfaces:**
- Consumes: Block shape and world transform.
- Produces: one current Profile with occupancy grid `[0.5, 0.25, 0.5]`, center lattice `[0.25, 0.125, 0.25]`, and `step: [1, 0.25, 1]`.

- [x] **Step 1: Write grid/shape RED tests**

Assert a `step` centered at Y `0.125` is valid, occupies one Y layer, stacks without overlap, and creates `structuralStepTransition` metadata. Assert Y values outside the 0.125 lattice reject, X/Z behavior remains unchanged, `half` stays 0.5m, and `displayGapMeters >= 0.25` rejects a `step` before allocation.

Add a source census that rejects the old scalar constants and `structuralHalfMeterTransition` names.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
```

Expected: FAIL because `step` and anisotropic constants do not exist.

- [x] **Step 3: Implement the sole current grid contract**

Replace scalar division/modulo with axis-indexed Babylon-safe calculations. Add `step` to every exhaustive shape map. Validate display gap against the selected shape's minimum dimension. Delete old exports and fixed 0.5m diagnostics; do not add deprecated aliases or Profile V2.

- [x] **Step 4: Run GREEN and clean-break census**

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
pnpm verify:unreleased-clean-break
pnpm typecheck
```

Expected: all exit 0 and old symbol match count 0.

- [x] **Step 5: Commit**

```bash
git add packages/native-babylon-block-profile scripts/verification
git commit -m "feat(block-profile): add true quarter-meter steps"
```

---

### Task 8: BWS-50 — Prove the integrated chain with real Havok

**Files:**
- Modify: `packages/native-babylon-block-profile/src/testing.ts`
- Modify: `scripts/verification/bwb4-block-collider-runtime.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` only if the final test path changes
- Modify: root `package.json` only if the stable verifier command name changes

**Interfaces:**
- Consumes: real Session/finalize, verified Package, BNA-4 Runtime and installed Havok.
- Produces: one deterministic evidence result for 0.25m pass, 0.5m block, ledge departure, Reset replay and cleanup.

- [x] **Step 1: Replace the hand-built fixture with the real Session RED**

Build one Module using `createBabylonNativeBlockProfileSessionV1`, `step` blocks, a relative 0.5m `half` blocker, explicit selections and one finalize. Remove manual records/Layout/Check calls. Assert every proxy is an 8-vertex/12-triangle axis-aligned Box and inventory exactly equals selections; assert no ramp/wedge/hidden collider exists.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run scripts/verification/bwb4-block-collider-runtime.test.ts
```

Expected: FAIL until fixture/package/runtime inputs use the integrated settlement chain.

- [x] **Step 3: Add fixed-Tick traversal assertions**

Assert:

```text
spawn: movementMedium ground
0.25m riser: crossed and elevated while still ground
0.5m relative blocker: cannot cross after bounded long input
reset/rebind: same committed projection hash
side ledge: movementMedium air below the platform
dispose: every native collider Mesh and Engine disposed
```

Also run two admissions and two Package builds, requiring equal Contribution/hash and Package root/build identity.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/runtime-contracts/src/native-scene-contribution.test.ts \
  packages/world-package/src/package-build.test.ts \
  packages/runtime-babylon/src/runtime.test.ts \
  scripts/verification/bwb4-block-collider-runtime.test.ts
pnpm typecheck
pnpm test:census
git diff --check
```

Expected: all exit 0.

- [x] **Step 5: Commit**

```bash
git add packages scripts package.json
git commit -m "test(block-profile): prove true steps through Havok"
```

---

### Task 9: BWS-60 — Exact-SHA closure, review, truth update and merge

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`
- Modify: `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Create: `docs/reviews/2026-08-31-babylon-block-settlement-and-step-closure-review.md`
- Modify: this plan checkboxes and final evidence section

**Interfaces:**
- Consumes: pushed exact product SHA and all focused evidence.
- Produces: independent GO/NO-GO, accepted PR/main ancestry, truthful BWB-3/4 and BWB-5 prerequisite status.

- [x] **Step 1: Freeze and push the product SHA**

Run:

```bash
git status --porcelain
git diff --check
git push -u origin codex/bwb-settlement-integration
git rev-parse HEAD
git rev-parse @{upstream}
```

Expected: clean status and equal full SHAs.

- [x] **Step 2: Dispatch two exact-SHA Cursor Cloud agents**

Agent A runs install, self-check, typecheck, studio, independent, root test, production builds, census, Native/BNA clean breaks, unreleased clean break, workspace boundaries, BWB-3 capture and real BWB-4/Havok verifier. Agent B performs independent Mode B + runtime-deep review of settlement authority, Mesh drift/census, Package replay, Profile identity and step traversal. Docker/BNA-5 container evidence is not rerun unless BNA-5 inputs changed.

Expected: both inspect the exact pushed SHA; neither edits code.

- [x] **Step 3: Adjudicate findings**

For each P0/P1/P2, reproduce with a behavior RED before editing. Fix only confirmed defects, run the focused affected gate, commit/push, and dispatch fresh exact-SHA agents. No GO with an open P2.

- [x] **Step 4: Write the final review and update truth**

Record exact base/product/docs/main SHAs, contribution/profile identities, settlement authority map, Mesh inventory/drift evidence, step geometry, Havok movement results, cleanup, Cloud Agent/Run IDs, D1-D6 and explicit non-claims. Mark BWB-3 and BWB-4 complete only if the integrated chain is GO. Mark only the stair prerequisite of BWB-5 complete; mountain/T-space/building/limited-interior Corpus remains open.

- [ ] **Step 5: Commit docs and merge**

```bash
git add docs
git commit -m "docs(block-profile): record settlement acceptance"
git push
gh pr create --base main --head codex/bwb-settlement-integration \
  --title "Close Babylon block settlement and true steps" \
  --body-file /tmp/bwb-settlement-pr-body.md
gh pr merge --merge --delete-branch
git fetch origin main
bws_product_sha=$(git rev-parse HEAD^)
bws_docs_sha=$(git rev-parse HEAD)
git merge-base --is-ancestor "$bws_product_sha" origin/main
git merge-base --is-ancestor "$bws_docs_sha" origin/main
```

Expected: both ancestry commands exit 0. Required failing branch protection is never bypassed; queued optional GitHub CI does not replace exact-SHA Cloud evidence.

---

## Plan Self-Review Matrix

| Spec requirement | Task |
| --- | --- |
| BNA-5 main ancestry and BWB-3/4 input preservation | Task 0 |
| Profile/trust identity clean break | Task 1 |
| required persistent opaque receipt | Task 2 |
| Host-private recorder and import boundary | Task 3 |
| post-build drift and Scene membership census | Task 4 |
| one Layout / one finalize / visual + proxy integration | Task 5 |
| Contribution/WorldPackage/Runtime replay binding | Task 6 |
| anisotropic grid and true `step` | Task 7 |
| real Havok pass/block/reset/ledge/cleanup | Task 8 |
| exact-SHA gates, review, docs and main merge | Task 9 |
