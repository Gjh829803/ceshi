import type {
  Aabb,
  Diagnostic,
  SpawnFootprintBoundary,
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

function intervalsStrictlyOverlap(
  leftMinimum: number,
  leftMaximum: number,
  rightMinimum: number,
  rightMaximum: number,
): boolean {
  return leftMinimum < rightMaximum - EPSILON &&
    leftMaximum > rightMinimum + EPSILON;
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

function pointOnSegment(
  point: readonly [number, number],
  from: readonly [number, number],
  to: readonly [number, number],
): boolean {
  const edgeX = to[0] - from[0];
  const edgeZ = to[1] - from[1];
  const pointX = point[0] - from[0];
  const pointZ = point[1] - from[1];
  const cross = edgeX * pointZ - edgeZ * pointX;
  if (Math.abs(cross) > EPSILON) return false;
  const dot = pointX * edgeX + pointZ * edgeZ;
  return dot >= -EPSILON && dot <= edgeX * edgeX + edgeZ * edgeZ + EPSILON;
}

function footprintContains(
  boundary: SpawnFootprintBoundary,
  point: readonly [number, number],
): boolean {
  if (boundary.kind === "circle") {
    return Math.hypot(
      point[0] - boundary.centerMetersXZ[0],
      point[1] - boundary.centerMetersXZ[1],
    ) <= boundary.radiusMeters + EPSILON;
  }
  if (boundary.kind === "ellipse") {
    const x = (point[0] - boundary.centerMetersXZ[0]) / boundary.radiusMetersXZ[0];
    const z = (point[1] - boundary.centerMetersXZ[1]) / boundary.radiusMetersXZ[1];
    return x * x + z * z <= 1 + EPSILON;
  }
  let inside = false;
  for (
    let current = 0, previous = boundary.pointsMetersXZ.length - 1;
    current < boundary.pointsMetersXZ.length;
    previous = current, current += 1
  ) {
    const from = boundary.pointsMetersXZ[previous];
    const to = boundary.pointsMetersXZ[current];
    if (from === undefined || to === undefined) continue;
    if (pointOnSegment(point, from, to)) return true;
    const crosses =
      (to[1] > point[1]) !== (from[1] > point[1]) &&
      point[0] <
        ((from[0] - to[0]) * (point[1] - to[1])) / (from[1] - to[1]) + to[0];
    if (crosses) inside = !inside;
  }
  return inside;
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

  const positionXZ = [input.position[0], input.position[2]] as const;
  for (const water of input.waterSurfaces ?? []) {
    const subjectMinimum = input.position[1];
    const subjectMaximum = input.position[1] + height;
    const waterMinimum = water.waterLevelMeters - water.depthMeters;
    if (
      water.traversalMode !== "blocked" ||
      !footprintContains(water.boundary, positionXZ) ||
      !intervalsStrictlyOverlap(
        subjectMinimum,
        subjectMaximum,
        waterMinimum,
        water.waterLevelMeters,
      )
    ) continue;
    diagnostics.push({
      severity: "error",
      code: "SPAWN_IN_BLOCKED_WATER",
      message: `Spawn ${input.entityId} is inside blocked water ${water.entityId}.`,
      entityId: input.entityId,
      ...(water.featureId === undefined ? {} : { featureId: water.featureId }),
      suggestions: [
        "Move the spawn outside blocked water or mark an intentionally walkable surface as walkable.",
      ],
    });
  }

  for (const blocker of input.staticBlockingObjects ?? []) {
    if (!footprintContains(blocker.footprint, positionXZ)) continue;
    if (blocker.heightRangeMeters !== undefined) {
      const [minimum, maximum] = blocker.heightRangeMeters;
      const subjectMinimum = input.position[1];
      const subjectMaximum = input.position[1] + height;
      if (!intervalsStrictlyOverlap(
        subjectMinimum,
        subjectMaximum,
        minimum,
        maximum,
      )) continue;
    }
    diagnostics.push({
      severity: "error",
      code: "SPAWN_INSIDE_STATIC_BLOCKER",
      message: `Spawn ${input.entityId} is inside static blocking object ${blocker.entityId}.`,
      entityId: input.entityId,
      ...(blocker.featureId === undefined ? {} : { featureId: blocker.featureId }),
      suggestions: ["Move the spawn outside the blocking object's footprint."],
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
