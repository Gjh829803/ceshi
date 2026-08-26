import {
  hashAuthoringDocumentV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
  type ConnectivityConstraintSpecV1,
  type DefinitionResourceRefOverrideV1,
  type PackageSubjectDefinitionV1,
  type PlacementConstraintSpecV1,
  type PrimitivePrototypeSpecV4,
  type RelationshipSpecV1,
  type RouteSpecV1,
  type ScreenRegionSpecV1,
  type SpatialRegionSpecV1,
  type TraversalAreaSpecV1,
  type WorldNodeSpecV4,
} from "@whitebox-world/authoring";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy } from "lodash-es";

import { parseWorldChangeAffectedIdsV1, parseWorldChangeDiagnosticV1, parseWorldChangeDiffV1 } from "../authoring-edit.js";
import { deepFreeze, type Sha256HashV1 } from "../parse-kernel.js";
import type {
  AuthoringEditBudgetIdV1,
  AuthoringEditWorkloadBudgetV1,
  WorldChangeAffectedIdsV1,
  WorldChangeDiagnosticDetailsV1,
  WorldChangeDiagnosticV1,
  WorldChangeDiffV1,
  WorldChangeFailurePhaseV1,
  WorldChangeOperationResultV1,
  WorldChangeOperationV1,
  WorldChangeSetV1,
  WorldChangeTargetV1,
  WorldPreconditionV1,
} from "../types.js";
import {
  hashTargetValue,
  lookupTargetValue,
  operationPrimaryTarget,
  operationsConflict,
  targetOverlapKey,
} from "./targets.js";

export interface WorldChangeAdmissionUsageV1 {
  readonly concurrentNonTerminalRequestCount: number;
  readonly preparedCandidateCount: number;
  readonly preparedCandidateBytes: number;
  readonly preparedCandidateRetentionMilliseconds: number;
}

export interface ApplyWorldChangeSetInputV1 {
  readonly baseAuthoringSpec: AuthoringSpecV4;
  readonly changeSet: WorldChangeSetV1;
  readonly workloadBudget: AuthoringEditWorkloadBudgetV1;
  readonly admissionUsage?: WorldChangeAdmissionUsageV1;
}

export type ApplyWorldChangeSetResultV1 =
  | {
      readonly status: "applied";
      readonly candidateAuthoringSpec: AuthoringSpecV4;
      readonly baseAuthoringSpecHash: Sha256HashV1;
      readonly resultAuthoringSpecHash: Sha256HashV1;
      readonly affectedIds: WorldChangeAffectedIdsV1;
      readonly operationResults: readonly WorldChangeOperationResultV1[];
      readonly changes: WorldChangeDiffV1["changes"];
    }
  | {
      readonly status: "rejected";
      readonly failurePhase: WorldChangeFailurePhaseV1;
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
      readonly currentAuthoringSpecHash?: Sha256HashV1;
      readonly conflictingIds?: WorldChangeAffectedIdsV1;
    };

export function isAppliedWorldChangeSetResultV1(
  result: ApplyWorldChangeSetResultV1,
): result is Extract<ApplyWorldChangeSetResultV1, { status: "applied" }> {
  return result.status === "applied";
}

export function assembleWorldChangeDiffV1(input: {
  readonly id: string;
  readonly requestId: string;
  readonly applied: Extract<ApplyWorldChangeSetResultV1, { status: "applied" }>;
}): WorldChangeDiffV1 {
  return parseWorldChangeDiffV1({
    kind: "worldkit-world-change-diff",
    schemaVersion: 1,
    id: input.id,
    requestId: input.requestId,
    baseAuthoringSpecHash: input.applied.baseAuthoringSpecHash,
    resultAuthoringSpecHash: input.applied.resultAuthoringSpecHash,
    changes: input.applied.changes,
  });
}

