import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ProximityCastResult } from "@babylonjs/core/Physics/proximityCastResult.js";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  parseCameraGeometryHitV2,
  parseCameraGeometryQueryRequestV2,
  type CameraGeometryHitV2,
  type CameraGeometryQueryCapabilityV2,
  type CameraGeometryQueryPortV2,
  type CameraGeometryQueryRequestV2,
} from "@whitebox-world/camera";

const QUERY_DISTANCE_TOLERANCE_METERS_V2 = 1e-6;

const HAVOK_CAMERA_GEOMETRY_CAPABILITY_V2 = Object.freeze({
  shape: "sphere",
  maximumHitCount: 1,
  maximumExcludedEntityCount: 1,
  reportsContactNormal: true,
  reportsStartOverlap: true,
  penetrationDepth: "exact-or-zero",
}) satisfies CameraGeometryQueryCapabilityV2;

function queryUnavailable(): never {
  throw new Error(
    "3C_CAMERA_QUERY_UNAVAILABLE: Babylon/Havok camera geometry query failed closed.",
  );
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function frozenPosition(value: Vector3): readonly [number, number, number] {
  return Object.freeze([
    canonicalNumber(value.x),
    canonicalNumber(value.y),
    canonicalNumber(value.z),
  ]);
}

function entityIdFromBody(body: PhysicsBody | undefined): string | undefined {
  const entityId = body?.transformNode.metadata?.worldkitEntityId;
  return typeof entityId === "string" && entityId.length > 0 ? entityId : undefined;
}

function normalizedHitNormal(value: Vector3): readonly [number, number, number] {
  if (![value.x, value.y, value.z].every(Number.isFinite) ||
    value.lengthSquared() <= QUERY_DISTANCE_TOLERANCE_METERS_V2 ** 2) {
    return queryUnavailable();
  }
  return frozenPosition(value.normalize());
}

/**
 * Exact Babylon 9.23.0 / Havok 1.3.14 Camera sphere-query adapter.
 *
 * The locked public Babylon adapter exposes one ignored body and the closest
 * shape-cast result. The capability object intentionally reports those limits;
 * callers must never infer multi-hit or multi-body exclusion support.
 */
export class BabylonHavokCameraGeometryQueryV2 implements CameraGeometryQueryPortV2 {
  readonly capability = HAVOK_CAMERA_GEOMETRY_CAPABILITY_V2;

  private readonly bodiesByEntityId = new Map<string, PhysicsBody>();
  private readonly disabledEntityIds = new Set<string>();
  private readonly sphereShapesByRadiusMeters = new Map<number, PhysicsShapeSphere>();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly havokPlugin: HavokPlugin,
  ) {}

  registerEntityPhysicsBody(entityId: string, body: PhysicsBody): void {
    if (this.disposed) throw new Error("CAMERA_GEOMETRY_QUERY_DISPOSED");
    if (entityId.trim().length === 0) {
      throw new TypeError("CAMERA_GEOMETRY_QUERY_ENTITY_ID_INVALID");
    }
    if (this.bodiesByEntityId.has(entityId)) {
      throw new Error(`CAMERA_GEOMETRY_QUERY_ENTITY_DUPLICATE: ${entityId}`);
    }
    this.bodiesByEntityId.set(entityId, body);
  }

  setEntityQueryEnabled(entityId: string, enabled: boolean): void {
    if (this.disposed) throw new Error("CAMERA_GEOMETRY_QUERY_DISPOSED");
    if (!this.bodiesByEntityId.has(entityId)) {
      throw new Error(`CAMERA_GEOMETRY_QUERY_ENTITY_UNKNOWN: ${entityId}`);
    }
    if (enabled) this.disabledEntityIds.delete(entityId);
    else this.disabledEntityIds.add(entityId);
  }

  query(input: CameraGeometryQueryRequestV2): CameraGeometryHitV2 | undefined {
    if (this.disposed) throw new Error("CAMERA_GEOMETRY_QUERY_DISPOSED");
    let request: CameraGeometryQueryRequestV2;
    try {
      request = parseCameraGeometryQueryRequestV2(input);
    } catch {
      return queryUnavailable();
    }
    if (request.excludedEntityIds.length > this.capability.maximumExcludedEntityCount) {
      return queryUnavailable();
    }
    const ignoredBody = request.excludedEntityIds.length === 0
      ? undefined
      : this.bodiesByEntityId.get(request.excludedEntityIds[0]!);
    if (request.excludedEntityIds.length === 1 && ignoredBody === undefined) {
      return queryUnavailable();
    }

    try {
      const originalStart = new Vector3(...request.startPositionMetersXYZ);
      const end = new Vector3(...request.endPositionMetersXYZ);
      const originalArmLengthMeters = Vector3.Distance(originalStart, end);
      // A mounted Subject can own more than the one body supported by Havok's
      // public ignoreBody option. Mask the Host-selected extra members only for
      // this synchronous query and always restore them; moving the sweep start
      // beyond their bounds would also skip unrelated camera-hard geometry.
      const disabledShapeFilters = [...this.disabledEntityIds]
        .map((entityId) => this.bodiesByEntityId.get(entityId)!)
        .filter((body) => body !== ignoredBody)
        .map((body) => {
          const shape = body.shape;
          if (shape === null) return queryUnavailable();
          return {
            shape,
            membershipMask: shape.filterMembershipMask,
            collideMask: shape.filterCollideMask,
          };
        });
      try {
        for (const { shape } of disabledShapeFilters) {
          shape.filterMembershipMask = 0;
          shape.filterCollideMask = 0;
        }
        const probeShape = this.sphereShape(request.radiusMeters);
        const overlapInputResult = new ProximityCastResult();
        const overlapHitResult = new ProximityCastResult();
        this.havokPlugin.shapeProximity(
          {
            shape: probeShape,
            position: originalStart,
            rotation: Quaternion.Identity(),
            maxDistance: 0,
            shouldHitTriggers: false,
            ...(ignoredBody === undefined ? {} : { ignoreBody: ignoredBody }),
          },
          overlapInputResult,
          overlapHitResult,
        );
        if (overlapHitResult.hasHit) {
          const hitEntityId = entityIdFromBody(overlapHitResult.body);
          return parseCameraGeometryHitV2({
            schemaVersion: 2,
            travelDistanceMeters: 0,
            travelFraction: 0,
            hitPointMetersXYZ: frozenPosition(overlapHitResult.hitPoint),
            hitNormalXYZ: normalizedHitNormal(overlapHitResult.hitNormal),
            ...(hitEntityId === undefined ? {} : { hitEntityId }),
            startedOverlapping: true,
            penetrationDepthMeters: canonicalNumber(
              Math.max(0, -overlapHitResult.hitDistance),
            ),
            obstructionClass: "hard",
          }, request);
        }

        if (originalArmLengthMeters <= QUERY_DISTANCE_TOLERANCE_METERS_V2) {
          return undefined;
        }
        const inputShapeResult = new ShapeCastResult();
        const hitShapeResult = new ShapeCastResult();
        this.havokPlugin.shapeCast(
          {
            shape: probeShape,
            rotation: Quaternion.Identity(),
            startPosition: originalStart,
            endPosition: end,
            shouldHitTriggers: false,
            ...(ignoredBody === undefined ? {} : { ignoreBody: ignoredBody }),
          },
          inputShapeResult,
          hitShapeResult,
        );
        if (
          !hitShapeResult.hasHit ||
          !Number.isFinite(hitShapeResult.hitFraction)
        ) {
          return undefined;
        }
        const localTravelFraction = Math.max(
          0,
          Math.min(1, hitShapeResult.hitFraction),
        );
        const travelFraction = canonicalNumber(localTravelFraction);
        const hitEntityId = entityIdFromBody(hitShapeResult.body);
        return parseCameraGeometryHitV2({
          schemaVersion: 2,
          travelDistanceMeters: canonicalNumber(
            originalArmLengthMeters * travelFraction,
          ),
          travelFraction,
          hitPointMetersXYZ: frozenPosition(hitShapeResult.hitPoint),
          hitNormalXYZ: normalizedHitNormal(hitShapeResult.hitNormal),
          ...(hitEntityId === undefined ? {} : { hitEntityId }),
          startedOverlapping: false,
          penetrationDepthMeters: 0,
          obstructionClass: "hard",
        }, request);
      } finally {
        const restorationFailures: unknown[] = [];
        for (
          const { shape, membershipMask, collideMask } of disabledShapeFilters
        ) {
          try {
            shape.filterMembershipMask = membershipMask;
            shape.filterCollideMask = collideMask;
          } catch (error) {
            restorationFailures.push(error);
          }
        }
        if (restorationFailures.length > 0) {
          throw new AggregateError(
            restorationFailures,
            "CAMERA_GEOMETRY_QUERY_FILTER_RESTORE_FAILED",
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && (
        error.message.startsWith("3C_CAMERA_QUERY_UNAVAILABLE") ||
        error.message.startsWith("CAMERA_GEOMETRY_QUERY_")
      )) throw error;
      return queryUnavailable();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const failures: unknown[] = [];
    for (const shape of this.sphereShapesByRadiusMeters.values()) {
      try {
        shape.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.sphereShapesByRadiusMeters.clear();
    this.disabledEntityIds.clear();
    this.bodiesByEntityId.clear();
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "CAMERA_GEOMETRY_QUERY_DISPOSAL_FAILED",
      );
    }
  }

  private sphereShape(radiusMeters: number): PhysicsShapeSphere {
    const cached = this.sphereShapesByRadiusMeters.get(radiusMeters);
    if (cached !== undefined) return cached;
    const created = new PhysicsShapeSphere(Vector3.Zero(), radiusMeters, this.scene);
    this.sphereShapesByRadiusMeters.set(radiusMeters, created);
    return created;
  }
}
