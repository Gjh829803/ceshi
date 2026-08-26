# 013 Grand Canyon Courier terrain intent experiment

This folder is exploratory evidence only. None of these generated images is a Runtime input or a
formal fourth Planner artifact.

## Source

- source basename: `013_grand_canyon_courier.png`
- source SHA-256: `85adf88b8579eee87f16abbe3202d544baf21949e60ac95467ea543357007f4e`
- generator family: OpenAI Image 2 through Codex built-in image generation

## Iterations

| Output | Encoding change | Result |
| --- | --- | --- |
| `height-intent-image2-v1.png` | relative grayscale | useful macro topology, but copied static silhouettes and rock-like detail |
| `height-intent-image2-v2.png` | grayscale with static exclusions and fixed datum | silhouettes improved; whole field drifted upward and made the spawn positive |
| `height-intent-image2-v3.png` | grayscale plus explicit regional values | still reversed important signs; spawn mean luma was `185.8` and left support `158.1` |
| `height-intent-image2-v4-signed-color.png` | continuous signed blue-gray/orange-gray ramp | correct sign for all sampled semantic regions; no discrete contour layers |
| `height-intent-image2-v5-signed-color.png` | same signed ramp with a frozen, hashed prompt | central corridor and right pedestal signs were correct, but the left support became a positive mound and the foreground basin drifted toward datum |

## V4 measurement

Pixels were projected to the nearest point of
`RGB(32,64,208) -> RGB(128,128,128) -> RGB(224,96,32)`, producing a scalar in `-1..+1`.
Patch bounds are exploratory normalized rectangles, not future compiler fixtures.

| Region | Mean projected scalar | Negative | Datum | Positive |
| --- | ---: | ---: | ---: | ---: |
| bottom-center spawn | -0.926 | 100.0% | 0.0% | 0.0% |
| foreground basin | -0.602 | 100.0% | 0.0% | 0.0% |
| left static-landmark support | -0.082 | 58.0% | 31.7% | 10.3% |
| central corridor | -0.462 | 94.0% | 5.5% | 0.4% |
| right pedestal | +0.740 | 1.4% | 6.7% | 92.0% |
| far canyon wall | +0.862 | 0.0% | 1.4% | 98.6% |

Global scalar neighbor delta was `0.0040` mean and `0.0122` p95, consistent with a smooth field.
RGB-to-ramp residual was `26.94` mean and `39.97` p95, so the deterministic compiler must project
onto the declared ramp and the team must establish a rejection threshold from more fixtures.

V1 SHA-256: `ec3212f13afd796e5047f8dbff33b633f9b366d5737375d4421940eaca066cc3`

V2 SHA-256: `b376fe99231d88499ba3855af82a866a1282b66c2364ed4788051b730d4b8cf9`

V3 SHA-256: `09bdc3f3ab3a07af583d968984d3925b37868d6d805fca06821c8b050916276c`

V4 SHA-256: `2dd65d5e77809b31a6ede814d84c9e04a2940ce0e64e20ead0bfde917e65f4cc`

V5 prompt SHA-256: `5acf7159d3946aeda8ac7c849e2635f37f15e9ff614861eb64c204fc4532bd55`

V5 output SHA-256: `37e0117e041393db4cba10f93887758d4f0325c07c8f1c669074d3d2468e9a4e`

V5 projected scalar measurements:

| Region | Mean projected scalar | Contract result |
| --- | ---: | --- |
| bottom-center spawn | -0.025 | fail: requested a clearly negative support basin |
| foreground basin | -0.013 | fail: mixed sign and mostly datum |
| left static-landmark support | +0.483 | fail: model created a raised mound |
| central corridor | -0.277 | partial: correct sign, weaker than requested |
| right pedestal | +0.729 | pass sign, slightly stronger than requested |
| far canyon wall | +0.305 | partial: positive mean but mixed sign |

V5 ramp residual was `39.64` mean and `61.58` p95. Scalar neighbor delta remained smooth at
`0.0044` mean and `0.0130` p95.

## Prompt pressure test

Five isolated Planner contexts read the current Prompt V0 and were given the same two-view canyon
case with deliberate screen-space drift. All five independently produced the intended contract:

- exactly one `primary-coordinate` view and one `secondary-evidence` view;
- semantic/topological registration rather than pixel averaging;
- one canonical output raster using the continuous signed ramp;
- lakebed height separated from water coverage/surface semantics;
- static spire silhouette omitted while support ground remains;
- existing planning data and the deterministic Host remain hard-constraint authority; and
- unresolved cross-view conflict never becomes an invented compromise location.

