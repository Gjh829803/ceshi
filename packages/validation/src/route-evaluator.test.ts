import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalRoutePathReceiptV2,
  canonicalRouteConnectivityFailureV2,
  canonicalRouteConnectivityResultV2,
  canonicalRouteRuntimeProbeReceiptV2,
  createTraversalCapabilityEnvelopeV1,
  createRouteBuildInputReceiptV2,
  hashRouteTerrainArtifactV2,
  hashRouteColliderArtifactV2,
  hashRouteGeometryArtifactV2,
  hashRouteSurfaceArtifactV2,
  assertRouteBuildInputReceiptV2,
  hashRouteBuildInputV2,
  hashRouteConnectivityFailureV2,
  hashRoutePathReceiptV2,
  hashTraversalGraphV2,
  canonicalTraversalGraphV2,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  deriveColliderSubshapeIdV1,
  type ResolvedTraversalLockV1,
  type StaticColliderSourceV1,
  type RouteConnectivityResultV2,
  type RouteBuildInputReceiptV2,
  type RouteConnectivityFailureReasonV2,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
  type TraversalGraphV2,
} from "@whitebox-world/traversal";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
  createRouteWorldPackageValidationReportV1,
  evaluateRouteValidationRowV2,
  hashValidationReportV1,
  validateValidationReportV1,
  type CreateRouteValidationReportInputV2,
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
const SECONDARY_SURFACE = {
  ...SURFACE,
  traversalSurfaceId: "surface-secondary",
  surfaceEntityId: "platform-secondary",
  colliderSubshapeId: deriveColliderSubshapeIdV1("platform-secondary", "primary"),
} as const;

const WALL_ENTITY_ID = "wall-narrow";
const WALL_LOGICAL_SUBSHAPE_ID = "primary";
const WALL_COLLIDER_SUBSHAPE_ID = deriveColliderSubshapeIdV1(
  WALL_ENTITY_ID,
  WALL_LOGICAL_SUBSHAPE_ID,
);
const CEILING_ENTITY_ID = "ceiling-low";
const CEILING_LOGICAL_SUBSHAPE_ID = "primary";
const CEILING_COLLIDER_SUBSHAPE_ID = deriveColliderSubshapeIdV1(
  CEILING_ENTITY_ID,
  CEILING_LOGICAL_SUBSHAPE_ID,
);

function staticBoxCollider(
  entityId: string,
  logicalSubshapeId: string,
): StaticColliderSourceV1 {
  const triangleSoup = {
    positionsMetersXYZ: [
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ],
    triangleIndices: [
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ],
  };
  return {
    entityId,
    logicalSubshapeId,
    colliderSubshapeId: deriveColliderSubshapeIdV1(entityId, logicalSubshapeId),
    colliderHash: HASH_A,
    triangleSoup,
  };
}

function rebuildBuildInputReceipt(
  receipt: RouteBuildInputReceiptV2,
  overrides: Readonly<{
    terrainSource?: RouteBuildInputReceiptV2["input"]["terrainSource"];
    staticColliders?: readonly StaticColliderSourceV1[];
    traversalSurfaces?: RouteBuildInputReceiptV2["input"]["traversalSurfaces"];
  }>,
): RouteBuildInputReceiptV2 {
  const draft = {
    ...receipt.input,
    ...overrides,
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
    traversalLockReceipt: receipt.traversalLockReceipt,
  });
}

