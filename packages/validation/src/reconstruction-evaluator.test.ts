import { isEmpty, isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  evaluateWorldReconstructionV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  worldReconstructionEvaluationResultCanonicalBytesV1,
} from "./index.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;
const DIMENSIONS = [
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const;
const CENTRAL_ASCENT_TARGET_REF = "worldkit://acceptance-target/central-ascent@1";
const WEST_GATE_BLOCKER_TARGET_REF = "worldkit://acceptance-target/upper-t-junction@1";
const OPENING_TARGET_REF = "worldkit://composition-target/opening@1";
const FOREGROUND_TARGET_REF = "worldkit://composition-target/foreground@1";

const caseValue = () => ({
  kind: "world-reconstruction-case" as const,
  schemaVersion: 1 as const,
  id: "cloud-temple.case",
  sceneBriefRef: "artifact://case/cloud-temple/scene-brief.json",
  sceneBriefHash: H("a"),
  referenceInputs: [
    {
      inputRef: "artifact://case/cloud-temple/reference.png",
      contentHash: H("b"),
      mediaType: "image/png" as const,
    },
  ],
  evaluationProfileRef: "worldkit://reconstruction-evaluation-profile/cloud-temple@1",
  evaluationProfileHash: H("c"),
  acceptanceTargetRefs: [
    CENTRAL_ASCENT_TARGET_REF,
    WEST_GATE_BLOCKER_TARGET_REF,
  ],
  requiredEvidenceProfileRefs: [
    ...DIMENSIONS.map((dimensionId) =>
      `worldkit://evidence-profile/${dimensionId}@1`
    ),
  ],
  expected: {
    topology: {
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      nodeIds: ["central-ascent", "upper-t-junction"],
      relations: [{ fromNodeId: "central-ascent", relation: "connects-to" as const, toNodeId: "upper-t-junction" }],
      layerIds: ["ground", "upper"],
    },
    semanticSilhouetteTargets: [{
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      visualGroupId: "central-ascent-group",
      normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 },
      normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
      coverageBasisPoints: 2_400,
    }],
    openingComposition: {
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      targetRefs: [OPENING_TARGET_REF],
      regions: [{ targetRef: OPENING_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } }],
      anchors: [{ targetRef: OPENING_TARGET_REF, normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } }],
      orderedTargetRefs: [OPENING_TARGET_REF],
    },
    spawnSupport: {
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      spawnMarkerId: "player-spawn",
      supportColliderId: "spawn-ground",
      expectedMedium: "ground" as const,
      expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
    },
    colliders: [
      { acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF, contributionId: "spawn-ground-contribution", colliderId: "spawn-ground", role: "ground" as const, requiresOverlay: true },
      { acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF, contributionId: "west-wall-contribution", colliderId: "west-wall", role: "blocker" as const, requiresOverlay: true },
    ],
    criticalTraversalChecks: [{
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      id: "reach-junction",
      evidenceKind: "scripted-fixed-input" as const,
      expectation: "pass" as "pass" | "block",
      checkpointIds: ["junction", "spawn"],
      fixedInputSequence: [
        { actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 12 },
        { actions: ["jump"], ticks: 1 },
        { actions: ["move-forward"], ticks: 8 },
      ],
    }],
    deterministicBuild: {
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      requiresCandidateReplay: true as const,
      requiresWorldPackageIdentityAgreement: true as const,
      requiresBuildIdentityAgreement: true as const,
      requiresCaptureIdentityAgreement: true as const,
    },
  },
});

const profileValue = () => ({
  kind: "world-reconstruction-evaluation-profile" as const,
  schemaVersion: 1 as const,
  id: "cloud-temple.profile",
  dimensionIds: [...DIMENSIONS],
  maximumRepairAttemptCount: 1 as const,
  builderSelfRepairAttemptCount: 0 as const,
  thresholds: {
    semanticSilhouetteTargets: [{
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      maximumBoundsDriftBasisPoints: 100,
      maximumCenterDriftBasisPoints: 100,
      maximumCoverageDriftBasisPoints: 100,
    }],
    openingComposition: {
      regions: [{ targetRef: OPENING_TARGET_REF, maximumDriftBasisPoints: 100 }],
      anchors: [{ targetRef: OPENING_TARGET_REF, maximumDriftBasisPoints: 100 }],
      maximumOrderDistanceBasisPoints: 100,
    },
    spawnSupport: {
      maximumPositionDriftMillimeters: 100,
      maximumSupportGapMillimeters: 10,
    },
  },
  requiredEvidenceByDimension: DIMENSIONS.map((dimensionId) => ({
    dimensionId,
    evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
  })),
});

