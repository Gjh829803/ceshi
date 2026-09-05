import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import { evaluateWorldReconstructionV1 } from "@whitebox-world/validation";
import { describe, expect, it } from "vitest";

import {
  assertColliderOverlaySourceJoinClosureV1,
  buildWorldReconstructionEvidenceSetV1,
  projectOpeningCompositionDistancesV1,
  projectColliderEvidenceRoleV1,
  projectMeasuredTraversalCheck,
} from "./evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;

const MIXED_BLOCK_CHECKPOINT_CRITERIA = [{
  kind: "reach-bounds" as const,
  checkpointId: "approach",
  expectation: "reach" as const,
  sourceVisualGroupId: "ground-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-5, -1, -5] as const,
    maximumMetersXYZ: [5, 0, 5] as const,
  },
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}, {
  kind: "block-plane" as const,
  checkpointId: "gate",
  expectation: "block" as const,
  sourceVisualGroupId: "ground-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-5, -1, -5] as const,
    maximumMetersXYZ: [5, 0, 5] as const,
  },
  colliderId: "ground",
  axis: "z" as const,
  sourceFace: "maximum" as const,
  planeMeters: 5,
  expectedCenterSide: "positive" as const,
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}, {
  kind: "pass-plane" as const,
  checkpointId: "threshold",
  expectation: "pass" as const,
  sourceVisualGroupId: "ground-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-5, -1, -5] as const,
    maximumMetersXYZ: [5, 0, 5] as const,
  },
  axis: "z" as const,
  sourceFace: "minimum" as const,
  planeMeters: -5,
  expectedCenterSide: "negative" as const,
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}] as const;

const SINGLE_BLOCK_CHECKPOINT_CRITERION = Object.freeze([{
  kind: "block-plane" as const,
  checkpointId: "cliff-edge",
  expectation: "block" as const,
  sourceVisualGroupId: "cliff-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-5, -1, -5] as const,
    maximumMetersXYZ: [5, 0, 5] as const,
  },
  colliderId: "cliff-wall",
  axis: "z" as const,
  sourceFace: "maximum" as const,
  planeMeters: 5,
  expectedCenterSide: "positive" as const,
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}]);

function observed<
  Id extends "collider" | "critical-traversal" | "deterministic-build",
>(
  evidence: ReturnType<typeof buildWorldReconstructionEvidenceSetV1>,
  dimensionId: Id,
) {
  const row = evidence.observedDimensions.find((entry) =>
    entry.dimensionId === dimensionId);
  if (row === undefined) throw new Error(`${dimensionId} observed row`);
  return row;
}

