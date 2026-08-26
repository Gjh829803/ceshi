---
name: worldkit-spatial-planner
description: In one WorldKit Planner job, turn a user request and reference images into a short Scene Brief plus a minimal top-down world plan and a palette-marked entry whitebox target using Codex's built-in image generation tool. Use only for planning; do not author Canonical JSON, implementation resources, or runtime details.
---

# WorldKit Unified Planner

Create exactly three files:

- `artifacts/scenes/<scene-id>/scene-brief.md`
- `apps/playground/public/scene-plans/<scene-id>/world-plan.png`
- `apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png`

Use this skill for the optional hosted preview-planning stage. It does not replace the formal World Planner's WorldSpec, World Plan, Opening Shot or trusted plan-lock boundary. Write the Scene Brief first, then call Codex's built-in image generation tool inside the same task to create both PNG files from the same decisions and reference evidence. Do not delegate the PNGs to another Image Planner or create a separate T2I job.

Use the reference images as primary visual evidence and the user request as primary intent. Write concise natural language using [references/scene-brief-template.md](references/scene-brief-template.md). Do not create a Spatial Plan, JSON spec, dimensions, coordinates, route nodes, support-surface tables, camera numbers, Registry refs, primitive decomposition, colliders, or implementation mappings.

When the Host or user explicitly requests an experimental terrain height-intent image, read
[references/terrain-height-intent-prompt.md](references/terrain-height-intent-prompt.md) and use
its prompt recipe. This optional experiment does not add a fourth output to the normal Planner
job, does not alter the three-file self-check, and must never be presented as compiled terrain or
Runtime evidence.

Keep the four provenance sections required by current main strictly separate: `用户事实` contains only explicit user requirements, `可见参考证据` only directly visible image evidence, `推断的世界延伸` only conservative playable continuation beyond that evidence, and `仅视觉层设想` only styling/material/lighting ideas for later rendering. Never present an inferred continuation as observed geography. Planner does not select Subject Definitions, registered Subject Assets, Runtime Bundles, rigs, clips, colliders, or motion resources; it describes the complete controlled shape and movement behavior in plain language for Builder.

## Required decisions

### Movement mode

Name exactly one movement mode and explain it in one sentence. These common modes are references, not a closed list:

- `陆地步行` — walking/running humanoids or animals whose support changes through ordinary steps;
- `陆地滑行` — skateboards, snowboards, skis, sleds, hoverboards, or another inertia-led ground glide;
- `陆地骑乘` — a rider bound to a mount as one controlled moving subject;
- `陆地驾驶` — a wheeled or tracked controlled vehicle;
- `水面航行` — boats, kayaks, boards, or craft supported by a water surface;
- `水下游动` — free motion through an underwater volume;
- `空中飞行` — free motion through an air volume.

When none fits, write a concise custom movement label followed by its real support, inertia, steering, and free-space behavior in plain language. Preserve a user-specified custom mode instead of coercing it to the nearest reference mode. The Builder owns implementation: it may assemble a package-local controlled Subject and bind the closest honest current motion closure independently of shape. A missing named Subject preset is not a reason to revise or reject the plan; the Agent does not add SDK motion bases.

Movement-changing equipment belongs to the complete subject description. Clothing, weapons, armor, and backpacks that do not change locomotion remain appearance details and do not create another subject.

### Navigation intent

Describe navigation in prose, not a graph.

The opening composition is only the world's entry slice, never the map boundary. Extend the reference-consistent world through an entry area, at least one middle area, and meaningful off-camera exploration areas or remote destinations appropriate to the request. Do not infer quality from a fixed duration or perimeter and do not satisfy completeness with empty padding.

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

Use `标志物` for one distinctive whole. Use `重复标志物` when several complete instances intentionally share the same appearance; define the identical set once, not one target per instance. Repeated generic decoration, ordinary trees, rocks, walls, terrain patches, background mountains, and construction pieces are not targets unless the complete repeated formation is itself a defining visual landmark.

Examples:

- one palace complex with a unified identity → one `标志物`;
- two matching gate towers → one `重复标志物`;
- twelve identical ordinary lamps → normally no visual target;
- palace roof, columns, stairs, and foundation → parts of the palace, never four targets;
- no distinctive landmark → output only the subject target.

## Entry composition

