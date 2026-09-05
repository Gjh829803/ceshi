---
name: worldkit-spatial-planner
description: Use when a hosted WorldKit scene needs a Scene Brief, top-down world plan, and entry composition target from a user request and reference images. Canonical terrain planning additionally produces signed Height Intent; Babylon Native planning does not. Use only for planning; do not author geometry, implementation resources, or runtime details.
---

# WorldKit Unified Planner

The Host selects exactly one closed output profile. Never infer, combine, or extend profiles.

**Canonical Source** creates exactly five semantic output files:

- `artifacts/scenes/<scene-id>/scene-brief.md`
- `artifacts/scenes/<scene-id>/terrain-height-intent-prompt.md`
- `apps/playground/public/scene-plans/<scene-id>/world-plan.png`
- `apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png`
- `apps/playground/public/scene-plans/<scene-id>/terrain-height-intent.png`

**Babylon Native Source** creates exactly three semantic output files:

- `artifacts/scenes/<scene-id>/scene-brief.md`
- `apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png`
- `apps/playground/public/scene-plans/<scene-id>/world-plan.png`

The Babylon Native profile must not create Height Intent, a Height Intent prompt, terrain samples,
or another terrain proposal. Native block geometry is a later Builder responsibility. Both profiles
also produce `planner-self-check.json`, which is a receipt rather than a semantic Planner output.

Use this skill for the optional hosted preview-planning stage. It does not replace the formal World Planner's WorldSpec, World Plan, Opening Shot or trusted plan-lock boundary. Write the Scene Brief first, then call Codex's built-in image generation tool inside the same task to create every PNG declared by the selected profile from the same decisions and reference evidence. Do not delegate the PNGs to another Image Planner or create a separate T2I job.

Use the reference images as primary visual evidence and the user request as primary intent. Write concise natural language using [references/scene-brief-template.md](references/scene-brief-template.md). Do not create a Spatial Plan, JSON spec, dimensions, coordinates, route nodes, support-surface tables, camera numbers, Registry refs, primitive decomposition, colliders, or implementation mappings.

For the Canonical Source Height Intent only, read
[references/terrain-height-intent-prompt.md](references/terrain-height-intent-prompt.md), write the
fully expanded scene prompt to the declared Markdown path, then generate exactly one raster from
that prompt in this same task. `world-plan.png owns orientation and complete-world extent`; the
Height Intent image encodes only continuous base-ground relief in that same frame. It is an
untrusted proposal and must never be presented as compiled terrain or Runtime evidence.

If `assets/terrain-height-intent/golden-exemplars.json` is available, select an accepted exemplar
only when its `terrainFamily` matches the planned world. It is `encoding-style-only`: never copy
its topology, relief amplitude, structures, landmarks, routes, water placement, or composition.
When no compatible accepted family exists, generate without a golden exemplar rather than using
the nearest-looking one.

Keep the four provenance sections required by current main strictly separate: `用户事实` contains only explicit user requirements, `可见参考证据` only directly visible image evidence, `推断的世界延伸` only conservative playable continuation beyond that evidence, and `仅视觉层设想` only styling/material/lighting ideas for later rendering. Never present an inferred continuation as observed geography. Planner does not select Subject Definitions, registered Subject Assets, Runtime Bundles, rigs, clips, colliders, or motion resources; it describes the complete controlled shape and movement behavior in plain language for Builder.

For Babylon Native, read
[references/block-whitebox-images.md](references/block-whitebox-images.md)
before generating either PNG. It is the image-only Block World palette,
volumetric rendering, and ordinary-success admission contract shared by this
Skill and its portable checker. The images remain untrusted Builder proposals;
their colors never create Runtime, Physics, Collider, Support, or Gameplay
truth.

For Native production, also read the Host-frozen
`context/native-block-production-budget.json` before making either image. It contains the actual
generation limits and shape dimensions from the same owners used by Native Builder; it is read-only
implementation feasibility context, not permission to write metric coordinates or another output.
Plan a complete coarse Block world inside that capacity: preserve large structural masses, important
routes and level changes, support depth, meaningful side/rear areas and remote destinations before small
decorative pieces. Do not draw an unbounded high-detail concept diorama and assume Builder can discard
most of the world later. Simplify repeated ornament and exposed micro-detail first, keeping visible
geography, complete landmarks and negative space. Restore paper/material/clothing detail only in the
later visual stage. The ceiling is neither a target count nor a new image-similarity gate; historical
Planner hard thresholds and the one-task repair budget are unchanged.

