---
name: worldkit-canonical-builder
description: Build or repair WorldKit Canonical AuthoringSpec V4 and Scene Brief implementation maps using the repository's supported subjects, terrain, structures, camera, traversal, and runtime resource choices. Use for the Canonical Builder stage; do not use for semantic planning, image generation, or post-whitebox styling.
---

# WorldKit Canonical Builder

Use this skill as the sole authoring guide for the Canonical Builder stage. Its maintained references contain the complete supported choices and templates needed for authoring.

Every generated whitebox world uses `world.environment.preset: "clear-day"`. This is a fixed neutral daytime inspection-light contract, not an interpretation of the reference image. Never copy night, sunset, fog-darkness, interior exposure, space darkness, or colored reference lighting into Canonical whitebox runtime lighting. Reference lighting returns only in the later styled first-frame stage.

## Authority boundary

Inputs are the validated natural-language `scene-brief.md`, `visual-identity-palette.json`, `world-plan.png`, and `entry-whitebox-target.png`. These are hosted-workflow intent inputs, not Canonical world authority and not a replacement for the repository's formal WorldSpec/plan-lock workflow. The Builder owns all numeric spatialization and emits the first Canonical authority for this hosted path: AuthoringSpec V4. The trusted Host remains authoritative for normalization, compilation, route evidence and runtime capture.

Create only:

- `artifacts/scenes/<scene-id>/authoring.json`
- `artifacts/scenes/<scene-id>/implementation-map.draft.json`

Do not edit the Scene Brief, palette, or planner images. Do not add Babylon, Havok, Three.js, mesh, GLB URL, bone, clip, collider-handle, compiler, or runtime implementation fields to Canonical JSON.

## Required references

Read these files completely before writing either output:

1. [references/resource-catalog.md](references/resource-catalog.md) for supported subjects, cameras, primitives, environments, and resource-selection policy.
2. [references/controlled-subjects.md](references/controlled-subjects.md) for deciding when equipment belongs to the controlled Subject, creating one bound composite Subject, and excluding appearance-only accessories.
3. [references/terrain-and-structures.md](references/terrain-and-structures.md) for complete-world coverage, connected exploration, terrain, routes, bridges, platforms, ramps, water, and holistic landmarks.
4. [references/spatial-and-placement.md](references/spatial-and-placement.md) for Canonical regions, routes, screen regions, fixed/solved placement, and the supported S1 constraints.
5. [references/canonical-template.md](references/canonical-template.md) for the closed AuthoringSpec V4 shape, camera/startup binding, Route R1/R1B fields, and implementation-map format.

## Implementation priority

1. Read the brief's explicit movement mode, then select the controlled Subject class and motion envelope so route width, slope, clearance, spawn support, and camera scale use the right constraints.
   - A playable ground humanoid uses `worldkit://subject-definition/humanoid.g-bot@1` by default.
   - `worldkit://subject-definition/humanoid.third-person@1` is a red static capsule proxy. Use it only when the user or brief explicitly asks for a primitive/capsule placeholder.
   - Never assume a resource name implies its rendered shape; follow the catalog.
   - Use only a resource whose current Registry entry implements the requested capability and whose authoring availability is suitable for the requested lane. Experimental entries may be evaluated explicitly, but must not be reported as production support. If no compatible resource exists, stop with a capability-gap diagnostic instead of substituting another movement model.
2. Build the complete described world, not only the entry-camera view. Infer practical bounds, levels, support surfaces, and clearances from the brief, reference images, motion mode, and planner images.
   - The entry Camera covers only an entry slice. Size the usable world from the request, visible evidence, inferred continuation, current terrain-cell guidance and resource budget. Do not infer quality from perimeter length or a fixed play-time estimate.
   - Do not create an empty oversized rectangle. Carry the Brief's terrain variation, spatial subareas, destinations, and explorable structures across the usable footprint while preserving open-domain rules.
