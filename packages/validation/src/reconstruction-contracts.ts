import type { Sha256HashV1 } from "@whitebox-world/protocol";
import {
  parseWorldReconstructionCaseArtifactRefV1,
  type WorldReconstructionCaseArtifactRefV1,
} from "@whitebox-world/world-identity";

export {
  parseWorldReconstructionCaseArtifactRefV1,
  type WorldReconstructionCaseArtifactRefV1,
} from "@whitebox-world/world-identity";

import {
  canonicalJsonBytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import {
  parseFixedInputV1,
  type FixedInputV1,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil, isPlainObject, sortBy, uniq } from "lodash-es";

export const WORLD_RECONSTRUCTION_DIMENSION_IDS_V1 = Object.freeze([
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const);

export type WorldReconstructionDimensionIdV1 =
  (typeof WORLD_RECONSTRUCTION_DIMENSION_IDS_V1)[number];
export type WorldReconstructionOutcomeV1 = "passed" | "failed" | "incomplete";

export type WorldReconstructionMetricV1 =
  | Readonly<{ kind: "ratio-basis-points"; valueBasisPoints: number }>
  | Readonly<{
      kind: "normalized-distance-basis-points";
      valueBasisPoints: number;
    }>
  | Readonly<{ kind: "distance-millimeters"; valueMillimeters: number }>
  | Readonly<{ kind: "boolean-presence"; isPresent: boolean }>
  | Readonly<{ kind: "identity-match"; isMatch: boolean }>
  | Readonly<{
      kind: "receipt-outcome";
      outcome: "completed" | "failed" | "incomplete";
    }>;

export interface WorldReconstructionNormalizedBoundsV1 {
  readonly minXBasisPoints: number;
  readonly minYBasisPoints: number;
  readonly maxXBasisPoints: number;
  readonly maxYBasisPoints: number;
}

export interface WorldReconstructionNormalizedCenterV1 {
  readonly xBasisPoints: number;
  readonly yBasisPoints: number;
}

export interface WorldReconstructionPositionXYZMetersV1 {
  readonly xMeters: number;
  readonly yMeters: number;
  readonly zMeters: number;
}

export interface WorldReconstructionTopologyRelationV1 {
  readonly fromNodeId: string;
  readonly relation: "connects-to" | "contains" | "above" | "blocks";
  readonly toNodeId: string;
}

export interface WorldReconstructionTraversalCheckV1 {
  readonly acceptanceTargetRef: string;
  readonly id: string;
  readonly evidenceKind: "scripted-fixed-input";
  readonly expectation: "pass" | "block";
  readonly checkpointIds: readonly string[];
  readonly fixedInputSequence: readonly FixedInputV1[];
}

export interface WorldReconstructionCaseV1 {
  readonly kind: "world-reconstruction-case";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly referenceInputs: readonly Readonly<{
    inputRef: string;
    contentHash: Sha256HashV1;
    mediaType: "image/png" | "image/jpeg" | "application/json";
  }>[];
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly formalCaptureIntentRef: "inputs/formal-world-capture-intent.json";
  readonly formalCaptureIntentHash: Sha256HashV1;
  readonly acceptanceTargetRefs: readonly string[];
  readonly requiredEvidenceProfileRefs: readonly string[];
  readonly expected: WorldReconstructionExpectedV1;
}

export interface WorldReconstructionExpectedV1 {
  readonly topology: Readonly<{
    readonly acceptanceTargetRef: string;
    readonly nodeIds: readonly string[];
    readonly relations: readonly WorldReconstructionTopologyRelationV1[];
    readonly layerIds: readonly string[];
  }>;
  readonly semanticSilhouetteTargets: readonly Readonly<{
    readonly acceptanceTargetRef: string;
    readonly visualGroupId: string;
    readonly normalizedBounds: WorldReconstructionNormalizedBoundsV1;
    readonly normalizedCenter: WorldReconstructionNormalizedCenterV1;
    readonly coverageBasisPoints: number;
  }>[];
  readonly openingComposition: Readonly<{
    readonly acceptanceTargetRef: string;
    readonly targetRefs: readonly string[];
    readonly regions: readonly Readonly<{
      readonly targetRef: string;
      readonly normalizedBounds: WorldReconstructionNormalizedBoundsV1;
    }>[];
    readonly anchors: readonly Readonly<{
      readonly targetRef: string;
      readonly normalizedCenter: WorldReconstructionNormalizedCenterV1;
    }>[];
    readonly orderedTargetRefs: readonly string[];
  }>;
  readonly spawnSupport: Readonly<{
    readonly acceptanceTargetRef: string;
    readonly spawnMarkerId: string;
    readonly supportColliderId: string;
    readonly expectedMedium: "ground" | "air";
    readonly expectedPositionXYZMeters: WorldReconstructionPositionXYZMetersV1;
  }>;
  readonly colliders: readonly Readonly<{
    readonly acceptanceTargetRef: string;
    readonly contributionId: string;
    readonly colliderId: string;
    readonly role: "ground" | "blocker" | "step";
    readonly requiresOverlay: boolean;
  }>[];
  readonly criticalTraversalChecks: readonly WorldReconstructionTraversalCheckV1[];
  readonly deterministicBuild: Readonly<{
    readonly acceptanceTargetRef: string;
    readonly requiresCandidateReplay: true;
    readonly requiresWorldPackageIdentityAgreement: true;
    readonly requiresBuildIdentityAgreement: true;
    readonly requiresCaptureIdentityAgreement: true;
  }>;
}

export interface WorldReconstructionEvaluationProfileV1 {
  readonly kind: "world-reconstruction-evaluation-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dimensionIds: readonly WorldReconstructionDimensionIdV1[];
  readonly maximumRepairAttemptCount: 1;
  readonly builderSelfRepairAttemptCount: 0;
  readonly thresholds: WorldReconstructionThresholdsV1;
  readonly requiredEvidenceByDimension: readonly Readonly<{
    dimensionId: WorldReconstructionDimensionIdV1;
    evidenceProfileRefs: readonly string[];
  }>[];
}

export interface WorldReconstructionThresholdsV1 {
  readonly semanticSilhouetteTargets: readonly Readonly<{
    readonly acceptanceTargetRef: string;
    readonly maximumBoundsDriftBasisPoints: number;
    readonly maximumCenterDriftBasisPoints: number;
    readonly maximumCoverageDriftBasisPoints: number;
  }>[];
  readonly openingComposition: Readonly<{
    readonly regions: readonly Readonly<{ readonly targetRef: string; readonly maximumDriftBasisPoints: number }>[];
    readonly anchors: readonly Readonly<{ readonly targetRef: string; readonly maximumDriftBasisPoints: number }>[];
    readonly maximumOrderDistanceBasisPoints: number;
  }>;
  readonly spawnSupport: Readonly<{
    readonly maximumPositionDriftMillimeters: number;
    readonly maximumSupportGapMillimeters: number;
  }>;
}

export interface WorldReconstructionEvidenceSetV1 {
  readonly kind: "world-reconstruction-evidence-set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: WorldReconstructionCaseArtifactRefV1;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly attemptRef: string;
  readonly attemptHash: Sha256HashV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly identityEvidence: readonly Readonly<{
    role:
      | "scene-authoring-attempt"
      | "scene-authoring-attempt-result"
      | "world-package"
      | "world-package-build-receipt"
      | "world-build-identity"
      | "capture";
    artifactRef: string;
    contentHash: Sha256HashV1;
  }>[];
  readonly observedDimensions: readonly WorldReconstructionObservedDimensionRowV1[];
  readonly advisoryPixelMetrics: readonly WorldReconstructionMetricV1[];
}

export type WorldReconstructionObservedDimensionV1 =
  | Readonly<{
      kind: "topology-observed";
      nodeIds: readonly string[];
      relations: readonly WorldReconstructionTopologyRelationV1[];
      layerIds: readonly string[];
    }>
  | Readonly<{
      kind: "semantic-silhouette-observed";
      targets: readonly Readonly<{
        acceptanceTargetRef: string;
        visualGroupId: string;
        isSemanticTargetPresent: boolean;
        normalizedBounds: WorldReconstructionNormalizedBoundsV1;
        normalizedCenter: WorldReconstructionNormalizedCenterV1;
        coverageBasisPoints: number;
      }>[];
    }>
  | Readonly<{
      kind: "opening-composition-observed";
      regions: readonly Readonly<{
        targetRef: string;
        normalizedBounds: WorldReconstructionNormalizedBoundsV1;
      }>[];
      anchors: readonly Readonly<{
        targetRef: string;
        normalizedCenter: WorldReconstructionNormalizedCenterV1;
      }>[];
      orderedTargetRefs: readonly string[];
      distances: readonly Readonly<{ fromTargetRef: string; toTargetRef: string; distanceBasisPoints: number }>[];
    }>
  | Readonly<{
      kind: "spawn-support-observed";
      spawnMarkerId: string;
      supportColliderId: string;
      medium: "ground" | "air";
      positionXYZMeters: WorldReconstructionPositionXYZMetersV1;
      supportGapMillimeters: number;
    }>
  | Readonly<{
      kind: "collider-observed";
      contributions: readonly Readonly<{
        contributionId: string;
        colliderId: string;
        role: "ground" | "blocker" | "step";
        hasOverlay: boolean;
      }>[];
    }>
  | Readonly<{
      kind: "critical-traversal-observed";
      checks: readonly Readonly<{
        id: string;
        outcome: "reached" | "blocked" | "incomplete";
        checkpointIds: readonly string[];
      }>[];
    }>
  | Readonly<{
      kind: "deterministic-build-observed";
      candidateReplayOutcome: "completed" | "failed" | "incomplete";
      worldPackageIdentityMatches: boolean;
      buildIdentityMatches: boolean;
      captureIdentityMatches: boolean;
    }>;

export type WorldReconstructionEvidenceMissingV1 = Readonly<{ kind: "evidence-missing" }>;
type ObservedRow<Id extends WorldReconstructionDimensionIdV1, Observation extends WorldReconstructionObservedDimensionV1> = Readonly<{ dimensionId: Id; evidenceRefs: readonly string[]; observed: Observation | WorldReconstructionEvidenceMissingV1 }>;
export type WorldReconstructionObservedDimensionRowV1 =
  | ObservedRow<"collider", Extract<WorldReconstructionObservedDimensionV1, { kind: "collider-observed" }>>
  | ObservedRow<"critical-traversal", Extract<WorldReconstructionObservedDimensionV1, { kind: "critical-traversal-observed" }>>
  | ObservedRow<"deterministic-build", Extract<WorldReconstructionObservedDimensionV1, { kind: "deterministic-build-observed" }>>
  | ObservedRow<"opening-composition", Extract<WorldReconstructionObservedDimensionV1, { kind: "opening-composition-observed" }>>
  | ObservedRow<"semantic-silhouette", Extract<WorldReconstructionObservedDimensionV1, { kind: "semantic-silhouette-observed" }>>
  | ObservedRow<"spawn-support", Extract<WorldReconstructionObservedDimensionV1, { kind: "spawn-support-observed" }>>
  | ObservedRow<"topology", Extract<WorldReconstructionObservedDimensionV1, { kind: "topology-observed" }>>;

export interface WorldReconstructionEvaluationResultV1 {
  readonly kind: "world-reconstruction-evaluation-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: WorldReconstructionCaseArtifactRefV1;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly evidenceSetRef: string;
  readonly evidenceSetHash: Sha256HashV1;
  readonly attemptRef: string;
  readonly attemptHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly diagnostics: readonly WorldReconstructionDiagnosticV1[];
  readonly dimensions: readonly WorldReconstructionDimensionResultV1[];
}

export interface WorldReconstructionDimensionResultV1 {
  readonly dimensionId: WorldReconstructionDimensionIdV1;
  readonly status: WorldReconstructionOutcomeV1;
  readonly metrics: readonly WorldReconstructionMetricV1[];
  readonly evidenceRefs: readonly string[];
  readonly diagnosticIds: readonly string[];
  readonly identity: Readonly<{
    attemptHash: Sha256HashV1;
    worldPackageRootHash: Sha256HashV1;
    worldBuildIdentityHash: Sha256HashV1;
    captureReceiptHash: Sha256HashV1;
  }>;
}

export const WORLD_RECONSTRUCTION_REPAIRABLE_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
  "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
  "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
  "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
  "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
  "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
  "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
  "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
  "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE",
] as const);

export const WORLD_RECONSTRUCTION_NON_REPAIRABLE_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
  "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
  "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
] as const);

