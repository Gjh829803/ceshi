# Controlled Subject and Camera

The Block module declares exactly one controlled Subject. Shape selection and
world blocks are independent decisions.

## Selection priority

Select for behavior, not likeness:

1. Match the Brief's ordered movement-mode set and the necessary body topology.
2. Reuse the closest complete registered Subject that can perform the required modes; the first Brief mode is the startup/default mode.
3. Tune the third-person Camera around that reused Subject.
4. Compose only if the controlled whole itself changes movement and no complete
   registered Subject represents it.

Visual similarity is deliberately low priority in the whitebox. A registered
human remains correct for a knight, astronaut, armed traveler, robed mage, or
backpack wearer when all of them use the same ground-walking control. Do not add
parts for faces, hair, clothes, armor, hand-held or holstered weapons, backpacks,
headwear, colors, or material details. Those belong to later visual generation.

A board, mount, vehicle hull, boat, glider, wing rig, or other component that
changes how the controlled whole moves is different: reuse a matching complete
registered Subject when available; otherwise compose only the major locomotion
masses as one controlled Subject. Do not compose merely because a custom shape
could look more like the reference.

## Registered Subject choices

Read [agent-authoring-catalog.json](agent-authoring-catalog.json). It is generated
by the trusted Host from the real Registry and a real Block compiler admission
probe. Use only an entry in `subjects`, with its exact
`subjectDefinitionRef`, and require every Brief mode to appear in that entry's
`executableMovementModes`. `rejectedSubjects` is diagnostic information, not a
fallback list. Registry presence, a shape-like name, and `advanced` metadata do
not establish Hosted-lane executability.

For an ordinary walking human, the recommended entry remains
`worldkit://subject-definition/humanoid.g-bot@2`. Other body shapes, including
xier120 assets, are valid only for the executable movement modes explicitly
listed on their catalog entry.

The project-owned Golden humanoid is a deterministic SDK rig and animation
fixture. It is not a production visual Subject and must not be used by Hosted
Builder, even though lower-level Registry tests retain it.

The SDK may retain primitive humanoid proxies for Runtime and traversal tests,
but the Host excludes them from `subjects`; they may appear only in
`rejectedSubjects`. Never copy a rejected ref into `controlledSubject`.

Copy the selected entry's complete `traversalEnvelope` object into
`subjectTraversalProfile` without changing a number or boolean. This envelope
is Host-derived from the exact admitted Runtime capsule (`heightMeters`,
`radiusMeters`, and `maxStepHeightMeters`); it is not an Agent estimate and is
not a visual-bounds approximation. Never shrink it to pass a tunnel, bridge,
stair, or connectivity check. For a composed Subject, run self-check and use
the exact expected envelope from
`BLOCK_WORLD_SUBJECT_TRAVERSAL_ENVELOPE_MISMATCH` rather than guessing.

Use the ordinary rigged person for a human unless the Brief explicitly selects
another supported complete Subject whose movement/body topology is a better
match. Do not replace a person with the primitive capsule proxy merely because
it is simpler, and do not replace the registered G Bot with a primitive-built
person merely because the reference has different clothing or equipment.

## Metric scale

One full world block is exactly one meter. The registered G Bot is approximately
1.8 meters tall. An ordinary composed human must be 1.6-2.1 meters tall and
should default to 1.8 meters. Do not scale a person, animal, rider, or vehicle
merely to occupy more of the opening frame; tune Camera distance, height, pitch,
and FOV around the correctly scaled Subject. A giant or human-plus-vehicle body
uses a truthful custom category/topology and must be supported by the Brief.

If no registered Definition represents the required movement-changing
controlled whole, use `kind: "composed"`. The definition may contain registered
asset parts and primitive box/sphere/cylinder/capsule parts, all rigidly owned by
the same controlled Subject. The compiler supplies the implemented movement
closure; scene code does not edit Registry, motion, physics or Runtime files.

Minimal primitive composition:

```ts
controlledSubject: {
  kind: "composed",
  entityId: "fox-player",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
  definition: {
    id: "nine-tail-fox-proxy",
    category: "animal",
    bodyTopology: "quadruped",
    semanticClassId: "subject.animal.nine-tail-fox",
    displayName: "Nine-tail fox whitebox",
    description: "One controlled body with nine rigid tail silhouettes.",
    visualBinding: { kind: "static" },
    visualParts: [
      {
        id: "body-main",
        kind: "primitive",
        shape: { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.5] },
        positionMetersXYZ: [0, 0.35, 0],
        colliderContribution: "include",
        semanticTags: ["body", "quadruped"],
      },
    ],
  },
},
```

Add only the major silhouette parts necessary to understand the locomotion of
the complete Subject. Do not add appearance-only equipment or decorative parts.
At least one included primitive must touch the support-center origin plane.
`colliderContribution: "exclude"` is appropriate for tails, wings, boards and
other visible parts that should not enlarge the ground capsule. A rigged
composition uses exact registered asset, rig, animation-set and collider refs;
never invent a similarly named ref.

## Strict third-person framing

Declare:

```ts
controlledSubject: {
  kind: "registered",
  entityId: "player",
  subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
},
camera: {
  entityId: "camera-main",
  pitchRadians: 0.12,
  distanceMeters: 5,
  targetHeightMeters: 1.25,
  fovDegrees: 56,
  aspectRatio: 16 / 9,
},
```

The camera is always 16:9 and targets the controlled Subject. There is no
shoulder, lateral, or yaw offset. Lay out the intended forward destination along
the Subject's forward axis so the opening is a direct rear view with the Subject
on the exact image centerline. Tune distance, target height, pitch, and FOV to
the selected Subject and requested world context; do not move the Subject away
from center to reveal a landmark.

This Builder Camera is the single Authoring opening rig. Do not copy or invent
Registry Camera Profile refs into `world.mjs`. Runtime selects the actual
opening Profile from the Subject's Camera Context, then projects the four
Builder values (`distanceMeters`, `targetHeightMeters`, `pitchRadians`, and
`fovDegrees` as `baseFovDegrees`) onto that selected third-person Profile. The
same values therefore control both the software review and the real Babylon
opening capture. Explicit Runtime Preview tuning may override them later; a
subsequent context switch to a different Profile keeps that Profile's own
parameters, and context Modifiers such as mounted or sprint framing remain
authoritative over the authored baseline. Self-check rejects values outside any
selectable third-person Profile's safe range.