describe("buildWorldReconstructionEvidenceSetV1", () => {
  it("keeps an all-not-required Opening subset empty through ordinary evaluation", () => {
    const fixture = createEvidenceSetFixtureInputV1({
      allDimensionsPass: true,
      allOpeningNotRequired: true,
    });
    const evidence = buildWorldReconstructionEvidenceSetV1(fixture);
    const opening = evidence.observedDimensions.find(
      ({ dimensionId }) => dimensionId === "opening-composition",
    );
    const silhouette = evidence.observedDimensions.find(
      ({ dimensionId }) => dimensionId === "semantic-silhouette",
    );

    expect(fixture.evaluationProfile.qualityGateMode).toBe("report-only");
    expect(fixture.reconstructionCase.expected.openingComposition).toMatchObject({
      targetRefs: [],
      regions: [],
      anchors: [],
      orderedTargetRefs: [],
    });
    expect(opening?.observed).toEqual({
      kind: "opening-composition-observed",
      regions: [],
      anchors: [],
      orderedTargetRefs: [],
      distances: [],
    });
    if (silhouette?.observed.kind !== "semantic-silhouette-observed") {
      throw new Error("semantic silhouette fixture missing");
    }
    expect(silhouette.observed.views.map(({ viewId }) => viewId)).toEqual([
      "opening",
      "world-side",
      "world-top-down",
    ]);
    expect(silhouette.observed.views[0]!.targets.map(
      ({ structuralProjection }) => structuralProjection.outcome,
    )).toEqual(["outside-viewport", "outside-viewport"]);

    const result = evaluateWorldReconstructionV1({
      case: fixture.reconstructionCase,
      profile: fixture.evaluationProfile,
      evidence,
    });
    expect(result.outcome).toBe("passed");
    expect(result.dimensions.find(
      ({ dimensionId }) => dimensionId === "opening-composition",
    )?.status).toBe("passed");
    expect(result.dimensions.find(
      ({ dimensionId }) => dimensionId === "semantic-silhouette",
    )?.status).toBe("passed");
  });

  it("accepts a ground boundary only without a Block metadata join", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const metadata = fixture.verifiedWorldPackage
      .nativeBlockMaterializerMetadata!;
    const boundary = {
      id: "ground-boundary",
      runtimeRole: "ground-safety-boundary" as const,
    };
    const boundaryOverlay = {
      colliderId: boundary.id,
      sourceBlockIds: [],
      colliderSubshapeId: "collider-subshape:ground-boundary",
      chunkParts: [{
        chunkPartId: "ground-boundary-grid-chunk-xp0-zp0",
        chunkResidencyGroupId: "grid-chunk-xp0-zp0",
        overlayRecordId: "overlay:ground-boundary-grid-chunk-xp0-zp0",
        physicsResidency: { mode: "resident" as const,
          physicsBodyId: "physics-body:ground-boundary-grid-chunk-xp0-zp0" },
      }],
    };
    expect(() => assertColliderOverlaySourceJoinClosureV1({
      contributionColliders: [
        ...fixture.verifiedWorldPackage.nativeSceneContribution.staticColliders,
        boundary,
      ],
      metadata,
      overlayColliders: [
        ...fixture.colliderOverlayObservation.colliders,
        boundaryOverlay,
      ],
    })).not.toThrow();
    expect(() => assertColliderOverlaySourceJoinClosureV1({
      contributionColliders: [
        ...fixture.verifiedWorldPackage.nativeSceneContribution.staticColliders,
        boundary,
      ],
      metadata,
      overlayColliders: [
        ...fixture.colliderOverlayObservation.colliders,
        { ...boundaryOverlay, sourceBlockIds: ["ground-block"] },
      ],
    })).toThrowError(
      /WORLD_RECONSTRUCTION_EVIDENCE_STALE.*boundary.*source Block join/i,
    );
  });

  it("derives step evidence from the selected trusted Block shape", () => {
    expect(projectColliderEvidenceRoleV1({
      kind: "static-surface",
      surfaceEntityId: "step-surface",
      logicalSubshapeId: "step-top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
      traversalSurfaceId: "traversal-surface:step-surface:step-top",
    }, ["step"])).toBe("step");
    expect(projectColliderEvidenceRoleV1({
      kind: "static-surface",
      surfaceEntityId: "group-surface",
      logicalSubshapeId: "group-top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
      traversalSurfaceId: "traversal-surface:group-surface:group-top",
    }, ["step", "full"])).toBe("ground");
  });

  it("canonicalizes adjacent opening distance pairs independently of depth order", () => {
    expect(projectOpeningCompositionDistancesV1([
      {
        compositionTargetRef: "worldkit://composition-target/zeta@1",
        normalizedCenter: { xBasisPoints: 0, yBasisPoints: 0 },
        depthOrder: 0,
      },
      {
        compositionTargetRef: "worldkit://composition-target/alpha@1",
        normalizedCenter: { xBasisPoints: 3, yBasisPoints: 4 },
        depthOrder: 1,
      },
      {
        compositionTargetRef: "worldkit://composition-target/middle@1",
        normalizedCenter: { xBasisPoints: 9, yBasisPoints: 12 },
        depthOrder: 2,
      },
    ])).toEqual([
      {
        fromTargetRef: "worldkit://composition-target/alpha@1",
        toTargetRef: "worldkit://composition-target/middle@1",
        distanceBasisPoints: 10,
      },
      {
        fromTargetRef: "worldkit://composition-target/alpha@1",
        toTargetRef: "worldkit://composition-target/zeta@1",
        distanceBasisPoints: 5,
      },
    ]);
  });

  it("projects a complete frozen criterion set independently of criterion order", () => {
    const criteria = Object.freeze([
      MIXED_BLOCK_CHECKPOINT_CRITERIA[2],
      MIXED_BLOCK_CHECKPOINT_CRITERIA[0],
      MIXED_BLOCK_CHECKPOINT_CRITERIA[1],
    ]);

    expect(projectMeasuredTraversalCheck([
      { checkpointId: "approach", outcome: "reached" },
      { checkpointId: "gate", outcome: "blocked" },
      { checkpointId: "threshold", outcome: "passed" },
    ], criteria, "block")).toEqual({
      outcome: "blocked",
      checkpointIds: ["approach", "gate", "threshold"],
    });
  });

  it("joins trusted Package, Formal Capture, Snapshot, overlay, and scripted traversal identities", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const evidence = buildWorldReconstructionEvidenceSetV1(fixture);
    const checkResultPath =
      fixture.verifiedWorldPackage.manifest.sceneSource.nativeSceneCheckResultPath;

    expect(evidence.identityEvidence.map(({ role }) => role)).toEqual([
      "scene-authoring-attempt",
      "scene-authoring-attempt-result",
      "world-package",
      "world-package-build-receipt",
      "world-build-identity",
      "capture",
    ]);
    expect(evidence.observedDimensions).toMatchObject([
      { dimensionId: "collider", observed: { contributions: [{ colliderId: "ground", role: "ground", hasOverlay: true }] } },
      { dimensionId: "critical-traversal", observed: { checks: [{ id: "reach-ground", outcome: "reached", checkpointIds: ["ground"] }] } },
      {
        dimensionId: "deterministic-build",
        evidenceRefs: [
          fixture.captureReceiptRef,
          fixture.captureReceipt.worldBuildIdentityRef,
          fixture.captureReceipt.worldPackageBuildReceiptRef,
          `world-package://${checkResultPath}`,
        ].sort(),
        observed: {
          candidateReplayOutcome: "completed",
          worldPackageIdentityMatches: true,
          buildIdentityMatches: true,
          captureIdentityMatches: true,
        },
      },
      { dimensionId: "opening-composition", observed: { orderedTargetRefs: ["worldkit://composition-target/package-fixture-opening@1", "worldkit://composition-target/package-fixture-upper@1"], distances: [{ distanceBasisPoints: 300 }] } },
      { dimensionId: "semantic-silhouette", observed: { views: [
        { viewId: "opening", targets: [
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-opening@1", visualGroupId: "ground-group", structuralProjection: { outcome: "projected" } },
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-upper@1", visualGroupId: "upper-group", structuralProjection: { outcome: "projected" } },
        ] },
        { viewId: "world-side", targets: [
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-opening@1", visualGroupId: "ground-group" },
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-upper@1", visualGroupId: "upper-group" },
        ] },
        { viewId: "world-top-down", targets: [
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-opening@1", visualGroupId: "ground-group" },
          { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-upper@1", visualGroupId: "upper-group" },
        ] },
      ] } },
      { dimensionId: "spawn-support", observed: { spawnMarkerId: "player-spawn", supportColliderId: "ground", medium: "ground", supportGapMillimeters: 0 } },
      { dimensionId: "topology", observed: { nodeIds: ["ground", "upper"], relations: [{ fromNodeId: "ground", relation: "connects-to", toNodeId: "upper" }], layerIds: ["ground", "upper"] } },
    ]);
    expect(canonicalJsonBytes(evidence)).toEqual(canonicalJsonBytes(
      buildWorldReconstructionEvidenceSetV1(createEvidenceSetFixtureInputV1()),
    ));
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("accepts the independently reset WorldSession used by scripted traversal", () => {
    const fixture = createEvidenceSetFixtureInputV1({
      independentTraversalReset: true,
    });

    expect(
      fixture.scriptedTraversalObservation.resetReadySnapshot.worldSessionId,
    ).not.toBe(fixture.captureReceipt.readySnapshot.worldSessionId);
    expect(() => buildWorldReconstructionEvidenceSetV1(fixture)).not.toThrow();
  });

  it("projects a measured missing topology relation for evaluator diagnostics", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const opening = parseFormalOpeningObservationV1({
      ...fixture.openingObservation,
      observedTopologyRelations: [],
    });
    const receipt = parseFormalWorldCaptureReceiptV1({
      ...fixture.captureReceipt,
      openingObservationContentHash: hashFormalOpeningObservationV1(opening),
    });

    const evidence = buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      captureReceipt: receipt,
      openingObservation: opening,
    });
    const topology = evidence.observedDimensions.find(
      ({ dimensionId }) => dimensionId === "topology",
    );

    expect(topology?.observed).toMatchObject({
      kind: "topology-observed",
      relations: [],
    });
  });

  it("derives collider roles from Frozen Contribution traversalBinding, not paletteRole or shape", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({ includePaletteTraversalDisagreement: true }),
    );

    expect(observed(evidence, "collider").observed).toEqual({
      kind: "collider-observed",
      contributions: [
        { contributionId: "ground", colliderId: "ground", role: "ground", hasOverlay: true },
        { contributionId: "palette-ground-blocker", colliderId: "palette-ground-blocker", role: "blocker", hasOverlay: false },
        { contributionId: "structure-painted-ground", colliderId: "structure-painted-ground", role: "ground", hasOverlay: false },
      ],
    });
  });

  it("projects reached from the required reach criterion when check-level outcome is passed", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckpoints: [
          { checkpointId: "ground", outcome: "reached", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{ id: "reach-ground", outcome: "reached", checkpointIds: ["ground"] }],
    });
  });

  it("projects blocked from measured checkpoints when they disagree with the check-level passed outcome", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckpoints: [
          { checkpointId: "ground", outcome: "blocked", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{ id: "reach-ground", outcome: "blocked", checkpointIds: ["ground"] }],
    });
  });

  it("projects incomplete when a required checkpoint has no measured evidence", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckpoints: [
          { checkpointId: "unmeasured-ledge", outcome: "reached", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{
        id: "reach-ground",
        outcome: "incomplete",
        checkpointIds: ["unmeasured-ledge"],
      }],
    });
  });

  it("projects incomplete when measured checkpoints contain an extra blocked ID", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckpoints: [
          { checkpointId: "ground", outcome: "reached", observedAtTick: 1 },
          { checkpointId: "pollution", outcome: "blocked", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{
        id: "reach-ground",
        outcome: "incomplete",
        checkpointIds: ["ground", "pollution"],
      }],
    });
  });

  it("exposes a passable block criterion despite unrelated blocked criteria", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckExpectation: "block",
        traversalCheckpointCriteria: MIXED_BLOCK_CHECKPOINT_CRITERIA,
        traversalCheckpoints: [
          { checkpointId: "approach", outcome: "blocked", observedAtTick: 1 },
          { checkpointId: "gate", outcome: "passed", observedAtTick: 1 },
          { checkpointId: "threshold", outcome: "blocked", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{
        id: "reach-ground",
        outcome: "reached",
        checkpointIds: ["approach", "gate", "threshold"],
      }, {
        id: "support-ground",
        outcome: "reached",
        checkpointIds: ["support-ground"],
      }],
    });
  });

  it("preserves a confirmed passable blocker when another criterion is incomplete", () => {
    expect(projectMeasuredTraversalCheck([
      { checkpointId: "approach", outcome: "incomplete" },
      { checkpointId: "gate", outcome: "passed" },
      { checkpointId: "threshold", outcome: "incomplete" },
    ], MIXED_BLOCK_CHECKPOINT_CRITERIA, "block")).toEqual({
      outcome: "reached",
      checkpointIds: ["approach", "gate", "threshold"],
    });
  });

  it("keeps an unmeasured block-plane checkpoint incomplete", () => {
    expect(projectMeasuredTraversalCheck([
      { checkpointId: "cliff-edge", outcome: "incomplete" },
    ], SINGLE_BLOCK_CHECKPOINT_CRITERION, "block")).toEqual({
      outcome: "incomplete",
      checkpointIds: ["cliff-edge"],
    });
  });

  it("projects blocked only when every mixed block-check criterion is satisfied", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(
      createEvidenceSetFixtureInputV1({
        traversalCheckExpectation: "block",
        traversalCheckpointCriteria: MIXED_BLOCK_CHECKPOINT_CRITERIA,
        traversalCheckpoints: [
          { checkpointId: "approach", outcome: "reached", observedAtTick: 1 },
          { checkpointId: "gate", outcome: "blocked", observedAtTick: 1 },
          { checkpointId: "threshold", outcome: "passed", observedAtTick: 1 },
        ],
      }),
    );

    expect(observed(evidence, "critical-traversal").observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{
        id: "reach-ground",
        outcome: "blocked",
        checkpointIds: ["approach", "gate", "threshold"],
      }, {
        id: "support-ground",
        outcome: "reached",
        checkpointIds: ["support-ground"],
      }],
    });
  });

  it("publishes completed Candidate replay from the verified Package dual-replay Check Result", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const evidence = buildWorldReconstructionEvidenceSetV1(fixture);
    const deterministic = observed(evidence, "deterministic-build");

    expect(fixture.verifiedWorldPackage.nativeSceneCheckResult.diagnostics).toEqual([]);
    expect(deterministic.evidenceRefs).toContain(
      `world-package://${fixture.verifiedWorldPackage.manifest.sceneSource.nativeSceneCheckResultPath}`,
    );
    expect(deterministic.observed).toMatchObject({
      kind: "deterministic-build-observed",
      candidateReplayOutcome: "completed",
      worldPackageIdentityMatches: true,
      buildIdentityMatches: true,
      captureIdentityMatches: true,
    });
  });

  it("rejects a valid but cross-wired traversal document from another attempt", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const staleRequest = {
      ...fixture.scriptedTraversalObservation.formalRequest,
      sceneAuthoringAttemptRef: "artifact://case/package-fixture/attempts/1/attempt.json",
      sceneAuthoringAttemptHash: H("a"),
    };
    const stale = parseFormalScriptedTraversalObservationV1({
      ...fixture.scriptedTraversalObservation,
      formalRequest: staleRequest,
      formalRequestHash: hashFormalWorldCaptureRequestV1(staleRequest),
    });
    expect(() => buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      scriptedTraversalObservation: stale,
    })).toThrowError(/WORLD_RECONSTRUCTION_EVIDENCE_STALE.*traversal.*Request/i);
  });

  it("rejects a valid but cross-wired opening observation from another attempt", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const staleRequest = {
      ...fixture.openingObservation.formalRequest,
      sceneAuthoringAttemptRef: "artifact://case/package-fixture/attempts/1/attempt.json",
      sceneAuthoringAttemptHash: H("a"),
    };
    const stale = parseFormalOpeningObservationV1({
      ...fixture.openingObservation,
      formalRequest: staleRequest,
      formalRequestHash: hashFormalWorldCaptureRequestV1(staleRequest),
    });
    expect(() => buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      openingObservation: stale,
    })).toThrowError(/WORLD_RECONSTRUCTION_EVIDENCE_STALE.*opening.*Request/i);
  });

  it("rejects a Capture Receipt whose Package identity drifted from the verified Package", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const driftedRootHash = H("c");
    const driftedRequest = {
      ...fixture.captureReceipt.formalRequest,
      worldPackageRef: `package://world-package/sha256/${"c".repeat(64)}`,
      worldPackageRootHash: driftedRootHash,
    };
    const driftedReceipt = parseFormalWorldCaptureReceiptV1({
      ...fixture.captureReceipt,
      formalRequest: driftedRequest,
      formalRequestHash: hashFormalWorldCaptureRequestV1(driftedRequest),
      worldPackageRef: driftedRequest.worldPackageRef,
      worldPackageRootHash: driftedRootHash,
    });
    expect(() => buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      captureReceipt: driftedReceipt,
    })).toThrowError(/WORLD_RECONSTRUCTION_EVIDENCE_STALE.*Package ref/i);
  });

  it("rejects a Capture Receipt whose Build Identity drifted from the verified Package", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const driftedRequest = {
      ...fixture.captureReceipt.formalRequest,
      worldBuildIdentityHash: H("d"),
    };
    const driftedReceipt = parseFormalWorldCaptureReceiptV1({
      ...fixture.captureReceipt,
      formalRequest: driftedRequest,
      formalRequestHash: hashFormalWorldCaptureRequestV1(driftedRequest),
      worldBuildIdentityHash: H("d"),
    });
    expect(() => buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      captureReceipt: driftedReceipt,
    })).toThrowError(/WORLD_RECONSTRUCTION_EVIDENCE_STALE.*Build Identity/i);
  });

  it("rejects an overlay collider whose source Block is absent from trusted metadata", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const forged = parseFormalColliderOverlayObservationV1({
      ...fixture.colliderOverlayObservation,
      colliders: fixture.colliderOverlayObservation.colliders.map((collider) => ({
        ...collider,
        sourceBlockIds: ["shadow-ground-block"],
      })),
    });
    const forgedReceipt = parseFormalWorldCaptureReceiptV1({
      ...fixture.captureReceipt,
      colliderOverlayObservationContentHash:
        hashFormalColliderOverlayObservationV1(forged),
    });
    expect(() => buildWorldReconstructionEvidenceSetV1({
      ...fixture,
      captureReceipt: forgedReceipt,
      colliderOverlayObservation: forged,
    })).toThrowError(/WORLD_RECONSTRUCTION_EVIDENCE_STALE.*Block metadata/i);
  });
});
