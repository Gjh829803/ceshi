import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  SubjectAssetRuntimeErrorV1,
  WorldRuntimeLayoutAssertionErrorV1,
} from "@whitebox-world/runtime-babylon";
import type {
  ApplyCameraPreviewRequestV1,
  CameraPreviewStateV1,
  ControlCapturePassPayloadV1,
  FixedInputV1,
  WorldSessionEventsQueryResultV1,
  RuntimeActivityReceiptV1,
  RuntimeControlCaptureFrameV1,
  RouteEvidenceSelectorV1,
  WorldRuntimeSnapshotV4,
  WorldkitBrowserRouteEvidencePublicationV2,
  WorldkitBrowserApiV5,
  WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import type {
  GameplayCommandReceiptV1,
  GameplayCommandV1,
  GameplayEventV1,
  GameplayInspectionSnapshotV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  canonicalRouteOverlayV2,
  canonicalRoutePathReceiptV2,
  canonicalRouteRuntimeProbeReceiptV2,
  resolveTraversalGraphBuilderProfileV2,
} from "@whitebox-world/traversal";

import {
  installDeferredWorldkitBrowserApi,
  createWorldkitBrowserApiV5,
  listSubjectPresetAuthoringProfilesV1,
  validateSubjectPackageAgainstRegistry,
  type DeferredWorldkitBrowserRuntimeAdapterV1,
} from "./worldkit-browser-api";
import { initializePlaygroundAdapterV1 } from "./playground-adapter-startup";

async function availableLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a numeric loopback port.");
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
  return address.port;
}

async function waitForAuthoringPage(url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Unexpected Vite response ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error("Vite did not become ready.");
}

async function stopDirectViteProcess(
  vite: ReturnType<typeof spawn>,
): Promise<void> {
  if (vite.exitCode === null && vite.signalCode === null) {
    vite.kill();
    await once(vite, "exit");
  }
  if (vite.pid === undefined) throw new Error("Expected a Vite process id.");
  expect(() => process.kill(vite.pid!, 0)).toThrow();
}

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const HASH_F = `sha256:${"f".repeat(64)}` as const;
const WORLD_STATE_REF = `worldkit://world-state/world-state:${"c".repeat(64)}`;
const ROUTE_SELECTOR = {
  constraintId: "player-to-goal",
  routeId: "main-route",
} as const satisfies RouteEvidenceSelectorV1;
const GRAPH_BUILDER_PROFILE = resolveTraversalGraphBuilderProfileV2(
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
);

function joinToken(parts: readonly string[]): string {
  return parts.join("");
}

