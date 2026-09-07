import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1, type BabylonNativeBlockFinalizedEpochV1 } from
  "@whitebox-world/native-babylon-block-profile";

export const NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS = [2_000, 8_000, 16_000] as const;

export function budgetWorkloadDimensions(blockCount: number) {
  if (!NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS.some((count) => count === blockCount)) {
    throw new RangeError("Unsupported Native budget measurement size");
  }
  const width = blockCount === 2_000 ? 20 : blockCount === 8_000 ? 40 : 80;
  const depth = blockCount === 2_000 ? 40 : 80;
  return { width, depth, floorBlockCount: width * depth * 2,
    landmarkBlockCount: width * depth / 2 };
}

/** Synthetic load, never a reconstruction Case or alternate scene authoring format. */
export function createBudgetWorkloadModule(
  blockCount: number,
  onFinalized?: (epoch: BabylonNativeBlockFinalizedEpochV1) => void,
) {
  const { width, depth } = budgetWorkloadDimensions(blockCount);
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context) {
      const session = createBabylonNativeBlockProfileSessionV1(context);
      session.createBlockGrid({
        idPrefix: "floor", shape: "full", paletteRole: "ground",
        visualGroupId: "floor", colliderGroupId: "floor",
        minimumCenterMetersXYZ: [-width / 2, -1.5, -depth + 8],
        repeatCountXYZ: [width, 2, depth],
      });
      for (let index = 0; index < 4; index += 1) {
        const group = `landmark-${index}`;
        const x = index % 2 === 0 ? -width / 2 + 2 : width / 4 - 2;
        const z = index < 2 ? -depth + 10 : -depth / 4;
        for (const [level, shape, centerY] of [
          [0, "full", 0.5], [1, "half", 1.25],
        ] as const) {
          session.createBlockGrid({
            idPrefix: `${group}-${level}`, shape,
            paletteRole: index % 2 === 0 ? "structure" : "background-mass",
            visualGroupId: group, colliderGroupId: group,
            minimumCenterMetersXYZ: [x, centerY, z],
            repeatCountXYZ: [width / 4, 1, depth / 4],
          });
        }
      }
      const epoch = session.finalize({
        staticColliders: [{
          id: "ground", colliderGeometrySource: {
            kind: "block-group", colliderGroupId: "floor",
          },
          traversalBinding: {
            kind: "static-surface", surfaceEntityId: "ground-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1",
          },
          // This performance fixture intentionally has open edges. It does not
          // establish production edge-protection/ground-connectivity acceptance.
          exposedEdgePolicy: "none",
        }, ...[0, 2].map((index) => ({
          id: `solid-${index}`, colliderGeometrySource: {
            kind: "block-group" as const, colliderGroupId: `landmark-${index}`,
          },
          traversalBinding: { kind: "not-traversable" as const },
          exposedEdgePolicy: "none" as const,
        }))],
      });
      onFinalized?.(epoch);
      context.registration.registerSpawnMarker({
        id: context.bootstrap.spawnMarkerId,
        positionMetersXYZ: [0, 0, 0], facingRadians: 0,
      });
    },
  });
}