The repeated open questions were correctly identified as missing case inputs rather than silently
invented answers: world bounds/orientation, exact Host height anchors, right-mesa ownership, whether
the revealed basin actually contains water or connects to the central valley, and the future
color-residual rejection threshold.

## V0 deterministic Host compiler

The development-only compiler now implements the complete Prompt V0 transport path without adding a
public Terrain Source or Runtime API:

1. `sharp` decodes the PNG and normalizes it to canonical sRGB bytes;
2. the Host projects RGB to the frozen signed ramp and records residual statistics;
3. a deterministic separable box low-pass is applied in scalar space, then the filtered raster is
   bilinearly resampled to the declared Authoring terrain grid;
4. signed ratios are mapped through the explicit minimum / datum / maximum metric heights;
5. Water, Spawn, static Landmark support, and required Route constraints are applied in fixed
   priority order; and
6. the matching Terrain receives finite `heightSamplesMeters` plus a hash-stable report.

The Canyon fixture uses a `240m x 180m` world and a `129 x 97` grid, or `1.875m` per cell on both
axes. Top image pixels map to world `-Z`; bottom pixels map to world `+Z`. It declares no Water.

Reproduce the accepted V4 compilation from the repository worktree:

```bash
pnpm terrain:intent:compile -- \
  --image "$PWD/artifacts/terrain-experiments/013-grand-canyon-courier/height-intent-image2-v4-signed-color.png" \
  --authoring "$PWD/artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.json" \
  --output-authoring "$PWD/artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.compiled.json" \
  --report "$PWD/artifacts/terrain-experiments/013-grand-canyon-courier/terrain-height-intent-report-v0.json" \
  --force
```

Accepted V4 evidence:

- report status: `passed`, with no Diagnostics；这里的 `passed` 只覆盖 PNG transport、确定性
  scalar projection 和 Authoring required constraints，不表示自动通过宏观拓扑/视觉语义验收；
- scalar prefilter: `separable-box`, with automatic radii `[4px, 6px]` for this asymmetric target;
- `12,513` finite height samples in `[-45m, 90m]`;
- Spawn: `169` edited samples, maximum delta `27.0m`;
- left Landmark support: `72` edited samples, maximum delta `4.3641m`;
- right Landmark support: `356` edited samples, maximum delta `68.1793m`;
- Route: `633` edited samples, maximum delta `74.7391m`, within the declared `30 degrees` limit;
- `worldkit validate` and `worldkit layout validate`: passed; and
- final SDK Runtime capture: `runtime-opening-v1-smoothed.png`, with its receipt in
  `runtime-snapshot-v1-smoothed.json`. `runtime-opening-v0.png` preserves the prefilter-before
  comparison. Both captures used SwiftShader, so they are valid static whitebox evidence but not a
  rendering-performance measurement.

The frozen V5 negative prompt result also compiles without Diagnostics only because the Host applies
non-zero protected-region edits: Spawn `19.6374m`, left support `15.9856m`, right support `48.7800m`,
and Route `16.8571m` maximum deltas in the isolated trial. That does not make V5 the preferred macro
shape. V5 still has the previously measured semantic sign drift and higher ramp residual, so V4
remains the accepted development input. V0 has no learned/topology-quality threshold that can infer
the intended sign of an unconstrained Landmark support; this remains explicit Planner/Host authority.

The tests cover ramp projection, PNG normalization, asymmetric resampling, metric mapping, all
protected constraint types, route edge and bend adversaries, deterministic replay, compilation,
transactional CLI publication, malformed inputs, and test-gate census registration.

## Current conclusion

Keep continuous signed color as the leading Prompt V0 transport candidate because its sign is easier
to inspect than grayscale, while retaining grayscale results as comparison fixtures. This is not a
visual terrain palette or semantic color segmentation.

V4 versus V5 proves that signed color does not make the image model a numeric heightfield compiler.
The generated image is a stochastic macro-shape prior. A deterministic Host must project color back
to a scalar field, derive protected spawn/route/support regions from the existing planning data,
enforce their height and slope constraints, then emit metric terrain samples. Reject candidates whose
macro topology contradicts those controls instead of trying to repair them through more prompt prose.

The exact exploratory V1-V4 prompts were not frozen before generation, so those outputs are not
reproducibility fixtures. V5 is the first candidate with a frozen prompt and hashes; it is a useful
negative fixture rather than an accepted terrain.
