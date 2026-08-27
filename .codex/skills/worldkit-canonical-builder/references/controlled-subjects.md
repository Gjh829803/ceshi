# Controlled Subject and Equipment Decisions

The controlled Subject owns movement, collision, control input, facing, spawn, and camera tracking. Decide equipment by whether it changes those semantics, not by how visually prominent it is.

## Decision table

| Request | Builder action |
|---|---|
| Ordinary person, regardless of clothing, armor, backpack, weapon, or carried appearance | Use `worldkit://subject-definition/humanoid.g-bot@2` only. Do not draw or map appearance-only accessories. Styling adds them later. |
| Equipment that rigidly moves with the person but does not require distinct motion behavior | If its whitebox silhouette is structurally necessary, create one package-local bound Subject containing the humanoid asset and the minimum equipment primitive. The equipment is not a separate Object. |
| Board riding, inertial sliding, wingsuit/glider motion, vehicle, mount, boat, powered flight, underwater, or another custom movement assembly | Create one complete package-local Subject silhouette. Use an exact registered movement closure only when the bundled validator accepts it without reserved relationships; otherwise use the documented ground closure as an explicitly disclosed playable approximation. Do not add an SDK motion basis and do not stop because a same-named preset is absent. |

Appearance-only items never become Prototypes, Objects, Subject visual parts, implementation-map entities, or visual capture groups. This includes clothing, armor appearance, handheld weapons, sheathed weapons, backpacks, and decorative carried props when they do not change movement.

## Bound Subject invariants

For a human-plus-equipment assembly:

1. There is one controlled Subject node and one Subject Definition for the assembly.
2. The humanoid and necessary equipment shape are `visualParts` of that Subject Definition, so they share one runtime transform.
3. There is one collider policy, one motion/control profile set, one spawn Anchor, and one startup-controlled entity.
4. The third-person Camera targets the same Subject ID used by `startup.controlledEntityId`.
5. The primary-subject visual target maps to the one Subject entity ID. Do not map the equipment as a separate Object.
6. The support surface, route width, slope, and clearance are designed for the assembled Subject.

Putting a board beneath a humanoid as an independent Object does not bind it. Matching positions at frame zero is not a valid assembly.

The Subject Definition is the Builder's composition surface. It may contain one
registered rigged asset, primitive parts, or only primitive parts. Use local
transforms to assemble the complete silhouette around one support-centered
origin. Include only the parts that define locomotion, collision, pose, or the
identity silhouette; do not turn final-style ornament into whitebox geometry.

## Valid bound ground proxy

When a bound visual assembly is needed but ordinary ground locomotion is explicitly acceptable, a package-local rigged Subject can combine the G Bot asset with one minimal equipment primitive. The following definition is a valid structural pattern; adjust the equipment ID, size, and local transform from the plan:

```json
{
  "id": "humanoid-board-ground",
  "version": 1,
  "kind": "subject-definition",
  "authoringAvailability": "advanced",
  "category": "custom",
  "bodyTopology": "biped",
  "semanticClassId": "subject.humanoid.board-bound",
  "coordinateConvention": {
    "forwardAxis": "-Z",
    "upAxis": "+Y",
    "metersPerUnit": 1,
    "pivot": "support-center"
  },
  "visualParts": [
    {
      "id": "body.asset",
      "kind": "asset",
      "subjectAssetRef": "worldkit://subject-asset/actor.humanoid.g-bot@2",
      "localTransform": {
        "positionMetersXYZ": [0, 0.08, 0],
        "rotationEulerRadiansXYZ": [0, 3.141592653589793, 0],
        "scaleXYZ": [1, 1, 1]
      },
      "appearance": { "mode": "whitebox-neutral" },
      "semanticTags": ["body", "human"]
    },
    {
      "id": "board",
      "kind": "primitive",
      "shape": { "kind": "box", "sizeMetersXYZ": [0.8, 0.08, 1.8] },
      "localTransform": {
        "positionMetersXYZ": [0, 0.04, 0],
        "rotationEulerRadiansXYZ": [0, 0, 0]
      },
      "colliderContribution": "exclude",
      "semanticTags": ["board", "locomotion-equipment"]
    }
  ],
  "visualBinding": {
    "mode": "rigged",
    "rigProfileRef": "worldkit://rig-profile/biped.mixamo-g-bot@2",
    "animationSetRef": "worldkit://animation-set/humanoid.ground.g-bot@2"
  },
  "sockets": [],
  "mountSlots": [],
  "colliderPolicy": {
    "kind": "profile",
    "colliderProfileRef": "worldkit://collider-profile/humanoid.g-bot-capsule@1"
  },
  "capabilityRefs": ["worldkit://capability/locomotion.ground@1"],
  "profiles": {
    "physicsBodyProfileRef": "worldkit://physics-body-profile/character.capability-medium@1",
    "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1",
    "controlFeelProfileRef": "worldkit://control-feel-profile/humanoid.medium-ground@1",
    "allowedControlFeelProfileRefs": [
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1"
    ],
    "motion": {
      "defaultMotionProfileRef": "worldkit://motion-profile/free-ground.humanoid-medium@1",
      "optionalMotionProfileRefs": ["worldkit://motion-profile/safe-ground@1"],
      "fallbackMotionProfileRef": "worldkit://motion-profile/safe-ground@1"
    },
    "controlProfileRef": "worldkit://control-profile/planar.camera-relative@1",
    "cameraContextProfileRef": "worldkit://camera-context/capability-driven.default@1",
    "mediumProfileRef": "worldkit://medium-profile/ground-air.standard@1",
    "harnessProfileRef": "worldkit://harness-profile/subject.standard@1"
  },
  "relationshipCapabilityRefs": [],
  "actionOrPoseSetRef": "worldkit://animation-set/humanoid.ground.g-bot@2",
  "renderBindingProfileRef": "worldkit://render-binding/subject.standard@1",
  "allowedOverridePaths": [],
  "aiMetadata": {
    "displayName": "Humanoid on board ground proxy",
    "description": "One controlled ground Subject with a rigidly bound board shape.",
    "semanticTags": ["board", "composite", "ground", "human"]
  }
}
```

Reference it as `package://subject-definition/humanoid-board-ground@1`. The board moves with the humanoid and shares its camera/control entity, but this definition still uses ordinary ground locomotion. It does not satisfy a Scene Brief whose explicit movement mode is `陆地滑行`; use it only when the brief permits a ground-walk proxy.

`controlFeelProfileRef` is required by the current main Subject Definition contract. Use the exact registered profile that matches the assembly; do not copy numeric feel parameters into the Subject Definition.

Every package-local Subject Definition must include `allowedOverridePaths`. Use `[]` when the definition does not open first-batch override paths. Paths must be lexicographically sorted and stay inside the first-batch ceiling.

## Unmatched motion-changing assemblies

Do not search for one preset that simultaneously owns appearance and movement. Choose them independently:

1. Build the complete controlled shape from one registered asset plus primitives,
   or from primitives alone.
2. Derive or select one collider around the assembled movement body.
3. Select an exact registered closure only when its complete Definition is accepted by the bundled validator and does not require a reserved relationship.
4. Otherwise keep the complete requested shape and use the valid ground closure shown above as the playable approximation. Record the unsupported requested behavior and implemented behavior in `aiMetadata.description`.
5. Never copy individual capability, motion, control, feel, medium, harness, or camera refs from an unapproved-looking preset. The Agent does not add or modify SDK motion bases.
6. Run the bundled self-check and repair the definition until it compiles.

Never stop merely because the assembled shape has no Registry Subject name.
When no existing closure is exact, use the documented ground approximation,
preserve the requested complete shape and world topology, and describe the
approximation in `aiMetadata.description`; do not omit the outputs. Never select
a closure solely because its resource name resembles the requested vehicle or
equipment; compare its executed support, inertia and controls.
