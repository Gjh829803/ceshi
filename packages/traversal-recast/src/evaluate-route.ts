import {
  assertHeightfieldRouteBuildInputReceiptV1,
  assertHeightfieldRouteConnectivityResultForBuildInputV1,
  canonicalRouteConnectivityFailureV1,
  canonicalRoutePathReceiptV1,
  hashRouteConnectivityFailureV1,
  hashRoutePathReceiptV1,
  hashTraversalGraphV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteConnectivityResultV1,
  type RouteConnectivityFailureReasonV1,
  type RouteConnectivityFailureV1,
  type RoutePathReceiptV1,
  type TraversalGraphV1,
} from "@whitebox-world/traversal";
import { isNil } from "lodash-es";

import {
  buildHeightfieldTraversalGraphV1,
  type HeightfieldTraversalGraphProjectionV1,
} from "./build-graph.js";
import {
  buildSourceDerivedRouteRejectionProofInputV1,
} from "./build-rejection-graph.js";
import {
  createHardRibbonProofV1,
  isPointInsideHardRibbonV1,
  isSegmentInsideHardRibbonV1,
} from "./hard-ribbon-proof.js";
import {
  mapHeightfieldRouteBuildInputToRecastSourceV1,
} from "./heightfield-source.js";
import {
  destroyRecastProviderOperationResourcesV1,
  destroyRecastTiledOperationResourcesV1,
  generateRetainedTiledNavMeshV1,
  runRecastProviderOperationV1,
} from "./provider-lifecycle.js";
import {
  createRecastQueryProviderV1,
  findNearestRecastPolygonV1,
  findStraightRecastPathV1,
  type FindNearestRecastPolygonInputV1,
  type FindStraightRecastPathInputV1,
  type RecastNearestPolygonResultV1,
  type RecastQueryProviderReceiptV1,
  type RecastStraightPathResultV1,
} from "./query-provider.js";
import { selectCanonicalTraversalPathV1 } from "./query-route.js";
import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";
import {
  evaluateRouteRejectionProofV1,
  type EvaluateRouteRejectionProofInputV1,
  type RouteRejectionProofEvaluationV1,
} from "./route-rejection-proof.js";

type Vec3 = readonly [number, number, number];

export interface EvaluateRequiredHeightfieldRouteInputV1 {
  readonly buildInputReceipt: HeightfieldRouteBuildInputReceiptV1;
  readonly abortSignal?: AbortSignal;
}

export class RouteConnectivityOperationAbortedErrorV1 extends Error {
  readonly code = "ROUTE_CONNECTIVITY_OPERATION_ABORTED" as const;

  public constructor() {
    super("ROUTE_CONNECTIVITY_OPERATION_ABORTED");
    this.name = "RouteConnectivityOperationAbortedErrorV1";
  }
}

export interface TraversalRouteQueryProviderV1 {
  readonly findNearestPolygon: (
    input: FindNearestRecastPolygonInputV1,
  ) => RecastNearestPolygonResultV1;
  readonly findStraightPath: (
    input: FindStraightRecastPathInputV1,
  ) => RecastStraightPathResultV1;
}

export interface QueryRequiredRouteInputV1 {
  readonly projection: Extract<
    HeightfieldTraversalGraphProjectionV1,
    { readonly status: "complete" }
  >;
  readonly buildInputReceipt: HeightfieldRouteBuildInputReceiptV1;
  readonly queryProvider: TraversalRouteQueryProviderV1;
  readonly rejectionProofInput: EvaluateRouteRejectionProofInputV1;
}

function fail(message: string): never {
  throw new Error(`TRAVERSAL_RECAST_ROUTE_EVALUATION_INVALID: ${message}`);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) fail("quantization input must be finite.");
  const result = value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
  if (!Number.isSafeInteger(result)) fail("quantized value exceeds safe integer range.");
  return result;
}

function quantize(value: number, quantum: number): number {
  return normalizeZero(roundHalfAwayFromZero(value / quantum) * quantum);
}

function quantizeVec3(value: Vec3, quantum: number): Vec3 {
  return [
    quantize(value[0], quantum),
    quantize(value[1], quantum),
    quantize(value[2], quantum),
  ];
}

function ceilToQuantum(value: number, quantum: number): number {
  if (!Number.isFinite(value) || value < 0) fail("upper-bound metric must be non-negative and finite.");
  const units = Math.ceil(value / quantum - Number.EPSILON);
  if (!Number.isSafeInteger(units)) fail("upper-bound metric exceeds safe integer range.");
  return normalizeZero(units * quantum);
}

