import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  AuthoringSpecV4,
  DefinitionResourceRefOverrideV1,
  PackageSubjectDefinitionV1,
  PlacementConstraintSpecV1,
  PrimitivePrototypeSpecV4,
  ProceduralTerrainSourceSpecV2,
  RelationshipSpecV1,
  RouteSpecV1,
  ScreenRegionSpecV1,
  SpatialRegionSpecV1,
  TraversalAreaSpecV1,
  WorldNodeSpecV4,
} from "@whitebox-world/authoring";

export { FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1 } from "@whitebox-world/authoring";
export type { DefinitionResourceRefOverrideV1 };

export const REGISTRY_RESOURCE_KINDS_V1 = [
  "subject-definition",
  "subject-asset",
  "capability",
  "rig-profile",
  "animation-set",
  "collider-profile",
  "collider-derivation-profile",
  "physics-body-profile",
  "locomotion-profile",
  "control-feel-profile",
  "control-profile",
  "motion-profile",
  "motion-kernel",
  "medium-profile",
  "camera-rig-algorithm",
  "camera-rig-profile",
  "camera-modifier-profile",
  "camera-context-profile",
  "relationship-profile",
  "harness-profile",
  "pose-set-profile",
  "render-binding-profile",
  "ai-schema-projection-profile",
  "traversal-surface-profile",
] as const;

export type RegistryResourceKindV1 = (typeof REGISTRY_RESOURCE_KINDS_V1)[number];

export const WORLD_CHANGE_OPERATION_TYPES_V1 = [
  "resource-upsert",
  "resource-remove",
  "node-upsert",
  "node-remove",
  "spatial-feature-upsert",
  "spatial-feature-remove",
  "relationship-add",
  "relationship-remove",
  "constraint-set",
  "constraint-remove",
  "terrain-source-replace",
  "startup-set",
  "definition-override-set",
  "definition-override-remove",
] as const;

export type WorldChangeOperationTypeV1 =
  (typeof WORLD_CHANGE_OPERATION_TYPES_V1)[number];

export const PACKAGE_LOCAL_RESOURCE_KINDS_V1 = [
  "prototype",
  "subject-definition",
] as const;

export type PackageLocalResourceKindV1 =
  (typeof PACKAGE_LOCAL_RESOURCE_KINDS_V1)[number];

export const SPATIAL_FEATURE_KINDS_V1 = [
  "region",
  "route",
  "screen-region",
  "traversal-area",
] as const;

export type SpatialFeatureKindV1 = (typeof SPATIAL_FEATURE_KINDS_V1)[number];

export const CONSTRAINT_KINDS_V1 = ["placement", "connectivity"] as const;

export type ConstraintKindV1 = (typeof CONSTRAINT_KINDS_V1)[number];

export const AUTHORING_EDIT_SCOPES_V1 = [
  "authoring.schema.read",
  "authoring.registry.read",
  "authoring.change.validate",
  "authoring.change.dry-run",
  "authoring.change.apply",
  "authoring.runtime.publish",
  "authoring.receipt.read",
] as const;

export type AuthoringEditScopeV1 = (typeof AUTHORING_EDIT_SCOPES_V1)[number];

export const AUTHORING_EDIT_BUDGET_IDS_V1 = [
  "change-set-bytes",
  "precondition-count",
  "operation-count",
  "concurrent-non-terminal-request-count",
  "prepared-candidate-count",
  "prepared-candidate-bytes",
  "prepared-candidate-retention-milliseconds",
] as const;

export type AuthoringEditBudgetIdV1 =
  (typeof AUTHORING_EDIT_BUDGET_IDS_V1)[number];

