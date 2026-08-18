import {
  sha256CanonicalJson,
  type NormalizedWorldIRV1,
  type NormalizedWorldNodeV1,
  type PrimitivePrototypeSpecV1,
  type Vec2,
  type Vec3,
} from "@whitebox-world/authoring";
import type {
  CompileDiagnostic,
  CompileWorldResult,
  ExecutionObjectV1,
  ExecutionPlanV1,
  ExecutionPrimitiveV1,
  ExecutionTerrainV1,
  ExecutionWaterBoundaryV1,
  ExecutionWaterV1,
} from "@whitebox-world/runtime-contracts";

import { sampleFractalNoise } from "./noise";

export interface CompileWorldInput {
  normalizedWorldIr: NormalizedWorldIRV1;
  normalizedWorldIrHash: string;
}

function findOnlyNode<K extends NormalizedWorldNodeV1["kind"]>(
  nodes: readonly NormalizedWorldNodeV1[],
  kind: K,
): Extract<NormalizedWorldNodeV1, { kind: K }> {
  const node = nodes.find((candidate): candidate is Extract<NormalizedWorldNodeV1, { kind: K }> => candidate.kind === kind);
  if (node === undefined) throw new Error(`NormalizedWorldIR invariant violated: missing '${kind}' node.`);
  return node;
}

