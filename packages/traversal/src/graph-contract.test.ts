import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  resolveTraversalGraphBuilderProfile,
  resolveTraversalGraphBuilderProfileV1,
  resolveTraversalGraphBuilderProfileV2,
} from "./index.js";
import {
  assertTraversalSurfaceIdentityV1,
  canonicalTraversalGraphV2,
  hashTraversalGraphV2,
  type TraversalGraphV2,
  type TraversalNodeV1,
} from "./graph-contract.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function node(
  overrides: Partial<TraversalNodeV1> & Pick<TraversalNodeV1, "id">,
): TraversalNodeV1 {
  return {
    traversalSurfaceId: "surface-main",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    positionMetersXYZ: [0, 0, 0],
    tileId: "tile-0",
    clearanceWidthMeters: 1.2,
    clearanceHeightMeters: 2,
    ...overrides,
  };
}

function validGraph(
  overrides: Partial<TraversalGraphV2> = {},
): TraversalGraphV2 {
  const builder = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  return {
    kind: "traversal-graph",
    schemaVersion: 2,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    terrainArtifactHash: HASH_A,
    colliderArtifactHash: HASH_A,
    surfaceArtifactHash: HASH_A,
    geometryArtifactHash: HASH_A,
    traversalSurfaceIdentitiesById: {
      "surface-main": {
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
        resolvedVersion: "1",
        resourceHash: HASH_A,
      },
    },
    routeBuildInputHash: HASH_A,
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
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        positionMetersXYZ: [0, 0.15, 0],
      }),
      "watchtower-node": node({
        id: "watchtower-node",
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        positionMetersXYZ: [12, 1.2, -8],
        tileId: "tile-1",
      }),
    },
    traversalEdgesById: {
      "spawn-to-watchtower-walk": {
        id: "spawn-to-watchtower-walk",
        type: "slope",
        fromTraversalNodeId: "spawn-node",
        toTraversalNodeId: "watchtower-node",
        distanceMeters: 14.4,
        heightDeltaMeters: 1.05,
        stepHeightMeters: 0,
        slopeDegrees: 4.2,
        minimumClearanceWidthMeters: 1.2,
        minimumClearanceHeightMeters: 2,
        routePathCost: 14.4,
      },
    },
    ...overrides,
  };
}

