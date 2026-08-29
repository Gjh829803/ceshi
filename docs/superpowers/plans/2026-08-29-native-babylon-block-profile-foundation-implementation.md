# Babylon Native Block Profile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement BWB-1 and BWB-2 as a Babylon-native, build-epoch-local block whitebox package with deterministic structural diagnostics, without restoring a persistent Block Manifest, Compiler, Three.js bridge, or Runtime physics owner.

**Architecture:** A Native Module creates real Babylon `Mesh` objects through a thin optional Profile session, then continues to use Babylon transforms, materials, and hierarchy directly. The session records only its own meshes for one Build Epoch, derives a canonical in-memory layout from their final world transforms, and releases that layout after `finalize()`. Finalization returns authoring diagnostics, metrics, and a visual-group inventory; it does not publish Runtime geometry or collision. BNA core Registration, BNA-3 Package identity, BNA-4 Havok admission, and BWB-3/BWB-4 integration remain separate owners.

**Tech Stack:** TypeScript 5.9.2, Babylon.js 9.23.0 Deep ESM imports, Vitest 3.2.4, pnpm 10.14.0.

**Spec:** `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`

**Upstream Spec:** `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`

## Global Constraints

- Implement only BWB-1 and BWB-2. Do not modify RuntimeHost, Runtime Babylon, Havok, Character, Camera, Input, Action, Capture, Canonical Authoring, Compiler, or Scene Source identity.
- The existing BNA-2 Foundation already freezes the narrow dependency required here: `BabylonNativeSceneBuildContextV1` and the Deep ESM Import Profile. This plan does not claim that BNA-2 production closure, BNA-3, or BNA-4 is complete.
- `@whitebox-world/native-babylon-block-profile` is optional and has one public root. It may depend directly only on `@babylonjs/core@9.23.0` and `@whitebox-world/native-babylon`.
- The public API may expose fixed shapes, grid constants, palette roles, one single-block helper, a Build-Epoch session, and authoring-only diagnostics/inventory. It must not expose `BlockWorldManifest`, a serializer/parser, a Compiler, high-level `createMountain/createBuilding/createLevel` helpers, a Host subpath, or a second Registration surface.
- `createBlock()` returns a real Babylon `Mesh`. Position, Y rotation, material, and parent hierarchy remain Babylon-native operations; finalization reads and validates the final world transform rather than keeping a competing transform authority.
- Finalized evidence is authoring-only. It contains no `Mesh`, `Scene`, `Engine`, `BuildContext`, Registration, Provider handle, Collider, traversal claim, or Runtime query API.
- Profile shape semantics are exact: `full=[1,1,1]`, `half=[1,0.5,1]`, `quarter=[0.5,0.5,1]`, `small=[0.5,0.5,0.5]`; micro grid `0.5m`; center lattice `0.25m`; world units meters; `+Y` up; only Y quarter-turn rotation; signed zero is canonicalized only when publishing evidence.
- The block-count budget is a required caller-provided hard cap. The Profile must never infer or increase it from requested block count.
- Structural route candidates and unsupported-block warnings are authoring diagnostics only. They must not claim Character passability, `checkSupport()`, Route/Nav evidence, formal Capture, indoor support, or automatic pathfinding.
- Port behavior from `codex/block-world-sdk-v2@618d96b4e297d90d13ee6d1bf9be1e0b83423dbe` only after a new-owner RED test. Do not cherry-pick the branch or copy its DTO, Preset, Manifest, Compiler, Three binding, Runtime, hidden foundation, or second ground sampler.
- Each implementation task follows RED -> observed expected failure -> minimal GREEN -> refactor. Add every new test to `scripts/lib/test-gate-manifest.ts` in the `contract` lane.
- Task commits may be incomplete on this feature branch, but the BWB-1/BWB-2 checkpoint is accepted only when the final tree has one API, no compatibility aliases, clean test census, clean diff, and an explicit review that keeps BWB-3+ open.

---

