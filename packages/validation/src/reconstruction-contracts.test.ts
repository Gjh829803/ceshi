import { describe, expect, it } from "vitest";

import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseArtifactRefV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionDiagnosticV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  parseWorldReconstructionRunReceiptV1,
  worldReconstructionCaseCanonicalBytesV1,
  worldReconstructionDiagnosticCanonicalBytesV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
} from "./reconstruction-contracts.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;
const H01 = `sha256:${"01".repeat(32)}` as const;
const DIMENSIONS = [
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const;

const missingDiagnosticFields = (
  targetRef = "worldkit://acceptance-target/central-ascent@1",
  targetId = "collider",
) => ({
  targetRef,
  targetId,
  metricId: "required-evidence-presence",
  details: {
    kind: "presence-mismatch",
    expectedValue: "present",
    actualValue: "missing",
    correctionDirection: "add",
  },
} as const);

const colliderRepairFields = (
  targetRef = "worldkit://acceptance-target/upper-t-junction@1",
  targetId = "west-wall",
) => ({
  targetRef,
  targetId,
  metricId: "collider-contribution-presence",
  details: {
    kind: "presence-mismatch",
    expectedValue: "present",
    actualValue: "missing",
    correctionDirection: "add",
  },
  repairAction: {
    kind: "revise-native-source",
    targetKind: "static-collider",
    targetId,
    operation: "add",
    instruction: `Register missing static collider ${targetId}.`,
  },
} as const);

const caseValue = () => ({
  kind: "world-reconstruction-case",
  schemaVersion: 1,
  id: "cloud-temple.case",
  sceneBriefRef: "artifact://case/cloud-temple/scene-brief.json",
  sceneBriefHash: H("a"),
  referenceInputs: [
    {
      inputRef: "artifact://case/cloud-temple/reference.png",
      contentHash: H("b"),
      mediaType: "image/png",
    },
  ],
  evaluationProfileRef: "worldkit://reconstruction-evaluation-profile/cloud-temple@1",
  evaluationProfileHash: H("c"),
  formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
  formalCaptureIntentHash: H("d"),
  acceptanceTargetRefs: [
    "worldkit://acceptance-target/central-ascent@1",
    "worldkit://acceptance-target/upper-t-junction@1",
  ],
  requiredEvidenceProfileRefs: [
    "worldkit://evidence-profile/native-block-formal-capture@1",
  ],
  expected: {
    topology: {
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
      nodeIds: ["central-ascent", "upper-t-junction"],
      relations: [{ fromNodeId: "central-ascent", relation: "connects-to", toNodeId: "upper-t-junction" }],
      layerIds: ["ground", "upper"],
    },
    semanticSilhouetteTargets: [{
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      visualGroupId: "central-ascent-group",
      normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 },
      normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 }, coverageBasisPoints: 2_400,
    }],
    openingComposition: {
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      targetRefs: ["worldkit://composition-target/opening@1"],
      regions: [{ targetRef: "worldkit://composition-target/opening@1", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } }],
      anchors: [{ targetRef: "worldkit://composition-target/opening@1", normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } }],
      orderedTargetRefs: ["worldkit://composition-target/opening@1"],
    },
    spawnSupport: { acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", spawnMarkerId: "player-spawn", supportColliderId: "spawn-ground", expectedMedium: "ground", expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 } },
    colliders: [
      { acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", contributionId: "spawn-ground-contribution", colliderId: "spawn-ground", role: "ground", requiresOverlay: true },
      { acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1", contributionId: "west-wall-contribution", colliderId: "west-wall", role: "blocker", requiresOverlay: true },
    ],
    criticalTraversalChecks: [{
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1", id: "reach-junction", evidenceKind: "scripted-fixed-input", expectation: "pass", checkpointIds: ["junction", "spawn"],
      fixedInputSequence: [{ actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 12 }, { actions: ["jump"], ticks: 1 }, { actions: ["move-forward"], ticks: 8 }],
    }],
    deterministicBuild: { acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", requiresCandidateReplay: true, requiresWorldPackageIdentityAgreement: true, requiresBuildIdentityAgreement: true, requiresCaptureIdentityAgreement: true },
  },
});

const profileValue = () => ({
  kind: "world-reconstruction-evaluation-profile",
  schemaVersion: 1,
  id: "cloud-temple.profile",
  dimensionIds: [...DIMENSIONS],
  maximumRepairAttemptCount: 1,
  builderSelfRepairAttemptCount: 0,
  thresholds: {
    semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", maximumBoundsDriftBasisPoints: 100, maximumCenterDriftBasisPoints: 100, maximumCoverageDriftBasisPoints: 100 }],
    openingComposition: { regions: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], maximumOrderDistanceBasisPoints: 100 },
    spawnSupport: { maximumPositionDriftMillimeters: 100, maximumSupportGapMillimeters: 10 },
  },
  requiredEvidenceByDimension: DIMENSIONS.map((dimensionId) => ({
    dimensionId,
    evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
  })),
});

