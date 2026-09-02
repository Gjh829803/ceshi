export const BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1 = 1 as const;
export const BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1 = Object.freeze([
  0.5,
  0.25,
  0.5,
] as const);
export const BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1 = Object.freeze([
  0.25,
  0.125,
  0.25,
] as const);

export type BabylonNativeBlockShapeKindV1 =
  | "full"
  | "half"
  | "quarter"
  | "small"
  | "step";

export type BabylonNativeBlockPositionMetersXYZV1 = readonly [
  xMeters: number,
  yMeters: number,
  zMeters: number,
];

export type BabylonNativeBlockRotationQuarterTurnsYV1 = 0 | 1 | 2 | 3;

export const BABYLON_NATIVE_BLOCK_ROTATION_QUARTER_TURNS_Y_V1 = Object.freeze([
  0, 1, 2, 3,
] as const);

export const BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1 = Object.freeze({
  full: Object.freeze([1, 1, 1]) as readonly [1, 1, 1],
  half: Object.freeze([1, 0.5, 1]) as readonly [1, 0.5, 1],
  quarter: Object.freeze([0.5, 0.5, 1]) as readonly [0.5, 0.5, 1],
  small: Object.freeze([0.5, 0.5, 0.5]) as readonly [0.5, 0.5, 0.5],
  step: Object.freeze([1, 0.25, 1]) as readonly [1, 0.25, 1],
} satisfies Readonly<
  Record<BabylonNativeBlockShapeKindV1, readonly [number, number, number]>
>);

export interface BabylonNativeBlockPlacementV1 {
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY: number;
}

export interface BabylonNativeBlockBoundsMetersV1 {
  readonly minimumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly maximumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
}

const ALIGNMENT_EPSILON = 1e-8;

function aligned(value: number, quantum: number): boolean {
  const scaled = value / quantum;
  return Number.isSafeInteger(Math.round(scaled)) &&
    Math.abs(scaled - Math.round(scaled)) <= ALIGNMENT_EPSILON;
}

export function canonicalizeBabylonNativeBlockEvidenceNumberV1(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      "WORLDKIT_NATIVE_BLOCK_NUMBER_INVALID: evidence numbers must be finite.",
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalizeBabylonNativeBlockCenterToGridV1(
  centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1,
): BabylonNativeBlockPositionMetersXYZV1 {
  return Object.freeze(centerMetersXYZ.map((value, axis) => {
    const lattice = BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1[axis]!;
    return canonicalizeBabylonNativeBlockEvidenceNumberV1(
      Math.round(value / lattice) * lattice,
    );
  }) as [number, number, number]);
}

export function effectiveBabylonNativeBlockSizeMetersXYZV1(
  shape: BabylonNativeBlockShapeKindV1,
  rotationQuarterTurnsY: number,
): readonly [number, number, number] {
  const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[shape];
  return rotationQuarterTurnsY % 2 === 0
    ? size
    : Object.freeze([size[2], size[1], size[0]]);
}

export function babylonNativeBlockBoundsFromCenterV1(
  input: BabylonNativeBlockPlacementV1,
): BabylonNativeBlockBoundsMetersV1 {
  const size = effectiveBabylonNativeBlockSizeMetersXYZV1(
    input.shape,
    input.rotationQuarterTurnsY,
  );
  const minimumMetersXYZ = input.centerMetersXYZ.map((value, axis) =>
    canonicalizeBabylonNativeBlockEvidenceNumberV1(value - size[axis]! / 2),
  ) as [number, number, number];
  const maximumMetersXYZ = input.centerMetersXYZ.map((value, axis) =>
    canonicalizeBabylonNativeBlockEvidenceNumberV1(value + size[axis]! / 2),
  ) as [number, number, number];
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(minimumMetersXYZ),
    maximumMetersXYZ: Object.freeze(maximumMetersXYZ),
  });
}

export function babylonNativeBlockCenterAlignsToGridV1(
  input: BabylonNativeBlockPlacementV1,
): boolean {
  if (
    !input.centerMetersXYZ.every((value, axis) =>
      Number.isFinite(value) &&
      aligned(
        value,
        BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1[axis]!,
      ),
    )
  ) {
    return false;
  }
  const bounds = babylonNativeBlockBoundsFromCenterV1(input);
  return bounds.minimumMetersXYZ.every((value, axis) =>
    aligned(
      value,
      BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[axis]!,
    ),
  ) && bounds.maximumMetersXYZ.every((value, axis) =>
    aligned(
      value,
      BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[axis]!,
    ),
  );
}

export function babylonNativeBlockOccupiedMicroCellKeysV1(
  input: BabylonNativeBlockPlacementV1,
): readonly string[] {
  const bounds = babylonNativeBlockBoundsFromCenterV1(input);
  const minimum = bounds.minimumMetersXYZ.map((value, axis) =>
    Math.round(
      value / BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[axis]!,
    ),
  );
  const maximum = bounds.maximumMetersXYZ.map((value, axis) =>
    Math.round(
      value / BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[axis]!,
    ),
  );
  const keys: string[] = [];
  for (let y = minimum[1]!; y < maximum[1]!; y += 1) {
    for (let z = minimum[2]!; z < maximum[2]!; z += 1) {
      for (let x = minimum[0]!; x < maximum[0]!; x += 1) {
        keys.push(`${x},${y},${z}`);
      }
    }
  }
  return Object.freeze(keys);
}
