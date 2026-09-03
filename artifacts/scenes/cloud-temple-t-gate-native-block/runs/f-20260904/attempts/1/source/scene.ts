import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import {
  createBabylonNativeBlockProfileSessionV1,
} from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-temple-t-gate-native-block",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 2000,
    });

    // Broad entrance shelf. The two front-row singleton blocks are reserved for
    // the Case-owned Spawn and move-right approach collider identities.
    session.createBlockGrid({
      idPrefix: "foreground-left-floor",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [-9, -0.5, 18],
      repeatCountXYZ: [9, 1, 5],
    });
    session.createBlock({
      id: "foreground-spawn-support",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      centerMetersXYZ: [0, -0.5, 18],
    });
    session.createBlock({
      id: "foreground-cliff-approach",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      centerMetersXYZ: [1, -0.5, 18],
    });
    session.createBlockGrid({
      idPrefix: "foreground-center-rear-floor",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [0, -0.5, 19],
      repeatCountXYZ: [2, 1, 4],
    });
    session.createBlockGrid({
      idPrefix: "foreground-right-floor",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [2, -0.5, 18],
      repeatCountXYZ: [8, 1, 5],
    });

    // A three-cell-wide foreground bridge carries the platform silhouette
    // upward in the opening frame while preserving the checked center route.
    session.createBlockGrid({
      idPrefix: "foreground-bridge-left",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [-1, -0.5, 15],
      repeatCountXYZ: [1, 1, 3],
    });
    session.createBlockGrid({
      idPrefix: "foreground-bridge-center",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [0, -0.5, 15],
      repeatCountXYZ: [1, 1, 3],
    });
    session.createBlockGrid({
      idPrefix: "foreground-bridge-right",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "foreground-platform-group",
      colliderGroupId: "foreground-floor-continuation-group",
      minimumCenterMetersXYZ: [1, -0.5, 15],
      repeatCountXYZ: [1, 1, 3],
    });

    // The formal forward sequence follows this supported three-block-wide
    // spine. The marker is the one visible quarter-meter ascent contact.
    session.createBlockGrid({
      idPrefix: "central-corridor-floor",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "central-ascent-group",
      colliderGroupId: "central-corridor-floor-group",
      minimumCenterMetersXYZ: [-1, -0.5, 3],
      repeatCountXYZ: [3, 1, 12],
    });
    session.createBlock({
      id: "central-ascent-step-marker",
      shape: "step",
      paletteRole: "route",
      visualGroupId: "central-ascent-group",
      centerMetersXYZ: [0, 0.125, 15],
    });

    // Paired low ridge shoulders keep the ascent narrow in the opening while
    // retaining structural depth and the unobstructed center course.
    session.createBlockGrid({
      idPrefix: "central-left-shoulder-root",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "central-ascent-group",
      minimumCenterMetersXYZ: [-2, -0.5, 4],
      repeatCountXYZ: [1, 1, 11],
    });
    session.createBlockGrid({
      idPrefix: "central-right-shoulder-root",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "central-ascent-group",
      minimumCenterMetersXYZ: [2, -0.5, 4],
      repeatCountXYZ: [1, 1, 11],
    });
    session.createBlockGrid({
      idPrefix: "central-left-shoulder-tier-one",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "central-ascent-group",
      minimumCenterMetersXYZ: [-2, 0.5, 4],
      repeatCountXYZ: [1, 1, 9],
    });
    session.createBlockGrid({
      idPrefix: "central-right-shoulder-tier-one",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "central-ascent-group",
      minimumCenterMetersXYZ: [2, 0.5, 4],
      repeatCountXYZ: [1, 1, 9],
    });

    // A long summit stem and rear crossbar form the inferred T-junction. Its
    // near edge is z=2.5, conservatively inside the 600-tick walking envelope.
    session.createBlockGrid({
      idPrefix: "upper-summit-stem",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-t-junction-group",
      colliderGroupId: "upper-floor-continuation-group",
      minimumCenterMetersXYZ: [-1, -0.5, -11],
      repeatCountXYZ: [5, 1, 13],
    });
    session.createBlock({
      id: "upper-entry-left",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-t-junction-group",
      colliderGroupId: "upper-floor-continuation-group",
      centerMetersXYZ: [-1, -0.5, 2],
    });
    session.createBlock({
      id: "upper-entry-ground",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-t-junction-group",
      centerMetersXYZ: [0, -0.5, 2],
    });
    session.createBlockGrid({
      idPrefix: "upper-entry-right",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-t-junction-group",
      colliderGroupId: "upper-floor-continuation-group",
      minimumCenterMetersXYZ: [1, -0.5, 2],
      repeatCountXYZ: [3, 1, 1],
    });
    session.createBlockGrid({
      idPrefix: "upper-rear-crossbar",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-t-junction-group",
      colliderGroupId: "upper-floor-continuation-group",
      minimumCenterMetersXYZ: [-3, -0.5, -13],
      repeatCountXYZ: [9, 1, 2],
    });

    // The rightward test receives an uninterrupted two-block floor approach
    // and then the exact one-meter cliff blocker requested by the Case.
    session.createBlock({
      id: "mountain-cliff-right-blocker",
      shape: "full",
      paletteRole: "hazard",
      visualGroupId: "mountain-cliff-layers-group",
      centerMetersXYZ: [2, 0.5, 18],
    });

    // Side walls of the central ridge: supported, terraced cliff cross-sections.
    session.createBlockGrid({
      idPrefix: "mountain-left-entry-ridge-root",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-6, -0.5, 3],
      repeatCountXYZ: [3, 1, 12],
    });
    session.createBlockGrid({
      idPrefix: "mountain-left-entry-ridge-tier-one",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-6, 0.5, 3],
      repeatCountXYZ: [3, 1, 9],
    });
    session.createBlockGrid({
      idPrefix: "mountain-left-entry-ridge-tier-two",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-6, 1.5, 3],
      repeatCountXYZ: [3, 1, 6],
    });
    session.createBlockGrid({
      idPrefix: "mountain-left-entry-ridge-tier-three",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-6, 2.5, 3],
      repeatCountXYZ: [3, 1, 3],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-entry-ridge-root",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [4, -0.5, 3],
      repeatCountXYZ: [3, 1, 12],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-entry-ridge-tier-one",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [4, 0.5, 3],
      repeatCountXYZ: [3, 1, 9],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-entry-ridge-tier-two",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [4, 1.5, 3],
      repeatCountXYZ: [3, 1, 6],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-entry-ridge-tier-three",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [4, 2.5, 3],
      repeatCountXYZ: [3, 1, 3],
    });

    // Left and right dominant pinnacles, each built as nested solid tiers.
    session.createBlockGrid({
      idPrefix: "mountain-left-dominant-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-16, -0.5, -1],
      repeatCountXYZ: [5, 5, 5],
    });
    session.createBlockGrid({
      idPrefix: "mountain-left-dominant-mid",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-15, 4.5, 0],
      repeatCountXYZ: [3, 5, 3],
    });
    session.createBlockGrid({
      idPrefix: "mountain-left-dominant-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-14, 9.5, 0],
      repeatCountXYZ: [1, 5, 2],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-dominant-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [12, -0.5, -4],
      repeatCountXYZ: [5, 5, 5],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-dominant-mid",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [13, 4.5, -3],
      repeatCountXYZ: [3, 6, 3],
    });
    session.createBlockGrid({
      idPrefix: "mountain-right-dominant-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [14, 10.5, -3],
      repeatCountXYZ: [1, 5, 2],
    });

    // Secondary near and remote peak layers complete the surrounding peak field.
    session.createBlockGrid({
      idPrefix: "mountain-mid-left-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-10, -0.5, 6],
      repeatCountXYZ: [4, 4, 4],
    });
    session.createBlockGrid({
      idPrefix: "mountain-mid-left-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-9, 3.5, 7],
      repeatCountXYZ: [2, 4, 2],
    });
    session.createBlockGrid({
      idPrefix: "mountain-mid-right-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [8, -0.5, 5],
      repeatCountXYZ: [3, 5, 4],
    });
    session.createBlockGrid({
      idPrefix: "mountain-mid-right-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [9, 4.5, 6],
      repeatCountXYZ: [1, 5, 2],
    });
    session.createBlockGrid({
      idPrefix: "mountain-remote-left-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-9, -0.5, -13],
      repeatCountXYZ: [4, 4, 4],
    });
    session.createBlockGrid({
      idPrefix: "mountain-remote-left-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-8, 3.5, -12],
      repeatCountXYZ: [2, 5, 2],
    });
    session.createBlockGrid({
      idPrefix: "mountain-remote-right-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [7, -0.5, -14],
      repeatCountXYZ: [3, 5, 4],
    });
    session.createBlockGrid({
      idPrefix: "mountain-remote-right-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [8, 4.5, -13],
      repeatCountXYZ: [1, 6, 2],
    });
    session.createBlockGrid({
      idPrefix: "mountain-far-left-spire-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-19, -0.5, -10],
      repeatCountXYZ: [3, 6, 3],
    });
    session.createBlockGrid({
      idPrefix: "mountain-far-left-spire-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [-18, 5.5, -9],
      repeatCountXYZ: [1, 4, 1],
    });
    session.createBlockGrid({
      idPrefix: "mountain-far-right-spire-base",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [17, -0.5, -10],
      repeatCountXYZ: [3, 6, 3],
    });
    session.createBlockGrid({
      idPrefix: "mountain-far-right-spire-crown",
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "mountain-cliff-layers-group",
      minimumCenterMetersXYZ: [18, 5.5, -9],
      repeatCountXYZ: [1, 4, 1],
    });

    // Two deep piers, an open portal, and two supported roof stages form one
    // complete gate mass above the summit stem.
    session.createBlock({
      id: "gate-left-pillar-base",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      centerMetersXYZ: [-1, 0.5, -5],
    });
    const gatePillars = [
      { idPrefix: "gate-left-front", xMeters: -1, zMeters: -5 },
      { idPrefix: "gate-left-rear", xMeters: -1, zMeters: -4 },
      { idPrefix: "gate-right-front", xMeters: 3, zMeters: -5 },
      { idPrefix: "gate-right-rear", xMeters: 3, zMeters: -4 },
    ] as const;
    for (const pillar of gatePillars) {
      for (let level = 0; level < 8; level += 1) {
        if (pillar.idPrefix === "gate-left-front" && level === 0) {
          continue;
        }
        session.createBlock({
          id: `${pillar.idPrefix}-level-${level}`,
          shape: "full",
          paletteRole: "structure",
          visualGroupId: "gate-mass-group",
          centerMetersXYZ: [pillar.xMeters, 0.5 + level, pillar.zMeters],
        });
      }
    }
    session.createBlockGrid({
      idPrefix: "gate-main-beam",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-2, 8.5, -5],
      repeatCountXYZ: [7, 1, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-lower-eave",
      shape: "half",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-2, 9.25, -5],
      repeatCountXYZ: [7, 1, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-lower-roof",
      shape: "half",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-1, 9.75, -5],
      repeatCountXYZ: [5, 1, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-upper-post-left",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [0, 10.5, -5],
      repeatCountXYZ: [1, 2, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-upper-post-right",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [2, 10.5, -5],
      repeatCountXYZ: [1, 2, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-upper-beam",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-1, 12.5, -5],
      repeatCountXYZ: [5, 1, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-upper-eave",
      shape: "half",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-2, 13.25, -5],
      repeatCountXYZ: [7, 1, 2],
    });
    session.createBlockGrid({
      idPrefix: "gate-upper-roof",
      shape: "half",
      paletteRole: "structure",
      visualGroupId: "gate-mass-group",
      minimumCenterMetersXYZ: [-1, 13.75, -5],
      repeatCountXYZ: [5, 1, 2],
    });

    session.finalize({
      displayGapMeters: 0.04,
      staticColliders: [
        {
          id: "collider-central-steps",
          colliderGeometrySource: {
            kind: "block",
            blockId: "central-ascent-step-marker",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "central-ascent-step-surface",
            logicalSubshapeId: "central-ascent-step-top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-cliff-approach-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "foreground-cliff-approach",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "foreground-cliff-approach-surface",
            logicalSubshapeId: "foreground-cliff-approach-top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-cliff-blockers",
          colliderGeometrySource: {
            kind: "block",
            blockId: "mountain-cliff-right-blocker",
          },
          traversalBinding: { kind: "not-traversable" },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-foreground-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "foreground-spawn-support",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "foreground-spawn-surface",
            logicalSubshapeId: "foreground-spawn-top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-gate-walls",
          colliderGeometrySource: {
            kind: "block",
            blockId: "gate-left-pillar-base",
          },
          traversalBinding: { kind: "not-traversable" },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-upper-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "upper-entry-ground",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "upper-entry-surface",
            logicalSubshapeId: "upper-entry-top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-foreground-floor-continuation",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "foreground-floor-continuation-group",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "foreground-platform-surface",
            logicalSubshapeId: "foreground-platform-floor",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-central-corridor-ground",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "central-corridor-floor-group",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "central-corridor-surface",
            logicalSubshapeId: "central-corridor-floor",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
        {
          id: "collider-upper-floor-continuation",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "upper-floor-continuation-group",
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "upper-platform-surface",
            logicalSubshapeId: "upper-platform-floor",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
        },
      ],
    });

    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 18],
      facingRadians: 0,
    });
  },
});
