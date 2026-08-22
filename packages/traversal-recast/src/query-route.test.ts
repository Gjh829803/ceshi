import type {
  TraversalEdgeV1,
  TraversalGraphV1,
  TraversalNodeV1,
} from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import { selectCanonicalTraversalPathV1 } from "./query-route.js";

const HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function node(id: string, x: number, z = 0): TraversalNodeV1 {
  return {
    id,
    traversalSurfaceId: "surface-main",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    positionMetersXYZ: [x, 0, z],
    tileId: "tile-main",
    clearanceWidthMeters: 1,
    clearanceHeightMeters: 2,
  };
}

function edge(
  id: string,
  fromTraversalNodeId: string,
  toTraversalNodeId: string,
  routePathCost: number,
): TraversalEdgeV1 {
  return {
    id,
    type: "walk",
    fromTraversalNodeId,
    toTraversalNodeId,
    distanceMeters: 1,
    heightDeltaMeters: 0,
    stepHeightMeters: 0,
    slopeDegrees: 0,
    minimumClearanceWidthMeters: 1,
    minimumClearanceHeightMeters: 2,
    routePathCost,
  };
}

function graph(
  nodes: readonly TraversalNodeV1[],
  edges: readonly TraversalEdgeV1[],
): TraversalGraphV1 {
  return {
    kind: "traversal-graph",
    schemaVersion: 1,
    authoringSpecHash: HASH,
    layoutSolveReportHash: HASH,
    resourceLockHash: HASH,
    terrainArtifactHash: HASH,
    colliderArtifactHash: HASH,
    surfaceArtifactHash: HASH,
    routeBuildInputHash: HASH,
    resolvedTraversalLockHash: HASH,
    graphBuilderProfileRef:
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1",
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash:
      "sha256:65fdc54014d57c6eae75bd0f89e534333877ca6400e452526f16ebbd45e8b94a",
    routeId: "route-main",
    startAnchorEntityId: "start",
    destinationAnchorEntityId: "destination",
    traversalNodesById: Object.fromEntries(nodes.map((value) => [value.id, value])),
    traversalEdgesById: Object.fromEntries(edges.map((value) => [value.id, value])),
  };
}

const PROFILE = {
  maximumEdgeLengthMeters: 2.4,
  positionQuantizationMeters: 0.001,
  maximumSearchSteps: 100,
} as const;

