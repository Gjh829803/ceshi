import { isEmpty, isNil, sortBy } from "lodash-es";

import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvidenceSetV1,
  isWorldReconstructionRepairableDiagnosticCodeV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  WORLD_RECONSTRUCTION_DIMENSION_IDS_V1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticCodeV1,
  type WorldReconstructionDiagnosticDetailsV1,
  type WorldReconstructionDiagnosticMetricIdV1,
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
  type WorldReconstructionRepairActionV1,
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
  readonly targetRef: string;
  readonly targetId: string;
  readonly metricId: WorldReconstructionDiagnosticMetricIdV1;
  readonly details: WorldReconstructionDiagnosticDetailsV1;
  readonly evidenceRefs: readonly string[];
  readonly message: string;
  readonly repairAction?: WorldReconstructionRepairActionV1;
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

function basisPointsThresholdDetails(
  expectedBasisPoints: number,
  actualBasisPoints: number,
  maximumAllowedDriftBasisPoints: number,
): Extract<WorldReconstructionDiagnosticDetailsV1, {
  kind: "basis-points-threshold";
}> {
  return Object.freeze({
    kind: "basis-points-threshold",
    expectedBasisPoints,
    actualBasisPoints,
    maximumAllowedDriftBasisPoints,
    exceededByBasisPoints:
      Math.abs(actualBasisPoints - expectedBasisPoints) -
      maximumAllowedDriftBasisPoints,
    correctionDirection:
      actualBasisPoints < expectedBasisPoints ? "increase" : "decrease",
  });
}

function millimetersThresholdDetails(
  expectedMillimeters: number,
  actualMillimeters: number,
  maximumAllowedDriftMillimeters: number,
): Extract<WorldReconstructionDiagnosticDetailsV1, {
  kind: "millimeters-threshold";
}> {
  return Object.freeze({
    kind: "millimeters-threshold",
    expectedMillimeters,
    actualMillimeters,
    maximumAllowedDriftMillimeters,
    exceededByMillimeters:
      Math.abs(actualMillimeters - expectedMillimeters) -
      maximumAllowedDriftMillimeters,
    correctionDirection:
      actualMillimeters < expectedMillimeters ? "increase" : "decrease",
  });
}

function stateMismatchDetails(
  expectedValue: string,
  actualValue: string,
): Extract<WorldReconstructionDiagnosticDetailsV1, {
  kind: "state-mismatch";
}> {
  return Object.freeze({
    kind: "state-mismatch",
    expectedValue,
    actualValue,
    correctionDirection: "replace",
  });
}

function presenceMismatchDetails(): Extract<
  WorldReconstructionDiagnosticDetailsV1,
  { kind: "presence-mismatch" }
> {
  return Object.freeze({
    kind: "presence-mismatch",
    expectedValue: "present",
    actualValue: "missing",
    correctionDirection: "add",
  });
}

function sequenceMismatchDetails(
  expectedValues: readonly string[],
  actualValues: readonly string[],
): Extract<WorldReconstructionDiagnosticDetailsV1, {
  kind: "sequence-mismatch";
}> {
  return Object.freeze({
    kind: "sequence-mismatch",
    expectedValues: Object.freeze([...expectedValues]),
    actualValues: Object.freeze([...actualValues]),
    correctionDirection: "reorder",
  });
}