export function applyWorldChangeSetV1(
  input: ApplyWorldChangeSetInputV1,
): ApplyWorldChangeSetResultV1 {
  const base = input.baseAuthoringSpec;
  const changeSet = input.changeSet;
  const worldId = base.id;
  const currentAuthoringSpecHash = hashAuthoringDocumentV4(base) as Sha256HashV1;

  const admissionDiagnostics = admitWorkload(
    changeSet,
    input.workloadBudget,
    input.admissionUsage,
  );
  if (!isEmpty(admissionDiagnostics)) {
    return rejected("admission", admissionDiagnostics);
  }

  if (changeSet.baseAuthoringSpecHash !== currentAuthoringSpecHash) {
    return rejected(
      "base-check",
      [
        diagnostic(
          "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
          "/baseAuthoringSpecHash",
          "ChangeSet baseAuthoringSpecHash does not match the provided AuthoringSpec.",
          {
            kind: "hash-mismatch",
            expectedHash: changeSet.baseAuthoringSpecHash,
            actualHash: currentAuthoringSpecHash,
          },
        ),
      ],
      {
        currentAuthoringSpecHash,
        conflictingIds: affectedIdsFromOperations(changeSet.operations, worldId),
      },
    );
  }

  const preconditionDiagnostics = changeSet.preconditions.flatMap(
    (precondition, index) => {
      const failure = evaluatePrecondition(base, precondition);
      if (isNil(failure)) return [];
      return [
        diagnostic(
          "WORLD_CHANGE_PRECONDITION_FAILED",
          `/preconditions/${index}`,
          failure,
          { kind: "related-ids", ids: [precondition.id] },
        ),
      ];
    },
  );
  if (!isEmpty(preconditionDiagnostics)) {
    return rejected("precondition", preconditionDiagnostics, {
      currentAuthoringSpecHash,
    });
  }

  const conflict = collectConflicts(changeSet.operations, worldId);
  if (!isNil(conflict)) {
    return rejected(
      "candidate-apply",
      [
        diagnostic(
          "WORLD_CHANGE_TARGET_CONFLICT",
          "/operations",
          `Operations [${conflict.operationIds.join(", ")}] write overlapping Canonical targets.`,
          { kind: "target-conflict", targets: conflict.targets },
        ),
      ],
      {
        currentAuthoringSpecHash,
        conflictingIds: conflict.affectedIds,
      },
    );
  }

  let candidate = structuredClone(base);
  const applyDiagnostics: WorldChangeDiagnosticV1[] = [];
  changeSet.operations.forEach((operation, index) => {
    if (!isEmpty(applyDiagnostics)) return;
    const next = applyOperation(candidate, operation);
    if (!isAppliedDraft(next)) {
      applyDiagnostics.push(
        diagnostic(
          "WORLD_CHANGE_CANDIDATE_INVALID",
          `/operations/${index}`,
          next.message,
          { kind: "related-ids", ids: [operation.id] },
        ),
      );
      return;
    }
    candidate = next.spec;
  });
  if (!isEmpty(applyDiagnostics)) {
    return rejected("candidate-apply", applyDiagnostics, {
      currentAuthoringSpecHash,
    });
  }

  const validation = validateAuthoringSpecV4(candidate);
  if (!validation.ok || isNil(validation.value)) {
    return rejected(
      "canonical-validation",
      validation.diagnostics.map((item) =>
        diagnostic(
          item.code === "AUTHORING_REFERENCE_NOT_FOUND" ||
            item.code === "AUTHORING_REFERENCE_KIND_MISMATCH"
            ? "WORLD_CHANGE_REFERENCE_DANGLING"
            : "WORLD_CHANGE_CANDIDATE_INVALID",
          item.instancePath,
          item.message,
        ),
      ),
      { currentAuthoringSpecHash },
    );
  }

  const resultSpec = validation.value;
  const resultAuthoringSpecHash = hashAuthoringDocumentV4(resultSpec) as Sha256HashV1;
  const operationResults = changeSet.operations.map((operation) => {
    const target = operationPrimaryTarget(operation, worldId);
    const previousTargetHash = hashTargetValue(lookupTargetValue(base, target));
    const currentTargetHash = hashTargetValue(lookupTargetValue(resultSpec, target));
    return {
      operationId: operation.id,
      operationType: operation.type,
      target,
      status: "applied" as const,
      ...(isNil(previousTargetHash) ? {} : { previousTargetHash }),
      ...(isNil(currentTargetHash) ? {} : { currentTargetHash }),
    };
  });
  const changes = changeSet.operations.map((operation, index) => {
    const target = operationPrimaryTarget(operation, worldId);
    const previousTargetHash = hashTargetValue(lookupTargetValue(base, target));
    const currentTargetHash = hashTargetValue(lookupTargetValue(resultSpec, target));
    const type: "added" | "removed" | "replaced" = isNil(previousTargetHash)
      ? "added"
      : isNil(currentTargetHash)
        ? "removed"
        : "replaced";
    return {
      id: `chg.${index}`,
      type,
      target,
      ...(isNil(previousTargetHash) ? {} : { previousTargetHash }),
      ...(isNil(currentTargetHash) ? {} : { currentTargetHash }),
    };
  });

  return deepFreeze({
    status: "applied",
    candidateAuthoringSpec: resultSpec,
    baseAuthoringSpecHash: currentAuthoringSpecHash,
    resultAuthoringSpecHash,
    affectedIds: affectedIdsFromOperations(changeSet.operations, worldId),
    operationResults,
    changes,
  });
}

