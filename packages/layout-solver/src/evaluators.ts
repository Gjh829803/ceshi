import { queryLockedColliderSupportHeightMeters } from "@whitebox-world/terrain-surface";

import {
  aabbOverlapDepthMetersXYZ,
  aabbSeparationMeters,
  pointInPolygonXZ,
  pointToPolygonBoundaryDistanceMeters,
  projectToScreenUv,
  quantizeFinite,
  sampleHeightfieldV1,
  sampleRoutePolylineV1,
} from "./geometry.js";
import type {
  ConstraintEvaluationV1,
  LayoutAabbV1,
  LayoutCandidateV1,
  LayoutConstraintEvaluationContextV1,
  LayoutFixedCameraV1,
  LayoutVec2V1,
  LayoutVec3V1,
  PlacementConstraintViolationCodeV1,
  ResolvedPlacementConstraintV1,
} from "./types.js";

type Assignments = Readonly<Record<string, LayoutCandidateV1>>;

function resolveCamera(
  camera: LayoutConstraintEvaluationContextV1["geometry"]["camerasByEntityId"][string],
  assignments: Assignments,
): Readonly<{
  camera: LayoutFixedCameraV1;
  targetAnchorEntityId?: string;
}> | undefined {
  if (camera.kind === "fixed") return { camera };
  const targetAnchor = assignments[camera.targetAnchorEntityId];
  if (targetAnchor === undefined) return undefined;
  const target: LayoutVec3V1 = [
    targetAnchor.transform.positionMetersXYZ[0],
    targetAnchor.transform.positionMetersXYZ[1] + camera.targetHeightMeters,
    targetAnchor.transform.positionMetersXYZ[2],
  ];
  const horizontalDistance = Math.cos(camera.pitchRadians) * camera.distanceMeters;
  return {
    camera: {
      kind: "fixed",
      cameraEntityId: camera.cameraEntityId,
      positionMetersXYZ: [
        target[0],
        target[1] + Math.sin(camera.pitchRadians) * camera.distanceMeters,
        target[2] + horizontalDistance,
      ],
      targetMetersXYZ: target,
      verticalFovDegrees: camera.verticalFovDegrees,
      aspectRatio: camera.aspectRatio,
      nearClipMeters: camera.nearClipMeters,
      farClipMeters: camera.farClipMeters,
    },
    targetAnchorEntityId: camera.targetAnchorEntityId,
  };
}

function hasNonFinite(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasNonFinite);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasNonFinite);
  }
  return false;
}

function result(
  constraint: ResolvedPlacementConstraintV1,
  satisfied: boolean,
  measurements: ConstraintEvaluationV1["measurements"],
  tolerances: ConstraintEvaluationV1["tolerances"],
  evidenceIds: readonly string[],
  violationCode?: PlacementConstraintViolationCodeV1,
): ConstraintEvaluationV1 {
  return {
    constraintId: constraint.id,
    kind: constraint.kind,
    requirement: constraint.requirement,
    satisfied,
    preferenceCostRatio:
      constraint.requirement === "preferred" && !satisfied ? 1 : 0,
    measurements,
    tolerances,
    evidenceIds: [...evidenceIds].sort((left, right) => left.localeCompare(right)),
    ...(violationCode === undefined ? {} : { violationCode }),
  };
}

function missing(constraint: ResolvedPlacementConstraintV1, evidenceIds: readonly string[]): ConstraintEvaluationV1 {
  return result(
    constraint,
    false,
    {},
    {},
    evidenceIds,
    "PLACEMENT_REFERENCE_NOT_FOUND",
  );
}

function nonFinite(constraint: ResolvedPlacementConstraintV1): ConstraintEvaluationV1 {
  return result(
    constraint,
    false,
    {},
    {},
    [],
    "PLACEMENT_NON_FINITE_MEASUREMENT",
  );
}

function footprintCorners(bounds: LayoutAabbV1): readonly LayoutVec2V1[] {
  return [
    [bounds.minimumMetersXYZ[0], bounds.minimumMetersXYZ[2]],
    [bounds.maximumMetersXYZ[0], bounds.minimumMetersXYZ[2]],
    [bounds.maximumMetersXYZ[0], bounds.maximumMetersXYZ[2]],
    [bounds.minimumMetersXYZ[0], bounds.maximumMetersXYZ[2]],
  ];
}