export const WORLD_CHANGE_DIAGNOSTIC_CODES_V1 = [
  "AI_SCHEMA_PROFILE_NOT_ALLOWED",
  "AI_SCHEMA_PROFILE_UNREPRESENTABLE",
  "AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED",
  "REGISTRY_SEARCH_LOCK_MISMATCH",
  "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
  "DEFINITION_OVERRIDE_VALUE_INVALID",
  "WORLD_CHANGE_SET_SCHEMA_INVALID",
  "WORLD_CHANGE_SET_ID_CONFLICT",
  "WORLD_CHANGE_REQUEST_ID_CONFLICT",
  "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
  "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
  "WORLD_CHANGE_PRECONDITION_FAILED",
  "WORLD_CHANGE_TARGET_CONFLICT",
  "WORLD_CHANGE_REFERENCE_DANGLING",
  "WORLD_CHANGE_CANDIDATE_INVALID",
  "WORLD_CHANGE_REQUIRED_GATE_FAILED",
  "WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED",
  "WORLD_CHANGE_PREPARED_CANDIDATE_STALE",
  "WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED",
  "WORLD_CHANGE_AUTHORIZATION_STALE",
  "WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED",
  "WORLD_CHANGE_RUNTIME_EXPECTATION_STALE",
  "WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED",
  "WORLD_CHANGE_RUNTIME_CAPACITY_EXCEEDED",
  "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
  "WORLD_CHANGE_PUBLICATION_CONFLICT",
  "WORLD_CHANGE_CLEANUP_INCOMPLETE",
  "WORLD_CHANGE_CLEANUP_QUARANTINED",
] as const;

export type WorldChangeDiagnosticCodeV1 =
  (typeof WORLD_CHANGE_DIAGNOSTIC_CODES_V1)[number];

export const WORLD_CHANGE_FAILURE_PHASES_V1 = [
  "admission",
  "authorization",
  "idempotency",
  "base-check",
  "precondition",
  "candidate-apply",
  "canonical-validation",
  "normalize",
  "solve",
  "compile",
  "package",
  "required-gates",
  "runtime-preflight",
  "runtime-prepare",
  "publication-conflict",
  "publication-commit",
] as const;

export type WorldChangeFailurePhaseV1 =
  (typeof WORLD_CHANGE_FAILURE_PHASES_V1)[number];

export const RUNTIME_STATE_KINDS_V1 = [
  "world-package",
  "world-session",
  "simulation-tick",
  "entity-transform",
  "entity-velocity",
  "active-action",
  "controller-binding",
  "relationship-state",
  "camera-view",
  "runtime-activity",
  "temporary-resource",
  "host-view-preference",
] as const;

export type RuntimeStateKindV1 = (typeof RUNTIME_STATE_KINDS_V1)[number];

export const RUNTIME_STATE_EFFECT_REASON_CODES_V1 = [
  "new-world-package",
  "new-world-session",
  "full-reload-tick-zero",
  "runtime-state-not-transferred",
  "new-package-bootstrap",
  "explicit-host-input",
  "incremental-state-unaffected",
  "incremental-target-replaced",
  "incremental-target-removed",
] as const;

export type RuntimeStateEffectReasonCodeV1 =
  (typeof RUNTIME_STATE_EFFECT_REASON_CODES_V1)[number];

export interface AiSchemaProjectionProfileV1 {
  readonly kind: "ai-schema-projection-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly maximumPropertyCount: number;
  readonly maximumNestingDepth: number;
  readonly maximumEnumValueCount: number;
  readonly maximumSchemaBytes: number;
  readonly maximumRegistrySearchResultCount: number;
  readonly optionalFieldMode:
    | "native-optional"
    | "required-nullable-with-round-trip-map";
  readonly contentHash: Sha256HashV1;
}

export type AiSchemaProjectionProfileBodyV1 = Omit<
  AiSchemaProjectionProfileV1,
  "contentHash"
>;

export interface AiSchemaCanonicalPathMappingV1 {
  readonly id: string;
  readonly mode: "identity" | "null-to-omitted" | "presence-wrapper";
  readonly projectionInstancePath: string;
  readonly canonicalInstancePath: string;
}

