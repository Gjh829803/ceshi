import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { createHeightfieldRouteBuildInputV1 } from "./index.js";
import * as heightfieldSourceModule from "./heightfield-source.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

type DeepMutable<T> = T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

interface HeightfieldSourcePlanFixture {
  kind: ExecutionPlanV5["kind"];
  schemaVersion: 5;
  authoringSpecHash: ExecutionPlanV5["authoringSpecHash"];
  resourceLockHash: string;
  coordinateSystem: ExecutionPlanV5["coordinateSystem"];
  terrain: DeepMutable<ExecutionPlanV5["terrain"]>;
  waters: DeepMutable<ExecutionPlanV5["waters"]>;
  subjects: Array<{ entityId: string }>;
  staticColliders: DeepMutable<ExecutionPlanV5["staticColliders"]>;
  layout: {
    layoutSolveReportHash: string;
    routes: DeepMutable<ExecutionPlanV5["layout"]["routes"]>;
    placementsByEntityId: Record<
      string,
      DeepMutable<
        ExecutionPlanV5["layout"]["placementsByEntityId"][string]
      >
    >;
  };
  traversal: DeepMutable<ExecutionPlanV5["traversal"]>;
}

type MutablePlacement = DeepMutable<
  ExecutionPlanV5["layout"]["placementsByEntityId"][string]
>;
type MutableWater = DeepMutable<ExecutionPlanV5["waters"][number]>;
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
    kind: "worldkit-execution-plan",
    schemaVersion: 5,
    authoringSpecHash: HASH_A,
    resourceLockHash: HASH_A,
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
    subjects: [{ entityId: "player" }],
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

