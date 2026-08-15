import type {
  Diagnostic,
  ResourceBudget,
  ResourceId,
  Vec2Tuple,
  Vec3Tuple,
} from "@whitebox-world/contracts";
import { DEFAULT_HUMANOID_TRAVERSAL } from "@whitebox-world/contracts";

import {
  FeatureRegistry,
  type FeatureInspection,
  type FeatureInstanceOptions,
  type WorldFeatureDefinition,
} from "./features";
import type { CompoundLandmarkSpec } from "./landmarks";
import {
  CompoundLandmarkFeature,
  LakeFeature,
  RollingTerrainFeature,
  TiledRollingTerrainFeature,
  WaterBodyFeature,
  type CompoundLandmarkOutput,
  type CompoundLandmarkParams,
  type LakeOutput,
  type LakeParams,
  type RollingTerrainOutput,
  type RollingTerrainParams,
  type TiledRollingTerrainParams,
  type TerrainRelief,
  type WaterBodyParams,
} from "./official-features";
import { hashString, type Seed } from "./random";
import type { SerializedShape2D } from "./shapes";
import {
  isTerrainSurface,
  sampleTerrainSlopeDegrees,
  type TerrainSurface,
} from "./terrain";

export interface SceneFeatureHandle<O = unknown> {
  id: string;
  output: O;
  inspection: FeatureInspection<O>;
}

export interface SceneTerrainHandle extends SceneFeatureHandle<RollingTerrainOutput> {
  terrainId: ResourceId;
}

export interface SceneWaterHandle extends SceneFeatureHandle<LakeOutput> {
  waterSurfaceId: ResourceId;
}

export interface SceneLandmarkHandle extends SceneFeatureHandle<CompoundLandmarkOutput> {
  landmarkId: ResourceId;
}

export interface OutdoorSceneAtmosphere {
  preset?: "clear-day" | "golden-hour" | "overcast" | "night";
  skyColor?: number;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
  sunDirection?: Vec3Tuple;
  sunIntensity?: number;
  semantic?: string;
  appearancePrompt?: string;
}

export interface SceneSpawnRequest {
  terrain: SceneTerrainHandle;
  at: Vec2Tuple;
  heightOffset?: number;
  facingRadians?: number;
  camera?: SceneThirdPersonCameraRequest;
}

/** Initial framing only; the SDK continues to own camera controls at runtime. */
export interface SceneThirdPersonCameraRequest {
  /** Orbit pitch. Positive values raise the camera and look farther downward. */
  pitchRadians?: number;
  distance?: number;
}

export interface ResolvedSceneSpawn {
  position: Vec3Tuple;
  facingRadians: number;
  camera: Required<SceneThirdPersonCameraRequest>;
}

export type SceneRollingTerrainSpec = RollingTerrainParams & { id: string; seed?: Seed };
export type SceneTiledTerrainSpec = TiledRollingTerrainParams & { id: string; seed?: Seed };
export type SceneLandscapeTerrainSpec = Omit<TiledRollingTerrainParams, "relief"> & {
  id: string;
  seed?: Seed;
  relief: TerrainRelief;
};
export type SceneLakeSpec = Omit<LakeParams, "terrainId"> & {
  id: string;
  terrain: SceneTerrainHandle;
  seed?: Seed;
};
export type SceneWaterBodySpec = Omit<WaterBodyParams, "terrainId" | "boundary"> & {
  id: string;
  terrain: SceneTerrainHandle;
  boundary: SerializedShape2D;
  seed?: Seed;
};
export type SceneCompoundLandmarkSpec = Omit<CompoundLandmarkParams, "children"> & {
  id: string;
  children: CompoundLandmarkSpec["children"];
  seed?: Seed;
  dependsOn?: readonly SceneFeatureHandle[];
};

export interface OutdoorSceneAuthoringContext {
  readonly sceneId: string;
  readonly seed: number;
  readonly terrain: {
    /** Preferred large-world API. The relief choice must match the requested scene. */
    landscape(spec: SceneLandscapeTerrainSpec): SceneTerrainHandle;
    rolling(spec: SceneRollingTerrainSpec): SceneTerrainHandle;
    /** @deprecated Prefer landscape({ relief: ... }) for explicit authoring intent. */
    tiledRolling(spec: SceneTiledTerrainSpec): SceneTerrainHandle;
    custom<P extends object, O>(
      definition: WorldFeatureDefinition<P, O>,
      options: FeatureInstanceOptions<P>,
      selectTerrain: (output: O) => ResourceId,
    ): SceneTerrainHandle;
    height(terrain: SceneTerrainHandle, point: Vec2Tuple): number | undefined;
    slopeDegrees(terrain: SceneTerrainHandle, point: Vec2Tuple, sampleDistance?: number): number | undefined;
  };
  readonly water: {
    lake(spec: SceneLakeSpec): SceneWaterHandle;
    body(spec: SceneWaterBodySpec): SceneWaterHandle;
  };
  readonly landmark: {
    compound(spec: SceneCompoundLandmarkSpec): SceneLandmarkHandle;
  };
  readonly feature: {
    add<P extends object, O>(
      definition: WorldFeatureDefinition<P, O>,
      options: FeatureInstanceOptions<P>,
    ): SceneFeatureHandle<O>;
  };
  readonly player: {
    spawn(request: SceneSpawnRequest): void;
  };
  readonly atmosphere: {
    set(atmosphere: OutdoorSceneAtmosphere): void;
  };
}