function commonFailureFields(receipt: HeightfieldRouteBuildInputReceiptV1) {
  const input = receipt.input;
  const quantum = input.capabilityEnvelope.positionQuantizationMeters;
  return {
    kind: "route-connectivity-failure" as const,
    schemaVersion: 1 as const,
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    startAnchorPositionMetersXYZ: quantizeVec3(input.startAnchor.positionMetersXYZ, quantum),
    destinationAnchorPositionMetersXYZ: quantizeVec3(
      input.destinationAnchor.positionMetersXYZ,
      quantum,
    ),
    traversalSurfaceId: input.traversalSurface.traversalSurfaceId,
    surfaceEntityId: input.traversalSurface.surfaceEntityId,
    colliderSubshapeId: input.traversalSurface.colliderSubshapeId,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
  };
}

function failureResult(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  status: "unreachable" | "incomplete",
  graph: TraversalGraphV1 | undefined,
  reason: RouteConnectivityFailureReasonV1,
): HeightfieldRouteConnectivityResultV1 {
  const traversalGraphHash = isNil(graph)
    ? undefined
    : hashTraversalGraphV1(graph);
  const connectivityFailure = canonicalRouteConnectivityFailureV1({
    ...commonFailureFields(receipt),
    status,
    graphStatus: isNil(graph) ? "unavailable" : "complete",
    ...(isNil(traversalGraphHash) ? {} : { traversalGraphHash }),
    reason,
  });
  const connectivityFailureHash = hashRouteConnectivityFailureV1(
    connectivityFailure,
  );
  return assertHeightfieldRouteConnectivityResultForBuildInputV1(
    isNil(graph)
      ? {
          kind: "heightfield-route-connectivity-result",
          schemaVersion: 1,
          status,
          graphStatus: "unavailable",
          connectivityFailure,
          connectivityFailureHash,
        }
      : {
          kind: "heightfield-route-connectivity-result",
          schemaVersion: 1,
          status,
          graphStatus: "complete",
          traversalGraph: graph,
          traversalGraphHash,
          connectivityFailure,
          connectivityFailureHash,
        },
    receipt,
  );
}

function completeResult(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  graph: TraversalGraphV1,
  path: RoutePathReceiptV1,
): HeightfieldRouteConnectivityResultV1 {
  return assertHeightfieldRouteConnectivityResultForBuildInputV1({
    kind: "heightfield-route-connectivity-result",
    schemaVersion: 1,
    status: "complete",
    traversalGraph: graph,
    traversalGraphHash: hashTraversalGraphV1(graph),
    routePathReceipt: path,
    routePathReceiptHash: hashRoutePathReceiptV1(path),
  }, receipt);
}

function genericUnreachableReason(
  receipt: HeightfieldRouteBuildInputReceiptV1,
): RouteConnectivityFailureReasonV1 {
  return {
    kind: "required-path-unreachable",
    code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
    traversalSurfaceId: receipt.input.traversalSurface.traversalSurfaceId,
    relevantBlockingColliderEntityIds: [...new Set(
      receipt.input.blockingColliders.map((collider) => collider.entityId),
    )].sort(),
    blockedWaterEntityIds: [...new Set(
      receipt.input.blockedWaterExclusions.map((water) => water.waterEntityId),
    )].sort(),
  };
}

