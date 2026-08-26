# Green Sahara Caravan hosted case

This directory contains the formal Scene Brief, Planner and Builder receipts, Builder-authored
input, Host-compiled Canonical AuthoringSpec, terrain compilation evidence, implementation map,
trusted build output, and Runtime opening capture. The three Planner image inputs live under
`apps/playground/public/scene-plans/green-sahara-caravan`.

`authoring.builder.json` preserves the exact Builder output. The trusted Host compiles the
Planner's `terrain-height-intent.png` through `@whitebox-world/terrain-compiler` and atomically
publishes `authoring.json`, `terrain-height-intent-report.json`,
`terrain-compilation-manifest.json`, and `final-authoring-self-check.json`. Runtime consumes only
the final metric height samples; it never reads the PNG.

## Current verification state

- Planner self-check with prompt and Height Intent hashes: passed.
- Builder self-check against `authoring.builder.json`: passed.
- Median-datum terrain compilation and constraint repair: passed.
- Final Authoring self-check: passed.
- Canonical build: passed (`sha256:f3744c0035e03035145817279170e38707b52add3f6494118df54a49cf3f7ca2`).
- Runtime opening capture and third-person entry validation: passed.
- Grouped city tri-view: non-empty.
- Grouped composed Subject tri-view: blocked by the generic first-capture WebGL framebuffer
  readback timing defect (`WORLDKIT_CAPTURE_TRIVIEW_EMPTY: visual-target-1`). The playable world,
  final AuthoringSpec, Height Intent compilation, and opening capture are unaffected. No unrelated
  SDK Runtime workaround is included in the terrain integration.

The task target is the supported `city-gate-arrival` Anchor in front of the main gate. Completion UI,
reward state, and mission state machines remain outside the current AuthoringSpec capability and are
not simulated here.
