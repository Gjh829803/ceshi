import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import * as traversal from "./index.js";
import type {
  CharacterSupportSurfaceResolutionV1,
  RoutePathReceiptV2,
  ResolvedTraversalDriverProfileV1,
  TraversalRuntimePortV1,
  TraversalRuntimeTickEvidenceV1,
} from "./index.js";
import type {
  RouteRuntimeProbeFailureV2,
  RouteRuntimeProbeReceiptV2,
  RouteRuntimeProbeRequestV2,
  RouteRuntimeProbeTickV2,
} from "./runtime-probe-contract.js";

interface RuntimeProbeApi {
  readonly advanceRouteRuntimeProbeSupportStationV2: (
    path: RoutePathReceiptV2,
    subjectPositionMetersXYZ: readonly [number, number, number],
    previousArcLengthMeters: number,
    walkSpeedMetersPerSecond: number,
    positionQuantizationMeters: number,
    fixedTimeStepSeconds: number,
  ) => Readonly<{
    readonly arcLengthMeters: number;
    readonly totalArcLengthMeters: number;
    readonly remainingArcLengthMeters: number;
    readonly expectedTraversalSurfaceIds: readonly string[];
    readonly retainedSegmentIndexes: readonly number[];
  }>;
  readonly assertRouteRuntimeProbeReceiptContextV2: (input: Readonly<{
    receipt: RouteRuntimeProbeReceiptV2;
    routePathReceipt: RoutePathReceiptV2;
    resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
    validationProfileIdentity: Readonly<{
      resourceRef: string;
      version: string;
      contentHash: `sha256:${string}`;
    }>;
  }>) => RouteRuntimeProbeReceiptV2;
  readonly canonicalRoutePathReceiptV2: typeof traversal.canonicalRoutePathReceiptV2;
  readonly hashRoutePathReceiptV2: typeof traversal.hashRoutePathReceiptV2;
  readonly canonicalRouteRuntimeProbeReceiptV2: (
    value: unknown,
  ) => RouteRuntimeProbeReceiptV2;
  readonly canonicalRouteRuntimeProbeRequestV2: (
    value: unknown,
  ) => RouteRuntimeProbeRequestV2;
  readonly canonicalRouteRuntimeProbeTickV2: (
    value: unknown,
  ) => RouteRuntimeProbeTickV2;
  readonly createRouteRuntimeProbeRequestV2: (input: Readonly<{
    routePathReceipt: RoutePathReceiptV2;
    runtimePort: TraversalRuntimePortV1;
    resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
    validationProfileIdentity: Readonly<{
      resourceRef: string;
      version: string;
      contentHash: `sha256:${string}`;
    }>;
    walkSpeedMetersPerSecond?: number;
    resolvedControlFeelProfile: Readonly<{
      readonly walkSpeedMetersPerSecond: number;
    }>;
    positionQuantizationMeters: number;
  }>) => RouteRuntimeProbeRequestV2;
  readonly hashRouteRuntimeProbeReceiptV2: (
    value: unknown,
  ) => `sha256:${string}`;
  readonly hashRouteRuntimeProbeRequestV2: (
    value: unknown,
  ) => `sha256:${string}`;
  readonly hashRouteRuntimeProbeTickV2: (
    value: unknown,
  ) => `sha256:${string}`;
}

const {
  advanceRouteRuntimeProbeSupportStationV2,
  assertRouteRuntimeProbeReceiptContextV2,
  canonicalRoutePathReceiptV2,
  canonicalRouteRuntimeProbeReceiptV2,
  canonicalRouteRuntimeProbeRequestV2,
  canonicalRouteRuntimeProbeTickV2,
  createRouteRuntimeProbeRequestV2,
  hashRoutePathReceiptV2,
  hashRouteRuntimeProbeReceiptV2,
  hashRouteRuntimeProbeRequestV2,
  hashRouteRuntimeProbeTickV2,
} = traversal as unknown as RuntimeProbeApi;

const hasRuntimeProbeApi = [
  assertRouteRuntimeProbeReceiptContextV2,
  canonicalRouteRuntimeProbeReceiptV2,
  canonicalRouteRuntimeProbeRequestV2,
  canonicalRouteRuntimeProbeTickV2,
  createRouteRuntimeProbeRequestV2,
  hashRouteRuntimeProbeReceiptV2,
  hashRouteRuntimeProbeRequestV2,
  hashRouteRuntimeProbeTickV2,
].every((candidate) => typeof candidate === "function");

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const DRIVER_HASH =
  "sha256:a3312d306ad499dabb29a50c868a98d8bb3b65592e050cd277ae3571d5347405" as const;
const GRAPH_BUILDER_PROFILE = traversal.resolveTraversalGraphBuilderProfileV2(
  traversal.BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
);

const SURFACE = {
  traversalSurfaceId: "surface-main",
  surfaceEntityId: "terrain-main",
  colliderSubshapeId: "terrain-heightfield",
  resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
  resolvedVersion: "1",
  resourceHash: HASH_A,
} as const;