function build(plan: HeightfieldSourcePlanFixture = basePlan()) {
  return createHeightfieldRouteBuildInputV1({
    executionPlan: plan as unknown as ExecutionPlanV5,
    capabilityEnvelope: createRecastTestEnvelopeV1(),
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
  it("maps terrain first and omits sourceAreaMode unless blocker triangles are positive", () => {
    const mapSource = (heightfieldSourceModule as {
      mapHeightfieldRouteBuildInputToRecastSourceV1?: (
        input: ReturnType<typeof build>["input"],
      ) => {
        positions: readonly number[];
        indices: readonly number[];
        bounds: readonly [readonly [number, number, number], readonly [number, number, number]];
        sourceAreaMode?: {
          kind: string;
          terrainVertexCount: number;
          blockerAreaId: number;
        };
      };
    }).mapHeightfieldRouteBuildInputToRecastSourceV1;
    expect(typeof mapSource).toBe("function");
    if (mapSource === undefined) return;

    const terrainOnlyReceipt = build(basePlan());
    const terrainOnly = mapSource(terrainOnlyReceipt.input);
    expect(Object.hasOwn(terrainOnly, "sourceAreaMode")).toBe(false);
    expect(terrainOnly.positions).toEqual(
      terrainOnlyReceipt.input.terrainSource.kind === "bounded"
        ? terrainOnlyReceipt.input.terrainSource.triangleSoup.positionsMetersXYZ
        : [],
    );

    const plan = basePlan();
    plan.staticColliders = [{
      entityId: "low-box",
      logicalSubshapeId: "primary",
      colliderSubshapeId: "collider:low-box:primary",
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 0.1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [1, 0.2, 1] },
    }];
    const blockedReceipt = build(plan);
    const blocked = mapSource(blockedReceipt.input);
    if (blockedReceipt.input.terrainSource.kind !== "bounded") {
      throw new Error("expected bounded terrain source");
    }
    const terrainVertexCount =
      blockedReceipt.input.terrainSource.triangleSoup.positionsMetersXYZ.length / 3;
    expect(blocked.sourceAreaMode).toEqual({
      kind: "terrain-with-static-blockers-r1",
      terrainVertexCount,
      blockerAreaId: 1,
    });
    expect(terrainVertexCount).toBeGreaterThan(0);
    expect(terrainVertexCount).toBeLessThan(blocked.positions.length / 3);
    expect(blocked.positions.slice(0, terrainVertexCount * 3)).toEqual(
      blockedReceipt.input.terrainSource.triangleSoup.positionsMetersXYZ,
    );
    expect(blocked.indices.slice(0,
      blockedReceipt.input.terrainSource.triangleSoup.triangleIndices.length,
    )).toEqual(blockedReceipt.input.terrainSource.triangleSoup.triangleIndices);
    expect(blocked.bounds[0][0]).toBe(
      blockedReceipt.input.terrainSource.minimumMetersXZ[0],
    );
    expect(blocked.bounds[0][2]).toBe(
      blockedReceipt.input.terrainSource.minimumMetersXZ[1],
    );
    expect(blocked.bounds[1][0]).toBe(
      blockedReceipt.input.terrainSource.maximumMetersXZ[0],
    );
    expect(blocked.bounds[1][2]).toBe(
      blockedReceipt.input.terrainSource.maximumMetersXZ[1],
    );
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
    expect(first.budgetEvidence.kind).toBe("heightfield-tile-estimate");
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
      colliderSubshapeId: "collider:wall:primary",
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 1, 0],
        rotationEulerRadiansXYZ: [0, Math.PI / 6, 0],
        scaleXYZ: [1.5, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [0.4, 2, 4] },
    }];
    const receipt = build(plan);
    expect(receipt.input.blockingColliders).toHaveLength(1);
    expect(receipt.input.blockingColliders[0]?.triangleSoup.triangleIndices).toHaveLength(36);
    const positions = receipt.input.blockingColliders[0]!.triangleSoup
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

  it("orders source collider identities without locale-dependent collation", () => {
    const plan = basePlan();
    plan.staticColliders = [
      {
        entityId: "blocker-underscore",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:a_",
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
        colliderSubshapeId: "collider:a-",
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [1, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [0.2, 2, 0.2] },
      },
    ];

    expect(build(plan).input.blockingColliders.map(
      (collider) => collider.colliderSubshapeId,
    )).toEqual(["collider:a-", "collider:a_"]);
  });

  it("uses circumscribed closed cylinder and level-2 icosphere blocker soups", () => {
    const plan = basePlan();
    plan.staticColliders = [
      {
        entityId: "cone-visual-cylinder-lock",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:a-cylinder",
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
        colliderSubshapeId: "collider:b-sphere",
        colliderHash: HASH_A,
        transform: {
          positionMetersXYZ: [2, 1, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "sphere", radiusMeters: 1 },
      },
    ];
    const blockers = build(plan).input.blockingColliders;
    expect(blockers.map((entry) => entry.colliderSubshapeId)).toEqual([
      "collider:a-cylinder",
      "collider:b-sphere",
    ]);
    expect(blockers[0]!.triangleSoup.triangleIndices).toHaveLength(24 * 4 * 3);
    expect(blockers[1]!.triangleSoup.triangleIndices).toHaveLength(20 * 4 ** 2 * 3);
    expect(minimumFacePlaneDistance(
      blockers[0]!.triangleSoup.positionsMetersXYZ,
      blockers[0]!.triangleSoup.triangleIndices,
      [-2, 1, 0],
    )).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(minimumFacePlaneDistance(
      blockers[1]!.triangleSoup.positionsMetersXYZ,
      blockers[1]!.triangleSoup.triangleIndices,
      [2, 1, 0],
    )).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it("excludes remote blockers and rejects forged non-positive collider scales", () => {
    const remote = basePlan();
    remote.staticColliders = [{
      entityId: "remote-wall",
      logicalSubshapeId: "primary",
      colliderSubshapeId: "collider:remote-wall",
      colliderHash: HASH_A,
      transform: {
        positionMetersXYZ: [0, 1, 100],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [1, 2, 2] },
    }];
    expect(build(remote).input.blockingColliders).toEqual([]);
    expect(build(remote).input.colliderArtifactHash).toBe(
      build(basePlan()).input.colliderArtifactHash,
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
      colliderSubshapeId: "collider:wall",
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

    const envelopeHash = createHeightfieldRouteBuildInputV1({
      executionPlan: basePlan() as unknown as ExecutionPlanV5,
      capabilityEnvelope: createRecastTestEnvelopeV1({ maxSlopeDegrees: 35 }),
      constraintId: "hero-to-goal",
    }).routeBuildInputHash;
    hashes.add(envelopeHash);

    expect(hashes.size).toBe(7);
    expect(hashes.has(baseline)).toBe(false);
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
    expect(() => build(surfaceMismatch)).toThrow("surface-terrain-mismatch");

    const outside = basePlan();
    outside.layout.placementsByEntityId = {
      ...outside.layout.placementsByEntityId,
      goal: placement("goal", [4, 0, 4]),
    };
    expect(() => build(outside)).toThrow("ROUTE_DESTINATION_SURFACE_NOT_FOUND");

    expect(() => createHeightfieldRouteBuildInputV1({
      executionPlan: basePlan() as unknown as ExecutionPlanV5,
      capabilityEnvelope: createRecastTestEnvelopeV1(),
      constraintId: "hero-to-goal",
      providerConfig: {},
    } as never)).toThrow("input-invalid");

    expect(() => createHeightfieldRouteBuildInputV1({
      executionPlan: basePlan() as unknown as ExecutionPlanV5,
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
    expect(empty.budgetEvidence).toEqual({ kind: "not-required-empty-source" });

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
});
