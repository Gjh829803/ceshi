import {
  sha256CanonicalJson,
  type AuthoringDiagnostic,
  type AuthoringSpecV4,
  type PrimitivePrototypeSpecV2,
  type WorldNodeSpecV3,
} from "@whitebox-world/authoring";
import type {
  CompileDiagnostic,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import type { RuntimeWorldConfigurationV1 } from "@whitebox-world/runtime-host";
import {
  SceneCompilationError,
  compileOutdoorScene,
  deriveWorldPlanArtifacts,
  hashString,
  isTerrainSurface,
  type CompiledOutdoorScene,
  type FeatureRegistry,
  type LandmarkDescriptor,
  type LandmarkPrimitiveDescriptor,
  type OutdoorSceneDefinition,
  type TerrainSurface,
  type TrackedWorldResource,
  type WaterSurfaceDescriptor,
} from "@whitebox-world/world";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { isNil } from "lodash-es";

import {
  loadAuthoringScene,
  type CapabilityDemoHostOverlayV1,
} from "./authoring-loader.js";
import type {
  PlaygroundWorldMetadataV1,
} from "./playground-world.js";
import { inspectPlaygroundFeatures } from "./playground-feature-inspection.js";

const LAYOUT_SOLVER_PROFILE_REF =
  "worldkit://layout-solver-profile/outdoor.s1@1";
const DEFAULT_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.third-person@1";
const CAMERA_RIG_REF = "worldkit://camera/third-person.standard@1";
const LEGACY_SUBJECT_CENTER_OFFSET_METERS = 0.9;

export type OutdoorSceneGameplayDiagnostic =
  | AuthoringDiagnostic
  | CompileDiagnostic;

export interface OutdoorSceneGameplayLoadOptionsV1 {
  readonly sceneCatalogId: string;
  readonly aspectRatio?: number;
  readonly subjectDefinitionRef?: string;
}

export interface OutdoorSceneGameplayLoadResultV1 {
  readonly ok: boolean;
  readonly executionPlan?: ExecutionPlanV5;
  readonly normalizedWorldIrHash?: string;
  readonly executionPlanHash?: string;
  readonly diagnostics: readonly OutdoorSceneGameplayDiagnostic[];
  readonly hostOverlay?: CapabilityDemoHostOverlayV1;
  readonly playgroundMetadata?: PlaygroundWorldMetadataV1;
  /** Internal Host bootstrap. This is intentionally not a Browser DTO. */
  readonly runtimeWorldConfiguration?: RuntimeWorldConfigurationV1;
}

class OutdoorSceneImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "OutdoorSceneImportError";
  }
}

interface ImportedHeightfieldV1 {
  readonly terrainEntityId: "terrain";
  readonly centerMetersXZ: readonly [number, number];
  readonly sizeMetersXZ: readonly [number, number];
  readonly resolutionVerticesXZ: readonly [number, number];
  readonly heightSamplesMeters: readonly number[];
  readonly minimumHeightMeters: number;
  readonly maximumHeightMeters: number;
}

interface FlattenedLandmarkPrimitiveV1 {
  readonly entityId: string;
  readonly prototype: PrimitivePrototypeSpecV2;
  readonly node: Extract<WorldNodeSpecV3, { kind: "object" }>;
}

function isFiniteVector3(value: unknown, positive = false): value is readonly [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) =>
      typeof component === "number" &&
      Number.isFinite(component) &&
      (!positive || component > 0)
    );
}

