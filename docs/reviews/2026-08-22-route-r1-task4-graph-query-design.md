# Route R1 Task 4 Canonical Graph and Query Design

Status: DESIGN GO; implementation and code review pending

## Decision

Task 4 is one deterministic, one-shot provider operation. It consumes one immutable
`HeightfieldRouteBuildInputReceiptV1`, builds one retained Recast tiled NavMesh, projects its
ground polygons and adjacency into canonical SDK Graph evidence, selects the required Route on
that canonical Graph, asks Detour only to string-pull the selected polygon corridor, and releases
every operation-owned WASM object before resolving.

Recast polygon, Tile, Link, Array, Query, NavMesh, status, and error values never cross the
adapter boundary. Babylon and Havok remain absent from this package.

The public adapter operation is:

```ts
interface EvaluateRequiredHeightfieldRouteInputV1 {
  readonly buildInputReceipt: HeightfieldRouteBuildInputReceiptV1;
  readonly abortSignal?: AbortSignal;
}

evaluateRequiredHeightfieldRouteV1(
  input: EvaluateRequiredHeightfieldRouteInputV1,
): Promise<HeightfieldRouteConnectivityResultV1>
```

`AbortSignal` is operation-only and never enters canonical bytes. An abort rejects with one
SDK-owned `RouteConnectivityOperationAbortedErrorV1` after owned resources are released; it does
not fabricate a deterministic `unreachable` or `incomplete` artifact.

`buildHeightfieldTraversalGraphV1()` and `queryRequiredRouteV1()` remain named focused adapter
functions called inside that operation. Their source modules may export provider-bearing seams
for direct tests, but the package root must not expose signatures containing Recast types. Task 4
does not build a NavMesh twice, retain a provider closure, or query serialized Graph bytes as if
they still contained provider handles.

The public result is a closed union whose outer status, Graph availability, and nested failure
type are correlated structurally rather than checked only by prose:

```ts
type HeightfieldRouteConnectivityResultV1 =
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      routePathReceipt: RoutePathReceiptV1;
      routePathReceiptHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "unreachable";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: RouteConnectivityFailureCompleteUnreachableV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "incomplete";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: RouteConnectivityFailureCompleteIncompleteV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "unreachable";
      graphStatus: "unavailable";
      connectivityFailure: RouteConnectivityFailureUnavailableUnreachableV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "incomplete";
      graphStatus: "unavailable";
      connectivityFailure: RouteConnectivityFailureUnavailableIncompleteV1;
      connectivityFailureHash: Sha256Hash;
    }>;
```

An empty retained terrain source returns a canonical unreachable failure without initializing
WASM and has `graphStatus: "unavailable"`. A non-empty source that produces zero queryable terrain
polygons returns a specialized threshold reason when the rejection proof graph establishes one
unique singleton cut, and otherwise returns the distinct `no-queryable-ground-surface` reason;
both have unavailable Graph status. Node/Edge projection capacity also returns no partial Graph. Once a
complete Graph exists, endpoint, reachability, search-budget, or straight-path failure returns
that immutable Graph and its external Hash beside a failure body bound to the same Hash. A
non-empty source enters exactly one `runRecastProviderOperationV1()` callback.

## Trust and admission before provider allocation

Before the callback:

1. call the new traversal-owned `assertHeightfieldRouteBuildInputReceiptV1(receipt)`, which
   requires a deeply frozen plain receipt with exactly `input`, `routeBuildInputHash`, and
   `budgetEvidence`, calls `assertHeightfieldRouteBuildInputV1(receipt.input)`, recomputes the input
   Hash, and recomputes exact empty/bounded Tile-budget evidence;
2. resolve the embedded Graph Builder identity as the exact Registry V2 Profile and compare
   every copied policy field, from `clearanceMarginMeters` through `maximumSearchSteps`, rather
   than checking Ref/version/hash alone;
3. reject mutable, malformed, unknown, stale, or internally inconsistent receipt fields before
   calling the lifecycle or the Recast mapper;
4. check `abortSignal` before queue entry and again after initialization/build/projection phases.

The Receipt assertion is the single public admission implementation used by both the evaluator
and the contextual Result validator. They must not maintain two subtly different Hash/budget
checks.

`routeBuildInputHash` is a canonical integrity binding, not a signature or authentication token.
Changing a nested source, Envelope lock Hash, or policy value without changing the outer Hash is
rejected before provider initialization. A caller that fabricates an entire self-consistent
receipt is outside this content-integrity guarantee; trusted orchestration remains responsible
for deriving the Envelope from the actual Lock Receipt.

Task 3 already rejects a genuine Tile estimate above `maximumTiles`, so such input has no valid
receipt. In Task 4:

- forged or stale Tile budget evidence is an admission error with zero provider calls;
- actual Node, Edge, search, or straight-path capacity exhaustion is a deterministic
  `incomplete` failure;
- `navMesh.getMaxTiles()` is allocation capacity, not observed Tile count, and is never reported
  as build evidence.

## Provider source areas and Adapter identity

The locked high-level `generateTiledNavMesh()` cannot be used unchanged with a merged terrain and
blocker soup. In `recast-navigation` 0.43.1 it applies `markWalkableTriangles()` uniformly to all
input triangles. A closed Box, Cylinder, or Sphere therefore exposes upward blocker faces as
walkable polygons, and Task 4 would falsely label those polygons as the Heightfield Traversal
Surface. That violates the R1 single-surface contract and would make low boxes or walls act like
undeclared static platforms.

Task 4 adds one narrow, version-pinned provider extension instead of copying the tiled generator:

1. merge positions and indices in this exact order: retained terrain first, then complete
   relevant blocker soups sorted by `colliderSubshapeId`;
2. pass `sourceAreaMode` if and only if the canonical Build Input contributes at least one blocker
   triangle and blocker vertex; a zero-blocker terrain omits the option and follows the Task 2
   no-option path;
3. when the mode is present, before the first provider-owned allocation validate
   `0 < terrainVertexCount < mergedVertexCount` and scan every original index triple globally,
   including triangles outside the explicit XZ build bounds;
4. pass the terrain vertex-count boundary and reserved blocker area ID as internal generator
   options and require every triangle to lie wholly on one side of that boundary;
5. apply normal slope classification only to terrain triangles;
6. rasterize blocker triangles with one reserved non-null area so
   `filterLowHangingWalkableObstacles()` cannot promote their top faces;
7. after `buildCompactHeightfield()` and before erosion, convert that reserved blocker area to
   `RC_NULL_AREA`; erosion therefore treats the blocker as an obstacle and no blocker polygon is
   emitted;