const RUNTIME_IDENTITY = {
  runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
  runtimeBackendResolvedVersion: "1",
  runtimeBackendHash: HASH_B,
  runtimeAdapterRef: "worldkit://runtime-adapter/character-controller@1",
  runtimeAdapterResolvedVersion: "1",
  runtimeAdapterHash: HASH_C,
} as const;

const RESOLVED_DRIVER_PROFILE: ResolvedTraversalDriverProfileV1 = {
  resourceRef:
    "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
  resolvedVersion: "1",
  contentHash: DRIVER_HASH,
  profile: {
    kind: "traversal-driver-profile",
    schemaVersion: 1,
    pathLookaheadMetersXZ: 2.4,
    cornerSelectionMode: "next-visible-segment",
    intentDirectionQuantizationRatio: 0.001,
    locomotionIntentMode: "walk",
  },
};

const VALIDATION_PROFILE_IDENTITY = {
  resourceRef:
    "worldkit://validation-profile/outdoor-world-package.dev@2",
  version: "2",
  contentHash: HASH_B,
} as const;

function pathReceipt(): RoutePathReceiptV2 {
  return canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash: HASH_C,
    traversalGraphHash: HASH_A,
    routeBuildInputHash: HASH_B,
    resolvedTraversalLockHash: HASH_C,
    orderedTraversalSurfaceIdentities: [SURFACE, SURFACE],
    graphBuilderProfileRef: GRAPH_BUILDER_PROFILE.resourceRef,
    graphBuilderResolvedVersion: GRAPH_BUILDER_PROFILE.resolvedVersion,
    graphBuilderProfileHash: GRAPH_BUILDER_PROFILE.contentHash,
    orderedTraversalNodeIds: ["node-a", "node-b"],
    orderedTraversalEdgeIds: ["edge-a-b"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 0.5,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

function request(
  overrides: Partial<RouteRuntimeProbeRequestV2> = {},
): RouteRuntimeProbeRequestV2 {
  const path = pathReceipt();
  return {
    kind: "route-runtime-probe-request",
    schemaVersion: 2,
    routePathReceiptHash: hashRoutePathReceiptV2(path),
    constraintId: path.constraintId,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchorEntityId: path.startAnchorEntityId,
    destinationAnchorEntityId: path.destinationAnchorEntityId,
    authoringSpecHash: path.authoringSpecHash,
    layoutSolveReportHash: path.layoutSolveReportHash,
    resourceLockHash: path.resourceLockHash,
    executionPlanHash: HASH_A,
    routeBuildInputHash: path.routeBuildInputHash,
    traversalGraphHash: path.traversalGraphHash,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    driverProfileRef:
      "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
    driverResolvedVersion: "1",
    driverProfileHash: DRIVER_HASH,
    validationProfileRef:
      "worldkit://validation-profile/outdoor-world-package.dev@2",
    validationProfileVersion: "2",
    validationProfileHash: HASH_B,
    runtimeImplementationIdentity: RUNTIME_IDENTITY,
    walkSpeedMetersPerSecond: 4,
    positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    ...overrides,
  };
}

function surfaceResolution(
  mode: "resolved" | "unsupported" | "unmatched" | "ambiguous" = "resolved",
): CharacterSupportSurfaceResolutionV1 {
  return mode === "resolved" ? { mode: "resolved", ...SURFACE } : { mode };
}

function runtimeEvidence(
  tick: number,
  overrides: Partial<TraversalRuntimeTickEvidenceV1> = {},
): TraversalRuntimeTickEvidenceV1 {
  return {
    kind: "traversal-runtime-tick-evidence",
    schemaVersion: 1,
    tick,
    traversingEntityId: "player",
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash: HASH_C,
    executionPlanHash: HASH_A,
    resolvedTraversalLockHash: HASH_C,
    runtimeImplementationIdentity: RUNTIME_IDENTITY,
    fixedTimeStepSeconds: 1 / 60,
    subjectPositionMetersXYZ: [tick / 2, 0, 0],
    velocityMetersPerSecondXYZ: [1, 0, 0],
    movementMedium: "ground",
    locomotionMode: tick === 0 ? "idle" : "walk",
    characterSupport: {
      kind: "character-support-evidence",
      schemaVersion: 1,
      supportState: "supported",
      supportNormalWorldXYZ: [0, 1, 0],
      sampledFootPositionMetersXYZ: [tick / 2, -0.9, 0],
      isSupportSurfaceDynamic: false,
      surfaceResolution: surfaceResolution(),
    },
    ...overrides,
  };
}

function unsupportedRuntimeEvidence(tick: number): TraversalRuntimeTickEvidenceV1 {
  return runtimeEvidence(tick, {
    movementMedium: "air",
    locomotionMode: "airborne",
    characterSupport: {
      kind: "character-support-evidence",
      schemaVersion: 1,
      supportState: "unsupported",
      supportNormalWorldXYZ: [0, 1, 0],
      sampledFootPositionMetersXYZ: [tick / 2, -0.9, 0],
      isSupportSurfaceDynamic: false,
      surfaceResolution: { mode: "unsupported" },
    },
  });
}

function tick(
  probeTick: number,
  overrides: Partial<RouteRuntimeProbeTickV2> = {},
): RouteRuntimeProbeTickV2 {
  return {
    kind: "route-runtime-probe-tick",
    schemaVersion: 2,
    probeTick,
    runtimeEvidence: runtimeEvidence(probeTick),
    walkDirectionWorldXZ: [1, 0],
    routeProgressMetersXZ: probeTick / 2,
    remainingRouteDistanceMetersXZ: 1 - probeTick / 2,
    routeDeviationMetersXZ: probeTick / 10,
    stalledDurationTicks: probeTick - 1,
    consecutiveUnexpectedUnsupportedTicks: 0,
    expectedTraversalSurfaceIds: [SURFACE.traversalSurfaceId],
    ...overrides,
  };
}

function metrics(
  overrides: Partial<RouteRuntimeProbeReceiptV2["metrics"]> = {},
): RouteRuntimeProbeReceiptV2["metrics"] {
  return {
    processedTickCount: 2,
    maximumStalledDurationTicks: 1,
    maximumRouteDeviationMetersXZ: 0.2,
    maximumConsecutiveUnexpectedUnsupportedTicks: 0,
    slidingDurationTicks: 1,
    unexpectedSupportLossCount: 0,
    wrongSupportSurfaceCount: 0,
    invalidPhysicsValueCount: 0,
    ...overrides,
  };
}

function completeReceipt(): RouteRuntimeProbeReceiptV2 {
  const second = tick(2, {
    runtimeEvidence: runtimeEvidence(2, {
      characterSupport: {
        ...runtimeEvidence(2).characterSupport,
        supportState: "sliding",
      },
    }),
  });
  return {
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "complete",
    request: request(),
    initialRuntimeEvidence: runtimeEvidence(0),
    ticks: [tick(1), second],
    metrics: metrics(),
    completionDurationTicks: 2,
  };
}

function oneTickFailure(
  failure: RouteRuntimeProbeFailureV2,
  tickOverrides: Partial<RouteRuntimeProbeTickV2> = {},
): Extract<RouteRuntimeProbeReceiptV2, { readonly status: "failed" }> {
  const finalTick = tick(1, tickOverrides);
  return {
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "failed",
    request: request(),
    initialRuntimeEvidence: runtimeEvidence(0),
    ticks: [finalTick],
    metrics: {
      processedTickCount: 1,
      maximumStalledDurationTicks: finalTick.stalledDurationTicks,
      maximumRouteDeviationMetersXZ: finalTick.routeDeviationMetersXZ,
      maximumConsecutiveUnexpectedUnsupportedTicks:
        finalTick.consecutiveUnexpectedUnsupportedTicks,
      slidingDurationTicks:
        finalTick.runtimeEvidence.characterSupport.supportState === "sliding" ? 1 : 0,
      unexpectedSupportLossCount:
        finalTick.runtimeEvidence.characterSupport.supportState === "unsupported" ? 1 : 0,
      wrongSupportSurfaceCount: failure.kind === "support-surface-mismatch" ? 1 : 0,
      invalidPhysicsValueCount: 0,
    },
    failure,
  };
}

describe("runtime probe contract public API", () => {
  it("exports the requested canonical contract surface", () => {
    expect(hasRuntimeProbeApi).toBe(true);
  });
});

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeRequestV2", () => {
  it("canonicalizes the closed Path, World, Lock, Runtime, Driver, and Validation identities", () => {
    const raw = request();
    const canonical = canonicalRouteRuntimeProbeRequestV2(raw);

    expect(canonical).not.toBe(raw);
    expect(canonical).toEqual(raw);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(canonical.walkSpeedMetersPerSecond).toBe(4);
    expect(Object.isFrozen(canonical.runtimeImplementationIdentity)).toBe(true);
    expect(hashRouteRuntimeProbeRequestV2(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("rejects Registry Driver mismatches", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV2(request({
      driverProfileHash: HASH_A,
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
  });

  it("validates Validation Profile identity shape without importing Validation policy", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV2(request({
      validationProfileRef: "",
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV2(request({
      validationProfileVersion: "",
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV2(request({
      validationProfileHash: "sha256:UPPERCASE",
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
  });

  it("binds Runtime Port identity before reset and rejects a mismatched Port without mutation", () => {
    let resetCount = 0;
    let fixedTickCount = 0;
    const port: TraversalRuntimePortV1 = {
      kind: "traversal-runtime-port",
      schemaVersion: 1,
      traversingEntityId: "player",
      authoringSpecHash: HASH_B,
      layoutSolveReportHash: HASH_B,
      resourceLockHash: HASH_C,
      executionPlanHash: HASH_A,
      resolvedTraversalLockHash: HASH_C,
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
      readLatestTickEvidence: () => runtimeEvidence(0),
      resetToStartAnchor: () => {
        resetCount += 1;
        return runtimeEvidence(0);
      },
      runFixedTick: async () => {
        fixedTickCount += 1;
        return runtimeEvidence(1);
      },
    };

    expect(() => createRouteRuntimeProbeRequestV2({
      routePathReceipt: pathReceipt(),
      runtimePort: port,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => createRouteRuntimeProbeRequestV2({
      routePathReceipt: pathReceipt(),
      runtimePort: {
        ...port,
        authoringSpecHash: HASH_A,
        resolvedTraversalLockHash: HASH_A,
      },
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(resetCount).toBe(0);
    expect(fixedTickCount).toBe(0);

    const classBasedPort = Object.assign(
      new (class RuntimePortFixture {})(),
      port,
      { authoringSpecHash: HASH_A },
    ) as TraversalRuntimePortV1;
    const canonical = createRouteRuntimeProbeRequestV2({
      routePathReceipt: pathReceipt(),
      runtimePort: classBasedPort,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    });
    expect(canonical).toEqual(request());

    const throwingPort = Object.create(classBasedPort) as TraversalRuntimePortV1;
    Object.defineProperty(throwingPort, "runtimeImplementationIdentity", {
      get: () => {
        throw new Error("Havok native provider detail");
      },
    });
    expect(() => createRouteRuntimeProbeRequestV2({
      routePathReceipt: pathReceipt(),
      runtimePort: throwingPort,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    })).toThrow(
      "ROUTE_RUNTIME_PROBE_REQUEST_INVALID: runtimePort: provider-neutral identity unavailable",
    );
  });

  it("rejects provider dialect and Validation thresholds", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV2({
      ...request(),
      babylonBodyId: 42,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV2({
      ...request(),
      maximumProbeTicks: 600,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
  });
});

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeTickV2", () => {
  it("preserves canonical Runtime evidence, normalizes negative zero, freezes, and hashes", () => {
    const raw = tick(1, {
      walkDirectionWorldXZ: [-0, 1],
      routeDeviationMetersXZ: -0,
      stalledDurationTicks: 0,
    });
    const canonical = canonicalRouteRuntimeProbeTickV2(raw);

    expect(canonical.walkDirectionWorldXZ).toEqual([0, 1]);
    expect(canonical.routeDeviationMetersXZ).toBe(0);
    expect(canonical.runtimeEvidence).toEqual(raw.runtimeEvidence);
    expect(Object.isFrozen(canonical.runtimeEvidence.characterSupport)).toBe(true);
    expect(hashRouteRuntimeProbeTickV2(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("rejects non-positive/non-integer Probe ticks, non-unit intent, invalid metrics, and unknown fields", () => {
    for (const probeTick of [0, -1, 1.5]) {
      expect(() => canonicalRouteRuntimeProbeTickV2(tick(probeTick)))
        .toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    }
    expect(() => canonicalRouteRuntimeProbeTickV2(tick(1, {
      walkDirectionWorldXZ: [0.5, 0.5],
    }))).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    expect(() => canonicalRouteRuntimeProbeTickV2(tick(1, {
      routeProgressMetersXZ: Number.NaN,
    }))).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    expect(() => canonicalRouteRuntimeProbeTickV2({
      ...tick(1),
      havokContactHandle: 1,
    })).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
  });
});

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeReceiptV2", () => {
  it("admits a canonical complete receipt with deterministic metrics and immutable stable bytes", () => {
    const raw = completeReceipt();
    const canonical = canonicalRouteRuntimeProbeReceiptV2(raw);

    expect(canonical).not.toBe(raw);
    expect(canonical).toEqual(raw);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.ticks)).toBe(true);
    expect(Object.isFrozen(canonical.ticks[0]?.walkDirectionWorldXZ)).toBe(true);
    expect(hashRouteRuntimeProbeReceiptV2(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("keeps a 3-4-5 Path's 3D distance while completing against zero XZ remaining distance", () => {
    const slopedPath = canonicalRoutePathReceiptV2({
      ...pathReceipt(),
      orderedPathPositionsMetersXYZ: [[0, 0, 0], [3, 4, 0]],
      routePathDistanceMeters: 5,
      routePathDistanceMetersXZ: 3,
      maximumObservedSlopeDegrees: 53.130103,
    });
    const finalRow = tick(1, {
      routeProgressMetersXZ: 3,
      remainingRouteDistanceMetersXZ: 0,
      routeDeviationMetersXZ: 0,
    });
    const raw: RouteRuntimeProbeReceiptV2 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 2,
      status: "complete",
      request: canonicalRouteRuntimeProbeRequestV2({
        ...request(),
        routePathReceiptHash: hashRoutePathReceiptV2(slopedPath),
      }),
      initialRuntimeEvidence: runtimeEvidence(0),
      ticks: [finalRow],
      metrics: metrics({
        processedTickCount: 1,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
      }),
      completionDurationTicks: 1,
    };

    const canonical = assertRouteRuntimeProbeReceiptContextV2({
      receipt: raw,
      routePathReceipt: slopedPath,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    });
    expect(slopedPath.routePathDistanceMeters).toBe(5);
    expect(slopedPath.routePathDistanceMetersXZ).toBe(3);
    expect(canonical.ticks.at(-1)?.remainingRouteDistanceMetersXZ).toBe(0);
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...raw,
      ticks: [{ ...finalRow, remainingRouteDistanceMetersXZ: 0.25 }],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("admits every closed failure branch with evidence-derived observed values", () => {
    const unsupportedInitial = unsupportedRuntimeEvidence(0);
    const startInvalid: RouteRuntimeProbeReceiptV2 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 2,
      status: "failed",
      request: request(),
      initialRuntimeEvidence: unsupportedInitial,
      ticks: [],
      metrics: metrics({
        processedTickCount: 0,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
      }),
      failure: {
        kind: "start-support-invalid",
        failureProbeTick: 0,
        failurePositionMetersXYZ: unsupportedInitial.subjectPositionMetersXYZ,
        supportState: "unsupported",
      },
    };

    const mismatchedEvidence = runtimeEvidence(1, {
      characterSupport: {
        ...runtimeEvidence(1).characterSupport,
        surfaceResolution: surfaceResolution("unmatched"),
      },
    });
    const branches: readonly RouteRuntimeProbeReceiptV2[] = [
      startInvalid,
      oneTickFailure({
        kind: "support-surface-mismatch",
        failureProbeTick: 1,
        failurePositionMetersXYZ: mismatchedEvidence.subjectPositionMetersXYZ,
        supportState: "supported",
        surfaceResolutionMode: "unmatched",
      }, { runtimeEvidence: mismatchedEvidence }),
      oneTickFailure({
        kind: "runtime-stalled",
        failureProbeTick: 1,
        failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
        stalledDurationTicks: 4,
      }, { stalledDurationTicks: 4 }),
      oneTickFailure({
        kind: "runtime-deviated",
        failureProbeTick: 1,
        failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
        routeDeviationMetersXZ: 1.5,
      }, { routeDeviationMetersXZ: 1.5 }),
      oneTickFailure({
        kind: "runtime-support-lost",
        failureProbeTick: 1,
        failurePositionMetersXYZ: unsupportedRuntimeEvidence(1).subjectPositionMetersXYZ,
        consecutiveUnexpectedUnsupportedTicks: 1,
      }, {
        runtimeEvidence: unsupportedRuntimeEvidence(1),
        consecutiveUnexpectedUnsupportedTicks: 1,
      }),
      oneTickFailure({
        kind: "maximum-probe-ticks-reached",
        failureProbeTick: 1,
        failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
        processedTickCount: 1,
      }),
    ];

    for (const branch of branches) {
      expect(canonicalRouteRuntimeProbeReceiptV2(branch)).toEqual(branch);
    }
    expect(startInvalid.failure.failurePositionMetersXYZ).not.toEqual(
      startInvalid.initialRuntimeEvidence.characterSupport.sampledFootPositionMetersXYZ,
    );
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...startInvalid,
      ticks: [tick(1)],
      metrics: metrics({
        processedTickCount: 1,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0.1,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
      }),
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("rejects prototype-key failure discriminators with the stable receipt prefix", () => {
    const base = oneTickFailure({
      kind: "runtime-stalled",
      failureProbeTick: 1,
      failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
      stalledDurationTicks: 4,
    }, { stalledDurationTicks: 4 });

    for (const kind of ["toString", "constructor"]) {
      expect(() => canonicalRouteRuntimeProbeReceiptV2({
        ...base,
        failure: { kind },
      })).toThrow(/^ROUTE_RUNTIME_PROBE_RECEIPT_INVALID:/);
    }
  });

  it("rejects completion on an unsupported final Tick at the destination", () => {
    const finalTick = tick(1, {
      runtimeEvidence: unsupportedRuntimeEvidence(1),
      routeProgressMetersXZ: 1,
      remainingRouteDistanceMetersXZ: 0,
      consecutiveUnexpectedUnsupportedTicks: 1,
    });
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...completeReceipt(),
      ticks: [finalTick],
      metrics: metrics({
        processedTickCount: 1,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0.1,
        maximumConsecutiveUnexpectedUnsupportedTicks: 1,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 1,
      }),
      completionDurationTicks: 1,
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("reduces initial surface mismatch separately and contextually proves Path/Profile bindings", () => {
    const initialRuntimeEvidence = runtimeEvidence(0, {
      characterSupport: {
        ...runtimeEvidence(0).characterSupport,
        surfaceResolution: { mode: "ambiguous" },
      },
    });
    const failed: RouteRuntimeProbeReceiptV2 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 2,
      status: "failed",
      request: request(),
      initialRuntimeEvidence,
      ticks: [],
      metrics: metrics({
        processedTickCount: 0,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
        wrongSupportSurfaceCount: 1,
      }),
      failure: {
        kind: "support-surface-mismatch",
        failureProbeTick: 0,
        failurePositionMetersXYZ: initialRuntimeEvidence.subjectPositionMetersXYZ,
        supportState: "supported",
        surfaceResolutionMode: "ambiguous",
      },
    };
    const canonical = canonicalRouteRuntimeProbeReceiptV2(failed);
    expect(assertRouteRuntimeProbeReceiptContextV2({
      receipt: canonical,
      routePathReceipt: pathReceipt(),
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toEqual(canonical);
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...failed,
      ticks: [tick(1)],
      metrics: metrics({
        processedTickCount: 1,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0.1,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
        wrongSupportSurfaceCount: 1,
      }),
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => assertRouteRuntimeProbeReceiptContextV2({
      receipt: {
        ...canonical,
        request: { ...canonical.request, destinationAnchorEntityId: "other-goal" },
      },
      routePathReceipt: pathReceipt(),
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toThrow("ROUTE_RUNTIME_PROBE_CONTEXT_INVALID");
  });

  it("rejects non-consecutive evidence/Probe ticks and every identity mismatch", () => {
    const base = completeReceipt();
    const invalidReceipts: readonly unknown[] = [
      { ...base, initialRuntimeEvidence: runtimeEvidence(1) },
      { ...base, ticks: [tick(2), tick(3)] },
      { ...base, ticks: [tick(1), tick(3)] },
      {
        ...base,
        ticks: [
          tick(1, { runtimeEvidence: runtimeEvidence(2) }),
          base.ticks[1],
        ],
      },
      {
        ...base,
        ticks: [tick(1, {
          runtimeEvidence: runtimeEvidence(1, { traversingEntityId: "other" }),
        }), base.ticks[1]],
      },
      {
        ...base,
        ticks: [tick(1, {
          runtimeEvidence: runtimeEvidence(1, { authoringSpecHash: HASH_B }),
        }), base.ticks[1]],
      },
      {
        ...base,
        ticks: [tick(1, {
          runtimeEvidence: runtimeEvidence(1, { resolvedTraversalLockHash: HASH_A }),
        }), base.ticks[1]],
      },
      {
        ...base,
        ticks: [tick(1, {
          runtimeEvidence: runtimeEvidence(1, {
            runtimeImplementationIdentity: {
              ...RUNTIME_IDENTITY,
              runtimeBackendHash: HASH_A,
            },
          }),
        }), base.ticks[1]],
      },
      {
        ...base,
        ticks: [tick(1, {
          runtimeEvidence: runtimeEvidence(1, { fixedTimeStepSeconds: 1 / 30 }),
        }), base.ticks[1]],
      },
    ];
    for (const invalid of invalidReceipts) {
      expect(() => canonicalRouteRuntimeProbeReceiptV2(invalid))
        .toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    }
  });

  it("rejects metric reductions, completion duration, and failure evidence inconsistencies", () => {
    const complete = completeReceipt();
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...complete,
      metrics: { ...complete.metrics, slidingDurationTicks: 0 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...complete,
      completionDurationTicks: 1,
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");

    const failed = oneTickFailure({
      kind: "runtime-stalled",
      failureProbeTick: 1,
      failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
      stalledDurationTicks: 4,
    }, { stalledDurationTicks: 4 });
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...failed,
      failure: { ...failed.failure, failureProbeTick: 0 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...failed,
      failure: { ...failed.failure, failurePositionMetersXYZ: [99, 0, 0] },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...failed,
      failure: { ...failed.failure, stalledDurationTicks: 3 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("rejects unknown provider/error/threshold fields and malformed Runtime values without a receipt", () => {
    const complete = completeReceipt();
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...complete,
      destinationToleranceMeters: 0.5,
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...complete,
      ticks: [{ ...complete.ticks[0], providerBodyId: 7 }, complete.ticks[1]],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...complete,
      ticks: [{
        ...complete.ticks[0],
        runtimeEvidence: {
          ...complete.ticks[0]?.runtimeEvidence,
          subjectPositionMetersXYZ: [Number.NaN, 0, 0],
        },
      }, complete.ticks[1]],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV2({
      ...oneTickFailure({
        kind: "runtime-stalled",
        failureProbeTick: 1,
        failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
        stalledDurationTicks: 4,
      }, { stalledDurationTicks: 4 }),
      failure: {
        kind: "runtime-stalled",
        failureProbeTick: 1,
        failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
        stalledDurationTicks: 4,
        havokError: "native provider detail",
      },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });
});


const hasRuntimeProbeApiV2 = [
  advanceRouteRuntimeProbeSupportStationV2,
  assertRouteRuntimeProbeReceiptContextV2,
  canonicalRouteRuntimeProbeReceiptV2,
  canonicalRouteRuntimeProbeRequestV2,
  canonicalRouteRuntimeProbeTickV2,
  createRouteRuntimeProbeRequestV2,
  hashRouteRuntimeProbeReceiptV2,
  hashRouteRuntimeProbeRequestV2,
  hashRouteRuntimeProbeTickV2,
].every((candidate) => typeof candidate === "function");

function pathReceiptV2(
  points: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [1, 0, 0]],
  surfaceIds: readonly string[] = points.map(() => SURFACE.traversalSurfaceId),
): traversal.RoutePathReceiptV2 {
  const routePathDistanceMeters = points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    );
  }, 0);
  const routePathDistanceMetersXZ = points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.hypot(point[0] - previous[0], point[2] - previous[2]);
  }, 0);
  const identities = surfaceIds.map((traversalSurfaceId, index) => ({
    ...SURFACE,
    traversalSurfaceId,
    surfaceEntityId: `${SURFACE.surfaceEntityId}-${index}`,
  }));
  return canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash: HASH_C,
    traversalGraphHash: HASH_A,
    routeBuildInputHash: HASH_B,
    resolvedTraversalLockHash: HASH_C,
    graphBuilderProfileRef: GRAPH_BUILDER_PROFILE.resourceRef,
    graphBuilderResolvedVersion: GRAPH_BUILDER_PROFILE.resolvedVersion,
    graphBuilderProfileHash: GRAPH_BUILDER_PROFILE.contentHash,
    orderedTraversalNodeIds: points.map((_, index) => `node-${index}`),
    orderedTraversalEdgeIds: points.slice(1).map((_, index) => `edge-${index}`),
    orderedPathPositionsMetersXYZ: points,
    orderedTraversalSurfaceIdentities: identities,
    routePathDistanceMeters,
    routePathDistanceMetersXZ,
    routePathCost: routePathDistanceMeters,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

describe("runtime probe contract V2 public API", () => {
  it("exports Probe V2 canonical, hash, create, and assert siblings beside V1", () => {
    expect(hasRuntimeProbeApiV2).toBe(true);
  });
});

describe.skipIf(!hasRuntimeProbeApiV2)("RouteRuntimeProbeRequestV2", () => {
  it("binds a Path Receipt V2 hash and does not copy a path-global Surface identity", () => {
    const path = pathReceiptV2();
    const created = createRouteRuntimeProbeRequestV2!({
      routePathReceipt: path,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      runtimePort: {
        kind: "traversal-runtime-port",
        schemaVersion: 1,
        traversingEntityId: path.traversingEntityId,
        authoringSpecHash: path.authoringSpecHash,
        layoutSolveReportHash: path.layoutSolveReportHash,
        resourceLockHash: path.resourceLockHash,
        executionPlanHash: HASH_A,
        resolvedTraversalLockHash: path.resolvedTraversalLockHash,
        runtimeImplementationIdentity: RUNTIME_IDENTITY,
        readLatestTickEvidence: () => runtimeEvidence(0),
        resetToStartAnchor: () => runtimeEvidence(0),
        runFixedTick: async () => runtimeEvidence(1),
      },
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    }) as unknown as Record<string, unknown>;
    expect(created.schemaVersion).toBe(2);
    expect(created.routePathReceiptHash).toBe(hashRoutePathReceiptV2(path));
    expect(created.walkSpeedMetersPerSecond).toBe(4);
    expect(created.positionQuantizationMeters).toBe(
      GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    );
    expect(created).not.toHaveProperty("traversalSurfaceIdentity");
    const canonical = canonicalRouteRuntimeProbeRequestV2!(created) as object;
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(() => canonicalRouteRuntimeProbeRequestV2!({
      ...created,
      orderedTraversalSurfaceIdentities: SURFACE,
    })).toThrow(/ROUTE_RUNTIME_PROBE_REQUEST_INVALID/);
  });

  it("derives request walk speed from the resolved control-feel profile only", () => {
    const path = pathReceiptV2();
    const created = createRouteRuntimeProbeRequestV2!({
      routePathReceipt: path,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      runtimePort: {
        kind: "traversal-runtime-port",
        schemaVersion: 1,
        traversingEntityId: path.traversingEntityId,
        authoringSpecHash: path.authoringSpecHash,
        layoutSolveReportHash: path.layoutSolveReportHash,
        resourceLockHash: path.resourceLockHash,
        executionPlanHash: HASH_A,
        resolvedTraversalLockHash: path.resolvedTraversalLockHash,
        runtimeImplementationIdentity: RUNTIME_IDENTITY,
        readLatestTickEvidence: () => runtimeEvidence(0),
        resetToStartAnchor: () => runtimeEvidence(0),
        runFixedTick: async () => runtimeEvidence(1),
      },
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 1 },
      positionQuantizationMeters: GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
    });
    expect(created.walkSpeedMetersPerSecond).toBe(1);
  });
});

describe.skipIf(!hasRuntimeProbeApiV2)("RouteRuntimeProbeTickV2", () => {
  it("requires sorted unique expectedTraversalSurfaceIds and rejects V1-only Surface fields", () => {
    const raw = {
      kind: "route-runtime-probe-tick",
      schemaVersion: 2,
      probeTick: 1,
      runtimeEvidence: runtimeEvidence(1),
      walkDirectionWorldXZ: [1, 0],
      routeProgressMetersXZ: 0.5,
      remainingRouteDistanceMetersXZ: 0.5,
      routeDeviationMetersXZ: 0,
      stalledDurationTicks: 0,
      consecutiveUnexpectedUnsupportedTicks: 0,
      expectedTraversalSurfaceIds: ["surface-b", "surface-a"],
    };
    const canonical = canonicalRouteRuntimeProbeTickV2!(raw) as {
      readonly expectedTraversalSurfaceIds: readonly string[];
    };
    expect(canonical.expectedTraversalSurfaceIds).toEqual(["surface-a", "surface-b"]);
    expect(canonical).not.toHaveProperty("traversalSurfaceIdentity");
    expect(() => canonicalRouteRuntimeProbeTickV2!({
      ...raw,
      expectedTraversalSurfaceIds: ["surface-a", "surface-a"],
    })).toThrow(/ROUTE_RUNTIME_PROBE_TICK_INVALID/);
  });
});

describe.skipIf(!hasRuntimeProbeApiV2)("advanceRouteRuntimeProbeSupportStationV2", () => {
  it("defines a total station for one node and preserves 3D layered topology", () => {
    const oneNode = advanceRouteRuntimeProbeSupportStationV2(
      pathReceiptV2([[0, 0, 0]], ["surface-a"]),
      [0, 0, 0],
      0,
      1,
      GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
      1 / 60,
    );
    expect(oneNode).toEqual({
      arcLengthMeters: 0,
      totalArcLengthMeters: 0,
      remainingArcLengthMeters: 0,
      expectedTraversalSurfaceIds: ["surface-a"],
      retainedSegmentIndexes: [],
    });

    const vertical = advanceRouteRuntimeProbeSupportStationV2(
      pathReceiptV2([[0, 0, 0], [0, 2, 0]], ["surface-a", "surface-b"]),
      [0, 1.5, 0],
      0,
      10,
      GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
      1,
    );
    expect(vertical).toMatchObject({
      arcLengthMeters: 1.5,
      totalArcLengthMeters: 2,
      remainingArcLengthMeters: 0.5,
      expectedTraversalSurfaceIds: ["surface-a", "surface-b"],
      retainedSegmentIndexes: [0],
    });

    const layeredCrossing = advanceRouteRuntimeProbeSupportStationV2(
      pathReceiptV2(
        [[0, 0, 0], [2, 0, 2], [0, 5, 2], [2, 5, 0]],
        ["surface-lower", "surface-lower", "surface-connector", "surface-upper"],
      ),
      [1, 0, 1],
      0,
      20,
      GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
      1,
    );
    expect(layeredCrossing.retainedSegmentIndexes).toEqual([0]);
    expect(layeredCrossing.expectedTraversalSurfaceIds).toEqual(["surface-lower"]);
  });

  it("bounds the station window by walk speed times that tick's dt plus quantization", () => {
    const path = pathReceiptV2(
      [[0, 0, 0], [0.025, 0, 0], [1, 0, 0]],
      ["surface-a", "surface-a", "surface-b"],
    );
    const walkSpeedMetersPerSecond = 1;
    const positionQuantizationMeters =
      GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters;
    const previousArcLengthMeters = 0;
    const windowMeters = (fixedTimeStepSeconds: number): number =>
      walkSpeedMetersPerSecond * fixedTimeStepSeconds + positionQuantizationMeters;

    expect(windowMeters(1 / 60)).toBeLessThan(0.025);
    expect(windowMeters(1 / 30)).toBeGreaterThan(0.025);

    const atOriginSixty = advanceRouteRuntimeProbeSupportStationV2(
      path,
      [0, 0, 0],
      previousArcLengthMeters,
      walkSpeedMetersPerSecond,
      positionQuantizationMeters,
      1 / 60,
    );
    expect(atOriginSixty.expectedTraversalSurfaceIds).toEqual(["surface-a"]);

    const atOriginThirty = advanceRouteRuntimeProbeSupportStationV2(
      path,
      [0, 0, 0],
      previousArcLengthMeters,
      walkSpeedMetersPerSecond,
      positionQuantizationMeters,
      1 / 30,
    );
    expect(atOriginThirty.expectedTraversalSurfaceIds).toEqual(["surface-a"]);
    expect(atOriginThirty.retainedSegmentIndexes).toEqual([0]);

    const atSeamSixty = advanceRouteRuntimeProbeSupportStationV2(
      path,
      [0.025, 0, 0],
      previousArcLengthMeters,
      walkSpeedMetersPerSecond,
      positionQuantizationMeters,
      1 / 60,
    );
    expect(atSeamSixty.expectedTraversalSurfaceIds).toEqual(["surface-a"]);

    const atSeamThirty = advanceRouteRuntimeProbeSupportStationV2(
      path,
      [0.025, 0, 0],
      previousArcLengthMeters,
      walkSpeedMetersPerSecond,
      positionQuantizationMeters,
      1 / 30,
    );
    expect(atSeamThirty.expectedTraversalSurfaceIds).toEqual([
      "surface-a",
      "surface-b",
    ]);
    expect(atSeamThirty.retainedSegmentIndexes).toEqual([0, 1]);
  });
});
