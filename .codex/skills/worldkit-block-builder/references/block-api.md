# Direct Block API

## Module contract

Export `buildBlockWorld()` from a plain ESM `world.mjs`. The Skill runtime
injects the real Three.js namespace and the narrow binding surface before the
module loads:

```ts
const { BoxGeometry, CylinderGeometry, Mesh, Scene, SphereGeometry } = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1,
  bindWorldkitBlockV1,
  bindWorldkitSubjectMeshV1,
  createWorldkitBlockMaterialV1,
  createWorldkitSubjectMaterialV1,
} = globalThis.WorldKitBlock;
```

For every block, directly create and bind one Mesh:

```ts
const mesh = new Mesh(
  new BoxGeometry(1, 1, 1),
  createWorldkitBlockMaterialV1(BLOCK_PRESET_REFS_V1.walkable),
);
mesh.position.set(x, y, z);
bindWorldkitBlockV1(mesh, {
  id: "ground-0001",
  presetRef: BLOCK_PRESET_REFS_V1.walkable,
});
scene.add(mesh);
```

You may reuse each unmodified admitted geometry and each unmodified material.
IDs are stable lowercase strings containing only letters, digits, and hyphens.
The final Scene transform must keep world scale `[1,1,1]` and a Y-only quarter
rotation.

## Metric shape palette

One full block is exactly one meter. These are the only admitted geometries:

| Shape | Exact BoxGeometry | Volume | Use |
| --- | --- | --- | --- |
| full | `new BoxGeometry(1, 1, 1)` | `1m³` | terrain/building mass |
| half | `new BoxGeometry(1, 0.5, 1)` | `0.5m³` | ledges and height transitions |
| quarter | `new BoxGeometry(0.5, 0.5, 1)` | `0.25m³` | beams, rails, narrow structure detail |
| small | `new BoxGeometry(0.5, 0.5, 0.5)` | `0.125m³` | exposed silhouette detail |

An exact quarter-volume cube would have an irrational edge and is not allowed;
the `quarter` shape is the grid-aligned quarter-volume rectangular block. All
faces align to the 0.5-meter micro-grid and centers therefore use 0.25-meter
increments. Examples: a half block sitting on a full block has center Y `0.75`;
a small block occupying `[0,0.5]` on every axis has center `[0.25,0.25,0.25]`.

## Volumetric reconstruction

Use the shape palette to build volume, not a view-dependent facade. Before
placing detail, resolve each major terrain or structure as three coupled views:

- footprint: occupied area, curvature, branching, and adjacency in XZ;
- longitudinal profile: how height changes along the route or dominant axis;
- cross-section: width, side slopes/walls, thickness, support, and clearance.

All three must agree with the uploaded reference, entry target, and top-down
plan. A staircase joins two actual support elevations and contains its visible
major landings; a bridge has deck thickness/support and clearance; a cliff has
mass behind its face; a building has depth behind its facade. Do not paint bands
onto level support to suggest steps, extrude a 2D skyline into a thin wall, or
make every visible layer share one height merely because the opening camera can
hide the error.
Do not obtain these shapes by scaling a full Mesh.

Do not write SDK construction helpers. A local helper that performs exactly the
four operations above for one block is allowed; higher-level semantic helpers
are not part of this contract.

## Agent-drawn Subject shapes

World blocks and Subject shapes are separate bindings. To draw a rigid base or
attachment, use a centered undeformed `BoxGeometry`, `SphereGeometry`, or
equal-radius full `CylinderGeometry`, unit world scale, arbitrary finite
position/rotation, and the dedicated Subject material:

```js
const sword = new Mesh(
  new BoxGeometry(0.18, 0.08, 2.4),
  createWorldkitSubjectMaterialV1(),
);
sword.position.set(0, 0.05, 0);
bindWorldkitSubjectMeshV1(sword, {
  id: "flying-sword",
  semanticTags: ["attachment", "flight", "sword"],
});
scene.add(sword);
```

The binding ID is referenced from `controlledSubject.assembly`. The default
`colliderContribution` is `exclude`, which is correct for a sword, wing, board,
eye, tail, or other attachment. A custom Mesh base must explicitly mark at
least one shape `include`, and that included shape must touch the local support
origin plane so the Host can derive one truthful capsule. These meshes never
become world blocks and never create bones, skinning, morphs, custom shaders,
or independent controllers.

## Immutable presets

| Ref property | Meaning | Fixed color | Collision/support |
| --- | --- | --- | --- |
| `walkable` | ordinary support block | `#B7E4C7` | solid, walkable |
| `walkableIce` | slippery ice support | `#BDEBFF` | solid, walkable, low traction |
| `walkableMud` | sticky mud support | `#9C7653` | solid, walkable, reduced speed |
| `obstacle` | blocking world mass | `#5F6368` | solid, not support |
| `interactiveSolid` | stateful blocking block | `#00B8A9` | solid blocker |
| `interactiveTrigger` | non-blocking interaction volume | `#B8DE6F` | trigger |
| `water` | water volume | `#8ECDF4` | trigger, not support |
| `cloudWalkable` | cloud support | `#D8D4F2` | solid cloud support |
| `cloudPassable` | visible cloud volume | `#EEF6FF` | no collision |
| `visualOnly` | render-only mass | `#D6D3D1` | no collision |
| `landmarkRed` | complete landmark identity | `#E15759` | obstacle physics |
| `landmarkOrange` | complete landmark identity | `#F28E2B` | obstacle physics |
| `landmarkYellow` | complete landmark identity | `#D9A514` | obstacle physics |
| `landmarkBlue` | complete landmark identity | `#4E79A7` | obstacle physics |
| `landmarkPurple` | complete landmark identity | `#9C6ADE` | obstacle physics |
| `landmarkPink` | complete landmark identity | `#E66AA5` | obstacle physics |

