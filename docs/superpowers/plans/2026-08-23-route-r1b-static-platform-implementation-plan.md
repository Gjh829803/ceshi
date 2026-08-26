# Route R1b Static Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close M5 by proving that one locked ground humanoid can traverse a deterministic Heightfield → 0.25m steps → static platform → static ramp → Heightfield route, while a 0.35m step, wrong Surface/Collider identity, invalid seam, insufficient clearance, and Runtime support mismatch fail closed.

**Architecture:** Authoring Prototype resources declare explicit Surface-to-Collider-Subshape bindings; Compiler expands them per Object instance into the existing `ExecutionPlanV5.traversal.surfaces` union and the same `ExecutionStaticColliderV1` geometry authority. A provider-neutral `RouteBuildInputV2` carries one Heightfield, sorted static collider sources, sorted Surface identities, and child/root hashes. Recast uses a private layered source mode to preserve candidate Surface boundaries, then publishes only Canonical Graph identities. Babylon classifies the retained single `checkSupport()` sample against the same canonical geometry. Path, Overlay, Probe, Browser, and Validation use multi-Surface V2 receipts without a path-global Surface.

**Tech Stack:** TypeScript 5.9, Authoring JSON Schema 2020-12/AJV, canonical JSON + SHA-256, `lodash-es`, Babylon.js/Havok 9.21.2/1.3.14, `recast-navigation` 0.43.1 with an audited local patch, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md`

**Baseline:** `40992d937cd8ca5af91d1d5dac480c319a22264f` on `codex/m5-route-r1b-static-platform`; PR #20/R1 Heightfield is already in `main` at `4f9b8b2af3227036737f256540ab150c3e9c8016`.

## Global Constraints

- Keep `ExecutionPlanV5.traversal.surfaces` as one closed discriminated union; do not create platform-only routes, Graphs, Reports, or Browser APIs.
- AI authors or selects Prototype resources and stable semantic IDs. It never writes NavMesh polygons, walkable triangle buffers, Recast areas, Babylon/Havok handles, or Provider parameters.
- `ExecutionStaticColliderV1` plus the shared canonical triangle emitter is the only static collision geometry authority for Graph and Runtime.
- Use `logicalSubshapeId`; do not add `logicalColliderSubshapeId` or a second `surfaceEntityId` field to Collider rows.
- Preserve R1 Heightfield `traversalSurfaceId` bytes derived from `{ surfaceEntityId, logicalSubshapeId: "heightfield" }`.
- Static Surface IDs use `{ kind: "static-collider", surfaceEntityId, logicalSurfaceId }`; resource/version/content drift remains in Ref/Version/Hash and `colliderHash`.
- Every fixed tick calls Character Controller `checkSupport()` exactly once. Surface classification consumes its retained sample and never writes Ground/Air, velocity, Controller pose, or Physics state.
- Intent uses the existing XZ lookahead. Expected Surface uses Probe-private monotonic 3D support station; expected IDs never enter Runtime Port evidence.
- Graph Builder Adapter consumes `TraversalCapabilityEnvelopeV1`, not Registry/Profile resources.
  `maximumTraversalSurfaceCount`, `minimumEquivalentPlaneNormalDotRatio`, and
  `maximumTraversalSurfaceTrianglePairTestCount` are copied into the Envelope.
- Installed Recast/Detour 0.43.1 evidence freezes `maximumTraversalSurfaceCount` at `61`, including the Heightfield: candidate ordinals `0..60` map to private areas `2..62`, while `0` is null, `1` is blocker, and `63` is the walkable sentinel.
- Provider-private source area/tag values never enter Canonical Schema, Graph, Path, Report, CLI, Browser, or Snapshot.
- R1b remains static ground traversal only. Do not add bridges with underpasses, caves, interiors, dynamic platforms, traversal links, NPCs, vehicles, or public `goTo`.
- New behavior follows RED → verified failure → minimal GREEN → focused regression → relevant full gate.
- Use strict `===` / `!==`; use `lodash-es` `isNil` when null and undefined intentionally share behavior.
- Do not modify `sdk-world-adapter.ts`, camera, animation, Control Feel semantics, or rendering to satisfy fixtures.

## Dependency-Aware Execution Waves

Task numbers describe the architecture from public contracts toward final gates; they are not a license to ignore real package dependencies. Execute and integrate the work in these waves:

1. **Wave 1 — parallel:** Task 3 (Traversal Surface Profile and capability budget) and Task 5 (private layered Recast source mode). Their owned files do not overlap.
2. **Wave 2:** Task 1 after Task 3, because Compiler admission must resolve the exact built-in `traversal-surface-profile` rather than inventing a temporary resolver or hash.
3. **Wave 3:** Task 2 after Task 1; then Task 4 after Task 2, because shared static-collider source emission consumes the canonical `StaticColliderSourceV1` contract.
4. **Wave 4 — parallel after Tasks 1–5 are integrated:** Task 6 (Graph), Task 7 (Babylon Runtime correlation), and Task 8 (Probe/Browser publication). These packages are independently owned, but each starts from the same integrated base.
5. **Wave 5:** Task 9 fixtures and blocking gate, followed by Task 10 full verification and handoff.

Each parallel worker uses a dedicated Git worktree and branch. Integration is commit-based onto `codex/m5-route-r1b-static-platform`; never share one writable worktree between implementers. The main agent owns review and all integration decisions.

The V2/V5 public clean break is atomic at Task 9. Earlier tasks may add the new V2/V5 definitions beside unchanged V1/V4 declarations solely as an unmerged feature-branch staging mechanism so every intermediate commit typechecks; they must not add alias fields, converters, or adapters between dialects. Task 9 migrates the final trusted-host/CLI consumers and deletes every V1/V4 declaration/export in the same commit. No dual public contract may reach the completion gate or `main`.

---

## Phase A — Canonical contracts and compilation

### Task 1: Compile Explicit Prototype Traversal Surface Bindings

**Files:**
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/types-v4.ts`
- Modify: `packages/authoring/src/authoring-spec-v4.schema.json`
- Modify: `packages/authoring/src/authoring-v4.test.ts`
- Modify: `packages/authoring/src/validate-v4.ts`
- Modify: `packages/authoring/src/normalize-v4.ts`
- Modify: `packages/authoring/src/normalize-v4.test.ts`
- Modify: `packages/authoring/src/canonical-authoring-identity.ts`
- Modify: `packages/authoring/src/resource-lock.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/package.json`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile-v5.test.ts`
- Modify: `packages/compiler/src/compile-traversal-lock.test.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `PrototypeTraversalSurfaceBindingV1`, `ExecutionStaticColliderTraversalSurfaceV1`, and the expanded `ExecutionTraversalSurfaceV1` union.
- Extends `EXECUTION_RESOURCE_KINDS_V1` with `traversal-surface-profile`.
- Keeps `traversalSurfaceBindings` as a V4-only Prototype extension: V3 remains closed, while V4 strips the extension before V3 normalization and restores its canonical sorted/frozen form afterward.
- Adds each distinct resolved Traversal Surface Profile receipt to the Authoring Resource Lock and preserves byte-identical Authoring/Execution lock rows.
- Uses existing `deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)` and existing `ExecutionStaticColliderV1` fields unchanged.

- [x] **Step 1: Write RED Authoring normalization tests**

Add a box Prototype with:

```ts
traversalSurfaceBindings: [{
  id: "deck",
  kind: "collider-subshape",
  logicalSubshapeId: "primary",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
}]
```

Assert canonical preservation, strict field rejection, duplicate `id` rejection, unknown Subshape rejection, and rejection when `collisionEnabled === false`. Also assert V3 still rejects `traversalSurfaceBindings`, while V4 normalization sorts/deep-freezes bindings and changes `authoringSpecHash`, `normalizedWorldIrHash`, and `resourceLockHash` when the binding or resolved Profile changes.

- [x] **Step 2: Verify Authoring RED**

Run:

```bash
pnpm vitest run packages/authoring/src/authoring-v4.test.ts packages/authoring/src/normalize-v4.test.ts
```

Expected: FAIL because `traversalSurfaceBindings` is not part of the closed Prototype contract.

- [x] **Step 3: Implement the closed Authoring binding**

Add:

```ts
export interface PrototypeTraversalSurfaceBindingV1 {
  readonly id: string;
  readonly kind: "collider-subshape";
  readonly logicalSubshapeId: string;
  readonly traversalSurfaceProfileRef: string;
}
```

Add the same closed shape and a dedicated `traversal-surface-profile-ref` format to the V4 JSON Schema/AJV validator. Put only the shared binding vocabulary in `types.ts`; widen Prototype/resource types in `types-v4.ts` without weakening V3. Strip bindings before calling the V3 normalizer, then restore them by `id`, deep-freeze them, and include them in the V4 canonical identity. Resolve every distinct Profile Ref through Task 3, insert the exact receipt through `ResourceLockBuilderV1`, and add `@whitebox-world/traversal` as a direct Authoring dependency. Keep Object instances free of per-instance Surface geometry or toggles.

- [x] **Step 4: Write RED Compiler and Runtime Contract tests**

Prove two Objects sharing one Prototype produce two static Surface rows with different `surfaceEntityId`/`colliderSubshapeId`, while each row joins exactly one existing Collider row:

```ts
expect(surface.surfaceEntityId).toBe(collider.entityId);
expect(surface.logicalSubshapeId).toBe(collider.logicalSubshapeId);
expect(surface.colliderSubshapeId).toBe(collider.colliderSubshapeId);
expect(surface.colliderHash).toBe(collider.colliderHash);
```

Also prove the R1 Heightfield ID is byte-identical to the pre-R1b fixture and that a forged-but-hash-consistent normalized V4 join fails Plan admission. Extend `compile-traversal-lock.test.ts` to prove the Traversal Surface Profile row survives byte-identically from normalized to Execution Resource Lock and that a missing or changed row fails closed.

- [x] **Step 5: Verify Compiler RED**

Run:

```bash
pnpm vitest run packages/compiler/src/compile-v5.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts
```

Expected: FAIL because `ExecutionStaticColliderTraversalSurfaceV1` and the new Resource kind do not exist.

- [x] **Step 6: Implement per-instance Surface compilation**

Compile the static Surface resource identity as:

```ts
{
  resourceRef:
    `package://traversal-surface/${entityId}.${binding.id}@${prototype.version}`,
  resolvedVersion: String(prototype.version),
  resourceHash: sha256CanonicalJson({
    prototypeId: prototype.id,
    prototypeVersion: prototype.version,
    binding,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
    colliderHash: collider.colliderHash,
  }),
}
```

Sort compiled surfaces by `traversalSurfaceId`. Resolve every Profile again in Compiler, require an exact `resourceRef`/`resourceKind`/`resolvedVersion`/`contentHash` match with one normalized lock row, and copy that receipt into the compiled Surface. Fail before returning a Plan on missing/ambiguous Collider joins, unresolved Profile refs, or lock drift.

- [x] **Step 7: Run Task 1 gates and commit**

```bash
pnpm vitest run packages/authoring/src/authoring-v4.test.ts packages/authoring/src/normalize-v4.test.ts packages/compiler/src/compile-v5.test.ts packages/compiler/src/compile-traversal-lock.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/authoring packages/compiler packages/runtime-contracts pnpm-lock.yaml
git commit -m "feat: compile static traversal surfaces"
```

Expected: all commands pass; R1 Heightfield identity remains stable.

### Task 2: Introduce Route Build, Graph, Path, Overlay, and Connectivity V2

**Files:**
- Modify: `packages/traversal/src/build-input.ts`
- Modify: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/graph-contract.ts`
- Modify: `packages/traversal/src/graph-contract.test.ts`
- Modify: `packages/traversal/src/path-receipt.ts`
- Modify: `packages/traversal/src/path-receipt.test.ts`
- Modify: `packages/traversal/src/route-overlay.ts`
- Modify: `packages/traversal/src/route-overlay.test.ts`
- Modify: `packages/traversal/src/connectivity-result.ts`
- Modify: `packages/traversal/src/connectivity-result.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Verify: `packages/traversal/src/build-budget.test.ts`

**Interfaces:**
- Produces `RouteTerrainSourceV2`, `StaticColliderSourceV1`, `RouteBuildInputV2`, `RouteBuildInputReceiptV2`, `TraversalGraphV2`, `RoutePathReceiptV2`, `RouteOverlayV2`, and `RouteConnectivityResultV2`.
- V2 deletes the R1 path-global `traversalSurfaceIdentity` from Path and Overlay.
- Adds `ROUTE_SURFACE_PROFILE_MISSING`, `ROUTE_SURFACE_CORRELATION_MISSING`, and `ROUTE_SURFACE_CORRELATION_AMBIGUOUS` to the V2 closed failure union.
- Gives Graph V2 one `traversalSurfaceIdentitiesById` resource inventory while keeping the three stable Surface IDs on each Node; full Ref/Version/Hash identity is not repeated on every Node.
- Renames Overlay V2 collider evidence to `staticColliderIdentities` and makes Traversal the sole Overlay context-validator owner.
- Exports the four exact artifact hash helpers, root `hashRouteBuildInputV2()`, and one `createRouteBuildInputReceiptV2(input: RouteBuildInputV2)` producer from the package root.
- Makes bounded Terrain admission self-proving: non-empty soup, exact normalized world-XZ extrema, Terrain hash helper, validator, and receipt factory all reuse one owner.
- Keeps `packages/traversal/src/build-input.ts` closed over the complete Capability Envelope, including
  `maximumTraversalSurfaceCount`, `minimumEquivalentPlaneNormalDotRatio`, and
  `maximumTraversalSurfaceTrianglePairTestCount`; Build Input and Receipt admission re-resolve the locked
  Graph Builder Profile and require exact field equality.
- Migrates every V1 Connectivity reason through the complete V2 status/field/cardinality table in design §7.1; no common or reason-local singular Surface alias survives.
- Keeps the unchanged V1 declarations temporarily available only so untouched R1 consumers continue compiling; do not implement V1↔V2 aliases, converters, fallback reads, or mixed receipts. Task 9 removes V1 atomically after every consumer migrates.

**Canonical identifier lock (disk + this task):**

Do not invent synonyms. If a name is missing from this lock or from `packages/traversal/src/index.ts`, it is not a public identifier. Conversation summaries are not a source of names. V1 bytes stay unchanged until Task 9.

| Layer | Locked name |
| --- | --- |
| Package | `@whitebox-world/traversal` |
| Hash | `sha256CanonicalJson` from `@whitebox-world/protocol`; digest prefix `sha256:` |
| Collections | `lodash-es` `isEmpty` / `isNil` / `isPlainObject` / `isEqual` |
| Terrain helpers | `@whitebox-world/terrain-surface` |
| Source files | `build-input.ts`, `graph-contract.ts`, `path-receipt.ts`, `route-overlay.ts`, `connectivity-result.ts`, `capability-envelope.ts`, `profile-registry.ts`, `build-budget.ts`, `collider-subshape-id.ts`, `types.ts`, `index.ts` |
| Soup | `CanonicalTriangleSoupV1`: `positionsMetersXYZ`, `triangleIndices` |
| Surface identity | `TraversalSurfaceIdentityV1`: `traversalSurfaceId`, `surfaceEntityId`, `colliderSubshapeId`, `resourceRef`, `resolvedVersion`, `resourceHash` |
| Collider id | `deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)` |
| Envelope | `createTraversalCapabilityEnvelopeV1({ traversalLockReceipt, graphBuilderProfile })`; `TraversalCapabilityEnvelopeV1` |
| Profile | `resolveTraversalGraphBuilderProfileV2`, `BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF` |
| Lock | `resolveTraversalLockV1` |

V1 public roots and fields (copy from disk; do not rename):

- Build Input: `kind: "heightfield-route-build-input"`, `schemaVersion: 1`, `HeightfieldRouteBuildInputV1`, `HeightfieldRouteTerrainSourceV1` (`empty` \| `bounded` with nested `terrainArtifactHash`), `traversalSurface`, `blockingColliders`, `colliderArtifactHash`, `blockedTraversalAreaExclusions`, `blockedWaterExclusions`, `RouteHardRibbonV1` (`routeId`, `pointsMetersXZ`, `widthMeters`, `locomotionProfileRef`), `RouteBuildAnchorV1` (`entityId`, `positionMetersXYZ`), `StaticBlockingColliderV1` (`entityId`, `logicalSubshapeId`, `colliderSubshapeId`, `colliderHash`, `triangleSoup`)
- Budget V1: `not-required-empty-source` \| `heightfield-tile-estimate` (`tilesX`, `tilesZ`, `estimatedTiles`, `maximumTiles`, `minimumMetersXZ`, `maximumMetersXZ`)
- Functions V1: `assertHeightfieldRouteBuildInputV1`, `hashHeightfieldRouteBuildInputV1`, `assertHeightfieldRouteBuildInputReceiptV1`
- Error V1: `HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID`, `HEIGHTFIELD_ROUTE_BUILD_INPUT_RECEIPT_INVALID`
- Graph: `kind: "traversal-graph"`, `schemaVersion: 1`, `TraversalNodeV1` / `TraversalEdgeV1` / `TraversalGraphV1`, `canonicalTraversalGraphV1`, `hashTraversalGraphV1`, `assertTraversalSurfaceIdentityV1`, `TRAVERSAL_GRAPH_INVALID`; Node keeps `traversalSurfaceId`, `surfaceEntityId`, `colliderSubshapeId`, `positionMetersXYZ`, `tileId`, `clearanceWidthMeters`, `clearanceHeightMeters`; Edge keeps `fromTraversalNodeId`, `toTraversalNodeId`, `type: "walk" \| "slope" \| "step"`
- Path: `kind: "route-path-receipt"`, `RoutePathReceiptV1.traversalSurfaceIdentity`, `orderedTraversalNodeIds`, `orderedTraversalEdgeIds`, `orderedPathPositionsMetersXYZ`, `canonicalRoutePathReceiptV1`, `hashRoutePathReceiptV1`, `ROUTE_PATH_RECEIPT_INVALID`
- Overlay: `kind: "route-overlay"`, `RouteOverlayV1.blockingColliderIdentities`, `canonicalRouteOverlayV1`, `hashRouteOverlayV1`, `ROUTE_OVERLAY_INVALID`
- Connectivity: `kind: "route-connectivity-failure"` / `kind: "heightfield-route-connectivity-result"`, `status: "unreachable" \| "incomplete"`, `graphStatus: "complete" \| "unavailable"`, common singular `traversalSurfaceId` / `surfaceEntityId` / `colliderSubshapeId`, `ROUTE_CONNECTIVITY_FAILURE_CODES_V1`, `canonicalRouteConnectivityFailureV1`, `hashRouteConnectivityFailureV1`, `canonicalHeightfieldRouteConnectivityResultV1`, `assertHeightfieldRouteConnectivityResultForBuildInputV1`, `ROUTE_CONNECTIVITY_FAILURE_INVALID`, `HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID`

V2 names this task must create (do not alias to V1):

- Build Input: `kind: "route-build-input"`, `schemaVersion: 2`, `RouteTerrainSourceV2` (no nested `terrainArtifactHash`), `StaticColliderSourceV1`, `traversalSurfaces`, `staticColliders`, root hashes `terrainArtifactHash`, `colliderArtifactHash`, `geometryArtifactHash`, `surfaceArtifactHash`, budget `not-required-empty-geometry` \| `route-geometry-tile-estimate`, error `ROUTE_BUILD_INPUT_INVALID`
- Functions: `hashRouteTerrainArtifactV2`, `hashRouteColliderArtifactV2`, `hashRouteGeometryArtifactV2`, `hashRouteSurfaceArtifactV2`, `hashRouteBuildInputV2`, `assertRouteBuildInputV2`, `createRouteBuildInputReceiptV2`, `assertRouteBuildInputReceiptV2`
- Graph: `schemaVersion: 2`, add `geometryArtifactHash` and `traversalSurfaceIdentitiesById`; keep `TraversalNodeV1` triples; `canonicalTraversalGraphV2`, `hashTraversalGraphV2`, `assertTraversalGraphForBuildInputV2` (type-only / structural receipt; do not runtime-import `build-input.ts`)
- Path: delete `traversalSurfaceIdentity`; add `orderedTraversalSurfaceIdentities`; `canonicalRoutePathReceiptV2`, `hashRoutePathReceiptV2`, `assertRoutePathReceiptForGraphV2`
- Overlay: delete `traversalSurfaceIdentity` and `blockingColliderIdentities`; add `orderedTraversalSurfaceIdentities` and `staticColliderIdentities`; `canonicalRouteOverlayV2`, `hashRouteOverlayV2`, `assertRouteOverlayContextV2({ overlay, routeConnectivityResult, buildInputReceipt })`
- Connectivity: `kind: "route-connectivity-result"`, `schemaVersion: 2`, `relatedTraversalSurfaceIdentities` required sorted unique array, `ROUTE_CONNECTIVITY_FAILURE_CODES_V2`, `canonicalRouteConnectivityFailureV2`, `hashRouteConnectivityFailureV2`, `canonicalRouteConnectivityResultV2`, `assertRouteConnectivityResultForBuildInputV2`, result error `ROUTE_CONNECTIVITY_RESULT_INVALID`
- `empty-heightfield-source` only when `terrainSource.kind === "empty"` and `staticColliders.length === 0`
- New reasons: `surface-profile-missing`, `surface-correlation-missing`, `surface-correlation-ambiguous`, `traversal-surface-count-budget-exceeded`, `traversal-surface-triangle-pair-test-budget-exceeded`

- [x] **Step 1: Write and execute V1-only byte characterization guards**

Before importing any missing V2 symbol, pin one literal canonical hash for every V1 serialized root touched by this task: Build Input, Graph, Path, Overlay, Connectivity Failure, and Connectivity Result. Keep this checkpoint V1-only: it must not import V2 entrypoints or depend on module-link failure.

```bash
pnpm vitest run packages/traversal/src/build-input.test.ts packages/traversal/src/graph-contract.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/route-overlay.test.ts packages/traversal/src/connectivity-result.test.ts
```

Expected: PASS and record the six literal V1 hashes before production declaration changes. This successful characterization run is mandatory evidence; a later missing-export RED cannot substitute for it.

- [x] **Step 2: Write RED Build Input V2 tests**

In a separate V2 RED test section/file, assert V1 rejects V2 roots/fields and V2 rejects V1 roots/fields; these staging regressions are deleted with V1 in Task 9 and are not a compatibility layer.

Use one Heightfield Surface, one bound platform Collider, and one unbound wall Collider. `RouteTerrainSourceV2` contains no nested `terrainArtifactHash`. Assert:

```ts
expect(input.traversalSurfaces.map((surface) => surface.traversalSurfaceId))
  .toEqual([...expectedIds].sort());