export interface RegistrySearchResultV1 {
  readonly resourceRef: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly version: number;
  readonly contentHash: Sha256HashV1;
  readonly authoringAvailability: "recommended" | "advanced" | "experimental";
  readonly requiredCapabilityRefs: readonly string[];
  readonly aiMetadata: Readonly<{
    displayName: string;
    description: string;
    semanticTags: readonly string[];
    usageExamples?: readonly string[];
  }>;
}

export interface AiSchemaProjectionRequestV1 {
  readonly kind: "worldkit-ai-schema-projection-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly projectionProfileRef: string;
  readonly authoringSchemaVersion: 4;
}

export interface AiSchemaProjectionDegradationV1 {
  readonly id: string;
  readonly type: "registry-enum-to-resource-ref";
  readonly canonicalInstancePath: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly reason:
    | "property-count-budget"
    | "nesting-depth-budget"
    | "enum-value-count-budget"
    | "schema-bytes-budget";
}

export interface AiSchemaProjectionV1 {
  readonly kind: "worldkit-ai-schema-projection";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly projectionProfileRef: string;
  readonly projectionProfileHash: Sha256HashV1;
  readonly authoringSchemaVersion: 4;
  readonly canonicalAuthoringSchemaHash: Sha256HashV1;
  readonly registryLockHash: Sha256HashV1;
  readonly capabilitySetHash: Sha256HashV1;
  readonly jsonSchemaDraft: "2020-12";
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly jsonSchemaHash: Sha256HashV1;
  readonly allowedWorldChangeOperationTypes: readonly WorldChangeOperationTypeV1[];
  readonly canonicalPathMappings: readonly AiSchemaCanonicalPathMappingV1[];
  readonly degradations: readonly AiSchemaProjectionDegradationV1[];
  readonly aiSchemaProjectionHash: Sha256HashV1;
}

export type AiSchemaProjectionBodyV1 = Omit<
  AiSchemaProjectionV1,
  "aiSchemaProjectionHash"
>;

export interface RegistrySearchRequestV1 {
  readonly kind: "worldkit-registry-search-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly registryLockHash: Sha256HashV1;
  readonly resourceKind: RegistryResourceKindV1;
  readonly semanticTagsAll?: readonly string[];
  readonly afterResourceRef?: string;
  readonly maximumResultCount: number;
}

export interface RegistrySearchReceiptV1 {
  readonly kind: "worldkit-registry-search-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly registryLockHash: Sha256HashV1;
  readonly results: readonly RegistrySearchResultV1[];
  readonly nextAfterResourceRef?: string;
  readonly registrySearchResultHash: Sha256HashV1;
}

export interface WorldChangeProvenanceV1 {
  readonly sourceType: "user" | "agent" | "validator";
  readonly sourceId?: string;
  readonly sourceArtifactRefs?: readonly string[];
}

export type WorldChangeTargetV1 =
  | {
      readonly kind: "resource";
      readonly resourceKind: PackageLocalResourceKindV1;
      readonly resourceId: string;
    }
  | { readonly kind: "node"; readonly nodeEntityId: string }
  | {
      readonly kind: "spatial-feature";
      readonly spatialFeatureKind: SpatialFeatureKindV1;
      readonly spatialFeatureId: string;
    }
  | { readonly kind: "relationship"; readonly relationshipId: string }
  | {
      readonly kind: "constraint";
      readonly constraintKind: ConstraintKindV1;
      readonly constraintId: string;
    }
  | {
      readonly kind: "definition-override";
      readonly nodeEntityId: string;
      readonly overrideId: string;
    }
  | { readonly kind: "startup"; readonly worldId: string };

export type WorldPreconditionV1 =
  | {
      readonly id: string;
      readonly type: "target-exists";
      readonly target: WorldChangeTargetV1;
    }
  | {
      readonly id: string;
      readonly type: "target-absent";
      readonly target: WorldChangeTargetV1;
    }
  | {
      readonly id: string;
      readonly type: "target-hash-equals";
      readonly target: WorldChangeTargetV1;
      readonly expectedTargetHash: Sha256HashV1;
    };

