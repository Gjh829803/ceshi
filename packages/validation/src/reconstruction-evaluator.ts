import { isEmpty, isNil, sortBy } from "lodash-es";

import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvidenceSetV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  WORLD_RECONSTRUCTION_DIMENSION_IDS_V1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticCodeV1,
  type WorldReconstructionDiagnosticV1,
  type WorldReconstructionDimensionIdV1,
  type WorldReconstructionEvaluationProfileV1,
  type WorldReconstructionEvaluationResultV1,
  type WorldReconstructionEvidenceSetV1,
  type WorldReconstructionMetricV1,
  type WorldReconstructionNormalizedBoundsV1,
  type WorldReconstructionNormalizedCenterV1,
  type WorldReconstructionObservedDimensionRowV1,
  type WorldReconstructionObservedDimensionV1,
  type WorldReconstructionOutcomeV1,
  type WorldReconstructionPositionXYZMetersV1,
  type WorldReconstructionTopologyRelationV1,
} from "./reconstruction-contracts.js";

interface EvaluateWorldReconstructionV1Input {
  readonly case: WorldReconstructionCaseV1;
  readonly profile: WorldReconstructionEvaluationProfileV1;
  readonly evidence: WorldReconstructionEvidenceSetV1;
}

interface DraftDiagnosticV1 {
  readonly code: WorldReconstructionDiagnosticCodeV1;
  readonly acceptanceTargetRef: string;
  readonly evidenceRefs: readonly string[];
  readonly message: string;
}

interface DimensionDraftV1 {
  readonly dimensionId: WorldReconstructionDimensionIdV1;
  readonly status: WorldReconstructionOutcomeV1;
  readonly metrics: readonly WorldReconstructionMetricV1[];
  readonly evidenceRefs: readonly string[];
  readonly diagnostics: readonly DraftDiagnosticV1[];
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  ));
}

function freezeMetric(metric: WorldReconstructionMetricV1): WorldReconstructionMetricV1 {
  return Object.freeze({ ...metric });
}

function successPresence(): WorldReconstructionMetricV1 {
  return freezeMetric({ kind: "boolean-presence", isPresent: true });
}

function failurePresence(): WorldReconstructionMetricV1 {
  return freezeMetric({ kind: "boolean-presence", isPresent: false });
}

function successMatch(): WorldReconstructionMetricV1 {
  return freezeMetric({ kind: "identity-match", isMatch: true });
}

function failureMatch(): WorldReconstructionMetricV1 {
  return freezeMetric({ kind: "identity-match", isMatch: false });
}

function receiptOutcome(
  outcome: "completed" | "failed" | "incomplete",
): WorldReconstructionMetricV1 {
  return freezeMetric({ kind: "receipt-outcome", outcome });
}

function clampBasisPoints(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(10_000, Math.round(value));
}

function clampMillimeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value));
}

function ratioMetric(valueBasisPoints: number): WorldReconstructionMetricV1 {
  return freezeMetric({
    kind: "ratio-basis-points",
    valueBasisPoints: clampBasisPoints(valueBasisPoints),
  });
}

function normalizedDistanceMetric(valueBasisPoints: number): WorldReconstructionMetricV1 {
  return freezeMetric({
    kind: "normalized-distance-basis-points",
    valueBasisPoints: clampBasisPoints(valueBasisPoints),
  });
}

function millimeterMetric(valueMillimeters: number): WorldReconstructionMetricV1 {
  return freezeMetric({
    kind: "distance-millimeters",
    valueMillimeters: clampMillimeters(valueMillimeters),
  });
}

function boundsDrift(
  expected: WorldReconstructionNormalizedBoundsV1,
  observed: WorldReconstructionNormalizedBoundsV1,
): number {
  return Math.max(
    Math.abs(expected.minXBasisPoints - observed.minXBasisPoints),
    Math.abs(expected.minYBasisPoints - observed.minYBasisPoints),
    Math.abs(expected.maxXBasisPoints - observed.maxXBasisPoints),
    Math.abs(expected.maxYBasisPoints - observed.maxYBasisPoints),
  );
}

function centerDrift(
  expected: WorldReconstructionNormalizedCenterV1,
  observed: WorldReconstructionNormalizedCenterV1,
): number {
  return Math.max(
    Math.abs(expected.xBasisPoints - observed.xBasisPoints),
    Math.abs(expected.yBasisPoints - observed.yBasisPoints),
  );
}