expect(input.geometryArtifactHash).toBe(sha256CanonicalJson({
  terrainArtifactHash: input.terrainArtifactHash,
  colliderArtifactHash: input.colliderArtifactHash,
}));
expect(receipt.routeBuildInputHash).toBe(
  sha256CanonicalJson(receipt.input),
);
```

Production code calls only the public `hashRouteTerrainArtifactV2`, `hashRouteColliderArtifactV2`, `hashRouteGeometryArtifactV2`, `hashRouteSurfaceArtifactV2`, and `hashRouteBuildInputV2` helpers. Root hash is exactly `sha256CanonicalJson(canonical RouteBuildInputV2)` after admission has verified all four declared artifact hashes; the Receipt factory must call `hashRouteBuildInputV2()` rather than reimplement it. Reject reordered serialized arrays, duplicate Surface IDs, zero/multiple Terrain surfaces, missing Collider joins, stale child/root hashes, and extra fields. For bounded Terrain, require at least one Triangle and exact positive-extent `minimumMetersXZ` / `maximumMetersXZ` recomputed from all canonical soup world vertices after `-0` normalization.

Forged-bounds RED is deliberately attacker-side: widen, shrink, shift, or introduce asymmetric/`-0`
bounds without changing soup, then use raw `sha256CanonicalJson` to construct the claimed Terrain preimage,
Geometry preimage, full forged Input, and forged `routeBuildInputHash` for the attacker Receipt. Do not call admission-aware public helpers to
prepare the attack and do not weaken them into raw preimage utilities. Independently assert that
`hashRouteTerrainArtifactV2(forgedTerrainSource)`, `assertRouteBuildInputV2(forgedInput)`,
`hashRouteBuildInputV2(forgedInput)`, `createRouteBuildInputReceiptV2(forgedInput)`, and
`assertRouteBuildInputReceiptV2(attackerSuppliedReceipt)` all throw. Collider/Surface/Geometry helpers
remain pure only over their own canonical domains and are not claimed to detect Terrain they do not
receive. Add forged Envelope adversaries for each R1b field: mutate the pair-test budget or
equivalent-plane threshold and recompute Envelope/Input/artifact/Receipt hashes; admission must still fail
because the resolved Profile values do not match.

```ts
const forgedTerrainArtifactHash = sha256CanonicalJson({
  kind: forgedTerrainSource.kind,
  terrainEntityId: forgedTerrainSource.terrainEntityId,
  triangleSoup: forgedTerrainSource.triangleSoup,
  minimumMetersXZ: forgedTerrainSource.minimumMetersXZ,
  maximumMetersXZ: forgedTerrainSource.maximumMetersXZ,
});
const forgedGeometryArtifactHash = sha256CanonicalJson({
  terrainArtifactHash: forgedTerrainArtifactHash,
  colliderArtifactHash: validColliderArtifactHash,
});
const forgedInput = {
  ...validInput,
  terrainSource: forgedTerrainSource,
  terrainArtifactHash: forgedTerrainArtifactHash,
  geometryArtifactHash: forgedGeometryArtifactHash,
};
const forgedRouteBuildInputHash = sha256CanonicalJson(forgedInput);
```

Add two budget adversaries. First, `terrainSource.kind === "empty"` plus a non-empty Static Surface/Collider soup must produce `route-geometry-tile-estimate`, whose bounds are the exact world-space XZ union of all canonical soup vertices. Second, only `terrainSource.kind === "empty"` plus an empty `staticColliders` inventory may produce `not-required-empty-geometry`. Changing only an exclusion declaration while preserving the already post-exclusion soup must change `routeBuildInputHash` but not `terrainArtifactHash`/`geometryArtifactHash`; assert both the helper result and Receipt root equality after each mutation.

Import these runtime entrypoints from the Traversal package root so RED is executable rather than type-erased: `assertRouteBuildInputV2`, `hashRouteBuildInputV2`, `assertRouteBuildInputReceiptV2`, the four artifact hash helpers, and `createRouteBuildInputReceiptV2`. The literal V1 hashes are already proven green in Step 1; this separate module is now allowed to fail during missing V2 export linkage.

- [x] **Step 3: Verify Build Input RED**

```bash
pnpm vitest run packages/traversal/src/build-input.test.ts
```

Expected: FAIL because the executable V2 Build Input/hash/receipt entrypoints do not exist.

- [x] **Step 4: Implement strict V2 Build Input and receipt**

Define the exact closed Terrain and static sources:

```ts
export type RouteTerrainSourceV2 =
  | Readonly<{
      kind: "empty";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "bounded";
      terrainEntityId: string;
      triangleSoup: CanonicalTriangleSoupV1;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>;

export interface StaticColliderSourceV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly triangleSoup: CanonicalTriangleSoupV1;
}
```

Freeze these exact preimages and public helper names:

```text
hashRouteTerrainArtifactV2(empty)
  = sha256CanonicalJson({ kind, terrainEntityId })
hashRouteTerrainArtifactV2(bounded)
  = sha256CanonicalJson({ kind, terrainEntityId, triangleSoup,
                          minimumMetersXZ, maximumMetersXZ })
hashRouteColliderArtifactV2(staticColliders)
  = sha256CanonicalJson(canonical sorted staticColliders)
hashRouteGeometryArtifactV2({ terrainArtifactHash, colliderArtifactHash })
  = sha256CanonicalJson({ terrainArtifactHash, colliderArtifactHash })
hashRouteSurfaceArtifactV2(traversalSurfaces)
  = sha256CanonicalJson(canonical sorted traversalSurfaces)
hashRouteBuildInputV2(input)
  = sha256CanonicalJson(canonical RouteBuildInputV2 after verifying all four hashes)
```

Bounded Terrain must contain non-empty canonical soup and exact positive-extent XZ extrema recomputed from every world-space soup vertex after `-0` normalization. Implement this admission once in the Traversal Build Input module. `hashRouteTerrainArtifactV2()` calls that owner before hashing its canonical return; `assertRouteBuildInputV2()` and `createRouteBuildInputReceiptV2()` reuse it and do not duplicate extrema logic.

Keep raw `sha256CanonicalJson` forged-bounds preimage construction inside the RED fixture only. Public
Terrain/root hash helpers remain admission-aware and must reject the attacker input before hashing;
Receipt creation/assertion must reach the same extrema owner rather than trusting attacker-supplied child
or root strings.

Exclusions remain full Build Input fields and enter only `routeBuildInputHash`; their geometry effect is already represented by post-exclusion Terrain soup. Define `RouteBuildBudgetEvidenceV2` as `not-required-empty-geometry | route-geometry-tile-estimate`, with the estimate bounds recomputed from the Terrain + all Static Collider soup XZ union. Surface-count and triangle-pair budgets are independently recomputed from the frozen Envelope and are not duplicated in Receipt bytes. `createRouteBuildInputReceiptV2(input: RouteBuildInputV2)` canonicalizes and validates the complete input, re-resolves the Graph Builder Profile, requires exact Envelope equality, recomputes and verifies its four declared artifact hashes through the public helpers, calls `hashRouteBuildInputV2(canonicalInput)` for the root, computes combined-geometry budget evidence, and returns the deeply frozen three-field receipt `{ input, routeBuildInputHash, budgetEvidence }`. `assertRouteBuildInputReceiptV2()` constructs the expected receipt through that factory and requires full canonical byte equality. Recast uses the same public helpers to assemble the complete input, then calls this producer rather than constructing Receipt Hash or budget evidence independently. Add neither the pair-test budget nor the plane-metadata threshold to `RouteBuildBudgetEvidenceV2`.

Add strict V2 declarations/exports beside the unchanged V1 implementation as feature-branch staging. Recompute every V2 child/root hash inside the canonical validator. Do not translate, alias, auto-upgrade, or change the meaning of any V1 field; V1 remains byte-stable until Task 9 deletes it.

- [x] **Step 5: Write RED Graph/Path/Overlay/Connectivity V2 tests**

Create a Graph path whose ordered nodes use Heightfield → platform → Heightfield. Assert the aligned identities:

```ts
expect(path.orderedTraversalSurfaceIdentities).toHaveLength(
  path.orderedTraversalNodeIds.length,
);
expect(path).not.toHaveProperty("traversalSurfaceIdentity");
expect(overlay).not.toHaveProperty("traversalSurfaceIdentity");
expect(overlay).toHaveProperty("staticColliderIdentities");
expect(overlay).not.toHaveProperty("blockingColliderIdentities");
expect(overlay.orderedTraversalSurfaceIdentities).toEqual(
  path.orderedTraversalSurfaceIdentities,
);
```

Graph V2 must carry the complete `traversalSurfaceIdentitiesById` projection of `input.traversalSurfaces`, keyed by `traversalSurfaceId`; Nodes retain flat `traversalSurfaceId`, `surfaceEntityId`, and `colliderSubshapeId`. Reject a map key/value mismatch, missing/extra inventory row, a Node triple that differs from its inventory row, a Path identity that differs from the corresponding inventory row, a Graph Node Surface absent from Build Input, and mismatched `terrainArtifactHash`, `colliderArtifactHash`, `geometryArtifactHash`, or `surfaceArtifactHash`.

`RouteOverlayV2.staticColliderIdentities` must be the exact identity-only projection of all `input.staticColliders`, including Surface-bound and blocker-only rows. Overlay must carry the same field name `orderedTraversalSurfaceIdentities`; it is byte-equal to the Path inside the canonical complete Connectivity Result, equal-length/index-aligned with `orderedTraversalNodeIds`, and each row equals the corresponding Graph inventory identity. Exercise only `assertRouteOverlayContextV2({ overlay, routeConnectivityResult, buildInputReceipt })`; no overload or optional caller-supplied Path/Path Hash survives. RED missing/extra row, order drift, one-sided Overlay identity mutation with recomputed hash, both Path and Overlay mutated with recomputed hashes but unchanged Graph, replacement with another valid Build Input Surface while Node IDs remain unchanged, mutated Static Collider inventory with recomputed hash, and an untouched complete-result happy path through Validation. Traversal owns this semantic validator; Task 8's Validation publication factory owns the trusted Result + Build Input call site.

Freeze `RouteConnectivityFailureV2.relatedTraversalSurfaceIdentities` as a required array, strictly sorted/unique by `traversalSurfaceId`, with every full row contextually equal to Build Input. Delete the V1 common singular triple and every reason-local `traversalSurfaceId`; delete Heightfield-only `terrainEntityId` from threshold reasons while retaining it only on `empty-heightfield-source` as Terrain-source evidence, not Surface identity. Implement and exercise the complete design §7.1 migration table, including all retained V1 reasons, their exact reason-local field sets, allowed `status / graphStatus`, required/forbidden `traversalGraphHash`, and identity cardinalities. `empty-heightfield-source` is legal only for `terrainSource.kind === "empty"` plus `staticColliders.length === 0`, with zero related identities; empty Terrain with any platform/static geometry must continue real build and must never emit that reason.

In addition to every migrated V1 reason, exercise these exact new variants:

| reason | status / graphStatus | identity count |
| --- | --- | ---: |
| `surface-profile-missing` | `incomplete / unavailable` | 0 |
| `surface-correlation-missing` | `incomplete / unavailable` | 0..1 |
| `surface-correlation-ambiguous` | `incomplete / unavailable` | at least 2 |
| `traversal-surface-count-budget-exceeded` | `incomplete / unavailable` | 0 |
| `traversal-surface-triangle-pair-test-budget-exceeded` | `incomplete / unavailable` | 0 |

The Profile reason requires non-empty sorted `relevantColliderSubshapeIds`; unresolved Profile Refs remain Authoring/Compiler admission errors. Correlation Missing carries one identity only when a unique candidate range existed; Ambiguous carries every distinct candidate. Threshold reasons carry the sorted unique union of full identities proven by their rejection candidates and fall back to generic unreachable when that union cannot be established. Generic/start/destination/capacity reasons keep an empty identity array. Reject two rows with the same `traversalSurfaceId` even when version/hash differ, unknown codes, every common or reason-local singular V1 Surface field, and invalid reason field/status/cardinality pairs.

Import executable RED entrypoints from the package root: `canonicalTraversalGraphV2`, `hashTraversalGraphV2`, `assertTraversalGraphForBuildInputV2`, `canonicalRoutePathReceiptV2`, `hashRoutePathReceiptV2`, `assertRoutePathReceiptForGraphV2`, `canonicalRouteOverlayV2`, `hashRouteOverlayV2`, `assertRouteOverlayContextV2`, `ROUTE_CONNECTIVITY_FAILURE_CODES_V2`, `canonicalRouteConnectivityFailureV2`, `hashRouteConnectivityFailureV2`, `canonicalRouteConnectivityResultV2`, and `assertRouteConnectivityResultForBuildInputV2`. Missing functions, rather than erased interfaces, are the required initial RED.

- [x] **Step 6: Verify V2 receipt RED**

```bash
pnpm vitest run packages/traversal/src/graph-contract.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/route-overlay.test.ts packages/traversal/src/connectivity-result.test.ts
```

Expected: FAIL on missing executable V2 Graph/Path/Overlay/Connectivity entrypoints and path-global Surface assertions.

- [x] **Step 7: Implement V2 Graph and receipt contextual validation**

`RouteConnectivityResultV2` must use `kind: "route-connectivity-result"`, `schemaVersion: 2`; validate Graph inventory exactly against Build Input; validate every Node triple against its inventory row; validate every ordered Path identity against the matching Node inventory row; and never invent one Surface for a pre-correlation failure. Connectivity Result does not contain an Overlay, so its context validator must not synthesize that dependency.

Task 2 separately exports the exact closed input
`assertRouteOverlayContextV2({ overlay, routeConnectivityResult, buildInputReceipt })`. It first asserts
the Build Input Receipt, then calls `assertRouteConnectivityResultForBuildInputV2()` and requires a
complete Result. It extracts Graph/Graph Hash/Path/Path Hash only from that canonical Result, validates all
Overlay route/world/lock/anchor/ribbon/hash/ordered arrays, directly rechecks every Overlay Surface row
against the canonical Graph Node inventory, validates the exact sorted Static Collider projection, and
returns a deeply frozen canonical Overlay. This direct Node/inventory postcondition remains even though
Result admission already proved Graph↔Path context. Task 8 Validation owns the trusted complete Result +
Build Input integration point; callers cannot self-report an independent Path.

- [x] **Step 8: Run Task 2 gates and commit**

```bash
pnpm vitest run packages/traversal/src/build-budget.test.ts packages/traversal/src/build-input.test.ts packages/traversal/src/graph-contract.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/route-overlay.test.ts packages/traversal/src/connectivity-result.test.ts
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/traversal
git commit -m "feat: add multi-surface route contracts"
```

Expected: all focused tests, fixed V1-byte guards, the R1 Heightfield gate, and typecheck pass.

### Task 3: Add Traversal Surface Profile and Capability Budget

**Files:**
- Modify: `packages/traversal/src/types.ts`
- Modify: `packages/traversal/src/profile-registry.ts`
- Modify: `packages/traversal/src/profile-registry.test.ts`
- Modify: `packages/traversal/src/capability-envelope.ts`
- Modify: `packages/traversal/src/capability-envelope.test.ts`
- Modify: `packages/traversal/src/build-budget.ts`
- Modify: `packages/traversal/src/build-budget.test.ts`
- Modify: `packages/traversal/src/build-input.ts`
- Modify: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/path-receipt.test.ts`
- Modify: `packages/traversal/src/connectivity-result.test.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `apps/playground/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `TraversalSurfaceProfileV1` and built-in `worldkit://traversal-surface-profile/ground.static@1`.
- Adds provider-neutral `maximumTraversalSurfaceCount`,
  `minimumEquivalentPlaneNormalDotRatio`, and
  `maximumTraversalSurfaceTrianglePairTestCount` to `TraversalGraphBuilderProfileV2` and
  `TraversalCapabilityEnvelopeV1`.
