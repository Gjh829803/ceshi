# Preset content

Reusable scene, vehicle, character and profile modules consumed by the SDK
Playground and Creator. This package provides content, not another runtime owner.

- `src/vehicles/<vehicle>/`: procedural models and readers for composed specs;
  shared mechanical animation and model construction stay in `src/vehicles/`.
- `src/creatures/` and `src/humanoid/`: supplied creature and humanoid bindings.
- `src/environment/`: calibration scenes, spatial definitions and scenario preparation.
- `src/control/`: shared static handling defaults, typed control profiles, source-aware
  resolution and application. `src/control/defaults/` splits shared defaults into ground,
  water, aircraft and creature domains; `src/profiles/` and `shared-defaults.ts` are
  compatibility re-exports and do not own data.
- `src/assets/`: asset catalog and resource access; `src/ui/`: shared presentation helpers.
- `src/config.ts`, `src/models.ts`, `src/world.ts`: shared definitions and content assembly.
- `config/presets/`: engine handling, powertrain, input hints and camera defaults.
- `config/integrations/`: exact subject-version bindings, selection and field ownership.
- `config/`: consumer profile overrides, presentation defaults and scene placements.
- `config/generated/`: deterministic compile-time snapshots from
  content facts in `asset-library/subjects/**/facts/`, subject bindings and engine presets. Run `pnpm content:sync`
  to regenerate; `pnpm content:check` rejects stale snapshots. Do not edit these files.

The asset library owns seats, envelopes, wheel geometry, collision and ground-contact
facts. This engine package owns handling, powertrains, input and camera calibration.
`config/integrations/subjects.json` declares exact versioned subject selection and order.
`config/scene-placements.json` owns this calibration scene's spawn, yaw, color
and spacecraft docking locations. `config/profiles.json` is an optional consumer
override store; it does not replace engine defaults. SDK generic controller
defaults and runtime algorithms remain in `@worldkit/three`.
Changes to SDK factory defaults do not rewrite engine presets. Update the preset
explicitly when adopting new defaults. See [ownership and composition](config/integrations/README.md).

Public export names stay stable while their targets follow this structure. Model
and profile data are unchanged by the layout. Asset registration that connects
this package with Creator remains in repository `scripts/assets`.

Run `pnpm dev` at the repository root for the SDK Playground. Use
`examples/three-creator/custom-vehicle` for a standalone Creator world.
