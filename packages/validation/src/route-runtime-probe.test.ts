import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalRoutePathReceiptV1,
  hashRouteRuntimeProbeReceiptV1,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  type CharacterSupportStateV1,
  type CharacterSupportSurfaceResolutionV1,
  type RoutePathReceiptV1,
  type RouteRuntimeProbeReceiptV1,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
} from "@whitebox-world/traversal";

import * as validation from "./index.js";
import type { ValidationProfileV2 } from "./types-v2.js";

type Vec3 = readonly [number, number, number];

type RunRouteRuntimeProbeV1 = (input: Readonly<{
  routePathReceipt: RoutePathReceiptV1;
  traversalDriverProfile: ReturnType<typeof resolveTraversalDriverProfileV1>;
  runtimePort: TraversalRuntimePortV1;
  validationProfile: ValidationProfileV2;
}>) => Promise<RouteRuntimeProbeReceiptV1>;

const runRouteRuntimeProbeV1 = (
  validation as unknown as { runRouteRuntimeProbeV1?: RunRouteRuntimeProbeV1 }
).runRouteRuntimeProbeV1;
const hasRunner = typeof runRouteRuntimeProbeV1 === "function";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;

const SURFACE = {
  traversalSurfaceId: "surface-main",
  surfaceEntityId: "terrain-main",
  colliderSubshapeId: "terrain-heightfield",
  resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
  resolvedVersion: "1",
  resourceHash: HASH_A,
} as const;

const RUNTIME_IDENTITY = {
  runtimeBackendRef: "worldkit://runtime-backend/test-runtime@1",
  runtimeBackendResolvedVersion: "1",
  runtimeBackendHash: HASH_B,
  runtimeAdapterRef: "worldkit://runtime-adapter/test-character@1",
  runtimeAdapterResolvedVersion: "1",
  runtimeAdapterHash: HASH_C,
} as const;

const DRIVER = resolveTraversalDriverProfileV1(
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
);
const VALIDATION_PROFILE = validation.OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2;
const THRESHOLDS = VALIDATION_PROFILE.routeRuntimeGateThresholds;

function distance3d(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

function ceilToMillimeter(value: number): number {
  return Math.ceil(value / 0.001 - Number.EPSILON) * 0.001;
}

function pathReceipt(
  points: readonly Vec3[] = [[0, 0, 0], [10, 0, 0]],
  overrides: Partial<RoutePathReceiptV1> = {},
): RoutePathReceiptV1 {
  const builder = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const routePathDistanceMeters = points.slice(1).reduce(
    (sum, point, index) => sum + distance3d(points[index]!, point),
    0,
  );
  const routePathDistanceMetersXZ = points.slice(1).reduce(
    (sum, point, index) =>
      sum + ceilToMillimeter(distanceXZ(points[index]!, point)),
    0,
  );
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
    resolvedTraversalLockHash: HASH_D,
    traversalSurfaceIdentity: SURFACE,
    graphBuilderProfileRef: builder.resourceRef,
    graphBuilderResolvedVersion: builder.resolvedVersion,
    graphBuilderProfileHash: builder.contentHash,
    orderedTraversalNodeIds: points.map((_, index) => `node-${index}`),
    orderedTraversalEdgeIds: points.slice(1).map((_, index) => `edge-${index}`),
    orderedPathPositionsMetersXYZ: points,
    routePathDistanceMeters,
    routePathDistanceMetersXZ,
    routePathCost: routePathDistanceMeters,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 1,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
    ...overrides,
  });
}

interface RuntimeFrame {
  readonly positionMetersXYZ: Vec3;
  readonly supportState?: CharacterSupportStateV1;
  readonly surfaceResolution?: CharacterSupportSurfaceResolutionV1;
  readonly tick?: number;
  readonly fixedTimeStepSeconds?: number;
  readonly traversingEntityId?: string;
  readonly authoringSpecHash?: `sha256:${string}`;
  readonly executionPlanHash?: `sha256:${string}`;
  readonly shouldThrow?: boolean;
}

type RuntimeFrameSource = RuntimeFrame | ((tickCall: number) => RuntimeFrame);

