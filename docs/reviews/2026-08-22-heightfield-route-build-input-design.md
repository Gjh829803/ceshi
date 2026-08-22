# Heightfield Route Build Input R1 Design Freeze

Status: approved for test-first implementation after host self-review and three skill-managed Cursor design passes

Date: 2026-08-22

## Decision

Route R1 Task 3 creates one deterministic, provider-neutral source artifact from an `ExecutionPlanV5`, one already-resolved `TraversalCapabilityEnvelopeV1`, and one explicitly selected connectivity `constraintId`. It does not initialize Recast, build a NavMesh, query a route, inspect Babylon meshes, or infer missing capability data.

The Task is split into three ordered slices:

1. **Task 3A — provenance and endpoint prerequisites:** add the V4 Authoring identity to `NormalizedWorldIRV4` and `ExecutionPlanV5`, publish explicit V5 `anchorEntityIds`, and add `routeBuildInputHash` to the unreleased `TraversalGraphV1` contract;
2. **Task 3B — one Heightfield topology authority:** add the canonical terrain emitter, make sampling consume its exact triangles, and make the existing terrain renderer consume the same local vertex/index payload without changing its world transform or HeightField physics compatibility path;
3. **Task 3C — locked source assembly:** resolve one connectivity row, clip the shared terrain triangles to a conservative hard ribbon, apply water exclusions, tessellate relevant analytic static colliders conservatively, enforce the existing tile budget, validate the strict DTO, and return its content hash.

Task 4 remains the first owner of Recast generation, query, `runRecastProviderOperationV1()`, `NavMeshQuery`, and operation-receipt cleanup.

## Authority and dependency direction

- `@whitebox-world/authoring` owns the canonical V4 Authoring identity.
- `@whitebox-world/runtime-contracts` transports the immutable V5 provenance, endpoint-kind evidence, traversal surfaces, connectivity rows, and canonical analytic collider rows.
- `@whitebox-world/terrain-surface` owns Heightfield vertex order, triangle diagonal, winding, and triangle sampling.
- `@whitebox-world/traversal` owns provider-neutral Build Input types, strict validation, build-input hashing, budget error evidence, and Graph contracts.
- `@whitebox-world/traversal-recast` is the only Task 3 assembly adapter. It may depend directly on Runtime Contracts, Terrain Surface, and Traversal, but its returned Build Input contains none of those implementation package names.
- Babylon/Havok visual meshes, physics handles, Recast objects, provider refs, file paths, visual bounds, raw Subject/Profile rows, and adapter resolution paths are forbidden from `HeightfieldRouteBuildInputV1`.

The factory is a pure deterministic function. Task 3 must not import `recast-navigation` or `provider-lifecycle.ts` into `heightfield-source.ts`.

## V4/V5 provenance prerequisite

`TraversalGraphV1.authoringSpecHash` is not an alias for `normalizedWorldIrHash` and is not the V3 Layout Solve Report's Authoring identity. V4 connectivity is added after the V3 layout solve, so the existing report identity intentionally does not include it.

Add:

```ts
interface NormalizedWorldIRV4 {
  readonly authoringSpecHash: `sha256:${string}`;
}

interface ExecutionPlanV5 {
  readonly authoringSpecHash: `sha256:${string}`;
}
```

An internal, non-public `canonical-authoring-identity.ts` owns both V3 and V4 identity construction. The V4 identity is the complete canonical V3 identity projected from the same validated V4 document, with `schemaVersion: 4` and a canonical `constraints` object containing both sorted Placement constraints and sorted Connectivity constraints. Connectivity rows are sorted by `id`; no free-form order affects the hash.

`normalizeAuthoringSpecV4()` computes `authoringSpecHash` from those canonical bytes and embeds it in the V4 IR before computing `normalizedWorldIrHash`. `compileWorldV5()` copies the field into the V5 plan; its existing normalized-IR hash check integrity-binds the value. `projectNormalizedWorldV4ToV3()` must explicitly remove both V4-only connectivity and `authoringSpecHash`, so an extra field cannot leak into V3 compilation.

Changing only V4 Connectivity must change the V4 Authoring hash and V5 Plan hash while leaving the V3 Layout Solve Report identity unchanged. Repeated normalization must remain byte-identical.