export function routeConnectivityReasonForRejectionProofV1(
  proof: RouteRejectionProofEvaluationV1,
): RouteConnectivityFailureReasonV1 | undefined {
  if (proof.status === "generic") return undefined;
  const common = {
    proofKind: proof.proofKind,
    proofCandidateIds: proof.proofCandidateIds,
    failurePositionMetersXYZ: proof.failurePositionMetersXYZ,
  } as const;
  const reason = proof.rejectionReason;
  switch (reason.kind) {
    case "slope":
      return {
        ...common,
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        terrainEntityId: reason.terrainEntityId,
        maximumObservedSlopeDegrees: reason.maximumObservedSlopeDegrees,
        maximumAllowedSlopeDegrees: reason.maximumAllowedSlopeDegrees,
      };
    case "step":
      return {
        ...common,
        kind: "step-height-threshold-exceeded",
        code: "ROUTE_STEP_HEIGHT_EXCEEDED",
        terrainEntityId: reason.terrainEntityId,
        maximumObservedStepHeightMeters: reason.maximumObservedStepHeightMeters,
        maximumAllowedStepHeightMeters: reason.maximumAllowedStepHeightMeters,
      };
    case "width":
      return {
        ...common,
        kind: "clearance-width-insufficient",
        code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
        terrainEntityId: reason.terrainEntityId,
        relevantColliderSubshapeIds: reason.relevantColliderSubshapeIds,
        minimumObservedClearanceWidthMeters:
          reason.minimumObservedClearanceWidthMeters,
        minimumRequiredClearanceWidthMeters:
          reason.minimumRequiredClearanceWidthMeters,
      };
    case "overhead":
      return {
        ...common,
        kind: "overhead-clearance-insufficient",
        code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
        terrainEntityId: reason.terrainEntityId,
        relevantColliderSubshapeIds: reason.relevantColliderSubshapeIds,
        minimumObservedClearanceHeightMeters:
          reason.minimumObservedClearanceHeightMeters,
        minimumRequiredClearanceHeightMeters:
          reason.minimumRequiredClearanceHeightMeters,
      };
    case "gap":
      return {
        ...common,
        kind: "surface-gap-exceeded",
        code: "ROUTE_SURFACE_GAP_EXCEEDED",
        terrainEntityId: reason.terrainEntityId,
        maximumObservedSurfaceGapMeters:
          reason.maximumObservedSurfaceGapMeters,
        maximumAllowedSurfaceGapMeters:
          reason.maximumAllowedSurfaceGapMeters,
      };
  }
}

function sourceDerivedUnreachableReason(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  rejectionProofInput: EvaluateRouteRejectionProofInputV1,
): RouteConnectivityFailureReasonV1 {
  return routeConnectivityReasonForRejectionProofV1(
    evaluateRouteRejectionProofV1(rejectionProofInput),
  ) ?? genericUnreachableReason(receipt);
}

function endpointFailure(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  graph: TraversalGraphV1,
  endpoint: "start" | "destination",
): HeightfieldRouteConnectivityResultV1 {
  const anchor = endpoint === "start"
    ? receipt.input.startAnchor
    : receipt.input.destinationAnchor;
  const quantum = receipt.input.capabilityEnvelope.positionQuantizationMeters;
  return failureResult(receipt, "unreachable", graph, endpoint === "start"
    ? {
        kind: "start-surface-not-found",
        code: "ROUTE_START_SURFACE_NOT_FOUND",
        anchorEntityId: anchor.entityId,
        positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        traversalSurfaceId: receipt.input.traversalSurface.traversalSurfaceId,
      }
    : {
        kind: "destination-surface-not-found",
        code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
        anchorEntityId: anchor.entityId,
        positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        traversalSurfaceId: receipt.input.traversalSurface.traversalSurfaceId,
      });
}

function isWithinHalfExtents(
  point: Vec3,
  center: Vec3,
  halfExtents: Vec3,
): boolean {
  return point.every((component, axis) =>
    Math.abs(component - center[axis]!) <= halfExtents[axis]!);
}

function deduplicateAdjacent(points: readonly Vec3[]): readonly Vec3[] {
  const result: Vec3[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (
      isNil(previous) ||
      previous[0] !== point[0] ||
      previous[1] !== point[1] ||
      previous[2] !== point[2]
    ) result.push(point);
  }
  return result;
}

