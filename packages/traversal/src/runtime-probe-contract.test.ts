import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import * as traversal from "./index.js";
import type {
  CharacterSupportSurfaceResolutionV1,
  RoutePathReceiptV1,
  ResolvedTraversalDriverProfileV1,
  TraversalRuntimePortV1,
  TraversalRuntimeTickEvidenceV1,
} from "./index.js";
import type {
  RouteRuntimeProbeFailureV1,
  RouteRuntimeProbeReceiptV1,
  RouteRuntimeProbeRequestV1,
  RouteRuntimeProbeTickV1,
} from "./runtime-probe-contract.js";

interface RuntimeProbeApi {
  readonly assertRouteRuntimeProbeReceiptContextV1: (input: Readonly<{
    receipt: RouteRuntimeProbeReceiptV1;
    routePathReceipt: RoutePathReceiptV1;
    resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
    validationProfileIdentity: Readonly<{
      resourceRef: string;
      version: string;
      contentHash: `sha256:${string}`;
    }>;
  }>) => RouteRuntimeProbeReceiptV1;
  readonly canonicalRoutePathReceiptV1: typeof traversal.canonicalRoutePathReceiptV1;
  readonly hashRoutePathReceiptV1: typeof traversal.hashRoutePathReceiptV1;
  readonly canonicalRouteRuntimeProbeReceiptV1: (
    value: unknown,
  ) => RouteRuntimeProbeReceiptV1;
  readonly canonicalRouteRuntimeProbeRequestV1: (
    value: unknown,
  ) => RouteRuntimeProbeRequestV1;
  readonly canonicalRouteRuntimeProbeTickV1: (
    value: unknown,
  ) => RouteRuntimeProbeTickV1;
  readonly createRouteRuntimeProbeRequestV1: (input: Readonly<{
    routePathReceipt: RoutePathReceiptV1;
    runtimePort: TraversalRuntimePortV1;
    resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
    validationProfileIdentity: Readonly<{
      resourceRef: string;
      version: string;
      contentHash: `sha256:${string}`;
    }>;
  }>) => RouteRuntimeProbeRequestV1;
  readonly hashRouteRuntimeProbeReceiptV1: (
    value: unknown,
  ) => `sha256:${string}`;
  readonly hashRouteRuntimeProbeRequestV1: (
    value: unknown,
  ) => `sha256:${string}`;
  readonly hashRouteRuntimeProbeTickV1: (
    value: unknown,
  ) => `sha256:${string}`;
}

const {
  assertRouteRuntimeProbeReceiptContextV1,
  canonicalRoutePathReceiptV1,
  canonicalRouteRuntimeProbeReceiptV1,
  canonicalRouteRuntimeProbeRequestV1,
  canonicalRouteRuntimeProbeTickV1,
  createRouteRuntimeProbeRequestV1,
  hashRoutePathReceiptV1,
  hashRouteRuntimeProbeReceiptV1,
  hashRouteRuntimeProbeRequestV1,
  hashRouteRuntimeProbeTickV1,
} = traversal as unknown as RuntimeProbeApi;

const hasRuntimeProbeApi = [
  assertRouteRuntimeProbeReceiptContextV1,
  canonicalRouteRuntimeProbeReceiptV1,
  canonicalRouteRuntimeProbeRequestV1,
  canonicalRouteRuntimeProbeTickV1,
  createRouteRuntimeProbeRequestV1,
  hashRouteRuntimeProbeReceiptV1,
  hashRouteRuntimeProbeRequestV1,
  hashRouteRuntimeProbeTickV1,
].every((candidate) => typeof candidate === "function");

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const DRIVER_HASH =
  "sha256:2522b0dd2b4df3165cb5a7a44de3f1a56777afc660194ef4eb9c87a56dda83d9" as const;

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
    pathLookaheadMeters: 2.4,
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

