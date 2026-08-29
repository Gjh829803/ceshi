import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  assertCanonicalJsonValue,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, omit } from "lodash-es";

import {
  parseConnectivityConstraintSpecV1,
  parsePackageSubjectDefinitionV1,
  parsePlacementConstraintSpecV1,
  parsePrimitivePrototypeSpecV4,
  parseProceduralTerrainSourceSpecV2,
  parseRelationshipSpecV1,
  parseRouteSpecV1,
  parseScreenRegionSpecV1,
  parseSpatialRegionSpecV1,
  parseStartupSpecV4,
  parseTraversalAreaSpecV1,
  parseWorldNodeSpecV4,
} from "./fragments.js";
import {
  closedMember,
  deepFreeze,
  hasExactKeys,
  hasRequiredAndOptionalKeys,
  invalid,
  isCanonicalId,
  isNonEmptyString,
  isOverridePath,
  isSafeNonNegativeInteger,
  isSafePositiveInteger,
  isSha256,
  parseIdArray,
  parseStringArray,
  snapshotDataArray,
  snapshotDataRecord,
} from "./parse-kernel.js";
import {
  AUTHORING_EDIT_BUDGET_IDS_V1,
  CONSTRAINT_KINDS_V1,
  PACKAGE_LOCAL_RESOURCE_KINDS_V1,
  REGISTRY_RESOURCE_KINDS_V1,
  RUNTIME_STATE_EFFECT_REASON_CODES_V1,
  RUNTIME_STATE_KINDS_V1,
  SPATIAL_FEATURE_KINDS_V1,
  WORLD_CHANGE_DIAGNOSTIC_CODES_V1,
  WORLD_CHANGE_FAILURE_PHASES_V1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AiSchemaCanonicalPathMappingV1,
  type AiSchemaProjectionDegradationV1,
  type AiSchemaProjectionProfileBodyV1,
  type AiSchemaProjectionProfileV1,
  type AiSchemaProjectionRequestV1,
  type AiSchemaProjectionV1,
  type AuthoringEditBudgetIdV1,
  type AuthoringEditPolicyProjectionV1,
  type AuthoringEditWorkloadBudgetV1,
  type ConstraintKindV1,
  type DefinitionResourceRefOverrideV1,
  type PackageLocalResourceKindV1,
  type PreparedCandidatePinV1,
  type RegistryResourceKindV1,
  type RegistrySearchReceiptV1,
  type RegistrySearchRequestV1,
  type RegistrySearchResultV1,
  type RuntimeCleanupDispositionV1,
  type RuntimePublicationExpectationV1,
  type RuntimePublicationIdentityV1,
  type RuntimeStateEffectExceptionV1,
  type RuntimeStateEffectReasonCodeV1,
  type RuntimeStateEffectScopeV1,
  type RuntimeStateEffectV1,
  type RuntimeStateKindV1,
  type SpatialFeatureKindV1,
  type WorldChangeAffectedIdsV1,
  type WorldChangeAppliedTransformationV1,
  type WorldChangeBuildIdentityV1,
  type WorldChangeCleanupReportQueryV1,
  type WorldChangeCleanupReportV1,
  type WorldChangeDiagnosticCodeV1,
  type WorldChangeDiagnosticDetailsV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeDiffRequestV1,
  type WorldChangeDiffV1,
  type WorldChangeExplainRequestV1,
  type WorldChangeExplainV1,
  type WorldChangeFailurePhaseV1,
  type WorldChangeOperationResultV1,
  type WorldChangeOperationTypeV1,
  type WorldChangeOperationV1,
  type WorldChangeProvenanceV1,
  type WorldChangeReceiptQueryV1,
  type WorldChangeReceiptV1,
  type WorldChangeRequestV1,
  type WorldChangeSetV1,
  type WorldChangeTargetV1,
  type WorldChangeValidationReportBindingV1,
  type WorldPreconditionV1,
} from "./types.js";

const SCHEMA_CHANGE_SET = "WorldChangeSetV1";
const SCHEMA_REQUEST = "WorldChangeRequestV1";
const SCHEMA_RECEIPT = "WorldChangeReceiptV1";
const SCHEMA_PROJECTION = "AiSchemaProjectionV1";
const SCHEMA_PROFILE = "AiSchemaProjectionProfileV1";
const SCHEMA_SEARCH_REQUEST = "RegistrySearchRequestV1";
const SCHEMA_SEARCH_RECEIPT = "RegistrySearchReceiptV1";

const OPERATION_TYPES = new Set<WorldChangeOperationTypeV1>(
  WORLD_CHANGE_OPERATION_TYPES_V1,
);
const RESOURCE_KINDS = new Set<PackageLocalResourceKindV1>(
  PACKAGE_LOCAL_RESOURCE_KINDS_V1,
);
const SPATIAL_KINDS = new Set<SpatialFeatureKindV1>(SPATIAL_FEATURE_KINDS_V1);
const CONSTRAINT_KINDS = new Set<ConstraintKindV1>(CONSTRAINT_KINDS_V1);
const DIAGNOSTIC_CODES = new Set<WorldChangeDiagnosticCodeV1>(
  WORLD_CHANGE_DIAGNOSTIC_CODES_V1,
);
const FAILURE_PHASES = new Set<WorldChangeFailurePhaseV1>(
  WORLD_CHANGE_FAILURE_PHASES_V1,
);
const BUDGET_IDS = new Set<AuthoringEditBudgetIdV1>(AUTHORING_EDIT_BUDGET_IDS_V1);
const REGISTRY_KINDS = new Set<RegistryResourceKindV1>(REGISTRY_RESOURCE_KINDS_V1);
const RUNTIME_STATE_KINDS = new Set<RuntimeStateKindV1>(RUNTIME_STATE_KINDS_V1);
const REASON_CODES = new Set<RuntimeStateEffectReasonCodeV1>(
  RUNTIME_STATE_EFFECT_REASON_CODES_V1,
);

const EXCEPTION_SCOPE_BY_STATE: Readonly<
  Record<RuntimeStateKindV1, RuntimeStateEffectScopeV1["kind"] | undefined>
> = {
  "world-package": undefined,
  "world-session": undefined,
  "simulation-tick": undefined,
  "entity-transform": "entity-ids",
  "entity-velocity": "entity-ids",
  "active-action": "entity-ids",
  "controller-binding": "controller-entity-ids",
  "relationship-state": "relationship-ids",
  "camera-view": undefined,
  "runtime-activity": "runtime-activity-ids",
  "temporary-resource": "temporary-resource-ids",
  "host-view-preference": undefined,
};

function uniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

function lexicographicallySorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1]! < value,
  );
}

function parseCanonicalJsonObject(
  value: unknown,
  schemaName: string,
): Readonly<Record<string, unknown>> {
  if (isNil(snapshotDataRecord(value))) invalid(schemaName);
  try {
    assertCanonicalJsonValue(value);
  } catch {
    invalid(schemaName);
  }
  return deepFreeze(structuredClone(value) as Record<string, unknown>);
}

export function parseWorldChangeTargetV1(
  input: unknown,
  schemaName = SCHEMA_CHANGE_SET,
): WorldChangeTargetV1 {
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (record.kind === "resource") {
    if (
      !hasExactKeys(record, ["kind", "resourceKind", "resourceId"]) ||
      !closedMember(record.resourceKind, RESOURCE_KINDS) ||
      !isCanonicalId(record.resourceId)
    ) invalid(schemaName);
    return deepFreeze({
      kind: "resource",
      resourceKind: record.resourceKind as PackageLocalResourceKindV1,
      resourceId: record.resourceId,
    });
  }
  if (record.kind === "node") {
    if (
      !hasExactKeys(record, ["kind", "nodeEntityId"]) ||
      !isCanonicalId(record.nodeEntityId)
    ) invalid(schemaName);
    return deepFreeze({ kind: "node", nodeEntityId: record.nodeEntityId });
  }
  if (record.kind === "spatial-feature") {
    if (
      !hasExactKeys(record, ["kind", "spatialFeatureKind", "spatialFeatureId"]) ||
      !closedMember(record.spatialFeatureKind, SPATIAL_KINDS) ||
      !isCanonicalId(record.spatialFeatureId)
    ) invalid(schemaName);
    return deepFreeze({
      kind: "spatial-feature",
      spatialFeatureKind: record.spatialFeatureKind as SpatialFeatureKindV1,
      spatialFeatureId: record.spatialFeatureId,
    });
  }
  if (record.kind === "relationship") {
    if (
      !hasExactKeys(record, ["kind", "relationshipId"]) ||
      !isCanonicalId(record.relationshipId)
    ) invalid(schemaName);
    return deepFreeze({
      kind: "relationship",
      relationshipId: record.relationshipId,
    });
  }
  if (record.kind === "constraint") {
    if (
      !hasExactKeys(record, ["kind", "constraintKind", "constraintId"]) ||
      !closedMember(record.constraintKind, CONSTRAINT_KINDS) ||
      !isCanonicalId(record.constraintId)
    ) invalid(schemaName);
    return deepFreeze({
      kind: "constraint",
      constraintKind: record.constraintKind as ConstraintKindV1,
      constraintId: record.constraintId,
    });
  }
  if (record.kind === "definition-override") {
    if (
      !hasExactKeys(record, ["kind", "nodeEntityId", "overrideId"]) ||
      !isCanonicalId(record.nodeEntityId) ||
      !isCanonicalId(record.overrideId)
    ) invalid(schemaName);
    return deepFreeze({
      kind: "definition-override",
      nodeEntityId: record.nodeEntityId,
      overrideId: record.overrideId,
    });
  }
  if (record.kind === "startup") {
    if (
      !hasExactKeys(record, ["kind", "worldId"]) ||
      !isCanonicalId(record.worldId)
    ) invalid(schemaName);
    return deepFreeze({ kind: "startup", worldId: record.worldId });
  }
  invalid(schemaName);
}

