# Babylon Native Block-whitebox image contract

The Babylon Native Planner PNGs are untrusted, geometry-readable block-whitebox
proposals. They use discrete cubes, neutral clear daytime inspection light, no
textures, no styled materials, and the exact image-only colors below. These
pixels guide Builder; they never create Runtime, Physics, Collider, Support, or
Gameplay truth.

Preserve real three-dimensional volume rather than a camera-facing collage.
Terrain needs footprint and depth; buildings need thickness; raised routes need
support and clearance; stairs visibly rise or fall between their endpoints.
Keep reference-visible direction, ordering, adjacency, containment, separation,
connection, elevation hierarchy, and occlusion.

## Functional block colors

| Meaning | Exact color |
| --- | --- |
| ground-motion support | `#B7E4C7` |
| solid obstacle | `#5F6368` |
| interactive solid | `#00B8A9` |
| interactive trigger | `#B8DE6F` |
| water | `#8ECDF4` |
| traversable cloud support | `#D8D4F2` |
| passable cloud | `#EEF6FF` |
| visual-only mass | `#D6D3D1` |

Use a functional color only when that semantic is actually present. Air is
empty space. Flight, swimming, and water-surface motion do not receive route,
rail, tunnel, or traversable-area overlays. For a ground movement mode, color
real support with `#B7E4C7` or `#D8D4F2`; do not recolor a nearby obstacle as
support merely because the Subject passes it.

`#E15759` and `#E66AA5` remain reserved image-only landmark colors outside the
ordered target assignment. They must not replace a selected target color.

## Ordered complete visual targets

The Scene Brief assigns one to five targets in order:

1. `visual-target-1` -> `#E85D5D`
2. `visual-target-2` -> `#F28E2B`
3. `visual-target-3` -> `#D9A514`
4. `visual-target-4` -> `#4E79A7`
5. `visual-target-5` -> `#9C6ADE`

This table is the Babylon Native profile only. Canonical Source retains its
separate current palette and must never be substituted into a Native image.

In `world-plan.png`, target 1 is one small spawn-position token and every
selected non-subject target appears in its ordered color at its geographic
location. In `entry-whitebox-target.png`, target 1 is the complete controlled
Subject silhouette. A non-subject target uses its ordered color where it is
visible, but ordinary perspective, distance, repetition, partial occlusion, or
being outside the opening frame is valid. Never move, enlarge, duplicate, or
unocclude a non-subject merely to satisfy an entry-image color metric. Its
identity remains required in the Brief, palette, World Plan, and Builder input.

Functional surfaces inside a selected target retain their functional color.
The rest of the complete recognizable target uses its ordered target color.
Repeated targets share one ordered color across their actual instances.

## `world-plan.png`

For lighting-only identity-color drift, follow the Skill's **Native deterministic palette
authoring** step before accepting the PNG. The explicit region must refer to the actual intended
target, not merely any nearby same-hue pixels. The helper never establishes semantic presence;
inspection establishes the selection and the unchanged final checker measures its result.

Generate the World Plan only after accepting and inspecting the exact entry
image. Supply that exact PNG, the uploaded references, and the completed Brief
to the same generation call. Produce one continuous orthographic or near-top-
down discrete-cube map of the complete intended playable footprint. Preserve
the entry slice without mirroring or rearrangement, then add only the Brief's
conservative inferred continuation.

Show stacked block relief, visible top/side faces, and shallow inspection
shadows where needed to retain elevation levels, bridge thickness, stair runs,
cliff rims, valleys, and platforms. Include exactly these information layers:

1. the complete reference-consistent block world;
2. one small red spawn-position token;
3. exact functional colors for semantics actually present;
4. every selected non-subject target in its ordered identity color.

For ground movement, color the whole real collision-free support area instead
of inventing a preferred lane. For a genuinely constrained bridge, stair,
corridor, or trail, show the real continuous support. Remove labels, title,
legend, scale, dimensions, coordinates, grid, camera cone, route nodes, arrows,
callouts, UI, logo, and watermark.

The checker reproduces the historical ordinary-success admission: Block and
non-subject target colors together cover at least 3% of the image; a ground
movement mode has at least one traversable/support-color pixel; and every
selected target color has at least `max(32 pixels, 0.005% of the image)`.

## `entry-whitebox-target.png`

Generate and inspect an exact 16:9 playable third-person rear composition
before generating the World Plan. The complete red controlled Subject faces
straight away from the camera and its red visual-mass center lies on the 50%
width centerline. The environment uses the same discrete cubes and functional
colors as the plan.

The checker reproduces the historical ordinary-success admission: Block and
non-subject target colors together cover at least 2% of the image; a ground
movement mode has support color; target 1 has at least
`max(64 pixels, 0.10% of the image)` in the red Subject mask; Subject horizontal
center error is at most 1.5%; and aspect-ratio error from 16:9 is at most 2%.

Scale, connected-component, exclusive-color, and ambiguity measurements for
non-subject targets are advisory Builder feedback only. They never make Planner
status fail. A distant, small, repeated, partially occluded, or opening-absent
non-subject remains an ordinary success when the hard admission above passes.