function positionDriftMillimeters(
  expected: WorldReconstructionPositionXYZMetersV1,
  observed: WorldReconstructionPositionXYZMetersV1,
): number {
  return Math.round(Math.hypot(
    observed.xMeters - expected.xMeters,
    observed.yMeters - expected.yMeters,
    observed.zMeters - expected.zMeters,
  ) * 1_000);
}

function relationKey(relation: WorldReconstructionTopologyRelationV1): string {
  return `${relation.fromNodeId}\0${relation.relation}\0${relation.toNodeId}`;
}

function formatRelation(relation: WorldReconstructionTopologyRelationV1): string {
  return `${relation.fromNodeId} ${relation.relation} ${relation.toNodeId}`;
}

function observedRow(
  evidence: WorldReconstructionEvidenceSetV1,
  dimensionId: WorldReconstructionDimensionIdV1,
): WorldReconstructionObservedDimensionRowV1 | undefined {
  return evidence.observedDimensions.find((row) => row.dimensionId === dimensionId);
}

function observedOfKind<K extends WorldReconstructionObservedDimensionV1["kind"]>(
  row: WorldReconstructionObservedDimensionRowV1,
  kind: K,
): Extract<WorldReconstructionObservedDimensionV1, { kind: K }> | undefined {
  if (row.observed.kind !== kind) return undefined;
  return row.observed as Extract<WorldReconstructionObservedDimensionV1, { kind: K }>;
}

function missingEvidenceDraft(
  dimensionId: WorldReconstructionDimensionIdV1,
  acceptanceTargetRef: string,
  evidenceRefs: readonly string[],
): DimensionDraftV1 {
  return {
    dimensionId,
    status: "incomplete",
    metrics: Object.freeze([]),
    evidenceRefs: uniqueSorted(evidenceRefs),
    diagnostics: Object.freeze([{
      code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
      acceptanceTargetRef,
      evidenceRefs: uniqueSorted(evidenceRefs),
      message: `Required evidence is missing for ${dimensionId}.`,
    }]),
  };
}

function staleDraft(
  dimensionId: WorldReconstructionDimensionIdV1,
  acceptanceTargetRef: string,
  evidenceRefs: readonly string[],
): DimensionDraftV1 {
  return {
    dimensionId,
    status: "incomplete",
    metrics: Object.freeze([]),
    evidenceRefs: uniqueSorted(evidenceRefs),
    diagnostics: Object.freeze([{
      code: "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      acceptanceTargetRef,
      evidenceRefs: uniqueSorted(evidenceRefs),
      message: "Stale Case, Profile, or Evidence identities cannot be scored.",
    }]),
  };
}

function passedDraft(
  dimensionId: WorldReconstructionDimensionIdV1,
  evidenceRefs: readonly string[],
  metrics: readonly WorldReconstructionMetricV1[],
): DimensionDraftV1 {
  return {
    dimensionId,
    status: "passed",
    metrics: Object.freeze(metrics.map(freezeMetric)),
    evidenceRefs: uniqueSorted(evidenceRefs),
    diagnostics: Object.freeze([]),
  };
}

function failedDraft(
  dimensionId: WorldReconstructionDimensionIdV1,
  evidenceRefs: readonly string[],
  metrics: readonly WorldReconstructionMetricV1[],
  diagnostics: readonly DraftDiagnosticV1[],
): DimensionDraftV1 {
  return {
    dimensionId,
    status: "failed",
    metrics: Object.freeze(metrics.map(freezeMetric)),
    evidenceRefs: uniqueSorted(evidenceRefs),
    diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze({
      ...diagnostic,
      evidenceRefs: uniqueSorted(diagnostic.evidenceRefs),
    }))),
  };
}

function primaryAcceptanceTargetRef(
  reconstructionCase: WorldReconstructionCaseV1,
  dimensionId: WorldReconstructionDimensionIdV1,
): string {
  if (dimensionId === "collider") return reconstructionCase.expected.colliders[0]!.acceptanceTargetRef;
  if (dimensionId === "critical-traversal") {
    return reconstructionCase.expected.criticalTraversalChecks[0]!.acceptanceTargetRef;
  }
  if (dimensionId === "deterministic-build") {
    return reconstructionCase.expected.deterministicBuild.acceptanceTargetRef;
  }
  if (dimensionId === "opening-composition") {
    return reconstructionCase.expected.openingComposition.acceptanceTargetRef;
  }
  if (dimensionId === "semantic-silhouette") {
    return reconstructionCase.expected.semanticSilhouetteTargets[0]!.acceptanceTargetRef;
  }
  if (dimensionId === "spawn-support") return reconstructionCase.expected.spawnSupport.acceptanceTargetRef;
  return reconstructionCase.expected.topology.acceptanceTargetRef;
}

