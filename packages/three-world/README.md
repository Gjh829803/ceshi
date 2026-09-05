# @worldkit/three — experimental Creator SDK

Author normal Three.js meshes, groups, geometry, materials and cameras. Register
only the objects that need stable world identity, physics, interaction or runtime
control. Three.js 0.185.1 renders the same scene that the tools inspect. Rapier
0.20.0 owns collision and character support; Recast 0.43.1 supplies ground routes.
This package is experimental and is separate from the existing Native pipeline.

## Start a world

```ts
import * as THREE from 'three';
import { createWorld, loadAsset } from '@worldkit/three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 1000);
// Choose the actual reference composition here, including an off-center subject.
camera.position.set(7, 5, 10);
camera.lookAt(0, 1, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const world = await createWorld({ scene, camera, renderer });

const ground = new THREE.Mesh(new THREE.BoxGeometry(80, .5, 80),
  new THREE.MeshStandardMaterial({ color: '#729456' }));
ground.position.y = -.25;
world.addEntity({ id: 'ground', object: ground, role: 'terrain' });
// Add ordinary light, landmarks and a complete actor, then:
// world.addCharacter({id:'hero',object:hero,character:{heightMeters:1.8,radiusMeters:.35}});
// world.setControlledEntity('hero');
// world.setCameraFollow({distanceMeters:5,pitchRadians:.3,activateOnInput:true});
// world.expose({targetEntityIds:['hero','lighthouse','bridge']});
// world.render(); world.start();
```

`createWorld` is async and initially stopped. Finish async asset loading and world
construction before the first `start`, `step` or `advance`: that first call seals
the reset baseline. `scene`, `camera`, `renderer` are optional; a `canvas` creates
an SDK-owned renderer. `navigation:false` explicitly disables NPC routing.
`fixedTimeStepSeconds` defaults to 1/60. `physics` accepts the `PhysicsOptions`
contract returned by the schema tool. Never start a second physics clock.

## Register geometry and actors

- `world.addEntity(options: EntityOptions): THREE.Object3D` registers a unique ID
  and object. IDs may contain spaces or Unicode. Terrain/obstacles default to
  fixed collision; decorations default to no collision. Small pebbles, grass and
  surface detail should be decorations when they are not intended obstacles.
  A terrain entity cannot opt out of collision.
- `world.addCharacter(options: CharacterEntityOptions): THREE.Object3D` registers
  a complete actor with a Rapier capsule. Its origin is at the feet, Y is up and
  local -Z is the default front. The defaults are 1.8m height, .35m radius,
  2.4m/s walk, 4.8m/s run, .3m maximum step and 45° maximum slope. Choose dimensions
  fitting the visible actor; hiding oversized collision does not solve a route.
- `world.setControlledEntity(id)` assigns keyboard movement to one character.
  WASD and arrows move relative to the camera, Shift stays held to run, Space is
  an edge-triggered jump, E interacts within 3m and R resets. Blur clears input.
- Fixed/kinematic collision extracts actual Mesh/Group/InstancedMesh geometry.
  Dynamic bodies use an explicit convex-hull or box shape; dynamic triangle meshes
  are unsupported. Animated skinned subjects use character capsules, not bind-pose
  rigid meshes. Invalid transforms and excessive budgets produce diagnostics.
- Each independently registered descendant is a collision boundary. A registered
  decorative hat or tail stays attached visually without becoming parent collision.
  Unregistered meshes inside a physical group contribute to that group's shape.
- Normal Three transforms and buffer edits are supported. Mark changed vertex or
  instance buffers `needsUpdate=true`, as in Three. World commands synchronously
  refresh affected collision; direct edits are consumed at the next physics tick.
  Character roots require a valid upright capsule transform; unsupported scaling
  is rejected. Keep decorative sway on children instead of tilting a character body.
- `frontYawRadians` specifies local semantic front by rotating -Z around +Y.
  Movement facing and front/right/back capture respect it and parent rotation.
  Group an entire fox with its tails under its actor root; capture that complete
  root, not a detached body or individual tail.

## Reuse animation assets

Select exact IDs with `assets_search`, write them to `project.json`, then load the
Host-produced definitions. The catalog labels reusable and diagnostic assets;
the multi-animal quadruped fixture is a diagnostic sample, not a finished fox.

```ts
const { assets } = await fetch('./asset-definitions.json').then(r => r.json());
const definition = assets.find((item: {id:string}) => item.id === 'YOUR_EXACT_ASSET_ID');
if (!definition) throw new Error('Selected asset missing');
const instance = await loadAsset(definition);
if (definition.actions.idle) { instance.play('idle'); instance.update(0); } // Evaluate the chosen opening pose.
instance.object.position.set(0, .05, 0);
world.addCharacter({id:'hero',object:instance.object,asset:instance,
  character:{heightMeters:1.8,radiusMeters:.35}});
```