function admitWorkload(
  changeSet: WorldChangeSetV1,
  budget: AuthoringEditWorkloadBudgetV1,
  usage: WorldChangeAdmissionUsageV1 | undefined,
): readonly WorldChangeDiagnosticV1[] {
  const changeSetBytes = canonicalJsonBytes(changeSet).byteLength;
  const diagnostics: WorldChangeDiagnosticV1[] = [];
  pushBudget(
    diagnostics,
    "change-set-bytes",
    "/",
    budget.maximumChangeSetBytes,
    changeSetBytes,
  );
  pushBudget(
    diagnostics,
    "precondition-count",
    "/preconditions",
    budget.maximumPreconditionCount,
    changeSet.preconditions.length,
  );
  pushBudget(
    diagnostics,
    "operation-count",
    "/operations",
    budget.maximumOperationCount,
    changeSet.operations.length,
  );
  if (isNil(usage)) return diagnostics;
  pushBudget(
    diagnostics,
    "concurrent-non-terminal-request-count",
    "/",
    budget.maximumConcurrentNonTerminalRequestCount,
    usage.concurrentNonTerminalRequestCount,
  );
  pushBudget(
    diagnostics,
    "prepared-candidate-count",
    "/",
    budget.maximumPreparedCandidateCount,
    usage.preparedCandidateCount,
  );
  pushBudget(
    diagnostics,
    "prepared-candidate-bytes",
    "/",
    budget.maximumPreparedCandidateBytes,
    usage.preparedCandidateBytes,
  );
  pushBudget(
    diagnostics,
    "prepared-candidate-retention-milliseconds",
    "/",
    budget.maximumPreparedCandidateRetentionMilliseconds,
    usage.preparedCandidateRetentionMilliseconds,
  );
  return diagnostics;
}

function pushBudget(
  diagnostics: WorldChangeDiagnosticV1[],
  budgetId: AuthoringEditBudgetIdV1,
  instancePath: string,
  limit: number,
  actual: number,
): void {
  if (actual <= limit) return;
  diagnostics.push(
    diagnostic(
      "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
      instancePath,
      `Authoring/Edit workload budget '${budgetId}' was exceeded.`,
      { kind: "admission-budget", budgetId, limit, actual },
    ),
  );
}

