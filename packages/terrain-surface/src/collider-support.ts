export type LockedSupportColliderV1 =
  | {
      kind: "box";
      centerMetersXYZ: readonly [number, number, number];
      halfExtentsMetersXYZ: readonly [number, number, number];
      rotationEulerRadiansXYZ: readonly [number, number, number];
    }
  | {
      kind: "capsule" | "cylinder" | "sphere";
      centerMetersXYZ: readonly [number, number, number];
      radiusMeters: number;
      heightMeters?: number;
    }
  | { kind: "convex"; verticesMetersXYZ: readonly (readonly [number, number, number])[] };

const BARYCENTRIC_EPSILON = 0.0000001;

type RotationMatrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Local-to-world rotation matching Babylon Quaternion.FromEulerAngles: yaw(Y) * pitch(X) * roll(Z). */
function rotationMatrixFromEuler(
  rotationEulerRadiansXYZ: readonly [number, number, number],
): RotationMatrix {
  const [x, y, z] = rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
}

function unsupportedQueryError(reason: string): Error {
  return new Error(`OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED: ${reason}`);
}

function boxSupportHeightMeters(
  collider: Extract<LockedSupportColliderV1, { kind: "box" }>,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  const rotation = rotationMatrixFromEuler(collider.rotationEulerRadiansXYZ);
  const deltaX = pointMetersXZ[0] - collider.centerMetersXYZ[0];
  const deltaZ = pointMetersXZ[1] - collider.centerMetersXYZ[2];
  // World-to-local uses the transpose of the local-to-world rotation.
  const localX = rotation[0][0] * deltaX + rotation[2][0] * deltaZ;
  const localZ = rotation[0][2] * deltaX + rotation[2][2] * deltaZ;
  const [halfX, halfY, halfZ] = collider.halfExtentsMetersXYZ;
  if (Math.abs(localX) > halfX || Math.abs(localZ) > halfZ) return undefined;
  return collider.centerMetersXYZ[1] +
    rotation[1][0] * localX +
    rotation[1][1] * halfY +
    rotation[1][2] * localZ;
}

function roundSupportHeightMeters(
  collider: Extract<LockedSupportColliderV1, { kind: "capsule" | "cylinder" | "sphere" }>,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  const deltaX = pointMetersXZ[0] - collider.centerMetersXYZ[0];
  const deltaZ = pointMetersXZ[1] - collider.centerMetersXYZ[2];
  const radialSquared = deltaX * deltaX + deltaZ * deltaZ;
  const radiusSquared = collider.radiusMeters * collider.radiusMeters;
  if (radialSquared > radiusSquared) return undefined;
  if (collider.kind === "sphere") {
    return collider.centerMetersXYZ[1] + Math.sqrt(radiusSquared - radialSquared);
  }
  const heightMeters = collider.heightMeters ?? collider.radiusMeters * 2;
  return collider.centerMetersXYZ[1] + heightMeters / 2;
}

function convexSupportHeightMeters(
  collider: Extract<LockedSupportColliderV1, { kind: "convex" }>,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  const vertices = collider.verticesMetersXYZ;
  if (
    vertices.length === 0 ||
    vertices.some((vertex) => vertex.some((component) => !Number.isFinite(component)))
  ) {
    throw unsupportedQueryError(
      "The convex support query cannot be determined from the locked vertex set.",
    );
  }
  const [px, pz] = pointMetersXZ;
  // The vertical ray hits the hull exactly when the sample lies in the XZ
  // projection of some vertex simplex; the highest hit is the maximum
  // barycentric interpolation of Y over those simplices (LP basic solutions).
  let highestHitMeters: number | undefined;
  const consider = (candidateMeters: number): void => {
    if (highestHitMeters === undefined || candidateMeters > highestHitMeters) {
      highestHitMeters = candidateMeters;
    }
  };
  for (let a = 0; a < vertices.length; a += 1) {
    const [ax, ay, az] = vertices[a]!;
    if (Math.hypot(px - ax, pz - az) <= BARYCENTRIC_EPSILON) consider(ay);
    for (let b = a + 1; b < vertices.length; b += 1) {
      const [bx, by, bz] = vertices[b]!;
      const segmentDx = bx - ax;
      const segmentDz = bz - az;
      const segmentLengthSquared = segmentDx * segmentDx + segmentDz * segmentDz;
      if (segmentLengthSquared > BARYCENTRIC_EPSILON) {
        const t = ((px - ax) * segmentDx + (pz - az) * segmentDz) / segmentLengthSquared;
        const offMeters = Math.hypot(
          ax + segmentDx * t - px,
          az + segmentDz * t - pz,
        );
        if (t >= -BARYCENTRIC_EPSILON && t <= 1 + BARYCENTRIC_EPSILON && offMeters <= BARYCENTRIC_EPSILON) {
          consider(ay + (by - ay) * Math.min(1, Math.max(0, t)));
        }
      }
      for (let c = b + 1; c < vertices.length; c += 1) {
        const [cx, cy, cz] = vertices[c]!;
        const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(area) <= BARYCENTRIC_EPSILON) continue;
        const lambdaB = ((px - ax) * (cz - az) - (pz - az) * (cx - ax)) / area;
        const lambdaC = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / area;
        const lambdaA = 1 - lambdaB - lambdaC;
        if (
          lambdaA >= -BARYCENTRIC_EPSILON &&
          lambdaB >= -BARYCENTRIC_EPSILON &&
          lambdaC >= -BARYCENTRIC_EPSILON
        ) {
          consider(lambdaA * ay + lambdaB * by + lambdaC * cy);
        }
      }
    }
  }
  return highestHitMeters;
}

/**
 * Returns the world Y of the locked collider's support surface under a
 * vertical sample, or undefined when the sample misses the collider footprint.
 * Throws OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED for kinds that have no
 * locked support surface; callers must never fall back to visual/AABB tops.
 */
export function queryLockedColliderSupportHeightMeters(
  collider: LockedSupportColliderV1,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  switch (collider.kind) {
    case "box":
      return boxSupportHeightMeters(collider, pointMetersXZ);
    case "capsule":
    case "cylinder":
    case "sphere":
      return roundSupportHeightMeters(collider, pointMetersXZ);
    case "convex":
      return convexSupportHeightMeters(collider, pointMetersXZ);
    default:
      throw unsupportedQueryError(
        `Collider kind "${(collider as { kind: string }).kind}" has no support surface query.`,
      );
  }
}