export type WorldReconstructionRepairableDiagnosticCodeV1 =
  (typeof WORLD_RECONSTRUCTION_REPAIRABLE_DIAGNOSTIC_CODES_V1)[number];
export type WorldReconstructionNonRepairableDiagnosticCodeV1 =
  (typeof WORLD_RECONSTRUCTION_NON_REPAIRABLE_DIAGNOSTIC_CODES_V1)[number];
export type WorldReconstructionDiagnosticCodeV1 =
  | WorldReconstructionRepairableDiagnosticCodeV1
  | WorldReconstructionNonRepairableDiagnosticCodeV1;

export const WORLD_RECONSTRUCTION_DIAGNOSTIC_METRIC_IDS_V1 = Object.freeze([
  "topology-node-presence",
  "topology-layer-presence",
  "topology-relation-presence",
  "semantic-target-binding",
  "semantic-bounds-min-x-basis-points",
  "semantic-bounds-min-y-basis-points",
  "semantic-bounds-max-x-basis-points",
  "semantic-bounds-max-y-basis-points",
  "semantic-center-x-basis-points",
  "semantic-center-y-basis-points",
  "semantic-coverage-basis-points",
  "opening-region-presence",
  "opening-region-min-x-basis-points",
  "opening-region-min-y-basis-points",
  "opening-region-max-x-basis-points",
  "opening-region-max-y-basis-points",
  "opening-anchor-presence",
  "opening-anchor-x-basis-points",
  "opening-anchor-y-basis-points",
  "opening-target-order",
  "opening-framing-distance-basis-points",
  "spawn-marker-identity",
  "spawn-support-collider-identity",
  "spawn-medium",
  "spawn-position-drift-millimeters",
  "spawn-support-gap-millimeters",
  "collider-contribution-presence",
  "collider-overlay-presence",
  "collider-identity",
  "collider-role",
  "critical-traversal-evidence",
  "critical-traversal-outcome",
  "deterministic-candidate-replay",
  "deterministic-world-package-identity",
  "deterministic-build-identity",
  "deterministic-capture-identity",
  "required-evidence-presence",
  "evidence-identity",
] as const);

export type WorldReconstructionDiagnosticMetricIdV1 =
  (typeof WORLD_RECONSTRUCTION_DIAGNOSTIC_METRIC_IDS_V1)[number];

export type WorldReconstructionDiagnosticDetailsV1 =
  | Readonly<{
      kind: "basis-points-threshold";
      expectedBasisPoints: number;
      actualBasisPoints: number;
      maximumAllowedDriftBasisPoints: number;
      exceededByBasisPoints: number;
      correctionDirection: "increase" | "decrease";
    }>
  | Readonly<{
      kind: "millimeters-threshold";
      expectedMillimeters: number;
      actualMillimeters: number;
      maximumAllowedDriftMillimeters: number;
      exceededByMillimeters: number;
      correctionDirection: "increase" | "decrease";
    }>
  | Readonly<{
      kind: "state-mismatch";
      expectedValue: string;
      actualValue: string;
      correctionDirection: "replace";
    }>
  | Readonly<{
      kind: "presence-mismatch";
      expectedValue: "present";
      actualValue: "missing";
      correctionDirection: "add";
    }>
  | Readonly<{
      kind: "sequence-mismatch";
      expectedValues: readonly string[];
      actualValues: readonly string[];
      correctionDirection: "reorder";
    }>;

export interface WorldReconstructionRepairActionV1 {
  readonly kind: "revise-native-source";
  readonly targetKind:
    | "topology-node"
    | "topology-layer"
    | "topology-relation"
    | "visual-group"
    | "composition-target"
    | "spawn-marker"
    | "static-collider"
    | "traversal-check";
  readonly targetId: string;
  readonly operation:
    | "add"
    | "bind"
    | "move"
    | "resize"
    | "reorder"
    | "adjust-support"
    | "set-traversal-binding"
    | "adjust-traversal";
  readonly instruction: string;
}

const DIAGNOSTIC_DETAIL_KIND_BY_METRIC_ID: Readonly<
  Record<WorldReconstructionDiagnosticMetricIdV1, WorldReconstructionDiagnosticDetailsV1["kind"]>
> = Object.freeze({
  "topology-node-presence": "presence-mismatch",
  "topology-layer-presence": "presence-mismatch",
  "topology-relation-presence": "presence-mismatch",
  "semantic-target-binding": "state-mismatch",
  "semantic-bounds-min-x-basis-points": "basis-points-threshold",
  "semantic-bounds-min-y-basis-points": "basis-points-threshold",
  "semantic-bounds-max-x-basis-points": "basis-points-threshold",
  "semantic-bounds-max-y-basis-points": "basis-points-threshold",
  "semantic-center-x-basis-points": "basis-points-threshold",
  "semantic-center-y-basis-points": "basis-points-threshold",
  "semantic-coverage-basis-points": "basis-points-threshold",
  "opening-region-presence": "presence-mismatch",
  "opening-region-min-x-basis-points": "basis-points-threshold",
  "opening-region-min-y-basis-points": "basis-points-threshold",
  "opening-region-max-x-basis-points": "basis-points-threshold",
  "opening-region-max-y-basis-points": "basis-points-threshold",
  "opening-anchor-presence": "presence-mismatch",
  "opening-anchor-x-basis-points": "basis-points-threshold",
  "opening-anchor-y-basis-points": "basis-points-threshold",
  "opening-target-order": "sequence-mismatch",
  "opening-framing-distance-basis-points": "basis-points-threshold",
  "spawn-marker-identity": "state-mismatch",
  "spawn-support-collider-identity": "state-mismatch",
  "spawn-medium": "state-mismatch",
  "spawn-position-drift-millimeters": "millimeters-threshold",
  "spawn-support-gap-millimeters": "millimeters-threshold",
  "collider-contribution-presence": "presence-mismatch",
  "collider-overlay-presence": "presence-mismatch",
  "collider-identity": "state-mismatch",
  "collider-role": "state-mismatch",
  "critical-traversal-evidence": "presence-mismatch",
  "critical-traversal-outcome": "state-mismatch",
  "deterministic-candidate-replay": "state-mismatch",
  "deterministic-world-package-identity": "state-mismatch",
  "deterministic-build-identity": "state-mismatch",
  "deterministic-capture-identity": "state-mismatch",
  "required-evidence-presence": "presence-mismatch",
  "evidence-identity": "state-mismatch",
});

const DIAGNOSTIC_METRIC_IDS_BY_CODE: Readonly<
  Record<WorldReconstructionDiagnosticCodeV1, readonly WorldReconstructionDiagnosticMetricIdV1[]>
> = Object.freeze({
  WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING: [
    "topology-node-presence",
    "topology-layer-presence",
  ],
  WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING: ["topology-relation-presence"],
  WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT: [
    "semantic-target-binding",
    "semantic-bounds-min-x-basis-points",
    "semantic-bounds-min-y-basis-points",
    "semantic-bounds-max-x-basis-points",
    "semantic-bounds-max-y-basis-points",
    "semantic-center-x-basis-points",
    "semantic-center-y-basis-points",
    "semantic-coverage-basis-points",
  ],
  WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT: [
    "opening-region-presence",
    "opening-region-min-x-basis-points",
    "opening-region-min-y-basis-points",
    "opening-region-max-x-basis-points",
    "opening-region-max-y-basis-points",
    "opening-anchor-presence",
    "opening-anchor-x-basis-points",
    "opening-anchor-y-basis-points",
    "opening-target-order",
    "opening-framing-distance-basis-points",
  ],
  WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING: [
    "spawn-marker-identity",
    "spawn-support-collider-identity",
    "spawn-medium",
    "spawn-position-drift-millimeters",
    "spawn-support-gap-millimeters",
  ],
  WORLD_RECONSTRUCTION_COLLIDER_MISSING: [
    "collider-contribution-presence",
    "collider-overlay-presence",
  ],
  WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH: ["collider-identity", "collider-role"],
  WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED: ["critical-traversal-outcome"],
  WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE: ["critical-traversal-outcome"],
  WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC: [
    "deterministic-candidate-replay",
    "deterministic-world-package-identity",
    "deterministic-build-identity",
    "deterministic-capture-identity",
  ],
  WORLD_RECONSTRUCTION_EVIDENCE_STALE: ["evidence-identity"],
  WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING: [
    "required-evidence-presence",
    "critical-traversal-evidence",
  ],
});

const REPAIR_ACTION_SHAPE_BY_METRIC_ID: Readonly<Partial<Record<
  WorldReconstructionDiagnosticMetricIdV1,
  Readonly<{
    targetKind: WorldReconstructionRepairActionV1["targetKind"];
    operation: WorldReconstructionRepairActionV1["operation"];
  }>
>>> = Object.freeze({
  "topology-node-presence": { targetKind: "topology-node", operation: "add" },
  "topology-layer-presence": { targetKind: "topology-layer", operation: "add" },
  "topology-relation-presence": { targetKind: "topology-relation", operation: "add" },
  "semantic-target-binding": { targetKind: "visual-group", operation: "bind" },
  "semantic-bounds-min-x-basis-points": { targetKind: "visual-group", operation: "resize" },
  "semantic-bounds-min-y-basis-points": { targetKind: "visual-group", operation: "resize" },
  "semantic-bounds-max-x-basis-points": { targetKind: "visual-group", operation: "resize" },
  "semantic-bounds-max-y-basis-points": { targetKind: "visual-group", operation: "resize" },
  "semantic-center-x-basis-points": { targetKind: "visual-group", operation: "move" },
  "semantic-center-y-basis-points": { targetKind: "visual-group", operation: "move" },
  "semantic-coverage-basis-points": { targetKind: "visual-group", operation: "resize" },
  "opening-region-presence": { targetKind: "composition-target", operation: "add" },
  "opening-region-min-x-basis-points": { targetKind: "composition-target", operation: "resize" },
  "opening-region-min-y-basis-points": { targetKind: "composition-target", operation: "resize" },
  "opening-region-max-x-basis-points": { targetKind: "composition-target", operation: "resize" },
  "opening-region-max-y-basis-points": { targetKind: "composition-target", operation: "resize" },
  "opening-anchor-presence": { targetKind: "composition-target", operation: "add" },
  "opening-anchor-x-basis-points": { targetKind: "composition-target", operation: "move" },
  "opening-anchor-y-basis-points": { targetKind: "composition-target", operation: "move" },
  "opening-target-order": { targetKind: "composition-target", operation: "reorder" },
  "opening-framing-distance-basis-points": { targetKind: "composition-target", operation: "move" },
  "spawn-marker-identity": { targetKind: "spawn-marker", operation: "bind" },
  "spawn-support-collider-identity": { targetKind: "static-collider", operation: "bind" },
  "spawn-medium": { targetKind: "spawn-marker", operation: "adjust-support" },
  "spawn-position-drift-millimeters": { targetKind: "spawn-marker", operation: "move" },
  "spawn-support-gap-millimeters": { targetKind: "spawn-marker", operation: "adjust-support" },
  "collider-contribution-presence": { targetKind: "static-collider", operation: "add" },
  "collider-overlay-presence": { targetKind: "static-collider", operation: "bind" },
  "collider-identity": { targetKind: "static-collider", operation: "bind" },
  "collider-role": { targetKind: "static-collider", operation: "set-traversal-binding" },
  "critical-traversal-outcome": { targetKind: "traversal-check", operation: "adjust-traversal" },
});

interface WorldReconstructionDiagnosticBaseV1 {
  readonly kind: "world-reconstruction-diagnostic";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dimensionId: WorldReconstructionDimensionIdV1;
  readonly acceptanceTargetRef: string;
  readonly targetRef: string;
  readonly targetId: string;
  readonly metricId: WorldReconstructionDiagnosticMetricIdV1;
  readonly details: WorldReconstructionDiagnosticDetailsV1;
  readonly evidenceRefs: readonly string[];
  readonly message: string;
}

export type WorldReconstructionDiagnosticV1 =
  | Readonly<WorldReconstructionDiagnosticBaseV1 & {
      readonly code: WorldReconstructionRepairableDiagnosticCodeV1;
      readonly repairAction: Readonly<WorldReconstructionRepairActionV1>;
    }>
  | Readonly<WorldReconstructionDiagnosticBaseV1 & {
      readonly code: WorldReconstructionNonRepairableDiagnosticCodeV1;
    }>;

