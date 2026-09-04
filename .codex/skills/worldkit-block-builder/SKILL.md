---
name: worldkit-block-builder
description: Build or repair a complete WorldKit whitebox world by writing direct Three.js metric blocks, assembling one controlled Subject from a reusable or custom rigid base, selecting Motion/Presentation/Camera Packs, and passing the Block World self-check. Use for the hosted Builder stage; do not use for planning, styling, or SDK runtime development.
---

# WorldKit Block Builder

Create exactly one Agent-authored module:

- `artifacts/scenes/<scene-id>/world.mjs`

The module directly creates ordinary metric `THREE.Mesh` boxes. It is the
only world-geometry authority. Do not create a second JSON world description,
an implementation map, or Host compilation artifacts; the self-check derives
those from `world.mjs`.

## Inputs and authority

Read the validated `scene-brief.md`, `visual-identity-palette.json`,
`entry-whitebox-target.png`, `world-plan.png`, and attached reference images.
Do not edit them. The plan describes intent; your Three.js Scene owns every
actual block position.

Both Planner PNGs use the same immutable Block World colors defined in the
Block API reference. Read color as semantic intent, not as a decorative palette.
Use this authority order: the uploaded reference owns visible meaning and
geography; the entry image owns the opening camera composition, visible block
silhouettes, depth order, and occlusion; the top-down overview owns hidden
continuation, traversable-domain layout, and cross-space connections. Preserve
their shared geography. If the inputs conflict, stop with a clear diagnostic;
do not invent a fourth layout, sample arbitrary RGB values, or silently move a
visible landmark.

Read all three maintained references before writing the module:

1. [references/block-api.md](references/block-api.md) for the exact direct-Mesh
   API, immutable presets, connectivity rules, and visual grouping.
2. [references/subject-camera.md](references/subject-camera.md) for Subject
   Assembly, Motion/Presentation Pack, Camera Pack, and targeting rules.
3. [references/agent-authoring-catalog.json](references/agent-authoring-catalog.json)
   for the Host-generated exact-version Subject, Motion, and Camera Packs
   admitted by the real Block compiler, including compatible combinations,
   fixed presentations, sockets, and visual proxy bounds. These are the only
   Pack choices; do not infer support from a similarly named Registry ref.

## Required outcome

- Build the complete explorable world. The uploaded frame is only a small entry
  slice. Build one continuous geographic world whose explorable top-down
  footprint is at least four times the reference-visible area, normally about
  twice its visible width and twice its visible depth. Implement a middle area,
  meaningful side and rear areas outside the uploaded camera view, and at least
  one remote area or destination. Extend visible geography coherently and never
  use empty bounds padding as world scale. Do not split the build into separate
  scenes, panels, portals, teleports, or hidden destination spaces.
- One full block is exactly one meter. A normal adult human is about 1.8 meters,
  or approximately two full blocks tall. Use only the four undeformed shapes
  from the Block API: full `[1,1,1]`, half `[1,0.5,1]`, quarter-volume
  `[0.5,0.5,1]`, and small `[0.5,0.5,0.5]`. Keep faces on the 0.5-meter
  micro-grid, centers on its 0.25-meter lattice, world scale `[1,1,1]`, and
  Y-only quarter turns.
- Select preset refs; never choose physics numbers, colors, opacity, or traversal
  flags. Build with ordinary TypeScript loops and at most small local helpers
  that place one individual Mesh; no second semantic construction surface is
  available.
- Read every movement row in the Brief. The first is the startup/default mode;
  the remaining rows are real alternate modes of the same Subject. Set
  `requireSingleReachableComponent: true` only when every declared mode is one
  of the four ground modes. If any mode is flight, underwater, water-surface,
  or custom free-space movement, set it to `false`: disconnected ground islands
  are then allowed because ground support is not the complete reachability
  authority. Add an explicit narrow ground path only when the Brief or reference
  actually contains a corridor, bridge, route, or other restricted connection.
