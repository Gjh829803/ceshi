# BWB-4 Block Collider Contribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze and implement one Block Profile path from the already-checked, build-epoch-local Layout to explicit BNA-4 static Collider registration, then prove SDK-owned Havok support, step/slope/ledge behavior, determinism, reset, isolation, and cleanup without creating a second physics or scene authority.

**Architecture:** The Block Profile derives one `BabylonNativeBlockLayoutV1` and one `BabylonNativeBlockProfileCheckResultV1` during the existing finalization epoch. A BWB-4 adapter consumes that same in-memory Layout plus the exact session records and explicit surface selections, materializes separate ordinary no-gap Babylon `Mesh` candidates, and calls the existing `BabylonNativeSceneRegistrationV1.registerStaticCollider()` boundary. BNA-4 alone freezes `geometryHash`, `colliderSubshapeId`, `traversalSurfaceId`, WorldPackage Contribution identity, private collision Meshes, Havok bodies, support, and lifecycle; Profile metadata is build-only provenance joined by the author-facing collider `id`.

**Tech Stack:** Installed TypeScript 5.9.3, Babylon.js 9.23.0 Deep ESM imports, Havok 1.3.14 through the existing Runtime, Vitest 3.2.7, pnpm 10.14.0.

**Spec:** `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`

**Upstream Specs:**

- `docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md`
- `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`

**Source baseline inspected for this plan:** `main@14ba724b5660be9d47d90b374cc6ffeae8909e55`, the merge of PR #57. All symbols and gaps below were rechecked against that tree rather than copied from an older review.

## Global Constraints

- BWB-4 is `main-agent-only` at every architecture, session-finalization, Runtime/Havok integration, and final-review boundary. A worker may prepare isolated tests or fixtures only after the main Agent freezes the exact interfaces named below.
- Do not modify `packages/runtime-babylon` production code, `packages/native-babylon` core Registration/admission code, `packages/runtime-contracts` Schema, RuntimeHost, Gameplay, CharacterMovement, Character BodyPort, `checkSupport()`, Camera, Action, Input, fixed Tick, Snapshot, Reset, Replay, or Rollback to make Block Profile integration pass.
- Do not add a Native-specific Runtime/package, a persistent Block Layout/Manifest, a Block Compiler, a second Traversal Contribution, a profile-owned Havok body, a hidden foundation, a height sampler, a Mesh-name/material/color inference path, or a compatibility alias.
- The one durable physics fact is `BabylonNativeSceneContributionV1` frozen by BNA core and exact-matched through the verified WorldPackage. The Profile's Layout, records, selections, and visual/proxy inventory are one-Build-Epoch inputs/evidence only.
- The only traversal input dialect is the current closed `BabylonNativeTraversalBindingV1`: either `{ kind: "not-traversable" }` or `{ kind: "static-surface", surfaceEntityId, logicalSubshapeId, traversalSurfaceProfileRef }`. Profile code never accepts or calculates `traversalSurfaceId`.
- `worldkit://traversal-surface-profile/ground.static@1` is the only current walkable Profile. BNA-4 resolves its exact Registry Lock and the controlled Subject's `collider.maxSlopeDegrees`; colors and `paletteRole` never imply walkability.
- Use `===` / `!==` for equality and lodash `isNil` / `isEmpty` for nil/empty checks. Do not duplicate Babylon vector/matrix/mesh math already provided by the installed engine.
- Each behavior change follows RED -> observed expected failure -> minimal GREEN. Run focused tests while editing; run the affected gate set once at the work-package checkpoint and exact-SHA Cloud gates/review only at BWB4-90.

---

## 1. Current source contract and identified gaps

### 1.1 Existing Layout input

`packages/native-babylon-block-profile/src/layout.ts` currently owns the package-private inputs that BWB-4 must consume:

```ts
export interface BabylonNativeBlockLayoutEntryV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: readonly [number, number, number];
  readonly rotationQuarterTurnsY: number;
  readonly sizeMetersXYZ: readonly [number, number, number];
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly occupiedMicroCellKeys: readonly string[];
}

export interface BabylonNativeBlockLayoutV1 {
  readonly blocks: readonly BabylonNativeBlockLayoutEntryV1[];
  readonly issues: readonly BabylonNativeBlockLayoutIssueV1[];
  readonly exposedTopSurfaceCellKeys: readonly string[];
  readonly boundarySegmentKeys: readonly string[];
  readonly structuralHalfMeterTransitionKeys: readonly string[];
  readonly unsupportedBlockIds: readonly string[];
}
```

`deriveBabylonNativeBlockLayoutV1(scene, records)` sorts by stable block ID, validates the final world transform and fixed geometry, and derives occupancy/top/boundary/support observations. BWB-4 must not call it a second time after BWB-3 has consumed another Layout.

`packages/native-babylon-block-profile/src/session.ts` currently derives that Layout exactly once inside `finalize()`, creates `BabylonNativeBlockProfileCheckResultV1`, clears `recordsById`, and returns only the check result. The root API intentionally does not export `BabylonNativeBlockLayoutV1` or `BabylonNativeBlockSessionRecordV1`.

### 1.2 Existing BNA-4 output boundary

`packages/native-babylon/src/module.ts` currently exposes exactly:

```ts
interface BabylonNativeSceneRegistrationV1 {
  registerSpawnMarker(marker: Readonly<BabylonNativeSpawnMarkerV1>): void;
  registerStaticCollider(
    collider: Readonly<{
      id: string;
      mesh: Mesh;
      traversalBinding: BabylonNativeTraversalBindingV1;
      frictionRatio?: number;
      restitutionRatio?: number;
    }>,
  ): void;
}
```

`packages/native-babylon/src/candidate-admission.ts` verifies that the Mesh is ordinary, alive, in the Candidate Scene, finite, indexed, non-Thin-Instanced, and has no provider-created `physicsBody`. It snapshots world-space vertices/indices, enforces Host budgets, calls `createBabylonNativeStaticColliderContributionV1()`, then rechecks geometry and binding after `module.build()` settles.