function identitiesAreStale(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  evidence: WorldReconstructionEvidenceSetV1,
): boolean {
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const profileHash = hashWorldReconstructionEvaluationProfileV1(profile);
  return caseHash !== evidence.caseHash
    || profileHash !== evidence.evaluationProfileHash
    || reconstructionCase.evaluationProfileHash !== profileHash
    || !worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, profile);
}

function evaluateTopology(
  reconstructionCase: WorldReconstructionCaseV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const expected = reconstructionCase.expected.topology;
  const observed = observedOfKind(row, "topology-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft("topology", expected.acceptanceTargetRef, row.evidenceRefs);
  }
  const missingNodes = expected.nodeIds.filter((nodeId) => !observed.nodeIds.includes(nodeId));
  const missingLayers = expected.layerIds.filter((layerId) => !observed.layerIds.includes(layerId));
  const observedRelationKeys = new Set(observed.relations.map(relationKey));
  const missingRelations = expected.relations.filter((relation) =>
    !observedRelationKeys.has(relationKey(relation))
  );
  const diagnostics: DraftDiagnosticV1[] = [];
  if (!isEmpty(missingNodes) || !isEmpty(missingLayers)) {
    const parts = [
      ...isEmpty(missingNodes) ? [] : [`nodes: ${missingNodes.join(", ")}`],
      ...isEmpty(missingLayers) ? [] : [`layers: ${missingLayers.join(", ")}`],
    ];
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      evidenceRefs: row.evidenceRefs,
      message: `Required topology graph members are missing: ${parts.join("; ")}.`,
    });
  }
  if (!isEmpty(missingRelations)) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      evidenceRefs: row.evidenceRefs,
      message: `Required topology relations are missing: ${missingRelations.map(formatRelation).join(", ")}.`,
    });
  }
  if (!isEmpty(diagnostics)) {
    return failedDraft("topology", row.evidenceRefs, [failurePresence(), failureMatch()], diagnostics);
  }
  return passedDraft("topology", row.evidenceRefs, [successPresence(), successMatch()]);
}

function evaluateSemanticSilhouette(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const expectedTargets = reconstructionCase.expected.semanticSilhouetteTargets;
  const observed = observedOfKind(row, "semantic-silhouette-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft(
      "semantic-silhouette",
      expectedTargets[0]!.acceptanceTargetRef,
      row.evidenceRefs,
    );
  }
  const diagnostics: DraftDiagnosticV1[] = [];
  let maximumBoundsDrift = 0;
  let maximumCenterDrift = 0;
  let maximumCoverageDrift = 0;
  let hasIdentityMismatch = false;
  for (const expected of expectedTargets) {
    const threshold = profile.thresholds.semanticSilhouetteTargets.find(
      (entry) => entry.acceptanceTargetRef === expected.acceptanceTargetRef,
    );
    if (isNil(threshold)) {
      return staleDraft("semantic-silhouette", expected.acceptanceTargetRef, row.evidenceRefs);
    }
    const observedTarget = observed.targets.find(
      (entry) => entry.acceptanceTargetRef === expected.acceptanceTargetRef,
    );
    if (
      isNil(observedTarget)
      || observedTarget.isSemanticTargetPresent !== true
      || observedTarget.visualGroupId !== expected.visualGroupId
    ) {
      hasIdentityMismatch = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Semantic silhouette target ${expected.acceptanceTargetRef} is missing or unbound.`,
      });
      continue;
    }
    const nextBoundsDrift = boundsDrift(expected.normalizedBounds, observedTarget.normalizedBounds);
    const nextCenterDrift = centerDrift(expected.normalizedCenter, observedTarget.normalizedCenter);
    const nextCoverageDrift = Math.abs(
      expected.coverageBasisPoints - observedTarget.coverageBasisPoints,
    );
    maximumBoundsDrift = Math.max(maximumBoundsDrift, nextBoundsDrift);
    maximumCenterDrift = Math.max(maximumCenterDrift, nextCenterDrift);
    maximumCoverageDrift = Math.max(maximumCoverageDrift, nextCoverageDrift);
    if (
      nextBoundsDrift > threshold.maximumBoundsDriftBasisPoints
      || nextCenterDrift > threshold.maximumCenterDriftBasisPoints
      || nextCoverageDrift > threshold.maximumCoverageDriftBasisPoints
    ) {
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Semantic silhouette target ${expected.acceptanceTargetRef} drifted beyond Profile thresholds.`,
      });
    }
  }
  const driftMetrics = [
    ratioMetric(maximumBoundsDrift),
    normalizedDistanceMetric(maximumCenterDrift),
    ratioMetric(maximumCoverageDrift),
  ];
  if (!isEmpty(diagnostics)) {
    return failedDraft(
      "semantic-silhouette",
      row.evidenceRefs,
      [failurePresence(), hasIdentityMismatch ? failureMatch() : successMatch(), ...driftMetrics],
      diagnostics,
    );
  }
  return passedDraft(
    "semantic-silhouette",
    row.evidenceRefs,
    [successPresence(), successMatch(), ...driftMetrics],
  );
}

