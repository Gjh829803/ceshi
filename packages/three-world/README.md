# Three World SDK 0.2 experimental

Create ordinary Three.js geometry and compose the reference camera freely. Import
`three` and `createWorld` from `@worldkit/three`. The SDK owns one fixed clock,
physics world, controlled character, animation, follow camera and command state.
This is the public v2 API; old engine transports are private.

See the [architecture and responsibilities](../../docs/three-sdk-architecture.md).
Start with the basic world API below; parameters, actions and tasks are optional
interfaces for scenes that need them. Creator delivery and Episode scheduling
remain outside this runtime package.

<!-- topic:training -->
## Training runtime

`createWorld({scene, camera, renderer, training})` selects the integrated training
solver as the world's only physics backend. It runs at 60 Hz using the existing
SDK clock, Presentation and Episode port. Ordinary worlds retain their existing
Three/Rapier backend. Training content supplies its map, vehicle specifications,
instance IDs and Three visual roots; the SDK contains no training map catalog.

```ts
import {createWorld, TrainingCharacter} from '@worldkit/three';
const character = new TrainingCharacter();
await character.load(path => resourceUrls[path]); // e.g. humanoid/source/…
const world = await createWorld({scene, camera, renderer, training: {
  map,
  character: {instanceId:'player', object:character.root, animation:character},
  vehicles: [{instanceId:'rover-a', assetId:'rover', spec:roverSpec, object:roverRoot}],
}});
await world.execute({type:'training.approach', instanceId:'rover-a'});
await world.execute({type:'training.enter', instanceId:'rover-a'});
await world.start();
```

`TrainingCharacter` loads the unchanged original skeleton and runtime actions;
the optional URL resolver supports hash-addressed, relocated resource bundles.
Asset identity and scene instance identity are separate, including duplicate
instances of one vehicle asset. Training vehicles use their supplied collision
envelopes; generic actor registration does not create additional capsule bodies.

The `training` namespace exports reusable content types and input/visual helpers.
Use `world.training` for preparation, safe approach/enter/exit, map switching,
camera mode 0/1/2, and profiles. `onVisualUpdate(dt)` updates pure visual descendants
after the SDK has placed and animated actors. It must not rewrite actor roots,
physics, the character mixer or camera. Do not install a second frame clock.

Movement profiles use `training.TrainingControl`. Each instance resolves its own
numeric defaults, and partial edits merge without deriving new braking or speed
limits from unrelated fields. `exportProfile()` returns the full effective record;
snapshots expose `training.controls`. Reset, map replacement and Episode starts
preserve the effective configuration. Save the exported profile with your source
and apply it during world initialization; browser local overrides alone are not a
delivery configuration.

```ts
await world.execute({type:'training.profile',profile:{vehicles:{'rover-a':{
  speed:20, maxSpeed:30, reverseSpeed:5, accel:8,
  coastDeceleration:2, brakeDeceleration:18, brakeDamping:4,
  steeringResponse:10, steeringReturn:16,
}}}});
```

For surface vehicles, `speed` is the normal forward cap and `maxSpeed` the boosted
cap; `reverseSpeed` is independent. Acceleration/coasting/reverse braking use
m/s²; handbrake damping and steering response/return use 1/s. Aircraft instead
use `speed` as their cap, `drag` plus `dragQuadratic * speed²` for air resistance,
`pitchResponse`/`rollResponse` for attitude, and `throttleResponse` (plane) or
`launchSpeed`/`minimumSpeed` (glider). Submarines expose `verticalAcceleration`,
release `linearDamping`/`verticalDamping` and powered horizontal `drag` (1/s).
Spacecraft use `grip` for uncommanded-axis stabilization and `brakeDamping` for
Shift braking. Mounts/carriages cruise at `speed * .58`, with independent
`maxSpeed`, `slowSpeed`, `reverseSpeed` and linear braking. Dragons separate
`groundSpeed` from flying speed and air coasting.

The existing humanoid calibration remains explicit: normal movement is
`speed * 3.1 / 3.8`, ground acceleration is `accel * 14 / 12`, air acceleration
is `grip * 5 / 3`, turning is `steer * 8 / 14`. `maxSpeed` (sprint), `slowSpeed`,
`coastDeceleration` and `jumpSpeed` are independent actual-unit values. Not every
family consumes every field; the Playground shows family applicability. These
parameters do not override collision, gravity, traversal or animation execution.