describe("selectCanonicalTraversalPathV1", () => {
  it("selects the lowest SDK cost instead of the fewest edges", () => {
    const value = graph(
      [node("start", 0), node("short", 1), node("long-a", 1, 1), node("long-b", 2, 1), node("goal", 3)],
      [
        edge("edge-short-a", "start", "short", 5),
        edge("edge-short-b", "short", "goal", 5),
        edge("edge-long-a", "start", "long-a", 1),
        edge("edge-long-b", "long-a", "long-b", 1),
        edge("edge-long-c", "long-b", "goal", 1),
      ],
    );

    expect(selectCanonicalTraversalPathV1({
      traversalGraph: value,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      ...PROFILE,
    })).toEqual({
      status: "complete",
      orderedTraversalNodeIds: ["start", "long-a", "long-b", "goal"],
      orderedTraversalEdgeIds: ["edge-long-a", "edge-long-b", "edge-long-c"],
      routePathCostUnits: 3_000_000,
      settledCount: 4,
    });
  });

  it("chooses the lexicographically smallest complete edge sequence on equal cost", () => {
    const value = graph(
      [node("start", 0), node("via-a", 1, -1), node("via-z", 1, 1), node("goal", 2)],
      [
        edge("z-first", "start", "via-z", 1),
        edge("z-last", "via-z", "goal", 1),
        edge("a-first", "start", "via-a", 1),
        edge("a-last", "via-a", "goal", 1),
      ],
    );

    expect(selectCanonicalTraversalPathV1({
      traversalGraph: value,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      ...PROFILE,
    })).toMatchObject({
      status: "complete",
      orderedTraversalEdgeIds: ["a-first", "a-last"],
    });
  });

  it("does not add binary floating-point micro-cost units before tie-breaking", () => {
    const value = graph(
      [node("start", 0), node("via", 1), node("goal", 2)],
      [
        edge("z-direct", "start", "goal", 0.2),
        edge("a-first", "start", "via", 0.1),
        edge("a-last", "via", "goal", 0.1),
      ],
    );

    expect(selectCanonicalTraversalPathV1({
      traversalGraph: value,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      ...PROFILE,
    })).toMatchObject({
      status: "complete",
      orderedTraversalEdgeIds: ["a-first", "a-last"],
      routePathCostUnits: 200_000,
    });
  });

  it("distinguishes inclusive maximum-th success, unreachable, and incomplete", () => {
    const success = graph(
      [node("start", 0), node("goal", 1)],
      [edge("edge", "start", "goal", 1)],
    );
    expect(selectCanonicalTraversalPathV1({
      traversalGraph: success,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      maximumEdgeLengthMeters: 2.4,
      positionQuantizationMeters: 0.001,
      maximumSearchSteps: 2,
    })).toMatchObject({ status: "complete", settledCount: 2 });

    const unreachable = graph(
      [node("start", 0), node("dead", 1), node("goal", 3)],
      [edge("dead-edge", "start", "dead", 1)],
    );
    expect(selectCanonicalTraversalPathV1({
      traversalGraph: unreachable,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      maximumEdgeLengthMeters: 2.4,
      positionQuantizationMeters: 0.001,
      maximumSearchSteps: 2,
    })).toEqual({ status: "unreachable", settledCount: 2 });

    const incomplete = graph(
      [node("start", 0), node("one", 1), node("two", 2), node("goal", 4)],
      [edge("one", "start", "one", 1), edge("two", "one", "two", 1)],
    );
    expect(selectCanonicalTraversalPathV1({
      traversalGraph: incomplete,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      maximumEdgeLengthMeters: 2.4,
      positionQuantizationMeters: 0.001,
      maximumSearchSteps: 2,
    })).toEqual({
      status: "incomplete",
      maximumAllowedCount: 2,
      minimumRequiredCount: 3,
      settledCount: 2,
    });
  });

  it("accepts same-node zero-edge success and rejects zero-cost projected edges", () => {
    const same = graph([node("same", 0)], []);
    expect(selectCanonicalTraversalPathV1({
      traversalGraph: same,
      startTraversalNodeId: "same",
      destinationTraversalNodeId: "same",
      ...PROFILE,
    })).toEqual({
      status: "complete",
      orderedTraversalNodeIds: ["same"],
      orderedTraversalEdgeIds: [],
      routePathCostUnits: 0,
      settledCount: 0,
    });

    const invalid = graph(
      [node("start", 0), node("goal", 1)],
      [edge("zero", "start", "goal", 0)],
    );
    expect(() => selectCanonicalTraversalPathV1({
      traversalGraph: invalid,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      ...PROFILE,
    })).toThrow("TRAVERSAL_RECAST_PATH_SELECTION_INVALID");
  });

  it("requires the locked position quantum used by the deterministic heuristic", () => {
    const value = graph(
      [node("start", 0), node("goal", 1)],
      [edge("edge", "start", "goal", 1)],
    );
    expect(() => selectCanonicalTraversalPathV1({
      traversalGraph: value,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      maximumEdgeLengthMeters: 2.4,
      positionQuantizationMeters: 0,
      maximumSearchSteps: 2,
    })).toThrow(/positionQuantizationMeters/);
  });

  it("floors heuristic distance on the locked position grid before open-set ordering", () => {
    const value = graph(
      [
        node("start", 0),
        node("a-good", 1.049),
        node("z-dead", 1.051),
        node("goal", 10),
      ],
      [
        edge("good-entry", "start", "a-good", 1),
        edge("dead-entry", "start", "z-dead", 1),
        edge("goal-entry", "a-good", "goal", 1),
      ],
    );

    expect(selectCanonicalTraversalPathV1({
      traversalGraph: value,
      startTraversalNodeId: "start",
      destinationTraversalNodeId: "goal",
      maximumEdgeLengthMeters: 1,
      positionQuantizationMeters: 0.1,
      maximumSearchSteps: 3,
    })).toMatchObject({
      status: "complete",
      orderedTraversalEdgeIds: ["good-entry", "goal-entry"],
      settledCount: 3,
    });
  });
});