function evaluateOpeningComposition(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const expected = reconstructionCase.expected.openingComposition;
  const observed = observedOfKind(row, "opening-composition-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft("opening-composition", expected.acceptanceTargetRef, row.evidenceRefs);
  }
  const diagnostics: DraftDiagnosticV1[] = [];
  let maximumRegionDrift = 0;
  let maximumAnchorDrift = 0;
  for (const region of expected.regions) {
    const threshold = profile.thresholds.openingComposition.regions.find(
      (entry) => entry.targetRef === region.targetRef,
    );
    if (isNil(threshold)) {
      return staleDraft("opening-composition", expected.acceptanceTargetRef, row.evidenceRefs);
    }
    const observedRegion = observed.regions.find((entry) => entry.targetRef === region.targetRef);
    if (isNil(observedRegion)) {
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition region ${region.targetRef} is missing.`,
      });
      continue;
    }
    const drift = boundsDrift(region.normalizedBounds, observedRegion.normalizedBounds);
    maximumRegionDrift = Math.max(maximumRegionDrift, drift);
    if (drift > threshold.maximumDriftBasisPoints) {
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition region ${region.targetRef} drifted beyond Profile thresholds.`,
      });
    }
  }
  for (const anchor of expected.anchors) {
    const threshold = profile.thresholds.openingComposition.anchors.find(
      (entry) => entry.targetRef === anchor.targetRef,
    );
    if (isNil(threshold)) {
      return staleDraft("opening-composition", expected.acceptanceTargetRef, row.evidenceRefs);
    }
    const observedAnchor = observed.anchors.find((entry) => entry.targetRef === anchor.targetRef);
    if (isNil(observedAnchor)) {
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition anchor ${anchor.targetRef} is missing.`,
      });
      continue;
    }
    const drift = centerDrift(anchor.normalizedCenter, observedAnchor.normalizedCenter);
    maximumAnchorDrift = Math.max(maximumAnchorDrift, drift);
    if (drift > threshold.maximumDriftBasisPoints) {
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition anchor ${anchor.targetRef} drifted beyond Profile thresholds.`,
      });
    }
  }
  const orderMatches = expected.orderedTargetRefs.length === observed.orderedTargetRefs.length
    && expected.orderedTargetRefs.every((targetRef, index) =>
      targetRef === observed.orderedTargetRefs[index]
    );
  if (!orderMatches) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      evidenceRefs: row.evidenceRefs,
      message: "Opening composition target order does not match the Case.",
    });
  } else {
    for (let index = 0; index < expected.orderedTargetRefs.length - 1; index += 1) {
      const left = expected.orderedTargetRefs[index]!;
      const right = expected.orderedTargetRefs[index + 1]!;
      const fromTargetRef = left < right ? left : right;
      const toTargetRef = left < right ? right : left;
      const observedDistance = observed.distances.find((entry) =>
        entry.fromTargetRef === fromTargetRef && entry.toTargetRef === toTargetRef
      );
      if (
        isNil(observedDistance)
        || observedDistance.distanceBasisPoints
          > profile.thresholds.openingComposition.maximumOrderDistanceBasisPoints
      ) {
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          evidenceRefs: row.evidenceRefs,
          message: `Opening composition framing distance ${fromTargetRef} to ${toTargetRef} exceeded the Profile threshold.`,
        });
      }
    }
  }
  const uniqueDiagnostics = uniqueDraftDiagnostics(diagnostics);
  const driftMetrics = [
    ratioMetric(maximumRegionDrift),
    normalizedDistanceMetric(maximumAnchorDrift),
  ];
  if (!isEmpty(uniqueDiagnostics)) {
    return failedDraft(
      "opening-composition",
      row.evidenceRefs,
      [failurePresence(), orderMatches ? successMatch() : failureMatch(), ...driftMetrics],
      uniqueDiagnostics,
    );
  }
  return passedDraft(
    "opening-composition",
    row.evidenceRefs,
    [successPresence(), successMatch(), ...driftMetrics],
  );
}

