# Native Block output contract

This reference is an AI-facing authoring guide. The installed package types and the trusted Host checker remain authoritative.

## Inputs and outputs

Treat the frozen Generation Request, Scene Brief, reference inputs, API/Profile context, `native-scene.bootstrap.json`, and Host-owned `subject-visual-review-proxy.json` as immutable. The Host derives the Bootstrap as a read-only Native startup projection: it carries the seed, Gameplay Bootstrap ref, controlled Subject identity, opening-camera numeric values, and Spawn Marker identity. The Host derives the read-only Subject proxy from that controlled Subject's closed Runtime descriptor and Registry-bound visual bounds; Native Source must never duplicate or override it. World bounds remain a separate WorldPackage-owned context input, while Subject and Camera resource closure remain owned by `WorldRuntimeBootstrapV1`.

Reference inputs have stable semantic filenames. Read `world-plan.png` for complete-world orientation, footprint, routes, junctions and hidden continuation. Read `entry-whitebox-target.png` for opening-frame placement, silhouette scale, depth order and occlusion. Read `reference-<index>.*` for the user's visible evidence. A Builder that omits either named planning image has not completed reconstruction preflight.

Write only:

1. `scene.ts`: the Babylon Native Scene Module.
2. `native-block-authoring.json`: entry-module, semantic visual-group declarations, and closed openingCamera numeric intent only.
3. `native-resources.json`: the closed, currently asset-free Native visual resource list.

Those remain the only Native Source files. The task-level files
`attempts/advisory/builder-top-down-comparison.png` and
`attempts/advisory/builder-entry-comparison.png` are deterministic review
projections derived afresh from `scene.ts`; they never enter this output
contract, Native Source identity, Package, Receipt, or Formal Capture. Do not
author a review manifest or a second list of Blocks to feed that renderer.
The top-down PNG is exactly `1544x768`, the entry PNG is exactly `1928x540`, and both encoded files count with the three Native Source files against the Generation Request's `budgets.maximumOutputBytes`.

The current production reconstruction lane has no Native visual asset resolver. Its `resourceRefs` must be exactly `[]`; a syntactically valid asset ref is still unresolved and must fail closed.

## Module boundary

