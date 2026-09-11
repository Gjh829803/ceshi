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
Ordinary and Humanoid cameras keep their framing and visibility policies while
sharing the [collision solver](../camera-collision/README.md). Each controller owns
independent recovery state. Display interpolation and repeated captures do not
advance that state; fallback positions come from fixed snapshots.

Positions and dimensions use metres, with **+Y** up. Ordinary actor/capture semantic
front defaults to local **-Z**; Humanoid map headings, vehicles and interaction yaw use **+Z**.
Keep the supplied skeleton orientation unchanged when connecting these conventions.

<!-- topic:getting-started -->
## Choose the controlled subject

`world.humanoid` is the optional humanoid and riding runtime installed
by `createHumanoidWorld` or `createWorld({humanoid: ...})`. It owns the selected
human's walking/riding state and shares the world's clock, physics and camera
ownership. Independent actors registered with `addCharacter` use the ordinary
world interfaces. `humanoid` input and snapshot fields refer to this runtime.
`createHumanoidWorld` loads/binds the character kit; low-level `createWorld({humanoid})`
uses the supplied object and optional animation. Available actions follow those
actual bindings and scene conditions.

Complete humanoid loads share a template keyed by the resolved resource URL
closure. Keep those URLs immutable for their content version. Each instance has
independent skeletons, inverse-bind matrices, mixer clips, materials and texture
objects; geometry is shared read-only. Clone geometry explicitly before editing
it and retain ownership of that authored copy. Disposing one character releases
its instance resources; the final instance releases the shared template.
Failed loads/bindings release partial resources, and a disposed character cannot
be revived by an in-flight load. This resource sharing does not itself register
additional physical actors or provide autonomous behavior.

To create another complete actor in a humanoid world, call
`await world.humanoid.createCharacter()` and then `world.addCharacter({id,humanoid:character})`.
Registration transfers the instance lifecycle to the world. An instance can belong
to only one world; create another instance to reuse its source. Actors present at
the initial seal are retained for reset. Later actors release their resources on
despawn. Keep a caller-created instance only if registration failed, and dispose
it if it will not be retried.

The same humanoid world accepts ordinary NPCs through
`world.addCharacter({id,object,body,movement})` or an `AssetInstance` binding.
Their own capsule dimensions, navigation, custom movement intent and asset mixer
run in the shared fixed tick. `world.setControlledEntity(id)` can select either
kind; `world.setCameraFollow({targetEntityId:id})` chooses the camera target
independently. Ordinary first-person views declare a local `view.eyeOffsetLocalMetersXYZ`. Character colliders participate in physical contact
and local avoidance, but are excluded from static navigation geometry. Full
humanoid abilities still require a complete humanoid binding.

`WorldObservation.controlledObject` is the current controlled entity's live
`THREE.Object3D`, for both humanoid and independently controlled nonhuman worlds.
It is separate from `world.humanoid`. `snapshot().humanoid`, `describe().humanoid`
and Episode humanoid capabilities describe the currently controlled full actor;
they are absent when an ordinary character is controlled. Full NPCs remain
available through explicit actor IDs, including `world.humanoid.snapshot(actorId)`.
A humanoid request without an actor ID requires a controlled full actor; it never
selects the previous humanoid silently. Input action edges are `input.humanoid.actions`, while
movement and vehicle axes share the same `input.humanoid` envelope.

Navigation claims locomotion and animation together. Contextual actions and
surface/traversal transitions claim the actor's locomotion, animation, pose and
both hands before starting; conflicts return `ACTOR_RESOURCE_BUSY`. After pickup,
the held relationship retains both hands while navigation can carry the object.
An occupied seat retains locomotion, animation and pose until safe exit completes.
Manual asset playback claims animation until stopped or completed. Read
`world.getEntityState(id).controlOwners` for current ownership. Stop navigation
before installing explicit humanoid input; clear that override with
`humanoid.set-input` and `input:null` before requesting navigation again.
Batch scene commands validate resource changes in order before committing them,
so stopping navigation then playing an animation is a valid handoff.

Use `humanoid.perform-action` for contextual humanoid actions, `vehicle.*` for
boarding and recovery, and `humanoid.set-input`, `humanoid.apply-profile` and
`humanoid.set-camera-mode` for the controller's input, settings and camera.
Reusable asset IDs describe the object (`vehicle.rover`, `creature.horse`);
`asset.vehicle` describes its vehicle controller binding. Source provenance
remains separate from asset identity and controller capability.

`createWorld` is the general world entry point for human or nonhuman actors.
`createHumanoidWorld` is a convenience wrapper that loads or receives the supplied
human and binds its complete controller and actions, optionally with vehicles.
It calls `createWorld` internally and returns the same `ThreeWorld`; both entries
use the same runtime ownership and lifecycle.

A Humanoid world also accepts ordinary `addEntity({id, object, physics})` fixed,
dynamic and kinematic bodies. They share its Rapier world with the person and
vehicles; authored poses, collider refresh, commands and reset use the normal
entity interfaces. IDs must be distinct from the supplied person, vehicles and
map colliders, including when replacing the map. A conflicting replacement is
rejected before the active world changes. Dynamic bodies retain ordinary
9.81 m/s² gravity; vehicle simulation retains its 120 Hz substeps inside SDK ticks.
See the [shared physics example](../../examples/three-creator/shared-physics/main.ts).

Registering, moving or enabling a body updates native scene queries without
advancing simulation. Contact solving and collision events occur on the next
normal physics step. Maintainers can inspect the narrow
[Rapier query-refresh dependency](../../vendor/rapier-query-refresh/README.md).

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

For persistent first/third-person defaults and an optional switching key, use
`profile.view`; the `humanoid` topic contains the configuration example.

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
resolver, or a supplied `HumanoidCharacter`. The world owns the supplied
character's lifecycle. `map` follows `EnvironmentDefinition`; inspect the actual schema or
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
`VehicleInstance` with its own `object` and `spec` to `createHumanoidWorld`.
Choose the controller family and collision envelope for the shape you created.

Large static `mesh` and `box` collision shapes both expand through exact
subdivision. Budget failures identify the entity, measured/planned counts and
available budget; an unfinished subdivision reports a lower bound, not its final
size. Switching between mesh and box can hit a different budget. For a closed
convex solid whose hull is the intended collider, use `physics.shape:'convex-hull'`.
A convex hull fills concavities and openings: keep required passages by simplifying
the mesh or authoring separate convex pieces. Source geometry and total world
budgets still apply to all shapes. Read `entityIds`, `message` and
`suggestedAction` in the failed operation before changing the scene.

An SDK-owned renderer sizes to the stage and follows resizing; a supplied renderer
keeps its sizing policy. Create HTML HUD through `world.createPresentation()`.
Finish registration and configuration before the first `await world.start()`, which
prepares resources, seals initial state, awaits initial scene material compilation
with `renderer.compileAsync`, and renders the opening before starting the clock
and publishing `window.__WORLDKIT_EVAL__`. Keep your loading UI visible and enable
play controls after this promise resolves. Preparation does not advance simulation.
Concurrent starts share preparation; pause/resume reuses compiled programs. A
stop, reset or disposal during preparation rejects the pending start as `STALE_TASK`.
This prepares the initial scene; later material/lighting changes may still compile
new programs. It does not reduce shader complexity, draw calls or steady-state
simulation cost. Worlds without a renderer skip GPU preparation.
`stop()` pauses; `await world.reset()` restores the baseline and preserves the
previous running/paused state. Use `onReset` for author-owned visual state and
`onDispose` for external cleanup; `dispose()` releases the world. Each hook returns
an unsubscribe function.
For synchronous headless checks, the first `world.step(input,ticks)` also seals
both entity metadata and runtime state, even for zero ticks. Finish registration
first. If resources or parameters need initialization, await `world.start()` and
then stop before stepping. Invalid input and failed prototype preparation cannot
leave a partially sealed baseline.
The fixed engine activates one camera writer. Changing the controlled actor does
not change the camera target. Following an ordinary actor releases the humanoid
camera; following a full actor releases the ordinary rig. `useAuthoredCamera()`
releases both. A rejected follow/mode request leaves the current owner intact.
Editing an inactive humanoid camera's default perspective only stores the setting;
explicit camera commands choose its owner. In humanoid configuration inspection,
`effective.camera.settings` is null when that follow camera is inactive.
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

Place the visual root at the subject's feet and author the body above local Y=0.
The capsule extends upward from that root; `heightMeters` is its total height,
including both end caps, and must be at least twice `radiusMeters`.

Movement comes from actual SDK bindings. The built-in ground movement supports
walking/running/jumping with a capsule body. Other modes can use `registerMovement`
through the extensions contracts; a visual wing or fish tail supplies no physics,
pathfinding or compatible skeletal animation. A catalog creature documented as a
Humanoid mount does not automatically provide standalone flight or swimming.
Keep visual limb animation on SDK update callbacks without moving the owned root.

