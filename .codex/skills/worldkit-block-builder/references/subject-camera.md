# Subject Assembly, Motion, Presentation, and Camera

The module declares exactly one controlled `Subject Assembly`. World blocks,
Subject shapes, movement, animation presentation, and Camera composition are
separate decisions.

## Quick start: defaults or explicit composition

Discover the compact model menu without reading the full catalog:

```bash
node --input-type=module -e 'import {listSubjectPacks} from "./.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs"; console.log(JSON.stringify(listSubjectPacks(), null, 2))'
```

Then use `getSubjectPack(id)` for the chosen model's actions, sockets and
defaults, and `listCameraPacks()` for all Camera choices. Legacy primitives are
available via `listSubjectPacks({ includePrimitiveProxies: true })` when wanted.

From `artifacts/scenes/<scene-id>/world.mjs`, import the portable helper:

```js
import { createSubjectSetup, createCameraSetup, getSubjectPack, getCameraPack }
  from "../../../.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs";
```

It runs inside both the hosted Skill workspace and a full SDK checkout. It
expands the generated catalog into ordinary Assembly/Camera fields; geometry
still comes only from your Mesh placements. Use exactly one setup per world.

```js
// In buildBlockWorld(): create the scene and terrain as usual, then return:
return {
  scene,
  world: { id: "my-world", seed: 1 },
  ...createSubjectSetup({ subjectPackId: "humanoid.g-bot" }),
  spawnStandPositionMetersXYZ: [0, 0.5, 0],
  requiredTargets, requiredGroundTraversalBands,
  visualTargetFacings: [], spaceTransitions: [],
};
```

The setup provides `controlledSubject`, `camera`, `subjectTraversalProfile`, and
`requireSingleReachableComponent`. It does not place the ground, spawn, targets,
or traversal bands. Keep those consistent with your world and Brief.

Complete repository examples: `examples/block-world/default-human-world.mjs`,
`stk-kart-world.mjs`, `flying-sword-assembly-world.mjs`,
`seated-flight-assembly-world.mjs`, and `custom-mesh-subject-world.mjs`.

For the delivered kart, use `subjectPackId: "kart-control-lab.stk-kart"`.
Its defaults select `vehicle.stk-kart.arcade` and `third-person.kart-chase`.
For an ordinary human, defaults select ground walking/running/jumping and
`third-person.standard`. Existing static animals keep a rigid ground preview;
they do not acquire animated legs. See each row's `usageNotes`.

Freely override the fields that define the intended concept:

```js
const setup = createSubjectSetup({
  subjectPackId: "humanoid.g-bot",
  assemblyId: "sword-rider",
  attachments: [{ subjectMeshBindingId: "flying-sword" }],
  motionPackId: "flight.powered-standard",
  presentation: { kind: "fixed-action", actionId: "idle" },
  camera: {
    cameraPackId: "third-person.standard",
    target: { kind: "assembly-bounds", heightRatio: 0.65 },
    tuning: { distanceMeters: 6, pitchRadians: 0.18, fovDegrees: 58 },
  },
});
```

Draw and bind `flying-sword` using the Subject Mesh API in `block-api.md`, then
spread `setup` into the world return value. Swap the base for any admitted
animal/vehicle/other pack and choose a compatible movement. Explicit options
win over defaults. With attachments and no explicit Camera target, the helper
uses assembly bounds for third person; first person uses the published eye
Socket. A deliberate target always wins.

## Selection priority

Select for behavior, not likeness:

1. Match the Brief's body topology and select the closest reusable Subject Pack.
2. Select one compatible Motion Pack whose movement mode matches the complete
   controlled assembly.
3. Keep automatic presentation unless the concept explicitly requires a fixed
   posture, such as a standing rider during powered flight.
4. Add rigid shapes that materially identify the controlled whole or its
   movement. Use a custom Mesh base for an explicitly requested bespoke shape
   or when no reusable pack is suitable.
5. Select a Camera Pack and bind its target explicitly.

A coarse registered Subject remains correct when fine appearance belongs to
later visual generation. Do not compose merely because a custom shape could
look more like the reference. Faces, hair, clothes, armor, ordinary handheld
weapons, backpacks, headwear, colors, and material detail do not justify new
Subject shapes. A sword used as the platform of a flying-sword assembly does:
it is a major movement-identifying attachment, not decorative equipment.

## Catalog authority

Read [agent-authoring-catalog.json](agent-authoring-catalog.json). Its
Agent-facing sections are:

- `subjectPacks`: reusable base Subjects with exact locked Definition refs,
  compatible Motion Pack IDs, fixed-presentation keys, published Sockets,
  traversal envelopes, and visual proxy bounds;
