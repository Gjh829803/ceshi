import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type {
  BabylonNativeSceneContributionV1,
  BabylonNativeStaticColliderContributionV1,
  NativeSceneDiagnosticV1,
  RuntimeSubjectDescriptorV1,
  WorldResourceLockEntryV1,
} from "@whitebox-world/runtime-contracts";
import { resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";
import type { WorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

export const BABYLON_NATIVE_SPAWN_SUPPORT_TOLERANCE_METERS_V1 = 0.0001;
const POINT_IN_TRIANGLE_TOLERANCE = 1e-9;
const DISTANCE_CALCULATION_TOLERANCE = 1e-12;

export type BabylonNativeSurfaceAdmissionDiagnosticCodeV1 =
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_OUTSIDE_BOUNDS"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_HEIGHT_MISMATCH"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED";

export interface AdmittedBabylonNativeSurfaceFaceV1 {
  readonly triangleIndex: number;
  readonly vertexIndices: readonly [number, number, number];
  readonly normalXYZ: readonly [number, number, number];
  readonly slopeDegrees: number;
}

export interface AdmittedBabylonNativeSurfaceV1 {
  readonly colliderId: string;
  readonly colliderSubshapeId: string;
  readonly surfaceEntityId: string;
  readonly logicalSubshapeId: string;
  readonly traversalSurfaceId: string;
  readonly traversalSurfaceProfileRef: string;
  readonly faces: readonly AdmittedBabylonNativeSurfaceFaceV1[];
}

export interface AdmittedBabylonNativeSpawnSupportV1 {
  readonly colliderId: string;
  readonly colliderSubshapeId: string;
  readonly surfaceEntityId: string;
  readonly logicalSubshapeId: string;
  readonly traversalSurfaceId: string;
  readonly traversalSurfaceProfileRef: string;
  readonly triangleIndex: number;
  readonly supportHeightMeters: number;
}

export type BabylonNativeSurfaceAdmissionResultV1 =
  | Readonly<{
      readonly outcome: "passed";
      readonly surfaces: readonly AdmittedBabylonNativeSurfaceV1[];
      readonly spawnSupport: AdmittedBabylonNativeSpawnSupportV1;
    }>
  | Readonly<{
      readonly outcome: "rejected";
      readonly diagnostic: NativeSceneDiagnosticV1 & Readonly<{
        readonly code: BabylonNativeSurfaceAdmissionDiagnosticCodeV1;
      }>;
    }>;

export interface AdmitBabylonNativeSurfacesInputV1 {
  readonly contribution: BabylonNativeSceneContributionV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly controlledSubject: RuntimeSubjectDescriptorV1;
  readonly worldBounds: WorldPackageWorldBoundsV1;
}

interface TriangleProjectionV1 {
  readonly collider: BabylonNativeStaticColliderContributionV1;
  readonly triangleIndex: number;
  readonly vertexIndices: readonly [number, number, number];
  readonly vertices: readonly [Vector3, Vector3, Vector3];
  readonly normal: Vector3;
  readonly slopeDegrees: number;
}

interface SupportCandidateV1 extends TriangleProjectionV1 {
  readonly supportHeightMeters: number;
}

function rejected(
  code: BabylonNativeSurfaceAdmissionDiagnosticCodeV1,
  positionMetersXYZ: readonly [number, number, number],
): BabylonNativeSurfaceAdmissionResultV1 {
  const messages: Readonly<Record<
    BabylonNativeSurfaceAdmissionDiagnosticCodeV1,
    readonly [string, string]
  >> = {
    WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID: [
      "A Native traversal Surface Profile is not resolved by exactly one matching World Resource Lock row.",
      "Rebuild the WorldPackage with the exact built-in Surface Profile lock.",
    ],
    WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_OUTSIDE_BOUNDS: [
      "The initial controlled Subject capsule is outside the frozen WorldPackage bounds.",
      "Move the spawn marker and complete capsule inside the declared world bounds, then rebuild the Package.",
    ],
    WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING: [
      "The Native spawn marker has no eligible locked traversal Surface at or below its feet.",
      "Place the spawn feet on a subject-slope-compatible static Surface and rebuild the Package.",
    ],
    WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_HEIGHT_MISMATCH: [
      "The Native spawn marker feet do not exactly match the selected Surface height.",
      "Set the spawn marker Y to the Surface height and rebuild the Package.",
    ],
    WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED: [
      "A higher frozen collider triangle obstructs the initial controlled Subject capsule.",
      "Move the spawn marker to a clear supported location and rebuild the Package.",
    ],
  };
  const [message, repairHint] = messages[code];
  return Object.freeze({
    outcome: "rejected" as const,
    diagnostic: Object.freeze({
      kind: "native-scene-diagnostic" as const,
      schemaVersion: 1 as const,
      id: `native-runtime.surface-admission.${code.toLowerCase()}`,
      severity: "error" as const,
      stage: "runtime" as const,
      code,
      location: Object.freeze({
        kind: "world" as const,
        positionMetersXYZ: Object.freeze([...positionMetersXYZ]) as
          readonly [number, number, number],
      }),
      measurement: Object.freeze({ kind: "none" as const }),
      message,
      repairHint,
    }),
  });
}

function vertex(
  collider: BabylonNativeStaticColliderContributionV1,
  index: number,
): Vector3 {
  const offset = index * 3;
  return new Vector3(
    collider.worldPositionsMetersXYZ[offset]!,
    collider.worldPositionsMetersXYZ[offset + 1]!,
    collider.worldPositionsMetersXYZ[offset + 2]!,
  );
}

function projectedBarycentric(
  x: number,
  z: number,
  vertices: readonly [Vector3, Vector3, Vector3],
): readonly [number, number, number] | undefined {
  const [a, b, c] = vertices;
  const denominator =
    (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denominator) <= POINT_IN_TRIANGLE_TOLERANCE) return undefined;
  const first =
    ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) /
    denominator;
  const second =
    ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) /
    denominator;
  const third = 1 - first - second;
  if (
    first < -POINT_IN_TRIANGLE_TOLERANCE ||
    second < -POINT_IN_TRIANGLE_TOLERANCE ||
    third < -POINT_IN_TRIANGLE_TOLERANCE ||
    first > 1 + POINT_IN_TRIANGLE_TOLERANCE ||
    second > 1 + POINT_IN_TRIANGLE_TOLERANCE ||
    third > 1 + POINT_IN_TRIANGLE_TOLERANCE
  ) return undefined;
  return Object.freeze([first, second, third] as const);
}

