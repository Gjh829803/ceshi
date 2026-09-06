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

Resume a failed cloud attempt with `scripts/three-episode/resume.ts`, passing
`--checkpoint-s3`, `--source-manifest`, `--output-root`, `--publish-s3`, and
`--stop-before-seedance`. Use the same absolute output root in the new isolated
Host. Closed six-clip captures are hash-verified before reuse. A Host-selected
`stylePlanCandidate` in the private runtime configuration is only an untrusted
draft for a fresh cloud task; it never bypasses independent delivery validation.
Launcher transport logs live outside the Agent workspace while the model runs.

When the SDK runtime changes, use `scripts/three-episode/rerun-runtime.ts` with
those same arguments plus a fresh `--episode-id`. Its predecessor must be a
closed failed checkpoint. It creates fresh planning, capture and review state;
only completed image recipes are staged, and exact input/file hashes still
control reuse. Optional `routePlanCandidate` requires the unchanged author
`sourceHash` and candidate `sha256`, and is re-submitted by the cloud Agent under
the current derived world hash. Never rewrite old recording provenance to make
it match a new runtime.

Native image generation uses one current whitebox reference per image. An accepted
anchor is converted by cloud Codex into a text appearance dictionary bound to the
anchor SHA256 and every ordered target ID. This prevents additional image layouts
from competing with the current camera/tri-view composition; subsequent reviewers
still compare the actual generated images against the accepted anchor. Histories
are namespaced by image-input policy, preserving failed earlier-policy evidence.

## User-calibrated review

`config/prompts/three-episode-review.md` now evaluates practical spatial/motion
correspondence, allowing modest framing, silhouette and decorative differences.
Reject material changes to camera/visible side, principal entities, route space,
readability or actual large-scale topology; do not turn cosmetic notes into failures.

`config/three-episode-review-calibration.json` records explicit user decisions for
exact opening-image hashes, world/plan/whitebox identities and policy version. Add a
new decision for subsequent user feedback; do not fabricate decisions from source
assets. Include this config and `review-policy.mjs` in the next frozen cloud release.
An exact user-accepted anchor can be reused without regeneration. Original cloud
verdicts remain unchanged; user admissions are separate records in histories and
outputs. They never approve later frames, tri-views or videos. A changed rubric first
re-evaluates the existing candidate before attempting another image, preserving the
old attempt count. Changing review instructions/acceptances invalidates only the
relevant review cache; it does not erase images or historical provider journals.

## Player input policy

`player-controller.ts` wraps the Agent's route with versioned player inputs:
brief look-around pauses, two moving side glances, small pitch changes, short
sprints/walk breaks and one locally probed jump on Segments 00/02/04 when the
subject supports it. Pause time is excluded from route-stuck detection. Local
capsule/support probes only inspect the current Agent edge; they are not a
ballistic clearance proof or a global navigation catalog. The SDK remains the
sole owner of physics, animation, camera collision and simulation time.

`health.json` measures rendered camera travel/range, actual movement with gait
inputs, and input-associated upward takeoff/landing. Missing visible camera
rotation, gait variation or a requested-but-uncompleted jump fails the capture.
Unsafe jumps are bounded deferrals, and unsupported actions remain explicit.
The full 30 seconds/720 frames/1800 ticks and untouched opening capture remain.

`playback-policy.mjs` is shared by capture recipes, cloud dispatch and workflow
resume. Bump it when controller behavior changes; an older completed capture
cannot bypass a new policy. Include the controller and shared policy in the next
immutable cloud worker release. A local recording is developer evidence, not a
cloud capture delivery. Image approvals remain bound to their original first
frame hashes; a new renderer or first frame never inherits them automatically.

For local review, `node scripts/three-episode/preview-server.mjs REPORT_DIRECTORY
53747` serves only that directory on loopback and supports native video seeking
with HTTP byte ranges. Keep its lifetime independent of a short shell session
when leaving the review page open for the user.

## One original-reference style plus nine reinterpretations

When a user original exists, package its exact bytes with `prepareEpisodeSource`
(`referenceImage: {path, sha256}`), or pass `--reference-image FILE
--reference-image-sha256 HASH` to the source CLI. It is a portable, hash-verified
source artifact independent of the scene/runtime identity. Never substitute the
whitebox, a generated concept, or an inferred style for a missing original.

The Style Director and independent reviews receive the original image. Exactly
one variant must use `styleMode: "source-reference"` and the exact
`referenceImageSha256`; its reserved ID defaults to `style-00`. A recovery may set
`referenceStyleVariantId` to another slot (this case uses `style-02`) to preserve
previously accepted IDs. Its subject, landmarks, materials, palette, illumination
and photographic/illustrative treatment follow the original. Nine other variants
remain diverse reinterpretations; do not count the original as an eleventh style.

ImageGen still receives only the current whitebox composition image. The Director
writes the observed original appearance into that slot's complete prompt and target
descriptions. Reviews compare the actual original, whitebox and output independently;
copying the original camera, retaining low-poly whitebox shading, or relabeling an
unrelated concept does not satisfy original-style fidelity. Subsequent views use
the admitted anchor's appearance dictionary as before. Original reference identity
participates in planning/review/cache identities; missing or corrupted references
cannot be admitted. Historical image approvals keep their existing scoped receipts.

## Resume selected anchors after a policy update

The optional runtime `anchorContinuation: {path,sha256}` names a frozen
`three-episode-anchor-continuation` manifest. It closes the exact source/runtime,
whitebox opening, current and historical style plans, ten images, spent attempts
and an explicit bounded additional budget (0–2 per slot). The new Director must
preserve all imported variant definitions. Every image is verified before reuse.
Original user decisions carry only across unchanged variant definitions and exact
opening bytes, with the original approval receipt retained; later frames still
need independent review. A changed world or opening fails closed.

`continue.ts` can seed an existing cloud Agent plan into a fresh run from its
actual `episode_submit_plan` receipt and original source manifest. It validates
source/runtime/scene closure and does not run a Host route planner. Normal cloud
capture, style reviews and pre-Seedance preparation then continue through
`workflow.ts`. Keep the immutable run inputs, logs and provider request journals.