/** Validates the SDK-owned registry value before converting it into Canonical Authoring data. */
function isLandmarkDescriptor(value: unknown): value is LandmarkDescriptor {
  if (typeof value !== "object" || isNil(value) || Array.isArray(value)) return false;
  const row = value as Readonly<Record<string, unknown>>;
  const transform = row.transform;
  if (
    typeof transform !== "object" ||
    isNil(transform) ||
    Array.isArray(transform)
  ) return false;
  const transformRow = transform as Readonly<Record<string, unknown>>;
  if (
    !isFiniteVector3(transformRow.position) ||
    !isFiniteVector3(transformRow.rotation) ||
    !isFiniteVector3(transformRow.scale, true)
  ) return false;
  if (typeof row.collision !== "boolean") return false;
  if (row.kind === "compound") {
    return Array.isArray(row.children) && row.children.every(isLandmarkDescriptor);
  }
  if (row.kind !== "primitive") return false;
  if (
    row.primitive !== "box" &&
    row.primitive !== "sphere" &&
    row.primitive !== "cylinder" &&
    row.primitive !== "cone" &&
    row.primitive !== "plane"
  ) return false;
  if (!isNil(row.size) && !isFiniteVector3(row.size, true)) return false;
  if (!isNil(row.radius) && (typeof row.radius !== "number" || !Number.isFinite(row.radius) || row.radius <= 0)) {
    return false;
  }
  if (!isNil(row.height) && (typeof row.height !== "number" || !Number.isFinite(row.height) || row.height <= 0)) {
    return false;
  }
  return true;
}

function playgroundMetadata(
  scene: CompiledOutdoorScene,
  sceneCatalogId: string,
): PlaygroundWorldMetadataV1 {
  return {
    sceneCatalogId,
    ...(scene.worldSpec === undefined
      ? {}
      : {
          worldSpec: scene.worldSpec,
          planArtifacts: deriveWorldPlanArtifacts(scene),
        }),
    featureInspections: inspectPlaygroundFeatures(scene.registry),
  };
}

function diagnostic(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): OutdoorSceneGameplayDiagnostic {
  return {
    severity: "error",
    code,
    instancePath: "",
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function projectSceneDiagnostic(
  row: CompiledOutdoorScene["diagnostics"][number],
): OutdoorSceneGameplayDiagnostic {
  return {
    severity: row.severity,
    code: row.code,
    instancePath: "",
    message: row.message,
    ...(row.featureId === undefined
      ? {}
      : { details: { featureId: row.featureId } }),
  };
}

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_VALUE_INVALID",
      `${label} must be finite and greater than zero.`,
      { label, value },
    );
  }
}

function terrainResolution(surface: TerrainSurface): readonly [number, number] {
  const cells: Array<readonly [xMeters: number, zMeters: number]> = [];
  surface.forEachHeightfield((heightfield) => {
    finitePositive(heightfield.width, "heightfield.width");
    finitePositive(heightfield.depth, "heightfield.depth");
    if (!Number.isInteger(heightfield.xSegments) || heightfield.xSegments < 1) {
      throw new OutdoorSceneImportError(
        "OUTDOOR_SCENE_IMPORT_TERRAIN_RESOLUTION_INVALID",
        "Heightfield X segments must be a positive integer.",
      );
    }
    if (!Number.isInteger(heightfield.zSegments) || heightfield.zSegments < 1) {
      throw new OutdoorSceneImportError(
        "OUTDOOR_SCENE_IMPORT_TERRAIN_RESOLUTION_INVALID",
        "Heightfield Z segments must be a positive integer.",
      );
    }
    cells.push([
      heightfield.width / heightfield.xSegments,
      heightfield.depth / heightfield.zSegments,
    ]);
  });
  if (cells.length === 0) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_EMPTY",
      "The selected TerrainSurface contains no heightfields.",
    );
  }
  const [cellSizeX, cellSizeZ] = cells[0]!;
  const tolerance = 1e-7;
  if (
    cells.some(
      ([candidateX, candidateZ]) =>
        Math.abs(candidateX - cellSizeX) > tolerance ||
        Math.abs(candidateZ - cellSizeZ) > tolerance,
    )
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_GRID_IRREGULAR",
      "Every terrain tile must use one regular world-space cell size.",
    );
  }
  const xSegments = Math.round(surface.width / cellSizeX);
  const zSegments = Math.round(surface.depth / cellSizeZ);
  if (
    !Number.isSafeInteger(xSegments) ||
    !Number.isSafeInteger(zSegments) ||
    xSegments < 1 ||
    zSegments < 1 ||
    Math.abs(xSegments * cellSizeX - surface.width) > tolerance ||
    Math.abs(zSegments * cellSizeZ - surface.depth) > tolerance
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_GRID_IRREGULAR",
      "Terrain bounds must be an integer number of regular cells.",
    );
  }
  return [xSegments + 1, zSegments + 1];
}

