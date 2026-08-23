# Recast R1 Terrain and Blocker Source-Area ADR

Status: ACCEPTED AND IMPLEMENTED; Task 4 full gates and fresh final review passed

## Context

Route R1 has one queryable Heightfield Traversal Surface plus collision-enabled static blockers.
The canonical Build Input keeps those sources separate, but the upstream
`generateTiledNavMesh()` API accepts one unlabeled position/index stream. Its tile path calls
`markWalkableTriangles()` for every triangle. Upward faces on closed blocker primitives therefore
become walkable spans and may produce Detour polygons.

Relabeling such polygons as the Heightfield would create false Ground Truth. Treating them as a
second Surface would silently implement the static-platform R1b scope. Neither is acceptable.

## Decision

Extend the exact pinned `@recast-navigation/generators@0.43.1` patch with one optional internal
source-area mode. Do not copy or fork the tiled generator into SDK source.

The optional generator field is one closed object, so an invalid half-configured mode is not
representable:

```ts
readonly sourceAreaMode?: Readonly<{
  kind: "terrain-with-static-blockers-r1";
  terrainVertexCount: number;
  blockerAreaId: 1;
}>;
```

Absence preserves the upstream/lifecycle.1 path byte-for-byte. Unknown fields or `kind` values
fail before provider allocation. The R1 Adapter passes `sourceAreaMode` if and only if the
canonical Build Input contains at least one blocker triangle and blocker vertex. A bounded terrain
with `blockingColliders: []` must omit the option entirely; a degenerate terrain-only boundary is
forbidden rather than treated as a second spelling of the no-option path. When the mode is present
in R1 production:

- positions contain retained terrain vertices first;
- `terrainVertexCount` equals the terrain position count divided by three and satisfies
  `0 < terrainVertexCount < mergedVertexCount`;
- every blocker vertex index is greater than or equal to that boundary;
- `blockerAreaId` is exactly `1`;
- `RC_NULL_AREA` remains `0` and `RC_WALKABLE_AREA` remains the provider's locked value `63`.

The patched declaration adds this field to `TiledNavMeshGeneratorConfig` and to the internal
`generateTileNavMeshData()` options that receive it. The top-level generator forwards the same
validated object to every Tile; no Tile may infer its own boundary or area ID. Both
exported entry points validate the closed object before their first owned allocation so direct
provider tests cannot bypass the invariant.

When the option is present, the top-level entry also scans every original triangle before creating
`RecastBuildContext` or another provider-owned object. This global pre-scan is required even when
explicit bounds exclude a triangle: per-ChunkyTriMesh validation alone could otherwise miss an
invalid mixed-source triangle that never overlaps a built Tile. It validates safe index and vertex
counts, `0 < terrainVertexCount < mergedVertexCount`, exact `blockerAreaId: 1`, in-range indices,
and the all-terrain/all-blocker classification for every triple. Direct Tile entry repeats the
relevant closed-option and local triangle checks as defense in depth. When the option is absent,
the patch performs no source-area scan or classification and follows the Task 2 executable path.

For each ChunkyTriMesh triangle:

1. all three indices below the boundary means terrain;
2. all three indices at or above the boundary means blocker;
3. a mixed triangle throws before rasterization because it violates source assembly;
4. terrain retains the result of `markWalkableTriangles()` and therefore still obeys the locked
   slope limit;
5. blocker area is overwritten with reserved area `1`, regardless of face normal;
6. both sources are rasterized in the existing order with the existing climb value.

The reserved non-null blocker area is necessary during the upstream heightfield filters:
`filterLowHangingWalkableObstacles()` only promotes null spans, so it cannot turn a low blocker top
into terrain. After `buildCompactHeightfield()` and before `erodeWalkableArea()`, the patched tile
path iterates exactly `compactHeightfield.spanCount()` entries and changes each compact area `1`
to `RC_NULL_AREA` through `compactHeightfield.raw.set_areas(index, RC_NULL_AREA)`. Thus:

- low and tall blocker tops produce no contour or Detour polygon;
- blocker spans remain obstacles during radius erosion;
- low ceilings still remove terrain spans through the unchanged low-height filter;
- terrain area `63` follows the existing conversion to Detour area `0`, Flag `1`;
- blocker area never reaches Detour output.

The patch must not change triangle order, bounds, Tile order, slope/climb/height/radius mapping,
region/contour/detail settings, NavMesh ownership, query behavior, or cleanup order.

## Bounds

R1 passes the upstream-supported `bounds` option explicitly. X/Z come from the exact retained
terrain bounds certified in `HeightfieldRouteBuildInputReceiptV1`; Y extrema come from the merged
terrain and relevant blocker positions. This uses an existing generator feature and requires no
provider patch, but the derivation entered Adapter `mapping.2` identity. The later Task 4 raw-query
audit retains this decision unchanged inside the combined `mapping.3` identity.

Complete relevant blocker soups remain in the ChunkyTriMesh so expanded Tile borders can
rasterize correct nearby geometry. Their extents do not enlarge the certified XZ Tile grid.

