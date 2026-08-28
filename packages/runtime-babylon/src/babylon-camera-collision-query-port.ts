import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  parseCameraCollisionQueryRequestV1,
  parseCameraCollisionQueryResultV1,
  type CameraCollisionQueryPortV1,
  type CameraCollisionQueryRequestV1,
  type CameraCollisionQueryResultV1,
} from "@whitebox-world/camera";

const NATIVE_DISTANCE_TOLERANCE_METERS_V1 = 1e-6;

function queryUnavailable(): never {
  throw new Error(
    "3C_CAMERA_QUERY_UNAVAILABLE: Babylon ray-fan collision query failed closed.",
  );
}

function finiteVector(value: Vector3 | null | undefined): value is Vector3 {
  return value instanceof Vector3 &&
    Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cameraEntityIdForMesh(mesh: AbstractMesh | null | undefined): string | undefined {
  const metadataEntityId = mesh?.metadata?.worldkitEntityId;
  if (typeof metadataEntityId === "string") return metadataEntityId;
  const providerUniqueId = mesh?.uniqueId;
  return Number.isSafeInteger(providerUniqueId) && providerUniqueId! >= 0
    ? `babylon-provider-node:${providerUniqueId}`
    : undefined;
}

function rayFanOffsets(direction: Vector3, radiusMeters: number): readonly Vector3[] {
  const basisSeed = Math.abs(Vector3.Dot(direction, Vector3.Up())) < 0.999
    ? Vector3.Up()
    : Vector3.Right();
  const right = Vector3.Cross(basisSeed, direction).normalize();
  const probeUp = Vector3.Cross(direction, right).normalize();
  const diagonalScale = radiusMeters / Math.SQRT2;
  const diagonalRight = right.scale(diagonalScale);
  const diagonalUp = probeUp.scale(diagonalScale);
  return Object.freeze([
    Vector3.Zero(),
    right.scale(radiusMeters),
    right.scale(-radiusMeters),
    probeUp.scale(radiusMeters),
    probeUp.scale(-radiusMeters),
    diagonalRight.add(diagonalUp),
    diagonalRight.subtract(diagonalUp),
    diagonalRight.scale(-1).add(diagonalUp),
    diagonalRight.scale(-1).subtract(diagonalUp),
  ]);
}

interface RayFanHitV1 {
  readonly rawDistanceMeters: number;
  readonly rayIndex: number;
  readonly normal?: Vector3;
  readonly hitEntityId: string;
}

/**
 * Babylon 9.23.0 provider adapter for the existing fixed nine-ray Camera arm approximation.
 * Public hit distance/position are the safe Camera-center pose, never a raw ray contact.
 */
export class BabylonCameraCollisionQueryPortV1 implements CameraCollisionQueryPortV1 {
  private latestCommittedTick: number | undefined;
  private latestRequestIdentity: string | undefined;
  private latestResult: CameraCollisionQueryResultV1 | undefined;
  private latestAttemptFailed = false;
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  query(input: CameraCollisionQueryRequestV1): CameraCollisionQueryResultV1 {
    if (this.disposed) {
      throw new Error("3C_RUNTIME_DISPOSED: Camera collision query port is disposed.");
    }
    let request: CameraCollisionQueryRequestV1;
    try {
      request = parseCameraCollisionQueryRequestV1(input);
    } catch {
      return queryUnavailable();
    }
    const requestIdentity = JSON.stringify(request);
    if (this.latestCommittedTick !== undefined && request.committedTick < this.latestCommittedTick) {
      queryUnavailable();
    }
    if (request.committedTick === this.latestCommittedTick) {
      if (requestIdentity !== this.latestRequestIdentity || this.latestAttemptFailed ||
        this.latestResult === undefined) queryUnavailable();
      return this.latestResult;
    }
    this.latestCommittedTick = request.committedTick;
    this.latestRequestIdentity = requestIdentity;
    this.latestResult = undefined;
    // A Tick attempt is consumed before the first native query. Any failure is
    // replayed as failure instead of consulting a time-varying Scene twice.
    this.latestAttemptFailed = true;

    const from = new Vector3(...request.fromMetersXYZ);
    const to = new Vector3(...request.toMetersXYZ);
    const displacement = to.subtract(from);
    const armLength = displacement.length();
    if (armLength <= NATIVE_DISTANCE_TOLERANCE_METERS_V1) {
      const result = parseCameraCollisionQueryResultV1({
        schemaVersion: 1,
        quality: "ray-fan-approximation",
        hit: false,
      }, request);
      this.latestResult = result;
      this.latestAttemptFailed = false;
      return result;
    }
    const direction = displacement.scale(1 / armLength);
    const excludedEntityIds = new Set(request.excludedEntityIds);
    let closest: RayFanHitV1 | undefined;
    try {
      const offsets = rayFanOffsets(direction, request.radiusMeters);
      offsets.forEach((offset, rayIndex) => {
        const ray = new Ray(from.add(offset), direction, armLength);
        const hit = this.scene.pickWithRay(ray, (candidate) => {
          const entityId = cameraEntityIdForMesh(candidate);
          return candidate.isPickable &&
            (entityId === undefined || !excludedEntityIds.has(entityId));
        });
        if (hit?.hit !== true) return;
        if (!Number.isFinite(hit.distance) || hit.distance < 0 ||
          hit.distance > armLength + NATIVE_DISTANCE_TOLERANCE_METERS_V1) {
          queryUnavailable();
        }
        const hitEntityId = cameraEntityIdForMesh(hit.pickedMesh);
        if (hitEntityId === undefined || excludedEntityIds.has(hitEntityId)) {
          queryUnavailable();
        }
        if (hit.pickedPoint !== null && hit.pickedPoint !== undefined) {
          if (!finiteVector(hit.pickedPoint)) queryUnavailable();
          const contactDelta = hit.pickedPoint.subtract(ray.origin);
          const longitudinal = Vector3.Dot(contactDelta, direction);
          const lateral = contactDelta.subtract(direction.scale(longitudinal)).length();
          if (Math.abs(longitudinal - hit.distance) > NATIVE_DISTANCE_TOLERANCE_METERS_V1 ||
            lateral > NATIVE_DISTANCE_TOLERANCE_METERS_V1) queryUnavailable();
        }
        // Use the picked face normal from locked Babylon 9.23.0. Interpolated
        // vertex normals can be undefined for low-level/CPU picking fixtures;
        // malformed face evidence still fails closed below.
        const nativeNormal = hit.faceId === -1
          ? undefined
          : hit.getNormal?.(true, false);
        if (nativeNormal !== null && nativeNormal !== undefined &&
          (!finiteVector(nativeNormal) ||
            nativeNormal.lengthSquared() <= NATIVE_DISTANCE_TOLERANCE_METERS_V1 ** 2)) {
          queryUnavailable();
        }
        const normal = nativeNormal === null || nativeNormal === undefined
          ? undefined
          : nativeNormal.normalize();
        const candidate: RayFanHitV1 = {
          rawDistanceMeters: hit.distance,
          rayIndex,
          hitEntityId,
          ...(normal === undefined ? {} : { normal }),
        };
        if (closest === undefined ||
          candidate.rawDistanceMeters < closest.rawDistanceMeters - NATIVE_DISTANCE_TOLERANCE_METERS_V1 ||
          (Math.abs(candidate.rawDistanceMeters - closest.rawDistanceMeters) <=
              NATIVE_DISTANCE_TOLERANCE_METERS_V1 && candidate.rayIndex < closest.rayIndex)) {
          closest = candidate;
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("3C_CAMERA_QUERY_UNAVAILABLE")) {
        throw error;
      }
      return queryUnavailable();
    }
    if (closest === undefined) {
      const result = parseCameraCollisionQueryResultV1({
        schemaVersion: 1,
        quality: "ray-fan-approximation",
        hit: false,
      }, request);
      this.latestResult = result;
      this.latestAttemptFailed = false;
      return result;
    }
    const safeDistanceMeters = Math.max(
      0,
      closest.rawDistanceMeters - request.radiusMeters,
    );
    const safePosition = from.add(direction.scale(safeDistanceMeters));
    try {
      const result = parseCameraCollisionQueryResultV1({
        schemaVersion: 1,
        quality: "ray-fan-approximation",
        hit: true,
        distanceMeters: safeDistanceMeters,
        positionMetersXYZ: [
          canonicalNumber(safePosition.x),
          canonicalNumber(safePosition.y),
          canonicalNumber(safePosition.z),
        ],
        ...(closest.normal === undefined ? {} : {
          normalXYZ: [
            canonicalNumber(closest.normal.x),
            canonicalNumber(closest.normal.y),
            canonicalNumber(closest.normal.z),
          ],
        }),
        hitEntityId: closest.hitEntityId,
      }, request);
      this.latestResult = result;
      this.latestAttemptFailed = false;
      return result;
    } catch {
      return queryUnavailable();
    }
  }

  reset(): void {
    if (this.disposed) return;
    this.latestCommittedTick = undefined;
    this.latestRequestIdentity = undefined;
    this.latestResult = undefined;
    this.latestAttemptFailed = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.latestCommittedTick = undefined;
    this.latestRequestIdentity = undefined;
    this.latestResult = undefined;
    this.latestAttemptFailed = false;
  }
}
