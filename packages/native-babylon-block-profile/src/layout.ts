import type { Scene } from "@babylonjs/core/scene.js";
import { isNil, min } from "lodash-es";

import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import {
  BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1,
  babylonNativeBlockBoundsFromCenterV1,
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
  effectiveBabylonNativeBlockSizeMetersXYZV1,
  type BabylonNativeBlockBoundsMetersV1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockRotationQuarterTurnsYV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";

export type BabylonNativeBlockLayoutIssueCodeV1 =
  | "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED"
  | "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID"
  | "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH"
  | "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID"
  | "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID"
  | "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP";

export interface BabylonNativeBlockLayoutIssueV1 {
  readonly code: BabylonNativeBlockLayoutIssueCodeV1;
  readonly blockId: string;
  readonly relatedBlockId?: string;
  readonly microCellKeys?: readonly string[];
}

export interface BabylonNativeBlockLayoutEntryV1
  extends BabylonNativeBlockBoundsMetersV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly sizeMetersXYZ: readonly [number, number, number];
  readonly occupiedMicroCellKeys: readonly string[];
}

export interface BabylonNativeBlockLayoutV1 {
  readonly blocks: readonly BabylonNativeBlockLayoutEntryV1[];
  readonly issues: readonly BabylonNativeBlockLayoutIssueV1[];
  readonly exposedTopSurfaceCellKeys: readonly string[];
  readonly boundarySegmentKeys: readonly string[];
  readonly structuralStepTransitionKeys: readonly string[];
  readonly unsupportedBlockIds: readonly string[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parsedCellKey(key: string): readonly [number, number, number] {
  const values = key.split(",").map(Number);
  return [values[0]!, values[1]!, values[2]!];
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function deriveEntry(
  record: BabylonNativeBlockSessionRecordV1,
): Readonly<{ entry?: BabylonNativeBlockLayoutEntryV1; issue?: BabylonNativeBlockLayoutIssueV1 }> {
  const input = record.input;
  const rotationQuarterTurnsY = input.rotationQuarterTurnsY ?? 0;
  const placement = { shape: input.shape, centerMetersXYZ: input.centerMetersXYZ, rotationQuarterTurnsY };
  if (![0, 1, 2, 3].includes(rotationQuarterTurnsY) ||
      !babylonNativeBlockCenterAlignsToGridV1(placement)) {
    return Object.freeze({ issue: Object.freeze({
      code: "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID", blockId: input.id,
    }) });
  }
  const bounds = babylonNativeBlockBoundsFromCenterV1(placement);
  return Object.freeze({ entry: Object.freeze({
    ...input,
    centerMetersXYZ: Object.freeze([...input.centerMetersXYZ]) as BabylonNativeBlockPositionMetersXYZV1,
    rotationQuarterTurnsY,
    sizeMetersXYZ: effectiveBabylonNativeBlockSizeMetersXYZV1(input.shape, rotationQuarterTurnsY),
    minimumMetersXYZ: bounds.minimumMetersXYZ,
    maximumMetersXYZ: bounds.maximumMetersXYZ,
    occupiedMicroCellKeys: babylonNativeBlockOccupiedMicroCellKeysV1(placement),
  }) });
}

function overlapIssues(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
): readonly BabylonNativeBlockLayoutIssueV1[] {
  const blockIdsByCell = new Map<string, string[]>();
  for (const block of blocks) {
    for (const key of block.occupiedMicroCellKeys) {
      const ids = blockIdsByCell.get(key) ?? [];
      ids.push(block.id);
      blockIdsByCell.set(key, ids);
    }
  }
  const cellsByPair = new Map<string, string[]>();
  for (const [key, unsortedIds] of blockIdsByCell) {
    const ids = [...new Set(unsortedIds)].sort(stableCompare);
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const pairKey = `${ids[leftIndex]!}\0${ids[rightIndex]!}`;
        const keys = cellsByPair.get(pairKey) ?? [];
        keys.push(key);
        cellsByPair.set(pairKey, keys);
      }
    }
  }
  return Object.freeze([...cellsByPair.entries()]
    .map(([pairKey, keys]) => {
      const [blockId, relatedBlockId] = pairKey.split("\0") as [string, string];
      return Object.freeze({
        code: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP" as const,
        blockId,
        relatedBlockId,
        microCellKeys: Object.freeze([...keys].sort(stableCompare)),
      });
    })
    .sort((left, right) =>
      stableCompare(left.blockId, right.blockId) ||
      stableCompare(left.relatedBlockId, right.relatedBlockId),
    ));
}

function exposedTopSurfaceCellKeys(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
): readonly string[] {
  const occupied = new Set(
    blocks.flatMap(({ occupiedMicroCellKeys }) => occupiedMicroCellKeys),
  );
  const exposed = new Set<string>();
  for (const key of occupied) {
    const [x, y, z] = parsedCellKey(key);
    if (!occupied.has(cellKey(x, y + 1, z))) {
      exposed.add(cellKey(x, y + 1, z));
    }
  }
  return Object.freeze([...exposed].sort(stableCompare));
}

function boundarySegmentKeys(
  exposedTopCells: readonly string[],
): readonly string[] {
  const exposed = new Set(exposedTopCells);
  const segments: string[] = [];
  const directions = Object.freeze([
    Object.freeze({ suffix: "west", dx: -1, dz: 0 }),
    Object.freeze({ suffix: "east", dx: 1, dz: 0 }),
    Object.freeze({ suffix: "north", dx: 0, dz: -1 }),
    Object.freeze({ suffix: "south", dx: 0, dz: 1 }),
  ] as const);
  for (const key of exposedTopCells) {
    const [x, y, z] = parsedCellKey(key);
    for (const direction of directions) {
      if (!exposed.has(cellKey(x + direction.dx, y, z + direction.dz))) {
        segments.push(`${key}:${direction.suffix}`);
      }
    }
  }
  return Object.freeze(segments.sort(stableCompare));
}

function structuralStepTransitionKeys(
  exposedTopCells: readonly string[],
): readonly string[] {
  const topCellsByColumn = new Map<string, number[]>();
  for (const key of exposedTopCells) {
    const [x, y, z] = parsedCellKey(key);
    const columnKey = `${x},${z}`;
    const heights = topCellsByColumn.get(columnKey) ?? [];
    heights.push(y);
    topCellsByColumn.set(columnKey, heights);
  }
  const transitions = new Set<string>();
  for (const [columnKey, heights] of topCellsByColumn) {
    const [x, z] = columnKey.split(",").map(Number) as [number, number];
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
      const neighborHeights = topCellsByColumn.get(`${x + dx},${z + dz}`) ?? [];
      for (const height of heights) {
        for (const neighborHeight of neighborHeights) {
          if (Math.abs(height - neighborHeight) !== 1) continue;
          const first = cellKey(x, height, z);
          const second = cellKey(x + dx, neighborHeight, z + dz);
          transitions.add(
            stableCompare(first, second) <= 0
              ? `${first}->${second}`
              : `${second}->${first}`,
          );
        }
      }
    }
  }
  return Object.freeze([...transitions].sort(stableCompare));
}

