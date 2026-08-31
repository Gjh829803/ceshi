import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  formalArtifactViewRequestCanonicalBytesV1,
  formalSemanticCaptureMapCanonicalBytesV1,
  formalWorldCaptureReceiptCanonicalBytesV1,
  hashFormalArtifactViewRequestV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalArtifactViewRequestV1,
  parseFormalSemanticCaptureMapV1,
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
        identityColor: "#c9a96b",
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
        identityColor: "#aeb8c4",
        projectedBoundsSource: "checked-layout-visual-group",
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
        authoringManifestHash: H("d"),
        layoutInventoryHash: H("e"),
        contributionHash: H("f"),
      },
    ],
  };
}

function receiptValue(runtimeSnapshot = snapshotFixture()) {
  const readySnapshot = parseWorldRuntimeSnapshotV4(runtimeSnapshot);
  return {
    kind: "formal-world-capture-receipt",
    schemaVersion: 1,
    id: "cloud-temple.attempt-0.formal-capture",
    caseRef: "artifact://case/cloud-temple/case.json",
    caseHash: H("8"),
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
    runtimeSessionId: readySnapshot.runtimeSessionId,
    readySnapshot,
    readySnapshotHash: sha256CanonicalJson(readySnapshot),
    sdkOwnerIdentities: sdkOwnerIdentities(),
    semanticCaptureMapHash: H("e"),
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
