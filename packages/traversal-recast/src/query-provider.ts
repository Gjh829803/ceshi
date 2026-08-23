import {
  Detour,
  FloatArray,
  type NavMesh,
  QueryFilter,
  Raw,
  statusDetail,
  statusSucceed,
  UnsignedCharArray,
  UnsignedIntArray,
} from "recast-navigation";
import { isNil } from "lodash-es";

import { RECAST_QUERY_PROVIDER_CONSTANTS_V1 } from "./adapter-identity.js";

type Vec3 = readonly [number, number, number];

export interface RecastQueryProviderReceiptV1 {
  readonly kind: "recast-query-provider-receipt";
  readonly schemaVersion: 1;
}

export type RecastNearestPolygonResultV1 =
  | Readonly<{
      kind: "complete";
      polygonRef: number;
      positionMetersXYZ: Vec3;
      isOverPolygon: boolean;
    }>
  | Readonly<{ kind: "miss" }>;

export interface FindNearestRecastPolygonInputV1 {
  readonly positionMetersXYZ: Vec3;
  readonly halfExtentsMetersXYZ: Vec3;
}

export interface RecastStraightPathPointV1 {
  readonly positionMetersXYZ: Vec3;
  readonly flags: number;
  readonly polygonRef: number;
}

export type RecastStraightPathResultV1 =
  | Readonly<{
      kind: "complete";
      points: readonly RecastStraightPathPointV1[];
    }>
  | Readonly<{
      kind: "capacity-exceeded";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>;

export interface FindStraightRecastPathInputV1 {
  readonly startPositionMetersXYZ: Vec3;
  readonly destinationPositionMetersXYZ: Vec3;
  readonly polygonRefs: readonly number[];
  readonly stableMaximumPointCount: number;
}

interface OwnedRawQueryResourcesV1 {
  readonly rawQuery: InstanceType<NonNullable<typeof Raw.Module>["NavMeshQuery"]>;
  readonly filter: QueryFilter;
}

const QUERY_RESOURCES_BY_RECEIPT_V1 = new WeakMap<
  RecastQueryProviderReceiptV1,
  OwnedRawQueryResourcesV1
>();
const CONSUMED_QUERY_RECEIPTS_V1 = new WeakSet<RecastQueryProviderReceiptV1>();

function requireFiniteVec3(value: Vec3, label: string): void {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`TRAVERSAL_RECAST_QUERY_INPUT_INVALID: ${label} must be a finite 3-tuple.`);
  }
}

function requireResources(
  receipt: RecastQueryProviderReceiptV1,
): OwnedRawQueryResourcesV1 {
  const resources = QUERY_RESOURCES_BY_RECEIPT_V1.get(receipt);
  if (isNil(resources)) {
    throw new Error("TRAVERSAL_RECAST_QUERY_RECEIPT_INVALID: receipt is unknown or consumed.");
  }
  return resources;
}

function finishWithCleanup<T>(
  value: T | undefined,
  hasPrimaryError: boolean,
  primaryError: unknown,
  cleanupOperations: readonly (() => void)[],
  cleanupMessage: string,
): T {
  const cleanupErrors: unknown[] = [];
  for (const cleanup of cleanupOperations) {
    try {
      cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (hasPrimaryError) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError([primaryError, ...cleanupErrors], cleanupMessage);
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, cleanupMessage);
  }
  if (isNil(value)) {
    throw new Error("TRAVERSAL_RECAST_QUERY_PROVIDER_INVARIANT: operation returned no value.");
  }
  return value;
}

