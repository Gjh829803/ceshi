# Recast 0.43.1 Resource Lifecycle ADR

Status: approved for test-first implementation after focused Cursor design reviews

## Decision context

M5 R1 Heightfield uses `recast-navigation` `0.43.1` and its tiled generator with `keepIntermediates: true`. The SDK retains the returned intermediates long enough to construct and validate a query, then destroys operation-owned WASM resources in reverse order.

The npm registry metadata records source commit `8769e8b9995f127033af9f6e6eeac3fad7d66201`. It is a forensic source-review pointer only: installed package manifests and the lockfile do not carry `gitHead`, so it is not part of executable Adapter identity. Review of the installed JavaScript build and corresponding C++/WebIDL source confirmed that the tiled path does not release every operation-local wrapper:

- successful retained builds skip input-array cleanup;
- top-level `rcConfig`, `RecastCalcGridSizeResult`, and `NavMeshParams` wrappers are never destroyed;
- per-tile cloned configs, the unused triangle-area allocation, chunk IDs, node-triangle view wrappers, and create-parameter wrappers are never destroyed;
- `CreateNavMeshDataResult` and remove-tile result wrappers are discarded;
- successful `addTile(..., DT_TILE_FREE_DATA)` transfers the byte buffer to NavMesh but leaves its `UnsignedCharArray` wrapper alive;
- empty-tile and thrown paths bypass part or all cleanup;
- `RecastBuildContext` discards its separately allocated `RecastBuildContextJsImpl` handle;
- `keepIntermediates: false` drops the chunky-triangle-mesh reference without destroying its raw object.

This is provider implementation ownership, not a canonical traversal-schema concern. Accepting the leak would make repeated builds unsafe in a production long-lived process.

The first independent Cursor review correctly returned NO-GO because the original ADR named only a generator patch, omitted result-holder and build-context ownership, did not freeze release primitives, and could not prove exactly-once cleanup or unchanged provider output. The revised decision below closes those findings before implementation.

## Decision

Carry two exact lifecycle-only pnpm patches for the pinned provider implementation:

- `@recast-navigation/core@0.43.1`: close result-holder and build-context wrapper ownership;
- `@recast-navigation/generators@0.43.1`: close tiled-build temporary ownership and all return/throw paths.

Two narrow patches are required because the build-context implementation handle and raw result holders are hidden by the published core wrapper. Neither patch copies the generator into SDK source. Both remain a line-level delta over the exact upstream implementation.

The core patch may only:

1. read `RecastCalcGridSizeResult`, destroy that result wrapper, and return the same plain width/height values;
2. snapshot `success` and the separately allocated `UnsignedCharArray` pointer from `CreateNavMeshDataResult` before destroying the holder; return a discriminated success result with a data owner only on success and no data owner on failure;
3. retain `RecastBuildContextJsImpl` on `RecastBuildContext` and expose one idempotence-guarded `destroy()` that attempts the context raw object first and the implementation raw object second, continues if either destroy throws, and reports combined errors only after both attempts.

The generator patch may only add ownership state, `destroy`/`free`/`isView` operations, and `try`/`catch`/`finally` cleanup. It must preserve all build calls, order, parameters, loops, returned success/error semantics, and output data.

## Frozen ownership table