function parsePrecondition(input: unknown): WorldPreconditionV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_CHANGE_SET);
  if (!isCanonicalId(record.id)) invalid(SCHEMA_CHANGE_SET);
  if (record.type === "target-exists" || record.type === "target-absent") {
    if (!hasExactKeys(record, ["id", "type", "target"])) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: record.type,
      target: parseWorldChangeTargetV1(record.target),
    });
  }
  if (record.type === "target-hash-equals") {
    if (
      !hasExactKeys(record, ["id", "type", "target", "expectedTargetHash"]) ||
      !isSha256(record.expectedTargetHash)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "target-hash-equals",
      target: parseWorldChangeTargetV1(record.target),
      expectedTargetHash: record.expectedTargetHash,
    });
  }
  invalid(SCHEMA_CHANGE_SET);
}

export function parseDefinitionResourceRefOverrideV1(
  input: unknown,
  schemaName = SCHEMA_CHANGE_SET,
): DefinitionResourceRefOverrideV1 {
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, ["id", "kind", "path", "resourceRef"]) ||
    !isCanonicalId(record.id) ||
    record.kind !== "resource-ref" ||
    !isOverridePath(record.path) ||
    !isNonEmptyString(record.resourceRef)
  ) invalid(schemaName);
  return deepFreeze({
    id: record.id,
    kind: "resource-ref",
    path: record.path,
    resourceRef: record.resourceRef,
  });
}

function parseOperation(input: unknown): WorldChangeOperationV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_CHANGE_SET);
  if (!isCanonicalId(record.id) || !closedMember(record.type, OPERATION_TYPES)) {
    invalid(SCHEMA_CHANGE_SET);
  }
  if (record.type === "resource-upsert") {
    if (record.resourceKind === "prototype") {
      if (!hasExactKeys(record, ["id", "type", "resourceKind", "prototype"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "resource-upsert",
        resourceKind: "prototype",
        prototype: parsePrimitivePrototypeSpecV4(record.prototype, SCHEMA_CHANGE_SET),
      });
    }
    if (record.resourceKind === "subject-definition") {
      if (!hasExactKeys(record, ["id", "type", "resourceKind", "subjectDefinition"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "resource-upsert",
        resourceKind: "subject-definition",
        subjectDefinition: parsePackageSubjectDefinitionV1(
          record.subjectDefinition,
          SCHEMA_CHANGE_SET,
        ),
      });
    }
    invalid(SCHEMA_CHANGE_SET);
  }
  if (record.type === "resource-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "resourceKind", "resourceId"]) ||
      !closedMember(record.resourceKind, RESOURCE_KINDS) ||
      !isCanonicalId(record.resourceId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "resource-remove",
      resourceKind: record.resourceKind as PackageLocalResourceKindV1,
      resourceId: record.resourceId,
    });
  }
  if (record.type === "node-upsert") {
    if (!hasExactKeys(record, ["id", "type", "node"])) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "node-upsert",
      node: parseWorldNodeSpecV4(record.node, SCHEMA_CHANGE_SET),
    });
  }
  if (record.type === "node-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "nodeEntityId"]) ||
      !isCanonicalId(record.nodeEntityId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "node-remove",
      nodeEntityId: record.nodeEntityId,
    });
  }
  if (record.type === "spatial-feature-upsert") {
    if (record.spatialFeatureKind === "region") {
      if (!hasExactKeys(record, ["id", "type", "spatialFeatureKind", "spatialRegion"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "spatial-feature-upsert",
        spatialFeatureKind: "region",
        spatialRegion: parseSpatialRegionSpecV1(record.spatialRegion, SCHEMA_CHANGE_SET),
      });
    }
    if (record.spatialFeatureKind === "route") {
      if (!hasExactKeys(record, ["id", "type", "spatialFeatureKind", "route"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "spatial-feature-upsert",
        spatialFeatureKind: "route",
        route: parseRouteSpecV1(record.route, SCHEMA_CHANGE_SET),
      });
    }
    if (record.spatialFeatureKind === "screen-region") {
      if (!hasExactKeys(record, ["id", "type", "spatialFeatureKind", "screenRegion"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "spatial-feature-upsert",
        spatialFeatureKind: "screen-region",
        screenRegion: parseScreenRegionSpecV1(record.screenRegion, SCHEMA_CHANGE_SET),
      });
    }
    if (record.spatialFeatureKind === "traversal-area") {
      if (!hasExactKeys(record, ["id", "type", "spatialFeatureKind", "traversalArea"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "spatial-feature-upsert",
        spatialFeatureKind: "traversal-area",
        traversalArea: parseTraversalAreaSpecV1(record.traversalArea, SCHEMA_CHANGE_SET),
      });
    }
    invalid(SCHEMA_CHANGE_SET);
  }
  if (record.type === "spatial-feature-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "spatialFeatureKind", "spatialFeatureId"]) ||
      !closedMember(record.spatialFeatureKind, SPATIAL_KINDS) ||
      !isCanonicalId(record.spatialFeatureId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "spatial-feature-remove",
      spatialFeatureKind: record.spatialFeatureKind as SpatialFeatureKindV1,
      spatialFeatureId: record.spatialFeatureId,
    });
  }
  if (record.type === "relationship-add") {
    if (!hasExactKeys(record, ["id", "type", "relationship"])) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "relationship-add",
      relationship: parseRelationshipSpecV1(record.relationship, SCHEMA_CHANGE_SET),
    });
  }
  if (record.type === "relationship-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "relationshipId"]) ||
      !isCanonicalId(record.relationshipId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "relationship-remove",
      relationshipId: record.relationshipId,
    });
  }
  if (record.type === "constraint-set") {
    if (record.constraintKind === "placement") {
      if (!hasExactKeys(record, ["id", "type", "constraintKind", "placementConstraint"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "constraint-set",
        constraintKind: "placement",
        placementConstraint: parsePlacementConstraintSpecV1(
          record.placementConstraint,
          SCHEMA_CHANGE_SET,
        ),
      });
    }
    if (record.constraintKind === "connectivity") {
      if (!hasExactKeys(record, ["id", "type", "constraintKind", "connectivityConstraint"])) {
        invalid(SCHEMA_CHANGE_SET);
      }
      return deepFreeze({
        id: record.id,
        type: "constraint-set",
        constraintKind: "connectivity",
        connectivityConstraint: parseConnectivityConstraintSpecV1(
          record.connectivityConstraint,
          SCHEMA_CHANGE_SET,
        ),
      });
    }
    invalid(SCHEMA_CHANGE_SET);
  }
  if (record.type === "constraint-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "constraintKind", "constraintId"]) ||
      !closedMember(record.constraintKind, CONSTRAINT_KINDS) ||
      !isCanonicalId(record.constraintId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "constraint-remove",
      constraintKind: record.constraintKind as ConstraintKindV1,
      constraintId: record.constraintId,
    });
  }
  if (record.type === "terrain-source-replace") {
    if (
      !hasExactKeys(record, ["id", "type", "terrainEntityId", "terrainSource"]) ||
      !isCanonicalId(record.terrainEntityId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "terrain-source-replace",
      terrainEntityId: record.terrainEntityId,
      terrainSource: parseProceduralTerrainSourceSpecV2(
        record.terrainSource,
        SCHEMA_CHANGE_SET,
      ),
    });
  }
  if (record.type === "startup-set") {
    if (!hasExactKeys(record, ["id", "type", "startup"])) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "startup-set",
      startup: parseStartupSpecV4(record.startup, SCHEMA_CHANGE_SET),
    });
  }
  if (record.type === "definition-override-set") {
    if (
      !hasExactKeys(record, ["id", "type", "nodeEntityId", "override"]) ||
      !isCanonicalId(record.nodeEntityId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "definition-override-set",
      nodeEntityId: record.nodeEntityId,
      override: parseDefinitionResourceRefOverrideV1(record.override),
    });
  }
  if (record.type === "definition-override-remove") {
    if (
      !hasExactKeys(record, ["id", "type", "nodeEntityId", "overrideId"]) ||
      !isCanonicalId(record.nodeEntityId) ||
      !isCanonicalId(record.overrideId)
    ) invalid(SCHEMA_CHANGE_SET);
    return deepFreeze({
      id: record.id,
      type: "definition-override-remove",
      nodeEntityId: record.nodeEntityId,
      overrideId: record.overrideId,
    });
  }
  invalid(SCHEMA_CHANGE_SET);
}