- Select exactly one Motion Pack whose `movementModes` satisfy the Brief, and
  require its ID to appear in the base Subject Pack's
  `compatibleMotionPackIds`. Motion belongs to the complete Subject Assembly,
  not to an attachment. Never silently downgrade, visually approximate, or
  relabel an unavailable movement mode. If no admitted combination satisfies
  all modes, stop with `BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED`.
- Copy the selected Catalog row's `traversalEnvelope` exactly into
  `subjectTraversalProfile`. It is derived from the real Runtime collider and
  step capability; never estimate, shrink, or widen it to influence
  connectivity. The checker rejects every mismatch before publishing evidence.
- For an all-ground movement set, declare at least one `middle` and one `remote`
  `requiredTarget`. Put them on real stand positions inside the named middle and
  remote exploration regions from the Brief; neither may duplicate spawn or
  each other. These are invisible validation anchors, not visual targets,
  landmarks, labels, routes, or rendered objects.
- Also declare at least one `requiredGroundTraversalBand` whose centerline begins
  at spawn and ends at a `middle` target. Its waypoints must follow the intended
  entry movement area, and `halfWidthMeters` must describe the actual usable
  band rather than a width inflated to admit a distant detour. Add another band
  for a Brief-required bridge, corridor, staircase course, narrow saddle, or
  other connection whose direct continuity matters. A band validates existing
  ground inside its width; it never asks you to draw or invent a path in an open
  scene. Use `isBidirectional: true` unless the Brief explicitly describes a
  physically one-way traversal.
- Build semantic ground first, then run the checker. Never run a private BFS and
  relabel unreachable intended ground as obstacle, visual-only mass, or empty
  space to make the final walkable component appear connected. A failed anchor
  or traversal band means the geometry must be repaired.
- Let the Brief and overview determine exploration scale. Implement their named
  entry, middle, off-camera, and remote regions at a scale that
  preserves the uploaded reference. Do not stretch a road, duplicate terrain,
  or add empty ground merely to reach a meter span, farthest-point distance, or
  chunk count. The checker reports those measurements for review but does not
  impose movement-mode numeric minima.
- Reproduce terrain evidence at four scales: macro silhouette and horizon;
  ridges, valleys, shorelines, ledges and constructed surfaces; complete visual
  landmarks and important-object targets; then exposed rock, foliage, eave,
  rail and edge detail. Full blocks
  own mass, half blocks own transitions, quarter/small blocks own exposed
  silhouette detail. Never use small blocks as hidden bulk fill, and never turn
  a detail part into a separate visual target.
- Three-dimensional fidelity is a required outcome, not an optional refinement.
  Reconstruct each major form through its plan footprint, longitudinal profile,
  cross-section, thickness, vertical endpoints, and over/under relationships.
  A matching opening-frame silhouette is insufficient when the geometry would
  be flat, hollow, or wrong from the side, top, rear, or during exploration.
  Never use camera-facing mountain walls, facade-only buildings, shallow scenery
  strips, or oversized flat platforms as substitutes for reference volumes.
- A visible staircase is real connected elevation geometry. Preserve its lower
  start, upper destination, total rise relative to surrounding levels, travel
  direction, width, straight/curved/switchback course, major landings, side
  enclosure or drop, and supporting mass. Use admitted full/half blocks to
  reproduce the visible rise and tread rhythm at Block World resolution. A flat
  road with colored or shaded cross-bands is never an acceptable staircase.
- Preserve the course of every visually important road, trail, bridge approach,
  corridor, and other route: its endpoints, ordered bends, junctions,
  switchbacks, width changes, elevation changes, and relationship to nearby
  landmarks. Approximate a curve with the permitted block resolution while
  retaining its centerline and turning sequence; never replace a winding route
  with a convenient straight or axis-aligned shortcut.
