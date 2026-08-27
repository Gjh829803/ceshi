import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type { Sha256HashV1 } from "../parse-kernel.js";
import type {
  ConstraintKindV1,
  SpatialFeatureKindV1,
  WorldChangeOperationV1,
  WorldChangeTargetV1,
} from "../types.js";

export function targetOverlapKey(target: WorldChangeTargetV1): string {
  switch (target.kind) {
    case "resource":
      return `resource/${target.resourceKind}/${target.resourceId}`;
    case "node":
      return `node/${target.nodeEntityId}`;
    case "spatial-feature":
      return `spatial/${target.spatialFeatureKind}/${target.spatialFeatureId}`;
    case "relationship":
      return `relationship/${target.relationshipId}`;
    case "constraint":
      return `constraint/${target.constraintKind}/${target.constraintId}`;
    case "definition-override":
      return `override/${target.nodeEntityId}/${target.overrideId}`;
    case "startup":
      return `startup/${target.worldId}`;
  }
}

export function spatialFeatureIdOf(
  operation: Extract<WorldChangeOperationV1, { type: "spatial-feature-upsert" }>,
): string {
  switch (operation.spatialFeatureKind) {
    case "region":
      return operation.spatialRegion.id;
    case "route":
      return operation.route.id;
    case "screen-region":
      return operation.screenRegion.id;
    case "traversal-area":
      return operation.traversalArea.id;
  }
}

export function constraintIdOf(
  operation: Extract<WorldChangeOperationV1, { type: "constraint-set" }>,
): string {
  return operation.constraintKind === "placement"
    ? operation.placementConstraint.id
    : operation.connectivityConstraint.id;
}

export function resourceIdOf(
  operation: Extract<WorldChangeOperationV1, { type: "resource-upsert" }>,
): string {
  return operation.resourceKind === "prototype"
    ? operation.prototype.id
    : operation.subjectDefinition.id;
}

export function operationPrimaryTarget(
  operation: WorldChangeOperationV1,
  worldId: string,
): WorldChangeTargetV1 {
  switch (operation.type) {
    case "resource-upsert":
      return {
        kind: "resource",
        resourceKind: operation.resourceKind,
        resourceId: resourceIdOf(operation),
      };
    case "resource-remove":
      return {
        kind: "resource",
        resourceKind: operation.resourceKind,
        resourceId: operation.resourceId,
      };
    case "node-upsert":
      return { kind: "node", nodeEntityId: operation.node.id };
    case "node-remove":
      return { kind: "node", nodeEntityId: operation.nodeEntityId };
    case "spatial-feature-upsert":
      return {
        kind: "spatial-feature",
        spatialFeatureKind: operation.spatialFeatureKind,
        spatialFeatureId: spatialFeatureIdOf(operation),
      };
    case "spatial-feature-remove":
      return {
        kind: "spatial-feature",
        spatialFeatureKind: operation.spatialFeatureKind,
        spatialFeatureId: operation.spatialFeatureId,
      };
    case "relationship-add":
      return { kind: "relationship", relationshipId: operation.relationship.id };
    case "relationship-remove":
      return { kind: "relationship", relationshipId: operation.relationshipId };
    case "constraint-set":
      return {
        kind: "constraint",
        constraintKind: operation.constraintKind,
        constraintId: constraintIdOf(operation),
      };
    case "constraint-remove":
      return {
        kind: "constraint",
        constraintKind: operation.constraintKind,
        constraintId: operation.constraintId,
      };
    case "terrain-source-replace":
      return { kind: "node", nodeEntityId: operation.terrainEntityId };
    case "startup-set":
      return { kind: "startup", worldId };
    case "definition-override-set":
      return {
        kind: "definition-override",
        nodeEntityId: operation.nodeEntityId,
        overrideId: operation.override.id,
      };
    case "definition-override-remove":
      return {
        kind: "definition-override",
        nodeEntityId: operation.nodeEntityId,
        overrideId: operation.overrideId,
      };
  }
}

export function isNodeStructureWrite(operation: WorldChangeOperationV1): boolean {
  return (
    operation.type === "node-upsert" ||
    operation.type === "node-remove" ||
    operation.type === "terrain-source-replace"
  );
}

export function isOverrideWrite(operation: WorldChangeOperationV1): boolean {
  return (
    operation.type === "definition-override-set" ||
    operation.type === "definition-override-remove"
  );
}

export function nodeWriteEntityId(
  operation: WorldChangeOperationV1,
): string | undefined {
  switch (operation.type) {
    case "node-upsert":
      return operation.node.id;
    case "node-remove":
      return operation.nodeEntityId;
    case "terrain-source-replace":
      return operation.terrainEntityId;
    case "definition-override-set":
    case "definition-override-remove":
      return operation.nodeEntityId;
    default:
      return undefined;
  }
}

export function operationsConflict(
  left: WorldChangeOperationV1,
  right: WorldChangeOperationV1,
  worldId: string,
): boolean {
  if (left.id === right.id) return false;
  const leftKey = targetOverlapKey(operationPrimaryTarget(left, worldId));
  const rightKey = targetOverlapKey(operationPrimaryTarget(right, worldId));
  if (leftKey === rightKey) return true;
  const leftNodeId = nodeWriteEntityId(left);
  const rightNodeId = nodeWriteEntityId(right);
  if (isNil(leftNodeId) || isNil(rightNodeId) || leftNodeId !== rightNodeId) {
    return false;
  }
  return (
    (isNodeStructureWrite(left) && isOverrideWrite(right)) ||
    (isOverrideWrite(left) && isNodeStructureWrite(right))
  );
}

export function lookupTargetValue(
  spec: AuthoringSpecV4,
  target: WorldChangeTargetV1,
): unknown {
  switch (target.kind) {
    case "resource":
      return target.resourceKind === "prototype"
        ? spec.resources.prototypes.find((item) => item.id === target.resourceId)
        : spec.resources.subjectDefinitions.find((item) => item.id === target.resourceId);
    case "node":
      return spec.nodes.find((item) => item.id === target.nodeEntityId);
    case "spatial-feature":
      return spatialCollection(spec, target.spatialFeatureKind).find(
        (item) => item.id === target.spatialFeatureId,
      );
    case "relationship":
      return spec.relationships.find((item) => item.id === target.relationshipId);
    case "constraint":
      return constraintCollection(spec, target.constraintKind).find(
        (item) => item.id === target.constraintId,
      );
    case "definition-override": {
      const node = spec.nodes.find((item) => item.id === target.nodeEntityId);
      if (isNil(node) || node.kind !== "subject") return undefined;
      return node.overrides?.find((item) => item.id === target.overrideId);
    }
    case "startup":
      return target.worldId === spec.id ? spec.startup : undefined;
  }
}

export function hashTargetValue(value: unknown): Sha256HashV1 | undefined {
  if (isNil(value)) return undefined;
  return sha256CanonicalJson(value) as Sha256HashV1;
}

export function spatialCollection(
  spec: AuthoringSpecV4,
  kind: SpatialFeatureKindV1,
): readonly { readonly id: string }[] {
  switch (kind) {
    case "region":
      return spec.spatial.regions;
    case "route":
      return spec.spatial.routes;
    case "screen-region":
      return spec.spatial.screenRegions;
    case "traversal-area":
      return spec.spatial.traversalAreas;
  }
}

export function constraintCollection(
  spec: AuthoringSpecV4,
  kind: ConstraintKindV1,
): readonly { readonly id: string }[] {
  return kind === "placement"
    ? spec.constraints.placements
    : spec.constraints.connectivity;
}