function uniqueDraftDiagnostics(
  diagnostics: readonly DraftDiagnosticV1[],
): readonly DraftDiagnosticV1[] {
  const seen = new Set<string>();
  const unique: DraftDiagnosticV1[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}\0${diagnostic.acceptanceTargetRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(diagnostic);
  }
  return Object.freeze(unique);
}

function evaluateSpawnSupport(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const expected = reconstructionCase.expected.spawnSupport;
  const observed = observedOfKind(row, "spawn-support-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft("spawn-support", expected.acceptanceTargetRef, row.evidenceRefs);
  }
  const identityMatches = observed.spawnMarkerId === expected.spawnMarkerId
    && observed.supportColliderId === expected.supportColliderId
    && observed.medium === expected.expectedMedium;
  const nextPositionDrift = positionDriftMillimeters(
    expected.expectedPositionXYZMeters,
    observed.positionXYZMeters,
  );
  const nextGap = observed.supportGapMillimeters;
  const withinTolerance = nextPositionDrift
      <= profile.thresholds.spawnSupport.maximumPositionDriftMillimeters
    && nextGap <= profile.thresholds.spawnSupport.maximumSupportGapMillimeters;
  if (identityMatches && withinTolerance) {
    return passedDraft("spawn-support", row.evidenceRefs, [
      successPresence(),
      successMatch(),
      millimeterMetric(nextPositionDrift),
      millimeterMetric(nextGap),
    ]);
  }
  return failedDraft(
    "spawn-support",
    row.evidenceRefs,
    [
      failurePresence(),
      identityMatches ? successMatch() : failureMatch(),
      millimeterMetric(nextPositionDrift),
      millimeterMetric(nextGap),
    ],
    [{
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      evidenceRefs: row.evidenceRefs,
      message: "Spawn support is missing, unsupported, or outside Profile tolerances.",
    }],
  );
}

function evaluateCollider(
  reconstructionCase: WorldReconstructionCaseV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const observed = observedOfKind(row, "collider-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft(
      "collider",
      reconstructionCase.expected.colliders[0]!.acceptanceTargetRef,
      row.evidenceRefs,
    );
  }
  const diagnostics: DraftDiagnosticV1[] = [];
  let hasMissing = false;
  let hasRoleMismatch = false;
  for (const expected of reconstructionCase.expected.colliders) {
    const observedContribution = observed.contributions.find(
      (entry) => entry.contributionId === expected.contributionId,
    );
    if (isNil(observedContribution) || (expected.requiresOverlay && observedContribution.hasOverlay !== true)) {
      hasMissing = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Required collider contribution ${expected.contributionId} is missing.`,
      });
      continue;
    }
    if (observedContribution.colliderId !== expected.colliderId || observedContribution.role !== expected.role) {
      hasRoleMismatch = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Required collider ${expected.colliderId} has role ${observedContribution.role} instead of ${expected.role}.`,
      });
    }
  }
  const uniqueDiagnostics = uniqueDraftDiagnostics(diagnostics);
  if (!isEmpty(uniqueDiagnostics)) {
    return failedDraft(
      "collider",
      row.evidenceRefs,
      [
        hasMissing ? failurePresence() : successPresence(),
        hasRoleMismatch ? failureMatch() : successMatch(),
      ],
      uniqueDiagnostics,
    );
  }
  return passedDraft("collider", row.evidenceRefs, [successPresence(), successMatch()]);
}

