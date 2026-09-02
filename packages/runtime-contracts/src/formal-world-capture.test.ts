import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_CHECK_COUNT_V1,
  MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_TICK_COUNT_PER_CHECK_V1,
  MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_TOTAL_TICK_COUNT_V1,
  formalArtifactViewRequestCanonicalBytesV1,
  formalSemanticCaptureMapCanonicalBytesV1,
  formalWorldCaptureIntentCanonicalBytesV1,
  formalWorldCaptureRequestCanonicalBytesV1,
  formalWorldCaptureReceiptCanonicalBytesV1,
  hashFormalArtifactViewRequestV1,
  hashFormalColliderOverlayRequestV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalScriptedTraversalRequestV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureRequestV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalArtifactViewRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalScriptedTraversalRequestV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureReceiptV1,
} from "./formal-world-capture.js";
import { parseWorldRuntimeSnapshotV4 } from "./runtime-session-protocol.js";
import type { WorldRuntimeSnapshotV4 } from "./runtime-session.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;
const PACKAGE_ROOT = H("1");
const WORLD_PACKAGE_REF = `package://world-package/sha256/${"1".repeat(64)}`;

function snapshotFixture(
  phase: WorldRuntimeSnapshotV4["runtime"]["phase"] = "ready",
): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId: "world-session-primary",
    world: {
      publicationEpoch: 0,
      simulationTick: 4,
      worldStateRef: "worldkit://world-state/world-state-primary",
      worldStateHash: H("a"),
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: H("b"),
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 1, 2],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {
            "locomotion:player": {
              id: "locomotion:player",
              kind: "locomotion-capability-state-v2",
              ownerEntityId: "player",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: H("a"),
              locomotion: {
                schemaVersion: 2,
                status: "active",
                mobilityMode: "grounded",
                gait: "idle",
                verticalPhase: "none",
                supportMode: "supported",
                movementMedium: "ground",
                facingYawRadians: 0,
                linearVelocity: { x: 0, y: 0, z: 0 },
                horizontalSpeedMetersPerSecond: 0,
                committedTick: 4,
                phaseEnteredTick: 0,
                transitionSequence: 0,
              },
            },
          },
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: "gameplay-inspection:world-session-primary:4",
        runtimeSessionId: "runtime-session-primary",
        worldSessionId: "world-session-primary",
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: 4,
        participantStatesById: {
          "participant-primary": { id: "participant-primary", mode: "active" },
        },
        controllerStatesById: {
          "controller-primary": {
            id: "controller-primary",
            participantId: "participant-primary",
          },
        },
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: 0,
      camera: { mode: "unbound" },
    },
    runtime: {
      phase,
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 4,
    },
  };
}

function legacyLocomotionSnapshotFixture(): WorldRuntimeSnapshotV4 {
  const snapshot = snapshotFixture();
  const player = snapshot.world.subjectStatesByEntityId.player!;
  return parseWorldRuntimeSnapshotV4({
    ...snapshot,
    world: {
      ...snapshot.world,
      subjectStatesByEntityId: {
        ...snapshot.world.subjectStatesByEntityId,
        player: {
          ...player,
          capabilityStatesById: {
            ...player.capabilityStatesById,
            "locomotion:player": {
              id: "locomotion:player",
              kind: "locomotion-capability-state",
              ownerEntityId: "player",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: H("a"),
              mode: "idle",
              movementMedium: "ground",
              facingYawRadians: 0,
              speedMetersPerSecond: 0,
            },
          },
        },
      },
    },
  });
}

const WORLD_BOUNDS = {
  minimumMetersXYZ: [-40, 0, -40],
  maximumMetersXYZ: [40, 24, 40],
} as const;

const CENTRAL_ASCENT_BOUNDS = {
  minimumMetersXYZ: [0, 0, 0],
  maximumMetersXYZ: [4, 6, 4],
} as const;

const UPPER_T_JUNCTION_BOUNDS = {
  minimumMetersXYZ: [-2, 6, -6],
  maximumMetersXYZ: [6, 8, 6],
} as const;

const FIXED_INPUT_SEQUENCE = [
  { actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 12 },
  { actions: ["jump"], ticks: 1 },
  { actions: ["move-forward"], ticks: 8 },
] as const;

const FIXED_INPUT_SEQUENCE_HASH = sha256CanonicalJson(FIXED_INPUT_SEQUENCE);
const MINIMAL_FIXED_INPUT_SEQUENCE = [{
  actions: ["move-forward"],
  ticks: 1,
}] as const;
const MINIMAL_FIXED_INPUT_SEQUENCE_HASH = sha256CanonicalJson(
  MINIMAL_FIXED_INPUT_SEQUENCE,
);

function resolvedTraversalCheckpointCriteria() {
  return [
    {
      kind: "reach-bounds",
      checkpointId: "junction",
      expectation: "reach",
      sourceVisualGroupId: "upper-t-junction-group",
      sourceBoundsMeters: UPPER_T_JUNCTION_BOUNDS,
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    },
    {
      kind: "pass-plane",
      checkpointId: "spawn",
      expectation: "pass",
      sourceVisualGroupId: "central-ascent-group",
      sourceBoundsMeters: CENTRAL_ASCENT_BOUNDS,
      axis: "z",
      sourceFace: "minimum",
      planeMeters: 0,
      expectedCenterSide: "negative",
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    },
  ] as const;
}

function authoredTraversalCheckpointCriteria() {
  return [
    {
      kind: "reach-bounds",
      checkpointId: "junction",
      expectation: "reach",
      sourceVisualGroupId: "upper-t-junction-group",
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    },
    {
      kind: "pass-plane",
      checkpointId: "spawn",
      expectation: "pass",
      sourceVisualGroupId: "central-ascent-group",
      axis: "z",
      sourceFace: "minimum",
      expectedCenterSide: "negative",
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    },
  ] as const;
}

function openingRequest() {
  return {
    kind: "formal-artifact-view-request",
    schemaVersion: 1,
    viewId: "opening",
    projection: "perspective",
    widthPixels: 1280,
    heightPixels: 720,
    devicePixelRatio: 1,
  } as const;
}

function worldSideRequest() {
  return {
    kind: "formal-artifact-view-request",
    schemaVersion: 1,
    viewId: "world-side",
    projection: "orthographic",
    widthPixels: 1280,
    heightPixels: 720,
    devicePixelRatio: 1,
    worldBoundsMeters: WORLD_BOUNDS,
    cameraPositionMetersXYZ: [80, 12, 0],
    targetMetersXYZ: [0, 12, 0],
  } as const;
}