export function isWorldReconstructionRepairableDiagnosticCodeV1(
  code: WorldReconstructionDiagnosticCodeV1,
): code is WorldReconstructionRepairableDiagnosticCodeV1 {
  return WORLD_RECONSTRUCTION_REPAIRABLE_DIAGNOSTIC_CODES_V1.some(
    (candidate) => candidate === code,
  );
}

export interface WorldReconstructionRunReceiptV1 {
  readonly kind: "world-reconstruction-run-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: WorldReconstructionCaseArtifactRefV1;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly attempts: readonly Readonly<{
    attemptIndex: 0 | 1;
    generationRequestRef: string;
    generationRequestHash: Sha256HashV1;
    generationReceiptRef: string;
    generationReceiptHash: Sha256HashV1;
    sceneAuthoringAttemptRef: string;
    sceneAuthoringAttemptHash: Sha256HashV1;
    sceneAuthoringAttemptResultRef: string;
    sceneAuthoringAttemptResultHash: Sha256HashV1;
    worldPackageRef: string;
    worldPackageRootHash: Sha256HashV1;
    worldPackageBuildReceiptRef: string;
    worldPackageBuildReceiptHash: Sha256HashV1;
    worldBuildIdentityRef: string;
    worldBuildIdentityHash: Sha256HashV1;
    captureReceiptRef: string;
    captureReceiptHash: Sha256HashV1;
    evaluationResultRef: string;
    evaluationResultHash: Sha256HashV1;
    outcome: WorldReconstructionOutcomeV1;
  }>[];
  readonly finalAttemptIndex: 0 | 1;
  readonly finalEvaluationResultRef: string;
  readonly finalEvaluationResultHash: Sha256HashV1;
  readonly cleanupOutcome: "completed" | "failed";
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const WORLD_PACKAGE_REF_PATTERN = /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const WORLD_RECONSTRUCTION_CASE_ID_PATTERN =
  /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const CASE_FIELDS = [
  "kind", "schemaVersion", "id", "sceneBriefRef", "sceneBriefHash",
  "referenceInputs", "evaluationProfileRef", "evaluationProfileHash",
  "formalCaptureIntentRef", "formalCaptureIntentHash",
  "acceptanceTargetRefs", "requiredEvidenceProfileRefs", "expected",
] as const;
const PROFILE_FIELDS = [
  "kind", "schemaVersion", "id", "dimensionIds", "maximumRepairAttemptCount",
  "builderSelfRepairAttemptCount", "thresholds", "requiredEvidenceByDimension",
] as const;
const EVIDENCE_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "attemptRef", "attemptHash", "worldPackageRef",
  "sceneAuthoringAttemptResultRef", "sceneAuthoringAttemptResultHash",
  "worldPackageRootHash", "worldPackageBuildReceiptRef",
  "worldPackageBuildReceiptHash", "worldBuildIdentityRef", "worldBuildIdentityHash", "captureReceiptRef", "captureReceiptHash",
  "identityEvidence", "observedDimensions", "advisoryPixelMetrics",
] as const;
const RESULT_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "evidenceSetRef", "evidenceSetHash", "attemptRef",
  "attemptHash", "worldPackageRef", "worldPackageRootHash", "captureReceiptRef",
  "worldBuildIdentityRef", "worldBuildIdentityHash", "captureReceiptHash", "outcome", "diagnostics", "dimensions",
] as const;
const DIAGNOSTIC_FIELDS = [
  "kind", "schemaVersion", "id", "code", "dimensionId",
  "acceptanceTargetRef", "targetRef", "targetId", "metricId", "details",
  "evidenceRefs", "message", "repairAction",
] as const;
const NON_REPAIRABLE_DIAGNOSTIC_FIELDS = [
  "kind", "schemaVersion", "id", "code", "dimensionId",
  "acceptanceTargetRef", "targetRef", "targetId", "metricId", "details",
  "evidenceRefs", "message",
] as const;
const RUN_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "outcome", "attempts", "finalAttemptIndex",
  "finalEvaluationResultRef", "finalEvaluationResultHash", "cleanupOutcome",
] as const;
const RUN_ATTEMPT_FIELDS = [
  "attemptIndex", "generationRequestRef", "generationRequestHash",
  "generationReceiptRef", "generationReceiptHash", "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash", "sceneAuthoringAttemptResultRef",
  "sceneAuthoringAttemptResultHash", "worldPackageRef", "worldPackageRootHash",
  "worldPackageBuildReceiptRef", "worldPackageBuildReceiptHash", "worldBuildIdentityRef", "worldBuildIdentityHash",
  "captureReceiptRef", "captureReceiptHash", "evaluationResultRef",
  "evaluationResultHash", "outcome",
] as const;

function fail(contract: string, path: string, message: string): never {
  throw new Error(`${contract}:${path.length === 0 ? "" : ` ${path}:`} ${message}`);
}

function assertAccessorFree(value: unknown, contract: string, path = "", seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(contract, path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      fail(contract, `${path}/${key}`, "accessors are forbidden");
    }
    assertAccessorFree(descriptor?.value, contract, `${path}/${key}`, seen);
  }
}

function object(value: unknown, contract: string, path: string): Readonly<Record<string, unknown>> {
  if (
    !isPlainObject(value) ||
    Reflect.getPrototypeOf(value as object) !== Object.prototype
  ) {
    fail(contract, path, "expected an ordinary plain object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], contract: string, path: string): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) fail(contract, `${path}/${unknown}`, "unknown field");
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) fail(contract, `${path}/${missing}`, "required field is missing");
}

function text(value: unknown, contract: string, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.normalize("NFC") !== value) {
    fail(contract, path, "expected a non-empty trimmed NFC string");
  }
  return value;
}

function worldReconstructionCaseId(
  value: unknown,
  contract: string,
  path: string,
): string {
  const parsed = text(value, contract, path);
  if (!WORLD_RECONSTRUCTION_CASE_ID_PATTERN.test(parsed)) {
    fail(
      contract,
      path,
      "expected a lowercase ASCII Case id with dot or hyphen separators",
    );
  }
  return parsed;
}

function hash(value: unknown, contract: string, path: string): Sha256HashV1 {
  const parsed = text(value, contract, path);
  if (!HASH_PATTERN.test(parsed) || parsed === ZERO_HASH) fail(contract, path, "expected a non-zero SHA-256 hash");
  return parsed as Sha256HashV1;
}

function formalWorldPackageRef(value: unknown, worldPackageRootHash: Sha256HashV1, contract: string, path: string): string {
  const parsed = text(value, contract, path);
  const match = WORLD_PACKAGE_REF_PATTERN.exec(parsed);
  if (match === null || `sha256:${match[1]}` !== worldPackageRootHash) fail(contract, path, "must be the formal package ref for worldPackageRootHash");
  return parsed;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], contract: string, path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(contract, path, `expected one of ${allowed.join(", ")}`);
  return value as T;
}

function exactInteger(value: unknown, expected: number, contract: string, path: string): number {
  if (value !== expected) fail(contract, path, `expected ${expected}`);
  return expected;
}

function integer(value: unknown, minimum: number, maximum: number, contract: string, path: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(contract, path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function array(value: unknown, contract: string, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== value.length + 1) {
    fail(contract, path, "expected an ordinary array");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) fail(contract, path, "sparse, accessor, or non-enumerable array items are forbidden");
  }
  return value;
}

function sortedStrings(value: unknown, contract: string, path: string, allowEmpty = false): readonly string[] {
  const parsed = array(value, contract, path).map((entry, index) => text(entry, contract, `${path}/${index}`));
  if (!allowEmpty && parsed.length === 0) fail(contract, path, "must not be empty");
  if (parsed.some((entry, index) => index > 0 && parsed[index - 1]! >= entry)) {
    fail(contract, path, "must be unique and strictly sorted");
  }
  return Object.freeze(parsed);
}

function uniqueStrings(value: unknown, contract: string, path: string): readonly string[] {
  const parsed = array(value, contract, path).map((entry, index) =>
    text(entry, contract, `${path}/${index}`)
  );
  if (parsed.length === 0) fail(contract, path, "must not be empty");
  if (new Set(parsed).size !== parsed.length) fail(contract, path, "must be unique");
  return Object.freeze(parsed);
}

function exactDimensions(value: unknown, contract: string, path: string): readonly WorldReconstructionDimensionIdV1[] {
  const rows = array(value, contract, path);
  if (rows.length !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.length || rows.some((entry, index) => entry !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index])) {
    fail(contract, path, "must contain all seven dimension IDs in canonical order");
  }
  return WORLD_RECONSTRUCTION_DIMENSION_IDS_V1;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function begin(value: unknown, contract: string, fields: readonly string[]): Readonly<Record<string, unknown>> {
  assertAccessorFree(value, contract);
  const source = object(value, contract, "");
  exactFields(source, fields, contract, "");
  return source;
}

function parseMetric(value: unknown, contract: string, path: string): WorldReconstructionMetricV1 {
  const source = object(value, contract, path);
  const kind = enumValue(source.kind, [
    "ratio-basis-points", "normalized-distance-basis-points", "distance-millimeters",
    "boolean-presence", "identity-match", "receipt-outcome",
  ] as const, contract, `${path}/kind`);
  if (kind === "ratio-basis-points" || kind === "normalized-distance-basis-points") {
    exactFields(source, ["kind", "valueBasisPoints"], contract, path);
    return Object.freeze({ kind, valueBasisPoints: integer(source.valueBasisPoints, 0, 10_000, contract, `${path}/valueBasisPoints`) });
  }
  if (kind === "distance-millimeters") {
    exactFields(source, ["kind", "valueMillimeters"], contract, path);
    return Object.freeze({ kind, valueMillimeters: integer(source.valueMillimeters, 0, Number.MAX_SAFE_INTEGER, contract, `${path}/valueMillimeters`) });
  }
  if (kind === "boolean-presence") {
    exactFields(source, ["kind", "isPresent"], contract, path);
    if (typeof source.isPresent !== "boolean") fail(contract, `${path}/isPresent`, "expected a boolean");
    return Object.freeze({ kind, isPresent: source.isPresent });
  }
  if (kind === "identity-match") {
    exactFields(source, ["kind", "isMatch"], contract, path);
    if (typeof source.isMatch !== "boolean") fail(contract, `${path}/isMatch`, "expected a boolean");
    return Object.freeze({ kind, isMatch: source.isMatch });
  }
  exactFields(source, ["kind", "outcome"], contract, path);
  return Object.freeze({ kind, outcome: enumValue(source.outcome, ["completed", "failed", "incomplete"] as const, contract, `${path}/outcome`) });
}

function boolean(value: unknown, contract: string, path: string): boolean {
  if (typeof value !== "boolean") fail(contract, path, "expected a boolean");
  return value;
}

function basisPoints(value: unknown, contract: string, path: string): number {
  return integer(value, 0, 10_000, contract, path);
}

function meters(value: unknown, contract: string, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    fail(contract, path, "expected a finite number of meters");
  }
  return value;
}

function parseNormalizedBounds(value: unknown, contract: string, path: string): WorldReconstructionNormalizedBoundsV1 {
  const source = object(value, contract, path);
  exactFields(source, ["minXBasisPoints", "minYBasisPoints", "maxXBasisPoints", "maxYBasisPoints"], contract, path);
  const minXBasisPoints = basisPoints(source.minXBasisPoints, contract, `${path}/minXBasisPoints`);
  const minYBasisPoints = basisPoints(source.minYBasisPoints, contract, `${path}/minYBasisPoints`);
  const maxXBasisPoints = basisPoints(source.maxXBasisPoints, contract, `${path}/maxXBasisPoints`);
  const maxYBasisPoints = basisPoints(source.maxYBasisPoints, contract, `${path}/maxYBasisPoints`);
  if (minXBasisPoints >= maxXBasisPoints || minYBasisPoints >= maxYBasisPoints) {
    fail(contract, path, "normalized bounds must have positive width and height");
  }
  return Object.freeze({ minXBasisPoints, minYBasisPoints, maxXBasisPoints, maxYBasisPoints });
}

function parseNormalizedCenter(value: unknown, contract: string, path: string): WorldReconstructionNormalizedCenterV1 {
  const source = object(value, contract, path);
  exactFields(source, ["xBasisPoints", "yBasisPoints"], contract, path);
  return Object.freeze({
    xBasisPoints: basisPoints(source.xBasisPoints, contract, `${path}/xBasisPoints`),
    yBasisPoints: basisPoints(source.yBasisPoints, contract, `${path}/yBasisPoints`),
  });
}