function evaluateCriticalTraversal(
  reconstructionCase: WorldReconstructionCaseV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const observed = observedOfKind(row, "critical-traversal-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft(
      "critical-traversal",
      reconstructionCase.expected.criticalTraversalChecks[0]!.acceptanceTargetRef,
      row.evidenceRefs,
    );
  }
  const missingDiagnostics: DraftDiagnosticV1[] = [];
  const failureDiagnostics: DraftDiagnosticV1[] = [];
  for (const expected of reconstructionCase.expected.criticalTraversalChecks) {
    const observedCheck = observed.checks.find((entry) => entry.id === expected.id);
    const checkpointsPresent = !isNil(observedCheck)
      && expected.checkpointIds.every((checkpointId) => observedCheck.checkpointIds.includes(checkpointId));
    if (isNil(observedCheck) || !checkpointsPresent || observedCheck.outcome === "incomplete") {
      missingDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Required traversal evidence is missing for ${expected.id}.`,
      });
      continue;
    }
    if (expected.expectation === "pass" && observedCheck.outcome === "blocked") {
      failureDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Required traversal ${expected.id} was blocked.`,
      });
    }
    if (expected.expectation === "block" && observedCheck.outcome === "reached") {
      failureDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        evidenceRefs: row.evidenceRefs,
        message: `Required blocker ${expected.id} was passable.`,
      });
    }
  }
  if (!isEmpty(missingDiagnostics)) {
    return {
      dimensionId: "critical-traversal",
      status: "incomplete",
      metrics: Object.freeze([]),
      evidenceRefs: uniqueSorted(row.evidenceRefs),
      diagnostics: uniqueDraftDiagnostics(missingDiagnostics),
    };
  }
  if (!isEmpty(failureDiagnostics)) {
    return failedDraft(
      "critical-traversal",
      row.evidenceRefs,
      [failurePresence(), failureMatch()],
      uniqueDraftDiagnostics(failureDiagnostics),
    );
  }
  return passedDraft("critical-traversal", row.evidenceRefs, [successPresence(), successMatch()]);
}

function evaluateDeterministicBuild(
  reconstructionCase: WorldReconstructionCaseV1,
  row: WorldReconstructionObservedDimensionRowV1,
): DimensionDraftV1 {
  const expected = reconstructionCase.expected.deterministicBuild;
  const observed = observedOfKind(row, "deterministic-build-observed");
  if (isNil(observed)) {
    return missingEvidenceDraft("deterministic-build", expected.acceptanceTargetRef, row.evidenceRefs);
  }
  if (observed.candidateReplayOutcome === "incomplete") {
    return missingEvidenceDraft("deterministic-build", expected.acceptanceTargetRef, row.evidenceRefs);
  }
  const identitiesMatch = observed.worldPackageIdentityMatches
    && observed.buildIdentityMatches
    && observed.captureIdentityMatches;
  if (observed.candidateReplayOutcome === "completed" && identitiesMatch) {
    return passedDraft("deterministic-build", row.evidenceRefs, [
      successPresence(),
      successMatch(),
      receiptOutcome("completed"),
    ]);
  }
  return failedDraft(
    "deterministic-build",
    row.evidenceRefs,
    [failurePresence(), failureMatch(), receiptOutcome("failed")],
    [{
      code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      evidenceRefs: row.evidenceRefs,
      message: "Deterministic build identities or Candidate replay do not agree.",
    }],
  );
}

function evaluateDimension(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  evidence: WorldReconstructionEvidenceSetV1,
  dimensionId: WorldReconstructionDimensionIdV1,
): DimensionDraftV1 {
  const row = observedRow(evidence, dimensionId);
  const fallbackTarget = primaryAcceptanceTargetRef(reconstructionCase, dimensionId);
  if (isNil(row)) return missingEvidenceDraft(dimensionId, fallbackTarget, []);
  if (dimensionId === "collider") return evaluateCollider(reconstructionCase, row);
  if (dimensionId === "critical-traversal") return evaluateCriticalTraversal(reconstructionCase, row);
  if (dimensionId === "deterministic-build") return evaluateDeterministicBuild(reconstructionCase, row);
  if (dimensionId === "opening-composition") {
    return evaluateOpeningComposition(reconstructionCase, profile, row);
  }
  if (dimensionId === "semantic-silhouette") {
    return evaluateSemanticSilhouette(reconstructionCase, profile, row);
  }
  if (dimensionId === "spawn-support") return evaluateSpawnSupport(reconstructionCase, profile, row);
  return evaluateTopology(reconstructionCase, row);
}