function worldTopDownRequest() {
  return {
    kind: "formal-artifact-view-request",
    schemaVersion: 1,
    viewId: "world-top-down",
    projection: "orthographic",
    widthPixels: 1280,
    heightPixels: 720,
    devicePixelRatio: 1,
    worldBoundsMeters: WORLD_BOUNDS,
    cameraPositionMetersXYZ: [0, 80, 0],
    targetMetersXYZ: [0, 12, 0],
  } as const;
}

function Hx(byte: string): Sha256HashV1 {
  return `sha256:${byte.repeat(32)}`;
}

function viewRecord(
  request: ReturnType<typeof openingRequest> |
    ReturnType<typeof worldSideRequest> |
    ReturnType<typeof worldTopDownRequest>,
  pngByte: string,
) {
  return {
    viewId: request.viewId,
    request,
    requestHash: hashFormalArtifactViewRequestV1(request),
    pngArtifactRef: `artifact://case/cloud-temple/capture/${request.viewId}.png`,
    pngContentHash: Hx(pngByte),
  };
}

function sdkOwnerIdentities() {
  return [
    {
      ownerId: "action",
      implementationRef: "worldkit://sdk-owner/subject-actions@1",
      implementationHash: H("3"),
    },
    {
      ownerId: "camera",
      implementationRef: "worldkit://sdk-owner/camera@1",
      implementationHash: H("4"),
    },
    {
      ownerId: "input",
      implementationRef: "worldkit://sdk-owner/control-capture@1",
      implementationHash: H("5"),
    },
    {
      ownerId: "physics",
      implementationRef: "worldkit://sdk-owner/character-movement@1",
      implementationHash: H("6"),
    },
    {
      ownerId: "subject",
      implementationRef: "worldkit://sdk-owner/subject-contracts@1",
      implementationHash: H("7"),
    },
  ] as const;
}

function semanticMapValue() {
  return {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "cloud-temple.case.semantic-capture-map",
    caseRef: "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    caseHash: H("c"),
    authoringManifestHash: H("d"),
    layoutInventoryHash: H("e"),
    contributionHash: H("f"),
    bindings: [
      {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        compositionTargetRef: "worldkit://composition-target/central-ascent@1",
        topologyNodeId: "central-ascent",
        semanticLayerId: "ground",
        blockVisualGroupId: "central-ascent-group",
        semanticClassId: "worldkit.native-block.group.central-ascent-group",
        identityColor: "#C9A96B",
        projectedBoundsSource: "checked-layout-visual-group",
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
        authoringManifestHash: H("d"),
        layoutInventoryHash: H("e"),
        contributionHash: H("f"),
      },
      {
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        compositionTargetRef: "worldkit://composition-target/upper-t-junction@1",
        topologyNodeId: "upper-t-junction",
        semanticLayerId: "upper",
        blockVisualGroupId: "upper-t-junction-group",
        semanticClassId: "worldkit.native-block.group.upper-t-junction-group",
        identityColor: "#AEB8C4",
        projectedBoundsSource: "checked-layout-visual-group",
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
        authoringManifestHash: H("d"),
        layoutInventoryHash: H("e"),
        contributionHash: H("f"),
      },
    ],
    topologyRelations: [{
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }],
    traversalCheckBindings: [
      {
        traversalCheckId: "reach-junction",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        checkExpectation: "pass",
        fixedInputSequenceHash: FIXED_INPUT_SEQUENCE_HASH,
        checkpointCriteria: resolvedTraversalCheckpointCriteria(),
      },
    ],
  };
}

function formalCaptureIntentValue() {
  return {
    kind: "formal-world-capture-intent",
    schemaVersion: 1,
    id: "cloud-temple-t-gate-native-block.formal-world-capture-intent",
    captureProfile: {
      widthPixels: 1280,
      heightPixels: 720,
      devicePixelRatio: 1,
    },
    semanticCaptureTargetBindings: [{
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      compositionTargetRef: "worldkit://composition-target/central-ascent@1",
      topologyNodeId: "central-ascent",
      semanticLayerId: "ground",
      blockVisualGroupId: "central-ascent-group",
    }, {
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
      compositionTargetRef: "worldkit://composition-target/upper-t-junction@1",
      topologyNodeId: "upper-t-junction",
      semanticLayerId: "upper",
      blockVisualGroupId: "upper-t-junction-group",
    }],
    topologyRelations: [{
      fromNodeId: "central-ascent",
      relation: "above",
      toNodeId: "upper-t-junction",
      measurementSource: "package-bounds",
      fromVisualGroupId: "central-ascent-group",
      toVisualGroupId: "upper-t-junction-group",
    }, {
      fromNodeId: "central-ascent",
      relation: "blocks",
      toNodeId: "upper-t-junction",
      measurementSource: "sdk-collider",
      colliderId: "west-wall",
      sourceVisualGroupId: "central-ascent-group",
    }, {
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }, {
      fromNodeId: "upper-t-junction",
      relation: "contains",
      toNodeId: "central-ascent",
      measurementSource: "sdk-support",
      subjectEntityId: "player",
      colliderId: "spawn-ground",
    }],
    checkpointSpatialCriteria: authoredTraversalCheckpointCriteria(),
  } as const;
}

function formalRequestValue() {
  const semanticCaptureMap = semanticMapValue();
  const colliderOverlay = {
    kind: "formal-collider-overlay-request",
    schemaVersion: 1,
    isRequired: true,
    contributionHash: H("f"),
  } as const;
  const scriptedTraversal = {
    kind: "formal-scripted-traversal-request",
    schemaVersion: 1,
    checks: [
      {
        id: "reach-junction",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        checkExpectation: "pass",
        fixedInputSequence: FIXED_INPUT_SEQUENCE,
        fixedInputSequenceHash: FIXED_INPUT_SEQUENCE_HASH,
        checkpointCriteria: resolvedTraversalCheckpointCriteria(),
      },
    ],
  } as const;
  return {
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: "cloud-temple.attempt-0.formal-capture-request",
    formalRequestRef:
      "artifact://case/cloud-temple/attempts/0/formal-world-capture-request.json",
    caseRef: "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    caseHash: H("c"),
    evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
    evaluationProfileHash: H("9"),
    sceneAuthoringRouteDecisionRef:
      "artifact://case/cloud-temple/route-decision.json",
    sceneAuthoringRouteDecisionHash: H("a"),
    sceneAuthoringAttemptRef: "artifact://case/cloud-temple/attempts/0/attempt.json",
    sceneAuthoringAttemptHash: H("b"),
    sceneAuthoringAttemptResultRef:
      "artifact://case/cloud-temple/attempts/0/attempt-result.json",
    sceneAuthoringAttemptResultHash: H("c"),
    worldPackageRef: WORLD_PACKAGE_REF,
    worldPackageRootHash: PACKAGE_ROOT,
    worldBuildIdentityRef:
      "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
    worldBuildIdentityHash: H("2"),
    worldPackageBuildReceiptRef:
      "artifact://case/cloud-temple/attempts/0/world-package-build-receipt.json",
    worldPackageBuildReceiptHash: H("d"),
    semanticCaptureMapRef:
      "artifact://case/cloud-temple/attempts/0/semantic-capture-map.json",
    semanticCaptureMap,
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash: H("7"),
    views: [openingRequest(), worldSideRequest(), worldTopDownRequest()],
    colliderOverlay,
    scriptedTraversal,
  } as const;
}