- `motionPacks`: whole-assembly movement choices and their Scene Brief modes;
- `cameraPacks`: Camera composition choices and supported target kinds;
- `customMeshPolicy`: the exact rigid-shape boundary.
- `surfacePacks`: normal/ice/mud, with exact semantic presets and visible colors.

Each Subject row also publishes:

- `visualKind`: `rigged-model`, `static-model`, or `primitive-proxy`;
- `recommendedSetup`: default movement, presentation, Camera Pack and target;
- `recommendedMotionPackIds`: normal behavior choices for this asset;
- `compatibleMotionPackIds`: combinations admitted by the compiler, including
  intentionally unusual ones. A human accepting kart motion does not make kart
  handling its recommended default. Use explicit combinations for authored concepts;
- `presentation.actions`: exact action IDs, semantic families, loop modes, and
  automatic gait mappings. An empty list means no skeletal animation;
- `usageNotes`: what the reusable base actually provides.

Use `getSubjectPack(id)` or `getCameraPack(id)` to inspect a private copy of a
row. These functions cannot change the shared Registry. Camera rows include
real defaults, permitted tuning ranges, and `centeredRearCompatible`.

Use `selectionPolicy: "default"` normally. Use `explicit-only` only when the
Brief clearly calls for that body/vehicle/composition or a coarse primitive
proxy. Prefer model packs over `primitive-proxy` entries. Test capsules, Golden
fixtures, and traversal proxies are absent rather than offered as fallbacks.

`subjectTraversalProfile` must equal the selected base pack's complete
`traversalEnvelope`. For a custom Mesh base, run self-check once and copy the
exact expected envelope from
`BLOCK_WORLD_SUBJECT_TRAVERSAL_ENVELOPE_MISMATCH`; never shrink it to pass world
geometry.

## Reusable base plus rigid attachment

This is the normal path for concepts such as a person riding a flying sword:

```js
controlledSubject: {
  kind: "assembly",
  entityId: "player",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
  assembly: {
    id: "flying-sword-rider",
    baseSubject: {
      kind: "subject-pack",
      subjectPackId: "humanoid.g-bot",
    },
    attachments: [{ subjectMeshBindingId: "flying-sword" }],
    motion: { motionPackId: "flight.powered-standard" },
    presentation: {
      kind: "fixed-locomotion",
      presentationKey: "locomotion.idle",
    },
  },
},
```

The base can be any `subjectPacks` entry: a person, animal, vehicle, giant, or
other admitted Subject. Human is not special. The base keeps its own rig and
published actions when it has them. Rigid attachments follow the common Subject
root and never require Agent-authored bone binding. One assembly has one
controller and one Motion Pack.

`presentation.kind: "automatic"` lets committed locomotion choose the base
pack's normal animation. `fixed-locomotion` holds one locomotion presentation
published in the pack's `fixedLocomotionPresentationKeys`. For a static base it
is a safe no-op. Presentation changes visuals only; it never changes movement.

To select a particular registered animation, use:

```js
presentation: { kind: "fixed-action", actionId: "sit.idle" }
```

Choose `actionId` from this base's `presentation.actions`, never a guessed GLB
clip or bone name. Repeat actions loop; once actions play once and hold their
last frame. Fixed playback starts at tick zero, survives movement/gait changes,
and restarts on Reset. Explicit gameplay actions retain priority. `automatic`
restores normal gait-driven visuals; `fixed-locomotion` remains supported for
existing scenes. A static model or custom Mesh has no fixed actions.

Examples on G Bot: `idle` for standing on a flying sword, `sit.idle` for seated
travel, `fly` for a flying pose, `emote.salute` for a one-time salute. These only
select animation: swimming/flying/combat require the corresponding implemented
behavior. Fixed posture does not resize the collider or relocate published
Camera Sockets. For seated/lying poses, deliberately adjust the Camera target
with a local point after inspecting the real preview.

## Custom rigid Mesh base

Draw the shapes through `bindWorldkitSubjectMeshV1(...)`, then reference them:

```js
controlledSubject: {
  kind: "assembly",
  entityId: "player",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
  assembly: {
    id: "custom-mesh-creature",
    baseSubject: {
      kind: "custom-mesh",
      subjectMeshBindingIds: ["custom-body"],
      category: "custom",
      bodyTopology: "custom",
      semanticClassId: "subject.custom.mesh-creature",
      displayName: "Custom mesh creature",
      description: "Rigid Agent-drawn controllable shape without bones.",
    },
    attachments: [{ subjectMeshBindingId: "custom-eye" }],
    motion: { motionPackId: "ground.root-standard" },
    presentation: { kind: "automatic" },
  },
},
```