3. Establish navigation before landmark detail. Open land remains fully traversable outside collision blockers. Only a visibly or verbally restricted connection receives explicit route supports. Flight, underwater, vehicle and other requests outside the current production phase remain explicit capability gaps unless the caller deliberately selects an experimental evaluation lane.
4. Create landmarks after world coverage and traversal are complete. Preserve each named whole target's semantic identity and use the smallest number of major masses that still reads as the intended complete object.
5. Bind exactly one startup-controlled Subject to exactly one spawn Anchor and one third-person Camera. The Camera target and `startup.controlledEntityId` must identify that Subject, including when it is a bound human-plus-equipment composite.
   - The opening pose is a strict centered rear view, not merely a generic third-person view. Put the spawn at yaw `0` so the Subject faces canonical `-Z`; arrange the entry destination/world forward on that same axis instead of rotating the Subject away from the camera.
   - Use zero lateral/shoulder/yaw offset. The camera-to-Subject horizontal direction must align with the Subject forward direction, and the controlled Subject's primary visual mass must project onto the exact vertical image centerline. A diagonal rear view or slight screen-space bias is invalid.
   - For ground-supported movement on Terrain, prefer a solved spawn Anchor constrained by a small `inside-region` spawn zone plus required `supported-by` Terrain and `within-slope-limit` constraints. A fixed Anchor is valid only when its Y equals the compiled support height. Never guess local height from `baseHeightMeters`. A spawn on a collision-enabled constructed surface must instead carry a satisfied required `supported-by` constraint for that structure and use its exact top support height.
6. Map exactly the 1-5 palette targets and nothing else. One complete target may map to a few runtime entity IDs. A `repeated-landmark` maps all intentionally identical complete instances into one target; decorative helpers do not receive their own mapping.
7. Use package-local primitive Prototypes only for current whitebox structure. Never invent a Registry ref or raw asset path.
8. Follow main's locked Subject control-feel authority. Registry Subjects inherit their published profile closure. Every package-local Subject Definition must declare an exact registered `controlFeelProfileRef`; never inline or guess acceleration, support, air-control, or camera-feel numbers.
9. Emit AuthoringSpec V4 so the trusted Host compiles ExecutionPlan V5 with its required data-only Gameplay Bootstrap Resource Lock. The Builder does not author that Host-owned lock. Keep `spatial.traversalAreas` and `constraints.connectivity` empty for open ground, flight, underwater, or any topology not covered by the current trusted Route implementation.
10. Use Route R1/R1B only for an explicitly constrained ground connection. R1 covers a complete ribbon on one Heightfield. R1B additionally covers an unambiguous single-layer chain of ordinary static box-based steps, decks, platforms, or ramps whose collision-enabled Prototypes declare exact `traversalSurfaceBindings` to `worldkit://traversal-surface-profile/ground.static@1`. Create stable start/destination Anchors, one route, and one required `connected-by-route` constraint. Do not claim dynamic platforms, overlapping/stacked walkable surfaces, bridge-underpass dual layers, caves, flight, or underwater connectivity.

## Hard capability and remaining budget gates

- Every emitted capability closure must use implemented runtime resources. Never emit `worldkit://capability/relationship.mount@1`, `relationship.seat@1`, or `relationship.tether@1`; those relationships remain reserved. Binding body and locomotion equipment means one maintained Subject with shared visual parts, not a relationship.
- The default Motion Kernel and Control Profile must use the same command kind. The two maintained bound Registry Subjects already lock `surface-slide.skimmer + throttle.subject-local` and `unpowered-glide.paraglider + flight.attitude`; reference them instead of reconstructing their closure.
- `maxVertices`, `maxTriangles`, and `maxColliders` are required hard budgets. The current compiler rejects every overrun; never describe triangle count as advisory.
- Keep `world.resourceBudget.maxVertices` at or below `120000`, target actual compiled use below `100000` vertices, and retain practical triangle and collider ceilings.
- Before finishing, reduce Terrain resolution, decorative Objects, unique major masses, or collision-enabled background geometry only when remaining validation, playability, vertex, or collider constraints require it. Reuse Prototypes for repeated complete instances.

## World completeness and traversal

- The Terrain grid and explicit support Objects together must cover the full described world. Do not omit side areas, rear areas, higher levels, or destinations merely because they are outside the opening frame.
- Interpret the brief's movement and navigation prose before creating route geometry.
- For open land, create continuous collision-enabled ground across the playable footprint. Keep the entire unblocked surface traversable; do not derive roads, lanes, walls, or ramps merely to demonstrate reachability.
- Do not emit flight, underwater, vehicle, cave or interior navigation as supported production behavior. An explicitly requested experimental evaluation must still use an implemented Registry closure and must not claim Route evidence for unsupported topologies.
- For an explicitly constrained Heightfield or eligible R1B static-platform connection, author Canonical `spatial.routes`, destination Anchors, and `constraints.connectivity`. The route ribbon must remain on the declared Heightfield and/or exact bound static traversal surfaces and clear real blockers for the selected Subject.
- For dynamic platforms, ambiguous overlapping/stacked walkable surfaces, bridge-underpass dual layers, caves, unsupported multi-level construction, flight volumes, or underwater volumes, keep `constraints.connectivity` empty. Provide physical collision where applicable without claiming unsupported Route evidence.
- `spatial.traversalAreas` is a bounded Heightfield navigation exclusion, not a replacement for physical collision. Use it only when the scene truly contains a blocked area on that surface.
- Keep the controlled Subject's footprint, clearance, slope limit, and movement style in mind. Open domains need collision clearance everywhere; constrained bridges/ramps additionally need practical width and slope.
- Do not spend geometry on ornament while any planned area, route, level, or required element is still missing.