- Give terrain real depth behind its visible face. Valleys have a floor and
  containing sides; cliffs have a rim, face, base, and mass behind the rim;
  mountains occupy volume across foreground/middle/background rather than one
  thin skyline row. Preserve which structures sit below, within, above, behind,
  or across those masses.
- Adjacent walkable tops may differ by at most two meters. A difference of at
  most one meter is reconstructed into a continuous Runtime surface. Above one
  meter, add half/full intermediate support when the areas must connect; do not
  rely on a two-meter character step. The selected Subject's capsule step value
  remains frozen for Runtime physics; it does not disconnect an adjacent seam
  that the SDK has already reconstructed as one continuous surface. Represent a real cliff boundary with
  obstacle mass rather than two adjacent walkable tops more than two meters
  apart.
- Do not place air-wall blocks, invisible obstacle rows, perimeter foundations,
  or cliff fences merely to prevent falling. The SDK automatically derives an
  invisible ground-only boundary from exposed walkable edges. It follows Chunk
  residency, blocks walking/sliding/riding/driving (including a ground Subject
  while jumping), and does not block true air or water motion.
- Choose the Subject in this order: first match the Brief's body topology, then
  reuse the closest complete registered Subject Pack, and only then use a
  custom Mesh base. A coarse registered proxy is correct even when it does not
  resemble the reference closely. Subject appearance fidelity is not a
  whitebox goal; correct Motion and Camera framing are.
- A reusable base must appear in `agent-authoring-catalog.json.subjectPacks`.
  Primitive capsules, Golden fixtures, and traversal proxies are omitted from
  the Agent projection entirely. Never copy a raw Registry ref into the new
  Assembly contract.
- Never compose or add primitive parts merely to reproduce a face, hairstyle,
  clothing, armor, handheld or holstered weapons, backpacks, headwear,
  colors, or other appearance-only equipment. For example, a walking human
  carrying a sword is still the registered G Bot with ordinary ground movement.
  The later visual generation stage owns those appearance details.
- Compose a controlled Subject Assembly only when no complete registered Subject can
  represent a movement-changing controlled whole, such as human-plus-board,
  rider-plus-mount, seated vehicle, boat, glider, or a materially different body
  topology. Keep only the major masses needed to communicate that locomotion;
  do not sculpt decorative likeness.
- Ordinary composed humans must be 1.6-2.1 meters tall; default to 1.8 meters.
  Do not enlarge the Subject to fill the frame. Adjust Camera distance to the
  Subject instead. An explicitly giant controlled entity uses a truthful custom
  category/topology rather than pretending to be an ordinary human.
- Put the Subject spawn on a checked stand position at the exact support-top
  height with full clearance. Keep the
  Subject yaw at `0` unless the requested world direction cannot be represented
  by rearranging the world; the opening must remain exactly centered and rear.
- Select one Catalog Camera Pack: standard third person, over shoulder, giant
  third person, or first person. Bind its target to a published base Socket,
  base bounds, assembly bounds, or an explicit local point. Optional Pack
  tuning may change distance, pitch, and FOV within the closed safety ranges.
  Third-person Packs all retain the Runtime Spring Arm hard-collision path.
- The primary Subject uses the Brief's `primary-subject` visual-target ID.
  Every other selected target is one complete `visualGroupId`. All blocks of a
  multi-block landmark or important non-controlled person, animal, creature,
  vehicle, machine, sculpture, or prop share that one ID. Represent an important
  object as one compact complete block proxy at truthful scale and location;
  visual-target status does not create a second controlled/animated Subject.
  Identical important instances named as one repeated target all share the same
  ID. Do not create groups for body parts, equipment, generic decoration,
  routes, or ordinary ground.
- Before detailing a non-subject visual target, lock its complete spatial pose
  from the Planner images: left/right and near/far region, footprint center and
  long axis, semantic front, and relation to nearby paths and structures. A
  target that merely exists but is mirrored, quarter-turned, front/back
  reversed, or moved into another region is not faithful.