All normal movement keys use SDK Presentation focus and input release. F enters
or exits, E interacts with character targets, and the source humanoid and vehicle
bindings remain available through `training`. `setInput(input)` supplies a
programmatic override and returns a release callback scoped to that override.
An older callback cannot release a newer UI or model override. Call that callback
when a demo or touch interaction ends; idle UI must not force-release model input.
`setInput(undefined)` explicitly clears any current override. `WorldInput.training`
supplies the same complete input to deterministic SDK/Episode ticks. Action edges
are consumed once in a multi-tick step.

The closed model command family is `training.prepare`, `training.approach`,
`training.enter`, `training.exit`, `training.camera`, `training.input`,
`training.profile` and `training.action`. Requests use normal command identities,
receipts and revision checks. Running character actions return an operation whose
terminal status follows actual controller completion or cancellation. These
commands are direct executions, not nested authoring action/parameter plans.
Generic navigation, impulse and root-edit commands are unavailable for training
actors. Preparation and Episode starts may relocate; ordinary motion uses input.

Profiles merge by instance ID and export the complete effective configuration.
Configuration persists across reset; actor motion, mounting, interaction objects,
input, animation history and the active map's physics state reset. Character
controls scale the original physical controller from source defaults (3.1 m/s
jog, 5.8 m/s sprint), preserving original action timing. `cameraDistanceMeters`
overrides arm distance; null restores the map/vehicle default.

`world.snapshot().training` records real map, vehicle identity/family, mounting,
speed, medium, stance and active character action state. Ordinary entity motion
and animation observations reflect these same actors. Episode capabilities add
the training families and instance IDs. `EpisodeStart.training` can select a
vehicle and initialize mounting, camera mode, velocity, pitch, roll, throttle and
launch state. The top-level start position then names the vehicle origin; facing
retains the SDK's semantic -Z convention. The entire body and medium are checked
before initialization, and subsequent frames advance through the same solver.

<!-- topic:character-actions -->
## Choosing and triggering character actions

Read the current environment asset policy, then search/describe the selected
character. Asset tools return `characterUsage`: clip count, integration route,
guide/example topics, and (for the allowed Training kit in SDK tasks) the actual
SDK skill summaries and key bindings. Clip counts are not counts of executable
skills. Ordinary ground characters automatically select idle/walk/run/jump/fall
when those clips are supplied; extra clips alone do not add physical abilities.

<!-- asset-info:humanoid.source-101 -->
For contextual character movement, select `humanoid.source-101` and read
`creator_get_examples({topic:'character-actions'})`. This small example loads all
48 supplied clips with `TrainingCharacter`, has no vehicle dependency, and shows
commanded rolling plus automatic deep-water swimming. Its short input episode is
a debugging example, not a complete Creator delivery or all-action acceptance.
Interactive key bindings below are not the Creator episode key allowlist. The
example episode uses supported movement keys to enter water; discrete skill
requests can use the existing schemaVersion 2 episode `commands` contract.

Initialize `createWorld({training:{map,character,vehicles:[]},...})`; this selects
the Training solver as the world's only physics backend. Do not layer a second
controller/mixer on an ordinary `addCharacter` world. Scene visuals are authored
in Three; Training receives actual collision boxes, water and interaction anchors.

| Motion family | Trigger | Required scene/state |
| --- | --- | --- |
| Stand, walk, run, jump, fall, landing | Movement/input and actual support state | Ground/collision geometry; animation follows the controller |
| Swim idle/forward/freestyle | Automatic deep-water contact; N changes style | Declare `map.water`; provide an actual pool bottom and banks, not a ground collider covering the pool |
| Roll / slide | V / Q or `training.action` | Land, ground support, standing, free hands, no conflicting action/cooldown; slide also requires speed >= 2.5 m/s |
| Pickup / carry / put down | E / G or `training.action` | `map.interactions` pickup anchor, reachable approach and clear path; <= 8 kg; source's table-height grasp must fit the actual object; placement needs support/clearance |
| Sit / stand up | E / E or Space; corresponding skill request | Seat interaction and its collider IDs, clear approach; standing up needs headroom |
| Prone / crawling | Z, then directional input | Clear low capsule route; enough headroom to stand again |
| Wall / ladder | B to enter/release; directional input; Space to detach | Registered `map.climbSurfaces` bound to actual colliders, valid proximity/orientation and available space |
| Hurdle / mantle / climb onto a ledge | Direction toward the obstacle + Space | Actual obstacle probe and compatible source motion, clear top/path/headroom; directional request can catch a ledge during approach |