function pointInsideFootprint(point: LayoutVec2V1, bounds: LayoutAabbV1): boolean {
  return point[0] >= bounds.minimumMetersXYZ[0] &&
    point[0] <= bounds.maximumMetersXYZ[0] &&
    point[1] >= bounds.minimumMetersXYZ[2] &&
    point[1] <= bounds.maximumMetersXYZ[2];
}

function orientation(a: LayoutVec2V1, b: LayoutVec2V1, c: LayoutVec2V1): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a: LayoutVec2V1, b: LayoutVec2V1, c: LayoutVec2V1, d: LayoutVec2V1): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  const onSegment = (start: LayoutVec2V1, point: LayoutVec2V1, end: LayoutVec2V1) =>
    point[0] >= Math.min(start[0], end[0]) - 1e-9 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-9 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-9 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-9;
  if (Math.abs(first) <= 1e-9 && onSegment(a, c, b)) return true;
  if (Math.abs(second) <= 1e-9 && onSegment(a, d, b)) return true;
  if (Math.abs(third) <= 1e-9 && onSegment(c, a, d)) return true;
  if (Math.abs(fourth) <= 1e-9 && onSegment(c, b, d)) return true;
  return (first > 0) !== (second > 0) && (third > 0) !== (fourth > 0);
}

function footprintIntersectsPolygon(bounds: LayoutAabbV1, polygon: readonly LayoutVec2V1[]): boolean {
  const corners = footprintCorners(bounds);
  if (corners.some((corner) => pointInPolygonXZ(corner, polygon))) return true;
  if (polygon.some((point) => pointInsideFootprint(point, bounds))) return true;
  for (let left = 0; left < corners.length; left += 1) {
    for (let right = 0; right < polygon.length; right += 1) {
      if (segmentsIntersect(
        corners[left]!,
        corners[(left + 1) % corners.length]!,
        polygon[right]!,
        polygon[(right + 1) % polygon.length]!,
      )) return true;
    }
  }
  return false;
}

function distancePointToAabbFootprint(point: LayoutVec2V1, bounds: LayoutAabbV1): number {
  const dx = Math.max(
    0,
    bounds.minimumMetersXYZ[0] - point[0],
    point[0] - bounds.maximumMetersXYZ[0],
  );
  const dz = Math.max(
    0,
    bounds.minimumMetersXYZ[2] - point[1],
    point[1] - bounds.maximumMetersXYZ[2],
  );
  return Math.hypot(dx, dz);
}

function evaluateInside(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "inside-region" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const assignment = assignments[constraint.entityId];
  const region = context.regionsById[constraint.regionId];
  if (assignment === undefined || region === undefined) return missing(constraint, [constraint.entityId, constraint.regionId]);
  const corners = footprintCorners(assignment.bounds);
  const isInside = corners.every((corner) => pointInPolygonXZ(corner, region.pointsMetersXZ));
  const minimumClearanceMeters = Math.min(
    ...corners.map((corner) => pointToPolygonBoundaryDistanceMeters(corner, region.pointsMetersXZ)),
  );
  const satisfied = isInside &&
    minimumClearanceMeters + context.profile.tolerances.distanceMeters >= constraint.boundaryClearanceMeters;
  return result(
    constraint,
    satisfied,
    {
      isInside,
      minimumBoundaryClearanceMeters: quantizeFinite(minimumClearanceMeters, context.profile.quantization.positionStepMeters),
    },
    { distanceMeters: context.profile.tolerances.distanceMeters },
    [constraint.entityId, constraint.regionId],
    satisfied ? undefined : "PLACEMENT_REGION_CONSTRAINT_UNSATISFIED",
  );
}

function evaluateOutside(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "outside-region" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const assignment = assignments[constraint.entityId];
  const region = context.regionsById[constraint.regionId];
  if (assignment === undefined || region === undefined) return missing(constraint, [constraint.entityId, constraint.regionId]);
  const intersects = footprintIntersectsPolygon(assignment.bounds, region.pointsMetersXZ);
  const clearanceMeters = intersects ? 0 : Math.min(
    ...footprintCorners(assignment.bounds).map((corner) =>
      pointToPolygonBoundaryDistanceMeters(corner, region.pointsMetersXZ)
    ),
    ...region.pointsMetersXZ.map((point) => distancePointToAabbFootprint(point, assignment.bounds)),
  );
  const satisfied = !intersects &&
    clearanceMeters + context.profile.tolerances.distanceMeters >= constraint.boundaryClearanceMeters;
  return result(
    constraint,
    satisfied,
    {
      intersectsRegion: intersects,
      minimumBoundaryClearanceMeters: quantizeFinite(clearanceMeters, context.profile.quantization.positionStepMeters),
    },
    { distanceMeters: context.profile.tolerances.distanceMeters },
    [constraint.entityId, constraint.regionId],
    satisfied ? undefined : "PLACEMENT_REGION_CONSTRAINT_UNSATISFIED",
  );
}