function validateTerrainTileSeams(
  surface: TerrainSurface,
  resolutionVerticesXZ: readonly [number, number],
): void {
  const [columns, rows] = resolutionVerticesXZ;
  const minimumX = surface.origin[0] - surface.width / 2;
  const minimumZ = surface.origin[1] - surface.depth / 2;
  const cellSizeX = surface.width / (columns - 1);
  const cellSizeZ = surface.depth / (rows - 1);
  const tolerance = 1e-7;
  const heightByVertex = new Map<string, number>();

  surface.forEachHeightfield((heightfield) => {
    for (let localRow = 0; localRow <= heightfield.zSegments; localRow += 1) {
      for (let localColumn = 0; localColumn <= heightfield.xSegments; localColumn += 1) {
        const [xMeters, zMeters] = heightfield.pointAt(localColumn, localRow);
        const column = Math.round((xMeters - minimumX) / cellSizeX);
        const row = Math.round((zMeters - minimumZ) / cellSizeZ);
        if (
          column < 0 || column >= columns ||
          row < 0 || row >= rows ||
          Math.abs(minimumX + column * cellSizeX - xMeters) > tolerance ||
          Math.abs(minimumZ + row * cellSizeZ - zMeters) > tolerance
        ) {
          throw new OutdoorSceneImportError(
            "OUTDOOR_SCENE_IMPORT_TERRAIN_GRID_IRREGULAR",
            "Every terrain tile vertex must align to the global terrain grid.",
            { column, row, xMeters, zMeters },
          );
        }
        const heightMeters = heightfield.getHeight(localColumn, localRow);
        if (!Number.isFinite(heightMeters)) {
          throw new OutdoorSceneImportError(
            "OUTDOOR_SCENE_IMPORT_TERRAIN_SAMPLE_INVALID",
            "Every locked terrain vertex requires one finite height sample.",
            { column, row, xMeters, zMeters, heightMeters },
          );
        }
        const key = `${column}:${row}`;
        const existingHeightMeters = heightByVertex.get(key);
        if (existingHeightMeters !== undefined && existingHeightMeters !== heightMeters) {
          throw new OutdoorSceneImportError(
            "OUTDOOR_SCENE_IMPORT_TERRAIN_SEAM_MISMATCH",
            "Terrain tiles must agree exactly at every shared vertex.",
            {
              column,
              row,
              xMeters,
              zMeters,
              existingHeightMeters,
              conflictingHeightMeters: heightMeters,
            },
          );
        }
        heightByVertex.set(key, heightMeters);
      }
    }
  });
}

function importHeightfield(surface: TerrainSurface): ImportedHeightfieldV1 {
  finitePositive(surface.width, "terrain.width");
  finitePositive(surface.depth, "terrain.depth");
  if (surface.origin.some((value) => !Number.isFinite(value))) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_BOUNDS_INVALID",
      "Terrain origin must contain finite coordinates.",
    );
  }
  const [columns, rows] = terrainResolution(surface);
  validateTerrainTileSeams(surface, [columns, rows]);
  const minimumX = surface.origin[0] - surface.width / 2;
  const minimumZ = surface.origin[1] - surface.depth / 2;
  const heightSamplesMeters: number[] = [];
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < rows; row += 1) {
    const z = minimumZ + (row / (rows - 1)) * surface.depth;
    for (let column = 0; column < columns; column += 1) {
      const x = minimumX + (column / (columns - 1)) * surface.width;
      const height = surface.sampleHeight(x, z);
      if (height === undefined || !Number.isFinite(height)) {
        throw new OutdoorSceneImportError(
          "OUTDOOR_SCENE_IMPORT_TERRAIN_SAMPLE_INVALID",
          "Every locked terrain vertex requires one finite height sample.",
          { column, row, xMeters: x, zMeters: z, heightMeters: height },
        );
      }
      heightSamplesMeters.push(height);
      minimumHeightMeters = Math.min(minimumHeightMeters, height);
      maximumHeightMeters = Math.max(maximumHeightMeters, height);
    }
  }
  return {
    terrainEntityId: "terrain",
    centerMetersXZ: [...surface.origin],
    sizeMetersXZ: [surface.width, surface.depth],
    resolutionVerticesXZ: [columns, rows],
    heightSamplesMeters,
    minimumHeightMeters,
    maximumHeightMeters,
  };
}

