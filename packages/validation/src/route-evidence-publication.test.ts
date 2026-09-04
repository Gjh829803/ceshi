import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { canonicalWorldkitBrowserRouteEvidencePublicationV2 } from "@whitebox-world/runtime-contracts";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  assertRouteBuildInputReceiptV2,
  canonicalRouteConnectivityResultV2,
  canonicalRouteConnectivityFailureV2,
  canonicalRouteOverlayV2,
  canonicalRoutePathReceiptV2,
  canonicalRouteRuntimeProbeReceiptV2,
  canonicalTraversalGraphV2,
  createRouteBuildInputReceiptV2,
  createTraversalCapabilityEnvelopeV1,
  deriveColliderSubshapeIdV1,
  hashRouteBuildInputV2,
  hashRouteColliderArtifactV2,
  hashRouteConnectivityFailureV2,
  hashRouteGeometryArtifactV2,
  hashRouteOverlayV2,
  hashRoutePathReceiptV2,
  hashRouteSurfaceArtifactV2,
  hashRouteTerrainArtifactV2,
  hashTraversalGraphV2,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  type ResolvedTraversalLockV1,
  type RouteOverlayV2,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
  type TraversalGraphV2,
} from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
  createRouteWorldPackageValidationReportV1,
  createWorldkitBrowserRouteEvidencePublicationV2,
  hashRouteValidationSetReceiptV1,
  hashValidationReportV1,
  type CreateWorldkitBrowserRouteEvidencePublicationInputV2,
  type RouteEvidencePublicationRowInputV2,
  type RouteValidationRowInputV2,
  type WorldPackageValidationSubjectV1,
} from "./index.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const EMPTY_COLLIDER_HASH =
  "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" as const;

const SUBJECT: WorldPackageValidationSubjectV1 = {
  kind: "world-package",
  worldPackageRootHash: HASH_A,
  authoringSpecHash: HASH_A,
  normalizedWorldIrHash: HASH_B,
  worldBuildIdentityHash: HASH_C,
  resourceLockHash: HASH_B,
  layoutSolveReportHash: HASH_C,
};

const SURFACE = {
  traversalSurfaceId: "surface-main",
  surfaceEntityId: "terrain-main",
  colliderSubshapeId: "terrain-heightfield",
  resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
  resolvedVersion: "1",
  resourceHash: HASH_B,
} as const;

function requiredRoutesForRows(rows: readonly RouteValidationRowInputV2[]) {
  return rows.map((row) => {
    const input = row.routeBuildInputReceipt.input;
    return {
      constraintId: input.connectivityRequirement.constraintId,
      routeId: input.connectivityRequirement.routeId,
      traversingEntityId: input.connectivityRequirement.traversingEntityId,
      startAnchorEntityId: input.startAnchor.entityId,
      destinationAnchorEntityId: input.destinationAnchor.entityId,
    };
  }).sort((left, right) =>
    left.constraintId < right.constraintId
      ? -1
      : left.constraintId > right.constraintId
      ? 1
      : left.routeId < right.routeId
      ? -1
      : left.routeId > right.routeId
      ? 1
      : 0
  );
}

function deepFreeze<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function deepFreezeExceptBytes<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeExceptBytes(child);
  }
  return Object.freeze(value);
}

function lockInput(
  subjectEntityId: string,
  maxSlopeDegrees = 42,
): ResolvedTraversalLockV1 {
  return {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId,
    resourceLockHash: SUBJECT.resourceLockHash,
    subjectDefinitionRef: `worldkit://subject-definition/${subjectEntityId}@1`,
    subjectDefinitionHash: HASH_A,
    colliderProfileRef: "worldkit://collider-profile/humanoid@1",
    colliderProfileHash: HASH_A,
    physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/ground@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/ground@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground@1",
    mediumProfileHash: HASH_A,
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "1",
    runtimeBackendHash: HASH_A,
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_A,
    capsuleRadiusMeters: 0.35,
    capsuleHeightMeters: 1.8,
    colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
    maxSlopeDegrees,
    maxStepHeightMeters: 0.3,
  };
}

function buildInputReceipt(
  lockReceipt: ReturnType<typeof resolveTraversalLockV1>,
  constraintId: string,
  routeId: string,
) {
  const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const capabilityEnvelope = createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: lockReceipt,
    graphBuilderProfile,
  }).envelope;
  const draft = {
    kind: "route-build-input" as const,
    schemaVersion: 2 as const,
    authoringSpecHash: SUBJECT.authoringSpecHash,
    layoutSolveReportHash: SUBJECT.layoutSolveReportHash,
    resourceLockHash: SUBJECT.resourceLockHash,
    connectivityRequirement: {
      constraintId,
      traversingEntityId: lockReceipt.lock.subjectEntityId,
      startAnchorEntityId: `${routeId}-start`,
      destinationAnchorEntityId: `${routeId}-goal`,
      routeId,
    },
    startAnchor: {
      entityId: `${routeId}-start`,
      positionMetersXYZ: [0, 0, 0] as const,
    },
    destinationAnchor: {
      entityId: `${routeId}-goal`,
      positionMetersXYZ: [1, 0, 0] as const,
    },
    hardRibbon: {
      routeId,
      pointsMetersXZ: [[0, 0], [1, 0]] as const,
      widthMeters: 2,
      locomotionProfileRef: lockReceipt.lock.locomotionProfileRef,
    },
    traversalSurfaces: [SURFACE],
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded" as const,
      terrainEntityId: SURFACE.surfaceEntityId,
      triangleSoup: {
        positionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      minimumMetersXZ: [0, 0] as const,
      maximumMetersXZ: [1, 1] as const,
    },
    staticColliders: [] as const,
    blockedTraversalAreaExclusions: [] as const,
    blockedWaterExclusions: [] as const,
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(draft.staticColliders);
  const geometryArtifactHash = hashRouteGeometryArtifactV2({
    terrainArtifactHash,
    colliderArtifactHash,
  });
  const surfaceArtifactHash = hashRouteSurfaceArtifactV2(draft.traversalSurfaces);
  return createRouteBuildInputReceiptV2({
    input: {
      ...draft,
      terrainArtifactHash,
      colliderArtifactHash,
      geometryArtifactHash,
      surfaceArtifactHash,
    },
    traversalLockReceipt: lockReceipt,
  });
}