function parseProvenance(input: unknown): WorldChangeProvenanceV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_CHANGE_SET);
  if (
    record.sourceType !== "user" &&
    record.sourceType !== "agent" &&
    record.sourceType !== "validator"
  ) invalid(SCHEMA_CHANGE_SET);
  if (!hasRequiredAndOptionalKeys(
    record,
    ["sourceType"],
    ["sourceId", "sourceArtifactRefs"],
  )) invalid(SCHEMA_CHANGE_SET);
  const sourceId = Object.hasOwn(record, "sourceId")
    ? record.sourceId
    : undefined;
  const sourceArtifactRefs = Object.hasOwn(record, "sourceArtifactRefs")
    ? parseStringArray(record.sourceArtifactRefs, { unique: true })
    : undefined;
  if (
    (Object.hasOwn(record, "sourceId") && !isNonEmptyString(sourceId)) ||
    (Object.hasOwn(record, "sourceArtifactRefs") && isNil(sourceArtifactRefs))
  ) invalid(SCHEMA_CHANGE_SET);
  return deepFreeze({
    sourceType: record.sourceType,
    ...(isNonEmptyString(sourceId) ? { sourceId } : {}),
    ...(sourceArtifactRefs === undefined ? {} : { sourceArtifactRefs }),
  });
}

export function parseWorldChangeSetV1(input: unknown): WorldChangeSetV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_CHANGE_SET);
  if (
    !hasRequiredAndOptionalKeys(
      record,
      ["kind", "schemaVersion", "id", "baseAuthoringSpecHash", "preconditions", "operations"],
      ["provenance"],
    ) ||
    record.kind !== "worldkit-world-change-set" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isSha256(record.baseAuthoringSpecHash)
  ) invalid(SCHEMA_CHANGE_SET);
  const preconditionsInput = snapshotDataArray(record.preconditions) ?? invalid(SCHEMA_CHANGE_SET);
  const operationsInput = snapshotDataArray(record.operations) ?? invalid(SCHEMA_CHANGE_SET);
  const preconditions = preconditionsInput.map(parsePrecondition);
  const operations = operationsInput.map(parseOperation);
  if (
    !uniqueIds(preconditions.map((row) => row.id)) ||
    !uniqueIds(operations.map((row) => row.id))
  ) invalid(SCHEMA_CHANGE_SET);
  return deepFreeze({
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id: record.id,
    baseAuthoringSpecHash: record.baseAuthoringSpecHash,
    preconditions,
    operations,
    ...(Object.hasOwn(record, "provenance")
      ? { provenance: parseProvenance(record.provenance) }
      : {}),
  });
}

export function hashWorldChangeSetV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseWorldChangeSetV1(input)) as Sha256HashV1;
}

function parsePhaseBarrier(
  input: unknown,
): RuntimePublicationExpectationV1["targetPhaseBarrier"] {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_REQUEST);
  if (
    record.mode === "next-world-replacement-barrier" &&
    hasExactKeys(record, ["mode"])
  ) {
    return { mode: "next-world-replacement-barrier" };
  }
  if (
    record.mode === "fixed-tick" &&
    hasExactKeys(record, ["mode", "expectedSimulationTick"]) &&
    isSafeNonNegativeInteger(record.expectedSimulationTick)
  ) {
    return {
      mode: "fixed-tick",
      expectedSimulationTick: record.expectedSimulationTick,
    };
  }
  invalid(SCHEMA_REQUEST);
}

export function parseRuntimePublicationExpectationV1(
  input: unknown,
): RuntimePublicationExpectationV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_REQUEST);
  if (
    !hasExactKeys(record, [
      "runtimeSessionId",
      "expectedWorldSessionId",
      "expectedWorldPackageRootHash",
      "targetPhaseBarrier",
    ]) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.expectedWorldSessionId) ||
    !isSha256(record.expectedWorldPackageRootHash)
  ) invalid(SCHEMA_REQUEST);
  return deepFreeze({
    runtimeSessionId: record.runtimeSessionId,
    expectedWorldSessionId: record.expectedWorldSessionId,
    expectedWorldPackageRootHash: record.expectedWorldPackageRootHash,
    targetPhaseBarrier: parsePhaseBarrier(record.targetPhaseBarrier),
  });
}

export function parseWorldChangeRequestV1(input: unknown): WorldChangeRequestV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_REQUEST);
  if (
    record.kind !== "worldkit-world-change-request" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isCanonicalId(record.worldId)
  ) invalid(SCHEMA_REQUEST);
  const changeSet = parseWorldChangeSetV1(record.changeSet);
  if (record.mode === "validate") {
    if (!hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "worldId",
      "changeSet",
      "mode",
    ])) invalid(SCHEMA_REQUEST);
    return deepFreeze({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: record.id,
      authoringEditSessionId: record.authoringEditSessionId,
      worldId: record.worldId,
      changeSet,
      mode: "validate",
    });
  }
  if (record.mode === "dry-run") {
    if (!hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "worldId",
      "changeSet",
      "mode",
    ])) invalid(SCHEMA_REQUEST);
    return deepFreeze({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: record.id,
      authoringEditSessionId: record.authoringEditSessionId,
      worldId: record.worldId,
      changeSet,
      mode: "dry-run",
    });
  }
  if (record.mode !== "apply") invalid(SCHEMA_REQUEST);
  if (record.requestedOutcome === "authoring-only") {
    if (
      !hasRequiredAndOptionalKeys(
        record,
        [
          "kind",
          "schemaVersion",
          "id",
          "authoringEditSessionId",
          "worldId",
          "changeSet",
          "mode",
          "requestedOutcome",
        ],
        ["preparedCandidateRef"],
      ) ||
      Object.hasOwn(record, "runtimeExpectation") ||
      (Object.hasOwn(record, "preparedCandidateRef") &&
        !isNonEmptyString(record.preparedCandidateRef))
    ) invalid(SCHEMA_REQUEST);
    return deepFreeze({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: record.id,
      authoringEditSessionId: record.authoringEditSessionId,
      worldId: record.worldId,
      changeSet,
      mode: "apply",
      requestedOutcome: "authoring-only",
      ...(isNonEmptyString(record.preparedCandidateRef)
        ? { preparedCandidateRef: record.preparedCandidateRef }
        : {}),
    });
  }
  if (record.requestedOutcome === "publish-runtime") {
    if (
      !hasExactKeys(record, [
        "kind",
        "schemaVersion",
        "id",
        "authoringEditSessionId",
        "worldId",
        "changeSet",
        "mode",
        "requestedOutcome",
        "preparedCandidateRef",
        "runtimeExpectation",
      ]) ||
      !isNonEmptyString(record.preparedCandidateRef)
    ) invalid(SCHEMA_REQUEST);
    return deepFreeze({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: record.id,
      authoringEditSessionId: record.authoringEditSessionId,
      worldId: record.worldId,
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: record.preparedCandidateRef,
      runtimeExpectation: parseRuntimePublicationExpectationV1(
        record.runtimeExpectation,
      ),
    });
  }
  invalid(SCHEMA_REQUEST);
}

export function hashWorldChangeRequestV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseWorldChangeRequestV1(input)) as Sha256HashV1;
}

function parseDiagnosticDetails(
  input: unknown,
): WorldChangeDiagnosticDetailsV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (record.kind === "related-ids") {
    const ids = parseIdArray(record.ids, { unique: true });
    if (!hasExactKeys(record, ["kind", "ids"]) || isNil(ids)) invalid(SCHEMA_RECEIPT);
    return deepFreeze({ kind: "related-ids", ids });
  }
  if (record.kind === "hash-mismatch") {
    if (
      !hasExactKeys(record, ["kind", "expectedHash", "actualHash"]) ||
      !isSha256(record.expectedHash) ||
      !isSha256(record.actualHash)
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      kind: "hash-mismatch",
      expectedHash: record.expectedHash,
      actualHash: record.actualHash,
    });
  }
  if (record.kind === "target-conflict") {
    const rows = snapshotDataArray(record.targets) ?? invalid(SCHEMA_RECEIPT);
    if (!hasExactKeys(record, ["kind", "targets"])) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      kind: "target-conflict",
      targets: rows.map((row) => parseWorldChangeTargetV1(row, SCHEMA_RECEIPT)),
    });
  }
  if (record.kind === "admission-budget") {
    if (
      !hasExactKeys(record, ["kind", "budgetId", "limit", "actual"]) ||
      !closedMember(record.budgetId, BUDGET_IDS) ||
      !isSafeNonNegativeInteger(record.limit) ||
      !isSafeNonNegativeInteger(record.actual)
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      kind: "admission-budget",
      budgetId: record.budgetId as AuthoringEditBudgetIdV1,
      limit: record.limit,
      actual: record.actual,
    });
  }
  if (record.kind === "authorization-stale") {
    if (
      !hasExactKeys(record, ["kind", "reason"]) ||
      (
        record.reason !== "session-expired" &&
        record.reason !== "session-revoked" &&
        record.reason !== "scope-removed" &&
        record.reason !== "policy-hash-changed"
      )
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      kind: "authorization-stale",
      reason: record.reason as
        | "session-expired"
        | "session-revoked"
        | "scope-removed"
        | "policy-hash-changed",
    });
  }
  invalid(SCHEMA_RECEIPT);
}