export interface OutdoorSceneDefinition {
  kind: "outdoor";
  version: 1;
  id: string;
  title?: string;
  seed?: Seed;
  budget?: ResourceBudget;
  build(context: OutdoorSceneAuthoringContext): void;
}

export interface CompiledOutdoorScene {
  definition: OutdoorSceneDefinition;
  registry: FeatureRegistry;
  terrainHandles: readonly SceneTerrainHandle[];
  spawn: ResolvedSceneSpawn;
  atmosphere: OutdoorSceneAtmosphere;
  diagnostics: readonly Diagnostic[];
}

export class SceneCompilationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly Diagnostic[] = [],
  ) {
    super(message);
    this.name = "SceneCompilationError";
  }
}

function requireBuilt<O>(inspection: FeatureInspection<O>): O {
  if (inspection.status !== "built" || inspection.output === undefined) {
    throw new SceneCompilationError(
      `Scene feature ${inspection.id} failed to compile.`,
      inspection.diagnostics,
    );
  }
  return inspection.output;
}

function resolvedSeed(sceneSeed: number, id: string, seed?: Seed): Seed {
  return seed ?? hashString(`${sceneSeed}:${id}`);
}

export function defineOutdoorScene(
  definition: Omit<OutdoorSceneDefinition, "kind" | "version"> & {
    kind?: "outdoor";
    version?: 1;
  },
): OutdoorSceneDefinition {
  if (!definition.id.trim()) throw new Error("Outdoor scene id cannot be empty.");
  return Object.freeze({ ...definition, kind: "outdoor", version: 1 });
}