function parsePositionXYZMeters(value: unknown, contract: string, path: string): WorldReconstructionPositionXYZMetersV1 {
  const source = object(value, contract, path);
  exactFields(source, ["xMeters", "yMeters", "zMeters"], contract, path);
  return Object.freeze({
    xMeters: meters(source.xMeters, contract, `${path}/xMeters`),
    yMeters: meters(source.yMeters, contract, `${path}/yMeters`),
    zMeters: meters(source.zMeters, contract, `${path}/zMeters`),
  });
}

function parseTopologyRelation(value: unknown, contract: string, path: string): WorldReconstructionTopologyRelationV1 {
  const source = object(value, contract, path);
  exactFields(source, ["fromNodeId", "relation", "toNodeId"], contract, path);
  return Object.freeze({
    fromNodeId: text(source.fromNodeId, contract, `${path}/fromNodeId`),
    relation: enumValue(source.relation, ["connects-to", "contains", "above", "blocks"] as const, contract, `${path}/relation`),
    toNodeId: text(source.toNodeId, contract, `${path}/toNodeId`),
  });
}

function parseTopology(value: unknown, contract: string, path: string, allowEmpty: boolean): Omit<WorldReconstructionExpectedV1["topology"], "acceptanceTargetRef"> {
  const source = object(value, contract, path);
  exactFields(source, ["nodeIds", "relations", "layerIds"], contract, path);
  const nodeIds = sortedStrings(source.nodeIds, contract, `${path}/nodeIds`, allowEmpty);
  const relations = array(source.relations, contract, `${path}/relations`).map((entry, index) =>
    parseTopologyRelation(entry, contract, `${path}/relations/${index}`)
  );
  const relationKeys = relations.map(({ fromNodeId, relation, toNodeId }) => `${fromNodeId}\0${relation}\0${toNodeId}`);
  if ((!allowEmpty && relations.length === 0) || relationKeys.some((key, index) => index > 0 && relationKeys[index - 1]! >= key)) {
    fail(contract, `${path}/relations`, "must be unique and strictly sorted");
  }
  if (relations.some(({ fromNodeId, toNodeId }) => !nodeIds.includes(fromNodeId) || !nodeIds.includes(toNodeId))) {
    fail(contract, `${path}/relations`, "relation endpoints must name declared nodes");
  }
  return Object.freeze({ nodeIds, relations: Object.freeze(relations), layerIds: sortedStrings(source.layerIds, contract, `${path}/layerIds`, allowEmpty) });
}

function parseTraversalChecks(value: unknown, contract: string, path: string, declaredAcceptanceTarget: (value: unknown, path: string) => string): readonly WorldReconstructionTraversalCheckV1[] {
  const checks = array(value, contract, path).map((entry, index) => {
    const itemPath = `${path}/${index}`;
    const source = object(entry, contract, itemPath);
    exactFields(source, ["acceptanceTargetRef", "id", "evidenceKind", "expectation", "checkpointIds", "fixedInputSequence"], contract, itemPath);
    if (source.evidenceKind !== "scripted-fixed-input") fail(contract, `${itemPath}/evidenceKind`, "Route/Nav claims are forbidden; expected scripted-fixed-input");
    let fixedInputSequence: readonly FixedInputV1[];
    try {
      fixedInputSequence = array(source.fixedInputSequence, contract, `${itemPath}/fixedInputSequence`).map((step) => parseFixedInputV1(step));
    } catch {
      fail(contract, `${itemPath}/fixedInputSequence`, "must be a non-empty sequence of valid FixedInputV1 steps");
    }
    if (fixedInputSequence.length === 0) fail(contract, `${itemPath}/fixedInputSequence`, "must be a non-empty sequence of valid FixedInputV1 steps");
    return Object.freeze({
      acceptanceTargetRef: declaredAcceptanceTarget(source.acceptanceTargetRef, `${itemPath}/acceptanceTargetRef`),
      id: text(source.id, contract, `${itemPath}/id`),
      evidenceKind: "scripted-fixed-input" as const,
      expectation: enumValue(source.expectation, ["pass", "block"] as const, contract, `${itemPath}/expectation`),
      checkpointIds: sortedStrings(source.checkpointIds, contract, `${itemPath}/checkpointIds`),
      fixedInputSequence: Object.freeze(fixedInputSequence),
    });
  });
  if (checks.length === 0 || checks.some((row, index) => index > 0 && checks[index - 1]!.id >= row.id)) {
    fail(contract, path, "must be non-empty, unique, and sorted by id");
  }
  return Object.freeze(checks);
}