| Resource | Allocation point | Owner after an ordinary returned result | Owner when the call throws before returning | Required release primitive |
| --- | --- | --- | --- | --- |
| process-global WASM module | `init()` | process after fulfilled initialization | no Module owner after rejected initialization | never shut down; cache a fulfilled initialization Promise, but clear the same rejected Promise so a later serialized operation may retry |
| raw NavMeshQuery native allocation | SDK after successful checked `rawQuery.init(...)` | SDK | SDK if allocated | `rawQuery.destroy()` before the Embind wrapper, Filter, and NavMesh |
| raw NavMeshQuery Embind wrapper | SDK when `new Raw.Module.NavMeshQuery()` returns | SDK | SDK if allocated | `Raw.destroy(rawQuery)` after the native release attempt and before Filter/NavMesh |
| explicit QueryFilter raw object | SDK when `new QueryFilter()` returns | SDK | SDK if allocated | `Raw.destroy(filter.raw)` after both Query release attempts and before NavMesh |
| NavMesh | tiled generator | SDK on successful return; generator already destroys it on returned top-level failure | generator | `navMesh.destroy()`; never raw-only destroy |
| `RecastBuildContext.raw` + `RecastBuildContextJsImpl` | core wrapper constructor | SDK | generator | idempotence-guarded `buildContext.destroy()` attempts context first and impl second, continues after either error, then throws one/aggregate error |
| input `VerticesArray` / `TrianglesArray` | tiled generator | generator after the complete tile loop; vertices remain live for every tile rasterization and chunky owns only copied triangle/index storage | generator on unwind after tile cleanup | wrapper `.destroy()` exactly once; never destroy immediately after chunky initialization |
| top-level `rcConfig` | generator config builder | generator | generator | `Raw.destroy(rcConfig)` |
| `RecastCalcGridSizeResult` | core `calcGridSize()` | core helper before returning plain values | core helper | `Raw.destroy(result)` after reading width/height |
| `NavMeshParams.raw` | tiled generator | generator immediately after `initTiled()` | generator | `Raw.destroy(navMeshParams.raw)` |
| chunky triangle mesh | tiled generator | SDK when retained; generator when not retained | generator | `Raw.destroy(chunkyTriMesh.raw)` |
| returned tile Heightfield/CompactHeightfield/ContourSet/PolyMesh/PolyMeshDetail | tile generator | SDK when retained; generator when not retained | generator | matching Recast `free*` calls in reverse construction order |
| per-tile cloned `rcConfig` | tile generator | generator | generator | `Raw.destroy(tileConfig)` |
| unused `TriangleAreasArray` and `ChunkIdsArray` | tile generator | generator | generator | wrapper `.destroy()` |
| node-triangle `IntArray` view shell | chunky mesh query | generator; backing data remains owned by chunky mesh | generator | wrapper `.destroy()` only; `isView` prevents freeing backing data; never `_free` |
| per-chunk `TriangleAreasArray` | rasterization loop | generator | generator | wrapper `.destroy()` in `finally` |
| `NavMeshCreateParams.raw` | tile generator | generator | generator | `Raw.destroy(params.raw)` after data creation returns |
| `CreateNavMeshDataResult` holder | core raw builder | core helper after snapshotting `success` and the pointer | core helper | snapshot before destroy, then `Raw.destroy(result)`; its C++ struct has no destructor that deletes `navMeshData` |
| created nav-data `UnsignedCharArray` and bytes before `addTile` | raw builder success only | generator | generator while the local still represents an untransferred owner | add/create failure: `.destroy()` owns/frees bytes; core failure returns no data wrapper because C++ already deleted the attempted array and set the pointer null |
| created nav-data wrapper/bytes after successful `addTile(..., DT_TILE_FREE_DATA)` | transfer in tile loop | bytes: NavMesh; wrapper: generator consumes it immediately | bytes: NavMesh and released only through `navMesh.destroy()`; no wrapper remains for unwind | immediately set `raw.isView = true`, call wrapper `.destroy()` exactly once, and clear/drop the JavaScript reference; no `finally` path may touch it again |
| remove-tile result wrapper | `navMesh.removeTile()` | generator | generator | `Raw.destroy(result.raw)`; the fresh R1 NavMesh has no previous tile/data at that coordinate |

Additional invariants:

- returned JavaScript result containers do not own WASM memory;
- a normal returned retained result transfers only NavMesh, build context, chunky mesh, and tile intermediates to the SDK cleanup function;
- the SDK cleanup function treats each returned `GenerateTiledNavMeshResult` object as one consumable operation receipt. It marks that receipt consumed before the first native release attempt, continues every release in the same pass, aggregates errors afterward, and makes every later cleanup call for the same receipt a no-op. A thrown native release has ambiguous completion state and must never be retried;
- an exception returns no ownership receipt, so the generator must release NavMesh, build context, chunky mesh, every previously retained tile intermediate, current tile temporaries, configs, and inputs before rethrowing;
- nav-data ownership is an explicit per-tile state machine: `uncreated -> generator-owned -> navmesh-owned-and-wrapper-consumed` on successful add, or `uncreated -> generator-owned -> destroyed` on failure; cleanup checks only the still-generator-owned state;
- the core data-result helper reads `success` and the raw pointer before destroying the holder, checks `Raw.isNull`, and never calls `fromRaw(null)`; no code reads the holder after destroy;
- if `addTile` succeeds and any later tile or timer operation throws, unwind destroys NavMesh once and must not revisit already consumed nav-data wrappers;
- `offMeshConnections` are absent from the closed R1 adapter configuration. This ADR does not claim to repair the upstream off-mesh allocation path;
- no code may call `_free`, free an `isView` backing pointer, free successful tile bytes outside NavMesh, or run both generator and SDK cleanup for one returned object.

## Semantic boundary

> Route R1 Task 4 addendum, 2026-08-22: the generator/retained-Result ownership conclusions in this
> ADR remain authoritative, while the Query rows above supersede the original high-level
> `NavMeshQuery/query.destroy()` row. Task 4 never constructs that high-level wrapper; its one
> cleanup receipt owns the raw Query native allocation, raw Query Embind wrapper, and explicit
> Filter separately and attempts all three before retained Result cleanup. The generators patch
> also gains one explicitly reviewed optional semantic scope under
> [`2026-08-22-recast-r1-source-area-adr.md`](2026-08-22-recast-r1-source-area-adr.md). When
> `sourceAreaMode` is absent, every semantic prohibition and the existing packed NavMesh golden
> below remain unchanged. Zero-blocker Heightfield production input must take that absent-option
> path; only a positive blocker triangle count activates the mode. When it is present, only terrain/blocker triangle-area
> classification and the reserved-area-to-null conversion defined by that ADR may differ. Bounds
> are supplied through the upstream option; configuration mapping, Tile order, geometry winding,
> generator ownership transfer, retained Result cleanup, and every other item below remain frozen.
> The Adapter version,
> per-patch revisions, patch bytes, installed JavaScript/declaration bytes, and mapping manifest
> must change atomically before that path is accepted.

Except for the exact optional source-area differences named in the Task 4 addendum, the patches
must not change:

- input geometry, triangle winding, bounds, or tile selection;
- canonical-to-Recast parameter conversion;
- `cs`, `ch`, border, erosion, region, contour, poly-mesh, detail-mesh, area, flag, or tile-add configuration;
- rasterize/build call order or tile loop order;
- generated positions, indices, polygons, areas, flags, or query results;
- any canonical Profile, Envelope, Lock, Graph, CLI, or Browser contract.

`keepIntermediates: true` remains the only production path. The false path is repaired and tested only as an upstream lifecycle contrast; it is not a runtime fallback.

## Identity and drift prevention

`RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1` must include and hash:

- exact versions and lockfile integrity values for `recast-navigation`, `@recast-navigation/core`, `@recast-navigation/generators`, and `@recast-navigation/wasm`;
- the exact two version-qualified root `pnpm-workspace.yaml#patchedDependencies` keys and repository-relative patch paths;
- explicit per-patch revisions: Core `lifecycle.1` and Generators
  `lifecycle.1+source-areas.1`, plus SHA-256 of both checked-in patch files;
- one lexicographically sorted `installedFiles` list binding SHA-256 for Core `dist/index.mjs`,
  Generators `dist/index.mjs`, and the actually changed Generators
  `dist/generators/generate-tiled-nav-mesh.d.ts`; the umbrella `dist/index.d.ts` is only a
  re-export and is not identity evidence;
