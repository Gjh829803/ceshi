import {
  canonicalRoutePathReceiptV1,
  canonicalRouteRuntimeProbeReceiptV1,
  canonicalTraversalRuntimeTickEvidenceV1,
  createRouteRuntimeProbeRequestV1,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfile,
  type CharacterSupportSurfaceResolutionV1,
  type ResolvedTraversalDriverProfileV1,
  type RoutePathReceiptV1,
  type RouteRuntimeProbeFailureV1,
  type RouteRuntimeProbeMetricsV1,
  type RouteRuntimeProbeReceiptV1,
  type RouteRuntimeProbeRequestV1,
  type RouteRuntimeProbeTickV1,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import { isEqual, isNil } from "lodash-es";

import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  hashValidationProfileV2,
} from "./profile-v2.js";
import type { RouteRuntimeGateThresholdsV1 } from "./route.js";
import type { ValidationProfileV2 } from "./types-v2.js";
import { validateValidationProfileV2 } from "./validate-v2.js";
import { assertAccessorFreeDataGraph } from "./accessor-free-data.js";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

export const ROUTE_RUNTIME_PROBE_ERROR_CODES_V1 = [
  "ROUTE_RUNTIME_PROBE_INPUT_INVALID",
  "ROUTE_RUNTIME_PROBE_PATH_INVALID",
  "ROUTE_RUNTIME_PROBE_RUNTIME_INVALID",
  "ROUTE_RUNTIME_PROBE_RUNTIME_UNAVAILABLE",
] as const;

export type RouteRuntimeProbeErrorCodeV1 =
  (typeof ROUTE_RUNTIME_PROBE_ERROR_CODES_V1)[number];

export class RouteRuntimeProbeErrorV1 extends Error {
  public readonly code: RouteRuntimeProbeErrorCodeV1;

  public constructor(code: RouteRuntimeProbeErrorCodeV1) {
    super(code);
    this.name = "RouteRuntimeProbeErrorV1";
    this.code = code;
  }
}

export interface RunRouteRuntimeProbeInputV1 {
  readonly routePathReceipt: RoutePathReceiptV1;
  readonly traversalDriverProfile: ResolvedTraversalDriverProfileV1;
  readonly runtimePort: TraversalRuntimePortV1;
  readonly validationProfile: ValidationProfileV2;
}

interface XzPoint {
  readonly x: number;
  readonly z: number;
}

interface PathSegment {
  readonly index: number;
  readonly start: XzPoint;
  readonly end: XzPoint;
  readonly startProgressMetersXZ: number;
  readonly endProgressMetersXZ: number;
  readonly lengthMetersXZ: number;
  readonly rawLengthMetersXZ: number;
}

interface PathGeometry {
  readonly points: readonly XzPoint[];
  readonly segments: readonly PathSegment[];
  readonly totalDistanceMetersXZ: number;
}

const GEOMETRY_EPSILON = 1e-9;

function fail(code: RouteRuntimeProbeErrorCodeV1): never {
  throw new RouteRuntimeProbeErrorV1(code);
}

function canonicalPath(value: RoutePathReceiptV1): RoutePathReceiptV1 {
  try {
    return canonicalRoutePathReceiptV1(value);
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
  }
}

function canonicalDriver(
  value: ResolvedTraversalDriverProfileV1,
): ResolvedTraversalDriverProfileV1 {
  try {
    const resolved = resolveTraversalDriverProfileV1(value.resourceRef);
    if (!isEqual(value, resolved)) {
      fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
    }
    return resolved;
  } catch (error) {
    if (error instanceof RouteRuntimeProbeErrorV1) throw error;
    return fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
  }
}