function pathReceipt(): RoutePathReceiptV1 {
  return canonicalRoutePathReceiptV1({
    kind: "route-path-receipt",
    schemaVersion: 1,
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
    traversalSurfaceIdentity: SURFACE,
    graphBuilderProfileRef:
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1",
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash:
      "sha256:9720639dac7de3da1d140c7afd1ea7df4258cef202468e39fa222158caaad231",
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
  overrides: Partial<RouteRuntimeProbeRequestV1> = {},
): RouteRuntimeProbeRequestV1 {
  const path = pathReceipt();
  return {
    kind: "route-runtime-probe-request",
    schemaVersion: 1,
    routePathReceiptHash: hashRoutePathReceiptV1(path),
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
    traversalSurfaceIdentity: path.traversalSurfaceIdentity,
    driverProfileRef:
      "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
    driverResolvedVersion: "1",
    driverProfileHash: DRIVER_HASH,
    validationProfileRef:
      "worldkit://validation-profile/outdoor-world-package.dev@2",
    validationProfileVersion: "2",
    validationProfileHash: HASH_B,
    runtimeImplementationIdentity: RUNTIME_IDENTITY,
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
  overrides: Partial<RouteRuntimeProbeTickV1> = {},
): RouteRuntimeProbeTickV1 {
  return {
    kind: "route-runtime-probe-tick",
    schemaVersion: 1,
    probeTick,
    runtimeEvidence: runtimeEvidence(probeTick),
    walkDirectionWorldXZ: [1, 0],
    routeProgressMetersXZ: probeTick / 2,
    remainingRouteDistanceMetersXZ: 1 - probeTick / 2,
    routeDeviationMetersXZ: probeTick / 10,
    stalledDurationTicks: probeTick - 1,
    consecutiveUnexpectedUnsupportedTicks: 0,
    ...overrides,
  };
}

function metrics(
  overrides: Partial<RouteRuntimeProbeReceiptV1["metrics"]> = {},
): RouteRuntimeProbeReceiptV1["metrics"] {
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

function completeReceipt(): RouteRuntimeProbeReceiptV1 {
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
    schemaVersion: 1,
    status: "complete",
    request: request(),
    initialRuntimeEvidence: runtimeEvidence(0),
    ticks: [tick(1), second],
    metrics: metrics(),
    completionDurationTicks: 2,
  };
}

function oneTickFailure(
  failure: RouteRuntimeProbeFailureV1,
  tickOverrides: Partial<RouteRuntimeProbeTickV1> = {},
): Extract<RouteRuntimeProbeReceiptV1, { readonly status: "failed" }> {
  const finalTick = tick(1, tickOverrides);
  return {
    kind: "route-runtime-probe-receipt",
    schemaVersion: 1,
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

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeRequestV1", () => {
  it("canonicalizes the closed Path, World, Lock, Runtime, Driver, and Validation identities", () => {
    const raw = request();
    const canonical = canonicalRouteRuntimeProbeRequestV1(raw);

    expect(canonical).not.toBe(raw);
    expect(canonical).toEqual(raw);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.traversalSurfaceIdentity)).toBe(true);
    expect(Object.isFrozen(canonical.runtimeImplementationIdentity)).toBe(true);
    expect(hashRouteRuntimeProbeRequestV1(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("rejects Registry Driver mismatches", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV1(request({
      driverProfileHash: HASH_A,
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
  });

  it("validates Validation Profile identity shape without importing Validation policy", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV1(request({
      validationProfileRef: "",
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV1(request({
      validationProfileVersion: "",
    }))).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV1(request({
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

    expect(() => createRouteRuntimeProbeRequestV1({
      routePathReceipt: pathReceipt(),
      runtimePort: port,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => createRouteRuntimeProbeRequestV1({
      routePathReceipt: pathReceipt(),
      runtimePort: {
        ...port,
        authoringSpecHash: HASH_A,
        resolvedTraversalLockHash: HASH_A,
      },
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(resetCount).toBe(0);
    expect(fixedTickCount).toBe(0);

    const classBasedPort = Object.assign(
      new (class RuntimePortFixture {})(),
      port,
      { authoringSpecHash: HASH_A },
    ) as TraversalRuntimePortV1;
    const canonical = createRouteRuntimeProbeRequestV1({
      routePathReceipt: pathReceipt(),
      runtimePort: classBasedPort,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    });
    expect(canonical).toEqual(request());

    const throwingPort = Object.create(classBasedPort) as TraversalRuntimePortV1;
    Object.defineProperty(throwingPort, "runtimeImplementationIdentity", {
      get: () => {
        throw new Error("Havok native provider detail");
      },
    });
    expect(() => createRouteRuntimeProbeRequestV1({
      routePathReceipt: pathReceipt(),
      runtimePort: throwingPort,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toThrow(
      "ROUTE_RUNTIME_PROBE_REQUEST_INVALID: runtimePort: provider-neutral identity unavailable",
    );
  });

  it("rejects provider dialect and Validation thresholds", () => {
    expect(() => canonicalRouteRuntimeProbeRequestV1({
      ...request(),
      babylonBodyId: 42,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
    expect(() => canonicalRouteRuntimeProbeRequestV1({
      ...request(),
      maximumProbeTicks: 600,
    })).toThrow("ROUTE_RUNTIME_PROBE_REQUEST_INVALID");
  });
});

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeTickV1", () => {
  it("preserves canonical Runtime evidence, normalizes negative zero, freezes, and hashes", () => {
    const raw = tick(1, {
      walkDirectionWorldXZ: [-0, 1],
      routeDeviationMetersXZ: -0,
      stalledDurationTicks: 0,
    });
    const canonical = canonicalRouteRuntimeProbeTickV1(raw);

    expect(canonical.walkDirectionWorldXZ).toEqual([0, 1]);
    expect(canonical.routeDeviationMetersXZ).toBe(0);
    expect(canonical.runtimeEvidence).toEqual(raw.runtimeEvidence);
    expect(Object.isFrozen(canonical.runtimeEvidence.characterSupport)).toBe(true);
    expect(hashRouteRuntimeProbeTickV1(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("rejects non-positive/non-integer Probe ticks, non-unit intent, invalid metrics, and unknown fields", () => {
    for (const probeTick of [0, -1, 1.5]) {
      expect(() => canonicalRouteRuntimeProbeTickV1(tick(probeTick)))
        .toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    }
    expect(() => canonicalRouteRuntimeProbeTickV1(tick(1, {
      walkDirectionWorldXZ: [0.5, 0.5],
    }))).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    expect(() => canonicalRouteRuntimeProbeTickV1(tick(1, {
      routeProgressMetersXZ: Number.NaN,
    }))).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
    expect(() => canonicalRouteRuntimeProbeTickV1({
      ...tick(1),
      havokContactHandle: 1,
    })).toThrow("ROUTE_RUNTIME_PROBE_TICK_INVALID");
  });
});

describe.skipIf(!hasRuntimeProbeApi)("RouteRuntimeProbeReceiptV1", () => {
  it("admits a canonical complete receipt with deterministic metrics and immutable stable bytes", () => {
    const raw = completeReceipt();
    const canonical = canonicalRouteRuntimeProbeReceiptV1(raw);

    expect(canonical).not.toBe(raw);
    expect(canonical).toEqual(raw);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.ticks)).toBe(true);
    expect(Object.isFrozen(canonical.ticks[0]?.walkDirectionWorldXZ)).toBe(true);
    expect(hashRouteRuntimeProbeReceiptV1(raw)).toBe(sha256CanonicalJson(canonical));
  });

  it("keeps a 3-4-5 Path's 3D distance while completing against zero XZ remaining distance", () => {
    const slopedPath = canonicalRoutePathReceiptV1({
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
    const raw: RouteRuntimeProbeReceiptV1 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 1,
      status: "complete",
      request: canonicalRouteRuntimeProbeRequestV1({
        ...request(),
        routePathReceiptHash: hashRoutePathReceiptV1(slopedPath),
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

    const canonical = assertRouteRuntimeProbeReceiptContextV1({
      receipt: raw,
      routePathReceipt: slopedPath,
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    });
    expect(slopedPath.routePathDistanceMeters).toBe(5);
    expect(slopedPath.routePathDistanceMetersXZ).toBe(3);
    expect(canonical.ticks.at(-1)?.remainingRouteDistanceMetersXZ).toBe(0);
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...raw,
      ticks: [{ ...finalRow, remainingRouteDistanceMetersXZ: 0.25 }],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("admits every closed failure branch with evidence-derived observed values", () => {
    const unsupportedInitial = unsupportedRuntimeEvidence(0);
    const startInvalid: RouteRuntimeProbeReceiptV1 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 1,
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
    const branches: readonly RouteRuntimeProbeReceiptV1[] = [
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
      expect(canonicalRouteRuntimeProbeReceiptV1(branch)).toEqual(branch);
    }
    expect(startInvalid.failure.failurePositionMetersXYZ).not.toEqual(
      startInvalid.initialRuntimeEvidence.characterSupport.sampledFootPositionMetersXYZ,
    );
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
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

  it("reduces initial surface mismatch separately and contextually proves Path/Profile bindings", () => {
    const initialRuntimeEvidence = runtimeEvidence(0, {
      characterSupport: {
        ...runtimeEvidence(0).characterSupport,
        surfaceResolution: { mode: "ambiguous" },
      },
    });
    const failed: RouteRuntimeProbeReceiptV1 = {
      kind: "route-runtime-probe-receipt",
      schemaVersion: 1,
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
    const canonical = canonicalRouteRuntimeProbeReceiptV1(failed);
    expect(assertRouteRuntimeProbeReceiptContextV1({
      receipt: canonical,
      routePathReceipt: pathReceipt(),
      resolvedDriverProfile: RESOLVED_DRIVER_PROFILE,
      validationProfileIdentity: VALIDATION_PROFILE_IDENTITY,
    })).toEqual(canonical);
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
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
    expect(() => assertRouteRuntimeProbeReceiptContextV1({
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
      expect(() => canonicalRouteRuntimeProbeReceiptV1(invalid))
        .toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    }
  });

  it("rejects metric reductions, completion duration, and failure evidence inconsistencies", () => {
    const complete = completeReceipt();
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...complete,
      metrics: { ...complete.metrics, slidingDurationTicks: 0 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...complete,
      completionDurationTicks: 1,
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");

    const failed = oneTickFailure({
      kind: "runtime-stalled",
      failureProbeTick: 1,
      failurePositionMetersXYZ: runtimeEvidence(1).subjectPositionMetersXYZ,
      stalledDurationTicks: 4,
    }, { stalledDurationTicks: 4 });
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...failed,
      failure: { ...failed.failure, failureProbeTick: 0 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...failed,
      failure: { ...failed.failure, failurePositionMetersXYZ: [99, 0, 0] },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...failed,
      failure: { ...failed.failure, stalledDurationTicks: 3 },
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
  });

  it("rejects unknown provider/error/threshold fields and malformed Runtime values without a receipt", () => {
    const complete = completeReceipt();
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...complete,
      destinationToleranceMeters: 0.5,
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...complete,
      ticks: [{ ...complete.ticks[0], providerBodyId: 7 }, complete.ticks[1]],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
      ...complete,
      ticks: [{
        ...complete.ticks[0],
        runtimeEvidence: {
          ...complete.ticks[0]?.runtimeEvidence,
          subjectPositionMetersXYZ: [Number.NaN, 0, 0],
        },
      }, complete.ticks[1]],
    })).toThrow("ROUTE_RUNTIME_PROBE_RECEIPT_INVALID");
    expect(() => canonicalRouteRuntimeProbeReceiptV1({
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