Water contact uses the declared horizontal bounds and a ray against the actual
supporting collider to measure local depth. Current entry requires depth > 1.28 m
and feet > 0.95 m below the surface. Remaining in swim uses depth > 1.16 m and
feet > 0.5 m below the surface to prevent shoreline flicker. The water controller
applies vertical velocity/buoyancy through collision movement; it does not simply
teleport the character to the water plane. Shallow water returns to walking.
The animation owner then selects swim idle or a moving swim clip from actual
state/speed/style. A blue material alone never enables swimming.

Only `roll`, `slide`, `pickup`, `putDown`, `sit`, `standUp` are discrete
`training.action` requests. Crouch, prone, climb and swim-style changes use input;
walk/run/landing and swim transitions are controller state, not invented action
commands. There is no dedicated put-down clip. Some clips are transition material.

```ts
// Approach targets with real input before requesting interaction.
const receipt = await world.execute({
  type:'training.action',
  request:{requestId:'pick-parcel-1',action:'pickup',targetId:'parcel'},
});
// Inspect receipt. If accepted, poll its operationId using world.operations.get,
// or world_get_operation from Creator. Do not repeat an unknown request outcome.
```

Inspect `world.snapshot().training.character` for state, swimming, stance,
carrying/seated and active action. Runtime eligibility checks are authoritative:
a clip existing or a request being accepted does not prove action completion.
Render pickup objects from the shared Training interaction state so a held object
does not remain duplicated at its initial position. Test real inputs and scene
conditions in a short playtest before the full recording; preserve rejections.

For debugging, `world.snapshot().training.water` exposes the declared volume
count, whether the humanoid water controller is active, and a detached copy of its
latest contact sample. Contact includes water ID, surface/depth in metres,
submersion ratio, feet below surface, the existing entry/retention thresholds and
their recorded pass/fail flags. These are observations, not writable parameters
or an additional physics query. Mounted/traversing characters suppress stale
contact; a null contact after initialization/reset is not proof that no water
was declared.

Creator `world_inspect` returns `feedback.water` with a diagnostic code, measured
evidence and suggested scene checks. `world_playtest` includes the same advisory
feedback and `feedback.waterTimeline`: the first sampled state plus changes,
with actual wall time/simulation tick, retaining the latest 128 events and the
omitted count. Causes include no declaration, no contact, shallow actual support,
insufficient immersion and active swimming. Check intended geometry and position
before changing a scene. Feedback never changes validation, swim thresholds,
playtest status or submission eligibility; old/raw snapshots without these fields
report unavailable diagnostics rather than guessed state.

Training map/interaction headings use the source's +Z convention, while normal
SDK entity facing/capture uses -Z. Follow the actual map types and example anchors;
do not rotate source skeletons or change SDK physics to fit a scene.
<!-- /asset-info -->

<!-- topic:getting-started -->
## Start a world

```ts
const world = await createWorld({scene, camera, canvas});
world.addEntity({id:'ground', object:groundMesh, role:'terrain'});
const hero = await world.assets.load('humanoid.preset-101');
world.addCharacter({id:'hero', asset:hero});
world.setControlledEntity('hero');
world.setCameraFollow(); // continue the camera composition already authored above
world.setCaptureTargets(['hero','tower']); // register tower first
await world.start();
```

Asset IDs must be selected in project.json. `createWorld` reads the Host-provided
same-origin './asset-definitions.json'. Humanoid leads use the configured default
catalog asset above. Clothes, colors and headwear may customize visual descendants
while retaining its rig and SDK animation ownership. Other characters remain
available for scenes that need them. `addCharacter({id,object,body})` accepts custom
subjects but supplies no automatic limb animation; prefer proven humanoid motions.