function supportHeight(
  x: number,
  z: number,
  triangle: TriangleProjectionV1,
): number | undefined {
  const weights = projectedBarycentric(x, z, triangle.vertices);
  if (isNil(weights)) return undefined;
  return triangle.vertices[0].y * weights[0] +
    triangle.vertices[1].y * weights[1] +
    triangle.vertices[2].y * weights[2];
}

function pointTriangleDistanceSquared(
  point: Vector3,
  vertices: readonly [Vector3, Vector3, Vector3],
): number {
  const [a, b, c] = vertices;
  const ab = b.subtract(a);
  const ac = c.subtract(a);
  const ap = point.subtract(a);
  const d1 = Vector3.Dot(ab, ap);
  const d2 = Vector3.Dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return ap.lengthSquared();

  const bp = point.subtract(b);
  const d3 = Vector3.Dot(ab, bp);
  const d4 = Vector3.Dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return bp.lengthSquared();

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const projection = a.add(ab.scale(d1 / (d1 - d3)));
    return Vector3.DistanceSquared(point, projection);
  }

  const cp = point.subtract(c);
  const d5 = Vector3.Dot(ab, cp);
  const d6 = Vector3.Dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return cp.lengthSquared();

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const projection = a.add(ac.scale(d2 / (d2 - d6)));
    return Vector3.DistanceSquared(point, projection);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = c.subtract(b);
    const projection = b.add(edge.scale(
      (d4 - d3) / ((d4 - d3) + (d5 - d6)),
    ));
    return Vector3.DistanceSquared(point, projection);
  }

  const denominator = 1 / (va + vb + vc);
  const projection = a.add(
    ab.scale(vb * denominator),
  ).addInPlace(ac.scale(vc * denominator));
  return Vector3.DistanceSquared(point, projection);
}