8. retain only terrain Area/Flag in the explicit Detour Query filter; off-mesh areas remain
   forbidden.

The exact mapping is terrain input area `RC_WALKABLE_AREA` -> Detour area `0`, Flag `1`; blocker
input reserved area `1` -> compact `RC_NULL_AREA` before contour construction, therefore no
Detour polygon or Flag. The reserved value is not an Agent-facing Surface type.

The extension changes source-area semantics, so it cannot hide inside the existing
`lifecycle.1+mapping.1` identity. Before implementation, update the provider ADR and patch
identity evidence, include the TypeScript declaration bytes and installed semantic-patch bytes,
and bump the Adapter resolved version to include `source-areas.1+mapping.2`. `mapping.2` binds:

- terrain-first merge and terrain vertex boundary;
- exact source-area activation predicate `blocking triangle count > 0`;
- reserved area and final polygon Flag mapping;
- explicit rasterization bounds;
- endpoint query extents and Query filter;
- canonical polygon, portal, slope, step, clearance, and cost formulas;
- fixed angle/cost quantization constants and status/capacity rules.

The existing no-area-option semantic golden must remain byte-identical, and the ordinary
zero-blocker Heightfield path must prove it did not pass the option. A new real-WASM golden must
prove that adding one low Box activates the mode with a strictly interior boundary, produces no
queryable Box-top polygon, and leaves surrounding terrain connected. Passing the option with a
terrain-only boundary equal to the merged vertex count is invalid. This is an internal provider
mapping change; Adapter identity remains forbidden from Profile, Envelope, Lock, Graph, and
AI-facing Schema as frozen in Task 2.

## Provider bounds and input geometry

The provider receives the complete blocker soups, but rasterization bounds are not inferred from
their global AABB. They are explicit:

```text
minimum X/Z = terrainSource.minimumMetersXZ
maximum X/Z = terrainSource.maximumMetersXZ
minimum Y   = minimum Y across retained terrain and relevant blocker positions
maximum Y   = maximum Y across retained terrain and relevant blocker positions
```

This preserves the Task 3 budget certificate: a far-extending relevant blocker cannot silently
enlarge the tiled XZ build. Expanded per-Tile border queries may consume the complete blocker
triangles near the bounded corridor. Blockers are never replaced by visual Bounds or AABBs.

Recast configuration still comes only from the embedded `TraversalCapabilityEnvelopeV1` through
`mapTraversalCapabilityEnvelopeToRecastTiledConfigV1()`. Source-area and explicit-bounds options
are content-derived adapter inputs, not a second capability Profile.

## One operation and ownership

The non-empty path is:

```text
validate receipt
  -> runRecastProviderOperationV1(async () => {
       generate one retained, source-area-aware tiled NavMesh
       -> create one explicitly owned QueryFilter
       -> initialize one raw NavMeshQuery(maxNodes = maximumSearchSteps) and check status
       -> apply the terrain-only owned QueryFilter directly to raw calls
       -> project and canonicalize the complete bounded Graph
       -> find and clamp start/destination ground polygons
       -> run bounded SDK-owned A* over canonical Graph edges
       -> pass selected provider polygon refs to findStraightPath
       -> project canonical success/failure evidence
       -> copy plain straight-path evidence inside one SDK-owned raw-call seam
       -> destroy all query-call arrays/refs in reverse acquisition order
       -> call rawQuery.destroy(), then Raw.destroy(rawQuery), then
          Raw.destroy(QueryFilter.raw), then destroy the retained generator Result in finally
     })
```

Task 4 must not call `NavMeshQuery.computePath()`: locked 0.43.1 converts a partial corridor into
a successful closest-point path and has early-return array leaks. Task 4 also must not use
`NavMeshQuery.findPath()` as the authoritative path selector because Detour's area-cost filter
cannot express the frozen SDK slope/step weights or canonical-ID tie break.

The pinned high-level `NavMeshQuery` constructor does not check raw initialization status and its
implicit `QueryFilter` is not released by `query.destroy()`. Task 4 therefore does not construct
that high-level wrapper. It owns one raw Query, checks `rawQuery.init(...)`, and owns one explicit
Filter. Releasing the Query is a required two-stage action: `rawQuery.destroy()` releases its
native Detour allocation, then `Raw.destroy(rawQuery)` releases the Embind wrapper. Both releases
are attempted before the Filter and retained generator Result are released.

The pinned high-level `findNearestPoly()` and `findStraightPath()` also allocate temporary WASM
owners without a total unwind if the raw call throws. Task 4 uses narrow SDK-owned raw-call seams
for both operations. Each seam allocates every output Ref/Array, calls the one raw Detour method,
copies only plain values, and releases all owners in `finally`, including on provider throw.
Nearest-poly must have both a successful status and non-zero `nearestRef`; the implementation
checks the Ref before reading or validating the provider point because locked 0.43.1 can return a
successful status, zero Ref, and NaN point for a miss. Only a non-zero Ref's finite plain clamped
point supplies the start/destination query position. Straight-path receives those clamped points
and the provider refs corresponding to the SDK-selected canonical corridor.

The stable straight-path maximum is `corridor.length + 1`, but locked Detour sets
`DT_BUFFER_TOO_SMALL` when a result exactly fills the supplied raw capacity, including a complete
`START, END` two-point path. The raw seam therefore allocates and passes one private sentinel slot:
`rawCapacity = stableMaximum + 1`. It publishes at most `stableMaximum` points. A count above that
maximum proves deterministic incomplete with `minimumRequiredCount = stableMaximum + 1`.
`DT_BUFFER_TOO_SMALL` on the sentinel-sized call is accepted as the same proof only when the count
exactly fills `rawCapacity`; a contradictory buffer detail with a smaller count is a typed provider
invariant error, not fabricated budget evidence. Otherwise the count must be in range and the last
point must carry completion evidence (`DT_STRAIGHTPATH_END` and terminal Ref `0`). Provider
capacity and the sentinel never enter canonical bytes or alter the inclusive public maximum.

Cleanup errors are not gameplay failures. Raw Query native allocation, raw Query Embind wrapper,
explicit QueryFilter raw object, retained Result, and every operation-local raw-call owner each
have one declared release path. When primary work and cleanup both fail, return no canonical
artifact and throw one SDK-owned aggregate infrastructure error after attempting every owned
release. Provider strings and numeric status values never enter stable evidence.

## Endpoint query

Endpoint nearest-poly half extents are locked from Envelope values:

```text
x/z = capsuleRadiusMeters + clearanceMarginMeters + voxelCellSizeMeters
y   = capsuleHeightMeters / 2 + maxStepHeightMeters + voxelCellHeightMeters
```

The Query's include Flag is exactly the R1 terrain polygon Flag and its exclude Flag is zero.
Blocker, off-mesh, and unknown area/flag values are not queryable. Both clamped endpoints must map
to projected canonical Nodes; a provider polygon filtered from the canonical R1 Graph is treated
as surface-not-found, not silently relabeled.

## Canonical polygon Graph

Each queryable ground Detour polygon whose canonical Node point passes the hard-ribbon proof
becomes exactly one `TraversalNodeV1`. A polygon whose point escaped because of conservative
provider simplification is recorded in an operation-local omitted-Ref Set and cannot contribute a
Node or Edge. Provider polygon Refs are keys only in operation-local forward/reverse/omitted
collections. Off-mesh polygons/links are forbidden.
Tile enumeration scans allocation slots only to locate non-null Headers, counts those Headers as
the observed Tile set, requires zero `offMeshConCount`, and never reports `getMaxTiles()` as an
observed count. A non-null Header count above the admitted Task 3 `estimatedTiles` is a provider
mapping invariant error, not a second budget result. Polygon Refs are reconstructed only as
`getPolyRefBase(tile) + polygonIndex` and discarded after the operation.

For each polygon:

- read base world vertices from its owning Tile;
- quantize every XYZ component to `positionQuantizationMeters` with round-half-away-from-zero as
  a safe integer grid and normalize negative zero;
- remove adjacent duplicate vertices and reject fewer than three distinct vertices or zero XZ
  area after quantization;
- canonicalize the closed vertex cycle by choosing the lexicographically smallest rotation over
  both directions;
- derive `traversal-node:<sha256>` from canonical JSON containing `kind`, `schemaVersion`,
  `surfaceArtifactHash`, the three role-specific Surface IDs, and that integer vertex cycle;
- publish the quantized arithmetic centroid as `positionMetersXYZ`;
- conservatively omit the polygon when that centroid does not lie in the shared finite hard-ribbon
  proof geometry;
- derive `traversal-tile:<sha256>` from canonical JSON containing `kind`, `schemaVersion`, and
  signed `tileX`, `tileZ`, and `tileLayer`, never from Tile Ref, index, salt, or insertion order;
- inspect every Detour detail-mesh triangle for that polygon; reject a degenerate detail triangle
  and define polygon slope as the maximum detail-triangle slope;
- publish conservative guaranteed clearance, not an invented exact visual measurement.

The R1 guaranteed Node clearance is:

```text
clearanceWidthMeters  = 2 * walkableRadiusCells * voxelCellSizeMeters
clearanceHeightMeters = walkableHeightCells * voxelCellHeightMeters
```

These values are rounded downward to the position-meter grid. They are conservative observed
lower bounds and do not claim exact distance to every obstacle.

Task 3A added `routeBuildInputHash` and intended to freeze Graph V1, but Task 4 host review proved
the existing `heightDeltaMeters` fixture already means signed Node-height delta and cannot also
be redefined as non-negative portal step height. Because the contract is unreleased, Task 4
authorizes one final narrow clean break:

- retain `heightDeltaMeters` as signed destination-centroid Y minus source-centroid Y;
- add non-negative `stepHeightMeters` as the portal discontinuity used for step admission/cost;
- validate Edge `type` by the closed priority `stepHeightMeters > 0` → `step`, else
  `slopeDegrees > 0` → `slope`, else `walk`;
- update the R0 fixture and its external Graph Hash exactly once with this review disposition;
  its existing `slopeDegrees: 1.4` Edge therefore changes from the inconsistent `walk` label to
  `slope` while receiving `stepHeightMeters: 0`;
- make `canonicalTraversalGraphV1()` emit lexicographically ordered Node/Edge maps and a deeply
  frozen canonical value, so canonical bytes and the Graph embedded in a Result share one
  immutable representation;
- preserve every other Graph field and keep provider identity absent;
- forbid any later Task 4–10 golden refresh without a new explicit contract review.

The Graph also requires `surfaceArtifactHash === buildInput.traversalSurface.resourceHash`,
requires every Node's three Surface role IDs to equal the Build Input identity, and recomputes
every Node/Edge ID while the Build Input is present. Standalone Graph canonicalization does not
invent a root Surface field or require every generic V1 Node to share one Surface; the Task 4
contextual assertion owns that single-Heightfield rule.

Each non-zero ground Link becomes one directed Edge after its target Ref resolves to a projected
Node. Portal recovery uses the source `DetourLink.edge/side/bmin/bmax`, the source edge, and the
target quantized cycle to find one positive-length collinear XZ overlap. It must not assume two
polygons share an identical vertex pair. For an internal Link, the source edge supplies the full
candidate interval; for a cross-Tile Link, `bmin/bmax` first clips that source interval. The final
overlap endpoints are quantized and canonically ordered. A complete overlap segment outside the
shared finite hard-ribbon proof geometry omits that Edge conservatively.

`traversal-edge:<sha256>` is derived from canonical JSON containing `kind`, `schemaVersion`,
`fromTraversalNodeId`, and `toTraversalNodeId`. A valid R1 convex ground mesh has one canonical
portal per ordered polygon pair, which is also what Detour's polygon-corridor string pull can
identify. A second Link with byte-identical portal evidence is ignored; a different portal or
Edge evidence for the same ordered pair is a structural mapping error rather than a parallel Edge.
Link traversal is bounded by the owning Header's `maxLinkCount`; an out-of-range index, cycle, or
invalid edge index is a structural mapping error. A zero Ref is an ordinary boundary and produces
no Edge; a Ref in the explicit omitted Set drops that Link conservatively; any other non-zero
unresolved target Ref is a structural mapping error.

Edge evidence uses the frozen Graph fields as follows:

- `distanceMeters`: XZ centroid distance rounded upward to the position-meter grid;
- `heightDeltaMeters`: quantized destination-centroid Y minus source-centroid Y;
- `stepHeightMeters`: the non-negative maximum absolute source/target portal-height discontinuity
  at the two recovered portal-overlap endpoints;
- `slopeDegrees`: maximum of both polygons' detail-triangle slopes;
- `minimumClearanceWidthMeters`: the same conservative eroded lower bound as the Nodes,
  `2 * walkableRadiusCells * voxelCellSizeMeters`; portal length is topology evidence and must not
  be mislabeled as corridor width;
