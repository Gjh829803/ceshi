# Block-whitebox image contract

Both Planner PNGs are flat, geometry-readable block-whitebox renders. They use
metric voxel geometry, neutral clear daytime inspection light, no
textures, no styled materials, and no photoreal detail. The colors below are
semantic data and must stay stable across the two images and the Builder.

One full block represents one meter and a normal adult person is approximately
two full blocks tall. Use full blocks for major mass, half-height blocks for
terrain transitions, and visibly smaller grid-aligned blocks for exposed contour
detail. Do not make the Subject giant merely to dominate the frame.

The images describe buildable three-dimensional volumes, not 2D collages.
Preserve footprint, height levels, longitudinal rise/fall, cross-section,
thickness, over/under relationships, and occlusion. Do not use camera-facing
slabs for mountains or buildings, paint step bands onto a flat route, or match a
reference silhouette with geometry that would immediately fail from the side.
Visible stairs use stacked traversable blocks that connect their actual lower
and upper levels; visible valleys, cliffs, bridges, and platforms retain their
depth and vertical separation.

## Functional block colors

| Meaning | Exact color | Use in the images |
| --- | --- | --- |
| ground-motion support | `#B7E4C7` | every ground, platform, road, bridge, stair, or land block used by a declared ground movement mode |
| solid obstacle | `#5F6368` | buildings, rocks, trees, walls, terrain masses, and other collision blockers that are not selected visual targets |
| interactive solid | `#00B8A9` | a stateful solid object that can be operated or moved |
| interactive trigger | `#B8DE6F` | a non-blocking trigger/interaction volume |
| water | `#8ECDF4` | water-volume blocks |
| traversable cloud support | `#D8D4F2` | cloud blocks on which the selected Subject can stand |
| passable cloud | `#EEF6FF` | visible cloud-volume blocks with no collision |
| visual-only | `#D6D3D1` | visible non-collision mass |

Air is empty space, not a block. Do not invent an air-path color, waypoint rail,
flight tunnel, swimming region overlay, or water-surface route. Flight and
swimming reachability are understood from collision-free volume/medium, not a
colored navigable area. Water remains blue as environmental medium. If no ground
movement is declared, the image does not need a pale-green connected region.

Do not add an interaction color when the request/reference has no meaningful
interactive object. Do not recolor an obstacle as traversable merely because a
route passes beside it. A structure with a usable floor uses traversable blocks
for the floor and obstacle blocks for its walls.

## Ordered complete visual targets

The first target is the controlled Subject and uses the fixed non-block Subject
silhouette color. Remaining complete targets use landmark block colors in Brief
order even when the target is an important non-controlled person, animal,
creature, vehicle, machine, sculpture, or distinctive prop rather than a
building:

1. `visual-target-1` → `#E85D5D`; a small spawn-position token in `world-plan.png`, and the complete Subject silhouette only in `entry-whitebox-target.png`
2. `visual-target-2` complete non-subject target/repeated set → `#F28E2B`
3. `visual-target-3` complete non-subject target/repeated set → `#D9A514`
4. `visual-target-4` complete non-subject target/repeated set → `#4E79A7`
5. `visual-target-5` complete non-subject target/repeated set → `#9C6ADE`

Use one target color across the whole recognizable target, except any
traversable surface or interactive block inside it keeps its functional color.
Repeated identical landmarks use the same target color. Never assign colors to
roofs, columns, supports, decoration, or other parts as separate targets.
Important people, animals, vehicles, and objects use one compact complete proxy
at truthful scale and location; do not split heads, limbs, riders, cargo, or
equipment into target parts.

`#E15759` and `#E66AA5` remain reserved Block World landmark colors but are not
used by Planner target ordering. This prevents another red block from corrupting
the centered Subject silhouette and keeps Planner, Builder, capture, and Studio target
colors identical.

## Shared rendering rules

- Fill the scene with visibly discrete cubes; do not smooth terrain into slopes,
  continuous surfaces, painted overlays, or realistic materials.
- Use flat/unlit-looking semantic colors. Mild face shading and cube-edge
  separation are allowed only when the base color remains unmistakable.
- Do not include a title, labels, text legend, dimensions, coordinates, grid,
  route nodes, arrows, UI, logo, or watermark. Studio renders the authoritative
  color legend outside the image.
- Preserve the reference's relative layout. Color explains block function; it
  does not authorize moving, adding, or deleting geography.
- Preserve the reference's vertical structure as well as its screen layout.
  Major level changes must remain readable through block stacking, top/side
  faces, and shallow shadows rather than labels, contour lines, or painted bands.

## `world-plan.png`

Use one orthographic top-down or near-top-down block render of the complete
continuous playable footprint. It must cover at least four times the geographic
area visible in the uploaded reference, normally by extending to roughly twice
the visible width and twice the visible depth with meaningful
reference-consistent terrain. It must contain one small red spawn-position
token, every selected landmark color, and the functional block colors actually
present. Ground-motion support is pale green; a constrained ground route is
shown only where the request/reference genuinely constrains movement. Flight,
swimming, and water-surface domains have no navigable-area overlay.

Generate this image only after `entry-whitebox-target.png`. The image-generation
call must receive both the uploaded reference and that exact saved entry image.
Treat the entry image as a locked perspective slice: its visible left/right,
front/back, containment, and landmark ordering must project into the top-down
layout without mirroring or rearrangement.

Keep the same elevation hierarchy. Raised routes, stair runs, cliff rims,
valleys, terraces, and platform thickness remain visibly volumetric in the
near-top-down block render; do not flatten them merely because this image is
primarily a navigation plan.

The red token is only a small point made from a few top-facing red cubes. Never
draw a humanoid, animal, rider, vehicle, board, glider, equipment, body part,
pose, facing arrow, or camera cone in the top-down plan.

Do not divide the plan into multiple panels or scenes and do not use portal,
teleport, or paired-transition annotations. This workflow currently requires
one continuous geographic world.

## `entry-whitebox-target.png`

Use an exact 16:9 playable third-person rear composition. The complete red
Subject is straight-backed to camera and centered on the 50% width centerline.
The environment remains made of the same colored cubes as the world plan. This
image is composition intent, not evidence captured from the Runtime. Generate
and inspect it before generating `world-plan.png`.

Match both projected composition and volumetric construction. A staircase must
gain or lose height between its visible endpoints, and terrain/buildings must
retain enough depth and thickness to remain credible from another view.