function createPathReceipt(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  graph: TraversalGraphV1,
  orderedTraversalNodeIds: readonly string[],
  orderedTraversalEdgeIds: readonly string[],
  orderedPathPositionsMetersXYZ: readonly Vec3[],
): RoutePathReceiptV1 {
  const envelope = receipt.input.capabilityEnvelope;
  let routePathDistanceMeters = 0;
  let segmentSlopeDegrees = 0;
  for (let index = 1; index < orderedPathPositionsMetersXYZ.length; index += 1) {
    const previous = orderedPathPositionsMetersXYZ[index - 1]!;
    const current = orderedPathPositionsMetersXYZ[index]!;
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const dz = current[2] - previous[2];
    routePathDistanceMeters += ceilToQuantum(
      Math.hypot(dx, dy, dz),
      envelope.positionQuantizationMeters,
    );
    const horizontal = Math.hypot(dx, dz);
    segmentSlopeDegrees = Math.max(
      segmentSlopeDegrees,
      ceilToQuantum(
        horizontal === 0 ? 90 : Math.atan2(Math.abs(dy), horizontal) * 180 / Math.PI,
        0.000001,
      ),
    );
  }
  const nodes = orderedTraversalNodeIds.map((nodeId) => {
    const node = graph.traversalNodesById[nodeId];
    if (isNil(node)) fail(`selected Node '${nodeId}' is absent from the Graph.`);
    return node;
  });
  const edges = orderedTraversalEdgeIds.map((edgeId) => {
    const edge = graph.traversalEdgesById[edgeId];
    if (isNil(edge)) fail(`selected Edge '${edgeId}' is absent from the Graph.`);
    return edge;
  });
  const costUnits = edges.reduce((sum, edge) => {
    const units = Math.round(edge.routePathCost / 0.000001);
    if (!Number.isSafeInteger(units) || !Number.isSafeInteger(sum + units)) {
      fail("selected Edge cost exceeds safe integer units.");
    }
    return sum + units;
  }, 0);
  return canonicalRoutePathReceiptV1({
    kind: "route-path-receipt",
    schemaVersion: 1,
    status: "complete",
    constraintId: receipt.input.connectivityRequirement.constraintId,
    routeId: receipt.input.connectivityRequirement.routeId,
    traversingEntityId: receipt.input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: receipt.input.startAnchor.entityId,
    destinationAnchorEntityId: receipt.input.destinationAnchor.entityId,
    traversalGraphHash: hashTraversalGraphV1(graph),
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ,
    routePathDistanceMeters,
    routePathCost: costUnits * 0.000001,
    maximumObservedSlopeDegrees: Math.max(
      segmentSlopeDegrees,
      ...edges.map((edge) => edge.slopeDegrees),
      0,
    ),
    maximumObservedStepHeightMeters: Math.max(
      ...edges.map((edge) => edge.stepHeightMeters),
      0,
    ),
    minimumObservedClearanceWidthMeters: Math.min(
      ...nodes.map((node) => node.clearanceWidthMeters),
      ...edges.map((edge) => edge.minimumClearanceWidthMeters),
    ),
    minimumObservedClearanceHeightMeters: Math.min(
      ...nodes.map((node) => node.clearanceHeightMeters),
      ...edges.map((edge) => edge.minimumClearanceHeightMeters),
    ),
    maximumObservedSurfaceGapMeters: 0,
  });
}