## Babylon Native causal image sequence

For the Babylon Native Source, the two planning images are one causal proposal and must be made in
this exact order inside this single Planner task:

1. Finish the Scene Brief before generating either image.
2. Generate the 16:9 `entry-whitebox-target.png` from the Brief and uploaded references, then
   actually open and inspect that exact PNG with the available image-viewing tool. Check the strict
   rear Subject, visible selected-target identity, visible geographic order, depth, ordinary
   perspective/occlusion, and clear-day readability. Do not enlarge, move, or unocclude a distant,
   repeated, or off-camera non-subject merely to satisfy an entry metric. Repair and reinspect the
   image until it is the accepted entry.
3. Generate `world-plan.png` only after that acceptance. Supply the uploaded references, completed
   Brief, and exact accepted entry PNG as an image input to the same generation call. The World Plan
   projects and completes the accepted entry space; it is never an independent redesign.
4. Actually open and inspect the accepted entry and World Plan together. Confirm that visible
   left/right/front/depth relationships, target placement, traversable extent, and inferred hidden
   continuation describe one world.

If the accepted entry is edited or regenerated for any reason, the existing World Plan is stale and
must be regenerated from the new exact entry before the pair is inspected again. Rerunning the
checker alone cannot make a stale World Plan current. Do not satisfy this sequence with filenames,
text claims, or an earlier generated image: inspect and pass the exact files that will be delivered.
This Native sequence does not introduce another model task, Planning authority, Runtime Capture,
Compiler, or Physics authority. Its Block World colors are image-only Builder intent.

## Required decisions

### Native deterministic palette authoring

For Babylon Native only, use the bundled `scripts/author-palette.mjs` after inspecting each
generated PNG and before accepting it. If inspection confirms an existing selected target but its
lighting/shading produced the wrong RGB, select a tight image-pixel rectangle around that target's
existing non-functional colored silhouette. This is explicit Planner image authoring, never Host
auto-repair. It recolors only opaque, saturated pixels in the target's hue family within that
selection; it cannot add, move, enlarge, or unocclude geometry. Do not select an unrelated same-hue
object or use a functional surface as a substitute for a missing target. A missing or undersized
target requires real image regeneration, not a painted marker to force a checker pass.

Compute SHA-256 from the exact current PNG. Invoke the portable helper in the same task:

```bash
node .codex/skills/worldkit-spatial-planner/scripts/author-palette.mjs \
  --image apps/playground/public/scene-plans/<scene-id>/world-plan.png \
  --image-hash sha256:<exact-current-png-sha256> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --target visual-target-1 \
  --region-pixels <left,top,width,height>
```

The rectangle is integer image-pixel authoring input, not metric world coordinates or a Scene Brief
field. The helper edits only the named existing PNG and prints source/result hashes and changed
pixel counts; it does not create a new semantic output, acceptance receipt, or Runtime evidence.
Inspect the result, then run the unchanged self-check. Apply the same operation to other selected
targets only where actually visible; never require opening-absent landmarks to appear. If the entry
changes, regenerate the dependent World Plan from that exact accepted entry as required above.
Pure RGB drift does not need another image-generation call. These edits stay inside the existing
three self-repair cycles; they do not grant more retries. Never edit the frozen Host palette, alter
checker thresholds, or use this operation on Canonical Height Intent.

### Movement modes

List 1-8 movement modes in user-requested order, one `- 模式：说明` row per mode. The first row is the initial mode; retain later transitions or combined capabilities rather than collapsing them into one label. Explain each in one sentence. These common modes are references, not a closed list:

- `陆地步行` — walking/running humanoids or animals whose support changes through ordinary steps;
- `陆地滑行` — skateboards, snowboards, skis, sleds, hoverboards, or another inertia-led ground glide;
- `陆地骑乘` — a rider bound to a mount as one controlled moving subject;
- `陆地驾驶` — a wheeled or tracked controlled vehicle;
- `水面航行` — boats, kayaks, boards, or craft supported by a water surface;
- `水下游动` — free motion through an underwater volume;
- `空中飞行` — free motion through an air volume.

When none fits, write a concise custom movement label followed by its real support, inertia, steering, and free-space behavior in plain language. Standard labels may name equipment in parentheses, such as `陆地滑行（滑板）` or `空中飞行(滑翔翼)`; keep different requested descriptions and their order. Do not repeat an identical label or coerce a user-specified custom mode into the nearest reference mode.