- `minimumClearanceHeightMeters`: the conservative Node height lower bound;
- `type`: `step` when `stepHeightMeters` is non-zero, otherwise `slope` when observed
  slope is non-zero, otherwise `walk`;
- `routePathCost`: the frozen dimensionless cost using `stepHeightMeters`.

Edges whose slope, step, or clearance evidence violates the Envelope are not traversable and are
not inserted. ID or geometry collisions never overwrite a Map entry. Enforce `maximumNodes` and
`maximumEdges` during projection; capacity exhaustion returns deterministic `incomplete` with no
Graph. Then run `canonicalTraversalGraphV1()` and `hashTraversalGraphV1()` before the Graph leaves
the operation.

## Deterministic rejection attribution

Dropping a non-traversable Node/Edge is sufficient for path correctness but insufficient for the
frozen Agent-facing diagnostics. Task 4 therefore builds one operation-local, provider-neutral
rejection proof graph beside the publishable Graph. It is derived from the same canonical clipped
Heightfield triangles, complete collider soups, hard ribbon, quantization, and Capability Envelope;
it contains no Recast Ref/status and never becomes an alternate pass/fail authority.

Each source-derived candidate region or adjacency has a stable
`route-rejection-candidate:<sha256>` ID and a sorted closed set of threshold rejections:

- triangle/detail slope above `maxSlopeDegrees`;
- portal discontinuity above `maxStepHeightMeters`;
- horizontal capsule/clearance obstruction below the locked conservative width;
- vertical capsule interval obstruction below the locked conservative height;
- a positive unsupported source-boundary gap, whose R1 allowed value is zero.

Slope comes from canonical triangle normals. Step and gap come from quantized adjacent source
boundaries. Width and overhead use conservative capsule-clearance tests against complete collider
triangle soups and the hard-ribbon boundary; visual Bounds/AABBs are forbidden. Candidate
construction and search are bounded by the admitted Node/Edge/search budgets. Exhausting only the
diagnostic proof budget never changes an already-proven unreachable result to incomplete; it
deterministically falls back to the generic unreachable reason.

After the authoritative Graph query is unreachable, the SDK tests counterfactual connectivity on
this proof graph by relaxing exactly one closed rejection kind at a time. A specialized reason is
published only when exactly one singleton relaxation restores start-to-destination connectivity
and every candidate admitted by that relaxation has no remaining rejection. Zero restoring
singletons, multiple restoring singletons, multi-reason cuts, inconsistent source/provider
projection, or exhausted proof budget all produce `required-path-unreachable` (or
`no-queryable-ground-surface` when no canonical Node exists). This is a conservative explanation,
not a guess from the absence of a path.

The canonical specialized reason carries `proofKind: "unique-single-reason-cut"`, sorted unique
`proofCandidateIds`, the relevant Terrain/Collider role IDs, and unit-qualified observed/allowed
values. The five closed codes are `ROUTE_SLOPE_EXCEEDED`, `ROUTE_STEP_HEIGHT_EXCEEDED`,
`ROUTE_CLEARANCE_WIDTH_INSUFFICIENT`, `ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT`, and
`ROUTE_SURFACE_GAP_EXCEEDED`. Validation maps these exact reasons; it may never infer a specialized
code from generic unreachable evidence.

## Canonical path selection and hard-ribbon proof

`queryRequiredRouteV1()` receives an operation-local SDK query-provider seam backed by the owned
raw Query, operation-local provider Ref Maps, the canonical Graph, and locked Build Input. It does
not accept a naked provider Query or graph-shaped object, and its package-root signature contains
no Recast type.

Path selection is SDK-owned bounded A*:

- start/destination are the canonical Nodes mapped from the clamped Detour refs;
- outgoing Edges are visited in canonical Edge-ID order;
- costs are converted to safe integer micro-ratio units before accumulation; overflow is a typed
  projection invariant failure, never silent floating-point reordering;
- every Task 4 projected Edge must have `edgeCostUnits >= 1`; the frozen standalone Graph
  canonicalizer continues accepting legacy zero-cost values, but the R1 projector rejects a
  zero-cost Edge as a typed invariant error so an optimal path cannot contain a zero-cost cycle;
- the open-set ordering is the closed tuple `(fCostUnits, gCostUnits, nodeId)`;
- the admissible heuristic is quantized direct XZ distance divided by
  `maximumEdgeLengthMeters`;
- one non-stale heap pop at the current `bestG` consumes one `maximumSearchSteps` unit; stale
  entries are discarded without consuming budget;
- finding the destination records its optimal integer cost but does not immediately stop; A*
  continues until the next non-stale minimum `fCostUnits` is greater than that destination cost,
  thereby closing the whole equal-cost frontier;
- after that frontier closes, scan Edges satisfying
  `bestG[from] + edgeCost === bestG[to]` to form a positive-cost shortest-path DAG, reverse-mark
  Nodes that reach the destination, then greedily choose the first canonical Edge that stays in
  that marked DAG. This yields the lexicographically smallest complete Edge-ID sequence without
  copying path arrays into heap records;
- every loop iteration first discards stale entries, then applies this exact order: an empty heap
  is success when destination cost is known and otherwise `unreachable`; a known destination with
  next minimum `fCostUnits > destinationCostUnits` is success; a still-open frontier with
  `settledCount === maximumSearchSteps` is `incomplete`; only then may the next current entry be
  popped, counted, and expanded. Therefore the maximum-th settlement can produce success when it
  closes the frontier, unreachable when it leaves an empty heap without a destination, or
  incomplete when another non-stale candidate remains;
- reconstruction produces ordered canonical Node/Edge IDs and their operation-local provider
  refs.

The selected provider refs are passed only to the raw straight-path seam. Its stable inclusive
capacity is `corridor.length + 1`, which is already bounded by Graph/search budgets; the private
raw allocation/call uses `corridor.length + 2` for the one sentinel slot described above.

The first and last published positions are the quantized provider-clamped endpoint positions,
never silently restored Anchor Y values. Every copied provider point is quantized before proof
and publication. Success additionally requires:

- every selected canonical pair has exactly one directed Graph Edge;
- every Node carries the root Traversal Surface identity;
- every point and every complete segment is proven inside the hard ribbon;
- the first/last points remain within the frozen query extents of their Anchors;
- no provider status indicates partial, out-of-nodes, or buffer exhaustion.