- Extends the existing R1 V1 Build Input's exact closed Envelope admission with all three fields so Wave
  1 preserves the Heightfield gate until Task 2 introduces V2.
- Keeps downstream Path, Connectivity, Probe, and Browser fixtures bound to the exact resolved built-in Profile hash and Envelope bytes instead of duplicating a stale hash literal. Playground tests import the resolver only from the public `@whitebox-world/traversal` package root and declare that package as a direct dev dependency; no deep-relative package-internal import is allowed.

- [x] **Step 1: Write RED Profile and Envelope tests**

Assert the built-in Profile is exactly:

```ts
{
  kind: "traversal-surface-profile",
  schemaVersion: 1,
  traversalMode: "ground",
  faceSelectionMode: "subject-slope-compatible",
}
```

Prove the built-in V2 Graph Builder Profile fixes `maximumTraversalSurfaceCount` at `61`,
`minimumEquivalentPlaneNormalDotRatio` at `0.99999` (approximately 0.256° and only pair-plane
metadata), and `maximumTraversalSurfaceTrianglePairTestCount` at `4_000_000`. The threshold accepts only
`(0, 1]`; the budget accepts only positive safe integers no greater than
`Number.MAX_SAFE_INTEGER - 1`. The Envelope copies all three, rejects provider-named fields, changes its
hash when any value changes, and remains admissible to the existing R1 V1 Build Input. The 4,000,000
default is a conservative policy cap derived from the existing generic geometry-predicate ceiling, not
a claim that point and pair predicates have equivalent cost.

Keep the core RED assertions in `profile-registry.test.ts`, `capability-envelope.test.ts`, and `build-budget.test.ts`: those tests must fail before the Profile and all three Envelope fields exist. Run the Path Receipt, Connectivity Result, Runtime Probe, and Browser API fixtures in the same integration command as stale-identity guards, but do not require all four downstream fixtures to fail in the initial RED state. Their Profile hash and Envelope-derived fields must come from `resolveTraversalGraphBuilderProfileV2()` / `createTraversalCapabilityEnvelopeV1()` rather than the pre-R1b literal, so the Profile content change cannot leave internally inconsistent fixtures green.

- [x] **Step 2: Verify RED**

```bash
pnpm vitest run packages/traversal/src/profile-registry.test.ts packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-budget.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/connectivity-result.test.ts packages/traversal/src/runtime-probe-contract.test.ts apps/playground/src/worldkit-browser-api.test.ts
```

Expected: FAIL in the core Profile/Envelope/budget assertions because the Surface Profile and three
Envelope fields are absent. The four downstream fixture suites may still pass before the content-hash
change; they become mandatory green integration gates after Step 3 updates the resolved Profile identity
and Envelope-derived fixture values.

- [x] **Step 3: Implement Profile resolution and generic budget**

Keep slope, step, capsule, clearance, speed, and Provider area values out of `TraversalSurfaceProfileV1`. Adapter admission consumes only the three provider-neutral values already copied into the Envelope. Update every listed downstream fixture to derive the built-in Graph Builder Profile hash and Envelope fields from the public resolver/factory. In `apps/playground/src/worldkit-browser-api.test.ts`, import `resolveTraversalGraphBuilderProfileV2` from `@whitebox-world/traversal`, add `@whitebox-world/traversal: "workspace:*"` to Playground `devDependencies`, and refresh `pnpm-lock.yaml`; do not reach into `packages/traversal/src` from the app.

- [x] **Step 4: Run Task 3 gates and commit**

```bash
pnpm install
pnpm vitest run packages/traversal/src/profile-registry.test.ts packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-budget.test.ts packages/traversal/src/build-input.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/connectivity-result.test.ts packages/traversal/src/runtime-probe-contract.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/traversal apps/playground/src/worldkit-browser-api.test.ts apps/playground/package.json pnpm-lock.yaml
git commit -m "feat: define static traversal surface profile"
```

Expected: all focused tests, the R1 Heightfield gate, and typecheck pass.

## Phase B — Shared geometry and multi-source Graph

### Task 4: Share Surface Hit Classification and Static Collider Sources

**Start conditions and ordering:**

- Start only after Task 1's closed Heightfield/static `ExecutionTraversalSurfaceV1` union and Task 2's
  `StaticColliderSourceV1`, four V2 hash helpers, strict validators, and
  `createRouteBuildInputReceiptV2()` are integrated on this branch.
- Task 4 owns pure shared query/preflight mechanics and the Execution Collider -> static source
  projection. It does not construct `RouteBuildInputReceiptV2`, reimplement hash preimages/budget, or
  publish a multi-Surface Graph.
- Integrated Task 5 does not modify `heightfield-source.ts` and has no direct textual overlap. Task 4
  must land before Task 6 because both Task 4 and Task 6 modify `heightfield-source.ts` and its tests.

**Files:**
- Modify: `packages/terrain-surface/src/static-collider-triangle-mesh.ts`
- Modify: `packages/terrain-surface/src/static-collider-triangle-mesh.test.ts`
- Modify: `packages/terrain-surface/src/triangle-heightfield.test.ts`
- Modify: `packages/terrain-surface/src/terrain-surface.test.ts`
- Create: `packages/terrain-surface/src/traversal-surface-query.ts`
- Create: `packages/terrain-surface/src/traversal-surface-query.test.ts`
- Modify: `packages/terrain-surface/src/index.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.test.ts`

**Interfaces:**
- Produces unit-bearing constants with exact values:
  `TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1 = 0.00001`,
  `TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1 = 1e-10`, and
  `TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1 = 0.00001`.
- Produces `CanonicalTraversalSurfaceTriangleSourceV1`, plural
  `queryCanonicalTraversalSurfaceHitsV1()` with shared owner resolution,
  and budgeted `preflightCanonicalTraversalSurfaceOverlapsV1()` exactly as frozen in design §9.1.
- Keeps the single-triangle leaf and source-pair classifier package-private and out of the package-root
  exports. Task 6/7 consume only the plural point query and public preflight.
- Keeps equivalent-plane and retained-support normal thresholds caller-owned; does not add a global
  normal epsilon and never flips downward normals upward.
- Replaces duplicated Recast Euler/TRS geometry code with the existing world-space `emitTransformedStaticColliderTriangleMeshV1()` authority.

- [x] **Step 1: Write RED asymmetric geometry tests**

Write RED tests for the exact query and pair contracts before production exports exist:

- XZ points at `epsilon - delta`, exactly epsilon, and `epsilon + delta` on both 1m and 100m
  triangles, proving meter-distance scale independence and separate area/height dimensions;
- downward bottom, vertical wall, legal slope, and over-slope faces; assert there is no normal flip;
- two triangles of one Heightfield Surface on the canonical diagonal resolve one Surface, not
  ambiguity;
- one interior plus another boundary resolves the interior; two distinct interior Surface IDs are
  ambiguous even when coplanar;
- multiple boundary-only Surface IDs always select the code-point-lowest ID after Y/normal admission,
  including flat↔ramp, ridge, and legal 0.25m step seams; only multiple admitted interiors are ambiguous;