function distance(left: LayoutVec3V1, right: LayoutVec3V1): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function evaluateDistance(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "distance-range" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const entity = assignments[constraint.entityId];
  const reference = assignments[constraint.referenceEntityId];
  if (entity === undefined || reference === undefined) return missing(constraint, [constraint.entityId, constraint.referenceEntityId]);
  const distanceMeters = distance(entity.transform.positionMetersXYZ, reference.transform.positionMetersXYZ);
  const tolerance = context.profile.tolerances.distanceMeters;
  const satisfied = distanceMeters + tolerance >= constraint.minimumDistanceMeters &&
    distanceMeters - tolerance <= constraint.maximumDistanceMeters;
  return result(
    constraint,
    satisfied,
    { distanceMeters: quantizeFinite(distanceMeters, context.profile.quantization.positionStepMeters) },
    { distanceMeters: tolerance },
    [constraint.entityId, constraint.referenceEntityId],
    satisfied ? undefined : "PLACEMENT_DISTANCE_RANGE_UNSATISFIED",
  );
}

function evaluateFacing(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "faces-entity" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const facing = assignments[constraint.facingEntityId];
  const target = assignments[constraint.targetEntityId];
  if (facing === undefined || target === undefined) return missing(constraint, [constraint.facingEntityId, constraint.targetEntityId]);
  const yaw = facing.transform.rotationEulerRadiansXYZ[1];
  const forward: LayoutVec2V1 = [-Math.sin(yaw), -Math.cos(yaw)];
  const dx = target.transform.positionMetersXYZ[0] - facing.transform.positionMetersXYZ[0];
  const dz = target.transform.positionMetersXYZ[2] - facing.transform.positionMetersXYZ[2];
  const targetLength = Math.hypot(dx, dz);
  if (targetLength === 0) return missing(constraint, [constraint.facingEntityId, constraint.targetEntityId]);
  const cosine = Math.max(-1, Math.min(1, (forward[0] * dx + forward[1] * dz) / targetLength));
  const angleDegrees = Math.acos(cosine) * 180 / Math.PI;
  const satisfied = angleDegrees <=
    constraint.maximumAngularDeviationDegrees + context.profile.tolerances.angleDegrees;
  return result(
    constraint,
    satisfied,
    { angularDeviationDegrees: quantizeFinite(angleDegrees, context.profile.quantization.ratioStep) },
    { angleDegrees: context.profile.tolerances.angleDegrees },
    [constraint.facingEntityId, constraint.targetEntityId],
    satisfied ? undefined : "PLACEMENT_FACING_CONSTRAINT_UNSATISFIED",
  );
}

function supportSamples(bounds: LayoutAabbV1): readonly LayoutVec2V1[] {
  const corners = footprintCorners(bounds);
  return [
    [(bounds.minimumMetersXYZ[0] + bounds.maximumMetersXYZ[0]) / 2,
      (bounds.minimumMetersXYZ[2] + bounds.maximumMetersXYZ[2]) / 2],
    ...corners,
  ];
}