`packages/runtime-contracts/src/native-scene-contribution.ts` is the sole derivation owner for:

- `geometryHash` from canonical world-space positions and triangle indices;
- `colliderSubshapeId` from collider ID, geometry hash, and closed traversal binding; and
- `traversalSurfaceId` from collider subshape, surface entity, logical subshape, and locked Profile ref.

`registerStaticCollider()` deliberately returns `void`. Therefore Profile metadata may contain only the stable authoring join `colliderId -> sourceBlockIds/visualGroupIds/proxyKind`; it must not predict, clone, or publish core-derived hashes/IDs. The verified Contribution is joined later by exact `collider.id`.

`packages/runtime-babylon/src/babylon-world-runtime.ts` uses `createOwnedNativeCollisionMesh()` to reconstruct a private, invisible Mesh from frozen Contribution bytes, attaches core IDs through `nativeColliderMetadata()`, and creates one `PhysicsShapeMesh` plus mass-zero `PhysicsAggregate`. `packages/runtime-babylon/src/babylon-character-body-port.ts::nativeSurfaceIdentity()` reads those core-owned metadata fields for support. BWB-4 adds no second overlay or support query.

### 1.3 Main-Agent decision points before production edits

These are real gaps in the inspected source. BWB4-05 must close them in this plan before BWB4-10 starts; a worker must not silently choose an API.

1. **One-derivation finalization.** Current `finalize()` releases records before BWB-3 and BWB-4 adapters can consume the same Layout. Freeze one package-internal `finalizeBuildEpoch` coordinator with this order: derive Layout once -> create check once -> stop on rejected check -> call BWB-4 no-gap Collider adapter -> call BWB-3 display adapter with the same Layout/check/record object identities -> clear records in `finally`. Keep one public `finalize()` entry and do not export Layout.
2. **Explicit selection entry.** Freeze one build-epoch-local selection API before implementation. The recommended current-only shape is a session method that records closed selections by stable block ID before `finalize()`; `finalize()` performs all derivation and registration. Do not add selection fields to durable Bootstrap/WorldPackage/Authoring Schema.
3. **Display gap and settlement-time drift.** The BWB-3 visual adapter applies `displayGapMeters` through local Mesh scaling after Layout/check. Registering that display Mesh would put visual gaps into Havok and is forbidden. BWB-4 must materialize a separate ordinary, invisible, no-gap box proxy from the same checked Layout entry before BWB-3 styling. Existing BNA core rechecks the proxy after `module.build()` settles, but it cannot recheck that the source visual still matches the Layout plus the declared display gap. Before BWB-4 can close its visual/proxy drift claim, the main Agent must approve a BNA-owned build-settlement validator contract in a separate design/commit; BWB-4 must not add an unreviewed Registration callback or silently trust `finalize()` as the last Module statement.
4. **BWB-3 interface merge.** The parallel BWB-3 work owns only `babylon-visual-adapter.ts`, `babylon-visual-adapter.test.ts`, `authoring-capture.ts`, and `authoring-capture.test.ts`. Its adapter consumes package-private `layout`, `checkResult`, and `records` without re-derivation. Merge that contract before modifying `session.ts`; then perform one main-Agent integration commit for both adapters.
5. **One traversal-binding parser.** `parseBabylonNativeTraversalBindingInputV1()` currently lives in `packages/runtime-contracts/src/native-scene-contribution.ts` and is called by BNA Candidate admission, but `@whitebox-world/native-babylon` exports only the binding type. Profile selection cannot safely snapshot a mutable binding at selection time without either duplicating that parser or gaining one BNA-owned parse/snapshot entry. The main Agent must freeze a reuse path in the BNA owner and update its API/boundary tests in a separate prerequisite commit. Do not copy the closed binding parser into the Profile and do not add a permanent Profile -> runtime-contracts dependency merely to bypass the Native API boundary.
6. **One inventory publication path.** The proposed adapter can return visual/proxy provenance, but current public `finalize()` returns only `BabylonNativeBlockProfileCheckResultV1`; discarding the adapter result would make overlay/debug consumers impossible. The main Agent must freeze exactly one Build-Epoch-local publication path, its owner, consumer, Reset/dispose lifetime, and export shape. It may clean-break extend the sole Profile finalization result after reviewing every consumer, or keep a package-internal sink owned by the accepted capture/debug coordinator; it must not add a persistent Block Manifest, a second `finalizeCollider*()` API, a global registry, or an unread DTO. This plan does not select or add that Schema/API on behalf of the main Agent.

The frozen BWB-4 V1 baseline is one no-gap `layout-block-volume` proxy per explicit block selection. Smoothing/coalescing remains BWB-6. BWB4-05 cannot close until the main Agent freezes the BNA-owned settlement validator, one-parser traversal snapshot path, and one inventory publication path. This worker's accepted disposition is that BWB-4 does not claim a Profile-derived continuous slope or walkable step; it may cite the already-existing BNA-4 generic evidence only as upstream engine evidence.

### 1.4 2026-08-31 isolated worker handoff — accepted narrow evidence and remaining main-Agent prerequisite

The BWB-4 worker rechecked `main@14ba724b5660be9d47d90b374cc6ffeae8909e55`,
the installed Babylon.js `9.23.0` / Havok `1.3.14` paths, BWB-3 commit
`7fa5aed37faa32e1dd5ca246a424df1212a5ff2e`, and the current Candidate admission
implementation. The following disposition is frozen for integration; it is not a claim that
BWB4-05 or BWB-4 is complete:

1. The isolated adapter may prove deterministic no-gap proxy construction, strict local preflight,
   exact BNA Contribution/Surface metadata, flat support, an over-limit `0.5m` Block face, ledge
   departure, and Runtime-owned cleanup. It does not export the adapter or create a second Runtime
   support path.