describe("canonicalTraversalGraphV2", () => {
  it("canonicalizes graph bytes without a self-referential hash field", () => {
    const graph = validGraph();
    const canonical = canonicalTraversalGraphV2(graph);

    expect(canonical).not.toHaveProperty("traversalGraphHash");
    expect(canonical.kind).toBe("traversal-graph");
    expect(canonical.traversalNodesById["spawn-node"]?.traversalSurfaceId)
      .not.toBe(
        canonical.traversalNodesById["spawn-node"]?.surfaceEntityId,
      );
    expect(canonical.traversalNodesById["spawn-node"]?.surfaceEntityId).not.toBe(
      canonical.traversalNodesById["spawn-node"]?.colliderSubshapeId,
    );
    expect(hashTraversalGraphV2(graph)).toBe(sha256CanonicalJson(canonical));
    expect(hashTraversalGraphV2(graph)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("emits sorted deeply frozen maps independently of insertion order", () => {
    const graph = validGraph();
    const edge = graph.traversalEdgesById["spawn-to-watchtower-walk"]!;
    const ordered = validGraph({
      traversalEdgesById: {
        "a-edge": { ...edge, id: "a-edge" },
        "z-edge": { ...edge, id: "z-edge" },
      },
    });
    const reordered: TraversalGraphV2 = {
      ...ordered,
      traversalNodesById: {
        "watchtower-node": graph.traversalNodesById["watchtower-node"]!,
        "spawn-node": graph.traversalNodesById["spawn-node"]!,
      },
      traversalEdgesById: {
        "z-edge": ordered.traversalEdgesById["z-edge"]!,
        "a-edge": ordered.traversalEdgesById["a-edge"]!,
      },
    };

    const canonical = canonicalTraversalGraphV2(reordered);
    expect(Object.keys(canonical.traversalNodesById)).toEqual([
      "spawn-node",
      "watchtower-node",
    ]);
    expect(Object.keys(canonical.traversalEdgesById)).toEqual([
      "a-edge",
      "z-edge",
    ]);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.traversalNodesById)).toBe(true);
    expect(Object.isFrozen(canonical.traversalNodesById["spawn-node"]!.positionMetersXYZ))
      .toBe(true);
    expect(hashTraversalGraphV2(reordered)).toBe(hashTraversalGraphV2(ordered));
  });

  it("uses locale-independent code-unit ordering for canonical map keys", () => {
    const canonical = canonicalTraversalGraphV2(validGraph({
      traversalNodesById: {
        "a_": node({ id: "a_" }),
        "a-": node({ id: "a-" }),
      },
      traversalEdgesById: {},
    }));

    expect(Object.keys(canonical.traversalNodesById)).toEqual(["a-", "a_"]);
  });

  it("changes the graph hash when the lock, source input, or surface identity changes", () => {
    const graph = validGraph();
    const lockMutated = validGraph({
      resolvedTraversalLockHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const identityMutated = validGraph({
      traversalSurfaceIdentitiesById: {
        ...graph.traversalSurfaceIdentitiesById,
        "other-surface": {
          traversalSurfaceId: "other-surface",
          surfaceEntityId: "terrain-other",
          colliderSubshapeId: "terrain-other-heightfield",
          resourceRef: "package://traversal-surface/terrain-other.heightfield@1",
          resolvedVersion: "1",
          resourceHash: HASH_A,
        },
      },
      traversalNodesById: {
        ...graph.traversalNodesById,
        "spawn-node": node({
          id: "spawn-node",
          traversalSurfaceId: "other-surface",
          surfaceEntityId: "terrain-other",
          colliderSubshapeId: "terrain-other-heightfield",
          positionMetersXYZ: [0, 0.15, 0],
        }),
      },
    });
    const sourceMutated = validGraph({
      routeBuildInputHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });

    expect(hashTraversalGraphV2(lockMutated)).not.toBe(hashTraversalGraphV2(graph));
    expect(hashTraversalGraphV2(sourceMutated)).not.toBe(
      hashTraversalGraphV2(graph),
    );
    expect(hashTraversalGraphV2(identityMutated)).not.toBe(
      hashTraversalGraphV2(graph),
    );
  });

  it("rejects a forged Graph Builder identity and incomplete Surface identity", () => {
    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        graphBuilderProfileHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
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

    expect(canonicalTraversalGraphV2(v2Graph).graphBuilderProfileRef).toBe(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    expect(() => canonicalTraversalGraphV2({
      ...v2Graph,
      graphBuilderProfileHash: v1.contentHash,
    })).toThrow("TRAVERSAL_GRAPH_INVALID");
    expect(() => canonicalTraversalGraphV2(validGraph({
      graphBuilderProfileRef: v1.resourceRef,
      graphBuilderProfileHash: v2.contentHash,
    }))).toThrow(/TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND|TRAVERSAL_GRAPH_INVALID/);
  });

  it("rejects negative distance, non-positive clearance, and out-of-range slope", () => {
    const graph = validGraph();
    const walk = graph.traversalEdgesById["spawn-to-watchtower-walk"]!;

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": { ...walk, distanceMeters: -1 },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": { ...walk, slopeDegrees: 181 },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": {
            ...walk,
            minimumClearanceWidthMeters: -1,
          },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        traversalNodesById: {
          ...graph.traversalNodesById,
          "spawn-node": node({
            id: "spawn-node",
            clearanceHeightMeters: 0,
          }),
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(validGraph({
        traversalEdgesById: {
          "spawn-to-watchtower-walk": { ...walk, stepHeightMeters: -0.1 },
        },
      })),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("keeps signed height delta distinct from non-negative step evidence and closes type priority", () => {
    const graph = validGraph();
    const slope = graph.traversalEdgesById["spawn-to-watchtower-walk"]!;

    expect(canonicalTraversalGraphV2(graph).traversalEdgesById[
      "spawn-to-watchtower-walk"
    ]).toMatchObject({
      type: "slope",
      heightDeltaMeters: 1.05,
      stepHeightMeters: 0,
    });
    expect(() => canonicalTraversalGraphV2(validGraph({
      traversalEdgesById: {
        "spawn-to-watchtower-walk": { ...slope, type: "walk" },
      },
    }))).toThrow("TRAVERSAL_GRAPH_INVALID");
    expect(canonicalTraversalGraphV2(validGraph({
      traversalEdgesById: {
        "spawn-to-watchtower-walk": {
          ...slope,
          type: "step",
          heightDeltaMeters: -0.2,
          stepHeightMeters: 0.25,
        },
      },
    })).traversalEdgesById["spawn-to-watchtower-walk"]).toMatchObject({
      type: "step",
      heightDeltaMeters: -0.2,
      stepHeightMeters: 0.25,
    });
  });

  it("rejects a self hash field, collapsed surface ids, and duration costs", () => {
    expect(() =>
      canonicalTraversalGraphV2({
        ...validGraph(),
        traversalGraphHash: HASH_A,
      } as TraversalGraphV2),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() =>
      canonicalTraversalGraphV2(
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
      canonicalTraversalGraphV2({
        ...validGraph(),
        routeTraversalCostSeconds: 3.2,
      } as TraversalGraphV2),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("requires exactly one canonical routeBuildInputHash", () => {
    const {
      routeBuildInputHash: _routeBuildInputHash,
      ...missing
    } = validGraph();
    expect(() =>
      canonicalTraversalGraphV2(missing as TraversalGraphV2),
    ).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() => canonicalTraversalGraphV2(validGraph({
      routeBuildInputHash: "sha256:not-a-hash",
    }))).toThrow("TRAVERSAL_GRAPH_INVALID");

    expect(() => canonicalTraversalGraphV2({
      ...validGraph(),
      routeBuildInputHashAlias: HASH_A,
    } as TraversalGraphV2)).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("pins the V1 Traversal Graph canonical hash", () => {
    expect(hashTraversalGraphV2(validGraph())).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