const evidenceValue = () => ({
  kind: "world-reconstruction-evidence-set" as const,
  schemaVersion: 1 as const,
  id: "cloud-temple.attempt-0.evidence",
  caseRef: "artifact://case/cloud-temple/case.json",
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
    { role: "scene-authoring-attempt" as const, artifactRef: "artifact://case/cloud-temple/attempts/0/attempt.json", contentHash: H("f") },
    { role: "scene-authoring-attempt-result" as const, artifactRef: "artifact://case/cloud-temple/attempts/0/attempt-result.json", contentHash: H("6") },
    { role: "world-package" as const, artifactRef: `package://world-package/sha256/${"1".repeat(64)}`, contentHash: H("1") },
    { role: "world-package-build-receipt" as const, artifactRef: "artifact://case/cloud-temple/attempts/0/world-package-build-receipt.json", contentHash: H("7") },
    { role: "world-build-identity" as const, artifactRef: "artifact://case/cloud-temple/attempts/0/world-build-identity.json", contentHash: H("8") },
    { role: "capture" as const, artifactRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json", contentHash: H("2") },
  ],
  observedDimensions: [
    {
      dimensionId: "collider" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
      observed: {
        kind: "collider-observed" as "collider-observed" | "evidence-missing",
        contributions: [
          { contributionId: "spawn-ground-contribution", colliderId: "spawn-ground", role: "ground" as const, hasOverlay: true },
          { contributionId: "west-wall-contribution", colliderId: "west-wall", role: "blocker" as const, hasOverlay: true },
        ],
      },
    },
    {
      dimensionId: "critical-traversal" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/critical-traversal.json"],
      observed: {
        kind: "critical-traversal-observed" as const,
        checks: [{ id: "reach-junction", outcome: "reached" as "reached" | "blocked" | "incomplete", checkpointIds: ["junction", "spawn"] }],
      },
    },
    {
      dimensionId: "deterministic-build" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/deterministic-build.json"],
      observed: {
        kind: "deterministic-build-observed" as const,
        candidateReplayOutcome: "completed" as "completed" | "failed" | "incomplete",
        worldPackageIdentityMatches: true,
        buildIdentityMatches: true,
        captureIdentityMatches: true,
      },
    },
    {
      dimensionId: "opening-composition" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/opening-composition.json"],
      observed: {
        kind: "opening-composition-observed" as const,
        regions: [{ targetRef: OPENING_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } }],
        anchors: [{ targetRef: OPENING_TARGET_REF, normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } }],
        orderedTargetRefs: [OPENING_TARGET_REF],
        distances: [] as Array<{ fromTargetRef: string; toTargetRef: string; distanceBasisPoints: number }>,
      },
    },
    {
      dimensionId: "semantic-silhouette" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/semantic-silhouette.json"],
      observed: {
        kind: "semantic-silhouette-observed" as const,
        targets: [{
          acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
          visualGroupId: "central-ascent-group",
          isSemanticTargetPresent: true,
          normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 },
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
          coverageBasisPoints: 2_400,
        }],
      },
    },
    {
      dimensionId: "spawn-support" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/spawn-support.json"],
      observed: {
        kind: "spawn-support-observed" as const,
        spawnMarkerId: "player-spawn",
        supportColliderId: "spawn-ground",
        medium: "ground" as const,
        positionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
        supportGapMillimeters: 0,
      },
    },
    {
      dimensionId: "topology" as const,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/topology.json"],
      observed: {
        kind: "topology-observed" as const,
        nodeIds: ["central-ascent", "upper-t-junction"],
        relations: [{ fromNodeId: "central-ascent", relation: "connects-to" as const, toNodeId: "upper-t-junction" }],
        layerIds: ["ground", "upper"],
      },
    },
  ],
  advisoryPixelMetrics: [
    { kind: "ratio-basis-points" as const, valueBasisPoints: 7_500 },
  ],
});

type CaseDraft = ReturnType<typeof caseValue>;
type ProfileDraft = ReturnType<typeof profileValue>;
type EvidenceDraft = ReturnType<typeof evidenceValue>;