function canonicalValidationProfile(
  value: ValidationProfileV2,
): Readonly<{
  identity: Readonly<{
    resourceRef: string;
    version: string;
    contentHash: `sha256:${string}`;
  }>;
  thresholds: RouteRuntimeGateThresholdsV1;
}> {
  try {
    assertAccessorFreeDataGraph(value, "ROUTE_RUNTIME_PROBE_INPUT_INVALID");
    const result = validateValidationProfileV2(value);
    const contentHash = hashValidationProfileV2(value);
    if (
      !result.ok ||
      value.resourceRef !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef ||
      value.version !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version ||
      contentHash !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2
    ) {
      fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
    }
    return Object.freeze({
      identity: Object.freeze({
        resourceRef: value.resourceRef,
        version: value.version,
        contentHash,
      }),
      thresholds: Object.freeze({
        ...value.routeRuntimeGateThresholds,
      }),
    });
  } catch (error) {
    if (error instanceof RouteRuntimeProbeErrorV1) throw error;
    return fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
  }
}

function xz(position: Vec3): XzPoint {
  return { x: position[0], z: position[2] };
}

function distanceXZ(a: XzPoint, b: XzPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function requireFiniteRuntimeDerived(value: number): number {
  if (!Number.isFinite(value)) {
    fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
  }
  return value === 0 ? 0 : value;
}

function ceilToQuantum(value: number, quantum: number): number {
  const units = Math.ceil(value / quantum - Number.EPSILON);
  if (!Number.isSafeInteger(units)) {
    fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
  }
  const quantized = units * quantum;
  return quantized === 0 ? 0 : quantized;
}

function orientation(a: XzPoint, b: XzPoint, c: XzPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment(a: XzPoint, b: XzPoint, point: XzPoint): boolean {
  return Math.abs(orientation(a, b, point)) <= GEOMETRY_EPSILON &&
    point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON &&
    point.z >= Math.min(a.z, b.z) - GEOMETRY_EPSILON &&
    point.z <= Math.max(a.z, b.z) + GEOMETRY_EPSILON;
}

function segmentsIntersect(a: PathSegment, b: PathSegment): boolean {
  const o1 = orientation(a.start, a.end, b.start);
  const o2 = orientation(a.start, a.end, b.end);
  const o3 = orientation(b.start, b.end, a.start);
  const o4 = orientation(b.start, b.end, a.end);
  if (
    ((o1 > GEOMETRY_EPSILON && o2 < -GEOMETRY_EPSILON) ||
      (o1 < -GEOMETRY_EPSILON && o2 > GEOMETRY_EPSILON)) &&
    ((o3 > GEOMETRY_EPSILON && o4 < -GEOMETRY_EPSILON) ||
      (o3 < -GEOMETRY_EPSILON && o4 > GEOMETRY_EPSILON))
  ) {
    return true;
  }
  return (
    (Math.abs(o1) <= GEOMETRY_EPSILON && onSegment(a.start, a.end, b.start)) ||
    (Math.abs(o2) <= GEOMETRY_EPSILON && onSegment(a.start, a.end, b.end)) ||
    (Math.abs(o3) <= GEOMETRY_EPSILON && onSegment(b.start, b.end, a.start)) ||
    (Math.abs(o4) <= GEOMETRY_EPSILON && onSegment(b.start, b.end, a.end))
  );
}

function createPathGeometry(path: RoutePathReceiptV1): PathGeometry {
  let positionQuantizationMeters: number;
  try {
    const builder = resolveTraversalGraphBuilderProfile(
      path.graphBuilderProfileRef,
    );
    if (
      builder.resolvedVersion !== path.graphBuilderResolvedVersion ||
      builder.contentHash !== path.graphBuilderProfileHash
    ) {
      fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
    }
    positionQuantizationMeters = builder.profile.positionQuantizationMeters;
  } catch (error) {
    if (error instanceof RouteRuntimeProbeErrorV1) throw error;
    return fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
  }
  const points = path.orderedPathPositionsMetersXYZ.map(xz);
  const segments: PathSegment[] = [];
  let totalDistanceMetersXZ = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const rawLengthMetersXZ = distanceXZ(start, end);
    if (!(rawLengthMetersXZ > 0)) {
      fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
    }
    const lengthMetersXZ = ceilToQuantum(
      rawLengthMetersXZ,
      positionQuantizationMeters,
    );
    segments.push({
      index,
      start,
      end,
      startProgressMetersXZ: totalDistanceMetersXZ,
      endProgressMetersXZ: totalDistanceMetersXZ + lengthMetersXZ,
      lengthMetersXZ,
      rawLengthMetersXZ,
    });
    totalDistanceMetersXZ += lengthMetersXZ;
  }

  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 2; right < points.length; right += 1) {
      if (distanceXZ(points[left]!, points[right]!) <= GEOMETRY_EPSILON) {
        fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
      }
    }
  }
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 2; right < segments.length; right += 1) {
      if (segmentsIntersect(segments[left]!, segments[right]!)) {
        fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
      }
    }
  }
  if (totalDistanceMetersXZ !== path.routePathDistanceMetersXZ) {
    fail("ROUTE_RUNTIME_PROBE_PATH_INVALID");
  }
  return { points, segments, totalDistanceMetersXZ };
}

