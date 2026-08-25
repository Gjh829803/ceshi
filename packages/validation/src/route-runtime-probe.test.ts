import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalRoutePathReceiptV2,
  hashRouteRuntimeProbeReceiptV2,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  type CharacterSupportStateV1,
  type CharacterSupportSurfaceResolutionV1,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
  type TraversalSurfaceIdentityV1,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
} from "@whitebox-world/traversal";

import * as validation from "./index.js";
import type { ValidationProfileV2 } from "./types-v2.js";

type Vec3 = readonly [number, number, number];

type RunRouteRuntimeProbeV2 = (input: Readonly<{
  routePathReceipt: RoutePathReceiptV2;
  traversalDriverProfile: ReturnType<typeof resolveTraversalDriverProfileV1>;
  runtimePort: TraversalRuntimePortV1;
  validationProfile: ValidationProfileV2;
  resolvedControlFeelProfile: Readonly<{
    readonly walkSpeedMetersPerSecond: number;
  }>;
  positionQuantizationMeters: number;
}>) => Promise<RouteRuntimeProbeReceiptV2>;

const runRouteRuntimeProbeV2 = (
  validation as unknown as { runRouteRuntimeProbeV2?: RunRouteRuntimeProbeV2 }
).runRouteRuntimeProbeV2;
const hasRunner = typeof runRouteRuntimeProbeV2 === "function";

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
const BUILDER = resolveTraversalGraphBuilderProfileV2(
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
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

function framesAlongPolyline(
  points: readonly Vec3[],
  stepMeters = 0.05,
  supportState?: CharacterSupportStateV1,
): RuntimeFrame[] {
  const frames: RuntimeFrame[] = [];
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex]!;
    const end = points[segmentIndex + 1]!;
    const steps = Math.ceil(distance3d(start, end) / stepMeters);
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      frames.push({
        positionMetersXYZ: [
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
          start[2] + (end[2] - start[2]) * ratio,
        ],
        ...(supportState === undefined ? {} : { supportState }),
      });
    }
  }
  return frames;
}

function pathReceipt(
  points: readonly Vec3[] = [[0, 0, 0], [10, 0, 0]],
  overrides: Partial<RoutePathReceiptV2> = {},
): RoutePathReceiptV2 {
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
    resolvedTraversalLockHash: HASH_D,
    orderedTraversalSurfaceIdentities: points.map(() => SURFACE),
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
  readonly sampledFootPositionMetersXYZ?: Vec3;
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
    private readonly path: RoutePathReceiptV2,
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
        sampledFootPositionMetersXYZ:
          frame.sampledFootPositionMetersXYZ ?? frame.positionMetersXYZ,
        isSupportSurfaceDynamic: false,
        surfaceResolution,
      },
    };
  }
}

async function run(
  path: RoutePathReceiptV2,
  port: TraversalRuntimePortV1,
): Promise<RouteRuntimeProbeReceiptV2> {
  if (runRouteRuntimeProbeV2 === undefined) throw new Error("runner missing");
  return runRouteRuntimeProbeV2({
    routePathReceipt: path,
    traversalDriverProfile: DRIVER,
    runtimePort: port,
    validationProfile: VALIDATION_PROFILE,
    resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
    positionQuantizationMeters: BUILDER.profile.positionQuantizationMeters,
  });
}

describe("route runtime probe public runner", () => {
  it("exports the engine-neutral fixed-tick runner", () => {
    expect(hasRunner).toBe(true);
  });
});