function parseObservedDimension(value: unknown, dimensionId: WorldReconstructionDimensionIdV1, contract: string, path: string): WorldReconstructionObservedDimensionV1 {
  const source = object(value, contract, path);
  const expectedKind = `${dimensionId}-observed`;
  if (source.kind !== expectedKind) fail(contract, `${path}/kind`, `expected ${expectedKind}`);
  if (dimensionId === "topology") {
    exactFields(source, ["kind", "nodeIds", "relations", "layerIds"], contract, path);
    return Object.freeze({ kind: "topology-observed", ...parseTopology({ nodeIds: source.nodeIds, relations: source.relations, layerIds: source.layerIds }, contract, path, true) });
  }
  if (dimensionId === "semantic-silhouette") {
    exactFields(source, ["kind", "targets"], contract, path);
    const targets = array(source.targets, contract, `${path}/targets`).map((entry, index) => {
      const itemPath = `${path}/targets/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["acceptanceTargetRef", "visualGroupId", "isSemanticTargetPresent", "normalizedBounds", "normalizedCenter", "coverageBasisPoints"], contract, itemPath);
      return Object.freeze({ acceptanceTargetRef: text(row.acceptanceTargetRef, contract, `${itemPath}/acceptanceTargetRef`), visualGroupId: text(row.visualGroupId, contract, `${itemPath}/visualGroupId`), isSemanticTargetPresent: boolean(row.isSemanticTargetPresent, contract, `${itemPath}/isSemanticTargetPresent`), normalizedBounds: parseNormalizedBounds(row.normalizedBounds, contract, `${itemPath}/normalizedBounds`), normalizedCenter: parseNormalizedCenter(row.normalizedCenter, contract, `${itemPath}/normalizedCenter`), coverageBasisPoints: basisPoints(row.coverageBasisPoints, contract, `${itemPath}/coverageBasisPoints`) });
    });
    if (targets.some((row, index) => index > 0 && targets[index - 1]!.acceptanceTargetRef >= row.acceptanceTargetRef)) fail(contract, `${path}/targets`, "must be unique and strictly sorted by acceptanceTargetRef");
    return Object.freeze({ kind: "semantic-silhouette-observed", targets: Object.freeze(targets) });
  }
  if (dimensionId === "opening-composition") {
    exactFields(source, ["kind", "regions", "anchors", "orderedTargetRefs", "distances"], contract, path);
    const regions = array(source.regions, contract, `${path}/regions`).map((entry, index) => {
      const itemPath = `${path}/regions/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["targetRef", "normalizedBounds"], contract, itemPath);
      return Object.freeze({ targetRef: text(row.targetRef, contract, `${itemPath}/targetRef`), normalizedBounds: parseNormalizedBounds(row.normalizedBounds, contract, `${itemPath}/normalizedBounds`) });
    });
    const anchors = array(source.anchors, contract, `${path}/anchors`).map((entry, index) => {
      const itemPath = `${path}/anchors/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["targetRef", "normalizedCenter"], contract, itemPath);
      return Object.freeze({ targetRef: text(row.targetRef, contract, `${itemPath}/targetRef`), normalizedCenter: parseNormalizedCenter(row.normalizedCenter, contract, `${itemPath}/normalizedCenter`) });
    });
    if (regions.some((row, index) => index > 0 && regions[index - 1]!.targetRef >= row.targetRef) || anchors.some((row, index) => index > 0 && anchors[index - 1]!.targetRef >= row.targetRef)) fail(contract, path, "regions and anchors must be unique and strictly sorted by targetRef");
    const distances = array(source.distances, contract, `${path}/distances`).map((entry, index) => { const itemPath = `${path}/distances/${index}`; const row = object(entry, contract, itemPath); exactFields(row, ["fromTargetRef", "toTargetRef", "distanceBasisPoints"], contract, itemPath); const fromTargetRef = text(row.fromTargetRef, contract, `${itemPath}/fromTargetRef`); const toTargetRef = text(row.toTargetRef, contract, `${itemPath}/toTargetRef`); if (fromTargetRef >= toTargetRef) fail(contract, itemPath, "distance pair must be canonical"); return Object.freeze({ fromTargetRef, toTargetRef, distanceBasisPoints: basisPoints(row.distanceBasisPoints, contract, `${itemPath}/distanceBasisPoints`) }); });
    if (distances.some((row, index) => index > 0 && `${distances[index - 1]!.fromTargetRef}\0${distances[index - 1]!.toTargetRef}` >= `${row.fromTargetRef}\0${row.toTargetRef}`)) fail(contract, `${path}/distances`, "must be unique and sorted target pairs");
    return Object.freeze({ kind: "opening-composition-observed", regions: Object.freeze(regions), anchors: Object.freeze(anchors), orderedTargetRefs: uniqueStrings(source.orderedTargetRefs, contract, `${path}/orderedTargetRefs`), distances: Object.freeze(distances) });
  }
  if (dimensionId === "spawn-support") {
    exactFields(source, ["kind", "spawnMarkerId", "supportColliderId", "medium", "positionXYZMeters", "supportGapMillimeters"], contract, path);
    return Object.freeze({ kind: "spawn-support-observed", spawnMarkerId: text(source.spawnMarkerId, contract, `${path}/spawnMarkerId`), supportColliderId: text(source.supportColliderId, contract, `${path}/supportColliderId`), medium: enumValue(source.medium, ["ground", "air"] as const, contract, `${path}/medium`), positionXYZMeters: parsePositionXYZMeters(source.positionXYZMeters, contract, `${path}/positionXYZMeters`), supportGapMillimeters: integer(source.supportGapMillimeters, 0, Number.MAX_SAFE_INTEGER, contract, `${path}/supportGapMillimeters`) });
  }
  if (dimensionId === "collider") {
    exactFields(source, ["kind", "contributions"], contract, path);
    const contributions = array(source.contributions, contract, `${path}/contributions`).map((entry, index) => {
      const itemPath = `${path}/contributions/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["contributionId", "colliderId", "role", "hasOverlay"], contract, itemPath);
      return Object.freeze({ contributionId: text(row.contributionId, contract, `${itemPath}/contributionId`), colliderId: text(row.colliderId, contract, `${itemPath}/colliderId`), role: enumValue(row.role, ["ground", "blocker", "step"] as const, contract, `${itemPath}/role`), hasOverlay: boolean(row.hasOverlay, contract, `${itemPath}/hasOverlay`) });
    });
    if (contributions.some((row, index) => index > 0 && contributions[index - 1]!.contributionId >= row.contributionId)) fail(contract, `${path}/contributions`, "must be unique and strictly sorted by contributionId");
    return Object.freeze({ kind: "collider-observed", contributions: Object.freeze(contributions) });
  }
  if (dimensionId === "critical-traversal") {
    exactFields(source, ["kind", "checks"], contract, path);
    const checks = array(source.checks, contract, `${path}/checks`).map((entry, index) => {
      const itemPath = `${path}/checks/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["id", "outcome", "checkpointIds"], contract, itemPath);
      return Object.freeze({ id: text(row.id, contract, `${itemPath}/id`), outcome: enumValue(row.outcome, ["reached", "blocked", "incomplete"] as const, contract, `${itemPath}/outcome`), checkpointIds: sortedStrings(row.checkpointIds, contract, `${itemPath}/checkpointIds`, true) });
    });
    if (checks.some((row, index) => index > 0 && checks[index - 1]!.id >= row.id)) fail(contract, `${path}/checks`, "must be unique and strictly sorted by id");
    return Object.freeze({ kind: "critical-traversal-observed", checks: Object.freeze(checks) });
  }
  exactFields(source, ["kind", "candidateReplayOutcome", "worldPackageIdentityMatches", "buildIdentityMatches", "captureIdentityMatches"], contract, path);
  return Object.freeze({ kind: "deterministic-build-observed", candidateReplayOutcome: enumValue(source.candidateReplayOutcome, ["completed", "failed", "incomplete"] as const, contract, `${path}/candidateReplayOutcome`), worldPackageIdentityMatches: boolean(source.worldPackageIdentityMatches, contract, `${path}/worldPackageIdentityMatches`), buildIdentityMatches: boolean(source.buildIdentityMatches, contract, `${path}/buildIdentityMatches`), captureIdentityMatches: boolean(source.captureIdentityMatches, contract, `${path}/captureIdentityMatches`) });
}

export function parseWorldReconstructionCaseV1(value: unknown): WorldReconstructionCaseV1 {
  const contract = "WORLD_RECONSTRUCTION_CASE_INVALID";
  const source = begin(value, contract, CASE_FIELDS);
  if (source.kind !== "world-reconstruction-case") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");

  const referenceInputs = array(source.referenceInputs, contract, "referenceInputs").map((entry, index) => {
    const path = `referenceInputs/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["inputRef", "contentHash", "mediaType"], contract, path);
    return Object.freeze({
      inputRef: text(row.inputRef, contract, `${path}/inputRef`),
      contentHash: hash(row.contentHash, contract, `${path}/contentHash`),
      mediaType: enumValue(row.mediaType, ["image/png", "image/jpeg", "application/json"] as const, contract, `${path}/mediaType`),
    });
  });
  if (referenceInputs.length === 0 || referenceInputs.some((row, index) => index > 0 && referenceInputs[index - 1]!.inputRef >= row.inputRef)) {
    fail(contract, "referenceInputs", "must be non-empty, unique, and sorted by inputRef");
  }

  const expectedSource = object(source.expected, contract, "expected");
  exactFields(expectedSource, ["topology", "semanticSilhouetteTargets", "openingComposition", "spawnSupport", "colliders", "criticalTraversalChecks", "deterministicBuild"], contract, "expected");
  const acceptanceTargetRefs = sortedStrings(source.acceptanceTargetRefs, contract, "acceptanceTargetRefs");
  const declaredAcceptanceTarget = (value: unknown, path: string) => {
    const parsed = text(value, contract, path);
    if (!acceptanceTargetRefs.includes(parsed)) fail(contract, path, "must be declared by acceptanceTargetRefs");
    return parsed;
  };
  const topologySource = object(expectedSource.topology, contract, "expected/topology");
  exactFields(topologySource, ["acceptanceTargetRef", "nodeIds", "relations", "layerIds"], contract, "expected/topology");
  const topology = Object.freeze({ acceptanceTargetRef: declaredAcceptanceTarget(topologySource.acceptanceTargetRef, "expected/topology/acceptanceTargetRef"), ...parseTopology({ nodeIds: topologySource.nodeIds, relations: topologySource.relations, layerIds: topologySource.layerIds }, contract, "expected/topology", false) });
  const semanticSilhouetteTargets = array(expectedSource.semanticSilhouetteTargets, contract, "expected/semanticSilhouetteTargets").map((entry, index) => {
    const path = `expected/semanticSilhouetteTargets/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["acceptanceTargetRef", "visualGroupId", "normalizedBounds", "normalizedCenter", "coverageBasisPoints"], contract, path);
    const acceptanceTargetRef = declaredAcceptanceTarget(row.acceptanceTargetRef, `${path}/acceptanceTargetRef`);
    return Object.freeze({
      acceptanceTargetRef,
      visualGroupId: text(row.visualGroupId, contract, `${path}/visualGroupId`),
      normalizedBounds: parseNormalizedBounds(row.normalizedBounds, contract, `${path}/normalizedBounds`),
      normalizedCenter: parseNormalizedCenter(row.normalizedCenter, contract, `${path}/normalizedCenter`),
      coverageBasisPoints: basisPoints(row.coverageBasisPoints, contract, `${path}/coverageBasisPoints`),
    });
  });
  if (semanticSilhouetteTargets.length === 0 || semanticSilhouetteTargets.some((row, index) => index > 0 && semanticSilhouetteTargets[index - 1]!.acceptanceTargetRef >= row.acceptanceTargetRef)) fail(contract, "expected/semanticSilhouetteTargets", "must be non-empty, unique, and sorted by acceptanceTargetRef");
  const openingSource = object(expectedSource.openingComposition, contract, "expected/openingComposition");
  exactFields(openingSource, ["acceptanceTargetRef", "targetRefs", "regions", "anchors", "orderedTargetRefs"], contract, "expected/openingComposition");
  const openingAcceptanceTargetRef = declaredAcceptanceTarget(openingSource.acceptanceTargetRef, "expected/openingComposition/acceptanceTargetRef");
  const targetRefs = sortedStrings(openingSource.targetRefs, contract, "expected/openingComposition/targetRefs");
  const regions = array(openingSource.regions, contract, "expected/openingComposition/regions").map((entry, index) => {
    const path = `expected/openingComposition/regions/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["targetRef", "normalizedBounds"], contract, path);
    const targetRef = text(row.targetRef, contract, `${path}/targetRef`);
    if (!targetRefs.includes(targetRef)) fail(contract, `${path}/targetRef`, "must be declared by targetRefs");
    return Object.freeze({ targetRef, normalizedBounds: parseNormalizedBounds(row.normalizedBounds, contract, `${path}/normalizedBounds`) });
  });
  const anchors = array(openingSource.anchors, contract, "expected/openingComposition/anchors").map((entry, index) => {
    const path = `expected/openingComposition/anchors/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["targetRef", "normalizedCenter"], contract, path);
    const targetRef = text(row.targetRef, contract, `${path}/targetRef`);
    if (!targetRefs.includes(targetRef)) fail(contract, `${path}/targetRef`, "must be declared by targetRefs");
    return Object.freeze({ targetRef, normalizedCenter: parseNormalizedCenter(row.normalizedCenter, contract, `${path}/normalizedCenter`) });
  });
  if (regions.length === 0 || anchors.length === 0 || regions.some((row, index) => index > 0 && regions[index - 1]!.targetRef >= row.targetRef) || anchors.some((row, index) => index > 0 && anchors[index - 1]!.targetRef >= row.targetRef)) fail(contract, "expected/openingComposition", "regions and anchors must be non-empty, unique, and sorted by targetRef");
  const orderedTargetRefs = uniqueStrings(openingSource.orderedTargetRefs, contract, "expected/openingComposition/orderedTargetRefs");
  if (orderedTargetRefs.length !== targetRefs.length || orderedTargetRefs.some((targetRef) => !targetRefs.includes(targetRef))) fail(contract, "expected/openingComposition/orderedTargetRefs", "must contain every declared targetRef exactly once");
  const spawnSource = object(expectedSource.spawnSupport, contract, "expected/spawnSupport");
  exactFields(spawnSource, ["acceptanceTargetRef", "spawnMarkerId", "supportColliderId", "expectedMedium", "expectedPositionXYZMeters"], contract, "expected/spawnSupport");
  const spawnAcceptanceTargetRef = declaredAcceptanceTarget(spawnSource.acceptanceTargetRef, "expected/spawnSupport/acceptanceTargetRef");
  const colliders = array(expectedSource.colliders, contract, "expected/colliders").map((entry, index) => {
    const path = `expected/colliders/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["acceptanceTargetRef", "contributionId", "colliderId", "role", "requiresOverlay"], contract, path);
    return Object.freeze({ acceptanceTargetRef: declaredAcceptanceTarget(row.acceptanceTargetRef, `${path}/acceptanceTargetRef`), contributionId: text(row.contributionId, contract, `${path}/contributionId`), colliderId: text(row.colliderId, contract, `${path}/colliderId`), role: enumValue(row.role, ["ground", "blocker", "step"] as const, contract, `${path}/role`), requiresOverlay: boolean(row.requiresOverlay, contract, `${path}/requiresOverlay`) });
  });
  if (colliders.length === 0 || colliders.some((row, index) => index > 0 && colliders[index - 1]!.contributionId >= row.contributionId)) fail(contract, "expected/colliders", "must be non-empty, unique, and sorted by contributionId");
  const supportColliderId = text(spawnSource.supportColliderId, contract, "expected/spawnSupport/supportColliderId");
  if (!colliders.some(({ colliderId, role }) => colliderId === supportColliderId && (role === "ground" || role === "step"))) fail(contract, "expected/spawnSupport/supportColliderId", "must name a ground or step collider");
  const deterministicSource = object(expectedSource.deterministicBuild, contract, "expected/deterministicBuild");
  exactFields(deterministicSource, ["acceptanceTargetRef", "requiresCandidateReplay", "requiresWorldPackageIdentityAgreement", "requiresBuildIdentityAgreement", "requiresCaptureIdentityAgreement"], contract, "expected/deterministicBuild");
  const deterministicAcceptanceTargetRef = declaredAcceptanceTarget(deterministicSource.acceptanceTargetRef, "expected/deterministicBuild/acceptanceTargetRef");
  for (const key of ["requiresCandidateReplay", "requiresWorldPackageIdentityAgreement", "requiresBuildIdentityAgreement", "requiresCaptureIdentityAgreement"] as const) if (deterministicSource[key] !== true) fail(contract, `expected/deterministicBuild/${key}`, "must require identity agreement");

  return freeze({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: worldReconstructionCaseId(source.id, contract, "id"),
    sceneBriefRef: text(source.sceneBriefRef, contract, "sceneBriefRef"),
    sceneBriefHash: hash(source.sceneBriefHash, contract, "sceneBriefHash"),
    referenceInputs: Object.freeze(referenceInputs),
    evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"),
    evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    formalCaptureIntentRef: enumValue(
      source.formalCaptureIntentRef,
      ["inputs/formal-world-capture-intent.json"] as const,
      contract,
      "formalCaptureIntentRef",
    ),
    formalCaptureIntentHash: hash(
      source.formalCaptureIntentHash,
      contract,
      "formalCaptureIntentHash",
    ),
    acceptanceTargetRefs,
    requiredEvidenceProfileRefs: sortedStrings(source.requiredEvidenceProfileRefs, contract, "requiredEvidenceProfileRefs"),
    expected: Object.freeze({
      topology,
      semanticSilhouetteTargets: Object.freeze(semanticSilhouetteTargets),
      openingComposition: Object.freeze({ acceptanceTargetRef: openingAcceptanceTargetRef, targetRefs, regions: Object.freeze(regions), anchors: Object.freeze(anchors), orderedTargetRefs }),
      spawnSupport: Object.freeze({ acceptanceTargetRef: spawnAcceptanceTargetRef, spawnMarkerId: text(spawnSource.spawnMarkerId, contract, "expected/spawnSupport/spawnMarkerId"), supportColliderId, expectedMedium: enumValue(spawnSource.expectedMedium, ["ground", "air"] as const, contract, "expected/spawnSupport/expectedMedium"), expectedPositionXYZMeters: parsePositionXYZMeters(spawnSource.expectedPositionXYZMeters, contract, "expected/spawnSupport/expectedPositionXYZMeters") }),
      colliders: Object.freeze(colliders),
      criticalTraversalChecks: parseTraversalChecks(expectedSource.criticalTraversalChecks, contract, "expected/criticalTraversalChecks", declaredAcceptanceTarget),
      deterministicBuild: Object.freeze({ acceptanceTargetRef: deterministicAcceptanceTargetRef, requiresCandidateReplay: true, requiresWorldPackageIdentityAgreement: true, requiresBuildIdentityAgreement: true, requiresCaptureIdentityAgreement: true }),
    }),
  });
}

