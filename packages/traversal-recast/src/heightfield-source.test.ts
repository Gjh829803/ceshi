import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  emitStaticColliderTriangleMeshV1,
  emitTransformedStaticColliderTriangleMeshV1,
} from "@whitebox-world/terrain-surface";
import { describe, expect, it } from "vitest";

import { deriveColliderSubshapeIdV1 } from "@whitebox-world/traversal";
import { isNil } from "lodash-es";

import {
  createRouteBuildInputFromPlanV2,
  evaluateRequiredRouteV2,
} from "./index.js";
import * as heightfieldSourceModule from "./heightfield-source.js";
import {
  createRecastTestEnvelopeV1,
  createRecastTestLockReceiptV1,
} from "./test-fixture.test-support.js";
import {
  createMultiSurfaceRouteBuildInputReceiptV2,
} from "./test-fixture.test-support.js";
import { mapRouteBuildInputToRecastSourceV2 } from "./heightfield-source.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

type DeepMutable<T> = T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

interface HeightfieldSourcePlanFixture {
  kind: CanonicalSceneExecutionPlanV1["kind"];
  schemaVersion: 1;
  authoringSpecHash: CanonicalSceneExecutionPlanV1["authoringSpecHash"];
  routeResourceLockHash: string;
  coordinateSystem: CanonicalSceneExecutionPlanV1["coordinateSystem"];
  terrain: DeepMutable<CanonicalSceneExecutionPlanV1["terrain"]>;
  waters: DeepMutable<CanonicalSceneExecutionPlanV1["waters"]>;
  subjectInstances: Array<{ entityId: string }>;
  staticColliders: DeepMutable<CanonicalSceneExecutionPlanV1["staticColliders"]>;
  layout: {
    layoutSolveReportHash: string;
    routes: DeepMutable<CanonicalSceneExecutionPlanV1["layout"]["routes"]>;
    placementsByEntityId: Record<
      string,
      DeepMutable<
        CanonicalSceneExecutionPlanV1["layout"]["placementsByEntityId"][string]
      >
    >;
  };
  traversal: DeepMutable<CanonicalSceneExecutionPlanV1["traversal"]>;
}

type MutablePlacement = DeepMutable<
  CanonicalSceneExecutionPlanV1["layout"]["placementsByEntityId"][string]
>;
type MutableWater = DeepMutable<CanonicalSceneExecutionPlanV1["waters"][number]>;
type MutableWaterBoundary = MutableWater["boundary"];

function placement(
  entityId: string,
  positionMetersXYZ: [number, number, number],
): MutablePlacement {
  return {
    entityId,
    transform: {
      positionMetersXYZ,
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    },
    placementProvenance: {
      kind: "fixed",
      candidateId: `fixed:${entityId}`,
      placementConstraintIds: [],
      solverProfileRef: "worldkit://layout-solver/test@1",
      layoutSolveReportHash: HASH_A,
    },
  };
}

function flatSamples(columns: number, rows: number, heightMeters = 0): number[] {
  return Array.from({ length: columns * rows }, () => heightMeters);
}

