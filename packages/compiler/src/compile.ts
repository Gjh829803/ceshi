import type {
  NormalizedWorldIRV4,
  NormalizedLayoutAssertionV1,
  NormalizedWorldNodeV4,
  PrimitivePrototypeSpecV2,
  PrototypeTraversalSurfaceBindingV1,
  Vec2,
} from "@whitebox-world/authoring";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  createGameplayBootstrapResourceLockEntryV1,
  parseGameplayBootstrapV1,
  type GameplayBootstrapResourceLockEntryV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sampleTriangleHeightfieldSurface,
  validateSpawnSafety,
  type SpawnFootprintBoundary,
  type SpawnStaticBlockingObject,
} from "@whitebox-world/terrain-surface";
import {
  worldResourceLockEntriesV1,
  createCanonicalSceneExecutionPlanV1,
  createWorldRuntimeBootstrapV1,
  hashCanonicalSceneExecutionPlanV1,
  type CanonicalSceneConnectivityRequirementV1,
  type CanonicalSceneExecutionPlanV1,
  type CanonicalSceneHeightfieldTraversalSurfaceV1,
  type CanonicalSceneLayoutAssertionV1,
  type CanonicalSceneLayoutPlacementV1,
  type CanonicalSceneLayoutV1,
  type CanonicalSceneObjectPrimitiveV1,
  type CanonicalSceneObjectV1,
  type CanonicalSceneResourceLockEntryV1,
  type CanonicalSceneStaticColliderShapeV1,
  type CanonicalSceneStaticColliderTraversalSurfaceV1,
  type CanonicalSceneStaticColliderV1,
  type CanonicalSceneTerrainV1,
  type CanonicalSceneTraversalAreaV1,
  type CanonicalSceneWaterBoundaryV1,
  type CanonicalSceneWaterV1,
  type RuntimeAnimationSetV1,
  type RuntimeColliderProfileV1,
  type RuntimeRigProfileV1,
  type RuntimeSubjectAssetV1,
  type RuntimeResourceKindV1,
  type RuntimeResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  deriveColliderSubshapeIdV1,
  resolveTraversalSurfaceProfileV1,
} from "@whitebox-world/traversal";
import { isNil, max, min } from "lodash-es";

import { sampleFractalNoise } from "./noise";
import {
  compileNormalizedSubjectResourcesV1,
  type CompiledSubjectV1,
} from "./compile-subjects";

type NormalizedWorldCompileView = Pick<
  NormalizedWorldIRV4,
  "id" | "seed" | "world" | "resources" | "nodes" | "startup"
>;

interface CompileWorldCoreInput {
  normalizedWorldIr: NormalizedWorldCompileView;
}

interface CompiledCameraV1 {
  readonly cameraEntityId: string;
  readonly rigRef: "worldkit://camera/third-person.standard@1";
  readonly targetEntityId: string;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly targetHeightMeters: number;
  readonly fovDegrees: number;
  readonly aspectRatio: number;
  readonly manualSwitchAllowed: boolean;
}

interface CompiledWorldComponents {
  readonly id: string;
  readonly seed: number;
  readonly coordinateSystem: CanonicalSceneExecutionPlanV1["coordinateSystem"];
  readonly gravityMetersPerSecondSquaredXYZ:
    WorldRuntimeBootstrapV1["gravityMetersPerSecondSquaredXYZ"];
  readonly atmospherePreset: CanonicalSceneExecutionPlanV1["atmospherePreset"];
  readonly terrain: CanonicalSceneTerrainV1;
  readonly waters: readonly CanonicalSceneWaterV1[];
  readonly objects: readonly CanonicalSceneObjectV1[];
  readonly subjectAssets: readonly RuntimeSubjectAssetV1[];
  readonly rigProfiles: readonly RuntimeRigProfileV1[];
  readonly animationSets: readonly RuntimeAnimationSetV1[];
  readonly colliderProfiles: readonly RuntimeColliderProfileV1[];
  readonly controlledEntityId: string;
  readonly subjects: readonly CompiledSubjectV1[];
  readonly camera: CompiledCameraV1;
  readonly resourceUsage: CanonicalSceneExecutionPlanV1["sceneResourceUsage"];
}

interface CompileWorldCoreResult {
  readonly ok: boolean;
  readonly components?: CompiledWorldComponents;
  readonly diagnostics: readonly CompileDiagnostic[];
}

export interface CompileDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly instancePath: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CompileCanonicalWorldInputV1 {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrapRef: string;
}

export type CompileCanonicalWorldResultV1 =
  | Readonly<{
      ok: true;
      canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
      executionPlanHash: Sha256HashV1;
      worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
      diagnostics: readonly CompileDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly CompileDiagnostic[];
    }>;

class CompilerInputAccessorErrorV1 extends Error {}

function assertCompilerInputAccessorFreeV1(
  value: unknown,
  visited: WeakSet<object> = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CompilerInputAccessorErrorV1();
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      throw new CompilerInputAccessorErrorV1();
    }
    if (Object.hasOwn(descriptor, "value")) {
      assertCompilerInputAccessorFreeV1(descriptor.value, visited);
    }
  }
}

function snapshotCompileCanonicalWorldInputV1(
  input: CompileCanonicalWorldInputV1,
): CompileCanonicalWorldInputV1 {
  assertCompilerInputAccessorFreeV1(input);
  return structuredClone(input);
}