class ScriptedRuntimePort implements TraversalRuntimePortV1 {
  public readonly kind = "traversal-runtime-port" as const;
  public readonly schemaVersion = 1 as const;
  public readonly traversingEntityId: string;
  public readonly authoringSpecHash: `sha256:${string}`;
  public readonly layoutSolveReportHash: `sha256:${string}`;
  public readonly resourceLockHash: `sha256:${string}`;
  public readonly executionPlanHash: `sha256:${string}`;
  public readonly resolvedTraversalLockHash: `sha256:${string}`;
  public readonly runtimeImplementationIdentity = RUNTIME_IDENTITY;
  public resetCallCount = 0;
  public fixedTickCallCount = 0;
  public readonly fixedTickRequests: Array<Readonly<Record<string, unknown>>> = [];

  private latestEvidence: TraversalRuntimeTickEvidenceV1;

  public constructor(
    private readonly path: RoutePathReceiptV1,
    private readonly initialFrame: RuntimeFrame,
    private readonly tickFrames: readonly RuntimeFrameSource[],
    identityOverrides: Partial<Pick<
      TraversalRuntimePortV1,
      | "traversingEntityId"
      | "authoringSpecHash"
      | "layoutSolveReportHash"
      | "resourceLockHash"
      | "executionPlanHash"
      | "resolvedTraversalLockHash"
    >> = {},
  ) {
    this.traversingEntityId = identityOverrides.traversingEntityId ?? path.traversingEntityId;
    this.authoringSpecHash = identityOverrides.authoringSpecHash ?? path.authoringSpecHash;
    this.layoutSolveReportHash = identityOverrides.layoutSolveReportHash ?? path.layoutSolveReportHash;
    this.resourceLockHash = identityOverrides.resourceLockHash ?? path.resourceLockHash;
    this.executionPlanHash = identityOverrides.executionPlanHash ?? HASH_D;
    this.resolvedTraversalLockHash =
      identityOverrides.resolvedTraversalLockHash ?? path.resolvedTraversalLockHash;
    this.latestEvidence = this.evidence(initialFrame, 0);
  }

  public readLatestTickEvidence(): TraversalRuntimeTickEvidenceV1 {
    return this.latestEvidence;
  }

  public resetToStartAnchor(
    request: Readonly<{ startAnchorEntityId: string }>,
  ): TraversalRuntimeTickEvidenceV1 {
    this.resetCallCount += 1;
    if (request.startAnchorEntityId !== this.path.startAnchorEntityId) {
      throw new Error("provider reset anchor leaked");
    }
    if (this.initialFrame.shouldThrow === true) {
      throw new Error("provider reset failure should be sanitized");
    }
    this.latestEvidence = this.evidence(this.initialFrame, 0);
    return this.latestEvidence;
  }

  public async runFixedTick(
    request: Readonly<{ walkDirectionWorldXZ: readonly [number, number] }>,
  ): Promise<TraversalRuntimeTickEvidenceV1> {
    this.fixedTickCallCount += 1;
    this.fixedTickRequests.push(request as unknown as Readonly<Record<string, unknown>>);
    const source = this.tickFrames[this.fixedTickCallCount - 1] ??
      this.tickFrames.at(-1);
    if (source === undefined) {
      throw new Error("test frame missing");
    }
    const frame = typeof source === "function"
      ? source(this.fixedTickCallCount)
      : source;
    if (frame.shouldThrow === true) {
      throw new Error("provider tick failure should be sanitized");
    }
    this.latestEvidence = this.evidence(frame, this.fixedTickCallCount);
    return this.latestEvidence;
  }