Every landmark-colored block requires `visualGroupId`. One group uses one
landmark color, and a reserved landmark color identifies only one group in the
world. Intentionally repeated identical landmarks share the same group.

`walkable`, `walkableIce`, and `walkableMud` are separate visible presets and
use the fixed colors above in Planner images, Three.js authoring, whitebox
Runtime, and review evidence. Select the semantic preset instead of supplying
numeric friction: ice keeps momentum and brakes slowly, while mud limits speed
and stops quickly. All three remain ordinary traversable support for topology
and connectivity checks.

## Planner-image interpretation

`world-plan.png` and `entry-whitebox-target.png` use the exact functional colors
in the table above. Convert each visible semantic cube to its matching preset;
never derive custom material colors from image pixels. Air is empty space and
creates no block.

The Brief's ordered complete targets have one fixed cross-stage mapping:

| Brief target | Planner/capture color | Block preset |
| --- | --- | --- |
| `visual-target-1` | `#E85D5D` | controlled Subject only; no world block |
| `visual-target-2` | `#F28E2B` | `landmarkOrange` |
| `visual-target-3` | `#D9A514` | `landmarkYellow` |
| `visual-target-4` | `#4E79A7` | `landmarkBlue` |
| `visual-target-5` | `#9C6ADE` | `landmarkPurple` |

The remaining red and pink landmark presets stay reserved and are not used for
ordered Planner targets. A functional block inside a complete target keeps its
functional preset and shares the target's `visualGroupId`.

Every non-subject complete target also appears exactly once in the returned
`visualTargetFacings` array:

```js
visualTargetFacings: [{
  visualTargetId: "visual-target-2",
  frontYawQuarterTurnsY: 1,
}],
```

The quarter-turn convention is `0=-Z`, `1=-X`, `2=+Z`, `3=+X`. This declares
the target's semantic front independently of its world placement. The primary
Subject is omitted because `controlledSubject.yawQuarterTurnsY` already owns
its front direction. Missing, duplicate, extra, or primary-Subject rows fail
the Builder self-check.

## Stand positions, smoothing, and connectivity

A support block creates a candidate at its top-center world position.
`spawnStandPositionMetersXYZ`, every required target, and every traversal-band
waypoint use that meter position.
A full block centered at `[x,y,z]` therefore has stand position
`[x,y+0.5,z]`; a half block uses `[x,y+0.25,z]`.

The checker uses meter clearance, footprint radius, maximum step up/down, and
cloud capability. It rejects missing footprint union support, overlapping
micro-cells, and solid blocks inside clearance. Adjacent walkable tops may
differ by at most two meters. A difference of at most one meter is auto-smoothed
and may connect; a larger difference needs intermediate support. Set
`requireSingleReachableComponent` to `true` only when every Brief movement mode
is ground-based. Hybrid/free-space Subjects set it to `false`; disconnected
standable ground remains reported as a metric but is not rejected because
flight/swimming reachability is not represented by the ground graph.

Ground-only worlds also declare semantic navigation evidence:

```js
requiredTargets: [
  {
    id: "garden-middle",
    navigationRole: "middle",
    standPositionMetersXYZ: [24, 1.5, -20],
  },
  {
    id: "palace-remote",
    navigationRole: "remote",
    standPositionMetersXYZ: [70, 4, -62],
  },
],
requiredGroundTraversalBands: [{
  id: "entry-descent-band",
  centerlineStandPositionsMetersXYZ: [
    [0, 6, 32],
    [0, 3.5, 10],
    [24, 1.5, -20],
  ],
  halfWidthMeters: 4,
  isBidirectional: true,
}],
```

The `middle` and `remote` targets prove that named exploration regions are not
discarded during construction. A ground traversal band performs graph search
inside the declared XZ band for every consecutive centerline segment, using the
same standability, clearance, smoothing, and directional step envelope as the
world graph. It catches a broken intended descent even when some much wider
detour keeps the global ground component connected. Bands are internal check
data: they create no Mesh, route overlay, collider, label, or Runtime entity.
For an open scene, describe the real opening movement band without adding path
geometry. Never classify intended walkable blocks as obstacles after a private
reachability pass; repair their heights/supports instead.

The SDK derives invisible ground-only cliff boundaries from exposed walkable
edges after smoothing. Do not author air-wall Meshes or obstacle perimeters.
These Host-owned boundaries are absent from images and capture, are resident
with their physics Chunk, collide with ground motion kernels, and are ignored by
real water/flight kernels.

## Continuous-world boundary

The current hosted Planner/Builder workflow creates one continuous geographic
world. Leave `spaceTransitions` empty. Build physical doors, corridors, bridges,
caves, and openings at their real locations in that same space; do not use
portals or teleports to manufacture map size.

The trusted Host partitions admitted blocks into 32-meter XZ chunks and
deterministically coalesces same-preset, same-visual-group cells into Runtime
cuboids. Runtime batching and collision residency are derived implementation;
they do not change the Agent API. Do not pre-merge, scale, or replace authored
blocks and do not author chunk metadata yourself.

See `examples/block-world/basic-world.mjs` only if a complete code example is
needed. Do not copy its layout or landmark count.
