import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

import type {
  ResolvedTraversalDriverProfileV1,
  ResolvedTraversalGraphBuilderProfile,
  ResolvedTraversalGraphBuilderProfileV1,
  ResolvedTraversalGraphBuilderProfileV2,
  ResolvedTraversalSurfaceProfileV1,
  TraversalDriverProfileV1,
  TraversalGraphBuilderProfileV1,
  TraversalGraphBuilderProfileV2,
  TraversalSurfaceProfileV1,
} from "./types.js";

export const BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF =
  "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1" as const;

export const BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF =
  "worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@1" as const;

export const BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF =
  "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1" as const;

export const BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF =
  "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1-low-budget@1" as const;

export const BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF =
  "worldkit://traversal-surface-profile/ground.static@1" as const;

const TRAVERSAL_DRIVER_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "pathLookaheadMetersXZ",
  "cornerSelectionMode",
  "intentDirectionQuantizationRatio",
  "locomotionIntentMode",
] as const;

const TRAVERSAL_DRIVER_PROFILE_ALLOWED_KEYS = new Set(
  TRAVERSAL_DRIVER_PROFILE_REQUIRED_KEYS,
);

const TRAVERSAL_GRAPH_BUILDER_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "clearanceMarginMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps",
] as const;

const TRAVERSAL_GRAPH_BUILDER_PROFILE_ALLOWED_KEYS = new Set(
  TRAVERSAL_GRAPH_BUILDER_PROFILE_REQUIRED_KEYS,
);

const TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "clearanceMarginMeters",
  "voxelCellSizeMeters",
  "voxelCellHeightMeters",
  "tileSizeCells",
  "maximumEdgeLengthMeters",
  "maximumSimplificationErrorMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps",
  "maximumTraversalSurfaceCount",
  "minimumEquivalentPlaneNormalDotRatio",
  "maximumTraversalSurfaceTrianglePairTestCount",
] as const;

const TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_ALLOWED_KEYS = new Set(
  TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_REQUIRED_KEYS,
);

const TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS = [
  "kind",
  "schemaVersion",
  "traversalMode",
  "faceSelectionMode",
] as const;

const TRAVERSAL_SURFACE_PROFILE_ALLOWED_KEYS = new Set(
  TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS,
);

const BUILT_IN_WALK_HARD_RIBBON_DRIVER_PROFILE: TraversalDriverProfileV1 = {
  kind: "traversal-driver-profile",
  schemaVersion: 1,
  pathLookaheadMetersXZ: 2.4,
  cornerSelectionMode: "next-visible-segment",
  intentDirectionQuantizationRatio: 0.001,
  locomotionIntentMode: "walk",
};

const BUILT_IN_OUTDOOR_HUMANOID_GRAPH_BUILDER_PROFILE: TraversalGraphBuilderProfileV1 = {
  kind: "traversal-graph-builder-profile",
  schemaVersion: 1,
  clearanceMarginMeters: 0.05,
  positionQuantizationMeters: 0.001,
  slopeCostWeight: 1,
  stepCostWeight: 1,
  maximumNodes: 100000,
  maximumEdges: 200000,
  maximumTiles: 1024,
  maximumSearchSteps: 100000,
};

const BUILT_IN_HEIGHTFIELD_R1_GRAPH_BUILDER_PROFILE: TraversalGraphBuilderProfileV2 = {
  kind: "traversal-graph-builder-profile",
  schemaVersion: 2,
  clearanceMarginMeters: 0.05,
  voxelCellSizeMeters: 0.15,
  voxelCellHeightMeters: 0.1,
  tileSizeCells: 64,
  maximumEdgeLengthMeters: 2.4,
  maximumSimplificationErrorMeters: 0.15,
  positionQuantizationMeters: 0.001,
  slopeCostWeight: 1,
  stepCostWeight: 1,
  maximumNodes: 100000,
  maximumEdges: 200000,
  maximumTiles: 1024,
  maximumSearchSteps: 100000,
  maximumTraversalSurfaceCount: 61,
  minimumEquivalentPlaneNormalDotRatio: 0.99999,
  maximumTraversalSurfaceTrianglePairTestCount: 4_000_000,
};

const BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_GRAPH_BUILDER_PROFILE:
  TraversalGraphBuilderProfileV2 = {
    ...BUILT_IN_HEIGHTFIELD_R1_GRAPH_BUILDER_PROFILE,
    maximumNodes: 16,
    maximumEdges: 32,
    maximumTiles: 64,
    maximumSearchSteps: 16,
};

const BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE: TraversalSurfaceProfileV1 = {
  kind: "traversal-surface-profile",
  schemaVersion: 1,
  traversalMode: "ground",
  faceSelectionMode: "subject-slope-compatible",
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function contentHashOf(value: unknown): `sha256:${string}` {
  return sha256CanonicalJson(value) as `sha256:${string}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function requirePlainProfile(
  value: unknown,
  notPlainCode: string,
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new Error(`${notPlainCode}: expected a plain object.`);
  }
  return value;
}

function rejectForbiddenAndMissingKeys(
  source: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  requiredKeys: readonly string[],
  forbiddenCode: string,
  missingCode: string,
): void {
  const forbiddenKeys = Object.keys(source).filter((key) => !allowedKeys.has(key));
  if (!isEmpty(forbiddenKeys)) {
    const forbiddenKey = forbiddenKeys[0];
    if (isNil(forbiddenKey)) {
      throw new Error(forbiddenCode);
    }
    throw new Error(`${forbiddenCode}: '${forbiddenKey}'.`);
  }
  const missingKey = requiredKeys.find(
    (key) => !Object.prototype.hasOwnProperty.call(source, key),
  );
  if (missingKey !== undefined) {
    throw new Error(`${missingCode}: '${missingKey}'.`);
  }
}

function requireFiniteNumber(
  value: unknown,
  code: string,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${code}: '${field}' must be a finite number.`);
  }
  return value;
}

function requirePositiveNumber(
  value: unknown,
  code: string,
  field: string,
  maximum: number,
): number {
  const numberValue = requireFiniteNumber(value, code, field);
  if (!(numberValue > 0) || numberValue > maximum) {
    throw new Error(`${code}: '${field}' must be > 0 and <= ${maximum}.`);
  }
  return numberValue;
}

function requireNonNegativeNumber(
  value: unknown,
  code: string,
  field: string,
  maximum: number,
): number {
  const numberValue = requireFiniteNumber(value, code, field);
  if (numberValue < 0 || numberValue > maximum) {
    throw new Error(`${code}: '${field}' must be >= 0 and <= ${maximum}.`);
  }
  return numberValue;
}

function requireNumberInRange(
  value: unknown,
  code: string,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const numberValue = requireFiniteNumber(value, code, field);
  if (numberValue < minimum || numberValue > maximum) {
    throw new Error(
      `${code}: '${field}' must be >= ${minimum} and <= ${maximum}.`,
    );
  }
  return numberValue;
}