function minimalScriptedTraversalRequest(checkCount: number) {
  return {
    kind: "formal-scripted-traversal-request",
    schemaVersion: 1,
    checks: Array.from({ length: checkCount }, (_unused, index) => ({
      id: `check-${String(index).padStart(2, "0")}`,
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      checkExpectation: "pass",
      fixedInputSequence: MINIMAL_FIXED_INPUT_SEQUENCE,
      fixedInputSequenceHash: MINIMAL_FIXED_INPUT_SEQUENCE_HASH,
      checkpointCriteria: [{
        kind: "reach-bounds",
        checkpointId: "checkpoint",
        expectation: "reach",
        sourceVisualGroupId: "central-ascent-group",
        sourceBoundsMeters: CENTRAL_ASCENT_BOUNDS,
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }],
    })),
  } as const;
}

function receiptValue(runtimeSnapshot = snapshotFixture()) {
  const readySnapshot = parseWorldRuntimeSnapshotV4(runtimeSnapshot);
  const formalRequest = formalRequestValue();
  return {
    kind: "formal-world-capture-receipt",
    schemaVersion: 1,
    id: "cloud-temple.attempt-0.formal-capture",
    formalRequestRef:
      "artifact://case/cloud-temple/attempts/0/formal-world-capture-request.json",
    formalRequest,
    formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
    caseRef: formalRequest.caseRef,
    caseHash: formalRequest.caseHash,
    evaluationProfileRef: formalRequest.evaluationProfileRef,
    evaluationProfileHash: formalRequest.evaluationProfileHash,
    sceneAuthoringRouteDecisionRef: formalRequest.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecisionHash: formalRequest.sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef: formalRequest.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: formalRequest.sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef: formalRequest.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash: formalRequest.sceneAuthoringAttemptResultHash,
    worldPackageRef: formalRequest.worldPackageRef,
    worldPackageRootHash: formalRequest.worldPackageRootHash,
    worldBuildIdentityRef: formalRequest.worldBuildIdentityRef,
    worldBuildIdentityHash: formalRequest.worldBuildIdentityHash,
    worldPackageBuildReceiptRef: formalRequest.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash: formalRequest.worldPackageBuildReceiptHash,
    runtimeSessionId: readySnapshot.runtimeSessionId,
    readySnapshot,
    readySnapshotHash: sha256CanonicalJson(readySnapshot),
    sdkOwnerIdentities: sdkOwnerIdentities(),
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
    nativeBlockMaterializerMetadataHash:
      formalRequest.nativeBlockMaterializerMetadataHash,
    colliderOverlayRequestHash:
      hashFormalColliderOverlayRequestV1(formalRequest.colliderOverlay),
    scriptedTraversalRequestHash:
      hashFormalScriptedTraversalRequestV1(formalRequest.scriptedTraversal),
    viewportWidthPixels: 1280,
    viewportHeightPixels: 720,
    devicePixelRatio: 1,
    rendererIdentity: "babylon-webgpu",
    browserIdentity: "playwright-chromium",
    views: [
      viewRecord(openingRequest(), "a1"),
      viewRecord(worldSideRequest(), "b2"),
      viewRecord(worldTopDownRequest(), "c3"),
    ],
    openingObservationArtifactRef:
      "artifact://case/cloud-temple/capture/opening-observation.json",
    openingObservationContentHash: Hx("d4"),
    spawnSupportObservationArtifactRef:
      "artifact://case/cloud-temple/capture/spawn-support-observation.json",
    spawnSupportObservationContentHash: Hx("e5"),
    colliderOverlayPngArtifactRef:
      "artifact://case/cloud-temple/capture/collider-overlay.png",
    colliderOverlayPngContentHash: Hx("f6"),
    colliderOverlayObservationArtifactRef:
      "artifact://case/cloud-temple/capture/collider-overlay-observation.json",
    colliderOverlayObservationContentHash: Hx("a7"),
    scriptedTraversalArtifactRef:
      "artifact://case/cloud-temple/capture/scripted-traversal.json",
    scriptedTraversalContentHash: Hx("b8"),
    cameraRollbackOutcome: "completed",
    resetOutcome: "completed",
    cleanupOutcome: "completed",
  };
}

