import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  canonicalRouteOverlayV2,
  hashRouteOverlayV2,
  type RouteOverlayV2,
} from "./index.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const WALL_LEFT_COLLIDER_SUBSHAPE_ID =
  "collider-subshape:sha256:f6f6439aafa0d76a64ebe5ce2866882c052f5881da01a3e75b9de8dd5f314b5c";
const WALL_RIGHT_COLLIDER_SUBSHAPE_ID =
  "collider-subshape:sha256:30e44e4e5faaadc1d7ddd3c5ffb3d6e6e6dae0d23ab31ffbaea1f595c0b4c611";

function validOverlay(overrides: Partial<RouteOverlayV2> = {}): RouteOverlayV2 {
  return {
    kind: "route-overlay",
    schemaVersion: 2,
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchor: {
      entityId: "spawn",
      positionMetersXYZ: [0, 0, 0],
    },
    destinationAnchor: {
      entityId: "goal",
      positionMetersXYZ: [8, 0, 0],
    },
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
    {
      traversalSurfaceId: "surface-main",
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: "terrain-heightfield",
      resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    },
    ],
    resolvedTraversalLockHash: HASH_A,
    traversalGraphHash: HASH_B,
    routePathReceiptHash: HASH_C,
    orderedTraversalNodeIds: ["node-a", "node-b", "node-c"],
    orderedTraversalEdgeIds: ["edge-a-b", "edge-b-c"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [4, 0.25, 0], [8, 0, 0]],
    hardRibbon: {
      routeId: "main-route",
      pointsMetersXZ: [[0, 0], [4, 0], [8, 0]],
      widthMeters: 2,
      locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
    },
    staticColliderIdentities: [
      {
        entityId: "wall-right",
        logicalSubshapeId: "primary",
        colliderSubshapeId: WALL_RIGHT_COLLIDER_SUBSHAPE_ID,
        colliderHash: HASH_B,
      },
      {
        entityId: "wall-left",
        logicalSubshapeId: "primary",
        colliderSubshapeId: WALL_LEFT_COLLIDER_SUBSHAPE_ID,
        colliderHash: HASH_A,
      },
    ],
    ...overrides,
  };
}

describe("RouteOverlayV2", () => {
  it("canonicalizes a provider-neutral read-only overlay, deep freezes it, and hashes externally", () => {
    const source = validOverlay();
    const canonical = canonicalRouteOverlayV2(source);

    expect(canonical).toEqual(source);
    expect(canonical).not.toBe(source);
    expect(canonical).not.toHaveProperty("routeOverlayHash");
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.startAnchor)).toBe(true);
    expect(Object.isFrozen(canonical.startAnchor.positionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(canonical.orderedTraversalSurfaceIdentities[0])).toBe(true);
    expect(Object.isFrozen(canonical.orderedPathPositionsMetersXYZ)).toBe(true);
    expect(Object.isFrozen(canonical.orderedPathPositionsMetersXYZ[0])).toBe(true);
    expect(Object.isFrozen(canonical.hardRibbon)).toBe(true);
    expect(Object.isFrozen(canonical.hardRibbon.pointsMetersXZ[0])).toBe(true);
    expect(Object.isFrozen(canonical.staticColliderIdentities)).toBe(true);
    expect(Object.isFrozen(canonical.staticColliderIdentities[0])).toBe(true);
    expect(hashRouteOverlayV2(canonical)).toBe(sha256CanonicalJson(canonical));
    expect(JSON.stringify(canonical).toLowerCase()).not.toMatch(
      /babylon|havok|recast|nativehandle|providerhandle/,
    );
  });

  it("changes only the overlay hash when overlay-only evidence changes", () => {
    const first = canonicalRouteOverlayV2(validOverlay());
    const existingTraversalGraphHash = first.traversalGraphHash;
    const changed = canonicalRouteOverlayV2(validOverlay({
      hardRibbon: {
        ...validOverlay().hardRibbon,
        widthMeters: 3,
      },
    }));

    expect(existingTraversalGraphHash).toBe(HASH_B);
    expect(changed.traversalGraphHash).toBe(existingTraversalGraphHash);
    expect(hashRouteOverlayV2(first)).not.toBe(hashRouteOverlayV2(changed));
  });

  it("preserves the authoritative Build Input corridor rule for adjacent duplicate points", () => {
    expect(canonicalRouteOverlayV2(validOverlay({
      hardRibbon: {
        ...validOverlay().hardRibbon,
        pointsMetersXZ: [[0, 0], [0, 0], [8, 0]],
      },
    })).hardRibbon.pointsMetersXZ).toEqual([[0, 0], [0, 0], [8, 0]]);
  });

  it("binds role identities across anchors, path, corridor, surface, and colliders", () => {
    expect(canonicalRouteOverlayV2(validOverlay())).toMatchObject({
      constraintId: "player-to-goal",
      routeId: "main-route",
      traversingEntityId: "player",
      startAnchor: { entityId: "spawn" },
      destinationAnchor: { entityId: "goal" },
      orderedTraversalSurfaceIdentities: [{
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
      }, {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
      }, {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
      }],
      hardRibbon: { routeId: "main-route" },
    });

    expect(() => canonicalRouteOverlayV2(validOverlay({
      destinationAnchor: validOverlay().startAnchor,
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      hardRibbon: { ...validOverlay().hardRibbon, routeId: "other-route" },
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      staticColliderIdentities: [{
        entityId: "wall-right",
        logicalSubshapeId: "primary",
        colliderSubshapeId: WALL_LEFT_COLLIDER_SUBSHAPE_ID,
        colliderHash: HASH_A,
      }],
    }))).toThrow("ROUTE_OVERLAY_INVALID");
  });

  it("rejects provider handles, unknown fields, and opaque payload substitution", () => {
    expect(() => canonicalRouteOverlayV2({
      ...validOverlay(),
      babylonMeshHandle: 7,
    })).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2({
      ...validOverlay(),
      orderedTraversalSurfaceIdentities: [
        {
          ...validOverlay().orderedTraversalSurfaceIdentities[0],
          providerPolygonRef: 42,
        },
        ...validOverlay().orderedTraversalSurfaceIdentities.slice(1),
      ],
    })).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2({
      ...validOverlay(),
      staticColliderIdentities: [{
        ...validOverlay().staticColliderIdentities[0],
        havokBodyHandle: 12,
      }],
    })).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2({
      ...validOverlay(),
      orderedPathPositionsMetersXYZ: new Uint8Array([1, 2, 3]),
    })).toThrow("ROUTE_OVERLAY_INVALID");
  });

  it("rejects malformed or non-canonical ordered visualization evidence", () => {
    expect(() => canonicalRouteOverlayV2(validOverlay({
      routePathReceiptHash: "sha256:not-a-hash",
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      orderedTraversalNodeIds: ["node-a", "node-a"],
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      orderedTraversalEdgeIds: ["edge-a-b"],
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      orderedPathPositionsMetersXYZ: [[0, 0, 0], [0, 0, 0]],
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      hardRibbon: {
        ...validOverlay().hardRibbon,
        pointsMetersXZ: [[0, 0], [0, 0]],
      },
    }))).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => canonicalRouteOverlayV2(validOverlay({
      staticColliderIdentities: [
        validOverlay().staticColliderIdentities[1]!,
        validOverlay().staticColliderIdentities[0]!,
      ],
    }))).toThrow("ROUTE_OVERLAY_INVALID");
  });

  it("pins the V1 Route Overlay canonical hash", () => {
    expect(hashRouteOverlayV2(validOverlay())).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
