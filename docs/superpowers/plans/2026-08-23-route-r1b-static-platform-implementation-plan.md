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
- Graph Builder Adapter consumes `TraversalCapabilityEnvelopeV1`, not Registry/Profile resources. `maximumTraversalSurfaceCount` is copied into the Envelope.
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

Each parallel worker uses a dedicated Git worktree and branch. Integration is commit-based onto `codex/m5-route-r1b-static-platform`; never share one writable worktree between implementers. Cursor remains a read-only reviewer and does not own integration decisions.

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

- [ ] **Step 1: Write RED Authoring normalization tests**

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

- [ ] **Step 2: Verify Authoring RED**

Run:

```bash
pnpm vitest run packages/authoring/src/authoring-v4.test.ts packages/authoring/src/normalize-v4.test.ts
```

Expected: FAIL because `traversalSurfaceBindings` is not part of the closed Prototype contract.

- [ ] **Step 3: Implement the closed Authoring binding**

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

- [ ] **Step 4: Write RED Compiler and Runtime Contract tests**

Prove two Objects sharing one Prototype produce two static Surface rows with different `surfaceEntityId`/`colliderSubshapeId`, while each row joins exactly one existing Collider row:

```ts
expect(surface.surfaceEntityId).toBe(collider.entityId);
expect(surface.logicalSubshapeId).toBe(collider.logicalSubshapeId);
expect(surface.colliderSubshapeId).toBe(collider.colliderSubshapeId);
expect(surface.colliderHash).toBe(collider.colliderHash);
```

Also prove the R1 Heightfield ID is byte-identical to the pre-R1b fixture and that a forged-but-hash-consistent normalized V4 join fails Plan admission. Extend `compile-traversal-lock.test.ts` to prove the Traversal Surface Profile row survives byte-identically from normalized to Execution Resource Lock and that a missing or changed row fails closed.

- [ ] **Step 5: Verify Compiler RED**

Run:

```bash
pnpm vitest run packages/compiler/src/compile-v5.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts
```

Expected: FAIL because `ExecutionStaticColliderTraversalSurfaceV1` and the new Resource kind do not exist.

- [ ] **Step 6: Implement per-instance Surface compilation**

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

- [ ] **Step 7: Run Task 1 gates and commit**

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

**Interfaces:**
- Produces `StaticColliderSourceV1`, `RouteBuildInputV2`, `RouteBuildInputReceiptV2`, `TraversalGraphV2`, `RoutePathReceiptV2`, `RouteOverlayV2`, and `RouteConnectivityResultV2`.
- V2 deletes the R1 path-global `traversalSurfaceIdentity` from Path and Overlay.
- Adds `ROUTE_SURFACE_CORRELATION_MISSING` and `ROUTE_SURFACE_CORRELATION_AMBIGUOUS` to the V2 closed failure union.
- Keeps the unchanged V1 declarations temporarily available only so untouched R1 consumers continue compiling; do not implement V1↔V2 aliases, converters, fallback reads, or mixed receipts. Task 9 removes V1 atomically after every consumer migrates.

- [ ] **Step 1: Write RED Build Input V2 tests**

Use one Heightfield Surface, one bound platform Collider, and one unbound wall Collider. Assert:

```ts
expect(input.traversalSurfaces.map((surface) => surface.traversalSurfaceId))
  .toEqual([...expectedIds].sort());
expect(input.geometryArtifactHash).toBe(sha256CanonicalJson({
  terrainArtifactHash: input.terrainArtifactHash,
  colliderArtifactHash: input.colliderArtifactHash,
}));
```

Reject reordered serialized arrays, duplicate Surface IDs, zero/multiple Terrain surfaces, missing Collider joins, stale child/root hashes, and extra fields.

- [ ] **Step 2: Verify Build Input RED**

```bash
pnpm vitest run packages/traversal/src/build-input.test.ts
```

Expected: FAIL because only `HeightfieldRouteBuildInputV1` exists.

- [ ] **Step 3: Implement strict V2 Build Input and receipt**

Define the exact closed static source:

