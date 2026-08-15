import type { AppearanceBinding, ResourceId, TransformSpec, Vec2Tuple } from "@whitebox-world/contracts";

import { defineWorldFeature } from "./features";
import type { CompoundLandmarkSpec } from "./landmarks";
import type { SerializedShape2D } from "./shapes";
import type { WaterSurfaceStyle } from "./surfaces";

export type TerrainRelief = "flat" | "plain" | "hills" | "mountains";

export interface TerrainNoisePreset {
  amplitude: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  recommendedAmplitude: readonly [minimum: number, maximum: number];
}

/**
 * Playability-oriented starting points. Landforms such as valleys and ridges
 * should be layered explicitly instead of increasing global noise arbitrarily.
 */
export const TERRAIN_RELIEF_PRESETS: Readonly<Record<TerrainRelief, TerrainNoisePreset>> =
  Object.freeze({
    flat: {
      amplitude: 0,
      frequency: 0.002,
      octaves: 1,
      lacunarity: 2,
      persistence: 0.3,
      recommendedAmplitude: [0, 0.25],
    },
    plain: {
      amplitude: 2.5,
      frequency: 0.006,
      octaves: 3,
      lacunarity: 2,
      persistence: 0.35,
      recommendedAmplitude: [0.5, 5],
    },
    hills: {
      amplitude: 8,
      frequency: 0.0065,
      octaves: 4,
      lacunarity: 2,
      persistence: 0.42,
      recommendedAmplitude: [4, 14],
    },
    mountains: {
      amplitude: 24,
      frequency: 0.0035,
      octaves: 4,
      lacunarity: 2,
      persistence: 0.45,
      recommendedAmplitude: [12, 45],
    },
  });

export function terrainNoiseForRelief(
  relief: TerrainRelief,
  overrides: Partial<Pick<TerrainNoisePreset, "amplitude" | "frequency" | "octaves" | "lacunarity" | "persistence">> = {},
): Omit<TerrainNoisePreset, "recommendedAmplitude"> {
  const preset = TERRAIN_RELIEF_PRESETS[relief];
  return {
    amplitude: overrides.amplitude ?? preset.amplitude,
    frequency: overrides.frequency ?? preset.frequency,
    octaves: overrides.octaves ?? preset.octaves,
    lacunarity: overrides.lacunarity ?? preset.lacunarity,
    persistence: overrides.persistence ?? preset.persistence,
  };
}

export interface RollingTerrainParams {
  size: Vec2Tuple;
  segments: Vec2Tuple;
  relief?: TerrainRelief;
  baseHeight?: number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  semantic?: string;
  appearancePrompt?: string;
}

export interface RollingTerrainOutput {
  terrainId: ResourceId;
  noisePatchId: ResourceId;
  semanticId: ResourceId;
}

