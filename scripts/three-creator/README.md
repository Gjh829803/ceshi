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

Server name: `worldkit_three_creator`. List its 14 tools, then read environment,
schema and examples. CLI uses the exact same service:

```sh
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-raw --tool world_preview
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

The persistent CLI accepts one JSON request per line, for example
`{"id":1,"name":"world_validate","arguments":{}}`. It returns an operationId;
poll `operations_get`. Keep one MCP/CLI session through preview and submit. An unrelated fresh process cannot trust a
model-written saved preview receipt.

`creator_get_examples` returns runnable minimal HTML/main.ts and project.json. The examples demonstrate integration, not a completed playable
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

## Interactive page preview

`world_playtest` is no longer an Agent tool. There is no mandatory recording,
episode file, route declaration or minimum test duration. The Agent chooses its
checks and uses actual browser images as feedback:

```json
{"name":"world_preview","arguments":{"view":"opening"}}
{"name":"world_preview","arguments":{"view":"current","input":{"keys":["w","Shift"],"durationSeconds":2}}}
{"name":"world_preview","arguments":{"view":"current","input":{"keys":["ArrowLeft"],"durationSeconds":0.5}}}
{"name":"world_preview","arguments":{"view":"current","input":{"pointerDrag":{"deltaXPixels":100,"deltaYPixels":-20}}}}
```

Poll each operation ID before continuing. `opening` resets to the authored camera.
`current` keeps the same live world and returns the whole page PNG, bounded visible
page text, current state and errors. Optional input supports key holds, clicks,
pointer drags and wheel scrolling. Each call holds input for at most 15 seconds,
then releases all keys and pauses so the resulting frame remains inspectable.
This uses actual Playwright input and the existing SDK clock, without teleporting
or simulating a second world. Top-down and complete-object previews remain available.

`world_inspect` exposes hierarchy, camera/targets and actual state. The SDK's
`world_execute_command` / `world_get_operation` support registered world controls.
Creator operation IDs and accepted World command operation IDs are distinct.

## Preview-based delivery

After the final source change, inspect its opening PNG and call `world_submit`
in the same service session. The service checks the current source, actual startup
and observed errors, captures full player/target three views, and writes a closed
playable archive. SchemaVersion 2 has `validationMode: interactive-preview` and
`previewEvidenceSha256`. It contains source, playable, preview, captures and closed
manifests. It does not contain an episode, playtest, invented duration or video.
A source change requires another opening preview. An image path alone is not proof:
the cloud transport also checks that the actual PNG reached the model.

A successful submission is ready for direct publication and play. No assistant or
human review is a production stage or publication gate.
Production status does not claim that all routes are reachable, that there are no bugs, or that
three minutes of meaningful exploration were proven. The 3–5 minute exploration
request concerns authored world content.

Archived v1 deliveries retain their recorded-play evidence and old validation.
Legacy recording helpers are Host-only compatibility code, absent from MCP and
new submission. Browser network remains same-origin; author Node/build scripts,
private platform scratch, credentials and symlinks do not enter authored artifacts.
