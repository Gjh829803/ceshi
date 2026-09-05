# Experimental Three Creator tools

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

Server name: `worldkit_three_creator`. List its 13 tools, then read environment,
schema and examples. CLI uses the exact same service:

```sh
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-raw --tool world_preview
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

The persistent CLI accepts one JSON request per line, for example
`{"id":1,"name":"world_validate","arguments":{}}`. It returns an operationId;
poll `operations_get`. Keep one MCP/CLI session through playtest and submit.
An unrelated fresh process cannot trust a model-written saved playtest receipt.

`creator_get_examples` returns runnable minimal HTML/main.ts, project.json and an
input episode. The examples demonstrate integration, not a completed playable
world. With the SDK, compose any Three camera first and call
`world.setCameraFollow({activateOnInput:true,...})` to preserve the reference
opening and follow during play. Use `world.onUpdate`, `world.onInteract` and
`world.execute` for gameplay and live changes. `world.expose({targetEntityIds:
['player','tower','bridge']})` selects complete target groups for three views;
inspection and snapshots retain every registered entity. Raw Three exposes the
same small `WorldObservation`; missing SDK ticks/actions/commands are explicitly
reported as null/unsupported.

Three-view semantic front defaults to object-local **-Z**. Set the SDK entity's
`frontYawRadians` to rotate this direction about local +Y; `world.expose()` passes
it through `targetFrontYawRadiansById`. The Host then applies the object's full
world quaternion, including parent rotations. Up is transformed local +Y; right
is front × up (local +X at zero front yaw). Front/right/back cameras therefore
follow the actual target orientation. Raw observers can provide the same optional
map. A `world_preview` frontYawRadians argument overrides that local semantic yaw
for the first selected target; it is not an absolute world-space camera angle.

`project.json` optionally selects `{schemaVersion:1,assetIds:[...]}`. Exact public
asset definitions appear in `asset-definitions.json`; their URI resolves relative
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
`durationSeconds` tool override is a bounded debug run. Targets measure XYZ
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