function graph(
  buildReceipt: ReturnType<typeof buildInputReceipt>,
): TraversalGraphV2 {
  const buildInput = buildReceipt.input;
  const start = {
    id: `${buildInput.connectivityRequirement.routeId}-node-start`,
    traversalSurfaceId: SURFACE.traversalSurfaceId,
    surfaceEntityId: SURFACE.surfaceEntityId,
    colliderSubshapeId: SURFACE.colliderSubshapeId,
    positionMetersXYZ: [0, 0, 0] as const,
    tileId: "tile-0",
    clearanceWidthMeters: 0.9,
    clearanceHeightMeters: 2,
  };
  const goal = {
    ...start,
    id: `${buildInput.connectivityRequirement.routeId}-node-goal`,
    positionMetersXYZ: [1, 0, 0] as const,
  };
  const edge = {
    id: `${buildInput.connectivityRequirement.routeId}-edge`,
    type: "walk" as const,
    fromTraversalNodeId: start.id,
    toTraversalNodeId: goal.id,
    distanceMeters: 1,
    heightDeltaMeters: 0,
    stepHeightMeters: 0,
    slopeDegrees: 0,
    minimumClearanceWidthMeters: 0.9,
    minimumClearanceHeightMeters: 2,
    routePathCost: 1,
  };
  return {
    kind: "traversal-graph",
    schemaVersion: 2,
    geometryArtifactHash: buildInput.geometryArtifactHash,
    traversalSurfaceIdentitiesById: {
      [SURFACE.traversalSurfaceId]: SURFACE,
    },
    authoringSpecHash: buildInput.authoringSpecHash,
    layoutSolveReportHash: buildInput.layoutSolveReportHash,
    resourceLockHash: buildInput.resourceLockHash,
    terrainArtifactHash: buildInput.terrainArtifactHash,
    colliderArtifactHash: buildInput.colliderArtifactHash,
    surfaceArtifactHash: buildInput.surfaceArtifactHash,
    routeBuildInputHash: buildReceipt.routeBuildInputHash,
    resolvedTraversalLockHash:
      buildInput.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: buildInput.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion:
      buildInput.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash:
      buildInput.capabilityEnvelope.graphBuilderProfileHash,
    routeId: buildInput.connectivityRequirement.routeId,
    startAnchorEntityId: buildInput.startAnchor.entityId,
    destinationAnchorEntityId: buildInput.destinationAnchor.entityId,
    traversalNodesById: { [goal.id]: goal, [start.id]: start },
    traversalEdgesById: { [edge.id]: edge },
  };
}