## Explicit V5 Anchor evidence

`ExecutionPlanV4.layout.placementsByEntityId` contains both Object and Anchor placements and does not preserve their kinds. Presence in that map is therefore insufficient proof that a connectivity endpoint is an explicit Anchor.

Add one sorted, duplicate-free field only to V5 traversal:

```ts
interface ExecutionPlanV5 {
  readonly traversal: Readonly<{
    readonly surfaces: readonly ExecutionTraversalSurfaceV1[];
    readonly connectivityRequirements: readonly ExecutionConnectivityRequirementV1[];
    readonly anchorEntityIds: readonly string[];
  }>;
}
```

The Compiler derives it only from normalized nodes whose `kind === "anchor"`. The Build Input factory requires both endpoint IDs to occur exactly once in this list and to have placements. It reads the absolute Anchor position from `placement.transform.positionMetersXYZ`; it never adds terrain height or object bounds.

## Graph binding prerequisite

The current unreleased `TraversalGraphV1` repeats route and endpoint IDs but does not bind the hard-ribbon width, centerline, water exclusions, or the exact clipped source. A ribbon edit can otherwise retain the same nodes and accidentally retain the same Graph hash.

Add:

```ts
interface TraversalGraphV1 {
  readonly routeBuildInputHash: `sha256:${string}`;
}
```

`routeBuildInputHash` is the canonical SHA-256 of `HeightfieldRouteBuildInputV1`, kept outside the Build Input itself. Task 4 copies the Receipt hash into the Graph and recomputes it before provider allocation. Existing explicit `terrainArtifactHash`, `colliderArtifactHash`, and `surfaceArtifactHash` remain because they are useful evidence boundaries; `routeBuildInputHash` does not replace them.

## Provider-neutral contracts

All tuple fields are read-only and use the coordinate system already frozen by the Execution Plan: right-handed, Y-up, minus-Z forward.

```ts
interface CanonicalTriangleSoupV1 {
  readonly positionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

interface RouteHardRibbonV1 {
  readonly routeId: string;
  readonly pointsMetersXZ: readonly (readonly [number, number])[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

interface RouteBuildAnchorV1 {
  readonly entityId: string;
  readonly positionMetersXYZ: readonly [number, number, number];
}

interface StaticBlockingColliderV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly triangleSoup: CanonicalTriangleSoupV1;
}

type BlockedWaterBoundaryV1 =
  | Readonly<{ kind: "circle"; centerMetersXZ: readonly [number, number]; radiusMeters: number }>
  | Readonly<{ kind: "ellipse"; centerMetersXZ: readonly [number, number]; radiusMetersXZ: readonly [number, number] }>
  | Readonly<{ kind: "polygon"; pointsMetersXZ: readonly (readonly [number, number])[] }>;

interface BlockedWaterExclusionV1 {
  readonly waterEntityId: string;
  readonly boundary: BlockedWaterBoundaryV1;
  readonly waterLevelMeters: number;
  readonly depthMeters: number;
}

type HeightfieldRouteTerrainSourceV1 =
  | Readonly<{
      kind: "empty";
      terrainEntityId: string;
      terrainArtifactHash: `sha256:${string}`;
    }>
  | Readonly<{
      kind: "bounded";
      terrainEntityId: string;
      terrainArtifactHash: `sha256:${string}`;
      triangleSoup: CanonicalTriangleSoupV1;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>;

interface HeightfieldRouteBuildInputV1 {
  readonly kind: "heightfield-route-build-input";
  readonly schemaVersion: 1;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly layoutSolveReportHash: `sha256:${string}`;
  readonly resourceLockHash: `sha256:${string}`;
  readonly connectivityRequirement: Readonly<{
    readonly constraintId: string;
    readonly traversingEntityId: string;
    readonly startAnchorEntityId: string;
    readonly destinationAnchorEntityId: string;
    readonly routeId: string;
  }>;
  readonly startAnchor: RouteBuildAnchorV1;
  readonly destinationAnchor: RouteBuildAnchorV1;
  readonly hardRibbon: RouteHardRibbonV1;
  readonly traversalSurface: TraversalSurfaceIdentityV1;
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly terrainSource: HeightfieldRouteTerrainSourceV1;
  readonly blockingColliders: readonly StaticBlockingColliderV1[];
  readonly colliderArtifactHash: `sha256:${string}`;
  readonly blockedWaterExclusions: readonly BlockedWaterExclusionV1[];
}

type HeightfieldRouteBuildBudgetEvidenceV1 =
  | Readonly<{ kind: "not-required-empty-source" }>
  | Readonly<{
      kind: "heightfield-tile-estimate";
      tilesX: number;
      tilesZ: number;
      estimatedTiles: number;
      maximumTiles: number;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>;

interface HeightfieldRouteBuildInputReceiptV1 {
  readonly input: HeightfieldRouteBuildInputV1;
  readonly routeBuildInputHash: `sha256:${string}`;
  readonly budgetEvidence: HeightfieldRouteBuildBudgetEvidenceV1;
}
```