export function parseWorldChangeDiagnosticV1(
  input: unknown,
): WorldChangeDiagnosticV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasRequiredAndOptionalKeys(
      record,
      ["severity", "code", "instancePath", "message"],
      ["details"],
    ) ||
    (
      record.severity !== "info" &&
      record.severity !== "warning" &&
      record.severity !== "error"
    ) ||
    !closedMember(record.code, DIAGNOSTIC_CODES) ||
    typeof record.instancePath !== "string" ||
    !isNonEmptyString(record.message)
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    severity: record.severity,
    code: record.code as WorldChangeDiagnosticCodeV1,
    instancePath: record.instancePath,
    message: record.message,
    ...(Object.hasOwn(record, "details")
      ? { details: parseDiagnosticDetails(record.details) }
      : {}),
  });
}

function parseDiagnostics(input: unknown): readonly WorldChangeDiagnosticV1[] {
  const rows = snapshotDataArray(input) ?? invalid(SCHEMA_RECEIPT);
  return rows.map(parseWorldChangeDiagnosticV1);
}

function parseReceiptBase(record: Readonly<Record<string, unknown>>) {
  if (
    record.kind !== "worldkit-world-change-receipt" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId) ||
    !isSha256(record.requestHash) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isSha256(record.authoringEditPolicyHash) ||
    !isCanonicalId(record.worldId) ||
    !isCanonicalId(record.changeSetId) ||
    !isSha256(record.changeSetHash) ||
    !isSha256(record.baseAuthoringSpecHash)
  ) invalid(SCHEMA_RECEIPT);
  return {
    kind: "worldkit-world-change-receipt" as const,
    schemaVersion: 1 as const,
    id: record.id,
    requestId: record.requestId,
    requestHash: record.requestHash,
    authoringEditSessionId: record.authoringEditSessionId,
    authoringEditPolicyHash: record.authoringEditPolicyHash,
    worldId: record.worldId,
    changeSetId: record.changeSetId,
    changeSetHash: record.changeSetHash,
    baseAuthoringSpecHash: record.baseAuthoringSpecHash,
    diagnostics: parseDiagnostics(record.diagnostics),
  };
}

function parseBuildIdentity(input: unknown): WorldChangeBuildIdentityV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, [
      "resultAuthoringSpecHash",
      "registryLockHash",
      "normalizedWorldIrHash",
      "executionPlanHash",
      "worldPackageRootHash",
    ]) ||
    !isSha256(record.resultAuthoringSpecHash) ||
    !isSha256(record.registryLockHash) ||
    !isSha256(record.normalizedWorldIrHash) ||
    !isSha256(record.executionPlanHash) ||
    !isSha256(record.worldPackageRootHash)
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    resultAuthoringSpecHash: record.resultAuthoringSpecHash,
    registryLockHash: record.registryLockHash,
    normalizedWorldIrHash: record.normalizedWorldIrHash,
    executionPlanHash: record.executionPlanHash,
    worldPackageRootHash: record.worldPackageRootHash,
  });
}

export function parseWorldChangeAffectedIdsV1(
  input: unknown,
): WorldChangeAffectedIdsV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  const resourceIds = parseIdArray(record.resourceIds, { unique: true });
  const nodeEntityIds = parseIdArray(record.nodeEntityIds, { unique: true });
  const relationshipIds = parseIdArray(record.relationshipIds, { unique: true });
  const spatialFeatureIds = parseIdArray(record.spatialFeatureIds, { unique: true });
  const constraintIds = parseIdArray(record.constraintIds, { unique: true });
  const overrideIds = parseIdArray(record.overrideIds, { unique: true });
  if (
    !hasExactKeys(record, [
      "resourceIds",
      "nodeEntityIds",
      "relationshipIds",
      "spatialFeatureIds",
      "constraintIds",
      "overrideIds",
    ]) ||
    isNil(resourceIds) ||
    isNil(nodeEntityIds) ||
    isNil(relationshipIds) ||
    isNil(spatialFeatureIds) ||
    isNil(constraintIds) ||
    isNil(overrideIds)
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    resourceIds,
    nodeEntityIds,
    relationshipIds,
    spatialFeatureIds,
    constraintIds,
    overrideIds,
  });
}

function parseOperationResult(input: unknown): WorldChangeOperationResultV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasRequiredAndOptionalKeys(
      record,
      ["operationId", "operationType", "target", "status"],
      ["previousTargetHash", "currentTargetHash"],
    ) ||
    !isCanonicalId(record.operationId) ||
    !closedMember(record.operationType, OPERATION_TYPES) ||
    record.status !== "applied" ||
    (Object.hasOwn(record, "previousTargetHash") && !isSha256(record.previousTargetHash)) ||
    (Object.hasOwn(record, "currentTargetHash") && !isSha256(record.currentTargetHash))
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    operationId: record.operationId,
    operationType: record.operationType as WorldChangeOperationTypeV1,
    target: parseWorldChangeTargetV1(record.target, SCHEMA_RECEIPT),
    status: "applied",
    ...(isSha256(record.previousTargetHash)
      ? { previousTargetHash: record.previousTargetHash }
      : {}),
    ...(isSha256(record.currentTargetHash)
      ? { currentTargetHash: record.currentTargetHash }
      : {}),
  });
}

export function parseWorldChangeValidationReportBindingV1(
  input: unknown,
): WorldChangeValidationReportBindingV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, ["validationReportRef", "validationReportHash", "status"]) ||
    !isNonEmptyString(record.validationReportRef) ||
    !isSha256(record.validationReportHash) ||
    record.status !== "passed"
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    validationReportRef: record.validationReportRef,
    validationReportHash: record.validationReportHash,
    status: "passed",
  });
}

function parseTransformation(
  input: unknown,
): WorldChangeAppliedTransformationV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, [
      "id",
      "type",
      "transformationRef",
      "previousAuthoringSpecHash",
      "currentAuthoringSpecHash",
    ]) ||
    !isCanonicalId(record.id) ||
    (record.type !== "schema-migration" && record.type !== "safety-fix") ||
    !isNonEmptyString(record.transformationRef) ||
    !isSha256(record.previousAuthoringSpecHash) ||
    !isSha256(record.currentAuthoringSpecHash)
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    id: record.id,
    type: record.type,
    transformationRef: record.transformationRef,
    previousAuthoringSpecHash: record.previousAuthoringSpecHash,
    currentAuthoringSpecHash: record.currentAuthoringSpecHash,
  });
}

function parseRuntimeIdentity(input: unknown): RuntimePublicationIdentityV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, [
      "runtimeSessionId",
      "worldSessionId",
      "worldPackageRootHash",
      "simulationTick",
    ]) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isSha256(record.worldPackageRootHash) ||
    !isSafeNonNegativeInteger(record.simulationTick)
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    worldPackageRootHash: record.worldPackageRootHash,
    simulationTick: record.simulationTick,
  });
}

function parseEffectScope(input: unknown): RuntimeStateEffectScopeV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  const ids = parseIdArray(record.ids, { unique: true });
  if (
    isNil(ids) ||
    !hasExactKeys(record, ["kind", "ids"]) ||
    isEmpty(ids)
  ) invalid(SCHEMA_RECEIPT);
  if (
    record.kind !== "entity-ids" &&
    record.kind !== "relationship-ids" &&
    record.kind !== "controller-entity-ids" &&
    record.kind !== "runtime-activity-ids" &&
    record.kind !== "temporary-resource-ids"
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({ kind: record.kind, ids });
}

function parseEffectException(
  input: unknown,
  runtimeStateKind: RuntimeStateKindV1,
): RuntimeStateEffectExceptionV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, ["id", "scope", "disposition", "reasonCode"]) ||
    !isCanonicalId(record.id) ||
    (
      record.disposition !== "preserved" &&
      record.disposition !== "reset" &&
      record.disposition !== "replaced"
    ) ||
    !closedMember(record.reasonCode, REASON_CODES)
  ) invalid(SCHEMA_RECEIPT);
  const scope = parseEffectScope(record.scope);
  const expectedScope = EXCEPTION_SCOPE_BY_STATE[runtimeStateKind];
  if (expectedScope === undefined || scope.kind !== expectedScope) {
    invalid(SCHEMA_RECEIPT);
  }
  return deepFreeze({
    id: record.id,
    scope,
    disposition: record.disposition,
    reasonCode: record.reasonCode as RuntimeStateEffectReasonCodeV1,
  });
}

export function parseRuntimeStateEffectV1(
  input: unknown,
  options: { requireEmptyExceptions: boolean },
): RuntimeStateEffectV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, [
      "runtimeStateKind",
      "defaultDisposition",
      "defaultReasonCode",
      "exceptions",
    ]) ||
    !closedMember(record.runtimeStateKind, RUNTIME_STATE_KINDS) ||
    (
      record.defaultDisposition !== "preserved" &&
      record.defaultDisposition !== "reset" &&
      record.defaultDisposition !== "replaced"
    ) ||
    !closedMember(record.defaultReasonCode, REASON_CODES)
  ) invalid(SCHEMA_RECEIPT);
  const exceptionRows = snapshotDataArray(record.exceptions) ?? invalid(SCHEMA_RECEIPT);
  if (options.requireEmptyExceptions && exceptionRows.length > 0) {
    invalid(SCHEMA_RECEIPT);
  }
  const runtimeStateKind = record.runtimeStateKind as RuntimeStateKindV1;
  const exceptions = exceptionRows.map((row) =>
    parseEffectException(row, runtimeStateKind),
  );
  if (!uniqueIds(exceptions.map((row) => row.id))) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    runtimeStateKind,
    defaultDisposition: record.defaultDisposition,
    defaultReasonCode: record.defaultReasonCode as RuntimeStateEffectReasonCodeV1,
    exceptions,
  });
}