export function compileOutdoorScene(definition: OutdoorSceneDefinition): CompiledOutdoorScene {
  const sceneSeed =
    typeof definition.seed === "number"
      ? definition.seed >>> 0
      : hashString(definition.seed ?? definition.id);
  const registry = new FeatureRegistry(
    definition.budget === undefined ? {} : { budget: definition.budget },
  );
  const terrainHandles: SceneTerrainHandle[] = [];
  let spawnRequest: SceneSpawnRequest | undefined;
  let atmosphere: OutdoorSceneAtmosphere = { preset: "clear-day" };

  const asTerrainHandle = <O>(
    inspection: FeatureInspection<O>,
    output: O,
    terrainId: ResourceId,
  ): SceneTerrainHandle => {
    const resource = registry.getResource(terrainId);
    if (resource?.kind !== "terrain" || !isTerrainSurface(resource.value)) {
      throw new SceneCompilationError(
        `Feature ${inspection.id} selected ${terrainId}, which is not a terrain resource.`,
      );
    }
    const handle: SceneTerrainHandle = {
      id: inspection.id,
      inspection: inspection as unknown as FeatureInspection<RollingTerrainOutput>,
      output: output as unknown as RollingTerrainOutput,
      terrainId,
    };
    terrainHandles.push(handle);
    return handle;
  };

  const context: OutdoorSceneAuthoringContext = {
    sceneId: definition.id,
    seed: sceneSeed,
    terrain: {
      landscape: (spec) => {
        const { id, seed, ...params } = spec;
        const inspection = registry.instantiate(TiledRollingTerrainFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          params,
        });
        const output = requireBuilt(inspection);
        return asTerrainHandle(inspection, output, output.terrainId);
      },
      rolling: (spec) => {
        const { id, seed, ...params } = spec;
        const inspection = registry.instantiate(RollingTerrainFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          params,
        });
        const output = requireBuilt(inspection);
        return asTerrainHandle(inspection, output, output.terrainId);
      },
      tiledRolling: (spec) => {
        const { id, seed, ...params } = spec;
        const inspection = registry.instantiate(TiledRollingTerrainFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          params,
        });
        const output = requireBuilt(inspection);
        return asTerrainHandle(inspection, output, output.terrainId);
      },
      custom: (featureDefinition, options, selectTerrain) => {
        const inspection = registry.instantiate(featureDefinition, options);
        const output = requireBuilt(inspection);
        return asTerrainHandle(inspection, output, selectTerrain(output));
      },
      height: (terrain, point) => {
        const resource = registry.getResource<TerrainSurface>(terrain.terrainId);
        return isTerrainSurface(resource?.value)
          ? resource.value.sampleHeight(point[0], point[1])
          : undefined;
      },
      slopeDegrees: (terrain, point, sampleDistance) => {
        const resource = registry.getResource<TerrainSurface>(terrain.terrainId);
        return isTerrainSurface(resource?.value)
          ? sampleTerrainSlopeDegrees(resource.value, point[0], point[1], sampleDistance)
          : undefined;
      },
    },
    water: {
      lake: (spec) => {
        const { id, terrain, seed, ...params } = spec;
        const inspection = registry.instantiate(LakeFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          dependsOn: [terrain.id],
          params: { ...params, terrainId: terrain.terrainId },
        });
        const output = requireBuilt(inspection);
        return {
          id,
          inspection,
          output,
          waterSurfaceId: output.waterSurfaceId,
        };
      },
      body: (spec) => {
        const { id, terrain, seed, ...params } = spec;
        const inspection = registry.instantiate(WaterBodyFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          dependsOn: [terrain.id],
          params: { ...params, terrainId: terrain.terrainId },
        });
        const output = requireBuilt(inspection);
        return {
          id,
          inspection,
          output,
          waterSurfaceId: output.waterSurfaceId,
        };
      },
    },
    landmark: {
      compound: (spec) => {
        const { id, seed, dependsOn = [], ...params } = spec;
        const inspection = registry.instantiate(CompoundLandmarkFeature, {
          id,
          seed: resolvedSeed(sceneSeed, id, seed),
          dependsOn: dependsOn.map((dependency) => dependency.id),
          params,
        });
        const output = requireBuilt(inspection);
        return { id, inspection, output, landmarkId: output.landmarkId };
      },
    },
    feature: {
      add: (featureDefinition, options) => {
        const inspection = registry.instantiate(featureDefinition, options);
        const output = requireBuilt(inspection);
        return { id: inspection.id, inspection, output };
      },
    },
    player: {
      spawn: (request) => {
        spawnRequest = request;
      },
    },
    atmosphere: {
      set: (value) => {
        atmosphere = { ...value };
      },
    },
  };

  try {
    definition.build(context);
  } catch (error) {
    if (error instanceof SceneCompilationError) throw error;
    throw new SceneCompilationError(
      `Scene ${definition.id} build function failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (terrainHandles.length === 0) {
    throw new SceneCompilationError(`Scene ${definition.id} must create at least one terrain.`);
  }
  const request =
    spawnRequest ?? { terrain: terrainHandles[0] as SceneTerrainHandle, at: [0, 0] as const };
  const terrainResource = registry.getResource<TerrainSurface>(request.terrain.terrainId);
  if (!isTerrainSurface(terrainResource?.value)) {
    throw new SceneCompilationError(`Spawn terrain ${request.terrain.terrainId} is unavailable.`);
  }
  const groundHeight = terrainResource.value.sampleHeight(request.at[0], request.at[1]);
  if (groundHeight === undefined) {
    throw new SceneCompilationError(
      `Player spawn [${request.at.join(", ")}] is outside terrain ${request.terrain.id}.`,
    );
  }
  const diagnostics = [...registry.list().flatMap((feature) => feature.diagnostics)];
  const spawnSlope = sampleTerrainSlopeDegrees(
    terrainResource.value,
    request.at[0],
    request.at[1],
  );
  if (
    spawnSlope !== undefined &&
    spawnSlope > DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees
  ) {
    const slopeDiagnostic: Diagnostic = {
      severity: "error",
      code: "SPAWN_SLOPE_NOT_WALKABLE",
      message: `Player spawn slope is ${spawnSlope.toFixed(1)}°, above the humanoid climb limit of ${DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees}°.`,
      entityId: "player",
      suggestions: ["Flatten and smooth the spawn area or move the player to a walkable surface."],
    };
    throw new SceneCompilationError(slopeDiagnostic.message, [
      ...diagnostics,
      slopeDiagnostic,
    ]);
  }
  const cameraPitchRadians = request.camera?.pitchRadians ?? 0.3;
  const cameraDistance = request.camera?.distance ?? 4.5;
  if (!Number.isFinite(cameraPitchRadians) || cameraPitchRadians < -0.95 || cameraPitchRadians > 0.65) {
    throw new SceneCompilationError(
      `Player camera pitch ${cameraPitchRadians} is outside the supported -0.95 to 0.65 radian range.`,
    );
  }
  if (!Number.isFinite(cameraDistance) || cameraDistance < 1.8 || cameraDistance > 8) {
    throw new SceneCompilationError(
      `Player camera distance ${cameraDistance} is outside the supported 1.8 to 8 meter range.`,
    );
  }
  return {
    definition,
    registry,
    terrainHandles,
    spawn: {
      position: [
        request.at[0],
        groundHeight + (request.heightOffset ?? 0.9),
        request.at[1],
      ],
      facingRadians: request.facingRadians ?? 0,
      camera: {
        pitchRadians: cameraPitchRadians,
        distance: cameraDistance,
      },
    },
    atmosphere,
    diagnostics,
  };
}