function lockInput(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): ResolvedTraversalLockV1 {
  return {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: SUBJECT.resourceLockHash,
    subjectDefinitionRef: "worldkit://subject-definition/player@1",
    subjectDefinitionHash: HASH_A,
    colliderSource: { kind: "profile", colliderProfileRef: "worldkit://collider-profile/humanoid@1", colliderProfileHash: HASH_A },
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
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (isNil(value)) return value;
  if (typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function buildInputReceipt(
  lockReceipt: ReturnType<typeof resolveTraversalLockV1>,
  worldIdentity: Readonly<{
    authoringSpecHash: `sha256:${string}`;
    layoutSolveReportHash: `sha256:${string}`;
    resourceLockHash: `sha256:${string}`;
  }> = SUBJECT,
  connectivity: Readonly<{
    constraintId: string;
    traversingEntityId: string;
    routeId: string;
  }> = {
    constraintId: "player-to-goal",
    traversingEntityId: "player",
    routeId: "main-route",
  },
): RouteBuildInputReceiptV2 {
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
    authoringSpecHash: worldIdentity.authoringSpecHash,
    layoutSolveReportHash: worldIdentity.layoutSolveReportHash,
    resourceLockHash: worldIdentity.resourceLockHash,
    connectivityRequirement: {
      constraintId: connectivity.constraintId,
      traversingEntityId: connectivity.traversingEntityId,
      startAnchorEntityId: "spawn",
      destinationAnchorEntityId: "goal",
      routeId: connectivity.routeId,
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
      routeId: connectivity.routeId,
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
  buildReceipt: RouteBuildInputReceiptV2,
  reverseMaps = false,
): TraversalGraphV2 {
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
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    routeId: buildInput.connectivityRequirement.routeId,
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    traversalNodesById: reverseMaps
      ? { [start.id]: start, [goal.id]: goal }
      : { [goal.id]: goal, [start.id]: start },
    traversalEdgesById: { [edge.id]: edge },
  };
}

function path(
  traversalGraph: TraversalGraphV2,
  constraintId = "player-to-goal",
  traversingEntityId = "player",
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
    orderedTraversalNodeIds: ["node-start", "node-goal"],
    orderedTraversalEdgeIds: ["edge-start-goal"],
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

function completeProbe(
  routePath: RoutePathReceiptV2,
  lock: ReturnType<typeof resolveTraversalLockV1>,
): RouteRuntimeProbeReceiptV2 {
  const driver = resolveTraversalDriverProfileV1(
    BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
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
      positionQuantizationMeters: resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ).profile.positionQuantizationMeters,
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

function failedStartSupportProbe(
  routePath: RoutePathReceiptV2,
  lock: ReturnType<typeof resolveTraversalLockV1>,
): RouteRuntimeProbeReceiptV2 {
  const complete = completeProbe(routePath, lock);
  const initialRuntimeEvidence = {
    ...complete.initialRuntimeEvidence,
    movementMedium: "air" as const,
    locomotionMode: "airborne" as const,
    characterSupport: {
      ...complete.initialRuntimeEvidence.characterSupport,
      supportState: "unsupported" as const,
      supportNormalWorldXYZ: [0, 0, 0] as const,
      surfaceResolution: { mode: "unsupported" as const },
    },
  };
  return canonicalRouteRuntimeProbeReceiptV2({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "failed",
    request: complete.request,
    initialRuntimeEvidence,
    ticks: [],
    metrics: complete.metrics,
    failure: {
      kind: "start-support-invalid",
      failureProbeTick: 0,
      failurePositionMetersXYZ: initialRuntimeEvidence.subjectPositionMetersXYZ,
      supportState: "unsupported",
    },
  });
}

function failedSupportSurfaceProbe(
  routePath: RoutePathReceiptV2,
  lock: ReturnType<typeof resolveTraversalLockV1>,
  surfaceResolutionMode: "unmatched" | "ambiguous" | "resolved",
): RouteRuntimeProbeReceiptV2 {
  const complete = completeProbe(routePath, lock);
  const surfaceResolution = surfaceResolutionMode === "resolved"
    ? {
        mode: "resolved" as const,
        traversalSurfaceId: "surface-wrong",
        surfaceEntityId: "platform-wrong",
        colliderSubshapeId: "platform-wrong-primary",
        resourceRef: "package://traversal-surface/platform-wrong@1",
        resolvedVersion: "1",
        resourceHash: HASH_C,
      }
    : { mode: surfaceResolutionMode };
  const initialRuntimeEvidence = {
    ...complete.initialRuntimeEvidence,
    characterSupport: {
      ...complete.initialRuntimeEvidence.characterSupport,
      surfaceResolution,
    },
  };
  return canonicalRouteRuntimeProbeReceiptV2({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "failed",
    request: complete.request,
    initialRuntimeEvidence,
    ticks: [],
    metrics: {
      ...complete.metrics,
      wrongSupportSurfaceCount: 1,
    },
    failure: {
      kind: "support-surface-mismatch",
      failureProbeTick: 0,
      failurePositionMetersXYZ: initialRuntimeEvidence.subjectPositionMetersXYZ,
      supportState: "supported",
      surfaceResolutionMode,
    },
  });
}

function rowInput(options: Readonly<{
  includeProbe?: boolean;
  reverseMaps?: boolean;
  constraintId?: string;
  traversingEntityId?: string;
  routeId?: string;
  maxSlopeDegrees?: number;
}> = {}): RouteValidationRowInputV2 {
  const constraintId = options.constraintId ?? "player-to-goal";
  const traversingEntityId = options.traversingEntityId ?? "player";
  const routeId = options.routeId ?? "main-route";
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(lockInput({
    subjectEntityId: traversingEntityId,
    ...(options.maxSlopeDegrees === undefined
      ? {}
      : { maxSlopeDegrees: options.maxSlopeDegrees }),
  }));
  const routeBuildInputReceipt = buildInputReceipt(
    resolvedTraversalLockReceipt,
    SUBJECT,
    { constraintId, traversingEntityId, routeId },
  );
  const traversalGraph = graph(routeBuildInputReceipt, options.reverseMaps);
  const routePathReceipt = path(
    traversalGraph,
    constraintId,
    traversingEntityId,
  );
  const routeRuntimeProbeReceipt = options.includeProbe === false
    ? undefined
    : completeProbe(routePathReceipt, resolvedTraversalLockReceipt);
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
    ...(routeRuntimeProbeReceipt === undefined
      ? {}
      : { routeRuntimeProbeReceipt }),
    resolvedTraversalLockReceipt,
    evidenceBytes: {
      traversalGraph: canonicalJsonBytes(traversalGraph),
      routePathReceipt: canonicalJsonBytes(routePathReceipt),
      ...(routeRuntimeProbeReceipt === undefined
        ? {}
        : {
            routeRuntimeProbeReceipt:
              canonicalJsonBytes(routeRuntimeProbeReceipt),
          }),
    },
  };
}

function input(options: Parameters<typeof rowInput>[0] = {}): CreateRouteValidationReportInputV2 {
  const row = rowInput(options);
  return {
    reportId: "main-route-validation",
    subject: SUBJECT,
    executionPlanHash: HASH_C,
    resourceLockHash: HASH_B,
    dependencyReportRefs: [],
    validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
    requiredRoutes: [requiredRouteForRow(row)],
    rows: [row],
  };
}

function requiredRouteForRow(row: RouteValidationRowInputV2) {
  const buildInput = row.routeBuildInputReceipt.input;
  return {
    constraintId: buildInput.connectivityRequirement.constraintId,
    routeId: buildInput.connectivityRequirement.routeId,
    traversingEntityId: buildInput.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: buildInput.startAnchor.entityId,
    destinationAnchorEntityId: buildInput.destinationAnchor.entityId,
  } satisfies CreateRouteValidationReportInputV2["requiredRoutes"][number];
}

function requiredRoutesForRows(rows: readonly RouteValidationRowInputV2[]) {
  return rows.map(requiredRouteForRow).sort((left, right) =>
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

function onlyRow(
  value: CreateRouteValidationReportInputV2,
): RouteValidationRowInputV2 {
  const row = value.rows[0];
  if (row === undefined) throw new Error("Expected one Route row fixture.");
  return row;
}

function completeConnectivity(
  value: CreateRouteValidationReportInputV2,
): Extract<
  RouteValidationRowInputV2["routeConnectivityResult"],
  { readonly status: "complete" }
> {
  const row = onlyRow(value);
  if (row.routeConnectivityResult.status !== "complete") {
    throw new Error("Expected complete Route connectivity fixture.");
  }
  return row.routeConnectivityResult;
}

function failedConnectivityInput(
  status: "unreachable" | "incomplete",
  options: Readonly<{
    graphStatus?: "complete" | "unavailable";
    reason?: RouteConnectivityFailureReasonV2;
    routeBuildInputReceipt?: RouteBuildInputReceiptV2;
    constraintId?: string;
    routeId?: string;
  }> = {},
): CreateRouteValidationReportInputV2 {
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(lockInput());
  let routeBuildInputReceipt = options.routeBuildInputReceipt ??
    buildInputReceipt(
      resolvedTraversalLockReceipt,
      SUBJECT,
      {
        constraintId: options.constraintId ?? "player-to-goal",
        traversingEntityId: "player",
        routeId: options.routeId ?? "main-route",
      },
    );
  const pendingReason = options.reason;
  if (!isNil(pendingReason) && pendingReason.kind === "empty-heightfield-source") {
    routeBuildInputReceipt = rebuildBuildInputReceipt(routeBuildInputReceipt, {
      terrainSource: {
        kind: "empty",
        terrainEntityId: SURFACE.surfaceEntityId,
      },
      staticColliders: [],
    });
  }
  if (
    !isNil(pendingReason) &&
    pendingReason.kind === "surface-correlation-ambiguous"
  ) {
    routeBuildInputReceipt = rebuildBuildInputReceipt(routeBuildInputReceipt, {
      traversalSurfaces: [SURFACE, SECONDARY_SURFACE],
      staticColliders: [staticBoxCollider("platform-secondary", "primary")],
    });
  }
  if (
    !isNil(pendingReason) &&
    "relevantColliderSubshapeIds" in pendingReason
  ) {
    const colliders: StaticColliderSourceV1[] = [];
    if (pendingReason.relevantColliderSubshapeIds.includes(WALL_COLLIDER_SUBSHAPE_ID)) {
      colliders.push(staticBoxCollider(WALL_ENTITY_ID, WALL_LOGICAL_SUBSHAPE_ID));
    }
    if (pendingReason.relevantColliderSubshapeIds.includes(CEILING_COLLIDER_SUBSHAPE_ID)) {
      colliders.push(staticBoxCollider(CEILING_ENTITY_ID, CEILING_LOGICAL_SUBSHAPE_ID));
    }
    routeBuildInputReceipt = rebuildBuildInputReceipt(routeBuildInputReceipt, {
      staticColliders: colliders,
    });
  }
  const requirement = routeBuildInputReceipt.input.connectivityRequirement;
  const envelope = routeBuildInputReceipt.input.capabilityEnvelope;
  const graphStatus = options.graphStatus ?? "unavailable";
  const traversalGraph = graphStatus === "complete"
    ? graph(routeBuildInputReceipt)
    : undefined;
  const defaultReason: RouteConnectivityFailureReasonV2 = status === "unreachable"
    ? {
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        maximumObservedSlopeDegrees: 48,
        maximumAllowedSlopeDegrees: 42,
        proofKind: "unique-single-reason-cut",
        proofCandidateIds: ["triangle-steep"],
        failurePositionMetersXYZ: [0.5, 0.4, 0],
      }
    : graphStatus === "complete"
      ? {
          kind: "search-budget-exceeded",
          code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
          maximumAllowedCount: envelope.maximumSearchSteps,
          minimumRequiredCount: envelope.maximumSearchSteps + 1,
        }
      : {
          kind: "node-budget-exceeded",
          code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
          maximumAllowedCount: envelope.maximumNodes,
          minimumRequiredCount: envelope.maximumNodes + 1,
        };
  let reason = options.reason ?? defaultReason;
  if (reason.kind === "node-budget-exceeded") {
    reason = {
      ...reason,
      maximumAllowedCount: envelope.maximumNodes,
      minimumRequiredCount: envelope.maximumNodes + 1,
    };
  } else if (reason.kind === "edge-budget-exceeded") {
    reason = {
      ...reason,
      maximumAllowedCount: envelope.maximumEdges,
      minimumRequiredCount: envelope.maximumEdges + 1,
    };
  } else if (reason.kind === "search-budget-exceeded") {
    reason = {
      ...reason,
      maximumAllowedCount: envelope.maximumSearchSteps,
      minimumRequiredCount: envelope.maximumSearchSteps + 1,
    };
  }
  const connectivityFailure = canonicalRouteConnectivityFailureV2({
    kind: "route-connectivity-failure",
    schemaVersion: 2,
    constraintId: requirement.constraintId,
    routeId: requirement.routeId,
    traversingEntityId: requirement.traversingEntityId,
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    startAnchorPositionMetersXYZ: [0, 0, 0],
    destinationAnchorPositionMetersXYZ: [1, 0, 0],
    relatedTraversalSurfaceIdentities: (
      reason.kind === "surface-correlation-ambiguous"
        ? [SURFACE, SECONDARY_SURFACE]
        : reason.kind === "slope-threshold-exceeded" ||
      reason.kind === "step-height-threshold-exceeded" ||
      reason.kind === "clearance-width-insufficient" ||
      reason.kind === "overhead-clearance-insufficient" ||
      reason.kind === "surface-gap-exceeded"
        ? [SURFACE]
        : []
    ),
    routeBuildInputHash: routeBuildInputReceipt.routeBuildInputHash,
    resolvedTraversalLockHash:
      resolvedTraversalLockReceipt.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    status,
    graphStatus,
    ...(graphStatus === "complete"
      ? { traversalGraphHash: hashTraversalGraphV2(traversalGraph!) }
      : {}),
    reason,
  });
  const routeConnectivityResult = canonicalRouteConnectivityResultV2({
    kind: "route-connectivity-result",
    schemaVersion: 2,
    status,
    graphStatus,
    ...(graphStatus === "complete"
      ? {
          traversalGraph,
          traversalGraphHash: hashTraversalGraphV2(traversalGraph!),
        }
      : {}),
    connectivityFailure,
    connectivityFailureHash: hashRouteConnectivityFailureV2(connectivityFailure),
  });
  const row: RouteValidationRowInputV2 = {
    routeBuildInputReceipt,
    routeConnectivityResult,
    resolvedTraversalLockReceipt,
    evidenceBytes: {
      ...(graphStatus === "complete"
        ? { traversalGraph: canonicalJsonBytes(traversalGraph) }
        : {}),
      routeConnectivityFailure: canonicalJsonBytes(connectivityFailure),
    },
  };
  return {
    reportId: "main-route-validation",
    subject: SUBJECT,
    executionPlanHash: HASH_C,
    resourceLockHash: HASH_B,
    dependencyReportRefs: [],
    validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
    requiredRoutes: [requiredRouteForRow(row)],
    rows: [row],
  };
}

const THRESHOLD_FAILURE_REASONS = [
  {
    kind: "slope-threshold-exceeded",
    code: "ROUTE_SLOPE_EXCEEDED",
    maximumObservedSlopeDegrees: 48,
    maximumAllowedSlopeDegrees: 42,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds: ["triangle-steep"],
    failurePositionMetersXYZ: [0.5, 0.4, 0],
  },
  {
    kind: "step-height-threshold-exceeded",
    code: "ROUTE_STEP_HEIGHT_EXCEEDED",
    maximumObservedStepHeightMeters: 0.4,
    maximumAllowedStepHeightMeters: 0.3,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds: ["step-high"],
    failurePositionMetersXYZ: [0.5, 0.4, 0],
  },
  {
    kind: "clearance-width-insufficient",
    code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
    relevantColliderSubshapeIds: [WALL_COLLIDER_SUBSHAPE_ID],
    minimumObservedClearanceWidthMeters: 0.6,
    minimumRequiredClearanceWidthMeters: (0.35 + 0.05) * 2,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds: ["wall-narrow"],
    failurePositionMetersXYZ: [0.5, 0, 0],
  },
  {
    kind: "overhead-clearance-insufficient",
    code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
    relevantColliderSubshapeIds: [CEILING_COLLIDER_SUBSHAPE_ID],
    minimumObservedClearanceHeightMeters: 1.7,
    minimumRequiredClearanceHeightMeters: 1.8,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds: ["ceiling-low"],
    failurePositionMetersXYZ: [0.5, 0, 0],
  },
  {
    kind: "surface-gap-exceeded",
    code: "ROUTE_SURFACE_GAP_EXCEEDED",
    maximumObservedSurfaceGapMeters: 0.1,
    maximumAllowedSurfaceGapMeters: 0,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds: ["gap"],
    failurePositionMetersXYZ: [0.5, 0, 0],
  },
] as const satisfies readonly RouteConnectivityFailureReasonV2[];

const FAILURE_VARIANTS = [
  {
    name: "unavailable unreachable empty Heightfield",
    status: "unreachable",
    graphStatus: "unavailable",
    reason: {
      kind: "empty-heightfield-source",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      terrainEntityId: "terrain-main",
    },
  },
  {
    name: "unavailable unreachable without queryable ground",
    status: "unreachable",
    graphStatus: "unavailable",
    reason: {
      kind: "no-queryable-ground-surface",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
    },
  },
  ...THRESHOLD_FAILURE_REASONS.map((reason) => ({
    name: `unavailable unreachable ${reason.kind}`,
    status: "unreachable" as const,
    graphStatus: "unavailable" as const,
    reason,
  })),
  {
    name: "unavailable incomplete node budget",
    status: "incomplete",
    graphStatus: "unavailable",
    reason: {
      kind: "node-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: 100,
      minimumRequiredCount: 101,
    },
  },
  {
    name: "unavailable incomplete edge budget",
    status: "incomplete",
    graphStatus: "unavailable",
    reason: {
      kind: "edge-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: 100,
      minimumRequiredCount: 101,
    },
  },
  {
    name: "complete unreachable start surface",
    status: "unreachable",
    graphStatus: "complete",
    reason: {
      kind: "start-surface-not-found",
      code: "ROUTE_START_SURFACE_NOT_FOUND",
      anchorEntityId: "spawn",
      positionMetersXYZ: [0, 0, 0],
    },
  },
  {
    name: "complete unreachable destination surface",
    status: "unreachable",
    graphStatus: "complete",
    reason: {
      kind: "destination-surface-not-found",
      code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
      anchorEntityId: "goal",
      positionMetersXYZ: [1, 0, 0],
    },
  },
  {
    name: "complete unreachable required path",
    status: "unreachable",
    graphStatus: "complete",
    reason: {
      kind: "required-path-unreachable",
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      relevantBlockingColliderEntityIds: [],
      blockedWaterEntityIds: [],
    },
  },
  ...THRESHOLD_FAILURE_REASONS.map((reason) => ({
    name: `complete unreachable ${reason.kind}`,
    status: "unreachable" as const,
    graphStatus: "complete" as const,
    reason,
  })),
  {
    name: "complete incomplete search budget",
    status: "incomplete",
    graphStatus: "complete",
    reason: {
      kind: "search-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: 100,
      minimumRequiredCount: 101,
    },
  },
  {
    name: "complete incomplete straight path capacity",
    status: "incomplete",
    graphStatus: "complete",
    reason: {
      kind: "straight-path-capacity-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: 100,
      minimumRequiredCount: 101,
    },
  },
] as const satisfies readonly Readonly<{
  name: string;
  status: "unreachable" | "incomplete";
  graphStatus: "complete" | "unavailable";
  reason: RouteConnectivityFailureReasonV2;
}>[];

function expectedFailureDetailsKind(
  reason: RouteConnectivityFailureReasonV2,
): "capacity-exceeded" | "degrees-threshold" | "meters-threshold" | "state-mismatch" {
  if (reason.kind === "slope-threshold-exceeded") return "degrees-threshold";
  if (
    reason.kind === "step-height-threshold-exceeded" ||
    reason.kind === "clearance-width-insufficient" ||
    reason.kind === "overhead-clearance-insufficient" ||
    reason.kind === "surface-gap-exceeded"
  ) {
    return "meters-threshold";
  }
  if (
    reason.kind === "node-budget-exceeded" ||
    reason.kind === "edge-budget-exceeded" ||
    reason.kind === "search-budget-exceeded" ||
    reason.kind === "straight-path-capacity-exceeded"
  ) {
    return "capacity-exceeded";
  }
  return "state-mismatch";
}

function expectedFailurePosition(
  reason: RouteConnectivityFailureReasonV2,
): readonly [number, number, number] {
  if (
    reason.kind === "slope-threshold-exceeded" ||
    reason.kind === "step-height-threshold-exceeded" ||
    reason.kind === "clearance-width-insufficient" ||
    reason.kind === "overhead-clearance-insufficient" ||
    reason.kind === "surface-gap-exceeded"
  ) {
    return reason.failurePositionMetersXYZ;
  }
  if (
    reason.kind === "start-surface-not-found" ||
    reason.kind === "destination-surface-not-found"
  ) {
    return reason.positionMetersXYZ;
  }
  return [0, 0, 0];
}

describe("createRouteWorldPackageValidationReportV1", () => {
  it("rejects missing, extra, duplicate, and mismatched-plan Required Route sets", () => {
    const first = rowInput({ constraintId: "a-route", routeId: "route-a" });
    const second = rowInput({ constraintId: "b-route", routeId: "route-b" });
    const requiredRoutes = requiredRoutesForRows([first, second]);

    expect(() => createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes,
      rows: [first],
    })).toThrow("ROUTE_VALIDATION_REQUIRED_ROUTE_SET_MISMATCH");
    expect(() => createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: [requiredRoutes[0]!],
      rows: [first, second],
    })).toThrow("ROUTE_VALIDATION_REQUIRED_ROUTE_SET_MISMATCH");
    expect(() => createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: [requiredRoutes[0]!, requiredRoutes[0]!],
      rows: [first, first],
    })).toThrow("must be unique and sorted by constraintId then routeId");
    expect(() => createRouteWorldPackageValidationReportV1({
      ...input(),
      executionPlanHash: HASH_A,
      requiredRoutes: [requiredRoutes[0]!],
      rows: [first],
    })).toThrow();
  });

  it("publishes a real failed world Report when no required Route rows exist", () => {
    const report = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: [],
      rows: [],
    });

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe("failed");
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
      "incomplete",
    );
    expect(report.routeValidationSetReceipt.rows).toEqual([]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: "world",
        code: "ROUTE_REQUIRED_ROWS_MISSING",
        metricId: "required-route-count",
      }),
    ]));
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("sorts Route rows and keeps artifacts unique when constraints share one routeId", () => {
    const rows = [
      rowInput({ constraintId: "z-route-check", routeId: "shared-route" }),
      rowInput({ constraintId: "a-route-check", routeId: "shared-route" }),
    ];
    const report = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows(rows),
      rows,
    });

    expect(report.status).toBe("passed");
    expect(report.routeValidationSetReceipt.rows.map((row) => [
      row.constraintId,
      row.routeId,
    ])).toEqual([
      ["a-route-check", "shared-route"],
      ["z-route-check", "shared-route"],
    ]);
    expect(Object.keys(report.evidenceArtifactsById)).toEqual(expect.arrayContaining([
      "route:a-route-check:traversal-graph",
      "route:z-route-check:traversal-graph",
    ]));
    expect(new Set(Object.values(report.evidenceArtifactsById).map(
      ({ artifactRef }) => artifactRef,
    )).size).toBe(Object.keys(report.evidenceArtifactsById).length);
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("uses locale-independent canonical ordering for Route rows", () => {
    const rows = [
      rowInput({ constraintId: "ä-route", routeId: "shared-route" }),
      rowInput({ constraintId: "z-route", routeId: "shared-route" }),
    ];
    const report = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows(rows),
      rows,
    });

    expect(report.routeValidationSetReceipt.rows.map(({ constraintId }) =>
      constraintId
    )).toEqual(["z-route", "ä-route"]);
  });

  it("returns deeply immutable row contributions and world Reports", () => {
    const baseline = input();
    const contribution = evaluateRouteValidationRowV2({
      subject: baseline.subject,
      executionPlanHash: baseline.executionPlanHash,
      resourceLockHash: baseline.resourceLockHash,
      validationProfile: baseline.validationProfile,
      row: onlyRow(baseline),
    });
    const report = createRouteWorldPackageValidationReportV1(baseline);

    expect(Object.isFrozen(contribution)).toBe(true);
    expect(Object.isFrozen(contribution.gateResultsById)).toBe(true);
    expect(Object.isFrozen(
      contribution.gateResultsById["route-connectivity"]?.metricResultsById,
    )).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.evidenceArtifactsById)).toBe(true);
    expect(Object.isFrozen(report.diagnostics)).toBe(true);
  });

  it("keeps provider IDs and handles out of the Report, Route-set index, and evidence bytes", () => {
    const baseline = input();
    const report = createRouteWorldPackageValidationReportV1(baseline);
    const serializedContracts = [
      JSON.stringify(report),
      JSON.stringify(report.routeValidationSetReceipt),
      ...Object.values(onlyRow(baseline).evidenceBytes).map((bytes) =>
        new TextDecoder().decode(bytes)
      ),
    ];

    for (const serialized of serializedContracts) {
      expect(serialized).not.toMatch(/provider(?:id|handle)?/i);
    }
  });

  it("binds Overlay evidence to its Route row lock and rejects orphaned failure overlays", () => {
    const baseline = input();
    const row = onlyRow(baseline);
    const report = createRouteWorldPackageValidationReportV1({
      ...baseline,
      rows: [{
        ...row,
        evidenceBytes: {
          ...row.evidenceBytes,
          routeOverlay: canonicalJsonBytes({ kind: "route-overlay-test" }),
        },
      }],
    });
    const overlay = report.evidenceArtifactsById[
      "route:player-to-goal:route-overlay"
    ];

    expect(overlay).toMatchObject({
      kind: "route-overlay",
      resolvedTraversalLockHash:
        row.resolvedTraversalLockReceipt.resolvedTraversalLockHash,
    });
    expect(validateValidationReportV1({
      ...report,
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "route:player-to-goal:route-overlay": {
          ...overlay,
          resolvedTraversalLockHash: HASH_A,
        },
      },
    })).toMatchObject({ ok: false });

    const failed = failedConnectivityInput("unreachable");
    const failedRow = onlyRow(failed);
    expect(() => createRouteWorldPackageValidationReportV1({
      ...failed,
      rows: [{
        ...failedRow,
        evidenceBytes: {
          ...failedRow.evidenceBytes,
          routeOverlay: canonicalJsonBytes({ kind: "orphaned-overlay" }),
        },
      }],
    })).toThrow("ROUTE_VALIDATION_FAILED_CONNECTIVITY_EVIDENCE_CONFLICT");
  });

  it("evaluates heterogeneous capability bounds per row without publishing a false world bound", () => {
    const rows = [
      rowInput({ constraintId: "human-route", maxSlopeDegrees: 42 }),
      rowInput({
        constraintId: "npc-route",
        traversingEntityId: "npc",
        routeId: "npc-main-route",
        maxSlopeDegrees: 30,
      }),
    ];
    const report = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows(rows),
      rows,
    });
    const slope = report.gateResultsById["route-connectivity"]!
      .metricResultsById["maximum-observed-slope-degrees"]!;

    expect(report.status).toBe("passed");
    expect(slope).not.toHaveProperty("maximumAllowedDegrees");
    expect(new Set(report.routeValidationSetReceipt.rows.map(
      ({ resolvedTraversalLockHash }) => resolvedTraversalLockHash,
    )).size).toBe(2);
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("aggregates world status with failed ahead of incomplete ahead of passed", () => {
    const unreachable = onlyRow(failedConnectivityInput("unreachable", {
      constraintId: "a-unreachable",
    }));
    const incomplete = onlyRow(failedConnectivityInput("incomplete", {
      constraintId: "b-incomplete",
    }));
    const passed = rowInput({ constraintId: "c-passed" });

    const failed = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows([incomplete, unreachable]),
      rows: [incomplete, unreachable],
    });
    const incompleteReport = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows([passed, incomplete]),
      rows: [passed, incomplete],
    });
    const runtimeBaseline = rowInput({
      constraintId: "d-runtime-failed",
      routeId: "runtime-failed-route",
    });
    if (runtimeBaseline.routeConnectivityResult.status !== "complete") {
      throw new Error("Expected a complete Runtime failure fixture.");
    }
    const routePathReceipt = runtimeBaseline.routeConnectivityResult.routePathReceipt;
    const failedProbe = failedStartSupportProbe(
      routePathReceipt,
      runtimeBaseline.resolvedTraversalLockReceipt,
    );
    const runtimeFailed = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows([
        incomplete,
        {
          ...runtimeBaseline,
          routeRuntimeProbeReceipt: failedProbe,
          evidenceBytes: {
            ...runtimeBaseline.evidenceBytes,
            routeRuntimeProbeReceipt: canonicalJsonBytes(failedProbe),
          },
        },
      ]),
      rows: [
        incomplete,
        {
          ...runtimeBaseline,
          routeRuntimeProbeReceipt: failedProbe,
          evidenceBytes: {
            ...runtimeBaseline.evidenceBytes,
            routeRuntimeProbeReceipt: canonicalJsonBytes(failedProbe),
          },
        },
      ],
    });

    expect(failed.status).toBe("failed");
    expect(failed.gateResultsById["route-connectivity"]?.status).toBe("failed");
    expect(incompleteReport.status).toBe("incomplete");
    expect(incompleteReport.gateResultsById["route-connectivity"]?.status).toBe(
      "incomplete",
    );
    expect(runtimeFailed.status).toBe("failed");
    expect(runtimeFailed.gateResultsById["route-runtime-conformance"]?.status)
      .toBe("failed");
  });

  it("sums totals and counts deterministically across ordered Route rows", () => {
    const rows = [
      rowInput({ constraintId: "z-route", routeId: "route-z" }),
      rowInput({ constraintId: "a-route", routeId: "route-a" }),
    ];
    const requiredRoutes = requiredRoutesForRows(rows);
    const first = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes,
      rows,
    });
    const second = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes,
      rows: [...rows].reverse(),
    });
    const connectivity = first.gateResultsById["route-connectivity"]!
      .metricResultsById;
    const runtime = first.gateResultsById["route-runtime-conformance"]!
      .metricResultsById;

    expect(connectivity["required-route-count"]).toMatchObject({ valueCount: 2 });
    expect(connectivity["total-route-path-distance-meters"]).toMatchObject({
      valueMeters: 2,
    });
    expect(connectivity["total-traversal-graph-node-count"]).toMatchObject({
      valueCount: 4,
    });
    expect(runtime["completed-required-route-count"]).toMatchObject({
      valueCount: 2,
    });
    expect(hashValidationReportV1(second)).toBe(hashValidationReportV1(first));
  });

  it("rejects duplicate row identity and cross-row Artifact ownership", () => {
    const duplicate = rowInput({ constraintId: "duplicate", routeId: "shared" });
    expect(() => createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows([duplicate, duplicate]),
      rows: [duplicate, duplicate],
    })).toThrow("must be unique and sorted by constraintId then routeId");

    const rows = [
      rowInput({ constraintId: "a-row", routeId: "route-a" }),
      rowInput({ constraintId: "b-row", routeId: "route-b" }),
    ];
    const report = createRouteWorldPackageValidationReportV1({
      ...input(),
      requiredRoutes: requiredRoutesForRows(rows),
      rows,
    });
    const graph = report.evidenceArtifactsById["route:a-row:traversal-graph"]!;
    const forged = {
      ...report,
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "route:a-row:traversal-graph": {
          ...graph,
          constraintId: "b-row",
          routeId: "route-b",
        },
      },
    };
    expect(validateValidationReportV1(forged)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("passes both blocking Route gates only when Graph, Path, and Probe evidence are present", () => {
    const report = createRouteWorldPackageValidationReportV1(input());

    expect(report.status).toBe("passed");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe("passed");
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe("passed");
    expect(report.evidenceArtifactsById["route:player-to-goal:traversal-graph"])
      .toMatchObject({
        mediaType: "application/vnd.worldkit.traversal-graph.v2+json",
      });
    expect(report.evidenceArtifactsById["route:player-to-goal:route-path-receipt"])
      .toMatchObject({
        mediaType: "application/vnd.worldkit.route-path-receipt.v2+json",
      });
    expect(report.evidenceArtifactsById["route:player-to-goal:route-runtime-probe-receipt"])
      .toMatchObject({
        mediaType:
          "application/vnd.worldkit.route-runtime-probe-receipt.v2+json",
      });
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("publishes every ambiguous Surface identity in the route Diagnostic", () => {
    const report = createRouteWorldPackageValidationReportV1(
      failedConnectivityInput("incomplete", {
        reason: {
          kind: "surface-correlation-ambiguous",
          code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
          failurePositionMetersXYZ: [0.5, 0.25, 0],
        },
      }),
    );
    const diagnostic = report.diagnostics.find(
      ({ code }) => code === "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
    );

    expect(diagnostic).toMatchObject({
      relatedTraversalSurfaceIdentities: [
        { traversalSurfaceId: "surface-main" },
        { traversalSurfaceId: "surface-secondary" },
      ],
    });
    expect(report.evidenceArtifactsById[
      "route:player-to-goal:route-connectivity-failure"
    ]).toMatchObject({
      mediaType:
        "application/vnd.worldkit.route-connectivity-failure.v2+json",
    });
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("keeps the Runtime gate and Report incomplete when canonical Probe evidence is absent", () => {
    const report = createRouteWorldPackageValidationReportV1(input({ includeProbe: false }));

    expect(report.status).toBe("incomplete");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe("passed");
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
      "incomplete",
    );
    expect(Object.values(
      report.gateResultsById["route-runtime-conformance"]!.metricResultsById,
    ).every((metric) => metric.status === "not-evaluated")).toBe(true);
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("keeps capability bounds in row evaluation while retaining Profile-derived Runtime bounds", () => {
    const report = createRouteWorldPackageValidationReportV1(input());
    const connectivity = report.gateResultsById["route-connectivity"]!
      .metricResultsById;
    const runtime = report.gateResultsById["route-runtime-conformance"]!
      .metricResultsById;

    expect(connectivity["maximum-observed-step-height-meters"])
      .not.toHaveProperty("maximumAllowedMeters");
    expect(connectivity["maximum-observed-slope-degrees"])
      .not.toHaveProperty("maximumAllowedDegrees");
    expect(connectivity["minimum-observed-clearance-width-meters"])
      .not.toHaveProperty("minimumAllowedMeters");
    expect(connectivity["minimum-observed-clearance-height-meters"])
      .not.toHaveProperty("minimumAllowedMeters");
    expect(connectivity["maximum-observed-surface-gap-meters"])
      .not.toHaveProperty("maximumAllowedMeters");
    expect(runtime["maximum-stalled-duration-ticks"]).toMatchObject({
      maximumAllowedTicks:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1
          .routeRuntimeGateThresholds.stalledWindowTicks,
    });
    expect(runtime["maximum-route-deviation-meters-xz"]).toMatchObject({
      maximumAllowedMeters:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1
          .routeRuntimeGateThresholds.maximumRouteDeviationMetersXZ,
    });
  });

  it("requires each evaluated Metric to cite the evidence kind that owns its value", () => {
    const report = createRouteWorldPackageValidationReportV1(input());

    for (const metric of Object.values(
      report.gateResultsById["route-connectivity"]!.metricResultsById,
    )) {
      expect(metric.evidenceArtifactRefs).toContain(
        "artifact://world/route-validation-set-receipt.json",
      );
    }
    for (const metric of Object.values(
      report.gateResultsById["route-runtime-conformance"]!.metricResultsById,
    )) {
      expect(metric.evidenceArtifactRefs).toEqual(expect.arrayContaining([
        "artifact://route/main-route/constraint/player-to-goal/route-runtime-probe-receipt.json",
        "artifact://world/route-validation-set-receipt.json",
      ]));
    }
  });

  it("hashes and sizes the exact canonical bytes behind stable Route artifact refs", () => {
    const reportInput = input();
    const reportRow = onlyRow(reportInput);
    const traversalGraphBytes = reportRow.evidenceBytes.traversalGraph;
    const routePathReceiptBytes = reportRow.evidenceBytes.routePathReceipt;
    if (traversalGraphBytes === undefined || routePathReceiptBytes === undefined) {
      throw new Error("Expected complete connectivity evidence in the fixture.");
    }
    const report = createRouteWorldPackageValidationReportV1(reportInput);
    const graphEvidence = report.evidenceArtifactsById[
      "route:player-to-goal:traversal-graph"
    ]!;
    const pathEvidence = report.evidenceArtifactsById[
      "route:player-to-goal:route-path-receipt"
    ]!;
    const probeEvidence = report.evidenceArtifactsById[
      "route:player-to-goal:route-runtime-probe-receipt"
    ]!;

    expect(graphEvidence).toMatchObject({
      artifactRef: "artifact://route/main-route/constraint/player-to-goal/traversal-graph.json",
      sizeBytes: traversalGraphBytes.byteLength,
      contentHash: sha256Bytes(traversalGraphBytes),
    });
    expect(pathEvidence).toMatchObject({
      artifactRef: "artifact://route/main-route/constraint/player-to-goal/route-path-receipt.json",
      sizeBytes: routePathReceiptBytes.byteLength,
      contentHash: sha256Bytes(routePathReceiptBytes),
    });
    expect(probeEvidence).toMatchObject({
      artifactRef:
        "artifact://route/main-route/constraint/player-to-goal/route-runtime-probe-receipt.json",
      sizeBytes:
        reportRow.evidenceBytes.routeRuntimeProbeReceipt!.byteLength,
      contentHash:
        sha256Bytes(reportRow.evidenceBytes.routeRuntimeProbeReceipt!),
    });
  });

  it("fails the Report on Runtime failure while preserving Graph evidence and complete diagnostics", () => {
    const baseline = input();
    const baselineRow = onlyRow(baseline);
    const completePath = completeConnectivity(baseline).routePathReceipt;
    const failedProbe = failedStartSupportProbe(
      completePath,
      baselineRow.resolvedTraversalLockReceipt,
    );
    const report = createRouteWorldPackageValidationReportV1({
      ...baseline,
      rows: [{
        ...baselineRow,
        routeRuntimeProbeReceipt: failedProbe,
        evidenceBytes: {
          ...baselineRow.evidenceBytes,
          routeRuntimeProbeReceipt: canonicalJsonBytes(failedProbe),
        },
      }],
    });

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe("passed");
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
      "failed",
    );
    expect(report.evidenceArtifactsById[
      "route:player-to-goal:traversal-graph"
    ]).toBeDefined();
    expect(report.diagnostics).not.toHaveLength(0);
    for (const diagnostic of report.diagnostics) {
      expect(diagnostic).toMatchObject({
        code: "ROUTE_START_SUPPORT_INVALID",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
        colliderSubshapeId: SURFACE.colliderSubshapeId,
        positionMetersXYZ: [1, 0, 0],
        evidenceArtifactRefs: [
          "artifact://route/main-route/constraint/player-to-goal/route-runtime-probe-receipt.json",
        ],
        suggestedFix: expect.any(String),
      });
    }
    const completedCountDiagnostic = report.diagnostics.find(
      ({ metricId }) => metricId === "completed-required-route-count",
    );
    expect(completedCountDiagnostic?.details).toMatchObject({
      kind: "state-mismatch",
      expectedState: expect.stringContaining("1"),
      actualState: expect.stringContaining("0"),
    });
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it.each(["unmatched", "ambiguous", "resolved"] as const)(
    "publishes Runtime support-surface mismatch for %s support evidence",
    (surfaceResolutionMode) => {
      const baseline = input();
      const baselineRow = onlyRow(baseline);
      const routePathReceipt = completeConnectivity(baseline).routePathReceipt;
      const failedProbe = failedSupportSurfaceProbe(
        routePathReceipt,
        baselineRow.resolvedTraversalLockReceipt,
        surfaceResolutionMode,
      );
      const report = createRouteWorldPackageValidationReportV1({
        ...baseline,
        rows: [{
          ...baselineRow,
          routeRuntimeProbeReceipt: failedProbe,
          evidenceBytes: {
            ...baselineRow.evidenceBytes,
            routeRuntimeProbeReceipt: canonicalJsonBytes(failedProbe),
          },
        }],
      });

      expect(report.gateResultsById["route-connectivity"]?.status).toBe("passed");
      expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
        "failed",
      );
      expect(report.diagnostics.filter(
        ({ gateId }) => gateId === "route-runtime-conformance",
      )).not.toHaveLength(0);
      expect(report.diagnostics.filter(
        ({ gateId }) => gateId === "route-runtime-conformance",
      ).every(
        ({ code }) => code === "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
      )).toBe(true);
      expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
    },
  );

  it("rejects mismatched Graph and Probe locks before evaluating either Gate", () => {
    const baseline = input();
    const baselineRow = onlyRow(baseline);
    const routeRuntimeProbeReceipt = baselineRow.routeRuntimeProbeReceipt!;
    if (routeRuntimeProbeReceipt.schemaVersion !== 2) {
      throw new Error("Expected a V2 Probe Receipt fixture.");
    }
    const forged = {
      ...baseline,
      rows: [{
        ...baselineRow,
        routeRuntimeProbeReceipt: {
          ...routeRuntimeProbeReceipt,
          request: {
            ...routeRuntimeProbeReceipt.request,
            resolvedTraversalLockHash: HASH_A,
          },
          initialRuntimeEvidence: {
            ...routeRuntimeProbeReceipt.initialRuntimeEvidence,
            resolvedTraversalLockHash: HASH_A,
          },
        },
        evidenceBytes: {
          ...baselineRow.evidenceBytes,
          routeRuntimeProbeReceipt: canonicalJsonBytes({
            ...routeRuntimeProbeReceipt,
            request: {
              ...routeRuntimeProbeReceipt.request,
              resolvedTraversalLockHash: HASH_A,
            },
            initialRuntimeEvidence: {
              ...routeRuntimeProbeReceipt.initialRuntimeEvidence,
              resolvedTraversalLockHash: HASH_A,
            },
          }),
        },
      }],
    };

    expect(() => createRouteWorldPackageValidationReportV1(forged)).toThrow(
      "ROUTE_TRAVERSAL_LOCK_MISMATCH",
    );
  });

  it("emits one failed Report from canonical unreachable evidence even when no Graph or Path exists", () => {
    const report = createRouteWorldPackageValidationReportV1(
      failedConnectivityInput("unreachable"),
    );

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe("failed");
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
      "incomplete",
    );
    expect(report.evidenceArtifactsById[
      "route:player-to-goal:route-connectivity-failure"
    ]).toMatchObject({
      kind: "route-connectivity-failure",
      artifactRef:
        "artifact://route/main-route/constraint/player-to-goal/route-connectivity-failure.json",
    });
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ROUTE_SLOPE_EXCEEDED",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
        colliderSubshapeId: SURFACE.colliderSubshapeId,
        positionMetersXYZ: [0.5, 0.4, 0],
        evidenceArtifactRefs: [
          "artifact://route/main-route/constraint/player-to-goal/route-connectivity-failure.json",
        ],
      }),
    ]));
    const runtimeDiagnostics = report.diagnostics.filter(
      ({ gateId }) => gateId === "route-runtime-conformance",
    );
    expect(runtimeDiagnostics.every(({ message }) =>
      message.includes("Route Path") && !message.includes("Probe")
    )).toBe(true);
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("rejects a self-consistent graph-unavailable Failure from another World", () => {
    const lockReceipt = resolveTraversalLockV1(lockInput());
    const foreignBuildInputReceipt = buildInputReceipt(lockReceipt, {
      authoringSpecHash: HASH_B,
      layoutSolveReportHash: HASH_A,
      resourceLockHash: SUBJECT.resourceLockHash,
    });
    const forged = failedConnectivityInput("unreachable", {
      routeBuildInputReceipt: foreignBuildInputReceipt,
      reason: {
        kind: "empty-heightfield-source",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        terrainEntityId: "terrain-main",
      },
    });

    expect(() => createRouteWorldPackageValidationReportV1(forged)).toThrow(
      "ROUTE_VALIDATION_WORLD_IDENTITY_MISMATCH",
    );
  });

  it.each(FAILURE_VARIANTS)(
    "closes canonical failure variant: $name",
    ({ status, graphStatus, reason }) => {
      const report = createRouteWorldPackageValidationReportV1(
        failedConnectivityInput(status, { graphStatus, reason }),
      );

      expect(report.status).toBe(status === "unreachable" ? "failed" : "incomplete");
      expect(report.gateResultsById["route-connectivity"]?.status).toBe(
        status === "unreachable" ? "failed" : "incomplete",
      );
      expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
        "incomplete",
      );
      const reasonDiagnostic = report.diagnostics.find(
        ({ gateId, code }) =>
          gateId === "route-connectivity" && code === reason.code,
      );
      expect(reasonDiagnostic).toMatchObject({
        code: reason.code,
        positionMetersXYZ: expectedFailurePosition(reason),
        details: { kind: expectedFailureDetailsKind(reason) },
      });
      expect(report.evidenceArtifactsById[
        "route:player-to-goal:traversal-graph"
      ] !== undefined).toBe(
        graphStatus === "complete",
      );
      expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
    },
  );

  it("keeps canonical budget-exhaustion evidence incomplete instead of calling it unreachable", () => {
    const report = createRouteWorldPackageValidationReportV1(
      failedConnectivityInput("incomplete"),
    );

    expect(report.status).toBe("incomplete");
    expect(report.gateResultsById["route-connectivity"]?.status).toBe(
      "incomplete",
    );
    expect(report.gateResultsById["route-runtime-conformance"]?.status).toBe(
      "incomplete",
    );
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
        details: expect.objectContaining({
          kind: "capacity-exceeded",
        }),
      }),
    ]));
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
  });

  it("rejects bytes that do not exactly encode the admitted canonical artifact", () => {
    const baseline = input();
    const baselineRow = onlyRow(baseline);
    expect(() => createRouteWorldPackageValidationReportV1({
      ...baseline,
      rows: [{
        ...baselineRow,
        evidenceBytes: {
          ...baselineRow.evidenceBytes,
          traversalGraph: canonicalJsonBytes({ forged: true }),
        },
      }],
    })).toThrow("ROUTE_VALIDATION_EVIDENCE_BYTES_MISMATCH");
  });

  it("rejects accessor-bearing input before a Profile getter can split identity from thresholds", () => {
    const baseline = input();
    const gateDefinitionsById = baseline.validationProfile.gateDefinitionsById;
    let getterCalls = 0;
    const validationProfile = { ...baseline.validationProfile };
    Object.defineProperty(validationProfile, "gateDefinitionsById", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return gateDefinitionsById;
      },
    });

    expect(() => createRouteWorldPackageValidationReportV1({
      ...baseline,
      validationProfile,
    })).toThrow("ROUTE_VALIDATION_INPUT_ACCESSOR_FORBIDDEN");
    expect(getterCalls).toBe(0);
  });

  it("produces the same Report hash when canonical input maps are reordered", () => {
    const first = createRouteWorldPackageValidationReportV1(input({ reverseMaps: false }));
    const second = createRouteWorldPackageValidationReportV1(input({ reverseMaps: true }));

    expect(hashValidationReportV1(second)).toBe(hashValidationReportV1(first));
  });
});


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
    traversalSurfaces: [SURFACE],
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded" as const,
      terrainEntityId: SURFACE.surfaceEntityId,
      triangleSoup: terrainSoupV2(),
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
  const resolvedTraversalLockReceipt = resolveTraversalLockV1(lockInput());
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

describe("createRouteWorldPackageValidationReportV1 Path/Probe V2 rows", () => {
  it("accepts a complete V2 Build Input, Path, and Probe row", () => {
    const row = v2RowInput();
    const report = createRouteWorldPackageValidationReportV1({
      reportId: "v2-route-validation",
      subject: SUBJECT,
      executionPlanHash: HASH_C,
      resourceLockHash: HASH_B,
      validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
      requiredRoutes: [requiredRouteForRow(row)],
      rows: [row],
    });
    expect(report.status).toBe("passed");
    expect(validateValidationReportV1(report).ok).toBe(true);
  });
});