For first/third-person switching, supply an eye in the subject root's **local**
coordinates. It follows the root's scale and rotation; initial looking direction
uses the actor's semantic front (`frontYawRadians`, default local -Z).

```ts
world.setCameraFollow({targetEntityId: 'fox', view: {
  eyeOffsetLocalMetersXYZ: [0, .82, -.5],
  defaultPerspective: 'third-person', keyboardToggleEnabled: true,
}});
world.setKeyBindings({cameraToggle: ['KeyV']}); // Optional; default is T.
world.setCameraPerspective('first-person'); // Does not change the reset default.
```

Configure before `start()` to establish the reset baseline. Without `view`, the
existing third-person behavior is unchanged. With `view`, defaults are third
person and shortcut disabled; selecting first person applies the eye immediately.
Keyboard switching respects UI focus and pause and keeps one edge per press.
Programmatic switching remains available with the shortcut disabled. First-person
zoom is ignored and the existing third-person distance is retained. Mouse look
uses a stable horizon; the SDK does not infer a creature's neck rig or wing motion.
The subject itself is excluded only while rendering the primary first-person
view, then its render layers are restored; object views show the complete model.
Eye collision uses the existing camera solver. Read the effective configuration,
current `perspective` and collision result from `world.snapshot().camera`.
Episode starts inherit the saved view; optional `start.cameraPerspective` selects
a segment view without changing that default. Keep capture targets on the actor.

This route has no human mount/dismount controller. Show controls for its actual
abilities, exercise movement/collision/camera/reset, and use the same Creator
playtest/submit and Episode capture interfaces. Humanoid-specific character
continuity reports `not-applicable` when the ordinary SDK snapshot has no Humanoid
controller; unavailable telemetry remains distinct from this result.

### Recording custom movement

A movement can provide a small optional Episode input adapter alongside `update`:

```ts
world.registerMovement({
  id: 'flight', version: 1, description: 'Vertical flight', initialState: null,
  update: ({input, state}) => ({state,
    velocityWorldMetersPerSecondXYZ: [0, (input.moveYRatio ?? 0) * 3, 0],
    applyGravity: false}),
  episode: {
    startSupport: 'free',
    input: ({body, targetPositionWorldMetersXYZ}) => ({
      moveYRatio: Math.max(-1, Math.min(1,
        targetPositionWorldMetersXYZ[1] - body.positionWorldMetersXYZ[1])),
    }),
  },
});
```

Bind it with `movement:{kind:'custom',movementId:'flight'}`. The adapter returns
ordinary WorldInput, never a position or its own simulation loop. It is synchronous
and pure; it also receives gait, control-forward direction, simulation tick and
`mode:'travel'|'stop'`. For a stop/view hold, return inputs that maintain or settle
the current position, including any controller-specific braking or buoyancy.
`startSupport:'free'` keeps the exact start and still tests the real body against
colliders; the default `ground` mode also requires nearby support.

Episode capabilities explicitly report `movement.episodeInput` as custom or
unsupported. An absent adapter leaves manual Creator play available and does not
pretend that the Host knows how to steer arbitrary custom movement. Existing
ordinary ground and Humanoid vehicles keep their built-in recording paths.

<!-- topic:assets -->
## Select, load and reuse assets

Use `assets_search` / `assets_describe`, then select IDs in
`project.json: {schemaVersion:1,assetIds:['humanoid.source-101']}`. The compiler
packages verified resources. `world.assets.search(query)` describes that selection;
`world.assets.load(id)` creates an independent instance for ordinary
`world.addCharacter({id,asset})` binding. Full contextual humanoid movement uses
`createHumanoidWorld`; playback of a named clip alone does not add an ability.
Catalog `locomotionBindingIds` describe supplied content for discovery. They do
not select or install a controller; binding uses `asset/object` with `movement`,
or an actual `humanoid` instance.

For Creator generation, every human (including NPCs and riders) must use the
permitted preset visible model, skeleton and motions; omit added clothing,
accessories and decorative visual children. Keep each person as the same instance
through walking, mounting, riding, dismounting and reset. Never hide the preset
person or include a replacement human in a vehicle model. Reuse supplied creatures
when suitable. Vehicles use model-free handling configurations and Agent-authored
Mesh/Group geometry; do not load supplied or external vehicle models. The catalog supports reuse without restricting Three
geometry; custom subjects and compatible external assets follow the task's
effective asset policy.