function pointAtProgress(
  geometry: PathGeometry,
  progressMetersXZ: number,
): XzPoint {
  if (geometry.segments.length === 0) return geometry.points[0]!;
  const progress = Math.min(
    geometry.totalDistanceMetersXZ,
    Math.max(0, progressMetersXZ),
  );
  const segment = geometry.segments.find(
    (candidate) => progress <= candidate.endProgressMetersXZ,
  ) ?? geometry.segments.at(-1)!;
  const parameter = segment.lengthMetersXZ === 0
    ? 0
    : (progress - segment.startProgressMetersXZ) / segment.lengthMetersXZ;
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * parameter,
    z: segment.start.z + (segment.end.z - segment.start.z) * parameter,
  };
}

function projectForwardProgress(
  geometry: PathGeometry,
  subject: XzPoint,
  previousProgressMetersXZ: number,
  lookaheadMetersXZ: number,
): number {
  if (geometry.segments.length === 0) return 0;
  const maximumProgressMetersXZ = Math.min(
    geometry.totalDistanceMetersXZ,
    previousProgressMetersXZ + lookaheadMetersXZ,
  );
  let selectedProgressMetersXZ = previousProgressMetersXZ;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const segment of geometry.segments) {
    const eligibleStart = Math.max(
      segment.startProgressMetersXZ,
      previousProgressMetersXZ,
    );
    const eligibleEnd = Math.min(
      segment.endProgressMetersXZ,
      maximumProgressMetersXZ,
    );
    if (eligibleStart > eligibleEnd) continue;
    const dx = segment.end.x - segment.start.x;
    const dz = segment.end.z - segment.start.z;
    const rawParameter = (
      (subject.x - segment.start.x) * dx +
      (subject.z - segment.start.z) * dz
    ) / (segment.rawLengthMetersXZ * segment.rawLengthMetersXZ);
    const rawProgress = segment.startProgressMetersXZ +
      rawParameter * segment.lengthMetersXZ;
    const candidateProgress = Math.max(
      eligibleStart,
      Math.min(eligibleEnd, rawProgress),
    );
    const candidatePoint = pointAtProgress(geometry, candidateProgress);
    const candidateDistance = requireFiniteRuntimeDerived(
      distanceXZ(subject, candidatePoint),
    );
    if (candidateDistance < selectedDistance) {
      selectedDistance = candidateDistance;
      selectedProgressMetersXZ = candidateProgress;
    }
  }
  return requireFiniteRuntimeDerived(selectedProgressMetersXZ);
}