For Canonical Source, Builder may assemble a package-local controlled Subject and bind the closest honest current motion closure independently of shape. For Babylon Native Source, Host alone selects and creates the controlled Subject and its movement capabilities; Native Builder authors environment geometry, never Subject/Physics/Camera. A missing named preset is not a reason for Planner to revise or reject user intent, and listing modes does not claim Runtime support. Neither Planner nor per-scene Builder adds SDK motion bases.

Movement-changing equipment belongs to the complete subject description. Clothing, weapons, armor, and backpacks that do not change locomotion remain appearance details and do not create another subject.

### Navigation intent

Describe navigation in prose, not a graph.

The opening composition is only the world's entry slice, never the map boundary. Plan one continuous
geographic world whose complete explorable top-down footprint covers at least four times the
reference-visible area, normally about twice its visible width and twice its visible depth. The
reference-visible slice occupies at most roughly one quarter of `world-plan.png`. Extend through an
entry area, a middle area, meaningful side and rear off-camera exploration areas, and a remote area or destination. Continue
visible geography conservatively without rotating or contradicting its ordering; empty padding does
not count toward the four-times area. Do not split the world into panels, separate scenes, portals,
teleports, or hidden destination spaces. Describe unseen continuation in `推断的世界延伸`, not as
`用户事实` or `可见参考证据`. This is generation intent, not an area or similarity admission gate.
Do not infer quality from a fixed duration or perimeter. Keep the existing resource budget and repair
budget; simplify ornament before reducing meaningful geography.

- Ordinary land scenes are open by default: the whole collision-free playable ground is traversable. Do not invent a road or preferred route.
- Flying and underwater scenes use the whole bounded free volume outside solid collisions. Do not invent rails or waypoint tunnels.
- Describe a constrained route only when the request or reference visibly contains a bridge, corridor, stair, tunnel, narrow trail, channel, doorway sequence, or another real restriction. Name its start, destination, ordered connection, and whether the restriction lies on natural ground or on a constructed/elevated structure. Keep this distinction in prose; the Builder decides whether trusted Route validation applies.
- The brief describes the complete explorable world, including meaningful side, rear, upper, and destination areas beyond the opening frame.

### Visual targets

Write 1-5 entries total. The first and only `主体` entry is required and counts toward five. Add no landmark merely to fill the list.

A landmark qualifies only when all are true:

1. it is a complete, independently recognizable visual whole;
2. it has a distinctive silhouette, structure, material effect, or identity worth preserving through whitebox, first-frame styling, and tri-view reference;
3. it is important enough that losing its identity would materially change the scene;
4. it can be named as one target without promoting its roof, columns, supports, facade pieces, route slices, or decorations into separate targets.

Recall is more important than object category. An important non-controlled person, animal, creature,
vehicle, machine, sculpture, or distinctive prop is a complete visual target when losing it would
materially change the reference. Do not omit it merely because it is organic, movable, smaller than
the architecture, difficult to build, or not a registered SDK asset. Conversely, do not promote
generic filler into a target just to reach five entries.

Use `标志物` for one distinctive whole. Use `重复标志物` when several complete instances intentionally share the same appearance; define the identical set once, not one target per instance. Repeated generic decoration, ordinary trees, rocks, walls, terrain patches, background mountains, and construction pieces are not targets unless the complete repeated formation is itself a defining visual landmark.

When more identity-critical wholes are visible than the four non-subject slots, prioritize: a
scene-defining non-controlled person/animal/creature or other important object; the primary
architectural or natural landmark; then a secondary or repeated formation. Do not spend a slot on a
generic background building while omitting the signature person, animal, vehicle, or object.
Background crowds, herds, flocks, traffic, and ordinary props remain unselected unless their shared
formation is itself distinctive and important. Selection does not make another controllable or
animated Runtime Subject.

Examples:

- one palace complex with a unified identity → one `标志物`;
- two matching gate towers → one `重复标志物`;
- one prominent non-controlled fox, guardian, astronaut, boat, or signature machine → one `标志物`;
- several identical important animals or guards forming one recognizable set → one `重复标志物`;
- twelve identical ordinary lamps → normally no visual target;
- palace roof, columns, stairs, and foundation → parts of the palace, never four targets;
- no distinctive landmark → output only the subject target.

## Entry composition