export function parseWorldReconstructionEvaluationProfileV1(value: unknown): WorldReconstructionEvaluationProfileV1 {
  const contract = "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID";
  const source = begin(value, contract, PROFILE_FIELDS);
  if (source.kind !== "world-reconstruction-evaluation-profile") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const dimensionIds = exactDimensions(source.dimensionIds, contract, "dimensionIds");
  exactInteger(source.maximumRepairAttemptCount, 1, contract, "maximumRepairAttemptCount");
  exactInteger(source.builderSelfRepairAttemptCount, 0, contract, "builderSelfRepairAttemptCount");
  const thresholdsSource = object(source.thresholds, contract, "thresholds");
  exactFields(thresholdsSource, ["semanticSilhouetteTargets", "openingComposition", "spawnSupport"], contract, "thresholds");
  const semanticSilhouetteTargets = array(thresholdsSource.semanticSilhouetteTargets, contract, "thresholds/semanticSilhouetteTargets").map((entry, index) => {
    const path = `thresholds/semanticSilhouetteTargets/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["acceptanceTargetRef", "maximumBoundsDriftBasisPoints", "maximumCenterDriftBasisPoints", "maximumCoverageDriftBasisPoints"], contract, path);
    return Object.freeze({ acceptanceTargetRef: text(row.acceptanceTargetRef, contract, `${path}/acceptanceTargetRef`), maximumBoundsDriftBasisPoints: basisPoints(row.maximumBoundsDriftBasisPoints, contract, `${path}/maximumBoundsDriftBasisPoints`), maximumCenterDriftBasisPoints: basisPoints(row.maximumCenterDriftBasisPoints, contract, `${path}/maximumCenterDriftBasisPoints`), maximumCoverageDriftBasisPoints: basisPoints(row.maximumCoverageDriftBasisPoints, contract, `${path}/maximumCoverageDriftBasisPoints`) });
  });
  if (semanticSilhouetteTargets.length === 0 || semanticSilhouetteTargets.some((row, index) => index > 0 && semanticSilhouetteTargets[index - 1]!.acceptanceTargetRef >= row.acceptanceTargetRef)) fail(contract, "thresholds/semanticSilhouetteTargets", "must be non-empty, unique, and sorted by acceptanceTargetRef");
  const openingThresholds = object(thresholdsSource.openingComposition, contract, "thresholds/openingComposition");
  exactFields(openingThresholds, ["regions", "anchors", "maximumOrderDistanceBasisPoints"], contract, "thresholds/openingComposition");
  const parseOpeningThresholds = (value: unknown, path: string) => {
    const rows = array(value, contract, path).map((entry, index) => {
      const itemPath = `${path}/${index}`;
      const row = object(entry, contract, itemPath);
      exactFields(row, ["targetRef", "maximumDriftBasisPoints"], contract, itemPath);
      return Object.freeze({ targetRef: text(row.targetRef, contract, `${itemPath}/targetRef`), maximumDriftBasisPoints: basisPoints(row.maximumDriftBasisPoints, contract, `${itemPath}/maximumDriftBasisPoints`) });
    });
    if (rows.length === 0 || rows.some((row, index) => index > 0 && rows[index - 1]!.targetRef >= row.targetRef)) fail(contract, path, "must be non-empty, unique, and sorted by targetRef");
    return Object.freeze(rows);
  };
  const spawnThresholds = object(thresholdsSource.spawnSupport, contract, "thresholds/spawnSupport");
  exactFields(spawnThresholds, ["maximumPositionDriftMillimeters", "maximumSupportGapMillimeters"], contract, "thresholds/spawnSupport");
  const thresholds = Object.freeze({ semanticSilhouetteTargets: Object.freeze(semanticSilhouetteTargets), openingComposition: Object.freeze({ regions: parseOpeningThresholds(openingThresholds.regions, "thresholds/openingComposition/regions"), anchors: parseOpeningThresholds(openingThresholds.anchors, "thresholds/openingComposition/anchors"), maximumOrderDistanceBasisPoints: basisPoints(openingThresholds.maximumOrderDistanceBasisPoints, contract, "thresholds/openingComposition/maximumOrderDistanceBasisPoints") }), spawnSupport: Object.freeze({ maximumPositionDriftMillimeters: integer(spawnThresholds.maximumPositionDriftMillimeters, 0, Number.MAX_SAFE_INTEGER, contract, "thresholds/spawnSupport/maximumPositionDriftMillimeters"), maximumSupportGapMillimeters: integer(spawnThresholds.maximumSupportGapMillimeters, 0, Number.MAX_SAFE_INTEGER, contract, "thresholds/spawnSupport/maximumSupportGapMillimeters") }) });
  const requiredEvidenceByDimension = array(source.requiredEvidenceByDimension, contract, "requiredEvidenceByDimension").map((entry, index) => {
    const path = `requiredEvidenceByDimension/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "evidenceProfileRefs"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    return Object.freeze({ dimensionId, evidenceProfileRefs: sortedStrings(row.evidenceProfileRefs, contract, `${path}/evidenceProfileRefs`) });
  });
  if (requiredEvidenceByDimension.length !== 7) fail(contract, "requiredEvidenceByDimension", "must cover all seven dimensions");
  return freeze({ kind: "world-reconstruction-evaluation-profile", schemaVersion: 1, id: text(source.id, contract, "id"), dimensionIds, maximumRepairAttemptCount: 1, builderSelfRepairAttemptCount: 0, thresholds, requiredEvidenceByDimension: Object.freeze(requiredEvidenceByDimension) });
}

export function worldReconstructionEvidenceProfileClosureMatchesV1(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
): boolean {
  const requiredProfileRefs = sortBy(uniq(
    profile.requiredEvidenceByDimension.flatMap((entry) => entry.evidenceProfileRefs),
  ));
  const exactUniqueRefClosureMatches = (
    caseRefs: readonly string[],
    profileRefs: readonly string[],
  ): boolean => {
    const uniqueCaseRefs = uniq(caseRefs);
    const uniqueProfileRefs = uniq(profileRefs);
    return caseRefs.length === uniqueCaseRefs.length
      && profileRefs.length === uniqueProfileRefs.length
      && isEqual(sortBy(uniqueCaseRefs), sortBy(uniqueProfileRefs));
  };
  return isEqual(reconstructionCase.requiredEvidenceProfileRefs, requiredProfileRefs)
    && exactUniqueRefClosureMatches(
      reconstructionCase.expected.semanticSilhouetteTargets.map(
        (entry) => entry.acceptanceTargetRef,
      ),
      profile.thresholds.semanticSilhouetteTargets.map(
        (entry) => entry.acceptanceTargetRef,
      ),
    )
    && exactUniqueRefClosureMatches(
      reconstructionCase.expected.openingComposition.regions.map(
        (entry) => entry.targetRef,
      ),
      profile.thresholds.openingComposition.regions.map(
        (entry) => entry.targetRef,
      ),
    )
    && exactUniqueRefClosureMatches(
      reconstructionCase.expected.openingComposition.anchors.map(
        (entry) => entry.targetRef,
      ),
      profile.thresholds.openingComposition.anchors.map(
        (entry) => entry.targetRef,
      ),
    );
}

export function parseWorldReconstructionEvidenceSetV1(value: unknown): WorldReconstructionEvidenceSetV1 {
  const contract = "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID";
  const source = begin(value, contract, EVIDENCE_FIELDS);
  if (source.kind !== "world-reconstruction-evidence-set") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attemptRef = text(source.attemptRef, contract, "attemptRef");
  const attemptHash = hash(source.attemptHash, contract, "attemptHash");
  const sceneAuthoringAttemptResultRef = text(source.sceneAuthoringAttemptResultRef, contract, "sceneAuthoringAttemptResultRef");
  const sceneAuthoringAttemptResultHash = hash(source.sceneAuthoringAttemptResultHash, contract, "sceneAuthoringAttemptResultHash");
  const worldPackageRootHash = hash(source.worldPackageRootHash, contract, "worldPackageRootHash");
  const worldPackageRef = formalWorldPackageRef(source.worldPackageRef, worldPackageRootHash, contract, "worldPackageRef");
  const worldPackageBuildReceiptRef = text(source.worldPackageBuildReceiptRef, contract, "worldPackageBuildReceiptRef");
  const worldPackageBuildReceiptHash = hash(source.worldPackageBuildReceiptHash, contract, "worldPackageBuildReceiptHash");
  const worldBuildIdentityRef = text(source.worldBuildIdentityRef, contract, "worldBuildIdentityRef");
  const worldBuildIdentityHash = hash(source.worldBuildIdentityHash, contract, "worldBuildIdentityHash");
  const captureReceiptRef = text(source.captureReceiptRef, contract, "captureReceiptRef");
  const captureReceiptHash = hash(source.captureReceiptHash, contract, "captureReceiptHash");
  const expectedIdentities = [
    { role: "scene-authoring-attempt" as const, artifactRef: attemptRef, contentHash: attemptHash },
    { role: "scene-authoring-attempt-result" as const, artifactRef: sceneAuthoringAttemptResultRef, contentHash: sceneAuthoringAttemptResultHash },
    { role: "world-package" as const, artifactRef: worldPackageRef, contentHash: worldPackageRootHash },
    { role: "world-package-build-receipt" as const, artifactRef: worldPackageBuildReceiptRef, contentHash: worldPackageBuildReceiptHash },
    { role: "world-build-identity" as const, artifactRef: worldBuildIdentityRef, contentHash: worldBuildIdentityHash },
    { role: "capture" as const, artifactRef: captureReceiptRef, contentHash: captureReceiptHash },
  ];
  const identityEvidence = array(source.identityEvidence, contract, "identityEvidence").map((entry, index) => {
    const path = `identityEvidence/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["role", "artifactRef", "contentHash"], contract, path);
    return Object.freeze({
      role: enumValue(row.role, ["scene-authoring-attempt", "scene-authoring-attempt-result", "world-package", "world-package-build-receipt", "world-build-identity", "capture"] as const, contract, `${path}/role`),
      artifactRef: text(row.artifactRef, contract, `${path}/artifactRef`),
      contentHash: hash(row.contentHash, contract, `${path}/contentHash`),
    });
  });
  if (identityEvidence.length !== expectedIdentities.length || identityEvidence.some((row, index) => row.role !== expectedIdentities[index]!.role || row.artifactRef !== expectedIdentities[index]!.artifactRef || row.contentHash !== expectedIdentities[index]!.contentHash)) {
    fail(contract, "identityEvidence", "must exactly repeat Attempt, Attempt Result, WorldPackage, Build Receipt, Build Identity, and Capture identities");
  }
  const observedDimensions = array(source.observedDimensions, contract, "observedDimensions").map((entry, index) => {
    const path = `observedDimensions/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "evidenceRefs", "observed"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    const evidenceRefs = sortedStrings(row.evidenceRefs, contract, `${path}/evidenceRefs`, true);
    const observedSource = object(row.observed, contract, `${path}/observed`);
    const observed = observedSource.kind === "evidence-missing"
      ? (() => { exactFields(observedSource, ["kind"], contract, `${path}/observed`); if (evidenceRefs.length !== 0) fail(contract, `${path}/evidenceRefs`, "must be empty for evidence-missing"); return Object.freeze({ kind: "evidence-missing" as const }); })()
      : (() => { if (evidenceRefs.length === 0) fail(contract, `${path}/evidenceRefs`, "must be non-empty for observed evidence"); return parseObservedDimension(row.observed, dimensionId, contract, `${path}/observed`); })();
    return Object.freeze({ dimensionId, evidenceRefs, observed }) as WorldReconstructionObservedDimensionRowV1;
  });
  if (observedDimensions.length !== 7) fail(contract, "observedDimensions", "must cover all seven dimensions");
  const advisoryPixelMetrics = array(source.advisoryPixelMetrics, contract, "advisoryPixelMetrics").map((entry, index) => parseMetric(entry, contract, `advisoryPixelMetrics/${index}`));
  if (advisoryPixelMetrics.some(({ kind }) => kind !== "ratio-basis-points" && kind !== "normalized-distance-basis-points")) fail(contract, "advisoryPixelMetrics", "only advisory ratio or normalized-distance metrics are allowed");
  return freeze({
    kind: "world-reconstruction-evidence-set", schemaVersion: 1,
    id: text(source.id, contract, "id"), caseRef: parseWorldReconstructionCaseArtifactRefV1(source.caseRef), caseHash: hash(source.caseHash, contract, "caseHash"),
    evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    attemptRef, attemptHash, sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash, worldPackageRef, worldPackageRootHash,
    worldPackageBuildReceiptRef, worldPackageBuildReceiptHash, worldBuildIdentityRef, worldBuildIdentityHash,
    captureReceiptRef, captureReceiptHash,
    identityEvidence: Object.freeze(identityEvidence), observedDimensions: Object.freeze(observedDimensions), advisoryPixelMetrics: Object.freeze(advisoryPixelMetrics),
  });
}