export const RollingTerrainFeature = defineWorldFeature<RollingTerrainParams, RollingTerrainOutput>({
  type: "official.rolling-terrain",
  version: 1,
  source: "@whitebox-world/world/official-features#RollingTerrainFeature",
  schema: {
    size: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => entry > 0) ? undefined : "both dimensions must be positive",
    },
    segments: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => Number.isInteger(entry) && entry > 0)
          ? undefined
          : "both segment counts must be positive integers",
    },
    relief: { type: "string", default: "plain", values: ["flat", "plain", "hills", "mountains"] },
    baseHeight: { type: "number", default: 0 },
    amplitude: { type: "number", optional: true, minimum: 0 },
    frequency: { type: "positiveNumber", optional: true },
    octaves: { type: "integer", optional: true, minimum: 1, maximum: 8 },
    lacunarity: { type: "positiveNumber", optional: true },
    persistence: { type: "positiveNumber", optional: true, maximum: 1 },
    semantic: { type: "string", default: "rolling_terrain" },
    appearancePrompt: { type: "string", optional: true },
  },
  budget: {
    maxVertices: 300_000,
    maxTriangles: 600_000,
    maxColliders: 1,
  },
  build(context, params) {
    const relief = params.relief ?? "plain";
    const noise = terrainNoiseForRelief(relief, params);
    const terrainId = context.terrain.create({
      width: params.size[0],
      depth: params.size[1],
      xSegments: params.segments[0],
      zSegments: params.segments[1],
      baseHeight: params.baseHeight ?? 0,
    });
    const noisePatchId = context.terrain.noise(terrainId, {
      ...noise,
    });
    const [minimumAmplitude, maximumAmplitude] =
      TERRAIN_RELIEF_PRESETS[relief].recommendedAmplitude;
    if (noise.amplitude < minimumAmplitude || noise.amplitude > maximumAmplitude) {
      context.diagnostics.add({
        severity: "warning",
        code: "TERRAIN_RELIEF_AMPLITUDE_OVERRIDE",
        message: `${relief} terrain uses ${noise.amplitude}m amplitude; the playable starting range is ${minimumAmplitude}-${maximumAmplitude}m.`,
        suggestions: ["Use explicit raise/lower/flatten operations for major landforms instead of global roughness."],
      });
    }
    const appearance: AppearanceBinding = { semantic: params.semantic ?? "rolling_terrain" };
    if (params.appearancePrompt !== undefined) appearance.prompt = params.appearancePrompt;
    const semanticId = context.semantic.bind(terrainId, appearance);
    return { terrainId, noisePatchId, semanticId };
  },
});

export interface TiledRollingTerrainParams {
  tileSize: Vec2Tuple;
  tiles: Vec2Tuple;
  segmentsPerTile: Vec2Tuple;
  origin?: Vec2Tuple;
  baseHeight?: number;
  relief?: TerrainRelief;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  semantic?: string;
  appearancePrompt?: string;
}

export const TiledRollingTerrainFeature = defineWorldFeature<
  TiledRollingTerrainParams,
  RollingTerrainOutput
>({
  type: "official.tiled-rolling-terrain",
  version: 1,
  source: "@whitebox-world/world/official-features#TiledRollingTerrainFeature",
  schema: {
    tileSize: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => entry > 0)
          ? undefined
          : "both tile dimensions must be positive",
    },
    tiles: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => Number.isInteger(entry) && entry > 0)
          ? undefined
          : "tile counts must be positive integers",
    },
    segmentsPerTile: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => Number.isInteger(entry) && entry > 0)
          ? undefined
          : "segment counts must be positive integers",
    },
    relief: { type: "string", default: "plain", values: ["flat", "plain", "hills", "mountains"] },
    origin: { type: "vec2", default: [0, 0] },
    baseHeight: { type: "number", default: 0 },
    amplitude: { type: "number", optional: true, minimum: 0 },
    frequency: { type: "positiveNumber", optional: true },
    octaves: { type: "integer", optional: true, minimum: 1, maximum: 8 },
    lacunarity: { type: "positiveNumber", optional: true },
    persistence: { type: "positiveNumber", optional: true, maximum: 1 },
    semantic: { type: "string", default: "rolling_terrain" },
    appearancePrompt: { type: "string", optional: true },
  },
  budget: {
    maxVertices: 350_000,
    maxTriangles: 700_000,
    maxColliders: 64,
  },
  build(context, params) {
    const relief = params.relief ?? "plain";
    const noise = terrainNoiseForRelief(relief, params);
    const terrainId = context.terrain.createGrid({
      tileSize: params.tileSize,
      tiles: params.tiles,
      segmentsPerTile: params.segmentsPerTile,
      origin: params.origin ?? [0, 0],
      baseHeight: params.baseHeight ?? 0,
    });
    const noisePatchId = context.terrain.noise(terrainId, {
      ...noise,
    });
    const [minimumAmplitude, maximumAmplitude] =
      TERRAIN_RELIEF_PRESETS[relief].recommendedAmplitude;
    if (noise.amplitude < minimumAmplitude || noise.amplitude > maximumAmplitude) {
      context.diagnostics.add({
        severity: "warning",
        code: "TERRAIN_RELIEF_AMPLITUDE_OVERRIDE",
        message: `${relief} terrain uses ${noise.amplitude}m amplitude; the playable starting range is ${minimumAmplitude}-${maximumAmplitude}m.`,
        suggestions: ["Use explicit raise/lower/flatten operations for major landforms instead of global roughness."],
      });
    }
    const appearance: AppearanceBinding = {
      semantic: params.semantic ?? "rolling_terrain",
    };
    if (params.appearancePrompt !== undefined) appearance.prompt = params.appearancePrompt;
    const semanticId = context.semantic.bind(terrainId, appearance);
    return { terrainId, noisePatchId, semanticId };
  },
});