Hard-ribbon segment proof reuses Task 3's SDK-owned inscribed 16-chord-per-half-cap stadiums. A
segment is accepted only when the union of closed parameter intervals produced by exact convex
segment/stadium clipping covers `[0,1]`. Endpoint-only checks and sampling are insufficient for a
U-shaped Route because they can admit a convex-hull shortcut.

Provider Refs, status values, and error text are discarded after projection.

## Route Path Receipt and cost

`RoutePathReceiptV1` is strict, canonical, deeply frozen, and success-only:

```ts
interface RoutePathReceiptV1 {
  readonly kind: "route-path-receipt";
  readonly schemaVersion: 1;
  readonly status: "complete";
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly traversalGraphHash: Sha256Hash;
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
  readonly orderedTraversalNodeIds: readonly string[];
  readonly orderedTraversalEdgeIds: readonly string[];
  readonly orderedPathPositionsMetersXYZ: readonly Vec3[];
  readonly routePathDistanceMeters: number;
  readonly routePathCost: number;
  readonly maximumObservedSlopeDegrees: number;
  readonly maximumObservedStepHeightMeters: number;
  readonly minimumObservedClearanceWidthMeters: number;
  readonly minimumObservedClearanceHeightMeters: number;
  readonly maximumObservedSurfaceGapMeters: number;
}
```

`routePathDistanceMeters` is computed by ceiling each 3D straight-path segment length to the
position-meter grid, converting each to safe integer meter units, checking accumulation overflow,
then summing those units. It is not `ceil(sum(rawSegments))`.
`routePathCost` is the quantized sum of the selected Graph Edge costs.
`maximumObservedStepHeightMeters` uses Edge `stepHeightMeters`, never centroid height delta.
`maximumObservedSurfaceGapMeters` is zero for linked R1 polygons; non-zero gaps require an R1b
typed Traversal Link.

A same-polygon route is a valid zero-Edge result: it has one ordered Node, zero ordered Edges,
zero Graph cost, zero observed step and gap, and its minimum clearance comes from that selected
Node. For every result, maximum observed slope is the maximum of selected Edge slopes and the
ceiling-quantized slope of every published straight-path segment; a segment with zero XZ length
and non-zero Y delta has `90` degrees. Minimum clearance is the conservative minimum across all
selected Nodes and Edges, with Nodes providing the value when there are no Edges. Adjacent
quantized straight-path points are deduplicated. A one-point path is valid only when the quantized
clamped start and destination positions are equal; otherwise at least two points are required.

`orderedTraversalEdgeIds.length` is exactly `orderedTraversalNodeIds.length - 1`. Each Edge must
connect the adjacent ordered Nodes in direction, so Path cost can be recomputed without guessing
from mutable map iteration.

The dimensionless Edge cost is:

```text
distanceRatio = distanceMeters / maximumEdgeLengthMeters
slopeRatio    = maxSlopeDegrees == 0 ? 0 : slopeDegrees / maxSlopeDegrees
stepRatio     = maxStepHeightMeters == 0 ? 0 : stepHeightMeters / maxStepHeightMeters
edgeCost      = distanceRatio
              + slopeCostWeight * slopeRatio
              + stepCostWeight * stepRatio
```

A non-zero slope at zero maximum slope, or non-zero step at zero maximum step, is
non-traversable. Position coordinates and portal heights use round-half-away-from-zero on the
`positionQuantizationMeters` integer grid. Published distances and upper-bound observations use
ceiling; guaranteed clearance lower bounds use floor. Angles use the Adapter's frozen
`1e-6 degrees` ceiling grid. Dimensionless Edge costs use a separate frozen `1e-6 ratio` ceiling
grid, while the A* heuristic floors direct XZ distance to the meter grid and then floors to the
same ratio grid. Edge-cost accumulation stays in safe integer ratio units. These paired modes
preserve admissibility and conservative evidence after quantization. A meter quantum must never
be reused as a ratio quantum.

`canonicalRoutePathReceiptV1()` and `hashRoutePathReceiptV1()` are the only canonical/hash APIs.
Result validation has two intentionally distinct entry points:

- `canonicalHeightfieldRouteConnectivityResultV1(value)` validates the strict standalone union,
  recomputes every nested canonical Graph/Path/Failure Hash, checks outer/nested status and Hash
  equality, Node/Edge ordering and adjacency, and recomputes distance, cost, and observed metrics;
- `assertHeightfieldRouteConnectivityResultForBuildInputV1(value, buildInputReceipt)` first
  canonicalizes the standalone result, then recomputes the Build Input Hash and compares every
  authoring/layout/resource/terrain/collider/surface/Route/Anchor/Subject/Lock/Profile binding
  available from that Receipt.

The evaluator must call the contextual assertion before returning. A standalone value cannot
claim Build Input equality from a Hash alone. Hashes remain external to their own canonical body.

## Failure contract and package ownership

`@whitebox-world/traversal` must not import `@whitebox-world/validation`. It owns a narrow
provider-neutral `ROUTE_CONNECTIVITY_FAILURE_CODES_V1` list and closed failure union. Validation
imports those connectivity codes, composes them with admission/compiler and runtime-only codes,
and exhaustively maps the closed failure reason to `ValidationDiagnosticV2`. Runtime-only
`ROUTE_RUNTIME_*` codes can never be emitted by Task 4.

Validation V2 gains one canonical metadata kind, `route-connectivity-failure`, because an empty
source, zero queryable ground, or Node/Edge capacity result intentionally has no Graph/Path
artifact to cite. Its evidence metadata binds the failure content Hash, `routeBuildInputHash`,
`resolvedTraversalLockHash`, and Graph Builder Ref/version/hash; it never copies provider status
or error text:

```ts
interface RouteConnectivityFailureEvidenceArtifactV2
  extends EvidenceArtifactBaseV2 {
  readonly kind: "route-connectivity-failure";
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
}
```

Evidence requirements become status-aware:

- a passed `route-connectivity` Metric must cite `traversal-graph` or
  `route-path-receipt` evidence;
- a failed Metric may cite either of those or `route-connectivity-failure` evidence;
- a not-evaluated Metric caused by canonical `incomplete` should cite the failure artifact, while
  an infrastructure/missing-input not-evaluated outcome may still lack a deterministic artifact.

Graph/Path/Failure evidence resolves its Graph Builder identity through the version-dispatching
`resolveTraversalGraphBuilderProfile()`, not the V1-only resolver, so the locked V2 Heightfield
Profile is accepted without weakening exact Ref/version/hash checks.