An SDK-owned renderer fits its canvas to the stage (fullscreen for a bare canvas) and follows resize events. Pass an existing renderer to keep your own sizing policy.
Create `world.createPresentation()` for game UI and future model-video display.
HUD, menus and prompt controls belong in its independent HTML layer; read the
`presentation` schema topic for mounting, bindings and clean world capture.

Terrain/obstacle default to fixed collision; decoration has no collision. Use
kinematic for a moving door/platform, dynamic for supported rigid-body impulses.
Register small visual stones as decoration when they should not impede walking.

With no orbit overrides, `setCameraFollow()` preserves the current camera pose,
FOV and framing, then smoothly follows the controlled entity's translation.
It does not automatically move closer or center the subject. Orbit/zoom input
persists; `followHalfLifeSeconds` controls translation smoothing (default .08).
The controlled entity is followed by default; `targetEntityId` selects another.
Explicit distance/pitch/target-height values retain the legacy target framing;
use them only for an intentional camera transition. `framingMode:'preserve-opening'`
can select inherited framing explicitly (without distance/pitch overrides).
The camera stays at the authored first-frame pose until input. WASD moves, arrows/drag rotate camera, Shift runs,
Space jumps, E interacts, R resets. `setCameraFollow` accepts transitionSeconds,
collisionRadiusMeters and recoveryHalfLifeSeconds when tuning is necessary.

The shared collision solver uses the registered character body, retracts away
from real solids, and limits recovery with `maximumRecoveryMetersPerSecond`
(default 3) and `recoveryHalfLifeSeconds` (default .18 for preserved opening,
.24 for target framing). Target framing additionally
compensates orientation to maintain the subject's angular position during
retraction. Preserved opening framing retains the authored orientation and roll.
`targetHalfLifeSeconds` controls target-framing translation damping (default .1);
an explicit value also remains supported for preserved framing when
`followHalfLifeSeconds` is omitted. Either damping value may be zero.
Physical clearance may require immediate movement. Camera snapshots expose the
collision pivot, arm length, obstruction, phase and transition progress.
`useAuthoredCamera()` explicitly returns camera control for a cutscene;
`setCameraFollow()` takes it back from the current pose.

`start()` awaits preparation and publishes `window.__WORLDKIT_EVAL__` automatically.
Use `stop()` to pause and `await reset()` to restore the baseline. Do not call the
old expose/render/step methods or create another simulation timer. Query actual
motion/animation through `getEntityState(id)` and camera state through `snapshot()`.

Ground locomotion keeps its animation across brief small-step departures and
single-tick contact-speed fluctuations. Fall presentation requires sustained
airtime and meaningful descent, with a bounded timeout for unsupported actors.
An accepted jump still starts immediately. This presentation grace does not
change physical `motion.isGrounded`, gravity, collision or jump eligibility.
Episode relocation, teleport and reset discard the affected locomotion history;
Episode input, camera relocation and the single fixed clock retain their behavior.
Automatic walk/run playback removes a common positive first-key timestamp from
its private loop copy and preserves normalized gait phase during direct walk/run
transitions. Raw asset clips and explicit/manual playback keep their authored
timing. Idle, jumping and reset do not inherit the previous gait phase.

<!-- topic:assets -->
## Verified assets and lifetime

Use Creator assets_search/assets_describe, then select IDs in
`project.json: {schemaVersion:1,assetIds:[...]}`. The compiler copies verified GLBs
and public metadata to the playable. `world.assets.search(query)` describes the
packaged selection; `world.assets.load(assetId)` creates an independent instance.
The SDK initializes available idle pose and owns animation after addCharacter.
No manual AnimationMixer/update(0), hash entry, retargeting or private file path is
needed. An actionId in an asset is an animation, not a physical movement ability.

For humanoid leads, read `assetPolicy.defaultHumanoidAssetId` from the Creator
environment and pass the loaded `asset` to `addCharacter`. Asset search and exact
descriptions expose only the allowed task catalog. Other assets and custom
characters remain supported according to that task's policy.

