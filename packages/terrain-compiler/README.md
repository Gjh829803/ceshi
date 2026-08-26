# `@whitebox-world/terrain-compiler`

Deterministic trusted-Host compilation for image-generated WorldKit terrain Height
Intent. This package turns an untrusted signed-color PNG plus Canonical AuthoringSpec V4
constraints into finite metric height samples and a hash-bound diagnostic report.

## Supported API

Import only from the package root:

```ts
import {
  compileTerrainHeightIntentV0,
  type CompileTerrainHeightIntentInputV0,
  type CompileTerrainHeightIntentResultV0,
} from "@whitebox-world/terrain-compiler";
```

Internal PNG decode, signed projection, scalar filtering, resampling, constraint
mutation, and CLI modules are not supported subpath APIs.

## Data flow

```text
Planner or Host image generation
  -> untrusted signed Height Intent PNG
  -> canonical RGB and signed scalar projection
  -> scalar-space low-pass and grid resampling
  -> metric mapping around Authoring baseHeightMeters
  -> Water / Spawn / Landmark support / Route constraints
  -> final AuthoringSpec copy plus diagnostic report
```

The package never calls an image provider and never creates Runtime, Babylon, or Havok
objects. Runtime consumes only final Authoring height samples.

## Developer CLI

From the repository root:

```bash
pnpm terrain:intent:compile -- \
  --image /absolute/height-intent.png \
  --authoring /absolute/authoring.json \
  --output-authoring /absolute/authoring.compiled.json \
  --report /absolute/terrain-height-intent-report.json
```

Outputs are published transactionally. Existing outputs require `--force`.

## Ownership map

- Planner prompt semantics:
  `.codex/skills/worldkit-spatial-planner/references/terrain-height-intent-prompt.md`
- accepted family-specific visual references:
  `assets/terrain-height-intent/golden-exemplars.json`
- exploratory evidence: `artifacts/terrain-experiments/<case-id>/`
- formal hosted outputs: `artifacts/scenes/<scene-id>/`
- architecture:
  `docs/superpowers/specs/2026-08-26-terrain-compiler-package-and-asset-ownership-design.md`

Search terms: terrain compiler, Height Intent, signed height raster, terrain raster,
heightfield, normalization, terrain constraints, golden exemplar, terrain experiment.

## Verification

```bash
pnpm exec vitest run packages/terrain-compiler/src/**/*.test.ts
pnpm verify:workspace-boundaries
pnpm test:census
pnpm typecheck
```