2. `whitebox.blocks@1` places every Block boundary on the `0.5m` micro grid. Its current `full`,
   `half`, `quarter`, and `small` shapes therefore cannot express a Profile-derived `0.25m` step.
   The existing BNA-4 generic `0.2m`/`0.25m` step evidence remains valid upstream evidence but is
   not Block Profile evidence. A walkable Profile step or slope requires a separately reviewed
   continuous/ramp proxy contract or a current-only clean-break grid/shape change before BWB-5;
   BWB-4 must not fabricate that claim.
3. BWB-3 and BWB-4 integration remains one main-Agent commit after both isolated commits are
   available. `session.finalize()` must derive `layout` and `checkResult` once, pass the same object
   identities and record snapshot first to the Collider adapter and then to the visual adapter,
   retain the first failure, clear all maps in `finally`, and unwind any Profile-owned resources in
   reverse acquisition order while continuing after a throwing disposer. Candidate Scene cleanup
   remains Host-owned.
4. The Traversal Binding still needs one BNA-owned canonical snapshot/parser entry. Until it lands,
   the Profile adapter may require an already frozen binding and let current Candidate admission
   parse it, but it must not copy `parseBabylonNativeTraversalBindingInputV1()` or advertise complete
   preflight of malformed binding objects.
5. Visual/proxy drift after `session.finalize()` remains open because current
   `BabylonNativeSceneRegistrationV1` has only Spawn and Collider registration. The main-Agent-only
   BNA prerequisite must use a closed Host-snapshot target rather than a Module-supplied validation
   callback. An arbitrary `validate()` callback would let untrusted Native code self-attest. The
   minimum semantic direction is:

   ```ts
   interface BabylonNativeBuildSettlementTargetV1 {
     readonly id: string;
     readonly kind: "collider-source-visual";
     readonly colliderId: string;
     readonly mesh: Mesh;
   }

   interface BabylonNativeBlockProfileSettlementCapabilityV1 {
     registerSpawnMarker(...): void;
     registerStaticCollider(...): void;
     registerBuildSettlementTarget(
       target: Readonly<BabylonNativeBuildSettlementTargetV1>,
     ): void;
   }
   ```

   This is semantic pseudocode, not approval to expose a third raw method on the scene Module's
   general-purpose Registration object. BNA owns the exact public naming and must provide the target
   operation only through the Profile session/adapter capability selected for
   `whitebox.blocks@1`; scene Module code must not hand-write settlement targets. The Host snapshots
   geometry and world transform when the trusted Profile adapter registers the target; Native code
   supplies no verdict. The required call order is: derive and freeze one Layout identity -> register
   no-gap Collider -> apply BWB-3 visuals from that same Layout -> Profile adapter registers the
   complete source-visual target inventory bound to the frozen Layout identity -> Module build
   settles -> close all registration -> Host independently recomputes every retained visual target
   and Collider geometry/binding -> freeze Contribution -> publish. Targets are Build-Epoch-only and
   receive no Engine, Runtime, Havok, Camera, Gameplay, Input, Tick, or callback handle. When the
   Package/Profile selects `whitebox.blocks@1`, BNA Host must require the target inventory to match
   the Profile finalize Layout identity completely; a missing, extra, duplicated, or mismatched Block
   target fails closed rather than letting Module code skip the check.
6. The BNA prerequisite tests must cover duplicate/late/malformed targets, wrong-Scene/disposed/
   instanced target Meshes, missing target for a selected Block Collider, a source Block transform or
   geometry mutation after Profile finalization, stable target ordering, Module failure, and Candidate
   cleanup after target drift. The integrated Profile tests must additionally prove that the target
   Mesh belongs to the same `layout`/`checkResult`/records used by both adapters and that BWB-3's exact
   display-gap transform is applied before the Host snapshot. Palette-material settlement remains a
   separately named claim unless the BNA contract snapshots its exact evidence too.
7. The BWB-3 adapter at `7fa5aed37faa32e1dd5ca246a424df1212a5ff2e` scales each record Mesh
   by `(localSize - displayGapMeters) / localSize`. BWB-4 therefore must register an independent
   no-gap proxy before that visual scaling and freeze the proxy through BNA Contribution admission.
   Registering the record Mesh itself and then applying BWB-3 styling is forbidden and must fail the
   future settlement drift check. The isolated real-Havok verifier uses only exact `./testing`
   fixture/harness subpaths; those subpaths export no production-private DTO and the workspace
   boundary census must continue to prove zero production consumers.

The public `selectStaticCollider()` and inventory root exports remain deliberately deferred until the
single-finalize integration consumes them. Exporting unused DTOs from this isolated adapter commit
would create the exact split API that the project forbids.

---

## 2. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / exact input -> output | Evidence | Mode |
|---|---|---|---|---|---|---|
| BWB4-00 | Freeze this executable plan from current source | BWB-2, BNA-4 | BWB4-05..90 | this plan only; current symbols -> reviewed task graph | links, source census, `git diff --check` | `main-agent-only` |
| BWB4-05 | Merge BWB-3 contract and close the six decision points above | BWB4-00, BWB-3 contract | BWB4-10..90 | plan decision record + separately approved BNA prerequisite(s) + one finalization/inventory interface | API type RED, one-layout identity probe, one-parser proof, one-consumer proof, contradiction scan | `main-agent-only` |
| BWB4-10 | Build deterministic explicit block-volume Collider candidates | BWB4-05 | BWB4-20/30/40 | new Profile collider adapter; checked Layout + records + selections -> calls to core Registration + build-only provenance inventory | unit RED/GREEN, reversed order, asymmetric transforms, rejected check | `sequential` |
| BWB4-20 | Integrate one-derive finalization without exporting Layout | BWB4-10, merged BWB-3 | BWB4-30/40 | `session.ts`/root API; one session epoch -> visual + collider adapters -> one check result | exact call order, failure cutoff, release, two-session, type/export tests | `main-agent-only` |
| BWB4-30 | Close visual/proxy identity, drift, tamper, and BNA Candidate admission | BWB4-20 | BWB4-40/50 | Profile/BNA tests only; Profile module -> actual frozen Contribution | candidate IDs, post-registration drift, binding tamper, budget, Package exact-match cutoff | `main-agent-only` |
| BWB4-40 | Prove Spawn support and real Havok block/ledge behavior within the frozen Profile geometry | BWB4-30 | BWB4-50/90, BWB-5 | new root verification fixture/test only; verified Package -> existing RuntimeHost/Babylon/Havok session | support identity, 0.5m over-limit face, ledge departure, collider overlay identity; no Profile-derived step/slope claim | `main-agent-only` |
| BWB4-50 | Close cadence, Reset, dual-instance, and throwing cleanup evidence | BWB4-40 | BWB4-90 | integration tests only; exact Package -> deterministic lifecycle evidence | 30/60/120 hashes, provider reset, Host full reload, two hosts, partial/throwing dispose | `main-agent-only` |
| BWB4-90 | Affected gates, independent review, status, PR, and merge | BWB4-10..50 | BWB-5, BWB-6, WRC-EVT-1 | review/status only; exact SHA -> scoped GO/NO-GO | affected gates once, Cursor Cloud exact-SHA gates/review, ancestry | `main-agent-only` |

