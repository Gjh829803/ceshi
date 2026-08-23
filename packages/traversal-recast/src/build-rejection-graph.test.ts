import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  assertTraversalGraphBuildBudgetV1,
  hashHeightfieldRouteBuildInputV1,
  type CanonicalTriangleSoupV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteBuildInputV1,
  type StaticBlockingColliderV1,
} from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import {
  buildSourceDerivedRouteRejectionProofInputV1,
  hasPositiveProjectedTriangleOverlapV1,
  quantizeInsufficientClearanceWidthMetersV1,
} from "./build-rejection-graph.js";
import { routeConnectivityReasonForRejectionProofV1 } from "./evaluate-route.js";
import { evaluateRouteRejectionProofV1 } from "./route-rejection-proof.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

type Vec3 = readonly [number, number, number];

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boxCollider(
  colliderSubshapeId: string,
  minimumMetersXYZ: Vec3,
  maximumMetersXYZ: Vec3,
): StaticBlockingColliderV1 {
  const [minimumX, minimumY, minimumZ] = minimumMetersXYZ;
  const [maximumX, maximumY, maximumZ] = maximumMetersXYZ;
  const triangleSoup: CanonicalTriangleSoupV1 = {
    positionsMetersXYZ: [
      minimumX, minimumY, minimumZ,
      maximumX, minimumY, minimumZ,
      maximumX, maximumY, minimumZ,
      minimumX, maximumY, minimumZ,
      minimumX, minimumY, maximumZ,
      maximumX, minimumY, maximumZ,
      maximumX, maximumY, maximumZ,
      minimumX, maximumY, maximumZ,
    ],
    triangleIndices: [
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ],
  };
  return {
    entityId: `entity-${colliderSubshapeId}`,
    logicalSubshapeId: `logical-${colliderSubshapeId}`,
    colliderSubshapeId,
    colliderHash: sha256CanonicalJson(triangleSoup) as `sha256:${string}`,
    triangleSoup,
  };
}

function compoundBoxCollider(
  colliderSubshapeId: string,
  boxes: readonly Readonly<{
    minimumMetersXYZ: Vec3;
    maximumMetersXYZ: Vec3;
  }>[],
): StaticBlockingColliderV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (const [index, box] of boxes.entries()) {
    const part = boxCollider(
      `${colliderSubshapeId}-part-${index}`,
      box.minimumMetersXYZ,
      box.maximumMetersXYZ,
    ).triangleSoup;
    const vertexOffset = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(...part.positionsMetersXYZ);
    triangleIndices.push(...part.triangleIndices.map((value) => value + vertexOffset));
  }
  const triangleSoup = { positionsMetersXYZ, triangleIndices };
  return {
    entityId: `entity-${colliderSubshapeId}`,
    logicalSubshapeId: `logical-${colliderSubshapeId}`,
    colliderSubshapeId,
    colliderHash: sha256CanonicalJson(triangleSoup) as `sha256:${string}`,
    triangleSoup,
  };
}

function quadSoup(
  quads: readonly Readonly<{
    minimumX: number;
    maximumX: number;
    minimumZ?: number;
    maximumZ?: number;
    leftY: number;
    rightY: number;
  }>[],
): CanonicalTriangleSoupV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (const quad of quads) {
    const minimumZ = quad.minimumZ ?? -0.5;
    const maximumZ = quad.maximumZ ?? 0.5;
    const base = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(
      quad.minimumX, quad.leftY, minimumZ,
      quad.minimumX, quad.leftY, maximumZ,
      quad.maximumX, quad.rightY, minimumZ,
      quad.maximumX, quad.rightY, maximumZ,
    );
    triangleIndices.push(
      base, base + 1, base + 2,
      base + 2, base + 1, base + 3,
    );
  }
  return { positionsMetersXYZ, triangleIndices };
}

function disconnectedTriangleSoup(count: number): CanonicalTriangleSoupV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const minimumX = index * 0.01;
    const base = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(
      minimumX, 0, -0.4,
      minimumX, 0, -0.3,
      minimumX + 0.002, 0, -0.4,
    );
    triangleIndices.push(base, base + 1, base + 2);
  }
  return { positionsMetersXYZ, triangleIndices };
}