function observedRow(evidence: EvidenceDraft, dimensionId: (typeof DIMENSIONS)[number]) {
  const row = evidence.observedDimensions.find((entry) => entry.dimensionId === dimensionId);
  if (isNil(row)) throw new Error(`missing observed row ${dimensionId}`);
  return row;
}

function withTwoOpeningTargets(draft: CaseDraft): void {
  draft.expected.openingComposition.targetRefs = [FOREGROUND_TARGET_REF, OPENING_TARGET_REF];
  draft.expected.openingComposition.regions = [
    { targetRef: FOREGROUND_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 600, maxXBasisPoints: 400, maxYBasisPoints: 900 } },
    { targetRef: OPENING_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } },
  ];
  draft.expected.openingComposition.anchors = [
    { targetRef: FOREGROUND_TARGET_REF, normalizedCenter: { xBasisPoints: 250, yBasisPoints: 750 } },
    { targetRef: OPENING_TARGET_REF, normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } },
  ];
  draft.expected.openingComposition.orderedTargetRefs = [FOREGROUND_TARGET_REF, OPENING_TARGET_REF];
}

function withTwoOpeningThresholds(draft: ProfileDraft): void {
  draft.thresholds.openingComposition.regions = [
    { targetRef: FOREGROUND_TARGET_REF, maximumDriftBasisPoints: 100 },
    { targetRef: OPENING_TARGET_REF, maximumDriftBasisPoints: 100 },
  ];
  draft.thresholds.openingComposition.anchors = [
    { targetRef: FOREGROUND_TARGET_REF, maximumDriftBasisPoints: 100 },
    { targetRef: OPENING_TARGET_REF, maximumDriftBasisPoints: 100 },
  ];
}

function withTwoOpeningObserved(
  draft: EvidenceDraft,
  orderedTargetRefs: readonly [string, string],
  distances: readonly Readonly<{ fromTargetRef: string; toTargetRef: string; distanceBasisPoints: number }>[],
): void {
  const opening = observedRow(draft, "opening-composition");
  if (opening.observed.kind !== "opening-composition-observed") throw new Error("opening observed");
  opening.observed.regions = [
    { targetRef: FOREGROUND_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 600, maxXBasisPoints: 400, maxYBasisPoints: 900 } },
    { targetRef: OPENING_TARGET_REF, normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 200, maxXBasisPoints: 500, maxYBasisPoints: 800 } },
  ];
  opening.observed.anchors = [
    { targetRef: FOREGROUND_TARGET_REF, normalizedCenter: { xBasisPoints: 250, yBasisPoints: 750 } },
    { targetRef: OPENING_TARGET_REF, normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 } },
  ];
  opening.observed.orderedTargetRefs = [...orderedTargetRefs];
  opening.observed.distances = [...distances];
}

function withRequiredBlockerCheck(draft: CaseDraft): void {
  draft.expected.criticalTraversalChecks = [
    {
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      id: "block-west",
      evidenceKind: "scripted-fixed-input",
      expectation: "block",
      checkpointIds: ["west-face"],
      fixedInputSequence: [{ actions: ["move-left"], ticks: 8 }],
    },
    draft.expected.criticalTraversalChecks[0]!,
  ];
}

function withRequiredBlockerObserved(
  draft: EvidenceDraft,
  westOutcome: "reached" | "blocked" | "incomplete",
): void {
  const traversal = observedRow(draft, "critical-traversal");
  if (traversal.observed.kind !== "critical-traversal-observed") throw new Error("traversal observed");
  traversal.observed.checks = [
    { id: "block-west", outcome: westOutcome, checkpointIds: ["west-face"] },
    { id: "reach-junction", outcome: "reached", checkpointIds: ["junction", "spawn"] },
  ];
}

function bindInput(mutate?: {
  case?: (draft: CaseDraft) => void;
  profile?: (draft: ProfileDraft) => void;
  evidence?: (draft: EvidenceDraft) => void;
}) {
  const profileDraft = profileValue();
  mutate?.profile?.(profileDraft);
  const profile = parseWorldReconstructionEvaluationProfileV1(profileDraft);
  const evaluationProfileHash = hashWorldReconstructionEvaluationProfileV1(profile);

  const caseDraft = caseValue();
  caseDraft.evaluationProfileHash = evaluationProfileHash;
  mutate?.case?.(caseDraft);
  const reconstructionCase = parseWorldReconstructionCaseV1(caseDraft);
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);

  const evidenceDraft = evidenceValue();
  evidenceDraft.caseHash = caseHash;
  evidenceDraft.evaluationProfileHash = evaluationProfileHash;
  mutate?.evidence?.(evidenceDraft);
  const evidence = parseWorldReconstructionEvidenceSetV1(evidenceDraft);
  return { case: reconstructionCase, profile, evidence };
}