export function sampleTerrainHeight(
  terrain: CanonicalSceneTerrainV1,
  pointMetersXZ: Vec2,
): number {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const maximumX = minimumX + terrain.sizeMetersXZ[0];
  const maximumZ = minimumZ + terrain.sizeMetersXZ[1];
  return sampleTriangleHeightfieldSurface(
    {
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionVerticesXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    },
    [
      Math.max(minimumX, Math.min(maximumX, pointMetersXZ[0])),
      Math.max(minimumZ, Math.min(maximumZ, pointMetersXZ[1])),
    ],
  )!.heightMeters;
}

function findOnlyNodeV4<K extends NormalizedWorldNodeV4["kind"]>(
  nodes: readonly NormalizedWorldNodeV4[],
  kind: K,
): Extract<NormalizedWorldNodeV4, { kind: K }> {
  const node = nodes.find(
    (candidate): candidate is Extract<NormalizedWorldNodeV4, { kind: K }> =>
      candidate.kind === kind,
  );
  if (node === undefined) {
    throw new Error(`NormalizedWorldIR invariant violated: missing '${kind}' node.`);
  }
  return node;
}

function compileTerrainV3(world: NormalizedWorldCompileView): CanonicalSceneTerrainV1 {
  const node = findOnlyNodeV4(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionCellsXZ;
  const [centerX, centerZ] = terrain.grid.centerMetersXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const sampledHeights = terrain.grid.heightSamplesMeters;
  const heights: number[] = [];
  if (!isNil(sampledHeights)) {
    if (sampledHeights.length !== columns * rows) {
      throw new Error(
        "NormalizedWorldIR invariant violated: terrain grid heightSamplesMeters length must equal resolutionCellsXZ product.",
      );
    }
    for (const height of sampledHeights) {
      heights.push(height);
    }
  } else {
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
        heights.push(source.baseHeightMeters + noise * source.amplitudeMeters);
      }
    }
  }
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;
  for (const height of heights) {
    minimumHeightMeters = Math.min(minimumHeightMeters, height);
    maximumHeightMeters = Math.max(maximumHeightMeters, height);
  }

  return {
    entityId: node.id,
    centerMetersXZ: [...terrain.grid.centerMetersXZ],
    sizeMetersXZ: [...terrain.grid.sizeMetersXZ],
    resolutionCellsXZ: [...terrain.grid.resolutionCellsXZ],
    heightSamplesMeters: heights,
    heightSamplesHash: sha256CanonicalJson(heights) as Sha256HashV1,
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: terrain.semantic?.classId ?? "terrain.ground",
  };
}