Budget failure diagnostics use a new closed detail kind
`capacity-exceeded { maximumAllowedCount, minimumRequiredCount }`. They must not populate the
existing `count-threshold.actualCount`, because projection/search/Detour may prove only the lower
bound `maximumAllowedCount + 1`, not the complete count.

Common failure provenance contains Route/Subject/Anchor IDs, Build Input/Lock hashes, and Graph
Builder Ref/version/hash. The reason is a discriminated union:

```ts
interface RouteThresholdRejectionProofV1 {
  readonly proofKind: "unique-single-reason-cut";
  readonly proofCandidateIds: readonly string[];
  readonly failurePositionMetersXYZ: Vec3;
}

type RouteThresholdRejectionReasonV1 =
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "slope-threshold-exceeded";
      code: "ROUTE_SLOPE_EXCEEDED";
      terrainEntityId: string;
      maximumObservedSlopeDegrees: number;
      maximumAllowedSlopeDegrees: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "step-height-threshold-exceeded";
      code: "ROUTE_STEP_HEIGHT_EXCEEDED";
      terrainEntityId: string;
      maximumObservedStepHeightMeters: number;
      maximumAllowedStepHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "clearance-width-insufficient";
      code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceWidthMeters: number;
      minimumRequiredClearanceWidthMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "overhead-clearance-insufficient";
      code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceHeightMeters: number;
      minimumRequiredClearanceHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "surface-gap-exceeded";
      code: "ROUTE_SURFACE_GAP_EXCEEDED";
      terrainEntityId: string;
      maximumObservedSurfaceGapMeters: number;
      maximumAllowedSurfaceGapMeters: 0;
    }>;

type RouteConnectivityFailureReasonV1 =
  | Readonly<{
      kind: "empty-heightfield-source";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "no-queryable-ground-surface";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      terrainEntityId: string;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "start-surface-not-found";
      code: "ROUTE_START_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "destination-surface-not-found";
      code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "required-path-unreachable";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      traversalSurfaceId: string;
      relevantBlockingColliderEntityIds: readonly string[];
      blockedWaterEntityIds: readonly string[];
    }>
  | Readonly<{
      kind: "node-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "edge-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "search-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "straight-path-capacity-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | RouteThresholdRejectionReasonV1;
```

The canonical failure body is exactly four closed status/Graph variants. The implementation must
not model `status`, `graphStatus`, and `reason` as independent union-valued fields:

```ts
interface RouteConnectivityFailureCommonV1 {
  readonly kind: "route-connectivity-failure";
  readonly schemaVersion: 1;
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly startAnchorPositionMetersXYZ: Vec3;
  readonly destinationAnchorPositionMetersXYZ: Vec3;
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
}

type RouteConnectivityUnavailableUnreachableReasonV1 =
  | Extract<RouteConnectivityFailureReasonV1, { kind: "empty-heightfield-source" }>
  | Extract<RouteConnectivityFailureReasonV1, { kind: "no-queryable-ground-surface" }>
  | RouteThresholdRejectionReasonV1;

type RouteConnectivityUnavailableIncompleteReasonV1 =
  | Extract<RouteConnectivityFailureReasonV1, { kind: "node-budget-exceeded" }>
  | Extract<RouteConnectivityFailureReasonV1, { kind: "edge-budget-exceeded" }>;

type RouteConnectivityCompleteUnreachableReasonV1 =
  | Extract<RouteConnectivityFailureReasonV1, { kind: "start-surface-not-found" }>
  | Extract<RouteConnectivityFailureReasonV1, { kind: "destination-surface-not-found" }>
  | Extract<RouteConnectivityFailureReasonV1, { kind: "required-path-unreachable" }>
  | RouteThresholdRejectionReasonV1;

type RouteConnectivityCompleteIncompleteReasonV1 =
  | Extract<RouteConnectivityFailureReasonV1, { kind: "search-budget-exceeded" }>
  | Extract<RouteConnectivityFailureReasonV1, { kind: "straight-path-capacity-exceeded" }>;

type RouteConnectivityFailureCompleteUnreachableV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "unreachable";
      graphStatus: "complete";
      traversalGraphHash: Sha256Hash;
      reason: RouteConnectivityCompleteUnreachableReasonV1;
    }>;

type RouteConnectivityFailureCompleteIncompleteV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "incomplete";
      graphStatus: "complete";
      traversalGraphHash: Sha256Hash;
      reason: RouteConnectivityCompleteIncompleteReasonV1;
    }>;

type RouteConnectivityFailureUnavailableUnreachableV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "unreachable";
      graphStatus: "unavailable";
      reason: RouteConnectivityUnavailableUnreachableReasonV1;
    }>;

type RouteConnectivityFailureUnavailableIncompleteV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "incomplete";
      graphStatus: "unavailable";
      reason: RouteConnectivityUnavailableIncompleteReasonV1;
    }>;

type RouteConnectivityFailureV1 =
  | RouteConnectivityFailureCompleteUnreachableV1
  | RouteConnectivityFailureCompleteIncompleteV1
  | RouteConnectivityFailureUnavailableUnreachableV1
  | RouteConnectivityFailureUnavailableIncompleteV1;
```

Empty source and no queryable ground are unavailable/unreachable. Node/Edge capacity is
unavailable/incomplete. Endpoint and reachability failures are complete/unreachable. Search and
straight-path capacity are complete/incomplete. Every complete variant binds the Graph Hash, and
the outer Result must carry the identical literal status/Graph status and nested failure Hash.
`minimumRequiredCount` remains truthful when projection stops at
`maximumAllowedCount + 1` or Detour only proves that its buffer is too small; it must not pretend
to know a full provider count. The two common Anchor positions are copied from the admitted Build
Input and quantized to the locked position grid. Every specialized threshold candidate owns one
finite quantized canonical witness point: triangle centroid for slope, portal/boundary midpoint for
step or gap, and the conservative clearance witness for width or overhead. Before destroying the
operation-local proof graph, the published `failurePositionMetersXYZ` is selected from the
lexicographically smallest `proofCandidateId` among the sorted restoring candidates. Validation
copies these positions verbatim and may not query geometry, inspect provider state, or infer a
different location. Its primary `ValidationDiagnosticV2.positionMetersXYZ` is the specialized
failure position for threshold reasons, the reason position for start/destination Surface misses,
and the canonical start Anchor position for generic/capacity reasons that have no unique failure
point; the failure artifact still retains both Anchor positions. Role-specific IDs replace generic
`evidenceEntityIds`. Lists are sorted and
unique. Free-form provider messages and suggested-fix prose are not part of canonical failure
bytes; Validation owns fixed human/Agent remediation text.