<!-- asset-info:humanoid.preset-101 -->
`humanoid.preset-101` uses the Playground's original 101-bone model with
supplied idle/walk/run/jump/fall clips through ordinary `ground.standard` movement.
Landing returns to idle/walk/run. Clothing and color changes can retain the preset
body and rig.
<!-- /asset-info -->
<!-- asset-info:humanoid.source-101 -->
The Training Playground body with all 48 contextual actions is available as
`humanoid.source-101` through `TrainingCharacter`; read the `training` schema and
`independent-world` example for traversal, swimming and interactions. Those
abilities also require supported scene geometry/targets. An animation does not
create their physics.
<!-- /asset-info -->
Existing worlds keep their original asset identity; current task permissions do
not retroactively rewrite historical deliveries.

The actor's default local front is **-Z**, up is **+Y**, and limbs usually extend
down **-Y**. In that frame a knee flexes backward with **negative X** rotation;
an elbow flexes forward with **positive X** rotation. A +Z-facing animation recipe
cannot be copied unchanged. For a differently oriented rig, derive directions
from its actual bind pose. Inspect walk/run from the side, checking knees, elbows,
foot contact, facing and speed; also test jumping, landing and reset. A technical
playtest pass does not assess anatomical motion.

For asynchronous changes in a running world:

```ts
await world.runTask(async scope => {
  const asset = await scope.assets.load('humanoid.preset-101');
  scope.addCharacter({id:'guide',asset});
});
```

A reset/dispose invalidates the scope. Use its assets/register/execute/setState
methods after await; do not allow an old Promise to mutate a new world epoch.
Loading again creates another instance; one AssetInstance cannot drive two live
characters. Body recommendations and locomotion bindings come from verified
metadata. If missing, author an explicit body or report the limitation.

`await world.registerPrototype({id,description,template:{kind:'character',
options:{asset}}})` prepares a reusable template; options has no instance ID.
Spawn through entity.spawn. entity.attach supports a nonphysical child subtree,
with positionLocalMetersXYZ; physical grabbing/riding is a separate capability.

<!-- topic:control -->
## One state for gameplay and text commands

```ts
const open = world.defineParameter({
 id:'gate.open',description:'Open the gate',schema:{type:'boolean'},initialValue:false,
 writes:[{kind:'entity',entityId:'gate',channels:['rotation']}],
 plan:value=>[{type:'entity.set-rotation',entityId:'gate',
   rotationLocalRadiansXYZ:[0,value?Math.PI/2:0,0],durationSeconds:.35}]
});
world.onInteract('gate',()=>({type:'parameter.set',parameterId:open.id,value:!open.value}));
```

The gate is your hinge Group registered as kinematic. Parameter.value is the
committed desired state, status reports transition/interruption, and actual
transforms are queryable. A property plan only returns persistent property
commands. A registerAction plan composes built-in commands/parameters and declares
its writes. Neither plan may mutate scene objects, perform IO or return a Promise.
Use `world.state.define(id, initialValue)` for resettable private game data.

`describe({query,entityIds})` returns actual capabilities, schemas, current state,
prototypes, geometry choices, movement definitions, parameters and unavailable
reasons. Positions use positionWorldMetersXYZ; attachment offsets use
positionLocalMetersXYZ; scale and rotation explicitly use Local fields.

```ts
const receipt = await world.execute({type:'actor.move-to',entityId:'guide',
 targetPositionWorldMetersXYZ:[5,0,3]});
if (receipt.status==='rejected') throw receipt.error;
if (receipt.status==='accepted') {
 const result = await world.operations.wait(receipt.operationId);
 // Inspect succeeded / failed / cancelled; accepted did not mean reached.
}
```

While paused, instant commands apply at the pause boundary; ongoing operations
return accepted and wait for explicit start. Wait observes state events and does
not start the world. Reset/dispose cancel
operations and wake waiters; AbortSignal only aborts that wait. Use operations.cancel
to cancel the operation itself. World operation IDs are distinct from Creator tool
operation IDs. Asynchronous follow-up writes belong in world.runTask(scope).

NPC move/follow takes over autonomy; stop keeps it paused until resume-autonomy.
Player input owns the controlled actor. Single animations return to locomotion;
loop playback requires stop-action. set-visible only affects rendering; despawn
removes the entity/collision/tasks. Capability rejection is not SDK success.