function compileTerrain(world: NormalizedWorldIRV1): ExecutionTerrainV1 {
  const node = findOnlyNode(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionXZ;
  const [centerX, centerZ] = terrain.grid.centerXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const heights: number[] = [];
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;

  for (let zIndex = 0; zIndex < rows; zIndex += 1) {
    const z = minimumZ + (zIndex / (rows - 1)) * sizeZ;
    for (let xIndex = 0; xIndex < columns; xIndex += 1) {
      const x = minimumX + (xIndex / (columns - 1)) * sizeX;
      const noise = source.amplitudeMeters === 0
        ? 0
        : sampleFractalNoise(
            world.seed,
            x * source.frequencyPerMeter,
            z * source.frequencyPerMeter,
            source.octaves,
            source.lacunarityRatio,
            source.persistenceRatio,
          );
      const height = source.baseHeightMeters + noise * source.amplitudeMeters;
      heights.push(height);
      minimumHeightMeters = Math.min(minimumHeightMeters, height);
      maximumHeightMeters = Math.max(maximumHeightMeters, height);
    }
  }
  return {
    entityId: node.id,
    centerXZ: [...terrain.grid.centerXZ],
    sizeXZ: [...terrain.grid.sizeXZ],
    resolutionXZ: [...terrain.grid.resolutionXZ],
    heightSamplesMeters: heights,
    heightSamplesHash: sha256CanonicalJson(heights),
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: terrain.semantic?.classId ?? "terrain.ground",
  };
}

export function sampleTerrainHeight(terrain: ExecutionTerrainV1, pointXZ: Vec2): number {
  const [columns, rows] = terrain.resolutionXZ;
  const minimumX = terrain.centerXZ[0] - terrain.sizeXZ[0] / 2;
  const minimumZ = terrain.centerXZ[1] - terrain.sizeXZ[1] / 2;
  const x = Math.max(0, Math.min(columns - 1, ((pointXZ[0] - minimumX) / terrain.sizeXZ[0]) * (columns - 1)));
  const z = Math.max(0, Math.min(rows - 1, ((pointXZ[1] - minimumZ) / terrain.sizeXZ[1]) * (rows - 1)));
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(columns - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const at = (column: number, row: number): number => terrain.heightSamplesMeters[row * columns + column] ?? 0;
  const top = at(x0, z0) + (at(x1, z0) - at(x0, z0)) * tx;
  const bottom = at(x0, z1) + (at(x1, z1) - at(x0, z1)) * tx;
  return top + (bottom - top) * tz;
}

function boundaryCenter(boundary: ExecutionWaterBoundaryV1): Vec2 {
  if (boundary.kind !== "polygon") return boundary.centerXZ;
  const total = boundary.pointsXZ.reduce<Vec2>(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0],
  );
  return [total[0] / boundary.pointsXZ.length, total[1] / boundary.pointsXZ.length];
}

function compileWaters(world: NormalizedWorldIRV1, terrain: ExecutionTerrainV1): ExecutionWaterV1[] {
  return world.nodes
    .filter((node): node is Extract<NormalizedWorldNodeV1, { kind: "water" }> => node.kind === "water")
    .map((node) => {
      const water = node.components.water;
      const boundary = structuredClone(water.boundary) as ExecutionWaterBoundaryV1;
      return {
        entityId: node.id,
        terrainEntityId: water.terrainEntityId,
        boundary,
        depthMeters: water.depthMeters,
        shoreWidthMeters: water.shoreWidthMeters,
        waterLevelMeters: water.waterLevelMeters ?? sampleTerrainHeight(terrain, boundaryCenter(boundary)),
        traversalMode: water.traversalMode,
        semanticClassId: water.semantic?.classId ?? "water.surface",
      };
    });
}

function resolvePrimitive(prototype: PrimitivePrototypeSpecV1): ExecutionPrimitiveV1 {
  switch (prototype.primitive) {
    case "box":
      if (prototype.sizeMetersXYZ === undefined) throw new Error("Normalized box is missing sizeMetersXYZ.");
      return { kind: "box", sizeMetersXYZ: [...prototype.sizeMetersXYZ] };
    case "sphere":
      if (prototype.radiusMeters === undefined) throw new Error("Normalized sphere is missing radiusMeters.");
      return { kind: "sphere", radiusMeters: prototype.radiusMeters };
    case "cylinder":
    case "cone":
      if (prototype.radiusMeters === undefined || prototype.heightMeters === undefined) {
        throw new Error(`Normalized ${prototype.primitive} is missing radiusMeters or heightMeters.`);
      }
      return { kind: prototype.primitive, radiusMeters: prototype.radiusMeters, heightMeters: prototype.heightMeters };
  }
}

function compileObjects(world: NormalizedWorldIRV1): ExecutionObjectV1[] {
  const prototypes = new Map(world.resources.prototypes.map((prototype) => [prototype.id, prototype]));
  return world.nodes
    .filter((node): node is Extract<NormalizedWorldNodeV1, { kind: "object" }> => node.kind === "object")
    .map((node) => {
      const prototypeId = node.prototypeRef.slice("package://prototype/".length);
      const prototype = prototypes.get(prototypeId);
      if (prototype === undefined) throw new Error(`NormalizedWorldIR invariant violated: missing prototype '${prototypeId}'.`);
      return {
        entityId: node.id,
        prototypeId,
        primitive: resolvePrimitive(prototype),
        transform: structuredClone(node.transform),
        collisionEnabled: prototype.collisionEnabled,
        semanticClassId: prototype.semantic?.classId ?? `object.${prototype.primitive}`,
      };
    });
}

function primitiveResourceCost(primitive: ExecutionPrimitiveV1): { vertices: number; triangles: number } {
  switch (primitive.kind) {
    case "box":
      return { vertices: 24, triangles: 12 };
    case "sphere":
      return { vertices: 289, triangles: 512 };
    case "cylinder":
      return { vertices: 70, triangles: 128 };
    case "cone":
      return { vertices: 36, triangles: 64 };
  }
}

function waterResourceCost(boundary: ExecutionWaterBoundaryV1): { vertices: number; triangles: number } {
  const vertices = boundary.kind === "polygon" ? boundary.pointsXZ.length : 64;
  return { vertices: vertices + 1, triangles: vertices };
}

function pushBudgetDiagnostic(
  diagnostics: CompileDiagnostic[],
  field: "maxVertices" | "maxTriangles" | "maxColliders",
  actual: number,
  maximum: number,
): void {
  if (actual <= maximum) return;
  diagnostics.push({
    severity: "error",
    code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
    instancePath: `/world/resourceBudget/${field}`,
    message: `${field} budget is ${maximum}, but the compiled world requires ${actual}.`,
    details: { actual, maximum },
  });
}

export function compileWorld(input: CompileWorldInput): CompileWorldResult {
  const world = input.normalizedWorldIr;
  const actualNormalizedWorldIrHash = sha256CanonicalJson(world);
  if (input.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_HASH_MISMATCH",
          instancePath: "/normalizedWorldIrHash",
          message: "The supplied normalizedWorldIrHash does not match normalizedWorldIr.",
          details: { expected: actualNormalizedWorldIrHash, actual: input.normalizedWorldIrHash },
        },
      ],
    };
  }
  const terrain = compileTerrain(world);
  const waters = compileWaters(world, terrain);
  const objects = compileObjects(world);
  const subjectNode = findOnlyNode(world.nodes, "subject");
  const spawnNode = world.nodes.find(
    (node): node is Extract<NormalizedWorldNodeV1, { kind: "anchor" }> =>
      node.kind === "anchor" && node.id === world.startup.spawnAnchorId,
  );
  const cameraNode = findOnlyNode(world.nodes, "camera");
  if (spawnNode === undefined) throw new Error("NormalizedWorldIR invariant violated: startup spawn anchor missing.");

  const capsuleHeightMeters = 1.8;
  const groundHeight = sampleTerrainHeight(terrain, [spawnNode.transform.positionMeters[0], spawnNode.transform.positionMeters[2]]);
  const spawnPositionMeters: Vec3 = [
    spawnNode.transform.positionMeters[0],
    groundHeight + spawnNode.transform.positionMeters[1] + capsuleHeightMeters / 2,
    spawnNode.transform.positionMeters[2],
  ];
  const terrainVertices = terrain.resolutionXZ[0] * terrain.resolutionXZ[1];
  const terrainTriangles = (terrain.resolutionXZ[0] - 1) * (terrain.resolutionXZ[1] - 1) * 2;
  const objectCosts = objects.map((object) => primitiveResourceCost(object.primitive));
  const waterCosts = waters.map((water) => waterResourceCost(water.boundary));
  const usage = {
    vertices: terrainVertices + 34 + [...objectCosts, ...waterCosts].reduce((sum, cost) => sum + cost.vertices, 0),
    triangles: terrainTriangles + 64 + [...objectCosts, ...waterCosts].reduce((sum, cost) => sum + cost.triangles, 0),
    colliders: 2 + objects.filter((object) => object.collisionEnabled).length,
  };
  const budget = world.world.resourceBudget;
  const diagnostics: CompileDiagnostic[] = [];
  pushBudgetDiagnostic(diagnostics, "maxVertices", usage.vertices, budget.maxVertices);
  pushBudgetDiagnostic(diagnostics, "maxTriangles", usage.triangles, budget.maxTriangles);
  pushBudgetDiagnostic(diagnostics, "maxColliders", usage.colliders, budget.maxColliders);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const rig = cameraNode.components.cameraRig;
  const executionPlan: ExecutionPlanV1 = {
    kind: "worldkit-execution-plan",
    schemaVersion: 1,
    id: world.id,
    seed: world.seed,
    runtimeBackend: "babylon-havok",
    normalizedWorldIrHash: input.normalizedWorldIrHash,
    coordinateSystem: world.world.coordinateSystem,
    gravityMetersPerSecondSquaredXYZ: [...world.world.gravityMetersPerSecondSquaredXYZ],
    atmospherePreset: world.world.environment.preset,
    terrain,
    waters,
    objects,
    subject: {
      entityId: subjectNode.id,
      kitRef: "worldkit://kit/humanoid.third-person@1",
      spawnAnchorEntityId: spawnNode.id,
      spawnPositionMeters,
      forwardDirection: "-z",
      capsule: { radiusMeters: 0.35, heightMeters: capsuleHeightMeters },
      movement: {
        groundSpeedMetersPerSecond: 4,
        waterSpeedMetersPerSecond: 2.2,
        jumpSpeedMetersPerSecond: 5.5,
      },
    },
    camera: {
      cameraEntityId: cameraNode.id,
      rigRef: "worldkit://camera/third-person.standard@1",
      targetEntityId: rig.target.entityId,
      pitchRadians: rig.thirdPerson.pitchRadians,
      distanceMeters: rig.thirdPerson.distanceMeters,
      targetHeightMeters: rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
      fovDegrees: rig.thirdPerson.fovDegrees,
      manualSwitchAllowed: rig.manualSwitchAllowed,
    },
    resourceUsage: usage,
  };
  return {
    ok: true,
    executionPlan,
    executionPlanHash: sha256CanonicalJson(executionPlan),
    diagnostics: [],
  };
}