function requireSafeIntegerInRange(
  value: unknown,
  code: string,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${code}: '${field}' must be a safe integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

export function validateTraversalDriverProfileV1(value: unknown): void {
  const source = requirePlainProfile(value, "TRAVERSAL_DRIVER_PROFILE_NOT_PLAIN");
  rejectForbiddenAndMissingKeys(
    source,
    TRAVERSAL_DRIVER_PROFILE_ALLOWED_KEYS,
    TRAVERSAL_DRIVER_PROFILE_REQUIRED_KEYS,
    "TRAVERSAL_DRIVER_FIELD_FORBIDDEN",
    "TRAVERSAL_DRIVER_FIELD_MISSING",
  );
  if (source.kind !== "traversal-driver-profile") {
    throw new Error("TRAVERSAL_DRIVER_KIND_MISMATCH: kind must be traversal-driver-profile.");
  }
  if (source.schemaVersion !== 1) {
    throw new Error("TRAVERSAL_DRIVER_SCHEMA_VERSION_MISMATCH: schemaVersion must be 1.");
  }
  requirePositiveNumber(
    source.pathLookaheadMetersXZ,
    "TRAVERSAL_DRIVER_NUMBER_INVALID",
    "pathLookaheadMetersXZ",
    32,
  );
  requirePositiveNumber(
    source.intentDirectionQuantizationRatio,
    "TRAVERSAL_DRIVER_NUMBER_INVALID",
    "intentDirectionQuantizationRatio",
    1,
  );
  if (source.cornerSelectionMode !== "next-visible-segment") {
    throw new Error(
      "TRAVERSAL_DRIVER_ENUM_INVALID: cornerSelectionMode must be next-visible-segment.",
    );
  }
  if (source.locomotionIntentMode !== "walk") {
    throw new Error("TRAVERSAL_DRIVER_ENUM_INVALID: locomotionIntentMode must be walk.");
  }
}

export function validateTraversalGraphBuilderProfileV1(value: unknown): void {
  const source = requirePlainProfile(
    value,
    "TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_PLAIN",
  );
  rejectForbiddenAndMissingKeys(
    source,
    TRAVERSAL_GRAPH_BUILDER_PROFILE_ALLOWED_KEYS,
    TRAVERSAL_GRAPH_BUILDER_PROFILE_REQUIRED_KEYS,
    "TRAVERSAL_GRAPH_BUILDER_FIELD_FORBIDDEN",
    "TRAVERSAL_GRAPH_BUILDER_FIELD_MISSING",
  );
  if (source.kind !== "traversal-graph-builder-profile") {
    throw new Error(
      "TRAVERSAL_GRAPH_BUILDER_KIND_MISMATCH: kind must be traversal-graph-builder-profile.",
    );
  }
  if (source.schemaVersion !== 1) {
    throw new Error(
      "TRAVERSAL_GRAPH_BUILDER_SCHEMA_VERSION_MISMATCH: schemaVersion must be 1.",
    );
  }
  requireNonNegativeNumber(
    source.clearanceMarginMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "clearanceMarginMeters",
    2,
  );
  requirePositiveNumber(
    source.positionQuantizationMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "positionQuantizationMeters",
    1,
  );
  requireNonNegativeNumber(
    source.slopeCostWeight,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "slopeCostWeight",
    100,
  );
  requireNonNegativeNumber(
    source.stepCostWeight,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "stepCostWeight",
    100,
  );
  requireSafeIntegerInRange(
    source.maximumNodes,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumNodes",
    1,
    1_000_000,
  );
  requireSafeIntegerInRange(
    source.maximumEdges,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumEdges",
    1,
    2_000_000,
  );
  requireSafeIntegerInRange(
    source.maximumTiles,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumTiles",
    1,
    4096,
  );
  requireSafeIntegerInRange(
    source.maximumSearchSteps,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumSearchSteps",
    1,
    1_000_000,
  );
}

export function validateTraversalSurfaceProfileV1(value: unknown): void {
  const source = requirePlainProfile(value, "TRAVERSAL_SURFACE_PROFILE_NOT_PLAIN");
  rejectForbiddenAndMissingKeys(
    source,
    TRAVERSAL_SURFACE_PROFILE_ALLOWED_KEYS,
    TRAVERSAL_SURFACE_PROFILE_REQUIRED_KEYS,
    "TRAVERSAL_SURFACE_PROFILE_FIELD_FORBIDDEN",
    "TRAVERSAL_SURFACE_PROFILE_FIELD_MISSING",
  );
  if (source.kind !== "traversal-surface-profile") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_KIND_MISMATCH: kind must be traversal-surface-profile.",
    );
  }
  if (source.schemaVersion !== 1) {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_SCHEMA_VERSION_MISMATCH: schemaVersion must be 1.",
    );
  }
  if (source.traversalMode !== "ground") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_ENUM_INVALID: traversalMode must be ground.",
    );
  }
  if (source.faceSelectionMode !== "subject-slope-compatible") {
    throw new Error(
      "TRAVERSAL_SURFACE_PROFILE_ENUM_INVALID: faceSelectionMode must be subject-slope-compatible.",
    );
  }
}