export function createRecastQueryProviderV1(
  navMesh: NavMesh,
): RecastQueryProviderReceiptV1 {
  if (isNil(Raw.Module)) {
    throw new Error("TRAVERSAL_RECAST_QUERY_PROVIDER_UNINITIALIZED");
  }

  const filter = new QueryFilter();
  let rawQuery: OwnedRawQueryResourcesV1["rawQuery"] | undefined;
  let initializationFailed = false;
  let initializationError: unknown;
  try {
    filter.includeFlags = 1;
    filter.excludeFlags = 0;
    rawQuery = new Raw.Module.NavMeshQuery();
    const status = rawQuery.init(
      navMesh.raw,
      RECAST_QUERY_PROVIDER_CONSTANTS_V1.rawMaximumNodes,
    );
    if (!statusSucceed(status)) {
      throw new Error("TRAVERSAL_RECAST_QUERY_INITIALIZATION_FAILED");
    }
  } catch (error) {
    initializationFailed = true;
    initializationError = error;
  }
  if (initializationFailed) {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of [
      ...(isNil(rawQuery)
        ? []
        : [
            () => rawQuery.destroy(),
            () => Raw.destroy(rawQuery),
          ]),
      () => Raw.destroy(filter.raw),
    ]) {
      try {
        cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [initializationError, ...cleanupErrors],
        "TRAVERSAL_RECAST_QUERY_INITIALIZATION_UNWIND_FAILED",
      );
    }
    throw initializationError;
  }
  if (isNil(rawQuery)) {
    Raw.destroy(filter.raw);
    throw new Error(
      "TRAVERSAL_RECAST_QUERY_PROVIDER_INVARIANT: initialized Query is missing.",
    );
  }

  const receipt: RecastQueryProviderReceiptV1 = Object.freeze({
    kind: "recast-query-provider-receipt",
    schemaVersion: 1,
  });
  QUERY_RESOURCES_BY_RECEIPT_V1.set(receipt, { rawQuery, filter });
  return receipt;
}

export function destroyRecastQueryProviderV1(
  receipt: RecastQueryProviderReceiptV1,
): void {
  if (CONSUMED_QUERY_RECEIPTS_V1.has(receipt)) return;
  const resources = requireResources(receipt);
  CONSUMED_QUERY_RECEIPTS_V1.add(receipt);
  QUERY_RESOURCES_BY_RECEIPT_V1.delete(receipt);
  const errors: unknown[] = [];
  for (const cleanup of [
    () => resources.rawQuery.destroy(),
    () => Raw.destroy(resources.rawQuery),
    () => Raw.destroy(resources.filter.raw),
  ]) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "TRAVERSAL_RECAST_QUERY_RESOURCE_CLEANUP_FAILED",
    );
  }
}

export function findNearestRecastPolygonV1(
  receipt: RecastQueryProviderReceiptV1,
  input: FindNearestRecastPolygonInputV1,
): RecastNearestPolygonResultV1 {
  requireFiniteVec3(input.positionMetersXYZ, "positionMetersXYZ");
  requireFiniteVec3(input.halfExtentsMetersXYZ, "halfExtentsMetersXYZ");
  if (input.halfExtentsMetersXYZ.some((component) => !(component > 0))) {
    throw new Error(
      "TRAVERSAL_RECAST_QUERY_INPUT_INVALID: half extents must be positive.",
    );
  }
  const { rawQuery, filter } = requireResources(receipt);
  const cleanupOperations: Array<() => void> = [];
  let result: RecastNearestPolygonResultV1 | undefined;
  let hasPrimaryError = false;
  let primaryError: unknown;
  try {
    const nearestRef = new Raw.UnsignedIntRef();
    cleanupOperations.unshift(() => Raw.destroy(nearestRef));
    const nearestPoint = new Raw.Vec3();
    cleanupOperations.unshift(() => Raw.destroy(nearestPoint));
    const isOverPolygon = new Raw.BoolRef();
    cleanupOperations.unshift(() => Raw.destroy(isOverPolygon));
    const status = rawQuery.findNearestPoly(
      input.positionMetersXYZ,
      input.halfExtentsMetersXYZ,
      filter.raw,
      nearestRef,
      nearestPoint,
      isOverPolygon,
    );
    const polygonRef = nearestRef.value;
    if (!statusSucceed(status) || polygonRef === 0) {
      result = Object.freeze({ kind: "miss" });
    } else {
      const positionMetersXYZ = [
        nearestPoint.x,
        nearestPoint.y,
        nearestPoint.z,
      ] as const;
      requireFiniteVec3(positionMetersXYZ, "nearest provider point");
      result = Object.freeze({
        kind: "complete",
        polygonRef,
        positionMetersXYZ: Object.freeze(positionMetersXYZ),
        isOverPolygon: isOverPolygon.value,
      });
    }
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }
  return finishWithCleanup(
    result,
    hasPrimaryError,
    primaryError,
    cleanupOperations,
    "TRAVERSAL_RECAST_NEAREST_POLYGON_UNWIND_FAILED",
  );
}