function safeIdToken(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/[.-]+$/, "");
  return token || "unnamed";
}

function stableSuffix(value: unknown, length = 12): string {
  return sha256CanonicalJson(value).slice("sha256:".length, "sha256:".length + length);
}

function landmarkEntityId(
  ownerFeatureId: string,
  resourceId: string,
  path: readonly string[],
): string {
  const owner = safeIdToken(ownerFeatureId).slice(0, 20);
  const leaf = safeIdToken(path.at(-1) ?? "primitive").slice(0, 18);
  return `obj.${owner}.${leaf}.${stableSuffix({ ownerFeatureId, resourceId, path })}`;
}

function prototypeId(entityId: string): string {
  return `proto.${stableSuffix(entityId, 24)}`;
}

function localMatrix(descriptor: LandmarkDescriptor): Matrix4 {
  const position = new Vector3(...descriptor.transform.position);
  const quaternion = new Quaternion().setFromEuler(
    new Euler(...descriptor.transform.rotation, "XYZ"),
  );
  const scale = new Vector3(...descriptor.transform.scale);
  if (
    !position.toArray().every(Number.isFinite) ||
    !quaternion.toArray().every(Number.isFinite) ||
    !scale.toArray().every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TRANSFORM_INVALID",
      "Landmark transforms require finite coordinates and positive scale.",
    );
  }
  return new Matrix4().compose(position, quaternion, scale);
}

function normalizedZero(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function executionTransform(matrix: Matrix4): Readonly<{
  positionMetersXYZ: readonly [number, number, number];
  rotationEulerRadiansXYZ: readonly [number, number, number];
  scaleXYZ: readonly [number, number, number];
}> {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  if (
    !position.toArray().every(Number.isFinite) ||
    !quaternion.toArray().every(Number.isFinite) ||
    !scale.toArray().every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TRANSFORM_INVALID",
      "A flattened landmark transform is not a finite positive TRS transform.",
    );
  }
  const recomposed = new Matrix4().compose(position, quaternion, scale);
  if (
    matrix.elements.some(
      (value, index) => Math.abs(value - recomposed.elements[index]!) > 1e-7,
    )
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TRANSFORM_UNREPRESENTABLE",
      "A nested landmark transform contains shear that ExecutionPlan TRS cannot represent.",
    );
  }
  const babylonEuler = new Euler().setFromQuaternion(quaternion, "YXZ");
  return {
    positionMetersXYZ: position.toArray().map(normalizedZero) as [number, number, number],
    rotationEulerRadiansXYZ: [
      normalizedZero(babylonEuler.x),
      normalizedZero(babylonEuler.y),
      normalizedZero(babylonEuler.z),
    ],
    scaleXYZ: scale.toArray().map(normalizedZero) as [number, number, number],
  };
}