  private evidence(frame: RuntimeFrame, defaultTick: number): TraversalRuntimeTickEvidenceV1 {
    const supportState = frame.supportState ?? "supported";
    const surfaceResolution = frame.surfaceResolution ?? (
      supportState === "unsupported"
        ? { mode: "unsupported" as const }
        : { mode: "resolved" as const, ...SURFACE }
    );
    return {
      kind: "traversal-runtime-tick-evidence",
      schemaVersion: 1,
      tick: frame.tick ?? defaultTick,
      traversingEntityId: frame.traversingEntityId ?? this.traversingEntityId,
      authoringSpecHash: frame.authoringSpecHash ?? this.authoringSpecHash,
      layoutSolveReportHash: this.layoutSolveReportHash,
      resourceLockHash: this.resourceLockHash,
      executionPlanHash: frame.executionPlanHash ?? this.executionPlanHash,
      resolvedTraversalLockHash: this.resolvedTraversalLockHash,
      runtimeImplementationIdentity: this.runtimeImplementationIdentity,
      fixedTimeStepSeconds: frame.fixedTimeStepSeconds ?? 1 / 60,
      subjectPositionMetersXYZ: frame.positionMetersXYZ,
      velocityMetersPerSecondXYZ: [0, 0, 0],
      movementMedium: supportState === "unsupported" ? "air" : "ground",
      locomotionMode: supportState === "unsupported" ? "airborne" : "walk",
      characterSupport: {
        kind: "character-support-evidence",
        schemaVersion: 1,
        supportState,
        supportNormalWorldXYZ: [0, 1, 0],
        sampledFootPositionMetersXYZ: frame.positionMetersXYZ,
        isSupportSurfaceDynamic: false,
        surfaceResolution,
      },
    };
  }
}

async function run(
  path: RoutePathReceiptV1,
  port: TraversalRuntimePortV1,
): Promise<RouteRuntimeProbeReceiptV1> {
  if (runRouteRuntimeProbeV1 === undefined) throw new Error("runner missing");
  return runRouteRuntimeProbeV1({
    routePathReceipt: path,
    traversalDriverProfile: DRIVER,
    runtimePort: port,
    validationProfile: VALIDATION_PROFILE,
  });
}

describe("route runtime probe public runner", () => {
  it("exports the engine-neutral fixed-tick runner", () => {
    expect(hasRunner).toBe(true);
  });
});

