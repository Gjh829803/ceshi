# Agent Whitebox World authoring rules

## Security boundary

- Work only inside this repository. Do not read, list, search, or write any parent, sibling, home, or other external directory.
- Do not request sandbox escalation, add writable directories, or bypass the configured `whitebox_workspace_only` permission profile.
- Do not use Browser, Computer Use, connectors, MCP file resources, or other side channels to inspect local files outside this workspace.
- Reference images must be passed to Planner through `pnpm agent:plan -- --scene-id <catalog-id> --image /absolute/reference.png "<prompt>"` (or the compatible `agent:scene` entry). The trusted launcher copies only that explicitly named file into its disposable sandbox; never inspect the original external path from inside the scene task.
- Run `pnpm test:isolation` if the local Codex installation or project permission configuration changes.

## Goal

Create playable outdoor whitebox scenes through a gated multi-agent workflow. Planning, whitebox implementation, and visual styling are separate responsibilities; never collapse their authority by improvising geometry or editing SDK internals.

## Agent roles and frozen boundary

- **World Planner Agent** may create only `apps/playground/src/scenes/plans/<catalog-id>.ts` and its `world-plan.png` / `opening-shot.png`. It must define the complete WorldPrompt and Entity Catalog before geometry.
- The trusted host freezes those three inputs into `artifacts/scenes/<catalog-id>/plan-lock.json`. Do not create or edit the lock manually.
- **World Builder Agent** may implement and register the planned scene, but must not modify the frozen plan source, the two planning images, or the lock.
- **Visual Bible Agent** may create declared styled tri-views and `opening-frame-rendered.png` only after the whitebox implementation and SDK-derived tri-views are verified. It must not change geometry or the frozen plan.
- If a downstream stage cannot satisfy the contract, write `artifacts/scenes/<catalog-id>/change-request.json` using `defineWorldPlanChangeRequest` semantics. Do not repair the conflict by silently changing upstream artifacts.

## Scene workflow

1. Planner creates `apps/playground/src/scenes/plans/<catalog-id>.ts`, exporting one named `worldSpec = defineOutdoorWorldSpec(...)`.
2. Planner defines the whole playable world before geometry: bounds, relief, regions, water, landmarks, routes, assumptions, WorldPrompt, Entity Catalog and Opening Shot.
3. Planner uses Codex's built-in image generation tool to generate the World Plan and Opening Shot from the exact stored prompts. Save the real assets at `apps/playground/public/scene-plans/<world-spec-id>/world-plan.png` and `opening-shot.png`; never fabricate placeholders.
4. The host runs `pnpm plan:freeze -- --scene <catalog-id>` and `pnpm plan:check -- --scene <catalog-id>`.
5. Builder adds `apps/playground/src/scenes/<catalog-id>.ts`, exports `definePlannedOutdoorScene(...)`, implements stable matching Feature/Entity bindings, and registers it in `apps/playground/src/scenes/index.ts`.
6. Run `pnpm test:scenes`, `pnpm typecheck`, `pnpm build`, `pnpm plan:scene -- --scene <catalog-id>`, and `pnpm plan:scene:check -- --scene <catalog-id>`.
7. Open `http://127.0.0.1:5173/?scene=<catalog-id>`. Compare the three planning captures with intent, test playability, then export every Prototype's SDK-derived whitebox tri-view.
8. Visual Bible uses those tri-views and the verified manifest to create styled tri-views and the final rendered opening frame. Finish with `pnpm visual:finalize -- --scene <catalog-id>` and `pnpm visual:check -- --scene <catalog-id>`.

Do not modify `sdk-world-adapter.ts`, physics, camera, or rendering code merely to create a scene.

## Preferred APIs

