# Three Episode production

Episode consumes a verified `three-sdk` delivery, plans routes and action goals,
and records the same controllers users operate. One case produces six 30-second
clips at 1280×720 / 24fps, ten visual styles and up to sixty video requests.
**Executable workflows require `--stop-before-seedance`; video provider
submission and automatic Creator delivery subscription are not implemented.**

## Source and runtime

```sh
pnpm three:episode:source \
  --payload /absolute/verified/payload --output /absolute/episode/source \
  --world-id case-id
pnpm three:episode:source --copy /absolute/episode/source/source.json --output /absolute/capsule/case
pnpm three:episode:source --verify /absolute/capsule/case/source.json
```

`source.ts` verifies the hash-closed delivery and creates a separate production
copy. Project-owned SDK runtime bytes remain authoritative. Source, playable,
reference images, target views and declared context form a portable dependency
closure; verify it again after archive transport/extraction. The output directory
must be new or empty. `source.json` records actual source/runtime/playable hashes.

Use `--reference-image FILE --reference-image-sha256 HASH` to carry the exact user
original for the source-reference style. Do not substitute a generated concept or
whitebox screenshot for that reference.

## Plan real actions

`episode_observe`, `episode_probe` and `episode_submit_plan` expose actual world
state and local testing to the planner. Inspect `characterCapabilities`, target
approaches, collision and water before planning. The plan schema is
`kind:"worldkit-three-episode-plan", schemaVersion:2`, with the actual
`worldBuildHash` and six ordered, distinct-start segments `segment-00`–`segment-05`.
Each segment has `start`, `waypoints`, `endBehavior`, `purpose` and optional
`coverageTargetIds` / `actionGoals`; see [contracts.ts](contracts.ts).

Each waypoint supplies `positionWorldMetersXYZ` and `gait:"walk"|"run"`.
`actionGoals` is an ordered list, triggered near a waypoint using real position.
It contains semantic intent, never a hard-coded keyboard chord. For example,
this segment fragment rolls at waypoint 0 and picks up at waypoint 1:

```json
{"actionGoals":[
  {"id":"roll-on-ground","trigger":{"waypointIndex":0,"radiusMeters":0.6},
   "intent":{"kind":"skill","action":"roll"},
   "completion":{"kind":"settled","holdSeconds":0.3},"timeoutSeconds":5},
  {"id":"take-parcel","trigger":{"waypointIndex":1,"radiusMeters":0.6},
   "targetId":"parcel","intent":{"kind":"skill","action":"pickup"},
   "completion":{"kind":"settled","holdSeconds":1},"timeoutSeconds":8}
]}
```

| Intent | Fields | Completion requirements |
| --- | --- | --- |
| Skill | `kind:"skill"`, `action:roll/slide/pickup/putDown/sit/standUp` | Operation succeeds and observed carry/seat state matches where relevant |
| Posture | `kind:"posture"`, `stance:stand/crouch/prone` | Actual stance/surface matches after transition |
| Climb | `kind:"climb"`, `direction:enter/exit/up/down/left/right` | Actual attachment/release; movement uses displacement completion |
| Swim style | `kind:"swim-style"`, `style:freestyle/breaststroke` | Actual swimming and matching style |

`completion` is either `{kind:"settled",holdSeconds}` after the requested state
has settled, or `{kind:"displacement",minimumMeters}` after actual displacement
and the requested state. Every goal has `timeoutSeconds`; rejection, cancellation,
missing target, unmet state and timeout fail the goal. Up to 32 goals are allowed
per segment, ordered by `trigger.waypointIndex`.

Scene constraints matter:

- **Slide:** use a run-up and a running waypoint before the trigger; actual speed
  must be ≥2.5 m/s. Place the next waypoint beyond the tunnel to provide continuing
  movement. Low ceilings require collision. Exit completes only after standing
  clearance; allocate enough time to leave the low section.
- **Pickup/sit:** specify `targetId`. Put the trigger within 2 m of its actual
  approach anchor; the controller approaches through input, then uses real
  eligibility. Supply the correct table/seat collision and grasp/seat geometry.
- **Crawl/climb:** enter the posture or surface first, then plan movement. Climb
  direction goals require displacement; `targetId` checks the intended surface.
  Leave room to stand or provide a safe descent/release route.
- **Swimming:** approach a declared deep-water volume with an actual lower floor.
  Entry is automatic; a swim-style goal cannot make a dry character swim.

Requests use `training.action` or a single semantic `training.input` pulse,
followed by the same fixed simulation ticks as live controls. Targets do not
teleport actors. A validated segment start may initialize position, facing and
mount state; subsequent movement follows actual input and collision.

## Recording and action evidence

`capture.ts` holds the SDK clock at 60Hz and captures 720 actual renderer frames
per segment. `EpisodeFrame.captureSurface` is `world-renderer-canvas`; independent
DOM UI and model output are excluded. Camera/animation/physics share the same
world. Encoding does not pad, interpolate or synthesize missing frames.