function evaluateSupport(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "supported-by" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const supported = assignments[constraint.supportedEntityId];
  if (supported === undefined) return missing(constraint, [constraint.supportedEntityId]);
  const terrain = context.geometry.heightfieldsByTerrainEntityId[constraint.supportingEntityId];
  const collider = context.geometry.collidersByEntityId?.[constraint.supportingEntityId];
  if (terrain === undefined && collider === undefined) {
    const supportingBounds = assignments[constraint.supportingEntityId]?.bounds ??
      context.geometry.staticBoundsByEntityId[constraint.supportingEntityId];
    if (supportingBounds === undefined) {
      return missing(constraint, [constraint.supportingEntityId]);
    }
    throw new Error(
      `OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED: Supporting entity "${constraint.supportingEntityId}" only exposes an AABB; object supported-by requires its locked collider.`,
    );
  }
  const bottom = supported.bounds.minimumMetersXYZ[1];
  const gaps: number[] = [];
  if (terrain !== undefined) {
    for (const point of supportSamples(supported.bounds)) {
      const sample = sampleHeightfieldV1(terrain, point);
      if (sample !== undefined) gaps.push(Math.abs(bottom - sample.heightMeters));
    }
  } else {
    for (const point of supportSamples(supported.bounds)) {
      const heightMeters = queryLockedColliderSupportHeightMeters(collider!, point);
      if (heightMeters !== undefined) gaps.push(Math.abs(bottom - heightMeters));
    }
  }
  const maximumGap = gaps.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...gaps);
  const supportRatio = gaps.filter((gap) =>
    gap <= constraint.maximumSupportGapMeters + context.profile.tolerances.supportGapMeters
  ).length / supportSamples(supported.bounds).length;
  if (!Number.isFinite(maximumGap)) return missing(constraint, [constraint.supportingEntityId]);
  const satisfied = maximumGap <= constraint.maximumSupportGapMeters + context.profile.tolerances.supportGapMeters &&
    supportRatio + context.profile.quantization.ratioStep >= constraint.minimumSupportRatio;
  return result(
    constraint,
    satisfied,
    { maximumSupportGapMeters: quantizeFinite(maximumGap, context.profile.quantization.positionStepMeters), supportRatio: quantizeFinite(supportRatio, context.profile.quantization.ratioStep) },
    { supportGapMeters: context.profile.tolerances.supportGapMeters },
    [constraint.supportedEntityId, constraint.supportingEntityId],
    satisfied ? undefined : "PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED",
  );
}

function evaluateClearance(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "minimum-clearance" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const entity = assignments[constraint.entityId];
  if (entity === undefined) return missing(constraint, [constraint.entityId]);
  const targetIds = constraint.otherEntityIds ?? Object.values(context.entitiesById)
    .filter((row) =>
      row.id !== constraint.entityId &&
      constraint.semanticClassIds?.includes(row.semanticClassId ?? "") === true
    )
    .map((row) => row.id);
  const targets = [...targetIds].sort((left, right) => left.localeCompare(right));
  if (targets.length === 0 || targets.some((id) => assignments[id] === undefined && context.geometry.staticBoundsByEntityId[id] === undefined)) {
    return missing(constraint, targets);
  }
  let minimumClearance = Number.POSITIVE_INFINITY;
  let hasOverlap = false;
  for (const targetId of targets) {
    const bounds = assignments[targetId]?.bounds ?? context.geometry.staticBoundsByEntityId[targetId]!;
    hasOverlap ||= aabbOverlapDepthMetersXYZ(entity.bounds, bounds) !== undefined;
    minimumClearance = Math.min(minimumClearance, aabbSeparationMeters(entity.bounds, bounds));
  }
  const satisfied = !hasOverlap &&
    minimumClearance + context.profile.tolerances.overlapMeters >= constraint.clearanceMeters;
  return result(
    constraint,
    satisfied,
    { hasOverlap, minimumClearanceMeters: quantizeFinite(minimumClearance, context.profile.quantization.positionStepMeters) },
    { overlapMeters: context.profile.tolerances.overlapMeters },
    [constraint.entityId, ...targets],
    satisfied ? undefined : "PLACEMENT_CLEARANCE_CONFLICT",
  );
}

function routeWidthSamples(
  points: readonly LayoutVec2V1[],
  widthMeters: number,
  spacingMeters: number,
): readonly LayoutVec2V1[] {
  const centerline = sampleRoutePolylineV1(points, spacingMeters);
  const result: LayoutVec2V1[] = [];
  centerline.forEach((point, index) => {
    const previous = centerline[Math.max(0, index - 1)]!;
    const next = centerline[Math.min(centerline.length - 1, index + 1)]!;
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz);
    const perpendicular: LayoutVec2V1 = length === 0 ? [0, 0] : [-dz / length, dx / length];
    for (const offset of [-widthMeters / 2, 0, widthMeters / 2]) {
      result.push([point[0] + perpendicular[0] * offset, point[1] + perpendicular[1] * offset]);
    }
  });
  return result;
}