function segmentSegmentDistanceSquared(
  firstStart: Vector3,
  firstEnd: Vector3,
  secondStart: Vector3,
  secondEnd: Vector3,
): number {
  const firstDirection = firstEnd.subtract(firstStart);
  const secondDirection = secondEnd.subtract(secondStart);
  const startDelta = firstStart.subtract(secondStart);
  const firstLengthSquared = Vector3.Dot(firstDirection, firstDirection);
  const secondLengthSquared = Vector3.Dot(secondDirection, secondDirection);
  const secondProjection = Vector3.Dot(secondDirection, startDelta);
  let firstRatio: number;
  let secondRatio: number;

  if (
    firstLengthSquared <= DISTANCE_CALCULATION_TOLERANCE &&
    secondLengthSquared <= DISTANCE_CALCULATION_TOLERANCE
  ) return startDelta.lengthSquared();
  if (firstLengthSquared <= DISTANCE_CALCULATION_TOLERANCE) {
    firstRatio = 0;
    secondRatio = Math.min(
      1,
      Math.max(0, secondProjection / secondLengthSquared),
    );
  } else {
    const firstProjection = Vector3.Dot(firstDirection, startDelta);
    if (secondLengthSquared <= DISTANCE_CALCULATION_TOLERANCE) {
      secondRatio = 0;
      firstRatio = Math.min(
        1,
        Math.max(0, -firstProjection / firstLengthSquared),
      );
    } else {
      const directionDot = Vector3.Dot(firstDirection, secondDirection);
      const denominator = firstLengthSquared * secondLengthSquared -
        directionDot * directionDot;
      firstRatio = Math.abs(denominator) > DISTANCE_CALCULATION_TOLERANCE
        ? Math.min(1, Math.max(0, (
            directionDot * secondProjection -
            firstProjection * secondLengthSquared
          ) / denominator))
        : 0;
      secondRatio = (
        directionDot * firstRatio + secondProjection
      ) / secondLengthSquared;
      if (secondRatio < 0) {
        secondRatio = 0;
        firstRatio = Math.min(
          1,
          Math.max(0, -firstProjection / firstLengthSquared),
        );
      } else if (secondRatio > 1) {
        secondRatio = 1;
        firstRatio = Math.min(
          1,
          Math.max(
            0,
            (directionDot - firstProjection) / firstLengthSquared,
          ),
        );
      }
    }
  }

  const firstPoint = firstStart.add(firstDirection.scale(firstRatio));
  const secondPoint = secondStart.add(secondDirection.scale(secondRatio));
  return Vector3.DistanceSquared(firstPoint, secondPoint);
}

function segmentIntersectsTriangle(
  segmentStart: Vector3,
  segmentEnd: Vector3,
  vertices: readonly [Vector3, Vector3, Vector3],
): boolean {
  const [a, b, c] = vertices;
  const direction = segmentEnd.subtract(segmentStart);
  const edgeA = b.subtract(a);
  const edgeB = c.subtract(a);
  const directionCrossEdgeB = Vector3.Cross(direction, edgeB);
  const determinant = Vector3.Dot(edgeA, directionCrossEdgeB);
  if (Math.abs(determinant) <= DISTANCE_CALCULATION_TOLERANCE) {
    return false;
  }
  const inverseDeterminant = 1 / determinant;
  const startDelta = segmentStart.subtract(a);
  const firstWeight = Vector3.Dot(startDelta, directionCrossEdgeB) *
    inverseDeterminant;
  if (firstWeight < 0 || firstWeight > 1) return false;
  const startCrossEdgeA = Vector3.Cross(startDelta, edgeA);
  const secondWeight = Vector3.Dot(direction, startCrossEdgeA) *
    inverseDeterminant;
  if (secondWeight < 0 || firstWeight + secondWeight > 1) return false;
  const segmentRatio = Vector3.Dot(edgeB, startCrossEdgeA) *
    inverseDeterminant;
  return segmentRatio >= 0 && segmentRatio <= 1;
}

function segmentTriangleDistanceSquared(
  segmentStart: Vector3,
  segmentEnd: Vector3,
  vertices: readonly [Vector3, Vector3, Vector3],
): number {
  if (segmentIntersectsTriangle(segmentStart, segmentEnd, vertices)) return 0;
  return Math.min(
    pointTriangleDistanceSquared(segmentStart, vertices),
    pointTriangleDistanceSquared(segmentEnd, vertices),
    segmentSegmentDistanceSquared(
      segmentStart,
      segmentEnd,
      vertices[0],
      vertices[1],
    ),
    segmentSegmentDistanceSquared(
      segmentStart,
      segmentEnd,
      vertices[1],
      vertices[2],
    ),
    segmentSegmentDistanceSquared(
      segmentStart,
      segmentEnd,
      vertices[2],
      vertices[0],
    ),
  );
}