```text
BWB-2 + BNA-4 + BWB4-00
  -> BWB4-05
  -> BWB4-10
  -> BWB4-20
  -> BWB4-30
  -> BWB4-40
  -> BWB4-50
  -> BWB4-90
  -> BWB-5 / BWB-6 / WRC-EVT-1
```

---

## 3. Exclusive file ownership

### 3.1 BWB-4 implementation files

- Create: `packages/native-babylon-block-profile/src/collider-contribution.ts`
- Create: `packages/native-babylon-block-profile/src/collider-contribution.test.ts`
- Create: `scripts/verification/bwb4-block-collider-runtime.test.ts`
- Create: `packages/native-babylon-block-profile/src/testing.ts` with one exact test fixture factory
- Create: `packages/runtime-babylon/src/testing.ts` with the existing possession test harness only
- Modify: both owning package manifests to expose exact `./testing` subpaths and the Block Profile
  package-boundary test to freeze that testing surface
- Modify after BWB-3 contract merge, main Agent only:
  - `packages/native-babylon-block-profile/src/session.ts`
  - `packages/native-babylon-block-profile/src/session.test.ts`
  - `packages/native-babylon-block-profile/src/index.ts`
  - `packages/native-babylon-block-profile/src/api-type.test.ts`
  - `packages/native-babylon-block-profile/src/package-boundary.test.ts`
  - `scripts/lib/test-gate-manifest.ts`
- Create at closure: `docs/reviews/2026-08-31-bwb4-block-collider-contribution-review.md`
- Modify at closure only: `docs/18-refactor-progress-and-backlog.md`

No new dependency is required. `@whitebox-world/native-babylon-block-profile` already depends on `@babylonjs/core` and `@whitebox-world/native-babylon`; the latter exports `BabylonNativeTraversalBindingV1` and the Registration type needed by the adapter. The root verification test may import both the Block Profile and Runtime because both are already direct root dependencies. Do not place that cross-package test inside `runtime-babylon` and thereby create an unnecessary reverse/dev dependency.

The existing session factory continues to accept only `BabylonNativeSceneBuildContextV1` plus the Profile budget. BWB-4 passes `context.registration` to the package-private adapter; it must not add another Registration argument or second build context to the public factory.

### 3.2 Reserved BWB-3 files — do not touch

- `packages/native-babylon-block-profile/src/babylon-visual-adapter.ts`
- `packages/native-babylon-block-profile/src/babylon-visual-adapter.test.ts`
- `packages/native-babylon-block-profile/src/authoring-capture.ts`
- `packages/native-babylon-block-profile/src/authoring-capture.test.ts`

### 3.3 Forbidden production files

- `packages/native-babylon/src/module.ts`
- `packages/native-babylon/src/index.ts`
- `packages/native-babylon/src/candidate-admission.ts`
- `packages/runtime-contracts/src/native-scene-contribution.ts`
- `packages/runtime-babylon/src/babylon-world-runtime.ts`
- `packages/runtime-babylon/src/babylon-native-surface-admission.ts`
- `packages/runtime-babylon/src/babylon-character-body-port.ts`
- all `packages/runtime-host/**`, `packages/gameplay/**`, `packages/character-movement/**`, Camera/Action/Input/Compiler/Authoring Schema files
- `pnpm-lock.yaml` and production dependency declarations. The approved exact `./testing` export
  map additions above are test-boundary changes only and must not re-export production-private DTOs
  or gain a production consumer.

If a RED test requires changing a forbidden production file, stop and reopen the owner design. Do not patch around it in the Profile.

The settlement validator and one-parser traversal snapshot path are explicit BNA-owner prerequisites, not exceptions to this ownership list. If approved, they land as separately reviewed BNA commits with their own exact files and focused tests before BWB4-10; amend this plan to name those accepted commits rather than mixing the change into a Profile commit.

---

## 4. Frozen Profile-local contracts

Subject to BWB4-05 recording all six prerequisite decisions, freeze these package-local/public TypeScript contracts without adding serialized Schema:

```ts
export interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly blockId: string;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export interface BabylonNativeBlockColliderCandidateInventoryEntryV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string];
  readonly visualGroupIds: readonly string[];
  readonly proxyKind: "layout-block-volume";
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
}

export interface BabylonNativeBlockProfileSessionV1 {
  createBlock(input: Readonly<BabylonNativeBlockCreateInputV1>): Mesh;
  selectStaticCollider(
    input: Readonly<BabylonNativeBlockStaticColliderSelectionV1>,
  ): void;
  finalize(): BabylonNativeBlockProfileCheckResultV1;
}
```

The session signature above remains exact only if BWB4-05 chooses an accepted package-internal inventory sink. If it chooses a clean-break extension of the sole finalization result, BWB4-05 must amend this block with that exact type and update every current consumer before the first production commit. No implementation may discard the adapter inventory while claiming overlay/identity metadata support.

