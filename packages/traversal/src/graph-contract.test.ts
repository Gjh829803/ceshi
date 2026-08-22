import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  resolveTraversalGraphBuilderProfile,
  resolveTraversalGraphBuilderProfileV1,
} from "./index.js";
import {
  assertTraversalSurfaceIdentityV1,
  canonicalTraversalGraphV1,
  hashTraversalGraphV1,
  type TraversalGraphV1,
  type TraversalNodeV1,
} from "./graph-contract.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function node(
  overrides: Partial<TraversalNodeV1> & Pick<TraversalNodeV1, "id">,
): TraversalNodeV1 {
  return {
    traversalSurfaceId: `${overrides.id}-surface`,
    surfaceEntityId: `${overrides.id}-entity`,
    colliderSubshapeId: `${overrides.id}-collider`,
    positionMetersXYZ: [0, 0, 0],
    tileId: "tile-0",
    clearanceWidthMeters: 1.2,
    clearanceHeightMeters: 2,
    ...overrides,
  };
}

function validGraph(
  overrides: Partial<TraversalGraphV1> = {},
): TraversalGraphV1 {
  const builder = resolveTraversalGraphBuilderProfileV1(
    BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  return {
    kind: "traversal-graph",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    terrainArtifactHash: HASH_A,
    colliderArtifactHash: HASH_A,
    surfaceArtifactHash: HASH_A,
    resolvedTraversalLockHash: HASH_A,
    graphBuilderProfileRef: builder.resourceRef,
    graphBuilderResolvedVersion: builder.resolvedVersion,
    graphBuilderProfileHash: builder.contentHash,
    routeId: "spawn-to-watchtower",
    startAnchorEntityId: "spawn-main",
    destinationAnchorEntityId: "watchtower-entry",
    traversalNodesById: {
      "spawn-node": node({
        id: "spawn-node",
        positionMetersXYZ: [0, 0.15, 0],
      }),
      "watchtower-node": node({
        id: "watchtower-node",
        positionMetersXYZ: [12, 1.2, -8],
        tileId: "tile-1",
      }),
    },
    traversalEdgesById: {
      "spawn-to-watchtower-walk": {
        id: "spawn-to-watchtower-walk",
        type: "walk",
        fromTraversalNodeId: "spawn-node",
        toTraversalNodeId: "watchtower-node",
        distanceMeters: 14.4,
        heightDeltaMeters: 1.05,
        slopeDegrees: 4.2,
        minimumClearanceWidthMeters: 1.2,
        minimumClearanceHeightMeters: 2,
        routePathCost: 14.4,
      },
    },
    ...overrides,
  };
}

describe("canonicalTraversalGraphV1", () => {
  it("canonicalizes graph bytes without a self-referential hash field", () => {
    const graph = validGraph();
    const canonical = canonicalTraversalGraphV1(graph);

    expect(canonical).not.toHaveProperty("traversalGraphHash");
    expect(canonical.kind).toBe("traversal-graph");
    expect(canonical.traversalNodesById["spawn-node"]?.traversalSurfaceId)
      .not.toBe(
        canonical.traversalNodesById["spawn-node"]?.surfaceEntityId,
      );
    expect(canonical.traversalNodesById["spawn-node"]?.surfaceEntityId).not.toBe(
      canonical.traversalNodesById["spawn-node"]?.colliderSubshapeId,
    );
    expect(hashTraversalGraphV1(graph)).toBe(sha256CanonicalJson(canonical));
    expect(hashTraversalGraphV1(graph)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps the graph hash stable across node map insertion order", () => {
    const graph = validGraph();
    const reordered: TraversalGraphV1 = {
      ...graph,
      traversalNodesById: {
        "watchtower-node": graph.traversalNodesById["watchtower-node"]!,
        "spawn-node": graph.traversalNodesById["spawn-node"]!,
      },
    };

    expect(hashTraversalGraphV1(reordered)).toBe(hashTraversalGraphV1(graph));
  });

  it("changes the graph hash when the lock or surface identity changes", () => {
    const graph = validGraph();
    const lockMutated = validGraph({
      resolvedTraversalLockHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const identityMutated = validGraph({
      traversalNodesById: {
        ...graph.traversalNodesById,
        "spawn-node": node({
          id: "spawn-node",
          traversalSurfaceId: "other-surface",
          positionMetersXYZ: [0, 0.15, 0],
        }),
      },
    });

    expect(hashTraversalGraphV1(lockMutated)).not.toBe(hashTraversalGraphV1(graph));
    expect(hashTraversalGraphV1(identityMutated)).not.toBe(
      hashTraversalGraphV1(graph),
    );
  });

  it("rejects a forged Graph Builder identity and incomplete Surface identity", () => {
    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        graphBuilderProfileHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        graphBuilderProfileRef: "worldkit://traversal-graph-builder-profile/forged@1",
      })),
    ).toThrow("TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND");

    expect(() =>
      assertTraversalSurfaceIdentityV1({
        traversalSurfaceId: "spawn-apron-surface",
        surfaceEntityId: "spawn-apron",
        colliderSubshapeId: "spawn-apron-top",
      }),
    ).toThrow("TRAVERSAL_SURFACE_IDENTITY_INVALID");

    expect(() =>
      assertTraversalSurfaceIdentityV1({
        traversalSurfaceId: "same",
        surfaceEntityId: "same",
        colliderSubshapeId: "same",
        resourceRef: "worldkit://traversal-surface/same@1",
        resolvedVersion: "1",
        resourceHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toThrow("TRAVERSAL_SURFACE_IDENTITY_INVALID");
  });

  it("accepts exact V1/V2 builder identities and rejects cross-paired hashes", () => {
    const v1 = resolveTraversalGraphBuilderProfile(
      BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const v2 = resolveTraversalGraphBuilderProfile(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const v2Graph = validGraph({
      graphBuilderProfileRef: v2.resourceRef,
      graphBuilderResolvedVersion: v2.resolvedVersion,
      graphBuilderProfileHash: v2.contentHash,
    });

    expect(canonicalTraversalGraphV1(v2Graph).graphBuilderProfileRef).toBe(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    expect(() => canonicalTraversalGraphV1({
      ...v2Graph,
      graphBuilderProfileHash: v1.contentHash,
    })).toThrow("TRAVERSAL_GRAPH_INVALID");
    expect(() => canonicalTraversalGraphV1(validGraph({
      graphBuilderProfileRef: v1.resourceRef,
      graphBuilderProfileHash: v2.contentHash,
    }))).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("rejects negative distance, non-positive clearance, and out-of-range slope", () => {
    const graph = validGraph();
    const walk = graph.traversalEdgesById["spawn-to-watchtower-walk"]!;

    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": { ...walk, distanceMeters: -1 },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": { ...walk, slopeDegrees: 181 },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": {
            ...walk,
            minimumClearanceWidthMeters: -1,
          },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1(validGraph({
        traversalNodesById: {
          ...graph.traversalNodesById,
          "spawn-node": node({
            id: "spawn-node",
            clearanceHeightMeters: 0,
          }),
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("rejects a self hash field, collapsed surface ids, and duration costs", () => {
    expect(() =>
      canonicalTraversalGraphV1({
        ...validGraph(),
        traversalGraphHash: HASH_A,
      } as TraversalGraphV1),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1(
        validGraph({
          traversalNodesById: {
            "spawn-node": node({
              id: "spawn-node",
              traversalSurfaceId: "same",
              surfaceEntityId: "same",
              colliderSubshapeId: "same",
            }),
          },
        }),
      ),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV1({
        ...validGraph(),
        routeTraversalCostSeconds: 3.2,
      } as TraversalGraphV1),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");
  });
});
