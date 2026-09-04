import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";
const scene = defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-temple-t-gate-native-block",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 2e3
    });
    for (let zIndex = 0; zIndex < 6; zIndex += 1) {
      const zMeters = 18 + zIndex;
      for (let xIndex = 0; xIndex < 25; xIndex += 1) {
        const xMeters = -12 + xIndex;
        if (xMeters === 0 && zMeters === 18) {
          session.createBlock({
            id: "foreground-spawn-support",
            shape: "full",
            paletteRole: "ground",
            visualGroupId: "foreground-platform-group",
            centerMetersXYZ: [0, -0.5, 18]
          });
        } else if (xMeters === 1 && zMeters === 18) {
          session.createBlock({
            id: "foreground-cliff-approach-support",
            shape: "full",
            paletteRole: "ground",
            visualGroupId: "foreground-platform-group",
            centerMetersXYZ: [1, -0.5, 18]
          });
        } else {
          session.createBlock({
            id: `foreground-platform-x${xIndex}-z${zIndex}`,
            shape: "full",
            paletteRole: "ground",
            visualGroupId: "foreground-platform-group",
            colliderGroupId: "foreground-platform-support-group",
            centerMetersXYZ: [xMeters, -0.5, zMeters]
          });
        }
      }
    }
    session.createBlock({
      id: "foreground-right-cliff-blocker",
      shape: "full",
      paletteRole: "hazard",
      visualGroupId: "mountain-cliff-layers-group",
      centerMetersXYZ: [2, 0.5, 18]
    });
    session.createBlockGrid({
      idPrefix: "central-route-support",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "central-ascent-group",
      colliderGroupId: "central-route-support-group",
      minimumCenterMetersXYZ: [-1, -0.5, -10],
      repeatCountXYZ: [3, 1, 28]
    });
    const ridgeXPositions = [-3, -2, 2, 3];
    for (let zMeters = -9; zMeters <= 14; zMeters += 1) {
      if (zMeters >= -6 && zMeters <= -3) {
        continue;
      }
      let columnHeightBlocks = 1;
      if (zMeters <= 9) columnHeightBlocks = 2;
      if (zMeters <= 4) columnHeightBlocks = 3;
      if (zMeters <= 0) columnHeightBlocks = 4;
      if (zMeters <= -7) columnHeightBlocks = 5;
      for (const xMeters of ridgeXPositions) {
        const sideId = xMeters < 0 ? "left" : "right";
        const laneId = Math.abs(xMeters) === 2 ? "inner" : "outer";
        const isEvidenceStep = xMeters === -2 && zMeters === 6;
        const fullBlockCount = isEvidenceStep ? 1 : columnHeightBlocks;
        for (let levelIndex = 0; levelIndex < fullBlockCount; levelIndex += 1) {
          session.createBlock({
            id: `central-ridge-${sideId}-${laneId}-z${zMeters + 9}-y${levelIndex}`,
            shape: "full",
            paletteRole: "structure",
            visualGroupId: "central-ascent-group",
            centerMetersXYZ: [xMeters, -0.5 + levelIndex, zMeters]
          });
        }
        if (isEvidenceStep) {
          session.createBlock({
            id: "central-step-evidence",
            shape: "step",
            paletteRole: "route",
            visualGroupId: "central-ascent-group",
            centerMetersXYZ: [-2, 0.125, 6]
          });
        } else {
          session.createBlock({
            id: `central-ridge-${sideId}-${laneId}-z${zMeters + 9}-cap`,
            shape: "step",
            paletteRole: "structure",
            visualGroupId: "central-ascent-group",
            centerMetersXYZ: [
              xMeters,
              columnHeightBlocks - 0.875,
              zMeters
            ]
          });
        }
      }
    }
    const gatePillars = [
      ["left-outer", -4],
      ["left-inner", -3],
      ["right-inner", 3],
      ["right-outer", 4]
    ];
    for (const [pillarId, xMeters] of gatePillars) {
      for (let levelIndex = 0; levelIndex < 8; levelIndex += 1) {
        session.createBlock({
          id: `gate-pillar-${pillarId}-y${levelIndex}`,
          shape: "full",
          paletteRole: "structure",
          visualGroupId: "gate-mass-group",
          centerMetersXYZ: [xMeters, -0.5 + levelIndex, -4.5]
        });
      }
    }
    for (let zIndex = 0; zIndex < 2; zIndex += 1) {
      const zMeters = -5 + zIndex;
      for (let xMeters = -6; xMeters <= 6; xMeters += 1) {
        session.createBlock({
          id: `gate-lower-eave-z${zIndex}-x${xMeters + 6}`,
          shape: "half",
          paletteRole: "structure",
          visualGroupId: "gate-mass-group",
          centerMetersXYZ: [xMeters, 7.25, zMeters]
        });
      }
      for (let xMeters = -5; xMeters <= 5; xMeters += 1) {
        session.createBlock({
          id: `gate-middle-eave-z${zIndex}-x${xMeters + 5}`,
          shape: "half",
          paletteRole: "structure",
          visualGroupId: "gate-mass-group",
          centerMetersXYZ: [xMeters, 7.75, zMeters]
        });
      }
      for (let xMeters = -4; xMeters <= 4; xMeters += 1) {
        session.createBlock({
          id: `gate-upper-eave-z${zIndex}-x${xMeters + 4}`,
          shape: "half",
          paletteRole: "structure",
          visualGroupId: "gate-mass-group",
          centerMetersXYZ: [xMeters, 8.25, zMeters]
        });
      }
    }
    for (let xMeters = -3; xMeters <= 3; xMeters += 1) {
      session.createBlock({
        id: `gate-roof-ridge-x${xMeters + 3}`,
        shape: "full",
        paletteRole: "structure",
        visualGroupId: "gate-mass-group",
        centerMetersXYZ: [xMeters, 9, -4.5]
      });
    }
    for (const [finialId, xMeters] of [["left", -5], ["right", 5]]) {
      session.createBlock({
        id: `gate-${finialId}-finial-lower`,
        shape: "full",
        paletteRole: "structure",
        visualGroupId: "gate-mass-group",
        centerMetersXYZ: [xMeters, 8.5, -4.5]
      });
      session.createBlock({
        id: `gate-${finialId}-finial-upper`,
        shape: "half",
        paletteRole: "structure",
        visualGroupId: "gate-mass-group",
        centerMetersXYZ: [xMeters, 9.25, -4.5]
      });
    }
    for (let xMeters = -1; xMeters <= 1; xMeters += 1) {
      session.createBlock({
        id: `upper-t-connector-x${xMeters + 1}`,
        shape: "quarter",
        paletteRole: "route",
        visualGroupId: "upper-t-junction-group",
        colliderGroupId: "upper-route-support-group",
        centerMetersXYZ: [xMeters, -0.25, -10.75],
        rotationQuarterTurnsY: 1
      });
    }
    for (let zIndex = 0; zIndex < 2; zIndex += 1) {
      const zMeters = -12.5 + zIndex;
      for (let xIndex = 0; xIndex < 13; xIndex += 1) {
        const xMeters = -6 + xIndex;
        if (xMeters === -2 && zMeters === -12.5) {
          session.createBlock({
            id: "upper-left-arm-endpoint-support",
            shape: "full",
            paletteRole: "route",
            visualGroupId: "upper-t-junction-group",
            centerMetersXYZ: [-2, -0.5, -12.5]
          });
        } else {
          session.createBlock({
            id: `upper-t-arm-z${zIndex}-x${xIndex}`,
            shape: "full",
            paletteRole: "route",
            visualGroupId: "upper-t-junction-group",
            colliderGroupId: "upper-route-support-group",
            centerMetersXYZ: [xMeters, -0.5, zMeters]
          });
        }
      }
    }
    for (let zIndex = 0; zIndex < 4; zIndex += 1) {
      const zMeters = -16.5 + zIndex;
      for (let xMeters = -1; xMeters <= 1; xMeters += 1) {
        session.createBlock({
          id: `upper-t-stem-z${zIndex}-x${xMeters + 1}`,
          shape: "full",
          paletteRole: "route",
          visualGroupId: "upper-t-junction-group",
          colliderGroupId: "upper-route-support-group",
          centerMetersXYZ: [xMeters, -0.5, zMeters]
        });
      }
    }
    const mountainPeaks = [
      ["left-near", -12, 3, 4, 9],
      ["right-near", 12, 1, 4, 8],
      ["left-rear", -11, -18, 3, 11],
      ["right-rear", 11, -18, 3, 11],
      ["left-remote", -18, -10, 2, 8],
      ["right-remote", 18, -10, 2, 8]
    ];
    for (const [peakId, centerX, centerZ, radiusBlocks, peakHeightBlocks] of mountainPeaks) {
      for (let offsetZ = -radiusBlocks; offsetZ <= radiusBlocks; offsetZ += 1) {
        for (let offsetX = -radiusBlocks; offsetX <= radiusBlocks; offsetX += 1) {
          const distanceBlocks = Math.abs(offsetX) + Math.abs(offsetZ);
          if (distanceBlocks > radiusBlocks) {
            continue;
          }
          const columnHeightBlocks = Math.max(
            1,
            peakHeightBlocks - distanceBlocks * 2
          );
          for (let levelIndex = 0; levelIndex < columnHeightBlocks; levelIndex += 1) {
            session.createBlock({
              id: `mountain-${peakId}-x${offsetX + radiusBlocks}-z${offsetZ + radiusBlocks}-y${levelIndex}`,
              shape: "full",
              paletteRole: "background-mass",
              visualGroupId: "mountain-cliff-layers-group",
              centerMetersXYZ: [
                centerX + offsetX,
                -0.5 + levelIndex,
                centerZ + offsetZ
              ]
            });
          }
        }
      }
    }
    session.finalize({
      displayGapMeters: 0.04,
      staticColliders: [
        {
          id: "collider-central-route-support",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "central-route-support-group"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "central-route-surface",
            logicalSubshapeId: "central-route-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-central-steps",
          colliderGeometrySource: {
            kind: "block",
            blockId: "central-step-evidence"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "central-step-surface",
            logicalSubshapeId: "central-step-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-cliff-approach-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "foreground-cliff-approach-support"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "cliff-approach-surface",
            logicalSubshapeId: "cliff-approach-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-cliff-blockers",
          colliderGeometrySource: {
            kind: "block",
            blockId: "foreground-right-cliff-blocker"
          },
          traversalBinding: { kind: "not-traversable" },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-foreground-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "foreground-spawn-support"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "foreground-spawn-surface",
            logicalSubshapeId: "foreground-spawn-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-foreground-platform-support",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "foreground-platform-support-group"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "foreground-platform-surface",
            logicalSubshapeId: "foreground-platform-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-gate-walls",
          colliderGeometrySource: {
            kind: "block",
            blockId: "gate-pillar-left-inner-y1"
          },
          traversalBinding: { kind: "not-traversable" },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-upper-ground",
          colliderGeometrySource: {
            kind: "block",
            blockId: "upper-left-arm-endpoint-support"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "upper-left-arm-surface",
            logicalSubshapeId: "upper-left-arm-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        },
        {
          id: "collider-upper-route-support",
          colliderGeometrySource: {
            kind: "block-group",
            colliderGroupId: "upper-route-support-group"
          },
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "upper-route-surface",
            logicalSubshapeId: "upper-route-top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1"
          },
          exposedEdgePolicy: "none"
        }
      ]
    });
    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 18],
      facingRadians: 0
    });
  }
});
export {
  scene as default
};