Definitions pin original GLB SHA256, byte length, normalization and exact action
names. Do not reapply internal skeleton/unit corrections. Each load has its own
skeleton, mixer and materials. SDK-owned actor instances automatically select
available idle/walk/run/jump/fall actions and advance once per fixed tick.
`entity.play-action` explicitly takes over the action until reset; action IDs are
listed in `capabilities()`. For a custom non-actor animated decoration, register
an `onUpdate` callback for its mixer and `onDispose` for its asset instance.

## Gameplay and runtime control

`world.onUpdate(({world,deltaSeconds,simulationTick}) => { ... })` runs synchronous
author gameplay before each physics step; returned promises are rejected. Use it
for doors, rigid moving platforms, procedural tails, environment and game rules.
`world.onInteract(entityId, ({world,entityId,actorEntityId}) => { ... })` registers
an interaction; `world.interact(entityId)` triggers the same hook explicitly.
Both return an unsubscribe function. `onReset` restores custom counters and child
animations; `onDispose` releases authored resources. World reset restores registered
objects and the camera, not arbitrary variables or unregistered child transforms.

`world.getObject(id)` returns the actual Three object. `world.snapshot()` reports
current entities, positions, actions, collision contacts, ticks and errors;
`world.inspect()` adds physics counts, input transcript, prototypes and capabilities.
`world.capabilities()` lists supported commands/action IDs per entity. A small LLM
should select IDs from this list and emit one typed `WorldCommand`; do not eval
model-written JavaScript during play.

```ts
world.execute({type:'entity.set-visible',entityId:'dragon',visible:false});
world.execute({type:'entity.set-scale',entityId:'dragon',scaleXYZ:[2,2,2]});
world.execute({type:'actor.move-to',entityId:'guide',targetPositionMetersXYZ:[8,0,-5],run:true});
world.execute({type:'actor.follow',entityId:'guide',targetEntityId:'hero',distanceMeters:2});
world.execute({type:'actor.stop',entityId:'guide'});
world.execute({type:'entity.attach',childEntityId:'lantern',parentEntityId:'hero',positionMetersXYZ:[.4,1,0]});
```

Position commands and spawn use world coordinates; attachment position is local
to the new parent. Scale is local scale. Commands are closed discriminated unions
in the schema. They return `{status:'applied'|'rejected',revision,error?}`; callers
must handle rejection. The controlled character remains owned by user input.
Ground NPC movement uses a complete Recast path plus real capsule movement;
no-path and stuck states report errors. Flight, swimming and crowd avoidance are
not supplied. Author these as explicit gameplay capabilities when required.

`world.registerPrototype(prototypeId, () => EntityOptions | CharacterEntityOptions)`
registers a synchronous factory returning a **new** object per spawn. The command
`entity.spawn` supplies prototypeId/entityId/positionMetersXYZ; the command ID
replaces the factory's template ID. Include a `character:{...}` property to spawn
a character. Prepare async assets beforehand. `entity.despawn` removes an entity
and its registered descendants; the player and its ancestors cannot despawn.
Scene-dependent commands can invalidate routes; test geometry changes around
occupied paths instead of assuming that every prompt is physically achievable.

## Camera, lifecycle and ownership

`setCameraFollow({targetEntityId?,distanceMeters?,pitchRadians?,targetHeightMeters?,
activateOnInput?})` is optional. Its default activates only when movement or orbit
input begins, preserving the opening camera. Drag or scroll adjusts orbit/distance;
camera obstruction uses actual visible geometry. Supply your own camera and omit
follow if gameplay needs another camera behavior.

`start/stop/reset/render/resize(width,height)/dispose` manage the world lifecycle.
`step(input?,ticks=1)` and `advance(deltaSeconds,input?)` are deterministic headless
helpers, not substitutes for the browser playtest. `expose({targetEntityIds?})`
installs the shared live observation/execute API used by tools and the evaluator.
Targets are complete registered groups and always include the controlled actor.

World owns its keyboard/pointer listeners, Rapier/Recast resources and asset
instances passed to addCharacter. It disposes a renderer only when it created it.
Authored geometry, materials, custom mixers and a supplied renderer remain author
owned: use `onDispose` to release them, especially for repeated world mounting.
Despawn retains registered baseline resources for reset until world disposal.
Reset restores original registrations, parent relationships, TRS/manual matrices,
visibility, controlled actor and full camera projection. User-authored lifecycle
hooks remain responsible for custom gameplay state.

## Verification

Use `world_preview` for actual opening and full-target views, short
`world_playtest` episodes while iterating, then a real 180–300s episode. Inspect
heights, route results, original errors and captured images. Compilation, duration
or a passing route alone does not prove reference fidelity or interesting play.
The cloud comparison measures the whole auxiliary SDK workflow against raw Three;
it does not isolate API shape from the benefits of prewritten physics/navigation.
