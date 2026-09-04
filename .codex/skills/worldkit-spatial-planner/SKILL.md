---
name: worldkit-spatial-planner
description: In one WorldKit Planner job, turn a user request and reference images into a short Scene Brief plus two semantic block-whitebox planning images using Codex's built-in image generation tool. Use only for planning; do not author geometry, implementation resources, or runtime details.
---

# WorldKit Unified Planner

Create exactly three files:

- `artifacts/scenes/<scene-id>/scene-brief.md`
- `apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png`
- `apps/playground/public/scene-plans/<scene-id>/world-plan.png`

Use this skill for the current Agent-facing hosted planning stage. It owns the
Scene Brief and both non-runtime intent images; Block Builder owns geometry and
the trusted Host owns runtime artifacts. In this one task, write the Scene Brief,
generate and inspect `entry-whitebox-target.png`, and only then generate
`world-plan.png` using the exact saved entry PNG together with the uploaded
reference and Brief. Do not delegate the PNGs to another Image Planner, create a
separate T2I job, or generate the two views independently.

Use the reference images as primary visual evidence and the user request as primary intent. Write concise natural language using [references/scene-brief-template.md](references/scene-brief-template.md). Do not create a Spatial Plan, JSON spec, dimensions, coordinates, route nodes, support-surface tables, camera numbers, Registry refs, primitive decomposition, colliders, or implementation mappings.

Before generating either PNG, read
[references/block-whitebox-images.md](references/block-whitebox-images.md).
It is the single image-palette contract shared with Block Builder and Studio.
Both PNGs must be visibly built from discrete cubes and must use the exact
functional colors for traversable, obstacle, interactive, water, cloud, and
visual-only blocks actually present. Never force a semantic color for a block
type the scene does not contain.

## Required generation sequence

1. Analyze the uploaded reference and write the complete short Scene Brief.
2. Generate `entry-whitebox-target.png` first. Inspect that exact file for the
   strict centered rear Subject, visible geographic order, block semantics, and
   clear-day readability. Also inspect whether visible terrain, stairs, bridges,
   platforms, cliffs, and buildings have the reference's real three-dimensional
   rise, depth, thickness, and occlusion rather than a matching flat silhouette.
   Repair it before continuing when it is wrong.
3. Generate `world-plan.png` second. Attach the uploaded reference and the exact
   saved entry PNG to this image-generation call. Instruct image generation to
   project the entry space into top-down geography, preserve every visible
   left/right/front/depth relationship, and add only the Brief's inferred
   continuation.
4. Inspect the pair together. If the entry image changes, the existing
   `world-plan.png` is stale and must be regenerated from the new entry image.

The reference owns directly visible geography, the entry image owns opening
composition and visible block silhouettes, and the top-down image owns hidden
continuation and connections. Resolve a conflict inside this Planner task; do
not pass mutually inconsistent images to Builder.

Keep the four provenance sections required by current main strictly separate: `用户事实` contains only explicit user requirements, `可见参考证据` only directly visible image evidence, `推断的世界延伸` only conservative playable continuation beyond that evidence, and `仅视觉层设想` only styling/material/lighting ideas for later rendering. Never present an inferred continuation as observed geography. Planner does not select Subject Definitions, registered Subject Assets, Runtime Bundles, rigs, clips, colliders, or motion resources; it describes the complete controlled shape and movement behavior in plain language for Builder.

## Required decisions

### Movement modes

Name one or more movement modes. Write each mode as its own bullet with one
sentence explaining support, steering, inertia, and free-space behavior. The
first row is the startup/default mode; later rows are real alternate modes of
the same controlled Subject, not hypothetical variants. These common modes are
references, not a closed list:

- `陆地步行` — walking/running humanoids or animals whose support changes through ordinary steps;
- `陆地滑行` — skateboards, snowboards, skis, sleds, hoverboards, or another inertia-led ground glide;
- `陆地骑乘` — a rider bound to a mount as one controlled moving subject;
- `陆地驾驶` — a wheeled or tracked controlled vehicle;
- `水面航行` — boats, kayaks, boards, or craft supported by a water surface;
- `水下游动` — free motion through an underwater volume;
- `空中飞行` — free motion through an air volume.

Use those seven standard labels exactly, without adding `（默认）`, `（主要）`,
numbers, priority notes, or any other qualifier inside the label. Ordering
already makes the first row startup/default and later rows alternates; put
explanatory wording after the colon instead.