describe.runIf(hasRunner)("runRouteRuntimeProbeV2", () => {
  it("rejects identity mismatch before reset", async () => {
    const valid = pathReceipt();
    const mismatchedPort = new ScriptedRuntimePort(
      valid,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 0] }],
      { resourceLockHash: HASH_A },
    );
    await expect(run(valid, mismatchedPort)).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV2",
    });
    expect(mismatchedPort.resetCallCount).toBe(0);
    expect(mismatchedPort.fixedTickCallCount).toBe(0);
  });

  it("accepts canonical layered, repeated-XZ, and crossing Path topology", async () => {
    const canonicalPaths = [
      pathReceipt([[0, 0, 0], [0, 1, 0], [2, 0, 0]]),
      pathReceipt([[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 0]]),
      pathReceipt([[0, 0, 0], [3, 0, 0], [1, 0, 0], [4, 0, 0]]),
      pathReceipt([[0, 0, 0], [2, 0, 2], [0, 1, 2], [2, 1, 0]]),
    ];
    for (const path of canonicalPaths) {
      const port = new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: path.orderedPathPositionsMetersXYZ[0]! },
        framesAlongPolyline(path.orderedPathPositionsMetersXYZ, 0.04),
      );
      const receipt = await run(path, port);
      expect({
        status: receipt.status,
        failure: receipt.status === "failed" ? receipt.failure : undefined,
        points: path.orderedPathPositionsMetersXYZ,
      }).toEqual({
        status: "complete",
        failure: undefined,
        points: path.orderedPathPositionsMetersXYZ,
      });
      expect(port.resetCallCount).toBe(1);
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

  it("follows straight paths and stops world-XZ lookahead at the next corner", async () => {
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
    expect(cornerIntent).toEqual([1, 0]);
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
      framesAlongPolyline([[0, 0, 0], [3, 4, 0]]),
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
        { positionMetersXYZ: [0.05, 0, 0.52] },
        ...framesAlongPolyline([[0.05, 0, 0.52], [10, 0, 0]]),
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
      framesAlongPolyline([[0, 0, 0], [1, 0, 1]]),
    );

    const receipt = await run(diagonal, port);

    expect(receipt.status).toBe("complete");
    expect(receipt.ticks.at(-1)).toMatchObject({
      routeProgressMetersXZ: 1.415,
      remainingRouteDistanceMetersXZ: 0,
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
      framesAlongPolyline(
        [
          [0, 0, 0],
          [5, 0, THRESHOLDS.maximumRouteDeviationMetersXZ],
          [10, 0, 0],
        ],
        0.05,
        "sliding",
      ),
    );
    const equality = await run(path, equalityPort);
    expect(equality.status).toBe("complete");
    expect(equality.metrics.slidingDurationTicks).toBe(
      equality.metrics.processedTickCount,
    );
    expect(equality.metrics.slidingDurationTicks).toBeGreaterThan(2);

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
        { positionMetersXYZ: [0.05, 0, 0], supportState: "unsupported" },
        ...framesAlongPolyline([[0.05, 0, 0], [1, 0, 0]]),
      ],
    );
    const recovered = await run(path, recoveredPort);
    expect(recovered).toMatchObject({
      status: "complete",
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
    const path = pathReceipt([[0, 0, 0], [48.48, 0, 0]]);
    const frame = (tickCall: number, arrives: boolean): RuntimeFrame => ({
      positionMetersXYZ: tickCall === THRESHOLDS.maximumProbeTicks
        ? [arrives ? 48 : 47.97, 0, 0]
        : [tickCall * 0.04, 0, 0],
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
        name: "RouteRuntimeProbeErrorV2",
        code: "ROUTE_RUNTIME_PROBE_RUNTIME_INVALID",
      });
    }

    const throwingPort = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: [0, 0, 0] },
      [{ positionMetersXYZ: [1, 0, 0], shouldThrow: true }],
    );
    await expect(run(path, throwingPort)).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV2",
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
    if (runRouteRuntimeProbeV2 === undefined) throw new Error("runner missing");
    await expect(runRouteRuntimeProbeV2({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: new ScriptedRuntimePort(
        path,
        { positionMetersXYZ: [0, 0, 0] },
        [{ positionMetersXYZ: [10, 0, 0] }],
      ),
      validationProfile: malformedValidationProfile,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: BUILDER.profile.positionQuantizationMeters,
    })).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV2",
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
    if (runRouteRuntimeProbeV2 === undefined) throw new Error("runner missing");

    await expect(runRouteRuntimeProbeV2({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: port,
      validationProfile: statefulProfile,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: BUILDER.profile.positionQuantizationMeters,
    })).rejects.toMatchObject({
      name: "RouteRuntimeProbeErrorV2",
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
      name: "RouteRuntimeProbeErrorV2",
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
      framesAlongPolyline(hairpin.orderedPathPositionsMetersXYZ),
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

  it("drives through successive turns without letting lookahead skip the support station", async () => {
    const path = pathReceipt([
      [0, 0, 0],
      [4, 0, 0],
      [4.5, 0, 2],
      [5, 0, 0],
      [6, 0, -4],
    ]);
    let position: Vec3 = path.orderedPathPositionsMetersXYZ[0]!;
    let port: ScriptedRuntimePort;
    const frame = (): RuntimeFrame => {
      const request = port.fixedTickRequests.at(-1) as
        | { readonly walkDirectionWorldXZ: readonly [number, number] }
        | undefined;
      if (request === undefined) throw new Error("direction request missing");
      position = [
        position[0] + request.walkDirectionWorldXZ[0] * 4 / 60,
        0,
        position[2] + request.walkDirectionWorldXZ[1] * 4 / 60,
      ];
      return { positionMetersXYZ: position };
    };
    port = new ScriptedRuntimePort(
      path,
      { positionMetersXYZ: position },
      [frame],
    );

    const receipt = await run(path, port);

    expect(
      receipt.status === "failed" ? receipt.failure : receipt.status,
    ).toBe("complete");
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
      hashRouteRuntimeProbeReceiptV2,
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
    if (runRouteRuntimeProbeV2 === undefined) throw new Error("runner missing");
    const receiptPromise = runRouteRuntimeProbeV2({
      routePathReceipt: path,
      traversalDriverProfile: DRIVER,
      runtimePort: delayedPort,
      validationProfile: mutableProfile,
      resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
      positionQuantizationMeters: BUILDER.profile.positionQuantizationMeters,
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



const HEIGHTFIELD_SURFACE = {
  ...SURFACE,
  traversalSurfaceId: "surface-heightfield",
} as const;
const PLATFORM_SURFACE = {
  ...SURFACE,
  traversalSurfaceId: "surface-platform",
  surfaceEntityId: "platform-deck",
  colliderSubshapeId: "platform-deck:primary",
  resourceRef: "package://traversal-surface/platform-deck.primary@1",
  resourceHash: HASH_B,
} as const;
const RAMP_SURFACE = {
  ...SURFACE,
  traversalSurfaceId: "surface-ramp",
  surfaceEntityId: "ramp-main",
  colliderSubshapeId: "ramp-main:primary",
  resourceRef: "package://traversal-surface/ramp-main.primary@1",
  resourceHash: HASH_C,
} as const;

function pathReceiptV2(
  points: readonly Vec3[],
  identities: readonly TraversalSurfaceIdentityV1[],
): ReturnType<typeof canonicalRoutePathReceiptV2> {
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
    resolvedTraversalLockHash: HASH_D,
    graphBuilderProfileRef: builder.resourceRef,
    graphBuilderResolvedVersion: builder.resolvedVersion,
    graphBuilderProfileHash: builder.contentHash,
    orderedTraversalNodeIds: points.map((_, index) => `node-${index}`),
    orderedTraversalEdgeIds: points.slice(1).map((_, index) => `edge-${index}`),
    orderedPathPositionsMetersXYZ: points,
    orderedTraversalSurfaceIdentities: identities,
    routePathDistanceMeters,
    routePathDistanceMetersXZ,
    routePathCost: routePathDistanceMeters,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 1,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

const STEP_PATH_POINTS = [
  [0, 0, 0],
  [2, 0, 0],
  [2.05, 0.4, 0],
  [5, 0.4, 0],
] as const satisfies readonly Vec3[];
const STEP_PATH_SURFACES = [
  HEIGHTFIELD_SURFACE,
  HEIGHTFIELD_SURFACE,
  PLATFORM_SURFACE,
  PLATFORM_SURFACE,
] as const;

function stationPort(
  path: ReturnType<typeof canonicalRoutePathReceiptV2>,
  initial: RuntimeFrame,
  ticks: readonly RuntimeFrameSource[],
): TraversalRuntimePortV1 {
  return new ScriptedRuntimePort(
    path as unknown as RoutePathReceiptV2,
    initial,
    ticks,
  );
}

async function runV2(
  path: ReturnType<typeof canonicalRoutePathReceiptV2>,
  port: TraversalRuntimePortV1,
  walkSpeedMetersPerSecond: number,
): Promise<NonNullable<Awaited<ReturnType<RunRouteRuntimeProbeV2>>>> {
  if (runRouteRuntimeProbeV2 === undefined) {
    throw new Error("V2 runner missing");
  }
  const builder = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  return runRouteRuntimeProbeV2({
    routePathReceipt: path,
    traversalDriverProfile: DRIVER,
    runtimePort: port,
    validationProfile: VALIDATION_PROFILE,
    resolvedControlFeelProfile: { walkSpeedMetersPerSecond },
    positionQuantizationMeters: builder.profile.positionQuantizationMeters,
  }) as Promise<NonNullable<Awaited<ReturnType<RunRouteRuntimeProbeV2>>>>;
}

describe("runRouteRuntimeProbeV2 3D support station", () => {
  it("exports the V2 runner beside V1", () => {
    expect(typeof runRouteRuntimeProbeV2).toBe("function");
  });

  it("completes a one-node support station using its sole Surface identity", async () => {
    const path = pathReceiptV2([[0, 0, 0]], [HEIGHTFIELD_SURFACE]);
    const port = stationPort(
      path,
      {
        positionMetersXYZ: [0, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      },
      [],
    );
    const receipt = await runV2(path, port, 4);
    expect(receipt).toMatchObject({
      status: "complete",
      completionDurationTicks: 0,
      ticks: [],
    });
  });

  it("does not zero-tick complete a 16.795m lower-ramp-upper route whose endpoints are 0.4m apart", async () => {
    const points = [
      [0, 0, 0],
      [5, 0, 0],
      [5, 0.5, 5],
      [0, 1, 0.4],
    ] as const satisfies readonly Vec3[];
    const path = pathReceiptV2(points, [
      HEIGHTFIELD_SURFACE,
      HEIGHTFIELD_SURFACE,
      RAMP_SURFACE,
      PLATFORM_SURFACE,
    ]);
    expect(path.routePathDistanceMetersXZ).toBeCloseTo(16.795, 3);
    expect(distanceXZ(points[0], points.at(-1)!)).toBe(0.4);
    const port = stationPort(
      path,
      {
        positionMetersXYZ: points[0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      },
      [{
        positionMetersXYZ: points.at(-1)!,
        surfaceResolution: { mode: "resolved", ...PLATFORM_SURFACE },
      }],
    ) as ScriptedRuntimePort;

    const receipt = await runV2(path, port, 4);

    expect(port.fixedTickCallCount).toBeGreaterThan(0);
    expect(receipt).not.toMatchObject({
      status: "complete",
      completionDurationTicks: 0,
    });
  });

  it("does not complete near the endpoint while station arc remains outside the final band", async () => {
    const path = pathReceiptV2(
      [[0, 0, 0], [10, 0, 0]],
      [HEIGHTFIELD_SURFACE, HEIGHTFIELD_SURFACE],
    );
    const port = stationPort(
      path,
      {
        positionMetersXYZ: [0, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      },
      [{
        positionMetersXYZ: [9.6, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      }],
    ) as ScriptedRuntimePort;

    const receipt = await runV2(path, port, 4);

    expect(port.fixedTickCallCount).toBeGreaterThan(1);
    expect(receipt.status).toBe("failed");
  });

  it("keeps Heightfield expected ids when 2.4m XZ lookahead already sees the step", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const port = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [0.05, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      }],
    );
    const receipt = await runV2(path, port, 4);
    expect(receipt.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      HEIGHTFIELD_SURFACE.traversalSurfaceId,
    ]);
  });

  it("allows both endpoint Surfaces while the station is on a legal transition edge", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const port = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [2.025, 0.2, 0],
        surfaceResolution: { mode: "resolved", ...PLATFORM_SURFACE },
      }],
    );
    const receipt = await runV2(path, port, 180);
    expect(receipt.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      HEIGHTFIELD_SURFACE.traversalSurfaceId,
      PLATFORM_SURFACE.traversalSurfaceId,
    ].sort());
  });

  it("selects support station from retained foot when subject origin has crossed ahead", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const port = stationPort(
      path,
      {
        positionMetersXYZ: [0, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      },
      [{
        positionMetersXYZ: [3.2, 0.4, 0],
        sampledFootPositionMetersXYZ: [1.9, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      }],
    );

    const receipt = await runV2(path, port, 180);

    expect(receipt.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      HEIGHTFIELD_SURFACE.traversalSurfaceId,
    ]);
    expect(receipt.status === "failed" ? receipt.failure.kind : undefined)
      .not.toBe("support-surface-mismatch");
  });

  it("mismatches a lower same-XZ Heightfield after the station is on the platform segment", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const port = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [3.2, 0.4, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      }],
    );
    const receipt = await runV2(path, port, 180);
    expect(receipt.status).toBe("failed");
    expect(receipt.status === "failed" ? receipt.failure.kind : undefined).toBe("support-surface-mismatch");
    expect(receipt.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      PLATFORM_SURFACE.traversalSurfaceId,
    ]);
  });

  it("keeps only adjacent tied A-B-C seam segments", async () => {
    const path = pathReceiptV2(
      [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
      [HEIGHTFIELD_SURFACE, PLATFORM_SURFACE, HEIGHTFIELD_SURFACE],
    );
    const port = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [1, 0, 0],
        surfaceResolution: { mode: "resolved", ...PLATFORM_SURFACE },
      }],
    );
    const receipt = await runV2(path, port, 180);
    expect(receipt.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      HEIGHTFIELD_SURFACE.traversalSurfaceId,
      PLATFORM_SURFACE.traversalSurfaceId,
    ].sort());
  });

  it("restores the station to the start after Reset/Rebind", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const firstPort = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [3.2, 0.4, 0],
        surfaceResolution: { mode: "resolved", ...PLATFORM_SURFACE },
      }],
    );
    const first = await runV2(path, firstPort, 180);
    expect(first.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      PLATFORM_SURFACE.traversalSurfaceId,
    ]);
    const secondPort = stationPort(
      path,
      { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
      [{
        positionMetersXYZ: [0.04, 0, 0],
        surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE },
      }],
    );
    const second = await runV2(path, secondPort, 4);
    expect(second.ticks[0]?.expectedTraversalSurfaceIds).toEqual([
      HEIGHTFIELD_SURFACE.traversalSurfaceId,
    ]);
  });

  it("produces byte-identical receipts across 30/60/120-like render cadence", async () => {
    const path = pathReceiptV2(STEP_PATH_POINTS, STEP_PATH_SURFACES);
    const frames = [
      { positionMetersXYZ: [0.05, 0, 0] as Vec3, surfaceResolution: { mode: "resolved" as const, ...HEIGHTFIELD_SURFACE } },
    ];
    const hashes: string[] = [];
    for (const extraReads of [0, 1, 3]) {
      const base = stationPort(
        path,
        { positionMetersXYZ: [0, 0, 0], surfaceResolution: { mode: "resolved", ...HEIGHTFIELD_SURFACE } },
        frames,
      );
      const wrapped: TraversalRuntimePortV1 = {
        ...base,
        readLatestTickEvidence: () => {
          for (let index = 0; index < extraReads; index += 1) {
            base.readLatestTickEvidence();
          }
          return base.readLatestTickEvidence();
        },
        resetToStartAnchor: (request) => base.resetToStartAnchor(request),
        runFixedTick: (request) => base.runFixedTick(request),
      };
      const receipt = await runV2(path, wrapped, 4);
      hashes.push(hashRouteRuntimeProbeReceiptV2(receipt));
    }
    expect(hashes[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[2]).toBe(hashes[0]);
  });
});