Every non-empty soup is canonical: positions and indices have lengths divisible by three; all positions are finite; all indices are safe integers in range; every vertex is referenced; every triangle has three distinct indices and non-zero finite area; and generation removes unused vertices and exact duplicate triangles before hashing. Terrain-source triangles additionally retain a positive-Y normal. Blocker triangles retain a closed, consistently outward winding. The `empty` terrain-source variant is the only representation of no triangles and therefore carries no `CanonicalTriangleSoupV1`.

The factory is:

```ts
createHeightfieldRouteBuildInputV1(input: {
  readonly executionPlan: ExecutionPlanV5;
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly constraintId: string;
}): HeightfieldRouteBuildInputReceiptV1
```

The factory requires a deeply frozen Capability Envelope and never recompiles, mutates, or overlays it.

## Strict admission and resolution

Resolution is by stable identity, never array position:

1. `executionPlan.schemaVersion === 5` and all required hashes are lowercase SHA-256 values.
2. Exactly one connectivity row matches `constraintId`.
3. Its `traversingEntityId` exactly equals `capabilityEnvelope.subjectEntityId`, and that Subject exists in the Plan.
4. Start and destination IDs differ, occur in `traversal.anchorEntityIds`, and have placements.
5. Exactly one route matches `routeId`; route points and width are finite and valid.
6. `route.locomotionProfileRef` exactly equals the Registry-resolved Ref already locked in the Envelope. This is canonical Ref equality, not parsing a Ref string for the word `ground`.
7. Exactly one Heightfield Traversal Surface exists and its `surfaceEntityId` equals `terrain.entityId`.
8. Start and destination XZ are inside the terrain bounds and the exact hard-ribbon membership function.
9. `staticColliders`, water rows, transforms, scales, heights, radii, and all generated soup values are finite. Execution scales must remain strictly positive, matching the Authoring Schema; forged zero or negative scale is rejected instead of adding a second mirrored-transform behavior.
10. Strict Build Input validation requires `connectivityRequirement.routeId === hardRibbon.routeId`, `connectivityRequirement.startAnchorEntityId === startAnchor.entityId`, and `connectivityRequirement.destinationAnchorEntityId === destinationAnchor.entityId`. These role IDs are repeated only to make each nested record self-describing; they may never diverge.
11. The `empty` terrain-source variant contains no triangle soup or bounds. The `bounded` variant contains a non-empty soup, and its minimum/maximum XZ values must exactly equal the finite vertex extrema recomputed by `assertHeightfieldRouteBuildInputV1()`.

Structural failures use `HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID` with a closed `reason` such as `constraint-not-found`, `constraint-ambiguous`, `subject-mismatch`, `anchor-not-explicit`, `anchor-placement-missing`, `route-not-found`, `route-ambiguous`, `surface-missing`, `surface-ambiguous`, `surface-terrain-mismatch`, `envelope-mutable`, `plan-not-v5`, or `non-finite`.

Semantic failures preserve the canonical Route vocabulary: `ROUTE_LOCOMOTION_PROFILE_MISMATCH`, `ROUTE_START_SURFACE_NOT_FOUND`, `ROUTE_DESTINATION_SURFACE_NOT_FOUND`, `ROUTE_WATER_TRAVERSAL_UNSUPPORTED`, and `ROUTE_GRAPH_BUDGET_EXCEEDED`.

## Canonical Heightfield topology

`@whitebox-world/terrain-surface` adds:

```ts
interface TriangleHeightfieldMeshV1 {
  readonly originMetersXYZ: readonly [number, number, number];
  readonly localPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

emitTriangleHeightfieldSurfaceV1(
  input: TriangleHeightfieldSurfaceInput,
): TriangleHeightfieldMeshV1
```

The local representation preserves existing Runtime behavior:

- `originMetersXYZ = [centerX, 0, centerZ]`;
- vertices are row-major, Z rows first and X changing fastest;
- local X/Z span `[-size / 2, +size / 2]`; local Y is the authored Height sample;
- each cell emits `[topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight]`;
- every terrain triangle has a positive-Y outward normal and `signedAreaXZ < 0` in the right-handed coordinate system. Tests lock this 3D normal plus the exact index bytes; they do not call the XZ projection "CCW".

Validation requires at least two vertices on each axis, exact `columns * rows` sample length, positive finite sizes, and finite samples/centers.

`sampleTriangleHeightfieldSurface()` locates the cell but performs XZ barycentric interpolation against the emitter's actual indexed triangles. It does not retain a separate `tx + tz` diagonal formula.

`runtime-babylon/createTerrainMesh()` consumes `localPositionsMetersXYZ` and `triangleIndices`, retains `mesh.position = originMetersXYZ`, and retains the current square HeightField/rectangular Mesh compatibility behavior. Task 3 does not change terrain physics shape selection. Task 5 will use the same emitter for the V5 `PhysicsShapeMesh` authority.

The asymmetric 2x2 saddle and a non-square grid must prove that emitter bytes, sampler plane, Runtime render payload, and Task 3 world-space Graph soup share one diagonal.

## Hard-ribbon construction and clipping

The semantic closed region is exact:

```text
inHardRibbon(pointXZ) =
  distanceToPolylineMetersXZ(pointXZ, pointsMetersXZ) <= widthMeters / 2
```

Consecutive duplicate points are ignored. Fewer than two distinct points is invalid. This function is used for endpoint admission and post-build assertions.

Finite triangle soup uses a deterministic conservative subset of that exact region:

- each non-zero centerline segment defines one convex stadium;
- each half-circle is represented by 16 equal angular chords, an SDK-owned internal constant that is not an Authoring or Profile field;
- every sampled point lies on the exact stadium and every chord lies inside it, so the finite polygon never adds an outside point;
- the XZ boundary order is unique and has `signedAreaXZ < 0`, matching the existing positive-Y right-handed terrain winding because the ordered XZ basis has the opposite sign from XYZ's +Y normal. For segment heading `theta`, emit the left-offset start and end edge, sweep the end cap from `theta + PI/2` down to `theta - PI/2`, emit the right-offset return edge, then sweep the start cap from `theta - PI/2` down to `theta - 3*PI/2`; each half sweep has exactly 16 chords and shared endpoints are emitted once;
- each canonical source terrain triangle is clipped independently against every segment stadium using deterministic Sutherland-Hodgman clipping in XZ;
- new Y values are interpolated on the original source triangle plane;
- each clipped convex polygon is fan-triangulated with the original positive-Y winding;
- exact duplicate triangles are removed by a canonical vertex-key order; partially overlapping coplanar pieces from adjacent stadiums are permitted because they cannot add walkability outside the union and Recast deterministically merges rasterized spans;
- no Heightfield resampling is permitted, and clipping does not apply capsule radius or clearance margin. Recast erosion owns that later.

An inscribed arc can conservatively remove a thin strip near a curved hard-ribbon cap. That is an accepted false-negative margin, not permission to output outside geometry.

The bounded terrain source AABB is computed only from the final retained terrain soup and is an exact certificate: validation recomputes the XZ vertex extrema and rejects any mismatch. Full blocking collider extent does not enlarge the route build bounds; Task 4 uses these bounds when rasterizing relevant blocker triangles. An empty retained result returns the `empty` terrain-source variant with no soup or bounds and skips the tile guard.

## Conservative static blocker tessellation

Task 3 reads only `ExecutionPlanV5.staticColliders`; it never reverse-engineers `objects[]`. Therefore `collisionEnabled: false` objects are absent by construction and a cone visual remains the Compiler-locked analytic cylinder.

All local meshes contain their analytic Runtime collider before the same `T * R * S` transform is applied:

- **box:** exact 8 vertices / 12 triangles;
- **cylinder:** 24-sided circumscribed prism, local radius `radiusMeters / cos(PI / 24)`, exact analytic height, closed top and bottom;
- **sphere:** deterministic level-2 icosphere connectivity. Unit directions are generated first; compute every outward face-plane distance from the origin, scale the full polyhedron by the reciprocal of the minimum positive face distance, and assert every final face plane is at least the analytic radius. This produces a finite circumscribed convex polyhedron rather than an inward visual sphere.

The local-to-world rotation is the already-verified Babylon order `yaw(Y) * pitch(X) * roll(Z)`. Strictly positive scale preserves winding and maps containment through the same invertible linear transform. No AABB is emitted as final collision geometry.

A collider is relevant when its conservative tessellated XZ projection intersects the exact hard ribbon. All R1 analytic blocker shapes and their transformed conservative tessellations are convex, so relevance is frozen as: compute the 2D convex hull of every transformed soup vertex, then retain the collider when the minimum closed 2D distance between that hull and any non-zero hard-ribbon centerline segment is `<= widthMeters / 2`. Segment/polygon intersection or containment has distance zero. This is a region-intersection test, not a vertex-in-ribbon test; a long wall with every vertex outside the ribbon but crossing its centerline must be retained. The entire transformed soup is retained once relevant; clipping a blocker is forbidden because it can create an artificial opening. Blocking colliders are sorted by `colliderSubshapeId` before hashing.

`colliderArtifactHash` is the canonical hash of those sorted provider-neutral blocker rows, including identity, Compiler `colliderHash`, and transformed triangle soup.

## Water semantics

Water is never emitted as support geometry and `waterLevelMeters` is never treated as ground height.

- `walkable`: visual-only for this R1 source; retain Heightfield terrain.
- `blocked`: after hard-ribbon clipping, drop a whole retained terrain triangle when its XZ projection intersects the analytic water boundary and its Y range overlaps `[waterLevelMeters - depthMeters, waterLevelMeters]`. Dropping the whole triangle is conservative and preserves the original terrain diagonal. Record only exclusions that removed at least one triangle, sorted by `waterEntityId`.
- `swimmable`: if the same conservative volume test intersects any candidate hard-ribbon terrain triangle, fail assembly with `ROUTE_WATER_TRAVERSAL_UNSUPPORTED`. A remote swimmable body that does not intersect the route source is allowed. Swimming and `movementMedium: "water"` remain unsupported.

Circle, ellipse, and polygon intersection are analytic 2D tests. A triangle AABB may be used only as a broad phase; it is never the final boundary decision.

`ROUTE_WATER_TRAVERSAL_UNSUPPORTED` is added once to the stable Route diagnostic list and design specification. Blocked water that cuts the route remains `ROUTE_REQUIRED_PATH_UNREACHABLE` in Task 4/Task 7 with evidence naming the Water entity.

## Budget evidence

Task 3 adds no triangle-count budget because Graph Builder Profile V2 has no such field. It calls the existing `assertTraversalGraphBuildBudgetV1()` exactly once for a non-empty retained terrain AABB and does not reproduce its integer-micrometer formula.

The budget guard is upgraded to throw a typed `TraversalGraphBuildBudgetExceededErrorV1` containing:

- `code: "ROUTE_GRAPH_BUDGET_EXCEEDED"`;
- `tilesX`, `tilesZ`, `estimatedTiles`, and `maximumTiles`;
- `minimumMetersXZ` and `maximumMetersXZ` supplied by the Task 3 caller.

The successful estimate is copied to `HeightfieldRouteBuildBudgetEvidenceV1`. This all occurs before Task 4 initializes WASM.

## Hash recipes

- `terrainArtifactHash` hashes the validated, un-clipped canonical Heightfield emitter input using `resolutionVerticesXZ`; it does not repeat the misleading Runtime `resolutionCellsXZ` name.
- `traversalSurface.resourceHash` remains the Compiler-owned `surfaceArtifactHash` source for Task 4.
- `colliderArtifactHash` hashes sorted relevant `StaticBlockingColliderV1` rows and their transformed soups.
- `routeBuildInputHash` hashes the complete validated `HeightfieldRouteBuildInputV1`, including Authoring/Layout/Lock provenance, connectivity roles, Anchor positions, ribbon bytes, Surface/Envelope identity, retained terrain soup, blocker soup, and blocked-water evidence.
- The Receipt never includes `routeBuildInputHash` inside its own hash input.

