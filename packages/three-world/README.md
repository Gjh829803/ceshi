# Three World SDK

Author ordinary Three.js geometry, materials and cameras. The SDK binds physics,
movement, animation, input, camera follow and observable commands to that content.
When humans appear, keep the supplied humanoid's visible model, skeleton and motions.
Choose the controlled subject from the request; animal protagonists need no extra human.
Reuse other supplied subjects when suitable; otherwise create and bind
Mesh/Group subjects matching the reference.

## Optional debug tools

`@worldkit/three/debug` is an explicit browser entry, separate from the core SDK
and the internal `@worldkit/three/testing` entry. Importing it does not mount UI,
register browser tools, start recording or change simulation.

- `inspectDebugCamera(world)` reads compact camera state without stepping or rendering.
- `createDebugControls(port)` provides validated pause/step, character placement,
  camera intent and vehicle interaction tools. The host supplies readiness, input
  clearing, pause presentation and rendering against its existing world.
- `createDebugRecording(port, store)` provides bounded input history, same-frame
  incident capture and reset-baseline replay. The host supplies a `DebugArtifactStore`
  for source identity and artifact persistence; the SDK contains no local HTTP service.
- `world.inspectCollisionGeometry()` samples detached line buffers from the actual
  shared Rapier world, with a simulation tick and an explicit omitted-segment count.
- `createCollisionOverlay(world, presentation.ui)` projects these committed physics
  lines using the last rendered camera into a separate DOM canvas. This diagnostic
  is an x-ray view, not a depth-tested material; interpolated visuals can differ by
  one fixed tick. It does not change simulation, scene objects or source capture pixels.
- `mountDebugPanel({world,presentation,store,sceneId})` mounts optional controls,
  collider display, camera inspection, recording/replay and source-bound incident
  saving. `registerTools:true` registers the same actions with browser WebMCP.
  Disposal releases the overlay, subscriptions, shortcut and tool registrations.
- `createBrowserDebugStore(identity)` uses browser-local IndexedDB and supports
  explicit JSON import/download and a newest-first scene-specific incident list;
  it never uploads an incident or requires a local server. Pass `listIncidents`,
  `readIncident`, `importIncident` and `downloadIncident` callbacks to the panel
  to enable its saved-incident library, including after reload. Imports preserve
  original source identity; replay still validates the complete trace before reset.
  Cross-version comparison requires an explicit opt-in and reports both identities.
  Ordinary diagnostic snapshots without an input trace cannot be replayed.

Playground consumes this entry and supplies its local file adapter. Replay currently
requires an on-foot native humanoid and a follow camera at the starting point;
it does not restore arbitrary physics checkpoints. Existing version-1 recording
and incident format identifiers are retained so saved evidence remains readable.
The core browser bundle excludes this optional module. Creator's explicit
`--debug-tools` build adds the separate module and automatically mounts it on the
SDK observer's existing world. Production and test builds use identical core runtime
bytes but have different complete artifact hashes. Debug builds cannot be submitted
as production deliveries; rebuild and record without the flag for delivery.

| Layer | Read or change |
| --- | --- |
| Reuse | `createWorld` or the complete `createHumanoidWorld` helper, subject example and selected asset |
| Bind scene and abilities | Collision map, interaction anchors, water, climb surfaces; custom subject body/movement |
| Configure | Movement/profile parameters, units, input bindings |
| Implement | Relevant SDK source module, project runtime build and affected tests |

One world owns one fixed clock, physics backend, controller per actor, animation
owner and active camera writer. Creator compiles and validates; Episode records.
Ordinary and Humanoid views use the same CameraController and subject-data
contract. Subject-specific perspectives retain their visibility policy and use the
shared [collision solver](../camera-collision/README.md). Display interpolation and
repeated captures do not advance collision recovery; fallback positions come from fixed snapshots.

For an auxiliary same-scene view, `world.onRender(alpha => ...)` reports the source
frame's interpolation alpha after its temporary presentation is restored. Inside
that callback, `world.withPresentation(draw, {interpolationAlpha: alpha, view: 'object'})`
temporarily resamples bodies and the camera together, with complete subject visibility.
The synchronous `draw` callback may render but must not step or mutate world state.
Omitting the alpha uses the current fixed sample, as existing capture transactions do.

Positions and dimensions use metres, with **+Y** up. Ordinary actor/capture semantic
front defaults to local **-Z**; Humanoid map headings, vehicles and interaction yaw use **+Z**.
Keep the supplied skeleton orientation unchanged when connecting these conventions.

<!-- topic:getting-started -->
## Choose the controlled subject

Separate playable terrain, inaccessible scenery and intentional gameplay drops.
Use the `boundaries` topic for invisible collision fences and fall recovery;
world/map bounds alone do not provide a physical wall around usable terrain.

`world.humanoid` is the optional humanoid and riding runtime installed
by `createHumanoidWorld` or `createWorld({humanoid: ...})`. It owns the selected
human's walking/riding state and shares the world's clock, physics and camera
ownership. Independent actors registered with `addCharacter` use the ordinary
world interfaces. `humanoid` input and snapshot fields refer to this runtime.
`createHumanoidWorld` loads/binds the character kit; low-level `createWorld({humanoid})`
uses the supplied object and optional animation. Available actions follow those
actual bindings and scene conditions.

Complete humanoids preserve their original model textures by default in browser
hosts with image decoding APIs. Node hosts without these APIs skip textures by
default. Set `characterLoadOptions:{loadTextures:false}` on `createHumanoidWorld`,
or pass `{loadTextures:false}` to `HumanoidCharacter.load`, to request a whitebox
appearance explicitly. Factories and NPC clones retain the resolved choice. Creator whitebox bindings
explicitly select `characterLoadOptions:{loadTextures:false}`; these SDK defaults
do not override the Creator task requirements.