Absence of a path alone never guesses slope, step, width, overhead, water, or gap as the unique
cause. Use the generic unreachable reason unless the canonical rejection proof graph establishes
the unique singleton cut above. Invalid receipts, Registry/Profile mismatches, generator failures,
projection invariants, ID collisions, abort, and cleanup failure throw typed infrastructure or
admission errors and produce no gameplay failure artifact.

`canonicalRouteConnectivityFailureV1()` and `hashRouteConnectivityFailureV1()` cover only the
deterministic closed union above.

## Determinism and concurrency

- The same accepted Build Input bytes produce identical Graph, Path, deterministic failure, and
  Hash bytes.
- Abort and infrastructure exceptions are deliberately outside that content-determinism claim.
- Concurrent callers serialize only around the Recast lifecycle; canonical projection/A* own no
  process-global mutable state.
- Canonical IDs never contain provider refs, memory addresses, salts, paths, or provider errors.
- Quantization uses safe integers internally and normalizes negative zero.
- Quantized polygon/portal degeneracy and ID collision fail explicitly; Maps never overwrite.
- All Sets and object maps are emitted in lexicographic canonical-ID order.
- A stale source Hash, stale budget certificate, or internally stale lock Hash fails before the
  provider lifecycle.

## Required RED and adversarial tests

Before implementation, tests must cover:

1. strict success/failure Receipt validation, external canonical hashes, unknown-field rejection,
   exact outer/nested union correlation, standalone canonical validation, contextual Build Input
   validation, and full Graph/Path/Build Input cross-object equality, including exact ordered Edge
   selection;
2. mutable Build Input Receipt, stale source Hash, nested lock change without outer Hash update,
   forged V2 Profile policy copy, empty/bounded budget-evidence mismatch, and shared Receipt
   assertion use with zero provider calls;
3. flat and allowed-slope success using SDK-owned weighted A*;
4. two-route fixture where Detour distance order differs from SDK slope/step cost, plus exact
   canonical-ID tie-break, positive projected Edge cost, and a large-Graph smoke proving path
   selection does not retain one full path array per heap entry;
5. static wall, low Box top, outside-ribbon detour, excessive slope, narrow corridor, low ceiling,
   blocked water, and trench failure;
6. proof that blocker tops have reserved/null area and never become terrain Nodes, including a
   mixed-boundary triangle outside explicit bounds and a sub-voxel-height blocker probe;
7. no-queryable-ground-surface, start/destination surface miss, successful-status zero nearest
   Ref with NaN provider point, and filtered non-terrain endpoint;
8. Node, Edge, search, and straight-path capacity as deterministic `incomplete`; search-budget
   maximum-th success, maximum-th then-empty unreachable, still-open incomplete, and stale-entry
   non-consumption; straight-path exact-fit success through the sentinel, true overflow failure,
   and missing terminal evidence; forged Tile evidence is admission failure, not a second
   Tile-budget result;
9. repeated and mutex-concurrent byte identity;
10. no provider refs/status/errors or Adapter identity in serialized Graph, Path, or failure;
11. operation-local Ref/Array destruction on success, raw nearest throw, nearest failure, raw
    straight-path throw, straight-path failure, projection throw, abort, and cleanup throw;
12. exact one-operation lifecycle ownership with checked raw Query initialization and raw Query
    native allocation, raw Query Embind wrapper, explicit QueryFilter raw object, then retained
    Result destroyed in that order;
13. canonical polygon/Tile/Edge IDs independent of provider Ref/salt/map insertion order; exact
    map byte order; quantized degeneracy and collision rejection; one reviewed R0 Graph Hash
    update for `stepHeightMeters` followed by a no-refreeze gate;
14. detail-mesh maximum slope, cross-Tile `bmin/bmax` portal recovery, differing duplicate-link
    rejection, and portal step evidence distinct from polygon centroid heights;
15. every Node/path point, portal overlap, and full published path segment stays inside shared
    hard-ribbon proof geometry, including a U-shaped shortcut adversary;
16. same-polygon one-Node/zero-Edge success, quantized-equal one-point success, non-equal endpoint
    minimum point count, per-segment distance ceiling, observed segment slope, and safe-integer
    overflow rejection;
17. unchanged legacy provider semantic golden plus new source-area/bounds/identity drift gates.
18. Validation accepts exact V1 and V2 Graph Builder evidence through the version dispatcher;
    passed/failed connectivity evidence rules admit a canonical no-Graph failure without allowing
    passed-with-failure-only; capacity diagnostics preserve `minimumRequiredCount` rather than
    fabricating `actualCount`.
19. source-derived rejection proof fixtures emit each frozen slope/step/width/overhead/gap code
    only for a unique singleton cut; mixed causes, multiple restoring reasons, proof-capacity
    exhaustion, and source/provider inconsistency fall back to generic unreachable, and Validation
    cannot upgrade that generic reason to a specialized code. Every failure binds finite quantized
    start/destination Anchor positions; each specialized reason additionally binds deterministic
    `failurePositionMetersXYZ`, missing/non-finite coordinates fail canonicalization, and Validation
    proves byte-for-byte coordinate projection without inference.

Task 4 remains Graph evidence only. It does not change Babylon Runtime, implement swimming,
support static platforms, add camera/control behavior, or claim the real Character Controller
gate has passed.

## Host design-review record

### Metadata

- Mode: full-dimension protocol Mode A applied to the Task 4 design, with D4/D5 added because the
  design owns Recast WASM resources and deterministic query behavior.
- Baseline: branch `codex/m5-route-r1-heightfield`, source HEAD `2d2480c`.
- Reviewed objects: this design, the source-area ADR, the Route R1 authority spec, the Heightfield
  Build Input design, the implementation plan, frozen Graph V1 code/fixture, provider lifecycle
  ADR/code, Adapter identity, and installed Recast 0.43.1 JavaScript/declarations.
- Evidence level: `static-read`. No Runtime capability claim is made from this design review.
- Commands: `git diff --check` passed; source searches/reads passed. No product test was used as
  design evidence. Task 4 RED and implementation gates remain pending.

### Old-conclusion revalidation and host dispositions

- Confirmed and corrected: the existing R0 fixture uses non-zero `heightDeltaMeters` on a walk
  edge, proving it is signed Node-height delta rather than portal step evidence. Reusing it for
  step cost would silently misclassify slopes. Host review therefore authorizes one final narrow
  unreleased clean break adding `stepHeightMeters`; the unrelated draft root Surface field remains
  rejected.
