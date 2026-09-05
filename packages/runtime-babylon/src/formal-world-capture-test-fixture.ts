import {
  hashFormalSemanticCaptureMapV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type {
  FormalHostedWorldCapturePayloadV1,
} from "./formal-world-capture-provider.js";

const hash = (character: string) =>
  `sha256:${character.repeat(64)}` as `sha256:${string}`;

export function formalCaptureRequestFixtureV1(): FormalWorldCaptureRequestV1 {
  const fixedInputSequence = [{ actions: [], ticks: 1 }] as const;
  const fixedInputSequenceHash = sha256CanonicalJson(fixedInputSequence);
  const checkpointCriteria = [{
    kind: "reach-position",
    checkpointId: "fixture-checkpoint",
    expectation: "reach",
    sourceVisualGroupId: "fixture-group",
    standPositionMetersXYZ: [0, 1, 0] as const,
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }] as const;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "fixture.semantic-capture-map",
    caseRef: "artifact://world-reconstruction-case/fixture/case.json",
    caseHash: hash("a"),
    authoringManifestHash: hash("b"),
    layoutInventoryHash: hash("c"),
    contributionHash: hash("d"),
    bindings: [{
      acceptanceTargetRef: "worldkit://acceptance-target/fixture-a@1",
      compositionTargetRef: "worldkit://composition-target/fixture-a@1",
      topologyNodeId: "fixture-node",
      semanticLayerId: "ground",
      blockVisualGroupId: "fixture-group",
      semanticClassId: "fixture.structure",
      identityColor: "#AABBCC",
      projectedBoundsSource: "checked-layout-visual-group",
      viewRequirements: [
        { viewId: "opening", mode: "reference-projection-required" },
        { viewId: "world-side", mode: "presence-required" },
        { viewId: "world-top-down", mode: "presence-required" },
      ],
      authoringManifestHash: hash("b"),
      layoutInventoryHash: hash("c"),
      contributionHash: hash("d"),
    }, {
      acceptanceTargetRef: "worldkit://acceptance-target/fixture-b@1",
      compositionTargetRef: "worldkit://composition-target/fixture-b@1",
      topologyNodeId: "fixture-upper-node",
      semanticLayerId: "upper",
      blockVisualGroupId: "fixture-upper-group",
      semanticClassId: "fixture.structure.upper",
      identityColor: "#DDEEFF",
      projectedBoundsSource: "checked-layout-visual-group",
      viewRequirements: [
        { viewId: "opening", mode: "not-required" },
        { viewId: "world-side", mode: "presence-required" },
        { viewId: "world-top-down", mode: "presence-required" },
      ],
      authoringManifestHash: hash("b"),
      layoutInventoryHash: hash("c"),
      contributionHash: hash("d"),
    }],
    topologyRelations: [{
      fromNodeId: "fixture-node",
      relation: "connects-to",
      toNodeId: "fixture-upper-node",
      measurementSource: "scripted-traversal",
      traversalCheckId: "fixture-traversal",
    }],
    traversalCheckBindings: [{
      traversalCheckId: "fixture-traversal",
      acceptanceTargetRef: "worldkit://acceptance-target/fixture-a@1",
      checkExpectation: "pass",
      fixedInputSequenceHash,
      checkpointCriteria,
    }],
  } as const;
  const worldBoundsMeters = {
    minimumMetersXYZ: [-10, 0, -10],
    maximumMetersXYZ: [10, 10, 10],
  } as const;
  const viewport = {
    widthPixels: 320,
    heightPixels: 180,
    devicePixelRatio: 1,
  } as const;
  return parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: "fixture.formal-capture-request",
    formalRequestRef:
      "artifact://case/fixture/attempts/0/formal-world-capture-request.json",
    caseRef: semanticCaptureMap.caseRef,
    caseHash: semanticCaptureMap.caseHash,
    evaluationProfileRef: "artifact://case/fixture/evaluation-profile.json",
    evaluationProfileHash: hash("e"),
    sceneAuthoringRouteDecisionRef:
      "artifact://case/fixture/route-decision.json",
    sceneAuthoringRouteDecisionHash: hash("f"),
    sceneAuthoringAttemptRef: "artifact://case/fixture/attempts/0/attempt.json",
    sceneAuthoringAttemptHash: hash("1"),
    sceneAuthoringAttemptResultRef:
      "artifact://case/fixture/attempts/0/attempt-result.json",
    sceneAuthoringAttemptResultHash: hash("2"),
    worldPackageRef: `package://world-package/sha256/${"3".repeat(64)}`,
    worldPackageRootHash: hash("3"),
    worldBuildIdentityRef: "world-package://world-build-identity.json",
    worldBuildIdentityHash: hash("4"),
    worldPackageBuildReceiptRef:
      "world-package://world-package-build-receipt.json",
    worldPackageBuildReceiptHash: hash("5"),
    semanticCaptureMapRef:
      "artifact://case/fixture/attempts/0/semantic-capture-map.json",
    semanticCaptureMap,
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(
      semanticCaptureMap,
    ),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash: hash("6"),
    views: [{
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "opening",
      projection: "perspective",
      ...viewport,
    }, {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-side",
      projection: "orthographic",
      ...viewport,
      worldBoundsMeters,
      cameraPositionMetersXYZ: [30, 5, 0],
      targetMetersXYZ: [0, 5, 0],
    }, {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "world-top-down",
      projection: "orthographic",
      ...viewport,
      worldBoundsMeters,
      cameraPositionMetersXYZ: [0, 30, 0],
      targetMetersXYZ: [0, 5, 0],
    }],
    colliderOverlay: {
      kind: "formal-collider-overlay-request",
      schemaVersion: 1,
      isRequired: true,
      contributionHash: semanticCaptureMap.contributionHash,
    },
    scriptedTraversal: {
      kind: "formal-scripted-traversal-request",
      schemaVersion: 1,
      checks: [{
        id: "fixture-traversal",
        acceptanceTargetRef: "worldkit://acceptance-target/fixture-a@1",
        checkExpectation: "pass",
        fixedInputSequence,
        fixedInputSequenceHash,
        checkpointCriteria,
      }],
    },
  });
}

export function formalHostedPayloadFixtureV1(input: Readonly<{
  request: FormalWorldCaptureRequestV1;
  runtimeSessionId: string;
  pngBytes?: number;
}>): FormalHostedWorldCapturePayloadV1 {
  const formalRequestHash = hashFormalWorldCaptureRequestV1(input.request);
  const identity = {
    formalRequest: input.request,
    formalRequestHash,
    runtimeSessionId: input.runtimeSessionId,
  };
  const png = () => new Uint8Array(input.pngBytes ?? 8);
  return {
    openingPng: png(),
    worldSidePng: png(),
    worldTopDownPng: png(),
    colliderOverlayPng: png(),
    openingObservation: { ...identity },
    semanticViewObservationSet: { ...identity },
    spawnSupportObservation: { ...identity },
    colliderOverlayObservation: { ...identity },
    scriptedTraversal: { ...identity },
    receiptWithoutCleanup: { ...identity },
  } as unknown as FormalHostedWorldCapturePayloadV1;
}
