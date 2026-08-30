import type {
  BlockInstanceV2,
  BlockPositionMetersXYZV2,
  BlockShapeKindV2,
} from "./types.js";

export const BLOCK_WORLD_FULL_BLOCK_SIZE_METERS_V2 = 1 as const;
export const BLOCK_WORLD_MICRO_GRID_SIZE_METERS_V2 = 0.5 as const;
export const BLOCK_WORLD_CENTER_LATTICE_METERS_V2 = 0.25 as const;

export const BLOCK_SHAPE_SIZE_METERS_XYZ_V2 = Object.freeze({
  full: Object.freeze([1, 1, 1]) as readonly [1, 1, 1],
  half: Object.freeze([1, 0.5, 1]) as readonly [1, 0.5, 1],
  quarter: Object.freeze([0.5, 0.5, 1]) as readonly [0.5, 0.5, 1],
  small: Object.freeze([0.5, 0.5, 0.5]) as readonly [0.5, 0.5, 0.5],
} satisfies Readonly<Record<BlockShapeKindV2, readonly [number, number, number]>>);

export interface BlockBoundsMetersV2 {
  readonly minimumMetersXYZ: BlockPositionMetersXYZV2;
  readonly maximumMetersXYZ: BlockPositionMetersXYZV2;
}

export function effectiveBlockSizeMetersXYZV2(
  shape: BlockShapeKindV2,
  rotationQuarterTurnsY: number,
): readonly [number, number, number] {
  const size = BLOCK_SHAPE_SIZE_METERS_XYZ_V2[shape];
  return rotationQuarterTurnsY % 2 === 0
    ? size
    : Object.freeze([size[2], size[1], size[0]]);
}

export function blockBoundsMetersV2(
  block: Pick<BlockInstanceV2, "shape" | "positionMetersXYZ" | "rotationQuarterTurnsY">,
): BlockBoundsMetersV2 {
  const size = effectiveBlockSizeMetersXYZV2(block.shape, block.rotationQuarterTurnsY);
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(block.positionMetersXYZ.map(
      (value, axis) => value - size[axis]! / 2,
    )) as BlockPositionMetersXYZV2,
    maximumMetersXYZ: Object.freeze(block.positionMetersXYZ.map(
      (value, axis) => value + size[axis]! / 2,
    )) as BlockPositionMetersXYZV2,
  });
}

function aligned(value: number, quantum: number): boolean {
  return Number.isSafeInteger(Math.round(value / quantum)) &&
    Math.abs(value / quantum - Math.round(value / quantum)) <= 1e-8;
}

export function blockPositionAlignsToLatticeV2(
  block: Pick<BlockInstanceV2, "shape" | "positionMetersXYZ" | "rotationQuarterTurnsY">,
): boolean {
  if (!block.positionMetersXYZ.every((value) =>
    Number.isFinite(value) && aligned(value, BLOCK_WORLD_CENTER_LATTICE_METERS_V2))) return false;
  const bounds = blockBoundsMetersV2(block);
  return [...bounds.minimumMetersXYZ, ...bounds.maximumMetersXYZ].every((value) =>
    aligned(value, BLOCK_WORLD_MICRO_GRID_SIZE_METERS_V2));
}

export function occupiedMicroCellKeysV2(
  block: Pick<BlockInstanceV2, "shape" | "positionMetersXYZ" | "rotationQuarterTurnsY">,
): readonly string[] {
  const bounds = blockBoundsMetersV2(block);
  const minimum = bounds.minimumMetersXYZ.map((value) =>
    Math.round(value / BLOCK_WORLD_MICRO_GRID_SIZE_METERS_V2));
  const maximum = bounds.maximumMetersXYZ.map((value) =>
    Math.round(value / BLOCK_WORLD_MICRO_GRID_SIZE_METERS_V2));
  const keys: string[] = [];
  for (let y = minimum[1]!; y < maximum[1]!; y += 1) {
    for (let z = minimum[2]!; z < maximum[2]!; z += 1) {
      for (let x = minimum[0]!; x < maximum[0]!; x += 1) keys.push(`${x},${y},${z}`);
    }
  }
  return Object.freeze(keys);
}

export function quantizedMeterKeyV2(position: BlockPositionMetersXYZV2): string {
  return position.map((value) => Math.round(value * 4)).join(",");
}

export function positionFromQuantizedMeterKeyV2(key: string): BlockPositionMetersXYZV2 {
  const values = key.split(",").map((value) => Number(value) / 4);
  return [values[0]!, values[1]!, values[2]!];
}