export type WorldChangeOperationV1 =
  | Readonly<{
      id: string;
      type: "resource-upsert";
      resourceKind: "prototype";
      prototype: PrimitivePrototypeSpecV4;
    }>
  | Readonly<{
      id: string;
      type: "resource-upsert";
      resourceKind: "subject-definition";
      subjectDefinition: PackageSubjectDefinitionV1;
    }>
  | Readonly<{
      id: string;
      type: "resource-remove";
      resourceKind: PackageLocalResourceKindV1;
      resourceId: string;
    }>
  | Readonly<{
      id: string;
      type: "node-upsert";
      node: WorldNodeSpecV4;
    }>
  | Readonly<{
      id: string;
      type: "node-remove";
      nodeEntityId: string;
    }>
  | (Readonly<{ id: string; type: "spatial-feature-upsert" }> &
      (
        | Readonly<{
            spatialFeatureKind: "region";
            spatialRegion: SpatialRegionSpecV1;
          }>
        | Readonly<{ spatialFeatureKind: "route"; route: RouteSpecV1 }>
        | Readonly<{
            spatialFeatureKind: "screen-region";
            screenRegion: ScreenRegionSpecV1;
          }>
        | Readonly<{
            spatialFeatureKind: "traversal-area";
            traversalArea: TraversalAreaSpecV1;
          }>
      ))
  | Readonly<{
      id: string;
      type: "spatial-feature-remove";
      spatialFeatureKind: SpatialFeatureKindV1;
      spatialFeatureId: string;
    }>
  | Readonly<{
      id: string;
      type: "relationship-add";
      relationship: RelationshipSpecV1;
    }>
  | Readonly<{
      id: string;
      type: "relationship-remove";
      relationshipId: string;
    }>
  | (Readonly<{ id: string; type: "constraint-set" }> &
      (
        | Readonly<{
            constraintKind: "placement";
            placementConstraint: PlacementConstraintSpecV1;
          }>
        | Readonly<{
            constraintKind: "connectivity";
            connectivityConstraint: AuthoringSpecV4["constraints"]["connectivity"][number];
          }>
      ))
  | Readonly<{
      id: string;
      type: "constraint-remove";
      constraintKind: ConstraintKindV1;
      constraintId: string;
    }>
  | Readonly<{
      id: string;
      type: "terrain-source-replace";
      terrainEntityId: string;
      terrainSource: ProceduralTerrainSourceSpecV2;
    }>
  | Readonly<{
      id: string;
      type: "startup-set";
      startup: AuthoringSpecV4["startup"];
    }>
  | Readonly<{
      id: string;
      type: "definition-override-set";
      nodeEntityId: string;
      override: DefinitionResourceRefOverrideV1;
    }>
  | Readonly<{
      id: string;
      type: "definition-override-remove";
      nodeEntityId: string;
      overrideId: string;
    }>;

export interface WorldChangeSetV1 {
  readonly kind: "worldkit-world-change-set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly baseAuthoringSpecHash: Sha256HashV1;
  readonly preconditions: readonly WorldPreconditionV1[];
  readonly operations: readonly WorldChangeOperationV1[];
  readonly provenance?: WorldChangeProvenanceV1;
}

export interface WorldChangeRequestBaseV1 {
  readonly kind: "worldkit-world-change-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly worldId: string;
  readonly changeSet: WorldChangeSetV1;
}

export interface WorldChangeValidateRequestV1 extends WorldChangeRequestBaseV1 {
  readonly mode: "validate";
}

export interface WorldChangeDryRunRequestV1 extends WorldChangeRequestBaseV1 {
  readonly mode: "dry-run";
}