Node consumers can explicitly set `loadTextures:true` to decode embedded PNG/JPEG
images into actual Three DataTextures, including color and normal maps. This applies
to `loadAsset` and complete humanoid loading/factories. No DOM globals are installed;
invalid or unsupported embedded images reject the load and release partial textures.

Complete humanoid loads share a template keyed by the resolved resource URL
closure and model texture loading choice. Keep those URLs immutable for their content version. Each instance has
independent skeletons, inverse-bind matrices, mixer clips, materials and any loaded
texture objects; geometry is shared read-only. Clone geometry explicitly before editing
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
kind; `world.setCameraFollow({configuration:document})` chooses the camera target
independently. Ordinary characters declare their real local eye with `addCharacter({eyePositionLocalMetersXYZ,...})` when using first-person views. Character colliders participate in physical contact
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
`world.setCameraView(viewId)` for the camera; humanoid commands retain input and movement settings.
Reusable asset IDs describe the object (`vehicle.rover`, `creature.horse`);
`asset.vehicle` describes its vehicle controller binding. Source provenance
remains separate from asset identity and controller capability.

Flying-creature bindings may supply `VehicleSpec.flyingCreatureGround` with measured
ground-pose support bounds, root height, saddle, core collision probes and transition
timing. `vehicle.exit` while flying requests landing (or cancels an ongoing descent);
acceptance does not mean the rider has dismounted. Observe
`world.humanoid.snapshot(actorId).vehicleDynamics[].flyingCreature.groundPhase` (`airborne`, `approach`,
`landing`, `grounded`, `takeoff`) and `groundFailure`. Once grounded, `vehicle.exit`
starts the dismount transition; `vehicle.enter` requires proximity and a clear route.
The rider stays mounted until dismount completes, then its walking capsule resumes.
Grounded `input.humanoid.jump` or `brake` requests takeoff; airborne `brake` remains
glide. Unsupported, wet, steep or narrow landing sites and blocked boarding routes
are rejected. The supplied dragon training bindings include all eleven ground
profiles, their own ground clips and a retractable saddle ladder; this currently
supports flat-ground parking, not ground locomotion or per-foot terrain IK.

An unmounted character standing on dry ground can send the one-shot
`input.humanoid.actions.summonDragon` (default H) or call
`world.humanoid.summonDragon(instanceId?, actorId?)`; omitted `actorId` uses the input actor. The existing available flying creature
flies from its current position to a checked landing beside the request position;
a grounded creature first takes off. Neither the character nor camera is teleported.
Read `world.humanoid.snapshot(actorId).vehicleDynamics[].flyingCreature.summon` for `flying`, `landing`,
`arrived` or `blocked`, the fixed target and a message. Acceptance is not arrival.
The route checks higher cruise candidates and sweeps live collision geometry;
it stops on an unexpected obstruction, rather than guaranteeing global pathfinding.
The character must approach the saddle after arrival and use the normal enter command.

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
Read the control declarations for shared entity physics and interaction slots.

Registering, moving or enabling a body updates native scene queries without
advancing simulation. Contact solving and collision events occur on the next
normal physics step. Maintainers can inspect the narrow
[Rapier query-refresh dependency](../../vendor/rapier-query-refresh/README.md).

Choose the helper when its complete human kit matches the task. Otherwise bind
the required subject and abilities through the general world API. Subject routes
guide this choice; they are not mutually exclusive SDK entity classes.

| Subject | Schema / example | Entry |
| --- | --- | --- |
| Human | `getting-started`; `character-actions` for requested actions | `createHumanoidWorld` |
| Human riding | `mounted-interaction` / `custom-vehicle` | Human helper + separate vehicle |
| Animal or other nonhuman protagonist | `nonhuman-subject` | `createWorld` + `addCharacter` |

A human model requirement applies to humans present in the scene, not to every
possible protagonist. Existing `getting-started` example files demonstrate a human.

Configure named views with `CameraDocument.defaultViewId` and `input.cycleViewIds`;
use `world.setCameraView(viewId)` to select one.

### Human setup

Terrain, composition, landmarks, subjects and counterpart objects must follow the reference image. Author their visible silhouettes and spatial relationships independently from collision proxies. Invisible boundaries contain physics only. Implement gameplay only when explicitly requested in the user prompt; otherwise provide free movement/exploration without added missions, observation checkpoints, quizzes, collections or obstacle courses. Capture targets and self-check waypoints are internal evidence, not player objectives.

Reproduce the reference image's visual style and main forms while simplifying fine
detail. Keep environment forms predominantly white with uniform basic lighting. Use
distinct restrained colors for the subject, key counterpart objects and landmarks
selected for three-views; distinguish ground, water and other terrain with subtle
grayscale or tint differences. Keep object colors consistent across play and captures.
Preserve broad composition, scale, spatial relationships and actual collision/action conditions.
Keep the supplied humanoid visible; omit extra clothing, accessories, decoration,
atmospheric effects, reflections and elaborate shadows.

Select `humanoid.uefn-mannequin` in `project.json` and obtain the `getting-started`
example from Creator. Author the visible scene in Three; `map` supplies the actual
collision geometry and action anchors.

