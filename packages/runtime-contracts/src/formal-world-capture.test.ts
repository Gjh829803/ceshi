import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  formalArtifactViewRequestCanonicalBytesV1,
  formalSemanticCaptureMapCanonicalBytesV1,
  formalWorldCaptureRequestCanonicalBytesV1,
  formalWorldCaptureReceiptCanonicalBytesV1,
  hashFormalArtifactViewRequestV1,
  hashFormalColliderOverlayRequestV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalScriptedTraversalRequestV1,
  hashFormalWorldCaptureRequestV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalArtifactViewRequestV1,
  parseFormalSemanticCaptureMapV1,
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

function traversalCheckpointCriteria() {
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
    caseRef: "worldkit://world-reconstruction-case/cloud-temple.case",
    caseHash: H("c"),
    authoringManifestHash: H("d"),
    layoutInventoryHash: H("e"),
    contributionHash: H("f"),
    bindings: [
      {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
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
    traversalCheckBindings: [
      {
        traversalCheckId: "reach-junction",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        checkExpectation: "pass",
        fixedInputSequenceHash: FIXED_INPUT_SEQUENCE_HASH,
        checkpointCriteria: traversalCheckpointCriteria(),
      },
    ],
  };
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
        checkpointCriteria: traversalCheckpointCriteria(),
      },
    ],
  } as const;
  return {
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: "cloud-temple.attempt-0.formal-capture-request",
    caseRef: "worldkit://world-reconstruction-case/cloud-temple.case",
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
    nativeBlockCaptureIdentityInventoryRef:
      "world-package://native/block-capture-identity-inventory.json",
    nativeBlockCaptureIdentityInventoryHash: H("6"),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash: H("7"),
    views: [openingRequest(), worldSideRequest(), worldTopDownRequest()],
    colliderOverlay,
    scriptedTraversal,
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
    nativeBlockCaptureIdentityInventoryHash:
      formalRequest.nativeBlockCaptureIdentityInventoryHash,
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
    colliderOverlayHash: Hx("d4"),
    scriptedTraversalHash: Hx("e5"),
    cameraRollbackOutcome: "completed",
    resetOutcome: "completed",
    cleanupOutcome: "completed",
  };
}

describe("FormalWorldCaptureRequestV1", () => {
  it("freezes one Package-bound Capture transaction including semantic, inventory, overlay, and traversal identities", () => {
    const request = parseFormalWorldCaptureRequestV1(formalRequestValue());
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
    const changedCriteria = traversalCheckpointCriteria().map((criterion) =>
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
  it("parses a hashable closed Case-to-group map", () => {
    const parsed = parseFormalSemanticCaptureMapV1(semanticMapValue());
    expect(parsed.bindings.map(({ acceptanceTargetRef }) => acceptanceTargetRef))
      .toEqual([
        "worldkit://acceptance-target/central-ascent@1",
        "worldkit://acceptance-target/upper-t-junction@1",
      ]);
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
    const staleInventory = receiptValue();
    staleInventory.nativeBlockCaptureIdentityInventoryHash = H("0");
    expect(() => parseFormalWorldCaptureReceiptV1(staleInventory)).toThrowError(
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
      colliderOverlayHash: `sha256:${"0".repeat(64)}`,
    })).toThrowError("FORMAL_WORLD_CAPTURE_RECEIPT_INVALID");
    const missing = receiptValue() as Record<string, unknown>;
    delete missing.colliderOverlayHash;
    expect(() => parseFormalWorldCaptureReceiptV1(missing)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
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
      pngContentHash: H("q"),
    };
    expect(() => parseFormalWorldCaptureReceiptV1(receipt)).toThrowError(
      "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
    );
  });
});
