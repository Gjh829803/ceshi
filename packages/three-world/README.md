# Three World SDK

Author ordinary Three.js geometry, materials and cameras. The SDK binds physics,
movement, animation, input, camera follow and observable commands to that content.
When humans appear, keep the supplied humanoid's visible model, skeleton and motions.
Choose the controlled subject from the request; animal protagonists need no extra human.
Reuse other supplied subjects when suitable; otherwise create and bind simple
Mesh/Group subjects.

| Layer | Read or change |
| --- | --- |
| Reuse | `createWorld` or the complete `createHumanoidWorld` helper, subject example and selected asset |
| Bind scene and abilities | Collision map, interaction anchors, water, climb surfaces; custom subject body/movement |
| Configure | Movement/profile parameters, units, input bindings |
| Implement | Relevant SDK source module, project runtime build and affected tests |

One world owns one fixed clock, physics backend, controller per actor, animation
owner and active camera writer. Creator compiles and validates; Episode records.
Ordinary and Training cameras keep their framing and visibility policies while
sharing the [collision solver](../camera-collision/README.md). Each controller owns
independent recovery state. Display interpolation and repeated captures do not
advance that state; fallback positions come from fixed snapshots.

<!-- topic:getting-started -->
## Choose the controlled subject

`createWorld` is the general world entry point for human or nonhuman actors.
`createHumanoidWorld` is a convenience wrapper that loads or receives the supplied
human and binds its complete controller and actions, optionally with vehicles.
It calls `createWorld` internally and returns the same `ThreeWorld`; both entries
use the same runtime ownership and lifecycle.

Choose the helper when its complete human kit matches the task. Otherwise bind
the required subject and abilities through the general world API. Subject routes
guide this choice; they are not mutually exclusive SDK entity classes.

| Subject | Schema / example | Entry |
| --- | --- | --- |
| Human | `character-actions` | `createHumanoidWorld` |
| Human riding | `mounted-interaction` / `custom-vehicle` | Human helper + separate vehicle |
| Animal or other nonhuman protagonist | `nonhuman-subject` | `createWorld` + `addCharacter` |

A human model requirement applies to humans present in the scene, not to every
possible protagonist. Existing `getting-started` example files demonstrate a human.

### Human setup

Build white/light-gray primitive environment forms with uniform basic lighting.
Use identifying color for a few landmarks or interaction targets. Preserve broad
composition, scale, spatial relationships and actual collision/action conditions.
Keep the supplied humanoid visible; omit extra clothing, accessories, decoration,
atmospheric effects, reflections and elaborate shadows.

Select `humanoid.source-101` in `project.json` and obtain the `getting-started`
example from Creator. Author the visible scene in Three; `map` supplies the actual
collision geometry and action anchors.

```ts
import {createHumanoidWorld} from '@worldkit/three';
const world = await createHumanoidWorld({scene, camera, canvas, map});
world.setCaptureTargets(['player']);
await world.start();
```

The helper loads the selected resource bundle, binds the full humanoid controller,
and returns a `ThreeWorld`. Options include `characterId` (default `player`),
`vehicles`, `profile`, explicit `assetDefinitions`, a `resourceUrl(logicalPath)`
resolver, or a supplied `TrainingCharacter`. The world owns the supplied
character's lifecycle. `map` follows `TrainingMap`; inspect the actual schema or
example before authoring it. Contextual actions need the geometry described in
`character-actions`.

For a self-drawn subject, bind its visual root directly:

```ts
import {createWorld} from '@worldkit/three';
const world = await createWorld({scene, camera, canvas});
world.addEntity({id:'ground', object:groundMesh, role:'terrain'});
world.addCharacter({id:'fox', object:foxMesh,
  body:{heightMeters:1, radiusMeters:.3},
  movement:{kind:'ground', walkSpeedMetersPerSecond:2, runSpeedMetersPerSecond:5}});
world.setControlledEntity('fox');
world.setCameraFollow();
await world.start();
```

Geometry is unrestricted. A custom root receives collision and movement, but no
invented limb animation; skeletal clips require a compatible rig. Pure visual
children may animate using the SDK update callback. For vehicles, pass a
`TrainingVehicleInstance` with its own `object` and `spec` to `createHumanoidWorld`.
Choose the controller family and collision envelope for the shape you created.

An SDK-owned renderer sizes to the stage and follows resizing; a supplied renderer
keeps its sizing policy. Create HTML HUD through `world.createPresentation()`.
`start()` prepares resources and publishes `window.__WORLDKIT_EVAL__`; `stop()`
pauses, `reset()` restores the baseline, and `dispose()` releases resources.
Do not install an additional simulation timer or mixer.