The internal adapter signature is exact:

```ts
function createBabylonNativeBlockColliderCandidatesV1(input: Readonly<{
  scene: Scene;
  buildEpochId: string;
  layout: BabylonNativeBlockLayoutV1;
  checkResult: BabylonNativeBlockProfileCheckResultV1;
  records: readonly BabylonNativeBlockSessionRecordV1[];
  selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  registration: BabylonNativeSceneRegistrationV1;
}>): readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
```

Behavior is closed:

- `selectStaticCollider()` validates and snapshots the ordinary object immediately but allocates no Mesh/physics and does not call Registration.
- `buildEpochId` is validated as the current session epoch and is used only to namespace private Candidate Mesh names/diagnostics; it never enters Contribution identity or Runtime state;
- selection `id` is the exact BNA author-facing collider ID; `blockId` references one Profile-created block in the same session;
- every block and collider ID appears at most once; selection order never affects registration order or evidence;
- `finalize()` derives/checks once; any `outcome: "rejected"` causes zero Collider registrations;
- on a passed check, the adapter resolves each selection to the exact Layout entry, materializes one ordinary no-gap box Mesh from `centerMetersXYZ` and `sizeMetersXYZ`, and registers that proxy. It does not clone/scan visual geometry, inspect `scene.meshes`, infer from `paletteRole`, or create a hidden foundation;
- each Registration carries only selection ID, exact Mesh, exact closed binding, and optional ratios; BNA core applies defaults and validates bounds/budget/geometry;
- generated proxy Meshes are owned by the Host Candidate Scene on both success and failure; Profile code does not create a second disposer or retain them after finalization;
- inventory is deeply frozen, sorted by `colliderId`, build-only, and contains no Mesh, geometry array, `geometryHash`, `colliderSubshapeId`, or `traversalSurfaceId`;
- BNA core rechecks the generated proxy after build settlement and Runtime reconstructs another private collision Mesh from frozen Contribution bytes. The separately approved settlement validator rechecks visual records against the same Layout and BWB-3 display transform; Profile code must not publish its own core identity.

Profile-local failures use one current vocabulary and throw before any new Registration call:

| Code | Trigger |
|---|---|
| `WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID` | non-ordinary input, unknown key, invalid stable ID, invalid ratio, or binding rejected by the one BNA-owned traversal snapshot parser |
| `WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE` | repeated selection `id` in one session |
| `WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_DUPLICATE` | more than one selection references the same block in the V1 one-block/one-proxy baseline |
| `WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_MISSING` | selection references no record/Layout entry in this Build Epoch |
| `WORLDKIT_NATIVE_BLOCK_COLLIDER_CHECK_REJECTED` | the package-private adapter is called directly with a rejected check result; normal session finalization never calls it in this state |

Do not alias these to BNA core diagnostics. Once the first Registration succeeds, a later core Registration failure is rethrown unchanged; the Candidate Scene owner performs complete cleanup.

If BWB-5 later requires a Profile-derived smooth slope or walkable step, do not overload the contract above. Freeze a continuous/ramp proxy or make a current-only grid/shape clean break, with exact deterministic geometry/drift rules, after the BNA settlement validator is approved. A generic optional `proxyMode`, callback, arbitrary geometry bag, or alias is forbidden.

---

## 5. Task BWB4-05 — merge contracts and execute the first RED

**Files:** this plan, then only the exact integration files listed in section 3.1 after the decision commit.

**Interfaces:** Consumes merged BWB-3 adapter signatures and current BWB-1/BWB-2 session. Produces one approved finalization call graph and the settlement-validator/slope disposition.

- [ ] **Step 1: Merge or rebase onto the accepted BWB-3 contract commit**

Read the actual diff. Confirm BWB-3 created only its four reserved files and its visual adapter accepts the exact `layout`, `checkResult`, and `records` object identities. Do not resolve textual conflicts by re-deriving Layout.

- [ ] **Step 2: Write the first executable RED**

Create `packages/native-babylon-block-profile/src/collider-contribution.test.ts` with a one-block session fixture and this behavior-level expectation:

```ts
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { BabylonNativeSceneRegistrationV1 } from "@whitebox-world/native-babylon";
import { expect, it, vi } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import {
  createBabylonNativeBlockColliderCandidatesV1,
} from "./collider-contribution.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

function withPassedOneBlockEpoch(
  run: (epoch: Readonly<{
    scene: Scene;
    layout: ReturnType<typeof deriveBabylonNativeBlockLayoutV1>;
    checkResult: ReturnType<
      typeof createBabylonNativeBlockProfileCheckResultV1
    >;
    records: readonly BabylonNativeBlockSessionRecordV1[];
  }>) => void,
): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const mesh = MeshBuilder.CreateBox("route-block-a", { size: 1 }, scene);
    const records = Object.freeze([Object.freeze({
      input: Object.freeze({
        id: "route-block-a",
        shape: "full" as const,
        paletteRole: "route" as const,
        visualGroupId: "route-group",
      }),
      mesh,
      localGeometrySnapshot: Object.freeze({
        positions: Object.freeze(Array.from(
          mesh.getVerticesData(VertexBuffer.PositionKind)!,
        )),
        indices: Object.freeze(Array.from(mesh.getIndices()!)),
      }),
    })] satisfies readonly BabylonNativeBlockSessionRecordV1[]);
    const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
    const checkResult = createBabylonNativeBlockProfileCheckResultV1(
      "block-collider-world",
      records,
      layout,
    );
    expect(checkResult.outcome).toBe("passed");
    run(Object.freeze({ scene, layout, checkResult, records }));
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

it("registers an explicitly selected block through the one finalized layout", () => {
  withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
    const registerStaticCollider =
      vi.fn<BabylonNativeSceneRegistrationV1["registerStaticCollider"]>();
    const registration = {
      registerSpawnMarker:
        vi.fn<BabylonNativeSceneRegistrationV1["registerSpawnMarker"]>(),
      registerStaticCollider,
    } satisfies BabylonNativeSceneRegistrationV1;
    const traversalBinding = Object.freeze({
      kind: "static-surface" as const,
      surfaceEntityId: "route-ground",
      logicalSubshapeId: "top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    });

    const inventory = createBabylonNativeBlockColliderCandidatesV1({
      scene,
      buildEpochId: "block-collider-epoch-a",
      layout,
      checkResult,
      records,
      selections: [{
        id: "route-ground-a",
        blockId: "route-block-a",
        traversalBinding,
      }],
      registration,
    });

    expect(registerStaticCollider).toHaveBeenCalledOnce();
    const candidate = registerStaticCollider.mock.calls[0]![0]!;
    expect(candidate).toMatchObject({
      id: "route-ground-a",
      traversalBinding,
    });
    expect(candidate.mesh).not.toBe(records[0]!.mesh);
    candidate.mesh.computeWorldMatrix(true);
    expect(candidate.mesh.getBoundingInfo().boundingBox.minimumWorld.asArray())
      .toEqual([...layout.blocks[0]!.minimumMetersXYZ]);
    expect(candidate.mesh.getBoundingInfo().boundingBox.maximumWorld.asArray())
      .toEqual([...layout.blocks[0]!.maximumMetersXYZ]);
    expect(inventory).toEqual([{
      colliderId: "route-ground-a",
      sourceBlockIds: ["route-block-a"],
      visualGroupIds: ["route-group"],
      proxyKind: "layout-block-volume",
      traversalBinding,
    }]);
  });
});
```

