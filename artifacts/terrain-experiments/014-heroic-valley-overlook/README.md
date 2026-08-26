# 014 Heroic Valley Overlook terrain intent experiment

This folder is exploratory evidence, not a fourth formal Planner artifact. The source perspective
image was supplied by the user and passed to OpenAI Image 2 through Codex built-in image generation
as the sole `primary-coordinate` reference.

- source basename: `exec-a03da965-9acc-4aa7-8cee-1e613f1a01c7.png`
- source SHA-256: `59722a872ef700a410525c7534beb7b2c8c9a3d1b4edf70b1ec0a2c1b494ed62`
- V1 output SHA-256: `aa2f56e5ef4d7a0393201325199f02e4ccafb6f7bf0ecbca137c3e664783a491`
- V2 output SHA-256: `74ee81d00642a9d9236eef46230342ec9da6c091e0a0c9d26664f1dc2d16f66c`

## Result

V1 preserved a useful branching valley topology but retained terrain-render-like microtexture and
made the intended bottom-center entry support a near-maximum narrow mound. V2 used V1 as an edit
target, preserved its macro topology, and removed much of the microtexture. The requested entry
height range still drifted upward, so the Host-derived spawn support remained authoritative.

| Measurement | V1 | V2 |
| --- | ---: | ---: |
| mean RGB-to-ramp residual | 25.8545 | 39.0327 |
| p95 RGB-to-ramp residual | 58.8787 | 59.7636 |
| mean scalar neighbor delta | 0.00964 | 0.00596 |
| p95 scalar neighbor delta | 0.02922 | 0.01705 |

The V2 compiler path applies a `[3px, 5px]` separable scalar low-pass before resampling the square
`1254 x 1254` proposal to a `161 x 121` grid over `320m x 240m`. It emitted `19,481` finite metric
samples without Diagnostics. The final narrow entry-support region changed `66` samples with a
maximum `4.5622m` correction. Canonical validation and Layout validation both pass.

`runtime-opening-v3-overlook.png` is the final matching capture for the committed Authoring input.
It proves a stable elevated entry and distant macro relief, but it does not reproduce the source's
wide visible valley from the opening camera. The other captures retain failed framing/support
iterations. This case is therefore **transport-passed, opening-composition partial**, not an accepted
image-matching example.

The important failure is semantic rather than pixel noise: deterministic filtering removed local
texture, but it could not make a stochastic near-maximum mound obey the requested broad `+0.45..+0.60`
entry anchor. That must remain a measured rejection or Host constraint, not another blur pass.