<!-- topic:nonhuman-subject -->
## Independently controlled nonhuman subject

Create the requested animal or creature as the actor itself. Do not add a hidden
human or rider. Use `createWorld`, register collision geometry with `addEntity`,
bind the model through `addCharacter({object,body,movement})`, then select it with
`setControlledEntity` and `setCameraFollow`. `setCaptureTargets` identifies complete
subjects for Creator and Episode.

The [fox example](../../examples/three-creator/nonhuman-subject/main.ts), available
through `creator_get_examples({topic:'nonhuman-subject'})`, includes ground movement,
a collision obstacle, camera follow, visual leg motion and reset. Its project
selects no catalog assets; use permitted models when they fit the requested subject.
Ordinary Three geometry remains allowed even if custom external asset files are disabled.

Movement comes from actual SDK bindings. The built-in ground movement supports
walking/running/jumping with a capsule body. Other modes can use `registerMovement`
through the extensions contracts; a visual wing or fish tail supplies no physics,
pathfinding or compatible skeletal animation. A catalog creature documented as a
Training mount does not automatically provide standalone flight or swimming.
Keep visual limb animation on SDK update callbacks without moving the owned root.

This route has no human mount/dismount controller. Show controls for its actual
abilities, exercise movement/collision/camera/reset, and use the same Creator
playtest/submit and Episode capture interfaces. Training-specific character
continuity reports `not-applicable` when the ordinary SDK snapshot has no Training
controller; unavailable telemetry remains distinct from this result.

<!-- topic:assets -->
## Select, load and reuse assets

Use `assets_search` / `assets_describe`, then select IDs in
`project.json: {schemaVersion:1,assetIds:['humanoid.source-101']}`. The compiler
packages verified resources. `world.assets.search(query)` describes that selection;
`world.assets.load(id)` creates an independent instance for ordinary
`world.addCharacter({id,asset})` binding. Full contextual humanoid movement uses
`createHumanoidWorld`; playback of a named clip alone does not add an ability.

For Creator generation, every human (including NPCs and riders) must use the
permitted preset visible model, skeleton and motions; omit added clothing,
accessories and decorative visual children. Keep each person as the same instance
through walking, mounting, riding, dismounting and reset. Never hide the preset
person or include a replacement human in a vehicle model. Reuse other supplied
nonhuman subjects when suitable. When none fits and policy permits, draw simple Mesh/Group geometry
and bind its abilities. The catalog supports reuse without restricting Three
geometry; custom subjects and compatible external assets follow the task's
effective asset policy.

For a custom vehicle, see the [preset rider + custom motorcycle example](../../examples/three-creator/custom-vehicle/main.ts)
(`creator_get_examples({topic:'custom-vehicle'})`). Supply only vehicle geometry
as `TrainingVehicleInstance.object`, with a matching `spec` controller family,
collision envelope and local pelvis seat position. `createHumanoidWorld` keeps
its preset character and applies the supported mounted pose on that skeleton.
This does not provide universal hand/foot IK; inspect contact and seat fit.
The Creator requirement does not restrict the SDK's general custom-character API.

During Creator self-check, exercise walk → enter → ride → exit → walk → reset.
`characterContinuity` in inspect/playtest feedback tracks the Training character's
root, skinned mesh, geometry and bone identities plus scene/material visibility.
Rigid equipment is outside this identity comparison. It is
advisory: it cannot prove asset provenance, screen visibility, animation ownership
or the absence of an extra rider. Check key frames as well as state. The existing
asset-policy snapshot format and technical delivery contract remain unchanged.

An instance belongs to one live character. For asynchronous changes:

```ts
await world.runTask(async scope => {
  const asset = await scope.assets.load('humanoid.source-101');
  scope.addCharacter({id:'guide',asset});
});
```

Reset/dispose invalidates the scope. Use its methods after `await` so an earlier
load cannot mutate a different world epoch. Asset metadata supplies locomotion
bindings and body recommendations; otherwise specify the body explicitly.

The ordinary SDK semantic front is **-Z**, up **+Y**. The contextual humanoid map
and interaction headings use **+Z**. Follow each contract's coordinates; do not
rotate the source skeleton to compensate. Check rendered knees, elbows, facing,
foot contact, speed, jump and landing after changing a rig or motion binding.

<!-- topic:character-actions -->
## Humanoid action cards