export function parseWorldReconstructionEvaluationResultV1(value: unknown): WorldReconstructionEvaluationResultV1 {
  const contract = "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID";
  const source = begin(value, contract, RESULT_FIELDS);
  if (source.kind !== "world-reconstruction-evaluation-result") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attemptHash = hash(source.attemptHash, contract, "attemptHash");
  const worldPackageRootHash = hash(source.worldPackageRootHash, contract, "worldPackageRootHash");
  const worldPackageRef = formalWorldPackageRef(source.worldPackageRef, worldPackageRootHash, contract, "worldPackageRef");
  const worldBuildIdentityHash = hash(source.worldBuildIdentityHash, contract, "worldBuildIdentityHash");
  const captureReceiptHash = hash(source.captureReceiptHash, contract, "captureReceiptHash");
  const dimensions = array(source.dimensions, contract, "dimensions").map((entry, index) => {
    const path = `dimensions/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "status", "metrics", "evidenceRefs", "diagnosticIds", "identity"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    const status = enumValue(row.status, ["passed", "failed", "incomplete"] as const, contract, `${path}/status`);
    const metrics = array(row.metrics, contract, `${path}/metrics`).map((metric, metricIndex) => parseMetric(metric, contract, `${path}/metrics/${metricIndex}`));
    const evidenceRefs = sortedStrings(row.evidenceRefs, contract, `${path}/evidenceRefs`, status !== "passed");
    const hasFailurePolarity = metrics.some((metric) =>
      (metric.kind === "boolean-presence" && !metric.isPresent) ||
      (metric.kind === "identity-match" && !metric.isMatch) ||
      (metric.kind === "receipt-outcome" && metric.outcome !== "completed")
    );
    const hasSuccessPolarity = metrics.some((metric) =>
      (metric.kind === "boolean-presence" && metric.isPresent) ||
      (metric.kind === "identity-match" && metric.isMatch) ||
      (metric.kind === "receipt-outcome" && metric.outcome === "completed")
    );
    if (status === "passed" && (hasFailurePolarity || !hasSuccessPolarity)) {
      fail(contract, `${path}/metrics`, "a passed dimension requires only success-polarity evidence");
    }
    const identity = object(row.identity, contract, `${path}/identity`);
    exactFields(identity, ["attemptHash", "worldPackageRootHash", "worldBuildIdentityHash", "captureReceiptHash"], contract, `${path}/identity`);
    if (hash(identity.attemptHash, contract, `${path}/identity/attemptHash`) !== attemptHash || hash(identity.worldPackageRootHash, contract, `${path}/identity/worldPackageRootHash`) !== worldPackageRootHash || hash(identity.worldBuildIdentityHash, contract, `${path}/identity/worldBuildIdentityHash`) !== worldBuildIdentityHash || hash(identity.captureReceiptHash, contract, `${path}/identity/captureReceiptHash`) !== captureReceiptHash) {
      fail(contract, `${path}/identity`, "stale Attempt, WorldPackage, or Capture identity");
    }
    return freeze({ dimensionId, status, metrics: Object.freeze(metrics), evidenceRefs, diagnosticIds: sortedStrings(row.diagnosticIds, contract, `${path}/diagnosticIds`, true), identity: Object.freeze({ attemptHash, worldPackageRootHash, worldBuildIdentityHash, captureReceiptHash }) });
  });
  if (dimensions.length !== 7) fail(contract, "dimensions", "must cover all seven dimensions");
  const diagnostics = array(source.diagnostics, contract, "diagnostics").map((entry) => parseWorldReconstructionDiagnosticV1(entry));
  const diagnosticAllowedDimensions: Readonly<Record<WorldReconstructionDiagnosticCodeV1, readonly WorldReconstructionDimensionIdV1[]>> = {
    WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING: ["topology"], WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING: ["topology"],
    WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT: ["semantic-silhouette"], WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT: ["opening-composition"],
    WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING: ["spawn-support"], WORLD_RECONSTRUCTION_COLLIDER_MISSING: ["collider"], WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH: ["collider"],
    WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED: ["critical-traversal"], WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE: ["critical-traversal"],
    WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC: ["deterministic-build"],
    WORLD_RECONSTRUCTION_EVIDENCE_STALE: WORLD_RECONSTRUCTION_DIMENSION_IDS_V1,
    WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING: WORLD_RECONSTRUCTION_DIMENSION_IDS_V1,
  };
  if (diagnostics.some((diagnostic) => !diagnosticAllowedDimensions[diagnostic.code].includes(diagnostic.dimensionId))) fail(contract, "diagnostics", "diagnostic code is not allowed for its dimension");
  const diagnosticKeys = diagnostics.map(({ dimensionId, code, metricId, targetRef, targetId }) =>
    `${dimensionId}\0${code}\0${metricId}\0${targetRef}\0${targetId}`
  );
  if (diagnosticKeys.some((key, index) => index > 0 && diagnosticKeys[index - 1]! >= key)) fail(contract, "diagnostics", "must be unique and sorted by dimension, code, metric, target ref, and target id");
  const declaredDiagnosticIds = new Set(dimensions.flatMap(({ diagnosticIds }) => diagnosticIds));
  const diagnosticDimensionById = new Map(diagnostics.map(({ id, dimensionId }) => [id, dimensionId]));
  if (diagnostics.some(({ id }) => !declaredDiagnosticIds.has(id)) || declaredDiagnosticIds.size !== diagnostics.length || dimensions.some(({ dimensionId, diagnosticIds }) => diagnosticIds.some((id) => diagnosticDimensionById.get(id) !== dimensionId))) fail(contract, "diagnostics", "must exactly match same-dimension diagnostic IDs");
  const diagnosticsById = new Map(diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
  for (const dimension of dimensions) {
    const dimensionDiagnostics = dimension.diagnosticIds.map((id) => diagnosticsById.get(id)!);
    const failurePolarity = dimension.metrics.some((metric) => (metric.kind === "boolean-presence" && !metric.isPresent) || (metric.kind === "identity-match" && !metric.isMatch) || (metric.kind === "receipt-outcome" && metric.outcome !== "completed"));
    const successOnly = dimension.metrics.length > 0 && !failurePolarity;
    if (dimension.status === "passed" && dimensionDiagnostics.length !== 0) fail(contract, "dimensions", "passed dimensions must not declare failure diagnostics");
    if (dimension.status === "failed" && (!failurePolarity || dimensionDiagnostics.length === 0)) fail(contract, "dimensions", "failed dimensions require failure-polarity evidence and a diagnostic");
    if (dimension.status === "incomplete" && (successOnly || !dimensionDiagnostics.some((diagnostic) => diagnostic.code === "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING" || diagnostic.code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"))) fail(contract, "dimensions", "incomplete dimensions require missing or stale evidence diagnostics");
  }
  const expectedOutcome: WorldReconstructionOutcomeV1 = dimensions.some(({ status }) => status === "incomplete") ? "incomplete" : dimensions.some(({ status }) => status === "failed") ? "failed" : "passed";
  const outcome = enumValue(source.outcome, ["passed", "failed", "incomplete"] as const, contract, "outcome");
  if (outcome !== expectedOutcome) fail(contract, "outcome", "must be derived from independent dimension outcomes");
  return freeze({
    kind: "world-reconstruction-evaluation-result", schemaVersion: 1, id: text(source.id, contract, "id"),
    caseRef: parseWorldReconstructionCaseArtifactRefV1(source.caseRef), caseHash: hash(source.caseHash, contract, "caseHash"), evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    evidenceSetRef: text(source.evidenceSetRef, contract, "evidenceSetRef"), evidenceSetHash: hash(source.evidenceSetHash, contract, "evidenceSetHash"),
    attemptRef: text(source.attemptRef, contract, "attemptRef"), attemptHash, worldPackageRef, worldPackageRootHash, worldBuildIdentityRef: text(source.worldBuildIdentityRef, contract, "worldBuildIdentityRef"), worldBuildIdentityHash,
    captureReceiptRef: text(source.captureReceiptRef, contract, "captureReceiptRef"), captureReceiptHash, outcome, diagnostics: Object.freeze(diagnostics), dimensions: Object.freeze(dimensions),
  });
}

function parseWorldReconstructionDiagnosticDetailsV1(
  value: unknown,
  contract: string,
): WorldReconstructionDiagnosticDetailsV1 {
  const source = object(value, contract, "details");
  const kind = enumValue(source.kind, [
    "basis-points-threshold",
    "millimeters-threshold",
    "state-mismatch",
    "presence-mismatch",
    "sequence-mismatch",
  ] as const, contract, "details/kind");
  if (kind === "basis-points-threshold") {
    exactFields(source, [
      "kind", "expectedBasisPoints", "actualBasisPoints",
      "maximumAllowedDriftBasisPoints", "exceededByBasisPoints",
      "correctionDirection",
    ], contract, "details");
    const expectedBasisPoints = basisPoints(
      source.expectedBasisPoints,
      contract,
      "details/expectedBasisPoints",
    );
    const actualBasisPoints = basisPoints(
      source.actualBasisPoints,
      contract,
      "details/actualBasisPoints",
    );
    const maximumAllowedDriftBasisPoints = basisPoints(
      source.maximumAllowedDriftBasisPoints,
      contract,
      "details/maximumAllowedDriftBasisPoints",
    );
    const exceededByBasisPoints = integer(
      source.exceededByBasisPoints,
      1,
      10_000,
      contract,
      "details/exceededByBasisPoints",
    );
    if (
      Math.abs(actualBasisPoints - expectedBasisPoints) -
          maximumAllowedDriftBasisPoints !== exceededByBasisPoints
    ) {
      fail(contract, "details/exceededByBasisPoints", "must equal the measured threshold excess");
    }
    const correctionDirection = enumValue(
      source.correctionDirection,
      ["increase", "decrease"] as const,
      contract,
      "details/correctionDirection",
    );
    if (
      (actualBasisPoints < expectedBasisPoints) !==
      (correctionDirection === "increase")
    ) {
      fail(contract, "details/correctionDirection", "must move the actual value toward the expected value");
    }
    return Object.freeze({
      kind,
      expectedBasisPoints,
      actualBasisPoints,
      maximumAllowedDriftBasisPoints,
      exceededByBasisPoints,
      correctionDirection,
    });
  }
  if (kind === "millimeters-threshold") {
    exactFields(source, [
      "kind", "expectedMillimeters", "actualMillimeters",
      "maximumAllowedDriftMillimeters", "exceededByMillimeters",
      "correctionDirection",
    ], contract, "details");
    const expectedMillimeters = integer(
      source.expectedMillimeters,
      0,
      Number.MAX_SAFE_INTEGER,
      contract,
      "details/expectedMillimeters",
    );
    const actualMillimeters = integer(
      source.actualMillimeters,
      0,
      Number.MAX_SAFE_INTEGER,
      contract,
      "details/actualMillimeters",
    );
    const maximumAllowedDriftMillimeters = integer(
      source.maximumAllowedDriftMillimeters,
      0,
      Number.MAX_SAFE_INTEGER,
      contract,
      "details/maximumAllowedDriftMillimeters",
    );
    const exceededByMillimeters = integer(
      source.exceededByMillimeters,
      1,
      Number.MAX_SAFE_INTEGER,
      contract,
      "details/exceededByMillimeters",
    );
    if (
      Math.abs(actualMillimeters - expectedMillimeters) -
          maximumAllowedDriftMillimeters !== exceededByMillimeters
    ) {
      fail(contract, "details/exceededByMillimeters", "must equal the measured threshold excess");
    }
    const correctionDirection = enumValue(
      source.correctionDirection,
      ["increase", "decrease"] as const,
      contract,
      "details/correctionDirection",
    );
    if (
      (actualMillimeters < expectedMillimeters) !==
      (correctionDirection === "increase")
    ) {
      fail(contract, "details/correctionDirection", "must move the actual value toward the expected value");
    }
    return Object.freeze({
      kind,
      expectedMillimeters,
      actualMillimeters,
      maximumAllowedDriftMillimeters,
      exceededByMillimeters,
      correctionDirection,
    });
  }
  if (kind === "state-mismatch") {
    exactFields(source, [
      "kind", "expectedValue", "actualValue", "correctionDirection",
    ], contract, "details");
    const expectedValue = text(source.expectedValue, contract, "details/expectedValue");
    const actualValue = text(source.actualValue, contract, "details/actualValue");
    if (expectedValue === actualValue) {
      fail(contract, "details", "state mismatch values must differ");
    }
    return Object.freeze({
      kind,
      expectedValue,
      actualValue,
      correctionDirection: enumValue(
        source.correctionDirection,
        ["replace"] as const,
        contract,
        "details/correctionDirection",
      ),
    });
  }
  if (kind === "presence-mismatch") {
    exactFields(source, [
      "kind", "expectedValue", "actualValue", "correctionDirection",
    ], contract, "details");
    if (
      source.expectedValue !== "present" ||
      source.actualValue !== "missing" ||
      source.correctionDirection !== "add"
    ) {
      fail(contract, "details", "presence mismatch must require adding a missing value");
    }
    return Object.freeze({
      kind,
      expectedValue: "present",
      actualValue: "missing",
      correctionDirection: "add",
    });
  }
  exactFields(source, [
    "kind", "expectedValues", "actualValues", "correctionDirection",
  ], contract, "details");
  const orderedUniqueStrings = (
    input: unknown,
    path: string,
    allowEmpty: boolean,
  ): readonly string[] => {
    const values = array(input, contract, path).map((entry, index) =>
      text(entry, contract, `${path}/${index}`)
    );
    if (!allowEmpty && values.length === 0) fail(contract, path, "must not be empty");
    if (new Set(values).size !== values.length) fail(contract, path, "must be unique");
    return Object.freeze(values);
  };
  const expectedValues = orderedUniqueStrings(
    source.expectedValues,
    "details/expectedValues",
    false,
  );
  const actualValues = orderedUniqueStrings(
    source.actualValues,
    "details/actualValues",
    true,
  );
  if (isEqual(expectedValues, actualValues)) {
    fail(contract, "details", "sequence mismatch values must differ");
  }
  return Object.freeze({
    kind,
    expectedValues,
    actualValues,
    correctionDirection: enumValue(
      source.correctionDirection,
      ["reorder"] as const,
      contract,
      "details/correctionDirection",
    ),
  });
}

function parseWorldReconstructionRepairActionV1(
  value: unknown,
  contract: string,
): WorldReconstructionRepairActionV1 {
  const source = object(value, contract, "repairAction");
  exactFields(source, [
    "kind", "targetKind", "targetId", "operation", "instruction",
  ], contract, "repairAction");
  return Object.freeze({
    kind: enumValue(
      source.kind,
      ["revise-native-source"] as const,
      contract,
      "repairAction/kind",
    ),
    targetKind: enumValue(source.targetKind, [
      "topology-node",
      "topology-layer",
      "topology-relation",
      "visual-group",
      "composition-target",
      "spawn-marker",
      "static-collider",
      "traversal-check",
    ] as const, contract, "repairAction/targetKind"),
    targetId: text(source.targetId, contract, "repairAction/targetId"),
    operation: enumValue(source.operation, [
      "add",
      "bind",
      "move",
      "resize",
      "reorder",
      "adjust-support",
      "set-traversal-binding",
      "adjust-traversal",
    ] as const, contract, "repairAction/operation"),
    instruction: text(source.instruction, contract, "repairAction/instruction"),
  });
}

export function parseWorldReconstructionDiagnosticV1(value: unknown): WorldReconstructionDiagnosticV1 {
  const contract = "WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID";
  assertAccessorFree(value, contract);
  const source = object(value, contract, "");
  if (source.kind !== "world-reconstruction-diagnostic") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const code = enumValue(source.code, [
    ...WORLD_RECONSTRUCTION_REPAIRABLE_DIAGNOSTIC_CODES_V1,
    ...WORLD_RECONSTRUCTION_NON_REPAIRABLE_DIAGNOSTIC_CODES_V1,
  ] as const, contract, "code");
  const common = {
    kind: "world-reconstruction-diagnostic", schemaVersion: 1, id: text(source.id, contract, "id"),
    dimensionId: enumValue(source.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, "dimensionId"),
    acceptanceTargetRef: text(source.acceptanceTargetRef, contract, "acceptanceTargetRef"),
    targetRef: text(source.targetRef, contract, "targetRef"),
    targetId: text(source.targetId, contract, "targetId"),
    metricId: enumValue(
      source.metricId,
      WORLD_RECONSTRUCTION_DIAGNOSTIC_METRIC_IDS_V1,
      contract,
      "metricId",
    ),
    details: parseWorldReconstructionDiagnosticDetailsV1(source.details, contract),
    evidenceRefs: sortedStrings(source.evidenceRefs, contract, "evidenceRefs", true),
    message: text(source.message, contract, "message"),
  } as const;
  if (!DIAGNOSTIC_METRIC_IDS_BY_CODE[code].includes(common.metricId)) {
    fail(contract, "metricId", `is not allowed for diagnostic code ${code}`);
  }
  if (common.details.kind !== DIAGNOSTIC_DETAIL_KIND_BY_METRIC_ID[common.metricId]) {
    fail(contract, "details/kind", `does not match metric ${common.metricId}`);
  }
  if (!isWorldReconstructionRepairableDiagnosticCodeV1(code)) {
    exactFields(source, NON_REPAIRABLE_DIAGNOSTIC_FIELDS, contract, "");
    return freeze({ ...common, code });
  }
  exactFields(source, DIAGNOSTIC_FIELDS, contract, "");
  const repairAction = parseWorldReconstructionRepairActionV1(
    source.repairAction,
    contract,
  );
  if (repairAction.targetId !== common.targetId) {
    fail(contract, "repairAction/targetId", "must match the diagnostic targetId");
  }
  const expectedRepairActionShape = REPAIR_ACTION_SHAPE_BY_METRIC_ID[common.metricId];
  if (isNil(expectedRepairActionShape)) {
    fail(contract, "repairAction", `metric ${common.metricId} is not source repairable`);
  }
  if (
    repairAction.targetKind !== expectedRepairActionShape.targetKind ||
    repairAction.operation !== expectedRepairActionShape.operation
  ) {
    fail(contract, "repairAction", `must use ${expectedRepairActionShape.targetKind}/${expectedRepairActionShape.operation} for metric ${common.metricId}`);
  }
  return freeze({
    ...common,
    code,
    repairAction,
  });
}

export function parseWorldReconstructionRunReceiptV1(value: unknown): WorldReconstructionRunReceiptV1 {
  const contract = "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID";
  const source = begin(value, contract, RUN_FIELDS);
  if (source.kind !== "world-reconstruction-run-receipt") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attempts = array(source.attempts, contract, "attempts").map((entry, index) => {
    const path = `attempts/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, RUN_ATTEMPT_FIELDS, contract, path);
    if (index > 1 || row.attemptIndex !== index) fail(contract, `${path}/attemptIndex`, "attempts must be contiguous 0 then optional 1");
    return Object.freeze({
      attemptIndex: index as 0 | 1,
      generationRequestRef: text(row.generationRequestRef, contract, `${path}/generationRequestRef`),
      generationRequestHash: hash(row.generationRequestHash, contract, `${path}/generationRequestHash`),
      generationReceiptRef: text(row.generationReceiptRef, contract, `${path}/generationReceiptRef`),
      generationReceiptHash: hash(row.generationReceiptHash, contract, `${path}/generationReceiptHash`),
      sceneAuthoringAttemptRef: text(row.sceneAuthoringAttemptRef, contract, `${path}/sceneAuthoringAttemptRef`),
      sceneAuthoringAttemptHash: hash(row.sceneAuthoringAttemptHash, contract, `${path}/sceneAuthoringAttemptHash`),
      sceneAuthoringAttemptResultRef: text(row.sceneAuthoringAttemptResultRef, contract, `${path}/sceneAuthoringAttemptResultRef`),
      sceneAuthoringAttemptResultHash: hash(row.sceneAuthoringAttemptResultHash, contract, `${path}/sceneAuthoringAttemptResultHash`),
      worldPackageRootHash: hash(row.worldPackageRootHash, contract, `${path}/worldPackageRootHash`),
      worldPackageRef: formalWorldPackageRef(row.worldPackageRef, hash(row.worldPackageRootHash, contract, `${path}/worldPackageRootHash`), contract, `${path}/worldPackageRef`),
      worldPackageBuildReceiptRef: text(row.worldPackageBuildReceiptRef, contract, `${path}/worldPackageBuildReceiptRef`),
      worldPackageBuildReceiptHash: hash(row.worldPackageBuildReceiptHash, contract, `${path}/worldPackageBuildReceiptHash`),
      worldBuildIdentityRef: text(row.worldBuildIdentityRef, contract, `${path}/worldBuildIdentityRef`),
      worldBuildIdentityHash: hash(row.worldBuildIdentityHash, contract, `${path}/worldBuildIdentityHash`),
      captureReceiptRef: text(row.captureReceiptRef, contract, `${path}/captureReceiptRef`),
      captureReceiptHash: hash(row.captureReceiptHash, contract, `${path}/captureReceiptHash`),
      evaluationResultRef: text(row.evaluationResultRef, contract, `${path}/evaluationResultRef`),
      evaluationResultHash: hash(row.evaluationResultHash, contract, `${path}/evaluationResultHash`),
      outcome: enumValue(row.outcome, ["passed", "failed", "incomplete"] as const, contract, `${path}/outcome`),
    });
  });
  if (attempts.length < 1 || attempts.length > 2) fail(contract, "attempts", "expected one initial and at most one repair attempt");
  if (attempts.length === 2) {
    const runScopedIdentityRefs = (attempt: (typeof attempts)[number]) => [
      attempt.generationRequestRef, attempt.generationReceiptRef,
      attempt.sceneAuthoringAttemptRef, attempt.sceneAuthoringAttemptResultRef,
      attempt.worldPackageRef,
      attempt.captureReceiptRef, attempt.evaluationResultRef,
    ];
    const identityHashes = (attempt: (typeof attempts)[number]) => [
      attempt.generationRequestHash, attempt.generationReceiptHash,
      attempt.sceneAuthoringAttemptHash, attempt.sceneAuthoringAttemptResultHash,
      attempt.worldPackageRootHash, attempt.worldPackageBuildReceiptHash, attempt.worldBuildIdentityHash,
      attempt.captureReceiptHash, attempt.evaluationResultHash,
    ];
    const firstRefs = new Set(runScopedIdentityRefs(attempts[0]!));
    const firstHashes = new Set(identityHashes(attempts[0]!));
    if (runScopedIdentityRefs(attempts[1]!).some((identity) => firstRefs.has(identity)) ||
        identityHashes(attempts[1]!).some((identity) => firstHashes.has(identity))) {
      fail(contract, "attempts/1", "stage identities must not be reused across attempts");
    }
  }
  const final = attempts.at(-1)!;
  const finalAttemptIndex = integer(source.finalAttemptIndex, 0, 1, contract, "finalAttemptIndex") as 0 | 1;
  const finalEvaluationResultRef = text(source.finalEvaluationResultRef, contract, "finalEvaluationResultRef");
  const finalEvaluationResultHash = hash(source.finalEvaluationResultHash, contract, "finalEvaluationResultHash");
  if (final.attemptIndex !== finalAttemptIndex || final.evaluationResultRef !== finalEvaluationResultRef || final.evaluationResultHash !== finalEvaluationResultHash) fail(contract, "finalAttemptIndex", "final identity must identify the last Attempt evaluation result");
  const outcome = enumValue(source.outcome, ["passed", "failed", "incomplete"] as const, contract, "outcome");
  const cleanupOutcome = enumValue(source.cleanupOutcome, ["completed", "failed"] as const, contract, "cleanupOutcome");
  const expectedOutcome = cleanupOutcome === "failed" ? "incomplete" : final.outcome;
  if (outcome !== expectedOutcome) fail(contract, "outcome", "must match final result and fail closed on cleanup");
  return freeze({ kind: "world-reconstruction-run-receipt", schemaVersion: 1, id: text(source.id, contract, "id"), caseRef: parseWorldReconstructionCaseArtifactRefV1(source.caseRef), caseHash: hash(source.caseHash, contract, "caseHash"), evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"), outcome, attempts: Object.freeze(attempts), finalAttemptIndex, finalEvaluationResultRef, finalEvaluationResultHash, cleanupOutcome });
}

type Parser<T> = (value: unknown) => T;
const canonicalBytes = <T>(parser: Parser<T>, value: unknown): Uint8Array => canonicalJsonBytes(parser(value));
const canonicalHash = <T>(parser: Parser<T>, value: unknown): Sha256HashV1 => sha256CanonicalJson(parser(value)) as Sha256HashV1;

export const worldReconstructionCaseCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionCaseV1, value);
export const hashWorldReconstructionCaseV1 = (value: unknown) => canonicalHash(parseWorldReconstructionCaseV1, value);
export const worldReconstructionEvaluationProfileCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvaluationProfileV1, value);
export const hashWorldReconstructionEvaluationProfileV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvaluationProfileV1, value);
export const worldReconstructionEvidenceSetCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvidenceSetV1, value);
export const hashWorldReconstructionEvidenceSetV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvidenceSetV1, value);
export const worldReconstructionEvaluationResultCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvaluationResultV1, value);
export const hashWorldReconstructionEvaluationResultV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvaluationResultV1, value);
export const worldReconstructionDiagnosticCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionDiagnosticV1, value);
export const hashWorldReconstructionDiagnosticV1 = (value: unknown) => canonicalHash(parseWorldReconstructionDiagnosticV1, value);
export const worldReconstructionRunReceiptCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionRunReceiptV1, value);
export const hashWorldReconstructionRunReceiptV1 = (value: unknown) => canonicalHash(parseWorldReconstructionRunReceiptV1, value);