function receipt(input: Readonly<{
  terrainSoup: CanonicalTriangleSoupV1;
  blockingColliders?: readonly StaticBlockingColliderV1[];
  startPositionMetersXYZ?: Vec3;
  destinationPositionMetersXYZ?: Vec3;
  routePointsMetersXZ?: readonly (readonly [number, number])[];
  routeWidthMeters?: number;
}>): HeightfieldRouteBuildInputReceiptV1 {
  const resourceLockHash = HASH_C;
  const capabilityEnvelope = createRecastTestEnvelopeV1({ resourceLockHash });
  const blockingColliders = [...(input.blockingColliders ?? [])]
    .sort((left, right) => left.colliderSubshapeId < right.colliderSubshapeId ? -1 : 1);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let offset = 0; offset < input.terrainSoup.positionsMetersXYZ.length; offset += 3) {
    xs.push(input.terrainSoup.positionsMetersXYZ[offset]!);
    zs.push(input.terrainSoup.positionsMetersXYZ[offset + 2]!);
  }
  const minimumMetersXZ = [Math.min(...xs), Math.min(...zs)] as const;
  const maximumMetersXZ = [Math.max(...xs), Math.max(...zs)] as const;
  const buildInput: HeightfieldRouteBuildInputV1 = {
    kind: "heightfield-route-build-input",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash,
    connectivityRequirement: {
      constraintId: "constraint-route",
      traversingEntityId: "player",
      startAnchorEntityId: "anchor-start",
      destinationAnchorEntityId: "anchor-destination",
      routeId: "route-main",
    },
    startAnchor: {
      entityId: "anchor-start",
      positionMetersXYZ: input.startPositionMetersXYZ ?? [0.5, 0, 0],
    },
    destinationAnchor: {
      entityId: "anchor-destination",
      positionMetersXYZ: input.destinationPositionMetersXYZ ?? [5.5, 0, 0],
    },
    hardRibbon: {
      routeId: "route-main",
      pointsMetersXZ: input.routePointsMetersXZ ?? [[0, 0], [6, 0]],
      widthMeters: input.routeWidthMeters ?? 4,
      locomotionProfileRef: capabilityEnvelope.locomotionProfileRef,
    },
    traversalSurface: {
      traversalSurfaceId: "surface-ground",
      surfaceEntityId: "terrain-ground",
      colliderSubshapeId: "collider-terrain",
      resourceRef: "worldkit://terrain/ground@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    },
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded",
      terrainEntityId: "terrain-ground",
      terrainArtifactHash: HASH_B,
      triangleSoup: input.terrainSoup,
      minimumMetersXZ,
      maximumMetersXZ,
    },
    blockingColliders,
    colliderArtifactHash: sha256CanonicalJson(blockingColliders) as `sha256:${string}`,
    blockedTraversalAreaExclusions: [],
    blockedWaterExclusions: [],
  };
  const frozenInput = deepFreeze(buildInput);
  const estimate = assertTraversalGraphBuildBudgetV1({
    minimumMetersXZ,
    maximumMetersXZ,
    tileSizeCells: capabilityEnvelope.tileSizeCells,
    voxelCellSizeMeters: capabilityEnvelope.voxelCellSizeMeters,
    maximumTiles: capabilityEnvelope.maximumTiles,
  });
  return deepFreeze({
    input: frozenInput,
    routeBuildInputHash: hashHeightfieldRouteBuildInputV1(frozenInput),
    budgetEvidence: {
      kind: "heightfield-tile-estimate",
      ...estimate,
      maximumTiles: capabilityEnvelope.maximumTiles,
      minimumMetersXZ,
      maximumMetersXZ,
    },
  });
}

function buildAndEvaluate(
  buildInputReceipt: HeightfieldRouteBuildInputReceiptV1,
  isSourceProjectionConsistent = true,
) {
  const proofInput = buildSourceDerivedRouteRejectionProofInputV1({
    buildInputReceipt,
    isSourceProjectionConsistent,
  });
  expect(proofInput).toBeDefined();
  return {
    proofInput: proofInput!,
    evaluation: evaluateRouteRejectionProofV1(proofInput!),
  };
}

function expectSpecialized(
  actual: ReturnType<typeof evaluateRouteRejectionProofV1>,
  rejectionKind: "slope" | "step" | "width" | "overhead" | "gap",
) {
  expect(actual).toMatchObject({
    status: "specialized",
    rejectionKind,
    proofKind: "unique-single-reason-cut",
  });
  if (actual.status !== "specialized") throw new Error("expected specialized proof");
  expect(actual.proofCandidateIds).toEqual([...actual.proofCandidateIds].sort());
  expect(actual.proofCandidateIds.every((id) =>
    /^route-rejection-candidate:[a-f0-9]{64}$/.test(id),
  )).toBe(true);
  expect(actual.failurePositionMetersXYZ.every(Number.isFinite)).toBe(true);
  expect(actual.failurePositionMetersXYZ.every((value) =>
    Number.isSafeInteger(value / 0.001),
  )).toBe(true);
  expect(routeConnectivityReasonForRejectionProofV1(actual)?.code).toBe({
    slope: "ROUTE_SLOPE_EXCEEDED",
    step: "ROUTE_STEP_HEIGHT_EXCEEDED",
    width: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
    overhead: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
    gap: "ROUTE_SURFACE_GAP_EXCEEDED",
  }[rejectionKind]);
}

