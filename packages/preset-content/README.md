# Preset content

Reusable scene, vehicle, character and profile modules consumed by the SDK
Playground and Creator. This package provides content, not another runtime owner.

- `src/vehicles/<vehicle>/`: each vehicle's `spec.ts` and `model.ts` together;
  shared mechanical animation, seating and powertrain definitions stay in `src/vehicles/`.
- `src/creatures/` and `src/humanoid/`: supplied creature and humanoid bindings.
- `src/environment/`: calibration scenes, spatial definitions and scenario preparation.
- `src/profiles/`: typed profile parsing and application.
- `src/assets/`: asset catalog and resource access; `src/ui/`: shared presentation helpers.
- `src/config.ts`, `src/models.ts`, `src/world.ts`: shared definitions and content assembly.
- `config/`: saved profiles, presentation defaults and project asset declarations.

Public export names stay stable while their targets follow this structure. Model
and profile data are unchanged by the layout. Asset registration that connects
this package with Creator remains in repository `scripts/assets`.

Run `pnpm dev` at the repository root for the SDK Playground. Use
`examples/three-creator/custom-vehicle` for a standalone Creator world.
