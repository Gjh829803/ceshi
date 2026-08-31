# Native Block output contract

This reference is an AI-facing authoring guide. The installed package types and the trusted Host checker remain authoritative.

## Inputs and outputs

Treat the frozen Generation Request, Scene Brief, reference inputs, API/Profile context, and `native-scene.bootstrap.json` as immutable. The Bootstrap owns the seed, bounds, Gameplay Bootstrap ref, controlled Subject, Camera resources, and Spawn Marker identity. Do not duplicate those fields in generated JSON.

Write only:

1. `scene.ts`: the Babylon Native Scene Module.
2. `native-block-authoring.json`: entry-module and semantic visual-group declarations only.
3. `native-resources.json`: optional Native visual Registry refs, sorted lexicographically and unique.

The first representative Case is asset-free, so its `resourceRefs` array is empty.

## Module boundary

Import the closed module definition from `@whitebox-world/native-babylon` and create the Block session with `@whitebox-world/native-babylon-block-profile`. The intended shape is:

```ts
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import {
  createBabylonNativeBlockProfileSessionV1,
} from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "reference-block-world",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 512,
    });

    const ground = session.createBlock({
      id: "entry-ground",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "entry-ground-group",
    });
    ground.position.set(0, -0.5, 0);

    session.finalize({
      displayGapMeters: 0.04,
      staticColliders: [{
        id: "entry-ground-collider",
        blockId: "entry-ground",
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "entry-ground-surface",
          logicalSubshapeId: "entry-ground-top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }],
    });

    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 0],
      facingRadians: 0,
    });
  },
});
```

This is explicit visual construction with explicit visual groups, explicit Spawn registration, and explicit collider contribution. `session.finalize()` registers selected collider candidates through the Host-provided boundary; generated code never creates Havok objects.

## Fixed Block Profile

Use only shapes `full`, `half`, `quarter`, `small`, and `step`. Use only palette roles `ground`, `route`, `structure`, `hazard`, `water-like-visual`, and `background-mass`. Do not scale generated meshes or replace their geometry/material. Position centers on the Profile lattice, use only Y-axis quarter rotations, and use stable lowercase IDs.

Use deterministic seeded construction. Iterate arrays in explicit stable order, sort semantic inventories before emission, and use `context.random` for any allowed variation. Do not call `Math.random`, `Date.now`, timers, locale-sensitive sort, or remote services.

## Volumetric reconstruction

Resolve each major form in three coupled views:

- footprint: occupied XZ area, adjacency, branches, openings;
- longitudinal profile: elevation change along ascent or dominant axis;
- cross-section: width, thickness, support, containment, and clearance.

The representative Case needs a readable central ascent, T-shaped upper platform, gate/building silhouette, blocking side walls, real ground support, and a coherent off-camera continuation. A staircase joins actual lower and upper support levels. A cliff has a rim, face, base, and mass behind the face. A building has depth behind its facade and a doorway that remains a real opening.

## Semantic JSON

`native-block-authoring.json` is plain JSON data. Its exact top-level fields are `kind`, `schemaVersion`, `entryModulePath`, `blockProfileRef`, and `visualGroups`. Every `visualGroups` row has exactly `visualGroupId`, `acceptanceTargetRef`, `semanticClassId`, and `identityColorHex`; rows are sorted by stable unique `visualGroupId`. It names `scene.ts`, the exact Block Profile ref, and the complete semantic visual groups expected by the Case. It contains no Subject, Spawn, Camera, Physics, Runtime, Input, Action, Gameplay, Package, Receipt, or admission state.

`native-resources.json` is plain JSON data with exactly `kind`, `schemaVersion`, and one sorted unique `resourceRefs` array. Every member uses the existing Native Asset Lock visual dialect `worldkit://static-geometry-asset/<name>@<version>`. Subject, Camera, Gameplay, Runtime and other Host-owner refs are forbidden. The model cannot mint locks, publication receipts, or admission evidence.

## Evidence boundary

The Skill self-check is a preflight check, not trusted evidence. Only the Host may typecheck and bundle the module, audit Babylon permissions, allocate isolated replay Candidates, compare deterministic contributions, resolve resources, create WorldPackage/Receipt identity, run SDK-owned Havok and Character control, capture views, or evaluate reconstruction dimensions.