- coplanar interior overlap, crossing-slope overlap, exact boundary-only boxes, a 1cm gap, and
  vertically stacked layers close the pairwise relation partition;
- canonical triangle ordinal is the source's original `triangleIndices` tuple offset divided by 3,
  fixed before any filter; normal/slope filtering must not renumber it;
- source inventory reversal preserves plural query/preflight output and its ordering. Do not assert
  arbitrary triangle-soup byte reversal preserves a child hash;
- reject unknown fields, malformed/non-integer/out-of-range indices, non-finite values, duplicate
  Surface IDs, 3D zero-area triangles, zero-length normals, invalid closed enums, threshold outside
  `(0, 1]`, and pair budget outside positive safe integer `<= Number.MAX_SAFE_INTEGER - 1`; accept legal
  open Heightfield/static sheets and vertically projected-degenerate walls without manifold/watertight
  closure; normal admission excludes walls; assert every returned object/array is deeply frozen;
- prove deterministic streaming budget behavior: limit 1 with many overlapping candidates classifies
  the first and returns `budget-exceeded` on the second, with `minimumRequiredCount === 2`; forged budget
  values fail before broadphase work.

- [x] **Step 2: Verify geometry RED**

```bash
pnpm vitest run packages/terrain-surface/src/traversal-surface-query.test.ts packages/terrain-surface/src/static-collider-triangle-mesh.test.ts
```

Expected: FAIL because the shared query module does not exist.

- [x] **Step 3: Implement deterministic shared query classification**

Use deterministic world-space vector math through existing terrain-surface utilities. XZ point
admission compares perpendicular edge distance only with
`TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1`; projected intersection area uses only the square-meter
constant; caller-provided Y and normal bands remain explicit inputs.

`queryCanonicalTraversalSurfaceHitsV1()` groups qualifying triangles by `traversalSurfaceId`, emits at
most one hit per Surface, sorts by code-point ID, deep-freezes output, and owns the complete resolution:
missing; unique interior; multiple interiors ambiguous; or any boundary-only set resolved to the
code-point-lowest ID. Inside one Surface, tie-break by interior, smallest absolute Y difference, largest
retained-normal dot when present, then the pre-filter canonical triangle ordinal. Expected Path state
never chooses Runtime actual owner; retained normal only participates in admission/tie-break.

The package-private source-pair classifier partitions disjoint / boundary-only with equivalent-plane
metadata / interior-overlap with same-band-or-distinct-layer. Compute minimum absolute affine height
separation over the projected intersection polygon, including zero when signed vertex values cross.
`preflightCanonicalTraversalSurfaceOverlapsV1()` canonicalizes sources by ID, streams source pairs, then
first triangle ordinals, and consumes second ordinals from a deterministic XZ index in ascending order.
Count and classify each candidate immediately; return the first same-band interior blocker, or return
`traversal-surface-triangle-pair-test-budget-exceeded` before classifying candidate `maximum + 1`.
Never materialize all candidate pairs or an unbounded per-triangle result array. Boundary-only and
distinct-layer pairs remain clear regardless of pair-plane metadata. Count broadphase candidates before
normal admission, including candidates that classification later rejects for slope/normal, so budget
results cannot drift with filter order.

Implement legacy `sampleTriangleHeightfieldSurface()` and
`queryStaticColliderTriangleMeshSupportHeightMetersV1()` as compatibility facades over the shared
package-private triangle primitive. Delete or deprecate independent barycentric/vertical-query code and
prove no third semantic implementation remains.

- [x] **Step 4: Write RED shared-emitter Recast test**

Spy on the shared emitter output only through value comparison: Graph source positions/indices must
equal `emitTransformedStaticColliderTriangleMeshV1()` `worldPositionsMetersXYZ`/indices for asymmetric
multi-axis Euler rotation and non-uniform scale. Canonical JavaScript double arrays must be equal
byte-for-byte; Babylon Float32 is not part of this Task 4 assertion. Delete expectations tied to the
duplicate Recast TRS implementation and remove the local Euler/`transformSoup` path from
`heightfield-source.ts`.

- [x] **Step 5: Implement shared source emission and preflight**

Build `StaticColliderSourceV1` only in Traversal-Recast from the Execution Collider and the shared
emitter: copy `entityId`, `logicalSubshapeId`, `colliderSubshapeId`, and `colliderHash` from the compiled
Collider row; map `worldPositionsMetersXYZ` to `triangleSoup.positionsMetersXYZ`; and copy triangle
indices exactly. `@whitebox-world/traversal` owns only the provider-neutral soup contract and must not
import Runtime Contracts; moving the emitter or Execution type into Traversal would create the wrong
dependency direction. Fail closed on same-band interior overlap, but retain boundary-only seams and
distinct Y layers.

The Task 4 preflight is a pure deterministic utility only. Task 6 maps its first blocking witness to the
V2 ambiguity failure and maps budget exhaustion to
`traversal-surface-triangle-pair-test-budget-exceeded` / `ROUTE_GRAPH_BUDGET_EXCEEDED`, with zero related
Surface identities and exact `maximumAllowedCount` / `minimumRequiredCount = maximum + 1`. Task 4 must
not construct Connectivity failures or claim Graph support. The Profile/Envelope own
`maximumTraversalSurfaceTrianglePairTestCount = 4_000_000` and
`minimumEquivalentPlaneNormalDotRatio = 0.99999`; the former is a conservative policy cap borrowed from
the existing generic geometry-predicate ceiling, not a performance-equivalence claim.

Babylon 9.21.2 Float32 agreement belongs only to Task 7's private Runtime Adapter conformance. Its
per-axis tolerance is `1e-6m + 2 * 2^-23 * max(1, operationMagnitudeMeters)`, where operation magnitude
is computed from canonical translation plus the sum of absolute canonical linear-transform × local
vertex terms. It never uses only final-coordinate magnitude and never enters Canonical Schema, query
constants, public protocols, receipts, Profiles, or hashes.

- [x] **Step 6: Benchmark the admitted ceiling and record Task 4 disposition**

After focused GREEN, run a deterministic representative R1b fixture and a near-4,000,000-candidate
adversarial fixture on a supported environment. Record command, OS/CPU/runtime versions, source/triangle/
candidate counts, wall time, and peak RSS in the Task 4 disposition. The benchmark is release-policy
evidence, not a machine-independent pass threshold. If time or memory is unacceptable, change the
unreleased Profile value and content Hash, rerun Profile/Envelope/query RED→GREEN, and repeat independent
review before Task 6 starts.

- [x] **Step 7: Run Task 4 gates and commit**

```bash
pnpm vitest run packages/terrain-surface/src packages/traversal-recast/src/heightfield-source.test.ts
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/terrain-surface packages/traversal-recast/src/heightfield-source.ts packages/traversal-recast/src/heightfield-source.test.ts
git commit -m "feat: share traversal surface geometry queries"
```

Expected: all focused tests and the R1 Heightfield gate pass, canonical source arrays equal the shared
emitter arrays exactly, the R1 duplicate TRS path is removed, no package-root pair classifier is
exported, and the benchmark disposition records elapsed time plus peak memory.

### Task 5: Add the Private Layered Recast Source Mode

