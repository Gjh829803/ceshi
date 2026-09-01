# Native Block output contract

This reference is an AI-facing authoring guide. The installed package types and the trusted Host checker remain authoritative.

## Inputs and outputs

Treat the frozen Generation Request, Scene Brief, reference inputs, API/Profile context, and `native-scene.bootstrap.json` as immutable. The Host derives the Bootstrap as a read-only Native startup projection: it carries the seed, Gameplay Bootstrap ref, controlled Subject identity, opening-camera numeric values, and Spawn Marker identity. World bounds remain a separate WorldPackage-owned context input, while Subject and Camera resource closure remain owned by `WorldRuntimeBootstrapV1`. Do not duplicate or override those fields in generated JSON.

Write only:

1. `scene.ts`: the Babylon Native Scene Module.
2. `native-block-authoring.json`: entry-module and semantic visual-group declarations only.
3. `native-resources.json`: the closed, currently asset-free Native visual resource list.

The current production reconstruction lane has no Native visual asset resolver. Its `resourceRefs` must be exactly `[]`; a syntactically valid asset ref is still unresolved and must fail closed.

## Module boundary

Import only `@whitebox-world/native-babylon` and `@whitebox-world/native-babylon-block-profile`; this Block Profile does not need direct Babylon imports. Import the closed module definition from the first package and create the Block session with the second. Do not use namespace, dynamic, CommonJS, root Babylon, or undeclared imports. The intended shape is:

```ts
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import {
  createBabylonNativeBlockProfileSessionV1,
} from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "reference-block-world",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 512,
    });

    const ground = session.createBlock({
      id: "entry-ground",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "entry-ground-group",
    });
    ground.position.set(0, -0.5, 0);

    session.finalize({
      displayGapMeters: 0.04,
      staticColliders: [{
        id: "entry-ground-collider",
        blockId: "entry-ground",
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "entry-ground-surface",
          logicalSubshapeId: "entry-ground-top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }],
    });

    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 0],
      facingRadians: 0,
    });
  },
});
```

This is explicit visual construction with explicit visual groups, explicit Spawn registration, and explicit collider contribution. `session.finalize()` registers selected collider candidates through the Host-provided boundary; generated code never creates Havok objects.

### Source-admission-safe module structure

Module-scope variable declarations permit only primitive literal constants or recursively `Object.freeze`d literal tables. Imports, pure function declarations, type declarations, and the one direct default Module definition remain separate admitted forms. A deterministic expression is not automatically a permitted variable initializer. Property reads, binary expressions, helper calls, aliases, mutable arrays/objects, classes, enums, `let`, and `var` are rejected at module scope. In particular, `Math.PI / 2` must be computed inside `build()` (or replaced with a direct numeric literal); do not retain Babylon handles or Build Context state outside `build()`.

Keep coordinate helpers, computed constants, collider arrays, loops, and all changing values inside `build()`. A top-level string or number literal is allowed, but moving ordinary authoring helpers into `build()` is the least surprising pattern. The trusted Host source-admission checker remains authoritative and runs before bundle/load/replay.

The Host typechecks with strict indexed access. An expression such as `cells[index]` therefore has an `undefined` possibility even when the loop bounds appear correct. Prefer `for (const [xMeters, zMeters] of cells)` when every row is consumed. When numeric indexing is required, assign the row first and check the indexed value for `undefined` before destructuring it. Do not use an unchecked tuple destructure from `array[index]`, and do not suppress the check with a type assertion merely to pass admission.

## Fixed Block Profile

Use only shapes `full`, `half`, `quarter`, `small`, and `step`. Their unrotated `[x, y, z]` sizes in meters are:

- `full`: `[1, 1, 1]`
- `half`: `[1, 0.5, 1]`
- `quarter`: `[0.5, 0.5, 1]`
- `small`: `[0.5, 0.5, 0.5]`
- `step`: `[1, 0.25, 1]`

The center lattice is `[0.25, 0.125, 0.25]` meters and the occupancy grid is `[0.5, 0.25, 0.5]` meters. A center must satisfy both the center lattice and the selected shape's bounds on the occupancy grid. A Y quarter turn swaps the effective X/Z dimensions for `quarter`; it does not change the lattice. Do not scale generated meshes, replace their geometry/material, use arbitrary rotation, or assume that one block is 2 meters.

Profile meshes remain direct, unparented members of the Host Candidate Scene. Keep them enabled, visible, non-instanced, non-thin-instanced, and physics-free. Do not attach parents, bake/replace geometry, or create an alternate visual/collider mesh for a Block.