<!-- asset-info:humanoid.source-101 -->
`humanoid.source-101` supplies 48 animation clips. Six skills accept discrete
`training.action` requests; posture and surface changes use `training.input`;
locomotion and transitions follow actual controller state. `characterUsage` in
asset tools exposes capabilities and controls. `world.training.characterCapabilities()`
returns live cards with `eligible`,
`reason`, `message`, `targetId`, requirements, scene conditions, parameters,
completion and source module. `snapshot().training.characterCapabilities` gives
compact live availability. `snapshot().training.interactionTargets` exposes
approach positions, facing and per-target eligibility. Use the `character-actions`
example and inspect runtime state before requesting an action.

| Ability | Trigger | Character and scene requirements / result |
| --- | --- | --- |
| Walk, run, jump, land | WASD, Shift, Space | Real supporting collision. Start/stop/turn/fall/landing clips follow motion automatically. |
| Crouch | C or Ctrl | Enter low stance; standing requires headroom. |
| Roll | Q; `roll` | Grounded, standing, empty hands, no conflicting action, cooldown clear. Collision can stop displacement. |
| Slide | Shift + new C/Ctrl press; `slide` | Grounded, standing, empty hands, free action/cooldown, speed ≥2.5 m/s. See the complete card below. |
| Pickup and carry | E; `pickup` with `targetId` | Pickup anchor, clear approach/path, empty hands, supported ground, object ≤8 kg; grasp position must fit the supplied table-height pickup. |
| Put down | G; `putDown` | Carrying, supported ground and a valid clear placement on a supporting surface. No dedicated put-down clip. |
| Sit / stand | E; `sit` / `standUp`; Space to stand | Seat anchor and its collider IDs, clear approach; standing requires headroom. |
| Prone and crawl | Z, then WASD | Space for the low capsule and a clear route. Standing requires headroom. |
| Wall / ladder | E to attach, WASD to climb, Space to attempt top, C/Ctrl to release | `map.climbSurfaces` references actual collider IDs; valid proximity/orientation and space. |
| Hurdle / mantle / high climb | Move toward obstacle + Space | Real obstacle probe, supported height/path/top and adequate headroom; controller chooses the applicable traversal. |
| Swim | Automatic deep-water contact; style through action menu/input | `map.water` plus actual pool bottom/banks. Deep immersion enables swimming; shallow support returns to walking. |

**Slide `slide`** — useful on open ground or through a low opening. A tunnel is
not required to start. The user holds Shift while moving and newly presses C or
Ctrl; pressing crouch during ordinary movement keeps the crouch intent. The Agent
can directly request `slide`, after accelerating to at least 2.5 m/s. Provide
run-up distance and actual colliders for a low opening. The character gradually
lowers its capsule to approximately 0.9 m; collision limits actual travel. At
exit it stands only if the 1.68 m standing capsule fits; otherwise it remains low
until it can move clear. Check the approach, lowest clearance and exit with real
input. Failure such as insufficient speed, occupied hands, cooldown or blocked
standing space must remain visible to the Agent. Runtime tuning and eligibility
are authoritative; see `ACTION_TUNING` and the character action module.

**Interactions** — `map.interactions` supplies stable `id`, `kind`, object
`position`, free `approach`, `yaw`, size/mass and target `colliderIds`. Reach the
approach within 0.9 m and its vertical tolerance before requesting pickup/sit.
These commands do not navigate. Render the movable object from the shared
interaction state so it follows the hand and does not remain duplicated.

**Water** — declare volume bounds and surface height, with a real lower floor.
A ground collider extending over the pool makes it shallow regardless of the
visible water. Entry currently requires measured depth >1.28 m and feet >0.95 m
below the surface; retention uses depth >1.16 m and feet >0.5 m below the surface.
`world.snapshot().training.water` and Creator `feedback.water` report the actual
contact and threshold decisions. `feedback.waterTimeline` records state changes
in a playtest. These diagnostics do not modify the controller or validation.

**Clip availability** — `prone-backward`, `prone-left`, `prone-right` and
`climb-ledge` are loaded material without a dedicated current controller
selection. Crawling turns and uses forward crawl; the wall-top transition uses
traversal. Do not advertise four additional executable skills from these files.

```ts
const receipt = await world.execute({type:'training.action', request:{
  requestId:'pickup-parcel-1', action:'pickup', targetId:'parcel',
}});
if (receipt.status === 'accepted') {
  const result = await world.operations.wait(receipt.operationId);
  // Check terminal status and the resulting carrying/seated/action state.
}
```