export function queryRequiredRouteV1(
  rawInput: QueryRequiredRouteInputV1,
): HeightfieldRouteConnectivityResultV1 {
  const receipt = assertHeightfieldRouteBuildInputReceiptV1(
    rawInput.buildInputReceipt,
  );
  const { projection, queryProvider, rejectionProofInput } = rawInput;
  const graph = projection.traversalGraph;
  const envelope = receipt.input.capabilityEnvelope;
  const halfExtents: Vec3 = [
    envelope.capsuleRadiusMeters + envelope.clearanceMarginMeters +
      envelope.voxelCellSizeMeters,
    envelope.capsuleHeightMeters / 2 + envelope.maxStepHeightMeters +
      envelope.voxelCellHeightMeters,
    envelope.capsuleRadiusMeters + envelope.clearanceMarginMeters +
      envelope.voxelCellSizeMeters,
  ];
  const startNearest = queryProvider.findNearestPolygon({
    positionMetersXYZ: receipt.input.startAnchor.positionMetersXYZ,
    halfExtentsMetersXYZ: halfExtents,
  });
  if (startNearest.kind === "miss") return endpointFailure(receipt, graph, "start");
  if (!isWithinHalfExtents(
    startNearest.positionMetersXYZ,
    receipt.input.startAnchor.positionMetersXYZ,
    halfExtents,
  )) fail("provider start point escaped the locked endpoint query extents.");
  const startTraversalNodeId = projection.traversalNodeIdByProviderPolygonRef.get(
    startNearest.polygonRef,
  );
  if (isNil(startTraversalNodeId)) return endpointFailure(receipt, graph, "start");

  const destinationNearest = queryProvider.findNearestPolygon({
    positionMetersXYZ: receipt.input.destinationAnchor.positionMetersXYZ,
    halfExtentsMetersXYZ: halfExtents,
  });
  if (destinationNearest.kind === "miss") {
    return endpointFailure(receipt, graph, "destination");
  }
  if (!isWithinHalfExtents(
    destinationNearest.positionMetersXYZ,
    receipt.input.destinationAnchor.positionMetersXYZ,
    halfExtents,
  )) fail("provider destination point escaped the locked endpoint query extents.");
  const destinationTraversalNodeId =
    projection.traversalNodeIdByProviderPolygonRef.get(
      destinationNearest.polygonRef,
    );
  if (isNil(destinationTraversalNodeId)) {
    return endpointFailure(receipt, graph, "destination");
  }

  const selection = selectCanonicalTraversalPathV1({
    traversalGraph: graph,
    startTraversalNodeId,
    destinationTraversalNodeId,
    maximumEdgeLengthMeters: envelope.maximumEdgeLengthMeters,
    positionQuantizationMeters: envelope.positionQuantizationMeters,
    maximumSearchSteps: envelope.maximumSearchSteps,
  });
  if (selection.status === "unreachable") {
    return failureResult(
      receipt,
      "unreachable",
      graph,
      sourceDerivedUnreachableReason(receipt, rejectionProofInput),
    );
  }
  if (selection.status === "incomplete") {
    return failureResult(receipt, "incomplete", graph, {
      kind: "search-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: selection.maximumAllowedCount,
      minimumRequiredCount: selection.minimumRequiredCount,
    });
  }
  const polygonRefs = selection.orderedTraversalNodeIds.map((nodeId) => {
    const providerRef = projection.providerPolygonRefByTraversalNodeId.get(nodeId);
    if (isNil(providerRef)) fail(`selected Node '${nodeId}' has no provider Ref.`);
    return providerRef;
  });
  const straight = queryProvider.findStraightPath({
    startPositionMetersXYZ: startNearest.positionMetersXYZ,
    destinationPositionMetersXYZ: destinationNearest.positionMetersXYZ,
    polygonRefs,
    stableMaximumPointCount: polygonRefs.length + 1,
  });
  if (straight.kind === "capacity-exceeded") {
    return failureResult(receipt, "incomplete", graph, {
      kind: "straight-path-capacity-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: straight.maximumAllowedCount,
      minimumRequiredCount: straight.minimumRequiredCount,
    });
  }
  const providerCorridor = new Set(polygonRefs);
  for (const point of straight.points) {
    if (point.polygonRef !== 0 && !providerCorridor.has(point.polygonRef)) {
      fail("straight-path point references a polygon outside the selected corridor.");
    }
  }
  const quantum = envelope.positionQuantizationMeters;
  const quantizedStart = quantizeVec3(startNearest.positionMetersXYZ, quantum);
  const quantizedDestination = quantizeVec3(
    destinationNearest.positionMetersXYZ,
    quantum,
  );
  const pathPositions = deduplicateAdjacent(
    straight.points.map((point) => quantizeVec3(point.positionMetersXYZ, quantum)),
  );
  if (pathPositions.length === 0) fail("straight path produced no canonical points.");
  const first = pathPositions[0]!;
  const last = pathPositions.at(-1)!;
  if (
    first[0] !== quantizedStart[0] ||
    first[1] !== quantizedStart[1] ||
    first[2] !== quantizedStart[2] ||
    last[0] !== quantizedDestination[0] ||
    last[1] !== quantizedDestination[1] ||
    last[2] !== quantizedDestination[2]
  ) fail("straight path endpoints do not match the provider-clamped endpoints.");
  if (
    pathPositions.length === 1 &&
    (
      quantizedStart[0] !== quantizedDestination[0] ||
      quantizedStart[1] !== quantizedDestination[1] ||
      quantizedStart[2] !== quantizedDestination[2]
    )
  ) fail("a one-point path requires quantized-equal endpoints.");
  const ribbon = createHardRibbonProofV1({
    pointsMetersXZ: receipt.input.hardRibbon.pointsMetersXZ,
    widthMeters: receipt.input.hardRibbon.widthMeters,
  });
  for (const point of pathPositions) {
    if (!isPointInsideHardRibbonV1(ribbon, [point[0], point[2]])) {
      fail("straight-path point escaped the finite hard ribbon.");
    }
  }
  for (let index = 1; index < pathPositions.length; index += 1) {
    const previous = pathPositions[index - 1]!;
    const current = pathPositions[index]!;
    if (!isSegmentInsideHardRibbonV1(
      ribbon,
      [previous[0], previous[2]],
      [current[0], current[2]],
    )) fail("straight-path segment escaped the finite hard ribbon.");
  }
  const path = createPathReceipt(
    receipt,
    graph,
    selection.orderedTraversalNodeIds,
    selection.orderedTraversalEdgeIds,
    pathPositions,
  );
  return completeResult(receipt, graph, path);
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new RouteConnectivityOperationAbortedErrorV1();
}