export function findStraightRecastPathV1(
  receipt: RecastQueryProviderReceiptV1,
  input: FindStraightRecastPathInputV1,
): RecastStraightPathResultV1 {
  requireFiniteVec3(input.startPositionMetersXYZ, "startPositionMetersXYZ");
  requireFiniteVec3(
    input.destinationPositionMetersXYZ,
    "destinationPositionMetersXYZ",
  );
  if (
    !Number.isSafeInteger(input.stableMaximumPointCount) ||
    !(input.stableMaximumPointCount > 0) ||
    input.stableMaximumPointCount >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "TRAVERSAL_RECAST_QUERY_INPUT_INVALID: stableMaximumPointCount must admit one sentinel slot.",
    );
  }
  if (
    input.polygonRefs.length === 0 ||
    input.polygonRefs.some((ref) =>
      !Number.isSafeInteger(ref) ||
      !(ref > 0) ||
      ref > RECAST_QUERY_PROVIDER_CONSTANTS_V1.maximumProviderPolygonRef)
  ) {
    throw new Error(
      "TRAVERSAL_RECAST_QUERY_INPUT_INVALID: polygonRefs must be non-empty positive unsigned 32-bit integers.",
    );
  }

  const { rawQuery } = requireResources(receipt);
  const rawCapacity = input.stableMaximumPointCount + 1;
  const cleanupOperations: Array<() => void> = [];
  let result: RecastStraightPathResultV1 | undefined;
  let hasPrimaryError = false;
  let primaryError: unknown;
  try {
    const pathPolygons = new UnsignedIntArray();
    cleanupOperations.unshift(() => pathPolygons.destroy());
    const straightPath = new FloatArray();
    cleanupOperations.unshift(() => straightPath.destroy());
    const straightPathFlags = new UnsignedCharArray();
    cleanupOperations.unshift(() => straightPathFlags.destroy());
    const straightPathRefs = new UnsignedIntArray();
    cleanupOperations.unshift(() => straightPathRefs.destroy());
    const straightPathCount = new Raw.IntRef();
    cleanupOperations.unshift(() => Raw.destroy(straightPathCount));
    pathPolygons.copy([...input.polygonRefs]);
    straightPath.resize(rawCapacity * 3);
    straightPathFlags.resize(rawCapacity);
    straightPathRefs.resize(rawCapacity);
    const status = rawQuery.findStraightPath(
      input.startPositionMetersXYZ,
      input.destinationPositionMetersXYZ,
      pathPolygons.raw,
      straightPath.raw,
      straightPathFlags.raw,
      straightPathRefs.raw,
      straightPathCount,
      rawCapacity,
      0,
    );
    const pointCount = straightPathCount.value;
    const bufferTooSmall = statusDetail(status, Detour.DT_BUFFER_TOO_SMALL);
    if (
      !Number.isSafeInteger(pointCount) ||
      pointCount < 0 ||
      pointCount > rawCapacity
    ) {
      throw new Error("TRAVERSAL_RECAST_QUERY_PROVIDER_INVARIANT: invalid straight-path count.");
    }
    if (pointCount > input.stableMaximumPointCount) {
      result = Object.freeze({
        kind: "capacity-exceeded",
        maximumAllowedCount: input.stableMaximumPointCount,
        minimumRequiredCount: input.stableMaximumPointCount + 1,
      });
    } else if (bufferTooSmall) {
      throw new Error(
        "TRAVERSAL_RECAST_QUERY_PROVIDER_INVARIANT: contradictory straight-path buffer status.",
      );
    } else if (!statusSucceed(status) || pointCount === 0) {
      throw new Error("TRAVERSAL_RECAST_STRAIGHT_PATH_FAILED");
    } else {
      const points: RecastStraightPathPointV1[] = [];
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const positionMetersXYZ = [
          straightPath.get(pointIndex * 3),
          straightPath.get(pointIndex * 3 + 1),
          straightPath.get(pointIndex * 3 + 2),
        ] as const;
        requireFiniteVec3(positionMetersXYZ, "straight provider point");
        points.push(Object.freeze({
          positionMetersXYZ: Object.freeze(positionMetersXYZ),
          flags: straightPathFlags.get(pointIndex),
          polygonRef: straightPathRefs.get(pointIndex),
        }));
      }
      const terminal = points[points.length - 1]!;
      if (
        (terminal.flags & Detour.DT_STRAIGHTPATH_END) === 0 ||
        terminal.polygonRef !== 0
      ) {
        throw new Error(
          "TRAVERSAL_RECAST_QUERY_PROVIDER_INVARIANT: straight path lacks terminal evidence.",
        );
      }
      result = Object.freeze({
        kind: "complete",
        points: Object.freeze(points),
      });
    }
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }
  return finishWithCleanup(
    result,
    hasPrimaryError,
    primaryError,
    cleanupOperations,
    "TRAVERSAL_RECAST_STRAIGHT_PATH_UNWIND_FAILED",
  );
}