Use a strict standard playable third-person rear view. The controlled Subject is exactly horizontally centered: its visual mass center, body/root center, head or pilot center, and main locomotion body sit on the image's vertical centerline at 50% width. “Near center,” a slight left/right bias, rule-of-thirds framing, over-the-shoulder framing, and environment-balanced offset composition are all invalid.

The camera is directly behind the Subject, never diagonally behind it. The Subject's full back faces the camera; its body-forward axis and the camera optical axis share the same center plane. Both shoulders/sides read as a straight rear view rather than a three-quarter rear view, and the face/chest/side profile is not visible. The Subject looks straight toward the open world or actual destination. For a rider, vehicle, board, glider, or another composite controlled Subject, keep the pilot/main body and the complete controlled visual group centered rather than allowing attached equipment to pull the composition sideways.

Describe foreground, middle ground, background, scale, left/right relationships, and major occlusion in prose. Do not specify FOV, camera distance, UV, radians, or other numeric camera parameters.

## Deterministic visual identity order

The trusted Host derives the palette JSON after delivery. The Brief parser assigns `visual-target-1` through `visual-target-5` in listed order. Canonical Source keeps the current Canonical colors:

1. `visual-target-1` → `#E85D5D`
2. `visual-target-2` → `#F28E2B`
3. `visual-target-3` → `#8E6CCF`
4. `visual-target-4` → `#D45087`
5. `visual-target-5` → `#D6B84C`

Babylon Native Source reproduces the historical Block World colors:

1. `visual-target-1` → `#E85D5D`
2. `visual-target-2` → `#F28E2B`
3. `visual-target-3` → `#D9A514`
4. `visual-target-4` → `#4E79A7`
5. `visual-target-5` → `#9C6ADE`

These profiles are not interchangeable. Do not write
`visual-identity-palette.json`; the Host owns it. Canonical Source uses its
colors only in the entry target. Babylon Native uses its historical colors in
both planning images: in the World Plan,
target 1 is one small red spawn token and every selected non-subject target uses
its ordered color. In the entry image, target 1 is the complete red controlled
Subject and visible non-subject targets use their ordered colors. Perspective,
distance, repetition, partial occlusion, or being outside the opening frame may
make a non-subject small, fragmented, or absent there; never distort the world
to expose it. Keep the target in the Brief, World Plan, and Builder intent.

## Top-down world plan

Generate one clean orthographic or near-top-down navigation image. The uploaded reference is absolute authority for world geography: preserve visible relative direction, adjacency, containment, ordering, separation, connection, shoreline, cliff, building, terrain mass, and route relationships. Infer unseen space conservatively.

For Canonical Source, the image contains only three information layers:

1. a simple neutral rendering of the reference-consistent world layout;
2. one unmistakable initial-subject marker at the described spawn position;
3. the traversable domain appropriate to the movement mode.

For Babylon Native Source, use discrete cubes and exactly four information layers:

1. a discrete-cube rendering of the reference-consistent complete world layout;
2. one small red spawn-position token at the described initial position;
3. the exact functional Block World colors from the image contract for semantics actually present;
4. every selected non-subject target in its ordered identity color at its geographic location.

Show the complete intended playable footprint, not a crop matching the entry frame. The spawn marker may occupy a small entry portion of the plan, while middle, side/rear, and remote off-camera areas remain visibly available for exploration.

For open ground, shade the entire collision-free walkable area instead of inventing a preferred lane. For a real constrained connection, show only the actual continuous path. Canonical flight, underwater, or custom free-space planning may show the top-down projection of its genuinely traversable domain without rails or ground paths. Babylon Native follows its exact image contract instead: flight, swimming, and water-surface modes receive no navigable-area overlay. Canonical remains a neutral planning image.

Keep raised routes, stair runs, cliff rims, valleys, terraces, and platform
thickness visibly volumetric through block stacking and visible top/side faces.
Remove every other overlay or annotation: no labels, title, in-image legend,
scale, elevation values, dimensions, coordinates, grid, camera cone, route
nodes, arrows, callouts, UI, logo, or watermark.

## Canonical Source Terrain Height Intent

Skip this entire section for the Babylon Native Source. For the Canonical Source, after the Brief
and World Plan exist, expand every required input in the maintained Height Intent
prompt reference. Preserve the World Plan's orientation, extent, adjacency, containment, open
connections, and major continuous terrain masses. A user image remains visible evidence; the
World Plan is the canonical top-down coordinate frame for this output.