**Files:**
- Modify: `patches/@recast-navigation__generators@0.43.1.patch`
- Modify: `packages/traversal-recast/src/provider-lifecycle.ts`
- Modify: `packages/traversal-recast/src/provider-lifecycle.test.ts`
- Modify: `packages/traversal-recast/src/provider-acceptance.test.ts`
- Modify: `packages/traversal-recast/src/provider-patch-identity.test.ts`
- Modify: `packages/traversal-recast/src/adapter-identity.ts`
- Modify: `packages/traversal-recast/src/adapter-identity.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Adds private `sourceAreaMode.kind = "layered-traversal-sources-r1b"` with closed `candidateSourceRanges` and `blockerStartVertexIndex`.
- Returns no Provider area/tag in public or canonical results.

- [x] **Step 1: Write RED installed-provider acceptance tests**

Use real `generateTiledNavMesh` to prove:

1. bound box top publishes a walkable polygon;
2. equal unbound box top does not;
3. adjacent coplanar bound boxes retain distinct source ranges/polygons;
4. slope-incompatible faces remain non-walkable;
5. 61 candidate ranges are accepted, while 62 candidate ranges fail before Provider execution.

- [x] **Step 2: Verify provider RED**

```bash
pnpm vitest run packages/traversal-recast/src/provider-acceptance.test.ts packages/traversal-recast/src/provider-lifecycle.test.ts
```

Expected: FAIL because the installed patch only accepts `terrain-with-static-blockers-r1`.

- [x] **Step 3: Patch the exact Provider pipeline order**

Implement and test:

```text
markWalkableTriangles
→ unique candidate triangle area by canonical range
→ blocker triangle area
→ rasterize/buildCompactHeightfield
→ blocker compact span null
→ contour/simplify/polygonize
```

Validate every triangle belongs entirely to one declared vertex range. Reserve area `0` for null, `1` for blocker, and `63` for the Recast walkable sentinel; map candidate ordinals `0..60` to `2..62`. Reject mixed-range indices, overlapping ranges, unsorted ordinals, out-of-bounds ranges, 62 candidate ranges, and unknown fields.

- [x] **Step 4: Refresh patch and Adapter identities**

Update the patch fingerprint and `TRAVERSAL_RECAST_ADAPTER_IDENTITY_V1` hash through the repository's existing canonical identity helpers. Do not hand-edit expected hashes without a test demonstrating the new bytes.

- [x] **Step 5: Run Task 5 gates and commit**

```bash
pnpm install
pnpm vitest run packages/traversal-recast/src/provider-acceptance.test.ts packages/traversal-recast/src/provider-lifecycle.test.ts packages/traversal-recast/src/provider-patch-identity.test.ts packages/traversal-recast/src/adapter-identity.test.ts
pnpm typecheck
git add patches packages/traversal-recast pnpm-lock.yaml
git commit -m "feat: preserve layered traversal sources in recast"
```

Expected: real Provider acceptance and identity tests pass.

### Task 6: Build and Query the Multi-Surface Canonical Graph

**Files:**
- Modify: `packages/traversal-recast/src/heightfield-source.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.test.ts`
- Modify: `packages/traversal-recast/src/build-graph.ts`
- Modify: `packages/traversal-recast/src/build-graph.test.ts`
- Modify: `packages/traversal-recast/src/query-route.ts`
- Modify: `packages/traversal-recast/src/query-route.test.ts`
- Modify: `packages/traversal-recast/src/evaluate-route.ts`
- Modify: `packages/traversal-recast/src/evaluate-route.test.ts`
- Modify: `packages/traversal-recast/src/build-rejection-graph.ts`
- Modify: `packages/traversal-recast/src/build-rejection-graph.test.ts`
- Modify: `packages/traversal-recast/src/route-rejection-proof.ts`
- Modify: `packages/traversal-recast/src/route-rejection-proof.test.ts`

**Interfaces:**
- Maps `RouteBuildInputV2` to one ordered candidate-prefix/blocker-suffix Provider operation.
- Uses Task 2's four public hash helpers to populate the complete V2 Input, then calls `createRouteBuildInputReceiptV2(input)`. It does not define another preimage, construct a Receipt Hash, or calculate combined-geometry budget evidence independently; the factory recomputes the four declared hashes as validation.
- Projects each polygon's private source range back to one Canonical Surface, publishes the complete `TraversalGraphV2.traversalSurfaceIdentitiesById` inventory once, keeps only the three stable Surface IDs on each Node, and publishes `RoutePathReceiptV2` from that inventory.
- Calls Task 4 public preflight with same-band/equivalent-height derived only from
  `positionQuantizationMeters / 2 + TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1`, the locked slope
  cosine, and the two exact Capability Envelope fields. It does not call the package-private pair
  classifier or create a second same-band authority.
- Produces provider-private `TraversalGraphProjectionV2` and `QueryRequiredRouteInputV2` beside the staging V1 types; neither may retain Heightfield-only Build Input/Graph assumptions. Task 9 deletes `HeightfieldTraversalGraphProjectionV1`, `QueryRequiredRouteInputV1`, and their V1 constructor/assert/canonical/hash satellites after all call sites migrate.

- [x] **Step 1: Write RED successful multi-Surface Graph test**

Build Heightfield → 0.25m step chain → platform → ramp → Heightfield. Assert complete Path, ordered Surface sequence, `step` edges at legal risers, and no Provider fields in serialized Graph/Path.

- [x] **Step 2: Verify Graph RED**

```bash
pnpm vitest run packages/traversal-recast/src/heightfield-source.test.ts packages/traversal-recast/src/build-graph.test.ts packages/traversal-recast/src/query-route.test.ts
```

Expected: FAIL because the R1 mapper puts every static Collider in the blocker suffix and stamps one Heightfield identity on every Node.

- [x] **Step 3: Implement multi-source mapping and Node correlation**

Sort candidate ranges by `traversalSurfaceId`, blockers by `colliderSubshapeId`, and verify private tag → source range → Surface/geometry hashes. Build Graph inventory from the exact canonical `input.traversalSurfaces` rows; each emitted Node triple must match the referenced inventory row. Query only the tagged canonical source through Task 4 `queryCanonicalTraversalSurfaceHitsV1()`, using quantized Node Y, `positionQuantizationMeters / 2 + TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1`, and `minimumUpwardNormalYRatio = cos(maxSlopeDegrees)`. Delete Task 6's barycentric epsilon/leaf; never select highest/lowest/nearest Surface or repeat Resource Ref/Version/Hash on every Node. Route evaluation consumes only `TraversalGraphProjectionV2` + `RouteBuildInputReceiptV2` through `QueryRequiredRouteInputV2`; do not hide a Heightfield/V1 receipt behind an unchanged internal type.

- [x] **Step 4: Write RED failure and rejection-proof tests**

Cover 0.35m step, 1cm gap, narrow tread, low overhead, missing Profile, forged Collider binding, coplanar interior overlap, stacked layers, Surface-count overflow, and triangle-pair limit 1 overflow. Assert the pair budget exits on candidate 2 and maps to the exact reason/zero identities/count fields. Each dedicated diagnostic must be backed by a one-relaxation rejection proof; mixed failures remain generic.

- [x] **Step 5: Implement multi-Surface edges and V2 failures**

Publish only `walk | slope | step`. A seam requires canonical boundary evidence. Do not use visual bounds or raw Provider adjacency to bridge a gap. Populate `relatedTraversalSurfaceIdentities` only from canonical Build Input rows and obey Task 2 reason cardinalities: Profile Missing has zero identities plus collider evidence, Correlation Missing has zero or one, Correlation Ambiguous has at least two, and both Surface-count and triangle-pair-test budgets have zero. The latter uses `traversal-surface-triangle-pair-test-budget-exceeded`, `maximumAllowedCount = Envelope budget`, and `minimumRequiredCount = maximum + 1`; do not copy it into `RouteBuildBudgetEvidenceV2`.

- [x] **Step 6: Run Task 6 gates and commit**

```bash
pnpm vitest run packages/traversal-recast/src
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/traversal-recast
git commit -m "feat: build multi-surface traversal graphs"
```

Expected: multi-Surface success/failure tests pass and R1 remains green.

## Phase C — Runtime evidence, publication, and gates

### Task 7: Correlate the Retained Babylon Support Sample to Static Surfaces

**Files:**
- Modify: `packages/runtime-babylon/src/traversal-runtime-internal.ts`
- Modify: `packages/runtime-babylon/src/traversal-runtime-port.ts`
- Modify: `packages/runtime-babylon/src/traversal-runtime-port.test.ts`
- Modify: `packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Extends `classifySurface()` over the complete Execution Surface/Collider index while consuming one retained `RetainedCharacterSupportSampleV1`.
- Keeps `TraversalRuntimeTickEvidenceV1` free of expected Path Surface state.
- Consumes Task 4 `queryCanonicalTraversalSurfaceHitsV1()` and its owner resolution; Runtime does not
  retain a duplicate vertical-triangle classifier or flip downward normals.
- Builds one canonical JavaScript-double source inventory for Heightfield plus all bound Static
  Surfaces and performs one shared plural query per retained support sample. Babylon Mesh is private
  conformance evidence only, not a semantic query source.
- Keeps Babylon/Havok Float32 conformance tolerance private to the Runtime Adapter and out of every
  Canonical/public/hash contract.

- [x] **Step 1: Write RED Runtime correlation tests**

Cover Heightfield, bound static platform, unbound Collider, dynamic support, flat↔ramp/ridge/0.25m exact
seams, coplanar overlap, stacked lower layer, downward bottom/vertical side rejection, `SLIDING`, Reset,
Rebind, and two Runtime instances. Assert `checkSupport()` is called once per tick in every case. The
Runtime query uses retained pre-integration foot Y,
`keepDistanceMeters + keepContactToleranceMeters`, and retained-support admission whose upward/reference
dot thresholds both come from locked Live Lock `maxSlopeCosine`; expected Path state never selects the
actual Surface owner. Add non-orthogonal multi-axis Euler + non-uniform scale conformance fixtures at
ordinary scale and 100m/1km/10km cancellation. Prove Babylon/Havok positions agree with the canonical
emitter under private per-axis tolerance
`1e-6m + 2 * 2^-23 * max(1, operationMagnitudeMeters)`, with operation magnitude derived from canonical
translation plus absolute linear-transform × local-vertex terms. A wrong Euler order must still fail;
do not assert byte equality at the Float32 engine boundary.

- [x] **Step 2: Verify Runtime RED**

```bash
pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts
```

Expected: FAIL because static support is currently counted only as Heightfield ambiguity/unmatched.

- [x] **Step 3: Implement immutable static Surface correlation**

Index canonical sources by `colliderSubshapeId`, then query Heightfield plus compiled Surface-bound rows
in one shared plural call and join its returned `traversalSurfaceId` to the Execution Surface inventory.
Use the Runtime Adapter Live Lock contact band and retained pre-integration foot/normal. Delete the
duplicate `verticalTriangleHit()` path, private barycentric epsilon, and negative-normal flip; compatibility
sampler facades must reuse Task 4's shared package-private leaf. Return
`unsupported | unmatched | ambiguous | resolved` without changing movement state.

- [x] **Step 4: Run Task 7 gates and commit**

```bash
pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts packages/runtime-babylon/src/runtime.test.ts
pnpm verify:route-r1-heightfield
pnpm typecheck
git add packages/runtime-babylon
git commit -m "feat: resolve runtime support on static surfaces"
```

Expected: Runtime tests pass with exactly one support query per tick.

### Task 8: Add Probe V2 3D Support Station and Prepare Browser V5