- existing tiled-generator, rounding, and provider-constant fields plus `mapping.2` source merge
  order, terrain vertex boundary, exact `blocking triangle count > 0` activation predicate,
  reserved/null Area mapping, terrain Flag, explicit bounds,
  endpoint/query Filter, canonical polygon/portal/step/slope/clearance/cost formulas, and
  no-option compatibility.

Every hashed identity value is a portable literal. Absolute paths, `node_modules/.pnpm` layout, `require.resolve()` output, file URLs, registry responses, current working directory, timestamps, and the manifest's own final hash are forbidden from the manifest. The Adapter `resolvedVersion` is exactly `0.43.1+lifecycle.1+source-areas.1+mapping.2`; `RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1` remains outside the manifest and equals `sha256CanonicalJson(manifest)`.

Tests read the root `pnpm-workspace.yaml#patchedDependencies` declarations used by pnpm 10, lockfile package/integrity/patch entries, checked-in patch bytes, installed package versions, and every sorted installed file above. Installation lookup starts from the declared `recast-navigation` entry and uses a chained `createRequire()` so pnpm strict dependency isolation is preserved; only content hashes are compared with the manifest. Editing the declaration leaf alone must fail the drift gate. Removing a patch, failing to apply it, changing a transitive package tarball, or editing installed provider code cannot retain the old Adapter hash. The pnpm-generated lockfile patch hash is asserted present and stable but is not assumed to equal the SDK's SHA-256 of patch bytes.

## Rejected alternatives

### Accept the upstream leak

Rejected. M5 requires repeated and concurrent provider operations in one long-lived process.

### Use `keepIntermediates: false`

Rejected. It still leaks the discarded chunky-triangle-mesh raw object and removes data required for query-before-dispose verification.

### Patch only generators

Rejected after source review. The core wrapper hides `CreateNavMeshDataResult`, `RecastCalcGridSizeResult`, and `RecastBuildContextJsImpl`; a generator-only patch cannot close all ownership without reimplementing core behavior locally.

### Copy or reimplement the generator in SDK source

Rejected. That would create a second algorithm implementation and enlarge the semantic audit surface.
Exact dependency patches remain visibly based on pinned upstream code. Core is ownership-only;
Generators may additionally carry only the optional source-area extension frozen by the Task 4
addendum and source-area ADR.

### Replace Recast or write a custom graph builder

Rejected for this slice. Provider geometry and query acceptance passed; the defect is wrapper ownership.

## Required evidence

Before Task 2 closes:

- before applying either patch, the current unpatched plane fixture's `getNavMeshPositionsAndIndices()` result must be packed deterministically as Float32 positions plus Int32 indices and its SHA-256 committed as the semantic golden;
- the patch hunks plus pinned unpatched package SRI must preserve executable evidence of every upstream leak point; Task 2 does not maintain a second unpatched installation after pnpm applies the patches;
- an instrumented real-WASM test must wrap relevant `Raw.destroy`, NavMesh destroy, patched build-context destroy, and `Raw.Recast.freeHeightfield` / `freeCompactHeightfield` / `freeContourSet` / `freePolyMesh` / `freePolyMeshDetail` operations for one operation at a time; array ownership is observed once at the innermost `Raw.destroy` argument, including its `isView` flag, rather than double-wrapping `BaseArray.destroy`; returned SDK-owned pointers are keyed through `Raw.Module.getPointer` and must never be released twice, while temporary wrapper events use allocation/lifetime-aware counts so a legitimately reused WASM address is not treated as a double-free;
- SDK-owned returned NavMesh/intermediates/build context must receive zero generator-side final destruction and exactly one SDK-side destruction;
- real-WASM fixtures must cover successful walkable tiles, reversed winding, and a deterministic empty tile. The empty fixture uses two `8 x 8` grid islands with 128 triangles each: left bounds `x=0..4m, z=0..4m`, right bounds `x=24..28m, z=0..4m`. With frozen `chunkyTriMeshTrisPerChunk: 128`, the audited ChunkyTriMesh algorithm sorts the 256 triangles along the longest X axis and splits them into two leaf AABBs matching the separated islands. The test must inspect those leaf AABBs and prove `getChunksOverlappingRect()` returns zero for the middle tile's expanded rectangle `x=8.7..20.1m` (`borderSize * cs = 0.9m`), then prove tile `x=1` has only the empty-path heightfield intermediate with no compact/polygon data and no `addTile` call;
- failure/unwind injection must wrap mutable raw/runtime methods rather than ESM bindings: a later `Raw.Recast.createHeightfield` call returns false for tile failure, and `NavMesh.prototype.addTile` throws after one successful ownership transfer for generator unwind;
- repeated and mutex-concurrent operations plus SDK cleanup continuation when one destroy throws must remain covered, but double-destroy pointer Sets are reset per operation because WASM may reuse pointer addresses;
- after applying the patches, the same plane fixture must reproduce the committed packed-output SHA-256 exactly;
- patch identity tests must bind every field in the preceding identity section;
- canonical Profile, Envelope, Lock, Graph, and public-boundary tests must prove no provider field or handle leaks outward;
- `pnpm typecheck`, focused traversal tests, `pnpm verify:route-r0-contract`, full tests, build, and product verification scripts must pass;
- both Codex and Cursor Grok 4.6 Extra High must complete revised design and implementation review with no unresolved P0-P2 finding.

## Upgrade rule

An upgrade of any of the four pinned Recast packages must audit whether upstream now owns these resources correctly. The upgrade either removes the patches with equivalent regression evidence or rebases them deliberately and updates Adapter identity. A patch must never float across provider versions.

## Design review outcome

- Initial full review: NO-GO; incomplete ownership, drift identity, and evidence were revised.
- Ownership review: GO with no remaining P0-P3 after explicit result, tile-byte, input, build-context, returned-failure, and throw ownership were frozen.
- Identity/evidence review: GO after removing non-reproducible metadata and paths, binding portable package/patch/installed-byte evidence, instrumenting all Recast release primitives, and freezing a deterministic ChunkyTriMesh empty-tile fixture.
- At design freeze, implementation remained unapproved until RED evidence, both patches, full verification, self-review, and Cursor code review were complete.

## Initial Cursor review disposition

- P1 incomplete leak list: accepted; result holders, empty/throw paths, and build-context implementation are now explicit.
- P1 missing ownership boundary: accepted; the table freezes owners, transfers, and release primitives.
- P1 insufficient identity: accepted; the manifest/test contract now binds both patches, all package integrities, and installed patched bytes using portable literals only.
- P1 insufficient exactly-once/semantic evidence: accepted; instrumentation and before/after output bytes are required.
- P2 ambiguous release API: accepted; release primitive is frozen per resource type.
- P3 build-context implementation probe: promoted to the core lifecycle patch because exact C++ source proves `RecastBuildContext` stores but does not delete the separately allocated implementation pointer.
- Follow-up P1 core result order/failure null: accepted; the core helper snapshots before holder destroy and returns no data owner on failure.
- Follow-up P1 tile-byte mid-operation transfer: accepted; the state machine consumes and drops the wrapper immediately after successful ownership transfer, and unwind touches only untransferred data.
- Follow-up P2 vertex lifetime: accepted; inputs remain alive through the entire tile loop and are destroyed only after the final rasterization or during ordered unwind.
- Follow-up P2 build-context cleanup continuation: accepted; both raw objects are attempted once and errors are reported only after both attempts.
- Identity-review P1 unavailable `gitHead`: accepted; source commit is forensic metadata only and is removed from executable identity.
- Identity-review P1 machine-path risk: accepted; only repository-relative paths and content hashes enter the manifest, and lookup paths are test-only.
- Identity-review P1 patched-file scope: accepted for the Task 2 lifecycle implementation; the
  Task 4 source-area addendum supersedes that two-file set with the sorted three-file identity set
  in the current Identity section, including the changed declaration leaf.