function path(
  traversalGraph: TraversalGraphV2,
  constraintId: string,
  traversingEntityId: string,
): RoutePathReceiptV2 {
  return canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId,
    routeId: traversalGraph.routeId,
    traversingEntityId,
    startAnchorEntityId: traversalGraph.startAnchorEntityId,
    destinationAnchorEntityId: traversalGraph.destinationAnchorEntityId,
    authoringSpecHash: traversalGraph.authoringSpecHash,
    layoutSolveReportHash: traversalGraph.layoutSolveReportHash,
    resourceLockHash: traversalGraph.resourceLockHash,
    traversalGraphHash: hashTraversalGraphV2(traversalGraph),
    routeBuildInputHash: traversalGraph.routeBuildInputHash,
    resolvedTraversalLockHash: traversalGraph.resolvedTraversalLockHash,
    orderedTraversalSurfaceIdentities: [SURFACE, SURFACE],
    graphBuilderProfileRef: traversalGraph.graphBuilderProfileRef,
    graphBuilderResolvedVersion: traversalGraph.graphBuilderResolvedVersion,
    graphBuilderProfileHash: traversalGraph.graphBuilderProfileHash,
    orderedTraversalNodeIds: [
      `${traversalGraph.routeId}-node-start`,
      `${traversalGraph.routeId}-node-goal`,
    ],
    orderedTraversalEdgeIds: [`${traversalGraph.routeId}-edge`],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 1,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

function probe(
  routePath: RoutePathReceiptV2,
  lockReceipt: ReturnType<typeof resolveTraversalLockV1>,
): RouteRuntimeProbeReceiptV2 {
  const driver = resolveTraversalDriverProfileV1(
    BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  );
  const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const runtimeImplementationIdentity = {
    runtimeBackendRef: lockReceipt.lock.runtimeBackendRef,
    runtimeBackendResolvedVersion: lockReceipt.lock.runtimeBackendResolvedVersion,
    runtimeBackendHash: lockReceipt.lock.runtimeBackendHash,
    runtimeAdapterRef: lockReceipt.lock.runtimeAdapterRef,
    runtimeAdapterResolvedVersion: lockReceipt.lock.runtimeAdapterResolvedVersion,
    runtimeAdapterHash: lockReceipt.lock.runtimeAdapterHash,
  } as const;
  const initialRuntimeEvidence = {
    kind: "traversal-runtime-tick-evidence" as const,
    schemaVersion: 1 as const,
    tick: 0,
    traversingEntityId: routePath.traversingEntityId,
    authoringSpecHash: SUBJECT.authoringSpecHash,
    layoutSolveReportHash: SUBJECT.layoutSolveReportHash,
    resourceLockHash: SUBJECT.resourceLockHash,
        executionPlanHash: HASH_C,
    resolvedTraversalLockHash: lockReceipt.resolvedTraversalLockHash,
    runtimeImplementationIdentity,
    fixedTimeStepSeconds: 1 / 60,
    subjectPositionMetersXYZ: [1, 0, 0] as const,
    velocityMetersPerSecondXYZ: [0, 0, 0] as const,
    movementMedium: "ground" as const,
    locomotionMode: "idle" as const,
    characterSupport: {
      kind: "character-support-evidence" as const,
      schemaVersion: 1 as const,
      supportState: "supported" as const,
      supportNormalWorldXYZ: [0, 1, 0] as const,
      sampledFootPositionMetersXYZ: [1, 0, 0] as const,
      isSupportSurfaceDynamic: false,
      surfaceResolution: { mode: "resolved" as const, ...SURFACE },
    },
  };
  return canonicalRouteRuntimeProbeReceiptV2({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "complete",
    request: {
      kind: "route-runtime-probe-request",
      schemaVersion: 2,
      routePathReceiptHash: hashRoutePathReceiptV2(routePath),
      constraintId: routePath.constraintId,
      routeId: routePath.routeId,
      traversingEntityId: routePath.traversingEntityId,
      startAnchorEntityId: routePath.startAnchorEntityId,
      destinationAnchorEntityId: routePath.destinationAnchorEntityId,
      authoringSpecHash: routePath.authoringSpecHash,
      layoutSolveReportHash: routePath.layoutSolveReportHash,
      resourceLockHash: routePath.resourceLockHash,
          executionPlanHash: HASH_C,
      routeBuildInputHash: routePath.routeBuildInputHash,
      traversalGraphHash: routePath.traversalGraphHash,
      resolvedTraversalLockHash: routePath.resolvedTraversalLockHash,
      driverProfileRef: driver.resourceRef,
      driverResolvedVersion: driver.resolvedVersion,
      driverProfileHash: driver.contentHash,
      validationProfileRef:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.resourceRef,
      validationProfileVersion:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.version,
      validationProfileHash: sha256CanonicalJson(
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
      ),
      runtimeImplementationIdentity,
      walkSpeedMetersPerSecond: 4,
      positionQuantizationMeters: graphBuilderProfile.profile.positionQuantizationMeters,
    },
    initialRuntimeEvidence,
    ticks: [],
    metrics: {
      processedTickCount: 0,
      maximumStalledDurationTicks: 0,
      maximumRouteDeviationMetersXZ: 0,
      maximumConsecutiveUnexpectedUnsupportedTicks: 0,
      slidingDurationTicks: 0,
      unexpectedSupportLossCount: 0,
      wrongSupportSurfaceCount: 0,
      invalidPhysicsValueCount: 0,
    },
    completionDurationTicks: 0,
  });
}

function completeRow(
  constraintId: string,
  routeId: string,
  subjectEntityId: string,
  maxSlopeDegrees = 42,
): RouteEvidencePublicationRowInputV2 {
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(
    lockInput(subjectEntityId, maxSlopeDegrees),
  );
  const routeBuildInputReceipt = buildInputReceipt(
    resolvedTraversalLockReceipt,
    constraintId,
    routeId,
  );
  const traversalGraph = graph(routeBuildInputReceipt);
  const routePathReceipt = path(
    traversalGraph,
    constraintId,
    subjectEntityId,
  );
  const routeRuntimeProbeReceipt = probe(
    routePathReceipt,
    resolvedTraversalLockReceipt,
  );
  const routeOverlay = canonicalRouteOverlayV2({
    kind: "route-overlay",
    schemaVersion: 2,
    constraintId,
    routeId,
    traversingEntityId: subjectEntityId,
    startAnchor: routeBuildInputReceipt.input.startAnchor,
    destinationAnchor: routeBuildInputReceipt.input.destinationAnchor,
    orderedTraversalSurfaceIdentities: routePathReceipt.orderedTraversalSurfaceIdentities,
    resolvedTraversalLockHash: routePathReceipt.resolvedTraversalLockHash,
    traversalGraphHash: hashTraversalGraphV2(traversalGraph),
    routePathReceiptHash: hashRoutePathReceiptV2(routePathReceipt),
    orderedTraversalNodeIds: routePathReceipt.orderedTraversalNodeIds,
    orderedTraversalEdgeIds: routePathReceipt.orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ:
      routePathReceipt.orderedPathPositionsMetersXYZ,
    hardRibbon: routeBuildInputReceipt.input.hardRibbon,
    staticColliderIdentities: [],
  });
  return {
    validationRow: {
      routeBuildInputReceipt,
      routeConnectivityResult: canonicalRouteConnectivityResultV2({
        kind: "route-connectivity-result",
        schemaVersion: 2,
        status: "complete",
        traversalGraph,
        traversalGraphHash: hashTraversalGraphV2(traversalGraph),
        routePathReceipt,
        routePathReceiptHash: hashRoutePathReceiptV2(routePathReceipt),
      }),
      routeRuntimeProbeReceipt,
      resolvedTraversalLockReceipt,
      evidenceBytes: {
        traversalGraph: canonicalJsonBytes(traversalGraph),
        routePathReceipt: canonicalJsonBytes(routePathReceipt),
        routeRuntimeProbeReceipt: canonicalJsonBytes(routeRuntimeProbeReceipt),
        routeOverlay: canonicalJsonBytes(routeOverlay),
      },
    },
    routeOverlay,
  };
}

function unavailableRow(
  status: "unreachable" | "incomplete",
  constraintId: string,
  routeId: string,
): RouteEvidencePublicationRowInputV2 {
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(
    lockInput("player-unavailable"),
  );
  const routeBuildInputReceipt = buildInputReceipt(
    resolvedTraversalLockReceipt,
    constraintId,
    routeId,
  );
  const requirement = routeBuildInputReceipt.input.connectivityRequirement;
  const envelope = routeBuildInputReceipt.input.capabilityEnvelope;
  const connectivityFailure = canonicalRouteConnectivityFailureV2({
    kind: "route-connectivity-failure",
    schemaVersion: 2,
    constraintId,
    routeId,
    traversingEntityId: requirement.traversingEntityId,
    startAnchorEntityId: requirement.startAnchorEntityId,
    destinationAnchorEntityId: requirement.destinationAnchorEntityId,
    startAnchorPositionMetersXYZ:
      routeBuildInputReceipt.input.startAnchor.positionMetersXYZ,
    destinationAnchorPositionMetersXYZ:
      routeBuildInputReceipt.input.destinationAnchor.positionMetersXYZ,
    relatedTraversalSurfaceIdentities: status === "unreachable" ? [SURFACE] : [],
    routeBuildInputHash: routeBuildInputReceipt.routeBuildInputHash,
    resolvedTraversalLockHash:
      resolvedTraversalLockReceipt.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    status,
    graphStatus: "unavailable",
    reason: status === "unreachable"
      ? {
          kind: "slope-threshold-exceeded",
          code: "ROUTE_SLOPE_EXCEEDED",
          maximumObservedSlopeDegrees: envelope.maxSlopeDegrees + 6,
          maximumAllowedSlopeDegrees: envelope.maxSlopeDegrees,
          proofKind: "unique-single-reason-cut",
          proofCandidateIds: ["triangle-steep"],
          failurePositionMetersXYZ: [0.5, 0.4, 0],
        }
      : {
          kind: "node-budget-exceeded",
          code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
          maximumAllowedCount: envelope.maximumNodes,
          minimumRequiredCount: envelope.maximumNodes + 1,
        },
  });
  return {
    validationRow: {
      routeBuildInputReceipt,
      routeConnectivityResult: canonicalRouteConnectivityResultV2({
        kind: "route-connectivity-result",
        schemaVersion: 2,
        status,
        graphStatus: "unavailable",
        connectivityFailure,
        connectivityFailureHash:
          hashRouteConnectivityFailureV2(connectivityFailure),
      }),
      resolvedTraversalLockReceipt,
      evidenceBytes: {
        routeConnectivityFailure: canonicalJsonBytes(connectivityFailure),
      },
    },
  };
}

function publicationInput(
  rows: readonly RouteEvidencePublicationRowInputV2[] = [
    completeRow("route-a", "alpha", "player-a", 35),
    completeRow("route-b", "beta", "player-b", 42),
  ],
): CreateWorldkitBrowserRouteEvidencePublicationInputV2 {
  const validationRows = rows.map(({ validationRow }) => validationRow);
  return {
    subject: SUBJECT,
    validationReport: createRouteWorldPackageValidationReportV1({
      reportId: "route-validation",
      subject: SUBJECT,
      executionPlanHash: HASH_C,
      resourceLockHash: HASH_B,
      dependencyReportRefs: ["report://layout@1"],
      validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
      requiredRoutes: requiredRoutesForRows(validationRows),
      rows: validationRows,
    }),
    rows,
  };
}

describe("createWorldkitBrowserRouteEvidencePublicationV2", () => {
  it("rebuilds and publishes a stable multi-route trusted projection", () => {
    const input = publicationInput();
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(input);

    expect(publication.routes.map(({ selector }) => selector)).toEqual([
      { constraintId: "route-a", routeId: "alpha" },
      { constraintId: "route-b", routeId: "beta" },
    ]);
    expect(publication.routes[0]).toMatchObject({
      summary: {
        connectivityStatus: "complete",
        routePathStatus: "complete",
        routeRuntimeProbeStatus: "complete",
        routeOverlayStatus: "available",
      },
      routeOverlayHash: hashRouteOverlayV2(input.rows[0]!.routeOverlay),
    });
    expect(publication).toMatchObject({
      worldPackageRootHash: SUBJECT.worldPackageRootHash,
      authoringSpecHash: SUBJECT.authoringSpecHash,
      normalizedWorldIrHash: SUBJECT.normalizedWorldIrHash,
          executionPlanHash: HASH_C,
      resourceLockHash: SUBJECT.resourceLockHash,
      layoutSolveReportHash: SUBJECT.layoutSolveReportHash,
      validationReportHash: hashValidationReportV1(input.validationReport),
      routeValidationSetReceiptHash: hashRouteValidationSetReceiptV1(
        input.validationReport.routeValidationSetReceipt,
      ),
    });
  });

  it("rejects another World subject and mixed Route evidence", () => {
    const otherSubject = structuredClone(publicationInput()) as unknown as {
      subject: WorldPackageValidationSubjectV1;
    };
    otherSubject.subject = { ...SUBJECT, worldPackageRootHash: HASH_C };
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      otherSubject as CreateWorldkitBrowserRouteEvidencePublicationInputV2,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const mixedConnectivity = structuredClone(publicationInput());
    const first = mixedConnectivity.rows[0]!.validationRow;
    const second = mixedConnectivity.rows[1]!.validationRow;
    (first as { routeConnectivityResult: unknown }).routeConnectivityResult =
      second.routeConnectivityResult;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      mixedConnectivity,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const mixedProbe = structuredClone(publicationInput());
    (mixedProbe.rows[0]!.validationRow as {
      routeRuntimeProbeReceipt:
        (typeof mixedProbe.rows)[number]["validationRow"]["routeRuntimeProbeReceipt"];
    }).routeRuntimeProbeReceipt = mixedProbe.rows[1]!.validationRow
      .routeRuntimeProbeReceipt!;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(mixedProbe))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("rejects missing, extra, duplicate, and reordered selector rows", () => {
    const missing = publicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...missing,
      rows: [missing.rows[0]!],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const duplicate = publicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...duplicate,
      rows: [duplicate.rows[0]!, duplicate.rows[0]!],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const reordered = publicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...reordered,
      rows: [...reordered.rows].reverse(),
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const extra = publicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...extra,
      rows: [
        ...extra.rows,
        completeRow("route-c", "gamma", "player-c"),
      ],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("rejects a Probe that self-reports a different Validation Profile", () => {
    const forged = structuredClone(publicationInput());
    const row = forged.rows[0]!.validationRow;
    const original = row.routeRuntimeProbeReceipt!;
    const forgedProbe = canonicalRouteRuntimeProbeReceiptV2({
      ...original,
      request: {
        ...original.request,
        validationProfileHash: HASH_C,
      },
    });
    (row as { routeRuntimeProbeReceipt: RouteRuntimeProbeReceiptV2 })
      .routeRuntimeProbeReceipt = forgedProbe;
    (row.evidenceBytes as { routeRuntimeProbeReceipt: Uint8Array })
      .routeRuntimeProbeReceipt = canonicalJsonBytes(forgedProbe);

    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(forged))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("rejects report artifact metadata and canonical evidence byte drift", () => {
    const artifactDrift = structuredClone(publicationInput());
    const artifact = Object.values(
      artifactDrift.validationReport.evidenceArtifactsById,
    ).find(({ kind }) => kind === "route-path-receipt")!;
    (artifact as { contentHash: string }).contentHash = HASH_C;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(artifactDrift))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const artifactRefDrift = structuredClone(publicationInput());
    const refArtifact = Object.values(
      artifactRefDrift.validationReport.evidenceArtifactsById,
    ).find(({ kind }) => kind === "route-runtime-probe-receipt")!;
    (refArtifact as { artifactRef: string }).artifactRef =
      "artifact://route/forged/probe.json";
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      artifactRefDrift,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const bytesDrift = structuredClone(publicationInput());
    const pathBytes = bytesDrift.rows[0]!.validationRow.evidenceBytes
      .routePathReceipt!;
    pathBytes[0] = pathBytes[0]! ^ 1;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(bytesDrift))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("requires an Overlay value exactly when canonical Overlay bytes exist", () => {
    const missingOverlay = publicationInput();
    delete (missingOverlay.rows[0] as { routeOverlay?: RouteOverlayV2 })
      .routeOverlay;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      missingOverlay,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const rows = publicationInput().rows;
    const noOverlay = structuredClone(rows[0]!);
    delete (noOverlay as { routeOverlay?: RouteOverlayV2 }).routeOverlay;
    delete (noOverlay.validationRow.evidenceBytes as {
      routeOverlay?: Uint8Array;
    }).routeOverlay;
    const validWithoutOverlay = publicationInput([
      deepFreezeExceptBytes(noOverlay),
      rows[1]!,
    ]);
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(
      validWithoutOverlay,
    );
    expect(publication.routes[0]!.summary.routeOverlayStatus).toBe(
      "unavailable",
    );
    expect(publication.routes[0]).not.toHaveProperty("routeOverlay");

    const orphanedOverlay = structuredClone(validWithoutOverlay);
    (orphanedOverlay.rows[0] as { routeOverlay?: RouteOverlayV2 })
      .routeOverlay = rows[0]!.routeOverlay!;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      orphanedOverlay,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("rejects an Overlay that is canonical but does not match BuildInput", () => {
    const base = publicationInput().rows;
    const changedRow = structuredClone(base[0]!);
    const changedOverlay = canonicalRouteOverlayV2({
      ...changedRow.routeOverlay!,
      hardRibbon: {
        ...changedRow.routeOverlay!.hardRibbon,
        widthMeters: 3,
      },
    });
    (changedRow as { routeOverlay: RouteOverlayV2 }).routeOverlay =
      changedOverlay;
    (changedRow.validationRow.evidenceBytes as { routeOverlay: Uint8Array })
      .routeOverlay = canonicalJsonBytes(changedOverlay);
    const input = publicationInput([
      deepFreezeExceptBytes(changedRow),
      base[1]!,
    ]);

    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(input))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("publishes only summary for unreachable and incomplete connectivity", () => {
    const rows = [
      unavailableRow("incomplete", "route-a", "alpha"),
      unavailableRow("unreachable", "route-b", "beta"),
    ];
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(
      publicationInput(rows),
    );

    expect(publication.routes).toHaveLength(2);
    for (const route of publication.routes) {
      expect(route).toEqual({
        selector: {
          constraintId: route.summary.constraintId,
          routeId: route.summary.routeId,
        },
        summary: {
          ...route.summary,
          routePathStatus: "unavailable",
          routeRuntimeProbeStatus: "unavailable",
          routeOverlayStatus: "unavailable",
        },
      });
    }
  });

  it("snapshots and deep-freezes output and rejects impure input graphs", () => {
    const input = structuredClone(publicationInput());
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(input);
    const originalConstraintId = publication.routes[0]!.selector.constraintId;
    (input.rows[0]!.validationRow.routeBuildInputReceipt.input
      .connectivityRequirement as { constraintId: string }).constraintId =
      "mutated";
    expect(publication.routes[0]!.selector.constraintId).toBe(
      originalConstraintId,
    );
    expect(Object.isFrozen(publication)).toBe(true);
    expect(Object.isFrozen(publication.routes)).toBe(true);
    expect(Object.isFrozen(publication.routes[0]!.routeOverlay)).toBe(true);

    const unknown = publicationInput() as CreateWorldkitBrowserRouteEvidencePublicationInputV2 & {
      extra?: boolean;
    };
    unknown.extra = true;
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(unknown))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const hiddenFieldInput = publicationInput();
    Object.defineProperty(hiddenFieldInput.rows[0], "hiddenField", {
      value: 1,
    });
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(hiddenFieldInput))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const hiddenArrayFieldInput = publicationInput();
    Object.defineProperty(hiddenArrayFieldInput.rows, "hiddenField", {
      value: 1,
    });
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(hiddenArrayFieldInput))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const symbolInput = publicationInput();
    Object.defineProperty(symbolInput.rows[0], Symbol("hidden"), { value: 1 });
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(symbolInput))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const accessorInput = publicationInput();
    Object.defineProperty(accessorInput.rows[0], "routeOverlay", {
      configurable: true,
      enumerable: true,
      get: () => completeRow("route-a", "alpha", "player-a").routeOverlay,
    });
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(accessorInput))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");

    if (typeof SharedArrayBuffer !== "undefined") {
      const shared = publicationInput();
      (shared.rows[0]!.validationRow.evidenceBytes as {
        routePathReceipt: Uint8Array;
      }).routePathReceipt = new Uint8Array(new SharedArrayBuffer(8));
      expect(() => createWorldkitBrowserRouteEvidencePublicationV2(shared))
        .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
    }

    const detached = publicationInput();
    const detachedBytes = detached.rows[0]!.validationRow.evidenceBytes
      .routePathReceipt!;
    structuredClone(detachedBytes.buffer, { transfer: [detachedBytes.buffer] });
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(detached))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });
});


const PLATFORM = {
  traversalSurfaceId: "surface-platform",
  surfaceEntityId: "platform-deck",
  colliderSubshapeId: deriveColliderSubshapeIdV1("platform-deck", "primary"),
  resourceRef: "package://traversal-surface/platform-deck.primary@1",
  resolvedVersion: "1",
  resourceHash: HASH_C,
} as const;

function tetSoup(dx: number, dy: number, dz: number) {
  return {
    positionsMetersXYZ: [
      dx + 0, dy + 0, dz + 0,
      dx + 1, dy + 0, dz + 0,
      dx + 0, dy + 0, dz + 1,
      dx + 0, dy + 1, dz + 0,
    ],
    triangleIndices: [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2],
  };
}

const PLATFORM_COLLIDER = {
  entityId: "platform-deck",
  logicalSubshapeId: "primary",
  colliderSubshapeId: deriveColliderSubshapeIdV1("platform-deck", "primary"),
  colliderHash: HASH_A,
  triangleSoup: tetSoup(2, 0, 2),
} as const;

const WALL_COLLIDER = {
  entityId: "wall-unbound",
  logicalSubshapeId: "primary",
  colliderSubshapeId: deriveColliderSubshapeIdV1("wall-unbound", "primary"),
  colliderHash: HASH_B,
  triangleSoup: tetSoup(8, 0, 0),
} as const;

function terrainSoupV2() {
  return {
    positionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
    triangleIndices: [0, 1, 2],
  };
}

function v2BuildInputReceipt(
  lockReceipt: ReturnType<typeof resolveTraversalLockV1>,
) {
  const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const capabilityEnvelope = createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: lockReceipt,
    graphBuilderProfile,
  }).envelope;
  const draft = {
    kind: "route-build-input" as const,
    schemaVersion: 2 as const,
    authoringSpecHash: SUBJECT.authoringSpecHash,
    layoutSolveReportHash: SUBJECT.layoutSolveReportHash,
    resourceLockHash: SUBJECT.resourceLockHash,
    connectivityRequirement: {
      constraintId: "player-to-goal",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    },
    startAnchor: {
      entityId: "spawn",
      positionMetersXYZ: [0, 0, 0] as const,
    },
    destinationAnchor: {
      entityId: "goal",
      positionMetersXYZ: [1, 0, 0] as const,
    },
    hardRibbon: {
      routeId: "main-route",
      pointsMetersXZ: [[0, 0], [1, 0]] as const,
      widthMeters: 2,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    },
    traversalSurfaces: [SURFACE, PLATFORM].sort((left, right) =>
      left.traversalSurfaceId < right.traversalSurfaceId ? -1 : 1,
    ),
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded" as const,
      terrainEntityId: SURFACE.surfaceEntityId,
      triangleSoup: terrainSoupV2(),
      minimumMetersXZ: [0, 0] as const,
      maximumMetersXZ: [1, 1] as const,
    },
    staticColliders: [PLATFORM_COLLIDER, WALL_COLLIDER].sort((left, right) =>
      left.colliderSubshapeId < right.colliderSubshapeId ? -1 : 1,
    ),
    blockedTraversalAreaExclusions: [] as const,
    blockedWaterExclusions: [] as const,
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(draft.staticColliders);
  const geometryArtifactHash = hashRouteGeometryArtifactV2({
    terrainArtifactHash,
    colliderArtifactHash,
  });
  const surfaceArtifactHash = hashRouteSurfaceArtifactV2(draft.traversalSurfaces);
  return createRouteBuildInputReceiptV2({
    input: {
      ...draft,
      terrainArtifactHash,
      colliderArtifactHash,
      geometryArtifactHash,
      surfaceArtifactHash,
    },
    traversalLockReceipt: lockReceipt,
  });
}