function unavailableProjectionResult(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  projection: Exclude<HeightfieldTraversalGraphProjectionV1, { status: "complete" }>,
  rejectionProofInput: EvaluateRouteRejectionProofInputV1,
): HeightfieldRouteConnectivityResultV1 {
  if (projection.status === "unavailable") {
    const specialized = routeConnectivityReasonForRejectionProofV1(
      evaluateRouteRejectionProofV1(rejectionProofInput),
    );
    return failureResult(receipt, "unreachable", undefined, specialized ?? {
        kind: "no-queryable-ground-surface",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        terrainEntityId: receipt.input.terrainSource.terrainEntityId,
        traversalSurfaceId: receipt.input.traversalSurface.traversalSurfaceId,
      });
  }
  return failureResult(receipt, "incomplete", undefined, {
    kind: projection.capacityKind === "nodes"
      ? "node-budget-exceeded"
      : "edge-budget-exceeded",
    code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
    maximumAllowedCount: projection.maximumAllowedCount,
    minimumRequiredCount: projection.minimumRequiredCount,
  });
}

export async function evaluateRequiredHeightfieldRouteV1(
  rawInput: EvaluateRequiredHeightfieldRouteInputV1,
): Promise<HeightfieldRouteConnectivityResultV1> {
  const receipt = assertHeightfieldRouteBuildInputReceiptV1(
    rawInput.buildInputReceipt,
  );
  checkAbort(rawInput.abortSignal);
  if (receipt.input.terrainSource.kind === "empty") {
    return failureResult(receipt, "unreachable", undefined, {
      kind: "empty-heightfield-source",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      terrainEntityId: receipt.input.terrainSource.terrainEntityId,
    });
  }

  const rejectionProofInput = buildSourceDerivedRouteRejectionProofInputV1({
    buildInputReceipt: receipt,
    isSourceProjectionConsistent: true,
  });
  if (isNil(rejectionProofInput)) {
    fail("bounded Heightfield source produced no rejection-proof input.");
  }
  checkAbort(rawInput.abortSignal);

  return runRecastProviderOperationV1(async () => {
    checkAbort(rawInput.abortSignal);
    const source = mapHeightfieldRouteBuildInputToRecastSourceV1(receipt.input);
    const tiledResult = generateRetainedTiledNavMeshV1(
      source.positions,
      source.indices,
      mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        receipt.input.capabilityEnvelope,
      ),
      {
        bounds: source.bounds,
        ...(isNil(source.sourceAreaMode)
          ? {}
          : { sourceAreaMode: source.sourceAreaMode }),
      },
    );
    let queryReceipt: RecastQueryProviderReceiptV1 | undefined;
    let value: HeightfieldRouteConnectivityResultV1 | undefined;
    let hasPrimaryError = false;
    let primaryError: unknown;
    try {
      if (!tiledResult.success) fail("Recast tiled NavMesh generation failed.");
      checkAbort(rawInput.abortSignal);
      queryReceipt = createRecastQueryProviderV1(tiledResult.navMesh);
      const projection = buildHeightfieldTraversalGraphV1(
        tiledResult.navMesh,
        receipt,
      );
      checkAbort(rawInput.abortSignal);
      value = projection.status === "complete"
        ? queryRequiredRouteV1({
            projection,
            buildInputReceipt: receipt,
            rejectionProofInput,
            queryProvider: {
              findNearestPolygon: (input) =>
                findNearestRecastPolygonV1(queryReceipt!, input),
              findStraightPath: (input) =>
                findStraightRecastPathV1(queryReceipt!, input),
            },
          })
        : unavailableProjectionResult(receipt, projection, rejectionProofInput);
      checkAbort(rawInput.abortSignal);
    } catch (error) {
      hasPrimaryError = true;
      primaryError = error;
    }

    let hasCleanupError = false;
    let cleanupError: unknown;
    try {
      if (isNil(queryReceipt)) {
        destroyRecastTiledOperationResourcesV1(undefined, tiledResult);
      } else {
        destroyRecastProviderOperationResourcesV1({
          queryProviderReceipt: queryReceipt,
          tiledResult,
        });
      }
    } catch (error) {
      hasCleanupError = true;
      cleanupError = error;
    }
    if (hasPrimaryError && hasCleanupError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "TRAVERSAL_RECAST_ROUTE_OPERATION_AND_CLEANUP_FAILED",
      );
    }
    if (hasPrimaryError) throw primaryError;
    if (hasCleanupError) throw cleanupError;
    if (isNil(value)) fail("provider operation returned no result.");
    return value;
  });
}