describe("buildSourceDerivedRouteRejectionProofInputV1", () => {
  it("drops a width observation that quantizes up to the required width", () => {
    expect(quantizeInsufficientClearanceWidthMetersV1(0.7395, 0.74, 0.001))
      .toBeUndefined();
    expect(quantizeInsufficientClearanceWidthMetersV1(0.7385, 0.74, 0.001))
      .toBe(0.739);
  });

  it("detects positive-area overlap before summing ceiling coverage", () => {
    expect(hasPositiveProjectedTriangleOverlapV1([
      [[0, 0], [2, 0], [0, 2]],
      [[0.25, 0.25], [1, 0.25], [0.25, 1]],
    ])).toBe(true);
    expect(hasPositiveProjectedTriangleOverlapV1([
      [[0, 0], [1, 0], [0, 1]],
      [[1, 0], [1, 1], [0, 1]],
    ])).toBe(false);
  });

  it("derives a unique slope cut from quantized terrain triangle normals", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, leftY: 0, rightY: 0 },
        { minimumX: 2, maximumX: 4, leftY: 0, rightY: 2 },
        { minimumX: 4, maximumX: 6, leftY: 2, rightY: 2 },
      ]),
      destinationPositionMetersXYZ: [5.5, 2, 0],
    }));

    expectSpecialized(evaluation, "slope");
    if (evaluation.status !== "specialized" || evaluation.rejectionReason.kind !== "slope") return;
    expect(evaluation.rejectionReason).toEqual({
      kind: "slope",
      terrainEntityId: "terrain-ground",
      maximumObservedSlopeDegrees: 45,
      maximumAllowedSlopeDegrees: 42,
    });
  });

  it("derives a unique step cut from a quantized shared XZ boundary", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 3, leftY: 0, rightY: 0 },
        { minimumX: 3, maximumX: 6, leftY: 0.5, rightY: 0.5 },
      ]),
      destinationPositionMetersXYZ: [5.5, 0.5, 0],
    }));

    expectSpecialized(evaluation, "step");
    if (evaluation.status !== "specialized" || evaluation.rejectionReason.kind !== "step") return;
    expect(evaluation.rejectionReason.maximumObservedStepHeightMeters).toBe(0.5);
    expect(evaluation.rejectionReason.maximumAllowedStepHeightMeters).toBe(0.3);
  });

  it("derives a unique width cut from complete closed collider soups", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, minimumZ: -0.2, maximumZ: 0.2, leftY: 0, rightY: 0 },
        { minimumX: 2, maximumX: 4, minimumZ: -0.2, maximumZ: 0.2, leftY: 0, rightY: 0 },
        { minimumX: 4, maximumX: 6, minimumZ: -0.2, maximumZ: 0.2, leftY: 0, rightY: 0 },
      ]),
      blockingColliders: [
        boxCollider("wall-north", [-1, -1, 0.25], [7, 3, 2]),
        boxCollider("wall-south", [-1, -1, -2], [7, 3, -0.25]),
      ],
    }));

    expectSpecialized(evaluation, "width");
    if (evaluation.status !== "specialized" || evaluation.rejectionReason.kind !== "width") return;
    expect(evaluation.rejectionReason.relevantColliderSubshapeIds).toEqual([
      "wall-north",
      "wall-south",
    ]);
    expect(evaluation.rejectionReason.minimumObservedClearanceWidthMeters)
      .toBeLessThan(0.74);
    expect(evaluation.rejectionReason.minimumRequiredClearanceWidthMeters).toBe(0.74);
  });

  it("does not project a vertically irrelevant component as a width obstruction", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, leftY: 0, rightY: 0 },
        { minimumX: 2, maximumX: 4, leftY: 0, rightY: 0 },
        { minimumX: 4, maximumX: 6, leftY: 0, rightY: 0 },
      ]),
      blockingColliders: [
        compoundBoxCollider("split-height", [
          {
            minimumMetersXYZ: [20, -1, -1],
            maximumMetersXYZ: [21, 0.1, 1],
          },
          {
            minimumMetersXYZ: [2, 4, -0.25],
            maximumMetersXYZ: [4, 5, 0.25],
          },
        ]),
      ],
    }));

    expect(evaluation).toEqual({
      status: "generic",
      reason: "ambiguous-or-mixed-cut",
    });
  });

  it("keeps a tall solid blocker from being hidden by a separate slope cut", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        {
          minimumX: 0,
          maximumX: 2,
          minimumZ: -2,
          maximumZ: 2,
          leftY: 0,
          rightY: 0,
        },
        {
          minimumX: 2,
          maximumX: 4,
          minimumZ: -2,
          maximumZ: 2,
          leftY: 0,
          rightY: 2,
        },
        {
          minimumX: 4,
          maximumX: 6,
          minimumZ: -2,
          maximumZ: 2,
          leftY: 2,
          rightY: 2,
        },
      ]),
      blockingColliders: [
        boxCollider("tall-solid", [4, -1, -2], [6, 8, 2]),
      ],
      destinationPositionMetersXYZ: [5.5, 2, 0],
    }));

    expect(evaluation).toEqual({
      status: "generic",
      reason: "ambiguous-or-mixed-cut",
    });
  });

  it("derives a unique overhead cut only from a covering downward collider surface", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, leftY: 0, rightY: 0 },
        { minimumX: 2, maximumX: 4, leftY: 0, rightY: 0 },
        { minimumX: 4, maximumX: 6, leftY: 0, rightY: 0 },
      ]),
      blockingColliders: [
        boxCollider("ceiling", [1.5, 1.5, -1.5], [4.5, 1.8, 1.5]),
      ],
    }));

    expectSpecialized(evaluation, "overhead");
    if (
      evaluation.status !== "specialized" ||
      evaluation.rejectionReason.kind !== "overhead"
    ) return;
    expect(evaluation.rejectionReason.relevantColliderSubshapeIds).toEqual(["ceiling"]);
    expect(evaluation.rejectionReason.minimumObservedClearanceHeightMeters).toBe(1.5);
    expect(evaluation.rejectionReason.minimumRequiredClearanceHeightMeters).toBe(1.92);
  });

  it("derives a unique gap cut only between mutually nearest route-crossing boundaries", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, leftY: 0, rightY: 0 },
        { minimumX: 2.2, maximumX: 6, leftY: 0, rightY: 0 },
      ]),
    }));

    expectSpecialized(evaluation, "gap");
    if (evaluation.status !== "specialized" || evaluation.rejectionReason.kind !== "gap") return;
    expect(evaluation.rejectionReason.maximumObservedSurfaceGapMeters).toBe(0.2);
    expect(evaluation.rejectionReason.maximumAllowedSurfaceGapMeters).toBe(0);
  });

  it("falls back to generic for a mixed slope-plus-step cut", () => {
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 2, leftY: 0, rightY: 0 },
        { minimumX: 2, maximumX: 4, leftY: 0, rightY: 2 },
        { minimumX: 4, maximumX: 6, leftY: 2.5, rightY: 2.5 },
      ]),
      destinationPositionMetersXYZ: [5.5, 2.5, 0],
    }));

    expect(evaluation).toEqual({
      status: "generic",
      reason: "ambiguous-or-mixed-cut",
    });
  });

  it("does not specialize when the unrelaxed source graph is already connected", () => {
    const { proofInput, evaluation } = buildAndEvaluate(receipt({
      terrainSoup: quadSoup([
        { minimumX: 0, maximumX: 3, leftY: 0, rightY: 0 },
        { minimumX: 3, maximumX: 6, leftY: 0, rightY: 0 },
      ]),
    }));

    expect(proofInput.nodeIds).toContain(proofInput.startNodeId);
    expect(proofInput.nodeIds).toContain(proofInput.destinationNodeId);
    expect(evaluation).toEqual({
      status: "generic",
      reason: "ambiguous-or-mixed-cut",
    });
  });

  it("falls back to generic when distinct step and width relaxations each restore a lane", () => {
    const terrainSoup: CanonicalTriangleSoupV1 = {
      positionsMetersXYZ: [
        -2, 0, 0, 0, 0, 2, 0, 0, 0,
        0, 0.5, 2, 2, 0.5, 0, 0, 0.5, 0,
        2, 0, 0, 0, 0, -2, 0, 0, 0,
        0, 0, -2, -2, 0, 0, 0, 0, 0,
      ],
      triangleIndices: [
        0, 1, 2,
        3, 4, 5,
        6, 7, 8,
        9, 10, 11,
      ],
    };
    const { evaluation } = buildAndEvaluate(receipt({
      terrainSoup,
      blockingColliders: [
        boxCollider("blocked-lane", [-2.1, -1, -2.1], [0.1, 3, 0.1]),
      ],
      startPositionMetersXYZ: [-1.4, 0, 0.3],
      destinationPositionMetersXYZ: [1.4, 0, -0.3],
      routePointsMetersXZ: [[-2, 0], [2, 0]],
      routeWidthMeters: 4.5,
    }));

    expect(evaluation).toEqual({
      status: "generic",
      reason: "ambiguous-or-mixed-cut",
    });
  });

  it("copies admitted budgets and makes proof-search exhaustion generic", () => {
    const proofInput = buildSourceDerivedRouteRejectionProofInputV1({
      buildInputReceipt: receipt({
        terrainSoup: quadSoup([
          { minimumX: 0, maximumX: 3, leftY: 0, rightY: 0 },
          { minimumX: 3, maximumX: 6, leftY: 0.5, rightY: 0.5 },
        ]),
        destinationPositionMetersXYZ: [5.5, 0.5, 0],
      }),
      isSourceProjectionConsistent: true,
    });
    expect(proofInput).toBeDefined();
    expect(proofInput!.maximumNodes).toBe(100_000);
    expect(proofInput!.maximumEdges).toBe(200_000);
    expect(proofInput!.maximumSearchSteps).toBe(100_000);
    expect(proofInput!.isProofBudgetExhausted).toBe(false);
    expect(evaluateRouteRejectionProofV1({
      ...proofInput!,
      maximumSearchSteps: 1,
    })).toEqual({ status: "generic", reason: "proof-budget-exhausted" });
  });

  it("falls back to proof-budget generic when source-boundary pairing exhausts the admitted search budget", () => {
    const proofInput = buildSourceDerivedRouteRejectionProofInputV1({
      buildInputReceipt: receipt({
        terrainSoup: disconnectedTriangleSoup(150),
      }),
      isSourceProjectionConsistent: true,
    });

    expect(proofInput).toBeDefined();
    expect(proofInput!.isProofBudgetExhausted).toBe(true);
    expect(proofInput!.nodeIds).toHaveLength(2);
    expect(evaluateRouteRejectionProofV1(proofInput!)).toEqual({
      status: "generic",
      reason: "proof-budget-exhausted",
    });
  });

  it("builds stable frozen provider-neutral IDs and preserves source inconsistency", () => {
    const terrainSoup = quadSoup([
      { minimumX: 0, maximumX: 3, leftY: 0, rightY: 0 },
      { minimumX: 3, maximumX: 6, leftY: 0.5, rightY: 0.5 },
    ]);
    const first = buildSourceDerivedRouteRejectionProofInputV1({
      buildInputReceipt: receipt({ terrainSoup, destinationPositionMetersXYZ: [5.5, 0.5, 0] }),
      isSourceProjectionConsistent: true,
    });
    const reversed = buildSourceDerivedRouteRejectionProofInputV1({
      buildInputReceipt: receipt({
        terrainSoup: {
          ...terrainSoup,
          triangleIndices: [...terrainSoup.triangleIndices]
            .reduce<number[][]>((rows, value, index) => {
              if (index % 3 === 0) rows.push([]);
              rows.at(-1)!.push(value);
              return rows;
            }, [])
            .reverse()
            .flat(),
        },
        destinationPositionMetersXYZ: [5.5, 0.5, 0],
      }),
      isSourceProjectionConsistent: true,
    });
    expect(first).toEqual(reversed);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first!.candidates)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/recast|provider|polygonRef|tileRef|status/i);
    expect(evaluateRouteRejectionProofV1({
      ...first!,
      isSourceProjectionConsistent: false,
    })).toEqual({
      status: "generic",
      reason: "source-projection-inconsistent",
    });
  });

  it("rejects a source step whose quantized height difference exceeds safe units", () => {
    expect(() => buildSourceDerivedRouteRejectionProofInputV1({
      buildInputReceipt: receipt({
        terrainSoup: quadSoup([
          { minimumX: 0, maximumX: 3, leftY: -5_000_000_000_000, rightY: -5_000_000_000_000 },
          { minimumX: 3, maximumX: 6, leftY: 5_000_000_000_000, rightY: 5_000_000_000_000 },
        ]),
        startPositionMetersXYZ: [0.5, -5_000_000_000_000, 0],
        destinationPositionMetersXYZ: [5.5, 5_000_000_000_000, 0],
      }),
      isSourceProjectionConsistent: true,
    })).toThrow(/step height units.*safe integer/);
  });
});