```ts
import {createHumanoidWorld} from '@worldkit/three';
const world = await createHumanoidWorld({scene, camera, canvas, map,
  characterLoadOptions:{loadTextures:false}});
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

The humanoid initially faces away from the opening camera on the horizontal plane.
The final camera position is sampled once before the first start/step/reset; later
camera movement does not turn the character. Set `characterFacingYawRadians` in
`createHumanoidWorld` to override it: radians about +Y, `0` faces world −Z,
`Math.PI / 2` faces −X, and `Math.PI` faces +Z (the Episode facing convention).
For `createWorld({humanoid:...})`, the same value is `humanoid.character.facingYawRadians`.
The Agent can author front, side or back views independently of the camera pose/FOV.
Reset and Creator opening captures restore the sealed heading. Episode segment
starts retain their explicitly requested heading. With a directly overhead camera,
the default uses its horizontal viewing direction, falling back to −Z if undefined.
Do not rotate the managed visual root or call `prepareCharacter` in `onReset`;
use the creation option for persistent facing and `map.playerSpawn` for position.

For a self-drawn subject, bind its visual root directly:

```ts
import {createWorld} from '@worldkit/three';
const world = await createWorld({scene, camera, canvas});
world.addEntity({id:'ground', object:groundMesh, role:'terrain'});
world.addCharacter({id:subjectId, object:subjectMesh, body:subjectBody, movement:subjectMovement});
world.setControlledEntity(subjectId);
world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:subjectId},activation:'on-input',views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'}}}}}});
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
The fixed engine activates one camera writer for every subject and view. Changing
the controlled actor does not change the document binding. `useAuthoredCamera()`
releases SDK ownership; rejected configuration and view requests leave the current
owner intact. `inspectCamera()` reports the committed document, named view, intent,
pose, resolution provenance and diagnostics. `desired` is the last committed
unconstrained proposal; snapshot desired position and actual position remain distinct
when safety retracts the camera. With collision enabled, `require-line-of-sight`
also reports a ray from the safe eye to the actual subject target under
`diagnostics.visibility`. An occluded result is limited framing, not proof that no
other view exists; it does not search for or automatically select a different pose.
With collision enabled, solid focus-to-eye arm obstructions are checked in every
follow view; `preserve-framing` does not permit the arm to pass through a wall.
Disabled collision, preserve-framing and first person do not claim the additional
verified actual-subject sightline. Movement profiles cannot change camera configuration.
Do not install an additional simulation timer or mixer.

<!-- topic:nonhuman-subject -->
## Independently controlled nonhuman subject

Create the requested animal or creature as the actor itself. Do not add a hidden
human or rider. Use `createWorld`, register collision geometry with `addEntity`,
bind the model through `addCharacter({object,body,movement})`, then select it with
`setControlledEntity` and `setCameraFollow`. `setCaptureTargets` identifies complete
subjects for Creator and Episode.

The [independent subject binding](../creator-host/docs/agent/examples/nonhuman.ts),
returned by creator_get_examples({topic:'nonhuman-subject'}), accepts your visual
root, body/movement, scene setup and follow configuration. Use permitted models
when suitable; ordinary authored geometry remains available.

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

Declare `eyePositionLocalMetersXYZ` on `addCharacter`, then declare named views in
a CameraDocument. `defaultViewId` chooses the reset view; `input.cycleViewIds`
explicitly permits keyboard cycling. Empty cycles leave programmatic
`world.setCameraView(viewId)` available. Keyboard switching respects UI focus,
pause and one edge per press. First-person ignores zoom; each third-person view
retains its own intent. The subject is hidden only during primary first-person
presentation and restored afterward; object views show the complete model.
Read `world.snapshot().camera.viewId` / `viewKind` and `world.inspectCamera()` for
actual committed state. Episode uses `cameraViewId` for a segment start.

This route has no human mount/dismount controller. Show controls for its actual
abilities, exercise movement/collision/camera/reset, and use the same Creator
playtest/submit and Episode capture interfaces. Humanoid-specific character
continuity reports `not-applicable` when the ordinary SDK snapshot has no Humanoid
controller; unavailable telemetry remains distinct from this result.

### Recording custom movement

A movement can provide an optional Episode input adapter alongside `update`;
configure it on the same movement definition described in the extensions topic.

Bind it with `movement:{kind:'custom',movementId}`. The adapter returns
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

Asset IDs identify selectable resources; `locomotion.*` tags describe binding
families, not asset IDs or installed controllers. `animationClips` lists animation
resources, `actions` maps clip playback, and executable character skills expose
their own requests and preconditions. A listed clip does not imply an executable action.

The default `humanoid.uefn-mannequin` retains the Source101 rig and existing motion
resources. `creature.dragon-evolved` uses the simple dragon controller; numbered
`creature.dragon.d01`–`d11` use the distinct `locomotion.flying-creature` binding.
Source rig names and imported filenames remain provenance rather than public asset aliases.

Use `assets_search` / `assets_describe`, then select IDs in
`project.json: {schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}`. The compiler
packages verified resources. `world.assets.search(query)` describes that selection;
`world.assets.load(id)` creates an independent instance for ordinary
`world.addCharacter({id,asset})` binding. Full contextual humanoid movement uses
`createHumanoidWorld`; playback of a named clip alone does not add an ability.
Generic assets, horse and flying-creature model textures are disabled by default
(`loadTextures:false`). Complete humanoid loaders preserve textures by default
when the host supports image decoding. With textures disabled, the loader
skips model image decoding while preserving material base factors and vertex colors;
it does not rewrite the GLB or recolor its source data. A model whose color came
from textures can therefore appear white. To load model textures in a browser,
choose the option on the initial load:

```ts
await world.assets.load(assetId, {loadTextures:true});
await createHumanoidWorld({scene, camera, canvas, map}); // Browser humanoid textures default on.
await character.load(resourceUrl);                     // HumanoidCharacter: same default.
await horse.load(resourceUrl, {loadTextures:true});     // HorseVisual
await flyingVisual.load({dragonUrl, flameTextureUrl, animationPrefix:'D01',
  loadTextures:true});
```

`ModelLoadOptions` applies to model images only. Explicit effects such as the
flying-creature flame atlas keep their own texture loading contract. Opting into
model textures without image-decoder APIs rejects with
`MODEL_TEXTURE_DECODER_UNAVAILABLE`. Disabling model textures does not by itself
make the full FlyingCreatureVisual or its effects usable in Node. Existing source
factories preserve the texture choice when creating another instance.