The module must contain exactly two static imports: `@whitebox-world/native-babylon` and `@whitebox-world/native-babylon-block-profile`. Import only `defineBabylonNativeScene` from the first package and only `createBabylonNativeBlockProfileSessionV1` from the second. Do not use direct Babylon subpaths, namespace, dynamic, CommonJS, root Babylon, aliases, or undeclared imports. The intended shape is:

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

    session.createBlockGrid({
      idPrefix: "entry-ground",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "entry-ground-group",
      colliderGroupId: "entry-ground-collider-group",
      minimumCenterMetersXYZ: [-1, -0.5, 0],
      repeatCountXYZ: [3, 1, 1],
    });

    for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
      session.createBlock({
        id: `central-step-${stepIndex}`,
        shape: "step",
        paletteRole: "route",
        visualGroupId: "central-ascent-group",
        centerMetersXYZ: [0, 0.125 + stepIndex * 0.25, -1 - stepIndex],
      });
    }

    session.finalize({
      displayGapMeters: 0.04,
      staticColliders: [{
        id: "entry-ground-collider",
        colliderGeometrySource: {
          kind: "block",
          blockId: "entry-ground-x1-y0-z0",
        },
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "entry-ground-surface",
          logicalSubshapeId: "entry-ground-top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
        exposedEdgePolicy: "protect-ground-subject",
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

### Block placement

`createBlock()` requires `centerMetersXYZ` and accepts an optional `rotationQuarterTurnsY` of exactly `0`, `1`, `2`, or `3`. Placement is declared once, at creation. Never create a Block and then assign `position`, `rotation.y`, or `scaling` for its initial placement: the Session validates the shape-specific lattice, occupancy and budget before allocating a Mesh, and Finalize rejects any later transform as tampering.

`createBlockGrid()` is dense mechanical repetition of one shape and palette role only. It takes `idPrefix`, `minimumCenterMetersXYZ`, and a positive `repeatCountXYZ`, spaces cells by the selected shape's effective rotated size, iterates Y outermost then Z then X, and names children `<idPrefix>-x<i>-y<j>-z<k>` with zero-based unpadded indices. It has no stride, gap, mask, or callback. An optional `colliderGroupId` assigns every generated child to one explicit logical Collider Group; it does not itself register collision. Use the Grid for ground slabs, wall runs, and solid mass; keep stairs, gates, buildings, and any semantic topology as ordinary TypeScript loops over `createBlock()`.

### Source-admission-safe module structure

Module-scope variable declarations permit only primitive literal constants or recursively `Object.freeze`d literal tables. Imports, pure function declarations, type declarations, and the one direct default Module definition remain separate admitted forms. A deterministic expression is not automatically a permitted variable initializer. Property reads, binary expressions, helper calls, aliases, mutable arrays/objects, classes, enums, `let`, and `var` are rejected at module scope. In particular, `Math.PI / 2` must be computed inside `build()` (or replaced with a direct numeric literal); do not retain Babylon handles or Build Context state outside `build()`.

Keep coordinate helpers, computed constants, collider arrays, loops, and all changing values inside `build()`. A top-level string or number literal is allowed, but moving ordinary authoring helpers into `build()` is the least surprising pattern. The trusted Host source-admission checker remains authoritative and runs before bundle/load/replay.

The Host typechecks with strict indexed access. An expression such as `cells[index]` therefore has an `undefined` possibility even when the loop bounds appear correct. Declare fixed-length rows first (`readonly [number, number]`, or `as const` on a literal coordinate table), then prefer `for (const [xMeters, zMeters] of cells)` when every row is consumed. An inferred `number[][]` still leaves each destructured member possibly undefined. When numeric indexing is required, assign the row first and check the indexed value for `undefined` before destructuring it. Do not use an unchecked tuple destructure from `array[index]`, and do not suppress the check with a type assertion merely to pass admission.

`as const` also preserves numeric tuple members as literal unions. When a mutable range loop begins at a destructured literal bound and later compares or increments through values outside that inferred union, widen the loop variable explicitly: `for (let xMeters: number = minimumX; xMeters <= maximumX; xMeters += 1)`. Do not leave it inferred from `minimumX`, because strict Host TypeScript correctly rejects comparisons such as `xMeters === 0` when the inferred union contains only negative literals.

## Fixed Block Profile

Use only shapes `full`, `half`, `quarter`, `small`, and `step`. Their unrotated `[x, y, z]` sizes in meters are:

- `full`: `[1, 1, 1]`
- `half`: `[1, 0.5, 1]`
- `quarter`: `[0.5, 0.5, 1]`
- `small`: `[0.5, 0.5, 0.5]`
- `step`: `[1, 0.25, 1]`

The center lattice is `[0.25, 0.125, 0.25]` meters and the occupancy grid is `[0.5, 0.25, 0.5]` meters. A center must satisfy both the center lattice and the selected shape's bounds on the occupancy grid. Apply these shape-specific center residues before writing coordinates:

- `full` and `half`: X/Z are multiples of `0.5`; Y is a multiple of `0.25`.
- `step`: X/Z are multiples of `0.5`; Y is `0.125 + 0.25 * n`.
- unrotated `quarter`: X is `0.25 + 0.5 * n`, Z is a multiple of `0.5`, and Y is a multiple of `0.25`.
- Y-quarter-turned `quarter`: X is a multiple of `0.5`, Z is `0.25 + 0.5 * n`, and Y is a multiple of `0.25`.
- `small`: X/Z are both `0.25 + 0.5 * n`; Y is a multiple of `0.25`. Therefore a `small` block centered at integer X or integer Z is invalid even though the integer lies on the broad center lattice.

Here `n` is any integer, including negative values. A Y quarter turn swaps the effective X/Z dimensions for `quarter`; it does not change the lattice. Prefer `full`, `half`, and `step` when decorative quarter-cell detail is not required. Do not scale generated meshes, replace their geometry/material, use arbitrary rotation, or assume that one block is 2 meters.

Profile meshes remain direct, unparented members of the Host Candidate Scene. Keep them enabled, visible, non-instanced, non-thin-instanced, and physics-free. Do not attach parents, bake/replace geometry, or create an alternate visual/collider mesh for a Block.

Use only palette roles `ground`, `route`, `structure`, `hazard`, `water-like-visual`, and `background-mass`. Stable lowercase IDs are mandatory. Blocks may touch at faces but their occupied volumes must never overlap. Never place a support block through the occupied volume of the block it supports.

For this production reconstruction Case, every non-root structural or playable block needs a face-contact support chain to the lowest occupied stratum. The root stratum is global: if one decorative cliff block extends below the rest of the world, every raised surface must still have continuous visible support down to that same lowest stratum. Prefer one shared root bottom and build upward. The Host Profile reports unsupported blocks as warnings because other Native worlds may intentionally contain explicit floating visual mass, but this Case must not use that advisory allowance to fake cliffs, route support, gate mass, or platforms.

The Profile deterministically reports the number of edge-adjacent `route`-palette components. More than one component is an advisory warning, not Native Check rejection: ordinary `ground` may connect route-colored segments, and one world may contain multiple independent routes. Never add hidden geometry or relabel honest Blocks merely to erase that warning. Case-declared Ground Analysis and traversal evidence exclusively decide whether required waypoints and courses are connected and passable. Within one continuous route-only staircase, neighboring route tops may differ by at most `0.25` meters. A safe quarter-meter stair column starts with a `full` ground block centered at `y=-0.5`; for a tread top at `0.25 * n`, stack `n` `step` blocks at the same XZ center with Y centers `0.125 + 0.25 * j` for `j=0..n-1`, and expose/collide only the top tread as appropriate. Put successive tread columns exactly one meter apart along X or Z so their route blocks touch at an edge without overlap. Never fill through a `step` using a `full` block whose volume reaches into the tread.

When two intended walkable levels differ by at most one meter, preserve the old block-world user-visible continuity by expressing that rise with the current Profile: use four or fewer face-connected, visibly supported `0.25m` tread transitions and flat endpoint landings. Do not restore or assume a fixed one-meter auto-smoothing threshold. The current topology may smooth each quarter-meter join, and Ground Analysis must still accept the final surface under the Subject-owned `0.3m` step and `42°` slope limits. A direct `0.5m`–`1m` high/low join is a discontinuity, not a shortcut.

`context/case.json.expected.groundConnectivity` is the source-neutral, frozen Host constraint for ground admission. It is not a field in either Native output. For every declared `requiredTraversalBand`, build actual contributed support beneath each `centerlineStandPositionsXYZMeters` waypoint and a connected course between consecutive waypoints inside the declared `halfWidthMeters`. Current ground surfaces and the checked graph are bidirectional by construction; `isBidirectional` and one-way fields are invalid, and directed transitions remain owned by `WRC-EVT-1`. At least one ground band begins at the exact registered Spawn support position, and bands form a one-to-one binding with ground pass targets by `acceptanceTargetRef`. The analyzer evaluates that exact Spawn and each band endpoint; it never snaps either to a nearby Block or visual-group center. When `requireSingleReachableComponent` is `true`, all explicitly contributed standable support belongs to one Spawn-reachable component. Never move, widen, delete, replace, duplicate, or invent a band, and never relabel unreachable intended ground as visual-only or blocker to evade the check.

Ground Analysis samples the final smoothed collision triangles at the exact Spawn, pass targets, and every band waypoint. Give each frozen point a flat landing with full Capsule-footprint support plus at least one surrounding `0.5m` Profile microcell at the same top height, and place stairs/slopes outside that landing. A raw Block top is insufficient when neighboring-height smoothing changes the triangle height at the exact point. Repair the local explicit surface Blocks; never move the frozen point or relax the trusted tolerance.

Treat `budgets.maximumStaticColliderCount` as a hard ceiling shared by generation, Native admission, and Package closure. Every `case.json.expected.colliders[].colliderId` and `contributionId` is unique, every traversal checkpoint ID is globally unique, and every required `colliderId` must appear exactly once in the final `staticColliders` array. The Spawn support Collider is `ground` or `step` and binds the same `acceptanceTargetRef` as `expected.spawnSupport`. A pass check's `acceptanceTargetRef` binds at least one required `ground` or `step` Collider; a block check's ref binds at least one required `blocker` Collider. Use `colliderGeometrySource: { kind: "block-group", colliderGroupId }` for a complete explicitly labelled floor or structural mass, and put that exact `colliderGroupId` on every member Block. The trusted Host derives one continuous walkable surface or exact solid union from the complete Group. Use `{ kind: "block", blockId }` only for a genuine singleton blocker or tread. Never infer group membership from palette, visual group, ID prefix, Mesh metadata, or a Scene scan.

The report-only baseline Case preserves the validated block-world convention by declaring one required `role: "blocker"` Collider for every non-Subject semantic landmark. Implement each such landmark's solid `structure` Blocks as one complete explicit Collider Group and select that group once with `{ kind: "not-traversable" }`. Empty doorways and passages are authored as empty space inside the solid union. Use `background-mass`, not `structure`, for intentionally non-colliding distant scenery. Palette remains visual evidence only: the Builder writes the explicit group and selection, and the Host freezes that contribution without inferring physics from color.

Each `staticColliders` row uses the exact required fields `id`, `colliderGeometrySource`, `traversalBinding`, and `exposedEdgePolicy`; only `frictionRatio` and `restitutionRatio` are optional. The retired top-level `blockId` shape is invalid. Do not add a `role` field. The trusted evaluator derives `blocker` from a `not-traversable` binding, derives `step` from a singleton selected Block whose checked shape is `step`, and otherwise derives `ground` from the admitted static-surface binding. A blocker must use `exposedEdgePolicy: "none"`. Every ordinary playable `static-surface` selection must explicitly use `protect-ground-subject`; this is the Builder default, while the required contract field and authored Host truth remain unchanged. Use `none` on a walkable selection only when the Scene Brief or visible reference explicitly calls for an intentional fall from every exposed edge of that selection; split mixed-policy floors into honest Collider Groups. For an intended exposed edge of checked static ground where falling would violate the Case, use `protect-ground-subject`; the Host derives and freezes the ground-only boundary. Never use it on blockers or visual-only mass, and never add a hidden foundation.

`traversalBinding` is one exact discriminated union. A blocker is exactly `{ kind: "not-traversable" }` and has no `surfaceEntityId`, `logicalSubshapeId`, or `traversalSurfaceProfileRef`. A walkable selection is exactly `{ kind: "static-surface", surfaceEntityId, logicalSubshapeId, traversalSurfaceProfileRef }`. Never mix fields from the two branches.

Scripted traversal is a metric authoring constraint, not a promise that the Host will adapt the test to the generated layout. Read every check's exact fixed-input segments from `context/case.json` and the controlled Subject descriptor selected by `initialControlledEntityId` from `inputs/world-runtime-bootstrap.json`. The formal Runtime uses 60 fixed Ticks per second. For each segment, its declared action set selects walk or run speed; missing turn, lateral, jump, or run actions cannot be invented. Compute the flat-ground travel ceiling from the declared Tick count and selected speed, then shorten the authored route enough to absorb acceleration, elevation, contact, and Capsule-entry costs. A pass target's Host-resolved bounds must begin inside that conservative envelope along the declared movement axis. Keep the complete approach continuously supported by explicit Collider rows. For a blocker check, place the Collider face beyond the Spawn but inside the input envelope so the Capsule can actually reach and stop at it.

The Case-bound Formal Capture Intent is Capture-only Host input, not generation context and not a Builder output. Do not predict or write `sourceBoundsMeters` or `planeMeters`. The trusted Host resolves reach/pass criteria from verified visual-group bounds and resolves block planes from exact frozen Collider geometry after the collider-to-Block-to-visual-group join closes.

Use deterministic seeded construction. Iterate arrays in explicit stable order, sort semantic inventories before emission, and use `context.random` for any allowed variation. Do not call `Math.random`, `Date.now`, timers, locale-sensitive sort, or remote services.

## Volumetric reconstruction

Resolve each major form in three coupled views:

- footprint: occupied XZ area, adjacency, branches, openings;
- longitudinal profile: elevation change along ascent or dominant axis;
- cross-section: width, thickness, support, containment, and clearance.

Construct only the forms declared by the current Case's reference, Scene Brief, planning views, semantic targets, and checks. Do not carry a mountain, forest, T-shaped platform, gate, building, or any other sample-scene composition into an unrelated Case. Preserve every visually important route's endpoints, ordered bends, junctions, switchbacks, width changes, elevation changes, and relationship to nearby landmarks. Approximate curves on the Block lattice without replacing them with convenient straight or axis-aligned shortcuts. When present, a staircase joins actual lower and upper support levels and preserves its total rise, tread rhythm, width, course, major landings, side containment or intentional drop, and visible supporting mass; flat support with colored cross-bands is not a staircase. A declared cliff has a rim, face, base, and mass behind the face. A declared building has depth behind its facade and a doorway that remains a real opening.

Before detailing a non-Subject semantic visual group, lock its footprint center, long axis, semantic front, and relationship to nearby routes and structures from the uploaded reference and frozen planning views. The opening Camera does not define the object's front. Do not mirror, quarter-turn, front/back reverse, or relocate a target merely because it remains recognizable from one view.

Formal opening depth order is measured from the center of each declared visual group's complete checked bounds, not from its nearest visible face. Extending a midground ridge, cliff, landmark, structure, or background group toward Spawn shifts that measurement and may turn the group into foreground evidence. Ground or traversal repair must use the correct existing ground/route group and preserve every frozen opening region, anchor, and ordered target in `context/case.json.expected.openingComposition`, even when Ground Analysis produced no prior Capture.

For an Opening repair, treat the target's four projected region edges, projected anchor and depth order as one coupled constraint envelope. Group all diagnostics for the same `targetId`, compare the complete frozen expectation with the complete prior `opening-observation.json`, and preserve axes already within tolerance. Values clipped at `0` or `10000` identify geometry extending beyond the frame rather than a harmless exact edge. Correct vertical clipping with a coordinated near-camera footprint/depth and height change; do not merely move the crown and trade the opposite edge or anchor into failure. Widening at a substantially nearer depth can also move the vertical projection and anchor, so add mass at comparable depth and height unless the frozen target requires a depth change.

## Semantic JSON

`openingCamera` uses the same exact third-person numeric shape as the frozen
Bootstrap's `initialCamera`: `{ "mode": "third-person", "distanceMeters": 5,
"targetHeightMeters": 1.2, "pitchRadians": 0.18, "fovDegrees": 56 }` is a shape
example, not a fixed composition preset. Always write the field explicitly;
missing intent has no legacy/default fallback. Tune it in the existing Builder
visual feedback loop without editing any frozen input. The Host accepts only
values inside the current selectable third-person Profile ranges, then binds
the intent in the existing materializer metadata and Package identity. No
resource refs, target IDs, extra axes, Subject resizing or executable Camera
authority are permitted. Runtime target sockets and Context Modifiers continue
to apply; the software comparison is advisory, not an exact socket/collision
simulation or an additional similarity gate.

Functional palette roles do not create semantic identity. Ordinary non-target `structure`, `hazard`,
`water-like-visual` and `background-mass` Blocks may omit `visualGroupId`, just like ordinary ground
and route Blocks. Their default Profile colors remain unchanged. Every actual identity target must
still have member Blocks in its declared group; unused/undeclared groups fail the existing binding.
Do not bind unrelated background/support to a target to satisfy grouping. Explicit Collider Groups
are separate and never inferred from visual membership. This reproduces the old distinction between
ordinary functional presets and landmark identity colors without restoring the old Compiler.

`native-block-authoring.json` is plain JSON data. Its exact top-level fields are `kind`, `schemaVersion`, `entryModulePath`, `blockProfileRef`, `visualGroups`, and required `openingCamera`. `visualGroups` must be an exact bijection with `context/case.json.expected.semanticSilhouetteTargets`: copy every row's declared `acceptanceTargetRef` and `visualGroupId` exactly once, and do not omit, invent, merge, split, or rename a target/group. When a Case `acceptanceTargetRef` identifies `visual-target-N`, its row must also copy that target's exact `semanticClassId` and Native fixed `identityColor` from `inputs/visual-identity-palette.json`; the Native sequence is `#E85D5D`, `#F28E2B`, `#D9A514`, `#4E79A7`, `#9C6ADE`. A palette target that has no Case semantic silhouette row remains available to the Scene Brief, World Plan, and Builder reasoning, but is not authorization to add a visual group or invent opening bounds. The controlled Subject is never one of these groups: do not reproduce a rider, mount, avatar, character, or body part from the Scene Brief or planning image, and never use a `subject` semantic class. RuntimeHost creates the SDK Subject and Capture observes it separately. Do not create a visual group for an acceptance target that appears only in Spawn support, Collider, traversal, topology, or deterministic evidence; bind that evidence to a Block in the appropriate existing semantic visual group instead. Every `visualGroups` row has exactly `visualGroupId`, `acceptanceTargetRef`, `semanticClassId`, and `identityColorHex`; rows are sorted by stable unique `visualGroupId`. Every `identityColorHex` must also be unique. It names `scene.ts`, the exact Block Profile ref, and the complete semantic visual groups expected by the Case. Apart from the closed openingCamera numeric intent, it contains no Subject, Spawn, Camera, Physics, Runtime, Input, Action, Gameplay, Package, Receipt, or admission state.

`native-resources.json` is plain JSON data with exactly `kind`, `schemaVersion`, and `resourceRefs: []`. Non-empty visual refs remain outside the current production reconstruction lane until the Host implements and freezes their Package resource closure. The model cannot mint locks, publication receipts, admission evidence, or future support by writing a well-formed ref.

## Evidence boundary

The Skill self-check is a preflight check, not trusted evidence. The task preflight uses the Host compiler policy and an automatically frozen installed type graph for advisory source checking; it neither executes the SDK nor grants admission. Only the Host may admit and bundle the module, audit Babylon permissions, allocate isolated replay Candidates, compare deterministic contributions, resolve resources, create WorldPackage/Receipt identity, run SDK-owned Havok and Character control, capture views, or evaluate reconstruction dimensions.