function parseRuntimeStateEffects(
  input: unknown,
  publicationMode: "full-reload" | "incremental-hot-apply",
): readonly RuntimeStateEffectV1[] {
  const rows = snapshotDataArray(input) ?? invalid(SCHEMA_RECEIPT);
  const effects = rows.map((row) =>
    parseRuntimeStateEffectV1(row, {
      requireEmptyExceptions: publicationMode === "full-reload",
    }),
  );
  if (
    effects.length !== RUNTIME_STATE_KINDS_V1.length ||
    !isEqual(
      [...effects.map((row) => row.runtimeStateKind)].sort(),
      [...RUNTIME_STATE_KINDS_V1].sort(),
    )
  ) invalid(SCHEMA_RECEIPT);
  return effects;
}

function parseCleanup(input: unknown): RuntimeCleanupDispositionV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  if (
    !hasExactKeys(record, [
      "cleanupOperationId",
      "type",
      "previousWorldSessionId",
      "statusAtCommit",
    ]) ||
    !isNonEmptyString(record.cleanupOperationId) ||
    record.type !== "replaced-runtime" ||
    !isNonEmptyString(record.previousWorldSessionId) ||
    record.statusAtCommit !== "scheduled"
  ) invalid(SCHEMA_RECEIPT);
  return deepFreeze({
    cleanupOperationId: record.cleanupOperationId,
    type: "replaced-runtime",
    previousWorldSessionId: record.previousWorldSessionId,
    statusAtCommit: "scheduled",
  });
}

function parseCandidateFields(record: Readonly<Record<string, unknown>>) {
  const operationRows = snapshotDataArray(record.operationResults) ?? invalid(SCHEMA_RECEIPT);
  const reportRows = snapshotDataArray(record.validationReports) ?? invalid(SCHEMA_RECEIPT);
  const migrationRows = snapshotDataArray(record.appliedMigrations) ?? invalid(SCHEMA_RECEIPT);
  const safetyRows = snapshotDataArray(record.appliedSafetyFixes) ?? invalid(SCHEMA_RECEIPT);
  const operationResults = operationRows.map(parseOperationResult);
  if (!uniqueIds(operationResults.map((row) => row.operationId))) invalid(SCHEMA_RECEIPT);
  return {
    buildIdentity: parseBuildIdentity(record.buildIdentity),
    affectedIds: parseWorldChangeAffectedIdsV1(record.affectedIds),
    operationResults,
    validationReports: reportRows.map(parseWorldChangeValidationReportBindingV1),
    appliedMigrations: migrationRows.map(parseTransformation),
    appliedSafetyFixes: safetyRows.map(parseTransformation),
  };
}

const RECEIPT_BASE_KEYS = [
  "kind",
  "schemaVersion",
  "id",
  "requestId",
  "requestHash",
  "authoringEditSessionId",
  "authoringEditPolicyHash",
  "worldId",
  "changeSetId",
  "changeSetHash",
  "baseAuthoringSpecHash",
  "diagnostics",
] as const;

const CANDIDATE_KEYS = [
  ...RECEIPT_BASE_KEYS,
  "buildIdentity",
  "affectedIds",
  "operationResults",
  "validationReports",
  "appliedMigrations",
  "appliedSafetyFixes",
] as const;

export function parseWorldChangeReceiptV1(input: unknown): WorldChangeReceiptV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_RECEIPT);
  const base = parseReceiptBase(record);
  if (record.status === "validated") {
    if (
      !hasExactKeys(record, [...RECEIPT_BASE_KEYS, "status", "mode", "publicationMode"]) ||
      record.mode !== "validate" ||
      record.publicationMode !== "none"
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      ...base,
      status: "validated",
      mode: "validate",
      publicationMode: "none",
    });
  }
  if (record.status === "succeeded") {
    if (
      !hasExactKeys(record, [
        ...CANDIDATE_KEYS,
        "status",
        "mode",
        "publicationMode",
        "preparedCandidateRef",
        "preparedCandidateExpiresAtUnixMilliseconds",
      ]) ||
      record.mode !== "dry-run" ||
      record.publicationMode !== "none" ||
      !isNonEmptyString(record.preparedCandidateRef) ||
      !isSafeNonNegativeInteger(record.preparedCandidateExpiresAtUnixMilliseconds)
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      ...base,
      ...parseCandidateFields(record),
      status: "succeeded",
      mode: "dry-run",
      publicationMode: "none",
      preparedCandidateRef: record.preparedCandidateRef,
      preparedCandidateExpiresAtUnixMilliseconds:
        record.preparedCandidateExpiresAtUnixMilliseconds,
    });
  }
  if (record.status === "committed" && record.requestedOutcome === "authoring-only") {
    if (
      !hasExactKeys(record, [
        ...CANDIDATE_KEYS,
        "status",
        "mode",
        "requestedOutcome",
        "publicationMode",
        "committedRevisionRef",
      ]) ||
      record.mode !== "apply" ||
      record.publicationMode !== "none" ||
      !isNonEmptyString(record.committedRevisionRef)
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      ...base,
      ...parseCandidateFields(record),
      status: "committed",
      mode: "apply",
      requestedOutcome: "authoring-only",
      publicationMode: "none",
      committedRevisionRef: record.committedRevisionRef,
    });
  }
  if (record.status === "committed" && record.requestedOutcome === "publish-runtime") {
    if (
      !hasExactKeys(record, [
        ...CANDIDATE_KEYS,
        "status",
        "mode",
        "requestedOutcome",
        "publicationMode",
        "committedRevisionRef",
        "previousRuntimeIdentity",
        "currentRuntimeIdentity",
        "runtimeStateEffects",
        "runtimeCleanup",
      ]) ||
      record.mode !== "apply" ||
      (record.publicationMode !== "full-reload" &&
        record.publicationMode !== "incremental-hot-apply") ||
      !isNonEmptyString(record.committedRevisionRef)
    ) invalid(SCHEMA_RECEIPT);
    return deepFreeze({
      ...base,
      ...parseCandidateFields(record),
      status: "committed",
      mode: "apply",
      requestedOutcome: "publish-runtime",
      publicationMode: record.publicationMode,
      committedRevisionRef: record.committedRevisionRef,
      previousRuntimeIdentity: parseRuntimeIdentity(record.previousRuntimeIdentity),
      currentRuntimeIdentity: parseRuntimeIdentity(record.currentRuntimeIdentity),
      runtimeStateEffects: parseRuntimeStateEffects(
        record.runtimeStateEffects,
        record.publicationMode,
      ),
      runtimeCleanup: parseCleanup(record.runtimeCleanup),
    });
  }
  if (record.status === "rejected") {
    if (record.publicationMode !== "none" || !closedMember(record.failurePhase, FAILURE_PHASES)) {
      invalid(SCHEMA_RECEIPT);
    }
    const optionalRejected = ["currentAuthoringSpecHash", "conflictingIds"] as const;
    if (
      Object.hasOwn(record, "currentAuthoringSpecHash") &&
      !isSha256(record.currentAuthoringSpecHash)
    ) invalid(SCHEMA_RECEIPT);
    const rejectedExtra = {
      status: "rejected" as const,
      publicationMode: "none" as const,
      failurePhase: record.failurePhase as WorldChangeFailurePhaseV1,
      ...(isSha256(record.currentAuthoringSpecHash)
        ? { currentAuthoringSpecHash: record.currentAuthoringSpecHash }
        : {}),
      ...(Object.hasOwn(record, "conflictingIds")
        ? { conflictingIds: parseWorldChangeAffectedIdsV1(record.conflictingIds) }
        : {}),
    };
    if (record.mode === "validate" || record.mode === "dry-run") {
      if (
        !hasRequiredAndOptionalKeys(
          record,
          [...RECEIPT_BASE_KEYS, "status", "mode", "publicationMode", "failurePhase"],
          optionalRejected,
        ) ||
        Object.hasOwn(record, "requestedOutcome")
      ) invalid(SCHEMA_RECEIPT);
      return deepFreeze({
        ...base,
        ...rejectedExtra,
        mode: record.mode,
      });
    }
    if (record.mode === "apply") {
      if (
        !hasRequiredAndOptionalKeys(
          record,
          [
            ...RECEIPT_BASE_KEYS,
            "status",
            "mode",
            "publicationMode",
            "failurePhase",
            "requestedOutcome",
          ],
          optionalRejected,
        ) ||
        (
          record.requestedOutcome !== "authoring-only" &&
          record.requestedOutcome !== "publish-runtime"
        )
      ) invalid(SCHEMA_RECEIPT);
      return deepFreeze({
        ...base,
        ...rejectedExtra,
        mode: "apply" as const,
        requestedOutcome: record.requestedOutcome as
          | "authoring-only"
          | "publish-runtime",
      });
    }
  }
  invalid(SCHEMA_RECEIPT);
}