describe("FormalWorldCaptureIntentV1", () => {
  it("parses, freezes, canonicalizes, and hashes one closed Scheme A intent", () => {
    const intent = parseFormalWorldCaptureIntentV1(formalCaptureIntentValue());

    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.captureProfile)).toBe(true);
    expect(Object.isFrozen(intent.semanticCaptureTargetBindings)).toBe(true);
    expect(Object.isFrozen(intent.topologyRelations)).toBe(true);
    expect(Object.isFrozen(intent.checkpointSpatialCriteria)).toBe(true);
    expect(intent.topologyRelations).toEqual(
      formalCaptureIntentValue().topologyRelations,
    );
    expect(formalWorldCaptureIntentCanonicalBytesV1(
      formalCaptureIntentValue(),
    )).toEqual(canonicalJsonBytes(intent));
    expect(hashFormalWorldCaptureIntentV1(intent))
      .toBe(sha256CanonicalJson(intent));
    expect(hashFormalWorldCaptureIntentV1({
      ...formalCaptureIntentValue(),
      captureProfile: {
        ...formalCaptureIntentValue().captureProfile,
        widthPixels: 1281,
      },
    })).not.toBe(hashFormalWorldCaptureIntentV1(intent));
  });

  it("rejects missing, extra, and alias fields instead of defaulting", () => {
    const missing = { ...formalCaptureIntentValue() } as Record<string, unknown>;
    delete missing.captureProfile;
    expect(() => parseFormalWorldCaptureIntentV1(missing))
      .toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
    expect(() => parseFormalWorldCaptureIntentV1({
      ...formalCaptureIntentValue(),
      captureProfileAlias: formalCaptureIntentValue().captureProfile,
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
    expect(() => parseFormalWorldCaptureIntentV1({
      ...formalCaptureIntentValue(),
      captureProfile: {
        ...formalCaptureIntentValue().captureProfile,
        viewportWidthPixels: 1280,
      },
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
  });

  it("rejects resolved Package bounds and planes in authored Intent criteria", () => {
    const intent = formalCaptureIntentValue();
    expect(() => parseFormalWorldCaptureIntentV1({
      ...intent,
      checkpointSpatialCriteria: intent.checkpointSpatialCriteria.map(
        (criterion, index) => index === 0
          ? { ...criterion, sourceBoundsMeters: UPPER_T_JUNCTION_BOUNDS }
          : criterion,
      ),
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
    expect(() => parseFormalWorldCaptureIntentV1({
      ...intent,
      checkpointSpatialCriteria: intent.checkpointSpatialCriteria.map(
        (criterion, index) => index === 1
          ? { ...criterion, planeMeters: 0 }
          : criterion,
      ),
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
  });

  it.each([
    { widthPixels: 0 },
    { widthPixels: 1.5 },
    { widthPixels: Number.POSITIVE_INFINITY },
    { heightPixels: 0 },
    { devicePixelRatio: 0 },
    { devicePixelRatio: Number.NaN },
  ])("rejects a non-positive or non-finite Capture profile %j", (override) => {
    expect(() => parseFormalWorldCaptureIntentV1({
      ...formalCaptureIntentValue(),
      captureProfile: {
        ...formalCaptureIntentValue().captureProfile,
        ...override,
      },
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
  });

  it("requires non-empty, unique, canonical collection order", () => {
    const intent = formalCaptureIntentValue();
    for (const invalid of [{
      ...intent,
      semanticCaptureTargetBindings: [],
    }, {
      ...intent,
      semanticCaptureTargetBindings: [...intent.semanticCaptureTargetBindings]
        .reverse(),
    }, {
      ...intent,
      semanticCaptureTargetBindings: intent.semanticCaptureTargetBindings.map(
        (binding, index) => index === 1
          ? { ...binding, blockVisualGroupId: "central-ascent-group" }
          : binding,
      ),
    }, {
      ...intent,
      topologyRelations: [],
    }, {
      ...intent,
      topologyRelations: [...intent.topologyRelations].reverse(),
    }, {
      ...intent,
      checkpointSpatialCriteria: [],
    }, {
      ...intent,
      checkpointSpatialCriteria: [...intent.checkpointSpatialCriteria].reverse(),
    }]) {
      expect(() => parseFormalWorldCaptureIntentV1(invalid))
        .toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
    }
  });

  it("rejects relation and checkpoint proof identities outside bound targets", () => {
    const intent = formalCaptureIntentValue();
    expect(() => parseFormalWorldCaptureIntentV1({
      ...intent,
      topologyRelations: intent.topologyRelations.map((relation, index) =>
        index === 0
          ? { ...relation, fromVisualGroupId: "foreign-group" }
          : relation),
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
    expect(() => parseFormalWorldCaptureIntentV1({
      ...intent,
      checkpointSpatialCriteria: intent.checkpointSpatialCriteria.map(
        (criterion, index) => index === 0
          ? { ...criterion, sourceVisualGroupId: "foreign-group" }
          : criterion,
      ),
    })).toThrowError("FORMAL_WORLD_CAPTURE_INTENT_INVALID");
  });
});

describe("FormalWorldCaptureRequestV1", () => {
  it("rejects old Case Ref dialects", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseFormalWorldCaptureRequestV1({
        ...formalRequestValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("rejects old Case Ref dialects", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseFormalWorldCaptureRequestV1({
        ...formalRequestValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("freezes one Package-bound Capture transaction with one materializer inventory authority", () => {
    const request = parseFormalWorldCaptureRequestV1(formalRequestValue());
    expect(request.formalRequestRef).toBe(
      "artifact://case/cloud-temple/attempts/0/formal-world-capture-request.json",
    );
    expect(request.worldPackageRootHash).toBe(PACKAGE_ROOT);
    expect(request.semanticCaptureMap.caseHash).toBe(request.caseHash);
    expect(request.scriptedTraversal.checks[0]?.checkpointCriteria.map(
      ({ checkpointId, expectation }) => ({ checkpointId, expectation }),
    )).toEqual([
      { checkpointId: "junction", expectation: "reach" },
      { checkpointId: "spawn", expectation: "pass" },
    ]);
    expect(formalWorldCaptureRequestCanonicalBytesV1(request)).toEqual(
      formalWorldCaptureRequestCanonicalBytesV1(formalRequestValue()),
    );
  });

  it("requires the Request to carry its own stable artifact identity", () => {
    const { formalRequestRef: _removed, ...request } = formalRequestValue();
    expect(() => parseFormalWorldCaptureRequestV1(request)).toThrowError(
      "FORMAL_WORLD_CAPTURE_REQUEST_INVALID",
    );
  });

  it("rejects the removed shadow capture identity inventory fields", () => {
    expect(() => parseFormalWorldCaptureRequestV1({
      ...formalRequestValue(),
      nativeBlockCaptureIdentityInventoryRef:
        "world-package://native/block-capture-identity-inventory.json",
      nativeBlockCaptureIdentityInventoryHash: H("6"),
    })).toThrowError("FORMAL_WORLD_CAPTURE_REQUEST_INVALID");
  });

  it("rejects checkpoint strings without package-derived spatial criteria", () => {
    const request = formalRequestValue();
    const checks = request.scriptedTraversal.checks as unknown as Array<{
      checkpointCriteria: unknown[];
    }>;
    checks[0]!.checkpointCriteria = [];
    expect(() => parseFormalWorldCaptureRequestV1(request)).toThrowError(
      "FORMAL_WORLD_CAPTURE_REQUEST_INVALID",
    );
  });

  it("rejects a plane not derived from the frozen source bounds", () => {
    const request = formalRequestValue();
    const criteria = request.scriptedTraversal.checks[0]
      .checkpointCriteria as unknown as Array<Record<string, unknown>>;
    criteria[1] = {
      ...request.scriptedTraversal.checks[0].checkpointCriteria[1],
      planeMeters: 1,
    };
    expect(() => parseFormalWorldCaptureRequestV1(request)).toThrowError(
      "FORMAL_WORLD_CAPTURE_REQUEST_INVALID",
    );
  });

  it("includes capsule-aware spatial criteria in both semantic-map and Request hashes", () => {
    const original = formalRequestValue();
    const changedCriteria = resolvedTraversalCheckpointCriteria().map((criterion) =>
      criterion.checkpointId === "junction"
        ? { ...criterion, toleranceMeters: 0.04 }
        : criterion);
    const changedMap = {
      ...original.semanticCaptureMap,
      traversalCheckBindings: [{
        ...original.semanticCaptureMap.traversalCheckBindings[0]!,
        checkpointCriteria: changedCriteria,
      }],
    };
    const changedRequest = {
      ...original,
      semanticCaptureMap: changedMap,
      semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(changedMap),
      scriptedTraversal: {
        ...original.scriptedTraversal,
        checks: [{
          ...original.scriptedTraversal.checks[0]!,
          checkpointCriteria: changedCriteria,
        }],
      },
    };
    expect(hashFormalSemanticCaptureMapV1(changedMap)).not.toBe(
      hashFormalSemanticCaptureMapV1(original.semanticCaptureMap),
    );
    expect(hashFormalWorldCaptureRequestV1(changedRequest)).not.toBe(
      hashFormalWorldCaptureRequestV1(original),
    );
  });
});

describe("FormalScriptedTraversalRequestV1", () => {
  it("accepts the frozen maximum of 16 minimal checks", () => {
    expect(MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_CHECK_COUNT_V1).toBe(16);
    expect(parseFormalScriptedTraversalRequestV1(
      minimalScriptedTraversalRequest(16),
    ).checks).toHaveLength(16);
  });

  it("rejects 17 checks before RuntimeHost reset budgeting", () => {
    expect(() => parseFormalScriptedTraversalRequestV1(
      minimalScriptedTraversalRequest(17),
    )).toThrowError("FORMAL_SCRIPTED_TRAVERSAL_REQUEST_INVALID");
  });

  it("rejects zero-tick checks and bounds both per-check and transaction ticks", () => {
    expect(MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_TICK_COUNT_PER_CHECK_V1).toBe(1_200);
    expect(MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_TOTAL_TICK_COUNT_V1).toBe(7_200);
    const withTicks = (checkCount: number, ticks: number) => {
      const request = minimalScriptedTraversalRequest(checkCount);
      return {
        ...request,
        checks: request.checks.map((check) => {
          const fixedInputSequence = [{ actions: ["move-forward"], ticks }];
          return {
            ...check,
            fixedInputSequence,
            fixedInputSequenceHash: sha256CanonicalJson(fixedInputSequence),
          };
        }),
      };
    };
    expect(() => parseFormalScriptedTraversalRequestV1(withTicks(1, 0)))
      .toThrowError("FORMAL_SCRIPTED_TRAVERSAL_REQUEST_INVALID");
    expect(() => parseFormalScriptedTraversalRequestV1(withTicks(1, 1_201)))
      .toThrowError("FORMAL_SCRIPTED_TRAVERSAL_REQUEST_INVALID");
    expect(() => parseFormalScriptedTraversalRequestV1(withTicks(7, 1_200)))
      .toThrowError("FORMAL_SCRIPTED_TRAVERSAL_REQUEST_INVALID");
  });
});

describe("FormalArtifactViewRequestV1", () => {
  it("parses opening, world-side, and world-top-down as a closed formal set", () => {
    expect(parseFormalArtifactViewRequestV1(openingRequest()).viewId).toBe("opening");
    expect(parseFormalArtifactViewRequestV1(worldSideRequest())).toMatchObject({
      viewId: "world-side",
      projection: "orthographic",
      worldBoundsMeters: WORLD_BOUNDS,
    });
    expect(parseFormalArtifactViewRequestV1(worldTopDownRequest()).viewId)
      .toBe("world-top-down");
    expect(hashFormalArtifactViewRequestV1(worldSideRequest())).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(formalArtifactViewRequestCanonicalBytesV1(worldSideRequest())).toEqual(
      formalArtifactViewRequestCanonicalBytesV1(
        parseFormalArtifactViewRequestV1(worldSideRequest()),
      ),
    );
  });

  it("rejects the object-local right tri-view identifier as world-side", () => {
    expect(() => parseFormalArtifactViewRequestV1({
      ...worldSideRequest(),
      viewId: "right",
    })).toThrowError("FORMAL_ARTIFACT_VIEW_REQUEST_INVALID");
    expect(() => parseFormalArtifactViewRequestV1({
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-side",
      projection: "orthographic",
      widthPixels: 1280,
      heightPixels: 720,
      devicePixelRatio: 1,
      worldBoundsMeters: WORLD_BOUNDS,
      cameraPositionMetersXYZ: [80, 12, 0],
      targetMetersXYZ: [0, 12, 0],
      triView: "right",
    })).toThrowError("FORMAL_ARTIFACT_VIEW_REQUEST_INVALID");
  });

  it.each([
    ["front", { ...openingRequest(), viewId: "front" }],
    ["back", { ...openingRequest(), viewId: "back" }],
    ["side", { ...worldSideRequest(), viewId: "side" }],
    ["top-down", { ...worldTopDownRequest(), viewId: "top-down" }],
    ["opening-frame", { ...openingRequest(), viewId: "opening-frame" }],
  ])("rejects authoring or object-local view id %s", (_label, request) => {
    expect(() => parseFormalArtifactViewRequestV1(request)).toThrowError(
      "FORMAL_ARTIFACT_VIEW_REQUEST_INVALID",
    );
  });

  it("rejects a world-side request that is not a world-bounds lateral elevation", () => {
    expect(() => parseFormalArtifactViewRequestV1({
      ...worldSideRequest(),
      cameraPositionMetersXYZ: [0, 80, 0],
      targetMetersXYZ: [0, 12, 0],
    })).toThrowError("FORMAL_ARTIFACT_VIEW_REQUEST_INVALID");
    expect(() => parseFormalArtifactViewRequestV1({
      ...worldSideRequest(),
      worldBoundsMeters: {
        minimumMetersXYZ: [-0.25, 0, -0.25],
        maximumMetersXYZ: [0.25, 0.5, 0.25],
      },
    })).toThrowError("FORMAL_ARTIFACT_VIEW_REQUEST_INVALID");
    expect(() => parseFormalArtifactViewRequestV1({
      ...worldSideRequest(),
      projection: "perspective",
    })).toThrowError("FORMAL_ARTIFACT_VIEW_REQUEST_INVALID");
  });
});

describe("FormalSemanticCaptureMapV1", () => {
  it("rejects old Case Ref dialects", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseFormalSemanticCaptureMapV1({
        ...semanticMapValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("rejects old Case Ref dialects", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseFormalSemanticCaptureMapV1({
        ...semanticMapValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("parses a hashable closed Case-to-group map", () => {
    const parsed = parseFormalSemanticCaptureMapV1(semanticMapValue());
    expect(parsed.bindings.map(({ acceptanceTargetRef }) => acceptanceTargetRef))
      .toEqual([
        "worldkit://acceptance-target/central-ascent@1",
        "worldkit://acceptance-target/upper-t-junction@1",
      ]);
    expect(parsed.bindings.map(({ compositionTargetRef, topologyNodeId, semanticLayerId }) => ({
      compositionTargetRef,
      topologyNodeId,
      semanticLayerId,
    }))).toEqual([{
      compositionTargetRef: "worldkit://composition-target/central-ascent@1",
      topologyNodeId: "central-ascent",
      semanticLayerId: "ground",
    }, {
      compositionTargetRef: "worldkit://composition-target/upper-t-junction@1",
      topologyNodeId: "upper-t-junction",
      semanticLayerId: "upper",
    }]);
    expect(parsed.topologyRelations).toEqual([{
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }]);
    expect(hashFormalSemanticCaptureMapV1(parsed)).toBe(
      hashFormalSemanticCaptureMapV1(semanticMapValue()),
    );
    expect(formalSemanticCaptureMapCanonicalBytesV1(parsed)).toEqual(
      formalSemanticCaptureMapCanonicalBytesV1(semanticMapValue()),
    );
    expect(Object.isFrozen(parsed.bindings)).toBe(true);
    expect(parsed.traversalCheckBindings[0]?.checkpointCriteria).toHaveLength(2);
  });

  it("rejects unsorted, duplicate, or extra-field maps", () => {
    const reversed = semanticMapValue();
    reversed.bindings = [...reversed.bindings].reverse();
    expect(() => parseFormalSemanticCaptureMapV1(reversed)).toThrowError(
      "FORMAL_SEMANTIC_CAPTURE_MAP_INVALID",
    );
    const duplicate = semanticMapValue();
    duplicate.bindings[1] = {
      ...duplicate.bindings[0]!,
      acceptanceTargetRef: duplicate.bindings[0]!.acceptanceTargetRef,
    };
    expect(() => parseFormalSemanticCaptureMapV1(duplicate)).toThrowError(
      "FORMAL_SEMANTIC_CAPTURE_MAP_INVALID",
    );
    expect(() => parseFormalSemanticCaptureMapV1({
      ...semanticMapValue(),
      meshName: "ascent-mesh",
    })).toThrowError("FORMAL_SEMANTIC_CAPTURE_MAP_INVALID");
  });

  it("rejects incomplete or inferred semantic mapping fields", () => {
    const missing = structuredClone(semanticMapValue()) as Record<string, unknown>;
    delete (missing.bindings as Array<Record<string, unknown>>)[0]!.compositionTargetRef;
    expect(() => parseFormalSemanticCaptureMapV1(missing)).toThrowError(
      "FORMAL_SEMANTIC_CAPTURE_MAP_INVALID",
    );
    expect(() => parseFormalSemanticCaptureMapV1({
      ...semanticMapValue(),
      inferredCompositionTargetBySlug: true,
    })).toThrowError("FORMAL_SEMANTIC_CAPTURE_MAP_INVALID");
    const missingProof = structuredClone(semanticMapValue());
    delete (missingProof.topologyRelations[0] as Record<string, unknown>)
      .traversalCheckId;
    expect(() => parseFormalSemanticCaptureMapV1(missingProof)).toThrowError(
      "FORMAL_SEMANTIC_CAPTURE_MAP_INVALID",
    );
  });

  it("closes every topology measurement source over an executable proof binding", () => {
    const relations = [
      {
        fromNodeId: "central-ascent",
        relation: "above",
        toNodeId: "upper-t-junction",
        measurementSource: "package-bounds",
        fromVisualGroupId: "central-ascent-group",
        toVisualGroupId: "upper-t-junction-group",
      },
      {
        fromNodeId: "central-ascent",
        relation: "above",
        toNodeId: "upper-t-junction",
        measurementSource: "sdk-support",
        subjectEntityId: "player",
        colliderId: "spawn-ground",
      },
      {
        fromNodeId: "central-ascent",
        relation: "blocks",
        toNodeId: "upper-t-junction",
        measurementSource: "sdk-collider",
        colliderId: "t-west-wall",
        sourceVisualGroupId: "upper-t-junction-group",
      },
    ] as const;
    for (const relation of relations) {
      const parsed = parseFormalSemanticCaptureMapV1({
        ...semanticMapValue(),
        topologyRelations: [relation],
      });
      expect(parsed.topologyRelations[0]).toEqual(relation);
    }
  });
});

function observationIdentity(
  kind: string,
  ownerId: "camera" | "physics" | "input",
  resetReadySnapshot = snapshotFixture(),
) {
  const formalRequest = formalRequestValue();
  return {
    kind,
    schemaVersion: 1,
    id: `cloud-temple.${kind}`,
    worldPackageRef: WORLD_PACKAGE_REF,
    worldPackageRootHash: PACKAGE_ROOT,
    worldBuildIdentityRef:
      "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
    worldBuildIdentityHash: H("2"),
    formalRequestRef:
      "artifact://case/cloud-temple/attempts/0/formal-world-capture-request.json",
    formalRequest,
    formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticMapValue()),
    runtimeSessionId: resetReadySnapshot.runtimeSessionId,
    resetReadySnapshot,
    resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
    domainOwnerIdentity: sdkOwnerIdentities().find((owner) => owner.ownerId === ownerId)!,
  };
}

function openingObservationVisualGroups() {
  return [{
    acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
    compositionTargetRef: "worldkit://composition-target/central-ascent@1",
    topologyNodeId: "central-ascent",
    semanticLayerId: "ground",
    blockVisualGroupId: "central-ascent-group",
    sourceBoundsMeters: CENTRAL_ASCENT_BOUNDS,
    normalizedBounds: {
      minXBasisPoints: 100,
      minYBasisPoints: 200,
      maxXBasisPoints: 500,
      maxYBasisPoints: 800,
    },
    normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
    coverageBasisPoints: 2_400,
    cameraDepthMeters: 12.5,
    depthOrder: 1,
  }, {
    acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
    compositionTargetRef: "worldkit://composition-target/upper-t-junction@1",
    topologyNodeId: "upper-t-junction",
    semanticLayerId: "upper",
    blockVisualGroupId: "upper-t-junction-group",
    sourceBoundsMeters: UPPER_T_JUNCTION_BOUNDS,
    normalizedBounds: {
      minXBasisPoints: 600,
      minYBasisPoints: 100,
      maxXBasisPoints: 900,
      maxYBasisPoints: 400,
    },
    normalizedCenter: { xBasisPoints: 750, yBasisPoints: 250 },
    coverageBasisPoints: 900,
    cameraDepthMeters: 8,
    depthOrder: 0,
  }];
}

describe("formal measured observation documents", () => {
  it("parses and hashes opening projection measurements without Case expected pixels", () => {
    const value = {
      ...observationIdentity("formal-opening-observation", "camera"),
      controlledSubjectProjection: {
        subjectEntityId: "player",
        centerXBasisPoints: 5_000,
        centerYBasisPoints: 5_000,
        widthBasisPoints: 1_500,
        heightBasisPoints: 4_000,
        coverageBasisPoints: 600,
      },
      visualGroups: openingObservationVisualGroups(),
      observedTopologyRelations: [],
    };
    const parsed = parseFormalOpeningObservationV1(value);
    expect(parsed.visualGroups[0]?.blockVisualGroupId).toBe("central-ascent-group");
    expect(hashFormalOpeningObservationV1(parsed)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => parseFormalOpeningObservationV1({
      ...value,
      observedTopologyRelations: [{
        fromNodeId: "central-ascent",
        relation: "connects-to",
        toNodeId: "upper-t-junction",
      }],
    })).toThrowError("FORMAL_OPENING_OBSERVATION_INVALID");
  });

  it("parses measured support and rejects a stale reset Snapshot join", () => {
    const value = {
      ...observationIdentity("formal-spawn-support-observation", "physics"),
      spawnMarkerId: "player-spawn",
      subjectEntityId: "player",
      supportContact: {
        colliderId: "spawn-ground",
        sourceBlockId: "central-ascent-block",
        surfaceEntityId: "spawn-ground",
        logicalSubshapeId: "primary",
        pointMetersXYZ: [0, 0, 2],
      },
      capsuleFootPointMetersXYZ: [0, 0.02, 2],
      supportGapMillimeters: 20,
      movementMedium: "ground",
      observedTopologyRelations: [],
    };
    const parsed = parseFormalSpawnSupportObservationV1(value);
    expect(parsed.supportContact.colliderId).toBe("spawn-ground");
    expect(hashFormalSpawnSupportObservationV1(parsed)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => parseFormalSpawnSupportObservationV1({
      ...value,
      resetReadySnapshotHash: H("9"),
    })).toThrowError("FORMAL_SPAWN_SUPPORT_OBSERVATION_INVALID");
  });

  it("rejects legacy flat locomotion support state even when the medium agrees", () => {
    const resetReadySnapshot = legacyLocomotionSnapshotFixture();
    expect(() => parseFormalSpawnSupportObservationV1({
      ...observationIdentity(
        "formal-spawn-support-observation",
        "physics",
        resetReadySnapshot,
      ),
      spawnMarkerId: "player-spawn",
      subjectEntityId: "player",
      supportContact: {
        colliderId: "spawn-ground",
        sourceBlockId: "central-ascent-block",
        surfaceEntityId: "spawn-ground",
        logicalSubshapeId: "primary",
        pointMetersXYZ: [0, 0, 2],
      },
      capsuleFootPointMetersXYZ: [0, 0.02, 2],
      supportGapMillimeters: 20,
      movementMedium: "ground",
      observedTopologyRelations: [],
    })).toThrowError("FORMAL_SPAWN_SUPPORT_OBSERVATION_INVALID");
  });

  it("rejects support evidence that disagrees with nested committed movement medium", () => {
    expect(() => parseFormalSpawnSupportObservationV1({
      ...observationIdentity("formal-spawn-support-observation", "physics"),
      spawnMarkerId: "player-spawn",
      subjectEntityId: "player",
      supportContact: {
        colliderId: "spawn-ground",
        sourceBlockId: "central-ascent-block",
        surfaceEntityId: "spawn-ground",
        logicalSubshapeId: "primary",
        pointMetersXYZ: [0, 0, 2],
      },
      capsuleFootPointMetersXYZ: [0, 0.02, 2],
      supportGapMillimeters: 20,
      movementMedium: "air",
      observedTopologyRelations: [],
    })).toThrowError("FORMAL_SPAWN_SUPPORT_OBSERVATION_INVALID");
  });

  it("parses complete frozen-collider overlay joins", () => {
    const value = {
      ...observationIdentity("formal-collider-overlay-observation", "physics"),
      colliders: [{
        colliderId: "spawn-ground",
        sourceBlockIds: ["central-ascent-block"],
        colliderSubshapeId: "collider-subshape:spawn-ground",
        chunkParts: [{
          chunkPartId: "spawn-ground-grid-chunk-xp0-zp0",
          chunkResidencyGroupId: "grid-chunk-xp0-zp0",
          overlayRecordId: "overlay:spawn-ground-grid-chunk-xp0-zp0",
          physicsResidency: {
            mode: "resident",
            physicsBodyId:
              "physics-body:spawn-ground-grid-chunk-xp0-zp0",
          },
        }],
      }],
      observedTopologyRelations: [],
    };
    const parsed = parseFormalColliderOverlayObservationV1(value);
    expect(parsed.colliders).toHaveLength(1);
    expect(hashFormalColliderOverlayObservationV1(parsed)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(() => parseFormalColliderOverlayObservationV1({
      ...value,
      colliders: [{
        ...value.colliders[0],
        colliderSubshapeId: undefined,
        logicalSubshapeId: "primary",
      }],
    })).toThrowError("FORMAL_COLLIDER_OVERLAY_OBSERVATION_INVALID");
    expect(() => parseFormalColliderOverlayObservationV1({
      ...value,
      colliders: [{
        ...value.colliders[0],
        chunkParts: [
          value.colliders[0]!.chunkParts[0],
          value.colliders[0]!.chunkParts[0],
        ],
      }],
    })).toThrowError("FORMAL_COLLIDER_OVERLAY_OBSERVATION_INVALID");
  });

  it("parses independent-reset traversal ticks and measured checkpoints", () => {
    const checkResetReadySnapshot = snapshotFixture();
    const value = {
      ...observationIdentity("formal-scripted-traversal-observation", "input"),
      checks: [{
        id: "reach-junction",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        checkExpectation: "pass",
        resetReadySnapshot: checkResetReadySnapshot,
        resetReadySnapshotHash: sha256CanonicalJson(checkResetReadySnapshot),
        fixedTicks: [{
          tick: 1,
          fixedInputStepIndex: 0,
          committedSnapshotHash: H("8"),
          positionMetersXYZ: [0, 1, 1.5],
          movementMedium: "ground",
        }],
        checkpoints: [{
          checkpointId: "junction",
          outcome: "reached",
          observedAtTick: 1,
        }],
        outcome: "passed",
        observedTopologyRelations: [{
          fromNodeId: "central-ascent",
          relation: "connects-to",
          toNodeId: "upper-t-junction",
        }],
      }],
    };
    const parsed = parseFormalScriptedTraversalObservationV1(value);
    expect(parsed.checks[0]?.fixedTicks[0]?.tick).toBe(1);
    expect(hashFormalScriptedTraversalObservationV1(parsed)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it("rejects accessors and unknown fields in every measured observation parser", () => {
    const value = {
      ...observationIdentity("formal-opening-observation", "camera"),
      visualGroups: [],
      observedTopologyRelations: [],
    };
    Object.defineProperty(value, "guessedBounds", { get: () => [0, 1] });
    expect(() => parseFormalOpeningObservationV1(value)).toThrowError(
      "FORMAL_OPENING_OBSERVATION_INVALID",
    );
  });

  it("joins every observation Package and Build identity to its embedded Request", () => {
    const value = {
      ...observationIdentity("formal-opening-observation", "camera"),
      visualGroups: openingObservationVisualGroups(),
      observedTopologyRelations: [],
    };
    expect(() => parseFormalOpeningObservationV1({
      ...value,
      worldBuildIdentityHash: H("9"),
    })).toThrowError("FORMAL_OPENING_OBSERVATION_INVALID");
    expect(() => parseFormalOpeningObservationV1({
      ...value,
      semanticCaptureMapHash: H("9"),
    })).toThrowError("FORMAL_OPENING_OBSERVATION_INVALID");
    expect(() => parseFormalOpeningObservationV1({
      ...value,
      formalRequestRef: "artifact://case/cloud-temple/attempts/0/stale-request.json",
    })).toThrowError("FORMAL_OPENING_OBSERVATION_INVALID");
  });
});

describe("FormalWorldCaptureReceiptV1", () => {
  it("requires Package, Attempt, Runtime, and SDK owner identities with the three formal views", () => {
    const runtimeSnapshot = snapshotFixture();
    const receipt = parseFormalWorldCaptureReceiptV1(receiptValue(runtimeSnapshot));
    expect(receipt.views.map(({ viewId }) => viewId)).toEqual([
      "opening",
      "world-side",
      "world-top-down",
    ]);
    expect(receipt.views.map(({ pngArtifactRef }) => pngArtifactRef)).toEqual([
      "artifact://case/cloud-temple/capture/opening.png",
      "artifact://case/cloud-temple/capture/world-side.png",
      "artifact://case/cloud-temple/capture/world-top-down.png",
    ]);
    expect(receipt.worldPackageRootHash).toBe(PACKAGE_ROOT);
    expect(receipt.runtimeSessionId).toBe(runtimeSnapshot.runtimeSessionId);
    expect(receipt.cameraRollbackOutcome).toBe("completed");
    expect(receipt.resetOutcome).toBe("completed");
    expect(receipt.cleanupOutcome).toBe("completed");
    expect(receipt.sdkOwnerIdentities.map(({ ownerId }) => ownerId)).toEqual([
      "action",
      "camera",
      "input",
      "physics",
      "subject",
    ]);
    expect(hashFormalWorldCaptureReceiptV1(receipt)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(formalWorldCaptureReceiptCanonicalBytesV1(receipt)).toEqual(
      formalWorldCaptureReceiptCanonicalBytesV1(receiptValue(runtimeSnapshot)),
    );
  });

  it("rejects BWB build-epoch-local screenshots as formal Capture", () => {
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      scope: "build-epoch-local",
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      kind: "babylon-native-block-authoring-capture",
      scope: "build-epoch-local",
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
  });

  it("rejects a mismatched Package, Attempt, or Capture hash", () => {
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      worldPackageRef: `package://world-package/sha256/${"2".repeat(64)}`,
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      sceneAuthoringAttemptHash: PACKAGE_ROOT,
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    const mutated = receiptValue();
    mutated.views[1] = {
      ...mutated.views[1]!,
      requestHash: H("0"),
    };
    expect(() => parseFormalWorldCaptureReceiptV1(mutated)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });

  it("joins every repeated identity to the embedded formal Request", () => {
    const receipt = receiptValue();
    receipt.sceneAuthoringAttemptHash = H("0");
    expect(() => parseFormalWorldCaptureReceiptV1(receipt)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
    const staleRequest = receiptValue();
    staleRequest.formalRequestHash = H("0");
    expect(() => parseFormalWorldCaptureReceiptV1(staleRequest)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
    const staleMaterializer = receiptValue();
    staleMaterializer.nativeBlockMaterializerMetadataHash = H("0");
    expect(() => parseFormalWorldCaptureReceiptV1(staleMaterializer)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
    const staleRequestRef = receiptValue();
    staleRequestRef.formalRequestRef =
      "artifact://case/cloud-temple/attempts/0/stale-request.json";
    expect(() => parseFormalWorldCaptureReceiptV1(staleRequestRef)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });

  it("allows equal content hashes when distinct formal roles legitimately share bytes", () => {
    const receipt = receiptValue();
    const views = receipt.views as unknown as Array<ReturnType<typeof viewRecord>>;
    const topDownView = receipt.views[2]!;
    views[2] = {
      ...topDownView,
      pngContentHash: receipt.views[1]!.pngContentHash,
    };
    const owners = receipt.sdkOwnerIdentities as unknown as Array<{
      ownerId: "action" | "camera" | "input" | "physics" | "subject";
      implementationRef: string;
      implementationHash: Sha256HashV1;
    }>;
    owners[1] = {
      ...receipt.sdkOwnerIdentities[1],
      implementationHash: receipt.sdkOwnerIdentities[0]!.implementationHash,
    };
    expect(parseFormalWorldCaptureReceiptV1(receipt).views[2]?.pngContentHash)
      .toBe(receipt.views[1]!.pngContentHash);
  });

  it("rejects a missing world-side view", () => {
    const receipt = receiptValue();
    receipt.views = [receipt.views[0]!, receipt.views[2]!];
    expect(() => parseFormalWorldCaptureReceiptV1(receipt)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });

  it("rejects a stale Runtime Snapshot", () => {
    expect(() => parseFormalWorldCaptureReceiptV1(receiptValue(snapshotFixture("disposed"))))
      .toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    const mismatchedSession = receiptValue();
    mismatchedSession.runtimeSessionId = "runtime-session-other";
    expect(() => parseFormalWorldCaptureReceiptV1(mismatchedSession))
      .toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    const staleHash = receiptValue();
    staleHash.readySnapshotHash = H("9");
    expect(() => parseFormalWorldCaptureReceiptV1(staleHash)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });

  it("rejects an absent collider overlay when formal overlay evidence is required", () => {
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      colliderOverlayPngContentHash: `sha256:${"0".repeat(64)}`,
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    const missing = receiptValue() as Record<string, unknown>;
    delete missing.colliderOverlayPngArtifactRef;
    expect(() => parseFormalWorldCaptureReceiptV1(missing)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });

  it("rejects removed ambiguous overlay and traversal hash aliases", () => {
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      colliderOverlayHash: H("4"),
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      scriptedTraversalHash: H("5"),
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
  });

  it("rejects failed Camera rollback, Reset, or cleanup", () => {
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      cameraRollbackOutcome: "failed",
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      resetOutcome: "failed",
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    expect(() => parseFormalWorldCaptureReceiptV1({
      ...receiptValue(),
      cleanupOutcome: "failed",
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
  });

  it("rejects a world-side receipt view that uses the object-local right identifier", () => {
    const receipt = receiptValue();
    receipt.views[1] = {
      viewId: "right" as unknown as "world-side",
      request: {
        ...worldSideRequest(),
        viewId: "right",
      } as unknown as ReturnType<typeof worldSideRequest>,
      requestHash: H("q"),
      pngArtifactRef: "artifact://case/cloud-temple/capture/right.png",
      pngContentHash: H("q"),
    };
    expect(() => parseFormalWorldCaptureReceiptV1(receipt)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });
});