<!-- topic:extensions -->
## Small authored extensions

Movement returns intent; the SDK still performs the actual KCC collision step:

```ts
world.registerMovement({id:'hover',version:1,description:'Player-controlled hover',
 initialState:{elapsedSeconds:0},
 update:({input,desiredDirectionWorldXYZ,deltaSeconds,state})=>({
  state:{elapsedSeconds:state.elapsedSeconds+deltaSeconds},
  velocityWorldMetersPerSecondXYZ:[desiredDirectionWorldXYZ[0]*4,
    input.jump?2:-.5,desiredDirectionWorldXYZ[2]*4],applyGravity:false
 })
});
await world.execute({type:'actor.set-movement',entityId:'hero',movementId:'hover'});
```

This is controlled motion, not flight navigation. Do not promise NPC aerial
pathfinding from a movement callback. Query registered movements and entity
commands; switching back uses the registered ground movement ID from describe.
The callback is synchronous and pure, uses SDK input/time/body/probes, and returns
velocity/state. It must not move Three roots, create physical bodies or own a timer.

A visual/state parameter may use an effect instead of a property plan:

```ts
world.defineParameter({id:'sky.mode',description:'Choose the sky',
 schema:{type:'string',enum:['day','aurora']},initialValue:'day',
 writes:[{kind:'visual',channelId:'scene.sky'}],
 effect:value=>{scene.background=new THREE.Color(value==='aurora'?'#102d53':'#acd0d9');}
});
```

Effects may synchronously change declared visual/state channels. They cannot
mutate managed entity roots, colliders or camera, do IO, or return a Promise.
Keep physical gameplay in commands; changing a sky color does not change gravity.

```ts
await world.registerGeometry({id:'bridge.long',description:'Longer bridge deck',
 geometry:new THREE.BoxGeometry(3,.3,8)});
await world.execute({type:'entity.set-geometry',entityId:'bridge',geometryId:'bridge.long'});
```

Named geometry applies to a registered non-skinned Mesh. The SDK prepares and
validates replacement collision/navigation before commit; keep the original
geometry registered under another ID to restore it. Do not mutate a published
geometry template. Geometry IDs are discoverable; an effect cannot secretly edit
physics geometry. Async procedural geometry uses scope.replaceGeometry.

The complete sdk-capabilities example combines these features with a reusable
character, complete custom fox, real stairs, ramp, NPC controls and reset.

<!-- topic:presentation -->
## Independent UI, world pixels and model output

Keep HUD, nameplates, menus, crosshairs, prompt inputs and other game UI out of
the Three scene and renderer. Use ordinary HTML/CSS mounted through one
`world.createPresentation()` per world. Actual signs and other objects that
belong to the physical world may remain scene geometry. The SDK manages layer
placement and input routing; you choose the UI layout, styling and behavior.

```ts
const presentation = world.createPresentation();
const score = world.state.define('score', 0);
const hud = document.createElement('output');
hud.style.cssText = 'position:absolute;left:16px;top:16px;color:white';
presentation.ui.bind({id:'score', element:hud, clock:'presented',
  read:()=>score.value,
  render:value=>{hud.textContent = `Score: ${value}`;}
});
const resetButton = document.createElement('button');
resetButton.style.cssText = 'position:absolute;right:16px;top:16px';
presentation.ui.bind({id:'reset', element:resetButton, clock:'live',
  read:()=>score.value,
  render:value=>{resetButton.textContent = value ? 'Restart game' : 'Reset';}
});
resetButton.onclick = async()=>{await world.reset(); presentation.focus();};
```

Bindings sample authoritative SDK state; they do not own another game state or
clock. Update the score through its state handle in gameplay. UI event handlers
read current state and call existing `world.execute(...)` commands, state handles
or lifecycle methods. Never use a delayed HUD value as authority for a command.
Binding values must be JSON data. Each binding mounts its element automatically;
`ui.mount(element)` also accepts a freeform HUD or framework root without a binding.
Standard HTML controls receive input. Use `ui.mount(element,{interactive:true})`
for a custom interactive area. UI focus releases gameplay keys and camera drag;
call `presentation.focus()` when the user resumes playing.