Run:

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/collider-contribution.test.ts
```

Expected RED: module `./collider-contribution.js` and `createBabylonNativeBlockColliderCandidatesV1` do not exist. This is the first production-driving RED; do not use a source-string assertion.

- [ ] **Step 3: Record the main-Agent parser/inventory/slope/drift disposition**

Add a dated decision block to this plan naming the separately approved BNA-owned settlement validator, the one-parser traversal snapshot entry, the one inventory publication path and consumer, and the scoped slope verdict. The accepted wording must distinguish “BNA-4 generic sloped Surface remains green” from “Block Profile derives a sloped proxy”; they are not equivalent claims.

- [ ] **Step 4: Commit the decision checkpoint**

```bash
git add docs/superpowers/plans/2026-08-31-bwb4-block-collider-contribution-implementation.md \
  packages/native-babylon-block-profile/src/collider-contribution.test.ts
git commit -m "test(bwb4): freeze block collider contribution contract"
```

The test is intentionally RED on this checkpoint only if the branch is not proposed for merge. Before any merge candidate, BWB4-10 must make it GREEN.

---

## 6. Task BWB4-10 — deterministic Collider candidates

**Files:** create `collider-contribution.ts`; extend only `collider-contribution.test.ts`.

**Interfaces:** Consumes the exact internal signature in section 4. Produces sorted Registration calls plus build-only provenance inventory.

- [ ] **Step 1: Extend RED coverage**

Add table-driven cases for reversed block/selection order, Y quarter-turn/asymmetric `quarter`, `not-traversable`, explicit material ratios, duplicate collider ID, duplicate block selection, missing block, wrong Scene, an overlap-rejected Layout, another rejected check, and a palette role that remains non-walkable until explicitly selected.

- [ ] **Step 2: Run RED and inspect the failure**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/collider-contribution.test.ts
```

Expected: the first missing behavior fails before implementation; rejected-check and invalid-reference cases must show zero Registration calls.

- [ ] **Step 3: Implement the minimal adapter**

Use only ID-sorted Maps over supplied `layout.blocks` and `records`. Validate closed ordinary selection objects with the same strict style as `session.ts`. Use `MeshBuilder.CreateBox` in the supplied Candidate Scene with the exact Layout center/effective size, a stable private name derived from `buildEpochId` plus collider ID, no display gap, unit scale, no material inference, `isVisible = false`, and `isPickable = false`; then pass that ordinary proxy Mesh to Registration. Freeze the provenance inventory and clear local Maps before returning.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/collider-contribution.test.ts
pnpm typecheck
git diff --check
git add packages/native-babylon-block-profile/src/collider-contribution.ts \
  packages/native-babylon-block-profile/src/collider-contribution.test.ts
git commit -m "feat(bwb4): derive explicit block collider candidates"
```

---

## 7. Task BWB4-20 — single finalization integration

**Files:** modify `session.ts`, `session.test.ts`, `index.ts`, `api-type.test.ts`, `package-boundary.test.ts`, and `scripts/lib/test-gate-manifest.ts` only after BWB-3 is present.

**Interfaces:** `createBlock()` + `selectStaticCollider()` -> one internal Layout/check -> BWB-4 no-gap Collider adapter -> BWB-3 display adapter -> the one BWB4-05-approved finalization result or package-internal inventory sink.

- [ ] **Step 1: Write session RED tests**

Prove exact order and object identity by instrumenting the two adapters: derive/check once, no adapter on rejected check, no-gap Collider materialization/registration before BWB-3 display scaling, records cleared on pass/reject/throw, repeated successful `finalize()` returns the same result without a second registration, repeated failed `finalize()` rethrows the retained first failure without a second adapter/registration call, selection after finalize fails, and two sessions do not share IDs, selections, Layout, Meshes, or Registration calls.

- [ ] **Step 2: Update API/export RED tests**

Add `selectStaticCollider` to the exact public type. Export only the BWB4-05-approved current contract; keep Layout, records, adapter implementation, Babylon Registration, and core Contribution types absent from runtime root exports. If the accepted inventory publication path requires a public inventory type, expose it only through the sole finalization result and exact export census, never through a second getter/finalize API or compatibility alias.

- [ ] **Step 3: Implement one coordinator**

Modify `session.ts` so `finalize()` snapshots records/selections, derives and checks exactly once, invokes the BWB-4 no-gap proxy adapter before the BWB-3 display adapter from that same snapshot only on `passed`, publishes inventory through the one BWB4-05-approved path, and releases owned Maps in `finally`. Preserve repeated-finalize idempotency and exactly one public finalization entry. Retain and rethrow the first adapter/Registration failure on later calls; never convert a failed finalization into a successful report. Do not catch and downgrade Registration failure.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/collider-contribution.test.ts \
  packages/native-babylon-block-profile/src/babylon-visual-adapter.test.ts \
  packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/package-boundary.test.ts
pnpm test:census
pnpm typecheck
git diff --check
git add packages/native-babylon-block-profile/src/session.ts \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/index.ts \
  packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/package-boundary.test.ts \
  scripts/lib/test-gate-manifest.ts
git commit -m "feat(bwb4): finalize block visuals and colliders once"
```

