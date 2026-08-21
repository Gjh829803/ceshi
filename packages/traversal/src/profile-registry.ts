import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

import type {
  ResolvedTraversalDriverProfileV1,
  ResolvedTraversalGraphBuilderProfileV1,
  TraversalDriverProfileV1,
  TraversalGraphBuilderProfileV1,
} from "./types.js";

export const BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF =
  "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1" as const;

export const BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF =
  "worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@1" as const;

const TRAVERSAL_DRIVER_PROFILE_ALLOWED_KEYS = new Set([
  "kind",
  "schemaVersion",
  "pathLookaheadMeters",
  "cornerSelectionMode",
  "intentDirectionQuantizationRatio",
  "locomotionIntentMode",
]);

const BUILT_IN_WALK_HARD_RIBBON_DRIVER_PROFILE: TraversalDriverProfileV1 = {
  kind: "traversal-driver-profile",
  schemaVersion: 1,
  pathLookaheadMeters: 2.4,
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function contentHashOf(value: unknown): `sha256:${string}` {
  return sha256CanonicalJson(value) as `sha256:${string}`;
}

export function validateTraversalDriverProfileV1(value: unknown): void {
  if (isNil(value) || typeof value !== "object") {
    throw new Error("TRAVERSAL_DRIVER_PROFILE_INVALID: expected an object.");
  }

  const forbiddenKeys = Object.keys(value).filter(
    (key) => !TRAVERSAL_DRIVER_PROFILE_ALLOWED_KEYS.has(key),
  );
  if (!isEmpty(forbiddenKeys)) {
    const forbiddenKey = forbiddenKeys[0];
    if (isNil(forbiddenKey)) {
      throw new Error("TRAVERSAL_DRIVER_FIELD_FORBIDDEN");
    }
    throw new Error(`TRAVERSAL_DRIVER_FIELD_FORBIDDEN: '${forbiddenKey}'.`);
  }
}

export function resolveTraversalDriverProfileV1(
  resourceRef: string,
): ResolvedTraversalDriverProfileV1 {
  if (resourceRef !== BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF) {
    throw new Error(`TRAVERSAL_DRIVER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = deepFreeze(structuredClone(BUILT_IN_WALK_HARD_RIBBON_DRIVER_PROFILE));
  validateTraversalDriverProfileV1(profile);
  return deepFreeze({
    resourceRef: BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile,
  });
}

export function resolveTraversalGraphBuilderProfileV1(
  resourceRef: string,
): ResolvedTraversalGraphBuilderProfileV1 {
  if (resourceRef !== BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF) {
    throw new Error(`TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = deepFreeze(
    structuredClone(BUILT_IN_OUTDOOR_HUMANOID_GRAPH_BUILDER_PROFILE),
  );
  return deepFreeze({
    resourceRef: BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash: contentHashOf(profile),
    profile,
  });
}