export function hashWorldChangeReceiptV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseWorldChangeReceiptV1(input)) as Sha256HashV1;
}

function parseOperationTypeArray(
  input: unknown,
  schemaName: string,
): readonly WorldChangeOperationTypeV1[] {
  const values = snapshotDataArray(input) ?? invalid(schemaName);
  if (!values.every((value) => closedMember(value, OPERATION_TYPES))) {
    invalid(schemaName);
  }
  const types = values as WorldChangeOperationTypeV1[];
  if (!uniqueIds(types)) invalid(schemaName);
  return types;
}

export function parseAuthoringEditWorkloadBudgetV1(
  input: unknown,
): AuthoringEditWorkloadBudgetV1 {
  const record = snapshotDataRecord(input) ?? invalid("AuthoringEditWorkloadBudgetV1");
  const fields = [
    "maximumChangeSetBytes",
    "maximumPreconditionCount",
    "maximumOperationCount",
    "maximumConcurrentNonTerminalRequestCount",
    "maximumPreparedCandidateCount",
    "maximumPreparedCandidateBytes",
    "maximumPreparedCandidateRetentionMilliseconds",
  ] as const;
  const maximumChangeSetBytes = record.maximumChangeSetBytes;
  const maximumPreconditionCount = record.maximumPreconditionCount;
  const maximumOperationCount = record.maximumOperationCount;
  const maximumConcurrentNonTerminalRequestCount =
    record.maximumConcurrentNonTerminalRequestCount;
  const maximumPreparedCandidateCount = record.maximumPreparedCandidateCount;
  const maximumPreparedCandidateBytes = record.maximumPreparedCandidateBytes;
  const maximumPreparedCandidateRetentionMilliseconds =
    record.maximumPreparedCandidateRetentionMilliseconds;
  if (
    !hasExactKeys(record, fields) ||
    !isSafePositiveInteger(maximumChangeSetBytes) ||
    !isSafePositiveInteger(maximumPreconditionCount) ||
    !isSafePositiveInteger(maximumOperationCount) ||
    !isSafePositiveInteger(maximumConcurrentNonTerminalRequestCount) ||
    !isSafePositiveInteger(maximumPreparedCandidateCount) ||
    !isSafePositiveInteger(maximumPreparedCandidateBytes) ||
    !isSafePositiveInteger(maximumPreparedCandidateRetentionMilliseconds)
  ) {
    invalid("AuthoringEditWorkloadBudgetV1");
  }
  return deepFreeze({
    maximumChangeSetBytes,
    maximumPreconditionCount,
    maximumOperationCount,
    maximumConcurrentNonTerminalRequestCount,
    maximumPreparedCandidateCount,
    maximumPreparedCandidateBytes,
    maximumPreparedCandidateRetentionMilliseconds,
  });
}

export function parseAuthoringEditPolicyProjectionV1(
  input: unknown,
): AuthoringEditPolicyProjectionV1 {
  const schemaName = "AuthoringEditPolicyProjectionV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const allowedWorldIds = parseIdArray(record.allowedWorldIds, { unique: true });
  const allowedOverridePaths = parseStringArray(record.allowedOverridePaths, {
    unique: true,
  });
  const requiredGateProfileRefs = parseStringArray(record.requiredGateProfileRefs, {
    unique: true,
  });
  if (
    !hasExactKeys(record, [
      "allowedWorldIds",
      "registryLockHash",
      "capabilitySetHash",
      "projectionProfileRef",
      "allowedWorldChangeOperationTypes",
      "allowedOverridePaths",
      "requiredGateProfileRefs",
      "workloadBudget",
    ]) ||
    isNil(allowedWorldIds) ||
    !lexicographicallySorted(allowedWorldIds) ||
    !isSha256(record.registryLockHash) ||
    !isSha256(record.capabilitySetHash) ||
    !isNonEmptyString(record.projectionProfileRef) ||
    isNil(allowedOverridePaths) ||
    !allowedOverridePaths.every(isOverridePath) ||
    !lexicographicallySorted(allowedOverridePaths) ||
    isNil(requiredGateProfileRefs) ||
    !lexicographicallySorted(requiredGateProfileRefs)
  ) invalid(schemaName);
  return deepFreeze({
    allowedWorldIds,
    registryLockHash: record.registryLockHash,
    capabilitySetHash: record.capabilitySetHash,
    projectionProfileRef: record.projectionProfileRef,
    allowedWorldChangeOperationTypes: parseOperationTypeArray(
      record.allowedWorldChangeOperationTypes,
      schemaName,
    ),
    allowedOverridePaths,
    requiredGateProfileRefs,
    workloadBudget: parseAuthoringEditWorkloadBudgetV1(record.workloadBudget),
  });
}

export function hashAuthoringEditPolicyProjectionV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(
    parseAuthoringEditPolicyProjectionV1(input),
  ) as Sha256HashV1;
}

function parseProfileBody(
  record: Readonly<Record<string, unknown>>,
): AiSchemaProjectionProfileBodyV1 {
  if (
    record.kind !== "ai-schema-projection-profile" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isSafePositiveInteger(record.version) ||
    !isNonEmptyString(record.resourceRef) ||
    !isSafePositiveInteger(record.maximumPropertyCount) ||
    !isSafePositiveInteger(record.maximumNestingDepth) ||
    !isSafePositiveInteger(record.maximumEnumValueCount) ||
    !isSafePositiveInteger(record.maximumSchemaBytes) ||
    !isSafePositiveInteger(record.maximumRegistrySearchResultCount) ||
    (
      record.optionalFieldMode !== "native-optional" &&
      record.optionalFieldMode !== "required-nullable-with-round-trip-map"
    )
  ) invalid(SCHEMA_PROFILE);
  return {
    kind: "ai-schema-projection-profile",
    schemaVersion: 1,
    id: record.id,
    version: record.version,
    resourceRef: record.resourceRef,
    maximumPropertyCount: record.maximumPropertyCount,
    maximumNestingDepth: record.maximumNestingDepth,
    maximumEnumValueCount: record.maximumEnumValueCount,
    maximumSchemaBytes: record.maximumSchemaBytes,
    maximumRegistrySearchResultCount: record.maximumRegistrySearchResultCount,
    optionalFieldMode: record.optionalFieldMode,
  };
}

export function parseAiSchemaProjectionProfileV1(
  input: unknown,
): AiSchemaProjectionProfileV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_PROFILE);
  if (!hasExactKeys(record, [
    "kind",
    "schemaVersion",
    "id",
    "version",
    "resourceRef",
    "maximumPropertyCount",
    "maximumNestingDepth",
    "maximumEnumValueCount",
    "maximumSchemaBytes",
    "maximumRegistrySearchResultCount",
    "optionalFieldMode",
    "contentHash",
  ]) || !isSha256(record.contentHash)) invalid(SCHEMA_PROFILE);
  const body = parseProfileBody(omit(record, "contentHash"));
  const contentHash = sha256CanonicalJson(body) as Sha256HashV1;
  if (contentHash !== record.contentHash) invalid(SCHEMA_PROFILE);
  return deepFreeze({ ...body, contentHash });
}

export function parseAiSchemaProjectionRequestV1(
  input: unknown,
): AiSchemaProjectionRequestV1 {
  const record = snapshotDataRecord(input) ?? invalid("AiSchemaProjectionRequestV1");
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "projectionProfileRef",
      "authoringSchemaVersion",
    ]) ||
    record.kind !== "worldkit-ai-schema-projection-request" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isNonEmptyString(record.projectionProfileRef) ||
    record.authoringSchemaVersion !== 4
  ) invalid("AiSchemaProjectionRequestV1");
  return deepFreeze({
    kind: "worldkit-ai-schema-projection-request",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    projectionProfileRef: record.projectionProfileRef,
    authoringSchemaVersion: 4,
  });
}

function parsePathMapping(input: unknown): AiSchemaCanonicalPathMappingV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_PROJECTION);
  if (
    !hasExactKeys(record, [
      "id",
      "mode",
      "projectionInstancePath",
      "canonicalInstancePath",
    ]) ||
    !isCanonicalId(record.id) ||
    (
      record.mode !== "identity" &&
      record.mode !== "null-to-omitted" &&
      record.mode !== "presence-wrapper"
    ) ||
    !isNonEmptyString(record.projectionInstancePath) ||
    !isNonEmptyString(record.canonicalInstancePath)
  ) invalid(SCHEMA_PROJECTION);
  return deepFreeze({
    id: record.id,
    mode: record.mode,
    projectionInstancePath: record.projectionInstancePath,
    canonicalInstancePath: record.canonicalInstancePath,
  });
}