---

## 8. Task BWB4-30 — core identity, drift, and tamper

**Files:** extend `collider-contribution.test.ts` and, when real Package/Runtime composition is required, the new root verification test from BWB4-40; add no BNA production changes and do not edit BNA's existing test files.

**Interfaces:** Profile-selected Mesh/closed binding -> existing `admitBabylonNativeSceneCandidateV1()` -> `BabylonNativeSceneContributionV1`.

- [ ] **Step 1: Add settlement and Candidate admission RED/GREEN cases**

Prove that two reversed Profile construction orders produce byte-equal Contributions; `collider.id` joins the build-only inventory to the core row; a source visual changed after Profile finalization outside the exact Layout + BWB-3 display-gap transform rejects through the BWB4-05-approved settlement validator and code; proxy geometry/binding mutation after Registration rejects with `WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT`; disposed/wrong-Scene/provider-body/Thin-Instance candidates reject; and budget overflow remains BNA-owned.

- [ ] **Step 2: Prove identity separation**

Assert Profile inventory has no core-derived IDs. Assert the accepted Contribution has `geometryHash`, `colliderSubshapeId`, and, for `static-surface`, `traversalSurfaceId` derived by BNA core. Assert the IDs remain stable for equal geometry/binding and change when geometry or binding changes.

- [ ] **Step 3: Prove package tamper cutoff**

Build one verified Package from the accepted Contribution, replay a changed block transform/binding, and assert `WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH` occurs before `havok`, `camera`, `subjects`, and `ready`. This uses the existing BNA-4 runtime harness; it does not add a Profile repair fallback.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src/collider-contribution.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/runtime-babylon/src/babylon-native-package-runtime.test.ts
git diff --check
git add packages/native-babylon-block-profile/src/collider-contribution.test.ts \
  scripts/verification/bwb4-block-collider-runtime.test.ts
git commit -m "test(bwb4): bind block colliders to core identity"
```

---

## 9. Task BWB4-40 — real Spawn support and scoped Havok traversal

**Files:** create only `scripts/verification/bwb4-block-collider-runtime.test.ts`; register it as `resource-heavy` with `reasonCodes: ["native-havok-or-recast"]` in `scripts/lib/test-gate-manifest.ts`.

**Interfaces:** One Profile-authored Module plus exact verified WorldPackage -> existing `BabylonWorldRuntime`/RuntimeHost -> real Havok Character support and committed snapshots.

- [ ] **Step 1: Build one exact Package fixture**

The module creates visible Profile blocks, explicitly selects `layout-block-volume` Collider proxies, registers one spawn with feet exactly on the selected upward face, finalizes once, and returns `undefined`. Construct the Package Contribution from the first audited Candidate and use the existing exact loader/Runtime path; do not hand-edit hashes.

- [ ] **Step 2: Add Spawn support matrix**

Cover exact supported spawn, 0.01m airborne spawn, underground spawn, `not-traversable` support, an obstructing overhead block, outside bounds, and spawn on a surface whose normal exceeds the controlled Subject's locked slope. All negative cases reject before Havok allocation when BNA-4 currently promises that cutoff.

- [ ] **Step 3: Add real traversal probes**

Use fixed input and real Havok to prove only what the frozen Profile can represent:

- a `0.5m` Block face higher than `maxStepHeightMeters` blocks forward progress;
- leaving the selected platform produces `movementMedium: "air"` and falling Y;
- the support contact carries the Contribution's exact `colliderSubshapeId`, `traversalSurfaceId`, `surfaceEntityId`, and Profile ref; and
- no Profile-derived walkable step or slope is claimed. The BNA-4 generic ramp and `0.2m`/`0.25m`
  step tests remain upstream engine evidence only.

A walkable Profile step/slope test is a BWB-5 prerequisite, not a BWB4-40 acceptance item. It must
first freeze either a continuous/ramp proxy contract or a current-only grid/shape clean break.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run scripts/verification/bwb4-block-collider-runtime.test.ts
pnpm typecheck
git diff --check
git add scripts/verification/bwb4-block-collider-runtime.test.ts \
  scripts/lib/test-gate-manifest.ts
git commit -m "test(bwb4): prove block colliders in real Havok"
```

---

## 10. Task BWB4-50 — determinism and lifecycle

**Files:** extend only `scripts/verification/bwb4-block-collider-runtime.test.ts` and focused Profile tests.

- [ ] **Step 1: Add cadence equivalence**

Run the same 90 fixed inputs while rendering at 30/60/120-like cadence, hash only committed Tick/Subject/support identity, and require one hash. Render cadence must never change selection, Contribution, support, or movement.

- [ ] **Step 2: Add Reset evidence**

Provider-local `BabylonWorldRuntime.reset()` restores spawn/support/Camera without rebuilding the Module. Public `RuntimeHost.reset()` performs Full Reload, builds one fresh Candidate once, publishes after readiness, and disposes the old session. Surface IDs remain equal because Package Contribution identity is equal; handles are distinct.

- [ ] **Step 3: Add two-instance and failure cleanup**

