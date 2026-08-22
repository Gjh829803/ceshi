import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  canonicalRoutePathReceiptV1,
  hashRoutePathReceiptV1,
  type RoutePathReceiptV1,
} from "./path-receipt.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const PROFILE_HASH =
  "sha256:9720639dac7de3da1d140c7afd1ea7df4258cef202468e39fa222158caaad231" as const;

function validReceipt(
  overrides: Partial<RoutePathReceiptV1> = {},
): RoutePathReceiptV1 {
  return {
    kind: "route-path-receipt",
    schemaVersion: 1,
    status: "complete",
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    traversalGraphHash: HASH_A,
    routeBuildInputHash: HASH_A,
    resolvedTraversalLockHash: HASH_A,
    graphBuilderProfileRef:
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1",
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash: PROFILE_HASH,
    orderedTraversalNodeIds: ["node-a", "node-b"],
    orderedTraversalEdgeIds: ["edge-a-b"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathCost: 0.5,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
    ...overrides,
  };
}

describe("RoutePathReceiptV1", () => {
  it("canonicalizes strict success-only bytes, deep freezes them, and hashes externally", () => {
    const canonical = canonicalRoutePathReceiptV1(validReceipt());

    expect(canonical).not.toHaveProperty("routePathReceiptHash");
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.orderedTraversalNodeIds)).toBe(true);
    expect(Object.isFrozen(canonical.orderedPathPositionsMetersXYZ[0])).toBe(true);
    expect(hashRoutePathReceiptV1(canonical)).toBe(sha256CanonicalJson(canonical));
  });

  it("accepts one-node zero-edge success but closes ordered adjacency cardinality", () => {
    expect(canonicalRoutePathReceiptV1(validReceipt({
      orderedTraversalNodeIds: ["same-node"],
      orderedTraversalEdgeIds: [],
      orderedPathPositionsMetersXYZ: [[0, 0, 0]],
      routePathDistanceMeters: 0,
      routePathCost: 0,
    }))).toMatchObject({
      orderedTraversalNodeIds: ["same-node"],
      orderedTraversalEdgeIds: [],
    });

    expect(() => canonicalRoutePathReceiptV1(validReceipt({
      orderedTraversalEdgeIds: [],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });

  it("rejects unknown fields, invalid hashes, duplicate adjacent ids, and invalid metrics", () => {
    expect(() => canonicalRoutePathReceiptV1({
      ...validReceipt(),
      providerPolygonRefs: [1, 2],
    })).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV1(validReceipt({
      traversalGraphHash: "sha256:not-a-hash",
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV1(validReceipt({
      orderedTraversalNodeIds: ["node-a", "node-a"],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV1(validReceipt({
      minimumObservedClearanceWidthMeters: 0,
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV1(validReceipt({
      maximumObservedSlopeDegrees: 91,
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });
});