Use a strict standard playable third-person rear view. The controlled Subject is exactly horizontally centered: its visual mass center, body/root center, head or pilot center, and main locomotion body sit on the image's vertical centerline at 50% width. “Near center,” a slight left/right bias, rule-of-thirds framing, over-the-shoulder framing, and environment-balanced offset composition are all invalid.

The camera is directly behind the Subject, never diagonally behind it. The Subject's full back faces the camera; its body-forward axis and the camera optical axis share the same center plane. Both shoulders/sides read as a straight rear view rather than a three-quarter rear view, and the face/chest/side profile is not visible. The Subject looks straight toward the open world or actual destination. For a rider, vehicle, board, glider, or another composite controlled Subject, keep the pilot/main body and the complete controlled visual group centered rather than allowing attached equipment to pull the composition sideways.

Describe foreground, middle ground, background, scale, left/right relationships, and major occlusion in prose. Do not specify FOV, camera distance, UV, radians, or other numeric camera parameters.

## Deterministic visual identity order

The trusted Host derives the palette JSON after delivery, but both Planner images must already follow the same fixed target order. The Brief parser assigns `visual-target-1` through `visual-target-5` in listed order, using these exact identity colors:

1. `visual-target-1` → `#E85D5D`
2. `visual-target-2` → `#F28E2B`
3. `visual-target-3` → `#8E6CCF`
4. `visual-target-4` → `#D45087`
5. `visual-target-5` → `#D6B84C`

Do not write `visual-identity-palette.json`; the Host owns it. Use these colors only in `entry-whitebox-target.png`. `world-plan.png` remains palette-free.

## Top-down world plan

Generate one clean orthographic top-down navigation image. The uploaded reference is absolute authority for world geography: preserve visible relative direction, adjacency, containment, ordering, separation, connection, shoreline, cliff, building, terrain mass, and route relationships. Infer unseen space conservatively.

The image contains only three information layers:

1. a simple neutral rendering of the reference-consistent world layout;
2. one unmistakable initial-subject marker at the described spawn position;
3. the traversable domain appropriate to the movement mode.

Show the complete intended playable footprint, not a crop matching the entry frame. The spawn marker may occupy a small entry portion of the plan, while middle, side/rear, and remote off-camera areas remain visibly available for exploration.

For open ground, shade the entire collision-free walkable area instead of inventing a preferred lane. For a real constrained connection, show only the actual continuous path. For flight, underwater, or a custom mode, show the top-down projection of its genuinely traversable domain without rails or ground paths.

Remove every other overlay or annotation: no identity colors, target highlighting, labels, title, legend, scale, elevation values, dimensions, coordinates, grid, camera cone, route nodes, arrows, callouts, UI, logo, or watermark.

## Entry composition intent target

Generate one geometry-readable entry composition intent target using the reference images and the completed Brief. Despite the historical file name `entry-whitebox-target.png`, this image is not runtime evidence and must never be presented as the actual whitebox. Preserve complete-subject silhouette, landmark scale, navigation openness or real constrained connection, depth order, occlusion, and the strict centered third-person rear composition. The actual whitebox is captured only from the verified Babylon Runtime.

Use the same neutral clear daytime inspection lighting for every entry whitebox target, regardless of whether the uploaded reference depicts night, sunset, backlight, fog, space, an interior, or another dark condition. Use a bright neutral sky/fill, a consistent daylight key, readable midtones, and soft shallow shadows so every terrain and structure silhouette is visible. Never copy the reference image's time of day, exposure, darkness, colored illumination, or dramatic contrast into the whitebox target. This rule applies only to the whitebox planning/capture stage; the later styled first frame may restore the user's reference lighting and style.

All terrain, support surfaces, structures, and unselected components are neutral white or light gray. Color only the 1–5 complete Brief targets using the fixed target-order colors above. One multi-part target uses one color across the whole object; one repeated target uses the same color for every identical complete instance. Do not color generic terrain, ordinary decoration, helper geometry, or unselected objects. Include no labels, UI, logo, watermark, or alternate view.

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

If it fails, read the JSON diagnostics, repair the Brief and regenerate both PNGs inside this same task, then rerun the checker. Use at most three self-repair cycles and never finish with a failed or stale receipt. The receipt hashes all three outputs, so any edit after a passing check requires another check. Inspect the entry target as well: the primary Subject must be exactly centered and seen straight from behind; “approximately centered” is a failure.

The trusted Host replays this same checker and the canonical Brief parser once after delivery. It never starts a separate Planner Repair Agent. The Builder owns all subsequent technical spatialization.
