import {
  preflightCanonicalTraversalSurfaceOverlapsV1,
  queryCanonicalTraversalSurfaceHitsV1,
  TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1,
} from "@whitebox-world/terrain-surface";
import {
  assertRouteBuildInputReceiptV2,
  assertRouteConnectivityResultForBuildInputV2,
  canonicalRouteConnectivityFailureV2,
  canonicalRoutePathReceiptV2,
  hashRouteConnectivityFailureV2,
  hashRoutePathReceiptV2,
  hashTraversalGraphV2,
  type RouteBuildInputReceiptV2,
  type RouteConnectivityResultV2,
  type RouteBuildInputV2,
  type RouteConnectivityFailureReasonV2,
  type RouteConnectivityFailureV2,
  type RoutePathReceiptV2,
  type TraversalGraphV2,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import { isEmpty, isNil } from "lodash-es";

import {
  buildTraversalGraphV2,
  type TraversalGraphProjectionV2,
} from "./build-graph.js";
import {
  buildSourceDerivedRouteRejectionProofInputV1,
  buildSourceDerivedRouteRejectionProofInputV2,
} from "./build-rejection-graph.js";
import {
  createHardRibbonProofV1,
  isPointInsideHardRibbonV1,
  isSegmentInsideHardRibbonV1,
} from "./hard-ribbon-proof.js";
import {
  collectBoundTraversalSurfaceQuerySourcesV2,
  collectUnboundStaticCollidersV2,
  mapRouteBuildInputToRecastSourceV2,
} from "./heightfield-source.js";
import {
  destroyRecastProviderOperationResourcesV1,
  destroyRecastTiledOperationResourcesV1,
  generateRetainedTiledNavMeshV1,
  runRecastProviderOperationV1,
} from "./provider-lifecycle.js";
import {
  createRecastQueryProviderV1,
  findNearestRecastPolygonAmongRefsV1,
  findStraightRecastPathV1,
  type FindNearestRecastPolygonAmongRefsInputV1,
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
  type RouteRejectionCandidateV1,
  type RouteRejectionProofEvaluationV1,
} from "./route-rejection-proof.js";

type Vec3 = readonly [number, number, number];

export interface EvaluateRequiredRouteInputV2 {
  readonly buildInputReceipt: RouteBuildInputReceiptV2;
  readonly abortSignal?: AbortSignal;
}

export class RouteConnectivityOperationAbortedErrorV2 extends Error {
  readonly code = "ROUTE_CONNECTIVITY_OPERATION_ABORTED" as const;

  public constructor() {
    super("ROUTE_CONNECTIVITY_OPERATION_ABORTED");
    this.name = "RouteConnectivityOperationAbortedErrorV2";
  }
}

export interface TraversalRouteQueryProviderV1 {
  readonly findNearestPolygon: (
    input: FindNearestRecastPolygonAmongRefsInputV1,
  ) => RecastNearestPolygonResultV1;
  readonly findStraightPath: (
    input: FindStraightRecastPathInputV1,
  ) => RecastStraightPathResultV1;
}

export interface QueryRequiredRouteInputV2 {
  readonly projection: Extract<
    TraversalGraphProjectionV2,
    { readonly status: "complete" }
  >;
  readonly buildInputReceipt: RouteBuildInputReceiptV2;
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


function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new RouteConnectivityOperationAbortedErrorV2();
}



function sortIdentitiesV2(
  identities: readonly TraversalSurfaceIdentityV1[],
): TraversalSurfaceIdentityV1[] {
  return [...identities].sort((left, right) =>
    left.traversalSurfaceId < right.traversalSurfaceId
      ? -1
      : left.traversalSurfaceId > right.traversalSurfaceId
        ? 1
        : 0,
  );
}

function relatedTraversalSurfaceIdentitiesFromSpecializedProofV2(
  proof: RouteRejectionProofEvaluationV1,
  candidates: readonly RouteRejectionCandidateV1[],
  receipt: RouteBuildInputReceiptV2,
): readonly TraversalSurfaceIdentityV1[] {
  if (proof.status !== "specialized") return [];
  const proofCandidateIds = new Set(proof.proofCandidateIds);
  const byTraversalSurfaceId = new Map<string, TraversalSurfaceIdentityV1>();
  for (const candidate of candidates) {
    if (!proofCandidateIds.has(candidate.id)) continue;
    if (isNil(candidate.relatedTraversalSurfaceIdentities)) continue;
    for (const identity of candidate.relatedTraversalSurfaceIdentities) {
      const catalogIdentity = receipt.input.traversalSurfaces.find(
        (surface) => surface.traversalSurfaceId === identity.traversalSurfaceId,
      );
      if (isNil(catalogIdentity)) continue;
      byTraversalSurfaceId.set(catalogIdentity.traversalSurfaceId, catalogIdentity);
    }
  }
  return sortIdentitiesV2([...byTraversalSurfaceId.values()]);
}

function commonFailureFieldsV2(receipt: RouteBuildInputReceiptV2) {
  const input = receipt.input;
  const quantum = input.capabilityEnvelope.positionQuantizationMeters;
  return {
    kind: "route-connectivity-failure" as const,
    schemaVersion: 2 as const,
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
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
  };
}

function failureResultV2(
  receipt: RouteBuildInputReceiptV2,
  status: "unreachable" | "incomplete",
  graph: TraversalGraphV2 | undefined,
  reason: RouteConnectivityFailureReasonV2,
  relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[],
): RouteConnectivityResultV2 {
  const traversalGraphHash = isNil(graph) ? undefined : hashTraversalGraphV2(graph);
  const connectivityFailure = canonicalRouteConnectivityFailureV2({
    ...commonFailureFieldsV2(receipt),
    relatedTraversalSurfaceIdentities,
    status,
    graphStatus: isNil(graph) ? "unavailable" : "complete",
    ...(isNil(traversalGraphHash) ? {} : { traversalGraphHash }),
    reason,
  });
  const connectivityFailureHash = hashRouteConnectivityFailureV2(connectivityFailure);
  return assertRouteConnectivityResultForBuildInputV2(
    isNil(graph)
      ? {
          kind: "route-connectivity-result",
          schemaVersion: 2,
          status,
          graphStatus: "unavailable",
          connectivityFailure,
          connectivityFailureHash,
        }
      : {
          kind: "route-connectivity-result",
          schemaVersion: 2,
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

function completeResultV2(
  receipt: RouteBuildInputReceiptV2,
  graph: TraversalGraphV2,
  path: RoutePathReceiptV2,
): RouteConnectivityResultV2 {
  return assertRouteConnectivityResultForBuildInputV2({
    kind: "route-connectivity-result",
    schemaVersion: 2,
    status: "complete",
    traversalGraph: graph,
    traversalGraphHash: hashTraversalGraphV2(graph),
    routePathReceipt: path,
    routePathReceiptHash: hashRoutePathReceiptV2(path),
  }, receipt);
}

export function genericUnreachableReasonForBuildInputV2(
  receipt: RouteBuildInputReceiptV2,
): RouteConnectivityFailureReasonV2 {
  return {
    kind: "required-path-unreachable",
    code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
    relevantBlockingColliderEntityIds: [...new Set(
      collectUnboundStaticCollidersV2(receipt.input).map((collider) => collider.entityId),
    )].sort(),
    blockedWaterEntityIds: [...new Set(
      receipt.input.blockedWaterExclusions.map((water) => water.waterEntityId),
    )].sort(),
  };
}

export function routeConnectivityReasonForRejectionProofV2(
  proof: RouteRejectionProofEvaluationV1,
  receipt: RouteBuildInputReceiptV2,
): RouteConnectivityFailureReasonV2 | undefined {
  if (proof.status === "generic") return undefined;
  const common = {
    proofKind: proof.proofKind,
    proofCandidateIds: proof.proofCandidateIds,
    failurePositionMetersXYZ: proof.failurePositionMetersXYZ,
  } as const;
  const rejection = proof.rejectionReason;
  let mapped: RouteConnectivityFailureReasonV2;
  switch (rejection.kind) {
    case "slope":
      mapped = {
        ...common,
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        maximumObservedSlopeDegrees: rejection.maximumObservedSlopeDegrees,
        maximumAllowedSlopeDegrees: rejection.maximumAllowedSlopeDegrees,
      };
      break;
    case "step":
      mapped = {
        ...common,
        kind: "step-height-threshold-exceeded",
        code: "ROUTE_STEP_HEIGHT_EXCEEDED",
        maximumObservedStepHeightMeters: rejection.maximumObservedStepHeightMeters,
        maximumAllowedStepHeightMeters: rejection.maximumAllowedStepHeightMeters,
      };
      break;
    case "width":
      mapped = {
        ...common,
        kind: "clearance-width-insufficient",
        code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
        relevantColliderSubshapeIds: rejection.relevantColliderSubshapeIds,
        minimumObservedClearanceWidthMeters:
          rejection.minimumObservedClearanceWidthMeters,
        minimumRequiredClearanceWidthMeters:
          rejection.minimumRequiredClearanceWidthMeters,
      };
      break;
    case "overhead":
      mapped = {
        ...common,
        kind: "overhead-clearance-insufficient",
        code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
        relevantColliderSubshapeIds: rejection.relevantColliderSubshapeIds,
        minimumObservedClearanceHeightMeters:
          rejection.minimumObservedClearanceHeightMeters,
        minimumRequiredClearanceHeightMeters:
          rejection.minimumRequiredClearanceHeightMeters,
      };
      break;
    case "gap":
      mapped = {
        ...common,
        kind: "surface-gap-exceeded",
        code: "ROUTE_SURFACE_GAP_EXCEEDED",
        maximumObservedSurfaceGapMeters:
          rejection.maximumObservedSurfaceGapMeters,
        maximumAllowedSurfaceGapMeters:
          rejection.maximumAllowedSurfaceGapMeters,
      };
      break;
    default:
      return undefined;
  }
  const reason = mapped;
  const envelope = receipt.input.capabilityEnvelope;
  const allowedColliderSubshapeIds = new Set(
    receipt.input.staticColliders.map((collider) => collider.colliderSubshapeId),
  );
  if (reason.kind === "slope-threshold-exceeded") {
    return {
      ...reason,
      maximumAllowedSlopeDegrees: envelope.maxSlopeDegrees,
    };
  }
  if (reason.kind === "step-height-threshold-exceeded") {
    return {
      ...reason,
      maximumAllowedStepHeightMeters: envelope.maxStepHeightMeters,
    };
  }
  if (reason.kind === "clearance-width-insufficient") {
    return {
      ...reason,
      minimumRequiredClearanceWidthMeters:
        2 * (envelope.capsuleRadiusMeters + envelope.clearanceMarginMeters),
      relevantColliderSubshapeIds: reason.relevantColliderSubshapeIds.filter(
        (colliderSubshapeId) => allowedColliderSubshapeIds.has(colliderSubshapeId),
      ),
    };
  }
  if (reason.kind === "overhead-clearance-insufficient") {
    return {
      ...reason,
      minimumRequiredClearanceHeightMeters: envelope.capsuleHeightMeters,
      relevantColliderSubshapeIds: reason.relevantColliderSubshapeIds.filter(
        (colliderSubshapeId) => allowedColliderSubshapeIds.has(colliderSubshapeId),
      ),
    };
  }
  return reason;
}

function sourceDerivedUnreachableReasonV2(
  receipt: RouteBuildInputReceiptV2,
  rejectionProofInput: EvaluateRouteRejectionProofInputV1,
): {
  readonly reason: RouteConnectivityFailureReasonV2;
  readonly relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
} {
  const proof = evaluateRouteRejectionProofV1(rejectionProofInput);
  const specialized = routeConnectivityReasonForRejectionProofV2(
    proof,
    receipt,
  );
  if (isNil(specialized)) {
    return {
      reason: genericUnreachableReasonForBuildInputV2(receipt),
      relatedTraversalSurfaceIdentities: [],
    };
  }
  return {
    reason: specialized,
    relatedTraversalSurfaceIdentities:
      relatedTraversalSurfaceIdentitiesFromSpecializedProofV2(
        proof,
        rejectionProofInput.candidates,
        receipt,
      ),
  };
}

function endpointFailureV2(
  receipt: RouteBuildInputReceiptV2,
  graph: TraversalGraphV2,
  endpoint: "start" | "destination",
): RouteConnectivityResultV2 {
  const anchor = endpoint === "start"
    ? receipt.input.startAnchor
    : receipt.input.destinationAnchor;
  const quantum = receipt.input.capabilityEnvelope.positionQuantizationMeters;
  return failureResultV2(
    receipt,
    "unreachable",
    graph,
    endpoint === "start"
      ? {
          kind: "start-surface-not-found",
          code: "ROUTE_START_SURFACE_NOT_FOUND",
          anchorEntityId: anchor.entityId,
          positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        }
      : {
          kind: "destination-surface-not-found",
          code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
          anchorEntityId: anchor.entityId,
          positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        },
    [],
  );
}

function endpointAmbiguityFailureV2(
  receipt: RouteBuildInputReceiptV2,
  graph: TraversalGraphV2,
  endpoint: "start" | "destination",
  identities: readonly TraversalSurfaceIdentityV1[],
): RouteConnectivityResultV2 {
  const anchor = endpoint === "start"
    ? receipt.input.startAnchor
    : receipt.input.destinationAnchor;
  const quantum = receipt.input.capabilityEnvelope.positionQuantizationMeters;
  return failureResultV2(
    receipt,
    "incomplete",
    graph,
    endpoint === "start"
      ? {
          kind: "start-surface-ambiguous",
          code: "ROUTE_CORRIDOR_LAYER_AMBIGUOUS",
          anchorEntityId: anchor.entityId,
          positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        }
      : {
          kind: "destination-surface-ambiguous",
          code: "ROUTE_CORRIDOR_LAYER_AMBIGUOUS",
          anchorEntityId: anchor.entityId,
          positionMetersXYZ: quantizeVec3(anchor.positionMetersXYZ, quantum),
        },
    sortIdentitiesV2(identities),
  );
}

function endpointSurfaceAdmissionV2(
  receipt: RouteBuildInputReceiptV2,
  graph: TraversalGraphV2,
  endpoint: "start" | "destination",
  maximumReferenceHeightDifferenceMeters: number,
):
  | Readonly<{ mode: "missing" }>
  | Readonly<{
      mode: "ambiguous";
      identities: readonly TraversalSurfaceIdentityV1[];
    }>
  | Readonly<{
      mode: "resolved";
      traversalSurfaceId: string;
    }> {
  const graphSurfaceIds = new Set(
    Object.values(graph.traversalNodesById).map(
      (node) => node.traversalSurfaceId,
    ),
  );
  const sources = collectBoundTraversalSurfaceQuerySourcesV2(receipt.input).filter(
    (source) => graphSurfaceIds.has(source.traversalSurfaceId),
  );
  const anchor = endpoint === "start"
    ? receipt.input.startAnchor
    : receipt.input.destinationAnchor;
  if (isEmpty(sources)) return { mode: "missing" };
  const resolution = queryCanonicalTraversalSurfaceHitsV1({
    sources,
    pointMetersXZ: [
      anchor.positionMetersXYZ[0],
      anchor.positionMetersXYZ[2],
    ],
    referenceHeightMeters: anchor.positionMetersXYZ[1],
    maximumReferenceHeightDifferenceMeters,
    normalAdmission: {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: Math.cos(
        receipt.input.capabilityEnvelope.maxSlopeDegrees * Math.PI / 180,
      ),
    },
  });
  if (resolution.mode === "missing") return { mode: "missing" };
  const hasMultipleHeightLayers = resolution.hits.some(
    (hit) =>
      Math.abs(hit.heightMeters - resolution.hits[0]!.heightMeters) >
      sameBandHeightMetersV2(receipt.input.capabilityEnvelope),
  );
  if (resolution.mode === "ambiguous" || hasMultipleHeightLayers) {
    const hitIds = new Set(
      resolution.hits.map((hit) => hit.traversalSurfaceId),
    );
    return {
      mode: "ambiguous",
      identities: receipt.input.traversalSurfaces.filter((surface) =>
        hitIds.has(surface.traversalSurfaceId)
      ),
    };
  }
  return {
    mode: "resolved",
    traversalSurfaceId: resolution.hit.traversalSurfaceId,
  };
}

function providerPolygonRefsForSurfaceV2(
  projection: Extract<TraversalGraphProjectionV2, { readonly status: "complete" }>,
  traversalSurfaceId: string,
): readonly number[] {
  return [...new Set(
    Object.values(projection.traversalGraph.traversalNodesById)
      .filter((node) => node.traversalSurfaceId === traversalSurfaceId)
      .map((node) => projection.providerPolygonRefByTraversalNodeId.get(node.id))
      .filter((polygonRef): polygonRef is number => !isNil(polygonRef)),
  )].sort((left, right) => left - right);
}

function sameBandHeightMetersV2(envelope: RouteBuildInputV2["capabilityEnvelope"]): number {
  return envelope.positionQuantizationMeters / 2 +
    TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1;
}

function queryPointOnSourcesV2(
  sources: RouteBuildInputV2 extends never ? never : Parameters<
    typeof queryCanonicalTraversalSurfaceHitsV1
  >[0]["sources"],
  positionMetersXYZ: readonly [number, number, number],
  envelope: RouteBuildInputV2["capabilityEnvelope"],
) {
  if (isEmpty(sources)) {
    return { mode: "missing" as const, hits: [] as const };
  }
  return queryCanonicalTraversalSurfaceHitsV1({
    sources,
    pointMetersXZ: [positionMetersXYZ[0], positionMetersXYZ[2]],
    referenceHeightMeters: positionMetersXYZ[1],
    maximumReferenceHeightDifferenceMeters: sameBandHeightMetersV2(envelope),
    normalAdmission: {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: Math.cos(envelope.maxSlopeDegrees * Math.PI / 180),
    },
  });
}

export function preflightRouteBuildInputSurfacesV2(
  input: RouteBuildInputV2,
): ReturnType<typeof preflightCanonicalTraversalSurfaceOverlapsV1> {
  const envelope = input.capabilityEnvelope;
  return preflightCanonicalTraversalSurfaceOverlapsV1({
    sources: collectBoundTraversalSurfaceQuerySourcesV2(input),
    minimumUpwardNormalYRatio: Math.cos(envelope.maxSlopeDegrees * Math.PI / 180),
    maximumSameBandHeightDifferenceMeters: sameBandHeightMetersV2(envelope),
    maximumEquivalentPlaneHeightDifferenceMeters: sameBandHeightMetersV2(envelope),
    minimumEquivalentPlaneNormalDotRatio:
      envelope.minimumEquivalentPlaneNormalDotRatio,
    maximumTraversalSurfaceTrianglePairTestCount:
      envelope.maximumTraversalSurfaceTrianglePairTestCount,
  });
}

function createPathReceiptV2(
  receipt: RouteBuildInputReceiptV2,
  graph: TraversalGraphV2,
  orderedTraversalNodeIds: readonly string[],
  orderedTraversalEdgeIds: readonly string[],
  orderedPathPositionsMetersXYZ: readonly Vec3[],
): RoutePathReceiptV2 {
  const envelope = receipt.input.capabilityEnvelope;
  let routePathDistanceMeters = 0;
  let routePathDistanceMetersXZ = 0;
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
    routePathDistanceMetersXZ += ceilToQuantum(
      horizontal,
      envelope.positionQuantizationMeters,
    );
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
  const orderedTraversalSurfaceIdentities = nodes.map((node) => {
    const identity = graph.traversalSurfaceIdentitiesById[node.traversalSurfaceId];
    if (isNil(identity)) {
      fail(`selected Node '${node.id}' Traversal Surface is absent from inventory.`);
    }
    return identity;
  });
  let maximumObservedSlopeDegrees = segmentSlopeDegrees;
  let maximumObservedStepHeightMeters = 0;
  let minimumObservedClearanceWidthMeters = Number.POSITIVE_INFINITY;
  let minimumObservedClearanceHeightMeters = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    minimumObservedClearanceWidthMeters = Math.min(
      minimumObservedClearanceWidthMeters,
      node.clearanceWidthMeters,
    );
    minimumObservedClearanceHeightMeters = Math.min(
      minimumObservedClearanceHeightMeters,
      node.clearanceHeightMeters,
    );
  }
  for (const edge of edges) {
    maximumObservedSlopeDegrees = Math.max(
      maximumObservedSlopeDegrees,
      edge.slopeDegrees,
    );
    maximumObservedStepHeightMeters = Math.max(
      maximumObservedStepHeightMeters,
      edge.stepHeightMeters,
    );
    minimumObservedClearanceWidthMeters = Math.min(
      minimumObservedClearanceWidthMeters,
      edge.minimumClearanceWidthMeters,
    );
    minimumObservedClearanceHeightMeters = Math.min(
      minimumObservedClearanceHeightMeters,
      edge.minimumClearanceHeightMeters,
    );
  }
  return canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId: receipt.input.connectivityRequirement.constraintId,
    routeId: receipt.input.connectivityRequirement.routeId,
    traversingEntityId: receipt.input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: receipt.input.startAnchor.entityId,
    destinationAnchorEntityId: receipt.input.destinationAnchor.entityId,
    authoringSpecHash: graph.authoringSpecHash,
    layoutSolveReportHash: graph.layoutSolveReportHash,
    resourceLockHash: graph.resourceLockHash,
    traversalGraphHash: hashTraversalGraphV2(graph),
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ,
    orderedTraversalSurfaceIdentities,
    routePathDistanceMeters,
    routePathDistanceMetersXZ,
    routePathCost: costUnits * 0.000001,
    maximumObservedSlopeDegrees,
    maximumObservedStepHeightMeters,
    minimumObservedClearanceWidthMeters,
    minimumObservedClearanceHeightMeters,
    maximumObservedSurfaceGapMeters: 0,
  });
}

export function queryRequiredRouteV2(
  rawInput: QueryRequiredRouteInputV2,
): RouteConnectivityResultV2 {
  const receipt = assertRouteBuildInputReceiptV2(rawInput.buildInputReceipt);
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
  const startSurface = endpointSurfaceAdmissionV2(
    receipt,
    graph,
    "start",
    halfExtents[1],
  );
  if (startSurface.mode === "missing") {
    return endpointFailureV2(receipt, graph, "start");
  }
  if (startSurface.mode === "ambiguous") {
    return endpointAmbiguityFailureV2(
      receipt,
      graph,
      "start",
      startSurface.identities,
    );
  }
  const startNearest = queryProvider.findNearestPolygon({
    positionMetersXYZ: receipt.input.startAnchor.positionMetersXYZ,
    halfExtentsMetersXYZ: halfExtents,
    polygonRefs: providerPolygonRefsForSurfaceV2(
      projection,
      startSurface.traversalSurfaceId,
    ),
  });
  if (startNearest.kind === "miss") return endpointFailureV2(receipt, graph, "start");
  if (!isWithinHalfExtents(
    startNearest.positionMetersXYZ,
    receipt.input.startAnchor.positionMetersXYZ,
    halfExtents,
  )) fail("provider start point escaped the locked endpoint query extents.");
  const startTraversalNodeId = projection.traversalNodeIdByProviderPolygonRef.get(
    startNearest.polygonRef,
  );
  if (isNil(startTraversalNodeId)) return endpointFailureV2(receipt, graph, "start");

  const destinationSurface = endpointSurfaceAdmissionV2(
    receipt,
    graph,
    "destination",
    halfExtents[1],
  );
  if (destinationSurface.mode === "missing") {
    return endpointFailureV2(receipt, graph, "destination");
  }
  if (destinationSurface.mode === "ambiguous") {
    return endpointAmbiguityFailureV2(
      receipt,
      graph,
      "destination",
      destinationSurface.identities,
    );
  }
  const destinationNearest = queryProvider.findNearestPolygon({
    positionMetersXYZ: receipt.input.destinationAnchor.positionMetersXYZ,
    halfExtentsMetersXYZ: halfExtents,
    polygonRefs: providerPolygonRefsForSurfaceV2(
      projection,
      destinationSurface.traversalSurfaceId,
    ),
  });
  if (destinationNearest.kind === "miss") {
    return endpointFailureV2(receipt, graph, "destination");
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
    return endpointFailureV2(receipt, graph, "destination");
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
    const derived = sourceDerivedUnreachableReasonV2(receipt, rejectionProofInput);
    return failureResultV2(
      receipt,
      "unreachable",
      graph,
      derived.reason,
      derived.relatedTraversalSurfaceIdentities,
    );
  }
  if (selection.status === "incomplete") {
    return failureResultV2(receipt, "incomplete", graph, {
      kind: "search-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: envelope.maximumSearchSteps,
      minimumRequiredCount: envelope.maximumSearchSteps + 1,
    }, []);
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
    return failureResultV2(receipt, "incomplete", graph, {
      kind: "straight-path-capacity-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: straight.maximumAllowedCount,
      minimumRequiredCount: straight.minimumRequiredCount,
    }, []);
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
  const straightPathPositions = deduplicateAdjacent(
    straight.points.map((point) => quantizeVec3(point.positionMetersXYZ, quantum)),
  );
  if (straightPathPositions.length === 0) fail("straight path produced no canonical points.");
  const first = straightPathPositions[0]!;
  const last = straightPathPositions.at(-1)!;
  if (
    first[0] !== quantizedStart[0] ||
    first[1] !== quantizedStart[1] ||
    first[2] !== quantizedStart[2] ||
    last[0] !== quantizedDestination[0] ||
    last[1] !== quantizedDestination[1] ||
    last[2] !== quantizedDestination[2]
  ) fail("straight path endpoints do not match the provider-clamped endpoints.");
  const ribbon = createHardRibbonProofV1({
    pointsMetersXZ: receipt.input.hardRibbon.pointsMetersXZ,
    widthMeters: receipt.input.hardRibbon.widthMeters,
  });
  for (const point of straightPathPositions) {
    if (!isPointInsideHardRibbonV1(ribbon, [point[0], point[2]])) {
      fail("straight-path point escaped the finite hard ribbon.");
    }
  }
  for (let index = 1; index < straightPathPositions.length; index += 1) {
    const previous = straightPathPositions[index - 1]!;
    const current = straightPathPositions[index]!;
    if (!isSegmentInsideHardRibbonV1(
      ribbon,
      [previous[0], previous[2]],
      [current[0], current[2]],
    )) fail("straight-path segment escaped the finite hard ribbon.");
  }
  const nodePathPositions = selection.orderedTraversalNodeIds.map((nodeId) => {
    const node = graph.traversalNodesById[nodeId];
    if (isNil(node)) fail(`selected Node '${nodeId}' is absent from the Graph.`);
    const quantized = quantizeVec3(node.positionMetersXYZ, quantum);
    if (!isPointInsideHardRibbonV1(ribbon, [quantized[0], quantized[2]])) {
      fail("selected Node escaped the finite hard ribbon.");
    }
    return quantized;
  });
  if (nodePathPositions.length === 1) {
    nodePathPositions[0] = quantizedStart;
  } else if (nodePathPositions.length > 1) {
    nodePathPositions[0] = quantizedStart;
    nodePathPositions[nodePathPositions.length - 1] = quantizedDestination;
  }
  for (let index = 1; index < nodePathPositions.length; index += 1) {
    const previous = nodePathPositions[index - 1]!;
    const current = nodePathPositions[index]!;
    if (
      previous[0] === current[0] &&
      previous[1] === current[1] &&
      previous[2] === current[2]
    ) {
      fail("selected Node path collapsed adjacent positions.");
    }
    if (!isSegmentInsideHardRibbonV1(
      ribbon,
      [previous[0], previous[2]],
      [current[0], current[2]],
    )) fail("selected Node path escaped the finite hard ribbon.");
  }
  return completeResultV2(
    receipt,
    graph,
    createPathReceiptV2(
      receipt,
      graph,
      selection.orderedTraversalNodeIds,
      selection.orderedTraversalEdgeIds,
      nodePathPositions,
    ),
  );
}

function profileMissingIfUnboundSupportV2(
  receipt: RouteBuildInputReceiptV2,
): RouteConnectivityResultV2 | undefined {
  const input = receipt.input;
  const envelope = input.capabilityEnvelope;
  const boundSources = collectBoundTraversalSurfaceQuerySourcesV2(input);
  const unbound = collectUnboundStaticCollidersV2(input);
  const unboundSources = unbound.map((collider) => ({
    traversalSurfaceId: collider.colliderSubshapeId,
    worldPositionsMetersXYZ: collider.triangleSoup.positionsMetersXYZ,
    triangleIndices: collider.triangleSoup.triangleIndices,
  }));
  for (const anchor of [input.startAnchor, input.destinationAnchor]) {
    const boundHits = queryPointOnSourcesV2(
      boundSources,
      anchor.positionMetersXYZ,
      envelope,
    );
    if (boundHits.mode !== "missing") continue;
    const unboundHits = queryPointOnSourcesV2(
      unboundSources,
      anchor.positionMetersXYZ,
      envelope,
    );
    if (unboundHits.mode === "missing") continue;
    const hitIds = new Set(
      (unboundHits.mode === "resolved" ? [unboundHits.hit, ...unboundHits.hits] : unboundHits.hits)
        .map((hit) => hit.traversalSurfaceId),
    );
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "surface-profile-missing",
      code: "ROUTE_SURFACE_PROFILE_MISSING",
      relevantColliderSubshapeIds: [...hitIds].sort(),
      failurePositionMetersXYZ: quantizeVec3(
        anchor.positionMetersXYZ,
        envelope.positionQuantizationMeters,
      ),
    }, []);
  }
  return undefined;
}

