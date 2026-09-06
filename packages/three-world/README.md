# Three World SDK 0.2 experimental

Create ordinary Three.js geometry and compose the reference camera freely. Import
`three` and `createWorld` from `@worldkit/three`. The SDK owns one fixed clock,
physics world, controlled character, animation, follow camera and command state.
This is the public v2 API; old engine transports are private.

<!-- topic:getting-started -->
## Start a world

```ts
const world = await createWorld({scene, camera, canvas});
world.addEntity({id:'ground', object:groundMesh, role:'terrain'});
const hero = await world.assets.load('humanoid.g-bot');
world.addCharacter({id:'hero', asset:hero});
world.setControlledEntity('hero');
world.setCameraFollow({distanceMeters:5});
world.setCaptureTargets(['hero','tower']); // register tower first
await world.start();
```

Asset IDs must be selected in project.json. `createWorld` reads the Host-provided
same-origin './asset-definitions.json'. A custom complete character is an ordinary
Group passed as `addCharacter({id,object,body:{heightMeters,radiusMeters}})`.
Its tails, clothes and other visual descendants move with the root; keep their
collisions out of the character body.

An SDK-owned renderer fits its canvas to the stage (fullscreen for a bare canvas) and follows resize events. Pass an existing renderer to keep your own sizing policy.

Terrain/obstacle default to fixed collision; decoration has no collision. Use
kinematic for a moving door/platform, dynamic for supported rigid-body impulses.
Register small visual stones as decoration when they should not impede walking.

The camera remains at the authored first-frame pose until movement or camera
input activates follow. WASD moves, arrows/drag rotate camera, Shift runs,
Space jumps, E interacts, R resets. `setCameraFollow` accepts transitionSeconds,
collisionRadiusMeters, recoveryHalfLifeSeconds and maximumRecoveryMetersPerSecond
(default 3 m/s) when tuning is necessary.
`useAuthoredCamera()` explicitly returns camera control for a cutscene;
`setCameraFollow()` takes it back from the current pose.

`start()` awaits preparation and publishes `window.__WORLDKIT_EVAL__` automatically.
Use `stop()` to pause and `await reset()` to restore the baseline. Do not call the
old expose/render/step methods or create another simulation timer. Query actual
motion/animation through `getEntityState(id)` and camera state through `snapshot()`.

<!-- topic:assets -->
## Verified assets and lifetime

Use Creator assets_search/assets_describe, then select IDs in
`project.json: {schemaVersion:1,assetIds:[...]}`. The compiler copies verified GLBs
and public metadata to the playable. `world.assets.search(query)` describes the
packaged selection; `world.assets.load(assetId)` creates an independent instance.
The SDK initializes available idle pose and owns animation after addCharacter.
No manual AnimationMixer/update(0), hash entry, retargeting or private file path is
needed. An actionId in an asset is an animation, not a physical movement ability.

For asynchronous changes in a running world:

```ts
await world.runTask(async scope => {
  const asset = await scope.assets.load('humanoid.g-bot');
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

<!-- topic:observation -->
## Live observation and capture

SDK `await start()` installs WorldObservation-v2 on the actual scene/camera and
renderer, plus the gallery lifecycle alias. `setCaptureTargets` selects complete
registered objects in priority order. The complete controlled subject is first;
default capture delivers at most five sheets. Repeated objects can select one
complete representative: `{entityId, representative:{kind:"object", object}}` or
`{entityId, representative:{kind:"instance", object:instancedMesh, instanceIndex}}`.
Registration alone does not select an object for capture. Snapshots retain all entities, actual motion/animation,
worldRevision, tick, camera and structured errors; describe is the controller view.

Semantic local front is -Z; frontYawRadians rotates around local +Y. Three views
then apply the object's complete world quaternion, including parent rotation.
Right is front cross up. The Host captures real rendered front/right/back images.
It does not substitute a display clone or fabricate hidden geometry.

Read the real exports from contracts.ts using the Creator schema tool by topic.
Types describe the API; browser validation is still required for first-frame
fidelity, route support, continuous input, physical changes and 3–5 minute play.