When none fits, write a concise custom movement label followed by its real support, inertia, steering, and free-space behavior in plain language. Preserve a user-specified custom mode instead of coercing it to the nearest reference mode. Do not collapse `陆地步行 + 空中飞行`, `陆地步行 + 水下游动`, or another genuine hybrid into one vague custom label. The Builder owns implementation: it may assemble a package-local controlled Subject and bind the closest honest current motion closure independently of shape. A missing named Subject preset is not a reason to revise or reject the plan; the Agent does not add SDK motion bases.

Movement-changing equipment belongs to the complete subject description. Clothing, weapons, armor, and backpacks that do not change locomotion remain appearance details and do not create another subject.

### Three-dimensional spatial form

Plan a volume, not a camera-facing picture. For every major terrain mass,
constructed platform, bridge, stair, and landmark, reason about its footprint,
longitudinal elevation profile, cross-section, thickness, and position in depth.
Use perspective scale, overlap, vanishing lines, visible top/side faces, horizon
placement, and occlusion as evidence. The opening image's two-dimensional
silhouette is only one consequence of that volume and is never sufficient by
itself.

Record the visible vertical relationships in concise Brief prose without
coordinates or engineering tables: which area is lower or higher, where an
ascent begins and ends, what it passes above or below, and which upper/lower
spaces it connects. Preserve the number and order of clearly visible elevation
levels. Where the single view leaves depth ambiguous, choose the simplest
volume that satisfies all visible evidence; do not collapse it to a thin
backdrop wall or invent dramatic unseen relief.

For a visible staircase, identify its lower start, upper destination, travel and
rise direction, approximate width relative to the Subject, straight/curved/
switchback form, major landings, side enclosure or drop, and the supporting
terrain/structure. The planned stair must physically arrive at the visibly
higher or lower destination. Horizontal strips painted across a flat path are
not a staircase.

### Navigation intent

Describe navigation in prose, not a graph.

The opening composition is only the world's entry slice, never the map boundary.
Plan exactly one continuous geographic world. Do not split it into panels,
separate scenes, portals, teleports, or hidden destination spaces in this
workflow. The complete top-down explorable footprint must cover at least four
times the geographic area visible in the uploaded reference—normally about
twice its visible width and twice its visible depth—so the reference-visible
slice occupies at most roughly one quarter of `world-plan.png`. Extend through
an entry area, a middle area, meaningful side and rear areas outside the uploaded
camera view, and a remote area or destination. Continue coastlines, valleys,
plateaus, structures, cloud fields, or open volumes conservatively without
rotating or contradicting visible ordering. Every added quadrant needs real
reference-consistent geography or exploration value; empty padding does not
count toward the four-times area.

- Ordinary land scenes are open by default: the whole collision-free playable ground is traversable. Do not invent a road or preferred route.
- Mark only ground-motion support as the pale-green traversable region (and real standable cloud support in its fixed cloud-support color). Flight, underwater swimming, and water-surface motion use collision-free volume or medium and receive no route, corridor, waypoint, or traversable-area overlay. Water remains blue because it is water, not because it is a marked path.
- Require the ground support to form one connected reachable component only when every declared movement mode is ground-based. When the same Subject also has flight, swimming, water-surface, or a custom free-space mode, disconnected ground islands are allowed because the ground graph is no longer the Subject's complete reachability authority.
- Describe a constrained route only when the request or reference visibly contains a bridge, corridor, stair, tunnel, narrow trail, channel, doorway sequence, or another real restriction. Name its start, destination, ordered connection, and whether the restriction lies on natural ground or on a constructed/elevated structure. Keep this distinction in prose; the Builder decides whether trusted Route validation applies.
- The brief describes the complete explorable world, including meaningful side, rear, upper, and destination areas beyond the opening frame.

### Visual targets

Write 1-5 entries total. The first and only `主体` entry is required and counts toward five. Add no landmark merely to fill the list.

Do not interpret `标志物` as architecture only. A non-controlled person,
animal, creature, vehicle, machine, sculpture, or distinctive prop is an
important-object landmark when it is visibly prominent, compositionally or
narratively important, and losing its identity would materially change the
scene. Such an object must not be downgraded to a generic obstacle merely
because it is organic, movable, or smaller than a building. Keep `主体` reserved
for the one controlled Subject; write each selected important non-controlled
object as `标志物`, or use `重复标志物` for several intentionally identical
complete instances. A visual-target designation alone does not claim that the
object is another controllable or animated Runtime Subject.

A landmark qualifies only when all are true:

1. it is a complete, independently recognizable visual whole;
2. it has a distinctive silhouette, structure, material effect, or identity worth preserving through whitebox, first-frame styling, and tri-view reference;
3. it is important enough that losing its identity would materially change the scene;
4. it can be named as one target without promoting its roof, columns, supports, facade pieces, route slices, or decorations into separate targets.

Use `标志物` for one distinctive whole. Use `重复标志物` when several complete instances intentionally share the same appearance; define the identical set once, not one target per instance. Repeated generic decoration, ordinary trees, rocks, walls, terrain patches, background mountains, and construction pieces are not targets unless the complete repeated formation is itself a defining visual landmark.

When more identity-critical wholes are visible than the four non-subject slots,
prioritize: a scene-defining non-controlled person/animal/creature or other
important object; the primary architectural or natural landmark; then a
secondary or repeated formation. Do not spend a slot on a generic background
building while omitting the important character, animal, mount, vehicle, or
object that carries the reference's identity. Background crowds, herds, flocks,
traffic, or ordinary props remain unselected unless their shared formation is
itself distinctive and important.

Examples:

- one palace complex with a unified identity → one `标志物`;
- two matching gate towers → one `重复标志物`;
- one prominent non-controlled fox, guardian, astronaut, boat, or signature
  machine → one `标志物`;
- several visually identical important animals or guards acting as one
  recognizable set → one `重复标志物`;
- twelve identical ordinary lamps → normally no visual target;
- palace roof, columns, stairs, and foundation → parts of the palace, never four targets;
- no distinctive landmark or important object → output only the subject target.

## Entry composition

Use a strict standard playable third-person rear view. The controlled Subject is exactly horizontally centered: its visual mass center, body/root center, head or pilot center, and main locomotion body sit on the image's vertical centerline at 50% width. “Near center,” a slight left/right bias, rule-of-thirds framing, over-the-shoulder framing, and environment-balanced offset composition are all invalid.

The camera is directly behind the Subject, never diagonally behind it. The Subject's full back faces the camera; its body-forward axis and the camera optical axis share the same center plane. Both shoulders/sides read as a straight rear view rather than a three-quarter rear view, and the face/chest/side profile is not visible. The Subject looks straight toward the open world or actual destination. For a rider, vehicle, board, glider, or another composite controlled Subject, keep the pilot/main body and the complete controlled visual group centered rather than allowing attached equipment to pull the composition sideways.

Describe foreground, middle ground, background, scale, left/right relationships, and major occlusion in prose. Do not specify FOV, camera distance, UV, radians, or other numeric camera parameters.

## Deterministic visual identity order

The trusted Host derives the palette JSON after delivery, but both Planner images must already follow the same fixed target order. The Brief parser assigns `visual-target-1` through `visual-target-5` in listed order, using these exact colors:

1. `visual-target-1` → `#E85D5D`
2. `visual-target-2` → `#F28E2B`
3. `visual-target-3` → `#D9A514`
4. `visual-target-4` → `#4E79A7`
5. `visual-target-5` → `#9C6ADE`

Do not write `visual-identity-palette.json`; the Host owns it. Use the same
ordered target colors in both PNGs, but apply the primary red differently: the
top-down plan contains only one small spawn-position token, while the entry
image contains the complete controlled Subject silhouette. Functional surfaces inside a landmark
keep their functional block color while the remaining complete silhouette keeps
its ordered landmark color.

## Top-down world plan — generate second

Generate one clean orthographic top-down block-whitebox navigation image only
after the entry target has been generated and inspected. Use the uploaded
reference and the exact entry target as image references. Preserve visible
relative direction, adjacency, containment, ordering, separation, connection,
shoreline, cliff, building, terrain mass, and route relationships. Infer unseen
space conservatively; do not rotate, mirror, reorder, or redesign the entry
space for a prettier map.

Top-down does not mean heightless. Use stacked block relief, visible top/side
faces, and shallow inspection shadows to keep major elevation levels, raised
bridges, stair runs, cliff rims, valleys, and platform thickness legible without
adding elevation labels or contour overlays. Its footprint must agree with the
entry image, while its block stacking must agree with the Brief's vertical
relationships.

The image contains only four information layers:

1. a discrete-cube rendering of the reference-consistent complete world layout;
2. one small red spawn-position token at the described initial position;
3. exact functional block colors showing ground-motion support, collision,
   distinct normal/ice/mud ground feel, interaction, water/cloud, and
   visual-only semantics that actually exist;