export type RuntimePublicationExpectationV1 = Readonly<{
  runtimeSessionId: string;
  expectedWorldSessionId: string;
  expectedWorldPackageRootHash: Sha256HashV1;
  targetPhaseBarrier:
    | { readonly mode: "next-world-replacement-barrier" }
    | {
        readonly mode: "fixed-tick";
        readonly expectedSimulationTick: number;
      };
}>;

export type WorldChangeApplyRequestV1 =
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "authoring-only";
      preparedCandidateRef?: string;
      runtimeExpectation?: never;
    }>)
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "publish-runtime";
      preparedCandidateRef: string;
      runtimeExpectation: RuntimePublicationExpectationV1;
    }>);

export type WorldChangeRequestV1 =
  | WorldChangeValidateRequestV1
  | WorldChangeDryRunRequestV1
  | WorldChangeApplyRequestV1;

export type WorldChangeDiagnosticDetailsV1 =
  | Readonly<{
      kind: "related-ids";
      ids: readonly string[];
    }>
  | Readonly<{
      kind: "hash-mismatch";
      expectedHash: Sha256HashV1;
      actualHash: Sha256HashV1;
    }>
  | Readonly<{
      kind: "target-conflict";
      targets: readonly WorldChangeTargetV1[];
    }>
  | Readonly<{
      kind: "admission-budget";
      budgetId: AuthoringEditBudgetIdV1;
      limit: number;
      actual: number;
    }>
  | Readonly<{
      kind: "authorization-stale";
      reason:
        | "session-expired"
        | "session-revoked"
        | "scope-removed"
        | "policy-hash-changed";
    }>;

export interface WorldChangeDiagnosticV1 {
  readonly severity: "info" | "warning" | "error";
  readonly code: WorldChangeDiagnosticCodeV1;
  readonly instancePath: string;
  readonly message: string;
  readonly details?: WorldChangeDiagnosticDetailsV1;
}

export interface WorldChangeReceiptBaseV1 {
  readonly kind: "worldkit-world-change-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditSessionId: string;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly worldId: string;
  readonly changeSetId: string;
  readonly changeSetHash: Sha256HashV1;
  readonly baseAuthoringSpecHash: Sha256HashV1;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
}

export interface WorldChangeBuildIdentityV1 {
  readonly resultAuthoringSpecHash: Sha256HashV1;
  readonly registryLockHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly worldPackageRootHash: Sha256HashV1;
}

export interface WorldChangeAffectedIdsV1 {
  readonly resourceIds: readonly string[];
  readonly nodeEntityIds: readonly string[];
  readonly relationshipIds: readonly string[];
  readonly spatialFeatureIds: readonly string[];
  readonly constraintIds: readonly string[];
  readonly overrideIds: readonly string[];
}

export interface WorldChangeOperationResultV1 {
  readonly operationId: string;
  readonly operationType: WorldChangeOperationTypeV1;
  readonly target: WorldChangeTargetV1;
  readonly status: "applied";
  readonly previousTargetHash?: Sha256HashV1;
  readonly currentTargetHash?: Sha256HashV1;
}

export interface WorldChangeValidationReportBindingV1 {
  readonly validationReportRef: string;
  readonly validationReportHash: Sha256HashV1;
  readonly status: "passed";
}

export interface WorldChangeAppliedTransformationV1 {
  readonly id: string;
  readonly type: "schema-migration" | "safety-fix";
  readonly transformationRef: string;
  readonly previousAuthoringSpecHash: Sha256HashV1;
  readonly currentAuthoringSpecHash: Sha256HashV1;
}

export interface RuntimePublicationIdentityV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly simulationTick: number;
}