```ts
export interface StaticColliderSourceV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly triangleSoup: CanonicalTriangleSoupV1;
}
```

Add strict V2 declarations/exports beside the unchanged V1 implementation as feature-branch staging. Recompute every V2 child/root hash inside the canonical validator. Do not translate, alias, or auto-upgrade V1 bytes; V1 remains byte-stable until Task 9 deletes it.

- [ ] **Step 4: Write RED Graph/Path/Overlay/Connectivity V2 tests**

Create a Graph path whose ordered nodes use Heightfield → platform → Heightfield. Assert the aligned identities:

```ts
expect(path.orderedTraversalSurfaceIdentities).toHaveLength(
  path.orderedTraversalNodeIds.length,
);
expect(path).not.toHaveProperty("traversalSurfaceIdentity");
expect(overlay).not.toHaveProperty("traversalSurfaceIdentity");
```

Reject a Path identity that differs from its Graph Node, a Graph Node Surface absent from Build Input, and mismatched `terrainArtifactHash`, `colliderArtifactHash`, `geometryArtifactHash`, or `surfaceArtifactHash`.

- [ ] **Step 5: Verify V2 receipt RED**

```bash
pnpm vitest run packages/traversal/src/graph-contract.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/route-overlay.test.ts packages/traversal/src/connectivity-result.test.ts
```

Expected: FAIL on missing V2 types and path-global Surface assertions.

- [ ] **Step 6: Implement V2 Graph and receipt contextual validation**

`RouteConnectivityResultV2` must use `kind: "route-connectivity-result"`, `schemaVersion: 2`, validate every Graph Node against exactly one Build Input Surface, validate every ordered Path identity against the matching Graph Node, and never invent one Surface for a pre-correlation failure.

- [ ] **Step 7: Run Task 2 gates and commit**

```bash
pnpm vitest run packages/traversal/src/build-input.test.ts packages/traversal/src/graph-contract.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/route-overlay.test.ts packages/traversal/src/connectivity-result.test.ts
pnpm typecheck
git add packages/traversal
git commit -m "feat: add multi-surface route contracts"
```

Expected: all focused tests and typecheck pass.

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
- Adds provider-neutral `maximumTraversalSurfaceCount` to `TraversalGraphBuilderProfileV2` and `TraversalCapabilityEnvelopeV1`.
- Extends the existing R1 V1 Build Input's exact closed Envelope admission with the same field so Wave 1 preserves the Heightfield gate until Task 2 introduces V2.
- Keeps downstream Path, Connectivity, Probe, and Browser fixtures bound to the exact resolved built-in Profile hash and Envelope bytes instead of duplicating a stale hash literal. Playground tests import the resolver only from the public `@whitebox-world/traversal` package root and declare that package as a direct dev dependency; no deep-relative package-internal import is allowed.

- [ ] **Step 1: Write RED Profile and Envelope tests**

Assert the built-in Profile is exactly:

```ts
{
  kind: "traversal-surface-profile",
  schemaVersion: 1,
  traversalMode: "ground",
  faceSelectionMode: "subject-slope-compatible",
}
```

Prove the built-in V2 Graph Builder Profile fixes `maximumTraversalSurfaceCount` at `61`; the Envelope copies it, rejects zero/non-integer/provider-named fields, changes its hash when the generic count changes, and remains admissible to the existing R1 V1 Build Input.

