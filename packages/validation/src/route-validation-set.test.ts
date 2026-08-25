import { describe, expect, it } from "vitest";

import {
  canonicalRouteValidationSetReceiptV1,
  hashRouteValidationRequiredRouteSetV1,
} from "./route-validation-set.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const ZERO_HASH = `sha256:${"0".repeat(64)}` as const;

function receipt(): unknown {
  const requiredRoutes = [{
    constraintId: "route-check",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
  }] as const;
  return {
    kind: "route-validation-set-receipt",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_A,
    executionPlanHash: HASH_A,
    resourceLockHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    requiredRouteCount: 1,
    requiredRouteSetHash: hashRouteValidationRequiredRouteSetV1(
      HASH_A,
      requiredRoutes,
    ),
    requiredRoutes,
    rows: [{
      constraintId: "route-check",
      routeId: "main-route",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn",
      destinationAnchorEntityId: "goal",
      resolvedTraversalLockHash: HASH_A,
      connectivityStatus: "complete",
      runtimeStatus: "complete",
      evidenceArtifactRefs: [
        "artifact://route/main-route/constraint/route-check/traversal-graph.json",
      ],
    }],
  };
}

describe("RouteValidationSetReceiptV1", () => {
  it("accepts unknown input and returns one deeply frozen canonical receipt", () => {
    const canonical = canonicalRouteValidationSetReceiptV1(receipt());

    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.rows)).toBe(true);
    expect(Object.isFrozen(canonical.rows[0])).toBe(true);
    expect(Object.isFrozen(canonical.rows[0]?.evidenceArtifactRefs)).toBe(true);
    expect(canonical.requiredRouteCount).toBe(1);
    expect(Object.isFrozen(canonical.requiredRoutes)).toBe(true);
  });

  it("rejects drift in Required Route count, hash, or exact row coverage", () => {
    const baseline = receipt() as Record<string, unknown>;
    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      requiredRouteCount: 2,
    })).toThrow("requiredRouteCount");
    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      requiredRouteSetHash: ZERO_HASH,
    })).toThrow("requiredRouteSetHash");
    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      rows: [],
    })).toThrow("must cover every required Route exactly once");
  });

  it("rejects all-zero identities at every receipt and row hash boundary", () => {
    const baseline = receipt() as Record<string, unknown>;
    for (const field of [
      "authoringSpecHash",
      "normalizedWorldIrHash",
      "executionPlanHash",
      "resourceLockHash",
      "layoutSolveReportHash",
    ]) {
      expect(() => canonicalRouteValidationSetReceiptV1({
        ...baseline,
        [field]: ZERO_HASH,
      })).toThrow(field);
    }
    const row = (baseline.rows as readonly Record<string, unknown>[])[0]!;
    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      rows: [{ ...row, resolvedTraversalLockHash: ZERO_HASH }],
    })).toThrow("resolvedTraversalLockHash");
  });

  it("rejects padded and non-NFC canonical strings", () => {
    const baseline = receipt() as Record<string, unknown>;
    const row = (baseline.rows as readonly Record<string, unknown>[])[0]!;

    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      rows: [{ ...row, constraintId: " route-check" }],
    })).toThrow("constraintId");
    expect(() => canonicalRouteValidationSetReceiptV1({
      ...baseline,
      rows: [{ ...row, constraintId: "e\u0301-route" }],
    })).toThrow("constraintId");
  });
});
