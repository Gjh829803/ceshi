import type {
  NormalizedWorldIRV2,
  NormalizedWorldNodeV2,
  PrimitivePrototypeSpecV2,
  Vec2,
} from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type {
  CompileDiagnostic,
  CompileWorldResultV3,
  ExecutionObjectPrimitiveV3,
  ExecutionObjectV3,
  ExecutionPlanV3,
  ExecutionSubjectV3,
  ExecutionTerrainV3,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
} from "@whitebox-world/runtime-contracts";

import { sampleFractalNoise } from "./noise";

export interface CompileWorldInput {
  normalizedWorldIr: NormalizedWorldIRV2;
  normalizedWorldIrHash: string;
}

export function sampleTerrainHeight(
  terrain: ExecutionTerrainV3,
  pointMetersXZ: Vec2,
): number {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const x = Math.max(
    0,
    Math.min(
      columns - 1,
      ((pointMetersXZ[0] - minimumX) / terrain.sizeMetersXZ[0]) * (columns - 1),
    ),
  );
  const z = Math.max(
    0,
    Math.min(
      rows - 1,
      ((pointMetersXZ[1] - minimumZ) / terrain.sizeMetersXZ[1]) * (rows - 1),
    ),
  );
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(columns - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const at = (column: number, row: number): number =>
    terrain.heightSamplesMeters[row * columns + column] ?? 0;
  const top = at(x0, z0) + (at(x1, z0) - at(x0, z0)) * tx;
  const bottom = at(x0, z1) + (at(x1, z1) - at(x0, z1)) * tx;
  return top + (bottom - top) * tz;
}

function findOnlyNodeV3<K extends NormalizedWorldNodeV2["kind"]>(
  nodes: readonly NormalizedWorldNodeV2[],
  kind: K,
): Extract<NormalizedWorldNodeV2, { kind: K }> {
  const node = nodes.find(
    (candidate): candidate is Extract<NormalizedWorldNodeV2, { kind: K }> =>
      candidate.kind === kind,
  );
  if (node === undefined) {
    throw new Error(`NormalizedWorldIRV2 invariant violated: missing '${kind}' node.`);
  }
  return node;
}

function compileTerrainV3(world: NormalizedWorldIRV2): ExecutionTerrainV3 {
  const node = findOnlyNodeV3(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionCellsXZ;
  const [centerX, centerZ] = terrain.grid.centerMetersXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const heights: number[] = [];
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;

  for (let zIndex = 0; zIndex < rows; zIndex += 1) {
    const z = minimumZ + (zIndex / (rows - 1)) * sizeZ;
    for (let xIndex = 0; xIndex < columns; xIndex += 1) {
      const x = minimumX + (xIndex / (columns - 1)) * sizeX;
      const noise =
        source.amplitudeMeters === 0
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
    centerMetersXZ: [...terrain.grid.centerMetersXZ],
    sizeMetersXZ: [...terrain.grid.sizeMetersXZ],
    resolutionCellsXZ: [...terrain.grid.resolutionCellsXZ],
    heightSamplesMeters: heights,
    heightSamplesHash: sha256CanonicalJson(heights),
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: terrain.semantic?.classId ?? "terrain.ground",
  };
}

function boundaryCenterV3(boundary: ExecutionWaterBoundaryV3): Vec2 {
  if (boundary.kind !== "polygon") return boundary.centerMetersXZ;
  const total = boundary.pointsMetersXZ.reduce<Vec2>(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0],
  );
  return [
    total[0] / boundary.pointsMetersXZ.length,
    total[1] / boundary.pointsMetersXZ.length,
  ];
}

function compileWatersV3(
  world: NormalizedWorldIRV2,
  terrain: ExecutionTerrainV3,
): ExecutionWaterV3[] {
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV2, { kind: "water" }> =>
        node.kind === "water",
    )
    .map((node) => {
      const water = node.components.water;
      const boundary = structuredClone(water.boundary) as ExecutionWaterBoundaryV3;
      return {
        entityId: node.id,
        terrainEntityId: water.terrainEntityId,
        boundary,
        depthMeters: water.depthMeters,
        shoreWidthMeters: water.shoreWidthMeters,
        waterLevelMeters:
          water.waterLevelMeters ??
          sampleTerrainHeight(terrain, boundaryCenterV3(boundary)),
        traversalMode: water.traversalMode,
        semanticClassId: water.semantic?.classId ?? "water.surface",
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function resolvePrimitiveV3(
  prototype: PrimitivePrototypeSpecV2,
): ExecutionObjectPrimitiveV3 {
  switch (prototype.primitive) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...prototype.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: prototype.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: prototype.primitive,
        radiusMeters: prototype.radiusMeters,
        heightMeters: prototype.heightMeters,
      };
  }
}

function compileObjectsV3(world: NormalizedWorldIRV2): ExecutionObjectV3[] {
  const prototypes = new Map(
    world.resources.prototypes.map((prototype) => [
      `${prototype.id}@${prototype.version}`,
      prototype,
    ]),
  );
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV2, { kind: "object" }> =>
        node.kind === "object",
    )
    .map((node) => {
      const prototypeIdentity = node.prototypeRef.slice(
        "package://prototype/".length,
      );
      const prototype = prototypes.get(prototypeIdentity);
      if (prototype === undefined) {
        throw new Error(
          `NormalizedWorldIRV2 invariant violated: missing Prototype '${prototypeIdentity}'.`,
        );
      }
      return {
        entityId: node.id,
        prototypeId: prototype.id,
        primitive: resolvePrimitiveV3(prototype),
        transform: structuredClone(node.transform),
        collisionEnabled: prototype.collisionEnabled,
        semanticClassId:
          prototype.semantic?.classId ?? `object.${prototype.primitive}`,
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

interface CompiledSubjectsV3 {
  subjects: ExecutionSubjectV3[];
  resourceCost: { vertices: number; triangles: number; colliders: number };
}

function compileSubjectsV3(
  world: NormalizedWorldIRV2,
  terrain: ExecutionTerrainV3,
): CompiledSubjectsV3 {
  const definitionsByRef = new Map(
    world.resources.subjectDefinitions.map((definition) => [
      definition.subjectDefinitionRef,
      definition,
    ]),
  );
  const anchorsByEntityId = new Map(
    world.nodes
      .filter(
        (node): node is Extract<NormalizedWorldNodeV2, { kind: "anchor" }> =>
          node.kind === "anchor",
      )
      .map((anchor) => [anchor.id, anchor]),
  );
  const resourceCost = { vertices: 0, triangles: 0, colliders: 0 };

  const subjects = world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV2, { kind: "subject" }> =>
        node.kind === "subject",
    )
    .map((node): ExecutionSubjectV3 => {
      const definition = definitionsByRef.get(node.subjectDefinitionRef);
      if (definition === undefined) {
        throw new Error(
          `NormalizedWorldIRV2 invariant violated: Subject '${node.id}' references missing Definition '${node.subjectDefinitionRef}'.`,
        );
      }
      const spawnAnchor = anchorsByEntityId.get(node.spawnAnchorEntityId);
      if (spawnAnchor === undefined) {
        throw new Error(
          `NormalizedWorldIRV2 invariant violated: Subject '${node.id}' references missing Spawn Anchor '${node.spawnAnchorEntityId}'.`,
        );
      }

      resourceCost.vertices += definition.resourceCost.vertices;
      resourceCost.triangles += definition.resourceCost.triangles;
      resourceCost.colliders += definition.resourceCost.colliders;

      const [spawnX, spawnYOffset, spawnZ] =
        spawnAnchor.transform.positionMetersXYZ;
      const groundHeightMeters = sampleTerrainHeight(terrain, [spawnX, spawnZ]);
      return {
        entityId: node.id,
        subjectDefinitionRef: definition.subjectDefinitionRef,
        subjectDefinitionHash: definition.subjectDefinitionHash,
        bodyTopology: definition.bodyTopology,
        semanticClassId: definition.semanticClassId,
        spawnAnchorEntityId: spawnAnchor.id,
        spawnSubjectOriginPositionMetersXYZ: [
          spawnX,
          groundHeightMeters + spawnYOffset,
          spawnZ,
        ],
        forwardDirection: "-z",
        visualParts: definition.visualParts.map((part) => ({
          id: part.id,
          kind: part.kind,
          shape: structuredClone(part.shape),
          localTransform: structuredClone(part.localTransform),
          semanticTags: [...part.semanticTags],
        })),
        sockets: definition.sockets.map((socket) => structuredClone(socket)),
        collider: structuredClone(definition.collider),
        locomotion: structuredClone(definition.locomotion),
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));

  if (subjects.length === 0) {
    throw new Error(
      "NormalizedWorldIRV2 invariant violated: no Subject nodes were materialized.",
    );
  }
  return { subjects, resourceCost };
}

function primitiveResourceCostV3(
  primitive: ExecutionObjectPrimitiveV3,
): { vertices: number; triangles: number } {
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

function waterResourceCostV3(
  boundary: ExecutionWaterBoundaryV3,
): { vertices: number; triangles: number } {
  const vertices =
    boundary.kind === "polygon" ? boundary.pointsMetersXZ.length : 64;
  return { vertices: vertices + 1, triangles: vertices };
}

function pushBudgetDiagnosticV3(
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

export function compileWorld(input: CompileWorldInput): CompileWorldResultV3 {
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
          message:
            "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV2.",
          details: {
            expected: actualNormalizedWorldIrHash,
            actual: input.normalizedWorldIrHash,
          },
        },
      ],
    };
  }

  try {
    const terrain = compileTerrainV3(world);
    const waters = compileWatersV3(world, terrain);
    const objects = compileObjectsV3(world);
    const { subjects, resourceCost: subjectResourceCost } = compileSubjectsV3(
      world,
      terrain,
    );
    const cameraNode = findOnlyNodeV3(world.nodes, "camera");
    const terrainVertices =
      terrain.resolutionCellsXZ[0] * terrain.resolutionCellsXZ[1];
    const terrainTriangles =
      (terrain.resolutionCellsXZ[0] - 1) *
      (terrain.resolutionCellsXZ[1] - 1) *
      2;
    const objectCosts = objects.map((object) =>
      primitiveResourceCostV3(object.primitive),
    );
    const waterCosts = waters.map((water) => waterResourceCostV3(water.boundary));
    const usage = {
      vertices:
        terrainVertices +
        subjectResourceCost.vertices +
        [...objectCosts, ...waterCosts].reduce(
          (sum, cost) => sum + cost.vertices,
          0,
        ),
      triangles:
        terrainTriangles +
        subjectResourceCost.triangles +
        [...objectCosts, ...waterCosts].reduce(
          (sum, cost) => sum + cost.triangles,
          0,
        ),
      colliders:
        1 +
        subjectResourceCost.colliders +
        objects.filter((object) => object.collisionEnabled).length,
    };
    const diagnostics: CompileDiagnostic[] = [];
    const budget = world.world.resourceBudget;
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxVertices",
      usage.vertices,
      budget.maxVertices,
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxTriangles",
      usage.triangles,
      budget.maxTriangles,
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxColliders",
      usage.colliders,
      budget.maxColliders,
    );
    if (diagnostics.length > 0) return { ok: false, diagnostics };

    const rig = cameraNode.components.cameraRig;
    const executionPlan: ExecutionPlanV3 = {
      kind: "worldkit-execution-plan",
      schemaVersion: 3,
      id: world.id,
      seed: world.seed,
      runtimeBackend: "babylon-havok",
      normalizedWorldIrHash: input.normalizedWorldIrHash,
      resourceLockHash: world.resources.resourceLockHash,
      coordinateSystem: world.world.coordinateSystem,
      gravityMetersPerSecondSquaredXYZ: [
        ...world.world.gravityMetersPerSecondSquaredXYZ,
      ],
      atmospherePreset: world.world.environment.preset,
      terrain,
      waters,
      objects,
      controlledEntityId: world.startup.controlledEntityId,
      subjects,
      camera: {
        cameraEntityId: cameraNode.id,
        rigRef: "worldkit://camera/third-person.standard@1",
        targetEntityId: rig.target.targetEntityId,
        pitchRadians: rig.thirdPerson.pitchRadians,
        distanceMeters: rig.thirdPerson.distanceMeters,
        targetHeightMeters:
          rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
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
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message:
            cause instanceof Error
              ? cause.message
              : "NormalizedWorldIRV2 could not be compiled.",
        },
      ],
    };
  }
}
