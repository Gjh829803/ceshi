# Three Creator tools — v0.2 production contract

For design boundaries see [Three SDK architecture](../../docs/three-sdk-architecture.md).
This branch retains the real self-check recording contract described below.

Both profiles accept ordinary `index.html` + local JavaScript/TypeScript modules.
Use Three and its addons directly. `three-sdk` additionally provides the fixed
`@worldkit/three` runtime. The Host never executes author code, package scripts or
build configuration in Node; esbuild emits browser modules and a same-origin
browser renders them. Author filenames/identifiers/geometry are unrestricted
within the documented path and dependency boundary.

Start the persistent MCP service:

```sh
pnpm exec tsx scripts/three-creator/mcp.ts --workspace /absolute/author-project --profile three-sdk
```

Server name: `worldkit_three_creator`. List its 15 tools, then read environment,
schema and examples. CLI uses the exact same service:

```sh
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-raw --tool world_preview
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

The persistent CLI accepts one JSON request per line, for example
`{"id":1,"name":"world_validate","arguments":{}}`. It returns an operationId;
poll `operations_get`. Keep one MCP/CLI session through playtest and submit.
An unrelated fresh process cannot trust a model-written saved playtest receipt.

## Host asset policy

[`config/three-creator/asset-policy.json`](../../config/three-creator/asset-policy.json) is the Host-owned source of allowed
catalog IDs, `defaultHumanoidAssetId` and `allowCustomAssets`. The default excludes
the retired default character, selects `humanoid.preset-101`, and permits custom
assets. It does not require every character to use a preset or restrict ordinary
Three geometry. The asset catalog lives in [`assets/three-creator/asset-catalog.json`](../../assets/three-creator/asset-catalog.json);
`scripts/three-creator` owns policy loading, validation and task freezing. AI-owned
`project.json` selects assets; it never grants permission.

Read `creator_describe_environment.assetPolicy` for the effective task settings
and snapshot hash. Search and exact descriptions return only allowed entries;
the starter and schema examples use the configured default. Example bundles that
require unavailable assets are not returned.

Asset results also include `characterUsage`. Search by a skill such as `游泳`,
`滑铲` or `pickup` to discover the contextual kit; read the `character-actions`
schema for trigger/scene conditions and the same example topic for a standalone
48-clip character with a real deep-water volume. Six discrete skill requests,
state-driven animations and input-driven posture changes are described separately.
This example needs only `humanoid.source-101`, not the full vehicle catalog.

For water debugging, read `world_inspect.feedback.water` and the recorded
`world_playtest.feedback.waterTimeline`. They use measured SDK contact and its
existing decision flags, suggest geometry/position checks, and distinguish missing
declarations from missing contact. All feedback is advisory; it never introduces
a new admission or delivery gate. The timeline keeps the initial observed state
plus changes (latest 128, with omitted count), not every repeated frame.

One local MCP/CLI service freezes settings at startup. For a Host-managed task
that must survive process restarts, both entry points accept
`--asset-policy-snapshot /absolute/host-owned/snapshot.json` and
`--asset-policy-sha256 SHA256`. The snapshot must be outside the author workspace;
both arguments are required together. The configured public definitions must
match the installed catalog. Editing author files or the snapshot on disk cannot
change a running service's permissions; modified bytes fail pinned restart checks.

Cloud plans freeze the snapshot in task identity. Before the model starts, the
launcher checks the installed catalog/resources and retains the snapshot under
the Host cache, outside the writable workspace. MCP restarts use that pinned
copy. New plans require a launcher that implements this contract; an old deployed
lock cannot silently ignore policy. Existing plans resume with their original
snapshot and lock, rather than adopting the latest defaults.

Compilation rejects disallowed selected IDs, exact denied bytes (including
renamed files and literal base64 data URLs), and author-written Host outputs
`asset-policy.json`, `asset-definitions.json`, `runtime/` and `compiled/`.
When `allowCustomAssets` is false, unlisted external model/media/font files,
recognized model/animation JSON and literal data URLs are rejected. Ordinary
scene code and geometry are still allowed. This is asset admission, not a hostile
JavaScript sandbox or proof of provenance for arbitrarily modified/generated or
re-encoded models. Shared dependencies needed by allowed assets are not denied.

Every new candidate includes `playable/asset-policy.json`; its hash contributes
to source identity and is recorded as `assetPolicySha256` in the delivery. Submit
checks packaged definitions/dependencies and actual bytes again. Episode import,
transport and reload verify this carried policy without reading today's config.
Historical deliveries lacking both snapshot and marker keep their old path;
partial policy records are rejected. A config edit never rewrites old worlds.

Policy/config/source changes require a new built and deployed production capsule
before cloud tasks use them. Editing this checkout does not update a running job.

`creator_get_examples` returns runnable minimal HTML/main.ts, project.json and an
input episode. The examples demonstrate integration, not a completed playable
world. With the SDK, compose any Three camera first and call
`world.setCameraFollow({activateOnInput:true,...})` to preserve the reference
opening and follow during play. Use `world.onUpdate`, `world.onInteract` and
`world.execute` for gameplay and live changes. `world.setCaptureTargets(
['player','tower','bridge'])` selects complete target groups for three views;
`await world.start()` prepares the SDK and publishes the observer automatically;
inspection and snapshots retain every registered entity. Raw Three exposes the
same small `WorldObservation`; missing SDK ticks/actions/commands are explicitly
reported as null/unsupported.

Three-view semantic front defaults to object-local **-Z**. Set the SDK entity's
`frontYawRadians` to rotate this direction about local +Y; `await world.start()` passes
it through `targetFrontYawRadiansById`. The Host then applies the object's full
world quaternion, including parent rotations. Up is transformed local +Y; right
is front × up (local +X at zero front yaw). Front/right/back cameras therefore
follow the actual target orientation. Raw observers can provide the same optional
map. A `world_preview` frontYawRadians argument overrides that local semantic yaw
for the first selected target; it is not an absolute world-space camera angle.

`project.json` optionally selects `{schemaVersion:1,assetIds:[...]}`. Exact public
asset definitions appear in `asset-definitions.json`; SDK `world.assets.load(id)`
loads the selected asset and owns its animation. The URI resolves relative
to the playable page. Host-only sourcePath never enters this file or tool output.

`episode.json` is independent of rendering/source build identity:

```json
{"schemaVersion":1,"steps":[
  {"keysDown":["w"],"durationSeconds":2},
  {"keysDown":["w","Shift"],"durationSeconds":2},
  {"keysUp":["w","Shift"],"durationSeconds":1}
],"targets":[{"id":"tower-top","positionMetersXYZ":[10,12,5],"toleranceMeters":2}]}
```

Keys remain down until released; a second keydown produces real browser repeat.
WASD, arrows, Shift, Space, E, R and pointer drags are supported by the input
tool. Actual gameplay support belongs to the authored world/SDK, and must be
verified. Full episodes run every step for its real wall-clock duration. A
`durationSeconds` smaller than the plan selects a bounded debug run. Omit it, or
use a duration at least as long as the plan, to execute the full episode. Full
episodes reserve bounded overhead for real key delivery, snapshots and screenshots
without truncating their final steps. Targets measure XYZ
proximity without teleportation or steering; external task goals must stay fixed.
Changing an episode reuses the same compiled candidate, browser and renderer.
Each playtest starts a new native canvas MediaRecorder stream; its real frame
timestamps and image frames bind that video to the run without rebuilding.

Fixed runtime prebuild for a Host-owned cloud capsule:

```sh
pnpm exec tsx scripts/three-creator/prebuild.ts --profile three-sdk --output /host/prebuilt/three-sdk
```

Pin the returned manifest SHA in the launcher, then set
`WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT=/host/prebuilt/three-sdk` and
`WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256=<plain64hex>` in the MCP process.
The Host checks compiler/source/dependency identity, the pinned manifest and all
runtime bytes; it never accepts an author-provided cache receipt. Without these
variables, the service builds the fixed runtime once and retains a sealed memory
cache. Candidate edits compile only author modules. Additional Three addons are
bundled independently and share the same Three module.

The cloud capsule's separate plain-hex `WORLDKIT_CREATOR_RUNTIME_HASH` is echoed
as `creatorRuntimeLockHash`; it is not the fixed rendering runtime's `runtimeHash`.
`sourceHash` binds author files and selected public assets. `runtimeHash` binds
actual fixed browser bundle bytes. `worldBuildHash` is SHA256 of
`JSON.stringify({sourceHash,runtimeHash,profile})`. `episodeHash` hashes the exact
episode bytes. A changed episode does not invalidate an unchanged-world preview,
but requires a new episode playtest before submit.

Submit requires a same-session current-world/current-episode successful real
180-second input/video recording and opening/player/target three-view captures.
It atomically writes `creator-delivery.tar.gz` then `creator-result.json` at the
workspace root. The tar has one `payload/` containing source, playable, playtest,
captures, episode.json, delivery.json and artifact-hashes.json. All regular files
are hash-closed and symlinks are rejected. The operation result equals the final
JSON receipt and contains archivePath, archiveSha256 and archiveByteLength.

Delivery kind is `three-creator-delivery`, schemaVersion 1, engine
`three@0.185.1`, profile `three-raw` or `three-sdk`. Its status is
`ready-for-independent-review`, technicalStatus `passed`, semanticStatus
`unreviewed`. This is not a Native delivery or a visual/task acceptance claim.
The evaluator must separately compare the original reference, the real playable
and fixed external goals. A route or input transcript alone cannot establish
scene quality.

SDK v2 discovery is topic-based: `creator_get_authoring_schema({topic})` accepts
getting-started (default), assets, control, extensions, observation or all. The
returned declarations are an AST-selected dependency closure of actual public
contracts; private engine files are not authoring APIs. `creator_get_examples`
accepts getting-started or extensions; raw only uses its own minimal observer.

`world_execute_command({command})` executes a closed v2 command in the real SDK
browser. Its Creator operation result contains worldCommandReceipt. An accepted
receipt contains a separate World operation ID: pass it to
`world_get_operation({worldOperationId,waitSeconds})`, then poll the returned
Creator operation using operations_get. Never resubmit a command to poll it.
While paused, instant commands apply at the pause boundary; ongoing work returns
accepted and stays pending until explicit start. Commands do not auto-start or
step a paused world. `world_inspect({query,entityIds})`
returns current description, command availability and actual state.

Episode schemaVersion 2 adds optional `commands:[...]` and
`lifecycle:"start"|"pause"|"reset"` to a step. Keys still use actual browser input.
Lifecycle transitions release held keys; pause/reset time does not count toward
minimum activePlaySeconds=180 at submission. Episode v1 keeps its original key
shape. Short episodes may exercise commands and reset; external exploration
quality still requires independent 3–5 minute route/reference review.

SDK deliveries declare sdkVersion `0.2.0-experimental` and
browserObservationContract `WorldObservation-v2`; raw declares sdkVersion null
and the minimal `WorldObservation-v1`. The outer delivery remains schemaVersion 1.

The Host assigns commandId from the Creator operation identity (and episode
step/command index). The model cannot supply command IDs or priorities. The
bridge verifies that the SDK echoes the same commandId. These tools currently
attach no expectedWorldRevision: their fresh snapshot is diagnostic context, not
a revision already observed by the model. Do not claim stale-context protection
from the Host-generated ID alone.

Recording timing uses the browser performance clock: inputWallSeconds spans the
actual input trace, while actualWallSeconds retains Host time through evidence
recovery. captureTiming records initial/final actual-canvas frame requests and
recorder stop/flush times on the same browser clock. Initial and final samples are
rendered from the current scene without stepping the SDK, then flushed before
trace/video transfer. MP4 encoding preserves the source video frame timestamps
without FPS padding or synthesized duplicate frames. Submission requires actual
video duration >=180 seconds as well as >=180 active/input seconds and every
episode step completed; FPS quantization is never used to accept a 179s video.

Recording keeps one real capture interval of stopped-canvas postroll, followed
by native encoder flush. captureTiming.postrollSeconds reports this separately;
it is excluded from inputWallSeconds and activePlaySeconds. This guarantees a
real terminal sample at low capture rates without changing SDK time or padding
the encoded movie.

## Three data production integration

This branch keeps the verified Creator `0.2.0-experimental` delivery contract, including real browser playtests and the existing recording gate. Creator produces the playable world; `scripts/three-episode/` consumes an admitted delivery as a separate downstream production stage. The SDK also exposes the presentation topic used by downstream UI and capture. `ThreeCompiler.prepareRuntime({ cameraModulePath })` supports the recorded Episode camera compatibility source and includes its bytes in the runtime cache identity.