function boundaryCenterV3(boundary: CanonicalSceneWaterBoundaryV1): Vec2 {
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
  world: NormalizedWorldCompileView,
  terrain: CanonicalSceneTerrainV1,
): CanonicalSceneWaterV1[] {
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV4, { kind: "water" }> =>
        node.kind === "water",
    )
    .map((node) => {
      const water = node.components.water;
      const boundary = structuredClone(water.boundary) as CanonicalSceneWaterBoundaryV1;
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
): CanonicalSceneObjectPrimitiveV1 {
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

function compileObjectsV3(world: NormalizedWorldCompileView): CanonicalSceneObjectV1[] {
  const prototypes = new Map(
    world.resources.prototypes.map((prototype) => [
      `${prototype.id}@${prototype.version}`,
      prototype,
    ]),
  );
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV4, { kind: "object" }> =>
        node.kind === "object",
    )
    .map((node) => {
      const prototypeIdentity = node.prototypeRef.slice(
        "package://prototype/".length,
      );
      const prototype = prototypes.get(prototypeIdentity);
      if (prototype === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: missing Prototype '${prototypeIdentity}'.`,
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

function staticObjectFootprintV3(
  object: CanonicalSceneObjectV1,
): SpawnStaticBlockingObject | undefined {
  const [rotationX, rotationY, rotationZ] = object.transform.rotationEulerRadiansXYZ;
  if (Math.abs(rotationX) > 1e-8 || Math.abs(rotationZ) > 1e-8) return undefined;
  const [scaleX, scaleY, scaleZ] = object.transform.scaleXYZ.map(Math.abs) as [
    number,
    number,
    number,
  ];
  const [centerX, centerY, centerZ] = object.transform.positionMetersXYZ;
  let footprint: SpawnFootprintBoundary;
  let halfHeightMeters: number;
  if (object.primitive.kind === "box") {
    const halfX = object.primitive.sizeMetersXYZ[0] * scaleX / 2;
    const halfZ = object.primitive.sizeMetersXYZ[2] * scaleZ / 2;
    const cosine = Math.cos(rotationY);
    const sine = Math.sin(rotationY);
    footprint = {
      kind: "polygon",
      pointsMetersXZ: [
        [-halfX, -halfZ],
        [halfX, -halfZ],
        [halfX, halfZ],
        [-halfX, halfZ],
      ].map(([x, z]) => [
        centerX + x! * cosine - z! * sine,
        centerZ + x! * sine + z! * cosine,
      ] as const),
    };
    halfHeightMeters = object.primitive.sizeMetersXYZ[1] * scaleY / 2;
  } else {
    const radiusMeters = object.primitive.radiusMeters * Math.max(scaleX, scaleZ);
    footprint = {
      kind: "circle",
      centerMetersXZ: [centerX, centerZ],
      radiusMeters,
    };
    halfHeightMeters = object.primitive.kind === "sphere"
      ? object.primitive.radiusMeters * scaleY
      : object.primitive.heightMeters * scaleY / 2;
  }
  return {
    entityId: object.entityId,
    footprint,
    heightRangeMeters: [centerY - halfHeightMeters, centerY + halfHeightMeters],
  };
}

function validateCompiledSpawnFootprintsV3(
  subjects: readonly CompiledSubjectV1[],
  waters: readonly CanonicalSceneWaterV1[],
  objects: readonly CanonicalSceneObjectV1[],
): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const blockers = objects
    .filter((object) => object.collisionEnabled)
    .flatMap((object) => {
      const blocker = staticObjectFootprintV3(object);
      return blocker === undefined ? [] : [blocker];
    });
  for (const subject of subjects) {
    const spawnCapsuleFeetPositionMetersXYZ = [
      subject.spawnSubjectOriginPositionMetersXYZ[0] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
      subject.spawnSubjectOriginPositionMetersXYZ[1] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[1] -
        subject.collider.heightMeters / 2,
      subject.spawnSubjectOriginPositionMetersXYZ[2] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[2],
    ] as const;
    for (const water of waters) {
      const result = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters,
        },
        waterSurfaces: [{
          entityId: water.entityId,
          boundary: water.boundary,
          waterLevelMeters: water.waterLevelMeters,
          depthMeters: water.depthMeters,
          traversalMode: water.traversalMode,
        }],
      });
      if (result.some((diagnostic) => diagnostic.code === "SPAWN_IN_BLOCKED_WATER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_IN_BLOCKED_WATER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside blocked water '${water.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            waterEntityId: water.entityId,
          },
        });
      }
    }
    for (const blocker of blockers) {
      const result = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters,
        },
        staticBlockingObjects: [blocker],
      });
      if (result.some((diagnostic) => diagnostic.code === "SPAWN_INSIDE_STATIC_BLOCKER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside static blocking object '${blocker.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            objectEntityId: blocker.entityId,
          },
        });
      }
    }
  }
  return diagnostics;
}

function primitiveResourceCostV3(
  primitive: CanonicalSceneObjectPrimitiveV1,
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
  boundary: CanonicalSceneWaterBoundaryV1,
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

function compileWorldCore(input: CompileWorldCoreInput): CompileWorldCoreResult {
  const world = input.normalizedWorldIr;
  try {
    const terrain = compileTerrainV3(world);
    const waters = compileWatersV3(world, terrain);
    const objects = compileObjectsV3(world);
    const {
      subjects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      resourceCost: subjectResourceCost,
    } = compileNormalizedSubjectResourcesV1(world);
    const spawnDiagnostics = validateCompiledSpawnFootprintsV3(
      subjects,
      waters,
      objects,
    );
    if (spawnDiagnostics.length > 0) {
      return { ok: false, diagnostics: spawnDiagnostics };
    }
    const cameraNode = findOnlyNodeV4(world.nodes, "camera");
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
    const components: CompiledWorldComponents = {
      id: world.id,
      seed: world.seed,
      coordinateSystem: world.world.coordinateSystem,
      gravityMetersPerSecondSquaredXYZ: [
        ...world.world.gravityMetersPerSecondSquaredXYZ,
      ],
      atmospherePreset: world.world.environment.preset,
      terrain,
      waters,
      objects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
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
        aspectRatio: rig.thirdPerson.aspectRatio,
        manualSwitchAllowed: rig.manualSwitchAllowed,
      },
      resourceUsage: usage,
    };
    return {
      ok: true,
      components,
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
              : "NormalizedWorldIR could not be compiled.",
        },
      ],
    };
  }
}

function projectPrimitiveRecord(
  value: Readonly<Record<string, number | boolean | string>>,
  allowedKeys: readonly string[],
): Readonly<Record<string, number | boolean | string>> {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" || typeof candidate === "boolean" || typeof candidate === "string"
        ? [[key, candidate] as const]
        : [];
    }),
  );
}

function projectNumericRecord(
  value: Readonly<Record<string, number>>,
  allowedKeys: readonly string[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" && Number.isFinite(candidate)
        ? [[key, candidate] as const]
        : [];
    }),
  );
}

function assertionMeasurementKeys(
  kind: NormalizedLayoutAssertionV1["kind"],
): readonly string[] {
  switch (kind) {
    case "inside-region":
      return ["isInside", "minimumBoundaryClearanceMeters"];
    case "outside-region":
      return ["intersectsRegion", "minimumBoundaryClearanceMeters"];
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
      return ["angularDeviationDegrees"];
    case "supported-by":
      return ["maximumSupportGapMeters", "supportRatio"];
    case "minimum-clearance":
      return ["hasOverlap", "minimumClearanceMeters"];
    case "within-slope-limit":
      return ["maximumSlopeDegrees", "sampledPointCount", "sampledLateralOffsetCount"];
    case "visible-in-camera-region":
      return ["projectedAreaRatio", "visibleRatio", "isOccluded", "cameraTargetAnchorEntityId"];
  }
}

function assertionToleranceKeys(
  kind: NormalizedLayoutAssertionV1["kind"],
): readonly string[] {
  switch (kind) {
    case "inside-region":
    case "outside-region":
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
    case "within-slope-limit":
      return ["angleDegrees"];
    case "supported-by":
      return ["supportGapMeters"];
    case "minimum-clearance":
      return ["overlapMeters"];
    case "visible-in-camera-region":
      return ["ratio"];
  }
}

function assertionBase(
  assertion: NormalizedLayoutAssertionV1,
): Pick<CanonicalSceneLayoutAssertionV1, "constraintId" | "evidenceEntityIds" | "measurements" | "tolerances"> {
  return {
    constraintId: assertion.constraintId,
    evidenceEntityIds: [...assertion.evidenceEntityIds],
    measurements: projectPrimitiveRecord(
      assertion.measurements,
      assertionMeasurementKeys(assertion.kind),
    ),
    tolerances: projectNumericRecord(
      assertion.tolerances,
      assertionToleranceKeys(assertion.kind),
    ),
  };
}

function projectLayoutAssertionV1(
  assertion: NormalizedLayoutAssertionV1,
): CanonicalSceneLayoutAssertionV1 {
  const base = assertionBase(assertion);
  switch (assertion.kind) {
    case "inside-region":
    case "outside-region":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, regionId: assertion.regionId, boundaryClearanceMeters: assertion.boundaryClearanceMeters };
    case "distance-range":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, referenceEntityId: assertion.referenceEntityId, minimumDistanceMeters: assertion.minimumDistanceMeters, maximumDistanceMeters: assertion.maximumDistanceMeters };
    case "faces-entity":
      return { ...base, kind: assertion.kind, facingEntityId: assertion.facingEntityId, targetEntityId: assertion.targetEntityId, maximumAngularDeviationDegrees: assertion.maximumAngularDeviationDegrees };
    case "supported-by":
      return { ...base, kind: assertion.kind, supportedEntityId: assertion.supportedEntityId, supportingEntityId: assertion.supportingEntityId, maximumSupportGapMeters: assertion.maximumSupportGapMeters, minimumSupportRatio: assertion.minimumSupportRatio };
    case "minimum-clearance":
      return assertion.otherEntityIds === undefined
        ? { ...base, kind: assertion.kind, entityId: assertion.entityId, semanticClassIds: [...assertion.semanticClassIds], clearanceMeters: assertion.clearanceMeters }
        : { ...base, kind: assertion.kind, entityId: assertion.entityId, otherEntityIds: [...assertion.otherEntityIds], clearanceMeters: assertion.clearanceMeters };
    case "within-slope-limit":
      return assertion.entityId === undefined
        ? { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, routeId: assertion.routeId, maximumSlopeDegrees: assertion.maximumSlopeDegrees }
        : { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, entityId: assertion.entityId, maximumSlopeDegrees: assertion.maximumSlopeDegrees };
    case "visible-in-camera-region":
      return { ...base, kind: assertion.kind, visibleEntityId: assertion.visibleEntityId, cameraEntityId: assertion.cameraEntityId, screenRegionId: assertion.screenRegionId, minimumVisibleRatio: assertion.minimumVisibleRatio, minimumProjectedAreaRatio: assertion.minimumProjectedAreaRatio };
  }
}

function projectPlacementV1(
  node: Extract<NormalizedWorldIRV4["nodes"][number], { kind: "object" | "anchor" }>,
): CanonicalSceneLayoutPlacementV1 {
  return {
    entityId: node.id,
    transform: {
      positionMetersXYZ: [...node.transform.positionMetersXYZ],
      rotationEulerRadiansXYZ: [...node.transform.rotationEulerRadiansXYZ],
      scaleXYZ: [...node.transform.scaleXYZ],
    },
    placementProvenance: {
      kind: node.placementProvenance.kind,
      candidateId: node.placementProvenance.candidateId,
      placementConstraintIds: [...node.placementProvenance.placementConstraintIds],
      solverProfileRef: node.placementProvenance.solverProfileRef,
      layoutSolveReportHash: node.placementProvenance.layoutSolveReportHash,
    },
  };
}

type NormalizedLayoutCompileView = Readonly<{
  nodes: NormalizedWorldIRV4["nodes"];
  layout: Pick<
    NormalizedWorldIRV4["layout"],
    | "solverProfileRef"
    | "resolvedVersion"
    | "solverProfileHash"
    | "layoutSolveReportHash"
    | "regions"
    | "routes"
    | "screenRegions"
    | "heightfields"
    | "assertions"
  >;
}>;

function compileLockedTerrainV4(
  world: Pick<NormalizedLayoutCompileView, "layout">,
  baseline: CanonicalSceneTerrainV1,
): CanonicalSceneTerrainV1 {
  const heightfield = world.layout.heightfields.find((row) => row.terrainEntityId === baseline.entityId);
  if (heightfield === undefined) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISSING");
  const expectedLength = heightfield.resolutionVerticesXZ[0] * heightfield.resolutionVerticesXZ[1];
  if (
    heightfield.heightSamplesMeters.length !== expectedLength ||
    heightfield.heightSamplesMeters.some((value) => !Number.isFinite(value))
  ) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  const heightSamplesMeters = [...heightfield.heightSamplesMeters];
  const heightSamplesHash = sha256CanonicalJson(heightSamplesMeters);
  if (heightSamplesHash !== baseline.heightSamplesHash) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISMATCH");
  }
  const minimumHeightMeters = min(heightSamplesMeters);
  const maximumHeightMeters = max(heightSamplesMeters);
  if (isNil(minimumHeightMeters) || isNil(maximumHeightMeters)) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  }
  return {
    entityId: baseline.entityId,
    centerMetersXZ: [...heightfield.centerMetersXZ],
    sizeMetersXZ: [...heightfield.sizeMetersXZ],
    resolutionCellsXZ: [...heightfield.resolutionVerticesXZ],
    heightSamplesMeters,
    heightSamplesHash,
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: baseline.semanticClassId,
  };
}

function compileCanonicalSceneLayoutV1(
  world: NormalizedLayoutCompileView,
): CanonicalSceneLayoutV1 {
  const placements = world.nodes
    .filter((node): node is Extract<typeof node, { kind: "object" | "anchor" }> =>
      node.kind === "object" || node.kind === "anchor")
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const node of placements) {
    if (
      node.placementProvenance.layoutSolveReportHash !==
        world.layout.layoutSolveReportHash ||
      node.placementProvenance.solverProfileRef !== world.layout.solverProfileRef
    ) {
      throw new Error("COMPILER_LAYOUT_PROVENANCE_MISMATCH");
    }
  }
  return {
    solverProfileRef: world.layout.solverProfileRef,
    resolvedVersion: world.layout.resolvedVersion,
    solverProfileHash: world.layout.solverProfileHash,
    layoutSolveReportHash: world.layout.layoutSolveReportHash,
    regions: [...world.layout.regions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((region) => ({
        id: region.id,
        kind: region.kind,
        pointsMetersXZ: region.pointsMetersXZ.map((point) => [...point]),
        ...(region.minimumHeightMeters === undefined
          ? {}
          : { minimumHeightMeters: region.minimumHeightMeters }),
        ...(region.maximumHeightMeters === undefined
          ? {}
          : { maximumHeightMeters: region.maximumHeightMeters }),
        semanticClassId: region.semanticClassId,
      })),
    routes: [...world.layout.routes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((route) => ({
        id: route.id,
        kind: route.kind,
        pointsMetersXZ: route.pointsMetersXZ.map((point) => [...point]),
        widthMeters: route.widthMeters,
        locomotionProfileRef: route.locomotionProfileRef,
      })),
    screenRegions: [...world.layout.screenRegions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((region) => ({
        id: region.id,
        kind: region.kind,
        minimumUv: [...region.minimumUv],
        maximumUv: [...region.maximumUv],
      })),
    placementsByEntityId: Object.fromEntries(placements.map((node) => [
      node.id,
      projectPlacementV1(node),
    ])),
    layoutAssertions: [...world.layout.assertions]
      .sort((left, right) => left.constraintId.localeCompare(right.constraintId))
      .map(projectLayoutAssertionV1),
  };
}

function compileTraversalAreaV1(
  area: NormalizedWorldIRV4["layout"]["traversalAreas"][number],
): CanonicalSceneTraversalAreaV1 {
  return {
    id: area.id,
    kind: area.kind,
    pointsMetersXZ: area.pointsMetersXZ.map((point) => [...point]),
    surfaceEntityId: area.surfaceEntityId,
    mode: area.mode,
  };
}

function compileHeightfieldTraversalSurfaceV1(
  terrain: CanonicalSceneTerrainV1,
): CanonicalSceneHeightfieldTraversalSurfaceV1 {
  const surfaceEntityId = terrain.entityId;
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    surfaceEntityId,
    "heightfield",
  );
  return {
    kind: "heightfield",
    traversalSurfaceId: `traversal-surface:${sha256CanonicalJson({
      surfaceEntityId,
      logicalSubshapeId: "heightfield",
    })}`,
    surfaceEntityId,
    colliderSubshapeId,
    resourceRef: `package://traversal-surface/${surfaceEntityId}.heightfield@1`,
    resolvedVersion: "1",
    resourceHash: sha256CanonicalJson({
      surfaceEntityId,
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionCellsXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    }) as `sha256:${string}`,
  };
}

function staticColliderShapeV1(
  primitive: CanonicalSceneObjectV1["primitive"],
): CanonicalSceneStaticColliderShapeV1 {
  switch (primitive.kind) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...primitive.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: primitive.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: "cylinder",
        radiusMeters: primitive.radiusMeters,
        heightMeters: primitive.heightMeters,
      };
  }
}

function compileStaticColliderV1(
  object: CanonicalSceneObjectV1,
): CanonicalSceneStaticColliderV1 {
  const logicalSubshapeId = "primary";
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    object.entityId,
    logicalSubshapeId,
  );
  const hashInput = {
    entityId: object.entityId,
    logicalSubshapeId,
    colliderSubshapeId,
    transform: structuredClone(object.transform),
    shape: staticColliderShapeV1(object.primitive),
  };
  return {
    ...hashInput,
    colliderHash: sha256CanonicalJson(hashInput) as `sha256:${string}`,
  };
}