Catalog `locomotionBindingIds` describe supplied content for discovery. They do
not select or install a controller; binding uses `asset/object` with `movement`,
or an actual `humanoid` instance.

The public asset loader verifies self-contained GLB bytes before parsing. In Node,
embedded PNG/JPEG images (buffer views or data URIs) decode into real RGBA
`DataTexture` pixels without DOM globals or texture mocks. Corrupt or unsupported
image formats reject the load. Browser loading continues to use Three's native
image path. Geometry and textures are shared immutable resources: dispose the
asset instance, not its borrowed textures; clones retain them until the final
instance releases them.

For Creator generation, every human (including NPCs and riders) must use the
permitted preset visible model, skeleton and motions; omit added clothing,
accessories and decorative visual children. Keep each person as the same instance
through walking, mounting, riding, dismounting and reset. Never hide the preset
person or include a replacement human in a vehicle model. Reuse supplied creatures
when suitable. Vehicles use model-free handling configurations and Agent-authored
Mesh/Group geometry; do not load supplied or external vehicle models. The catalog supports reuse without restricting Three
geometry; custom subjects and compatible external assets follow the task's
effective asset policy.

For a custom vehicle, see the [preset rider + custom motorcycle example](../creator-host/docs/agent/examples/vehicle.ts)
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
  const asset = await scope.assets.load('humanoid.uefn-mannequin');
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

<!-- asset-info:humanoid.uefn-mannequin -->
`humanoid.uefn-mannequin` supplies 48 animation clips. Six skills accept discrete
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
| Swim / dive | Automatic deep-water entry; see Water below for vertical input | `map.water` and real pool-bottom/shore colliders. |

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
// Supply the authored physical object and its measured interaction slots.
world.addEntity({id:targetId,object:targetObject,role:'obstacle',physics,
  interactions:interactionSlots});
await world.execute({type:'humanoid.perform-action',actorId,
  request:{requestId,action:'sit',targetId,slotId}});
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

**Water** — use the native humanoid controller (`createHumanoidWorld` or
`createWorld({humanoid})`) for surface swimming and diving. Declare volume bounds
and surface height in `map.water`, with a real lower floor. For example:

```ts
water: [{id:'pool', min:[-10,-5,-12], max:[10,-.2,12], surface:-.2}]
```

Use the same surface-height value for the visual water and its declaration.
A ground collider extending over the pool makes it shallow regardless of the
visible water. Entry currently requires measured depth >1.28 m and feet >0.95 m
below the surface; retention uses depth >1.16 m and feet >0.5 m below the surface.
Depth uses support below the character, so a submerged overhead structure does
not become the swimmer's floor. Author real pool-bottom, wall and shore colliders.

Once swimming, hold the jump binding (default Space) to ascend and the crouch
binding (default C/Ctrl) to dive. Semantic input uses `humanoid.lift` in [-1,1]:
positive ascends, negative descends, and zero brakes to hold depth after a dive
outside the 4 cm surface-return band.
Both held keys cancel vertical intent. Vertical speed is 1.55 m/s at full input;
horizontal sprint does not change it. Entry without a dive preserves surface
buoyancy. Ascending back to the surface restores buoyancy; walking into shallow
support restores land movement. Underwater contact still uses the same capsule
and KCC, including floor/ceiling collision. Water exit, reset and relocation clear
underwater control. Existing swim clips provide animation; no separate diving
clip, breath timer or drowning mechanic is implied.

`world.snapshot().humanoid.water` and Creator `feedback.water` report the actual
contact and threshold decisions. `water.contact.swimmingMode` is `surface`,
`underwater`, or null when not swimming; it identifies the controller mode, not
whether the head is below water. `feedback.waterTimeline` records surface/underwater
changes in a playtest. These diagnostics do not modify the controller or validation.
Verify the task's requested entry, vertical movement and shore exit through real
input and observed outcomes. For requirements beyond native capabilities, describe
the missing behavior and extend its owner; custom movement must supply its own
functional evidence and does not inherit native water diagnostics.

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

Supply the actor IDs, spawn position, movement and autonomy from the authored task.

```ts
const character = await world.humanoid!.createCharacter();
character.root.position.fromArray(spawnPosition);
world.addCharacter({id:actorId,humanoid:character,movement});
world.setAutonomy(actorId,autonomy);
// Input selection and camera targeting are independent choices.
world.setControlledEntity(inputActorId);
world.setCameraFollow({configuration:{
  kind:'world-camera', schemaVersion:1, defaultViewId:'explore',
  binding:{targetEntityId:cameraActorId}, activation:'on-input',
  views:{explore:{kind:'third-person',overrides:{framing:{kind:'preserve-opening'}}}},
}});
```