### Task BWB12-00: Freeze the migration and export census

**Goal and deliverable:** Freeze one executable BWB-1/BWB-2 plan and the exact old-branch allow/reject matrix.

**depends_on:** BWB-0 accepted design and the completed BNA-2 Foundation core BuildContext/Import Profile checkpoint.

**blocks:** BWB1-10, BWB1-20, BWB2-10, BWB2-20, BWB12-90.

**Exclusive ownership:** This plan and migration census only; no source or Runtime owner.

**Integration point:** Durable project planning authority under `docs/superpowers/plans/`.

**Verification evidence:** Branch/base census, fixed-source inspection, `git diff --check`.

**Execution mode:** `main-agent-only`.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-29-native-babylon-block-profile-foundation-implementation.md`
- Read only: `packages/native-babylon/**`
- Read only: `codex/block-world-sdk-v2@618d96b4e297d90d13ee6d1bf9be1e0b83423dbe:packages/block-world/**`

**Interfaces:**
- Consumes: accepted BWB design, installed BNA root API, and the fixed old-branch algorithm source.
- Produces: this exact task graph and a zero-ambiguity migration boundary.

- [x] **Step 1: Verify the branch and dependency boundary**

Run `git status --short --branch`, verify the branch starts from current `main`, and confirm the old branch is used only through `git show`/`git ls-tree`.

- [x] **Step 2: Record the only migrated mechanics**

The permitted mechanics are shape dimensions, effective dimensions under Y quarter turns, `0.25m`/`0.5m` quantization, occupied micro-cell enumeration, deterministic ordering, overlap detection, exposed top-surface/boundary derivation, and structural adjacency. Everything else is rejected.

- [x] **Step 3: Commit the executable plan**

Run `git diff --check`, then commit this plan alone:

```bash
git add docs/superpowers/plans/2026-08-29-native-babylon-block-profile-foundation-implementation.md
git commit -m "docs: plan native Babylon block profile foundation"
```

---

### Task BWB1-10: Create the package, fixed shape/grid contract, and public export gate

**Goal and deliverable:** Create the optional package root and freeze the four shapes, meter grid, palette roles, dependency boundary, and public-export ceiling.

**depends_on:** BWB12-00.

**blocks:** BWB1-20 and every later BWB task.

**Exclusive ownership:** Package manifest, root exports, shape/grid/profile constants, and package-boundary tests. It does not own BuildContext, Registration, Runtime, or visual materials.

**Integration point:** Native Module imports the optional package root alongside `@whitebox-world/native-babylon`.

**Verification evidence:** API/type tests, exact export/dependency census, shape/lattice fixtures, lockfile and test-census gates.

**Execution mode:** `sequential`.

**Files:**
- Create: `packages/native-babylon-block-profile/package.json`
- Create: `packages/native-babylon-block-profile/src/index.ts`
- Create: `packages/native-babylon-block-profile/src/profile.ts`
- Create: `packages/native-babylon-block-profile/src/shapes.ts`
- Create: `packages/native-babylon-block-profile/src/shapes.test.ts`
- Create: `packages/native-babylon-block-profile/src/package-boundary.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `BABYLON_NATIVE_BLOCK_PROFILE_REF_V1`, `BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1`, `BABYLON_NATIVE_BLOCK_MICRO_GRID_METERS_V1`, `BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_V1`, `BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1`, `BabylonNativeBlockShapeKindV1`, `BabylonNativeBlockPaletteRoleV1`, and pure package-local shape/lattice mechanics.
- The public palette-role union is exactly `ground | route | structure | hazard | water-like-visual | background-mass`.

- [x] **Step 1: Write package-boundary and shape RED tests**

Assert the exact package name, exact direct dependencies, one `.` export, Deep ESM imports only, no Host/Runtime/Havok/Compiler/Three/DOM/Node/network dependency, and no production identifier containing `Manifest`, `Compiler`, `Preset`, `serialize`, `createMountain`, `createBuilding`, or `createLevel`. Assert all four dimensions, rotated `quarter` dimensions, valid/invalid center-lattice placements, occupied micro-cell keys, and signed-zero canonicalization at evidence publication.

- [x] **Step 2: Run RED**

```bash
pnpm vitest run packages/native-babylon-block-profile/src/package-boundary.test.ts packages/native-babylon-block-profile/src/shapes.test.ts
```

Expected: FAIL because the package does not exist.

- [x] **Step 3: Implement the minimal package and pure mechanics**

Keep occupancy and bounds types package-local. Public exports contain only the fixed Profile facts and the session/report API introduced by later tasks; do not export a block array or a generic scene document.

- [x] **Step 4: Update lock/test census, verify GREEN, and commit**

```bash
pnpm install --lockfile-only
pnpm vitest run packages/native-babylon-block-profile/src/package-boundary.test.ts packages/native-babylon-block-profile/src/shapes.test.ts
pnpm test:census
pnpm typecheck
```

Commit `feat(native): add Babylon block profile contract`.

---

### Task BWB1-20: Implement the one-Epoch Babylon Mesh session

**Goal and deliverable:** Implement one isolated Build-Epoch session and the single-block helper that returns a real Babylon `Mesh` while leaving transforms and hierarchy Babylon-native.

**depends_on:** BWB1-10.

**blocks:** BWB2-10 and BWB2-20.

**Exclusive ownership:** Session lifecycle, block-definition validation, block-count budget, and session-owned Mesh tracking. It does not own BNA Registration, materials, capture, or persistent layout.

**Integration point:** `defineBabylonNativeScene(...).build(context)` creates the session and finalizes it before the Build Promise settles.

**Verification evidence:** NullEngine Mesh/type tests, exact-input/budget failures, two-session isolation, finalize closure, test-census and typecheck gates.

**Execution mode:** `sequential`.

**Files:**
- Create: `packages/native-babylon-block-profile/src/session.ts`
- Create: `packages/native-babylon-block-profile/src/session.test.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Produces `createBabylonNativeBlockProfileSessionV1(context, budget)`, `BabylonNativeBlockProfileSessionV1`, `BabylonNativeBlockDefinitionV1`, and `BabylonNativeBlockProfileBudgetV1`.
- `budget` has exactly `maximumBlockCount` as a non-negative safe integer.
- `createBlock({ id, shape, paletteRole, visualGroupId? })` returns a Babylon `Mesh`. The caller sets Babylon transforms/material/parent directly.
- `finalize()` closes the session and returns the report frozen in BWB2-20. Repeated finalization returns the same object; creation after finalization fails with a stable error code.

- [ ] **Step 1: Write lifecycle and Babylon-object RED tests**

Use `NullEngine` and `Scene`. Prove the helper returns `Mesh`, creates exact geometry in `context.scene`, permits native position/Y-rotation/material/parent changes, rejects wrong Profile ref, duplicate/non-canonical IDs, unknown keys, unknown shape/palette, over-budget creation before Mesh allocation, disposed Scene, and creation after finalization. Prove two sessions do not share IDs or mutable layout.

- [ ] **Step 2: Run RED**

```bash
pnpm vitest run packages/native-babylon-block-profile/src/session.test.ts
```

Expected: FAIL because the session API does not exist.

- [ ] **Step 3: Implement the minimal session**

Use `MeshBuilder.CreateBox` from the frozen Deep ESM path. Track only meshes created through this session. Do not scan `scene.meshes`, mutate BNA Registration, create a material/camera/light/physics object, or retain finalized layout queries.

- [ ] **Step 4: Verify GREEN and commit**

Run the session, shape, package-boundary tests, `pnpm test:census`, and `pnpm typecheck`. Commit `feat(native): add block profile build session`.

---

### Task BWB2-10: Derive canonical world layout, occupancy, top surfaces, boundaries, and slope inputs

**Goal and deliverable:** Derive one package-private canonical layout from final Babylon world transforms and implement deterministic structural geometry mechanics.

**depends_on:** BWB1-20.

**blocks:** BWB2-20, BWB-3, and BWB-4.

**Exclusive ownership:** Package-private final-transform extraction, occupancy, support observation, top-surface, boundary, and structural transition algorithms. It does not own report publication, collision, Havok, Route, or Runtime support.

**Integration point:** Session finalization calls the package-private derivation exactly once.

**Verification evidence:** Asymmetric transform, lattice, overlap, support, boundary, transition, order-determinism, and invalid-parent fixtures.

**Execution mode:** `sequential`.

**Files:**
- Create: `packages/native-babylon-block-profile/src/layout.ts`
- Create: `packages/native-babylon-block-profile/src/layout.test.ts`
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Package-private input: the session-owned `Mesh` plus stable block identity/shape/palette/group metadata.
- Package-private output: a canonical, frozen, ID-sorted Build-Epoch layout containing final world center, effective dimensions, occupied micro cells, exposed top cells, boundary segments, structural half-meter height transitions, and support observations.
- No layout type or query is exported from the package root.

- [ ] **Step 1: Write final-world-transform RED tests**

Cover asymmetric `quarter` rotation, valid nested `TransformNode` parent transforms, negative coordinates, signed zero, stable output under creation-order changes, disposed/foreign Mesh, non-unit world scale, X/Z tilt, non-quarter Y rotation, off-lattice center/bounds, and parent-induced invalid transforms.

- [ ] **Step 2: Write occupancy/boundary/slope RED tests**

Cover exact face-touching without overlap, partial and full overlap, stacked blocks, an unsupported block, exposed top cells, a closed four-sided plateau, a one-half-meter structural transition, and a one-meter discontinuity that is not silently called a traversable slope.

- [ ] **Step 3: Run RED, then port only proven pure mechanics**

```bash
pnpm vitest run packages/native-babylon-block-profile/src/layout.test.ts
```

Use the fixed old branch only to cross-check shape/bounds/occupancy behavior. Implement Babylon world-transform extraction with Babylon math APIs and keep all topology algorithms deterministic and package-local.

- [ ] **Step 4: Verify GREEN and commit**

Run all package tests plus `pnpm typecheck`. Commit `feat(native): derive block profile structural layout`.

---

### Task BWB2-20: Publish closed authoring diagnostics, metrics, and visual-group inventory

**Goal and deliverable:** Publish the sole authoring-only structural result for one finalized session, with closed diagnostics, metrics, and visual-group inventory.

**depends_on:** BWB1-10, BWB1-20, and BWB2-10.

**blocks:** BWB-3, BWB-4, BWB-5, and BWB12-90.

**Exclusive ownership:** Profile-local diagnostic/result types, deterministic report construction, metrics, and visual-group evidence. It does not own Native core diagnostics, formal Capture, collider identity, Gameplay entities, or passability.

**Integration point:** `BabylonNativeBlockProfileSessionV1.finalize()` returns the frozen authoring result before Native Build settlement.

**Verification evidence:** Closed-result/parser matrix, deterministic ordering, negative corpus, handle-absence census, and lifecycle release tests.

**Execution mode:** `sequential`.

**Files:**
- Create: `packages/native-babylon-block-profile/src/check.ts`
- Create: `packages/native-babylon-block-profile/src/check.test.ts`
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Produces `BabylonNativeBlockProfileDiagnosticV1`, `BabylonNativeBlockProfileCheckResultV1`, `BabylonNativeBlockProfileMetricsV1`, and `BabylonNativeBlockVisualGroupInventoryV1`.
- Diagnostic location is a closed union: `none | block(blockId) | visual-group(visualGroupId)`; no arbitrary `details` bag.
- Errors include overlap, invalid final Mesh transform/lifecycle, disconnected structural route candidate, and missing visual group for a grouped visual role. Unsupported blocks are warnings because floating visuals may be intentional and do not imply Runtime support.
- Metrics include block count/by shape/by palette role, occupied cell count, exposed top-cell count, boundary-segment count, structural half-meter transition count, unsupported-block count, structural route-component count, and visual-group count.
- Visual-group inventory contains stable group ID, sorted block IDs, palette roles, and metric world bounds; it contains no Babylon handles.

- [ ] **Step 1: Write closed report RED tests**

Assert deep freezing, deterministic diagnostic/group ordering under reversed creation order, `passed` with warnings, `rejected` with errors, overlap locations, missing group, disconnected route candidates, group bounds, exact metrics, and absence of `Mesh`, `Scene`, Registration, Collider, `traversalSurfaceId`, `BlockWorldManifest`, or serialized layout fields.

- [ ] **Step 2: Run RED**

```bash
pnpm vitest run packages/native-babylon-block-profile/src/check.test.ts
```

Expected: FAIL because report publication does not exist.

- [ ] **Step 3: Implement minimal finalization**

Finalization derives layout once, creates the closed report, releases internal occupancy/topology maps, and returns the same frozen report on repeated calls. It must not call core Registration or infer collision from palette/material/name.

- [ ] **Step 4: Verify GREEN and commit**

Run all package tests, `pnpm test:census`, `pnpm typecheck`, and `git diff --check`. Commit `feat(native): add block profile structural checker`.

---

### Task BWB12-90: Integration review and truthful handoff

**Goal and deliverable:** Decide the BWB-1/BWB-2 checkpoint on one exact tree and hand off explicit open dependencies to later BNA/BWB tasks.

**depends_on:** BWB1-10, BWB1-20, BWB2-10, and BWB2-20.

**blocks:** Any claim that BWB-1/BWB-2 are complete and the next BWB-3/BWB-4 implementation plans.

**Exclusive ownership:** Final review, backlog truth, commit/push evidence, and scope disposition. It does not authorize Runtime or production capability changes.

**Integration point:** `docs/18-refactor-progress-and-backlog.md`, review authority, and the feature-branch handoff.

**Verification evidence:** Focused package suite, contract census/typecheck/workspace boundary, affected contract gate, diff/clean-tree check, and full-dimension change review.

**Execution mode:** `main-agent-only`.

**Files:**
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Create: `docs/reviews/2026-08-29-native-babylon-block-profile-foundation-review.md`
- Modify only implementation files required by reproduced defects; every defect receives a focused RED regression first.

**Interfaces:**
- Consumes: BWB1-10 through BWB2-20 on one exact tree.
- Produces: accepted/rejected BWB-1/BWB-2 checkpoint evidence and exact dependency handoff to BNA-3/BWB-3 and BNA-4/BWB-4.

- [ ] **Step 1: Run focused gates once on the final tree**

```bash
pnpm vitest run packages/native-babylon-block-profile/src
pnpm test:census
pnpm typecheck
pnpm verify:workspace-boundaries
```

- [ ] **Step 2: Run the affected contract gate**

Run `pnpm test:contract`. Do not run resource-heavy Havok/browser gates: this phase does not modify Runtime or claim visual/collider/passability evidence.

- [ ] **Step 3: Perform a change review**

Apply `docs/reviews/full-dimension-review-protocol.md` in change-review mode. Verify public export census, package boundaries, deterministic evidence, two-session isolation, disposed/throwing cleanup, old-branch rejection census, and no Runtime/physics/camera diff.

- [ ] **Step 4: Update implementation truth only**

Mark BWB-1 and BWB-2 complete only if all stated evidence passes. Keep BNA-2 production closure, BNA-3+, BWB-3+, visual reconstruction quality, Collider/Havok, passability, formal Capture, indoor capability, Route/Nav, and `goTo` open.

- [ ] **Step 5: Commit and push the checkpoint**

Run `git status --short`, `git diff --check`, commit the review/backlog truth, push `codex/native-babylon-block-profile`, and report exact commits and gates. Do not merge to `main` until this checkpoint and its dependency boundary are reviewed.
