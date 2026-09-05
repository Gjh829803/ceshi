# Three Creator SDK refactor

Status: implementation contract, not a completion claim. User authorization:
“好的，请你验证这个方案，重构sdk”. Baseline `387a99ad`; original GPT-6 V3
capsule and five case artifacts remain immutable. This decision supersedes D01
and the Native-only authoring restrictions for the new experimental Creator.
It does not change existing production WorldPackage admission or old branches.

## Decision

Use normal Three.js objects and JavaScript/TypeScript with a thin optional SDK.
No second Babylon renderer or physics world. Three is pinned to 0.185.1; the
new physical implementation is Rapier 0.20.0's real character controller,
subject to the executable spike and regression results. Existing GLB bytes and
action metadata are reused directly through Three GLTFLoader/AnimationMixer.
The old Block/Native runtime remains a frozen comparison, not a hidden fallback.

The user may construct their own Scene, Camera, Object3D hierarchy and materials.
`createWorld({scene,camera,canvas,...})` adds entities, physics, input, actions,
observation and capture. Ordinary geometry is not translated into another DSL.
There is no source identifier blacklist for window/timers/standard browser APIs.
Execution is isolated in a browser with no host credentials and same-origin
artifact networking; dependency resolution stays within supplied local modules.

## State ownership

| State | Owner |
| --- | --- |
| Authored geometry, scene graph and material | Three objects created by author |
| Character support and collision | Rapier KCC/World; never an AABB/ray substitute |
| Fixed simulation time and player input edge state | ThreeWorld fixed-step loop |
| Dynamic rigid transforms | Rapier, projected to Three after a step |
| Fixed/kinematic geometry transforms | Registered Three root; synchronized before step |
| Camera | Supplied Three camera; optional SDK follow controller |
| Animation instance state | One Three AnimationMixer per cloned subject |
| Entity identity, commands, revision and errors | ThreeWorld registry |
| Candidate files/episode/evidence/publication | Trusted Creator Host |

Core types are frozen in `packages/three-world/src/contracts.ts`. Root owns
changes to those types. A module lacking a runtime consumer cannot be advertised.

## Supported implementation target

- Arbitrary Three Mesh/Group geometry, whole-object identity and tri-views.
- Terrain/obstacle/decoration/actor roles; declared terrain cannot use no physics.
- Static triangles, kinematic and dynamic bodies, capsule character movement,
  held WASD/arrows/Shift, edge-triggered jump/interaction, pause/reset, diagnostics.
- Supplied Perspective/Orthographic camera and exact initial pose; optional follow
  after first movement, with collision-aware arm adjustment.
- Existing G Bot actions and freely authored Three children/attachments. Asset
  catalog distinguishes diagnostic samples from faithful subject assets.
- Fixed update and interaction hooks; no arbitrary additional engine required.
- Inspectable commands: visibility, transform/scale, spawn/despawn, attachment,
  animation, impulse, actor move/follow/stop. Navigation is collision-aware and
  returns a concrete failure if no route exists; no teleport-to-target success.
- Browser snapshot, actual input recording/replay, capture and reset lifecycle.

All physical operations validate before changing live state; rejected commands
preserve the prior state/revision. Hide/despawn/resize must update collision.
Grouping cannot discard animated children or their capture bounds. Reset restores
the authored initial world, removes later spawns and clears held input/commands.
Shared mesh/material resources cannot be disposed out from under another entity.

Large triangle subdivisions may be derived for stable physics only when they
preserve the exact planar surface. No invisible substitute flat floor is allowed.
The Rapier spike records both poor giant-triangle results and improved subdivided
results; changing engines is not asserted to eliminate every movement problem.

## Creator and experiment

Prebuild Three/SDK dependencies; compile only author modules during iteration.
Separate `worldBuildHash` (actual world sources/runtime/assets) and `episodeHash`
(input/targets). A route edit must not rebuild the renderer. Whole artifact hashes
still bind submission. Compare `three-raw` and `three-sdk` explicitly; never stamp
new evidence as the former `experimental-native` profile.

Both profiles receive the same original image, effective creative request,
GPT-6/xhigh, available raw assets, budget and real browser tools. Raw generation
uses normal HTML/Three without SDK mandates. SDK generation uses the optional
library and actual public examples. A tiny observation handle is common to both;
rendered evidence and real browser events remain Host owned.

External acceptance is derived from frozen original requirements, not a route
list that the author can delete: lighthouse ascent/return, lookout platform
access, connected rice elevations, complete moving fox, palace bridge/palace
route. First-frame layout and preserved gameplay are independently reviewed.
Failing SDK/content tests cannot be repaired by relabeling geometry decoration.

Start with executable SDK regression worlds, then paired raw/SDK cloud pilot on
the forest failure case; expand the same frozen five cases after the tool and
runtime loop is proven. Record per-attempt compiler/preview latency, failures,
visual review, actual controls, exploration and source identity. Original V3
results stay visible. No formal production cutover is implied by experimental QA.

## Verification

Real physics tests cover stairs, slopes, small obstacles, wall sliding, falling,
hold/release/repress jump, five-minute run, moving/hidden/resized/despawned bodies,
reset, two characters and attachments. Browser tests cover real arrows/WASD,
Shift holds, 30/60/120 Hz-like scheduling, camera/orbit, reset during movement,
interaction/update hooks, assets/actions and resource cleanup. Capture comparison
is visual evidence, not inferred from passing hashes. Live prompt-to-video provider
integration is outside this SDK experiment and remains explicitly unclaimed.

Primary implementation references: [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/),
[Three AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer).
Exact Rapier semantics are checked against the installed 0.20.0 source/types;
the generic guide's version label is older.