function evaluateBound(mutate?: Parameters<typeof bindInput>[0]) {
  return evaluateWorldReconstructionV1(bindInput(mutate));
}

function dimension(result: ReturnType<typeof evaluateWorldReconstructionV1>, dimensionId: (typeof DIMENSIONS)[number]) {
  const row = result.dimensions.find((entry) => entry.dimensionId === dimensionId);
  if (isNil(row)) throw new Error(`missing dimension ${dimensionId}`);
  return row;
}

function expectIndependentFailure(
  result: ReturnType<typeof evaluateWorldReconstructionV1>,
  failedDimensionId: (typeof DIMENSIONS)[number],
): void {
  expect(dimension(result, failedDimensionId).status).toBe("failed");
  expect(result.dimensions.filter(({ dimensionId }) => dimensionId !== failedDimensionId)
    .every(({ status }) => status === "passed")).toBe(true);
  expect(result.outcome).toBe("failed");
  expect("score" in result).toBe(false);
  expect("aggregateScore" in result).toBe(false);
  expect(parseWorldReconstructionEvaluationResultV1(result)).toEqual(result);
}

describe("evaluateWorldReconstructionV1", () => {
  it("passes an identity-bound fixture with no aggregate score", () => {
    const result = evaluateBound();
    expect(result.outcome).toBe("passed");
    expect(result.dimensions.map(({ dimensionId, status }) => [dimensionId, status])).toEqual(
      DIMENSIONS.map((dimensionId) => [dimensionId, "passed"]),
    );
    expect(result.diagnostics).toEqual([]);
    expect("score" in result).toBe(false);
    expect(parseWorldReconstructionEvaluationResultV1(result).outcome).toBe("passed");
    expect(hashWorldReconstructionEvaluationResultV1(result)).toEqual(
      hashWorldReconstructionEvaluationResultV1(evaluateBound()),
    );
    expect(worldReconstructionEvaluationResultCanonicalBytesV1(result)).toEqual(
      worldReconstructionEvaluationResultCanonicalBytesV1(evaluateBound()),
    );
  });

  it("fails only the missing west-gate collider without masking other dimensions", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const collider = observedRow(draft, "collider");
        if (collider.observed.kind !== "collider-observed") throw new Error("collider observed");
        collider.observed.contributions = collider.observed.contributions.filter(
          ({ contributionId }) => contributionId !== "west-wall-contribution",
        );
      },
    });
    expectIndependentFailure(result, "collider");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
      dimensionId: "collider",
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("keeps a present topology node from masking a missing relation", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const topology = observedRow(draft, "topology");
        if (topology.observed.kind !== "topology-observed") throw new Error("topology observed");
        topology.observed.relations = [];
      },
    });
    expectIndependentFailure(result, "topology");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
      dimensionId: "topology",
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails topology when a required node is absent", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const topology = observedRow(draft, "topology");
        if (topology.observed.kind !== "topology-observed") throw new Error("topology observed");
        topology.observed.nodeIds = ["upper-t-junction"];
        topology.observed.relations = [];
      },
    });
    expectIndependentFailure(result, "topology");
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
      "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
    ]);
  });

  it("ignores extra observed topology members when required structure is present", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const topology = observedRow(draft, "topology");
        if (topology.observed.kind !== "topology-observed") throw new Error("topology observed");
        topology.observed.nodeIds = ["central-ascent", "overlook", "upper-t-junction"];
        topology.observed.layerIds = ["ground", "sky", "upper"];
      },
    });
    expect(result.outcome).toBe("passed");
    expect(dimension(result, "topology").status).toBe("passed");
  });

  it("fails semantic silhouette on center drift even when coverage matches", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const silhouette = observedRow(draft, "semantic-silhouette");
        if (silhouette.observed.kind !== "semantic-silhouette-observed") throw new Error("silhouette observed");
        silhouette.observed.targets[0]!.normalizedCenter = { xBasisPoints: 500, yBasisPoints: 500 };
      },
    });
    expectIndependentFailure(result, "semantic-silhouette");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
      dimensionId: "semantic-silhouette",
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails semantic silhouette on coverage drift even when center matches", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const silhouette = observedRow(draft, "semantic-silhouette");
        if (silhouette.observed.kind !== "semantic-silhouette-observed") throw new Error("silhouette observed");
        silhouette.observed.targets[0]!.coverageBasisPoints = 2_700;
      },
    });
    expectIndependentFailure(result, "semantic-silhouette");
    expect(result.diagnostics[0]).toMatchObject({
      code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
    });
  });

  it("fails opening composition when anchors drift but order is unchanged", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const opening = observedRow(draft, "opening-composition");
        if (opening.observed.kind !== "opening-composition-observed") throw new Error("opening observed");
        opening.observed.anchors[0]!.normalizedCenter = { xBasisPoints: 300, yBasisPoints: 750 };
      },
    });
    expectIndependentFailure(result, "opening-composition");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
      dimensionId: "opening-composition",
      acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails opening composition when target order is reversed", () => {
    const result = evaluateBound({
      case: withTwoOpeningTargets,
      profile: withTwoOpeningThresholds,
      evidence: (draft) => {
        withTwoOpeningObserved(draft, [OPENING_TARGET_REF, FOREGROUND_TARGET_REF], [{
          fromTargetRef: FOREGROUND_TARGET_REF,
          toTargetRef: OPENING_TARGET_REF,
          distanceBasisPoints: 80,
        }]);
      },
    });
    expectIndependentFailure(result, "opening-composition");
    expect(result.diagnostics[0]).toMatchObject({
      code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
    });
  });

  it("fails spawn support above and below the expected support height", () => {
    for (const yMeters of [1.5, 0.5]) {
      const result = evaluateBound({
        evidence: (draft) => {
          const spawn = observedRow(draft, "spawn-support");
          if (spawn.observed.kind !== "spawn-support-observed") throw new Error("spawn observed");
          spawn.observed.positionXYZMeters = { xMeters: 0, yMeters, zMeters: 0 };
          spawn.observed.supportGapMillimeters = 500;
        },
      });
      expectIndependentFailure(result, "spawn-support");
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
        dimensionId: "spawn-support",
        acceptanceTargetRef: CENTRAL_ASCENT_TARGET_REF,
        repairAction: { kind: "revise-native-source" },
      }));
    }
  });

  it("fails a present collider whose role does not match the Case", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const collider = observedRow(draft, "collider");
        if (collider.observed.kind !== "collider-observed") throw new Error("collider observed");
        collider.observed.contributions[1]!.role = "ground";
      },
    });
    expectIndependentFailure(result, "collider");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
      dimensionId: "collider",
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails a required traversal that was blocked", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const traversal = observedRow(draft, "critical-traversal");
        if (traversal.observed.kind !== "critical-traversal-observed") throw new Error("traversal observed");
        traversal.observed.checks[0]!.outcome = "blocked";
      },
    });
    expectIndependentFailure(result, "critical-traversal");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
      dimensionId: "critical-traversal",
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails when a required blocker is passable", () => {
    const result = evaluateBound({
      case: withRequiredBlockerCheck,
      evidence: (draft) => withRequiredBlockerObserved(draft, "reached"),
    });
    expectIndependentFailure(result, "critical-traversal");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE",
      dimensionId: "critical-traversal",
      acceptanceTargetRef: WEST_GATE_BLOCKER_TARGET_REF,
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails deterministic build on Candidate replay mismatch", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const build = observedRow(draft, "deterministic-build");
        if (build.observed.kind !== "deterministic-build-observed") throw new Error("build observed");
        build.observed.candidateReplayOutcome = "failed";
      },
    });
    expectIndependentFailure(result, "deterministic-build");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
      dimensionId: "deterministic-build",
      repairAction: { kind: "revise-native-source" },
    }));
  });

  it("fails deterministic build on Package or Capture identity mismatch", () => {
    for (const field of ["worldPackageIdentityMatches", "captureIdentityMatches"] as const) {
      const result = evaluateBound({
        evidence: (draft) => {
          const build = observedRow(draft, "deterministic-build");
          if (build.observed.kind !== "deterministic-build-observed") throw new Error("build observed");
          build.observed[field] = false;
        },
      });
      expectIndependentFailure(result, "deterministic-build");
      expect(result.diagnostics[0]).toMatchObject({
        code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
      });
    }
  });

  it("marks a missing required evidence member incomplete without converting it to zero", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const collider = observedRow(draft, "collider") as {
          evidenceRefs: string[];
          observed: { kind: "evidence-missing" };
        };
        collider.evidenceRefs = [];
        collider.observed = { kind: "evidence-missing" };
      },
    });
    expect(dimension(result, "collider").status).toBe("incomplete");
    expect(result.dimensions.filter(({ dimensionId }) => dimensionId !== "collider")
      .every(({ status }) => status === "passed")).toBe(true);
    expect(result.outcome).toBe("incomplete");
    expect("score" in result).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
      dimensionId: "collider",
      repairAction: { kind: "revise-native-source" },
    }));
    expect(isEmpty(dimension(result, "collider").metrics.filter((metric) =>
      metric.kind === "ratio-basis-points" && metric.valueBasisPoints === 0,
    ))).toBe(true);
  });

  it("rejects stale Case, Profile, or Evidence identities as incomplete", () => {
    const bound = bindInput();
    const staleEvidence = parseWorldReconstructionEvidenceSetV1({
      ...evidenceValue(),
      caseHash: H("9"),
      evaluationProfileHash: bound.evidence.evaluationProfileHash,
    });
    const result = evaluateWorldReconstructionV1({
      case: bound.case,
      profile: bound.profile,
      evidence: staleEvidence,
    });
    expect(result.outcome).toBe("incomplete");
    expect(result.dimensions.every(({ status }) => status === "incomplete")).toBe(true);
    expect(result.diagnostics.every(({ code }) => code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE")).toBe(true);
    expect(result.diagnostics.map(({ dimensionId }) => dimensionId)).toEqual([...DIMENSIONS]);
    expect(parseWorldReconstructionEvaluationResultV1(result).outcome).toBe("incomplete");
  });

  it("rejects a Case whose Evidence Profile requirements do not close its bound Profile", () => {
    const result = evaluateBound({
      case: (draft) => {
        draft.requiredEvidenceProfileRefs = draft.requiredEvidenceProfileRefs.slice(1);
      },
    });
    expect(result.outcome).toBe("incomplete");
    expect(result.dimensions.every(({ status }) => status === "incomplete")).toBe(true);
    expect(result.diagnostics.every(({ code }) =>
      code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
    )).toBe(true);
  });

  it("never lets advisory pixel similarity produce a GO on a failed required metric", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const collider = observedRow(draft, "collider");
        if (collider.observed.kind !== "collider-observed") throw new Error("collider observed");
        collider.observed.contributions = collider.observed.contributions.filter(
          ({ contributionId }) => contributionId !== "west-wall-contribution",
        );
        draft.advisoryPixelMetrics = [{ kind: "ratio-basis-points", valueBasisPoints: 10_000 }];
      },
    });
    expectIndependentFailure(result, "collider");
    expect(result.diagnostics.some(({ code }) => code === "WORLD_RECONSTRUCTION_COLLIDER_MISSING")).toBe(true);
    expect(result.dimensions.every(({ metrics }) =>
      metrics.every((metric) => metric.kind !== "ratio-basis-points" || metric.valueBasisPoints !== 10_000),
    )).toBe(true);
  });

  it("sorts diagnostics by dimension, code, and target and preserves evidence refs", () => {
    const result = evaluateBound({
      evidence: (draft) => {
        const collider = observedRow(draft, "collider");
        if (collider.observed.kind !== "collider-observed") throw new Error("collider observed");
        collider.observed.contributions = collider.observed.contributions.filter(
          ({ contributionId }) => contributionId !== "west-wall-contribution",
        );
        const topology = observedRow(draft, "topology");
        if (topology.observed.kind !== "topology-observed") throw new Error("topology observed");
        topology.observed.relations = [];
      },
    });
    expect(result.outcome).toBe("failed");
    expect(result.diagnostics.map(({ dimensionId, code }) => `${dimensionId}:${code}`)).toEqual([
      "collider:WORLD_RECONSTRUCTION_COLLIDER_MISSING",
      "topology:WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
    ]);
    expect(result.diagnostics.every(({ repairAction }) => repairAction.kind === "revise-native-source")).toBe(true);
    expect(dimension(result, "collider").diagnosticIds).toEqual([result.diagnostics[0]!.id]);
    expect(dimension(result, "topology").diagnosticIds).toEqual([result.diagnostics[1]!.id]);
  });
});