function evaluatePrecondition(
  spec: AuthoringSpecV4,
  precondition: WorldPreconditionV1,
): string | undefined {
  const value = lookupTargetValue(spec, precondition.target);
  if (precondition.type === "target-exists") {
    return isNil(value)
      ? `Precondition '${precondition.id}' required a present target.`
      : undefined;
  }
  if (precondition.type === "target-absent") {
    return isNil(value)
      ? undefined
      : `Precondition '${precondition.id}' required an absent target.`;
  }
  if (isNil(value)) {
    return `Precondition '${precondition.id}' could not hash an absent target.`;
  }
  const actualHash = hashTargetValue(value);
  return actualHash === precondition.expectedTargetHash
    ? undefined
    : `Precondition '${precondition.id}' target hash does not match.`;
}

function collectConflicts(
  operations: readonly WorldChangeOperationV1[],
  worldId: string,
): {
  readonly operationIds: readonly string[];
  readonly targets: readonly WorldChangeTargetV1[];
  readonly affectedIds: WorldChangeAffectedIdsV1;
} | undefined {
  const conflictingIds = new Set<string>();
  const targetsByKey = new Map<string, WorldChangeTargetV1>();
  operations.forEach((left, leftIndex) => {
    operations.slice(leftIndex + 1).forEach((right) => {
      if (!operationsConflict(left, right, worldId)) return;
      conflictingIds.add(left.id);
      conflictingIds.add(right.id);
      const leftTarget = operationPrimaryTarget(left, worldId);
      const rightTarget = operationPrimaryTarget(right, worldId);
      targetsByKey.set(targetOverlapKey(leftTarget), leftTarget);
      targetsByKey.set(targetOverlapKey(rightTarget), rightTarget);
    });
  });
  if (conflictingIds.size === 0) return undefined;
  const conflictingOperations = operations.filter((operation) =>
    conflictingIds.has(operation.id),
  );
  return {
    operationIds: sortBy([...conflictingIds]),
    targets: [...targetsByKey.values()],
    affectedIds: affectedIdsFromOperations(conflictingOperations, worldId),
  };
}

type ApplyDraftResult =
  | { readonly spec: AuthoringSpecV4 }
  | { readonly message: string };

function isAppliedDraft(
  value: ApplyDraftResult,
): value is { readonly spec: AuthoringSpecV4 } {
  return "spec" in value;
}

function applyOperation(
  spec: AuthoringSpecV4,
  operation: WorldChangeOperationV1,
): ApplyDraftResult {
  switch (operation.type) {
    case "resource-upsert":
      return operation.resourceKind === "prototype"
        ? {
            spec: withPrototypes(
              spec,
              upsertById([...spec.resources.prototypes], operation.prototype),
            ),
          }
        : {
            spec: withSubjectDefinitions(
              spec,
              upsertById(
                [...spec.resources.subjectDefinitions],
                operation.subjectDefinition,
              ),
            ),
          };
    case "resource-remove":
      return removeResource(spec, operation.resourceKind, operation.resourceId);
    case "node-upsert":
      return { spec: { ...spec, nodes: upsertById([...spec.nodes], operation.node) } };
    case "node-remove":
      return removeFromCollection(spec, "nodes", spec.nodes, operation.nodeEntityId, "Node");
    case "spatial-feature-upsert":
      return upsertSpatial(spec, operation);
    case "spatial-feature-remove":
      return removeSpatial(spec, operation.spatialFeatureKind, operation.spatialFeatureId);
    case "relationship-add":
      if (!isNil(spec.relationships.find((item) => item.id === operation.relationship.id))) {
        return { message: `Relationship '${operation.relationship.id}' already exists.` };
      }
      return {
        spec: {
          ...spec,
          relationships: [...spec.relationships, operation.relationship],
        },
      };
    case "relationship-remove":
      return removeFromCollection(
        spec,
        "relationships",
        spec.relationships,
        operation.relationshipId,
        "Relationship",
      );
    case "constraint-set":
      return upsertConstraint(spec, operation);
    case "constraint-remove":
      return removeConstraint(spec, operation.constraintKind, operation.constraintId);
    case "terrain-source-replace":
      return replaceTerrainSource(spec, operation);
    case "startup-set":
      return { spec: { ...spec, startup: operation.startup } };
    case "definition-override-set":
      return setOverride(spec, operation.nodeEntityId, operation.override);
    case "definition-override-remove":
      return removeOverride(spec, operation.nodeEntityId, operation.overrideId);
  }
}

