import {
  validateAuthoringFragmentV4,
  validatePackageSubjectDefinition,
  type AuthoringSchemaFragmentDefV4,
  type PackageSubjectDefinitionV1,
  type PlacementConstraintSpecV1,
  type PrimitivePrototypeSpecV4,
  type ProceduralTerrainSourceSpecV2,
  type RelationshipSpecV1,
  type RouteSpecV1,
  type ScreenRegionSpecV1,
  type SpatialRegionSpecV1,
  type TraversalAreaSpecV1,
  type WorldNodeSpecV4,
  type AuthoringSpecV4,
  type ConnectivityConstraintSpecV1,
} from "@whitebox-world/authoring";
import { assertCanonicalJsonValue } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  deepFreeze,
  invalid,
  snapshotDataRecord,
} from "./parse-kernel.js";

const NODE_FRAGMENT_BY_KIND = {
  object: "objectNode",
  anchor: "anchorNode",
  camera: "cameraNode",
  subject: "subjectNode",
  terrain: "terrainNode",
  water: "waterNode",
} as const;

function requireFragment<T>(
  schemaName: string,
  defName: AuthoringSchemaFragmentDefV4,
  value: unknown,
): T {
  const result = validateAuthoringFragmentV4<T>(defName, value);
  if (!result.ok || isNil(result.value)) invalid(schemaName);
  return deepFreeze(result.value);
}

export function parseWorldNodeSpecV4(
  value: unknown,
  schemaName: string,
): WorldNodeSpecV4 {
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (typeof record.kind !== "string") invalid(schemaName);
  if (!(record.kind in NODE_FRAGMENT_BY_KIND)) invalid(schemaName);
  const defName =
    NODE_FRAGMENT_BY_KIND[record.kind as keyof typeof NODE_FRAGMENT_BY_KIND];
  return requireFragment<WorldNodeSpecV4>(schemaName, defName, value);
}

export function parsePrimitivePrototypeSpecV4(
  value: unknown,
  schemaName: string,
): PrimitivePrototypeSpecV4 {
  return requireFragment<PrimitivePrototypeSpecV4>(
    schemaName,
    "prototype",
    value,
  );
}

export function parsePackageSubjectDefinitionV1(
  value: unknown,
  schemaName: string,
): PackageSubjectDefinitionV1 {
  try {
    assertCanonicalJsonValue(value);
  } catch {
    invalid(schemaName);
  }
  const result = validatePackageSubjectDefinition(value);
  if (!result.ok || isNil(result.value)) invalid(schemaName);
  return deepFreeze(result.value);
}

export function parseSpatialRegionSpecV1(
  value: unknown,
  schemaName: string,
): SpatialRegionSpecV1 {
  return requireFragment<SpatialRegionSpecV1>(schemaName, "spatialRegion", value);
}

export function parseRouteSpecV1(
  value: unknown,
  schemaName: string,
): RouteSpecV1 {
  return requireFragment<RouteSpecV1>(schemaName, "route", value);
}

export function parseScreenRegionSpecV1(
  value: unknown,
  schemaName: string,
): ScreenRegionSpecV1 {
  return requireFragment<ScreenRegionSpecV1>(schemaName, "screenRegion", value);
}

export function parseTraversalAreaSpecV1(
  value: unknown,
  schemaName: string,
): TraversalAreaSpecV1 {
  return requireFragment<TraversalAreaSpecV1>(schemaName, "traversalArea", value);
}

export function parseRelationshipSpecV1(
  value: unknown,
  schemaName: string,
): RelationshipSpecV1 {
  return requireFragment<RelationshipSpecV1>(schemaName, "relationship", value);
}

export function parsePlacementConstraintSpecV1(
  value: unknown,
  schemaName: string,
): PlacementConstraintSpecV1 {
  return requireFragment<PlacementConstraintSpecV1>(
    schemaName,
    "placementConstraint",
    value,
  );
}

export function parseConnectivityConstraintSpecV1(
  value: unknown,
  schemaName: string,
): ConnectivityConstraintSpecV1 {
  return requireFragment<ConnectivityConstraintSpecV1>(
    schemaName,
    "connectivityConstraint",
    value,
  );
}

export function parseProceduralTerrainSourceSpecV2(
  value: unknown,
  schemaName: string,
): ProceduralTerrainSourceSpecV2 {
  return requireFragment<ProceduralTerrainSourceSpecV2>(
    schemaName,
    "proceduralSource",
    value,
  );
}

export function parseStartupSpecV4(
  value: unknown,
  schemaName: string,
): AuthoringSpecV4["startup"] {
  return requireFragment<AuthoringSpecV4["startup"]>(schemaName, "startup", value);
}