- Confirmed and corrected: the lifecycle ADR's original semantic prohibition conflicted with the
  required terrain/blocker source classification. A narrowly scoped optional-mode addendum now
  preserves the no-option golden and all ownership conclusions.
- Confirmed and corrected against installed 0.43.1: the high-level generator slope-classifies all
  input triangles, so blocker tops need explicit source areas. The source-area ADR closes that
  mapping and requires a low-Box real-WASM RED/golden.
- Confirmed and corrected against installed 0.43.1: Detour `findPath()` cannot express the frozen
  SDK slope/step cost or canonical tie-break. Bounded SDK A* owns selection; Detour owns only
  endpoint projection and corridor string-pulling.
- Newly confirmed and corrected against installed 0.43.1: high-level Query initialization ignores
  its raw status, the implicit QueryFilter is not released by `query.destroy()`, and high-level
  nearest/straight calls lack total unwind on raw throws. Task 4 now owns checked raw
  initialization, two-stage raw Query release, the explicit Filter raw object, and total-unwind
  raw-call seams without constructing the high-level Query wrapper.
- Newly confirmed and corrected against installed 0.43.1: an outside nearest query can return
  success with zero Ref and NaN point, and exact-fit straight-path output can still report
  `DT_BUFFER_TOO_SMALL`. Ref-first validation plus the private one-slot sentinel make both public
  outcomes stable and truthful.
- Confirmed and corrected: a non-empty build can contain zero queryable terrain polygons; the
  closed unavailable/unreachable contract now represents that state without publishing an invalid
  empty Graph.
- Confirmed and corrected: failure status, Graph availability, and reasons are four structurally
  correlated unions, while standalone canonical validation and Build Input contextual validation
  are separate APIs.
- Newly confirmed and corrected against current Validation V2: an unavailable Graph failure had
  no admissible Evidence kind, V2 Graph Builder evidence was passed through a V1-only resolver,
  and lower-bound capacity evidence would have been mislabeled as `actualCount`. The design now
  adds one canonical failure Evidence kind, version-dispatching identity resolution, and a truthful
  `capacity-exceeded` detail.
- Newly confirmed and corrected: Build Input Receipt admission existed only as duplicated prose;
  one traversal-owned assertion now serves both evaluator and contextual Result validation.
- Confirmed and corrected: the final Graph clean break also canonicalizes map order and deep
  freezes output, while single-Surface enforcement remains contextual rather than corrupting the
  generic Graph contract.
- Confirmed and corrected: cost/angle/meter quantization has role-specific ceiling/floor rules;
  positive-cost A* closes the equal-cost frontier and reconstructs the lexicographically smallest
  shortest Edge sequence through a DAG without per-heap path arrays; exact budget exhaustion and
  same-polygon path metrics are frozen.

### Independent Cursor review and host disposition

- Review ID: `m5-task4-design-2d2480c-r3`.
- Cursor chat ID: `ea2e03ce-1df1-4f47-b2cc-8315a8824166`.
- Model/mode: Cursor Grok 4.6 Extra High, read-only `ask` through the skill helper.
- CLI evidence: exit `0`, one P1 and two P2 findings, verdict `DESIGN NO-GO`.
- Accepted P1: the closed failure union could not satisfy the frozen slope/step/width/overhead/gap
  diagnostic oracle. The host retained the stronger product promise and added the conservative
  source-derived rejection proof graph plus specialized reasons; generic absence-of-path remains
  insufficient for attribution.
- Accepted P2: the lifecycle ADR still described high-level Query ownership. Its frozen table and
  addendum now explicitly own raw Query native/wrapper and Filter releases in the Task 4 order.
- Accepted P2: the lifecycle ADR still froze the old single patch revision and two installed files.
  Its Identity section now matches the source-area ADR's per-patch revisions, sorted three-file
  evidence, declaration-leaf drift gate, and final Adapter version/mapping.
- Host recheck: all three were current-tree contract conflicts, not false positives. The same-chat
  follow-up explicitly confirmed all three are closed and must not be reopened.
- Follow-up CLI evidence: exit `0`, two new P1 findings, verdict remained `DESIGN NO-GO`.
- Accepted follow-up P1: zero-blocker Heightfield input is valid, but the earlier unconditional
  source-area mode would make `terrainVertexCount === mergedVertexCount` violate the frozen strict
  interior boundary. The Adapter now omits the option exactly when blocker triangle count is zero,
  binds that activation predicate into `mapping.2`, and requires the ordinary terrain path to
  reproduce the Task 2 packed golden.
- Accepted follow-up P1: operation-local rejection candidates were destroyed before Validation
  could satisfy the frozen world-coordinate Diagnostic contract. Every failure now binds
  quantized start/destination Anchor positions and the locked Surface identity; each unique
  threshold reason additionally copies a deterministic finite `failurePositionMetersXYZ` before
  proof disposal. Validation only projects these canonical positions and may not infer them.
- Host recheck: both new findings were real main-path/evidence-contract gaps and now have explicit
  RED/identity coverage.
- Final same-chat disposition: CLI exit `0`; both new P1 findings reported `CLOSED`; verdict
  `DESIGN GO`; zero new findings. Cursor and the skill helper changed no files, `git diff --check`
  passed, and no review process remained.
- Baseline evidence after design closure: the focused Traversal/Recast/Validation suite passed
  `9` files / `71` tests; `pnpm typecheck` and `pnpm verify:route-r0-contract` passed. These prove
  the pre-Task-4 contract remains healthy, not that the pending Task 4 implementation exists.

Host and independent design result is `DESIGN GO`, not implementation approval. The first two Cursor
CLI attempts produced no output before their hard timeouts and provide no evidence; the concise
third review and its same-chat follow-up produced the actionable NO-GO findings above. One final
same-chat disposition closed them. All RED/implementation gates and final code review remain
mandatory.

### Dimension coverage

| Dimension | Coverage |
| --- | --- |
| D1 positioning/scope | checked: Heightfield R1 only; no platform, water movement, Runtime, or Browser scope leak |
| D2 Schema/AI-friendly | checked: canonical role IDs, units, refs, closed result/failure unions, no provider handles |
| D3 promise/fact | checked: design-only status and pending gates remain explicit |
| D4 single authority | checked: Build Input/Envelope/Graph/A*/Detour/Runtime ownership boundaries are singular |
| D5 engineering quality | checked: deterministic ordering, safe integer costs, strict admission, total cleanup, direct dependencies |
| D6 evidence/gates | checked: static design evidence is separated from pending real-WASM, contract, and Runtime evidence |