const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1 = [
  "id",
  "kind",
  "logicalSubshapeId",
  "traversalSurfaceProfileRef",
] as const;
const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1 =
  /^[a-z0-9][a-z0-9.-]{0,63}$/;
const TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1 =
  /^worldkit:\/\/traversal-surface-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;

function canonicalPrototypeTraversalSurfaceBindingV1(
  value: unknown,
  prototypeId: string,
): PrototypeTraversalSurfaceBindingV1 {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.<unknown>' is invalid.`,
    );
  }
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  const expectedFields = [
    ...PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1,
  ].sort();
  const bindingId = typeof record.id === "string" ? record.id : "<unknown>";
  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index]) ||
    typeof record.id !== "string" ||
    !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(record.id) ||
    record.kind !== "collider-subshape" ||
    typeof record.logicalSubshapeId !== "string" ||
    !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(
      record.logicalSubshapeId,
    ) ||
    typeof record.traversalSurfaceProfileRef !== "string" ||
    !TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1.test(
      record.traversalSurfaceProfileRef,
    )
  ) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.${bindingId}' is invalid.`,
    );
  }
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    logicalSubshapeId: record.logicalSubshapeId,
    traversalSurfaceProfileRef: record.traversalSurfaceProfileRef,
  });
}

function compileStaticColliderTraversalSurfaceV1(input: {
  readonly prototypeId: string;
  readonly prototypeVersion: number;
  readonly binding: PrototypeTraversalSurfaceBindingV1;
  readonly entityId: string;
  readonly staticColliders: readonly CanonicalSceneStaticColliderV1[];
  readonly resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"];
}): CanonicalSceneStaticColliderTraversalSurfaceV1 {
  const matchingColliders = input.staticColliders.filter(
    (collider) =>
      collider.entityId === input.entityId &&
      collider.logicalSubshapeId === input.binding.logicalSubshapeId,
  );
  if (matchingColliders.length !== 1) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' requires exactly one Collider; received ${matchingColliders.length}.`,
    );
  }
  const collider = matchingColliders[0]!;
  if (
    collider.colliderSubshapeId !== deriveColliderSubshapeIdV1(
      input.entityId,
      input.binding.logicalSubshapeId,
    )
  ) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' has a non-canonical colliderSubshapeId.`,
    );
  }
  const resolvedProfile = resolveTraversalSurfaceProfileV1(
    input.binding.traversalSurfaceProfileRef,
  );
  const matchingProfileRows = input.resourceLock.filter(
    (row) => row.resourceRef === resolvedProfile.resourceRef,
  );
  if (matchingProfileRows.length !== 1) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' requires exactly one row; received ${matchingProfileRows.length}.`,
    );
  }
  const profileRow = matchingProfileRows[0]!;
  if (
    profileRow.resourceRef !== resolvedProfile.resourceRef ||
    profileRow.resourceKind !== "traversal-surface-profile" ||
    profileRow.resolvedVersion !== resolvedProfile.resolvedVersion ||
    profileRow.contentHash !== resolvedProfile.contentHash
  ) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' does not match the resolved receipt.`,
    );
  }

  const traversalSurfaceProfileRef = profileRow.resourceRef;
  const traversalSurfaceProfileResolvedVersion = profileRow.resolvedVersion;
  const traversalSurfaceProfileHash = profileRow.contentHash as `sha256:${string}`;
  const bindingIdentity = {
    id: input.binding.id,
    kind: input.binding.kind,
    logicalSubshapeId: input.binding.logicalSubshapeId,
    traversalSurfaceProfileRef: input.binding.traversalSurfaceProfileRef,
  };
  const traversalSurfaceId = `traversal-surface:${sha256CanonicalJson({
    kind: "static-collider",
    surfaceEntityId: input.entityId,
    logicalSurfaceId: input.binding.id,
  })}`;
  const resourceHash = sha256CanonicalJson({
    prototypeId: input.prototypeId,
    prototypeVersion: input.prototypeVersion,
    binding: bindingIdentity,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
    colliderHash: collider.colliderHash,
  }) as `sha256:${string}`;
  return {
    kind: "static-collider",
    traversalSurfaceId,
    surfaceEntityId: collider.entityId,
    colliderSubshapeId: collider.colliderSubshapeId,
    resourceRef:
      `package://traversal-surface/${input.entityId}.${input.binding.id}@${input.prototypeVersion}`,
    resolvedVersion: String(input.prototypeVersion),
    resourceHash,
    logicalSurfaceId: input.binding.id,
    logicalSubshapeId: collider.logicalSubshapeId,
    colliderHash: collider.colliderHash,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
  };
}

