import { groupBy } from "lodash-es";
import {
  effectiveBabylonNativeBlockSizeMetersXYZV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";

type Vec3 = readonly [number, number, number];

export interface BabylonNativeBlockVisualClusterSourceV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: Vec3;
  readonly rotationQuarterTurnsY: 0 | 1 | 2 | 3;
}

/**
 * Pinned 9e35ab53 clusters.ts expands X, then Z,
 * then Y, starting at the lowest Y/Z/X cell within each center-owned 32m chunk.
 * Native palette/visual identity partitions replace the old visual preset key;
 * this does not infer a physics preset, runtime Entity, Collider or budget cost.
 */
export function createBabylonNativeBlockVisualClustersV1<T extends BabylonNativeBlockVisualClusterSourceV1>(
  blocks: readonly T[],
): readonly Readonly<{
  source: T;
  sourceBlockIds: readonly string[];
  chunkIndexXZ: readonly [number, number];
  minimumMetersXYZ: Vec3;
  maximumMetersXYZ: Vec3;
}>[] {
  const positionKey = (position: Vec3): string =>
    position.map((value) => Math.round(value * 8)).join(",");
  const compare = (left: T, right: T): number =>
    left.centerMetersXYZ[1] - right.centerMetersXYZ[1] ||
    left.centerMetersXYZ[2] - right.centerMetersXYZ[2] ||
    left.centerMetersXYZ[0] - right.centerMetersXYZ[0];
  const groups = groupBy(blocks, (block) => JSON.stringify([
    Math.floor(block.centerMetersXYZ[0] / 32),
    Math.floor(block.centerMetersXYZ[2] / 32),
    block.paletteRole, block.shape,
    effectiveBabylonNativeBlockSizeMetersXYZV1(block.shape, block.rotationQuarterTurnsY),
    block.visualGroupId ?? "",
  ]));
  const output: Array<{
    source: T; sourceBlockIds: readonly string[];
    chunkIndexXZ: readonly [number, number];
    minimumMetersXYZ: Vec3; maximumMetersXYZ: Vec3;
  }> = [];
  for (const key of Object.keys(groups).sort()) {
    const sorted = [...groups[key]!].sort(compare);
    const remaining = new Map(sorted.map((block) =>
      [positionKey(block.centerMetersXYZ), block]));
    // One sort plus a monotonic cursor selects the same minimum as repeatedly
    // sorting the remaining set, without quadratic sparse-scene work.
    for (const source of sorted) {
      if (!remaining.has(positionKey(source.centerMetersXYZ))) continue;
      const size = effectiveBabylonNativeBlockSizeMetersXYZV1(source.shape, source.rotationQuarterTurnsY);
      const at = (x: number, y: number, z: number): Vec3 => [
        source.centerMetersXYZ[0] + x * size[0],
        source.centerMetersXYZ[1] + y * size[1],
        source.centerMetersXYZ[2] + z * size[2],
      ];
      const has = (x: number, y: number, z: number): boolean =>
        remaining.has(positionKey(at(x, y, z)));
      let countX = 1;
      while (has(countX, 0, 0)) countX++;
      let countZ = 1;
      zExpansion: while (true) {
        for (let x = 0; x < countX; x++) if (!has(x, 0, countZ)) break zExpansion;
        countZ++;
      }
      let countY = 1;
      yExpansion: while (true) {
        for (let z = 0; z < countZ; z++) {
          for (let x = 0; x < countX; x++) if (!has(x, countY, z)) break yExpansion;
        }
        countY++;
      }
      const sourceBlockIds: string[] = [];
      for (let y = 0; y < countY; y++) {
        for (let z = 0; z < countZ; z++) {
          for (let x = 0; x < countX; x++) {
            const cell = positionKey(at(x, y, z));
            sourceBlockIds.push(remaining.get(cell)!.id);
            remaining.delete(cell);
          }
        }
      }
      const last = at(countX - 1, countY - 1, countZ - 1);
      output.push(Object.freeze({
        source,
        chunkIndexXZ: Object.freeze([Math.floor(source.centerMetersXYZ[0] / 32),
          Math.floor(source.centerMetersXYZ[2] / 32)] as [number, number]),
        sourceBlockIds: Object.freeze(sourceBlockIds.sort()),
        minimumMetersXYZ: Object.freeze(source.centerMetersXYZ.map((value, axis) =>
          value - size[axis]! / 2) as [number, number, number]),
        maximumMetersXYZ: Object.freeze(last.map((value, axis) =>
          value + size[axis]! / 2) as [number, number, number]),
      }));
    }
  }
  return Object.freeze(output);
}