function finishResult(
  evidence: WorldReconstructionEvidenceSetV1,
  drafts: readonly DimensionDraftV1[],
): WorldReconstructionEvaluationResultV1 {
  const identity = Object.freeze({
    attemptHash: evidence.attemptHash,
    worldPackageRootHash: evidence.worldPackageRootHash,
    worldBuildIdentityHash: evidence.worldBuildIdentityHash,
    captureReceiptHash: evidence.captureReceiptHash,
  });
  const diagnostics = sortBy(
    drafts.flatMap((draft) => draft.diagnostics.map((diagnostic) => ({
      kind: "world-reconstruction-diagnostic" as const,
      schemaVersion: 1 as const,
      id: `world-reconstruction-diagnostic:${draft.dimensionId}:${diagnostic.code}:${diagnostic.acceptanceTargetRef}`,
      code: diagnostic.code,
      dimensionId: draft.dimensionId,
      acceptanceTargetRef: diagnostic.acceptanceTargetRef,
      evidenceRefs: uniqueSorted(diagnostic.evidenceRefs),
      message: diagnostic.message,
      repairAction: Object.freeze({ kind: "revise-native-source" as const }),
    } satisfies WorldReconstructionDiagnosticV1))),
    ["dimensionId", "code", "acceptanceTargetRef"],
  );
  const dimensions = WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.map((dimensionId) => {
    const draft = drafts.find((entry) => entry.dimensionId === dimensionId)!;
    return Object.freeze({
      dimensionId,
      status: draft.status,
      metrics: Object.freeze([...draft.metrics]),
      evidenceRefs: uniqueSorted(draft.evidenceRefs),
      diagnosticIds: uniqueSorted(
        diagnostics.filter((diagnostic) => diagnostic.dimensionId === dimensionId).map(({ id }) => id),
      ),
      identity,
    });
  });
  const outcome: WorldReconstructionOutcomeV1 = dimensions.some(({ status }) => status === "incomplete")
    ? "incomplete"
    : dimensions.some(({ status }) => status === "failed")
      ? "failed"
      : "passed";
  return parseWorldReconstructionEvaluationResultV1({
    kind: "world-reconstruction-evaluation-result",
    schemaVersion: 1,
    id: `${evidence.id}.result`,
    caseRef: evidence.caseRef,
    caseHash: evidence.caseHash,
    evaluationProfileRef: evidence.evaluationProfileRef,
    evaluationProfileHash: evidence.evaluationProfileHash,
    evidenceSetRef: evidence.id,
    evidenceSetHash: hashWorldReconstructionEvidenceSetV1(evidence),
    attemptRef: evidence.attemptRef,
    attemptHash: evidence.attemptHash,
    worldPackageRef: evidence.worldPackageRef,
    worldPackageRootHash: evidence.worldPackageRootHash,
    worldBuildIdentityRef: evidence.worldBuildIdentityRef,
    worldBuildIdentityHash: evidence.worldBuildIdentityHash,
    captureReceiptRef: evidence.captureReceiptRef,
    captureReceiptHash: evidence.captureReceiptHash,
    outcome,
    diagnostics: Object.freeze(diagnostics),
    dimensions: Object.freeze(dimensions),
  });
}

export function evaluateWorldReconstructionV1(
  input: Readonly<EvaluateWorldReconstructionV1Input>,
): WorldReconstructionEvaluationResultV1 {
  const reconstructionCase = parseWorldReconstructionCaseV1(input.case);
  const profile = parseWorldReconstructionEvaluationProfileV1(input.profile);
  const evidence = parseWorldReconstructionEvidenceSetV1(input.evidence);
  const identityEvidenceRefs = evidence.identityEvidence.map(({ artifactRef }) => artifactRef);
  if (identitiesAreStale(reconstructionCase, profile, evidence)) {
    return finishResult(
      evidence,
      WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.map((dimensionId) => staleDraft(
        dimensionId,
        primaryAcceptanceTargetRef(reconstructionCase, dimensionId),
        identityEvidenceRefs,
      )),
    );
  }
  return finishResult(
    evidence,
    WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.map((dimensionId) =>
      evaluateDimension(reconstructionCase, profile, evidence, dimensionId)
    ),
  );
}