function evaluateSlope(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "within-slope-limit" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const terrain = context.geometry.heightfieldsByTerrainEntityId[constraint.terrainEntityId];
  if (terrain === undefined) return missing(constraint, [constraint.terrainEntityId]);
  let points: readonly LayoutVec2V1[];
  let lateralCount = 1;
  const evidenceIds = [constraint.terrainEntityId];
  if (constraint.entityId !== undefined) {
    const entity = assignments[constraint.entityId];
    if (entity === undefined) return missing(constraint, [constraint.entityId]);
    points = supportSamples(entity.bounds);
    evidenceIds.push(constraint.entityId);
  } else {
    const route = context.routesById[constraint.routeId];
    if (route === undefined) return missing(constraint, [constraint.routeId]);
    points = routeWidthSamples(
      route.pointsMetersXZ,
      route.widthMeters,
      context.profile.candidateGeneration.routeSampleSpacingMeters,
    );
    lateralCount = 3;
    evidenceIds.push(constraint.routeId);
  }
  const samples = points.map((point) => sampleHeightfieldV1(terrain, point));
  if (samples.some((sample) => sample === undefined)) return missing(constraint, evidenceIds);
  const maximumSlopeDegrees = Math.max(...samples.map((sample) => sample!.slopeDegrees));
  const satisfied = maximumSlopeDegrees <=
    constraint.maximumSlopeDegrees + context.profile.tolerances.angleDegrees;
  return result(
    constraint,
    satisfied,
    { maximumSlopeDegrees: quantizeFinite(maximumSlopeDegrees, context.profile.quantization.ratioStep), sampledPointCount: points.length, sampledLateralOffsetCount: lateralCount },
    { angleDegrees: context.profile.tolerances.angleDegrees },
    evidenceIds,
    satisfied ? undefined : "PLACEMENT_SLOPE_LIMIT_EXCEEDED",
  );
}

function segmentIntersectsAabb(start: LayoutVec3V1, end: LayoutVec3V1, bounds: LayoutAabbV1): boolean {
  let minimum = 0;
  let maximum = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = end[axis]! - start[axis]!;
    if (Math.abs(delta) < 1e-9) {
      if (start[axis]! < bounds.minimumMetersXYZ[axis]! || start[axis]! > bounds.maximumMetersXYZ[axis]!) return false;
      continue;
    }
    const first = (bounds.minimumMetersXYZ[axis]! - start[axis]!) / delta;
    const second = (bounds.maximumMetersXYZ[axis]! - start[axis]!) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 0.001 && minimum < 0.999;
}

function isOccluded(
  context: LayoutConstraintEvaluationContextV1,
  assignments: Assignments,
  cameraPosition: LayoutVec3V1,
  targetPosition: LayoutVec3V1,
  ignoredEntityIds: readonly string[],
): boolean {
  for (const [entityId, assignment] of Object.entries(assignments)) {
    if (!ignoredEntityIds.includes(entityId) &&
      segmentIntersectsAabb(cameraPosition, targetPosition, assignment.bounds)) return true;
  }
  for (const [entityId, bounds] of Object.entries(context.geometry.staticBoundsByEntityId)) {
    if (!ignoredEntityIds.includes(entityId) && segmentIntersectsAabb(cameraPosition, targetPosition, bounds)) return true;
  }
  for (const heightfield of Object.values(context.geometry.heightfieldsByTerrainEntityId)) {
    for (let index = 1; index < 32; index += 1) {
      const ratio = index / 32;
      const point: LayoutVec3V1 = [
        cameraPosition[0] + (targetPosition[0] - cameraPosition[0]) * ratio,
        cameraPosition[1] + (targetPosition[1] - cameraPosition[1]) * ratio,
        cameraPosition[2] + (targetPosition[2] - cameraPosition[2]) * ratio,
      ];
      const sample = sampleHeightfieldV1(heightfield, [point[0], point[2]]);
      if (sample !== undefined && sample.heightMeters > point[1] + context.profile.tolerances.supportGapMeters) return true;
    }
  }
  return false;
}