Changing relevant terrain, surface, collider, route, endpoint, water, or Capability/Profile bytes changes `routeBuildInputHash`. Repeated identical assembly produces byte-identical input and hash. Unrelated far-away blockers or water that cannot intersect the hard ribbon are intentionally excluded and do not invalidate the route source.

## Required RED evidence

Before implementation, tests must fail for:

- V4 Connectivity-only Authoring hash change and explicit V5 Anchor IDs;
- Graph rejection when `routeBuildInputHash` is absent or malformed;
- updated `examples/traversal/route-r0-contract.json` bytes and `pnpm verify:route-r0-contract` after the required Graph clean break;
- asymmetric saddle and non-square canonical emitter/sampler/render bytes;
- `constraintId` selection with multiple rows and all missing/ambiguous/mismatch cases;
- exact endpoint hard-ribbon admission plus U-turn geometry that detects an invalid convex-hull shortcut;
- no clipped vertex outside the exact hard ribbon;
- transformed box, circumscribed cylinder marginal clearance, circumscribed icosphere face-plane containment, and cone-to-cylinder mapping;
- a spanning-wall fixture whose projected convex-hull vertices are all outside the hard ribbon while its region crosses the route centerline; the collider must remain and change `colliderArtifactHash`;
- blocked circle/ellipse/polygon water volume, land above water, swimmable intersection rejection, remote swimmable allowance, and walkable visual-only behavior;
- relevant geometry/hash changes and identical-input determinism;
- empty source bypassing the budget guard and non-empty source returning exact guard evidence;
- empty source carrying no soup/bounds, bounded source requiring a non-empty soup and exact recomputed XZ extrema, and all repeated role IDs matching;
- unknown fields, non-finite values, invalid scales, and forbidden Browser/Babylon/Havok/Recast/provider/file-path terms;
- malformed soup lengths/indices, unreferenced vertices, duplicate or degenerate triangles, wrong terrain winding, and mismatched bounded extrema;
- source imports remaining pure and Task 4 retaining sole provider lifecycle ownership.

## Review disposition

- Initial Cursor design review: `DESIGN NO-GO`. Confirmed missing V4 Authoring provenance, ambiguous multi-route factory selection, absent shared topology emitter, undefined hard-ribbon clipping, unsafe unspecified round-collider tessellation, ambiguous Water semantics, and incomplete budget evidence.
- Host self-review additionally found that V5 placements do not prove explicit Anchor kinds and that `TraversalGraphV1` does not bind ribbon/source bytes. This revision adds `anchorEntityIds` and `routeBuildInputHash` rather than relying on accidental downstream node changes.
- Cursor's infinite-curve recommendations were made implementation-ready as finite conservative geometry: inscribed 16-chord half-caps for walkable ribbon clipping and an inradius-scaled level-2 icosphere for blocker containment. Forged non-positive scale is rejected because the Authoring Schema already permits only positive scale.
- The first revision re-review remained `DESIGN NO-GO`: it found a duplicated empty/bounded terrain authority, a missing spanning-wall relevance contract, and an omitted R0 Graph golden update. Those findings are accepted. The terrain source is now a real discriminated union with exact bounded-AABB validation, blocker relevance is closed-region distance rather than vertex membership, and the R0 fixture/gate is part of Task 3A. Repeated role-ID equality and the exact negative XZ signed-area stadium order close the associated P2 findings.
- The third design pass returned `DESIGN GO` with no P0-P1. Its P3 evidence guidance is accepted: terrain tests lock positive-Y normals and exact index bytes rather than ambiguous 2D "CCW" language; ribbon/collider tests prove containment, region intersection, and no outside points without freezing arbitrary start-vertex numbering; and the R0 `routeBuildInputHash` is a one-time contract placeholder rather than a fabricated real Task 3C source hash. Real Build Input golden bytes belong only to the 3C fixture.

Implementation may now begin with Task 3A RED tests. Design approval does not waive the Task 3A/3B/3C focused gates, code review, or fresh final review.
