import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  hashFormalColliderOverlayObservationV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { buildWorldReconstructionEvidenceSetV1 } from "./evaluate-evidence-set.js";
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
          candidateReplayOutcome: "incomplete",
          worldPackageIdentityMatches: true,
          buildIdentityMatches: true,
          captureIdentityMatches: true,
        },
      },
      { dimensionId: "opening-composition", observed: { orderedTargetRefs: ["worldkit://composition-target/package-fixture-opening@1", "worldkit://composition-target/package-fixture-upper@1"], distances: [{ distanceBasisPoints: 300 }] } },
      { dimensionId: "semantic-silhouette", observed: { targets: [
        { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-opening@1", visualGroupId: "ground-group", isSemanticTargetPresent: true },
        { acceptanceTargetRef: "worldkit://acceptance-target/package-fixture-upper@1", visualGroupId: "upper-group", isSemanticTargetPresent: true },
      ] } },
      { dimensionId: "spawn-support", observed: { spawnMarkerId: "player-spawn", supportColliderId: "ground", medium: "ground", supportGapMillimeters: 0 } },
      { dimensionId: "topology", observed: { nodeIds: ["ground", "upper"], relations: [{ fromNodeId: "ground", relation: "connects-to", toNodeId: "upper" }], layerIds: ["ground", "upper"] } },
    ]);
    expect(canonicalJsonBytes(evidence)).toEqual(canonicalJsonBytes(
      buildWorldReconstructionEvidenceSetV1(createEvidenceSetFixtureInputV1()),
    ));
    expect(Object.isFrozen(evidence)).toBe(true);
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
      }],
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
      }],
    });
  });

  it("publishes incomplete Candidate replay when the verified Package Check Result cannot prove runtime-replay", () => {
    const fixture = createEvidenceSetFixtureInputV1();
    const evidence = buildWorldReconstructionEvidenceSetV1(fixture);
    const deterministic = observed(evidence, "deterministic-build");

    expect(fixture.verifiedWorldPackage.nativeSceneCheckResult.diagnostics).toEqual([]);
    expect(deterministic.evidenceRefs).toContain(
      `world-package://${fixture.verifiedWorldPackage.manifest.sceneSource.nativeSceneCheckResultPath}`,
    );
    expect(deterministic.observed).toMatchObject({
      kind: "deterministic-build-observed",
      candidateReplayOutcome: "incomplete",
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
        sourceBlockId: "shadow-ground-block",
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