function parseDegradation(input: unknown): AiSchemaProjectionDegradationV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_PROJECTION);
  if (
    !hasExactKeys(record, [
      "id",
      "type",
      "canonicalInstancePath",
      "resourceKind",
      "reason",
    ]) ||
    !isCanonicalId(record.id) ||
    record.type !== "registry-enum-to-resource-ref" ||
    !isNonEmptyString(record.canonicalInstancePath) ||
    !closedMember(record.resourceKind, REGISTRY_KINDS) ||
    (
      record.reason !== "property-count-budget" &&
      record.reason !== "nesting-depth-budget" &&
      record.reason !== "enum-value-count-budget" &&
      record.reason !== "schema-bytes-budget"
    )
  ) invalid(SCHEMA_PROJECTION);
  return deepFreeze({
    id: record.id,
    type: "registry-enum-to-resource-ref",
    canonicalInstancePath: record.canonicalInstancePath,
    resourceKind: record.resourceKind as RegistryResourceKindV1,
    reason: record.reason,
  });
}

export function parseAiSchemaProjectionV1(input: unknown): AiSchemaProjectionV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_PROJECTION);
  const mappingRows = snapshotDataArray(record.canonicalPathMappings) ?? invalid(SCHEMA_PROJECTION);
  const degradationRows = snapshotDataArray(record.degradations) ?? invalid(SCHEMA_PROJECTION);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "requestId",
      "projectionProfileRef",
      "projectionProfileHash",
      "authoringSchemaVersion",
      "canonicalAuthoringSchemaHash",
      "registryLockHash",
      "capabilitySetHash",
      "jsonSchemaDraft",
      "jsonSchema",
      "jsonSchemaHash",
      "allowedWorldChangeOperationTypes",
      "canonicalPathMappings",
      "degradations",
      "aiSchemaProjectionHash",
    ]) ||
    record.kind !== "worldkit-ai-schema-projection" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId) ||
    !isNonEmptyString(record.projectionProfileRef) ||
    !isSha256(record.projectionProfileHash) ||
    record.authoringSchemaVersion !== 4 ||
    !isSha256(record.canonicalAuthoringSchemaHash) ||
    !isSha256(record.registryLockHash) ||
    !isSha256(record.capabilitySetHash) ||
    record.jsonSchemaDraft !== "2020-12" ||
    !isSha256(record.jsonSchemaHash) ||
    !isSha256(record.aiSchemaProjectionHash)
  ) invalid(SCHEMA_PROJECTION);
  const jsonSchema = parseCanonicalJsonObject(record.jsonSchema, SCHEMA_PROJECTION);
  if ((sha256CanonicalJson(jsonSchema) as Sha256HashV1) !== record.jsonSchemaHash) {
    invalid(SCHEMA_PROJECTION);
  }
  const mappings = mappingRows.map(parsePathMapping);
  const degradations = degradationRows.map(parseDegradation);
  if (!uniqueIds(mappings.map((row) => row.id)) || !uniqueIds(degradations.map((row) => row.id))) {
    invalid(SCHEMA_PROJECTION);
  }
  const body = {
    kind: "worldkit-ai-schema-projection" as const,
    schemaVersion: 1 as const,
    id: record.id,
    requestId: record.requestId,
    projectionProfileRef: record.projectionProfileRef,
    projectionProfileHash: record.projectionProfileHash,
    authoringSchemaVersion: 4 as const,
    canonicalAuthoringSchemaHash: record.canonicalAuthoringSchemaHash,
    registryLockHash: record.registryLockHash,
    capabilitySetHash: record.capabilitySetHash,
    jsonSchemaDraft: "2020-12" as const,
    jsonSchema,
    jsonSchemaHash: record.jsonSchemaHash,
    allowedWorldChangeOperationTypes: parseOperationTypeArray(
      record.allowedWorldChangeOperationTypes,
      SCHEMA_PROJECTION,
    ),
    canonicalPathMappings: mappings,
    degradations,
  };
  const aiSchemaProjectionHash = sha256CanonicalJson(body) as Sha256HashV1;
  if (aiSchemaProjectionHash !== record.aiSchemaProjectionHash) invalid(SCHEMA_PROJECTION);
  return deepFreeze({ ...body, aiSchemaProjectionHash });
}

function parseAiMetadata(
  input: unknown,
): RegistrySearchResultV1["aiMetadata"] {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_SEARCH_RECEIPT);
  const semanticTags = parseStringArray(record.semanticTags, { unique: true });
  if (
    !hasRequiredAndOptionalKeys(
      record,
      ["displayName", "description", "semanticTags"],
      ["usageExamples"],
    ) ||
    !isNonEmptyString(record.displayName) ||
    !isNonEmptyString(record.description) ||
    isNil(semanticTags)
  ) invalid(SCHEMA_SEARCH_RECEIPT);
  const usageExamples = Object.hasOwn(record, "usageExamples")
    ? parseStringArray(record.usageExamples)
    : undefined;
  if (Object.hasOwn(record, "usageExamples") && isNil(usageExamples)) {
    invalid(SCHEMA_SEARCH_RECEIPT);
  }
  return deepFreeze({
    displayName: record.displayName,
    description: record.description,
    semanticTags,
    ...(usageExamples === undefined ? {} : { usageExamples }),
  });
}

export function parseRegistrySearchResultV1(input: unknown): RegistrySearchResultV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_SEARCH_RECEIPT);
  const requiredCapabilityRefs = parseStringArray(record.requiredCapabilityRefs, {
    unique: true,
  });
  if (
    !hasExactKeys(record, [
      "resourceRef",
      "resourceKind",
      "version",
      "contentHash",
      "authoringAvailability",
      "requiredCapabilityRefs",
      "aiMetadata",
    ]) ||
    !isNonEmptyString(record.resourceRef) ||
    !closedMember(record.resourceKind, REGISTRY_KINDS) ||
    !isSafePositiveInteger(record.version) ||
    !isSha256(record.contentHash) ||
    (
      record.authoringAvailability !== "recommended" &&
      record.authoringAvailability !== "advanced" &&
      record.authoringAvailability !== "experimental"
    ) ||
    isNil(requiredCapabilityRefs)
  ) invalid(SCHEMA_SEARCH_RECEIPT);
  return deepFreeze({
    resourceRef: record.resourceRef,
    resourceKind: record.resourceKind as RegistryResourceKindV1,
    version: record.version,
    contentHash: record.contentHash,
    authoringAvailability: record.authoringAvailability,
    requiredCapabilityRefs,
    aiMetadata: parseAiMetadata(record.aiMetadata),
  });
}

export function parseRegistrySearchRequestV1(
  input: unknown,
): RegistrySearchRequestV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_SEARCH_REQUEST);
  if (
    !hasRequiredAndOptionalKeys(
      record,
      [
        "kind",
        "schemaVersion",
        "id",
        "authoringEditSessionId",
        "registryLockHash",
        "resourceKind",
        "maximumResultCount",
      ],
      ["semanticTagsAll", "afterResourceRef"],
    ) ||
    record.kind !== "worldkit-registry-search-request" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isSha256(record.registryLockHash) ||
    !closedMember(record.resourceKind, REGISTRY_KINDS) ||
    !isSafePositiveInteger(record.maximumResultCount) ||
    (Object.hasOwn(record, "afterResourceRef") && !isNonEmptyString(record.afterResourceRef))
  ) invalid(SCHEMA_SEARCH_REQUEST);
  const semanticTagsAll = Object.hasOwn(record, "semanticTagsAll")
    ? parseStringArray(record.semanticTagsAll, { unique: true })
    : undefined;
  if (Object.hasOwn(record, "semanticTagsAll") && isNil(semanticTagsAll)) {
    invalid(SCHEMA_SEARCH_REQUEST);
  }
  return deepFreeze({
    kind: "worldkit-registry-search-request",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    registryLockHash: record.registryLockHash,
    resourceKind: record.resourceKind as RegistryResourceKindV1,
    maximumResultCount: record.maximumResultCount,
    ...(semanticTagsAll === undefined ? {} : { semanticTagsAll }),
    ...(isNonEmptyString(record.afterResourceRef)
      ? { afterResourceRef: record.afterResourceRef }
      : {}),
  });
}

export function parseRegistrySearchReceiptV1(
  input: unknown,
): RegistrySearchReceiptV1 {
  const record = snapshotDataRecord(input) ?? invalid(SCHEMA_SEARCH_RECEIPT);
  const resultRows = snapshotDataArray(record.results) ?? invalid(SCHEMA_SEARCH_RECEIPT);
  if (
    !hasRequiredAndOptionalKeys(
      record,
      [
        "kind",
        "schemaVersion",
        "id",
        "requestId",
        "registryLockHash",
        "results",
        "registrySearchResultHash",
      ],
      ["nextAfterResourceRef"],
    ) ||
    record.kind !== "worldkit-registry-search-receipt" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId) ||
    !isSha256(record.registryLockHash) ||
    !isSha256(record.registrySearchResultHash) ||
    (Object.hasOwn(record, "nextAfterResourceRef") &&
      !isNonEmptyString(record.nextAfterResourceRef))
  ) invalid(SCHEMA_SEARCH_RECEIPT);
  const results = resultRows.map(parseRegistrySearchResultV1);
  const refs = results.map((row) => row.resourceRef);
  if (!uniqueIds(refs) || !lexicographicallySorted(refs)) invalid(SCHEMA_SEARCH_RECEIPT);
  const parsedBody = {
    kind: "worldkit-registry-search-receipt" as const,
    schemaVersion: 1 as const,
    id: record.id,
    requestId: record.requestId,
    registryLockHash: record.registryLockHash,
    results,
    ...(isNonEmptyString(record.nextAfterResourceRef)
      ? { nextAfterResourceRef: record.nextAfterResourceRef }
      : {}),
  };
  const registrySearchResultHash = sha256CanonicalJson(parsedBody) as Sha256HashV1;
  if (registrySearchResultHash !== record.registrySearchResultHash) {
    invalid(SCHEMA_SEARCH_RECEIPT);
  }
  return deepFreeze({ ...parsedBody, registrySearchResultHash });
}

