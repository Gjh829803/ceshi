# Agent-friendly Babylon Native Block Drawing API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace create-then-mutate Profile Block placement with one atomic positioned Block API plus one deterministic dense Grid helper, without adding a package, Scene Source, DSL, Compiler, or Runtime owner.

**Architecture:** Extend the existing `@whitebox-world/native-babylon-block-profile` Session. The Session preflights identity, metric placement, occupancy and budget before allocation; Finalize remains the authoritative checked-epoch and explicit Collider boundary. All active consumers and the Builder Skill move in one current-only clean break.

**Tech Stack:** TypeScript, Babylon.js 9.23.0, Vitest, pnpm workspace, existing Native Block Profile and Native source-admission gates.

**Spec:** `docs/superpowers/specs/2026-09-02-agent-friendly-babylon-native-block-drawing-api-design.md`

## Global Constraints

- Keep exactly two mutually exclusive Scene Sources: Canonical JSON and Babylon Native.
- Add no workspace package and no Native-specific Runtime, Physics, Gameplay, Camera or Package core.
- `createBlock()` requires `centerMetersXYZ`; no old overload, alias, fallback or implicit origin survives.
- `createBlockGrid()` is dense mechanical repetition only; no semantic mountain/building/stair/level recipes.
- Grid never creates Collider intent; `finalize().staticColliders` remains explicit.
- Do not scan Scene/Mesh names, tags, materials or colors for collision or semantic identity.
- Preserve immutable historical Packages/Receipts; regenerated source receives new authored-source,
  Attempt, Package and Receipt identities through existing owners.
- Development runs focused RED/GREEN plus typecheck. Run heavy exact-SHA gates once at WRC-API-90.

---

### Task 1: Freeze the current-only public type surface

**Files:**
- Modify: `packages/native-babylon-block-profile/src/api-type.test.ts`
- Modify: `packages/native-babylon-block-profile/src/session.test.ts`
- Modify: `packages/native-babylon-block-profile/src/package-boundary.test.ts`

**Interfaces:**
- Consumes: existing `BabylonNativeBlockShapeKindV1`, `BabylonNativeBlockPaletteRoleV1`, `BabylonNativeBlockPositionMetersXYZV1`.
- Produces: `BabylonNativeBlockRotationQuarterTurnsYV1`, required positioned `BabylonNativeBlockCreateInputV1`, `BabylonNativeBlockGridCreateInputV1`, and `BabylonNativeBlockProfileSessionV1.createBlockGrid()`.

- [ ] **Step 1: Write compile-time RED assertions for the exact interfaces**

```ts
expectTypeOf<BabylonNativeBlockCreateInputV1>().toEqualTypeOf<Readonly<{
  id: string;
  shape: "full" | "half" | "quarter" | "small" | "step";
  paletteRole: BabylonNativeBlockPaletteRoleV1;
  centerMetersXYZ: readonly [number, number, number];
  rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
  visualGroupId?: string;
}>>();

expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlockGrid"]>()
  .parameter(0)
  .toEqualTypeOf<Readonly<BabylonNativeBlockGridCreateInputV1>>();
```

- [ ] **Step 2: Add runtime RED cases proving closed input and pre-allocation rejection**

Cover missing position, unknown fields, sparse tuples, accessor fields, NaN/Infinity, invalid quarter-turn,
shape-specific residue, duplicate ID, occupied cell and budget overflow. Assert the Candidate Scene Mesh count
does not increase for every rejected preflight.

- [ ] **Step 3: Run the RED tests**

Run:

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/package-boundary.test.ts
```

Expected: fail because the required placement fields and Grid method do not exist.

- [ ] **Step 4: Commit the RED contract checkpoint**

```bash
git add packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/package-boundary.test.ts
git commit -m "test(block-profile): freeze atomic drawing api"
```

### Task 2: Implement atomic positioned Block creation

**Files:**
- Modify: `packages/native-babylon-block-profile/src/shapes.ts`
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `packages/native-babylon-block-profile/src/layout.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Test: `packages/native-babylon-block-profile/src/session.test.ts`
- Test: `packages/native-babylon-block-profile/src/layout.test.ts`

**Interfaces:**
- Consumes: Task 1 public types and existing shape/grid functions.
- Produces: an atomic `createBlock(input)` that applies and records exact center and quarter-turn before returning one `Mesh`.

- [ ] **Step 1: Add the closed rotation type and placement parser**

Export `BabylonNativeBlockRotationQuarterTurnsYV1 = 0 | 1 | 2 | 3`. Parse an ordinary dense
`centerMetersXYZ`, canonicalize negative zero, default an absent `rotationQuarterTurnsY` to `0`, and call
`babylonNativeBlockCenterAlignsToGridV1()` before allocation.

- [ ] **Step 2: Reserve ID, budget and occupied cells before Mesh allocation**

Use `babylonNativeBlockOccupiedMicroCellKeysV1()` to reject conflicts against Session-owned cells. Do not
create a second Layout DTO; store the canonical create input with the existing Session record.

