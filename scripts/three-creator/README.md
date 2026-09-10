# Three Creator

Creator accepts ordinary HTML, JavaScript/TypeScript and Three.js. Use `three-sdk`
for the supplied world runtime, human actions, custom Mesh bindings and Episode
production; `three-raw` supplies basic browser observation. The Host compiles
browser modules and never executes author package scripts or build configuration
in Node.

Build a simple playable whitebox: white/light-gray primitive environment forms,
uniform basic lighting and a few identifying colors for key landmarks or targets.
Keep broad composition, scale, spatial relationships, real collision and action
conditions. Keep the supplied humanoid's visible model, rig and motions; reuse
other supplied subjects when suitable, otherwise draw and bind simple geometry.
Omit added clothing/accessories, decoration, atmosphere, reflections and elaborate
shadows. Self-check coverage follows the requested core functions.

```sh
pnpm exec tsx scripts/three-creator/mcp.ts --workspace /absolute/author-project --profile three-sdk
pnpm exec tsx scripts/three-creator/cli.ts --workspace /absolute/author-project --profile three-sdk --session
```

Server: `worldkit_three_creator`. CLI sessions accept one JSON request per line,
for example `{"id":1,"name":"world_validate","arguments":{}}`. Poll asynchronous
`operationId` values with `operations_get`. Use one persistent session through
playtest and submission so the Host can verify its own browser evidence.

Failed MCP calls retain `isError: true` and return JSON text with the original
`error` plus `errorDetails: {code, message, details?, nextSteps}`. CLI errors use
the same envelope and preserve request `id` in JSON-lines mode. Failed operations
persist both fields with their original ID. Input errors include AJV field
locations; recovery steps never execute retries or relax validation. Reconcile
unknown operations through the original session/journal before any new submission.

Startup and bridge failures preserve available SDK `code`, `category`, `phase`,
`entityIds` and `suggestedAction`. `errorDetails.host` separately identifies the
Host phase, bridge method when relevant, and candidate source/runtime/build hashes.
Native error stacks and bounded causes are retained when available; plain thrown
objects do not acquire invented source locations. Auxiliary diagnostic collection
failures do not replace the original failure or prevent an otherwise-ready world
from opening. Read the existing failed operation to inspect its saved causes;
this does not start another browser or repeat the failed action.

## Four levels for an Agent

Choose the controlled subject from the request and reference. Environment and
`getting-started` schema responses expose `subjectAuthoring` routes: ordinary
humans use `character-actions`, human riding uses `mounted-interaction` with a
vehicle example, and independent animals use `nonhuman-subject`. Generic schema
topics identify `createWorld`; human/Humanoid topics identify `createHumanoidWorld`.
The existing default example still demonstrates a human and labels its use.
`createWorld` is the general foundation, including custom human integrations;
`createHumanoidWorld` wraps it with the complete supplied human kit. Both return
the same world type. Choose by the required ready-to-use abilities rather than
treating the two functions as separate human/nonhuman engines.

`nonhuman-subject` provides a standalone fox with no humanoid assets, using SDK
ground movement, camera, collision and capture. Read the current movement and
asset contracts for other forms and abilities. The same actor must remain the
controlled/captured subject; do not create a rider for an animal protagonist.
In an ordinary SDK world without Humanoid, character continuity is
`not-applicable`; loss of telemetry after a Humanoid baseline remains `unavailable`.
Humanoid first-person view temporarily clips head geometry. Continuity reports
`partial` with `geometryIdentity: deferred-first-person` while still checking the
same root, skinned meshes, skeleton and bones. Empty indexed meshes are excluded
from visibility checks in that view; remaining body meshes must be renderable.
Returning to a normal view restores geometry identity checks. This is advisory
coverage information, not an additional delivery gate.

| Level | Tools / source | Use |
| --- | --- | --- |
| Reuse | Environment, asset search/describe, subject-specific example | General `createWorld` or complete human kit through `createHumanoidWorld` |
| Bind | `nonhuman-subject`, `character-actions`, `humanoid` schemas/examples | Author a Mesh and its body/movement, collision map, water or interaction anchors |
| Configure | Runtime commands and profiles | Change actual parameters with units; export effective values into the project |
| Implement | `creator_materialize_runtime`, then edit `sdk/` | Modify a controller/module and rebuild with `world_validate` |

