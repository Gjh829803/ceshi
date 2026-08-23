import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  SubjectAssetRuntimeErrorV1,
  WorldRuntimeLayoutAssertionErrorV1,
} from "@whitebox-world/runtime-babylon";
import type {
  BindControlRequestV2,
  ControlCapturePassPayloadV1,
  ControlBindingReceiptV2,
  FixedInputV1,
  RuntimeControlCaptureFrameV1,
  RouteEvidenceSelectorV1,
  WorldRuntimeSnapshotV3,
  WorldkitBrowserRouteEvidencePublicationV1,
  WorldkitBrowserApiV4,
  WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";

import {
  installDeferredWorldkitBrowserApi,
  listSubjectPresetAuthoringProfilesV1,
  validateSubjectPackageAgainstRegistry,
  type DeferredWorldkitBrowserRuntimeAdapterV1,
} from "./worldkit-browser-api";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const HASH_F = `sha256:${"f".repeat(64)}` as const;
const ROUTE_SELECTOR = {
  constraintId: "player-to-goal",
  routeId: "main-route",
} as const satisfies RouteEvidenceSelectorV1;

function routeEvidencePublicationFixture(): WorldkitBrowserRouteEvidencePublicationV1 {
  const traversalSurfaceIdentity = {
    traversalSurfaceId: "surface-main",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
    resolvedVersion: "1",
    resourceHash: HASH_A,
  } as const;
  const graphBuilderProfileRef =
    "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1";
  const graphBuilderProfileHash =
    "sha256:9720639dac7de3da1d140c7afd1ea7df4258cef202468e39fa222158caaad231" as const;
  const nodeBase = {
    traversalSurfaceId: traversalSurfaceIdentity.traversalSurfaceId,
    surfaceEntityId: traversalSurfaceIdentity.surfaceEntityId,
    colliderSubshapeId: traversalSurfaceIdentity.colliderSubshapeId,
    tileId: "tile-0",
    clearanceWidthMeters: 2,
    clearanceHeightMeters: 3,
  } as const;
  const traversalGraph = {
    kind: "traversal-graph",
    schemaVersion: 1,
    authoringSpecHash: HASH_B,
    layoutSolveReportHash: HASH_C,
    resourceLockHash: HASH_D,
    terrainArtifactHash: HASH_E,
    colliderArtifactHash: HASH_F,
    surfaceArtifactHash: traversalSurfaceIdentity.resourceHash,
    routeBuildInputHash: HASH_B,
    resolvedTraversalLockHash: HASH_C,
    graphBuilderProfileRef,
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash,
    routeId: ROUTE_SELECTOR.routeId,
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    traversalNodesById: {
      "node-goal": {
        id: "node-goal",
        ...nodeBase,
        positionMetersXYZ: [1, 0, 0],
      },
      "node-start": {
        id: "node-start",
        ...nodeBase,
        positionMetersXYZ: [0, 0, 0],
      },
    },
    traversalEdgesById: {
      "edge-start-goal": {
        id: "edge-start-goal",
        type: "walk",
        fromTraversalNodeId: "node-start",
        toTraversalNodeId: "node-goal",
        distanceMeters: 1,
        heightDeltaMeters: 0,
        stepHeightMeters: 0,
        slopeDegrees: 0,
        minimumClearanceWidthMeters: 2,
        minimumClearanceHeightMeters: 3,
        routePathCost: 1,
      },
    },
  } as const;
  const traversalGraphHash = sha256CanonicalJson(traversalGraph) as
    `sha256:${string}`;
  const routePathReceipt = {
    kind: "route-path-receipt",
    schemaVersion: 1,
    status: "complete",
    ...ROUTE_SELECTOR,
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    authoringSpecHash: traversalGraph.authoringSpecHash,
    layoutSolveReportHash: traversalGraph.layoutSolveReportHash,
    resourceLockHash: traversalGraph.resourceLockHash,
    traversalGraphHash,
    routeBuildInputHash: traversalGraph.routeBuildInputHash,
    resolvedTraversalLockHash: traversalGraph.resolvedTraversalLockHash,
    traversalSurfaceIdentity,
    graphBuilderProfileRef,
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash,
    orderedTraversalNodeIds: ["node-start", "node-goal"],
    orderedTraversalEdgeIds: ["edge-start-goal"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 1,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 2,
    minimumObservedClearanceHeightMeters: 3,
    maximumObservedSurfaceGapMeters: 0,
  } as const;
  const routePathReceiptHash = sha256CanonicalJson(routePathReceipt) as
    `sha256:${string}`;
  const runtimeImplementationIdentity = {
    runtimeBackendRef: "worldkit://runtime-backend/canonical-character@1",
    runtimeBackendResolvedVersion: "1",
    runtimeBackendHash: HASH_D,
    runtimeAdapterRef: "worldkit://runtime-adapter/canonical-character@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_E,
  } as const;
  const initialRuntimeEvidence = {
    kind: "traversal-runtime-tick-evidence",
    schemaVersion: 1,
    tick: 0,
    traversingEntityId: routePathReceipt.traversingEntityId,
    authoringSpecHash: routePathReceipt.authoringSpecHash,
    layoutSolveReportHash: routePathReceipt.layoutSolveReportHash,
    resourceLockHash: routePathReceipt.resourceLockHash,
    executionPlanHash: HASH_F,
    resolvedTraversalLockHash: routePathReceipt.resolvedTraversalLockHash,
    runtimeImplementationIdentity,
    fixedTimeStepSeconds: 1 / 60,
    subjectPositionMetersXYZ: [1, 0, 0],
    velocityMetersPerSecondXYZ: [0, 0, 0],
    movementMedium: "ground",
    locomotionMode: "idle",
    characterSupport: {
      kind: "character-support-evidence",
      schemaVersion: 1,
      supportState: "supported",
      supportNormalWorldXYZ: [0, 1, 0],
      sampledFootPositionMetersXYZ: [1, 0, 0],
      isSupportSurfaceDynamic: false,
      surfaceResolution: { mode: "resolved", ...traversalSurfaceIdentity },
    },
  } as const;
  const routeRuntimeProbeReceipt = {
    kind: "route-runtime-probe-receipt",
    schemaVersion: 1,
    status: "complete",
    request: {
      kind: "route-runtime-probe-request",
      schemaVersion: 1,
      routePathReceiptHash,
      ...ROUTE_SELECTOR,
      traversingEntityId: routePathReceipt.traversingEntityId,
      startAnchorEntityId: routePathReceipt.startAnchorEntityId,
      destinationAnchorEntityId: routePathReceipt.destinationAnchorEntityId,
      authoringSpecHash: routePathReceipt.authoringSpecHash,
      layoutSolveReportHash: routePathReceipt.layoutSolveReportHash,
      resourceLockHash: routePathReceipt.resourceLockHash,
      executionPlanHash: initialRuntimeEvidence.executionPlanHash,
      routeBuildInputHash: routePathReceipt.routeBuildInputHash,
      traversalGraphHash,
      resolvedTraversalLockHash: routePathReceipt.resolvedTraversalLockHash,
      traversalSurfaceIdentity,
      driverProfileRef:
        "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
      driverResolvedVersion: "1",
      driverProfileHash:
        "sha256:a3312d306ad499dabb29a50c868a98d8bb3b65592e050cd277ae3571d5347405",
      validationProfileRef:
        "worldkit://validation-profile/outdoor-world-package-dev@1",
      validationProfileVersion: "1.0.0",
      validationProfileHash:
        "sha256:4ae59a7b56f09055e35ad6c8c90a81d32bc5655e2ce845865c0cc945f09f042e",
      runtimeImplementationIdentity,
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
  } as const;
  const routeOverlay = {
    kind: "route-overlay",
    schemaVersion: 1,
    ...ROUTE_SELECTOR,
    traversingEntityId: routePathReceipt.traversingEntityId,
    startAnchor: {
      entityId: routePathReceipt.startAnchorEntityId,
      positionMetersXYZ: [0, 0, 0],
    },
    destinationAnchor: {
      entityId: routePathReceipt.destinationAnchorEntityId,
      positionMetersXYZ: [1, 0, 0],
    },
    traversalSurfaceIdentity,
    resolvedTraversalLockHash: routePathReceipt.resolvedTraversalLockHash,
    traversalGraphHash,
    routePathReceiptHash,
    orderedTraversalNodeIds: routePathReceipt.orderedTraversalNodeIds,
    orderedTraversalEdgeIds: routePathReceipt.orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ:
      routePathReceipt.orderedPathPositionsMetersXYZ,
    hardRibbon: {
      routeId: ROUTE_SELECTOR.routeId,
      pointsMetersXZ: [[0, 0], [1, 0]],
      widthMeters: 2,
      locomotionProfileRef:
        "worldkit://locomotion-profile/humanoid.ground@1",
    },
    blockingColliderIdentities: [],
  } as const;
  return {
    kind: "worldkit-browser-route-evidence-publication",
    schemaVersion: 1,
    worldPackageRootHash: HASH_A,
    authoringSpecHash: routePathReceipt.authoringSpecHash,
    normalizedWorldIrHash: HASH_E,
    executionPlanHash: routeRuntimeProbeReceipt.request.executionPlanHash,
    resourceLockHash: routePathReceipt.resourceLockHash,
    layoutSolveReportHash: routePathReceipt.layoutSolveReportHash,
    validationReportHash: HASH_E,
    routeValidationSetReceiptHash: HASH_F,
    validationProfileRef:
      routeRuntimeProbeReceipt.request.validationProfileRef,
    validationProfileResolvedVersion:
      routeRuntimeProbeReceipt.request.validationProfileVersion,
    validationProfileHash:
      routeRuntimeProbeReceipt.request.validationProfileHash,
    routes: [{
      selector: ROUTE_SELECTOR,
      summary: {
        kind: "route-evidence-summary",
        schemaVersion: 1,
        ...ROUTE_SELECTOR,
        traversingEntityId: routePathReceipt.traversingEntityId,
        startAnchorEntityId: routePathReceipt.startAnchorEntityId,
        destinationAnchorEntityId: routePathReceipt.destinationAnchorEntityId,
        connectivityStatus: "complete",
        routePathStatus: "complete",
        routeRuntimeProbeStatus: "complete",
        routeOverlayStatus: "available",
      },
      routePathReceipt,
      routePathReceiptHash,
      routeRuntimeProbeReceipt,
      routeRuntimeProbeReceiptHash: sha256CanonicalJson(
        routeRuntimeProbeReceipt,
      ) as `sha256:${string}`,
      routeOverlay,
      routeOverlayHash: sha256CanonicalJson(routeOverlay) as
        `sha256:${string}`,
    }],
  };
}

function unreachableRouteEvidencePublicationFixture(): WorldkitBrowserRouteEvidencePublicationV1 {
  const complete = routeEvidencePublicationFixture();
  const route = complete.routes[0]!;
  return {
    ...complete,
    routes: [{
      selector: route.selector,
      summary: {
        ...route.summary,
        connectivityStatus: "unreachable",
        routePathStatus: "unavailable",
        routeRuntimeProbeStatus: "unavailable",
        routeOverlayStatus: "unavailable",
      },
    }],
  };
}

function snapshotFixture(action: "idle" | "walk" | "run" | "jump" = "idle"): WorldRuntimeSnapshotV3 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick: 0,
    ready: true,
    controlledEntityId: "rigged-primary",
    controllersById: {
      "controller-primary": {
        id: "controller-primary",
        controlledEntityId: "rigged-primary",
      },
    },
    subjectStatesByEntityId: {
      "rigged-primary": {
        entityId: "rigged-primary",
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.rigged-golden@1",
        subjectDefinitionHash: `sha256:${"1".repeat(64)}`,
        positionMetersXYZ: [0, 0, 0],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
        activeActionId: action,
      },
    },
    camera: {
      entityId: "camera-main",
      targetEntityId: "rigged-primary",
      positionMetersXYZ: [0, 4, 6],
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    resources: { meshes: 1, bodies: 1, terrainSamples: 9 },
  };
}

function adapterFixture(
  runtimeDiagnostics: readonly WorldkitBrowserDiagnosticV1[] = [],
): DeferredWorldkitBrowserRuntimeAdapterV1 & {
  disposeCount: number;
} {
  const snapshot = snapshotFixture();
  const pass = (
    passId: ControlCapturePassPayloadV1["passId"],
    mediaType: ControlCapturePassPayloadV1["mediaType"],
    encoding: ControlCapturePassPayloadV1["encoding"],
  ): ControlCapturePassPayloadV1 => ({
    passId,
    mediaType,
    encoding,
    byteLength: 0,
    contentHash: `sha256:${"0".repeat(64)}`,
    bytesBase64: "",
  });
  const captureFrame: RuntimeControlCaptureFrameV1 = {
    kind: "worldkit-control-capture-frame",
    schemaVersion: 1,
    runtimeSessionId: "runtime-session-test",
    captureFrameIndex: 0,
    simulationTick: 0,
    renderFrameIndex: 0,
    renderReadyReceiptId: "render-ready:test:0",
    widthPixels: 16,
    heightPixels: 9,
    camera: {
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera/third-person.standard@1",
      positionMetersXYZ: [0, 4, 6],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      verticalFovRadians: 1,
      nearClipMeters: 0.05,
      farClipMeters: 1_000,
      viewMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
      projectionMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
    },
    snapshot,
    semanticClasses: [],
    instances: [],
    passesById: {
      "neutral-color": pass("neutral-color", "image/png", "png-rgba8-srgb"),
      "linear-depth-meters": pass("linear-depth-meters", "application/octet-stream", "float32-le"),
      "semantic-class-id": pass("semantic-class-id", "application/octet-stream", "uint32-le"),
      "instance-id": pass("instance-id", "application/octet-stream", "uint32-le"),
      "world-normal": pass("world-normal", "application/octet-stream", "float32x3-le"),
    },
  };
  return {
    disposeCount: 0,
    runtimeDiagnostics: () => runtimeDiagnostics,
    runtimeSnapshot: () => snapshot,
    bindControl: (request: BindControlRequestV2): ControlBindingReceiptV2 => ({
      kind: "worldkit-control-binding-receipt",
      schemaVersion: 2,
      status: "committed",
      controllerId: request.controllerId,
      previousControlledEntityId: request.expectedControlledEntityId,
      controlledEntityId: request.controlledEntityId,
    }),
    runWorldkitFixedInput: async (_steps: readonly FixedInputV1[]) => snapshotFixture("run"),
    getControlCaptureCapabilities: () => ({
      kind: "worldkit-control-capture-capabilities",
      schemaVersion: 1,
      available: true,
      captureProfileRef: "worldkit://capture/profile/control-video@1",
      captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
      requiredPassIds: [
        "neutral-color",
        "linear-depth-meters",
        "semantic-class-id",
        "instance-id",
        "world-normal",
      ],
      maximumWidthPixels: 4_096,
      maximumHeightPixels: 4_096,
      diagnostics: [],
    }),
    waitForSimulationTick: async () => snapshot,
    waitForRenderReady: async () => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: "render-ready:test:0",
      runtimeSessionId: "runtime-session-test",
      simulationTick: 0,
      renderFrameIndex: 0,
    }),
    captureControlFrame: async () => captureFrame,
    captureScreenshot: () => "data:image/png;base64,",
    resetRuntime: () => snapshot,
    setPaused: () => undefined,
    disposeRuntime: async function () {
      this.disposeCount += 1;
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("installDeferredWorldkitBrowserApi", () => {
  it("preserves all 27 V3 methods and adds only read-only Route Evidence getters", () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapterFixture(),
    });
    const inheritedMethodNames = [
      "ready",
      "getSnapshot",
      "getDiagnostics",
      "bindControl",
      "runFixedInput",
      "getControlCaptureCapabilities",
      "waitForSimulationTick",
      "waitForRenderReady",
      "captureControlFrame",
      "captureScreenshot",
      "reset",
      "setPaused",
      "listSubjectDefinitions",
      "listMotionKernels",
      "listCompatibleProfiles",
      "getSubjectPresetBaseline",
      "validateSubjectPackage",
      "setIntent",
      "setCameraPreference",
      "adjustCameraView",
      "resetCameraView",
      "setCameraTuning",
      "applySubjectPresetTuning",
      "setMotionProfile",
      "runHarness",
      "getSubjectSnapshot",
      "getCameraSnapshot",
    ] as const;
    const routeGetterNames = [
      "getRouteSummary",
      "getRoutePathReceipt",
      "getRouteRuntimeProbeReceipt",
      "getRouteOverlay",
    ] as const;

    expect(inheritedMethodNames).toHaveLength(27);
    for (const methodName of [...inheritedMethodNames, ...routeGetterNames]) {
      expect(installation.api[methodName]).toEqual(expect.any(Function));
    }
    const exposedNames = Object.getOwnPropertyNames(installation.api);
    expect(exposedNames.filter((name) =>
      /^(build|query|runRoute|setRoute|setValidation|set.*Threshold)/.test(name)
    )).toEqual([]);
    expect(exposedNames).not.toContain("getTraversalGraph");
    expect(exposedNames).not.toContain("getRouteOverlayBytes");
  });

  it("projects canonical Route Evidence by stable identity as detached immutable copies", async () => {
    const mutableSource = structuredClone(routeEvidencePublicationFixture());
    const source = Object.freeze(mutableSource);
    const adapter = adapterFixture();
    const readSnapshot = adapter.runtimeSnapshot.bind(adapter);
    let snapshotReadCount = 0;
    adapter.runtimeSnapshot = () => {
      snapshotReadCount += 1;
      return readSnapshot();
    };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication: source,
      initialize: async () => adapter,
    });
    await installation.initialization;
    expect(snapshotReadCount).toBe(1);

    const summaryResult = installation.api.getRouteSummary(ROUTE_SELECTOR);
    expect(summaryResult).toEqual({
      kind: "worldkit-route-evidence-query-result",
      schemaVersion: 1,
      availability: "available",
      selector: ROUTE_SELECTOR,
      summary: {
        kind: "route-evidence-summary",
        schemaVersion: 1,
        ...ROUTE_SELECTOR,
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
        connectivityStatus: "complete",
        routePathStatus: "complete",
        routeRuntimeProbeStatus: "complete",
        routeOverlayStatus: "available",
      },
    });
    const pathResult = installation.api.getRoutePathReceipt(ROUTE_SELECTOR);
    const probeResult = installation.api.getRouteRuntimeProbeReceipt(
      ROUTE_SELECTOR,
    );
    const overlayResult = installation.api.getRouteOverlay(ROUTE_SELECTOR);
    expect(pathResult).toMatchObject({
      availability: "available",
      routePathReceipt: { routeId: ROUTE_SELECTOR.routeId },
    });
    expect(probeResult).toMatchObject({
      availability: "available",
      routeRuntimeProbeReceipt: {
        request: { constraintId: ROUTE_SELECTOR.constraintId },
      },
    });
    expect(overlayResult).toMatchObject({
      availability: "available",
      routeOverlay: { traversingEntityId: "player" },
    });
    expect(Object.isFrozen(summaryResult)).toBe(true);
    expect(Object.isFrozen(summaryResult.selector)).toBe(true);
    expect(Object.isFrozen(pathResult)).toBe(true);
    expect(pathResult).not.toBe(
      installation.api.getRoutePathReceipt(ROUTE_SELECTOR),
    );
    expect(pathResult.availability === "available" &&
      Object.isFrozen(pathResult.routePathReceipt.orderedPathPositionsMetersXYZ[0]))
      .toBe(true);
    expect(JSON.stringify({ summaryResult, pathResult, probeResult, overlayResult }))
      .not.toMatch(/nativeHandle|providerHandle|providerPolygonRef|Uint8Array/);
    expect(snapshotReadCount).toBe(1);

    const mutableFirstPosition = mutableSource.routes[0]!
      .routePathReceipt!.orderedPathPositionsMetersXYZ[0] as unknown as number[];
    mutableFirstPosition[0] = 999;
    const detached = installation.api.getRoutePathReceipt(ROUTE_SELECTOR);
    expect(detached.availability === "available" &&
      detached.routePathReceipt.orderedPathPositionsMetersXYZ[0]![0]).toBe(0);
  });

  it("distinguishes not loaded, unknown Route, and unpublished artifacts", () => {
    const noEvidence = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapterFixture(),
    });
    const loadedEmpty = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication: {
        ...routeEvidencePublicationFixture(),
        routes: [],
      },
      initialize: async () => adapterFixture(),
    });
    const pathOnly = routeEvidencePublicationFixture();
    const pathOnlyRoute = pathOnly.routes[0]!;
    const loadedPath = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication: {
        ...pathOnly,
        routes: [{
          selector: pathOnlyRoute.selector,
          summary: {
            ...pathOnlyRoute.summary,
            routeRuntimeProbeStatus: "unavailable",
            routeOverlayStatus: "unavailable",
          },
          routePathReceipt: pathOnlyRoute.routePathReceipt!,
          routePathReceiptHash: pathOnlyRoute.routePathReceiptHash!,
        }],
      },
      initialize: async () => adapterFixture(),
    });
    const loadedFailure = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication: unreachableRouteEvidencePublicationFixture(),
      initialize: async () => adapterFixture(),
    });

    expect(noEvidence.api.getRouteSummary(ROUTE_SELECTOR)).toMatchObject({
      availability: "unavailable",
      reason: "route-evidence-not-loaded",
    });
    expect(loadedEmpty.api.getRouteSummary(ROUTE_SELECTOR)).toMatchObject({
      availability: "unavailable",
      reason: "route-not-found",
    });
    expect(loadedPath.api.getRouteSummary(ROUTE_SELECTOR)).toMatchObject({
      availability: "available",
      summary: {
        routePathStatus: "complete",
        routeRuntimeProbeStatus: "unavailable",
        routeOverlayStatus: "unavailable",
      },
    });
    expect(loadedPath.api.getRouteRuntimeProbeReceipt(ROUTE_SELECTOR))
      .toMatchObject({
        availability: "unavailable",
        reason: "evidence-not-published",
      });
    expect(loadedPath.api.getRouteOverlay(ROUTE_SELECTOR)).toMatchObject({
      availability: "unavailable",
      reason: "evidence-not-published",
    });
    expect(loadedFailure.api.getRouteSummary(ROUTE_SELECTOR)).toMatchObject({
      availability: "available",
      summary: {
        connectivityStatus: "unreachable",
        routePathStatus: "unavailable",
        routeRuntimeProbeStatus: "unavailable",
        routeOverlayStatus: "unavailable",
      },
    });
    expect(loadedFailure.api.getRoutePathReceipt(ROUTE_SELECTOR)).toMatchObject({
      availability: "unavailable",
      reason: "evidence-not-published",
    });
    expect(() => loadedPath.api.getRouteSummary({
      constraintId: "",
      routeId: ROUTE_SELECTOR.routeId,
    })).toThrow("WORLDKIT_ROUTE_EVIDENCE_SELECTOR_INVALID");
    const accessorSelector = Object.defineProperties({}, {
      constraintId: {
        enumerable: true,
        get: () => {
          throw new Error("selector accessor must not execute");
        },
      },
      routeId: { enumerable: true, value: ROUTE_SELECTOR.routeId },
    });
    expect(() => loadedPath.api.getRouteSummary(
      accessorSelector as RouteEvidenceSelectorV1,
    )).toThrow("WORLDKIT_ROUTE_EVIDENCE_SELECTOR_INVALID");
    const symbolSelector = {
      ...ROUTE_SELECTOR,
      [Symbol("providerHandle")]: "secret",
    };
    expect(() => loadedPath.api.getRouteSummary(symbolSelector))
      .toThrow("WORLDKIT_ROUTE_EVIDENCE_SELECTOR_INVALID");
  });

  it("rejects opaque, provider-owned, cross-Route, and duplicate published evidence", () => {
    const source = routeEvidencePublicationFixture();
    const route = source.routes[0]!;
    const install = (
      routeEvidencePublication: WorldkitBrowserRouteEvidencePublicationV1,
    ) => installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication,
      initialize: async () => adapterFixture(),
    });

    expect(() => install({
      ...source,
      routes: [{
        ...route,
        routeOverlay: new Uint8Array([1, 2, 3]),
      }],
    } as unknown as WorldkitBrowserRouteEvidencePublicationV1)).toThrow(
      "WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID",
    );
    expect(() => install({
      ...source,
      routes: [{
        ...route,
        routeOverlay: {
          ...route.routeOverlay!,
          providerHandle: "secret-provider-object",
        },
      }],
    } as unknown as WorldkitBrowserRouteEvidencePublicationV1)).toThrow(
      "WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID",
    );
    expect(() => install({
      ...source,
      routes: [{
        ...route,
        routeOverlay: {
          ...route.routeOverlay!,
          traversingEntityId: "other-player",
        },
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => install({
      ...source,
      routes: [route, route],
    })).toThrow(
      "WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID",
    );
    expect(() => install({
      ...source,
      [Symbol("providerHandle")]: "secret-provider-object",
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
  });

  it("rejects forged payload hashes and publication-profile self-certification", () => {
    const source = routeEvidencePublicationFixture();
    const route = source.routes[0]!;
    const install = (
      routeEvidencePublication: WorldkitBrowserRouteEvidencePublicationV1,
    ) => installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication,
      initialize: async () => adapterFixture(),
    });

    for (const forgedRoute of [
      { ...route, routePathReceiptHash: HASH_A },
      { ...route, routeRuntimeProbeReceiptHash: HASH_A },
      { ...route, routeOverlayHash: HASH_A },
    ]) {
      expect(() => install({ ...source, routes: [forgedRoute] }))
        .toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    }
    expect(() => install({
      ...source,
      validationProfileHash: HASH_A,
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => install({
      ...source,
      executionPlanHash: HASH_A,
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");

    const otherSelector = {
      constraintId: "other-constraint",
      routeId: ROUTE_SELECTOR.routeId,
    } as const;
    expect(() => install({
      ...source,
      routes: [{
        ...route,
        selector: otherSelector,
        summary: { ...route.summary, ...otherSelector },
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
  });

  it("requires stable unique code-unit ordering for published selectors", () => {
    const source = routeEvidencePublicationFixture();
    const summaryOnly = (constraintId: string) => ({
      selector: { constraintId, routeId: "shared-route" },
      summary: {
        kind: "route-evidence-summary",
        schemaVersion: 1,
        constraintId,
        routeId: "shared-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
        connectivityStatus: "incomplete",
        routePathStatus: "unavailable",
        routeRuntimeProbeStatus: "unavailable",
        routeOverlayStatus: "unavailable",
      },
    } as const);
    const install = (routes: WorldkitBrowserRouteEvidencePublicationV1["routes"]) =>
      installDeferredWorldkitBrowserApi({
        target: {},
        statusElement: { dataset: {} },
        routeEvidencePublication: { ...source, routes },
        initialize: async () => adapterFixture(),
      });

    expect(() => install([summaryOnly("route-z"), summaryOnly("route-a")]))
      .toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => install([summaryOnly("route-a"), summaryOnly("route-a")]))
      .toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => install([summaryOnly("route-a"), summaryOnly("route-z")]))
      .not.toThrow();
  });

  it("keeps canonical Anchor positions distinct from snapped Path endpoints", () => {
    const source = routeEvidencePublicationFixture();
    const route = source.routes[0]!;
    const routeOverlay = {
      ...route.routeOverlay!,
      startAnchor: {
        ...route.routeOverlay!.startAnchor,
        positionMetersXYZ: [0.1, 0, 0],
      },
      destinationAnchor: {
        ...route.routeOverlay!.destinationAnchor,
        positionMetersXYZ: [0.9, 0, 0],
      },
    } as const;
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      routeEvidencePublication: {
        ...source,
        routes: [{
          ...route,
          routeOverlay,
          routeOverlayHash: sha256CanonicalJson(routeOverlay) as
            `sha256:${string}`,
        }],
      },
      initialize: async () => adapterFixture(),
    });

    expect(installation.api.getRouteOverlay(ROUTE_SELECTOR)).toMatchObject({
      availability: "available",
      routeOverlay: {
        startAnchor: { positionMetersXYZ: [0.1, 0, 0] },
        destinationAnchor: { positionMetersXYZ: [0.9, 0, 0] },
        orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
      },
    });
  });

  it("installs before startup, keeps one ready Promise, and gates sync/async methods", async () => {
    const gate = deferred<void>();
    const adapter = adapterFixture();
    const target: { __WORLDKIT__?: WorldkitBrowserApiV4 } = {};
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement,
      initialize: async ({ trackAdapter }) => {
        await gate.promise;
        trackAdapter(adapter);
        return adapter;
      },
    });
    const api = target.__WORLDKIT__ as typeof installation.api;

    expect(api).toBe(installation.api);
    expect(statusElement.dataset.worldkitStatus).toBe("loading");
    const selector = { constraintId: "player-to-goal", routeId: "main-route" };
    expect(api.getRouteSummary(selector)).toEqual({
      kind: "worldkit-route-evidence-query-result",
      schemaVersion: 1,
      availability: "unavailable",
      selector,
      reason: "route-evidence-not-loaded",
    });
    expect(api.getDiagnostics()).toEqual([]);
    expect(api.ready()).toBe(api.ready());
    expect(() => api.getSnapshot()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_NOT_READY" }),
    );
    const pendingRun = api.runFixedInput([{ actions: ["run"], ticks: 1 }]);

    gate.resolve();
    await expect(installation.initialization).resolves.toBe(adapter);
    await expect(api.ready()).resolves.toEqual(snapshotFixture());
    await expect(pendingRun).resolves.toEqual(snapshotFixture("run"));
    expect(api).not.toHaveProperty("setControlFeelTuning");
    expect(api).not.toHaveProperty("getControlFeelTuning");
    expect(api).not.toHaveProperty("setControlTuning");
    expect(api).not.toHaveProperty("getControlTuning");
    expect(api.getControlCaptureCapabilities().available).toBe(true);
    await expect(api.waitForSimulationTick(0)).resolves.toMatchObject({ tick: 0 });
    const receipt = await api.waitForRenderReady(0);
    expect(receipt).toMatchObject({ simulationTick: 0, renderFrameIndex: 0 });
    await expect(api.captureControlFrame({
      captureFrameIndex: 0,
      expectedSimulationTick: 0,
      renderReadyReceiptId: receipt.id,
      widthPixels: 16,
      heightPixels: 9,
    })).resolves.toMatchObject({
      captureFrameIndex: 0,
      simulationTick: 0,
      widthPixels: 16,
      heightPixels: 9,
    });
    expect(statusElement.dataset.worldkitStatus).toBe("ready");
  });

  it("keeps experimental packages out of default AI discovery and uses descriptive availability", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    const productionDefinitions = installation.api.listSubjectDefinitions?.() ?? [];
    const allDefinitions = installation.api.listSubjectDefinitions?.({
      includeExperimental: true,
    }) ?? [];
    expect(productionDefinitions.map((definition) => definition.resourceRef)).toEqual([
      "worldkit://subject-definition/animal.quadruped.forward-steer@2",
      "worldkit://subject-definition/humanoid.g-bot@1",
    ]);
    const gBotSummary = productionDefinitions.find(
      (definition) =>
        definition.resourceRef ===
        "worldkit://subject-definition/humanoid.g-bot@1",
    );
    expect(gBotSummary?.contentHash).toBe(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.g-bot@1",
      )?.contentHash,
    );
    expect(gBotSummary?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(allDefinitions).toHaveLength(6);
    expect(
      allDefinitions.filter(
        (definition) => definition.authoringAvailability === "experimental",
      ),
    ).toHaveLength(4);
    expect(JSON.stringify(allDefinitions)).not.toMatch(/agentAccessLevel|"T[0-2]"/);

    expect(installation.api.getSubjectPresetBaseline?.(
      "worldkit://subject-definition/animal.quadruped.forward-steer@2",
    )).toMatchObject({
      defaultCameraRigProfileRef:
        "worldkit://camera-profile/orbit.quadruped-official@1",
      firstPersonCameraRigProfileRef:
        "worldkit://camera-profile/first-person.standard@1",
    });

    const productionKernels = installation.api.listMotionKernels?.() ?? [];
    const allKernels = installation.api.listMotionKernels?.({
      includeExperimental: true,
      includeInternal: true,
    }) ?? [];
    expect(
      productionKernels.every(
        (kernel) =>
          kernel.authoringAvailability !== "experimental" &&
          kernel.authoringAvailability !== "internal",
      ),
    ).toBe(true);
    expect(allKernels).toHaveLength(10);

    const compatibleProfiles = installation.api.listCompatibleProfiles?.(
      "worldkit://subject-definition/humanoid.g-bot@1",
    ) ?? [];
    for (const profile of compatibleProfiles.filter((candidate) =>
      candidate.kind === "control-feel-profile" ||
      candidate.kind === "control-profile"
    )) {
      expect(profile).not.toHaveProperty("parameters");
      expect(profile).not.toHaveProperty("safetyLimits");
      expect(profile).not.toHaveProperty("authoringRanges");
      expect(profile).not.toHaveProperty("runtimeParameterNames");
      expect(profile).not.toHaveProperty("draftOnlyParameterNames");
    }
  });

  it("lists only G Bot's allowed Control Feels, not the whole catalog", () => {
    const listed = listSubjectPresetAuthoringProfilesV1(
      "worldkit://subject-definition/humanoid.g-bot@1",
    );
    const feelRefs = listed
      .filter((profile) => profile.kind === "control-feel-profile")
      .map((profile) => profile.resourceRef)
      .sort();
    expect(feelRefs).toEqual([
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    ].sort());
    expect(feelRefs).not.toContain(
      "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1",
    );
    const catalogFeelCount = builtInSubjectResourceRegistry
      .listCapabilityResources()
      .filter((resource) => resource.kind === "control-feel-profile")
      .length;
    expect(catalogFeelCount).toBeGreaterThan(feelRefs.length);
  });

  it.each([
    [
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      "mount",
    ],
    [
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      "seat",
    ],
    [
      "worldkit://subject-definition/glider.paraglider.unpowered@1",
      "tether",
    ],
  ])("rejects %s when its %s relationship runtime is unavailable", async (
    subjectDefinitionRef,
  ) => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    expect(installation.api.validateSubjectPackage?.(subjectDefinitionRef)).toMatchObject({
      valid: false,
      diagnostics: [{ code: "SUBJECT_RELATIONSHIP_NOT_IMPLEMENTED" }],
    });
  });

  it("keeps the canonical G Bot package valid", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    expect(installation.api.validateSubjectPackage?.(
      "worldkit://subject-definition/humanoid.g-bot@1",
    )).toEqual({
      valid: true,
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1",
      diagnostics: [],
    });
  });

  it("rejects a package when an otherwise resolvable Motion Kernel is reserved", () => {
    const registry: SubjectResourceRegistryV3 = {
      ...builtInSubjectResourceRegistry,
      resolveMotionKernel(resourceRef) {
        const kernel = builtInSubjectResourceRegistry.resolveMotionKernel(resourceRef);
        return kernel === undefined ? undefined : {
          ...kernel,
          runtimeStatus: "reserved",
        };
      },
    };

    expect(validateSubjectPackageAgainstRegistry(
      registry,
      "worldkit://subject-definition/humanoid.g-bot@1",
    )).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "SUBJECT_KERNEL_NOT_IMPLEMENTED" }),
      ]),
    });
  });

  it("publishes stable read-only runtime layout evidence without exposing solver handles", async () => {
    const runtimeDiagnostics: readonly WorldkitBrowserDiagnosticV1[] = [
      {
        severity: "info",
        code: "WORLDKIT_LAYOUT_ASSERTION_SATISFIED",
        instancePath: "/layout/layoutAssertions/0",
        message: "Frozen layout assertion passed runtime validation.",
        details: {
          layoutSolveReportHash: `sha256:${"a".repeat(64)}`,
          constraintId: "spawn-supported",
          kind: "supported-by",
          evidenceEntityIds: ["spawn-main", "terrain-main"],
          measurements: { supportGapMeters: 0, supportRatio: 1 },
          tolerances: { maximumSupportGapMeters: 0.05, minimumSupportRatio: 1 },
        },
      },
    ];
    const adapter = adapterFixture(runtimeDiagnostics);
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });

    await expect(installation.initialization).resolves.toBe(adapter);
    const diagnostics = installation.api.getDiagnostics();
    expect(diagnostics).toEqual(runtimeDiagnostics);
    expect(installation.api.getDiagnostics()).toBe(diagnostics);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details?.measurements)).toBe(true);
    expect(Object.keys(installation.api).sort()).toEqual([
      "bindControl",
      "captureControlFrame",
      "captureScreenshot",
      "getControlCaptureCapabilities",
      "getDiagnostics",
      "getSnapshot",
      "ready",
      "reset",
      "runFixedInput",
      "setPaused",
      "version",
      "waitForRenderReady",
      "waitForSimulationTick",
    ]);
    expect(JSON.stringify(installation.api)).not.toMatch(/solve|search|repair|mutate/i);
  });

  it("forwards only guarded Subject Asset codes and publishes one stable diagnostic", async () => {
    const target: { __WORLDKIT__?: WorldkitBrowserApiV4 } = {};
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement,
      initialize: async () => {
        throw new SubjectAssetRuntimeErrorV1("SUBJECT_ASSET_HASH_MISMATCH", {
          subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
          artifactContentHash: `sha256:${"1".repeat(64)}`,
        });
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    const readyError = await installation.api.ready().catch((error: unknown) => error) as {
      code: string;
      diagnostic: unknown;
    };
    expect(readyError).toMatchObject({
      code: "SUBJECT_ASSET_HASH_MISMATCH",
    });
    expect(statusElement.dataset.worldkitStatus).toBe("error");
    const diagnostics = installation.api.getDiagnostics();
    expect(diagnostics).toEqual([
      {
        severity: "error",
        code: "SUBJECT_ASSET_HASH_MISMATCH",
        instancePath: "",
        message: "Subject Asset runtime initialization failed.",
      },
    ]);
    expect(installation.api.getDiagnostics()).toBe(diagnostics);
    expect(readyError.diagnostic).toBe(diagnostics[0]);
  });

  it("forwards only the guarded layout assertion failure without internal details", async () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => {
        throw new WorldRuntimeLayoutAssertionErrorV1();
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    await expect(installation.api.ready()).rejects.toMatchObject({
      code: "WORLDKIT_LAYOUT_ASSERTION_FAILED",
    });
    expect(installation.api.getDiagnostics()).toEqual([
      {
        severity: "error",
        code: "WORLDKIT_LAYOUT_ASSERTION_FAILED",
        instancePath: "",
        message: "Worldkit layout assertion validation failed.",
      },
    ]);
    expect(JSON.stringify(installation.api.getDiagnostics())).not.toContain(
      "frozen layout assertion",
    );
  });

  it("redacts unknown failures even when they imitate a Runtime code", async () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => {
        throw Object.assign(new Error("provider secret"), {
          code: "SUBJECT_ASSET_HASH_MISMATCH",
          cause: new Error("private cause"),
        });
      },
    });

    await installation.initialization;
    await expect(installation.api.ready()).rejects.toMatchObject({
      code: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    });
    const diagnosticsJson = JSON.stringify(installation.api.getDiagnostics());
    expect(installation.api.getDiagnostics()).toEqual([
      {
        severity: "error",
        code: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
        instancePath: "",
        message: "Worldkit runtime initialization failed.",
      },
    ]);
    expect(diagnosticsJson).not.toContain("provider secret");
    expect(diagnosticsJson).not.toContain("private cause");
  });

  it.each([
    "WORLDKIT_ROUTE_EVIDENCE_INVALID",
    "WORLDKIT_ROUTE_EVIDENCE_SOURCE_UNAVAILABLE",
    "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
    "WORLDKIT_ROUTE_EVIDENCE_REQUIRES_AUTHORING_V4",
  ])("preserves the trusted Host preflight diagnostic %s", async (code) => {
    const startupFailureDiagnostics: readonly WorldkitBrowserDiagnosticV1[] = [{
      severity: "error",
      code,
      instancePath: "/routeEvidence",
      message: "Trusted Host preflight rejected Route evidence.",
      details: { stage: "authoring-load" },
    }];
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      startupFailureDiagnostics,
      initialize: async () => {
        throw new Error("WORLDKIT_AUTHORING_LOAD_FAILED");
      },
    });

    await installation.initialization;
    const readyError = await installation.api.ready().catch(
      (error: unknown) => error,
    ) as { code: string; diagnostic: WorldkitBrowserDiagnosticV1 };
    expect(readyError.code).toBe(code);
    expect(installation.api.getDiagnostics()).toEqual(
      startupFailureDiagnostics,
    );
    expect(readyError.diagnostic).toBe(
      installation.api.getDiagnostics()[0],
    );
    expect(Object.isFrozen(installation.api.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(installation.api.getDiagnostics()[0]?.details)).toBe(
      true,
    );
    expect(JSON.stringify(installation.api.getDiagnostics())).not.toContain(
      "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    );
  });

  it("cleans a tracked Adapter when startup fails after Runtime creation", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        throw new Error("mount failed");
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    expect(adapter.disposeCount).toBe(1);
    await expect(installation.dispose()).resolves.toBeUndefined();
    expect(adapter.disposeCount).toBe(1);
  });
});