function primitivePrototype(
  id: string,
  primitive: LandmarkPrimitiveDescriptor,
  semanticClassId: string,
): PrimitivePrototypeSpecV2 {
  const base = {
    id,
    version: 1 as const,
    kind: "primitive" as const,
    collisionEnabled: primitive.collision,
    semantic: { classId: semanticClassId },
  };
  switch (primitive.primitive) {
    case "box":
      return {
        ...base,
        primitive: "box",
        sizeMetersXYZ: [...(primitive.size ?? [1, 1, 1])],
      };
    case "plane": {
      const size = primitive.size ?? [1, 1, 1];
      return {
        ...base,
        primitive: "box",
        sizeMetersXYZ: [size[0], 0.1, size[2]],
      };
    }
    case "sphere":
      return {
        ...base,
        primitive: "sphere",
        radiusMeters: primitive.radius ?? 1,
      };
    case "cylinder":
    case "cone":
      return {
        ...base,
        primitive: primitive.primitive,
        radiusMeters: primitive.radius ?? 1,
        heightMeters: primitive.height ?? 1,
      };
  }
}

function flattenLandmark(
  ownerFeatureId: string,
  landmarkResourceId: string,
  descriptor: LandmarkDescriptor,
): readonly FlattenedLandmarkPrimitiveV1[] {
  const result: FlattenedLandmarkPrimitiveV1[] = [];
  const visit = (
    current: LandmarkDescriptor,
    parentMatrix: Matrix4,
    path: readonly string[],
    inheritedSemanticClassId: string,
  ): void => {
    const segment = `${safeIdToken(current.id ?? current.kind)}-${String(path.length + 1).padStart(3, "0")}`;
    const currentPath = [...path, segment];
    const worldMatrix = parentMatrix.clone().multiply(localMatrix(current));
    const semanticClassId =
      current.appearance?.semantic.trim() || inheritedSemanticClassId;
    if (current.kind === "compound") {
      current.children.forEach((child, index) => {
        visit(
          child,
          worldMatrix,
          [...currentPath, `child-${String(index + 1).padStart(3, "0")}`],
          semanticClassId,
        );
      });
      return;
    }
    const entityId = landmarkEntityId(ownerFeatureId, landmarkResourceId, currentPath);
    const resourceId = prototypeId(entityId);
    result.push({
      entityId,
      prototype: primitivePrototype(resourceId, current, semanticClassId),
      node: {
        id: entityId,
        kind: "object",
        prototypeRef: `package://prototype/${resourceId}@1`,
        placement: {
          kind: "fixed",
          transform: executionTransform(worldMatrix),
        },
      },
    });
  };
  visit(
    descriptor,
    new Matrix4().identity(),
    [],
    `landmark.${safeIdToken(ownerFeatureId)}`,
  );
  return result;
}

function isWater(value: unknown): value is WaterSurfaceDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "water"
  );
}

function waterNode(
  resource: TrackedWorldResource<WaterSurfaceDescriptor>,
): Extract<WorldNodeSpecV3, { kind: "water" }> {
  const descriptor = resource.value;
  const boundary = descriptor.area.kind === "circle"
    ? {
        kind: "circle" as const,
        centerMetersXZ: [...descriptor.area.center] as [number, number],
        radiusMeters: descriptor.area.radius,
      }
    : descriptor.area.kind === "ellipse"
      ? {
          kind: "ellipse" as const,
          centerMetersXZ: [...descriptor.area.center] as [number, number],
          radiusMetersXZ: [...descriptor.area.radius] as [number, number],
        }
      : {
          kind: "polygon" as const,
          pointsMetersXZ: descriptor.area.points.map(
            (point) => [...point] as [number, number],
          ),
        };
  const id = `water.${safeIdToken(resource.ownerFeatureId).slice(0, 28)}.${stableSuffix(resource.id)}`;
  return {
    id,
    kind: "water",
    components: {
      water: {
        terrainEntityId: "terrain",
        boundary,
        depthMeters: descriptor.minimumDepth,
        shoreWidthMeters: descriptor.shoreWidth,
        waterLevelMeters: descriptor.elevation,
        traversalMode: descriptor.traversal,
        semantic: {
          classId:
            descriptor.appearance?.semantic.trim() ||
            `water.${safeIdToken(resource.ownerFeatureId)}`,
        },
      },
    },
  };
}

const OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT = {
  maxVertices: 500_000,
  maxTriangles: 1_000_000,
  maxColliders: 2_048,
} as const satisfies AuthoringSpecV4["world"]["resourceBudget"];

function importedResourceBudget(
  scene: CompiledOutdoorScene,
): AuthoringSpecV4["world"]["resourceBudget"] {
  return {
    maxVertices: Math.min(
      scene.definition.budget?.maxVertices ?? OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxVertices,
      OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxVertices,
    ),
    maxTriangles: Math.min(
      scene.definition.budget?.maxTriangles ?? OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxTriangles,
      OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxTriangles,
    ),
    maxColliders: Math.min(
      scene.definition.budget?.maxColliders ?? OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxColliders,
      OUTDOOR_GAMEPLAY_IMPORT_RESOURCE_LIMIT.maxColliders,
    ),
  };
}

function prototypeBoundingRadiusMeters(
  prototype: PrimitivePrototypeSpecV2,
): number {
  switch (prototype.primitive) {
    case "box":
      return Math.hypot(...prototype.sizeMetersXYZ.map((value) => value / 2));
    case "sphere":
      return prototype.radiusMeters;
    case "cylinder":
    case "cone":
      return Math.hypot(prototype.radiusMeters, prototype.heightMeters / 2);
  }
}

function sceneSeed(definition: OutdoorSceneDefinition): number {
  return typeof definition.seed === "number"
    ? definition.seed >>> 0
    : hashString(definition.seed ?? definition.id);
}