Mesh/Group creation is unrestricted by the asset catalog. Keep the supplied
humanoid visible model, rig and motions. Reuse supplied creatures when suitable.
Vehicles must use model-free handling configurations and authored Three geometry,
without loading supplied or external vehicle models. Select car/motorcycle
handling before drawing; match physical dimensions, wheel layout and seat anchors. Compatible animation mapping remains an
explicit requirement. See the [SDK guide](../../packages/three-world/README.md)
for exact calls and action cards.

The Agent decides which objects should be dynamic from the scene and gameplay;
there is no prescribed list of object categories. For `map.boxes` that should
respond to gravity, forces and collisions, configure
`EnvironmentBox.rigidGroup: {id, massKg}` on every part of the object, using one
group ID and the same total mass in kilograms. Give different objects independent
group IDs. Resting on the ground does not make an unattached object fixed; omit
`rigidGroup` only when its support or gameplay relationship should keep it fixed.
Supply physical support when the object should rest in place.
`creator_get_examples({topic:'character-actions'})` uses tables and a chair to illustrate
seat/pickup interactions, visual pose synchronization and reset. The SDK owns
the dynamic bodies; scene code reads `propBoxPose(id)` from the current Humanoid
environment in `onVisualUpdate` and copies world poses to the visuals.

`creator_get_authoring_schema({topic})` returns a short guide by default, with
`availableSections` and `runtimeGuidance` identifying its source. Select `sections` from guide, contracts,
project, episode, observation, commands or humanoid; `["all"]` returns the complete
selected topic. For example, `{topic:"mounted-interaction", sections:["humanoid"]}`
returns Humanoid declaration excerpts from the indicated source files. Selected
public types within `contracts.ts` use an AST-selected dependency closure.
Humanoid excerpts retain public type references; they are not standalone declaration packages.
Default parameters are rendered as declarations without executing their expressions.
An unresolved imported default marks only that declaration unavailable; other
declarations and the topic guide remain readable.
Examples include a complete file manifest and support selected files per topic.

