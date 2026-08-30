import { groupBy } from "lodash-es";

import {
  blockWorldChunkClusterEntityIdV2,
  blockWorldChunkCoordinateV2,
  effectiveBlockSizeMetersXYZV2,
  resolveBlockPresetV1,
  type BlockInstanceV2,
  type BlockPositionMetersXYZV2,
  type BlockShapeKindV2,
} from "@whitebox-world/block-world";

export interface BlockWorldRuntimeClusterV2 {
  readonly entityId: string;
  readonly chunkCoordinateXZ: readonly [number, number];
  readonly presetRef: string;
  readonly shape: BlockShapeKindV2;
  readonly baseSizeMetersXYZ: readonly [number, number, number];
  readonly repeatCountXYZ: readonly [number, number, number];
  readonly visualGroupId?: string;
  readonly interactionInstanceId?: string;
  readonly initialStateId?: string;
  readonly sourceBlockIds: readonly string[];
  readonly minimumPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly maximumPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly centerMetersXYZ: BlockPositionMetersXYZV2;
  readonly sizeMetersXYZ: readonly [number, number, number];
}

function positionKey(position: BlockPositionMetersXYZV2): string {
  return position.map((value) => Math.round(value * 4)).join(",");
}

function comparePositions(
  left: BlockPositionMetersXYZV2,
  right: BlockPositionMetersXYZV2,
): number {
  return left[1] - right[1] || left[2] - right[2] || left[0] - right[0];
}

function shifted(
  position: BlockPositionMetersXYZV2,
  axis: 0 | 1 | 2,
  amount: number,
): BlockPositionMetersXYZV2 {
  const output = [...position] as [number, number, number];
  output[axis] += amount;
  return output;
}

function sourceGroupingKey(block: BlockInstanceV2): string {
  const coordinate = blockWorldChunkCoordinateV2(block.positionMetersXYZ);
  const preset = resolveBlockPresetV1(block.presetRef);
  const independentlyAddressable = block.interactionInstanceId !== undefined ||
    block.initialStateId !== undefined || preset?.interactionMode !== "none";
  return JSON.stringify([
    coordinate.chunkX,
    coordinate.chunkZ,
    block.presetRef,
    block.shape,
    effectiveBlockSizeMetersXYZV2(block.shape, block.rotationQuarterTurnsY),
    block.visualGroupId ?? "",
    independentlyAddressable ? block.id : "",
  ]);
}

function clusterGroup(blocks: readonly BlockInstanceV2[]): Array<Omit<
  BlockWorldRuntimeClusterV2,
  "entityId"