function compileStaticColliderTraversalSurfacesV1(
  world: NormalizedWorldIRV4,
  staticColliders: readonly CanonicalSceneStaticColliderV1[],
  resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"],
): readonly CanonicalSceneStaticColliderTraversalSurfaceV1[] {
  const objectNodes = world.nodes.filter((node) => node.kind === "object");
  const surfaces: CanonicalSceneStaticColliderTraversalSurfaceV1[] = [];
  for (const prototype of world.resources.prototypes) {
    const bindings = (prototype.traversalSurfaceBindings ?? []).map((binding) =>
      canonicalPrototypeTraversalSurfaceBindingV1(binding, prototype.id));
    const seenBindingIds = new Set<string>();
    const seenLogicalSubshapeIds = new Set<string>();
    for (const binding of bindings) {
      if (
        seenBindingIds.has(binding.id) ||
        seenLogicalSubshapeIds.has(binding.logicalSubshapeId)
      ) {
        throw new Error(
          `Traversal Surface binding '${prototype.id}.${binding.id}' is duplicated.`,
        );
      }
      seenBindingIds.add(binding.id);
      seenLogicalSubshapeIds.add(binding.logicalSubshapeId);
    }
    const prototypeRef =
      `package://prototype/${prototype.id}@${prototype.version}`;
    for (const node of objectNodes) {
      if (node.prototypeRef !== prototypeRef) continue;
      for (const binding of bindings) {
        surfaces.push(compileStaticColliderTraversalSurfaceV1({
          prototypeId: prototype.id,
          prototypeVersion: prototype.version,
          binding,
          entityId: node.id,
          staticColliders,
          resourceLock,
        }));
      }
    }
  }
  return surfaces;
}

