# `@whitebox-world/terrain-compiler`

Deterministic trusted-Host compilation for image-generated WorldKit terrain Height
Intent. This package turns an untrusted signed-color PNG plus Canonical AuthoringSpec V4
constraints into finite metric height samples and a hash-bound diagnostic report.

## Supported API

Import only from the package root:

```ts
import {
  compileTerrainHeightIntent,
  type CompileTerrainHeightIntentInput,
  type CompileTerrainHeightIntentResult,
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

## Admission and status semantics

Compiler profile `terrain-height-intent-compiler@2` fails closed when the projected
source colors exceed either the mean `60 RGB units` or p95 `90 RGB units` residual
limit. Failure emits `TERRAIN_INTENT_COLOR_RESIDUAL_EXCEEDED` and returns neither an
output Authoring hash nor a compiled AuthoringSpec. These limits match the earlier
Planner self-check, so the package API and `pnpm terrain:intent:compile` cannot bypass
the hosted transport-color gate.

`status: "passed"` means PNG transport, signed-ramp admission, deterministic scalar
projection, and declared Authoring constraints passed. It does not prove that the image
captured the intended semantic topology or opening composition. Formal hosted acceptance
still requires the receipt-bound Planner check, trusted Route validation when declared,
Runtime capture, and composition/visual inspection.

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