function sourceRepairAction(
  targetKind: WorldReconstructionRepairActionV1["targetKind"],
  targetId: string,
  operation: WorldReconstructionRepairActionV1["operation"],
  instruction: string,
): WorldReconstructionRepairActionV1 {
  return Object.freeze({
    kind: "revise-native-source",
    targetKind,
    targetId,
    operation,
    instruction,
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
      targetRef: acceptanceTargetRef,
      targetId: dimensionId,
      metricId: "required-evidence-presence",
      details: presenceMismatchDetails(),
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
      targetRef: acceptanceTargetRef,
      targetId: dimensionId,
      metricId: "evidence-identity",
      details: stateMismatchDetails("current", "stale"),
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
    const checks = reconstructionCase.expected.criticalTraversalChecks;
    return checks.length === 0 ? reconstructionCase.expected.spawnSupport.acceptanceTargetRef
      : checks[0]!.acceptanceTargetRef;
  }
  if (dimensionId === "deterministic-build") {
    return reconstructionCase.expected.deterministicBuild.acceptanceTargetRef;
  }
  if (dimensionId === "opening-composition") {
    return reconstructionCase.expected.openingComposition.acceptanceTargetRef;
  }
  if (dimensionId === "semantic-silhouette") {
    return reconstructionCase.expected.semanticSilhouetteTargets[0]?.acceptanceTargetRef
      ?? reconstructionCase.expected.spawnSupport.acceptanceTargetRef;
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
  if (expected.nodeIds.length === 0) {
    return missingEvidenceDraft("topology", expected.acceptanceTargetRef, row.evidenceRefs);
  }
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
  for (const nodeId of missingNodes) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: nodeId,
      metricId: "topology-node-presence",
      details: presenceMismatchDetails(),
      evidenceRefs: row.evidenceRefs,
      message: `Required topology node ${nodeId} is missing.`,
      repairAction: sourceRepairAction(
        "topology-node",
        nodeId,
        "add",
        `Add topology node ${nodeId} by revising the Native visual groups and native-block-authoring.json; do not edit the Case or thresholds.`,
      ),
    });
  }
  for (const layerId of missingLayers) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: layerId,
      metricId: "topology-layer-presence",
      details: presenceMismatchDetails(),
      evidenceRefs: row.evidenceRefs,
      message: `Required topology layer ${layerId} is missing.`,
      repairAction: sourceRepairAction(
        "topology-layer",
        layerId,
        "add",
        `Add topology layer ${layerId} by revising the Native visual groups and native-block-authoring.json; do not edit the Case or thresholds.`,
      ),
    });
  }
  for (const relation of missingRelations) {
    const formattedRelation = formatRelation(relation);
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: formattedRelation,
      metricId: "topology-relation-presence",
      details: presenceMismatchDetails(),
      evidenceRefs: row.evidenceRefs,
      message: `Required topology relation ${formattedRelation} is missing.`,
      repairAction: sourceRepairAction(
        "topology-relation",
        formattedRelation,
        "add",
        `Revise Native geometry so the captured topology proves ${formattedRelation}; do not edit the Case, evidence, or thresholds.`,
      ),
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
  if (expectedTargets.length === 0) {
    return missingEvidenceDraft("semantic-silhouette",
      reconstructionCase.expected.spawnSupport.acceptanceTargetRef, row.evidenceRefs);
  }
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
  let hasRequiredProjectionMissing = false;
  let hasReferenceProjectionDrift = false;
  for (const expected of expectedTargets) {
    const threshold = profile.thresholds.semanticSilhouetteTargets.find(
      (entry) => entry.acceptanceTargetRef === expected.acceptanceTargetRef,
    );
    if (isNil(threshold)) {
      return staleDraft("semantic-silhouette", expected.acceptanceTargetRef, row.evidenceRefs);
    }
    for (const requirement of expected.viewRequirements) {
      if (requirement.mode === "not-required") continue;
      const observedView = observed.views.find(({ viewId }) =>
        viewId === requirement.viewId);
      const observedTarget = observedView?.targets.find(
        (entry) => entry.acceptanceTargetRef === expected.acceptanceTargetRef,
      );
      if (isNil(observedTarget) || observedTarget.visualGroupId !== expected.visualGroupId) {
        hasIdentityMismatch = true;
        const actualValue = isNil(observedTarget)
          ? "missing"
          : observedTarget.visualGroupId;
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          targetRef: expected.acceptanceTargetRef,
          targetId: expected.visualGroupId,
          metricId: `${requirement.viewId}-semantic-target-binding`,
          details: stateMismatchDetails(expected.visualGroupId, actualValue),
          evidenceRefs: row.evidenceRefs,
          message: `Semantic target ${expected.acceptanceTargetRef} expected visual group ${expected.visualGroupId} in ${requirement.viewId}, observed ${actualValue}.`,
          repairAction: sourceRepairAction(
            "visual-group",
            expected.visualGroupId,
            "bind",
            `Create or bind visual group ${expected.visualGroupId} to acceptance target ${expected.acceptanceTargetRef}; do not edit the Case or thresholds.`,
          ),
        });
        continue;
      }
      if (requirement.mode !== "reference-projection-required") continue;
      const projection = observedTarget.structuralProjection;
      if (projection.outcome !== "projected") {
        hasRequiredProjectionMissing = true;
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          targetRef: expected.acceptanceTargetRef,
          targetId: expected.visualGroupId,
          metricId: `${requirement.viewId}-reference-projection`,
          details: stateMismatchDetails("projected", projection.outcome),
          evidenceRefs: row.evidenceRefs,
          message: `Visual group ${expected.visualGroupId} has no structural projection in required view ${requirement.viewId}.`,
          repairAction: sourceRepairAction(
            "visual-group",
            expected.visualGroupId,
            "move",
            `Move visual group ${expected.visualGroupId} into the ${requirement.viewId} reference projection without editing the Case or thresholds.`,
          ),
        });
        continue;
      }
      const nextBoundsDrift = boundsDrift(
        requirement.normalizedBounds,
        projection.normalizedBounds,
      );
      const nextCenterDrift = centerDrift(
        requirement.normalizedCenter,
        projection.normalizedCenter,
      );
      const nextCoverageDrift = Math.abs(
        requirement.coverageBasisPoints - projection.coverageBasisPoints,
      );
      maximumBoundsDrift = Math.max(maximumBoundsDrift, nextBoundsDrift);
      maximumCenterDrift = Math.max(maximumCenterDrift, nextCenterDrift);
      maximumCoverageDrift = Math.max(maximumCoverageDrift, nextCoverageDrift);
      const boundsMetrics = [
        ["min-x", "minimum screen X edge", requirement.normalizedBounds.minXBasisPoints, projection.normalizedBounds.minXBasisPoints],
        ["min-y", "minimum screen Y edge", requirement.normalizedBounds.minYBasisPoints, projection.normalizedBounds.minYBasisPoints],
        ["max-x", "maximum screen X edge", requirement.normalizedBounds.maxXBasisPoints, projection.normalizedBounds.maxXBasisPoints],
        ["max-y", "maximum screen Y edge", requirement.normalizedBounds.maxYBasisPoints, projection.normalizedBounds.maxYBasisPoints],
      ] as const;
      for (const [edgeId, label, expectedValue, actualValue] of boundsMetrics) {
        if (Math.abs(actualValue - expectedValue) <= threshold.maximumBoundsDriftBasisPoints) continue;
        hasReferenceProjectionDrift = true;
        const details = basisPointsThresholdDetails(expectedValue, actualValue, threshold.maximumBoundsDriftBasisPoints);
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          targetRef: expected.acceptanceTargetRef,
          targetId: expected.visualGroupId,
          metricId: `${requirement.viewId}-semantic-bounds-${edgeId}-basis-points`,
          details,
          evidenceRefs: row.evidenceRefs,
          message: `Visual group ${expected.visualGroupId} ${requirement.viewId} ${label} is ${actualValue} basis points; target ${expectedValue}, allowed drift ${threshold.maximumBoundsDriftBasisPoints}.`,
          repairAction: sourceRepairAction("visual-group", expected.visualGroupId, "resize", `${details.correctionDirection === "increase" ? "Increase" : "Decrease"} visual group ${expected.visualGroupId} ${label} toward ${expectedValue} basis points; do not edit thresholds.`),
        });
      }
      const centerMetrics = [
        ["x", "screen X center", requirement.normalizedCenter.xBasisPoints, projection.normalizedCenter.xBasisPoints],
        ["y", "screen Y center", requirement.normalizedCenter.yBasisPoints, projection.normalizedCenter.yBasisPoints],
      ] as const;
      for (const [axis, label, expectedValue, actualValue] of centerMetrics) {
        if (Math.abs(actualValue - expectedValue) <= threshold.maximumCenterDriftBasisPoints) continue;
        hasReferenceProjectionDrift = true;
        const details = basisPointsThresholdDetails(expectedValue, actualValue, threshold.maximumCenterDriftBasisPoints);
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          targetRef: expected.acceptanceTargetRef,
          targetId: expected.visualGroupId,
          metricId: `${requirement.viewId}-semantic-center-${axis}-basis-points`,
          details,
          evidenceRefs: row.evidenceRefs,
          message: `Visual group ${expected.visualGroupId} ${requirement.viewId} ${label} is ${actualValue} basis points; target ${expectedValue}, allowed drift ${threshold.maximumCenterDriftBasisPoints}.`,
          repairAction: sourceRepairAction("visual-group", expected.visualGroupId, "move", `${details.correctionDirection === "increase" ? "Increase" : "Decrease"} visual group ${expected.visualGroupId} ${label} toward ${expectedValue} basis points; do not edit thresholds.`),
        });
      }
      if (nextCoverageDrift > threshold.maximumCoverageDriftBasisPoints) {
        hasReferenceProjectionDrift = true;
        const details = basisPointsThresholdDetails(requirement.coverageBasisPoints, projection.coverageBasisPoints, threshold.maximumCoverageDriftBasisPoints);
        diagnostics.push({
          code: "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
          acceptanceTargetRef: expected.acceptanceTargetRef,
          targetRef: expected.acceptanceTargetRef,
          targetId: expected.visualGroupId,
          metricId: `${requirement.viewId}-semantic-coverage-basis-points`,
          details,
          evidenceRefs: row.evidenceRefs,
          message: `Visual group ${expected.visualGroupId} ${requirement.viewId} coverage is ${projection.coverageBasisPoints} basis points; target ${requirement.coverageBasisPoints}.`,
          repairAction: sourceRepairAction("visual-group", expected.visualGroupId, "resize", `${details.correctionDirection === "increase" ? "Enlarge" : "Shrink"} visual group ${expected.visualGroupId} toward ${requirement.coverageBasisPoints} coverage basis points; do not edit thresholds.`),
        });
      }
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
      [
        hasRequiredProjectionMissing ? failurePresence() : successPresence(),
        hasIdentityMismatch || hasReferenceProjectionDrift
          ? failureMatch()
          : successMatch(),
        ...driftMetrics,
      ],
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
        targetRef: region.targetRef,
        targetId: region.targetRef,
        metricId: "opening-region-presence",
        details: presenceMismatchDetails(),
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition region ${region.targetRef} is missing.`,
        repairAction: sourceRepairAction(
          "composition-target",
          region.targetRef,
          "add",
          `Add or restore the Native visual group bound to opening region ${region.targetRef}; do not edit the Case or thresholds.`,
        ),
      });
      continue;
    }
    const drift = boundsDrift(region.normalizedBounds, observedRegion.normalizedBounds);
    maximumRegionDrift = Math.max(maximumRegionDrift, drift);
    const regionBoundsMetrics = [
      ["opening-region-min-x-basis-points", "minimum screen X edge", region.normalizedBounds.minXBasisPoints, observedRegion.normalizedBounds.minXBasisPoints],
      ["opening-region-min-y-basis-points", "minimum screen Y edge", region.normalizedBounds.minYBasisPoints, observedRegion.normalizedBounds.minYBasisPoints],
      ["opening-region-max-x-basis-points", "maximum screen X edge", region.normalizedBounds.maxXBasisPoints, observedRegion.normalizedBounds.maxXBasisPoints],
      ["opening-region-max-y-basis-points", "maximum screen Y edge", region.normalizedBounds.maxYBasisPoints, observedRegion.normalizedBounds.maxYBasisPoints],
    ] as const;
    for (const [metricId, label, expectedValue, actualValue] of regionBoundsMetrics) {
      if (Math.abs(actualValue - expectedValue) <= threshold.maximumDriftBasisPoints) continue;
      const details = basisPointsThresholdDetails(
        expectedValue,
        actualValue,
        threshold.maximumDriftBasisPoints,
      );
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: region.targetRef,
        targetId: region.targetRef,
        metricId,
        details,
        evidenceRefs: row.evidenceRefs,
        message: `Opening region ${region.targetRef} ${label} is ${actualValue} basis points; target ${expectedValue}, allowed drift ${threshold.maximumDriftBasisPoints}, exceeded by ${details.exceededByBasisPoints}.`,
        repairAction: sourceRepairAction(
          "composition-target",
          region.targetRef,
          "resize",
          `${details.correctionDirection === "increase" ? "Increase" : "Decrease"} the Native visual group bound to opening region ${region.targetRef} at its ${label} toward ${expectedValue} basis points; do not edit thresholds.`,
        ),
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
        targetRef: anchor.targetRef,
        targetId: anchor.targetRef,
        metricId: "opening-anchor-presence",
        details: presenceMismatchDetails(),
        evidenceRefs: row.evidenceRefs,
        message: `Opening composition anchor ${anchor.targetRef} is missing.`,
        repairAction: sourceRepairAction(
          "composition-target",
          anchor.targetRef,
          "add",
          `Add or restore the Native visual group bound to opening anchor ${anchor.targetRef}; do not edit the Case or thresholds.`,
        ),
      });
      continue;
    }
    const drift = centerDrift(anchor.normalizedCenter, observedAnchor.normalizedCenter);
    maximumAnchorDrift = Math.max(maximumAnchorDrift, drift);
    const anchorCenterMetrics = [
      ["opening-anchor-x-basis-points", "screen X center", anchor.normalizedCenter.xBasisPoints, observedAnchor.normalizedCenter.xBasisPoints],
      ["opening-anchor-y-basis-points", "screen Y center", anchor.normalizedCenter.yBasisPoints, observedAnchor.normalizedCenter.yBasisPoints],
    ] as const;
    for (const [metricId, label, expectedValue, actualValue] of anchorCenterMetrics) {
      if (Math.abs(actualValue - expectedValue) <= threshold.maximumDriftBasisPoints) continue;
      const details = basisPointsThresholdDetails(
        expectedValue,
        actualValue,
        threshold.maximumDriftBasisPoints,
      );
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: anchor.targetRef,
        targetId: anchor.targetRef,
        metricId,
        details,
        evidenceRefs: row.evidenceRefs,
        message: `Opening anchor ${anchor.targetRef} ${label} is ${actualValue} basis points; target ${expectedValue}, allowed drift ${threshold.maximumDriftBasisPoints}, exceeded by ${details.exceededByBasisPoints}.`,
        repairAction: sourceRepairAction(
          "composition-target",
          anchor.targetRef,
          "move",
          `${details.correctionDirection === "increase" ? "Increase" : "Decrease"} the Native visual group bound to opening anchor ${anchor.targetRef} ${label} toward ${expectedValue} basis points; do not edit thresholds.`,
        ),
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
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.acceptanceTargetRef,
      metricId: "opening-target-order",
      details: sequenceMismatchDetails(
        expected.orderedTargetRefs,
        observed.orderedTargetRefs,
      ),
      evidenceRefs: row.evidenceRefs,
      message: "Opening composition target order does not match the Case.",
      repairAction: sourceRepairAction(
        "composition-target",
        expected.acceptanceTargetRef,
        "reorder",
        `Reposition the Native visual groups bound to opening targets so their order is ${expected.orderedTargetRefs.join(" -> ")}; do not edit the Case or thresholds.`,
      ),
    });
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
    const key = [
      diagnostic.code,
      diagnostic.acceptanceTargetRef,
      diagnostic.targetRef,
      diagnostic.targetId,
      diagnostic.metricId,
    ].join("\0");
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
  const diagnostics: DraftDiagnosticV1[] = [];
  if (observed.spawnMarkerId !== expected.spawnMarkerId) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.spawnMarkerId,
      metricId: "spawn-marker-identity",
      details: stateMismatchDetails(expected.spawnMarkerId, observed.spawnMarkerId),
      evidenceRefs: row.evidenceRefs,
      message: `Spawn marker is ${observed.spawnMarkerId}; expected ${expected.spawnMarkerId}.`,
      repairAction: sourceRepairAction(
        "spawn-marker",
        expected.spawnMarkerId,
        "bind",
        `Bind the Native spawn contribution to marker ${expected.spawnMarkerId}; do not edit the Case or thresholds.`,
      ),
    });
  }
  if (observed.supportColliderId !== expected.supportColliderId) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.supportColliderId,
      metricId: "spawn-support-collider-identity",
      details: stateMismatchDetails(expected.supportColliderId, observed.supportColliderId),
      evidenceRefs: row.evidenceRefs,
      message: `Spawn support collider is ${observed.supportColliderId}; expected ${expected.supportColliderId}.`,
      repairAction: sourceRepairAction(
        "static-collider",
        expected.supportColliderId,
        "bind",
        `Place spawn marker ${expected.spawnMarkerId} on static collider ${expected.supportColliderId} and preserve that explicit contribution identity.`,
      ),
    });
  }
  if (observed.medium !== expected.expectedMedium) {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.spawnMarkerId,
      metricId: "spawn-medium",
      details: stateMismatchDetails(expected.expectedMedium, observed.medium),
      evidenceRefs: row.evidenceRefs,
      message: `Spawn medium is ${observed.medium}; expected ${expected.expectedMedium}.`,
      repairAction: sourceRepairAction(
        "spawn-marker",
        expected.spawnMarkerId,
        "adjust-support",
        `Move spawn marker ${expected.spawnMarkerId} onto a stable ${expected.expectedMedium} support surface contributed by ${expected.supportColliderId}.`,
      ),
    });
  }
  if (nextPositionDrift > profile.thresholds.spawnSupport.maximumPositionDriftMillimeters) {
    const details = millimetersThresholdDetails(
      0,
      nextPositionDrift,
      profile.thresholds.spawnSupport.maximumPositionDriftMillimeters,
    );
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.spawnMarkerId,
      metricId: "spawn-position-drift-millimeters",
      details,
      evidenceRefs: row.evidenceRefs,
      message: `Spawn position drift is ${nextPositionDrift}mm; maximum ${profile.thresholds.spawnSupport.maximumPositionDriftMillimeters}mm, exceeded by ${details.exceededByMillimeters}mm.`,
      repairAction: sourceRepairAction(
        "spawn-marker",
        expected.spawnMarkerId,
        "move",
        `Move spawn marker ${expected.spawnMarkerId} toward [${expected.expectedPositionXYZMeters.xMeters}, ${expected.expectedPositionXYZMeters.yMeters}, ${expected.expectedPositionXYZMeters.zMeters}] meters until position drift is at most ${profile.thresholds.spawnSupport.maximumPositionDriftMillimeters}mm.`,
      ),
    });
  }
  if (nextGap > profile.thresholds.spawnSupport.maximumSupportGapMillimeters) {
    const details = millimetersThresholdDetails(
      0,
      nextGap,
      profile.thresholds.spawnSupport.maximumSupportGapMillimeters,
    );
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: expected.spawnMarkerId,
      metricId: "spawn-support-gap-millimeters",
      details,
      evidenceRefs: row.evidenceRefs,
      message: `Spawn support gap is ${nextGap}mm; maximum ${profile.thresholds.spawnSupport.maximumSupportGapMillimeters}mm, exceeded by ${details.exceededByMillimeters}mm.`,
      repairAction: sourceRepairAction(
        "spawn-marker",
        expected.spawnMarkerId,
        "adjust-support",
        `Lower spawn marker ${expected.spawnMarkerId} or raise support collider ${expected.supportColliderId} until the support gap is at most ${profile.thresholds.spawnSupport.maximumSupportGapMillimeters}mm.`,
      ),
    });
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
    uniqueDraftDiagnostics(diagnostics),
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
    if (isNil(observedContribution)) {
      hasMissing = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.colliderId,
        metricId: "collider-contribution-presence",
        details: presenceMismatchDetails(),
        evidenceRefs: row.evidenceRefs,
        message: `Required collider contribution ${expected.contributionId} is missing.`,
        repairAction: sourceRepairAction(
          "static-collider",
          expected.colliderId,
          "add",
          `Register static collider contribution ${expected.contributionId} with collider id ${expected.colliderId}; do not infer colliders from Mesh names, tags, or materials.`,
        ),
      });
      continue;
    }
    if (expected.requiresOverlay && observedContribution.hasOverlay !== true) {
      hasMissing = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.colliderId,
        metricId: "collider-overlay-presence",
        details: presenceMismatchDetails(),
        evidenceRefs: row.evidenceRefs,
        message: `Required collider overlay for ${expected.colliderId} is missing.`,
        repairAction: sourceRepairAction(
          "static-collider",
          expected.colliderId,
          "bind",
          `Preserve static collider contribution ${expected.contributionId} so formal Capture can render its identity-bound collider overlay.`,
        ),
      });
    }
    if (observedContribution.colliderId !== expected.colliderId) {
      hasRoleMismatch = true;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.colliderId,
        metricId: "collider-identity",
        details: stateMismatchDetails(expected.colliderId, observedContribution.colliderId),
        evidenceRefs: row.evidenceRefs,
        message: `Collider contribution ${expected.contributionId} resolves to ${observedContribution.colliderId}; expected ${expected.colliderId}.`,
        repairAction: sourceRepairAction(
          "static-collider",
          expected.colliderId,
          "bind",
          `Bind contribution ${expected.contributionId} to static collider ${expected.colliderId}; do not rename the Case target or scan Mesh metadata.`,
        ),
      });
    }
    if (observedContribution.role !== expected.role) {
      hasRoleMismatch = true;
      const instruction = expected.role === "blocker"
        ? `Set static collider ${expected.colliderId} traversalBinding.kind to "not-traversable" so the Host derives role blocker. Changing logicalSubshapeId, name, tag, material, paletteRole, or shape does not change the Host-derived blocker role.`
        : expected.role === "step"
          ? `Set static collider ${expected.colliderId} traversalBinding.kind to "static-surface" and author its source block with shape.kind "step" so the Host derives role step.`
          : `Set static collider ${expected.colliderId} traversalBinding.kind to "static-surface" and use a non-step source block shape so the Host derives role ground.`;
      diagnostics.push({
        code: "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.colliderId,
        metricId: "collider-role",
        details: stateMismatchDetails(expected.role, observedContribution.role),
        evidenceRefs: row.evidenceRefs,
        message: `Required collider ${expected.colliderId} has role ${observedContribution.role} instead of ${expected.role}.`,
        repairAction: sourceRepairAction(
          "static-collider",
          expected.colliderId,
          "set-traversal-binding",
          instruction,
        ),
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
  if (reconstructionCase.expected.criticalTraversalChecks.length === 0) {
    return missingEvidenceDraft("critical-traversal",
      reconstructionCase.expected.spawnSupport.acceptanceTargetRef, row.evidenceRefs);
  }
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
    if (isNil(observedCheck) || !checkpointsPresent) {
      missingDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.id,
        metricId: "critical-traversal-evidence",
        details: presenceMismatchDetails(),
        evidenceRefs: row.evidenceRefs,
        message: `Required traversal evidence is missing for ${expected.id}.`,
      });
      continue;
    }
    if (observedCheck.outcome === "incomplete") {
      missingDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_TRAVERSAL_EVIDENCE_INCOMPLETE",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.id,
        metricId: "critical-traversal-completeness",
        details: {
          kind: "state-mismatch",
          expectedValue: "complete",
          actualValue: "incomplete",
          correctionDirection: "replace",
        },
        evidenceRefs: row.evidenceRefs,
        message: `Required traversal evidence is incomplete for ${expected.id}.`,
        repairAction: sourceRepairAction(
          "traversal-check",
          expected.id,
          "adjust-traversal",
          `Adjust the Native route for traversal check ${expected.id} so every declared checkpoint produces a conclusive reached, passed, or blocked measurement.`,
        ),
      });
      continue;
    }
    if (expected.expectation === "pass" && observedCheck.outcome === "blocked") {
      failureDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.id,
        metricId: "critical-traversal-outcome",
        details: stateMismatchDetails("reached", observedCheck.outcome),
        evidenceRefs: row.evidenceRefs,
        message: `Required traversal ${expected.id} was blocked.`,
        repairAction: sourceRepairAction(
          "traversal-check",
          expected.id,
          "adjust-traversal",
          `Open or reshape the Native route for traversal check ${expected.id} until every declared checkpoint is reachable; keep required blocker colliders intact.`,
        ),
      });
    }
    if (expected.expectation === "block" && observedCheck.outcome === "reached") {
      failureDiagnostics.push({
        code: "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE",
        acceptanceTargetRef: expected.acceptanceTargetRef,
        targetRef: expected.acceptanceTargetRef,
        targetId: expected.id,
        metricId: "critical-traversal-outcome",
        details: stateMismatchDetails("blocked", observedCheck.outcome),
        evidenceRefs: row.evidenceRefs,
        message: `Required blocker ${expected.id} was passable.`,
        repairAction: sourceRepairAction(
          "traversal-check",
          expected.id,
          "adjust-traversal",
          `Close the Native blocker for traversal check ${expected.id} and register its static collider with traversalBinding.kind "not-traversable" so the path remains blocked.`,
        ),
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
  const diagnostics: DraftDiagnosticV1[] = [];
  if (observed.candidateReplayOutcome !== "completed") {
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId: "candidate-replay",
      metricId: "deterministic-candidate-replay",
      details: stateMismatchDetails("completed", observed.candidateReplayOutcome),
      evidenceRefs: row.evidenceRefs,
      message: `Candidate replay outcome is ${observed.candidateReplayOutcome}; expected completed.`,
    });
  }
  const identityChecks = [
    ["deterministic-world-package-identity", "world-package", observed.worldPackageIdentityMatches],
    ["deterministic-build-identity", "world-build", observed.buildIdentityMatches],
    ["deterministic-capture-identity", "capture", observed.captureIdentityMatches],
  ] as const;
  for (const [metricId, targetId, isMatch] of identityChecks) {
    if (isMatch) continue;
    diagnostics.push({
      code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
      acceptanceTargetRef: expected.acceptanceTargetRef,
      targetRef: expected.acceptanceTargetRef,
      targetId,
      metricId,
      details: stateMismatchDetails("matching", "mismatched"),
      evidenceRefs: row.evidenceRefs,
      message: `Deterministic ${targetId} identity does not match the frozen attempt.`,
    });
  }
  return failedDraft(
    "deterministic-build",
    row.evidenceRefs,
    [failurePresence(), failureMatch(), receiptOutcome("failed")],
    uniqueDraftDiagnostics(diagnostics),
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
    drafts.flatMap((draft) => draft.diagnostics.map((diagnostic): WorldReconstructionDiagnosticV1 => {
      const common = {
        kind: "world-reconstruction-diagnostic" as const,
        schemaVersion: 1 as const,
        id: `world-reconstruction-diagnostic:${draft.dimensionId}:${diagnostic.code}:${diagnostic.metricId}:${diagnostic.targetRef}:${diagnostic.targetId}`,
        dimensionId: draft.dimensionId,
        acceptanceTargetRef: diagnostic.acceptanceTargetRef,
        targetRef: diagnostic.targetRef,
        targetId: diagnostic.targetId,
        metricId: diagnostic.metricId,
        details: diagnostic.details,
        evidenceRefs: uniqueSorted(diagnostic.evidenceRefs),
        message: diagnostic.message,
      };
      if (!isWorldReconstructionRepairableDiagnosticCodeV1(diagnostic.code)) {
        return Object.freeze({ ...common, code: diagnostic.code });
      }
      if (isNil(diagnostic.repairAction)) {
        throw new Error(`Repairable diagnostic ${diagnostic.code} requires an executable repair action.`);
      }
      return Object.freeze({
        ...common,
        code: diagnostic.code,
        repairAction: diagnostic.repairAction,
      });
    })),
    ["dimensionId", "code", "metricId", "targetRef", "targetId"],
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