function deviationFromCompletePath(
  geometry: PathGeometry,
  subject: XzPoint,
): number {
  if (geometry.segments.length === 0) {
    return requireFiniteRuntimeDerived(
      distanceXZ(subject, geometry.points[0]!),
    );
  }
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const segment of geometry.segments) {
    const dx = segment.end.x - segment.start.x;
    const dz = segment.end.z - segment.start.z;
    const rawParameter = (
      (subject.x - segment.start.x) * dx +
      (subject.z - segment.start.z) * dz
    ) / (segment.rawLengthMetersXZ * segment.rawLengthMetersXZ);
    const parameter = Math.max(0, Math.min(1, rawParameter));
    const projected = {
      x: segment.start.x + dx * parameter,
      z: segment.start.z + dz * parameter,
    };
    minimumDistance = Math.min(
      minimumDistance,
      requireFiniteRuntimeDerived(distanceXZ(subject, projected)),
    );
  }
  return requireFiniteRuntimeDerived(minimumDistance);
}

function roundHalfAwayFromZero(value: number): number {
  if (value === 0) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

function quantizedDirection(
  from: XzPoint,
  target: XzPoint,
  ratio: number,
): Vec2 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const length = requireFiniteRuntimeDerived(Math.hypot(dx, dz));
  if (!(length > 0)) return [0, 0];
  const quantizedX = roundHalfAwayFromZero(dx / length / ratio) * ratio;
  const quantizedZ = roundHalfAwayFromZero(dz / length / ratio) * ratio;
  const quantizedLength = requireFiniteRuntimeDerived(
    Math.hypot(quantizedX, quantizedZ),
  );
  if (!(quantizedLength > 0)) return [0, 0];
  const x = requireFiniteRuntimeDerived(quantizedX / quantizedLength);
  const z = requireFiniteRuntimeDerived(quantizedZ / quantizedLength);
  return [x === 0 ? 0 : x, z === 0 ? 0 : z];
}

function surfaceMismatch(
  evidence: TraversalRuntimeTickEvidenceV1,
  expected: TraversalSurfaceIdentityV1,
): boolean {
  if (evidence.characterSupport.supportState === "unsupported") return false;
  return !isEqual(evidence.characterSupport.surfaceResolution, {
    mode: "resolved",
    ...expected,
  });
}

function runtimeEvidence(
  value: TraversalRuntimeTickEvidenceV1,
  request: RouteRuntimeProbeRequestV1,
  expectedTick: number,
  fixedTimeStepSeconds?: number,
): TraversalRuntimeTickEvidenceV1 {
  let evidence: TraversalRuntimeTickEvidenceV1;
  try {
    evidence = canonicalTraversalRuntimeTickEvidenceV1(value);
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
  }
  if (
    evidence.tick !== expectedTick ||
    evidence.traversingEntityId !== request.traversingEntityId ||
    evidence.authoringSpecHash !== request.authoringSpecHash ||
    evidence.layoutSolveReportHash !== request.layoutSolveReportHash ||
    evidence.resourceLockHash !== request.resourceLockHash ||
    evidence.executionPlanHash !== request.executionPlanHash ||
    evidence.resolvedTraversalLockHash !== request.resolvedTraversalLockHash ||
    !isEqual(
      evidence.runtimeImplementationIdentity,
      request.runtimeImplementationIdentity,
    ) ||
    (!isNil(fixedTimeStepSeconds) &&
      evidence.fixedTimeStepSeconds !== fixedTimeStepSeconds)
  ) {
    fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
  }
  return evidence;
}

function emptyMetrics(
  initial: TraversalRuntimeTickEvidenceV1,
  surface: TraversalSurfaceIdentityV1,
): RouteRuntimeProbeMetricsV1 {
  return {
    processedTickCount: 0,
    maximumStalledDurationTicks: 0,
    maximumRouteDeviationMetersXZ: 0,
    maximumConsecutiveUnexpectedUnsupportedTicks: 0,
    slidingDurationTicks: 0,
    unexpectedSupportLossCount: 0,
    wrongSupportSurfaceCount: surfaceMismatch(initial, surface) ? 1 : 0,
    invalidPhysicsValueCount: 0,
  };
}