- [ ] **Step 3: Apply the declared transform and make acquisition rollback atomic**

Set `mesh.position` from `centerMetersXYZ` and `mesh.rotation.y` from the quarter-turn. If geometry snapshot
or record publication fails, dispose the Mesh and release the proposed ID/cells. A cleanup throw moves the
Session to `failed`.

- [ ] **Step 4: Verify Finalize rejects transform drift**

Extend Layout/Session checks so a caller changing position, rotation, scale, parent, enabled state or geometry
after `createBlock()` cannot silently create a second placement dialect.

- [ ] **Step 5: Run focused GREEN tests**

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/shapes.test.ts \
  packages/native-babylon-block-profile/src/layout.test.ts \
  packages/native-babylon-block-profile/src/session.test.ts
```

Expected: positioned creation, asymmetric rotated quarter, rollback and tamper cases pass.

- [ ] **Step 6: Commit positioned creation**

```bash
git add packages/native-babylon-block-profile/src/{shapes,session,layout,index}.ts \
  packages/native-babylon-block-profile/src/{api-type,shapes,session,layout}.test.ts
git commit -m "feat(block-profile): create blocks at declared transforms"
```

### Task 3: Implement deterministic dense Grid creation

**Files:**
- Modify: `packages/native-babylon-block-profile/src/session.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Test: `packages/native-babylon-block-profile/src/session.test.ts`
- Test: `packages/native-babylon-block-profile/src/api-type.test.ts`

**Interfaces:**
- Consumes: atomic internal Block creation from Task 2.
- Produces: `createBlockGrid(input): readonly Mesh[]` with complete preflight and reverse rollback.

- [ ] **Step 1: Add RED cases for deterministic derivation**

Assert IDs use `<idPrefix>-x0-y0-z0`, positions use effective rotated shape size, order is Y/Z/X, and a
rotated `quarter` swaps X/Z spacing. Add count multiplication overflow, whole-batch budget, existing ID/cell
conflict, internal conflict, mid-batch Mesh failure, rollback cleanup failure, Finalize-closed and Dispose-closed
cases.

- [ ] **Step 2: Implement whole-Grid preflight without calling public `createBlock()` in a partial loop**

Derive canonical child inputs first, check every ID/cell and the aggregate budget, then allocate. The public
method must create zero Meshes for any preflight rejection.

- [ ] **Step 3: Implement batch commit and reverse rollback**

Commit all child records only after successful construction. On a later allocation failure, dispose created
Meshes in reverse order and release all batch-owned identity/occupancy state. Leave Session `open` only when
cleanup succeeds.

- [ ] **Step 4: Prove one-cell equivalence**

Create equivalent Sessions using `createBlock()` and a one-cell `createBlockGrid()`. Finalize both and assert
equal canonical Layout/Contribution identity after normalizing the intentionally different Block ID.

- [ ] **Step 5: Run focused GREEN tests**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/api-type.test.ts
```

- [ ] **Step 6: Commit Grid creation**

```bash
git add packages/native-babylon-block-profile/src/session.ts \
  packages/native-babylon-block-profile/src/index.ts \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/api-type.test.ts
git commit -m "feat(block-profile): add atomic dense block grids"
```

### Task 4: Perform the current-only consumer and Skill cutover

**Files:**
- Modify: every active result of `rg -l 'createBlock\\(' packages scripts apps .codex/skills/worldkit-native-block-builder`
- Modify: `.codex/skills/worldkit-native-block-builder/SKILL.md`
- Modify: `.codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md`
- Modify: `scripts/agents/native-block-builder-skill.test.ts`
- Test: `scripts/native-scene/source-admission.test.ts`
- Test: `scripts/native-scene/module-bundle.test.ts`
- Test: `scripts/reconstruction/native-package.test.ts`

The fresh `rg` result is the authoritative consumer set. The explicit files below are named integration
anchors, not an exhaustive replacement for that census.

**Interfaces:**
- Consumes: Tasks 2 and 3 public API.
- Produces: one active Profile placement dialect across examples, fixtures, Corpus and generated-module instructions.

- [ ] **Step 1: Inventory every active create-then-position/rotation site**

```bash
rg -n 'createBlock\\(|\.position\.(?:set|copyFrom)|\.rotation\.y' \
  packages/native-babylon-block-profile scripts apps \
  .codex/skills/worldkit-native-block-builder