function basePlan(): HeightfieldSourcePlanFixture {
  return {
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    routeResourceLockHash: sha256CanonicalJson([
      "worldkit://capability/locomotion.ground@1",
      "worldkit://subject-definition/player@1",
    ]),
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    terrain: {
      entityId: "terrain-main",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [10, 10],
      resolutionCellsXZ: [5, 5],
      heightSamplesMeters: flatSamples(5, 5),
      heightSamplesHash: HASH_A,
      minimumHeightMeters: 0,
      maximumHeightMeters: 0,
      semanticClassId: "terrain.ground",
    },
    waters: [],
    subjectInstances: [{ entityId: "player" }],
    staticColliders: [],
    layout: {
      layoutSolveReportHash: HASH_A,
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[-4, 0], [4, 0]],
        widthMeters: 2,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
      placementsByEntityId: {
        "spawn-main": placement("spawn-main", [-4, 0, 0]),
        goal: placement("goal", [4, 0, 0]),
      },
    },
    traversal: {
      traversalAreas: [],
      anchorEntityIds: ["goal", "spawn-main"],
      surfaces: [{
        kind: "heightfield",
        traversalSurfaceId: "surface-main",
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: "terrain-heightfield",
        resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
        resolvedVersion: "1",
        resourceHash: HASH_A,
      }],
      connectivityRequirements: [{
        constraintId: "hero-to-goal",
        kind: "connected-by-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

function executionPlanForFixture(
  plan: HeightfieldSourcePlanFixture,
): CanonicalSceneExecutionPlanV1 {
  const { routeResourceLockHash: _, ...executionPlan } = plan;
  return executionPlan as unknown as CanonicalSceneExecutionPlanV1;
}

function build(plan: HeightfieldSourcePlanFixture = basePlan()) {
  const traversalLockReceipt = createRecastTestLockReceiptV1({
    resourceLockHash: plan.routeResourceLockHash as `sha256:${string}`,
  });
  return createRouteBuildInputFromPlanV2({
    executionPlan: executionPlanForFixture(plan),
    capabilityEnvelope: createRecastTestEnvelopeV1({
      resourceLockHash: plan.routeResourceLockHash as `sha256:${string}`,
    }),
    traversalLockReceipt,
    constraintId: "hero-to-goal",
  });
}

function distanceToPolyline(
  point: readonly [number, number],
  points: readonly (readonly [number, number])[],
): number {
  let result = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared === 0) continue;
    const ratio = Math.max(0, Math.min(1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) /
        lengthSquared,
    ));
    result = Math.min(result, Math.hypot(
      point[0] - (start[0] + ratio * dx),
      point[1] - (start[1] + ratio * dz),
    ));
  }
  return result;
}

function minimumFacePlaneDistance(
  positions: readonly number[],
  indices: readonly number[],
  center: readonly [number, number, number],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const point = (corner: number) => {
      const index = indices[offset + corner]! * 3;
      return [positions[index]!, positions[index + 1]!, positions[index + 2]!] as const;
    };
    const a = point(0);
    const b = point(1);
    const c = point(2);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ] as const;
    minimum = Math.min(minimum, Math.abs(
      normal[0] * (center[0] - a[0]) +
      normal[1] * (center[1] - a[1]) +
      normal[2] * (center[2] - a[2]),
    ) / Math.hypot(...normal));
  }
  return minimum;
}

