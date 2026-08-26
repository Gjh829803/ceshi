import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  PhysicsWorldPositionMetersXYZV1,
  PhysicsWorldQueryPortV1,
  SphereSweepHitV1,
  SphereSweepRequestV1,
} from "@whitebox-world/runtime-framework";

function vectorFrom(value: PhysicsWorldPositionMetersXYZV1): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function frozenPosition(value: Vector3): PhysicsWorldPositionMetersXYZV1 {
  return Object.freeze([value.x, value.y, value.z]) as PhysicsWorldPositionMetersXYZV1;
}

function entityIdFromBody(body: PhysicsBody | undefined): string | undefined {
  const entityId = body?.transformNode.metadata?.worldkitEntityId;
  return typeof entityId === "string" && entityId.length > 0 ? entityId : undefined;
}

function requireFiniteSweepRequest(request: SphereSweepRequestV1): void {
  if (!Number.isFinite(request.probeRadiusMeters) || request.probeRadiusMeters < 0) {
    throw new RangeError("SPHERE_SWEEP_PROBE_RADIUS_INVALID");
  }
  if (![...request.startPositionMetersXYZ, ...request.endPositionMetersXYZ].every(Number.isFinite)) {
    throw new RangeError("SPHERE_SWEEP_POSITION_INVALID");
  }
}

/**
 * Babylon/Havok implementation of the framework collision-query port.
 *
 * Babylon's PhysicsEngine facade exposes only ray casts. The concrete
 * HavokPlugin in the installed Babylon version exposes `shapeCast`, so this
 * adapter keeps that provider-specific capability out of SpringArmComponent.
 */
export class BabylonHavokPhysicsWorldQueryV1 implements PhysicsWorldQueryPortV1 {
  private readonly bodiesByEntityId = new Map<string, PhysicsBody>();
  private readonly sphereShapesByRadiusMeters = new Map<number, PhysicsShapeSphere>();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly havokPlugin: HavokPlugin,
  ) {}

  registerEntityPhysicsBody(entityId: string, body: PhysicsBody): void {
    if (this.disposed) throw new Error("PHYSICS_WORLD_QUERY_DISPOSED");
    if (entityId.trim().length === 0) {
      throw new TypeError("PHYSICS_WORLD_QUERY_ENTITY_ID_INVALID");
    }
    if (this.bodiesByEntityId.has(entityId)) {
      throw new Error(`PHYSICS_WORLD_QUERY_ENTITY_DUPLICATE: ${entityId}`);
    }
    this.bodiesByEntityId.set(entityId, body);
  }

  sweepSphere(request: SphereSweepRequestV1): SphereSweepHitV1 | undefined {
    if (this.disposed) throw new Error("PHYSICS_WORLD_QUERY_DISPOSED");
    requireFiniteSweepRequest(request);
    const start = vectorFrom(request.startPositionMetersXYZ);
    const end = vectorFrom(request.endPositionMetersXYZ);
    const distanceMeters = Vector3.Distance(start, end);
    if (distanceMeters <= 0.000001) return undefined;
    const ignoreBody = request.ignoredEntityId === undefined
      ? undefined
      : this.bodiesByEntityId.get(request.ignoredEntityId);
    if (request.probeRadiusMeters === 0) {
      return this.raycast(start, end, distanceMeters, ignoreBody);
    }

    const inputShapeResult = new ShapeCastResult();
    const hitShapeResult = new ShapeCastResult();
    this.havokPlugin.shapeCast(
      {
        shape: this.sphereShape(request.probeRadiusMeters),
        rotation: Quaternion.Identity(),
        startPosition: start,
        endPosition: end,
        shouldHitTriggers: false,
        ...(ignoreBody === undefined ? {} : { ignoreBody }),
      },
      inputShapeResult,
      hitShapeResult,
    );
    if (!hitShapeResult.hasHit || !Number.isFinite(hitShapeResult.hitFraction)) return undefined;
    const travelFraction = Math.max(0, Math.min(1, hitShapeResult.hitFraction));
    const hitEntityId = entityIdFromBody(hitShapeResult.body);
    return Object.freeze({
      travelDistanceMeters: distanceMeters * travelFraction,
      travelFraction,
      hitPositionMetersXYZ: frozenPosition(hitShapeResult.hitPoint),
      ...(hitEntityId === undefined
        ? {}
        : { hitEntityId }),
    });
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
    this.bodiesByEntityId.clear();
    if (failures.length > 0) {
      throw new AggregateError(failures, "PHYSICS_WORLD_QUERY_DISPOSAL_FAILED");
    }
  }

  private raycast(
    start: Vector3,
    end: Vector3,
    distanceMeters: number,
    ignoreBody: PhysicsBody | undefined,
  ): SphereSweepHitV1 | undefined {
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) throw new Error("WORLDKIT_HAVOK_ENGINE_MISSING");
    const hit = physicsEngine.raycast(start, end, {
      shouldHitTriggers: false,
      ...(ignoreBody === undefined ? {} : { ignoreBody }),
    });
    if (!hit.hasHit || !Number.isFinite(hit.hitDistance)) return undefined;
    const travelDistanceMeters = Math.max(0, Math.min(distanceMeters, hit.hitDistance));
    const hitEntityId = entityIdFromBody(hit.body);
    return Object.freeze({
      travelDistanceMeters,
      travelFraction: travelDistanceMeters / distanceMeters,
      hitPositionMetersXYZ: frozenPosition(hit.hitPointWorld),
      ...(hitEntityId === undefined
        ? {}
        : { hitEntityId }),
    });
  }

  private sphereShape(radiusMeters: number): PhysicsShapeSphere {
    const cached = this.sphereShapesByRadiusMeters.get(radiusMeters);
    if (cached !== undefined) return cached;
    const created = new PhysicsShapeSphere(Vector3.Zero(), radiusMeters, this.scene);
    this.sphereShapesByRadiusMeters.set(radiusMeters, created);
    return created;
  }
}
