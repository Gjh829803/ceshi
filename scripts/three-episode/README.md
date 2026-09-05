# Three Episode production

This independent Host pipeline consumes an already delivered `three-sdk` world.
It does not add a Creator preview/recording gate. It creates six 30-second,
1280×720, 24 FPS recordings, ten visual styles, and sixty prepared rendering
requests. **Every executable entry requires `--stop-before-seedance`. No video
provider submission is implemented in this lane.**

## Boundaries

- `source.ts` verifies the closed Creator payload, preserves author source and
  compiled entries, and explicitly derives a new runtime/playable identity for
  older deliveries. It never overwrites the published world.
- `mcp.ts` supplies the actual `episode_observe`, `episode_probe`, and
  `episode_submit_plan` tools to the isolated cloud GPT-6/xhigh planner.
- `capture.ts` executes the planner's free coordinates through the same SDK
  input, Rapier physics, animation, camera and fixed 60 Hz clock. Six segments
  share one initialized browser/reset baseline. Each output frame is real;
  encoding never pads, interpolates or changes capture dimensions.
- `EpisodeFrame.captureSurface` is `world-renderer-canvas`. Independent DOM UI,
  UI canvases and displayed model output are excluded. UI already authored
  inside the original Three scene is still scene geometry and cannot be
  automatically separated.
- `capture-cloud.mjs` dispatches the isolated GPU capture child and retains
  successful segments across route repairs. Route decisions remain Agent-owned.
- `visuals.mjs` locks independently accepted style anchors, generates complete
  target tri-views and segment openings, prepares video-only events, and writes
  `pre-seedance-manifest.json`. All target IDs are retained.
- `cloud.mjs` persists exact request identities and unknown submission states.
  Do not delete journals or submit another job to get around a pending job.
- `outbox.mjs` is the delivery deduplication adapter. Automatic delivery-service
  subscription is not deployed by the single-case experiment; invoking the
  workflow currently creates its event. Creator-wide background production
  must not be described as enabled until an actual delivery consumer is wired.

## Source preparation

```sh
pnpm exec tsx scripts/three-episode/source.ts \
  --payload /absolute/verified/payload \
  --output /absolute/episode/source \
  --world-id case-id
```

The portable `source.json` records original and derived world/runtime hashes.
Only the new production copy receives the current SDK.

## Cloud execution

Freeze a toolkit, Linux dependencies, portable source, and
`scripts/three-episode/episode-runtime.json` under a unique FSx release directory.
Package the same release for a digest-pinned cloud Host image.
`.codex-tmp/three-episode-runtime.json` supplies launcher and source paths,
source hash, S3 prefixes, image digest, and bounded concurrency.
Provider credentials are materialized only from the Host's Kubernetes Secrets;
Planner MCP and Chromium receive no provider credentials.

Inside that isolated Host:

```sh
node scripts/cloud/three-episode-host.mjs --run \
  --import ./node_modules/tsx/dist/loader.mjs \
  scripts/three-episode/workflow.ts \
  --source-manifest inputs/source/source.json \
  --output-root output/episode \
  --episode-id episode-case-run \
  --publish-s3 s3://bucket/owned-run/host \
  --stop-before-seedance
```

`--until plan` and `--until capture` are optional earlier stops. Preserve
`output/episode` and its provider journals when resuming. The final report is
`output/episode/report/index.html`; it presents existing artifacts and truthful
production states. A provider job status alone is not a successful delivery.

## Validation

```sh
pnpm exec vitest run scripts/three-episode packages/three-world/src/episode.test.ts packages/three-world/src/presentation.test.ts
node --test scripts/three-episode/*.test.mjs
pnpm typecheck
pnpm test:census
```

Tests include actual stdio MCP and Chromium; cloud transport/image fixtures
verify contracts but are not real cloud generation evidence. See the dated
continuation plan and `.codex-tmp/three-episode-evidence/` for this run's evidence.