function unavailableProjectionResultV2(
  receipt: RouteBuildInputReceiptV2,
  projection: Exclude<TraversalGraphProjectionV2, { readonly status: "complete" }>,
  rejectionProofInput: EvaluateRouteRejectionProofInputV1 | undefined,
): RouteConnectivityResultV2 {
  if ("reason" in projection && projection.reason === "surface-correlation-missing") {
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "surface-correlation-missing",
      code: "ROUTE_SURFACE_CORRELATION_MISSING",
      failurePositionMetersXYZ: projection.failurePositionMetersXYZ,
    }, projection.relatedTraversalSurfaceIdentities);
  }
  if ("reason" in projection && projection.reason === "surface-correlation-ambiguous") {
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "surface-correlation-ambiguous",
      code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
      failurePositionMetersXYZ: projection.failurePositionMetersXYZ,
    }, projection.relatedTraversalSurfaceIdentities);
  }
  if (projection.status === "unavailable") {
    const proof = isNil(rejectionProofInput)
      ? undefined
      : evaluateRouteRejectionProofV1(rejectionProofInput);
    const specialized = isNil(proof)
      ? undefined
      : routeConnectivityReasonForRejectionProofV2(
          proof,
          receipt,
        );
    if (!isNil(specialized) && !isNil(proof) && !isNil(rejectionProofInput)) {
      return failureResultV2(
        receipt,
        "unreachable",
        undefined,
        specialized,
        relatedTraversalSurfaceIdentitiesFromSpecializedProofV2(
          proof,
          rejectionProofInput.candidates,
          receipt,
        ),
      );
    }
    return failureResultV2(receipt, "unreachable", undefined, {
      kind: "no-queryable-ground-surface",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
    }, []);
  }
  if (!("capacityKind" in projection)) {
    fail("incomplete Graph projection is missing capacity evidence.");
  }
  const envelope = receipt.input.capabilityEnvelope;
  const maximumAllowedCount = projection.capacityKind === "nodes"
    ? envelope.maximumNodes
    : envelope.maximumEdges;
  return failureResultV2(receipt, "incomplete", undefined, {
    kind: projection.capacityKind === "nodes"
      ? "node-budget-exceeded"
      : "edge-budget-exceeded",
    code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
    maximumAllowedCount,
    minimumRequiredCount: maximumAllowedCount + 1,
  }, []);
}