## Visual identity grouping

- Treat each palette target as one complete visual object or one intentionally identical repeated set. Prefer one coherent Prototype/Object when a primitive can carry the silhouette; otherwise use only a few major masses and keep all of them in that target's single `runtimeEntityIds` mapping.
- Do not make roofs, columns, rings, supports, route slices, collision helpers, or repeated construction pieces independent identity elements. They remain parts of their owning complete object.
- Use the exact `visual-target-N` ID from `visual-identity-palette.json` as `visualTargetId` in the map. Runtime entity IDs remain descriptive Canonical IDs; they do not need to copy the target ID.
- The brief already selected 1-5 targets including the primary subject. Do not add generic terrain, ordinary repeated decoration, structural parts, or background filler to the map. Do not split identical repeated instances into separate visual targets.
- Default whitebox components are neutral white. Identity colors are host-owned capture metadata and must not be encoded in Prototypes, semantic classes, or entity names.

## Completion

Run the standalone validator bundled with this Skill:

```bash
node .codex/skills/worldkit-canonical-builder/scripts/self-check.mjs \
  --scene-id <scene-id> \
  --brief artifacts/scenes/<scene-id>/scene-brief.md \
  --world artifacts/scenes/<scene-id>/authoring.json \
  --map-draft artifacts/scenes/<scene-id>/implementation-map.draft.json \
  --report artifacts/scenes/<scene-id>/builder-self-check.json
```

This portable single-file checker is generated from the current repository source and contains Authoring V4 validation, normalization, layout solving, IR V4 / ExecutionPlan V5 compilation, data-only Gameplay Bootstrap construction, Registry closure and implementation-map checks. `scripts/agent-self-check.test.ts` verifies parity with the source implementation. It needs no repository checkout or `node_modules` in the cloud workspace.

If it fails, read its JSON diagnostics, correct only `authoring.json` and `implementation-map.draft.json` inside this same task, and run it again. Use at most three self-repair cycles. A repair must remove the exact rejected ref, fix the named placement, or reduce the measured vertex, triangle or collider cause; never return the same invalid content or raise an enforced ceiling. Never finish with a failed or stale receipt: the receipt hashes the Brief, AuthoringSpec and map draft, so rerun after every edit.

For every ground-supported movement mode, the compiled Subject's capsule feet must begin on an actual support surface. Terrain starts are sampled against the compiled Heightfield within the checker's tolerance; constructed starts require a satisfied `supported-by` layout assertion. The checker reports `SPAWN_BELOW_GROUND` or `SPAWN_ABOVE_GROUND` with `requiredSubjectOriginYMeters` for bad Terrain starts; repair the Anchor and rerun instead of relying on runtime falling or collision recovery.

The trusted Host replays the source-equivalent checker once after delivery and compares the receipt byte-for-byte. It does not start a separate Builder Repair Agent. When the receipt declares that trusted Route validation is required, the Host runs main's frozen R1/R1B Recast Graph/Path and real Babylon/Havok controller probe once before capture. A Route failure ends the case with diagnostics; it never launches a hidden repair job. The Host still owns Gameplay Bootstrap construction, final implementation-map promotion, build and real Babylon capture because those operations cross the trusted runtime boundary.

After capture, the trusted Host runs `scripts/validate-entry-third-person.py` against `opening-frame.png` and `runtime-snapshot.json`. It rejects a primary-subject mask whose horizontal center differs from the image center by more than 1.5%, a camera that does not target the controlled Subject, any opening yaw offset, or more than 1° between the camera-to-Subject direction and Subject forward. This runtime-only evidence cannot be produced inside the cloud Builder. A failure ends the case with diagnostics; the flow does not create a new Repair Agent. Treat it as a defect to fix in the next Builder run, not something to weaken or post-process around.
