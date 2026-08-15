import type {
  Aabb,
  Diagnostic,
  SpawnSafetyInput,
  Vec3Tuple,
} from "./types.js";
import { DEFAULT_HUMANOID_TRAVERSAL } from "@whitebox-world/contracts";

const DEFAULT_RADIUS = 0.35;
const DEFAULT_HEIGHT = 1.8;
const EPSILON = 1e-5;

function isFiniteVector(value: Vec3Tuple): boolean {
  return value.every(Number.isFinite);
}

function isInsideBounds(point: Vec3Tuple, bounds: Aabb): boolean {
  return point.every(
    (axis, index) => axis >= bounds.min[index]! && axis <= bounds.max[index]!,
  );
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] < b.max[0] - EPSILON &&
    a.max[0] > b.min[0] + EPSILON &&
    a.min[1] < b.max[1] - EPSILON &&
    a.max[1] > b.min[1] + EPSILON &&
    a.min[2] < b.max[2] - EPSILON &&
    a.max[2] > b.min[2] + EPSILON
  );
}

function playerBounds(
  position: Vec3Tuple,
  radius: number,
  height: number,
): Aabb {
  return {
    min: [position[0] - radius, position[1], position[2] - radius],
    max: [position[0] + radius, position[1] + height, position[2] + radius],
  };
}

export function validateSpawnSafety(input: SpawnSafetyInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const radius = input.capsule?.radius ?? DEFAULT_RADIUS;
  const height = input.capsule?.height ?? DEFAULT_HEIGHT;

  if (!isFiniteVector(input.position) || !Number.isFinite(radius) || !Number.isFinite(height)) {
    return [
      {
        severity: "error",
        code: "SPAWN_NOT_FINITE",
        message: `Spawn ${input.entityId} contains a non-finite position or capsule dimension.`,
        entityId: input.entityId,
      },
    ];
  }

  if (radius <= 0 || height <= 0) {
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INVALID_CAPSULE",
      message: `Spawn ${input.entityId} requires positive capsule dimensions.`,
      entityId: input.entityId,
      suggestions: ["Use the humanoid SubjectKit default capsule dimensions."],
    });
    return diagnostics;
  }

  if (input.worldBounds !== undefined) {
    const head: Vec3Tuple = [
      input.position[0],
      input.position[1] + height,
      input.position[2],
    ];
    if (!isInsideBounds(input.position, input.worldBounds) || !isInsideBounds(head, input.worldBounds)) {
      diagnostics.push({
        severity: "error",
        code: "SPAWN_OUTSIDE_WORLD",
        message: `Spawn ${input.entityId} is outside the configured world bounds.`,
        entityId: input.entityId,
        suggestions: ["Move the spawn point inside the playable bounds."],
      });
    }
  }

  const bounds = playerBounds(input.position, radius, height);
  for (const collider of input.colliders ?? []) {
    if (collider.isTrigger === true || !overlaps(bounds, collider.bounds)) continue;
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INTERSECTS_COLLIDER",
      message: `Spawn ${input.entityId} intersects collider${collider.entityId === undefined ? "" : ` ${collider.entityId}`}.`,
      entityId: input.entityId,
      ...(collider.featureId === undefined
        ? {}
        : { featureId: collider.featureId }),
      suggestions: ["Move the spawn point or resize the blocking collider."],
    });
  }

  if (input.ground !== undefined) {
    const groundHeight = input.ground.heightAt(input.position[0], input.position[2]);
    const tolerance = input.ground.tolerance ?? 0.15;
    const maxDrop = input.ground.maxDrop ?? 1;
    if (groundHeight === undefined || !Number.isFinite(groundHeight)) {
      diagnostics.push({
        severity: "error",
        code: "SPAWN_HAS_NO_GROUND",
        message: `Spawn ${input.entityId} has no finite ground sample beneath it.`,
        entityId: input.entityId,
        suggestions: ["Choose a spawn point on generated terrain."],
      });
    } else {
      const offset = input.position[1] - groundHeight;
      if (offset < -tolerance) {
        diagnostics.push({
          severity: "error",
          code: "SPAWN_BELOW_GROUND",
          message: `Spawn ${input.entityId} is ${Math.abs(offset).toFixed(2)}m below the terrain.`,
          entityId: input.entityId,
          suggestions: ["Snap the spawn feet position to terrain height."],
        });
      } else if (offset > maxDrop) {
        diagnostics.push({
          severity: "warning",
          code: "SPAWN_ABOVE_GROUND",
          message: `Spawn ${input.entityId} is ${offset.toFixed(2)}m above the terrain.`,
          entityId: input.entityId,
          suggestions: ["Snap the spawn feet position to terrain height unless an intentional drop is desired."],
        });
      }
      const slope = input.ground.slopeDegreesAt?.(
        input.position[0],
        input.position[2],
      );
      const maxWalkableSlope = input.ground.maxWalkableSlopeDegrees ??
        DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees;
      if (
        slope !== undefined &&
        Number.isFinite(slope) &&
        slope > maxWalkableSlope
      ) {
        diagnostics.push({
          severity: "error",
          code: "SPAWN_SLOPE_NOT_WALKABLE",
          message: `Spawn ${input.entityId} is on a ${slope.toFixed(1)}° slope, above the ${maxWalkableSlope}° climb limit.`,
          entityId: input.entityId,
          suggestions: ["Flatten and smooth the spawn area or choose another point."],
        });
      }
    }
  }

  return diagnostics;
}