/**
 * Trusted verification seam for exercising a provider-private non-complete
 * Graph projection against the exact admitted Build Input. This is not
 * exported from the package root and does not alter normal evaluation.
 */
export function evaluateUnavailableTraversalGraphProjectionV2(
  rawReceipt: RouteBuildInputReceiptV2,
  projection: Exclude<
    TraversalGraphProjectionV2,
    { readonly status: "complete" }
  >,
): RouteConnectivityResultV2 {
  const receipt = assertRouteBuildInputReceiptV2(rawReceipt);
  return unavailableProjectionResultV2(receipt, projection, undefined);
}

export async function evaluateRequiredRouteV2(
  rawInput: EvaluateRequiredRouteInputV2,
): Promise<RouteConnectivityResultV2> {
  const receipt = assertRouteBuildInputReceiptV2(rawInput.buildInputReceipt);
  checkAbort(rawInput.abortSignal);
  if (
    receipt.input.terrainSource.kind === "empty" &&
    isEmpty(receipt.input.staticColliders)
  ) {
    return failureResultV2(receipt, "unreachable", undefined, {
      kind: "empty-heightfield-source",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      terrainEntityId: receipt.input.terrainSource.terrainEntityId,
    }, []);
  }
  const envelope = receipt.input.capabilityEnvelope;
  if (receipt.input.traversalSurfaces.length > envelope.maximumTraversalSurfaceCount) {
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "traversal-surface-count-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: envelope.maximumTraversalSurfaceCount,
      minimumRequiredCount: envelope.maximumTraversalSurfaceCount + 1,
    }, []);
  }
  const preflight = preflightRouteBuildInputSurfacesV2(receipt.input);
  if (preflight.mode === "budget-exceeded") {
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "traversal-surface-triangle-pair-test-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: envelope.maximumTraversalSurfaceTrianglePairTestCount,
      minimumRequiredCount: envelope.maximumTraversalSurfaceTrianglePairTestCount + 1,
    }, []);
  }
  if (preflight.mode === "blocked") {
    const identities = sortIdentitiesV2(
      receipt.input.traversalSurfaces.filter((surface) =>
        surface.traversalSurfaceId === preflight.blocker.firstTraversalSurfaceId ||
        surface.traversalSurfaceId === preflight.blocker.secondTraversalSurfaceId
      ),
    );
    return failureResultV2(receipt, "incomplete", undefined, {
      kind: "surface-correlation-ambiguous",
      code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
      failurePositionMetersXYZ: quantizeVec3([
        preflight.blocker.witnessPointMetersXZ[0],
        preflight.blocker.firstHeightMeters,
        preflight.blocker.witnessPointMetersXZ[1],
      ], envelope.positionQuantizationMeters),
    }, identities);
  }
  const profileMissing = profileMissingIfUnboundSupportV2(receipt);
  if (!isNil(profileMissing)) return profileMissing;

  const rejectionProofInput = buildSourceDerivedRouteRejectionProofInputV2({
    buildInputReceipt: receipt,
    isSourceProjectionConsistent: true,
  });
  checkAbort(rawInput.abortSignal);

  return runRecastProviderOperationV1(async () => {
    checkAbort(rawInput.abortSignal);
    const source = mapRouteBuildInputToRecastSourceV2(receipt.input);
    const tiledResult = generateRetainedTiledNavMeshV1(
      source.positions,
      source.indices,
      mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(envelope),
      {
        bounds: source.bounds,
        ...(isNil(source.sourceAreaMode) ? {} : { sourceAreaMode: source.sourceAreaMode }),
      },
    );
    let queryReceipt: RecastQueryProviderReceiptV1 | undefined;
    let value: RouteConnectivityResultV2 | undefined;
    let hasPrimaryError = false;
    let primaryError: unknown;
    try {
      if (!tiledResult.success) fail("Recast tiled NavMesh generation failed.");
      checkAbort(rawInput.abortSignal);
      queryReceipt = createRecastQueryProviderV1(tiledResult.navMesh);
      const projection = buildTraversalGraphV2(tiledResult.navMesh, receipt);
      checkAbort(rawInput.abortSignal);
      value = projection.status === "complete"
        ? queryRequiredRouteV2({
            projection,
            buildInputReceipt: receipt,
            queryProvider: {
              findNearestPolygon: (input) =>
                findNearestRecastPolygonAmongRefsV1(queryReceipt!, input),
              findStraightPath: (input) =>
                findStraightRecastPathV1(queryReceipt!, input),
            },
            rejectionProofInput: rejectionProofInput ?? {
              nodeIds: [],
              candidates: [],
              startNodeId: "start",
              destinationNodeId: "destination",
              isSourceProjectionConsistent: true,
              isProofBudgetExhausted: false,
              maximumNodes: envelope.maximumNodes,
              maximumEdges: envelope.maximumEdges,
              maximumSearchSteps: envelope.maximumSearchSteps,
            },
          })
        : unavailableProjectionResultV2(receipt, projection, rejectionProofInput);
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