```

Classify each result as Profile Block placement, later visual-only Babylon mutation, or unrelated code.

- [ ] **Step 2: Migrate Profile consumers atomically**

Put `centerMetersXYZ` and optional `rotationQuarterTurnsY` into each `createBlock()` call. Replace only dense
same-shape/same-role rectangular repetition with `createBlockGrid()`; retain semantic topology loops as plain
TypeScript. Delete local helpers whose only responsibility was create-then-position/quarter-turn.

- [ ] **Step 3: Replace the Builder Skill example and hand-calculation placement dialect**

Keep the shape table, volumetric reconstruction rules, collision budget, scripted traversal envelope and
forbidden ownership. Replace create-then-mutate examples with the exact new API. Explain Grid only as dense
mechanical repetition; continue prohibiting semantic recipes and automatic Collider inference.

- [ ] **Step 4: Add a clean-break census assertion**

Extend the Skill/package tests to reject Profile examples or fixtures that call `createBlock()` without
`centerMetersXYZ`, or mutate the returned Profile Mesh position/Y rotation for initial placement. Do not
globally ban ordinary Babylon Mesh transforms.

- [ ] **Step 5: Run consumer and Skill gates**

```bash
pnpm exec vitest run packages/native-babylon-block-profile
pnpm check:native-block-builder-skill
pnpm exec vitest run \
  scripts/native-scene/source-admission.test.ts \
  scripts/native-scene/module-bundle.test.ts \
  scripts/reconstruction/native-package.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit the clean break**

```bash
git add packages scripts apps .codex/skills/worldkit-native-block-builder
git commit -m "refactor(block-profile): cut over drawing consumers"
```

### Task 5: Refresh authored-source identity and production fixture closure

**Files:**
- Modify: active representative generated-module fixtures and Case inputs only where they teach or embed
  the replaced placement dialect
- Test: `scripts/reconstruction/native-package.test.ts`
- Test: `scripts/verification/native-block-reconstruction-e2e.test.ts`

**Interfaces:**
- Consumes: the fully migrated API and Skill.
- Produces: a new `authoredSourceHash` and therefore new Candidate, Package and Receipt identity through
  the existing production route. The published Profile descriptor hash is unchanged by this slice.

- [ ] **Step 1: Locate every active generated-source fixture using the old dialect**

Search source-admission, module-bundle, reconstruction and representative E2E fixtures. Record which inputs
embed generated Native Module source and distinguish them from immutable completed run artifacts.

- [ ] **Step 2: Add RED source and identity-closure coverage**

Prove a generated module using the replaced create-then-mutate dialect is rejected, while regenerated source
using the current API passes admission and produces a different `authoredSourceHash` and downstream Package
identity. Do not claim that TypeScript API source automatically changes the published Profile descriptor hash.

- [ ] **Step 3: Regenerate only active generated-source fixtures**

Use the existing source-admission and production Package owners. Do not edit `authoredSourceHash`, Package or
Receipt hashes by hand, do not rewrite historical Attempts, and do not add an alias accepting the old dialect.

- [ ] **Step 4: Run the production-focused closure**

```bash
pnpm exec vitest run scripts/reconstruction/native-package.test.ts
pnpm exec vitest run scripts/verification/native-block-reconstruction-e2e.test.ts
```

- [ ] **Step 5: Commit the identity checkpoint**

```bash
git add scripts/reconstruction/native-package.test.ts \
  scripts/verification/native-block-reconstruction-e2e.test.ts \
  <resolved-active-generated-source-fixture-paths>
git commit -m "chore(block-profile): refresh drawing source identity"
```

### Task 6: Final design truth, verification and integration

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: this spec and plan only if implementation evidence changes an accepted detail

**Interfaces:**
- Consumes: Tasks 1-5 exact implementation and evidence.
- Produces: one truthful WRC/BWB documentation state and final merge candidate.

- [ ] **Step 1: Repair documentation truth without changing WRC-1 package count**

Freeze `3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05` as the sole v2 migration source, retain `618d96b4`
as historical design evidence, and replace copied live status in the Native design with a link to `docs/18`.
BWB-6 is already closed on `main`; keep its historical implementation plan unchanged and register this work
only as a later Profile authoring enhancement.

- [ ] **Step 2: Record this feature as a BWB Profile enhancement**

Update `docs/18` with exact merged evidence. Do not add a 34th WRC-1 work package and do not mark BNA-6,
BNA-7, NBR-1 or WRC-1 complete from this helper alone.

- [ ] **Step 3: Run focused final gates once**

```bash
pnpm exec vitest run packages/native-babylon-block-profile
pnpm check:native-block-builder-skill
pnpm exec vitest run \
  scripts/native-scene/source-admission.test.ts \
  scripts/native-scene/module-bundle.test.ts \
  scripts/reconstruction/native-package.test.ts \
  scripts/verification/native-block-reconstruction-e2e.test.ts
pnpm typecheck
pnpm test:census
git diff --check
```

- [ ] **Step 4: Freeze the exact SHA and dispatch independent evidence**

Run Cursor Cloud affected/full gates and an independent Mode B plus runtime-deep review against the exact
clean commit. Any P0/P1 fix creates a new SHA and reruns only affected evidence before final integration.

- [ ] **Step 5: Merge the accepted current-only checkpoint**

Merge only when the exact-SHA evidence has zero open P0/P1, the branch is clean, and the public/API/Skill
censuses show no old placement dialect. Delete the remote feature branch after merge.