- `world.terrain.landscape({ relief: ... })` for large terrain. Choose the relief from the user's scene: `flat` for cities and constructed ground, `plain` for gently rolling open land, `hills` for broad hill country, and `mountains` for intentionally steep regions.
- `world.terrain.rolling(...)` for small test terrain.
- `world.water.lake(...)` for elliptical lakes.
- `world.water.body(...)` for circle, ellipse, or polygon water boundaries.
- `world.landmark.compound(...)` for whitebox landmarks.
- `world.player.spawn(...)` exactly once.
- `world.atmosphere.set(...)` for sky/fog/sun semantics.

`world.player.spawn(...)` uses the SDK's Three.js-facing convention: `facingRadians: 0` faces `-Z`, while `Math.PI` faces `+Z`. For a composition-critical opening view, set `camera: { pitchRadians, distance, fovDegrees, targetHeight }`; a larger positive pitch looks farther downward. Supported pitch is `-0.95..0.65`, distance is `1.8..8m`, and target height is `0.5..4.5m`. Keep these as initial framing choices only—the SDK still owns runtime camera controls.

When built-ins are insufficient, define a local `defineWorldFeature(...)` and use only its tracked `BuildContext`. Register custom terrain through `world.terrain.custom(...)`. Never add opaque objects directly to `THREE.Scene` from a scene module.

## Required properties

- A valid `OutdoorWorldSpec` with exactly three artifact channels: Codex-imagegen World Plan, Codex-imagegen Opening Shot, and SDK-derived Height/Slope Plan.
- A complete `WorldPromptBundle` covering identity, spatial composition, environment, lighting, style, opening frame, invariants, and negative constraints.
- An Entity Catalog containing every meaningful subject, NPC, landmark, and object as a stable Prototype/Instance binding.
- Every Prototype must have a unique six-digit instance color, positive approximate size, `-Z` forward, a declared pivot, and canonical `front/right/back` whitebox and styled PNG paths.
- Explicit separation of user facts, visible reference evidence, inferred continuation, and optional render-layer ideas.
- A strict orthographic World Plan that communicates topology, not a decorative aerial perspective.
- An Opening Shot that records spawn, facing, pitch, distance, FOV, target height, and foreground/middleground/background composition. Reference-image scenes also require normalized semantic regions and runtime anchor targets in `composition.guide`.
- Primary routes declared in WorldSpec and kept at or below their slope limits.
- Stable, descriptive, unique IDs for every feature.
- A deterministic scene seed.
- A resource budget appropriate to terrain resolution.
- Semantic strings and appearance prompts for important terrain, water, and landmarks.
- A spawn point inside terrain and outside obvious water/landmark blockers.
- Large maps should use tiled terrain; preserve approximately 1.25–2.5 meters per heightfield cell unless the scene requires finer collision.
- Global noise is only the base surface. For reference-driven topology, prefer a tracked world-space `context.terrain.raster(...)` field plus `context.semantic.terrainLayer(...)` masks; shaped operations remain appropriate for simple local edits. Do not approximate a whole reference with a few broad circles.
- Shaped-operation `falloffWidth` fades across the inside of the shape toward its boundary; it does not spread outside the boundary. To author a long descent, include the whole descent inside the shape and place its boundary at the low end.
- Humanoids climb slopes up to 42°. Keep primary routes below 35° for margin, flatten the spawn area, and provide a continuous walkable corridor through hill or mountain scenes.
- For image references, reproduce the visible spatial composition and semantic silhouettes in whitebox form. Do not encode clouds, flowers, textures, painterly style, or other render-layer detail as collision geometry. A single view does not define hidden geometry, so create a coherent playable continuation and report important inferred areas.
- Treat the reference viewpoint as part of image matching: align spawn position, `facingRadians`, pitch, distance, FOV and target height before judging geometry. Browser-run the opening composition gate; feature presence and a passing overall score cannot override a failed required region or anchor.
- Do not ask image generation to invent the whitebox tri-view. It must be captured from the verified SDK runtime. The styled tri-view may be generated only from that structural reference.

## Current phase boundary

The authoring SDK currently targets outdoor heightfield worlds. Do not simulate interiors, vehicles, NPC behavior, caves, overhangs, or networking as if they were supported production features. Report those requirements as capability gaps.