For a custom vehicle, see the [preset rider + custom motorcycle example](../../examples/three-creator/custom-vehicle/main.ts)
(`creator_get_examples({topic:'custom-vehicle'})`). Supply only vehicle geometry
as `VehicleInstance.object`, with a matching `spec` controller family,
collision envelope and local pelvis seat position. `createHumanoidWorld` keeps
its preset character and applies the supported mounted pose on that skeleton.
This does not provide universal hand/foot IK; inspect contact and seat fit.
See [vehicle seat fit](#vehicle-seat-fit), also returned by
`creator_get_authoring_schema({topic:'mounted-interaction'})`, for calibration.
The Creator requirement does not restrict the SDK's general custom-character API.

Creator self-check covers the requested task outcomes. Production does not require
a separate vehicle regression or a fixed steering, slope, collision, boarding,
exit and reset checklist. SDK development tests cover reusable control behavior.
`characterContinuity` in inspect/playtest feedback tracks the Humanoid character's
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

Check rendered knees, elbows, facing, foot contact, speed, jump and landing after
changing a rig or motion binding.

<!-- topic:character-actions -->
## Humanoid action cards

<!-- asset-info:humanoid.source-101 -->
`humanoid.source-101` supplies 48 animation clips. Six skills accept discrete
`humanoid.perform-action` requests; posture and surface changes use `humanoid.set-input`;
locomotion and transitions follow actual controller state. `characterUsage` in
asset tools exposes capabilities and controls. `world.humanoid.characterCapabilities()`
returns live cards with `eligible`,
`reason`, `message`, `targetId`, requirements, scene conditions, parameters,
completion and source module. `snapshot().humanoid.characterCapabilities` gives
compact live availability. `snapshot().humanoid.interactionTargets` exposes
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

**Interactions** — `map.interactions` supplies stable entity `id`, `slotId`, `kind`, object
`position`, free `approach`, `yaw`, size/mass and target `colliderIds`. Reach the
approach within 0.9 m and its vertical tolerance before requesting pickup/sit.
These commands do not navigate. Render the movable object from the shared
interaction state so it follows the hand and does not remain duplicated.

Ordinary entities bind the same actions with `addEntity({id,object,physics,interactions})`
or prototype `options.interactions`. Each slot declares `slotId`, `label`, `kind`
(`pickup` or `seat`), `positionLocalMetersXYZ`, `approachLocalMetersXYZ`,
`rotationLocalRadiansXYZ` (XYZ Euler, +Z facing) and `capacity:1`. Coordinates are
relative to the entity root and follow its actual transform. A fixed bench can
contain several independent seat slots; pickup requires a dynamic body and
exclusively holds the entire entity. Its existing model and body are reused.
Dynamic physics can explicitly set `lockRotations:true` when the calibrated object
must retain its orientation (the supplied pickup prop uses this constraint).
Rotation is free by default; binding an interaction never silently locks it.

```ts
world.addEntity({id:'bench',object:bench,role:'obstacle',physics:{kind:'fixed'},interactions:[
  {slotId:'left',label:'Left seat',kind:'seat',capacity:1,
   positionLocalMetersXYZ:[-.6,.46,-.49],
   approachLocalMetersXYZ:[-.6,.02,0],rotationLocalRadiansXYZ:[0,0,0]},
  {slotId:'right',label:'Right seat',kind:'seat',capacity:1,
   positionLocalMetersXYZ:[.6,.46,-.49],
   approachLocalMetersXYZ:[.6,.02,0],rotationLocalRadiansXYZ:[0,0,0]},
]});
await world.execute({type:'humanoid.perform-action',actorId:'person',
  request:{requestId:'sit-right',action:'sit',targetId:'bench',slotId:'right'}});
```

The example assumes the authored bench root is at floor level and its actual seat
colliders meet those anchors. Inspect the measured `interactionTargets` approach,
eligibility, `slotId`, `generation` and `claim` before dispatching. A request may omit
`slotId` only for an entity with one slot; `putDown` and `standUp` can use the actor's
current relationship. Replace bindings with
`world.execute({type:'entity.set-interactions',entityId,slots})`; an empty array
removes them. Replacement invalidates old reservations and releases held bodies.
Despawn releases relationships before destroying physics; reset restores baseline
bindings against the new physical instances.

Reservations expire after five seconds of simulation time. A successful grip or
seat contact becomes a persistent `held`/`occupied` claim; completing the operation
does not release it. Actual body state, collider contact, mass, approach and supplied
clip reach are checked again at contact. A label or local anchor cannot make an
arbitrary height reachable. Source101 seated motion uses a 1.40 m capsule; standing
requires 1.68 m clearance. Losing a seat under a low roof starts safe exit cleanup
before the action can become terminal. Snapshots never advance these transitions.
The `multiple-actors` example binds an offset Group and two independent seats,
with controls for NPC approach, contention, carrying, release, cancellation,
target removal and a low ceiling over the right seat. Navigation uses conservative
clearance around fixed furniture; reach a nearby walkable point before the action
controller performs its final alignment. Route around movable obstacles using
their actual occupied space.

**Dynamic objects** — the Agent decides which objects should respond to gravity,
forces and collisions from the scene and gameplay requirements; there is no fixed
list by object name or category. For those `map.boxes`, assign each part an
`EnvironmentBox.rigidGroup: {id, massKg}`, using one group ID and the same total
mass for the whole object, and a different group ID for each independent object.
Resting on the ground does not by itself make an unattached object fixed. Omit
the field when its support or gameplay relationship should keep it fixed.
Read current world-space part
poses from `world.humanoid.simulation.environment.propBoxPose(id)` in
`onVisualUpdate`; `world.reset()` restores the furniture too. The
`character-actions` example includes complete movable tables and a chair, their
seat/pickup interactions, visual synchronization and reset. See
[movable environment props](#movable-environment-props) for the contract.

**Water** — declare volume bounds and surface height, with a real lower floor.
A ground collider extending over the pool makes it shallow regardless of the
visible water. Entry currently requires measured depth >1.28 m and feet >0.95 m
below the surface; retention uses depth >1.16 m and feet >0.5 m below the surface.
`world.snapshot().humanoid.water` and Creator `feedback.water` report the actual
contact and threshold decisions. `feedback.waterTimeline` records state changes
in a playtest. These diagnostics do not modify the controller or validation.

**Clip availability** — `prone-backward`, `prone-left`, `prone-right` and
`climb-ledge` are loaded material without a dedicated current controller
selection. Crawling turns and uses forward crawl; the wall-top transition uses
traversal. Do not advertise four additional executable skills from these files.

```ts
const receipt = await world.execute({type:'humanoid.perform-action', request:{
  requestId:'pickup-parcel-1', action:'pickup', targetId:'parcel',
}});
if (receipt.status === 'accepted') {
  const result = await world.operations.wait(receipt.operationId);
  // Check terminal status and the resulting carrying/seated/action state.
}
```

`accepted` means execution started. Check `operations.get`/`wait` and
`world.snapshot().humanoid.character` for completion, rejection or cancellation.
Creator uses `world_get_operation`; polling never resubmits the action. Discrete
requests are exactly `roll`, `slide`, `pickup`, `putDown`, `sit`, `standUp`.
Crouch, prone, climb and swim-style changes are humanoid input fields.
<!-- /asset-info -->

<!-- topic:humanoid -->

## Multiple complete humanoids

```ts
const guide = await world.humanoid!.createCharacter();
guide.root.position.set(4, 0.04, 0);
world.addCharacter({id:'guide', humanoid:guide,
  movement:{kind:'ground', walkSpeedMetersPerSecond:2.4}});
world.setAutonomy('guide', {kind:'patrol',
  waypointPositionsWorldMetersXYZ:[[4,0,7],[4,0,-3]], pauseSeconds:0.5});
world.setCameraFollow({targetEntityId:'guide'});
// Input selection is independent of the camera target.
world.setControlledEntity('person');
```

For a complete Humanoid target, `setCameraFollow` accepts only `targetEntityId`
(or no options to follow the controlled actor) and selects camera mode 0. Other
fields, including `view` and follow/framing parameters, are rejected with
`WORLD_CAMERA_FOLLOW_OPTIONS_UNSUPPORTED` before changing the target or camera owner.
Use `world.humanoid.applyProfile({cameraDistanceMeters, camera, view})` for Humanoid
camera settings and `world.humanoid.setCameraMode(0|1|2)` for its mode. Ordinary
targets retain the `CameraFollowOptions` configuration described above.

Each actor has its own controller, skeleton, mixer and action state. All actors
share the physics world, interaction targets and fixed clock. Ground navigation
uses committed fixed/kinematic collider geometry, including map surfaces without
visual meshes. Ground NPCs use Detour Crowd to steer around nearby characters from committed
positions and velocities; their existing controllers still resolve every physical
move. Controlled input and custom movement are not overwritten by avoidance.
Crowd processing uses stable actor identity order and is rebuilt with navigation.
Dynamic obstacles still require live collision; a persistently obstructed route
can fail with a blocked result. An actor outside the navigation mesh fails only
its own navigation task, without stopping other actors or the world.

Full humanoid roots use unit scale, yaw-only rotation and automatic local matrix
updates, directly under an untransformed Scene or without a parent. Set the root
position before binding. For runtime generation, register a character prototype
with `template:{kind:'character',options:{humanoid:seed}}`. Registration retains
only an independent source factory and copied configuration, so the caller can
then dispose `seed`; each `entity.spawn` creates a fresh rig. An unused prototype
does not keep a hidden model, skeleton or mixer alive. Failed or cancelled preparation releases its
unpublished instance. Spawn collision validation includes the complete candidate
scene and the current occupancy of objects whose movement takes time.

`humanoid.set-input` and `humanoid.perform-action` accept optional `actorId`;
omitting it selects the current input actor. Accepted actions remain bound to that
actor and its generation across input switches. `setInput()` release callbacks
release only their own override. Full humanoid bindings accept ground walk/run/jump
speed settings; custom movement adapters and arbitrary body dimensions are not
accepted for this controller. Vehicle commands also accept `actorId`; omitting it
selects the current input actor. A rider retains its vehicle across input switches,
and another actor cannot board or prepare that occupied vehicle. Use [multiple-actors](../../examples/three-creator/multiple-actors/main.ts)
for complete rigs and autonomous navigation.

Every actor, including the initial character, uses the same controller, binding and
lifecycle. `humanoid.createCharacter()` retains a source factory independent of
individual models; deleting the initial character does not disable future creation.
Each `onVisualUpdate` sample contains `actors[id]` and `vehicles`, sharing the same
epoch, fixed interval and interpolation time. The actor pose names its
`mountedInstanceId`; visual callbacks read this sample rather than another actor
or a separately maintained previous pose.

### Brake-turn drift for authored vehicles

For an arcade car or motorcycle without `wheelPhysics`, set `brakeDrift: true` on its `humanoid.VehicleSpec`
(`mode: 'wheeled'` or `'motorcycle'`). The SDK integrates real lateral velocity; do not
rotate the visual root or install a second movement loop to fake a skid.

```ts
import type { humanoid } from "@worldkit/three";

const driftTuning = {
  brakeDrift: true,
  grip: 10, steer: 0.65,
  steeringResponse: 7, steeringReturn: 12,
  brakeDeceleration: 6, brakeDamping: 0.5, coastDeceleration: 1.8,
} satisfies Partial<humanoid.VehicleSpec>;
// Include ...driftTuning in the spec passed to createHumanoidWorld({ vehicles }).
```

These are starting values, not universal tuning: test speed, turning radius and
recovery for the authored vehicle. Brake while steering above 2.5 m/s; strength
ramps to its maximum at 6 m/s. Default S is forward braking (reverse below
1 m/s), while Space gives a stronger handbrake slide. Reverse and parking-speed
turns do not activate this model. `grip`, steering and braking control the slide
and recovery. At full drift, braking and handbrake damping are reduced to 70% to retain
momentum. The flag belongs to VehicleSpec; numeric tuning can be applied
through `world.humanoid.applyProfile`. Persist both in authored source for delivery.

Creator's self-drawn road examples use `wheelPhysics` instead of this arcade path.
Do not combine `brakeDrift` with their per-wheel handling configuration.
[Design, parameter units and tuning checks](../../docs/three-vehicle-drift.md).


## Bind scene, controls and parameters

`createHumanoidWorld` uses the Humanoid backend through `createWorld({humanoid})`.
It is the world's single solver, driven by the SDK 60 Hz clock and shared by
Presentation and Episode. Author a `EnvironmentDefinition` with collision `boxes`, optional
`interactions`, `climbSurfaces`, water bounds, player spawn and scene bounds.
Box `position` is its world-space centre; `size` is the full XYZ extent. Box rotations
are XYZ Euler radians; map yaw zero faces +Z. Render the same geometry in Three;
a visual surface is not a collider.

For explicit composition, create a `HumanoidCharacter`, `await character.load`
with a resource resolver, then pass
`humanoid:{map,character:{instanceId,object:character.root,animation:character},vehicles}`
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
HUD hints and recording admission derive from `humanoid.INPUT_BINDINGS`.
`world.getKeyBindings()` reads the effective bindings; `world.setKeyBindings({
roll:['KeyR']})` rebinds semantic actions and rejects duplicate/invalid codes.
`humanoid.controlHints(bindings)` formats current labels. Esc belongs to the
application menu; reset is an explicit menu/button action. Use semantic
inputs/commands for Agent actions; key remapping need not change a plan.
Presentation UI focus releases held gameplay keys. Programmatic
`world.humanoid.setInput(input)` returns a release callback scoped to that
override; release it when the interaction ends. `setInput(undefined)` clears the
active override. `WorldInput.humanoid` uses the same input in deterministic ticks;
action edges execute once in a multi-tick step.
Read `world.describe().humanoid.inputGuide` for the active control family, or
`humanoid.HUMANOID_INPUT_GUIDES` when authoring a vehicle. Start with
`emptyHumanoidInput()` and change only relevant channels. For example, `boost`
increases car speed, adjusts plane throttle, launches a glider, and brakes a
spaceship or submarine. Aircraft pitch uses `forward`; spaceship pitch uses
`pitch`. Omitted guide channels are ignored and should stay neutral.
Camera angular deltas use radians and distance deltas change the nominal arm in
meters; collision response, speed pullback and smoothing still affect the final view.

`world.humanoid` provides prepare, approach/enter/exit, map switching, camera
modes and profile methods. These preparation helpers may relocate; normal
movement uses real input. Generic navigation, impulse and root-edit commands are
unavailable for contextual actors. Commands are `vehicle.prepare`,
`vehicle.approach`, `vehicle.enter`, `vehicle.exit`, `humanoid.set-camera-mode`,
`humanoid.set-input`, `humanoid.apply-profile` and `humanoid.perform-action`.
`vehicle.approach` is a preparation relocation to a safe boarding position,
with velocity cleared. It does not walk there. Its applied command receipt
includes `result.kind:"relocation"`, the character/vehicle IDs and actual position;
use ordinary input for visible travel, then `vehicle.enter` when eligible.

For a boarding decision, read `world.humanoid.inspectBoarding(instanceId)`:
it identifies the actual approach position, eligibility and rejection
reason. `inspectControls()` reports the override and last applied controller
input with its simulation time; `inputGuide()` describes the active family's
channels. These methods are included in the `mounted-interaction` / `humanoid`
declaration response. Host readers can use `world_inspect` description fields
`humanoid.boarding`, `controlState` and `inputGuide` without reading solver internals.

```ts
await world.execute({type:'humanoid.apply-profile',profile:{character:{
  maxSpeed:6, jumpSpeed:5.5, coastDeceleration:8,
}}});
const savedProfile = world.humanoid!.exportProfile();
const current = world.humanoid!.inspectConfiguration();
```

Profiles merge by instance ID and persist across reset/map/Episode initialization.
`exportProfile()` returns a replayable profile: complete controls and explicit camera
overrides. `inspectConfiguration()` reports the active subject/family, applicable
control values, camera owner/mode and resolved camera settings alongside that profile.
Read operations return copies without advancing time. Save the profile in project
source and apply it during initialization. Browser-local tuning alone is not delivery
configuration. Humanoid normal movement is `speed * 3.1 / 3.8`; acceleration is
`accel * 14 / 12`; air acceleration is `grip * 5 / 3`; turning is `steer * 8 / 14`.
`maxSpeed`, `slowSpeed`, `coastDeceleration` and `jumpSpeed` are independent actual
unit values. Speeds are m/s; acceleration/braking is m/s²; damping/response is 1/s.
Vehicle profile applicability depends on controller family; inspect the selected
spec. Parameters do not replace collision, traversal or animation execution.

`world.snapshot().humanoid` exposes real character state, vehicle instance/family,
mounting, medium, speed, actions and effective controls. Reset clears movement,
held input, actions, object attachments and animation history. Episode uses the
same solver; its start may initialize a validated position/mount state and all
following actions must execute through actual input.

### Default view and keyboard switching

Set the view in the existing profile when creating a humanoid world:

```ts
const world = await createHumanoidWorld({scene, camera, canvas, map,
  profile: {view: {defaultPerspective: 'first-person', keyboardToggleEnabled: true}},
});
// Optional remapping; omit to use T.
world.setKeyBindings({cameraToggle: ['KeyV']});
```

Defaults are `third-person` and `keyboardToggleEnabled: false`. Each press cycles
third person → first person → shoulder → third person, matching the Playground
camera button; it works on foot and while driving. Held-key repeats, paused worlds
and focused UI controls do not toggle. Authored camera ownership is preserved.
Read effective configuration from `world.snapshot().humanoid.view` or
`world.humanoid.exportProfile()`. Reset and map replacement restore the configured
default. Episode starts inherit it unless `start.humanoid.cameraMode` explicitly
selects a view for that segment; the override does not change the saved default.

Use `world.humanoid.applyProfile({view: {...}})` or `humanoid.apply-profile` to update
settings. Setting `defaultPerspective` selects it immediately only while the
humanoid follow camera is active; otherwise it stores the next default. Updating only
`keyboardToggleEnabled` preserves the current view. Disabling the shortcut does
not disable programmatic `world.humanoid.setCameraMode(0 | 1 | 2)` or
`humanoid.set-camera-mode` commands. `cameraTogglePressed` is the corresponding one-shot
Humanoid input and respects the same permission. Inspect the actual scene before
claiming recording or visual acceptance.

First-person driving inherits the vehicle controller's existing tilt, including
for custom vehicle geometry bound to that controller. This remains the default.
Developer-only presentation tuning lives in `src/config/presentation.ts`; it is not
a profile field. Scene code does not add another camera sway loop.
These profile settings apply to Humanoid. Independent subjects configure the eye
through `setCameraFollow({view})` as shown in the `nonhuman-subject` topic.

### Humanoid camera perspectives

Start with the tuned defaults: omit `profile.camera` and `cameraDistanceMeters`
when creating the world. Large whitebox landmarks do not require raising the
humanoid eye. Override only a specific framing defect observed in real views.

`profile.camera.targetHeightOffset` and `horizontalOffset` are **increments in
metres**, both defaulting to **0**, added to the controller's existing target or
eye-based anchor. The vertical offset is not eye height or absolute world height:
`targetHeightOffset:1.1` adds another 1.1 m. Both offsets are shared by mode 0 and
mode 2; mode 1 ignores them. They remain valid adjustments, including negative
values. `cameraDistanceMeters` affects only mode 0; mode 2 owns its independent
shoulder distance. A distant opening composition is not a reason to override the
gameplay follow distance or eye offset.

For an authored opening, finish the camera pose and projection and call
`world.useAuthoredCamera()` before the first `start`, `step` or `reset`; that first
lifecycle transition seals the opening. Then return control with
`humanoid.set-camera-mode` when play begins. Reset restores the sealed authored
opening after follow-camera use. The Humanoid follow mode still resets to the
profile's `defaultPerspective`; temporary authored or shoulder views do not replace
that default. Do not add a separate `onReset` camera writer. Inspect the views needed by the task or an
observed camera problem. For a focused Creator check, select the view and capture
its actual world pixels:

```js
world_execute_command({command:{type:'humanoid.set-camera-mode',mode:2}})
world_preview({view:'current'})
world_inspect({sections:['description']})
```

`start()` starts the clock, not the user's first action. The public handoff is
`world.humanoid.setCameraMode(0 | 1 | 2)`; there is no `humanoid.camera` method.
Call it from the scene's chosen play input or start button. The optional
[keyboard handoff example](../../examples/three-creator/vehicle-camera/opening-camera.ts)
uses current movement/jump/boarding bindings on the focused gameplay surface:

```ts
// After configuring the authored pose, before the first start:
world.useAuthoredCamera();
installOpeningCameraHandoff(world, presentation.inputSurface);
await world.start();
presentation.focus();
```

Read the example via `creator_get_examples({topic:'vehicle-camera',files:['opening-camera.ts']})`
and import its function into the scene. It leaves idle openings, paused worlds,
UI input and ordinary camera switching alone; reset needs no extra listener.
This particular example starts on movement, jump or boarding keys, not arbitrary
pointer or semantic input. Choose the trigger required by the scene. Creator
keyboard steps exercise the same DOM listener. For a semantic-input plan, select
the camera with a `humanoid.set-camera-mode` command in the first play step (and
after a reset when play resumes). Episode independently selects its segment
camera and pauses the live clock; scene input handlers must not take it over.

`world_preview({view:'current'})` preserves the current view without resetting or
advancing simulation. Its `cameraObservation` includes `cameraOverrides` (explicit
`profile.camera`), `cameraSettings` (resolved settings) and `framing`, alongside
the real pixels. `world_preview({view:'opening'})` stops and resets the world;
use opening only to check the reset opening. Top-down and object triviews do not
establish gameplay framing.

On demand, `world.describe().humanoid.configuration.effective.camera.framing`
reports `status`/`reason`, `sampleSimulationSeconds`, `headSource`, the head anchor
in world space, and `headScreenPositionNormalizedXY` (top-left `[0,0]`, bottom-right
`[1,1]`; null behind the camera or unavailable). Creator forwards it in
`world_inspect({sections:['description']})` under `observation.description`.
Read the current mode from `configuration.effective.camera.mode` and explicit
offsets from `configuration.profile.camera`. `framing.sampledOffsets` identifies
the offset inputs associated with the displayed pose; `offsetsPending:true` means
new configuration has not yet reached that sample (for example, an edit while
paused). Do not interpret the old image using the newly configured values.
`SHOULDER_FRAMING_OFFSET_REVIEW`
advises checking nonzero offsets in mode 2 when the head projects near an edge or
outside the frame. Empty `issues` is not visual acceptance; projection does not
prove pixel visibility or absence of occlusion. Reading this advice does not step
simulation or adjust the camera.

These defaults describe the supplied Humanoid runtime. For an edited project SDK,
read its current `sdk/three-world/src/config/camera.ts` and `humanoid-runtime/camera.ts`,
rebuild and inspect the matching runtime; Host examples are reference material.
Independent subjects use their own `setCameraFollow({view})` contract.

Humanoid camera modes are `0` (third-person follow), `1` (first person) and `2`
(immersive over-the-shoulder). Mode 2 replaces the former overview; it uses a
2 m right-shoulder boom (wheel: 1.3–3.2 m), collision retraction and up to 4°
speed FOV expansion. Mode 1 has zero arm length and a 0.035 m near plane; zoom and framing
offsets do not move the eye. On foot it follows physical posture with a stable
horizon; mounted it uses the animated rider's eye and the vehicle's orientation,
with independent seat-local look (±150° yaw). Steering still comes from vehicle
input. It uses the existing single camera/input owner, including Episode stepping.
The capabilities playground enables **T** to cycle all three views, matching its
camera button. Click the view in first person or shoulder mode to lock the mouse;
**Esc** releases/pauses, and dragging
remains available when locking is unavailable. Character action bindings retain their configured values.
Local head/neck triangles are excluded from an instance-private geometry while
first person is active; original geometry and all bone transforms are preserved
and restored for third person/authored views. The humanoid runtime supports one
controlled rider/driver, not a multiplayer passenger system. Existing mounted
poses remain procedural approximations rather than imported PUBG animations.

Vehicle movement still uses `spec.envelope`. Camera queries refine that envelope
with the vehicle's rigid Mesh triangles, so an open cabin is not a solid wall.
Solid panels block the camera; transparent materials with opacity below one and
transmission materials do not count as opaque sight blockers. Glass still blocks
the camera's collision sphere. The mounted carrier is excluded from its own
camera arm; other vehicles remain obstacles. Empty, skinned or actively morphed
vehicle roots retain conservative envelope queries. Geometry edits follow Three's
`needsUpdate` convention; models attached after initialization are discovered.
Texture alpha cutouts and custom shader transparency are conservatively opaque
for these geometry queries.

Whitebox recoloring must preserve glass transparency, opacity, side and material
array slots. Clone source materials and modify their palette instead of replacing
every surface with an opaque material. The [rover camera example](../../examples/three-creator/vehicle-camera/README.md)
(`creator_get_examples({topic:'vehicle-camera'})`) includes a native Three material
helper and SDK-owned T/reset controls. Inspect first-person pixels as well as the
mode number. For an authored opening, perform the camera handoff in the user's
reset/start action; do not unconditionally claim the camera in `onReset`, which
also runs while Episode owns the recording clock.

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
to request cancellation of the operation itself. Atomic seat transitions finish a
safe standing exit before releasing occupancy; a slide under a low roof stays low
until directional input reaches standing clearance. These operations remain
`running` with phase `cancelling`; wait for the terminal result. Cancelling a pickup
after grip keeps the item held until an explicit put-down, release or actor removal.
Sit requires enter, idle and exit clips so its cleanup is executable. Removing an
actor ends its operations at that same boundary without requiring another tick.
World operation IDs are distinct from Creator tool
operation IDs. Asynchronous follow-up writes belong in world.runTask(scope).

Successful `world.humanoid.switchMap(map)` retires the previous simulation's tasks,
queued commands, asynchronous task scopes and entity generations. Old work cannot
write into replacement actors or bodies. Failed candidate validation preserves the
current world and its tasks. `onSimulationReplaced` reports `map` or `reset`.
Map replacement pauses patrol until an explicit `actor.resume-autonomy`; world
reset restores the sealed autonomy configuration. Switching keyboard control
preserves other actors' explicitly assigned inputs.

NPC move/follow takes over autonomy; stop keeps it paused until resume-autonomy.
Mounting ends foot-navigation operations and pauses patrol. Mounted actors reject
ground-navigation requests; send explicit humanoid vehicle input to drive, then
exit before requesting foot navigation or resuming patrol.
Player input owns the controlled actor, including nonhuman subjects. Single animations return to locomotion;
loop playback requires stop-action. set-visible only affects rendering; despawn
removes the entity/collision/tasks. Capability rejection is not SDK success.

### Effective input and camera settings

`world.describe().humanoid.controlState` reports the current override, its source,
the last input actually consumed with simulation time, `livePaused`, and the clock
owner (`live` or `episode`). It is an on-demand observation. Release/reset clears
obsolete input samples. `humanoid.boarding[instanceId]` in the same description
reports the actual boarding approach and eligibility; select `entityIds` to query
only the relevant vehicle. These spatial queries are not repeated in every frame
snapshot. `world.humanoid.inspectBoarding(id)` provides the same targeted query.

`profile.camera` is a partial set of explicit overrides. Each field takes effect
independently of `cameraDistanceMeters`; `exportProfile().camera` retains those
explicit fields, subject to the [camera mode rules](#humanoid-camera-perspectives).
The framing offsets default to 0 and add to an existing anchor; they are not
absolute coordinates. Unset fields keep the mode's default (humanoid third person uses
FOV 58, response 7, collision radius .2; vehicle defaults remain unchanged).
The SDK and Creator command transport share the same `(0,100]` meter range for
`cameraDistanceMeters` in mode 0; null returns to the subject's default distance.

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
| Bindings and input | [humanoid-runtime/input.ts](src/humanoid-runtime/input.ts) |
| Capability cards and action limits | [character-capabilities.ts](src/humanoid-runtime/character-capabilities.ts) · [action-schema.ts](src/humanoid-runtime/humanoid/action-schema.ts) |
| Roll, slide, pickup and sitting | [action-system.ts](src/humanoid-runtime/humanoid/action-system.ts) |
| Crawling and wall/ladder movement | [surface-actions.ts](src/humanoid-runtime/humanoid/surface-actions.ts) |
| Map and anchor contracts | [environment/types.ts](src/humanoid-runtime/environment/types.ts) |
| World integration and profiles | [humanoid-runtime/runtime.ts](src/humanoid-runtime/runtime.ts) |
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

The React editor in `apps/three-playground` uses the scene and vehicle modules in
`shared/preset-content`. Runnable integration examples live in `examples/three-creator`.

<!-- topic:presentation -->
## Shared shadow settings

Both world factories accept partial `shadows` overrides. Omit them to use
`DEFAULT_SHADOW_SETTINGS` from the SDK's [presentation config](src/config/presentation.ts).
For imported JSON, use the shared parser:

```ts
import {createWorld, resolveShadowSettings} from '@worldkit/three';
import config from './presentation.json'; // e.g. {"shadows":{"enabled":true,"coverageMeters":60}}
const world = await createWorld({scene, camera, canvas,
  shadows: resolveShadowSettings(config.shadows)});
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-20, 40, -30);
scene.add(sun, sun.target);
world.configureShadowLight(sun);
```

The switch and algorithm apply to the renderer at creation, including a supplied
renderer. Configure each selected directional light once and repeat for replacement
lights; its position, target and lifetime remain authored. The SDK does not create
lights, follow actors with them, or change mesh `castShadow`/`receiveShadow` flags.
Other light types remain ordinary Three authoring. Disposing the world restores a
supplied renderer's previous shadow switch/algorithm.

Settings are JSON values: `enabled`, `type` (`basic`, `pcf`, `vsm`),
`mapSizePixels`, `coverageMeters`, `nearMeters`, `farMeters`, `bias`,
`normalBiasMeters`, `radius` and `intensity`. Coverage is the width/height in the
directional light's view; sampling scale is `coverageMeters / mapSizePixels`.
`bias` is normalized depth, `radius` is the filter radius (ignored by `basic`),
and intensity ranges from 0 to 1. Larger coverage reduces detail; excessive bias
can separate contact shadows. GPU texture limits may reduce actual map resolution.
`world.shadowSettings` is the immutable resolved configuration, not a GPU measurement.
Project files are imported by scene code and compiled into delivery; neither
Creator nor Episode replaces them during capture. Playground's
`presentation.json` uses this same path; edit, rebuild and refresh to apply changes.

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
Camera pose fields are world-space measurements. In authored mode, desired position,
yaw and pitch are `null`; follow arm distances and collision phase are absent because
SDK follow intent is not applicable. Humanoid collision/raycast IDs resolve known
map objects (including ground tiles), vehicles and actors to their declared identities;
an unmapped collider keeps its `collider-<handle>` fallback, not an inferred entity.

Semantic local front is -Z; frontYawRadians rotates around local +Y. Three views
then apply the object's complete world quaternion, including parent rotation.
Right is front cross up. The Host captures real rendered front/right/back images.
It does not substitute a display clone or fabricate hidden geometry.

Creator `world_preview` supports opening, current, top-down and entity-triview captures
from the pure world canvas. Model input must use that pure canvas or
`presentation.modelInput`, never a whole-page
screenshot, presentation container or model output. Keep derived reference and
three-view conditioning images free of baked-in HUD; preserve original inputs.

`createHumanoidWorld` already registers its map collision, preset person and
vehicles from the creation options. Do not register those objects again as
generic physical entities. If an existing purely visual map landmark only needs
an observation or capture identity, call `world.addEntity` with that object and
`role:'decoration'`, omit `physics`, and select it with `setCaptureTargets` when
needed. This does not replace genuine map collision declarations.

Read the real exports from contracts.ts using the Creator schema tool by topic.
Types describe the API; use a complete real input plan to check broad opening
composition, connected routes and the requested core movement/actions and their
physical results. Choose the recording length by functional coverage.

<!-- topic:mounted-interaction -->
### Vehicle seat fit

`VehicleSpec.seat` is the rider's **pelvis anchor** in vehicle-local metres
(+Y up, +Z forward), not the seat mesh centre or cushion surface. The SDK aligns
the actual preset pelvis to this anchor. Author the cushion and anchor together:
for a horizontal box cushion, `seatY = cushionCenterY + cushionHeight / 2 + pelvisClearance`.
Choose local X/Z to place the hips over the saddle or seat pan.

For `humanoid.source-101`, these Playground fits provide starting references:

| Mounted pose | Cushion geometry | Pelvis above cushion top |
| --- | --- | --- |
| Default `drive` (omit `characterPose`) | Car seat pan, 0.50 m deep | 0.125 m |
| `characterPose: 'ride'` | Motorcycle saddle, 0.42 m wide | 0.165 m |

These clearances depend on the current rig, pose and cushion geometry; they are
not universal defaults or automatic seat fitting. A wider/deeper cushion can
intersect the thighs even when the pelvis clears it. Changed rigs, poses or
sloped seats need their own fit. The [custom motorcycle example](../../examples/three-creator/custom-vehicle/main.ts)
shares its declared cushion centre/size with the pelvis calculation and uses the
`ride` pose; it does not add another rider or provide automatic hand/foot IK.

In the existing mounted self-check, inspect the pelvis and upper thighs against
the cushion from the side, and check the seat back, hands, feet and head clearance.
Check first-person visibility as well as enter/exit/reset transitions. First-person
eye position follows the real head bone and its eye offset: correcting the pelvis
also raises the eye. Do not conceal a sunken rider by independently lifting the camera.

<!-- asset-info:creature.horse,humanoid.source-101 -->
### Imported horse and rider anchors

`HorseVisual` owns the real `creatures/horse.glb` skeleton, cloned clips and
playback resources. Load it with the Host's permitted logical resource resolver:

```ts
import { HorseVisual } from '@worldkit/three';
const horse = new HorseVisual();
await horse.load(resolvePresetResource);
// Pass alongside the existing vehicle instanceId, assetId and calibrated spec:
const horseInstance = {
  instanceId: 'horse-1', assetId: 'creature.horse', spec: horseSpec,
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
`HumanoidCharacter.actor`, then restores the fixed pose after display. It does
not move the logical rider root or capsule to follow a bone. The real horse plus
Source101 geometry fits the existing box envelope (X ±0.8, Y 0–3.3, Z ±1.9 metres)
across the measured fixed and animated seats; maximum measured height is
2.520854 metres. The rider remains a procedural seated overlay, with no authored
mount/dismount clips, rein contact solver or guarantee against visible body
interpenetration. Browser visual and capture acceptance are separate checks.

<!-- /asset-info -->


<!-- topic:extensions -->
## Developer tuning

The [SDK configuration directory](src/config/README.md) owns shared defaults and
parameter definitions. Playground's calibrated values are the baseline; its UI,
SDK profile parsing and Creator schemas consume the same definitions. Internal
presentation switches stay out of public profile fields. Config changes require
rebuilding the SDK; authored Three geometry and gameplay remain ordinary code.

<!-- topic:humanoid -->
## Opt-in vehicle diagnostics

`world.inspectVehicles({entityIds:['my-vehicle'],detail:'wheels'})` reads detached
vehicle state without advancing simulation. Omit `detail` for a compact summary;
`query` matches entity id/name/tags, omitted IDs select all, and `[]` selects none.
Creator exposes the same read through `world_inspect({sections:['vehicles'],
entityIds:['my-vehicle'],vehicleDetail:'wheels'})`; standard inspections omit it.

The result includes world revision, tick/time and physics step sequence. Each
vehicle reports speed, signed throttle input, existing engine telemetry, wheel
counts and available aircraft state. `sample.status` distinguishes unmeasured,
sampled, stale and not-applicable solver data. Solver contacts/forces are from
`sample.solver.phase:'pre-integration'` of the identified last substep; pose/speed
are current committed state. They are not recomputed by inspection. Before the
first solver step or after reset, detailed solver values are null. Wheel lengths
are metres, loads/forces newtons, angles radians and slip a longitudinal speed
difference in m/s, not a ratio. Unsupported measurements are null. Landing flags
refer to the last landing. Contact loss or slip alone is not a failure diagnosis.
Host results additionally carry source/runtime hashes; diagnostic failure is local.

## Configuration-first vehicle authoring

Creator vehicles use Agent-authored Three geometry. Select their handling before
modeling; do not load supplied or external vehicle model assets. The Host default
asset policy excludes catalog vehicle models. Permitted humans and creatures
remain separate asset subjects.

```ts
import {humanoid} from '@worldkit/three';
const spec = humanoid.createRoadVehicleSpec('motorcycle'); // or 'car'
spec.id = 'my-vehicle';
// Build your own Mesh/Group using spec.wheelPhysics, spec.envelope and spec.seat.
// Pass {instanceId:spec.id, assetId:'custom.vehicle', object:myRoot, spec}
// in createHumanoidWorld({vehicles:[...]}).
```

Start with these defaults; no source inspection or separate tuning step is needed.
This factory returns fresh, independent data: controller family, speeds,
steering/braking, physical mass and dimensions, explicit ordered wheels,
powertrain, collision envelope and pelvis seat. It creates no geometry, assets,
rigid body or clock. `car` uses four driven wheels and front steering;
`motorcycle` uses rear drive, front steering and grounded balance assistance.
Its `mode` and `archetype` are `motorcycle`; the independent unicycle controller
uses `mode: 'unicycle'`. Map regions must allow the selected `spec.mode`.
Only these two road presets are provided here; other motion families retain
their specialized controllers. `accel` remains a required legacy spec field but
per-wheel acceleration comes from the powertrain.

Vehicle `mode` selects the driving family and map-region permission key.
`archetype` selects the vehicle subtype, including its mechanics and model bindings.
`characterPose` selects the rider posture; it supplies no propulsion.

| Vehicle | `mode` | `archetype` |
| --- | --- | --- |
| Skateboard | `skateboard` | `skateboard` |
| Kayak | `paddled_boat` | `kayak` |
| Canoe | `paddled_boat` | `canoe` |
| Inflatable raft | `paddled_boat` | `raft` |
| Submarine | `submarine` | `submarine` |
| Spacecraft | `spacecraft` | `spacecraft` |

The `paddled_boat` family shares the existing stroke and buoyancy implementation.
`canoe` and `raft` select single-blade paddling; `kayak` selects alternating
double-blade paddling. All reuse `characterPose: 'paddling'` for the seated rider
and bind the hands to the actual paddle. The humanoid action `slide` remains
the running slide action.

For force-driven paddling, `bodyPhysics.kind` is `paddle`, with mass and water
displacement parameters. The scene supplies actual water and collision geometry.
Asset IDs and `visualVariant` values do not replace these driving contracts.
`submarine` provides underwater movement; `spacecraft` provides zero-gravity
body-local translation and rotation, not orbital mechanics. Read the current
`inputGuide()` for each mode's throttle, steering and braking semantics.

| Model binding | Configuration and authoring rule |
| --- | --- |
| Root | Metres, +Y up, +Z forward; unit scale and ground-level origin. Hand the vehicle root to the SDK; author visual children. |
| Wheels | Iterate `wheelPhysics.wheels` in order. Each `{x,z}` is a hub location; Y is `hubHeight`. Use `radius` and `wheelWidth` for geometry. |
| Wheel hierarchy | One steering Group per wheel, with a spin Group child. Steering rotates about Y; spin rotates about X. Keep the same order in `wheelRigs`. |
| Chassis | Match `envelope` and configured dimensions. The solver derives a simplified tapered hull/cabin; arbitrary visual silhouettes do not automatically become collision shapes. |
| Seat | `spec.seat` is the local pelvis anchor, not the cushion top. Use the supplied drive/ride pose; check actual cushion and limb clearance. |
| Environment | Declare real ground/obstacles, a region allowing `spec.mode`, and a spawn matching the instance. Movable props additionally need `rigidGroup`. |
| Display | Pass `sample.vehicles[index]` from `onVisualUpdate((dt,sample)=>...)` to `humanoid.updateVehicleWheels`. This carries suspension, spin and steering at the chassis display time. |

Read the full [motorcycle example](../../examples/three-creator/custom-vehicle/main.ts)
with `creator_get_examples({topic:'custom-vehicle'})`, or the
[self-drawn car](../../examples/three-creator/vehicle-camera/main.ts) with
`topic:'vehicle-camera'`. Both use only the preset humanoid asset. The car example
includes transparent windows and SDK camera switching. HUDs and buttons are
Presentation DOM code; `vehicle.recover` is the SDK recovery command.

For the Host baseline, request
`creator_get_authoring_schema({topic:'humanoid',sections:['humanoid']})` to read
`roadVehicleConfigurations` and the actual source contracts. A materialized
workspace SDK exposes its source definitions, not potentially stale Host preset
values. Change dimensions before building geometry; coordinate any later changes
across physics, wheel visuals and seat fit. Include the requested driving and
interaction outcomes in the existing real-input self-check. Query configuration
or diagnostics when needed; this workflow adds no mandatory tool calls or gates.

Current integration covers road physics and movable props. Detailed RPM/gear and
wheel-load/slip telemetry is not yet directly exposed by the Agent's standard
observation tools; the self-drawn examples also do not include the Playground
engine dashboard. These are optional observation/presentation follow-ups, not
production prerequisites. See the [integration status](../../docs/reviews/2026-09-09-creator-vehicle-integration-status.md)
for scope, evidence and remaining work.

When requested gameplay requires a vehicle or actor to move a prop by impact,
identify that prop and compare its actual physical pose before and after real
contact. Proximity, a blocked character, or a technically successful Creator
recording does not prove that the prop moved. Use the existing playtest and
on-demand observation evidence; this is an outcome choice, not a separate fixed
test for every scene.

## Per-wheel road simulation

An optional `VehicleSpec.wheelPhysics` enables the configurable road model for
wheeled and motorcycle modes. Configure `mass` in kilograms and `radius`, `hubHeight`,
`halfTrack`, `halfWheelbase` in metres. The capabilities playground enables it
for the rover, racer and utility rover. Author the chassis envelope above the
tyre contact plane; cylinder sweeps with the tyre radius, width and steering angle
supply ground support. `wheelWidth` defaults to 0.4 m.

`centerOfMassHeight` sets the local mass centre in metres (default 0.65 for cars,
0.85 with rider balance). Both rigid-body mass properties and force moment arms
use this value. The playground uses 0.65 for rover, 0.75 for utility rover,
0.50 for racer, 0.45 for supercar and 0.30 for kart. These are authored tuning
values, not measurements of production vehicles. `tireFriction` multiplies ground
friction (default 1); the playground uses 1.4 for rover/utility/kart and 1.55
for racer/supercar so the high-speed trajectory responds under throttle. These are
handling calibration values. `grip` controls lateral velocity response in /s independently.
Cars keep their full mechanical steering angle at every speed: central full lock
is min(0.65, 0.5 × steer) radians, with inner/outer Ackermann angles applied afterward.
Input response still smooths steering changes. Actual turning comes from tyre
friction and chassis forces; the model does not impose a speed-based angle cap,
hard lateral-acceleration cap or direct body orientation correction.
`steeringGripRatio` (default 0.85, range >0 to 1) scales the steering axle friction
limit on cars, leaving the non-steering axle a stability reserve during repeated
countersteering. It is a handling calibration, not a measured tyre coefficient.
The existing rider-balance steering path remains separate.

For cars, steering response is divided by `1 + abs(forwardSpeed) / 20` while
the final mechanical angle stays unchanged. This smooths rapid countersteering.
Traction control reserves lateral capacity as steering and speed increase:
the drive torque ceiling is `0.95 * grip * radius * sqrt(1 - reserve)`, where
`reserve = 0.8 * steering² * min(1, abs(forwardSpeed) / 15)` and steering is
clamped to ±1. Straight-line traction retains its original ceiling. Combined
tyre forces still obey the same friction circle; no extra yaw torque or pose lock
is applied. Rider-balance profiles keep their own steering and traction response.

The humanoid runtime fixed step owns spring/damper support, per-wheel tyre forces and
chassis force/torque integration. Ground friction comes from the queried collider.
Throttle supplies wheel torque, steering uses inner/outer wheel angles, braking
and lateral force share a grip limit. `maxRaise` and `maxDrop` are relative to
the 0.25 m nominal suspension length; each defaults to 0.1 m. The playground
uses raise/drop of 0.02/0.025 m for the racer, 0.025/0.025 m for the rover and
0.04/0.045 m for the utility rover. Spring stiffness uses 2.2 Hz sprung-mass
frequency, 0.8 damping ratio and static per-wheel weight preload. At maximum
compression a unilateral suspension-axis impulse uses chassis effective mass,
contact-point velocity and bounded penetration correction to transfer the load
to its linear and angular motion. The correction speed is capped at 0.6 m/s;
no separate rigid wheel collider redirects horizontal speed into a curb launch.
Damping uses contact-normal velocity divided by the suspension/normal alignment,
so motion uphill is not mistaken for suspension extension. The compression stop
uses this projection only when alignment exceeds 0.9; sharp edge normals retain
the suspension-axis velocity to avoid converting a curb strike into a launch.
A dynamic chassis in the existing Rapier
world resolves translation, rotation, contact friction and CCD together. A tapered
lower hull and separate cabin replace the solid outer envelope for physical contact;
the envelope remains available for character and boarding queries. Vehicle gravity
is 9.81 m/s²; the world's existing humanoid gravity remains unchanged. Suspension
and tyre forces run before each shared physics substep (at most 1/120 s), and both
animation and the mounted camera read the resulting body state. Parked physics-enabled
vehicles continue simulating with parking brakes. Reset releases the old body.
This is a custom simplified force model, not the Chaos solver. ABS, tyre damage and deformable
tyres are not implemented.

`HumanoidDisplaySample.vehicles[n].wheels` carries suspension length, steering and
spin angle at the chassis display timestamp. `onVisualUpdate` receives this sample
as its second argument; `updateVehicleWheels` reads it without a second animation
integrator. Reset recreates wheel state. Vehicles without this configuration keep
their existing controller and wheel animation.

### Engine and automatic transmission

The local playground's **原地扶正** button and unassigned **R** shortcut call
`HumanoidRuntime.recoverVehicle()`; command clients use `vehicle.recover`.
Recovery requires an occupied wheeled/motorcycle/unicycle/skateboard vehicle, nearby dry ground and
enough clearance. It first tries the current horizontal position, then searches
outwards up to 6 metres if the chassis spans a ledge or uneven support. Nine
support samples over the chassis footprint plus margin reject missing ground,
excessive height differences and unsuitable slopes. Nearby placement also checks
obstacles along the relocation segment and the complete upright body clearance.
The notification distinguishes nearby relocation from in-place recovery. It preserves heading, driver, camera mode
and the authored start point, clears motion and resets wheel/drivetrain state.
It raises the upright body just above local support and lets suspension settle.
Missing ground or obstructed clearance rejects the operation without moving the
vehicle. The existing reset button still returns to the authored start.

The four-wheel model uses `wheelPhysics.powertrain` (`PowertrainConfig`), with
defaults when omitted. Specify `torqueCurve` as increasing `[rpm, Nm]` pairs,
`idleRpm`, `maxRpm`, `upshiftRpm`, `downshiftRpm`, positive descending
`forwardRatios`, `reverseRatio`, `finalDrive`, `efficiency` (0–1), `shiftSeconds`,
`engineBrakeTorque` (Nm), `dragArea` (CdA in m²) and `rollingResistance` (coefficient).
Runtime configuration validates these values and clones them per vehicle.

For forward driving, Shift plus W also multiplies engine torque by optional
`boostTorqueMultiplier` (default 1.8, valid range 1–4), in addition to selecting
the higher speed limit. While accelerating it requests a lower gear when its predicted RPM is below 85% of the sport upshift threshold; that threshold is 110% of normal, capped 350 RPM below redline. Shift interruption and cooldown still apply. It does not boost reverse or bypass braking, shift
interruptions or the RPM limiter. Grounded wheel drive torque is limited to 95%
of its available friction torque as a simplified traction control. Upshifts also
require the road-speed-equivalent RPM to reach the threshold, preventing transient
wheelspin from selecting a higher gear too early.

Wheel angular speed feeds engine RPM through the gear ratio. The torque curve,
throttle, ratio and efficiency determine axle torque, shared equally between configured driven
wheels. Automatic shifts interrupt torque through neutral, then engage over 0.18 s.
Ground contact and slip gate automatic shifts; RPM hysteresis and cooldown prevent
rapid gear hunting. Opposite-direction input brakes before selecting D/R near rest.
Gravity, tyre load, engine braking, rolling resistance and quadratic aerodynamic
drag determine hill performance without a scripted slope-speed multiplier.

`vehicle.wheelPhysics.powertrain` exposes RPM, current/target gear (R=-1, N=0),
shift time remaining, engagement, throttle and engine/axle torque. The fixed clock
owns this state; reset recreates it. The playground HUD reads it without advancing
simulation. Rover, racer and utility rover have separate authored engine settings;
the terrain test prepares them before the 12° ramp.

For these vehicles, legacy `accel`, `coastDeceleration` and `brakeDamping` do not
drive physics and are disabled in the playground inspector. Use the powertrain
configuration for those effects; `brakeDeceleration` sets brake torque capacity.
Existing speed settings limit engine drive, rather than forcibly clamping downhill
velocity. This is a simplified automatic powertrain with launch slip and no engine
stall; it does not model a full clutch, torque converter, differential or manual gears.

### Movable environment props

Set `EnvironmentBox.rigidGroup` to `{id, massKg}` on each part of a movable
object. Parts sharing an id form one compound dynamic body; `massKg` is the total
group mass and must agree on every part. Box positions/rotations remain authored
world transforms. Ungrouped boxes remain fixed. EnvironmentQueries owns the body
in the existing Rapier world, with gravity, CCD, friction and angular motion.
`propBoxPose(id)` returns each physical part's current world pose for presentation;
`resetRigidGroups()` restores the original group poses and clears velocities.

The Agent chooses which objects need this behavior from the scene and gameplay,
not from a prescribed category list. Set `rigidGroup` when a box assembly should
respond to gravity, forces and collisions; omit it when the assembly should stay
fixed because of its support or gameplay relationship. Resting on the ground alone
does not make an unattached object fixed. If it should rest in place, provide
physical support; without support it falls. Keep separate physical objects in
separate groups and the total group mass identical on every part.
`creator_get_examples({topic:'character-actions'})` supplies a complete example
in `map.ts` and `main.ts`, including seated and pickup interactions. Its visual
callback reads the current `world.humanoid.simulation.environment` after every
reset/map replacement and applies `propBoxPose` to scene-root meshes. For meshes
under transformed parents, convert these world poses into parent-local space.
Use `world.reset()` for a complete scene reset, including characters and items;
observation callbacks only copy poses and never step or reset physics.

The playground groups chairs and tables, and makes loose boards and freestanding
markers movable. Its building and traversal-course structures remain fixed;
these are choices in that example, not rules for other scenes. Seat anchors follow the group's pose; moving, tilted or displaced occupied seats cancel
seating. Pickup objects use independent dynamic bodies while unheld, so removing
their table support lets them fall. Their existing rotation lock is retained for
the authored carrying animation. This supports moving and tipping whole props;
it does not implement fracture or a full Chaos vehicle solver.

## Self-drawn fixed-wing aircraft

`humanoid.createAircraftSpec('plane')` returns a fresh model-free light fixed-wing
spec. Read it through the humanoid schema's `aircraftConfigurations.plane`, or use
`creator_get_examples({topic:'custom-aircraft'})` for the complete example.
Bind its Three root and spec through the same `createHumanoidWorld({vehicles})`
path as a car. Keep the supplied person separate and use `spec.seat` as the pelvis
anchor. Map regions must permit `plane`.

`spec.airframe` describes the existing solver's fixed mass, inertia, collision
boxes and ordered landing wheels (+Y up, +Z forward, metres/kg/seconds). It is a
read-only authoring reference, not per-instance physics overrides; modifying it
or scaling the root does not change that solver. Movement parameters remain
configurable. Use the ordered wheel groups with `onVisualUpdate` and
`updateVehicleWheels` for suspension, steering and spin.

Shift increases persistent throttle, Ctrl decreases it, W/S pitch down/up, A/D
request coordinated turns, Q/E add bank, and Space brakes on the ground. The SDK
owns thrust, lift/drag, stall and landing physics. This factory does not supply
rotorcraft/VTOL, propeller RPM/dynamics or automatic aerial navigation.

## Configurable road vehicle physics

Set `spec.wheelPhysics = humanoid.createRoadPhysicsProfile('car' | 'motorcycle', overrides)`
for `wheeled`, `motorcycle` or `bus` subjects. Both run in the existing physics world and use
per-wheel suspension, tyre forces, dynamic chassis collision and the powertrain.
The motorcycle profile enables grounded rider balance torque; it does not right
an airborne or overturned vehicle. Its low-speed reverse is a playground assist.

Override mass (kg), radius, hubHeight, halfTrack, halfWheelbase, wheelWidth and
suspension maxRaise/maxDrop (metres) to match the authored model. Supply `wheels`
as an ordered list of `{x,z,steering,driven}` for 2–12 wheels. The visual wheel-rig
order must match this list. All wheels currently share tyre radius and suspension
settings. Omitting the list retains the legacy four-wheel layout. Motorcycle
profiles derive two centreline wheels from halfWheelbase unless overridden.
Driven wheels share axle torque; sprung load and braking scale with wheel count.
Wheel presentation reads the same interpolated hub height, suspension, spin and
steering state. Do not retain a separate visual lean/rolling integrator.

Current playground mapping includes the existing cars and motorcycles, plus ATV and bus.
An optional `wheelPhysics.chassis` box specifies a model-specific collision hull;
omitting it retains the existing car chassis.
Aircraft, hovercraft, the existing boats, boards and animal-drawn carriages use
`bodyPhysics.kind: 'motion'`. Their specialised controls supply bounded forces
and torques to the same dynamic rig; only the shared Rapier step writes their
position, orientation and collision momentum. All 32 playground presets and
the 30 catalog vehicle assets declare one physical owner. Custom vehicles
without a profile receive a dynamic motion body (paddled craft receive a paddle
body); author explicit mass and hull dimensions for custom geometry.
This is a reusable road solver, not a complete vehicle simulation: no individual
wheel masses, differential model, per-wheel tyre sizes or trailer joint solver.

The additional tank, unicycle, sled, skis, kayak, canoe, raft, jet ski and observation
submersible opt into `spec.bodyPhysics`. Their controllers submit force and torque
to the same native vehicle rig, collision world and fixed clock as road vehicles.
They do not integrate a second position or camera. Authored mass is in kg, centres
and propulsor radii in metres, displaced water volume in m³. Their rounded hulls
retain the envelope's outer dimensions; the tank adds its articulated barrel.
Engine-driven profiles use the existing powertrain's torque and direction-change
braking. Human-powered profiles use ground contact or immersed paddle strokes.
Parked vehicles remain physical and can be pushed. Body pose, wheel/track travel,
water effects and the seated rider sample the resulting motion.

`humanoid.vehicleDriveTelemetry(vehicle)` is a read-only sample. Engine vehicles
report real powertrain RPM, gear and throttle; human-powered vehicles report
cadence and effort instead of fabricated engine readings. The same sample appears
in `snapshot().vehicleDynamics[].drive`, with `physicsOwner` identifying native
rigid bodies. The playground shows these values in its lower-left instrument.
Motion-controlled craft report `kind: 'motion'` with control effort and speed,
without fabricating an engine or human-powered cadence. Unoccupied vehicles
continue to exchange collision momentum; carriage parts share the same compound
body, with articulated lead geometry rather than a separate trailer solver.