`container`, when supplied, must already be the source canvas's parent and have
an explicit size. The SDK places model output and UI in that stage; the world
keeps ownership of camera/render resolution. Avoid creating a second world or
moving its renderer into a separate video container.

`modelInput.captureFrame()` returns `{image,source}`: a clean world ImageBitmap
and a source key containing presentation ID, epoch and frame ID, plus tick,
revision, capture time (the source browser’s monotonic performance clock) and pixel dimensions. It renders without stepping physics.
The caller must close the bitmap after consuming it. Only pixels and source
metadata leave this port; UI samples stay in bounded local history (default 240
captures, configurable with `historyFrames`). `modelInput.createStream({
framesPerSecond:24})` instead returns a clean canvas MediaStream and `close()`.
Its frame rate does not prove source-to-output frame correspondence.

The application supplies model transport. Display a returned decoded image with
`output.presentFrame({image,source})`, using the source key returned by the
service. Keep the source aspect ratio; mismatched decoded output is rejected.
Alternatively, attach a caller-owned MediaStream with `output.attachStream(stream,
{resolveSourceFrame})`. That optional resolver receives video-frame metadata and
returns the service's source key or null. It must not guess using a fixed delay.
These interfaces do not implement a remote model service or signaling. The
application can obtain the same active port from the SDK's existing
`window.__WORLDKIT_EVAL__.presentation` (also available on `__WORLDKIT_CREATOR__`);
the getter follows presentation disposal/recreation, so reacquire it when needed.
Raw/legacy worlds may not expose a presentation.

The source world keeps running behind model output. Menus and prompt input use
`clock:'live'`; gameplay HUD uses `clock:'presented'` (the default). With model
output, presented bindings use the retained sample for the displayed source key.
They are hidden if mapping is missing, stale or outside retained history; live
controls remain available. `status()` reports `live`, `mapped` or `unmapped`.
Video callbacks and DOM updates provide best-effort display synchronization,
not a guarantee of atomic pixel-level composition.

Use `ui.anchor({id,element,entityId,offsetLocalMetersXYZ:[0,2,0]})` to project an
entity-local label position through the source camera. The SDK accounts for the
displayed image rectangle and hides anchors outside the image or behind the
camera. This is not scene-occlusion testing or tracking of generated geometry:
the model may change where an object appears. Keep UI requiring exact output
tracking disabled until the model service provides that capability.

Reset invalidates source keys/history and returns to the world view; discard old
model responses. `output.showWorld()` switches back explicitly. Dispose releases
owned UI/listeners and input capture tracks, restores mounted elements, and
detaches external output streams without stopping their caller-owned tracks.

<!-- topic:observation -->
## Live observation and capture

SDK `await start()` installs WorldObservation-v2 on the actual scene/camera and
renderer, plus the gallery lifecycle alias. `setCaptureTargets` selects complete
registered important objects in priority order; omit incidental grass, stones and clutter.
The complete controlled subject is first; default capture delivers at most five sheets.
For repeated objects, choose one complete representative:
`{entityId, representative:{kind:"object", object}}` or
`{entityId, representative:{kind:"instance", object:instancedMesh, instanceIndex}}`.
Registration alone does not select an object for capture. Snapshots retain all entities, actual motion/animation,
worldRevision, tick, camera and structured errors; describe is the controller view.

Semantic local front is -Z; frontYawRadians rotates around local +Y. Three views
then apply the object's complete world quaternion, including parent rotation.
Right is front cross up. The Host captures real rendered front/right/back images.
It does not substitute a display clone or fabricate hidden geometry.

Creator `world_preview` with `view:'current'` shows the full page for Agent/UI
inspection. Opening and three-view captures read the pure world canvas. Model
input must use that pure canvas or `presentation.modelInput`, never a whole-page
screenshot, presentation container or model output. Keep derived reference and
three-view conditioning images free of baked-in HUD; preserve original inputs.

Read the real exports from contracts.ts using the Creator schema tool by topic.
Types describe the API; browser validation is still required for first-frame
fidelity, route support, continuous input, physical changes and 3–5 minute play.