function failedReceipt(
  request: RouteRuntimeProbeRequestV1,
  initialRuntimeEvidence: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV1[],
  metrics: RouteRuntimeProbeMetricsV1,
  failure: RouteRuntimeProbeFailureV1,
): RouteRuntimeProbeReceiptV1 {
  try {
    return canonicalRouteRuntimeProbeReceiptV1({
      kind: "route-runtime-probe-receipt",
      schemaVersion: 1,
      status: "failed",
      request,
      initialRuntimeEvidence,
      ticks,
      metrics,
      failure,
    });
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
  }
}

function completeReceipt(
  request: RouteRuntimeProbeRequestV1,
  initialRuntimeEvidence: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV1[],
  metrics: RouteRuntimeProbeMetricsV1,
): RouteRuntimeProbeReceiptV1 {
  try {
    return canonicalRouteRuntimeProbeReceiptV1({
      kind: "route-runtime-probe-receipt",
      schemaVersion: 1,
      status: "complete",
      request,
      initialRuntimeEvidence,
      ticks,
      metrics,
      completionDurationTicks: ticks.length,
    });
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
  }
}

function mismatchMode(
  resolution: CharacterSupportSurfaceResolutionV1,
): "unmatched" | "ambiguous" | "resolved" {
  if (
    resolution.mode === "unmatched" ||
    resolution.mode === "ambiguous" ||
    resolution.mode === "resolved"
  ) {
    return resolution.mode;
  }
  return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
}

