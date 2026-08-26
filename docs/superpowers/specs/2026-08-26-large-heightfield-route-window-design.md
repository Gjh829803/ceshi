# Large Heightfield and Route Window V1 design

**Status:** Approved implementation scope for `codex/terrain-generation`
**Date:** 2026-08-26
**Authority:** development design for the current Authoring V4 / ExecutionPlan V5 stack

## Outcome

WorldKit V1 will author and preview an approximately `1–2km` outdoor world without changing the
Canonical Authoring schema or pretending that Runtime streaming already exists. The current single
Heightfield remains the geometry authority. A large world uses at most `1024 x 1024` terrain
vertices, normally `1.25–2.5m` between neighboring vertices, an explicitly measured resource
budget, compact metric height samples, and bounded required-route windows.

`maximumTiles: 1024` remains a per-build safety policy. It is not a world-bounds limit and will not
be raised. A constrained route whose whole AABB is too expensive is authored as an ordered chain of
ordinary `connected-by-route` rows. Neighboring rows share the same explicit seam Anchor. Each row
is compiled, built, queried, published, and Runtime-probed by the existing trusted path.

This V1 does not add terrain streaming, multiple Heightfields, LOD, origin rebasing, hierarchical
path finding, or a new public terrain source. Those belong to a later multi-kilometer capability.

## Evidence and corrected diagnosis

The installed `@recast-navigation/generators@0.43.1` implementation iterates the X/Z tile rectangle
derived from the supplied build bounds. WorldKit already clips Heightfield triangles to the exact
hard ribbon, but its budget receipt uses the retained geometry AABB. Consequently:

- a `2km` straight narrow route can remain under `1024` tiles because one AABB axis stays narrow;
- a `2km` diagonal route can estimate roughly `209 x 209` tiles with the current `9.6m` tile span,
  even though the ribbon itself is narrow; and
- raising `maximumTiles` would increase one-shot WASM work and address space without fixing the
  AABB-shape problem.

The official Recast project describes tiled navmeshes as the appropriate basis for larger and more
dynamic environments, and calls out Detour tile streaming for open worlds. Its TileMesh sample also
requires neighboring geometry at tile borders. That supports explicit bounded windows with overlap,
not independent seam-unaware meshes:

- https://github.com/recastnavigation/recastnavigation
- https://github.com/recastnavigation/recastnavigation/blob/main/RecastDemo/Source/Sample_TileMesh.cpp

For the later multi-kilometer phase, Unreal's official World Partition model is a useful ownership
reference: persistent world identity, spatial cells, streaming sources, and independently loadable
navigation chunks. V1 preserves room for that model but does not claim it:

- https://dev.epicgames.com/documentation/unreal-engine/world-partition-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partitioned-navigation-mesh

## Scope and non-goals

### In scope

1. An operational single-Heightfield profile that covers `1–2km` when the chosen resolution keeps
   the cell span near `1.25–2.5m` and stays at or below `1024` vertices per axis.
2. Deterministic `0.1m` quantization for unlocked generated-raster samples above the ordinary-world
   sample threshold. Protected Water, Spawn, Landmark support, and Route samples remain exact.
3. Trusted, provider-neutral route-window estimation using the existing Graph Builder Profile tile
   size and voxel cell size.
4. Builder self-check evidence for terrain scale and every required route window, with fail-closed
   diagnostics before a cloud Builder task can finish.
5. Builder instructions for explicit shared seam Anchors and measured large-world resource budgets.
6. A real `1km` Babylon terrain topology proof and a `2km` contract-level capacity proof.

### Out of scope

- Multiple Terrain nodes or a new tiled-Terrain Canonical union.
- Runtime load/unload, HLOD, world-origin rebasing, or distance-based physics ownership.
- Automatic mutation of an Agent-authored route, Anchor, or connectivity row by the Host.
- Combining separately built Recast navmeshes or inventing cross-navmesh polygon references.
- Increasing the public Authoring JSON admission limit or the Graph Builder `maximumTiles` value.
- Claiming rendering performance from a NullEngine or SwiftShader capture.

## Authority map

| State | Single owner | Consumers |
| --- | --- | --- |
| World and terrain bounds | AuthoringSpec V4 | Layout, Compiler, Runtime, capture |
| Terrain metric height | `heightSamplesMeters` after Host compilation | Babylon mesh, Havok collider, terrain queries, Route source |
| Large-world authoring evidence | Builder self-check report | Builder repair loop, trusted Host replay |
| Route window policy | resolved Graph Builder Profile plus `@whitebox-world/traversal` estimator | Builder self-check and exact Host admission |
| Exact route build bounds | trusted Route Build Input receipt | Recast provider and evidence publication |
| Route segmentation | Builder-authored Routes, Anchors, and connectivity rows | Compiler and trusted per-row validation |
| Ground support | existing Havok/support-query path | movement and Runtime probes |

The scale analyzer and raster image never become second Runtime terrain authorities. The analyzer
reports counts and cell spans; only the existing compiled Heightfield supplies gameplay height.

## Single-Heightfield operational profile

The Authoring V4 schema remains unchanged. V1 uses the following narrower operational profile for
large generated terrain:

- `resolutionCellsXZ` continues its current implementation meaning of vertex counts;
- each axis is at most `1024`, so explicit samples remain within the existing `1,048,576` item cap;
- cell span is `sizeMeters / (resolutionVertices - 1)` and normally stays in `1.25–2.5m`;
- `801 x 801` over `2000m x 2000m` is a valid `2.5m`-cell target with `641,601` terrain vertices
  and `1,280,000` terrain triangles;
- `401 x 401` over `1000m x 1000m` is the corresponding `1km` target; and
- `world.resourceBudget` is chosen from measured terrain, Subject, water, object, and collider use.

The former Builder instruction to keep every world below `120,000` vertices becomes an ordinary
world target, not a universal ceiling. Large-world budgets remain blocking compiler inputs; they are
not silently raised by the Host.

Generated rasters above `120,000` samples carry the constraint solver's protected-sample mask into
serialization. The compiler quantizes only unlocked samples to `0.1m`; protected Water, Spawn,
Landmark support, and Route results remain byte-for-byte values from the solver. This aligns with the
current Graph Builder vertical voxel size and keeps JSON encoding below the existing `8MiB`
admission limit in normal `1–2km` cases. The report records whether quantization ran.

## Route-window contract

`estimateRouteBuildWindowTileCountV1()` is added to `@whitebox-world/traversal`. Its closed input is:

- `pointsMetersXZ`;
- `widthMeters`;
- `terrainCellSizeMetersXZ`;
- `tileSizeCells`;
- `voxelCellSizeMeters`; and
- `maximumTiles`.

The estimator validates all numbers, computes the polyline AABB, and expands each side by half the
route width plus one terrain cell on that axis. It delegates integer-micrometer normalization and tile
counting to the existing `assertTraversalGraphBuildBudgetV1()` authority. It returns the admitted
bounds and exact `tilesX`, `tilesZ`, and `estimatedTiles`; over-budget input throws the existing
structured `TraversalGraphBuildBudgetExceededErrorV1`.

This is a conservative Heightfield-R1 preflight, not a substitute for the exact Build Input receipt.
Static R1B surfaces can enlarge the final geometry bounds, so the trusted Host guard remains final.

## Explicit segmentation rule

The Host does not split a route because doing so would invent public IDs and Anchor semantics. The
Builder repairs an over-budget route by authoring a chain:

```text
start Anchor -- route.001 --> seam Anchor 001
seam Anchor 001 -- route.002 --> seam Anchor 002
seam Anchor 002 -- route.003 --> destination Anchor
```

Each arrow is one Route and one required `connected-by-route` row. The exact same seam Anchor entity
is the destination of the previous row and start of the next row. Segment order and IDs are stable.
Each route retains actual geometry points and does not replace a bend with a straight chord. The
Builder reruns self-check until every window is admitted; the Host then validates every row normally.

Open terrain still uses empty connectivity. Segmentation is only for an explicitly constrained
ground connection; it does not turn the whole open world into a road network.

## Builder self-check evidence

The self-check report advances to `worldkit-builder-self-check-v6` and adds:

- `terrainScaleEvidence`: size, resolution, cell spans, vertex count, triangle count, and operational
  profile classification;
- `routeBuildWindowEvidence`: one stable constraint-ID-ordered row per required connection with
  expanded bounds and tile estimate; and
- `ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED` diagnostics containing constraint ID, route ID, exact estimate,
  maximum, and the shared-seam repair direction.

Evidence is produced from parsed Authoring and the resolved built-in Heightfield R1 Graph Builder
Profile. It does not claim exact R1B geometry admission. The trusted Host replay and final Route
Build Input receipt remain mandatory.

## Failure and determinism rules

- Non-finite points, zero-length routes, non-positive widths, malformed resolution, unsafe integer
  multiplication, and over-budget windows fail with stable codes before provider initialization.
- Route evidence is ordered by `constraintId`, then `routeId`; input array order cannot change bytes.
- Quantization uses integer quantum steps and normalizes negative zero to zero.
- Builder self-check is read-only except for its atomic report output.
- A failed preflight never changes Authoring JSON, creates synthetic Anchors, or changes a Profile.

## Verification layers

- `automated-contract`: estimator adversaries, quantization determinism/size, Builder diagnostics,
  bundle parity, Authoring normalization/compilation, and Babylon topology indices above `65,535`.
- `rendered-visual`: one large-world whitebox capture may demonstrate visible terrain continuity but
  does not establish frame-time or streaming support.
- `manual-interaction`: optional for this V1; absence must be stated.
- `performance`: explicitly unproven until a hardware-backed benchmark exists.

## Future tiled seam

The later multi-kilometer design should introduce a new versioned Terrain Source/Execution contract,
not aliases on V4. It must freeze tile IDs, integer grid coordinates, shared border samples, material
and semantic mask ownership, neighbor availability, physics lifetime, Route/nav chunk identities,
streaming sources, and cross-tile query behavior. V1's `1024`-vertex operational cap and explicit
route seam Anchors are migration boundaries rather than hidden runtime heuristics.
