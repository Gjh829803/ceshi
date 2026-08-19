import {
  sha256CanonicalJson,
  type NormalizedWorldIRV1,
  type NormalizedWorldNodeV1,
  type PrimitivePrototypeSpecV1,
  type Vec2,
} from "@whitebox-world/authoring";
import type {
  CompileDiagnostic,
  CompileWorldResultV2,
  ExecutionObjectV1,
  ExecutionPlanV2,
  ExecutionPrimitiveV1,
  ExecutionSubjectV2,
  ExecutionTerrainV1,
  ExecutionTerrainV3,
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

export function sampleTerrainHeight(
  terrain: ExecutionTerrainV1 | ExecutionTerrainV3,
  pointXZ: Vec2,
): number {
  const resolution = "resolutionCellsXZ" in terrain
    ? terrain.resolutionCellsXZ
    : terrain.resolutionXZ;
  const center = "centerMetersXZ" in terrain ? terrain.centerMetersXZ : terrain.centerXZ;
  const size = "sizeMetersXZ" in terrain ? terrain.sizeMetersXZ : terrain.sizeXZ;
  const [columns, rows] = resolution;
  const minimumX = center[0] - size[0] / 2;
  const minimumZ = center[1] - size[1] / 2;
  const x = Math.max(
    0,
    Math.min(columns - 1, ((pointXZ[0] - minimumX) / size[0]) * (columns - 1)),
  );
  const z = Math.max(
    0,
    Math.min(rows - 1, ((pointXZ[1] - minimumZ) / size[1]) * (rows - 1)),
  );
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

interface CompiledSubjects {
  subjects: ExecutionSubjectV2[];
  resourceCost: { vertices: number; triangles: number; colliders: number };
}

function compileSubjects(world: NormalizedWorldIRV1, terrain: ExecutionTerrainV1): CompiledSubjects {
  const definitionsByRef = new Map(
    world.resources.subjectDefinitions.map((definition) => [definition.kitRef, definition]),
  );
  const anchorsByEntityId = new Map(
    world.nodes
      .filter((node): node is Extract<NormalizedWorldNodeV1, { kind: "anchor" }> => node.kind === "anchor")
      .map((anchor) => [anchor.id, anchor]),
  );
  const resourceCost = { vertices: 0, triangles: 0, colliders: 0 };

  const subjects = world.nodes
    .filter((node): node is Extract<NormalizedWorldNodeV1, { kind: "subject" }> => node.kind === "subject")
    .map((node): ExecutionSubjectV2 => {
      const definition = definitionsByRef.get(node.kitRef);
      if (definition === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: subject '${node.id}' references missing Definition '${node.kitRef}'.`,
        );
      }
      const spawnAnchor = anchorsByEntityId.get(node.spawnAnchorEntityId);
      if (spawnAnchor === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: subject '${node.id}' references missing spawn Anchor '${node.spawnAnchorEntityId}'.`,
        );
      }

      resourceCost.vertices += definition.resourceCost.vertices;
      resourceCost.triangles += definition.resourceCost.triangles;
      resourceCost.colliders += definition.resourceCost.colliders;

      const [spawnX, spawnYOffset, spawnZ] = spawnAnchor.transform.positionMeters;
      const groundHeightMeters = sampleTerrainHeight(terrain, [spawnX, spawnZ]);
      return {
        entityId: node.id,
        kitRef: definition.kitRef,
        bodyTopology: definition.bodyTopology,
        semanticClassId: definition.semanticClassId,
        spawnAnchorEntityId: spawnAnchor.id,
        spawnPositionMeters: [
          spawnX,
          groundHeightMeters + spawnYOffset + definition.collider.heightMeters / 2,
          spawnZ,
        ],
        forwardDirection: "-z",
        visualParts: structuredClone(definition.visualParts),
        collider: structuredClone(definition.collider),
        locomotion: structuredClone(definition.locomotion),
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));

  if (subjects.length === 0) {
    throw new Error("NormalizedWorldIR invariant violated: no Subject nodes were materialized.");
  }
  return { subjects, resourceCost };
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

export function compileWorld(input: CompileWorldInput): CompileWorldResultV2 {
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
  const { subjects, resourceCost: subjectResourceCost } = compileSubjects(world, terrain);
  const cameraNode = findOnlyNode(world.nodes, "camera");
  const terrainVertices = terrain.resolutionXZ[0] * terrain.resolutionXZ[1];
  const terrainTriangles = (terrain.resolutionXZ[0] - 1) * (terrain.resolutionXZ[1] - 1) * 2;
  const objectCosts = objects.map((object) => primitiveResourceCost(object.primitive));
  const waterCosts = waters.map((water) => waterResourceCost(water.boundary));
  const usage = {
    vertices: terrainVertices + subjectResourceCost.vertices + [...objectCosts, ...waterCosts].reduce((sum, cost) => sum + cost.vertices, 0),
    triangles: terrainTriangles + subjectResourceCost.triangles + [...objectCosts, ...waterCosts].reduce((sum, cost) => sum + cost.triangles, 0),
    colliders: 1 + subjectResourceCost.colliders + objects.filter((object) => object.collisionEnabled).length,
  };
  const budget = world.world.resourceBudget;
  const diagnostics: CompileDiagnostic[] = [];
  pushBudgetDiagnostic(diagnostics, "maxVertices", usage.vertices, budget.maxVertices);
  pushBudgetDiagnostic(diagnostics, "maxTriangles", usage.triangles, budget.maxTriangles);
  pushBudgetDiagnostic(diagnostics, "maxColliders", usage.colliders, budget.maxColliders);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const rig = cameraNode.components.cameraRig;
  const executionPlan: ExecutionPlanV2 = {
    kind: "worldkit-execution-plan",
    schemaVersion: 2,
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
    controlledEntityId: world.startup.controlledEntityId,
    subjects,
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