`accepted` means execution started. Check `operations.get`/`wait` and
`world.snapshot().training.character` for completion, rejection or cancellation.
Creator uses `world_get_operation`; polling never resubmits the action. Discrete
requests are exactly `roll`, `slide`, `pickup`, `putDown`, `sit`, `standUp`.
Crouch, prone, climb and swim-style changes are humanoid input fields.
<!-- /asset-info -->

<!-- topic:training -->
## Bind scene, controls and parameters

`createHumanoidWorld` uses the Training backend through `createWorld({training})`.
It is the world's single solver, driven by the SDK 60 Hz clock and shared by
Presentation and Episode. Author a `TrainingMap` with collision `boxes`, optional
`interactions`, `climbSurfaces`, water bounds, player spawn and scene bounds.
Scene geometry renders that same geometry; a visual surface is not a collider.

For explicit composition, create a `TrainingCharacter`, `await character.load`
with a resource resolver, then pass
`training:{map,character:{instanceId,object:character.root,animation:character},vehicles}`
to `createWorld`. Vehicle instance IDs differ from asset IDs; multiple instances
can reuse one visual asset and spec. `onVisualUpdate(dt)` updates visual
children after the SDK places actors, without writing roots, mixer or camera.

| Default input | Meaning |
| --- | --- |
| WASD | Movement; climbing directions |
| Mouse drag / arrows | Camera; vehicle-specific attitude axes |
| Shift held | Sprint / acceleration |
| Space | Jump / traverse / stand; climbing top attempt |
| C or Ctrl | Crouch / stand; release climbing |
| Shift + C/Ctrl | Slide after run-up |
| Z | Prone / stand |
| Q | Roll |
| E | Focused interaction / climb attachment |
| G | Put down |
| F | Enter / exit vehicle or mount |

Transition clips need no key. Swimming style is a secondary menu/input choice.
HUD hints and recording admission derive from `training.INPUT_BINDINGS`.
`world.getKeyBindings()` reads the effective bindings; `world.setKeyBindings({
roll:['KeyR']})` rebinds semantic actions and rejects duplicate/invalid codes.
`training.controlHints(bindings)` formats current labels. Esc belongs to the
application menu; reset is an explicit menu/button action. Use semantic
inputs/commands for Agent actions; key remapping need not change a plan.
Presentation UI focus releases held gameplay keys. Programmatic
`world.training.setInput(input)` returns a release callback scoped to that
override; release it when the interaction ends. `setInput(undefined)` clears the
active override. `WorldInput.training` uses the same input in deterministic ticks;
action edges execute once in a multi-tick step.

`world.training` provides prepare, approach/enter/exit, map switching, camera
modes and profile methods. These preparation helpers may relocate; normal
movement uses real input. Generic navigation, impulse and root-edit commands are
unavailable for contextual actors. Commands are `training.prepare`,
`training.approach`, `training.enter`, `training.exit`, `training.camera`,
`training.input`, `training.profile` and `training.action`.

```ts
await world.execute({type:'training.profile',profile:{character:{
  maxSpeed:6, jumpSpeed:5.5, coastDeceleration:8,
}}});
const effective = world.training!.exportProfile();
```

Profiles merge by instance ID, export full effective values and persist across
reset/map/Episode initialization. Save the effective configuration in the project
and apply it during initialization. Browser-local tuning alone is not delivery
configuration. Humanoid normal movement is `speed * 3.1 / 3.8`; acceleration is
`accel * 14 / 12`; air acceleration is `grip * 5 / 3`; turning is `steer * 8 / 14`.
`maxSpeed`, `slowSpeed`, `coastDeceleration` and `jumpSpeed` are independent actual
unit values. Speeds are m/s; acceleration/braking is m/s²; damping/response is 1/s.
Vehicle profile applicability depends on controller family; inspect the selected
spec. Parameters do not replace collision, traversal or animation execution.

`world.snapshot().training` exposes real character state, vehicle instance/family,
mounting, medium, speed, actions and effective controls. Reset clears movement,
held input, actions, object attachments and animation history. Episode uses the
same solver; its start may initialize a validated position/mount state and all
following actions must execute through actual input.

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
## Configure or implement a behavior

For a custom subject, `registerMovement` supplies an intent callback and
`addCharacter({object,body,movement:{kind:'custom',movementId}})` binds it.
Parameter/action APIs are useful for reusable game behavior, not prerequisites
for drawing a scene.

For runtime changes, call Creator `creator_materialize_runtime({})`, edit the
project's `sdk/` sources, and run `world_validate` to rebuild. Module entry points:

| Behavior | Source |
| --- | --- |
| Default humanoid setup | [humanoid.ts](src/humanoid.ts) |
| Bindings and input | [training/input.ts](src/training/input.ts) |
| Capability cards and action limits | [character-capabilities.ts](src/training/character-capabilities.ts) · [action-schema.ts](src/training/humanoid/action-schema.ts) |
| Roll, slide, pickup and sitting | [action-system.ts](src/training/humanoid/action-system.ts) |
| Crawling and wall/ladder movement | [surface-actions.ts](src/training/humanoid/surface-actions.ts) |
| Map and anchor contracts | [environment/types.ts](src/training/environment/types.ts) |
| World integration and profiles | [training/runtime.ts](src/training/runtime.ts) |
| Generic actor and command contracts | [contracts.ts](src/contracts.ts) |

Modify the existing owner, retain its callers/lifecycle, and verify both browser
play and Episode capture. The resulting runtime source and bytes travel with the
delivery. Scene code does not install a second physics, animation or camera loop.


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
Worlds without this port may not expose a presentation.

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

Reset invalidates source keys/history and returns to the world view; discard responses from an invalidated epoch. `output.showWorld()` switches back explicitly. Dispose releases
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

Creator `world_preview` supports opening, top-down and entity-triview captures
from the pure world canvas. Model input must use that pure canvas or
`presentation.modelInput`, never a whole-page
screenshot, presentation container or model output. Keep derived reference and
three-view conditioning images free of baked-in HUD; preserve original inputs.

Read the real exports from contracts.ts using the Creator schema tool by topic.
Types describe the API; use a complete real input plan to check broad opening
composition, connected routes and the requested core movement/actions and their
physical results. Choose the recording length by functional coverage.

<!-- topic:mounted-interaction -->
<!-- asset-info:training.horse,humanoid.source-101 -->
### Imported horse and rider anchors

`TrainingHorse` owns the real `creatures/horse.glb` skeleton, cloned clips and
playback resources. Load it with the Host's permitted logical resource resolver:

```ts
import { TrainingHorse } from '@worldkit/three';
const horse = new TrainingHorse();
await horse.load(resolveTrainingResource);
// Pass alongside the existing vehicle instanceId, assetId and calibrated spec:
const horseInstance = {
  instanceId: 'horse-1', assetId: 'training.horse', spec: horseSpec,
  object: horse.root, visual: horse,
  seatAnchor: {
    nodeName: 'Body', maximumOffsetMeters: 0.145579,
    maximumRotationRadians: 0.122951,
  },
};
```

The adapter must already be loaded, its logical root must be unit-scale, and its
vehicle mode must be `mount`. Model normalization stays under `content` (uniform
scale 0.451293531823, target bounds 1.4 × 2.3 × 3.55 metres). Runtime takes disposal
ownership when created successfully; otherwise the caller disposes the adapter.
Do not register another mixer or visual callback for this horse subtree.

`graze` samples the original Idle clip; `walk` and `trot` sample Walk; `gallop`
samples Gallop. The source has no trot clip. Motion phase is the fixed controller's
integrated stride angle: walk/trot advance at 2.5 × speed radians/second, gallop at
1.8 × speed (with the existing minimum rate). Idle uses the shared sample time.
Absolute clip evaluation is repeatable across display/fixed restores and epochs;
there is no render delta accumulation or historical crossfade. Smooth weights
use the current speed: Idle→Walk over 0.12–1 m/s, Walk→Gallop over 8–9 m/s. Only horizontal
Body translation is removed from cloned tracks; vertical stride and joints remain.

`spec.seat` remains the only logical seat. Omitting `seatAnchor` uses that fixed
root-local transform. A declared Body/socket uses its rest-pose inverse to derive
an animated root-local transform and rejects missing, invalid or out-of-bounds
anchors. The limits above round upward from 8192 intervals plus exact source key times
(maximum 0.145578694707 metres and 0.122950402397 radians), after normalization
includes intermediate blend geometry. A 64-interval-only limit missed key extrema. They apply to this
normalized horse, not arbitrary assets. `seat.driver` is not a bone in this GLB; use `Body` for its animated anchor.

Runtime samples the horse before aligning the actual Source101 pelvis under
`TrainingCharacter.actor`, then restores the fixed pose after display. It does
not move the logical rider root or capsule to follow a bone. The real horse plus
Source101 geometry fits the existing box envelope (X ±0.8, Y 0–3.3, Z ±1.9 metres)
across the measured fixed and animated seats; maximum measured height is
2.520854 metres. The rider remains a procedural seated overlay, with no authored
mount/dismount clips, rein contact solver or guarantee against visible body
interpenetration. Browser visual and capture acceptance are separate checks.

<!-- /asset-info -->