`setCameraFollow` accepts a complete `CameraDocument` for ordinary and complete
humanoid actors. Author the opening pose/projection, then declare
`framing:{kind:'preserve-opening'}` with `activation:'on-input'` to retain it until
meaningful input. The document's `binding.targetEntityId` is independent of controls.
Declare named views in `document.views` and select them with `world.setCameraView(viewId)`.
For an already active follow view, `world.setCameraOrbit({yawRadians, pitchRadians, distanceMeters})`
sets absolute orbit intent in that view's reference frame; provide at least one field and omitted
fields retain their current intent. This immediately cuts to freshly constrained camera geometry,
rebuilding camera follow/recovery history without advancing simulation or changing the document,
reset baseline, subject or physics. It is not a recording-checkpoint restore. Unknown/nonfinite or
out-of-range values, pending/authored views and Episode ownership are rejected; first-person views
accept yaw/pitch but reject distance. Collision may shorten the resulting eye distance.
For opt-in maintenance evidence, `world.onRuntimeSample(callback)` reports consumed
`fixed-input` samples and `rendered-frame` camera/subject transforms. Rendered
transforms are sampled while presentation is applied; callbacks run after it is
restored. Samples are detached copies; a throwing observer is detached without
stopping gameplay. This does not add a simulation or rendering loop.
`WorldInput.cameraYawDeltaRadians`, `cameraPitchDeltaRadians` and
`cameraDistanceDeltaMeters` represent one-tick deltas; repeated manual ticks clear
them after the first tick. Fixed samples include those consumed pointer deltas and
the native actor's applied input. These are replay inputs, not physics checkpoints.
Ordinary first-person subjects supply `eyePositionLocalMetersXYZ` at registration;
complete humanoids use stable capsule eye positions on foot and prefer their
animation-bound eye while mounted, with a seat-relative fallback. Inspect
`world.inspectCamera()` for the active document, resolved configuration and committed
camera state; movement profiles do not configure or report camera settings.
Automatic selection reports unavailable rule view IDs and the original failure
code, message and field path. The selected `viewId` identifies the actual fallback.
For optional developer CPU measurements, call
`world.setCameraPerformanceDiagnosticsEnabled(true)` and read
`world.inspectCamera().performance`; disable it after measurement. Input, fixed
camera evaluation and presentation each retain at most 240 samples. Probe time is
included in stage time; it measures geometry-provider calls, not GPU time or every
underlying physics query. Clock failures report unavailable without stopping play.
The native `prepareEpisodeStart` helper only places physical subjects and rejects
`cameraViewId`. Recording starts that select views use the World Episode port
`prepareSegment(start, viewport)`, which owns reset, placement and camera initialization.

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
and another actor cannot board or prepare that occupied vehicle. Use the [human integration guide](../creator-host/docs/agent/assets/humans/integration.md)
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