- Match complete non-subject targets to the fixed ordered presets: target 2 orange,
  target 3 yellow, target 4 blue, target 5 purple. The primary red target belongs
  only to the controlled Subject. Functional support or interactive blocks
  inside a target keep their functional preset but may share its
  `visualGroupId`. The checker rejects a non-subject target built with a different
  reserved color.
- Use the immutable `walkableIce` and `walkableMud` presets when the Brief calls
  for visibly identifiable slippery ice or sticky mud. Their fixed colors and
  movement feel are one Host-owned semantic package; never approximate either
  surface with ordinary `walkable` blocks or custom numeric physics values.
- Declare one `visualTargetFacings` row for every non-subject `visualGroupId`.
  `frontYawQuarterTurnsY` uses the same exact convention as the controlled
  Subject: `0=-Z`, `1=-X`, `2=+Z`, `3=+X`. Choose the target's semantic front
  (a face, vehicle nose, animal head, doorway facade, or principal building
  entrance), not the longest world axis or the opening Camera. Runtime uses this
  single declaration to capture true Front / Right / Back panels at one shared
  meter-to-pixel scale; do not rotate geometry merely to satisfy capture.

## Completion

Run the bundled checker inside the same Builder task:

```bash
node .codex/skills/worldkit-block-builder/scripts/self-check.mjs \
  --scene-id <scene-id> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --world artifacts/scenes/<scene-id>/world.mjs \
  --authoring-output artifacts/scenes/<scene-id>/authoring.json \
  --map-draft-output artifacts/scenes/<scene-id>/implementation-map.draft.json \
  --report artifacts/scenes/<scene-id>/builder-self-check.json
```

If it fails, repair only `world.mjs` and rerun. Use at most three repair cycles.
Never edit the derived outputs to hide a failure. Finish only with a passing,
fresh `builder-self-check.json`; the trusted Host replays the same checker and
compares the receipt without launching a separate Repair Agent.

After every passing structural self-check, render the Skill-owned visual review:

```bash
node .codex/skills/worldkit-block-builder/scripts/render-visual-review.mjs \
  --world artifacts/scenes/<scene-id>/world.mjs \
  --world-plan apps/playground/public/scene-plans/<scene-id>/world-plan.png \
  --entry apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png \
  --top-down-output artifacts/scenes/<scene-id>/builder-top-down-comparison.png \
  --entry-output artifacts/scenes/<scene-id>/builder-entry-comparison.png
```

Actually open and inspect both PNGs with your image-viewing tool. Each image is
split vertically: Planner intent is on the left and the current `world.mjs`
software render is on the right. In the top-down comparison, check the single
continuous footprint, four-times reference coverage, spawn position, relative
geography, ground-only traversable coloring, landmark placement, and elevation
mass. Also compare important route centerlines, bend order, junctions, and
approaches to landmarks. In the entry comparison, check centered rear framing, foreground/middle/
background order, landmark scale, stair/bridge rise, thickness, and occlusion.
Treat these left/right comparisons as the primary repair feedback, not as files
to acknowledge and move past. Before adding decorative detail, identify and fix
the largest visible mismatch in this order: complete landmark position, landmark
front/travel direction, footprint and scale, then depth order and occlusion.
Preserve the Planner side's left/right and near/far relationships; do not accept
"the same objects are present" when their spatial arrangement differs.
The software render is deterministic Builder feedback, not Runtime evidence and
not an automatic visual-similarity Gate. Its four Camera values are nevertheless
the same authored tuning that the trusted Babylon opening capture applies.

If either comparison is materially wrong, repair only `world.mjs`, rerun the
structural self-check, regenerate both comparison images, and inspect again.
Use at most three combined structural/visual repair cycles. Finish only after
the structural receipt passes and the most recent two comparison PNGs have been
visually reviewed. The trusted Host reruns both scripts and compares the exact
decoded RGBA pixels. PNG encoder and compression-byte differences are ignored;
actual pixel drift still fails. The Host does not judge image similarity or
start another Repair Agent.