function unsupportedBlockIds(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
): readonly string[] {
  if (blocks.length === 0) return Object.freeze([]);
  const occupiedById = new Map<string, Set<string>>(
    blocks.map((block) => [block.id, new Set(block.occupiedMicroCellKeys)]),
  );
  const allOccupied = new Map<string, Set<string>>();
  for (const [blockId, keys] of occupiedById) {
    for (const key of keys) {
      const ids = allOccupied.get(key) ?? new Set<string>();
      ids.add(blockId);
      allOccupied.set(key, ids);
    }
  }
  const minimumBottomMicroY = min(blocks.map((block) =>
    Math.round(
      block.minimumMetersXYZ[1] /
        BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[1],
    )))!;
  return Object.freeze(blocks
    .filter((block) => {
      const bottomMicroY = Math.round(
        block.minimumMetersXYZ[1] /
          BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[1],
      );
      if (bottomMicroY === minimumBottomMicroY) return false;
      const bottomCells = block.occupiedMicroCellKeys
        .map(parsedCellKey)
        .filter(([, y]) => y === bottomMicroY);
      return !bottomCells.some(([x, y, z]) => {
        const supportingIds = allOccupied.get(cellKey(x, y - 1, z));
        return !isNil(supportingIds) &&
          [...supportingIds].some((id) => id !== block.id);
      });
    })
    .map(({ id }) => id)
    .sort(stableCompare));
}

function sortedIssues(
  issues: readonly BabylonNativeBlockLayoutIssueV1[],
): readonly BabylonNativeBlockLayoutIssueV1[] {
  return Object.freeze([...issues].sort((left, right) =>
    stableCompare(left.blockId, right.blockId) ||
    stableCompare(left.code, right.code) ||
    stableCompare(left.relatedBlockId ?? "", right.relatedBlockId ?? ""),
  ));
}

export function deriveBabylonNativeBlockLayoutV1(
  scene: Scene,
  records: readonly BabylonNativeBlockSessionRecordV1[],
): BabylonNativeBlockLayoutV1 {
  if (!scene.isDisposed) return deriveBabylonNativeBlockSourceLayoutV1(records);
  return finishLayout([], records.map(({ input }) => Object.freeze({
    code: "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH" as const, blockId: input.id,
  })));
}

/** Pure source geometry; no Scene, material or Runtime authority is created. */
export function deriveBabylonNativeBlockSourceLayoutV1(
  records: readonly BabylonNativeBlockSessionRecordV1[],
): BabylonNativeBlockLayoutV1 {
  const entries: BabylonNativeBlockLayoutEntryV1[] = [];
  const issues: BabylonNativeBlockLayoutIssueV1[] = [];
  for (const record of [...records].sort((left, right) =>
    stableCompare(left.input.id, right.input.id))) {
    const derived = deriveEntry(record);
    if (!isNil(derived.entry)) entries.push(derived.entry);
    if (!isNil(derived.issue)) issues.push(derived.issue);
  }
  return finishLayout(entries, issues);
}

function finishLayout(
  entries: BabylonNativeBlockLayoutEntryV1[],
  issues: BabylonNativeBlockLayoutIssueV1[],
): BabylonNativeBlockLayoutV1 {
  const blocks = Object.freeze(entries);
  issues.push(...overlapIssues(blocks));
  const topCells = exposedTopSurfaceCellKeys(blocks);
  return Object.freeze({
    blocks,
    issues: sortedIssues(issues),
    exposedTopSurfaceCellKeys: topCells,
    boundarySegmentKeys: boundarySegmentKeys(topCells),
    structuralStepTransitionKeys: structuralStepTransitionKeys(topCells),
    unsupportedBlockIds: unsupportedBlockIds(blocks),
  });
}