Include the Path Receipt, Connectivity Result, Runtime Probe, and Browser API fixtures in the RED integration surface. Their Profile hash and Envelope-derived fields must come from `resolveTraversalGraphBuilderProfileV2()` / `createTraversalCapabilityEnvelopeV1()` rather than the pre-R1b literal, so the Profile content change cannot leave internally inconsistent fixtures green.

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run packages/traversal/src/profile-registry.test.ts packages/traversal/src/capability-envelope.test.ts packages/traversal/src/build-budget.test.ts packages/traversal/src/path-receipt.test.ts packages/traversal/src/connectivity-result.test.ts packages/traversal/src/runtime-probe-contract.test.ts apps/playground/src/worldkit-browser-api.test.ts
```

Expected: FAIL because the Surface Profile and count are absent.

- [ ] **Step 3: Implement Profile resolution and generic budget**

Keep slope, step, capsule, clearance, speed, and Provider area values out of `TraversalSurfaceProfileV1`. Adapter budget admission consumes only the count already copied into the Envelope. Update every listed downstream fixture to derive the built-in Graph Builder Profile hash and Envelope fields from the public resolver/factory. In `apps/playground/src/worldkit-browser-api.test.ts`, import `resolveTraversalGraphBuilderProfileV2` from `@whitebox-world/traversal`, add `@whitebox-world/traversal: "workspace:*"` to Playground `devDependencies`, and refresh `pnpm-lock.yaml`; do not reach into `packages/traversal/src` from the app.

- [ ] **Step 4: Run Task 3 gates and commit**

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
- Produces `TRAVERSAL_SURFACE_QUERY_EPSILON_V1`, `queryCanonicalTraversalSurfaceHitV1()`, and overlap preflight results `interior | boundary-only | equivalent-plane | overlap`.
- Replaces duplicated Recast Euler/TRS geometry code with the existing world-space `emitTransformedStaticColliderTriangleMeshV1()` authority.

- [ ] **Step 1: Write RED asymmetric geometry tests**

Cover a rotated/scaled box, a sloped box, two exact boundary-only boxes, a 1cm gap, coplanar interior overlap, and stacked triangles at the same XZ. Assert that array reversal does not change sorted hits or hashes.

- [ ] **Step 2: Verify geometry RED**

```bash
pnpm vitest run packages/terrain-surface/src/traversal-surface-query.test.ts packages/terrain-surface/src/static-collider-triangle-mesh.test.ts
```

Expected: FAIL because the shared query module does not exist.

- [ ] **Step 3: Implement deterministic shared query classification**

Use Babylon-compatible vector math through existing terrain-surface utilities. Barycentric XZ admission uses only `TRAVERSAL_SURFACE_QUERY_EPSILON_V1`; caller-provided Y/normal bands remain explicit inputs. Return immutable, Canonical-ID-sorted hits.

- [ ] **Step 4: Write RED shared-emitter Recast test**

Spy on the shared emitter output only through value comparison: Graph source positions/indices must equal `emitTransformedStaticColliderTriangleMeshV1()` `worldPositionsMetersXYZ`/indices for asymmetric rotation and non-uniform scale. Delete expectations tied to the duplicate Recast TRS implementation and remove the local Euler/`transformSoup` path from `heightfield-source.ts`.

- [ ] **Step 5: Implement shared source emission and preflight**

Build `StaticColliderSourceV1` from the Execution Collider and the shared emitter. Fail closed on same-band interior overlap, but retain boundary-only seams and distinct Y layers.

- [ ] **Step 6: Run Task 4 gates and commit**

```bash
pnpm vitest run packages/terrain-surface/src packages/traversal-recast/src/heightfield-source.test.ts
pnpm typecheck
git add packages/terrain-surface packages/traversal-recast/src/heightfield-source.ts packages/traversal-recast/src/heightfield-source.test.ts
git commit -m "feat: share traversal surface geometry queries"
```

Expected: all focused tests pass and the R1 duplicate TRS path is removed.

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

- [ ] **Step 1: Write RED installed-provider acceptance tests**

Use real `generateTiledNavMesh` to prove:

1. bound box top publishes a walkable polygon;
2. equal unbound box top does not;
3. adjacent coplanar bound boxes retain distinct source ranges/polygons;
4. slope-incompatible faces remain non-walkable;
5. 61 candidate ranges are accepted, while 62 candidate ranges fail before Provider execution.

- [ ] **Step 2: Verify provider RED**

```bash
pnpm vitest run packages/traversal-recast/src/provider-acceptance.test.ts packages/traversal-recast/src/provider-lifecycle.test.ts
```

Expected: FAIL because the installed patch only accepts `terrain-with-static-blockers-r1`.

- [ ] **Step 3: Patch the exact Provider pipeline order**

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

- [ ] **Step 4: Refresh patch and Adapter identities**

Update the patch fingerprint and `TRAVERSAL_RECAST_ADAPTER_IDENTITY_V1` hash through the repository's existing canonical identity helpers. Do not hand-edit expected hashes without a test demonstrating the new bytes.

- [ ] **Step 5: Run Task 5 gates and commit**

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
- Projects each polygon's private source range back to one Canonical Surface and publishes `TraversalGraphV2`/`RoutePathReceiptV2`.

- [ ] **Step 1: Write RED successful multi-Surface Graph test**

Build Heightfield → 0.25m step chain → platform → ramp → Heightfield. Assert complete Path, ordered Surface sequence, `step` edges at legal risers, and no Provider fields in serialized Graph/Path.

- [ ] **Step 2: Verify Graph RED**

```bash
pnpm vitest run packages/traversal-recast/src/heightfield-source.test.ts packages/traversal-recast/src/build-graph.test.ts packages/traversal-recast/src/query-route.test.ts
```

Expected: FAIL because the R1 mapper puts every static Collider in the blocker suffix and stamps one Heightfield identity on every Node.

- [ ] **Step 3: Implement multi-source mapping and Node correlation**

Sort candidate ranges by `traversalSurfaceId`, blockers by `colliderSubshapeId`, and verify private tag → source range → Surface/geometry hashes. Query only the tagged range with barycentric epsilon and the locked Node-Y height band. Never select highest/lowest/nearest Surface.

- [ ] **Step 4: Write RED failure and rejection-proof tests**

Cover 0.35m step, 1cm gap, narrow tread, low overhead, missing Profile, forged Collider binding, coplanar interior overlap, stacked layers, and candidate budget overflow. Each dedicated diagnostic must be backed by a one-relaxation rejection proof; mixed failures remain generic.

- [ ] **Step 5: Implement multi-Surface edges and V2 failures**

Publish only `walk | slope | step`. A seam requires canonical boundary evidence. Do not use visual bounds or raw Provider adjacency to bridge a gap.

- [ ] **Step 6: Run Task 6 gates and commit**

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

- [ ] **Step 1: Write RED Runtime correlation tests**

Cover Heightfield, bound static platform, unbound Collider, dynamic support, exact seam, coplanar overlap, stacked lower layer, `SLIDING`, Reset, Rebind, and two Runtime instances. Assert `checkSupport()` is called once per tick in every case.

- [ ] **Step 2: Verify Runtime RED**

```bash
pnpm vitest run packages/runtime-babylon/src/traversal-runtime-port.test.ts packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts
```

Expected: FAIL because static support is currently counted only as Heightfield ambiguity/unmatched.

- [ ] **Step 3: Implement immutable static Surface correlation**

Index collision meshes by `colliderSubshapeId`; query only compiled Surface-bound rows through the shared triangle classifier. Use the Runtime Adapter Live Lock contact band and retained pre-integration foot/normal. Return `unsupported | unmatched | ambiguous | resolved` without changing movement state.

- [ ] **Step 4: Run Task 7 gates and commit**

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
- Defines and tests V5 builders/contracts beside unchanged V4 declarations, but does not switch `window.__WORLDKIT__` or trusted-host consumers until Task 9's atomic cutover.

- [ ] **Step 1: Write RED 3D station tests**

Prove:

1. 2.4m XZ lookahead before a step still expects Heightfield support;
2. the legal transition edge allows its two endpoint Surfaces;
3. after reaching the platform segment, lower same-XZ Heightfield support mismatches;
4. A→B→C exact seam keeps only adjacent tied segments;
5. Reset/Rebind restores station to the start;
6. 30/60/120-like render cadence produces byte-identical Probe receipts.

- [ ] **Step 2: Verify Probe RED**

```bash
pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts
```

Expected: FAIL because Probe V1 uses a path-global Surface and XZ progress only.

- [ ] **Step 3: Implement Probe-private monotonic 3D station**

Bound each tick's search window with resolved `control-feel-profile.walkSpeedMetersPerSecond * fixedTimeStepSeconds + positionQuantizationMeters`; permit one quantization band of physical backtrack. Deduplicate endpoint Surface IDs in canonical order. Keep Driver Intent computation unchanged.

- [ ] **Step 4: Write RED Browser V5 tests**

Assert V5 preserves V4 methods but route evidence publishes V2 Path/Overlay arrays, rejects old `traversalSurfaceIdentity`, deep-freezes results, and never exposes Provider fields.

- [ ] **Step 5: Implement route evidence V2 and Browser V5 preparation**

Add strict V5 builders and V2 projection without alias fields, fallback reads, or V1↔V2 conversion. Keep the installed `window.__WORLDKIT__` V4 until Task 9 so the unmodified trusted host remains green; Task 9 switches the window, host, CLI, examples, generated/public exports, and tests atomically, then deletes V4/V1.

- [ ] **Step 6: Run Task 8 gates and commit**

```bash
pnpm vitest run packages/traversal/src/runtime-probe-contract.test.ts packages/validation/src/route-runtime-probe.test.ts packages/validation/src/route-evaluator.test.ts packages/validation/src/route-evidence-publication.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts apps/playground/src/worldkit-browser-api.test.ts
pnpm typecheck
git add packages/traversal packages/validation packages/runtime-contracts apps/playground/src/worldkit-browser-api.ts apps/playground/src/worldkit-browser-api.test.ts
git commit -m "feat: publish multi-surface route evidence"
```

Expected: focused tests and typecheck pass.

### Task 9: Atomically Cut Over V2/V5 and Add the R1b Golden Gate

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

- [ ] **Step 1: Write RED gate inventory test**

Require the success fixture plus all failure fixtures—including the distinct Graph-overlap and injected-complete/Runtime-ambiguous overlap cases—exact expected diagnostic codes, real Recast/Babylon flags, repeat/concurrent hashes, cadence hashes, cleanup checks, provider-leak scan results, and a zero-match legacy Route V1/Browser V4 public-symbol scan. The machine-readable result must include a `legacyConsumerCensus` with fixed search roots, the symbol-family pattern, historical exclusions, match count, and matched paths. It must discover consumers from repository contents rather than compare against a hand-maintained file allowlist. Parse `examples/traversal/route-r0-contract.json` separately and require its embedded Graph evidence to be V2 with valid child/root hashes; plain symbol grep is not sufficient evidence for JSON fixtures.

- [ ] **Step 2: Verify gate RED**

```bash
pnpm vitest run scripts/verify-route-r1b-static-platform.test.ts
```

Expected: FAIL because the verifier and fixtures do not exist.

- [ ] **Step 3: Implement deterministic fixtures and verifier**

Derive the 0.3m step threshold from the locked Profile. The success fixture uses 0.25m; the failure uses 0.35m. Do not copy `0.3` into Driver, Validation, or Surface Profile code.

- [ ] **Step 4: Perform the atomic public cutover and same-byte transport coverage**

Migrate every remaining consumer to V2/V5, switch the installed Browser API once, and delete V1/V4 declarations and exports rather than aliasing them. This includes the Traversal and Traversal-Recast implementations/barrels/tests, Validation route evaluators/publication/probe/tests, trusted host and CLI scripts/integrations, the R0 contract fixture/verifier, and the Canonical JSON quickstart. Run the real `worldkit verify route` path and prove CLI JSON, stored Evidence, Browser projection, and validation input use the same canonical V2 bytes/hashes.

The census must use current-tree names, including `HeightfieldRouteBuildInputV1`, `createHeightfieldRouteBuildInputV1`, `HeightfieldRouteConnectivityResultV1`, `canonicalHeightfieldRouteConnectivityResultV1`, `evaluateRequiredHeightfieldRouteV1`, `TraversalGraphV1`, `RoutePathReceiptV1`, `RouteOverlayV1`, `RouteRuntimeProbeRequestV1`, `WorldkitBrowserRouteEvidencePublicationV1`, and `WorldkitBrowserApiV4`, plus constructor/canonical/hash/receipt helpers in those symbol families. Use the exact Heightfield-qualified Connectivity name from the tree rather than a shortened invented name. Delete the old declarations/exports and migrate call sites directly; do not add a converter, alias, fallback read, or mixed-version receipt.

- [ ] **Step 5: Run the cutover consumer census and prove zero matches**

The verifier must execute the equivalent family-based scan so a newly discovered file fails the gate even when it was omitted from the `Files` list. Build its regex from split string fragments so the verifier and its test stay inside the scanned `scripts` root without self-matching; do not exclude those files. Limit documentation scanning to the live quickstart; historical reviews/specs remain readable history.

```bash
! rg -n --pcre2 \
  '\b(?:[A-Za-z0-9_]*HeightfieldRouteBuildInput[A-Za-z0-9_]*V1|HeightfieldRouteBuildBudgetEvidenceV1|StaticBlockingColliderV1|[A-Za-z0-9_]*RequiredHeightfieldRoute[A-Za-z0-9_]*V1|[A-Za-z0-9_]*HeightfieldRouteConnectivityResult[A-Za-z0-9_]*V1|[A-Za-z0-9_]*TraversalGraphV1|[A-Za-z0-9_]*RoutePathReceipt[A-Za-z0-9_]*V1|[A-Za-z0-9_]*RouteOverlay[A-Za-z0-9_]*V1|[A-Za-z0-9_]*RouteConnectivity(?:Failure|Unavailable|Complete)[A-Za-z0-9_]*V1|ROUTE_CONNECTIVITY_FAILURE_CODES_V1|[A-Za-z0-9_]*RouteRuntimeProbe(?:Request|Tick|Receipt)[A-Za-z0-9_]*V1|runRouteRuntimeProbeV1|RunRouteRuntimeProbeInputV1|[A-Za-z0-9_]*RouteEvidence(?:Publication|Projection)[A-Za-z0-9_]*V1|WorldkitBrowserApiV4)\b' \
  packages apps scripts examples README.md docs/17-canonical-json-quickstart.md