>> {
  const remaining = new Map(blocks.map((block) => [positionKey(block.positionMetersXYZ), block]));
  const output: Array<Omit<BlockWorldRuntimeClusterV2, "entityId">> = [];
  while (remaining.size > 0) {
    const source = [...remaining.values()].sort((left, right) =>
      comparePositions(left.positionMetersXYZ, right.positionMetersXYZ))[0]!;
    const start = source.positionMetersXYZ;
    const baseSize = effectiveBlockSizeMetersXYZV2(
      source.shape,
      source.rotationQuarterTurnsY,
    );
    let countX = 1;
    while (remaining.has(positionKey(shifted(start, 0, countX * baseSize[0])))) countX += 1;
    let countZ = 1;
    zExpansion: while (true) {
      for (let x = 0; x < countX; x += 1) {
        const candidate = shifted(shifted(start, 0, x * baseSize[0]), 2, countZ * baseSize[2]);
        if (!remaining.has(positionKey(candidate))) break zExpansion;
      }
      countZ += 1;
    }
    let countY = 1;
    yExpansion: while (true) {
      for (let z = 0; z < countZ; z += 1) {
        for (let x = 0; x < countX; x += 1) {
          const candidate = shifted(
            shifted(shifted(start, 0, x * baseSize[0]), 2, z * baseSize[2]),
            1,
            countY * baseSize[1],
          );
          if (!remaining.has(positionKey(candidate))) break yExpansion;
        }
      }
      countY += 1;
    }
    const sourceBlocks: BlockInstanceV2[] = [];
    for (let y = 0; y < countY; y += 1) {
      for (let z = 0; z < countZ; z += 1) {
        for (let x = 0; x < countX; x += 1) {
          const position = shifted(
            shifted(shifted(start, 0, x * baseSize[0]), 2, z * baseSize[2]),
            1,
            y * baseSize[1],
          );
          const key = positionKey(position);
          const block = remaining.get(key);
          if (block === undefined) throw new Error("BLOCK_WORLD_CLUSTER_INTERNAL_OCCUPANCY_MISMATCH");
          sourceBlocks.push(block);
          remaining.delete(key);
        }
      }
    }
    const maximum = Object.freeze([
      start[0] + (countX - 1) * baseSize[0],
      start[1] + (countY - 1) * baseSize[1],
      start[2] + (countZ - 1) * baseSize[2],
    ]) as BlockPositionMetersXYZV2;
    const coordinate = blockWorldChunkCoordinateV2(start);
    output.push(Object.freeze({
      chunkCoordinateXZ: Object.freeze([
        coordinate.chunkX,
        coordinate.chunkZ,
      ]) as readonly [number, number],
      presetRef: source.presetRef,
      shape: source.shape,
      baseSizeMetersXYZ: Object.freeze([...baseSize]) as readonly [number, number, number],
      repeatCountXYZ: Object.freeze([countX, countY, countZ]) as
        readonly [number, number, number],
      ...(source.visualGroupId === undefined ? {} : { visualGroupId: source.visualGroupId }),
      ...(source.interactionInstanceId === undefined
        ? {}
        : { interactionInstanceId: source.interactionInstanceId }),
      ...(source.initialStateId === undefined
        ? {}
        : { initialStateId: source.initialStateId }),
      sourceBlockIds: Object.freeze(sourceBlocks.map(({ id }) => id).sort()),
      minimumPositionMetersXYZ: Object.freeze([...start]) as BlockPositionMetersXYZV2,
      maximumPositionMetersXYZ: maximum,
      centerMetersXYZ: Object.freeze([
        (start[0] + maximum[0]) / 2,
        (start[1] + maximum[1]) / 2,
        (start[2] + maximum[2]) / 2,
      ]) as BlockPositionMetersXYZV2,
      sizeMetersXYZ: Object.freeze([
        countX * baseSize[0],
        countY * baseSize[1],
        countZ * baseSize[2],
      ]) as readonly [number, number, number],
    }));
  }
  return output;
}

export function createBlockWorldRuntimeClustersV2(
  blocks: readonly BlockInstanceV2[],
): readonly BlockWorldRuntimeClusterV2[] {
  const grouped = groupBy(blocks, sourceGroupingKey);
  const withoutIds = Object.keys(grouped).sort().flatMap((key) =>
    clusterGroup(grouped[key] ?? []));
  const sorted = withoutIds.sort((left, right) =>
    left.chunkCoordinateXZ[0] - right.chunkCoordinateXZ[0] ||
    left.chunkCoordinateXZ[1] - right.chunkCoordinateXZ[1] ||
    left.presetRef.localeCompare(right.presetRef) ||
    left.shape.localeCompare(right.shape) ||
    (left.visualGroupId ?? "").localeCompare(right.visualGroupId ?? "") ||
    (left.interactionInstanceId ?? "").localeCompare(
      right.interactionInstanceId ?? "",
    ) ||
    (left.initialStateId ?? "").localeCompare(right.initialStateId ?? "") ||
    comparePositions(left.minimumPositionMetersXYZ, right.minimumPositionMetersXYZ));
  const indexByChunk = new Map<string, number>();
  return Object.freeze(sorted.map((cluster) => {
    const key = `${cluster.chunkCoordinateXZ[0]},${cluster.chunkCoordinateXZ[1]}`;
    const index = indexByChunk.get(key) ?? 0;
    indexByChunk.set(key, index + 1);
    return Object.freeze({
      entityId: blockWorldChunkClusterEntityIdV2({
        chunkX: cluster.chunkCoordinateXZ[0],
        chunkZ: cluster.chunkCoordinateXZ[1],
      }, index),
      ...cluster,
    });
  }));
}
