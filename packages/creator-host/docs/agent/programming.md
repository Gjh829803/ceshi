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

Avoid coplanar overlapping visible faces, including water against stair treads;
transparency and render order do not resolve depth conflicts. Check these
junctions while moving the camera.

For suspected surface flicker, call `world_inspect` with
`sections:['surface-overlaps']` and, when known, `entityIds` to narrow the scan.
It reports coplanar/near-coplanar overlap risks inside and between visible
triangle meshes at the sampled pose, including merged geometry. Known moving
entities are excluded; arbitrary authored animation cannot be inferred. Findings
include object identity, triangle references, world/local overlap bounds, area
and a repair hint; merged geometry
cannot recover original component names or source lines. Optional
`surfaceOverlaps:{highlight:true}` returns a labeled diagnostic local view of the
first finding. The overlay is visible through occluders and is not delivery media.
Read coverage and truncation before interpreting an empty result: animation,
instancing, shader deformation and budget limits can leave geometry unchecked.
Configured depth-biased overlays are excluded from the relevant comparisons.
Repair only unintended overlaps, then recheck the affected entity and inspect
moving-camera views. This is advisory geometry evidence, not proof of flicker,
visual acceptance or a reason to disable depth testing globally. Ordinary inspect
and playtest calls do not perform this scan.

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

### Defaults and custom views

Use `createHumanoidCameraDocument(actualHumanInstanceId)` as the starting document
when keeping the SDK's native human calibration. For registered creatures, obtain
`cameraPresetSnapshots` from `assets_describe`, embed the selected snapshots in
`document.presets`, and bind them to the actual subject instance IDs. Ordinary
Mesh/Group subjects need compatible anchors; a human preset is not a universal
fallback. Author imports do not allow preset-content.

The human `getting-started` example embeds this calibration in `config/camera.json`.
Its binding target is the primary human instance ID; use the same ID in the world
and its subject overrides.

Customize only the needed fields in a view's `overrides`, or in
`binding.subjectOverrides[instanceId].views[viewId].overrides` for one subject.
Omitted fields inherit, from lowest to highest priority: SDK defaults, view preset,
subject preset, view overrides, subject overrides. Generic SDK defaults are not the
same as the team's selected content calibration. Preserve the rest of the document:
`setCameraFollow({configuration})` installs a complete document, not a partial patch.

For a new named view, explicitly reference an embedded preset with the matching
`kind`; the same kind does not inherit another view's settings. Subject bindings
are also keyed by the new view ID. Reuse the preset and add only the desired
parameter overrides rather than copying all resolved values into a new preset.
Existing views and their defaults remain available through `setCameraView(viewId)`.

With `binding.mountTarget:'vehicle'`, the resolved subject is the vehicle while
riding and the human after dismounting; shared view overrides still apply to both.
Put vehicle-only settings in
`binding.subjectOverrides[vehicleInstanceId].views[viewId].overrides`.
For gradual vehicle heading follow, use `referenceFrame:'world-up'` with
`recenter.enabled:true`. For camera-relative walking, retain the native human
`world-up` and `recenter.enabled:false`. In a subject-relative frame,
`inheritSubjectYaw:true` can make lateral walking continuously rotate both the
person and camera; disabling recentering alone does not disable this inheritance.

Declaring a view named `swimming` does not automatically select it. To opt in,
reference that named view from `viewSelection.rules`:
```json
{"viewSelection":{"rules":[{"id":"in-water","when":{"state":"swimming"},"viewId":"swimming"}]}}
```
The view must already exist and reference a compatible preset. Currently `swimming`
is a measured native-human state; ordinary Mesh subjects may not provide it.
Unconfigured projects keep the existing camera behavior, including native swimming
eye/follow-point adjustments. No matching rule uses `defaultViewId`; unavailable
state/anchors are reported locally while retaining a legal view.

Rules use descending `priority` (default 0), then document order. Optional
`enterDelaySeconds`/`exitDelaySeconds` (default 0) filter brief state changes.
Delays apply only while the current view's required anchors remain available.
The SDK evaluates committed state once per fixed step; do not write a second rule
loop. `setCameraView` and view-cycle input hold a manual choice until
`resumeCameraViewSelection()` or subject/reset invalidation. Orbit/zoom still work.
Automatic switches retain the player's orbit heading in the destination reference
frame, within its angle limits, while applying that view's framing. Explicit view
selection keeps its calibrated opening.
Inspect `observation.camera.viewSelection` for the chosen rule, pending switch or
unavailable reason. Applied edit drafts suspend rules until resumed or released. Authored
camera mode is never taken over. Unavailable rules include the candidate view and
original failure message/field path; use these to correct the binding or override.

### Authored camera control

For direct Three camera control, call `world.useAuthoredCamera()` outside World
update/render callbacks. Update `world.camera` through `world.onUpdate` only while
`world.cameraMode === 'authored'`. SDK following, recentering and camera collision
are inactive in this mode; authored camera logic is responsible for those effects.
To return control, stop authored camera writes and call
`world.setCameraFollow({configuration})` with a complete document. Reuse the World
clock and keep one camera writer. During Episode's exclusive capture lease,
external ownership changes are rejected.

### Opening and lifecycle

