# Agent Whitebox World authoring rules

## Security boundary

- Work only inside this repository. Do not read, list, search, or write any parent, sibling, home, or other external directory.
- Do not request sandbox escalation, add writable directories, or bypass the configured `whitebox_workspace_only` permission profile.
- Do not use Browser, Computer Use, connectors, MCP file resources, or other side channels to inspect local files outside this workspace.
- Reference images must be passed through `pnpm agent:scene -- --image /absolute/reference.png "<prompt>"`. The trusted launcher copies only that explicitly named file into its disposable sandbox; never inspect the original external path from inside the scene task.
- Run `pnpm test:isolation` if the local Codex installation or project permission configuration changes.

## Goal

Create playable outdoor whitebox scenes by editing scene modules, not SDK internals.

## Scene workflow

1. Add `apps/playground/src/scenes/<scene-name>.ts`.
2. Export one `defineOutdoorScene(...)` definition.
3. Register it in `apps/playground/src/scenes/index.ts`.
4. Run `pnpm test:scenes`, `pnpm typecheck`, and `pnpm build`.
5. Open `http://127.0.0.1:5173/?scene=<catalog-id>` and visually verify it.

Do not modify `sdk-world-adapter.ts`, physics, camera, or rendering code merely to create a scene.

## Preferred APIs

- `world.terrain.landscape({ relief: ... })` for large terrain. Choose the relief from the user's scene: `flat` for cities and constructed ground, `plain` for gently rolling open land, `hills` for broad hill country, and `mountains` for intentionally steep regions.
- `world.terrain.rolling(...)` for small test terrain.
- `world.water.lake(...)` for elliptical lakes.
- `world.water.body(...)` for circle, ellipse, or polygon water boundaries.
- `world.landmark.compound(...)` for whitebox landmarks.
- `world.player.spawn(...)` exactly once.
- `world.atmosphere.set(...)` for sky/fog/sun semantics.

`world.player.spawn(...)` uses the SDK's Three.js-facing convention: `facingRadians: 0` faces `-Z`, while `Math.PI` faces `+Z`. For a composition-critical opening view, set `camera: { pitchRadians, distance }`; a larger positive pitch looks farther downward. Supported pitch is `-0.95..0.65` radians and distance is `1.8..8` meters. Keep these as initial framing choices only—the SDK still owns runtime camera controls.

When built-ins are insufficient, define a local `defineWorldFeature(...)` and use only its tracked `BuildContext`. Register custom terrain through `world.terrain.custom(...)`. Never add opaque objects directly to `THREE.Scene` from a scene module.

## Required properties

- Stable, descriptive, unique IDs for every feature.
- A deterministic scene seed.
- A resource budget appropriate to terrain resolution.
- Semantic strings and appearance prompts for important terrain, water, and landmarks.
- A spawn point inside terrain and outside obvious water/landmark blockers.
- Large maps should use tiled terrain; preserve approximately 1.25–2.5 meters per heightfield cell unless the scene requires finer collision.
- Global noise is only the base surface. Build valleys, ridges, basins, plateaus, and roads with explicit shaped operations; do not turn up global amplitude to imply a landform.
- Shaped-operation `falloffWidth` fades across the inside of the shape toward its boundary; it does not spread outside the boundary. To author a long descent, include the whole descent inside the shape and place its boundary at the low end.
- Humanoids climb slopes up to 42°. Keep primary routes below 35° for margin, flatten the spawn area, and provide a continuous walkable corridor through hill or mountain scenes.
- For image references, reproduce the visible spatial composition and semantic silhouettes in whitebox form. Do not encode clouds, flowers, textures, painterly style, or other render-layer detail as collision geometry. A single view does not define hidden geometry, so create a coherent playable continuation and report important inferred areas.
- Treat the reference viewpoint as part of image matching: align spawn position, `facingRadians`, camera pitch, and distance before judging whether terrain geometry is wrong. Browser-check the opening frame; feature presence alone is not visual proof.

## Current phase boundary

The authoring SDK currently targets outdoor heightfield worlds. Do not simulate interiors, vehicles, NPC behavior, caves, overhangs, or networking as if they were supported production features. Report those requirements as capability gaps.