export interface LakeParams {
  terrainId: ResourceId;
  center: Vec2Tuple;
  radius: Vec2Tuple;
  depth: number;
  shoreWidth?: number;
  waterLevel?: number;
  traversal?: "blocked" | "swimmable" | "walkable";
  semantic?: string;
  appearancePrompt?: string;
  surfaceStyle?: WaterSurfaceStyle;
}

export interface LakeOutput {
  basinPatchId: ResourceId;
  waterSurfaceId: ResourceId;
  semanticId: ResourceId;
}

export const LakeFeature = defineWorldFeature<LakeParams, LakeOutput>({
  type: "official.lake",
  version: 1,
  source: "@whitebox-world/world/official-features#LakeFeature",
  schema: {
    terrainId: "string",
    center: "vec2",
    radius: {
      type: "vec2",
      validate: (value) =>
        (value as readonly number[]).every((entry) => entry > 0) ? undefined : "both radii must be positive",
    },
    depth: "positiveNumber",
    shoreWidth: { type: "number", default: 12, minimum: 0 },
    waterLevel: { type: "number", optional: true },
    traversal: { type: "string", default: "blocked", values: ["blocked", "swimmable", "walkable"] },
    semantic: { type: "string", default: "lake_water" },
    appearancePrompt: { type: "string", optional: true },
    surfaceStyle: { type: "object", optional: true },
  },
  build(context, params) {
    const area = context.shape.ellipse(params.center, params.radius);
    const centerHeight = context.terrain.sample(params.terrainId, params.center);
    if (centerHeight === undefined) throw new Error("Lake center is outside its target terrain.");
    const waterLevel = params.waterLevel ?? centerHeight - Math.min(params.depth * 0.2, 1.5);
    const basinPatchId = context.terrain.basin(params.terrainId, {
      area,
      waterLevel,
      minimumDepth: params.depth,
      shoreWidth: params.shoreWidth ?? 12,
      curve: "smoother",
    });
    const appearance: AppearanceBinding = { semantic: params.semantic ?? "lake_water" };
    if (params.appearancePrompt !== undefined) appearance.prompt = params.appearancePrompt;
    const waterSurfaceId = context.surface.water({
      area,
      elevation: waterLevel,
      minimumDepth: params.depth,
      shoreWidth: params.shoreWidth ?? 12,
      traversal: params.traversal ?? "blocked",
      appearance,
      ...(params.surfaceStyle === undefined ? {} : { style: params.surfaceStyle }),
    });
    const semanticId = context.semantic.bind(waterSurfaceId, appearance);
    return { basinPatchId, waterSurfaceId, semanticId };
  },
});

export interface WaterBodyParams {
  terrainId: ResourceId;
  boundary: SerializedShape2D;
  depth: number;
  shoreWidth?: number;
  waterLevel?: number;
  traversal?: "blocked" | "swimmable" | "walkable";
  semantic?: string;
  appearancePrompt?: string;
  surfaceStyle?: WaterSurfaceStyle;
}