- Evidence-review P1 unpatched RED/golden ambiguity: accepted; the unpatched packed-output golden is recorded before patch application, while leak-point evidence remains in exact patch hunks over SRI-pinned inputs.
- Evidence-review P1 missing empty/failure/throw fixtures: accepted; separated quads and mutable raw/prototype injection points are now frozen, with per-operation pointer ledgers.
- Identity-review P2 pnpm hash ambiguity: accepted; pnpm's patch hash and SDK patch-byte SHA-256 are separate evidence and are never equated without source proof.
- Evidence re-review P1 retained-intermediate blind spot: accepted; instrumentation now includes all five `Raw.Recast.free*` paths and keys the underlying raw pointer rather than wrapper-call count.
- Evidence re-review P2 empty-tile border expansion: accepted; quads stay beyond the expanded query rectangle and the test proves the gap tile took the no-data path.
- Final evidence-review P2 chunky leaf overlap: accepted; the fixture now exceeds the 128-triangle leaf limit symmetrically, freezes two separated leaf AABBs, directly proves zero chunk overlap, and only then asserts the empty early-return shape.
- Final evidence-review P3 instrumentation traps: accepted; arrays are observed only through the inner `Raw.destroy`, returned-object double-free uses stable pointers, and temporary address reuse is handled as separate lifetimes.

## Implementation disposition

**Accepted for Route R1 Task 2 on 2026-08-22 after final design corrections.** The lifecycle patch is an internal, version-pinned provider repair; it does not change the Canonical Authoring, Lock, Envelope, Graph, CLI, Browser, Babylon, or Havok contracts. The production retained-intermediate path transfers exactly the NavMesh, build context, chunky-triangle mesh, and per-Tile Recast intermediates to the SDK cleanup boundary. Generator-local wrappers, failure-only owners, and transferred Tile-data shells are released by the patched provider according to the ownership table above.

Implementation review closed as follows:

- The first aggregate Codex self-review did not detect that the SDK cleanup receipt remained reusable after release or that a rejected initialization Promise remained cached. Cursor's skill-managed final design review reproduced both as blocking D4 findings. Both were accepted, written as RED regressions, and fixed before Task 2 closure.
- The cleanup boundary now consumes the complete operation receipt before its first release attempt. Real-WASM regressions prove that a second cleanup is a no-op both after ordinary success and after the first cleanup continues through a post-destroy Query error and throws an aggregate. Initialization retains a fulfilled Promise but clears the same rejected Promise so the next serialized operation may retry.
- Cursor Grok 4.6 Extra High also rejected earlier core result cleanup, identity lockfile assertions, and acceptance instrumentation. Those findings were reproduced and fixed. Focused re-reviews returned `DESIGN GO` for the core/generator lifecycle and final receipt/init design, plus `CODE GO` for the core patch, generator patch, patch identity, and provider acceptance suites, with no unresolved P0-P2 at those review points.
- The semantic golden remained `sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374` before and after the lifecycle-only patches.
- `pnpm install --frozen-lockfile` passed, proving the checked-in pnpm 10 patch declarations and lockfile reproduce the installed provider bytes.
- The Task 2 focused suite passed with 10 files and 65 tests. Full `pnpm test` passed with 107 files and 920 tests. `pnpm typecheck`, `pnpm build`, `pnpm verify:route-r0-contract`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, and `pnpm verify:g-bot-subject` all passed.

The existing Vite large-chunk warning is outside this provider lifecycle slice and does not alter its acceptance. Any Recast package upgrade must still follow the upgrade rule above; this disposition does not approve floating either patch to another provider version.