export type RuntimeStateEffectScopeV1 =
  | Readonly<{ kind: "entity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "relationship-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "controller-entity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "runtime-activity-ids"; ids: readonly string[] }>
  | Readonly<{ kind: "temporary-resource-ids"; ids: readonly string[] }>;

export interface RuntimeStateEffectExceptionV1 {
  readonly id: string;
  readonly scope: RuntimeStateEffectScopeV1;
  readonly disposition: "preserved" | "reset" | "replaced";
  readonly reasonCode: RuntimeStateEffectReasonCodeV1;
}

export interface RuntimeStateEffectV1 {
  readonly runtimeStateKind: RuntimeStateKindV1;
  readonly defaultDisposition: "preserved" | "reset" | "replaced";
  readonly defaultReasonCode: RuntimeStateEffectReasonCodeV1;
  readonly exceptions: readonly RuntimeStateEffectExceptionV1[];
}

export interface RuntimeCleanupDispositionV1 {
  readonly cleanupOperationId: string;
  readonly type: "replaced-runtime";
  readonly previousWorldSessionId: string;
  readonly statusAtCommit: "scheduled";
}

export interface WorldChangeCandidateReceiptBaseV1
  extends WorldChangeReceiptBaseV1 {
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
  readonly appliedMigrations: readonly WorldChangeAppliedTransformationV1[];
  readonly appliedSafetyFixes: readonly WorldChangeAppliedTransformationV1[];
}

export interface WorldChangeValidatedReceiptV1 extends WorldChangeReceiptBaseV1 {
  readonly status: "validated";
  readonly mode: "validate";
  readonly publicationMode: "none";
}

export interface WorldChangeDryRunSucceededReceiptV1
  extends WorldChangeCandidateReceiptBaseV1 {
  readonly status: "succeeded";
  readonly mode: "dry-run";
  readonly publicationMode: "none";
  readonly preparedCandidateRef: string;
  readonly preparedCandidateExpiresAtUnixMilliseconds: number;
}

export type WorldChangeCommittedReceiptV1 =
  | (WorldChangeCandidateReceiptBaseV1 & Readonly<{
      status: "committed";
      mode: "apply";
      requestedOutcome: "authoring-only";
      publicationMode: "none";
      committedRevisionRef: string;
    }>)
  | (WorldChangeCandidateReceiptBaseV1 & Readonly<{
      status: "committed";
      mode: "apply";
      requestedOutcome: "publish-runtime";
      publicationMode: "full-reload" | "incremental-hot-apply";
      committedRevisionRef: string;
      previousRuntimeIdentity: RuntimePublicationIdentityV1;
      currentRuntimeIdentity: RuntimePublicationIdentityV1;
      runtimeStateEffects: readonly RuntimeStateEffectV1[];
      runtimeCleanup: RuntimeCleanupDispositionV1;
    }>);

export interface WorldChangeRejectedReceiptBaseV1
  extends WorldChangeReceiptBaseV1 {
  readonly status: "rejected";
  readonly publicationMode: "none";
  readonly failurePhase: WorldChangeFailurePhaseV1;
  readonly currentAuthoringSpecHash?: Sha256HashV1;
  readonly conflictingIds?: WorldChangeAffectedIdsV1;
}

export type WorldChangeRejectedReceiptV1 =
  | (WorldChangeRejectedReceiptBaseV1 & Readonly<{
      mode: "validate" | "dry-run";
      requestedOutcome?: never;
    }>)
  | (WorldChangeRejectedReceiptBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "authoring-only" | "publish-runtime";
    }>);

export type WorldChangeReceiptV1 =
  | WorldChangeValidatedReceiptV1
  | WorldChangeDryRunSucceededReceiptV1
  | WorldChangeCommittedReceiptV1
  | WorldChangeRejectedReceiptV1;

export interface AuthoringEditWorkloadBudgetV1 {
  readonly maximumChangeSetBytes: number;
  readonly maximumPreconditionCount: number;
  readonly maximumOperationCount: number;
  readonly maximumConcurrentNonTerminalRequestCount: number;
  readonly maximumPreparedCandidateCount: number;
  readonly maximumPreparedCandidateBytes: number;
  readonly maximumPreparedCandidateRetentionMilliseconds: number;
}

