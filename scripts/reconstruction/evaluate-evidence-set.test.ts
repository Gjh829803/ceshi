import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  hashFormalColliderOverlayObservationV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { buildWorldReconstructionEvidenceSetV1 } from "./evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;

describe("buildWorldReconstructionEvidenceSetV1", () => {
  it("joins trusted Package, Formal Capture, Snapshot, overlay, and scripted traversal identities", () => {
    const evidence = buildWorldReconstructionEvidenceSetV1(createEvidenceSetFixtureInputV1());

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
      { dimensionId: "deterministic-build", observed: { candidateReplayOutcome: "completed", worldPackageIdentityMatches: true, buildIdentityMatches: true, captureIdentityMatches: true } },
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