Brake while steering above 2.5 m/s; strength
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
Optional `map.boundaries` adds invisible collision fences; see the `boundaries`
topic before placing playable edges or inaccessible scenery.
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
| Mouse drag | Camera orbit, including while mounted |
| Arrow keys | Camera orbit; spacecraft reserves all arrows for pitch/strafe, tank reserves up/down for gun elevation |
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
Keyboard routing uses the controlled actor's current vehicle mode, independently
of the camera target. Unreserved axes remain camera inputs and do not also drive
the vehicle. Rebound camera keys follow the same rule. For initial framing and
mount handoffs, follow the [camera setup guide](../creator-host/docs/agent/programming.md#initial-state-and-camera).
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

`world.humanoid` provides prepare, approach/enter/exit, map switching and movement
profile methods. Camera configuration and named view selection belong to World. These preparation helpers may relocate; normal
movement uses real input. Generic navigation, impulse and root-edit commands are
unavailable for contextual actors. Commands are `vehicle.prepare`,
`vehicle.approach`, `vehicle.enter`, `vehicle.exit`,
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
await world.execute({type:'humanoid.apply-profile',profile:authoredProfile});
const savedProfile = world.humanoid!.exportProfile();
const current = world.humanoid!.inspectConfiguration();
```

Profiles merge by instance ID and persist across reset/map/Episode initialization.
`exportProfile()` returns complete replayable movement controls.
`inspectConfiguration()` reports the active subject/family and applicable control
values alongside that profile; `world.inspectCamera()` reports camera state.
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

Install a complete, parsed CameraDocument with `world.setCameraFollow({configuration})`.
`defaultViewId` selects the initial/reset view. `input.cycleViewIds` is an explicit
ordered list of declared IDs; an empty list disables keyboard cycling without
blocking `world.setCameraView(viewId)`. Native defaults declare third-person,
first-person and shoulder, with keyboard cycling disabled. Playground and examples
that enable T do so in their project documents. Held repeats, pause and focused UI
do not toggle. Explicitly switching to another view restores its calibrated initial orbit;
automatic state changes preserve the current orbit heading while adopting the new
view's framing. Both use the configured transition, except first-person cuts;
interruption starts from the currently committed pose. Selecting an already active
following view retains its orbit and establishes a manual choice when rules exist.

### Authored opening and subject integration

Import project `config/camera.json` relatively, parse it with `parseCameraDocument`,
and install it before the first start/step/reset seals the baseline. Referenced
presets are snapshots embedded in `document.presets`; there is no runtime preset
fetch or asset/map-name tuning override. `createHumanoidCameraDocument(actorId)`
returns the SDK-owned native calibration, separately from generic strategy defaults.
Creator `assets_describe` can return registered `cameraPresetSnapshots` for explicit
embedding. These describe content calibration; workspace SDK compatibility is
unverified and the actual subject must still be resolved and inspected.

A third-person view uses `framing.kind:'preserve-opening'` with its own `opening`,
or explicitly adopts the first authored pose when no opening is present. Its
world position, look-at/up and FOV remain canonical configuration data. Near/far
are explicit lens fields. Both third-person framing modes use the declared
`position.anchor` and `anchorOffset`; `preserve-opening` derives initial orbit
angles and distance from that anchor while retaining the authored pose. Use the native posture
anchor presets for humanoids; the generic preserve-opening default is origin.
`look-at` uses the declared initial distance and angles. The follow arm uses the
source Cartesian response; safe contraction is immediate and radial recovery has
its own timing. Configuration semantics and native calibration are described in
[SDK configuration](src/config/README.md). Near-subject fading is opt-in through
`subjectFade` and affects only the world render transaction. Angles use radians, lengths use meters, and half-lives use
seconds. `orientation.recenter` is an explicit behavior; it never follows an asset
name. Zero-time lifecycle changes and cuts clear incompatible path history.

`binding.targetEntityId` is independent of input ownership; `mountTarget` declares
whether the actor's current vehicle or actor is followed. Ordinary characters
provide optional local eye geometry through `addCharacter`; native subjects use
actual posture/driver eye and seat facts. Subject sampling does not write cameras
or advance simulation. All strategies feed one controller and the shared collision
solver. Other actors remain potential obstructions; only the actual subject is
excluded. Presentation interpolates fixed history, applies stateless safety and
never advances damping or recovery.

`useAuthoredCamera()` releases the owner. `beginCameraEdit()` requires a sealed
baseline; applying a draft changes live configuration, while `commitBaseline()`
explicitly changes reset configuration. `createOpeningDraft()` performs SDK-owned
current-to-initial reference conversion, with subject/generation checks. Saving
project JSON does not implicitly commit a World baseline. Session cancellation
restores configuration only while its ownership and reference checks remain valid.
`session.resumeViewSelection()` releases an applied draft's automatic-selection
hold while retaining that session's original cancellation checkpoint.

Episode port version 2 declares sealed baseline view IDs and selects named views
through `cameraViewId` or `camera.set-view`. Prepare cuts to the requested start;
commands within the segment honor transitions and settle against actual view ID
and transition state. Authored worlds without a camera document declare no managed
views. Explicit v1 translation belongs only to the Episode import boundary.

### Humanoid camera perspectives

Use `world.inspectCamera()` for current view kind, resolved fields, provenance,
fixed pose and measured collision diagnostics. `world_preview({view:'current'})`
captures the current state; `view:'opening'` restores the sealed opening. Diagnostic
projections do not prove pixel visibility; inspect actual images separately.

First-person presentation clips the native head/neck in temporary instance-private
geometry and restores original geometry afterward. Body transforms, animation,
movement and vehicle attitude remain owned by their existing runtime. Roll
inheritance is a view orientation field; it does not rotate the vehicle.

Vehicle camera queries refine envelopes using rigid Mesh triangles. Open cabins
remain open; solid panels obstruct. Transparent materials with opacity below one
and transmission materials are not opaque sight blockers, while glass still blocks
the collision sphere. Other vehicles remain obstacles. Empty, skinned or actively
morphed roots retain conservative envelope queries. Preserve material transparency,
side and array slots when recoloring whitebox models. Inspect actual first-person
pixels and complete object views separately.

<!-- topic:control -->
## One state for gameplay and text commands

`world.defineParameter` registers typed desired state and its declared writes.
`world.onInteract` can route interaction to the same parameter command.
Parameter.value is the committed desired state; status reports transitions or
interruption, and actual transforms are queryable. A property plan only returns persistent property
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

Camera configuration is a separate CameraDocument. Read the current committed view,
configuration provenance, pose and diagnostics through `world.inspectCamera()`;
movement profile updates cannot install camera fields.

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

Movement returns intent; the SDK performs the actual KCC collision step.
Register the task's definition and synchronous callbacks:

```ts
world.registerMovement({
  id: movementId, version: movementVersion, description: movementDescription,
  initialState, update: updateIntent, episode: episodeAdapter,
});
```

`updateIntent` implements `MovementDefinition.update`: calculate velocity/state
from its input, body, time and probe context. `episodeAdapter`, when needed,
implements `MovementEpisodeAdapter.input` and returns actual WorldInput.

A movement callback does not provide flight navigation. Do not promise NPC aerial
pathfinding from a movement callback. Query registered movements and entity
commands; switching back uses the registered ground movement ID from describe.
The callback is synchronous and pure, uses SDK input/time/body/probes, and returns
velocity/state. It must not move Three roots, create physical bodies or own a timer.

A visual/state parameter may use a synchronous effect instead of a property plan.
Effects may change only their declared visual/state channels. They cannot
mutate managed entity roots, colliders or camera, do IO, or return a Promise.
Keep physical changes in SDK commands.

`world.registerGeometry` registers named geometry; `entity.set-geometry` applies
it to a registered non-skinned Mesh. The SDK prepares and
validates replacement collision/navigation before commit; keep the original
geometry registered under another ID to restore it. Do not mutate a published
geometry template. Geometry IDs are discoverable; an effect cannot secretly edit
physics geometry. Async procedural geometry uses scope.replaceGeometry.

The React editor in `apps/sdk-playground` uses the scene and vehicle modules in
`packages/preset-content`. Authoring bindings are indexed by the [Agent asset guide](../creator-host/docs/agent/assets/README.md).

<!-- topic:presentation -->
## Per-object whitebox color

Colors are authored per instance, with no SDK role palette. Choose distinguishable
colors for the subject, requested enemies and different important counterparts;
same-kind repetitions may share a color. Keep the world predominantly white and
terrain differences subtle. The choice remains the same in play and captures.

Humans use `createHumanoidWorld({...,characterColor})` or
`character.setColor(chosenColor)` on a loaded or not-yet-loaded `HumanoidCharacter`.
The character owns cleanup; `setColor(null)` restores its original materials.
Factories capture the color when created; set each new important person's color
explicitly. Input selection, riding and camera changes do not recolor anyone.

For other models, `setObjectColor(visualRoot, chosenColor)` returns an
`ObjectColorBinding` with `color`, `setColor` and `dispose`. Colors are sRGB
`#RRGGBB` strings chosen by the author. Call after loading, on disjoint visual roots,
before attaching independently colored riders or carried objects. It colors current
mesh descendants only; later children keep their own appearance. For world-lifetime
objects register `world.onDispose(() => coloring.dispose())`; dispose the binding
before releasing a model that is removed earlier. It restores original materials
and releases only its own replacement materials, never source textures or geometry.
Repeated calls on the same root update its binding. For authored meshes, normal
independent Three materials remain sufficient.

The helper uses matte materials under scene lighting, replaces RGB instead of multiplying
source colors, and preserves loaded texture/vertex alpha and material cutouts.
It retains geometry, skeletons and animation. If a model needs a texture for its
silhouette, load that texture first. Custom shaders require author-owned coloring.
The current interfaces come from `object-color.ts` and the human color methods in
`humanoid-runtime/character.ts`, exposed in Creator's `contracts` section.

## Shared shadow settings

Both world factories accept optional `shadows` overrides; omit them to use the
SDK's [presentation defaults](src/config/presentation.ts). `resolveShadowSettings`
parses configuration and `world.configureShadowLight` applies it to an existing
directional light. The SDK does not create lights or change mesh shadow flags.
`world.shadowSettings` reports resolved configuration, not a GPU measurement.
Use the current [ShadowSettings contract](src/contracts.ts) for parameter details.

## Independent UI, world pixels and model output

Keep HUD, nameplates, menus, crosshairs, prompt inputs and other game UI out of
the Three scene and renderer. Use ordinary HTML/CSS mounted through one
`world.createPresentation()` per world. Actual signs and other objects that
belong to the physical world may remain scene geometry. The SDK manages layer
placement and input routing; you choose the UI layout, styling and behavior.

`presentation.ui.bind` samples authoritative SDK state. Choose `clock:'presented'`
for values aligned with displayed source frames or `clock:'live'` for current state.
Bindings do not own another game state or clock. Update data through its SDK state
handle. UI event handlers
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

For `humanoid.uefn-mannequin`, these Playground fits provide starting references:

| Mounted pose | Cushion geometry | Pelvis above cushion top |
| --- | --- | --- |
| Default `drive` (omit `characterPose`) | Car seat pan, 0.50 m deep | 0.125 m |
| `characterPose: 'ride'` | Motorcycle saddle, 0.42 m wide | 0.165 m |

These clearances depend on the current rig, pose and cushion geometry; they are
not universal defaults or automatic seat fitting. A wider/deeper cushion can
intersect the thighs even when the pelvis clears it. Changed rigs, poses or
sloped seats need their own fit. The [vehicle binding](../creator-host/docs/agent/examples/vehicle.ts)
passes the selected handling configuration to your visual builder. Match the
seat geometry to its pelvis anchor and verify rider contact.

In the existing mounted self-check, inspect the pelvis and upper thighs against
the cushion from the side, and check the seat back, hands, feet and head clearance.
Check first-person visibility as well as enter/exit/reset transitions. First-person
eye position follows the real head bone and its eye offset: correcting the pelvis
also raises the eye. Do not conceal a sunken rider by independently lifting the camera.

<!-- asset-info:creature.horse,humanoid.uefn-mannequin -->
### Imported horse and rider anchors

`HorseVisual` owns the real `creatures/horse.glb` skeleton, cloned clips and
playback resources. Load it with the Host's permitted logical resource resolver:

```ts
import { HorseVisual } from '@worldkit/three';
const horse = new HorseVisual();
await horse.load(resolvePresetResource); // Model textures default off; pass {loadTextures:true} to opt in.
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
body-local translation and rotation, not orbital mechanics.
`space.set-drive-mode` selects `assisted` or `inertial`; `space.dock` sets a
configured `portId` (or `null` to cancel). Both accept an optional `actorId` and
operate on that actor's mounted spacecraft; omission uses the input actor.
They do not transfer input or camera ownership. A docking command sets the intent;
read the vehicle's `spaceFlight.docking.status` to observe actual completion.
 Read the current
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

Read the [vehicle binding](../creator-host/docs/agent/examples/vehicle.ts)
with creator_get_examples({topic:'custom-vehicle',variant:'car'}) or
variant:'motorcycle'. Prepare the vehicle object/spec for your world's vehicles
option; keep the supplied person separate. Mechanical visuals use the display binding
above; HUDs use Presentation DOM and vehicle.recover is the SDK recovery command.

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

## Road vehicle route input

`RoadVehicleRouteController` and `roadVehicleRouteInput` return `WorldInput` for an
existing wheeled vehicle or motorcycle. Pass its logical world position, body rotation,
velocity, and the SDK simulation time; the controller never moves an object, steps
physics or writes the camera. Creator and Episode use this same input calculation.

A target supplies `positionWorldMetersXYZ`, optional `maximumSpeedMetersPerSecond`
(default 4), `arrivalToleranceMeters` (default 1.5), and `stopAtTarget` (default true).
The controller slows for heading error and stopping distance, confirms arrival only
after low-speed dwell, and reports invalid state, clock rollback or lack of progress.
Repeated observations do not advance dwell time. These are input-control defaults in
`src/config/road-vehicle-route.ts`, not changes to vehicle handling calibration.
Hosts sequence targets and bound execution time. Supply paths that fit the vehicle;
there is no path search, obstacle detour or automatic reversing/unsticking.
See [Creator recording](../creator-host/docs/agent/programming.md#record-and-submit)
for the `driveTo` input-plan contract.

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
`creator_get_examples({topic:'character-actions'})` shows action requests on
the existing world. When synchronizing movable visuals, read the current
world.humanoid.simulation.environment after resets and apply propBoxPose to the
corresponding meshes; convert world poses to parent-local space when needed.
Use `world.reset()` for a complete scene reset, including characters and items;
observation callbacks only copy poses and never step or reset physics.

Seat anchors follow the group's pose; moving, tilted or displaced occupied seats cancel
seating. Pickup objects use independent dynamic bodies while unheld, so removing
their table support lets them fall. Their existing rotation lock is retained for
the authored carrying animation. This supports moving and tipping whole props;
it does not implement fracture or a full Chaos vehicle solver.

## Self-drawn fixed-wing aircraft

`humanoid.createAircraftSpec('plane')` returns a fresh model-free light fixed-wing
spec. Read it through the humanoid schema's `aircraftConfigurations.plane`, or use
`creator_get_examples({topic:'custom-vehicle',variant:'plane'})` for its minimal
binding. Author the airframe silhouette and scene from the reference independently
of collision proxies.
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


<!-- topic:boundaries -->
## Playable edges and inaccessible areas

Author visible terrain, composition, landmarks, subjects and counterpart objects from the reference.
Keep collision proxies separate from visible meshes; invisible boundaries create no visible walls.
Author supported, connected playable terrain first. Put invisible fences along
inaccessible scenery and accidental drop-offs, while retaining intended jumps,
gaps, water access and route entrances. `map.bounds` and Episode `worldBounds`
are not a substitute for these colliders or for a real supporting floor.

```ts
import {createWorld, createHumanoidWorld, type BoundaryDefinition} from '@worldkit/three';
const boundaries = [{
  id: 'outer-edge', shape: 'rectangle',
  minimumXZ: playableMinimumXZ, maximumXZ: playableMaximumXZ,
  bottomMeters: fenceBottomMeters, topMeters: fenceTopMeters,
}, {
  id: 'scenery-edge', shape: 'polyline',
  pointsXZ: sceneryBoundaryPointsXZ, closed: false,
  bottomMeters: fenceBottomMeters, topMeters: fenceTopMeters,
}] satisfies BoundaryDefinition[];
// Ordinary SDK: createWorld({scene, camera, boundaries}).
// Humanoid SDK: createHumanoidWorld({scene, camera, map: {...map, boundaries}}).
```

Coordinates and dimensions are in metres; XZ points define wall centre lines.
Rectangle fences close all four sides; polylines remain open unless `closed:true`.
For a closed polyline, omit the repeated first point at the end.
Thickness defaults to 0.5 m, with overlapping segment ends. Set bottom/top for
the actual ground, jump height or flight/water activity; this is a vertical fence,
not a roof, floor or inferred playable polygon. Each boundary has a unique ID.

Both backends use their existing physical world for the fixed collision boxes.
Boundaries have no visual mesh and do not become capture targets. They block
physical movement but default to `blocksCamera:false`; set it true only when
the camera also needs containment. Humanoid traversal must not climb or vault
an invisible boundary. Place NPC routes within reachable regions.

Use `compileBoundaryBoxes(boundaries)` to inspect the exact generated box poses
or draw temporary debug outlines. Remove debug geometry before final captures;
do not register a second set of physical boxes. For Humanoid worlds pass fences
in `map.boundaries`, not in top-level `createWorld` options.

Humanoid worlds can opt into controlled-subject recovery with
`map.recovery = {fallBelowY, checkpoint: {position: safePosition, yaw: safeYaw}}`.
Choose an actual stable, clear ground checkpoint and a threshold above
`map.bounds.min[1]`, below all intended playable terrain. Checkpoint yaw uses
the map's +Z convention. Omit `checkpoint` to use the person's current checkpoint
or the current vehicle's prepared spawn. The recovery checks nearby floor support
and full body/rider/carried-object clearance before moving the same actor.
It clears motion, retains the mounted relationship and leaves world interactions
and task state intact. It does not search the map for a replacement checkpoint.

This recovery supports walking and ground vehicles/mounts; water and air modes
report `UNSUPPORTED_RECOVERY_MODE`. Ordinary `createWorld` has the same physical
fences but no automatic checkpoint recovery. Configure intentional falls and
failure rules for those games through their own supported controller logic.
Read `snapshot().humanoid.recovery` for the latest attempt, status, reason and
sequence number. A continuously invalid state is attempted once, with no hidden
per-frame reset loop. Fix an unsafe checkpoint or edge when recovery is blocked
or repeats; the normal full-world reset remains a separate operation.

Within Creator, test representative edges, joints and entrances with the case's
actual movement modes and speeds. Check jump/sprint or mounted contact, camera
clearance and NPC routing where relevant. A readable overview or a successful
reset does not prove the edge is safe. Keep these checks inside normal authoring
and reuse the original case inputs.

### Camera view selection

`CameraDocument.viewSelection` optionally selects declared views from native state.
`world.setCameraView(id)` holds a manual choice;
`world.resumeCameraViewSelection()` returns to automatic selection.
`world.inspectCamera().viewSelection` reports the source, pending choice and skipped
rules. Selection uses the existing fixed-step controller, never another camera loop.
For preset inheritance, rule fields, supported states and authoring behavior, use the
[production camera guidance](../creator-host/docs/agent/programming.md#defaults-and-custom-views).

### Camera query diagnostics

`world.setCameraCollisionDiagnosticsEnabled(true)` records the shared camera's
existing queries; `world.inspectCamera().collisionQueries` exposes detached,
immutable `fixed` and `presentation` samples. Each sample identifies
its batch sequence, simulation tick and source, with actual sweep endpoints,
radii and returned hit data. Recording is off by default and does not add physics
queries. Input preparation does not run a separate collision prediction batch. Up to 256 probes are retained per batch; `droppedProbes` reports overflow.
Disabling capture clears samples. Check ownership and sample timing before drawing
queries; authored cameras do not run follow collision. These are observations,
not physics colliders or a reason to advance simulation.

`world.onRender(callback)` subscribes to the existing completed-render event and
returns an unsubscribe function. Temporary subject fading, body visibility and
actor presentation have been restored before this callback; the gameplay camera
retains its actual displayed pose. Observers may draw an independent view here,
but must not advance World or take ownership of the gameplay camera. An observer
using committed subjects may differ from the gameplay interpolation by one fixed
tick; a live gameplay monitor should copy the source render pixels instead.

`world.onFrameTiming(callback)` optionally reports CPU update wall time for each
successful realtime frame, with `source: 'realtime'`, `simulationTick`,
`sampledAtMilliseconds` (monotonic performance clock) and `cpuUpdateMilliseconds`.
The update includes all fixed steps in that frame; it excludes presentation,
render submission, GPU work and observer callbacks. Timing runs only while
subscribed; the returned function unsubscribes. Manual stepping and capture emit
no samples. Callback failures are isolated from runtime execution.