function removeResource(
  spec: AuthoringSpecV4,
  resourceKind: "prototype" | "subject-definition",
  resourceId: string,
): ApplyDraftResult {
  if (resourceKind === "prototype") {
    const next = spec.resources.prototypes.filter((item) => item.id !== resourceId);
    if (next.length === spec.resources.prototypes.length) {
      return { message: `Prototype '${resourceId}' does not exist.` };
    }
    return { spec: withPrototypes(spec, next) };
  }
  const next = spec.resources.subjectDefinitions.filter((item) => item.id !== resourceId);
  if (next.length === spec.resources.subjectDefinitions.length) {
    return { message: `Subject Definition '${resourceId}' does not exist.` };
  }
  return { spec: withSubjectDefinitions(spec, next) };
}

function upsertSpatial(
  spec: AuthoringSpecV4,
  operation: Extract<WorldChangeOperationV1, { type: "spatial-feature-upsert" }>,
): ApplyDraftResult {
  switch (operation.spatialFeatureKind) {
    case "region":
      return {
        spec: withSpatial(spec, {
          regions: upsertById([...spec.spatial.regions], operation.spatialRegion),
        }),
      };
    case "route":
      return {
        spec: withSpatial(spec, {
          routes: upsertById([...spec.spatial.routes], operation.route),
        }),
      };
    case "screen-region":
      return {
        spec: withSpatial(spec, {
          screenRegions: upsertById(
            [...spec.spatial.screenRegions],
            operation.screenRegion,
          ),
        }),
      };
    case "traversal-area":
      return {
        spec: withSpatial(spec, {
          traversalAreas: upsertById(
            [...spec.spatial.traversalAreas],
            operation.traversalArea,
          ),
        }),
      };
  }
}

function removeSpatial(
  spec: AuthoringSpecV4,
  kind: Extract<WorldChangeOperationV1, { type: "spatial-feature-remove" }>["spatialFeatureKind"],
  spatialFeatureId: string,
): ApplyDraftResult {
  switch (kind) {
    case "region":
      return removeNamed(
        spec.spatial.regions,
        spatialFeatureId,
        "Region",
        (items) => withSpatial(spec, { regions: items }),
      );
    case "route":
      return removeNamed(
        spec.spatial.routes,
        spatialFeatureId,
        "Route",
        (items) => withSpatial(spec, { routes: items }),
      );
    case "screen-region":
      return removeNamed(
        spec.spatial.screenRegions,
        spatialFeatureId,
        "Screen Region",
        (items) => withSpatial(spec, { screenRegions: items }),
      );
    case "traversal-area":
      return removeNamed(
        spec.spatial.traversalAreas,
        spatialFeatureId,
        "Traversal Area",
        (items) => withSpatial(spec, { traversalAreas: items }),
      );
  }
}

function upsertConstraint(
  spec: AuthoringSpecV4,
  operation: Extract<WorldChangeOperationV1, { type: "constraint-set" }>,
): ApplyDraftResult {
  return operation.constraintKind === "placement"
    ? {
        spec: withConstraints(spec, {
          placements: upsertById(
            [...spec.constraints.placements],
            operation.placementConstraint,
          ),
        }),
      }
    : {
        spec: withConstraints(spec, {
          connectivity: upsertById(
            [...spec.constraints.connectivity],
            operation.connectivityConstraint,
          ),
        }),
      };
}