export function validateTraversalGraphBuilderProfileV2(value: unknown): void {
  const source = requirePlainProfile(
    value,
    "TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_PLAIN",
  );
  rejectForbiddenAndMissingKeys(
    source,
    TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_ALLOWED_KEYS,
    TRAVERSAL_GRAPH_BUILDER_PROFILE_V2_REQUIRED_KEYS,
    "TRAVERSAL_GRAPH_BUILDER_FIELD_FORBIDDEN",
    "TRAVERSAL_GRAPH_BUILDER_FIELD_MISSING",
  );
  if (source.kind !== "traversal-graph-builder-profile") {
    throw new Error(
      "TRAVERSAL_GRAPH_BUILDER_KIND_MISMATCH: kind must be traversal-graph-builder-profile.",
    );
  }
  if (source.schemaVersion !== 2) {
    throw new Error(
      "TRAVERSAL_GRAPH_BUILDER_SCHEMA_VERSION_MISMATCH: schemaVersion must be 2.",
    );
  }
  requireNonNegativeNumber(
    source.clearanceMarginMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "clearanceMarginMeters",
    2,
  );
  const voxelCellSizeMeters = requireNumberInRange(
    source.voxelCellSizeMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "voxelCellSizeMeters",
    0.001,
    4,
  );
  requireNumberInRange(
    source.voxelCellHeightMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "voxelCellHeightMeters",
    0.001,
    2,
  );
  requireSafeIntegerInRange(
    source.tileSizeCells,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "tileSizeCells",
    16,
    1024,
  );
  const maximumEdgeLengthMeters = requirePositiveNumber(
    source.maximumEdgeLengthMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumEdgeLengthMeters",
    256,
  );
  if (maximumEdgeLengthMeters < voxelCellSizeMeters) {
    throw new Error(
      "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID: 'maximumEdgeLengthMeters' must be at least one voxelCellSizeMeters.",
    );
  }
  requirePositiveNumber(
    source.maximumSimplificationErrorMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumSimplificationErrorMeters",
    16,
  );
  requirePositiveNumber(
    source.positionQuantizationMeters,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "positionQuantizationMeters",
    1,
  );
  requireNonNegativeNumber(
    source.slopeCostWeight,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "slopeCostWeight",
    100,
  );
  requireNonNegativeNumber(
    source.stepCostWeight,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "stepCostWeight",
    100,
  );
  requireSafeIntegerInRange(
    source.maximumNodes,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumNodes",
    1,
    1_000_000,
  );
  requireSafeIntegerInRange(
    source.maximumEdges,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumEdges",
    1,
    2_000_000,
  );
  requireSafeIntegerInRange(
    source.maximumTiles,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumTiles",
    1,
    4096,
  );
  requireSafeIntegerInRange(
    source.maximumSearchSteps,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumSearchSteps",
    1,
    1_000_000,
  );
  requireSafeIntegerInRange(
    source.maximumTraversalSurfaceCount,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumTraversalSurfaceCount",
    1,
    1_000_000,
  );
  requirePositiveNumber(
    source.minimumEquivalentPlaneNormalDotRatio,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "minimumEquivalentPlaneNormalDotRatio",
    1,
  );
  requireSafeIntegerInRange(
    source.maximumTraversalSurfaceTrianglePairTestCount,
    "TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID",
    "maximumTraversalSurfaceTrianglePairTestCount",
    1,
    Number.MAX_SAFE_INTEGER - 1,
  );
}

export function resolveTraversalDriverProfileV1(
  resourceRef: string,
): ResolvedTraversalDriverProfileV1 {
  if (resourceRef !== BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF) {
    throw new Error(`TRAVERSAL_DRIVER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = structuredClone(BUILT_IN_WALK_HARD_RIBBON_DRIVER_PROFILE);
  validateTraversalDriverProfileV1(profile);
  return deepFreeze({
    resourceRef: BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile: deepFreeze(profile),
  });
}

export function resolveTraversalGraphBuilderProfileV1(
  resourceRef: string,
): ResolvedTraversalGraphBuilderProfileV1 {
  if (resourceRef !== BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF) {
    throw new Error(`TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = structuredClone(BUILT_IN_OUTDOOR_HUMANOID_GRAPH_BUILDER_PROFILE);
  validateTraversalGraphBuilderProfileV1(profile);
  return deepFreeze({
    resourceRef: BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile: deepFreeze(profile),
  });
}

export function resolveTraversalGraphBuilderProfileV2(
  resourceRef: string,
): ResolvedTraversalGraphBuilderProfileV2 {
  let profile: TraversalGraphBuilderProfileV2;
  if (resourceRef === BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF) {
    profile = structuredClone(BUILT_IN_HEIGHTFIELD_R1_GRAPH_BUILDER_PROFILE);
  } else if (
    resourceRef ===
    BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF
  ) {
    profile = structuredClone(
      BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_GRAPH_BUILDER_PROFILE,
    );
  } else {
    throw new Error(`TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  validateTraversalGraphBuilderProfileV2(profile);
  return deepFreeze({
    resourceRef,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile: deepFreeze(profile),
  });
}

export function resolveTraversalSurfaceProfileV1(
  resourceRef: string,
): ResolvedTraversalSurfaceProfileV1 {
  if (resourceRef !== BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF) {
    throw new Error(`TRAVERSAL_SURFACE_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = structuredClone(BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE);
  validateTraversalSurfaceProfileV1(profile);
  return deepFreeze({
    resourceRef: BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile: deepFreeze(profile),
  });
}

export function resolveTraversalGraphBuilderProfile(
  resourceRef: string,
): ResolvedTraversalGraphBuilderProfile {
  if (resourceRef === BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF) {
    return resolveTraversalGraphBuilderProfileV1(resourceRef);
  }
  if (resourceRef === BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF) {
    return resolveTraversalGraphBuilderProfileV2(resourceRef);
  }
  if (
    resourceRef ===
    BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF
  ) {
    return resolveTraversalGraphBuilderProfileV2(resourceRef);
  }
  throw new Error(`TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
}