**Files:**
- Modify: `packages/traversal/src/runtime-probe-contract.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`
- Modify: `packages/traversal/src/runtime-evidence.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `packages/validation/src/route-runtime-probe.ts`
- Modify: `packages/validation/src/route-runtime-probe.test.ts`
- Modify: `packages/validation/src/route-evaluator.ts`
- Modify: `packages/validation/src/route-evaluator.test.ts`
- Modify: `packages/validation/src/route-evidence-publication.ts`
- Modify: `packages/validation/src/route-evidence-publication.test.ts`
- Modify: `packages/runtime-contracts/src/browser-route-evidence.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`

**Interfaces:**
- Produces `RouteRuntimeProbeRequestV2`, `RouteRuntimeProbeTickV2`, `RouteRuntimeProbeReceiptV2`, `WorldkitBrowserRouteEvidencePublicationV2`, `RouteEvidenceProjectionV2`, and `WorldkitBrowserApiV5`.
- Adds `expectedTraversalSurfaceIds` only to Probe ticks.
- Exports the Probe V2 contract from the `@whitebox-world/traversal` package root so Validation never imports a package-internal source path.
- Validation's `createWorldkitBrowserRouteEvidencePublicationV2()` passes each admitted row's exact
  `routeConnectivityResult` and `routeBuildInputReceipt` to Task 2
  `assertRouteOverlayContextV2()` before hashing/publishing `staticColliderIdentities`, and uses the
  returned canonical Overlay for evidence bytes, Overlay Hash, and Browser DTO. Runtime Contracts/Browser
  must not recreate Build Input/Graph provenance checks or expose the deleted V1
  `blockingColliderIdentities` name.
- Runtime Contracts performs only standalone closed-shape/child-hash/Path-Overlay,
  selector/publication-consistency, and deep-freeze checks; Browser V5 installs the Trusted Host's
  canonical DTO and is not a raw-publication provenance owner.
- Defines and tests V5 builders/contracts beside unchanged V4 declarations, but does not switch `window.__WORLDKIT__` or trusted-host consumers until Task 9's atomic cutover.

- [x] **Step 1: Write RED 3D station tests**

Prove:

1. 2.4m XZ lookahead before a step still expects Heightfield support;
2. the legal transition edge allows its two endpoint Surfaces;
3. after reaching the platform segment, lower same-XZ Heightfield support mismatches;
4. A→B→C exact seam keeps only adjacent tied segments;
5. Reset/Rebind restores station to the start;
6. 30/60/120-like render cadence produces byte-identical Probe receipts.

- [x] **Step 2: Verify Probe RED**

```bash
pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts
```

Expected: FAIL because Probe V1 uses a path-global Surface and XZ progress only.

- [x] **Step 3: Implement Probe-private monotonic 3D station**

Bound each tick's search window with resolved `control-feel-profile.walkSpeedMetersPerSecond * fixedTimeStepSeconds + positionQuantizationMeters`; permit one quantization band of physical backtrack. Deduplicate endpoint Surface IDs in canonical order. Keep Driver Intent computation unchanged.

- [x] **Step 4: Write RED Browser V5 tests**

Assert V5 preserves V4 methods but route evidence publishes V2 Path/Overlay arrays plus `staticColliderIdentities`, rejects old `traversalSurfaceIdentity` and `blockingColliderIdentities`, deep-freezes results, and never exposes Provider fields. At the Validation factory: mutate one Overlay Surface identity and its hash; mutate the same Path+Overlay identity and both hashes while leaving Graph unchanged; replace both with another valid Build Input Surface while preserving Node IDs; and mutate one Static Collider inventory row plus Overlay hash. Every case must fail through Traversal-owned `assertRouteOverlayContextV2()` using the exact row Result + Build Input Receipt. The untouched complete Result must retain identical canonical Path/Overlay bytes and hashes through Validation, Runtime Contracts, and Browser. At Runtime Contracts/Browser standalone admission, tamper a Path identity, Path Receipt Hash, closed field, or child hash and prove those locally self-verifiable corruptions fail. Do not claim that a context-free Browser canonicalizer can detect forged Graph/Collider provenance plus attacker-recomputed hashes.

- [x] **Step 5: Implement route evidence V2 and Browser V5 preparation**

Add strict V5 builders and V2 projection without alias fields, fallback reads, or V1↔V2 conversion. `createWorldkitBrowserRouteEvidencePublicationV2()` imports `assertRouteOverlayContextV2()` from the Traversal package root and passes the exact `validationRow.routeConnectivityResult` and `validationRow.routeBuildInputReceipt`; it hashes/publishes only the returned canonical Overlay. Runtime Contracts deletes Browser-owned V1 Build Input/Graph/Collider provenance reconstruction but retains standalone closed-shape, nested hash, Path/Overlay internal consistency, selector/publication consistency, and deep-freeze checks. Browser exposes no arbitrary raw-publication trust setter and installs only the canonical DTO delivered by the Trusted Host. Any CLI/file/network raw ingress is admitted by Validation/Trusted Host with the corresponding Validation Receipt, Build Input Receipt, and hash chain before this factory; it must not bypass the factory by type assertion. Keep the installed `window.__WORLDKIT__` V4 until Task 9 so the unmodified trusted host remains green; Task 9 switches the window, host, CLI, examples, generated/public exports, and tests atomically, then deletes V4/V1.

- [x] **Step 6: Run Task 8 gates and commit**

```bash
pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts packages/validation/src/route-evaluator.test.ts packages/validation/src/route-evidence-publication.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm typecheck
git add packages/traversal packages/validation packages/runtime-contracts apps/playground/src/worldkit-browser-api.ts apps/playground/src/worldkit-browser-api.test.ts
git commit -m "feat: publish multi-surface route evidence"
```

Expected: focused tests and typecheck pass.

### Task 9: Atomically Cut Over V2/V5 and Add the R1b Golden Gate

**Status as of 2026-08-24:** complete on the Task 9 integration worktree based
on `codex/r1b-integration@c48537f`. The atomic V2/V5 public cutover, fixture
inventory, eleven Authoring worlds, consumer census, both verifier-only
negative proofs, and the focused blocking gates are complete. The accepted
fixture disposition and fresh evidence are recorded in
`docs/reviews/2026-08-24-route-r1b-task9-fixture-disposition.md`. This Task 9 handoff did not
itself close Task 10, R1b, or M5; the Task 10 evidence below now closes all three.

**Files:**
- Create: `examples/traversal/r1b-static-platform/success-steps-platform-ramp.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-step-height.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-surface-gap.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-narrow-tread.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-low-overhead.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-missing-surface-profile.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-wrong-collider-binding.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-wrong-runtime-surface.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-platform-edge-fall.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-overlapping-surfaces.world.json`
- Create: `examples/traversal/r1b-static-platform/fail-runtime-overlapping-surfaces.world.json`
- Modify: `examples/traversal/route-r0-contract.json`
- Create: `scripts/verify-route-r1b-static-platform.ts`
- Create: `scripts/verify-route-r1b-static-platform.test.ts`
- Modify: `packages/traversal/src/build-input.ts`
- Modify: `packages/traversal/src/build-input.test.ts`
- Modify: `packages/traversal/src/graph-contract.ts`
- Modify: `packages/traversal/src/graph-contract.test.ts`
- Modify: `packages/traversal/src/path-receipt.ts`
- Modify: `packages/traversal/src/path-receipt.test.ts`
- Modify: `packages/traversal/src/route-overlay.ts`
- Modify: `packages/traversal/src/route-overlay.test.ts`
- Modify: `packages/traversal/src/connectivity-result.ts`
- Modify: `packages/traversal/src/connectivity-result.test.ts`
- Modify: `packages/traversal/src/runtime-evidence.ts`
- Modify: `packages/traversal/src/runtime-evidence.test.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.ts`
- Modify: `packages/traversal/src/runtime-probe-contract.test.ts`
- Modify: `packages/traversal/src/index.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.ts`
- Modify: `packages/traversal-recast/src/heightfield-source.test.ts`
- Modify: `packages/traversal-recast/src/build-graph.ts`
- Modify: `packages/traversal-recast/src/build-graph.test.ts`
- Modify: `packages/traversal-recast/src/build-rejection-graph.ts`
- Modify: `packages/traversal-recast/src/build-rejection-graph.test.ts`
- Modify: `packages/traversal-recast/src/query-route.ts`
- Modify: `packages/traversal-recast/src/query-route.test.ts`
- Modify: `packages/traversal-recast/src/evaluate-route.ts`
- Modify: `packages/traversal-recast/src/evaluate-route.test.ts`
- Modify: `packages/traversal-recast/src/index.ts`
- Modify: `packages/traversal-recast/src/public-boundary.test.ts`
- Modify: `packages/validation/src/route.ts`
- Modify: `packages/validation/src/route.test.ts`
- Modify: `packages/validation/src/route-evaluator.ts`
- Modify: `packages/validation/src/route-evaluator.test.ts`
- Modify: `packages/validation/src/route-evidence-publication.ts`
- Modify: `packages/validation/src/route-evidence-publication.test.ts`
- Modify: `packages/validation/src/route-runtime-probe.ts`
- Modify: `packages/validation/src/route-runtime-probe.test.ts`
- Modify: `packages/runtime-contracts/src/browser-route-evidence.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `scripts/lib/route-validation-orchestrator.ts`
- Modify: `scripts/lib/route-validation-orchestrator.test.ts`
- Modify: `scripts/lib/route-validation-cli.ts`
- Modify: `scripts/lib/route-validation-cli.test.ts`
- Modify: `scripts/lib/route-validation-runner.ts`
- Modify: `scripts/lib/route-runtime-probe.integration.test.ts`
- Modify: `scripts/lib/traversal-area-runtime-collision.integration.test.ts`
- Modify: `scripts/lib/worldkit-route-evidence-transport.ts`
- Modify: `scripts/lib/worldkit-server.ts`
- Modify: `scripts/lib/worldkit-server.test.ts`
- Modify: `scripts/worldkit-route-run.integration.test.ts`
- Modify: `scripts/worldkit.test.ts`
- Modify: `scripts/verify-route-r0-contract.ts`
- Modify: `scripts/verify-route-r1-heightfield.ts`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `package.json`

**Interfaces:**
- Adds blocking `pnpm verify:route-r1b-static-platform`.
- Publishes a machine-readable inventory of fixtures, expected Graph/Runtime outcomes, hashes, and adversarial check IDs.
- Switches `window.__WORLDKIT__`, trusted host, Validation, CLI, R0/R1 verifiers, examples, and public exports to V5/V2 in one commit, then deletes every V4/V1 Route declaration; no alias or conversion layer survives.
- Owns a repository-wide consumer census over production, tests, apps, scripts, examples, and `docs/17-canonical-json-quickstart.md`; historical reviews/specs are outside the scan root, while the R0 JSON fixture receives an explicit parsed Graph V2 assertion.

- [x] **Step 1: Write RED gate inventory test**

Require the success fixture plus all failure fixtures—including the distinct Graph-overlap and injected-complete/Runtime-ambiguous overlap cases—exact expected diagnostic codes, real Recast/Babylon flags, repeat/concurrent hashes, cadence hashes, cleanup checks, provider-leak scan results, and a zero-match legacy Route V1/Browser V4 public-symbol/field scan. The machine-readable result must include a `legacyConsumerCensus` with fixed search roots, the symbol-family pattern, the deleted `blockingColliderIdentities` / Heightfield-only budget discriminators, historical exclusions, match count, and matched paths. It must discover consumers from repository contents rather than compare against a hand-maintained file allowlist. Parse `examples/traversal/route-r0-contract.json` separately and require its embedded Graph evidence to be V2 with valid child/root hashes; plain symbol grep is not sufficient evidence for JSON fixtures.

Add an adversarial census test that writes one temporary source file under the scanned `scripts` root whose path is intentionally absent from this task's `Files` list. Build the file contents from split fragments in the test source, with one item per line for `RouteRuntimeProbeFailureV1`, `RouteRuntimeProbeMetricsV1`, `RouteRuntimeProbeValidationProfileIdentityV1`, `RouteRuntimeProbeErrorV1`, `ROUTE_RUNTIME_PROBE_ERROR_CODES_V1`, `RouteConnectivityOperationAbortedErrorV1`, `queryRequiredRouteV1`, `HeightfieldTraversalGraphProjectionV1`, `QueryRequiredRouteInputV1`, `HeightfieldRouteTerrainSourceV1`, `createHeightfieldRouteBuildInputV1`, `canonicalHeightfieldRouteConnectivityResultV1`, `hashTraversalGraphV1`, `assertRoutePathReceiptForGraphV1`, `RouteThresholdRejectionProofV1`, `RouteThresholdRejectionReasonV1`, `blockingColliderIdentities`, `heightfield-tile-estimate`, and `not-required-empty-source`. Run the real census and require exactly 19 injected / 19 matched: assert `matchCount === 19` and `matchedPaths` equals exactly `[temporaryRepositoryRelativePath]`, then remove the file in `finally`. This proves internal projection/query-input, constructor/canonical/hash/assert/threshold-satellite family/field coverage and discovery of an unlisted live file without excluding the verifier or its test from `scripts`.

The executable census and the documented Step 5 command must use the identical Threshold fragment
`[A-Za-z0-9_]*RouteThresholdRejection(?:Proof|Reason)[A-Za-z0-9_]*V1`; do not maintain a narrower test-only
or prose-only family.

- [x] **Step 2: Verify gate RED**

```bash
pnpm vitest run scripts/verify-route-r1b-static-platform.test.ts
```

Expected: FAIL because the verifier and fixtures do not exist.

- [x] **Step 3: Implement deterministic fixtures and verifier**

Derive the 0.3m step threshold from the locked Profile. The success fixture uses 0.25m; the failure uses 0.35m. Do not copy `0.3` into Driver, Validation, or Surface Profile code.

All eleven worlds and the verifier inventory exist and align with the frozen
oracle. The verifier owns two closed, trusted-host-only fault mappings without
changing that oracle:

- `fail-wrong-collider-binding` selects
  `inject-surface-correlation-miss`, injects a private projection against the
  real fixture Build Input, and lets the normal evaluator and Validation Report
  path publish a canonical non-complete Result. The Orchestrator creates no
  Runtime Lease;
- `fail-platform-edge-fall` keeps its real complete Graph, confirms resolved
  `terrain-main` support at reset, then withdraws that fixture-owned support in
  the trusted host so the real Havok Probe publishes
  `ROUTE_RUNTIME_SUPPORT_LOST`.

Neither injection enters Authoring, Schema, Registry, CLI, Browser, Report,
Snapshot, or Runtime public contracts. Focused coverage proves the support
receipt fails after seven consecutive unsupported Ticks and records one
support-loss episode with zero wrong-Surface observations. See the linked
disposition for the exact regression evidence and the rationale for not
continuing pure-JSON geometry searches.

- [x] **Step 4: Perform the atomic public cutover and same-byte transport coverage**

Migrate every remaining consumer to V2/V5, switch the installed Browser API once, and delete V1/V4 declarations and exports rather than aliasing them. This includes the Traversal and Traversal-Recast implementations/barrels/tests, Validation route evaluators/publication/probe/tests, trusted host and CLI scripts/integrations, the R0 contract fixture/verifier, and the Canonical JSON quickstart. Run the real `worldkit verify route` path and prove CLI JSON, stored Evidence, Browser projection, and validation input use the same canonical V2 bytes/hashes.