The recorder observes actions every simulation tick. Each segment writes:

- `action-timeline.json`: goal and target, command receipts, operation result,
  start/end tick and video frame, actual state changes and diagnostic.
- `trace.json`: input, positions, camera, state and the action timeline.
- `health.json`: capture/movement checks and each action goal's result.

`accepted` records dispatch, not completion. Only `succeeded` is complete;
`failed`, `cancelled` and `missing` must not become successful video events.
Action evidence is hash-bound to visual/event requests and enters event-prefetch
and render prompts. The controller permits valid stationary action segments;
recording health checks use action results rather than demanding continuous gait
variation from a seated or climbing character.

Ordinary route segments use `player-controller.ts` for brief looks, gait changes
and locally probed jumps where supported. Physical support/probes are local,
not global pathfinding. Successful capture segments remain reusable while their
source, runtime, plan and playback-policy identities match.

## Styles and request readiness

`visuals.mjs` prepares ten styles: one `source-reference` variant bound to the
exact reference-image hash, plus nine reinterpretations. An accepted anchor
supplies a text appearance dictionary for all ordered targets. Image generation
uses the current whitebox composition; reviews compare reference, anchor and
actual output independently.

Styles proceed independently through anchor review, openings, target three views,
material checks, events and six requests. `ready-render-requests.json` publishes
independently ready styles; `pre-seedance-manifest.json` contains the complete
sixty-request summary. Prompt completion, complete materials, prepared requests
and generated videos are distinct states.

User review applies to exact image/input identities. A changed image, opening or
world needs its own applicable review. `review-policy.mjs` and explicit calibration
records implement this scope; keep original provider receipts and bounded attempts.

## Cloud execution and queue

Configure the exact source archive hash, pinned image, S3 paths and cohort in
`.codex-tmp/three-episode-runtime.json`. Capsule settings belong in
`scripts/three-episode/episode-runtime.json`; credentials come from Host Secrets
and are not supplied to the planner or Chromium.

```sh
pnpm three:episode:batch register --cohort production-run --cases-file /absolute/episode-ids.json
pnpm three:episode:run \
  --source-manifest /absolute/episode/source/source.json \
  --output-root /absolute/episode/output --episode-id case-run \
  --cohort production-run --stop-before-seedance
pnpm three:episode:batch status --cohort production-run
pnpm three:episode:preview /absolute/episode/output/report 53847
```

`--until plan` and `--until capture` stop earlier. Planner observation uses CPU
SwiftShader; only recording requests GPU. One L4 slot records one Episode's six
segments. Admission batches 100 compatible tasks or the remainder when all cohort
producers are in known terminal states. A queue timeout is not terminal evidence.
Each cohort has a fixed roster, at most 250 cases and 850 KB state.

`batch-cli.mjs` supports register/status/terminal/reconcile, global pause/resume,
and cohort cancellation. Kubernetes compare-and-swap protects shared state.
`three-episode-batch-infrastructure.mjs` emits the digest-pinned worker's RBAC,
single-card pool, reconciler and admission policies. Verify actual deployment
configuration before running a cohort.

GPU admission and CPU postprocessing slots are independent. CPU capacity defaults
to 2 and explicit production config permits 1–9. Running state and provider-account
capacity must be checked separately; Pending Pods are not working slots. Worker
receipts and actual checkpoints determine completion, not Kubernetes Complete
alone. Unknown submissions reconcile the exact request/job identity.

## Resume and cancellation

`resume.ts` takes `--checkpoint-s3`, `--source-manifest`, `--output-root`,
`--publish-s3` and `--stop-before-seedance`; use the same absolute output root in
the isolated continuation Host. Closed captures and materials are hash-verified
before reuse. `rerun-runtime.ts` creates a fresh Episode identity for a changed
runtime from a closed failed checkpoint. `continue.ts` can seed a verified planner
receipt; it does not invent a Host route plan.

Provider request identities and checkpoints persist before submission. An unknown
result is not retried under a new identity. CPU success requires an explicit
prepared/paused state and successful checkpoint publication. Cleanup errors do
not replace the original failure. Release execution capacity only after owned
Pods are inactive. Resource cleanup remains pending until its evidence is complete.

`cancel --cohort ID` prevents new submissions and reconciles owned running jobs;
`resume` does not reopen a cancelled cohort. In-flight calls without a supported
cancellation API remain explicitly unconfirmed. Bounded retries preserve completed
media and current request identities. `anchorContinuation` may import verified
unchanged anchors with a bounded extra budget; later frames retain independent
review requirements.

## Validation

```sh
pnpm exec vitest run scripts/three-episode packages/three-world/src/episode.test.ts packages/three-world/src/presentation.test.ts
node --test scripts/three-episode/*.test.mjs
pnpm typecheck
pnpm test:census
```

Local contract tests mock cloud services. Browser capture, source verification,
real provider execution and final video inspection have separate evidence scopes.