function triangleProjections(
  collider: BabylonNativeStaticColliderContributionV1,
): readonly TriangleProjectionV1[] {
  const projections: TriangleProjectionV1[] = [];
  for (
    let triangleOffset = 0;
    triangleOffset < collider.triangleIndices.length;
    triangleOffset += 3
  ) {
    const vertexIndices = Object.freeze([
      collider.triangleIndices[triangleOffset]!,
      collider.triangleIndices[triangleOffset + 1]!,
      collider.triangleIndices[triangleOffset + 2]!,
    ] as const);
    const vertices = Object.freeze([
      vertex(collider, vertexIndices[0]),
      vertex(collider, vertexIndices[1]),
      vertex(collider, vertexIndices[2]),
    ] as const);
    const edgeA = vertices[1].subtract(vertices[0]);
    const edgeB = vertices[2].subtract(vertices[0]);
    // Babylon 9.23 ComputeNormals uses (p1 - p2) x (p3 - p2), which is
    // equivalent to edgeB x edgeA for this vertex order.
    const rawNormal = Vector3.Cross(edgeB, edgeA);
    if (rawNormal.lengthSquared() <= Number.EPSILON) continue;
    const normal = rawNormal.normalize();
    const slopeDegrees = Math.acos(Math.min(1, Math.max(0, normal.y))) *
      180 / Math.PI;
    projections.push(Object.freeze({
      collider,
      triangleIndex: triangleOffset / 3,
      vertexIndices,
      vertices,
      normal,
      slopeDegrees,
    }));
  }
  return Object.freeze(projections);
}

function exactSurfaceProfileLocks(
  input: AdmitBabylonNativeSurfacesInputV1,
): boolean {
  const refs = new Set(
    input.contribution.staticColliders.flatMap((collider) =>
      collider.traversalBinding.kind === "static-surface"
        ? [collider.traversalBinding.traversalSurfaceProfileRef]
        : [],
    ),
  );
  for (const resourceRef of refs) {
    let resolved: ReturnType<typeof resolveTraversalSurfaceProfileV1>;
    try {
      resolved = resolveTraversalSurfaceProfileV1(resourceRef);
    } catch {
      return false;
    }
    const rows = input.registryLock.filter((entry) =>
      entry.resourceKind === "traversal-surface-profile" &&
      entry.resourceRef === resourceRef,
    );
    if (
      rows.length !== 1 ||
      rows[0]?.resolvedVersion !== resolved.resolvedVersion ||
      rows[0]?.contentHash !== resolved.contentHash
    ) return false;
  }
  return true;
}

function capsuleInsideBounds(
  spawn: readonly [number, number, number],
  subject: RuntimeSubjectDescriptorV1,
  bounds: WorldPackageWorldBoundsV1,
): boolean {
  const center = subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
  const centerX = spawn[0] + center[0];
  const centerY = spawn[1] + center[1];
  const centerZ = spawn[2] + center[2];
  const radius = subject.collider.radiusMeters;
  const halfHeight = subject.collider.heightMeters / 2;
  const halfWorldX = bounds.sizeMetersXZ[0] / 2;
  const halfWorldZ = bounds.sizeMetersXZ[1] / 2;
  return centerX - radius >= bounds.centerMetersXZ[0] - halfWorldX &&
    centerX + radius <= bounds.centerMetersXZ[0] + halfWorldX &&
    centerZ - radius >= bounds.centerMetersXZ[1] - halfWorldZ &&
    centerZ + radius <= bounds.centerMetersXZ[1] + halfWorldZ &&
    centerY - halfHeight >= bounds.heightRangeMeters[0] &&
    centerY + halfHeight <= bounds.heightRangeMeters[1];
}

function obstructsCapsule(
  input: AdmitBabylonNativeSurfacesInputV1,
  support: SupportCandidateV1,
  allTriangles: readonly TriangleProjectionV1[],
): boolean {
  const spawn = input.contribution.spawnMarker.positionMetersXYZ;
  const centerOffset =
    input.controlledSubject.collider.centerOffsetFromSubjectOriginMetersXYZ;
  const center = new Vector3(
    spawn[0] + centerOffset[0],
    spawn[1] + centerOffset[1],
    spawn[2] + centerOffset[2],
  );
  const radius = input.controlledSubject.collider.radiusMeters;
  const axisHalfLength = Math.max(
    0,
    input.controlledSubject.collider.heightMeters / 2 - radius,
  );
  const segmentStart = center.add(new Vector3(0, -axisHalfLength, 0));
  const segmentEnd = center.add(new Vector3(0, axisHalfLength, 0));
  const obstructedRadius = Math.max(
    0,
    radius - BABYLON_NATIVE_SPAWN_SUPPORT_TOLERANCE_METERS_V1,
  );
  const obstructedRadiusSquared = obstructedRadius * obstructedRadius;
  return allTriangles.some((triangle) => {
    if (
      triangle.collider.colliderSubshapeId ===
        support.collider.colliderSubshapeId &&
      triangle.triangleIndex === support.triangleIndex
    ) return false;
    return segmentTriangleDistanceSquared(
      segmentStart,
      segmentEnd,
      triangle.vertices,
    ) < obstructedRadiusSquared;
  });
}