4. the ordered colors of every selected complete non-subject visual target,
   including important people, animals, creatures, vehicles, objects, and
   repeated sets as well as environmental landmarks.

Show the complete intended playable footprint at no less than four times the
reference-visible geographic area, not a crop matching the entry frame. The
spawn token occupies only one small entry location, while the middle, side/rear,
and remote off-camera areas visibly dominate the plan. The red token is a simple
top-down point made from a few red cube tops. It is not a humanoid, animal,
rider, vehicle, board, glider, weapon, equipment silhouette, facing arrow, or
camera cone. Do not depict any Subject anatomy or pose in `world-plan.png`.
This restriction applies only to the red controlled-Subject spawn token. A
selected non-subject person, animal, vehicle, or other important-object target
still appears once at its real geographic location as a compact complete block
proxy in its own ordered target color.

For open ground movement, shade the entire collision-free walkable ground area
instead of inventing a preferred lane. For a real constrained ground
connection, show only the actual continuous support. For flight, underwater,
water-surface, or a custom free-space mode, do not shade or outline a navigable
domain. Show only actual blocks, collision masses, water/cloud semantics,
landmarks, and the spawn token. If a hybrid Subject also has a ground mode, mark
its real ground support without implying that those regions define full
free-space reachability.

Keep one continuous map and remove every other overlay
or annotation: no labels, title, in-image legend, scale, elevation values,
dimensions, coordinates, grid, camera cone, route nodes, arrows, callouts, UI,
logo, or watermark. Studio displays the color legend next to the image.

## Entry composition intent target — generate first

Generate one geometry-readable 16:9 block-whitebox entry composition intent target using the reference images and the completed Brief. Despite the historical file name `entry-whitebox-target.png`, this image is not runtime evidence and must never be presented as the actual whitebox. Preserve complete-subject silhouette, landmark scale, navigation openness or real constrained connection, depth order, occlusion, and the strict centered third-person rear composition. The actual whitebox is captured only from the verified Babylon Runtime.

Reconstruct visible geometry as real block volume. Terrain must have foreground-
to-background depth and side mass; buildings need footprint and thickness;
raised routes need real support and clearance; stairs must visibly rise or fall
between their actual endpoint levels. Never use a flat road with decorative
cross-bands, camera-facing mountain slabs, or shallow facade cutouts to imitate
the reference from this one view.

Use the same neutral clear daytime inspection lighting for every entry whitebox target, regardless of whether the uploaded reference depicts night, sunset, backlight, fog, space, an interior, or another dark condition. Use a bright neutral sky/fill, a consistent daylight key, readable midtones, and soft shallow shadows so every terrain and structure silhouette is visible. Never copy the reference image's time of day, exposure, darkness, colored illumination, or dramatic contrast into the whitebox target. This rule applies only to the whitebox planning/capture stage; the later styled first frame may restore the user's reference lighting and style.

All terrain, support surfaces, structures, and unselected components are discrete
cubes colored by the exact functional palette in the image-contract reference.
Color selected complete targets with the fixed target-order colors above. One
multi-part target uses one color across the whole non-functional silhouette; one
repeated target uses the same color for every identical complete instance. Do
not convert walkable, interaction, water, or cloud blocks to a landmark color.
Include no labels, UI, logo, watermark, or alternate view.

## Completion

Before finishing, confirm all three declared files exist and run the bundled portable checker:

```bash
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs \
  --scene-id <scene-id> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --world-plan apps/playground/public/scene-plans/<scene-id>/world-plan.png \
  --entry apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png \
  --report artifacts/scenes/<scene-id>/planner-self-check.json
```

If it fails, read the JSON diagnostics and repair inside this same task. When the
entry image changes, regenerate the top-down image from that new entry before
rerunning the checker. Use at most three self-repair cycles and never finish
with a failed or stale receipt. The receipt hashes all three outputs and records
per-image block-palette coverage, traversable/interactive counts, ordered target
colors, aspect ratio, and entry Subject center; any edit after a passing check
requires another check. Inspect both images as well: semantic colors cannot
prove correct geography or continuous-world coherence by themselves. Human review
owns top-down geography, inferred continuation, four-times-area coverage,
spawn-token meaning, and visual quality; do not invent pixel-area,
marker-shape, or image-recognition rules. In the entry image, the complete
primary Subject must be exactly centered and seen straight from behind;
“approximately centered” is a failure.

The trusted Host replays this same checker and the canonical Brief parser once after delivery. It never starts a separate Planner Repair Agent. The Builder owns all subsequent technical spatialization.