function routeEvidencePublicationFixture(): WorldkitBrowserRouteEvidencePublicationV2 {
  const traversalSurfaceIdentity = {
    traversalSurfaceId: "surface-main",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
    resolvedVersion: "1",
    resourceHash: HASH_A,
  } as const;
  const graphBuilderProfileRef = GRAPH_BUILDER_PROFILE.resourceRef;
  const graphBuilderResolvedVersion = GRAPH_BUILDER_PROFILE.resolvedVersion;
  const graphBuilderProfileHash = GRAPH_BUILDER_PROFILE.contentHash;
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
    schemaVersion: 2,
    geometryArtifactHash: HASH_A,
    traversalSurfaceIdentitiesById: {},
    authoringSpecHash: HASH_B,
    layoutSolveReportHash: HASH_C,
    resourceLockHash: HASH_D,
    terrainArtifactHash: HASH_E,
    colliderArtifactHash: HASH_F,
    surfaceArtifactHash: traversalSurfaceIdentity.resourceHash,
    routeBuildInputHash: HASH_B,
    resolvedTraversalLockHash: HASH_C,
    graphBuilderProfileRef,
    graphBuilderResolvedVersion,
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
  const routePathReceipt = canonicalRoutePathReceiptV2({
    kind: "route-path-receipt",
    schemaVersion: 2,
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
    orderedTraversalSurfaceIdentities: [
      traversalSurfaceIdentity,
      traversalSurfaceIdentity,
    ],
    graphBuilderProfileRef,
    graphBuilderResolvedVersion,
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
  });
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
  const routeRuntimeProbeReceipt = canonicalRouteRuntimeProbeReceiptV2({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "complete",
    request: {
      kind: "route-runtime-probe-request",
      schemaVersion: 2,
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
      walkSpeedMetersPerSecond: 4,
      positionQuantizationMeters:
        GRAPH_BUILDER_PROFILE.profile.positionQuantizationMeters,
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
  const routeOverlay = canonicalRouteOverlayV2({
    kind: "route-overlay",
    schemaVersion: 2,
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
    orderedTraversalSurfaceIdentities:
      routePathReceipt.orderedTraversalSurfaceIdentities,
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
    staticColliderIdentities: [],
  });
  return {
    kind: "worldkit-browser-route-evidence-publication",
    schemaVersion: 2,
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

function unreachableRouteEvidencePublicationFixture(): WorldkitBrowserRouteEvidencePublicationV2 {
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

function gameplayInspectionFixture(): GameplayInspectionSnapshotV1 {
  return {
    kind: "worldkit-gameplay-inspection-snapshot",
    schemaVersion: 1,
    projection: "inspection",
    id: "gameplay-inspection:world-session-test:0",
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
    phase: "ready",
    simulationTick: 0,
    participantStatesById: {},
    controllerStatesById: {},
    relationshipStatesById: {},
    activeActionStatesById: {},
    activatedGameplayFeatureRefs: [],
    lastEventSequence: 0,
  };
}

function snapshotFixture(action: "idle" | "walk" | "run" | "jump" = "idle"): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    world: {
      publicationEpoch: 1,
      simulationTick: 0,
      worldStateRef: WORLD_STATE_REF,
      worldStateHash: `sha256:${"c".repeat(64)}`,
      subjectStatesByEntityId: {
        "rigged-primary": {
          entityState: {
            id: "rigged-primary",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.rigged-golden@2",
            entityDefinitionHash: `sha256:${"1".repeat(64)}`,
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 0, 0],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: action === "idle" ? {} : {
            "locomotion:rigged-primary": {
              id: "locomotion:rigged-primary",
              kind: "locomotion-capability-state-v2",
              ownerEntityId: "rigged-primary",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: `sha256:${"2".repeat(64)}`,
              locomotion: action === "jump" ? {
                schemaVersion: 2,
                status: "active",
                mobilityMode: "airborne",
                gait: "none",
                verticalPhase: "rising",
                supportMode: "unsupported",
                movementMedium: "air",
                facingYawRadians: 0,
                linearVelocity: { x: 0, y: 2, z: 0 },
                horizontalSpeedMetersPerSecond: 0,
                committedTick: 5,
                phaseEnteredTick: 5,
                transitionSequence: 1,
              } : {
                schemaVersion: 2,
                status: "active",
                mobilityMode: "grounded",
                gait: action,
                verticalPhase: "none",
                supportMode: "supported",
                movementMedium: "ground",
                facingYawRadians: 0,
                linearVelocity: {
                  x: 0,
                  y: 0,
                  z: action === "run" ? 4 : 2,
                },
                horizontalSpeedMetersPerSecond: action === "run" ? 4 : 2,
                committedTick: 5,
                phaseEnteredTick: 5,
                transitionSequence: 1,
              },
            },
          },
        },
      },
      gameplayInspection: gameplayInspectionFixture(),
    },
    view: {
      viewStateRevision: 1,
      camera: {
        mode: "tracking",
        id: "camera-main",
        targetEntityId: "rigged-primary",
        positionMetersXYZ: [0, 0, 0],
        activeCameraProfileRef: "worldkit://camera-profile/orbit.default@1",
        activeCameraRigRef: "worldkit://camera-rig/orbit.default@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 9,
    },
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
    executeGameplayCommandRuntime: async () => ({
      status: "committed",
    }) as GameplayCommandReceiptV1,
    executeCameraViewCommandRuntime: async () => ({
      status: "committed",
    }) as import("@whitebox-world/runtime-contracts").CameraViewCommandReceiptV1,
    worldSessionEventsAfterRuntime: () => [],
    gameplayInspectionSnapshotRuntime: () => gameplayInspectionFixture(),
    worldStateSnapshotRuntime: () => undefined,
    acquireRuntimeActivityRuntime: (request) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: request.expectedWorldSessionId,
      runtimeActivityEpoch: 1,
      status: "active",
    }),
    releaseRuntimeActivityRuntime: (request) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: request.expectedWorldSessionId,
      runtimeActivityEpoch: 2,
      status: "released",
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
    resetRuntime: async () => snapshot,
    setPaused: () => undefined,
    adjustCameraViewRuntime: () => snapshot,
    resetCameraViewRuntime: () => snapshot,
    getCameraPreviewStateRuntime: () => ({
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef: "worldkit://camera-profile/orbit.default@1",
      activeCameraRigRef: "worldkit://camera-rig/orbit.default@1",
      activeCameraModifierRefs: [],
      tuningByProfileRef: {},
    }),
    applyCameraPreviewRuntime: () => ({
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef: "worldkit://camera-profile/orbit.default@1",
      activeCameraRigRef: "worldkit://camera-rig/orbit.default@1",
      activeCameraModifierRefs: [],
      tuningByProfileRef: {},
    }),
    applySubjectPresetTuningRuntime: () => ({
      status: "committed",
      snapshot,
    }),
    runSubjectHarness: async (subjectEntityId) => ({
      subjectEntityId,
      passed: true,
      checks: [],
      tick: 0,
    }),
    setMotionProfileRuntime: async () => snapshot,
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
  it("keeps Browser ready pending until the page setup barrier completes", async () => {
    const pageSetup = deferred<void>();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      readyBarrier: pageSetup.promise,
      initialize: async () => adapterFixture(),
    });
    let readySettled = false;
    const ready = installation.api.ready().finally(() => {
      readySettled = true;
    });

    await Promise.resolve();
    expect(readySettled).toBe(false);
    expect(installation.api.getDiagnostics()).toEqual([]);
    expect(() => installation.api.getSnapshot()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_NOT_READY" }),
    );

    pageSetup.resolve();
    await installation.initialization;
    await expect(ready).resolves.toEqual(snapshotFixture());
  });

  it("fails closed and disposes the Runtime Adapter when the page setup barrier rejects", async () => {
    const pageSetup = deferred<void>();
    const adapter = adapterFixture();
    const statusElement = { dataset: {} as Record<string, string> };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement,
      readyBarrier: pageSetup.promise,
      initialize: async () => adapter,
    });
    const command = installation.api.executeGameplayCommand({
      schemaVersion: 1,
      id: "command-before-page-ready",
      type: "control.bind",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      controllerEntityId: "controller-primary",
      controlledEntityId: "rigged-primary",
      expectedPossession: { mode: "unbound" },
    } as const satisfies GameplayCommandV1);

    pageSetup.reject(new Error("private page setup detail"));
    await installation.initialization;
    await expect(installation.api.ready()).rejects.toMatchObject({
      name: "WorldkitBrowserStartupErrorV1",
    });

    await expect(command).rejects.toMatchObject({
      name: "WorldkitBrowserStartupErrorV1",
    });
    expect(statusElement.dataset.worldkitStatus).toBe("error");
    expect(adapter.disposeCount).toBe(1);
    expect(installation.api.getDiagnostics()).toHaveLength(1);
    expect(JSON.stringify(installation.api.getDiagnostics())).not.toContain(
      "private page setup detail",
    );
  });

  it("publishes exactly the 38 mandatory V5 own enumerable keys", () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapterFixture(),
    });
    expect(Object.keys(installation.api).sort()).toEqual([
      "acquireRuntimeActivity",
      "adjustCameraView",
      "applyCameraPreview",
      "applySubjectPresetTuning",
      "captureControlFrame",
      "captureScreenshot",
      "executeCameraViewCommand",
      "executeGameplayCommand",
      "getCameraPreviewState",
      "getCameraSnapshot",
      "getControlCaptureCapabilities",
      "getDiagnostics",
      "getGameplayInspectionSnapshot",
      "getRouteOverlay",
      "getRoutePathReceipt",
      "getRouteRuntimeProbeReceipt",
      "getRouteSummary",
      "getSnapshot",
      "getSubjectPresetBaseline",
      "getSubjectSnapshot",
      "getWorldSessionEvents",
      "getWorldStateSnapshot",
      "listCompatibleProfiles",
      "listMotionKernels",
      "listSubjectDefinitions",
      "ready",
      "releaseRuntimeActivity",
      "reset",
      "resetCameraView",
      "runFixedInput",
      "runHarness",
      "setIntent",
      "setMotionProfile",
      "setPaused",
      "validateSubjectPackage",
      "version",
      "waitForRenderReady",
      "waitForSimulationTick",
    ]);
    expect(installation.api).not.toHaveProperty("bindControl");
  });

  it("forwards Gameplay command, inspection, World State, and Activity through the V5 bridge", async () => {
    const adapter = adapterFixture();
    const command = {
      schemaVersion: 1,
      id: "command-bind",
      type: "control.bind",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      controllerEntityId: "controller-primary",
      controlledEntityId: "rigged-primary",
      expectedPossession: { mode: "unbound" },
    } as const satisfies GameplayCommandV1;
    const receipt = { status: "committed" } as GameplayCommandReceiptV1;
    const worldState = {
      id: `world-state:${"c".repeat(64)}`,
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
    } as unknown as WorldStateSnapshotV1;
    const commandInputs: GameplayCommandV1[] = [];
    const worldStateRefs: string[] = [];
    adapter.executeGameplayCommandRuntime = async (input) => {
      commandInputs.push(input);
      return receipt;
    };
    adapter.worldStateSnapshotRuntime = (worldStateRef) => {
      worldStateRefs.push(worldStateRef);
      return worldState;
    };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;

    await expect(installation.api.executeGameplayCommand(command)).resolves.toBe(receipt);
    expect(commandInputs).toEqual([command]);
    expect(installation.api.getGameplayInspectionSnapshot()).toEqual(
      gameplayInspectionFixture(),
    );
    expect(installation.api.getWorldStateSnapshot({
      worldStateRef: WORLD_STATE_REF,
    })).toBe(worldState);
    expect(worldStateRefs).toEqual([WORLD_STATE_REF]);
    const activityRequest = {
      schemaVersion: 1,
      id: "take-1",
      activityKind: "simulation-take",
      expectedWorldSessionId: "world-session-test",
    } as const;
    expect(installation.api.acquireRuntimeActivity(activityRequest)).toMatchObject({
      requestId: "take-1",
      status: "active",
    });
    expect(installation.api.releaseRuntimeActivity(activityRequest)).toMatchObject({
      requestId: "take-1",
      status: "released",
    });
  });

  it("paginates Gameplay Events with an exclusive validated cursor", async () => {
    const events = [1, 2, 3].map((sequence): GameplayEventV1 => ({
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: `gameplay-event:world-session-test:${sequence}`,
      type: "world.failed",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      sequence,
      simulationTick: sequence,
      diagnostic: { code: "WORLD_SESSION_FAILED", message: "fixture" },
    }));
    const adapter = adapterFixture();
    const observedQueries: [number, number][] = [];
    adapter.worldSessionEventsAfterRuntime = (afterEventSequence, maximumEventCount) => {
      observedQueries.push([afterEventSequence, maximumEventCount]);
      return events.filter(({ sequence }) => sequence > afterEventSequence)
        .slice(0, maximumEventCount);
    };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;

    expect(installation.api.getWorldSessionEvents({
      afterEventSequence: 0,
      maximumEventCount: 2,
    })).toEqual({
      events: events.slice(0, 2),
      nextAfterEventSequence: 2,
      hasMore: true,
    } satisfies WorldSessionEventsQueryResultV1);
    expect(installation.api.getWorldSessionEvents({
      afterEventSequence: 2,
      maximumEventCount: 2,
    })).toEqual({
      events: [events[2]],
      nextAfterEventSequence: 3,
      hasMore: false,
    });
    expect(installation.api.getWorldSessionEvents({
      afterEventSequence: 3,
      maximumEventCount: 2,
    })).toEqual({
      events: [],
      nextAfterEventSequence: 3,
      hasMore: false,
    });
    expect(observedQueries).toEqual([[0, 3], [2, 3], [3, 3]]);

    for (const invalidQuery of [
      { afterEventSequence: -1, maximumEventCount: 1 },
      { afterEventSequence: 0, maximumEventCount: 0 },
      { afterEventSequence: 0, maximumEventCount: 257 },
      { afterEventSequence: 0, maximumEventCount: 1, providerHandle: "secret" },
    ]) {
      expect(() => installation.api.getWorldSessionEvents(invalidQuery)).toThrowError(
        expect.objectContaining({ code: "WORLDKIT_GAMEPLAY_EVENTS_QUERY_INVALID" }),
      );
    }
    const accessorQuery = Object.defineProperty({ maximumEventCount: 1 },
      "afterEventSequence", {
        enumerable: true,
        get: () => {
          throw new Error("must not execute");
        },
      });
    expect(() => installation.api.getWorldSessionEvents(accessorQuery as never))
      .toThrowError(expect.objectContaining({
        code: "WORLDKIT_GAMEPLAY_EVENTS_QUERY_INVALID",
      }));
  });

  it("rejects malformed and unavailable World State and Activity requests", async () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapterFixture(),
    });
    await installation.initialization;

    expect(() => installation.api.getWorldStateSnapshot({
      worldStateRef: `worldkit://world-state/world-state:${"d".repeat(64)}`,
    })).toThrowError(expect.objectContaining({
      code: "WORLDKIT_WORLD_STATE_SNAPSHOT_NOT_FOUND",
    }));
    expect(() => installation.api.getWorldStateSnapshot({
      worldStateRef: "missing",
      providerHandle: "secret",
    } as never)).toThrowError(expect.objectContaining({
      code: "WORLDKIT_WORLD_STATE_SNAPSHOT_REQUEST_INVALID",
    }));
    expect(() => installation.api.acquireRuntimeActivity({
      schemaVersion: 1,
      id: "",
      activityKind: "simulation-take",
      expectedWorldSessionId: "world-session-test",
    })).toThrowError(expect.objectContaining({
      code: "WORLDKIT_RUNTIME_ACTIVITY_REQUEST_INVALID",
    }));
  });

  it("sanitizes Adapter failures without exposing provider messages", async () => {
    const adapter = adapterFixture();
    adapter.executeGameplayCommandRuntime = async () => {
      throw new Error("recast native pointer 0xdeadbeef");
    };
    adapter.runWorldkitFixedInput = async () => {
      throw new Error("havok internal body handle");
    };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;
    const command = {
      schemaVersion: 1,
      id: "command-bind",
      type: "control.bind",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      controllerEntityId: "controller-primary",
      controlledEntityId: "rigged-primary",
      expectedPossession: { mode: "unbound" },
    } as const satisfies GameplayCommandV1;

    const commandError = await installation.api.executeGameplayCommand(command)
      .catch((error: unknown) => error) as {
        code: string;
        diagnostic: WorldkitBrowserDiagnosticV1;
      };
    expect(commandError.code).toBe("WORLDKIT_GAMEPLAY_COMMAND_EXECUTION_FAILED");
    expect(JSON.stringify(commandError)).not.toMatch(/recast|pointer|0xdeadbeef/i);
    const fixedInputError = await installation.api.runFixedInput([])
      .catch((error: unknown) => error) as {
        code: string;
        diagnostic: WorldkitBrowserDiagnosticV1;
      };
    expect(fixedInputError.code).toBe("WORLDKIT_FIXED_INPUT_EXECUTION_FAILED");
    expect(JSON.stringify(fixedInputError)).not.toMatch(/havok|body handle/i);
  });

  it("fails closed when the Adapter violates Gameplay Event ordering or Session ownership", async () => {
    const adapter = adapterFixture();
    const malformedEvent = (sequence: number, worldSessionId: string): GameplayEventV1 => ({
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: `gameplay-event:${worldSessionId}:${sequence}`,
      type: "world.failed",
      runtimeSessionId: "runtime-session-test",
      worldSessionId,
      sequence,
      simulationTick: sequence,
      diagnostic: { code: "WORLD_SESSION_FAILED", message: "fixture" },
    });
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;

    adapter.worldSessionEventsAfterRuntime = () => [
      malformedEvent(2, "world-session-test"),
      malformedEvent(1, "world-session-test"),
    ];
    expect(() => installation.api.getWorldSessionEvents({
      afterEventSequence: 0,
      maximumEventCount: 2,
    })).toThrowError(expect.objectContaining({
      code: "WORLDKIT_WORLD_SESSION_EVENTS_PROTOCOL_INVALID",
    }));
    adapter.worldSessionEventsAfterRuntime = () => [
      malformedEvent(1, "world-session-other"),
    ];
    expect(() => installation.api.getWorldSessionEvents({
      afterEventSequence: 0,
      maximumEventCount: 2,
    })).toThrowError(expect.objectContaining({
      code: "WORLDKIT_WORLD_SESSION_EVENTS_PROTOCOL_INVALID",
    }));
  });

  it("blocks Runtime observation while asynchronous reset is pending", async () => {
    const resetGate = deferred<WorldRuntimeSnapshotV4>();
    const adapter = adapterFixture();
    adapter.resetRuntime = () => resetGate.promise;
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;

    const resetPromise = installation.api.reset();
    expect(() => installation.api.getSnapshot()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_RESET_IN_PROGRESS" }),
    );
    expect(() => installation.api.getGameplayInspectionSnapshot()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_RESET_IN_PROGRESS" }),
    );
    await expect(installation.api.runFixedInput([])).rejects.toMatchObject({
      code: "WORLDKIT_RUNTIME_RESET_IN_PROGRESS",
    });
    expect(() => installation.api.reset()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_RESET_IN_PROGRESS" }),
    );

    const replacementSnapshot = {
      ...snapshotFixture(),
      worldSessionId: "world-session-replacement",
    };
    resetGate.resolve(replacementSnapshot);
    await expect(resetPromise).resolves.toBe(replacementSnapshot);
    expect(installation.api.getSnapshot()).toBe(adapter.runtimeSnapshot());
  });

  it("forwards Camera View Preference and preview calls through the single Browser V5 protocol", async () => {
    const requestedPreferences: unknown[] = [];
    const previewRequests: ApplyCameraPreviewRequestV1[] = [];
    let resetCallCount = 0;
    let previewReadCount = 0;
    const previewState: CameraPreviewStateV1 = {
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef:
        "worldkit://camera-profile/orbit.humanoid-official@1",
      activeCameraRigRef: "worldkit://camera-rig/orbit-third-person@1",
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/collision-retraction@1",
      ],
      tuningByProfileRef: {
        "worldkit://camera-profile/orbit.humanoid-official@1": {
          distanceMeters: 4.5,
          pitchRadians: 0.2,
        },
      },
    };
    const appliedPreviewState: CameraPreviewStateV1 = {
      ...previewState,
      tuningByProfileRef: {
        "worldkit://camera-profile/orbit.humanoid-official@1": {
          distanceMeters: 5.25,
        },
      },
    };
    const previewRequest: ApplyCameraPreviewRequestV1 = {
      tuningByProfileRef: appliedPreviewState.tuningByProfileRef,
    };
    const adapter = adapterFixture();
    adapter.executeCameraViewCommandRuntime = async (command) => {
      if (command.type === "view.camera-preference.set") {
        requestedPreferences.push(command.cameraViewPreference);
      } else {
        resetCallCount += 1;
      }
      return ({ status: "committed" }) as
        import("@whitebox-world/runtime-contracts").CameraViewCommandReceiptV1;
    };
    adapter.getCameraPreviewStateRuntime = () => {
      previewReadCount += 1;
      return previewState;
    };
    adapter.applyCameraPreviewRuntime = (request) => {
      previewRequests.push(request);
      return appliedPreviewState;
    };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => adapter,
    });
    await installation.initialization;

    const profileRef = "worldkit://camera-profile/first-person.standard@1";
    await installation.api.executeCameraViewCommand({
      type: "view.camera-preference.set",
      schemaVersion: 1,
      id: "camera-command-set",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      cameraEntityId: "camera.local-player",
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: profileRef,
      },
    });
    expect(requestedPreferences).toEqual([{
      mode: "camera-rig-profile",
      cameraRigProfileRef: profileRef,
    }]);
    await installation.api.executeCameraViewCommand({
      type: "view.camera-preference.reset",
      schemaVersion: 1,
      id: "camera-command-reset",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-test",
      cameraEntityId: "camera.local-player",
    });
    expect(resetCallCount).toBe(1);
    expect(installation.api.getCameraPreviewState?.()).toBe(previewState);
    expect(previewReadCount).toBe(1);
    expect(installation.api.applyCameraPreview?.(previewRequest)).toBe(
      appliedPreviewState,
    );
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toBe(previewRequest);
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
      routeEvidencePublication: WorldkitBrowserRouteEvidencePublicationV2,
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
    } as unknown as WorldkitBrowserRouteEvidencePublicationV2)).toThrow(
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
    } as unknown as WorldkitBrowserRouteEvidencePublicationV2)).toThrow(
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
      routeEvidencePublication: WorldkitBrowserRouteEvidencePublicationV2,
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
    const install = (routes: WorldkitBrowserRouteEvidencePublicationV2["routes"]) =>
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
    const target: { __WORLDKIT__?: WorldkitBrowserApiV5 } = {};
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
    await expect(api.waitForSimulationTick(0)).resolves.toMatchObject({
      world: { simulationTick: 0 },
    });
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
      "worldkit://subject-definition/humanoid.g-bot@2",
    ]);
    const gBotSummary = productionDefinitions.find(
      (definition) =>
        definition.resourceRef ===
        "worldkit://subject-definition/humanoid.g-bot@2",
    );
    expect(gBotSummary?.contentHash).toBe(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.g-bot@2",
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
      "worldkit://subject-definition/humanoid.g-bot@2",
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
      "worldkit://subject-definition/humanoid.g-bot@2",
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
      .listDiscoverableResources({ kind: "control-feel-profile" })
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
      "worldkit://subject-definition/humanoid.g-bot@2",
    )).toEqual({
      valid: true,
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
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
      "worldkit://subject-definition/humanoid.g-bot@2",
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
    expect(Object.keys(installation.api)).toHaveLength(38);
    expect(installation.api).not.toHaveProperty("bindControl");
    expect(JSON.stringify(installation.api)).not.toMatch(/solve|search|repair|mutate/i);
  });

  it("forwards only guarded Subject Asset codes and publishes one stable diagnostic", async () => {
    const target: { __WORLDKIT__?: WorldkitBrowserApiV5 } = {};
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement,
      initialize: async () => {
        throw new SubjectAssetRuntimeErrorV1("SUBJECT_ASSET_HASH_MISMATCH", {
          subjectAssetRef: "worldkit://subject-asset/humanoid.golden@2",
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

  it("pauses simulation before mount and publishes the resumed ready state", async () => {
    const pageSetup = deferred<void>();
    const events: string[] = [];
    const initialSnapshot = snapshotFixture();
    let paused = false;
    const adapter = Object.assign(adapterFixture(), {
      configureVisualCaptureGroups() {
        events.push("configure");
        return [];
      },
      setPaused(nextPaused: boolean) {
        paused = nextPaused;
        events.push(nextPaused ? "pause" : "unpause");
      },
      mount() {
        events.push("mount");
      },
      render() {
        events.push("render");
      },
      runtimeSnapshot() {
        events.push("snapshot");
        return {
          ...initialSnapshot,
          runtime: {
            ...initialSnapshot.runtime,
            isPaused: paused,
          },
        };
      },
    });
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      readyBarrier: pageSetup.promise,
      initialize: async ({ trackAdapter }) => initializePlaygroundAdapterV1<
        typeof adapter
      >({
        adapter,
        visualCaptureGroups: [],
        viewport: {} as HTMLElement,
        trackAdapter,
        setStartupStage: () => undefined,
      }),
    });

    await Promise.resolve();
    expect(events).toEqual(["pause", "mount", "render"]);

    pageSetup.resolve();
    const readySnapshot = await installation.api.ready();
    expect(readySnapshot.runtime.isPaused).toBe(false);
    expect(adapter.runtimeSnapshot().runtime.isPaused).toBe(false);
    expect(events).toEqual([
      "pause",
      "mount",
      "render",
      "unpause",
      "snapshot",
      "snapshot",
    ]);
  });

  it("owns the playground Adapter before visual target configuration can fail", async () => {
    const adapter = Object.assign(adapterFixture(), {
      configureVisualCaptureGroups: () => {
        throw new Error("WORLDKIT_CAPTURE_TARGET_NOT_FOUND: missing");
      },
      mount: () => {
        throw new Error("mount must not run");
      },
      render: () => {
        throw new Error("render must not run");
      },
    });
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement,
      initialize: async ({ trackAdapter }) => initializePlaygroundAdapterV1<
        typeof adapter
      >({
        adapter,
        visualCaptureGroups: [{
          visualTargetId: "missing-target",
          runtimeEntityIds: ["missing"],
          role: "primary-subject",
          semanticClassId: "subject.missing",
          identityColor: "#E85D5D",
        }],
        viewport: {} as HTMLElement,
        trackAdapter,
        setStartupStage: () => undefined,
      }),
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    expect(statusElement.dataset.worldkitStatus).toBe("error");
    expect(adapter.disposeCount).toBe(1);
  });
});

describe("createWorldkitBrowserApiV5", () => {
  const V5_REQUIRED_METHODS = [
    "ready",
    "getSnapshot",
    "getDiagnostics",
    "executeGameplayCommand",
    "executeCameraViewCommand",
    "runFixedInput",
    "getWorldSessionEvents",
    "getGameplayInspectionSnapshot",
    "getWorldStateSnapshot",
    "acquireRuntimeActivity",
    "releaseRuntimeActivity",
    "getControlCaptureCapabilities",
    "waitForSimulationTick",
    "waitForRenderReady",
    "captureControlFrame",
    "captureScreenshot",
    "reset",
    "setPaused",
    "getRouteSummary",
    "getRoutePathReceipt",
    "getRouteRuntimeProbeReceipt",
    "getRouteOverlay",
  ] as const;

  it("preserves prior Browser methods, installs V5 on window.__WORLDKIT__, and deep-freezes Route Evidence", () => {
    const api = createWorldkitBrowserApiV5({});
    expect(api.version).toBe(5);
    expect(Object.keys(api)).toHaveLength(38);
    expect(api).not.toHaveProperty("bindControl");
    for (const methodName of V5_REQUIRED_METHODS) {
      expect(typeof api[methodName]).toBe("function");
    }
    const target: { __WORLDKIT__?: WorldkitBrowserApiV5 } = {};
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement: { dataset: {} },
      initialize: async () => adapterFixture(),
    });
    expect(target.__WORLDKIT__).toBe(installation.api);
    expect(target.__WORLDKIT__?.version).toBe(5);
    expect(api).not.toBe(target.__WORLDKIT__);

    const selector = { constraintId: "player-to-goal", routeId: "main-route" };
    const summary = api.getRouteSummary(selector);
    const path = api.getRoutePathReceipt(selector);
    const overlay = api.getRouteOverlay(selector);
    expect(summary.availability).toBe("unavailable");
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(path)).toBe(true);
    expect(Object.isFrozen(overlay)).toBe(true);
    expect(JSON.stringify({ summary, path, overlay })).not.toMatch(
      /recast|babylon|nativeHandle|providerHandle|providerPolygonRef/i,
    );
  });

  it("rejects leftover V1 Path/Overlay fields on a V2 publication", () => {
    const source = routeEvidencePublicationFixture();
    const route = source.routes[0]!;
    const surfaceIdentity = route.routePathReceipt!
      .orderedTraversalSurfaceIdentities[0]!;
    const legacySurfaceIdentityField = joinToken([
      "traversal",
      "Surface",
      "Identity",
    ]);
    const legacyBlockingColliderIdentitiesField = joinToken([
      "blocking",
      "Collider",
      "Identities",
    ]);
    const forgedRoutes = [
      {
        ...route,
        routePathReceipt: {
          ...route.routePathReceipt!,
          [legacySurfaceIdentityField]: surfaceIdentity,
        },
      },
      {
        ...route,
        routeOverlay: {
          ...route.routeOverlay!,
          [legacySurfaceIdentityField]: surfaceIdentity,
          [legacyBlockingColliderIdentitiesField]: [],
        },
      },
    ];

    for (const forgedRoute of forgedRoutes) {
      expect(() => createWorldkitBrowserApiV5({
        routeEvidencePublication: {
          ...source,
          routes: [forgedRoute],
        } as unknown as WorldkitBrowserRouteEvidencePublicationV2,
      })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    }
  });

  it("includes canonical Camera tuning safety limits in Authoring profile discovery", () => {
    const listed = listSubjectPresetAuthoringProfilesV1(
      "worldkit://subject-definition/humanoid.g-bot@2",
    );
    const orbit = listed.find((profile) =>
      profile.resourceRef === "worldkit://camera-profile/orbit.medium@1"
    );

    expect(orbit?.safetyLimits).toMatchObject({
      distanceMeters: { minimum: 0, maximum: 30 },
      baseFovDegrees: { minimum: 35, maximum: 100 },
    });
  });
});