export function admitBabylonNativeSurfacesV1(
  input: AdmitBabylonNativeSurfacesInputV1,
): BabylonNativeSurfaceAdmissionResultV1 {
  const spawn = input.contribution.spawnMarker.positionMetersXYZ;
  if (!exactSurfaceProfileLocks(input)) {
    return rejected(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID",
      spawn,
    );
  }
  if (!capsuleInsideBounds(spawn, input.controlledSubject, input.worldBounds)) {
    return rejected("WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_OUTSIDE_BOUNDS", spawn);
  }

  const allTriangles = input.contribution.staticColliders.flatMap(
    triangleProjections,
  );
  const surfaces: AdmittedBabylonNativeSurfaceV1[] = [];
  const candidates: SupportCandidateV1[] = [];
  for (const collider of input.contribution.staticColliders) {
    if (collider.traversalBinding.kind !== "static-surface") continue;
    const surfaceProfile = resolveTraversalSurfaceProfileV1(
      collider.traversalBinding.traversalSurfaceProfileRef,
    ).profile;
    const faces = surfaceProfile.faceSelectionMode ===
        "subject-slope-compatible"
      ? triangleProjections(collider).filter((triangle) =>
        triangle.normal.y > POINT_IN_TRIANGLE_TOLERANCE &&
        triangle.slopeDegrees <=
          input.controlledSubject.collider.maxSlopeDegrees
      )
      : [];
    if (faces.length === 0) continue;
    surfaces.push(Object.freeze({
      colliderId: collider.id,
      colliderSubshapeId: collider.colliderSubshapeId,
      surfaceEntityId: collider.traversalBinding.surfaceEntityId,
      logicalSubshapeId: collider.traversalBinding.logicalSubshapeId,
      traversalSurfaceId: collider.traversalBinding.traversalSurfaceId,
      traversalSurfaceProfileRef:
        collider.traversalBinding.traversalSurfaceProfileRef,
      faces: Object.freeze(faces.map((face) => Object.freeze({
        triangleIndex: face.triangleIndex,
        vertexIndices: face.vertexIndices,
        normalXYZ: Object.freeze([
          Object.is(face.normal.x, -0) ? 0 : face.normal.x,
          Object.is(face.normal.y, -0) ? 0 : face.normal.y,
          Object.is(face.normal.z, -0) ? 0 : face.normal.z,
        ] as const),
        slopeDegrees: face.slopeDegrees,
      }))),
    }));
    for (const face of faces) {
      const height = supportHeight(spawn[0], spawn[2], face);
      if (
        !isNil(height) &&
        height <= spawn[1] +
          BABYLON_NATIVE_SPAWN_SUPPORT_TOLERANCE_METERS_V1
      ) {
        candidates.push(Object.freeze({
          ...face,
          supportHeightMeters: height,
        }));
      }
    }
  }
  const support = candidates.sort((left, right) =>
    right.supportHeightMeters - left.supportHeightMeters ||
    left.collider.colliderSubshapeId.localeCompare(
      right.collider.colliderSubshapeId,
    ) ||
    left.triangleIndex - right.triangleIndex,
  )[0];
  if (isNil(support)) {
    return rejected("WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING", spawn);
  }
  if (
    Math.abs(spawn[1] - support.supportHeightMeters) >
      BABYLON_NATIVE_SPAWN_SUPPORT_TOLERANCE_METERS_V1
  ) {
    return rejected(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_HEIGHT_MISMATCH",
      spawn,
    );
  }
  if (obstructsCapsule(input, support, allTriangles)) {
    return rejected(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED",
      spawn,
    );
  }
  const binding = support.collider.traversalBinding;
  if (binding.kind !== "static-surface") {
    return rejected("WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING", spawn);
  }
  return Object.freeze({
    outcome: "passed" as const,
    surfaces: Object.freeze(surfaces),
    spawnSupport: Object.freeze({
      colliderId: support.collider.id,
      colliderSubshapeId: support.collider.colliderSubshapeId,
      surfaceEntityId: binding.surfaceEntityId,
      logicalSubshapeId: binding.logicalSubshapeId,
      traversalSurfaceId: binding.traversalSurfaceId,
      traversalSurfaceProfileRef: binding.traversalSurfaceProfileRef,
      triangleIndex: support.triangleIndex,
      supportHeightMeters: support.supportHeightMeters,
    }),
  });
}