function buildAuthoringSpec(
  scene: CompiledOutdoorScene,
  heightfield: ImportedHeightfieldV1,
  terrain: TerrainSurface,
  options: OutdoorSceneGameplayLoadOptionsV1,
  resourceBudget: AuthoringSpecV4["world"]["resourceBudget"],
): AuthoringSpecV4 {
  const resources = scene.registry.listResources();
  const flattenedLandmarks = resources
    .filter((resource) => resource.kind === "landmark")
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((resource) => {
      if (!isLandmarkDescriptor(resource.value)) {
        throw new OutdoorSceneImportError(
          "OUTDOOR_SCENE_IMPORT_LANDMARK_INVALID",
          `Landmark resource '${resource.id}' is invalid.`,
          {
            resourceId: resource.id,
            ownerFeatureId: resource.ownerFeatureId,
          },
        );
      }
      return flattenLandmark(resource.ownerFeatureId, resource.id, resource.value);
    });
  const waters = resources
    .filter(
      (resource): resource is TrackedWorldResource<WaterSurfaceDescriptor> =>
        resource.kind === "surface" && isWater(resource.value),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(waterNode);
  const spawnSubjectOriginPositionMetersXYZ = [
    scene.spawn.position[0],
    scene.spawn.position[1] - LEGACY_SUBJECT_CENTER_OFFSET_METERS,
    scene.spawn.position[2],
  ] as const;
  if (
    spawnSubjectOriginPositionMetersXYZ.some((value) => !Number.isFinite(value))
  ) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_SPAWN_INVALID",
      "The compiled scene spawn must contain finite coordinates.",
    );
  }
  const aspectRatio = options.aspectRatio ?? 16 / 9;
  finitePositive(aspectRatio, "camera.aspectRatio");
  const routes = (scene.worldSpec?.routes ?? []).map((route) => ({
    id: route.id,
    kind: "polyline-xz" as const,
    pointsMetersXZ: route.pointsMetersXZ.map(
      (point) => [...point] as [number, number],
    ),
    widthMeters: route.widthMeters,
    locomotionProfileRef: route.locomotionProfileRef,
  }));
  const objectHeightRangeMeters = flattenedLandmarks.reduce(
    (range, row) => {
      if (row.node.placement.kind !== "fixed") return range;
      const transform = row.node.placement.transform;
      const radiusMeters =
        prototypeBoundingRadiusMeters(row.prototype) *
        Math.max(...(transform.scaleXYZ ?? [1, 1, 1]));
      const centerHeightMeters = transform.positionMetersXYZ[1];
      return [
        Math.min(range[0], centerHeightMeters - radiusMeters),
        Math.max(range[1], centerHeightMeters + radiusMeters),
      ] as const;
    },
    [
      heightfield.minimumHeightMeters,
      Math.max(
        heightfield.maximumHeightMeters,
        spawnSubjectOriginPositionMetersXYZ[1] + 4,
      ),
    ] as const,
  );
  return {
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: scene.definition.id,
    seed: sceneSeed(scene.definition),
    layout: { solverProfileRef: LAYOUT_SOLVER_PROFILE_REF },
    spatial: { regions: [], routes, screenRegions: [], traversalAreas: [] },
    world: {
      coordinateSystem: "right-handed-y-up-minus-z-forward",
      bounds: {
        centerMetersXZ: [...terrain.origin],
        sizeMetersXZ: [terrain.width, terrain.depth],
        heightRangeMeters: [
          objectHeightRangeMeters[0] - 1,
          objectHeightRangeMeters[1] + 1,
        ],
      },
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      environment: { preset: scene.atmosphere.preset ?? "clear-day" },
      resourceBudget: { ...resourceBudget },
    },
    resources: {
      prototypes: flattenedLandmarks.map((row) => row.prototype),
      subjectDefinitions: [],
    },
    nodes: [
      {
        id: "terrain",
        kind: "terrain",
        components: {
          terrain: {
            source: {
              kind: "procedural",
              relief: "flat",
              baseHeightMeters: heightfield.minimumHeightMeters,
              amplitudeMeters: 0,
            },
            grid: {
              centerMetersXZ: [...heightfield.centerMetersXZ],
              sizeMetersXZ: [...heightfield.sizeMetersXZ],
              resolutionCellsXZ: [...heightfield.resolutionVerticesXZ],
              heightSamplesMeters: [...heightfield.heightSamplesMeters],
            },
            semantic: { classId: "terrain.outdoor" },
          },
        },
      },
      ...waters,
      ...flattenedLandmarks.map((row) => row.node),
      {
        id: "spawn",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: {
            positionMetersXYZ: spawnSubjectOriginPositionMetersXYZ,
            rotationEulerRadiansXYZ: [0, scene.spawn.facingRadians, 0],
          },
        },
        semantic: { classId: "spawn.player" },
      },
      {
        id: "player",
        kind: "subject",
        subjectDefinitionRef: DEFAULT_SUBJECT_DEFINITION_REF,
        spawnAnchorEntityId: "spawn",
      },
      {
        id: "camera",
        kind: "camera",
        components: {
          cameraRig: {
            defaultRigRef: CAMERA_RIG_REF,
            allowedRigRefs: [CAMERA_RIG_REF],
            target: {
              targetEntityId: "player",
              targetHeightMeters: scene.spawn.camera.targetHeight,
            },
            thirdPerson: {
              pitchRadians: scene.spawn.camera.pitchRadians,
              distanceMeters: scene.spawn.camera.distance,
              targetHeightMeters: scene.spawn.camera.targetHeight,
              fovDegrees: scene.spawn.camera.fovDegrees,
              aspectRatio,
            },
            manualSwitchAllowed: true,
          },
        },
      },
    ],
    relationships: [],
    rules: [],
    startup: {
      spawnAnchorEntityId: "spawn",
      controlledEntityId: "player",
      cameraEntityId: "camera",
    },
    constraints: { placements: [], connectivity: [] },
  };
}