describe("Authoring camera console", () => {
  it("keeps subject and camera context available while toggling the docked 3C tuning rail", async () => {
    const port = await availableLoopbackPort();
    const worktreeRoot = resolve(import.meta.dirname, "../../..");
    const vite = spawn(
      process.execPath,
      [
        resolve(worktreeRoot, "node_modules/vite/bin/vite.js"),
        "--config",
        "vite.config.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve(worktreeRoot, "apps/playground"),
        env: {
          ...process.env,
          WORLDKIT_AUTHORING_SPEC_PATH: resolve(
            worktreeRoot,
            "examples/authoring/g-bot-subject-world.json",
          ),
        },
        stdio: "pipe",
      },
    );
    expect(vite.spawnfile).toBe(process.execPath);
    let viteOutput = "";
    vite.stdout?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    vite.stderr?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const url = `http://127.0.0.1:${port}/`;
      await waitForAuthoringPage(url);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
      await page.addInitScript(() => {
        localStorage.clear();
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("#authoring-context-bar:not([hidden])").waitFor({ timeout: 45_000 });

      for (const selector of [
        "#open-tuning-button",
        "#reset-button",
        "#record-button",
        "#capture-button",
      ]) {
        expect(await page.locator(selector).isVisible()).toBe(true);
      }
      expect(await page.locator("#open-tuning-button").textContent()).toBe("调参台");
      expect(await page.locator("#tuning-layer").isVisible()).toBe(true);
      expect(await page.locator("body").evaluate((body) => body.classList.contains("tuning-open")))
        .toBe(true);
      expect(await page.locator("#subject-package-select").isVisible()).toBe(true);
      expect(await page.locator("#camera-first-person-button").count()).toBe(0);
      expect(await page.locator("#camera-third-person-button").isVisible()).toBe(true);
      expect(await page.locator("#camera-third-person-button").getAttribute("aria-pressed"))
        .toBe("true");
      expect(await page.locator("#camera-preference-select option").evaluateAll(
        (options) => options.map((option) => (option as HTMLOptionElement).value),
      )).toEqual(["worldkit://camera-profile/orbit.medium@1"]);
      expect(await page.locator("#viewport-aspect-select").isVisible()).toBe(true);
      expect(await page.locator("#viewport-aspect-select option").evaluateAll(
        (options) => options.map((option) => (option as HTMLOptionElement).value),
      )).toEqual(["free", "16:9", "16:10", "4:3", "21:9"]);
      expect(await page.locator("#tuning-tab-movement").getAttribute("aria-selected"))
        .toBe("true");
      expect(await page.locator("#tuning-panel-movement").isVisible()).toBe(true);
      expect(await page.locator("#tuning-motion-sliders").textContent()).not.toContain("仅草稿");
      expect(await page.locator("#tuning-motion-sliders").textContent()).not.toContain("转向速度");
      expect(await page.locator("#tuning-motion-advanced-sliders").textContent())
        .toContain("移动输入曲线");
      expect(await page.locator("#movement-parameter-boundary").textContent())
        .toContain("导出并重新编译后生效");
      expect(await page.locator("#tuning-control-sliders").count()).toBe(0);
      expect(await page.getByText("移动输入死区").count()).toBe(0);
      expect(await page.locator("#quick-run-button").isVisible()).toBe(true);
      expect(await page.locator("#runtime-speed").textContent()).toBe("0.0 m/s");
      expect(await page.locator("#runtime-gait").textContent()).toBe("IDLE");
      expect(await page.locator("#runtime-medium").textContent()).toBe("GROUND");
      expect(await page.locator("#runtime-support").textContent()).toBe("SUPPORTED");

      await page.locator("#open-tuning-button").click();
      expect(await page.locator("#tuning-layer").isHidden()).toBe(true);
      expect(await page.locator("#authoring-context-bar").isVisible()).toBe(true);
      expect(await page.locator("#subject-package-select").isVisible()).toBe(true);
      expect(await page.locator("#open-tuning-button").getAttribute("aria-expanded"))
        .toBe("false");

      await page.locator("#viewport-aspect-select").selectOption("4:3");
      await expect.poll(async () => {
        const box = await page.locator("#viewport").boundingBox();
        return box === null ? 0 : box.width / box.height;
      }).toBeCloseTo(4 / 3, 2);
      expect(await page.evaluate(() => localStorage.getItem("worldkit.viewport-aspect-ratio")))
        .toBe("4:3");
      await page.locator("#viewport-aspect-select").selectOption("free");
      await expect.poll(async () => {
        const [stage, viewport] = await Promise.all([
          page.locator("#viewport-stage").boundingBox(),
          page.locator("#viewport").boundingBox(),
        ]);
        return stage !== null && viewport !== null
          ? Math.max(
              Math.abs(stage.width - viewport.width),
              Math.abs(stage.height - viewport.height),
            )
          : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(1);

      await page.locator("#more-actions-button").click();
      expect(await page.locator("#more-actions-menu").isVisible()).toBe(true);
      await page.locator('[data-action-proxy="#smoke-button"]').click();
      await expect.poll(
        async () => page.locator("#recording-toast").textContent(),
        { timeout: 30_000 },
      ).toMatch(/^固定输入 Smoke (通过|未通过|失败)/);
      expect(await page.locator("#recording-toast").isVisible()).toBe(true);

      await page.locator("#quick-run-button").click();
      await expect.poll(async () => page.locator("#tuning-save-status").textContent())
        .toContain("“奔跑”测试完成");

      await page.locator("#open-tuning-button").click();
      expect(await page.locator("#tuning-layer").isVisible()).toBe(true);
      await page.locator("#tuning-tab-camera").click();
      expect(await page.locator("#tuning-tab-camera").getAttribute("aria-selected"))
        .toBe("true");
      expect(await page.locator("#tuning-panel-camera").isVisible()).toBe(true);
      expect(await page.locator("#tuning-panel-movement").isHidden()).toBe(true);
    } catch (error) {
      throw new Error(
        `AUTHORING_3C_WORKBENCH_E2E_FAILED: ${viteOutput.slice(-4_000)}`,
        { cause: error },
      );
    } finally {
      await browser?.close();
      await stopDirectViteProcess(vite);
    }
  }, 120_000);

  it("reapplies the selected Golden camera preference after Reset when gameplay tuning is compiler-locked", async () => {
    const port = await availableLoopbackPort();
    const worktreeRoot = resolve(import.meta.dirname, "../../..");
    const vite = spawn(
      process.execPath,
      [
        resolve(worktreeRoot, "node_modules/vite/bin/vite.js"),
        "--config",
        "vite.config.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve(worktreeRoot, "apps/playground"),
        env: {
          ...process.env,
          WORLDKIT_AUTHORING_SPEC_PATH: resolve(
            worktreeRoot,
            "examples/authoring/rigged-subject-world.json",
          ),
        },
        stdio: "pipe",
      },
    );
    expect(vite.spawnfile).toBe(process.execPath);
    let viteOutput = "";
    vite.stdout?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    vite.stderr?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const url = `http://127.0.0.1:${port}/`;
      await waitForAuthoringPage(url);
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.clear();
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("#open-tuning-button:not([hidden])").waitFor({ timeout: 45_000 });

      const orbitProfileRef = "worldkit://camera-profile/orbit.medium@1";
      expect(await page.locator("#camera-preference-select").inputValue()).toBe(orbitProfileRef);
      expect(await page.evaluate(() => {
        const camera = window.__WORLDKIT__!.getCameraSnapshot?.();
        return camera?.mode === "tracking" ? camera.activeCameraProfileRef : undefined;
      })).toBe(orbitProfileRef);

      await page.locator("#reset-button").click();

      expect(await page.locator("#camera-preference-select").inputValue()).toBe(orbitProfileRef);
      await expect.poll(() => page.locator("#reset-button").isEnabled()).toBe(true);
      expect(await page.locator("#tuning-save-status").textContent())
        .toBe("重置后已恢复镜头；Gameplay 继续使用编译锁定的 Canonical Scene Plan");
      expect(await page.evaluate(() => {
        const camera = window.__WORLDKIT__!.getCameraSnapshot?.();
        return camera?.mode === "tracking" ? camera.activeCameraProfileRef : undefined;
      })).toBe(orbitProfileRef);
    } catch (error) {
      throw new Error(
        `AUTHORING_CAMERA_RESET_E2E_FAILED: ${viteOutput.slice(-4_000)}`,
        { cause: error },
      );
    } finally {
      await browser?.close();
      await stopDirectViteProcess(vite);
    }
  }, 120_000);

  it("exposes only the supported third-person workbench, Follow Arm controls, and runtime telemetry", async () => {
    const port = await availableLoopbackPort();
    const worktreeRoot = resolve(import.meta.dirname, "../../..");
    const vite = spawn(
      process.execPath,
      [
        resolve(worktreeRoot, "node_modules/vite/bin/vite.js"),
        "--config",
        "vite.config.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve(worktreeRoot, "apps/playground"),
        env: {
          ...process.env,
          WORLDKIT_AUTHORING_SPEC_PATH: resolve(
            worktreeRoot,
            "examples/authoring/g-bot-subject-world.json",
          ),
        },
        stdio: "pipe",
      },
    );
    expect(vite.spawnfile).toBe(process.execPath);
    let viteOutput = "";
    vite.stdout?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    vite.stderr?.on("data", (chunk: Buffer) => {
      viteOutput += chunk.toString();
    });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const url = `http://127.0.0.1:${port}/`;
      await waitForAuthoringPage(url);
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.removeItem("worldkit.camera-preference");
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("#open-tuning-button:not([hidden])").waitFor({ timeout: 45_000 });
      expect(await page.locator("#camera-preference-select").inputValue())
        .toBe("worldkit://camera-profile/orbit.medium@1");
      expect(await page.evaluate(() => {
        const camera = window.__WORLDKIT__!.getCameraSnapshot?.();
        return camera?.mode === "tracking" ? camera.activeCameraProfileRef : undefined;
      }))
        .toBe("worldkit://camera-profile/orbit.medium@1");
      const subjectLockDomains = await page.evaluate(() => {
        const api = window.__WORLDKIT__!;
        const relationships = Object.values(
          api.getSnapshot().world.gameplayInspection.relationshipStatesById,
        ).filter((candidate) =>
          candidate.type === "possessedBy" &&
          candidate.controllerEntityId === "controller-primary"
        );
        if (relationships.length !== 1 || relationships[0]?.type !== "possessedBy") {
          throw new Error("Expected one controller-primary possession relationship.");
        }
        const relationship = relationships[0]!;
        const controlledEntityId = relationship.controlledEntityId;
        const subject = api.getSubjectSnapshot?.(controlledEntityId);
        const runtimeRef = subject?.entityState.entityDefinitionRef;
        const baseline = runtimeRef === undefined
          ? undefined
          : api.getSubjectPresetBaseline?.(runtimeRef);
        return {
          runtimeRef,
          runtimeHash: subject?.entityState.entityDefinitionHash,
          registryRef: baseline?.closure.subjectDefinitionRef,
          registryHash: baseline?.closure.subjectDefinitionContentHash,
        };
      });
      expect(subjectLockDomains.runtimeRef).toBe(subjectLockDomains.registryRef);
      expect(subjectLockDomains.runtimeHash).toMatch(/^sha256:/);
      expect(subjectLockDomains.registryHash).toMatch(/^sha256:/);
      await page.locator("#tuning-tab-camera").click();
      await page.locator("#tuning-camera-cards article").first().waitFor();

      const inputDebug = page.locator("#tuning-camera-input-debug");
      expect(await inputDebug.textContent()).toContain("最大偏航 0.025 rad / fixed tick");
      expect(await inputDebug.textContent()).toContain("最大俯仰 0.015 rad / fixed tick");
      expect(await inputDebug.textContent()).toContain("加速 0.20 s");
      expect(await inputDebug.textContent()).toContain("减速 0.15 s");
      expect(await inputDebug.textContent()).toContain("最后清除 startup");
      await page.keyboard.down("ArrowLeft");
      await expect.poll(async () => page.locator(
        '[data-camera-input-diagnostic="当前偏航速度"]',
      ).textContent()).not.toBe("0.000000 rad / fixed tick");
      await page.keyboard.up("ArrowLeft");

      const profileRefs = await page.locator("#tuning-camera-cards article")
        .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-camera-profile-ref")));
      expect(profileRefs).toEqual([
        "worldkit://camera-profile/orbit.medium@1",
      ]);

      await expect.poll(async () => page.locator('[data-camera-group="follow-arm"]').count())
        .toBe(1);
      expect(await page.locator('[data-camera-control="shoulderOffsetMeters"]').count()).toBe(0);
      expect(await page.locator('[data-camera-control="positionDampingPerSecond"]').count()).toBe(1);
      expect(await page.locator('[data-camera-control="rotationDampingPerSecond"]').count()).toBe(1);
      expect(await page.locator("#tuning-camera-basic [data-camera-control]").evaluateAll(
        (controls) => controls.map((control) => control.getAttribute("data-camera-control")),
      )).toEqual([
        "distanceMeters",
        "pitchRadians",
        "baseFovDegrees",
        "lookSensitivityXRatio",
        "lookSensitivityYRatio",
      ]);
      expect(await page.locator('[data-camera-control="targetHeightMeters"]').count()).toBe(0);
      expect(await page.locator('[data-camera-control="baseFovDegrees"] strong').textContent())
        .toBe("视野角（FOV）");
      expect(await page.locator("#tuning-camera-basic .parameter-help-button").count()).toBe(5);
      for (const inactiveControl of [
        "minimumHeadingSpeedMetersPerSecond",
        "velocityHeadingDampingPerSecond",
        "recenterDelaySeconds",
        "recenterDurationSeconds",
        "recenterMinimumSpeedMetersPerSecond",
      ]) {
        expect(await page.locator(`[data-camera-control="${inactiveControl}"]`).count()).toBe(0);
      }
      const fovProvenance = page.locator(
        '[data-camera-control="baseFovDegrees"] .parameter-help-text',
      );
      expect(await fovProvenance.textContent()).toContain("单位：deg");
      expect(await fovProvenance.textContent()).toContain("Authoring 范围");
      expect(await fovProvenance.textContent()).toContain("Safety 范围");
      expect(await fovProvenance.textContent()).toContain("锁定 Profile 默认");
      expect(await fovProvenance.textContent()).toContain("生效条件");
      expect(await fovProvenance.textContent()).toContain("最终来源");
      expect(await page.locator('#tuning-camera-expert [data-camera-control="transitionSeconds"]').count())
        .toBe(1);
      expect(await page.locator('#tuning-camera-expert [data-camera-control="fovDampingPerSecond"]').count())
        .toBe(1);
      expect(await page.locator('[data-camera-control="transitionSeconds"] strong').textContent())
        .toBe("镜头配置过渡时长");
      expect(await page.locator('[data-camera-control="fovDampingPerSecond"] strong').textContent())
        .toBe("动态 FOV 响应速度");
      expect(await page.locator('[data-camera-group="collision"]').count()).toBe(1);
      expect(await page.locator('[data-camera-group="lag"]').count()).toBe(1);
      await expect.poll(async () => page.locator("#runtime-fps").textContent()).toMatch(/^\d+$/);
      const [runtimeFps, hudFps] = await page.evaluate(() => [
        document.querySelector("#runtime-fps")?.textContent,
        document.querySelector("#fps")?.textContent,
      ]);
      expect(runtimeFps).toMatch(/^\d+$/);
      expect(runtimeFps).toBe(hudFps);
      await expect.poll(async () => page.locator("#runtime-version").textContent())
        .toMatch(/^API v5 · [a-f0-9]{7}$/);
      expect(await page.locator("#runtime-version").getAttribute("title"))
        .toMatch(/^WorldKit Browser API v5 · Build [a-f0-9]{40}$/);
      expect(await page.locator('[data-camera-diagnostic="active-profile"]').textContent())
        .toContain("orbit.medium");
      expect(await page.locator('[data-camera-diagnostic="socket"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="requested-arm"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="effective-arm"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="fov"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="active-rig"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="selection-rules"]').textContent()).not.toBe("");
      expect(await page.locator('[data-camera-diagnostic="safe-arm"]').textContent()).not.toBe("");
      const diagnosticKeys = await page
        .locator("#tuning-camera-diagnostics [data-camera-diagnostic]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-camera-diagnostic")));
      expect(diagnosticKeys).toEqual(expect.arrayContaining([
        "active-profile",
        "active-rig",
        "selection-rules",
        "modifiers",
        "safe-fallback",
        "socket",
        "camera-position",
        "view-offsets",
        "desired-target",
        "desired-position",
        "actual-position",
        "requested-arm",
        "safe-arm",
        "effective-arm",
        "collision",
        "position-lag",
        "rotation-lag",
        "recenter-remaining",
        "fixed-step-delta",
        "resolved-parameters",
        "preview-parameters",
        "transition",
        "control-forward",
        "subject-forward",
        "subject-velocity",
      ]));

      const beforeOverlay = await page.evaluate(() => {
        const api = window.__WORLDKIT__!;
        return {
          preview: api.getCameraPreviewState?.(),
          camera: api.getCameraSnapshot?.(),
        };
      });
      await page.locator(".camera-advanced > summary").click();
      await page.locator("#tuning-camera-overlay-toggle").click();
      expect(await page.locator("#tuning-camera-overlay").isVisible()).toBe(true);
      await page.locator("#tuning-camera-overlay-toggle").click();
      expect(await page.locator("#tuning-camera-overlay").isHidden()).toBe(true);
      const afterOverlay = await page.evaluate(() => {
        const api = window.__WORLDKIT__!;
        return {
          preview: api.getCameraPreviewState?.(),
          camera: api.getCameraSnapshot?.(),
        };
      });
      expect(afterOverlay.preview).toEqual(beforeOverlay.preview);
      expect(afterOverlay.camera?.mode).toBe(beforeOverlay.camera?.mode);
      expect(afterOverlay.camera?.mode === "tracking" && beforeOverlay.camera?.mode === "tracking"
        ? afterOverlay.camera.activeCameraProfileRef
        : undefined).toBe(beforeOverlay.camera?.mode === "tracking"
          ? beforeOverlay.camera.activeCameraProfileRef
          : undefined);

      await page.locator('[data-camera-control="baseFovDegrees"] input').evaluate((element) => {
        const input = element as HTMLInputElement;
        input.value = input.max;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.evaluate(() => {
        const storageKey = "worldkit.subject-preset-local.v1";
        const repository = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        const draft = repository.drafts?.[0];
        if (draft === undefined) throw new Error("Expected a persisted workbench draft.");
        const firstPersonRef = "worldkit://camera-profile/first-person.standard@1";
        const legacyProfileRef = "worldkit://camera-profile/follow.medium@1";
        const orbitProfileRef = "worldkit://camera-profile/orbit.medium@1";
        const orbitOverride = draft.cameraOverridesByProfileRef[orbitProfileRef] ?? {
          schemaVersion: 1,
          baseResourceRef: orbitProfileRef,
          baseContentHash: "sha256:test",
          values: {},
        };
        draft.cameraOverridesByProfileRef[firstPersonRef] = {
          ...orbitOverride,
          baseResourceRef: firstPersonRef,
          values: {
            baseFovDegrees: 100,
            distanceMeters: 6,
            collisionRadiusMeters: 0.3,
            lookAheadSeconds: 0.4,
            horizontalDeadZoneRatio: 0.2,
          },
        };
        draft.selectedCameraPreferenceRef = firstPersonRef;
        draft.cameraOverridesByProfileRef[legacyProfileRef] = {
          ...orbitOverride,
          baseResourceRef: legacyProfileRef,
          values: { distanceMeters: 8 },
        };
        localStorage.setItem(storageKey, JSON.stringify(repository));
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#open-tuning-button:not([hidden])").waitFor({ timeout: 45_000 });
      await page.locator("#tuning-tab-camera").click();
      await expect.poll(async () => page.locator(
        '[data-camera-profile-ref="worldkit://camera-profile/orbit.medium@1"].selected',
      ).count()).toBe(1);
      const migratedPreview = await page.evaluate(() => window.__WORLDKIT__!
        .getCameraPreviewState?.().tuningByProfileRef);
      expect(migratedPreview).not.toHaveProperty("worldkit://camera-profile/follow.medium@1");
      const migratedDraft = await page.evaluate(() => JSON.parse(
        localStorage.getItem("worldkit.subject-preset-local.v1") ?? "{}",
      ).drafts?.[0]);
      expect(await page.locator("#tuning-save-status").textContent())
        .toContain("Golden Subject tuning is compiler-locked");
      expect(migratedDraft.cameraOverridesByProfileRef)
        .not.toHaveProperty("worldkit://camera-profile/first-person.standard@1");
      expect(migratedPreview)
        .not.toHaveProperty("worldkit://camera-profile/first-person.standard@1");
      expect(migratedDraft.selectedCameraPreferenceRef)
        .toBe("worldkit://camera-profile/orbit.medium@1");
      expect(Object.keys(migratedDraft.cameraOverridesByProfileRef).every(
        (resourceRef) => resourceRef === "worldkit://camera-profile/orbit.medium@1",
      )).toBe(true);
    } catch (error) {
      throw new Error(
        `AUTHORING_CAMERA_CONSOLE_E2E_FAILED: ${viteOutput.slice(-4_000)}`,
        { cause: error },
      );
    } finally {
      await browser?.close();
      await stopDirectViteProcess(vite);
    }
  }, 120_000);
});