Save the exact rendered prompt before image generation. Generate one square, strict orthographic,
fully opaque PNG using `signed-diverging-blue-gray-orange@1`:

- depressions interpolate from `RGB(32,64,208)` to datum `RGB(128,128,128)`;
- elevations interpolate from datum to `RGB(224,96,32)`;
- use continuous low-frequency gradients without discrete bands, lighting, materials, labels, or
  objects;
- omit every separately modeled Landmark or Structure while preserving blended support ground;
- encode water beds as depressed terrain but never encode the water surface or material;
- preserve stable entry support and connected ground without drawing routes or markers.

The deterministic Host owns median-datum normalization, metric mapping, Water, Spawn, Landmark
support, Route, slope, and quantization constraints. Do not preprocess or numerically repair the
PNG inside the Planner task.

## Entry composition intent target

Generate one geometry-readable 16:9 entry composition intent target using the reference images and the completed Brief. Despite the historical file name `entry-whitebox-target.png`, this image is not runtime evidence and must never be presented as the actual whitebox. Preserve complete-subject silhouette, landmark scale, navigation openness or real constrained connection, depth order, occlusion, and the strict centered third-person rear composition. The actual whitebox is captured only from the verified Babylon Runtime.

Use the same neutral clear daytime inspection lighting for every entry whitebox target, regardless of whether the uploaded reference depicts night, sunset, backlight, fog, space, an interior, or another dark condition. Use a bright neutral sky/fill, a consistent daylight key, readable midtones, and soft shallow shadows so every terrain and structure silhouette is visible. Never copy the reference image's time of day, exposure, darkness, colored illumination, or dramatic contrast into the whitebox target. This rule applies only to the whitebox planning/capture stage; the later styled first frame may restore the user's reference lighting and style.

For Canonical Source, terrain, support surfaces, structures, and unselected
components remain neutral white or light gray; color only selected complete
targets. For Babylon Native Source, use discrete cubes in the exact functional
colors from the image contract. Color selected targets in their ordered colors
where they are visible. One multi-part target uses one color across its
non-functional silhouette; one repeated target uses the same color for its
actual instances. Functional walkable, interaction, water, and cloud blocks
keep their functional color. Include no labels, UI, logo, watermark, or
alternate view.

The Babylon Native ordinary hard gate intentionally matches the successful historical
production chain: entry Block palette coverage is at least 2%; a ground mode
has support color; the red target-1 Subject mask covers at least 0.10% of the
frame; its horizontal center error is at most 1.5%; and the image is 16:9 within
2%. Non-subject scale, connected-component coherence, exclusive-color
admission, and ambiguity remain receipt measurements and Builder feedback only.
They never fail Planner status. A distant, small, repeated, partially occluded,
or opening-absent non-subject remains valid when these hard conditions pass.

## Completion

Before finishing, confirm the selected profile's semantic outputs exist and run the bundled portable
checker with the same required Scene Source discriminator.

Canonical Source:

```bash
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs \
  --scene-source canonical \
  --scene-id <scene-id> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --world-plan apps/playground/public/scene-plans/<scene-id>/world-plan.png \
  --entry apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png \
  --terrain-prompt artifacts/scenes/<scene-id>/terrain-height-intent-prompt.md \
  --terrain-intent apps/playground/public/scene-plans/<scene-id>/terrain-height-intent.png \
  --report artifacts/scenes/<scene-id>/planner-self-check.json
```

Babylon Native Source:

```bash
node .codex/skills/worldkit-spatial-planner/scripts/self-check.mjs \
  --scene-source babylon-native \
  --scene-id <scene-id> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --world-plan apps/playground/public/scene-plans/<scene-id>/world-plan.png \
  --entry apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png \
  --report artifacts/scenes/<scene-id>/planner-self-check.json
```

If it fails, read the JSON diagnostics, repair the selected profile's outputs, and regenerate the affected PNGs inside this same task, then rerun the checker. Use at most three self-repair cycles and never finish with a failed or stale receipt. The receipt hashes every semantic output in the selected closed profile, so any edit after a passing check requires another check. For Babylon Native, a changed entry always invalidates and requires regeneration of the dependent World Plan before this check. Inspect the exact delivered pair again after repair. The primary Subject must be exactly centered and seen straight from behind; “approximately centered” is a failure.

The trusted Host replays this same checker and the canonical Brief parser once after delivery. It never starts a separate Planner Repair Agent. The Builder owns all subsequent technical spatialization.