function selectedTerrain(
  scene: CompiledOutdoorScene,
): Readonly<{ registry: FeatureRegistry; terrain: TerrainSurface }> {
  if (scene.terrainHandles.length !== 1) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_COUNT_UNSUPPORTED",
      `Outdoor Gameplay import requires exactly one terrain authority; received ${scene.terrainHandles.length}.`,
      { terrainCount: scene.terrainHandles.length },
    );
  }
  const handle = scene.terrainHandles[0]!;
  const resource = scene.registry.getResource<TerrainSurface>(handle.terrainId);
  if (resource?.kind !== "terrain" || !isTerrainSurface(resource.value)) {
    throw new OutdoorSceneImportError(
      "OUTDOOR_SCENE_IMPORT_TERRAIN_UNAVAILABLE",
      `Terrain resource '${handle.terrainId}' is unavailable.`,
    );
  }
  return { registry: scene.registry, terrain: resource.value };
}

export async function loadOutdoorGameplaySceneV1(
  definition: OutdoorSceneDefinition,
  options: OutdoorSceneGameplayLoadOptionsV1,
): Promise<OutdoorSceneGameplayLoadResultV1> {
  let scene: CompiledOutdoorScene;
  try {
    scene = compileOutdoorScene(definition);
  } catch (cause) {
    if (cause instanceof SceneCompilationError) {
      const projected = cause.diagnostics.map((row) => ({
        severity: row.severity,
        code: row.code === "LANDMARK_DESCRIPTOR_INVALID"
          ? "OUTDOOR_SCENE_IMPORT_LANDMARK_INVALID"
          : row.code,
        instancePath: "",
        message: row.message,
      } satisfies OutdoorSceneGameplayDiagnostic));
      return {
        ok: false,
        diagnostics: projected.length > 0
          ? projected
          : [diagnostic("OUTDOOR_SCENE_IMPORT_SCENE_COMPILE_FAILED", cause.message)],
      };
    }
    return {
      ok: false,
      diagnostics: [diagnostic(
        "OUTDOOR_SCENE_IMPORT_SCENE_COMPILE_FAILED",
        cause instanceof Error ? cause.message : "Outdoor scene compilation failed.",
      )],
    };
  }

  try {
    const { terrain } = selectedTerrain(scene);
    const heightfield = importHeightfield(terrain);
    const authoringSpec = buildAuthoringSpec(
      scene,
      heightfield,
      terrain,
      options,
      importedResourceBudget(scene),
    );
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(authoringSpec), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      isNil(options.subjectDefinitionRef)
        ? {}
        : { subjectDefinitionRef: options.subjectDefinitionRef },
    );
    if (
      !loaded.ok ||
      loaded.executionPlan?.schemaVersion !== 5 ||
      isNil(loaded.executionPlanHash) ||
      isNil(loaded.normalizedWorldIrHash) ||
      isNil(loaded.runtimeWorldConfiguration)
    ) {
      return {
        ok: false,
        diagnostics: [
          ...scene.diagnostics.map(projectSceneDiagnostic),
          ...loaded.diagnostics,
        ],
        ...(isNil(loaded.hostOverlay) ? {} : { hostOverlay: loaded.hostOverlay }),
      };
    }
    return {
      ok: true,
      executionPlan: loaded.executionPlan,
      normalizedWorldIrHash: loaded.normalizedWorldIrHash,
      executionPlanHash: loaded.executionPlanHash,
      diagnostics: [
        ...scene.diagnostics.map(projectSceneDiagnostic),
        ...loaded.diagnostics,
      ],
      ...(isNil(loaded.hostOverlay) ? {} : { hostOverlay: loaded.hostOverlay }),
      playgroundMetadata: playgroundMetadata(scene, options.sceneCatalogId),
      runtimeWorldConfiguration: loaded.runtimeWorldConfiguration,
    };
  } catch (cause) {
    if (cause instanceof OutdoorSceneImportError) {
      return {
        ok: false,
        diagnostics: [diagnostic(cause.code, cause.message, cause.details)],
      };
    }
    return {
      ok: false,
      diagnostics: [diagnostic(
        "OUTDOOR_SCENE_IMPORT_FAILED",
        cause instanceof Error ? cause.message : "Outdoor scene import failed.",
      )],
    };
  }
}
