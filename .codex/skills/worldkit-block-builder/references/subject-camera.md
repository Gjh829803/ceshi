# Subject Assembly, Motion, Presentation, and Camera

The module declares exactly one controlled `Subject Assembly`. World blocks,
Subject shapes, movement, animation presentation, and Camera composition are
separate decisions.

## Selection priority

Select for behavior, not likeness:

1. Match the Brief's body topology and select the closest reusable Subject Pack.
2. Select one compatible Motion Pack whose movement mode matches the complete
   controlled assembly.
3. Keep automatic presentation unless the concept explicitly requires a fixed
   posture, such as a standing rider during powered flight.
4. Add only rigid shapes that materially identify the controlled whole or its
   movement. Use a custom Mesh base only when no reusable pack is suitable.
5. Select a Camera Pack and bind its target explicitly.

A coarse registered Subject remains correct when fine appearance belongs to
later visual generation. Do not compose merely because a custom shape could
look more like the reference. Faces, hair, clothes, armor, ordinary handheld
weapons, backpacks, headwear, colors, and material detail do not justify new
Subject shapes. A sword used as the platform of a flying-sword assembly does:
it is a major movement-identifying attachment, not decorative equipment.

## Catalog authority

Read [agent-authoring-catalog.json](agent-authoring-catalog.json). Its four
Agent-facing sections are:

- `subjectPacks`: reusable base Subjects with exact locked Definition refs,
  compatible Motion Pack IDs, fixed-presentation keys, published Sockets,
  traversal envelopes, and visual proxy bounds;
- `motionPacks`: whole-assembly movement choices and their Scene Brief modes;
- `cameraPacks`: Camera composition choices and supported target kinds;
- `customMeshPolicy`: the exact rigid-shape boundary.

Use `selectionPolicy: "default"` normally. Use `explicit-only` only when the
Brief clearly calls for that body/vehicle/composition. Test capsules, Golden
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

The Motion Pack moves the entire assembly. A sword, board, wing, or vehicle
shell never receives its own movement component.

## Camera Packs and target binding

Choose exactly one:

- `third-person.standard`: centered orbit-follow with Spring Arm;
- `third-person.over-shoulder`: closer lateral composition with Spring Arm;
- `third-person.giant`: long-arm, larger collision radius, wide large-scale
  framing with Spring Arm;
- `first-person.standard`: view placed at the resolved target Socket/point.

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