SDK environment, default schema guides and examples expose shared `cameraAuthoring`
guidance; selecting humanoid/commands sections or example files retains it. Use
tuned defaults, overriding only defects observed in real views. Large whitebox
landmarks do not require lifting the humanoid eye. Humanoid offsets are metre
increments on existing anchors, default 0, shared by modes 0/2 and ignored by
mode 1; follow distance affects only mode 0. Read the
[SDK camera contract](../../packages/three-world/README.md#humanoid-camera-perspectives)
for details. Workspace SDK guidance points to current source and matching runtime
inspection; Host values are not authority for edited SDKs. Standalone nonhuman
guidance uses `setCameraFollow({view})`; raw guidance does not claim Humanoid support.

For an authored opening, `cameraAuthoring.openingExample` points to the optional
scene keyboard handoff using `presentation.inputSurface` and the existing
`world.humanoid.setCameraMode` method. Creator key steps exercise the scene listener;
semantic plans can issue `humanoid.set-camera-mode` explicitly. Starting the clock
does not by itself switch an authored camera. Episode chooses its own segment view.

`assets_search({query, limit?, offset?})` returns ranked summaries: 5 by default,
20 maximum. Empty query lists permitted assets; continue with `nextOffset` until
null. Search by name, action or scene need such as `滑铲`, `游泳` or `pickup`.
Use each result's `assets_describe` link for complete resources, action conditions,
controls and source entry points. Missing mount dependencies remain explicit and
never expand permissions. Search does not index private paths or resource hashes.
Direct in-process `ThreeCreatorTools.schema()` and `.assets()` retain full responses;
MCP and CLI use progressive discovery.

## Project runtime source

Call `creator_materialize_runtime({})` to export the runtime into the workspace:

- `sdk/three-world/src/`: world, action, animation, physics and input modules.
- `sdk/camera-collision/src/`: shared camera collision implementation.
- `sdk/runtime.json`: dependency and source layout contract.

The reply's `runtimeSourceHash` identifies this SDK source snapshot, including
when `sdk/` already exists. It is separate from the project's `sourceHash` and
does not mean that the copied source has been compiled or started.

Edit the module that owns the behavior, then call `world_validate` to build its
browser runtime. Keep one clock, physics backend, actor controller, animation
owner and camera writer. The Host bundles source with its installed dependencies;
project Node scripts and arbitrary build config are not executed. Host validation
and delivery code are outside the exported runtime.

Discovery reads a validated snapshot of the current `sdk/` sources when present.
`runtimeGuidance.runtimeSourceHash` identifies that snapshot; compare it with
`world_validate` or `world_inspect.runtimeSourceHash`. Subsequent source edits get
a new hash. Missing required or invalid workspace files fail explicitly instead of falling
back to Host declarations. An older workspace without the optional vehicle input
guide reports that guidance as unavailable while keeping other discovery usable.

For a workspace SDK, `contracts`/`humanoid` sections use its declarations.
`runtimeDefinitions` (humanoid/commands sections and asset details) contains current
exported definition source, including tuning and input bindings. Initializers are
never evaluated on the Host. Evaluated Host capability cards and key bindings are
omitted because they may be stale; use the current source and actual
`world_inspect.observation.snapshot.humanoid.characterCapabilities` eligibility.
Search still uses catalog/baseline terms to find assets, not to certify edited
runtime abilities. Mounted integration remains unverified until checked in that
runtime. Examples are marked `exampleAuthority: host-baseline` and require adapting
to modified interfaces. Without `sdk/`, existing Host guidance remains available.
Host asset policy, episode schema and closed command validation remain independent
of authored runtime declarations.

Both project source identity and actual runtime bytes enter the candidate and
delivery. Run a fresh playtest after a source/runtime change. Parameter changes
are preferable when the existing behavior already supports the intended result.

## Asset selection

`project.json` selects `{schemaVersion:1,assetIds:['humanoid.source-101']}`.
[`asset-policy.json`](../../config/three-creator/asset-policy.json) provides the Host-owned allowed catalog,
recommended humanoid and custom-asset setting. Read the effective policy from
`creator_describe_environment.assetPolicy`; project files select permitted assets
but do not change policy. Ordinary geometry remains available.
The catalog is [`assets/three-creator/asset-catalog.json`](../../assets/three-creator/asset-catalog.json);
`scripts/three-creator` owns loading, validation and task freezing.

Asset search and exact descriptions return the permitted entries. The compiler
packages public definitions, resource dependencies and exact bytes; Host
`sourcePath` is not exposed. A local service freezes its effective policy at
startup. Persistent Host tasks can pin an external policy snapshot with both
`--asset-policy-snapshot FILE` and `--asset-policy-sha256 SHA256`.

The compiler rejects denied selected IDs, recognized denied bytes and authored
Host outputs such as `asset-definitions.json`, `runtime/` or `compiled/`.
`allowCustomAssets:false` additionally restricts unlisted external media/models,
while retaining ordinary scene code and geometry. Policy admission is not a
hostile-JavaScript sandbox or a proof of generated-asset provenance.

The packaged policy hash contributes to source identity. Submission and Episode
import verify the carried definitions/resources rather than consulting a changing
server default. Partial policy records fail verification. Cloud execution requires
a compatible deployed capsule and pinned policy; editing this checkout does not
update a running job.

## Inspect and execute

`world_inspect({query,entityIds,sections})` reads the actual world. Request
`sections:['snapshot']` for current actor/camera state, or `['description']` with
`entityIds` for selected entities, parameters and boarding eligibility. `hierarchy`
adds object bounds and renderer details; `diagnostics` adds physics/input audit.
Omitting sections inspects all sections. Select sections to avoid unrelated
hierarchy traversal and duplicate diagnostics. `query` uses the SDK case-insensitive
substring match on entity id/name/tags. Omit `entityIds` to select all entities;
`entityIds:[]` selects none. These filters affect description queries, not snapshot
or hierarchy contents. The Host returns the current SDK description directly.
Every response includes sample revision/tick/time; unavailable values are null.
Water/continuity feedback is populated only with the snapshot section.

`world_execute_command({command,waitSeconds:1})` runs a command
in that browser and can return its result in the same call. Omit the wait for the
existing asynchronous behavior. Command replies and `operations_get` provide
`worldExecution` (the sampled action outcome) and `next` (the exact follow-up tool
and arguments). Follow `next` while work remains; do not resubmit the command.

Creator `status:'succeeded'` means the Host request finished. Check
`worldExecution.status` for applied, accepted, rejected, or the queried action's
queued/running/succeeded/failed/cancelled state. The original `worldCommandReceipt`
and `worldOperation` remain in `result`. For accepted work,
`world_get_operation({worldOperationId,waitSeconds:1})` can also return inline.
The optional reply wait is bounded at 25 seconds; if it expires, query the same
Creator `operationId`. A still-running World action or queued browser work can
therefore still require that extra Host query. Waiting does not start simulation,
cancel work, or advance physics. Returned state is an observation at the recorded operation time, not a
continuous subscription. `next:null` means no further status polling, not visual
or task acceptance; rejection and failure still require reading the error.

Paused instant commands apply at the boundary; ongoing actions wait until start.
An accepted receipt is not completion. Runtime capability eligibility and rejection
reasons are authoritative. Water diagnostics are in `feedback.water` and playtest
`feedback.waterTimeline`; they report measured contact without altering decisions.

Register complete capture targets in priority order with
`world.setCaptureTargets(['player','tower','bridge'])`. SDK semantic front is
local **-Z**, up **+Y**; `frontYawRadians` rotates about local Y and parent rotation
is applied. Contextual map anchors use their documented **+Z** heading convention.
`world_preview` offers opening, current, top-down and entity-triview captures of pure world
pixels. Mount HUD through `world.createPresentation()`.

In a Humanoid world, collision boxes, the preset person and vehicles are created
from `createHumanoidWorld` options. Do not register the same map collision again.
To give an existing purely visual map landmark an observation or capture identity,
register its object with `role:'decoration'` and omit `physics`, then select it as
a capture target when needed. Keep genuine map collisions in the Humanoid map.

## Real input episodes

`episode.json` stores browser input and SDK commands independently of rendering
source identity. Use schemaVersion 2 for actions:

```json
{"schemaVersion":2,"targets":[],"steps":[
  {"keysDown":["w","Shift"],"durationSeconds":1.5},
  {"keysDown":["c"],"durationSeconds":0.1},
  {"keysUp":["c"],"durationSeconds":2},
  {"keysUp":["w","Shift"],"durationSeconds":0.2},
  {"commands":[{"type":"humanoid.perform-action","request":{"requestId":"roll-1","action":"roll"}}],"durationSeconds":2}
]}
```

Keys remain held until released. Supported keys derive from the SDK control
registry, including posture and interaction keys. The new crouch key edge while
Shift is held requests slide; actual eligibility still requires enough speed.
Mouse drag and arrows control camera. SchemaVersion 2 also supports step
`lifecycle:"start"|"pause"|"reset"`; transitions release held keys. Targets measure
actual XYZ proximity and do not steer or teleport the character.

Each `targetResults` entry includes `nearestSample`: the closest recorded player
position, its original zero-based `traceSampleIndex` in `trace.json`, wall time
since trace start, and available simulation time/tick and world revision.
`deltaToTargetMetersXYZ` is **target minus sampled player position** in world
meters: `[0,20,0]` means the target is 20 meters above that sample.
`distanceOutsideToleranceMeters` is the remaining distance to the tolerance
boundary, clamped to zero inside it. These measurements use existing samples,
including pause/reset samples; they do not infer between-sample crossings, goal
order or gameplay acceptance. With no usable position, distances and
`nearestSample` are null; `reached:false` then means unobserved. Missing sample
times are null. The containing report identifies source/runtime/world/episode.

Omit `durationSeconds` from `world_playtest` for the full episode, or provide a
shorter duration for debugging. The Host executes full steps in real wall time
and records the native canvas. Input and video frame timestamps bind that video
to the run. Paused/reset time is excluded from active play.

## Preset humans and custom vehicles

Creator requires the permitted preset model, rig and motions for every human,
including NPCs and riders. Keep each person as one instance across walking,
mounting, riding, dismounting and reset; custom vehicle geometry never includes a
replacement rider. `humanAuthoring` in environment/schema/asset detail responses
states this requirement independently of the project's editable SDK source.
`creator_get_authoring_schema({topic:'humanoid',sections:['humanoid']})` returns
model-free `roadVehicleConfigurations` for car and motorcycle on the Host SDK
baseline. Workspace SDKs return their source definitions instead. Call
`humanoid.createRoadVehicleSpec('car' | 'motorcycle')` for a fresh configuration,
then author the chassis, wheel groups and seat to those dimensions.
`creator_get_examples({topic:'custom-vehicle'})` provides a self-drawn motorcycle;
`vehicle-camera` provides a self-drawn car. Both select only the preset human asset and remain usable when custom external
asset files are disabled: procedural Three geometry is allowed.

Road physics and movable props are integrated. Detailed drivetrain/wheel telemetry
still requires SDK state access; standard Agent observation tools do not yet
return it directly. The self-drawn examples do not include an engine dashboard.
See [integration status and follow-ups](../../docs/reviews/2026-09-09-creator-vehicle-integration-status.md).

For seat-fit details, `creator_get_authoring_schema({topic:'mounted-interaction'})`
provides the SDK's [vehicle seat fit guidance](../../packages/three-world/README.md#vehicle-seat-fit).
`spec.seat` locates the pelvis, not the cushion surface. The custom motorcycle
example derives its cushion position from the configured pelvis anchor, cushion
thickness and a Source101 pose clearance.
These reference values require checking against the authored seat and mounted pose;
the SDK does not automatically fit arbitrary seats. First-person eye height follows
the actual head, so correct the rider/seat fit before adjusting camera settings.

`creator_get_examples({topic:'vehicle-camera'})` draws a car from the selected
configuration with a separate humanoid, SDK T/reset controls and a local material helper.
Keep glass transparency, opacity and material-array slots when recoloring a model
white or gray. Camera collision uses rigid vehicle geometry to preserve open
cabins; the vehicle movement envelope remains intact. Inspect the first-person
view and a low-angle orbit near the cabin when those views are part of the scene.
Finish the authored opening pose and projection and call
`world.useAuthoredCamera()` before the first `start`, `step` or `reset`, which
seals that opening. Hand control back through `humanoid.set-camera-mode` when play
begins. Reset restores the sealed authored opening after follow-camera use; the
Humanoid follow mode still resets to the profile's `defaultPerspective`, so a
temporary authored or shoulder view does not replace that default. Do not add an
unconditional `onReset` camera writer during Episode capture. To check shoulder view, call
`world_execute_command({command:{type:'humanoid.set-camera-mode',mode:2}})`, then
`world_preview({view:'current'})`. Current preview preserves the view without reset
or simulation stepping. Its `cameraObservation` includes `cameraOverrides`
(explicit `profile.camera`), `cameraSettings` (resolved settings) and `framing`.
Compare these values with the real pixels. `world_preview({view:'opening'})` stops and resets; it
checks the reset opening. Inspect only the views relevant to the requested
outcomes or an observed problem; production has no fixed vehicle lifecycle
regression checklist.

For framing advice, request `world_inspect({sections:['description']})` and read
`observation.description.humanoid.configuration.effective.camera.framing`.
This is on-demand head-anchor projection advice without stepping or camera changes.
`SHOULDER_FRAMING_OFFSET_REVIEW` suggests checking explicit shoulder offsets.
No issues does not mean visual acceptance, and projection does not prove visibility or lack of
occlusion. Use the actual current preview to judge the composition.

Inspect/playtest `characterContinuity` feedback observes the Humanoid character's
skinned body identity and renderability; rigid equipment is excluded. The playtest timeline preserves intermediate
changes even if the author restores the person before the last frame. It is
advisory, with no change to v0.2 technical admission. It cannot prove preset
provenance, detect every extra rider, or measure seat/hand/foot fit; use relevant
frames when such a problem needs investigation. Legacy/raw worlds without Humanoid
telemetry are explicitly unobserved, not passed.

## Verify and deliver

`world_preview({view:'current'})` preserves the current view without pausing,
resetting or stepping the simulation. The default `opening` view pauses and resets;
top-down and object views pause without resetting.
`world_capture_triviews` resets before taking delivery views. Use these tools
when their lifecycle effects match the state you want to inspect.

Choose an episode that exercises the requested core movement and actions and
records their outcomes. Submission requires a same-session,
current-world/current-episode successful recording, all episode steps completed,
finite positive active/input/wall/video durations, plus opening and player/target
three views. A truncated debug run is incomplete. Encoding
preserves real timestamps without synthesized frames or FPS padding. The real
stopped-canvas postroll records a terminal sample and is excluded from input and
active time.

`world_playtest` returns `status:passed` when technical recording checks pass;
read `executionMode` and `isCompleteEpisode` separately. Target `reached` means a
sample entered its XYZ tolerance, not that a gameplay goal was independently verified.
If the requested outcome is moving a prop by impact, identify that prop and compare
its actual physical pose before and after real contact; player proximity, a blocked
character or technical `passed` status is not evidence of prop displacement.
Omit `durationSeconds` for the full plan. A shorter value truncates debugging;
a longer value keeps waiting after all steps, with unreleased keys held until cleanup.
`framesPerSecond` requests video capture samples, not simulation or display FPS.
`actualWallSeconds` measures this input/recording interval and its finalization;
it excludes browser startup and subsequent transcoding, and is not whole-task time.

For a question about an already recorded interval, use the playtest result's
`readTrace` link, or query the same service session directly:

```js
world_read_playtest({operationId: 'the-playtest-operation-id',
  fromSeconds: 11, toSeconds: 20, maxSamples: 12})
```

Times are seconds since the browser trace began, not whole-task time or the sum
of planned step durations. The reader returns original sample indices, positions,
velocity magnitudes, mounted instance, camera mode and up to 32 keyboard events.
It returns at most `maxSamples` uniformly selected samples (default 12, range 2–32),
including interval endpoints that were actually sampled. Omitted counts are
explicit; narrow the range for short transitions. Maximum speed uses all valid
velocity samples in that range; missing measurements remain null. Long text is
marked with an ellipsis. It does not infer travel between reset/mount transitions,
track arbitrary prop displacement or decide task success.

The summary carries recorded source/runtime/episode hashes, trace SHA256,
operation time and recording status. `currentWorldComparison:'not-performed'`
means it describes that recording even if the current source changed. This read
does not compile, open a browser, advance simulation, create an operation or
re-record. It works after the service closes its browser, within that same service
instance. Unknown IDs and different operation types are rejected; pending runs
return `not-ready`, and missing/changed trace files return `unavailable`. These
advisory results do not change recording or submission eligibility.

`recordingReadiness` reports the existing recording prerequisites immediately:
`eligible` and `issues` cover technical success, plan completeness and required
input/video durations. `scope:'recording-only'`, `checkedAt`, `creatorOperationId`,
`worldBuildHash` and `episodeHash` identify the recording assessed. This is a
historical assessment of that recording, not a fresh workspace or file-integrity
check, and does not certify task coverage or visual acceptance. `world_submit`
still checks the current source/episode, evidence files, captures and asset policy.
An unchanged complete recording with the requested outcomes can proceed to
submission. Use a shorter `durationSeconds` for debugging without editing the
plan; the latest completed debug run becomes the service's selected recording
and can require a new full recording before submission.

Submission creates a local package and atomically writes `creator-delivery.tar.gz`
and `creator-result.json`. It does not upload, publish, start Episode or request a review.
The archive contains one hash-closed `payload/` with source, playable, playtest,
captures, episode.json, delivery.json and artifact-hashes.json. Symlinks fail.
Technical delivery is `ready-for-independent-review`; core functionality and fixed
external goals need independent review of the actual playable and reference.

`sourceHash` identifies source and selected assets, `runtimeHash` the browser
runtime bytes, and `worldBuildHash` their profile-qualified combination.
`episodeHash` identifies exact input-plan bytes. Changing only the episode reuses
the candidate but requires a fresh full playtest for submission.

For a Host-owned fixed runtime capsule:

```sh
pnpm exec tsx scripts/three-creator/prebuild.ts --profile three-sdk --output /host/prebuilt/three-sdk
```

Pin the manifest SHA through `WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT` and
`WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256`. The Host checks its source,
dependencies, manifest and runtime files. A project runtime source build has its
own actual identity. `WORLDKIT_CREATOR_RUNTIME_HASH` identifies the outer cloud
capsule and is distinct from the browser `runtimeHash`.

Episode independently consumes the admitted world and its actual runtime; see
[Episode production](../three-episode/README.md).