Custom bases are rigid. They do not expose human actions, skeletons, skins,
morphs, or bone Sockets. At least one base shape must set
`colliderContribution: "include"`; attachments default to `exclude`.

## Motion Packs

- `ground.character-standard`: camera-relative walk/run/jump for reusable
  character-like bases;
- `ground.root-standard`: the same ground controller for an unrigged custom
  root;
- `flight.powered-standard`: forward powered travel, yaw steering, climb via
  jump/boost input, descend via brake input, stable hover, zero gravity
  integration, and ordinary solid collision. It disables ground gait
  capability flags.
- `vehicle.stk-kart.arcade`: delivered STK arcade driving, throttle/steer input,
  braking/reverse, locked drift and release boost. Recommended for the STK kart;
  reusable for explicitly authored rigid vehicle concepts, without implying
  separate wheel/suspension animation.

The two ground packs share the current ground controller; their names distinguish
rigged-character intent from rigid-root intent. No water-surface/swimming or
unpowered-glide Motion Pack is currently published. Do not infer those behaviors
from an asset name such as kayak or glider. A custom rigid base may use the
Motion Packs listed in `customMeshPolicy.compatibleMotionPackIds`.

The Motion Pack moves the entire assembly. A sword, board, wing, or vehicle
shell never receives its own movement component.

## Camera Packs and target binding

Choose exactly one:

- `third-person.standard`: centered orbit-follow with Spring Arm;
- `third-person.over-shoulder`: closer lateral composition with Spring Arm;
- `third-person.giant`: long-arm, larger collision radius, wide large-scale
  framing with Spring Arm;
- `first-person.standard`: view placed at the resolved target Socket/point.
- `third-person.kart-chase`: speed-sensitive vehicle chase with Spring Arm.

All five can be bound to an existing base or custom rigid Mesh. Choose by the
shot, not the base type. The default hosted reference-reconstruction workflow
still requests a centered rear opening; first-person and over-shoulder recipes
are for explicitly authored shots, and do not make the centered-rear workflow
accept a different framing automatically.

```js
// Human eyes: the helper selects the published FirstPersonView Socket.
createSubjectSetup({
  subjectPackId: "humanoid.g-bot",
  camera: { cameraPackId: "first-person.standard" },
});

// Custom Mesh: place the view at the chosen eye/local point, no bones needed.
createCameraSetup({
  cameraPackId: "first-person.standard",
  target: { kind: "subject-local-point", positionMetersXYZ: [0, 0.8, -0.5] },
});
```

For a custom Assembly, use this Camera value with the explicit custom base
example above. `createSubjectSetup` is only the convenience entry for reusable
bases; custom geometry remains fully authored by the Agent.

Targets are explicit:

```js
camera: {
  kind: "pack",
  entityId: "camera-main",
  cameraPackId: "third-person.standard",
  target: {
    kind: "base-subject-socket",
    socketId: "ThirdPersonTarget",
  },
  aspectRatio: 16 / 9,
},
```

Use one target kind:

- `base-subject-socket`: exact Socket listed by the selected Subject Pack;
- `base-subject-bounds`: `heightRatio` from 0 at the base's lower bound to 1 at
  its upper bound, ignoring attachments;
- `assembly-bounds`: the same ratio across base plus attachments;
- `subject-local-point`: explicit `[x,y,z]` meters in the assembly root frame.

Bounds and local-point targets compile into a Host-owned local Camera Socket.
The Agent never binds a bone. Attachments therefore do not unexpectedly move a
base-bound camera unless `assembly-bounds` is chosen deliberately.

Choose the target from the intended visible whole, not by habit. A plain reused
Subject can use its published Socket. For a rider/mount, wide glider, long
vehicle, flying sword, or any asymmetric attachment-heavy assembly, normally
use `assembly-bounds` or a deliberate `subject-local-point` so the Camera follows
the complete silhouette. A base Socket remains valid only when the composition
is intentionally centered on that base, such as a rider-focused shot.

Optional tuning is closed:

```js
tuning: {
  distanceMeters: 6,
  pitchRadians: 0.18,
  fovDegrees: 58,
},
```

Keep `aspectRatio: 16 / 9`. Third-person Camera collision is always the Runtime
hard-collision Spring Arm; there is no subject fade fallback.

## Scale

One full world block is one meter. Keep every reusable pack at Registry scale.
Do not enlarge a person, animal, rider, or vehicle merely to fill the opening
frame; choose/tune the Camera Pack. A true giant uses truthful giant geometry
and `third-person.giant`.