## Ownership and patch structure

pnpm accepts one patch entry per exact package version, so the checked-in generators patch carries
two separately audited scopes:

- `lifecycle.1`: ownership-only corrections already approved by the lifecycle ADR;
- `source-areas.1`: the optional source-label behavior above.

The core patch remains `lifecycle.1`; this decision adds no core semantic change. The generators
patch revision becomes `lifecycle.1+source-areas.1`. Its TypeScript declaration for the same
optional field in both generator config entry points is patched and included in installed-byte
identity evidence. Existing lifecycle
cleanup covers the same arrays and intermediates; the area mode allocates no new WASM owner.

Any error during mixed-source validation or compact-area conversion follows the already-patched
generator unwind. A returned retained result has exactly the same SDK ownership set as before.

## Adapter identity

Before source implementation is accepted:

- bump the Graph Provider Adapter resolved version from
  `0.43.1+lifecycle.1+mapping.1` to
  `0.43.1+lifecycle.1+source-areas.1+mapping.3` (the source-area portion was introduced by
  `mapping.2`; `mapping.3` adds only the reviewed raw-query capacity and unsigned Ref ABI);
- update the generators patch byte hash;
- replace the ambiguous single `lifecyclePatches.revision` manifest field with explicit per-patch
  revisions: Core `lifecycle.1`, Generators `lifecycle.1+source-areas.1`;
- bind installed hashes for Core `dist/index.mjs`, Generators `dist/index.mjs`, and the actually
  changed Generators `dist/generators/generate-tiled-nav-mesh.d.ts` through a sorted
  `installedFiles` list; the umbrella `dist/index.d.ts` is only a re-export and is not falsely
  listed as changed evidence;
- add source merge order, vertex boundary, area IDs, compact conversion point, terrain Flag, the
  exact activation predicate `blocking triangle count > 0`, explicit bounds, and no-option
  compatibility to the manifest;
- retain package versions and lockfile integrities unchanged;
- keep the Adapter identity outside canonical Profile, Envelope, Lock, Graph, and Path bytes.

Changing either area option, the compact conversion point, Flag mapping, or bounds formula must
change Adapter identity and its tests.

## Required evidence

RED tests precede patch changes and prove:

1. an unmodified low Box on a plane currently exposes a queryable top polygon;
2. source-area mode removes every Box polygon while retaining terrain around it;
3. a blocker lower than `maxStepHeightMeters` remains blocked rather than being promoted by the
   low-hanging filter;
4. a high overhead blocker preserves terrain when capsule clearance is sufficient and removes it
   when clearance is insufficient;
5. rotated Box, Cylinder, and Sphere blocker soups emit no queryable blocker polygon;
6. a mixed-boundary triangle fails before rasterization and releases every provider owner,
   including when that triangle lies outside explicit XZ bounds;
7. omitted options reproduce the existing packed NavMesh semantic golden exactly;
8. repeated and mutex-concurrent source-area builds are byte-identical and leak-free;
9. the actual non-null Tile count stays within the Task 3 estimate; `getMaxTiles()` is not used as
   observed evidence;
10. package declaration, patch bytes, installed bytes, manifest, and lockfile drift gates fail on
    any unreviewed change.
11. a bounded terrain with no blocker vertices omits `sourceAreaMode`, reproduces the Task 2 packed
    golden `sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374`,
    and rejects an explicitly supplied boundary equal to the merged vertex count; adding one Box
    activates the mode with a strictly interior boundary.

The low-blocker evidence includes both a `0.2m` Box below the locked `0.3m` climb and a
sub-voxel-height probe below one `voxelCellHeightMeters`. If terrain and blocker spans merge before
the reserved compact area can be removed, implementation must stop and revise this ADR; it may
not claim arbitrary low blockers are excluded by source labels alone or silently impose a minimum
blocker height.

Task 4 Graph tests additionally prove no serialized Node carries a blocker Surface/Entity/
Subshape identity and a low blocker cannot become a route step or platform.

## Rejected alternatives

### Merge unlabeled soups and filter only by Detour Query flags

Rejected. Upstream gives blocker tops the same area/Flag as terrain, so the Query cannot
distinguish them.

### Relabel blocker-top polygons after NavMesh construction

Rejected. R1 has no declared Traversal Surface for those tops, and post-hoc support attribution is
ambiguous near voxel-height boundaries.

### Reverse or remove blocker faces

Rejected. It breaks the authoritative closed Collider geometry and can turn solids into
zero-thickness or missing obstacles.

### Convert blockers to projected AABBs

Rejected. It discards rotated/curved geometry and violates the Collider authority contract.

### Copy the tiled generator into `@whitebox-world/traversal-recast`

Rejected. It duplicates a large provider algorithm and reopens every lifecycle and semantic
ownership issue already repaired in the pinned dependency.

### Treat low blocker tops as valid steps

Rejected for R1. Traversable static platforms and their Surface identities belong to the separate
R1b slice and must be declared explicitly rather than inferred from arbitrary collision objects.