export function parsePreparedCandidatePinV1(input: unknown): PreparedCandidatePinV1 {
  const schemaName = "PreparedCandidatePinV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "preparedCandidateRef",
      "authoringEditSessionId",
      "requestId",
      "requestHash",
      "authoringEditPolicyHash",
      "pinnedAtUnixMilliseconds",
    ]) ||
    !isNonEmptyString(record.preparedCandidateRef) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isCanonicalId(record.requestId) ||
    !isSha256(record.requestHash) ||
    !isSha256(record.authoringEditPolicyHash) ||
    !isSafeNonNegativeInteger(record.pinnedAtUnixMilliseconds)
  ) invalid(schemaName);
  return deepFreeze({
    preparedCandidateRef: record.preparedCandidateRef,
    authoringEditSessionId: record.authoringEditSessionId,
    requestId: record.requestId,
    requestHash: record.requestHash,
    authoringEditPolicyHash: record.authoringEditPolicyHash,
    pinnedAtUnixMilliseconds: record.pinnedAtUnixMilliseconds,
  });
}

export function parseWorldChangeReceiptQueryV1(
  input: unknown,
): WorldChangeReceiptQueryV1 {
  const schemaName = "WorldChangeReceiptQueryV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "requestId",
    ]) ||
    record.kind !== "worldkit-world-change-receipt-query" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isCanonicalId(record.requestId)
  ) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-receipt-query",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    requestId: record.requestId,
  });
}

export function parseWorldChangeCleanupReportQueryV1(
  input: unknown,
): WorldChangeCleanupReportQueryV1 {
  const schemaName = "WorldChangeCleanupReportQueryV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "cleanupOperationId",
    ]) ||
    record.kind !== "worldkit-world-change-cleanup-report-query" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isNonEmptyString(record.cleanupOperationId)
  ) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-cleanup-report-query",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    cleanupOperationId: record.cleanupOperationId,
  });
}

export function parseWorldChangeCleanupReportV1(
  input: unknown,
): WorldChangeCleanupReportV1 {
  const schemaName = "WorldChangeCleanupReportV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "requestId",
      "cleanupOperationId",
      "previousWorldSessionId",
      "status",
      "attemptCount",
      "diagnostics",
    ]) ||
    record.kind !== "worldkit-world-change-cleanup-report" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId) ||
    !isNonEmptyString(record.cleanupOperationId) ||
    !isNonEmptyString(record.previousWorldSessionId) ||
    (
      record.status !== "scheduled" &&
      record.status !== "retrying" &&
      record.status !== "released" &&
      record.status !== "quarantined"
    ) ||
    !isSafeNonNegativeInteger(record.attemptCount)
  ) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-cleanup-report",
    schemaVersion: 1,
    id: record.id,
    requestId: record.requestId,
    cleanupOperationId: record.cleanupOperationId,
    previousWorldSessionId: record.previousWorldSessionId,
    status: record.status,
    attemptCount: record.attemptCount,
    diagnostics: parseDiagnostics(record.diagnostics),
  });
}

export function parseWorldChangeExplainRequestV1(
  input: unknown,
): WorldChangeExplainRequestV1 {
  const schemaName = "WorldChangeExplainRequestV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const selectorRecord = snapshotDataRecord(record.selector) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "requestId",
      "selector",
    ]) ||
    record.kind !== "worldkit-world-change-explain-request" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isCanonicalId(record.requestId)
  ) invalid(schemaName);
  let selector: WorldChangeExplainRequestV1["selector"];
  if (selectorRecord.mode === "summary" && hasExactKeys(selectorRecord, ["mode"])) {
    selector = { mode: "summary" };
  } else if (
    selectorRecord.mode === "operation" &&
    hasExactKeys(selectorRecord, ["mode", "operationId"]) &&
    isCanonicalId(selectorRecord.operationId)
  ) {
    selector = { mode: "operation", operationId: selectorRecord.operationId };
  } else if (
    selectorRecord.mode === "diagnostic" &&
    hasExactKeys(selectorRecord, ["mode", "diagnosticCode"]) &&
    closedMember(selectorRecord.diagnosticCode, DIAGNOSTIC_CODES)
  ) {
    selector = {
      mode: "diagnostic",
      diagnosticCode: selectorRecord.diagnosticCode as WorldChangeDiagnosticCodeV1,
    };
  } else {
    invalid(schemaName);
  }
  return deepFreeze({
    kind: "worldkit-world-change-explain-request",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    requestId: record.requestId,
    selector,
  });
}

export function parseWorldChangeExplainV1(input: unknown): WorldChangeExplainV1 {
  const schemaName = "WorldChangeExplainV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const rows = snapshotDataArray(record.explanations) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, ["kind", "schemaVersion", "id", "requestId", "explanations"]) ||
    record.kind !== "worldkit-world-change-explain" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId)
  ) invalid(schemaName);
  const explanations = rows.map((row) => {
    const item = snapshotDataRecord(row) ?? invalid(schemaName);
    const relatedIds = parseIdArray(item.relatedIds, { unique: true });
    if (
      !hasExactKeys(item, ["id", "type", "message", "relatedIds"]) ||
      !isCanonicalId(item.id) ||
      (
        item.type !== "schema-projection" &&
        item.type !== "override-policy" &&
        item.type !== "operation-effect" &&
        item.type !== "publication-selection" &&
        item.type !== "runtime-state-effect" &&
        item.type !== "conflict"
      ) ||
      !isNonEmptyString(item.message) ||
      isNil(relatedIds)
    ) invalid(schemaName);
    return {
      id: item.id,
      type: item.type as
        | "schema-projection"
        | "override-policy"
        | "operation-effect"
        | "publication-selection"
        | "runtime-state-effect"
        | "conflict",
      message: item.message,
      relatedIds,
    };
  });
  if (!uniqueIds(explanations.map((row) => row.id))) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-explain",
    schemaVersion: 1,
    id: record.id,
    requestId: record.requestId,
    explanations,
  });
}

export function parseWorldChangeDiffRequestV1(
  input: unknown,
): WorldChangeDiffRequestV1 {
  const schemaName = "WorldChangeDiffRequestV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "authoringEditSessionId",
      "requestId",
    ]) ||
    record.kind !== "worldkit-world-change-diff-request" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isNonEmptyString(record.authoringEditSessionId) ||
    !isCanonicalId(record.requestId)
  ) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-diff-request",
    schemaVersion: 1,
    id: record.id,
    authoringEditSessionId: record.authoringEditSessionId,
    requestId: record.requestId,
  });
}

export function parseWorldChangeDiffV1(input: unknown): WorldChangeDiffV1 {
  const schemaName = "WorldChangeDiffV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const changeRows = snapshotDataArray(record.changes) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "requestId",
      "baseAuthoringSpecHash",
      "resultAuthoringSpecHash",
      "changes",
    ]) ||
    record.kind !== "worldkit-world-change-diff" ||
    record.schemaVersion !== 1 ||
    !isCanonicalId(record.id) ||
    !isCanonicalId(record.requestId) ||
    !isSha256(record.baseAuthoringSpecHash) ||
    !isSha256(record.resultAuthoringSpecHash)
  ) invalid(schemaName);
  const changes = changeRows.map((row) => {
    const item = snapshotDataRecord(row) ?? invalid(schemaName);
    if (
      !hasRequiredAndOptionalKeys(
        item,
        ["id", "type", "target"],
        ["previousTargetHash", "currentTargetHash"],
      ) ||
      !isCanonicalId(item.id) ||
      (item.type !== "added" && item.type !== "removed" && item.type !== "replaced") ||
      (Object.hasOwn(item, "previousTargetHash") && !isSha256(item.previousTargetHash)) ||
      (Object.hasOwn(item, "currentTargetHash") && !isSha256(item.currentTargetHash))
    ) invalid(schemaName);
    return {
      id: item.id,
      type: item.type as "added" | "removed" | "replaced",
      target: parseWorldChangeTargetV1(item.target, schemaName),
      ...(isSha256(item.previousTargetHash)
        ? { previousTargetHash: item.previousTargetHash }
        : {}),
      ...(isSha256(item.currentTargetHash)
        ? { currentTargetHash: item.currentTargetHash }
        : {}),
    };
  });
  if (!uniqueIds(changes.map((row) => row.id))) invalid(schemaName);
  return deepFreeze({
    kind: "worldkit-world-change-diff",
    schemaVersion: 1,
    id: record.id,
    requestId: record.requestId,
    baseAuthoringSpecHash: record.baseAuthoringSpecHash,
    resultAuthoringSpecHash: record.resultAuthoringSpecHash,
    changes,
  });
}