export interface AuthoringEditPolicyProjectionV1 {
  readonly allowedWorldIds: readonly string[];
  readonly registryLockHash: Sha256HashV1;
  readonly capabilitySetHash: Sha256HashV1;
  readonly projectionProfileRef: string;
  readonly allowedWorldChangeOperationTypes: readonly WorldChangeOperationTypeV1[];
  readonly allowedOverridePaths: readonly string[];
  readonly requiredGateProfileRefs: readonly string[];
  readonly workloadBudget: AuthoringEditWorkloadBudgetV1;
}

export interface PreparedCandidatePinV1 {
  readonly preparedCandidateRef: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly pinnedAtUnixMilliseconds: number;
}

export interface WorldChangeReceiptQueryV1 {
  readonly kind: "worldkit-world-change-receipt-query";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
}

export interface WorldChangeCleanupReportQueryV1 {
  readonly kind: "worldkit-world-change-cleanup-report-query";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly cleanupOperationId: string;
}

export interface WorldChangeCleanupReportV1 {
  readonly kind: "worldkit-world-change-cleanup-report";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly cleanupOperationId: string;
  readonly previousWorldSessionId: string;
  readonly status: "scheduled" | "retrying" | "released" | "quarantined";
  readonly attemptCount: number;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
}

export interface WorldChangeExplainRequestV1 {
  readonly kind: "worldkit-world-change-explain-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly selector:
    | { readonly mode: "summary" }
    | { readonly mode: "operation"; readonly operationId: string }
    | { readonly mode: "diagnostic"; readonly diagnosticCode: WorldChangeDiagnosticCodeV1 };
}

export interface WorldChangeExplainV1 {
  readonly kind: "worldkit-world-change-explain";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly explanations: readonly Readonly<{
    id: string;
    type:
      | "schema-projection"
      | "override-policy"
      | "operation-effect"
      | "publication-selection"
      | "runtime-state-effect"
      | "conflict";
    message: string;
    relatedIds: readonly string[];
  }>[];
}

export interface WorldChangeDiffRequestV1 {
  readonly kind: "worldkit-world-change-diff-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
}

export interface WorldChangeDiffV1 {
  readonly kind: "worldkit-world-change-diff";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly baseAuthoringSpecHash: Sha256HashV1;
  readonly resultAuthoringSpecHash: Sha256HashV1;
  readonly changes: readonly Readonly<{
    id: string;
    type: "added" | "removed" | "replaced";
    target: WorldChangeTargetV1;
    previousTargetHash?: Sha256HashV1;
    currentTargetHash?: Sha256HashV1;
  }>[];
}

export interface WorldkitAuthoringEditApiV1 {
  readonly version: 1;
  projectAiSchema(
    request: AiSchemaProjectionRequestV1,
  ): Promise<AiSchemaProjectionV1>;
  searchRegistry(
    request: RegistrySearchRequestV1,
  ): Promise<RegistrySearchReceiptV1>;
  validateWorldChange(
    request: WorldChangeValidateRequestV1,
  ): Promise<WorldChangeReceiptV1>;
  dryRunWorldChange(
    request: WorldChangeDryRunRequestV1,
  ): Promise<WorldChangeReceiptV1>;
  applyWorldChange(
    request: WorldChangeApplyRequestV1,
  ): Promise<WorldChangeReceiptV1>;
  getWorldChangeReceipt(
    request: WorldChangeReceiptQueryV1,
  ): Promise<WorldChangeReceiptV1>;
  getWorldChangeCleanupReport(
    request: WorldChangeCleanupReportQueryV1,
  ): Promise<WorldChangeCleanupReportV1>;
  explainWorldChange(
    request: WorldChangeExplainRequestV1,
  ): Promise<WorldChangeExplainV1>;
  diffWorldChange(
    request: WorldChangeDiffRequestV1,
  ): Promise<WorldChangeDiffV1>;
}
