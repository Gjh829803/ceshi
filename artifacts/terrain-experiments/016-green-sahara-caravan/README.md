# 016 Green Sahara Caravan terrain intent experiment

This directory preserves the Height Intent candidate comparison that selected the input now used
by the formal hosted case in `artifacts/scenes/green-sahara-caravan`. It is immutable development
evidence, not a production workflow stage. The V1/V2 labels below identify experiment candidates;
they are not supported compiler API versions or compatibility modes.

## Source and ownership

- source basename: `023_green_sahara.png`
- source SHA-256: `171fe5e82baa1e03ce11b088a867b4290601304e822445fec5e43b5225ca92c6`
- spatial authorities: source reference plus
  `apps/playground/public/scene-plans/green-sahara-caravan/world-plan.png`
- generator family: OpenAI Image 2 through Codex built-in image generation
- formal Builder input is preserved as `artifacts/scenes/green-sahara-caravan/authoring.builder.json`
- formal Host output is `artifacts/scenes/green-sahara-caravan/authoring.json`
- selected runnable Height Intent derivative: `authoring-v1.compiled.json`

## Inputs

- V1: source scene reference plus the Planner world plan.
- V2: the same two spatial references plus the accepted `013` canyon signed-color V4 image as an output-style-only golden reference.

## Deterministic measurements

| Candidate | Raw mean ramp residual | Raw median ratio | Normalized median ratio | Canonical validation |
| --- | ---: | ---: | ---: | --- |
| V1 | 52.1535 | +0.1711 | 0.0000 | pass |
| V2 golden-ref | 32.1738 | +0.1924 | 0.0000 | pass after exact arrival support height |

Both candidates used scalar-space low-pass filtering, median datum centering, clipping to
`[-0.45, +0.55]`, deterministic metric mapping, and an 81-sample protected spawn support patch.
The case-local parameters and byte identities are frozen in `normalization-receipt-v1.json` and
`normalization-receipt-v2.json`. The production compiler now owns median-datum normalization;
these case-local normalized files remain only as comparison evidence.

The generated raster is an untrusted macro-shape prior. The normalized PNG is projected onto the
frozen signed ramp before metric compilation; Runtime never consumes the PNG.

## Rendered judgment

V2 follows the signed-color transport style more closely, but transfers excessive canyon-like
relief into the desert world. Its near-spawn terrain occludes the lower controlled Subject in the
opening frame and its outer relief competes with the oasis city. V1 retains a clearer broad approach,
keeps the controlled Subject readable, and better matches the requested gently undulating desert.

## Selection

Use V1 for the Green Sahara runnable scene. Keep V2 as evidence that a golden output image improves
encoding consistency but cannot guarantee spatial or amplitude consistency. Golden exemplars should
be selected by compatible terrain family and remain style-only references; deterministic Host gates
remain authoritative.

## Reproduce the selected V1

From the repository root:

```bash
pnpm terrain:intent:compile -- \
  --image "$PWD/artifacts/terrain-experiments/016-green-sahara-caravan/height-intent-image2-v1-normalized.png" \
  --authoring "$PWD/artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.json" \
  --output-authoring "$PWD/artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.compiled.json" \
  --report "$PWD/artifacts/terrain-experiments/016-green-sahara-caravan/terrain-height-intent-report-v1.json" \
  --force

pnpm worldkit validate \
  artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.compiled.json

pnpm worldkit layout validate \
  artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.compiled.json

pnpm worldkit capture \
  artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.compiled.json \
  --output artifacts/terrain-experiments/016-green-sahara-caravan/runtime-opening-v1.png \
  --snapshot artifacts/terrain-experiments/016-green-sahara-caravan/runtime-snapshot-v1.json
```

To inspect interactively:

```bash
pnpm worldkit run \
  artifacts/terrain-experiments/016-green-sahara-caravan/authoring-v1.compiled.json
```

## Frozen hashes

- V1 Prompt: `9f3694f75e2cfa2ba3d8753b9957e24faf7afd87cb5bbca6ccacbfdab55ce240`
- V1 raw Image2 output: `5a8beb33f0a21f5b3af6753c5448161688fa731e490991b537436e0b05869908`
- V1 normalized raster: `92e2eb9be5dde786c6ef5570dd6bff0e824150075172042ec950fc6a331c2f06`
- V2 Prompt: `74fd3e91b8f26e890717618c5ffcef327ca7e3a0a59698e9134b4e05a20d6e81`
- V2 raw Image2 output: `a50f635b08e82951916d1c081bd645d69720bfe4df277d4cb9a2e544de51be16`
- V2 normalized raster: `110d48c1cf247d68fa0564a16f4c654d28e15c1d40d355915e65bcfdefc33d2f`

## Evidence boundary

- Both deterministic reports passed without Diagnostics after their matching exact support heights.
- Canonical validation and the V1 layout gate pass.
- Runtime captures used SwiftShader and are valid static whitebox evidence, not performance evidence.
- V2 remains a rejected visual candidate and intentionally has no committed compiled AuthoringSpec.