pnpm vitest run scripts/verify-route-r1b-static-platform.test.ts -t "legacy consumer census"
```

Expected: `rg` prints no matches, the census reports zero across all fixed roots, and the parsed R0 fixture assertion proves Graph V2 rather than relying on text absence.

- [ ] **Step 6: Run Task 9 gates and commit**

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

### Task 10: Full Verification, Deep Review, and M5 Handoff

**Files:**
- Create: `docs/reviews/2026-08-23-route-r1b-static-platform-runtime-review.md`
- Modify: `docs/superpowers/plans/2026-08-23-route-r1b-static-platform-implementation-plan.md`
- Modify: `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Verify: `docs/17-product-asset-and-3c-integration.md`

**Interfaces:**
- Records full-dimension and runtime-deep-review evidence, finding dispositions, exact command results, and remaining H1/H2/H3 gaps.
- Closes M5 only when every blocking gate passes and no P0/P1 remains.

- [ ] **Step 1: Run the complete verification matrix from a clean tree**

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

- [ ] **Step 2: Perform host self-review**

Apply `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`. Re-read installed Babylon 9.21.2 and patched Recast 0.43.1 source for support semantics, area ordering, contour simplification, and disposal behavior.

- [ ] **Step 3: Request independent Cursor code review**

Use `/Users/xiateng/.agents/skills/reviewing-with-cursor/SKILL.md` with a fresh code review ID bound to the actual `git merge-base origin/main HEAD` at review time and the final head SHA. Record every finding as confirmed, rejected, or deferred; fix only confirmed in-scope defects with a failing reproducer.

- [ ] **Step 4: Request fresh Cursor final review**

Use a new final review ID after fixes and re-running all gates. Completion requires `FINAL GO` or a host-evidenced rejection of every reported blocker.

- [ ] **Step 5: Update public progress and remaining gaps**

Mark R1b/M5 complete only if the complete matrix and reviews pass. Keep bridge/underpass H1, openings H2, caves/interiors H3, dynamic platforms, NPCs, and public navigation commands explicitly open.

- [ ] **Step 6: Commit the verified handoff**

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
