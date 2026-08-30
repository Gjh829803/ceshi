import type { BlockInstanceV2, BlockWorldManifestV2 } from "./types.js";

function freezeBlockInstance(input: BlockInstanceV2): BlockInstanceV2 {
  return Object.freeze({
    id: input.id,
    presetRef: input.presetRef,
    shape: input.shape,
    positionMetersXYZ: Object.freeze([...input.positionMetersXYZ]) as
      BlockInstanceV2["positionMetersXYZ"],
    rotationQuarterTurnsY: input.rotationQuarterTurnsY,
    ...(input.visualGroupId === undefined ? {} : { visualGroupId: input.visualGroupId }),
    ...(input.interactionInstanceId === undefined
      ? {}
      : { interactionInstanceId: input.interactionInstanceId }),
    ...(input.initialStateId === undefined ? {} : { initialStateId: input.initialStateId }),
  });
}

export function createBlockWorldManifestV2(
  blocks: readonly BlockInstanceV2[],
): BlockWorldManifestV2 {
  return Object.freeze({
    kind: "worldkit-block-world-manifest",
    schemaVersion: 2,
    fullBlockSizeMetersXYZ: Object.freeze([1, 1, 1]) as readonly [1, 1, 1],
    microGridSizeMetersXYZ: Object.freeze([0.5, 0.5, 0.5]) as readonly [0.5, 0.5, 0.5],
    blocks: Object.freeze(
      blocks.map(freezeBlockInstance).sort((left, right) => left.id.localeCompare(right.id)),
    ),
  });
}