function evaluateVisibility(
  context: LayoutConstraintEvaluationContextV1,
  constraint: Extract<ResolvedPlacementConstraintV1, { kind: "visible-in-camera-region" }>,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  const visible = assignments[constraint.visibleEntityId];
  const cameraQuery = context.geometry.camerasByEntityId[constraint.cameraEntityId];
  const screenRegion = context.screenRegionsById[constraint.screenRegionId];
  if (visible === undefined || cameraQuery === undefined || screenRegion === undefined) {
    return missing(constraint, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId]);
  }
  const resolvedCamera = resolveCamera(cameraQuery, assignments);
  if (resolvedCamera === undefined) {
    return missing(constraint, [
      constraint.visibleEntityId,
      constraint.cameraEntityId,
      constraint.screenRegionId,
      ...(cameraQuery.kind === "third-person" ? [cameraQuery.targetAnchorEntityId] : []),
    ]);
  }
  const camera = resolvedCamera.camera;
  const corners: LayoutVec3V1[] = [];
  for (const x of [visible.bounds.minimumMetersXYZ[0], visible.bounds.maximumMetersXYZ[0]]) {
    for (const y of [visible.bounds.minimumMetersXYZ[1], visible.bounds.maximumMetersXYZ[1]]) {
      for (const z of [visible.bounds.minimumMetersXYZ[2], visible.bounds.maximumMetersXYZ[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  const projected = corners.map((point) => projectToScreenUv(camera, point)).filter(
    (point): point is readonly [number, number] => point !== undefined,
  );
  if (projected.length === 0) {
    return result(constraint, false, { projectedAreaRatio: 0, visibleRatio: 0, isOccluded: false }, { ratio: context.profile.quantization.ratioStep }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL");
  }
  const minimumU = Math.min(...projected.map((point) => point[0]));
  const maximumU = Math.max(...projected.map((point) => point[0]));
  const minimumV = Math.min(...projected.map((point) => point[1]));
  const maximumV = Math.max(...projected.map((point) => point[1]));
  const projectedArea = Math.max(0, maximumU - minimumU) * Math.max(0, maximumV - minimumV);
  const intersectionArea = Math.max(0, Math.min(maximumU, screenRegion.maximumUv[0]) - Math.max(minimumU, screenRegion.minimumUv[0])) *
    Math.max(0, Math.min(maximumV, screenRegion.maximumUv[1]) - Math.max(minimumV, screenRegion.minimumUv[1]));
  const occluded = isOccluded(
    context,
    assignments,
    camera.positionMetersXYZ,
    visible.transform.positionMetersXYZ,
    [
      constraint.visibleEntityId,
      constraint.cameraEntityId,
      ...(resolvedCamera.targetAnchorEntityId === undefined
        ? []
        : [resolvedCamera.targetAnchorEntityId]),
    ],
  );
  const visibleRatio = occluded || projectedArea === 0 ? 0 : intersectionArea / projectedArea;
  const measurements = {
    projectedAreaRatio: quantizeFinite(projectedArea, context.profile.quantization.ratioStep),
    visibleRatio: quantizeFinite(visibleRatio, context.profile.quantization.ratioStep),
    isOccluded: occluded,
    ...(resolvedCamera.targetAnchorEntityId === undefined
      ? {}
      : { cameraTargetAnchorEntityId: resolvedCamera.targetAnchorEntityId }),
  };
  const tolerance = context.profile.quantization.ratioStep;
  if (projectedArea + tolerance < constraint.minimumProjectedAreaRatio) {
    return result(constraint, false, measurements, { ratio: tolerance }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL");
  }
  if (occluded) {
    return result(constraint, false, measurements, { ratio: tolerance }, [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId], "PLACEMENT_CAMERA_REGION_OCCLUDED");
  }
  const satisfied = visibleRatio + tolerance >= constraint.minimumVisibleRatio;
  return result(
    constraint,
    satisfied,
    measurements,
    { ratio: tolerance },
    [constraint.visibleEntityId, constraint.cameraEntityId, constraint.screenRegionId],
    satisfied ? undefined : "PLACEMENT_CAMERA_REGION_UNSATISFIED",
  );
}

export function evaluatePlacementConstraintV1(
  context: LayoutConstraintEvaluationContextV1,
  constraint: ResolvedPlacementConstraintV1,
  assignments: Assignments,
): ConstraintEvaluationV1 {
  if (hasNonFinite(constraint)) return nonFinite(constraint);
  switch (constraint.kind) {
    case "inside-region":
      return evaluateInside(context, constraint, assignments);
    case "outside-region":
      return evaluateOutside(context, constraint, assignments);
    case "distance-range":
      return evaluateDistance(context, constraint, assignments);
    case "faces-entity":
      return evaluateFacing(context, constraint, assignments);
    case "supported-by":
      return evaluateSupport(context, constraint, assignments);
    case "minimum-clearance":
      return evaluateClearance(context, constraint, assignments);
    case "within-slope-limit":
      return evaluateSlope(context, constraint, assignments);
    case "visible-in-camera-region":
      return evaluateVisibility(context, constraint, assignments);
  }
}