export const WaterBodyFeature = defineWorldFeature<WaterBodyParams, LakeOutput>({
  type: "official.water-body",
  version: 1,
  source: "@whitebox-world/world/official-features#WaterBodyFeature",
  schema: {
    terrainId: "string",
    boundary: { type: "object" },
    depth: "positiveNumber",
    shoreWidth: { type: "number", default: 12, minimum: 0 },
    waterLevel: { type: "number", optional: true },
    traversal: {
      type: "string",
      default: "blocked",
      values: ["blocked", "swimmable", "walkable"],
    },
    semantic: { type: "string", default: "water_body" },
    appearancePrompt: { type: "string", optional: true },
    surfaceStyle: { type: "object", optional: true },
  },
  build(context, params) {
    const area = context.shape.fromJSON(params.boundary);
    const samplePoint: Vec2Tuple =
      params.boundary.kind === "polygon"
        ? [
            params.boundary.points.reduce((total, point) => total + point[0], 0) /
              params.boundary.points.length,
            params.boundary.points.reduce((total, point) => total + point[1], 0) /
              params.boundary.points.length,
          ]
        : params.boundary.center;
    const centerHeight = context.terrain.sample(params.terrainId, samplePoint);
    if (centerHeight === undefined) {
      throw new Error("Water body sample point is outside its target terrain.");
    }
    const waterLevel = params.waterLevel ?? centerHeight - Math.min(params.depth * 0.2, 1.5);
    const basinPatchId = context.terrain.basin(params.terrainId, {
      area,
      waterLevel,
      minimumDepth: params.depth,
      shoreWidth: params.shoreWidth ?? 12,
      curve: "smoother",
    });
    const appearance: AppearanceBinding = {
      semantic: params.semantic ?? "water_body",
    };
    if (params.appearancePrompt !== undefined) appearance.prompt = params.appearancePrompt;
    const waterSurfaceId = context.surface.water({
      area,
      elevation: waterLevel,
      minimumDepth: params.depth,
      shoreWidth: params.shoreWidth ?? 12,
      traversal: params.traversal ?? "blocked",
      appearance,
      ...(params.surfaceStyle === undefined ? {} : { style: params.surfaceStyle }),
    });
    const semanticId = context.semantic.bind(waterSurfaceId, appearance);
    return { basinPatchId, waterSurfaceId, semanticId };
  },
});

export interface CompoundLandmarkParams {
  children: CompoundLandmarkSpec["children"];
  transform?: TransformSpec;
  collision?: boolean;
  semantic?: string;
  appearancePrompt?: string;
}

export interface CompoundLandmarkOutput {
  landmarkId: ResourceId;
  semanticId: ResourceId;
}

export const CompoundLandmarkFeature = defineWorldFeature<CompoundLandmarkParams, CompoundLandmarkOutput>({
  type: "official.compound-landmark",
  version: 1,
  source: "@whitebox-world/world/official-features#CompoundLandmarkFeature",
  schema: {
    children: {
      type: "array",
      validate: (value) => ((value as readonly unknown[]).length > 0 ? undefined : "at least one child is required"),
    },
    transform: { type: "object", optional: true },
    collision: { type: "boolean", default: true },
    semantic: { type: "string", default: "landmark" },
    appearancePrompt: { type: "string", optional: true },
  },
  build(context, params) {
    const appearance: AppearanceBinding = { semantic: params.semantic ?? "landmark" };
    if (params.appearancePrompt !== undefined) appearance.prompt = params.appearancePrompt;
    const spec: CompoundLandmarkSpec = {
      children: params.children,
      collision: params.collision ?? true,
      appearance,
    };
    if (params.transform !== undefined) spec.transform = params.transform;
    const landmarkId = context.landmark.compound(spec);
    const semanticId = context.semantic.bind(landmarkId, appearance);
    return { landmarkId, semanticId };
  },
});