export async function runRouteRuntimeProbeV1(
  input: RunRouteRuntimeProbeInputV1,
): Promise<RouteRuntimeProbeReceiptV1> {
  const path = canonicalPath(input.routePathReceipt);
  const driver = canonicalDriver(input.traversalDriverProfile);
  const validation = canonicalValidationProfile(input.validationProfile);
  const geometry = createPathGeometry(path);
  const thresholds = validation.thresholds;

  let request: RouteRuntimeProbeRequestV1;
  try {
    request = createRouteRuntimeProbeRequestV1({
      routePathReceipt: path,
      resolvedDriverProfile: driver,
      runtimePort: input.runtimePort,
      validationProfileIdentity: validation.identity,
    });
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_INPUT_INVALID");
  }

  let rawInitial: TraversalRuntimeTickEvidenceV1;
  try {
    rawInitial = input.runtimePort.resetToStartAnchor({
      startAnchorEntityId: path.startAnchorEntityId,
    });
  } catch {
    return fail("ROUTE_RUNTIME_PROBE_RUNTIME_UNAVAILABLE");
  }
  const initial = runtimeEvidence(rawInitial, request, 0);
  const initialMetrics = emptyMetrics(initial, path.traversalSurfaceIdentity);
  if (initial.characterSupport.supportState === "unsupported") {
    return failedReceipt(request, initial, [], initialMetrics, {
      kind: "start-support-invalid",
      failureProbeTick: 0,
      failurePositionMetersXYZ: initial.subjectPositionMetersXYZ,
      supportState: "unsupported",
    });
  }
  if (surfaceMismatch(initial, path.traversalSurfaceIdentity)) {
    return failedReceipt(request, initial, [], initialMetrics, {
      kind: "support-surface-mismatch",
      failureProbeTick: 0,
      failurePositionMetersXYZ: initial.subjectPositionMetersXYZ,
      supportState: initial.characterSupport.supportState,
      surfaceResolutionMode: mismatchMode(
        initial.characterSupport.surfaceResolution,
      ),
    });
  }

  const destination = geometry.points.at(-1)!;
  if (
    requireFiniteRuntimeDerived(
      distanceXZ(xz(initial.subjectPositionMetersXYZ), destination),
    ) <=
      thresholds.destinationToleranceMetersXZ
  ) {
    return completeReceipt(request, initial, [], initialMetrics);
  }

  const ticks: RouteRuntimeProbeTickV1[] = [];
  let previousEvidence = initial;
  let previousProgressMetersXZ = 0;
  let progressBaselineMetersXZ = 0;
  let stalledDurationTicks = 0;
  let consecutiveUnexpectedUnsupportedTicks = 0;
  let maximumStalledDurationTicks = 0;
  let maximumRouteDeviationMetersXZ = 0;
  let maximumConsecutiveUnexpectedUnsupportedTicks = 0;
  let slidingDurationTicks = 0;
  let unexpectedSupportLossCount = 0;
  let wrongSupportSurfaceCount = 0;

  for (
    let probeTick = 1;
    probeTick <= thresholds.maximumProbeTicks;
    probeTick += 1
  ) {
    const subjectBeforeTick = xz(previousEvidence.subjectPositionMetersXYZ);
    const selectedProgress = projectForwardProgress(
      geometry,
      subjectBeforeTick,
      previousProgressMetersXZ,
      driver.profile.pathLookaheadMetersXZ,
    );
    const targetProgress = Math.min(
      geometry.totalDistanceMetersXZ,
      selectedProgress + driver.profile.pathLookaheadMetersXZ,
    );
    const walkDirectionWorldXZ = quantizedDirection(
      subjectBeforeTick,
      pointAtProgress(geometry, targetProgress),
      driver.profile.intentDirectionQuantizationRatio,
    );

    let rawEvidence: TraversalRuntimeTickEvidenceV1;
    try {
      rawEvidence = await input.runtimePort.runFixedTick(Object.freeze({
        walkDirectionWorldXZ: Object.freeze(walkDirectionWorldXZ),
      }));
    } catch {
      return fail("ROUTE_RUNTIME_PROBE_RUNTIME_UNAVAILABLE");
    }
    const evidence = runtimeEvidence(
      rawEvidence,
      request,
      probeTick,
      initial.fixedTimeStepSeconds,
    );
    const subjectAfterTick = xz(evidence.subjectPositionMetersXYZ);
    let routeProgressMetersXZ = projectForwardProgress(
      geometry,
      subjectAfterTick,
      previousProgressMetersXZ,
      driver.profile.pathLookaheadMetersXZ,
    );
    const routeDeviationMetersXZ = deviationFromCompletePath(
      geometry,
      subjectAfterTick,
    );
    const isUnsupported = evidence.characterSupport.supportState === "unsupported";
    const hasExpectedSurface = !isUnsupported &&
      !surfaceMismatch(evidence, path.traversalSurfaceIdentity);
    const hasArrived = hasExpectedSurface &&
      requireFiniteRuntimeDerived(distanceXZ(subjectAfterTick, destination)) <=
        thresholds.destinationToleranceMetersXZ;
    if (hasArrived) routeProgressMetersXZ = geometry.totalDistanceMetersXZ;

    if (
      routeProgressMetersXZ - progressBaselineMetersXZ >=
        thresholds.minimumProgressMetersXZ
    ) {
      progressBaselineMetersXZ = routeProgressMetersXZ;
      stalledDurationTicks = 0;
    } else {
      stalledDurationTicks += 1;
    }
    if (isUnsupported) {
      consecutiveUnexpectedUnsupportedTicks += 1;
      if (previousEvidence.characterSupport.supportState !== "unsupported") {
        unexpectedSupportLossCount += 1;
      }
    } else {
      consecutiveUnexpectedUnsupportedTicks = 0;
    }
    if (evidence.characterSupport.supportState === "sliding") {
      slidingDurationTicks += 1;
    }
    if (surfaceMismatch(evidence, path.traversalSurfaceIdentity)) {
      wrongSupportSurfaceCount = 1;
    }

    maximumStalledDurationTicks = Math.max(
      maximumStalledDurationTicks,
      stalledDurationTicks,
    );
    maximumRouteDeviationMetersXZ = Math.max(
      maximumRouteDeviationMetersXZ,
      routeDeviationMetersXZ,
    );
    maximumConsecutiveUnexpectedUnsupportedTicks = Math.max(
      maximumConsecutiveUnexpectedUnsupportedTicks,
      consecutiveUnexpectedUnsupportedTicks,
    );

    const row: RouteRuntimeProbeTickV1 = {
      kind: "route-runtime-probe-tick",
      schemaVersion: 1,
      probeTick,
      runtimeEvidence: evidence,
      walkDirectionWorldXZ,
      routeProgressMetersXZ,
      remainingRouteDistanceMetersXZ: hasArrived
        ? 0
        : requireFiniteRuntimeDerived(
            Math.max(
              0,
              geometry.totalDistanceMetersXZ - routeProgressMetersXZ,
            ),
          ),
      routeDeviationMetersXZ,
      stalledDurationTicks,
      consecutiveUnexpectedUnsupportedTicks,
    };
    ticks.push(row);
    const metrics: RouteRuntimeProbeMetricsV1 = {
      processedTickCount: ticks.length,
      maximumStalledDurationTicks,
      maximumRouteDeviationMetersXZ,
      maximumConsecutiveUnexpectedUnsupportedTicks,
      slidingDurationTicks,
      unexpectedSupportLossCount,
      wrongSupportSurfaceCount,
      invalidPhysicsValueCount: 0,
    };

    if (surfaceMismatch(evidence, path.traversalSurfaceIdentity)) {
      const supportState = evidence.characterSupport.supportState;
      if (supportState === "unsupported") {
        return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
      }
      return failedReceipt(request, initial, ticks, metrics, {
        kind: "support-surface-mismatch",
        failureProbeTick: probeTick,
        failurePositionMetersXYZ: evidence.subjectPositionMetersXYZ,
        supportState,
        surfaceResolutionMode: mismatchMode(
          evidence.characterSupport.surfaceResolution,
        ),
      });
    }
    if (
      consecutiveUnexpectedUnsupportedTicks >
        thresholds.maximumConsecutiveUnsupportedTicks
    ) {
      return failedReceipt(request, initial, ticks, metrics, {
        kind: "runtime-support-lost",
        failureProbeTick: probeTick,
        failurePositionMetersXYZ: evidence.subjectPositionMetersXYZ,
        consecutiveUnexpectedUnsupportedTicks,
      });
    }
    if (routeDeviationMetersXZ > thresholds.maximumRouteDeviationMetersXZ) {
      return failedReceipt(request, initial, ticks, metrics, {
        kind: "runtime-deviated",
        failureProbeTick: probeTick,
        failurePositionMetersXYZ: evidence.subjectPositionMetersXYZ,
        routeDeviationMetersXZ,
      });
    }
    if (hasArrived) {
      return completeReceipt(request, initial, ticks, metrics);
    }
    if (stalledDurationTicks > thresholds.stalledWindowTicks) {
      return failedReceipt(request, initial, ticks, metrics, {
        kind: "runtime-stalled",
        failureProbeTick: probeTick,
        failurePositionMetersXYZ: evidence.subjectPositionMetersXYZ,
        stalledDurationTicks,
      });
    }
    if (probeTick === thresholds.maximumProbeTicks) {
      return failedReceipt(request, initial, ticks, metrics, {
        kind: "maximum-probe-ticks-reached",
        failureProbeTick: probeTick,
        failurePositionMetersXYZ: evidence.subjectPositionMetersXYZ,
        processedTickCount: ticks.length,
      });
    }
    previousEvidence = evidence;
    previousProgressMetersXZ = routeProgressMetersXZ;
  }
  return fail("ROUTE_RUNTIME_PROBE_RUNTIME_INVALID");
}