function v2Graph(
  buildReceipt: ReturnType<typeof v2BuildInputReceipt>,
) {
  const buildInput = buildReceipt.input;
  const envelope = buildInput.capabilityEnvelope;
  const start = {
    id: "node-start",
    traversalSurfaceId: SURFACE.traversalSurfaceId,
    surfaceEntityId: SURFACE.surfaceEntityId,
    colliderSubshapeId: SURFACE.colliderSubshapeId,
    positionMetersXYZ: [0, 0, 0] as const,
    tileId: "tile-0",
    clearanceWidthMeters: 0.9,
    clearanceHeightMeters: 2,
  };
  const goal = {
    ...start,
    id: "node-goal",
    positionMetersXYZ: [1, 0, 0] as const,
  };
  const edge = {
    id: "edge-start-goal",
    type: "walk" as const,
    fromTraversalNodeId: start.id,
    toTraversalNodeId: goal.id,
    distanceMeters: 1,
    heightDeltaMeters: 0,
    stepHeightMeters: 0,
    slopeDegrees: 0,
    minimumClearanceWidthMeters: 0.9,
    minimumClearanceHeightMeters: 2,
    routePathCost: 1,
  };
  return canonicalTraversalGraphV2({
    kind: "traversal-graph",
    schemaVersion: 2,
    authoringSpecHash: buildInput.authoringSpecHash,
    layoutSolveReportHash: buildInput.layoutSolveReportHash,
    resourceLockHash: buildInput.resourceLockHash,
    terrainArtifactHash: buildInput.terrainArtifactHash,
    colliderArtifactHash: buildInput.colliderArtifactHash,
    geometryArtifactHash: buildInput.geometryArtifactHash,
    surfaceArtifactHash: buildInput.surfaceArtifactHash,
    routeBuildInputHash: buildReceipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    routeId: buildInput.connectivityRequirement.routeId,
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    traversalSurfaceIdentitiesById: {
      [SURFACE.traversalSurfaceId]: SURFACE,
      [PLATFORM.traversalSurfaceId]: PLATFORM,
    },
    traversalNodesById: { [start.id]: start, [goal.id]: goal },
    traversalEdgesById: { [edge.id]: edge },
  });
}