describe("Heightfield Route R1 locked source assembly", () => {
  it("removes a blocked traversal area only from the Graph source and preserves provenance", () => {
    const baseline = build(basePlan());
    const plan = basePlan();
    plan.traversal.traversalAreas = [{
      id: "dry-trench",
      kind: "polygon-xz",
      pointsMetersXZ: [[-1, -2], [1, -2], [1, 2], [-1, 2]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];

    const excluded = build(plan);
    expect(excluded.input.blockedTraversalAreaExclusions).toEqual([{
      traversalAreaId: "dry-trench",
      surfaceEntityId: "terrain-main",
      boundary: {
        kind: "polygon-xz",
        pointsMetersXZ: [[-1, -2], [1, -2], [1, 2], [-1, 2]],
      },
    }]);
    if (
      baseline.input.terrainSource.kind !== "bounded" ||
      excluded.input.terrainSource.kind !== "bounded"
    ) throw new Error("expected bounded Graph sources");
    expect(excluded.input.terrainSource.triangleSoup.triangleIndices.length)
      .toBeLessThan(baseline.input.terrainSource.triangleSoup.triangleIndices.length);
    expect(plan.terrain.heightSamplesMeters).toEqual(flatSamples(5, 5));
  });

  it("rejects a non-simple traversal-area polygon at the Execution Plan trust boundary", () => {
    const plan = basePlan();
    plan.traversal.traversalAreas = [{
      id: "self-crossing-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[0, 0], [3, 0], [0, 2], [2, 2]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];
    expect(() => build(plan)).toThrow("contract-invalid");
  });

  it("rejects a forged Execution Plan that exceeds traversal-area collection limits", () => {
    const regularPolygon = (pointCount: number) =>
      Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2;
        return [Math.cos(angle), Math.sin(angle)] as [number, number];
      });
    const areas = (areaCount: number, pointCount: number) =>
      Array.from({ length: areaCount }, (_, index) => ({
        id: `area-${String(index).padStart(3, "0")}`,
        kind: "polygon-xz" as const,
        pointsMetersXZ: regularPolygon(pointCount),
        surfaceEntityId: "terrain-main",
        mode: "blocked" as const,
      }));
    for (const traversalAreas of [
      areas(65, 4),
      areas(1, 129),
      areas(17, 128),
    ]) {
      const plan = basePlan();
      plan.traversal.traversalAreas = traversalAreas;
      expect(() => build(plan)).toThrow("complexity-budget-exceeded");
    }
  });

  it("rejects traversal-area triangle work before the Area-by-source traversal", () => {
    const plan = basePlan();
    plan.terrain = {
      ...plan.terrain,
      resolutionCellsXZ: [101, 101],
      heightSamplesMeters: flatSamples(101, 101),
    };
    plan.layout.routes[0] = {
      ...plan.layout.routes[0]!,
      widthMeters: 10,
    };
    plan.traversal.traversalAreas = Array.from({ length: 64 }, (_, index) => ({
      id: `area-${String(index).padStart(3, "0")}`,
      kind: "polygon-xz" as const,
      pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      surfaceEntityId: "terrain-main",
      mode: "blocked" as const,
    }));
    expect(() => build(plan)).toThrow("complexity-budget-exceeded");
  });

  it("preserves every overlapping blocked Area and Water provenance deterministically", () => {
    const plan = basePlan();
    plan.traversal.traversalAreas = [{
      id: "z-inner-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }, {
      id: "a-wide-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[-2, -1], [2, -1], [2, 1], [-2, 1]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }, {
      id: "m-partial-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[1, -1], [3, -1], [3, 1], [1, 1]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];
    plan.waters = [{
      entityId: "z-inner-water",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 0.75 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.test",
    }, {
      entityId: "a-wide-water",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1.5 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.test",
    }];

    const first = build(plan);
    const reversed = structuredClone(plan);
    reversed.traversal.traversalAreas.reverse();
    reversed.waters.reverse();
    const second = build(reversed);

    expect(first.input.blockedTraversalAreaExclusions.map(
      (entry) => entry.traversalAreaId,
    )).toEqual(["a-wide-area", "m-partial-area", "z-inner-area"]);
    expect(first.input.blockedWaterExclusions.map(
      (entry) => entry.waterEntityId,
    )).toEqual(["a-wide-water", "z-inner-water"]);
    expect(second.input).toEqual(first.input);
    expect(second.routeBuildInputHash).toBe(first.routeBuildInputHash);
  });

  it("checks swimmable Water against the unclipped-by-Area source", () => {
    const plan = basePlan();
    plan.traversal.traversalAreas = [{
      id: "wide-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];
    plan.waters = [{
      entityId: "overlapped-swimmable-water",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 0.75 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "swimmable",
      semanticClassId: "water.test",
    }];
    expect(() => build(plan)).toThrow("ROUTE_WATER_TRAVERSAL_UNSUPPORTED");
  });

  it("derives the canonical gap diagnostic from a non-Water blocked traversal area", async () => {
    const plan = basePlan();
    plan.terrain = {
      ...plan.terrain,
      sizeMetersXZ: [10, 2],
      resolutionCellsXZ: [11, 2],
      heightSamplesMeters: flatSamples(11, 2),
    };
    plan.traversal.traversalAreas = [{
      id: "dry-trench",
      kind: "polygon-xz",
      pointsMetersXZ: [[-0.1, -2], [0.1, -2], [0.1, 2], [-0.1, 2]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];

    const receipt = build(plan);
    const result = await evaluateRequiredRouteV2({
      buildInputReceipt: receipt,
    });

    expect(receipt.input.blockedWaterExclusions).toEqual([]);
    expect(result.status).toBe("unreachable");
    if (result.status !== "unreachable") return;
    expect(result.connectivityFailure.reason).toMatchObject({
      kind: "surface-gap-exceeded",
      code: "ROUTE_SURFACE_GAP_EXCEEDED",
      maximumObservedSurfaceGapMeters: 2,
      maximumAllowedSurfaceGapMeters: 0,
    });
  });

  it("selects one locked requirement and returns deterministic clipped source evidence", () => {
    const plan = basePlan();
    plan.traversal.connectivityRequirements = [
      {
        ...plan.traversal.connectivityRequirements[0]!,
        constraintId: "other-route",
      },
      plan.traversal.connectivityRequirements[0]!,
    ];
    const first = build(plan);
    const second = build(plan);

    expect(first).toEqual(second);
    expect(first.routeBuildInputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.input.connectivityRequirement.constraintId).toBe("hero-to-goal");
    expect(first.input.startAnchor.positionMetersXYZ).toEqual([-4, 0, 0]);
    expect(first.input.destinationAnchor.positionMetersXYZ).toEqual([4, 0, 0]);
    expect(first.input.terrainSource.kind).toBe("bounded");
    expect(first.budgetEvidence.kind).toBe("route-geometry-tile-estimate");
    expect(Object.isFrozen(first)).toBe(true);

    if (first.input.terrainSource.kind !== "bounded") throw new Error("expected bounded");
    const positions = first.input.terrainSource.triangleSoup.positionsMetersXYZ;
    for (let offset = 0; offset < positions.length; offset += 3) {
      expect(distanceToPolyline(
        [positions[offset]!, positions[offset + 2]!],
        first.input.hardRibbon.pointsMetersXZ,
      )).toBeLessThanOrEqual(first.input.hardRibbon.widthMeters / 2 + 1e-9);
    }
  });

  it("uses exact polyline distance rather than a route convex hull", () => {
    const plan = basePlan();
    plan.layout.routes = [{
      ...plan.layout.routes[0]!,
      pointsMetersXZ: [[-4, -4], [-4, 4], [4, 4], [4, -4]],
    }];
    plan.layout.placementsByEntityId = {
      "spawn-main": placement("spawn-main", [-4, 0, -4]),
      goal: placement("goal", [4, 0, -4]),
    };
    const receipt = build(plan);
    if (receipt.input.terrainSource.kind !== "bounded") throw new Error("expected bounded");
    const positions = receipt.input.terrainSource.triangleSoup.positionsMetersXYZ;
    for (let offset = 0; offset < positions.length; offset += 3) {
      expect(distanceToPolyline(
        [positions[offset]!, positions[offset + 2]!],
        receipt.input.hardRibbon.pointsMetersXZ,
      )).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(positions.some((_, offset) =>
      offset % 3 === 0 &&
      Math.abs(positions[offset]!) < 1 &&
      Math.abs(positions[offset + 2]!) < 1,
    )).toBe(false);
  });

  it("retains complete conservative blockers whose filled projection crosses the ribbon", () => {
    const plan = basePlan();
    plan.staticColliders = [{
      entityId: "wall",
      logicalSubshapeId: "primary",
      colliderSubshapeId: deriveColliderSubshapeIdV1("wall", "primary"),
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 1, 0],
        rotationEulerRadiansXYZ: [0, Math.PI / 6, 0],
        scaleXYZ: [1.5, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [0.4, 2, 4] },
    }];
    const receipt = build(plan);
    expect(receipt.input.staticColliders).toHaveLength(1);
    expect(receipt.input.staticColliders[0]?.triangleSoup.triangleIndices).toHaveLength(36);
    const positions = receipt.input.staticColliders[0]!.triangleSoup
      .positionsMetersXYZ;
    const expectedCorner = [
      -0.3 * Math.cos(Math.PI / 6) - 2 * Math.sin(Math.PI / 6),
      0,
      0.3 * Math.sin(Math.PI / 6) - 2 * Math.cos(Math.PI / 6),
    ];
    expect(Array.from({ length: positions.length / 3 }, (_, index) => [
      positions[index * 3]!,
      positions[index * 3 + 1]!,
      positions[index * 3 + 2]!,
    ]).some((point) => point.every((value, index) =>
      Math.abs(value - expectedCorner[index]!) < 1e-9,
    ))).toBe(true);
  });

  it("keeps Graph Builder blocker soup aligned with canonical full-TRS world vertices", () => {
    const shape = {
      kind: "box" as const,
      sizeMetersXYZ: [2, 2, 2] as [number, number, number],
    };
    const transform = {
      positionMetersXYZ: [1, 2, 0.5] as [number, number, number],
      rotationEulerRadiansXYZ: [
        Math.PI / 2,
        Math.PI / 2,
        Math.PI / 2,
      ] as [number, number, number],
      scaleXYZ: [2, 3, 4] as [number, number, number],
    };
    const expectedWorldPositionsMetersXYZ = [
      -1, 6, -2.5, 3, 6, -2.5, 3, 6, 3.5, -1, 6, 3.5,
      -1, -2, -2.5, 3, -2, -2.5, 3, -2, 3.5, -1, -2, 3.5,
    ];
    const plan = basePlan();
    plan.staticColliders = [{
      entityId: "geometry-conformance-box",
      logicalSubshapeId: "primary",
      colliderSubshapeId: deriveColliderSubshapeIdV1("geometry-conformance-box", "primary"),
      colliderHash: HASH_A,
      transform,
      shape,
    }];

    const blocker = build(plan).input.staticColliders[0]!;
    const canonicalWorldMesh =
      emitTransformedStaticColliderTriangleMeshV1(shape, transform);
    const graphBuilderWorldPositions = blocker.triangleSoup.positionsMetersXYZ;
    const canonicalWorldPositions =
      canonicalWorldMesh.worldPositionsMetersXYZ;

    expect(blocker.colliderSubshapeId).toBe(
      deriveColliderSubshapeIdV1("geometry-conformance-box", "primary"),
    );
    expect(blocker.triangleSoup.triangleIndices).toEqual(
      canonicalWorldMesh.triangleIndices,
    );
    expect(graphBuilderWorldPositions).toHaveLength(
      expectedWorldPositionsMetersXYZ.length,
    );
    expect(graphBuilderWorldPositions).toEqual(canonicalWorldPositions);
    expectedWorldPositionsMetersXYZ.forEach((value, index) => {
      expect(graphBuilderWorldPositions[index]).toBeCloseTo(value, 12);
    });
  });

  it("orders source collider identities without locale-dependent collation", () => {
    const plan = basePlan();
    plan.staticColliders = [
      {
        entityId: "blocker-underscore",
        logicalSubshapeId: "primary",
        colliderSubshapeId: deriveColliderSubshapeIdV1("blocker-underscore", "primary"),
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [-1, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [0.2, 2, 0.2] },
      },
      {
        entityId: "blocker-hyphen",
        logicalSubshapeId: "primary",
        colliderSubshapeId: deriveColliderSubshapeIdV1("blocker-hyphen", "primary"),
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [1, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [0.2, 2, 0.2] },
      },
    ];

    expect(build(plan).input.staticColliders.map(
      (collider) => collider.colliderSubshapeId,
    )).toEqual([
      deriveColliderSubshapeIdV1("blocker-hyphen", "primary"),
      deriveColliderSubshapeIdV1("blocker-underscore", "primary"),
    ].sort((left, right) => (left < right ? -1 : 1)));
  });

  it("uses circumscribed closed cylinder and level-2 icosphere blocker soups", () => {
    const plan = basePlan();
    plan.staticColliders = [
      {
        entityId: "cone-visual-cylinder-lock",
        logicalSubshapeId: "primary",
        colliderSubshapeId: deriveColliderSubshapeIdV1("cone-visual-cylinder-lock", "primary"),
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [-2, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "cylinder", radiusMeters: 1, heightMeters: 2 },
      },
      {
        entityId: "sphere",
        logicalSubshapeId: "primary",
        colliderSubshapeId: deriveColliderSubshapeIdV1("sphere", "primary"),
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [2, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "sphere", radiusMeters: 1 },
      },
    ];
    const blockers = build(plan).input.staticColliders;
    expect(blockers.map((entry) => entry.colliderSubshapeId)).toEqual([
      deriveColliderSubshapeIdV1("cone-visual-cylinder-lock", "primary"),
      deriveColliderSubshapeIdV1("sphere", "primary"),
    ].sort((left, right) => (left < right ? -1 : 1)));
    const cylinder = blockers.find((entry) => entry.entityId === "cone-visual-cylinder-lock");
    const sphere = blockers.find((entry) => entry.entityId === "sphere");
    if (isNil(cylinder) || isNil(sphere)) {
      throw new Error("expected cylinder and sphere blocker soups");
    }
    expect(cylinder.triangleSoup.triangleIndices).toHaveLength(24 * 4 * 3);
    expect(sphere.triangleSoup.triangleIndices).toHaveLength(20 * 4 ** 2 * 3);
    expect(minimumFacePlaneDistance(
      cylinder.triangleSoup.positionsMetersXYZ,
      cylinder.triangleSoup.triangleIndices,
      [-2, 1, 0],
    )).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(minimumFacePlaneDistance(
      sphere.triangleSoup.positionsMetersXYZ,
      sphere.triangleSoup.triangleIndices,
      [2, 1, 0],
    )).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(cylinder.triangleSoup.triangleIndices).toEqual(
      emitStaticColliderTriangleMeshV1({
        kind: "cylinder",
        radiusMeters: 1,
        heightMeters: 2,
      }).triangleIndices,
    );
    expect(sphere.triangleSoup.triangleIndices).toEqual(
      emitStaticColliderTriangleMeshV1({
        kind: "sphere",
        radiusMeters: 1,
      }).triangleIndices,
    );
  });

  it("excludes remote blockers and rejects forged non-positive collider scales", () => {
    const remote = basePlan();
    const remoteColliderSubshapeId = deriveColliderSubshapeIdV1(
      "remote-wall",
      "primary",
    );
    remote.staticColliders = [{
      entityId: "remote-wall",
      logicalSubshapeId: "primary",
      colliderSubshapeId: remoteColliderSubshapeId,
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 1, 100],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [1, 2, 2] },
    }];
    remote.traversal.surfaces.push({
      kind: "static-collider",
      traversalSurfaceId: "surface-remote-wall",
      surfaceEntityId: "remote-wall",
      colliderSubshapeId: remoteColliderSubshapeId,
      resourceRef: "package://traversal-surface/remote-wall.primary@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
      logicalSurfaceId: "primary",
      logicalSubshapeId: "primary",
      colliderHash: HASH_A,
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
      traversalSurfaceProfileResolvedVersion: "1",
      traversalSurfaceProfileHash: HASH_A,
    });
    const scoped = build(remote).input;
    const baseline = build(basePlan()).input;
    expect(scoped.staticColliders).toEqual([]);
    expect(scoped.traversalSurfaces).toEqual(baseline.traversalSurfaces);
    expect(scoped.colliderArtifactHash).toBe(baseline.colliderArtifactHash);
    expect(scoped.surfaceArtifactHash).toBe(baseline.surfaceArtifactHash);

    const orphanSurface = basePlan();
    orphanSurface.traversal.surfaces.push(remote.traversal.surfaces[1]!);
    expect(() => build(orphanSurface)).toThrow(
      "does not join a declared static collider",
    );

    remote.staticColliders[0]!.transform.scaleXYZ = [1, 0, 1];
    expect(() => build(remote)).toThrow("non-positive-scale");
  });

  it("applies blocked water, leaves walkable water visual-only, and rejects intersecting swimmable water", () => {
    const water: MutableWater = {
      entityId: "lake",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1.5 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.lake",
    };
    const blockedPlan = basePlan();
    blockedPlan.waters = [water];
    const blocked = build(blockedPlan);
    expect(blocked.input.blockedWaterExclusions.map((entry) => entry.waterEntityId)).toEqual(["lake"]);

    const walkablePlan = basePlan();
    walkablePlan.waters = [{ ...water, traversalMode: "walkable" }];
    expect(build(walkablePlan).input.blockedWaterExclusions).toEqual([]);

    const swimmablePlan = basePlan();
    swimmablePlan.waters = [{ ...water, traversalMode: "swimmable" }];
    expect(() => build(swimmablePlan)).toThrow("ROUTE_WATER_TRAVERSAL_UNSUPPORTED");
  });

  it("uses analytic circle, ellipse, and polygon water volume overlap", () => {
    const boundaries: MutableWaterBoundary[] = [
      { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1.5 },
      { kind: "ellipse", centerMetersXZ: [0, 0], radiusMetersXZ: [2, 1] },
      { kind: "polygon", pointsMetersXZ: [[-1.5, -1], [-1.5, 1], [1.5, 1], [1.5, -1]] },
    ];
    for (const [index, boundary] of boundaries.entries()) {
      const plan = basePlan();
      plan.waters = [{
        entityId: `water-${index}`,
        terrainEntityId: "terrain-main",
        boundary,
        depthMeters: 2,
        shoreWidthMeters: 0.2,
        waterLevelMeters: 0.5,
        traversalMode: "blocked",
        semanticClassId: "water.test",
      }];
      expect(build(plan).input.blockedWaterExclusions).toHaveLength(1);
    }

    const elevatedLand = basePlan();
    elevatedLand.terrain = {
      ...elevatedLand.terrain,
      heightSamplesMeters: flatSamples(5, 5, 3),
      minimumHeightMeters: 3,
      maximumHeightMeters: 3,
    };
    elevatedLand.waters = [{
      entityId: "low-water",
      terrainEntityId: "terrain-main",
      boundary: boundaries[0]!,
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.test",
    }];
    expect(build(elevatedLand).input.blockedWaterExclusions).toEqual([]);

    const remoteSwimmable = basePlan();
    remoteSwimmable.waters = [{
      entityId: "remote-swimmable",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 4], radiusMeters: 1 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "swimmable",
      semanticClassId: "water.test",
    }];
    expect(build(remoteSwimmable).input.blockedWaterExclusions).toEqual([]);
  });

  it("content-binds relevant terrain, route, Anchor, Surface, collider, water, and Envelope bytes", () => {
    const baseline = build(basePlan()).routeBuildInputHash;
    const hashes = new Set<string>();

    const terrain = basePlan();
    terrain.terrain.heightSamplesMeters[12] = 0.25;
    hashes.add(build(terrain).routeBuildInputHash);

    const route = basePlan();
    route.layout.routes[0]!.widthMeters = 2.25;
    hashes.add(build(route).routeBuildInputHash);

    const anchor = basePlan();
    anchor.layout.placementsByEntityId.goal!.transform.positionMetersXYZ[1] = 0.25;
    hashes.add(build(anchor).routeBuildInputHash);

    const surface = basePlan();
    surface.traversal.surfaces[0]!.resourceHash =
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    hashes.add(build(surface).routeBuildInputHash);

    const collider = basePlan();
    collider.staticColliders = [{
      entityId: "wall",
      logicalSubshapeId: "primary",
      colliderSubshapeId: deriveColliderSubshapeIdV1("wall", "primary"),
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [0.5, 2, 3] },
    }];
    hashes.add(build(collider).routeBuildInputHash);

    const water = basePlan();
    water.waters = [{
      entityId: "lake",
      terrainEntityId: "terrain-main",
      boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1 },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.test",
    }];
    hashes.add(build(water).routeBuildInputHash);

    const envelopePlan = basePlan();
    const traversalLockReceipt = createRecastTestLockReceiptV1({
      maxSlopeDegrees: 35,
      resourceLockHash: envelopePlan.routeResourceLockHash as `sha256:${string}`,
    });
    const envelopeHash = createRouteBuildInputFromPlanV2({
      executionPlan: executionPlanForFixture(envelopePlan),
      capabilityEnvelope: createRecastTestEnvelopeV1({
        maxSlopeDegrees: 35,
        resourceLockHash: envelopePlan.routeResourceLockHash as `sha256:${string}`,
      }),
      traversalLockReceipt,
      constraintId: "hero-to-goal",
    }).routeBuildInputHash;
    hashes.add(envelopeHash);

    expect(hashes.size).toBe(7);
    expect(hashes.has(baseline)).toBe(false);
  });

  it("rejects a Capability Envelope bound to a different Route Resource Lock", () => {
    const baseline = basePlan();
    const capabilityEnvelope = createRecastTestEnvelopeV1({
      resourceLockHash: baseline.routeResourceLockHash as `sha256:${string}`,
    });
    const traversalLockReceipt = createRecastTestLockReceiptV1({
      resourceLockHash: HASH_A,
    });
    expect(() => createRouteBuildInputFromPlanV2({
      executionPlan: executionPlanForFixture(baseline),
      capabilityEnvelope,
      traversalLockReceipt,
      constraintId: "hero-to-goal",
    })).toThrow("ROUTE_TRAVERSAL_LOCK_MISMATCH");
  });

  it("fails closed with stable structural and semantic codes", () => {
    const missing = basePlan();
    missing.traversal.connectivityRequirements = [];
    expect(() => build(missing)).toThrow("constraint-not-found");

    const ambiguous = basePlan();
    ambiguous.traversal.connectivityRequirements = [
      ambiguous.traversal.connectivityRequirements[0]!,
      ambiguous.traversal.connectivityRequirements[0]!,
    ];
    expect(() => build(ambiguous)).toThrow("constraint-ambiguous");

    const profileMismatch = basePlan();
    profileMismatch.layout.routes = [{
      ...profileMismatch.layout.routes[0]!,
      locomotionProfileRef: "worldkit://locomotion-profile/other@1",
    }];
    expect(() => build(profileMismatch)).toThrow("ROUTE_LOCOMOTION_PROFILE_MISMATCH");

    const anchorKind = basePlan();
    anchorKind.traversal.anchorEntityIds = ["goal"];
    expect(() => build(anchorKind)).toThrow("anchor-not-explicit");

    const surfaceMismatch = basePlan();
    surfaceMismatch.traversal.surfaces[0]!.surfaceEntityId = "other-terrain";
    expect(() => build(surfaceMismatch)).toThrow("surface-missing");

    const outside = basePlan();
    outside.layout.placementsByEntityId = {
      ...outside.layout.placementsByEntityId,
      goal: placement("goal", [4, 0, 4]),
    };
    expect(() => build(outside)).toThrow("ROUTE_DESTINATION_SURFACE_NOT_FOUND");

    expect(() => createRouteBuildInputFromPlanV2({
      executionPlan: executionPlanForFixture(basePlan()),
      capabilityEnvelope: createRecastTestEnvelopeV1(),
      constraintId: "hero-to-goal",
      providerConfig: {},
    } as never)).toThrow("input-invalid");

    expect(() => createRouteBuildInputFromPlanV2({
      executionPlan: executionPlanForFixture(basePlan()),
      constraintId: "hero-to-goal",
    } as never)).toThrow("input-invalid");
  });

  it("skips the tile guard for an empty retained source and reports structured budget failure otherwise", () => {
    const emptyPlan = basePlan();
    emptyPlan.waters = [{
      entityId: "flood",
      terrainEntityId: "terrain-main",
      boundary: { kind: "polygon", pointsMetersXZ: [[-5, -5], [-5, 5], [5, 5], [5, -5]] },
      depthMeters: 2,
      shoreWidthMeters: 0.2,
      waterLevelMeters: 0.5,
      traversalMode: "blocked",
      semanticClassId: "water.flood",
    }];
    const empty = build(emptyPlan);
    expect(empty.input.terrainSource.kind).toBe("empty");
    expect(empty.budgetEvidence).toEqual({ kind: "not-required-empty-geometry" });

    const huge = basePlan();
    huge.terrain = {
      ...huge.terrain,
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [20_000, 20_000],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: flatSamples(2, 2),
    };
    huge.layout.routes = [{
      ...huge.layout.routes[0]!,
      pointsMetersXZ: [[-9_000, 0], [9_000, 0]],
      widthMeters: 10_000,
    }];
    huge.layout.placementsByEntityId = {
      "spawn-main": placement("spawn-main", [-9_000, 0, 0]),
      goal: placement("goal", [9_000, 0, 0]),
    };
    expect(() => build(huge)).toThrow("ROUTE_GRAPH_BUDGET_EXCEEDED");
  });

  it("scopes each Required Route's Surface and Collider inventories independently within one Plan", () => {
    const plan = basePlan();
    const deckSubshapeId = deriveColliderSubshapeIdV1("deck-b", "primary");
    plan.staticColliders = [{
      entityId: "deck-b",
      logicalSubshapeId: "primary",
      colliderSubshapeId: deckSubshapeId,
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [12, 0.125, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [4, 0.25, 2] },
    }];
    plan.layout.routes.push({
      id: "deck-route",
      kind: "polyline-xz",
      pointsMetersXZ: [[10, 0], [14, 0]],
      widthMeters: 2,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    });
    plan.layout.placementsByEntityId["deck-spawn"] = placement(
      "deck-spawn",
      [10.5, 0.25, 0],
    );
    plan.layout.placementsByEntityId["deck-goal"] = placement(
      "deck-goal",
      [13.5, 0.25, 0],
    );
    plan.traversal.anchorEntityIds.push("deck-spawn", "deck-goal");
    plan.traversal.surfaces.push({
      kind: "static-collider",
      traversalSurfaceId: "surface-deck-b",
      surfaceEntityId: "deck-b",
      colliderSubshapeId: deckSubshapeId,
      resourceRef: "package://traversal-surface/deck-b.primary@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
      logicalSurfaceId: "primary",
      logicalSubshapeId: "primary",
      colliderHash: HASH_A,
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
      traversalSurfaceProfileResolvedVersion: "1",
      traversalSurfaceProfileHash: HASH_A,
    });
    plan.traversal.connectivityRequirements.push({
      constraintId: "deck-link",
      kind: "connected-by-route",
      traversingEntityId: "player",
      startAnchorEntityId: "deck-spawn",
      destinationAnchorEntityId: "deck-goal",
      routeId: "deck-route",
    });
    const buildFor = (constraintId: string) =>
      createRouteBuildInputFromPlanV2({
        executionPlan: executionPlanForFixture(plan),
        capabilityEnvelope: createRecastTestEnvelopeV1({
          resourceLockHash: plan.routeResourceLockHash as `sha256:${string}`,
        }),
        traversalLockReceipt: createRecastTestLockReceiptV1({
          resourceLockHash: plan.routeResourceLockHash as `sha256:${string}`,
        }),
        constraintId,
      });

    const ground = buildFor("hero-to-goal");
    const deck = buildFor("deck-link");

    expect(ground.input.staticColliders.map((row) => row.entityId))
      .toEqual([]);
    expect(ground.input.traversalSurfaces.map((row) => row.traversalSurfaceId))
      .toEqual(["surface-main"]);
    expect(deck.input.staticColliders.map((row) => row.entityId))
      .toEqual(["deck-b"]);
    expect(deck.input.traversalSurfaces.map((row) => row.traversalSurfaceId))
      .toEqual(["surface-deck-b", "surface-main"]);
    expect(deck.input.terrainSource).toEqual({
      kind: "empty",
      terrainEntityId: "terrain-main",
    });
    expect(deck.budgetEvidence.kind).toBe("route-geometry-tile-estimate");
  });
});


describe("mapRouteBuildInputToRecastSourceV2", () => {
  it("puts bound Static Collider soups in the candidate prefix and unbound soups in the blocker suffix", () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      includeUnboundWall: true,
    });
    const source = mapRouteBuildInputToRecastSourceV2(receipt.input);
    expect(source.sourceAreaMode?.kind).toBe("layered-traversal-sources-r1b");
    if (source.sourceAreaMode?.kind !== "layered-traversal-sources-r1b") return;
    expect(source.candidateTraversalSurfaceIds).toEqual([
      "surface-heightfield",
      "surface-platform",
      "surface-ramp",
      "surface-step",
    ]);
    expect(source.sourceAreaMode.candidateSourceRanges.map(
      (range) => range.traversalSurfaceOrdinal,
    )).toEqual([0, 1, 2, 3]);
    const boundVertexCount = source.sourceAreaMode.candidateSourceRanges.reduce(
      (sum, range) => sum + range.vertexCount,
      0,
    );
    expect(source.sourceAreaMode.blockerStartVertexIndex).toBe(boundVertexCount);
    expect(source.positions.length / 3).toBeGreaterThan(boundVertexCount);
    const wall = receipt.input.staticColliders.find(
      (row) => row.entityId === "unbound-wall",
    );
    expect(wall).toBeDefined();
    if (wall === undefined) return;
    const suffix = source.positions.slice(boundVertexCount * 3);
    expect(suffix.slice(0, wall.triangleSoup.positionsMetersXYZ.length)).toEqual(
      wall.triangleSoup.positionsMetersXYZ,
    );
  });

});