function removeConstraint(
  spec: AuthoringSpecV4,
  kind: "placement" | "connectivity",
  constraintId: string,
): ApplyDraftResult {
  return kind === "placement"
    ? removeNamed(
        spec.constraints.placements,
        constraintId,
        "Placement constraint",
        (items) => withConstraints(spec, { placements: items }),
      )
    : removeNamed(
        spec.constraints.connectivity,
        constraintId,
        "Connectivity constraint",
        (items) => withConstraints(spec, { connectivity: items }),
      );
}

function replaceTerrainSource(
  spec: AuthoringSpecV4,
  operation: Extract<WorldChangeOperationV1, { type: "terrain-source-replace" }>,
): ApplyDraftResult {
  const node = spec.nodes.find((item) => item.id === operation.terrainEntityId);
  if (isNil(node)) {
    return { message: `Terrain node '${operation.terrainEntityId}' does not exist.` };
  }
  if (node.kind !== "terrain") {
    return { message: `Node '${operation.terrainEntityId}' is not a Terrain node.` };
  }
  const nextNode: WorldNodeSpecV4 = {
    ...node,
    components: {
      terrain: {
        ...node.components.terrain,
        source: operation.terrainSource,
      },
    },
  };
  return {
    spec: {
      ...spec,
      nodes: spec.nodes.map((item) =>
        item.id === operation.terrainEntityId ? nextNode : item,
      ),
    },
  };
}

function setOverride(
  spec: AuthoringSpecV4,
  nodeEntityId: string,
  override: DefinitionResourceRefOverrideV1,
): ApplyDraftResult {
  const node = spec.nodes.find((item) => item.id === nodeEntityId);
  if (isNil(node)) {
    return { message: `Subject node '${nodeEntityId}' does not exist.` };
  }
  if (node.kind !== "subject") {
    return { message: `Node '${nodeEntityId}' is not a Subject node.` };
  }
  const current = node.overrides ?? [];
  const nextNode: WorldNodeSpecV4 = {
    ...node,
    overrides: upsertById([...current], override),
  };
  return {
    spec: {
      ...spec,
      nodes: spec.nodes.map((item) => (item.id === nodeEntityId ? nextNode : item)),
    },
  };
}

function removeOverride(
  spec: AuthoringSpecV4,
  nodeEntityId: string,
  overrideId: string,
): ApplyDraftResult {
  const node = spec.nodes.find((item) => item.id === nodeEntityId);
  if (isNil(node)) {
    return { message: `Subject node '${nodeEntityId}' does not exist.` };
  }
  if (node.kind !== "subject") {
    return { message: `Node '${nodeEntityId}' is not a Subject node.` };
  }
  const current = node.overrides ?? [];
  if (isNil(current.find((item) => item.id === overrideId))) {
    return { message: `Override '${overrideId}' does not exist on '${nodeEntityId}'.` };
  }
  const remaining = current.filter((item) => item.id !== overrideId);
  const nextNode: WorldNodeSpecV4 = isEmpty(remaining)
    ? omitOverrides(node)
    : { ...node, overrides: remaining };
  return {
    spec: {
      ...spec,
      nodes: spec.nodes.map((item) => (item.id === nodeEntityId ? nextNode : item)),
    },
  };
}

function omitOverrides(
  node: Extract<WorldNodeSpecV4, { kind: "subject" }>,
): Extract<WorldNodeSpecV4, { kind: "subject" }> {
  const { overrides: _overrides, ...rest } = node;
  return rest;
}

function removeFromCollection(
  spec: AuthoringSpecV4,
  key: "nodes" | "relationships",
  items: readonly { readonly id: string }[],
  id: string,
  label: string,
): ApplyDraftResult {
  return removeNamed(items, id, label, (next) =>
    key === "nodes"
      ? { ...spec, nodes: next as WorldNodeSpecV4[] }
      : { ...spec, relationships: next as RelationshipSpecV1[] },
  );
}

function removeNamed<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  label: string,
  replace: (next: T[]) => AuthoringSpecV4,
): ApplyDraftResult {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) {
    return { message: `${label} '${id}' does not exist.` };
  }
  return { spec: replace(next) };
}