The census must use current-tree names, including `HeightfieldRouteBuildInputV1`, `HeightfieldRouteTerrainSourceV1`, `createHeightfieldRouteBuildInputV1`, `HeightfieldRouteConnectivityResultV1`, `canonicalHeightfieldRouteConnectivityResultV1`, `evaluateRequiredHeightfieldRouteV1`, `HeightfieldTraversalGraphProjectionV1`, `QueryRequiredRouteInputV1`, `TraversalGraphV1`, `RoutePathReceiptV1`, `RouteOverlayV1`, every live `RouteRuntimeProbe*V1` satellite (including Failure, Metrics, Validation Profile Identity, Validation Error, and Error Codes), `RouteConnectivityOperationAbortedErrorV1`, `queryRequiredRouteV1`, `RouteThresholdRejectionProofV1`, `RouteThresholdRejectionReasonV1`, `WorldkitBrowserRouteEvidencePublicationV1`, and `WorldkitBrowserApiV4`, plus every constructor/assert/canonical/hash/receipt helper in those symbol families. Delete both Threshold V1 declarations and exports with `RouteConnectivityFailureV1`; unlike the explicitly reused `TraversalNodeV1`, `TraversalEdgeV1`, and `TraversalSurfaceIdentityV1` leaves, they are not V2 contracts. The census must also reject serialized/live source uses of `blockingColliderIdentities`, `heightfield-tile-estimate`, and `not-required-empty-source`; V2 uses `staticColliderIdentities`, `route-geometry-tile-estimate`, and `not-required-empty-geometry`. Use the exact Heightfield-qualified Connectivity and Graph Projection names from the tree rather than shortened invented names. Delete the old declarations/exports and migrate call sites directly; do not add a converter, alias, fallback read, or mixed-version receipt.

- [x] **Step 5: Run the cutover consumer census and prove zero matches**

The verifier must execute the equivalent family-based scan so a newly discovered file fails the gate even when it was omitted from the `Files` list. Build its regex from split string fragments so the verifier and its test stay inside the scanned `scripts` root without self-matching; do not exclude those files. Limit documentation scanning to the live quickstart; historical reviews/specs remain readable history.

```bash
! rg -n --pcre2 \
  '\b(?:[A-Za-z0-9_]*HeightfieldRouteBuildInput[A-Za-z0-9_]*V1|HeightfieldRouteTerrainSourceV1|HeightfieldRouteBuildBudgetEvidenceV1|StaticBlockingColliderV1|[A-Za-z0-9_]*RequiredHeightfieldRoute[A-Za-z0-9_]*V1|[A-Za-z0-9_]*HeightfieldRouteConnectivityResult[A-Za-z0-9_]*V1|[A-Za-z0-9_]*HeightfieldTraversalGraph[A-Za-z0-9_]*V1|[A-Za-z0-9_]*QueryRequiredRoute[A-Za-z0-9_]*V1|[A-Za-z0-9_]*TraversalGraphV1|[A-Za-z0-9_]*RoutePathReceipt[A-Za-z0-9_]*V1|[A-Za-z0-9_]*RouteOverlay[A-Za-z0-9_]*V1|[A-Za-z0-9_]*RouteConnectivity(?:Failure|Unavailable|Complete)[A-Za-z0-9_]*V1|ROUTE_CONNECTIVITY_FAILURE_CODES_V1|[A-Za-z0-9_]*RouteRuntimeProbe[A-Za-z0-9_]*V1|ROUTE_RUNTIME_PROBE_ERROR_CODES_V1|RouteConnectivityOperationAbortedErrorV1|queryRequiredRouteV1|[A-Za-z0-9_]*RouteThresholdRejection(?:Proof|Reason)[A-Za-z0-9_]*V1|[A-Za-z0-9_]*RouteEvidence(?:Publication|Projection)[A-Za-z0-9_]*V1|WorldkitBrowserApiV4|blockingColliderIdentities|heightfield-tile-estimate|not-required-empty-source)\b' \
  packages apps scripts examples README.md docs/17-canonical-json-quickstart.md
pnpm vitest run scripts/verify-route-r1b-static-platform.test.ts -t "legacy consumer census"
```

Expected: `rg` prints no matches, the census reports zero across all fixed roots, and the parsed R0 fixture assertion proves Graph V2 rather than relying on text absence.

Implementation and recorded cutover evidence are present. The fresh Task 9
focused matrix and R1b gate reran the executable census after integrating both
fixture proofs and reported zero legacy consumers.

- [x] **Step 6: Run Task 9 gates and commit**

```bash
pnpm vitest run packages/traversal/src packages/traversal-recast/src packages/validation/src/route.test.ts packages/validation/src/route-evaluator.test.ts packages/validation/src/route-evidence-publication.test.ts packages/validation/src/route-runtime-probe.test.ts scripts/verify-route-r1b-static-platform.test.ts scripts/lib/route-validation-orchestrator.test.ts scripts/lib/route-validation-cli.test.ts scripts/lib/route-runtime-probe.integration.test.ts scripts/lib/traversal-area-runtime-collision.integration.test.ts scripts/lib/worldkit-server.test.ts scripts/worldkit-route-run.integration.test.ts scripts/worldkit.test.ts apps/playground/src/authoring-loader.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
pnpm typecheck
git add examples/traversal/route-r0-contract.json examples/traversal/r1b-static-platform packages/traversal packages/traversal-recast packages/validation packages/runtime-contracts apps/playground/src scripts docs/17-canonical-json-quickstart.md package.json
git commit -m "test: gate route r1b static platforms"
```

Expected: R0, R1, and R1b gates pass.

Fresh 2026-08-24 evidence: the focused matrix passed 43 files / 525 tests;
`verify:route-r0-contract`, `verify:route-r1-heightfield`,
`verify:route-r1b-static-platform`, `typecheck`, and `git diff --check` all
passed. This Task 9 evidence does not claim that `pnpm test`, `pnpm build`, or
Task 10 review gates have run.

### Task 10: Full Verification, Deep Review, and M5 Handoff

**Current status (2026-08-24): Complete.** Task 9 implementation and its focused matrix are
complete. After the Runtime snap-down correction and Runtime ambiguous diagnostic-layer fix,
the R1b verifier passed all 11 fixtures, and the final complete matrix passed: `typecheck`,
full `pnpm test` (148 files / 1577 tests), `build`, R0, R1, R1b, Canonical, Placement,
Rigged Subject, G Bot, and `git diff --check` all exited 0. The host full-dimension/runtime
review checked installed Babylon `checkSupport()` semantics, snap-down ownership, Runtime
support-surface diagnostics, and the clean-break diff. Both Cursor reviews returned Final GO /
No findings. No open confirmed P0/P1 remains; Task 10, R1b, and M5 are complete.

The snap-down root cause was a capsule cast accepting the rounded Minkowski edge of a surface
being left as if it continued the previous support plane. The resulting synthetic `sliding`
Tick cleared valid coyote time. The Runtime fix compares the candidate hit normal with the
pre-integrate retained support normal and rejects a misaligned continuation, while still
allowing a new walkable landing after support is lost. The existing
`SNAP_DOWN_UPWARD_SPEED_LIMIT_METERS_PER_SECOND = 0.5` remains unchanged; the fix does not
expand unrelated movement behavior. The regression proves the previous Tick remains
`supported` before ledge departure and a one-Tick coyote jump succeeds. This changes no Schema, Camera, Route
Graph/Query/Evidence contract, or R1b oracle.

**Files:**
- Create: `docs/reviews/2026-08-24-route-r1b-static-platform-runtime-review.md`
- Modify: `docs/superpowers/plans/2026-08-23-route-r1b-static-platform-implementation-plan.md`
- Modify: `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Verify: `docs/17-product-asset-and-3c-integration.md`

**Interfaces:**
- Records full-dimension and runtime-deep-review evidence, finding dispositions, exact command results, and remaining H1/H2/H3 gaps.
- Closes M5 only when every blocking gate passes and no P0/P1 remains.

- [x] **Step 1: Run the complete verification matrix from the final source tree**

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Expected: every command exits 0 with no unaccounted warning.

Fresh result after the final diagnostic fix: all commands exited 0; full `pnpm test` passed
148 files / 1577 tests and the R1b verifier passed all 11 fixtures.

- [x] **Step 2: Perform host self-review**

Apply `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`. Re-read installed Babylon 9.21.2 and patched Recast 0.43.1 source for support semantics, area ordering, contour simplification, and disposal behavior.

Disposition: reviewed the installed Babylon `checkSupport()` normal normalization, snap-down
authority/ownership, V2/V5 clean-break diff and provider boundary. No host P0/P1 remains open.

- [x] **Step 3: Complete the final core review**

Apply the full-dimension and Runtime review protocols against the actual `git merge-base origin/main HEAD` at review time and the final head SHA. Record every finding as confirmed, rejected, or deferred; fix only confirmed in-scope defects with a failing reproducer.

Result: chat `1e938715-a5b2-4a25-ad83-45eec0c37c15` reviewed `28752e0` against base
`9c5a6158c347e08ea0af01135cb827166ffbede0` and returned Final GO / No findings. Its
non-blocking Runtime ambiguous diagnostic-layer recommendation was independently confirmed
by the host and fixed in `506e088`.

- [x] **Step 4: Conditionally re-review confirmed fixes**

Do not repeat the full review mechanically when the core review reports no confirmed blocker.
Only if Step 3 evidence leads the host to confirm a real defect and code changes are required,
re-run the affected and complete gates, then re-review the resulting fix against the invalidated dimensions.
Completion requires no open confirmed P0/P1; every reported blocker must otherwise have a
host-evidenced rejection or an explicit out-of-scope disposition that does not violate the
frozen completion contract.

Result: the fix added explicit `unmatched / ambiguous / wrong resolved Surface` regression
coverage and consistently publishes `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`. After the full
matrix passed, conditional review chat `d61f751c-a398-4063-bcbf-2ddc55ea20a9` reviewed
`506e088bf929d153f4bbc4a24be5eaaa64a1ba87` and returned Final GO / No findings.

- [x] **Step 5: Update public progress and remaining gaps**

Mark R1b/M5 complete only if the complete matrix and reviews pass. Keep bridge/underpass H1, openings H2, caves/interiors H3, dynamic platforms, NPCs, and public navigation commands explicitly open.

- [x] **Step 6: Commit the verified handoff**

The owning main agent commits and pushes this verified handoff after the final documentation
diff check; this step is administrative and does not expand the R1b/M5 capability boundary.

```bash
git add README.md docs package.json pnpm-lock.yaml
git commit -m "docs: complete route r1b static platform"
git status --short --branch
```

Expected: clean feature branch with all task commits and review evidence.

---

## Completion Review

R1b is complete only when all statements are true:

- Authoring Prototype Binding, Execution Surface, Collider row, Build Input, Graph Node, Runtime support, and Validation evidence share one auditable identity/provenance chain.
- R1 Heightfield canonical identity and behavior remain stable after the V2 clean break.
- 0.25m steps pass Graph and real Runtime; 0.35m steps fail with locked-profile evidence.
- Bound platform/ramp surfaces are walkable; equal unbound Collider tops remain blockers.
- Exact seams pass; gaps and coplanar interior overlaps fail deterministically.
- Runtime uses one `checkSupport()` per fixed tick and rejects wrong/unmatched/ambiguous support.
- XZ Intent lookahead cannot select expected Surface; the Probe-private 3D station rejects same-XZ wrong layers.
- Repeated, concurrent, reset/rebind, cleanup-throw, and 30/60/120-like cadence evidence is deterministic.
- Canonical/CLI/Browser/Report/Snapshot contain no unaudited Provider handle, raw error, native path, or internal area/tag.
- All complete verification commands pass and independent review has no open P0/P1.
- Documentation states that M5 completion does not imply bridge underpasses, caves, dynamic platforms, NPC path following, or public `goTo` support.