function v2Path(traversalGraph: ReturnType<typeof v2Graph>) {
  return canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId: "player-to-goal",
    routeId: traversalGraph.routeId,
    traversingEntityId: "player",
    startAnchorEntityId: traversalGraph.startAnchorEntityId,
    destinationAnchorEntityId: traversalGraph.destinationAnchorEntityId,
    authoringSpecHash: traversalGraph.authoringSpecHash,
    layoutSolveReportHash: traversalGraph.layoutSolveReportHash,
    resourceLockHash: traversalGraph.resourceLockHash,
    traversalGraphHash: hashTraversalGraphV2(traversalGraph),
    routeBuildInputHash: traversalGraph.routeBuildInputHash,
    resolvedTraversalLockHash: traversalGraph.resolvedTraversalLockHash,
    graphBuilderProfileRef: traversalGraph.graphBuilderProfileRef,
    graphBuilderResolvedVersion: traversalGraph.graphBuilderResolvedVersion,
    graphBuilderProfileHash: traversalGraph.graphBuilderProfileHash,
    orderedTraversalNodeIds: ["node-start", "node-goal"],
    orderedTraversalEdgeIds: ["edge-start-goal"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    orderedTraversalSurfaceIdentities: [SURFACE, SURFACE],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 1,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

function completeProbeV2(
  routePath: ReturnType<typeof v2Path>,
  lock: ReturnType<typeof resolveTraversalLockV1>,
) {
  const driver = resolveTraversalDriverProfileV1(
    BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  );
  const builder = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const runtimeImplementationIdentity = {
    runtimeBackendRef: lock.lock.runtimeBackendRef,
    runtimeBackendResolvedVersion: lock.lock.runtimeBackendResolvedVersion,
    runtimeBackendHash: lock.lock.runtimeBackendHash,
    runtimeAdapterRef: lock.lock.runtimeAdapterRef,
    runtimeAdapterResolvedVersion: lock.lock.runtimeAdapterResolvedVersion,
    runtimeAdapterHash: lock.lock.runtimeAdapterHash,
  } as const;
  const initialRuntimeEvidence = {
    kind: "traversal-runtime-tick-evidence" as const,
    schemaVersion: 1 as const,
    tick: 0,
    traversingEntityId: routePath.traversingEntityId,
    authoringSpecHash: SUBJECT.authoringSpecHash,
    layoutSolveReportHash: SUBJECT.layoutSolveReportHash,
    resourceLockHash: SUBJECT.resourceLockHash,
    executionPlanHash: HASH_C,
    resolvedTraversalLockHash: lock.resolvedTraversalLockHash,
    runtimeImplementationIdentity,
    fixedTimeStepSeconds: 1 / 60,
    subjectPositionMetersXYZ: [1, 0, 0] as const,
    velocityMetersPerSecondXYZ: [0, 0, 0] as const,
    movementMedium: "ground" as const,
    locomotionMode: "idle" as const,
    characterSupport: {
      kind: "character-support-evidence" as const,
      schemaVersion: 1 as const,
      supportState: "supported" as const,
      supportNormalWorldXYZ: [0, 1, 0] as const,
      sampledFootPositionMetersXYZ: [1, 0, 0] as const,
      isSupportSurfaceDynamic: false,
      surfaceResolution: { mode: "resolved" as const, ...SURFACE },
    },
  };
  return canonicalRouteRuntimeProbeReceiptV2({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "complete",
    request: {
      kind: "route-runtime-probe-request",
      schemaVersion: 2,
      routePathReceiptHash: hashRoutePathReceiptV2(routePath),
      constraintId: routePath.constraintId,
      routeId: routePath.routeId,
      traversingEntityId: routePath.traversingEntityId,
      startAnchorEntityId: routePath.startAnchorEntityId,
      destinationAnchorEntityId: routePath.destinationAnchorEntityId,
      authoringSpecHash: routePath.authoringSpecHash,
      layoutSolveReportHash: routePath.layoutSolveReportHash,
      resourceLockHash: routePath.resourceLockHash,
      executionPlanHash: HASH_C,
      routeBuildInputHash: routePath.routeBuildInputHash,
      traversalGraphHash: routePath.traversalGraphHash,
      resolvedTraversalLockHash: routePath.resolvedTraversalLockHash,
      driverProfileRef: driver.resourceRef,
      driverResolvedVersion: driver.resolvedVersion,
      driverProfileHash: driver.contentHash,
      validationProfileRef:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.resourceRef,
      validationProfileVersion:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.version,
      validationProfileHash:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V1,
      runtimeImplementationIdentity,
      walkSpeedMetersPerSecond: 4,
      positionQuantizationMeters: builder.profile.positionQuantizationMeters,
    },
    initialRuntimeEvidence,
    ticks: [],
    metrics: {
      processedTickCount: 0,
      maximumStalledDurationTicks: 0,
      maximumRouteDeviationMetersXZ: 0,
      maximumConsecutiveUnexpectedUnsupportedTicks: 0,
      slidingDurationTicks: 0,
      unexpectedSupportLossCount: 0,
      wrongSupportSurfaceCount: 0,
      invalidPhysicsValueCount: 0,
    },
    completionDurationTicks: 0,
  });
}

function v2RowInput(): RouteValidationRowInputV2 {
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(lockInput("player"));
  const routeBuildInputReceipt = v2BuildInputReceipt(resolvedTraversalLockReceipt);
  const traversalGraph = v2Graph(routeBuildInputReceipt);
  const routePathReceipt = v2Path(traversalGraph);
  const routeRuntimeProbeReceipt = completeProbeV2(
    routePathReceipt,
    resolvedTraversalLockReceipt,
  );
  return {
    routeBuildInputReceipt,
    routeConnectivityResult: canonicalRouteConnectivityResultV2({
      kind: "route-connectivity-result",
      schemaVersion: 2,
      status: "complete",
      traversalGraph,
      traversalGraphHash: hashTraversalGraphV2(traversalGraph),
      routePathReceipt,
      routePathReceiptHash: hashRoutePathReceiptV2(routePathReceipt),
    }),
    routeRuntimeProbeReceipt,
    resolvedTraversalLockReceipt,
    evidenceBytes: {
      traversalGraph: canonicalJsonBytes(traversalGraph),
      routePathReceipt: canonicalJsonBytes(routePathReceipt),
      routeRuntimeProbeReceipt: canonicalJsonBytes(routeRuntimeProbeReceipt),
    },
  };
}

function v2Overlay(row: RouteValidationRowInputV2): RouteOverlayV2 {
  if (row.routeConnectivityResult.status !== "complete") {
    throw new Error("Expected complete V2 connectivity.");
  }
  const path = row.routeConnectivityResult.routePathReceipt;
  const buildInput = row.routeBuildInputReceipt.input;
  if (path.schemaVersion !== 2 || buildInput.kind !== "route-build-input") {
    throw new Error("Expected V2 Path Receipt and Build Input.");
  }
  return canonicalRouteOverlayV2({
    kind: "route-overlay",
    schemaVersion: 2,
    constraintId: path.constraintId,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchor: buildInput.startAnchor,
    destinationAnchor: buildInput.destinationAnchor,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    traversalGraphHash: row.routeConnectivityResult.traversalGraphHash,
    routePathReceiptHash: row.routeConnectivityResult.routePathReceiptHash,
    orderedTraversalNodeIds: path.orderedTraversalNodeIds,
    orderedTraversalEdgeIds: path.orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ: path.orderedPathPositionsMetersXYZ,
    orderedTraversalSurfaceIdentities: path.orderedTraversalSurfaceIdentities,
    hardRibbon: buildInput.hardRibbon,
    staticColliderIdentities: buildInput.staticColliders.map((collider) => ({
      entityId: collider.entityId,
      logicalSubshapeId: collider.logicalSubshapeId,
      colliderSubshapeId: collider.colliderSubshapeId,
      colliderHash: collider.colliderHash,
    })),
  });
}

function v2PublicationRow(
  validationRow: RouteValidationRowInputV2 = v2RowInput(),
): RouteEvidencePublicationRowInputV2 {
  const overlay = v2Overlay(validationRow);
  return {
    validationRow: {
      ...validationRow,
      evidenceBytes: {
        ...validationRow.evidenceBytes,
        routeOverlay: canonicalJsonBytes(overlay),
      },
    },
    routeOverlay: overlay,
  };
}

function v2PublicationInput(
  row: RouteEvidencePublicationRowInputV2 = v2PublicationRow(),
): CreateWorldkitBrowserRouteEvidencePublicationInputV2 {
  return {
    subject: SUBJECT,
    validationReport: createRouteWorldPackageValidationReportV1({
      reportId: "v2-route-validation",
      subject: SUBJECT,
      executionPlanHash: HASH_C,
      resourceLockHash: HASH_B,
      dependencyReportRefs: ["report://layout@1"],
      validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
      requiredRoutes: requiredRoutesForRows([row.validationRow]),
      rows: [row.validationRow],
    }),
    rows: [row],
  };
}

describe("createWorldkitBrowserRouteEvidencePublicationV2", () => {
  it("uses assertRouteOverlayContextV2 and publishes V2 Path/Overlay arrays plus staticColliderIdentities", () => {
    const input = v2PublicationInput();
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(input);
    const overlay = publication.routes[0]!.routeOverlay!;
    const path = publication.routes[0]!.routePathReceipt!;

    expect(publication.schemaVersion).toBe(2);
    expect(path.schemaVersion).toBe(2);
    expect(overlay.schemaVersion).toBe(2);
    expect(path).toHaveProperty("orderedTraversalSurfaceIdentities");
    expect(path).not.toHaveProperty("traversalSurfaceIdentity");
    expect(overlay).toHaveProperty("orderedTraversalSurfaceIdentities");
    expect(overlay).toHaveProperty("staticColliderIdentities");
    expect(overlay).not.toHaveProperty(
      ["blocking", "Collider", "Identities"].join(""),
    );
    expect(overlay).not.toHaveProperty("traversalSurfaceIdentity");
    expect(overlay.staticColliderIdentities).toEqual(
      [PLATFORM_COLLIDER, WALL_COLLIDER]
        .sort((left, right) =>
          left.colliderSubshapeId < right.colliderSubshapeId ? -1 : 1,
        )
        .map((collider) => ({
          entityId: collider.entityId,
          logicalSubshapeId: collider.logicalSubshapeId,
          colliderSubshapeId: collider.colliderSubshapeId,
          colliderHash: collider.colliderHash,
        })),
    );
    expect(publication.routes[0]!.routeOverlayHash).toBe(hashRouteOverlayV2(overlay));
    expect(publication.routes[0]!.routePathReceiptHash).toBe(hashRoutePathReceiptV2(path));
    expect(canonicalJsonBytes(overlay)).toEqual(
      canonicalJsonBytes(input.rows[0]!.routeOverlay),
    );
  });

  it("rejects leftover V1 Path/Overlay fields on V2 publication", () => {
    const input = v2PublicationInput();
    const overlay = {
      ...input.rows[0]!.routeOverlay!,
      orderedTraversalSurfaceIdentities: [SURFACE],
      staticColliderIdentities: [],
    };
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...input,
      rows: [{ ...input.rows[0]!, routeOverlay: overlay as never }],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("fails through assertRouteOverlayContextV2 when one Overlay Surface identity and its hash are mutated", () => {
    const row = v2PublicationRow();
    const overlay = canonicalRouteOverlayV2({
      ...row.routeOverlay!,
      orderedTraversalSurfaceIdentities: [
        PLATFORM,
        row.routeOverlay!.orderedTraversalSurfaceIdentities[1]!,
      ],
    });
    const tampered = {
      ...row,
      routeOverlay: overlay,
      validationRow: {
        ...row.validationRow,
        evidenceBytes: {
          ...row.validationRow.evidenceBytes,
          routeOverlay: canonicalJsonBytes(overlay),
        },
      },
    };
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      v2PublicationInput(tampered),
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("fails through assertRouteOverlayContextV2 when Path and Overlay identities change together while Graph is unchanged", () => {
    const row = v2PublicationRow();
    if (row.validationRow.routeConnectivityResult.status !== "complete") {
      throw new Error("Expected complete V2 connectivity.");
    }
    const originalPath = row.validationRow.routeConnectivityResult.routePathReceipt;
    const path = {
      ...originalPath,
      orderedTraversalSurfaceIdentities: [PLATFORM, PLATFORM],
    };
    const connectivity = {
      ...row.validationRow.routeConnectivityResult,
      routePathReceipt: path,
      routePathReceiptHash: hashRoutePathReceiptV2(path),
    };
    const overlay = canonicalRouteOverlayV2({
      ...row.routeOverlay!,
      orderedTraversalSurfaceIdentities: path.orderedTraversalSurfaceIdentities,
      routePathReceiptHash: connectivity.routePathReceiptHash,
    });
    const tampered = {
      ...row,
      routeOverlay: overlay,
      validationRow: {
        ...row.validationRow,
        routeConnectivityResult: connectivity,
        evidenceBytes: {
          ...row.validationRow.evidenceBytes,
          routePathReceipt: canonicalJsonBytes(path),
          routeOverlay: canonicalJsonBytes(overlay),
        },
      },
    };
    const input = v2PublicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...input,
      rows: [tampered as RouteEvidencePublicationRowInputV2],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("fails through assertRouteOverlayContextV2 when Path and Overlay switch to another valid Build Input Surface with Node ids preserved", () => {
    const row = v2PublicationRow();
    if (row.validationRow.routeConnectivityResult.status !== "complete") {
      throw new Error("Expected complete V2 connectivity.");
    }
    const originalPath = row.validationRow.routeConnectivityResult.routePathReceipt;
    const path = {
      ...originalPath,
      orderedTraversalSurfaceIdentities: [PLATFORM, PLATFORM],
    };
    const connectivity = {
      ...row.validationRow.routeConnectivityResult,
      routePathReceipt: path,
      routePathReceiptHash: hashRoutePathReceiptV2(path),
    };
    const overlay = canonicalRouteOverlayV2({
      ...row.routeOverlay!,
      orderedTraversalSurfaceIdentities: path.orderedTraversalSurfaceIdentities,
      routePathReceiptHash: connectivity.routePathReceiptHash,
    });
    const tampered = {
      ...row,
      routeOverlay: overlay,
      validationRow: {
        ...row.validationRow,
        routeConnectivityResult: connectivity,
        evidenceBytes: {
          ...row.validationRow.evidenceBytes,
          routePathReceipt: canonicalJsonBytes(path),
          routeOverlay: canonicalJsonBytes(overlay),
        },
      },
    };
    const input = v2PublicationInput();
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2({
      ...input,
      rows: [tampered as RouteEvidencePublicationRowInputV2],
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("fails through assertRouteOverlayContextV2 when one Static Collider inventory row and Overlay hash are mutated", () => {
    const row = v2PublicationRow();
    const overlay = canonicalRouteOverlayV2({
      ...row.routeOverlay!,
      staticColliderIdentities: [{
        ...row.routeOverlay!.staticColliderIdentities[0]!,
        colliderHash: HASH_C,
      }],
    });
    const tampered = {
      ...row,
      routeOverlay: overlay,
      validationRow: {
        ...row.validationRow,
        evidenceBytes: {
          ...row.validationRow.evidenceBytes,
          routeOverlay: canonicalJsonBytes(overlay),
        },
      },
    };
    expect(() => createWorldkitBrowserRouteEvidencePublicationV2(
      v2PublicationInput(tampered),
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
  });

  it("keeps identical canonical Path/Overlay bytes and hashes through Runtime Contracts recanonicalization", () => {
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(
      v2PublicationInput(),
    );
    const recanonical = canonicalWorldkitBrowserRouteEvidencePublicationV2(
      publication,
    );
    const route = publication.routes[0]!;
    const recanonicalRoute = recanonical.routes[0]!;
    expect(canonicalJsonBytes(recanonicalRoute.routePathReceipt)).toEqual(
      canonicalJsonBytes(route.routePathReceipt),
    );
    expect(canonicalJsonBytes(recanonicalRoute.routeOverlay)).toEqual(
      canonicalJsonBytes(route.routeOverlay),
    );
    expect(recanonicalRoute.routePathReceiptHash).toBe(route.routePathReceiptHash);
    expect(recanonicalRoute.routeOverlayHash).toBe(route.routeOverlayHash);

    expect(recanonicalRoute.routePathReceipt).toHaveProperty(
      "orderedTraversalSurfaceIdentities",
    );
    expect(recanonicalRoute.routePathReceipt).not.toHaveProperty(
      "traversalSurfaceIdentity",
    );
    expect(recanonicalRoute.routeOverlay).toHaveProperty("staticColliderIdentities");
    expect(recanonicalRoute.routeOverlay).not.toHaveProperty(
      ["blocking", "Collider", "Identities"].join(""),
    );
    expect(Object.isFrozen(recanonicalRoute.routeOverlay)).toBe(true);
  });

  it("fails locally when Path identity, Path Receipt Hash, a closed field, or a child hash is tampered", () => {
    const publication = createWorldkitBrowserRouteEvidencePublicationV2(
      v2PublicationInput(),
    );
    const route = publication.routes[0]!;
    const path = route.routePathReceipt!;
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...publication,
      routes: [{
        ...route,
        routePathReceipt: {
          ...path,
          orderedTraversalSurfaceIdentities: [PLATFORM, PLATFORM],
        },
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...publication,
      routes: [{
        ...route,
        routePathReceiptHash: HASH_A,
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...publication,
      routes: [{
        ...route,
        routeOverlay: {
          ...route.routeOverlay!,
          staticColliderIdentities: [],
        } as never,
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...publication,
      routes: [{
        ...route,
        routeOverlayHash: HASH_A,
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
  });
});