function withPrototypes(
  spec: AuthoringSpecV4,
  prototypes: PrimitivePrototypeSpecV4[],
): AuthoringSpecV4 {
  return { ...spec, resources: { ...spec.resources, prototypes } };
}

function withSubjectDefinitions(
  spec: AuthoringSpecV4,
  subjectDefinitions: PackageSubjectDefinitionV1[],
): AuthoringSpecV4 {
  return { ...spec, resources: { ...spec.resources, subjectDefinitions } };
}

function withSpatial(
  spec: AuthoringSpecV4,
  patch: Partial<{
    regions: SpatialRegionSpecV1[];
    routes: RouteSpecV1[];
    screenRegions: ScreenRegionSpecV1[];
    traversalAreas: TraversalAreaSpecV1[];
  }>,
): AuthoringSpecV4 {
  return { ...spec, spatial: { ...spec.spatial, ...patch } };
}

function withConstraints(
  spec: AuthoringSpecV4,
  patch: Partial<{
    placements: PlacementConstraintSpecV1[];
    connectivity: ConnectivityConstraintSpecV1[];
  }>,
): AuthoringSpecV4 {
  return { ...spec, constraints: { ...spec.constraints, ...patch } };
}

function upsertById<T extends { readonly id: string }>(
  items: T[],
  next: T,
): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function affectedIdsFromOperations(
  operations: readonly WorldChangeOperationV1[],
  worldId: string,
): WorldChangeAffectedIdsV1 {
  const resourceIds = new Set<string>();
  const nodeEntityIds = new Set<string>();
  const relationshipIds = new Set<string>();
  const spatialFeatureIds = new Set<string>();
  const constraintIds = new Set<string>();
  const overrideIds = new Set<string>();
  for (const operation of operations) {
    const target = operationPrimaryTarget(operation, worldId);
    switch (target.kind) {
      case "resource":
        resourceIds.add(target.resourceId);
        break;
      case "node":
        nodeEntityIds.add(target.nodeEntityId);
        break;
      case "relationship":
        relationshipIds.add(target.relationshipId);
        break;
      case "spatial-feature":
        spatialFeatureIds.add(target.spatialFeatureId);
        break;
      case "constraint":
        constraintIds.add(target.constraintId);
        break;
      case "definition-override":
        nodeEntityIds.add(target.nodeEntityId);
        overrideIds.add(target.overrideId);
        break;
      case "startup":
        break;
    }
  }
  return parseWorldChangeAffectedIdsV1({
    resourceIds: sortBy([...resourceIds]),
    nodeEntityIds: sortBy([...nodeEntityIds]),
    relationshipIds: sortBy([...relationshipIds]),
    spatialFeatureIds: sortBy([...spatialFeatureIds]),
    constraintIds: sortBy([...constraintIds]),
    overrideIds: sortBy([...overrideIds]),
  });
}

function diagnostic(
  code: WorldChangeDiagnosticV1["code"],
  instancePath: string,
  message: string,
  details?: WorldChangeDiagnosticDetailsV1,
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
    ...(isNil(details) ? {} : { details }),
  });
}

function rejected(
  failurePhase: WorldChangeFailurePhaseV1,
  diagnostics: readonly WorldChangeDiagnosticV1[],
  extras: {
    readonly currentAuthoringSpecHash?: Sha256HashV1;
    readonly conflictingIds?: WorldChangeAffectedIdsV1;
  } = {},
): ApplyWorldChangeSetResultV1 {
  return deepFreeze({
    status: "rejected",
    failurePhase,
    diagnostics,
    ...(isNil(extras.currentAuthoringSpecHash)
      ? {}
      : { currentAuthoringSpecHash: extras.currentAuthoringSpecHash }),
    ...(isNil(extras.conflictingIds) ? {} : { conflictingIds: extras.conflictingIds }),
  });
}