describe.runIf(hasRunner)("runRouteRuntimeProbeV1", () => {
  it("rejects identity and ambiguous R1 path topology before reset", async () => {
    const valid = pathReceipt();
    const mismatchedPort = new ScriptedRuntimePort(
      valid,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 0] }],
      { resourceLockHash: HASH_A },
    );
    await expect(run(valid, mismatchedPort)).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV1",
    });
    expect(mismatchedPort.resetCallCount).toBe(0);
    expect(mismatchedPort.fixedTickCallCount).toBe(0);

    const invalidPaths = [
      pathReceipt([[0, 0, 0], [0, 1, 0], [2, 0, 0]]),
      pathReceipt([[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 0]]),
      pathReceipt([[0, 0, 0], [3, 0, 0], [1, 0, 0], [4, 0, 0]]),
      pathReceipt([[0, 0, 0], [2, 0, 2], [0, 0, 2], [2, 0, 0]]),
    ];
    for (const invalidPath of invalidPaths) {
      const port = new ScriptedRuntimePort(
        invalidPath,
        { positionMetersXYZ: invalidPath.orderedPathPositionsMetersXYZ[0]! },
        [{ positionMetersXYZ: invalidPath.orderedPathPositionsMetersXYZ.at(-1)! }],
      );
      await expect(run(invalidPath, port)).rejects.toMatchObject({
        code: "ROUTE_RUNTIME_PROBE_PATH_INVALID",
      });
      expect(port.resetCallCount).toBe(0);
    }
  });

  it("completes at reset without a fixed tick when already inside destination tolerance", async () => {
    const path = pathReceipt([[0, 0, 0], [0.4, 0, 0]]);
    const port = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0.4, 0, 0] }],
    );
    const receipt = await run(path, port);

    expect(receipt).toMatchObject({
      status: "complete",
      completionDurationTicks: 0,
      metrics: { processedTickCount: 0 },
      ticks: [],
    });
    expect(port.resetCallCount).toBe(1);
    expect(port.fixedTickCallCount).toBe(0);
  });

  it("follows straight and corner paths with world-XZ walk-only pure pursuit", async () => {
    const straight = pathReceipt([[0, 0, 0], [10, 0, 0]]);
    const straightPort = new ScriptedRuntimePort(
      straight,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [10, 0, 0] }],
    );
    await run(straight, straightPort);
    expect(straightPort.fixedTickRequests[0]).toEqual({
      walkDirectionWorldXZ: [1, 0],
    });
    expect(Object.keys(straightPort.fixedTickRequests[0]!)).toEqual([
      "walkDirectionWorldXZ",
    ]);

    const corner = pathReceipt([[0, 0, 0], [2, 0, 0], [2, 0, 3]]);
    const cornerPort = new ScriptedRuntimePort(
      corner,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [2, 0, 3] }],
    );
    await run(corner, cornerPort);
    const cornerIntent = cornerPort.fixedTickRequests[0]!
      .walkDirectionWorldXZ as readonly [number, number];
    expect(cornerIntent[0]).toBeGreaterThan(0.9);
    expect(cornerIntent[1]).toBeGreaterThan(0.1);
    expect(Math.hypot(...cornerIntent)).toBeCloseTo(1, 12);
  });

  it("rounds positive and negative component ties symmetrically then renormalizes", async () => {
    const z = Math.sqrt(1 - 0.0005 ** 2);
    const intents: Array<readonly [number, number]> = [];
    for (const x of [0.0005, -0.0005]) {
      const path = pathReceipt([[0, 0, 0], [x, 0, z]]);
      const port = new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: [0, 0, 0] },
        [{ positionMetersXYZ: [x, 0, z] }],
      );
      await run(path, port);
      intents.push(port.fixedTickRequests[0]!.walkDirectionWorldXZ as readonly [number, number]);
    }
    expect(intents[0]![0]).toBeGreaterThan(0.0009);
    expect(intents[1]![0]).toBeLessThan(-0.0009);
    expect(intents[0]![0]).toBeCloseTo(-intents[1]![0], 12);
    expect(Object.is(intents[0]![1], -0)).toBe(false);
  });

  it("uses planar progress for a 3-4-5 slope and accepts a wide-corridor start", async () => {
    const slope = pathReceipt([[0, 0, 0], [3, 4, 0]]);
    const slopePort = new ScriptedRuntimePort(
      slope,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [3, 4, 0] }],
    );
    const slopeReceipt = await run(slope, slopePort);
    expect(slope.routePathDistanceMeters).toBe(5);
    expect(slope.routePathDistanceMetersXZ).toBe(3);
    expect(slopeReceipt.ticks.at(-1)).toMatchObject({
      routeProgressMetersXZ: 3,
      remainingRouteDistanceMetersXZ: 0,
    });

    const wide = pathReceipt([[0, 0, 0], [10, 0, 0]]);
    const widePort = new ScriptedRuntimePort(
      wide,
      { positionMetersXYZ: [0, 0, 0.52] },
      [
        { positionMetersXYZ: [5, 0, 0.52] },
        { positionMetersXYZ: [10, 0, 0] },
      ],
    );
    const wideReceipt = await run(wide, widePort);
    expect(wideReceipt.status).toBe("complete");
    expect(wideReceipt.ticks[0]!.routeDeviationMetersXZ).toBeCloseTo(0.52, 12);
  });

  it("uses the Path receipt's per-segment quantized XZ arc for irrational diagonals", async () => {
    const diagonal = pathReceipt([[0, 0, 0], [1, 0, 1]]);
    expect(diagonal.routePathDistanceMetersXZ).toBe(1.415);
    const port = new ScriptedRuntimePort(
      diagonal,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 1] }],
    );

    const receipt = await run(diagonal, port);

    expect(receipt).toMatchObject({
      status: "complete",
      ticks: [{
        routeProgressMetersXZ: 1.415,
        remainingRouteDistanceMetersXZ: 0,
      }],
    });
  });

  it("keeps stall and support-loss boundaries inclusive and counts unsupported episodes", async () => {
    const path = pathReceipt([[0, 0, 0], [10, 0, 0]]);
    const stalledPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0, 0, 0] }],
    );
    const stalled = await run(path, stalledPort);
    expect(stalled).toMatchObject({
      status: "failed",
      failure: {
        kind: "runtime-stalled",
        stalledDurationTicks: THRESHOLDS.stalledWindowTicks + 1,
      },
    });
    expect(stalledPort.fixedTickCallCount).toBe(THRESHOLDS.stalledWindowTicks + 1);

    const unsupportedPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0, 0, 0], supportState: "unsupported" }],
    );
    const unsupported = await run(path, unsupportedPort);
    expect(unsupported).toMatchObject({
      status: "failed",
      failure: {
        kind: "runtime-support-lost",
        consecutiveUnexpectedUnsupportedTicks:
          THRESHOLDS.maximumConsecutiveUnsupportedTicks + 1,
      },
      metrics: { unexpectedSupportLossCount: 1 },
    });
    expect(unsupportedPort.fixedTickCallCount).toBe(
      THRESHOLDS.maximumConsecutiveUnsupportedTicks + 1,
    );
  });

  it("treats sliding as support and fails deviation only when it exceeds the threshold", async () => {
    const path = pathReceipt([[0, 0, 0], [10, 0, 0]]);
    const equalityPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [
        {
          positionMetersXYZ: [5, 0, THRESHOLDS.maximumRouteDeviationMetersXZ],
          supportState: "sliding",
        },
        { positionMetersXYZ: [10, 0, 0], supportState: "sliding" },
      ],
    );
    const equality = await run(path, equalityPort);
    expect(equality).toMatchObject({
      status: "complete",
      metrics: { slidingDurationTicks: 2 },
    });

    const exceededPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{
        positionMetersXYZ: [1, 0, THRESHOLDS.maximumRouteDeviationMetersXZ + 0.001],
      }],
    );
    const exceeded = await run(path, exceededPort);
    expect(exceeded).toMatchObject({
      status: "failed",
      failure: {
        kind: "runtime-deviated",
        routeDeviationMetersXZ: THRESHOLDS.maximumRouteDeviationMetersXZ + 0.001,
      },
    });
  });

  it("returns closed reset and surface failures with surface mismatch precedence", async () => {
    const path = pathReceipt();
    const invalidStartPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0], supportState: "unsupported" },
      [{ positionMetersXYZ: [1, 0, 0] }],
    );
    const invalidStart = await run(path, invalidStartPort);
    expect(invalidStart).toMatchObject({
      status: "failed",
      ticks: [],
      failure: { kind: "start-support-invalid", failureProbeTick: 0 },
    });

    for (const surfaceResolution of [
      { mode: "unmatched" as const },
      { mode: "ambiguous" as const },
      {
        mode: "resolved" as const,
        ...SURFACE,
        traversalSurfaceId: "wrong-surface",
      },
    ]) {
      const port = new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: [0, 0, 0] },
        [{
          positionMetersXYZ: [10, 0, THRESHOLDS.maximumRouteDeviationMetersXZ + 1],
          surfaceResolution,
        }],
      );
      const receipt = await run(path, port);
      expect(receipt).toMatchObject({
        status: "failed",
        failure: {
          kind: "support-surface-mismatch",
          failureProbeTick: 1,
          surfaceResolutionMode: surfaceResolution.mode,
        },
      });
    }
  });

  it("does not complete while unsupported at the destination and lets support loss beat arrival", async () => {
    const path = pathReceipt([[0, 0, 0], [1, 0, 0]]);
    const recoveredPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [
        { positionMetersXYZ: [1, 0, 0], supportState: "unsupported" },
        { positionMetersXYZ: [1, 0, 0] },
      ],
    );
    const recovered = await run(path, recoveredPort);
    expect(recovered).toMatchObject({
      status: "complete",
      completionDurationTicks: 2,
      metrics: { unexpectedSupportLossCount: 1 },
    });

    const neverSupportedPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 0], supportState: "unsupported" }],
    );
    const neverSupported = await run(path, neverSupportedPort);
    expect(neverSupported).toMatchObject({
      status: "failed",
      failure: { kind: "runtime-support-lost" },
    });
  });

  it("allows final-tick arrival and otherwise stops exactly at the maximum Tick", async () => {
    const path = pathReceipt([[0, 0, 0], [120, 0, 0]]);
    const frame = (tickCall: number, arrives: boolean): RuntimeFrame => ({
      positionMetersXYZ: tickCall === THRESHOLDS.maximumProbeTicks
        ? [arrives ? 120 : 119.4, 0, 0]
        : [Math.min(tickCall * 0.1, 119.4), 0, 0],
    });
    const arrivalPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [(tickCall) => frame(tickCall, true)],
    );
    const arrival = await run(path, arrivalPort);
    expect(arrival).toMatchObject({
      status: "complete",
      completionDurationTicks: THRESHOLDS.maximumProbeTicks,
    });

    const timeoutPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [(tickCall) => frame(tickCall, false)],
    );
    const timeout = await run(path, timeoutPort);
    expect(timeout).toMatchObject({
      status: "failed",
      failure: {
        kind: "maximum-probe-ticks-reached",
        processedTickCount: THRESHOLDS.maximumProbeTicks,
      },
    });
    expect(timeoutPort.fixedTickCallCount).toBe(THRESHOLDS.maximumProbeTicks);
  }, 15_000);

  it("throws a sanitized closed error for invalid evidence or provider failure", async () => {
    const path = pathReceipt();
    const invalidFrames: readonly RuntimeFrame[] = [
      { positionMetersXYZ: [Number.NaN, 0, 0] },
      { positionMetersXYZ: [1, 0, 0], tick: 2 },
      { positionMetersXYZ: [1, 0, 0], fixedTimeStepSeconds: 1 / 30 },
      { positionMetersXYZ: [1, 0, 0], executionPlanHash: HASH_A },
    ];
    for (const frame of invalidFrames) {
      const port = new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: [0, 0, 0] },
        [frame],
      );
      await expect(run(path, port)).rejects.toMatchObject({
        name: "RouteRuntimeProbeErrorV1",
        code: "ROUTE_RUNTIME_PROBE_RUNTIME_INVALID",
      });
    }

    const throwingPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 0], shouldThrow: true }],
    );
    await expect(run(path, throwingPort)).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV1",
      code: "ROUTE_RUNTIME_PROBE_RUNTIME_UNAVAILABLE",
      message: "ROUTE_RUNTIME_PROBE_RUNTIME_UNAVAILABLE",
    });

    const malformedValidationProfile = Object.defineProperty(
      {},
      "resourceRef",
      {
        enumerable: true,
        get(): never {
          throw new Error("malicious validation getter must not leak");
        },
      },
    ) as ValidationProfileV2;
    if (runRouteRuntimeProbeV1 === undefined) throw new Error("runner missing");
    await expect(runRouteRuntimeProbeV1({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: [0, 0, 0] },
        [{ positionMetersXYZ: [10, 0, 0] }],
      ),
      validationProfile: malformedValidationProfile,
    })).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV1",
      code: "ROUTE_RUNTIME_PROBE_INPUT_INVALID",
      message: "ROUTE_RUNTIME_PROBE_INPUT_INVALID",
    });
  });

  it("rejects stateful Validation Profile accessors before Runtime reset", async () => {
    const path = pathReceipt();
    const port = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0, 0, 0] }],
    );
    const statefulProfile = structuredClone(VALIDATION_PROFILE) as ValidationProfileV2;
    const validThresholds = structuredClone(
      VALIDATION_PROFILE.routeRuntimeGateThresholds,
    );
    let readCount = 0;
    Object.defineProperty(statefulProfile, "routeRuntimeGateThresholds", {
      configurable: true,
      enumerable: true,
      get() {
        readCount += 1;
        return readCount <= 10
          ? validThresholds
          : { ...validThresholds, stalledWindowTicks: 0 };
      },
    });
    if (runRouteRuntimeProbeV1 === undefined) throw new Error("runner missing");

    await expect(runRouteRuntimeProbeV1({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: port,
      validationProfile: statefulProfile,
    })).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV1",
      code: "ROUTE_RUNTIME_PROBE_INPUT_INVALID",
      message: "ROUTE_RUNTIME_PROBE_INPUT_INVALID",
    });
    expect(port.resetCallCount).toBe(0);
    expect(port.fixedTickCallCount).toBe(0);
  });

  it("closes overflow from finite Runtime coordinates without publishing a receipt", async () => {
    const path = pathReceipt();
    const port = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{
        positionMetersXYZ: [Number.MAX_VALUE, 0, Number.MAX_VALUE],
      }],
    );

    await expect(run(path, port)).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV1",
      code: "ROUTE_RUNTIME_PROBE_RUNTIME_INVALID",
      message: "ROUTE_RUNTIME_PROBE_RUNTIME_INVALID",
    });
    expect(port.resetCallCount).toBe(1);
    expect(port.fixedTickCallCount).toBe(1);
  });

  it("accepts a non-crossing hairpin and handles a zero direction away from destination", async () => {
    const hairpin = pathReceipt([
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 0.01],
      [0, 0, 0.01],
    ]);
    const hairpinPort = new ScriptedRuntimePort(
      hairpin,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0, 0, 0.01] }],
    );
    expect((await run(hairpin, hairpinPort)).status).toBe("complete");

    const path = pathReceipt([[0, 0, 0], [10, 0, 0]]);
    const port = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [4.8, 0, 0] },
      [{ positionMetersXYZ: [10, 0, 0] }],
    );
    await run(path, port);
    expect(port.fixedTickRequests[0]).toEqual({ walkDirectionWorldXZ: [0, 0] });
  });

  it("keeps consecutive and concurrent runs isolated with immutable stable receipts", async () => {
    const path = pathReceipt([[0, 0, 0], [2, 0, 0]]);
    const makePort = () => new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [2, 0, 0] }],
    );
    const first = await run(path, makePort());
    const second = await run(path, makePort());
    const [concurrentA, concurrentB] = await Promise.all([
      run(path, makePort()),
      run(path, makePort()),
    ]);

    const hashes = [first, second, concurrentA, concurrentB].map(
      hashRouteRuntimeProbeReceiptV1,
    );
    expect(new Set(hashes)).toHaveLength(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.ticks)).toBe(true);
    expect(Object.isFrozen(first.ticks[0]!.runtimeEvidence)).toBe(true);
  });

  it("snapshots mutable Profile thresholds before the first asynchronous fixed Tick", async () => {
    const path = pathReceipt();
    const basePort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [0, 0, 0] }],
    );
    let releaseFirstTick!: () => void;
    let signalFirstTickEntered!: () => void;
    const firstTickEntered = new Promise<void>((resolve) => {
      signalFirstTickEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseFirstTick = resolve;
    });
    const delayedPort: TraversalRuntimePortV1 = {
      kind: basePort.kind,
      schemaVersion: basePort.schemaVersion,
      traversingEntityId: basePort.traversingEntityId,
      authoringSpecHash: basePort.authoringSpecHash,
      layoutSolveReportHash: basePort.layoutSolveReportHash,
      resourceLockHash: basePort.resourceLockHash,
      executionPlanHash: basePort.executionPlanHash,
      resolvedTraversalLockHash: basePort.resolvedTraversalLockHash,
      runtimeImplementationIdentity: basePort.runtimeImplementationIdentity,
      readLatestTickEvidence: () => basePort.readLatestTickEvidence(),
      resetToStartAnchor: (request) => basePort.resetToStartAnchor(request),
      runFixedTick: async (request) => {
        if (basePort.fixedTickCallCount === 0) {
          signalFirstTickEntered();
          await release;
        }
        return basePort.runFixedTick(request);
      },
    };
    const mutableProfile = structuredClone(VALIDATION_PROFILE) as ValidationProfileV2;
    if (runRouteRuntimeProbeV1 === undefined) throw new Error("runner missing");
    const receiptPromise = runRouteRuntimeProbeV1({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: delayedPort,
      validationProfile: mutableProfile,
    });

    await firstTickEntered;
    (mutableProfile.routeRuntimeGateThresholds as {
      stalledWindowTicks: number;
    }).stalledWindowTicks = 0;
    releaseFirstTick();
    const receipt = await receiptPromise;

    expect(receipt).toMatchObject({
      status: "failed",
      failure: {
        kind: "runtime-stalled",
        stalledDurationTicks: THRESHOLDS.stalledWindowTicks + 1,
      },
    });
    expect(basePort.fixedTickCallCount).toBe(THRESHOLDS.stalledWindowTicks + 1);
  });
});