Use only palette roles `ground`, `route`, `structure`, `hazard`, `water-like-visual`, and `background-mass`. Stable lowercase IDs are mandatory. Blocks may touch at faces but their occupied volumes must never overlap. Never place a support block through the occupied volume of the block it supports.

For this production reconstruction Case, every non-root structural or playable block needs a face-contact support chain to the lowest occupied stratum. The root stratum is global: if one decorative cliff block extends below the rest of the world, every raised surface must still have continuous visible support down to that same lowest stratum. Prefer one shared root bottom and build upward. The Host Profile reports unsupported blocks as warnings because other Native worlds may intentionally contain explicit floating visual mass, but this Case must not use that advisory allowance to fake cliffs, route support, gate mass, or platforms.

All `route` blocks must form one edge-adjacent component. Neighboring route tops may differ by at most `0.25` meters. A safe quarter-meter stair column starts with a `full` ground block centered at `y=-0.5`; for a tread top at `0.25 * n`, stack `n` `step` blocks at the same XZ center with Y centers `0.125 + 0.25 * j` for `j=0..n-1`, and expose/collide only the top tread as appropriate. Put successive tread columns exactly one meter apart along X or Z so their route blocks touch at an edge without overlap. Never fill through a `step` using a `full` block whose volume reaches into the tread.

Treat `budgets.maximumStaticColliderCount` as a hard ceiling shared by generation, Native admission, and Package closure. In the Block Profile, one `staticColliders` row selects one Block and consumes one Collider. Do not register every visible or supporting Block. Every `case.json.expected.colliders[].colliderId` must appear exactly once in the final `staticColliders` array and bind to one explicit Block in the corresponding acceptance visual group. Spawn/support, step, and blocker required IDs cannot be replaced by a large automatically generated Collider set. Register the exact Case-required Collider IDs, the Spawn support, the continuous playable corridor, and only the blocker faces needed to prevent traversal; keep background mass and non-playable support visual-only. Count the final array before returning and leave margin below the frozen ceiling. Never assume that many visual Blocks will be coalesced into one proxy.

The Case-bound Formal Capture Intent is Capture-only Host input, not generation context and not a Builder output. Do not predict or write `sourceBoundsMeters` or `planeMeters`. The trusted Host resolves reach/pass criteria from verified visual-group bounds and resolves block planes from exact frozen Collider geometry after the collider-to-Block-to-visual-group join closes.

Use deterministic seeded construction. Iterate arrays in explicit stable order, sort semantic inventories before emission, and use `context.random` for any allowed variation. Do not call `Math.random`, `Date.now`, timers, locale-sensitive sort, or remote services.

## Volumetric reconstruction

Resolve each major form in three coupled views:

- footprint: occupied XZ area, adjacency, branches, openings;
- longitudinal profile: elevation change along ascent or dominant axis;
- cross-section: width, thickness, support, containment, and clearance.

The representative Case needs a readable central ascent, T-shaped upper platform, gate/building silhouette, blocking side walls, real ground support, and a coherent off-camera continuation. A staircase joins actual lower and upper support levels. A cliff has a rim, face, base, and mass behind the face. A building has depth behind its facade and a doorway that remains a real opening.

## Semantic JSON

`native-block-authoring.json` is plain JSON data. Its exact top-level fields are `kind`, `schemaVersion`, `entryModulePath`, `blockProfileRef`, and `visualGroups`. Copy the Case's acceptance-target-to-visual-group mapping exactly: do not omit, invent, merge, or rename a target/group. Every `visualGroups` row has exactly `visualGroupId`, `acceptanceTargetRef`, `semanticClassId`, and `identityColorHex`; rows are sorted by stable unique `visualGroupId`. Every `identityColorHex` must also be unique. It names `scene.ts`, the exact Block Profile ref, and the complete semantic visual groups expected by the Case. It contains no Subject, Spawn, Camera, Physics, Runtime, Input, Action, Gameplay, Package, Receipt, or admission state.

`native-resources.json` is plain JSON data with exactly `kind`, `schemaVersion`, and `resourceRefs: []`. Non-empty visual refs remain outside the current production reconstruction lane until the Host implements and freezes their Package resource closure. The model cannot mint locks, publication receipts, admission evidence, or future support by writing a well-formed ref.

## Evidence boundary

The Skill self-check is a preflight check, not trusted evidence. Only the Host may typecheck and bundle the module, audit Babylon permissions, allocate isolated replay Candidates, compare deterministic contributions, resolve resources, create WorldPackage/Receipt identity, run SDK-owned Havok and Character control, capture views, or evaluate reconstruction dimensions.