function requireUniquePrototypeIdentitiesV1(
  prototypes: NormalizedWorldIRV4["resources"]["prototypes"],
): void {
  const seenPrototypeIdentities = new Set<string>();
  for (const prototype of prototypes) {
    const prototypeIdentity = `${prototype.id}@${prototype.version}`;
    if (seenPrototypeIdentities.has(prototypeIdentity)) {
      throw new Error(`Prototype identity '${prototypeIdentity}' is duplicated.`);
    }
    seenPrototypeIdentities.add(prototypeIdentity);
  }
}

function requireUniqueNodeEntityIdsV1(
  nodes: NormalizedWorldIRV4["nodes"],
): void {
  const seenEntityIds = new Set<string>();
  for (const node of nodes) {
    if (seenEntityIds.has(node.id)) {
      throw new Error(`Node entity id '${node.id}' is duplicated.`);
    }
    seenEntityIds.add(node.id);
  }
}

function compileConnectivityRequirementV1(
  requirement: NormalizedWorldIRV4["layout"]["connectivityRequirements"][number],
): CanonicalSceneConnectivityRequirementV1 {
  return structuredClone(requirement);
}

export function compileCanonicalWorldV1(
  input: CompileCanonicalWorldInputV1,
): CompileCanonicalWorldResultV1 {
  let snapshot: CompileCanonicalWorldInputV1;
  try {
    snapshot = snapshotCompileCanonicalWorldInputV1(input);
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: cause instanceof CompilerInputAccessorErrorV1
          ? "COMPILER_INPUT_ACCESSOR_FORBIDDEN"
          : "COMPILER_INPUT_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof CompilerInputAccessorErrorV1
          ? "Compiler input must be an accessor-free data graph."
          : "Compiler input must be a cloneable data graph.",
      }],
    };
  }
  const actualNormalizedWorldIrHash = sha256CanonicalJson(
    snapshot.normalizedWorldIr,
  );
  if (snapshot.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
        message: "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV4.",
        details: {
          expected: actualNormalizedWorldIrHash,
          actual: snapshot.normalizedWorldIrHash,
        },
      }],
    };
  }

  try {
    const normalizedResourceLockEntries = worldResourceLockEntriesV1(
      snapshot.normalizedWorldIr.resources.resourceLock,
    ) as NormalizedWorldIRV4["resources"]["resourceLock"];
    const normalizedResourceLockHash = sha256CanonicalJson(
      normalizedResourceLockEntries,
    );
    if (
      snapshot.normalizedWorldIr.resources.resourceLockHash !==
      normalizedResourceLockHash
    ) {
      throw new Error("Resource Lock hash does not match canonical entries.");
    }
    let gameplayBootstrap: GameplayBootstrapV1;
    let gameplayBootstrapResourceLock: GameplayBootstrapResourceLockEntryV1;
    try {
      gameplayBootstrap = parseGameplayBootstrapV1(snapshot.gameplayBootstrap);
      const [canonicalBootstrap] = worldResourceLockEntriesV1([
        createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
      ]);
      if (
        isNil(canonicalBootstrap) ||
        canonicalBootstrap.resourceKind !== "gameplay-bootstrap" ||
        normalizedResourceLockEntries.some(
          (entry) => entry.resourceRef === canonicalBootstrap.resourceRef,
        )
      ) {
        throw new TypeError("Invalid Gameplay Bootstrap Resource Lock.");
      }
      gameplayBootstrapResourceLock = canonicalBootstrap as
        GameplayBootstrapResourceLockEntryV1;
    } catch {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "COMPILER_GAMEPLAY_BOOTSTRAP_LOCK_INVALID",
          instancePath: "/gameplayBootstrap",
          message: "Gameplay Bootstrap must parse and produce one unique gameplay-bootstrap Resource Lock row.",
        }],
      };
    }
    const sceneResourceLockEntries:
      readonly CanonicalSceneResourceLockEntryV1[] =
      normalizedResourceLockEntries
        .filter((entry) => entry.resourceKind === "traversal-surface-profile")
        .map((entry) => ({
          resourceRef: entry.resourceRef,
          resourceKind: "traversal-surface-profile",
          resolvedVersion: entry.resolvedVersion,
          contentHash: entry.contentHash as Sha256HashV1,
        }));
    const runtimeResourceLockEntries: readonly RuntimeResourceLockEntryV1[] =
      worldResourceLockEntriesV1([
      ...normalizedResourceLockEntries.filter(
        (entry) => entry.resourceKind !== "traversal-surface-profile",
      ),
      gameplayBootstrapResourceLock,
      ]).map((entry) => ({
        resourceRef: entry.resourceRef,
        resourceKind: entry.resourceKind as RuntimeResourceKindV1,
        resolvedVersion: entry.resolvedVersion,
        contentHash: entry.contentHash as Sha256HashV1,
      }));
    const sceneResourceRefs = new Set(
      sceneResourceLockEntries.map((entry) => entry.resourceRef),
    );
    if (
      sceneResourceLockEntries.length + runtimeResourceLockEntries.length !==
        normalizedResourceLockEntries.length + 1 ||
      runtimeResourceLockEntries.some((entry) =>
        sceneResourceRefs.has(entry.resourceRef))
    ) {
      throw new Error("Resource Lock partition is ambiguous or incomplete.");
    }
    requireUniquePrototypeIdentitiesV1(
      snapshot.normalizedWorldIr.resources.prototypes,
    );
    requireUniqueNodeEntityIdsV1(snapshot.normalizedWorldIr.nodes);
    const compiledCurrent = compileWorldCore({
      normalizedWorldIr: snapshot.normalizedWorldIr,
    });
    if (!compiledCurrent.ok || compiledCurrent.components === undefined) {
      return { ok: false, diagnostics: compiledCurrent.diagnostics };
    }

    const terrain = compileLockedTerrainV4(
      snapshot.normalizedWorldIr,
      compiledCurrent.components.terrain,
    );
    const staticColliders = compiledCurrent.components.objects
      .filter((object) => object.collisionEnabled)
      .map(compileStaticColliderV1)
      .sort((left, right) =>
        left.colliderSubshapeId.localeCompare(right.colliderSubshapeId));
    const sortedTraversalSurfaces = [
      compileHeightfieldTraversalSurfaceV1(terrain),
      ...compileStaticColliderTraversalSurfacesV1(
        snapshot.normalizedWorldIr,
        staticColliders,
        normalizedResourceLockEntries,
      ),
    ].sort((left, right) =>
      left.traversalSurfaceId.localeCompare(right.traversalSurfaceId));
    for (let index = 1; index < sortedTraversalSurfaces.length; index += 1) {
      const previous = sortedTraversalSurfaces[index - 1]!;
      const current = sortedTraversalSurfaces[index]!;
      if (current.traversalSurfaceId === previous.traversalSurfaceId) {
        throw new Error(
          `Traversal Surface id '${current.traversalSurfaceId}' is duplicated.`,
        );
      }
    }
    const traversalSurfaces = Object.freeze(
      sortedTraversalSurfaces.map((surface) => Object.freeze(surface)),
    );
    const {
      controlledEntityId: initialControlledEntityId,
      ...componentsWithoutControlledEntity
    } = compiledCurrent.components;
    const initialRelationships = snapshot.normalizedWorldIr.relationships
      .map((relationship) => ({
        ...structuredClone(relationship),
        establishedSimulationTick: 0,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (
      stringifyCanonicalJson(initialRelationships) !==
      stringifyCanonicalJson(gameplayBootstrap.initialRelationshipStates)
    ) {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "COMPILER_GAMEPLAY_BOOTSTRAP_RELATIONSHIP_MISMATCH",
          instancePath: "/gameplayBootstrap/initialRelationshipStates",
          message: "Gameplay Bootstrap initial relationships must exactly match NormalizedWorldIRV4.",
        }],
      };
    }
    const subjectRuntimeDescriptors = componentsWithoutControlledEntity.subjects
      .map((subject) => {
        const {
          spawnAnchorEntityId: _spawnAnchorEntityId,
          spawnSubjectOriginPositionMetersXYZ: _position,
          spawnSubjectFacingRadians: _facing,
          ...descriptor
        } = subject;
        return descriptor;
      });
    const worldRuntimeBootstrap = createWorldRuntimeBootstrapV1({
      kind: "world-runtime-bootstrap",
      schemaVersion: 1,
      id: `${componentsWithoutControlledEntity.id}.runtime-bootstrap`,
      gameplayBootstrapRef: gameplayBootstrap.resourceRef,
      gameplayBootstrapHash: gameplayBootstrap.contentHash,
      initialControlledEntityId,
      gravityMetersPerSecondSquaredXYZ:
        componentsWithoutControlledEntity.gravityMetersPerSecondSquaredXYZ,
      initialCamera: {
        mode: "third-person",
        cameraEntityId: componentsWithoutControlledEntity.camera.cameraEntityId,
        targetEntityId: componentsWithoutControlledEntity.camera.targetEntityId,
        cameraRigProfileRef: componentsWithoutControlledEntity.camera.rigRef,
        pitchRadians: componentsWithoutControlledEntity.camera.pitchRadians,
        distanceMeters: componentsWithoutControlledEntity.camera.distanceMeters,
        targetHeightMeters: componentsWithoutControlledEntity.camera.targetHeightMeters,
        fovDegrees: componentsWithoutControlledEntity.camera.fovDegrees,
        manualSwitchAllowed:
          componentsWithoutControlledEntity.camera.manualSwitchAllowed,
      },
      subjectAssets: componentsWithoutControlledEntity.subjectAssets,
      rigProfiles: componentsWithoutControlledEntity.rigProfiles,
      animationSets: componentsWithoutControlledEntity.animationSets,
      colliderProfiles: componentsWithoutControlledEntity.colliderProfiles,
      actionPresentationRegistry: {
        schemaVersion: 1,
        bindings: [],
        rootMotionSources: [],
      },
      subjectRuntimeDescriptors,
      runtimeResourceLockEntries,
    });
    const canonicalSceneExecutionPlan = createCanonicalSceneExecutionPlanV1({
      kind: "worldkit-canonical-scene-execution-plan",
      schemaVersion: 1,
      id: componentsWithoutControlledEntity.id,
      seed: componentsWithoutControlledEntity.seed,
      authoringSpecHash: snapshot.normalizedWorldIr.authoringSpecHash,
      normalizedWorldIrHash: snapshot.normalizedWorldIrHash,
      coordinateSystem: componentsWithoutControlledEntity.coordinateSystem,
      atmospherePreset: componentsWithoutControlledEntity.atmospherePreset,
      worldRuntimeBootstrapRef: snapshot.worldRuntimeBootstrapRef,
      worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
      sceneResourceLockHash: sha256CanonicalJson(sceneResourceLockEntries) as Sha256HashV1,
      sceneResourceLockEntries,
      terrain,
      waters: componentsWithoutControlledEntity.waters,
      objects: componentsWithoutControlledEntity.objects,
      subjectInstances: componentsWithoutControlledEntity.subjects.map(
        (subject) => ({
          entityId: subject.entityId,
          spawnAnchorEntityId: subject.spawnAnchorEntityId,
          subjectOriginPositionMetersXYZ:
            subject.spawnSubjectOriginPositionMetersXYZ,
          subjectFacingRadians: subject.spawnSubjectFacingRadians,
        }),
      ),
      sceneResourceUsage: componentsWithoutControlledEntity.resourceUsage,
      layout: compileCanonicalSceneLayoutV1(snapshot.normalizedWorldIr),
      traversal: {
        surfaces: traversalSurfaces,
        traversalAreas: snapshot.normalizedWorldIr.layout.traversalAreas
          .map(compileTraversalAreaV1)
          .sort((left, right) => left.id.localeCompare(right.id)),
        connectivityRequirements: snapshot.normalizedWorldIr.layout
          .connectivityRequirements
          .map(compileConnectivityRequirementV1)
          .sort((left, right) => left.constraintId.localeCompare(right.constraintId)),
        anchorEntityIds: snapshot.normalizedWorldIr.nodes
          .filter((node) => node.kind === "anchor")
          .map((node) => node.id)
          .sort((left, right) => left.localeCompare(right)),
      },
      staticColliders,
    });
    return {
      ok: true,
      canonicalSceneExecutionPlan,
      executionPlanHash: hashCanonicalSceneExecutionPlanV1(
        canonicalSceneExecutionPlan,
      ),
      worldRuntimeBootstrap,
      diagnostics: [],
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof Error
          ? cause.message
          : "NormalizedWorldIRV4 could not be compiled.",
      }],
    };
  }
}
