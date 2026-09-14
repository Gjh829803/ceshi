# Programming and checks

Use `index.html`, local `main.ts`/JS and focused local modules; keep names consistent
across files, entity IDs, interactions, capture targets and input plans.
`project.json` selects permitted asset IDs. `episode.json` contains the real input
plan; request schema sections `project`/`episode` for the exact formats.

Use metres and +Y up. Ordinary actor/capture front is local -Z; Humanoid map,
vehicle and interaction headings use +Z. Preserve the supplied rig orientation.
The SDK owns one clock, physics world, controller per actor, animation owner and
active camera writer. Extend those owners; use lifecycle hooks for updates/reset/
disposal. Raw Three supplies its own loop, movement, physics and observer.

Author visual forms independently from collision proxies. Choose fixed or dynamic
bodies from the requested physical behavior. Humanoid map collision is registered
by the factory: do not register it twice. A visual-only capture landmark uses
`role:'decoration'` without physics. For movable Humanoid props read
`character-actions`/`control` for shared interaction slots; authored dynamic or
kinematic entities can bind pickup/seat slots to their existing body. Use
`rigidGroup` and `propBoxPose` for map-defined moving groups. For physical edge fences and
recovery read `boundaries`; world bounds alone do not block movement.

## Initial state and camera

In three-sdk, bind the scene and subjects, establish their initial relationship,
configure the opening, then start once. For an already riding primary human, pass
`initialMountId` to `createHumanoidWorld`; its value is the vehicle instance ID.
The vehicle's map spawn and seat define placement. The SDK checks grounded support,
availability, occupancy and body clearance before publishing the mounted state.
It performs no approach or boarding animation. An invalid start fails explicitly.

Import project `config/camera.json` relatively, pass it to `parseCameraDocument`,
then call `world.setCameraFollow({configuration:document})`. A document defines named views,
`defaultViewId`, subject binding and optional embedded preset snapshots. Select
another configured view with `world.setCameraView(viewId)`. Request `contracts`
for the selected SDK's `cameraConfiguration` schema/field metadata and
`cameraSourceContracts`; source-edited projects may report stale generated metadata
as unavailable while retaining their current declarations.

For an authored opening, configure a third-person view with `opening` and
`framing.kind:'preserve-opening'`. `activation:'on-input'` preserves it until
input activates following. Configure recentering, damping, zoom and transitions
in that view's overrides. The document resolver supplies defaults and reports field
provenance. Embed any referenced preset snapshots in `document.presets`; author
imports do not allow preset-content. The nonhuman binding example includes the
relative JSON import and minimal document; adapt its target to your actor.

Ordinary `addCharacter` supports optional `eyePositionLocalMetersXYZ`; first-person
and shoulder views require actual subject eye support. Subject binding selects the
camera target independently of the controlled entity. Mount changes follow the
document's binding policy through the existing camera owner.

The first start/step/reset seals the initial relationship and camera together.
Reset restores both. Do not simulate F for initialization, manually attach the
rider, or install another camera writer. On-foot initial facing defaults to back
toward the opening camera and can use `characterFacingYawRadians`; a mounted rider
follows the vehicle's heading.

Read `world_inspect({sections:['camera']})` for `observation.camera`: the committed
configuration hash/revisions, effective view and subject, resolved fields and
provenance. Current-view feedback uses that same inspection. Missing or failed
inspection is explicitly unavailable and does not prevent screenshots. Playtest
samples retain compact `snapshot.camera` identities; source inventory, runtime
identity and actual adopted document hash together establish which build consumed
which configuration. Reads do not advance simulation.

Keep HUD outside the pure world image:
```ts
const presentation = world.createPresentation();
presentation.ui.mount(hud); // hud is your HTMLElement
```

The Host compiles browser code with locked Three/SDK dependencies. Network access
is same-origin; bundle resources locally. Author Node scripts and build configs
are not executed. To change the SDK, call `creator_materialize_runtime`, edit
`sdk/three-world/src` or `sdk/camera-collision/src`, then `world_validate`.
Use current workspace declarations and match `runtimeSourceHash`; Host examples
are binding references and must be adapted to an edited runtime.

## Choose the check by the question

| Question | Tool and behavior |
| --- | --- |
| Does it compile? | `world_validate`; compilation does not run the world |
| Does the opening match? | `world_preview({view:'opening'})`; pauses and resets |
| What does this state look like? | `world_preview({view:'current'})`; no pause/reset/step; a live world continues |
| Why is movement/action blocked? | `world_inspect`: `snapshot` for state, `description` for eligibility; `hierarchy`/`diagnostics` for geometry/physics |
| Do real controls and the route work? | `world_playtest`; resets and runs episode keys, pointer drags and explicit commands in real time |
| What happened during a recording? | `world_read_playtest({operationId,fromSeconds,toSeconds})`; reads existing samples without execution |
| Does the area fit the overview? | `world_preview({view:'top-down'})`; inspect bounds and boundsSource against all playable routes |

Use existing frames and state to locate the cause before changing code or inputs.
An edit opens a new build; keep earlier evidence associated with its original
identity. Playtest summaries include recorded action outcomes; use world_read_playtest for
the relevant interval. For vehicle issues, request world_inspect's `vehicles`
section and its wheel detail only when needed; check sampling status/time before
interpreting values. These reads do not add generation acceptance gates.
An accepted action is not completion: inspect its World operation and
resulting state. Proximity alone does not prove interaction or prop displacement.
Poll the same Creator operationId with `operations_get`; never repeat an action
to poll. Read actual errors; unavailable telemetry is not measured success.

## Record and submit

Episode steps run for `durationSeconds` in wall time; keys stay held until
`keysUp`. Omit the playtest duration to execute the complete plan. A shorter
value tests the prefix from opening. Read the control registry for each action;
pressed edges and continuous axes differ. Use the active vehicle inputGuide for
family-specific axes. `framesPerSecond` controls video sampling, not simulation.

Keep the same MCP session. After repairs/debugging, finish with a complete eligible
recording of the current world and episode. Register complete capture targets via
`world.setCaptureTargets` (raw: observer targets/captureTargetIds), subject first.
`world_capture_triviews` captures opening, full-area overview and up to five ordered
object sheets; `includeAdditionalTargets:true` captures further required objects.
Only the first five are downstream conditioning references.

`world_submit` verifies the latest session recording, current identity and files,
and automatically captures missing current views. Keep the resulting
`creator-result.json` and archive. Do not write evidence/delivery files manually.
Submission creates the local package; it does not upload or start Episode.
