import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  canonicalRoutePathReceiptV2,
  hashRoutePathReceiptV2,
  type RoutePathReceiptV2,
} from "./path-receipt.js";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  resolveTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const GRAPH_BUILDER_PROFILE = resolveTraversalGraphBuilderProfileV2(
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
);

function validReceipt(
  overrides: Partial<RoutePathReceiptV2> = {},
): RoutePathReceiptV2 {
  return {
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    traversalGraphHash: HASH_A,
    routeBuildInputHash: HASH_A,
    resolvedTraversalLockHash: HASH_A,
    orderedTraversalSurfaceIdentities: [
      {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
        resolvedVersion: "1",
        resourceHash: HASH_A,
      },
      {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
        resolvedVersion: "1",
        resourceHash: HASH_A,
      },
    ],
    graphBuilderProfileRef: GRAPH_BUILDER_PROFILE.resourceRef,
    graphBuilderResolvedVersion: GRAPH_BUILDER_PROFILE.resolvedVersion,
    graphBuilderProfileHash: GRAPH_BUILDER_PROFILE.contentHash,
    orderedTraversalNodeIds: ["node-a", "node-b"],
    orderedTraversalEdgeIds: ["edge-a-b"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 0.5,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
    ...overrides,
  };
}

describe("RoutePathReceiptV2", () => {
  it("canonicalizes strict success-only bytes, deep freezes them, and hashes externally", () => {
    const canonical = canonicalRoutePathReceiptV2(validReceipt());

    expect(canonical).not.toHaveProperty("routePathReceiptHash");
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.orderedTraversalNodeIds)).toBe(true);
    expect(Object.isFrozen(canonical.orderedPathPositionsMetersXYZ[0])).toBe(true);
    expect(Object.isFrozen(canonical.orderedTraversalSurfaceIdentities[0])).toBe(true);
    expect(hashRoutePathReceiptV2(canonical)).toBe(sha256CanonicalJson(canonical));
  });

  it("requires closed World and locked Traversal Surface identity", () => {
    expect(canonicalRoutePathReceiptV2(validReceipt())).toMatchObject({
      authoringSpecHash: HASH_A,
      layoutSolveReportHash: HASH_A,
      resourceLockHash: HASH_A,
      orderedTraversalSurfaceIdentities: [{
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceHash: HASH_A,
      }, {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceHash: HASH_A,
      }],
    });
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      authoringSpecHash: "sha256:not-a-hash",
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      orderedTraversalSurfaceIdentities: [{
        ...validReceipt().orderedTraversalSurfaceIdentities[0],
        providerShapeId: 42,
      }] as unknown as RoutePathReceiptV2["orderedTraversalSurfaceIdentities"],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });

  it("accepts one-node zero-edge success but closes ordered adjacency cardinality", () => {
    expect(canonicalRoutePathReceiptV2(validReceipt({
      orderedTraversalNodeIds: ["same-node"],
      orderedTraversalEdgeIds: [],
      orderedPathPositionsMetersXYZ: [[0, 0, 0]],
      orderedTraversalSurfaceIdentities: [validReceipt().orderedTraversalSurfaceIdentities[0]!],
      routePathDistanceMeters: 0,
      routePathDistanceMetersXZ: 0,
      routePathCost: 0,
    }))).toMatchObject({
      orderedTraversalNodeIds: ["same-node"],
      orderedTraversalEdgeIds: [],
    });

    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      orderedTraversalEdgeIds: [],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });

  it("rejects unknown fields, invalid hashes, duplicate adjacent ids, and invalid metrics", () => {
    expect(() => canonicalRoutePathReceiptV2({
      ...validReceipt(),
      providerPolygonRefs: [1, 2],
    })).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      traversalGraphHash: "sha256:not-a-hash",
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      orderedTraversalNodeIds: ["node-a", "node-a"],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      minimumObservedClearanceWidthMeters: 0,
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      maximumObservedSlopeDegrees: 91,
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRoutePathReceiptV2(validReceipt({
      orderedPathPositionsMetersXYZ: [[0, 0, 0]],
    }))).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });

  it("pins the V1 Route Path Receipt canonical hash", () => {
    expect(hashRoutePathReceiptV2(validReceipt())).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