const evidenceValue = () => ({
  kind: "world-reconstruction-evidence-set",
  schemaVersion: 1,
  id: "cloud-temple.attempt-0.evidence",
  caseRef: "artifact://world-reconstruction-case/cloud-temple.case/case.json",
  caseHash: H("d"),
  evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
  evaluationProfileHash: H("e"),
  attemptRef: "artifact://case/cloud-temple/attempts/0/attempt.json",
  attemptHash: H("f"),
  sceneAuthoringAttemptResultRef: "artifact://case/cloud-temple/attempts/0/attempt-result.json",
  sceneAuthoringAttemptResultHash: H("6"),
  worldPackageRef: `package://world-package/sha256/${"1".repeat(64)}`,
  worldPackageRootHash: H("1"),
  worldBuildIdentityRef: "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
  worldBuildIdentityHash: H("8"),
  worldPackageBuildReceiptRef: "artifact://case/cloud-temple/attempts/0/world-package-build-receipt.json",
  worldPackageBuildReceiptHash: H("7"),
  captureReceiptRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json",
  captureReceiptHash: H("2"),
  identityEvidence: [
    { role: "scene-authoring-attempt", artifactRef: "artifact://case/cloud-temple/attempts/0/attempt.json", contentHash: H("f") },
    { role: "scene-authoring-attempt-result", artifactRef: "artifact://case/cloud-temple/attempts/0/attempt-result.json", contentHash: H("6") },
    { role: "world-package", artifactRef: `package://world-package/sha256/${"1".repeat(64)}`, contentHash: H("1") },
    { role: "world-package-build-receipt", artifactRef: "artifact://case/cloud-temple/attempts/0/world-package-build-receipt.json", contentHash: H("7") },
    { role: "world-build-identity", artifactRef: "artifact://case/cloud-temple/attempts/0/world-build-identity.json", contentHash: H("8") },
    { role: "capture", artifactRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json", contentHash: H("2") },
  ],
  observedDimensions: [
    { dimensionId: "collider", evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"], observed: { kind: "collider-observed", contributions: [{ contributionId: "spawn-ground-contribution", colliderId: "spawn-ground", role: "ground", hasOverlay: true }, { contributionId: "west-wall-contribution", colliderId: "west-wall", role: "blocker", hasOverlay: true }] } },
    { dimensionId: "critical-traversal", evidenceRefs: ["artifact://case/cloud-temple/evidence/critical-traversal.json"], observed: { kind: "critical-traversal-observed", checks: [{ id: "reach-junction", outcome: "reached", checkpointIds: ["junction", "spawn"] }] } },
    { dimensionId: "deterministic-build", evidenceRefs: ["artifact://case/cloud-temple/evidence/deterministic-build.json"], observed: { kind: "deterministic-build-observed", candidateReplayOutcome: "completed", worldPackageIdentityMatches: true, buildIdentityMatches: true, captureIdentityMatches: true } },
    { dimensionId: "opening-composition", evidenceRefs: ["artifact://case/cloud-temple/evidence/opening-composition.json"], observed: { kind: "opening-composition-observed", regions: [{ targetRef: "worldkit://composition-target/opening@1", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } }], orderedTargetRefs: ["worldkit://composition-target/opening@1"], distances: [] } },
    { dimensionId: "semantic-silhouette", evidenceRefs: ["artifact://case/cloud-temple/evidence/semantic-silhouette.json"], observed: { kind: "semantic-silhouette-observed", targets: [{ acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", visualGroupId: "central-ascent-group", isSemanticTargetPresent: true, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 }, normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 }, coverageBasisPoints: 2_400 }] } },
    { dimensionId: "spawn-support", evidenceRefs: ["artifact://case/cloud-temple/evidence/spawn-support.json"], observed: { kind: "spawn-support-observed", spawnMarkerId: "player-spawn", supportColliderId: "spawn-ground", medium: "ground", positionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 }, supportGapMillimeters: 0 } },
    { dimensionId: "topology", evidenceRefs: ["artifact://case/cloud-temple/evidence/topology.json"], observed: { kind: "topology-observed", nodeIds: ["central-ascent", "upper-t-junction"], relations: [{ fromNodeId: "central-ascent", relation: "connects-to", toNodeId: "upper-t-junction" }], layerIds: ["ground", "upper"] } },
  ],
  advisoryPixelMetrics: [
    { kind: "ratio-basis-points", valueBasisPoints: 7_500 },
  ],
});

const resultValue = () => ({
  kind: "world-reconstruction-evaluation-result",
  schemaVersion: 1,
  id: "cloud-temple.attempt-0.result",
  caseRef: "artifact://world-reconstruction-case/cloud-temple.case/case.json",
  caseHash: H("d"),
  evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
  evaluationProfileHash: H("e"),
  evidenceSetRef: "artifact://case/cloud-temple/attempts/0/evidence-set.json",
  evidenceSetHash: H("3"),
  attemptRef: "artifact://case/cloud-temple/attempts/0/attempt.json",
  attemptHash: H("f"),
  worldPackageRef: `package://world-package/sha256/${"1".repeat(64)}`,
  worldPackageRootHash: H("1"),
  worldBuildIdentityRef: "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
  worldBuildIdentityHash: H("8"),
  captureReceiptRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json",
  captureReceiptHash: H("2"),
  outcome: "passed",
  diagnostics: [],
  dimensions: DIMENSIONS.map((dimensionId) => ({
    dimensionId,
    status: "passed",
    metrics: [{ kind: "boolean-presence", isPresent: true }],
    evidenceRefs: [`artifact://case/cloud-temple/evidence/${dimensionId}.json`],
    diagnosticIds: [],
    identity: {
      attemptHash: H("f"),
      worldPackageRootHash: H("1"),
      worldBuildIdentityHash: H("8"),
      captureReceiptHash: H("2"),
    },
  })),
});

describe("world reconstruction contracts", () => {
  it("accepts only the canonical World Reconstruction Case artifact Ref", () => {
    expect(parseWorldReconstructionCaseArtifactRefV1(
      "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    )).toBe(
      "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    );
    for (const invalidRef of [
      "worldkit://world-reconstruction-case/cloud-temple.case",
      "artifact://case/cloud-temple.case/case.json",
      "artifact://user@world-reconstruction-case/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case:443/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/cloud-temple.case/case.json?attempt=0",
      "artifact://world-reconstruction-case/cloud-temple.case/case.json#case",
      "artifact://world-reconstruction-case/../cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/%63loud-temple.case/case.json",
      "artifact://WORLD-RECONSTRUCTION-CASE/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/cafe\u0301/case.json",
    ]) {
      expect(() => parseWorldReconstructionCaseArtifactRefV1(invalidRef)).toThrowError(
        "WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID",
      );
    }
  });

  it.each([
    "Cloud-temple.case",
    "cloud_temples.case",
    "cloud-temple.case/../other.case",
    "cloud-temple.case?attempt=0",
    "cafe\u0301.case",
  ])("rejects non-canonical Case id %j", (id) => {
    expect(() => parseWorldReconstructionCaseV1({ ...caseValue(), id }))
      .toThrowError("WORLD_RECONSTRUCTION_CASE_INVALID");
  });

  it("rejects old Case Ref dialects in Evidence and Result admission", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseWorldReconstructionEvidenceSetV1({
        ...evidenceValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
      expect(() => parseWorldReconstructionEvaluationResultV1({
        ...resultValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("rejects old Case Ref dialects in Evidence and Result admission", () => {
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseWorldReconstructionEvidenceSetV1({
        ...evidenceValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
      expect(() => parseWorldReconstructionEvaluationResultV1({
        ...resultValue(),
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
  });

  it("rejects passed dimensions that declare generic missing or stale evidence", () => {
    for (const code of [
      "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
      "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
    ] as const) {
      const result: any = resultValue();
      result.dimensions[0].diagnosticIds = ["diag.generic-evidence"];
      result.diagnostics = [{
        kind: "world-reconstruction-diagnostic", schemaVersion: 1,
        id: "diag.generic-evidence", code, dimensionId: "collider",
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        ...(code === "WORLD_RECONSTRUCTION_COLLIDER_MISSING"
          ? colliderRepairFields("worldkit://acceptance-target/central-ascent@1")
          : code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
            ? {
                targetRef: "worldkit://acceptance-target/central-ascent@1",
                targetId: "collider",
                metricId: "evidence-identity",
                details: {
                  kind: "state-mismatch",
                  expectedValue: "current",
                  actualValue: "stale",
                  correctionDirection: "replace",
                },
              }
            : missingDiagnosticFields()),
        evidenceRefs: [], message: "Evidence cannot support a pass.",
      }];
      expect(() => parseWorldReconstructionEvaluationResultV1(result)).toThrowError(
        "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
      );
    }
  });

  it("allows generic missing or stale evidence diagnostics in their explicit dimension only", () => {
    const incomplete: any = resultValue();
    incomplete.dimensions[5]!.status = "incomplete";
    incomplete.dimensions[5]!.metrics = [];
    incomplete.dimensions[5]!.evidenceRefs = [];
    incomplete.dimensions[5]!.diagnosticIds = ["diag.spawn-missing"];
    incomplete.diagnostics = [{
      kind: "world-reconstruction-diagnostic", schemaVersion: 1, id: "diag.spawn-missing",
      code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING", dimensionId: "spawn-support",
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", evidenceRefs: [],
      ...missingDiagnosticFields("worldkit://acceptance-target/central-ascent@1", "spawn-support"),
      message: "Spawn support evidence is absent.",
    }];
    incomplete.outcome = "incomplete";
    expect(parseWorldReconstructionEvaluationResultV1(incomplete).dimensions[5]!.status).toBe("incomplete");

    const stale = structuredClone(incomplete);
    stale.dimensions[0]!.status = "incomplete";
    stale.dimensions[0]!.metrics = [];
    stale.dimensions[0]!.evidenceRefs = [];
    stale.dimensions[0]!.diagnosticIds = ["diag.collider-stale"];
    stale.diagnostics = [{
      ...stale.diagnostics[0]!,
      id: "diag.collider-stale",
      code: "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      dimensionId: "collider",
      targetId: "collider",
      metricId: "evidence-identity",
      details: {
        kind: "state-mismatch",
        expectedValue: "current",
        actualValue: "stale",
        correctionDirection: "replace",
      },
    }];
    stale.dimensions[5]!.status = "passed";
    stale.dimensions[5]!.metrics = [{ kind: "boolean-presence", isPresent: true }];
    stale.dimensions[5]!.evidenceRefs = ["artifact://case/cloud-temple/evidence/spawn-support.json"];
    stale.dimensions[5]!.diagnosticIds = [];
    expect(parseWorldReconstructionEvaluationResultV1(stale).dimensions[0]!.status).toBe("incomplete");

    const wrongSpecificDimension = structuredClone(incomplete);
    wrongSpecificDimension.diagnostics[0]!.code = "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING";
    wrongSpecificDimension.diagnostics[0]!.dimensionId = "collider";
    Object.assign(wrongSpecificDimension.diagnostics[0]!, {
      targetId: "player-spawn",
      metricId: "spawn-position-drift-millimeters",
      details: {
        kind: "millimeters-threshold",
        expectedMillimeters: 0,
        actualMillimeters: 200,
        maximumAllowedDriftMillimeters: 100,
        exceededByMillimeters: 100,
        correctionDirection: "decrease",
      },
      repairAction: {
        kind: "revise-native-source",
        targetKind: "spawn-marker",
        targetId: "player-spawn",
        operation: "move",
        instruction: "Move player-spawn toward the expected position.",
      },
    });
    expect(() => parseWorldReconstructionEvaluationResultV1(wrongSpecificDimension)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
  });

  it("admits an evidence-missing dimension only with an empty evidence list", () => {
    const evidence = evidenceValue();
    evidence.observedDimensions[0]!.evidenceRefs = [];
    (evidence.observedDimensions[0] as { observed: unknown }).observed = { kind: "evidence-missing" };
    expect(parseWorldReconstructionEvidenceSetV1(evidence).observedDimensions[0]).toMatchObject({
      observed: { kind: "evidence-missing" }, evidenceRefs: [],
    });
  });

  it("admits Profile-owned thresholds and observed rows with build identity and evidence refs", () => {
    const profile = profileValue();
    Object.assign(profile, {
      thresholds: {
        semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", maximumBoundsDriftBasisPoints: 100, maximumCenterDriftBasisPoints: 100, maximumCoverageDriftBasisPoints: 100 }],
        openingComposition: { regions: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], maximumOrderDistanceBasisPoints: 100 },
        spawnSupport: { maximumPositionDriftMillimeters: 100, maximumSupportGapMillimeters: 10 },
      },
    });
    expect(parseWorldReconstructionEvaluationProfileV1(profile)).toMatchObject({
      thresholds: { spawnSupport: { maximumSupportGapMillimeters: 10 } },
    });
  });

  it("admits one source-neutral seven-dimension expected and observed evaluation contract", () => {
    expect(parseWorldReconstructionCaseV1(caseValue())).toMatchObject({
      expected: { deterministicBuild: { requiresCandidateReplay: true } },
    });
    expect(parseWorldReconstructionEvidenceSetV1(evidenceValue())).toMatchObject({
      observedDimensions: expect.arrayContaining([
        expect.objectContaining({ dimensionId: "topology" }),
      ]),
    });
  });

  it("parses, freezes, canonicalizes, and hashes a closed Case", () => {
    const parsed = parseWorldReconstructionCaseV1(caseValue());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.expected.topology.relations)).toBe(true);
    expect(Object.isFrozen(parsed.expected.criticalTraversalChecks[0]!.fixedInputSequence)).toBe(true);
    expect(parsed.expected.criticalTraversalChecks[0]!.fixedInputSequence.every((step) =>
      Object.isFrozen(step) && Object.isFrozen(step.actions)
    )).toBe(true);
    expect(Object.isFrozen(parsed.expected.criticalTraversalChecks[0]!.fixedInputSequence[0]!.axes)).toBe(true);
    expect(worldReconstructionCaseCanonicalBytesV1(parsed)).toEqual(
      worldReconstructionCaseCanonicalBytesV1(caseValue()),
    );
    expect(hashWorldReconstructionCaseV1(parsed)).toMatch(/^sha256:[a-f0-9]{64}$/);
    const differentScript = caseValue();
    differentScript.expected.criticalTraversalChecks[0]!.fixedInputSequence[0]!.ticks = 13;
    expect(hashWorldReconstructionCaseV1(differentScript)).not.toEqual(
      hashWorldReconstructionCaseV1(caseValue()),
    );
    expect(() => parseWorldReconstructionCaseV1({ ...caseValue(), legacyAlias: true })).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
    const missingIntentRef = { ...caseValue() } as Record<string, unknown>;
    delete missingIntentRef.formalCaptureIntentRef;
    expect(() => parseWorldReconstructionCaseV1(missingIntentRef)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
    expect(() => parseWorldReconstructionCaseV1({
      ...caseValue(),
      formalCaptureIntentRef: "formal-world-capture-intent.json",
    })).toThrowError("WORLD_RECONSTRUCTION_CASE_INVALID");
    expect(hashWorldReconstructionCaseV1({
      ...caseValue(),
      formalCaptureIntentHash: H("e"),
    })).not.toBe(hashWorldReconstructionCaseV1(caseValue()));
  });

  it("requires non-empty acceptance/evidence targets and scripted fixed-input semantics", () => {
    expect(() => parseWorldReconstructionCaseV1({ ...caseValue(), acceptanceTargetRefs: [] })).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
    expect(() => parseWorldReconstructionCaseV1({ ...caseValue(), requiredEvidenceProfileRefs: [] })).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
    const routeClaim = caseValue();
    routeClaim.expected.criticalTraversalChecks[0]!.evidenceKind = "formal-route" as "scripted-fixed-input";
    expect(() => parseWorldReconstructionCaseV1(routeClaim)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
  });

  it("requires exact unique Case/Profile threshold target closure", () => {
    const caseDraft = caseValue();
    caseDraft.requiredEvidenceProfileRefs = DIMENSIONS.map(
      (dimensionId) => `worldkit://evidence-profile/${dimensionId}@1`,
    );
    const reconstructionCase = parseWorldReconstructionCaseV1(caseDraft);
    const profile = parseWorldReconstructionEvaluationProfileV1(profileValue());
    const semanticThreshold = profile.thresholds.semanticSilhouetteTargets[0]!;
    const regionThreshold = profile.thresholds.openingComposition.regions[0]!;
    const anchorThreshold = profile.thresholds.openingComposition.anchors[0]!;

    expect(worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, profile)).toBe(true);

    for (const semanticSilhouetteTargets of [
      [],
      [semanticThreshold, semanticThreshold],
      [semanticThreshold, { ...semanticThreshold, acceptanceTargetRef: "worldkit://acceptance-target/extra@1" }],
    ]) {
      expect(worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, {
        ...profile,
        thresholds: { ...profile.thresholds, semanticSilhouetteTargets },
      })).toBe(false);
    }

    for (const regions of [
      [],
      [regionThreshold, regionThreshold],
      [regionThreshold, { ...regionThreshold, targetRef: "worldkit://composition-target/extra@1" }],
    ]) {
      expect(worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, {
        ...profile,
        thresholds: {
          ...profile.thresholds,
          openingComposition: { ...profile.thresholds.openingComposition, regions },
        },
      })).toBe(false);
    }

    for (const anchors of [
      [],
      [anchorThreshold, anchorThreshold],
      [anchorThreshold, { ...anchorThreshold, targetRef: "worldkit://composition-target/extra@1" }],
    ]) {
      expect(worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, {
        ...profile,
        thresholds: {
          ...profile.thresholds,
          openingComposition: { ...profile.thresholds.openingComposition, anchors },
        },
      })).toBe(false);
    }
  });

  it("requires opening order to declare every frozen opening target", () => {
    const missingOpeningOrderTarget = caseValue();
    missingOpeningOrderTarget.expected.openingComposition.targetRefs = [
      "worldkit://composition-target/opening@1",
      "worldkit://composition-target/side@1",
    ];
    missingOpeningOrderTarget.expected.openingComposition.regions.push({
      targetRef: "worldkit://composition-target/side@1",
      normalizedBounds: { minXBasisPoints: 600, minYBasisPoints: 200, maxXBasisPoints: 900, maxYBasisPoints: 800 },
    });
    missingOpeningOrderTarget.expected.openingComposition.anchors.push({
      targetRef: "worldkit://composition-target/side@1",
      normalizedCenter: { xBasisPoints: 750, yBasisPoints: 500 },
    });
    expect(() => parseWorldReconstructionCaseV1(missingOpeningOrderTarget)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
  });

  it("rejects incomplete expected declarations and malformed observed dimensions", () => {
    const missingThreshold = profileValue();
    delete (missingThreshold.thresholds.semanticSilhouetteTargets[0] as {
      maximumCoverageDriftBasisPoints?: unknown;
    }).maximumCoverageDriftBasisPoints;
    expect(() => parseWorldReconstructionEvaluationProfileV1(missingThreshold)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    );

    const undeclaredSilhouette = caseValue();
    undeclaredSilhouette.expected.semanticSilhouetteTargets[0]!.acceptanceTargetRef =
      "worldkit://acceptance-target/not-declared@1";
    expect(() => parseWorldReconstructionCaseV1(undeclaredSilhouette)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );

    const undeclaredOpening = caseValue();
    undeclaredOpening.expected.openingComposition.regions[0]!.targetRef =
      "worldkit://composition-target/not-declared@1";
    expect(() => parseWorldReconstructionCaseV1(undeclaredOpening)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );

    const missingDimension = evidenceValue();
    missingDimension.observedDimensions.pop();
    expect(() => parseWorldReconstructionEvidenceSetV1(missingDimension)).toThrowError(
      "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
    );

    const wrongDiscriminator = evidenceValue();
    wrongDiscriminator.observedDimensions[0]!.observed.kind = "topology-observed";
    expect(() => parseWorldReconstructionEvidenceSetV1(wrongDiscriminator)).toThrowError(
      "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
    );

    const duplicateContributions = evidenceValue();
    (duplicateContributions.observedDimensions[0]!.observed as {
      contributions: { contributionId: string; colliderId: string; role: string; hasOverlay: boolean }[];
    }).contributions.push({
      contributionId: "spawn-ground-contribution",
      colliderId: "other-ground",
      role: "ground",
      hasOverlay: true,
    });
    expect(() => parseWorldReconstructionEvidenceSetV1(duplicateContributions)).toThrowError(
      "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
    );

    expect(() => parseWorldReconstructionEvidenceSetV1({
      ...evidenceValue(),
      unexpected: true,
    })).toThrowError("WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID");
  });

  it("preserves source-neutral observed failures for evaluator comparison", () => {
    const evidence = evidenceValue();
    const observed = evidence.observedDimensions as any[];
    observed[0].observed.contributions[1].role = "ground";
    observed[0].observed.contributions[1].hasOverlay = false;
    observed[1].observed.checks[0].outcome = "blocked";
    observed[1].observed.checks[0].checkpointIds = ["checkpoint-missing"];
    observed[2].observed.candidateReplayOutcome = "failed";
    observed[2].observed.worldPackageIdentityMatches = false;
    observed[2].observed.captureIdentityMatches = false;
    observed[5].observed.medium = "air";
    observed[5].observed.supportGapMillimeters = 999;

    const parsed = parseWorldReconstructionEvidenceSetV1(evidence);
    expect(parsed.observedDimensions[0]!.observed).toMatchObject({
      kind: "collider-observed",
      contributions: [expect.anything(), { role: "ground", hasOverlay: false }],
    });
    expect(parsed.observedDimensions[1]!.observed).toMatchObject({
      kind: "critical-traversal-observed",
      checks: [{ outcome: "blocked", checkpointIds: ["checkpoint-missing"] }],
    });
    expect(parsed.observedDimensions[2]!.observed).toMatchObject({
      kind: "deterministic-build-observed",
      candidateReplayOutcome: "failed",
      worldPackageIdentityMatches: false,
      captureIdentityMatches: false,
    });
    expect(parsed.observedDimensions[5]!.observed).toMatchObject({
      kind: "spawn-support-observed", medium: "air", supportGapMillimeters: 999,
    });
  });

  it("requires a complete, non-empty, valid fixed-input script and preserves its execution order", () => {
    const missingScript = caseValue();
    delete (missingScript.expected.criticalTraversalChecks[0] as { fixedInputSequence?: unknown }).fixedInputSequence;
    expect(() => parseWorldReconstructionCaseV1(missingScript)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );

    const emptyScript = caseValue();
    emptyScript.expected.criticalTraversalChecks[0]!.fixedInputSequence = [];
    expect(() => parseWorldReconstructionCaseV1(emptyScript)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );

    const invalidScript = caseValue();
    invalidScript.expected.criticalTraversalChecks[0]!.fixedInputSequence = [
      { actions: ["go-to"], ticks: 1 },
    ];
    expect(() => parseWorldReconstructionCaseV1(invalidScript)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );

    const orderSensitiveScript = caseValue();
    orderSensitiveScript.expected.criticalTraversalChecks[0]!.fixedInputSequence = [
      { actions: ["move-forward"], ticks: 12 },
      { actions: ["jump"], ticks: 1 },
      { actions: ["move-backward"], ticks: 4 },
    ];
    expect(parseWorldReconstructionCaseV1(orderSensitiveScript)
      .expected.criticalTraversalChecks[0]!.fixedInputSequence.map(({ ticks }) => ticks)).toEqual([12, 1, 4]);

    const unorderedCheckpoints = caseValue();
    unorderedCheckpoints.expected.criticalTraversalChecks[0]!.checkpointIds = ["spawn", "junction"];
    expect(() => parseWorldReconstructionCaseV1(unorderedCheckpoints)).toThrowError(
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    );
  });

  it("fixes all seven dimensions and the one-repair profile", () => {
    const parsed = parseWorldReconstructionEvaluationProfileV1(profileValue());
    expect(parsed.dimensionIds).toEqual(DIMENSIONS);
    expect(() => parseWorldReconstructionEvaluationProfileV1({ ...profileValue(), maximumRepairAttemptCount: 2 })).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    );
    expect(() => parseWorldReconstructionEvaluationProfileV1({ ...profileValue(), builderSelfRepairAttemptCount: 1 })).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    );
  });

  it("requires internally consistent Attempt, Package, and Capture evidence identities", () => {
    expect(parseWorldReconstructionEvidenceSetV1(evidenceValue()).identityEvidence.map(({ role }) => role)).toEqual([
      "scene-authoring-attempt",
      "scene-authoring-attempt-result",
      "world-package",
      "world-package-build-receipt",
      "world-build-identity",
      "capture",
    ]);
    const stale = evidenceValue();
    stale.identityEvidence[3]!.contentHash = H("9");
    expect(() => parseWorldReconstructionEvidenceSetV1(stale)).toThrowError(
      "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
    );
    const incompleteClosure = evidenceValue();
    incompleteClosure.identityEvidence = incompleteClosure.identityEvidence.slice(0, -1);
    expect(() => parseWorldReconstructionEvidenceSetV1(incompleteClosure)).toThrowError(
      "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
    );
  });

  it("requires every independent dimension and has no aggregate score", () => {
    const parsed = parseWorldReconstructionEvaluationResultV1(resultValue());
    expect(parsed.dimensions.map(({ dimensionId }) => dimensionId)).toEqual(DIMENSIONS);
    expect("aggregateScore" in parsed).toBe(false);
    expect(() => parseWorldReconstructionEvaluationResultV1({
      ...resultValue(),
      dimensions: resultValue().dimensions.filter(({ dimensionId }) => dimensionId !== "collider"),
    })).toThrowError("WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID");
    expect(() => parseWorldReconstructionEvaluationResultV1({ ...resultValue(), aggregateScore: 1 })).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
  });

  it("rejects open metrics, advisory-only pass, missing required evidence, and stale dimension identity", () => {
    const openMetric = resultValue();
    openMetric.dimensions[0]!.metrics = [{ kind: "pixel-similarity", isPresent: true } as never];
    expect(() => parseWorldReconstructionEvaluationResultV1(openMetric)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
    const advisoryOnly = resultValue();
    for (const dimension of advisoryOnly.dimensions) {
      dimension.metrics = [{
        kind: "ratio-basis-points",
        valueBasisPoints: 7_500,
      }] as never;
    }
    expect(() => parseWorldReconstructionEvaluationResultV1(advisoryOnly)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
    const missingEvidence = resultValue();
    missingEvidence.dimensions[0]!.evidenceRefs = [];
    expect(() => parseWorldReconstructionEvaluationResultV1(missingEvidence)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
    const stale = resultValue();
    stale.dimensions[0]!.identity.captureReceiptHash = H("9");
    expect(() => parseWorldReconstructionEvaluationResultV1(stale)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
    );
  });

  it("rejects a passed dimension with failure-polarity evidence", () => {
    for (const metric of [
      { kind: "boolean-presence", isPresent: false },
      { kind: "identity-match", isMatch: false },
      { kind: "receipt-outcome", outcome: "failed" },
      { kind: "receipt-outcome", outcome: "incomplete" },
    ] as const) {
      const result = resultValue();
      result.dimensions[0]!.metrics = [metric] as never;
      expect(() => parseWorldReconstructionEvaluationResultV1(result)).toThrowError(
        "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
      );
    }
  });

  it("rejects non-standard object and array prototypes", () => {
    const nullPrototype = Object.assign(Object.create(null), profileValue());
    expect(() => parseWorldReconstructionEvaluationProfileV1(nullPrototype)).toThrowError(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    );
    class DimensionArray extends Array<string> {}
    expect(() => parseWorldReconstructionEvaluationProfileV1({
      ...profileValue(),
      dimensionIds: new DimensionArray(...DIMENSIONS),
    })).toThrowError("WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID");
  });

  it("parses closed diagnostics and run receipt attempt identities", () => {
    const diagnostic = parseWorldReconstructionDiagnosticV1({
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "diag.collider",
      code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
      dimensionId: "collider",
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
      ...colliderRepairFields(),
      evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
      message: "Required west wall collider is missing.",
    });
    expect("repairAction" in diagnostic).toBe(true);
    if (!("repairAction" in diagnostic)) throw new Error("repair action missing");
    expect(Object.isFrozen(diagnostic.repairAction)).toBe(true);

    const runValue = {
      kind: "world-reconstruction-run-receipt",
      schemaVersion: 1,
      id: "cloud-temple.run",
      caseRef: "artifact://world-reconstruction-case/cloud-temple.case/case.json",
      caseHash: H("d"),
      evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
      evaluationProfileHash: H("e"),
      outcome: "passed",
      attempts: [
        {
          attemptIndex: 0,
          generationRequestRef: "artifact://case/cloud-temple/attempts/0/generation-request.json",
          generationRequestHash: H("6"),
          generationReceiptRef: "artifact://case/cloud-temple/attempts/0/generation-receipt.json",
          generationReceiptHash: H("7"),
          sceneAuthoringAttemptRef: "artifact://case/cloud-temple/attempts/0/attempt.json",
          sceneAuthoringAttemptHash: H("8"),
          sceneAuthoringAttemptResultRef: "artifact://case/cloud-temple/attempts/0/attempt-result.json",
          sceneAuthoringAttemptResultHash: H("9"),
          worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
          worldPackageRootHash: H("a"),
          worldPackageBuildReceiptRef: "artifact://case/cloud-temple/attempts/0/world-package-build-receipt.json",
          worldPackageBuildReceiptHash: H("b"),
          worldBuildIdentityRef: "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
          worldBuildIdentityHash: H("c"),
          captureReceiptRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json",
          captureReceiptHash: H("c"),
          evaluationResultRef: "artifact://case/cloud-temple/attempts/0/evaluation.json",
          evaluationResultHash: H("3"),
          outcome: "failed",
        },
        {
          attemptIndex: 1,
          generationRequestRef: "artifact://case/cloud-temple/attempts/1/generation-request.json",
          generationRequestHash: H("d"),
          generationReceiptRef: "artifact://case/cloud-temple/attempts/1/generation-receipt.json",
          generationReceiptHash: H("e"),
          sceneAuthoringAttemptRef: "artifact://case/cloud-temple/attempts/1/attempt.json",
          sceneAuthoringAttemptHash: H("f"),
          sceneAuthoringAttemptResultRef: "artifact://case/cloud-temple/attempts/1/attempt-result.json",
          sceneAuthoringAttemptResultHash: H("1"),
          worldPackageRef: `package://world-package/sha256/${"2".repeat(64)}`,
          worldPackageRootHash: H("2"),
          worldPackageBuildReceiptRef: "artifact://case/cloud-temple/attempts/1/world-package-build-receipt.json",
          worldPackageBuildReceiptHash: H("4"),
          worldBuildIdentityRef: "artifact://case/cloud-temple/attempts/1/world-build-identity.json",
          worldBuildIdentityHash: H("5"),
          captureReceiptRef: "artifact://case/cloud-temple/attempts/1/capture-receipt.json",
          captureReceiptHash: H("5"),
          evaluationResultRef: "artifact://case/cloud-temple/attempts/1/evaluation.json",
          evaluationResultHash: H01,
          outcome: "passed",
        },
      ],
      finalAttemptIndex: 1,
      finalEvaluationResultRef: "artifact://case/cloud-temple/attempts/1/evaluation.json",
      finalEvaluationResultHash: H01,
      cleanupOutcome: "completed",
    } as const;
    const run = parseWorldReconstructionRunReceiptV1(runValue);
    expect(run.attempts).toHaveLength(2);
    expect(run.finalAttemptIndex).toBe(1);
    const packageScopedRefs = parseWorldReconstructionRunReceiptV1({
      ...runValue,
      attempts: [runValue.attempts[0], {
        ...runValue.attempts[1],
        worldPackageBuildReceiptRef:
          runValue.attempts[0].worldPackageBuildReceiptRef,
        worldBuildIdentityRef: runValue.attempts[0].worldBuildIdentityRef,
      }],
    });
    expect(packageScopedRefs.attempts[1]?.worldPackageRef).not.toBe(
      packageScopedRefs.attempts[0]?.worldPackageRef,
    );
    expect(packageScopedRefs.attempts[1]?.worldPackageBuildReceiptRef).toBe(
      packageScopedRefs.attempts[0]?.worldPackageBuildReceiptRef,
    );
    expect(packageScopedRefs.attempts[1]?.worldBuildIdentityRef).toBe(
      packageScopedRefs.attempts[0]?.worldBuildIdentityRef,
    );
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseWorldReconstructionRunReceiptV1({
        ...runValue,
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }
    for (const caseRef of [
      "artifact://case/cloud-temple.case/case.json",
      "worldkit://world-reconstruction-case/cloud-temple.case",
    ]) {
      expect(() => parseWorldReconstructionRunReceiptV1({
        ...runValue,
        caseRef,
      })).toThrowError("WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID");
    }

    expect(() => parseWorldReconstructionRunReceiptV1({
      ...runValue,
      attempts: runValue.attempts.map((attempt) => ({
        ...attempt,
        worldPackageRef: "artifact://case/cloud-temple/not-a-package-ref",
      })),
    })).toThrowError("WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID");

    expect(() => parseWorldReconstructionRunReceiptV1({
      ...runValue,
      finalEvaluationResultHash: H("9"),
    })).toThrowError("WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID");
    expect(() => parseWorldReconstructionRunReceiptV1({
      ...runValue,
      attempts: runValue.attempts.map((attempt, index) =>
        index === 1 ? { ...attempt, attemptIndex: 2 } : attempt
      ),
    })).toThrowError("WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID");
    expect(() => parseWorldReconstructionRunReceiptV1({
      ...runValue,
      attempts: [runValue.attempts[0], runValue.attempts[1], {
        ...runValue.attempts[1],
        attemptIndex: 2,
      }],
    })).toThrowError("WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID");
    expect(() => parseWorldReconstructionRunReceiptV1({
      ...runValue,
      attempts: [runValue.attempts[0], {
        ...runValue.attempts[1],
        worldPackageRootHash: runValue.attempts[0].worldPackageRootHash,
      }],
    })).toThrowError("WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID");

    const incomplete = parseWorldReconstructionRunReceiptV1({
      ...runValue,
      outcome: "incomplete",
      cleanupOutcome: "failed",
    });
    expect(incomplete.outcome).toBe("incomplete");
  });

  it("omits repairAction from non-repairable diagnostics and their canonical bytes", () => {
    for (const code of [
      "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
      "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
    ] as const) {
      const diagnostic = parseWorldReconstructionDiagnosticV1({
        kind: "world-reconstruction-diagnostic",
        schemaVersion: 1,
        id: `diag.${code.toLowerCase()}`,
        code,
        dimensionId: "deterministic-build",
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        targetRef: "worldkit://acceptance-target/central-ascent@1",
        targetId: "deterministic-build",
        metricId: code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
          ? "evidence-identity"
          : code === "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"
            ? "required-evidence-presence"
            : "deterministic-build-identity",
        details: code === "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"
          ? missingDiagnosticFields().details
          : {
              kind: "state-mismatch",
              expectedValue: code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE" ? "current" : "matching",
              actualValue: code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE" ? "stale" : "mismatched",
              correctionDirection: "replace",
            },
        evidenceRefs: [],
        message: "Host-owned evidence cannot be repaired by revising Native source.",
      });
      expect(diagnostic).not.toHaveProperty("repairAction");
      expect(new TextDecoder().decode(
        worldReconstructionDiagnosticCanonicalBytesV1(diagnostic),
      )).not.toContain("repairAction");
    }
  });

  it("requires exactly revise-native-source only for repairable diagnostics", () => {
    const { repairAction: _omittedRepairAction, ...colliderFields } = colliderRepairFields();
    const repairable = {
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "diag.collider",
      code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
      dimensionId: "collider",
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
      ...colliderFields,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
      message: "Required west wall collider is missing.",
    };
    expect(() => parseWorldReconstructionDiagnosticV1(repairable)).toThrowError(
      "WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID",
    );
    expect(() => parseWorldReconstructionDiagnosticV1({
      ...repairable,
      repairAction: {
        kind: "select-native-resource",
        resourceRef: "worldkit://native-resource/west-wall@1",
      },
    })).toThrowError("WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID");

    const nonRepairable = {
      ...repairable,
      id: "diag.stale",
      code: "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      evidenceRefs: [],
    };
    expect(() => parseWorldReconstructionDiagnosticV1({
      ...nonRepairable,
      repairAction: { kind: "revise-native-source" },
    })).toThrowError("WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID");
  });

  it("rejects mismatched metric details, threshold arithmetic, and repair operations", () => {
    const semanticCenterDiagnostic = {
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "diag.semantic-center-x",
      code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
      dimensionId: "semantic-silhouette",
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      targetRef: "worldkit://acceptance-target/central-ascent@1",
      targetId: "central-ascent-group",
      metricId: "semantic-center-x-basis-points",
      details: {
        kind: "basis-points-threshold",
        expectedBasisPoints: 300,
        actualBasisPoints: 500,
        maximumAllowedDriftBasisPoints: 100,
        exceededByBasisPoints: 100,
        correctionDirection: "decrease",
      },
      evidenceRefs: ["artifact://case/cloud-temple/evidence/semantic-silhouette.json"],
      message: "Move the central ascent left in the opening frame.",
      repairAction: {
        kind: "revise-native-source",
        targetKind: "visual-group",
        targetId: "central-ascent-group",
        operation: "move",
        instruction: "Decrease the central ascent screen X center toward 300 basis points.",
      },
    } as const;
    expect(parseWorldReconstructionDiagnosticV1(semanticCenterDiagnostic).metricId).toBe(
      "semantic-center-x-basis-points",
    );
    expect(() => parseWorldReconstructionDiagnosticV1({
      ...semanticCenterDiagnostic,
      details: { ...semanticCenterDiagnostic.details, exceededByBasisPoints: 99 },
    })).toThrowError("WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID");
    expect(() => parseWorldReconstructionDiagnosticV1({
      ...semanticCenterDiagnostic,
      repairAction: { ...semanticCenterDiagnostic.repairAction, operation: "resize" },
    })).toThrowError("WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID");
    expect(() => parseWorldReconstructionDiagnosticV1({
      ...semanticCenterDiagnostic,
      metricId: "collider-role",
    })).toThrowError("WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID");
  });
});
