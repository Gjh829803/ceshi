import type {
  ColliderSourcePartV1,
  CompositionBoundsV1,
  CompositionPrimitiveV1,
  Vec3,
} from "./types";

const OUTPUT_PRECISION_DECIMALS = 12;

function isFiniteVec3(value: Vec3): boolean {
  return value.every(Number.isFinite);
}

function hasValidShapeDimensions(shape: CompositionPrimitiveV1): boolean {
  switch (shape.kind) {
    case "box":
      return shape.sizeMetersXYZ.every((value) => Number.isFinite(value) && value > 0);
    case "sphere":
      return Number.isFinite(shape.radiusMeters) && shape.radiusMeters > 0;
    case "cylinder":
      return (
        Number.isFinite(shape.radiusMeters) &&
        shape.radiusMeters > 0 &&
        Number.isFinite(shape.heightMeters) &&
        shape.heightMeters > 0
      );
    case "capsule":
      return (
        Number.isFinite(shape.radiusMeters) &&
        shape.radiusMeters > 0 &&
        Number.isFinite(shape.heightMeters) &&
        shape.heightMeters >= shape.radiusMeters * 2
      );
  }
}

export function isValidColliderSourcePart(part: ColliderSourcePartV1): boolean {
  return (
    hasValidShapeDimensions(part.shape) &&
    isFiniteVec3(part.localPositionMetersXYZ) &&
    isFiniteVec3(part.localRotationEulerRadiansXYZ)
  );
}

function normalizeNumber(value: number): number {
  const rounded = Number(value.toFixed(OUTPUT_PRECISION_DECIMALS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function primitiveHalfExtents(shape: CompositionPrimitiveV1): Vec3 {
  switch (shape.kind) {
    case "box":
      return [
        shape.sizeMetersXYZ[0] / 2,
        shape.sizeMetersXYZ[1] / 2,
        shape.sizeMetersXYZ[2] / 2,
      ];
    case "sphere":
      return [shape.radiusMeters, shape.radiusMeters, shape.radiusMeters];
    case "cylinder":
    case "capsule":
      return [shape.radiusMeters, shape.heightMeters / 2, shape.radiusMeters];
  }
}

function rotateXThenYThenZ(point: Vec3, rotationRadiansXYZ: Vec3): Vec3 {
  const [rotationX, rotationY, rotationZ] = rotationRadiansXYZ;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);

  const afterX: Vec3 = [
    point[0],
    point[1] * cosX - point[2] * sinX,
    point[1] * sinX + point[2] * cosX,
  ];
  const afterY: Vec3 = [
    afterX[0] * cosY + afterX[2] * sinY,
    afterX[1],
    -afterX[0] * sinY + afterX[2] * cosY,
  ];
  return [
    afterY[0] * cosZ - afterY[1] * sinZ,
    afterY[0] * sinZ + afterY[1] * cosZ,
    afterY[2],
  ];
}

export function derivePrimitiveBounds(part: ColliderSourcePartV1): CompositionBoundsV1 {
  const halfExtents = primitiveHalfExtents(part.shape);
  const minimum: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const maximum: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  for (const xSign of [-1, 1] as const) {
    for (const ySign of [-1, 1] as const) {
      for (const zSign of [-1, 1] as const) {
        const rotated = rotateXThenYThenZ(
          [xSign * halfExtents[0], ySign * halfExtents[1], zSign * halfExtents[2]],
          part.localRotationEulerRadiansXYZ,
        );
        for (const axis of [0, 1, 2] as const) {
          const coordinate = rotated[axis] + part.localPositionMetersXYZ[axis];
          minimum[axis] = Math.min(minimum[axis], coordinate);
          maximum[axis] = Math.max(maximum[axis], coordinate);
        }
      }
    }
  }

  return {
    minimumMetersXYZ: [
      normalizeNumber(minimum[0]),
      normalizeNumber(minimum[1]),
      normalizeNumber(minimum[2]),
    ],
    maximumMetersXYZ: [
      normalizeNumber(maximum[0]),
      normalizeNumber(maximum[1]),
      normalizeNumber(maximum[2]),
    ],
  };
}

export function deriveCompositionBounds(
  parts: readonly ColliderSourcePartV1[],
): CompositionBoundsV1 {
  const primitiveBounds = parts.map(derivePrimitiveBounds);
  return {
    minimumMetersXYZ: [
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[0])),
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[1])),
      Math.min(...primitiveBounds.map((bounds) => bounds.minimumMetersXYZ[2])),
    ],
    maximumMetersXYZ: [
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[0])),
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[1])),
      Math.max(...primitiveBounds.map((bounds) => bounds.maximumMetersXYZ[2])),
    ],
  };
}