Create two hosts from one Package and prove distinct Engine, Scene, visible Mesh, private collision Mesh, Havok body, input, Camera, and disposal state. Inject failure after partial Profile creation, during Registration, at Havok/Subject/Camera/readiness, and make one disposer throw; assert all later owned resources are attempted, first failure remains stable, and the other host stays active.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run \
  packages/native-babylon-block-profile/src \
  scripts/verification/bwb4-block-collider-runtime.test.ts \
  packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts
pnpm typecheck
git diff --check
git add packages/native-babylon-block-profile/src/collider-contribution.test.ts \
  scripts/verification/bwb4-block-collider-runtime.test.ts
git commit -m "test(bwb4): close block collider lifecycle"
```

---

## 11. RED-to-GREEN acceptance matrix

| Claim | RED trigger | GREEN owner/evidence | Forbidden shortcut |
|---|---|---|---|
| one Layout feeds visuals and colliders | current `finalize()` returns only check and clears records | session identity/call-order tests | re-run `deriveBabylonNativeBlockLayoutV1()` in each adapter |
| explicit collision only | unselected `ground`/`route` block | zero Registration until `selectStaticCollider()` | palette/material/name inference |
| closed traversal binding | missing/unknown field or invented walkable alias | existing BNA parser rejection | Profile parser dialect or alias |
| rejected overlap has no physics side effect | two Profile blocks overlap in Layout | rejected check plus zero proxy allocation/Registration | merge, offset, or hide the overlap in the Collider adapter |
| stable visual/proxy join | reversed creation order | inventory `colliderId/sourceBlockIds/visualGroupIds` + core row by `id` | predicting core hashes/IDs |
| visual/proxy drift fail closed | mutate source visual after `finalize()` outside the exact Layout + approved display-gap transform | BWB4-05 settlement validator rejects after `module.build()` and before Contribution acceptance | trust `finalize()` as the Module's last statement |
| proxy/binding drift fail closed | mutate registered proxy Mesh or binding after Registration | `WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT` | re-derive from changed visual state |
| Package tamper fail closed | replay Contribution differing from the verified Package | `WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH` before Havok | trust Profile inventory over Package identity |
| Spawn support | feet at/above/below/blocked/outside candidate | BNA-4 `admitBabylonNativeSurfacesV1` diagnostics | fall-to-ground repair or hidden plane |
| over-limit Block face | 0.5m Profile-derived obstacle | fixed-input Havok snapshot remains on the entry side | height sampler or teleport |
| walkable step/slope capability gap | current 0.5m boundary lattice cannot represent a 0.25m step or continuous ramp | explicit BWB-5 prerequisite for continuous/ramp proxy or grid/shape clean break | calling generic BNA step/slope evidence “Profile-derived” |
| ledge | move beyond finite selected platform | support loss + committed air/fall | infinite foundation |
| 30/60/120 | render grouping changes | equal authoritative hashes | render-time physics |
| Reset | moved Camera/Subject then reset | provider reset + Host Full Reload semantics | scene-local second reset dialect |
| dual instance | same Package twice | distinct handles/state, equal Contribution hash | singleton/Profile global maps |
| throwing cleanup | disposer fails mid-stack | remaining disposers attempted, stable first failure | `Promise.all`, swallowed failure, Scene-only cleanup |

---

## 12. BWB4-90 closure

- [ ] **Step 1: Run affected gates once on the final candidate**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src
pnpm exec vitest run \
  packages/native-babylon/src/candidate-admission.test.ts \
  scripts/verification/bwb4-block-collider-runtime.test.ts \
  packages/runtime-babylon/src/babylon-native-surface-admission.test.ts \
  packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts
pnpm test:census
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm build:native-scene
pnpm verify:native-scene-playground
git diff --check
```

Do not rerun root `pnpm test` locally if Cursor Cloud will run it against the same exact SHA. Rendered BWB-3 screenshots are visual evidence, not a substitute for these collision/runtime gates.

- [ ] **Step 2: Write the deep review**

Create `docs/reviews/2026-08-31-bwb4-block-collider-contribution-review.md`. Apply `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`. Record exact SHA, D1-D6, installed Babylon/Havok source confirmation, one-Layout proof, Contribution/Surface cutoffs, slope disposition, lifecycle order, every command/exit, and no open P0/P1/P2.

- [ ] **Step 3: Cursor Cloud exact-SHA gates and independent review**

Push one merge-candidate SHA and send two separate Cloud jobs: affected/full gates and independent Mode B + runtime-deep review. A GO applies only to that SHA. A confirmed finding receives a focused RED first and invalidates only affected evidence.

- [ ] **Step 4: Update truth and merge**

Mark BWB-4 complete in `docs/18-refactor-progress-and-backlog.md` only after both exact-SHA results are GO and the slope claim matches BWB4-05. Do not mark BWB-5/BWB-6, formal Route/Nav, general interiors, moving platforms, or `goTo` complete.

Commit the review/status separately, create a focused PR, merge to `main`, fetch, and prove final product ancestry with:

```bash
git merge-base --is-ancestor <bwb4-product-sha> origin/main
git status --short --branch
```

## Stop conditions

Stop and return to the main Agent rather than changing another authority if:

- one-Layout integration would require BWB-3/BWB-4 to derive or retain separate Layouts;
- true visual/proxy drift cannot be checked after `module.build()` without a BNA-owned settlement hook;
- a slope claim requires a new persistent geometry DTO or an unversioned Registration callback;
- Profile code would need to derive core `colliderSubshapeId`/`traversalSurfaceId` or inspect Runtime private Mesh metadata;
- support/passability would require reading Layout at Runtime or adding another `checkSupport()` path; or
- a passing fixture depends on a hidden foundation, a Camera/Gameplay/Character change, a compatibility path, or weakening verified-Package exact match.

These are architecture decisions, not reasons to weaken the current contracts. Ordinary geometry bugs, winding mistakes, fixture identity rebuilds, and deterministic cleanup defects remain BWB-4 implementation work.