For an authored opening, configure a third-person view with `opening` and
`framing.kind:'preserve-opening'`. `activation:'on-input'` preserves it until
input activates following. The human example leaves third-person pitch/zoom limits
unbounded to preserve reference compositions; any chosen bounds must include the
intended opening. The discovered field schema includes units and short behavior
descriptions. Optional `orientation.recenter.yawTarget` chooses
`subject-forward` (default), `movement-direction`, or `world-forward` with
`yawRadians`. Movement direction follows horizontal travel, including reverse;
insufficient motion holds the orbit. Configure recentering, damping, zoom and transitions
in that view's overrides. The nonhuman binding example includes the
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
| How does the final HUD look? | `world_preview({view:'current',includeUi:true})`; authored React UI over the sampled world |
| Check geometry without HUD? | `world_preview({view:'current',includeUi:false})`; pure Three canvas |
| What does this state look like? | `world_preview({view:'current'})`; no pause/reset/step; a live world continues |
| Why is movement/action blocked? | `world_inspect`: `snapshot` for state, `description` for eligibility; `hierarchy`/`diagnostics` for geometry/physics |
| Do real controls and the route work? | `world_playtest`; resets and runs episode keys, pointer drags and explicit commands in real time |
| What happened during a recording? | `world_read_playtest({operationId,fromSeconds,toSeconds})`; reads existing samples without execution |
| Does the area fit the overview? | `world_preview({view:'top-down'})`; inspect bounds and boundsSource against all playable routes |
| Why is the page small or blurry? | `world_inspect({sections:['viewport']})`; compare live canvas render/display sizes, pixel density and camera aspect |
| Does rendering follow a window size change? | Optional `world_check_viewport({widthCssPixels:1280,heightCssPixels:800})`; temporarily resizes the browser, samples, then restores the original viewport |

Opening/current previews default to `includeUi:true`; projects without `project.ui`
return a clean world image with `ui.included:false` and `reason:'not-defined'`.
Top-down/entity-triview accept only omitted/false `includeUi`. Formal captures and
recordings always stay UI-free. See [UI screenshot behavior](ui.md#agent-screenshots)
for state, animation and failure semantics.

Use existing frames and state to locate the cause before changing code or inputs.
An edit opens a new build; keep earlier evidence associated with its original
identity. Playtest summaries include recorded action outcomes; use world_read_playtest for
the relevant interval. For vehicle issues, request world_inspect's `vehicles`
section and its wheel detail only when needed; check sampling status/time before
interpreting values. These reads do not add generation acceptance gates.
Viewport feedback also accompanies opening/current previews and the final playtest
observation. Screenshot/video dimensions do not prove live canvas clarity. Density
below one render pixel per CSS pixel is an advisory blur risk; native screen density
is reported separately, not required. Compare canvas bounds with its intended parent
layout; embedded or fixed-size canvases need not fill the browser. The optional resize
probe waits 250 ms at each size, reports before/resized/restored measurements, and
does not pause, reset or step the world; a live world continues. It tests a browser
viewport change, not the Fullscreen API. Check restorationStatus; unavailable
measurements are unknown, and warnings never change recording/submission eligibility.
An accepted action is not completion: inspect its World operation and
resulting state. Proximity alone does not prove interaction or prop displacement.
Poll the same Creator operationId with `operations_get`; never repeat an action
to poll. Read actual errors; unavailable telemetry is not measured success.

## Record and submit

Timed Episode steps run for `durationSeconds` in wall time; keys stay held until
`keysUp`. Omit the playtest duration to execute the complete plan. A shorter
value tests the prefix from opening. Read the control registry for each action;
pressed edges and continuous axes differ. Use the active vehicle inputGuide for
family-specific axes. `framesPerSecond` controls video sampling, not simulation.

For an already mounted wheeled vehicle or motorcycle, schema version 2 also accepts
a feedback-controlled `driveTo` step. Supply a traversable sequence of targets with
enough room for the vehicle's turning radius; this does not find paths or avoid obstacles.

```json
{"driveTo":{"vehicleId":"motorcycle","positionWorldMetersXYZ":[12,0,25],"maximumSpeedMetersPerSecond":4,"arrivalToleranceMeters":1.5,"stopAtTarget":true},"timeoutSeconds":30}
```

The SDK controller computes body-relative throttle, steering and braking from actual
physics state. `stopAtTarget` defaults to true: arrival requires staying within the
3D tolerance at no more than 0.25 m/s for 0.4 simulation seconds. Set it to false
only for intermediate points; stop at the final point before a following F-key step.
Speed defaults to 4 m/s (accepted range >0–12), tolerance to 1.5 m (0.25–5).
Speed is a control target; physical braking can briefly overshoot it.

`timeoutSeconds` is a wall-time limit, not a hold duration. Do not combine `driveTo`
with keys, commands, lifecycle, pointer drag or `durationSeconds` in the same step.
Keys are released before driving, and the route input override is released afterward.
Omit the tool's duration override for a complete plan: bounded steps finish early;
`plannedSeconds`/`requestedSeconds` include their timeout budgets, while actual elapsed
time is recorded separately. A full road-input-only plan can provide real-input evidence.
Timeout, sustained lack of progress, reset or subject changes fail the recording and
prevent subsequent steps. Inspect `feedback.roadRoutes` and `roadRouteResults` for
outcomes, subject identity and endpoint samples; `roadRouteTrace` identifies the full, hashed
`road-route-trace.json` in the recording evidence. `world_read_playtest` includes a
compact route summary. These outcomes do
not replace visual review or turn a reset between steps into a successful return trip.

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

For a separate streaming HUD, read [streaming UI](ui.md), available through
`creator_get_authoring_schema({document:"ui.md"})`. It defines project files,
component props/events, state-bound visibility, source-time animation and the producer binding.
